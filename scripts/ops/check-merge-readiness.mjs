#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

function run(cmd, args) {
  return spawnSync(cmd, args, { encoding: 'utf8' });
}

function readStdout(result) {
  return String(result && result.stdout ? result.stdout : '').trim();
}

function printLine(key, value) {
  console.log(`${key}=${value}`);
}

function main() {
  const branchRes = run('git', ['branch', '--show-current']);
  const headRes = run('git', ['rev-parse', 'HEAD']);
  const originRes = run('git', ['rev-parse', 'origin/main']);
  const ancestorRes = run('git', ['merge-base', '--is-ancestor', 'origin/main', 'HEAD']);

  const branch = readStdout(branchRes);
  const headSha = readStdout(headRes);
  const originMainSha = readStdout(originRes);
  const remoteBindingOk = headRes.status === 0 && originRes.status === 0 && ancestorRes.status === 0 && headSha === originMainSha;
  const branchOk = branchRes.status === 0 && branch === 'main';

  printLine('CHECK_MERGE_READINESS_BRANCH', branch || 'unknown');
  printLine('CHECK_MERGE_READINESS_BRANCH_OK', branchOk ? 1 : 0);
  printLine('CHECK_MERGE_READINESS_HEAD_SHA', headSha || 'unknown');
  printLine('CHECK_MERGE_READINESS_ORIGIN_MAIN_SHA', originMainSha || 'unknown');
  printLine('CHECK_MERGE_READINESS_REMOTE_BINDING_OK', remoteBindingOk ? 1 : 0);

  if (!branchOk) {
    printLine('FAIL_REASON', 'CHECK_MERGE_READINESS_BRANCH_NOT_MAIN');
    process.exit(1);
  }
  if (!remoteBindingOk) {
    printLine('FAIL_REASON', 'CHECK_MERGE_READINESS_REMOTE_BINDING_MISMATCH');
    process.exit(1);
  }

  printLine('CHECK_MERGE_READINESS_OK', 1);
}

main();
