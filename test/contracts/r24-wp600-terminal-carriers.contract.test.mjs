import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { canonicalDigest } from '../../scripts/ops/r24/canonical-json.mjs';
import { selectNext } from '../../scripts/ops/r24/scheduler.mjs';
import { buildCurrentG0Program } from '../../scripts/ops/r24/executable-program.mjs';
import { buildClaimBinding } from '../../scripts/ops/r24/claim-binding.mjs';

const P='docs/OPS/R24/CORRECTIVE/';
const h=(bytes)=>crypto.createHash('sha256').update(bytes).digest('hex');
const git=(...args)=>execFileSync('git',args,{encoding:null,maxBuffer:4*1024*1024});
const text=(...args)=>git(...args).toString('utf8').trim();
const paths={authority:P+'WP600_MAIN_PRODUCT_OWNER_AUTHORITY_V1.json',instance:P+'WP600_MAIN_PRODUCT_STAGE_INSTANCE_V1.json',admission:P+'WP600_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V1.json',
  selection:P+'WP600_MAIN_PRODUCT_SELECTION_RECEIPT_V1.json',before:P+'WP600_PROTECTED_WIP_BEFORE_V1.json',graph:P+'WP600_EFFECTIVE_GRAPH_BASELINE_V1.json',predecessor:P+'WP600_WP702_TERMINAL_PREDECESSOR_V1.json',
  registry:P+'WP600_CARRIER_REGISTRY_V1.json',acceptance:P+'WP600_ACCEPTANCE_MATRIX_V1.json',state:P+'WP600_EFFECTIVE_STATE_V1.json',stageRegistry:P+'WP600_STAGE_REGISTRY_V1.json',lease:P+'WP600_LEASE_RELEASE_V1.json',terminal:P+'WP600_TERMINAL_RECEIPT_V1.json',supplement:P+'WP600_TERMINAL_SUPPLEMENT_V1.json'};
