import {
  ATLAS_REGISTER_ORIGIN,
  assertAtlasRegisterCurrent,
  verifyAtlasAskResultDigest,
  verifyAtlasRegisterProjectionDigest,
} from '../core/atlas-register-ask-v1.mjs';

export const ATLAS_REGISTER_ASK_PRESENTATION_SCHEMA_VERSION = 'yalken.renderer.atlasRegisterAskPresentation.v1';

function freezeDeep(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; for (const child of Object.values(value)) freezeDeep(child); return Object.freeze(value); }
function safeText(value, fallback = '', maximum = 4096) { if (typeof value !== 'string') return fallback; const text = value.normalize('NFC').replace(/[\u0000-\u001f\u007f]/gu, '').trim(); return text.slice(0, maximum) || fallback; }
function presentEntry(entry) {
  return freezeDeep({
    entryId: safeText(entry.entryId),
    origin: entry.origin,
    kind: safeText(entry.kind),
    label: safeText(entry.label, 'Untitled register entry'),
    body: safeText(entry.body),
    sourceLabel: safeText(entry.sourceId, 'Unknown source'),
    evidenceIds: Array.isArray(entry.evidenceIds) ? entry.evidenceIds.map((value) => safeText(value)).filter(Boolean) : [],
    evidenceCount: Array.isArray(entry.evidenceIds) ? entry.evidenceIds.length : 0,
  });
}

export function buildAtlasRegisterAskPresentation(input = {}) {
  const projection = verifyAtlasRegisterProjectionDigest(assertAtlasRegisterCurrent(input.registerProjection, input.currentIdentity));
  const result = verifyAtlasAskResultDigest(input.queryResult);
  if (result.registerProjectionDigest !== projection.projectionDigest) throw new Error('E_ATLAS_REGISTER_ASK_PRESENTATION_RESULT_STALE');
  for (const key of ['projectRevisionId', 'snapshotId', 'generation', 'sharedRowSetDigest']) if (result[key] !== projection[key]) throw new Error(`E_ATLAS_REGISTER_ASK_PRESENTATION_IDENTITY_STALE:${key}`);
  const authored = projection.entries.filter((entry) => entry.origin === ATLAS_REGISTER_ORIGIN.AUTHORED).map(presentEntry);
  const computed = projection.entries.filter((entry) => entry.origin === ATLAS_REGISTER_ORIGIN.COMPUTED).map(presentEntry);
  const results = result.entries.map(presentEntry);
  return freezeDeep({
    schemaVersion: ATLAS_REGISTER_ASK_PRESENTATION_SCHEMA_VERSION,
    state: projection.entries.length === 0 ? 'empty' : 'ready',
    queryState: results.length === 0 ? 'no-results' : result.truncated ? 'truncated' : 'complete',
    projectRevisionId: projection.projectRevisionId,
    snapshotId: projection.snapshotId,
    generation: projection.generation,
    registerProjectionDigest: projection.projectionDigest,
    queryDigest: result.queryDigest,
    resultDigest: result.resultDigest,
    authored,
    computed,
    results,
    summary: Object.freeze({
      authoredCount: authored.length,
      computedCount: computed.length,
      registerCount: projection.entries.length,
      totalMatched: result.totalMatched,
      returned: result.returned,
      truncated: result.truncated,
    }),
  });
}

export function assertAtlasRegisterAskPresentationParity(presentation, registerProjection, queryResult) {
  if (!presentation || presentation.schemaVersion !== ATLAS_REGISTER_ASK_PRESENTATION_SCHEMA_VERSION) throw new Error('E_ATLAS_REGISTER_ASK_PRESENTATION_SCHEMA');
  if (presentation.summary.registerCount !== registerProjection.denominator.total) throw new Error('E_ATLAS_REGISTER_ASK_PRESENTATION_REGISTER_DENOMINATOR');
  if (presentation.summary.authoredCount !== registerProjection.denominator.authored || presentation.summary.computedCount !== registerProjection.denominator.computed) throw new Error('E_ATLAS_REGISTER_ASK_PRESENTATION_ORIGIN_DENOMINATOR');
  if (presentation.summary.totalMatched !== queryResult.totalMatched || presentation.summary.returned !== queryResult.returned || presentation.results.length !== queryResult.returned) throw new Error('E_ATLAS_REGISTER_ASK_PRESENTATION_RESULT_DENOMINATOR');
  if (new Set(presentation.results.map((entry) => entry.entryId)).size !== presentation.results.length) throw new Error('E_ATLAS_REGISTER_ASK_PRESENTATION_DUPLICATE_RESULT');
  return presentation;
}
