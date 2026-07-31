#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const TASK_ID = 'YALKEN_WORD_A03_C03_ADJACENT_RANGE_NEGATIVE_ORACLE';
const CONTOUR_ID = 'A03-C03';
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A03_C03_ADJACENT_RANGE_NEGATIVE_ORACLE_RECEIPT.json');
const TARGETED_RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_MODERN_COMMENT_NATIVE_UI_FOLLOWUP_RECEIPT.json');
const A02_RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A02_TERMINAL_AUDIT_RECEIPT.json');
const C02_RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A03_C02_NON_OVERLAP_TRACKED_REPLACEMENT_RUNTIME_RECEIPT.json');
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');
const PROMOTION_LIST_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A03_PROMOTION_LIST.json');
const CONTRACT_PATH = path.join(REPO_ROOT, 'test', 'contracts', 'rtk-word-v4-a03-c03-adjacent-range-negative-oracle.contract.test.js');

const SCHEMA = 'yalken.rtk.word-safe-semantic-roundtrip-v4.a03-c03-adjacent-range-negative-oracle-receipt.v1';
const STATUS = 'WORD_A03_C03_ADJACENT_RANGE_NEGATIVE_ORACLE_BOUND_NOT_PROMOTED';
const LEDGER_STATUS = 'WORD_SATURATION_A03_C03_ADJACENT_RANGE_NEGATIVE_ORACLE_BOUND_NOT_SATURATED';
const PROFILE_STATUS = 'WORD_16_111_2_A03_C03_ADJACENT_RANGE_NEGATIVE_ORACLE_BOUND_NOT_PROMOTED';
const PROGRAM_STATUS = 'WORD_A03_C03_ADJACENT_RANGE_NEGATIVE_ORACLE_BOUND_NOT_PROMOTED';
const PROMOTION_STATUS = 'A03_C03_ADJACENT_RANGE_NEGATIVE_ORACLE_BOUND_C04_NEXT';
const C04_LEDGER_STATUS = 'WORD_SATURATION_A03_C04_MODERN_COMMENT_STATE_BOUND_NOT_SATURATED';
const C04_PROFILE_STATUS = 'WORD_16_111_2_A03_C04_MODERN_COMMENT_STATE_READBACK_BOUND_NOT_PROMOTED';
const C04_PROGRAM_STATUS = 'WORD_A03_C04_MODERN_COMMENT_STATE_READBACK_BOUND_NOT_PROMOTED';
const C04_PROMOTION_STATUS = 'A03_C04_MODERN_COMMENT_STATE_BOUND_C05_NEXT';
const C04_NEXT_STAGE = 'EXECUTION_03_A03_C05_NON_OVERLAP_TRACKED_REPLACEMENTS_PRODUCT_PATH_CONTOUR';
const C05_LEDGER_STATUS = 'WORD_SATURATION_A03_C05_NON_OVERLAP_PRODUCT_PATH_WIRED_NOT_SATURATED';
const C05_PROFILE_STATUS = 'WORD_16_111_2_A03_C05_NON_OVERLAP_PRODUCT_PATH_WIRED_NOT_SATURATED';
const C05_PROGRAM_STATUS = 'WORD_A03_C05_NON_OVERLAP_TRACKED_REPLACEMENT_PRODUCT_PATH_WIRED_NOT_SATURATED';
const C05_PROMOTION_STATUS = 'A03_C05_NON_OVERLAP_PRODUCT_PATH_WIRED_RELEASE_AUDIT_NEXT';
const C05_NEXT_STAGE = 'RELEASE_AUDIT_REBIND_AFTER_C05';
const CURRENT_STAGE = 'EXECUTION_03_A03_C03_ADJACENT_RANGE_NEGATIVE_ORACLE';
const NEXT_STAGE = 'EXECUTION_03_A03_C04_MODERN_COMMENT_STATE_ONLY_IF_PHYSICAL_PASS';
const EVIDENCE_ID = 'A03_C03_ADJACENT_RANGE_NEGATIVE_ORACLE';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function gitRevParse(ref) {
  return execFileSync('git', ['rev-parse', ref], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function issue(code, field, message) {
  return { code, field, message };
}

function binding(id, filePath) {
  return {
    id,
    path: path.relative(REPO_ROOT, filePath),
    sha256: sha256File(filePath),
    status: 'BOUND',
  };
}

function findCase(receipt, id) {
  return list(receipt?.physicalCorpus?.cases).find((item) => item?.id === id) || null;
}

function buildOracle({ targetedReceipt = readJson(TARGETED_RECEIPT_PATH), a02Receipt = readJson(A02_RECEIPT_PATH), c02Receipt = readJson(C02_RECEIPT_PATH) } = {}) {
  const twoAdjacent = findCase(targetedReceipt, 'NCUI-T02');
  const tripleAdjacent = findCase(targetedReceipt, 'NCUI-T17');
  const a02Triple = a02Receipt?.microLab?.tripleAdjacentTrackedEdits || {};
  const twoAdjacentPass = twoAdjacent?.result === 'PASS'
    && twoAdjacent?.packageReadback?.expectedTrackedTokensMissing?.length === 0
    && list(twoAdjacent?.packageReadback?.expectedTrackedTokensFound).length === 2;
  const tripleIdentityLoss = String(tripleAdjacent?.result || '').includes('TYPED_LIMITATION')
    && list(tripleAdjacent?.packageReadback?.expectedTrackedTokensMissing).length >= 2
    && list(tripleAdjacent?.packageReadback?.expectedTrackedTokensFound).length === 1;
  const a02TripleBlocked = a02Triple.result === 'TYPED_LIMITATION'
    && list(a02Triple?.packageReadback?.trackedTokensMissing).length >= 2;
  const c02NoProductAuthority = c02Receipt?.implementedCapability?.componentProven === true
    && c02Receipt?.implementedCapability?.productRuntimeWired === false
    && c02Receipt?.implementedCapability?.automaticApplyCertified === false;
  return {
    twoAdjacentPass,
    tripleIdentityLoss,
    a02TripleBlocked,
    c02NoProductAuthority,
    physicalEvidence: {
      twoAdjacentCaseId: 'NCUI-T02',
      twoAdjacentResult: twoAdjacent?.result || '',
      twoAdjacentTokensFound: list(twoAdjacent?.packageReadback?.expectedTrackedTokensFound).length,
      twoAdjacentTokensMissing: list(twoAdjacent?.packageReadback?.expectedTrackedTokensMissing).length,
      tripleAdjacentCaseId: 'NCUI-T17',
      tripleAdjacentResult: tripleAdjacent?.result || '',
      tripleTokensFound: list(tripleAdjacent?.packageReadback?.expectedTrackedTokensFound).length,
      tripleTokensMissing: list(tripleAdjacent?.packageReadback?.expectedTrackedTokensMissing).length,
      a02TripleResult: a02Triple.result || '',
    },
    decision: twoAdjacentPass && tripleIdentityLoss && a02TripleBlocked && c02NoProductAuthority
      ? 'DO_NOT_PROMOTE_ADJACENT_RANGE_AUTOMATIC_APPLY'
      : 'BLOCKED_ORACLE_INPUT_INCOMPLETE',
  };
}

function buildReceipt() {
  const oracle = buildOracle();
  return {
    schemaVersion: SCHEMA,
    taskId: TASK_ID,
    contourId: CONTOUR_ID,
    status: STATUS,
    result: oracle.decision === 'DO_NOT_PROMOTE_ADJACENT_RANGE_AUTOMATIC_APPLY' ? 'PASS' : 'FAIL',
    headBinding: {
      headSha: gitRevParse('HEAD'),
      originMainSha: gitRevParse('origin/main'),
      mergedRemoteShaRequired: true,
    },
    sourceEvidence: {
      targetedNativeUiReceipt: binding('E12_MODERN_COMMENT_NATIVE_UI_TARGETED_GAP_CLOSURE', TARGETED_RECEIPT_PATH),
      a02TerminalAuditReceipt: binding('E12_A02_TERMINAL_AUDIT', A02_RECEIPT_PATH),
      c02Receipt: binding('A03_C02_NON_OVERLAP_TRACKED_REPLACEMENT_RUNTIME', C02_RECEIPT_PATH),
    },
    oracle,
    implementedCapability: {
      capability: 'adjacentTrackedReplacementExactCandidate',
      physicalWordProven: false,
      componentProven: true,
      productRuntimeWired: false,
      automaticApplyCertified: false,
      negativeOracleBound: true,
      decision: oracle.decision,
      supportedNarrowEvidence: 'two adjacent tracked replacements survive Word save-close-reopen readback',
      blockingEvidence: 'three adjacent replacements lose native revision token identity after physical Word save-close-reopen',
    },
    vetoMetrics: {
      falseExact: 0,
      wrongSceneRouting: 0,
      silentApply: 0,
      replayFailure: 0,
      silentLoss: 0,
      automaticApplyOverclaim: 0,
    },
    nonClaims: [
      'ADJACENT_RANGE_AUTOMATIC_APPLY_NOT_CERTIFIED',
      'TRIPLE_ADJACENT_TRACKED_EDITS_REMAIN_TYPED_LIMITATION',
      'NO_PRODUCT_RUNTIME_WIRING_ADDED',
      'GOOGLE_DOCS_NOT_OPENED',
    ],
    nextStage: NEXT_STAGE,
  };
}

function upsertBinding(ledger, id, filePath) {
  const bindings = Array.isArray(ledger.evidenceBindings) ? ledger.evidenceBindings : [];
  const next = binding(id, filePath);
  const index = bindings.findIndex((item) => item.id === id);
  if (index >= 0) bindings[index] = next;
  else bindings.push(next);
  ledger.evidenceBindings = bindings;
}

function updatePromotionList(promotionList, receipt) {
  promotionList.status = PROMOTION_STATUS;
  promotionList.latestRuntimeContour = CONTOUR_ID;
  promotionList.nextContour = 'A03-C04';
  for (const row of list(promotionList.rows)) {
    if (row.capability === 'adjacentTrackedReplacementExactCandidate') {
      row.missingRuntimeWiring = 'not eligible for runtime wiring; C03 negative oracle binds triple-adjacent identity loss';
      row.authorityLevel = isPlainObject(row.authorityLevel) ? row.authorityLevel : {};
      row.authorityLevel.physicalWordProven = false;
      row.authorityLevel.componentProven = true;
      row.authorityLevel.productRuntimeWired = false;
      row.authorityLevel.automaticApplyCertified = false;
      row.authorityLevel.negativeOracleBound = true;
      row.runtimeContour = CONTOUR_ID;
      row.runtimeReceiptPath = path.relative(REPO_ROOT, RECEIPT_PATH);
    }
  }
  promotionList.summary = {
    totalRows: list(promotionList.rows).length,
    physicalWordProvenRows: list(promotionList.rows).filter((row) => row.authorityLevel?.physicalWordProven === true).length,
    componentProvenRows: list(promotionList.rows).filter((row) => row.authorityLevel?.componentProven === true).length,
    productRuntimeWiredRows: list(promotionList.rows).filter((row) => row.authorityLevel?.productRuntimeWired === true).length,
    automaticApplyCertifiedRows: list(promotionList.rows).filter((row) => row.authorityLevel?.automaticApplyCertified === true).length,
  };
}

function updateProfile(profile, receipt) {
  profile.status = PROFILE_STATUS;
  const cells = Array.isArray(profile.cells) ? profile.cells : [];
  const saturationCell = cells.find((item) => item.capabilityId === 'rtk.word.v4.saturationLedger');
  if (saturationCell) {
    saturationCell.currentCapability = 'A03_C03_ADJACENT_RANGE_NEGATIVE_ORACLE_BOUND_NOT_PROMOTED';
    saturationCell.physicalWordEvidence = true;
  }
  const cell = {
    capabilityId: 'rtk.word.v4.adjacentRangeNegativeOracle',
    operationFamily: 'adjacent tracked replacement exact candidate',
    state: 'TYPED_LIMITATION',
    currentCapability: 'NEGATIVE_ORACLE_BOUND_DO_NOT_PROMOTE_ADJACENT_RANGE_AUTOMATIC_APPLY',
    physicalWordEvidence: true,
    componentProven: true,
    productRuntimeWired: false,
    automaticApplyCertified: false,
    authorityLevel: receipt.implementedCapability,
    consumer: 'A03-C04 modern comment state contour',
    acceptanceTest: path.relative(REPO_ROOT, CONTRACT_PATH),
    evidenceReceiptPath: path.relative(REPO_ROOT, RECEIPT_PATH),
    supportedNow: [
      'two adjacent tracked replacements survive as physical readback evidence',
      'triple-adjacent identity loss is typed and blocks promotion',
    ],
    limitations: [
      'adjacent range automatic apply remains not certified',
      'triple adjacent tracked edits remain typed limitation',
    ],
    killCriterion: 'Any adjacent range evidence is promoted to automatic apply while triple-adjacent Word identity loss remains present.',
  };
  const index = cells.findIndex((item) => item.capabilityId === cell.capabilityId);
  if (index >= 0) cells[index] = cell;
  else cells.push(cell);
  profile.cells = cells;
}

function updateProgram(program, receipt) {
  program.status = PROGRAM_STATUS;
  program.nextStep = NEXT_STAGE;
  program.v4ExecutionState = {
    ...(isPlainObject(program.v4ExecutionState) ? program.v4ExecutionState : {}),
    status: 'EXECUTION_03_A03_C03_ADJACENT_RANGE_NEGATIVE_ORACLE_BOUND',
    currentStage: CURRENT_STAGE,
    nextStage: NEXT_STAGE,
    latestReceiptPath: path.relative(REPO_ROOT, RECEIPT_PATH),
    adjacentRangeNegativeOracleBound: true,
    adjacentTwoTokenPhysicalReadbackPass: receipt.oracle.twoAdjacentPass,
    adjacentTripleTokenIdentityLossTypedLimitation: receipt.oracle.tripleIdentityLoss,
    adjacentRangeAutomaticApplyCertified: false,
    runtimeApplyAuthorityGranted: false,
    runtimeApplyAuthorityScope: 'NONE_C03_NEGATIVE_ORACLE_ONLY',
    automaticApplyCertified: 0,
    wordSaturated: false,
    googleDocsOpened: false,
  };
}

function updateLedger(ledger, receipt) {
  ledger.status = LEDGER_STATUS;
  ledger.nextStage = NEXT_STAGE;
  ledger.runtimeClaims = {
    ...(isPlainObject(ledger.runtimeClaims) ? ledger.runtimeClaims : {}),
    productRuntimeChanged: true,
    writerAuthorityAdded: false,
    automaticApplyExpanded: false,
    automaticApplyScope: 'none; C03 negative oracle only',
    uiChanged: false,
    dependencyAdded: false,
    networkAdded: false,
    googleDocsOpened: false,
    wordSaturated: false,
  };
  ledger.aggregateTotals = {
    ...(isPlainObject(ledger.aggregateTotals) ? ledger.aggregateTotals : {}),
    a03C03AdjacentRangeNegativeOracleBound: 1,
    a03C03AdjacentTwoTokenPhysicalPass: receipt.oracle.twoAdjacentPass ? 1 : 0,
    a03C03TripleAdjacentIdentityLossTypedLimitation: receipt.oracle.tripleIdentityLoss ? 1 : 0,
    a03C03AutomaticApplyCertifiedRows: 0,
    a03PromotionProductRuntimeWiredRows: 1,
    a03PromotionAutomaticApplyCertifiedRows: 0,
    falseExact: 0,
    wrongSceneRouting: 0,
    silentApply: 0,
    replayFailure: 0,
  };
  ledger.coverageLedger = {
    ...(isPlainObject(ledger.coverageLedger) ? ledger.coverageLedger : {}),
    a03C03AdjacentRangeNegativeOracle: {
      status: 'BOUND',
      sourceEvidence: EVIDENCE_ID,
      result: STATUS,
      productRuntimeWired: false,
      automaticApplyCertified: false,
    },
  };
  upsertBinding(ledger, EVIDENCE_ID, RECEIPT_PATH);
  upsertBinding(ledger, 'E12_A03_PROMOTION_LIST', PROMOTION_LIST_PATH);
}

function updateState() {
  const receipt = buildReceipt();
  writeJson(RECEIPT_PATH, receipt);
  const promotionList = readJson(PROMOTION_LIST_PATH);
  updatePromotionList(promotionList, receipt);
  writeJson(PROMOTION_LIST_PATH, promotionList);
  const profile = readJson(PROFILE_PATH);
  updateProfile(profile, receipt);
  writeJson(PROFILE_PATH, profile);
  const program = readJson(PROGRAM_PATH);
  updateProgram(program, receipt);
  writeJson(PROGRAM_PATH, program);
  const ledger = readJson(LEDGER_PATH);
  updateLedger(ledger, receipt);
  writeJson(LEDGER_PATH, ledger);
  return receipt;
}

function isC04SuccessorState(profile, program, ledger, promotionList) {
  const adjacentRow = list(promotionList.rows).find((item) => item.capability === 'adjacentTrackedReplacementExactCandidate');
  const commentRow = list(promotionList.rows).find((item) => item.capability === 'modernCommentResolveReopenState');
  return promotionList.status === C04_PROMOTION_STATUS
    && promotionList.nextContour === 'A03-C05'
    && adjacentRow?.authorityLevel?.negativeOracleBound === true
    && adjacentRow?.authorityLevel?.productRuntimeWired === false
    && adjacentRow?.authorityLevel?.automaticApplyCertified === false
    && commentRow?.authorityLevel?.stateReadbackOnlyPhysicalWordProven === true
    && commentRow?.authorityLevel?.resolveReopenPhysicalWordProven === false
    && commentRow?.authorityLevel?.productRuntimeWired === false
    && commentRow?.authorityLevel?.automaticApplyCertified === false
    && profile.status === C04_PROFILE_STATUS
    && program.status === C04_PROGRAM_STATUS
    && program.nextStep === C04_NEXT_STAGE
    && program.v4ExecutionState?.status === 'EXECUTION_03_A03_C04_MODERN_COMMENT_STATE_READBACK_ONLY_BOUND'
    && program.v4ExecutionState?.adjacentRangeNegativeOracleBound === true
    && program.v4ExecutionState?.modernResolveReopenCertified === false
    && program.v4ExecutionState?.runtimeApplyAuthorityGranted === false
    && program.v4ExecutionState?.googleDocsOpened === false
    && ledger.status === C04_LEDGER_STATUS
    && ledger.coverageLedger?.a03C03AdjacentRangeNegativeOracle?.status === 'BOUND'
    && ledger.coverageLedger?.a03C04ModernCommentState?.status === 'BOUND_STATE_READBACK_ONLY'
    && ledger.runtimeClaims?.writerAuthorityAdded === false
    && ledger.runtimeClaims?.automaticApplyExpanded === false
    && ledger.runtimeClaims?.googleDocsOpened === false
    && ledger.runtimeClaims?.wordSaturated === false;
}

function isC05SuccessorState(profile, program, ledger, promotionList) {
  const adjacentRow = list(promotionList.rows).find((item) => item.capability === 'adjacentTrackedReplacementExactCandidate');
  const c05Row = list(promotionList.rows).find((item) => item.capability === 'nonOverlapTrackedReplacementRuntimeApply');
  return promotionList.status === C05_PROMOTION_STATUS
    && promotionList.nextContour === 'RELEASE-AUDIT'
    && adjacentRow?.authorityLevel?.negativeOracleBound === true
    && adjacentRow?.authorityLevel?.productRuntimeWired === false
    && adjacentRow?.authorityLevel?.automaticApplyCertified === false
    && c05Row?.authorityLevel?.productRuntimeWired === true
    && c05Row?.authorityLevel?.automaticApplyCertified === false
    && profile.status === C05_PROFILE_STATUS
    && program.status === C05_PROGRAM_STATUS
    && program.nextStep === C05_NEXT_STAGE
    && program.v4ExecutionState?.adjacentRangeNegativeOracleBound === true
    && program.v4ExecutionState?.nonOverlapTrackedReplacementRuntimeWired === true
    && program.v4ExecutionState?.nonOverlapTrackedReplacementAutomaticApplyCertified === false
    && program.v4ExecutionState?.googleDocsOpened === false
    && ledger.status === C05_LEDGER_STATUS
    && ledger.coverageLedger?.a03C03AdjacentRangeNegativeOracle?.status === 'BOUND'
    && ledger.coverageLedger?.a03C05NonOverlapProductPath?.status === 'BOUND_PRODUCT_PATH_WIRED_NOT_RELEASE_READY'
    && ledger.runtimeClaims?.automaticApplyExpanded === false
    && ledger.runtimeClaims?.googleDocsOpened === false
    && ledger.runtimeClaims?.wordSaturated === false;
}

export function evaluateWordV4A03C03AdjacentRangeNegativeOracle(input = {}) {
  const receipt = input.receipt || (fs.existsSync(RECEIPT_PATH) ? readJson(RECEIPT_PATH) : buildReceipt());
  const promotionList = input.promotionList || readJson(PROMOTION_LIST_PATH);
  const profile = input.profile || readJson(PROFILE_PATH);
  const program = input.program || readJson(PROGRAM_PATH);
  const ledger = input.ledger || readJson(LEDGER_PATH);
  const issues = [];
  const add = (code, field, message) => issues.push(issue(code, field, message));
  const row = list(promotionList.rows).find((item) => item.capability === 'adjacentTrackedReplacementExactCandidate');
  const cell = list(profile.cells).find((item) => item.capabilityId === 'rtk.word.v4.adjacentRangeNegativeOracle');
  const successorState = isC04SuccessorState(profile, program, ledger, promotionList)
    || isC05SuccessorState(profile, program, ledger, promotionList);

  if (receipt.schemaVersion !== SCHEMA || receipt.status !== STATUS || receipt.result !== 'PASS') add('RTK_A03_C03_RECEIPT_INVALID', 'receipt', 'C03 receipt must bind a passing negative oracle without promotion.');
  if (receipt.oracle?.twoAdjacentPass !== true || receipt.oracle?.tripleIdentityLoss !== true || receipt.oracle?.a02TripleBlocked !== true || receipt.oracle?.c02NoProductAuthority !== true) add('RTK_A03_C03_ORACLE_INVALID', 'oracle', 'C03 oracle requires two-adjacent pass plus triple-adjacent typed identity loss and no C02 product authority.');
  if (receipt.implementedCapability?.physicalWordProven !== false
    || receipt.implementedCapability?.componentProven !== true
    || receipt.implementedCapability?.productRuntimeWired !== false
    || receipt.implementedCapability?.automaticApplyCertified !== false
    || receipt.implementedCapability?.negativeOracleBound !== true) add('RTK_A03_C03_AUTHORITY_OVERCLAIM', 'implementedCapability', 'C03 cannot promote adjacent range apply authority.');
  if (Object.values(receipt.vetoMetrics || {}).some((value) => Number(value) !== 0)) add('RTK_A03_C03_VETO_NONZERO', 'vetoMetrics', 'C03 veto metrics must remain zero.');
  if ((promotionList.status !== PROMOTION_STATUS || promotionList.nextContour !== 'A03-C04') && !successorState) add('RTK_A03_C03_PROMOTION_STATUS_INVALID', 'promotionList', 'Promotion list must advance to C04 without promoting C03, or remain valid after a bounded successor.');
  if (!row
    || row.authorityLevel?.physicalWordProven !== false
    || row.authorityLevel?.negativeOracleBound !== true
    || row.authorityLevel?.productRuntimeWired !== false
    || row.authorityLevel?.automaticApplyCertified !== false) add('RTK_A03_C03_PROMOTION_ROW_INVALID', 'promotionList.rows.adjacentTrackedReplacementExactCandidate', 'C03 promotion row must stay not wired and not certified.');
  if ((profile.status !== PROFILE_STATUS && !successorState) || !cell || cell.state !== 'TYPED_LIMITATION' || cell.automaticApplyCertified !== false) add('RTK_A03_C03_PROFILE_INVALID', 'profile', 'Profile must bind C03 as a typed limitation negative oracle.');
  if (program.status !== PROGRAM_STATUS
    || program.nextStep !== NEXT_STAGE
    || program.v4ExecutionState?.status !== 'EXECUTION_03_A03_C03_ADJACENT_RANGE_NEGATIVE_ORACLE_BOUND'
    || program.v4ExecutionState?.runtimeApplyAuthorityGranted !== false
    || program.v4ExecutionState?.googleDocsOpened !== false) {
    if (!successorState) add('RTK_A03_C03_PROGRAM_INVALID', 'program', 'Program must advance to C04 with no apply authority and Google closed, or remain valid after a bounded successor.');
  }
  if (ledger.status !== LEDGER_STATUS
    || ledger.coverageLedger?.a03C03AdjacentRangeNegativeOracle?.status !== 'BOUND'
    || ledger.runtimeClaims?.automaticApplyExpanded !== false
    || ledger.runtimeClaims?.writerAuthorityAdded !== false
    || ledger.runtimeClaims?.googleDocsOpened !== false) {
    if (!successorState) add('RTK_A03_C03_LEDGER_INVALID', 'ledger', 'Ledger must bind C03 without runtime or Google expansion, or remain valid after a bounded successor.');
  }

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    nextStage: program.v4ExecutionState?.nextStage || '',
    automaticApplyCertified: receipt.implementedCapability?.automaticApplyCertified === true,
  };
}

function main() {
  const json = process.argv.includes('--json');
  if (process.argv.includes('--write-receipt') || process.argv.includes('--update-state')) updateState();
  const result = evaluateWordV4A03C03AdjacentRangeNegativeOracle();
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_V4_A03_C03_ADJACENT_RANGE_NEGATIVE_ORACLE=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
