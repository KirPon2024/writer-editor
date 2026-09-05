const FIELD_LABELS = Object.freeze({
  added: 'Words added',
  deleted: 'Words deleted',
  net: 'Net words',
  touched: 'Words touched',
  sessions: 'Sessions completed',
  sceneEdits: 'Scenes edited',
  declaredTasks: 'Declared tasks',
  manualPhase: 'Manual phase',
});

const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : 0;

function metric(value) {
  const source = object(value);
  if (source.status !== 'RECORDED') {
    return { status: 'NOT_RECORDED', value: null, displayValue: 'Not recorded', provenance: '' };
  }
  const recorded = Number.isSafeInteger(source.value) || typeof source.value === 'string' ? source.value : null;
  if (recorded === null) return { status: 'NOT_RECORDED', value: null, displayValue: 'Not recorded', provenance: '' };
  return {
    status: 'RECORDED',
    value: recorded,
    displayValue: String(recorded),
    provenance: typeof source.provenance === 'string' ? source.provenance : '',
  };
}

export function normalizePulseHistoryPresentation(source = {}) {
  const projection = object(source);
  const privacy = object(projection.privacy);
  const summary = object(projection.summary);
  const rawRows = Array.isArray(projection.rows) ? projection.rows.slice(0, 64) : [];
  const rows = rawRows.map((raw) => {
    const row = object(raw);
    return {
      sequence: count(row.sequence),
      sourceRevisionOrdinal: count(row.sourceRevisionOrdinal),
      generation: count(row.generation),
      metrics: Object.entries(FIELD_LABELS).map(([id, fieldLabel]) => ({ id, fieldLabel, ...metric(row[id]) })),
    };
  });
  const state = ['ready', 'degraded', 'empty', 'optedOut', 'unavailable', 'loading'].includes(projection.state)
    ? projection.state : 'unavailable';
  const totalRows = count(summary.totalRows);
  const visibleRows = Math.min(count(summary.visibleRows), rows.length);
  const omittedRows = count(summary.omittedRows);
  const statusText = state === 'optedOut'
    ? 'Writing history is off. Local history remains unread.'
    : state === 'empty'
      ? 'No local aggregate history has been recorded.'
      : state === 'unavailable'
        ? (typeof projection.unavailableReason === 'string' && projection.unavailableReason) || 'Writing history is unavailable.'
        : state === 'loading'
          ? 'Writing history is loading after explicit open.'
          : `${visibleRows} of ${totalRows} revisions shown · ${count(summary.recordedFields)} complete · ${count(summary.partialFields)} partial · ${count(summary.notRecordedFields)} not recorded`;
  return {
    schemaVersion: typeof projection.schemaVersion === 'string' ? projection.schemaVersion : 'yalken.r24.pulseClaim.v1',
    state,
    statusText,
    privacyStatus: privacy.collectionStatus === 'OPTED_IN' ? 'OPTED_IN' : 'OPTED_OUT',
    aggregateOnly: privacy.aggregateOnly === true,
    totalRows,
    visibleRows,
    omittedRows,
    rows,
    claims: Array.isArray(projection.claims) ? projection.claims.filter((row) => row && typeof row === 'object' && !Array.isArray(row)) : [],
    readOnly: object(projection.authority).readOnly === true,
  };
}
