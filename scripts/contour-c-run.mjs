#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const ARTIFACTS_ROOT = path.join(ROOT, 'artifacts', 'contour-c-run');
const OPS_CONTOUR_ROOT = path.join(ROOT, 'docs', 'OPS', 'CONTOUR_C');
const WARN_TARGET_PATH = path.join(OPS_CONTOUR_ROOT, 'WARN_TARGET.v1.json');
const WAIVED_GATES_PATH = path.join(OPS_CONTOUR_ROOT, 'WAIVED_GATES.json');
const LEDGER_PATH = path.join(OPS_CONTOUR_ROOT, 'EXIT_LEDGER.json');

const CHECKS = [
  { id: 'CHECK_01_NPM_TEST', cmd: ['npm', 'test'] },
  { id: 'CHECK_02_DOCTOR', cmd: ['node', 'scripts/doctor.mjs'] },
  { id: 'CHECK_03_CONTOUR_C_P0_03', cmd: ['node', 'scripts/guards/contour-c-p0-03.mjs'] },
  { id: 'CHECK_04_OPS_CURRENT_WAVE', cmd: ['node', 'scripts/guards/ops-current-wave-stop.mjs'] },
  { id: 'CHECK_05_OPS_MVP_BOUNDARY', cmd: ['node', 'scripts/guards/ops-mvp-boundary.mjs'] },
];

function nowIso() {
  return new Date().toISOString();
}

function runCmd(command, timeoutMs = 300000) {
  const startedAt = Date.now();
  const result = spawnSync(command[0], command.slice(1), {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: timeoutMs,
    shell: false,
  });
  const finishedAt = Date.now();
  const status = typeof result.status === 'number' ? result.status : 1;
  return {
    status,
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
    stderr: typeof result.stderr === 'string' ? result.stderr : '',
    durationMs: finishedAt - startedAt,
    timedOut: Boolean(result.signal) && result.signal === 'SIGTERM' && result.error?.code === 'ETIMEDOUT',
  };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sanitizeFileName(value) {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, '_');
}

function parseKvTokens(text) {
  const out = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (!key) continue;
    if (!out.has(key)) out.set(key, val);
  }
  return out;
}

function parseJsonSafe(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function readWarnTarget() {
  if (!fs.existsSync(WARN_TARGET_PATH)) {
    return {
      schemaVersion: 1,
      baselineSha: '-',
      baselineWarnCount: 0,
      targetWarnIds: [],
    };
  }
  const raw = fs.readFileSync(WARN_TARGET_PATH, 'utf8');
  const parsed = parseJsonSafe(raw, null);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('WARN_TARGET_INVALID_JSON');
  }
  const targetWarnIds = Array.isArray(parsed.targetWarnIds) ? parsed.targetWarnIds.filter((x) => typeof x === 'string') : [];
  return {
    schemaVersion: Number.isInteger(parsed.schemaVersion) ? parsed.schemaVersion : 1,
    warnTargetSetVersion: typeof parsed.warnTargetSetVersion === 'string' && parsed.warnTargetSetVersion.length > 0 ? parsed.warnTargetSetVersion : 'v1',
    baselineSha: typeof parsed.baselineSha === 'string' && parsed.baselineSha.length > 0 ? parsed.baselineSha : '-',
    baselineWarnCount: Number.isInteger(parsed.baselineWarnCount) ? parsed.baselineWarnCount : 0,
    targetWarnIds,
  };
}

function readLedgerBaselineSha() {
  if (!fs.existsSync(LEDGER_PATH)) return '';
  const raw = fs.readFileSync(LEDGER_PATH, 'utf8');
  const parsed = parseJsonSafe(raw, null);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.entries) || parsed.entries.length === 0) return '';
  const first = parsed.entries[0];
  if (!first || typeof first !== 'object') return '';
  return typeof first.baselineSha === 'string' ? first.baselineSha : '';
}

function readWaivedGates() {
  if (!fs.existsSync(WAIVED_GATES_PATH)) {
    return {
      schemaVersion: 1,
      waivers: [],
    };
  }
  const raw = fs.readFileSync(WAIVED_GATES_PATH, 'utf8');
  const parsed = parseJsonSafe(raw, null);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('WAIVED_GATES_INVALID_JSON');
  }
  const waivers = Array.isArray(parsed.waivers) ? parsed.waivers : [];
  return {
    schemaVersion: Number.isInteger(parsed.schemaVersion) ? parsed.schemaVersion : 1,
    waivers: waivers
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        gateId: typeof item.gateId === 'string' ? item.gateId : '',
        reason: typeof item.reason === 'string' ? item.reason : '',
        owner: typeof item.owner === 'string' ? item.owner : '',
        ttl: typeof item.ttl === 'string' ? item.ttl : '',
      }))
      .filter((item) => item.gateId.length > 0),
  };
}

