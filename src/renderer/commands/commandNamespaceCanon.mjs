import commandNamespaceCanonDoc from '../../../docs/OPS/STATUS/COMMAND_NAMESPACE_CANON.json' with { type: 'json' };

const CANON_DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;
const CHECK_MODE_RELEASE = 'release';
const CHECK_MODE_PROMOTION = 'promotion';
const NAMESPACE_FAIL_SIGNAL_CODE = 'E_COMMAND_NAMESPACE_DRIFT';
const NAMESPACE_UNKNOWN_FAIL_SIGNAL_CODE = 'E_COMMAND_NAMESPACE_UNKNOWN';

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePrefixList(value) {
  if (!Array.isArray(value)) return [];
  const unique = new Set();
  for (const entry of value) {
    const normalized = normalizeString(entry);
    if (!normalized) continue;
    unique.add(normalized);
  }
  return [...unique];
}

function normalizeAliasMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [rawLegacyId, rawCanonicalId] of Object.entries(value)) {
    const legacyId = normalizeString(rawLegacyId);
    const canonicalId = normalizeString(rawCanonicalId);
    if (!legacyId || !canonicalId) continue;
    out[legacyId] = canonicalId;
  }
  return out;
}

function normalizeDateString(value) {
  const normalized = normalizeString(value);
  if (!CANON_DATE_RE.test(normalized)) return '';
  return normalized;
}

function normalizeCanonDoc(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const aliasPolicy = source.aliasPolicy && typeof source.aliasPolicy === 'object' && !Array.isArray(source.aliasPolicy)
    ? source.aliasPolicy
    : {};
  return Object.freeze({
    canonicalPrefix: normalizeString(source.canonicalPrefix),
    deprecatedPrefixes: Object.freeze(normalizePrefixList(source.deprecatedPrefixes)),
    aliasPolicy: Object.freeze({
      allowDeprecatedInConfigsUntil: normalizeDateString(aliasPolicy.allowDeprecatedInConfigsUntil),
      resolutionRule: normalizeString(aliasPolicy.resolutionRule),
      noNewDeprecatedCommandIds: aliasPolicy.noNewDeprecatedCommandIds === true,
    }),
    aliasMap: Object.freeze(normalizeAliasMap(source.aliasMap)),
  });
}

function resolveTodayDate(options) {
  const rawToday = normalizeString(options && options.today);
  if (CANON_DATE_RE.test(rawToday)) return rawToday;
  return new Date().toISOString().slice(0, 10);
}

function parseBooleanish(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) return false;
  return normalized === '1'
    || normalized === 'true'
    || normalized === 'yes'
    || normalized === 'on';
}

function readProcessEnv(key) {
  if (!key) return '';
  if (typeof process === 'undefined' || !process || !process.env) return '';
  return normalizeString(process.env[key]);
}

function normalizeCheckMode(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (normalized === CHECK_MODE_PROMOTION) return CHECK_MODE_PROMOTION;
  if (normalized === CHECK_MODE_RELEASE) return CHECK_MODE_RELEASE;
  return '';
}

function resolveCheckMode(options = {}) {
  const explicitMode = normalizeCheckMode(options.mode || options.checkMode);
  if (explicitMode) return explicitMode;

  const envMode = normalizeCheckMode(
    readProcessEnv('COMMAND_NAMESPACE_MODE')
    || readProcessEnv('COMMAND_NAMESPACE_CHECK_MODE')
    || readProcessEnv('CHECK_MODE'),
  );
  if (envMode) return envMode;

  const promotionRequested = parseBooleanish(options.promotionMode)
    || parseBooleanish(readProcessEnv('promotionMode'))
    || parseBooleanish(readProcessEnv('PROMOTION_MODE'))
    || parseBooleanish(readProcessEnv('WAVE_PROMOTION_MODE'));
  return promotionRequested ? CHECK_MODE_PROMOTION : CHECK_MODE_RELEASE;
}

function makeNamespaceError(code, reason, details = {}, failSignalCode = NAMESPACE_FAIL_SIGNAL_CODE) {
  return {
    ok: false,
    code,
    reason,
    details: {
      failSignal: failSignalCode,
      failSignalCode,
      ...details,
    },
  };
}

