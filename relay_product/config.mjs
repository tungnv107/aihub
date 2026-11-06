import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const BEGIN='# BEGIN TDH Relay managed configuration';
const END='# END TDH Relay managed configuration';
const PREVIOUS='# TDH Relay saved root line: ';
const ROOT_KEYS=new Set(['openai_base_url','model_provider','model_catalog_json']);
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');

function rootKey(line){
  const m=/^\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+))\s*=/.exec(line);
  return m?.[1]??m?.[2]??m?.[3];
}
function splitRoot(text){
  const lines=text.split('\n');let end=lines.length;
  for(let i=0;i<lines.length;i++){
    const line=lines[i].trim();
    if(line.startsWith('#'))continue;
    if(line.startsWith('[')){end=i;break;}
    // Cấu hình root nhiều dòng cần được người dùng kiểm tra; không sửa bằng suy đoán.
    if(line.includes('"""')||line.includes("'''"))throw Error('multiline_root_config_requires_manual_setup');
  }
  return {lines,end};
}
function layout(text){
  const bom=text.startsWith('\uFEFF')?'\uFEFF':'',crlf=text.includes('\r\n');
  const {lines,end}=splitRoot(text.slice(bom.length).replace(/\r\n/g,'\n'));
  const fields=new Map();
  for(let i=0;i<end;i++){
    const key=rootKey(lines[i]);
    if(!ROOT_KEYS.has(key)&&key!=='profile')continue;
    if(fields.has(key))throw Error('duplicate_provider_settings_review_required');
    const value=lines[i].slice(lines[i].indexOf('=')+1).trim();
    const match=/^(?:"([^"\\]*)"|'([^']*)')\s*(?:#.*)?$/.exec(value);
    fields.set(key,{line:i,value:match?.[1]??match?.[2]});
  }
  return {bom,crlf,lines,end,fields,join:lines=>bom+(crlf?lines.join('\n').replace(/\n/g,'\r\n'):lines.join('\n'))};
}
function directRouting(text){
  const {fields}=layout(text);
  return !fields.has('profile')&&!fields.has('openai_base_url')&&!fields.has('model_catalog_json')&&
    (!fields.has('model_provider')||fields.get('model_provider').value==='openai');
}
function directConfiguration(text,previous){
  if(!directRouting(text))return null;
  if(![BEGIN,END,PREVIOUS].some(marker=>text.includes(marker)))return text;
  const {lines,end,join}=layout(text),source=layout(verifiedOriginal(previous));
  const saved=source.lines.slice(0,source.end).filter(line=>ROOT_KEYS.has(rootKey(line)));
  const begin=lines.filter(line=>line.trim()===BEGIN).length,finish=lines.filter(line=>line.trim()===END).length;
  if(begin!==finish||begin>1)throw Error('managed_configuration_changed_review_required');
  const filtered=lines.filter((line,i)=>{
    const stripped=line.trimStart();
    if(![BEGIN,END].includes(line.trim())&&!stripped.startsWith(PREVIOUS))return true;
    if(i>=end)throw Error('managed_configuration_changed_review_required');
    if(stripped.startsWith(PREVIOUS)&&!saved.some(value=>PREVIOUS+Buffer.from(value).toString('base64')===stripped))
      throw Error('saved_root_line_corrupt');
    return false;
  });
  // Reset có thể để lại comment của relay; chỉ bỏ metadata, không phục hồi provider cũ.
  return join(filtered);
}
function verifiedOriginal(previous){
  try{
    if(fs.lstatSync(previous.backup).isSymbolicLink())throw Error();
    const original=fs.readFileSync(previous.backup,'utf8');
    if(digest(original)!==previous.original_hash)throw Error();
    return original;
  }catch{throw Error('config_backup_missing_or_changed_review_required');}
}
export function managedConfig(original,baseUrl){
  if(original.includes(BEGIN)||original.includes(END)||original.includes(PREVIOUS))throw Error('managed_configuration_already_present');
  const bom=original.startsWith('\uFEFF')?'\uFEFF':'',crlf=original.includes('\r\n');
  const {lines,end}=splitRoot(original.slice(bom.length).replace(/\r\n/g,'\n'));
  const root=lines.slice(0,end).map(line=>ROOT_KEYS.has(rootKey(line))?PREVIOUS+Buffer.from(line).toString('base64'):line);
  const block=[BEGIN,'openai_base_url = '+JSON.stringify(baseUrl),'model_provider = "openai"',END].join('\n');
  let result=[block,...root,...lines.slice(end)].join('\n');
  if(crlf)result=result.replace(/\n/g,'\r\n');
  return bom+result;
}
export function restoreConfig(current,baseUrl,{original}={}){
  const {lines,end,fields,join}=layout(current);
  const begins=[],ends=[];
  lines.forEach((line,i)=>{if(line.trim()===BEGIN)begins.push(i);if(line.trim()===END)ends.push(i);});
  const marked=begins.length===1&&ends.length===1&&begins[0]<ends[0]&&ends[0]<end;
  const unmarked=begins.length===0&&ends.length===0&&original!==undefined;
  if(!marked&&!unmarked||fields.get('openai_base_url')?.value!==baseUrl||fields.get('model_provider')?.value!=='openai')
    throw Error('managed_configuration_changed_review_required');
  if(fields.has('model_catalog_json'))throw Error('new_provider_settings_review_required');
  const source=original===undefined?null:layout(original);
  const expected=source?.lines.slice(0,source.end).filter(line=>ROOT_KEYS.has(rootKey(line)))??null;
  const restored=new Set(),result=[];
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(begins.includes(i)||ends.includes(i)||i<end&&ROOT_KEYS.has(rootKey(line)))continue;
    if(!line.trimStart().startsWith(PREVIOUS)){result.push(line);continue;}
    if(i>=end)throw Error('saved_root_line_moved');
    const encoded=line.trimStart().slice(PREVIOUS.length);
    if(!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))throw Error('saved_root_line_corrupt');
    const decoded=Buffer.from(encoded,'base64').toString('utf8');
    const key=rootKey(decoded);
    if(!ROOT_KEYS.has(key)||/[\r\n]/.test(decoded)||restored.has(key)||expected&&!expected.includes(decoded))throw Error('saved_root_line_corrupt');
    restored.add(key);result.push(decoded);
  }
  // Nếu trình ghi TOML đã bỏ comment, lấy đúng root cũ từ backup đã kiểm tra hash.
  if(expected)result.unshift(...expected.filter(line=>!restored.has(rootKey(line))));
  return join(result);
}
function atomicWrite(file,content){
  const temporary=file+'.tdh-'+crypto.randomBytes(6).toString('hex');
  fs.writeFileSync(temporary,content,{mode:0o600,flag:'wx'});
  try{fs.renameSync(temporary,file);}catch(error){fs.unlinkSync(temporary);throw error;}
}
function backupConfig(state,original,label='codex-config'){
  const backupDir=path.join(state.home,'backups');fs.mkdirSync(backupDir,{recursive:true,mode:0o700});
  const backup=path.join(backupDir,label+'-'+Date.now()+'-'+crypto.randomBytes(4).toString('hex')+'.toml');
  fs.writeFileSync(backup,original,{mode:0o600,flag:'wx'});return backup;
}
export function syncCodex(state){
  const codexHome=state.get('codex_home');
  if(!codexHome)throw Error('codex_home_missing');
  fs.mkdirSync(codexHome,{recursive:true,mode:0o700});
  const file=path.join(codexHome,'config.toml');
  if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())throw Error('config_symlink_requires_manual_setup');
  const original=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
  const baseUrl='http://127.0.0.1:'+state.settings.get('relay.port')+'/v1';
  const previous=state.get('codex_sync');
  if(previous&&(path.resolve(previous.file)!==path.resolve(file)||previous.baseUrl!==baseUrl))throw Error('config_target_changed_review_required');
  if(layout(original).fields.has('profile'))throw Error('active_codex_profile_requires_manual_setup');
  const direct=previous?directConfiguration(original,previous):null;
  if(previous&&direct===null){
    const restored=restoreConfig(original,baseUrl,{original:verifiedOriginal(previous)});
    const next=managedConfig(restored,baseUrl);
    if(next===original)return {changed:false,file};
    const backup=backupConfig(state,original,'codex-config-before-repair');
    atomicWrite(file,next);
    state.set('codex_sync',{...previous,managed_hash:digest(next),repair_backup:backup});
    return {changed:true,file,backup,recovery:'equivalent_configuration'};
  }
  const baseline=direct??original;
  const repairBackup=baseline!==original?backupConfig(state,original,'codex-config-before-repair'):null;
  const next=managedConfig(baseline,baseUrl);
  const backup=backupConfig(state,baseline);
  state.set('codex_sync',{file,baseUrl,backup,original_hash:digest(baseline),managed_hash:digest(next),...(repairBackup?{repair_backup:repairBackup}:{})});
  try{atomicWrite(file,next);}catch(error){state.set('codex_sync',previous);throw error;}
  return {changed:true,file,backup,...(previous?{recovery:'direct_configuration'}:{})};
}
export function unsyncCodex(state){
  const previous=state.get('codex_sync');
  if(!previous)return {changed:false};
  if(fs.lstatSync(previous.file).isSymbolicLink())throw Error('config_symlink_requires_manual_setup');
  const current=fs.readFileSync(previous.file,'utf8');
  const direct=directConfiguration(current,previous);
  if(direct!==null){
    if(direct!==current){backupConfig(state,current,'codex-config-before-repair');atomicWrite(previous.file,direct);}
    state.set('codex_sync',null);return {changed:direct!==current,file:previous.file,recovery:'already_direct_configuration'};
  }
  atomicWrite(previous.file,restoreConfig(current,previous.baseUrl,{original:verifiedOriginal(previous)}));
  state.set('codex_sync',null);
  return {changed:true,file:previous.file};
}
