const crypto = require('crypto');
const fsSync = require('fs');
const path = require('path');

const {
  getCommandNamespaceCanon,
  resolveMenuCommandId,
} = require('./command-namespace-canon.js');
const {
  evaluateEnabledWhenAst,
  validateEnabledWhenAst,
} = require('./enabledwhen-eval.js');
const {
  normalizePluginOverlays,
} = require('./plugin-overlays-loader.js');

const NORMALIZATION_SPEC_PATH = path.join(
  __dirname,
  '..',
  '..',
  'docs',
  'OPS',
  'STATUS',
  'MENU_CONFIG_NORMALIZATION_SPEC_v1.json',
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
const OVERLAY_STACK_CANON_PATH = path.join(
  __dirname,
  '..',
  '..',
  'docs',
  'OPS',
  'STATUS',
  'MENU_OVERLAY_STACK_CANON_v1.json',
);

const DEFAULT_STACK_ORDER = Object.freeze([
  'base',
  'platform',
  'profile',
  'workspace',
  'user',
  'plugin',
]);
const ORIGIN_ORDER = Object.freeze(DEFAULT_STACK_ORDER.reduce((acc, origin, index) => {
  acc[origin] = index;
  return acc;
}, {}));

const DEFAULT_MODE = ['offline'];
const DEFAULT_PROFILE = ['minimal', 'pro', 'guru'];
const DEFAULT_STAGE = ['X0', 'X1', 'X2', 'X3', 'X4'];
const DEFAULT_ENABLED_WHEN_AST = Object.freeze({ op: 'all', args: Object.freeze([]) });
const STAGE_SET = new Set(DEFAULT_STAGE);
const OVERLAY_ALLOWED_ORIGINS = new Set(Object.keys(ORIGIN_ORDER));
const MODE_RELEASE = 'release';
const MODE_PROMOTION = 'promotion';

const ACTION_TO_COMMAND = Object.freeze({
  new: 'cmd.project.new',
  open: 'cmd.project.open',
  openDocument: 'cmd.project.open',
  save: 'cmd.project.save',
  saveDocument: 'cmd.project.save',
  'save-as': 'cmd.project.saveAs',
  exportDocxMin: 'cmd.project.export.docxMin',
  'export-docx-min': 'cmd.project.export.docxMin',
  importMarkdownV1: 'cmd.project.importMarkdownV1',
  exportMarkdownV1: 'cmd.project.exportMarkdownV1',
  flowOpenV1: 'cmd.project.flowOpenV1',
  flowSaveV1: 'cmd.project.flowSaveV1',
  quitApp: 'cmd.app.quit',
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeStringArray(value, fallback) {
  const source = Array.isArray(value) ? value : fallback;
  const out = [];
  const seen = new Set();
  for (const entry of source) {
    const normalized = normalizeString(entry);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
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

function hashNormalizedConfig(normalizedConfig) {
  const payload = stableStringify(normalizedConfig);
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function readJsonFileSafe(filePath, fallback = {}) {
  try {
    return JSON.parse(fsSync.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function getNormalizationSpec() {
  return readJsonFileSafe(NORMALIZATION_SPEC_PATH, {
    normalizedShapeVersion: 'v1',
  });
}

function getVisibilityMatrix() {
  const parsed = readJsonFileSafe(VISIBILITY_MATRIX_PATH, {});
  const rules = isPlainObject(parsed.rules) ? parsed.rules : {};
  return {
    version: normalizeString(parsed.version) || 'v1',
    states: normalizeStringArray(parsed.states, []),
    rules: {
      stageGatedDefaultState: normalizeString(rules.stageGatedDefaultState) || 'visible+disabled(reason="STAGE_GATED")',
      minimalProfileCanHideNonCore: rules.minimalProfileCanHideNonCore === true,
    },
    minimalProfileHiddenAllowlist: normalizeStringArray(parsed.minimalProfileHiddenAllowlist, []),
    coreSafetyCommandAllowlist: normalizeStringArray(parsed.coreSafetyCommandAllowlist, []),
  };
}

function getOverlayStackCanon() {
  const parsed = readJsonFileSafe(OVERLAY_STACK_CANON_PATH, {});
  const stackOrderRaw = Array.isArray(parsed.stackOrder) ? parsed.stackOrder : DEFAULT_STACK_ORDER;
  const stackOrder = normalizeStringArray(stackOrderRaw, DEFAULT_STACK_ORDER)
    .map((value) => value.toLowerCase());
  const uniqueOrder = [...new Set(stackOrder)];
  const mergeRules = isPlainObject(parsed.mergeRules) ? parsed.mergeRules : {};
  const conflictPolicy = isPlainObject(parsed.conflictPolicy) ? parsed.conflictPolicy : {};

  const normalizedOrder = uniqueOrder.length === DEFAULT_STACK_ORDER.length
    ? uniqueOrder
    : [...DEFAULT_STACK_ORDER];
  const originOrder = normalizedOrder.reduce((acc, origin, index) => {
    acc[origin] = index;
    return acc;
  }, {});

  return {
    schemaVersion: Number(parsed.schemaVersion) || 1,
    stackOrder: normalizedOrder,
    originOrder,
    mergeRules: {
      insert: normalizeString(mergeRules.insert) || 'allowlist',
      hide: normalizeString(mergeRules.hide) || 'allowlist',
      reorder: normalizeString(mergeRules.reorder) || 'allowlist',
      replace: normalizeString(mergeRules.replace) || 'forbidden',
    },
    conflictPolicy: {
      stableResolutionOrder: normalizeString(conflictPolicy.stableResolutionOrder) || 'stackOrder',
      deterministicTieBreak: normalizeString(conflictPolicy.deterministicTieBreak) || 'lexicographic',
    },
  };
}

function normalizeExecutionMode(rawMode, context) {
  const normalized = normalizeString(rawMode).toLowerCase();
  if (normalized === MODE_PROMOTION) return MODE_PROMOTION;
  if (normalized === MODE_RELEASE) return MODE_RELEASE;
  if (context && context.promotionMode === true) return MODE_PROMOTION;
  return MODE_RELEASE;
}

function normalizeContext(input = {}) {
  const source = isPlainObject(input) ? input : {};
  return {
    platform: normalizeString(source.platform) || 'mac',
    mode: normalizeString(source.mode) || 'offline',
    profile: normalizeString(source.profile).toLowerCase() || 'minimal',
    stage: normalizeString(source.stage) || 'X1',
    scopeFlags: isPlainObject(source.scopeFlags) ? source.scopeFlags : {},
    flags: isPlainObject(source.flags) ? source.flags : {},
    hasDocument: source.hasDocument === true,
    selectionExists: source.selectionExists === true,
    flowModeActive: source.flowModeActive === true,
    promotionMode: source.promotionMode === true,
    today: normalizeString(source.today),
  };
}

function createDiagnostic(code, message, details = {}) {
  return {
    code,
    message,
    ...details,
  };
}

function normalizeOverlayOrigin(rawOrigin, overlayCanon) {
  const normalized = normalizeString(rawOrigin).toLowerCase();
  const allowedOrigins = overlayCanon && Array.isArray(overlayCanon.stackOrder)
    ? new Set(overlayCanon.stackOrder)
    : OVERLAY_ALLOWED_ORIGINS;
  if (allowedOrigins.has(normalized)) return normalized;
  return 'plugin';
}

function compareOverlayEntries(a, b) {
  if (a.order !== b.order) return a.order - b.order;
  const sourceCmp = normalizeString(a.sourceRef).localeCompare(normalizeString(b.sourceRef));
  if (sourceCmp !== 0) return sourceCmp;
  return Number(a.index) - Number(b.index);
}

function createOverlayEntry(rawOverlay, index, overlayCanon) {
  if (!isPlainObject(rawOverlay)) return null;
  const origin = normalizeOverlayOrigin(rawOverlay.origin, overlayCanon);
  const sourceRef = normalizeString(rawOverlay.sourceRef) || `overlay:${index + 1}`;
  const config = isPlainObject(rawOverlay.config)
    ? rawOverlay.config
    : rawOverlay;
  if (!Array.isArray(config.menus)) return null;

  return {
    order: overlayCanon.originOrder[origin] ?? overlayCanon.originOrder.plugin ?? ORIGIN_ORDER.plugin,
    origin,
    sourceRef,
    config: cloneJson(config),
    index,
    pluginId: normalizeString(rawOverlay.pluginId),
    overlayId: normalizeString(rawOverlay.overlayId),
    pluginVersion: normalizeString(rawOverlay.pluginVersion),
    signatureStatus: normalizeString(rawOverlay.signatureStatus),
  };
}

function normalizeOverlayInput(overlays = [], overlayCanon) {
  const normalized = [];
  if (!Array.isArray(overlays)) return normalized;

  overlays.forEach((rawOverlay, index) => {
    const entry = createOverlayEntry(rawOverlay, index, overlayCanon);
    if (entry) normalized.push(entry);
  });

  normalized.sort(compareOverlayEntries);
  return normalized;
}

function normalizeNamedOverlayLayer(rawOverlay, origin, sourceRef, overlayCanon) {
  if (!isPlainObject(rawOverlay)) return null;
  const config = isPlainObject(rawOverlay.config) ? rawOverlay.config : rawOverlay;
  if (!Array.isArray(config.menus)) return null;
  return createOverlayEntry({
    ...rawOverlay,
    origin,
    sourceRef: normalizeString(rawOverlay.sourceRef) || sourceRef,
    config,
  }, 0, overlayCanon);
}

function collectOverlayInputs(input, overlayCanon, diagnostics, mode) {
  const collected = [];
  let indexSeed = 0;

  const layerDefs = [
    { key: 'platformOverlay', origin: 'platform', sourceRef: 'overlay:platform' },
    { key: 'profileOverlay', origin: 'profile', sourceRef: 'overlay:profile' },
    { key: 'workspaceOverlay', origin: 'workspace', sourceRef: 'overlay:workspace' },
    { key: 'userOverlay', origin: 'user', sourceRef: 'overlay:user' },
  ];

  layerDefs.forEach((layerDef) => {
    const overlayEntry = normalizeNamedOverlayLayer(
      input[layerDef.key],
      layerDef.origin,
      layerDef.sourceRef,
      overlayCanon,
    );
    if (!overlayEntry) return;
    overlayEntry.index = indexSeed;
    indexSeed += 1;
    collected.push(overlayEntry);
  });

  const pluginOverlaysInput = Array.isArray(input.pluginOverlays) ? input.pluginOverlays : [];
  const pluginState = normalizePluginOverlays(pluginOverlaysInput, {});
  if (pluginState.violations.length > 0) {
    const targetList = mode === MODE_PROMOTION ? diagnostics.errors : diagnostics.warnings;
    pluginState.violations.forEach((violation) => {
      targetList.push(createDiagnostic(
        'E_PLUGIN_MENU_OVERLAY_POLICY_VIOLATION',
        violation.message || 'Plugin overlay policy violation.',
        {
          ...violation,
        },
      ));
    });
  }

  pluginState.overlays.forEach((overlay) => {
    const overlayEntry = createOverlayEntry(overlay, indexSeed, overlayCanon);
    indexSeed += 1;
    if (overlayEntry) collected.push(overlayEntry);
  });

  const genericOverlays = normalizeOverlayInput(input.overlays, overlayCanon).map((overlay) => ({
    ...overlay,
    index: overlay.index + indexSeed,
  }));
  collected.push(...genericOverlays);

  collected.sort(compareOverlayEntries);
  return collected;
}

function ensureMeta(node, origin, sourceRef) {
  if (!isPlainObject(node.__meta)) {
    node.__meta = {
      origin: origin || 'base',
      sourceRefs: [],
    };
  }
  if (normalizeString(origin)) {
    node.__meta.origin = origin;
  }
  const normalizedSourceRef = normalizeString(sourceRef);
  if (normalizedSourceRef && !node.__meta.sourceRefs.includes(normalizedSourceRef)) {
    node.__meta.sourceRefs.push(normalizedSourceRef);
    node.__meta.sourceRefs.sort((a, b) => a.localeCompare(b));
  }
}

function annotateTreeMeta(nodes, origin, sourceRef) {
  if (!Array.isArray(nodes)) return;
  nodes.forEach((node) => {
    if (!isPlainObject(node)) return;
    ensureMeta(node, origin, sourceRef);
    if (Array.isArray(node.items)) {
      annotateTreeMeta(node.items, origin, sourceRef);
    }
  });
}

function getNodeKey(node, fallback) {
  if (!isPlainObject(node)) return fallback;
  const id = normalizeString(node.id);
  if (id) return id;
  const type = normalizeString(node.type);
  if (type === 'separator') return `${fallback}:separator`;
  const label = normalizeString(node.label);
  if (label) return `${fallback}:label:${label}`;
  return fallback;
}

function mergeNodeArrays(baseNodes, overlayNodes, origin, sourceRef, pathPrefix) {
  if (!Array.isArray(overlayNodes) || overlayNodes.length === 0) return;
  const baseIndexByKey = new Map();

  baseNodes.forEach((node, index) => {
    const key = getNodeKey(node, `${pathPrefix}.base[${index}]`);
    if (!baseIndexByKey.has(key)) baseIndexByKey.set(key, index);
  });

  overlayNodes.forEach((overlayNode, overlayIndex) => {
    if (!isPlainObject(overlayNode)) return;
    const key = getNodeKey(overlayNode, `${pathPrefix}.overlay[${overlayIndex}]`);
    if (baseIndexByKey.has(key)) {
      const targetIndex = baseIndexByKey.get(key);
      const target = baseNodes[targetIndex];
      mergeNode(target, overlayNode, origin, sourceRef, `${pathPrefix}.${key}`);
      return;
    }

    const inserted = cloneJson(overlayNode);
    annotateTreeMeta([inserted], origin, sourceRef);
    baseNodes.push(inserted);
    baseIndexByKey.set(key, baseNodes.length - 1);
  });
}

function mergeNode(target, overlayNode, origin, sourceRef, pathPrefix) {
  if (!isPlainObject(target) || !isPlainObject(overlayNode)) return;
  ensureMeta(target, origin, sourceRef);

  for (const [key, value] of Object.entries(overlayNode)) {
    if (key === '__meta') continue;
    if (key === 'items') {
      if (!Array.isArray(target.items)) target.items = [];
      mergeNodeArrays(target.items, Array.isArray(value) ? value : [], origin, sourceRef, `${pathPrefix}.items`);
      continue;
    }
    target[key] = cloneJson(value);
  }

  if (Array.isArray(target.items)) {
    annotateTreeMeta(target.items, target.__meta.origin, sourceRef);
  }
}

function mergeOverlayIntoConfig(config, overlay) {
  if (!isPlainObject(config) || !Array.isArray(config.menus)) return;
  const overlayConfig = isPlainObject(overlay.config) ? overlay.config : {};
  if (!Array.isArray(overlayConfig.menus)) return;
  mergeNodeArrays(config.menus, overlayConfig.menus, overlay.origin, overlay.sourceRef, '$.menus');
}

function deriveCanonicalCommandId(node, canon, context, diagnostics, pathRef) {
  let rawCommandId = '';
  if (typeof node.command === 'string') {
    rawCommandId = normalizeString(node.command);
  } else if (typeof node.actionId === 'string') {
    const mapped = ACTION_TO_COMMAND[normalizeString(node.actionId)] || '';
    if (!mapped) {
      diagnostics.errors.push(createDiagnostic(
        'E_MENU_NORMALIZATION_ACTION_UNKNOWN',
        `Unknown actionId cannot be normalized: ${node.actionId}`,
        { path: pathRef, actionId: node.actionId },
      ));
      return null;
    }
    rawCommandId = mapped;
  } else if (typeof node.canonicalCmdId === 'string') {
    rawCommandId = normalizeString(node.canonicalCmdId);
  }

  if (!rawCommandId) return null;

  const resolution = resolveMenuCommandId(rawCommandId, {
    enforceSunset: true,
    today: context.today,
  });
  if (!resolution.ok) {
    diagnostics.errors.push(createDiagnostic(
      'E_MENU_NORMALIZATION_COMMAND_INVALID',
      `Command normalization failed for ${rawCommandId}`,
      { path: pathRef, commandId: rawCommandId, reason: resolution.reason || '' },
    ));
    return null;
  }

  const canonicalCmdId = normalizeString(resolution.canonicalCommandId || resolution.commandId);
  if (!canonicalCmdId || !canonicalCmdId.startsWith(canon.canonicalPrefix)) {
    diagnostics.errors.push(createDiagnostic(
      'E_MENU_NORMALIZATION_COMMAND_NON_CANON',
      `Command is not canonical after normalization: ${rawCommandId}`,
      { path: pathRef, commandId: rawCommandId, canonicalCmdId },
    ));
    return null;
  }

  return canonicalCmdId;
}

function normalizeEnabledWhenAst(node, canonicalCmdId, diagnostics, pathRef) {
  if (!Object.prototype.hasOwnProperty.call(node, 'enabledWhen')
    && Object.prototype.hasOwnProperty.call(node, 'enabledWhenAst')) {
    if (node.enabledWhenAst === null) return null;
    if (typeof node.enabledWhenAst === 'string') {
      diagnostics.errors.push(createDiagnostic(
        'E_MENU_NORMALIZATION_ENABLEDWHEN_STRING',
        'String enabledWhenAst is forbidden in normalization pipeline.',
        { path: pathRef },
      ));
      return null;
    }
    if (!isPlainObject(node.enabledWhenAst)) {
      diagnostics.errors.push(createDiagnostic(
        'E_MENU_NORMALIZATION_ENABLEDWHEN_INVALID',
        'enabledWhenAst must be an AST object or null.',
        { path: pathRef },
      ));
      return null;
    }
    const enabledWhenAstValidation = validateEnabledWhenAst(node.enabledWhenAst);
    if (!enabledWhenAstValidation.ok) {
      diagnostics.errors.push(createDiagnostic(
        'E_MENU_NORMALIZATION_ENABLEDWHEN_INVALID',
        `enabledWhenAst is invalid: ${enabledWhenAstValidation.reasonCode}`,
        { path: pathRef, reasonCode: enabledWhenAstValidation.reasonCode },
      ));
      return null;
    }
    return cloneJson(node.enabledWhenAst);
  }

  if (!Object.prototype.hasOwnProperty.call(node, 'enabledWhen')) {
    return canonicalCmdId ? cloneJson(DEFAULT_ENABLED_WHEN_AST) : null;
  }

  if (node.enabledWhen === null) {
    return null;
  }

  if (typeof node.enabledWhen === 'string') {
    diagnostics.errors.push(createDiagnostic(
      'E_MENU_NORMALIZATION_ENABLEDWHEN_STRING',
      'String enabledWhen is forbidden in normalization pipeline.',
      { path: pathRef },
    ));
    return null;
  }

  if (!isPlainObject(node.enabledWhen)) {
    diagnostics.errors.push(createDiagnostic(
      'E_MENU_NORMALIZATION_ENABLEDWHEN_INVALID',
      'enabledWhen must be an AST object or null.',
      { path: pathRef },
    ));
    return null;
  }

  const validation = validateEnabledWhenAst(node.enabledWhen);
  if (!validation.ok) {
    diagnostics.errors.push(createDiagnostic(
      'E_MENU_NORMALIZATION_ENABLEDWHEN_INVALID',
      `enabledWhen AST is invalid: ${validation.reasonCode}`,
      { path: pathRef, reasonCode: validation.reasonCode },
    ));
    return null;
  }

  return cloneJson(node.enabledWhen);
}

function evaluateVisibilityPolicy({
  canonicalCmdId,
  enabledWhenAst,
  modeGate,
  profileGate,
  stageGate,
  node,
  context,
  visibilityMatrix,
  diagnostics,
  pathRef,
}) {
  const profileNormalized = normalizeString(context.profile).toLowerCase();
  const explicitHidden = node.visible === false;
  const isCore = canonicalCmdId && visibilityMatrix.coreSafetyCommandAllowlist.includes(canonicalCmdId);
  const hideByMinimal = Boolean(
    canonicalCmdId
    && profileNormalized === 'minimal'
    && visibilityMatrix.rules.minimalProfileCanHideNonCore
    && visibilityMatrix.minimalProfileHiddenAllowlist.includes(canonicalCmdId)
    && !isCore,
  );

  if (explicitHidden) {
    if (isCore && profileNormalized === 'minimal') {
      diagnostics.errors.push(createDiagnostic(
        'E_MENU_NORMALIZATION_CORE_HIDDEN',
        `Core safety command cannot be hidden in Minimal profile: ${canonicalCmdId}`,
        { path: pathRef, canonicalCmdId },
      ));
      return {
        visibilityPolicy: 'visible_disabled',
        disabledReasonCode: 'CORE_HIDDEN_REJECTED',
      };
    }
    return {
      visibilityPolicy: 'hidden',
      disabledReasonCode: 'EXPLICIT_HIDDEN',
    };
  }

  if (hideByMinimal) {
    return {
      visibilityPolicy: 'hidden',
      disabledReasonCode: 'PROFILE_MINIMAL_HIDDEN',
    };
  }

  if (!modeGate.includes(context.mode)) {
    return {
      visibilityPolicy: 'visible_disabled',
      disabledReasonCode: 'MODE_GATED',
    };
  }

  if (!profileGate.includes(profileNormalized)) {
    return {
      visibilityPolicy: 'visible_disabled',
      disabledReasonCode: 'PROFILE_GATED',
    };
  }

  if (!stageGate.includes(context.stage)) {
    return {
      visibilityPolicy: 'visible_disabled',
      disabledReasonCode: 'STAGE_GATED',
    };
  }

  if (!canonicalCmdId || !enabledWhenAst) {
    return {
      visibilityPolicy: 'visible_enabled',
      disabledReasonCode: null,
    };
  }

  const evalState = evaluateEnabledWhenAst(enabledWhenAst, {
    mode: context.mode,
    profile: context.profile,
    stage: context.stage,
    platform: context.platform,
    hasDocument: context.hasDocument,
    selectionExists: context.selectionExists,
    flowModeActive: context.flowModeActive,
    scopeFlags: context.scopeFlags,
    flags: context.flags,
  });

  if (!evalState.ok) {
    diagnostics.errors.push(createDiagnostic(
      'E_MENU_NORMALIZATION_ENABLEDWHEN_EVAL_INVALID',
      `enabledWhen evaluation failed: ${evalState.reasonCode}`,
      { path: pathRef, reasonCode: evalState.reasonCode },
    ));
    return {
      visibilityPolicy: 'visible_disabled',
      disabledReasonCode: 'ENABLEDWHEN_INVALID',
    };
  }

  if (evalState.value !== true) {
    return {
      visibilityPolicy: 'visible_disabled',
      disabledReasonCode: 'ENABLEDWHEN_FALSE',
    };
  }

  return {
    visibilityPolicy: 'visible_enabled',
    disabledReasonCode: null,
  };
}

function normalizeNode(node, context, canon, visibilityMatrix, diagnostics, pathRef) {
  const id = normalizeString(node.id) || pathRef.replace(/[^a-zA-Z0-9._-]/g, '_');
  const modeGate = normalizeStringArray(node.mode, DEFAULT_MODE).map((value) => value.toLowerCase());
  const profileGate = normalizeStringArray(node.profile, DEFAULT_PROFILE).map((value) => value.toLowerCase());
  const stageGate = normalizeStringArray(node.stage, DEFAULT_STAGE);

  stageGate.forEach((stageValue) => {
    if (!STAGE_SET.has(stageValue)) {
      diagnostics.errors.push(createDiagnostic(
        'E_MENU_NORMALIZATION_STAGE_INVALID',
        `Unsupported stage value in gate: ${stageValue}`,
        { path: pathRef, stage: stageValue },
      ));
    }
  });

  const canonicalCmdId = deriveCanonicalCommandId(node, canon, context, diagnostics, pathRef);
  const enabledWhenAst = normalizeEnabledWhenAst(node, canonicalCmdId, diagnostics, pathRef);

  const visibilityState = evaluateVisibilityPolicy({
    canonicalCmdId,
    enabledWhenAst,
    modeGate,
    profileGate,
    stageGate,
    node,
    context,
    visibilityMatrix,
    diagnostics,
    pathRef,
  });

  const out = {
    id,
    canonicalCmdId: canonicalCmdId || null,
    enabledWhenAst,
    visibilityPolicy: visibilityState.visibilityPolicy,
    disabledReasonCode: visibilityState.disabledReasonCode,
    origin: normalizeString(node?.__meta?.origin) || 'base',
    sourceRefs: Array.isArray(node?.__meta?.sourceRefs)
      ? [...new Set(node.__meta.sourceRefs.map((entry) => normalizeString(entry)).filter(Boolean))].sort((a, b) => a.localeCompare(b))
      : [],
    mode: modeGate,
    profile: profileGate,
    stage: stageGate,
  };

  if (typeof node.label === 'string' && node.label.length > 0) out.label = node.label;
  if (typeof node.type === 'string' && node.type.length > 0) out.type = node.type;
  if (typeof node.role === 'string' && node.role.length > 0) out.role = node.role;
  if (typeof node.accelerator === 'string' && node.accelerator.length > 0) out.accelerator = node.accelerator;

  if (Array.isArray(node.items) && node.items.length > 0) {
    out.items = node.items.map((entry, index) => normalizeNode(
      entry,
      context,
      canon,
      visibilityMatrix,
      diagnostics,
      `${pathRef}.items[${index}]`,
    ));
    out.items.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
  }

  return out;
}

function normalizeMenuConfigPipeline(input = {}) {
  const diagnostics = {
    errors: [],
    warnings: [],
    overlayOrder: [],
  };
  const overlayCanon = getOverlayStackCanon();

  const baseConfigInput = isPlainObject(input.baseConfig) ? cloneJson(input.baseConfig) : null;
  if (!baseConfigInput || !Array.isArray(baseConfigInput.menus)) {
    diagnostics.errors.push(createDiagnostic(
      'E_MENU_NORMALIZATION_BASE_INVALID',
      'baseConfig must be an object with menus[]',
    ));
    return {
      ok: false,
      normalizedConfig: null,
      diagnostics,
      overlayStackApplied: [],
      inputFingerprintSha256: '',
      normalizedHashSha256: '',
    };
  }

  const context = normalizeContext(input.context);
  const mode = normalizeExecutionMode(input.mode, context);
  const baseSourceRef = normalizeString(input.baseSourceRef) || 'base:memory';
  annotateTreeMeta(baseConfigInput.menus, 'base', baseSourceRef);

  const overlays = collectOverlayInputs(input, overlayCanon, diagnostics, mode);
  diagnostics.overlayOrder = overlays.map((overlay) => ({
    origin: overlay.origin,
    sourceRef: overlay.sourceRef,
  }));

  overlays.forEach((overlay) => {
    mergeOverlayIntoConfig(baseConfigInput, overlay);
  });

  const canon = getCommandNamespaceCanon();
  const visibilityMatrix = getVisibilityMatrix();
  const spec = getNormalizationSpec();

  const normalizedMenus = baseConfigInput.menus.map((node, index) => normalizeNode(
    node,
    context,
    canon,
    visibilityMatrix,
    diagnostics,
    `$.menus[${index}]`,
  ));

  normalizedMenus.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));

  const normalizedConfig = {
    normalizedShapeVersion: normalizeString(spec.normalizedShapeVersion) || 'v1',
    menuConfigVersion: normalizeString(baseConfigInput.version) || 'v2',
    visibilityMatrixVersion: visibilityMatrix.version,
    menus: normalizedMenus,
  };
  const overlayStackApplied = [
    {
      origin: 'base',
      sourceRef: baseSourceRef,
      pluginId: '',
      overlayId: '',
      pluginVersion: '',
    },
    ...overlays.map((overlay) => ({
      origin: overlay.origin,
      sourceRef: overlay.sourceRef,
      pluginId: overlay.pluginId || '',
      overlayId: overlay.overlayId || '',
      pluginVersion: overlay.pluginVersion || '',
    })),
  ];

  const inputFingerprintPayload = {
    baseConfig: baseConfigInput,
    baseSourceRef,
    context,
    mode,
    overlayStackCanonVersion: overlayCanon.schemaVersion,
    overlays: overlays.map((overlay) => ({
      origin: overlay.origin,
      sourceRef: overlay.sourceRef,
      pluginId: overlay.pluginId || '',
      overlayId: overlay.overlayId || '',
      pluginVersion: overlay.pluginVersion || '',
      signatureStatus: overlay.signatureStatus || '',
      config: overlay.config,
    })),
  };
  const inputFingerprintSha256 = crypto
    .createHash('sha256')
    .update(stableStringify(inputFingerprintPayload))
    .digest('hex');

  const ok = diagnostics.errors.length === 0;
  const normalizedStable = ok ? stableSortObject(normalizedConfig) : null;
  const normalizedHashSha256 = ok ? hashNormalizedConfig(normalizedStable) : '';

  return {
    ok,
    normalizedConfig: normalizedStable,
    diagnostics,
    overlayStackApplied,
    inputFingerprintSha256,
    normalizedHashSha256,
  };
}

module.exports = {
  NORMALIZATION_SPEC_PATH,
  OVERLAY_STACK_CANON_PATH,
  VISIBILITY_MATRIX_PATH,
  getOverlayStackCanon,
  hashNormalizedConfig,
  normalizeMenuConfigPipeline,
  stableStringify,
};
