import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

const h=(bytes)=>crypto.createHash('sha256').update(bytes).digest('hex');
const ISSUE_SHA='e5390cb29934322fda18db4de8c8fdb9d71610d1';
const ISSUE_TREE='364ebcda483fc8680fd77770fcb7461e60d1caa0';
const git=(...args)=>execFileSync('git',args,{encoding:null,maxBuffer:16*1024*1024});
const gitText=(...args)=>git(...args).toString('utf8').trim();
const issuedDigest=(path)=>h(git('show',`${ISSUE_SHA}:${path}`));
const load=(path)=>{const bytes=fs.readFileSync(path);assert.equal(bytes.at(-1),0x0a);return{bytes,digest:h(bytes),value:JSON.parse(bytes)}};
const paths={
  acceptance:'docs/OPS/R24/CORRECTIVE/WP701_ACCEPTANCE_MATRIX_V1.json',
  authority:'docs/OPS/R24/CORRECTIVE/WP701_MAIN_PRODUCT_OWNER_AUTHORITY_V1.json',
  before:'docs/OPS/R24/CORRECTIVE/WP701_PROTECTED_WIP_BEFORE_V1.json',
  instance:'docs/OPS/R24/CORRECTIVE/WP701_MAIN_PRODUCT_STAGE_INSTANCE_V1.json',
  lease:'docs/OPS/R24/CORRECTIVE/WP701_LEASE_RELEASE_V1.json',
  registry:'docs/OPS/R24/CORRECTIVE/WP701_CARRIER_REGISTRY_V1.json',
  selection:'docs/OPS/R24/CORRECTIVE/WP701_MAIN_PRODUCT_SELECTION_RECEIPT_V1.json',
  stageAdmission:'docs/OPS/R24/CORRECTIVE/WP701_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V1.json',
  state:'docs/OPS/R24/CORRECTIVE/WP701_EFFECTIVE_STATE_V1.json',
  stageRegistry:'docs/OPS/R24/CORRECTIVE/WP701_STAGE_REGISTRY_V1.json',
  supplement:'docs/OPS/R24/CORRECTIVE/WP701_TERMINAL_SUPPLEMENT_V1.json',
  terminal:'docs/OPS/R24/CORRECTIVE/WP701_TERMINAL_RECEIPT_V1.json',
};
const expected={
  acceptance:'38ae631afd6a4fd06bd594842d86b34169fb4792a34640325dec800d9ed32497',authority:'9334bf7b5cc9a17fe6daa96147595510b270748725d1a128069c7acd1e0de95b',before:'1f412eea6efcbd6ea4dafbbfee6769740e775cdaab4cbb08a82b3ef3498bbdad',instance:'61b28fed30b12a8e1a994c1c4290bc40fc805cd0dafd10274d25ce98ab7a890f',lease:'1550cd977490f267b4193264a186a30a52719e014629328ae5b6fbf3e91a88a6',registry:'2bf94454f1a37a9c86c863bbd715d9a84617ff0386c20c6fbbfc3c78622aef33',selection:'4e04ae5c32775a1f92c7d3aa522979fb27f66cc0c157ce5875a7301fae4a41c3',stageAdmission:'1e766ec3f88f74046442146bb866f1395831c0fbd01362135b3d863c160edca8',state:'205ecd6b98d31454c8e31dc9787bf2c5d30994d6af21c6abf21bedaf453e4f02',stageRegistry:'2e652f4c4d2e8d1124472aa43c5dbdb1927e064c96e997a5c88e22928a9cc8f7',supplement:'884eab908a6cc638da669c8aa3c4eaec1ba382b2cf74d5ae9d90cdfa3683f2a5',terminal:'2d1d4e483f1ca35a4724a290b8ee612b7b5fee36c630f7ecdd8da69cc3f36045'};
const clone=(value)=>structuredClone(value);

