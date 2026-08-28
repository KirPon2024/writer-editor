import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { canonicalBytes } from '../../scripts/ops/r24/corrective/canonical-json.mjs';
import {
  ACCEPTANCE_SIGNALS_DIGEST,
  CONTROL_PLANE_EVIDENCE_STAMP_ID,
  PATHS,
  PREDECESSOR_TERMINAL_DIGEST,
  PROGRAM_TEMPLATE_DIGEST,
  SOURCE_EXECUTABLE_PROGRAM_DIGEST,
  SOURCE_PLAN_STATE_DIGEST,
  STAGE_ADMISSION_DIGEST,
  STAGE_INSTANCE_DIGEST,
  WRITE_SET,
  assertSourceIdentity,
  buildArtifacts,
  compileOptionalNeutralCorrection,
} from '../../scripts/ops/r24/corrective/c4-optional-neutral-correction.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function validInput(overrides = {}) {
  return {
    amendmentDigestBound: true,
    executableProgramDigest: SOURCE_EXECUTABLE_PROGRAM_DIGEST,
    neutralFallbackTestsPass: true,
    outcomeUnchanged: true,
    planStateDigest: SOURCE_PLAN_STATE_DIGEST,
    rawA1State: 'INELIGIBLE_OPTIONAL',
    rawWp400State: 'PENDING',
    wp400Dependencies: ['WP-207_WRITER_REFINEMENT', 'A1_OPTIONAL_RELATION_VOCABULARY'],
    ...overrides,
  };
}

test('C4 compiles exactly one append-only OPTIONAL_NEUTRAL edge without false DONE', () => {
  const result = compileOptionalNeutralCorrection(validInput());
  assert.equal(result.status, 'OPTIONAL_NEUTRAL_EFFECTIVE');
  assert.deepEqual(result.payload.effectiveDependency, {
    fromNodeId: 'A1_OPTIONAL_RELATION_VOCABULARY',
    relation: 'OPTIONAL_NEUTRAL',
    toNodeId: 'WP-400_ANCHOR_LINEAGE',
  });
  assert.deepEqual(result.payload.rawStatePreserved, {
    a1: 'INELIGIBLE_OPTIONAL',
    planStateMutation: false,
    wp400: 'PENDING',
  });
  assert.equal(result.payload.effectiveState.a1Done, false);
  assert.equal(result.payload.effectiveState.wp400AutoResume, false);
  assert.deepEqual(result.nonClaims, ['A1_DONE', 'WP400_DONE', 'WP400_AUTO_RESUMED', 'PROGRAM_DONE']);
  assert.equal(result.payloadDigest, sha256(canonicalBytes(result.payload)));
});

test('C4 correction is deterministic and binds exact raw source digests', () => {
  const first = compileOptionalNeutralCorrection(validInput());
  const second = compileOptionalNeutralCorrection(validInput());
  assert.deepEqual(first, second);
  assert.equal(first.payload.sourceBindings.planStateDigest, SOURCE_PLAN_STATE_DIGEST);
  assert.equal(first.payload.sourceBindings.executableProgramDigest, SOURCE_EXECUTABLE_PROGRAM_DIGEST);
  assert.equal(first.payload.sourceBindings.programTemplateDigest, PROGRAM_TEMPLATE_DIGEST);
  assert.equal(first.payload.sourceBindings.stageInstanceDigest, STAGE_INSTANCE_DIGEST);
  assert.equal(first.payload.sourceBindings.stageAdmissionDigest, STAGE_ADMISSION_DIGEST);
});

