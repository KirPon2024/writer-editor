export const ATLAS_CONTINUITY_FINDINGS_SCHEMA_VERSION = 'derived.atlas.continuityFindings.v1';
export const ATLAS_CONTINUITY_FINDING_SCHEMA_VERSION = 'derived.atlas.continuityFinding.v1';
export const ATLAS_CONTINUITY_OUTCOME_SCHEMA_VERSION = 'derived.atlas.continuityOutcome.v1';
export const ATLAS_CONTINUITY_FINDINGS_GENERATION_PROOF_SCHEMA_VERSION = 'derived.atlas.continuityFindingsGenerationProof.v1';

function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'en', { sensitivity: 'variant' });
}

function compareNumber(a, b) {
  return Number(a || 0) - Number(b || 0);
}

export function sortAtlasContinuityFindings(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const severity = compareText(a.severityRank, b.severityRank);
    if (severity !== 0) return severity;
    const kind = compareText(a.findingKind, b.findingKind);
    if (kind !== 0) return kind;
    return compareText(a.id, b.id);
  });
}

export function sortAtlasContinuityOutcomes(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const kind = compareText(a.outcomeKind, b.outcomeKind);
    if (kind !== 0) return kind;
    const ordinal = compareNumber(a.sceneOrdinal, b.sceneOrdinal);
    if (ordinal !== 0) return ordinal;
    return compareText(a.id, b.id);
  });
}
