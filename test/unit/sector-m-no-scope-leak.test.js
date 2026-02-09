const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCOPE_MAP_PATH = path.join(process.cwd(), 'scripts', 'ops', 'sector-m-scope-map.json');

const M5_OVERLAY_ALLOW_PREFIXES = [
  'src/io/markdown/',
  'test/unit/sector-m-m5-',
  'test/fixtures/sector-m/m5/',
];

function readScopeMap() {
  const parsed = JSON.parse(fs.readFileSync(SCOPE_MAP_PATH, 'utf8'));
  assert.equal(parsed.schemaVersion, 'sector-m-scope-map.v1');
  assert.ok(Array.isArray(parsed.phaseOrder), 'phaseOrder must be array');
  assert.ok(parsed.allowByPhase && typeof parsed.allowByPhase === 'object', 'allowByPhase missing');
  assert.ok(parsed.allowPrefixByPhase && typeof parsed.allowPrefixByPhase === 'object', 'allowPrefixByPhase missing');
  assert.ok(Array.isArray(parsed.opsCarveoutAllow), 'opsCarveoutAllow must be array');
  return parsed;
}

function currentPhase() {
  const status = spawnSync(
    process.execPath,
    ['-e', "const fs=require('node:fs');const p=JSON.parse(fs.readFileSync('docs/OPS/STATUS/SECTOR_M.json','utf8'));process.stdout.write(String(p.phase||''));"],
    { encoding: 'utf8' },
  );
  if (status.status !== 0) return '';
  return String(status.stdout || '').trim();
}

function phaseIndex(scopeMap, phase) {
  const idx = scopeMap.phaseOrder.indexOf(phase);
  if (idx >= 0) return idx;
  const normalized = String(phase || '').toUpperCase();
  if (/^M\d+$/u.test(normalized)) {
    const nonDonePhases = scopeMap.phaseOrder.filter((item) => item !== 'DONE');
    return nonDonePhases.length > 0 ? scopeMap.phaseOrder.indexOf(nonDonePhases[nonDonePhases.length - 1]) : 0;
  }
  return 0;
}

function phaseAtLeast(scopeMap, phase, minPhase) {
  return phaseIndex(scopeMap, phase) >= phaseIndex(scopeMap, minPhase);
}

function buildAllowedForPhase(scopeMap, phase) {
  const allowed = new Set();
  const cappedIndex = phaseIndex(scopeMap, phase);
  for (let i = 0; i <= cappedIndex; i += 1) {
    const phaseName = scopeMap.phaseOrder[i];
    const phaseItems = Array.isArray(scopeMap.allowByPhase[phaseName]) ? scopeMap.allowByPhase[phaseName] : [];
    for (const item of phaseItems) allowed.add(item);
  }
  return allowed;
}

function buildAllowedPrefixesForPhase(scopeMap, phase) {
  const prefixes = new Set();
  const cappedIndex = phaseIndex(scopeMap, phase);
  for (let i = 0; i <= cappedIndex; i += 1) {
    const phaseName = scopeMap.phaseOrder[i];
    const phasePrefixes = Array.isArray(scopeMap.allowPrefixByPhase[phaseName]) ? scopeMap.allowPrefixByPhase[phaseName] : [];
    for (const item of phasePrefixes) prefixes.add(item);
  }
  return prefixes;
}

function isAllowedPathForPhase(scopeMap, filePath, phase) {
  const carveout = new Set(scopeMap.opsCarveoutAllow);
  if (carveout.has(filePath)) return true;

  const allowed = buildAllowedForPhase(scopeMap, phase);
  if (allowed.has(filePath)) return true;

  const prefixes = buildAllowedPrefixesForPhase(scopeMap, phase);
  if (phaseAtLeast(scopeMap, phase, 'M5')) {
    for (const prefix of M5_OVERLAY_ALLOW_PREFIXES) {
      prefixes.add(prefix);
    }
  }

  for (const prefix of prefixes) {
    if (filePath.startsWith(prefix)) return true;
  }
  return false;
}

