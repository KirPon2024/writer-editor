#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const RESULT_SCHEMA_VERSION = 'sector-m-run.v1';
const DEFAULT_ARTIFACTS_ROOT = 'artifacts/sector-m-run';
const SECTOR_M_STATUS_PATH = 'docs/OPS/STATUS/SECTOR_M.json';
const SECTOR_M_CHECKS_PATH = 'docs/OPS/STATUS/SECTOR_M_CHECKS.md';
const DOCTOR_PATH = 'scripts/doctor.mjs';

const M0_ALLOWLIST = new Set([
  'docs/OPS/STATUS/SECTOR_M.json',
  'docs/OPS/STATUS/SECTOR_M_CHECKS.md',
  'scripts/sector-m-run.mjs',
  'scripts/doctor.mjs',
  'package.json',
  'test/unit/sector-m-status-schema.test.js',
  'test/unit/sector-m-doctor-tokens.test.js',
  'test/unit/sector-m-runner-artifact.test.js',
  'test/unit/sector-m-no-scope-leak.test.js',
  'test/fixtures/sector-m/expected-result.json',
]);

function parseArgs(argv) {
  const out = { pack: 'fast' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--pack') {
      out.pack = String(argv[i + 1] || '').toLowerCase();
      i += 1;
    }
  }
  return out;
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

function createRunId(startedAtIso) {
  const base = String(startedAtIso).replace(/[:.]/g, '-');
  return `${base}-${process.pid}`;
}

function parseKvTokens(text) {
  const tokens = new Map();
  for (const lineRaw of String(text || '').split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx);
    const value = line.slice(idx + 1);
    if (!tokens.has(key)) tokens.set(key, value);
  }
  return tokens;
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

function validateSectorMSoT() {
  if (!fs.existsSync(SECTOR_M_STATUS_PATH)) {
    return { ok: 0, reason: 'SOT_MISSING_OR_INVALID', details: 'SECTOR_M.json is missing' };
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(SECTOR_M_STATUS_PATH, 'utf8'));
  } catch {
    return { ok: 0, reason: 'SOT_MISSING_OR_INVALID', details: 'SECTOR_M.json is not valid JSON' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: 0, reason: 'SOT_MISSING_OR_INVALID', details: 'SECTOR_M.json top-level must be object' };
  }

  const required = ['schemaVersion', 'status', 'phase', 'goTag', 'baselineSha'];
  for (const key of required) {
    if (!(key in parsed)) {
      return { ok: 0, reason: 'SOT_MISSING_OR_INVALID', details: `SECTOR_M.json missing field: ${key}` };
    }
  }

  const statusAllowed = new Set(['NOT_STARTED', 'IN_PROGRESS', 'DONE']);
  if (parsed.schemaVersion !== 'sector-m-status.v1') {
    return { ok: 0, reason: 'SOT_MISSING_OR_INVALID', details: 'schemaVersion must be sector-m-status.v1' };
  }
  if (!statusAllowed.has(parsed.status)) {
    return { ok: 0, reason: 'SOT_MISSING_OR_INVALID', details: 'status must be NOT_STARTED|IN_PROGRESS|DONE' };
  }
  if (parsed.phase !== 'M0') {
    return { ok: 0, reason: 'SOT_MISSING_OR_INVALID', details: 'phase must be M0' };
  }
  if (parsed.goTag !== '') {
    return { ok: 0, reason: 'SOT_MISSING_OR_INVALID', details: 'goTag must be empty string for M0' };
  }
  if (!/^[0-9a-f]{7,}$/i.test(String(parsed.baselineSha || ''))) {
    return { ok: 0, reason: 'SOT_MISSING_OR_INVALID', details: 'baselineSha must be a git sha' };
  }
  return { ok: 1, reason: '', details: 'SECTOR_M.json schema is valid for M0' };
}

function validateChecksDoc() {
  if (!fs.existsSync(SECTOR_M_CHECKS_PATH)) {
    return { ok: 0, reason: 'SOT_MISSING_OR_INVALID', details: 'SECTOR_M_CHECKS.md is missing' };
  }
  const text = fs.readFileSync(SECTOR_M_CHECKS_PATH, 'utf8');
  const requiredMarkers = [
    'CHECK_M0_SOT_SCHEMA',
    'CHECK_M0_RUNNER_ARTIFACT',
    'CHECK_M0_DOCTOR_TOKENS',
    'CHECK_M0_NO_SCOPE_LEAK',
  ];
  for (const marker of requiredMarkers) {
    if (!text.includes(marker)) {
      return { ok: 0, reason: 'SOT_MISSING_OR_INVALID', details: `SECTOR_M_CHECKS.md missing marker: ${marker}` };
    }
  }
  return { ok: 1, reason: '', details: 'SECTOR_M_CHECKS.md markers present' };
}

