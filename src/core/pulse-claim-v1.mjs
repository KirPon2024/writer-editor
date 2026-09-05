import { hashCanonicalValue } from './browser-safe-hash.mjs';
import {
  assertPulseDescriptiveHistoryCurrent,
  buildPulseDescriptiveHistory,
} from './descriptive-history-v1.mjs';
import { readPulseLedgerSnapshot } from './pulse-ledger-v1.mjs';
import { readPulsePrivacyStateSnapshot } from './pulse-privacy-v1.mjs';

export const PULSE_CLAIM_SCHEMA = 'yalken.r24.pulseClaim.v1';
export const PULSE_CLAIM_STAGE_ID = 'WP-806_PULSE_CLAIM';
export const PULSE_CLAIM_MAX_VISIBLE_ROWS = 64;

export class PulseClaimError extends Error {
  constructor(code) { super(code); this.code = code; }
}

const fail = (code) => { throw new PulseClaimError(code); };
const plain = (value) => value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const freeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
const count = (value, code) => {
  if (!Number.isSafeInteger(value) || value < 0) fail(code);
  return value;
};
const boundedRowLimit = (value) => {
  if (!Number.isSafeInteger(value) || value < 1 || value > PULSE_CLAIM_MAX_VISIBLE_ROWS) fail('E_WP806_ROW_LIMIT');
  return value;
};

function privacyStatus(value) {
  if (!plain(value) || !['OPTED_IN', 'OPTED_OUT'].includes(value.collectionStatus)) fail('E_WP806_PRIVACY_STATE');
  return value.collectionStatus;
}

function metric(value) {
  if (!plain(value) || !['RECORDED', 'NOT_RECORDED'].includes(value.status)) fail('E_WP806_METRIC');
  if (value.status === 'RECORDED' && !Number.isSafeInteger(value.value) && typeof value.value !== 'string') fail('E_WP806_METRIC');
  if (value.status === 'NOT_RECORDED' && value.value !== null) fail('E_WP806_METRIC');
  return { status: value.status, value: value.value, provenance: value.origin };
}

function claimRows(history) {
  const hasRows = history.rows.length > 0;
  return [
    { id: 'DESCRIPTIVE_ONLY', status: 'PASS', reason: 'NO_PRODUCTIVITY_OR_EFFORT_SCORE' },
    { id: 'RECORDED_DENOMINATORS', status: hasRows ? 'PASS' : 'ABSTAIN', reason: hasRows ? 'RECORDED_PARTIAL_AND_NOT_RECORDED_EXPLICIT' : 'EMPTY_HISTORY' },
    { id: 'LOCAL_ONLY', status: 'PASS', reason: 'FIXED_INTERNAL_DIRECTORY_NO_NETWORK' },
    { id: 'NO_PRIVATE_PAYLOAD', status: 'PASS', reason: 'NO_CONTENT_IDENTITY_OR_PATH_FIELDS' },
    { id: 'IMMUTABLE_CURRENT', status: 'PASS', reason: 'REVISION_GENERATION_AND_DIGEST_REVALIDATED' },
    { id: 'ACCESSIBLE_HISTORY', status: 'PASS', reason: 'NATIVE_LIST_AND_VISIBLE_PROVENANCE' },
  ];
}

function baseProjection(collectionStatus) {
  return {
    schemaVersion: PULSE_CLAIM_SCHEMA,
    stageId: PULSE_CLAIM_STAGE_ID,
    state: collectionStatus === 'OPTED_OUT' ? 'optedOut' : 'empty',
    privacy: { collectionStatus, aggregateOnly: true },
    historyIdentity: null,
    summary: { totalRows: 0, visibleRows: 0, omittedRows: 0, recordedFields: 0, partialFields: 0, notRecordedFields: 0 },
    rows: [],
    claims: collectionStatus === 'OPTED_OUT' ? [
      { id: 'PRIVACY_BOUNDARY', status: 'PASS', reason: 'OPTED_OUT_HISTORY_NOT_READ' },
    ] : [],
    accessibility: {
      role: 'list',
      itemRole: 'article',
      keyboard: ['Tab'],
      provenanceVisible: true,
      denominatorVisible: true,
      noPointerOnlyState: true,
    },
    authority: {
      readOnly: true,
      explicitOpenRequired: true,
      productMutation: false,
      manuscriptMutation: false,
      storageMutation: false,
      networkMutation: false,
      rendererPathAuthority: false,
    },
  };
}

