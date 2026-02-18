const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');

const MENU_RUNTIME_CONTEXT_CANON_PATH = path.join(
  __dirname,
  '..',
  '..',
  'docs',
  'OPS',
  'STATUS',
  'MENU_RUNTIME_CONTEXT_CANON_v1.json',
);

let contextCanonCache = null;

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function createError(code, message, details = {}) {
  return {
    code,
    message,
    ...details,
  };
}

function stableSortObject(value) {
  if (Array.isArray(value)) return value.map((entry) => stableSortObject(entry));
  if (!isPlainObject(value)) return value;
  const out = {};
  for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
    out[key] = stableSortObject(value[key]);
  }
  return out;
}

function stableStringify(value) {
  return JSON.stringify(stableSortObject(value), null, 2);
}

function readCanonRaw() {
  return JSON.parse(fsSync.readFileSync(MENU_RUNTIME_CONTEXT_CANON_PATH, 'utf8'));
}

function normalizeStringSet(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  for (const value of values) {
    const normalized = normalizeString(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
  }
  return [...seen];
}

function normalizeContextCanon(raw) {
  const source = isPlainObject(raw) ? raw : {};
  const defaults = isPlainObject(source.defaults) ? source.defaults : {};
  const allowedKeys = normalizeStringSet(source.allowedKeys);
  const platformEnum = normalizeStringSet(source.platformEnum);
  const profileEnum = normalizeStringSet(source.profileEnum);
  const contextHashInputs = normalizeStringSet(source.contextHashInputs);

  return Object.freeze({
    schemaVersion: Number(source.schemaVersion) || 1,
    allowedKeys: Object.freeze(allowedKeys),
    platformEnum: Object.freeze(platformEnum),
    profileEnum: Object.freeze(profileEnum),
    defaults: Object.freeze({
      platform: normalizeString(defaults.platform) || 'mac',
      profileId: normalizeString(defaults.profileId) || 'minimal',
      workspaceId: normalizeString(defaults.workspaceId),
      userPresetId: normalizeString(defaults.userPresetId),
      scopeFlags: isPlainObject(defaults.scopeFlags) ? defaults.scopeFlags : {},
      promotionMode: defaults.promotionMode === true,
    }),
    contextHashInputs: Object.freeze(
      contextHashInputs.length > 0 ? contextHashInputs : ['platform', 'profileId', 'workspaceId', 'userPresetId', 'scopeFlags', 'promotionMode'],
    ),
  });
}

function getMenuRuntimeContextCanon() {
  if (contextCanonCache) return contextCanonCache;
  contextCanonCache = normalizeContextCanon(readCanonRaw());
  return contextCanonCache;
}

function normalizeScopeFlags(value, errors, pathPrefix) {
  if (typeof value === 'undefined') return {};
  if (!isPlainObject(value)) {
    errors.push(createError(
      'E_MENU_RUNTIME_CONTEXT_SCOPEFLAGS_INVALID',
      'scopeFlags must be an object with boolean values.',
      { path: pathPrefix },
    ));
    return {};
  }

  const out = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = normalizeString(rawKey);
    if (!key) {
      errors.push(createError(
        'E_MENU_RUNTIME_CONTEXT_SCOPEFLAGS_KEY_INVALID',
        'scopeFlags key must be non-empty string.',
        { path: `${pathPrefix}.${rawKey}` },
      ));
      continue;
    }
    if (typeof rawValue !== 'boolean') {
      errors.push(createError(
        'E_MENU_RUNTIME_CONTEXT_SCOPEFLAGS_VALUE_INVALID',
        'scopeFlags value must be boolean.',
        { path: `${pathPrefix}.${key}` },
      ));
      continue;
    }
    out[key] = rawValue;
  }
  return out;
}

function validateMenuContext(inputContext = {}, options = {}) {
  const canon = getMenuRuntimeContextCanon();
  const source = isPlainObject(inputContext) ? inputContext : {};
  const errors = [];
  const mode = normalizeString(options.mode).toLowerCase() || 'release';

  for (const key of Object.keys(source)) {
    if (canon.allowedKeys.includes(key)) continue;
    errors.push(createError(
      'E_MENU_RUNTIME_CONTEXT_UNKNOWN_KEY',
      `Unknown runtime menu context key: ${key}`,
      { key },
    ));
  }

  const normalizedCtx = {
    platform: normalizeString(source.platform || canon.defaults.platform) || canon.defaults.platform,
    profileId: normalizeString(source.profileId || canon.defaults.profileId) || canon.defaults.profileId,
    workspaceId: normalizeString(source.workspaceId || canon.defaults.workspaceId),
    userPresetId: normalizeString(source.userPresetId || canon.defaults.userPresetId),
    scopeFlags: normalizeScopeFlags(
      Object.prototype.hasOwnProperty.call(source, 'scopeFlags') ? source.scopeFlags : canon.defaults.scopeFlags,
      errors,
      'scopeFlags',
    ),
    promotionMode: Object.prototype.hasOwnProperty.call(source, 'promotionMode')
      ? source.promotionMode === true
      : canon.defaults.promotionMode,
  };

  if (!canon.platformEnum.includes(normalizedCtx.platform)) {
    errors.push(createError(
      'E_MENU_RUNTIME_CONTEXT_PLATFORM_INVALID',
      `platform must be one of: ${canon.platformEnum.join(', ')}`,
      { value: normalizedCtx.platform },
    ));
  }

  if (!canon.profileEnum.includes(normalizedCtx.profileId)) {
    errors.push(createError(
      'E_MENU_RUNTIME_CONTEXT_PROFILE_INVALID',
      `profileId must be one of: ${canon.profileEnum.join(', ')}`,
      { value: normalizedCtx.profileId },
    ));
  }

  if (Object.prototype.hasOwnProperty.call(source, 'promotionMode')
    && typeof source.promotionMode !== 'boolean') {
    errors.push(createError(
      'E_MENU_RUNTIME_CONTEXT_PROMOTION_MODE_INVALID',
      'promotionMode must be boolean.',
      { value: source.promotionMode },
    ));
  }

  return {
    ok: errors.length === 0,
    mode,
    normalizedCtx: stableSortObject(normalizedCtx),
    errors,
  };
}

function toMenuRuntimeNormalizerContext(normalizedCtx = {}) {
  const source = isPlainObject(normalizedCtx) ? normalizedCtx : {};
  return {
    platform: normalizeString(source.platform) || 'mac',
    profile: normalizeString(source.profileId) || 'minimal',
    mode: 'offline',
    stage: 'X1',
    scopeFlags: isPlainObject(source.scopeFlags) ? source.scopeFlags : {},
    flags: {},
    hasDocument: true,
    selectionExists: false,
    flowModeActive: false,
    promotionMode: source.promotionMode === true,
  };
}

function computeMenuRuntimeContextHash(normalizedCtx = {}) {
  const canon = getMenuRuntimeContextCanon();
  const source = isPlainObject(normalizedCtx) ? normalizedCtx : {};
  const hashPayload = {};

  for (const key of canon.contextHashInputs) {
    hashPayload[key] = Object.prototype.hasOwnProperty.call(source, key)
      ? source[key]
      : null;
  }

  return crypto
    .createHash('sha256')
    .update(stableStringify(hashPayload), 'utf8')
    .digest('hex');
}

module.exports = {
  MENU_RUNTIME_CONTEXT_CANON_PATH,
  computeMenuRuntimeContextHash,
  getMenuRuntimeContextCanon,
  toMenuRuntimeNormalizerContext,
  validateMenuContext,
};
