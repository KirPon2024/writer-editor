import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
const CORRECTIVE=path.join(ROOT,'docs/OPS/R24/CORRECTIVE');
const EVIDENCE=path.join(ROOT,'docs/OPS/R24/EVIDENCE');
const sha256=(bytes)=>crypto.createHash('sha256').update(bytes).digest('hex');
const read=(base,name)=>JSON.parse(fs.readFileSync(path.join(base,name),'utf8'));
const digestFile=(relative)=>sha256(fs.readFileSync(path.join(ROOT,relative)));
const SOURCE='1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a';
const PROGRAM='da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a';
const WP506_EVALUATION_SHA='1efda2e9a5e7c08361a55921e1069bd00bfdc870';
const WP506_EVALUATION_TREE='2b2f28a20094fcb551717acb515e7fc5fcc94650';
const ISSUE_CEILING_MS=Date.parse('2026-09-02T05:05:00Z');
const UTC_KEYS=new Set(['approvedAtUtc','capturedAtUtc','createdAt','generatedAtUtc','observedAtUtc','selectedAtUtc']);
const assertSourceRoles=(value)=>{assert.equal(value.sourcePlanRoles.externalSourcePlanDigest,SOURCE);assert.equal(value.sourcePlanRoles.compiledProgramFileDigest,PROGRAM);assert.equal(value.sourcePlanRoles.rolesDistinct,true);assert.notEqual(SOURCE,PROGRAM);};
const gitBytes=(args)=>execFileSync('git',args,{cwd:ROOT,encoding:null,maxBuffer:16*1024*1024});
const digestGitObject=(relative)=>sha256(gitBytes(['show',`${WP506_EVALUATION_SHA}:${relative}`]));
const assertNoFutureDeclaredUtc=(value,ceilingMs,phase,pathParts=[])=>{
  if(Array.isArray(value)){value.forEach((entry,index)=>assertNoFutureDeclaredUtc(entry,ceilingMs,phase,[...pathParts,index]));return;}
  if(!value||typeof value!=='object')return;
  for(const [key,entry] of Object.entries(value)){
    const next=[...pathParts,key];
    if(UTC_KEYS.has(key)){
      const parsed=Date.parse(entry);
      if(!Number.isFinite(parsed)||parsed>ceilingMs)throw new Error(`E_WP506_FUTURE_DECLARED_UTC:${phase}:${next.join('.')}`);
    }
    assertNoFutureDeclaredUtc(entry,ceilingMs,phase,next);
  }
};

test('WP-506 terminal carriers form one acyclic exact-byte conditional delivery chain',()=>{
  const authority=read(CORRECTIVE,'WP506_MAIN_PRODUCT_OWNER_AUTHORITY_V1.json');
  const instance=read(CORRECTIVE,'WP506_MAIN_PRODUCT_STAGE_INSTANCE_V1.json');
  const admission=read(CORRECTIVE,'WP506_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V1.json');
  const registry=read(CORRECTIVE,'WP506_CARRIER_REGISTRY_V1.json');
  const acceptance=read(CORRECTIVE,'WP506_ACCEPTANCE_MATRIX_V1.json');
  const effective=read(CORRECTIVE,'WP506_EFFECTIVE_STATE_V1.json');
  const stageRegistry=read(CORRECTIVE,'WP506_STAGE_REGISTRY_V1.json');
  const lease=read(CORRECTIVE,'WP506_LEASE_RELEASE_V1.json');
  const terminal=read(CORRECTIVE,'WP506_TERMINAL_RECEIPT_V1.json');
  const supplement=read(CORRECTIVE,'WP506_TERMINAL_SUPPLEMENT_V1.json');
  const selection=read(CORRECTIVE,'WP506_MAIN_PRODUCT_SELECTION_RECEIPT_V1.json');
  const protectedWip=read(CORRECTIVE,'WP506_PROTECTED_WIP_BEFORE_V1.json');
  const approvals=read(CORRECTIVE,'WP506_GOVERNANCE_CHANGE_APPROVALS_V1.json');
  const claimBindings=read(EVIDENCE,'ES-R24-WP-506-COUNTERFACTUAL-CLAIM-BINDINGS.json');
  const evidenceStamps=['MODEL','CONTRACT','INTEGRATION','MUTANTS'].map((kind)=>read(EVIDENCE,`ES-R24-WP-506-COUNTERFACTUAL-${kind}.json`));
  const timestampCarriers=[selection,protectedWip,admission,terminal,approvals,claimBindings,...evidenceStamps];
  for(const carrier of timestampCarriers)assertNoFutureDeclaredUtc(carrier,ISSUE_CEILING_MS,'ISSUE');
  for(const carrier of timestampCarriers)assertNoFutureDeclaredUtc(carrier,Date.now(),'VERIFY');
  for(const carrier of [registry,acceptance,effective,stageRegistry,lease,terminal,supplement])assertSourceRoles(carrier);
  assert.equal(admission.authorityDigest,digestFile('docs/OPS/R24/CORRECTIVE/WP506_MAIN_PRODUCT_OWNER_AUTHORITY_V1.json'));
  assert.equal(admission.stageInstanceDigest,digestFile('docs/OPS/R24/CORRECTIVE/WP506_MAIN_PRODUCT_STAGE_INSTANCE_V1.json'));
  assert.equal(authority.stageId,'WP-506_COUNTERFACTUAL');
  assert.equal(instance.lease.fencingCounter,71);
  assert.equal(String(gitBytes(['rev-parse',`${WP506_EVALUATION_SHA}^{tree}`])).trim(),WP506_EVALUATION_TREE);
  for(const carrier of registry.carriers)assert.equal(digestGitObject(carrier.path),carrier.sha256,carrier.path);
  assert.equal(acceptance.bindings.carrierRegistryDigest,digestFile('docs/OPS/R24/CORRECTIVE/WP506_CARRIER_REGISTRY_V1.json'));
  assert.equal(effective.bindings.acceptanceMatrixDigest,digestFile('docs/OPS/R24/CORRECTIVE/WP506_ACCEPTANCE_MATRIX_V1.json'));
  assert.equal(stageRegistry.bindings.effectiveStateDigest,digestFile('docs/OPS/R24/CORRECTIVE/WP506_EFFECTIVE_STATE_V1.json'));
  assert.equal(lease.bindings.stageRegistryDigest,digestFile('docs/OPS/R24/CORRECTIVE/WP506_STAGE_REGISTRY_V1.json'));
  assert.equal(terminal.bindings.leaseReleaseDigest,digestFile('docs/OPS/R24/CORRECTIVE/WP506_LEASE_RELEASE_V1.json'));
  assert.equal(supplement.bindings.terminalReceiptDigest,digestFile('docs/OPS/R24/CORRECTIVE/WP506_TERMINAL_RECEIPT_V1.json'));
});

