import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  WP507_MAIN_PRODUCT_ADMISSION_EXPECTATION,
  verifyWp507MainProductPostEvaluationException,
} from '../../scripts/ops/r24/corrective/post-audit-certification-set.mjs';

const FINAL_SHA='f507f507f507f507f507f507f507f507f507f507';
const FINAL_TREE='a507a507a507a507a507a507a507a507a507a507';
const read=(file)=>JSON.parse(fs.readFileSync(file,'utf8'));
const operations=read(WP507_MAIN_PRODUCT_ADMISSION_EXPECTATION.instancePath).operations;
const ADMITTED=[...operations.modifyPaths,...operations.createPaths,...operations.deletePaths,...operations.renamePairs.flatMap((pair)=>[pair.from,pair.to])].sort();
const response=(value,encoding)=>{const text=String(value).endsWith('\n')?String(value):`${value}\n`;return encoding==='utf8'?text:Buffer.from(text);};

function fakeGit({changedPaths=ADMITTED,baseTreeDrift=false,missingArtifact=null}={}){
  return (args,{encoding=null}={})=>{
    if(args[0]==='rev-parse'){
      if(args[1]==='HEAD')return response(FINAL_SHA,encoding);
      if(args[1]===`${WP507_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseSha}^{tree}`)return response(baseTreeDrift?'b'.repeat(40):WP507_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseTree,encoding);
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

test('WP507 successor exact admitted delta binds owner gate, fresh lease, protected WIP and all 28 paths',()=>{
  const result=verifyWp507MainProductPostEvaluationException({git:fakeGit()});
  assert.equal(result.status,'PASS');
  assert.equal(result.baseSha,WP507_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseSha);
  assert.equal(result.candidateSha,FINAL_SHA);
  assert.equal(result.candidateTree,FINAL_TREE);
  assert.equal(result.admissionDenominator,1);
  assert.equal(result.admittedPathDenominator,28);
  assert.equal(result.changedPathDenominator,28);
  assert.deepEqual(result.changedPaths,ADMITTED);
  assert.equal(result.gateDecisionDigest,'8006dab30a5ac323b707bd09dc85aa917056f089131cfa1baf79f5e11e6a8724');
  assert.equal(result.protectedWipBeforeDigest,'a5f782d8f6ca7e270ca35b22add08eb28362787f3e95725bf4a091095cbfc629');
  assert.equal(result.protectedWipSnapshotDigest,'cbaee057a4a858d2b8f09837d140ba1019f60b06d4775d0150d128b0a3fae556');
  assert.deepEqual(result.sourcePlanRoles,{externalSourcePlanDigest:'1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a',compiledProgramFileDigest:'da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a',rolesDistinct:true});
});

test('WP507 successor oracle rejects future, omitted and base-drift deltas',()=>{
  assert.throws(()=>verifyWp507MainProductPostEvaluationException({git:fakeGit({changedPaths:[...ADMITTED,'src/main.js'].sort()})}),/E_WP507_EXACT_ADMITTED_DELTA/u);
  assert.throws(()=>verifyWp507MainProductPostEvaluationException({git:fakeGit({changedPaths:ADMITTED.slice(1)})}),/E_WP507_EXACT_ADMITTED_DELTA/u);
  assert.throws(()=>verifyWp507MainProductPostEvaluationException({git:fakeGit({baseTreeDrift:true})}),/E_WP507_ADMISSION_BASE/u);
});

test('WP507 successor oracle requires every semantic and hostile artifact',()=>{
  assert.throws(()=>verifyWp507MainProductPostEvaluationException({git:fakeGit({missingArtifact:'src/core/atlas-product-claim-v1.mjs'})}),/E_WP507_REQUIRED_ARTIFACT/u);
  assert.throws(()=>verifyWp507MainProductPostEvaluationException({git:fakeGit({missingArtifact:'test/contracts/r24-wp507-terminal-carriers.contract.test.mjs'})}),/E_WP507_REQUIRED_ARTIFACT/u);
});

test('WP507 successor admission preserves the historical blocker and uses fresh lease 74',()=>{
  const authority=read(WP507_MAIN_PRODUCT_ADMISSION_EXPECTATION.authorityPath);
  const gate=read(WP507_MAIN_PRODUCT_ADMISSION_EXPECTATION.gateDecisionPath);
  assert.equal(authority.lease.fencingCounter,74);
  assert.equal(authority.lease.predecessorReleaseDigest,'fff4c4d09edb854dfc7852ab4f0ee83ee956e23ecebb497a203b257e44207373');
  assert.equal(gate.historicalDisposition.typedBlockerReceiptDigest,WP507_MAIN_PRODUCT_ADMISSION_EXPECTATION.historicalBlockerDigest);
  assert.equal(gate.historicalDisposition.blockedLeaseReleaseDigest,WP507_MAIN_PRODUCT_ADMISSION_EXPECTATION.historicalLeaseReleaseDigest);
  assert.equal(gate.historicalDisposition.retconned,false);
  assert.equal(gate.historicalDisposition.reusedAdmission,false);
  assert.equal(gate.historicalDisposition.reusedLease,false);
});
