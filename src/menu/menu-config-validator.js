const fsSync = require('fs');
const path = require('path');
const { resolveMenuCommandId } = require('./command-namespace-canon.js');
const {
  DEFAULT_ENABLED_WHEN_AST,
  evaluateEnabledWhenAst,
  validateEnabledWhenAst,
} = require('./enabledwhen-eval.js');

const MENU_CONFIG_PATH = path.join(__dirname, 'menu-config.v1.json');
const MENU_SCHEMA_PATH = path.join(__dirname, 'menu-config.schema.v1.json');
const MENU_SCHEMA_V2_PATH = path.join(__dirname, 'menu-config.schema.v2.json');
const COMMAND_VISIBILITY_MATRIX_PATH = path.join(__dirname, '..', '..', 'docs', 'OPS', 'STATUS', 'COMMAND_VISIBILITY_MATRIX.json');
const MENU_FALLBACK_MESSAGE = 'Safe fallback menu will be used.';
const MENU_DEFAULT_MODE = ['offline'];
const MENU_DEFAULT_PROFILE = ['minimal', 'pro', 'guru'];
const MENU_DEFAULT_STAGE = ['X0', 'X1', 'X2', 'X3', 'X4'];
const MENU_DEFAULT_ENABLED_WHEN = DEFAULT_ENABLED_WHEN_AST;

const LEGACY_ENABLED_WHEN_MAP = Object.freeze({
  always: {
    op: 'all',
    args: [],
  },
  hasDocument: {
    op: 'flag',
    name: 'hasDocument',
  },
  selectionExists: {
    op: 'flag',
    name: 'selectionExists',
  },
});

let visibilityMatrixCache = null;

function makePath(base, segment) {
  if (segment === undefined || segment === null || segment === '') {
    return base;
  }
  if (typeof segment === 'number') {
    return `${base}[${segment}]`;
  }
  return base === '$' ? `$.${segment}` : `${base}.${segment}`;
}