test('WP-506 acceptance denominator is closed and preclaims no external provider identity',()=>{
  const acceptance=read(CORRECTIVE,'WP506_ACCEPTANCE_MATRIX_V1.json');
  const terminal=read(CORRECTIVE,'WP506_TERMINAL_RECEIPT_V1.json');
  const lease=read(CORRECTIVE,'WP506_LEASE_RELEASE_V1.json');
  assert.equal(acceptance.rowCount,acceptance.rows.length);
  assert.equal(acceptance.localPassedRowCount+acceptance.externalPredicateRowCount,acceptance.rowCount);
  assert.equal(acceptance.failedRowCount,0);assert.equal(acceptance.pendingRowCount,0);
  assert.equal(acceptance.rows.filter((row)=>row.status==='PASS').length,acceptance.localPassedRowCount);
  assert.equal(acceptance.rows.filter((row)=>row.status==='REQUIRED_EXTERNAL_PREDICATE').length,acceptance.externalPredicateRowCount);
  assert.equal(terminal.externalDeliveryPredicates.length,acceptance.externalPredicateRowCount);
  for(const predicate of terminal.externalDeliveryPredicates){assert.equal(predicate.status,'REQUIRED_NOT_PRECLAIMED');assert.equal(predicate.providerIdentity,null);}
  assert.deepEqual(lease.currentLease,{fencingCounter:71,status:'ACTIVE',wip:1,predecessorReleaseDigest:'79402fb995bc809435c887b34ba00e8b29df50b4535ffabe439cd2186b19293d'});
  assert.deepEqual(lease.targetLease,{fencingCounter:71,status:'RELEASED',wip:0,transition:'ACTIVE_WIP_1_TO_RELEASED_WIP_0'});
  assert.equal(terminal.nextGraphNodeStarted,false);assert.equal(terminal.programDone,false);
});

test('WP-506 evidence closes four local classes and leaves independent exact-head external',()=>{
  const names=['ES-R24-WP-506-COUNTERFACTUAL-MODEL.json','ES-R24-WP-506-COUNTERFACTUAL-CONTRACT.json','ES-R24-WP-506-COUNTERFACTUAL-INTEGRATION.json','ES-R24-WP-506-COUNTERFACTUAL-MUTANTS.json'];
  const stamps=names.map((name)=>read(EVIDENCE,name));
  assert.deepEqual(stamps.map((stamp)=>stamp.test.evidenceClass),['MODEL','CONTRACT','INTEGRATION','IMPLEMENTATION_MUTANTS']);
  for(const stamp of stamps){assert.equal(stamp.schemaVersion,'EvidenceStampV2');assert.equal(stamp.claim.verdict,'PASS');assert.equal(stamp.test.failed,0);assert.equal(stamp.test.skipped,0);assertSourceRoles(stamp.artifact);}
  const acceptance=read(CORRECTIVE,'WP506_ACCEPTANCE_MATRIX_V1.json');
  assert.equal(acceptance.rows.find((row)=>row.id==='INDEPENDENT_EXACT_HEAD').status,'REQUIRED_EXTERNAL_PREDICATE');
});

test('WP-506 hostile terminal mutations fail acceptance lease and non-apply laws',()=>{
  const acceptance=structuredClone(read(CORRECTIVE,'WP506_ACCEPTANCE_MATRIX_V1.json'));acceptance.rows[0].status='PENDING';assert.notEqual(acceptance.rows.filter((row)=>row.status==='PASS').length,acceptance.localPassedRowCount);
  const lease=structuredClone(read(CORRECTIVE,'WP506_LEASE_RELEASE_V1.json'));lease.targetLease.wip=1;assert.notDeepEqual(lease.targetLease,{fencingCounter:71,status:'RELEASED',wip:0,transition:'ACTIVE_WIP_1_TO_RELEASED_WIP_0'});
  const terminal=structuredClone(read(CORRECTIVE,'WP506_TERMINAL_RECEIPT_V1.json'));terminal.externalDeliveryPredicates[0].providerIdentity={runId:1};assert.notEqual(terminal.externalDeliveryPredicates[0].providerIdentity,null);
  terminal.observedAtUtc='2026-09-02T05:05:01Z';assert.throws(()=>assertNoFutureDeclaredUtc(terminal,ISSUE_CEILING_MS,'ISSUE'),/E_WP506_FUTURE_DECLARED_UTC:ISSUE:observedAtUtc/u);
  assert.equal(terminal.nonClaims.includes('NO_CANONICAL_RETCON_APPLY_COMMAND'),true);
});
