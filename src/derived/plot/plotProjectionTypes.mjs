export const PLOT_PROJECTION_SCHEMA_VERSION = 'derived.plot.projection.v1';
export const PLOT_ORIGIN_REF_SCHEMA_VERSION = 'plot.originRef.v1';
export const PLOT_SEQUENCE_LAYOUT_SCHEMA_VERSION = 'plot.sequenceLayout.v1';

export const PLOT_NODE_KIND = Object.freeze({
  PROJECT: 'project',
  SCENE: 'scene',
  HEADING: 'heading',
  ATLAS_MENTION: 'atlasMention',
});

export const PLOT_EDGE_KIND = Object.freeze({
  CONTAINS: 'contains',
  OCCURS_IN: 'occursIn',
});

function compareText(a, b) {
  return String(a).localeCompare(String(b), 'en', { sensitivity: 'variant' });
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function sortPlotNodes(nodes) {
  return [...(Array.isArray(nodes) ? nodes : [])].sort((a, b) => {
    const sequence = numberOrZero(a.sequenceIndex) - numberOrZero(b.sequenceIndex);
    if (sequence !== 0) return sequence;
    const lane = numberOrZero(a.laneIndex) - numberOrZero(b.laneIndex);
    if (lane !== 0) return lane;
    return compareText(a.id, b.id);
  });
}

export function sortPlotEdges(edges) {
  return [...(Array.isArray(edges) ? edges : [])].sort((a, b) => {
    const from = compareText(a.from, b.from);
    if (from !== 0) return from;
    const to = compareText(a.to, b.to);
    if (to !== 0) return to;
    return compareText(a.kind, b.kind);
  });
}

export function sortPlotOriginRefs(originRefs) {
  return [...(Array.isArray(originRefs) ? originRefs : [])].sort((a, b) => {
    const scene = compareText(a.sceneId, b.sceneId);
    if (scene !== 0) return scene;
    const start = numberOrZero(a.startOffset) - numberOrZero(b.startOffset);
    if (start !== 0) return start;
    const end = numberOrZero(a.endOffset) - numberOrZero(b.endOffset);
    if (end !== 0) return end;
    return compareText(a.refId, b.refId);
  });
}
