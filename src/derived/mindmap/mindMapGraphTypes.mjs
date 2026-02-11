export const MINDMAP_GRAPH_SCHEMA_VERSION = 'derived.mindmap.graph.v1';

export const MINDMAP_NODE_KIND = Object.freeze({
  PROJECT: 'project',
  SCENE: 'scene',
  HEADING: 'heading',
});

export const MINDMAP_EDGE_KIND = Object.freeze({
  CONTAINS: 'contains',
});

function compareText(a, b) {
  return String(a).localeCompare(String(b), 'en', { sensitivity: 'variant' });
}

export function sortMindMapNodes(nodes) {
  return [...nodes].sort((a, b) => {
    const kind = compareText(a.kind, b.kind);
    if (kind !== 0) return kind;
    const depth = Number(a.depth) - Number(b.depth);
    if (depth !== 0) return depth;
    return compareText(a.id, b.id);
  });
}

export function sortMindMapEdges(edges) {
  return [...edges].sort((a, b) => {
    const kind = compareText(a.kind, b.kind);
    if (kind !== 0) return kind;
    const from = compareText(a.from, b.from);
    if (from !== 0) return from;
    return compareText(a.to, b.to);
  });
}

export function canonicalizeMindMapGraph(graph) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  return {
    schemaVersion: MINDMAP_GRAPH_SCHEMA_VERSION,
    nodes: sortMindMapNodes(nodes),
    edges: sortMindMapEdges(edges),
  };
}
