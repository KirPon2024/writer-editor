export const ATLAS_MENTION_INDEX_SCHEMA_VERSION = 'derived.atlas.mentionIndex.v1';
export const ATLAS_EVIDENCE_ANCHOR_SCHEMA_VERSION = 'atlas.evidenceAnchor.v1';

function compareText(a, b) {
  return String(a).localeCompare(String(b), 'en', { sensitivity: 'variant' });
}

export function sortAtlasMentions(mentions) {
  return [...(Array.isArray(mentions) ? mentions : [])].sort((a, b) => {
    const scene = compareText(a.sceneId, b.sceneId);
    if (scene !== 0) return scene;
    const start = Number(a.startOffset) - Number(b.startOffset);
    if (start !== 0) return start;
    const end = Number(a.endOffset) - Number(b.endOffset);
    if (end !== 0) return end;
    const entity = compareText(a.entityId, b.entityId);
    if (entity !== 0) return entity;
    return compareText(a.termId, b.termId);
  });
}

export function sortAtlasSceneShards(sceneShards) {
  return [...(Array.isArray(sceneShards) ? sceneShards : [])].sort((a, b) => compareText(a.sceneId, b.sceneId));
}

export function canonicalizeAtlasMentionIndex(input = {}) {
  return {
    schemaVersion: ATLAS_MENTION_INDEX_SCHEMA_VERSION,
    projectId: typeof input.projectId === 'string' ? input.projectId : '',
    mentions: sortAtlasMentions(input.mentions),
    sceneShards: sortAtlasSceneShards(input.sceneShards),
  };
}
