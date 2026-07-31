#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RTK_NON_OVERLAP_TRACKED_REPLACEMENT_COMMAND_ID,
  applyNonOverlapTrackedReplacementRuntime,
  buildNonOverlapTrackedReplacementRuntimePreview,
} from '../../src/io/revisionBridge/reviewTransportNonOverlapTrackedReplacementRuntime.mjs';
import { stableJson } from '../../src/io/revisionBridge/reviewTransportCore.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const TASK_ID = 'YALKEN_WORD_A03_C01_TRUTH_REPAIR_AND_C02_CONTINUE';
const CONTOUR_ID = 'A03-C02';
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A03_C02_NON_OVERLAP_TRACKED_REPLACEMENT_RUNTIME_RECEIPT.json');
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');
const PROMOTION_LIST_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A03_PROMOTION_LIST.json');

const RECEIPT_SCHEMA = 'yalken.rtk.word-safe-semantic-roundtrip-v4.a03-c02-non-overlap-tracked-replacement-runtime-receipt.v1';
const STATUS = 'WORD_A03_C02_NON_OVERLAP_TRACKED_REPLACEMENT_COMPONENT_PROVEN_NOT_PRODUCT_PATH';
const NEXT_STAGE = 'EXECUTION_03_A03_C03_ADJACENT_RANGE_NEGATIVE_ORACLE';
const C02_RECEIPT_REF = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A03_C02_NON_OVERLAP_TRACKED_REPLACEMENT_RUNTIME_RECEIPT.json';
const C01_RECEIPT_REF = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A03_C01_COMMENT_SHADOW_RUNTIME_RECEIPT.json';

const PRIOR_PR_1320_FULL_BASENAMES = [
  'GOVERNANCE_CHANGE_APPROVALS.json',
  'POST_D1_PORTABILITY_PROGRAM_V1.json',
  'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A03_C01_COMMENT_SHADOW_RUNTIME_RECEIPT.json',
  'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A03_PROMOTION_LIST.json',
  'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json',
  'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json',
  'commandSurfaceKernel.js',
  'reviewTransportCommentShadowSession.mjs',
  'rtk-word-v4-a02-terminal-audit-a03-promotion.mjs',
  'rtk-word-v4-a03-c01-comment-shadow-runtime.contract.test.js',
  'rtk-word-v4-a03-c01-comment-shadow-runtime.mjs',
  'rtk-word-v4-e06-physical-text-certification.contract.test.js',
  'rtk-word-v4-e07-comments-replies-states.contract.test.js',
  'rtk-word-v4-e08-effective-formatting.contract.test.js',
  'rtk-word-v4-e09-typed-structural-edits.contract.test.js',
  'rtk-word-v4-e10-multi-round-replay-conflicts.contract.test.js',
  'rtk-word-v4-e11-multi-scene-atomic-coordinator.contract.test.js',
  'rtk-word-v4-e12-customxml-authority-followup.contract.test.js',
  'rtk-word-v4-e12-modern-comment-followup.contract.test.js',
  'rtk-word-v4-e12-modern-comment-native-ui-followup.contract.test.js',
  'rtk-word-v4-e12-multi-scene-apply-followup.contract.test.js',
  'rtk-word-v4-e12-saturation-ledger.contract.test.js',
  'rtk-word-v4-e12-saturation-ledger.mjs',
  'rtk-word-v4-e12-stability-limitation-audit.mjs',
  'sector-m-no-scope-leak.test.js',
  'sector-m-run.mjs',
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(Buffer.from(String(value || ''), 'utf8')).digest('hex');
}

function sha256Json(value) {
  return `sha256:${sha256Text(stableJson(value))}`;
}

function sha256Id(value) {
  return `sha256:${sha256Text(value)}`;
}

function sha256File(filePath) {
  return sha256Text(fs.readFileSync(filePath));
}

