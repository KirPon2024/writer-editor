#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const RESULT_SCHEMA_VERSION = 'sector-u-run.v1';
const DEFAULT_ARTIFACTS_ROOT = 'artifacts/sector-u-run';
const DEFAULT_SECTOR_U_STATUS_PATH = 'docs/OPS/STATUS/SECTOR_U.json';

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

function createRunId(startedAtIso) {
  const base = String(startedAtIso || new Date().toISOString()).replace(/[:.]/g, '-');
  return `${base}-${process.pid}`;
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
    'U2_RULE_EXISTS',
    'U2_TESTS_OK',
    'U2_PROOF_OK',
    'U2_MODE',
    'U2_TTL_EXPIRED',
    'U2_FINDINGS_TOTAL',
    'U2_FALSE_POSITIVE_RATE',
    'U2_PR_COUNT',
    'U3_EXPORT_WIRING_EXISTS',
    'U3_EXPORT_TESTS_OK',
    'U3_EXPORT_PROOF_OK',
    'U4_TRANSITIONS_SOT_EXISTS',
    'U4_TRANSITIONS_GUARD_OK',
    'U4_NO_SIDE_EFFECTS_RULE_EXISTS',
    'U4_TESTS_OK',
    'U4_PROOF_OK',
    'U5_ERROR_MAP_SOT_EXISTS',
    'U5_ERROR_MAP_SCHEMA_OK',
    'U5_COMMAND_ERROR_SHAPE_OK',
    'U5_TESTS_OK',
    'U5_PROOF_OK',
    'U6_A11Y_BASELINE_EXISTS',
    'U6_A11Y_TESTS_OK',
    'U6_A11Y_PROOF_OK',
  ];
  const out = {};
  for (const key of keys) {
    out[key] = source.has(key) ? source.get(key) : '';
  }
  return out;
}

