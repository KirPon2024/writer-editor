import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

const h=(bytes)=>crypto.createHash('sha256').update(bytes).digest('hex');
const load=(path)=>{const bytes=fs.readFileSync(path);assert.equal(bytes.at(-1),0x0a);return{bytes,digest:h(bytes),value:JSON.parse(bytes)}};
const paths={
  acceptance:'docs/OPS/R24/CORRECTIVE/WP507_ACCEPTANCE_MATRIX_V2.json',
  authority:'docs/OPS/R24/CORRECTIVE/WP507_MAIN_PRODUCT_OWNER_AUTHORITY_AMENDMENT_V2.json',
  before:'docs/OPS/R24/CORRECTIVE/WP507_PROTECTED_WIP_BEFORE_V2.json',
  gate:'docs/OPS/R24/OWNER_GATE_DECISIONS/ATLAS_PROFILE_RELEASE_PERMIT_WP507_ATLAS_PRODUCT_CLAIM_SUCCESSOR_V2.json',
  instance:'docs/OPS/R24/CORRECTIVE/WP507_MAIN_PRODUCT_STAGE_INSTANCE_V2.json',
  lease:'docs/OPS/R24/CORRECTIVE/WP507_LEASE_RELEASE_V2.json',
  registry:'docs/OPS/R24/CORRECTIVE/WP507_CARRIER_REGISTRY_V2.json',
  stageAdmission:'docs/OPS/R24/CORRECTIVE/WP507_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V2.json',
  state:'docs/OPS/R24/CORRECTIVE/WP507_EFFECTIVE_STATE_V2.json',
  stageRegistry:'docs/OPS/R24/CORRECTIVE/WP507_STAGE_REGISTRY_V2.json',
  supplement:'docs/OPS/R24/CORRECTIVE/WP507_TERMINAL_SUPPLEMENT_V2.json',
  terminal:'docs/OPS/R24/CORRECTIVE/WP507_TERMINAL_RECEIPT_V2.json',
};
const expected={
  acceptance:'3c845d2b078f73b460e333efd47e246329ef31a2d5682ecf8293378a5fb98b5b',authority:'50589301f581f46c867581344ac685769bf3336762d62e8c07e70a49b7089ab0',before:'a5f782d8f6ca7e270ca35b22add08eb28362787f3e95725bf4a091095cbfc629',gate:'8006dab30a5ac323b707bd09dc85aa917056f089131cfa1baf79f5e11e6a8724',instance:'0bf2fab515a5f6ae87531f377f972414c1909ce971e96620b1854e6593628aa9',lease:'eb050f4581ce6b89e24805fe4696660c32bcc6726e60dd8c04f17e64a89f0273',registry:'85e5049d6c15a3694b52520e9d02aa190e028be65cb308d6c5a0a2291380c2a6',stageAdmission:'40d39ae31903bf7859b2f301b3aef58ff5acb18308505dea70e28a736e3eeedb',state:'2602463ecec6bf9b2848947e26d3f52e841a57e9389bba3ec4f2c2ec9f88b5f2',stageRegistry:'ecf68cea27341f92d9cd732675db30027df37f8006d3cfaf87634323ccf07e05',supplement:'fab212ebbeb685fb1b610d58aad521d3ea6fcd259aaa8b0838f7ef86c174bf54',terminal:'d561943bdb9ede7f0a2c6756ef89fb43165f797964c34712444614fa5aad9d62'};
const clone=(value)=>structuredClone(value);

