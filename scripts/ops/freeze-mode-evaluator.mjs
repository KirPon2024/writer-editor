const REQUIRED_BASELINE_TOKENS = Object.freeze([
  'CRITICAL_CLAIM_MATRIX_OK',
  'CORE_SOT_EXECUTABLE_OK',
  'COMMAND_SURFACE_ENFORCED_OK',
  'CAPABILITY_ENFORCED_OK',
  'RECOVERY_IO_OK',
  'PERF_BASELINE_OK',
  'GOVERNANCE_STRICT_OK',
  'XPLAT_CONTRACT_OK',
  'HEAD_STRICT_OK',
  'TOKEN_DECLARATION_VALID_OK',
  'SCR_SHARED_CODE_RATIO_OK',
]);

function isFreezeModeEnabled(input) {
  if (typeof input === 'boolean') return input;
  if (typeof input === 'number') return input === 1;
  return String(process.env.FREEZE_MODE || '').trim() === '1';
}

function readTokenAsOne(value) {
  return Number(value) === 1 ? 1 : 0;
}

function readInteger(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^-?\d+$/u.test(value.trim())) {
    return Number.parseInt(value.trim(), 10);
  }
  return NaN;
}

export function evaluateFreezeModeFromRollups(rollups, input = {}) {
  const freezeMode = isFreezeModeEnabled(input.freezeModeEnabled);
  if (!freezeMode) {
    return {
      freezeMode: false,
      ok: true,
      missingTokens: [],
      violations: [],
      FREEZE_MODE_STRICT_OK: 1,
    };
  }

  const source = rollups && typeof rollups === 'object' && !Array.isArray(rollups) ? rollups : {};
  const missingTokens = [];
  for (const token of REQUIRED_BASELINE_TOKENS) {
    if (!Object.prototype.hasOwnProperty.call(source, token) || readTokenAsOne(source[token]) !== 1) {
      missingTokens.push(token);
    }
  }
  missingTokens.sort();

  const violations = [];
  const driftCount = readInteger(source.DRIFT_UNRESOLVED_P0_COUNT);
  const debtTtlValid = readTokenAsOne(source.DEBT_TTL_VALID_OK) === 1;
  if (!Number.isFinite(driftCount) || driftCount !== 0) {
    violations.push('E_FREEZE_MODE_DRIFT_P0_NONZERO');
  }
  if (!debtTtlValid) {
    violations.push('E_FREEZE_MODE_DEBT_TTL_INVALID');
  }

  const ok = missingTokens.length === 0 && violations.length === 0;
  return {
    freezeMode: true,
    ok,
    missingTokens,
    violations,
    FREEZE_MODE_STRICT_OK: ok ? 1 : 0,
  };
}

export {
  REQUIRED_BASELINE_TOKENS,
};
