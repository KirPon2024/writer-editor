const VIEW_ORDER = Object.freeze(['setupPayoffBoard', 'dependencyDag', 'canonCi', 'whyWhyNot']);
const VIEW_LABELS = Object.freeze({
  setupPayoffBoard: 'Setup / payoff',
  dependencyDag: 'Dependencies',
  canonCi: 'Canon CI',
  whyWhyNot: 'Why / why not',
});

const plain = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clean = (value) => typeof value === 'string' ? value.trim() : '';
const count = (value, fallback = 0) => Number.isSafeInteger(value) && value >= 0 ? value : fallback;

export function normalizeWseThreadsExplanationPresentation(source, selectedView = 'setupPayoffBoard') {
  const input = plain(source) ? source : {};
  const viewId = VIEW_ORDER.includes(selectedView) ? selectedView : 'setupPayoffBoard';
  const rawViews = plain(input.views) ? input.views : {};
  const views = Object.fromEntries(VIEW_ORDER.map((id) => {
    const raw = plain(rawViews[id]) ? rawViews[id] : {};
    const rows = Array.isArray(raw.rows) ? raw.rows.filter(plain).slice(0, 128) : [];
    return [id, {
      id,
      label: VIEW_LABELS[id],
      rows,
      totalCount: count(raw.totalCount, rows.length),
      visibleCount: rows.length,
      omittedCount: count(raw.omittedCount),
      availability: clean(raw.availability),
      statusDenominator: plain(raw.statusDenominator) ? raw.statusDenominator : {},
    }];
  }));
  return Object.freeze({
    schemaVersion: 'renderer.atlasWseThreadsExplanationPresentation.v1',
    projectId: clean(input.projectId),
    state: clean(input.state) || 'empty',
    projectionDigest: clean(input.projectionDigest),
    viewId,
    tabs: VIEW_ORDER.map((id) => ({ id, label: VIEW_LABELS[id], selected: id === viewId })),
    view: views[viewId],
    views,
    absenceLabel: clean(input.openWorld?.absenceMeans) || 'UNKNOWN_NOT_RECORDED',
    causalAvailability: clean(input.availability?.causalProjection) || 'UNKNOWN_NO_EXPLICIT_CAUSAL_PROJECTION',
  });
}

export function wseThreadsRowEvidence(row) {
  if (!plain(row)) return null;
  for (const key of ['setupEvidence', 'payoffEvidence', 'evidence']) {
    if (Array.isArray(row[key])) {
      const evidence = row[key].find((item) => plain(item) && clean(item.sceneId) && clean(item.quote));
      if (evidence) return evidence;
    }
  }
  return null;
}
