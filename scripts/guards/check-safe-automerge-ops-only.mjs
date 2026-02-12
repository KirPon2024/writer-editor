#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL_VERSION = 'safe-automerge-ops-only.v1';
const DEFAULT_REPO = 'KirPon2024/writer-editor';
const ALLOWLIST_PREFIXES = Object.freeze([
  'docs/OPERATIONS/',
  'scripts/guards/',
  'test/contracts/',
]);
const DENY_PREFIXES = Object.freeze([
  'src/',
  '.github/',
  'docs/OPS/',
]);

function parseArgs(argv) {
  const out = {
    json: false,
    prNumber: '',
    repo: DEFAULT_REPO,
    expectedHeadSha: '',
    fixtureJson: process.env.SAFE_AUTOMERGE_OPS_ONLY_FIXTURE_JSON || '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || '').trim();
    if (arg === '--json') out.json = true;
    else if (arg === '--pr') {
      out.prNumber = String(argv[i + 1] || '').trim();
      i += 1;
    } else if (arg === '--repo') {
      out.repo = String(argv[i + 1] || '').trim() || DEFAULT_REPO;
      i += 1;
    } else if (arg === '--expected-head-sha') {
      out.expectedHeadSha = String(argv[i + 1] || '').trim();
      i += 1;
    } else if (arg === '--fixture-json') {
      out.fixtureJson = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }
  return out;
}

function normalizeChangedFiles(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => String(entry || '').trim()).filter(Boolean))].sort();
}

function isDenyPath(filePath) {
  return DENY_PREFIXES.some((prefix) => filePath.startsWith(prefix));
}

function isAllowlistPath(filePath) {
  return ALLOWLIST_PREFIXES.some((prefix) => filePath.startsWith(prefix));
}

function evaluateStatusCheckRollup(rollup) {
  if (!Array.isArray(rollup) || rollup.length === 0) return false;
  return rollup.every((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const status = String(entry.status || '').trim().toUpperCase();
    const conclusion = String(entry.conclusion || entry.state || '').trim().toUpperCase();
    if (status && status !== 'COMPLETED') return false;
    return conclusion === 'SUCCESS';
  });
}

function runGit(args) {
  return spawnSync('git', args, { encoding: 'utf8' });
}

function runGh(args) {
  return spawnSync('gh', args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      GH_PAGER: '',
      NO_COLOR: '1',
    },
  });
}

function readStdout(result) {
  return String(result && result.stdout ? result.stdout : '').trim();
}

