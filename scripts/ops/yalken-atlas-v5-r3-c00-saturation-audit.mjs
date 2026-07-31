#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_OUT_DIR = 'docs/OPS/EVIDENCE/YALKEN_ATLAS_V5_R3_C00_SATURATION_AUDIT';
const DEFAULT_PHYSICAL_REPORT = `${DEFAULT_OUT_DIR}/physical-black-box/r2-c05-honest-black-box-acceptance-report.json`;
const DEFAULT_RECEIPT = 'docs/OPS/STATUS/YALKEN_ATLAS_V5_R3_C00_SATURATION_AUDIT_RECEIPT.json';

const REQUIRED_BLACK_BOX_ACCEPTANCE = Object.freeze([
  'visibleInputRuntime',
  'pointerAndKeyboardUsed',
  'createRenameConnectMoveSearchDelete',
  'cancelNoop',
  'hitTestableNonblankGraph',
  'listKeyboardParity',
  'saveQuitReopenRecovery',
  'exportRepeatImport',
  'noNetworkNoDialogs',
  'noWrongTargetOrViewStatePersistence',
  'noOverflow',
]);

const NEXT_R3_CONTOURS = Object.freeze([
  'R3_C01_ATLAS_ENTITY_RELATION_UI_JOURNEYS',
  'R3_C02_ATLAS_TEMPORAL_CONTINUITY_SAVED_QUERY_JOURNEYS',
  'R3_C03_MANUAL_MAP_ATTACHMENTS_PORTALS_TEMPLATES_SATURATION',
  'R3_C04_MULTILINGUAL_WORKER_STRESS_AND_STALE_RESULT_SATURATION',
  'R3_C05_RELEASE_SATURATION_REVALIDATION_AND_INDEPENDENT_AUDIT',
]);

function parseArgs(argv) {
  const args = {
    outDir: DEFAULT_OUT_DIR,
    physicalReport: DEFAULT_PHYSICAL_REPORT,
    receiptPath: DEFAULT_RECEIPT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out' && argv[index + 1]) {
      args.outDir = argv[index + 1];
      index += 1;
    } else if (arg === '--physical-report' && argv[index + 1]) {
      args.physicalReport = argv[index + 1];
      index += 1;
    } else if (arg === '--receipt' && argv[index + 1]) {
      args.receiptPath = argv[index + 1];
      index += 1;
    }
  }
  return args;
}

function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function sha256File(relativeOrAbsolutePath, root = repoRoot) {
  const filePath = path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.resolve(root, relativeOrAbsolutePath);
  return sha256Buffer(fs.readFileSync(filePath));
}

function fileProof(relativeOrAbsolutePath, root = repoRoot) {
  const filePath = path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.resolve(root, relativeOrAbsolutePath);
  if (!fs.existsSync(filePath)) {
    return { path: relativeOrAbsolutePath, exists: false, bytes: 0, sha256: '' };
  }
  const stat = fs.statSync(filePath);
  return {
    path: relativeOrAbsolutePath,
    exists: stat.isFile(),
    bytes: stat.isFile() ? stat.size : 0,
    sha256: stat.isFile() ? sha256File(filePath) : '',
  };
}

function readJson(relativeOrAbsolutePath, root = repoRoot) {
  const filePath = path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.resolve(root, relativeOrAbsolutePath);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runGit(args, root = repoRoot) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return {
    ok: result.status === 0,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  };
}

function gitIdentity(root = repoRoot) {
  const head = runGit(['rev-parse', 'HEAD'], root);
  const originMain = runGit(['rev-parse', 'origin/main'], root);
  const branch = runGit(['branch', '--show-current'], root);
  const status = runGit(['status', '--short'], root);
  return {
    branch: branch.stdout,
    headSha: head.stdout,
    originMainSha: originMain.stdout,
    headEqualsOriginMain: head.ok && originMain.ok && head.stdout === originMain.stdout,
    dirtyFileCount: status.stdout ? status.stdout.split(/\r?\n/u).filter(Boolean).length : 0,
  };
}

function allRequiredAcceptanceTrue(report) {
  const accepted = report?.accepted || {};
  return REQUIRED_BLACK_BOX_ACCEPTANCE.every((key) => accepted[key] === true);
}

function countInputEvents(report, type) {
  const events = report?.runtime?.first?.result?.rendererProbe?.inputEvents;
  if (!Array.isArray(events)) return 0;
  return events.filter((event) => event?.type === type).length;
}

function sourceHasAll(source, values) {
  return values.every((value) => source.includes(value));
}

