import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';
import {
  WP700_CI_REPAIR_ADMISSION_EXPECTATION,
  WP700_CI_REPAIR_INVENTORY_ADMISSION_EXPECTATION,
  WP700_CI_REPAIR_TEMPORAL_ADMISSION_EXPECTATION,
  WP700_MAIN_PRODUCT_ADMISSION_EXPECTATION,
  verifyWp700CiRepairPostEvaluationException,
  verifyWp700CiRepairInventorySuccessor,
  verifyWp700MainProductPostEvaluationException,
  verifyWp700CiRepairTemporalSuccessor,
} from '../../scripts/ops/r24/corrective/post-audit-certification-set.mjs';

const FINAL_SHA='f700f700f700f700f700f700f700f700f700f700';
const FINAL_TREE='a700a700a700a700a700a700a700a700a700a700';
const read=(file)=>JSON.parse(fs.readFileSync(file,'utf8'));
const operations=read(WP700_MAIN_PRODUCT_ADMISSION_EXPECTATION.instancePath).operations;
const ADMITTED=[...operations.modifyPaths,...operations.createPaths,...operations.deletePaths,...operations.renamePairs.flatMap((pair)=>[pair.from,pair.to])].sort();
const repairOperations=read(WP700_CI_REPAIR_ADMISSION_EXPECTATION.instancePath).operations;
const REPAIR_ADMITTED=[...repairOperations.modifyPaths,...repairOperations.createPaths,...repairOperations.deletePaths,...repairOperations.renamePairs.flatMap((pair)=>[pair.from,pair.to])].sort();
const REPAIR_FINAL_SHA='f711f711f711f711f711f711f711f711f711f711';
const REPAIR_FINAL_TREE='a711a711a711a711a711a711a711a711a711a711';
const inventoryOperations=read(WP700_CI_REPAIR_INVENTORY_ADMISSION_EXPECTATION.instancePath).operations;
const INVENTORY_ADMITTED=[...inventoryOperations.modifyPaths,...inventoryOperations.createPaths,...inventoryOperations.deletePaths,...inventoryOperations.renamePairs.flatMap((pair)=>[pair.from,pair.to])].sort();
const INVENTORY_FINAL_SHA='f722f722f722f722f722f722f722f722f722f722';
const INVENTORY_FINAL_TREE='a722a722a722a722a722a722a722a722a722a722';
const temporalOperations=read(WP700_CI_REPAIR_TEMPORAL_ADMISSION_EXPECTATION.instancePath).operations;
const TEMPORAL_ADMITTED=[...temporalOperations.modifyPaths,...temporalOperations.createPaths,...temporalOperations.deletePaths,...temporalOperations.renamePairs.flatMap((pair)=>[pair.from,pair.to])].sort();
const TEMPORAL_FINAL_SHA='f733f733f733f733f733f733f733f733f733f733';
const TEMPORAL_FINAL_TREE='a733a733a733a733a733a733a733a733a733a733';
const response=(value,encoding)=>{const text=String(value).endsWith('\n')?String(value):`${value}\n`;return encoding==='utf8'?text:Buffer.from(text);};

