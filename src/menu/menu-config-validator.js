const fsSync = require('fs');
const path = require('path');

const MENU_CONFIG_PATH = path.join(__dirname, 'menu-config.v1.json');
const MENU_SCHEMA_PATH = path.join(__dirname, 'menu-config.schema.v1.json');
const MENU_SCHEMA_V2_PATH = path.join(__dirname, 'menu-config.schema.v2.json');
const MENU_FALLBACK_MESSAGE = 'Safe fallback menu will be used.';
const MENU_DEFAULT_MODE = ['offline'];
const MENU_DEFAULT_PROFILE = ['minimal', 'pro', 'guru'];
const MENU_DEFAULT_STAGE = ['X0', 'X1', 'X2', 'X3', 'X4', 'X5'];
const MENU_DEFAULT_ENABLED_WHEN = 'always';

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

function normalizeMenuNodeToV2(node) {
  if (!isPlainObject(node)) return node;
  const normalized = { ...node };
  normalized.mode = normalizeGateArray(node.mode, MENU_DEFAULT_MODE);
  normalized.profile = normalizeGateArray(node.profile, MENU_DEFAULT_PROFILE);
  normalized.stage = normalizeGateArray(node.stage, MENU_DEFAULT_STAGE);
  normalized.enabledWhen =
    typeof node.enabledWhen === 'string' && node.enabledWhen.length > 0
      ? node.enabledWhen
      : MENU_DEFAULT_ENABLED_WHEN;
  if (Array.isArray(node.items)) {
    normalized.items = node.items.map((entry) => normalizeMenuNodeToV2(entry));
  }
  return normalized;
}

function normalizeMenuConfigToV2(menuConfig) {
  if (!isPlainObject(menuConfig)) return menuConfig;
  const normalized = { ...menuConfig };
  normalized.version = 'v2';
  normalized.menus = Array.isArray(menuConfig.menus)
    ? menuConfig.menus.map((entry) => normalizeMenuNodeToV2(entry))
    : [];
  return normalized;
}

function evaluateMenuItemEnabled(node, context = {}) {
  const normalized = normalizeMenuNodeToV2(node);
  const mode = typeof context.mode === 'string' ? context.mode : 'offline';
  const profile = typeof context.profile === 'string' ? context.profile : 'minimal';
  const stage = typeof context.stage === 'string' ? context.stage : 'X1';

  if (Array.isArray(normalized.mode) && !normalized.mode.includes(mode)) {
    return { enabled: false, reason: 'E_MENU_GATE_MODE' };
  }
  if (Array.isArray(normalized.profile) && !normalized.profile.includes(profile)) {
    return { enabled: false, reason: 'E_MENU_GATE_PROFILE' };
  }
  if (Array.isArray(normalized.stage) && !normalized.stage.includes(stage)) {
    return { enabled: false, reason: 'E_MENU_GATE_STAGE' };
  }

  switch (normalized.enabledWhen) {
    case 'always':
      return { enabled: true, reason: '' };
    case 'hasDocument':
      return context.hasDocument === true
        ? { enabled: true, reason: '' }
        : { enabled: false, reason: 'E_MENU_GATE_ENABLED_WHEN_HAS_DOCUMENT' };
    case 'selectionExists':
      return context.selectionExists === true
        ? { enabled: true, reason: '' }
        : { enabled: false, reason: 'E_MENU_GATE_ENABLED_WHEN_SELECTION_EXISTS' };
    default:
      return { enabled: false, reason: 'E_MENU_GATE_ENABLED_WHEN' };
  }
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
      errors: [createError('E_MENU_CONFIG_READ', '$', String(error.message))]
    };
  }

  const configParsed = safeJsonParse(configRaw, 'Menu config');
  if (!configParsed.ok) {
    return {
      ok: false,
      failReason: configParsed.failReason,
      errors: [createError('E_MENU_CONFIG_PARSE', '$', configParsed.failReason)]
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
      errors: [createError('E_MENU_SCHEMA_READ', '$', String(error.message))]
    };
  }

  const schemaParsed = safeJsonParse(schemaRaw, 'Menu schema');
  if (!schemaParsed.ok) {
    return {
      ok: false,
      failReason: schemaParsed.failReason,
      errors: [createError('E_MENU_SCHEMA_PARSE', '$', schemaParsed.failReason)]
    };
  }

  const validation = validateMenuConfigAgainstSchema(configParsed.value, schemaParsed.value);
  const normalizedConfig = validation.ok ? normalizeMenuConfigToV2(configParsed.value) : null;
  return {
    ok: validation.ok,
    version: configVersion,
    config: configParsed.value,
    normalizedConfig,
    schema: schemaParsed.value,
    errors: validation.errors,
    failReason: validation.ok ? '' : validation.errors[0].message
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
    fallbackMessage: ok ? '' : MENU_FALLBACK_MESSAGE
  };
}

module.exports = {
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
