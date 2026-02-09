export const MARKDOWN_TRANSFORM_OP = 'markdown.transform.v1';

export const DEFAULT_LIMITS = Object.freeze({
  maxInputBytes: 1024 * 1024,
  maxDepth: 6,
  maxNodes: 10_000,
  maxMillis: 250,
});

export class MarkdownTransformError extends Error {
  constructor(code, reason, details = {}) {
    super(reason);
    this.name = 'MarkdownTransformError';
    this.code = String(code || 'E_MD_UNKNOWN');
    this.op = MARKDOWN_TRANSFORM_OP;
    this.reason = String(reason || 'unknown_error');
    this.details = details && typeof details === 'object' ? details : {};
  }
}

export function createMarkdownTransformError(code, reason, details = {}) {
  return new MarkdownTransformError(code, reason, details);
}

export function normalizeLimits(input = {}) {
  const raw = input && typeof input === 'object' ? input : {};
  const pick = (key) => {
    const value = raw[key];
    if (!Number.isFinite(value)) return DEFAULT_LIMITS[key];
    const intValue = Math.floor(value);
    if (intValue <= 0) return DEFAULT_LIMITS[key];
    return intValue;
  };
  return {
    maxInputBytes: pick('maxInputBytes'),
    maxDepth: pick('maxDepth'),
    maxNodes: pick('maxNodes'),
    maxMillis: pick('maxMillis'),
  };
}

export function normalizeMarkdownInput(value) {
  const text = String(value ?? '');
  return text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}