function isWaiverActive(waiver, nowMs) {
  const ttlMs = Date.parse(waiver.ttl);
  if (!Number.isFinite(ttlMs)) return false;
  return ttlMs >= nowMs;
}

function writeText(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
}

function main() {
  const startedAt = nowIso();
  const runId = nowIso().replace(/[:.]/g, '-');
  const runDir = path.join(ARTIFACTS_ROOT, runId);
  const rawDir = path.join(runDir, 'raw');
  ensureDir(rawDir);

  const warnTarget = readWarnTarget();
  const waivedGates = readWaivedGates();
  const nowMs = Date.now();

  const checkResults = [];
  const activeWaivers = [];

  for (const check of CHECKS) {
    const result = runCmd(check.cmd);
    const base = sanitizeFileName(check.id.toLowerCase());
    const stdoutPath = path.join(rawDir, `${base}.stdout.log`);
    const stderrPath = path.join(rawDir, `${base}.stderr.log`);
    writeText(stdoutPath, result.stdout);
    writeText(stderrPath, result.stderr);

    let status = result.status === 0 ? 'PASS' : 'FAIL';
    let waiverUsed = null;
    if (status === 'FAIL') {
      const waiver = waivedGates.waivers.find((item) => item.gateId === check.id);
      if (waiver && isWaiverActive(waiver, nowMs)) {
        status = 'WAIVED';
        waiverUsed = waiver;
        activeWaivers.push({
          gateId: waiver.gateId,
          reason: waiver.reason,
          owner: waiver.owner,
          ttl: waiver.ttl,
        });
      }
    }

    checkResults.push({
      id: check.id,
      command: check.cmd.join(' '),
      exitCode: result.status,
      status,
      durationMs: result.durationMs,
      timedOut: result.timedOut,
      stdoutPath: path.relative(ROOT, stdoutPath).replaceAll('\\', '/'),
      stderrPath: path.relative(ROOT, stderrPath).replaceAll('\\', '/'),
      waiver: waiverUsed,
    });
  }

  const doctorCheck = checkResults.find((item) => item.id === 'CHECK_02_DOCTOR');
  const doctorStdout = doctorCheck ? fs.readFileSync(path.join(ROOT, doctorCheck.stdoutPath), 'utf8') : '';
  const doctorTokens = parseKvTokens(doctorStdout);

  const strictLieRaw = doctorTokens.get('STRICT_LIE_CLASSES_OK') ?? '0';
  const strictLieClassesOk = strictLieRaw === '1' ? 1 : 0;
  const p0Raw = doctorTokens.get('CONTOUR_C_EXIT_IMPLEMENTED_P0_COUNT') ?? '0';
  const p0Count = Number.parseInt(p0Raw, 10);
  const contourViolRaw = doctorTokens.get('CONTOUR_C_ENFORCEMENT_VIOLATIONS_COUNT') ?? '0';
  const contourViolations = Number.parseInt(contourViolRaw, 10);
  const warnTargetSetVersion = doctorTokens.get('WARN_TARGET_SET_VERSION') ?? '';
  const baselineSha = doctorTokens.get('WARN_TARGET_BASELINE_SHA') ?? '';
  const warnTargetSetRaw = doctorTokens.get('WARN_TARGET_SET') ?? '[]';
  const warnTargetSet = parseJsonSafe(warnTargetSetRaw, []);
  const warnBaselineRaw = doctorTokens.get('WARN_TARGET_BASELINE_COUNT') ?? '0';
  const warnCurrentRaw = doctorTokens.get('WARN_TARGET_CURRENT_COUNT') ?? '0';
  const warnDeltaRaw = doctorTokens.get('WARN_DELTA_TARGET') ?? 'NaN';
  const warnBaselineCount = Number.parseInt(warnBaselineRaw, 10);
  const warnCurrentCount = Number.parseInt(warnCurrentRaw, 10);
  const warnDeltaTarget = Number.parseInt(warnDeltaRaw, 10);

  const ledgerBaselineSha = readLedgerBaselineSha();
  const warnTargetSetValid = Array.isArray(warnTargetSet) && warnTargetSet.length > 0 && warnTarget.targetWarnIds.length > 0;
  const baselineShaValid = typeof baselineSha === 'string' && baselineSha.length > 0 && baselineSha !== '-';
  const baselineShaMatchesLedger = baselineShaValid && ledgerBaselineSha.length > 0 && baselineSha === ledgerBaselineSha;
  const warnTargetVersionValid = typeof warnTargetSetVersion === 'string' && warnTargetSetVersion.length > 0;
  const warnDeltaValid = Number.isInteger(warnDeltaTarget);

  const failedChecks = checkResults.filter((item) => item.status === 'FAIL').map((item) => item.id);
  const isPass =
    failedChecks.length === 0 &&
    strictLieClassesOk === 1 &&
    warnTargetSetValid &&
    baselineShaMatchesLedger &&
    warnTargetVersionValid &&
    warnDeltaValid &&
    warnDeltaTarget <= 0;

  const finishedAt = nowIso();
  const report = {
    schemaVersion: 1,
    startedAt,
    finishedAt,
    runId,
    checks: checkResults,
    kpi: {
      STRICT_LIE_CLASSES_OK: strictLieClassesOk,
      CONTOUR_C_EXIT_IMPLEMENTED_P0_COUNT: Number.isFinite(p0Count) ? p0Count : 0,
      CONTOUR_C_ENFORCEMENT_VIOLATIONS_COUNT: Number.isFinite(contourViolations) ? contourViolations : 0,
      warnTargetSetVersion,
      baselineSha,
      warnDeltaTarget,
      WARN_DELTA_TARGET: warnDeltaTarget,
      WARN_TARGET_BASELINE_COUNT: Number.isFinite(warnBaselineCount) ? warnBaselineCount : 0,
      WARN_TARGET_CURRENT_COUNT: Number.isFinite(warnCurrentCount) ? warnCurrentCount : 0,
      WARN_TARGET_SET: Array.isArray(warnTargetSet) ? warnTargetSet : [],
      WARN_TARGET_BASELINE_SHA: baselineSha,
      WARN_TARGET_BASELINE_SHA_MATCHES_LEDGER: baselineShaMatchesLedger ? 1 : 0,
    },
    waivers: {
      active: activeWaivers,
      expiredOrInvalid: waivedGates.waivers
        .filter((item) => !isWaiverActive(item, nowMs))
        .map((item) => ({ gateId: item.gateId, ttl: item.ttl, owner: item.owner })),
    },
    summary: {
      result: isPass ? 'PASS' : 'FAIL',
      failedChecks,
      strictLieClassesOk,
      warnDeltaTarget,
      warnTargetSetValid: warnTargetSetValid ? 1 : 0,
      baselineShaMatchesLedger: baselineShaMatchesLedger ? 1 : 0,
    },
  };

  const resultPath = path.join(runDir, 'result.json');
  writeText(resultPath, `${JSON.stringify(report, null, 2)}\n`);

  const latestDir = path.join(ARTIFACTS_ROOT, 'latest');
  ensureDir(latestDir);
  writeText(path.join(latestDir, 'result.json'), `${JSON.stringify(report, null, 2)}\n`);

  process.stdout.write(`CONTOUR_C_RUN_RESULT_PATH=${path.relative(ROOT, resultPath).replaceAll('\\', '/')}\n`);
  process.stdout.write(`CONTOUR_C_RUN_STATUS=${report.summary.result}\n`);
  process.stdout.write(`STRICT_LIE_CLASSES_OK=${strictLieClassesOk}\n`);
  process.stdout.write(`CONTOUR_C_EXIT_IMPLEMENTED_P0_COUNT=${report.kpi.CONTOUR_C_EXIT_IMPLEMENTED_P0_COUNT}\n`);
  process.stdout.write(`CONTOUR_C_ENFORCEMENT_VIOLATIONS_COUNT=${report.kpi.CONTOUR_C_ENFORCEMENT_VIOLATIONS_COUNT}\n`);
  process.stdout.write(`WARN_TARGET_SET_VERSION=${warnTargetSetVersion}\n`);
  process.stdout.write(`WARN_TARGET_BASELINE_SHA=${baselineSha}\n`);
  process.stdout.write(`WARN_DELTA_TARGET=${warnDeltaTarget}\n`);

  if (report.waivers.expiredOrInvalid.length > 0) {
    process.stdout.write(`WAIVER_TTL_EXPIRED_COUNT=${report.waivers.expiredOrInvalid.length}\n`);
  }

  process.exit(isPass ? 0 : 1);
}

try {
  main();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`CONTOUR_C_RUN_FATAL=${message}\n`);
  process.exit(1);
}
