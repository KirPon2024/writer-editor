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
const paths={authority:P+'WP704_MAIN_PRODUCT_OWNER_AUTHORITY_V1.json',instance:P+'WP704_MAIN_PRODUCT_STAGE_INSTANCE_V1.json',admission:P+'WP704_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V1.json',
  selection:P+'WP704_MAIN_PRODUCT_SELECTION_RECEIPT_V1.json',before:P+'WP704_PROTECTED_WIP_BEFORE_V1.json',graph:P+'WP704_EFFECTIVE_GRAPH_BASELINE_V1.json',predecessor:P+'WP704_WP601_TERMINAL_PREDECESSOR_V1.json',
  registry:P+'WP704_CARRIER_REGISTRY_V1.json',acceptance:P+'WP704_ACCEPTANCE_MATRIX_V1.json',state:P+'WP704_EFFECTIVE_STATE_V1.json',stageRegistry:P+'WP704_STAGE_REGISTRY_V1.json',lease:P+'WP704_LEASE_RELEASE_V1.json',terminal:P+'WP704_TERMINAL_RECEIPT_V1.json',supplement:P+'WP704_TERMINAL_SUPPLEMENT_V1.json'};
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
  assert.equal(h(bytes(paths.authority)),'8419a5b5eb45ea78cc201a2b9ead3f0e57a75b721807c57679edf12eb857879b');
  assert.equal(h(bytes(paths.instance)),'8ba6431912aab50f2be949e214888dfbc1e7b03fae5661d252536fc88bf371c9');
  assert.equal(h(bytes(paths.admission)),'672508ae87af2e5111f9aa7e08446b721a77bf9726ca784ece2bd7e1aba18c69');
  assert.equal(values.admission.writeSetDigest,'c4ee3ea64e99104bb69cd27ed54dc0a63bc07d7936b0f53c46cd17e0f9a4b363');
  assert.equal(values.authority.lease.fencingCounter,80);assert.equal(values.authority.lease.wip,1);
  assert.equal(values.authority.lease.predecessorReleaseDigest,'f35cdca1963b8b1b9c637a5b039193e5258289f2fcb742170be95a31e21feef5');
  const {snapshotSha256,...payload}=values.before;
  assert.equal(h(Buffer.from(`${JSON.stringify(payload)}\n`)),snapshotSha256);
  assert.equal(values.before.completeDenominator,263);assert.equal(values.before.entries.length,263);
  assert.equal(values.before.presentDenominator,263);assert.equal(values.before.prunableDenominator,0);
  assert.equal(values.before.dirtyDenominator,9);assert.equal(values.before.protectedDirtySet.length,9);assert.equal(values.before.excludedTaskWorktrees.length,2);
  assert.equal(values.graph.completeDenominator,109);assert.equal(Object.keys(values.graph.states).length,109);
  assert.equal(canonicalDigest(values.graph.states),values.graph.statesDigest);
  assert.deepEqual(counts(values.graph.states),{BLOCKED_TYPED:3,DONE:69,INELIGIBLE_OPTIONAL:10,PENDING:27});
  assert.deepEqual(values.state.currentCounts,counts(values.graph.states));
  assert.deepEqual(values.state.targetStates,{...values.graph.states,'WP-704_PDF_ARCHIVE_REVIEW':'DONE'});
  assert.deepEqual(values.state.targetCounts,{BLOCKED_TYPED:3,DONE:70,INELIGIBLE_OPTIONAL:10,PENDING:26});
  assert.equal(values.selection.frozenPlanStateMutated,false);
  assert.equal(values.selection.logicalProjectionRevisionIsNotPlanStateCasRevision,true);
  const selection=values.selection,program=JSON.parse(git('show',`${selection.exactBase.sha}:docs/OPS/R24/EXECUTABLE_PROGRAM_R2_4.json`));
  assert.deepEqual(selectNext({program:buildCurrentG0Program(program),contourStates:values.graph.states,mission:selection.missionBinding,now:selection.schedulerReceipt.generatedAt}),selection.schedulerReceipt);
  assert.equal(selection.schedulerReceipt.selectedId,'WP-704_PDF_ARCHIVE_REVIEW');
  assert.equal(selection.missionBinding.schedulerGraphDigest,canonicalDigest(program.nodes));
  assert.equal(selection.missionBinding.stateDigest,canonicalDigest(selection.effectiveStateProjection));
  assert.equal(selection.missionBinding.policyDigest,h(git('show',`${selection.exactBase.sha}:docs/OPS/R24/AUTONOMY_CONTROL_PLANE_R2_4.json`)));
  assert.equal(values.registry.byteIdentityRole,'ADMITTED_CANDIDATE_ARTIFACT_MANIFEST_NOT_BASE_TREE_CONTENTS');
  assert.equal(values.registry.carrierDenominator,26);assert.equal(values.registry.carriers.length,26);
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
  assert.equal(values.terminal.activationOutcome.doneCount,70);assert.equal(values.terminal.activationOutcome.blockedTypedCount,3);assert.equal(values.terminal.activationOutcome.pendingCount,26);
  for(const value of Object.values(values)){if(value.sourcePlanRoles)assert.deepEqual(value.sourcePlanRoles,roles);if(Object.hasOwn(value,'programDone'))assert.equal(value.programDone,false);}
  return true;
}
test('WP704 complete carrier, protected-WIP, scheduler, graph and conditional terminal replay',()=>{
  assert.equal(verify(load()),true);
  const prefix='docs/OPS/R24/EVIDENCE/ES-R24-WP-704-PDF-ARCHIVE-REVIEW-';
  const claim=buildClaimBinding(read(prefix+'CLAIM-BINDINGS.json'));
  for(const binding of claim.claimBindings)assert.equal(h(bytes(binding.filePath)),binding.sha256,binding.filePath);
  for(const binding of claim.implementationArtifactDigests)assert.equal(h(bytes(binding.path)),binding.sha256,binding.path);
  assert.ok(claim.nonClaims.includes(`EXTERNAL_SOURCE_PLAN_DIGEST:${roles.externalSourcePlanDigest}`));
  assert.ok(claim.nonClaims.includes(`COMPILED_PROGRAM_FILE_DIGEST:${roles.compiledProgramFileDigest}`));
  const missingNonClaims=structuredClone(claim);delete missingNonClaims.nonClaims;
  assert.throws(()=>buildClaimBinding(missingNonClaims),/E_CLAIM_BINDING_SCHEMA/);
  for(const kind of ['MODEL','CONTRACT','INTEGRATION','MUTANTS'])assert.deepEqual(read(prefix+kind+'.json').causal.parentStampIds,['ES-R24-WP-703-DOCX-PROFILE-CLAIM-BINDINGS']);
});

