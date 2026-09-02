import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import {
  WP600_MAIN_PRODUCT_ADMISSION_EXPECTATION,
  verifyWp600MainProductPostEvaluationException,
  verifyWp702Wp504HistoricalSurfacePostEvaluationException,
} from '../../scripts/ops/r24/corrective/post-audit-certification-set.mjs';

const FINAL_SHA='f702f702f702f702f702f702f702f702f702f702';
const FINAL_TREE='a702a702a702a702a702a702a702a702a702a702';
const read=(file)=>JSON.parse(fs.readFileSync(file,'utf8'));
const operations=read(WP600_MAIN_PRODUCT_ADMISSION_EXPECTATION.instancePath).operations;
const ADMITTED=[...operations.modifyPaths,...operations.createPaths,...operations.deletePaths,...operations.renamePairs.flatMap((pair)=>[pair.from,pair.to])].sort();
const response=(value,encoding)=>{const text=String(value).endsWith('\n')?String(value):`${value}\n`;return encoding==='utf8'?text:Buffer.from(text);};

function fakeGit({changedPaths=ADMITTED,baseTreeDrift=false,missingArtifact=null}={}){
  return (args,{encoding=null}={})=>{
    if(args[0]==='rev-parse'){
      if(args[1]==='HEAD')return response(FINAL_SHA,encoding);
      if(args[1]===`${WP600_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseSha}^{tree}`)return response(baseTreeDrift?'b'.repeat(40):WP600_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseTree,encoding);
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

test('WP600 exact admitted delta binds lease 77, fresh protected WIP and all 30 paths',()=>{
  const result=verifyWp600MainProductPostEvaluationException({git:fakeGit()});
  assert.equal(result.status,'PASS');
  assert.equal(result.baseSha,WP600_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseSha);
  assert.equal(result.candidateSha,FINAL_SHA);
  assert.equal(result.candidateTree,FINAL_TREE);
  assert.equal(result.admissionDenominator,1);
  assert.equal(result.admittedPathDenominator,30);
  assert.equal(result.changedPathDenominator,30);
  assert.deepEqual(result.changedPaths,ADMITTED);
  assert.equal(result.protectedWipBeforeDigest,'5c9e3c24de9dcc056b8f43de09e2fbe92b01b5252824e0e4f1d076d5fa3b656e');
  assert.equal(result.protectedWipSnapshotDigest,'2da860da650701e9c137ae4d57e6f7e3699d3fcb5160f72df56c8d6b58c79e11');
  assert.deepEqual(result.sourcePlanRoles,{externalSourcePlanDigest:'1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a',compiledProgramFileDigest:'da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a',rolesDistinct:true});
});

test('WP600 historical WP702 proof uses its frozen merge inventory, not new ambient inventory bytes',()=>{
  const base=WP600_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseSha;
  const future='f'.repeat(40);
  const git=(args,options={})=>{
    if(args[0]==='rev-parse'&&args[1]===future)return options.encoding==='utf8'?`${future}\n`:Buffer.from(`${future}\n`);
    if(args[0]==='merge-base'&&args[2]===base&&args[3]===future)return Buffer.alloc(0);
    return execFileSync('git',args,{encoding:options.encoding??null,maxBuffer:16*1024*1024});
  };
  const result=verifyWp702Wp504HistoricalSurfacePostEvaluationException({candidateSha:future,git});
  assert.equal(result.status,'PASS');
  assert.equal(result.requestedCandidateSha,future);
  assert.equal(result.candidateSha,base);
  assert.equal(result.scope,'HISTORICAL_PREFIX_ONLY_SUCCESSORS_REQUIRE_OWN_ADMISSION');
  assert.equal(result.inventoryFileDenominator,1327);
});

test('WP600 post-evaluation oracle rejects future, omitted and base-drift deltas',()=>{
  assert.throws(()=>verifyWp600MainProductPostEvaluationException({git:fakeGit({changedPaths:[...ADMITTED,'src/main.js'].sort()})}),/E_WP600_EXACT_ADMITTED_DELTA/u);
  assert.throws(()=>verifyWp600MainProductPostEvaluationException({git:fakeGit({changedPaths:ADMITTED.slice(1)})}),/E_WP600_EXACT_ADMITTED_DELTA/u);
  assert.throws(()=>verifyWp600MainProductPostEvaluationException({git:fakeGit({baseTreeDrift:true})}),/E_WP600_ADMISSION_BASE/u);
});

test('WP600 post-evaluation oracle requires every semantic and hostile artifact',()=>{
  assert.throws(()=>verifyWp600MainProductPostEvaluationException({git:fakeGit({missingArtifact:'src/core/frozen-feature-spec-query-ir-v1.mjs'})}),/E_WP600_REQUIRED_ARTIFACT/u);
  assert.throws(()=>verifyWp600MainProductPostEvaluationException({git:fakeGit({missingArtifact:'test/contracts/r24-wp600-terminal-carriers.contract.test.mjs'})}),/E_WP600_REQUIRED_ARTIFACT/u);
});

test('WP600 admission uses fresh lease 77 and distinct source-plan roles',()=>{
  const authority=read(WP600_MAIN_PRODUCT_ADMISSION_EXPECTATION.authorityPath);
  const instance=read(WP600_MAIN_PRODUCT_ADMISSION_EXPECTATION.instancePath);
  assert.equal(authority.lease.fencingCounter,77);
  assert.equal(authority.lease.status,'ACTIVE');
  assert.equal(authority.lease.wip,1);
  assert.equal(authority.lease.predecessorReleaseDigest,'89bdd6d6a56c859792bb0cb77d1aa43cd6552807b658a5a759f0838d5b3a2c50');
  assert.equal(instance.externalSourcePlanDigest,'1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a');
  assert.equal(instance.compiledProgramFileDigest,'da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a');
  assert.notEqual(instance.externalSourcePlanDigest,instance.compiledProgramFileDigest);
});
