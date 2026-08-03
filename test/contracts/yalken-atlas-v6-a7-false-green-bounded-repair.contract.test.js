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

function tapFor(testNames, options = {}) {
  const skipIndex = options.skipIndex ?? -1;
  const todoIndex = options.todoIndex ?? -1;
  const records = testNames.flatMap((name, index) => {
    const directive = index === skipIndex
      ? ' # SKIP decisive skip negative'
      : index === todoIndex
        ? ' # TODO decisive todo negative'
        : '';
    return [
      `# Subtest: ${name}`,
      `ok ${index + 1} - ${name}${directive}`,
    ];
  });
  const skipped = skipIndex >= 0 ? 1 : 0;
  const todo = todoIndex >= 0 ? 1 : 0;
  const passed = testNames.length - skipped - todo;
  return [
    'TAP version 13',
    ...records,
    `1..${testNames.length}`,
    `# tests ${testNames.length}`,
    '# suites 0',
    `# pass ${passed}`,
    '# fail 0',
    '# cancelled 0',
    `# skipped ${skipped}`,
    `# todo ${todo}`,
    '# duration_ms 1',
    '',
  ].join('\n');
}

function diagnosticCodes(report) {
  return new Set(report.diagnostics.map((item) => item.code));
}

function cloneEvidenceMap(evidenceMap) {
  return evidenceMap.map((row) => ({ id: row.id, testNames: [...row.testNames] }));
}

test('Atlas V6 A7: exact named passing evidence certifies every production matrix row', async () => {
  const lifecycle = await loadLifecycle();
  const names = lifecycle.PRODUCTION_NEGATIVE_EVIDENCE_MAP.flatMap((row) => row.testNames);
  const report = lifecycle.evaluateAtlasV6NegativeMatrixExecution(passingExecution(tapFor(names)));

  assert.equal(report.pass, true);
  assert.equal(report.productionModulesExecuted, true);
  assert.equal(report.coverage.requiredRows, 17);
  assert.equal(report.coverage.coveredRows, 17);
  assert.equal(report.coverage.executedTests, names.length);
  assert.equal(report.coverage.skippedTests, 0);
  assert.equal(report.coverage.todoTests, 0);
  assert.deepEqual(report.diagnostics, []);
  assert.equal(report.matrix.every((row) => row.executed && row.pass), true);
  assert.equal(report.matrix.every((row) => row.evidence.every((item) => (
    item.executed && item.pass && Number.isInteger(item.testNumber)
  ))), true);
});

test('Atlas V6 A7: zero-test aggregate success fails closed', async () => {
  const lifecycle = await loadLifecycle();
  const stdout = [
    'TAP version 13',
    '1..0',
    '# tests 0',
    '# suites 0',
    '# pass 0',
    '# fail 0',
    '# cancelled 0',
    '# skipped 0',
    '# todo 0',
    '# duration_ms 1',
    '',
  ].join('\n');
  const report = lifecycle.evaluateAtlasV6NegativeMatrixExecution(passingExecution(stdout));
  const nonzero = lifecycle.evaluateAtlasV6NegativeMatrixExecution({
    ...passingExecution(stdout),
    ok: false,
    exitCode: 1,
  });

  assert.equal(report.pass, false);
  assert.equal(report.productionModulesExecuted, false);
  assert.equal(diagnosticCodes(report).has('E_TAP_ZERO_TESTS'), true);
  assert.equal(diagnosticCodes(report).has('E_MATRIX_EVIDENCE_MISSING'), true);
  assert.equal(report.coverage.coveredRows, 0);
  assert.equal(nonzero.pass, false);
  assert.equal(diagnosticCodes(nonzero).has('E_CHILD_EXECUTION_FAILED'), true);
});

test('Atlas V6 A7: skipped and todo tests fail closed', async () => {
  const lifecycle = await loadLifecycle();
  const names = lifecycle.PRODUCTION_NEGATIVE_EVIDENCE_MAP.flatMap((row) => row.testNames);
  const skipped = lifecycle.evaluateAtlasV6NegativeMatrixExecution(
    passingExecution(tapFor(names, { skipIndex: 0 })),
  );
  const todo = lifecycle.evaluateAtlasV6NegativeMatrixExecution(
    passingExecution(tapFor(names, { todoIndex: 0 })),
  );

  assert.equal(skipped.pass, false);
  assert.equal(diagnosticCodes(skipped).has('E_TAP_SKIPPED_TESTS'), true);
  assert.equal(todo.pass, false);
  assert.equal(diagnosticCodes(todo).has('E_TAP_TODO_TESTS'), true);
});

