const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const VERIFIER_PATH = path.join(
  REPO_ROOT,
  'scripts',
  'ops',
  'rtk-word-release-audit-p0-parsed-ir-preview-apply-replay.mjs',
);

async function loadVerifier() {
  return import(pathToFileURL(VERIFIER_PATH).href);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

test('release audit P0 parsed IR loop verifier binds preview apply replay without release overclaim', async () => {
  const mod = await loadVerifier();
  const result = mod.evaluateWordReleaseAuditP0ParsedIrPreviewApplyReplay();

  assert.equal(result.status, 'PASS', JSON.stringify(result, null, 2));
  assert.equal(result.parsedWordIrSoleWriterOperationSource, true);
  assert.equal(result.visibleExactPreviewWired, true);
  assert.equal(result.explicitUserConfirmedCommandApplyWired, true);
  assert.equal(result.automaticApplyCertified, false);
  assert.equal(result.wordSaturated, false);
});

test('release audit P0 parsed IR loop verifier fails on writer-source or authority overclaim drift', async () => {
  const mod = await loadVerifier();
  const baseline = mod.evaluateWordReleaseAuditP0ParsedIrPreviewApplyReplay();
  assert.equal(baseline.status, 'PASS', JSON.stringify(baseline, null, 2));

  const receipt = cloneJson(require(path.join(
    REPO_ROOT,
    'docs',
    'OPS',
    'RTK',
    'WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_PARSED_IR_PREVIEW_APPLY_REPLAY_RECEIPT.json',
  )));
  const program = cloneJson(require(path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json')));
  const profile = cloneJson(require(path.join(
    REPO_ROOT,
    'docs',
    'OPS',
    'RTK',
    'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json',
  )));
  const ledger = cloneJson(require(path.join(
    REPO_ROOT,
    'docs',
    'OPS',
    'RTK',
    'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json',
  )));

  receipt.implementedCapability.parsedWordIrSoleWriterOperationSource = false;
  receipt.implementedCapability.automaticApplyCertified = true;
  program.releaseAuditNight01.googleDocsOpened = true;
  const cell = profile.cells.find((item) => item.capabilityId === 'rtk.word.releaseAudit.p0.parsedIrPreviewApplyReplay');
  cell.wordSaturated = true;
  ledger.coverageLedger.releaseAuditNight01P0ParsedIrPreviewApplyReplay.automaticApplyCertified = true;

  const result = mod.evaluateWordReleaseAuditP0ParsedIrPreviewApplyReplay({
    receipt,
    program,
    profile,
    ledger,
  });
  assert.equal(result.status, 'FAIL');
  assert.ok(result.issues.some((issue) => issue.code === 'RTK_RELEASE_AUDIT_P0_PARSED_IR_LOOP_CAPABILITY_INVALID'));
  assert.ok(result.issues.some((issue) => issue.code === 'RTK_RELEASE_AUDIT_P0_PARSED_IR_LOOP_OVERCLAIM'));
  assert.ok(result.issues.some((issue) => issue.code === 'RTK_RELEASE_AUDIT_P0_PARSED_IR_LOOP_PROGRAM_INVALID'));
  assert.ok(result.issues.some((issue) => issue.code === 'RTK_RELEASE_AUDIT_P0_PARSED_IR_LOOP_PROFILE_INVALID'));
  assert.ok(result.issues.some((issue) => issue.code === 'RTK_RELEASE_AUDIT_P0_PARSED_IR_LOOP_LEDGER_INVALID'));
});
