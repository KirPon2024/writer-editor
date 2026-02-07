import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const SUPPORTED_OPS_CANON_VERSION = 'v1.3';
const CONTOUR_C_P0_01_RULE_ID = 'C-P0-01-RULE-001';
const CONTOUR_C_P0_02_RULE_ID = 'C-P0-02-RULE-001';
const CONTOUR_C_WARN_TARGET_PATH = 'docs/OPS/CONTOUR_C/WARN_TARGET.v1.json';
const CONTOUR_C_P0_01_GUARD_SCRIPT = 'scripts/guards/contour-c-p0-01.mjs';
const CONTOUR_C_P0_01_TEST_PATH = 'test/unit/contour-c-p0-01-rule.test.js';
const CONTOUR_C_P0_01_POSITIVE_INVARIANTS = 'test/fixtures/contour-c-p0-01/positive/invariants.json';
const CONTOUR_C_P0_01_POSITIVE_ENFORCEMENT = 'test/fixtures/contour-c-p0-01/positive/enforcement.json';
const CONTOUR_C_P0_01_NEGATIVE_INVARIANTS = 'test/fixtures/contour-c-p0-01/negative/invariants.json';
const CONTOUR_C_P0_01_NEGATIVE_ENFORCEMENT = 'test/fixtures/contour-c-p0-01/negative/enforcement.json';
const CONTOUR_C_P0_02_GUARD_SCRIPT = 'scripts/guards/contour-c-p0-02.mjs';
const CONTOUR_C_P0_02_TEST_PATH = 'test/unit/contour-c-p0-02-rule.test.js';
const CONTOUR_C_P0_02_POLICY_PATH = 'docs/OPS/CONTOUR_C/C-P0-02-CONTRACT-POLICY.json';
const CONTOUR_C_P0_02_POSITIVE_POLICY = 'test/fixtures/contour-c-p0-02/positive/policy.json';
const CONTOUR_C_P0_02_NEGATIVE_POLICY = 'test/fixtures/contour-c-p0-02/negative/policy.json';
const CONTOUR_C_P0_03_RULE_ID = 'C-P0-03-RULE-001';
const CONTOUR_C_P0_03_GUARD_SCRIPT = 'scripts/guards/contour-c-p0-03.mjs';
const CONTOUR_C_P0_03_TEST_PATH = 'test/unit/contour-c-p0-03-rule.test.js';
const CONTOUR_C_P0_03_REQUIRED_GATES_PATH = 'docs/OPS/CONTOUR_C/README.md';
const CONTOUR_C_P0_03_WAIVED_GATES_PATH = 'docs/OPS/CONTOUR_C/WAIVED_GATES.json';
const CONTOUR_C_P0_03_POSITIVE_REQUIRED_GATES = 'test/fixtures/contour-c-p0-03/positive/existing/required-gates.md';
const CONTOUR_C_P0_03_POSITIVE_WAIVERS = 'test/fixtures/contour-c-p0-03/positive/existing/waived-gates.json';
const CONTOUR_C_P0_03_POSITIVE_WAIVED_REQUIRED_GATES = 'test/fixtures/contour-c-p0-03/positive/waived/required-gates.md';
const CONTOUR_C_P0_03_POSITIVE_WAIVED_WAIVERS = 'test/fixtures/contour-c-p0-03/positive/waived/waived-gates.json';
const CONTOUR_C_P0_03_NEGATIVE_REQUIRED_GATES = 'test/fixtures/contour-c-p0-03/negative/required-gates.md';
const CONTOUR_C_P0_03_NEGATIVE_WAIVERS = 'test/fixtures/contour-c-p0-03/negative/waived-gates.json';
const C4_PRODUCT_STEP_ID = 'SAVE_V1_MIN';
const C4_PRODUCT_STEP_GUARD_SCRIPT = 'scripts/guards/contour-c-c4-save-v1-proof.mjs';
const C4_PRODUCT_STEP_TEST_PATH = 'test/unit/contour-c-c4-save-v1-proof.test.js';
const C4_PRODUCT_STEP_DOD_PATH = 'docs/OPS/CONTOUR_C/C4_PRODUCT_STEP_SAVE_V1_MIN.md';
const CONTOUR_C_README_PATH = 'docs/OPS/CONTOUR_C/README.md';
const CONTOUR_C_CLOSE_REPORT_PATH = 'docs/OPS/CONTOUR_C/CONTOUR_C_CLOSE_REPORT.md';
const CONTOUR_C_LEDGER_PATH = 'docs/OPS/CONTOUR_C/EXIT_LEDGER.json';
const CONTOUR_C_CLOSED_MUTATION_WHITELIST = new Set([
  CONTOUR_C_README_PATH,
  CONTOUR_C_CLOSE_REPORT_PATH,
  CONTOUR_C_LEDGER_PATH,
]);

const VERSION_TOKEN_RE = /^v(\d+)\.(\d+)$/;

let OPS_SYNTH_OVERRIDE_STATE = null;

function normalizeRepoRelativePosixPath(p) {
  if (typeof p !== 'string') return null;
  if (p.length === 0) return null;
  if (p.startsWith('/')) return null;
  if (p.includes('\\')) return null;
  if (p.split('/').includes('..')) return null;
  return p;
}

function listUnknownKeys(obj, allowedKeys) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const allowed = new Set(allowedKeys);
  const unknown = Object.keys(obj).filter((k) => !allowed.has(k));
  return unknown;
}

function parseOpsSynthOverrideJson(raw) {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return {
      parseOk: 0,
      schemaOk: 0,
      err: 'JSON_MISSING',
      schemaErr: 'JSON_MISSING',
      overrides: [],
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      parseOk: 0,
      schemaOk: 0,
      err: 'JSON_PARSE_FAILED',
      schemaErr: 'JSON_PARSE_FAILED',
      overrides: [],
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      parseOk: 1,
      schemaOk: 0,
      err: 'TOP_LEVEL_NOT_OBJECT',
      schemaErr: 'TOP_LEVEL_NOT_OBJECT',
      overrides: [],
    };
  }

  const unknownTop = listUnknownKeys(parsed, ['schemaVersion', 'overrides']);
  if (unknownTop && unknownTop.length > 0) {
    return {
      parseOk: 1,
      schemaOk: 0,
      err: 'UNKNOWN_TOP_LEVEL_KEY',
      schemaErr: 'UNKNOWN_TOP_LEVEL_KEY',
      overrides: [],
    };
  }

  if (!Object.prototype.hasOwnProperty.call(parsed, 'schemaVersion')) {
    return {
      parseOk: 1,
      schemaOk: 0,
      err: 'SCHEMA_VERSION_MISSING',
      schemaErr: 'SCHEMA_VERSION_MISSING',
      overrides: [],
    };
  }
  if (!Number.isInteger(parsed.schemaVersion) || parsed.schemaVersion !== 1) {
    return {
      parseOk: 1,
      schemaOk: 0,
      err: 'SCHEMA_VERSION_INVALID',
      schemaErr: 'SCHEMA_VERSION_INVALID',
      overrides: [],
    };
  }

  if (!Object.prototype.hasOwnProperty.call(parsed, 'overrides')) {
    return {
      parseOk: 1,
      schemaOk: 0,
      err: 'OVERRIDES_MISSING',
      schemaErr: 'OVERRIDES_MISSING',
      overrides: [],
    };
  }
  if (!Array.isArray(parsed.overrides)) {
    return {
      parseOk: 1,
      schemaOk: 0,
      err: 'OVERRIDES_NOT_ARRAY',
      schemaErr: 'OVERRIDES_NOT_ARRAY',
      overrides: [],
    };
  }

  const overrides = [];
  for (const it of parsed.overrides) {
    if (!it || typeof it !== 'object' || Array.isArray(it)) {
      return {
        parseOk: 1,
        schemaOk: 0,
        err: 'OVERRIDE_ITEM_NOT_OBJECT',
        schemaErr: 'OVERRIDE_ITEM_NOT_OBJECT',
        overrides: [],
      };
    }
    const unknownItem = listUnknownKeys(it, ['path', 'op', 'where', 'value', 'toggle']);
    if (unknownItem && unknownItem.length > 0) {
      return {
        parseOk: 1,
        schemaOk: 0,
        err: 'UNKNOWN_OVERRIDE_KEY',
        schemaErr: 'UNKNOWN_OVERRIDE_KEY',
        overrides: [],
      };
    }
    const path = normalizeRepoRelativePosixPath(it.path);
    if (!path) {
      return {
        parseOk: 1,
        schemaOk: 0,
        err: 'OVERRIDE_PATH_INVALID',
        schemaErr: 'OVERRIDE_PATH_INVALID',
        overrides: [],
      };
    }
    if (typeof it.op !== 'string' || it.op.trim().length === 0) {
      return {
        parseOk: 1,
        schemaOk: 0,
        err: 'OVERRIDE_OP_MISSING',
        schemaErr: 'OVERRIDE_OP_MISSING',
        overrides: [],
      };
    }
    if (!it.where || typeof it.where !== 'object' || Array.isArray(it.where)) {
      return {
        parseOk: 1,
        schemaOk: 0,
        err: 'OVERRIDE_WHERE_INVALID',
        schemaErr: 'OVERRIDE_WHERE_INVALID',
        overrides: [],
      };
    }

    if (it.op === 'json_delete_key') {
      const unknownWhere = listUnknownKeys(it.where, ['key']);
      if (unknownWhere && unknownWhere.length > 0) {
        return {
          parseOk: 1,
          schemaOk: 0,
          err: 'UNKNOWN_WHERE_KEY',
          schemaErr: 'UNKNOWN_WHERE_KEY',
          overrides: [],
        };
      }
      if (typeof it.where.key !== 'string' || it.where.key.trim().length === 0) {
        return {
          parseOk: 1,
          schemaOk: 0,
          err: 'DELETE_KEY_MISSING',
          schemaErr: 'DELETE_KEY_MISSING',
          overrides: [],
        };
      }
      if (Object.prototype.hasOwnProperty.call(it, 'value') || Object.prototype.hasOwnProperty.call(it, 'toggle')) {
        return {
          parseOk: 1,
          schemaOk: 0,
          err: 'DELETE_OP_EXTRA_FIELDS',
          schemaErr: 'DELETE_OP_EXTRA_FIELDS',
          overrides: [],
        };
      }
    }

    if (it.op === 'json_set_value') {
      const unknownWhere = listUnknownKeys(it.where, ['jsonPath']);
      if (unknownWhere && unknownWhere.length > 0) {
        return {
          parseOk: 1,
          schemaOk: 0,
          err: 'UNKNOWN_WHERE_KEY',
          schemaErr: 'UNKNOWN_WHERE_KEY',
          overrides: [],
        };
      }
      if (typeof it.where.jsonPath !== 'string' || it.where.jsonPath.trim().length === 0) {
        return {
          parseOk: 1,
          schemaOk: 0,
          err: 'JSONPATH_MISSING',
          schemaErr: 'JSONPATH_MISSING',
          overrides: [],
        };
      }

      const valueProvided = Object.prototype.hasOwnProperty.call(it, 'value');
      const toggleProvided = Object.prototype.hasOwnProperty.call(it, 'toggle');
      if ((valueProvided && toggleProvided) || (!valueProvided && !toggleProvided)) {
        return {
          parseOk: 1,
          schemaOk: 0,
          err: 'SET_VALUE_AMBIGUOUS',
          schemaErr: 'SET_VALUE_AMBIGUOUS',
          overrides: [],
        };
      }
      if (toggleProvided) {
        if (!Array.isArray(it.toggle) || it.toggle.length !== 2) {
          return {
            parseOk: 1,
            schemaOk: 0,
            err: 'TOGGLE_INVALID',
            schemaErr: 'TOGGLE_INVALID',
            overrides: [],
          };
        }
        const [a, b] = it.toggle;
        if (typeof a !== 'string' || typeof b !== 'string') {
          return {
            parseOk: 1,
            schemaOk: 0,
            err: 'TOGGLE_INVALID',
            schemaErr: 'TOGGLE_INVALID',
            overrides: [],
          };
        }
        if (a === b) {
          return {
            parseOk: 1,
            schemaOk: 0,
            err: 'TOGGLE_INVALID',
            schemaErr: 'TOGGLE_INVALID',
            overrides: [],
          };
        }
      }
    }

    overrides.push({
      path,
      op: it.op,
      where: it.where,
      valueProvided: Object.prototype.hasOwnProperty.call(it, 'value'),
      value: it.value,
      toggleProvided: Object.prototype.hasOwnProperty.call(it, 'toggle'),
      toggle: it.toggle,
    });
  }

  return {
    parseOk: 1,
    schemaOk: 1,
    err: '',
    schemaErr: '',
    overrides,
  };
}

