const BASELINE_REQUIRED_TOKENS = Object.freeze([
  'ADAPTERS_ENFORCED_OK',
  'CAPABILITY_ENFORCED_OK',
  'COMMAND_SURFACE_ENFORCED_OK',
  'CORE_SOT_EXECUTABLE_OK',
  'CRITICAL_CLAIM_MATRIX_OK',
  'GOVERNANCE_STRICT_OK',
  'HEAD_STRICT_OK',
  'PERF_BASELINE_OK',
  'RECOVERY_IO_OK',
  'RELEASE_ARTIFACT_SOURCES_OK',
  'TOKEN_DECLARATION_VALID_OK',
  'XPLAT_CONTRACT_MACOS_SIGNING_READY_OK',
]);

const FREEZE_MODE_CONDITIONAL_TOKENS = Object.freeze([
  'FREEZE_MODE_STRICT_OK',
]);

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
