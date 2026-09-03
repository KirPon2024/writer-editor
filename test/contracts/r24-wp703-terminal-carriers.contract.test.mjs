import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import {canonicalDigest} from '../../scripts/ops/r24/canonical-json.mjs';
import {selectNext} from '../../scripts/ops/r24/scheduler.mjs';
import {buildCurrentG0Program} from '../../scripts/ops/r24/executable-program.mjs';
import {buildClaimBinding} from '../../scripts/ops/r24/claim-binding.mjs';
const P='docs/OPS/R24/CORRECTIVE/',EP='docs/OPS/R24/EVIDENCE/ES-R24-WP-703-DOCX-PROFILE-';
const h=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const git=(...args)=>execFileSync('git',args,{encoding:null,maxBuffer:16*1024*1024});
const text=(...args)=>git(...args).toString().trim();
const paths={authority:P+'WP703_MAIN_PRODUCT_OWNER_AUTHORITY_AMENDMENT_V1.json',instance:P+'WP703_MAIN_PRODUCT_STAGE_INSTANCE_V2.json',admission:P+'WP703_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V2.json',correction:P+'WP703_ADMISSION_PATH_CORRECTION_V1.json',selection:P+'WP703_MAIN_PRODUCT_SELECTION_RECEIPT_V1.json',historicalBefore:P+'WP703_PROTECTED_WIP_BEFORE_V1.json',graph:P+'WP703_EFFECTIVE_GRAPH_BASELINE_V1.json',predecessor:P+'WP703_WP600_TERMINAL_PREDECESSOR_V1.json',registry:P+'WP703_CARRIER_REGISTRY_V1.json',acceptance:P+'WP703_ACCEPTANCE_MATRIX_V1.json',state:P+'WP703_EFFECTIVE_STATE_V1.json',stageRegistry:P+'WP703_STAGE_REGISTRY_V1.json',lease:P+'WP703_LEASE_RELEASE_V1.json',terminal:P+'WP703_TERMINAL_RECEIPT_V1.json',supplement:P+'WP703_TERMINAL_SUPPLEMENT_V1.json'};
const issueSha=text('log','--diff-filter=A','--format=%H','--max-count=1','--',paths.terminal);
if(!issueSha)assert.equal(text('ls-files','--',paths.terminal),'');
const bytes=file=>issueSha?git('show',`${issueSha}:${file}`):fs.readFileSync(file);
const read=file=>JSON.parse(bytes(file));
const load=()=>Object.fromEntries(Object.entries(paths).map(([key,file])=>[key,read(file)]));
const roles={externalSourcePlanDigest:'1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a',compiledProgramFileDigest:'da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a',rolesDistinct:true};
const counts=states=>Object.fromEntries(['BLOCKED_TYPED','DONE','INELIGIBLE_OPTIONAL','PENDING'].map(s=>[s,Object.values(states).filter(v=>v===s).length]));
function verify(v){
  assert.equal(h(bytes(paths.authority)),'ebe0cb273186af33832437a419faba6d1efaadda11ffb6e59275c99d7a0c0a1a');
  assert.equal(h(bytes(paths.instance)),'b3c9096180fc66b4472766ea9fdbbfa549a6a43098aa7b5a32c48fda0812c7f2');
  assert.equal(h(bytes(paths.admission)),'84e06d35a017e74812641d92d2f079b4426e68376072ed9e2f2f867536a0b31d');
  assert.equal(v.admission.writeSetDigest,'6fdd80161c9600a9b90649c839390a44b67e2a5c2ec82f90c7a556d8d661c5e7');
  assert.equal(v.authority.lease.fencingCounter,78);assert.equal(v.authority.lease.wip,1);
  assert.equal(v.authority.lease.predecessorReleaseDigest,'eee881e38c39fdabfac38f9d512a762d834544c2371e1c50e874c5b4d0afd6c0');
  const before=v.correction.protectedWip.newBeforeSnapshot,{snapshotSha256,...payload}=before;
  assert.equal(h(Buffer.from(JSON.stringify(payload)+'\n')),snapshotSha256);assert.equal(h(Buffer.from(JSON.stringify(before)+'\n')),'90a596913a461de3edcee2b081efe0f3f4c6bba963fc17a3d30df6b4e4881ee0');
  assert.equal(before.completeDenominator,261);assert.equal(before.entries.length,261);assert.equal(before.dirtyDenominator,9);assert.equal(before.protectedDirtySet.length,9);assert.equal(before.excludedTaskWorktrees.length,2);
  assert.equal(v.historicalBefore.entries.length,260);assert.equal(v.historicalBefore.dirtyDenominator,8);
  for(const entry of v.historicalBefore.entries)assert.deepEqual(before.entries.find(e=>e.pathIdentitySha256===entry.pathIdentitySha256),entry);
  assert.equal(v.correction.historicalDisposition.retroactiveAdmissionClaim,false);assert.equal(v.correction.worktreeTransition.frozenOriginalHasExecutionLease,false);assert.equal(v.correction.worktreeTransition.secondWriter,false);
  assert.equal(v.correction.preflight.worktreeDirty,false);assert.equal(v.correction.preflight.completedBeforeContinuationWrites,true);
  assert.equal(v.correction.currentAdmission.stageAdmissionDigest,h(bytes(paths.admission)));
  assert.equal(v.graph.completeDenominator,109);assert.equal(Object.keys(v.graph.states).length,109);assert.equal(canonicalDigest(v.graph.states),v.graph.statesDigest);
  assert.deepEqual(counts(v.graph.states),{BLOCKED_TYPED:3,DONE:67,INELIGIBLE_OPTIONAL:10,PENDING:29});
  assert.deepEqual(v.state.currentCounts,counts(v.graph.states));assert.deepEqual(v.state.targetStates,{...v.graph.states,'WP-703_DOCX_PROFILE':'DONE'});
  assert.deepEqual(v.state.targetCounts,{BLOCKED_TYPED:3,DONE:68,INELIGIBLE_OPTIONAL:10,PENDING:28});
  const fresh=v.correction.freshIdentity,program=JSON.parse(git('show',`${v.authority.baseSha}:docs/OPS/R24/EXECUTABLE_PROGRAM_R2_4.json`));
  assert.deepEqual(selectNext({program:buildCurrentG0Program(program),contourStates:v.graph.states,mission:fresh.mission,now:fresh.receipt.generatedAt}),fresh.receipt);
  assert.equal(fresh.receipt.selectedId,'WP-703_DOCX_PROFILE');assert.equal(canonicalDigest(fresh.g0.epoch),fresh.g0.epochDigest);
  assert.equal(fresh.g0.epoch.singleWriterLease.fencingCounter,78);assert.equal(fresh.g0.sourcePlanStateMutated,false);assert.equal(v.selection.frozenPlanStateMutated,false);
  assert.equal(v.registry.byteIdentityRole,'ADMITTED_CANDIDATE_ARTIFACT_MANIFEST_NOT_BASE_TREE_CONTENTS');assert.equal(v.registry.currentTreeFallbackAllowed,false);
  assert.equal(v.registry.carrierDenominator,25);assert.equal(v.registry.carriers.length,25);
  for(const binding of v.registry.carriers)assert.equal(h(bytes(binding.path)),binding.sha256,binding.path);
  assert.equal(v.acceptance.denominator,18);assert.equal(v.acceptance.rows.length,18);assert.equal(v.acceptance.localPassCount,12);assert.equal(v.acceptance.localRequiredCount,1);assert.equal(v.acceptance.externalRequiredCount,5);
  assert.equal(v.acceptance.rows.filter(r=>r.status==='PASS').length,12);assert.equal(v.acceptance.rows.filter(r=>r.status==='REQUIRED_NOT_PRECLAIMED').length,6);
  assert.equal(v.terminal.status,'CONDITIONAL_DONE_PENDING_REQUIRED_LOCAL_AND_EXTERNAL_PREDICATES');
  for(const [field,key] of [['authorityDigest','authority'],['stageInstanceDigest','instance'],['stageAdmissionDigest','admission'],['correctionCarrierDigest','correction'],['acceptanceMatrixDigest','acceptance'],['effectiveStateDigest','state'],['stageRegistryDigest','stageRegistry'],['leaseReleaseDigest','lease']])assert.equal(v.terminal.bindings[field],h(bytes(paths[key])));
  assert.equal(v.supplement.bindings.terminalReceiptDigest,h(bytes(paths.terminal)));
  assert.equal(v.terminal.externalDeliveryPredicates.length,5);for(const predicate of v.terminal.externalDeliveryPredicates){assert.equal(predicate.status,'REQUIRED_NOT_PRECLAIMED');assert.equal(predicate.providerIdentity,null);}
  assert.equal(v.lease.currentLease.status,'ACTIVE');assert.equal(v.lease.targetLease.status,'RELEASED');assert.equal(v.lease.targetLease.fencingCounter,78);assert.equal(v.lease.targetLease.wip,0);
  assert.equal(v.lease.protectedWipProof.completeDenominator,261);assert.equal(v.lease.protectedWipProof.unrelatedDirtyDenominator,8);assert.equal(v.lease.protectedWipProof.frozenOwnedDirtyDenominator,1);
  assert.equal(v.terminal.activationOutcome.doneCount,68);assert.equal(v.terminal.activationOutcome.pendingCount,28);assert.equal(v.terminal.activationOutcome.blockedTypedCount,3);
  for(const value of Object.values(v)){if(value.sourcePlanRoles)assert.deepEqual(value.sourcePlanRoles,roles);if(Object.hasOwn(value,'programDone'))assert.equal(value.programDone,false);}
  return true;
}
test('WP703 replays corrected admission complete graph exact carrier bytes and conditional terminal predicates',()=>{
  assert.equal(verify(load()),true);
  const claim=buildClaimBinding(read(EP+'CLAIM-BINDINGS.json'));
  for(const binding of claim.claimBindings)assert.equal(h(bytes(binding.filePath)),binding.sha256);
  for(const binding of claim.implementationArtifactDigests)assert.equal(h(bytes(binding.path)),binding.sha256);
  assert(claim.nonClaims.includes(`EXTERNAL_SOURCE_PLAN_DIGEST:${roles.externalSourcePlanDigest}`));assert(claim.nonClaims.includes(`COMPILED_PROGRAM_FILE_DIGEST:${roles.compiledProgramFileDigest}`));
  for(const kind of ['MODEL','CONTRACT','INTEGRATION','MUTANTS'])assert.deepEqual(read(EP+kind+'.json').causal.parentStampIds,['ES-R24-WP-702-TEXT-FORMATS-CLAIM-BINDINGS']);
});
test('WP703 binds the verified WP600 terminal ZIP member and preserves its exact PR1814 identities',()=>{
  const {predecessor,graph}=load(),{durable,verification}=predecessor;
  assert.equal(h(Buffer.from(JSON.stringify(durable,null,2)+'\n')),predecessor.externalDurableCarrierSha256);
  assert.equal(h(Buffer.from(JSON.stringify(verification,null,2)+'\n')),predecessor.externalVerificationSha256);
  const memberBytes=Buffer.from(durable.artifact.memberCanonicalBase64,'base64');assert.equal(h(memberBytes),durable.artifact.memberSha256);assert.equal(memberBytes.length,durable.artifact.memberSizeBytes);
  assert.equal(h(memberBytes),'024e8b8cb2a85e89ce8ecdb4cbf04087e2089d6ce14cd699ee5ac6bc49664750');
  const member=JSON.parse(memberBytes);assert.equal(member.status,'CERTIFIED_DONE');assert.equal(member.exactIdentity.candidateSha,'6e6460b5c2f6ab2f6a878cc69279c12c0d101e5a');assert.equal(member.exactIdentity.mergeSha,'48dfd205f3d368e2b8035210fa15037cc2ed4af9');
  assert.equal(durable.delivery.pullRequestNumber,1814);assert.equal(durable.delivery.candidate,33690753869);assert.equal(durable.delivery.postmerge,33691625906);
  assert.equal(verification.status,'PASS');assert.equal(verification.independentAuditorClaim,false);assert.equal(verification.leaseStatus,'RELEASED');assert.equal(verification.wip,0);assert.equal(verification.graphStatesDigest,canonicalDigest(graph.states));
  assert.equal(member.finalAcceptance.passedRows,18);assert.equal(member.finalAcceptance.pendingRows,0);
});
test('WP703 terminal hostile mutants reject historical rewrites count loss premature release and Word authority',()=>{
  const values=load();assert.equal(verify(values),true);
  const mutants=[v=>v.correction.protectedWip.newBeforeSnapshot.entries.pop(),v=>v.correction.protectedWip.newBeforeSnapshot.protectedDirtySet.pop(),v=>{v.correction.worktreeTransition.secondWriter=true;},v=>{v.correction.historicalDisposition.retroactiveAdmissionClaim=true;},v=>{v.correction.preflight.worktreeDirty=true;},v=>{v.state.targetCounts.DONE=69;},v=>{v.state.targetStates['WP-706_WORD_REPORT']='DONE';},v=>{v.registry.currentTreeFallbackAllowed=true;},v=>{v.acceptance.externalRequiredCount=0;},v=>{v.terminal.status='CERTIFIED_DONE';},v=>{v.terminal.externalDeliveryPredicates[0].providerIdentity='SELF_PASS';},v=>{v.lease.targetLease.wip=1;},v=>{v.lease.protectedWipProof.unrelatedDirtyDenominator=9;},v=>{v.terminal.programDone=true;},v=>{v.terminal.sourcePlanRoles.compiledProgramFileDigest=v.terminal.sourcePlanRoles.externalSourcePlanDigest;},v=>{v.correction.freshIdentity.receipt.selectedId='WP-601_LOCAL_AUTOMATION';}];
  for(const mutate of mutants){const v=structuredClone(values);mutate(v);assert.throws(()=>verify(v));}
  assert.equal(mutants.length,16);
});
