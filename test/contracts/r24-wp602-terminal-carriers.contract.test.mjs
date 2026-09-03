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
const paths={authority:P+'WP602_MAIN_PRODUCT_OWNER_AUTHORITY_V1.json',instance:P+'WP602_MAIN_PRODUCT_STAGE_INSTANCE_V1.json',admission:P+'WP602_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V1.json',
  selection:P+'WP602_MAIN_PRODUCT_SELECTION_RECEIPT_V1.json',before:P+'WP602_PROTECTED_WIP_BEFORE_V1.json',graph:P+'WP602_EFFECTIVE_GRAPH_BASELINE_V1.json',predecessor:P+'WP602_WP705_TERMINAL_PREDECESSOR_V1.json',
  sealed:P+'WP602_SEALED_SOURCE_READ_RECEIPT_V1.json',registry:P+'WP602_CARRIER_REGISTRY_V1.json',acceptance:P+'WP602_ACCEPTANCE_MATRIX_V1.json',state:P+'WP602_EFFECTIVE_STATE_V1.json',stageRegistry:P+'WP602_STAGE_REGISTRY_V1.json',lease:P+'WP602_LEASE_RELEASE_V1.json',terminal:P+'WP602_TERMINAL_RECEIPT_V1.json',supplement:P+'WP602_TERMINAL_SUPPLEMENT_V1.json'};
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
  assert.equal(h(bytes(paths.authority)),'c2244c51c35fb29a19ff8d1ba3c0a5c8f7da69fe43370a230015b374dd4a4f1a');
  assert.equal(h(bytes(paths.instance)),'d0b65b56c9b8924958ca35d4aa714ebbd9307e495073621d296e9fc91f1d5144');
  assert.equal(h(bytes(paths.admission)),'51eac019b137d564b3cac87ffd03ea91ec57f2de8b4e062b6e2307957588e76f');
  assert.equal(values.admission.writeSetDigest,'c5e7cca3723c35327e87451714c4a34cf62bc1de56f00a9af045c2e07b453011');
  assert.equal(values.authority.lease.fencingCounter,82);assert.equal(values.authority.lease.wip,1);
  assert.equal(values.authority.lease.predecessorReleaseDigest,'f4226a5b3e775ffa2a92ef8bb71ac8e0ece19ae17caa9bc8a722258482694589');
  const {snapshotSha256,...payload}=values.before;
  assert.equal(h(Buffer.from(`${JSON.stringify(payload)}\n`)),snapshotSha256);
  assert.equal(values.before.completeDenominator,266);assert.equal(values.before.entries.length,266);
  assert.equal(values.before.presentDenominator,266);assert.equal(values.before.prunableDenominator,0);
  assert.equal(values.before.dirtyDenominator,10);assert.equal(values.before.protectedDirtySet.length,10);assert.equal(values.before.excludedTaskWorktrees.length,2);
  assert.equal(values.graph.completeDenominator,109);assert.equal(Object.keys(values.graph.states).length,109);
  assert.equal(canonicalDigest(values.graph.states),values.graph.statesDigest);
  assert.deepEqual(counts(values.graph.states),{BLOCKED_TYPED:3,DONE:71,INELIGIBLE_OPTIONAL:10,PENDING:25});
  assert.deepEqual(values.state.currentCounts,counts(values.graph.states));
  assert.deepEqual(values.state.targetStates,{...values.graph.states,'WP-602_PROPOSAL_WORKFLOW':'DONE'});
  assert.deepEqual(values.state.targetCounts,{BLOCKED_TYPED:3,DONE:72,INELIGIBLE_OPTIONAL:10,PENDING:24});
  assert.equal(values.selection.frozenPlanStateMutated,false);
  assert.equal(values.selection.logicalProjectionRevisionIsNotPlanStateCasRevision,true);
  const selection=values.selection,program=JSON.parse(git('show',`${selection.exactBase.sha}:docs/OPS/R24/EXECUTABLE_PROGRAM_R2_4.json`));
  assert.deepEqual(selectNext({program:buildCurrentG0Program(program),contourStates:values.graph.states,mission:selection.missionBinding,now:selection.schedulerReceipt.generatedAt}),selection.schedulerReceipt);
  assert.equal(selection.schedulerReceipt.selectedId,'WP-602_PROPOSAL_WORKFLOW');
  assert.equal(selection.missionBinding.schedulerGraphDigest,canonicalDigest(program.nodes));
  assert.equal(selection.missionBinding.stateDigest,canonicalDigest(selection.effectiveStateProjection));
  assert.equal(selection.missionBinding.policyDigest,h(git('show',`${selection.exactBase.sha}:docs/OPS/R24/AUTONOMY_CONTROL_PLANE_R2_4.json`)));
  assert.equal(h(bytes(paths.sealed)),'be44e582cf767412ae02f4c9301c510ba406fa42704b3999a928b6c5749a1fd6');
  assert.equal(values.sealed.selectedHistoricalNode.id,'WP-602_PROPOSAL_WORKFLOW');
  assert.equal(values.sealed.additionalReferenceMembers.length,1);
  assert.equal(values.sealed.additionalReferenceMembers[0].readCompletelyBeforeImplementation,true);
  assert.equal(values.registry.excludedDependentCarriers.length,9);
  const allCarriers=[...values.registry.carriers.map(row=>row.path),...values.registry.excludedDependentCarriers].sort();
  assert.deepEqual(allCarriers,[...values.instance.operations.modifyPaths,...values.instance.operations.createPaths].sort());
  assert.equal(new Set(allCarriers).size,31);
  assert.equal(values.registry.byteIdentityRole,'ADMITTED_CANDIDATE_ARTIFACT_MANIFEST_NOT_BASE_TREE_CONTENTS');
  assert.equal(values.registry.carrierDenominator,22);assert.equal(values.registry.carriers.length,22);
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
  assert.equal(values.terminal.activationOutcome.doneCount,72);assert.equal(values.terminal.activationOutcome.blockedTypedCount,3);assert.equal(values.terminal.activationOutcome.pendingCount,24);
  for(const value of Object.values(values)){if(value.sourcePlanRoles)assert.deepEqual(value.sourcePlanRoles,roles);if(Object.hasOwn(value,'programDone'))assert.equal(value.programDone,false);}
  return true;
}
test('WP602 complete carrier, protected-WIP, scheduler, graph and conditional terminal replay',()=>{
  assert.equal(verify(load()),true);
  const prefix='docs/OPS/R24/EVIDENCE/ES-R24-WP-602-PROPOSAL-WORKFLOW-';
  const claim=buildClaimBinding(read(prefix+'CLAIM-BINDINGS.json'));
  for(const binding of claim.claimBindings)assert.equal(h(bytes(binding.filePath)),binding.sha256,binding.filePath);
  for(const binding of claim.implementationArtifactDigests)assert.equal(h(bytes(binding.path)),binding.sha256,binding.path);
  assert.ok(claim.nonClaims.includes(`EXTERNAL_SOURCE_PLAN_DIGEST:${roles.externalSourcePlanDigest}`));
  assert.ok(claim.nonClaims.includes(`COMPILED_PROGRAM_FILE_DIGEST:${roles.compiledProgramFileDigest}`));
  const missingNonClaims=structuredClone(claim);delete missingNonClaims.nonClaims;
  assert.throws(()=>buildClaimBinding(missingNonClaims),/E_CLAIM_BINDING_SCHEMA/);
  for(const kind of ['MODEL','CONTRACT','INTEGRATION','MUTANTS'])assert.deepEqual(read(prefix+kind+'.json').causal.parentStampIds,['ES-R24-WP-601-LOCAL-AUTOMATION-CLAIM-BINDINGS']);
});

