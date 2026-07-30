export const ATLAS_GLOBAL_COMPOSITE_GRAPH_SCHEMA_VERSION = 'derived.atlas.globalCompositeGraph.v1';
export const ATLAS_GLOBAL_COMPOSITE_SOURCE_REF_SCHEMA_VERSION = 'derived.atlas.globalCompositeSourceRef.v1';
export const ATLAS_GLOBAL_COMPOSITE_NODE_SCHEMA_VERSION = 'derived.atlas.globalCompositeNode.v1';
export const ATLAS_GLOBAL_COMPOSITE_EDGE_SCHEMA_VERSION = 'derived.atlas.globalCompositeEdge.v1';
export const ATLAS_GLOBAL_COMPOSITE_GRAPH_JOB_SCHEMA_VERSION = 'atlas.globalCompositeGraph.job.v1';
export const ATLAS_GLOBAL_COMPOSITE_GRAPH_RESULT_SCHEMA_VERSION = 'atlas.globalCompositeGraph.result.v1';
export const ATLAS_GLOBAL_COMPOSITE_GRAPH_QUEUE_SCHEMA_VERSION = 'atlas.globalCompositeGraph.queue.v1';
export const ATLAS_GLOBAL_COMPOSITE_LOD_PLAN_SCHEMA_VERSION = 'atlas.globalCompositeGraph.lodPlan.v1';
export const ATLAS_GLOBAL_COMPOSITE_STABLE_POSITION_SCHEMA_VERSION = 'atlas.globalCompositeGraph.stablePosition.v1';
export const ATLAS_GLOBAL_COMPOSITE_RESOURCE_BUDGET_PROOF_SCHEMA_VERSION = 'atlas.globalCompositeGraph.resourceBudgetProof.v1';
export const ATLAS_GLOBAL_COMPOSITE_TRUST_FILTER_SCHEMA_VERSION = 'atlas.globalCompositeGraph.trustFilter.v1';
export const ATLAS_GLOBAL_COMPOSITE_BATCH_NAVIGATION_INTENT_SCHEMA_VERSION = 'atlas.globalCompositeGraph.batchNavigationIntent.v1';
export const ATLAS_GLOBAL_COMPOSITE_ACCESSIBILITY_PARITY_SCHEMA_VERSION = 'atlas.globalCompositeGraph.accessibilityParity.v1';

export const ATLAS_GLOBAL_COMPOSITE_NODE_KIND = Object.freeze({
  ATLAS_ENTITY: 'atlasEntity',
  TEMPORAL_ENTITY: 'temporalEntity',
  MANUAL_MAP_NODE: 'manualMapNode',
  PLOT_NODE: 'plotNode',
  IDEA: 'idea',
  MEANING: 'meaning',
  ORIGIN_REF: 'originRef',
});

export const ATLAS_GLOBAL_COMPOSITE_EDGE_KIND = Object.freeze({
  ATLAS_COOCCURRENCE: 'atlasCooccurrence',
  TEMPORAL_COOCCURRENCE: 'temporalCooccurrence',
  MANUAL_MAP_EDGE: 'manualMapEdge',
  PLOT_EDGE: 'plotEdge',
  CROSS_PROJECTION_LINK: 'crossProjectionLink',
  MANUAL_TARGET_REF: 'manualTargetRef',
});

export const ATLAS_GLOBAL_COMPOSITE_GRAPH_TRIGGER = Object.freeze({
  EXPLICIT_OPEN: 'explicitOpen',
  IDLE_BUDGET: 'idleBudget',
});

function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'en', { sensitivity: 'variant' });
}

export function sortAtlasGlobalCompositeSourceRefs(sourceRefs) {
  return [...(Array.isArray(sourceRefs) ? sourceRefs : [])].sort((a, b) => {
    const projection = compareText(a?.sourceProjection, b?.sourceProjection);
    if (projection !== 0) return projection;
    const sourceId = compareText(a?.sourceId, b?.sourceId);
    if (sourceId !== 0) return sourceId;
    return compareText(a?.sourceRefId, b?.sourceRefId);
  });
}

export function sortAtlasGlobalCompositeNodes(nodes) {
  return [...(Array.isArray(nodes) ? nodes : [])].sort((a, b) => {
    const kind = compareText(a?.nodeKind, b?.nodeKind);
    if (kind !== 0) return kind;
    const projection = compareText(a?.sourceProjection, b?.sourceProjection);
    if (projection !== 0) return projection;
    const label = compareText(a?.label, b?.label);
    if (label !== 0) return label;
    return compareText(a?.nodeId, b?.nodeId);
  });
}

export function sortAtlasGlobalCompositeEdges(edges) {
  return [...(Array.isArray(edges) ? edges : [])].sort((a, b) => {
    const kind = compareText(a?.edgeKind, b?.edgeKind);
    if (kind !== 0) return kind;
    const from = compareText(a?.fromNodeId, b?.fromNodeId);
    if (from !== 0) return from;
    const to = compareText(a?.toNodeId, b?.toNodeId);
    if (to !== 0) return to;
    return compareText(a?.edgeId, b?.edgeId);
  });
}
