import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import {P01_ADMISSION_PREPARATION_EXPECTATION as E,verifyP01AdmissionPreparationPostEvaluationException,verifyWp602MainProductPostEvaluationException} from '../../scripts/ops/r24/corrective/post-audit-certification-set.mjs';
import {HISTORICAL_INVENTORY_CLAIM_PINS_V1 as V1,HISTORICAL_INVENTORY_CLAIM_PINS_V2 as V2,HISTORICAL_INVENTORY_CLAIM_PINS_V3 as V3,verifyHistoricalInventoryClaim,lintDocsClaims} from '../../scripts/ops/r24/docs-claim-lint.mjs';
const root=process.cwd(),c='docs/OPS/R24/CORRECTIVE/',inventory=c+'C1B_TEST_INVENTORY_V1.json';
const instance=JSON.parse(fs.readFileSync(E.instancePath)),ADMITTED=[...instance.operations.modifyPaths,...instance.operations.createPaths].sort();
const candidate='f001f001f001f001f001f001f001f001f001f001',tree='a001a001a001a001a001a001a001a001a001a001';
const realGit=(args)=>execFileSync('git',args,{encoding:null,stdio:['ignore','pipe','pipe']});
function fakeGit({delta=ADMITTED,missing=null,drift=null,ancestor=true,wrongBase=false,registryMutant=null}={}){
  return(args,{encoding=null}={})=>{
    let value;
    if(args[0]==='rev-parse')value=Buffer.from(args[1]==='HEAD'?candidate:args[1]===E.baseSha+'^{tree}'?(wrongBase?'b'.repeat(40):E.baseTree):args[1]===candidate+'^{tree}'?tree:args[1]);
    else if(args[0]==='merge-base'){if(!ancestor)throw Error('NOT_ANCESTOR');value=Buffer.alloc(0);}
    else if(args[0]==='diff')value=Buffer.from(delta.join('\n'));
    else if(args[0]==='show'){
      const split=args[1].indexOf(':'),sha=args[1].slice(0,split),file=args[1].slice(split+1);
      if(file===missing)throw Error('MISSING');
      value=sha===E.baseSha?realGit(args):fs.readFileSync(file);
      if(registryMutant&&file===c+'P01_CARRIER_REGISTRY_V1.json'){const registry=JSON.parse(value);registryMutant(registry);value=Buffer.from(JSON.stringify(registry,null,2)+'\n');}
      if(file===drift)value=Buffer.concat([value,Buffer.from(' ')]);
    }else throw Error('UNEXPECTED_GIT');
    return encoding==='utf8'?value.toString():value;
  };
}
test('P01 Git-object oracle binds all 28 admitted outputs and does not increment product graph progress',()=>{
  const result=verifyP01AdmissionPreparationPostEvaluationException({git:fakeGit()});
  assert.equal(result.status,'PASS');assert.equal(result.processTask,true);assert.equal(result.productGraphIncrement,0);
  assert.equal(result.candidateSha,candidate);assert.equal(result.candidateTree,tree);assert.equal(result.admissionDenominator,1);
  assert.equal(result.admittedPathDenominator,28);assert.deepEqual(result.changedPaths,ADMITTED);assert.equal(result.protectedWipDenominator,267);assert.equal(result.protectedDirtyDenominator,10);
  assert.notEqual(result.sourcePlanRoles.externalSourcePlanDigest,result.sourcePlanRoles.compiledProgramFileDigest);
});
test('P01 candidate oracle rejects incomplete extra duplicate misnamed wrong-base and non-descendant deltas',()=>{
  for(const delta of [ADMITTED.slice(1),[...ADMITTED,'src/main.js'].sort(),[...ADMITTED,ADMITTED[0]].sort(),ADMITTED.map(p=>p.replace('P01_WP602_TERMINAL_PREDECESSOR','P01_P01_TERMINAL_PREDECESSOR')).sort()])assert.throws(()=>verifyP01AdmissionPreparationPostEvaluationException({git:fakeGit({delta})}),/E_P01_EXACT_ADMITTED_DELTA/);
  assert.throws(()=>verifyP01AdmissionPreparationPostEvaluationException({git:fakeGit({ancestor:false})}),/E_P01_BASE_NOT_ANCESTOR/);
  assert.throws(()=>verifyP01AdmissionPreparationPostEvaluationException({git:fakeGit({wrongBase:true})}),/E_P01_ADMISSION_BASE/);
});
test('every candidate artifact and complete non-recursive 20-member registry is required with exact bytes',()=>{
  for(const missing of ADMITTED)assert.throws(()=>verifyP01AdmissionPreparationPostEvaluationException({git:fakeGit({missing})}),/E_P01_(CANDIDATE_ARTIFACT_MISSING|REQUIRED_ARTIFACT)/);
  for(const drift of [E.authorityPath,E.instancePath,E.admissionPath,E.protectedWipBeforePath,E.predecessorPath,E.outputPlanPath])assert.throws(()=>verifyP01AdmissionPreparationPostEvaluationException({git:fakeGit({drift})}),/E_P01_CANONICAL_LF/);
  for(const drift of ['scripts/ops/r24/corrective/admission-preparation.mjs','test/contracts/r24-admission-preparation.contract.test.mjs','.github/workflows/oss-policy.yml','docs/PROCESS.md'])assert.throws(()=>verifyP01AdmissionPreparationPostEvaluationException({git:fakeGit({drift})}),/E_P01_CANDIDATE_MEMBER_BYTES/);
  for(const registryMutant of [v=>v.carriers.pop(),v=>v.carriers[0].sha256='0'.repeat(64),v=>v.carriers[1]=v.carriers[0],v=>v.currentTreeFallbackAllowed=true,v=>v.excludedDependentCarriers.push('docs/PROCESS.md'),v=>v.byteIdentityRole='BASE_TREE_CONTENTS'])assert.throws(()=>verifyP01AdmissionPreparationPostEvaluationException({git:fakeGit({registryMutant})}));
});
test('completed WP602 prefix stays at dd2e while current P01 uses its own exact candidate coverage',()=>{
  const result=verifyWp602MainProductPostEvaluationException({candidateSha:E.baseSha});
  assert.equal(result.status,'PASS');assert.equal(result.candidateSha,E.baseSha);assert.equal(result.candidateTree,E.baseTree);assert.equal(result.admittedPathDenominator,31);
  const source=fs.readFileSync('scripts/ops/r24/corrective/post-audit-certification-set.mjs','utf8');
  assert(source.includes('candidateSha:p01Enabled?P01_ADMISSION_PREPARATION_EXPECTATION.baseSha:resolvedCandidate'));
  assert(source.includes('...(p01Exception?.admittedPaths??[])'));assert(source.includes('p01AdmissionPreparationPostEvaluationException:p01Exception'));
  assert.equal(instance.lease.fencingCounter,83);assert.equal(instance.lease.predecessorReleaseDigest,'6529cad5a5c83087f05b4c972869f4a48678cac41f33263b6cc60bde65ecd388');
});
function historicalInput(){
  const pin=V3.at(-1),stampBytes=fs.readFileSync('docs/OPS/R24/EVIDENCE/'+pin.stampId+'.json'),stamp=JSON.parse(stampBytes);
  return{pin,input:{rootDir:root,stamp,stampBytes,binding:stamp.claimBindings.find(b=>b.filePath===inventory)}};
}
test('P01 appends exactly one WP602 historical pin without reopening earlier immutable pins',()=>{
  assert.equal(V1.length,2);assert.equal(V2.length,4);assert.equal(V3.length,5);assert.deepEqual(V3.slice(0,4),V2);
  assert(Object.isFrozen(V3));assert(Object.isFrozen(V3.at(-1)));
  const{pin,input}=historicalInput(),result=verifyHistoricalInventoryClaim(input);
  assert.equal(pin.evaluationSha,E.baseSha);assert.equal(pin.evaluationTree,E.baseTree);
  assert.equal(result.status,'VERIFIED_HISTORICAL_BYTES');assert.equal(result.currentFileCoverage,false);
});
test('WP602 historical pin still rejects SHA tree ancestry and object substitution',()=>{
  const{pin,input}=historicalInput();
  for(const mode of ['head','tree','ancestry','missing-stamp','missing-inventory','stamp-bytes','inventory-bytes']){
    const git=(rootDir,args)=>{
      if(mode==='head'&&args[1]==='HEAD')return Buffer.from('not-a-sha');
      if(mode==='tree'&&args[1]===pin.evaluationSha+'^{tree}')return Buffer.from('0'.repeat(40));
      if(mode==='ancestry'&&args[0]==='merge-base')throw Error('NOT_ANCESTOR');
      if(args[0]==='show'){const target=args[1].endsWith(':'+inventory)?'inventory':'stamp';if(mode==='missing-'+target)throw Error('MISSING');if(mode===target+'-bytes')return Buffer.from('future replacement');}
      return realGit(args);
    };
    assert.throws(()=>verifyHistoricalInventoryClaim({...input,git}),/E_HISTORICAL_INVENTORY_BINDING/);
  }
});
test('historical WP602 evidence cannot make an uncovered current inventory claim pass',t=>{
  const{pin,input}=historicalInput(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'p01-current-coverage-'));
  t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  execFileSync('git',['init','--quiet',temp]);
  const common=realGit(['rev-parse','--path-format=absolute','--git-common-dir']).toString().trim();
  fs.writeFileSync(path.join(temp,'.git/objects/info/alternates'),path.join(common,'objects')+'\n');fs.writeFileSync(path.join(temp,'.git/HEAD'),pin.evaluationSha+'\n');
  fs.mkdirSync(path.join(temp,'docs/OPS/R24/EVIDENCE'),{recursive:true});fs.mkdirSync(path.join(temp,c),{recursive:true});
  for(const binding of input.stamp.claimBindings){const target=path.join(temp,binding.filePath);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,binding.filePath===inventory?'{"claim":"PASS"}\n':realGit(['show',pin.evaluationSha+':'+binding.filePath]));}
  fs.writeFileSync(path.join(temp,'docs/OPS/R24/EVIDENCE/'+pin.stampId+'.json'),input.stampBytes);
  const result=lintDocsClaims(temp);assert.equal(result.ok,false);assert.equal(result.historicalBindings.length,1);assert.equal(result.historicalBindings[0].currentFileCoverage,false);assert(result.failures.includes('E_CLAIM_WITHOUT_EVIDENCE:'+inventory));
});
test('P01 does not create another frozen current-inventory claim while retaining its exact required coverage',()=>{
  const stamp=JSON.parse(fs.readFileSync('docs/OPS/R24/EVIDENCE/ES-R24-P01-ADMISSION-PREPARATION-CLAIM-BINDINGS.json'));
  assert(!stamp.claimBindings.some(binding=>binding.filePath===inventory));
  const registry=JSON.parse(fs.readFileSync(c+'P01_CARRIER_REGISTRY_V1.json'));
  assert(registry.carriers.some(binding=>binding.path===inventory));
  const workflow=fs.readFileSync('.github/workflows/oss-policy.yml','utf8');assert(workflow.includes('run: npm run r24:test-inventory'));
});
test('plan and process preserve no-change closure full startup and non-recursive terminal publication',()=>{
  const plan=fs.readFileSync('docs/tasks/2026-09-03--r24-process-corrections.md','utf8'),process=fs.readFileSync('docs/PROCESS.md','utf8'),workflow=fs.readFileSync('.github/workflows/oss-policy.yml','utf8');
  for(const text of ['STATUS_AT_PREPARATION','NO_CHANGE','DELIVERY_NOT_APPLICABLE','No PR exists solely','full startup-reading protocol','next 3–5 comparable product stages'])assert(plan.includes(text),text);
  assert(process.includes('admission-preparation.mjs'));assert(process.includes('never chained global ID replacement'));
  assert(workflow.indexOf('Reject admission identity and complete output-set drift')<workflow.indexOf('- run: npm ci --engine-strict'));
  assert.equal(workflow.split('WP602_GOVERNANCE_CHANGE_APPROVALS').length,1);assert.equal(workflow.split('P01_GOVERNANCE_CHANGE_APPROVALS').length,4);
});
