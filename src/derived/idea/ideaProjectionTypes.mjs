export const IDEA_AUTHOR_SCHEMA_VERSION = 'idea.author.v1';
export const IDEA_ORIGIN_REF_SCHEMA_VERSION = 'idea.originRef.v1';
export const IDEA_PROJECTION_SCHEMA_VERSION = 'derived.idea.projection.v1';

function compareText(a, b) {
  return String(a).localeCompare(String(b), 'en', { sensitivity: 'variant' });
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function sortIdeaItems(ideas) {
  return [...(Array.isArray(ideas) ? ideas : [])].sort((a, b) => compareText(a.id, b.id));
}

export function sortIdeaOriginLinks(originLinks) {
  return [...(Array.isArray(originLinks) ? originLinks : [])].sort((a, b) => {
    const scene = compareText(a.originRef?.sceneId, b.originRef?.sceneId);
    if (scene !== 0) return scene;
    const start = numberOrZero(a.originRef?.startOffset) - numberOrZero(b.originRef?.startOffset);
    if (start !== 0) return start;
    const idea = compareText(a.ideaId, b.ideaId);
    if (idea !== 0) return idea;
    return compareText(a.id, b.id);
  });
}
