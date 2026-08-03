const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

async function loadLifecycle() {
  return import(pathToFileURL(path.join(
    ROOT,
    'scripts',
    'ops',
    'yalken-atlas-v6-production-lifecycle.mjs',
  )).href);
}

function passingExecution(stdout) {
  return { ok: true, exitCode: 0, signal: '', stdout, stderr: '' };
}

function tapFromTopLevelRecords(records, options = {}) {
  const tests = options.tests ?? records.filter((line) => line.startsWith('ok ') || line.startsWith('not ok ')).length;
  const pass = options.pass ?? records.filter((line) => line.startsWith('ok ')).length;
  const fail = options.fail ?? records.filter((line) => line.startsWith('not ok ')).length;
  return [
    'TAP version 13',
    ...records,
    `1..${tests}`,
    `# tests ${tests}`,
    '# suites 0',
    `# pass ${pass}`,
    `# fail ${fail}`,
    '# cancelled 0',
    '# skipped 0',
    '# todo 0',
    '# duration_ms 1',
    '',
  ].join('\n');
}

function diagnosticCodes(report) {
  return new Set(report.diagnostics.map((item) => item.code));
}

test('Atlas V6 A10: all subtests followed by all statuses fails closed', async () => {
  const lifecycle = await loadLifecycle();
  const names = lifecycle.PRODUCTION_NEGATIVE_EVIDENCE_MAP.flatMap((row) => row.testNames);
  const stdout = tapFromTopLevelRecords([
    ...names.map((name) => `# Subtest: ${name}`),
    ...names.map((name, index) => `ok ${index + 1} - ${name}`),
  ]);
  const report = lifecycle.evaluateAtlasV6NegativeMatrixExecution(passingExecution(stdout));

  assert.equal(report.pass, false);
  assert.equal(diagnosticCodes(report).has('E_TAP_TEST_RECORD_BOUNDARY'), true);
  assert.equal(report.coverage.executedTests < names.length, true);
});

test('Atlas V6 A10: interleaved foreign status cannot certify another record', async () => {
  const lifecycle = await loadLifecycle();
  const names = lifecycle.PRODUCTION_NEGATIVE_EVIDENCE_MAP.flatMap((row) => row.testNames);
  const records = names.flatMap((name, index) => [
    `# Subtest: ${name}`,
    `ok ${index + 1} - ${index === 0 ? names[1] : index === 1 ? names[0] : name}`,
  ]);
  const report = lifecycle.evaluateAtlasV6NegativeMatrixExecution(
    passingExecution(tapFromTopLevelRecords(records)),
  );

  assert.equal(report.pass, false);
  assert.equal(diagnosticCodes(report).has('E_TAP_TEST_IDENTITY_MISMATCH'), true);
});

test('Atlas V6 A10: orphan status evidence fails closed', async () => {
  const lifecycle = await loadLifecycle();
  const names = lifecycle.PRODUCTION_NEGATIVE_EVIDENCE_MAP.flatMap((row) => row.testNames);
  const records = [
    `ok 1 - ${names[0]}`,
    ...names.slice(1).flatMap((name, index) => [
      `# Subtest: ${name}`,
      `ok ${index + 2} - ${name}`,
    ]),
  ];
  const report = lifecycle.evaluateAtlasV6NegativeMatrixExecution(
    passingExecution(tapFromTopLevelRecords(records)),
  );

  assert.equal(report.pass, false);
  assert.equal(diagnosticCodes(report).has('E_TAP_STATUS_ORPHAN'), true);
  assert.equal(report.diagnostics.some((item) => (
    item.code === 'E_MATRIX_EVIDENCE_MISSING' && item.detail === names[0]
  )), true);
});

test('Atlas V6 A10: status crossing a record boundary fails closed', async () => {
  const lifecycle = await loadLifecycle();
  const names = lifecycle.PRODUCTION_NEGATIVE_EVIDENCE_MAP.flatMap((row) => row.testNames);
  const records = [
    `# Subtest: ${names[0]}`,
    `# Subtest: ${names[1]}`,
    `ok 1 - ${names[0]}`,
    `ok 2 - ${names[1]}`,
    ...names.slice(2).flatMap((name, index) => [
      `# Subtest: ${name}`,
      `ok ${index + 3} - ${name}`,
    ]),
  ];
  const report = lifecycle.evaluateAtlasV6NegativeMatrixExecution(
    passingExecution(tapFromTopLevelRecords(records)),
  );

  assert.equal(report.pass, false);
  assert.equal(diagnosticCodes(report).has('E_TAP_TEST_RECORD_BOUNDARY'), true);
  assert.equal(diagnosticCodes(report).has('E_TAP_TEST_IDENTITY_MISMATCH'), true);
  assert.equal(diagnosticCodes(report).has('E_TAP_STATUS_ORPHAN'), true);
});
