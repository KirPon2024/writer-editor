export const MEANING_AUTHOR_SCHEMA_VERSION = 'meaning.author.v1';
export const MEANING_PROJECTION_SCHEMA_VERSION = 'derived.meaning.projection.v1';

function compareText(a, b) {
  return String(a).localeCompare(String(b), 'en', { sensitivity: 'variant' });
}

export function sortMeaningItems(meanings) {
  return [...(Array.isArray(meanings) ? meanings : [])].sort((a, b) => compareText(a.id, b.id));
}
