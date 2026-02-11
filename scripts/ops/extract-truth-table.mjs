#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { evaluateNextSectorState } from './next-sector-state.mjs';
import { evaluateXplatContractState } from './xplat-contract-state.mjs';
import { evaluateRequiredChecksState } from './required-checks-state.mjs';

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
  const nextSector = evaluateNextSectorState();
  const xplat = evaluateXplatContractState();
  const requiredChecks = evaluateRequiredChecksState({ profile: 'ops' });

  return {
    schemaVersion: 'truth-table.v1',
    generatedAt: new Date().toISOString(),
    NEXT_SECTOR_VALID: nextSector.valid ? 1 : 0,
    NEXT_SECTOR_MODE: nextSector.mode || '',
    NEXT_SECTOR_ID: nextSector.id || '',
    NEXT_SECTOR_REASON: nextSector.reason || '',
    NEXT_SECTOR_FAIL_REASON: nextSector.failReason || '',
    XPLAT_CONTRACT_PRESENT: xplat.present,
    XPLAT_CONTRACT_SHA256: xplat.sha256,
    XPLAT_CONTRACT_OK: xplat.ok,
    REQUIRED_CHECKS_SYNC_OK: requiredChecks.syncOk,
    REQUIRED_CHECKS_STALE: requiredChecks.stale,
    REQUIRED_CHECKS_SOURCE: requiredChecks.source,
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
      {
        id: 'NEXT_SECTOR_VALID',
        expected: true,
        actual: nextSector.valid,
        pass: nextSector.valid,
      },
      {
        id: 'XPLAT_CONTRACT_OK',
        expected: true,
        actual: xplat.ok === 1,
        pass: xplat.ok === 1,
      },
      {
        id: 'REQUIRED_CHECKS_SYNC_OK',
        expected: true,
        actual: requiredChecks.syncOk === 1,
        pass: requiredChecks.syncOk === 1,
      },
      {
        id: 'REQUIRED_CHECKS_STALE',
        expected: false,
        actual: requiredChecks.stale === 1,
        pass: requiredChecks.stale === 0,
      },
    ],
    context: {
      headSha,
      originMainSha,
      nextSector,
      xplat,
      requiredChecks,
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
  console.log(`NEXT_SECTOR_ID=${table.NEXT_SECTOR_ID}`);
  console.log(`NEXT_SECTOR_MODE=${table.NEXT_SECTOR_MODE}`);
  console.log(`NEXT_SECTOR_REASON=${table.NEXT_SECTOR_REASON}`);
  console.log(`NEXT_SECTOR_VALID=${table.NEXT_SECTOR_VALID}`);
  console.log(`XPLAT_CONTRACT_PRESENT=${table.XPLAT_CONTRACT_PRESENT}`);
  console.log(`XPLAT_CONTRACT_SHA256=${table.XPLAT_CONTRACT_SHA256}`);
  console.log(`XPLAT_CONTRACT_OK=${table.XPLAT_CONTRACT_OK}`);
  console.log(`REQUIRED_CHECKS_SYNC_OK=${table.REQUIRED_CHECKS_SYNC_OK}`);
  console.log(`REQUIRED_CHECKS_STALE=${table.REQUIRED_CHECKS_STALE}`);
  console.log(`REQUIRED_CHECKS_SOURCE=${table.REQUIRED_CHECKS_SOURCE}`);
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
