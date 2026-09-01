#!/usr/bin/env node
import fs from 'node:fs';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { canonicalBytes, canonicalize, readCanonicalJson } from './canonical-json.mjs';
import { assert, assertClosedObject, assertExactJson, sha256 } from './audit-r1-corrections.mjs';
import { validateLedger } from './audit-r2-lease-verifier.mjs';
import { validateReplayPlan } from './audit-r2-stage-replay.mjs';
import { verifyDownloadedArtifact } from './audit-r2-terminal-attestation-verifier.mjs';

const ROOT = 'docs/OPS/R24/CORRECTIVE';
const PATHS = Object.freeze({
  admission: `${ROOT}/AUDIT_R2_FINAL_CORRECTION_STAGE_ADMISSION_ATTESTATION_V1.json`,
  carrierRegistry: `${ROOT}/AUDIT_R2_CARRIER_REGISTRY_V8.json`,
  predecessorCarrierRegistry: `${ROOT}/AUDIT_R2_CARRIER_REGISTRY_V7.json`,
  rootCarrierRegistry: `${ROOT}/AUDIT_R2_CARRIER_REGISTRY_V1.json`,
  c0: `${ROOT}/AUDIT_R2_C0_ROOT_REPLAY_V1.json`,
  lazyweb: `${ROOT}/AUDIT_R2_C6B_LAZYWEB_PROVIDER_EXPORT_V1.json`,
  ledger: `${ROOT}/AUDIT_R2_LEASE_FENCE_LEDGER_V1.json`,
  plan: `${ROOT}/AUDIT_R2_STAGE_REPLAY_PLAN_V1.json`,
  programAmendment: `${ROOT}/AUDIT_R2_PROGRAM_RATIFICATION_AMENDMENT_V1.json`,
  requirements: `${ROOT}/AUDIT_R2_ACCEPTANCE_REQUIREMENTS_V1.json`,
  round1: `${ROOT}/AUDIT_R2_ROUND1_RECEIPT_STATUS_V1.json`,
  stage: `${ROOT}/AUDIT_R2_FINAL_CORRECTION_STAGE_INSTANCE_V1.json`,
  wp400: `${ROOT}/AUDIT_R2_WP400_CARRIER_STATUS_V1.json`,
});
const run = (program, args, options = {}) => {
  const result = spawnSync(program, args, { encoding:'utf8', maxBuffer:64*1024*1024, ...options });
  assert(result.status === 0 && !result.error, 'E_EXTERNAL_COMMAND', `${program} ${args.join(' ')}:${result.stderr ?? ''}`);
  return String(result.stdout ?? '').trim();
};
const git = (args) => run('git', args);
const ghJson = (args) => JSON.parse(run('gh', args));
const read = (file) => readCanonicalJson(file);

