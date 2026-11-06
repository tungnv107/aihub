"""Read-only, redacted inspection for the sub2api-test request-size incident."""
import json,pathlib,sqlite3,subprocess
NAMES=['independent-relay-test-relay-ui-1','independent-relay-test-self-relay-1','sub2api']
SAFE={'SERVER_MAX_REQUEST_BODY_SIZE','GATEWAY_MAX_BODY_SIZE','GATEWAY_TEXT_MAX_BODY_SIZE','SERVER_H2C_MAX_UPLOAD_BUFFER_PER_STREAM','SERVER_H2C_MAX_UPLOAD_BUFFER_PER_CONNECTION'}
def run(args):return subprocess.check_output(args,text=True,stderr=subprocess.DEVNULL,timeout=30)
report={}
for name in NAMES:
    item=json.loads(run(['docker','inspect',name]))[0]
    env=dict(value.split('=',1) for value in item['Config']['Env'] if '=' in value)
    labels=item['Config'].get('Labels') or {}
    report[name]={'image':item['Config']['Image'],'started':item['State']['StartedAt'],'health':item['State'].get('Health',{}).get('Status'),
                  'body_environment':{k:v for k,v in env.items() if k in SAFE},'mounts':[{k:m[k] for k in ['Source','Destination']} for m in item['Mounts']],
                  'compose_directory':labels.get('com.docker.compose.project.working_dir'),'compose_files':labels.get('com.docker.compose.project.config_files')}
root=pathlib.Path('/opt/independent-relay-test')
report['relay_data_files']=[p.name for p in (root/'relay-data').iterdir() if p.is_file()]
compose=json.loads(run(['docker','compose','-f',str(root/'compose.yaml'),'config','--format','json']))
report['compose_services']={name:{'image':service.get('image'),'memory_limit':service.get('mem_limit'),
    'depends_on':list(service.get('depends_on',{}))} for name,service in compose['services'].items()}
report['environment_names']=[line.split('=',1)[0] for line in (root/'.env').read_text().splitlines() if '=' in line and not line.startswith('#')]
report['body_config_lines']=[]
for p in [root/'compose.yaml']:
    for i,line in enumerate(p.read_text().splitlines(),1):
        if any(key in line for key in SAFE) or any(key in line for key in ['max_body_size:', 'max_request_body_size:', 'text_max_body_size:']):
            report['body_config_lines'].append({'file':p.name,'line':i,'setting':line.strip()})
report['relay_limits']=[]
for p in (root/'relay-data').glob('*.sqlite'):
    db=sqlite3.connect('file:'+str(p)+'?mode=ro',uri=True)
    try:
        rows=db.execute("SELECT key,value FROM settings WHERE key='relay.max_body_bytes'").fetchall()
        report['relay_limits'].append({'database':str(p),'settings':rows})
    finally:db.close()
logs=run(['docker','logs','--since','2h','--tail','5000','independent-relay-test-relay-ui-1'])
request_id='59053149-b850-4754-b126-9267ff9802e9'
matched=[line for line in logs.splitlines() if request_id in line]
report['incident']={'request_id':request_id,'matched_log_lines':len(matched),'mentions_413':any('413' in line for line in matched),'mentions_body_limit':any('body too large' in line.lower() for line in matched)}
print(json.dumps(report,indent=2))
