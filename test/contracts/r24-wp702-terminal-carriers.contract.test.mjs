import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

const h=(bytes)=>crypto.createHash('sha256').update(bytes).digest('hex');
const load=(path)=>{const bytes=fs.readFileSync(path);assert.equal(bytes.at(-1),0x0a);return{bytes,digest:h(bytes),value:JSON.parse(bytes)}};
const paths={
  acceptance:'docs/OPS/R24/CORRECTIVE/WP702_ACCEPTANCE_MATRIX_V1.json',
  authority:'docs/OPS/R24/CORRECTIVE/WP702_MAIN_PRODUCT_OWNER_AUTHORITY_V1.json',
  before:'docs/OPS/R24/CORRECTIVE/WP702_PROTECTED_WIP_BEFORE_V1.json',
  instance:'docs/OPS/R24/CORRECTIVE/WP702_MAIN_PRODUCT_STAGE_INSTANCE_V1.json',
  lease:'docs/OPS/R24/CORRECTIVE/WP702_LEASE_RELEASE_V1.json',
  registry:'docs/OPS/R24/CORRECTIVE/WP702_CARRIER_REGISTRY_V1.json',
  selection:'docs/OPS/R24/CORRECTIVE/WP702_MAIN_PRODUCT_SELECTION_RECEIPT_V1.json',
  stageAdmission:'docs/OPS/R24/CORRECTIVE/WP702_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V1.json',
  state:'docs/OPS/R24/CORRECTIVE/WP702_EFFECTIVE_STATE_V1.json',
  stageRegistry:'docs/OPS/R24/CORRECTIVE/WP702_STAGE_REGISTRY_V1.json',
  supplement:'docs/OPS/R24/CORRECTIVE/WP702_TERMINAL_SUPPLEMENT_V1.json',
  terminal:'docs/OPS/R24/CORRECTIVE/WP702_TERMINAL_RECEIPT_V1.json',
};
const expected={
  acceptance:'c316410ffaebc07d0431936b3c9cb601c90f9ff1e202f6ea24452a712622eb77',
  authority:'f1e079bc3921bd7a374b9b4192ecb0005c4d7bd866246cc2417633f746063490',
  before:'6e5ddbeb56942eefc9ff0f78bed6268d47b50697225059c49b8ff21853349146',
  instance:'247b02dead1cc7d6f3ef50353fec8ed42fff19a04d54cb570ca99341b47e40a7',
  lease:'78e249d6e285ad5fa9e7815be2d7c4694315640d961560c2a30d73fec62c58c6',
  registry:'08c30056d146eac44feeb9e82ca5ff3100b543b84a555cd6b227ec7e0a09ff32',
  selection:'8a08078421a8a2463ebf0e9388f8bbfb9491c2459ee79468dc42fe6c318f3f09',
  stageAdmission:'64139cb2444b08ae17310791ae375eb71c797f8e3daebe4990d7cc942985cc8b',
  state:'5e1856bcffde51343e33742100070dee8bfbe518dc59bdb8e182c569b30ef491',
  stageRegistry:'be86a0d0c27ca4b50b67140361b687a55ca8de46c001e486f93d876b64e7744c',
  supplement:'3a4b507b9b979766d6ee362c6242aaba1d1bb1a87b54af221a03c5e40f2bdd34',
  terminal:'72d0f298700eb587f7548ae84c05e2c38ed1e116fc59e011638e5ba404aa3caa',
};
const clone=(value)=>structuredClone(value);

