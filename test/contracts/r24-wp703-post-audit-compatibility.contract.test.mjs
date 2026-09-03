import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import {WP703_MAIN_PRODUCT_ADMISSION_EXPECTATION as E,verifyWp703MainProductPostEvaluationException,verifyWp600MainProductPostEvaluationException} from '../../scripts/ops/r24/corrective/post-audit-certification-set.mjs';
const FINAL_SHA='f703f703f703f703f703f703f703f703f703f703',FINAL_TREE='a703a703a703a703a703a703a703a703a703a703';
const instance=JSON.parse(fs.readFileSync(E.instancePath));
const ADMITTED=[...instance.operations.modifyPaths,...instance.operations.createPaths].sort();
const response=(value,encoding)=>encoding==='utf8'?String(value)+'\n':Buffer.from(String(value)+'\n');
function fakeGit({changedPaths=ADMITTED,baseTreeDrift=false,missingArtifact=null,byteDrift=null,ancestor=true}={}){
  return(args,{encoding=null}={})=>{
    if(args[0]==='rev-parse'){
      if(args[1]==='HEAD')return response(FINAL_SHA,encoding);
      if(args[1]===`${E.baseSha}^{tree}`)return response(baseTreeDrift?'b'.repeat(40):E.baseTree,encoding);
      if(args[1]===`${FINAL_SHA}^{tree}`)return response(FINAL_TREE,encoding);
      return response(args[1],encoding);
    }
    if(args[0]==='merge-base'){if(!ancestor)throw new Error('NO_ANCESTRY');return Buffer.alloc(0);}
    if(args[0]==='diff')return response(changedPaths.join('\n'),encoding);
    if(args[0]==='show'){
      const split=args[1].indexOf(':'),sha=args[1].slice(0,split),file=args[1].slice(split+1);
      if(file===missingArtifact)throw new Error('MISSING');
      let bytes=sha===E.baseSha?execFileSync('git',args,{encoding:null}):fs.readFileSync(file);
      if(file===byteDrift)bytes=Buffer.concat([bytes,Buffer.from(' ')]);
      return encoding==='utf8'?bytes.toString():bytes;
    }
    throw new Error('UNEXPECTED_GIT');
  };
}
test('WP703 candidate Git-object oracle binds V2 corrected 34-path scope and frozen historical evidence',()=>{
  const result=verifyWp703MainProductPostEvaluationException({git:fakeGit()});
  assert.equal(result.status,'PASS');assert.equal(result.candidateSha,FINAL_SHA);assert.equal(result.candidateTree,FINAL_TREE);
  assert.equal(result.admissionDenominator,1);assert.equal(result.preservedHistoricalAdmissionDenominator,1);
  assert.equal(result.admittedPathDenominator,34);assert.deepEqual(result.changedPaths,ADMITTED);
  assert.equal(result.protectedWipDenominator,261);assert.equal(result.unrelatedDirtyDenominator,8);assert.equal(result.frozenOwnedDirtyDenominator,1);
  assert.equal(result.protectedWipBeforeDigest,E.protectedWipBeforeDigest);assert.equal(result.protectedWipSnapshotDigest,E.protectedWipSnapshotDigest);
  assert.notEqual(result.sourcePlanRoles.externalSourcePlanDigest,result.sourcePlanRoles.compiledProgramFileDigest);
});
test('WP703 rejects future omitted duplicate misnamed and wrong-base candidate deltas',()=>{
  for(const changedPaths of [[...ADMITTED,'src/main.js'].sort(),ADMITTED.slice(1),[...ADMITTED,ADMITTED[0]].sort(),ADMITTED.map(p=>p.replace('WP703_WP600_TERMINAL_PREDECESSOR','WP703_WP703_TERMINAL_PREDECESSOR')).sort()])assert.throws(()=>verifyWp703MainProductPostEvaluationException({git:fakeGit({changedPaths})}),/E_WP703_EXACT_ADMITTED_DELTA/);
  assert.throws(()=>verifyWp703MainProductPostEvaluationException({git:fakeGit({baseTreeDrift:true})}),/E_WP703_ADMISSION_BASE/);
  assert.throws(()=>verifyWp703MainProductPostEvaluationException({git:fakeGit({ancestor:false})}),/E_WP703_BASE_NOT_ANCESTOR/);
});
test('WP703 rejects missing or changed candidate authority and preserved predecessor bytes without ambient fallback',()=>{
  for(const missingArtifact of [E.authorityPath,E.instancePath,E.admissionPath,E.correctionPath])assert.throws(()=>verifyWp703MainProductPostEvaluationException({git:fakeGit({missingArtifact})}),/E_WP703_CANDIDATE_ARTIFACT_MISSING/);
  for(const byteDrift of [E.authorityPath,E.instancePath,E.admissionPath,E.correctionPath])assert.throws(()=>verifyWp703MainProductPostEvaluationException({git:fakeGit({byteDrift})}),/E_WP703_CANONICAL_LF/);
  assert.throws(()=>verifyWp703MainProductPostEvaluationException({git:fakeGit({byteDrift:'docs/OPS/R24/CORRECTIVE/WP703_WP600_TERMINAL_PREDECESSOR_V1.json'})}),/E_WP703_PRESERVED_HISTORY_DIGEST/);
  for(const missingArtifact of ['src/core/docx-profile-v1.mjs','test/contracts/r24-wp703-terminal-carriers.contract.test.mjs'])assert.throws(()=>verifyWp703MainProductPostEvaluationException({git:fakeGit({missingArtifact})}),/E_WP703_REQUIRED_ARTIFACT/);
});
test('WP703 replays the completed WP600 prefix at its exact merge rather than future candidate inventory',()=>{
  const result=verifyWp600MainProductPostEvaluationException({candidateSha:E.baseSha});
  assert.equal(result.status,'PASS');assert.equal(result.candidateSha,'48dfd205f3d368e2b8035210fa15037cc2ed4af9');assert.equal(result.changedPathDenominator,30);
  const source=fs.readFileSync('scripts/ops/r24/corrective/post-audit-certification-set.mjs','utf8');
  assert(source.includes('candidateSha:wp703Enabled?WP703_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseSha:resolvedCandidate'));
  assert(source.includes('...(wp703Exception?.admittedPaths??[])'));
});
test('WP703 corrected admission preserves lease 78 and does not repurpose the V1 historical path label',()=>{
  assert.equal(instance.lease.fencingCounter,78);assert.equal(instance.lease.wip,1);
  assert.equal(instance.lease.predecessorReleaseDigest,'eee881e38c39fdabfac38f9d512a762d834544c2371e1c50e874c5b4d0afd6c0');
  const old=JSON.parse(fs.readFileSync('docs/OPS/R24/CORRECTIVE/WP703_MAIN_PRODUCT_STAGE_INSTANCE_V1.json'));
  assert(old.operations.createPaths.includes('docs/OPS/R24/CORRECTIVE/WP703_WP703_TERMINAL_PREDECESSOR_V1.json'));
  assert(!instance.operations.createPaths.includes('docs/OPS/R24/CORRECTIVE/WP703_WP703_TERMINAL_PREDECESSOR_V1.json'));
  assert(instance.operations.createPaths.includes('docs/OPS/R24/CORRECTIVE/WP703_WP600_TERMINAL_PREDECESSOR_V1.json'));
});
