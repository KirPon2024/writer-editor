#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL_VERSION = 'post-merge-origin-availability.v1';
const FAILURE_CODE = 'E_NETWORK_ORIGIN_UNAVAILABLE';
const FAIL_REASON = 'NETWORK_ORIGIN_UNAVAILABLE';

function parseArgs(argv) {
  return {
    json: argv.includes('--json'),
    fixtureJson: process.env.POST_MERGE_ORIGIN_AVAILABILITY_FIXTURE_JSON || extractArg(argv, '--fixture-json'),
  };
}

function extractArg(argv, name) {
  const idx = argv.indexOf(name);
  if (idx < 0) return '';
  return String(argv[idx + 1] || '').trim();
}

function parseFixture(fixtureJson) {
  if (!fixtureJson) return null;
  try {
    const parsed = JSON.parse(fixtureJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function runGit(args) {
  return spawnSync('git', args, { encoding: 'utf8' });
}

function normalizeCommandResult(raw) {
  const status = Number.isInteger(raw && raw.status) ? raw.status : 1;
  const stdout = String(raw && raw.stdout ? raw.stdout : '');
  const stderr = String(raw && raw.stderr ? raw.stderr : '');
  return {
    ok: status === 0,
    status,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  };
}

function collectRuntimeResults(fixture) {
  if (fixture) {
    return {
      fetchOrigin: normalizeCommandResult(fixture.fetchOrigin || fixture.fetch || {}),
      lsRemoteOrigin: normalizeCommandResult(fixture.lsRemoteOrigin || fixture.lsRemote || {}),
      originMainReadable: normalizeCommandResult(fixture.originMainReadable || fixture.originMain || {}),
    };
  }

  return {
    fetchOrigin: normalizeCommandResult(runGit(['fetch', 'origin'])),
    lsRemoteOrigin: normalizeCommandResult(runGit(['ls-remote', 'origin'])),
    originMainReadable: normalizeCommandResult(runGit(['rev-parse', '--verify', 'origin/main'])),
  };
}

export function evaluatePostMergeOriginAvailability(input = {}) {
  const checks = {
    fetchOrigin: normalizeCommandResult(input.fetchOrigin || {}),
    lsRemoteOrigin: normalizeCommandResult(input.lsRemoteOrigin || {}),
    originMainReadable: normalizeCommandResult(input.originMainReadable || {}),
  };

  const failedChecks = Object.entries(checks)
    .filter(([, value]) => value.ok !== true)
    .map(([key]) => key)
    .sort();
  const ok = failedChecks.length === 0;
  const failures = ok ? [] : [FAILURE_CODE];

  return {
    ok,
    stopRequired: ok ? 0 : 1,
    failReason: ok ? '' : FAIL_REASON,
    failures,
    failedChecks,
    checks,
    toolVersion: TOOL_VERSION,
  };
}

function printTokens(state) {
  console.log(`POST_MERGE_ORIGIN_AVAILABLE_OK=${state.ok ? 1 : 0}`);
  console.log(`STOP_REQUIRED=${state.stopRequired}`);
  console.log(`FAIL_REASON=${state.failReason}`);
  console.log(`POST_MERGE_ORIGIN_FAILURES=${JSON.stringify(state.failures)}`);
  console.log(`POST_MERGE_ORIGIN_FAILED_CHECKS=${JSON.stringify(state.failedChecks)}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const fixture = parseFixture(args.fixtureJson);
  const runtime = collectRuntimeResults(fixture);
  const state = evaluatePostMergeOriginAvailability(runtime);

  if (args.json) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  } else {
    printTokens(state);
  }

  process.exit(state.ok ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
