#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const RESULT_SCHEMA_VERSION = 'sector-u-run.v1';
const DEFAULT_ARTIFACTS_ROOT = 'artifacts/sector-u-run';
const DEFAULT_U_STATUS_PATH = 'docs/OPS/STATUS/SECTOR_U.json';
const PACKAGE_JSON_PATH = 'package.json';

function parseArgs(argv) {
  const args = { pack: 'fast' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--pack') {
      args.pack = String(argv[i + 1] || '').toLowerCase();
      i += 1;
    }
  }
  return args;
}

function createRunId(nowIso) {
  const base = String(nowIso || new Date().toISOString()).replace(/[:.]/g, '-');
  return `${base}-${process.pid}`;
}

function normalizePathForJson(filePath) {
  return String(filePath).replaceAll('\\', '/');
}

function writeFileAtomic(targetPath, content) {
  const directory = path.dirname(targetPath);
  fs.mkdirSync(directory, { recursive: true });
  const tmpPath = `${targetPath}.tmp`;
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, targetPath);
}

function writeRunOutput(runDir, stepId, stdout, stderr) {
  const checksDir = path.join(runDir, 'checks');
  const outPath = path.join(checksDir, `${stepId}.log`);
  const body = `# STDOUT\n${String(stdout || '')}\n# STDERR\n${String(stderr || '')}\n`;
  writeFileAtomic(outPath, body);
  return outPath;
}

function parseKvTokens(text) {
  const tokens = new Map();
  const lines = String(text || '').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx);
    const value = line.slice(idx + 1);
    if (!tokens.has(key)) tokens.set(key, value);
  }
  return tokens;
}

function extractDoctorSubsetTokens(stdout) {
  const source = parseKvTokens(stdout);
  const keys = [
    'SECTOR_U_STATUS_OK',
    'SECTOR_U_PHASE',
    'SECTOR_U_BASELINE_SHA',
    'SECTOR_U_GO_TAG',
    'SECTOR_U_NO_RUNTIME_PRODUCT_WAIVERS_OK',
    'SECTOR_U_FAST_DURATION_MS',
    'SECTOR_U_FAST_DURATION_OK',
    'U1_COMMAND_REGISTRY_EXISTS',
    'U1_COMMANDS_OPEN_SAVE_EXIST',
    'U1_COMMAND_EXPORT_DOCXMIN_EXISTS',
    'U1_COMMANDS_TESTS_OK',
    'U1_COMMANDS_PROOF_OK',
  ];
  const out = {};
  for (const key of keys) {
    out[key] = source.has(key) ? source.get(key) : '';
  }
  return out;
}

function safeReadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readSectorUConfig() {
  const parsed = safeReadJson(DEFAULT_U_STATUS_PATH);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { fastMaxDurationMs: 120000 };
  }

  return {
    fastMaxDurationMs: Number.isInteger(parsed.fastMaxDurationMs) && parsed.fastMaxDurationMs > 0
      ? parsed.fastMaxDurationMs
      : 120000,
  };
}

function ensureTestSectorUScriptExists() {
  const parsed = safeReadJson(PACKAGE_JSON_PATH);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  const scripts = parsed.scripts;
  return !!(scripts && typeof scripts === 'object' && typeof scripts['test:sector-u'] === 'string' && scripts['test:sector-u'].trim().length > 0);
}

function runStep(step, runDir, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  const result = spawnSync(step.cmd, step.args, {
    encoding: 'utf8',
    env,
  });
  const outPath = writeRunOutput(runDir, step.id, result.stdout, result.stderr);
  return {
    checkId: step.id,
    cmd: [step.cmd, ...step.args].join(' '),
    status: typeof result.status === 'number' ? result.status : 1,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
    ok: typeof result.status === 'number' && result.status === 0 ? 1 : 0,
    outPath: normalizePathForJson(outPath),
  };
}

function buildPackSteps(pack) {
  const skipNpmTest = process.env.SECTOR_U_RUN_SKIP_NPM_TEST === '1';
  const fast = [
    skipNpmTest
      ? { id: 'SECTOR_U_FAST_01', cmd: process.execPath, args: ['-e', 'process.exit(0)'] }
      : { id: 'SECTOR_U_FAST_01', cmd: 'npm', args: ['run', 'test:sector-u'] },
    { id: 'CHECK_U1_COMMAND_LAYER', cmd: process.execPath, args: ['--test', 'test/unit/sector-u-u1-command-layer.test.js'] },
    { id: 'SECTOR_U_FAST_02', cmd: 'node', args: ['scripts/doctor.mjs'] },
  ];
  if (pack === 'full') return [...fast];
  return fast;
}

