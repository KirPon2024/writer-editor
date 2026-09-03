const VIEW_ORDER = Object.freeze(['storyStateDebugger', 'livingEvidenceBible', 'sceneCockpit', 'knowledgeMatrix']);
const VIEW_LABELS = Object.freeze({
  storyStateDebugger: 'Story state',
  livingEvidenceBible: 'Evidence bible',
  sceneCockpit: 'Scene cockpit',
  knowledgeMatrix: 'Knowledge matrix',
});
const plain = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clean = (value) => typeof value === 'string' ? value.trim() : '';

export function normalizeWseStateEvidencePresentation(source, selectedView = 'storyStateDebugger') {
  const input = plain(source) ? source : {};
  const viewId = VIEW_ORDER.includes(selectedView) ? selectedView : 'storyStateDebugger';
  const rawViews = plain(input.views) ? input.views : {};
  const views = Object.fromEntries(VIEW_ORDER.map((id) => {
    const raw = plain(rawViews[id]) ? rawViews[id] : {};
    const rows = Array.isArray(raw.rows) ? raw.rows.filter(plain).slice(0, 128) : [];
    return [id, { id, label: VIEW_LABELS[id], rows,
      totalCount: Number.isSafeInteger(raw.totalCount) ? Math.max(raw.totalCount, rows.length) : rows.length,
      visibleCount: rows.length,
      omittedCount: Number.isSafeInteger(raw.omittedCount) ? Math.max(0, raw.omittedCount) : 0 }];
  }));
  return Object.freeze({
    schemaVersion: 'renderer.atlasWseStateEvidencePresentation.v1',
    projectId: clean(input.projectId), state: clean(input.state) || 'empty',
    projectionDigest: clean(input.projectionDigest), viewId,
    tabs: VIEW_ORDER.map((id) => ({ id, label: VIEW_LABELS[id], selected: id === viewId })),
    view: views[viewId], views,
    openWorldLabel: clean(input.openWorld?.absenceMeans) || 'UNKNOWN_NOT_RECORDED',
  });
}

export function wseRowEvidence(row) {
  if (!plain(row)) return null;
  if (plain(row.evidence)) return row.evidence;
  if (Array.isArray(row.evidence)) return row.evidence.find(plain) || null;
  return null;
}
