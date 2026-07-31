#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_STABILITY_LIMITATION_AUDIT_RECEIPT.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');

const SCHEMA = 'yalken.rtk.word-safe-semantic-roundtrip-v4.e12-stability-limitation-audit-receipt.v1';
const STATUS = 'WORD_STABILITY_LIMITATION_AUDIT_COMPLETE_NOT_SATURATED';
const NEXT_STAGE = 'EXECUTION_12_NEXT_PHYSICAL_STABILITY_WAVE_300_REPEAT';
const SUCCESSOR_STAGE = 'EXECUTION_12_WORD_LIMITATION_FOLLOWUP_AFTER_STABLE_WAVES';
const REQUIRED_LIMITATIONS = Object.freeze([
  'SECOND_CONSECUTIVE_STABLE_APPROVED_WAVE_REQUIRED',
  'MODERN_REPLY_RESOLVE_REOPEN_REMAINS_TYPED_LIMITATION',
  'CUSTOM_XML_MUTATING_WORD_SAVE_DROPS_AUTHORITY',
  'AUTOMATIC_MULTI_SCENE_APPLY_REMAINS_SHADOW_ONLY',
  'WAVE300_SINGLE_PARSER_GAP_REQUIRES_CASE_LEVEL_FOLLOWUP',
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function isHex64(value) {
  return /^[0-9a-f]{64}$/u.test(String(value || ''));
}

function issue(code, field, message) {
  return { code, field, message };
}

export function evaluateWordV4E12StabilityLimitationAudit(input = {}) {
  const receipt = input.receipt || readJson(RECEIPT_PATH);
  const ledger = input.ledger || readJson(LEDGER_PATH);
  const profile = input.profile || readJson(PROFILE_PATH);
  const program = input.program || readJson(PROGRAM_PATH);
  const issues = [];
  const add = (code, field, message) => issues.push(issue(code, field, message));
  const ledgerRule = ledger.saturationRule || {};
  const ledgerIsRepeatSuccessor = ledger.status === 'WORD_SATURATION_STABILITY_WAVE300_REPEAT_COMPLETE_NOT_SATURATED'
    && JSON.stringify(ledgerRule.completedWaves) === JSON.stringify([10, 40, 100, 300])
    && Number(ledgerRule.consecutiveStableApprovedWaves) === 2
    && ledgerRule.saturated === false
    && ledgerRule.googleDocsAllowedToOpen === false;
  const ledgerIsFollowupSuccessor = ledger.status === 'WORD_SATURATION_WL2_031_HOSTILE_PACKAGE_TYPED_BLOCK_CONFIRMED_NOT_SATURATED'
    && JSON.stringify(ledgerRule.completedWaves) === JSON.stringify([10, 40, 100, 300])
    && Number(ledgerRule.consecutiveStableApprovedWaves) === 2
    && ledgerRule.saturated === false
    && ledgerRule.googleDocsAllowedToOpen === false;
  const ledgerIsModernCommentSuccessor = (
    ledger.status === 'WORD_SATURATION_MODERN_COMMENT_APPLESCRIPT_LIMITATION_CONFIRMED_NOT_SATURATED'
    || ledger.status === 'WORD_SATURATION_CUSTOM_XML_AUTHORITY_REROUTED_NOT_SATURATED'
    || ledger.status === 'WORD_SATURATION_MULTI_SCENE_APPLY_TYPED_LIMITATION_CONFIRMED_NOT_SATURATED'
    || ledger.status === 'WORD_SATURATION_MODERN_COMMENT_NATIVE_UI_BLOCKED_NOT_SATURATED'
    || ledger.status === 'WORD_SATURATION_MODERN_COMMENT_NATIVE_UI_PHYSICAL_LIMITATION_CONFIRMED_NOT_SATURATED'
    || ledger.status === 'WORD_SATURATION_TARGETED_GAP_CLOSURE_A02_RECONCILED_NOT_SATURATED'
    || ledger.status === 'WORD_SATURATION_A02_TERMINAL_AUDIT_COMPLETE_NOT_SATURATED'
  )
    && JSON.stringify(ledgerRule.completedWaves) === JSON.stringify([10, 40, 100, 300])
    && Number(ledgerRule.consecutiveStableApprovedWaves) === 2
    && ledgerRule.saturated === false
    && ledgerRule.googleDocsAllowedToOpen === false;

  if (receipt.schemaVersion !== SCHEMA) add('RTK_V4_E12_STABILITY_SCHEMA_INVALID', 'schemaVersion', 'Stability limitation audit schema is invalid.');
  if (receipt.stageId !== 'EXECUTION_12_WORD_STABILITY_LIMITATION_AUDIT') add('RTK_V4_E12_STABILITY_STAGE_INVALID', 'stageId', 'Audit stage id is invalid.');
  if (receipt.status !== STATUS) add('RTK_V4_E12_STABILITY_STATUS_INVALID', 'status', 'Audit must complete without claiming Word saturation.');
  if (receipt.boundLedger?.path !== 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json') {
    add('RTK_V4_E12_STABILITY_LEDGER_PATH_INVALID', 'boundLedger.path', 'Audit must bind the E12 saturation ledger.');
  }
  if (!isHex64(receipt.boundLedger?.sha256)) add('RTK_V4_E12_STABILITY_LEDGER_SHA_INVALID', 'boundLedger.sha256', 'Bound ledger SHA-256 is invalid.');
  if (input.requireFiles === true && !ledgerIsRepeatSuccessor && !ledgerIsFollowupSuccessor && !ledgerIsModernCommentSuccessor && receipt.boundLedger?.sha256 !== sha256File(LEDGER_PATH)) {
    add('RTK_V4_E12_STABILITY_LEDGER_SHA_MISMATCH', 'boundLedger.sha256', 'Bound ledger SHA-256 does not match current bytes.');
  }

  const decision = receipt.saturationDecision || {};
  if (decision.wordSaturated !== false || decision.wordSaturationClaimAllowed !== false || decision.googleDocsAllowedToOpen !== false) {
    add('RTK_V4_E12_STABILITY_FALSE_SATURATION', 'saturationDecision', 'Audit must not claim saturation or open Google Docs.');
  }
  if (decision.nextStage !== NEXT_STAGE) add('RTK_V4_E12_STABILITY_NEXT_STAGE_INVALID', 'saturationDecision.nextStage', 'Audit must continue with a physical Word stability wave.');
  if (Number(decision.consecutiveStableApprovedWaves) !== 1 || decision.stableHistogram !== false) {
    add('RTK_V4_E12_STABILITY_WAVE_COUNT_INVALID', 'saturationDecision', 'Audit must preserve the one-stable-wave state and require one more approved stability wave.');
  }

  const veto = receipt.vetoMetrics || {};
  for (const [key, value] of Object.entries(veto)) {
    if (Number(value) !== 0) add('RTK_V4_E12_STABILITY_VETO_NONZERO', `vetoMetrics.${key}`, 'All stability audit veto metrics must be zero.');
  }

  const limitations = Array.isArray(receipt.actionableLimitations) ? receipt.actionableLimitations : [];
  const limitationIds = new Set(limitations.map((item) => item.id));
  for (const id of REQUIRED_LIMITATIONS) {
    if (!limitationIds.has(id)) add('RTK_V4_E12_STABILITY_LIMITATION_MISSING', `actionableLimitations.${id}`, 'Required limitation classification is missing.');
  }
  if (limitations.some((item) => item.resolution === 'WAIVED' || item.status === 'PASS')) {
    add('RTK_V4_E12_STABILITY_LIMITATION_FALSE_PASS', 'actionableLimitations', 'Audit limitations must not be waived or marked PASS.');
  }

  const totals = receipt.observedTotals || {};
  if (Number(totals.physicalRoundTripsObserved) !== 300
    || Number(totals.wave300ParserPass) !== 299
    || Number(totals.visibleAnchoredCommentThreads) !== 638
    || Number(totals.exactAutomaticCandidates) !== 0) {
    add('RTK_V4_E12_STABILITY_TOTALS_INVALID', 'observedTotals', 'Audit totals must bind wave-300 physical evidence and exact candidate count.');
  }

  const ledgerIsAuditState = ledger.status === 'WORD_SATURATION_WAVE300_COMPLETE_NOT_SATURATED'
    && JSON.stringify(ledgerRule.completedWaves) === JSON.stringify([10, 40, 100, 300])
    && Number(ledgerRule.consecutiveStableApprovedWaves) === 1
    && ledgerRule.saturated === false
    && ledgerRule.googleDocsAllowedToOpen === false;
  if (!ledgerIsAuditState && !ledgerIsRepeatSuccessor && !ledgerIsFollowupSuccessor && !ledgerIsModernCommentSuccessor) {
    add('RTK_V4_E12_STABILITY_LEDGER_STATE_INVALID', 'ledger.saturationRule', 'Source ledger must remain wave300 complete not saturated.');
  }

  const cell = Array.isArray(profile.cells) ? profile.cells.find((item) => item.capabilityId === 'rtk.word.v4.saturationLedger') : null;
  const allowedProfileStatuses = new Set([
    'WORD_16_111_2_E12_STABILITY_AUDIT_COMPLETE_NOT_SATURATED',
    'WORD_16_111_2_E12_STABILITY_WAVE300_REPEAT_COMPLETE_NOT_SATURATED',
    'WORD_16_111_2_E12_WL2_031_HOSTILE_PACKAGE_TYPED_BLOCK_CONFIRMED_NOT_SATURATED',
    'WORD_16_111_2_E12_MODERN_COMMENT_APPLESCRIPT_LIMITATION_CONFIRMED_NOT_SATURATED',
    'WORD_16_111_2_E12_CUSTOM_XML_AUTHORITY_REROUTED_NOT_SATURATED',
    'WORD_16_111_2_E12_MULTI_SCENE_APPLY_TYPED_LIMITATION_NOT_SATURATED',
    'WORD_16_111_2_E12_MODERN_COMMENT_NATIVE_UI_BLOCKED_NOT_SATURATED',
    'WORD_16_111_2_E12_MODERN_COMMENT_NATIVE_UI_PHYSICAL_LIMITATION_NOT_SATURATED',
    'WORD_16_111_2_E12_TARGETED_GAP_CLOSURE_A02_RECONCILED_NOT_SATURATED',
    'WORD_16_111_2_A02_TERMINAL_AUDIT_COMPLETE_A03_READY_NOT_SATURATED',
  ]);
  if (!allowedProfileStatuses.has(profile.status)) {
    add('RTK_V4_E12_STABILITY_PROFILE_STATUS_INVALID', 'profile.status', 'Profile must bind the stability audit as complete not saturated.');
  }
  const allowedCapabilities = new Set([
    'STABILITY_LIMITATION_AUDIT_COMPLETE_NOT_SATURATED',
    'STABILITY_WAVE300_REPEAT_COMPLETE_NOT_SATURATED',
    'WL2_031_HOSTILE_PACKAGE_TYPED_BLOCK_CONFIRMED_NOT_SATURATED',
    'MODERN_COMMENT_APPLESCRIPT_LIMITATION_CONFIRMED_NOT_SATURATED',
    'CUSTOM_XML_AUTHORITY_REROUTED_TO_CUSTOM_DOCUMENT_PROPERTY_NOT_SATURATED',
    'MULTI_SCENE_APPLY_TYPED_LIMITATION_CONFIRMED_NOT_SATURATED',
    'MODERN_COMMENT_NATIVE_UI_BLOCKED_EXTERNAL_ACCESSIBILITY_NOT_SATURATED',
    'MODERN_COMMENT_NATIVE_UI_PHYSICAL_LIMITATION_CONFIRMED_NOT_SATURATED',
    'TARGETED_GAP_CLOSURE_A02_RECONCILED_WITH_TYPED_LIMITATIONS',
    'A02_TERMINAL_AUDIT_COMPLETE_A03_READY_NOT_SATURATED',
  ]);
  if (!cell || !allowedCapabilities.has(cell.currentCapability) || cell.state !== 'PHYSICAL_WORD_PROVEN') {
    add('RTK_V4_E12_STABILITY_PROFILE_CELL_INVALID', 'profile.cells.rtk.word.v4.saturationLedger', 'Capability cell must bind stability audit without saturation.');
  }

  const state = program.v4ExecutionState || {};
  const allowedProgramStatuses = new Set([
    'WORD_E12_STABILITY_LIMITATION_AUDIT_COMPLETE_NOT_SATURATED',
    'WORD_E12_STABILITY_WAVE300_REPEAT_COMPLETE_NOT_SATURATED',
    'WORD_E12_WL2_031_HOSTILE_PACKAGE_TYPED_BLOCK_CONFIRMED_NOT_SATURATED',
    'WORD_E12_MODERN_COMMENT_APPLESCRIPT_LIMITATION_CONFIRMED_NOT_SATURATED',
    'WORD_E12_CUSTOM_XML_AUTHORITY_REROUTED_NOT_SATURATED',
    'WORD_E12_MULTI_SCENE_APPLY_TYPED_LIMITATION_CONFIRMED_NOT_SATURATED',
    'WORD_E12_MODERN_COMMENT_NATIVE_UI_BLOCKED_NOT_SATURATED',
    'WORD_E12_MODERN_COMMENT_NATIVE_UI_PHYSICAL_LIMITATION_CONFIRMED_NOT_SATURATED',
    'WORD_E12_TARGETED_GAP_CLOSURE_A02_RECONCILED_NOT_SATURATED',
    'WORD_A02_TERMINAL_AUDIT_COMPLETE_A03_READY_NOT_SATURATED',
  ]);
  if (!allowedProgramStatuses.has(program.status)) {
    add('RTK_V4_E12_STABILITY_PROGRAM_STATUS_INVALID', 'program.status', 'Program status must bind the stability audit.');
  }
  const allowedStateStatuses = new Set([
    'EXECUTION_12_STABILITY_LIMITATION_AUDIT_LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_STABILITY_WAVE',
    'EXECUTION_12_STABILITY_WAVE300_REPEAT_LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_LIMITATION_FOLLOWUP',
    'EXECUTION_12_WL2_031_HOSTILE_PACKAGE_TYPED_BLOCK_CONFIRMED_CONTINUE_REMAINING_WORD_LIMITATIONS',
    'EXECUTION_12_MODERN_COMMENT_APPLESCRIPT_LIMITATION_CONFIRMED_CONTINUE_CUSTOM_XML_AUTHORITY',
    'EXECUTION_12_CUSTOM_XML_AUTHORITY_REROUTED_CONTINUE_MULTI_SCENE_APPLY_CERTIFICATION',
    'EXECUTION_12_MULTI_SCENE_APPLY_TYPED_LIMITATION_CONFIRMED_CONTINUE_MODERN_COMMENT_NATIVE_UI',
    'EXECUTION_12_MODERN_COMMENT_NATIVE_UI_BLOCKED_EXTERNAL_ACCESSIBILITY_WAITING',
    'EXECUTION_12_MODERN_COMMENT_NATIVE_UI_PHYSICAL_LIMITATION_CONFIRMED_NOT_SATURATED',
    'EXECUTION_12_A02_TARGETED_GAP_CLOSURE_RECONCILED_NOT_SATURATED',
    'EXECUTION_12_A02_TERMINAL_AUDIT_COMPLETE_A03_READY',
  ]);
  const allowedCurrentStages = new Set([
    'EXECUTION_12_WORD_STABILITY_LIMITATION_AUDIT',
    'EXECUTION_12_NEXT_PHYSICAL_STABILITY_WAVE_300_REPEAT',
    'EXECUTION_12_WORD_LIMITATION_FOLLOWUP_AFTER_STABLE_WAVES',
    'EXECUTION_12_WORD_LIMITATION_FOLLOWUP_REMAINING_TYPED_LIMITATIONS',
    'EXECUTION_12_WORD_LIMITATION_FOLLOWUP_CUSTOM_XML_MUTATION_AUTHORITY',
    'EXECUTION_12_WORD_LIMITATION_FOLLOWUP_MULTI_SCENE_APPLY_CERTIFICATION',
    'EXECUTION_12_WORD_LIMITATION_FOLLOWUP_MODERN_COMMENT_NATIVE_UI_CERTIFICATION',
    'EXECUTION_12_A02_TERMINAL_WORD_AUDIT_AND_A03_PROMOTION_LIST',
    'EXECUTION_03_A03_SAFE_PORTABILITY_IMPROVEMENTS_RUNTIME_CONTOUR',
  ]);
  const allowedNextStages = new Set([
    NEXT_STAGE,
    SUCCESSOR_STAGE,
    'EXECUTION_12_WORD_LIMITATION_FOLLOWUP_REMAINING_TYPED_LIMITATIONS',
    'EXECUTION_12_WORD_LIMITATION_FOLLOWUP_CUSTOM_XML_MUTATION_AUTHORITY',
    'EXECUTION_12_WORD_LIMITATION_FOLLOWUP_MULTI_SCENE_APPLY_CERTIFICATION',
    'EXECUTION_12_WORD_LIMITATION_FOLLOWUP_MODERN_COMMENT_NATIVE_UI_CERTIFICATION',
    'EXECUTION_12_A02_TERMINAL_WORD_AUDIT_AND_A03_PROMOTION_LIST',
    'EXECUTION_03_A03_SAFE_PORTABILITY_IMPROVEMENTS_RUNTIME_CONTOUR',
  ]);
  if (!allowedStateStatuses.has(state.status)
    || !allowedCurrentStages.has(state.currentStage)
    || !allowedNextStages.has(state.nextStage)
    || state.wordSaturated !== false
    || state.googleDocsOpened !== false) {
    add('RTK_V4_E12_STABILITY_PROGRAM_STATE_INVALID', 'program.v4ExecutionState', 'Program must continue Word-only stability wave sequencing.');
  }

  const currentNextStage = state.status === 'EXECUTION_12_A02_TERMINAL_AUDIT_COMPLETE_A03_READY'
    ? state.nextStage
    : decision.nextStage || '';

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    saturated: decision.wordSaturated === true,
    nextStage: currentNextStage,
    limitations: limitations.length,
  };
}

function main() {
  const json = process.argv.includes('--json');
  const result = evaluateWordV4E12StabilityLimitationAudit({ requireFiles: process.argv.includes('--require-files') });
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_V4_E12_STABILITY_LIMITATION_AUDIT=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
