import requiredTokenSetLock from '../../docs/OPS/EXECUTION/REQUIRED_TOKEN_SET.json' with { type: 'json' };

const TOKEN_RE = /^[A-Z0-9_]+$/u;

function uniqueSortedTokens(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of values) {
    const token = String(raw || '').trim();
    if (!token || seen.has(token) || !TOKEN_RE.test(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out.sort();
}

function resolveRequiredSetFromLock(lockDoc) {
  if (!lockDoc || typeof lockDoc !== 'object' || Array.isArray(lockDoc)) {
    return {
      valid: false,
      requiredAlways: [],
      requiredFreezeMode: [],
    };
  }
  const freezeReady = lockDoc.freezeReady;
  if (!freezeReady || typeof freezeReady !== 'object' || Array.isArray(freezeReady)) {
    return {
      valid: false,
      requiredAlways: [],
      requiredFreezeMode: [],
    };
  }

  const requiredAlways = uniqueSortedTokens(freezeReady.requiredAlways);
  const requiredFreezeMode = uniqueSortedTokens(freezeReady.requiredFreezeMode);
  const valid = requiredAlways.length > 0 && requiredFreezeMode.length > 0;
  return {
    valid,
    requiredAlways,
    requiredFreezeMode,
  };
}

const resolvedLock = resolveRequiredSetFromLock(requiredTokenSetLock);

const BASELINE_REQUIRED_TOKENS = Object.freeze(resolvedLock.requiredAlways);
const FREEZE_MODE_CONDITIONAL_TOKENS = Object.freeze(resolvedLock.requiredFreezeMode);

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readTokenAsOne(value) {
  if (typeof value === 'number') return value === 1 ? 1 : 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') return value.trim() === '1' ? 1 : 0;
  return 0;
}

function resolveTokenValue(name, rollupsJson, truthTableJson) {
  if (isObjectRecord(rollupsJson) && Object.prototype.hasOwnProperty.call(rollupsJson, name)) {
    return {
      present: true,
      value: readTokenAsOne(rollupsJson[name]),
      source: 'rollups',
    };
  }
  if (isObjectRecord(truthTableJson) && Object.prototype.hasOwnProperty.call(truthTableJson, name)) {
    return {
      present: true,
      value: readTokenAsOne(truthTableJson[name]),
      source: 'truth-table',
    };
  }
  return {
    present: false,
    value: 0,
    source: 'missing',
  };
}

export function getFreezeReadyRequiredTokens() {
  return [...new Set([...BASELINE_REQUIRED_TOKENS, ...FREEZE_MODE_CONDITIONAL_TOKENS])].sort();
}

export function evaluateFreezeReady(input = {}) {
  const freezeMode = input.freezeMode === 1
    || input.freezeMode === true
    || String(input.freezeMode || '').trim() === '1';
  const rollupsJson = isObjectRecord(input.rollupsJson) ? input.rollupsJson : {};
  const truthTableJson = isObjectRecord(input.truthTableJson) ? input.truthTableJson : {};

  const requiredAlways = [...BASELINE_REQUIRED_TOKENS];
  const requiredConditional = freezeMode ? [...FREEZE_MODE_CONDITIONAL_TOKENS] : [];
  const requiredActive = [...new Set([...requiredAlways, ...requiredConditional])].sort();
  const requiredTokens = getFreezeReadyRequiredTokens();

  const missingTokensSet = new Set();
  const failuresSet = new Set();
  const requires = {};

  if (!resolvedLock.valid) {
    failuresSet.add('E_REQUIRED_TOKEN_SET_LOCK_INVALID');
  }

  for (const token of requiredActive) {
    const resolved = resolveTokenValue(token, rollupsJson, truthTableJson);
    requires[token] = {
      present: resolved.present,
      value: resolved.value,
      source: resolved.source,
    };
    if (!resolved.present || resolved.value !== 1) {
      missingTokensSet.add(token);
    }
  }

  if (missingTokensSet.size > 0) {
    failuresSet.add('E_FREEZE_READY_REQUIRED_TOKENS_MISSING');
  }

  if (freezeMode) {
    const headStrict = resolveTokenValue('HEAD_STRICT_OK', rollupsJson, truthTableJson);
    const freezeModeStrict = resolveTokenValue('FREEZE_MODE_STRICT_OK', rollupsJson, truthTableJson);
    if (!headStrict.present || headStrict.value !== 1) {
      failuresSet.add('E_FREEZE_READY_HEAD_STRICT_REQUIRED');
    }
    if (!freezeModeStrict.present || freezeModeStrict.value !== 1) {
      failuresSet.add('E_FREEZE_READY_FREEZE_MODE_STRICT_REQUIRED');
    }
  }

  const missingTokens = [...missingTokensSet].sort();
  const failures = [...failuresSet].sort();
  const ok = missingTokens.length === 0 && failures.length === 0;

  return {
    ok,
    missingTokens,
    failures,
    details: {
      freezeMode: freezeMode ? 1 : 0,
      requiredTokens,
      requiredActive,
      requires,
    },
  };
}

export {
  BASELINE_REQUIRED_TOKENS,
  FREEZE_MODE_CONDITIONAL_TOKENS,
};