function applySynthOverrideOperation({ filePath, jsonValue, override }) {
  if (!jsonValue || typeof jsonValue !== 'object' || Array.isArray(jsonValue)) {
    return { ok: 0, err: 'NOT_JSON_OBJECT' };
  }

  if (override.op === 'json_delete_key') {
    const key = override.where && typeof override.where.key === 'string' ? override.where.key : null;
    if (!key) return { ok: 0, err: 'WHERE_INVALID' };
    if (!(key in jsonValue)) return { ok: 1, applied: 1 };
    // eslint-disable-next-line no-param-reassign
    delete jsonValue[key];
    return { ok: 1, applied: 1 };
  }

  if (override.op === 'json_set_value') {
    const jsonPath = override.where && typeof override.where.jsonPath === 'string' ? override.where.jsonPath : null;
    if (!jsonPath) return { ok: 0, err: 'WHERE_INVALID' };

    const m = jsonPath.match(/^\$\.items\[\?\(@\.invariantId==(?:'([^']+)'|"([^"]+)")\)\]\.severity$/);
    if (!m) return { ok: 0, err: 'WHERE_INVALID' };
    const invariantId = m[1] || m[2];
    if (typeof invariantId !== 'string' || invariantId.length === 0) return { ok: 0, err: 'WHERE_INVALID' };

    if (!Array.isArray(jsonValue.items)) return { ok: 0, err: 'NOT_JSON_OBJECT' };

    const matches = [];
    for (let i = 0; i < jsonValue.items.length; i += 1) {
      const it = jsonValue.items[i];
      if (!it || typeof it !== 'object' || Array.isArray(it)) continue;
      if (it.invariantId !== invariantId) continue;
      matches.push(i);
    }

    if (matches.length !== 1) return { ok: 0, err: 'MATCH_COUNT_INVALID', matchErr: 'MATCH_COUNT_INVALID' };

    const it = jsonValue.items[matches[0]];
    if (!it || typeof it !== 'object' || Array.isArray(it)) return { ok: 0, err: 'MATCH_COUNT_INVALID', matchErr: 'MATCH_COUNT_INVALID' };

    if (override.toggleProvided) {
      const [a, b] = override.toggle;
      const cur = typeof it.severity === 'string' ? it.severity : '';
      if (cur !== a && cur !== b) return { ok: 0, err: 'TOGGLE_NOT_APPLICABLE', matchErr: 'TOGGLE_NOT_APPLICABLE' };
      // eslint-disable-next-line no-param-reassign
      it.severity = cur === a ? b : a;
      return { ok: 1, applied: 1 };
    }

    if (override.valueProvided) {
      // eslint-disable-next-line no-param-reassign
      it.severity = override.value;
      return { ok: 1, applied: 1 };
    }

    return { ok: 0, err: 'APPLY_FAILED' };
  }

  return { ok: 0, err: 'UNSUPPORTED_OP', opErr: 'UNSUPPORTED_OP' };
}

function initSynthOverrideState() {
  const enabled = process.env.OPS_SYNTH_OVERRIDE_ENABLED === '1';
  const raw = process.env.OPS_SYNTH_OVERRIDE_JSON;
  const hasJson = typeof raw === 'string' && raw.trim().length > 0;

  if (!enabled) {
    console.log('OPS_SYNTH_OVERRIDE_ENABLED=0');
    if (hasJson) console.log('OPS_SYNTH_OVERRIDE_IGNORED=1');
    return { enabled: false };
  }

  let parseOk = 1;
  let schemaOk = 1;
  let scopeOk = 1;
  let applyOk = 1;
  let err = '';
  let pathErr = '';
  let opErr = '';
  let matchErr = '';

  const parsed = parseOpsSynthOverrideJson(raw);
  parseOk = parsed.parseOk;
  schemaOk = parsed.schemaOk;
  err = parsed.err || '';

  const overrides = Array.isArray(parsed.overrides) ? parsed.overrides : [];
  if (parseOk !== 1 || schemaOk !== 1) {
    scopeOk = 0;
    applyOk = 0;
  } else {
    for (const ov of overrides) {
      const p = normalizeRepoRelativePosixPath(ov.path);
      if (!p) {
        scopeOk = 0;
        pathErr = 'PATH_INVALID';
        err = err || 'PATH_INVALID';
        break;
      }
      if (!(p === 'scripts/doctor.mjs' || p.startsWith('docs/OPS/'))) {
        scopeOk = 0;
        pathErr = 'PATH_OUT_OF_SCOPE';
        err = err || 'PATH_OUT_OF_SCOPE';
        break;
      }
    }
  }

  const jsonByPath = new Map();
  if (parseOk === 1 && schemaOk === 1 && scopeOk === 1) {
    const overridesByPath = new Map();
    for (const ov of overrides) {
      if (!overridesByPath.has(ov.path)) overridesByPath.set(ov.path, []);
      overridesByPath.get(ov.path).push(ov);
    }

    for (const filePath of [...overridesByPath.keys()].sort()) {
      const list = overridesByPath.get(filePath) || [];
      let text;
      try {
        text = fs.readFileSync(filePath, 'utf8');
      } catch {
        applyOk = 0;
        err = 'PATH_READ_FAILED';
        pathErr = pathErr || 'PATH_READ_FAILED';
        break;
      }

      let jsonValue;
      try {
        jsonValue = JSON.parse(text);
      } catch {
        applyOk = 0;
        err = 'NOT_JSON_OBJECT';
        break;
      }

      if (!jsonValue || typeof jsonValue !== 'object' || Array.isArray(jsonValue)) {
        applyOk = 0;
        err = 'NOT_JSON_OBJECT';
        break;
      }

      for (const override of list) {
        const r = applySynthOverrideOperation({ filePath, jsonValue, override });
        if (r.ok !== 1) {
          applyOk = 0;
          err = r.err || 'APPLY_FAILED';
          if (r.opErr) opErr = r.opErr;
          if (r.matchErr) matchErr = r.matchErr;
          break;
        }
      }
      if (applyOk !== 1) break;
      jsonByPath.set(filePath, jsonValue);
    }
  } else if (parseOk !== 1 || schemaOk !== 1 || scopeOk !== 1) {
    applyOk = 0;
  }

  console.log('OPS_SYNTH_OVERRIDE_ENABLED=1');
  console.log(`OPS_SYNTH_OVERRIDE_PARSE_OK=${parseOk}`);
  console.log(`OPS_SYNTH_OVERRIDE_SCHEMA_OK=${schemaOk}`);
  console.log(`OPS_SYNTH_OVERRIDE_SCOPE_OK=${scopeOk}`);
  console.log(`OPS_SYNTH_OVERRIDE_APPLY_OK=${applyOk}`);
  console.log(`OPS_SYNTH_OVERRIDE_ERR=${err}`);
  console.log(`OPS_SYNTH_OVERRIDE_PATH_ERR=${pathErr}`);
  console.log(`OPS_SYNTH_OVERRIDE_OP_ERR=${opErr}`);
  console.log(`OPS_SYNTH_OVERRIDE_MATCH_ERR=${matchErr}`);

  if (parseOk !== 1 || schemaOk !== 1 || scopeOk !== 1 || applyOk !== 1) {
    return { enabled: true, parseOk, schemaOk, scopeOk, applyOk };
  }

  const state = { enabled: true, jsonByPath };
  OPS_SYNTH_OVERRIDE_STATE = state;
  return { enabled: true, parseOk, schemaOk, scopeOk, applyOk };
}

function parseVersionToken(token, errorFile, errorReason) {
  if (typeof token !== 'string') {
    die('ERR_DOCTOR_INVALID_SHAPE', errorFile, errorReason);
  }
  const m = token.match(VERSION_TOKEN_RE);
  if (!m) {
    die('ERR_DOCTOR_INVALID_SHAPE', errorFile, errorReason);
  }
  return { major: Number(m[1]), minor: Number(m[2]), token };
}

function compareVersion(a, b) {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  return 0;
}

function resolveTargetBaselineVersion() {
  const envToken = process.env.CHECKS_BASELINE_VERSION;
  if (typeof envToken === 'string' && envToken.length > 0) {
    const valid = VERSION_TOKEN_RE.test(envToken);
    if (valid) return { targetBaselineVersion: envToken, invalidEnvToken: null };

    const registryPath = 'docs/OPS/INVARIANTS_REGISTRY.json';
    const registryRaw = readJson(registryPath);
    if (!registryRaw || typeof registryRaw !== 'object' || Array.isArray(registryRaw)) {
      die('ERR_DOCTOR_INVALID_SHAPE', registryPath, 'top_level_must_be_object');
    }
    return { targetBaselineVersion: registryRaw.opsCanonVersion, invalidEnvToken: envToken };
  }

  const registryPath = 'docs/OPS/INVARIANTS_REGISTRY.json';
  const registryRaw = readJson(registryPath);
  if (!registryRaw || typeof registryRaw !== 'object' || Array.isArray(registryRaw)) {
    die('ERR_DOCTOR_INVALID_SHAPE', registryPath, 'top_level_must_be_object');
  }
  return { targetBaselineVersion: registryRaw.opsCanonVersion, invalidEnvToken: null };
}

function applyIntroducedInGating(registryItems, targetParsed) {
  const applicableItems = [];
  const ignoredInvariantIds = [];

  for (const it of registryItems) {
    const invariantId = it && typeof it === 'object' ? it.invariantId : '(unknown)';
    const introducedIn = it && typeof it === 'object' ? it.introducedIn : undefined;

    if (typeof introducedIn !== 'string' || !VERSION_TOKEN_RE.test(introducedIn)) {
      console.error(`INVALID_INTRODUCED_IN: invariantId=${invariantId} introducedIn=${String(introducedIn)}`);
      die('ERR_DOCTOR_INVALID_SHAPE', 'docs/OPS/INVARIANTS_REGISTRY.json', 'introducedIn_invalid_version_token');
    }

    const introParsed = parseVersionToken(
      introducedIn,
      'docs/OPS/INVARIANTS_REGISTRY.json',
      'introducedIn_invalid_version_token',
    );

    const applicable = compareVersion(introParsed, targetParsed) <= 0;
    if (applicable) {
      applicableItems.push(it);
    } else {
      ignoredInvariantIds.push(invariantId);
    }
  }

  ignoredInvariantIds.sort();
  console.log(`IGNORED_INVARIANTS=${JSON.stringify(ignoredInvariantIds)}`);
  console.log(`IGNORED_INVARIANTS_COUNT=${ignoredInvariantIds.length}`);

  return { applicableItems, ignoredInvariantIds };
}

const REQUIRED_FILES = [
  'docs/OPS/AUDIT-MATRIX-v1.1.md',
  'docs/OPS/AUDIT_CHECKS.json',
  'docs/OPS/DEBT_REGISTRY.json',
  'docs/OPS/INVARIANTS_REGISTRY.json',
  'docs/OPS/QUEUE_POLICIES.json',
  'docs/OPS/CAPABILITIES_MATRIX.json',
  'docs/OPS/PUBLIC_SURFACE.json',
  'docs/OPS/DOMAIN_EVENTS_BASELINE.json',
  'docs/OPS/TEXT_SNAPSHOT_SPEC.json',
  'docs/OPS/EFFECT_KINDS.json',
  'docs/OPS/ONDISK_ARTIFACTS.json',
];

function die(code, file, reason) {
  const error = new Error(reason);
  error.code = code;
  error.file = file;
  error.reason = reason;
  throw error;
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    die('ERR_DOCTOR_MISSING_FILE', filePath, 'read_failed');
  }
}

function readJson(filePath) {
  if (OPS_SYNTH_OVERRIDE_STATE && OPS_SYNTH_OVERRIDE_STATE.enabled && OPS_SYNTH_OVERRIDE_STATE.jsonByPath.has(filePath)) {
    return OPS_SYNTH_OVERRIDE_STATE.jsonByPath.get(filePath);
  }
  const text = readText(filePath);
  try {
    return JSON.parse(text);
  } catch {
    die('ERR_DOCTOR_INVALID_SHAPE', filePath, 'json_parse_failed');
  }
}

function parseKvOutput(text) {
  const out = new Map();
  const lines = typeof text === 'string' ? text.split(/\r?\n/) : [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx);
    const value = line.slice(idx + 1);
    if (!out.has(key)) out.set(key, value);
  }
  return out;
}

function loadContourCWarnTargetConfig() {
  const parsed = readJson(CONTOUR_C_WARN_TARGET_PATH);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    die('ERR_DOCTOR_INVALID_SHAPE', CONTOUR_C_WARN_TARGET_PATH, 'warn_target_top_level_invalid');
  }
  if (parsed.schemaVersion !== 1) {
    die('ERR_DOCTOR_INVALID_SHAPE', CONTOUR_C_WARN_TARGET_PATH, 'warn_target_schema_version_invalid');
  }
  const warnTargetSetVersion = typeof parsed.warnTargetSetVersion === 'string' && parsed.warnTargetSetVersion.length > 0 ? parsed.warnTargetSetVersion : 'v1';
  const baselineSha = typeof parsed.baselineSha === 'string' && parsed.baselineSha.length > 0 && parsed.baselineSha !== '-' ? parsed.baselineSha : '';
  if (!baselineSha) {
    die('ERR_DOCTOR_INVALID_SHAPE', CONTOUR_C_WARN_TARGET_PATH, 'warn_target_baseline_sha_missing');
  }
  const baselineWarnCount = Number.isInteger(parsed.baselineWarnCount) ? parsed.baselineWarnCount : null;
  if (baselineWarnCount === null || baselineWarnCount < 0) {
    die('ERR_DOCTOR_INVALID_SHAPE', CONTOUR_C_WARN_TARGET_PATH, 'warn_target_baseline_warn_count_invalid');
  }
  const targetWarnIds = Array.isArray(parsed.targetWarnIds) ? parsed.targetWarnIds.filter((x) => typeof x === 'string' && x.length > 0) : [];
  if (targetWarnIds.length === 0) {
    die('ERR_DOCTOR_INVALID_SHAPE', CONTOUR_C_WARN_TARGET_PATH, 'warn_target_ids_empty');
  }
  return {
    warnTargetSetVersion,
    baselineSha,
    baselineWarnCount,
    targetWarnIds: [...new Set(targetWarnIds)].sort(),
  };
}

function assertObjectShape(filePath, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    die('ERR_DOCTOR_INVALID_SHAPE', filePath, 'top_level_must_be_object');
  }
  if (typeof value.schemaVersion !== 'number') {
    die('ERR_DOCTOR_INVALID_SHAPE', filePath, 'schemaVersion_must_be_number');
  }
  if (!Array.isArray(value.items)) {
    die('ERR_DOCTOR_INVALID_SHAPE', filePath, 'items_must_be_array');
  }
}

function assertItemsAreObjects(filePath, items) {
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      die('ERR_DOCTOR_INVALID_SHAPE', filePath, `item_${i}_must_be_object`);
    }
  }
}

function assertRequiredKeys(filePath, items, keys) {
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    for (const key of keys) {
      if (!(key in item)) {
        die('ERR_DOCTOR_INVALID_SHAPE', filePath, `item_${i}_missing_${key}`);
      }
    }
  }
}

function assertOpsCanonVersion(filePath, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    die('ERR_DOCTOR_INVALID_SHAPE', filePath, 'top_level_must_be_object');
  }
  if (value.opsCanonVersion !== SUPPORTED_OPS_CANON_VERSION) {
    die('ERR_DOCTOR_INVALID_SHAPE', filePath, 'opsCanonVersion_mismatch');
  }
}

function parseMatrixModeBlock(auditText) {
  const start = '<!-- OPS:MATRIX-MODE -->';
  const end = '<!-- /OPS:MATRIX-MODE -->';

  const startIdx = auditText.indexOf(start);
  const endIdx = auditText.indexOf(end);

  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    die('ERR_MATRIX_MODE_INVALID', 'docs/OPS/AUDIT-MATRIX-v1.1.md', 'missing_block');
  }

  if (auditText.indexOf(start, startIdx + 1) !== -1 || auditText.indexOf(end, endIdx + 1) !== -1) {
    die('ERR_MATRIX_MODE_INVALID', 'docs/OPS/AUDIT-MATRIX-v1.1.md', 'block_not_unique');
  }

  const body = auditText.slice(startIdx + start.length, endIdx);
  const lines = body.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim() !== '');

  let mode = null;
  const enforcement = {};
  let inEnforcement = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('mode:')) {
      if (mode !== null) die('ERR_MATRIX_MODE_INVALID', 'docs/OPS/AUDIT-MATRIX-v1.1.md', 'duplicate_mode');
      const value = trimmed.slice('mode:'.length).trim();
      mode = value || null;
      inEnforcement = false;
      continue;
    }

    if (trimmed === 'enforcement:') {
      inEnforcement = true;
      continue;
    }

    if (inEnforcement) {
      const m = trimmed.match(/^(P0|P1|P2):\s*(off|soft|hard)$/);
      if (!m) die('ERR_MATRIX_MODE_INVALID', 'docs/OPS/AUDIT-MATRIX-v1.1.md', 'bad_enforcement_line');
      const key = m[1];
      const value = m[2];
      if (key in enforcement) die('ERR_MATRIX_MODE_INVALID', 'docs/OPS/AUDIT-MATRIX-v1.1.md', 'duplicate_enforcement_key');
      enforcement[key] = value;
      continue;
    }

    die('ERR_MATRIX_MODE_INVALID', 'docs/OPS/AUDIT-MATRIX-v1.1.md', 'unrecognized_line');
  }

  if (mode !== 'TRANSITIONAL' && mode !== 'STRICT') {
    die('ERR_MATRIX_MODE_INVALID', 'docs/OPS/AUDIT-MATRIX-v1.1.md', 'mode_invalid');
  }

  for (const key of ['P0', 'P1', 'P2']) {
    if (!(key in enforcement)) {
      die('ERR_MATRIX_MODE_INVALID', 'docs/OPS/AUDIT-MATRIX-v1.1.md', `missing_enforcement_${key}`);
    }
  }

  return { mode, enforcement };
}

function utcTodayStartMs() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function isTtlActive(ttlUntil) {
  if (typeof ttlUntil !== 'string' || ttlUntil.length === 0) return false;
  const parsed = Date.parse(ttlUntil);
  if (Number.isNaN(parsed)) return false;
  return parsed >= utcTodayStartMs();
}

function checkDebtTtl(debtRegistry, mode) {
  if (debtRegistry.declaredEmpty === true && debtRegistry.items.length > 0) {
    return { status: mode === 'STRICT' ? 'DEBT_TTL_FAIL' : 'DEBT_TTL_WARN', level: mode === 'STRICT' ? 'fail' : 'warn' };
  }

  if (debtRegistry.items.length === 0) {
    return { status: 'DEBT_TTL_OK', level: 'ok' };
  }

  const todayStart = utcTodayStartMs();

  for (let i = 0; i < debtRegistry.items.length; i += 1) {
    const ttlUntil = debtRegistry.items[i].ttlUntil;
    if (typeof ttlUntil !== 'string' || ttlUntil.length === 0) {
      return { status: mode === 'STRICT' ? 'DEBT_TTL_FAIL' : 'DEBT_TTL_WARN', level: mode === 'STRICT' ? 'fail' : 'warn' };
    }
    const parsed = Date.parse(ttlUntil);
    if (Number.isNaN(parsed)) {
      return { status: mode === 'STRICT' ? 'DEBT_TTL_FAIL' : 'DEBT_TTL_WARN', level: mode === 'STRICT' ? 'fail' : 'warn' };
    }
    if (parsed < todayStart) {
      return { status: mode === 'STRICT' ? 'DEBT_TTL_FAIL' : 'DEBT_TTL_WARN', level: mode === 'STRICT' ? 'fail' : 'warn' };
    }
  }

  return { status: 'DEBT_TTL_OK', level: 'ok' };
}