function buildSourceReachability(root = repoRoot) {
  const commandRegistryPath = 'src/shared/productCommandRegistry.cjs';
  const queryRegistryPath = 'src/shared/workspaceQueryRegistry.cjs';
  const commandSource = fs.readFileSync(path.resolve(root, commandRegistryPath), 'utf8');
  const querySource = fs.readFileSync(path.resolve(root, queryRegistryPath), 'utf8');
  const atlasMutationCommands = [
    'atlas.entity.create',
    'atlas.alias.add',
    'atlas.mention.confirm',
    'atlas.observation.suppress',
    'atlas.entity.merge',
    'atlas.entity.splitRestore',
    'atlas.observation.reassign',
    'atlas.evidence.reattach',
    'atlas.savedQuery.save',
    'atlas.calendar.define',
    'atlas.sceneTemporalAnchor.set',
    'atlas.continuityFact.record',
  ];
  const manualMapCommands = [
    'manualMap.create',
    'manualMap.node.add',
    'manualMap.node.update',
    'manualMap.node.delete',
    'manualMap.edge.add',
    'manualMap.edge.delete',
    'manualMap.attachment.add',
    'manualMap.portal.add',
    'manualMap.template.apply',
  ];
  const atlasReadQueries = [
    'query.atlasOverview',
    'query.atlasEntityDossier',
    'query.atlasRelationDossier',
    'query.atlasMatrices',
    'query.atlasHeatmap',
    'query.atlasTemporalLayout',
    'query.atlasContinuityLedgerSurface',
    'query.atlasReportsSavedQueries',
    'query.atlasDiagnosticsStageAcceptance',
    'query.atlasCurrentScene',
  ];
  return {
    atlasMutationCommandsPresent: sourceHasAll(commandSource, atlasMutationCommands),
    manualMapCommandsPresent: sourceHasAll(commandSource, manualMapCommands),
    atlasReadQueriesPresent: sourceHasAll(querySource, atlasReadQueries),
    commandRegistryProof: fileProof(commandRegistryPath, root),
    queryRegistryProof: fileProof(queryRegistryPath, root),
  };
}

export function evaluateSaturationAudit(input = {}) {
  const root = input.repoRoot ? path.resolve(input.repoRoot) : repoRoot;
  const physicalReportPath = input.physicalReport || DEFAULT_PHYSICAL_REPORT;
  const physicalProof = input.physicalProof || fileProof(physicalReportPath, root);
  const physicalReport = input.physicalReportDoc || (physicalProof.exists ? readJson(physicalReportPath, root) : null);
  const git = input.gitIdentity || gitIdentity(root);
  const sourceReachability = input.sourceReachability || buildSourceReachability(root);

  const physicalUiProof = Boolean(
    physicalReport?.pass === true
    && physicalReport?.status === 'PASS_VISIBLE_UI_BLACK_BOX_ACCEPTANCE'
    && physicalReport?.runtime?.first?.runtimeKind === 'production-electron-visible-input-black-box'
    && physicalReport?.runtime?.second?.runtimeKind === 'production-electron-visible-input-black-box'
    && allRequiredAcceptanceTrue(physicalReport)
    && countInputEvents(physicalReport, 'mouseDown') >= 8
    && countInputEvents(physicalReport, 'char') >= 4
    && physicalReport?.negativeAssertions?.directIpcAcceptedJourney === false
    && physicalReport?.negativeAssertions?.proofByScreenshotByteSizeOnly === false
  );

  const capabilityRows = [
    {
      id: 'manual-map-core-visible-journey',
      authority: 'manual-map-product-authority',
      status: physicalUiProof ? 'PHYSICALLY_PROVEN_THIS_CONTOUR' : 'NOT_PROVEN',
      evidence: physicalProof.sha256,
    },
    {
      id: 'atlas-entity-alias-mention-evidence-journey',
      authority: 'atlas-product-authority',
      status: sourceReachability.atlasMutationCommandsPresent ? 'SOURCE_REACHABLE_REQUIRES_R3_PHYSICAL_JOURNEY' : 'MISSING_SOURCE_REACHABILITY',
      evidence: sourceReachability.commandRegistryProof.sha256,
    },
    {
      id: 'atlas-read-surfaces-overview-dossier-matrices-heatmap-reports',
      authority: 'atlas-projection-authority',
      status: sourceReachability.atlasReadQueriesPresent ? 'SOURCE_REACHABLE_REQUIRES_R3_PHYSICAL_JOURNEY' : 'MISSING_SOURCE_REACHABILITY',
      evidence: sourceReachability.queryRegistryProof.sha256,
    },
    {
      id: 'atlas-temporal-calendar-continuity-saved-query-flow',
      authority: 'atlas-command-and-projection-authority',
      status: sourceReachability.atlasMutationCommandsPresent && sourceReachability.atlasReadQueriesPresent
        ? 'SOURCE_REACHABLE_REQUIRES_R3_PHYSICAL_JOURNEY'
        : 'MISSING_SOURCE_REACHABILITY',
      evidence: `${sourceReachability.commandRegistryProof.sha256}:${sourceReachability.queryRegistryProof.sha256}`,
    },
    {
      id: 'manual-map-attachments-portals-templates',
      authority: 'manual-map-product-authority',
      status: sourceReachability.manualMapCommandsPresent ? 'SOURCE_REACHABLE_REQUIRES_R3_PHYSICAL_JOURNEY' : 'MISSING_SOURCE_REACHABILITY',
      evidence: sourceReachability.commandRegistryProof.sha256,
    },
    {
      id: 'multilingual-grapheme-worker-staleness-large-graph-stress',
      authority: 'derived-worker-and-anchor-authority',
      status: 'REQUIRES_R3_PHYSICAL_STRESS_MATRIX',
      evidence: 'NO_CURRENT_R3_PHYSICAL_STRESS_MATRIX',
    },
  ];

  const releaseVetoes = {
    generatedArtifactsAloneAccepted: false,
    screenshotsAloneAccepted: false,
    directIpcAccepted: false,
    staleProjectionAcceptedAsTruth: false,
    designToolMetadataAcceptedAsRuntimeReadiness: false,
    programDoneClaim: false,
  };

  const hasMissingSourceReachability = capabilityRows.some((row) => row.status === 'MISSING_SOURCE_REACHABILITY');
  const pass = physicalUiProof && !hasMissingSourceReachability;
  return {
    schemaVersion: 'yalken.atlas.v5.r3.c00.saturationAudit.v1',
    taskId: 'YALKEN_ATLAS_V5_MAXIMUM_PRODUCT_RELEASE_SATURATION',
    contourId: 'R3_C00_SATURATION_AUDIT_AND_CONTOUR_COMPILATION',
    programStage: 'R3_MAXIMUM_PRODUCT_RELEASE_SATURATION_2026_07_31',
    status: pass ? 'PASS_AUDIT_READY_FOR_R3_REPAIR_QUEUE' : 'NOT_READY_R3_C00_AUDIT_GAP',
    pass,
    generatedAtUtc: new Date().toISOString(),
    git,
    designToolRouter: {
      status: 'APPLIED',
      question: 'desktop graph workbench inspector density without changing approved Yalken visual canon',
      lazywebAdvisory: {
        query: 'graph workbench inspector',
        platform: 'desktop',
        coverage: 'weak',
        runtimeReadinessToken: false,
      },
    },
    physicalEvidence: {
      report: physicalProof,
      acceptedAsCapabilityEvidence: physicalUiProof,
      requiredAcceptance: REQUIRED_BLACK_BOX_ACCEPTANCE,
      mouseDownCount: countInputEvents(physicalReport, 'mouseDown'),
      charCount: countInputEvents(physicalReport, 'char'),
    },
    sourceReachability,
    capabilityRows,
    releaseVetoes,
    certifiedByThisContour: physicalUiProof ? ['manual-map-core-visible-journey-fresh-r3-proof'] : [],
    notCertifiedByThisContour: capabilityRows
      .filter((row) => row.status !== 'PHYSICALLY_PROVEN_THIS_CONTOUR')
      .map((row) => row.id),
    nextContours: NEXT_R3_CONTOURS,
    programDodVerdict: 'NOT_DONE_R3_SATURATION_REPAIRS_REQUIRED',
  };
}

