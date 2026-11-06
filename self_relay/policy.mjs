import crypto from 'node:crypto';
import {RelayError} from './security.mjs';
import {EXECUTABLE_POLICY_REVISION,POLICY_RUNTIME_PROFILE} from './policy-runtime.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const fail = (code='invalid_policy', status=400) => {throw new RelayError(status, code);};
const integer = (value,min,max) => Number.isSafeInteger(value) && value>=min && value<=max;
const effort = new Set(['off','none','minimal','low','medium','high','xhigh','max']);
const numeric = (min,max) => value => integer(value,min,max);
const flag = value => typeof value === 'boolean';
export const LIMIT_VALIDATORS = Object.freeze({
  cutChars:numeric(0,1048576),maxSegments:numeric(1,128),tailChars:numeric(0,1048576),
  postcallChars:numeric(0,1048576),digestChars:numeric(0,1048576),contEffort:value=>effort.has(value),
  holdback:numeric(0,1048576),argHoldback:numeric(0,1048576),lightChars:numeric(0,1048576),
  lightModel:value=>typeof value==='string' && (value==='' || /^[\w.:-]{1,100}$/.test(value)),
  trimChars:numeric(0,1048576),jsonLane:flag,slim:flag,callOpenMaxMs:numeric(0,86400000),
  structTier:flag,mainEffort:value=>effort.has(value),cacheNorm:flag,callArgStallMs:numeric(0,86400000),
  contSlim:flag,contTrimChars:numeric(0,1048576),argSizeMax:numeric(-1,1048576),stripCollab:flag,
  argsCont:flag,upstreamHdrMs:numeric(0,86400000),noFirstByteMs:numeric(0,86400000),
});
export const TEMPLATE_NAMES = Object.freeze([
  'marker','appendixTag','endnoteTag','argPadKey','padCallName','padCallDescription','padCallNotesDescription',
  'tplPadCall','tplMarker','tplMarkerUserNote','tplToolPad','tplAstraSlim','tplMarkerSlim','tplSentinel',
  'tplToolDescPad','tplArgSchemaDesc','tplArgSchemaDescSoft','tplLarkTrailer','tplArgsPadSoftDesc',
  'tplCustomPadSuffix','tplCodePadPrefix','tplFuncPadPrefix','tplStrTailSuffix','larkPadTerm','larkPadRule',
  'padStatement','padStmtPattern','markerBareAlt','textSentinel','tplContinuation','tplStateHead',
  'jsonLaneName','jsonNotesDescription',
]);
const fields = (value,allowed) => object(value) && Object.keys(value).every(key=>allowed.includes(key));
const canonical = value => JSON.stringify(value, function(key,item){
  return object(item) ? Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])) : item;
});
const digest = value => crypto.createHash('sha256').update(canonical(value)).digest('hex');
const freeze = value => {if(value && typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};

// Các chuỗi là dữ liệu; tuyệt đối không eval/import template hoặc chạy regex từ policy.
export function validatePolicy(value) {
  if(!fields(value,['v','limits',...TEMPLATE_NAMES]) || !integer(value.v,1,Number.MAX_SAFE_INTEGER) ||
    !fields(value.limits,Object.keys(LIMIT_VALIDATORS)))fail();
  for(const [key,validate] of Object.entries(LIMIT_VALIDATORS))if(!validate(value.limits[key]))fail('invalid_policy_limit');
  for(const key of TEMPLATE_NAMES)if(typeof value[key]!=='string' || value[key].length>16384 || value[key].includes('\0'))fail('invalid_policy_template');
  if(Buffer.byteLength(canonical(value))>131072)fail('policy_too_large',413);
  return freeze(JSON.parse(canonical(value)));
}
export const policyRevision = value => digest(validatePolicy(value));
const emptyState = () => ({schema:1,generation:0,activeRevision:null,mode:'off',revisions:[],history:[]});
const provenanceKeys = ['binary_sha256','policy_file_sha256','audit_sha256','observed_at','scope'];
function provenance(value) {
  if(!fields(value,provenanceKeys))fail('invalid_policy_provenance');
  for(const [key,item] of Object.entries(value)) {
    if(typeof item!=='string' || item.length>256)fail('invalid_policy_provenance');
    if(key.endsWith('_sha256')&&!/^[a-f0-9]{64}$/.test(item))fail('invalid_policy_provenance');
    if(key==='observed_at'&&!Number.isFinite(Date.parse(item)))fail('invalid_policy_provenance');
  }
  return JSON.parse(canonical(value));
}
export function validatePolicyState(state) {
  if(!fields(state,['schema','generation','activeRevision','mode','revisions','history']) || state.schema!==1 ||
    !integer(state.generation,0,Number.MAX_SAFE_INTEGER) || !Array.isArray(state.revisions) || state.revisions.length>16 ||
    !Array.isArray(state.history) || state.history.length>32 || !['off','observe','enforce'].includes(state.mode))fail('invalid_policy_state');
  const ids=new Set();
  for(const record of state.revisions) {
    if(!fields(record,['revision','importedAt','policy','provenance']) || !integer(record.importedAt,1,Number.MAX_SAFE_INTEGER))fail('invalid_policy_state');
    const id=policyRevision(record.policy);
    if(record.revision!==id || ids.has(id))fail('policy_revision_integrity_failed');
    ids.add(id);provenance(record.provenance);
  }
  if(state.activeRevision!==null&&!ids.has(state.activeRevision) || (state.mode==='off')!==(state.activeRevision===null))fail('invalid_policy_state');
  if(state.mode==='enforce'&&state.activeRevision!==EXECUTABLE_POLICY_REVISION)fail('policy_revision_not_executable',409);
  for(const change of state.history) {
    if(!fields(change,['from','to','fromMode','toMode','generation','at']) || !integer(change.generation,1,state.generation) ||
      !integer(change.at,1,Number.MAX_SAFE_INTEGER) || [change.from,change.to].some(id=>id!==null&&!ids.has(id)))fail('invalid_policy_state');
    for(const prefix of ['from','to'])if(change[prefix+'Mode']!==undefined&&
      (!['off','observe','enforce'].includes(change[prefix+'Mode'])||(change[prefix+'Mode']==='off')!==(change[prefix]===null)||
      change[prefix+'Mode']==='enforce'&&change[prefix]!==EXECUTABLE_POLICY_REVISION))fail('invalid_policy_state');
  }
  return state;
}

export function policyCoverage(policy) {
  validatePolicy(policy);
  const executable=policyRevision(policy)===EXECUTABLE_POLICY_REVISION;
  return {
    executionImplemented:executable,referenceOnly:!executable,profile:executable?POLICY_RUNTIME_PROFILE:null,
    limits:Object.keys(policy.limits).sort().map(name=>({name,status:!executable?'validated_reference_only':name==='cacheNorm'?'metadata_only': 'implemented_conditionally'})),
    templates:TEMPLATE_NAMES.map(name=>({name,status:!executable?'stored_not_executed':name==='tplAstraSlim'?'no_direct_consumer_in_reference':'implemented_conditionally',sha256:crypto.createHash('sha256').update(policy[name]).digest('hex')})),
    deviations:['cache_normalization_metadata_only','usage_requires_original_upstream_measurement','compaction_passthrough','no_vendor_environment_or_header_overrides'],
    unresolved:['full_behavior_parity','quality_parity','subscription_quota_parity'],
  };
}

export class LocalPolicyStore {
  constructor(settings,db) {this.settings=settings;this.db=db;this.read();}
  read() {return validatePolicyState(this.settings.get('policy.state')??emptyState());}
  snapshot() {
    const state=this.read();
    return freeze({revision:state.activeRevision,generation:state.generation,mode:state.mode,enforced:state.mode==='enforce'});
  }
  capture() {
    const state=this.read(),active=state.revisions.find(item=>item.revision===state.activeRevision);
    return freeze({identity:{revision:state.activeRevision,generation:state.generation,mode:state.mode,enforced:state.mode==='enforce'},
      policy:state.mode==='enforce'?active.policy:null});
  }
  status() {
    const state=this.read(),active=state.revisions.find(item=>item.revision===state.activeRevision);
    return {source:'local_sqlite',schema:state.schema,generation:state.generation,mode:state.mode,
      activeRevision:state.activeRevision,enforced:state.mode==='enforce',
      revisions:state.revisions.map(({revision,importedAt,policy,provenance})=>({revision,importedAt,
        sourcePolicyVersion:policy.v,limitsCount:Object.keys(policy.limits).length,templatesCount:TEMPLATE_NAMES.length,
        provenance,provenanceVerification:'declared_metadata_content_digest_checked'})),
      history:state.history,coverage:active?policyCoverage(active.policy):null};
  }
  change(expectedGeneration,mutate) {
    if(!integer(expectedGeneration,0,Number.MAX_SAFE_INTEGER))fail('policy_generation_required');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const state=this.read();
      if(state.generation!==expectedGeneration)fail('policy_generation_conflict',409);
      const result=mutate(state);
      state.generation++;
      this.settings.set('policy.state',validatePolicyState(state));
      this.db.exec('COMMIT');
      return {...result,generation:state.generation};
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  import(input) {
    if(!fields(input,['policy','provenance','expectedGeneration']))fail('invalid_policy_import');
    const {policy,provenance:origin={},expectedGeneration}=input;
    const validated=validatePolicy(policy),revision=policyRevision(validated),source=provenance(origin);
    return this.change(expectedGeneration,state=>{
      const existing=state.revisions.find(item=>item.revision===revision);
      if(!existing){
        if(state.revisions.length>=16)fail('policy_revision_limit',409);
        state.revisions.push({revision,importedAt:Date.now(),policy:validated,provenance:source});
      }
      return {revision,imported:!existing,activated:false};
    });
  }
  select(input) {
    if(!fields(input,['revision','mode','expectedGeneration']))fail('invalid_policy_selection');
    const {revision,mode,expectedGeneration}=input;
    if(mode==='enforce'&&revision!==EXECUTABLE_POLICY_REVISION)fail('policy_revision_not_executable',409);
    if(!['observe','off','enforce'].includes(mode) || (mode==='off')!==(revision===null))fail('invalid_policy_selection');
    return this.change(expectedGeneration,state=>{
      if(revision!==null&&!state.revisions.some(item=>item.revision===revision))fail('policy_revision_not_found',404);
      state.history.push({from:state.activeRevision,to:revision,fromMode:state.mode,toMode:mode,generation:state.generation+1,at:Date.now()});
      state.history=state.history.slice(-32);state.activeRevision=revision;state.mode=mode;
      return {revision,mode,enforced:mode==='enforce'};
    });
  }
  rollback(input) {
    if(!fields(input,['expectedGeneration']))fail('invalid_policy_selection');
    const {expectedGeneration}=input;
    const state=this.read(),last=state.history.at(-1);
    if(!last)fail('policy_no_previous_selection',409);
    return this.select({revision:last.from,mode:last.fromMode??(last.from===null?'off':'observe'),expectedGeneration});
  }
}
