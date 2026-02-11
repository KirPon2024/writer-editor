const CANON_LIST = ['RETRY', 'SAVE_AS', 'OPEN_SNAPSHOT', 'ABORT'];
const CANON_SET = new Set(CANON_LIST);

export const RECOVERY_ACTION_CANON = Object.freeze([...CANON_LIST]);

function normalizeToken(input) {
  if (typeof input !== 'string') return '';
  const token = input.trim().toUpperCase();
  return CANON_SET.has(token) ? token : '';
}

export function normalizeRecoveryActions(input, options = {}) {
  const source = Array.isArray(input) ? input : [];
  const fallback = Array.isArray(options.fallback) ? options.fallback : [];
  const out = [];
  const seen = new Set();

  for (const item of [...source, ...fallback]) {
    const token = normalizeToken(item);
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
    if (out.length >= RECOVERY_ACTION_CANON.length) break;
  }

  return out;
}

export function isRecoveryActionCanon(action) {
  return normalizeToken(action).length > 0;
}
