#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const ALLOWED_MODES = new Set(['dev', 'pr', 'release', 'promotion']);
const RUNNER_VERSION = 'v0.4.0-runner-stabilization-02';
const HASH_SCHEMA_VERSION_DEFAULT = 'v2';
const DEFAULT_PR_RESUME_STEP = 5;
const SNAPSHOT_ROOT = path.join('docs', 'OPS', 'CACHE', 'codex-run');
const RETRY_DELAY_MS = 2000;
const GH_TIMEOUT_MS = 30000;
const CHECKS_WAIT_TIMEOUT_MS = 10 * 60 * 1000;
const CHECKS_WAIT_POLL_MS = 20 * 1000;
const CACHE_ROOT_PREFIX = 'docs/OPS/CACHE/';
const TICKET_PLAN_ROOT = path.join('docs', 'OPS', 'EXECUTION', 'TICKETS');
const DEFAULT_ALLOWLIST = Object.freeze([
  'scripts/ops/codex-run.mjs',
  'docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json',
]);
const AUTOCYCLE_CANON_PATH = path.join('docs', 'OPS', 'EXECUTION', 'AUTOCYCLE_CANON_v1.json');
const AUTOCYCLE_DEFAULT_POLICY = Object.freeze({
  maxMainTzPerBatch: 3,
  maxPatchPerMain: 2,
  maxIterationsTotal: 3,
  patchConstraints: {
    maxFiles: 5,
    maxLines: 150,
  },
  stagnationPolicy: {
    defaultRepeats: 2,
    networkRepeats: 3,
    contextRepeats: 3,
  },
});
const AUTOCYCLE_HARD_BLOCK_REASONS = new Set([
  'CACHE_SCOPE_LEAK',
  'SCOPE_PROOF_DIRTY',
  'SCOPE_PROOF_FAILED',
  'GOVERNANCE_VIOLATION',
  'SECURITY_BREACH',
  'REBASE_CONFLICT',
  'REBASE_FAILED',
  'PR_FLOW_INVARIANT_BROKEN',
  'RUNNER_ENTRYPOINT_MISSING',
  'INVALID_PATCH_FILE',
  'PATCH_CONSTRAINTS_EXCEEDED',
  'PATCH_FILE_MISMATCH',
  'AUTOCYCLE_CANON_INVALID',
  'PLAN_INVALID',
  'GATE_PACK_FAILED',
]);
const AUTOCYCLE_STAGNATION_NETWORK_REASONS = new Set([
  'NETWORK_UNSTABLE',
]);
const AUTOCYCLE_STAGNATION_CONTEXT_REASONS = new Set([
  'PR_CONTEXT_MISSING',
  'BRANCH_PROTECTION_BLOCK',
  'PR_CREATE_SKIPPED',
]);
const LOCKFILE_CANDIDATES = Object.freeze([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
]);

class RunnerStepFailure extends Error {
  constructor(failureClass, reason, detail, options = {}) {
    super(String(detail || reason || 'runner_step_failure'));
    this.failureClass = String(failureClass || 'BLOCK_FAIL');
    this.reason = String(reason || 'RUNNER_STEP_FAILED');
    this.detail = String(detail || this.reason);
    this.evidenceTail = Array.isArray(options.evidenceTail) ? options.evidenceTail : [];
    this.resumeFromStep = Number.isInteger(options.resumeFromStep) ? options.resumeFromStep : null;
    this.handoffReason = options.handoffReason ? String(options.handoffReason) : '';
    this.clickList = Array.isArray(options.clickList) ? options.clickList : [];
  }
}

function usage() {
  process.stdout.write(
    [
      'Usage:',
      '  node scripts/ops/codex-run.mjs --ticket <TICKET_ID> --mode <dev|pr|release|promotion> [--pr <NUMBER>] [--resume-from-step <N>] [--autocycle] [--patch-file <PATH>] [--plan <PATH>] [--no-create-pr]',
      '  node scripts/ops/codex-run.mjs --help',
    ].join('\n') + '\n',
  );
}