export function buildPulseClaim({ historyProjection, currentIdentity, privacyState }, { rowLimit = 32 } = {}) {
  const limit = boundedRowLimit(rowLimit);
  if (privacyStatus(privacyState) !== 'OPTED_IN') fail('E_WP806_HISTORY_REQUIRES_OPT_IN');
  const history = assertPulseDescriptiveHistoryCurrent(historyProjection, currentIdentity);
  const rows = history.rows.slice(0, limit).map((row) => ({
    sequence: count(row.sequence, 'E_WP806_SEQUENCE'),
    sourceRevisionOrdinal: count(row.sourceRevisionOrdinal, 'E_WP806_SOURCE_REVISION'),
    generation: count(row.generation, 'E_WP806_GENERATION'),
    added: metric(row.added),
    deleted: metric(row.deleted),
    net: metric(row.net),
    touched: metric(row.touched),
    sessions: metric(row.sessions),
    sceneEdits: metric(row.sceneEdits),
    declaredTasks: metric(row.declaredTasks),
    manualPhase: metric(row.manualPhase),
  }));
  const summaryValues = Object.values(history.summary);
  const payload = {
    ...baseProjection('OPTED_IN'),
    state: history.rows.length === 0 ? 'empty' : summaryValues.some((item) => item.status === 'PARTIAL' || item.status === 'NOT_RECORDED') ? 'degraded' : 'ready',
    historyIdentity: { ...history.identity, projectionDigest: history.projectionDigest },
    summary: {
      totalRows: history.rows.length,
      visibleRows: rows.length,
      omittedRows: Math.max(0, history.rows.length - rows.length),
      recordedFields: summaryValues.filter((item) => item.status === 'COMPLETE').length,
      partialFields: summaryValues.filter((item) => item.status === 'PARTIAL').length,
      notRecordedFields: summaryValues.filter((item) => item.status === 'NOT_RECORDED').length,
    },
    rows,
    claims: claimRows(history),
  };
  return freeze({ ...payload, projectionDigest: hashCanonicalValue(payload) });
}

export async function readPulseClaimProjection(directory, { rowLimit = 32 } = {}) {
  boundedRowLimit(rowLimit);
  const privacyState = readPulsePrivacyStateSnapshot(directory);
  if (privacyStatus(privacyState) === 'OPTED_OUT') {
    const payload = baseProjection('OPTED_OUT');
    return freeze({ ...payload, projectionDigest: hashCanonicalValue(payload) });
  }
  const ledgerSnapshot = await readPulseLedgerSnapshot(directory);
  const generation = ledgerSnapshot.entries.at(-1)?.receipt?.generation ?? 0;
  const currentIdentity = {
    ledgerSequence: ledgerSnapshot.sequence,
    ledgerHeadDigest: ledgerSnapshot.headDigest,
    declarationRevisionOrdinal: 0,
    generation,
  };
  const historyProjection = buildPulseDescriptiveHistory({
    ledgerSnapshot,
    declarationSnapshot: {
      schemaVersion: 'yalken.r24.pulseHistoryDeclarations.v1',
      ledgerSequence: ledgerSnapshot.sequence,
      ledgerHeadDigest: ledgerSnapshot.headDigest,
      revisionOrdinal: 0,
      generation,
      entries: [],
    },
    currentIdentity,
  });
  return buildPulseClaim({ historyProjection, currentIdentity, privacyState }, { rowLimit });
}
