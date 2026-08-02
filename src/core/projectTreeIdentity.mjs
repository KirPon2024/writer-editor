import { sha256Hex } from './browser-safe-hash.mjs';

export const PROJECT_TREE_IDENTITY_SCHEMA_VERSION = 1;
export const PROJECT_TREE_IDENTITY_PREFIX = 'tree-node-';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function makeError(code, reason, details = {}) {
  return {
    code,
    op: 'project.tree.identity',
    reason,
    details: cloneJson(details),
  };
}

function normalizeNodeId(value) {
  const nodeId = normalizeString(value);
  if (!nodeId || nodeId.length > 128 || !/^[A-Za-z0-9._:-]+$/u.test(nodeId)) {
    return '';
  }
  return nodeId;
}

export function normalizeTreeBindingKey(value) {
  const bindingKey = normalizeString(value).replace(/\\/gu, '/');
  if (!bindingKey || bindingKey.length > 1024 || /[\u0000-\u001F]/u.test(bindingKey)) {
    return '';
  }
  if (!/^(?:file|virtual):/u.test(bindingKey)) {
    return '';
  }
  if (bindingKey.startsWith('file:')) {
    const relativePath = bindingKey.slice('file:'.length);
    const segments = relativePath.split('/');
    if (
      !relativePath
      || relativePath.startsWith('/')
      || segments.some((segment) => !segment || segment === '.' || segment === '..')
    ) {
      return '';
    }
  }
  return bindingKey;
}

function normalizeKind(value) {
  const kind = normalizeString(value);
  if (!kind || kind.length > 96 || !/^[A-Za-z0-9._:-]+$/u.test(kind)) {
    return '';
  }
  return kind;
}

export function createDeterministicTreeNodeId(projectId, bindingKey) {
  const normalizedProjectId = normalizeString(projectId);
  const normalizedBindingKey = normalizeTreeBindingKey(bindingKey);
  if (!normalizedProjectId || !normalizedBindingKey) {
    return '';
  }
  const digest = sha256Hex(`${normalizedProjectId}\u0000${normalizedBindingKey}`);
  return `${PROJECT_TREE_IDENTITY_PREFIX}${digest.slice(0, 32)}`;
}

export function normalizeProjectTreeIdentity(source = {}) {
  if (source === undefined || source === null) {
    return {
      ok: true,
      value: {
        schemaVersion: PROJECT_TREE_IDENTITY_SCHEMA_VERSION,
        nodes: {},
      },
      error: null,
    };
  }
  if (!isPlainObject(source)) {
    return {
      ok: false,
      value: null,
      error: makeError('E_TREE_IDENTITY_OBJECT_REQUIRED', 'TREE_IDENTITY_OBJECT_REQUIRED'),
    };
  }
  if (
    source.schemaVersion !== undefined
    && source.schemaVersion !== PROJECT_TREE_IDENTITY_SCHEMA_VERSION
  ) {
    return {
      ok: false,
      value: null,
      error: makeError(
        'E_TREE_IDENTITY_SCHEMA_UNSUPPORTED',
        'TREE_IDENTITY_SCHEMA_UNSUPPORTED',
        { schemaVersion: source.schemaVersion },
      ),
    };
  }
  if (source.nodes !== undefined && !isPlainObject(source.nodes)) {
    return {
      ok: false,
      value: null,
      error: makeError('E_TREE_IDENTITY_NODES_INVALID', 'TREE_IDENTITY_NODES_INVALID'),
    };
  }

  const value = cloneJson(source);
  value.schemaVersion = PROJECT_TREE_IDENTITY_SCHEMA_VERSION;
  value.nodes = {};
  const bindingOwners = new Map();

  for (const [rawNodeId, rawNode] of Object.entries(source.nodes || {}).sort(([a], [b]) => a.localeCompare(b))) {
    const nodeId = normalizeNodeId(rawNodeId);
    if (!nodeId || !isPlainObject(rawNode)) {
      return {
        ok: false,
        value: null,
        error: makeError('E_TREE_IDENTITY_NODE_INVALID', 'TREE_IDENTITY_NODE_INVALID', { nodeId: rawNodeId }),
      };
    }
    const bindingKey = normalizeTreeBindingKey(rawNode.bindingKey);
    const kind = normalizeKind(rawNode.kind);
    if (!bindingKey || !kind) {
      return {
        ok: false,
        value: null,
        error: makeError(
          'E_TREE_IDENTITY_NODE_FIELDS_INVALID',
          'TREE_IDENTITY_NODE_FIELDS_INVALID',
          { nodeId },
        ),
      };
    }
    if (bindingOwners.has(bindingKey)) {
      return {
        ok: false,
        value: null,
        error: makeError(
          'E_TREE_IDENTITY_BINDING_DUPLICATE',
          'TREE_IDENTITY_BINDING_DUPLICATE',
          { bindingKey, nodeIds: [bindingOwners.get(bindingKey), nodeId] },
        ),
      };
    }
    bindingOwners.set(bindingKey, nodeId);
    value.nodes[nodeId] = {
      ...cloneJson(rawNode),
      bindingKey,
      kind,
      present: rawNode.present !== false,
    };
  }

  return { ok: true, value, error: null };
}

