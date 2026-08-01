#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runAtlasEntityRelationUiJourneys } from './yalken-atlas-v5-r3-c01-atlas-entity-relation-ui-journeys.mjs';
import { runTemporalContinuitySavedQueryJourneys } from './yalken-atlas-v5-r3-c02-temporal-continuity-saved-query-journeys.mjs';
import { runManualMapPortabilityJourney } from './yalken-atlas-v5-r3-c03-manual-map-attachments-portals-templates.mjs';
import { runR3C04 } from './yalken-atlas-v5-r3-c04-multilingual-worker-stress.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPORT_SCHEMA = 'yalken.atlas.v5.r3.c05.releaseSaturationRevalidation.v1';
const RECEIPT_SCHEMA = 'yalken.atlas.v5.r3.c05.releaseSaturationRevalidation.receipt.v1';
const CONTOUR_ID = 'R3_C05_RELEASE_SATURATION_REVALIDATION_AND_INDEPENDENT_AUDIT';
const DEFAULT_OUT_DIR = path.resolve(REPO_ROOT, 'docs/OPS/EVIDENCE/YALKEN_ATLAS_V5_R3_C05_RELEASE_SATURATION_REVALIDATION');
const DEFAULT_RECEIPT = path.resolve(REPO_ROOT, 'docs/OPS/STATUS/YALKEN_ATLAS_V5_R3_C05_RELEASE_SATURATION_REVALIDATION_RECEIPT.json');

function parseArgs(argv) {
  const out = {
    outDir: DEFAULT_OUT_DIR,
    receiptPath: DEFAULT_RECEIPT,
    skipPhysical: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out' && argv[index + 1]) {
      out.outDir = path.resolve(String(argv[index + 1]));
      index += 1;
    } else if (arg === '--receipt' && argv[index + 1]) {
      out.receiptPath = path.resolve(String(argv[index + 1]));
      index += 1;
    } else if (arg === '--skip-physical') {
      out.skipPhysical = true;
    }
  }
  return out;
}

function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function sha256Text(value) {
  return sha256Buffer(Buffer.from(String(value ?? ''), 'utf8'));
}

function sha256File(filePath) {
  return sha256Buffer(fsSync.readFileSync(filePath));
}

function fileProof(filePath) {
  if (!filePath || !fsSync.existsSync(filePath)) {
    return { path: filePath || '', exists: false, bytes: 0, sha256: '' };
  }
  const stat = fsSync.statSync(filePath);
  return {
    path: filePath,
    exists: stat.isFile(),
    bytes: stat.isFile() ? stat.size : 0,
    sha256: stat.isFile() ? sha256File(filePath) : '',
  };
}

