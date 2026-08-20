// R2.4 E0: committed form of the doctor synthetic negative tests.
// Previously self-materialized by scripts/run-tests.js into a fixed
// predictable /tmp path at run time; now a static reviewable file.
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');

function parseTokens(stdout) {
  const lines = String(stdout).split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  const tokens = new Map();
  for (const line of lines) {
    if (!line) continue;
    if (!/^[A-Z0-9_]+=/.test(line)) continue;
    const i = line.indexOf('=');
    const key = line.slice(0, i);
    const value = line.slice(i + 1);
    if (tokens.has(key)) throw new Error('DUP_TOKEN_' + key + '=1');
    tokens.set(key, value);
  }
  return tokens;
}

function getRequired(tokens, key) {
  if (!tokens.has(key)) throw new Error('MISSING_TOKEN_' + key + '=1');
  return tokens.get(key);
}

function parseIntStrict(s, key) {
  const n = Number(s);
  if (!Number.isInteger(n)) throw new Error('BAD_INT_' + key + '=1');
  return n;
}

function runDoctorStrict(envExtra) {
  const env = { ...process.env, CHECKS_BASELINE_VERSION: 'v1.3', EFFECTIVE_MODE: 'STRICT', ...envExtra };
  delete env.OPS_SYNTH_OVERRIDE_ENABLED;
  delete env.OPS_SYNTH_OVERRIDE_JSON;
  if (envExtra && Object.prototype.hasOwnProperty.call(envExtra, 'OPS_SYNTH_OVERRIDE_ENABLED')) {
    env.OPS_SYNTH_OVERRIDE_ENABLED = envExtra.OPS_SYNTH_OVERRIDE_ENABLED;
  }
  if (envExtra && Object.prototype.hasOwnProperty.call(envExtra, 'OPS_SYNTH_OVERRIDE_JSON')) {
    env.OPS_SYNTH_OVERRIDE_JSON = envExtra.OPS_SYNTH_OVERRIDE_JSON;
  }

  const r = spawnSync(process.execPath, ['scripts/doctor.mjs'], { env, encoding: 'utf8' });
  const stdout = String(r.stdout || '');
  const tokens = parseTokens(stdout);
  return { status: r.status ?? 1, stdout, tokens };
}

function assertStrictBaselineTokens(tokens) {
  for (const k of [
    'STRICT_LIE_CLASS_01_VIOLATIONS_COUNT',
    'STRICT_LIE_CLASS_01_VIOLATIONS',
    'STRICT_LIE_CLASS_02_VIOLATIONS_COUNT',
    'STRICT_LIE_CLASS_02_VIOLATIONS',
    'STRICT_LIE_CLASSES_OK'
  ]) {
    getRequired(tokens, k);
  }
}

test('ops strict: baseline ok', () => {
  const r = runDoctorStrict({});
  assertStrictBaselineTokens(r.tokens);

  const c1 = parseIntStrict(getRequired(r.tokens, 'STRICT_LIE_CLASS_01_VIOLATIONS_COUNT'), 'STRICT_LIE_CLASS_01_VIOLATIONS_COUNT');
  const c2 = parseIntStrict(getRequired(r.tokens, 'STRICT_LIE_CLASS_02_VIOLATIONS_COUNT'), 'STRICT_LIE_CLASS_02_VIOLATIONS_COUNT');
  assert.equal(c1, 0);
  assert.equal(c2, 0);

  const a1 = JSON.parse(getRequired(r.tokens, 'STRICT_LIE_CLASS_01_VIOLATIONS'));
  const a2 = JSON.parse(getRequired(r.tokens, 'STRICT_LIE_CLASS_02_VIOLATIONS'));
  assert.ok(Array.isArray(a1));
  assert.ok(Array.isArray(a2));
  assert.equal(a1.length, 0);
  assert.equal(a2.length, 0);

  assert.ok(r.stdout.split(/\r?\n/).includes('STRICT_LIE_CLASSES_OK=1'));
});