export function checkCorrections(root = process.cwd()) {
  const stage = read(PATHS.stage);
  const admission = read(PATHS.admission);
  assert(stage.digest === '5904e10a1077ea7be57551c684d1a4a2b82f55636bf802ba45f1b21f6e540435', 'E_STAGE_INSTANCE_DIGEST', stage.digest);
  assert(admission.digest === '2cb123233aa5e798f1f9d7a64010fbd9db88e72371c71456e078fea17b75a059' && admission.value.status === 'ADMITTED', 'E_STAGE_ADMISSION_DIGEST', admission.digest);
  assert(sha256(canonicalBytes(stage.value.writeSet)) === 'b141168e4cdd1c79e06376ced2ae4509a1dddcc0ba0bd7878fd0ef7a7671d464', 'E_WRITE_SET_DIGEST', 'stage');
  assert(read(PATHS.programAmendment).digest === 'ab588b586d7e05b8b0b9f7f8074eff53a2d0b1ba1ada5699d63e41e9918a7331', 'E_PROGRAM_AMENDMENT_DIGEST', 'amendment');
  const c0 = read(PATHS.c0).value;
  assert(c0.replacementAttestationDigest === sha256(canonicalBytes(c0.replacementAttestation)), 'E_C0_REPLACEMENT_DIGEST', c0.replacementAttestationDigest);
  assert(c0.b0EffectiveDependency.stageId === 'C0' && c0.b0EffectiveDependency.attestationDigest === c0.replacementAttestationDigest && c0.b0EffectiveDependency.status === 'CERTIFIED_ROOT_REPLACEMENT', 'E_B0_C0_BINDING', 'C0');
  assert(sha256(fs.readFileSync(c0.replacementAttestation.ownerRatificationCarrierPath)) === c0.replacementAttestation.ownerRatificationCarrierDigest, 'E_C0_OWNER_CARRIER', 'owner');
  assert(sha256(fs.readFileSync(c0.replacementAttestation.round1ReplacementCarrierPath)) === c0.replacementAttestation.round1ReplacementCarrierDigest, 'E_C0_ROUND1_CARRIER', 'round1');
  const lazyweb = read(PATHS.lazyweb).value;
  assert(lazyweb.providerResultBytesDigest === sha256(canonicalBytes(lazyweb.providerResultBytes)), 'E_LAZYWEB_PROVIDER_BYTES', 'digest');
  assert(lazyweb.providerResultBytes.agenticSearchId === '2486f500-f6c1-4d88-922e-9e5572038618' && lazyweb.providerResultBytes.providerCallOrder >= 2 && lazyweb.providerResultBytes.selectedResults.length === 3, 'E_LAZYWEB_PROVIDER_IDENTITY', 'resource');
  assert(lazyweb.privacy.userDocumentsMutated === false && lazyweb.privacy.secretsIncluded === false && lazyweb.privacy.signedUrlsIncluded === false, 'E_LAZYWEB_PRIVACY', 'privacy');
  const historicalStage = JSON.parse(run('git', ['show',`${lazyweb.chronology.uiChangeCommitSha}:${lazyweb.chronology.historicalStageInstancePath}`]));
  assert(historicalStage.lazywebEvidence.agenticSearchId === lazyweb.providerResultBytes.agenticSearchId, 'E_LAZYWEB_HISTORICAL_ID', 'stage');
  assert(new Date(lazyweb.chronology.historicalStageObservedAtUtc).getTime() < new Date(lazyweb.chronology.uiChangeCommitTimeUtc).getTime(), 'E_LAZYWEB_CHRONOLOGY', 'time');
  assert(git(['show','-s','--format=%T',lazyweb.chronology.uiChangeCommitSha]) === lazyweb.chronology.uiChangeCommitTree && lazyweb.chronology.status === 'VERIFIED_BEFORE_PUBLISHED_UI_CHANGE', 'E_LAZYWEB_COMMIT_BINDING', 'commit');
  const wp400 = read(PATHS.wp400).value;
  assert(wp400.currentStatus === 'FENCED_NO_CURRENT_STAGE_INSTANCE_OR_ADMISSION' && wp400.wp400MutationStarted === false && wp400.historicalCarriers.every((item)=>item.status === 'HISTORICAL_STALE_NOT_CURRENT_AUTHORITY' && item.boundHeadSha === '0591ed23d4196da43e3292a59d5589692568728c'), 'E_WP400_FENCE', 'WP400');
  const round1 = read(PATHS.round1).value;
  assert(round1.round1NarrativeDigest === '35277a49b8d87079ec5f49bd7d2196a41803bd8cab7f339f99499c5936eceaa5' && round1.canonicalBytesPresent === false && round1.status === 'DOWNGRADED_NON_CARRIED_NARRATIVE_DIGEST', 'E_ROUND1_RECEIPT_STATUS', round1.status);
  const predecessorCarrierRegistry = read(PATHS.predecessorCarrierRegistry);
  assert(predecessorCarrierRegistry.digest === '0ac29f5bd4608a819738b43f3417aca49923d78d24c1119c1239e951330d43a3' && predecessorCarrierRegistry.value.schemaVersion === 'AUDIT_R2_CARRIER_REGISTRY_V7', 'E_CARRIER_REGISTRY_PREDECESSOR_DIGEST', predecessorCarrierRegistry.digest);
  const rootCarrierRegistry = read(PATHS.rootCarrierRegistry);
  assert(rootCarrierRegistry.digest === 'b1738174bd03f47a25e3bcb2ea68c9bf9f602e761b1c8783cc04a8c54f972f8b' && rootCarrierRegistry.value.schemaVersion === 'AUDIT_R2_CARRIER_REGISTRY_V1', 'E_CARRIER_REGISTRY_ROOT_DIGEST', rootCarrierRegistry.digest);
  const carrierRegistryFile = read(PATHS.carrierRegistry),carrierRegistry=carrierRegistryFile.value;
  assertClosedObject(carrierRegistry, ['schemaVersion','evidenceStampIds','baseSha','baseTreeSha','carriers','excludedSelfCarriers','predecessor','sourcePlanRoles','successorScope','programDoneClaimed','wp400MutationStarted'], ['schemaVersion','evidenceStampIds','baseSha','baseTreeSha','carriers','excludedSelfCarriers','predecessor','sourcePlanRoles','successorScope','programDoneClaimed','wp400MutationStarted'], 'carrierRegistry');
  assert(carrierRegistry.schemaVersion === 'AUDIT_R2_CARRIER_REGISTRY_V8' && carrierRegistry.baseSha === stage.value.baseSha && carrierRegistry.baseTreeSha === stage.value.treeSha, 'E_CARRIER_REGISTRY_BINDING', carrierRegistry.schemaVersion);
  assertExactJson(carrierRegistry.predecessor,{path:PATHS.predecessorCarrierRegistry,sha256:predecessorCarrierRegistry.digest,status:'SUPERSEDED_BY_APPEND_ONLY_WP501_FINAL_TEST_INVENTORY_SUCCESSOR'},'E_CARRIER_REGISTRY_PREDECESSOR','binding');
  assertExactJson(carrierRegistry.sourcePlanRoles,{externalSourcePlanDigest:'1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a',compiledProgramFileDigest:'da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a',rolesDistinct:true},'E_CARRIER_REGISTRY_SOURCE_ROLES','roles');
  assertExactJson(carrierRegistry.successorScope,{reason:'CURRENT_REPOSITORY_TEST_INVENTORY_FINALIZED_AFTER_ADMITTED_WP501_SUCCESSOR_TEST_ADDITION',replacementPaths:[`${ROOT}/C1B_TEST_INVENTORY_V1.json`,'scripts/ops/r24/corrective/audit-r2-corrections.mjs','test/contracts/r24-audit-r2-corrections.contract.test.mjs'],addedPaths:[],removedPaths:[]},'E_CARRIER_REGISTRY_SUCCESSOR_SCOPE','scope');
  assert(carrierRegistry.programDoneClaimed === false && carrierRegistry.wp400MutationStarted === false, 'E_CARRIER_REGISTRY_OVERCLAIM', 'status');
  const historicalExpectedPaths = stage.value.writeSet.paths.filter((item)=>item !== PATHS.rootCarrierRegistry && item !== `${ROOT}/C1C_GOVERNANCE_CHANGE_APPROVALS_V1.json`);
  assertExactJson(rootCarrierRegistry.value.carriers.map((item)=>item.path),historicalExpectedPaths,'E_CARRIER_REGISTRY_HISTORICAL_SET','paths');
  const expectedCarrierPaths = predecessorCarrierRegistry.value.carriers.map((item)=>item.path);
  assertExactJson(carrierRegistry.carriers.map((item)=>item.path), expectedCarrierPaths, 'E_CARRIER_REGISTRY_SET', 'paths');
  for (const carrier of carrierRegistry.carriers) {
    assertClosedObject(carrier, ['path','purpose','sha256','sizeBytes','status'], ['path','purpose','sha256','sizeBytes','status'], `carrier.${carrier?.path}`);
    const bytes = fs.readFileSync(carrier.path);
    assert(carrier.status === 'CANONICAL_BYTES_PRESENT' && carrier.sha256 === sha256(bytes) && carrier.sizeBytes === bytes.length, 'E_CARRIER_REGISTRY_DIGEST', carrier.path);
  }
  assertExactJson(carrierRegistry.excludedSelfCarriers, [PATHS.carrierRegistry,PATHS.predecessorCarrierRegistry,`${ROOT}/AUDIT_R2_CARRIER_REGISTRY_V6.json`,`${ROOT}/AUDIT_R2_CARRIER_REGISTRY_V5.json`,`${ROOT}/AUDIT_R2_CARRIER_REGISTRY_V4.json`,`${ROOT}/AUDIT_R2_CARRIER_REGISTRY_V3.json`,`${ROOT}/AUDIT_R2_CARRIER_REGISTRY_V2.json`,PATHS.rootCarrierRegistry,`${ROOT}/C1C_GOVERNANCE_CHANGE_APPROVALS_V1.json`], 'E_CARRIER_REGISTRY_EXCLUSIONS', 'excludedSelfCarriers');
  const ledger = validateLedger(read(PATHS.ledger).value, { root });
  const registry = read(`${ROOT}/STAGE_REGISTRY_V1.json`);
  const replay = validateReplayPlan(read(PATHS.plan).value, registry.value, { root });
  const requirements = read(PATHS.requirements).value;
  assert(requirements.requiredOutcomeIds.length === 10 && requirements.requiredStageIds.length === 33 && requirements.programDoneClaimed === false && requirements.wp400MutationStarted === false, 'E_REQUIREMENT_INVENTORY', 'requirements');
  return {schemaVersion:'AUDIT_R2_CORRECTION_STATIC_CHECK_V8',status:'PASS',stageInstanceDigest:stage.digest,stageAdmissionDigest:admission.digest,writeSetDigest:sha256(canonicalBytes(stage.value.writeSet)),carrierRegistryDigest:carrierRegistryFile.digest,predecessorCarrierRegistryDigest:predecessorCarrierRegistry.digest,rootCarrierRegistryDigest:rootCarrierRegistry.digest,c0ReplacementDigest:c0.replacementAttestationDigest,lazywebProviderBytesDigest:lazyweb.providerResultBytesDigest,leaseDigest:ledger.leaseDigest,fenceDigest:ledger.fenceDigest,replayPlanDigest:replay.planDigest,registeredStages:33,programDoneClaimed:false,wp400MutationStarted:false};
}

