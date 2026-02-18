import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const TOOL_VERSION = 'perf-lite.v1';
const DEFAULT_FIXTURE_PATH = 'test/fixtures/perf/long-scene.txt';
const DEFAULT_RUNS = 9;
const TYPE_BURST_CHARS = 200;
const PAGE_CHAR_BUDGET = 2200;
const LONG_TASK_THRESHOLD_MS = 50;
const DEFAULT_THRESHOLDS = Object.freeze({
  openP95Ms: 2000,
  typeBurstP95Ms: 50,
  saveP95Ms: 1500,
  reopenP95Ms: 2000,
});

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    fixturePath: DEFAULT_FIXTURE_PATH,
    runs: DEFAULT_RUNS,
    jsonOnly: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || '').trim();
    if (arg === '--json') out.jsonOnly = true;
    if (arg === '--fixture' && i + 1 < argv.length) {
      out.fixturePath = String(argv[i + 1] || '').trim() || DEFAULT_FIXTURE_PATH;
      i += 1;
    }
    if (arg === '--runs' && i + 1 < argv.length) {
      const parsed = Number(argv[i + 1]);
      if (Number.isInteger(parsed) && parsed >= 3 && parsed <= 40) {
        out.runs = parsed;
      }
      i += 1;
    }
  }
  return out;
}

function toP95Ms(samples) {
  if (!Array.isArray(samples) || samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1));
  return Number(sorted[index].toFixed(3));
}

function roundMs(value) {
  return Number(Number(value || 0).toFixed(3));
}

function buildTypeBurstChunk() {
  const base = 'typed-token ';
  let out = '';
  while (out.length < TYPE_BURST_CHARS) {
    out += base;
  }
  return out.slice(0, TYPE_BURST_CHARS);
}

function simulateRenderProjection(text) {
  const input = String(text || '');
  const lines = input.split('\n');
  let inCodeBlock = false;
  let projectedNodes = 0;
  let projectedPages = 1;
  let pageBudget = PAGE_CHAR_BUDGET;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '```') {
      inCodeBlock = !inCodeBlock;
      projectedNodes += 1;
    } else if (inCodeBlock) {
      projectedNodes += 1;
    } else {
      projectedNodes += 1;
      if (
        line.startsWith('# ')
        || line.startsWith('## ')
        || line.startsWith('- ')
        || line.startsWith('::center::')
      ) {
        projectedNodes += 1;
      }
    }

    pageBudget -= line.length + 1;
    if (pageBudget <= 0) {
      projectedPages += 1;
      pageBudget = PAGE_CHAR_BUDGET;
    }
  }

  return {
    lineCount: lines.length,
    projectedNodes,
    projectedPages,
  };
}

function measureScenario(runs, fn) {
  const samples = [];
  for (let i = 0; i < runs; i += 1) {
    const startedAt = performance.now();
    fn(i);
    const finishedAt = performance.now();
    samples.push(roundMs(finishedAt - startedAt));
  }
  return samples;
}

function evaluateVerdict(metrics, thresholds) {
  const checks = [
    { name: 'openP95Ms', value: metrics.openP95Ms, limit: thresholds.openP95Ms },
    { name: 'typeBurstP95Ms', value: metrics.typeBurstP95Ms, limit: thresholds.typeBurstP95Ms },
    { name: 'saveP95Ms', value: metrics.saveP95Ms, limit: thresholds.saveP95Ms },
    { name: 'reopenP95Ms', value: metrics.reopenP95Ms, limit: thresholds.reopenP95Ms },
  ];

  const failed = checks
    .filter((check) => Number(check.value) > Number(check.limit))
    .map((check) => ({
      metric: check.name,
      valueMs: check.value,
      thresholdMs: check.limit,
    }));

  return {
    ok: failed.length === 0,
    failed,
  };
}

