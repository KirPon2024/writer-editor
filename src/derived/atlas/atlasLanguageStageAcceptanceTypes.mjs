export const ATLAS_LANGUAGE_STAGE_ACCEPTANCE_SCHEMA_VERSION = 'derived.atlas.languageStageAcceptance.v1';
export const ATLAS_LANGUAGE_STAGE_ACCEPTANCE_PROOF_SCHEMA_VERSION = 'derived.atlas.languageStageAcceptanceProof.v1';
export const ATLAS_LANGUAGE_STAGE_HANDOFF_SCHEMA_VERSION = 'derived.atlas.languageStageHandoff.v1';

export const ATLAS_LANGUAGE_STAGE_GATE_STATUS = Object.freeze({
  PASS: 'PASS',
  DEGRADED: 'DEGRADED',
});

export function sortAtlasLanguageStageGates(rows) {
  return [...(Array.isArray(rows) ? rows : [])].sort((left, right) => {
    return String(left?.id || '').localeCompare(String(right?.id || ''), 'en', { sensitivity: 'variant' });
  });
}
