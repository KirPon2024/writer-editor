#!/usr/bin/env node
// Read-only adjunct: caller-pinned StageAdmission V2 remains the authority
// oracle. This module never writes files or grants a new scope.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const fail=code=>{throw new Error(code);};
const assert=(condition,code)=>{if(!condition)fail(code);};
const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
const keys=(value,expected,code)=>assert(value&&typeof value==='object'&&!Array.isArray(value)&&canonical(Object.keys(value).sort())===canonical([...expected].sort()),code);
function pinnedJson(bytes,expectedDigest,label){
  assert(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=4*1024*1024,'E_PREPARATION_BYTES_'+label);
  assert(typeof expectedDigest==='string'&&/^[a-f0-9]{64}$/.test(expectedDigest)&&sha256(bytes)===expectedDigest,'E_PREPARATION_PIN_'+label);
  assert(bytes.at(-1)===10,'E_PREPARATION_LF_'+label);
  try{return JSON.parse(bytes.toString('utf8'));}catch{fail('E_PREPARATION_JSON_'+label);}
}
function stageKey(stageId){
  assert(typeof stageId==='string'&&stageId.length<=128,'E_PREPARATION_STAGE_ID');
  const match=/^([A-Z][A-Z0-9]*)(?:-([0-9]+))?_[A-Z0-9_]+$/.exec(stageId);
  assert(match,'E_PREPARATION_STAGE_ID');
  return match[1]+(match[2]??'');
}
export function renderAdmissionPath(template,{stageId,predecessorStageId}){
  const variables={stage:stageKey(stageId),predecessor:stageKey(predecessorStageId)};
  assert(stageId!==predecessorStageId&&variables.stage!==variables.predecessor,'E_PREPARATION_SELF_PREDECESSOR');
  assert(typeof template==='string'&&template.length>0&&template.length<=2048,'E_PREPARATION_PATH_TEMPLATE');
  // Single-pass typed tokens; never replace substrings of another identifier.
  const rendered=template.replace(/\$\{([^}]*)\}/g,(_,key)=>{
    assert(Object.hasOwn(variables,key),'E_PREPARATION_UNKNOWN_TOKEN');
    return variables[key];
  });
  assert(!rendered.includes(String.fromCharCode(36,123))&&rendered===rendered.normalize('NFC')&&!rendered.includes('\\')&&!rendered.startsWith('/')&&!/^[A-Za-z]:/.test(rendered)&&rendered.split('/').every(part=>part&&part!=='.'&&part!=='..'&&!part.includes('\0')),'E_PREPARATION_PATH');
  return rendered;
}
function normalizeWriteSet(operations){
  return{createPaths:[...operations.createPaths].sort(),deletePaths:[...operations.deletePaths].sort(),modifyPaths:[...operations.modifyPaths].sort(),renamePairs:operations.renamePairs.map(pair=>({from:pair.from,to:pair.to})).sort((a,b)=>canonical(a)<canonical(b)?-1:canonical(a)>canonical(b)?1:0)};
}
export function prepareGeneratedOutputSet({instance,admission,plan,predecessorReceiptBytes,predecessorVerificationBytes,expectedPredecessorReceiptDigest,expectedPredecessorVerificationDigest,expectedPredecessorStageId}){
  assert(instance.schemaVersion==='STAGE_INSTANCE_V2'&&admission.schemaVersion==='STAGE_ADMISSION_ATTESTATION_V2'&&admission.status==='ADMITTED'&&admission.decision==='INSTANCE_IS_EXACT_SUBSET_OF_OWNER_AUTHORIZED_SUCCESSOR','E_PREPARATION_ADMISSION_SCHEMA');
  for(const field of ['stageId','authorityId','ownerAuthorityBindingDigest','sourcePlanDigest','externalSourcePlanDigest','compiledProgramFileDigest'])assert(typeof instance[field]==='string'&&instance[field].length>0&&admission[field]===instance[field],'E_PREPARATION_SHARED_IDENTITY_'+field);
  assert(instance.sourcePlanDigest===instance.externalSourcePlanDigest,'E_PREPARATION_SOURCE_PLAN_ROLES');
  const exactIdentity={baseSha:instance.baseSha,headSha:instance.headSha,treeSha:instance.treeSha,branch:instance.branch,targetRemote:instance.targetRemote};
  assert(Object.values(exactIdentity).every(value=>typeof value==='string'&&value.length>0)&&canonical(admission.exactIdentity)===canonical(exactIdentity),'E_PREPARATION_EXACT_IDENTITY');
  assert(instance.lease?.status==='ACTIVE'&&instance.lease.wip===1&&Number.isSafeInteger(instance.lease.fencingCounter)&&instance.lease.fencingCounter>0&&canonical(admission.lease)===canonical(instance.lease),'E_PREPARATION_SHARED_LEASE');
  const receipt=pinnedJson(predecessorReceiptBytes,expectedPredecessorReceiptDigest,'PREDECESSOR');
  const verification=pinnedJson(predecessorVerificationBytes,expectedPredecessorVerificationDigest,'VERIFICATION');
  assert(receipt.stageId===expectedPredecessorStageId&&receipt.status==='CERTIFIED_DONE','E_PREPARATION_PREDECESSOR_IDENTITY');
  assert(verification.status==='PASS'&&verification.receiptSha256===expectedPredecessorReceiptDigest&&verification.leaseStatus==='RELEASED'&&verification.wip===0&&verification.leaseReleaseDispositionSha256===instance.lease.predecessorReleaseDigest,'E_PREPARATION_PREDECESSOR_VERIFICATION');
  for(const digest of [expectedPredecessorReceiptDigest,expectedPredecessorVerificationDigest])assert(instance.predecessors.some(binding=>binding.digest===digest),'E_PREPARATION_UNADMITTED_SOURCE');
  assert(receipt.sourcePlanRoles?.externalSourcePlanDigest===instance.externalSourcePlanDigest&&receipt.sourcePlanRoles?.compiledProgramFileDigest===instance.compiledProgramFileDigest&&instance.externalSourcePlanDigest!==instance.compiledProgramFileDigest,'E_PREPARATION_SOURCE_PLAN_ROLES');
  keys(plan,['schemaVersion','stageId','predecessorStageId','entries'],'E_PREPARATION_PLAN_FIELDS');
  assert(plan.schemaVersion==='R24_ADMISSION_PREPARATION_OUTPUTS_V1'&&plan.stageId===instance.stageId&&plan.predecessorStageId===receipt.stageId,'E_PREPARATION_PLAN_IDENTITY');
  assert(Array.isArray(plan.entries)&&plan.entries.length>0&&plan.entries.length<=4096,'E_PREPARATION_PLAN_BOUND');
  const ids={stageId:instance.stageId,predecessorStageId:receipt.stageId};
  stageKey(ids.stageId);stageKey(ids.predecessorStageId);
  const produced={createPaths:[],deletePaths:[],modifyPaths:[],renamePairs:[]},all=[];
  for(const entry of plan.entries){
    if(entry?.operation==='rename'){
      keys(entry,['operation','fromTemplate','toTemplate'],'E_PREPARATION_ENTRY_FIELDS');
      const from=renderAdmissionPath(entry.fromTemplate,ids),to=renderAdmissionPath(entry.toTemplate,ids);
      produced.renamePairs.push({from,to});all.push(from,to);
    }else{
      keys(entry,['operation','pathTemplate'],'E_PREPARATION_ENTRY_FIELDS');
      assert(['create','modify','delete'].includes(entry.operation),'E_PREPARATION_OPERATION');
      const file=renderAdmissionPath(entry.pathTemplate,ids);
      produced[entry.operation+'Paths'].push(file);all.push(file);
    }
  }
  assert(new Set(all).size===all.length,'E_PREPARATION_DUPLICATE_OUTPUT');
  // Equality with an admitted set is necessary but cannot validate a
  // consistently misnamed predecessor in both the old admission and plan.
  // Derive the carrier's semantic name independently, including literal paths.
  const predecessorCarriers=all.filter(file=>/_TERMINAL_PREDECESSOR_V[1-9][0-9]*\.json$/.test(file));
  assert(predecessorCarriers.length===1,'E_PREPARATION_PREDECESSOR_CARRIER_DENOMINATOR');
  const suffix=/_TERMINAL_PREDECESSOR_V[1-9][0-9]*\.json$/.exec(predecessorCarriers[0])[0];
  assert(predecessorCarriers[0]==='docs/OPS/R24/CORRECTIVE/'+stageKey(ids.stageId)+'_'+stageKey(ids.predecessorStageId)+suffix,'E_PREPARATION_PREDECESSOR_CARRIER_IDENTITY');
  const admitted={createPaths:instance.operations.createPaths,deletePaths:instance.operations.deletePaths,modifyPaths:instance.operations.modifyPaths,renamePairs:instance.operations.renamePairs};
  assert(sha256(canonical(admitted))===admission.writeSetDigest,'E_PREPARATION_ADMISSION_WRITE_SET_PIN');
  assert(canonical(normalizeWriteSet(produced))===canonical(normalizeWriteSet(admitted)),'E_PREPARATION_EXACT_OUTPUT_SET');
  const result={schemaVersion:'R24_ADMISSION_PREPARATION_RESULT_V1',status:'PASS',stageId:instance.stageId,predecessorStageId:receipt.stageId,predecessorReceiptDigest:expectedPredecessorReceiptDigest,predecessorVerificationDigest:expectedPredecessorVerificationDigest,writeSetDigest:admission.writeSetDigest,outputPathDenominator:all.length,operationDenominator:plan.entries.length,generatedOperations:normalizeWriteSet(produced),repositoryWrites:0,authorityCreated:false};
  for(const values of Object.values(result.generatedOperations)){for(const value of values)if(value&&typeof value==='object')Object.freeze(value);Object.freeze(values);}
  Object.freeze(result.generatedOperations);
  return Object.freeze(result);
}
const ARGUMENTS=['repo-root','authority','stage-instance','stage-admission','expected-verifier-digest','expected-authority-digest','predecessor-receipt','expected-predecessor-receipt-digest','predecessor-verification','expected-predecessor-verification-digest','expected-predecessor-stage-id','generated-plan'];
export function runPreparation(argv){
  assert(argv.length===ARGUMENTS.length*2,'E_PREPARATION_ARGUMENTS');
  const args={};
  for(let i=0;i<argv.length;i+=2){const key=argv[i]?.slice(2);assert(argv[i]?.startsWith('--')&&ARGUMENTS.includes(key)&&!Object.hasOwn(args,key)&&typeof argv[i+1]==='string'&&argv[i+1].length>0,'E_PREPARATION_ARGUMENTS');args[key]=argv[i+1];}
  const root=fs.realpathSync(args['repo-root']),verifier=path.join(root,'scripts/ops/r24/corrective/stage-admission-verifier-v2.mjs');
  assert(sha256(fs.readFileSync(verifier))===args['expected-verifier-digest'],'E_PREPARATION_VERIFIER_PIN');
  const nativeArgs=['repo-root','authority','stage-instance','stage-admission','expected-verifier-digest','expected-authority-digest'].flatMap(key=>['--'+key,args[key]]);
  const native=JSON.parse(execFileSync(process.execPath,[verifier,...nativeArgs],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024,stdio:['ignore','pipe','pipe']}));
  assert(native.status==='PASS'&&native.authorityDigest===args['expected-authority-digest'],'E_PREPARATION_NATIVE_ORACLE');
  const instance=pinnedJson(fs.readFileSync(args['stage-instance']),native.stageInstanceDigest,'INSTANCE'),admission=pinnedJson(fs.readFileSync(args['stage-admission']),native.stageAdmissionDigest,'ADMISSION');
  const git=(...arguments_)=>execFileSync('git',arguments_,{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024,stdio:['ignore','pipe','pipe']}).trim();
  assert(git('rev-parse','HEAD')===instance.baseSha&&git('rev-parse','HEAD^{tree}')===instance.treeSha&&git('rev-parse','origin/main')===instance.baseSha&&git('branch','--show-current')===instance.branch,'E_PREPARATION_FRESH_IDENTITY');
  assert(git('status','--porcelain=v1','--untracked-files=all')==='','E_PREPARATION_FIRST_WRITE_ONLY');
  const planBytes=fs.readFileSync(args['generated-plan']);
  assert(planBytes.length>0&&planBytes.length<=4*1024*1024,'E_PREPARATION_PLAN_BYTES');
  const result=prepareGeneratedOutputSet({instance,admission,plan:JSON.parse(planBytes.toString('utf8')),predecessorReceiptBytes:fs.readFileSync(args['predecessor-receipt']),predecessorVerificationBytes:fs.readFileSync(args['predecessor-verification']),expectedPredecessorReceiptDigest:args['expected-predecessor-receipt-digest'],expectedPredecessorVerificationDigest:args['expected-predecessor-verification-digest'],expectedPredecessorStageId:args['expected-predecessor-stage-id']});
  return{...result,nativeVerifierDigest:native.verifierDigest,authorityDigest:native.authorityDigest,stageInstanceDigest:native.stageInstanceDigest,stageAdmissionDigest:native.stageAdmissionDigest,generatedPlanDigest:sha256(planBytes)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(fs.realpathSync(process.argv[1])).href){
  try{process.stdout.write(JSON.stringify(runPreparation(process.argv.slice(2)))+'\n');}
  catch(error){process.stderr.write((error.message||'E_PREPARATION')+'\n');process.exitCode=1;}
}