test('WP704 binds exact portable WP601 terminal member and separate verification without an independent-auditor claim',()=>{
  const {predecessor,graph}=load();const durable=predecessor.durable,verification=predecessor.verification;
  assert.equal(h(Buffer.from(`${JSON.stringify(durable,null,2)}\n`)),predecessor.externalDurableCarrierSha256);
  assert.equal(h(Buffer.from(`${JSON.stringify(verification,null,2)}\n`)),predecessor.externalVerificationSha256);
  assert.equal(h(bytes(paths.graph)),predecessor.effectiveGraphBaselineSha256);
  const memberBytes=Buffer.from(durable.artifact.memberCanonicalBase64,'base64');
  assert.equal(memberBytes.length,durable.artifact.memberSizeBytes);assert.equal(h(memberBytes),durable.artifact.memberSha256);
  assert.equal(h(memberBytes),'3643f684a2f2a07d4bb11165e93b6c4f3e0c0e25ee16addf7316b6c4f51cd2f9');
  const member=JSON.parse(memberBytes);
  assert.equal(member.status,'CERTIFIED_DONE');assert.equal(member.exactIdentity.mergeSha,'420fc31a7af6aca9c1b2aa60750b9f19e66f373d');
  assert.equal(member.exactIdentity.candidateSha,'54b780fd55f0022a12db2182a73340d6bc4a4c41');
  assert.equal(durable.delivery.pullRequestNumber,1816);assert.equal(durable.delivery.candidate,33707979994);assert.equal(durable.delivery.postmerge,33708688393);
  assert.equal(verification.status,'PASS');assert.equal(verification.independentAuditorClaim,false);
  assert.equal(verification.leaseStatus,'RELEASED');assert.equal(verification.wip,0);
  assert.equal(verification.graphStatesDigest,canonicalDigest(graph.states));
  assert.equal(member.finalAcceptance.passedRows,18);assert.equal(member.finalAcceptance.pendingRows,0);
});