// The immutable carrier's introduction commit is its artifact evaluation
// identity. Precommit checking may read declared untracked bytes; once tracked,
// a missing Git object is an error and never falls back to a future worktree.
const issueSha=text('log','--diff-filter=A','--format=%H','--max-count=1','--',paths.terminal);
if(!issueSha)assert.equal(text('ls-files','--',paths.terminal),'');
const bytes=(path)=>issueSha?git('show',`${issueSha}:${path}`):fs.readFileSync(path);
const read=(path)=>JSON.parse(bytes(path));
const load=()=>Object.fromEntries(Object.entries(paths).map(([key,path])=>[key,read(path)]));
const roles={externalSourcePlanDigest:'1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a',compiledProgramFileDigest:'da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a',rolesDistinct:true};
const counts=(states)=>Object.fromEntries(['BLOCKED_TYPED','DONE','INELIGIBLE_OPTIONAL','PENDING'].map((state)=>[state,Object.values(states).filter((value)=>value===state).length]));
function verify(values){
  assert.equal(h(bytes(paths.authority)),'4e8a16fa95ce3e9dcfb1ed24fd0da384a516d179eb16742cfd57a23e37995780');
  assert.equal(h(bytes(paths.instance)),'33365121fcdc9bdcc447fe7672f08c06f80ed9d869493ba5deb53ef32db731f9');
  assert.equal(h(bytes(paths.admission)),'ed966a6227d948deac89eb7d45f53b0409ceb924e80b9ebf63beab7fbcb371a6');
  assert.equal(values.admission.writeSetDigest,'b571e7a4b0f5f792f996be5bed19480700e4cd28af7fe0741f60909dbbc6ee14');
  assert.equal(values.authority.lease.fencingCounter,77);assert.equal(values.authority.lease.wip,1);
  assert.equal(values.authority.lease.predecessorReleaseDigest,'89bdd6d6a56c859792bb0cb77d1aa43cd6552807b658a5a759f0838d5b3a2c50');
  const {snapshotSha256,...payload}=values.before;
  assert.equal(h(Buffer.from(`${JSON.stringify(payload)}\n`)),snapshotSha256);
  assert.equal(values.before.completeDenominator,259);assert.equal(values.before.entries.length,259);
  assert.equal(values.before.presentDenominator,259);assert.equal(values.before.prunableDenominator,0);
  assert.equal(values.before.dirtyDenominator,8);assert.equal(values.before.protectedDirtySet.length,8);assert.equal(values.before.excludedTaskWorktrees.length,2);
  assert.equal(values.graph.completeDenominator,109);assert.equal(Object.keys(values.graph.states).length,109);
  assert.equal(canonicalDigest(values.graph.states),values.graph.statesDigest);
  assert.deepEqual(counts(values.graph.states),{BLOCKED_TYPED:3,DONE:66,INELIGIBLE_OPTIONAL:10,PENDING:30});
  assert.deepEqual(values.state.currentCounts,counts(values.graph.states));
  assert.deepEqual(values.state.targetStates,{...values.graph.states,'WP-600_FEATURESPEC_QUERY_IR':'DONE'});
  assert.deepEqual(values.state.targetCounts,{BLOCKED_TYPED:3,DONE:67,INELIGIBLE_OPTIONAL:10,PENDING:29});
  assert.equal(values.selection.frozenPlanStateMutated,false);
  assert.equal(values.selection.logicalProjectionRevisionIsNotPlanStateCasRevision,true);
  const selection=values.selection,program=JSON.parse(git('show',`${selection.exactBase.sha}:docs/OPS/R24/EXECUTABLE_PROGRAM_R2_4.json`));
  assert.deepEqual(selectNext({program:buildCurrentG0Program(program),contourStates:values.graph.states,mission:selection.missionBinding,now:selection.schedulerReceipt.generatedAt}),selection.schedulerReceipt);
  assert.equal(selection.schedulerReceipt.selectedId,'WP-600_FEATURESPEC_QUERY_IR');
  assert.equal(selection.missionBinding.schedulerGraphDigest,canonicalDigest(program.nodes));
  assert.equal(selection.missionBinding.stateDigest,canonicalDigest(selection.effectiveStateProjection));
  assert.equal(selection.missionBinding.policyDigest,h(git('show',`${selection.exactBase.sha}:docs/OPS/R24/AUTONOMY_CONTROL_PLANE_R2_4.json`)));
  assert.equal(values.registry.byteIdentityRole,'ADMITTED_CANDIDATE_ARTIFACT_MANIFEST_NOT_BASE_TREE_CONTENTS');
  assert.equal(values.registry.carrierDenominator,18);assert.equal(values.registry.carriers.length,18);
  assert.equal(values.registry.currentTreeFallbackAllowed,false);
  for(const binding of values.registry.carriers)assert.equal(h(bytes(binding.path)),binding.sha256,binding.path);
  assert.equal(values.acceptance.denominator,18);assert.equal(values.acceptance.rows.length,18);
  assert.equal(values.acceptance.localPassCount,12);assert.equal(values.acceptance.localRequiredCount,1);assert.equal(values.acceptance.externalRequiredCount,5);
  assert.equal(values.acceptance.rows.filter((row)=>row.status==='PASS').length,12);
  assert.equal(values.acceptance.rows.filter((row)=>row.status==='REQUIRED_NOT_PRECLAIMED').length,6);
  assert.equal(values.terminal.status,'CONDITIONAL_DONE_PENDING_REQUIRED_LOCAL_AND_EXTERNAL_PREDICATES');
  assert.equal(values.terminal.bindings.leaseReleaseDigest,h(bytes(paths.lease)));
  assert.equal(values.terminal.bindings.acceptanceMatrixDigest,h(bytes(paths.acceptance)));
  assert.equal(values.terminal.bindings.effectiveStateDigest,h(bytes(paths.state)));
  assert.equal(values.supplement.bindings.terminalReceiptDigest,h(bytes(paths.terminal)));
  assert.equal(values.terminal.externalDeliveryPredicates.length,5);
  for(const predicate of values.terminal.externalDeliveryPredicates){assert.equal(predicate.status,'REQUIRED_NOT_PRECLAIMED');assert.equal(predicate.providerIdentity,null);}
  assert.equal(values.lease.currentLease.status,'ACTIVE');assert.equal(values.lease.targetLease.status,'RELEASED');assert.equal(values.lease.targetLease.wip,0);
  assert.equal(values.terminal.activationOutcome.doneCount,67);assert.equal(values.terminal.activationOutcome.blockedTypedCount,3);assert.equal(values.terminal.activationOutcome.pendingCount,29);
  for(const value of Object.values(values)){if(value.sourcePlanRoles)assert.deepEqual(value.sourcePlanRoles,roles);if(Object.hasOwn(value,'programDone'))assert.equal(value.programDone,false);}
  return true;
}
test('WP600 complete carrier, protected-WIP, scheduler, graph and conditional terminal replay',()=>{
  assert.equal(verify(load()),true);
  const prefix='docs/OPS/R24/EVIDENCE/ES-R24-WP-600-FEATURESPEC-QUERY-IR-';
  const claim=buildClaimBinding(read(prefix+'CLAIM-BINDINGS.json'));
  for(const binding of claim.claimBindings)assert.equal(h(bytes(binding.filePath)),binding.sha256,binding.filePath);
  for(const binding of claim.implementationArtifactDigests)assert.equal(h(bytes(binding.path)),binding.sha256,binding.path);
  assert.ok(claim.nonClaims.includes(`EXTERNAL_SOURCE_PLAN_DIGEST:${roles.externalSourcePlanDigest}`));
  assert.ok(claim.nonClaims.includes(`COMPILED_PROGRAM_FILE_DIGEST:${roles.compiledProgramFileDigest}`));
  const missingNonClaims=structuredClone(claim);delete missingNonClaims.nonClaims;
  assert.throws(()=>buildClaimBinding(missingNonClaims),/E_CLAIM_BINDING_SCHEMA/);
  for(const kind of ['MODEL','CONTRACT','INTEGRATION','MUTANTS'])assert.deepEqual(read(prefix+kind+'.json').causal.parentStampIds,['ES-R24-WP-507-ATLAS-PRODUCT-CLAIM-CLAIM-BINDINGS']);
});

