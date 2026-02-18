#!/usr/bin/env node
import crypto from 'node:crypto';
import os from 'node:os';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const ALLOWED_MODES = new Set(['dev', 'pr', 'release', 'promotion']);

function usage() {
  process.stdout.write(
    [
      'Usage:',
      '  node scripts/ops/codex-run.mjs --ticket <TICKET_ID> --mode <dev|pr|release|promotion>',
      '  node scripts/ops/codex-run.mjs --help',
    ].join('\n') + '\n',
  );
}

function parseArgs(argv) {
  const out = {
    help: false,
    ticketId: '',
    mode: '',
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
  }

  return out;
}

function classifyFailure(detail) {
  const text = String(detail || '').toLowerCase();
  if (text.includes('module_not_found') || text.includes('cannot find module')) {
    return {
      failureClass: 'HUMAN_REQUIRED',
      reason: 'RUNNER_ENTRYPOINT_MISSING',
    };
  }
  if (text.includes('popup') || text.includes('permission') || text.includes('auth')) {
    return {
      failureClass: 'HUMAN_REQUIRED',
      reason: 'UI_PERMISSION',
    };
  }
  if (text.includes('network') || text.includes('timed out') || text.includes('econn')) {
    return {
      failureClass: 'RETRYABLE_FAIL',
      reason: 'NETWORK_TRANSIENT',
    };
  }
  return {
    failureClass: 'BLOCK_FAIL',
    reason: 'RUNNER_STEP_FAILED',
  };
}

function emitStepEvent(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function nowMs() {
  return Number(process.hrtime.bigint() / 1000000n);
}

function inputHash(ticketId, mode) {
  const payload = JSON.stringify({
    ticketId,
    mode,
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

function runStep({ traceId, ticketId, mode, stepId, command = 'internal', handler }) {
  const startedAt = nowMs();
  try {
    const summary = handler();
    emitStepEvent({
      traceId,
      ticketId,
      mode,
      stepId,
      command,
      exitCode: 0,
      durationMs: nowMs() - startedAt,
      summary,
      failureClass: null,
      reason: '',
    });
    return { ok: true };
  } catch (error) {
    const detail = String(error?.message || error || 'unknown_error');
    const classified = classifyFailure(detail);
    emitStepEvent({
      traceId,
      ticketId,
      mode,
      stepId,
      command,
      exitCode: 1,
      durationMs: nowMs() - startedAt,
      summary: 'step failed',
      failureClass: classified.failureClass,
      reason: classified.reason,
      detail,
    });
    return { ok: false, classified };
  }
}

function runRetryableCommand({ command, args, env }) {
  const first = spawnSync(command, args, { encoding: 'utf8', env: { ...process.env, ...env } });
  if (first.status === 0) return { status: 0, retries: 0, stderr: '' };
  const classified = classifyFailure(first.stderr || first.stdout);
  if (classified.failureClass !== 'RETRYABLE_FAIL') {
    return {
      status: first.status ?? 1,
      retries: 0,
      stderr: String(first.stderr || first.stdout || ''),
    };
  }
  const second = spawnSync(command, args, { encoding: 'utf8', env: { ...process.env, ...env } });
  return {
    status: second.status ?? 1,
    retries: 1,
    stderr: String(second.stderr || second.stdout || ''),
  };
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

  const validate = runStep({
    traceId,
    ticketId,
    mode,
    stepId: 'validate_env',
    handler: () => {
      if (!ticketId) {
        throw new Error('ticket is required');
      }
      if (!mode || !ALLOWED_MODES.has(mode)) {
        throw new Error('mode is invalid');
      }
      return 'arguments validated';
    },
  });
  if (!validate.ok) process.exit(1);

  const contract = runStep({
    traceId,
    ticketId,
    mode,
    stepId: 'print_contract',
    handler: () => {
      const hash = inputHash(ticketId, mode);
      const contractObj = {
        singleEntry: true,
        retryPolicy: 'single_retry_for_retryable_failures',
        inputHash: hash,
        platform: `${os.platform()}/${os.arch()}`,
      };
      process.stdout.write(`${JSON.stringify({ traceId, ticketId, mode, contract: contractObj })}\n`);
      return 'contract emitted';
    },
  });
  if (!contract.ok) process.exit(1);

  const readiness = runStep({
    traceId,
    ticketId,
    mode,
    stepId: 'runner_readiness_probe',
    command: `${process.execPath} --version`,
    handler: () => {
      const probe = runRetryableCommand({
        command: process.execPath,
        args: ['--version'],
      });
      if (probe.status !== 0) {
        throw new Error(probe.stderr || 'node_version_probe_failed');
      }
      return 'runner readiness probe passed';
    },
  });
  if (!readiness.ok) process.exit(1);

  emitStepEvent({
    traceId,
    ticketId,
    mode,
    stepId: 'complete',
    command: 'internal',
    exitCode: 0,
    durationMs: 0,
    summary: 'runner completed',
    failureClass: null,
    reason: '',
  });
  process.exit(0);
}

main();
