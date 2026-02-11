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

function hasFile(filePath) {
  return fs.existsSync(filePath);
}

function evaluateDoctorDeliveryStrict() {
  const result = spawnSync(process.execPath, ['scripts/doctor.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DOCTOR_MODE: 'delivery',
    },
  });
  const stdout = String(result.stdout || '');
  const strictOk = result.status === 0
    && stdout.includes('DOCTOR_OK')
    && !stdout.includes('DOCTOR_WARN')
    && !stdout.includes('DOCTOR_INFO')
    && !stdout.includes('INFO')
    && !stdout.includes('PLACEHOLDER');
  return {
    ok: strictOk ? 1 : 0,
    status: result.status,
  };
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
  const nextSector = evaluateNextSectorState();
  const xplat = evaluateXplatContractState();
  const requiredChecks = evaluateRequiredChecksState({ profile: 'ops' });
  const doctorDeliveryStrict = evaluateDoctorDeliveryStrict();

  const summary = {
    schemaVersion: 'ops-summary.v1',
    branch,
    headSha,
    originMainSha,
    remoteBindingOk,
    opsBaselineFilesOk: scriptsOk,
    nextSectorValid: nextSector.valid,
    nextSectorMode: nextSector.mode || '',
    nextSectorId: nextSector.id || '',
    nextSectorReason: nextSector.reason || '',
    xplatContractPresent: xplat.present,
    xplatContractSha256: xplat.sha256,
    xplatContractOk: xplat.ok,
    requiredChecksSyncOk: requiredChecks.syncOk,
    requiredChecksStale: requiredChecks.stale,
    requiredChecksSource: requiredChecks.source,
    doctorDeliveryStrictOk: doctorDeliveryStrict.ok,
    governanceStrictOk: remoteBindingOk
      && requiredChecks.syncOk === 1
      && requiredChecks.stale === 0
      && requiredChecks.source === 'canonical'
      && doctorDeliveryStrict.ok === 1,
    generatedAt: new Date().toISOString(),
  };

  console.log(`OPS_SUMMARY_VERSION=${summary.schemaVersion}`);
  console.log(`OPS_SUMMARY_BRANCH=${summary.branch || 'unknown'}`);
  console.log(`OPS_SUMMARY_HEAD_SHA=${summary.headSha || 'unknown'}`);
  console.log(`OPS_SUMMARY_ORIGIN_MAIN_SHA=${summary.originMainSha || 'unknown'}`);
  console.log(`OPS_SUMMARY_REMOTE_BINDING_OK=${summary.remoteBindingOk ? 1 : 0}`);
  console.log(`OPS_SUMMARY_BASELINE_FILES_OK=${summary.opsBaselineFilesOk ? 1 : 0}`);
  console.log(`OPS_SUMMARY_NEXT_SECTOR_ID=${summary.nextSectorId}`);
  console.log(`OPS_SUMMARY_NEXT_SECTOR_MODE=${summary.nextSectorMode}`);
  console.log(`OPS_SUMMARY_NEXT_SECTOR_REASON=${summary.nextSectorReason}`);
  console.log(`OPS_SUMMARY_NEXT_SECTOR_VALID=${summary.nextSectorValid ? 1 : 0}`);
  console.log(`OPS_SUMMARY_XPLAT_CONTRACT_PRESENT=${summary.xplatContractPresent}`);
  console.log(`OPS_SUMMARY_XPLAT_CONTRACT_SHA256=${summary.xplatContractSha256}`);
  console.log(`OPS_SUMMARY_XPLAT_CONTRACT_OK=${summary.xplatContractOk}`);
  console.log(`OPS_SUMMARY_REQUIRED_CHECKS_SYNC_OK=${summary.requiredChecksSyncOk}`);
  console.log(`OPS_SUMMARY_REQUIRED_CHECKS_STALE=${summary.requiredChecksStale}`);
  console.log(`OPS_SUMMARY_REQUIRED_CHECKS_SOURCE=${summary.requiredChecksSource}`);
  console.log(`OPS_SUMMARY_DOCTOR_DELIVERY_STRICT_OK=${summary.doctorDeliveryStrictOk}`);
  console.log(`OPS_SUMMARY_GOVERNANCE_STRICT_OK=${summary.governanceStrictOk ? 1 : 0}`);

  if (!summary.remoteBindingOk) {
    console.log('FAIL_REASON=OPS_SUMMARY_REMOTE_BINDING_MISMATCH');
    process.exit(1);
  }
  if (!summary.opsBaselineFilesOk) {
    console.log('FAIL_REASON=OPS_SUMMARY_BASELINE_FILES_MISSING');
    process.exit(1);
  }
  if (!summary.nextSectorValid) {
    console.log(`FAIL_REASON=${nextSector.failReason || 'OPS_SUMMARY_NEXT_SECTOR_INVALID'}`);
    process.exit(1);
  }
  if (summary.xplatContractOk !== 1) {
    console.log(`FAIL_REASON=${xplat.failReason || 'OPS_SUMMARY_XPLAT_CONTRACT_INVALID'}`);
    process.exit(1);
  }
  if (summary.requiredChecksSyncOk !== 1 || summary.requiredChecksStale !== 0 || summary.requiredChecksSource !== 'canonical') {
    console.log(`FAIL_REASON=${requiredChecks.failReason || 'OPS_SUMMARY_REQUIRED_CHECKS_NOT_CANONICAL'}`);
    process.exit(1);
  }
  if (summary.doctorDeliveryStrictOk !== 1) {
    console.log('FAIL_REASON=OPS_SUMMARY_DOCTOR_DELIVERY_NOT_STRICT');
    process.exit(1);
  }
  if (!summary.governanceStrictOk) {
    console.log('FAIL_REASON=OPS_SUMMARY_GOVERNANCE_STRICT_NOT_OK');
    process.exit(1);
  }

  console.log('OPS_SUMMARY_OK=1');
}

main();
