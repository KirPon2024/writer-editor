import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';
import {
  WP505_MAIN_PRODUCT_ADMISSION_EXPECTATIONS,
  verifyWp505MainProductPostEvaluationException,
} from '../../scripts/ops/r24/corrective/post-audit-certification-set.mjs';

const FINAL_SHA='f505f505f505f505f505f505f505f505f505f505';
const FINAL_TREE='a505a505a505a505a505a505a505a505a505a505';
const read=(file)=>JSON.parse(fs.readFileSync(file,'utf8'));
const operationPaths=(file)=>{
  const operations=read(file).operations;
  return [...operations.modifyPaths,...operations.createPaths,...operations.deletePaths,...operations.renamePairs.flatMap((pair)=>[pair.from,pair.to])].sort();
};
const V1_PATHS=operationPaths('docs/OPS/R24/CORRECTIVE/WP505_MAIN_PRODUCT_STAGE_INSTANCE_V1.json');
const V2_PATHS=operationPaths('docs/OPS/R24/CORRECTIVE/WP505_MAIN_PRODUCT_STAGE_INSTANCE_V2.json');
const V3_PATHS=operationPaths('docs/OPS/R24/CORRECTIVE/WP505_MAIN_PRODUCT_STAGE_INSTANCE_V3.json');

function response(value,encoding){
  const text=String(value).endsWith('\n')?String(value):`${value}\n`;
  return encoding==='utf8'?text:Buffer.from(text);
}

function fakeGit({v3Paths=V3_PATHS,baseTreeDrift=false,artifactMutant=null,historicalArtifactMutant=null}={}){
  const [v1,v2,v3]=WP505_MAIN_PRODUCT_ADMISSION_EXPECTATIONS;
  return (args,{encoding=null}={})=>{
    if(args[0]==='rev-parse'){
      const revision=args[1];
      if(revision==='HEAD')return response(FINAL_SHA,encoding);
      if(revision===`${v1.baseSha}^{tree}`)return response(baseTreeDrift?'b'.repeat(40):v1.baseTree,encoding);
      if(revision===`${v1.candidateSha}^{tree}`||revision===`${v2.baseSha}^{tree}`)return response(v1.candidateTree,encoding);
      if(revision===`${v2.candidateSha}^{tree}`||revision===`${v3.baseSha}^{tree}`)return response(v2.candidateTree,encoding);
      if(revision===`${FINAL_SHA}^{tree}`)return response(FINAL_TREE,encoding);
      return response(revision.replace(/\^\{tree\}$/u,''),encoding);
    }
    if(args[0]==='merge-base'&&args[1]==='--is-ancestor')return Buffer.alloc(0);
    if(args[0]==='diff'&&args[1]==='--name-only'){
      if(args[2]===`${v1.baseSha}..${v1.candidateSha}`)return response(V1_PATHS.join('\n'),encoding);
      if(args[2]===`${v2.baseSha}..${v2.candidateSha}`)return response(V2_PATHS.join('\n'),encoding);
      if(args[2]===`${v3.baseSha}..${FINAL_SHA}`)return response(v3Paths.join('\n'),encoding);
      throw new Error(`UNEXPECTED_DIFF:${args[2]}`);
    }
    if(args[0]==='show'){
      const separator=args[1].indexOf(':'),revision=args[1].slice(0,separator),artifactPath=args[1].slice(separator+1);
      let bytes;
      if(revision===v2.candidateSha)bytes=execFileSync('git',['show',`${revision}:${artifactPath}`],{encoding:null,maxBuffer:64*1024*1024});
      else if(revision===FINAL_SHA)bytes=fs.readFileSync(artifactPath);
      else throw new Error(`UNEXPECTED_SHOW:${args[1]}`);
      if((revision===FINAL_SHA&&artifactMutant===artifactPath)||(revision===v2.candidateSha&&historicalArtifactMutant===artifactPath))bytes=Buffer.concat([bytes,Buffer.from('\nMUTANT')]);
      return encoding==='utf8'?bytes.toString('utf8'):bytes;
    }
    throw new Error(`UNEXPECTED_GIT:${args.join(' ')}`);
  };
}