function validateAllowlistLeak() {
  const diff = spawnSync('git', ['diff', '--name-only', 'origin/main..HEAD'], { encoding: 'utf8' });
  if (diff.status !== 0) {
    return { ok: 0, reason: 'ALLOWLIST_VIOLATION', details: 'git diff command failed', violations: [] };
  }
  const files = String(diff.stdout || '')
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)
    .sort();

  const violations = files.filter((filePath) => !M0_ALLOWLIST.has(filePath));
  if (violations.length > 0) {
    return {
      ok: 0,
      reason: 'ALLOWLIST_VIOLATION',
      details: `Files outside allowlist: ${violations.join(', ')}`,
      violations,
    };
  }

  return {
    ok: 1,
    reason: '',
    details: `Diff files within M0 allowlist (${files.length})`,
    violations: [],
  };
}

function runDoctorCheck() {
  if (!fs.existsSync(DOCTOR_PATH)) {
    return { ok: 0, reason: 'DOCTOR_TOKEN_REGRESSION', details: 'doctor script missing' };
  }
  const out = spawnSync(process.execPath, [DOCTOR_PATH], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SECTOR_M_RUN_SKIP_DOCTOR_TEST: '1',
    },
  });
  if (out.status !== 0) {
    return { ok: 0, reason: 'DOCTOR_TOKEN_REGRESSION', details: 'doctor exited non-zero' };
  }
  const tokens = parseKvTokens(out.stdout);
  const must = [
    ['SECTOR_M_STATUS_OK', '1'],
    ['SECTOR_M_PHASE', 'M0'],
    ['M0_RUNNER_EXISTS', '1'],
  ];
  for (const [k, v] of must) {
    if (tokens.get(k) !== v) {
      return { ok: 0, reason: 'DOCTOR_TOKEN_REGRESSION', details: `doctor token mismatch: ${k}=${tokens.get(k) || ''}` };
    }
  }
  return { ok: 1, reason: '', details: 'doctor emits required M0 tokens' };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!['fast', 'full'].includes(args.pack)) {
    console.log('SECTOR_M_RUN_PACK=');
    console.log('SECTOR_M_RUN_OK=0');
    console.log('SECTOR_M_RUN_FAIL_REASON=PACK_NOT_SUPPORTED');
    process.exit(1);
  }

  if (!hasNpmScript('test:sector-m')) {
    console.log(`SECTOR_M_RUN_PACK=${args.pack}`);
    console.log('SECTOR_M_RUN_OK=0');
    console.log('SECTOR_M_RUN_FAIL_REASON=TEST_FAIL');
    process.exit(1);
  }

  const startedAt = new Date().toISOString();
  const artifactsRoot = path.resolve(process.env.SECTOR_M_ARTIFACTS_ROOT || DEFAULT_ARTIFACTS_ROOT);
  const runId = createRunId(startedAt);
  const runDir = path.join(artifactsRoot, runId);
  const latestResultPath = path.join(artifactsRoot, 'latest', 'result.json');
  const runResultPath = path.join(runDir, 'result.json');

  const checks = [];
  let failReason = '';

  const sot = validateSectorMSoT();
  checks.push({ checkId: 'CHECK_M0_SOT_SCHEMA', ok: sot.ok, details: sot.details });
  if (!failReason && sot.ok !== 1) failReason = sot.reason;

  const checksDoc = validateChecksDoc();
  checks.push({ checkId: 'CHECK_M0_CHECKS_DOC', ok: checksDoc.ok, details: checksDoc.details });
  if (!failReason && checksDoc.ok !== 1) failReason = checksDoc.reason;

  const noLeak = validateAllowlistLeak();
  checks.push({
    checkId: 'CHECK_M0_NO_SCOPE_LEAK',
    ok: noLeak.ok,
    details: noLeak.details,
    violations: noLeak.violations,
  });
  if (!failReason && noLeak.ok !== 1) failReason = noLeak.reason;

  const doctor = runDoctorCheck();
  checks.push({ checkId: 'CHECK_M0_DOCTOR_TOKENS', ok: doctor.ok, details: doctor.details });
  if (!failReason && doctor.ok !== 1) failReason = doctor.reason;

  checks.push({
    checkId: 'CHECK_M0_RUNNER_ARTIFACT',
    ok: 1,
    details: 'runner artifact paths resolved and will be written atomically',
  });

  const result = {
    schemaVersion: RESULT_SCHEMA_VERSION,
    runId,
    pack: args.pack,
    ok: failReason ? 0 : 1,
    failReason,
    checks,
    paths: {
      artifactsRoot: normalizePathForJson(artifactsRoot),
      runDir: normalizePathForJson(runDir),
      latestResultPath: normalizePathForJson(latestResultPath),
    },
  };

  const json = `${JSON.stringify(result, null, 2)}\n`;
  writeFileAtomic(runResultPath, json);
  writeFileAtomic(latestResultPath, json);

  console.log(`SECTOR_M_RUN_PACK=${args.pack}`);
  console.log(`SECTOR_M_RUN_OK=${result.ok}`);
  console.log(`SECTOR_M_RUN_FAIL_REASON=${failReason}`);
  console.log(`SECTOR_M_RUN_RESULT_PATH=${normalizePathForJson(latestResultPath)}`);

  process.exit(result.ok === 1 ? 0 : 1);
}

main();
