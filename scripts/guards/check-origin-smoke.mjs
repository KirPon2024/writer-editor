#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL_VERSION = 'origin-smoke.v1';
const FAIL_REASON = 'NETWORK_ORIGIN_UNAVAILABLE';
const FAIL_CODE = 'E_NETWORK_ORIGIN_UNAVAILABLE';
const LS_REMOTE_TIMEOUT_MS = 15_000;
const FETCH_TIMEOUT_MS = 30_000;

function parseArgs(argv) {
  return {
    json: argv.includes('--json'),
  };
}

function runGit(args, timeoutMs) {
  return spawnSync('git', args, {
    encoding: 'utf8',
    timeout: timeoutMs,
  });
}

function normalizeCommandResult(raw) {
  const status = Number.isInteger(raw && raw.status) ? raw.status : 1;
  const stdout = String(raw && raw.stdout ? raw.stdout : '').trim();
  const stderr = String(raw && raw.stderr ? raw.stderr : '').trim();
  const timedOut = Boolean(raw && raw.error && raw.error.code === 'ETIMEDOUT');
  const errorMessage = raw && raw.error ? String(raw.error.message || '').trim() : '';
  return {
    ok: status === 0 && !timedOut,
    status,
    stdout,
    stderr,
    timedOut,
    errorMessage,
  };
}

export function evaluateOriginSmoke(input = {}) {
  const lsRemote = normalizeCommandResult(input.lsRemote || {});
  const fetchOrigin = normalizeCommandResult(input.fetchOrigin || {});
  const failedChecks = [];
  if (!lsRemote.ok) failedChecks.push('lsRemote');
  if (!fetchOrigin.ok) failedChecks.push('fetchOrigin');
  failedChecks.sort();

  const ok = failedChecks.length === 0;
  return {
    ok,
    ORIGIN_SMOKE_OK: ok ? 1 : 0,
    lsRemoteOk: lsRemote.ok,
    fetchOk: fetchOrigin.ok,
    failReason: ok ? '' : FAIL_REASON,
    failures: ok ? [] : [FAIL_CODE],
    failedChecks,
    checks: {
      lsRemote,
      fetchOrigin,
    },
    toolVersion: TOOL_VERSION,
  };
}

function printTokens(state) {
  console.log(`ORIGIN_SMOKE_OK=${state.ORIGIN_SMOKE_OK}`);
  console.log(`ORIGIN_SMOKE_LS_REMOTE_OK=${state.lsRemoteOk ? 1 : 0}`);
  console.log(`ORIGIN_SMOKE_FETCH_OK=${state.fetchOk ? 1 : 0}`);
  if (!state.ok) {
    console.log(`FAIL_REASON=${state.failReason}`);
  }
  console.log(`ORIGIN_SMOKE_FAILURES=${JSON.stringify(state.failures)}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateOriginSmoke({
    lsRemote: runGit(['ls-remote', 'origin'], LS_REMOTE_TIMEOUT_MS),
    fetchOrigin: runGit(['fetch', 'origin'], FETCH_TIMEOUT_MS),
  });

  if (args.json) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  } else {
    printTokens(state);
  }

  process.exit(state.ok ? 0 : 2);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
