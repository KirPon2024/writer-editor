#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');

const REQUIRED_EVIDENCE = [
  'E06_PHYSICAL_TEXT',
  'E07_COMMENTS',
  'E08_FORMATTING',
  'E09_STRUCTURE',
  'E10_REPLAY_HOSTILE',
  'E11_MULTI_SCENE_COORDINATOR',
  'E12_PHYSICAL_WAVE40',
  'E12_PHYSICAL_WAVE100',
  'E12_PHYSICAL_WAVE300',
  'E12_PHYSICAL_WAVE300_REPEAT_01',
  'E12_WL2_031_HOSTILE_PACKAGE_TYPED_BLOCK',
  'E12_MODERN_COMMENT_APPLESCRIPT_LIMITATION',
  'E12_CUSTOM_XML_AUTHORITY_REROUTE',
  'E12_MULTI_SCENE_APPLY_LIMITATION',
  'E12_MODERN_COMMENT_NATIVE_UI_TARGETED_GAP_CLOSURE',
  'E12_A02_TERMINAL_AUDIT',
  'E12_A03_PROMOTION_LIST',
];

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

function getById(items, id) {
  return Array.isArray(items) ? items.find((item) => item && item.id === id) : null;
}

function allZero(record, allowedMissing = []) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
  for (const [key, value] of Object.entries(record)) {
    if (allowedMissing.includes(key)) continue;
    if (Number(value) !== 0) return false;
  }
  return true;
}

function verifyEvidenceBinding(binding, issues, { requireFiles }) {
  if (!binding) {
    issues.push(issue('RTK_V4_E12_EVIDENCE_BINDING_MISSING', 'evidenceBindings', 'Required evidence binding is missing.'));
    return null;
  }
  if (!REQUIRED_EVIDENCE.includes(binding.id)) {
    issues.push(issue('RTK_V4_E12_EVIDENCE_ID_INVALID', `evidenceBindings.${binding.id}`, 'Unknown E12 evidence binding id.'));
  }
  if (!isHex64(binding.sha256)) {
    issues.push(issue('RTK_V4_E12_EVIDENCE_SHA_INVALID', `evidenceBindings.${binding.id}.sha256`, 'Evidence binding requires a lowercase SHA-256 digest.'));
  }
  if (binding.status !== 'BOUND') {
    issues.push(issue('RTK_V4_E12_EVIDENCE_STATUS_INVALID', `evidenceBindings.${binding.id}.status`, 'Evidence binding must be BOUND.'));
  }

  const relativePath = String(binding.path || '');
  if (requireFiles) {
    const absolutePath = path.join(REPO_ROOT, relativePath);
    if (!relativePath || !fs.existsSync(absolutePath)) {
      issues.push(issue('RTK_V4_E12_EVIDENCE_FILE_MISSING', `evidenceBindings.${binding.id}.path`, 'Evidence file must exist when requireFiles is enabled.'));
      return null;
    }
    const actual = sha256File(absolutePath);
    if (actual !== binding.sha256) {
      issues.push(issue('RTK_V4_E12_EVIDENCE_SHA_MISMATCH', `evidenceBindings.${binding.id}.sha256`, 'Evidence file SHA-256 does not match binding.'));
    }
    return readJson(absolutePath);
  }
  return null;
}

