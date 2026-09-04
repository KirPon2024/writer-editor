import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import {P03_CONTEXT_RESTORATION_EXPECTATION as E, verifyP03ContextRestorationPostEvaluationException, verifyP01AdmissionPreparationPostEvaluationException} from '../../scripts/ops/r24/corrective/post-audit-certification-set.mjs';
const c='docs/OPS/R24/CORRECTIVE/',h=b=>crypto.createHash('sha256').update(b).digest('hex');
const instance=JSON.parse(fs.readFileSync(E.instancePath)),ADMITTED=[...instance.operations.modifyPaths,...instance.operations.createPaths].sort();
const candidate='f003f003f003f003f003f003f003f003f003f003',tree='a003a003a003a003a003a003a003a003a003a003';
const P03_MERGE_SHA='39897a04b880391ee9224269a2691f52e9e8018f';
const realGit=args=>execFileSync('git',args,{encoding:null,stdio:['ignore','pipe','pipe']});
function fakeGit({delta=ADMITTED,missing=null,drift=null,ancestor=true,wrongBase=false,registryMutant=null}={}){
 return(args,{encoding=null}={})=>{
  let value;
  if(args[0]==='rev-parse')value=Buffer.from(args[1]==='HEAD'?candidate:args[1]===E.baseSha+'^{tree}'?(wrongBase?'b'.repeat(40):E.baseTree):args[1]===candidate+'^{tree}'?tree:args[1]);
  else if(args[0]==='merge-base'){if(!ancestor)throw Error('NOT_ANCESTOR');value=Buffer.alloc(0);}
  else if(args[0]==='diff')value=Buffer.from(delta.join('\n'));
  else if(args[0]==='show'){
   const split=args[1].indexOf(':'),sha=args[1].slice(0,split),file=args[1].slice(split+1);
   if(file===missing)throw Error('MISSING');value=sha===E.baseSha?realGit(args):sha===candidate?realGit(['show',P03_MERGE_SHA+':'+file]):fs.readFileSync(file);
   if(registryMutant&&file===c+'P03_CARRIER_REGISTRY_V1.json'){const registry=JSON.parse(value);registryMutant(registry);value=Buffer.from(JSON.stringify(registry,null,2)+'\n');}
   if(file===drift)value=Buffer.concat([value,Buffer.from(' ')]);
  }else throw Error('UNEXPECTED_GIT');return encoding==='utf8'?value.toString():value;
 };
}
test('P03 exact Git-object oracle binds all 34 outputs, 26 registry members and no product increment',()=>{
 const result=verifyP03ContextRestorationPostEvaluationException({git:fakeGit()});
 assert.equal(result.status,'PASS');assert.equal(result.processTask,true);assert.equal(result.productGraphIncrement,0);assert.equal(result.p02Status,'NO_CHANGE');
 assert.equal(result.candidateSha,candidate);assert.equal(result.candidateTree,tree);assert.equal(result.admittedPathDenominator,34);assert.deepEqual(result.changedPaths,ADMITTED);
 assert.equal(result.protectedWipDenominator,268);assert.equal(result.protectedDirtyDenominator,10);assert.notEqual(result.sourcePlanRoles.externalSourcePlanDigest,result.sourcePlanRoles.compiledProgramFileDigest);
});
test('P03 rejects missing extra duplicate wrong-class scope and wrong base ancestry',()=>{
 for(const delta of [ADMITTED.slice(1),[...ADMITTED,'src/main.js'].sort(),[...ADMITTED,ADMITTED[0]].sort(),ADMITTED.map(p=>p.replace('P03_P01_TERMINAL_PREDECESSOR','P03_P03_TERMINAL_PREDECESSOR')).sort()])assert.throws(()=>verifyP03ContextRestorationPostEvaluationException({git:fakeGit({delta})}),/E_P03_EXACT_ADMITTED_DELTA/);
 assert.throws(()=>verifyP03ContextRestorationPostEvaluationException({git:fakeGit({ancestor:false})}),/E_P03_BASE_NOT_ANCESTOR/);
 assert.throws(()=>verifyP03ContextRestorationPostEvaluationException({git:fakeGit({wrongBase:true})}),/E_P03_ADMISSION_BASE/);
});
test('all candidate artifacts and exact complete registry byte identities are mandatory',()=>{
 for(const missing of ADMITTED)assert.throws(()=>verifyP03ContextRestorationPostEvaluationException({git:fakeGit({missing})}),/E_P03_(CANDIDATE_ARTIFACT_MISSING|REQUIRED_ARTIFACT)/);
 for(const drift of [E.authorityPath,E.instancePath,E.admissionPath,E.protectedWipBeforePath,E.predecessorPath,E.noChangePath,E.contractPath,E.outputPlanPath])assert.throws(()=>verifyP03ContextRestorationPostEvaluationException({git:fakeGit({drift})}),/E_P03_CANONICAL_LF/);
 for(const drift of ['scripts/agent-context-restoration.mjs','scripts/brain.mjs','AGENTS.md','.github/workflows/oss-policy.yml'])assert.throws(()=>verifyP03ContextRestorationPostEvaluationException({git:fakeGit({drift})}),/E_P03_CANDIDATE_MEMBER_BYTES/);
 for(const registryMutant of [v=>v.carriers.pop(),v=>v.carriers[0].sha256='0'.repeat(64),v=>v.carriers[0].byteLength++,v=>v.carriers[1]=v.carriers[0],v=>v.currentTreeFallbackAllowed=true,v=>v.excludedDependentCarriers.push('AGENTS.md'),v=>v.byteIdentityRole='BASE_TREE_CONTENTS'])assert.throws(()=>verifyP03ContextRestorationPostEvaluationException({git:fakeGit({registryMutant})}));
});
test('P01 completion remains frozen at exact 87de and P02 no-change bytes do not acquire a new lease',()=>{
 const prior=verifyP01AdmissionPreparationPostEvaluationException({candidateSha:E.baseSha});assert.equal(prior.status,'PASS');assert.equal(prior.candidateSha,E.baseSha);assert.equal(prior.candidateTree,E.baseTree);assert.equal(prior.admittedPathDenominator,28);
 const source=fs.readFileSync('scripts/ops/r24/corrective/post-audit-certification-set.mjs','utf8');assert(source.includes('candidateSha:p03Enabled?P03_CONTEXT_RESTORATION_EXPECTATION.baseSha:resolvedCandidate'));assert(source.includes('...(p03Exception?.admittedPaths??[])'));assert(source.includes('p03ContextRestorationPostEvaluationException:p03Exception'));
 const p02=JSON.parse(fs.readFileSync(E.noChangePath));assert.equal(p02.newLeaseAcquired,false);assert.equal(p02.newPrRequired,false);assert.equal(p02.evaluationSha,E.baseSha);
 for(const item of p02.artifacts)assert.equal(h(Buffer.from(item.rawBase64,'base64')),item.sha256);
 assert.equal(instance.lease.fencingCounter,84);assert.equal(instance.lease.predecessorReleaseDigest,E.predecessorReleaseDigest);
});
test('context contract schema protocol and current CI retain no-authority and full fallback laws',()=>{
 const contract=JSON.parse(fs.readFileSync(E.contractPath)),schema=JSON.parse(fs.readFileSync('docs/architecture/AGENT_HANDOFF_CHECKPOINT_V1.schema.json'));
 assert.equal(contract.contextCache.mutationAuthority,false);assert.equal(contract.contextCache.completionEvidence,false);assert.equal(contract.contextCache.tracker,false);assert.equal(contract.contextCache.cacheCannotSupplyFreshAuthority,true);
 assert.equal(schema.additionalProperties,false);assert.equal(schema.properties.mutationAuthority.const,false);assert.equal(schema.properties.completionEvidence.const,false);assert.equal(schema.properties.readClaim.const,'CALLER_REPORTED_FULL_READS_NOT_INDEPENDENT_EVIDENCE');
 const status=JSON.parse(fs.readFileSync('docs/OPERATIONS/STATUS/AGENT_BOOTSTRAP_STATUS.json')),specBytes=fs.readFileSync(status.activeSpecPath),spec=JSON.parse(specBytes);assert.equal(h(specBytes),status.activeSpecSha256);assert.equal(spec.contextRestoration.fullReadingOrderRetained,true);assert.equal(spec.contextRestoration.freshCallerPinnedRequestRequired,true);assert.equal(spec.contextRestoration.curatedHandoffOverwriteAllowed,false);
 const protocol=fs.readFileSync('docs/AGENT_START_PROTOCOL.md','utf8'),agents=fs.readFileSync('AGENTS.md','utf8'),workflow=fs.readFileSync('.github/workflows/oss-policy.yml','utf8'),historicalWorkflow=realGit(['show',P03_MERGE_SHA+':.github/workflows/oss-policy.yml']).toString('utf8');
 for(const text of ['VALIDATED_CONTEXT_CACHE','FULL_READ_REQUIRED','CALLER_REPORTED_FULL_READS_NOT_INDEPENDENT_EVIDENCE','Network автоматически не','До этой поставки','другом внешнем registry'])assert(protocol.includes(text),text);
 assert(agents.includes('До terminal delivery P03 действует прежний полный протокол'));
 assert(workflow.indexOf('Reject stale context caches')<workflow.indexOf('- run: npm ci --engine-strict'));assert(workflow.includes('run: npm run r24:test-inventory'));assert.equal(historicalWorkflow.split('P03_GOVERNANCE_CHANGE_APPROVALS').length,4);assert.equal(workflow.split('WP603_GOVERNANCE_CHANGE_APPROVALS').length,4);
 const stamp=JSON.parse(fs.readFileSync('docs/OPS/R24/EVIDENCE/ES-R24-P03-CONTEXT-RESTORATION-CLAIM-BINDINGS.json'));assert(!stamp.claimBindings.some(binding=>binding.filePath===c+'C1B_TEST_INVENTORY_V1.json'));
});