function hasAnyActiveDebt(debtRegistry) {
  if (debtRegistry.declaredEmpty === true) return false;

  for (let i = 0; i < debtRegistry.items.length; i += 1) {
    const item = debtRegistry.items[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    if (item.active !== true) continue;
    if (isTtlActive(item.ttlUntil)) return true;
  }
  return false;
}

function hasMatchingActiveDebt(debtRegistry, artifactPathNeedle) {
  if (debtRegistry.declaredEmpty === true) return false;

  for (let i = 0; i < debtRegistry.items.length; i += 1) {
    const item = debtRegistry.items[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    if (item.active !== true) continue;
    if (!isTtlActive(item.ttlUntil)) continue;

    const paths = item.artifactPaths;
    if (!Array.isArray(paths)) continue;
    for (const p of paths) {
      if (p === artifactPathNeedle) return true;
    }
  }

  return false;
}

function parseDebtRegistry(filePath) {
  const debt = readJson(filePath);
  if (!debt || typeof debt !== 'object' || Array.isArray(debt)) {
    die('ERR_DOCTOR_INVALID_SHAPE', filePath, 'top_level_must_be_object');
  }
  if (debt.schemaVersion !== 2) {
    die('ERR_DOCTOR_INVALID_SHAPE', filePath, 'schemaVersion_must_be_2');
  }
  assertOpsCanonVersion(filePath, debt);
  if (!Array.isArray(debt.items)) {
    die('ERR_DOCTOR_INVALID_SHAPE', filePath, 'items_must_be_array');
  }
  if ('declaredEmpty' in debt && debt.declaredEmpty !== true && debt.declaredEmpty !== false) {
    die('ERR_DOCTOR_INVALID_SHAPE', filePath, 'declaredEmpty_must_be_boolean');
  }

  assertItemsAreObjects(filePath, debt.items);
  if (debt.items.length > 0) {
    assertRequiredKeys(filePath, debt.items, [
      'debtId',
      'active',
      'owner',
      'ttlUntil',
      'exitCriteria',
      'invariantIds',
      'artifactPaths',
    ]);
  }

  return {
    declaredEmpty: debt.declaredEmpty === true,
    items: debt.items,
  };
}

function parseAuditChecks(filePath) {
  const audit = readJson(filePath);
  if (!audit || typeof audit !== 'object' || Array.isArray(audit)) {
    die('ERR_DOCTOR_INVALID_SHAPE', filePath, 'top_level_must_be_object');
  }
  if (audit.schemaVersion !== 1) {
    die('ERR_DOCTOR_INVALID_SHAPE', filePath, 'schemaVersion_must_be_1');
  }
  assertOpsCanonVersion(filePath, audit);
  if (!Array.isArray(audit.checkIds)) {
    die('ERR_DOCTOR_INVALID_SHAPE', filePath, 'checkIds_must_be_array');
  }
  const set = new Set();
  for (let i = 0; i < audit.checkIds.length; i += 1) {
    const v = audit.checkIds[i];
    if (typeof v !== 'string' || v.length === 0) {
      die('ERR_DOCTOR_INVALID_SHAPE', filePath, `checkIds_${i}_must_be_string`);
    }
    set.add(v);
  }
  return set;
}

function parseInvariantsRegistry(filePath) {
  const reg = readJson(filePath);
  if (!reg || typeof reg !== 'object' || Array.isArray(reg)) {
    die('ERR_DOCTOR_INVALID_SHAPE', filePath, 'top_level_must_be_object');
  }
  if (reg.schemaVersion !== 1) {
    die('ERR_DOCTOR_INVALID_SHAPE', filePath, 'schemaVersion_must_be_1');
  }
  assertOpsCanonVersion(filePath, reg);
  if (!Array.isArray(reg.items)) {
    die('ERR_DOCTOR_INVALID_SHAPE', filePath, 'items_must_be_array');
  }
  assertItemsAreObjects(filePath, reg.items);
  if (reg.items.length > 0) {
    assertRequiredKeys(filePath, reg.items, [
      'invariantId',
      'contour',
      'severity',
      'enforcementMode',
      'maturity',
      'checkId',
      'introducedIn',
      'description',
    ]);
  }
  return reg.items;
}

function parseInventoryIndex(filePath) {
  const idx = readJson(filePath);
  if (!idx || typeof idx !== 'object' || Array.isArray(idx)) {
    die('ERR_DOCTOR_INVALID_SHAPE', filePath, 'top_level_must_be_object');
  }
  if (idx.schemaVersion !== 1) {
    die('ERR_DOCTOR_INVALID_SHAPE', filePath, 'schemaVersion_must_be_1');
  }
  assertOpsCanonVersion(filePath, idx);
  if (!Array.isArray(idx.items)) {
    die('ERR_DOCTOR_INVALID_SHAPE', filePath, 'items_must_be_array');
  }
  assertItemsAreObjects(filePath, idx.items);
  if (idx.items.length > 0) {
    assertRequiredKeys(filePath, idx.items, [
      'inventoryId',
      'path',
      'introducedIn',
      'allowEmpty',
      'requiresDeclaredEmpty',
    ]);
  }
  return idx.items;
}

function computeIdListDiagnostics(ids) {
  const raw = Array.isArray(ids) ? ids.map((v) => (typeof v === 'string' ? v : String(v))) : [];
  const sorted = [...raw].sort();
  const sortedOk = raw.length === sorted.length && raw.every((v, i) => v === sorted[i]);

  const counts = new Map();
  for (const id of raw) {
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  const dupes = [...counts.values()].some((n) => n > 1);
  const dupIds = [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id);

  const violationsSet = new Set();
  if (!sortedOk) {
    for (const id of raw) violationsSet.add(id);
  }
  if (dupes) {
    for (const id of dupIds) violationsSet.add(id);
  }

  const violations = [...violationsSet].sort();
  return {
    sortedOk,
    dupes,
    violations,
  };
}

function checkInventoryEmptiness(inventoryIndexItems, debtRegistry) {
  const violations = [];

  for (let i = 0; i < inventoryIndexItems.length; i += 1) {
    const idx = inventoryIndexItems[i];
    const inventoryId = typeof idx.inventoryId === 'string' && idx.inventoryId.length > 0 ? idx.inventoryId : 'unknown';
    const inventoryPath = typeof idx.path === 'string' && idx.path.length > 0 ? idx.path : 'unknown';

    if (!fs.existsSync(inventoryPath)) {
      console.error(`INVENTORY_PATH_MISSING: ${inventoryPath}`);
      violations.push(`${inventoryId}:path_missing`);
      continue;
    }

    let inv;
    try {
      inv = JSON.parse(readText(inventoryPath));
    } catch {
      violations.push(`${inventoryId}:json_parse_failed`);
      continue;
    }

    if (!inv || typeof inv !== 'object' || Array.isArray(inv)) {
      violations.push(`${inventoryId}:top_level_must_be_object`);
      continue;
    }

    const items = inv.items;
    if (!Array.isArray(items)) {
      violations.push(`${inventoryId}:items_must_be_array`);
      continue;
    }

    if ('declaredEmpty' in inv && typeof inv.declaredEmpty !== 'boolean') {
      violations.push(`${inventoryId}:declaredEmpty_must_be_boolean`);
      continue;
    }

    if (inv.declaredEmpty === true && items.length > 0) {
      violations.push(`${inventoryId}:declaredEmpty_true_with_non_empty_items`);
      continue;
    }

    const allowEmpty = idx.allowEmpty === true;
    const requiresDeclaredEmpty = idx.requiresDeclaredEmpty === true;
    const hasDeclaredEmptyKey = 'declaredEmpty' in inv;

    if (inventoryPath === 'docs/OPS/DEBT_REGISTRY.json') {
      if (items.length === 0 && inv.declaredEmpty !== true) {
        violations.push(`${inventoryId}:debt_registry_empty_requires_declaredEmpty_true`);
      }
      continue;
    }

    if (allowEmpty === false) {
      if (items.length === 0) {
        violations.push(`${inventoryId}:empty_items_not_allowed`);
      }
      if (hasDeclaredEmptyKey) {
        violations.push(`${inventoryId}:declaredEmpty_forbidden`);
      }
      continue;
    }

    if (requiresDeclaredEmpty === false) {
      if (hasDeclaredEmptyKey) {
        violations.push(`${inventoryId}:declaredEmpty_forbidden`);
      }
      continue;
    }

    if (hasDeclaredEmptyKey && items.length === 0 && inv.declaredEmpty === true) {
      const hasDebt = hasMatchingActiveDebt(debtRegistry, inventoryPath);
      if (!hasDebt) {
        violations.push(`${inventoryId}:declared_empty_requires_matching_debt`);
      }
    }
  }

  violations.sort();
  console.log(`INVENTORY_INDEX_MANAGED_COUNT=${inventoryIndexItems.length}`);
  console.log(`INVENTORY_EMPTY_VIOLATIONS_COUNT=${violations.length}`);
  console.log(`INVENTORY_EMPTY_VIOLATIONS=${JSON.stringify(violations)}`);

  return { violations };
}

function checkRuntimeSignalsInventory() {
  const filePath = 'docs/OPS/RUNTIME_SIGNALS.json';
  const violations = [];

  let parsed;
  try {
    parsed = JSON.parse(readText(filePath));
  } catch {
    parsed = null;
    violations.push('json_parse_failed');
  }

  const items = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed.items : null;
  if (!Array.isArray(items)) {
    violations.push('items_must_be_array');
  }

  let sinkPath = '';
  let sinkExists = '0';
  let sinkKind = 'missing';
  let sinkError = '';

  if (Array.isArray(items)) {
    const sink = items.find((it) => it && typeof it === 'object' && !Array.isArray(it) && it.signalId === 'C_TRACE_SINK_LOCATOR');
    const evidencePath = sink && typeof sink.evidencePath === 'string' ? sink.evidencePath : '';
    sinkPath = evidencePath;

    if (typeof evidencePath !== 'string' || evidencePath.length === 0) {
      sinkError = 'missing C_TRACE_SINK_LOCATOR in RUNTIME_SIGNALS';
    } else if (!fs.existsSync(evidencePath)) {
      sinkError = 'trace sink locator path missing';
    } else {
      try {
        const st = fs.statSync(evidencePath);
        sinkExists = '1';
        sinkKind = st.isDirectory() ? 'dir' : (st.isFile() ? 'file' : 'missing');
        sinkError = sinkKind === 'missing' ? 'trace sink locator path has unsupported kind' : '';
        if (sinkError.length > 0) {
          sinkExists = '0';
          sinkKind = 'missing';
        }
      } catch {
        sinkError = 'trace sink locator stat failed';
      }
    }
  } else {
    sinkError = 'runtime signals items missing';
  }

  console.log(`C_TRACE_SINK_LOCATOR_PATH=${sinkPath}`);
  console.log(`C_TRACE_SINK_LOCATOR_PATH_EXISTS=${sinkExists}`);
  console.log(`C_TRACE_SINK_LOCATOR_PATH_KIND=${sinkKind}`);
  console.log(`C_TRACE_SINK_LOCATOR_PATH_ERROR=${sinkError}`);

  const seen = new Set();
  const signalIds = [];

  if (Array.isArray(items)) {
    for (let i = 0; i < items.length; i += 1) {
      const it = items[i];
      if (!it || typeof it !== 'object' || Array.isArray(it)) {
        violations.push(`item_${i}_must_be_object`);
        continue;
      }

      const required = ['signalId', 'kind', 'introducedIn', 'severity', 'evidencePath', 'description'];
      for (const k of required) {
        if (!(k in it)) {
          violations.push(`item_${i}_missing_${k}`);
        }
      }

      const signalId = it.signalId;
      if (typeof signalId !== 'string' || signalId.length === 0) {
        violations.push(`item_${i}_signalId_invalid`);
      } else {
        if (/\s/.test(signalId)) violations.push(`${signalId}:signalId_has_whitespace`);
        if (seen.has(signalId)) violations.push(`${signalId}:duplicate_signalId`);
        seen.add(signalId);
        signalIds.push(signalId);
      }

      const kind = it.kind;
      if (kind !== 'trace_sink' && kind !== 'trace_signal') {
        violations.push(`${typeof signalId === 'string' && signalId.length > 0 ? signalId : `item_${i}`}:kind_invalid`);
      }

      const introducedIn = it.introducedIn;
      if (introducedIn !== 'v1.3') {
        violations.push(`${typeof signalId === 'string' && signalId.length > 0 ? signalId : `item_${i}`}:introducedIn_invalid`);
      }

      const severity = it.severity;
      if (severity !== 'P0' && severity !== 'P1' && severity !== 'P2') {
        violations.push(`${typeof signalId === 'string' && signalId.length > 0 ? signalId : `item_${i}`}:severity_invalid`);
      }

      const evidencePath = it.evidencePath;
      if (typeof evidencePath !== 'string' || evidencePath.length === 0) {
        violations.push(`${typeof signalId === 'string' && signalId.length > 0 ? signalId : `item_${i}`}:evidencePath_invalid`);
      } else if (evidencePath.includes('\\')) {
        violations.push(`${typeof signalId === 'string' && signalId.length > 0 ? signalId : `item_${i}`}:evidencePath_backslash`);
      }

      const description = it.description;
      if (typeof description !== 'string' || description.length === 0) {
        violations.push(`${typeof signalId === 'string' && signalId.length > 0 ? signalId : `item_${i}`}:description_invalid`);
      }
    }
  }

  const sorted = [...signalIds].sort();
  const sortedOk = signalIds.length === sorted.length && signalIds.every((v, i) => v === sorted[i]);
  if (!sortedOk) violations.push('signalId_not_sorted');

  const byId = Array.isArray(items) ? new Map(items.map((x) => [x && x.signalId, x])) : new Map();
  const minSet = ['C_TRACE_SINK_LOCATOR', 'C_TRACE_COMMAND_RECORD', 'C_TRACE_EFFECT_RECORD'];
  for (const id of minSet) {
    if (!byId.has(id)) {
      violations.push(`missing_${id}`);
    }
  }

  const sink = byId.get('C_TRACE_SINK_LOCATOR');
  if (sink) {
    if (sink.kind !== 'trace_sink') violations.push('C_TRACE_SINK_LOCATOR:kind_must_be_trace_sink');
    if (sink.severity !== 'P0') violations.push('C_TRACE_SINK_LOCATOR:severity_must_be_P0');
  }

  for (const id of ['C_TRACE_COMMAND_RECORD', 'C_TRACE_EFFECT_RECORD']) {
    const it = byId.get(id);
    if (it) {
      if (it.kind !== 'trace_signal') violations.push(`${id}:kind_must_be_trace_signal`);
      if (it.severity !== 'P0') violations.push(`${id}:severity_must_be_P0`);
    }
  }

  const uniqSorted = [...new Set(violations)].sort();
  console.log(`RUNTIME_SIGNALS_VIOLATIONS=${JSON.stringify(uniqSorted)}`);
  console.log(`RUNTIME_SIGNALS_VIOLATIONS_COUNT=${uniqSorted.length}`);

  return { level: uniqSorted.length > 0 ? 'warn' : 'ok' };
}

function parseRuntimeSignalIdSet() {
  const filePath = 'docs/OPS/RUNTIME_SIGNALS.json';
  const parsed = readJson(filePath);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    die('ERR_DOCTOR_INVALID_SHAPE', filePath, 'top_level_must_be_object');
  }
  if (!Array.isArray(parsed.items)) {
    die('ERR_DOCTOR_INVALID_SHAPE', filePath, 'items_must_be_array');
  }
  const set = new Set();
  for (let i = 0; i < parsed.items.length; i += 1) {
    const it = parsed.items[i];
    if (!it || typeof it !== 'object' || Array.isArray(it)) continue;
    const signalId = it.signalId;
    if (typeof signalId === 'string' && signalId.length > 0) set.add(signalId);
  }
  return set;
}

function checkContourCEnforcementInventory(applicableRegistryItems, targetParsed) {
  const filePath = 'docs/OPS/CONTOUR-C-ENFORCEMENT.json';
  const violations = new Set();
  let forceFail = false;

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    parsed = null;
    violations.add('ENF_JSON_READ_FAIL');
    forceFail = true;
  }

  const rawIds = [];
  const entriesSet = new Set();

  const applicableIds = new Set();
  if (Array.isArray(applicableRegistryItems)) {
    for (const it of applicableRegistryItems) {
      if (it && typeof it === 'object' && !Array.isArray(it) && typeof it.invariantId === 'string' && it.invariantId.length > 0) {
        applicableIds.add(it.invariantId);
      }
    }
  }

  const runtimeSignalIdSet = forceFail ? new Set() : parseRuntimeSignalIdSet();
  const applicable = new Set();
  const ignored = new Set();

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    violations.add('ENF_SCHEMA_OR_VERSION_MISMATCH');
  } else {
    const schemaOk = parsed.schemaVersion === 1;
    const versionOk = parsed.opsCanonVersion === SUPPORTED_OPS_CANON_VERSION;
    const items = parsed.items;

    if (!schemaOk || !versionOk || !Array.isArray(items)) {
      violations.add('ENF_SCHEMA_OR_VERSION_MISMATCH');
      if (!versionOk) forceFail = true;
    }

    if (Array.isArray(items)) {
      const requiredMode = new Set(['off', 'soft', 'hard']);
      const allowedMaturity = new Set(['implemented', 'placeholder', 'no_source']);

      for (let i = 0; i < items.length; i += 1) {
        const it = items[i];
        if (!it || typeof it !== 'object' || Array.isArray(it)) {
          violations.add('ENF_SCHEMA_OR_VERSION_MISMATCH');
          continue;
        }

        const invariantId = it.invariantId;
        const invariantIdValid = typeof invariantId === 'string' && invariantId.length > 0 && !/\s/.test(invariantId);

        if (invariantIdValid) {
          rawIds.push(invariantId);
          entriesSet.add(invariantId);
        } else {
          violations.add('ENF_SCHEMA_OR_VERSION_MISMATCH');
        }

        const introducedIn = it.introducedIn;
        let isApplicable = true;
        if (typeof introducedIn !== 'string' || !VERSION_TOKEN_RE.test(introducedIn)) {
          violations.add('ENF_SCHEMA_OR_VERSION_MISMATCH');
          isApplicable = true;
        } else {
          const introParsed = parseVersionToken(introducedIn, filePath, 'introducedIn_invalid_version_token');
          isApplicable = compareVersion(introParsed, targetParsed) <= 0;
        }

        if (invariantIdValid) {
          if (isApplicable) {
            applicable.add(invariantId);
          } else {
            ignored.add(invariantId);
          }
        }

        const mode = it.enforcementMode;
        if (isApplicable) {
          if (typeof mode !== 'string' || !requiredMode.has(mode)) {
            violations.add('ENF_INVALID_MODE');
          }
        }

        const severity = it.severity;
        if (isApplicable) {
          if (severity !== 'P0' && severity !== 'P1' && severity !== 'P2') {
            violations.add('ENF_SCHEMA_OR_VERSION_MISMATCH');
          }
        }

        const maturityFields = [
          { key: 'maturityTarget', value: it.maturityTarget },
          { key: 'targetMaturity', value: it.targetMaturity },
          { key: 'maturity', value: it.maturity },
        ];
        if (isApplicable) {
          for (const f of maturityFields) {
            if (!(f.key in it)) continue;
            if (typeof f.value !== 'string' || !allowedMaturity.has(f.value)) {
              violations.add('ENF_INVALID_MATURITY_TARGET');
            }
          }
        }

        const maturityPlanValue = 'maturityPlan' in it ? it.maturityPlan : it.description;
        if (isApplicable) {
          if (typeof maturityPlanValue !== 'string' || maturityPlanValue.length === 0) {
            violations.add('ENF_INVALID_MATURITY_TARGET');
          }
        }

        const signalIdsValue = 'signalIds' in it ? it.signalIds : it.signals;
        if (isApplicable) {
          if (!Array.isArray(signalIdsValue)) {
            violations.add('ENF_SCHEMA_OR_VERSION_MISMATCH');
          } else {
            for (let j = 0; j < signalIdsValue.length; j += 1) {
              const sid = signalIdsValue[j];
              if (typeof sid !== 'string' || sid.length === 0 || /\s/.test(sid)) {
                violations.add('ENF_SCHEMA_OR_VERSION_MISMATCH');
                continue;
              }
              if (!runtimeSignalIdSet.has(sid)) {
                violations.add('ENF_SCHEMA_OR_VERSION_MISMATCH');
              }
            }
          }
        }

        if (isApplicable && invariantIdValid) {
          if (!applicableIds.has(invariantId)) {
            violations.add('ENF_UNKNOWN_INVARIANT_ID');
          }
        }
      }
    }
  }

  const counts = new Map();
  for (const id of rawIds) {
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  const hasDupes = [...counts.values()].some((n) => n > 1);
  if (hasDupes) {
    violations.add('ENF_DUPLICATE_INVARIANT_ID');
  }

  const sorted = [...rawIds].sort();
  const sortedOk = rawIds.length === sorted.length && rawIds.every((v, i) => v === sorted[i]);
  if (!sortedOk) {
    violations.add('ENF_UNSORTED_INVARIANT_ID');
  }

  const entries = [...entriesSet].sort();
  const applicableList = [...applicable].sort();
  const ignoredList = [...ignored].sort();
  const violationsOut = [...violations].sort();

  console.log(`CONTOUR_C_ENFORCEMENT_ENTRIES=${JSON.stringify(entries)}`);
  console.log(`CONTOUR_C_ENFORCEMENT_ENTRIES_COUNT=${entries.length}`);
  console.log(`CONTOUR_C_ENFORCEMENT_APPLICABLE=${JSON.stringify(applicableList)}`);
  console.log(`CONTOUR_C_ENFORCEMENT_APPLICABLE_COUNT=${applicableList.length}`);
  console.log(`CONTOUR_C_ENFORCEMENT_IGNORED=${JSON.stringify(ignoredList)}`);
  console.log(`CONTOUR_C_ENFORCEMENT_IGNORED_COUNT=${ignoredList.length}`);
  console.log(`CONTOUR_C_ENFORCEMENT_VIOLATIONS=${JSON.stringify(violationsOut)}`);
  console.log(`CONTOUR_C_ENFORCEMENT_VIOLATIONS_COUNT=${violationsOut.length}`);

  return { forceFail, level: violationsOut.length > 0 ? 'warn' : 'ok', planIds: entries };
}

function evaluateRegistry(items, auditCheckIds) {
  const enforced = [];
  const placeholders = [];
  const noSource = [];
  const cNotImplemented = [];

  for (const it of items) {
    const enforcementMode = it.enforcementMode;
    if (enforcementMode === 'off') continue;

    const invariantId = it.invariantId;
    const maturityRaw = it.maturity;
    const checkId = it.checkId;

    let effectiveMaturity = maturityRaw;
    if (maturityRaw === 'implemented' && typeof checkId === 'string' && checkId.length > 0 && !auditCheckIds.has(checkId)) {
      effectiveMaturity = 'no_source';
    }

    if (effectiveMaturity === 'implemented') {
      enforced.push(invariantId);
    } else if (effectiveMaturity === 'placeholder') {
      placeholders.push(invariantId);
    } else {
      noSource.push(invariantId);
    }

    if (typeof invariantId === 'string' && invariantId.startsWith('C_RUNTIME_') && (effectiveMaturity === 'placeholder' || effectiveMaturity === 'no_source')) {
      cNotImplemented.push(invariantId);
    }
  }

  enforced.sort();
  placeholders.sort();
  noSource.sort();

  const placeholderSet = new Set(placeholders);
  const noSourceSet = new Set(noSource);

  for (const id of cNotImplemented) {
    const inPlaceholder = placeholderSet.has(id);
    const inNoSource = noSourceSet.has(id);
    if ((inPlaceholder ? 1 : 0) + (inNoSource ? 1 : 0) !== 1) {
      console.error(`C_NOT_IMPLEMENTED_UNCLASSIFIED=${id}`);
      die('ERR_DOCTOR_INVALID_SHAPE', 'scripts/doctor.mjs', 'c_runtime_not_implemented_unclassified');
    }
  }

  console.log(`ENFORCED_INVARIANTS=${JSON.stringify(enforced)}`);
  console.log(`PLACEHOLDER_INVARIANTS=${JSON.stringify(placeholders)}`);
  console.log(`NO_SOURCE_INVARIANTS=${JSON.stringify(noSource)}`);
  console.log(`PLACEHOLDER_INVARIANTS_COUNT=${placeholders.length}`);
  console.log(`NO_SOURCE_INVARIANTS_COUNT=${noSource.length}`);

  const hasWarn = placeholders.length > 0 || noSource.length > 0;
  return { level: hasWarn ? 'warn' : 'ok' };
}

function computeEffectiveEnforcementReport(items, auditCheckIds, debtRegistry, effectiveMode, ignoredInvariantIds) {
  const canExecuteCheckId = false;
  const resultsById = new Map();

  for (const it of items) {
    const enforcementMode = it.enforcementMode;
    if (enforcementMode === 'off') continue;

    const invariantId = it.invariantId;
    const maturityRaw = it.maturity;
    const checkId = it.checkId;

    let effectiveMaturity = maturityRaw;
    if (maturityRaw === 'implemented' && typeof checkId === 'string' && checkId.length > 0) {
      const resolvable = auditCheckIds.has(checkId);
      if (!resolvable || !canExecuteCheckId) {
        effectiveMaturity = 'no_source';
      }
    }

    let status = 'WARN';

    if (effectiveMaturity === 'implemented') {
      status = 'WARN';
    }

    resultsById.set(invariantId, status);
  }

  const ids = [...resultsById.keys()].sort();
  const results = ids.map((id) => `${id}:${resultsById.get(id)}`);

  const counts = {
    OK: 0,
    WARN: 0,
    WARN_MISSING_DEBT: 0,
    FAIL: 0,
  };

  for (const v of resultsById.values()) {
    if (v in counts) counts[v] += 1;
  }

  const sum = counts.OK + counts.WARN + counts.WARN_MISSING_DEBT + counts.FAIL;

  const ignoredSet = new Set(Array.isArray(ignoredInvariantIds) ? ignoredInvariantIds : []);
  const intersection = ids.filter((id) => ignoredSet.has(id));
  const intersectionUniq = [...new Set(intersection)].sort();
  const containsIgnored = intersectionUniq.length > 0;

  console.log(`EFFECTIVE_MODE=${effectiveMode}`);
  console.log(`INVARIANT_RESULTS=${JSON.stringify(results)}`);
  console.log(`INVARIANT_RESULTS_COUNT=${results.length}`);
  console.log(`INVARIANT_STATUS_COUNTS=${JSON.stringify(counts)}`);
  console.log(`INVARIANT_STATUS_COUNTS_SUM=${sum}`);
  console.log(`INVARIANT_RESULTS_CONTAINS_IGNORED=${containsIgnored ? 1 : 0}`);
  console.log(`INVARIANT_RESULTS_IGNORED_INTERSECTION=${JSON.stringify(intersectionUniq)}`);

  const warnTarget = loadContourCWarnTargetConfig();
  let currentWarnCount = 0;
  for (const invariantId of warnTarget.targetWarnIds) {
    const status = resultsById.get(invariantId);
    if (typeof status === 'string' && status.startsWith('WARN')) currentWarnCount += 1;
  }
  const warnDeltaTarget = currentWarnCount - warnTarget.baselineWarnCount;
  console.log(`WARN_TARGET_SET_VERSION=${warnTarget.warnTargetSetVersion}`);
  console.log(`WARN_TARGET_BASELINE_SHA=${warnTarget.baselineSha}`);
  console.log(`WARN_TARGET_SET=${JSON.stringify(warnTarget.targetWarnIds)}`);
  console.log(`WARN_TARGET_BASELINE_COUNT=${warnTarget.baselineWarnCount}`);
  console.log(`WARN_TARGET_CURRENT_COUNT=${currentWarnCount}`);
  console.log(`WARN_DELTA_TARGET=${warnDeltaTarget}`);

  if (containsIgnored) {
    die('ERR_DOCTOR_INVALID_SHAPE', 'scripts/doctor.mjs', 'invariant_results_contains_ignored');
  }
}

function listSourceFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];

  const out = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const dir = stack.pop();
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;

      if (/\.(c|m)?js$/.test(entry.name) || /\.tsx?$/.test(entry.name) || /\.d\.ts$/.test(entry.name)) {
        out.push(fullPath);
      }
    }
  }

  return out.sort();
}