test('Atlas V6 A7: missing and duplicate matrix rows fail closed', async () => {
  const lifecycle = await loadLifecycle();
  const names = lifecycle.PRODUCTION_NEGATIVE_EVIDENCE_MAP.flatMap((row) => row.testNames);
  const map = cloneEvidenceMap(lifecycle.PRODUCTION_NEGATIVE_EVIDENCE_MAP);
  const missing = lifecycle.evaluateAtlasV6NegativeMatrixExecution(
    passingExecution(tapFor(names)),
    { evidenceMap: map.slice(1) },
  );
  const duplicate = lifecycle.evaluateAtlasV6NegativeMatrixExecution(
    passingExecution(tapFor(names)),
    { evidenceMap: [...map, { ...map[0], testNames: [...map[0].testNames] }] },
  );

  assert.equal(missing.pass, false);
  assert.equal(diagnosticCodes(missing).has('E_MATRIX_ROW_MISSING'), true);
  assert.equal(duplicate.pass, false);
  assert.equal(diagnosticCodes(duplicate).has('E_MATRIX_ROW_DUPLICATE'), true);
});

test('Atlas V6 A7: wrong row mapping fails closed', async () => {
  const lifecycle = await loadLifecycle();
  const names = lifecycle.PRODUCTION_NEGATIVE_EVIDENCE_MAP.flatMap((row) => row.testNames);
  const map = cloneEvidenceMap(lifecycle.PRODUCTION_NEGATIVE_EVIDENCE_MAP);
  [map[0].testNames, map[1].testNames] = [map[1].testNames, map[0].testNames];
  const report = lifecycle.evaluateAtlasV6NegativeMatrixExecution(
    passingExecution(tapFor(names)),
    { evidenceMap: map },
  );

  assert.equal(report.pass, false);
  assert.equal(diagnosticCodes(report).has('E_MATRIX_ROW_MAPPING_INVALID'), true);
});

test('Atlas V6 A7: malformed and inconsistent TAP reports fail closed', async () => {
  const lifecycle = await loadLifecycle();
  const names = lifecycle.PRODUCTION_NEGATIVE_EVIDENCE_MAP.flatMap((row) => row.testNames);
  const malformed = lifecycle.evaluateAtlasV6NegativeMatrixExecution(
    passingExecution(tapFor(names).replace('TAP version 13', 'TAP version unknown')),
  );
  const inconsistent = lifecycle.evaluateAtlasV6NegativeMatrixExecution(
    passingExecution(tapFor(names).replace(`# tests ${names.length}`, `# tests ${names.length + 1}`)),
  );
  const unexpected = lifecycle.evaluateAtlasV6NegativeMatrixExecution(
    passingExecution(`${tapFor(names)}malformed-junk\n`),
  );
  const duplicateHeader = lifecycle.evaluateAtlasV6NegativeMatrixExecution(
    passingExecution(tapFor(names).replace('TAP version 13', 'TAP version 13\nTAP version 13')),
  );

  assert.equal(malformed.pass, false);
  assert.equal(diagnosticCodes(malformed).has('E_TAP_HEADER_INVALID'), true);
  assert.equal(inconsistent.pass, false);
  assert.equal(diagnosticCodes(inconsistent).has('E_TAP_COUNTS_INCONSISTENT'), true);
  assert.equal(unexpected.pass, false);
  assert.equal(diagnosticCodes(unexpected).has('E_TAP_UNEXPECTED_TOP_LEVEL_LINE'), true);
  assert.equal(duplicateHeader.pass, false);
  assert.equal(diagnosticCodes(duplicateHeader).has('E_TAP_HEADER_INVALID'), true);
});

test('Atlas V6 A7: missing named evidence fails closed', async () => {
  const lifecycle = await loadLifecycle();
  const names = lifecycle.PRODUCTION_NEGATIVE_EVIDENCE_MAP.flatMap((row) => row.testNames);
  const missingName = names[0];
  const report = lifecycle.evaluateAtlasV6NegativeMatrixExecution(
    passingExecution(tapFor(names.slice(1))),
  );

  assert.equal(report.pass, false);
  assert.equal(report.diagnostics.some((item) => (
    item.code === 'E_MATRIX_EVIDENCE_MISSING' && item.detail === missingName
  )), true);
  assert.equal(report.matrix[0].executed, false);
});

test('Atlas V6 A7: duplicate test identity fails closed', async () => {
  const lifecycle = await loadLifecycle();
  const names = lifecycle.PRODUCTION_NEGATIVE_EVIDENCE_MAP.flatMap((row) => row.testNames);
  const report = lifecycle.evaluateAtlasV6NegativeMatrixExecution(
    passingExecution(tapFor([...names, names[0]])),
  );

  assert.equal(report.pass, false);
  assert.equal(diagnosticCodes(report).has('E_TAP_TEST_IDENTITY_DUPLICATE'), true);
  assert.equal(report.matrix[0].executed, false);
});

test('Atlas V6 A7: unmapped passing evidence fails closed', async () => {
  const lifecycle = await loadLifecycle();
  const names = lifecycle.PRODUCTION_NEGATIVE_EVIDENCE_MAP.flatMap((row) => row.testNames);
  const report = lifecycle.evaluateAtlasV6NegativeMatrixExecution(
    passingExecution(tapFor([...names, 'Atlas V6 A7: unowned false-green evidence'])),
  );

  assert.equal(report.pass, false);
  assert.equal(diagnosticCodes(report).has('E_MATRIX_EVIDENCE_UNMAPPED'), true);
});
