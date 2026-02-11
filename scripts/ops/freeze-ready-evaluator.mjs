const REQUIRED_FREEZE_READY_TOKENS = Object.freeze([
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

export function evaluateFreezeReadyFromRollups(rollups = {}) {
  const failing = [];
  for (const token of REQUIRED_FREEZE_READY_TOKENS) {
    const value = Number(rollups[token]);
    if (value !== 1) failing.push(token);
  }
  const missingTokens = failing.sort((a, b) => a.localeCompare(b));
  const driftCount = Number.isFinite(Number(rollups.DRIFT_UNRESOLVED_P0_COUNT))
    ? Number(rollups.DRIFT_UNRESOLVED_P0_COUNT)
    : 1;
  const debtTTLValid = Number(rollups.DEBT_TTL_VALID_OK) === 1;
  const freezeReady = missingTokens.length === 0 && driftCount === 0 && debtTTLValid;

  return {
    freezeReady,
    missingTokens,
    driftCount,
    debtTTLValid,
    FREEZE_READY_OK: freezeReady ? 1 : 0,
  };
}

export { REQUIRED_FREEZE_READY_TOKENS };
