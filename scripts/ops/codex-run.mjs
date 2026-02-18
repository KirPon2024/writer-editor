#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const ALLOWED_MODES = new Set(['dev', 'pr', 'release', 'promotion']);
const RUNNER_VERSION = 'v0.4.0-runner-stabilization-02';
const DEFAULT_PR_RESUME_STEP = 5;
const SNAPSHOT_ROOT = path.join('docs', 'OPS', 'CACHE', 'codex-run');
const RETRY_DELAY_MS = 2000;
const GH_TIMEOUT_MS = 30000;
const CHECKS_WAIT_TIMEOUT_MS = 10 * 60 * 1000;
const CHECKS_WAIT_POLL_MS = 20 * 1000;

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
      '  node scripts/ops/codex-run.mjs --ticket <TICKET_ID> --mode <dev|pr|release|promotion> [--pr <NUMBER>] [--resume-from-step <N>]',
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

function sleepMs(durationMs) {
  const ms = Math.max(0, Number(durationMs) || 0);
  if (ms === 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
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
    return { failureClass: 'HUMAN_REQUIRED', reason: 'BRANCH_PROTECTION_WAIT' };
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
    writeSnapshot(ctx.snapshotPath, ctx.state);
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

function inputHash(ticketId, mode, args) {
  const payload = JSON.stringify({
    ticketId,
    mode,
    prNumber: args.prNumber || null,
    resumeFromStep: args.resumeFromStep,
    node: process.version,
    platform: {
      os: process.platform,
      arch: process.arch,
      locale: Intl.DateTimeFormat().resolvedOptions().locale,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
    },
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
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
  if (args.prNumber !== null) return true;
  if (args.resumeFromStep !== null) return true;
  if (snapshotExists) return true;
  return process.env.CODEX_RUN_FORCE_PR_FLOW === '1';
}

function stepRestoreOrInitState(ctx) {
  const existing = readSnapshot(ctx.snapshotPath);
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
      { resumeFromStep: existing.resumeFromStep || DEFAULT_PR_RESUME_STEP, evidenceTail: [existing.baseSha, originMainSha] },
    );
  }

  if (existing?.branch) {
    const branchProbe = runCommand('git', ['rev-parse', '--verify', existing.branch], { retryable: false });
    if (!branchProbe.ok) {
      throw new RunnerStepFailure(
        'HUMAN_REQUIRED',
        'BRANCH_MISSING',
        `resume branch missing: ${existing.branch}`,
        { resumeFromStep: existing.resumeFromStep || DEFAULT_PR_RESUME_STEP, evidenceTail: branchProbe.evidenceTail },
      );
    }
  }

  const state = {
    ticketId: ctx.ticketId,
    mode: ctx.mode,
    baseSha,
    headSha,
    branch,
    prNumber: existing?.prNumber ?? null,
    prUrl: existing?.prUrl ?? '',
    stepId: existing?.stepId || 'restore_or_init_state',
    requiredChecksState: existing?.requiredChecksState || 'unknown',
    antiSwapVerified: Boolean(existing?.antiSwapVerified),
    resumeFromStep: existing?.resumeFromStep ?? DEFAULT_PR_RESUME_STEP,
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

function stepPrDiscovery(ctx) {
  if (!ctx.state) {
    throw new RunnerStepFailure('BLOCK_FAIL', 'STATE_NOT_INITIALIZED', 'Runner state is not initialized');
  }

  let prNumber = ctx.state.prNumber;
  let prUrl = ctx.state.prUrl;

  if (prNumber !== null) {
    const lookup = runCommand(
      'gh',
      ['pr', 'view', String(prNumber), '--json', 'number,url,state,mergeable,baseRefName,headRefName,mergeStateStatus'],
      { retryable: true },
    );
    if (!lookup.ok) {
      throw toStepFailureFromCommand(lookup, `Unable to read PR #${prNumber}`, { resumeFromStep: 4, blockReason: 'PR_DISCOVERY_FAILED' });
    }
    const parsed = parseGhJson(lookup, 'PR_DISCOVERY_JSON_PARSE_FAILED');
    prNumber = Number(parsed.number);
    prUrl = String(parsed.url || '');
    const prState = String(parsed.state || '').toUpperCase();
    if (prState !== 'OPEN') {
      throw new RunnerStepFailure('HUMAN_REQUIRED', 'PR_NOT_OPEN', `PR #${prNumber} is not open`, {
        resumeFromStep: 4,
        evidenceTail: [prState],
      });
    }
  } else {
    const byBranch = runCommand(
      'gh',
      ['pr', 'view', ctx.state.branch, '--json', 'number,url,state,mergeable,baseRefName,headRefName,mergeStateStatus'],
      { retryable: true },
    );

    if (byBranch.ok) {
      const parsed = parseGhJson(byBranch, 'PR_DISCOVERY_JSON_PARSE_FAILED');
      prNumber = Number(parsed.number);
      prUrl = String(parsed.url || '');
    } else {
      const errorText = `${byBranch.stdout}\n${byBranch.stderr}`.toLowerCase();
      const noPrFound = errorText.includes('no pull requests found');

      if (noPrFound && ctx.state.resumeFromStep >= DEFAULT_PR_RESUME_STEP) {
        throw new RunnerStepFailure(
          'BLOCK_FAIL',
          'PR_NOT_FOUND_FOR_RESUME',
          `No PR found for branch ${ctx.state.branch}`,
          { evidenceTail: byBranch.evidenceTail, resumeFromStep: ctx.state.resumeFromStep },
        );
      }

      if (!noPrFound) {
        throw toStepFailureFromCommand(byBranch, `Failed to discover PR for branch ${ctx.state.branch}`, { resumeFromStep: 4, blockReason: 'PR_DISCOVERY_FAILED' });
      }

      const bodyPath = createPrBodyTempFile(ctx.ticketId, ctx.state.branch);
      try {
        const createResult = runCommand(
          'gh',
          [
            'pr',
            'create',
            '--base',
            'main',
            '--head',
            ctx.state.branch,
            '--title',
            `chore(ops): ${ctx.ticketId}`,
            '--body-file',
            bodyPath,
          ],
          { retryable: true },
        );
        if (!createResult.ok) {
          throw toStepFailureFromCommand(createResult, `Failed to create PR for branch ${ctx.state.branch}`, { resumeFromStep: 4, blockReason: 'PR_CREATE_FAILED' });
        }

        const url = tailLines(createResult.stdout, 3).find((line) => line.includes('/pull/')) || '';
        prUrl = String(url).trim();

        const viewCreated = runCommand(
          'gh',
          ['pr', 'view', ctx.state.branch, '--json', 'number,url,state,mergeable,baseRefName,headRefName,mergeStateStatus'],
          { retryable: true },
        );
        if (!viewCreated.ok) {
          throw toStepFailureFromCommand(viewCreated, `Failed to read created PR for ${ctx.state.branch}`, { resumeFromStep: 4, blockReason: 'PR_DISCOVERY_FAILED' });
        }

        const parsedCreated = parseGhJson(viewCreated, 'PR_DISCOVERY_JSON_PARSE_FAILED');
        prNumber = Number(parsedCreated.number);
        prUrl = String(parsedCreated.url || prUrl || '');
      } finally {
        if (fs.existsSync(bodyPath)) fs.unlinkSync(bodyPath);
      }
    }
  }

  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    throw new RunnerStepFailure('BLOCK_FAIL', 'PR_DISCOVERY_FAILED', 'Unable to resolve PR number');
  }

  ctx.state.prNumber = prNumber;
  ctx.state.prUrl = prUrl;
  writeSnapshot(ctx.snapshotPath, ctx.state);

  return { summary: `resolved PR #${prNumber}` };
}

function stepRequiredChecksWait(ctx, stepId = 'required_checks_wait') {
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
      throw toStepFailureFromCommand(view, `${stepId}: cannot read PR checks state`, { resumeFromStep: 5, blockReason: 'REQUIRED_CHECKS_QUERY_FAILED' });
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
    resumeFromStep: 5,
    handoffReason: 'REQUIRED_CHECK_TIMEOUT',
    clickList: branchProtectionClickList(ctx.state.prUrl, 5),
  });
}

function stepAntiSwapVerify(ctx) {
  const fetched = runCommand('git', ['fetch', 'origin'], { retryable: true });
  if (!fetched.ok) {
    if (fetched.classification.failureClass === 'RETRYABLE_FAIL') {
      throw new RunnerStepFailure('HUMAN_REQUIRED', 'NETWORK_UNSTABLE', 'anti-swap fetch retry exhausted', {
        evidenceTail: fetched.evidenceTail,
        resumeFromStep: 6,
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

function stepPrMerge(ctx) {
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
        resumeFromStep: 7,
        handoffReason: merge.classification.reason,
        clickList: branchProtectionClickList(ctx.state.prUrl, 7),
      },
    );
  }

  if (merge.classification.failureClass === 'RETRYABLE_FAIL') {
    throw new RunnerStepFailure('HUMAN_REQUIRED', 'NETWORK_UNSTABLE', 'merge retry exhausted', {
      evidenceTail: merge.evidenceTail,
      resumeFromStep: 7,
    });
  }

  throw new RunnerStepFailure('BLOCK_FAIL', 'PR_MERGE_FAILED', 'gh pr merge failed', {
    evidenceTail: merge.evidenceTail,
  });
}

function stepPostMergeVerify(ctx) {
  const view = runCommand(
    'gh',
    ['pr', 'view', String(ctx.state.prNumber), '--json', 'state,mergedAt,mergeCommit,url,number'],
    { retryable: true },
  );
  if (!view.ok) {
    throw toStepFailureFromCommand(view, 'Unable to read post-merge PR state', {
      resumeFromStep: 8,
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
      resumeFromStep: 8,
      handoffReason: 'MERGE_PENDING',
      clickList: branchProtectionClickList(ctx.state.prUrl, 8),
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

function stepPostMergeRunnerChecks(ctx) {
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
        resumeFromStep: 9,
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
  const staged = runCommand('git', ['diff', '--cached', '--name-only'], { retryable: false });
  if (!staged.ok) {
    throw new RunnerStepFailure('BLOCK_FAIL', 'SCOPE_PROOF_FAILED', 'git diff --cached failed', {
      evidenceTail: staged.evidenceTail,
    });
  }
  const stagedFiles = String(staged.stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (stagedFiles.some((filePath) => filePath.startsWith('docs/OPS/CACHE/'))) {
    throw new RunnerStepFailure('BLOCK_FAIL', 'CACHE_SCOPE_LEAK', 'cache artifacts are staged', {
      evidenceTail: stagedFiles,
    });
  }

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

function emitFinalSummary(ctx) {
  emitStepEvent({
    traceId: ctx.traceId,
    ticketId: ctx.ticketId,
    mode: ctx.mode,
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

  const ctx = {
    traceId,
    ticketId,
    mode,
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
    ctx.failureClass = failure.failureClass;
    ctx.reason = failure.reason;
    ctx.humanActionRequired = failure.failureClass === 'HUMAN_REQUIRED' ? 1 : 0;
    ctx.stopRequired = failure.failureClass === 'HUMAN_REQUIRED' ? 0 : 1;
    ctx.resumeFromStep = Number.isInteger(failure.resumeFromStep)
      ? failure.resumeFromStep
      : (ctx.state?.resumeFromStep || null);
    ctx.handoffReason = failure.handoffReason || failure.reason;
    ctx.clickList = Array.isArray(failure.clickList) ? failure.clickList : [];
    ctx.exitCode = ctx.stopRequired ? 1 : 0;

    if (ctx.state) {
      if (ctx.resumeFromStep !== null) {
        ctx.state.resumeFromStep = ctx.resumeFromStep;
      }
      writeSnapshot(ctx.snapshotPath, ctx.state);
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
      if (args.resumeFromStep !== null && (!Number.isInteger(args.resumeFromStep) || args.resumeFromStep < 0 || args.resumeFromStep > 10)) {
        throw new RunnerStepFailure('BLOCK_FAIL', 'INVALID_RESUME_STEP', 'resume-from-step must be an integer in [0,10]');
      }
      ensureToolAvailable('node');
      if (runPrFlow) {
        ensureToolAvailable('git');
        ensureToolAvailable('gh');
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
          singleEntry: true,
          retryPolicy: 'max_2_retries_for_retryable_failures',
          inputHash: inputHash(ticketId, mode, args),
          platform: `${os.platform()}/${os.arch()}`,
          supportsPrMergeResume: true,
          runPrFlow,
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
    ctx.state.lastCompletedStep = 3;
    writeSnapshot(ctx.snapshotPath, ctx.state);

    step = runStep(ctx, {
      stepId: 'pr_discovery',
      command: 'gh pr view|create',
      handler: () => stepPrDiscovery(ctx),
    });
    if (!step.ok) {
      finalizeFailure(step.error);
      emitFinalSummary(ctx);
      process.exit(ctx.exitCode);
    }
    ctx.state.lastCompletedStep = 4;
    writeSnapshot(ctx.snapshotPath, ctx.state);

    const startStep = Number.isInteger(ctx.args.resumeFromStep)
      ? ctx.args.resumeFromStep
      : (Number.isInteger(ctx.state.resumeFromStep) ? ctx.state.resumeFromStep : DEFAULT_PR_RESUME_STEP);

    if (startStep <= 5) {
      step = runStep(ctx, {
        stepId: 'required_checks_wait',
        command: `gh pr view ${ctx.state.prNumber} --json statusCheckRollup`,
        handler: () => stepRequiredChecksWait(ctx),
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
        stepId: 'anti_swap_verify',
        command: 'git fetch origin && git merge-base --is-ancestor origin/main HEAD',
        handler: () => stepAntiSwapVerify(ctx),
      });
      if (!step.ok) {
        finalizeFailure(step.error);
        emitFinalSummary(ctx);
        process.exit(ctx.exitCode);
      }
      ctx.state.lastCompletedStep = 6;
      writeSnapshot(ctx.snapshotPath, ctx.state);

      if (step.result?.rebasePerformed) {
        const checksAfterRebase = runStep(ctx, {
          stepId: 'required_checks_wait_after_rebase',
          command: `gh pr view ${ctx.state.prNumber} --json statusCheckRollup`,
          handler: () => stepRequiredChecksWait(ctx, 'required_checks_wait_after_rebase'),
        });
        if (!checksAfterRebase.ok) {
          finalizeFailure(checksAfterRebase.error);
          emitFinalSummary(ctx);
          process.exit(ctx.exitCode);
        }
        ctx.state.lastCompletedStep = 6;
        writeSnapshot(ctx.snapshotPath, ctx.state);
      }
    }

    if (startStep <= 7) {
      step = runStep(ctx, {
        stepId: 'pr_merge',
        command: `gh pr merge ${ctx.state.prNumber} --merge --delete-branch=false`,
        handler: () => stepPrMerge(ctx),
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
        stepId: 'post_merge_verify',
        command: `gh pr view ${ctx.state.prNumber} --json state,mergedAt,mergeCommit,url,number`,
        handler: () => stepPostMergeVerify(ctx),
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
        stepId: 'post_merge_runner_checks',
        command: 'git checkout main && git pull --ff-only origin main && node codex-run --help/smoke',
        handler: () => stepPostMergeRunnerChecks(ctx),
      });
      if (!step.ok) {
        finalizeFailure(step.error);
        emitFinalSummary(ctx);
        process.exit(ctx.exitCode);
      }
      ctx.state.lastCompletedStep = 9;
      writeSnapshot(ctx.snapshotPath, ctx.state);
    }

    if (startStep <= 10) {
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
      ctx.state.lastCompletedStep = 10;
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
