import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import test from 'node:test';
import {renderAdmissionPath,prepareGeneratedOutputSet,runPreparation} from '../../scripts/ops/r24/corrective/admission-preparation.mjs';
const root=process.cwd(),c='docs/OPS/R24/CORRECTIVE/';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),bytes=v=>Buffer.from(JSON.stringify(v,null,2)+'\n');
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const writeSet=operations=>({createPaths:operations.createPaths,deletePaths:operations.deletePaths,modifyPaths:operations.modifyPaths,renamePairs:operations.renamePairs});
const token=String.fromCharCode(36,123),template=c+token+'stage}_'+token+'predecessor}_TERMINAL_PREDECESSOR_V1.json';
const roles={externalSourcePlanDigest:'1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a',compiledProgramFileDigest:'da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a',rolesDistinct:true};
function fixture(stageId='WP-703_DOCX_PROFILE',predecessorStageId='WP-600_FEATURESPEC_QUERY_IR'){
  const path=renderAdmissionPath(template,{stageId,predecessorStageId}),release='d'.repeat(64);
  const receipt={stageId:predecessorStageId,status:'CERTIFIED_DONE',sourcePlanRoles:roles};
  const receiptBytes=bytes(receipt),receiptDigest=sha(receiptBytes);
  const verification={status:'PASS',receiptSha256:receiptDigest,leaseStatus:'RELEASED',wip:0,leaseReleaseDispositionSha256:release};
  const verificationBytes=bytes(verification),verificationDigest=sha(verificationBytes);
  const instance={schemaVersion:'STAGE_INSTANCE_V2',stageId,authorityId:'SYNTHETIC_FIXTURE_AUTHORITY',ownerAuthorityBindingDigest:'b'.repeat(64),sourcePlanDigest:roles.externalSourcePlanDigest,...roles,baseSha:'1'.repeat(40),headSha:'1'.repeat(40),treeSha:'2'.repeat(40),branch:'codex/synthetic-fixture',targetRemote:'origin',lease:{fencingCounter:83,status:'ACTIVE',wip:1,predecessorReleaseDigest:release},predecessors:[{digest:receiptDigest},{digest:verificationDigest}],operations:{readPaths:[],createPaths:[path],modifyPaths:[],deletePaths:[],renamePairs:[]}};
  const admission={schemaVersion:'STAGE_ADMISSION_ATTESTATION_V2',status:'ADMITTED',decision:'INSTANCE_IS_EXACT_SUBSET_OF_OWNER_AUTHORIZED_SUCCESSOR',...Object.fromEntries(['stageId','authorityId','ownerAuthorityBindingDigest','sourcePlanDigest','externalSourcePlanDigest','compiledProgramFileDigest'].map(field=>[field,instance[field]])),lease:structuredClone(instance.lease),exactIdentity:{baseSha:instance.baseSha,headSha:instance.headSha,treeSha:instance.treeSha,branch:instance.branch,targetRemote:instance.targetRemote},writeSetDigest:sha(canonical(writeSet(instance.operations)))};
  return{instance,admission,plan:{schemaVersion:'R24_ADMISSION_PREPARATION_OUTPUTS_V1',stageId,predecessorStageId,entries:[{operation:'create',pathTemplate:template}]},predecessorReceiptBytes:receiptBytes,predecessorVerificationBytes:verificationBytes,expectedPredecessorReceiptDigest:receiptDigest,expectedPredecessorVerificationDigest:verificationDigest,expectedPredecessorStageId:predecessorStageId};
}
test('both historical substitution regressions preserve actual predecessor independently of current stage',()=>{
  for(const [stage,predecessor,expected,old,first,second] of [
    ['WP-703_DOCX_PROFILE','WP-600_FEATURESPEC_QUERY_IR','WP703_WP600','WP600_WP702','WP600','WP702'],
    ['WP-705_NEGOTIATION_CORPUS','WP-704_PDF_ARCHIVE_REVIEW','WP705_WP704','WP704_WP601','WP704','WP601']
  ]){
    const f=fixture(stage,predecessor),result=prepareGeneratedOutputSet(f);
    assert(result.generatedOperations.createPaths[0].includes(expected));
    const newKey=expected.split('_')[0],predecessorKey=expected.split('_')[1];
    const buggy=old.replaceAll(second,predecessorKey).replaceAll(first,newKey);
    assert.equal(buggy,newKey+'_'+newKey);
    f.plan.entries[0].pathTemplate=c+buggy+'_TERMINAL_PREDECESSOR_V1.json';
    assert.throws(()=>prepareGeneratedOutputSet(f),/E_PREPARATION_PREDECESSOR_CARRIER_IDENTITY/);
  }
});
test('generic identifiers and repeated typed tokens are rendered once without global textual substitution',()=>{
  for(const [stageId,predecessorStageId,expected] of [['OPS-42_REPAIR','WP-777_EXISTING','OPS42_WP777'],['P01_ADMISSION_PREPARATION','WP-602_PROPOSAL_WORKFLOW','P01_WP602'],['WP-1000_FUTURE','OPS-42_REPAIR','WP1000_OPS42']]){
    const result=prepareGeneratedOutputSet(fixture(stageId,predecessorStageId));
    assert(result.generatedOperations.createPaths[0].includes(expected));assert.equal(result.repositoryWrites,0);assert.equal(result.authorityCreated,false);
    assert(Object.isFrozen(result));assert(Object.isFrozen(result.generatedOperations.createPaths));
  }
});
test('wrong predecessor and tampered or unadmitted source bytes are rejected before path production',()=>{
  const f=fixture();
  assert.throws(()=>prepareGeneratedOutputSet({...f,expectedPredecessorStageId:'WP-999_WRONG'}),/E_PREPARATION_PREDECESSOR_IDENTITY/);
  for(const key of ['predecessorReceiptBytes','predecessorVerificationBytes'])assert.throws(()=>prepareGeneratedOutputSet({...f,[key]:Buffer.concat([f[key],Buffer.from(' ')])}),/E_PREPARATION_PIN_/);
  const missing=structuredClone(f.instance);missing.predecessors=[];
  assert.throws(()=>prepareGeneratedOutputSet({...f,instance:missing}),/E_PREPARATION_UNADMITTED_SOURCE/);
  const wrong=structuredClone(f.plan);wrong.predecessorStageId=wrong.stageId;
  assert.throws(()=>prepareGeneratedOutputSet({...f,plan:wrong}),/E_PREPARATION_PLAN_IDENTITY/);
  assert.throws(()=>renderAdmissionPath(template,{stageId:f.instance.stageId,predecessorStageId:f.instance.stageId}),/E_PREPARATION_SELF_PREDECESSOR/);
});
test('verification cannot be copied across receipts leases or uncompleted predecessors',()=>{
  for(const mutate of [v=>v.status='FAIL',v=>v.wip=1,v=>v.leaseStatus='ACTIVE',v=>v.receiptSha256='a'.repeat(64),v=>v.leaseReleaseDispositionSha256='a'.repeat(64)]){
    const f=fixture(),v=JSON.parse(f.predecessorVerificationBytes);mutate(v);
    f.predecessorVerificationBytes=bytes(v);f.expectedPredecessorVerificationDigest=sha(f.predecessorVerificationBytes);f.instance.predecessors[1].digest=f.expectedPredecessorVerificationDigest;
    assert.throws(()=>prepareGeneratedOutputSet(f),/E_PREPARATION_PREDECESSOR_VERIFICATION/);
  }
});
test('complete output denominator rejects omissions extras wrong operation classes and duplicates',()=>{
  for(const mutate of [p=>p.entries=[],p=>p.entries.push({operation:'create',pathTemplate:'extra.json'}),p=>p.entries[0].operation='modify',p=>p.entries.push({...p.entries[0]}),p=>p.entries[0].pathTemplate='different.json']){
    const f=fixture();mutate(f.plan);assert.throws(()=>prepareGeneratedOutputSet(f),/E_PREPARATION_(PLAN_BOUND|EXACT_OUTPUT_SET|DUPLICATE_OUTPUT|PREDECESSOR_CARRIER_DENOMINATOR)/);
  }
  const f=fixture();f.admission.writeSetDigest='0'.repeat(64);assert.throws(()=>prepareGeneratedOutputSet(f),/E_PREPARATION_ADMISSION_WRITE_SET_PIN/);
});
test('all operation classes and both rename sides belong to the exact generated set',()=>{
  const f=fixture();Object.assign(f.instance.operations,{modifyPaths:['modify.json'],deletePaths:['delete.json'],renamePairs:[{from:'old.json',to:'new.json'}]});
  f.plan.entries.push({operation:'modify',pathTemplate:'modify.json'},{operation:'delete',pathTemplate:'delete.json'},{operation:'rename',fromTemplate:'old.json',toTemplate:'new.json'});
  f.admission.writeSetDigest=sha(canonical(writeSet(f.instance.operations)));
  const result=prepareGeneratedOutputSet(f);assert.equal(result.operationDenominator,4);assert.equal(result.outputPathDenominator,5);
  for(const key of ['fromTemplate','toTemplate']){const plan=structuredClone(f.plan);plan.entries[3][key]='unadmitted.json';assert.throws(()=>prepareGeneratedOutputSet({...f,plan}),/E_PREPARATION_EXACT_OUTPUT_SET/);}
  const duplicate=structuredClone(f.plan);duplicate.entries[3].toTemplate='modify.json';assert.throws(()=>prepareGeneratedOutputSet({...f,plan:duplicate}),/E_PREPARATION_DUPLICATE_OUTPUT/);
});
test('unknown template tokens unsafe paths malformed IDs and unknown fields fail closed',()=>{
  const f=fixture();
  for(const value of [token+'other}/file.json',token+'stage','../file','/absolute','C:/file','a\\b','a//b','a/./b','cafe\u0301.json']){
    assert.throws(()=>renderAdmissionPath(value,{stageId:f.instance.stageId,predecessorStageId:f.expectedPredecessorStageId}),/E_PREPARATION_/);
  }
  assert.throws(()=>renderAdmissionPath(template,{stageId:'untrusted/identity',predecessorStageId:f.expectedPredecessorStageId}),/E_PREPARATION_STAGE_ID/);
  const unknown=structuredClone(f.plan);unknown.extra=true;assert.throws(()=>prepareGeneratedOutputSet({...f,plan:unknown}),/E_PREPARATION_PLAN_FIELDS/);
  const entry=structuredClone(f.plan);entry.entries[0].command='write';assert.throws(()=>prepareGeneratedOutputSet({...f,plan:entry}),/E_PREPARATION_ENTRY_FIELDS/);
  assert.equal(renderAdmissionPath('данные/雪.json',{stageId:f.instance.stageId,predecessorStageId:f.expectedPredecessorStageId}),'данные/雪.json');
});
test('source plan role identities stay distinct and cannot be swapped',()=>{
  const f=fixture(),instance=structuredClone(f.instance);
  instance.compiledProgramFileDigest=instance.externalSourcePlanDigest;
  const admission={...f.admission,compiledProgramFileDigest:instance.compiledProgramFileDigest};
  assert.throws(()=>prepareGeneratedOutputSet({...f,instance,admission}),/E_PREPARATION_SOURCE_PLAN_ROLES/);
});
test('shared admission stage authority source exact identity and lease cannot diverge from the instance',()=>{
  for(const field of ['stageId','authorityId','ownerAuthorityBindingDigest','sourcePlanDigest','externalSourcePlanDigest','compiledProgramFileDigest']){
    const f=fixture();f.admission[field]='MISMATCH';
    assert.throws(()=>prepareGeneratedOutputSet(f),new RegExp('E_PREPARATION_SHARED_IDENTITY_'+field));
  }
  for(const field of ['baseSha','headSha','treeSha','branch','targetRemote']){
    const f=fixture();f.admission.exactIdentity[field]='MISMATCH';assert.throws(()=>prepareGeneratedOutputSet(f),/E_PREPARATION_EXACT_IDENTITY/);
  }
  for(const field of ['fencingCounter','status','wip','predecessorReleaseDigest']){
    const f=fixture();f.admission.lease[field]='MISMATCH';assert.throws(()=>prepareGeneratedOutputSet(f),/E_PREPARATION_SHARED_LEASE/);
  }
  for(const field of ['schemaVersion','status','decision']){const f=fixture();f.admission[field]='MISMATCH';assert.throws(()=>prepareGeneratedOutputSet(f),/E_PREPARATION_ADMISSION_SCHEMA/);}
});
test('actual P01 bundle binds the complete admitted set and exact sealed WP602 bytes',()=>{
  const instance=JSON.parse(fs.readFileSync(c+'P01_STAGE_INSTANCE_V1.json')),admission=JSON.parse(fs.readFileSync(c+'P01_STAGE_ADMISSION_ATTESTATION_V1.json')),plan=JSON.parse(fs.readFileSync(c+'P01_ADMISSION_PREPARATION_OUTPUTS_V1.json')),pre=JSON.parse(fs.readFileSync(c+'P01_WP602_TERMINAL_PREDECESSOR_V1.json'));
  const receipt=pre.artifacts.find(x=>x.basename==='WP602_PROPOSAL_WORKFLOW_TERMINAL_RECEIPT_V1.json'),verification=pre.artifacts.find(x=>x.basename==='WP602_PROPOSAL_WORKFLOW_TERMINAL_VERIFICATION_V1.json');
  const result=prepareGeneratedOutputSet({instance,admission,plan,predecessorReceiptBytes:Buffer.from(receipt.rawBase64,'base64'),predecessorVerificationBytes:Buffer.from(verification.rawBase64,'base64'),expectedPredecessorReceiptDigest:receipt.sha256,expectedPredecessorVerificationDigest:verification.sha256,expectedPredecessorStageId:'WP-602_PROPOSAL_WORKFLOW'});
  assert.equal(result.outputPathDenominator,28);assert.equal(result.predecessorStageId,'WP-602_PROPOSAL_WORKFLOW');assert.equal(result.stageId,'P01_ADMISSION_PREPARATION');
  assert.deepEqual(result.generatedOperations,writeSet(instance.operations));
});
test('matching bad admissions and literal or repeated-stage templates cannot counterfeit a predecessor role',()=>{
  for(const [stage,predecessor,key] of [['WP-703_DOCX_PROFILE','WP-600_FEATURESPEC_QUERY_IR','WP703'],['WP-705_NEGOTIATION_CORPUS','WP-704_PDF_ARCHIVE_REVIEW','WP705'],['OPS-42_REPAIR','WP-777_EXISTING','OPS42']]){
    for(const typed of [false,true]){
      const f=fixture(stage,predecessor),bad=c+key+'_'+key+'_TERMINAL_PREDECESSOR_V1.json';
      f.instance.operations.createPaths=[bad];f.admission.writeSetDigest=sha(canonical(writeSet(f.instance.operations)));
      f.plan.entries[0].pathTemplate=typed?c+token+'stage}_'+token+'stage}_TERMINAL_PREDECESSOR_V1.json':bad;
      assert.throws(()=>prepareGeneratedOutputSet(f),/E_PREPARATION_PREDECESSOR_CARRIER_IDENTITY/);
    }
    const good=fixture(stage,predecessor);good.plan.entries[0].pathTemplate=good.instance.operations.createPaths[0];
    assert.equal(prepareGeneratedOutputSet(good).status,'PASS');
  }
});
test('unaltered historical WP703 and WP705 bad admissions are rejected using real pinned predecessor terminal bytes',()=>{
  for(const [prefix,predecessorPrefix,predecessorStageId] of [['WP703','WP600','WP-600_FEATURESPEC_QUERY_IR'],['WP705','WP704','WP-704_PDF_ARCHIVE_REVIEW']]){
    const instanceBytes=fs.readFileSync(c+prefix+'_MAIN_PRODUCT_STAGE_INSTANCE_V1.json'),admissionBytes=fs.readFileSync(c+prefix+'_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V1.json'),instance=JSON.parse(instanceBytes),admission=JSON.parse(admissionBytes);
    assert.equal(sha(instanceBytes),admission.stageInstanceDigest);
    const carrier=JSON.parse(fs.readFileSync(c+prefix+'_'+predecessorPrefix+'_TERMINAL_PREDECESSOR_V1.json'));
    const predecessorReceiptBytes=Buffer.from(carrier.durable.artifact.memberCanonicalBase64,'base64'),predecessorVerificationBytes=bytes(carrier.verification);
    const expectedPredecessorReceiptDigest=instance.predecessors.find(item=>item.id===predecessorPrefix+'_EXTERNAL_TERMINAL_RECEIPT_V1').digest;
    const expectedPredecessorVerificationDigest=instance.predecessors.find(item=>item.id===predecessorPrefix+'_EXTERNAL_TERMINAL_VERIFICATION_V1').digest;
    assert.equal(sha(predecessorReceiptBytes),expectedPredecessorReceiptDigest);assert.equal(sha(predecessorVerificationBytes),expectedPredecessorVerificationDigest);
    const plan={schemaVersion:'R24_ADMISSION_PREPARATION_OUTPUTS_V1',stageId:instance.stageId,predecessorStageId,entries:[...instance.operations.modifyPaths.map(pathTemplate=>({operation:'modify',pathTemplate})),...instance.operations.createPaths.map(pathTemplate=>({operation:'create',pathTemplate}))]};
    const input={instance,admission,plan,predecessorReceiptBytes,predecessorVerificationBytes,expectedPredecessorReceiptDigest,expectedPredecessorVerificationDigest,expectedPredecessorStageId:predecessorStageId};
    assert(plan.entries.some(entry=>entry.pathTemplate===c+prefix+'_'+prefix+'_TERMINAL_PREDECESSOR_V1.json'));
    assert.throws(()=>prepareGeneratedOutputSet(input),/E_PREPARATION_PREDECESSOR_CARRIER_IDENTITY/);
    const typed=structuredClone(plan);typed.entries.find(entry=>entry.pathTemplate.endsWith('_TERMINAL_PREDECESSOR_V1.json')).pathTemplate=c+token+'stage}_'+token+'stage}_TERMINAL_PREDECESSOR_V1.json';
    assert.throws(()=>prepareGeneratedOutputSet({...input,plan:typed}),/E_PREPARATION_PREDECESSOR_CARRIER_IDENTITY/);
    // No original historical source, instance, admission or receipt is rewritten.
    assert.equal(sha(fs.readFileSync(c+prefix+'_MAIN_PRODUCT_STAGE_INSTANCE_V1.json')),sha(instanceBytes));
  }
});
function nativeFixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'r24-p01-native-')),repo=path.join(dir,'repo'),external=path.join(dir,'inputs');
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  fs.mkdirSync(path.join(repo,'scripts/ops/r24/corrective'),{recursive:true});fs.mkdirSync(path.join(repo,c),{recursive:true});fs.mkdirSync(external);
  const verifierPath='scripts/ops/r24/corrective/stage-admission-verifier-v2.mjs';
  fs.copyFileSync(path.join(root,verifierPath),path.join(repo,verifierPath));fs.writeFileSync(path.join(repo,'anchor.json'),'{}\n');
  const git=(...a)=>execFileSync('git',a,{cwd:repo,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git('init','-b','codex/p01-native');git('config','user.name','Disposable fixture');git('config','user.email','fixture@example.invalid');git('add','--all');git('commit','-m','Disposable fixture');git('update-ref','refs/remotes/origin/main',git('rev-parse','HEAD'));
  const f=fixture(),authority=JSON.parse(fs.readFileSync(c+'P01_OWNER_AUTHORITY_V1.json')),instance=JSON.parse(fs.readFileSync(c+'P01_STAGE_INSTANCE_V1.json')),admission=JSON.parse(fs.readFileSync(c+'P01_STAGE_ADMISSION_ATTESTATION_V1.json'));
  Object.assign(authority,{stageId:f.instance.stageId,baseSha:git('rev-parse','HEAD'),baseTree:git('rev-parse','HEAD^{tree}'),branch:'codex/p01-native',fixedBindings:[{path:'anchor.json',sha256:sha(Buffer.from('{}\n'))}],allowedOperations:f.instance.operations,predecessors:f.instance.predecessors,lease:{fencingCounter:83,status:'ACTIVE',wip:1,predecessorReleaseDigest:f.instance.lease.predecessorReleaseDigest}});
  for(const key of ['stageId','baseSha','branch','fixedBindings','predecessors','lease'])instance[key]=authority[key];
  instance.headSha=authority.baseSha;instance.treeSha=authority.baseTree;instance.operations=authority.allowedOperations;
  for(const key of ['stageId','lease'])admission[key]=instance[key];
  admission.authorityDigest=sha(bytes(authority));admission.stageInstanceDigest=sha(bytes(instance));admission.writeSetDigest=f.admission.writeSetDigest;
  admission.exactIdentity={baseSha:instance.baseSha,headSha:instance.headSha,treeSha:instance.treeSha,branch:instance.branch,targetRemote:'origin'};
  const files={authority:bytes(authority),instance:bytes(instance),admission:bytes(admission),plan:bytes(f.plan),receipt:f.predecessorReceiptBytes,verification:f.predecessorVerificationBytes};
  for(const [name,value]of Object.entries(files))fs.writeFileSync(path.join(external,name+'.json'),value);
  const args=['--repo-root',repo,'--authority',path.join(external,'authority.json'),'--stage-instance',path.join(external,'instance.json'),'--stage-admission',path.join(external,'admission.json'),'--expected-verifier-digest',authority.verifierDigest,'--expected-authority-digest',admission.authorityDigest,'--predecessor-receipt',path.join(external,'receipt.json'),'--expected-predecessor-receipt-digest',f.expectedPredecessorReceiptDigest,'--predecessor-verification',path.join(external,'verification.json'),'--expected-predecessor-verification-digest',f.expectedPredecessorVerificationDigest,'--expected-predecessor-stage-id',f.expectedPredecessorStageId,'--generated-plan',path.join(external,'plan.json')];
  return{dir,repo,external,args,git};
}
test('real CLI runs the pinned native verifier and produces output without repository writes, including symlinked invocation',t=>{
  const f=nativeFixture(t),helper=path.join(root,'scripts/ops/r24/corrective/admission-preparation.mjs'),link=path.join(f.dir,'helper.mjs');
  fs.symlinkSync(helper,link);
  const before=f.git('status','--porcelain=v1','--untracked-files=all');
  const result=spawnSync(process.execPath,[link,...f.args],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);const output=JSON.parse(result.stdout);
  assert.equal(output.status,'PASS');assert.equal(output.repositoryWrites,0);assert.equal(output.outputPathDenominator,1);assert.equal(output.nativeVerifierDigest,'b9cb1d3ad98bbdd0e56dedc4563796f40d9768f1345b57324625ef8386c5bd3f');
  assert.equal(f.git('status','--porcelain=v1','--untracked-files=all'),before);
});
test('real preparation cannot bypass native authority pins fresh HEAD or first-write cleanliness',t=>{
  const f=nativeFixture(t);
  const changed=[...f.args];changed[changed.indexOf('--expected-authority-digest')+1]='0'.repeat(64);
  assert.throws(()=>runPreparation(changed),/E_AUTHORITY_BYTES/);
  const verifier=[...f.args];verifier[verifier.indexOf('--expected-verifier-digest')+1]='0'.repeat(64);assert.throws(()=>runPreparation(verifier),/E_PREPARATION_VERIFIER_PIN/);
  fs.writeFileSync(path.join(f.repo,'unrelated-dirty.json'),'{}\n');assert.throws(()=>runPreparation(f.args),/E_PREPARATION_FIRST_WRITE_ONLY/);
  f.git('add','unrelated-dirty.json');f.git('commit','-m','Disposable drift');
  assert.throws(()=>runPreparation(f.args),/E_PREPARATION_FRESH_IDENTITY/);
});
test('CLI strict arguments reject missing duplicated and unknown inputs without invoking native execution',()=>{
  assert.throws(()=>runPreparation([]),/E_PREPARATION_ARGUMENTS/);
  assert.throws(()=>runPreparation(Array.from({length:12},()=>['--repo-root','unused']).flat()),/E_PREPARATION_ARGUMENTS/);
  assert.throws(()=>runPreparation(Array.from({length:12},()=>['--unknown','unused']).flat()),/E_PREPARATION_ARGUMENTS/);
});
