const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
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

// scenario id: symlink-traversal-negative
test('path boundary guard: symlink-traversal-negative returns E_PATH_BOUNDARY_VIOLATION', async (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows symlink traversal case is skipped; traversal is covered by parent-segment-negative.');
  }

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'path-boundary-'));
  const workspaceRoot = path.join(tempRoot, 'workspace');
  const outsideRoot = path.join(tempRoot, 'outside');
  const symlinkDir = path.join(workspaceRoot, 'roman-link');

  try {
    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.mkdir(outsideRoot, { recursive: true });
    await fs.symlink(outsideRoot, symlinkDir, 'dir');

    const state = pathBoundary.validatePathWithinRoot(
      path.join(symlinkDir, 'scene.txt'),
      workspaceRoot,
      { mode: 'any', resolveSymlinks: true },
    );
    assert.equal(state.ok, false);
    assert.equal(state.failSignal, 'E_PATH_BOUNDARY_VIOLATION');
    assert.equal(state.failReason, 'PATH_SYMLINK_OUTSIDE_ROOT');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

// scenario id: unicode-normalization-equivalent
test('path boundary guard: unicode-normalization-equivalent normalizes to NFC', () => {
  const decomposed = pathBoundary.validatePathBoundary('docs/cafe\u0301.txt', { mode: 'relative' });
  const composed = pathBoundary.validatePathBoundary('docs/caf\u00e9.txt', { mode: 'relative' });
  assert.equal(decomposed.ok, true);
  assert.equal(composed.ok, true);
  assert.equal(decomposed.normalizedPath, composed.normalizedPath);
  assert.equal(composed.normalizedPath, 'docs/caf\u00e9.txt');
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

test('path boundary guard state: missing guard markers fails deterministically', async () => {
  const { evaluatePathBoundaryGuardState } = await loadStateModule();
  const state = evaluatePathBoundaryGuardState({
    guardText: 'module.exports = { sanitizePathFields: () => ({ ok: true }) };',
  });
  assert.equal(state.ok, false);
  assert.equal(state.PATH_BOUNDARY_GUARD_OK, 0);
  assert.equal(state.failSignal, 'E_PATH_BOUNDARY_VIOLATION');
  assert.equal(state.failReason, 'PATH_BOUNDARY_GUARD_NOT_WIRED');
});
