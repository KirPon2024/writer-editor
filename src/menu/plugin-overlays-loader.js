const fsSync = require('fs');
const path = require('path');
const { validateEnabledWhenAst } = require('./enabledwhen-eval.js');

const PLUGIN_OVERLAY_POLICY_PATH = path.join(
  __dirname,
  '..',
  '..',
  'docs',
  'OPS',
  'STATUS',
  'PLUGIN_MENU_OVERLAY_POLICY_v1.json',
);
const VISIBILITY_MATRIX_PATH = path.join(
  __dirname,
  '..',
  '..',
  'docs',
  'OPS',
  'STATUS',
  'COMMAND_VISIBILITY_MATRIX.json',
);

const DEFAULT_ALLOWED_FIELDS = Object.freeze([
  'inserts',
  'hides',
  'orderRules',
  'enabledWhenAst',
  'visibilityPolicy',
  'disabledReasonCode',
  'sourceRefs',
]);

const EXECUTABLE_FIELD_HINTS = Object.freeze([
  'handler',
  'ipc',
  'jsCode',
  'evalLike',
  'eval',
  'script',
  'callback',
  'function',
  'commandExec',
]);

const ALLOWED_VISIBILITY_POLICIES = new Set([
  'visible_enabled',
  'visible_disabled',
  'hidden',
]);

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createViolation(code, message, details = {}) {
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

function readJsonFileSafe(filePath, fallback = {}) {
  try {
    return JSON.parse(fsSync.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function normalizeAllowedFields(value) {
  if (!Array.isArray(value)) return [...DEFAULT_ALLOWED_FIELDS];
  const out = [];
  const seen = new Set();
  for (const entry of value) {
    const normalized = normalizeString(entry);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out.length > 0 ? out : [...DEFAULT_ALLOWED_FIELDS];
}

function normalizePluginOverlayPolicy(rawDoc) {
  const source = isPlainObject(rawDoc) ? rawDoc : {};
  const signaturePolicy = isPlainObject(source.signaturePolicy) ? source.signaturePolicy : {};

  return {
    schemaVersion: Number(source.schemaVersion) || 1,
    allowedFields: normalizeAllowedFields(source.allowedFields),
    signaturePolicy: {
      unsignedAllowed: signaturePolicy.unsignedAllowed === true,
      unsignedAllowedInDevOnly: signaturePolicy.unsignedAllowedInDevOnly === true,
    },
  };
}

function readVisibilityMatrixCoreAllowlist() {
  const parsed = readJsonFileSafe(VISIBILITY_MATRIX_PATH, {});
  const allowlist = Array.isArray(parsed.coreSafetyCommandAllowlist)
    ? parsed.coreSafetyCommandAllowlist
      .map((entry) => normalizeString(entry))
      .filter(Boolean)
    : [];
  return new Set(allowlist);
}

function loadPluginOverlayPolicy(policyPath = PLUGIN_OVERLAY_POLICY_PATH) {
  const parsed = readJsonFileSafe(policyPath, {});
  return normalizePluginOverlayPolicy(parsed);
}

function hasExecutableHintInKey(key) {
  const lowered = normalizeString(key).toLowerCase();
  if (!lowered) return false;
  return EXECUTABLE_FIELD_HINTS.some((hint) => lowered.includes(hint.toLowerCase()));
}

function collectValueViolations(value, atPath, out) {
  if (typeof value === 'function') {
    out.push(createViolation(
      'PLUGIN_OVERLAY_FUNCTION_VALUE_FORBIDDEN',
      `Function value is forbidden in plugin overlay (${atPath}).`,
      { path: atPath },
    ));
    return;
  }

  if (typeof value === 'undefined' || typeof value === 'symbol' || typeof value === 'bigint') {
    out.push(createViolation(
      'PLUGIN_OVERLAY_NON_JSON_VALUE_FORBIDDEN',
      `Non-JSON value is forbidden in plugin overlay (${atPath}).`,
      { path: atPath },
    ));
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      collectValueViolations(entry, `${atPath}[${index}]`, out);
    });
    return;
  }

  if (!isPlainObject(value)) return;

  for (const [key, nested] of Object.entries(value)) {
    const childPath = atPath ? `${atPath}.${key}` : key;
    if (hasExecutableHintInKey(key)) {
      out.push(createViolation(
        'PLUGIN_OVERLAY_EXECUTABLE_FIELD_FORBIDDEN',
        `Executable-like field is forbidden in plugin overlay (${childPath}).`,
        { path: childPath },
      ));
    }
    collectValueViolations(nested, childPath, out);
  }
}

function validateVisibilityPolicy(value, coreSafetyCommands, baseDetails) {
  const violations = [];
  if (typeof value === 'undefined') return violations;

  if (typeof value === 'string') {
    if (!ALLOWED_VISIBILITY_POLICIES.has(value)) {
      violations.push(createViolation(
        'PLUGIN_OVERLAY_VISIBILITY_POLICY_INVALID',
        `visibilityPolicy must be one of: ${[...ALLOWED_VISIBILITY_POLICIES].join(', ')}`,
        baseDetails,
      ));
    }
    return violations;
  }

  if (!isPlainObject(value)) {
    violations.push(createViolation(
      'PLUGIN_OVERLAY_VISIBILITY_POLICY_INVALID',
      'visibilityPolicy must be a string or object map.',
      baseDetails,
    ));
    return violations;
  }

  for (const [commandIdRaw, policyRaw] of Object.entries(value)) {
    const commandId = normalizeString(commandIdRaw);
    const policy = normalizeString(policyRaw);
    if (!commandId) continue;
    if (!ALLOWED_VISIBILITY_POLICIES.has(policy)) {
      violations.push(createViolation(
        'PLUGIN_OVERLAY_VISIBILITY_POLICY_INVALID',
        `visibilityPolicy for ${commandId} is invalid: ${String(policyRaw)}`,
        { ...baseDetails, commandId },
      ));
      continue;
    }
    if (policy === 'hidden' && coreSafetyCommands.has(commandId)) {
      violations.push(createViolation(
        'PLUGIN_OVERLAY_VISIBILITY_CORE_CONFLICT',
        `Core safety command cannot be hidden by plugin overlay: ${commandId}`,
        { ...baseDetails, commandId },
      ));
    }
  }

  return violations;
}

function validateEnabledWhenAstField(value, baseDetails) {
  if (typeof value === 'undefined' || value === null) return [];
  if (typeof value === 'string') {
    return [createViolation(
      'PLUGIN_OVERLAY_ENABLEDWHEN_STRING_FORBIDDEN',
      'enabledWhenAst must be AST object, string is forbidden.',
      baseDetails,
    )];
  }
  if (!isPlainObject(value)) {
    return [createViolation(
      'PLUGIN_OVERLAY_ENABLEDWHEN_INVALID',
      'enabledWhenAst must be AST object or null.',
      baseDetails,
    )];
  }

  const state = validateEnabledWhenAst(value);
  if (!state.ok) {
    return [createViolation(
      'PLUGIN_OVERLAY_ENABLEDWHEN_INVALID',
      `enabledWhenAst is invalid: ${state.reasonCode}`,
      {
        ...baseDetails,
        reasonCode: state.reasonCode,
      },
    )];
  }
  return [];
}

function normalizeSourceRefs(value, fallbackRef) {
  const refs = Array.isArray(value) ? value : [fallbackRef];
  const out = [];
  const seen = new Set();
  for (const entry of refs) {
    const normalized = normalizeString(entry);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function normalizePluginOverlayEntry(rawOverlay, index, options = {}) {
  const policy = options.policy || loadPluginOverlayPolicy();
  const coreSafetyCommands = options.coreSafetyCommands || readVisibilityMatrixCoreAllowlist();
  const violations = [];

  if (!isPlainObject(rawOverlay)) {
    violations.push(createViolation(
      'PLUGIN_OVERLAY_INVALID',
      'Plugin overlay entry must be an object.',
      { index },
    ));
    return { overlay: null, violations };
  }

  const pluginId = normalizeString(rawOverlay.pluginId);
  const pluginVersion = normalizeString(rawOverlay.pluginVersion);
  const overlayId = normalizeString(rawOverlay.overlayId);
  const signatureStatus = normalizeString(rawOverlay.signatureStatus).toLowerCase();

  if (!pluginId) {
    violations.push(createViolation('PLUGIN_OVERLAY_PLUGIN_ID_MISSING', 'pluginId is required.', { index }));
  }
  if (!pluginVersion) {
    violations.push(createViolation('PLUGIN_OVERLAY_PLUGIN_VERSION_MISSING', 'pluginVersion is required.', { index }));
  }
  if (!overlayId) {
    violations.push(createViolation('PLUGIN_OVERLAY_ID_MISSING', 'overlayId is required.', { index }));
  }
  if (!signatureStatus) {
    violations.push(createViolation('PLUGIN_OVERLAY_SIGNATURE_STATUS_MISSING', 'signatureStatus is required.', { index }));
  }

  if (!policy.signaturePolicy.unsignedAllowed && signatureStatus !== 'signed') {
    violations.push(createViolation(
      'PLUGIN_OVERLAY_SIGNATURE_INVALID',
      `Unsigned plugin overlays are forbidden by policy (signatureStatus=${signatureStatus || 'unknown'}).`,
      { index, pluginId, overlayId },
    ));
  }

  const allowedTopLevel = new Set([
    'pluginId',
    'pluginVersion',
    'overlayId',
    'signatureStatus',
    'sourceRef',
    ...policy.allowedFields,
  ]);

  for (const key of Object.keys(rawOverlay)) {
    if (allowedTopLevel.has(key)) continue;
    violations.push(createViolation(
      'PLUGIN_OVERLAY_FIELD_FORBIDDEN',
      `Forbidden plugin overlay field: ${key}`,
      { index, pluginId, overlayId, field: key },
    ));
  }

  collectValueViolations(rawOverlay, '', violations);

  const sourceRef = normalizeString(rawOverlay.sourceRef)
    || `plugin:${pluginId || `unknown-${index + 1}`}@${pluginVersion || '0.0.0'}#${overlayId || `overlay-${index + 1}`}`;

  const inserts = Array.isArray(rawOverlay.inserts)
    ? rawOverlay.inserts.filter((entry) => isPlainObject(entry)).map((entry) => cloneJson(entry))
    : [];

  if (typeof rawOverlay.inserts !== 'undefined' && !Array.isArray(rawOverlay.inserts)) {
    violations.push(createViolation(
      'PLUGIN_OVERLAY_INSERTS_INVALID',
      'inserts must be an array of menu nodes.',
      { index, pluginId, overlayId },
    ));
  }

  if (Array.isArray(rawOverlay.inserts)) {
    rawOverlay.inserts.forEach((entry, entryIndex) => {
      if (!isPlainObject(entry)) {
        violations.push(createViolation(
          'PLUGIN_OVERLAY_INSERT_NODE_INVALID',
          'Each inserts[] entry must be an object.',
          { index, pluginId, overlayId, entryIndex },
        ));
        return;
      }
      if (Object.prototype.hasOwnProperty.call(entry, 'enabledWhenAst')) {
        const astViolations = validateEnabledWhenAstField(entry.enabledWhenAst, {
          index,
          pluginId,
          overlayId,
          entryIndex,
          path: `inserts[${entryIndex}].enabledWhenAst`,
        });
        violations.push(...astViolations);
      }
    });
  }

  violations.push(...validateEnabledWhenAstField(rawOverlay.enabledWhenAst, {
    index,
    pluginId,
    overlayId,
    path: 'enabledWhenAst',
  }));
  violations.push(...validateVisibilityPolicy(rawOverlay.visibilityPolicy, coreSafetyCommands, {
    index,
    pluginId,
    overlayId,
  }));

  if (typeof rawOverlay.hides !== 'undefined') {
    if (!Array.isArray(rawOverlay.hides) || rawOverlay.hides.some((entry) => !normalizeString(entry))) {
      violations.push(createViolation(
        'PLUGIN_OVERLAY_HIDES_INVALID',
        'hides must be an array of non-empty command/menu ids.',
        { index, pluginId, overlayId },
      ));
    }
  }

  if (typeof rawOverlay.orderRules !== 'undefined') {
    if (!Array.isArray(rawOverlay.orderRules) || rawOverlay.orderRules.some((entry) => !isPlainObject(entry))) {
      violations.push(createViolation(
        'PLUGIN_OVERLAY_ORDER_RULES_INVALID',
        'orderRules must be an array of objects.',
        { index, pluginId, overlayId },
      ));
    }
  }

  if (typeof rawOverlay.disabledReasonCode !== 'undefined'
    && rawOverlay.disabledReasonCode !== null
    && typeof rawOverlay.disabledReasonCode !== 'string') {
    violations.push(createViolation(
      'PLUGIN_OVERLAY_DISABLED_REASON_INVALID',
      'disabledReasonCode must be string or null.',
      { index, pluginId, overlayId },
    ));
  }

  const overlay = {
    origin: 'plugin',
    sourceRef,
    pluginId,
    pluginVersion,
    overlayId,
    signatureStatus,
    sourceRefs: normalizeSourceRefs(rawOverlay.sourceRefs, sourceRef),
    config: {
      menus: inserts,
    },
    overlayData: stableSortObject({
      inserts,
      hides: Array.isArray(rawOverlay.hides) ? cloneJson(rawOverlay.hides) : [],
      orderRules: Array.isArray(rawOverlay.orderRules) ? cloneJson(rawOverlay.orderRules) : [],
      enabledWhenAst: rawOverlay.enabledWhenAst === undefined ? null : cloneJson(rawOverlay.enabledWhenAst),
      visibilityPolicy: rawOverlay.visibilityPolicy === undefined ? null : cloneJson(rawOverlay.visibilityPolicy),
      disabledReasonCode: rawOverlay.disabledReasonCode === undefined
        ? null
        : cloneJson(rawOverlay.disabledReasonCode),
      sourceRefs: normalizeSourceRefs(rawOverlay.sourceRefs, sourceRef),
    }),
  };

  return {
    overlay,
    violations,
  };
}

function comparePluginOverlays(a, b) {
  const pluginCmp = normalizeString(a.pluginId).localeCompare(normalizeString(b.pluginId));
  if (pluginCmp !== 0) return pluginCmp;
  const overlayCmp = normalizeString(a.overlayId).localeCompare(normalizeString(b.overlayId));
  if (overlayCmp !== 0) return overlayCmp;
  const versionCmp = normalizeString(a.pluginVersion).localeCompare(normalizeString(b.pluginVersion));
  if (versionCmp !== 0) return versionCmp;
  return normalizeString(a.sourceRef).localeCompare(normalizeString(b.sourceRef));
}

function normalizePluginOverlays(rawPluginOverlays = [], options = {}) {
  const policy = options.policy || loadPluginOverlayPolicy(options.policyPath);
  const coreSafetyCommands = readVisibilityMatrixCoreAllowlist();
  const violations = [];
  const overlays = [];

  if (!Array.isArray(rawPluginOverlays)) {
    return {
      policy,
      overlays,
      violations: [
        createViolation(
          'PLUGIN_OVERLAYS_INPUT_INVALID',
          'pluginOverlays input must be an array.',
        ),
      ],
    };
  }

  rawPluginOverlays.forEach((rawOverlay, index) => {
    const state = normalizePluginOverlayEntry(rawOverlay, index, {
      policy,
      coreSafetyCommands,
    });
    overlays.push(state.overlay);
    violations.push(...state.violations);
  });

  const normalizedOverlays = overlays
    .filter((entry) => Boolean(entry))
    .sort(comparePluginOverlays)
    .map((entry) => cloneJson(entry));

  return {
    policy,
    overlays: normalizedOverlays,
    violations,
  };
}

module.exports = {
  PLUGIN_OVERLAY_POLICY_PATH,
  loadPluginOverlayPolicy,
  normalizePluginOverlayEntry,
  normalizePluginOverlays,
};
