#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOOL_VERSION = 'perf-run.v1';
const DEFAULT_FIXTURE_PATH = 'scripts/perf/fixtures/mvp-hotpath.fixture.json';
const DEFAULT_THRESHOLDS_PATH = 'scripts/perf/perf-thresholds.json';

function readJson(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(text);
}

function canonicalSerialize(value) {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalSerialize(item)).join(',')}]`;
  }
  if (t === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalSerialize(value[key])}`).join(',')}}`;
  }
  return 'null';
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function p95(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(0.95 * sorted.length) - 1);
  return sorted[index];
}

function roundMs(value) {
  return Number(value.toFixed(3));
}

function parseArgs(argv) {
  const out = {
    fixturePath: DEFAULT_FIXTURE_PATH,
    thresholdsPath: DEFAULT_THRESHOLDS_PATH,
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    if (arg === '--fixture') {
      out.fixturePath = String(argv[i + 1] || '').trim() || DEFAULT_FIXTURE_PATH;
      i += 1;
    }
    if (arg === '--thresholds') {
      out.thresholdsPath = String(argv[i + 1] || '').trim() || DEFAULT_THRESHOLDS_PATH;
      i += 1;
    }
  }
  return out;
}

function parseGitHeadSha() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  if (result.status !== 0) return '';
  return String(result.stdout || '').trim();
}

function validateFixtureShape(fixture) {
  const issues = [];
  if (!fixture || typeof fixture !== 'object' || Array.isArray(fixture)) {
    return ['fixture_not_object'];
  }
  if (fixture.schemaVersion !== 'perf-fixture.v1') issues.push('fixture_schema_invalid');
  if (typeof fixture.fixtureId !== 'string' || fixture.fixtureId.trim().length === 0) issues.push('fixture_id_invalid');
  if (typeof fixture.seed !== 'string' || fixture.seed.trim().length === 0) issues.push('fixture_seed_invalid');
  if (!Number.isInteger(fixture.runs) || fixture.runs < 3 || fixture.runs > 51) issues.push('fixture_runs_invalid');
  if (!Array.isArray(fixture.coreCommands) || fixture.coreCommands.length < 1) issues.push('fixture_core_commands_invalid');
  if (!fixture.dispatchProbe || typeof fixture.dispatchProbe !== 'object') issues.push('fixture_dispatch_probe_invalid');
  if (typeof fixture.expectedStateHash !== 'string' || !/^[a-f0-9]{64}$/u.test(fixture.expectedStateHash)) {
    issues.push('fixture_expected_state_hash_invalid');
  }
  return issues;
}

function validateThresholdsShape(thresholds) {
  const issues = [];
  if (!thresholds || typeof thresholds !== 'object' || Array.isArray(thresholds)) {
    return ['thresholds_not_object'];
  }
  if (thresholds.schemaVersion !== 'perf-thresholds.v1') issues.push('thresholds_schema_invalid');
  const metrics = thresholds.metrics;
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) {
    issues.push('thresholds_metrics_invalid');
    return issues;
  }
  const keys = ['command_dispatch_p95_ms', 'open_median_ms', 'save_median_ms'];
  for (const key of keys) {
    const value = metrics[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      issues.push(`threshold_${key}_invalid`);
    }
  }
  return issues;
}

async function loadModules() {
  const cwd = process.cwd();
  const core = await import(pathToFileURL(path.join(cwd, 'src/core/runtime.mjs')).href);
  const registry = await import(pathToFileURL(path.join(cwd, 'src/renderer/commands/registry.mjs')).href);
  const runner = await import(pathToFileURL(path.join(cwd, 'src/renderer/commands/runCommand.mjs')).href);
  const project = await import(pathToFileURL(path.join(cwd, 'src/renderer/commands/projectCommands.mjs')).href);
  return { core, registry, runner, project };
}

function computeExpectedStateHash(core, fixture) {
  let current = core.createInitialCoreState();
  for (const command of fixture.coreCommands) {
    const result = core.reduceCoreState(current, command);
    if (!result || result.ok !== true) {
      return {
        ok: false,
        stateHash: '',
        reason: 'core_command_failed',
        error: result && result.error ? result.error : null,
      };
    }
    current = result.state;
  }
  return {
    ok: true,
    stateHash: core.hashCoreState(current),
    reason: '',
    error: null,
  };
}

async function buildCommandRunner(registryModule, runnerModule, projectModule) {
  const registry = registryModule.createCommandRegistry();
  projectModule.registerProjectCommands(registry, {
    electronAPI: {
      openFile: () => {},
      saveFile: () => {},
    },
  });
  const runCommand = runnerModule.createCommandRunner(registry);
  return { runCommand, commandIds: projectModule.COMMAND_IDS };
}

async function runPerfOnce(context) {
  const { fixture, runCommand, commandIds, core } = context;
  const sample = {
    openMs: 0,
    saveMs: 0,
    dispatchMs: 0,
    coreApplyMs: 0,
    stateHash: '',
    dispatchCode: '',
  };

  const openStarted = performance.now();
  const openResult = await runCommand(commandIds.PROJECT_OPEN, fixture.openPayload || {});
  sample.openMs = performance.now() - openStarted;
  if (!openResult || openResult.ok !== true) {
    throw new Error('open_command_failed');
  }

  const coreStarted = performance.now();
  const expected = computeExpectedStateHash(core, fixture);
  sample.coreApplyMs = performance.now() - coreStarted;
  if (!expected.ok) {
    throw new Error(`core_sequence_failed:${expected.reason}`);
  }
  sample.stateHash = expected.stateHash;

  const saveStarted = performance.now();
  const saveResult = await runCommand(commandIds.PROJECT_SAVE, fixture.savePayload || {});
  sample.saveMs = performance.now() - saveStarted;
  if (!saveResult || saveResult.ok !== true) {
    throw new Error('save_command_failed');
  }

  const dispatchStarted = performance.now();
  const probe = fixture.dispatchProbe || {};
  const probeResult = await runCommand(probe.commandId, probe.payload || {});
  sample.dispatchMs = performance.now() - dispatchStarted;
  sample.dispatchCode = probeResult && probeResult.error ? String(probeResult.error.code || '') : '';

  const expectedOk = Boolean(probe.expected && probe.expected.ok === true);
  if (Boolean(probeResult && probeResult.ok === true) !== expectedOk) {
    throw new Error('dispatch_probe_ok_mismatch');
  }
  if (probe.expected && typeof probe.expected.errorCode === 'string') {
    if (sample.dispatchCode !== probe.expected.errorCode) {
      throw new Error('dispatch_probe_error_code_mismatch');
    }
  }

  return sample;
}

export async function evaluatePerfRun(input = {}) {
  const fixturePath = path.resolve(String(input.fixturePath || DEFAULT_FIXTURE_PATH));
  const thresholdsPath = path.resolve(String(input.thresholdsPath || DEFAULT_THRESHOLDS_PATH));
  const commitSha = parseGitHeadSha();
  const failReasons = [];

  if (!fs.existsSync(fixturePath)) failReasons.push('fixture_missing');
  if (!fs.existsSync(thresholdsPath)) failReasons.push('thresholds_missing');
  if (failReasons.length > 0) {
    return {
      toolVersion: TOOL_VERSION,
      fixtureId: '',
      commitSha,
      runs: 0,
      metrics: {},
      thresholds: {},
      verdict: 'FAIL',
      failReasons,
      configHash: '',
    };
  }

  const fixture = readJson(fixturePath);
  const thresholds = readJson(thresholdsPath);
  const fixtureIssues = validateFixtureShape(fixture);
  const thresholdIssues = validateThresholdsShape(thresholds);
  failReasons.push(...fixtureIssues, ...thresholdIssues);

  const configHash = sha256(canonicalSerialize({
    toolVersion: TOOL_VERSION,
    fixture,
    thresholds,
  }));

  if (failReasons.length > 0) {
    return {
      toolVersion: TOOL_VERSION,
      fixtureId: String(fixture && fixture.fixtureId ? fixture.fixtureId : ''),
      commitSha,
      runs: 0,
      metrics: {},
      thresholds: thresholds && thresholds.metrics ? thresholds.metrics : {},
      verdict: 'FAIL',
      failReasons,
      configHash,
      fixtureStateHash: '',
      expectedStateHash: String(fixture && fixture.expectedStateHash ? fixture.expectedStateHash : ''),
      fixtureValid: 0,
      probeStable: 0,
      stateHashStable: 0,
    };
  }

  const { core, registry, runner, project } = await loadModules();
  const computedExpected = computeExpectedStateHash(core, fixture);
  if (!computedExpected.ok) {
    failReasons.push('fixture_core_sequence_invalid');
  } else if (computedExpected.stateHash !== fixture.expectedStateHash) {
    failReasons.push('fixture_expected_state_hash_mismatch');
  }

  const { runCommand, commandIds } = await buildCommandRunner(registry, runner, project);
  const samples = [];
  for (let index = 0; index < fixture.runs; index += 1) {
    const sample = await runPerfOnce({ fixture, runCommand, commandIds, core });
    samples.push(sample);
  }

  const openValues = samples.map((sample) => sample.openMs);
  const saveValues = samples.map((sample) => sample.saveMs);
  const dispatchValues = samples.map((sample) => sample.dispatchMs);
  const hashSet = new Set(samples.map((sample) => sample.stateHash));
  const dispatchCodeSet = new Set(samples.map((sample) => sample.dispatchCode));
  const fixtureStateHash = samples.length > 0 ? samples[0].stateHash : '';

  const metrics = {
    open_median_ms: roundMs(median(openValues)),
    save_median_ms: roundMs(median(saveValues)),
    command_dispatch_p95_ms: roundMs(p95(dispatchValues)),
    core_apply_median_ms: roundMs(median(samples.map((sample) => sample.coreApplyMs))),
  };

  const metricThresholds = thresholds.metrics;
  if (metrics.open_median_ms > metricThresholds.open_median_ms) failReasons.push('threshold_open_median_exceeded');
  if (metrics.save_median_ms > metricThresholds.save_median_ms) failReasons.push('threshold_save_median_exceeded');
  if (metrics.command_dispatch_p95_ms > metricThresholds.command_dispatch_p95_ms) {
    failReasons.push('threshold_dispatch_p95_exceeded');
  }
  if (hashSet.size !== 1) failReasons.push('state_hash_non_deterministic');
  if (dispatchCodeSet.size !== 1) failReasons.push('dispatch_code_non_deterministic');

  return {
    toolVersion: TOOL_VERSION,
    fixtureId: fixture.fixtureId,
    commitSha,
    runs: fixture.runs,
    metrics,
    thresholds: metricThresholds,
    verdict: failReasons.length === 0 ? 'PASS' : 'FAIL',
    failReasons,
    configHash,
    fixturePath,
    thresholdsPath,
    fixtureStateHash,
    expectedStateHash: fixture.expectedStateHash,
    fixtureValid: computedExpected.ok && computedExpected.stateHash === fixture.expectedStateHash ? 1 : 0,
    probeStable: dispatchCodeSet.size === 1 ? 1 : 0,
    stateHashStable: hashSet.size === 1 ? 1 : 0,
  };
}

function printTokens(result) {
  console.log(`PERF_RUN_TOOL_VERSION=${result.toolVersion}`);
  console.log(`PERF_RUN_FIXTURE_ID=${result.fixtureId}`);
  console.log(`PERF_RUN_COMMIT_SHA=${result.commitSha}`);
  console.log(`PERF_RUN_RUNS=${result.runs}`);
  console.log(`PERF_RUN_CONFIG_HASH=${result.configHash}`);
  console.log(`PERF_RUN_VERDICT=${result.verdict}`);
  console.log(`PERF_FIXTURE_VALID=${result.fixtureValid}`);
  console.log(`PERF_STATE_HASH_STABLE=${result.stateHashStable}`);
  console.log(`PERF_PROBE_STABLE=${result.probeStable}`);
  if (result.metrics && typeof result.metrics === 'object') {
    console.log(`PERF_OPEN_MEDIAN_MS=${result.metrics.open_median_ms}`);
    console.log(`PERF_SAVE_MEDIAN_MS=${result.metrics.save_median_ms}`);
    console.log(`PERF_COMMAND_DISPATCH_P95_MS=${result.metrics.command_dispatch_p95_ms}`);
  }
  console.log(`PERF_FAIL_REASONS=${JSON.stringify(result.failReasons || [])}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await evaluatePerfRun({
    fixturePath: args.fixturePath,
    thresholdsPath: args.thresholdsPath,
  });
  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    printTokens(result);
  }
  process.exit(result.verdict === 'PASS' ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