function checkCoreBoundary(matrixMode, debtRegistry) {
  const invariantId = 'CORE-BOUNDARY-001';
  const roots = ['src/core', 'src/contracts'];
  const files = roots.flatMap((r) => listSourceFiles(r));

  const patterns = [
    /\bfrom\s+['"]electron['"]/g,
    /\bfrom\s+['"]fs['"]/g,
    /\bfrom\s+['"]path['"]/g,
    /\bfrom\s+['"]@\/ui['"]/g,
    /\bfrom\s+['"]@\/platform['"]/g,
    /\brequire\s*\(\s*['"]electron['"]\s*\)/g,
    /\brequire\s*\(\s*['"]fs['"]\s*\)/g,
    /\brequire\s*\(\s*['"]path['"]\s*\)/g,
    /\brequire\s*\(\s*['"]@\/ui['"]\s*\)/g,
    /\brequire\s*\(\s*['"]@\/platform['"]\s*\)/g,
  ];

  const violations = [];

  for (const filePath of files) {
    let text;
    try {
      text = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    for (const re of patterns) {
      re.lastIndex = 0;
      const m = re.exec(text);
      if (m) {
        violations.push({ filePath, token: m[0] });
      }
    }
  }

  for (const v of violations) {
    console.log(`CORE_BOUNDARY_VIOLATION file=${v.filePath} token=${JSON.stringify(v.token)} invariant=${invariantId}`);
  }

  if (violations.length === 0) {
    return { status: 'CORE_BOUNDARY_OK', level: 'ok' };
  }

  if (matrixMode.mode === 'STRICT') {
    return { status: 'CORE_BOUNDARY_FAIL', level: 'fail' };
  }

  const activeDebt = hasAnyActiveDebt(debtRegistry);
  return {
    status: activeDebt ? 'CORE_BOUNDARY_WARN' : 'CORE_BOUNDARY_WARN_MISSING_DEBT',
    level: 'warn',
  };
}

function checkCoreDeterminism(matrixMode, debtRegistry) {
  const roots = ['src/core', 'src/contracts'];
  const files = roots.flatMap((r) => listSourceFiles(r));

  const tokenRules = [
    { token: 'Date.now', invariantId: 'CORE-DET-001' },
    { token: 'new Date(', invariantId: 'CORE-DET-001' },
    { token: 'Math.random', invariantId: 'CORE-DET-002' },
    { token: 'crypto.randomUUID', invariantId: 'CORE-DET-002' },
    { token: 'process.env', invariantId: 'CORE-DET-001' },
    { token: 'process.platform', invariantId: 'CORE-DET-001' },
    { token: 'setTimeout', invariantId: 'CORE-DET-001' },
    { token: 'setInterval', invariantId: 'CORE-DET-001' },
  ];

  const violations = [];

  for (const filePath of files) {
    let text;
    try {
      text = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    for (const rule of tokenRules) {
      if (text.includes(rule.token)) {
        violations.push({ filePath, token: rule.token, invariantId: rule.invariantId });
      }
    }
  }

  for (const v of violations) {
    console.log(`CORE_DET_VIOLATION file=${v.filePath} token=${JSON.stringify(v.token)} invariant=${v.invariantId}`);
  }

  if (violations.length === 0) {
    return { status: 'CORE_DET_OK', level: 'ok' };
  }

  if (matrixMode.mode === 'STRICT') {
    return { status: 'CORE_DET_FAIL', level: 'fail' };
  }

  const activeDebt = hasAnyActiveDebt(debtRegistry);
  return {
    status: activeDebt ? 'CORE_DET_WARN' : 'CORE_DET_WARN_MISSING_DEBT',
    level: 'warn',
  };
}

function checkQueuePolicies(matrixMode, debtRegistry, queueItems) {
  const invariantId = 'OPS-QUEUE-001';
  const allowedOverflow = new Set([
    'drop_oldest',
    'drop_newest',
    'hard_fail',
    'degrade',
  ]);

  const violations = [];

  for (let i = 0; i < queueItems.length; i += 1) {
    const item = queueItems[i];

    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      violations.push({ queueId: 'unknown', field: 'item' });
      continue;
    }

    const queueIdRaw = item.queueId;
    const queueId = typeof queueIdRaw === 'string' && queueIdRaw.length > 0 ? queueIdRaw : 'unknown';

    if (queueId === 'unknown') violations.push({ queueId, field: 'queueId' });

    const maxSize = item.maxSize;
    if (typeof maxSize !== 'number' || !Number.isFinite(maxSize) || maxSize <= 0) {
      violations.push({ queueId, field: 'maxSize' });
    }

    const overflow = item.overflow;
    if (typeof overflow !== 'string' || !allowedOverflow.has(overflow)) {
      violations.push({ queueId, field: 'overflow' });
    }

    const owner = item.owner;
    if (typeof owner !== 'string' || owner.length === 0) {
      violations.push({ queueId, field: 'owner' });
    }
  }

  for (const v of violations) {
    console.log(`QUEUE_POLICY_VIOLATION queueId=${v.queueId} field=${v.field} invariant=${invariantId}`);
  }

  if (violations.length === 0) {
    return { status: 'QUEUE_POLICY_OK', level: 'ok' };
  }

  if (matrixMode.mode === 'STRICT') {
    return { status: 'QUEUE_POLICY_FAIL', level: 'fail' };
  }

  const activeDebt = hasAnyActiveDebt(debtRegistry);
  return {
    status: activeDebt ? 'QUEUE_POLICY_WARN' : 'QUEUE_POLICY_WARN_MISSING_DEBT',
    level: 'warn',
  };
}

function checkCapabilitiesMatrix(matrixMode, debtRegistry, capsItems) {
  const invariantId = 'OPS-CAPABILITIES-001';
  const violations = [];
  const seenPlatformIds = new Set();

  for (let i = 0; i < capsItems.length; i += 1) {
    const item = capsItems[i];

    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      violations.push({ platformId: 'unknown', field: 'item' });
      continue;
    }

    const platformIdRaw = item.platformId;
    const platformId = typeof platformIdRaw === 'string' && platformIdRaw.length > 0 ? platformIdRaw : 'unknown';
    if (platformId === 'unknown') violations.push({ platformId, field: 'platformId' });

    if (platformId !== 'unknown') {
      if (seenPlatformIds.has(platformId)) {
        violations.push({ platformId, field: 'platformId_duplicate' });
      } else {
        seenPlatformIds.add(platformId);
      }
    }

    const capabilities = item.capabilities;
    if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) {
      violations.push({ platformId, field: 'capabilities' });
    } else {
      const keys = Object.keys(capabilities);
      if (keys.length === 0) {
        violations.push({ platformId, field: 'capabilities_empty' });
      }
      for (const k of keys) {
        const v = capabilities[k];
        const t = typeof v;
        const ok = t === 'boolean' || t === 'string' || t === 'number';
        if (!ok || v === null || Array.isArray(v) || (t === 'object')) {
          violations.push({ platformId, field: `capabilities.${k}` });
        }
      }
    }

    if ('disabledCommands' in item) {
      const dc = item.disabledCommands;
      if (!Array.isArray(dc)) {
        violations.push({ platformId, field: 'disabledCommands' });
      } else {
        for (let j = 0; j < dc.length; j += 1) {
          const v = dc[j];
          if (typeof v !== 'string' || v.length === 0) {
            violations.push({ platformId, field: 'disabledCommands' });
            break;
          }
        }
      }
    }

    if ('degradedFeatures' in item) {
      const df = item.degradedFeatures;
      if (!Array.isArray(df)) {
        violations.push({ platformId, field: 'degradedFeatures' });
      } else {
        for (let j = 0; j < df.length; j += 1) {
          const v = df[j];
          if (typeof v !== 'string' || v.length === 0) {
            violations.push({ platformId, field: 'degradedFeatures' });
            break;
          }
        }
      }
    }
  }

  for (const v of violations) {
    console.log(`CAPABILITIES_VIOLATION platformId=${v.platformId} field=${v.field} invariant=${invariantId}`);
  }

  if (violations.length === 0) {
    return { status: 'CAPABILITIES_OK', level: 'ok' };
  }

  if (matrixMode.mode === 'STRICT') {
    return { status: 'CAPABILITIES_FAIL', level: 'fail' };
  }

  const activeDebt = hasAnyActiveDebt(debtRegistry);
  return {
    status: activeDebt ? 'CAPABILITIES_WARN' : 'CAPABILITIES_WARN_MISSING_DEBT',
    level: 'warn',
  };
}

function checkPublicSurface(matrixMode, debtRegistry) {
  const invariantId = 'OPS-PUBLIC-SURFACE-001';
  const filePath = 'docs/OPS/PUBLIC_SURFACE.json';

  const violations = [];

  let parsed;
  try {
    parsed = JSON.parse(readText(filePath));
  } catch {
    violations.push({ id: 'unknown', field: 'json' });
    parsed = null;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    violations.push({ id: 'unknown', field: 'root' });
  }

  const schemaVersion = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed.schemaVersion : undefined;
  if (schemaVersion !== 1) {
    violations.push({ id: 'unknown', field: 'schemaVersion' });
  }

  const items = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed.items : undefined;
  if (!Array.isArray(items)) {
    violations.push({ id: 'unknown', field: 'items' });
  }

  if (Array.isArray(items) && items.length < 1) {
    violations.push({ id: 'unknown', field: 'items_empty' });
  }

  const seenIds = new Set();

  if (Array.isArray(items)) {
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        violations.push({ id: 'unknown', field: 'item' });
        continue;
      }

      const idRaw = item.id;
      const id = typeof idRaw === 'string' && idRaw.length > 0 ? idRaw : 'unknown';
      if (id === 'unknown') violations.push({ id, field: 'id' });

      if (id !== 'unknown') {
        if (seenIds.has(id)) {
          violations.push({ id, field: 'id_duplicate' });
        } else {
          seenIds.add(id);
        }
      }

      const kind = item.kind;
      if (kind !== 'contract' && kind !== 'schema' && kind !== 'ondisk') {
        violations.push({ id, field: 'kind' });
      }

      const stability = item.stability;
      if (stability !== 'Stable' && stability !== 'Evolving' && stability !== 'Experimental') {
        violations.push({ id, field: 'stability' });
      }

      const paths = item.paths;
      if (!Array.isArray(paths)) {
        violations.push({ id, field: 'paths' });
      } else {
        if (paths.length < 1) violations.push({ id, field: 'paths_empty' });

        if (paths.length === 1 && paths[0] === '**/*') {
          violations.push({ id, field: 'paths_blanket' });
        }

        for (let j = 0; j < paths.length; j += 1) {
          const p = paths[j];
          if (typeof p !== 'string' || p.length === 0) {
            violations.push({ id, field: 'paths' });
            break;
          }
          if (p.includes('\\')) {
            violations.push({ id, field: 'paths_backslash' });
            break;
          }
        }
      }

      if ('notes' in item) {
        if (typeof item.notes !== 'string') {
          violations.push({ id, field: 'notes' });
        }
      }

      if ('owner' in item) {
        if (typeof item.owner !== 'string') {
          violations.push({ id, field: 'owner' });
        }
      }
    }
  }

  for (const v of violations) {
    console.log(`PUBLIC_SURFACE_VIOLATION id=${v.id} field=${v.field} invariant=${invariantId}`);
  }

  if (violations.length === 0) {
    return { status: 'PUBLIC_SURFACE_OK', level: 'ok' };
  }

  if (matrixMode.mode === 'STRICT') {
    return { status: 'PUBLIC_SURFACE_FAIL', level: 'fail' };
  }

  const hasDebt = hasMatchingActiveDebt(debtRegistry, filePath);
  return {
    status: hasDebt ? 'PUBLIC_SURFACE_WARN' : 'PUBLIC_SURFACE_WARN_MISSING_DEBT',
    level: 'warn',
  };
}

function checkEventsAppendOnly(matrixMode, debtRegistry) {
  const invariantId = 'EVENTS-APPEND-ONLY-001';
  const baselinePath = 'docs/OPS/DOMAIN_EVENTS_BASELINE.json';

  const violations = [];

  const baseline = readJson(baselinePath);
  if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline)) {
    die('ERR_DOCTOR_INVALID_SHAPE', baselinePath, 'top_level_must_be_object');
  }
  if (typeof baseline.schemaVersion !== 'number') {
    die('ERR_DOCTOR_INVALID_SHAPE', baselinePath, 'schemaVersion_must_be_number');
  }
  if (!Array.isArray(baseline.events)) {
    die('ERR_DOCTOR_INVALID_SHAPE', baselinePath, 'events_must_be_array');
  }
  if (baseline.events.length < 1) {
    die('ERR_DOCTOR_INVALID_SHAPE', baselinePath, 'events_must_be_non_empty');
  }

  const baselineEventIds = [];
  const seen = new Set();

  for (let i = 0; i < baseline.events.length; i += 1) {
    const item = baseline.events[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      die('ERR_DOCTOR_INVALID_SHAPE', baselinePath, `event_${i}_must_be_object`);
    }
    const eventId = item.eventId;
    if (typeof eventId !== 'string' || eventId.length === 0) {
      die('ERR_DOCTOR_INVALID_SHAPE', baselinePath, `event_${i}_eventId_must_be_string`);
    }
    if (seen.has(eventId)) {
      die('ERR_DOCTOR_INVALID_SHAPE', baselinePath, `event_${i}_eventId_duplicate`);
    }
    seen.add(eventId);
    baselineEventIds.push(eventId);

    const stability = item.stability;
    if (stability !== 'Stable' && stability !== 'Evolving' && stability !== 'Experimental') {
      die('ERR_DOCTOR_INVALID_SHAPE', baselinePath, `event_${i}_stability_invalid`);
    }

    const introducedIn = item.introducedIn;
    if (typeof introducedIn !== 'string') {
      die('ERR_DOCTOR_INVALID_SHAPE', baselinePath, `event_${i}_introducedIn_must_be_string`);
    }

    if ('deprecatedIn' in item && typeof item.deprecatedIn !== 'string') {
      die('ERR_DOCTOR_INVALID_SHAPE', baselinePath, `event_${i}_deprecatedIn_must_be_string`);
    }
  }

  const canonicalRoots = fs.existsSync('src/contracts/events')
    ? ['src/contracts/events']
    : ['src/contracts/core-event.contract.ts'];

  let hasWildcardType = false;
  const currentIds = new Set();

  for (const root of canonicalRoots) {
    const files = root.endsWith('.ts') ? [root] : listSourceFiles(root);
    for (const filePath of files) {
      if (!fs.existsSync(filePath)) continue;
      let text;
      try {
        text = fs.readFileSync(filePath, 'utf8');
      } catch {
        continue;
      }

      if (/\btype\s*:\s*string\b/.test(text)) {
        hasWildcardType = true;
      }

      const re = /\btype\s*:\s*(['"`])([^'"`]+)\1/g;
      for (;;) {
        const m = re.exec(text);
        if (!m) break;
        currentIds.add(m[2]);
      }
    }
  }

  if (!hasWildcardType) {
    for (const eventId of baselineEventIds) {
      if (!currentIds.has(eventId)) {
        violations.push({ eventId });
      }
    }
  }

  for (const v of violations) {
    console.log(`EVENTS_APPEND_VIOLATION eventId=${v.eventId} invariant=${invariantId}`);
  }

  if (violations.length === 0) {
    return { status: 'EVENTS_APPEND_OK', level: 'ok' };
  }

  if (matrixMode.mode === 'STRICT') {
    return { status: 'EVENTS_APPEND_FAIL', level: 'fail' };
  }

  const hasDebt = hasMatchingActiveDebt(debtRegistry, baselinePath)
    || hasMatchingActiveDebt(debtRegistry, 'src/contracts/core-event.contract.ts')
    || hasMatchingActiveDebt(debtRegistry, 'src/contracts/events');
  return {
    status: hasDebt ? 'EVENTS_APPEND_WARN' : 'EVENTS_APPEND_WARN_MISSING_DEBT',
    level: 'warn',
  };
}

function checkTextSnapshotSpec(matrixMode, debtRegistry) {
  const invariantId = 'OPS-SNAPSHOT-001';
  const filePath = 'docs/OPS/TEXT_SNAPSHOT_SPEC.json';

  const violations = [];

  let parsed;
  try {
    parsed = JSON.parse(readText(filePath));
  } catch {
    violations.push({ field: 'json' });
    parsed = null;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    violations.push({ field: 'root' });
  }

  const schemaVersion = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed.schemaVersion : undefined;
  if (typeof schemaVersion !== 'number') {
    violations.push({ field: 'schemaVersion' });
  }

  const requiredFields = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed.requiredFields : undefined;
  const optionalFields = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed.optionalFields : undefined;
  const forbiddenPrefixes = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed.forbiddenFieldPrefixes : undefined;

  if (!Array.isArray(requiredFields)) violations.push({ field: 'requiredFields' });
  if (!Array.isArray(optionalFields)) violations.push({ field: 'optionalFields' });
  if (!Array.isArray(forbiddenPrefixes)) violations.push({ field: 'forbiddenFieldPrefixes' });

  const forbidden = Array.isArray(forbiddenPrefixes)
    ? forbiddenPrefixes.filter((p) => typeof p === 'string' && p.length > 0)
    : [];

  const checkFieldArray = (arr, label) => {
    if (!Array.isArray(arr)) return;
    const seen = new Set();
    for (let i = 0; i < arr.length; i += 1) {
      const v = arr[i];
      if (typeof v !== 'string' || v.length === 0) {
        violations.push({ field: `${label}[${i}]` });
        continue;
      }
      if (seen.has(v)) {
        violations.push({ field: `${label}_duplicate` });
      } else {
        seen.add(v);
      }
      for (const prefix of forbidden) {
        if (v.startsWith(prefix)) {
          violations.push({ field: `${label}_forbidden_prefix` });
          break;
        }
      }
    }
  };

  checkFieldArray(requiredFields, 'requiredFields');
  checkFieldArray(optionalFields, 'optionalFields');

  if (Array.isArray(forbiddenPrefixes)) {
    for (let i = 0; i < forbiddenPrefixes.length; i += 1) {
      const p = forbiddenPrefixes[i];
      if (typeof p !== 'string' || p.length === 0) {
        violations.push({ field: `forbiddenFieldPrefixes[${i}]` });
      }
    }
  }

  for (const v of violations) {
    console.log(`SNAPSHOT_VIOLATION field=${v.field} invariant=${invariantId}`);
  }

  if (violations.length === 0) {
    return { status: 'SNAPSHOT_OK', level: 'ok' };
  }

  if (matrixMode.mode === 'STRICT') {
    return { status: 'SNAPSHOT_FAIL', level: 'fail' };
  }

  const hasDebt = hasMatchingActiveDebt(debtRegistry, filePath);
  return {
    status: hasDebt ? 'SNAPSHOT_WARN' : 'SNAPSHOT_WARN_MISSING_DEBT',
    level: 'warn',
  };
}

function checkEffectsIdempotency(matrixMode, debtRegistry) {
  const invariantId = 'OPS-EFFECTS-IDEMP-001';
  const filePath = 'docs/OPS/EFFECT_KINDS.json';

  const violations = [];

  let parsed;
  try {
    parsed = JSON.parse(readText(filePath));
  } catch {
    violations.push({ kind: 'unknown', field: 'json' });
    parsed = null;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    violations.push({ kind: 'unknown', field: 'root' });
  }

  const schemaVersion = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed.schemaVersion : undefined;
  if (typeof schemaVersion !== 'number') {
    violations.push({ kind: 'unknown', field: 'schemaVersion' });
  }

  const kinds = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed.kinds : undefined;
  if (!Array.isArray(kinds)) {
    violations.push({ kind: 'unknown', field: 'kinds' });
  }

  const requiresKeyKinds = [];
  const seenKinds = new Set();

  if (Array.isArray(kinds)) {
    for (let i = 0; i < kinds.length; i += 1) {
      const item = kinds[i];
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        violations.push({ kind: 'unknown', field: 'item' });
        continue;
      }

      const kindRaw = item.kind;
      const kind = typeof kindRaw === 'string' && kindRaw.length > 0 ? kindRaw : 'unknown';
      if (kind === 'unknown') violations.push({ kind, field: 'kind' });

      if (kind !== 'unknown') {
        if (seenKinds.has(kind)) {
          violations.push({ kind, field: 'kind_duplicate' });
        } else {
          seenKinds.add(kind);
        }
      }

      const idempotent = item.idempotent;
      if (typeof idempotent !== 'boolean') {
        violations.push({ kind, field: 'idempotent' });
      }

      const requiresIdempotencyKey = item.requiresIdempotencyKey;
      if (typeof requiresIdempotencyKey !== 'boolean') {
        violations.push({ kind, field: 'requiresIdempotencyKey' });
      } else if (requiresIdempotencyKey === true) {
        if (kind !== 'unknown') requiresKeyKinds.push(kind);
      }
    }
  }

  if (violations.length === 0 && requiresKeyKinds.length > 0) {
    const roots = ['src/contracts'];
    const files = roots.flatMap((r) => listSourceFiles(r));

    for (const kind of requiresKeyKinds) {
      let foundKind = false;
      let foundIdempotencyKey = false;
      const kindRe = new RegExp(`\\bkind\\s*:\\s*['"\`]${kind}['"\`]`);

      for (const filePath of files) {
        let text;
        try {
          text = fs.readFileSync(filePath, 'utf8');
        } catch {
          continue;
        }

        if (kindRe.test(text)) {
          foundKind = true;
          if (text.includes('idempotencyKey')) {
            foundIdempotencyKey = true;
            break;
          }
        }
      }

      if (foundKind && !foundIdempotencyKey) {
        violations.push({ kind, field: 'idempotencyKey' });
      }
    }
  }

  for (const v of violations) {
    console.log(`EFFECT_IDEMP_VIOLATION kind=${v.kind} field=${v.field} invariant=${invariantId}`);
  }

  if (violations.length === 0) {
    return { status: 'EFFECT_IDEMP_OK', level: 'ok' };
  }

  if (matrixMode.mode === 'STRICT') {
    return { status: 'EFFECT_IDEMP_FAIL', level: 'fail' };
  }

  const hasDebt = hasMatchingActiveDebt(debtRegistry, filePath);
  return {
    status: hasDebt ? 'EFFECT_IDEMP_WARN' : 'EFFECT_IDEMP_WARN_MISSING_DEBT',
    level: 'warn',
  };
}

function checkOndiskArtifacts(matrixMode, debtRegistry) {
  const invariantId = 'OPS-ONDISK-001';
  const filePath = 'docs/OPS/ONDISK_ARTIFACTS.json';

  const violations = [];

  let parsed;
  try {
    parsed = JSON.parse(readText(filePath));
  } catch {
    violations.push({ id: 'unknown', field: 'json' });
    parsed = null;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    violations.push({ id: 'unknown', field: 'root' });
  }

  const schemaVersion = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed.schemaVersion : undefined;
  if (schemaVersion !== 1) {
    violations.push({ id: 'unknown', field: 'schemaVersion' });
  }

  const items = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed.items : undefined;
  if (!Array.isArray(items)) {
    violations.push({ id: 'unknown', field: 'items' });
  }
  if (Array.isArray(items) && items.length < 1) {
    violations.push({ id: 'unknown', field: 'items_empty' });
  }

  const allowedStability = new Set(['Stable', 'Evolving', 'Experimental']);
  const allowedKind = new Set(['project_manifest', 'scene_document', 'backup', 'architecture_snapshot', 'cache']);
  const allowedMigrationPolicy = new Set(['required', 'optional', 'not_applicable']);

  const seenIds = new Set();

  if (Array.isArray(items)) {
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        violations.push({ id: 'unknown', field: 'item' });
        continue;
      }

      const idRaw = item.id;
      const id = typeof idRaw === 'string' && idRaw.length > 0 ? idRaw : 'unknown';
      if (id === 'unknown') violations.push({ id, field: 'id' });

      if (id !== 'unknown') {
        if (seenIds.has(id)) {
          violations.push({ id, field: 'id_duplicate' });
        } else {
          seenIds.add(id);
        }
      }

      const stability = item.stability;
      if (typeof stability !== 'string' || !allowedStability.has(stability)) {
        violations.push({ id, field: 'stability' });
      }

      const kind = item.kind;
      if (typeof kind !== 'string' || !allowedKind.has(kind)) {
        violations.push({ id, field: 'kind' });
      }

      const pathPattern = item.pathPattern;
      if (typeof pathPattern !== 'string' || pathPattern.length === 0) {
        violations.push({ id, field: 'pathPattern' });
      }

      const schemaRef = item.schemaRef;
      if (typeof schemaRef !== 'string' || schemaRef.length === 0) {
        violations.push({ id, field: 'schemaRef' });
      }

      const migrationPolicy = item.migrationPolicy;
      if (typeof migrationPolicy !== 'string' || !allowedMigrationPolicy.has(migrationPolicy)) {
        violations.push({ id, field: 'migrationPolicy' });
      }

      const safeToDelete = item.safeToDelete;
      if (typeof safeToDelete !== 'boolean') {
        violations.push({ id, field: 'safeToDelete' });
      }

      if ('notes' in item) {
        if (typeof item.notes !== 'string') {
          violations.push({ id, field: 'notes' });
        }
      }

      const isCache = kind === 'cache';
      if (isCache) {
        if (migrationPolicy !== 'not_applicable') {
          violations.push({ id, field: 'migrationPolicy_cache' });
        }
        if (safeToDelete !== true) {
          violations.push({ id, field: 'safeToDelete_cache' });
        }
      } else {
        if (migrationPolicy !== 'required') {
          violations.push({ id, field: 'migrationPolicy_non_cache' });
        }
        if (safeToDelete !== false) {
          violations.push({ id, field: 'safeToDelete_non_cache' });
        }
      }
    }
  }

  for (const v of violations) {
    console.log(`ONDISK_VIOLATION id=${v.id} field=${v.field} invariant=${invariantId}`);
  }

  if (violations.length === 0) {
    return { status: 'ONDISK_OK', level: 'ok' };
  }

  if (matrixMode.mode === 'STRICT') {
    return { status: 'ONDISK_FAIL', level: 'fail' };
  }

  const hasDebt = hasMatchingActiveDebt(debtRegistry, filePath);
  return {
    status: hasDebt ? 'ONDISK_WARN' : 'ONDISK_WARN_MISSING_DEBT',
    level: 'warn',
  };
}

function computeContourCEnforcementCompleteness(gatingApplicableItems, contourCEnforcementPlanIds) {
  const registryCApplicableSet = new Set();

  for (const it of Array.isArray(gatingApplicableItems) ? gatingApplicableItems : []) {
    if (!it || typeof it !== 'object' || Array.isArray(it)) continue;
    if (it.contour !== 'C') continue;
    const invariantId = it.invariantId;
    if (typeof invariantId !== 'string' || invariantId.length === 0) continue;
    registryCApplicableSet.add(invariantId);
  }

  const registryIds = [...registryCApplicableSet].sort();
  const planIds = Array.isArray(contourCEnforcementPlanIds) ? [...new Set(contourCEnforcementPlanIds)].sort() : [];

  const planSet = new Set(planIds);
  const registrySet = new Set(registryIds);

  const missing = registryIds.filter((id) => !planSet.has(id));
  const extra = planIds.filter((id) => !registrySet.has(id));

  console.log(`CONTOUR_C_ENFORCEMENT_REGISTRY_IDS=${JSON.stringify(registryIds)}`);
  console.log(`CONTOUR_C_ENFORCEMENT_REGISTRY_IDS_COUNT=${registryIds.length}`);
  console.log(`CONTOUR_C_ENFORCEMENT_PLAN_IDS=${JSON.stringify(planIds)}`);
  console.log(`CONTOUR_C_ENFORCEMENT_PLAN_IDS_COUNT=${planIds.length}`);
  console.log(`CONTOUR_C_ENFORCEMENT_MISSING_PLAN_IDS=${JSON.stringify(missing)}`);
  console.log(`CONTOUR_C_ENFORCEMENT_MISSING_PLAN_IDS_COUNT=${missing.length}`);
  console.log(`CONTOUR_C_ENFORCEMENT_EXTRA_PLAN_IDS=${JSON.stringify(extra)}`);
  console.log(`CONTOUR_C_ENFORCEMENT_EXTRA_PLAN_IDS_COUNT=${extra.length}`);

  return { missingCount: missing.length, extraCount: extra.length };
}

function evaluateContourCP001Proof() {
  const proofFiles = [
    CONTOUR_C_P0_01_GUARD_SCRIPT,
    CONTOUR_C_P0_01_TEST_PATH,
    CONTOUR_C_P0_01_POSITIVE_INVARIANTS,
    CONTOUR_C_P0_01_POSITIVE_ENFORCEMENT,
    CONTOUR_C_P0_01_NEGATIVE_INVARIANTS,
    CONTOUR_C_P0_01_NEGATIVE_ENFORCEMENT,
  ];
  const filesPresent = proofFiles.every((filePath) => fs.existsSync(filePath));

  let positivePass = 0;
  let negativeFail = 0;
  let negativeRuleIdMatch = 0;
  let negativeStdout = '';

  if (filesPresent) {
    const positive = spawnSync(
      process.execPath,
      [
        CONTOUR_C_P0_01_GUARD_SCRIPT,
        '--invariants',
        'docs/OPS/INVARIANTS_REGISTRY.json',
        '--enforcement',
        'docs/OPS/CONTOUR-C-ENFORCEMENT.json',
      ],
      { encoding: 'utf8', shell: false },
    );
    positivePass = positive.status === 0 ? 1 : 0;

    const negative = spawnSync(
      process.execPath,
      [
        CONTOUR_C_P0_01_GUARD_SCRIPT,
        '--invariants',
        CONTOUR_C_P0_01_NEGATIVE_INVARIANTS,
        '--enforcement',
        CONTOUR_C_P0_01_NEGATIVE_ENFORCEMENT,
      ],
      { encoding: 'utf8', shell: false },
    );
    negativeStdout = typeof negative.stdout === 'string' ? negative.stdout : '';
    negativeFail = negative.status !== 0 ? 1 : 0;
    negativeRuleIdMatch = negativeStdout.split(/\r?\n/).includes(`RULE_ID=${CONTOUR_C_P0_01_RULE_ID}`) ? 1 : 0;
  }

  const proofOk = filesPresent && positivePass === 1 && negativeFail === 1 && negativeRuleIdMatch === 1 ? 1 : 0;

  console.log(`C_P0_01_RULE_ID=${CONTOUR_C_P0_01_RULE_ID}`);
  console.log(`C_P0_01_RULE_FILES_PRESENT=${filesPresent ? 1 : 0}`);
  console.log(`C_P0_01_POSITIVE_PASS=${positivePass}`);
  console.log(`C_P0_01_NEGATIVE_FAIL=${negativeFail}`);
  console.log(`C_P0_01_NEGATIVE_RULE_ID_MATCH=${negativeRuleIdMatch}`);
  console.log(`C_P0_01_PROOF_OK=${proofOk}`);

  return proofOk;
}

function evaluateContourCP002Proof() {
  const proofFiles = [
    CONTOUR_C_P0_02_GUARD_SCRIPT,
    CONTOUR_C_P0_02_TEST_PATH,
    CONTOUR_C_P0_02_POLICY_PATH,
    CONTOUR_C_P0_02_POSITIVE_POLICY,
    CONTOUR_C_P0_02_NEGATIVE_POLICY,
  ];
  const ruleExists = proofFiles.every((filePath) => fs.existsSync(filePath));

  let positivePass = 0;
  let negativeFail = 0;
  let negativeRuleIdMatch = 0;
  let negativeStdout = '';

  if (ruleExists) {
    const positive = spawnSync(
      process.execPath,
      [
        CONTOUR_C_P0_02_GUARD_SCRIPT,
        '--policy',
        CONTOUR_C_P0_02_POLICY_PATH,
      ],
      { encoding: 'utf8', shell: false },
    );
    positivePass = positive.status === 0 ? 1 : 0;

    const negative = spawnSync(
      process.execPath,
      [
        CONTOUR_C_P0_02_GUARD_SCRIPT,
        '--policy',
        CONTOUR_C_P0_02_NEGATIVE_POLICY,
      ],
      { encoding: 'utf8', shell: false },
    );
    negativeStdout = typeof negative.stdout === 'string' ? negative.stdout : '';
    negativeFail = negative.status !== 0 ? 1 : 0;
    negativeRuleIdMatch = negativeStdout.split(/\r?\n/).includes(`RULE_ID=${CONTOUR_C_P0_02_RULE_ID}`) ? 1 : 0;
  }

  const proofOk = ruleExists && positivePass === 1 && negativeFail === 1 && negativeRuleIdMatch === 1 ? 1 : 0;

  console.log(`C_P0_02_RULE_ID=${CONTOUR_C_P0_02_RULE_ID}`);
  console.log(`C_P0_02_RULE_EXISTS=${ruleExists ? 1 : 0}`);
  console.log(`C_P0_02_NEGATIVE_FAIL_OK=${negativeFail}`);
  console.log(`C_P0_02_POSITIVE_PASS_OK=${positivePass}`);
  console.log(`C_P0_02_PROOF_OK=${proofOk}`);

  return proofOk;
}

function evaluateContourCP003Proof() {
  const proofFiles = [
    CONTOUR_C_P0_03_GUARD_SCRIPT,
    CONTOUR_C_P0_03_TEST_PATH,
    CONTOUR_C_P0_03_REQUIRED_GATES_PATH,
    CONTOUR_C_P0_03_WAIVED_GATES_PATH,
    CONTOUR_C_P0_03_POSITIVE_REQUIRED_GATES,
    CONTOUR_C_P0_03_POSITIVE_WAIVERS,
    CONTOUR_C_P0_03_POSITIVE_WAIVED_REQUIRED_GATES,
    CONTOUR_C_P0_03_POSITIVE_WAIVED_WAIVERS,
    CONTOUR_C_P0_03_NEGATIVE_REQUIRED_GATES,
    CONTOUR_C_P0_03_NEGATIVE_WAIVERS,
  ];
  const ruleExists = proofFiles.every((filePath) => fs.existsSync(filePath));

  let positivePass = 0;
  let positiveWaivedPass = 0;
  let negativeFail = 0;
  let negativeRuleIdMatch = 0;
  let negativeMissingStatusMatch = 0;
  let negativeStdout = '';

  if (ruleExists) {
    const positive = spawnSync(
      process.execPath,
      [
        CONTOUR_C_P0_03_GUARD_SCRIPT,
        '--required-gates',
        CONTOUR_C_P0_03_REQUIRED_GATES_PATH,
        '--waived-gates',
        CONTOUR_C_P0_03_WAIVED_GATES_PATH,
      ],
      { encoding: 'utf8', shell: false },
    );
    positivePass = positive.status === 0 ? 1 : 0;

    const positiveWaived = spawnSync(
      process.execPath,
      [
        CONTOUR_C_P0_03_GUARD_SCRIPT,
        '--required-gates',
        CONTOUR_C_P0_03_POSITIVE_WAIVED_REQUIRED_GATES,
        '--waived-gates',
        CONTOUR_C_P0_03_POSITIVE_WAIVED_WAIVERS,
        '--now-iso',
        '2030-01-01T00:00:00.000Z',
      ],
      { encoding: 'utf8', shell: false },
    );
    const positiveWaivedStdout = typeof positiveWaived.stdout === 'string' ? positiveWaived.stdout : '';
    positiveWaivedPass = positiveWaived.status === 0 && positiveWaivedStdout.split(/\r?\n/).includes('STATUS=WAIVED') ? 1 : 0;

    const negative = spawnSync(
      process.execPath,
      [
        CONTOUR_C_P0_03_GUARD_SCRIPT,
        '--required-gates',
        CONTOUR_C_P0_03_NEGATIVE_REQUIRED_GATES,
        '--waived-gates',
        CONTOUR_C_P0_03_NEGATIVE_WAIVERS,
        '--now-iso',
        '2030-01-01T00:00:00.000Z',
      ],
      { encoding: 'utf8', shell: false },
    );
    negativeStdout = typeof negative.stdout === 'string' ? negative.stdout : '';
    negativeFail = negative.status !== 0 ? 1 : 0;
    const lines = negativeStdout.split(/\r?\n/);
    negativeRuleIdMatch = lines.includes(`RULE_ID=${CONTOUR_C_P0_03_RULE_ID}`) ? 1 : 0;
    negativeMissingStatusMatch = lines.includes('STATUS=MISSING') ? 1 : 0;
  }

  const positivePassOk = positivePass === 1 && positiveWaivedPass === 1 ? 1 : 0;
  const proofOk = ruleExists && positivePassOk === 1 && negativeFail === 1 && negativeRuleIdMatch === 1 && negativeMissingStatusMatch === 1 ? 1 : 0;

  console.log(`C_P0_03_RULE_ID=${CONTOUR_C_P0_03_RULE_ID}`);
  console.log(`C_P0_03_RULE_EXISTS=${ruleExists ? 1 : 0}`);
  console.log(`C_P0_03_NEGATIVE_FAIL_OK=${negativeFail}`);
  console.log(`C_P0_03_POSITIVE_PASS_OK=${positivePassOk}`);
  console.log(`C_P0_03_PROOF_OK=${proofOk}`);

  return proofOk;
}

function evaluateC4ProductStepProof() {
  const proofFiles = [
    C4_PRODUCT_STEP_GUARD_SCRIPT,
    C4_PRODUCT_STEP_TEST_PATH,
    C4_PRODUCT_STEP_DOD_PATH,
  ];
  const filesPresent = proofFiles.every((filePath) => fs.existsSync(filePath));

  let scenarioPass = 0;
  let stepIdMatch = 0;
  if (filesPresent) {
    const scenario = spawnSync(
      process.execPath,
      [C4_PRODUCT_STEP_GUARD_SCRIPT],
      { encoding: 'utf8', shell: false },
    );
    const stdout = typeof scenario.stdout === 'string' ? scenario.stdout : '';
    const lines = stdout.split(/\r?\n/);
    scenarioPass = scenario.status === 0 && lines.includes('RESULT=PASS') ? 1 : 0;
    stepIdMatch = lines.includes(`STEP_ID=${C4_PRODUCT_STEP_ID}`) ? 1 : 0;
  }

  const proofOk = filesPresent && scenarioPass === 1 && stepIdMatch === 1 ? 1 : 0;
  console.log(`C4_PRODUCT_STEP_ID=${C4_PRODUCT_STEP_ID}`);
  console.log(`C4_PRODUCT_STEP_PROOF_OK=${proofOk}`);
  return proofOk;
}

function resolveContourCStatus() {
  let status = 'OPEN';
  if (fs.existsSync(CONTOUR_C_README_PATH)) {
    const readme = readText(CONTOUR_C_README_PATH);
    const match = readme.match(/^STATUS:\s*(OPEN|CLOSED)\s*$/m);
    if (match && match[1]) status = match[1];
  }
  console.log(`CONTOUR_C_STATUS=${status}`);
  return status;
}

function readContourCCloseP0Count() {
  if (!fs.existsSync(CONTOUR_C_CLOSE_REPORT_PATH)) return 3;
  const report = readText(CONTOUR_C_CLOSE_REPORT_PATH);
  const match = report.match(/^P0_COUNT=(\d+)\s*$/m);
  if (!match) return 3;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 3;
}

function checkContourCClosedMutations(status) {
  if (status !== 'CLOSED') {
    console.log('CONTOUR_C_CLOSED_MUTATION_CHECK=0');
    console.log('CONTOUR_C_CLOSED_MUTATION=0');
    console.log('CONTOUR_C_CLOSED_MUTATION_VIOLATIONS=[]');
    return { fail: 0, reason: '', violations: [] };
  }

  const diff = spawnSync(
    'git',
    ['diff', '--name-only', 'HEAD', '--', 'docs/OPS/CONTOUR_C'],
    { encoding: 'utf8', shell: false },
  );

  if (diff.status !== 0) {
    console.log('CONTOUR_C_CLOSED_MUTATION_CHECK=1');
    console.log('CONTOUR_C_CLOSED_MUTATION=1');
    console.log('CONTOUR_C_CLOSED_MUTATION_VIOLATIONS=["GIT_DIFF_FAILED"]');
    return { fail: 1, reason: 'C_CONTOUR_C_CLOSED_MUTATION', violations: ['GIT_DIFF_FAILED'] };
  }

  const changed = (typeof diff.stdout === 'string' ? diff.stdout : '')
    .split(/\r?\n/)
    .map((line) => line.trim().replaceAll('\\', '/'))
    .filter((line) => line.length > 0);

  const violations = changed.filter((path) => !CONTOUR_C_CLOSED_MUTATION_WHITELIST.has(path)).sort();
  const fail = violations.length > 0 ? 1 : 0;
  console.log('CONTOUR_C_CLOSED_MUTATION_CHECK=1');
  console.log(`CONTOUR_C_CLOSED_MUTATION=${fail}`);
  console.log(`CONTOUR_C_CLOSED_MUTATION_VIOLATIONS=${JSON.stringify(violations)}`);
  return { fail, reason: fail ? 'C_CONTOUR_C_CLOSED_MUTATION' : '', violations };
}

function computeContourCExitImplementedP0Signal(gatingApplicableItems, auditCheckIds, requiredProofByInvariant) {
  const required = 3;
  const ids = [];

  for (const it of Array.isArray(gatingApplicableItems) ? gatingApplicableItems : []) {
    if (!it || typeof it !== 'object' || Array.isArray(it)) continue;
    if (it.contour !== 'C') continue;
    if (it.severity !== 'P0') continue;

    if (it.maturity !== 'implemented') continue;
    const checkId = it.checkId;
    if (typeof checkId !== 'string' || checkId.length === 0) continue;
    if (!auditCheckIds.has(checkId)) continue;

    const invariantId = it.invariantId;
    if (typeof invariantId !== 'string' || invariantId.length === 0) continue;
    if (requiredProofByInvariant && Object.prototype.hasOwnProperty.call(requiredProofByInvariant, invariantId)) {
      if (requiredProofByInvariant[invariantId] !== 1) continue;
    }
    ids.push(invariantId);
  }

  const uniqSorted = [...new Set(ids)].sort();
  const count = uniqSorted.length;
  const ok = count >= required ? 1 : 0;

  console.log(`CONTOUR_C_EXIT_IMPLEMENTED_P0_COUNT=${count}`);
  console.log(`CONTOUR_C_EXIT_IMPLEMENTED_P0_REQUIRED=${required}`);
  console.log(`CONTOUR_C_EXIT_IMPLEMENTED_P0_OK=${ok}`);
  console.log(`CONTOUR_C_EXIT_IMPLEMENTED_P0_IDS=${JSON.stringify(uniqSorted)}`);
  return { count, required, ok, ids: uniqSorted };
}

function checkContourCDocsContractsPresence() {
  const expected = [
    'docs/CONTRACTS/runtime-effects.contract.md',
    'docs/CONTRACTS/runtime-execution.contract.md',
    'docs/CONTRACTS/runtime-queue.contract.md',
    'docs/CONTRACTS/runtime-trace.contract.md',
  ].sort();

  const present = expected.filter((p) => fs.existsSync(p));
  const missing = expected.filter((p) => !fs.existsSync(p));
  const missingCount = missing.length;
  const ok = missingCount === 0 ? 1 : 0;

  console.log(`CONTOUR_C_DOCS_CONTRACTS_EXPECTED=${JSON.stringify(expected)}`);
  console.log(`CONTOUR_C_DOCS_CONTRACTS_PRESENT=${JSON.stringify(present)}`);
  console.log(`CONTOUR_C_DOCS_CONTRACTS_PRESENT_COUNT=${present.length}`);
  console.log(`CONTOUR_C_DOCS_CONTRACTS_MISSING=${JSON.stringify(missing)}`);
  console.log(`CONTOUR_C_DOCS_CONTRACTS_MISSING_COUNT=${missingCount}`);
  console.log(`CONTOUR_C_DOCS_CONTRACTS_OK=${ok}`);

  return { ok };
}

function checkContourCContractsFrozenEntrypoint(targetParsed) {
  const gate = targetParsed && targetParsed.token === 'v1.3';
  if (!gate) return null;

  const entrypointPath = 'docs/CONTRACTS/CONTOUR-C-CONTRACTS-FROZEN.md';
  const entrypointExists = fs.existsSync(entrypointPath) ? 1 : 0;

  const expected = [
    'docs/CONTRACTS/runtime-effects.contract.md',
    'docs/CONTRACTS/runtime-execution.contract.md',
    'docs/CONTRACTS/runtime-queue.contract.md',
    'docs/CONTRACTS/runtime-trace.contract.md',
  ];

  let observed = [];
  if (entrypointExists === 1) {
    const text = readText(entrypointPath);
    const listed = (text.match(/^\-\s+docs\/CONTRACTS\/\S+\.contract\.md\s*$/gm) || [])
      .map((l) => l.replace(/^\-\s+/, '').trim());
    const uniqListed = [...new Set(listed)].sort();
    observed = uniqListed.filter((p) => fs.existsSync(p));
  }

  const missing = expected.filter((p) => !observed.includes(p)).sort();
  const extra = observed.filter((p) => !expected.includes(p)).sort();
  const ok = entrypointExists === 1 && missing.length === 0 && extra.length === 0 ? 1 : 0;

  console.log(`CONTOUR_C_CONTRACTS_FROZEN_ENTRYPOINT_PATH=${entrypointPath}`);
  console.log(`CONTOUR_C_CONTRACTS_FROZEN_ENTRYPOINT_EXISTS=${entrypointExists}`);
  console.log(`CONTOUR_C_CONTRACTS_FROZEN_EXPECTED=${JSON.stringify(expected)}`);
  console.log(`CONTOUR_C_CONTRACTS_FROZEN_OBSERVED=${JSON.stringify(observed)}`);
  console.log(`CONTOUR_C_CONTRACTS_FROZEN_MISSING=${JSON.stringify(missing)}`);
  console.log(`CONTOUR_C_CONTRACTS_FROZEN_EXTRA=${JSON.stringify(extra)}`);
  console.log(`CONTOUR_C_CONTRACTS_FROZEN_OK=${ok}`);
  console.log(`CONTOUR_C_CONTRACTS_FROZEN_EXPECTED_COUNT=${expected.length}`);
  console.log(`CONTOUR_C_CONTRACTS_FROZEN_OBSERVED_COUNT=${observed.length}`);
  console.log(`CONTOUR_C_CONTRACTS_FROZEN_MISSING_COUNT=${missing.length}`);
  console.log(`CONTOUR_C_CONTRACTS_FROZEN_EXTRA_COUNT=${extra.length}`);

  return { ok };
}

function checkContourCSrcContractsSkeletonDiagnostics(targetParsed) {
  const gate = targetParsed && targetParsed.token === 'v1.3';
  if (!gate) return null;

  const expected = [
    'src/contracts/runtime/index.ts',
    'src/contracts/runtime/runtime-effects.contract.ts',
    'src/contracts/runtime/runtime-execution.contract.ts',
    'src/contracts/runtime/runtime-queue.contract.ts',
    'src/contracts/runtime/runtime-trace.contract.ts',
  ].sort();

  const missing = expected.filter((p) => !fs.existsSync(p)).sort();
  const ok = missing.length === 0 ? 1 : 0;

  console.log(`CONTOUR_C_SRC_CONTRACTS_EXPECTED=${JSON.stringify(expected)}`);
  console.log(`CONTOUR_C_SRC_CONTRACTS_EXPECTED_COUNT=${expected.length}`);
  console.log(`CONTOUR_C_SRC_CONTRACTS_MISSING=${JSON.stringify(missing)}`);
  console.log(`CONTOUR_C_SRC_CONTRACTS_MISSING_COUNT=${missing.length}`);
  console.log(`CONTOUR_C_SRC_CONTRACTS_OK=${ok}`);

  return { ok };
}

function checkSsotBoundaryGuard(effectiveMode) {
  const cmd = process.execPath;
  const args = ['scripts/guards/ops-mvp-boundary.mjs'];
  const r = spawnSync(cmd, args, { encoding: 'utf8' });

  const stdout = typeof r.stdout === 'string' ? r.stdout : '';
  const exitCode = typeof r.status === 'number' ? r.status : 2;

  let declaredCount = 0;
  let missingCount = 0;

  for (const line of stdout.split(/\r?\n/)) {
    const m1 = line.match(/^SSOT_DECLARED_COUNT=(\d+)\s*$/);
    if (m1) declaredCount = Number(m1[1]);
    const m2 = line.match(/^SSOT_MISSING_COUNT=(\d+)\s*$/);
    if (m2) missingCount = Number(m2[1]);
  }

  const enforced = exitCode === 0 ? 1 : 0;

  console.log('SSOT_BOUNDARY_GUARD_RAN=1');
  console.log(`SSOT_DECLARED_COUNT=${Number.isFinite(declaredCount) ? declaredCount : 0}`);
  console.log(`SSOT_MISSING_COUNT=${Number.isFinite(missingCount) ? missingCount : 0}`);
  console.log(`SSOT_BOUNDARY_ENFORCED=${enforced}`);

  if (exitCode !== 0) {
    console.log(`SSOT_BOUNDARY_GUARD_EXIT=${exitCode}`);
  }

  if (exitCode !== 0 && effectiveMode === 'STRICT') {
    return { level: 'fail', exitCode };
  }
  if (exitCode !== 0) {
    return { level: 'warn', exitCode };
  }
  return { level: 'ok', exitCode };
}

function tryReadJsonWithSynthOverride(filePath) {
  if (OPS_SYNTH_OVERRIDE_STATE && OPS_SYNTH_OVERRIDE_STATE.enabled && OPS_SYNTH_OVERRIDE_STATE.jsonByPath.has(filePath)) {
    return OPS_SYNTH_OVERRIDE_STATE.jsonByPath.get(filePath);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function computeStrictLieClass01Violations(inventoryIndexItems, debtRegistry) {
  const violations = [];
  const debtLinkageDefined = 1;

  for (const idx of inventoryIndexItems) {
    if (!idx || typeof idx !== 'object' || Array.isArray(idx)) continue;
    if (idx.requiresDeclaredEmpty !== true) continue;

    const inventoryId = typeof idx.inventoryId === 'string' && idx.inventoryId.length > 0 ? idx.inventoryId : 'unknown';
    const inventoryPath = typeof idx.path === 'string' && idx.path.length > 0 ? idx.path : 'unknown';

    if (!fs.existsSync(inventoryPath)) continue;

    const inv = tryReadJsonWithSynthOverride(inventoryPath);
    if (!inv) continue;
    if (!inv || typeof inv !== 'object' || Array.isArray(inv)) continue;
    if (!Array.isArray(inv.items)) continue;

    const itemsLen = inv.items.length;
    if (itemsLen !== 0) continue;

    if (inventoryPath === 'docs/OPS/DEBT_REGISTRY.json') {
      if (inv.declaredEmpty !== true) {
        violations.push({
          kind: 'declaredEmpty_missing_or_not_true',
          invariantId: '',
          path: inventoryPath,
          detail: `inventoryId=${inventoryId}`,
        });
      }
      continue;
    }

    if (inv.declaredEmpty !== true) {
      violations.push({
        kind: 'declaredEmpty_missing_or_not_true',
        invariantId: '',
        path: inventoryPath,
        detail: `inventoryId=${inventoryId}`,
      });
      continue;
    }

    const hasDebt = hasMatchingActiveDebt(debtRegistry, inventoryPath);
    if (!hasDebt) {
      violations.push({
        kind: 'missing_debt_linkage',
        invariantId: '',
        path: inventoryPath,
        detail: `inventoryId=${inventoryId}`,
      });
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const v of violations) {
    const kind = v && typeof v.kind === 'string' ? v.kind : '';
    const invariantId = v && typeof v.invariantId === 'string' ? v.invariantId : '';
    const path = v && typeof v.path === 'string' ? v.path : '';
    const detail = v && typeof v.detail === 'string' ? v.detail : '';
    const key = `${kind}\t${invariantId}\t${path}\t${detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({
      kind,
      invariantId,
      path,
      detail,
    });
  }

  deduped.sort((a, b) => {
    const aId = typeof a.invariantId === 'string' ? a.invariantId : null;
    const bId = typeof b.invariantId === 'string' ? b.invariantId : null;
    const aPath = typeof a.path === 'string' ? a.path : null;
    const bPath = typeof b.path === 'string' ? b.path : null;

    if (aId !== null && bId !== null && aPath !== null && bPath !== null) {
      if (aId !== bId) return aId < bId ? -1 : 1;
      if (aPath !== bPath) return aPath < bPath ? -1 : 1;
      if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
      if (a.detail !== b.detail) return a.detail < b.detail ? -1 : 1;
      return 0;
    }

    const aStr = JSON.stringify(a);
    const bStr = JSON.stringify(b);
    if (aStr === bStr) return 0;
    return aStr < bStr ? -1 : 1;
  });

  return { violations: deduped, debtLinkageDefined };
}

function computeStrictLieClass02Violations(registryItems) {
  const regById = new Map();
  for (const it of registryItems) {
    if (!it || typeof it !== 'object' || Array.isArray(it)) continue;
    const id = it.invariantId;
    if (typeof id !== 'string' || id.length === 0) continue;
    regById.set(id, it);
  }

  const enfPath = 'docs/OPS/CONTOUR-C-ENFORCEMENT.json';
  const enf = tryReadJsonWithSynthOverride(enfPath);

  const enfById = new Map();
  if (enf && typeof enf === 'object' && !Array.isArray(enf) && Array.isArray(enf.items)) {
    for (const it of enf.items) {
      if (!it || typeof it !== 'object' || Array.isArray(it)) continue;
      const id = it.invariantId;
      if (typeof id !== 'string' || id.length === 0) continue;
      enfById.set(id, it);
    }
  }

  const violations = [];
  for (const [id, r] of regById.entries()) {
    if (!enfById.has(id)) continue;
    const e = enfById.get(id);
    const regSeverity = typeof r.severity === 'string' && r.severity.length > 0 ? r.severity : '(missing)';
    const enfSeverity = e && typeof e.severity === 'string' && e.severity.length > 0 ? e.severity : '(missing)';
    if (regSeverity !== enfSeverity) {
      violations.push({
        kind: 'severity_mismatch',
        invariantId: id,
        path: enfPath,
        detail: `severity:${regSeverity}!=${enfSeverity}`,
      });
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const v of violations) {
    const kind = v && typeof v.kind === 'string' ? v.kind : '';
    const invariantId = v && typeof v.invariantId === 'string' ? v.invariantId : '';
    const path = v && typeof v.path === 'string' ? v.path : '';
    const detail = v && typeof v.detail === 'string' ? v.detail : '';
    const key = `${kind}\t${invariantId}\t${path}\t${detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({
      kind,
      invariantId,
      path,
      detail,
    });
  }

  deduped.sort((a, b) => {
    const aId = typeof a.invariantId === 'string' ? a.invariantId : null;
    const bId = typeof b.invariantId === 'string' ? b.invariantId : null;
    const aPath = typeof a.path === 'string' ? a.path : null;
    const bPath = typeof b.path === 'string' ? b.path : null;

    if (aId !== null && bId !== null && aPath !== null && bPath !== null) {
      if (aId !== bId) return aId < bId ? -1 : 1;
      if (aPath !== bPath) return aPath < bPath ? -1 : 1;
      if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
      if (a.detail !== b.detail) return a.detail < b.detail ? -1 : 1;
      return 0;
    }

    const aStr = JSON.stringify(a);
    const bStr = JSON.stringify(b);
    if (aStr === bStr) return 0;
    return aStr < bStr ? -1 : 1;
  });

  return { violations: deduped };
}

function checkStrictLieClasses(effectiveMode, inventoryIndexItems, debtRegistry, registryItems) {
  const c1 = computeStrictLieClass01Violations(inventoryIndexItems, debtRegistry);
  const c2 = computeStrictLieClass02Violations(registryItems);

  console.log(`STRICT_LIE_CLASS_01_DEBT_LINKAGE_DEFINED=${c1.debtLinkageDefined}`);
  console.log(`STRICT_LIE_CLASS_01_VIOLATIONS=${JSON.stringify(c1.violations)}`);
  console.log(`STRICT_LIE_CLASS_01_VIOLATIONS_COUNT=${c1.violations.length}`);
  console.log(`STRICT_LIE_CLASS_02_VIOLATIONS=${JSON.stringify(c2.violations)}`);
  console.log(`STRICT_LIE_CLASS_02_VIOLATIONS_COUNT=${c2.violations.length}`);

  const ok = c1.violations.length === 0 && c2.violations.length === 0 ? 1 : 0;
  console.log(`STRICT_LIE_CLASSES_OK=${ok}`);

  const hasAny = ok === 0;
  if (effectiveMode === 'STRICT' && hasAny) return { level: 'fail', ok, class01Count: c1.violations.length, class02Count: c2.violations.length };
  if (hasAny) return { level: 'warn', ok, class01Count: c1.violations.length, class02Count: c2.violations.length };
  return { level: 'ok', ok, class01Count: c1.violations.length, class02Count: c2.violations.length };
}

function run() {
  for (const filePath of REQUIRED_FILES) {
    if (!fs.existsSync(filePath)) {
      die('ERR_DOCTOR_MISSING_FILE', filePath, 'missing');
    }
  }

  const { targetBaselineVersion, invalidEnvToken } = resolveTargetBaselineVersion();
  const supportedParsed = parseVersionToken(
    SUPPORTED_OPS_CANON_VERSION,
    'SUPPORTED_OPS_CANON_VERSION',
    'invalid_version_token',
  );
  const targetParsed = parseVersionToken(
    targetBaselineVersion,
    'docs/OPS/INVARIANTS_REGISTRY.json',
    'opsCanonVersion_invalid_version_token',
  );

  console.log(`TARGET_BASELINE_VERSION=${targetParsed.token}`);
  console.log('POST_COMMIT_PROOF_CMD=git show --name-only --pretty=format: HEAD');
  console.log('POST_COMMIT_PROOF_EXPECTED_PATH=scripts/doctor.mjs');

  const synthState = initSynthOverrideState();
  if (synthState && synthState.enabled && synthState.parseOk === 0) {
    die('ERR_DOCTOR_INVALID_SHAPE', 'OPS_SYNTH_OVERRIDE_JSON', 'ops_synth_override_parse_failed');
  }
  if (synthState && synthState.enabled && synthState.applyOk === 0) {
    die('ERR_DOCTOR_INVALID_SHAPE', 'OPS_SYNTH_OVERRIDE_JSON', 'ops_synth_override_apply_failed');
  }

  if (invalidEnvToken !== null) {
    console.error(`CHECKS_BASELINE_VERSION=${invalidEnvToken}`);
    die('ERR_DOCTOR_INVALID_SHAPE', 'CHECKS_BASELINE_VERSION', 'invalid_version_token');
  }

  if (compareVersion(targetParsed, supportedParsed) !== 0) {
    console.error(`SUPPORTED_OPS_CANON_VERSION=${supportedParsed.token}`);
    die('ERR_DOCTOR_INVALID_SHAPE', 'SUPPORTED_OPS_CANON_VERSION', 'baseline_version_mismatch');
  }

  const auditChecksPath = 'docs/OPS/AUDIT_CHECKS.json';
  const auditCheckIds = parseAuditChecks(auditChecksPath);

  const registryPath = 'docs/OPS/INVARIANTS_REGISTRY.json';
  const registryItems = parseInvariantsRegistry(registryPath);

  const auditPath = 'docs/OPS/AUDIT-MATRIX-v1.1.md';
  const auditStat = fs.statSync(auditPath);
  if (auditStat.size <= 0) {
    die('ERR_DOCTOR_EMPTY_MATRIX', auditPath, 'empty');
  }
  const auditText = readText(auditPath);

  const matrixMode = parseMatrixModeBlock(auditText);

  const debtPath = 'docs/OPS/DEBT_REGISTRY.json';
  const debtRegistry = parseDebtRegistry(debtPath);

  const effectiveMode = process.env.EFFECTIVE_MODE === 'STRICT' ? 'STRICT' : 'TRANSITIONAL';
  const ssotBoundary = checkSsotBoundaryGuard(effectiveMode);

  const inventoryIndexPath = 'docs/OPS/INVENTORY_INDEX.json';
  const inventoryIndexItems = parseInventoryIndex(inventoryIndexPath);
  const strictLie = checkStrictLieClasses(effectiveMode, inventoryIndexItems, debtRegistry, registryItems);

  const indexDiag = computeIdListDiagnostics(inventoryIndexItems.map((it) => it.inventoryId));
  console.log(`INDEX_INVENTORY_IDS_SORTED=${indexDiag.sortedOk ? 1 : 0}`);
  console.log(`INDEX_INVENTORY_IDS_DUPES=${indexDiag.dupes ? 1 : 0}`);
  console.log(`INDEX_INVENTORY_IDS_VIOLATIONS_COUNT=${indexDiag.violations.length}`);
  console.log(`INDEX_INVENTORY_IDS_VIOLATIONS=${JSON.stringify(indexDiag.violations)}`);

  const registryDiag = computeIdListDiagnostics(registryItems.map((it) => it.invariantId));
  console.log(`REGISTRY_INVARIANT_IDS_SORTED=${registryDiag.sortedOk ? 1 : 0}`);
  console.log(`REGISTRY_INVARIANT_IDS_DUPES=${registryDiag.dupes ? 1 : 0}`);
  console.log(`REGISTRY_INVARIANT_IDS_VIOLATIONS_COUNT=${registryDiag.violations.length}`);
  console.log(`REGISTRY_INVARIANT_IDS_VIOLATIONS=${JSON.stringify(registryDiag.violations)}`);

  const inventoryCheck = checkInventoryEmptiness(inventoryIndexItems, debtRegistry);
  if (inventoryCheck.violations.length > 0) {
    die('ERR_DOCTOR_INVALID_SHAPE', inventoryIndexPath, 'inventory_empty_violations_present');
  }

  const runtimeSignalsEval = checkRuntimeSignalsInventory();

  const queuePath = 'docs/OPS/QUEUE_POLICIES.json';
  const queue = readJson(queuePath);
  assertObjectShape(queuePath, queue);
  const queuePolicy = checkQueuePolicies(matrixMode, debtRegistry, queue.items);

  const capsPath = 'docs/OPS/CAPABILITIES_MATRIX.json';
  const caps = readJson(capsPath);
  assertObjectShape(capsPath, caps);
  assertItemsAreObjects(capsPath, caps.items);
  assertRequiredKeys(capsPath, caps.items, [
    'platformId',
    'capabilities',
  ]);
  for (let i = 0; i < caps.items.length; i += 1) {
    const capabilities = caps.items[i].capabilities;
    if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) {
      die('ERR_DOCTOR_INVALID_SHAPE', capsPath, `item_${i}_capabilities_must_be_object`);
    }
  }

  const capsPolicy = checkCapabilitiesMatrix(matrixMode, debtRegistry, caps.items);
  const publicSurface = checkPublicSurface(matrixMode, debtRegistry);
  const eventsAppend = checkEventsAppendOnly(matrixMode, debtRegistry);
  const snapshotPolicy = checkTextSnapshotSpec(matrixMode, debtRegistry);
  const effectsIdemp = checkEffectsIdempotency(matrixMode, debtRegistry);
  const ondiskPolicy = checkOndiskArtifacts(matrixMode, debtRegistry);

  const debtTtl = checkDebtTtl(debtRegistry, matrixMode.mode);
  const coreDet = checkCoreDeterminism(matrixMode, debtRegistry);
  const coreBoundary = checkCoreBoundary(matrixMode, debtRegistry);

  console.log(coreBoundary.status);
  console.log(coreDet.status);
  console.log(queuePolicy.status);
  console.log(capsPolicy.status);
  console.log(publicSurface.status);
  console.log(eventsAppend.status);
  console.log(snapshotPolicy.status);
  console.log(effectsIdemp.status);
  console.log(ondiskPolicy.status);
  console.log(debtTtl.status);

  const gating = applyIntroducedInGating(registryItems, targetParsed);
  const contourCEnforcement = checkContourCEnforcementInventory(gating.applicableItems, targetParsed);
  const contourCCompleteness = computeContourCEnforcementCompleteness(gating.applicableItems, contourCEnforcement.planIds);
  const p001ProofOk = evaluateContourCP001Proof();
  const p002ProofOk = evaluateContourCP002Proof();
  const p003ProofOk = evaluateContourCP003Proof();
  const c4ProductStepProofOk = evaluateC4ProductStepProof();
  const requiredProofByInvariant = {
    C_RUNTIME_NO_BYPASS_CORE: p001ProofOk,
    C_RUNTIME_SINGLE_WRITER_ORDERING_KEY: p002ProofOk,
    C_RUNTIME_TRACE_STRUCTURED_DIAGNOSTICS: p003ProofOk,
  };
  const contourCExit = computeContourCExitImplementedP0Signal(gating.applicableItems, auditCheckIds, requiredProofByInvariant);
  computeEffectiveEnforcementReport(gating.applicableItems, auditCheckIds, debtRegistry, effectiveMode, gating.ignoredInvariantIds);
  const registryEval = evaluateRegistry(gating.applicableItems, auditCheckIds);
  const docsContracts = checkContourCDocsContractsPresence();
  const frozenContracts = checkContourCContractsFrozenEntrypoint(targetParsed);
  checkContourCSrcContractsSkeletonDiagnostics(targetParsed);
  const p001DeclaredImplemented = gating.applicableItems.some((item) => item && item.invariantId === 'C_RUNTIME_NO_BYPASS_CORE' && item.maturity === 'implemented');
  const p002DeclaredImplemented = gating.applicableItems.some((item) => item && item.invariantId === 'C_RUNTIME_SINGLE_WRITER_ORDERING_KEY' && item.maturity === 'implemented');
  const p003DeclaredImplemented = gating.applicableItems.some((item) => item && item.invariantId === 'C_RUNTIME_TRACE_STRUCTURED_DIAGNOSTICS' && item.maturity === 'implemented');
  const contourCStatus = resolveContourCStatus();
  const contourCClosedMutations = checkContourCClosedMutations(contourCStatus);
  const contourCClosedP0CountLock = readContourCCloseP0Count();
  const contourCClosedP0Mutation = contourCStatus === 'CLOSED' && contourCExit.count > contourCClosedP0CountLock ? 1 : 0;
  console.log(`CONTOUR_C_CLOSED_P0_COUNT_LOCK=${contourCClosedP0CountLock}`);
  console.log(`CONTOUR_C_CLOSED_P0_LOCK_OK=${contourCClosedP0Mutation === 0 ? 1 : 0}`);
  if (contourCClosedMutations.fail === 1 || contourCClosedP0Mutation === 1) {
    console.log('DOCTOR_FAIL_REASON=C_CONTOUR_C_CLOSED_MUTATION');
  }

  const hasFail = coreBoundary.level === 'fail'
    || coreDet.level === 'fail'
    || queuePolicy.level === 'fail'
    || capsPolicy.level === 'fail'
    || publicSurface.level === 'fail'
    || eventsAppend.level === 'fail'
    || snapshotPolicy.level === 'fail'
    || effectsIdemp.level === 'fail'
    || ondiskPolicy.level === 'fail'
    || debtTtl.level === 'fail'
    || contourCEnforcement.forceFail === true
    || ssotBoundary.level === 'fail'
    || strictLie.level === 'fail'
    || (p001DeclaredImplemented && p001ProofOk !== 1)
    || (p002DeclaredImplemented && p002ProofOk !== 1)
    || (p003DeclaredImplemented && p003ProofOk !== 1)
    || c4ProductStepProofOk !== 1
    || contourCClosedMutations.fail === 1
    || contourCClosedP0Mutation === 1;
  const hasWarn = coreBoundary.level === 'warn'
    || coreDet.level === 'warn'
    || queuePolicy.level === 'warn'
    || capsPolicy.level === 'warn'
    || publicSurface.level === 'warn'
    || eventsAppend.level === 'warn'
    || snapshotPolicy.level === 'warn'
    || effectsIdemp.level === 'warn'
    || ondiskPolicy.level === 'warn'
    || debtTtl.level === 'warn'
    || runtimeSignalsEval.level === 'warn'
    || registryEval.level === 'warn'
    || contourCEnforcement.level === 'warn'
    || contourCCompleteness.missingCount > 0
    || contourCCompleteness.extraCount > 0
    || docsContracts.ok === 0
    || (frozenContracts && frozenContracts.ok === 0)
    || ssotBoundary.level === 'warn'
    || strictLie.level === 'warn';

  const final = hasFail
    ? { status: 'DOCTOR_FAIL', exitCode: 1 }
    : hasWarn
      ? { status: 'DOCTOR_WARN', exitCode: 0 }
      : { status: 'DOCTOR_OK', exitCode: 0 };

  const boundaryExitCode = ssotBoundary && typeof ssotBoundary.exitCode === 'number' ? ssotBoundary.exitCode : 2;
  const strictLieOk = strictLie && typeof strictLie.ok === 'number' ? strictLie.ok : 0;
  const strictLieClass01Count = strictLie && typeof strictLie.class01Count === 'number' ? strictLie.class01Count : 0;
  const strictLieClass02Count = strictLie && typeof strictLie.class02Count === 'number' ? strictLie.class02Count : 0;

  const currentWaveOk = boundaryExitCode === 0
    && strictLieOk === 1
    && final.exitCode === 0
    && strictLieClass01Count === 0
    && strictLieClass02Count === 0 ? 1 : 0;

  let currentWaveFailReason = '';
  if (boundaryExitCode !== 0) currentWaveFailReason = 'BOUNDARY_GUARD_FAILED';
  else if (strictLieOk !== 1) currentWaveFailReason = 'STRICT_LIE_CLASSES_NOT_OK';
  else if (contourCClosedMutations.fail === 1 || contourCClosedP0Mutation === 1) currentWaveFailReason = 'C_CONTOUR_C_CLOSED_MUTATION';
  else if (final.exitCode !== 0) currentWaveFailReason = 'DOCTOR_FAIL';

  console.log('CURRENT_WAVE_GUARD_RAN=1');
  console.log(`CURRENT_WAVE_STOP_CONDITION_OK=${currentWaveOk}`);
  console.log(`CURRENT_WAVE_STOP_CONDITION_FAIL_REASON=${currentWaveFailReason}`);
  console.log(`CURRENT_WAVE_STRICT_DOCTOR_EXIT=${final.exitCode}`);
  console.log(`CURRENT_WAVE_BOUNDARY_GUARD_EXIT=${boundaryExitCode}`);

  console.log(final.status);
  process.exit(final.exitCode);
}

try {
  run();
} catch (err) {
  const code = err && typeof err === 'object' && 'code' in err ? err.code : 'ERR_DOCTOR_UNKNOWN';
  const file = err && typeof err === 'object' && 'file' in err ? err.file : '(unknown)';
  const reason = err && typeof err === 'object' && 'reason' in err ? err.reason : 'unknown';
  console.error(`${code} ${file} ${reason}`);
  console.log('DOCTOR_FAIL');
  process.exit(1);
}
