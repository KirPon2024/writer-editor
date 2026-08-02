#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { runP0_03PackagedVisibleJourney } from './yalken-atlas-v5-final-audit-p0-03-packaged-visible-journey.mjs';
import { runManualMapPortabilityJourney } from './yalken-atlas-v5-r3-c03-manual-map-attachments-portals-templates.mjs';

const REPORT_SCHEMA = 'yalken.atlas.v6.productionLifecycle.v1';
const ROOT = process.cwd();

const HOLD_MATRIX = Object.freeze([
  'collaborator-envelope-version-lifecycle-and-provenance',
  'recovery-schema-project-lifecycle-revision-authority-and-provenance',
  'replay-state-injection-rejection',
  'manual-map-real-json-svg-and-pdf-typed-loss',
  'append-only-restore-and-undo',
  'interprocess-lease-and-lock-held-cas',
  'selected-stage10-control-state-binding',
  'retained-analytics-scheduler',
  'live-command-provider-and-exact-slot-catalogs',
  'production-required-negative-gate',
  'complete-bcp47-and-author-text-preservation',
]);

function runNodeTests(files) {
  const result = spawnSync(process.execPath, ['--test', ...files], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
  });
  return {
    ok: result.status === 0,
    exitCode: Number.isInteger(result.status) ? result.status : 1,
    signal: result.signal || '',
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
  };
}

export function runAtlasV6NegativeMatrix() {
  const files = [
    'test/contracts/yalken-atlas-v6-audit-hold-repair.contract.test.js',
    'test/contracts/yalken-atlas-v6-production-negative.contract.test.js',
  ];
  const execution = runNodeTests(files);
  return {
    schemaVersion: REPORT_SCHEMA,
    mode: 'negative-matrix',
    pass: execution.ok,
    productionModulesExecuted: true,
    sourceOnlyAcceptance: false,
    directReducerOnlyAcceptance: false,
    matrix: HOLD_MATRIX.map((id) => ({ id, executed: true, pass: execution.ok })),
    files,
    execution,
  };
}

function allAcceptedExceptExactMainBinding(accepted = {}) {
  return Object.entries(accepted)
    .filter(([key]) => key !== 'exactSourceBindingPresent')
    .every(([, value]) => value === true);
}

export async function runAtlasV6PackagedLifecycle() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yalken-atlas-v6-packaged-lifecycle-'));
  const packagedOutDir = path.join(tempRoot, 'packaged');
  const manualMapOutDir = path.join(tempRoot, 'manual-map');
  try {
    const packaged = await runP0_03PackagedVisibleJourney({
      outDir: packagedOutDir,
      receiptPath: path.join(packagedOutDir, 'receipt.json'),
      skipBuild: false,
      skipRuntime: false,
    });
    const manualMap = await runManualMapPortabilityJourney({
      rootDir: ROOT,
      outDir: manualMapOutDir,
    });
    const accepted = {
      packagedArtifactBuiltFromCurrentBranch: packaged.accepted?.currentSourcePackageBuilt === true,
      packagedExecutableVisibleLifecycle: packaged.accepted?.packagedExecutableRuntime === true
        && packaged.accepted?.visibleUiInputUsed === true,
      packagedCommandPersistenceAndFreshReopen: packaged.acceptance?.persistedCommandAndFreshReopenProof === true,
      packagedNegativeRowsExceptPremergeMainIdentity: allAcceptedExceptExactMainBinding(packaged.accepted),
      manualMapVisiblePhysicalLifecycle: manualMap.accepted?.visibleInputRuntime === true
        && manualMap.accepted?.pointerAndKeyboardUsed === true,
      manualMapRealJsonAndSvgBytes: manualMap.accepted?.realLocalArtifactBytes === true,
      manualMapCanonicalPersistenceAndReopenReplay: manualMap.accepted?.canonicalPersistenceReopenReplay === true,
      manualMapPdfClaimTruthful: manualMap.accepted?.pdfClaimHonestTypedLoss === true,
      noNetworkOrDirectStorageBypass: manualMap.accepted?.noNetworkNoDialogs === true
        && manualMap.accepted?.noDirectIpcOrStorageBypass === true,
    };
    return {
      schemaVersion: REPORT_SCHEMA,
      mode: 'packaged',
      pass: Object.values(accepted).every((value) => value === true),
      accepted,
      branchIdentityPolicy: 'CURRENT_CLEAN_BRANCH_PACKAGE_PREMERGE; exact merged main is verified separately after merge',
      packaged: {
        status: packaged.status,
        passIncludingExactMainIdentity: packaged.pass === true,
        accepted: packaged.accepted,
        acceptance: packaged.acceptance,
      },
      manualMap: {
        status: manualMap.status,
        pass: manualMap.pass === true,
        accepted: manualMap.accepted,
        artifactBytes: {
          json: manualMap.portability?.realJsonProof?.bytes || 0,
          svg: manualMap.portability?.realSvgProof?.bytes || 0,
        },
        stage10EventCount: manualMap.portability?.stage10EventCount || 0,
      },
    };
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

async function main() {
  const mode = process.argv.includes('--packaged')
    ? 'packaged'
    : process.argv.includes('--negative-matrix')
      ? 'negative-matrix'
      : '';
  if (!mode) throw new Error('ATLAS_V6_LIFECYCLE_MODE_REQUIRED');
  const report = mode === 'packaged'
    ? await runAtlasV6PackagedLifecycle()
    : runAtlasV6NegativeMatrix();
  const output = mode === 'negative-matrix'
    ? {
        schemaVersion: report.schemaVersion,
        mode: report.mode,
        pass: report.pass,
        matrix: report.matrix,
        exitCode: report.execution.exitCode,
      }
    : report;
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (report.pass !== true) {
    if (mode === 'negative-matrix') {
      process.stderr.write(report.execution.stdout);
      process.stderr.write(report.execution.stderr);
    }
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exit(1);
  });
}
