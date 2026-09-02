import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  WP701_MAIN_PRODUCT_ADMISSION_EXPECTATION,
  verifyWp701MainProductPostEvaluationException,
} from '../../scripts/ops/r24/corrective/post-audit-certification-set.mjs';

const FINAL_SHA='f701f701f701f701f701f701f701f701f701f701';
const FINAL_TREE='a701a701a701a701a701a701a701a701a701a701';
const read=(file)=>JSON.parse(fs.readFileSync(file,'utf8'));
const operations=read(WP701_MAIN_PRODUCT_ADMISSION_EXPECTATION.instancePath).operations;
const ADMITTED=[...operations.modifyPaths,...operations.createPaths,...operations.deletePaths,...operations.renamePairs.flatMap((pair)=>[pair.from,pair.to])].sort();
const response=(value,encoding)=>{const text=String(value).endsWith('\n')?String(value):`${value}\n`;return encoding==='utf8'?text:Buffer.from(text);};

function fakeGit({changedPaths=ADMITTED,baseTreeDrift=false,missingArtifact=null}={}){
  return (args,{encoding=null}={})=>{
    if(args[0]==='rev-parse'){
      if(args[1]==='HEAD')return response(FINAL_SHA,encoding);
      if(args[1]===`${WP701_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseSha}^{tree}`)return response(baseTreeDrift?'b'.repeat(40):WP701_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseTree,encoding);
      if(args[1]===`${FINAL_SHA}^{tree}`)return response(FINAL_TREE,encoding);
      return response(args[1].replace(/\^\{tree\}$/u,''),encoding);
    }
    if(args[0]==='merge-base'&&args[1]==='--is-ancestor')return Buffer.alloc(0);
    if(args[0]==='diff'&&args[1]==='--name-only')return response(changedPaths.join('\n'),encoding);
    if(args[0]==='show'){
      const separator=args[1].indexOf(':'),artifactPath=args[1].slice(separator+1);
      if(artifactPath===missingArtifact)throw new Error('MISSING');
      const bytes=fs.readFileSync(artifactPath);
      return encoding==='utf8'?bytes.toString('utf8'):bytes;
    }
    throw new Error(`UNEXPECTED_GIT:${args.join(' ')}`);
  };
}

test('WP701 exact admitted delta binds lease 75, fresh protected WIP and all 28 paths',()=>{
  const result=verifyWp701MainProductPostEvaluationException({git:fakeGit()});
  assert.equal(result.status,'PASS');
  assert.equal(result.baseSha,WP701_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseSha);
  assert.equal(result.candidateSha,FINAL_SHA);
  assert.equal(result.candidateTree,FINAL_TREE);
  assert.equal(result.admissionDenominator,1);
  assert.equal(result.admittedPathDenominator,28);
  assert.equal(result.changedPathDenominator,28);
  assert.deepEqual(result.changedPaths,ADMITTED);
  assert.equal(result.protectedWipBeforeDigest,'1f412eea6efcbd6ea4dafbbfee6769740e775cdaab4cbb08a82b3ef3498bbdad');
  assert.equal(result.protectedWipSnapshotDigest,'91d03b10e27f849e19cbe8bb68ccedff270e3a63ca1196a36a330a1c01f031f4');
  assert.deepEqual(result.sourcePlanRoles,{externalSourcePlanDigest:'1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a',compiledProgramFileDigest:'da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a',rolesDistinct:true});
});

test('WP701 post-evaluation oracle rejects future, omitted and base-drift deltas',()=>{
  assert.throws(()=>verifyWp701MainProductPostEvaluationException({git:fakeGit({changedPaths:[...ADMITTED,'src/main.js'].sort()})}),/E_WP701_EXACT_ADMITTED_DELTA/u);
  assert.throws(()=>verifyWp701MainProductPostEvaluationException({git:fakeGit({changedPaths:ADMITTED.slice(1)})}),/E_WP701_EXACT_ADMITTED_DELTA/u);
  assert.throws(()=>verifyWp701MainProductPostEvaluationException({git:fakeGit({baseTreeDrift:true})}),/E_WP701_ADMISSION_BASE/u);
});

test('WP701 post-evaluation oracle requires every semantic and hostile artifact',()=>{
  assert.throws(()=>verifyWp701MainProductPostEvaluationException({git:fakeGit({missingArtifact:'src/core/parser-quarantine-v1.mjs'})}),/E_WP701_REQUIRED_ARTIFACT/u);
  assert.throws(()=>verifyWp701MainProductPostEvaluationException({git:fakeGit({missingArtifact:'test/contracts/r24-wp701-terminal-carriers.contract.test.mjs'})}),/E_WP701_REQUIRED_ARTIFACT/u);
});

test('WP701 admission uses fresh lease 75 and distinct source-plan roles',()=>{
  const authority=read(WP701_MAIN_PRODUCT_ADMISSION_EXPECTATION.authorityPath);
  const instance=read(WP701_MAIN_PRODUCT_ADMISSION_EXPECTATION.instancePath);
  assert.equal(authority.lease.fencingCounter,75);
  assert.equal(authority.lease.status,'ACTIVE');
  assert.equal(authority.lease.wip,1);
  assert.equal(authority.lease.predecessorReleaseDigest,'e018bd09360a1fda8981f8681f1869f50f625b668f835b289e0ec1398792e658');
  assert.equal(instance.externalSourcePlanDigest,'1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a');
  assert.equal(instance.compiledProgramFileDigest,'da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a');
  assert.notEqual(instance.externalSourcePlanDigest,instance.compiledProgramFileDigest);
});
