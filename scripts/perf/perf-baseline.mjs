import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const DEFAULT_BASELINE_PATH = 'docs/OPS/PERF/PERF_LITE_BASELINE.json';
const DEFAULT_TOLERANCES = Object.freeze({
  openP95MsPct: 35,
  typeBurstP95MsPct: 35,
  saveP95MsPct: 35,
  reopenP95MsPct: 35,
  longTaskCountAbs: 5,
});
const DELTA_DENOMINATOR_FLOOR_MS = 25;
const PERF_METRIC_KEYS = Object.freeze([
  'openP95Ms',
  'typeBurstP95Ms',
  'saveP95Ms',
  'reopenP95Ms',
  'longTaskCount',
]);

function parseArgs(argv = process.argv.slice(2)) {
  const modeRaw = String(argv[0] || '').trim().toLowerCase();
  const out = {
    mode: modeRaw,
    checkMode: 'release',
    baselinePath: DEFAULT_BASELINE_PATH,
    perfJsonPath: '',
    json: false,
  };
  for (let i = 1; i < argv.length; i += 1) {
    const arg = String(argv[i] || '').trim();
    if (arg === '--json') out.json = true;
    if (arg.startsWith('--mode=')) {
      const value = arg.slice('--mode='.length).trim().toLowerCase();
      if (value) out.checkMode = value;
    }
    if (arg === '--mode' && i + 1 < argv.length) {
      const value = String(argv[i + 1] || '').trim().toLowerCase();
      if (value) out.checkMode = value;
      i += 1;
    }
    if (arg === '--baseline' && i + 1 < argv.length) {
      out.baselinePath = String(argv[i + 1] || '').trim() || DEFAULT_BASELINE_PATH;
      i += 1;
    }
    if (arg === '--perf-json' && i + 1 < argv.length) {
      out.perfJsonPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }
  return out;
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getMachineInfo() {
  const cpu = Array.isArray(os.cpus()) && os.cpus().length > 0 ? os.cpus()[0].model : 'unknown';
  return {
    os: `${os.platform()} ${os.release()} ${os.arch()}`,
    cpu: String(cpu || 'unknown'),
    node: process.version,
  };
}

function normalizePerfResult(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('PERF_RESULT_INVALID');
  }
  const metricsInput = input.metrics && typeof input.metrics === 'object' ? input.metrics : {};
  const metrics = {
    openP95Ms: safeNumber(metricsInput.openP95Ms),
    typeBurstP95Ms: safeNumber(metricsInput.typeBurstP95Ms),
    saveP95Ms: safeNumber(metricsInput.saveP95Ms),
    reopenP95Ms: safeNumber(metricsInput.reopenP95Ms),
    longTaskCount: safeNumber(metricsInput.longTaskCount),
  };
  return {
    fixturePath: String(input.fixturePath || ''),
    metrics,
  };
}

function runPerfLite(perfJsonPath = '') {
  if (perfJsonPath) {
    return normalizePerfResult(readJson(path.resolve(process.cwd(), perfJsonPath)));
  }
  const result = spawnSync(process.execPath, ['scripts/perf/perf-lite.mjs', '--json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`PERF_LITE_EXEC_FAILED:${String(result.stderr || '').trim()}`);
  }
  let parsed = null;
  try {
    parsed = JSON.parse(String(result.stdout || '').trim());
  } catch {
    throw new Error('PERF_LITE_JSON_INVALID');
  }
  return normalizePerfResult(parsed);
}

function readBaselineOrNull(filePath) {
  const absPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(absPath)) {
    return null;
  }
  return readJson(absPath);
}

function buildBaselineDocument(prev, perf) {
  const previousTolerances = prev && prev.tolerances && typeof prev.tolerances === 'object'
    ? prev.tolerances
    : {};
  return {
    fixture: perf.fixturePath,
    updatedAt: new Date().toISOString().slice(0, 10),
    machine: getMachineInfo(),
    metrics: {
      openP95Ms: perf.metrics.openP95Ms,
      typeBurstP95Ms: perf.metrics.typeBurstP95Ms,
      saveP95Ms: perf.metrics.saveP95Ms,
      reopenP95Ms: perf.metrics.reopenP95Ms,
      longTaskCount: perf.metrics.longTaskCount,
    },
    tolerances: {
      openP95MsPct: safeNumber(previousTolerances.openP95MsPct, DEFAULT_TOLERANCES.openP95MsPct),
      typeBurstP95MsPct: safeNumber(previousTolerances.typeBurstP95MsPct, DEFAULT_TOLERANCES.typeBurstP95MsPct),
      saveP95MsPct: safeNumber(previousTolerances.saveP95MsPct, DEFAULT_TOLERANCES.saveP95MsPct),
      reopenP95MsPct: safeNumber(previousTolerances.reopenP95MsPct, DEFAULT_TOLERANCES.reopenP95MsPct),
      longTaskCountAbs: safeNumber(previousTolerances.longTaskCountAbs, DEFAULT_TOLERANCES.longTaskCountAbs),
    },
  };
}

function writeBaseline(filePath, doc) {
  const absPath = path.resolve(process.cwd(), filePath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, `${JSON.stringify(doc, null, 2)}\n`);
}

function compareAgainstBaseline(baseline, perf) {
  const failures = [];
  const deltas = {};
  const metricPairs = [
    ['openP95Ms', 'openP95MsPct'],
    ['typeBurstP95Ms', 'typeBurstP95MsPct'],
    ['saveP95Ms', 'saveP95MsPct'],
    ['reopenP95Ms', 'reopenP95MsPct'],
  ];

  for (const [metricKey, toleranceKey] of metricPairs) {
    const baseValue = safeNumber(baseline.metrics && baseline.metrics[metricKey], 0);
    const currentValue = safeNumber(perf.metrics[metricKey], 0);
    const allowedPct = safeNumber(baseline.tolerances && baseline.tolerances[toleranceKey], DEFAULT_TOLERANCES[toleranceKey]);
    const denominator = Math.max(Math.abs(baseValue), DELTA_DENOMINATOR_FLOOR_MS);
    const deltaPct = ((currentValue - baseValue) / denominator) * 100;
    deltas[metricKey] = Number(deltaPct.toFixed(3));
    if (currentValue > baseValue && deltaPct > allowedPct) {
      failures.push({
        metric: metricKey,
        baseline: baseValue,
        current: currentValue,
        deltaPct: Number(deltaPct.toFixed(3)),
        tolerancePct: allowedPct,
      });
    }
  }

  const baselineLongTask = safeNumber(baseline.metrics && baseline.metrics.longTaskCount, 0);
  const currentLongTask = safeNumber(perf.metrics.longTaskCount, 0);
  const longTaskDelta = currentLongTask - baselineLongTask;
  const longTaskTolerance = safeNumber(
    baseline.tolerances && baseline.tolerances.longTaskCountAbs,
    DEFAULT_TOLERANCES.longTaskCountAbs,
  );
  deltas.longTaskCount = Number(longTaskDelta.toFixed(3));
  if (longTaskDelta > longTaskTolerance) {
    failures.push({
      metric: 'longTaskCount',
      baseline: baselineLongTask,
      current: currentLongTask,
      deltaAbs: Number(longTaskDelta.toFixed(3)),
      toleranceAbs: longTaskTolerance,
    });
  }

  return {
    ok: failures.length === 0,
    failures,
    deltas,
  };
}

function validateBaselineDoc(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return false;
  if (typeof doc.fixture !== 'string' || !doc.fixture) return false;
  if (!doc.metrics || typeof doc.metrics !== 'object') return false;
  if (!doc.tolerances || typeof doc.tolerances !== 'object') return false;
  return PERF_METRIC_KEYS.every((key) => Number.isFinite(Number(doc.metrics[key])));
}

function printSummary(prefix, payload) {
  console.log(`${prefix}_STATUS=${payload.status}`);
  console.log(`${prefix}_BASELINE_PATH=${payload.baselinePath}`);
  console.log(`${prefix}_FIXTURE=${payload.fixture}`);
}

function runUpdate(args) {
  const previous = readBaselineOrNull(args.baselinePath);
  const perf = runPerfLite(args.perfJsonPath);
  const next = buildBaselineDocument(previous, perf);
  writeBaseline(args.baselinePath, next);

  const metricDiff = {};
  for (const key of PERF_METRIC_KEYS) {
    const prevValue = safeNumber(previous && previous.metrics && previous.metrics[key], 0);
    const nextValue = safeNumber(next.metrics[key], 0);
    metricDiff[key] = {
      from: prevValue,
      to: nextValue,
    };
  }

  const payload = {
    status: 'PASS',
    mode: 'update',
    baselinePath: args.baselinePath,
    fixture: next.fixture,
    updatedAt: next.updatedAt,
    metrics: next.metrics,
    metricDiff,
  };
  if (!args.json) {
    printSummary('PERF_BASELINE_UPDATE', payload);
    for (const [key, delta] of Object.entries(metricDiff)) {
      console.log(`PERF_BASELINE_UPDATE_${key}=${delta.from} -> ${delta.to}`);
    }
  }
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(0);
}

function runCheck(args) {
  const baseline = readBaselineOrNull(args.baselinePath);
  if (!baseline || !validateBaselineDoc(baseline)) {
    const failed = {
      status: 'FAIL',
      mode: 'check',
      baselinePath: args.baselinePath,
      failReason: 'PERF_BASELINE_INVALID_OR_MISSING',
    };
    if (!args.json) printSummary('PERF_BASELINE_CHECK', failed);
    process.stdout.write(`${JSON.stringify(failed, null, 2)}\n`);
    process.exit(1);
  }

  const perf = runPerfLite(args.perfJsonPath);
  const verdict = compareAgainstBaseline(baseline, perf);
  const checkMode = args.checkMode === 'promotion' ? 'promotion' : 'release';
  const isAdvisoryRegression = checkMode === 'release' && verdict.ok === false;
  const payload = {
    status: verdict.ok ? 'PASS' : (isAdvisoryRegression ? 'WARN' : 'FAIL'),
    mode: 'check',
    checkMode,
    baselinePath: args.baselinePath,
    fixture: baseline.fixture,
    baselineMetrics: baseline.metrics,
    currentMetrics: perf.metrics,
    deltas: verdict.deltas,
    failures: verdict.failures,
  };
  if (!args.json) {
    printSummary('PERF_BASELINE_CHECK', payload);
    console.log(`PERF_BASELINE_CHECK_MODE=${checkMode}`);
    console.log(`PERF_BASELINE_CHECK_DELTA=${JSON.stringify(payload.deltas)}`);
    if (!verdict.ok) {
      if (isAdvisoryRegression) {
        console.log('PERF_BASELINE_CHECK_WARNING=REGRESSION_ABOVE_DELTA_ADVISORY_RELEASE_MODE');
      }
      console.log(`PERF_BASELINE_CHECK_FAILURES=${JSON.stringify(payload.failures)}`);
    }
  }
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(verdict.ok || isAdvisoryRegression ? 0 : 1);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === 'update') {
    runUpdate(args);
    return;
  }
  if (args.mode === 'check') {
    runCheck(args);
    return;
  }
  const usage = {
    status: 'FAIL',
    failReason: 'USAGE',
    usage: 'node scripts/perf/perf-baseline.mjs <update|check> [--mode <release|promotion>] [--baseline <path>] [--perf-json <path>] [--json]',
  };
  process.stdout.write(`${JSON.stringify(usage, null, 2)}\n`);
  process.exit(1);
}

main();
