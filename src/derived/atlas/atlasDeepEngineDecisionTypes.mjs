export const ATLAS_DEEP_ENGINE_DECISION_SCHEMA_VERSION = 'derived.atlas.deepEngineDecision.v1';
export const ATLAS_DEEP_ENGINE_CANDIDATE_SCHEMA_VERSION = 'derived.atlas.deepEngineCandidate.v1';
export const ATLAS_DEEP_ENGINE_RESOURCE_MANIFEST_SCHEMA_VERSION = 'derived.atlas.deepEngineResourceManifest.v1';
export const ATLAS_DEEP_ENGINE_ADAPTER_STUB_SCHEMA_VERSION = 'derived.atlas.deepEngineAdapterStub.v1';
export const ATLAS_DEEP_ENGINE_HASH_PACKET_SCHEMA_VERSION = 'derived.atlas.deepEngineHashPacket.v1';

export const ATLAS_DEEP_ENGINE_DECISION_STATUS = Object.freeze({
  UNAVAILABLE_LOCAL_STUB_ONLY: 'UNAVAILABLE_LOCAL_STUB_ONLY',
  EXPERIMENTAL_NOT_CERTIFIED: 'EXPERIMENTAL_NOT_CERTIFIED',
  CERTIFIED_OFFLINE: 'CERTIFIED_OFFLINE',
});

export const ATLAS_DEEP_ENGINE_CANDIDATE_STATUS = Object.freeze({
  REJECTED: 'REJECTED',
  STUB_ONLY: 'STUB_ONLY',
  ACCEPTED_EXPERIMENTAL: 'ACCEPTED_EXPERIMENTAL',
  ACCEPTED_CERTIFIED: 'ACCEPTED_CERTIFIED',
});

export function sortAtlasDeepEngineCandidates(candidates) {
  return [...(Array.isArray(candidates) ? candidates : [])].sort((left, right) => {
    return String(left?.candidateId || '').localeCompare(String(right?.candidateId || ''), 'en', { sensitivity: 'variant' });
  });
}
