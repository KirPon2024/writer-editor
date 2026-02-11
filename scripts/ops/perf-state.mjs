#!/usr/bin/env node
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TOOL_VERSION = 'perf-state.v1';

function parseArgs(argv) {
  const out = {
    json: false,
    fixturePath: '',
    thresholdsPath: '',
    policyPath: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    else if (arg === '--fixture') {
      out.fixturePath = String(argv[i + 1] || '').trim();
      i += 1;
    } else if (arg === '--thresholds') {
      out.thresholdsPath = String(argv[i + 1] || '').trim();
      i += 1;
    } else if (arg === '--policy') {
      out.policyPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }
  return out;
}

function runJsonScript(scriptPath, args = []) {
  const result = spawnSync(process.execPath, [scriptPath, '--json', ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
  });
  const stdout = String(result.stdout || '');
  let parsed = null;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    parsed = null;
  }
  return {
    status: typeof result.status === 'number' ? result.status : 1,
    parsed,
    stdout,
    stderr: String(result.stderr || ''),
  };
}

function isThresholdFailure(reason) {
  return typeof reason === 'string' && reason.startsWith('threshold_');
}

function normalizeFailReasons(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .sort();
}

export function evaluatePerfState(input = {}) {
  const fixturePath = input.fixturePath ? path.resolve(input.fixturePath) : '';
  const thresholdsPath = input.thresholdsPath ? path.resolve(input.thresholdsPath) : '';
  const policyPath = input.policyPath ? path.resolve(input.policyPath) : '';

  const state = {
    TOOL_VERSION,
    HOTPATH_POLICY_OK: 0,
    PERF_FIXTURE_OK: 0,
    PERF_RUNNER_DETERMINISTIC_OK: 0,
    PERF_THRESHOLD_OK: 0,
    PERF_BASELINE_OK: 0,
    failReason: '',
    failingProofs: [],
    fixturePath,
    thresholdsPath,
    policyPath,
    perfRunConfigHash: '',
    perfRunVerdict: '',
    perfRunCommitSha: '',
    metrics: {},
    thresholds: {},
  };

  const policyArgs = policyPath ? ['--policy', policyPath] : [];
  const hotpath = runJsonScript('scripts/ops/hotpath-policy-state.mjs', policyArgs);
  if (!hotpath.parsed) {
    state.failReason = 'PERF_HOTPATH_POLICY_EXEC_FAILED';
    state.failingProofs.push({ token: 'HOTPATH_POLICY_OK', reason: 'hotpath_policy_json_invalid' });
    return state;
  }
  state.HOTPATH_POLICY_OK = Number(hotpath.parsed.HOTPATH_POLICY_OK) === 1 ? 1 : 0;
  if (state.HOTPATH_POLICY_OK !== 1) {
    state.failingProofs.push({
      token: 'HOTPATH_POLICY_OK',
      reason: String(hotpath.parsed.failReason || 'hotpath_policy_failed'),
    });
  }

  const perfArgs = [];
  if (fixturePath) perfArgs.push('--fixture', fixturePath);
  if (thresholdsPath) perfArgs.push('--thresholds', thresholdsPath);

  const runA = runJsonScript('scripts/ops/perf-run.mjs', perfArgs);
  const runB = runJsonScript('scripts/ops/perf-run.mjs', perfArgs);

  if (!runA.parsed || !runB.parsed) {
    state.failReason = 'PERF_RUNNER_EXEC_FAILED';
    if (!runA.parsed) state.failingProofs.push({ token: 'PERF_FIXTURE_OK', reason: 'perf_run_a_json_invalid' });
    if (!runB.parsed) state.failingProofs.push({ token: 'PERF_RUNNER_DETERMINISTIC_OK', reason: 'perf_run_b_json_invalid' });
    return state;
  }

  const fixtureValid = Number(runA.parsed.fixtureValid) === 1;
  const fixtureId = typeof runA.parsed.fixtureId === 'string' && runA.parsed.fixtureId.trim().length > 0;
  state.PERF_FIXTURE_OK = fixtureValid && fixtureId ? 1 : 0;
  if (state.PERF_FIXTURE_OK !== 1) {
    state.failingProofs.push({
      token: 'PERF_FIXTURE_OK',
      reason: 'fixture_invalid',
    });
  }

  const failReasonsA = normalizeFailReasons(runA.parsed.failReasons);
  const failReasonsB = normalizeFailReasons(runB.parsed.failReasons);
  const deterministic = runA.parsed.verdict === runB.parsed.verdict
    && runA.parsed.configHash === runB.parsed.configHash
    && runA.parsed.fixtureStateHash === runB.parsed.fixtureStateHash
    && runA.parsed.expectedStateHash === runB.parsed.expectedStateHash
    && runA.parsed.fixtureId === runB.parsed.fixtureId
    && Number(runA.parsed.probeStable) === 1
    && Number(runB.parsed.probeStable) === 1
    && Number(runA.parsed.stateHashStable) === 1
    && Number(runB.parsed.stateHashStable) === 1
    && JSON.stringify(failReasonsA) === JSON.stringify(failReasonsB);
  state.PERF_RUNNER_DETERMINISTIC_OK = deterministic ? 1 : 0;
  if (state.PERF_RUNNER_DETERMINISTIC_OK !== 1) {
    state.failingProofs.push({
      token: 'PERF_RUNNER_DETERMINISTIC_OK',
      reason: 'perf_runner_non_deterministic',
    });
  }

  const thresholdFailReasons = failReasonsA.filter((reason) => isThresholdFailure(reason));
  const thresholdOk = runA.parsed.verdict === 'PASS' && thresholdFailReasons.length === 0;
  state.PERF_THRESHOLD_OK = thresholdOk ? 1 : 0;
  if (state.PERF_THRESHOLD_OK !== 1) {
    state.failingProofs.push({
      token: 'PERF_THRESHOLD_OK',
      reason: thresholdFailReasons.length > 0 ? thresholdFailReasons.join(',') : 'threshold_verdict_fail',
    });
  }

  state.perfRunConfigHash = typeof runA.parsed.configHash === 'string' ? runA.parsed.configHash : '';
  state.perfRunVerdict = typeof runA.parsed.verdict === 'string' ? runA.parsed.verdict : '';
  state.perfRunCommitSha = typeof runA.parsed.commitSha === 'string' ? runA.parsed.commitSha : '';
  state.metrics = runA.parsed.metrics && typeof runA.parsed.metrics === 'object' ? runA.parsed.metrics : {};
  state.thresholds = runA.parsed.thresholds && typeof runA.parsed.thresholds === 'object' ? runA.parsed.thresholds : {};

  state.PERF_BASELINE_OK = state.HOTPATH_POLICY_OK === 1
    && state.PERF_FIXTURE_OK === 1
    && state.PERF_RUNNER_DETERMINISTIC_OK === 1
    && state.PERF_THRESHOLD_OK === 1
    ? 1
    : 0;
  if (state.PERF_BASELINE_OK !== 1) {
    state.failReason = 'PERF_BASELINE_PROOF_FAILED';
  }

  return state;
}

