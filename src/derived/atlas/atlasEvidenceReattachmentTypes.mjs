export const ATLAS_EVIDENCE_REATTACHMENT_INBOX_SCHEMA_VERSION = 'derived.atlas.evidenceReattachmentInbox.v1';
export const ATLAS_EVIDENCE_REATTACHMENT_ITEM_SCHEMA_VERSION = 'derived.atlas.evidenceReattachmentItem.v1';
export const ATLAS_EVIDENCE_REATTACHMENT_CANDIDATE_SCHEMA_VERSION = 'derived.atlas.evidenceReattachmentCandidate.v1';
export const ATLAS_EVIDENCE_REATTACHMENT_RECORD_SCHEMA_VERSION = 'atlas.evidenceReattachment.v1';

function compareText(a, b) {
  return String(a).localeCompare(String(b), 'en', { sensitivity: 'variant' });
}

function compareNumber(a, b) {
  return Number(a) - Number(b);
}

export function sortAtlasEvidenceReattachmentItems(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const state = compareText(a.status, b.status);
    if (state !== 0) return state;
    const kind = compareText(a.sourceRecordKind, b.sourceRecordKind);
    if (kind !== 0) return kind;
    return compareText(a.sourceRecordId, b.sourceRecordId);
  });
}

export function sortAtlasEvidenceReattachmentCandidates(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const source = compareText(a.sourceRecordId, b.sourceRecordId);
    if (source !== 0) return source;
    const scene = compareText(a.evidenceAnchor.sceneId, b.evidenceAnchor.sceneId);
    if (scene !== 0) return scene;
    const start = compareNumber(a.evidenceAnchor.startOffset, b.evidenceAnchor.startOffset);
    if (start !== 0) return start;
    return compareText(a.candidateId, b.candidateId);
  });
}
