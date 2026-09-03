import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import {WP704_MAIN_PRODUCT_ADMISSION_EXPECTATION as E,verifyWp704MainProductPostEvaluationException,verifyWp601HistoricalInventoryAnchorRepairPostEvaluationException} from '../../scripts/ops/r24/corrective/post-audit-certification-set.mjs';
const FINAL_SHA='f704f704f704f704f704f704f704f704f704f704',FINAL_TREE='a704a704a704a704a704a704a704a704a704a704';
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
test('WP704 candidate Git-object oracle binds all 35 admitted paths and the complete 263-worktree baseline',()=>{
  const result=verifyWp704MainProductPostEvaluationException({git:fakeGit()});
  assert.equal(result.status,'PASS');assert.equal(result.candidateSha,FINAL_SHA);assert.equal(result.candidateTree,FINAL_TREE);
  assert.equal(result.admissionDenominator,1);assert.equal(result.admittedPathDenominator,35);assert.deepEqual(result.changedPaths,ADMITTED);
  assert.equal(result.protectedWipDenominator,263);assert.equal(result.protectedDirtyDenominator,9);
  assert.equal(result.protectedWipBeforeDigest,E.protectedWipBeforeDigest);assert.equal(result.protectedWipSnapshotDigest,E.protectedWipSnapshotDigest);
  assert.notEqual(result.sourcePlanRoles.externalSourcePlanDigest,result.sourcePlanRoles.compiledProgramFileDigest);
});
test('WP704 rejects future omitted duplicate misnamed wrong-base and non-descendant candidates',()=>{
  for(const changedPaths of [[...ADMITTED,'src/main.js'].sort(),ADMITTED.slice(1),[...ADMITTED,ADMITTED[0]].sort(),ADMITTED.map(p=>p.replace('WP704_WP601_TERMINAL_PREDECESSOR','WP704_WP704_TERMINAL_PREDECESSOR')).sort()])assert.throws(()=>verifyWp704MainProductPostEvaluationException({git:fakeGit({changedPaths})}),/E_WP704_EXACT_ADMITTED_DELTA/);
  assert.throws(()=>verifyWp704MainProductPostEvaluationException({git:fakeGit({baseTreeDrift:true})}),/E_WP704_ADMISSION_BASE/);
  assert.throws(()=>verifyWp704MainProductPostEvaluationException({git:fakeGit({ancestor:false})}),/E_WP704_BASE_NOT_ANCESTOR/);
});
test('WP704 rejects missing or changed candidate authority and any missing admitted create without ambient fallback',()=>{
  for(const missingArtifact of [E.authorityPath,E.instancePath,E.admissionPath,E.protectedWipBeforePath,E.sealedSourcePath])assert.throws(()=>verifyWp704MainProductPostEvaluationException({git:fakeGit({missingArtifact})}),/E_WP704_CANDIDATE_ARTIFACT_MISSING/);
  for(const byteDrift of [E.authorityPath,E.instancePath,E.admissionPath,E.protectedWipBeforePath,E.sealedSourcePath])assert.throws(()=>verifyWp704MainProductPostEvaluationException({git:fakeGit({byteDrift})}),/E_WP704_CANONICAL_LF/);
  for(const missingArtifact of instance.operations.createPaths.filter(p=>![E.authorityPath,E.instancePath,E.admissionPath,E.protectedWipBeforePath,E.sealedSourcePath].includes(p)))assert.throws(()=>verifyWp704MainProductPostEvaluationException({git:fakeGit({missingArtifact})}),/E_WP704_REQUIRED_ARTIFACT/);
});
test('WP704 freezes the WP601 anchor-repair prefix at its exact completed merge and preserves lease lineage',()=>{
  const result=verifyWp601HistoricalInventoryAnchorRepairPostEvaluationException({candidateSha:E.baseSha});
  assert.equal(result.status,'PASS');assert.equal(result.candidateSha,E.baseSha);assert.equal(result.changedPathDenominator,9);
  const source=fs.readFileSync('scripts/ops/r24/corrective/post-audit-certification-set.mjs','utf8');
  assert(source.includes('candidateSha:wp704Enabled?WP704_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseSha:resolvedCandidate'));
  assert(source.includes('...(wp704Exception?.admittedPaths??[])'));
  assert.equal(instance.lease.fencingCounter,80);assert.equal(instance.lease.wip,1);assert.equal(instance.lease.predecessorReleaseDigest,E.predecessorReleaseDigest);
  assert.equal(instance.operations.renamePairs.length,0);assert.equal(instance.operations.deletePaths.length,0);
});
