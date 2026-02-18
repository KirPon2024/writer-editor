const fsSync = require('fs');
const path = require('path');

const CANON_PATH = path.join(__dirname, '..', '..', 'docs', 'OPS', 'STATUS', 'COMMAND_NAMESPACE_CANON.json');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;

let canonCache = null;

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeDate(value) {
  const normalized = normalizeString(value);
  return DATE_RE.test(normalized) ? normalized : '';
}

function normalizePrefixList(value) {
  if (!Array.isArray(value)) return [];
  const unique = new Set();
  for (const item of value) {
    const normalized = normalizeString(item);
    if (!normalized) continue;
    unique.add(normalized);
  }
  return [...unique];
}

function normalizeAliasMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [legacyIdRaw, canonicalIdRaw] of Object.entries(value)) {
    const legacyId = normalizeString(legacyIdRaw);
    const canonicalId = normalizeString(canonicalIdRaw);
    if (!legacyId || !canonicalId) continue;
    out[legacyId] = canonicalId;
  }
  return out;
}

function normalizeCanonDoc(rawDoc) {
  const source = rawDoc && typeof rawDoc === 'object' && !Array.isArray(rawDoc) ? rawDoc : {};
  const aliasPolicy = source.aliasPolicy && typeof source.aliasPolicy === 'object' && !Array.isArray(source.aliasPolicy)
    ? source.aliasPolicy
    : {};
  return Object.freeze({
    canonicalPrefix: normalizeString(source.canonicalPrefix),
    deprecatedPrefixes: Object.freeze(normalizePrefixList(source.deprecatedPrefixes)),
    aliasPolicy: Object.freeze({
      allowDeprecatedInConfigsUntil: normalizeDate(aliasPolicy.allowDeprecatedInConfigsUntil),
      resolutionRule: normalizeString(aliasPolicy.resolutionRule),
      noNewDeprecatedCommandIds: aliasPolicy.noNewDeprecatedCommandIds === true,
    }),
    aliasMap: Object.freeze(normalizeAliasMap(source.aliasMap)),
  });
}

function loadCanonDoc() {
  if (canonCache) return canonCache;
  const rawText = fsSync.readFileSync(CANON_PATH, 'utf8');
  const parsed = JSON.parse(rawText);
  canonCache = normalizeCanonDoc(parsed);
  return canonCache;
}

function resolveTodayDate(options = {}) {
  const today = normalizeString(options.today);
  if (DATE_RE.test(today)) return today;
  return new Date().toISOString().slice(0, 10);
}

function findDeprecatedPrefix(commandId, canonDoc) {
  for (const prefix of canonDoc.deprecatedPrefixes) {
    if (commandId.startsWith(prefix)) return prefix;
  }
  return '';
}

function resolveMenuCommandId(inputId, options = {}) {
  const canonDoc = loadCanonDoc();
  const commandId = normalizeString(inputId);
  if (!commandId) {
    return {
      ok: false,
      code: 'E_COMMAND_NAMESPACE_UNKNOWN',
      reason: 'COMMAND_ID_INVALID',
      details: {
        failSignal: 'E_COMMAND_NAMESPACE_DRIFT',
      },
    };
  }

  if (canonDoc.canonicalPrefix && commandId.startsWith(canonDoc.canonicalPrefix)) {
    return {
      ok: true,
      commandId,
      canonicalCommandId: commandId,
      inputId: commandId,
      deprecated: false,
      deprecatedPrefix: '',
    };
  }

  const deprecatedPrefix = findDeprecatedPrefix(commandId, canonDoc);
  if (!deprecatedPrefix) {
    return {
      ok: true,
      commandId,
      canonicalCommandId: commandId,
      inputId: commandId,
      deprecated: false,
      deprecatedPrefix: '',
    };
  }

  const canonicalCommandId = canonDoc.aliasMap[commandId] || '';
  if (!canonicalCommandId) {
    return {
      ok: false,
      code: 'E_COMMAND_NAMESPACE_UNKNOWN',
      reason: 'COMMAND_NAMESPACE_ALIAS_MISSING',
      details: {
        failSignal: 'E_COMMAND_NAMESPACE_DRIFT',
        inputId: commandId,
        deprecatedPrefix,
      },
    };
  }

  const enforceSunset = options.enforceSunset !== false;
  const cutoffDate = canonDoc.aliasPolicy.allowDeprecatedInConfigsUntil;
  if (enforceSunset && cutoffDate) {
    const today = resolveTodayDate(options);
    if (today > cutoffDate) {
      return {
        ok: false,
        code: 'E_COMMAND_NAMESPACE_UNKNOWN',
        reason: 'COMMAND_NAMESPACE_SUNSET_EXPIRED',
        details: {
          failSignal: 'E_COMMAND_NAMESPACE_DRIFT',
          inputId: commandId,
          canonicalCommandId,
          allowDeprecatedInConfigsUntil: cutoffDate,
          today,
        },
      };
    }
  }

  return {
    ok: true,
    commandId: canonicalCommandId,
    canonicalCommandId,
    inputId: commandId,
    deprecated: true,
    deprecatedPrefix,
  };
}

function getCommandNamespaceCanon() {
  return loadCanonDoc();
}

module.exports = {
  CANON_PATH,
  getCommandNamespaceCanon,
  resolveMenuCommandId,
};
