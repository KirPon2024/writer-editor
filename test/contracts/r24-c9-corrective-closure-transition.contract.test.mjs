import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  EFFECTIVE_SCHEDULER_GRAPH_DIGEST,
  EFFECTIVE_STATES_DIGEST,
  EXPECTED_READY_SET,
  FENCE_COUNTER,
  OWNER_BINDING_DIGEST,
  PATHS,
  PROGRAM_TEMPLATE_DIGEST,
  RAW_STATES_DIGEST,
  SOURCE_HEAD_SHA,
  SOURCE_TREE_SHA,
  STAGE_ADMISSION_DIGEST,
  STAGE_INSTANCE_DIGEST,
  STAGE_REGISTRY_DIGEST,
  TRUST_MODEL_DIGEST,
  VERIFIER_CODE_DIGEST,
  VERIFIER_CONTRACT_DIGEST,
  WP400_WRITE_SET,
  WRITE_SET,
  assertPathlessPublicEvidence,
  runProbe,
  sha256,
  validateContract,
  validateEffectiveState,
  validateEvaluation,
  validateFreshG0,
  validateNewEpoch,
  validateProgramVerdict,
  validateReadySet,
} from '../../scripts/ops/r24/corrective/c9-corrective-closure-transition.mjs';

const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname);
const bytes = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath));
const json = (relativePath) => JSON.parse(bytes(relativePath));

