export const WRITER_A11Y_PERFORMANCE_SCHEMA_VERSION = 'WriterA11yPerformanceProjectionV1';

export const WRITER_A11Y_PERFORMANCE_BUDGETS = Object.freeze({
  typingSynchronousMs: 16,
  survivorWorkMs: 8,
  sampleLimit: 120,
});

const RTL_LANGUAGE_IDS = new Set([
  'ar',
  'dv',
  'fa',
  'he',
  'ku',
  'ps',
  'sd',
  'ug',
  'ur',
  'yi',
]);

const VALID_DIRECTIONS = new Set(['auto', 'ltr', 'rtl']);
const VALID_BUDGET_LANES = new Set(['typing', 'survivor']);

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function normalizeLocale(value) {
  const locale = String(value || '').trim().toLowerCase();
  return locale || 'und';
}

function languageIdFromLocale(locale) {
  return normalizeLocale(locale).split(/[-_]/u, 1)[0] || 'und';
}

export function resolveWriterInterfaceDirection({ locale = 'und', requestedDirection = 'auto' } = {}) {
  const direction = String(requestedDirection || '').trim().toLowerCase();
  const normalizedDirection = VALID_DIRECTIONS.has(direction) ? direction : 'auto';
  if (normalizedDirection === 'ltr' || normalizedDirection === 'rtl') return normalizedDirection;
  return RTL_LANGUAGE_IDS.has(languageIdFromLocale(locale)) ? 'rtl' : 'ltr';
}

export function buildWriterA11yPerformanceProjection({
  viewportWidth = 1440,
  locale = 'und',
  requestedDirection = 'auto',
  reducedMotion = false,
} = {}) {
  const boundedViewportWidth = clampInteger(viewportWidth, 320, 4096, 1440);
  const interfaceDirection = resolveWriterInterfaceDirection({ locale, requestedDirection });
  const reflowMode = boundedViewportWidth <= 899
    ? 'single-column-overlay'
    : boundedViewportWidth <= 1279
      ? 'compact-docked'
      : 'calm-docked';

  return Object.freeze({
    schemaVersion: WRITER_A11Y_PERFORMANCE_SCHEMA_VERSION,
    owner: 'DESIGN_OS_INTERFACE_PLANE',
    productTruth: false,
    storageTruth: false,
    locale: normalizeLocale(locale),
    interfaceDirection,
    authoringDirection: 'auto',
    bidiPolicy: 'plaintext',
    viewportWidth: boundedViewportWidth,
    reflowMode,
    motionMode: reducedMotion === true ? 'reduced' : 'standard',
    keyboardModel: 'native-controls-roving-tabs-and-escape',
    screenReaderModel: 'polite-atomic-status',
    budgets: WRITER_A11Y_PERFORMANCE_BUDGETS,
  });
}

function setAttribute(element, name, value) {
  if (!element || typeof element.setAttribute !== 'function') return;
  const nextValue = String(value);
  if (typeof element.getAttribute === 'function' && element.getAttribute(name) === nextValue) return;
  element.setAttribute(name, nextValue);
}

export function applyWriterA11yPerformanceProjection({
  documentElement,
  appLayout,
  editorElement,
  statusRegion,
  projection,
} = {}) {
  if (!projection || projection.schemaVersion !== WRITER_A11Y_PERFORMANCE_SCHEMA_VERSION) {
    return Object.freeze({ applied: false, code: 'E_WRITER_A11Y_PROJECTION_INVALID' });
  }

  setAttribute(documentElement, 'dir', projection.interfaceDirection);
  setAttribute(documentElement, 'data-writer-a11y-contract', projection.schemaVersion);
  setAttribute(appLayout, 'data-writer-reflow', projection.reflowMode);
  setAttribute(appLayout, 'data-writer-motion', projection.motionMode);
  setAttribute(appLayout, 'data-writer-direction', projection.interfaceDirection);
  setAttribute(editorElement, 'dir', projection.authoringDirection);
  setAttribute(editorElement, 'data-bidi-policy', projection.bidiPolicy);
  setAttribute(statusRegion, 'role', 'status');
  setAttribute(statusRegion, 'aria-live', 'polite');
  setAttribute(statusRegion, 'aria-atomic', 'true');

  return Object.freeze({
    applied: true,
    code: 'WRITER_A11Y_PROJECTION_APPLIED',
    reflowMode: projection.reflowMode,
    motionMode: projection.motionMode,
    interfaceDirection: projection.interfaceDirection,
  });
}

function percentile95(samples) {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

function failBudget(code, lane, durationMs = null) {
  return Object.freeze({
    ok: false,
    code,
    lane,
    durationMs,
  });
}

export function createWriterPerformanceBudgetMonitor(options = {}) {
  const typingBudgetMs = clampInteger(
    options.typingBudgetMs,
    1,
    1000,
    WRITER_A11Y_PERFORMANCE_BUDGETS.typingSynchronousMs,
  );
  const survivorBudgetMs = clampInteger(
    options.survivorBudgetMs,
    1,
    1000,
    WRITER_A11Y_PERFORMANCE_BUDGETS.survivorWorkMs,
  );
  const sampleLimit = clampInteger(
    options.sampleLimit,
    1,
    1000,
    WRITER_A11Y_PERFORMANCE_BUDGETS.sampleLimit,
  );
  const samples = {
    typing: [],
    survivor: [],
  };
  let latestGeneration = 0;

  function snapshot() {
    return Object.freeze({
      typing: Object.freeze({
        budgetMs: typingBudgetMs,
        count: samples.typing.length,
        p95Ms: percentile95(samples.typing),
      }),
      survivor: Object.freeze({
        budgetMs: survivorBudgetMs,
        count: samples.survivor.length,
        p95Ms: percentile95(samples.survivor),
      }),
      latestGeneration,
    });
  }

  function record({ lane, durationMs, generation = latestGeneration } = {}) {
    if (!VALID_BUDGET_LANES.has(lane)) return failBudget('E_WRITER_BUDGET_LANE_INVALID', lane || null);
    const duration = Number(durationMs);
    if (!Number.isFinite(duration) || duration < 0) {
      return failBudget('E_WRITER_BUDGET_DURATION_INVALID', lane);
    }
    if (!Number.isInteger(generation) || generation < 0) {
      return failBudget('E_WRITER_BUDGET_GENERATION_INVALID', lane, duration);
    }
    if (generation < latestGeneration) {
      return failBudget('E_WRITER_SURVIVOR_STALE_GENERATION', lane, duration);
    }

    latestGeneration = Math.max(latestGeneration, generation);
    samples[lane].push(duration);
    if (samples[lane].length > sampleLimit) samples[lane].shift();

    const budgetMs = lane === 'typing' ? typingBudgetMs : survivorBudgetMs;
    const withinBudget = duration <= budgetMs;
    return Object.freeze({
      ok: withinBudget,
      code: withinBudget ? 'WRITER_BUDGET_SAMPLE_PASS' : 'E_WRITER_BUDGET_EXCEEDED',
      lane,
      durationMs: duration,
      budgetMs,
      generation,
      snapshot: snapshot(),
    });
  }

  return Object.freeze({ record, snapshot });
}