for (const vector of [
  ['raw A1 state changed', { rawA1State: 'DONE' }, 'RAW_A1_STATE_NOT_OPTIONAL'],
  ['raw WP-400 outcome changed', { rawWp400State: 'DONE' }, 'RAW_WP400_STATE_NOT_PENDING'],
  ['neutral fallback tests failed', { neutralFallbackTestsPass: false }, 'NEUTRAL_FALLBACK_TESTS_NOT_PASS'],
  ['outcome is not unchanged', { outcomeUnchanged: false }, 'OUTCOME_CHANGED'],
  ['amendment digest is not bound', { amendmentDigestBound: false }, 'AMENDMENT_DIGEST_NOT_BOUND'],
  ['A1 dependency edge is absent', { wp400Dependencies: ['A0_ATLAS_INCREMENTAL_EQUIVALENCE'] }, 'A1_EDGE_NOT_PRESENT'],
]) {
  test(`C4 emits an exact pathless owner gate when ${vector[0]}`, () => {
    const result = compileOptionalNeutralCorrection(validInput(vector[1]));
    assert.equal(result.status, 'OWNER_GATE');
    assert.equal(result.gateClass, 'OPTIONAL_RELATION_VOCABULARY_ADMISSION');
    assert.equal(result.ownerActionUnavoidable, true);
    assert.deepEqual(result.affectedCapabilityIds, ['CAP_R24_A1_OPTIONAL_RELATION', 'CAP_R24_WP400_ANCHOR_LINEAGE']);
    assert.equal(result.reasonCodes.includes(vector[2]), true);
    assert.equal(JSON.stringify(result).includes('/'), false);
  });
}

test('C4 actual artifacts preserve raw plan bytes and bind the amendment digest', () => {
  const planBefore = fs.readFileSync(path.join(ROOT, PATHS.planState));
  const executableBefore = fs.readFileSync(path.join(ROOT, PATHS.executableProgram));
  const artifacts = buildArtifacts(ROOT);
  assert.equal(artifacts.amendment.status, 'OPTIONAL_NEUTRAL_EFFECTIVE');
  assert.equal(artifacts.contract.amendmentDigest, sha256(canonicalBytes(artifacts.amendment)));
  assert.equal(artifacts.contract.invariants.rawStateImmutable, true);
  assert.equal(artifacts.contract.invariants.a1DoneForbidden, true);
  assert.equal(artifacts.contract.invariants.wp400AutoResumeForbidden, true);
  assert.equal(artifacts.matrix.vectors.length, 6);
  assert.deepEqual(fs.readFileSync(path.join(ROOT, PATHS.planState)), planBefore);
  assert.deepEqual(fs.readFileSync(path.join(ROOT, PATHS.executableProgram)), executableBefore);
});

test('C4 governance registries retain a resolvable control-plane evidence reference', () => {
  const stageApprovals = JSON.parse(fs.readFileSync(path.join(ROOT, PATHS.approvals), 'utf8'));
  const activeApprovals = JSON.parse(fs.readFileSync(path.join(ROOT, PATHS.activeApprovals), 'utf8'));
  assert.deepEqual(stageApprovals.evidenceStampIds, [CONTROL_PLANE_EVIDENCE_STAMP_ID]);
  assert.deepEqual(activeApprovals.evidenceStampIds, [CONTROL_PLANE_EVIDENCE_STAMP_ID]);
  assert.equal(
    fs.existsSync(path.join(ROOT, 'docs/OPS/R24/EVIDENCE', `${CONTROL_PLANE_EVIDENCE_STAMP_ID}.json`)),
    true,
  );
});

test('C4 stage and predecessor identities are exact and canonical', () => {
  const instanceBytes = fs.readFileSync(path.join(ROOT, PATHS.stageInstance));
  const admissionBytes = fs.readFileSync(path.join(ROOT, PATHS.stageAdmission));
  assert.equal(sha256(instanceBytes), STAGE_INSTANCE_DIGEST);
  assert.equal(sha256(admissionBytes), STAGE_ADMISSION_DIGEST);
  assert.equal(instanceBytes.equals(canonicalBytes(JSON.parse(instanceBytes))), true);
  assert.equal(admissionBytes.equals(canonicalBytes(JSON.parse(admissionBytes))), true);
  assert.match(PREDECESSOR_TERMINAL_DIGEST, /^[0-9a-f]{64}$/u);
  assert.match(ACCEPTANCE_SIGNALS_DIGEST, /^[0-9a-f]{64}$/u);
});

test('C4 source identity permits only the exact admitted ten-path write set', () => {
  assert.equal(WRITE_SET.length, 10);
  const identity = assertSourceIdentity(ROOT);
  assert.equal(identity.sourceHeadSha, '681e1b888f925d7261896492d36bf15ee387da71');
  assert.equal(identity.sourceTreeSha, 'd53d5bcdc6d775479a3198184e3e68489f388ba7');
});
