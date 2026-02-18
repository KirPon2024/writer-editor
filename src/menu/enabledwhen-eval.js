const fsSync = require('fs');
const path = require('path');

const CANON_PATH = path.join(__dirname, '..', '..', 'docs', 'OPS', 'STATUS', 'ENABLEDWHEN_DSL_CANON.json');
const DEFAULT_AST = Object.freeze({
  op: 'all',
  args: Object.freeze([]),
});
const SCALAR_TYPES = new Set(['string', 'number', 'boolean']);

let canonCache = null;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const entry of value) {
    const normalized = normalizeString(entry);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function normalizeInteger(value, fallback) {
  const intValue = Number(value);
  if (!Number.isInteger(intValue) || intValue < 1) return fallback;
  return intValue;
}

function normalizeCanonDoc(input) {
  const source = isPlainObject(input) ? input : {};
  return Object.freeze({
    version: normalizeString(source.version) || 'v1',
    allowedOperators: Object.freeze(normalizeStringArray(source.allowedOperators)),
    allowedOperands: Object.freeze(normalizeStringArray(source.allowedOperands)),
    allowedModeValues: Object.freeze(normalizeStringArray(source.allowedModeValues)),
    allowedProfileValues: Object.freeze(normalizeStringArray(source.allowedProfileValues)),
    allowedPlatformValues: Object.freeze(normalizeStringArray(source.allowedPlatformValues)),
    allowedStageValues: Object.freeze(normalizeStringArray(source.allowedStageValues)),
    maxDepth: normalizeInteger(source.maxDepth, 4),
    maxNodes: normalizeInteger(source.maxNodes, 32),
    noRegex: source.noRegex !== false,
    noDynamicKeys: source.noDynamicKeys !== false,
    determinismRule: source.determinismRule !== false,
  });
}

function getCanon() {
  if (canonCache) return canonCache;
  const raw = JSON.parse(fsSync.readFileSync(CANON_PATH, 'utf8'));
  canonCache = normalizeCanonDoc(raw);
  return canonCache;
}

function isScalar(value) {
  if (value === null) return true;
  return SCALAR_TYPES.has(typeof value);
}

function checkNoRegex(value) {
  if (value instanceof RegExp) return false;
  if (Array.isArray(value)) return value.every((entry) => checkNoRegex(entry));
  if (!isPlainObject(value)) return true;
  return Object.values(value).every((entry) => checkNoRegex(entry));
}

function hasOnlyKeys(node, allowedKeys) {
  const keys = Object.keys(node);
  return keys.every((key) => allowedKeys.includes(key));
}

function validateNode(node, canon, state, depth) {
  state.nodeCount += 1;
  if (state.nodeCount > canon.maxNodes) {
    state.reasonCode = 'E_ENABLEDWHEN_DSL_MAX_NODES_EXCEEDED';
    return false;
  }
  if (depth > canon.maxDepth) {
    state.reasonCode = 'E_ENABLEDWHEN_DSL_MAX_DEPTH_EXCEEDED';
    return false;
  }
  if (!isPlainObject(node)) {
    state.reasonCode = 'E_ENABLEDWHEN_DSL_NODE_TYPE_INVALID';
    return false;
  }
  if (!checkNoRegex(node) && canon.noRegex) {
    state.reasonCode = 'E_ENABLEDWHEN_DSL_REGEX_FORBIDDEN';
    return false;
  }

  const op = normalizeString(node.op);
  if (!op) {
    state.reasonCode = 'E_ENABLEDWHEN_DSL_OPERATOR_MISSING';
    return false;
  }
  if (!canon.allowedOperators.includes(op)) {
    state.reasonCode = 'E_ENABLEDWHEN_DSL_OPERATOR_UNKNOWN';
    return false;
  }

  if (op === 'all' || op === 'any') {
    if (canon.noDynamicKeys && !hasOnlyKeys(node, ['op', 'args'])) {
      state.reasonCode = 'E_ENABLEDWHEN_DSL_DYNAMIC_KEYS_FORBIDDEN';
      return false;
    }
    if (!Array.isArray(node.args)) {
      state.reasonCode = 'E_ENABLEDWHEN_DSL_ARGS_INVALID';
      return false;
    }
    for (const entry of node.args) {
      if (!validateNode(entry, canon, state, depth + 1)) return false;
    }
    return true;
  }

  if (op === 'not') {
    if (canon.noDynamicKeys && !hasOnlyKeys(node, ['op', 'arg'])) {
      state.reasonCode = 'E_ENABLEDWHEN_DSL_DYNAMIC_KEYS_FORBIDDEN';
      return false;
    }
    return validateNode(node.arg, canon, state, depth + 1);
  }

  if (op === 'eq' || op === 'neq') {
    if (canon.noDynamicKeys && !hasOnlyKeys(node, ['op', 'left', 'right'])) {
      state.reasonCode = 'E_ENABLEDWHEN_DSL_DYNAMIC_KEYS_FORBIDDEN';
      return false;
    }
    const left = normalizeString(node.left);
    if (!canon.allowedOperands.includes(left)) {
      state.reasonCode = 'E_ENABLEDWHEN_DSL_OPERAND_UNKNOWN';
      return false;
    }
    if (!isScalar(node.right)) {
      state.reasonCode = 'E_ENABLEDWHEN_DSL_VALUE_INVALID';
      return false;
    }
    return true;
  }

  if (op === 'in') {
    if (canon.noDynamicKeys && !hasOnlyKeys(node, ['op', 'left', 'right'])) {
      state.reasonCode = 'E_ENABLEDWHEN_DSL_DYNAMIC_KEYS_FORBIDDEN';
      return false;
    }
    const left = normalizeString(node.left);
    if (!canon.allowedOperands.includes(left)) {
      state.reasonCode = 'E_ENABLEDWHEN_DSL_OPERAND_UNKNOWN';
      return false;
    }
    if (!Array.isArray(node.right) || node.right.length === 0) {
      state.reasonCode = 'E_ENABLEDWHEN_DSL_VALUE_INVALID';
      return false;
    }
    if (!node.right.every((entry) => isScalar(entry))) {
      state.reasonCode = 'E_ENABLEDWHEN_DSL_VALUE_INVALID';
      return false;
    }
    return true;
  }

  if (op === 'flag') {
    if (canon.noDynamicKeys && !hasOnlyKeys(node, ['op', 'name'])) {
      state.reasonCode = 'E_ENABLEDWHEN_DSL_DYNAMIC_KEYS_FORBIDDEN';
      return false;
    }
    const name = normalizeString(node.name);
    if (!canon.allowedOperands.includes(name)) {
      state.reasonCode = 'E_ENABLEDWHEN_DSL_OPERAND_UNKNOWN';
      return false;
    }
    return true;
  }

  if (op === 'modeIs') {
    if (canon.noDynamicKeys && !hasOnlyKeys(node, ['op', 'value'])) {
      state.reasonCode = 'E_ENABLEDWHEN_DSL_DYNAMIC_KEYS_FORBIDDEN';
      return false;
    }
    if (!canon.allowedModeValues.includes(normalizeString(node.value))) {
      state.reasonCode = 'E_ENABLEDWHEN_DSL_VALUE_INVALID';
      return false;
    }
    return true;
  }

  if (op === 'profileIs') {
    if (canon.noDynamicKeys && !hasOnlyKeys(node, ['op', 'value'])) {
      state.reasonCode = 'E_ENABLEDWHEN_DSL_DYNAMIC_KEYS_FORBIDDEN';
      return false;
    }
    if (!canon.allowedProfileValues.includes(normalizeString(node.value))) {
      state.reasonCode = 'E_ENABLEDWHEN_DSL_VALUE_INVALID';
      return false;
    }
    return true;
  }

  if (op === 'platformIs') {
    if (canon.noDynamicKeys && !hasOnlyKeys(node, ['op', 'value'])) {
      state.reasonCode = 'E_ENABLEDWHEN_DSL_DYNAMIC_KEYS_FORBIDDEN';
      return false;
    }
    if (!canon.allowedPlatformValues.includes(normalizeString(node.value))) {
      state.reasonCode = 'E_ENABLEDWHEN_DSL_VALUE_INVALID';
      return false;
    }
    return true;
  }

  if (op === 'stageGte') {
    if (canon.noDynamicKeys && !hasOnlyKeys(node, ['op', 'value'])) {
      state.reasonCode = 'E_ENABLEDWHEN_DSL_DYNAMIC_KEYS_FORBIDDEN';
      return false;
    }
    if (!canon.allowedStageValues.includes(normalizeString(node.value))) {
      state.reasonCode = 'E_ENABLEDWHEN_DSL_VALUE_INVALID';
      return false;
    }
    return true;
  }

  state.reasonCode = 'E_ENABLEDWHEN_DSL_OPERATOR_UNSUPPORTED';
  return false;
}

function readOperand(operandName, context) {
  const normalized = normalizeString(operandName);
  if (!normalized) return undefined;
  if (Object.prototype.hasOwnProperty.call(context, normalized)) {
    return context[normalized];
  }
  if (isPlainObject(context.flags) && Object.prototype.hasOwnProperty.call(context.flags, normalized)) {
    return context.flags[normalized];
  }
  if (isPlainObject(context.scopeFlags) && Object.prototype.hasOwnProperty.call(context.scopeFlags, normalized)) {
    return context.scopeFlags[normalized];
  }
  return undefined;
}

function toStageRankMap(stageValues) {
  const map = new Map();
  stageValues.forEach((stage, index) => map.set(stage, index));
  return map;
}

function evaluateNode(node, context, canon, stageRank) {
  const op = normalizeString(node.op);
  if (op === 'all') {
    for (const entry of node.args) {
      if (!evaluateNode(entry, context, canon, stageRank)) return false;
    }
    return true;
  }
  if (op === 'any') {
    for (const entry of node.args) {
      if (evaluateNode(entry, context, canon, stageRank)) return true;
    }
    return false;
  }
  if (op === 'not') {
    return !evaluateNode(node.arg, context, canon, stageRank);
  }
  if (op === 'eq') {
    return readOperand(node.left, context) === node.right;
  }
  if (op === 'neq') {
    return readOperand(node.left, context) !== node.right;
  }
  if (op === 'in') {
    return node.right.includes(readOperand(node.left, context));
  }
  if (op === 'flag') {
    return Boolean(readOperand(node.name, context));
  }
  if (op === 'modeIs') {
    return normalizeString(readOperand('mode', context)) === normalizeString(node.value);
  }
  if (op === 'profileIs') {
    return normalizeString(readOperand('profile', context)) === normalizeString(node.value);
  }
  if (op === 'platformIs') {
    return normalizeString(readOperand('platform', context)) === normalizeString(node.value);
  }
  if (op === 'stageGte') {
    const currentStage = normalizeString(readOperand('stage', context));
    const expectedStage = normalizeString(node.value);
    if (!stageRank.has(currentStage) || !stageRank.has(expectedStage)) return false;
    return stageRank.get(currentStage) >= stageRank.get(expectedStage);
  }
  return false;
}

function validateEnabledWhenAst(ast, options = {}) {
  const canon = isPlainObject(options.canon) ? normalizeCanonDoc(options.canon) : getCanon();
  const state = {
    nodeCount: 0,
    reasonCode: '',
  };
  const rootAst = ast === undefined ? DEFAULT_AST : ast;
  const ok = validateNode(rootAst, canon, state, 1);
  return {
    ok,
    reasonCode: ok ? '' : (state.reasonCode || 'E_ENABLEDWHEN_DSL_INVALID'),
    stats: {
      nodeCount: state.nodeCount,
      maxNodes: canon.maxNodes,
      maxDepth: canon.maxDepth,
    },
    canon,
  };
}

function evaluateEnabledWhenAst(ast, context = {}, options = {}) {
  const validation = validateEnabledWhenAst(ast, options);
  if (!validation.ok) {
    return {
      ok: false,
      value: false,
      reasonCode: validation.reasonCode || 'E_ENABLEDWHEN_DSL_INVALID',
      stats: validation.stats,
    };
  }

  const normalizedContext = isPlainObject(context) ? context : {};
  const stageRank = toStageRankMap(validation.canon.allowedStageValues);
  const value = Boolean(evaluateNode(ast === undefined ? DEFAULT_AST : ast, normalizedContext, validation.canon, stageRank));
  return {
    ok: true,
    value,
    reasonCode: value ? '' : 'ENABLEDWHEN_FALSE',
    stats: validation.stats,
  };
}

module.exports = {
  CANON_PATH,
  DEFAULT_ENABLED_WHEN_AST: DEFAULT_AST,
  evaluateEnabledWhenAst,
  getEnabledWhenDslCanon: getCanon,
  validateEnabledWhenAst,
};
