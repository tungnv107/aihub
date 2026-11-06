"""Deploy the stream-wrapper fix only to the independent test relay.

The two code files are hash-pinned. Rollback restores code, never the live
database or OAuth credentials. Reports contain metadata only.
"""
import argparse
import datetime
import hashlib
import json
import os
import pathlib
import re
import shutil
import sqlite3
import subprocess
import time
import urllib.request

ROOT=pathlib.Path('/opt/independent-relay-test')
STAGE=ROOT/'test/reconnect-20261030'
OWN='independent-relay-test-self-relay-1'
PEERS=('independent-relay-test-relay-ui-1','independent-relay-test-postgres-1',
       'independent-relay-test-redis-1','sub2api','docker-caddy-1',
       'tdh-relay-admin','tdh-relay-license','tdh-relay-distribution')
BASELINE={'core.mjs':'18ae547f1a0de85392978ad141107414049675a9498afcabb1fcd83d3f29625f',
          'policy-runtime.mjs':'61e188a30fb438e0dac64d01dbbe6dc429d9c4f3c50df2c6cd6e43a3e4c28527'}
PATCH={'core.mjs':'b83ec17480066c17298d7323502c6b158d7774954b7549db686d75f5bf4a42f4',
       'policy-runtime.mjs':'d46b44b96281e3383c43a9e53fa9da98b740a93eaa7ddf4ac9ad228c9b6ca294'}
ENGINE='e33bef7634f0d01b92eb9691d49f9eee140da6dea5c44cd89b1a93182013ec46'

def require(value,code):
    if not value:raise RuntimeError(code)

def run(args,timeout=30):
    p=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
    require(p.returncode==0,'command_failed_'+args[0]);return p.stdout

def inspect(name):return json.loads(run(['docker','inspect',name]))[0]

def snapshot(name):
    row=inspect(name)
    return {'id':row['Id'],'image':row['Image'],'started_at':row['State']['StartedAt']}

def digest(file):return hashlib.sha256(file.read_bytes()).hexdigest()

def hashes(directory,expected):
    for name,wanted in expected.items():
        file=directory/name
        require(file.is_file() and not file.is_symlink(),'invalid_source_file')
        require(digest(file)==wanted,'source_hash_mismatch_'+name.replace('.','_'))