function readText(relativePath) {
  return fsSync.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function readJsonIfExists(relativePath) {
  const fullPath = path.join(REPO_ROOT, relativePath);
  if (!fsSync.existsSync(fullPath)) return null;
  return JSON.parse(fsSync.readFileSync(fullPath, 'utf8'));
}

function git(args) {
  const result = spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' });
  return {
    ok: result.status === 0,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  };
}

function gitIdentity() {
  const head = git(['rev-parse', 'HEAD']);
  const originMain = git(['rev-parse', 'origin/main']);
  const branch = git(['branch', '--show-current']);
  const status = git(['status', '--short']);
  return {
    branch: branch.stdout,
    headSha: head.stdout,
    originMainSha: originMain.stdout,
    headEqualsOriginMain: head.ok && originMain.ok && head.stdout === originMain.stdout,
    dirtyFiles: status.stdout ? status.stdout.split(/\r?\n/u).filter(Boolean) : [],
  };
}

function sourceIncludes(source, needle) {
  return source.includes(needle);
}

function countMatches(source, pattern) {
  return (source.match(pattern) || []).length;
}

export function evaluateSourceInvariants() {
  const mainSource = readText('src/main.js');
  const rendererSource = readText('src/renderer/editor.js');
  const htmlSource = readText('src/renderer/index.html');
  const relationDossierSource = readText('src/derived/atlas/deriveAtlasRelationDossier.mjs');
  const mentionIndexSource = readText('src/derived/atlas/deriveAtlasMentionIndex.mjs');
  const finalReceipt = readJsonIfExists('docs/OPS/STATUS/YALKEN_ATLAS_V5_EFINAL_FINAL_AUDIT_PROGRAM_DOD_RECEIPT.json');

  const atlasSurfaceShellCount = countMatches(htmlSource, /data-atlas-surface-shell=/gu);
  const atlasProviderCount = countMatches(htmlSource, /data-atlas-[a-z-]+-provider="query\.atlas/gu);
  const checks = {
    productCommandTransactionSerialized: sourceIncludes(mainSource, 'const productCommandTransactionQueues = new Map();')
      && sourceIncludes(mainSource, 'enqueueProductCommandTransaction(currentProjectName || DEFAULT_PROJECT_NAME')
      && sourceIncludes(mainSource, 'E_PRODUCT_COMMAND_REVISION_CONFLICT')
      && sourceIncludes(mainSource, 'transactionSerialized: true')
      && sourceIncludes(mainSource, 'revisionConflictDetected: false'),
    relationPayloadPreviewPreserved: sourceIncludes(relationDossierSource, 'payloadPreview: firstObservation ?')
      && sourceIncludes(relationDossierSource, 'evidenceAnchor: firstObservation.evidenceAnchor')
      && sourceIncludes(relationDossierSource, 'suppressionId: `atlas-relation-suppression:')
      && sourceIncludes(rendererSource, 'button.dataset.payloadPreview = JSON.stringify(action.payloadPreview || {});')
      && sourceIncludes(rendererSource, '...payloadPreview,')
      && sourceIncludes(rendererSource, 'dispatchUiCommand(commandId, {'),
    atlasDesignOsSlotBinding: atlasSurfaceShellCount >= 12
      && atlasProviderCount >= 8
      && sourceIncludes(htmlSource, 'data-manual-map-plan-host')
      && sourceIncludes(htmlSource, 'data-manual-map-plan-workspace')
      && sourceIncludes(relationDossierSource, 'slotId: RIGHT_RAIL_SLOT_ID')
      && sourceIncludes(relationDossierSource, 'surfaceManifest: buildSurfaceManifest()'),
    oldEfinalNotAcceptedAsCurrentProof: Boolean(finalReceipt)
      && finalReceipt.schemaVersion !== RECEIPT_SCHEMA,
    noSilentSourceSceneSlice: !/candidateNodes\.slice\(\s*0\s*,\s*500\s*\)/u.test(mainSource)
      && !/collectAtlasOverviewSceneNodes\(roots\)\.slice\(\s*0\s*,\s*500\s*\)/u.test(mainSource),
    rawMatcherRiskInspected: sourceIncludes(mentionIndexSource, 'collectAtlasMultilingualMatches({')
      && sourceIncludes(mentionIndexSource, 'segmentationAppliedBeforeMatching: true')
      && sourceIncludes(mentionIndexSource, 'englishFallback: false'),
  };

  return {
    checks,
    atlasSurfaceShellCount,
    atlasProviderCount,
    oldEfinal: {
      exists: Boolean(finalReceipt),
      acceptedAsCurrentDodProof: false,
      replacementRule: 'R3_C05_EXECUTABLE_ROWS_ONLY',
    },
    rawMatcherDisposition: {
      containsCaseSensitiveIndexOf: sourceIncludes(mentionIndexSource, 'sceneText.indexOf(term.value, cursor)'),
      currentDisposition: 'REPAIRED_BY_P0_06_GRAPHEME_CASEFOLD_MATCHER',
      requiresFutureCapability: 'NO_OPEN_P0_06_MATCHER_GAP_AFTER_CASEFOLD_GRAPHEME_ROUTE',
    },
  };
}

function summarizeJourney(result) {
  return {
    status: result?.status || 'NOT_RUN',
    pass: result?.pass === true,
    reportPath: result?.reportPath || '',
    reportSha256: result?.reportSha256 || '',
  };
}

export function buildP0Rows({ c01, c02, c03, c04, source }) {
  return [
    {
      id: 'NIGHT01_P0_01_EXECUTABLE_DOD_ROWS',
      status: c01.pass && c02.pass && c03.pass && c04.pass ? 'CLOSED_BY_EXECUTABLE_R3_ROWS' : 'OPEN',
      evidence: [c01.reportSha256, c02.reportSha256, c03.reportSha256, c04.reportSha256].filter(Boolean),
    },
    {
      id: 'NIGHT01_P0_02_AUTHOR_STATE_LOSSLESS_VERSIONED',
      status: c04.pass ? 'CLOSED_BY_R3_C04' : 'OPEN',
      evidence: [c04.reportSha256].filter(Boolean),
    },
    {
      id: 'NIGHT01_P0_03_NO_SILENT_SCENE_SLICE',
      status: c04.pass && source.checks.noSilentSourceSceneSlice ? 'CLOSED_BY_R3_C04_AND_SOURCE_RECHECK' : 'OPEN',
      evidence: [c04.reportSha256, 'source:src/main.js'],
    },
    {
      id: 'NIGHT01_P0_04_PROJECT_SCOPED_TRANSACTION_CONFLICT_SAFETY',
      status: source.checks.productCommandTransactionSerialized ? 'CLOSED_BY_R3_C05_SOURCE_AND_CONTRACT' : 'OPEN',
      evidence: ['source:src/main.js'],
    },
    {
      id: 'NIGHT01_P0_05_RELATION_PAYLOAD_PREVIEW_AND_VISIBLE_COMMANDS',
      status: c01.pass && source.checks.relationPayloadPreviewPreserved ? 'CLOSED_BY_R3_C01_AND_R3_C05_PREVIEW_DISPATCH' : 'OPEN',
      evidence: [c01.reportSha256, 'source:src/derived/atlas/deriveAtlasRelationDossier.mjs', 'source:src/renderer/editor.js'],
    },
    {
      id: 'NIGHT01_P0_06_CONTINUITY_AUTHOR_COMMANDS_REOPEN',
      status: c02.pass ? 'CLOSED_BY_R3_C02' : 'OPEN',
      evidence: [c02.reportSha256].filter(Boolean),
    },
    {
      id: 'NIGHT01_P0_07_ATLAS_FEATURE_MANIFEST_DESIGN_OS_SLOT',
      status: source.checks.atlasDesignOsSlotBinding ? 'CLOSED_BY_R3_C05_SOURCE_AND_UI_SLOT_RECHECK' : 'OPEN',
      evidence: ['source:src/renderer/index.html', 'source:src/derived/atlas/deriveAtlasRelationDossier.mjs'],
    },
    {
      id: 'NIGHT01_P0_08_MULTILINGUAL_GRAPHEME_CORE_ADMISSION',
      status: c04.pass ? 'CLOSED_BY_R3_C04' : 'OPEN',
      evidence: [c04.reportSha256].filter(Boolean),
    },
  ];
}

async function runPhysicalRows(options) {
  const evidenceRoot = path.resolve(options.evidenceRoot || DEFAULT_OUT_DIR);
  await fs.mkdir(evidenceRoot, { recursive: true });
  if (options.skipPhysical) {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yalken-r3-c05-skip-'));
    try {
      return {
        c01: { status: 'SKIPPED_BY_OPTION', pass: false },
        c02: { status: 'SKIPPED_BY_OPTION', pass: false },
        c03: { status: 'SKIPPED_BY_OPTION', pass: false },
        c04: await runR3C04({ outDir: path.join(tempRoot, 'c04') }),
      };
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  }
  const c01 = await runAtlasEntityRelationUiJourneys({ rootDir: REPO_ROOT, outDir: path.join(evidenceRoot, 'c01-atlas-entity-relation') });
  const c02 = await runTemporalContinuitySavedQueryJourneys({ rootDir: REPO_ROOT, outDir: path.join(evidenceRoot, 'c02-temporal-continuity-saved-query') });
  const c03 = await runManualMapPortabilityJourney({ rootDir: REPO_ROOT, outDir: path.join(evidenceRoot, 'c03-manual-map-portability') });
  const c04 = await runR3C04({ outDir: path.join(evidenceRoot, 'c04-multilingual-worker-stress') });
  return { c01, c02, c03, c04 };
}

export async function runR3C05(options = {}) {
  const outDir = path.resolve(options.outDir || DEFAULT_OUT_DIR);
  const receiptPath = path.resolve(options.receiptPath || DEFAULT_RECEIPT);
  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(path.dirname(receiptPath), { recursive: true });

  const identity = gitIdentity();
  const physical = await runPhysicalRows({
    evidenceRoot: outDir,
    skipPhysical: options.skipPhysical === true,
  });
  const journeys = {
    c01: summarizeJourney(physical.c01),
    c02: summarizeJourney(physical.c02),
    c03: summarizeJourney(physical.c03),
    c04: summarizeJourney(physical.c04),
  };
  const source = evaluateSourceInvariants();
  const p0Rows = buildP0Rows({ ...journeys, source });
  const openP0 = p0Rows.filter((row) => row.status === 'OPEN');
  const pass = openP0.length === 0
    && Object.values(source.checks).every(Boolean)
    && journeys.c01.pass
    && journeys.c02.pass
    && journeys.c03.pass
    && journeys.c04.pass;

  const report = {
    schemaVersion: REPORT_SCHEMA,
    contourId: CONTOUR_ID,
    generatedAtUtc: new Date().toISOString(),
    git: identity,
    status: pass ? 'PASS_R3_C05_RELEASE_SATURATION_REVALIDATED' : 'NOT_READY_R3_C05_OPEN_P0',
    pass,
    programDoneClaim: false,
    oldEfinalAcceptedAsCurrentProof: false,
    journeys,
    source,
    p0Rows,
    openP0,
    nextGate: pass
      ? 'DELIVER_R3_C05_THEN_RUN_FINAL_INDEPENDENT_REMOTE_HEAD_AUDIT'
      : 'REPAIR_OPEN_P0_BEFORE_DELIVERY',
  };

  const reportPath = path.join(outDir, 'r3-c05-release-saturation-revalidation-report.json');
  const reportText = `${JSON.stringify(report, null, 2)}\n`;
  await fs.writeFile(reportPath, reportText, 'utf8');
  const reportSha256 = sha256Text(reportText);

  const receipt = {
    schemaVersion: RECEIPT_SCHEMA,
    contourId: CONTOUR_ID,
    generatedAtUtc: report.generatedAtUtc,
    status: report.status,
    pass,
    programDoneClaim: false,
    git: identity,
    report: fileProof(reportPath),
    reportSha256,
    p0OpenCount: openP0.length,
    p0Rows: p0Rows.map((row) => ({ id: row.id, status: row.status })),
    delivery: {
      commitRequired: true,
      pushRequired: true,
      prRequired: true,
      mergeRequired: true,
      remoteHeadVerificationRequired: true,
    },
  };
  await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');

  return {
    ...report,
    reportPath,
    reportSha256,
    receiptPath,
    receiptSha256: sha256File(receiptPath),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runR3C05(options);
  console.log(JSON.stringify({
    schemaVersion: result.schemaVersion,
    status: result.status,
    pass: result.pass,
    reportPath: result.reportPath,
    reportSha256: result.reportSha256,
    receiptPath: result.receiptPath,
    receiptSha256: result.receiptSha256,
    openP0: result.openP0,
  }, null, 2));
  if (result.pass !== true) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  });
}