test('WP602 binds exact portable WP705 terminal member and separate verification without an independent-auditor claim',()=>{
  const {predecessor,graph}=load();const durable=predecessor.durable,verification=predecessor.verification;
  assert.equal(h(Buffer.from(`${JSON.stringify(durable,null,2)}\n`)),predecessor.externalDurableCarrierSha256);
  assert.equal(h(Buffer.from(`${JSON.stringify(verification,null,2)}\n`)),predecessor.externalVerificationSha256);
  assert.equal(h(bytes(paths.graph)),predecessor.effectiveGraphBaselineSha256);
  const memberBytes=Buffer.from(durable.artifact.memberCanonicalBase64,'base64');
  assert.equal(memberBytes.length,durable.artifact.memberSizeBytes);assert.equal(h(memberBytes),durable.artifact.memberSha256);
  assert.equal(h(memberBytes),'33fd1474b2623c0ba505c955893f47e227a6727e637a78b55c63b49cf7b6f7d6');
  const member=JSON.parse(memberBytes);
  assert.equal(member.status,'CERTIFIED_DONE');assert.equal(member.exactIdentity.mergeSha,'888d3bc716b64dd6dfa16027cc4933bb775c6fdf');
  assert.equal(member.exactIdentity.candidateSha,'0ff6f986bc7fe4f2c41e731c817afe88682dfd94');
  assert.equal(durable.delivery.pullRequestNumber,1818);assert.equal(durable.delivery.candidate,33726258480);assert.equal(durable.delivery.postmerge,33727153991);
  assert.equal(h(Buffer.from(JSON.stringify(predecessor.transportSuccessor,null,2)+'\n')),predecessor.externalTransportSuccessorSha256);
  assert.equal(predecessor.externalTransportSuccessorSha256,'e2180018ef2c1e803df67ef134dcf7d96faefcbf292b956a1eee65a4e55639f8');
  assert.equal(verification.status,'PASS');assert.equal(verification.independentAuditorClaim,false);
  assert.equal(verification.leaseStatus,'RELEASED');assert.equal(verification.wip,0);
  assert.equal(verification.graphStatesDigest,canonicalDigest(graph.states));
  assert.equal(member.finalAcceptance.passedRows,18);assert.equal(member.finalAcceptance.pendingRows,0);
});