def env():
    values=dict(line.split('=',1) for line in (ROOT/'.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
    live=dict(line.split('=',1) for line in inspect(OWN)['Config']['Env'] if '=' in line)
    return {**values,**{key:live[key] for key in ('RELAY_ADMIN_KEY','RELAY_API_KEY')}}

def get(route,key=None):
    request=urllib.request.Request('http://127.0.0.1:18320'+route,headers={'Authorization':'Bearer '+key} if key else {})
    with urllib.request.urlopen(request,timeout=5) as response:return json.load(response)

def configuration():
    settings=get('/admin/settings',env()['RELAY_ADMIN_KEY'])['settings']
    return {'idle_ms':settings['relay.stream_idle_ms'],'body_bytes':settings['relay.max_body_bytes'],
            'policy':get('/admin/policies',env()['RELAY_ADMIN_KEY'])}

def healthy():
    for _ in range(40):
        try:
            if get('/healthz').get('ok'):return True
        except Exception:pass
        time.sleep(1)
    return False

def stop():
    run(['docker','stop','--time','180',OWN],timeout=190)
    state=inspect(OWN)['State']
    require(not state['Running'],'relay_still_running')
    require(state['ExitCode']!=137,'relay_did_not_drain')

def start():
    require(not inspect(OWN)['State']['Running'],'relay_not_stopped')
    lock=ROOT/'relay-data/relay.sqlite.lock'
    require(not lock.is_symlink(),'unexpected_lock_symlink')
    if lock.exists():lock.unlink()
    run(['docker','start',OWN]);require(healthy(),'relay_health_failed')

def apply():
    hashes(ROOT/'self_relay',BASELINE);hashes(STAGE/'self_relay',PATCH)
    require(digest(ROOT/'self_relay/policy-engine.generated.mjs')==ENGINE,'engine_changed')
    before={name:snapshot(name) for name in PEERS};config=configuration()
    require(config['idle_ms']==120000 and config['body_bytes']==67108864,'unexpected_runtime_limits')
    backup=ROOT/'backups'/('reconnect-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    backup.mkdir(parents=True,mode=0o700)
    for name in PATCH:shutil.copy2(ROOT/'self_relay'/name,backup/name)
    report={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'backup':str(backup),'scope':'test_relay_only'}
    modified=False
    try:
        print(json.dumps({'phase':'draining_test_relay'}),flush=True);stop()
        hashes(ROOT/'self_relay',BASELINE)
        modified=True
        for name in PATCH:
            target=ROOT/'self_relay'/name
            shutil.copyfile(STAGE/'self_relay'/name,target);target.chmod(0o644)
        start();hashes(ROOT/'self_relay',PATCH)
        require(configuration()==config,'runtime_configuration_changed')
        require({name:snapshot(name) for name in PEERS}==before,'peer_changed')
        report.update(result='deployed',healthy=True,peers_unchanged=True,configuration_unchanged=True,source_hashes=PATCH)
    except Exception:
        if modified:
            if inspect(OWN)['State']['Running']:stop()
            for name in PATCH:shutil.copy2(backup/name,ROOT/'self_relay'/name)
        if not inspect(OWN)['State']['Running']:start()
        report.update(result='rolled_back',database_restored=False)
        raise
    finally:
        (backup/'result.json').write_text(json.dumps(report,indent=2))
        print(json.dumps(report,indent=2),flush=True)

def stream_probe(label,base,key,payload):
    headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'}
    request=urllib.request.Request(base+'/v1/responses',headers=headers,data=json.dumps(payload).encode())
    started=time.monotonic();first=None;events=[];comments=0
    with urllib.request.urlopen(request,timeout=60) as response:
        require(response.status==200,'probe_http_status')
        require('text/event-stream' in response.headers.get('content-type',''),'probe_not_sse')
        for raw in response:
            first=first if first is not None else time.monotonic()-started
            require(time.monotonic()-started<180,'probe_deadline')
            if raw.startswith(b':'):comments+=1
            if not raw.startswith(b'data:'):continue
            data=raw[5:].strip()
            if data==b'[DONE]':continue
            event=json.loads(data);events.append(event)
            if event.get('type') in ('response.completed','response.incomplete','response.failed','error'):break
    terminal=[e for e in events if e.get('type')=='response.completed']
    require(len(terminal)==1,'probe_missing_completed')
    result=terminal[0]['response']
    require(result.get('status')=='completed','probe_not_completed')
    report={'target':label,'status':200,'terminal':'response.completed','duration_ms':round((time.monotonic()-started)*1000),
            'first_byte_ms':round(first*1000),'event_count':len(events),'comments':comments,
            'usage_present':result.get('usage') is not None}
    return result,report

def verify():
    hashes(ROOT/'self_relay',PATCH);credentials=env();reports=[]
    request={'model':'gpt-6-astra','stream':True,'text':{'format':{'type':'json_object'}},
             'instructions':'Return exactly a JSON object with ok equal to true.',
             'input':[{'role':'user','content':'Connectivity verification. Return the requested JSON.'}]}
    for label,base,key in [('private_relay','http://127.0.0.1:18320',credentials['RELAY_API_KEY']),
                           ('public_gateway','https://sub2api-test.tudonghoa.me',credentials['TEST_API_KEY'])]:
        result,report=stream_probe(label,base,key,request)
        text=''.join(part.get('text','') for item in result.get('output',[]) for part in item.get('content',[]) if part.get('type')=='output_text')
        require(json.loads(text).get('ok') is True,'probe_answer_mismatch');reports.append(report)
        print(json.dumps(report),flush=True)
    report={'result':'passed','at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'probes':reports,'source_hashes':PATCH}
    (ROOT/'reconnect-verification.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report,indent=2),flush=True)

def status():
    hashes(ROOT/'self_relay',PATCH)
    started=inspect(OWN)['State']['StartedAt']
    start_ms=int(datetime.datetime.fromisoformat(started.replace('Z','+00:00')).timestamp()*1000)
    with sqlite3.connect('file:'+str(ROOT/'relay-data/relay.sqlite')+'?mode=ro',uri=True) as db:
        db.row_factory=sqlite3.Row
        rows=[dict(row) for row in db.execute('SELECT status,outcome,COUNT(*) n,MAX(duration_ms) max_ms FROM usage WHERE ts>=? GROUP BY status,outcome',(start_ms,))]
    output=run(['docker','logs','--since',started,OWN])
    counters={'buffered_reads':0,'control_reads':0,'empty_reads':0};observed=0
    for line in output.splitlines():
        try:entry=json.loads(line)
        except ValueError:continue
        if entry.get('event')!='relay_policy_stream_progress':continue
        observed+=1
        for key in counters:
            value=entry.get(key,0)
            if isinstance(value,int) and value>=0:counters[key]+=value
    print(json.dumps({'started_at':started,'usage_since_restart':rows,'progress_records':observed,'stream_counters':counters,'healthy':get('/healthz').get('ok')},indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('mode',choices=['apply','verify','status']);args=parser.parse_args()
    try:
        require(os.name=='posix' and os.geteuid()==0,'root_vps_required')
        {'apply':apply,'verify':verify,'status':status}[args.mode]()
    except Exception as error:
        code=str(error) if isinstance(error,RuntimeError) and re.fullmatch(r'[a-zA-Z0-9_]+',str(error)) else type(error).__name__
        print(json.dumps({'result':'failed','error':code}),flush=True);raise SystemExit(1)
