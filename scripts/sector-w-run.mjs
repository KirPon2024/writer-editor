#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const RESULT_SCHEMA_VERSION = 'sector-w-run.v1';
const DEFAULT_ARTIFACTS_ROOT = 'artifacts/sector-w-run';

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
    'W0_WEB_SMOKE_NO_ELECTRON_RULE_EXISTS',
    'W0_WEB_SMOKE_NO_ELECTRON_TESTS_OK',
    'W0_WEB_SMOKE_NO_ELECTRON_PROOF_OK',
  ];
  const out = {};
  for (const key of keys) {
    out[key] = source.has(key) ? source.get(key) : '';
  }
  return out;
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
  const skipNpmTest = process.env.SECTOR_W_RUN_SKIP_NPM_TEST === '1';
  const fast = [
    skipNpmTest
      ? { id: 'SECTOR_W_FAST_01', cmd: process.execPath, args: ['-e', 'process.exit(0)'] }
      : { id: 'SECTOR_W_FAST_01', cmd: 'npm', args: ['test'] },
    { id: 'SECTOR_W_FAST_02', cmd: 'node', args: ['scripts/doctor.mjs'] },
    { id: 'SECTOR_W_FAST_03', cmd: 'node', args: ['scripts/guards/sector-w-web-smoke-no-electron.mjs'] },
  ];
  if (pack === 'full') return [...fast];
  return fast;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.pack !== 'fast' && args.pack !== 'full') {
    console.error('SECTOR_W_RUN_FAIL_REASON=INVALID_PACK');
    process.exit(1);
  }

  const artifactsRoot = path.resolve(process.env.SECTOR_W_ARTIFACTS_ROOT || DEFAULT_ARTIFACTS_ROOT);
  const startedAt = new Date().toISOString();
  const runId = createRunId(startedAt);
  const runDir = path.join(artifactsRoot, runId);
  const latestDir = path.join(artifactsRoot, 'latest');
  const runResultPath = path.join(runDir, 'result.json');
  const latestResultPath = path.join(latestDir, 'result.json');

  const steps = buildPackSteps(args.pack);
  const checks = [];
  let failed = false;
  let doctorTokens = {};
  for (const step of steps) {
    const stepResult = runStep(step, runDir);
    checks.push({
      checkId: stepResult.checkId,
      cmd: stepResult.cmd,
      ok: stepResult.ok,
      outPath: stepResult.outPath,
    });
    if (step.id === 'SECTOR_W_FAST_02') {
      doctorTokens = extractDoctorSubsetTokens(stepResult.stdout);
    }
    if (stepResult.ok !== 1) {
      failed = true;
      break;
    }
  }

  const finishedAt = new Date().toISOString();
  const result = {
    schemaVersion: RESULT_SCHEMA_VERSION,
    runId,
    pack: args.pack,
    ok: failed ? 0 : 1,
    startedAt,
    finishedAt,
    checks,
    doctorTokens,
    paths: {
      runDir: normalizePathForJson(runDir),
      latestResultPath: normalizePathForJson(latestResultPath),
    },
  };

  const json = `${JSON.stringify(result, null, 2)}\n`;
  writeFileAtomic(runResultPath, json);
  writeFileAtomic(latestResultPath, json);
  console.log(`SECTOR_W_RUN_PACK=${args.pack}`);
  console.log(`SECTOR_W_RUN_OK=${result.ok}`);
  console.log(`SECTOR_W_RUN_RESULT_PATH=${normalizePathForJson(latestResultPath)}`);
  process.exit(result.ok === 1 ? 0 : 1);
}

main();
