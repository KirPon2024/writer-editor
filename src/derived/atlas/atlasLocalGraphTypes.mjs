export const ATLAS_LOCAL_GRAPH_SCHEMA_VERSION = 'derived.atlas.localGraph.v1';
export const ATLAS_LOCAL_GRAPH_NODE_SCHEMA_VERSION = 'derived.atlas.localGraphNode.v1';
export const ATLAS_LOCAL_GRAPH_EDGE_SCHEMA_VERSION = 'derived.atlas.localGraphEdge.v1';
export const ATLAS_LOCAL_GRAPH_CLUSTER_SCHEMA_VERSION = 'derived.atlas.localGraphCluster.v1';
export const ATLAS_LOCAL_GRAPH_LAYOUT_JOB_SCHEMA_VERSION = 'atlas.localGraph.layoutJob.v1';
export const ATLAS_LOCAL_GRAPH_LAYOUT_RESULT_SCHEMA_VERSION = 'atlas.localGraph.layoutResult.v1';
export const ATLAS_LOCAL_GRAPH_LAYOUT_PLAN_SCHEMA_VERSION = 'atlas.localGraph.layoutPlan.v1';
export const ATLAS_LOCAL_GRAPH_RESOURCE_BUDGET_PROOF_SCHEMA_VERSION = 'atlas.localGraph.resourceBudgetProof.v1';

function safeString(value) {
  return typeof value === 'string' ? value : '';
}

function compareStrings(a, b) {
  return safeString(a).localeCompare(safeString(b), 'en', { sensitivity: 'variant' });
}

export function sortAtlasLocalGraphNodes(nodes) {
  return [...(Array.isArray(nodes) ? nodes : [])].sort((a, b) => {
    const kind = compareStrings(a?.nodeKind, b?.nodeKind);
    if (kind !== 0) return kind;
    const label = compareStrings(a?.label, b?.label);
    if (label !== 0) return label;
    return compareStrings(a?.nodeId, b?.nodeId);
  });
}

export function sortAtlasLocalGraphEdges(edges) {
  return [...(Array.isArray(edges) ? edges : [])].sort((a, b) => {
    const left = compareStrings(a?.leftNodeId, b?.leftNodeId);
    if (left !== 0) return left;
    const right = compareStrings(a?.rightNodeId, b?.rightNodeId);
    if (right !== 0) return right;
    return compareStrings(a?.edgeId, b?.edgeId);
  });
}

export function sortAtlasLocalGraphClusters(clusters) {
  return [...(Array.isArray(clusters) ? clusters : [])].sort((a, b) => {
    if (Number(a?.ordinal) !== Number(b?.ordinal)) return Number(a?.ordinal || 0) - Number(b?.ordinal || 0);
    const size = Number(b?.nodeCount || 0) - Number(a?.nodeCount || 0);
    if (size !== 0) return size;
    return compareStrings(a?.clusterId, b?.clusterId);
  });
}
