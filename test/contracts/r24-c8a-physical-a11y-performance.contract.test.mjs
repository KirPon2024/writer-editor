import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  ELECTRON_ARCHIVE_DIGEST,
  ELECTRON_VERSION,
  PATHS,
  SOURCE_HEAD_SHA,
  STAGE_ADMISSION_DIGEST,
  STAGE_INSTANCE_DIGEST,
  buildContract,
  sha256,
  validateBindings,
  validateEvidence,
} from '../../scripts/ops/r24/corrective/c8a-physical-a11y-performance.mjs';

const ROOT = process.cwd();

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('C8A fixed admission binds exact stage, source, write set, and C7B certification', () => {
  const bindings = validateBindings(ROOT);
  assert.equal(bindings.stage.digest, STAGE_INSTANCE_DIGEST);
  assert.equal(bindings.admission.digest, STAGE_ADMISSION_DIGEST);
  assert.equal(bindings.stage.value.baseSha, SOURCE_HEAD_SHA);
  assert.equal(bindings.stage.value.dependencies[0].stageId, 'C7B');
  assert.equal(bindings.stage.value.dependencies[0].status, 'CERTIFIED_DONE');
});

test('C8A contract binds immutable Electron and production runtime bytes without release claims', () => {
  const contract = buildContract(ROOT);
  assert.equal(contract.electronRuntime.version, ELECTRON_VERSION);
  assert.equal(contract.electronRuntime.archive.sha256, ELECTRON_ARCHIVE_DIGEST);
  assert.equal(contract.sourceBindings.productRuntime.length, 5);
  assert.equal(contract.sourceBindings.recoveryPredecessor.c6bCertifiedDoneReceiptDigest.length, 64);
  assert.equal(contract.sourceBindings.recoveryPredecessor.parkedStageInstanceDigest.length, 64);
  assert.equal(contract.nonClaims.includes('NO_SIGNING_NOTARIZATION_DISTRIBUTION'), true);
  assert.equal(contract.nonClaims.includes('NO_PROGRAM_DONE'), true);
});

test('C8A recorded evidence validates fresh synthetic a11y and performance observations', () => {
  const contract = buildContract(ROOT);
  const evidence = readJson(PATHS.evidence);
  assert.equal(validateEvidence(evidence, contract), true);
  assert.equal(evidence.observations.safety.userDocumentsTouched, false);
  assert.equal(evidence.observations.safety.credentialsRead, false);
  assert.equal(evidence.observations.safety.networkRequests, 0);
  assert.equal(evidence.observations.accessibility.ax.textbox.name, 'Текст сцены');
  assert.equal(evidence.observations.accessibility.desktop.wrapper.role, null);
});

test('C8A rejects unnamed accessibility controls, stale windows, and user-path effects', () => {
  const contract = buildContract(ROOT);
  const evidence = readJson(PATHS.evidence);
  const unnamed = clone(evidence);
  unnamed.observations.accessibility.ax.unnamedInteractiveNodeCount = 1;
  assert.throws(() => validateEvidence(unnamed, contract), /E_AX_UNNAMED_INTERACTIVE/u);
  const stale = clone(evidence);
  stale.execution.finishedAtUtc = new Date(Date.parse(stale.execution.startedAtUtc) + 121000).toISOString();
  assert.throws(() => validateEvidence(stale, contract), /E_EXECUTION_TIME/u);
  const userPath = clone(evidence);
  userPath.observations.safety.redirectedCapabilities.push('/Users/example/Documents');
  assert.throws(() => validateEvidence(userPath, contract), /E_TEMP_ISOLATION|E_PUBLIC_PATH_LEAK/u);
});

test('C8A rejects performance overruns, missing runtime budget states, and forged contract binding', () => {
  const contract = buildContract(ROOT);
  const evidence = readJson(PATHS.evidence);
  const slow = clone(evidence);
  slow.observations.performance.syncP95Ms = contract.bounds.maxTypingSyncP95Ms + 0.001;
  assert.throws(() => validateEvidence(slow, contract), /E_TYPING_P95/u);
  const missingSurvivor = clone(evidence);
  missingSurvivor.observations.performance.survivorLaneApplicability = 'APPLICABLE_LEGACY_DEFERRED_RENDER';
  missingSurvivor.observations.performance.survivorBudgetState = null;
  assert.throws(() => validateEvidence(missingSurvivor, contract), /E_RUNTIME_BUDGET_STATE/u);
  const forgedNotApplicable = clone(evidence);
  forgedNotApplicable.observations.performance.survivorLaneApplicability = 'NOT_APPLICABLE_TIPTAP_NO_LEGACY_DEFERRED_RENDER';
  forgedNotApplicable.observations.performance.survivorBudgetState = 'within';
  assert.throws(() => validateEvidence(forgedNotApplicable, contract), /E_RUNTIME_BUDGET_STATE/u);
  const forged = clone(evidence);
  forged.contractDigest = sha256(Buffer.from('forged', 'utf8'));
  assert.throws(() => validateEvidence(forged, contract), /E_CONTRACT_BINDING/u);
});

test('C8A runner source preserves fresh-window, CDP AX, synthetic isolation, and network fences', () => {
  const source = fs.readFileSync(path.join(ROOT, PATHS.script), 'utf8');
  for (const token of [
    "Accessibility.getFullAXTree",
    "Input.dispatchKeyEvent",
    ".ProseMirror[contenteditable=\"true\"]",
    "disable-background-networking",
    "SANITIZED_MINIMAL_CHILD_ENVIRONMENT",
    "EPHEMERAL_DOCUMENTS",
    "userDocumentsTouched: false",
    "networkRequests === 0",
    "dialogCalls === 0",
  ]) assert.equal(source.includes(token), true, `missing runner fence: ${token}`);
  for (const forbidden of ['force-push', 'notarize', 'signingIdentity', 'showOpenDialog({', 'showSaveDialog({']) {
    assert.equal(source.includes(forbidden), false, `forbidden external effect: ${forbidden}`);
  }
});
