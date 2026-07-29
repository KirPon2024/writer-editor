import { hashCanonicalValue } from '../../../derived/deriveView.mjs';
import {
  LEGACY_MINDMAP_COMMAND_APPLY_SCHEMA_VERSION,
  LEGACY_MINDMAP_REOPEN_VALIDATION_SCHEMA_VERSION,
} from './legacyMindMapCommandApply.mjs';
import { LEGACY_MINDMAP_TXT_PREVIEW_SCHEMA_VERSION } from './legacyMindMapTxtMigration.mjs';

export const LEGACY_MINDMAP_ROUNDTRIP_EVIDENCE_SCHEMA_VERSION = 'manualMap.legacyTxtRoundtripEvidence.v1';
export const LEGACY_MINDMAP_SUNSET_EVIDENCE_SCHEMA_VERSION = 'manualMap.legacyTxtSunsetEvidence.v1';

const LEGACY_MINDMAP_ROUNDTRIP_OP = 'manualMap.legacyTxtRoundtripEvidence';
const LEGACY_MINDMAP_SUNSET_OP = 'manualMap.legacyTxtSunsetEvidence';

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

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeGraph(graph = {}) {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  return {
    projectId: normalizeText(graph.projectId),
    mapId: normalizeText(graph.mapId),
    title: normalizeText(graph.title),
    nodes: nodes
      .map((node) => ({
        id: normalizeText(node.id),
        label: normalizeText(node.label),
        kind: normalizeText(node.kind) || 'note',
        position: {
          x: normalizeNumber(node.position?.x),
          y: normalizeNumber(node.position?.y),
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

function parseExportPayload(input) {
  if (isPlainObject(input)) return { ok: true, value: cloneJson(input) };
  if (typeof input !== 'string') {
    return typedFailure(LEGACY_MINDMAP_ROUNDTRIP_OP, 'E_LEGACY_MINDMAP_EXPORT_PAYLOAD_INVALID', 'EXPORT_PAYLOAD_INVALID');
  }
  try {
    const parsed = JSON.parse(input);
    if (!isPlainObject(parsed)) {
      return typedFailure(LEGACY_MINDMAP_ROUNDTRIP_OP, 'E_LEGACY_MINDMAP_EXPORT_PAYLOAD_INVALID', 'EXPORT_PAYLOAD_INVALID');
    }
    return { ok: true, value: parsed };
  } catch {
    return typedFailure(LEGACY_MINDMAP_ROUNDTRIP_OP, 'E_LEGACY_MINDMAP_EXPORT_JSON_INVALID', 'EXPORT_JSON_INVALID');
  }
}

export function buildLegacyMindMapRoundtripEvidence(input = {}) {
  const preview = isPlainObject(input.preview) ? input.preview : {};
  if (preview.schemaVersion !== LEGACY_MINDMAP_TXT_PREVIEW_SCHEMA_VERSION) {
    return typedFailure(LEGACY_MINDMAP_ROUNDTRIP_OP, 'E_LEGACY_MINDMAP_PREVIEW_INVALID', 'PREVIEW_INVALID');
  }
  const applyReceipt = isPlainObject(input.applyReceipt) ? input.applyReceipt : {};
  if (applyReceipt.schemaVersion !== LEGACY_MINDMAP_COMMAND_APPLY_SCHEMA_VERSION || applyReceipt.commandAuthority !== 'CommandKernel') {
    return typedFailure(LEGACY_MINDMAP_ROUNDTRIP_OP, 'E_LEGACY_MINDMAP_APPLY_RECEIPT_INVALID', 'APPLY_RECEIPT_INVALID');
  }
  const reopenValidation = isPlainObject(input.reopenValidation) ? input.reopenValidation : {};
  if (
    reopenValidation.schemaVersion !== LEGACY_MINDMAP_REOPEN_VALIDATION_SCHEMA_VERSION
    || reopenValidation.reopenedGraphMatchesPreview !== true
  ) {
    return typedFailure(LEGACY_MINDMAP_ROUNDTRIP_OP, 'E_LEGACY_MINDMAP_REOPEN_VALIDATION_INVALID', 'REOPEN_VALIDATION_INVALID');
  }

  const parsedExport = parseExportPayload(input.exportJson || input.exportPayload);
  if (!parsedExport.ok) return parsedExport;
  const exportPayload = parsedExport.value;
  const expectedGraph = normalizeGraph(preview.graph);
  const exportedGraph = normalizeGraph(exportPayload);
  const expectedGraphHash = hashCanonicalValue(expectedGraph);
  const exportedGraphHash = hashCanonicalValue(exportedGraph);
  if (expectedGraphHash !== exportedGraphHash) {
    return typedFailure(LEGACY_MINDMAP_ROUNDTRIP_OP, 'E_LEGACY_MINDMAP_ROUNDTRIP_GRAPH_MISMATCH', 'ROUNDTRIP_GRAPH_MISMATCH', {
      mapId: normalizeText(preview.mapId),
      expectedGraphHash,
      exportedGraphHash,
    });
  }

  const evidence = {
    schemaVersion: LEGACY_MINDMAP_ROUNDTRIP_EVIDENCE_SCHEMA_VERSION,
    projectId: normalizeText(preview.projectId),
    mapId: normalizeText(preview.mapId),
    previewHash: normalizeText(preview.meta?.previewHash) || hashCanonicalValue(preview),
    source: {
      sourceId: normalizeText(preview.source?.sourceId),
      name: normalizeText(preview.source?.name),
      sourceHash: normalizeText(preview.source?.sourceHash),
      charLength: Number.isSafeInteger(Number(preview.source?.charLength)) ? Number(preview.source.charLength) : 0,
      lineCount: Number.isSafeInteger(Number(preview.source?.lineCount)) ? Number(preview.source.lineCount) : 0,
      originalContentRetainedByReferenceOnly: true,
    },
    apply: {
      schemaVersion: applyReceipt.schemaVersion,
      commandAuthority: applyReceipt.commandAuthority,
      appliedCommandCount: Number.isSafeInteger(Number(applyReceipt.appliedCommandCount))
        ? Number(applyReceipt.appliedCommandCount)
        : 0,
    },
    reopen: {
      schemaVersion: reopenValidation.schemaVersion,
      validationHash: normalizeText(reopenValidation.meta?.validationHash),
      reopenedGraphMatchesPreview: true,
    },
    export: {
      schemaVersion: normalizeText(exportPayload.schemaVersion),
      format: normalizeText(exportPayload.format),
      recoveryGraphHash: normalizeText(exportPayload.recovery?.graphHash),
      expectedGraphHash,
      exportedGraphHash,
      nodeCount: expectedGraph.nodes.length,
      edgeCount: expectedGraph.edges.length,
    },
    projectTruthMutation: false,
  };
  return {
    ok: true,
    value: {
      ...evidence,
      meta: {
        roundtripHash: hashCanonicalValue(evidence),
      },
    },
  };
}

export function buildLegacyMindMapSunsetEvidence(input = {}) {
  const roundtripEvidence = isPlainObject(input.roundtripEvidence) ? input.roundtripEvidence : {};
  if (roundtripEvidence.schemaVersion !== LEGACY_MINDMAP_ROUNDTRIP_EVIDENCE_SCHEMA_VERSION) {
    return typedFailure(LEGACY_MINDMAP_SUNSET_OP, 'E_LEGACY_MINDMAP_ROUNDTRIP_EVIDENCE_INVALID', 'ROUNDTRIP_EVIDENCE_INVALID');
  }
  const legacyEntrypoints = Array.isArray(input.legacyEntrypoints) ? input.legacyEntrypoints : [];
  const unsafeEntrypoints = legacyEntrypoints
    .filter((entry) => {
      if (!isPlainObject(entry)) return true;
      const mode = normalizeText(entry.mode);
      return mode !== 'blocked' && mode !== 'adapter-only' && mode !== 'read-only-reference';
    })
    .map((entry, index) => ({
      index,
      id: normalizeText(entry?.id) || `legacy-entrypoint-${index + 1}`,
      mode: normalizeText(entry?.mode),
    }));
  if (unsafeEntrypoints.length > 0) {
    return typedFailure(LEGACY_MINDMAP_SUNSET_OP, 'E_LEGACY_MINDMAP_UNSAFE_LEGACY_ENTRYPOINT', 'UNSAFE_LEGACY_ENTRYPOINT', {
      unsafeEntrypoints,
    });
  }

  const evidence = {
    schemaVersion: LEGACY_MINDMAP_SUNSET_EVIDENCE_SCHEMA_VERSION,
    projectId: normalizeText(roundtripEvidence.projectId),
    mapId: normalizeText(roundtripEvidence.mapId),
    roundtripHash: normalizeText(roundtripEvidence.meta?.roundtripHash) || hashCanonicalValue(roundtripEvidence),
    legacyOriginalPreserved: true,
    activeLegacyTruthStore: false,
    activeLegacyWritePath: false,
    futureMutationPath: 'manualMap.* commands through Command Kernel',
    legacyEntrypoints: legacyEntrypoints.map((entry, index) => ({
      id: normalizeText(entry?.id) || `legacy-entrypoint-${index + 1}`,
      mode: normalizeText(entry?.mode) || 'read-only-reference',
    })),
    sunsetReady: true,
    projectTruthMutation: false,
  };
  return {
    ok: true,
    value: {
      ...evidence,
      meta: {
        sunsetHash: hashCanonicalValue(evidence),
      },
    },
  };
}
