import { hashCanonicalValue } from '../../../derived/deriveView.mjs';
import { deriveManualMapGraph } from '../../../derived/mindmap/deriveManualMapGraph.mjs';
import {
  LEGACY_MINDMAP_TXT_PREVIEW_SCHEMA_VERSION,
  LEGACY_MINDMAP_TXT_SHADOW_SCHEMA_VERSION,
} from './legacyMindMapTxtMigration.mjs';

export const LEGACY_MINDMAP_COMMAND_APPLY_SCHEMA_VERSION = 'manualMap.legacyTxtCommandApply.v1';
export const LEGACY_MINDMAP_REOPEN_VALIDATION_SCHEMA_VERSION = 'manualMap.legacyTxtReopenValidation.v1';

const LEGACY_MINDMAP_APPLY_OP = 'manualMap.legacyTxtCommandApply';
const LEGACY_MINDMAP_REOPEN_OP = 'manualMap.legacyTxtReopenValidation';
const ALLOWED_COMMAND_TYPES = Object.freeze([
  'manualMap.create',
  'manualMap.node.add',
  'manualMap.edge.add',
]);
const ALLOWED_COMMAND_TYPE_SET = new Set(ALLOWED_COMMAND_TYPES);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function typedFailure(op, code, reason, details = {}) {
  const error = { code, op, reason };
  if (isPlainObject(details) && Object.keys(details).length > 0) error.details = cloneJson(details);
  return { ok: false, error };
}

function validateShadow(shadow) {
  if (!isPlainObject(shadow) || shadow.schemaVersion !== LEGACY_MINDMAP_TXT_SHADOW_SCHEMA_VERSION) {
    return typedFailure(LEGACY_MINDMAP_APPLY_OP, 'E_LEGACY_MINDMAP_SHADOW_INVALID', 'SHADOW_INVALID');
  }
  if (!Array.isArray(shadow.commandPlan) || shadow.commandPlan.length === 0) {
    return typedFailure(LEGACY_MINDMAP_APPLY_OP, 'E_LEGACY_MINDMAP_COMMAND_PLAN_EMPTY', 'COMMAND_PLAN_EMPTY', {
      mapId: normalizeText(shadow.mapId),
    });
  }
  const invalid = shadow.commandPlan
    .map((command, index) => ({ command, index }))
    .find(({ command }) => !isPlainObject(command) || !ALLOWED_COMMAND_TYPE_SET.has(normalizeText(command.type)));
  if (invalid) {
    return typedFailure(
      LEGACY_MINDMAP_APPLY_OP,
      'E_LEGACY_MINDMAP_COMMAND_TYPE_NOT_ALLOWED',
      'COMMAND_TYPE_NOT_ALLOWED',
      {
        commandIndex: invalid.index,
        commandType: normalizeText(invalid.command?.type),
        allowedCommandTypes: ALLOWED_COMMAND_TYPES,
      },
    );
  }
  return { ok: true };
}

function normalizeCommandReceipt(result, command, commandIndex) {
  const stateHash = normalizeText(result?.stateHash) || (
    isPlainObject(result?.state) ? hashCanonicalValue(result.state) : ''
  );
  return {
    commandIndex,
    commandType: normalizeText(command.type),
    ok: result?.ok === true,
    stateHash,
  };
}

export async function applyLegacyMindMapShadowMigrationViaCommandKernel(input = {}) {
  const shadow = isPlainObject(input.shadow) ? input.shadow : {};
  const validation = validateShadow(shadow);
  if (!validation.ok) return validation;

  const commandExecutor = input.commandExecutor;
  if (typeof commandExecutor !== 'function') {
    return typedFailure(
      LEGACY_MINDMAP_APPLY_OP,
      'E_LEGACY_MINDMAP_COMMAND_EXECUTOR_REQUIRED',
      'COMMAND_EXECUTOR_REQUIRED',
      { mapId: normalizeText(shadow.mapId) },
    );
  }

  let currentState = isPlainObject(input.initialState) ? cloneJson(input.initialState) : null;
  const commandReceipts = [];
  const commandPlan = shadow.commandPlan.map(cloneJson);
  for (let commandIndex = 0; commandIndex < commandPlan.length; commandIndex += 1) {
    const command = commandPlan[commandIndex];
    const result = await commandExecutor(cloneJson(command), {
      commandIndex,
      state: currentState,
      projectId: normalizeText(shadow.projectId),
      mapId: normalizeText(shadow.mapId),
      commandAuthority: 'CommandKernel',
      previewHash: normalizeText(shadow.previewHash),
    });
    commandReceipts.push(normalizeCommandReceipt(result, command, commandIndex));
    if (!result || result.ok !== true || !isPlainObject(result.state)) {
      return typedFailure(
        LEGACY_MINDMAP_APPLY_OP,
        'E_LEGACY_MINDMAP_COMMAND_APPLY_FAILED',
        'COMMAND_APPLY_FAILED',
        {
          commandIndex,
          commandType: normalizeText(command.type),
          commandError: isPlainObject(result?.error) ? result.error : null,
          commandReceipts,
        },
      );
    }
    currentState = cloneJson(result.state);
  }

  const receipt = {
    schemaVersion: LEGACY_MINDMAP_COMMAND_APPLY_SCHEMA_VERSION,
    projectId: normalizeText(shadow.projectId),
    mapId: normalizeText(shadow.mapId),
    previewHash: normalizeText(shadow.previewHash),
    appliedCommandCount: commandReceipts.length,
    commandReceipts,
    commandAuthority: 'CommandKernel',
    directCoreMutation: false,
    storageMutation: false,
    projectTruthMutation: true,
  };
  return {
    ok: true,
    value: {
      ...receipt,
      state: currentState,
      meta: {
        applyHash: hashCanonicalValue(receipt),
        stateHash: isPlainObject(currentState) ? hashCanonicalValue(currentState) : '',
      },
    },
  };
}

