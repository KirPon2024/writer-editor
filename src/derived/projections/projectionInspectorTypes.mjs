export const PROJECTION_INSPECTOR_MANIFEST_SCHEMA_VERSION = 'projection.inspector.manifest.v1';
export const PROJECTION_INSPECTOR_FALLBACK_SCHEMA_VERSION = 'projection.inspector.fallback.v1';
export const PROJECTION_INSPECTOR_PROVIDER_SCHEMA_VERSION = 'derived.projection.inspectorProvider.v1';

export const PROJECTION_INSPECTOR_STATE = Object.freeze({
  READY: 'ready',
  EMPTY: 'empty',
  UNAVAILABLE: 'unavailable',
});

function compareText(a, b) {
  return String(a).localeCompare(String(b), 'en', { sensitivity: 'variant' });
}

export function sortProjectionInspectorManifests(manifests) {
  return [...(Array.isArray(manifests) ? manifests : [])].sort((a, b) => compareText(a.inspectorId, b.inspectorId));
}

export function sortProjectionInspectorStates(states) {
  return [...(Array.isArray(states) ? states : [])].sort((a, b) => compareText(a.inspectorId, b.inspectorId));
}
