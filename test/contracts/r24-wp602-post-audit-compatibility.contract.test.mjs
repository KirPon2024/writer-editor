import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import {WP602_MAIN_PRODUCT_ADMISSION_EXPECTATION as E,verifyWp602MainProductPostEvaluationException,verifyWp705HistoricalInventoryPostEvaluationException} from '../../scripts/ops/r24/corrective/post-audit-certification-set.mjs';
const FINAL_SHA='f602f602f602f602f602f602f602f602f602f602',FINAL_TREE='a602a602a602a602a602a602a602a602a602a602';
const instance=JSON.parse(fs.readFileSync(E.instancePath));
const ADMITTED=[...instance.operations.modifyPaths,...instance.operations.createPaths].sort();
const response=(value,encoding)=>encoding==='utf8'?String(value)+'\n':Buffer.from(String(value)+'\n');
function fakeGit({changedPaths=ADMITTED,baseTreeDrift=false,missingArtifact=null,byteDrift=null,ancestor=true,registryMutant=null}={}){
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
      // The completed WP602 registry certifies its own immutable tree, not
      // the later P01 workflow/inventory compatibility changes.
      let bytes=execFileSync('git',['show',(sha===E.baseSha?E.baseSha:'dd2e7925715b3a8a16b7b226d8c305371ae431c7')+':'+file],{encoding:null});
      if(registryMutant&&file==='docs/OPS/R24/CORRECTIVE/WP602_CARRIER_REGISTRY_V1.json'){
        const value=JSON.parse(bytes);registryMutant(value);bytes=Buffer.from(JSON.stringify(value,null,2)+'\n');
      }
      if(file===byteDrift)bytes=Buffer.concat([bytes,Buffer.from(' ')]);
      return encoding==='utf8'?bytes.toString():bytes;
    }
    throw new Error('UNEXPECTED_GIT');
  };
}
test('WP602 candidate Git-object oracle binds all 31 admitted paths and the complete 266-worktree baseline',()=>{
  const result=verifyWp602MainProductPostEvaluationException({git:fakeGit()});
  assert.equal(result.status,'PASS');assert.equal(result.candidateSha,FINAL_SHA);assert.equal(result.candidateTree,FINAL_TREE);
  assert.equal(result.admissionDenominator,1);assert.equal(result.admittedPathDenominator,31);assert.deepEqual(result.changedPaths,ADMITTED);
  assert.equal(result.protectedWipDenominator,266);assert.equal(result.protectedDirtyDenominator,10);
  assert.equal(result.protectedWipBeforeDigest,E.protectedWipBeforeDigest);assert.equal(result.protectedWipSnapshotDigest,E.protectedWipSnapshotDigest);
  assert.notEqual(result.sourcePlanRoles.externalSourcePlanDigest,result.sourcePlanRoles.compiledProgramFileDigest);
});
test('WP602 rejects future omitted duplicate misnamed wrong-base and non-descendant candidates',()=>{
  for(const changedPaths of [[...ADMITTED,'src/main.js'].sort(),ADMITTED.slice(1),[...ADMITTED,ADMITTED[0]].sort(),ADMITTED.map(p=>p.replace('WP602_WP705_TERMINAL_PREDECESSOR','WP602_WP602_TERMINAL_PREDECESSOR')).sort()])assert.throws(()=>verifyWp602MainProductPostEvaluationException({git:fakeGit({changedPaths})}),/E_WP602_EXACT_ADMITTED_DELTA/);
  assert.throws(()=>verifyWp602MainProductPostEvaluationException({git:fakeGit({baseTreeDrift:true})}),/E_WP602_ADMISSION_BASE/);
  assert.throws(()=>verifyWp602MainProductPostEvaluationException({git:fakeGit({ancestor:false})}),/E_WP602_BASE_NOT_ANCESTOR/);
});
test('WP602 rejects missing changed or future candidate bytes without ambient fallback',()=>{
  const pinned=[E.authorityPath,E.instancePath,E.admissionPath,E.protectedWipBeforePath,E.sealedSourcePath];
  for(const missingArtifact of pinned)assert.throws(()=>verifyWp602MainProductPostEvaluationException({git:fakeGit({missingArtifact})}),/E_WP602_CANDIDATE_ARTIFACT_MISSING/);
  for(const byteDrift of pinned)assert.throws(()=>verifyWp602MainProductPostEvaluationException({git:fakeGit({byteDrift})}),/E_WP602_CANONICAL_LF/);
  for(const missingArtifact of ADMITTED.filter(p=>!pinned.includes(p)))assert.throws(()=>verifyWp602MainProductPostEvaluationException({git:fakeGit({missingArtifact})}),/E_WP602_REQUIRED_ARTIFACT/);
  for(const byteDrift of ['src/core/proposal-workflow-v1.mjs','test/unit/r24-wp602-proposal-workflow.test.js','.github/workflows/oss-policy.yml'])assert.throws(()=>verifyWp602MainProductPostEvaluationException({git:fakeGit({byteDrift})}),/E_WP602_CANDIDATE_MEMBER_BYTES/);
});
test('WP602 complete 22-member non-recursive registry rejects omissions duplicated paths false hashes and fallback',()=>{
  const mutations=[
    v=>{v.carriers.pop();},v=>{v.carriers[0].sha256='0'.repeat(64);},
    v=>{v.carriers[1]=v.carriers[0];},v=>{v.currentTreeFallbackAllowed=true;},
    v=>{v.excludedDependentCarriers.push('src/core/proposal-workflow-v1.mjs');},
    v=>{v.byteIdentityRole='BASE_TREE_CONTENTS';},
  ];
  for(const registryMutant of mutations)assert.throws(()=>verifyWp602MainProductPostEvaluationException({git:fakeGit({registryMutant})}));
  assert.equal(mutations.length,6);
});
test('WP602 freezes the WP705 historical prefix at its exact completed merge and preserves fence lineage',()=>{
  const result=verifyWp705HistoricalInventoryPostEvaluationException({candidateSha:E.baseSha});
  assert.equal(result.status,'PASS');assert.equal(result.candidateSha,E.baseSha);assert.equal(result.changedPathDenominator,11);assert.equal(result.currentFileCoverage,false);
  const source=fs.readFileSync('scripts/ops/r24/corrective/post-audit-certification-set.mjs','utf8');
  assert(source.includes('candidateSha:wp602Enabled?WP602_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseSha:resolvedCandidate'));
  assert(source.includes('...(wp602Exception?.admittedPaths??[])'));
  assert.equal(instance.lease.fencingCounter,82);assert.equal(instance.lease.wip,1);assert.equal(instance.lease.predecessorReleaseDigest,E.predecessorReleaseDigest);
  assert.equal(instance.operations.renamePairs.length,0);assert.equal(instance.operations.deletePaths.length,0);
});
