import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { canonicalBytes } from '../../scripts/ops/r24/corrective/canonical-json.mjs';
import {
  ACCEPTANCE_SIGNALS_DIGEST,
  C6BAccessibilityRecoveryError,
  FENCE_COUNTER,
  FENCE_DIGEST,
  LAZYWEB_AGENTIC_SEARCH_ID,
  LEASE_DIGEST,
  PATHS,
  STAGE_ADMISSION_DIGEST,
  STAGE_INSTANCE_DIGEST,
  TRIGGERING_C8A_BLOCKED_RECEIPT_DIGEST,
  WRITE_SET_DIGEST,
  assertSourceContractText,
  buildContract,
  validateBindings,
  validateEvidence,
} from '../../scripts/ops/r24/corrective/c6b-editor-accessibility-recovery.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function mutateOnce(source, before, after) {
  assert.equal(source.split(before).length - 1, 1, `one mutation target: ${before}`);
  return source.replace(before, after);
}

test('C6B recovery transfers semantics to the actual Tiptap textbox and kills five authority regressions', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, PATHS.source), 'utf8');
  assert.equal(assertSourceContractText(source), true);
  const mutants = [
    mutateOnce(source, "'aria-label': mountEl.getAttribute('aria-label') || 'Текст сцены'", "'aria-label': 'Editor'"),
    mutateOnce(source, "mountEl.removeAttribute('role')", "mountEl.setAttribute('role', 'textbox')"),
    mutateOnce(source, "mountEl.removeAttribute('aria-label')", "mountEl.setAttribute('aria-label', 'Текст сцены')"),
    mutateOnce(source, 'editorProps: {\n      attributes: editorAccessibilityAttributes,\n    },', ''),
    mutateOnce(source, "role: 'textbox'", "role: 'document'"),
  ];
  for (const mutant of mutants) assert.throws(() => assertSourceContractText(mutant), C6BAccessibilityRecoveryError);
  console.log(`R24_C6B_ACCESSIBILITY_MUTATION_RECEIPT=${JSON.stringify({ killed: mutants.length, survived: [], total: mutants.length })}`);
});

test('C6B recovery is verifier-admitted under the fixed binding and predecessor chain', () => {
  const bindings = validateBindings(REPO_ROOT);
  assert.equal(bindings.admission.value.status, 'ADMITTED');
  assert.equal(bindings.admission.value.stageInstanceDigest, STAGE_INSTANCE_DIGEST);
  assert.equal(bindings.admission.value.acceptanceSignalsDigest, ACCEPTANCE_SIGNALS_DIGEST);
  assert.equal(bindings.admission.value.writeSetDigest, WRITE_SET_DIGEST);
  assert.equal(bindings.stage.value.triggeringC8ABlockedNodeReceiptDigest, TRIGGERING_C8A_BLOCKED_RECEIPT_DIGEST);
  assert.equal(bindings.stage.value.lazywebEvidence.agenticSearchId, LAZYWEB_AGENTIC_SEARCH_ID);
  assert.equal(FENCE_COUNTER, 39);
  assert.match(FENCE_DIGEST, /^[0-9a-f]{64}$/u);
  assert.match(LEASE_DIGEST, /^[0-9a-f]{64}$/u);
  assert.equal(sha256(fs.readFileSync(path.join(REPO_ROOT, PATHS.stageInstance))), STAGE_INSTANCE_DIGEST);
  assert.equal(sha256(fs.readFileSync(path.join(REPO_ROOT, PATHS.stageAdmission))), STAGE_ADMISSION_DIGEST);
});

test('C6B recovery evidence proves the physical actual-input target and contains no local paths', () => {
  const contract = buildContract(REPO_ROOT);
  const evidenceBytes = fs.readFileSync(path.join(REPO_ROOT, PATHS.evidence));
  const evidence = JSON.parse(evidenceBytes.toString('utf8'));
  assert.equal(evidenceBytes.equals(canonicalBytes(evidence)), true);
  assert.equal(validateEvidence(evidence, contract), true);
  assert.equal(evidence.observations.accessibility.desktop.actual.focused, true);
  assert.equal(evidence.observations.accessibility.desktop.wrapper.role, null);
  assert.equal(evidence.observations.accessibility.ax.unnamedInteractiveNodeCount, 0);
  assert.equal(evidence.observations.accessibility.desktop.performance.syncSamplesMs.length, 40);
  assert.equal(evidence.observations.accessibility.desktop.performance.frameSamplesMs.length, 40);
  assert.equal(JSON.stringify(evidence).includes('/Users/'), false);
  assert.equal(JSON.stringify(evidence).includes('/Volumes/'), false);
});

test('C6B recovery generated contract and evidence are exact canonical bytes', () => {
  const contract = buildContract(REPO_ROOT);
  const contractBytes = fs.readFileSync(path.join(REPO_ROOT, PATHS.contract));
  assert.equal(contractBytes.equals(canonicalBytes(contract)), true);
  const evidenceBytes = fs.readFileSync(path.join(REPO_ROOT, PATHS.evidence));
  const evidence = JSON.parse(evidenceBytes.toString('utf8'));
  assert.equal(evidenceBytes.equals(canonicalBytes(evidence)), true);
  assert.equal(evidence.contractDigest, sha256(contractBytes));
});

test('C6B recovery preserves the prior Writer Home CSS closure bytes', () => {
  const expected = new Map([
    [PATHS.originalContract, '2ca57539c09dd074f9eed6c33951267ed0d1605865684be614d000dd6fec1c05'],
    [PATHS.originalMatrix, 'f1e07041b8de79a97470514b2b66eabdcd29ebb44cf054e817941adc1a32c502'],
    [PATHS.originalScript, '2d2aeaa9cb35aa7625ca6c37f361660d864b3ad90afbee5118662fe9835a08b3'],
    [PATHS.originalTest, '62d590a83345afe416ff667bda330a0533740b45895026e14092c8200f104238'],
    [PATHS.styles, 'dd73cc937ba48cc988d153fc8ebce8a61bc8ad26a70d16e9a4e5e822dd17d5b2'],
  ]);
  for (const [relativePath, digest] of expected) assert.equal(sha256(fs.readFileSync(path.join(REPO_ROOT, relativePath))), digest, relativePath);
});
