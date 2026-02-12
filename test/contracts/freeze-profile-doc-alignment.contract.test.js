const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = ['scripts/ops/freeze-profile-doc-alignment-state.mjs', '--json'];

function runState(extraEnv = {}) {
  const result = spawnSync(process.execPath, SCRIPT, {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...extraEnv,
    },
  });
  assert.equal(result.status, 0, `freeze-profile-doc-alignment-state failed:\n${result.stdout}\n${result.stderr}`);
  return JSON.parse(String(result.stdout || '{}'));
}

function writeDoc(content) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'freeze-profile-doc-alignment-'));
  const filePath = path.join(tempDir, 'XPLAT_UNIFIED_MASTER_EXECUTION_CONTRACT_v1.0.md');
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

function buildContractWithRequiredTokens(tokens) {
  return [
    '# 26. CRITICAL_ROLLUPS_BASELINE (FREEZE REQUIRED)',
    '',
    'Обязательные = 1:',
    '',
    ...tokens,
    '',
    'Optional (scope-gated):',
    'COLLAB_STRESS_SAFE_OK',
    '',
    '# 27. NEXT SECTION',
    '',
    'Content.',
  ].join('\n');
}

function assertSortedUniqueStringArray(value, fieldName) {
  assert.ok(Array.isArray(value), `${fieldName} must be an array`);
  const sorted = [...value].sort();
  assert.deepEqual(value, sorted, `${fieldName} must be sorted`);
  assert.equal(new Set(value).size, value.length, `${fieldName} must be unique`);
}

test('freeze-profile-doc-alignment: deterministic output with stable sorted arrays', () => {
  const runtimeProbe = runState();
  assert.ok(runtimeProbe.runtimeRequiredAlways.length > 0, 'runtimeRequiredAlways must not be empty');

  const unsortedWithDuplicate = [
    runtimeProbe.runtimeRequiredAlways[runtimeProbe.runtimeRequiredAlways.length - 1],
    ...runtimeProbe.runtimeRequiredAlways.slice(0, -1),
    runtimeProbe.runtimeRequiredAlways[0],
  ];
  const docPath = writeDoc(buildContractWithRequiredTokens(unsortedWithDuplicate));

  const runA = runState({ FREEZE_PROFILE_DOC_ALIGNMENT_DOC_PATH: docPath });
  const runB = runState({ FREEZE_PROFILE_DOC_ALIGNMENT_DOC_PATH: docPath });
  assert.deepEqual(runA, runB);

  assertSortedUniqueStringArray(runA.runtimeRequiredAlways, 'runtimeRequiredAlways');
  assertSortedUniqueStringArray(runA.docRequiredBaseline, 'docRequiredBaseline');
  assertSortedUniqueStringArray(runA.missingInDoc, 'missingInDoc');
  assertSortedUniqueStringArray(runA.extraInDoc, 'extraInDoc');
  assertSortedUniqueStringArray(runA.failures, 'failures');
});

test('freeze-profile-doc-alignment: missing required doc section returns parse failure token=0', () => {
  const missingSectionDoc = writeDoc([
    '# 25. CRITICAL_ROLLUPS_BASELINE (FREEZE REQUIRED)',
    '',
    'Обязательные = 1:',
    '',
    'HEAD_STRICT_OK',
  ].join('\n'));

  const payload = runState({ FREEZE_PROFILE_DOC_ALIGNMENT_DOC_PATH: missingSectionDoc });
  assert.equal(payload.ok, false);
  assert.equal(payload.token, 0);
  assert.ok(payload.failures.includes('E_DOC_PARSE_FAILED'));
});

test('freeze-profile-doc-alignment: mismatch emits token=0 with non-empty diff arrays', () => {
  const runtimeProbe = runState();
  const runtime = runtimeProbe.runtimeRequiredAlways;
  assert.ok(runtime.length > 1, 'runtimeRequiredAlways must contain at least 2 items');

  const removedToken = runtime[0];
  const mismatchDocTokens = runtime.slice(1).concat('EXTRA_RUNTIME_DOC_TOKEN');
  const mismatchDocPath = writeDoc(buildContractWithRequiredTokens(mismatchDocTokens));

  const payload = runState({ FREEZE_PROFILE_DOC_ALIGNMENT_DOC_PATH: mismatchDocPath });
  assert.equal(payload.ok, false);
  assert.equal(payload.token, 0);
  assert.ok(payload.failures.includes('E_ALIGNMENT_MISMATCH'));
  assert.ok(payload.missingInDoc.includes(removedToken));
  assert.ok(payload.extraInDoc.includes('EXTRA_RUNTIME_DOC_TOKEN'));
  assert.ok(payload.missingInDoc.length > 0);
  assert.ok(payload.extraInDoc.length > 0);
});

test('freeze-profile-doc-alignment: happy path emits token=1 when sets align', () => {
  const runtimeProbe = runState();
  const alignedDocPath = writeDoc(buildContractWithRequiredTokens(runtimeProbe.runtimeRequiredAlways));

  const payload = runState({ FREEZE_PROFILE_DOC_ALIGNMENT_DOC_PATH: alignedDocPath });
  assert.equal(payload.ok, true);
  assert.equal(payload.token, 1);
  assert.deepEqual(payload.missingInDoc, []);
  assert.deepEqual(payload.extraInDoc, []);
  assert.deepEqual(payload.failures, []);
  assert.deepEqual(payload.docRequiredBaseline, runtimeProbe.runtimeRequiredAlways);
});
