export const CROSS_PROJECTION_ORIGIN_REF_SCHEMA_VERSION = 'crossProjection.originRef.v1';
export const CROSS_PROJECTION_GRAPH_PACKET_SCHEMA_VERSION = 'crossProjection.canvasGraphPacket.v1';
export const CROSS_PROJECTION_IMPACT_PREVIEW_SCHEMA_VERSION = 'derived.crossProjection.impactPreview.v1';

export const CROSS_PROJECTION_NODE_KIND = Object.freeze({
  ORIGIN_REF: 'originRef',
  PROJECTION_OBJECT: 'projectionObject',
});

export const CROSS_PROJECTION_EDGE_KIND = Object.freeze({
  OBJECT_ORIGIN_REF: 'objectOriginRef',
  MEANING_PROMOTED_FROM_IDEA: 'meaningPromotedFromIdea',
});

function compareText(a, b) {
  return String(a).localeCompare(String(b), 'en', { sensitivity: 'variant' });
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function sortCrossProjectionOriginRefs(originRefs) {
  return [...(Array.isArray(originRefs) ? originRefs : [])].sort((a, b) => {
    const scene = compareText(a.sceneId, b.sceneId);
    if (scene !== 0) return scene;
    const start = numberOrZero(a.startOffset) - numberOrZero(b.startOffset);
    if (start !== 0) return start;
    const end = numberOrZero(a.endOffset) - numberOrZero(b.endOffset);
    if (end !== 0) return end;
    return compareText(a.originKey, b.originKey);
  });
}

export function sortCrossProjectionNodes(nodes) {
  return [...(Array.isArray(nodes) ? nodes : [])].sort((a, b) => {
    const kind = compareText(a.kind, b.kind);
    if (kind !== 0) return kind;
    const projection = compareText(a.projection || '', b.projection || '');
    if (projection !== 0) return projection;
    return compareText(a.id, b.id);
  });
}

export function sortCrossProjectionEdges(edges) {
  return [...(Array.isArray(edges) ? edges : [])].sort((a, b) => {
    const kind = compareText(a.kind, b.kind);
    if (kind !== 0) return kind;
    const from = compareText(a.from, b.from);
    if (from !== 0) return from;
    return compareText(a.to, b.to);
  });
}

export function sortCrossProjectionImpactItems(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const relation = compareText(a.relationKind, b.relationKind);
    if (relation !== 0) return relation;
    return compareText(a.impactKey, b.impactKey);
  });
}