test('WP602 terminal hostile mutants reject old count regression, authority leakage and false release',()=>{
  const values=load();
  assert.equal(verify(values),true);
  const mutations=[
    (v)=>{v.before.entries.pop();},(v)=>{v.before.protectedDirtySet.pop();},(v)=>{v.graph.states['WP-507_ATLAS_PRODUCT_CLAIM']='BLOCKED_TYPED';},
    (v)=>{v.state.targetCounts.BLOCKED_TYPED=4;},(v)=>{v.state.targetCounts.PENDING=25;},(v)=>{v.state.targetStates['WP-600_FEATURESPEC_QUERY_IR']='PENDING';},
    (v)=>{v.selection.schedulerReceipt.selectedId='WP-705_NEGOTIATION_CORPUS';},(v)=>{v.selection.frozenPlanStateMutated=true;},
    (v)=>{v.registry.currentTreeFallbackAllowed=true;},(v)=>{v.acceptance.externalRequiredCount=0;},
    (v)=>{v.terminal.status='CERTIFIED_DONE';},(v)=>{v.terminal.externalDeliveryPredicates[0].providerIdentity='SELF_PASS';},
    (v)=>{v.lease.targetLease.wip=1;},(v)=>{v.terminal.programDone=true;},(v)=>{v.terminal.sourcePlanRoles.compiledProgramFileDigest=v.terminal.sourcePlanRoles.externalSourcePlanDigest;},
  ];
  for(const mutate of mutations){const value=structuredClone(values);mutate(value);assert.throws(()=>verify(value));}
  assert.equal(mutations.length,15);
});

test('WP602 product evidence binds actual complete TAP bytes and every exact implementation artifact',()=>{
  const values=load(),prefix='docs/OPS/R24/EVIDENCE/ES-R24-WP-602-PROPOSAL-WORKFLOW-';
  for(const kind of ['MODEL','CONTRACT','INTEGRATION','MUTANTS']){
    const evidence=read(prefix+kind+'.json'),raw=evidence.artifact.rawEvidence,rawBytes=Buffer.from(raw.stdoutBase64,'base64');
    assert.equal(rawBytes.length,raw.byteLength);assert.equal(h(rawBytes),raw.sha256);
    assert.match(rawBytes.toString(),/\n1\.\.14\n# tests 14\n# suites 0\n# pass 14\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n/);
    assert.equal(raw.processExitCode,0);assert.equal(raw.testDenominator,14);assert.equal(raw.node,'22.12.0');
    for(const binding of evidence.artifact.implementationArtifacts)assert.equal(h(bytes(binding.path)),binding.sha256);
    const envelope=evidence.artifact.testEnvelope;
    assert.equal(envelope.dimensionDenominator,14);assert.equal(envelope.dimensions.length,14);
    assert.equal(envelope.riskClasses.includes('T5_CONTROL_PLANE'),true);
    assert.equal(envelope.deterministicCampaign.workflows,128);assert.equal(envelope.deterministicCampaign.eventDenominator,1024);
    assert.equal(envelope.deterministicCampaign.fieldChanges,2432);assert.equal(envelope.largeCorpus.syntheticWords,160000);
    assert.equal(evidence.artifact.featureIntegrationManifest.commandIds.join(','),'atlas.entity.merge,atlas.entity.splitRestore');
    assert.equal(evidence.artifact.featureIntegrationManifest.observationCeiling,'EXACT_STATE_EQUIVALENCE_IS_NOT_EXECUTION_AUTHENTICATION_OR_PERSISTENCE_CERTIFICATION');
  }
  assert.equal(values.terminal.localEvidence.focusedWp602.implementationMutants,26);
  assert.equal(values.terminal.localEvidence.focusedWp602.mutantsKilled,26);
  assert.equal(values.terminal.localEvidence.focusedWp602.mutantsSurvived,0);
});