test('ops synth negative: lie_class_01', () => {
  const idx = JSON.parse(fs.readFileSync('docs/OPS/INVENTORY_INDEX.json', 'utf8'));
  let invPath = '';
  for (const it of idx.items || []) {
    if (!it || it.requiresDeclaredEmpty !== true) continue;
    if (typeof it.path !== 'string' || !it.path) continue;
    try {
      const j = JSON.parse(fs.readFileSync(it.path, 'utf8'));
      if (j && j.declaredEmpty === true && Array.isArray(j.items) && j.items.length === 0) {
        invPath = it.path;
        break;
      }
    } catch {}
  }
  if (!invPath) {
    // If no empty declared registry exists, the class-01 pattern is currently eliminated.
    const baseline = runDoctorStrict({});
    assertStrictBaselineTokens(baseline.tokens);
    const c = parseIntStrict(
      getRequired(baseline.tokens, 'STRICT_LIE_CLASS_01_VIOLATIONS_COUNT'),
      'STRICT_LIE_CLASS_01_VIOLATIONS_COUNT',
    );
    assert.equal(c, 0);
    return;
  }

  const override = {
    schemaVersion: 1,
    overrides: [{ path: invPath, op: 'json_delete_key', where: { key: 'declaredEmpty' } }]
  };

  const r = runDoctorStrict({
    OPS_SYNTH_OVERRIDE_ENABLED: '1',
    OPS_SYNTH_OVERRIDE_JSON: JSON.stringify(override)
  });

  assert.notEqual(r.status, 0);
  assertStrictBaselineTokens(r.tokens);

  assert.ok(r.stdout.split(/\r?\n/).includes('OPS_SYNTH_OVERRIDE_ENABLED=1'));
  assert.ok(r.stdout.split(/\r?\n/).includes('OPS_SYNTH_OVERRIDE_SCHEMA_OK=1'));
  assert.ok(r.stdout.split(/\r?\n/).includes('OPS_SYNTH_OVERRIDE_PARSE_OK=1'));
  assert.ok(r.stdout.split(/\r?\n/).includes('OPS_SYNTH_OVERRIDE_APPLY_OK=1'));

  const c = parseIntStrict(getRequired(r.tokens, 'STRICT_LIE_CLASS_01_VIOLATIONS_COUNT'), 'STRICT_LIE_CLASS_01_VIOLATIONS_COUNT');
  assert.ok(c > 0);
});

test('ops synth negative: lie_class_02', () => {
  const reg = JSON.parse(fs.readFileSync('docs/OPS/INVARIANTS_REGISTRY.json', 'utf8'));
  const enf = JSON.parse(fs.readFileSync('docs/OPS/CONTOUR-C-ENFORCEMENT.json', 'utf8'));
  const regSet = new Set((reg.items || []).map((x) => x && x.invariantId).filter(Boolean));

  let invId = '';
  let s0 = '';
  for (const it of enf.items || []) {
    if (!it || typeof it.invariantId !== 'string') continue;
    if (!regSet.has(it.invariantId)) continue;
    if (typeof it.severity === 'string' && it.severity.trim()) {
      invId = it.invariantId;
      s0 = it.severity.trim();
      break;
    }
  }
  if (!invId) throw new Error('LIE_CLASS_02_CANDIDATE_NONE=1');

  let s1 = s0 === 'HIGH' ? 'MEDIUM' : 'HIGH';
  if (s0 !== 'HIGH' && s0 !== 'MEDIUM') s1 = 'HIGH';

  const override = {
    schemaVersion: 1,
    overrides: [
      {
        path: 'docs/OPS/CONTOUR-C-ENFORCEMENT.json',
        op: 'json_set_value',
        where: { jsonPath: '$.items[?(@.invariantId=="' + invId + '")].severity' },
        toggle: [s0, s1]
      }
    ]
  };

  const r = runDoctorStrict({
    OPS_SYNTH_OVERRIDE_ENABLED: '1',
    OPS_SYNTH_OVERRIDE_JSON: JSON.stringify(override)
  });

  assert.notEqual(r.status, 0);
  assertStrictBaselineTokens(r.tokens);

  assert.ok(r.stdout.split(/\r?\n/).includes('OPS_SYNTH_OVERRIDE_ENABLED=1'));
  assert.ok(r.stdout.split(/\r?\n/).includes('OPS_SYNTH_OVERRIDE_SCHEMA_OK=1'));
  assert.ok(r.stdout.split(/\r?\n/).includes('OPS_SYNTH_OVERRIDE_PARSE_OK=1'));
  assert.ok(r.stdout.split(/\r?\n/).includes('OPS_SYNTH_OVERRIDE_APPLY_OK=1'));

  const c = parseIntStrict(getRequired(r.tokens, 'STRICT_LIE_CLASS_02_VIOLATIONS_COUNT'), 'STRICT_LIE_CLASS_02_VIOLATIONS_COUNT');
  assert.ok(c > 0);
});