function verifyTerminalSet(values){
  assert.equal(values.selection.graph.readySet.includes('WP-702_TEXT_FORMATS'),true);
  assert.equal(values.selection.graph.selectedId,'WP-702_TEXT_FORMATS');
  assert.equal(values.selection.graph.effectiveCountsBefore.DONE,65);
  assert.equal(values.before.completeDenominator,258);
  assert.equal(values.before.presentDenominator,258);
  assert.equal(values.before.prunableDenominator,0);
  assert.equal(values.before.dirtyDenominator,8);
  assert.equal(values.before.protectedDirtySet.length,8);
  assert.equal(values.before.excludedTaskWorktrees.length,2);
  assert.equal(values.acceptance.denominator,18);
  assert.equal(values.acceptance.localPassCount,13);
  assert.equal(values.acceptance.externalRequiredCount,5);
  assert.equal(values.acceptance.failCount,0);
  assert.equal(values.acceptance.unknownCount,0);
  assert.equal(values.registry.carrierDenominator,16);
  assert.equal(values.registry.verifiedCarrierCount,16);
  assert.equal(values.registry.missingCarrierCount,0);
  assert.equal(values.registry.mismatchedCarrierCount,0);
  for(const carrier of values.registry.carriers)assert.equal(h(fs.readFileSync(carrier.path)),carrier.sha256,carrier.path);
  assert.equal(values.lease.currentLease.fencingCounter,76);
  assert.equal(values.lease.currentLease.status,'ACTIVE');
  assert.equal(values.lease.currentLease.wip,1);
  assert.equal(values.lease.targetLease.status,'RELEASED');
  assert.equal(values.lease.targetLease.wip,0);
  assert.equal(values.terminal.status,'CONDITIONAL_CERTIFIED_DONE_PENDING_EXTERNAL_DELIVERY');
  assert.equal(values.terminal.bindings.leaseReleaseDigest,expected.lease);
  assert.equal(values.terminal.bindings.wp701ExternalTerminalReceiptDigest,'e48d231496fb98916064b7c44abc9a22f3ce932137c95d762a38161b9a6243c2');
  assert.equal(values.terminal.activationOutcome.doneCount,66);
  assert.equal(values.terminal.activationOutcome.pendingCount,29);
  assert.equal(values.terminal.programDone,false);
  assert.equal(values.supplement.bindings.terminalReceiptDigest,expected.terminal);
  assert.equal(values.supplement.absoluteExclusionsRetained,true);
  assert.equal(values.supplement.programDone,false);
  for(const value of Object.values(values))if(value.sourcePlanRoles)assert.deepEqual(value.sourcePlanRoles,{externalSourcePlanDigest:'1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a',compiledProgramFileDigest:'da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a',rolesDistinct:true});
  return true;
}

test('WP702 terminal carrier bytes and complete prepublication denominator are exact',()=>{
  const files=Object.fromEntries(Object.entries(paths).map(([key,path])=>[key,load(path)]));
  for(const [key,file] of Object.entries(files))assert.equal(file.digest,expected[key],key);
  assert.equal(verifyTerminalSet(Object.fromEntries(Object.entries(files).map(([key,file])=>[key,file.value]))),true);
});

test('WP702 terminal contract rejects WIP denominator, lease and program overclaims',()=>{
  const values=Object.fromEntries(Object.entries(paths).map(([key,path])=>[key,load(path).value]));
  for(const mutate of [
    (copy)=>{copy.before.dirtyDenominator=7;},
    (copy)=>{copy.acceptance.externalRequiredCount=0;},
    (copy)=>{copy.lease.targetLease.wip=1;},
    (copy)=>{copy.terminal.programDone=true;},
  ]){const copy=clone(values);mutate(copy);assert.throws(()=>verifyTerminalSet(copy));}
});

test('WP702 terminal contract rejects carrier, source-role and graph-transition drift',()=>{
  const values=Object.fromEntries(Object.entries(paths).map(([key,path])=>[key,load(path).value]));
  for(const mutate of [
    (copy)=>{copy.registry.carrierDenominator=15;},
    (copy)=>{copy.supplement.sourcePlanRoles.compiledProgramFileDigest=copy.supplement.sourcePlanRoles.externalSourcePlanDigest;},
    (copy)=>{copy.terminal.activationOutcome.pendingCount=30;},
    (copy)=>{copy.selection.graph.selectedId='WP-600_FEATURESPEC_QUERY_IR';},
  ]){const copy=clone(values);mutate(copy);assert.throws(()=>verifyTerminalSet(copy));}
});

test('WP702 terminal receipt does not preclaim future provider identities',()=>{
  const terminal=load(paths.terminal).value;
  assert.equal(terminal.externalDeliveryPredicates.length,5);
  for(const predicate of terminal.externalDeliveryPredicates){assert.equal(predicate.status,'REQUIRED_NOT_PRECLAIMED');assert.equal(predicate.providerIdentity,null);}
});
