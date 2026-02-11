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

function parseArgs(argv) {
  const out = { format: 'md' };
  for (const arg of argv) {
    if (arg === '--json') out.format = 'json';
    if (arg === '--md') out.format = 'md';
  }
  return out;
}

function buildTruthTable() {
  const headRes = run('git', ['rev-parse', 'HEAD']);
  const originRes = run('git', ['rev-parse', 'origin/main']);
  const ancestorRes = run('git', ['merge-base', '--is-ancestor', 'origin/main', 'HEAD']);

  const headSha = readStdout(headRes);
  const originMainSha = readStdout(originRes);
  const remoteBindingOk = headRes.status === 0 && originRes.status === 0 && ancestorRes.status === 0 && headSha === originMainSha;
  const opsBaselineFilesOk = REQUIRED_OPS_SCRIPTS.every((filePath) => fs.existsSync(filePath));
  const doctorScriptOk = fs.existsSync('scripts/doctor.mjs');

  return {
    schemaVersion: 'truth-table.v1',
    generatedAt: new Date().toISOString(),
    checks: [
      {
        id: 'REMOTE_BINDING',
        expected: true,
        actual: remoteBindingOk,
        pass: remoteBindingOk,
      },
      {
        id: 'OPS_BASELINE_FILES',
        expected: true,
        actual: opsBaselineFilesOk,
        pass: opsBaselineFilesOk,
      },
      {
        id: 'DOCTOR_SCRIPT_PRESENT',
        expected: true,
        actual: doctorScriptOk,
        pass: doctorScriptOk,
      },
    ],
    context: {
      headSha,
      originMainSha,
    },
  };
}

function emitMd(table) {
  console.log('| CHECK | EXPECTED | ACTUAL | PASS |');
  console.log('| --- | --- | --- | --- |');
  for (const row of table.checks) {
    console.log(`| ${row.id} | ${row.expected} | ${row.actual} | ${row.pass} |`);
  }
  console.log('');
  console.log(`HEAD_SHA=${table.context.headSha || 'unknown'}`);
  console.log(`ORIGIN_MAIN_SHA=${table.context.originMainSha || 'unknown'}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const table = buildTruthTable();
  if (args.format === 'json') {
    process.stdout.write(`${JSON.stringify(table, null, 2)}\n`);
  } else {
    emitMd(table);
  }
}

main();