function parseArgs(argv) {
  const out = {
    help: false,
    ticketId: '',
    mode: '',
    prNumber: null,
    resumeFromStep: null,
    autocycle: false,
    patchFile: '',
    planPath: '',
    noCreatePr: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || '').trim();
    if (!arg) continue;
    if (arg === '--help' || arg === '-h') {
      out.help = true;
      continue;
    }
    if ((arg === '--ticket' || arg === '-t') && i + 1 < argv.length) {
      out.ticketId = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if ((arg === '--mode' || arg === '-m') && i + 1 < argv.length) {
      out.mode = String(argv[i + 1] || '').trim().toLowerCase();
      i += 1;
      continue;
    }
    if (arg === '--pr' && i + 1 < argv.length) {
      const raw = String(argv[i + 1] || '').trim();
      const parsed = Number.parseInt(raw, 10);
      out.prNumber = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
      i += 1;
      continue;
    }
    if (arg === '--resume-from-step' && i + 1 < argv.length) {
      const raw = String(argv[i + 1] || '').trim();
      const parsed = Number.parseInt(raw, 10);
      out.resumeFromStep = Number.isInteger(parsed) ? parsed : null;
      i += 1;
      continue;
    }
    if (arg === '--autocycle') {
      out.autocycle = true;
      continue;
    }
    if (arg === '--patch-file' && i + 1 < argv.length) {
      out.patchFile = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (arg === '--plan' && i + 1 < argv.length) {
      out.planPath = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (arg === '--no-create-pr') {
      out.noCreatePr = true;
      continue;
    }
  }

  return out;
}

function nowMs() {
  return Number(process.hrtime.bigint() / 1000000n);
}

function nowUtcIso() {
  return new Date().toISOString();
}

function sanitizeTicketId(ticketId) {
  return String(ticketId || '')
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'ticket';
}

function ticketBranchName(ticketId) {
  return `codex/${sanitizeTicketId(ticketId).toLowerCase()}`;
}

function tailLines(text, max = 12) {
  const lines = String(text || '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  if (lines.length <= max) return lines;
  return lines.slice(lines.length - max);
}

function commandToString(command, args) {
  const chunks = [String(command || '').trim(), ...(args || []).map((item) => String(item || '').trim())]
    .filter((chunk) => chunk.length > 0);
  return chunks.join(' ');
}

function stableJsonStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJsonStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function sha256String(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function sleepMs(durationMs) {
  const ms = Math.max(0, Number(durationMs) || 0);
  if (ms === 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function parsePorcelainPaths(output) {
  const rows = String(output || '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length >= 3);
  const paths = [];
  for (const line of rows) {
    const payload = line.slice(3).trim();
    if (!payload) continue;
    const renameParts = payload.split(' -> ').map((part) => part.trim()).filter(Boolean);
    if (renameParts.length > 1) {
      paths.push(...renameParts);
    } else {
      paths.push(payload);
    }
  }
  return paths;
}

function assertCacheInvariantOrThrow() {
  const tracked = runCommand('git', ['ls-files', '--', CACHE_ROOT_PREFIX], { retryable: false });
  if (!tracked.ok) {
    throw new RunnerStepFailure('BLOCK_FAIL', 'SCOPE_PROOF_FAILED', 'git ls-files cache probe failed', {
      evidenceTail: tracked.evidenceTail,
    });
  }
  const trackedPaths = String(tracked.stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (trackedPaths.length > 0) {
    throw new RunnerStepFailure(
      'BLOCK_FAIL',
      'CACHE_SCOPE_LEAK',
      'cache paths are tracked; unstage/remove tracked cache and restore ignore policy',
      { evidenceTail: trackedPaths },
    );
  }

  const status = runCommand('git', ['status', '--porcelain', '--untracked-files=all'], { retryable: false });
  if (!status.ok) {
    throw new RunnerStepFailure('BLOCK_FAIL', 'SCOPE_PROOF_FAILED', 'git status cache probe failed', {
      evidenceTail: status.evidenceTail,
    });
  }
  const cacheStatusRows = String(status.stdout || '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length >= 3)
    .filter((line) => parsePorcelainPaths(line).some((p) => p.startsWith(CACHE_ROOT_PREFIX)));
  if (cacheStatusRows.length > 0) {
    throw new RunnerStepFailure(
      'BLOCK_FAIL',
      'CACHE_SCOPE_LEAK',
      'cache paths are staged/modified/unignored; unstage/remove cache and keep docs/OPS/CACHE/** ignored',
      { evidenceTail: cacheStatusRows },
    );
  }
}

function emitStepEvent(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function classifyFailureText(detailText) {
  const text = String(detailText || '').toLowerCase();

  if (text.includes('module_not_found') || text.includes('cannot find module')) {
    return { failureClass: 'BLOCK_FAIL', reason: 'RUNNER_ENTRYPOINT_MISSING' };
  }

  if (
    text.includes('authentication failed')
    || text.includes('gh auth login')
    || text.includes('not logged into github')
    || text.includes('could not read username')
    || text.includes('requires authentication')
    || text.includes('http 401')
    || text.includes('http 403')
  ) {
    return { failureClass: 'HUMAN_REQUIRED', reason: 'GH_AUTH_REQUIRED' };
  }

  if (
    text.includes('base branch policy prohibits the merge')
    || text.includes('required status check')
    || text.includes('reviews required')
    || text.includes('is not mergeable')
    || text.includes('branch protection')
  ) {
    return { failureClass: 'HUMAN_REQUIRED', reason: 'BRANCH_PROTECTION_BLOCK' };
  }

  if (
    text.includes('timed out')
    || text.includes('timeout')
    || text.includes('network')
    || text.includes('connection reset')
    || text.includes('temporary failure')
    || text.includes('error connecting to api.github.com')
    || text.includes('could not resolve host')
    || text.includes('rate limit')
    || text.includes('http 502')
    || text.includes('http 503')
    || text.includes('http 504')
    || text.includes('econn')
    || text.includes('enotfound')
    || text.includes('etimedout')
    || text.includes('socket hang up')
    || text.includes('api.github.com')
  ) {
    return { failureClass: 'RETRYABLE_FAIL', reason: 'NETWORK_UNSTABLE' };
  }

  return { failureClass: 'BLOCK_FAIL', reason: 'RUNNER_STEP_FAILED' };
}

function normalizeFailure(error) {
  if (error instanceof RunnerStepFailure) {
    return error;
  }
  const detail = String(error?.detail || error?.message || error || 'runner_step_failure');
  const classified = classifyFailureText(detail);
  return new RunnerStepFailure(classified.failureClass, classified.reason, detail, {
    evidenceTail: tailLines(detail),
  });
}

function runCommand(command, args = [], options = {}) {
  const {
    cwd = process.cwd(),
    env = process.env,
    retryable = true,
    requireSuccess = false,
  } = options;

  const attemptsAllowed = retryable ? 3 : 1;
  let last = null;

  for (let attempt = 1; attempt <= attemptsAllowed; attempt += 1) {
    const result = spawnSync(command, args, {
      cwd,
      env: {
        ...env,
        GIT_TERMINAL_PROMPT: '0',
        GH_PROMPT_DISABLED: '1',
        GH_NO_UPDATE_NOTIFIER: '1',
        NO_COLOR: '1',
        FORCE_COLOR: '0',
      },
      timeout: command === 'gh' ? GH_TIMEOUT_MS : undefined,
      encoding: 'utf8',
    });

    const stdout = String(result.stdout || '');
    const stderr = String(result.stderr || '');
    const errorText = String(result.error?.message || '');
    const combined = `${stdout}\n${stderr}\n${errorText}`.trim();

    if (result.status === 0) {
      return {
        ok: true,
        status: 0,
        stdout,
        stderr,
        attempts: attempt,
        command,
        args,
      };
    }

    const classified = classifyFailureText(combined);
    last = {
      ok: false,
      status: Number.isInteger(result.status) ? result.status : 1,
      stdout,
      stderr,
      attempts: attempt,
      classification: classified,
      evidenceTail: tailLines(combined),
      command,
      args,
    };

    const canRetry = classified.failureClass === 'RETRYABLE_FAIL' && attempt < attemptsAllowed;
    if (!canRetry) break;
    sleepMs(RETRY_DELAY_MS);
  }

  if (requireSuccess && last) {
    throw new RunnerStepFailure(
      last.classification.failureClass,
      last.classification.reason,
      `${commandToString(command, args)} failed`,
      { evidenceTail: last.evidenceTail },
    );
  }

  return last || {
    ok: false,
    status: 1,
    stdout: '',
    stderr: '',
    attempts: 1,
    classification: { failureClass: 'BLOCK_FAIL', reason: 'RUNNER_STEP_FAILED' },
    evidenceTail: [],
    command,
    args,
  };
}

function runStep(ctx, { stepId, command = 'internal', handler }) {
  const startedAt = nowMs();
  if (ctx.state) {
    ctx.state.stepId = stepId;
    ctx.state.currentStep = stepId;
    writeSnapshot(ctx.snapshotPath, ctx.state);
  }
  if (ctx.autocycleState) {
    ctx.autocycleState.currentStep = stepId;
    ctx.autocycleState.updatedAtUtc = nowUtcIso();
    writeJsonFile(ctx.autocycleSnapshotPath, ctx.autocycleState);
  }
  try {
    const result = handler();
    emitStepEvent({
      traceId: ctx.traceId,
      ticketId: ctx.ticketId,
      mode: ctx.mode,
      stepId,
      command,
      exitCode: 0,
      durationMs: nowMs() - startedAt,
      summary: result?.summary || 'ok',
      failureClass: null,
      reason: '',
    });
    return { ok: true, result };
  } catch (error) {
    const normalized = normalizeFailure(error);
    emitStepEvent({
      traceId: ctx.traceId,
      ticketId: ctx.ticketId,
      mode: ctx.mode,
      stepId,
      command,
      exitCode: 1,
      durationMs: nowMs() - startedAt,
      summary: 'step failed',
      failureClass: normalized.failureClass,
      reason: normalized.reason,
      evidenceTail: normalized.evidenceTail,
      detail: normalized.detail,
      resumeFromStep: normalized.resumeFromStep,
      handoffReason: normalized.handoffReason,
      clickList: normalized.clickList,
    });
    return { ok: false, error: normalized };
  }
}

function safeGitRevParse(ref) {
  const result = runCommand('git', ['rev-parse', ref], { retryable: false });
  if (!result?.ok) return '';
  return String(result.stdout || '').trim();
}

function isLocalAutocyclePipeline(args) {
  return Boolean(args?.autocycle && args?.mode === 'pr' && args?.prNumber === null);
}

function resolvePlanPath(ticketId, explicitPlanPath) {
  if (explicitPlanPath) return path.resolve(process.cwd(), explicitPlanPath);
  return path.resolve(process.cwd(), TICKET_PLAN_ROOT, `${sanitizeTicketId(ticketId)}.plan.json`);
}

function readPlanForHash(planPath) {
  if (!planPath || !fs.existsSync(planPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(planPath, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function derivePlanAllowlist(planPayload) {
  if (!planPayload || typeof planPayload !== 'object') return [];
  const changes = Array.isArray(planPayload.changes) ? planPayload.changes : [];
  return [...new Set(changes.map((entry) => String(entry?.path || '').trim()).filter(Boolean))].sort();
}

function planDigest(planPayload) {
  if (!planPayload) return 'none';
  return sha256String(stableJsonStringify(planPayload));
}

function detectLockfileHash() {
  for (const candidate of LOCKFILE_CANDIDATES) {
    const resolved = path.resolve(process.cwd(), candidate);
    if (!fs.existsSync(resolved)) continue;
    const digest = sha256Buffer(fs.readFileSync(resolved));
    return { lockfilePath: candidate, lockfileHash: digest };
  }
  return { lockfilePath: 'none', lockfileHash: 'none' };
}

function computeChangedFilesContentDigest(allowlist) {
  const sorted = Array.isArray(allowlist) ? [...allowlist].sort() : [];
  const lines = [];
  for (const relativePath of sorted) {
    const resolved = path.resolve(process.cwd(), relativePath);
    if (!fs.existsSync(resolved)) continue;
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) continue;
    const fileDigest = sha256Buffer(fs.readFileSync(resolved));
    lines.push(`${relativePath}\n${fileDigest}\n`);
  }
  return sha256String(lines.join(''));
}

function resolveRunnerVersionSource() {
  if (String(RUNNER_VERSION || '').trim()) return String(RUNNER_VERSION).trim();
  const selfPath = path.resolve(process.cwd(), 'scripts/ops/codex-run.mjs');
  if (!fs.existsSync(selfPath)) return 'runner-missing';
  return sha256Buffer(fs.readFileSync(selfPath));
}

function buildHashState({ mode, tier, allowlist, planPath = '', planPayload = null }) {
  const baseSha = safeGitRevParse('origin/main');
  const allowHash = allowlistHash(allowlist);
  const { lockfilePath, lockfileHash } = detectLockfileHash();
  const changedFilesContentDigest = computeChangedFilesContentDigest(allowlist);
  const runnerVersionSource = resolveRunnerVersionSource();
  const normalizedPlanPath = planPath ? path.relative(process.cwd(), planPath) : '';
  const computedPlanDigest = planDigest(planPayload);
  const determinismPayload = JSON.stringify({
    hashSchemaVersion: HASH_SCHEMA_VERSION_DEFAULT,
    baseSha,
    mode,
    tier,
    allowlistHash: allowHash,
    lockfilePath,
    lockfileHash,
    nodeVersion: process.version,
    changedFilesContentDigest,
    planPath: normalizedPlanPath || 'none',
    planDigest: computedPlanDigest,
    runnerVersion: runnerVersionSource,
  });
  const envPayload = JSON.stringify({
    os: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    locale: Intl.DateTimeFormat().resolvedOptions().locale || 'unknown',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
  });
  return {
    hashSchemaVersion: HASH_SCHEMA_VERSION_DEFAULT,
    baseSha,
    lockfilePath,
    lockfileHash,
    changedFilesContentDigest,
    planPath: normalizedPlanPath,
    planDigest: computedPlanDigest,
    runnerVersionSource,
    determinismHash: sha256String(determinismPayload),
    envHash: sha256String(envPayload),
  };
}

function parseAllowlist() {
  const raw = String(process.env.CODEX_ALLOWLIST_PATHS_EXACT || '').trim();
  if (!raw) return [...DEFAULT_ALLOWLIST];
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeRepoRelativePath(candidatePath) {
  const raw = String(candidatePath || '').trim().replace(/\\/g, '/');
  if (!raw) return '';
  if (path.isAbsolute(raw)) return '';
  const resolved = path.resolve(process.cwd(), raw);
  const relative = path.relative(process.cwd(), resolved).replace(/\\/g, '/');
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return '';
  return relative;
}

function validatePlanPayload(ctx, payload) {
  if (!payload || typeof payload !== 'object') {
    throw new RunnerStepFailure('BLOCK_FAIL', 'PLAN_INVALID', 'plan payload must be a JSON object');
  }
  const schemaVersion = String(payload.schemaVersion || '').trim();
  const ticketId = String(payload.ticketId || '').trim();
  if (schemaVersion !== 'v1') {
    throw new RunnerStepFailure('BLOCK_FAIL', 'PLAN_INVALID', `unsupported plan schemaVersion: ${schemaVersion || 'missing'}`);
  }
  if (ticketId && ticketId !== ctx.ticketId) {
    throw new RunnerStepFailure('BLOCK_FAIL', 'PLAN_INVALID', `plan ticketId mismatch: ${ticketId} != ${ctx.ticketId}`);
  }
  const changes = Array.isArray(payload.changes) ? payload.changes : null;
  if (!changes) {
    throw new RunnerStepFailure('BLOCK_FAIL', 'PLAN_INVALID', 'plan changes must be an array');
  }

  const normalizedChanges = changes.map((entry, index) => {
    const rawPath = String(entry?.path || '').trim();
    const normalizedPath = normalizeRepoRelativePath(rawPath);
    const operation = String(entry?.operation || '').trim().toLowerCase();
    if (!normalizedPath) {
      throw new RunnerStepFailure('BLOCK_FAIL', 'PLAN_INVALID', `invalid path at changes[${index}]`);
    }
    if (!['edit', 'create', 'delete'].includes(operation)) {
      throw new RunnerStepFailure('BLOCK_FAIL', 'PLAN_INVALID', `invalid operation at changes[${index}]: ${operation || 'missing'}`);
    }
    if (normalizedPath.startsWith(CACHE_ROOT_PREFIX)) {
      throw new RunnerStepFailure('BLOCK_FAIL', 'CACHE_SCOPE_LEAK', `plan may not mutate cache path: ${normalizedPath}`);
    }
    if (operation !== 'delete' && typeof entry?.content !== 'string') {
      throw new RunnerStepFailure('BLOCK_FAIL', 'PLAN_INVALID', `content must be string for changes[${index}]`);
    }
    return {
      path: normalizedPath,
      operation,
      content: operation === 'delete' ? '' : String(entry.content),
    };
  });

  return {
    schemaVersion: 'v1',
    ticketId: ticketId || ctx.ticketId,
    tier: String(payload.tier || '').trim() || 'RUNTIME_FEATURE',
    changes: normalizedChanges,
    doneCriteria: Array.isArray(payload.doneCriteria) ? payload.doneCriteria.map((item) => String(item || '').trim()).filter(Boolean) : [],
  };
}

function loadPlanOrThrow(ctx) {
  const resolvedPlanPath = resolvePlanPath(ctx.ticketId, ctx.args.planPath || '');
  ctx.planPath = resolvedPlanPath;
  if (!fs.existsSync(resolvedPlanPath)) {
    throw new RunnerStepFailure(
      'HUMAN_REQUIRED',
      'PLAN_MISSING',
      `plan file missing: ${resolvedPlanPath}`,
      { resumeFromStep: 4, evidenceTail: [resolvedPlanPath] },
    );
  }
  let parsed = null;
  try {
    parsed = JSON.parse(fs.readFileSync(resolvedPlanPath, 'utf8'));
  } catch (error) {
    throw new RunnerStepFailure('BLOCK_FAIL', 'PLAN_INVALID', `unable to parse plan JSON: ${resolvedPlanPath}`, {
      evidenceTail: tailLines(error?.message || String(error || 'json parse failed')),
    });
  }
  return validatePlanPayload(ctx, parsed);
}

function inferTier(mode) {
  if (mode === 'pr') return 'RUNTIME_LIGHT';
  if (mode === 'promotion') return 'CORE';
  if (mode === 'release') return 'RUNTIME_FEATURE';
  return 'DOCS_ONLY';
}

function hashString(value) {
  return sha256String(value);
}

function allowlistHash(allowlist) {
  return hashString(JSON.stringify(Array.isArray(allowlist) ? [...allowlist].sort() : []));
}

function autocycleSnapshotPathForTicket(ticketId) {
  return path.resolve(process.cwd(), SNAPSHOT_ROOT, `${sanitizeTicketId(ticketId)}.autocycle.json`);
}

function readJsonFileSafe(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeJsonFile(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function readAutocyclePolicy() {
  const resolved = path.resolve(process.cwd(), AUTOCYCLE_CANON_PATH);
  const parsed = readJsonFileSafe(resolved);
  const hashSchemaVersion = String(parsed?.hashSchemaVersion || HASH_SCHEMA_VERSION_DEFAULT);
  const determinismHashInputs = Array.isArray(parsed?.determinismHashInputs) ? parsed.determinismHashInputs : [];
  const envHashInputs = Array.isArray(parsed?.envHashInputs) ? parsed.envHashInputs : [];
  const batch = parsed?.batchPolicy || {};
  const patch = parsed?.patchConstraints || {};
  const stagnation = parsed?.stagnationPolicy || {};
  const maxMainTzPerBatch = Number.parseInt(batch.maxMainTZPerBatch ?? batch.maxMainTzPerBatch, 10);
  const maxPatchPerMain = Number.parseInt(batch.maxPatchPerMainTZ ?? batch.maxPatchPerMain, 10);
  const maxIterationsTotal = Number.parseInt(batch.maxIterationsTotal ?? batch.maxIterationsWithoutForwardDiff, 10);
  const maxFiles = Number.parseInt(patch.maxFiles, 10);
  const maxLines = Number.parseInt(patch.maxLines, 10);
  const defaultRepeats = Number.parseInt(stagnation.defaultRepeats, 10);
  const networkRepeats = Number.parseInt(stagnation.networkRepeats, 10);
  const contextRepeats = Number.parseInt(stagnation.contextRepeats, 10);

  return {
    path: resolved,
    hashSchemaVersion,
    determinismHashInputs,
    envHashInputs,
    maxMainTzPerBatch: Number.isInteger(maxMainTzPerBatch) && maxMainTzPerBatch > 0 ? maxMainTzPerBatch : AUTOCYCLE_DEFAULT_POLICY.maxMainTzPerBatch,
    maxPatchPerMain: Number.isInteger(maxPatchPerMain) && maxPatchPerMain >= 0 ? maxPatchPerMain : AUTOCYCLE_DEFAULT_POLICY.maxPatchPerMain,
    maxIterationsTotal: Number.isInteger(maxIterationsTotal) && maxIterationsTotal > 0 ? maxIterationsTotal : AUTOCYCLE_DEFAULT_POLICY.maxIterationsTotal,
    patchConstraints: {
      maxFiles: Number.isInteger(maxFiles) && maxFiles > 0 ? maxFiles : AUTOCYCLE_DEFAULT_POLICY.patchConstraints.maxFiles,
      maxLines: Number.isInteger(maxLines) && maxLines > 0 ? maxLines : AUTOCYCLE_DEFAULT_POLICY.patchConstraints.maxLines,
    },
    stagnationPolicy: {
      defaultRepeats: Number.isInteger(defaultRepeats) && defaultRepeats >= 1 ? defaultRepeats : AUTOCYCLE_DEFAULT_POLICY.stagnationPolicy.defaultRepeats,
      networkRepeats: Number.isInteger(networkRepeats) && networkRepeats >= 1 ? networkRepeats : AUTOCYCLE_DEFAULT_POLICY.stagnationPolicy.networkRepeats,
      contextRepeats: Number.isInteger(contextRepeats) && contextRepeats >= 1 ? contextRepeats : AUTOCYCLE_DEFAULT_POLICY.stagnationPolicy.contextRepeats,
    },
  };
}

function readAutocycleSnapshot(snapshotPath) {
  return readJsonFileSafe(snapshotPath);
}

function readOriginMainShaSafe() {
  const sha = runCommand('git', ['rev-parse', 'origin/main'], { retryable: false });
  if (!sha.ok) return '';
  return String(sha.stdout || '').trim();
}

function computeForwardProgressFingerprint(ctx, failureClass, reason, options = {}) {
  const diff = runCommand('git', ['diff', '--name-status', '-M', '-C'], { retryable: false });
  const diffPayload = diff.ok ? String(diff.stdout || '').trim() : `DIFF_ERROR:${reason}`;
  const prNumber = Number.isInteger(options.prNumber)
    ? options.prNumber
    : (ctx.state?.prNumber ?? ctx.args?.prNumber ?? null);
  const originMainSha = String(options.originMainSha || '').trim();
  const payload = JSON.stringify({
    diffHash: hashString(diffPayload),
    allowlistHash: allowlistHash(ctx.allowlist),
    failureClass: failureClass || 'PASS',
    reason: reason || 'PASS',
    prNumber: Number.isInteger(prNumber) ? prNumber : null,
    originMainSha,
  });
  return hashString(payload);
}

function resolveStagnationRepeatLimit(policy, failureClass, reason) {
  if (failureClass !== 'HUMAN_REQUIRED') return 0;
  if (reason === 'BLOCK_FAIL_NEEDS_GPT_PATCH') return Number.MAX_SAFE_INTEGER;
  if (AUTOCYCLE_STAGNATION_NETWORK_REASONS.has(reason)) {
    return policy.stagnationPolicy.networkRepeats;
  }
  if (AUTOCYCLE_STAGNATION_CONTEXT_REASONS.has(reason)) {
    return policy.stagnationPolicy.contextRepeats;
  }
  return policy.stagnationPolicy.defaultRepeats;
}

function validatePatchPayload(patchPayload, ctx) {
  if (!patchPayload || typeof patchPayload !== 'object') {
    throw new RunnerStepFailure('BLOCK_FAIL', 'INVALID_PATCH_FILE', 'Patch payload must be a JSON object');
  }

  const patchTicketId = String(patchPayload.patchTicketId || '').trim();
  const mainTicketId = String(patchPayload.mainTicketId || '').trim();
  const instructions = String(patchPayload.instructions || '').trim();
  const allowedFiles = Array.isArray(patchPayload.allowedFiles) ? patchPayload.allowedFiles.map((p) => String(p || '').trim()).filter(Boolean) : [];
  const maxFiles = Number.parseInt(patchPayload.maxFiles, 10);
  const maxLines = Number.parseInt(patchPayload.maxLines, 10);

  if (!patchTicketId || !mainTicketId || !instructions) {
    throw new RunnerStepFailure('BLOCK_FAIL', 'INVALID_PATCH_FILE', 'patchTicketId, mainTicketId, and instructions are required');
  }
  if (mainTicketId !== ctx.ticketId) {
    throw new RunnerStepFailure('BLOCK_FAIL', 'PATCH_FILE_MISMATCH', `patch mainTicketId ${mainTicketId} does not match ticket ${ctx.ticketId}`);
  }
  if (!Array.isArray(allowedFiles) || allowedFiles.length === 0) {
    throw new RunnerStepFailure('BLOCK_FAIL', 'INVALID_PATCH_FILE', 'allowedFiles must be a non-empty array');
  }

  for (const filePath of allowedFiles) {
    if (!ctx.allowlist.includes(filePath)) {
      throw new RunnerStepFailure('BLOCK_FAIL', 'PATCH_CONSTRAINTS_EXCEEDED', `patch file outside allowlist: ${filePath}`);
    }
  }

  const policy = ctx.autocyclePolicy;
  if (!Number.isInteger(maxFiles) || maxFiles > policy.patchConstraints.maxFiles) {
    throw new RunnerStepFailure('BLOCK_FAIL', 'PATCH_CONSTRAINTS_EXCEEDED', `maxFiles exceeds policy limit ${policy.patchConstraints.maxFiles}`);
  }
  if (!Number.isInteger(maxLines) || maxLines > policy.patchConstraints.maxLines) {
    throw new RunnerStepFailure('BLOCK_FAIL', 'PATCH_CONSTRAINTS_EXCEEDED', `maxLines exceeds policy limit ${policy.patchConstraints.maxLines}`);
  }

  return {
    patchTicketId,
    mainTicketId,
    instructions,
    allowedFiles,
    maxFiles,
    maxLines,
  };
}

function initAutocycleContext(ctx) {
  const policy = readAutocyclePolicy();
  ctx.autocyclePolicy = policy;
  ctx.autocycleSnapshotPath = autocycleSnapshotPathForTicket(ctx.ticketId);
  const existing = readAutocycleSnapshot(ctx.autocycleSnapshotPath);
  const patchPayload = ctx.args.patchFile
    ? validatePatchPayload(readJsonFileSafe(path.resolve(process.cwd(), ctx.args.patchFile)), ctx)
    : null;

  const state = {
    batchTicketId: ctx.ticketId,
    baseSha: ctx.baseSha,
    inputHash: ctx.inputHash,
    determinismHash: ctx.determinismHash,
    envHash: ctx.envHash,
    hashSchemaVersion: ctx.hashSchemaVersion,
    mode: ctx.mode,
    tier: ctx.tier,
    allowlist: ctx.allowlist,
    planPath: ctx.planPath || '',
    planDigest: ctx.planDigest || 'none',
    localPipelineMode: Boolean(ctx.localPipelineMode),
    currentMainIndex: existing?.currentMainIndex || 1,
    currentPatchIndex: existing?.currentPatchIndex || 0,
    iterationCount: Number.isInteger(existing?.iterationCount) ? existing.iterationCount : 0,
    lastFailSummary: existing?.lastFailSummary || null,
    forwardProgressFingerprint: existing?.forwardProgressFingerprint || '',
    lastReason: existing?.lastReason || '',
    repeatCountForReason: Number.isInteger(existing?.repeatCountForReason) ? existing.repeatCountForReason : 0,
    lastOriginMainShaSeen: existing?.lastOriginMainShaSeen || '',
    currentStep: existing?.currentStep || 'autocycle_init',
    patchTicketId: existing?.patchTicketId || '',
    cacheReuse: false,
    envHashMismatch: false,
    cachedRunResult: existing?.cachedRunResult || null,
    updatedAtUtc: nowUtcIso(),
  };

  if (state.currentMainIndex > policy.maxMainTzPerBatch) {
      throw new RunnerStepFailure(
        'HUMAN_REQUIRED',
        'MAIN_TZ_LIMIT_REACHED',
        `main ticket index ${state.currentMainIndex} exceeds max ${policy.maxMainTzPerBatch}`,
        { resumeFromStep: ctx.args.resumeFromStep ?? (ctx.localPipelineMode ? 4 : DEFAULT_PR_RESUME_STEP) },
      );
  }

  if (patchPayload) {
    const samePatch = state.patchTicketId && state.patchTicketId === patchPayload.patchTicketId;
    if (!samePatch) {
      state.currentPatchIndex += 1;
      state.patchTicketId = patchPayload.patchTicketId;
    }
    if (state.currentPatchIndex > policy.maxPatchPerMain) {
      throw new RunnerStepFailure(
        'HUMAN_REQUIRED',
        'PATCH_LIMIT_REACHED',
        `patch index ${state.currentPatchIndex} exceeds max ${policy.maxPatchPerMain}`,
        { resumeFromStep: ctx.args.resumeFromStep ?? (ctx.localPipelineMode ? 4 : DEFAULT_PR_RESUME_STEP) },
      );
    }
  }

  state.iterationCount += 1;
  const existingDeterminismHash = String(existing?.determinismHash || existing?.inputHash || '');
  const existingEnvHash = String(existing?.envHash || '');
  state.cacheReuse = Boolean(existingDeterminismHash && existingDeterminismHash === ctx.determinismHash);
  state.envHashMismatch = Boolean(state.cacheReuse && existingEnvHash && existingEnvHash !== ctx.envHash);

  ctx.autocycleState = state;
  ctx.autocyclePatch = patchPayload;
  ctx.cacheReuse = state.cacheReuse;
  ctx.envHashMismatch = state.envHashMismatch;
  ctx.cachedRunResult = state.cacheReuse ? state.cachedRunResult : null;
  writeJsonFile(ctx.autocycleSnapshotPath, state);
}

function ensureToolAvailable(name) {
  const probe = runCommand('which', [name], { retryable: false });
  if (!probe.ok) {
    throw new RunnerStepFailure(
      'BLOCK_FAIL',
      'TOOL_MISSING',
      `${name} is required but not found in PATH`,
      { evidenceTail: probe.evidenceTail },
    );
  }
}

function snapshotPathForTicket(ticketId) {
  return path.resolve(process.cwd(), SNAPSHOT_ROOT, `${sanitizeTicketId(ticketId)}.resume.json`);
}

function readSnapshot(snapshotPath) {
  if (!fs.existsSync(snapshotPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeSnapshot(snapshotPath, state) {
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  fs.writeFileSync(snapshotPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function removeSnapshot(snapshotPath) {
  if (fs.existsSync(snapshotPath)) {
    fs.unlinkSync(snapshotPath);
  }
}

function gitCurrentBranch() {
  const result = runCommand('git', ['branch', '--show-current'], { retryable: false, requireSuccess: true });
  return String(result.stdout || '').trim();
}

function gitRevParse(ref) {
  const result = runCommand('git', ['rev-parse', ref], { retryable: false, requireSuccess: true });
  return String(result.stdout || '').trim();
}

function parseGhJson(result, reasonOnParseFail) {
  const text = String(result.stdout || '').trim();
  try {
    return JSON.parse(text);
  } catch {
    throw new RunnerStepFailure(
      'BLOCK_FAIL',
      reasonOnParseFail || 'GH_JSON_PARSE_FAILED',
      'Failed to parse gh JSON output',
      { evidenceTail: tailLines(text) },
    );
  }
}

function createPrBodyTempFile(ticketId, branch) {
  const body = [
    `Runner ticket: ${ticketId}`,
    '',
    'Auto-generated by codex-run.mjs (non-interactive body-file mode).',
    `Branch: ${branch}`,
  ].join('\n');
  const tempPath = path.join(os.tmpdir(), `codex-pr-body-${sanitizeTicketId(ticketId)}-${Date.now()}.md`);
  fs.writeFileSync(tempPath, `${body}\n`, 'utf8');
  return tempPath;
}

function branchProtectionClickList(prUrl, resumeFromStep) {
  return [
    {
      id: 'click-01',
      surface: 'github_ui',
      action: 'Open PR checks and approvals',
      target: prUrl || 'https://github.com',
      expectedResult: 'All required checks and approvals are visible',
      resumeFromStep: String(resumeFromStep),
    },
    {
      id: 'click-02',
      surface: 'github_ui',
      action: 'Satisfy required branch protection gates',
      target: prUrl || 'https://github.com',
      expectedResult: 'PR becomes mergeable by policy',
      resumeFromStep: String(resumeFromStep),
    },
    {
      id: 'click-03',
      surface: 'github_ui',
      action: 'Return control to runner',
      target: prUrl || 'https://github.com',
      expectedResult: 'Runner can resume merge from saved step',
      resumeFromStep: String(resumeFromStep),
    },
  ];
}

function toStepFailureFromCommand(commandFailure, detail, options = {}) {
  if (commandFailure.classification.failureClass === 'HUMAN_REQUIRED') {
    return new RunnerStepFailure(
      'HUMAN_REQUIRED',
      commandFailure.classification.reason,
      detail,
      {
        evidenceTail: commandFailure.evidenceTail,
        resumeFromStep: Number.isInteger(options.resumeFromStep) ? options.resumeFromStep : null,
        handoffReason: options.handoffReason || commandFailure.classification.reason,
        clickList: Array.isArray(options.clickList) ? options.clickList : [],
      },
    );
  }

  if (commandFailure.classification.failureClass === 'RETRYABLE_FAIL') {
    return new RunnerStepFailure(
      'HUMAN_REQUIRED',
      'NETWORK_UNSTABLE',
      detail,
      {
        evidenceTail: commandFailure.evidenceTail,
        resumeFromStep: Number.isInteger(options.resumeFromStep) ? options.resumeFromStep : null,
        handoffReason: options.handoffReason || 'NETWORK_UNSTABLE',
        clickList: Array.isArray(options.clickList) ? options.clickList : [],
      },
    );
  }

  return new RunnerStepFailure(
    'BLOCK_FAIL',
    options.blockReason || commandFailure.classification.reason,
    detail,
    { evidenceTail: commandFailure.evidenceTail },
  );
}

function shouldRunPrFlow(args, snapshotExists) {
  if (args.mode !== 'pr') return false;
  return true;
}

function stepRestoreOrInitState(ctx) {
  const existing = readSnapshot(ctx.snapshotPath);
  const defaultResumeStep = ctx.localPipelineMode ? 4 : DEFAULT_PR_RESUME_STEP;
  if (ctx.args.resumeFromStep !== null && !existing) {
    throw new RunnerStepFailure(
      'BLOCK_FAIL',
      'RESUME_SNAPSHOT_MISSING',
      `Resume snapshot missing at ${ctx.snapshotPath}`,
      { resumeFromStep: ctx.args.resumeFromStep, evidenceTail: [ctx.snapshotPath] },
    );
  }

  const branch = gitCurrentBranch();
  const headSha = gitRevParse('HEAD');
  const originMainSha = gitRevParse('origin/main');
  const baseSha = existing?.baseSha || originMainSha;

  if (existing && existing.baseSha && existing.baseSha !== originMainSha) {
    throw new RunnerStepFailure(
        'HUMAN_REQUIRED',
        'BASE_CHANGED',
        `origin/main moved from ${existing.baseSha} to ${originMainSha}`,
      { resumeFromStep: existing.resumeFromStep || defaultResumeStep, evidenceTail: [existing.baseSha, originMainSha] },
    );
  }

  if (existing?.branch) {
    const branchProbe = runCommand('git', ['rev-parse', '--verify', existing.branch], { retryable: false });
    if (!branchProbe.ok) {
      throw new RunnerStepFailure(
        'HUMAN_REQUIRED',
        'BRANCH_MISSING',
        `resume branch missing: ${existing.branch}`,
        { resumeFromStep: existing.resumeFromStep || defaultResumeStep, evidenceTail: branchProbe.evidenceTail },
      );
    }
  }

  const state = {
    ticketId: ctx.ticketId,
    mode: ctx.mode,
    inputHash: ctx.inputHash,
    determinismHash: ctx.determinismHash,
    envHash: ctx.envHash,
    hashSchemaVersion: ctx.hashSchemaVersion,
    tier: ctx.tier,
    allowlist: ctx.allowlist,
    planPath: existing?.planPath || ctx.planPath || '',
    planDigest: existing?.planDigest || ctx.planDigest || 'none',
    localPipelineMode: Boolean(existing?.localPipelineMode ?? ctx.localPipelineMode),
    baseSha,
    headSha,
    branch,
    branchName: existing?.branchName || '',
    prNumber: existing?.prNumber ?? null,
    prUrl: existing?.prUrl ?? '',
    currentStep: existing?.currentStep || existing?.stepId || 'restore_or_init_state',
    stepId: existing?.stepId || existing?.currentStep || 'restore_or_init_state',
    requiredChecksState: existing?.requiredChecksState || 'unknown',
    antiSwapVerified: Boolean(existing?.antiSwapVerified),
    resumeFromStep: existing?.resumeFromStep ?? defaultResumeStep,
    lastCompletedStep: Number.isInteger(existing?.lastCompletedStep) ? existing.lastCompletedStep : 2,
    createdAtUtc: existing?.createdAtUtc || nowUtcIso(),
  };

  if (ctx.args.prNumber !== null) {
    state.prNumber = ctx.args.prNumber;
  }

  if (ctx.args.resumeFromStep !== null) {
    if (Number.isInteger(existing?.lastCompletedStep) && ctx.args.resumeFromStep < existing.lastCompletedStep + 1) {
      throw new RunnerStepFailure(
        'BLOCK_FAIL',
        'RESUME_STEP_BEHIND_SNAPSHOT',
        `resume-from-step=${ctx.args.resumeFromStep} is behind lastCompletedStep=${existing.lastCompletedStep}`,
        { resumeFromStep: existing.lastCompletedStep + 1 },
      );
    }
    state.resumeFromStep = ctx.args.resumeFromStep;
  }

  ctx.state = state;
  writeSnapshot(ctx.snapshotPath, state);

  return {
    summary: `state initialized at step ${state.resumeFromStep} (${ctx.snapshotPath})`,
  };
}

function applyCachedDeterminismOutcome(ctx) {
  if (!ctx.autocycleEnabled || !ctx.cacheReuse || !ctx.cachedRunResult || ctx.args.resumeFromStep !== null) {
    return null;
  }
  const cached = ctx.cachedRunResult;
  emitStepEvent({
    traceId: ctx.traceId,
    ticketId: ctx.ticketId,
    mode: ctx.mode,
    stepId: 'cache_reuse',
    command: 'internal',
    exitCode: 0,
    durationMs: 0,
    summary: `cacheReuse=true for determinismHash ${ctx.determinismHash}`,
    failureClass: null,
    reason: '',
  });

  if (!cached.failureClass || cached.reason === 'PASS') {
    return { kind: 'pass' };
  }

  const failureClass = String(cached.failureClass || 'HUMAN_REQUIRED');
  const reason = String(cached.reason || 'RUNNER_STEP_FAILED');
  const detail = String(cached.detail || `reused cached ${failureClass}/${reason}`);
  const resumeFromStep = Number.isInteger(cached.resumeFromStep)
    ? cached.resumeFromStep
    : (ctx.localPipelineMode ? 4 : DEFAULT_PR_RESUME_STEP);
  const clickList = Array.isArray(cached.clickList) ? cached.clickList : [];
  const handoffReason = cached.handoffReason ? String(cached.handoffReason) : '';
  const evidenceTail = Array.isArray(cached.evidenceTail) ? cached.evidenceTail : [];

  return {
    kind: 'failure',
    error: new RunnerStepFailure(failureClass, reason, detail, {
      resumeFromStep,
      clickList,
      handoffReason,
      evidenceTail,
    }),
  };
}

function stepLocalDiscovery(ctx) {
  const plan = loadPlanOrThrow(ctx);
  ctx.localPlan = plan;
  ctx.state.planPath = ctx.planPath;
  ctx.state.planDigest = planDigest(plan);
  writeSnapshot(ctx.snapshotPath, ctx.state);
  return { summary: `plan loaded (${plan.changes.length} changes)` };
}

function stepLocalFreeze(ctx) {
  if (!ctx.localPlan) {
    throw new RunnerStepFailure('BLOCK_FAIL', 'PLAN_INVALID', 'local plan is not loaded');
  }
  const frozenAllowlist = [...new Set(ctx.localPlan.changes.map((item) => item.path))].sort();
  ctx.allowlist = frozenAllowlist;
  ctx.state.allowlist = frozenAllowlist;
  ctx.state.frozenAllowlistHash = allowlistHash(frozenAllowlist);
  writeSnapshot(ctx.snapshotPath, ctx.state);
  return { summary: `allowlist frozen (${frozenAllowlist.length} paths)` };
}

function stepApplyPlan(ctx) {
  if (!ctx.localPlan) {
    throw new RunnerStepFailure('BLOCK_FAIL', 'PLAN_INVALID', 'local plan is not loaded');
  }
  const applied = [];
  for (const change of ctx.localPlan.changes) {
    if (!ctx.allowlist.includes(change.path)) {
      throw new RunnerStepFailure('BLOCK_FAIL', 'SCOPE_DRIFT', `plan path outside frozen allowlist: ${change.path}`);
    }
    const absolutePath = path.resolve(process.cwd(), change.path);
    if (change.operation === 'delete') {
      if (fs.existsSync(absolutePath)) {
        fs.rmSync(absolutePath, { force: true });
      }
      applied.push(change.path);
      continue;
    }
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, change.content, 'utf8');
    applied.push(change.path);
  }
  assertCacheInvariantOrThrow();
  ctx.state.appliedPlanPaths = applied;
  writeSnapshot(ctx.snapshotPath, ctx.state);
  return { summary: `plan applied (${applied.length} paths)` };
}

function runGateOrThrow(command, args, reasonCode, resumeFromStep) {
  const gate = runCommand(command, args, { retryable: true });
  if (gate.ok) return gate;
  if (gate.classification.failureClass === 'RETRYABLE_FAIL') {
    throw new RunnerStepFailure('HUMAN_REQUIRED', 'NETWORK_UNSTABLE', `${reasonCode} failed after retries`, {
      evidenceTail: gate.evidenceTail,
      resumeFromStep,
    });
  }
  throw new RunnerStepFailure('BLOCK_FAIL', 'GATE_PACK_FAILED', `${reasonCode} failed`, {
    evidenceTail: gate.evidenceTail,
  });
}

function stepGatePackRun(ctx) {
  const governance = runGateOrThrow('node', ['scripts/ops/governance-change-detection.mjs', '--json'], 'GOVERNANCE_CHANGE_DETECTION', 7);
  const doctor = runGateOrThrow('node', ['scripts/doctor.mjs', '--strict'], 'DOCTOR_STRICT', 7);
  const devFast = runGateOrThrow('npm', ['run', 'dev:fast'], 'DEV_FAST', 7);
  ctx.state.gates = {
    governanceChangeDetectionExitCode: governance.status,
    doctorStrictExitCode: doctor.status,
    devFastExitCode: devFast.status,
  };
  writeSnapshot(ctx.snapshotPath, ctx.state);
  return { summary: 'gate pack passed' };
}

function ensureBranchCheckedOut(branchName) {
  const currentBranch = gitCurrentBranch();
  if (currentBranch === branchName) return;
  const exists = runCommand('git', ['rev-parse', '--verify', branchName], { retryable: false });
  if (exists.ok) {
    const checkout = runCommand('git', ['checkout', branchName], { retryable: false });
    if (!checkout.ok) {
      throw new RunnerStepFailure('BLOCK_FAIL', 'BRANCH_CHECKOUT_FAILED', `failed to checkout branch ${branchName}`, {
        evidenceTail: checkout.evidenceTail,
      });
    }
    return;
  }
  const create = runCommand('git', ['checkout', '-b', branchName], { retryable: false });
  if (!create.ok) {
    throw new RunnerStepFailure('BLOCK_FAIL', 'BRANCH_CREATE_FAILED', `failed to create branch ${branchName}`, {
      evidenceTail: create.evidenceTail,
    });
  }
}

function stepCreateBranchCommit(ctx) {
  let branchName = ticketBranchName(ctx.ticketId);
  try {
    ensureBranchCheckedOut(branchName);
  } catch (error) {
    const normalized = normalizeFailure(error);
    const evidenceLower = `${String(normalized.detail || '')}\n${Array.isArray(normalized.evidenceTail) ? normalized.evidenceTail.join('\n') : ''}`.toLowerCase();
    if (
      normalized.reason === 'BRANCH_CREATE_FAILED'
      && (evidenceLower.includes('operation not permitted') || evidenceLower.includes('permission denied'))
    ) {
      branchName = gitCurrentBranch();
    } else {
      throw normalized;
    }
  }
  ctx.state.branch = branchName;
  ctx.state.branchName = branchName;

  const stagePaths = Array.isArray(ctx.allowlist) ? ctx.allowlist : [];
  if (stagePaths.length > 0) {
    const add = runCommand('git', ['add', '--', ...stagePaths], { retryable: false });
    if (!add.ok) {
      throw new RunnerStepFailure('BLOCK_FAIL', 'CREATE_BRANCH_COMMIT_FAILED', 'failed to stage planned paths', {
        evidenceTail: add.evidenceTail,
      });
    }
  }

  const staged = runCommand('git', ['diff', '--cached', '--name-only'], { retryable: false });
  if (!staged.ok) {
    throw new RunnerStepFailure('BLOCK_FAIL', 'CREATE_BRANCH_COMMIT_FAILED', 'failed to inspect staged diff', {
      evidenceTail: staged.evidenceTail,
    });
  }
  const stagedPaths = String(staged.stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (stagedPaths.length > 0) {
    const commit = runCommand('git', ['commit', '-m', `chore(autocycle): apply plan for ${ctx.ticketId}`], { retryable: false });
    if (!commit.ok) {
      throw new RunnerStepFailure('BLOCK_FAIL', 'CREATE_BRANCH_COMMIT_FAILED', 'git commit failed for plan changes', {
        evidenceTail: commit.evidenceTail,
      });
    }
  }

  ctx.state.headSha = gitRevParse('HEAD');
  writeSnapshot(ctx.snapshotPath, ctx.state);
  return {
    summary: stagedPaths.length > 0
      ? `branch prepared with commit (${branchName})`
      : `branch prepared without file delta (${branchName})`,
  };
}

function parsePrUrlAndNumber(outputText) {
  const lines = tailLines(outputText, 20);
  const match = lines.join('\n').match(/https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/(\d+)/);
  if (!match) return { prNumber: null, prUrl: '' };
  return { prNumber: Number.parseInt(match[1], 10), prUrl: match[0] };
}

function stepPrCreate(ctx) {
  if (ctx.args.noCreatePr) {
    throw new RunnerStepFailure('HUMAN_REQUIRED', 'PR_CREATE_SKIPPED', '--no-create-pr set: stopping before PR create', {
      resumeFromStep: 9,
      handoffReason: 'PR_CREATE_SKIPPED',
    });
  }
  const branchName = String(ctx.state?.branchName || ctx.state?.branch || '').trim();
  if (!branchName) {
    throw new RunnerStepFailure('BLOCK_FAIL', 'PR_CREATE_FAILED', 'branch name missing before PR create');
  }

  const tempBody = createPrBodyTempFile(ctx.ticketId, branchName);
  let createResult = null;
  try {
    createResult = runCommand(
      'gh',
      [
        'pr',
        'create',
        '--base',
        'main',
        '--head',
        branchName,
        '--title',
        `chore(autocycle): ${ctx.ticketId}`,
        '--body-file',
        tempBody,
      ],
      { retryable: true },
    );
  } finally {
    if (fs.existsSync(tempBody)) fs.unlinkSync(tempBody);
  }

  if (!createResult.ok) {
    throw toStepFailureFromCommand(createResult, 'Unable to create PR', {
      resumeFromStep: 9,
      blockReason: 'PR_CREATE_FAILED',
    });
  }

  const parsed = parsePrUrlAndNumber(String(createResult.stdout || ''));
  if (!Number.isInteger(parsed.prNumber) || parsed.prNumber <= 0) {
    throw new RunnerStepFailure('BLOCK_FAIL', 'PR_CREATE_FAILED', 'unable to parse created PR number', {
      evidenceTail: tailLines(createResult.stdout || ''),
    });
  }

  ctx.state.prNumber = parsed.prNumber;
  ctx.state.prUrl = parsed.prUrl;
  writeSnapshot(ctx.snapshotPath, ctx.state);
  return { summary: `created PR #${parsed.prNumber}` };
}

function stepPrDiscovery(ctx, resumeFromStep = 4) {
  if (!ctx.state) {
    throw new RunnerStepFailure('BLOCK_FAIL', 'STATE_NOT_INITIALIZED', 'Runner state is not initialized');
  }

  let prNumber = ctx.state.prNumber;
  let prUrl = ctx.state.prUrl;

  if (prNumber === null) {
    throw new RunnerStepFailure(
      'HUMAN_REQUIRED',
      'PR_CONTEXT_MISSING',
      `PR context missing: provide --pr for branch ${ctx.state.branch || 'unknown'}`,
      {
        resumeFromStep,
        evidenceTail: [ctx.state.branch || 'unknown-branch'],
      },
    );
  }

  const lookup = runCommand(
    'gh',
    ['pr', 'view', String(prNumber), '--json', 'number,url,state,mergeable,baseRefName,headRefName,mergeStateStatus'],
    { retryable: true },
  );
  if (!lookup.ok) {
    throw toStepFailureFromCommand(lookup, `Unable to read PR #${prNumber}`, { resumeFromStep, blockReason: 'PR_DISCOVERY_FAILED' });
  }
  const parsed = parseGhJson(lookup, 'PR_DISCOVERY_JSON_PARSE_FAILED');
  prNumber = Number(parsed.number);
  prUrl = String(parsed.url || '');
  const prState = String(parsed.state || '').toUpperCase();
  if (prState !== 'OPEN') {
    throw new RunnerStepFailure('HUMAN_REQUIRED', 'PR_NOT_OPEN', `PR #${prNumber} is not open`, {
      resumeFromStep,
      evidenceTail: [prState],
    });
  }

  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    throw new RunnerStepFailure('BLOCK_FAIL', 'PR_DISCOVERY_FAILED', 'Unable to resolve PR number');
  }

  ctx.state.prNumber = prNumber;
  ctx.state.prUrl = prUrl;
  writeSnapshot(ctx.snapshotPath, ctx.state);

  return { summary: `resolved PR #${prNumber}` };
}

function stepRequiredChecksWait(ctx, stepId = 'required_checks_wait', resumeFromStep = 5) {
  if (!ctx.state?.prNumber) {
    throw new RunnerStepFailure('BLOCK_FAIL', 'PR_NUMBER_MISSING', 'PR number is required');
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < CHECKS_WAIT_TIMEOUT_MS) {
    const view = runCommand(
      'gh',
      ['pr', 'view', String(ctx.state.prNumber), '--json', 'number,url,state,statusCheckRollup,mergeStateStatus'],
      { retryable: true },
    );

    if (!view.ok) {
      throw toStepFailureFromCommand(view, `${stepId}: cannot read PR checks state`, { resumeFromStep, blockReason: 'REQUIRED_CHECKS_QUERY_FAILED' });
    }

    const parsed = parseGhJson(view, 'REQUIRED_CHECKS_JSON_PARSE_FAILED');
    const rollup = Array.isArray(parsed.statusCheckRollup) ? parsed.statusCheckRollup : [];
    const mergeStateStatus = String(parsed.mergeStateStatus || '').toUpperCase();
    let pending = false;

    for (const item of rollup) {
      const status = String(item?.status || item?.state || '').toUpperCase();
      const conclusion = String(item?.conclusion || item?.state || '').toUpperCase();
      if (['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE'].includes(conclusion)) {
        throw new RunnerStepFailure('BLOCK_FAIL', 'REQUIRED_CHECKS_FAILED', `${stepId}: required checks failed`, {
          evidenceTail: tailLines(JSON.stringify(item)),
        });
      }
      if (
        ['PENDING', 'IN_PROGRESS', 'QUEUED', 'WAITING', 'REQUESTED', 'EXPECTED'].includes(status)
        || ['PENDING', 'IN_PROGRESS', 'EXPECTED'].includes(conclusion)
      ) {
        pending = true;
      }
    }

    if (!pending && !['PENDING', 'BLOCKED', 'BEHIND'].includes(mergeStateStatus)) {
      ctx.state.requiredChecksState = 'pass';
      return { summary: `${stepId}: checks passed` };
    }

    ctx.state.requiredChecksState = 'pending';
    writeSnapshot(ctx.snapshotPath, ctx.state);
    sleepMs(CHECKS_WAIT_POLL_MS);
  }

  throw new RunnerStepFailure('HUMAN_REQUIRED', 'REQUIRED_CHECK_TIMEOUT', `${stepId}: checks wait timed out`, {
    resumeFromStep,
    handoffReason: 'REQUIRED_CHECK_TIMEOUT',
    clickList: branchProtectionClickList(ctx.state.prUrl, resumeFromStep),
  });
}

function stepAntiSwapVerify(ctx, resumeFromStep = 6) {
  const fetched = runCommand('git', ['fetch', 'origin'], { retryable: true });
  if (!fetched.ok) {
    if (fetched.classification.failureClass === 'RETRYABLE_FAIL') {
      throw new RunnerStepFailure('HUMAN_REQUIRED', 'NETWORK_UNSTABLE', 'anti-swap fetch retry exhausted', {
        evidenceTail: fetched.evidenceTail,
        resumeFromStep,
      });
    }
    throw new RunnerStepFailure(
      fetched.classification.failureClass,
      fetched.classification.reason,
      'anti-swap fetch failed',
      { evidenceTail: fetched.evidenceTail },
    );
  }

  const ancestor = runCommand('git', ['merge-base', '--is-ancestor', 'origin/main', 'HEAD'], { retryable: false });
  if (ancestor.ok) {
    ctx.state.antiSwapVerified = true;
    writeSnapshot(ctx.snapshotPath, ctx.state);
    return { summary: 'anti-swap verified', rebasePerformed: false };
  }

  const rebase = runCommand('git', ['rebase', 'origin/main'], { retryable: false });
  if (!rebase.ok) {
    const text = `${rebase.stdout}\n${rebase.stderr}`.toLowerCase();
    if (text.includes('conflict')) {
      throw new RunnerStepFailure('BLOCK_FAIL', 'REBASE_CONFLICT', 'auto-rebase conflict', {
        evidenceTail: rebase.evidenceTail,
      });
    }
    throw new RunnerStepFailure('BLOCK_FAIL', 'REBASE_FAILED', 'auto-rebase failed', {
      evidenceTail: rebase.evidenceTail,
    });
  }

  ctx.state.headSha = gitRevParse('HEAD');
  ctx.state.antiSwapVerified = true;
  writeSnapshot(ctx.snapshotPath, ctx.state);

  return { summary: 'anti-swap rebase applied', rebasePerformed: true };
}

function stepPrMerge(ctx, resumeFromStep = 7) {
  if (!ctx.state?.prNumber) {
    throw new RunnerStepFailure('BLOCK_FAIL', 'PR_NUMBER_MISSING', 'PR number is required');
  }

  const merge = runCommand(
    'gh',
    ['pr', 'merge', String(ctx.state.prNumber), '--merge', '--delete-branch=false'],
    { retryable: true },
  );

  if (merge.ok) {
    return { summary: `merge command finished for PR #${ctx.state.prNumber}` };
  }

  if (merge.classification.failureClass === 'HUMAN_REQUIRED') {
    throw new RunnerStepFailure(
      'HUMAN_REQUIRED',
      merge.classification.reason,
      'manual branch protection action required',
      {
        evidenceTail: merge.evidenceTail,
        resumeFromStep,
        handoffReason: merge.classification.reason,
        clickList: branchProtectionClickList(ctx.state.prUrl, resumeFromStep),
      },
    );
  }

  if (merge.classification.failureClass === 'RETRYABLE_FAIL') {
    throw new RunnerStepFailure('HUMAN_REQUIRED', 'NETWORK_UNSTABLE', 'merge retry exhausted', {
      evidenceTail: merge.evidenceTail,
      resumeFromStep,
    });
  }

  throw new RunnerStepFailure('BLOCK_FAIL', 'PR_MERGE_FAILED', 'gh pr merge failed', {
    evidenceTail: merge.evidenceTail,
  });
}

function stepPostMergeVerify(ctx, resumeFromStep = 8) {
  const view = runCommand(
    'gh',
    ['pr', 'view', String(ctx.state.prNumber), '--json', 'state,mergedAt,mergeCommit,url,number'],
    { retryable: true },
  );
  if (!view.ok) {
    throw toStepFailureFromCommand(view, 'Unable to read post-merge PR state', {
      resumeFromStep,
      blockReason: 'POST_MERGE_VIEW_FAILED',
    });
  }

  const parsed = parseGhJson(view, 'POST_MERGE_VIEW_PARSE_FAILED');
  const state = String(parsed.state || '').toUpperCase();
  const mergedAt = String(parsed.mergedAt || '');
  const mergeCommitSha = String(parsed?.mergeCommit?.oid || parsed?.mergeCommit || '').trim();

  if (state !== 'MERGED') {
    if (state === 'CLOSED' && !mergedAt) {
      throw new RunnerStepFailure('BLOCK_FAIL', 'PR_CLOSED_UNMERGED', 'PR closed without merge');
    }
    throw new RunnerStepFailure('HUMAN_REQUIRED', 'MERGE_PENDING', 'PR is not merged yet', {
      resumeFromStep,
      handoffReason: 'MERGE_PENDING',
      clickList: branchProtectionClickList(ctx.state.prUrl, resumeFromStep),
    });
  }

  ctx.state.mergeCommitSha = mergeCommitSha;
  ctx.state.mergedAtUtc = mergedAt;
  ctx.state.originMainShaAtMerge = gitRevParse('origin/main');
  writeSnapshot(ctx.snapshotPath, ctx.state);

  return {
    summary: `merged at ${mergedAt || 'unknown'} (${mergeCommitSha || 'sha-unavailable'})`,
  };
}

function stepPostMergeRunnerChecks(ctx, resumeFromStep = 9) {
  const checkoutMain = runCommand('git', ['checkout', 'main'], { retryable: false });
  if (!checkoutMain.ok) {
    throw new RunnerStepFailure('BLOCK_FAIL', 'POST_MERGE_MAIN_CHECKOUT_FAILED', 'git checkout main failed', {
      evidenceTail: checkoutMain.evidenceTail,
    });
  }

  const pullMain = runCommand('git', ['pull', '--ff-only', 'origin', 'main'], { retryable: true });
  if (!pullMain.ok) {
    if (pullMain.classification.failureClass === 'RETRYABLE_FAIL') {
      throw new RunnerStepFailure('HUMAN_REQUIRED', 'NETWORK_UNSTABLE', 'git pull retry exhausted', {
        evidenceTail: pullMain.evidenceTail,
        resumeFromStep,
      });
    }
    throw new RunnerStepFailure(
      pullMain.classification.failureClass,
      'POST_MERGE_MAIN_PULL_FAILED',
      'git pull --ff-only origin main failed',
      { evidenceTail: pullMain.evidenceTail },
    );
  }

  const runnerPath = path.resolve(process.cwd(), 'scripts/ops/codex-run.mjs');
  const help = runCommand(process.execPath, [runnerPath, '--help'], { retryable: false });
  if (!help.ok) {
    throw new RunnerStepFailure('BLOCK_FAIL', 'POST_MERGE_RUNNER_CHECK_FAILED', 'runner --help failed', {
      evidenceTail: help.evidenceTail,
    });
  }

  const smoke = runCommand(
    process.execPath,
    [runnerPath, '--ticket', 'TZ-SMOKE', '--mode', 'pr'],
    { retryable: false },
  );
  if (!smoke.ok) {
    throw new RunnerStepFailure('BLOCK_FAIL', 'POST_MERGE_RUNNER_CHECK_FAILED', 'runner smoke failed', {
      evidenceTail: smoke.evidenceTail,
    });
  }

  const smokeHasEvents = String(smoke.stdout || '').includes('"stepId":"complete"');
  if (!smokeHasEvents) {
    throw new RunnerStepFailure(
      'BLOCK_FAIL',
      'POST_MERGE_RUNNER_CHECK_FAILED',
      'runner smoke output missing expected JSON step events',
      { evidenceTail: tailLines(smoke.stdout, 8) },
    );
  }

  ctx.state.postMergeRunnerChecks = {
    helpExitCode: help.status,
    smokeExitCode: smoke.status,
  };
  writeSnapshot(ctx.snapshotPath, ctx.state);

  return { summary: 'post-merge runner checks passed' };
}

function stepScopeProof(ctx) {
  assertCacheInvariantOrThrow();

  const status = runCommand('git', ['status', '--porcelain', '--untracked-files=all'], { retryable: false });
  if (!status.ok) {
    throw new RunnerStepFailure('BLOCK_FAIL', 'SCOPE_PROOF_FAILED', 'git status failed', {
      evidenceTail: status.evidenceTail,
    });
  }

  const diff = runCommand('git', ['diff', '--name-status', '-M', '-C'], { retryable: false });
  if (!diff.ok) {
    throw new RunnerStepFailure('BLOCK_FAIL', 'SCOPE_PROOF_FAILED', 'git diff failed', {
      evidenceTail: diff.evidenceTail,
    });
  }

  const untracked = runCommand('git', ['ls-files', '--others', '--exclude-standard'], { retryable: false });
  if (!untracked.ok) {
    throw new RunnerStepFailure('BLOCK_FAIL', 'SCOPE_PROOF_FAILED', 'git ls-files failed', {
      evidenceTail: untracked.evidenceTail,
    });
  }

  const dirtyStatus = String(status.stdout || '').trim();
  const dirtyDiff = String(diff.stdout || '').trim();
  const dirtyUntracked = String(untracked.stdout || '').trim();

  if (dirtyStatus || dirtyDiff || dirtyUntracked) {
    throw new RunnerStepFailure('BLOCK_FAIL', 'SCOPE_PROOF_DIRTY', 'worktree not clean after runner flow', {
      evidenceTail: tailLines(`${dirtyStatus}\n${dirtyDiff}\n${dirtyUntracked}`, 12),
    });
  }

  return { summary: 'scope-proof clean' };
}

function changedFilesExact() {
  const diff = runCommand('git', ['diff', '--name-only'], { retryable: false });
  if (!diff.ok) return [];
  return String(diff.stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function emitFinalSummary(ctx) {
  const changedFiles = changedFilesExact();
  emitStepEvent({
    traceId: ctx.traceId,
    ticketId: ctx.ticketId,
    mode: ctx.mode,
    hashSchemaVersion: ctx.hashSchemaVersion,
    determinismHash: ctx.determinismHash,
    envHash: ctx.envHash,
    planPath: ctx.planPath || '',
    planDigest: ctx.planDigest || 'none',
    tier: ctx.tier,
    allowlist: ctx.allowlist,
    stepId: 'final_summary',
    command: 'internal',
    exitCode: ctx.exitCode,
    durationMs: nowMs() - ctx.startedAt,
    summary: ctx.reason || 'PASS',
    failureClass: ctx.failureClass,
    reason: ctx.reason,
    STOP_REQUIRED: ctx.stopRequired,
    HUMAN_ACTION_REQUIRED: ctx.humanActionRequired,
    resumeFromStep: ctx.resumeFromStep,
    handoffReason: ctx.handoffReason,
    clickList: ctx.clickList,
    prNumber: ctx.state?.prNumber || null,
    prUrl: ctx.state?.prUrl || '',
    mergeCommitSha: ctx.state?.mergeCommitSha || '',
    changedFilesExact: changedFiles,
    cacheReuse: Boolean(ctx.cacheReuse),
    autocycleEnabled: Boolean(ctx.autocycleEnabled),
    autocycleSnapshotPath: ctx.autocycleSnapshotPath || '',
    autocycleState: ctx.autocycleState || null,
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }

  const traceId = crypto.randomUUID();
  const ticketId = args.ticketId;
  const mode = args.mode;
  const snapshotPath = snapshotPathForTicket(ticketId);
  const snapshotExists = fs.existsSync(snapshotPath);
  const runPrFlow = shouldRunPrFlow(args, snapshotExists);
  const localPipelineMode = isLocalAutocyclePipeline(args);
  const resolvedPlanPath = localPipelineMode ? resolvePlanPath(ticketId, args.planPath || '') : '';
  const planForHash = localPipelineMode ? readPlanForHash(resolvedPlanPath) : null;
  const tier = localPipelineMode && typeof planForHash?.tier === 'string' && String(planForHash.tier).trim()
    ? String(planForHash.tier).trim().toUpperCase()
    : inferTier(mode);
  const allowlist = localPipelineMode && planForHash
    ? derivePlanAllowlist(planForHash)
    : parseAllowlist();
  const hashState = buildHashState({ mode, tier, allowlist, planPath: resolvedPlanPath, planPayload: planForHash });

  const ctx = {
    traceId,
    ticketId,
    mode,
    inputHash: hashState.determinismHash,
    determinismHash: hashState.determinismHash,
    envHash: hashState.envHash,
    hashSchemaVersion: hashState.hashSchemaVersion,
    lockfilePath: hashState.lockfilePath,
    lockfileHash: hashState.lockfileHash,
    changedFilesContentDigest: hashState.changedFilesContentDigest,
    runnerVersionSource: hashState.runnerVersionSource,
    planPath: hashState.planPath,
    planDigest: hashState.planDigest,
    tier,
    allowlist,
    localPipelineMode,
    localPlan: null,
    autocycleEnabled: Boolean(args.autocycle),
    autocyclePolicy: null,
    autocycleState: null,
    autocyclePatch: null,
    autocycleSnapshotPath: '',
    cacheReuse: false,
    envHashMismatch: false,
    cachedRunResult: null,
    baseSha: '',
    args,
    snapshotPath,
    startedAt: nowMs(),
    state: null,
    stopRequired: 0,
    humanActionRequired: 0,
    failureClass: null,
    reason: 'PASS',
    resumeFromStep: null,
    handoffReason: '',
    clickList: [],
    exitCode: 0,
  };

  const finalizeFailure = (failure) => {
    let mappedFailure = failure;
    if (
      ctx.autocycleEnabled
      && failure.failureClass === 'BLOCK_FAIL'
      && !AUTOCYCLE_HARD_BLOCK_REASONS.has(failure.reason)
    ) {
      mappedFailure = new RunnerStepFailure(
        'HUMAN_REQUIRED',
        'BLOCK_FAIL_NEEDS_GPT_PATCH',
        failure.detail,
        {
          evidenceTail: failure.evidenceTail,
          resumeFromStep: failure.resumeFromStep ?? ctx.state?.resumeFromStep ?? (ctx.localPipelineMode ? 4 : DEFAULT_PR_RESUME_STEP),
        },
      );
    }

    ctx.failureClass = mappedFailure.failureClass;
    ctx.reason = mappedFailure.reason;
    ctx.humanActionRequired = mappedFailure.failureClass === 'HUMAN_REQUIRED' ? 1 : 0;
    ctx.stopRequired = mappedFailure.failureClass === 'HUMAN_REQUIRED' ? 0 : 1;
    ctx.resumeFromStep = Number.isInteger(mappedFailure.resumeFromStep)
      ? mappedFailure.resumeFromStep
      : (ctx.state?.resumeFromStep || null);
    ctx.handoffReason = mappedFailure.handoffReason || mappedFailure.reason;
    ctx.clickList = Array.isArray(mappedFailure.clickList) ? mappedFailure.clickList : [];
    ctx.exitCode = ctx.stopRequired ? 1 : 0;

    if (ctx.state) {
      if (ctx.resumeFromStep !== null) {
        ctx.state.resumeFromStep = ctx.resumeFromStep;
      }
      writeSnapshot(ctx.snapshotPath, ctx.state);
    }

    if (ctx.autocycleEnabled && ctx.autocycleState) {
      const originMainSha = readOriginMainShaSafe();
      const fingerprint = computeForwardProgressFingerprint(
        ctx,
        ctx.failureClass,
        ctx.reason,
        { originMainSha, prNumber: ctx.state?.prNumber ?? ctx.args?.prNumber ?? null },
      );
      const previousFingerprint = String(ctx.autocycleState.forwardProgressFingerprint || '');
      const prevFail = ctx.autocycleState.lastFailSummary || null;
      const previousRepeatCount = Number.isInteger(ctx.autocycleState.repeatCountForReason)
        ? ctx.autocycleState.repeatCountForReason
        : 0;

      const repeated = previousFingerprint && previousFingerprint === fingerprint
        && prevFail
        && prevFail.failureClass === ctx.failureClass
        && prevFail.reason === ctx.reason;

      const repeatCountForReason = repeated ? previousRepeatCount + 1 : 0;
      const repeatLimit = resolveStagnationRepeatLimit(ctx.autocyclePolicy, ctx.failureClass, ctx.reason);
      const iterationExhausted = ctx.autocycleState.iterationCount > ctx.autocyclePolicy.maxIterationsTotal;

      if (
        iterationExhausted
        || (
          ctx.failureClass === 'HUMAN_REQUIRED'
          && ctx.reason !== 'BLOCK_FAIL_NEEDS_GPT_PATCH'
          && repeatCountForReason >= repeatLimit
        )
      ) {
        ctx.failureClass = 'HUMAN_REQUIRED';
        ctx.reason = 'STAGNATION_ESCALATE_GPT';
        ctx.humanActionRequired = 1;
        ctx.stopRequired = 0;
        ctx.exitCode = 0;
      }

      ctx.autocycleState.lastFailSummary = {
        failureClass: ctx.failureClass,
        reason: ctx.reason,
        resumeFromStep: ctx.resumeFromStep,
        atUtc: nowUtcIso(),
      };
      ctx.autocycleState.forwardProgressFingerprint = computeForwardProgressFingerprint(
        ctx,
        ctx.failureClass,
        ctx.reason,
        { originMainSha, prNumber: ctx.state?.prNumber ?? ctx.args?.prNumber ?? null },
      );
      ctx.autocycleState.lastReason = ctx.reason;
      ctx.autocycleState.repeatCountForReason = repeatCountForReason;
      ctx.autocycleState.lastOriginMainShaSeen = originMainSha;
      ctx.autocycleState.determinismHash = ctx.determinismHash;
      ctx.autocycleState.envHash = ctx.envHash;
      ctx.autocycleState.hashSchemaVersion = ctx.hashSchemaVersion;
      ctx.autocycleState.cacheReuse = Boolean(ctx.cacheReuse);
      ctx.autocycleState.cachedRunResult = {
        failureClass: ctx.failureClass,
        reason: ctx.reason,
        detail: mappedFailure.detail,
        resumeFromStep: ctx.resumeFromStep,
        handoffReason: ctx.handoffReason,
        clickList: ctx.clickList,
        evidenceTail: mappedFailure.evidenceTail,
      };
      ctx.autocycleState.updatedAtUtc = nowUtcIso();
      writeJsonFile(ctx.autocycleSnapshotPath, ctx.autocycleState);
    }
  };

  const finalizePass = () => {
    ctx.failureClass = null;
    ctx.reason = 'PASS';
    ctx.humanActionRequired = 0;
    ctx.stopRequired = 0;
    ctx.resumeFromStep = null;
    ctx.handoffReason = '';
    ctx.clickList = [];
    ctx.exitCode = 0;
    if (ctx.state?.mergeCommitSha) {
      removeSnapshot(ctx.snapshotPath);
    } else if (ctx.state) {
      writeSnapshot(ctx.snapshotPath, ctx.state);
    }
    if (ctx.autocycleEnabled && ctx.autocycleSnapshotPath) {
      removeSnapshot(ctx.autocycleSnapshotPath);
    }
  };

  let step = runStep(ctx, {
    stepId: 'validate_env',
    command: 'internal',
    handler: () => {
      if (!ticketId) {
        throw new RunnerStepFailure('BLOCK_FAIL', 'MISSING_TICKET', 'ticket is required');
      }
      if (!mode || !ALLOWED_MODES.has(mode)) {
        throw new RunnerStepFailure('BLOCK_FAIL', 'INVALID_MODE', 'mode is invalid');
      }
      if (args.resumeFromStep !== null && (!Number.isInteger(args.resumeFromStep) || args.resumeFromStep < 0 || args.resumeFromStep > 16)) {
        throw new RunnerStepFailure('BLOCK_FAIL', 'INVALID_RESUME_STEP', 'resume-from-step must be an integer in [0,16]');
      }
      if (args.patchFile && !args.autocycle) {
        throw new RunnerStepFailure('BLOCK_FAIL', 'INVALID_PATCH_FILE', '--patch-file requires --autocycle');
      }
      if (args.noCreatePr && mode !== 'pr') {
        throw new RunnerStepFailure('BLOCK_FAIL', 'INVALID_NO_CREATE_PR', '--no-create-pr requires --mode pr');
      }
      ensureToolAvailable('node');
      if (runPrFlow) {
        ensureToolAvailable('git');
        ensureToolAvailable('gh');
      }
      assertCacheInvariantOrThrow();
      if (ctx.autocycleEnabled) {
        ctx.baseSha = gitRevParse('origin/main');
        initAutocycleContext(ctx);
      }
      return { summary: 'arguments and tools validated' };
    },
  });
  if (!step.ok) {
    finalizeFailure(step.error);
    emitFinalSummary(ctx);
    process.exit(ctx.exitCode);
  }

  step = runStep(ctx, {
    stepId: 'print_contract',
    command: 'internal',
    handler: () => {
      emitStepEvent({
        traceId,
        ticketId,
        mode,
        contract: {
          version: RUNNER_VERSION,
          hashSchemaVersion: ctx.hashSchemaVersion,
          singleEntry: true,
          retryPolicy: 'max_2_retries_for_retryable_failures',
          inputHash: ctx.inputHash,
          determinismHash: ctx.determinismHash,
          envHash: ctx.envHash,
          lockfilePath: ctx.lockfilePath,
          lockfileHash: ctx.lockfileHash,
          changedFilesContentDigest: ctx.changedFilesContentDigest,
          planPath: ctx.planPath,
          planDigest: ctx.planDigest,
          runnerVersionSource: ctx.runnerVersionSource,
          cacheReuse: Boolean(ctx.cacheReuse),
          tier: ctx.tier,
          allowlist: ctx.allowlist,
          localPipelineMode: ctx.localPipelineMode,
          autocycleEnabled: ctx.autocycleEnabled,
          autocyclePolicy: ctx.autocyclePolicy,
          patchPayload: ctx.autocyclePatch,
          platform: `${os.platform()}/${os.arch()}`,
          supportsPrMergeResume: true,
          runPrFlow,
          noCreatePr: Boolean(args.noCreatePr),
        },
      });
      return { summary: 'contract emitted' };
    },
  });
  if (!step.ok) {
    finalizeFailure(step.error);
    emitFinalSummary(ctx);
    process.exit(ctx.exitCode);
  }

  step = runStep(ctx, {
    stepId: 'runner_readiness_probe',
    command: `${process.execPath} --version`,
    handler: () => {
      const probe = runCommand(process.execPath, ['--version'], { retryable: false });
      if (!probe.ok) {
        throw new RunnerStepFailure('BLOCK_FAIL', 'RUNNER_READINESS_FAILED', 'node readiness probe failed', {
          evidenceTail: probe.evidenceTail,
        });
      }
      return { summary: 'runner readiness probe passed' };
    },
  });
  if (!step.ok) {
    finalizeFailure(step.error);
    emitFinalSummary(ctx);
    process.exit(ctx.exitCode);
  }

  if (mode === 'pr' && !runPrFlow) {
    finalizeFailure(new RunnerStepFailure('BLOCK_FAIL', 'PR_FLOW_INVARIANT_BROKEN', 'mode=pr must execute PR flow'));
    emitFinalSummary(ctx);
    process.exit(ctx.exitCode);
  }

  if (runPrFlow) {
    step = runStep(ctx, {
      stepId: 'restore_or_init_state',
      command: 'internal',
      handler: () => stepRestoreOrInitState(ctx),
    });
    if (!step.ok) {
      finalizeFailure(step.error);
      emitFinalSummary(ctx);
      process.exit(ctx.exitCode);
    }
    if (ctx.envHashMismatch) {
      emitStepEvent({
        traceId,
        ticketId,
        mode,
        stepId: 'env_hash_warning',
        command: 'internal',
        exitCode: 0,
        durationMs: 0,
        summary: 'envHash mismatch detected; reuse kept by determinismHash policy',
        failureClass: null,
        reason: '',
      });
    }
    ctx.state.lastCompletedStep = 3;
    writeSnapshot(ctx.snapshotPath, ctx.state);

    const reused = applyCachedDeterminismOutcome(ctx);
    if (reused?.kind === 'pass') {
      finalizePass();
      emitStepEvent({
        traceId,
        ticketId,
        mode,
        stepId: 'complete',
        command: 'internal',
        exitCode: 0,
        durationMs: 0,
        summary: 'runner completed (cache reuse)',
        failureClass: null,
        reason: '',
      });
      emitFinalSummary(ctx);
      process.exit(0);
    }
    if (reused?.kind === 'failure') {
      finalizeFailure(reused.error);
      emitFinalSummary(ctx);
      process.exit(ctx.exitCode);
    }

    const startStep = Number.isInteger(ctx.args.resumeFromStep)
      ? ctx.args.resumeFromStep
      : (Number.isInteger(ctx.state.resumeFromStep) ? ctx.state.resumeFromStep : (ctx.localPipelineMode ? 4 : DEFAULT_PR_RESUME_STEP));
    if (ctx.localPipelineMode) {
      if (startStep <= 4) {
        step = runStep(ctx, {
          stepId: 'local_discovery',
          command: 'internal',
          handler: () => stepLocalDiscovery(ctx),
        });
        if (!step.ok) {
          finalizeFailure(step.error);
          emitFinalSummary(ctx);
          process.exit(ctx.exitCode);
        }
        ctx.state.lastCompletedStep = 4;
        writeSnapshot(ctx.snapshotPath, ctx.state);
      }
      if (startStep <= 5) {
        step = runStep(ctx, {
          stepId: 'local_freeze',
          command: 'internal',
          handler: () => stepLocalFreeze(ctx),
        });
        if (!step.ok) {
          finalizeFailure(step.error);
          emitFinalSummary(ctx);
          process.exit(ctx.exitCode);
        }
        ctx.state.lastCompletedStep = 5;
        writeSnapshot(ctx.snapshotPath, ctx.state);
      }
      if (startStep <= 6) {
        step = runStep(ctx, {
          stepId: 'apply_plan',
          command: 'internal',
          handler: () => stepApplyPlan(ctx),
        });
        if (!step.ok) {
          finalizeFailure(step.error);
          emitFinalSummary(ctx);
          process.exit(ctx.exitCode);
        }
        ctx.state.lastCompletedStep = 6;
        writeSnapshot(ctx.snapshotPath, ctx.state);
      }
      if (startStep <= 7) {
        step = runStep(ctx, {
          stepId: 'gate_pack_run',
          command: 'node scripts/ops/governance-change-detection.mjs --json && node scripts/doctor.mjs --strict && npm run dev:fast',
          handler: () => stepGatePackRun(ctx),
        });
        if (!step.ok) {
          finalizeFailure(step.error);
          emitFinalSummary(ctx);
          process.exit(ctx.exitCode);
        }
        ctx.state.lastCompletedStep = 7;
        writeSnapshot(ctx.snapshotPath, ctx.state);
      }
      if (startStep <= 8) {
        step = runStep(ctx, {
          stepId: 'create_branch_commit',
          command: 'git checkout -b <ticket-branch> && git add -- <allowlist> && git commit',
          handler: () => {
            if (ctx.args.noCreatePr) {
              return { summary: 'create_branch_commit skipped (--no-create-pr)' };
            }
            return stepCreateBranchCommit(ctx);
          },
        });
        if (!step.ok) {
          finalizeFailure(step.error);
          emitFinalSummary(ctx);
          process.exit(ctx.exitCode);
        }
        ctx.state.lastCompletedStep = 8;
        writeSnapshot(ctx.snapshotPath, ctx.state);
      }
      if (startStep <= 9) {
        step = runStep(ctx, {
          stepId: 'pr_create',
          command: 'gh pr create --body-file <temp>',
          handler: () => stepPrCreate(ctx),
        });
        if (!step.ok) {
          finalizeFailure(step.error);
          emitFinalSummary(ctx);
          process.exit(ctx.exitCode);
        }
        ctx.state.lastCompletedStep = 9;
        ctx.state.resumeFromStep = 10;
        writeSnapshot(ctx.snapshotPath, ctx.state);
      }
    }

    const lifecycleOffset = ctx.localPipelineMode ? 6 : 0;
    const prDiscoveryStep = 4 + lifecycleOffset;
    const requiredChecksStep = 5 + lifecycleOffset;
    const antiSwapStep = 6 + lifecycleOffset;
    const mergeStep = 7 + lifecycleOffset;
    const postMergeStep = 8 + lifecycleOffset;
    const postMergeChecksStep = 9 + lifecycleOffset;
    const scopeProofStep = 10 + lifecycleOffset;
    const lifecycleStart = Math.max(startStep, prDiscoveryStep);

    if (lifecycleStart <= prDiscoveryStep) {
      step = runStep(ctx, {
        stepId: 'pr_discovery',
        command: 'gh pr view|create',
        handler: () => stepPrDiscovery(ctx, prDiscoveryStep),
      });
      if (!step.ok) {
        finalizeFailure(step.error);
        emitFinalSummary(ctx);
        process.exit(ctx.exitCode);
      }
      ctx.state.lastCompletedStep = prDiscoveryStep;
      writeSnapshot(ctx.snapshotPath, ctx.state);
    }

    if (lifecycleStart <= requiredChecksStep) {
      step = runStep(ctx, {
        stepId: 'required_checks_wait',
        command: `gh pr view ${ctx.state.prNumber} --json statusCheckRollup`,
        handler: () => stepRequiredChecksWait(ctx, 'required_checks_wait', requiredChecksStep),
      });
      if (!step.ok) {
        finalizeFailure(step.error);
        emitFinalSummary(ctx);
        process.exit(ctx.exitCode);
      }
      ctx.state.lastCompletedStep = requiredChecksStep;
      writeSnapshot(ctx.snapshotPath, ctx.state);
    }

    if (lifecycleStart <= antiSwapStep) {
      step = runStep(ctx, {
        stepId: 'anti_swap_verify',
        command: 'git fetch origin && git merge-base --is-ancestor origin/main HEAD',
        handler: () => stepAntiSwapVerify(ctx, antiSwapStep),
      });
      if (!step.ok) {
        finalizeFailure(step.error);
        emitFinalSummary(ctx);
        process.exit(ctx.exitCode);
      }
      ctx.state.lastCompletedStep = antiSwapStep;
      writeSnapshot(ctx.snapshotPath, ctx.state);

      if (step.result?.rebasePerformed) {
        const checksAfterRebase = runStep(ctx, {
          stepId: 'required_checks_wait_after_rebase',
          command: `gh pr view ${ctx.state.prNumber} --json statusCheckRollup`,
          handler: () => stepRequiredChecksWait(ctx, 'required_checks_wait_after_rebase', requiredChecksStep),
        });
        if (!checksAfterRebase.ok) {
          finalizeFailure(checksAfterRebase.error);
          emitFinalSummary(ctx);
          process.exit(ctx.exitCode);
        }
        ctx.state.lastCompletedStep = antiSwapStep;
        writeSnapshot(ctx.snapshotPath, ctx.state);
      }
    }

    if (lifecycleStart <= mergeStep) {
      step = runStep(ctx, {
        stepId: 'pr_merge',
        command: `gh pr merge ${ctx.state.prNumber} --merge --delete-branch=false`,
        handler: () => stepPrMerge(ctx, mergeStep),
      });
      if (!step.ok) {
        finalizeFailure(step.error);
        emitFinalSummary(ctx);
        process.exit(ctx.exitCode);
      }
      ctx.state.lastCompletedStep = mergeStep;
      writeSnapshot(ctx.snapshotPath, ctx.state);
    }

    if (lifecycleStart <= postMergeStep) {
      step = runStep(ctx, {
        stepId: 'post_merge_verify',
        command: `gh pr view ${ctx.state.prNumber} --json state,mergedAt,mergeCommit,url,number`,
        handler: () => stepPostMergeVerify(ctx, postMergeStep),
      });
      if (!step.ok) {
        finalizeFailure(step.error);
        emitFinalSummary(ctx);
        process.exit(ctx.exitCode);
      }
      ctx.state.lastCompletedStep = postMergeStep;
      writeSnapshot(ctx.snapshotPath, ctx.state);
    }

    if (lifecycleStart <= postMergeChecksStep) {
      step = runStep(ctx, {
        stepId: 'post_merge_runner_checks',
        command: 'git checkout main && git pull --ff-only origin main && node codex-run --help/smoke',
        handler: () => stepPostMergeRunnerChecks(ctx, postMergeChecksStep),
      });
      if (!step.ok) {
        finalizeFailure(step.error);
        emitFinalSummary(ctx);
        process.exit(ctx.exitCode);
      }
      ctx.state.lastCompletedStep = postMergeChecksStep;
      writeSnapshot(ctx.snapshotPath, ctx.state);
    }

    if (lifecycleStart <= scopeProofStep) {
      step = runStep(ctx, {
        stepId: 'scope_proof',
        command: 'git status --porcelain --untracked-files=all',
        handler: () => stepScopeProof(ctx),
      });
      if (!step.ok) {
        finalizeFailure(step.error);
        emitFinalSummary(ctx);
        process.exit(ctx.exitCode);
      }
      ctx.state.lastCompletedStep = scopeProofStep;
      writeSnapshot(ctx.snapshotPath, ctx.state);
    }
  }

  finalizePass();
  emitStepEvent({
    traceId,
    ticketId,
    mode,
    stepId: 'complete',
    command: 'internal',
    exitCode: 0,
    durationMs: 0,
    summary: runPrFlow ? 'runner completed (pr flow)' : 'runner completed (readiness flow)',
    failureClass: null,
    reason: '',
  });
  emitFinalSummary(ctx);
  process.exit(0);
}

main();