function createError(code, atPath, message) {
  return {
    code,
    path: atPath,
    message
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function hasV2Fields(node) {
  if (!isPlainObject(node)) return false;
  if (
    Object.prototype.hasOwnProperty.call(node, 'mode') ||
    Object.prototype.hasOwnProperty.call(node, 'profile') ||
    Object.prototype.hasOwnProperty.call(node, 'stage') ||
    Object.prototype.hasOwnProperty.call(node, 'enabledWhen')
  ) {
    return true;
  }
  if (!Array.isArray(node.items)) return false;
  return node.items.some((entry) => hasV2Fields(entry));
}

function detectMenuConfigVersion(menuConfig) {
  if (!isPlainObject(menuConfig)) return 'v1';
  if (menuConfig.version === 'v2') return 'v2';
  if (menuConfig.version === 'v1') return 'v1';
  if (Array.isArray(menuConfig.menus) && menuConfig.menus.some((node) => hasV2Fields(node))) {
    return 'v2';
  }
  return 'v1';
}

function resolveLocalRef(rootSchema, ref) {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) {
    return null;
  }
  const parts = ref.slice(2).split('/');
  let current = rootSchema;
  for (const part of parts) {
    if (!isPlainObject(current) || !Object.prototype.hasOwnProperty.call(current, part)) {
      return null;
    }
    current = current[part];
  }
  return current;
}

function validateNode(value, schema, rootSchema, atPath, errors) {
  if (!isPlainObject(schema)) {
    errors.push(createError('E_MENU_SCHEMA_INVALID', atPath, 'Schema node must be an object.'));
    return;
  }

  if (schema.$ref !== undefined) {
    const resolved = resolveLocalRef(rootSchema, schema.$ref);
    if (!resolved) {
      errors.push(createError('E_MENU_SCHEMA_INVALID', atPath, `Unable to resolve ref: ${schema.$ref}`));
      return;
    }
    validateNode(value, resolved, rootSchema, atPath, errors);
    return;
  }

  if (schema.const !== undefined && value !== schema.const) {
    errors.push(createError('E_MENU_SCHEMA_CONST', atPath, `Expected constant value "${String(schema.const)}".`));
    return;
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(createError('E_MENU_SCHEMA_ENUM', atPath, `Expected one of: ${schema.enum.join(', ')}.`));
    return;
  }

  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    let matches = 0;
    for (const rule of schema.oneOf) {
      const branchErrors = [];
      validateNode(value, rule, rootSchema, atPath, branchErrors);
      if (branchErrors.length === 0) {
        matches += 1;
      }
    }
    if (matches !== 1) {
      errors.push(
        createError('E_MENU_SCHEMA_ONE_OF', atPath, `Expected exactly one oneOf branch to match, actual matches: ${matches}.`)
      );
      return;
    }
    if (schema.type === undefined) {
      return;
    }
  }

  if (schema.type === 'object') {
    if (!isPlainObject(value)) {
      errors.push(createError('E_MENU_SCHEMA_TYPE', atPath, 'Expected object.'));
      return;
    }

    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        errors.push(createError('E_MENU_SCHEMA_REQUIRED', makePath(atPath, key), 'Required property is missing.'));
      }
    }

    const properties = isPlainObject(schema.properties) ? schema.properties : {};
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) {
          errors.push(createError('E_MENU_SCHEMA_ADDITIONAL', makePath(atPath, key), 'Unknown property is not allowed.'));
        }
      }
    }

    for (const [key, subSchema] of Object.entries(properties)) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        validateNode(value[key], subSchema, rootSchema, makePath(atPath, key), errors);
      }
    }
    return;
  }

  if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      errors.push(createError('E_MENU_SCHEMA_TYPE', atPath, 'Expected array.'));
      return;
    }
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      errors.push(createError('E_MENU_SCHEMA_MIN_ITEMS', atPath, `Expected at least ${schema.minItems} item(s).`));
    }
    if (schema.items !== undefined) {
      value.forEach((entry, index) => {
        validateNode(entry, schema.items, rootSchema, makePath(atPath, index), errors);
      });
    }
    return;
  }

  if (schema.type === 'string') {
    if (typeof value !== 'string') {
      errors.push(createError('E_MENU_SCHEMA_TYPE', atPath, 'Expected string.'));
      return;
    }
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      errors.push(createError('E_MENU_SCHEMA_MIN_LENGTH', atPath, `Expected minimum string length ${schema.minLength}.`));
    }
    if (typeof schema.pattern === 'string') {
      const pattern = new RegExp(schema.pattern);
      if (!pattern.test(value)) {
        errors.push(createError('E_MENU_SCHEMA_PATTERN', atPath, 'String does not satisfy required pattern.'));
      }
    }
    return;
  }

  if (schema.type === 'boolean') {
    if (typeof value !== 'boolean') {
      errors.push(createError('E_MENU_SCHEMA_TYPE', atPath, 'Expected boolean.'));
    }
    return;
  }

  if (schema.type !== undefined) {
    errors.push(createError('E_MENU_SCHEMA_UNSUPPORTED_TYPE', atPath, `Unsupported schema type: ${String(schema.type)}.`));
  }
}

function validateMenuConfigAgainstSchema(menuConfig, schemaDoc) {
  const errors = [];
  validateNode(menuConfig, schemaDoc, schemaDoc, '$', errors);
  return {
    ok: errors.length === 0,
    errors
  };
}

function safeJsonParse(raw, kind) {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (error) {
    return {
      ok: false,
      failReason: `${kind} is not valid JSON: ${error.message}`
    };
  }
}

function normalizeGateArray(value, fallback) {
  if (!Array.isArray(value) || value.length === 0) {
    return fallback.slice();
  }
  const unique = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    if (!unique.includes(entry)) unique.push(entry);
  }
  return unique.length > 0 ? unique : fallback.slice();
}

function makeCommandNamespaceError(location, commandId, resolution) {
  const reason = resolution && typeof resolution.reason === 'string'
    ? resolution.reason
    : 'COMMAND_NAMESPACE_RESOLUTION_FAILED';
  return createError(
    'E_MENU_COMMAND_NAMESPACE',
    location,
    `Command namespace validation failed for "${String(commandId || '')}": ${reason}.`
  );
}