test('WP505 exact V1, V2 and V3 deltas form one closed admission chain',()=>{
  const result=verifyWp505MainProductPostEvaluationException({git:fakeGit()});
  assert.equal(result.status,'PASS');
  assert.equal(result.admissionDenominator,3);
  assert.equal(result.v1CandidateSha,'e42e92ba73168b9b8105651729752eec7d2b65ad');
  assert.equal(result.v2CandidateSha,'d6c478c1b68a009e01116077a11892b6bf45daf8');
  assert.equal(result.v1ChangedPathDenominator,25);
  assert.equal(result.v2ChangedPathDenominator,10);
  assert.equal(result.v3ChangedPathDenominator,11);
  assert.equal(result.admittedPathDenominator,40);
  assert.deepEqual(result.sourcePlanRoles,{
    externalSourcePlanDigest:'1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a',
    compiledProgramFileDigest:'da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a',
    rolesDistinct:true,
  });
});

test('WP505 V3 oracle rejects an unadmitted future descendant path',()=>{
  assert.throws(()=>verifyWp505MainProductPostEvaluationException({git:fakeGit({v3Paths:[...V3_PATHS,'src/main.js'].sort()})}),/E_WP505_V3_UNADMITTED_PATH:src\/main\.js/u);
});

test('WP505 oracle rejects exact-base tree drift before interpreting the descendant delta',()=>{
  assert.throws(()=>verifyWp505MainProductPostEvaluationException({git:fakeGit({baseTreeDrift:true})}),/E_WP505_ADMISSION_BASE/u);
});

test('WP505 V2 successor remains bound to its exact historical candidate object',()=>{
  assert.throws(()=>verifyWp505MainProductPostEvaluationException({git:fakeGit({historicalArtifactMutant:'scripts/ops/r24/corrective/post-audit-certification-set.mjs'})}),/E_WP505_V2_SUCCESSOR_ARTIFACT_BINDING/u);
});

test('WP505 V3 successor rejects a current artifact that differs from the candidate Git object',()=>{
  assert.throws(()=>verifyWp505MainProductPostEvaluationException({git:fakeGit({artifactMutant:'scripts/ops/r24/wp504-terminal-verifier.mjs'})}),/E_WP505_V3_SUCCESSOR_ARTIFACT_BINDING/u);
});

test('WP505 first candidate failure binds the exact hosted run and preserves successful independent lanes',()=>{
  const failure=read('docs/OPS/R24/CORRECTIVE/WP505_CANDIDATE_CI_FAILURE_V1.json');
  assert.deepEqual(failure.exactCandidate,{
    sha:'e42e92ba73168b9b8105651729752eec7d2b65ad',
    tree:'fa08a7571bce5f5ea5e90a32c0d57a9915e130a5',
    pullRequest:1808,
    runId:33584273368,
    attempt:1,
    conclusion:'FAILURE',
  });
  assert.equal(failure.causalFailures.length,6);
  assert.equal(failure.derivedFailures.length,2);
  assert.equal(failure.successfulRequiredEvidence.rtkRequiredStatus,'SUCCESS');
  assert.equal(failure.successfulRequiredEvidence.liveRulesetOracleStatus,'SUCCESS');
  assert.equal(failure.programDone,false);
});

test('WP505 second candidate failure binds only the WP504 historical registry oracle defect',()=>{
  const failure=read('docs/OPS/R24/CORRECTIVE/WP505_CANDIDATE_CI_FAILURE_V2.json');
  assert.deepEqual(failure.exactCandidate,{
    sha:'d6c478c1b68a009e01116077a11892b6bf45daf8',
    tree:'6a01627cfdde93525fabba246b09a10a7a07e9fc',
    pullRequest:1808,
    runId:33586007176,
    attempt:1,
    conclusion:'FAILURE',
  });
  assert.equal(failure.causalFailure.jobId,100110181374);
  assert.equal(failure.causalFailure.code,'E_WP504_V3_CARRIER_REGISTRY');
  assert.equal(failure.derivedFailures.length,2);
  assert.equal(failure.rootCause.registryGitObjectSha,'4f484b7ddb0ad2fa78614f930b4a8d8ded60201e');
  assert.equal(failure.rootCause.registryGitObjectTree,'baa79829b5e2363845e826c507cda817e9c4b1f8');
  assert.equal(failure.successfulRequiredEvidence.rtkRequiredStatus,'SUCCESS');
  assert.equal(failure.successfulRequiredEvidence.liveRulesetOracleStatus,'SUCCESS');
  assert.equal(failure.programDone,false);
});