test('WP600 binds exact portable WP702 V2 terminal member and separate verification without an independent-auditor claim',()=>{
  const {predecessor,graph}=load();const durable=predecessor.durable,verification=predecessor.verification;
  assert.equal(h(Buffer.from(`${JSON.stringify(durable,null,2)}\n`)),predecessor.externalDurableCarrierSha256);
  assert.equal(h(Buffer.from(`${JSON.stringify(verification,null,2)}\n`)),predecessor.externalVerificationSha256);
  assert.equal(h(bytes(paths.graph)),predecessor.effectiveGraphBaselineSha256);
  const memberBytes=Buffer.from(durable.artifact.memberCanonicalBase64,'base64');
  assert.equal(memberBytes.length,durable.artifact.memberSizeBytes);assert.equal(h(memberBytes),durable.artifact.memberSha256);
  assert.equal(h(memberBytes),'0c3f966b35d0453f75b3048689df8d35178f27710cccc4f03675ca06a774e90b');
  const member=JSON.parse(memberBytes);
  assert.equal(member.status,'CERTIFIED_DONE');assert.equal(member.exactIdentity.mergeSha,'c3ff80a478ff75a23b87ef0bb4ce48049af4e46e');
  assert.equal(member.exactIdentity.candidateSha,'9657f3eaa797192fae2f4e3891548232c14c5173');
  assert.equal(durable.delivery.pullRequestNumber,1813);assert.equal(durable.delivery.candidate,33675622230);assert.equal(durable.delivery.postmerge,33679585495);
  assert.equal(verification.status,'PASS');assert.equal(verification.independentAuditorClaim,false);
  assert.equal(verification.leaseStatus,'RELEASED');assert.equal(verification.wip,0);
  assert.equal(verification.graphStatesDigest,canonicalDigest(graph.states));
  assert.equal(member.finalAcceptance.passedRows,18);assert.equal(member.finalAcceptance.pendingRows,0);
});

test('WP600 terminal hostile mutants reject old count regression, authority leakage and false release',()=>{
  const values=load();
  assert.equal(verify(values),true);
  const mutations=[
    (v)=>{v.before.entries.pop();},(v)=>{v.before.protectedDirtySet.pop();},(v)=>{v.graph.states['WP-507_ATLAS_PRODUCT_CLAIM']='BLOCKED_TYPED';},
    (v)=>{v.state.targetCounts.BLOCKED_TYPED=4;},(v)=>{v.state.targetCounts.PENDING=28;},(v)=>{v.state.targetStates['WP-703_DOCX_PROFILE']='DONE';},
    (v)=>{v.selection.schedulerReceipt.selectedId='WP-703_DOCX_PROFILE';},(v)=>{v.selection.frozenPlanStateMutated=true;},
    (v)=>{v.registry.currentTreeFallbackAllowed=true;},(v)=>{v.acceptance.externalRequiredCount=0;},
    (v)=>{v.terminal.status='CERTIFIED_DONE';},(v)=>{v.terminal.externalDeliveryPredicates[0].providerIdentity='SELF_PASS';},
    (v)=>{v.lease.targetLease.wip=1;},(v)=>{v.terminal.programDone=true;},(v)=>{v.terminal.sourcePlanRoles.compiledProgramFileDigest=v.terminal.sourcePlanRoles.externalSourcePlanDigest;},
  ];
  for(const mutate of mutations){const value=structuredClone(values);mutate(value);assert.throws(()=>verify(value));}
  assert.equal(mutations.length,15);
});
