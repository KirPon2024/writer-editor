#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKEN_NAME = 'HEAD_STRICT_OK';
const FAIL_CODE = 'E_HEAD_BINDING_INVALID';
const REMOTE_UNAVAILABLE_CODE = 'E_REMOTE_UNAVAILABLE';

function runGit(args) {
  return spawnSync('git', args, { encoding: 'utf8' });
}

function stdout(result) {
  return String(result && result.stdout ? result.stdout : '').trim();
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stableSortObject(value) {
  if (Array.isArray(value)) return value.map((item) => stableSortObject(item));
  if (!isObjectRecord(value)) return value;
  const out = {};
  for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
    out[key] = stableSortObject(value[key]);
  }
  return out;
}

function stableStringify(value) {
  return JSON.stringify(stableSortObject(value), null, 2);
}

function parseHeadParentCount() {
  const res = runGit(['rev-list', '--parents', '-n', '1', 'HEAD']);
  if (res.status !== 0) return -1;
  const line = stdout(res);
  if (!line) return -1;
  const parts = line.split(/\s+/u).filter(Boolean);
  if (parts.length === 0) return -1;
  return Math.max(parts.length - 1, 0);
}

function inferDefaultMode() {
  const doctorMode = String(process.env.DOCTOR_MODE || '').trim().toLowerCase();
  if (doctorMode === 'delivery') return 'release';
  return 'release';
}

function normalizeMode(inputMode) {
  const requestedMode = String(inputMode || process.env.HEAD_STRICT_MODE || inferDefaultMode())
    .trim()
    .toLowerCase();
  return requestedMode === 'dev' ? 'dev' : 'release';
}

export function evaluateHeadStrictState(input = {}) {
  const mode = normalizeMode(input.mode);

  const headRes = runGit(['rev-parse', 'HEAD']);
  const originRes = runGit(['rev-parse', 'origin/main']);
  const ancestorRes = runGit(['merge-base', '--is-ancestor', 'origin/main', 'HEAD']);

  const headSha = String(
    input.headSha === undefined ? stdout(headRes) : input.headSha,
  ).trim();
  const originMainSha = String(
    input.originMainSha === undefined ? stdout(originRes) : input.originMainSha,
  ).trim();

  const headResolved = input.headResolved === undefined ? headRes.status === 0 : input.headResolved === true;
  const originResolved = input.originResolved === undefined ? originRes.status === 0 : input.originResolved === true;
  const originAncestorOfHead = input.originAncestorOfHead === undefined
    ? ancestorRes.status === 0
    : input.originAncestorOfHead === true;
  const headParentCount = Number.isInteger(input.headParentCount)
    ? input.headParentCount
    : parseHeadParentCount();

  const headEqualsOrigin = headResolved && originResolved && headSha.length > 0 && headSha === originMainSha;
  const mergeCommitOk = headParentCount === 2;
  const shaLockValid = input.shaLockValid === undefined
    ? (headEqualsOrigin && headResolved && originResolved)
    : input.shaLockValid === true;
  const remoteUnavailableDetected = input.remoteUnavailableDetected === true
    || String(process.env.E_REMOTE_UNAVAILABLE || '').trim() === '1'
    || !originResolved;

  const ok = mode === 'release'
    ? (headEqualsOrigin && mergeCommitOk && shaLockValid && !remoteUnavailableDetected ? 1 : 0)
    : (originAncestorOfHead && !remoteUnavailableDetected ? 1 : 0);

  return {
    ok,
    mode,
    [TOKEN_NAME]: ok,
    code: ok === 1 ? '' : FAIL_CODE,
    failReason: ok === 1 ? '' : FAIL_CODE,
    headSha,
    originMainSha,
    headEqualsOrigin: headEqualsOrigin ? 1 : 0,
    originAncestorOfHead: originAncestorOfHead ? 1 : 0,
    releaseTagPresent: 0,
    details: {
      headResolved: headResolved ? 1 : 0,
      originResolved: originResolved ? 1 : 0,
      headParentCount,
      mergeCommitOk: mergeCommitOk ? 1 : 0,
      shaLockValid: shaLockValid ? 1 : 0,
      remoteUnavailableDetected: remoteUnavailableDetected ? 1 : 0,
      remoteUnavailableCode: remoteUnavailableDetected ? REMOTE_UNAVAILABLE_CODE : '',
    },
  };
}

function parseArgs(argv) {
  const out = {
    json: false,
    mode: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    if (arg === '--mode') {
      out.mode = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }
  return out;
}

function printTokens(state) {
  console.log(`HEAD_STRICT_MODE=${state.mode}`);
  console.log(`HEAD_STRICT_HEAD_SHA=${state.headSha || 'unknown'}`);
  console.log(`HEAD_STRICT_ORIGIN_MAIN_SHA=${state.originMainSha || 'unknown'}`);
  console.log(`HEAD_STRICT_HEAD_EQUALS_ORIGIN=${state.headEqualsOrigin}`);
  console.log(`HEAD_STRICT_ORIGIN_ANCESTOR_OF_HEAD=${state.originAncestorOfHead}`);
  console.log(`HEAD_STRICT_MERGE_PARENT_COUNT=${state.details.headParentCount}`);
  console.log(`HEAD_STRICT_MERGE_COMMIT_OK=${state.details.mergeCommitOk}`);
  console.log(`HEAD_STRICT_SHA_LOCK_VALID=${state.details.shaLockValid}`);
  console.log(`HEAD_STRICT_REMOTE_UNAVAILABLE_DETECTED=${state.details.remoteUnavailableDetected}`);
  console.log(`HEAD_STRICT_OK=${state[TOKEN_NAME]}`);
  if (state.failReason) console.log(`FAIL_REASON=${state.failReason}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateHeadStrictState({ mode: args.mode });
  if (args.json) {
    process.stdout.write(`${stableStringify(state)}\n`);
  } else {
    printTokens(state);
  }
  process.exit(state[TOKEN_NAME] === 1 ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