function verifyTerminalSet(values){
  assert.equal(values.selection.graph.readySet.includes('WP-701_PARSER_QUARANTINE'),true);
  assert.equal(values.selection.graph.selectedId,'WP-701_PARSER_QUARANTINE');
  assert.equal(values.before.completeDenominator,257);
  assert.equal(values.before.presentDenominator,257);
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
  assert.equal(gitText('rev-parse',`${ISSUE_SHA}^{tree}`),ISSUE_TREE);
  for(const carrier of values.registry.carriers)assert.equal(issuedDigest(carrier.path),carrier.sha256,carrier.path);
  assert.equal(values.lease.currentLease.fencingCounter,75);
  assert.equal(values.lease.currentLease.status,'ACTIVE');
  assert.equal(values.lease.currentLease.wip,1);
  assert.equal(values.lease.targetLease.status,'RELEASED');
  assert.equal(values.lease.targetLease.wip,0);
  assert.equal(values.terminal.status,'CONDITIONAL_CERTIFIED_DONE_PENDING_EXTERNAL_DELIVERY');
  assert.equal(values.terminal.bindings.leaseReleaseDigest,expected.lease);
  assert.equal(values.terminal.bindings.wp507ExternalTerminalReceiptDigest,'b3eb36efc4993281d66235d23ec2f02bb2ebd8707e10bf7de052ebaeb064078d');
  assert.equal(values.terminal.activationOutcome.doneCount,65);
  assert.equal(values.terminal.activationOutcome.pendingCount,30);
  assert.equal(values.terminal.programDone,false);
  assert.equal(values.supplement.bindings.terminalReceiptDigest,expected.terminal);
  assert.equal(values.supplement.absoluteExclusionsRetained,true);
  assert.equal(values.supplement.programDone,false);
  for(const value of Object.values(values))if(value.sourcePlanRoles)assert.deepEqual(value.sourcePlanRoles,{externalSourcePlanDigest:'1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a',compiledProgramFileDigest:'da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a',rolesDistinct:true});
  return true;
}

test('WP701 terminal carrier bytes and complete prepublication denominator are exact',()=>{
  const files=Object.fromEntries(Object.entries(paths).map(([key,path])=>[key,load(path)]));
  for(const [key,file] of Object.entries(files))assert.equal(file.digest,expected[key],key);
  assert.equal(verifyTerminalSet(Object.fromEntries(Object.entries(files).map(([key,file])=>[key,file.value]))),true);
});

test('WP701 terminal contract rejects WIP denominator, lease and program overclaims',()=>{
  const values=Object.fromEntries(Object.entries(paths).map(([key,path])=>[key,load(path).value]));
  for(const mutate of [
    (copy)=>{copy.before.dirtyDenominator=7;},
    (copy)=>{copy.acceptance.externalRequiredCount=0;},
    (copy)=>{copy.lease.targetLease.wip=1;},
    (copy)=>{copy.terminal.programDone=true;},
  ]){const copy=clone(values);mutate(copy);assert.throws(()=>verifyTerminalSet(copy));}
});

test('WP701 terminal contract rejects carrier, source-role and transition drift',()=>{
  const values=Object.fromEntries(Object.entries(paths).map(([key,path])=>[key,load(path).value]));
  for(const mutate of [
    (copy)=>{copy.registry.carrierDenominator=15;},
    (copy)=>{copy.supplement.sourcePlanRoles.compiledProgramFileDigest=copy.supplement.sourcePlanRoles.externalSourcePlanDigest;},
    (copy)=>{copy.terminal.activationOutcome.pendingCount=31;},
  ]){const copy=clone(values);mutate(copy);assert.throws(()=>verifyTerminalSet(copy));}
});

test('WP701 terminal receipt does not preclaim future provider identities',()=>{
  const terminal=load(paths.terminal).value;
  assert.equal(terminal.externalDeliveryPredicates.length,5);
  for(const predicate of terminal.externalDeliveryPredicates){assert.equal(predicate.status,'REQUIRED_NOT_PRECLAIMED');assert.equal(predicate.providerIdentity,null);}
});