function normalizeDescriptors(descriptors) {
  if (!Array.isArray(descriptors)) {
    return { ok: false, value: null, error: makeError('E_TREE_IDENTITY_DESCRIPTORS_INVALID', 'TREE_IDENTITY_DESCRIPTORS_INVALID') };
  }
  const seenBindings = new Set();
  const value = [];
  for (let index = 0; index < descriptors.length; index += 1) {
    const descriptor = descriptors[index];
    if (!isPlainObject(descriptor)) {
      return { ok: false, value: null, error: makeError('E_TREE_IDENTITY_DESCRIPTOR_INVALID', 'TREE_IDENTITY_DESCRIPTOR_INVALID', { index }) };
    }
    const bindingKey = normalizeTreeBindingKey(descriptor.bindingKey);
    const kind = normalizeKind(descriptor.kind);
    if (!bindingKey || !kind || seenBindings.has(bindingKey)) {
      return {
        ok: false,
        value: null,
        error: makeError(
          seenBindings.has(bindingKey) ? 'E_TREE_IDENTITY_DESCRIPTOR_DUPLICATE' : 'E_TREE_IDENTITY_DESCRIPTOR_INVALID',
          seenBindings.has(bindingKey) ? 'TREE_IDENTITY_DESCRIPTOR_DUPLICATE' : 'TREE_IDENTITY_DESCRIPTOR_INVALID',
          { index, bindingKey },
        ),
      };
    }
    seenBindings.add(bindingKey);
    value.push({ bindingKey, kind });
  }
  return { ok: true, value, error: null };
}

export function reconcileProjectTreeIdentity({ projectId, registry, descriptors } = {}) {
  const normalizedProjectId = normalizeString(projectId);
  if (!normalizedProjectId) {
    return { ok: false, value: null, changed: false, bindings: null, error: makeError('E_TREE_IDENTITY_PROJECT_REQUIRED', 'TREE_IDENTITY_PROJECT_REQUIRED') };
  }
  const normalizedRegistry = normalizeProjectTreeIdentity(registry);
  if (!normalizedRegistry.ok) {
    return { ...normalizedRegistry, changed: false, bindings: null };
  }
  const normalizedDescriptors = normalizeDescriptors(descriptors);
  if (!normalizedDescriptors.ok) {
    return { ...normalizedDescriptors, changed: false, bindings: null };
  }

  const next = cloneJson(normalizedRegistry.value);
  const nodeIdByBinding = new Map(
    Object.entries(next.nodes).map(([nodeId, node]) => [node.bindingKey, nodeId]),
  );
  const liveBindings = new Set();
  const bindings = {};

  for (const descriptor of normalizedDescriptors.value) {
    const { bindingKey, kind } = descriptor;
    liveBindings.add(bindingKey);
    let nodeId = nodeIdByBinding.get(bindingKey);
    if (!nodeId) {
      nodeId = createDeterministicTreeNodeId(normalizedProjectId, bindingKey);
      const collision = next.nodes[nodeId];
      if (collision && collision.bindingKey !== bindingKey) {
        return {
          ok: false,
          value: null,
          changed: false,
          bindings: null,
          error: makeError('E_TREE_IDENTITY_ID_COLLISION', 'TREE_IDENTITY_ID_COLLISION', { nodeId, bindingKey }),
        };
      }
      next.nodes[nodeId] = { bindingKey, kind, present: true };
      nodeIdByBinding.set(bindingKey, nodeId);
    } else {
      next.nodes[nodeId] = {
        ...next.nodes[nodeId],
        bindingKey,
        kind,
        present: true,
      };
    }
    bindings[bindingKey] = nodeId;
  }

  for (const [nodeId, node] of Object.entries(next.nodes)) {
    if (!liveBindings.has(node.bindingKey) && node.present !== false) {
      next.nodes[nodeId] = { ...node, present: false };
    }
  }

  next.nodes = Object.fromEntries(Object.entries(next.nodes).sort(([a], [b]) => a.localeCompare(b)));
  const changed = JSON.stringify(normalizedRegistry.value) !== JSON.stringify(next);
  return { ok: true, value: next, changed, bindings, error: null };
}

export function rebindProjectTreeIdentity({ registry, fromBindingKey, toBindingKey } = {}) {
  return rebindProjectTreeIdentityBatch({
    registry,
    moves: [{ fromBindingKey, toBindingKey }],
  });
}

