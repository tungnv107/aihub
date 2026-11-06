"""Read-only stream incident inspection; output metadata, never prompts or tokens."""
import datetime,json,pathlib,sqlite3,subprocess,time

def run(args):
    p=subprocess.run(args,capture_output=True,text=True,timeout=45)
    if p.returncode:raise RuntimeError('inspection_command_failed')
    return p.stdout.strip()

def inspect(name):return json.loads(run(['docker','inspect',name]))[0]

def query(container,sql):
    env=dict(x.split('=',1) for x in inspect(container)['Config']['Env'] if '=' in x)
    user=env.get('POSTGRES_USER','postgres');database=env.get('POSTGRES_DB',user)
    value=run(['docker','exec',container,'psql','-X','-q','-U',user,'-d',database,'-At','-v','ON_ERROR_STOP=1',
               '-c',"BEGIN READ ONLY; SET LOCAL statement_timeout='20s'; "+sql+'; ROLLBACK;'])
    return json.loads(value)

report={'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'read_only':True,'window_hours':3}
report['containers']={}
for name in ['sub2api','independent-relay-test-relay-ui-1','independent-relay-test-self-relay-1','docker-caddy-1']:
    row=inspect(name);env=dict(x.split('=',1) for x in row['Config']['Env'] if '=' in x)
    safe={k:v for k,v in env.items() if any(word in k for word in ['TIMEOUT','KEEPALIVE','KEEP_ALIVE','PING_INTERVAL']) and v.replace('.','').isdigit()}
    report['containers'][name]={'started_at':row['State']['StartedAt'],'restarts':row['RestartCount'],
      'health':row['State'].get('Health',{}).get('Status'),'timing_environment':safe}

for label,container in [('main','sub2api-postgres'),('test','independent-relay-test-postgres-1')]:
    columns=query(container,"SELECT coalesce(json_agg(t),'[]'::json) FROM (SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('ops_error_logs','usage_logs') ORDER BY table_name,ordinal_position)t")
    report[label]={'schema':columns}
    classification="""CASE
      WHEN error_message ILIKE '%stream%incomplete%' OR error_message ILIKE '%stream%disconnect%' THEN 'incomplete_stream'
      WHEN error_message ILIKE '%idle%' THEN 'idle_timeout'
      WHEN error_message ILIKE '%timeout%' OR error_message ILIKE '%timed out%' OR error_message ILIKE '%deadline%' THEN 'timeout'
      WHEN error_message ILIKE '%cancel%' THEN 'cancelled'
      WHEN error_message ILIKE '%reset%' OR error_message ILIKE '%broken pipe%' THEN 'connection_reset'
      WHEN error_message ILIKE '%EOF%' THEN 'eof'
      WHEN error_message ILIKE '%websocket%' THEN 'websocket'
      WHEN error_message ILIKE '%429%' OR error_message ILIKE '%rate limit%' THEN 'rate_limit'
      WHEN error_message ILIKE '%too large%' THEN 'body_limit'
      WHEN error_message ILIKE '%tool%' THEN 'tool_protocol'
      ELSE 'other' END"""
    report[label]['error_groups']=query(container,"SELECT coalesce(json_agg(t),'[]'::json) FROM (SELECT status_code,error_phase,error_type,stream,"+classification+" AS category,COUNT(*) n,MIN(created_at) first_at,MAX(created_at) last_at FROM ops_error_logs WHERE created_at>now()-interval '3 hours' GROUP BY 1,2,3,4,5 ORDER BY n DESC LIMIT 25)t")
    report[label]['recent_stream_errors']=query(container,"SELECT coalesce(json_agg(t),'[]'::json) FROM (SELECT id,created_at,request_id,model,request_path,stream,error_phase,error_type,status_code,upstream_status_code,provider_error_code,provider_error_type,"+classification+" AS category FROM ops_error_logs WHERE created_at>now()-interval '3 hours' AND (stream=true OR status_code>=500 OR status_code=499) ORDER BY id DESC LIMIT 35)t")

root=pathlib.Path('/opt/independent-relay-test')
db=sqlite3.connect('file:'+str(root/'relay-data/relay.sqlite')+'?mode=ro',uri=True);db.row_factory=sqlite3.Row
start=int((time.time()-3*3600)*1000)
report['relay']={'usage_groups':[dict(r) for r in db.execute('SELECT status,outcome,COUNT(*) n,ROUND(AVG(duration_ms)) avg_ms,MAX(duration_ms) max_ms,MIN(ts) first_ts,MAX(ts) last_ts FROM usage WHERE ts>? GROUP BY status,outcome ORDER BY n DESC',(start,))],
                 'recent_errors':[dict(r) for r in db.execute('SELECT id,ts,status,outcome,duration_ms,upstream_attempts,model FROM usage WHERE ts>? AND status<>200 ORDER BY id DESC LIMIT 35',(start,))],
                 'settings':{k:json.loads(v) for k,v in db.execute("SELECT key,value FROM settings WHERE key IN ('relay.stream_idle_ms','relay.max_attempts','relay.max_concurrency','relay.max_body_bytes')")}}
db.close()
report['licensed_service']=dict(line.split('=',1) for line in run(['systemctl','show','ch-relay.service','--property=ActiveState,SubState,NRestarts,ExecMainStartTimestamp']).splitlines() if '=' in line)
print(json.dumps(report,indent=2))