function normalizePreviewGraph(graph) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  return {
    title: normalizeText(graph?.title),
    nodes: nodes
      .map((node) => ({
        id: normalizeText(node.id),
        label: normalizeText(node.label),
        kind: normalizeText(node.kind) || 'note',
        position: {
          x: Number.isFinite(Number(node.position?.x)) ? Number(node.position.x) : 0,
          y: Number.isFinite(Number(node.position?.y)) ? Number(node.position.y) : 0,
        },
        target: {
          kind: normalizeText(node.target?.kind),
          id: normalizeText(node.target?.id),
        },
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges
      .map((edge) => ({
        id: normalizeText(edge.id),
        from: normalizeText(edge.from),
        to: normalizeText(edge.to),
        kind: normalizeText(edge.kind) || 'link',
        label: normalizeText(edge.label),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

function normalizeDerivedGraph(graph) {
  return normalizePreviewGraph(graph);
}

export function validateLegacyMindMapReopenGraph(input = {}) {
  const preview = isPlainObject(input.preview) ? input.preview : {};
  if (preview.schemaVersion !== LEGACY_MINDMAP_TXT_PREVIEW_SCHEMA_VERSION) {
    return typedFailure(LEGACY_MINDMAP_REOPEN_OP, 'E_LEGACY_MINDMAP_PREVIEW_INVALID', 'PREVIEW_INVALID');
  }
  const coreState = isPlainObject(input.coreState) ? input.coreState : input.reopenedCoreState;
  if (!isPlainObject(coreState)) {
    return typedFailure(LEGACY_MINDMAP_REOPEN_OP, 'E_LEGACY_MINDMAP_REOPEN_STATE_REQUIRED', 'REOPEN_STATE_REQUIRED', {
      mapId: normalizeText(preview.mapId),
    });
  }
  const deriveGraph = typeof input.deriveGraph === 'function' ? input.deriveGraph : deriveManualMapGraph;
  const derived = deriveGraph({
    coreState: cloneJson(coreState),
    params: {
      projectId: normalizeText(preview.projectId),
      mapId: normalizeText(preview.mapId),
    },
    capabilitySnapshot: input.capabilitySnapshot || { platformId: 'node', capabilities: { manualMapView: true } },
  });
  if (!derived || derived.ok !== true) {
    return typedFailure(LEGACY_MINDMAP_REOPEN_OP, 'E_LEGACY_MINDMAP_REOPEN_DERIVE_FAILED', 'REOPEN_DERIVE_FAILED', {
      mapId: normalizeText(preview.mapId),
      deriveError: isPlainObject(derived?.error) ? derived.error : null,
    });
  }

  const expected = normalizePreviewGraph(preview.graph);
  const actual = normalizeDerivedGraph(derived.value);
  const expectedHash = hashCanonicalValue(expected);
  const actualHash = hashCanonicalValue(actual);
  if (actualHash !== expectedHash) {
    return typedFailure(LEGACY_MINDMAP_REOPEN_OP, 'E_LEGACY_MINDMAP_REOPEN_GRAPH_MISMATCH', 'REOPEN_GRAPH_MISMATCH', {
      mapId: normalizeText(preview.mapId),
      expectedHash,
      actualHash,
    });
  }

  const validation = {
    schemaVersion: LEGACY_MINDMAP_REOPEN_VALIDATION_SCHEMA_VERSION,
    projectId: normalizeText(preview.projectId),
    mapId: normalizeText(preview.mapId),
    previewHash: normalizeText(preview.meta?.previewHash) || hashCanonicalValue(preview),
    expectedGraphHash: expectedHash,
    actualGraphHash: actualHash,
    nodeCount: expected.nodes.length,
    edgeCount: expected.edges.length,
    reopenedGraphMatchesPreview: true,
    projectTruthMutation: false,
  };
  return {
    ok: true,
    value: {
      ...validation,
      meta: {
        validationHash: hashCanonicalValue(validation),
      },
    },
  };
}
