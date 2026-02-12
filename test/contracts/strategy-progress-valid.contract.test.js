const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

let modulePromise = null;

function loadEvaluator() {
  if (!modulePromise) {
    const href = pathToFileURL(path.join(process.cwd(), 'scripts/ops/strategy-progress-valid-state.mjs')).href;
    modulePromise = import(href);
  }
  return modulePromise;
}

function parseTokens(stdout) {
  const out = new Map();
  for (const raw of String(stdout || '').split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line) continue;
    const normalized = line.startsWith('DOCTOR_TOKEN ')
      ? line.slice('DOCTOR_TOKEN '.length).trim()
      : line;
    const idx = normalized.indexOf('=');
    if (idx <= 0) continue;
    out.set(normalized.slice(0, idx), normalized.slice(idx + 1));
  }
  return out;
}

test('strategy progress valid: script returns schema with deterministic fields', () => {
  const result = spawnSync(process.execPath, ['scripts/ops/strategy-progress-valid-state.mjs', '--json'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `strategy-progress-valid-state failed:\n${result.stdout}\n${result.stderr}`);
  const payload = JSON.parse(String(result.stdout || '{}'));

  assert.equal(typeof payload.ok, 'boolean');
  assert.ok(payload.status === 'VALID' || payload.status === 'PLACEHOLDER');
  assert.ok(Array.isArray(payload.failures));
  assert.deepEqual(payload.failures, [...payload.failures].sort());
  assert.ok(payload.details && typeof payload.details === 'object' && !Array.isArray(payload.details));
  assert.match(String(payload.configHash || ''), /^[0-9a-f]{64}$/u);
  assert.equal(typeof payload.STRATEGY_PROGRESS_VALID, 'number');
  assert.equal(payload.STRATEGY_PROGRESS_VALID, payload.token.STRATEGY_PROGRESS_VALID);
});

test('strategy progress valid: evaluate function is deterministic for same normalized input', async () => {
  const { evaluateStrategyProgressValidState } = await loadEvaluator();
  const input = {
    remote: {
      headSha: 'a'.repeat(40),
      originMainSha: 'a'.repeat(40),
      headEqualsOrigin: 1,
      ancestorOk: 1,
      remoteBindingOk: 1,
    },
    headStrict: {
      mode: 'release',
      ok: 1,
      failReason: '',
      headSha: 'a'.repeat(40),
      originMainSha: 'a'.repeat(40),
      headEqualsOrigin: 1,
      originAncestorOfHead: 1,
      releaseTagPresent: 0,
    },
    requiredChecks: {
      syncOk: 1,
      stale: 0,
      source: 'canonical',
      failReason: '',
    },
    nextSector: {
      valid: true,
      failReason: '',
      id: 'NONE',
      mode: 'IDLE',
      reason: 'ALL_SECTORS_DONE',
      targetSector: '',
      targetStatus: '',
      allSectorsDone: true,
      knownSectors: ['P', 'W', 'U', 'M'],
    },
    sectorStatuses: {
      M: 'DONE',
      P: 'DONE',
      U: 'DONE',
      W: 'DONE',
    },
  };
  const first = evaluateStrategyProgressValidState(input);
  const second = evaluateStrategyProgressValidState(input);
  assert.deepEqual(first, second);
  assert.equal(first.ok, true);
  assert.equal(first.STRATEGY_PROGRESS_VALID, 1);
});

test('strategy progress valid: head binding mismatch cannot pass', async () => {
  const { evaluateStrategyProgressValidState } = await loadEvaluator();
  const state = evaluateStrategyProgressValidState({
    remote: {
      headSha: 'a'.repeat(40),
      originMainSha: 'b'.repeat(40),
      headEqualsOrigin: 0,
      ancestorOk: 0,
      remoteBindingOk: 0,
    },
    headStrict: {
      mode: 'release',
      ok: 0,
      failReason: 'E_HEAD_BINDING_INVALID',
      headSha: 'a'.repeat(40),
      originMainSha: 'b'.repeat(40),
      headEqualsOrigin: 0,
      originAncestorOfHead: 0,
      releaseTagPresent: 0,
    },
    requiredChecks: {
      syncOk: 1,
      stale: 0,
      source: 'canonical',
      failReason: '',
    },
    nextSector: {
      valid: true,
      failReason: '',
      id: 'NONE',
      mode: 'IDLE',
      reason: 'ALL_SECTORS_DONE',
      targetSector: '',
      targetStatus: '',
      allSectorsDone: true,
      knownSectors: ['M', 'P', 'U', 'W'],
    },
    sectorStatuses: {
      M: 'DONE',
      P: 'DONE',
      U: 'DONE',
      W: 'DONE',
    },
  });

  assert.equal(state.ok, false);
  assert.equal(state.STRATEGY_PROGRESS_VALID, 0);
  assert.ok(state.failures.includes('E_STRATEGY_PROGRESS_REMOTE_BINDING_INVALID'));
  assert.ok(state.failures.includes('E_STRATEGY_PROGRESS_HEAD_BINDING_INVALID'));
});

test('strategy progress valid: failure codes are typed and sorted', async () => {
  const { evaluateStrategyProgressValidState } = await loadEvaluator();
  const state = evaluateStrategyProgressValidState({
    remote: {
      headSha: '',
      originMainSha: '',
      headEqualsOrigin: 0,
      ancestorOk: 0,
      remoteBindingOk: 0,
    },
    headStrict: {
      mode: 'release',
      ok: 0,
      failReason: 'E_HEAD_BINDING_INVALID',
      headSha: '',
      originMainSha: '',
      headEqualsOrigin: 0,
      originAncestorOfHead: 0,
      releaseTagPresent: 0,
    },
    requiredChecks: {
      syncOk: 0,
      stale: 1,
      source: 'runtime',
      failReason: 'REQUIRED_CHECKS_INVALID',
    },
    nextSector: {
      valid: false,
      failReason: 'NEXT_SECTOR_INVALID',
      id: 'SECTOR M',
      mode: 'ACTIVE',
      reason: 'ROLLUP',
      targetSector: 'M',
      targetStatus: 'DONE',
      allSectorsDone: false,
      knownSectors: ['M'],
    },
    sectorStatuses: {
      M: 'BROKEN',
    },
  });

  assert.equal(state.ok, false);
  assert.deepEqual(state.failures, [...state.failures].sort());
  assert.ok(state.failures.length >= 4);
  for (const code of state.failures) {
    assert.match(code, /^E_[A-Z0-9_]+$/u);
  }
});

test('strategy progress valid token is emitted by truth-table, ops-summary and doctor', () => {
  const truth = spawnSync(process.execPath, ['scripts/ops/extract-truth-table.mjs', '--json'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TOKEN_DECLARATION_SKIP_EMISSION_CHECK: '1',
    },
  });
  assert.equal(truth.status, 0, `truth-table failed:\n${truth.stdout}\n${truth.stderr}`);
  const truthPayload = JSON.parse(String(truth.stdout || '{}'));
  assert.equal(typeof truthPayload.STRATEGY_PROGRESS_VALID, 'number');

  const summary = spawnSync(process.execPath, ['scripts/ops/emit-ops-summary.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TOKEN_DECLARATION_SKIP_EMISSION_CHECK: '1',
    },
  });
  assert.ok(summary.status === 0 || summary.status === 1, `ops-summary failed:\n${summary.stdout}\n${summary.stderr}`);
  const summaryTokens = parseTokens(summary.stdout);
  assert.ok(summaryTokens.has('OPS_SUMMARY_STRATEGY_PROGRESS_VALID'));

  const doctor = spawnSync(process.execPath, ['scripts/doctor.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DOCTOR_MODE: 'delivery',
      TOKEN_DECLARATION_SKIP_EMISSION_CHECK: '1',
    },
  });
  assert.ok(doctor.status === 0 || doctor.status === 1, `doctor failed:\n${doctor.stdout}\n${doctor.stderr}`);
  const doctorTokens = parseTokens(doctor.stdout);
  assert.ok(doctorTokens.has('STRATEGY_PROGRESS_VALID'));
});
