#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function runGit(args) {
  return spawnSync('git', args, { encoding: 'utf8' });
}

function stdout(result) {
  return String(result && result.stdout ? result.stdout : '').trim();
}

function hasReleaseTagAtHead() {
  const res = runGit(['tag', '--points-at', 'HEAD', '--list', 'release/*']);
  if (res.status !== 0) return false;
  const lines = String(res.stdout || '').split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  return lines.length > 0;
}

export function evaluateHeadStrictState(input = {}) {
  const requestedMode = String(
    input.mode
      || process.env.HEAD_STRICT_MODE
      || (String(process.env.DOCTOR_MODE || '').trim().toLowerCase() === 'delivery' ? 'release' : 'dev'),
  ).trim().toLowerCase();
  const mode = requestedMode === 'release' || requestedMode === 'freeze' ? 'release' : 'dev';

  const headRes = runGit(['rev-parse', 'HEAD']);
  const originRes = runGit(['rev-parse', 'origin/main']);
  const ancestorRes = runGit(['merge-base', '--is-ancestor', 'origin/main', 'HEAD']);

  const headSha = stdout(headRes);
  const originMainSha = stdout(originRes);
  const headEqualsOrigin = headRes.status === 0 && originRes.status === 0 && headSha === originMainSha;
  const originAncestorOfHead = ancestorRes.status === 0;
  const releaseTagPresent = hasReleaseTagAtHead();

  const ok = mode === 'dev'
    ? (originAncestorOfHead ? 1 : 0)
    : (headEqualsOrigin || (originAncestorOfHead && releaseTagPresent) ? 1 : 0);

  let failReason = '';
  if (ok !== 1) {
    failReason = mode === 'dev' ? 'E_HEAD_BINDING_INVALID_DEV' : 'E_HEAD_BINDING_INVALID';
  }

  return {
    mode,
    headSha,
    originMainSha,
    headEqualsOrigin: headEqualsOrigin ? 1 : 0,
    originAncestorOfHead: originAncestorOfHead ? 1 : 0,
    releaseTagPresent: releaseTagPresent ? 1 : 0,
    ok,
    failReason,
  };
}

function parseArgs(argv) {
  const out = { mode: '' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--mode') {
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
  console.log(`HEAD_STRICT_RELEASE_TAG_PRESENT=${state.releaseTagPresent}`);
  console.log(`HEAD_STRICT_OK=${state.ok}`);
  if (state.failReason) console.log(`FAIL_REASON=${state.failReason}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateHeadStrictState({ mode: args.mode });
  printTokens(state);
  process.exit(state.ok === 1 ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
