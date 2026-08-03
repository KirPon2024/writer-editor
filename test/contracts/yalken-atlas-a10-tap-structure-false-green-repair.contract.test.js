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

function recordsWithNestedBody(names, nestedBody) {
  return [
    `# Subtest: ${names[0]}`,
    ...nestedBody,
    `ok 1 - ${names[0]}`,
    ...names.slice(1).flatMap((name, index) => [
      `# Subtest: ${name}`,
      `ok ${index + 2} - ${name}`,
    ]),
  ];
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

test('Atlas V6 A10 nested: hidden nested failure fails closed', async () => {
  const lifecycle = await loadLifecycle();
  const names = lifecycle.PRODUCTION_NEGATIVE_EVIDENCE_MAP.flatMap((row) => row.testNames);
  const report = lifecycle.evaluateAtlasV6NegativeMatrixExecution(
    passingExecution(tapFromTopLevelRecords(recordsWithNestedBody(names, [
      '    # Subtest: hidden child',
      '    not ok 1 - hidden child',
      '    1..1',
      '    # tests 1',
      '    # pass 0',
      '    # fail 1',
      '    # skipped 0',
      '    # todo 0',
    ]))),
  );

  assert.equal(report.pass, false);
  assert.equal(report.coverage.executedTests, names.length);
  assert.equal(report.coverage.coveredRows, lifecycle.PRODUCTION_NEGATIVE_EVIDENCE_MAP.length);
  assert.equal(diagnosticCodes(report).has('E_TAP_NESTED_FAILED_TESTS'), true);
});

test('Atlas V6 A10 nested: hidden nested skip fails closed', async () => {
  const lifecycle = await loadLifecycle();
  const names = lifecycle.PRODUCTION_NEGATIVE_EVIDENCE_MAP.flatMap((row) => row.testNames);
  const report = lifecycle.evaluateAtlasV6NegativeMatrixExecution(
    passingExecution(tapFromTopLevelRecords(recordsWithNestedBody(names, [
      '    # Subtest: hidden child',
      '    ok 1 - hidden child # SKIP hidden',
      '    1..1',
      '    # tests 1',
      '    # pass 0',
      '    # fail 0',
      '    # skipped 1',
      '    # todo 0',
    ]))),
  );

  assert.equal(report.pass, false);
  assert.equal(report.coverage.executedTests, names.length);
  assert.equal(report.coverage.coveredRows, lifecycle.PRODUCTION_NEGATIVE_EVIDENCE_MAP.length);
  assert.equal(diagnosticCodes(report).has('E_TAP_NESTED_SKIPPED_TESTS'), true);
});

test('Atlas V6 A10 nested: hidden nested todo fails closed', async () => {
  const lifecycle = await loadLifecycle();
  const names = lifecycle.PRODUCTION_NEGATIVE_EVIDENCE_MAP.flatMap((row) => row.testNames);
  const report = lifecycle.evaluateAtlasV6NegativeMatrixExecution(
    passingExecution(tapFromTopLevelRecords(recordsWithNestedBody(names, [
      '    # Subtest: hidden child',
      '    ok 1 - hidden child # TODO hidden',
      '    1..1',
      '    # tests 1',
      '    # pass 0',
      '    # fail 0',
      '    # skipped 0',
      '    # todo 1',
    ]))),
  );

  assert.equal(report.pass, false);
  assert.equal(report.coverage.executedTests, names.length);
  assert.equal(report.coverage.coveredRows, lifecycle.PRODUCTION_NEGATIVE_EVIDENCE_MAP.length);
  assert.equal(diagnosticCodes(report).has('E_TAP_NESTED_TODO_TESTS'), true);
});

test('Atlas V6 A10 nested: incomplete nested subtest fails closed', async () => {
  const lifecycle = await loadLifecycle();
  const names = lifecycle.PRODUCTION_NEGATIVE_EVIDENCE_MAP.flatMap((row) => row.testNames);
  const report = lifecycle.evaluateAtlasV6NegativeMatrixExecution(
    passingExecution(tapFromTopLevelRecords(recordsWithNestedBody(names, [
      '    # Subtest: hidden child',
      '    1..1',
      '    # tests 1',
      '    # pass 1',
      '    # fail 0',
      '    # skipped 0',
      '    # todo 0',
    ]))),
  );

  assert.equal(report.pass, false);
  assert.equal(report.coverage.executedTests, names.length);
  assert.equal(report.coverage.coveredRows, lifecycle.PRODUCTION_NEGATIVE_EVIDENCE_MAP.length);
  assert.equal(diagnosticCodes(report).has('E_TAP_NESTED_TEST_RECORD_INCOMPLETE'), true);
});

test('Atlas V6 A10 nested: invalid nested content fails closed', async () => {
  const lifecycle = await loadLifecycle();
  const names = lifecycle.PRODUCTION_NEGATIVE_EVIDENCE_MAP.flatMap((row) => row.testNames);
  const report = lifecycle.evaluateAtlasV6NegativeMatrixExecution(
    passingExecution(tapFromTopLevelRecords(recordsWithNestedBody(names, [
      '    # Subtest: hidden child',
      '    @@@ invalid nested tap',
      '    ok 1 - hidden child',
      '    1..1',
      '    # tests 1',
      '    # pass 1',
      '    # fail 0',
      '    # skipped 0',
      '    # todo 0',
    ]))),
  );

  assert.equal(report.pass, false);
  assert.equal(report.coverage.executedTests, names.length);
  assert.equal(report.coverage.coveredRows, lifecycle.PRODUCTION_NEGATIVE_EVIDENCE_MAP.length);
  assert.equal(diagnosticCodes(report).has('E_TAP_NESTED_UNEXPECTED_LINE'), true);
});