function readSectorUPhase() {
  if (!fs.existsSync(DEFAULT_SECTOR_U_STATUS_PATH)) return 'U0';
  try {
    const parsed = JSON.parse(fs.readFileSync(DEFAULT_SECTOR_U_STATUS_PATH, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 'U0';
    return typeof parsed.phase === 'string' && parsed.phase.length > 0 ? parsed.phase : 'U0';
  } catch {
    return 'U0';
  }
}

function runStep(step, runDir, startedAtMs) {
  const elapsedMs = Math.max(0, Date.now() - startedAtMs);
  const env = {
    ...process.env,
    ...step.env,
    SECTOR_U_FAST_DURATION_MS: String(elapsedMs),
  };
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

function readSectorUFastMaxDurationMs() {
  if (!fs.existsSync(DEFAULT_SECTOR_U_STATUS_PATH)) return 120000;
  try {
    const parsed = JSON.parse(fs.readFileSync(DEFAULT_SECTOR_U_STATUS_PATH, 'utf8'));
    const value = Number(parsed && parsed.fastMaxDurationMs);
    if (!Number.isInteger(value) || value <= 0) return 120000;
    return value;
  } catch {
    return 120000;
  }
}

function hasNpmScript(scriptName) {
  try {
    const parsed = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const scripts = parsed && typeof parsed === 'object' ? parsed.scripts : null;
    return !!(scripts && typeof scripts === 'object' && typeof scripts[scriptName] === 'string' && scripts[scriptName].trim().length > 0);
  } catch {
    return false;
  }
}

function buildFastSteps() {
  const skipTest = process.env.SECTOR_U_RUN_SKIP_TEST === '1';
  const phase = readSectorUPhase();
  const steps = [
    skipTest
      ? { id: 'SECTOR_U_FAST_01', cmd: process.execPath, args: ['-e', 'process.exit(0)'] }
      : { id: 'SECTOR_U_FAST_01', cmd: 'npm', args: ['run', 'test:sector-u'] },
  ];
  if (phase !== 'U0') {
    steps.push({
      id: 'CHECK_U1_COMMAND_LAYER',
      cmd: process.execPath,
      args: ['--test', 'test/unit/sector-u-u1-command-layer.test.js'],
    });
  }
  if (phase !== 'U0' && phase !== 'U1') {
    steps.push({
      id: 'CHECK_U2_UI_NO_PLATFORM_DIRECT',
      cmd: process.execPath,
      args: ['scripts/guards/sector-u-ui-no-platform-direct.mjs'],
    });
  }
  if (phase !== 'U0' && phase !== 'U1' && phase !== 'U2') {
    steps.push({
      id: 'CHECK_U3_EXPORT_WIRING',
      cmd: process.execPath,
      args: ['--test', 'test/unit/sector-u-u3-*.test.js'],
    });
  }
  if (phase !== 'U0' && phase !== 'U1' && phase !== 'U2' && phase !== 'U3') {
    steps.push({
      id: 'CHECK_U4_UI_TRANSITIONS',
      cmd: process.execPath,
      args: ['scripts/guards/sector-u-ui-state-transitions.mjs', '--mode', 'BLOCKING'],
    });
    steps.push({
      id: 'CHECK_U4_UI_NO_SIDE_EFFECTS',
      cmd: process.execPath,
      args: ['scripts/guards/sector-u-ui-no-side-effects.mjs', '--mode', 'DETECT_ONLY'],
    });
    steps.push({
      id: 'CHECK_U4_UI_TESTS',
      cmd: process.execPath,
      args: ['--test', 'test/unit/sector-u-u4-*.test.js'],
    });
  }
  if (phase !== 'U0' && phase !== 'U1' && phase !== 'U2' && phase !== 'U3' && phase !== 'U4') {
    steps.push({
      id: 'CHECK_U5_UI_ERROR_MAPPING',
      cmd: process.execPath,
      args: ['--test', 'test/unit/sector-u-u5-*.test.js'],
    });
  }
  steps.push({ id: 'SECTOR_U_FAST_02', cmd: 'node', args: ['scripts/doctor.mjs'] });
  return steps;
}

function buildPackSteps(pack) {
  const fast = buildFastSteps();
  if (pack === 'full') {
    const phase = readSectorUPhase();
    const out = [...fast];
    if (phase !== 'U0' && phase !== 'U1' && phase !== 'U2' && phase !== 'U3' && phase !== 'U4' && phase !== 'U5') {
      out.push({
        id: 'CHECK_U6_A11Y_BASELINE',
        cmd: process.execPath,
        args: ['--test', 'test/unit/sector-u-u6-*.test.js'],
        env: {
          SECTOR_U_FULL_A11Y: '1',
        },
      });
    }
    out.push({ id: 'SECTOR_U_FULL_01', cmd: 'npm', args: ['run', 'test:sector-u-full'] });
    return out;
  }
  return fast;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.pack !== 'fast' && args.pack !== 'full') {
    console.log('SECTOR_U_RUN_FAIL_REASON=INVALID_PACK');
    process.exit(1);
  }

  if (!hasNpmScript('test:sector-u')) {
    console.log('SECTOR_U_RUN_FAIL_REASON=MISSING_TEST_SECTOR_U_SCRIPT');
    console.log('SECTOR_U_RUN_OK=0');
    process.exit(1);
  }

  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();
  const artifactsRoot = path.resolve(process.env.SECTOR_U_ARTIFACTS_ROOT || DEFAULT_ARTIFACTS_ROOT);
  const runId = createRunId(startedAt);
  const runDir = path.join(artifactsRoot, runId);
  const latestDir = path.join(artifactsRoot, 'latest');
  const runResultPath = path.join(runDir, 'result.json');
  const latestResultPath = path.join(latestDir, 'result.json');

  const steps = buildPackSteps(args.pack);
  const checks = [];
  let failed = false;
  let failReason = '';
  let doctorTokens = {};

  for (const step of steps) {
    const stepResult = runStep(step, runDir, startedAtMs);
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
      failReason = step.id === 'SECTOR_U_FAST_01' ? 'TEST_FAIL' : 'CHECK_PACK_FAIL';
      break;
    }
  }

  const durationMs = Math.max(0, Date.now() - startedAtMs);
  const maxDurationMs = readSectorUFastMaxDurationMs();
  const fastDurationOk = durationMs <= maxDurationMs ? 1 : 0;
  if (args.pack === 'fast' && fastDurationOk !== 1) {
    failed = true;
    failReason = 'FAST_DURATION_EXCEEDED';
  }

  const phase = typeof doctorTokens.SECTOR_U_PHASE === 'string' ? doctorTokens.SECTOR_U_PHASE : '';
  const doctorStatusOk = doctorTokens.SECTOR_U_STATUS_OK === '1' ? 1 : 0;
  const doctorWaiverOk = doctorTokens.SECTOR_U_NO_RUNTIME_PRODUCT_WAIVERS_OK === '1' ? 1 : 0;
  const doctorU1ProofOk = doctorTokens.U1_COMMANDS_PROOF_OK === '1' ? 1 : 0;
  const doctorU2ProofOk = doctorTokens.U2_PROOF_OK === '1' ? 1 : 0;
  const doctorU2TtlExpired = doctorTokens.U2_TTL_EXPIRED === '1' ? 1 : 0;
  const doctorU3ProofOk = doctorTokens.U3_EXPORT_PROOF_OK === '1' ? 1 : 0;
  const doctorU4ProofOk = doctorTokens.U4_PROOF_OK === '1' ? 1 : 0;
  const doctorU5ProofOk = doctorTokens.U5_PROOF_OK === '1' ? 1 : 0;
  const needsU1Proof = phase !== '' && phase !== 'U0';
  const needsU2Proof = phase !== '' && phase !== 'U0' && phase !== 'U1';
  const needsU3Proof = phase !== '' && phase !== 'U0' && phase !== 'U1' && phase !== 'U2';
  const needsU4Proof = phase !== '' && phase !== 'U0' && phase !== 'U1' && phase !== 'U2' && phase !== 'U3';
  const needsU5Proof = phase !== '' && phase !== 'U0' && phase !== 'U1' && phase !== 'U2' && phase !== 'U3' && phase !== 'U4';
  if (!failed) {
    if (doctorStatusOk !== 1 || doctorWaiverOk !== 1) {
      failed = true;
      failReason = 'DOCTOR_FAIL';
    } else if (needsU1Proof && doctorU1ProofOk !== 1) {
      failed = true;
      failReason = 'CHECK_PACK_FAIL';
    } else if (needsU2Proof && doctorU2ProofOk !== 1) {
      failed = true;
      failReason = 'CHECK_PACK_FAIL';
    } else if (needsU2Proof && doctorU2TtlExpired === 1) {
      failed = true;
      failReason = 'U2_TTL_EXPIRED';
    } else if (needsU3Proof && doctorU3ProofOk !== 1) {
      failed = true;
      failReason = 'CHECK_PACK_FAIL';
    } else if (needsU4Proof && doctorU4ProofOk !== 1) {
      failed = true;
      failReason = 'CHECK_PACK_FAIL';
    } else if (needsU5Proof && doctorU5ProofOk !== 1) {
      failed = true;
      failReason = 'CHECK_PACK_FAIL';
    }
  }

  const finishedAt = new Date().toISOString();
  const result = {
    schemaVersion: RESULT_SCHEMA_VERSION,
    runId,
    pack: args.pack,
    ok: failed ? 0 : 1,
    failReason,
    startedAt,
    finishedAt,
    durationMs,
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

  console.log(`SECTOR_U_RUN_PACK=${args.pack}`);
  console.log(`SECTOR_U_RUN_OK=${result.ok}`);
  if (failReason) console.log(`SECTOR_U_RUN_FAIL_REASON=${failReason}`);
  console.log(`SECTOR_U_FAST_DURATION_MS=${durationMs}`);
  console.log(`SECTOR_U_FAST_MAX_DURATION_MS=${maxDurationMs}`);
  console.log(`SECTOR_U_FAST_DURATION_OK=${fastDurationOk}`);
  console.log(`SECTOR_U_RUN_RESULT_PATH=${normalizePathForJson(latestResultPath)}`);

  process.exit(result.ok === 1 ? 0 : 1);
}

main();
