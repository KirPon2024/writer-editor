#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const REQUIRED_OPS_SCRIPTS = [
  'scripts/ops/check-merge-readiness.mjs',
  'scripts/ops/emit-ops-summary.mjs',
  'scripts/ops/extract-truth-table.mjs',
];

function run(cmd, args) {
  return spawnSync(cmd, args, { encoding: 'utf8' });
}

function readStdout(result) {
  return String(result && result.stdout ? result.stdout : '').trim();
}

function hasFile(filePath) {
  return fs.existsSync(filePath);
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
  const scriptsOk = REQUIRED_OPS_SCRIPTS.every((filePath) => hasFile(filePath));

  const summary = {
    schemaVersion: 'ops-summary.v1',
    branch,
    headSha,
    originMainSha,
    remoteBindingOk,
    opsBaselineFilesOk: scriptsOk,
    generatedAt: new Date().toISOString(),
  };

  console.log(`OPS_SUMMARY_VERSION=${summary.schemaVersion}`);
  console.log(`OPS_SUMMARY_BRANCH=${summary.branch || 'unknown'}`);
  console.log(`OPS_SUMMARY_HEAD_SHA=${summary.headSha || 'unknown'}`);
  console.log(`OPS_SUMMARY_ORIGIN_MAIN_SHA=${summary.originMainSha || 'unknown'}`);
  console.log(`OPS_SUMMARY_REMOTE_BINDING_OK=${summary.remoteBindingOk ? 1 : 0}`);
  console.log(`OPS_SUMMARY_BASELINE_FILES_OK=${summary.opsBaselineFilesOk ? 1 : 0}`);

  if (!summary.remoteBindingOk) {
    console.log('FAIL_REASON=OPS_SUMMARY_REMOTE_BINDING_MISMATCH');
    process.exit(1);
  }
  if (!summary.opsBaselineFilesOk) {
    console.log('FAIL_REASON=OPS_SUMMARY_BASELINE_FILES_MISSING');
    process.exit(1);
  }

  console.log('OPS_SUMMARY_OK=1');
}

main();
