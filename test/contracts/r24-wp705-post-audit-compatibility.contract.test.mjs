import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import {WP705_MAIN_PRODUCT_ADMISSION_EXPECTATION as E,verifyWp705MainProductPostEvaluationException,verifyWp704EnvironmentRegistrationPostEvaluationException} from '../../scripts/ops/r24/corrective/post-audit-certification-set.mjs';
const FINAL_SHA='f705f705f705f705f705f705f705f705f705f705',FINAL_TREE='a705a705a705a705a705a705a705a705a705a705';
const instance=JSON.parse(fs.readFileSync(E.instancePath));
const ADMITTED=[...instance.operations.modifyPaths,...instance.operations.createPaths].sort();
const response=(value,encoding)=>encoding==='utf8'?String(value)+'\n':Buffer.from(String(value)+'\n');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function fakeGit({changedPaths=ADMITTED,baseTreeDrift=false,missingArtifact=null,byteDrift=null,ancestor=true,alter=null}={}){
  return(args,{encoding=null}={})=>{
    if(args[0]==='rev-parse'){
      if(args[1]==='HEAD')return response(FINAL_SHA,encoding);
      if(args[1]===E.baseSha+'^{tree}')return response(baseTreeDrift?'b'.repeat(40):E.baseTree,encoding);
      if(args[1]===FINAL_SHA+'^{tree}')return response(FINAL_TREE,encoding);
      return response(args[1],encoding);
    }
    if(args[0]==='merge-base'){if(!ancestor)throw new Error('NO_ANCESTRY');return Buffer.alloc(0);}
    if(args[0]==='diff')return response(changedPaths.join('\n'),encoding);
    if(args[0]==='show'){
      const split=args[1].indexOf(':'),sha=args[1].slice(0,split),file=args[1].slice(split+1);
      if(file===missingArtifact)throw new Error('MISSING');
      let bytes=sha===E.baseSha?execFileSync('git',args,{encoding:null}):fs.readFileSync(file);
      if(file===byteDrift)bytes=Buffer.concat([bytes,Buffer.from(' ')]);
      if(alter&&file===alter.path){const value=JSON.parse(bytes);alter.mutate(value);bytes=Buffer.from(JSON.stringify(value,null,2)+'\n');}
      return encoding==='utf8'?bytes.toString():bytes;
    }
    throw new Error('UNEXPECTED_GIT');
  };
}
test('WP705 candidate object oracle binds 38 paths and the complete corrected protected-WIP denominator',()=>{
  const r=verifyWp705MainProductPostEvaluationException({git:fakeGit()});
  assert.equal(r.status,'PASS');assert.equal(r.candidateSha,FINAL_SHA);assert.equal(r.candidateTree,FINAL_TREE);
  assert.equal(r.admissionDenominator,1);assert.equal(r.preservedHistoricalAdmissionDenominator,1);
  assert.equal(r.admittedPathDenominator,38);assert.deepEqual(r.changedPaths,ADMITTED);
  assert.equal(r.protectedWipDenominator,265);assert.equal(r.protectedDirtyDenominator,10);
  assert.equal(r.unrelatedDirtyDenominator,8);assert.equal(r.frozenOwnedDirtyDenominator,2);
  assert.equal(r.protectedWipBeforeDigest,E.correctionProtectedWipBeforeDigest);assert.equal(r.protectedWipSnapshotDigest,E.correctionProtectedWipSnapshotDigest);
  assert.equal(r.correctionDigest,E.correctionDigest);assert.notEqual(r.sourcePlanRoles.externalSourcePlanDigest,r.sourcePlanRoles.compiledProgramFileDigest);
});
test('WP705 rejects omitted duplicate future wrong-base non-descendant and the exact mistaken predecessor path',()=>{
  const correct='docs/OPS/R24/CORRECTIVE/WP705_WP704_TERMINAL_PREDECESSOR_V1.json',wrong='docs/OPS/R24/CORRECTIVE/WP705_WP705_TERMINAL_PREDECESSOR_V1.json';
  assert(ADMITTED.includes(correct));assert(!ADMITTED.includes(wrong));
  for(const changedPaths of [[...ADMITTED,'src/main.js'].sort(),ADMITTED.slice(1),[...ADMITTED,ADMITTED[0]].sort(),ADMITTED.map(p=>p===correct?wrong:p).sort()])assert.throws(()=>verifyWp705MainProductPostEvaluationException({git:fakeGit({changedPaths})}),/E_WP705_EXACT_ADMITTED_DELTA/);
  assert.throws(()=>verifyWp705MainProductPostEvaluationException({git:fakeGit({baseTreeDrift:true})}),/E_WP705_ADMISSION_BASE/);
  assert.throws(()=>verifyWp705MainProductPostEvaluationException({git:fakeGit({ancestor:false})}),/E_WP705_BASE_NOT_ANCESTOR/);
});
test('WP705 candidate oracle rejects every missing create and modified pinned proof without ambient fallback',()=>{
  for(const missingArtifact of instance.operations.createPaths)assert.throws(()=>verifyWp705MainProductPostEvaluationException({git:fakeGit({missingArtifact})}),/E_WP705_|MISSING/);
  for(const byteDrift of [E.authorityPath,E.instancePath,E.admissionPath,E.protectedWipBeforePath,E.sealedSourcePath,E.correctionPath])assert.throws(()=>verifyWp705MainProductPostEvaluationException({git:fakeGit({byteDrift})}),byteDrift===E.sealedSourcePath?/E_WP705_PRESERVED_HISTORY_DIGEST:docs\/OPS\/R24\/CORRECTIVE\/WP705_SEALED_SOURCE_READ_RECEIPT_V1\.json/:/E_WP705_CANONICAL_LF/);
});
test('WP705 pinned recovery bytes reject retroactive approval, WIP drift, changed historical identity and same-node scope widening',()=>{
  const mutations=[
    c=>c.historicalDisposition.retroactiveAdmissionClaim=true,c=>c.worktreeTransition.frozenOriginalHasExecutionLease=true,
    c=>c.worktreeTransition.secondWriter=true,c=>c.worktreeTransition.baseSha='0'.repeat(40),
    c=>c.protectedWip.correctionBefore.entries.pop(),c=>c.protectedWip.afterIsolation.entries[0].head='0'.repeat(40),
    c=>c.exactOwnedByteCopy.copiedFiles.pop(),c=>c.authorityBasis.semanticDeviation=true,
    c=>c.preventRecurrence.expectedPredecessorPath=c.preventRecurrence.forbiddenMistakenPath,
    c=>c.observation.value.actualFiles[0].sha256='0'.repeat(64)
  ];
  for(const mutate of mutations)assert.throws(()=>verifyWp705MainProductPostEvaluationException({git:fakeGit({alter:{path:E.correctionPath,mutate}})}),/E_WP705_ADMISSION_CARRIER_DIGEST/);
  assert.equal(mutations.length,10);
  const historical='docs/OPS/R24/CORRECTIVE/WP705_MAIN_PRODUCT_STAGE_INSTANCE_V1.json';
  assert.throws(()=>verifyWp705MainProductPostEvaluationException({git:fakeGit({alter:{path:historical,mutate:i=>{i.operations.createPaths=i.operations.createPaths.map(p=>p.replace('WP705_WP705_TERMINAL','WP705_WP704_TERMINAL'));}}})}),/E_WP705_PRESERVED_HISTORY_DIGEST/);
});
test('WP705 freezes the complete WP704 environment-registration prefix at its exact protected merge',()=>{
  const r=verifyWp704EnvironmentRegistrationPostEvaluationException({candidateSha:E.baseSha});
  assert.equal(r.status,'PASS');assert.equal(r.candidateSha,E.baseSha);
  const source=fs.readFileSync('scripts/ops/r24/corrective/post-audit-certification-set.mjs','utf8');
  assert(source.includes('candidateSha:wp705Enabled?WP705_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseSha:resolvedCandidate'));
  assert(source.includes('...(wp705Exception?.admittedPaths??[])'));
  assert.equal(instance.lease.fencingCounter,81);assert.equal(instance.lease.wip,1);assert.equal(instance.lease.predecessorReleaseDigest,E.predecessorReleaseDigest);
  assert.equal(instance.operations.renamePairs.length,0);assert.equal(instance.operations.deletePaths.length,0);
});
test('WP705 V1 observation is preserved and the current admission names its predecessor literally',()=>{
  const c=JSON.parse(fs.readFileSync(E.correctionPath)),old=JSON.parse(fs.readFileSync('docs/OPS/R24/CORRECTIVE/WP705_MAIN_PRODUCT_STAGE_INSTANCE_V1.json'));
  assert.equal(hash(Buffer.from(JSON.stringify(c.observation.value,null,2)+'\n')),c.observation.sha256);
  assert(old.operations.createPaths.includes(c.observation.value.mistakenV1DeclaredPath));
  assert(!old.operations.createPaths.includes(c.observation.value.unadmittedPath));
  assert(instance.operations.createPaths.includes(c.observation.value.unadmittedPath));
  assert(!instance.operations.createPaths.includes(c.observation.value.mistakenV1DeclaredPath));
  assert.equal(c.exactOwnedByteCopy.copiedDenominator,16);assert.equal(c.protectedWip.frozenOriginalWp703ExactFileDenominator,8);
  assert.equal(c.historicalDisposition.retroactiveAdmissionClaim,false);
});