function writeJson(relativeOrAbsolutePath, value, root = repoRoot) {
  const filePath = path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.resolve(root, relativeOrAbsolutePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = evaluateSaturationAudit({ physicalReport: args.physicalReport });
  const reportPath = path.join(args.outDir, 'r3-c00-saturation-audit-report.json');
  writeJson(reportPath, report);
  const reportProof = fileProof(reportPath);
  const receipt = {
    schemaVersion: 'YALKEN_ATLAS_V5_R3_C00_SATURATION_AUDIT_RECEIPT_V1',
    taskId: report.taskId,
    contourId: report.contourId,
    programStage: report.programStage,
    status: report.status,
    pass: report.pass,
    generatedAtUtc: report.generatedAtUtc,
    git: report.git,
    reportPath,
    reportSha256: reportProof.sha256,
    physicalEvidenceAccepted: report.physicalEvidence.acceptedAsCapabilityEvidence,
    certifiedByThisContour: report.certifiedByThisContour,
    notCertifiedByThisContour: report.notCertifiedByThisContour,
    nextContours: report.nextContours,
    programDodVerdict: report.programDodVerdict,
    delivery: {
      commit: 'PENDING_PRE_COMMIT',
      push: 'PENDING',
      pr: 'PENDING',
      ci: 'PENDING',
      merge: 'PENDING',
      remoteShaVerification: 'PENDING',
    },
  };
  writeJson(args.receiptPath, receipt);
  console.log(`YALKEN_ATLAS_R3_C00_SATURATION_AUDIT_RESULT=${report.status}`);
  console.log(`YALKEN_ATLAS_R3_C00_SATURATION_AUDIT_REPORT=${reportPath}`);
  console.log(`YALKEN_ATLAS_R3_C00_SATURATION_AUDIT_RECEIPT=${args.receiptPath}`);
  if (!report.pass) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