function normalizeEnabledWhenExpression(value) {
  if (value === undefined || value === null) {
    return cloneJson(MENU_DEFAULT_ENABLED_WHEN);
  }
  if (typeof value === 'string') {
    const mapped = LEGACY_ENABLED_WHEN_MAP[value];
    if (mapped) return cloneJson(mapped);
    return value;
  }
  if (isPlainObject(value)) return cloneJson(value);
  return value;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const entry of value) {
    const normalized = typeof entry === 'string' ? entry.trim() : '';
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function loadVisibilityMatrix() {
  if (visibilityMatrixCache) return visibilityMatrixCache;
  let parsed = {};
  try {
    parsed = JSON.parse(fsSync.readFileSync(COMMAND_VISIBILITY_MATRIX_PATH, 'utf8'));
  } catch {
    parsed = {};
  }
  const source = isPlainObject(parsed) ? parsed : {};
  const rules = isPlainObject(source.rules) ? source.rules : {};
  visibilityMatrixCache = {
    version: typeof source.version === 'string' ? source.version : 'v1',
    states: normalizeStringArray(source.states),
    rules: {
      stageGatedDefaultState: typeof rules.stageGatedDefaultState === 'string'
        ? rules.stageGatedDefaultState
        : 'visible+disabled(reason="STAGE_GATED")',
      minimalProfileCanHideNonCore: rules.minimalProfileCanHideNonCore === true,
    },
    minimalProfileHiddenAllowlist: normalizeStringArray(source.minimalProfileHiddenAllowlist),
    coreSafetyCommandAllowlist: normalizeStringArray(source.coreSafetyCommandAllowlist),
  };
  return visibilityMatrixCache;
}

function inferVisibilityPolicy(normalizedNode, visibilityMatrix) {
  const commandId = typeof normalizedNode.canonicalCmdId === 'string' && normalizedNode.canonicalCmdId.length > 0
    ? normalizedNode.canonicalCmdId
    : (typeof normalizedNode.command === 'string' ? normalizedNode.command : '');
  const hideAllowed = visibilityMatrix.rules.minimalProfileCanHideNonCore
    && visibilityMatrix.minimalProfileHiddenAllowlist.includes(commandId)
    && !visibilityMatrix.coreSafetyCommandAllowlist.includes(commandId);
  return {
    matrixVersion: visibilityMatrix.version,
    stageGatedDefaultState: visibilityMatrix.rules.stageGatedDefaultState,
    minimalProfileHideAllowed: hideAllowed,
  };
}

function shouldHideForMinimalProfile(normalizedNode, profile, visibilityMatrix) {
  if (profile !== 'minimal') return false;
  if (!visibilityMatrix.rules.minimalProfileCanHideNonCore) return false;
  const commandId = typeof normalizedNode.canonicalCmdId === 'string' && normalizedNode.canonicalCmdId.length > 0
    ? normalizedNode.canonicalCmdId
    : (typeof normalizedNode.command === 'string' ? normalizedNode.command : '');
  if (!commandId) return false;
  if (!visibilityMatrix.minimalProfileHiddenAllowlist.includes(commandId)) return false;
  if (visibilityMatrix.coreSafetyCommandAllowlist.includes(commandId)) return false;
  return true;
}

function normalizeMenuNodeToV2(node, options = {}) {
  if (!isPlainObject(node)) return node;
  const errors = Array.isArray(options.errors) ? options.errors : [];
  const atPath = typeof options.path === 'string' && options.path.length > 0 ? options.path : '$';
  const today = options.today;
  const hasEnabledWhenErrorRef = isPlainObject(options.hasEnabledWhenErrorRef)
    ? options.hasEnabledWhenErrorRef
    : { value: false };
  const visibilityMatrix = options.visibilityMatrix || loadVisibilityMatrix();

  const normalized = { ...node };
  normalized.mode = normalizeGateArray(node.mode, MENU_DEFAULT_MODE);
  normalized.profile = normalizeGateArray(node.profile, MENU_DEFAULT_PROFILE);
  normalized.stage = normalizeGateArray(node.stage, MENU_DEFAULT_STAGE);
  normalized.enabledWhen = normalizeEnabledWhenExpression(node.enabledWhen);

  const enabledWhenValidation = validateEnabledWhenAst(normalized.enabledWhen);
  if (!enabledWhenValidation.ok) {
    hasEnabledWhenErrorRef.value = true;
    errors.push(
      createError(
        'E_MENU_ENABLED_WHEN',
        makePath(atPath, 'enabledWhen'),
        `enabledWhen DSL validation failed: ${enabledWhenValidation.reasonCode}`,
      ),
    );
  }

  if (typeof node.command === 'string') {
    const commandPath = makePath(atPath, 'command');
    const resolution = resolveMenuCommandId(node.command, {
      enforceSunset: true,
      today,
    });
    if (!resolution.ok) {
      errors.push(makeCommandNamespaceError(commandPath, node.command, resolution));
    } else {
      normalized.command = resolution.commandId;
      normalized.canonicalCmdId = resolution.canonicalCommandId;
    }
  }

  if (Array.isArray(node.items)) {
    normalized.items = node.items.map((entry, index) => normalizeMenuNodeToV2(entry, {
      errors,
      path: makePath(makePath(atPath, 'items'), index),
      today,
      hasEnabledWhenErrorRef,
      visibilityMatrix,
    }));
  }

  normalized.visibilityPolicy = inferVisibilityPolicy(normalized, visibilityMatrix);
  return normalized;
}

function normalizeMenuConfigToV2(menuConfig, options = {}) {
  if (!isPlainObject(menuConfig)) return menuConfig;
  const errors = Array.isArray(options.errors) ? options.errors : [];
  const today = options.today;
  const hasEnabledWhenErrorRef = isPlainObject(options.hasEnabledWhenErrorRef)
    ? options.hasEnabledWhenErrorRef
    : { value: false };
  const visibilityMatrix = options.visibilityMatrix || loadVisibilityMatrix();
  const menusPath = makePath('$', 'menus');
  const normalized = { ...menuConfig };
  normalized.version = 'v2';
  normalized.menus = Array.isArray(menuConfig.menus)
    ? menuConfig.menus.map((entry, index) => normalizeMenuNodeToV2(entry, {
      errors,
      path: makePath(menusPath, index),
      today,
      hasEnabledWhenErrorRef,
      visibilityMatrix,
    }))
    : [];
  normalized.visibilityMatrixVersion = visibilityMatrix.version;
  return normalized;
}

function evaluateMenuItemEnabled(node, context = {}) {
  const visibilityMatrix = loadVisibilityMatrix();
  const normalized = normalizeMenuNodeToV2(node, { visibilityMatrix, hasEnabledWhenErrorRef: { value: false } });
  const mode = typeof context.mode === 'string' ? context.mode : 'offline';
  const profile = typeof context.profile === 'string' ? context.profile : 'minimal';
  const stage = typeof context.stage === 'string' ? context.stage : 'X1';

  if (Array.isArray(normalized.mode) && !normalized.mode.includes(mode)) {
    return { enabled: false, visible: true, reason: 'E_MENU_GATE_MODE' };
  }
  if (Array.isArray(normalized.profile) && !normalized.profile.includes(profile)) {
    return { enabled: false, visible: true, reason: 'E_MENU_GATE_PROFILE' };
  }
  if (shouldHideForMinimalProfile(normalized, profile, visibilityMatrix)) {
    return { enabled: false, visible: false, reason: 'E_MENU_VISIBILITY_HIDDEN_PROFILE_MINIMAL' };
  }
  if (Array.isArray(normalized.stage) && !normalized.stage.includes(stage)) {
    return {
      enabled: false,
      visible: true,
      reason: 'E_MENU_GATE_STAGE',
      visibilityReason: 'STAGE_GATED',
    };
  }

  const enabledState = evaluateEnabledWhenAst(normalized.enabledWhen, {
    mode,
    profile,
    stage,
    platform: typeof context.platform === 'string' ? context.platform : '',
    hasDocument: context.hasDocument === true,
    selectionExists: context.selectionExists === true,
    flowModeActive: context.flowModeActive === true,
    flags: isPlainObject(context.flags) ? context.flags : {},
    scopeFlags: isPlainObject(context.scopeFlags) ? context.scopeFlags : {},
  });

  if (!enabledState.ok) {
    return {
      enabled: false,
      visible: true,
      reason: 'E_MENU_GATE_ENABLED_WHEN_INVALID',
      reasonCode: enabledState.reasonCode,
    };
  }
  if (!enabledState.value) {
    return {
      enabled: false,
      visible: true,
      reason: 'E_MENU_GATE_ENABLED_WHEN_FALSE',
      reasonCode: enabledState.reasonCode,
    };
  }

  return { enabled: true, visible: true, reason: '' };
}

function loadAndValidateMenuConfig(options = {}) {
  const configPath = options.configPath || MENU_CONFIG_PATH;

  let configRaw;
  try {
    configRaw = fsSync.readFileSync(configPath, 'utf8');
  } catch (error) {
    return {
      ok: false,
      failReason: `Cannot read menu config: ${error.message}`,
      errors: [createError('E_MENU_CONFIG_READ', '$', String(error.message))],
      hasEnabledWhenError: false,
    };
  }

  const configParsed = safeJsonParse(configRaw, 'Menu config');
  if (!configParsed.ok) {
    return {
      ok: false,
      failReason: configParsed.failReason,
      errors: [createError('E_MENU_CONFIG_PARSE', '$', configParsed.failReason)],
      hasEnabledWhenError: false,
    };
  }

  const configVersion = detectMenuConfigVersion(configParsed.value);
  const schemaPath =
    options.schemaPath || (configVersion === 'v2' ? MENU_SCHEMA_V2_PATH : MENU_SCHEMA_PATH);

  let schemaRaw;
  try {
    schemaRaw = fsSync.readFileSync(schemaPath, 'utf8');
  } catch (error) {
    return {
      ok: false,
      failReason: `Cannot read menu schema: ${error.message}`,
      errors: [createError('E_MENU_SCHEMA_READ', '$', String(error.message))],
      hasEnabledWhenError: false,
    };
  }

  const schemaParsed = safeJsonParse(schemaRaw, 'Menu schema');
  if (!schemaParsed.ok) {
    return {
      ok: false,
      failReason: schemaParsed.failReason,
      errors: [createError('E_MENU_SCHEMA_PARSE', '$', schemaParsed.failReason)],
      hasEnabledWhenError: false,
    };
  }

  const validation = validateMenuConfigAgainstSchema(configParsed.value, schemaParsed.value);
  const namespaceErrors = [];
  const hasEnabledWhenErrorRef = { value: false };
  const visibilityMatrix = loadVisibilityMatrix();
  const normalizedConfig = validation.ok
    ? normalizeMenuConfigToV2(configParsed.value, {
      errors: namespaceErrors,
      today: options.today,
      hasEnabledWhenErrorRef,
      visibilityMatrix,
    })
    : null;
  const errors = [...validation.errors, ...namespaceErrors];
  const hasEnabledWhenError = hasEnabledWhenErrorRef.value
    || errors.some((entry) => {
      const atPath = typeof entry.path === 'string' ? entry.path : '';
      return entry.code === 'E_MENU_ENABLED_WHEN' || atPath.includes('enabledWhen');
    });
  const ok = errors.length === 0;
  return {
    ok,
    version: configVersion,
    config: configParsed.value,
    normalizedConfig,
    schema: schemaParsed.value,
    errors,
    hasEnabledWhenError,
    failReason: ok ? '' : errors[0].message
  };
}

function toMenuConfigRuntimeState(validationState) {
  const ok = Boolean(validationState && validationState.ok);
  const failReason = ok ? '' : String(validationState && validationState.failReason ? validationState.failReason : 'Menu config validation failed.');
  const errors = Array.isArray(validationState && validationState.errors) ? validationState.errors : [];
  return {
    ok,
    failReason,
    errors,
    fallbackUsed: ok ? false : true,
    fallbackMessage: ok ? '' : MENU_FALLBACK_MESSAGE,
    hasEnabledWhenError: validationState && validationState.hasEnabledWhenError === true,
  };
}

module.exports = {
  COMMAND_VISIBILITY_MATRIX_PATH,
  MENU_CONFIG_PATH,
  MENU_SCHEMA_PATH,
  MENU_SCHEMA_V2_PATH,
  MENU_FALLBACK_MESSAGE,
  detectMenuConfigVersion,
  evaluateMenuItemEnabled,
  loadAndValidateMenuConfig,
  normalizeMenuConfigToV2,
  toMenuConfigRuntimeState,
  validateMenuConfigAgainstSchema
};
