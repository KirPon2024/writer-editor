const {
  MODE_PROMOTION,
  MODE_RELEASE,
  RESULT_FAIL,
  RESULT_PASS,
  RESULT_WARN,
} = require('./menu-artifact-lock.js');

const FAIL_SIGNAL_MENU_RUNTIME_ARTIFACT_DIVERGENCE = 'E_MENU_RUNTIME_ARTIFACT_DIVERGENCE';

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeMode(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (normalized === MODE_PROMOTION) return MODE_PROMOTION;
  return MODE_RELEASE;
}

function evaluateRuntimeMenuSourcePolicy(input = {}) {
  const mode = normalizeMode(input.mode);
  const usesArtifact = input.usesArtifact !== false;
  const usesRawConfig = input.usesRawConfig === true;

  if (!usesArtifact) {
    return {
      ok: false,
      mode,
      result: RESULT_FAIL,
      failSignalCode: FAIL_SIGNAL_MENU_RUNTIME_ARTIFACT_DIVERGENCE,
      reason: 'RUNTIME_MENU_ARTIFACT_REQUIRED',
      fallbackToArtifactOnly: false,
      exitCode: 1,
    };
  }

  if (usesRawConfig) {
    if (mode === MODE_PROMOTION) {
      return {
        ok: false,
        mode,
        result: RESULT_FAIL,
        failSignalCode: FAIL_SIGNAL_MENU_RUNTIME_ARTIFACT_DIVERGENCE,
        reason: 'RUNTIME_MENU_SOURCE_MIX_FORBIDDEN',
        fallbackToArtifactOnly: false,
        exitCode: 1,
      };
    }
    return {
      ok: true,
      mode,
      result: RESULT_WARN,
      failSignalCode: FAIL_SIGNAL_MENU_RUNTIME_ARTIFACT_DIVERGENCE,
      reason: 'RUNTIME_MENU_SOURCE_MIX_FORBIDDEN',
      fallbackToArtifactOnly: true,
      exitCode: 0,
    };
  }

  return {
    ok: true,
    mode,
    result: RESULT_PASS,
    failSignalCode: '',
    reason: '',
    fallbackToArtifactOnly: false,
    exitCode: 0,
  };
}

module.exports = {
  FAIL_SIGNAL_MENU_RUNTIME_ARTIFACT_DIVERGENCE,
  evaluateRuntimeMenuSourcePolicy,
};
