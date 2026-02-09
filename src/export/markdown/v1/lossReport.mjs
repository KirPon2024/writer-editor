function normalizeLossString(value) {
  return String(value ?? '').trim();
}

export function createLossReport() {
  return {
    count: 0,
    items: [],
  };
}

export function appendLoss(report, lossItem) {
  if (!report || typeof report !== 'object' || !Array.isArray(report.items)) return;
  const item = {
    kind: normalizeLossString(lossItem?.kind),
    path: normalizeLossString(lossItem?.path),
    note: normalizeLossString(lossItem?.note),
    evidence: normalizeLossString(lossItem?.evidence),
  };
  report.items.push(item);
}

export function finalizeLossReport(report) {
  const out = {
    count: 0,
    items: [],
  };
  if (!report || typeof report !== 'object' || !Array.isArray(report.items)) return out;

  const items = report.items
    .filter((it) => it && typeof it === 'object')
    .map((it) => ({
      kind: normalizeLossString(it.kind),
      path: normalizeLossString(it.path),
      note: normalizeLossString(it.note),
      evidence: normalizeLossString(it.evidence),
    }));

  items.sort((a, b) => {
    const ak = `${a.kind}\u0000${a.path}\u0000${a.note}\u0000${a.evidence}`;
    const bk = `${b.kind}\u0000${b.path}\u0000${b.note}\u0000${b.evidence}`;
    return ak.localeCompare(bk);
  });
  out.items = items;
  out.count = items.length;
  return out;
}