function fakeGit({changedPaths=ADMITTED,baseTreeDrift=false,missingArtifact=null}={}){
  return (args,{encoding=null}={})=>{
    if(args[0]==='rev-parse'){
      if(args[1]==='HEAD')return response(FINAL_SHA,encoding);
      if(args[1]===`${WP700_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseSha}^{tree}`)return response(baseTreeDrift?'b'.repeat(40):WP700_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseTree,encoding);
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

function repairFakeGit({changedPaths=REPAIR_ADMITTED,baseTreeDrift=false,historicalTreeDrift=false,missingHistoricalArtifact=null,historicalArtifactMutant=null,missingArtifact=null}={}){
  return (args,{encoding=null}={})=>{
    if(args[0]==='rev-parse'){
      if(args[1]==='HEAD')return response(REPAIR_FINAL_SHA,encoding);
      if(args[1]===`${WP700_CI_REPAIR_ADMISSION_EXPECTATION.baseSha}^{tree}`)return response(baseTreeDrift?'b'.repeat(40):WP700_CI_REPAIR_ADMISSION_EXPECTATION.baseTree,encoding);
      if(args[1]===`${WP700_CI_REPAIR_ADMISSION_EXPECTATION.historicalEvaluationSha}^{tree}`)return response(historicalTreeDrift?'c'.repeat(40):WP700_CI_REPAIR_ADMISSION_EXPECTATION.historicalEvaluationTree,encoding);
      if(args[1]===`${REPAIR_FINAL_SHA}^{tree}`)return response(REPAIR_FINAL_TREE,encoding);
      return response(args[1].replace(/\^\{tree\}$/u,''),encoding);
    }
    if(args[0]==='merge-base'&&args[1]==='--is-ancestor')return Buffer.alloc(0);
    if(args[0]==='diff'&&args[1]==='--name-only')return response(changedPaths.join('\n'),encoding);
    if(args[0]==='show'){
      const separator=args[1].indexOf(':'),sha=args[1].slice(0,separator),artifactPath=args[1].slice(separator+1);
      if(sha===WP700_CI_REPAIR_ADMISSION_EXPECTATION.historicalEvaluationSha){
        if(artifactPath===missingHistoricalArtifact)throw new Error('MISSING_HISTORICAL');
        if(artifactPath===historicalArtifactMutant){const bytes=fs.readFileSync(artifactPath);return encoding==='utf8'?bytes.toString('utf8'):bytes;}
        return execFileSync('git',['show',`${sha}:${artifactPath}`],{encoding,maxBuffer:16*1024*1024});
      }
      if(artifactPath===missingArtifact)throw new Error('MISSING');
      const bytes=fs.readFileSync(artifactPath);
      return encoding==='utf8'?bytes.toString('utf8'):bytes;
    }
    throw new Error(`UNEXPECTED_GIT:${args.join(' ')}`);
  };
}

function inventoryFakeGit({changedPaths=INVENTORY_ADMITTED,baseTreeDrift=false,inventoryMutant=false,missingArtifact=null}={}){
  return (args,{encoding=null}={})=>{
    if(args[0]==='rev-parse'){
      if(args[1]==='HEAD')return response(INVENTORY_FINAL_SHA,encoding);
      if(args[1]===`${WP700_CI_REPAIR_INVENTORY_ADMISSION_EXPECTATION.baseSha}^{tree}`)return response(baseTreeDrift?'b'.repeat(40):WP700_CI_REPAIR_INVENTORY_ADMISSION_EXPECTATION.baseTree,encoding);
      if(args[1]===`${INVENTORY_FINAL_SHA}^{tree}`)return response(INVENTORY_FINAL_TREE,encoding);
      return response(args[1].replace(/\^\{tree\}$/u,''),encoding);
    }
    if(args[0]==='merge-base'&&args[1]==='--is-ancestor')return Buffer.alloc(0);
    if(args[0]==='diff'&&args[1]==='--name-only')return response(changedPaths.join('\n'),encoding);
    if(args[0]==='show'){
      const separator=args[1].indexOf(':'),artifactPath=args[1].slice(separator+1);
      if(artifactPath===missingArtifact)throw new Error('MISSING');
      const bytes=inventoryMutant&&artifactPath==='docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json'?Buffer.from('{}\n'):execFileSync('git',['show',`${WP700_CI_REPAIR_TEMPORAL_ADMISSION_EXPECTATION.baseSha}:${artifactPath}`],{encoding:null,maxBuffer:16*1024*1024});
      return encoding==='utf8'?bytes.toString('utf8'):bytes;
    }
    throw new Error(`UNEXPECTED_GIT:${args.join(' ')}`);
  };
}

function temporalFakeGit({changedPaths=TEMPORAL_ADMITTED,baseTreeDrift=false,inventoryMutant=false,testMutant=false,missingArtifact=null}={}){
  return (args,{encoding=null}={})=>{
    if(args[0]==='rev-parse'){
      if(args[1]==='HEAD')return response(TEMPORAL_FINAL_SHA,encoding);
      if(args[1]===`${WP700_CI_REPAIR_TEMPORAL_ADMISSION_EXPECTATION.baseSha}^{tree}`)return response(baseTreeDrift?'b'.repeat(40):WP700_CI_REPAIR_TEMPORAL_ADMISSION_EXPECTATION.baseTree,encoding);
      if(args[1]===`${TEMPORAL_FINAL_SHA}^{tree}`)return response(TEMPORAL_FINAL_TREE,encoding);
      return response(args[1].replace(/\^\{tree\}$/u,''),encoding);
    }
    if(args[0]==='merge-base'&&args[1]==='--is-ancestor')return Buffer.alloc(0);
    if(args[0]==='diff'&&args[1]==='--name-only')return response(changedPaths.join('\n'),encoding);
    if(args[0]==='show'){
      const separator=args[1].indexOf(':'),artifactPath=args[1].slice(separator+1);
      if(artifactPath===missingArtifact)throw new Error('MISSING');
      let bytes=fs.readFileSync(artifactPath);
      if(inventoryMutant&&artifactPath==='docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json')bytes=Buffer.from('{}\n');
      if(testMutant&&artifactPath==='test/contracts/r24-wp700-terminal-carriers.contract.test.mjs')bytes=Buffer.from('mutant\n');
      return encoding==='utf8'?bytes.toString('utf8'):bytes;
    }
    throw new Error(`UNEXPECTED_GIT:${args.join(' ')}`);
  };
}

test('WP700 exact admitted delta extends the post-evaluation chain without unrelated descendants',()=>{
  const result=verifyWp700MainProductPostEvaluationException({git:fakeGit()});
  assert.equal(result.status,'PASS');
  assert.equal(result.baseSha,WP700_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseSha);
  assert.equal(result.candidateSha,FINAL_SHA);
  assert.equal(result.candidateTree,FINAL_TREE);
  assert.equal(result.admissionDenominator,1);
  assert.equal(result.admittedPathDenominator,27);
  assert.equal(result.changedPathDenominator,27);
  assert.deepEqual(result.changedPaths,ADMITTED);
  assert.deepEqual(result.sourcePlanRoles,{externalSourcePlanDigest:'1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a',compiledProgramFileDigest:'da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a',rolesDistinct:true});
});

test('WP700 oracle rejects an unadmitted future descendant path',()=>{
  assert.throws(()=>verifyWp700MainProductPostEvaluationException({git:fakeGit({changedPaths:[...ADMITTED,'src/main.js'].sort()})}),/E_WP700_EXACT_ADMITTED_DELTA/u);
});

test('WP700 oracle rejects an omitted admitted carrier',()=>{
  assert.throws(()=>verifyWp700MainProductPostEvaluationException({git:fakeGit({changedPaths:ADMITTED.slice(1)})}),/E_WP700_EXACT_ADMITTED_DELTA/u);
});

test('WP700 oracle rejects exact-base tree drift',()=>{
  assert.throws(()=>verifyWp700MainProductPostEvaluationException({git:fakeGit({baseTreeDrift:true})}),/E_WP700_ADMISSION_BASE/u);
});

test('WP700 oracle requires every semantic and hostile proof artifact',()=>{
  assert.throws(()=>verifyWp700MainProductPostEvaluationException({git:fakeGit({missingArtifact:'src/core/interchange-ir-v1.mjs'})}),/E_WP700_REQUIRED_ARTIFACT/u);
});

test('WP700 CI repair binds the exact nine-path successor and all 17 WP506 historical Git objects',()=>{
  const result=verifyWp700CiRepairPostEvaluationException({git:repairFakeGit()});
  assert.equal(result.status,'PASS');
  assert.equal(result.baseSha,WP700_CI_REPAIR_ADMISSION_EXPECTATION.baseSha);
  assert.equal(result.candidateSha,REPAIR_FINAL_SHA);
  assert.equal(result.candidateTree,REPAIR_FINAL_TREE);
  assert.equal(result.admissionDenominator,1);
  assert.equal(result.admittedPathDenominator,9);
  assert.equal(result.changedPathDenominator,9);
  assert.equal(result.historicalCarrierDenominator,17);
  assert.equal(result.currentTreeFallbackAllowed,false);
  assert.deepEqual(result.changedPaths,REPAIR_ADMITTED);
  assert.deepEqual(result.sourcePlanRoles,{externalSourcePlanDigest:'1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a',compiledProgramFileDigest:'da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a',rolesDistinct:true});
});

test('WP700 CI repair oracle rejects a future descendant path',()=>{
  assert.throws(()=>verifyWp700CiRepairPostEvaluationException({git:repairFakeGit({changedPaths:[...REPAIR_ADMITTED,'src/main.js'].sort()})}),/E_WP700_CI_REPAIR_EXACT_ADMITTED_DELTA/u);
});

test('WP700 CI repair oracle rejects an omitted admitted path',()=>{
  assert.throws(()=>verifyWp700CiRepairPostEvaluationException({git:repairFakeGit({changedPaths:REPAIR_ADMITTED.slice(1)})}),/E_WP700_CI_REPAIR_EXACT_ADMITTED_DELTA/u);
});

test('WP700 CI repair oracle rejects repair-base and historical tree drift',()=>{
  assert.throws(()=>verifyWp700CiRepairPostEvaluationException({git:repairFakeGit({baseTreeDrift:true})}),/E_WP700_CI_REPAIR_ADMISSION_BASE/u);
  assert.throws(()=>verifyWp700CiRepairPostEvaluationException({git:repairFakeGit({historicalTreeDrift:true})}),/E_WP700_CI_REPAIR_HISTORICAL_TREE/u);
});

test('WP700 CI repair oracle rejects missing historical objects and mutable-current fallback bytes',()=>{
  assert.throws(()=>verifyWp700CiRepairPostEvaluationException({git:repairFakeGit({missingHistoricalArtifact:'.github/workflows/oss-policy.yml'})}),/E_WP700_CI_REPAIR_HISTORICAL_OBJECT_MISSING/u);
  assert.throws(()=>verifyWp700CiRepairPostEvaluationException({git:repairFakeGit({historicalArtifactMutant:'.github/workflows/oss-policy.yml'})}),/E_WP700_CI_REPAIR_HISTORICAL_OBJECT_DIGEST/u);
});

test('WP700 CI repair oracle requires every admitted successor artifact',()=>{
  assert.throws(()=>verifyWp700CiRepairPostEvaluationException({git:repairFakeGit({missingArtifact:'docs/OPS/R24/CORRECTIVE/WP700_CI_REPAIR_SUCCESSOR_V1.json'})}),/E_WP700_CI_REPAIR_REQUIRED_ARTIFACT/u);
});

test('WP700 inventory successor binds the exact nine-path V3 delta and complete refreshed inventory',()=>{
  const result=verifyWp700CiRepairInventorySuccessor({git:inventoryFakeGit()});
  assert.equal(result.status,'PASS');
  assert.equal(result.baseSha,WP700_CI_REPAIR_INVENTORY_ADMISSION_EXPECTATION.baseSha);
  assert.equal(result.candidateSha,INVENTORY_FINAL_SHA);
  assert.equal(result.candidateTree,INVENTORY_FINAL_TREE);
  assert.equal(result.admittedPathDenominator,9);
  assert.equal(result.changedPathDenominator,9);
  assert.equal(result.inventoryFileDenominator,1312);
  assert.equal(result.requiredSkips,0);
  assert.equal(result.unexplainedSkips,0);
  assert.deepEqual(result.changedPaths,INVENTORY_ADMITTED);
});

test('WP700 inventory successor rejects future and omitted paths',()=>{
  assert.throws(()=>verifyWp700CiRepairInventorySuccessor({git:inventoryFakeGit({changedPaths:[...INVENTORY_ADMITTED,'src/main.js'].sort()})}),/E_WP700_CI_INVENTORY_EXACT_ADMITTED_DELTA/u);
  assert.throws(()=>verifyWp700CiRepairInventorySuccessor({git:inventoryFakeGit({changedPaths:INVENTORY_ADMITTED.slice(1)})}),/E_WP700_CI_INVENTORY_EXACT_ADMITTED_DELTA/u);
});

test('WP700 inventory successor rejects base drift stale inventory and missing carriers',()=>{
  assert.throws(()=>verifyWp700CiRepairInventorySuccessor({git:inventoryFakeGit({baseTreeDrift:true})}),/E_WP700_CI_INVENTORY_ADMISSION_BASE/u);
  assert.throws(()=>verifyWp700CiRepairInventorySuccessor({git:inventoryFakeGit({inventoryMutant:true})}),/E_WP700_CI_INVENTORY_DIGEST/u);
  assert.throws(()=>verifyWp700CiRepairInventorySuccessor({git:inventoryFakeGit({missingArtifact:'docs/OPS/R24/CORRECTIVE/WP700_CI_REPAIR_INVENTORY_SUCCESSOR_V2.json'})}),/E_WP700_CI_INVENTORY_REQUIRED_ARTIFACT/u);
});

test('WP700 temporal successor binds the exact ten-path V4 delta and phase-correct time oracle',()=>{
  const result=verifyWp700CiRepairTemporalSuccessor({git:temporalFakeGit()});
  assert.equal(result.status,'PASS');
  assert.equal(result.baseSha,WP700_CI_REPAIR_TEMPORAL_ADMISSION_EXPECTATION.baseSha);
  assert.equal(result.candidateSha,TEMPORAL_FINAL_SHA);
  assert.equal(result.candidateTree,TEMPORAL_FINAL_TREE);
  assert.equal(result.admittedPathDenominator,10);
  assert.equal(result.changedPathDenominator,10);
  assert.equal(result.inventoryFileDenominator,1312);
  assert.equal(result.requiredSkips,0);
  assert.equal(result.unexplainedSkips,0);
  assert.deepEqual(result.changedPaths,TEMPORAL_ADMITTED);
});

test('WP700 temporal successor rejects future and omitted paths',()=>{
  assert.throws(()=>verifyWp700CiRepairTemporalSuccessor({git:temporalFakeGit({changedPaths:[...TEMPORAL_ADMITTED,'src/main.js'].sort()})}),/E_WP700_CI_TEMPORAL_EXACT_ADMITTED_DELTA/u);
  assert.throws(()=>verifyWp700CiRepairTemporalSuccessor({git:temporalFakeGit({changedPaths:TEMPORAL_ADMITTED.slice(1)})}),/E_WP700_CI_TEMPORAL_EXACT_ADMITTED_DELTA/u);
});

test('WP700 temporal successor rejects base drift stale inventory mutated test and missing carriers',()=>{
  assert.throws(()=>verifyWp700CiRepairTemporalSuccessor({git:temporalFakeGit({baseTreeDrift:true})}),/E_WP700_CI_TEMPORAL_ADMISSION_BASE/u);
  assert.throws(()=>verifyWp700CiRepairTemporalSuccessor({git:temporalFakeGit({inventoryMutant:true})}),/E_WP700_CI_TEMPORAL_INVENTORY_DIGEST/u);
  assert.throws(()=>verifyWp700CiRepairTemporalSuccessor({git:temporalFakeGit({testMutant:true})}),/E_WP700_CI_TEMPORAL_TEST_DIGEST/u);
  assert.throws(()=>verifyWp700CiRepairTemporalSuccessor({git:temporalFakeGit({missingArtifact:'docs/OPS/R24/CORRECTIVE/WP700_CI_REPAIR_TEMPORAL_SUCCESSOR_V3.json'})}),/E_WP700_CI_TEMPORAL_REQUIRED_ARTIFACT/u);
});