export function evaluateWordV4E12SaturationLedger(input = {}) {
  const receipt = input.receipt || readJson(RECEIPT_PATH);
  const profile = input.profile || readJson(PROFILE_PATH);
  const program = input.program || readJson(PROGRAM_PATH);
  const issues = [];
  const add = (code, field, message) => issues.push(issue(code, field, message));

  if (receipt.schemaVersion !== 'yalken.rtk.word-safe-semantic-roundtrip-v4.e12-saturation-ledger-receipt.v1') {
    add('RTK_V4_E12_SCHEMA_INVALID', 'schemaVersion', 'E12 receipt schema is invalid.');
  }
  if (receipt.stageId !== 'EXECUTION_12_UNICODE_HOSTILE_PERFORMANCE_CRASH_REPLAY_ESCALATING_WORD_WAVES') {
    add('RTK_V4_E12_STAGE_INVALID', 'stageId', 'E12 stage id is invalid.');
  }
  const allowedReceiptStatuses = new Set([
    'WORD_SATURATION_WAVE300_COMPLETE_NOT_SATURATED',
    'WORD_SATURATION_STABILITY_WAVE300_REPEAT_COMPLETE_NOT_SATURATED',
    'WORD_SATURATION_WL2_031_HOSTILE_PACKAGE_TYPED_BLOCK_CONFIRMED_NOT_SATURATED',
    'WORD_SATURATION_MODERN_COMMENT_APPLESCRIPT_LIMITATION_CONFIRMED_NOT_SATURATED',
    'WORD_SATURATION_CUSTOM_XML_AUTHORITY_REROUTED_NOT_SATURATED',
    'WORD_SATURATION_MULTI_SCENE_APPLY_TYPED_LIMITATION_CONFIRMED_NOT_SATURATED',
    'WORD_SATURATION_MODERN_COMMENT_NATIVE_UI_BLOCKED_NOT_SATURATED',
    'WORD_SATURATION_MODERN_COMMENT_NATIVE_UI_PHYSICAL_LIMITATION_CONFIRMED_NOT_SATURATED',
    'WORD_SATURATION_TARGETED_GAP_CLOSURE_A02_RECONCILED_NOT_SATURATED',
    'WORD_SATURATION_A02_TERMINAL_AUDIT_COMPLETE_NOT_SATURATED',
    'WORD_SATURATION_A03_C01_COMMENT_SHADOW_RUNTIME_WIRED_NOT_SATURATED',
  ]);
  if (!allowedReceiptStatuses.has(receipt.status)) {
    add('RTK_V4_E12_STATUS_INVALID', 'status', 'E12 must bind wave 300 complete while staying not-saturated until all wave criteria are proven.');
  }

  const wave = receipt.saturationRule || {};
  if (wave.saturated !== false || wave.wordSaturationClaimAllowed !== false) {
    add('RTK_V4_E12_FALSE_SATURATION_CLAIM', 'saturationRule', 'E12 receipt must not claim Word SATURATED before criteria are met.');
  }
  if (JSON.stringify(wave.requiredWaveSequence) !== JSON.stringify([10, 40, 100, 300])) {
    add('RTK_V4_E12_WAVE_SEQUENCE_INVALID', 'saturationRule.requiredWaveSequence', 'Required physical wave sequence must be 10, 40, 100, 300.');
  }
  if (JSON.stringify(wave.completedWaves) !== JSON.stringify([10, 40, 100, 300])
    || Number(wave.lastCompletedWaveTarget) !== 300
    || Number(wave.currentWaveTarget) !== 300
    || Number(wave.currentWaveObservedRounds) !== 300) {
    add('RTK_V4_E12_WAVE_ACCOUNTING_INVALID', 'saturationRule', 'E12 must bind completed waves 10, 40, 100, and 300 before the stability limitation audit.');
  }
  if (![1, 2].includes(Number(wave.consecutiveStableApprovedWaves))) {
    add('RTK_V4_E12_STABLE_WAVE_OVERCLAIM', 'saturationRule.consecutiveStableApprovedWaves', 'Stable wave count must bind approved post-wave-300 stability without claiming saturation.');
  }

  const bindings = Array.isArray(receipt.evidenceBindings) ? receipt.evidenceBindings : [];
  for (const id of REQUIRED_EVIDENCE) {
    verifyEvidenceBinding(getById(bindings, id), issues, { requireFiles: input.requireFiles === true });
  }

  if (input.requireFiles === true) {
    const e06 = verifyEvidenceBinding(getById(bindings, 'E06_PHYSICAL_TEXT'), issues, { requireFiles: true });
    const e07 = verifyEvidenceBinding(getById(bindings, 'E07_COMMENTS'), issues, { requireFiles: true });
    const e10 = verifyEvidenceBinding(getById(bindings, 'E10_REPLAY_HOSTILE'), issues, { requireFiles: true });
    const e12Wave40 = verifyEvidenceBinding(getById(bindings, 'E12_PHYSICAL_WAVE40'), issues, { requireFiles: true });
    const e12Wave100 = verifyEvidenceBinding(getById(bindings, 'E12_PHYSICAL_WAVE100'), issues, { requireFiles: true });
    const e12Wave300 = verifyEvidenceBinding(getById(bindings, 'E12_PHYSICAL_WAVE300'), issues, { requireFiles: true });
    const e12Wave300Repeat = getById(bindings, 'E12_PHYSICAL_WAVE300_REPEAT_01')
      ? verifyEvidenceBinding(getById(bindings, 'E12_PHYSICAL_WAVE300_REPEAT_01'), issues, { requireFiles: true })
      : null;
    const e12ParserGapFollowup = getById(bindings, 'E12_WL2_031_HOSTILE_PACKAGE_TYPED_BLOCK')
      ? verifyEvidenceBinding(getById(bindings, 'E12_WL2_031_HOSTILE_PACKAGE_TYPED_BLOCK'), issues, { requireFiles: true })
      : null;
    const e12ModernCommentFollowup = getById(bindings, 'E12_MODERN_COMMENT_APPLESCRIPT_LIMITATION')
      ? verifyEvidenceBinding(getById(bindings, 'E12_MODERN_COMMENT_APPLESCRIPT_LIMITATION'), issues, { requireFiles: true })
      : null;
    const e12CustomXmlFollowup = getById(bindings, 'E12_CUSTOM_XML_AUTHORITY_REROUTE')
      ? verifyEvidenceBinding(getById(bindings, 'E12_CUSTOM_XML_AUTHORITY_REROUTE'), issues, { requireFiles: true })
      : null;
    const e12MultiSceneFollowup = getById(bindings, 'E12_MULTI_SCENE_APPLY_LIMITATION')
      ? verifyEvidenceBinding(getById(bindings, 'E12_MULTI_SCENE_APPLY_LIMITATION'), issues, { requireFiles: true })
      : null;
    const e12ModernNativeUiFollowup = getById(bindings, 'E12_MODERN_COMMENT_NATIVE_UI_TARGETED_GAP_CLOSURE')
      ? verifyEvidenceBinding(getById(bindings, 'E12_MODERN_COMMENT_NATIVE_UI_TARGETED_GAP_CLOSURE'), issues, { requireFiles: true })
      : null;
    const e12A02TerminalAudit = getById(bindings, 'E12_A02_TERMINAL_AUDIT')
      ? verifyEvidenceBinding(getById(bindings, 'E12_A02_TERMINAL_AUDIT'), issues, { requireFiles: true })
      : null;
    const e12A03PromotionList = getById(bindings, 'E12_A03_PROMOTION_LIST')
      ? verifyEvidenceBinding(getById(bindings, 'E12_A03_PROMOTION_LIST'), issues, { requireFiles: true })
      : null;
    if (e06?.physicalTextTotals?.physicalRoundTrips !== 32 || e06?.vetoMetrics?.falseExact !== 0) {
      add('RTK_V4_E12_E06_TOTALS_INVALID', 'evidenceBindings.E06_PHYSICAL_TEXT', 'E06 must bind 32 physical text round trips with zero false exact.');
    }
    if (e07?.commentTotals?.visibleAnchoredThreads !== 91 || e07?.commentTotals?.silentCommentLoss !== 0 || e07?.commentTotals?.noOpCommentPassClaimed !== 0) {
      add('RTK_V4_E12_E07_COMMENT_TOTALS_INVALID', 'evidenceBindings.E07_COMMENTS', 'E07 must bind visible comments without silent loss or no-op pass.');
    }
    if (e10?.multiRoundTotals?.hostilePackageBlockedCases !== 1 || e10?.vetoMetrics?.replayFailure !== 0) {
      add('RTK_V4_E12_E10_REPLAY_HOSTILE_INVALID', 'evidenceBindings.E10_REPLAY_HOSTILE', 'E10 must bind hostile package block and zero replay failure.');
    }
    if (e12Wave40?.wave?.target !== 40
      || e12Wave40?.wave?.observedRounds !== 40
      || e12Wave40?.wave?.completed !== true
      || e12Wave40?.totals?.physicalOpenEditSaveCloseReopenPass !== 40
      || e12Wave40?.vetoMetrics?.falseExact !== 0
      || e12Wave40?.saturationDecision?.wordSaturated !== false) {
      add('RTK_V4_E12_WAVE40_INVALID', 'evidenceBindings.E12_PHYSICAL_WAVE40', 'E12 must bind a complete 40-round physical Word wave without a saturation claim.');
    }
    if (e12Wave100?.wave?.target !== 100
      || e12Wave100?.wave?.observedRounds !== 100
      || e12Wave100?.wave?.completed !== true
      || e12Wave100?.totals?.physicalOpenEditSaveCloseReopenPass !== 100
      || e12Wave100?.totals?.parserPass !== 99
      || e12Wave100?.vetoMetrics?.falseExact !== 0
      || e12Wave100?.saturationDecision?.wordSaturated !== false
      || e12Wave100?.wordSandboxWorkRoot?.insideWordContainer !== true
      || e12Wave100?.wordSandboxWorkRoot?.plainTmpForbidden !== true) {
      add('RTK_V4_E12_WAVE100_INVALID', 'evidenceBindings.E12_PHYSICAL_WAVE100', 'E12 must bind a complete 100-round physical Word wave in the Word sandbox work root without a saturation claim.');
    }
    if (e12Wave300?.wave?.target !== 300
      || e12Wave300?.wave?.observedRounds !== 300
      || e12Wave300?.wave?.completed !== true
      || e12Wave300?.totals?.physicalOpenEditSaveCloseReopenPass !== 300
      || e12Wave300?.totals?.parserPass !== 299
      || e12Wave300?.vetoMetrics?.falseExact !== 0
      || e12Wave300?.saturationDecision?.wordSaturated !== false
      || e12Wave300?.wordSandboxWorkRoot?.insideWordContainer !== true
      || e12Wave300?.wordSandboxWorkRoot?.plainTmpForbidden !== true) {
      add('RTK_V4_E12_WAVE300_INVALID', 'evidenceBindings.E12_PHYSICAL_WAVE300', 'E12 must bind a complete 300-round physical Word wave in the Word sandbox work root without a saturation claim.');
    }
    if (e12Wave300Repeat) {
      if (e12Wave300Repeat?.totals?.physicalOpenEditSaveCloseReopenPass !== 300
        || e12Wave300Repeat?.totals?.parserPass !== 299
        || e12Wave300Repeat?.saturationDecision?.wordSaturated !== false
        || e12Wave300Repeat?.saturationDecision?.googleDocsAllowedToOpen !== false
        || e12Wave300Repeat?.saturationDecision?.consecutiveStableApprovedWaves !== 2
        || e12Wave300Repeat?.wordSandboxWorkRoot?.insideWordContainer !== true
        || e12Wave300Repeat?.wordSandboxWorkRoot?.plainTmpForbidden !== true) {
        add('RTK_V4_E12_WAVE300_REPEAT_INVALID', 'evidenceBindings.E12_PHYSICAL_WAVE300_REPEAT_01', 'E12 must bind a complete repeat 300-round physical Word wave without saturation or Google.');
      }
    }
    if (e12ParserGapFollowup) {
      if (e12ParserGapFollowup.status !== 'WORD_E12_WL2_031_HOSTILE_PACKAGE_TYPED_BLOCK_CONFIRMED_NOT_SATURATED'
        || e12ParserGapFollowup.caseAssessment?.caseId !== 'WL2-031'
        || e12ParserGapFollowup.caseAssessment?.reclassification !== 'HOSTILE_PACKAGE_TYPED_BLOCK_NOT_PARSER_GAP'
        || e12ParserGapFollowup.caseAssessment?.parserBlockedExpected !== true
        || e12ParserGapFollowup.caseAssessment?.exactAutomaticCandidateAllowed !== false
        || e12ParserGapFollowup.saturationDecision?.wordSaturated !== false
        || e12ParserGapFollowup.saturationDecision?.googleDocsAllowedToOpen !== false) {
        add('RTK_V4_E12_PARSER_GAP_FOLLOWUP_INVALID', 'evidenceBindings.E12_WL2_031_HOSTILE_PACKAGE_TYPED_BLOCK', 'E12 must bind WL2-031 as typed hostile package BLOCKED, not a parser PASS gap.');
      }
    }
    if (e12ModernCommentFollowup) {
      if (e12ModernCommentFollowup.status !== 'MODERN_COMMENT_APPLESCRIPT_PROBE_LIMITATION_CONFIRMED_NOT_SATURATED'
        || e12ModernCommentFollowup.totals?.commentsAfterReopen !== 5
        || e12ModernCommentFollowup.totals?.replyThreadsCertified !== 0
        || e12ModernCommentFollowup.totals?.resolveReopenCertified !== 0
        || e12ModernCommentFollowup.totals?.deleteCertified !== 0
        || e12ModernCommentFollowup.runtimeClaims?.automaticApplyExpanded !== false
        || e12ModernCommentFollowup.runtimeClaims?.writerAuthorityAdded !== false
        || e12ModernCommentFollowup.vetoMetrics?.falseExact !== 0
        || e12ModernCommentFollowup.vetoMetrics?.silentApply !== 0
        || e12ModernCommentFollowup.saturated !== false
        || !e12ModernCommentFollowup.observedLimitations?.includes('WORD_APPLESCRIPT_PARENT_COMMENT_DOES_NOT_PERSIST_AS_MODERN_REPLY_GRAPH')) {
        add('RTK_V4_E12_MODERN_COMMENT_FOLLOWUP_INVALID', 'evidenceBindings.E12_MODERN_COMMENT_APPLESCRIPT_LIMITATION', 'E12 must bind modern comment AppleScript probe as a truthful typed limitation, not certification.');
      }
    }
    if (e12CustomXmlFollowup) {
      if (e12CustomXmlFollowup.status !== 'CUSTOM_XML_AUTHORITY_REROUTED_TO_CUSTOM_DOCUMENT_PROPERTY_NOT_SATURATED'
        || e12CustomXmlFollowup.authorityDecision?.customXmlAuthorityAllowed !== false
        || e12CustomXmlFollowup.authorityDecision?.customXmlResolvedByAllowlist !== false
        || e12CustomXmlFollowup.authorityDecision?.selectedAuthorityCarrier !== 'customDocumentProperty'
        || e12CustomXmlFollowup.authorityDecision?.parserAuthorityIntegrated !== true
        || e12CustomXmlFollowup.authorityDecision?.yrtk2CoreImplemented !== true
        || e12CustomXmlFollowup.authorityDecision?.runtimeApplyAuthorityExpanded !== false
        || !e12CustomXmlFollowup.resolvedLimitations?.includes('CUSTOM_XML_MUTATING_WORD_SAVE_DROPS_AUTHORITY')
        || e12CustomXmlFollowup.remainingWordLimitations?.includes('CUSTOM_XML_MUTATING_WORD_SAVE_DROPS_AUTHORITY')
        || e12CustomXmlFollowup.runtimeClaims?.automaticApplyExpanded !== false
        || e12CustomXmlFollowup.runtimeClaims?.customXmlAuthorityAllowed !== false
        || e12CustomXmlFollowup.vetoMetrics?.falseExact !== 0
        || e12CustomXmlFollowup.vetoMetrics?.silentApply !== 0
        || e12CustomXmlFollowup.saturated !== false) {
        add('RTK_V4_E12_CUSTOMXML_FOLLOWUP_INVALID', 'evidenceBindings.E12_CUSTOM_XML_AUTHORITY_REROUTE', 'E12 must bind customXml mutating-save loss as resolved only by rejecting customXml authority and using the customDocumentProperty carrier path.');
      }
    }
    if (e12MultiSceneFollowup) {
      if (e12MultiSceneFollowup.status !== 'MULTI_SCENE_APPLY_REMAINS_SHADOW_ONLY_TYPED_LIMITATION_NOT_SATURATED'
        || e12MultiSceneFollowup.certificationDecision?.automaticMultiSceneApplyCertified !== false
        || e12MultiSceneFollowup.certificationDecision?.runtimeApplyAuthorityGranted !== false
        || e12MultiSceneFollowup.certificationDecision?.shadowCoordinatorAcceptedAsRuntimeApply !== false
        || e12MultiSceneFollowup.certificationDecision?.typedLimitationAccepted !== true
        || e12MultiSceneFollowup.coordinatorProof?.canWrite !== false
        || e12MultiSceneFollowup.coordinatorProof?.runtimeApplyAuthorityGranted !== false
        || !e12MultiSceneFollowup.resolvedLimitations?.includes('AUTOMATIC_MULTI_SCENE_APPLY_NOT_PHYSICAL_WORD_CERTIFIED')
        || e12MultiSceneFollowup.remainingWordLimitations?.includes('AUTOMATIC_MULTI_SCENE_APPLY_NOT_PHYSICAL_WORD_CERTIFIED')
        || e12MultiSceneFollowup.runtimeClaims?.automaticMultiSceneApplyAdded !== false
        || e12MultiSceneFollowup.vetoMetrics?.falseMultiSceneApplyCertification !== 0
        || e12MultiSceneFollowup.saturated !== false) {
        add('RTK_V4_E12_MULTI_SCENE_FOLLOWUP_INVALID', 'evidenceBindings.E12_MULTI_SCENE_APPLY_LIMITATION', 'E12 must bind multi-scene apply as a shadow-only typed limitation without runtime writer authority.');
      }
    }
    if (e12ModernNativeUiFollowup) {
      const targeted = e12ModernNativeUiFollowup.status === 'MODERN_COMMENT_NATIVE_UI_TARGETED_GAP_CLOSURE_COMPLETE_NOT_SATURATED';
      const legacy = e12ModernNativeUiFollowup.status === 'MODERN_COMMENT_NATIVE_UI_PHYSICAL_PROBE_LIMITATION_CONFIRMED_NOT_SATURATED';
      if ((!targeted && !legacy)
        || e12ModernNativeUiFollowup.result !== 'PASS'
        || e12ModernNativeUiFollowup.systemEvents?.targetedWordProcessProbe?.ok !== true
        || e12ModernNativeUiFollowup.systemEvents?.nativeUiAutomationAllowed !== true
        || e12ModernNativeUiFollowup.certificationDecision?.rootModernCommentCertified !== true
        || e12ModernNativeUiFollowup.certificationDecision?.wordAuthoredTrackedReplacementCertified !== true
        || (targeted
          ? e12ModernNativeUiFollowup.certificationDecision?.trackedAdjacentEditsCertified !== true
          : e12ModernNativeUiFollowup.certificationDecision?.trackedAdjacentEditsCertified !== false)
        || e12ModernNativeUiFollowup.certificationDecision?.trackedOverlappingEditsCertified !== false
        || e12ModernNativeUiFollowup.certificationDecision?.modernReplyCertified !== false
        || e12ModernNativeUiFollowup.certificationDecision?.nativeUiPhysicalActionsPerformed !== true
        || e12ModernNativeUiFollowup.certificationDecision?.externalPermissionRequired !== false
        || !e12ModernNativeUiFollowup.remainingWordLimitations?.includes('MODERN_REPLY_RESOLVE_REOPEN_STILL_TYPED_LIMITATION')
        || e12ModernNativeUiFollowup.vetoMetrics?.falseModernCommentSupportClaim !== 0
        || e12ModernNativeUiFollowup.saturated !== false) {
        add('RTK_V4_E12_MODERN_NATIVE_UI_FOLLOWUP_INVALID', 'evidenceBindings.E12_MODERN_COMMENT_NATIVE_UI_TARGETED_GAP_CLOSURE', 'E12 must bind native UI physical root comments and tracked replacement with typed limitations, not saturation or reply resolve overclaims.');
      }
      if (targeted && (Number(e12ModernNativeUiFollowup.physicalCorpus?.observedTargetedCases || 0) < 30
        || e12ModernNativeUiFollowup.physicalCorpus?.genericWaveRepeated !== false
        || e12ModernNativeUiFollowup.physicalCorpus?.failedCases?.length !== 0
        || e12ModernNativeUiFollowup.systemEvents?.openDocumentSetUnchanged !== true
        || !e12ModernNativeUiFollowup.certificationDecision?.trackedSequentialEditsCertified
        || !e12ModernNativeUiFollowup.certificationDecision?.trackedParagraphBoundaryCertified
        || !e12ModernNativeUiFollowup.certificationDecision?.commentsAdjacentToRevisionsCertified)) {
        add('RTK_V4_E12_TARGETED_GAP_CLOSURE_INVALID', 'evidenceBindings.E12_MODERN_COMMENT_NATIVE_UI_TARGETED_GAP_CLOSURE', 'Targeted gap closure must bind 30 physical cases, no failed case, no user-document touch, and supported tracked-revision gap reductions.');
      }
    }
    if (e12A02TerminalAudit) {
      if (e12A02TerminalAudit.status !== 'WORD_A02_TERMINAL_AUDIT_COMPLETE_A03_READY_NOT_SATURATED'
        || e12A02TerminalAudit.result !== 'PASS'
        || e12A02TerminalAudit.microLab?.genericWaveRepeated !== false
        || e12A02TerminalAudit.wordProfile?.openDocumentSetUnchanged !== true
        || e12A02TerminalAudit.wordSaturated !== false
        || e12A02TerminalAudit.googleDocsOpened !== false
        || e12A02TerminalAudit.capabilityFamilies?.rootModernComments?.productRuntimeWired !== false
        || e12A02TerminalAudit.capabilityFamilies?.rootModernComments?.automaticApplyCertified !== false
        || e12A02TerminalAudit.capabilityFamilies?.modernReplies?.physicalWordProven !== false
        || e12A02TerminalAudit.capabilityFamilies?.modernReopenAfterResolve?.physicalWordProven !== false
        || e12A02TerminalAudit.capabilityFamilies?.tripleAdjacentTrackedEdits?.automaticApplyCertified !== false
        || e12A02TerminalAudit.microLab?.modernCommentResolveReopen?.controls?.resolveStableControlBound !== true
        || e12A02TerminalAudit.microLab?.modernCommentResolveReopen?.packageReadback?.resolved?.doneTrueCount < 1
        || e12A02TerminalAudit.microLab?.modernCommentResolveReopen?.packageReadback?.reopened?.doneFalseCount !== 0
        || e12A02TerminalAudit.microLab?.tripleAdjacentTrackedEdits?.result !== 'TYPED_LIMITATION'
        || Object.values(e12A02TerminalAudit.vetoMetrics || {}).some((value) => Number(value) !== 0)) {
        add('RTK_V4_E12_A02_TERMINAL_AUDIT_INVALID', 'evidenceBindings.E12_A02_TERMINAL_AUDIT', 'A02 terminal audit must separate physical evidence from runtime authority and keep unresolved gaps typed.');
      }
    }
    if (e12A03PromotionList) {
      const rootRuntimeWiredRows = Array.isArray(e12A03PromotionList.rows)
        ? e12A03PromotionList.rows.filter((row) => row.capability === 'rootModernCommentShadowImport' && row.authorityLevel?.productRuntimeWired === true)
        : [];
      const nonRootRuntimeWiredRows = Array.isArray(e12A03PromotionList.rows)
        ? e12A03PromotionList.rows.filter((row) => row.capability !== 'rootModernCommentShadowImport' && row.authorityLevel?.productRuntimeWired === true)
        : [];
      const promotionIsA02Ready = e12A03PromotionList.status === 'A03_PROMOTION_LIST_READY_AFTER_A02_TERMINAL_AUDIT'
        && e12A03PromotionList.rows.every((row) => row.authorityLevel?.productRuntimeWired === false);
      const promotionIsC01Wired = e12A03PromotionList.status === 'A03_C01_COMMENT_SHADOW_RUNTIME_WIRED_C02_NEXT'
        && rootRuntimeWiredRows.length === 1
        && nonRootRuntimeWiredRows.length === 0;
      if ((!promotionIsA02Ready && !promotionIsC01Wired)
        || !Array.isArray(e12A03PromotionList.rows)
        || e12A03PromotionList.rows.length < 5
        || e12A03PromotionList.rows.some((row) => row.authorityLevel?.automaticApplyCertified !== false)) {
        add('RTK_V4_E12_A03_PROMOTION_LIST_INVALID', 'evidenceBindings.E12_A03_PROMOTION_LIST', 'A03 promotion list must bind A02 rows or the single A03-C01 runtime-wired comment row without automatic apply.');
      }
    }
  }

  const coverage = receipt.coverageLedger || {};
  for (const required of ['unicodeAndBidi', 'hostilePackage', 'performanceScale', 'crashRecovery', 'replayIdempotence', 'physicalWave40', 'physicalWave100', 'physicalWave300']) {
    if (coverage[required]?.status !== 'BOUND') {
      add('RTK_V4_E12_COVERAGE_MISSING', `coverageLedger.${required}`, `${required} coverage must be bound.`);
    }
  }
  if (Number(wave.consecutiveStableApprovedWaves) === 2 && coverage.physicalWave300Repeat?.status !== 'BOUND') {
    add('RTK_V4_E12_REPEAT_COVERAGE_MISSING', 'coverageLedger.physicalWave300Repeat', 'Repeat wave coverage must be bound when two stable waves are claimed.');
  }
  if (receipt.status === 'WORD_SATURATION_WL2_031_HOSTILE_PACKAGE_TYPED_BLOCK_CONFIRMED_NOT_SATURATED'
    && coverage.wave300ParserGapFollowup?.status !== 'BOUND') {
    add('RTK_V4_E12_PARSER_GAP_FOLLOWUP_COVERAGE_MISSING', 'coverageLedger.wave300ParserGapFollowup', 'WL2-031 parser gap followup coverage must be bound.');
  }
  if (receipt.status === 'WORD_SATURATION_MODERN_COMMENT_APPLESCRIPT_LIMITATION_CONFIRMED_NOT_SATURATED'
    && coverage.modernCommentAppleScriptFollowup?.status !== 'BOUND') {
    add('RTK_V4_E12_MODERN_COMMENT_FOLLOWUP_COVERAGE_MISSING', 'coverageLedger.modernCommentAppleScriptFollowup', 'Modern comment AppleScript limitation coverage must be bound.');
  }
  if (receipt.status === 'WORD_SATURATION_CUSTOM_XML_AUTHORITY_REROUTED_NOT_SATURATED'
    && coverage.customXmlAuthorityFollowup?.status !== 'BOUND') {
    add('RTK_V4_E12_CUSTOMXML_FOLLOWUP_COVERAGE_MISSING', 'coverageLedger.customXmlAuthorityFollowup', 'customXml authority reroute coverage must be bound.');
  }
  if (receipt.status === 'WORD_SATURATION_MULTI_SCENE_APPLY_TYPED_LIMITATION_CONFIRMED_NOT_SATURATED'
    && coverage.multiSceneApplyFollowup?.status !== 'BOUND') {
    add('RTK_V4_E12_MULTI_SCENE_FOLLOWUP_COVERAGE_MISSING', 'coverageLedger.multiSceneApplyFollowup', 'multi-scene apply limitation coverage must be bound.');
  }
  if (receipt.status === 'WORD_SATURATION_MODERN_COMMENT_NATIVE_UI_BLOCKED_NOT_SATURATED'
    && coverage.modernCommentNativeUiFollowup?.status !== 'BOUND') {
    add('RTK_V4_E12_MODERN_NATIVE_UI_FOLLOWUP_COVERAGE_MISSING', 'coverageLedger.modernCommentNativeUiFollowup', 'modern comment native UI blocker coverage must be bound.');
  }
  if (receipt.status === 'WORD_SATURATION_MODERN_COMMENT_NATIVE_UI_PHYSICAL_LIMITATION_CONFIRMED_NOT_SATURATED'
    && coverage.modernCommentNativeUiFollowup?.status !== 'BOUND') {
    add('RTK_V4_E12_MODERN_NATIVE_UI_FOLLOWUP_COVERAGE_MISSING', 'coverageLedger.modernCommentNativeUiFollowup', 'modern comment native UI physical limitation coverage must be bound.');
  }
  if (receipt.status === 'WORD_SATURATION_TARGETED_GAP_CLOSURE_A02_RECONCILED_NOT_SATURATED'
    && (coverage.modernCommentNativeUiFollowup?.status !== 'BOUND'
      || coverage.modernCommentNativeUiFollowup?.sourceEvidence !== 'E12_MODERN_COMMENT_NATIVE_UI_TARGETED_GAP_CLOSURE')) {
    add('RTK_V4_E12_TARGETED_GAP_CLOSURE_COVERAGE_MISSING', 'coverageLedger.modernCommentNativeUiFollowup', 'targeted native UI gap closure coverage must be bound to the targeted evidence id.');
  }
  if (receipt.status === 'WORD_SATURATION_A02_TERMINAL_AUDIT_COMPLETE_NOT_SATURATED'
    && (coverage.a02TerminalAudit?.status !== 'BOUND'
      || coverage.a02TerminalAudit?.sourceEvidence !== 'E12_A02_TERMINAL_AUDIT'
      || coverage.a03PromotionList?.status !== 'BOUND'
      || coverage.a03PromotionList?.sourceEvidence !== 'E12_A03_PROMOTION_LIST')) {
    add('RTK_V4_E12_A02_TERMINAL_COVERAGE_MISSING', 'coverageLedger.a02TerminalAudit', 'A02 terminal audit and A03 promotion list coverage must be bound.');
  }
  if (receipt.status === 'WORD_SATURATION_A03_C01_COMMENT_SHADOW_RUNTIME_WIRED_NOT_SATURATED'
    && (coverage.a03C01CommentShadowRuntime?.status !== 'BOUND'
      || coverage.a03C01CommentShadowRuntime?.sourceEvidence !== 'A03_C01_COMMENT_SHADOW_RUNTIME')) {
    add('RTK_V4_E12_A03_C01_COVERAGE_MISSING', 'coverageLedger.a03C01CommentShadowRuntime', 'A03-C01 comment shadow runtime coverage must be bound.');
  }

  const veto = receipt.vetoMetrics || {};
  if (!allZero(veto)) {
    add('RTK_V4_E12_VETO_NONZERO', 'vetoMetrics', 'All E12 aggregate veto metrics must be zero.');
  }

  const customXmlResolved = coverage.customXmlAuthorityFollowup?.status === 'BOUND';
  const multiSceneResolved = coverage.multiSceneApplyFollowup?.status === 'BOUND';
  if (!Array.isArray(receipt.notSaturatedReasons) || receipt.notSaturatedReasons.length < (multiSceneResolved ? 1 : (customXmlResolved ? 2 : 3))) {
    add('RTK_V4_E12_NOT_SATURATED_REASONS_MISSING', 'notSaturatedReasons', 'E12 must list concrete remaining saturation blockers.');
  }
  if (coverage.wave300ParserGapFollowup?.status === 'BOUND'
    && receipt.notSaturatedReasons.includes('WAVE300_SINGLE_PARSER_GAP_REQUIRES_CASE_LEVEL_FOLLOWUP')) {
    add('RTK_V4_E12_PARSER_GAP_STILL_ACTIVE', 'notSaturatedReasons', 'WL2-031 parser gap followup cannot remain an active saturation blocker after typed hostile block confirmation.');
  }
  if (customXmlResolved && receipt.notSaturatedReasons.includes('CUSTOM_XML_MUTATING_WORD_SAVE_DROPS_AUTHORITY')) {
    add('RTK_V4_E12_CUSTOMXML_STILL_ACTIVE', 'notSaturatedReasons', 'customXml mutating-save loss cannot remain an active saturation blocker after authority reroute confirmation.');
  }
  if (multiSceneResolved && receipt.notSaturatedReasons.includes('AUTOMATIC_MULTI_SCENE_APPLY_NOT_PHYSICAL_WORD_CERTIFIED')) {
    add('RTK_V4_E12_MULTI_SCENE_STILL_ACTIVE', 'notSaturatedReasons', 'multi-scene apply uncertified blocker cannot remain active after typed limitation confirmation.');
  }
  const c01RuntimeOnly = receipt.status === 'WORD_SATURATION_A03_C01_COMMENT_SHADOW_RUNTIME_WIRED_NOT_SATURATED'
    && receipt.runtimeClaims?.productRuntimeChanged === true
    && receipt.runtimeClaims?.writerAuthorityAdded === false
    && receipt.runtimeClaims?.automaticApplyExpanded === false
    && receipt.runtimeClaims?.googleDocsOpened === false;
  if (!c01RuntimeOnly && (receipt.runtimeClaims?.productRuntimeChanged !== false || receipt.runtimeClaims?.automaticApplyExpanded !== false || receipt.runtimeClaims?.googleDocsOpened !== false)) {
    add('RTK_V4_E12_RUNTIME_SCOPE_OVERCLAIM', 'runtimeClaims', 'E12 must not change runtime apply authority or open Google Docs outside bounded A03-C01 comment shadow wiring.');
  }

  const cell = Array.isArray(profile.cells) ? profile.cells.find((item) => item.capabilityId === 'rtk.word.v4.saturationLedger') : null;
  const allowedProfileCapabilities = new Set([
    'SATURATION_WAVE300_COMPLETE_NOT_SATURATED',
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
    'A03_C01_COMMENT_SHADOW_RUNTIME_WIRED_NOT_SATURATED',
  ]);
  if (!cell || cell.state !== 'PHYSICAL_WORD_PROVEN' || !allowedProfileCapabilities.has(cell.currentCapability) || cell.physicalWordEvidence !== true) {
    add('RTK_V4_E12_PROFILE_CELL_INVALID', 'profile.cells.rtk.word.v4.saturationLedger', 'Capability profile must bind E12 wave 300 as physical evidence proven but not saturated.');
  }
  const allowedProfileStatuses = new Set([
    'WORD_16_111_2_E12_WAVE300_COMPLETE_NOT_SATURATED',
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
    'WORD_16_111_2_A03_C01_COMMENT_SHADOW_RUNTIME_WIRED_NOT_SATURATED',
  ]);
  if (!allowedProfileStatuses.has(profile.status)) {
    add('RTK_V4_E12_PROFILE_STATUS_INVALID', 'profile.status', 'Profile status must reflect E12 wave 300 complete not-saturated ledger.');
  }

  const state = program.v4ExecutionState || {};
  const allowedProgramStatuses = new Set([
    'WORD_E12_PHYSICAL_WAVE300_COMPLETE_NOT_SATURATED',
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
    'WORD_A03_C01_COMMENT_SHADOW_RUNTIME_WIRED_NOT_SATURATED',
  ]);
  if (!allowedProgramStatuses.has(program.status)) {
    add('RTK_V4_E12_PROGRAM_STATUS_INVALID', 'program.status', 'Program status must reflect E12 physical wave 300 completion.');
  }
  const allowedStateStatuses = new Set([
    'EXECUTION_12_WAVE300_LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_STABILITY_LIMITATION_AUDIT',
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
    'EXECUTION_03_A03_C01_COMMENT_SHADOW_RUNTIME_WIRED_READY_FOR_DELIVERY_CHAIN',
  ]);
  if (!allowedStateStatuses.has(state.status)) {
    add('RTK_V4_E12_PROGRAM_STATE_INVALID', 'program.v4ExecutionState.status', 'Program state must keep E12 active and advance to the Word stability limitation audit.');
  }
  const allowedNextStages = new Set([
    'EXECUTION_12_WORD_STABILITY_LIMITATION_AUDIT',
    'EXECUTION_12_NEXT_PHYSICAL_STABILITY_WAVE_300_REPEAT',
    'EXECUTION_12_WORD_LIMITATION_FOLLOWUP_AFTER_STABLE_WAVES',
    'EXECUTION_12_WORD_LIMITATION_FOLLOWUP_REMAINING_TYPED_LIMITATIONS',
    'EXECUTION_12_WORD_LIMITATION_FOLLOWUP_CUSTOM_XML_MUTATION_AUTHORITY',
    'EXECUTION_12_WORD_LIMITATION_FOLLOWUP_MULTI_SCENE_APPLY_CERTIFICATION',
    'EXECUTION_12_WORD_LIMITATION_FOLLOWUP_MODERN_COMMENT_NATIVE_UI_CERTIFICATION',
    'EXECUTION_12_A02_TERMINAL_WORD_AUDIT_AND_A03_PROMOTION_LIST',
    'EXECUTION_03_A03_SAFE_PORTABILITY_IMPROVEMENTS_RUNTIME_CONTOUR',
    'EXECUTION_03_A03_C02_NON_OVERLAP_TRACKED_REPLACEMENTS_RUNTIME_CONTOUR',
  ]);
  if (!allowedNextStages.has(state.nextStage)) {
    add('RTK_V4_E12_NEXT_STAGE_INVALID', 'program.v4ExecutionState.nextStage', 'Next stage must continue the Word stability limitation audit, not Google Docs.');
  }
  if (state.googleDocsOpened !== false || state.wordSaturated !== false || state.wordSaturationCurrentFocus !== true) {
    add('RTK_V4_E12_SEQUENCE_BROKEN', 'program.v4ExecutionState', 'Word must remain current focus and Google Docs must stay closed until saturation.');
  }

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    completedWaves: wave.completedWaves || [],
    currentWaveTarget: wave.currentWaveTarget || 0,
    currentWaveObservedRounds: wave.currentWaveObservedRounds || 0,
    saturated: wave.saturated === true,
  };
}

function main() {
  const json = process.argv.includes('--json');
  const result = evaluateWordV4E12SaturationLedger({ requireFiles: process.argv.includes('--require-files') });
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_V4_E12_SATURATION_LEDGER=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