function loadFixture(fixtureJson) {
  if (!fixtureJson) return null;
  try {
    const parsed = JSON.parse(fixtureJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function collectRuntimeInput(args) {
  const fixture = loadFixture(args.fixtureJson);
  if (fixture) {
    return {
      changedFiles: normalizeChangedFiles(fixture.changedFiles),
      baseRefName: String(fixture.baseRefName || '').trim(),
      headRefOid: String(fixture.headRefOid || '').trim(),
      expectedHeadSha: String(args.expectedHeadSha || fixture.expectedHeadSha || '').trim(),
      statusCheckRollup: Array.isArray(fixture.statusCheckRollup) ? fixture.statusCheckRollup : [],
    };
  }

  const diffRes = runGit(['diff', '--name-only', 'origin/main...HEAD']);
  const changedFiles = diffRes.status === 0
    ? normalizeChangedFiles(readStdout(diffRes).split(/\r?\n/u))
    : [];

  const prInput = String(args.prNumber || '').trim();
  const prJsonRes = prInput
    ? runGh([
      'pr',
      'view',
      prInput,
      '--repo',
      args.repo,
      '--json',
      'baseRefName,headRefOid,statusCheckRollup',
    ])
    : { status: 1, stdout: '', stderr: '' };
  let prJson = {};
  if (prJsonRes.status === 0) {
    try {
      prJson = JSON.parse(String(prJsonRes.stdout || '{}'));
    } catch {
      prJson = {};
    }
  }

  return {
    changedFiles,
    baseRefName: String(prJson.baseRefName || '').trim(),
    headRefOid: String(prJson.headRefOid || '').trim(),
    expectedHeadSha: String(args.expectedHeadSha || '').trim(),
    statusCheckRollup: Array.isArray(prJson.statusCheckRollup) ? prJson.statusCheckRollup : [],
    diagnostics: {
      diffExitCode: Number(diffRes.status ?? 1),
      prViewExitCode: Number(prJsonRes.status ?? 1),
      prNumber: prInput,
    },
  };
}

export function evaluateSafeAutomergeOpsOnly(input = {}) {
  const failures = new Set();

  const changedFiles = normalizeChangedFiles(input.changedFiles);
  const denyPaths = changedFiles.filter((entry) => isDenyPath(entry));
  const outsideAllowlist = changedFiles.filter((entry) => !isAllowlistPath(entry));

  if (denyPaths.length > 0) failures.add('E_SAFE_AUTOMERGE_DENY_PATH_CHANGED');
  if (outsideAllowlist.length > 0) failures.add('E_SAFE_AUTOMERGE_DIFF_OUTSIDE_ALLOWLIST');

  const baseRefName = String(input.baseRefName || '').trim();
  const headRefOid = String(input.headRefOid || '').trim();
  const expectedHeadSha = String(input.expectedHeadSha || '').trim();
  const statusCheckRollup = Array.isArray(input.statusCheckRollup) ? input.statusCheckRollup : [];

  if (baseRefName !== 'main') failures.add('E_SAFE_AUTOMERGE_BASE_NOT_MAIN');
  if (!expectedHeadSha) failures.add('E_SAFE_AUTOMERGE_EXPECTED_HEAD_SHA_MISSING');
  if (!headRefOid) failures.add('E_SAFE_AUTOMERGE_HEAD_SHA_MISSING');
  if (expectedHeadSha && headRefOid && headRefOid !== expectedHeadSha) {
    failures.add('E_SAFE_AUTOMERGE_HEAD_SHA_MISMATCH');
  }
  if (!evaluateStatusCheckRollup(statusCheckRollup)) {
    failures.add('E_SAFE_AUTOMERGE_STATUS_CHECKS_NOT_SUCCESS');
  }

  const sortedFailures = [...failures].sort();
  const ok = sortedFailures.length === 0;
  return {
    ok,
    status: ok ? 'ELIGIBLE' : 'STOP_REQUIRED',
    failures: sortedFailures,
    details: {
      changedFiles,
      denyPaths,
      outsideAllowlist,
      baseRefName,
      headRefOid,
      expectedHeadSha,
      statusChecksSuccess: evaluateStatusCheckRollup(statusCheckRollup),
    },
    toolVersion: TOOL_VERSION,
  };
}

function printTokens(state) {
  const firstFailure = state.failures.length > 0 ? state.failures[0] : '';
  console.log(`SAFE_AUTOMERGE_OPS_ONLY_OK=${state.ok ? 1 : 0}`);
  console.log(`SAFE_AUTOMERGE_STATUS=${state.status}`);
  console.log(`SAFE_AUTOMERGE_STOP_REQUIRED=${state.ok ? 0 : 1}`);
  console.log(`STOP_REQUIRED=${state.ok ? 0 : 1}`);
  console.log(`SAFE_AUTOMERGE_FAIL_REASON=${firstFailure}`);
  console.log(`SAFE_AUTOMERGE_BASE_REF=${state.details.baseRefName}`);
  console.log(`SAFE_AUTOMERGE_HEAD_REF_OID=${state.details.headRefOid}`);
  console.log(`SAFE_AUTOMERGE_EXPECTED_HEAD_SHA=${state.details.expectedHeadSha}`);
  console.log(`SAFE_AUTOMERGE_STATUSCHECK_SUCCESS=${state.details.statusChecksSuccess ? 1 : 0}`);
  console.log(`SAFE_AUTOMERGE_OPS_DIFF_OK=${state.details.outsideAllowlist.length === 0 ? 1 : 0}`);
  console.log(`SAFE_AUTOMERGE_TOOL_VERSION=${state.toolVersion}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const runtimeInput = collectRuntimeInput(args);
  const state = evaluateSafeAutomergeOpsOnly(runtimeInput);
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