function runPerfLite({ fixturePath, runs }) {
  const fixtureAbsPath = path.resolve(process.cwd(), fixturePath);
  if (!fs.existsSync(fixtureAbsPath)) {
    throw new Error(`PERF_LITE_FIXTURE_MISSING:${fixturePath}`);
  }

  const fixtureStats = fs.statSync(fixtureAbsPath);
  const fixtureBytes = fixtureStats.size;
  if (!Number.isFinite(fixtureBytes) || fixtureBytes < 250_000) {
    throw new Error(`PERF_LITE_FIXTURE_TOO_SMALL:${fixtureBytes}`);
  }

  const typeBurstChunk = buildTypeBurstChunk();
  const tmpPath = path.join(os.tmpdir(), `perf-lite-${process.pid}.txt`);
  let activeText = '';

  try {
    const openSamples = measureScenario(runs, () => {
      activeText = fs.readFileSync(fixtureAbsPath, 'utf8').replace(/\r\n/g, '\n');
      const projection = simulateRenderProjection(activeText);
      if (projection.lineCount === 0 || projection.projectedPages === 0) {
        throw new Error('PERF_LITE_OPEN_EMPTY_PROJECTION');
      }
    });

    const typeBurstSamples = measureScenario(runs, () => {
      const cursor = Math.max(0, Math.floor(activeText.length * 0.62));
      activeText = `${activeText.slice(0, cursor)}${typeBurstChunk}${activeText.slice(cursor)}`;
      const projection = simulateRenderProjection(activeText);
      if (projection.projectedNodes <= 0) {
        throw new Error('PERF_LITE_TYPE_PROJECTION_INVALID');
      }
    });

    const saveSamples = measureScenario(runs, () => {
      fs.writeFileSync(tmpPath, activeText, 'utf8');
      const size = fs.statSync(tmpPath).size;
      if (size <= 0) {
        throw new Error('PERF_LITE_SAVE_EMPTY_FILE');
      }
    });

    const reopenSamples = measureScenario(runs, () => {
      activeText = fs.readFileSync(tmpPath, 'utf8');
      const projection = simulateRenderProjection(activeText);
      if (projection.lineCount === 0) {
        throw new Error('PERF_LITE_REOPEN_EMPTY_PROJECTION');
      }
    });

    const allSamples = [
      ...openSamples,
      ...typeBurstSamples,
      ...saveSamples,
      ...reopenSamples,
    ];

    const metrics = {
      openP95Ms: toP95Ms(openSamples),
      typeBurstP95Ms: toP95Ms(typeBurstSamples),
      saveP95Ms: toP95Ms(saveSamples),
      reopenP95Ms: toP95Ms(reopenSamples),
      longTaskCount: allSamples.filter((value) => value >= LONG_TASK_THRESHOLD_MS).length,
      runs,
    };

    const verdict = evaluateVerdict(metrics, DEFAULT_THRESHOLDS);
    return {
      toolVersion: TOOL_VERSION,
      fixturePath,
      fixtureBytes,
      runs,
      thresholdsMs: DEFAULT_THRESHOLDS,
      metrics,
      status: verdict.ok ? 'PASS' : 'FAIL',
      failedMetrics: verdict.failed,
      timestampUtc: new Date().toISOString(),
    };
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // noop: temp file is best-effort cleanup.
    }
  }
}

function printHumanSummary(result) {
  const lines = [
    `PERF_LITE_STATUS=${result.status}`,
    `PERF_LITE_FIXTURE=${result.fixturePath}`,
    `PERF_LITE_FIXTURE_BYTES=${result.fixtureBytes}`,
    `PERF_LITE_RUNS=${result.runs}`,
    `PERF_LITE_OPEN_P95_MS=${result.metrics.openP95Ms}`,
    `PERF_LITE_TYPE_BURST_P95_MS=${result.metrics.typeBurstP95Ms}`,
    `PERF_LITE_SAVE_P95_MS=${result.metrics.saveP95Ms}`,
    `PERF_LITE_REOPEN_P95_MS=${result.metrics.reopenP95Ms}`,
    `PERF_LITE_LONG_TASK_COUNT=${result.metrics.longTaskCount}`,
  ];
  lines.forEach((line) => console.log(line));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let result;
  try {
    result = runPerfLite(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failed = {
      toolVersion: TOOL_VERSION,
      fixturePath: args.fixturePath,
      runs: args.runs,
      status: 'FAIL',
      failReason: message,
      timestampUtc: new Date().toISOString(),
    };
    if (!args.jsonOnly) {
      console.log('PERF_LITE_STATUS=FAIL');
      console.log(`PERF_LITE_FAIL_REASON=${message}`);
    }
    process.stdout.write(`${JSON.stringify(failed, null, 2)}\n`);
    process.exit(1);
  }

  if (!args.jsonOnly) {
    printHumanSummary(result);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.status === 'PASS' ? 0 : 1);
}

main();