function makeErrorResult({
  runId,
  pack,
  startedAt,
  finishedAt,
  runDir,
  latestResultPath,
  reason,
  limitMs,
}) {
  const startedMs = Date.parse(startedAt);
  const finishedMs = Date.parse(finishedAt);
  const fastDurationMs = Number.isFinite(startedMs) && Number.isFinite(finishedMs) && finishedMs >= startedMs
    ? Math.round(finishedMs - startedMs)
    : -1;
  return {
    schemaVersion: RESULT_SCHEMA_VERSION,
    runId,
    pack,
    ok: 0,
    failReason: reason,
    startedAt,
    finishedAt,
    checks: [],
    doctorTokens: {},
    metrics: {
      fastDurationMs,
      fastDurationLimitMs: limitMs,
      fastDurationOk: 0,
    },
    paths: {
      runDir: normalizePathForJson(runDir),
      latestResultPath: normalizePathForJson(latestResultPath),
    },
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.pack !== 'fast' && args.pack !== 'full') {
    console.error('SECTOR_U_RUN_FAIL_REASON=INVALID_PACK');
    process.exit(1);
  }

  const artifactsRoot = path.resolve(process.env.SECTOR_U_ARTIFACTS_ROOT || DEFAULT_ARTIFACTS_ROOT);
  const startedAt = new Date().toISOString();
  const runId = createRunId(startedAt);
  const runDir = path.join(artifactsRoot, runId);
  const latestDir = path.join(artifactsRoot, 'latest');
  const runResultPath = path.join(runDir, 'result.json');
  const latestResultPath = path.join(latestDir, 'result.json');
  const config = readSectorUConfig();

  if (!ensureTestSectorUScriptExists()) {
    const finishedAt = new Date().toISOString();
    const result = makeErrorResult({
      runId,
      pack: args.pack,
      startedAt,
      finishedAt,
      runDir,
      latestResultPath,
      reason: 'MISSING_TEST_SECTOR_U_SCRIPT',
      limitMs: config.fastMaxDurationMs,
    });
    const json = `${JSON.stringify(result, null, 2)}\n`;
    writeFileAtomic(runResultPath, json);
    writeFileAtomic(latestResultPath, json);
    console.log(`SECTOR_U_RUN_PACK=${args.pack}`);
    console.log('SECTOR_U_RUN_FAIL_REASON=MISSING_TEST_SECTOR_U_SCRIPT');
    console.log('SECTOR_U_RUN_OK=0');
    console.log(`SECTOR_U_RUN_RESULT_PATH=${normalizePathForJson(latestResultPath)}`);
    process.exit(1);
  }

  const steps = buildPackSteps(args.pack);
  const checks = [];
  let failed = false;
  let doctorTokens = {};
  for (const step of steps) {
    const nowMs = Date.now();
    const startedMs = Date.parse(startedAt);
    const durationSoFar = Number.isFinite(startedMs) && nowMs >= startedMs
      ? Math.round(nowMs - startedMs)
      : -1;
    const extraEnv = step.id === 'SECTOR_U_FAST_02' && durationSoFar >= 0
      ? { SECTOR_U_FAST_DURATION_MS: String(durationSoFar) }
      : {};
    const stepResult = runStep(step, runDir, extraEnv);
    checks.push({
      checkId: stepResult.checkId,
      cmd: stepResult.cmd,
      ok: stepResult.ok,
      outPath: stepResult.outPath,
    });
    if (step.id === 'SECTOR_U_FAST_02') {
      doctorTokens = extractDoctorSubsetTokens(stepResult.stdout);
    }
    if (stepResult.ok !== 1) {
      failed = true;
      break;
    }
  }

  const finishedAt = new Date().toISOString();
  const startedMs = Date.parse(startedAt);
  const finishedMs = Date.parse(finishedAt);
  const fastDurationMs = Number.isFinite(startedMs) && Number.isFinite(finishedMs) && finishedMs >= startedMs
    ? Math.round(finishedMs - startedMs)
    : -1;
  const fastDurationOk = fastDurationMs >= 0 && fastDurationMs <= config.fastMaxDurationMs ? 1 : 0;

  const doctorStatusOk = doctorTokens.SECTOR_U_STATUS_OK === '1' ? 1 : 0;
  const doctorWaiverOk = doctorTokens.SECTOR_U_NO_RUNTIME_PRODUCT_WAIVERS_OK === '1' ? 1 : 0;
  const phase = typeof doctorTokens.SECTOR_U_PHASE === 'string' ? doctorTokens.SECTOR_U_PHASE : '';
  const needsU1Proof = phase !== '' && phase !== 'U0';
  const doctorU1ProofOk = doctorTokens.U1_COMMANDS_PROOF_OK === '1' ? 1 : 0;
  const resultOk = failed ? 0 : (
    doctorStatusOk === 1
    && doctorWaiverOk === 1
    && fastDurationOk === 1
    && (!needsU1Proof || doctorU1ProofOk === 1)
      ? 1
      : 0
  );

  const result = {
    schemaVersion: RESULT_SCHEMA_VERSION,
    runId,
    pack: args.pack,
    ok: resultOk,
    startedAt,
    finishedAt,
    checks,
    doctorTokens,
    metrics: {
      fastDurationMs,
      fastDurationLimitMs: config.fastMaxDurationMs,
      fastDurationOk,
    },
    paths: {
      runDir: normalizePathForJson(runDir),
      latestResultPath: normalizePathForJson(latestResultPath),
    },
  };

  const json = `${JSON.stringify(result, null, 2)}\n`;
  writeFileAtomic(runResultPath, json);
  writeFileAtomic(latestResultPath, json);
  console.log(`SECTOR_U_RUN_PACK=${args.pack}`);
  console.log(`SECTOR_U_RUN_OK=${result.ok}`);
  console.log(`SECTOR_U_RUN_RESULT_PATH=${normalizePathForJson(latestResultPath)}`);
  process.exit(result.ok === 1 ? 0 : 1);
}

main();