test('WP704 terminal hostile mutants reject old count regression, authority leakage and false release',()=>{
  const values=load();
  assert.equal(verify(values),true);
  const mutations=[
    (v)=>{v.before.entries.pop();},(v)=>{v.before.protectedDirtySet.pop();},(v)=>{v.graph.states['WP-507_ATLAS_PRODUCT_CLAIM']='BLOCKED_TYPED';},
    (v)=>{v.state.targetCounts.BLOCKED_TYPED=4;},(v)=>{v.state.targetCounts.PENDING=28;},(v)=>{v.state.targetStates['WP-600_FEATURESPEC_QUERY_IR']='PENDING';},
    (v)=>{v.selection.schedulerReceipt.selectedId='WP-703_DOCX_PROFILE';},(v)=>{v.selection.frozenPlanStateMutated=true;},
    (v)=>{v.registry.currentTreeFallbackAllowed=true;},(v)=>{v.acceptance.externalRequiredCount=0;},
    (v)=>{v.terminal.status='CERTIFIED_DONE';},(v)=>{v.terminal.externalDeliveryPredicates[0].providerIdentity='SELF_PASS';},
    (v)=>{v.lease.targetLease.wip=1;},(v)=>{v.terminal.programDone=true;},(v)=>{v.terminal.sourcePlanRoles.compiledProgramFileDigest=v.terminal.sourcePlanRoles.externalSourcePlanDigest;},
  ];
  for(const mutate of mutations){const value=structuredClone(values);mutate(value);assert.throws(()=>verify(value));}
  assert.equal(mutations.length,15);
});

test('WP704 physical PDF evidence binds exact bytes, declared Unicode loss and all three visual pages',()=>{
  const prefix='docs/OPS/R24/EVIDENCE/ES-R24-WP-704-PDF-ARCHIVE-REVIEW-';
  const evidence=read(prefix+'INTEGRATION.json').artifact,physical=evidence.physicalEvidence;
  assert.equal(physical.render.status,'PASS');assert.equal(physical.render.repeatedRenderDenominator,2);assert.equal(physical.render.repeatedEqual,true);
  assert.equal(physical.independent.status,'PASS');assert.equal(physical.independent.textCheckDenominator,47);
  assert.equal(physical.independent.exactTextChecks,46);assert.equal(physical.independent.declaredLossChecks,1);assert.equal(physical.independent.failedChecks,0);
  assert.equal(physical.independent.pdfSha256,physical.render.pdfSha256);
  assert.equal(physical.visual.pdfSha256,physical.render.pdfSha256);assert.equal(physical.visual.pageDenominator,3);assert.equal(physical.visual.pages.length,3);
  assert.equal(physical.visual.oracle,'MAIN_WRITER_DIRECT_PNG_INSPECTION_NOT_INDEPENDENT_AUDITOR');
  assert.equal(physical.render.crossPlatformByteEqualityClaim,false);assert.equal(physical.independent.exactUnicodeRoundtripClaim,false);
  for(const binding of physical.render.implementationArtifacts)assert.equal(h(bytes(binding.path)),binding.sha256);
  const source=read(P+'WP704_SEALED_SOURCE_READ_RECEIPT_V1.json');assert.equal(source.status,'VERIFIED_AND_READ');assert.equal(source.extracted,false);
  assert.equal(source.member.sha256,'23e0c4cea39f3a393ae5e50eeb22d8ceb63e2f1ee9e4ef9d2e7bab2139af08e0');assert.equal(source.referenceRole,'REFERENCE_ONLY_NOT_ACTIVE_LAW');
  const fixture=read(P+'WP704_FIXTURE_MANIFEST_V1.json'),feature=read(P+'WP704_FEATURE_INTEGRATION_MANIFEST_V1.json');
  assert.equal(fixture.noUserDocuments,true);assert.equal(feature.securityBoundary.productNetworkRequests,0);assert.equal(feature.persistenceClass,'NO_PRODUCT_PERSISTENCE_OR_PROVIDER_TRUTH');
  const altered=structuredClone(physical);altered.independent.exactUnicodeRoundtripClaim=true;
  assert.throws(()=>assert.equal(altered.independent.exactUnicodeRoundtripClaim,false));
});