export function upsertProjectTreeIdentityNode({ projectId, registry, bindingKey, kind } = {}) {
  const normalizedProjectId = normalizeString(projectId);
  const normalizedRegistry = normalizeProjectTreeIdentity(registry);
  if (!normalizedRegistry.ok) {
    return { ...normalizedRegistry, changed: false, nodeId: '' };
  }
  const normalizedBindingKey = normalizeTreeBindingKey(bindingKey);
  const normalizedKind = normalizeKind(kind);
  if (!normalizedProjectId || !normalizedBindingKey || !normalizedKind) {
    return {
      ok: false,
      value: null,
      changed: false,
      nodeId: '',
      error: makeError('E_TREE_IDENTITY_UPSERT_INVALID', 'TREE_IDENTITY_UPSERT_INVALID'),
    };
  }

  const next = cloneJson(normalizedRegistry.value);
  const existing = Object.entries(next.nodes)
    .find(([, node]) => node.bindingKey === normalizedBindingKey);
  const nodeId = existing
    ? existing[0]
    : createDeterministicTreeNodeId(normalizedProjectId, normalizedBindingKey);
  const collision = next.nodes[nodeId];
  if (collision && collision.bindingKey !== normalizedBindingKey) {
    return {
      ok: false,
      value: null,
      changed: false,
      nodeId: '',
      error: makeError('E_TREE_IDENTITY_ID_COLLISION', 'TREE_IDENTITY_ID_COLLISION', {
        nodeId,
        bindingKey: normalizedBindingKey,
      }),
    };
  }
  next.nodes[nodeId] = {
    ...(collision || {}),
    bindingKey: normalizedBindingKey,
    kind: normalizedKind,
    present: true,
  };
  next.nodes = Object.fromEntries(Object.entries(next.nodes).sort(([a], [b]) => a.localeCompare(b)));
  return {
    ok: true,
    value: next,
    changed: JSON.stringify(normalizedRegistry.value) !== JSON.stringify(next),
    nodeId,
    error: null,
  };
}

export function rebindProjectTreeIdentityBatch({ registry, moves } = {}) {
  const normalizedRegistry = normalizeProjectTreeIdentity(registry);
  if (!normalizedRegistry.ok) {
    return { ...normalizedRegistry, changed: false, movedNodeIds: [] };
  }
  if (!Array.isArray(moves) || moves.length === 0) {
    return {
      ok: false,
      value: null,
      changed: false,
      movedNodeIds: [],
      error: makeError('E_TREE_IDENTITY_REBIND_INVALID', 'TREE_IDENTITY_REBIND_INVALID'),
    };
  }

  const normalizedMoves = [];
  const fromKeys = new Set();
  const toKeys = new Set();
  for (const move of moves) {
    const from = normalizeTreeBindingKey(move?.fromBindingKey);
    const to = normalizeTreeBindingKey(move?.toBindingKey);
    if (
      !from
      || !to
      || !from.startsWith('file:')
      || !to.startsWith('file:')
      || fromKeys.has(from)
      || toKeys.has(to)
    ) {
      return {
        ok: false,
        value: null,
        changed: false,
        movedNodeIds: [],
        error: makeError('E_TREE_IDENTITY_REBIND_INVALID', 'TREE_IDENTITY_REBIND_INVALID'),
      };
    }
    fromKeys.add(from);
    toKeys.add(to);
    normalizedMoves.push({ from, to });
  }

  const next = cloneJson(normalizedRegistry.value);
  const movedNodeIds = [];
  for (const [nodeId, node] of Object.entries(next.nodes)) {
    const matchingMove = normalizedMoves.find(({ from }) => (
      node.bindingKey === from || node.bindingKey.startsWith(`${from}/`)
    ));
    if (!matchingMove) continue;
    const suffix = node.bindingKey.slice(matchingMove.from.length);
    next.nodes[nodeId] = {
      ...node,
      bindingKey: `${matchingMove.to}${suffix}`,
      present: true,
    };
    movedNodeIds.push(nodeId);
  }

  const owners = new Map();
  for (const [nodeId, node] of Object.entries(next.nodes)) {
    const owner = owners.get(node.bindingKey);
    if (owner && owner !== nodeId) {
      return {
        ok: false,
        value: null,
        changed: false,
        movedNodeIds: [],
        error: makeError(
          'E_TREE_IDENTITY_REBIND_COLLISION',
          'TREE_IDENTITY_REBIND_COLLISION',
          { nodeId, bindingKey: node.bindingKey, owner },
        ),
      };
    }
    owners.set(node.bindingKey, nodeId);
  }
  return {
    ok: true,
    value: next,
    changed: movedNodeIds.length > 0,
    movedNodeIds: movedNodeIds.sort(),
    error: null,
  };
}
