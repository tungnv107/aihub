"""Inspect Git's publication set; report locations only, never matched secret values."""
import ast,hashlib,json,pathlib,re,subprocess
ROOT=pathlib.Path(__file__).resolve().parent.parent
names=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=ROOT).decode().split('\0')
names=sorted(set(n for n in names if n))
patterns={
 'private_key':re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
 'github_token':re.compile(rb'\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b'),
 'api_token':re.compile(rb'\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b'),
 'activation_key':re.compile(rb'\bTDH-[A-Za-z0-9_-]{32}\b'),
 'jwt_literal':re.compile(rb'\beyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b'),
}
issues=[];total=0
for name in names:
    file=ROOT/name
    if not file.is_file():continue
    data=file.read_bytes();total+=len(data)
    if file.suffix.lower() in {'.pem','.key','.pfx','.p12','.dpapi','.sqlite','.db','.zip','.gz','.tar'} or file.name in {'.env','auth.json','secrets.env'} or 'node_modules' in file.parts:
        issues.append({'file':name,'issue':'forbidden_file'})
    for kind,pattern in patterns.items():
        for match in pattern.finditer(data):
            issues.append({'file':name,'line':data[:match.start()].count(b'\n')+1,'issue':kind})
    if file.suffix=='.py':ast.parse(data.decode('utf-8-sig'),filename=name)
    if file.suffix=='.md':
        for target in re.findall(r'\[[^\]]+\]\(([^)]+)\)',data.decode('utf-8-sig')):
            if re.match(r'^[a-z]+:',target) or target.startswith('#'):continue
            target=target.split('#')[0]
            if not (file.parent/target).exists():issues.append({'file':name,'issue':'broken_document_link','target':target})
engine=ROOT/'self_relay/policy-engine.generated.mjs'
if hashlib.sha256(engine.read_bytes()).hexdigest()!='e33bef7634f0d01b92eb9691d49f9eee140da6dea5c44cd89b1a93182013ec46':issues.append({'file':str(engine.relative_to(ROOT)),'issue':'policy_engine_hash_changed'})
staged_engine=subprocess.run(['git','show',':self_relay/policy-engine.generated.mjs'],cwd=ROOT,capture_output=True)
if staged_engine.returncode==0 and hashlib.sha256(staged_engine.stdout).hexdigest()!='e33bef7634f0d01b92eb9691d49f9eee140da6dea5c44cd89b1a93182013ec46':issues.append({'file':'self_relay/policy-engine.generated.mjs','issue':'staged_policy_engine_hash_changed'})
report={'result':'passed' if not issues else 'failed','files':len(names),'bytes':total,'issues':issues,
    'scope':'Allowlisted source, synthetic fixtures and selected reports; high-confidence secret patterns and local Markdown links'}
print(json.dumps(report,indent=2))
raise SystemExit(bool(issues))
