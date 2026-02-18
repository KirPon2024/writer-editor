#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { applyNonInteractiveEnv } from './bootstrap-noninteractive.mjs';

function printToken(key, value) {
  console.log(`${key}=${value}`);
}

function writeOutput(result) {
  if (result.stdout) process.stdout.write(String(result.stdout));
  if (result.stderr) process.stderr.write(String(result.stderr));
}

function classifyExternalReason(detail) {
  const text = String(detail || '').toLowerCase();
  if (text.includes('could not resolve host') || text.includes('name or service not known')) {
    return {
      failReason: 'NETWORK_UNAVAILABLE',
      oneTouch: 'node scripts/ops/network-gate.mjs --mode delivery --json',
    };
  }
  if (
    text.includes('authentication failed')
    || text.includes('permission denied')
    || text.includes('could not read username')
    || text.includes('access denied')
    || text.includes('repository not found')
  ) {
    return {
      failReason: 'GH_AUTH',
      oneTouch: 'gh auth login -h github.com',
    };
  }
  return {
    failReason: 'WAVE_EXTERNAL_FAILURE',
    oneTouch: 'GIT_TERMINAL_PROMPT=0 git fetch origin',
  };
}

function stopOutcome(failReason, oneTouch, statusCode = 1) {
  return {
    status: 'STOP_REQUIRED',
    failReason,
    oneTouch: oneTouch || 'NONE',
    promptDetection: 'NOT_DETECTED',
    exitCode: statusCode,
  };
}

function passOutcome() {
  return {
    status: 'PASS',
    failReason: 'null',
    oneTouch: 'NONE',
    promptDetection: 'NOT_DETECTED',
    exitCode: 0,
  };
}

function emitAndExit(outcome) {
  const status = typeof outcome.status === 'string' ? outcome.status : 'STOP_REQUIRED';
  const failReason = typeof outcome.failReason === 'string' ? outcome.failReason : 'UNKNOWN_FAILURE';
  const oneTouch = typeof outcome.oneTouch === 'string' && outcome.oneTouch.length > 0
    ? outcome.oneTouch
    : 'NONE';
  const promptDetection = typeof outcome.promptDetection === 'string' && outcome.promptDetection.length > 0
    ? outcome.promptDetection
    : 'NOT_DETECTED';
  const exitCode = Number.isInteger(outcome.exitCode)
    ? outcome.exitCode
    : (status === 'PASS' ? 0 : 1);

  printToken('STATUS', status);
  printToken('FAIL_REASON', failReason);
  printToken('ONE_TOUCH_NEXT_ACTION', oneTouch);
  printToken('PROMPT_DETECTION', promptDetection);
  console.log('PROMPT_LAYER=RUNNER_UI');
  process.exit(exitCode);
}

function runStep(step, env) {
  const result = spawnSync(step.cmd, step.args, {
    encoding: 'utf8',
    env,
  });
  writeOutput(result);
  if (result.status !== 0) {
    return {
      ok: false,
      detail: String(result.stderr || result.stdout || '').trim(),
      result,
    };
  }
  return { ok: true, detail: '', result };
}

function main() {
  const bootstrap = applyNonInteractiveEnv(process.env);
  if (!bootstrap.ok) {
    emitAndExit(stopOutcome('NON_INTERACTIVE_BOOTSTRAP_FAILED', 'node scripts/ops/bootstrap-noninteractive.mjs'));
  }

  const baseEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: bootstrap.gitAskPass,
    CI: '1',
  };

  const bootstrapStep = runStep(
    { cmd: process.execPath, args: ['scripts/ops/bootstrap-noninteractive.mjs'] },
    baseEnv,
  );
  if (!bootstrapStep.ok) {
    emitAndExit(stopOutcome('BOOTSTRAP_STEP_FAILED', 'node scripts/ops/bootstrap-noninteractive.mjs'));
  }

  const preflight = [
    { id: 'PREFLIGHT_FETCH', cmd: 'git', args: ['fetch', 'origin'] },
    { id: 'PREFLIGHT_CLEAN', cmd: 'git', args: ['clean', '-fd'] },
    { id: 'PREFLIGHT_CHECKOUT', cmd: 'git', args: ['checkout', '-B', 'main', 'origin/main'] },
    { id: 'PREFLIGHT_STATUS', cmd: 'git', args: ['status', '--porcelain', '--untracked-files=all'] },
  ];

  for (const step of preflight) {
    const result = runStep(step, baseEnv);
    if (!result.ok) {
      if (step.id === 'PREFLIGHT_FETCH') {
        const reason = classifyExternalReason(result.detail);
        emitAndExit(stopOutcome(reason.failReason, reason.oneTouch));
      }
      emitAndExit(stopOutcome(`${step.id}_FAILED`, `git ${step.args.join(' ')}`));
    }
    if (step.id === 'PREFLIGHT_STATUS') {
      const out = String(result.result.stdout || '').trim();
      if (out.length > 0) {
        emitAndExit(stopOutcome('DIRTY_WORKTREE', 'git status --porcelain --untracked-files=all'));
      }
    }
  }

  const checks = [
    { id: 'CHECK_MERGE_READINESS', cmd: process.execPath, args: ['scripts/ops/check-merge-readiness.mjs'] },
    { id: 'EMIT_OPS_SUMMARY', cmd: process.execPath, args: ['scripts/ops/emit-ops-summary.mjs'] },
    {
      id: 'DOCTOR_DELIVERY',
      cmd: process.execPath,
      args: ['scripts/doctor.mjs'],
      env: { DOCTOR_MODE: 'delivery' },
    },
  ];

  for (const step of checks) {
    const stepEnv = step.env ? { ...baseEnv, ...step.env } : baseEnv;
    const result = runStep(step, stepEnv);
    if (!result.ok) {
      emitAndExit(stopOutcome(`${step.id}_FAILED`, `${step.cmd} ${step.args.join(' ')}`));
    }
    if (step.id === 'DOCTOR_DELIVERY') {
      const stdout = String(result.result.stdout || '');
      if (stdout.includes('DOCTOR_WARN')) {
        emitAndExit(stopOutcome('DOCTOR_WARN_PRESENT', `${step.cmd} ${step.args.join(' ')}`));
      }
    }
  }

  emitAndExit(passOutcome());
}

main();
