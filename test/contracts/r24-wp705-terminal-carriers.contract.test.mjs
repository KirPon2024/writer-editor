import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import {canonicalDigest} from '../../scripts/ops/r24/canonical-json.mjs';
import {selectNext} from '../../scripts/ops/r24/scheduler.mjs';
import {buildCurrentG0Program} from '../../scripts/ops/r24/executable-program.mjs';
import {buildClaimBinding} from '../../scripts/ops/r24/claim-binding.mjs';
import {WP705_MAIN_PRODUCT_ADMISSION_EXPECTATION as E} from '../../scripts/ops/r24/corrective/post-audit-certification-set.mjs';
const P='docs/OPS/R24/CORRECTIVE/',EP='docs/OPS/R24/EVIDENCE/ES-R24-WP-705-NEGOTIATION-CORPUS-';
const h=b=>crypto.createHash('sha256').update(b).digest('hex');
const git=(...args)=>execFileSync('git',args,{encoding:null,maxBuffer:8*1024*1024});
const text=(...args)=>git(...args).toString().trim();
const paths={authority:E.authorityPath,instance:E.instancePath,admission:E.admissionPath,correction:E.correctionPath,selection:P+'WP705_MAIN_PRODUCT_SELECTION_RECEIPT_V1.json',before:E.protectedWipBeforePath,graph:P+'WP705_EFFECTIVE_GRAPH_BASELINE_V1.json',predecessor:P+'WP705_WP704_TERMINAL_PREDECESSOR_V1.json',registry:P+'WP705_CARRIER_REGISTRY_V1.json',acceptance:P+'WP705_ACCEPTANCE_MATRIX_V1.json',state:P+'WP705_EFFECTIVE_STATE_V1.json',stageRegistry:P+'WP705_STAGE_REGISTRY_V1.json',lease:P+'WP705_LEASE_RELEASE_V1.json',terminal:P+'WP705_TERMINAL_RECEIPT_V1.json',supplement:P+'WP705_TERMINAL_SUPPLEMENT_V1.json'};
// New artifact bytes evaluate at their immutable introduction commit, not the
// older admission base and never an ambient future checkout after publication.
const issueSha=text('log','--diff-filter=A','--format=%H','--max-count=1','--',paths.terminal);
if(!issueSha)assert.equal(text('ls-files','--',paths.terminal),'');
const bytes=path=>issueSha?git('show',issueSha+':'+path):fs.readFileSync(path);
const read=path=>JSON.parse(bytes(path));
const load=()=>Object.fromEntries(Object.entries(paths).map(([key,path])=>[key,read(path)]));
const roles={externalSourcePlanDigest:'1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a',compiledProgramFileDigest:'da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a',rolesDistinct:true};
const counts=states=>Object.fromEntries(['BLOCKED_TYPED','DONE','INELIGIBLE_OPTIONAL','PENDING'].map(s=>[s,Object.values(states).filter(v=>v===s).length]));
function verify(v){
  assert.equal(h(bytes(paths.authority)),E.authorityDigest);assert.equal(h(bytes(paths.instance)),E.instanceDigest);assert.equal(h(bytes(paths.admission)),E.admissionDigest);
  assert.equal(v.admission.writeSetDigest,E.writeSetDigest);assert.equal(v.authority.lease.fencingCounter,81);assert.equal(v.authority.lease.wip,1);assert.equal(v.authority.lease.predecessorReleaseDigest,E.predecessorReleaseDigest);
  const {snapshotSha256,...payload}=v.before;assert.equal(h(Buffer.from(JSON.stringify(payload)+'\n')),snapshotSha256);
  assert.equal(v.before.completeDenominator,264);assert.equal(v.before.entries.length,264);assert.equal(v.before.dirtyDenominator,9);assert.equal(v.before.protectedDirtySet.length,9);
  const c=v.correction,cb=c.protectedWip.correctionBefore,ca=c.protectedWip.afterIsolation;
  assert.equal(c.historicalDisposition.retroactiveAdmissionClaim,false);assert.equal(c.worktreeTransition.frozenOriginalHasExecutionLease,false);assert.equal(c.worktreeTransition.secondWriter,false);
  assert.equal(c.currentAdmission.authorityDigest,E.authorityDigest);assert.equal(c.currentAdmission.stageAdmissionDigest,E.admissionDigest);assert.equal(c.currentAdmission.writeDenominator,38);
  assert.equal(c.observation.value.actualFiles.length,16);assert.equal(c.exactOwnedByteCopy.copiedFiles.length,16);assert.equal(c.exactOwnedByteCopy.originalFilesMutated,false);
  assert.equal(cb.completeDenominator,265);assert.equal(cb.entries.length,265);assert.equal(cb.dirtyDenominator,10);assert.equal(cb.protectedDirtySet.length,10);
  assert.equal(c.protectedWip.frozenOriginalWp705ExactFileDenominator,16);assert.equal(c.protectedWip.frozenOriginalWp703ExactFileDenominator,8);
  const {snapshotSha256:cbHash,...cbBody}=cb,{snapshotSha256:caHash,...caBody}=ca;
  assert.equal(h(Buffer.from(JSON.stringify(cbBody)+'\n')),cbHash);assert.equal(cbHash,E.correctionProtectedWipSnapshotDigest);
  assert.equal(h(Buffer.from(JSON.stringify(caBody)+'\n')),caHash);assert.equal(caHash,E.afterIsolationSnapshotDigest);assert.deepEqual(cb.entries,ca.entries);
  for(const prior of v.before.entries)assert.deepEqual(cb.entries.find(e=>e.pathIdentitySha256===prior.pathIdentitySha256),prior);
  assert.equal(c.protectedWip.claimBoundary,'WORKTREE_IDENTITY_AND_GIT_STATUS_BYTES_NOT_USER_FILE_CONTENT_HASHES');
  assert.equal(v.graph.completeDenominator,109);assert.equal(Object.keys(v.graph.states).length,109);assert.equal(canonicalDigest(v.graph.states),v.graph.statesDigest);
  assert.deepEqual(counts(v.graph.states),{BLOCKED_TYPED:3,DONE:70,INELIGIBLE_OPTIONAL:10,PENDING:26});
  assert.deepEqual(v.state.currentCounts,counts(v.graph.states));assert.deepEqual(v.state.targetStates,{...v.graph.states,'WP-705_NEGOTIATION_CORPUS':'DONE'});
  assert.deepEqual(v.state.targetCounts,{BLOCKED_TYPED:3,DONE:71,INELIGIBLE_OPTIONAL:10,PENDING:25});
  assert.equal(v.selection.frozenPlanStateMutated,false);assert.equal(v.selection.logicalProjectionRevisionIsNotPlanStateCasRevision,true);
  const selection=v.selection,program=JSON.parse(git('show',selection.exactBase.sha+':docs/OPS/R24/EXECUTABLE_PROGRAM_R2_4.json'));
  assert.deepEqual(selectNext({program:buildCurrentG0Program(program),contourStates:v.graph.states,mission:selection.missionBinding,now:selection.schedulerReceipt.generatedAt}),selection.schedulerReceipt);
  assert.equal(selection.schedulerReceipt.selectedId,'WP-705_NEGOTIATION_CORPUS');assert.equal(selection.missionBinding.schedulerGraphDigest,canonicalDigest(program.nodes));assert.equal(selection.missionBinding.stateDigest,canonicalDigest(selection.effectiveStateProjection));
  assert.equal(selection.admission.stageAdmissionDigest,E.historicalAdmissionDigest);assert.equal(v.state.bindings.stageAdmissionDigest,E.admissionDigest);
  assert.equal(v.registry.byteIdentityRole,'ADMITTED_CANDIDATE_ARTIFACT_MANIFEST_NOT_BASE_TREE_CONTENTS');assert.equal(v.registry.carrierDenominator,29);assert.equal(v.registry.carriers.length,29);assert.equal(v.registry.currentTreeFallbackAllowed,false);assert.equal(v.registry.exactWriteSetDenominator,38);
  for(const binding of v.registry.carriers)assert.equal(h(bytes(binding.path)),binding.sha256,binding.path);
  assert.equal(v.acceptance.denominator,18);assert.equal(v.acceptance.rows.length,18);assert.equal(v.acceptance.localPassCount,12);assert.equal(v.acceptance.localRequiredCount,1);assert.equal(v.acceptance.externalRequiredCount,5);
  assert.equal(v.acceptance.rows.filter(r=>r.status==='PASS').length,12);assert.equal(v.acceptance.rows.filter(r=>r.status==='REQUIRED_NOT_PRECLAIMED').length,6);
  assert.equal(v.terminal.status,'CONDITIONAL_DONE_PENDING_REQUIRED_LOCAL_AND_EXTERNAL_PREDICATES');
  for(const [field,path] of [['leaseReleaseDigest',paths.lease],['acceptanceMatrixDigest',paths.acceptance],['effectiveStateDigest',paths.state]])assert.equal(v.terminal.bindings[field],h(bytes(path)));
  assert.equal(v.supplement.bindings.terminalReceiptDigest,h(bytes(paths.terminal)));assert.equal(v.terminal.externalDeliveryPredicates.length,5);
  for(const predicate of v.terminal.externalDeliveryPredicates){assert.equal(predicate.status,'REQUIRED_NOT_PRECLAIMED');assert.equal(predicate.providerIdentity,null);}
  assert.equal(v.lease.currentLease.status,'ACTIVE');assert.equal(v.lease.targetLease.status,'RELEASED');assert.equal(v.lease.targetLease.wip,0);assert.equal(v.lease.protectedWipProof.completeDenominator,265);assert.equal(v.lease.protectedWipProof.frozenOwnedDirtyDenominator,2);
  assert.equal(v.terminal.activationOutcome.doneCount,71);assert.equal(v.terminal.activationOutcome.blockedTypedCount,3);assert.equal(v.terminal.activationOutcome.pendingCount,25);
  for(const value of Object.values(v)){if(value.sourcePlanRoles)assert.deepEqual(value.sourcePlanRoles,roles);if(Object.hasOwn(value,'programDone'))assert.equal(value.programDone,false);}
  return true;
}
test('WP705 complete corrected carrier, protected-WIP, scheduler, graph and conditional terminal replay',()=>{
  assert.equal(verify(load()),true);
  const claim=buildClaimBinding(read(EP+'CLAIM-BINDINGS.json'));
  for(const binding of claim.claimBindings)assert.equal(h(bytes(binding.filePath)),binding.sha256,binding.filePath);
  for(const binding of claim.implementationArtifactDigests)assert.equal(h(bytes(binding.path)),binding.sha256,binding.path);
  assert(claim.nonClaims.includes('EXTERNAL_SOURCE_PLAN_DIGEST:'+roles.externalSourcePlanDigest));assert(claim.nonClaims.includes('COMPILED_PROGRAM_FILE_DIGEST:'+roles.compiledProgramFileDigest));
  const missing=structuredClone(claim);delete missing.nonClaims;assert.throws(()=>buildClaimBinding(missing),/E_CLAIM_BINDING_SCHEMA/);
  for(const kind of ['MODEL','CONTRACT','INTEGRATION','MUTANTS'])assert.deepEqual(read(EP+kind+'.json').causal.parentStampIds,['ES-R24-WP-704-PDF-ARCHIVE-REVIEW-CLAIM-BINDINGS']);
});
test('WP705 binds portable exact WP704 terminal and distinct source roles without rewriting prior delivery identity',()=>{
  const {predecessor,graph}=load(),durable=predecessor.durable,verification=predecessor.verification;
  assert.equal(h(Buffer.from(JSON.stringify(durable,null,2)+'\n')),predecessor.externalDurableCarrierSha256);assert.equal(h(Buffer.from(JSON.stringify(verification,null,2)+'\n')),predecessor.externalVerificationSha256);
  assert.equal(h(bytes(paths.graph)),predecessor.effectiveGraphBaselineSha256);
  const memberBytes=Buffer.from(durable.artifact.memberCanonicalBase64,'base64');
  assert.equal(memberBytes.length,durable.artifact.memberSizeBytes);assert.equal(h(memberBytes),durable.artifact.memberSha256);assert.equal(h(memberBytes),'12f8a0e289d1865caefbe7944b64309842a6d14b9c12aa2f218134d2ef813d3c');
  const member=JSON.parse(memberBytes);assert.equal(member.status,'CERTIFIED_DONE');assert.equal(member.exactIdentity.mergeSha,E.baseSha);assert.equal(member.exactIdentity.candidateSha,'e80362e9e2c396e2ab2574ace74827c909020f62');
  assert.equal(durable.delivery.pullRequestNumber,1817);assert.equal(durable.delivery.candidate,33716651986);assert.equal(durable.delivery.postmerge,33717278736);
  assert.equal(verification.status,'PASS');assert.equal(verification.independentAuditorClaim,false);assert.equal(verification.leaseStatus,'RELEASED');assert.equal(verification.wip,0);assert.equal(verification.graphStatesDigest,canonicalDigest(graph.states));
  assert.equal(member.finalAcceptance.passedRows,18);assert.equal(member.finalAcceptance.pendingRows,0);
});
test('WP705 hostile terminal mutations reject false release, lost WIP, retroactive approval and false graph claims',()=>{
  const values=load();assert.equal(verify(values),true);
  const mutations=[v=>v.before.entries.pop(),v=>v.correction.protectedWip.correctionBefore.entries.pop(),v=>v.correction.protectedWip.afterIsolation.entries[0].head='0'.repeat(40),
    v=>v.correction.historicalDisposition.retroactiveAdmissionClaim=true,v=>v.correction.worktreeTransition.frozenOriginalHasExecutionLease=true,v=>v.correction.exactOwnedByteCopy.copiedFiles.pop(),
    v=>v.graph.states['WP-507_ATLAS_PRODUCT_CLAIM']='BLOCKED_TYPED',v=>v.state.targetCounts.DONE=70,v=>v.state.targetCounts.PENDING=26,v=>v.state.targetStates['WP-704_PDF_ARCHIVE_REVIEW']='PENDING',
    v=>v.selection.schedulerReceipt.selectedId='WP-706_WORD_REPORT',v=>v.selection.frozenPlanStateMutated=true,v=>v.registry.currentTreeFallbackAllowed=true,v=>v.acceptance.externalRequiredCount=0,
    v=>v.terminal.status='CERTIFIED_DONE',v=>v.terminal.externalDeliveryPredicates[0].providerIdentity='SELF_PASS',v=>v.lease.targetLease.wip=1,v=>v.terminal.programDone=true,v=>v.terminal.sourcePlanRoles.compiledProgramFileDigest=v.terminal.sourcePlanRoles.externalSourcePlanDigest];
  for(const mutate of mutations){const value=structuredClone(values);mutate(value);assert.throws(()=>verify(value));}assert.equal(mutations.length,19);
});
test('WP705 corpus evidence closes field, hostile, mutant and local-file denominators without a physical-provider claim',()=>{
  const evidence=read(EP+'INTEGRATION.json').artifact,envelope=evidence.testEnvelope,raw=evidence.rawEvidence;
  const tap=Buffer.from(raw.stdoutBase64,'base64');assert.equal(h(tap),raw.sha256);assert.equal(tap.length,raw.byteLength);assert.equal(raw.testDenominator,16);assert.equal(raw.passed,16);assert.equal(raw.failed,0);assert.equal(raw.skipped,0);assert.equal(raw.todo,0);
  assert.equal(envelope.dimensionDenominator,14);assert.equal(envelope.dimensions.length,14);assert.equal(envelope.deterministicCampaign.independentDocumentCases,96);assert.equal(envelope.deterministicCampaign.exactSourceFieldComparisons,3781);assert.equal(envelope.deterministicCampaign.preservedTextComparisons,667);assert.equal(envelope.deterministicCampaign.explicitLossComparisons,3114);assert.equal(envelope.deterministicCampaign.replayHopDenominator,576);
  assert.equal(envelope.hostileCorpus.deterministicHostileCases,512);assert.equal(envelope.hostileCorpus.rejected,512);assert.equal(envelope.physicalLocalFiles.physicalLocalFileDenominator,5);assert.equal(envelope.physicalLocalFiles.physicalProviderClaim,false);
  assert.equal(envelope.implementationMutants.killed,22);assert.equal(envelope.implementationMutants.survivors,0);assert.equal(envelope.implementationMutants.syntaxOrImportFailuresCountedAsKills,false);
  for(const binding of evidence.implementationArtifacts)assert.equal(h(bytes(binding.path)),binding.sha256);
  const fixture=read(P+'WP705_FIXTURE_MANIFEST_V1.json'),feature=read(P+'WP705_FEATURE_INTEGRATION_MANIFEST_V1.json'),contract=read(P+'WP705_DOWNGRADE_CONTRACT_V1.json');
  assert.equal(fixture.noUserDocuments,true);assert.equal(fixture.physicalProviderClaim,false);assert.equal(feature.securityBoundary.networkRequests,0);assert.equal(feature.securityBoundary.productAuthority,false);
  assert.equal(contract.negotiation.schemaMatchGrantsAuthority,false);assert.equal(contract.replay.physicalProviderClaim,false);
});