test('sector-m diff does not leak outside cumulative phase allowlist', () => {
  const scopeMap = readScopeMap();
  const diff = spawnSync('git', ['diff', '--name-only', 'origin/main..HEAD'], {
    encoding: 'utf8',
  });
  assert.equal(diff.status, 0, `git diff failed:\n${diff.stdout}\n${diff.stderr}`);

  const files = String(diff.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const phase = currentPhase();
  const violations = files.filter((filePath) => !isAllowedPathForPhase(scopeMap, filePath, phase));
  assert.deepEqual(violations, [], `scope leak detected: ${violations.join(', ')}`);
});

test('phase map union includes M0..M4 allowlists when phase is M4', () => {
  const scopeMap = readScopeMap();
  const m4Union = buildAllowedForPhase(scopeMap, 'M4');

  for (const phase of ['M0', 'M1', 'M2', 'M3', 'M4']) {
    const items = Array.isArray(scopeMap.allowByPhase[phase]) ? scopeMap.allowByPhase[phase] : [];
    for (const item of items) {
      assert.equal(m4Union.has(item), true, `missing ${phase} item in M4 union: ${item}`);
    }
  }
});

test('unknown future phase uses latest known cumulative allowlist', () => {
  const scopeMap = readScopeMap();
  const futureAllowed = buildAllowedForPhase(scopeMap, 'M10');
  const latestKnown = buildAllowedForPhase(scopeMap, 'M9');
  assert.deepEqual([...futureAllowed].sort(), [...latestKnown].sort());
});

test('M8 scope addition is exact and does not use wildcard prefixes', () => {
  const scopeMap = readScopeMap();
  const m8Paths = Array.isArray(scopeMap.allowByPhase.M8) ? scopeMap.allowByPhase.M8 : [];
  const m8Prefixes = Array.isArray(scopeMap.allowPrefixByPhase.M8) ? scopeMap.allowPrefixByPhase.M8 : [];

  assert.deepEqual(m8Paths, [
    'test/unit/sector-m-m8-core.test.js',
    'test/unit/sector-m-m8-next.test.js',
  ]);
  for (const prefix of m8Prefixes) {
    assert.equal(prefix.includes('*'), false, `wildcard is forbidden in M8 prefixes: ${prefix}`);
  }
});

test('M9 scope addition is exact and does not use wildcard prefixes', () => {
  const scopeMap = readScopeMap();
  const m9Paths = Array.isArray(scopeMap.allowByPhase.M9) ? scopeMap.allowByPhase.M9 : [];
  const m9Prefixes = Array.isArray(scopeMap.allowPrefixByPhase.M9) ? scopeMap.allowPrefixByPhase.M9 : [];

  assert.deepEqual(m9Paths, [
    'test/unit/sector-m-m9-kickoff.test.js',
  ]);
  for (const prefix of m9Prefixes) {
    assert.equal(prefix.includes('*'), false, `wildcard is forbidden in M9 prefixes: ${prefix}`);
  }
});

test('M5 overlay prefixes are allowed only from M5 and above', () => {
  const scopeMap = readScopeMap();
  for (const prefix of M5_OVERLAY_ALLOW_PREFIXES) {
    const sample = prefix + 'sample.txt';
    assert.equal(isAllowedPathForPhase(scopeMap, sample, 'M4'), false, `M4 must reject M5 overlay path: ${sample}`);
    assert.equal(isAllowedPathForPhase(scopeMap, sample, 'M5'), true, `M5 must allow overlay path: ${sample}`);
  }
});

test('ops carveout stays explicit and narrow', () => {
  const scopeMap = readScopeMap();
  const carveout = scopeMap.opsCarveoutAllow;

  assert.ok(carveout.includes('docs/OPS/STATUS/CANON_WORKTREE_POLICY.md'));
  assert.ok(carveout.includes('docs/OPS/RUNBOOKS/DELIVERY_FALLBACK_NETWORK_DNS.md'));
  assert.ok(carveout.includes('scripts/ops/network-gate.mjs'));
  assert.ok(carveout.includes('scripts/ops/sector-m-scope-map.json'));
  assert.ok(carveout.includes('test/unit/ops-sector-m-process-fixes.test.js'));
  assert.ok(carveout.includes('test/unit/ops-sector-m-stability-003.test.js'));
  assert.ok(carveout.includes('docs/OPS/STANDARDS/PROCESS_CEILING_FREEZE.md'));
  assert.ok(carveout.includes('test/unit/ops-process-ceiling-freeze.test.js'));

  for (const item of carveout) {
    assert.equal(item.includes('**'), false, `wildcards are forbidden in ops carveout: ${item}`);
  }
});
