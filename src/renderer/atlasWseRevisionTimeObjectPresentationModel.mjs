const VIEW_LABELS = Object.freeze({
  semanticDiff: 'Semantic diff',
  retconSimulator: 'Retcon',
  storyClock: 'Story clock',
  objectCustody: 'Object custody',
});

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function count(value) {
  return Number.isSafeInteger(value) ? Math.max(0, value) : 0;
}

export function normalizeWseRevisionTimeObjectPresentation(source = {}, requestedView = 'semanticDiff') {
  const projection = object(source);
  const views = object(projection.views);
  const order = Array.isArray(projection.viewOrder)
    ? projection.viewOrder.filter((id) => Object.hasOwn(VIEW_LABELS, id))
    : [];
  const viewOrder = order.length === 4 ? order : Object.keys(VIEW_LABELS);
  const viewId = viewOrder.includes(requestedView) ? requestedView : viewOrder[0];
  const selected = object(views[viewId]);
  const rows = Array.isArray(selected.rows) ? selected.rows.filter((row) => row && typeof row === 'object' && !Array.isArray(row)) : [];
  return {
    schemaVersion: typeof projection.schemaVersion === 'string' ? projection.schemaVersion : 'yalken.r24.wseRevisionTimeObject.v1',
    state: typeof projection.state === 'string' ? projection.state : 'emptyOrUnknown',
    projectionDigest: typeof projection.projectionDigest === 'string' ? projection.projectionDigest : '',
    viewId,
    tabs: viewOrder.map((id) => ({ id, label: VIEW_LABELS[id], selected: id === viewId })),
    view: {
      id: viewId,
      label: VIEW_LABELS[viewId],
      state: typeof selected.state === 'string' ? selected.state : 'unknown',
      reason: typeof selected.reason === 'string' ? selected.reason : 'UNKNOWN_SOURCE',
      totalCount: count(selected.totalCount),
      visibleCount: Math.min(count(selected.visibleCount), rows.length),
      omittedCount: count(selected.omittedCount),
      rows,
    },
    readOnly: object(projection.authority).readOnly === true,
  };
}

export function wseRevisionTimeObjectRowEvidence(row = {}) {
  const source = object(row);
  if (source.evidence && typeof source.evidence === 'object' && !Array.isArray(source.evidence)) return source.evidence;
  const events = Array.isArray(source.events) ? source.events : [];
  const last = events.at(-1);
  return last && last.evidence && typeof last.evidence === 'object' && !Array.isArray(last.evidence) ? last.evidence : null;
}