export const COMMAND_NAMESPACE_CANON = normalizeCanonDoc(commandNamespaceCanonDoc);

export function isDeprecatedCommandId(commandId) {
  const normalized = normalizeString(commandId);
  if (!normalized) return '';
  for (const prefix of COMMAND_NAMESPACE_CANON.deprecatedPrefixes) {
    if (normalized.startsWith(prefix)) return prefix;
  }
  return '';
}

export function resolveCommandId(inputId, options = {}) {
  const rawId = normalizeString(inputId);
  const checkMode = resolveCheckMode(options);
  if (!rawId) {
    return makeNamespaceError('E_COMMAND_NOT_FOUND', 'COMMAND_ID_INVALID');
  }

  if (COMMAND_NAMESPACE_CANON.canonicalPrefix && rawId.startsWith(COMMAND_NAMESPACE_CANON.canonicalPrefix)) {
    return {
      ok: true,
      commandId: rawId,
      canonicalCommandId: rawId,
      inputId: rawId,
      deprecated: false,
      deprecatedPrefix: '',
    };
  }

  const directAliasCanonicalCommandId = COMMAND_NAMESPACE_CANON.aliasMap[rawId] || '';
  const deprecatedPrefix = isDeprecatedCommandId(rawId);
  if (!deprecatedPrefix && !directAliasCanonicalCommandId) {
    return makeNamespaceError(
      'COMMAND_NAMESPACE_UNKNOWN',
      'COMMAND_NAMESPACE_UNKNOWN',
      {
        inputId: rawId,
        mode: checkMode,
        modeDisposition: checkMode === CHECK_MODE_PROMOTION ? 'blocking' : 'advisory',
      },
      NAMESPACE_UNKNOWN_FAIL_SIGNAL_CODE,
    );
  }

  const canonicalCommandId = directAliasCanonicalCommandId;
  if (!canonicalCommandId) {
    return makeNamespaceError('E_COMMAND_NAMESPACE_UNKNOWN', 'COMMAND_NAMESPACE_ALIAS_MISSING', {
      inputId: rawId,
      deprecatedPrefix,
    });
  }

  const cutoff = COMMAND_NAMESPACE_CANON.aliasPolicy.allowDeprecatedInConfigsUntil;
  const sunsetExpired = cutoff
    ? resolveTodayDate(options) > cutoff
    : false;
  if (sunsetExpired && checkMode === CHECK_MODE_PROMOTION) {
    const today = resolveTodayDate(options);
    return makeNamespaceError('E_COMMAND_NAMESPACE_UNKNOWN', 'COMMAND_NAMESPACE_SUNSET_EXPIRED', {
      inputId: rawId,
      canonicalCommandId,
      deprecatedPrefix,
      mode: checkMode,
      today,
      allowDeprecatedInConfigsUntil: cutoff,
    });
  }
  if (options && options.enforceSunset === true && cutoff) {
    const today = resolveTodayDate(options);
    if (today > cutoff) {
      return makeNamespaceError('E_COMMAND_NAMESPACE_UNKNOWN', 'COMMAND_NAMESPACE_SUNSET_EXPIRED', {
        inputId: rawId,
        canonicalCommandId,
        deprecatedPrefix,
        mode: checkMode,
        today,
        allowDeprecatedInConfigsUntil: cutoff,
      });
    }
  }

  const warnings = sunsetExpired
    ? [{
      code: 'COMMAND_NAMESPACE_SUNSET_EXPIRED',
      failSignalCode: NAMESPACE_FAIL_SIGNAL_CODE,
      inputId: rawId,
      canonicalCommandId,
      deprecatedPrefix,
      mode: checkMode,
      today: resolveTodayDate(options),
      allowDeprecatedInConfigsUntil: cutoff,
    }]
    : [];

  return {
    ok: true,
    commandId: canonicalCommandId,
    canonicalCommandId,
    inputId: rawId,
    deprecated: true,
    deprecatedPrefix,
    mode: checkMode,
    sunsetExpired,
    warnings,
  };
}