function dispatchTerminal() {
  const evaluationSha = git(['rev-parse','origin/main']);
  const evaluationTree = git(['rev-parse','origin/main^{tree}']);
  assert(git(['rev-parse','HEAD']) === evaluationSha, 'E_DISPATCH_HEAD', evaluationSha);
  const candidate = git(['rev-parse',`${evaluationSha}^2`]);
  const stageDigest = sha256(fs.readFileSync(PATHS.stage));
  const admissionDigest = sha256(fs.readFileSync(PATHS.admission));
  const listArgs = ['run','list','--workflow','r24-terminal-attestation.yml','--branch','main','--event','workflow_dispatch','--json','databaseId,headSha,status,conclusion,createdAt','--limit','20'];
  const beforeIds = new Set(ghJson(listArgs).map((item)=>String(item.databaseId)));
  run('gh', ['workflow','run','r24-terminal-attestation.yml','--ref','main','-f','stage_id=AUDIT_R2_COMPLETE_CHAIN','-f',`stage_instance_path=${PATHS.stage}`,'-f',`stage_admission_path=${PATHS.admission}`,'-f',`requirements_path=${PATHS.requirements}`,'-f','program_template_digest=6c833c964318da3e61e1743365f8763206be838647b5222c187b3bda8d1c6b9a','-f',`stage_instance_digest=${stageDigest}`,'-f',`stage_admission_digest=${admissionDigest}`,'-f',`implementation_candidate_sha=${candidate}`,'-f',`implementation_merge_sha=${evaluationSha}`,'-f',`evaluation_sha=${evaluationSha}`,'-f',`evaluation_tree_sha=${evaluationTree}`]);
  let selected = null;
  for (let attempt=0; attempt<10 && !selected; attempt+=1) {
    selected = ghJson(listArgs).find((item)=>item.headSha === evaluationSha && !beforeIds.has(String(item.databaseId))) ?? null;
    if (!selected) run('sleep',['2']);
  }
  assert(selected, 'E_TERMINAL_RUN_DISCOVERY', evaluationSha);
  return {status:'DISPATCHED',runId:String(selected.databaseId),evaluationSha,evaluationTree};
}
export function buildRemoteTerminalExpected({artifactId,artifactName,runId,zipDigest,evaluationSha,evaluationTree}) {
  return {artifactId,artifactName,runId,zipDigest,evaluationSha,evaluationTreeSha:evaluationTree};
}
function verifyRemoteTerminal() {
  const evaluationSha = git(['rev-parse','origin/main']);
  const evaluationTree = git(['rev-parse','origin/main^{tree}']);
  const runs = ghJson(['run','list','--workflow','r24-terminal-attestation.yml','--branch','main','--event','workflow_dispatch','--json','databaseId,headSha,status,conclusion,createdAt','--limit','20']);
  const selected = runs.find((item)=>item.headSha===evaluationSha && item.status==='completed' && item.conclusion==='success');
  assert(selected, 'E_TERMINAL_SUCCESS_RUN_DISCOVERY', evaluationSha);
  const runId=String(selected.databaseId);
  const artifacts=ghJson(['api',`repos/{owner}/{repo}/actions/runs/${runId}/artifacts`]).artifacts;
  const artifact=artifacts.find((item)=>item.name===`audit-r2-terminal-${runId}` && item.expired===false);
  assert(artifact, 'E_TERMINAL_ARTIFACT_DISCOVERY', runId);
  const binary=spawnSync('gh',['api',`repos/{owner}/{repo}/actions/artifacts/${artifact.id}/zip`],{encoding:null,maxBuffer:256*1024*1024});
  assert(binary.status===0 && Buffer.isBuffer(binary.stdout), 'E_TERMINAL_ARTIFACT_DOWNLOAD', runId);
  return verifyDownloadedArtifact({zipBytes:binary.stdout,metadata:{artifactId:String(artifact.id),artifactName:artifact.name,expired:artifact.expired,runConclusion:selected.conclusion,runHeadSha:selected.headSha,runId},expected:buildRemoteTerminalExpected({artifactId:String(artifact.id),artifactName:artifact.name,runId,zipDigest:sha256(binary.stdout),evaluationSha,evaluationTree})});
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const mode=process.argv[2];
    const result=mode==='--check'?checkCorrections():mode==='--dispatch-terminal'?dispatchTerminal():mode==='--verify-remote-terminal'?verifyRemoteTerminal():(()=>{const e=new Error('--check|--dispatch-terminal|--verify-remote-terminal');e.code='E_USAGE';throw e;})();
    process.stdout.write(canonicalBytes(result));
  } catch (error) {
    process.stderr.write(`${canonicalize({code:error.code ?? 'E_UNTYPED',message:error.message})}\n`);
    process.exitCode=1;
  }
}