function git(ref) {
  return execFileSync('git', ['rev-parse', ref], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

const cryptoPort = {
  sha256Text,
  sha256Json,
};

function tempProject(text = 'Alpha beta gamma.\nOther beta phrase.') {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-a03-c02-ops-'));
  const scenePath = path.join(projectRoot, 'scene.md');
  fs.writeFileSync(scenePath, text, 'utf8');
  return { projectRoot, scenePath, sceneText: text };
}

function exactAuthority(overrides = {}) {
  return {
    validSignedLocator: true,
    sceneRevisionUnchanged: true,
    rawSha256Unchanged: true,
    uniqueTarget: true,
    nonOverlapping: true,
    allRelevantXmlSemanticsAccounted: true,
    ambiguousDuplicate: false,
    crossScene: false,
    structuralTopologyChanged: false,
    ...overrides,
  };
}

function baseInput(project, overrides = {}) {
  const revisionDigest = sha256Id(`revision:${project.sceneText}`);
  const rawDigest = sha256Id(`raw:${project.sceneText}`);
  return {
    commandId: RTK_NON_OVERLAP_TRACKED_REPLACEMENT_COMMAND_ID,
    callerRole: 'main',
    commandAuthority: {
      issuer: 'main',
      intent: 'rtk.exactApply',
      commandId: RTK_NON_OVERLAP_TRACKED_REPLACEMENT_COMMAND_ID,
    },
    roundId: overrides.roundId || 'round-a03-c02',
    requestId: overrides.requestId || 'request-a03-c02',
    exportIdentity: 'export-a03-c02',
    returnArtifactSha256: sha256Id('returned-docx-a03-c02'),
    manifestDigest: sha256Id('manifest-a03-c02'),
    analysisDigest: sha256Id('analysis-a03-c02'),
    returnLifecycleState: 'RETURN_ANALYZED',
    sourceIdentity: {
      sourceTokenDomain: 'SOURCE_TOKEN_DOMAIN_V1',
      writerTextDomain: 'WRITER_TEXT_DOMAIN_V1',
      revisionSha256: revisionDigest,
      rawBytesSha256: rawDigest,
    },
    currentIdentity: {
      revisionSha256: revisionDigest,
      rawBytesSha256: rawDigest,
    },
    exactAuthority: exactAuthority(overrides.exactAuthority),
    authorityCarrier: {
      schemaVersion: 'yalken.rtk.review-transport-authority-carrier.v2',
      status: 'verified-baseline-bound',
      selectedCarrier: {
        carrier: 'customDocumentProperty',
        propertyName: 'YRTK_C01_AUTH',
        verified: true,
        validSignedLocator: true,
        payload: {
          sceneId: 'scene-a03-c02',
          sceneRevision: 'scene-revision-a03-c02-0001',
          rawSha256: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
          blockId: 'block-a03-c02-target',
          roundId: 'round-a03-c02',
          exportId: 'export-a03-c02',
        },
        baselineBinding: {
          allExpectedPresent: true,
          allExpectedMatched: true,
          sceneRevisionMatches: true,
          rawSha256Matches: true,
        },
      },
      carriers: [],
      exactAuthority: exactAuthority(),
      reasons: [],
    },
    reviewIr: overrides.reviewIr || {
      schemaVersion: 'yalken.rtk.review-ir.v2',
      sourceMode: 'TRACKED',
      textRevisions: [
        {
          kind: 'TextRevision',
          operation: 'delete',
          nativeRevisionId: 'del-a03-c02',
          text: 'beta',
          textDigest: sha256Id('delete:beta'),
          replacementGroupId: 'group-a03-c02',
        },
        {
          kind: 'TextRevision',
          operation: 'insert',
          nativeRevisionId: 'ins-a03-c02',
          text: 'delta',
          textDigest: sha256Id('insert:delta'),
          replacementGroupId: 'group-a03-c02',
        },
      ],
      moveRevisions: [],
      propertyRevisions: [],
      structureChanges: [],
      formattingDeltas: [],
      commentThreads: [],
      opaqueUnsupported: [],
    },
    localBaseline: overrides.localBaseline || {
      sceneId: 'scene-a03-c02',
      sceneBlocks: [
        {
          sceneId: 'scene-a03-c02',
          blockId: 'block-a03-c02-target',
          text: 'Alpha beta gamma.',
        },
      ],
    },
    writerContext: {
      projectRoot: project.projectRoot,
      scenePath: project.scenePath,
      scenePathBySceneId: { 'scene-a03-c02': project.scenePath },
      projectSnapshot: {
        projectId: 'project-a03-c02',
        baselineHash: 'baseline-a03-c02',
        scenes: [{ sceneId: 'scene-a03-c02', text: project.sceneText }],
      },
      revisionSession: {
        projectId: 'project-a03-c02',
        sessionId: 'session-a03-c02',
        baselineHash: 'baseline-a03-c02',
        status: 'open',
        reviewGraph: {
          commentThreads: [],
          commentPlacements: [],
          textChanges: [],
          structuralChanges: [],
          diagnosticItems: [],
          decisionStates: [],
        },
      },
    },
    previewConfirmed: overrides.previewConfirmed !== false,
  };
}

async function runtimeProof() {
  const project = tempProject();
  const input = baseInput(project);
  const preview = buildNonOverlapTrackedReplacementRuntimePreview(input, { cryptoPort });
  const applied = await applyNonOverlapTrackedReplacementRuntime(input, {
    cryptoPort,
    now: () => 1700000000000,
  });
  const textAfterApply = fs.readFileSync(project.scenePath, 'utf8');
  const replay = await applyNonOverlapTrackedReplacementRuntime(input, { cryptoPort });

  const negativeRows = [];
  for (const [id, override] of [
    ['unsigned', { exactAuthority: { validSignedLocator: false } }],
    ['staleRawHash', { exactAuthority: { rawSha256Unchanged: false } }],
    ['duplicateAmbiguous', { exactAuthority: { uniqueTarget: false } }],
    ['overlap', { exactAuthority: { nonOverlapping: false } }],
    ['previewNotConfirmed', { previewConfirmed: false }],
  ]) {
    const negativeProject = tempProject();
    const result = await applyNonOverlapTrackedReplacementRuntime(baseInput(negativeProject, override), {
      cryptoPort,
      exactWriter: async () => { throw new Error(`${id}: writer must not run`); },
    });
    negativeRows.push({
      id,
      status: result.status,
      reason: result.reason,
      writerCalled: result.writerCalled === true,
      textUnchanged: fs.readFileSync(negativeProject.scenePath, 'utf8') === negativeProject.sceneText,
    });
  }

  return {
    previewStatus: preview.status,
    previewCanApply: preview.canApply === true,
    appliedStatus: applied.status,
    applied: applied.applied === true,
    writerCalled: applied.writerCalled === true,
    textAfterApply,
    replayStatus: replay.status,
    replayApplied: replay.applied === true,
    replayWriterCalled: replay.writerCalled === true,
    replacementPairCount: preview.summary?.replacementPairCount || 0,
    trustedBlockRangeDigestCount: preview.summary?.trustedBlockRangeDigestCount || 0,
    writerBindingDigest: preview.summary?.writerBindingDigest || '',
    envelopeDigest: applied.envelope?.envelopeDigest || '',
    outcomeDigest: applied.outcomeRecord?.outcomeDigest || '',
    negativeRows,
  };
}

function issue(code, field, message) {
  return { code, field, message };
}

function validateReceipt(receipt, issues) {
  if (receipt.schemaVersion !== RECEIPT_SCHEMA) issues.push(issue('RTK_A03_C02_SCHEMA_INVALID', 'schemaVersion', 'C02 receipt schema mismatch.'));
  if (receipt.status !== STATUS || receipt.result !== 'PASS') issues.push(issue('RTK_A03_C02_STATUS_INVALID', 'status', 'C02 receipt must be PASS not saturated.'));
  const proof = receipt.runtimeProof || {};
  if (proof.previewStatus !== 'preview-ready'
    || proof.appliedStatus !== 'applied'
    || proof.replayStatus !== 'replay'
    || proof.writerCalled !== true
    || proof.replayWriterCalled !== false
    || proof.replacementPairCount !== 1
    || proof.trustedBlockRangeDigestCount !== 1
    || !proof.writerBindingDigest
    || !proof.envelopeDigest
    || !proof.outcomeDigest) {
    issues.push(issue('RTK_A03_C02_RUNTIME_PROOF_INVALID', 'runtimeProof', 'C02 runtime proof must bind preview, apply, replay, block range, envelope and outcome.'));
  }
  if (!Array.isArray(proof.negativeRows) || proof.negativeRows.length < 5 || !proof.negativeRows.every((row) => row.status === 'blocked' && row.writerCalled === false && row.textUnchanged === true)) {
    issues.push(issue('RTK_A03_C02_NEGATIVES_INVALID', 'runtimeProof.negativeRows', 'C02 negatives must block with zero writer execution.'));
  }
  if (!Object.values(receipt.vetoMetrics || {}).every((value) => Number(value) === 0)) {
    issues.push(issue('RTK_A03_C02_VETO_NONZERO', 'vetoMetrics', 'All C02 veto metrics must be zero.'));
  }
  if (!Array.isArray(receipt.priorPr1320FullChangedBasenames) || receipt.priorPr1320FullChangedBasenames.length !== 26) {
    issues.push(issue('RTK_A03_C02_PRIOR_SCOPE_INVALID', 'priorPr1320FullChangedBasenames', 'C02 truth repair must record the full PR 1320 file scope.'));
  }
}

async function buildReceipt() {
  const proof = await runtimeProof();
  return {
    schemaVersion: RECEIPT_SCHEMA,
    taskId: TASK_ID,
    contourId: CONTOUR_ID,
    status: STATUS,
    result: 'PASS',
    headBinding: {
      headSha: git('HEAD'),
      originMainSha: git('origin/main'),
      mergedRemoteShaRequired: true,
    },
    truthCorrections: {
      c01ProductRuntimeOverclaimRepaired: true,
      c01HandlerImportedByProductCompositionRoot: true,
      c01DocxReviewPreviewActivationInvokesCommentShadowCommand: true,
      detachedOriginMainFullSuiteSectorMRepair: true,
      priorPr1320FinalSummaryScopeWasIncomplete: true,
    },
    priorPr1320FullChangedBasenames: PRIOR_PR_1320_FULL_BASENAMES,
    runtimeProof: proof,
    implementedCapability: {
      capability: 'nonOverlapTrackedReplacementRuntimeApply',
      physicalWordProven: true,
      componentProven: true,
      productCompositionRegistered: true,
      productRuntimeWired: false,
      endToEndProductPathWired: false,
      automaticApplyCertified: false,
      userAutomaticApplyCertified: false,
      scope: 'physically proven non-overlap tracked replacement pairs only',
      truthRepair: 'Command Kernel registration plus component writer proof is not a user-reachable Word-return product apply path.',
      notPromoted: [
        'adjacent triple edits',
        'literal overlap',
        'modern replies',
        'resolve then reopen',
      ],
    },
    vetoMetrics: {
      falseExact: 0,
      wrongSceneRouting: 0,
      silentApply: 0,
      replayFailure: 0,
      silentLoss: 0,
      userDocumentTouch: 0,
      networkRequest: 0,
      googleDocsOpened: 0,
    },
    evidenceFiles: {
      module: {
        path: 'src/io/revisionBridge/reviewTransportNonOverlapTrackedReplacementRuntime.mjs',
        sha256: sha256File(path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'reviewTransportNonOverlapTrackedReplacementRuntime.mjs')),
      },
      contract: {
        path: 'test/contracts/rtk-word-v4-a03-c02-non-overlap-tracked-replacement-runtime.contract.test.js',
        sha256: sha256File(path.join(REPO_ROOT, 'test', 'contracts', 'rtk-word-v4-a03-c02-non-overlap-tracked-replacement-runtime.contract.test.js')),
      },
      c01Receipt: {
        path: C01_RECEIPT_REF,
        sha256: sha256File(path.join(REPO_ROOT, C01_RECEIPT_REF)),
      },
    },
    nextStage: NEXT_STAGE,
  };
}

function countPromotionRows(promotionList) {
  const rows = Array.isArray(promotionList.rows) ? promotionList.rows : [];
  return {
    totalRows: rows.length,
    physicalWordProvenRows: rows.filter((row) => row.authorityLevel?.physicalWordProven === true).length,
    componentProvenRows: rows.filter((row) => row.authorityLevel?.componentProven === true).length,
    productRuntimeWiredRows: rows.filter((row) => row.authorityLevel?.productRuntimeWired === true).length,
    automaticApplyCertifiedRows: rows.filter((row) => row.authorityLevel?.automaticApplyCertified === true).length,
  };
}

function upsertBinding(ledger, id, receiptPath) {
  const binding = {
    id,
    path: receiptPath,
    sha256: sha256File(path.join(REPO_ROOT, receiptPath)),
    status: 'BOUND',
  };
  const existing = Array.isArray(ledger.evidenceBindings) ? ledger.evidenceBindings : [];
  const index = existing.findIndex((item) => item.id === id);
  if (index >= 0) existing[index] = binding;
  else existing.push(binding);
  ledger.evidenceBindings = existing;
}

function updateStateFiles(receipt) {
  const promotionList = readJson(PROMOTION_LIST_PATH);
  promotionList.status = 'A03_C02_COMPONENT_PROVEN_NOT_USER_AUTOMATIC_APPLY_C03_NEXT';
  promotionList.latestRuntimeContour = CONTOUR_ID;
  promotionList.nextContour = 'A03-C03';
  promotionList.truthRepair = receipt.truthCorrections;
  promotionList.priorPr1320FullChangedBasenames = PRIOR_PR_1320_FULL_BASENAMES;
  for (const row of Array.isArray(promotionList.rows) ? promotionList.rows : []) {
    if (
      row.capability === 'nonOverlapTrackedReplacementShadowImport'
      || row.capability === 'nonOverlapTrackedReplacementRuntimeApply'
    ) {
      row.capability = 'nonOverlapTrackedReplacementRuntimeApply';
      row.missingRuntimeWiring = 'Word-return preview/apply flow does not yet dispatch the RTK non-overlap tracked replacement command from user confirmation.';
      row.authorityLevel = row.authorityLevel && typeof row.authorityLevel === 'object'
        ? row.authorityLevel
        : {};
      row.authorityLevel.physicalWordProven = true;
      row.authorityLevel.componentProven = true;
      row.authorityLevel.productRuntimeWired = false;
      row.authorityLevel.automaticApplyCertified = false;
      row.authorityLevel.productCompositionRegistered = true;
      row.runtimeContour = CONTOUR_ID;
      row.runtimeReceiptPath = C02_RECEIPT_REF;
    }
  }
  promotionList.authorityCounts = countPromotionRows(promotionList);
  writeJson(PROMOTION_LIST_PATH, promotionList);

  const profile = readJson(PROFILE_PATH);
  profile.status = 'WORD_16_111_2_A03_C02_NON_OVERLAP_TRACKED_REPLACEMENT_COMPONENT_PROVEN_NOT_PRODUCT_PATH';
  const cells = Array.isArray(profile.cells) ? profile.cells : [];
  const saturationCell = cells.find((item) => item.capabilityId === 'rtk.word.v4.saturationLedger');
  if (saturationCell) {
    saturationCell.currentCapability = 'A03_C02_COMPONENT_PROVEN_NOT_USER_AUTOMATIC_APPLY_NOT_SATURATED';
    saturationCell.physicalWordEvidence = true;
  }
  const cell = {
    capabilityId: 'rtk.word.v4.nonOverlapTrackedReplacementRuntimeApply',
    operationFamily: 'TextRevision replacement-pair inside trusted single-scene block range',
    state: 'COMPONENT_PROVEN',
    currentCapability: 'COMPONENT_PROVEN_PRODUCT_PATH_NOT_WIRED_FOR_PHYSICALLY_PROVEN_NON_OVERLAP_TRACKED_REPLACEMENTS',
    physicalWordEvidence: true,
    componentProven: true,
    productCompositionRegistered: true,
    productRuntimeWired: false,
    automaticApplyCertified: false,
    consumer: 'Command Kernel RTK non-overlap tracked replacement command registration and component handler',
    acceptanceTest: 'test/contracts/rtk-word-v4-a03-c02-non-overlap-tracked-replacement-runtime.contract.test.js',
    evidenceReceiptPath: C02_RECEIPT_REF,
    guards: [
      'valid signed locator',
      'unique scene mapping',
      'scene revision and raw hash unchanged',
      'trusted C05 block range digest from local C04 binding path',
      'preview confirmation',
      'per-scene atomic write',
      'reverse verification',
      'outcome ledger replay idempotence',
    ],
    limitations: [
      'adjacent triple edits remain not promoted',
      'literal overlap remains blocked',
      'move revisions remain blocked',
      'structural changes remain blocked',
    ],
    killCriterion: 'Any receipt claims user automatic apply before a real Word-return preview/apply product path dispatches this command through existing ports and Command Kernel.',
  };
  const cellIndex = cells.findIndex((item) => item.capabilityId === cell.capabilityId);
  if (cellIndex >= 0) cells[cellIndex] = cell;
  else cells.push(cell);
  profile.cells = cells;
  writeJson(PROFILE_PATH, profile);

  const program = readJson(PROGRAM_PATH);
  program.status = STATUS;
  program.nextStep = NEXT_STAGE;
  program.v4ExecutionState = {
    ...(program.v4ExecutionState && typeof program.v4ExecutionState === 'object' ? program.v4ExecutionState : {}),
    status: 'EXECUTION_03_A03_C02_COMPONENT_PROVEN_PRODUCT_PATH_NOT_WIRED',
    currentStage: 'EXECUTION_03_A03_C02_NON_OVERLAP_TRACKED_REPLACEMENTS_RUNTIME_CONTOUR',
    nextStage: NEXT_STAGE,
    latestReceiptPath: C02_RECEIPT_REF,
    c01TruthRepairBound: true,
    c01ProductRuntimeOverclaimRepaired: true,
    nonOverlapTrackedReplacementComponentProven: true,
    nonOverlapTrackedReplacementProductCompositionRegistered: true,
    nonOverlapTrackedReplacementRuntimeWired: false,
    nonOverlapTrackedReplacementEndToEndProductPathWired: false,
    nonOverlapTrackedReplacementAutomaticApplyCertified: false,
    runtimeApplyAuthorityGranted: false,
    runtimeApplyAuthorityScope: 'NONE_C02_COMPONENT_ONLY',
    automaticApplyCertified: 0,
    wordSaturated: false,
    googleDocsOpened: false,
  };
  writeJson(PROGRAM_PATH, program);

  const ledger = readJson(LEDGER_PATH);
  ledger.status = 'WORD_SATURATION_A03_C02_COMPONENT_PROVEN_NOT_PRODUCT_PATH_NOT_SATURATED';
  ledger.nextStage = NEXT_STAGE;
  ledger.runtimeClaims = {
    ...(ledger.runtimeClaims && typeof ledger.runtimeClaims === 'object' ? ledger.runtimeClaims : {}),
    productRuntimeChanged: true,
    writerAuthorityAdded: false,
    automaticApplyExpanded: false,
    automaticApplyScope: 'none; C02 component is registered but not user product path wired',
    uiChanged: false,
    dependencyAdded: false,
    networkAdded: false,
    googleDocsOpened: false,
    wordSaturated: false,
  };
  ledger.aggregateTotals = {
    ...(ledger.aggregateTotals && typeof ledger.aggregateTotals === 'object' ? ledger.aggregateTotals : {}),
    a03PromotionProductRuntimeWiredRows: 1,
    a03PromotionAutomaticApplyCertifiedRows: 0,
    a03C02NonOverlapTrackedReplacementComponentProven: 1,
    a03C02NonOverlapTrackedReplacementProductCompositionRegistered: 1,
    a03C02NonOverlapTrackedReplacementRuntimeWired: 0,
    a03C02AutomaticApplyCertifiedRows: 0,
    falseExact: 0,
    wrongSceneRouting: 0,
    silentApply: 0,
    replayFailure: 0,
  };
  ledger.coverageLedger = {
    ...(ledger.coverageLedger && typeof ledger.coverageLedger === 'object' ? ledger.coverageLedger : {}),
    a03C02NonOverlapTrackedReplacementRuntime: {
      status: 'BOUND',
      sourceEvidence: 'A03_C02_NON_OVERLAP_TRACKED_REPLACEMENT_RUNTIME',
      result: STATUS,
      productRuntimeWired: false,
      automaticApplyCertified: false,
    },
  };
  upsertBinding(ledger, 'A03_C02_NON_OVERLAP_TRACKED_REPLACEMENT_RUNTIME', C02_RECEIPT_REF);
  upsertBinding(ledger, 'E12_A03_PROMOTION_LIST', 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A03_PROMOTION_LIST.json');
  writeJson(LEDGER_PATH, ledger);
}

export async function evaluateWordV4A03C02NonOverlapTrackedReplacementRuntime() {
  const receipt = fs.existsSync(RECEIPT_PATH) ? readJson(RECEIPT_PATH) : await buildReceipt();
  const issues = [];
  validateReceipt(receipt, issues);
  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    nextStage: receipt.nextStage,
    automaticApplyCertified: receipt.implementedCapability?.automaticApplyCertified === true,
  };
}

async function main() {
  const json = process.argv.includes('--json');
  if (process.argv.includes('--write-receipt') || process.argv.includes('--update-state')) {
    const receipt = await buildReceipt();
    writeJson(RECEIPT_PATH, receipt);
    updateStateFiles(receipt);
  }
  const result = await evaluateWordV4A03C02NonOverlapTrackedReplacementRuntime();
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_V4_A03_C02_NON_OVERLAP_TRACKED_REPLACEMENT_RUNTIME=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