function printTokens(state) {
  console.log(`PERF_STATE_TOOL_VERSION=${state.TOOL_VERSION}`);
  console.log(`HOTPATH_POLICY_OK=${state.HOTPATH_POLICY_OK}`);
  console.log(`PERF_FIXTURE_OK=${state.PERF_FIXTURE_OK}`);
  console.log(`PERF_RUNNER_DETERMINISTIC_OK=${state.PERF_RUNNER_DETERMINISTIC_OK}`);
  console.log(`PERF_THRESHOLD_OK=${state.PERF_THRESHOLD_OK}`);
  console.log(`PERF_BASELINE_OK=${state.PERF_BASELINE_OK}`);
  console.log(`PERF_STATE_FIXTURE_PATH=${state.fixturePath}`);
  console.log(`PERF_STATE_THRESHOLDS_PATH=${state.thresholdsPath}`);
  console.log(`PERF_STATE_POLICY_PATH=${state.policyPath}`);
  console.log(`PERF_STATE_RUN_CONFIG_HASH=${state.perfRunConfigHash}`);
  console.log(`PERF_STATE_RUN_VERDICT=${state.perfRunVerdict}`);
  console.log(`PERF_STATE_RUN_COMMIT_SHA=${state.perfRunCommitSha}`);
  console.log(`PERF_STATE_FAILING_PROOFS=${JSON.stringify(state.failingProofs)}`);
  if (state.failReason) {
    console.log(`FAIL_REASON=${state.failReason}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluatePerfState({
    fixturePath: args.fixturePath,
    thresholdsPath: args.thresholdsPath,
    policyPath: args.policyPath,
  });
  if (args.json) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  } else {
    printTokens(state);
  }
  process.exit(state.PERF_BASELINE_OK === 1 ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