function verifyTerminalSet(values){
  assert.equal(values.gate.schemaVersion,'YALKEN_R24_WP507_OWNER_GATE_DECISION_V2');
  assert.equal(values.gate.decision,'APPROVED');
  assert.equal(values.gate.scope,'DEVELOPMENT_AND_INTERNAL_PROTECTED_REPOSITORY_DELIVERY_ONLY');
  assert.equal(values.gate.missionDigest,'2d188140211c4e2a65f0f1bf1bef5bac53e396e3c3887cb3563fa253a10b0c80');
  assert.equal(values.gate.historicalDisposition.retconned,false);
  assert.equal(values.gate.historicalDisposition.reusedAdmission,false);
  assert.equal(values.gate.historicalDisposition.reusedLease,false);
  assert.equal(values.before.completeDenominator,256);
  assert.equal(values.before.dirtyDenominator,7);
  assert.equal(values.before.protectedDirtySet.length,7);
  assert.equal(values.acceptance.denominator,18);
  assert.equal(values.acceptance.localPassCount,13);
  assert.equal(values.acceptance.externalRequiredCount,5);
  assert.equal(values.acceptance.failCount,0);
  assert.equal(values.acceptance.unknownCount,0);
  assert.equal(values.registry.carrierDenominator,15);
  assert.equal(values.registry.verifiedCarrierCount,15);
  for(const carrier of values.registry.carriers)assert.equal(h(fs.readFileSync(carrier.path)),carrier.sha256,carrier.path);
  assert.equal(values.lease.currentLease.fencingCounter,74);
  assert.equal(values.lease.currentLease.wip,1);
  assert.equal(values.lease.targetLease.wip,0);
  assert.equal(values.terminal.status,'CONDITIONAL_CERTIFIED_DONE_PENDING_EXTERNAL_DELIVERY');
  assert.equal(values.terminal.bindings.ownerGateDecisionDigest,expected.gate);
  assert.equal(values.terminal.bindings.leaseReleaseDigest,expected.lease);
  assert.equal(values.terminal.historicalAdmissionReused,false);
  assert.equal(values.terminal.historicalLeaseReused,false);
  assert.equal(values.terminal.programDone,false);
  assert.equal(values.supplement.bindings.terminalReceiptDigest,expected.terminal);
  assert.equal(values.supplement.absoluteExclusionsRetained,true);
  assert.equal(values.supplement.programDone,false);
  return true;
}

test('WP507 terminal carrier bytes and complete prepublication denominator are exact',()=>{
  const files=Object.fromEntries(Object.entries(paths).map(([key,path])=>[key,load(path)]));
  for(const [key,file] of Object.entries(files))assert.equal(file.digest,expected[key],key);
  assert.equal(verifyTerminalSet(Object.fromEntries(Object.entries(files).map(([key,file])=>[key,file.value]))),true);
});

test('WP507 terminal contract rejects owner-gate scope, mission and historical-retcon mutations',()=>{
  const values=Object.fromEntries(Object.entries(paths).map(([key,path])=>[key,load(path).value]));
  for(const mutate of [
    (copy)=>{copy.gate.scope='PUBLIC_RELEASE';},
    (copy)=>{copy.gate.missionDigest='0'.repeat(64);},
    (copy)=>{copy.gate.historicalDisposition.retconned=true;},
  ]){const copy=clone(values);mutate(copy);assert.throws(()=>verifyTerminalSet(copy));}
});

test('WP507 terminal contract rejects denominator, lease and program overclaim mutations',()=>{
  const values=Object.fromEntries(Object.entries(paths).map(([key,path])=>[key,load(path).value]));
  for(const mutate of [
    (copy)=>{copy.acceptance.externalRequiredCount=0;},
    (copy)=>{copy.before.dirtyDenominator=6;},
    (copy)=>{copy.lease.targetLease.wip=1;},
    (copy)=>{copy.terminal.programDone=true;},
  ]){const copy=clone(values);mutate(copy);assert.throws(()=>verifyTerminalSet(copy));}
});

test('WP507 terminal receipt does not preclaim future provider identities',()=>{
  const terminal=load(paths.terminal).value;
  assert.equal(terminal.externalDeliveryPredicates.length,5);
  for(const predicate of terminal.externalDeliveryPredicates){assert.equal(predicate.status,'REQUIRED_NOT_PRECLAIMED');assert.equal(predicate.providerIdentity,null);}
});
