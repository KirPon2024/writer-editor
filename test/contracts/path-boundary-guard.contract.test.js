const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const pathBoundary = require('../../src/core/io/path-boundary.js');

let stateModulePromise = null;

function loadStateModule() {
  if (!stateModulePromise) {
    stateModulePromise = import(pathToFileURL(
      path.join(process.cwd(), 'scripts/ops/path-boundary-guard-state.mjs'),
    ).href);
  }
  return stateModulePromise;
}

// scenario id: relative-path-positive
test('path boundary guard: relative-path-positive', () => {
  const state = pathBoundary.validatePathBoundary('docs/OPS/STATUS/XPLAT_ROLLOUT_PLAN_v3_12.json', {
    mode: 'relative',
  });
  assert.equal(state.ok, true);
  assert.equal(state.normalizedPath, 'docs/OPS/STATUS/XPLAT_ROLLOUT_PLAN_v3_12.json');
});

// scenario id: parent-segment-negative
test('path boundary guard: parent-segment-negative returns E_PATH_BOUNDARY_VIOLATION', () => {
  const state = pathBoundary.validatePathBoundary('../etc/passwd', { mode: 'relative' });
  assert.equal(state.ok, false);
  assert.equal(state.failSignal, 'E_PATH_BOUNDARY_VIOLATION');
});

// scenario id: absolute-path-negative
test('path boundary guard: absolute-path-negative returns E_PATH_BOUNDARY_VIOLATION', () => {
  const state = pathBoundary.validatePathBoundary('/tmp/unsafe.txt', { mode: 'relative' });
  assert.equal(state.ok, false);
  assert.equal(state.failSignal, 'E_PATH_BOUNDARY_VIOLATION');
});

// scenario id: unc-path-negative
test('path boundary guard: unc-path-negative returns E_PATH_BOUNDARY_VIOLATION', () => {
  const state = pathBoundary.validatePathBoundary('//server/share/file.txt', { mode: 'relative' });
  assert.equal(state.ok, false);
  assert.equal(state.failSignal, 'E_PATH_BOUNDARY_VIOLATION');
});

// scenario id: file-scheme-negative
test('path boundary guard: file-scheme-negative returns E_PATH_BOUNDARY_VIOLATION', () => {
  const state = pathBoundary.validatePathBoundary('file:///tmp/unsafe.txt', { mode: 'relative' });
  assert.equal(state.ok, false);
  assert.equal(state.failSignal, 'E_PATH_BOUNDARY_VIOLATION');
});

// scenario id: nul-byte-negative
test('path boundary guard: nul-byte-negative returns E_PATH_BOUNDARY_VIOLATION', () => {
  const state = pathBoundary.validatePathBoundary('safe\u0000name.txt', { mode: 'relative' });
  assert.equal(state.ok, false);
  assert.equal(state.failSignal, 'E_PATH_BOUNDARY_VIOLATION');
});

test('path boundary guard: determinism returns stable output for identical input', () => {
  const runA = pathBoundary.validatePathBoundary('docs/OPS/STATUS/WAVE_FRESHNESS_POLICY_v3_12.json', {
    mode: 'relative',
  });
  const runB = pathBoundary.validatePathBoundary('docs/OPS/STATUS/WAVE_FRESHNESS_POLICY_v3_12.json', {
    mode: 'relative',
  });
  assert.deepEqual(runA, runB);
});

test('path boundary guard state: baseline wiring is valid', async () => {
  const { evaluatePathBoundaryGuardState } = await loadStateModule();
  const state = evaluatePathBoundaryGuardState();
  assert.equal(state.ok, true, JSON.stringify(state, null, 2));
  assert.equal(state.PATH_BOUNDARY_GUARD_OK, 1);
  assert.equal(state.failSignal, '');
});

test('path boundary guard state: missing contract scenario fails deterministically', async () => {
  const { evaluatePathBoundaryGuardState } = await loadStateModule();
  const state = evaluatePathBoundaryGuardState({
    testText: 'scenario id: relative-path-positive\nscenario id: parent-segment-negative\n',
  });
  assert.equal(state.ok, false);
  assert.equal(state.PATH_BOUNDARY_GUARD_OK, 0);
  assert.equal(state.failSignal, 'E_PATH_BOUNDARY_VIOLATION');
  assert.equal(state.failReason, 'PATH_BOUNDARY_NEGATIVE_TESTS_MISSING');
});