test('C9 fixed StageAdmissionVerifier replay is byte-identical at the certified C8Z merge base', () => {
  const result = spawnSync('node', [PATHS.verifier, PATHS.stageInstance, PATHS.registry, PATHS.program], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(Buffer.from(result.stdout), bytes(PATHS.stageAdmission));
  assert.equal(sha256(bytes(PATHS.stageInstance)), STAGE_INSTANCE_DIGEST);
  assert.equal(sha256(bytes(PATHS.stageAdmission)), STAGE_ADMISSION_DIGEST);
  const instance = json(PATHS.stageInstance);
  assert.equal(instance.baseSha, SOURCE_HEAD_SHA);
  assert.equal(instance.headSha, SOURCE_HEAD_SHA);
  assert.equal(instance.treeSha, SOURCE_TREE_SHA);
  assert.equal(instance.model, 'gpt-5.6-sol');
  assert.equal(instance.reasoningEffort, 'xhigh');
  assert.deepEqual(instance.writeSet.paths, WRITE_SET);
});

test('C9 effective state is append-only and never turns A1 or WP-400 into false DONE', () => {
  const effective = json(PATHS.effectiveState);
  assert.equal(validateEffectiveState(effective), true);
  assert.equal(effective.rawState.digest, RAW_STATES_DIGEST);
  assert.equal(effective.effectiveState.digest, EFFECTIVE_STATES_DIGEST);
  assert.equal(effective.effectiveGraph.schedulerGraphDigest, EFFECTIVE_SCHEDULER_GRAPH_DIGEST);
  assert.equal(effective.rawState.states.W0_WORD_PHYSICAL_RECERTIFICATION, 'BLOCKED_TYPED');
  assert.equal(effective.effectiveState.states.W0_WORD_PHYSICAL_RECERTIFICATION, 'DONE');
  assert.equal(effective.effectiveState.states.A1_OPTIONAL_RELATION_VOCABULARY, 'INELIGIBLE_OPTIONAL');
  assert.equal(effective.effectiveState.states['WP-400_ANCHOR_LINEAGE'], 'PENDING');
});

test('C9 emits one fresh G0, preserves the full ready set and graph-selects WP-400', () => {
  const g0 = json(PATHS.freshG0);
  const epoch = json(PATHS.newEpoch);
  const ready = json(PATHS.readySet);
  assert.equal(validateFreshG0(g0), true);
  assert.equal(validateNewEpoch(epoch), true);
  assert.equal(validateReadySet(ready), true);
  assert.equal(g0.fencing.counter, FENCE_COUNTER);
  assert.deepEqual(ready.readySet, EXPECTED_READY_SET);
  assert.equal(ready.selectedId, 'WP-400_ANCHOR_LINEAGE');
  assert.equal(ready.mode, 'AUTONOMOUS');
});

test('C9 main-product authority is owner-bound to one exact WP-400 write set', () => {
  const binding = json(PATHS.mainBinding);
  const template = json(PATHS.mainTemplate);
  const registry = json(PATHS.mainRegistry);
  const instance = json(PATHS.wp400Instance);
  assert.equal(binding.noSelfAuthorization, true);
  assert.equal(binding.predecessorFixedStandingAuthorityBindingDigest, OWNER_BINDING_DIGEST);
  assert.equal(binding.fixedDigests.mainProductProgramTemplateDigest, sha256(bytes(PATHS.mainTemplate)));
  assert.equal(binding.fixedDigests.mainProductStageRegistryDigest, sha256(bytes(PATHS.mainRegistry)));
  assert.equal(binding.fixedDigests.trustModelDigest, TRUST_MODEL_DIGEST);
  assert.equal(binding.fixedDigests.verifierCodeDigest, VERIFIER_CODE_DIGEST);
  assert.equal(binding.fixedDigests.verifierContractDigest, VERIFIER_CONTRACT_DIGEST);
  assert.equal(template.stageRegistryDigest, sha256(bytes(PATHS.mainRegistry)));
  assert.deepEqual(registry.stages[0].allowedWritePaths, WP400_WRITE_SET);
  assert.deepEqual(instance.writeSet.paths, WP400_WRITE_SET);
  assert.equal(instance.executionState, 'ADMITTED_AWAITING_C9_CERTIFIED_MERGE_AND_FRESH_EXACT_BASE_AMENDMENT');
  assert.equal(instance.baseSha, SOURCE_HEAD_SHA);
  assert.equal(instance.treeSha, SOURCE_TREE_SHA);
});

test('C9 WP-400 StageAdmissionVerifier replay is byte-identical but mutation remains fenced', () => {
  const result = spawnSync('node', [PATHS.verifier, PATHS.wp400Instance, PATHS.mainRegistry, PATHS.mainTemplate], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(Buffer.from(result.stdout), bytes(PATHS.wp400Admission));
  const admission = json(PATHS.wp400Admission);
  assert.equal(admission.status, 'ADMITTED');
  assert.equal(admission.stageId, 'WP-400_ANCHOR_LINEAGE');
  assert.equal(admission.stageInstanceDigest, sha256(bytes(PATHS.wp400Instance)));
});

test('C9 contract and evaluation keep external terminal and broader product verdict honest', () => {
  const contract = json(PATHS.contract);
  const evaluation = json(PATHS.evaluation);
  const verdict = json(PATHS.programVerdict);
  assert.equal(validateContract(contract), true);
  assert.equal(validateEvaluation(evaluation), true);
  assert.equal(validateProgramVerdict(verdict), true);
  assert.equal(contract.externalTerminalAttestation.status, 'AWAITING_POST_MERGE_EXTERNAL_C9_ATTESTATION');
  assert.equal(contract.nonClaims.programDone, false);
  assert.equal(contract.nonClaims.wp400MutationInC9, false);
  assert.equal(evaluation.mainProduct.status, 'NEEDS_MORE_EVIDENCE');
  assert.equal(evaluation.mainProduct.programDone, false);
  assert.equal(evaluation.mainProduct.selectedNodeExecutableBeforeC9Closure, false);
  assert.equal(verdict.correctiveProgram.status, 'PASS_PENDING_C9_PROTECTED_DELIVERY_AND_EXTERNAL_TERMINAL_ATTESTATION');
  assert.equal(verdict.mainProductProgram.status, 'NEEDS_MORE_EVIDENCE');
});

test('C9 public receipt surfaces contain no local absolute paths', () => {
  for (const relativePath of [PATHS.contract, PATHS.evaluation, PATHS.effectiveState, PATHS.freshG0, PATHS.newEpoch, PATHS.programVerdict]) {
    assert.equal(assertPathlessPublicEvidence(json(relativePath)), true);
  }
  const mutant = json(PATHS.programVerdict);
  mutant.localPath = '/private/example';
  assert.throws(() => assertPathlessPublicEvidence(mutant));
});

test('C9 fixed control-plane digest set remains explicit and unchanged', () => {
  assert.equal(PROGRAM_TEMPLATE_DIGEST, '6c833c964318da3e61e1743365f8763206be838647b5222c187b3bda8d1c6b9a');
  assert.equal(STAGE_REGISTRY_DIGEST, 'c8af046b5918f43a50af66886b0b5c9d2e22ea6501240d4b239101d8836ced1a');
  assert.equal(TRUST_MODEL_DIGEST, '4f6e4b3a191e0302ea44646659e8c2f71121af7d808cc0ee768269b4e156840d');
  assert.equal(VERIFIER_CODE_DIGEST, '82e49d577b79b41b26b67e25b7ce0fd81f26fb973232194fef8d96d6c563c6f9');
  assert.equal(VERIFIER_CONTRACT_DIGEST, '925b4c23f1cad674720ee6a22fcd74cc2169b16bbc161be5d43535f20dd2ee31');
});

test('C9 mutation probes kill every false-closure and auto-resume mutant', () => {
  const result = runProbe(repoRoot);
  assert.equal(result.mutantsKilled, 9);
  assert.equal(result.mutantsTotal, 9);
  assert.equal(result.probeResults.every((entry) => entry.killed), true);
});
