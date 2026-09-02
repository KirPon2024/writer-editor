import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  WP506_MAIN_PRODUCT_ADMISSION_EXPECTATION,
  verifyWp506MainProductPostEvaluationException,
} from '../../scripts/ops/r24/corrective/post-audit-certification-set.mjs';

const FINAL_SHA='f506f506f506f506f506f506f506f506f506f506';
const FINAL_TREE='a506a506a506a506a506a506a506a506a506a506';
const read=(file)=>JSON.parse(fs.readFileSync(file,'utf8'));
const operations=read(WP506_MAIN_PRODUCT_ADMISSION_EXPECTATION.instancePath).operations;
const ADMITTED=[...operations.modifyPaths,...operations.createPaths,...operations.deletePaths,...operations.renamePairs.flatMap((pair)=>[pair.from,pair.to])].sort();
const response=(value,encoding)=>{const text=String(value).endsWith('\n')?String(value):`${value}\n`;return encoding==='utf8'?text:Buffer.from(text);};

function fakeGit({changedPaths=ADMITTED,baseTreeDrift=false,missingArtifact=null}={}){
  return (args,{encoding=null}={})=>{
    if(args[0]==='rev-parse'){
      if(args[1]==='HEAD')return response(FINAL_SHA,encoding);
      if(args[1]===`${WP506_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseSha}^{tree}`)return response(baseTreeDrift?'b'.repeat(40):WP506_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseTree,encoding);
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

test('WP506 exact admitted delta extends the post-evaluation chain without accepting unrelated descendants',()=>{
  const result=verifyWp506MainProductPostEvaluationException({git:fakeGit()});
  assert.equal(result.status,'PASS');
  assert.equal(result.baseSha,'d8e577b0fd74b376e34f9b313475a0d4bc7c63c8');
  assert.equal(result.candidateSha,FINAL_SHA);
  assert.equal(result.candidateTree,FINAL_TREE);
  assert.equal(result.admissionDenominator,1);
  assert.equal(result.admittedPathDenominator,27);
  assert.equal(result.changedPathDenominator,27);
  assert.deepEqual(result.changedPaths,ADMITTED);
  assert.deepEqual(result.sourcePlanRoles,{externalSourcePlanDigest:'1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a',compiledProgramFileDigest:'da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a',rolesDistinct:true});
});

test('WP506 oracle rejects an unadmitted future descendant path',()=>{
  assert.throws(()=>verifyWp506MainProductPostEvaluationException({git:fakeGit({changedPaths:[...ADMITTED,'src/main.js'].sort()})}),/E_WP506_EXACT_ADMITTED_DELTA/u);
});

test('WP506 oracle rejects an omitted admitted carrier',()=>{
  assert.throws(()=>verifyWp506MainProductPostEvaluationException({git:fakeGit({changedPaths:ADMITTED.slice(1)})}),/E_WP506_EXACT_ADMITTED_DELTA/u);
});

test('WP506 oracle rejects exact-base tree drift',()=>{
  assert.throws(()=>verifyWp506MainProductPostEvaluationException({git:fakeGit({baseTreeDrift:true})}),/E_WP506_ADMISSION_BASE/u);
});

test('WP506 oracle requires every semantic and hostile proof artifact at the candidate object',()=>{
  assert.throws(()=>verifyWp506MainProductPostEvaluationException({git:fakeGit({missingArtifact:'src/core/atlas-counterfactual-v1.mjs'})}),/E_WP506_REQUIRED_ARTIFACT/u);
});
