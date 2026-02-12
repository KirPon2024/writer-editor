const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let modulePromise = null;

function loadModule() {
  if (!modulePromise) {
    const href = pathToFileURL(
      path.join(process.cwd(), 'scripts/ops/token-source-conflict-state.mjs'),
    ).href;
    modulePromise = import(href);
  }
  return modulePromise;
}

test('token-source-conflict: PASS when truth-table and ops-summary token values match', async () => {
  const { evaluateTokenSourceConflictState } = await loadModule();
  const state = evaluateTokenSourceConflictState({
    tokenDeclarationJson: {
      schemaVersion: 1,
      existingTokens: ['B_TOKEN', 'A_TOKEN'],
      targetTokens: ['TOKEN_SOURCE_CONFLICT_OK'],
    },
    truthTableJson: {
      A_TOKEN: 1,
      B_TOKEN: 'ready',
    },
    opsSummaryTokenValues: {
      A_TOKEN: 1,
      B_TOKEN: 'ready',
    },
  });

  assert.equal(state.ok, true);
  assert.equal(state.TOKEN_SOURCE_CONFLICT_OK, 1);
  assert.deepEqual(state.conflicts, []);
  assert.deepEqual(state.failures, []);
  assert.match(String(state.configHash || ''), /^[0-9a-f]{64}$/u);
});

test('token-source-conflict: FAIL with E_TOKEN_SOURCE_CONFLICT on mismatch', async () => {
  const { evaluateTokenSourceConflictState } = await loadModule();
  const state = evaluateTokenSourceConflictState({
    tokenDeclarationJson: {
      schemaVersion: 1,
      existingTokens: ['A_TOKEN', 'B_TOKEN'],
      targetTokens: [],
    },
    truthTableJson: {
      A_TOKEN: 1,
      B_TOKEN: 1,
    },
    opsSummaryTokenValues: {
      A_TOKEN: 0,
    },
  });

  assert.equal(state.ok, false);
  assert.equal(state.TOKEN_SOURCE_CONFLICT_OK, 0);
  assert.ok(state.failures.includes('E_TOKEN_SOURCE_CONFLICT'));
  assert.ok(state.conflicts.length > 0);
  assert.equal(state.conflicts[0].token, 'A_TOKEN');
  assert.equal(state.conflicts[0].reason, 'VALUE_MISMATCH');
  assert.equal(state.conflicts[1].token, 'B_TOKEN');
  assert.equal(state.conflicts[1].reason, 'SOURCE_MISSING');
});

test('token-source-conflict: deterministic sorted conflicts and stable result', async () => {
  const { evaluateTokenSourceConflictState } = await loadModule();
  const input = {
    tokenDeclarationJson: {
      schemaVersion: 1,
      existingTokens: ['C_TOKEN', 'A_TOKEN', 'B_TOKEN'],
      targetTokens: [],
    },
    truthTableJson: {
      C_TOKEN: 1,
      B_TOKEN: 1,
      A_TOKEN: 1,
    },
    opsSummaryTokenValues: {},
  };

  const first = evaluateTokenSourceConflictState(input);
  const second = evaluateTokenSourceConflictState(input);
  assert.deepEqual(first, second);
  assert.deepEqual(
    first.conflicts.map((item) => item.token),
    ['A_TOKEN', 'B_TOKEN', 'C_TOKEN'],
  );
  assert.deepEqual(first.failures, [...first.failures].sort());
});
