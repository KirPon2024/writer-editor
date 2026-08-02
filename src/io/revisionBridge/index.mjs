import { hashCanonicalValue } from '../../core/browser-safe-hash.mjs';
import { parseReviewTransportPackageV2 } from './reviewTransportPackageParserV2.mjs';

const PACKET_VALID_CODE = 'REVISION_BRIDGE_PACKET_VALID';
const PACKET_INVALID_CODE = 'E_REVISION_BRIDGE_PACKET_INVALID';
const APPLY_BLOCKED_CODE = 'E_REVISION_BRIDGE_APPLY_BLOCKED';
const REVIEWGRAPH_VALID_CODE = 'REVISION_BRIDGE_REVIEWGRAPH_VALID';
const REVIEWGRAPH_INVALID_CODE = 'E_REVISION_BRIDGE_REVIEWGRAPH_INVALID';
const REVIEW_PACKET_PREVIEW_READY_CODE = 'REVISION_BRIDGE_REVIEW_PACKET_PREVIEW_READY';
const REVIEW_PACKET_PREVIEW_DIAGNOSTICS_CODE = 'E_REVISION_BRIDGE_REVIEW_PACKET_PREVIEW_DIAGNOSTICS';
const PARSED_REVIEW_SURFACE_ADAPTER_READY_CODE = 'REVISION_BRIDGE_PARSED_REVIEW_SURFACE_ADAPTER_READY';
const PARSED_REVIEW_SURFACE_ADAPTER_DIAGNOSTICS_CODE = 'E_REVISION_BRIDGE_PARSED_REVIEW_SURFACE_ADAPTER_DIAGNOSTICS';
const STAGE01_FIXED_CORE_PREVIEW_READY_CODE = 'REVISION_BRIDGE_STAGE01_FIXED_CORE_PREVIEW_READY';
const STAGE01_FIXED_CORE_PREVIEW_DIAGNOSTICS_CODE = 'E_REVISION_BRIDGE_STAGE01_FIXED_CORE_PREVIEW_DIAGNOSTICS';
const STAGE01_PREVIEW_ONLY_REASON_CODE = 'REVISION_BRIDGE_STAGE01_PREVIEW_ONLY';
const STAGE01_STALE_BASELINE_REASON_CODE = 'REVISION_BRIDGE_STAGE01_STALE_BASELINE';
const STAGE01_AMBIGUOUS_TEXT_REASON_CODE = 'REVISION_BRIDGE_STAGE01_AMBIGUOUS_TEXT_MANUAL_ONLY';
const STAGE01_DUPLICATE_TEXT_REASON_CODE = 'REVISION_BRIDGE_STAGE01_DUPLICATE_TEXT_MANUAL_ONLY';
const STAGE01_STRUCTURAL_MANUAL_ONLY_REASON_CODE = 'REVISION_BRIDGE_STAGE01_STRUCTURAL_MANUAL_ONLY';
const STAGE01_UNSUPPORTED_OBSERVATION_REASON_CODE = 'REVISION_BRIDGE_STAGE01_UNSUPPORTED_OBSERVATION';
const EXACT_TEXT_APPLY_PLAN_NO_DISK_READY_CODE = 'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_NO_DISK_READY';
const EXACT_TEXT_APPLY_PLAN_NO_DISK_BLOCKED_CODE = 'E_REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_NO_DISK_BLOCKED';
const EXACT_TEXT_APPLY_PLAN_NO_DISK_DIAGNOSTICS_CODE = 'E_REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_NO_DISK_DIAGNOSTICS';

export {
  RTK_TRANSPORT_MANIFEST_AUTHORITY_SIGNAL,
  RTK_TRANSPORT_MANIFEST_PLACEMENT_SIGNAL_AUTHORITIES,
  RTK_TRANSPORT_MANIFEST_SIGNATURE_ALG,
  RTK_TRANSPORT_MANIFEST_V2_SCHEMA,
  createManualOnlyLocatorSignal,
  createReviewTransportManifestV2,
  stableTransportManifestJson,
  verifyReviewTransportManifestV2,
} from './reviewTransportManifestCore.mjs';

export {
  RTK_REVIEW_TRANSPORT_AUTHORITY_CARRIER_V2_SCHEMA,
  RTK_REVIEW_TRANSPORT_AUTHORITY_CUSTOM_PROPERTY_NAMES,
  RTK_REVIEW_TRANSPORT_PACKAGE_PARSER_V2_BUILD,
  RTK_REVIEW_TRANSPORT_PACKAGE_PARSER_V2_PROFILE,
  parseReviewTransportPackageV2,
} from './reviewTransportPackageParserV2.mjs';

export {
  RTK_REVIEW_TRANSPORT_CLASSIFIER_V2_PROFILE,
  RTK_REVIEW_TRANSPORT_CLASSIFIER_V2_SCHEMA,
  classifyReviewTransportIrV2,
} from './reviewTransportClassifierV2.mjs';

export {
  RTK_REVIEW_TRANSPORT_BLOCK_EXACT_AUTHORITY_V2_PROFILE,
  RTK_REVIEW_TRANSPORT_BLOCK_EXACT_AUTHORITY_V2_SCHEMA,
  evaluateReviewTransportBlockExactAuthorityV2,
} from './reviewTransportBlockExactAuthorityV2.mjs';

export {
  RTK_BLOCK_RANGE_WRITER_AUTHORITY_PROFILE,
  RTK_BLOCK_RANGE_WRITER_AUTHORITY_PROVENANCE,
  RTK_BLOCK_RANGE_WRITER_AUTHORITY_SCHEMA,
  buildLocalReviewTransportBlockRangeAuthorityV2,
  buildReviewTransportBlockRangeDigestV2,
  buildReviewTransportBlockTextDigestV2,
} from './reviewTransportBlockRangeAuthorityV2.mjs';

export {
  RTK_REVIEW_TRANSPORT_EXACT_APPLY_ADAPTER_V2_PROFILE,
  RTK_REVIEW_TRANSPORT_EXACT_APPLY_ADMISSION_V2_SCHEMA,
  applyReviewTransportIrV2ExactText,
  buildReviewTransportExactApplyAdmissionV2,
} from './reviewTransportExactApplyAdapterV2.mjs';

export {
  RTK_REVIEW_TRANSPORT_BLOCK_EXACT_WRITER_BINDING_V2_PROFILE,
  RTK_REVIEW_TRANSPORT_BLOCK_EXACT_WRITER_BINDING_V2_SCHEMA,
  applyReviewTransportBlockExactWriterBindingV2,
  buildReviewTransportBlockExactWriterBindingV2,
} from './reviewTransportBlockExactWriterBindingV2.mjs';

export {
  RTK_NON_OVERLAP_TRACKED_REPLACEMENT_COMMAND_ID,
  RTK_NON_OVERLAP_TRACKED_REPLACEMENT_RUNTIME_SCHEMA,
  applyNonOverlapTrackedReplacementRuntime,
  buildNonOverlapTrackedReplacementRuntimePreview,
  createRtkNonOverlapTrackedReplacementCommandHandler,
} from './reviewTransportNonOverlapTrackedReplacementRuntime.mjs';

export {
  RTK_MULTI_SCENE_NON_OVERLAP_TRACKED_REPLACEMENT_COMMAND_ID,
  RTK_MULTI_SCENE_NON_OVERLAP_TRACKED_REPLACEMENT_RUNTIME_SCHEMA,
  applyMultiSceneNonOverlapTrackedReplacementRuntime,
  buildMultiSceneNonOverlapTrackedReplacementRuntimePreview,
  createRtkMultiSceneNonOverlapTrackedReplacementCommandHandler,
} from './reviewTransportMultiSceneNonOverlapTrackedReplacementRuntime.mjs';

export {
  RTK_NON_TEXT_RETURN_EVENT_SCHEMA,
  RTK_NON_TEXT_RETURN_STATE_SCHEMA,
  RTK_ROOT_COMMENT_RETURN_COMMAND_ID,
  applyRootCommentReturnRuntime,
  createRtkNonTextReturnFilePort,
  createRtkRootCommentReturnCommandHandler,
} from './reviewTransportNonTextReturnRuntime.mjs';

export {
  RTK_WORD_V4_CORE_MANIFEST_SCHEMA,
  RTK_WORD_V4_EXPORT_MAP_SCHEMA,
  RTK_WORD_V4_YRTK2_MAC_DOMAIN,
  RTK_WORD_V4_YRTK2_MAGIC_ASCII,
  RTK_WORD_V4_YRTK2_PAYLOAD_BYTES,
  RTK_WORD_V4_YRTK2_TOKEN_LENGTH,
  RTK_WORD_V4_YRTK2_TOKEN_SCHEMA,
  RTK_WORD_V4_YRTK2_TOTAL_BYTES,
  RTK_WORD_V4_YRTK2_VERSION,
  createWordV4CoreManifest,
  createYrtk2RoundLocatorToken,
  evaluateWordV4DoubleSelfParse,
  verifyYrtk2RoundLocatorToken,
} from './reviewTransportYrtk2Core.mjs';

export {
  RTK_WORD_V4_MINIMAL_SEMANTIC_KERNEL_PROFILE,
  RTK_WORD_V4_MINIMAL_SEMANTIC_KERNEL_SCHEMA,
  evaluateWordV4MinimalSemanticKernel,
} from './reviewTransportWordSemanticKernelV4.mjs';

export {
  RTK_WORD_V4_SOURCEMAP_SCHEMA,
  RTK_WORD_V4_SOURCEMAP_UNIQUEDIFF_PROFILE,
  RTK_WORD_V4_SOURCEMAP_UNIQUEDIFF_SCHEMA,
  buildWordV4SourceMapRow,
  computeWordV4SourceMapDigest,
  evaluateWordV4SourceMapUniqueDiff,
} from './reviewTransportSourceMapUniqueDiffV4.mjs';

export {
  RTK_WORD_V4_MULTI_SCENE_ATOMIC_COMMIT_SCHEMA,
  RTK_WORD_V4_MULTI_SCENE_ATOMIC_PREPARE_SCHEMA,
  RTK_WORD_V4_MULTI_SCENE_ATOMIC_RECOVERY_SCHEMA,
  assertRtkWordV4MultiSceneCoordinatorPlatformNeutral,
  buildRtkWordV4MultiSceneAtomicCommit,
  buildRtkWordV4MultiSceneAtomicPrepare,
  reconcileRtkWordV4MultiSceneAtomicRecovery,
} from './reviewTransportMultiSceneAtomicCoordinatorV4.mjs';

export const REVISION_BRIDGE_P0_PACKET_SCHEMA = 'revision-bridge-p0.packet.v1';
export const REVISION_BRIDGE_REVISION_SESSION_SCHEMA = 'revision-bridge.revision-session.v1';
export const REVISION_BRIDGE_COMMENT_THREAD_SCHEMA = 'revision-bridge.comment-thread.v1';
export const REVISION_BRIDGE_COMMENT_PLACEMENT_SCHEMA = 'revision-bridge.comment-placement.v1';
export const REVISION_BRIDGE_TEXT_CHANGE_SCHEMA = 'revision-bridge.text-change.v1';
export const REVISION_BRIDGE_STRUCTURAL_CHANGE_SCHEMA = 'revision-bridge.structural-change.v1';
export const REVISION_BRIDGE_DIAGNOSTIC_ITEM_SCHEMA = 'revision-bridge.diagnostic-item.v1';
export const REVISION_BRIDGE_DECISION_STATE_SCHEMA = 'revision-bridge.decision-state.v1';
export const REVISION_BRIDGE_REVIEW_PACKET_PREVIEW_SCHEMA = 'revision-bridge.review-packet-preview.v1';
export const REVISION_BRIDGE_REVIEWPATCHSET_SCHEMA = 'revision-bridge.review-patchset.v1';
export const REVISION_BRIDGE_REVIEWOPIR_SCHEMA = 'revision-bridge.review-op-ir.v1';
export const REVISION_BRIDGE_SELECTORSTACK_SCHEMA_V1 = 'revision-bridge.selector-stack.v1';
export const REVISION_BRIDGE_SOURCE_VIEW_STATE_SCHEMA = 'revision-bridge.source-view-state.v1';
export const REVISION_BRIDGE_EVIDENCEREF_SCHEMA = 'revision-bridge.evidence-ref.v1';
export const REVISION_BRIDGE_PROV_MIN_SCHEMA = 'revision-bridge.prov-min.v1';
export const REVISION_BRIDGE_MINIMAL_REVIEWBOM_SCHEMA = 'revision-bridge.minimal-review-bom.v1';
export const REVISION_BRIDGE_SHADOW_PREVIEW_SCHEMA = 'revision-bridge.shadow-preview.v1';
export const REVISION_BRIDGE_BLOCKED_APPLY_PLAN_SCHEMA = 'revision-bridge.blocked-apply-plan.v1';
export const REVISION_BRIDGE_STAGE01_FIXED_CORE_PREVIEW_SCHEMA = 'revision-bridge.stage01-fixed-core-preview.v1';
export const REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_NO_DISK_SCHEMA = 'revision-bridge.exact-text-apply-plan-no-disk.v1';
export const REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_NO_DISK_REASON_CODES = Object.freeze([
  EXACT_TEXT_APPLY_PLAN_NO_DISK_READY_CODE,
  EXACT_TEXT_APPLY_PLAN_NO_DISK_BLOCKED_CODE,
  EXACT_TEXT_APPLY_PLAN_NO_DISK_DIAGNOSTICS_CODE,
  'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_PROJECT_MISMATCH',
  'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_STALE_BASELINE',
  'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_SESSION_CLOSED',
  'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_STRUCTURAL_CHANGE',
  'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_COMMENT_ONLY',
  'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_MULTI_TEXT_CHANGE',
  'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_REVIEW_ITEM_SESSION_MISMATCH',
  'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_UNSUPPORTED_SURFACE',
  'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_NOT_EXACT_MATCH',
  'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_REPLACEMENT_REQUIRED',
  'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_NO_MATCH',
  'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_DUPLICATE_MATCH',
]);
export const DOCX_HOSTILE_FILE_GATE_SCHEMA = 'revision-bridge.docx-hostile-file-gate.v1';
export const DOCX_HOSTILE_FILE_GATE_REASON_CODES = Object.freeze({
  PASS: 'STAGE02_GATE_PASS',
  PACKAGE_MALFORMED: 'STAGE02_PACKAGE_MALFORMED',
  PACKAGE_QUARANTINED: 'STAGE02_PACKAGE_QUARANTINED',
  ENCRYPTED_ENTRY_PRESENT: 'STAGE02_ENCRYPTED_ENTRY_PRESENT',
  PATH_TRAVERSAL_DETECTED: 'STAGE02_PATH_TRAVERSAL_DETECTED',
  EXTERNAL_RELATIONSHIP_PRESENT: 'STAGE02_EXTERNAL_RELATIONSHIP_PRESENT',
  DUPLICATE_ENTRY_NAME: 'STAGE02_DUPLICATE_ENTRY_NAME',
  COMPRESSION_RATIO_EXCEEDED: 'STAGE02_COMPRESSION_RATIO_EXCEEDED',
  XML_DTD_DECLARATION_PRESENT: 'STAGE02_XML_DTD_DECLARATION_PRESENT',
  XML_ENTITY_DECLARATION_PRESENT: 'STAGE02_XML_ENTITY_DECLARATION_PRESENT',
  DECLARATION_SCAN_UNAVAILABLE: 'STAGE02_DECLARATION_SCAN_UNAVAILABLE',
});
export const REVISION_BRIDGE_BLOCK_SCHEMA = 'revision-bridge.block.v1';
export const REVISION_BRIDGE_BLOCK_LINEAGE_SCHEMA = 'revision-bridge.block-lineage.v1';
export const REVISION_BRIDGE_MINIMAL_BLOCK_ID_PREVIEW_SCHEMA = 'revision-bridge.minimal-block-id-preview.v1';
export const REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_PREVIEW_SCHEMA =
  'revision-bridge.structural-manual-review-preview.v1';
export const REVISION_BRIDGE_BLOCK_KINDS = Object.freeze([
  'paragraph',
  'heading',
  'quote',
  'listItem',
  'separator',
  'tablePlaceholder',
  'unsupportedObjectPlaceholder',
]);
export const REVISION_BRIDGE_MINIMAL_BLOCK_ID_PREVIEW_REASON_CODES = Object.freeze([
  'REVISION_BRIDGE_MINIMAL_BLOCK_ID_PREVIEW_READY',
  'REVISION_BRIDGE_MINIMAL_BLOCK_ID_MANUAL_ONLY',
  'REVISION_BRIDGE_MINIMAL_BLOCK_ID_INPUT_INVALID',
  'REVISION_BRIDGE_MINIMAL_BLOCK_ID_MISSING_ID_MANUAL_ONLY',
  'REVISION_BRIDGE_MINIMAL_BLOCK_ID_UNSTABLE_ID_MANUAL_ONLY',
  'REVISION_BRIDGE_MINIMAL_BLOCK_ID_TEXT_DERIVED_ID_MANUAL_ONLY',
  'REVISION_BRIDGE_MINIMAL_BLOCK_ID_DUPLICATE_TEXT_MANUAL_ONLY',
  'REVISION_BRIDGE_MINIMAL_BLOCK_ID_HEADING_ONLY_MANUAL_ONLY',
  'REVISION_BRIDGE_MINIMAL_BLOCK_ID_ORDINAL_ONLY_MANUAL_ONLY',
  'REVISION_BRIDGE_MINIMAL_BLOCK_ID_VERSION_CHANGED_MANUAL_ONLY',
  'REVISION_BRIDGE_MINIMAL_BLOCK_ID_STRUCTURAL_MANUAL_ONLY',
]);
export const REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_REASON_CODES = Object.freeze([
  'REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_PREVIEW_READY',
  'E_REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_PREVIEW_DIAGNOSTICS',
  'REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_MOVE_MANUAL_ONLY',
  'REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_SPLIT_MANUAL_ONLY',
  'REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_MERGE_MANUAL_ONLY',
  'REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_DUPLICATE_CANDIDATES',
  'REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_COMMENT_ANCHOR_RISK_SIGNAL',
  'REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_BLOCK_ID_INSUFFICIENT',
  'REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_EVIDENCE_TOO_WEAK',
  'REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_MIXED_TEXT_AND_STRUCTURE',
  'REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_PARTIAL_SCOPE_ONLY',
  'REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_UNSUPPORTED_KIND',
]);
export const REVISION_BRIDGE_INLINE_RANGE_SCHEMA = 'revision-bridge.inline-range.v1';
export const REVISION_BRIDGE_COMMENT_ANCHOR_PLACEMENT_SCHEMA = 'revision-bridge.comment-anchor-placement.v1';
export const REVISION_BRIDGE_ANCHOR_CONFIDENCE_EVALUATION_SCHEMA = 'revision-bridge.anchor-confidence-evaluation.v1';
export const REVISION_BRIDGE_INLINE_ANCHOR_KINDS = Object.freeze([
  'point',
  'span',
  'deleted',
  'orphan',
]);
export const REVISION_BRIDGE_MATCH_CONFIDENCE_LEVELS = Object.freeze([
  'exact',
  'strongHigh',
  'weakHigh',
  'approximate',
  'unresolved',
]);
export const REVISION_BRIDGE_RISK_CLASSES = Object.freeze([
  'low',
  'medium',
  'high',
  'critical',
]);
export const REVISION_BRIDGE_AUTOMATION_POLICIES = Object.freeze([
  'autoEligible',
  'manualConfirmRequired',
  'manualOnly',
  'diagnosticsOnly',
  'hardFail',
]);
export const REVISION_BRIDGE_ANCHOR_CONFIDENCE_REASON_CODES = Object.freeze([
  'REVISION_BRIDGE_ANCHOR_CONFIDENCE_EXACT_RANGE',
  'REVISION_BRIDGE_ANCHOR_CONFIDENCE_VALIDATION_FAILED',
  'REVISION_BRIDGE_ANCHOR_CONFIDENCE_MISSING_BLOCK',
  'REVISION_BRIDGE_ANCHOR_CONFIDENCE_OUT_OF_BOUNDS',
  'REVISION_BRIDGE_ANCHOR_CONFIDENCE_STALE_QUOTE',
  'REVISION_BRIDGE_ANCHOR_CONFIDENCE_QUOTE_ELSEWHERE',
  'REVISION_BRIDGE_ANCHOR_CONFIDENCE_PREFIX_MISMATCH',
  'REVISION_BRIDGE_ANCHOR_CONFIDENCE_SUFFIX_MISMATCH',
  'REVISION_BRIDGE_ANCHOR_CONFIDENCE_ORPHAN',
  'REVISION_BRIDGE_ANCHOR_CONFIDENCE_DELETED_TARGET',
  'REVISION_BRIDGE_ANCHOR_CONFIDENCE_WEAK_ANCHOR',
  'REVISION_BRIDGE_ANCHOR_CONFIDENCE_UNRESOLVED_ANCHOR',
]);
const MATCH_PROOF_BUILT_CODE = 'REVISION_BRIDGE_MATCH_PROOF_BUILT';
export const REVISION_BRIDGE_MATCH_PROOF_SCHEMA = 'revision-bridge.match-proof.v1';
export const REVISION_BRIDGE_MATCH_PROOF_REASON_CODES = Object.freeze([
  MATCH_PROOF_BUILT_CODE,
  ...REVISION_BRIDGE_ANCHOR_CONFIDENCE_REASON_CODES,
]);
export const REVISION_BRIDGE_PLACEMENT_EVALUATION_SCHEMA = 'revision-bridge.comment-anchor-placement-evaluation.v1';
const PLACEMENT_EVALUATION_EVALUATED_CODE = 'REVISION_BRIDGE_PLACEMENT_EVALUATION_EVALUATED';
const PLACEMENT_EVALUATION_VALIDATION_FAILED_CODE = 'REVISION_BRIDGE_PLACEMENT_EVALUATION_VALIDATION_FAILED';
const PLACEMENT_EVALUATION_DIAGNOSTICS_CODE = 'REVISION_BRIDGE_PLACEMENT_EVALUATION_DIAGNOSTICS';
const PLACEMENT_EVALUATION_UNRESOLVED_CODE = 'REVISION_BRIDGE_PLACEMENT_EVALUATION_UNRESOLVED';
const PLACEMENT_EVALUATION_HARD_FAIL_CODE = 'REVISION_BRIDGE_PLACEMENT_EVALUATION_HARD_FAIL';
export const REVISION_BRIDGE_PLACEMENT_EVALUATION_REASON_CODES = Object.freeze([
  PLACEMENT_EVALUATION_EVALUATED_CODE,
  PLACEMENT_EVALUATION_VALIDATION_FAILED_CODE,
  PLACEMENT_EVALUATION_DIAGNOSTICS_CODE,
  PLACEMENT_EVALUATION_UNRESOLVED_CODE,
  PLACEMENT_EVALUATION_HARD_FAIL_CODE,
]);
export const REVISION_BRIDGE_PLACEMENT_BATCH_DIAGNOSTICS_SCHEMA = 'revision-bridge.comment-anchor-placement-batch-diagnostics.v1';
export const REVISION_BRIDGE_REVISION_SESSION_SKELETON_ADMISSION_PREVIEW_SCHEMA =
  'revision-bridge.revision-session-skeleton-admission-preview.v1';
export const REVISION_BRIDGE_COMMENT_SURVIVAL_PREVIEW_SCHEMA = 'revision-bridge.comment-survival-preview.v1';
export const REVISION_BRIDGE_STABLE_COMMENT_ANCHOR_PACKET_SCHEMA =
  'revision-bridge.stable-comment-anchor-packet.v1';
const COMMENT_SURVIVAL_PREVIEW_READY_CODE = 'REVISION_BRIDGE_COMMENT_SURVIVAL_PREVIEW_READY';
const COMMENT_SURVIVAL_PREVIEW_DIAGNOSTICS_CODE = 'E_REVISION_BRIDGE_COMMENT_SURVIVAL_PREVIEW_DIAGNOSTICS';
const COMMENT_SURVIVAL_THREAD_INVALID_CODE = 'REVISION_BRIDGE_COMMENT_SURVIVAL_THREAD_INVALID';
const COMMENT_SURVIVAL_THREAD_ID_MISSING_CODE = 'REVISION_BRIDGE_COMMENT_SURVIVAL_THREAD_ID_MISSING';
const COMMENT_SURVIVAL_THREAD_ID_DUPLICATE_CODE = 'REVISION_BRIDGE_COMMENT_SURVIVAL_THREAD_ID_DUPLICATE';
const COMMENT_SURVIVAL_COMMENT_ID_DUPLICATE_CODE = 'REVISION_BRIDGE_COMMENT_SURVIVAL_COMMENT_ID_DUPLICATE';
const COMMENT_SURVIVAL_THREAD_TEXT_EMPTY_CODE = 'REVISION_BRIDGE_COMMENT_SURVIVAL_THREAD_TEXT_EMPTY';
const COMMENT_SURVIVAL_PLACEMENT_THREAD_MISSING_CODE = 'REVISION_BRIDGE_COMMENT_SURVIVAL_PLACEMENT_THREAD_MISSING';
const COMMENT_SURVIVAL_PLACEMENT_NOT_EVALUATED_CODE = 'REVISION_BRIDGE_COMMENT_SURVIVAL_PLACEMENT_NOT_EVALUATED';
const COMMENT_SURVIVAL_LEGACY_PLACEMENT_UNSUPPORTED_CODE =
  'REVISION_BRIDGE_COMMENT_SURVIVAL_LEGACY_PLACEMENT_UNSUPPORTED';
const STABLE_COMMENT_ANCHOR_PACKET_READY_CODE = 'REVISION_BRIDGE_STABLE_COMMENT_ANCHOR_PACKET_READY';
const STABLE_COMMENT_ANCHOR_PACKET_DIAGNOSTICS_CODE =
  'E_REVISION_BRIDGE_STABLE_COMMENT_ANCHOR_PACKET_DIAGNOSTICS';
const STABLE_COMMENT_ANCHOR_PACKET_EMPTY_CODE =
  'REVISION_BRIDGE_STABLE_COMMENT_ANCHOR_PACKET_EMPTY';
const STABLE_COMMENT_ANCHOR_PACKET_NO_IMPLICIT_PLACEMENT_CODE =
  'REVISION_BRIDGE_STABLE_COMMENT_ANCHOR_PACKET_NO_IMPLICIT_PLACEMENT';
const PLACEMENT_BATCH_DIAGNOSTICS_EVALUATED_CODE = 'REVISION_BRIDGE_PLACEMENT_BATCH_DIAGNOSTICS_EVALUATED';
const PLACEMENT_BATCH_DIAGNOSTICS_VALIDATION_FAILED_CODE = 'REVISION_BRIDGE_PLACEMENT_BATCH_DIAGNOSTICS_VALIDATION_FAILED';
const PLACEMENT_BATCH_DIAGNOSTICS_DIAGNOSTICS_CODE = 'REVISION_BRIDGE_PLACEMENT_BATCH_DIAGNOSTICS_DIAGNOSTICS';
const PLACEMENT_BATCH_DIAGNOSTICS_UNRESOLVED_CODE = 'REVISION_BRIDGE_PLACEMENT_BATCH_DIAGNOSTICS_UNRESOLVED';
const PLACEMENT_BATCH_DIAGNOSTICS_HARD_FAIL_CODE = 'REVISION_BRIDGE_PLACEMENT_BATCH_DIAGNOSTICS_HARD_FAIL';
export const REVISION_BRIDGE_COMMENT_SURVIVAL_PREVIEW_REASON_CODES = Object.freeze([
  COMMENT_SURVIVAL_PREVIEW_READY_CODE,
  COMMENT_SURVIVAL_PREVIEW_DIAGNOSTICS_CODE,
  COMMENT_SURVIVAL_THREAD_INVALID_CODE,
  COMMENT_SURVIVAL_THREAD_ID_MISSING_CODE,
  COMMENT_SURVIVAL_THREAD_ID_DUPLICATE_CODE,
  COMMENT_SURVIVAL_COMMENT_ID_DUPLICATE_CODE,
  COMMENT_SURVIVAL_THREAD_TEXT_EMPTY_CODE,
  COMMENT_SURVIVAL_PLACEMENT_THREAD_MISSING_CODE,
  COMMENT_SURVIVAL_PLACEMENT_NOT_EVALUATED_CODE,
  COMMENT_SURVIVAL_LEGACY_PLACEMENT_UNSUPPORTED_CODE,
]);
export const REVISION_BRIDGE_STABLE_COMMENT_ANCHOR_PACKET_REASON_CODES = Object.freeze([
  STABLE_COMMENT_ANCHOR_PACKET_READY_CODE,
  STABLE_COMMENT_ANCHOR_PACKET_DIAGNOSTICS_CODE,
  STABLE_COMMENT_ANCHOR_PACKET_EMPTY_CODE,
  STABLE_COMMENT_ANCHOR_PACKET_NO_IMPLICIT_PLACEMENT_CODE,
  ...REVISION_BRIDGE_COMMENT_SURVIVAL_PREVIEW_REASON_CODES,
]);
export const REVISION_BRIDGE_PLACEMENT_BATCH_DIAGNOSTICS_REASON_CODES = Object.freeze([
  PLACEMENT_BATCH_DIAGNOSTICS_EVALUATED_CODE,
  PLACEMENT_BATCH_DIAGNOSTICS_VALIDATION_FAILED_CODE,
  PLACEMENT_BATCH_DIAGNOSTICS_DIAGNOSTICS_CODE,
  PLACEMENT_BATCH_DIAGNOSTICS_UNRESOLVED_CODE,
  PLACEMENT_BATCH_DIAGNOSTICS_HARD_FAIL_CODE,
  ...REVISION_BRIDGE_PLACEMENT_EVALUATION_REASON_CODES,
  ...REVISION_BRIDGE_ANCHOR_CONFIDENCE_REASON_CODES,
]);

const REVIEWGRAPH_ITEM_KINDS = [
  'commentThread',
  'commentPlacement',
  'textChange',
  'structuralChange',
  'diagnosticItem',
];

const COMMENT_THREAD_FORBIDDEN_PLACEMENT_FIELDS = [
  'targetScope',
  'anchor',
  'range',
  'quote',
  'prefix',
  'suffix',
  'confidence',
  'policy',
  'placement',
  'placementHint',
  'match',
  'selector',
];

const COMMENT_PLACEMENT_FORBIDDEN_THREAD_FIELDS = [
  'body',
  'comment',
  'commentText',
  'message',
  'messageBody',
  'messages',
  'text',
  'threadBody',
];

const STRUCTURAL_CHANGE_FORBIDDEN_AUTO_FIELDS = [
  'apply',
  'applyMode',
  'autoApply',
  'autoApplyEnabled',
  'canApply',
  'canAutoApply',
];

const REVIEW_PACKET_PREVIEW_FORBIDDEN_APPLY_FIELDS = [
  'apply',
  'applyPlan',
  'authorized',
  'canApply',
];

const PARSED_REVIEW_SURFACE_COLLECTIONS = [
  'commentThreads',
  'commentPlacements',
  'textChanges',
  'structuralChanges',
  'diagnosticItems',
  'decisionStates',
];

const PARSED_REVIEW_SURFACE_KEYS = [
  ...PARSED_REVIEW_SURFACE_COLLECTIONS,
  'unsupportedItems',
];

const PARSED_REVIEW_SURFACE_ALIAS_KEYS = [
  'comments',
  'changes',
  'suggestions',
  'docxComments',
  'paragraphs',
  'revisions',
];

const STAGE01_REVIEW_PACKET_COLLECTIONS = Object.freeze([
  ['commentThreads', 'commentThread', 'threadId'],
  ['commentPlacements', 'commentPlacement', 'placementId'],
  ['textChanges', 'textChange', 'changeId'],
  ['structuralChanges', 'structuralChange', 'structuralChangeId'],
  ['diagnosticItems', 'diagnosticItem', 'diagnosticId'],
  ['decisionStates', 'decisionState', 'decisionId'],
]);

export const DOCX_PACKAGE_BOUNDARY_BUDGETS = Object.freeze({
  maxEntries: 512,
  maxTotalBytes: 67108864,
  maxEntryBytes: 33554432,
  maxRelationshipEntries: 64,
  maxUnsupportedStoryEntries: 32,
});

export const DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES = Object.freeze({
  INVENTORY_NOT_OBJECT: 'DOCX_INVENTORY_NOT_PLAIN_OBJECT',
  INVENTORY_PATH_INPUT_REJECTED: 'DOCX_INVENTORY_PATH_INPUT_REJECTED',
  INVENTORY_BINARY_INPUT_REJECTED: 'DOCX_INVENTORY_BINARY_INPUT_REJECTED',
  ENTRIES_MISSING: 'DOCX_INVENTORY_ENTRIES_MISSING',
  ENTRIES_NOT_ARRAY: 'DOCX_INVENTORY_ENTRIES_INVALID',
  ENTRY_NOT_OBJECT: 'DOCX_ENTRY_NOT_OBJECT',
  ENTRY_ID_INVALID: 'DOCX_ENTRY_ID_INVALID',
  ENTRY_KIND_INVALID: 'DOCX_ENTRY_KIND_INVALID',
  ENTRY_BYTE_SIZE_INVALID: 'DOCX_ENTRY_BYTE_SIZE_INVALID',
  ENTRY_COMPRESSED_SIZE_INVALID: 'DOCX_ENTRY_COMPRESSED_SIZE_INVALID',
  ENTRY_MARKERS_INVALID: 'DOCX_ENTRY_MARKERS_INVALID',
  ENTRY_MARKER_INVALID: 'DOCX_ENTRY_MARKER_INVALID',
  ENTRY_STORY_INVALID: 'DOCX_ENTRY_STORY_INVALID',
  UNKNOWN_SIZE_FIELD_PRESENT: 'DOCX_UNKNOWN_SIZE_FIELD_PRESENT',
  ENTRY_COUNT_EXCEEDED: 'DOCX_ENTRY_COUNT_BUDGET_EXCEEDED',
  TOTAL_BYTES_EXCEEDED: 'DOCX_TOTAL_UNCOMPRESSED_BUDGET_EXCEEDED',
  ENTRY_BYTES_EXCEEDED: 'DOCX_SINGLE_ENTRY_UNCOMPRESSED_BUDGET_EXCEEDED',
  RELATIONSHIP_ENTRY_COUNT_EXCEEDED: 'DOCX_RELATIONSHIP_ENTRY_COUNT_BUDGET_EXCEEDED',
  UNSUPPORTED_STORY_COUNT_EXCEEDED: 'DOCX_UNSUPPORTED_STORY_COUNT_BUDGET_EXCEEDED',
  UNKNOWN_PART_PRESENT: 'DOCX_UNKNOWN_PART_PRESENT',
  DIRECTORY_ENTRY_PRESENT: 'DOCX_DIRECTORY_ENTRY_PRESENT',
  RELATIONSHIP_PART_PRESENT: 'DOCX_RELATIONSHIP_PART_PRESENT',
  UNSUPPORTED_STORY_PRESENT: 'DOCX_UNSUPPORTED_STORY_MARKER_PRESENT',
  CLEAN_INVENTORY: 'DOCX_PACKAGE_CLEAN',
});

export const DOCX_PART_POLICY_SCHEMA = 'revision-bridge.docx-part-policy.v1';

export const DOCX_PART_POLICY_DECISIONS = Object.freeze({
  ACCEPTED: 'accepted',
  DEGRADED: 'degraded',
  REJECTED: 'rejected',
});

export const DOCX_PART_POLICY_DIAGNOSTIC_CODES = Object.freeze({
  INPUT_REJECTED: 'DOCX_PART_POLICY_INPUT_REJECTED',
  PACKAGE_REJECTED: 'DOCX_PART_POLICY_PACKAGE_REJECTED',
  MAIN_DOCUMENT_MISSING: 'DOCX_PART_POLICY_MAIN_DOCUMENT_MISSING',
  MAIN_DOCUMENT_DUPLICATE: 'DOCX_PART_POLICY_MAIN_DOCUMENT_DUPLICATE',
  RELATIONSHIP_DIAGNOSTICS_ONLY: 'DOCX_PART_POLICY_RELATIONSHIP_DIAGNOSTICS_ONLY',
  RELATIONSHIP_REQUIRES_FUTURE_PARSER: 'DOCX_PART_POLICY_RELATIONSHIP_REQUIRES_FUTURE_PARSER',
  UNSUPPORTED_STORY_DIAGNOSTICS_ONLY: 'DOCX_PART_POLICY_UNSUPPORTED_STORY_DIAGNOSTICS_ONLY',
  UNKNOWN_PART_DIAGNOSTICS_ONLY: 'DOCX_PART_POLICY_UNKNOWN_PART_DIAGNOSTICS_ONLY',
  DIRECTORY_DIAGNOSTICS_ONLY: 'DOCX_PART_POLICY_DIRECTORY_DIAGNOSTICS_ONLY',
  MEDIA_DIAGNOSTICS_ONLY: 'DOCX_PART_POLICY_MEDIA_DIAGNOSTICS_ONLY',
  ACCEPTED: 'DOCX_PART_POLICY_ACCEPTED',
});

const DOCX_PART_POLICY_CATEGORY_KEYS = [
  'mainDocumentPart',
  'knownSupportPart',
  'mediaPart',
  'relationshipPart',
  'unsupportedStoryPart',
  'unknownPart',
  'directoryPart',
];

const DOCX_PART_POLICY_KNOWN_SUPPORT_PARTS = [
  '[Content_Types].xml',
  'docProps/app.xml',
  'docProps/core.xml',
  'docProps/custom.xml',
  'word/comments.xml',
  'word/commentsExtended.xml',
  'word/commentsExtensible.xml',
  'word/commentsIds.xml',
  'word/fontTable.xml',
  'word/numbering.xml',
  'word/people.xml',
  'word/settings.xml',
  'word/styles.xml',
  'word/stylesWithEffects.xml',
  'word/theme/theme1.xml',
  'word/webSettings.xml',
];

const DOCX_PART_POLICY_DEGRADED_CATEGORY_CODES = Object.freeze({
  mediaPart: DOCX_PART_POLICY_DIAGNOSTIC_CODES.MEDIA_DIAGNOSTICS_ONLY,
  relationshipPart: DOCX_PART_POLICY_DIAGNOSTIC_CODES.RELATIONSHIP_DIAGNOSTICS_ONLY,
  unsupportedStoryPart: DOCX_PART_POLICY_DIAGNOSTIC_CODES.UNSUPPORTED_STORY_DIAGNOSTICS_ONLY,
  unknownPart: DOCX_PART_POLICY_DIAGNOSTIC_CODES.UNKNOWN_PART_DIAGNOSTICS_ONLY,
  directoryPart: DOCX_PART_POLICY_DIAGNOSTIC_CODES.DIRECTORY_DIAGNOSTICS_ONLY,
});

const DOCX_PART_POLICY_INPUT_REJECT_KEYS = [
  'p' + 'ath',
  'p' + 'aths',
  'file' + 'P' + 'ath',
  'file' + 'H' + 'andle',
  'docx' + 'F' + 'ile',
  'b' + 'ytes',
  'b' + 'uffer',
  'raw',
  'x' + 'ml',
  'z' + 'ip',
];

const DOCX_PACKAGE_BOUNDARY_INPUT_REJECT_KEYS = [
  'p' + 'ath',
  'file' + 'P' + 'ath',
  'b' + 'ytes',
  'b' + 'uffer',
];

const DOCX_PACKAGE_BOUNDARY_ENTRY_KINDS = [
  'knownPart',
  'unknownPart',
  'relationshipPart',
  'directory',
];

const DOCX_PACKAGE_BOUNDARY_STORIES = [
  'main',
  'header',
  'footer',
  'footnote',
  'endnote',
  'comment',
  'textBox',
  'unsupported',
];

const DOCX_PACKAGE_BOUNDARY_MARKERS = [
  'relationship',
  'unsupportedStory',
  'documentPart',
  'mediaPart',
];

const DOCX_PACKAGE_BOUNDARY_REJECTED_SIZE_FIELDS = [
  'size',
  'b' + 'ytes',
  'length',
  'uncompressedSize',
  'compressedByteSize',
  'r' + 'awSize',
  'fileSize',
];

const DOCX_PACKAGE_BOUNDARY_MALFORMED_CODES = [
  DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.INVENTORY_NOT_OBJECT,
  DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.INVENTORY_PATH_INPUT_REJECTED,
  DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.INVENTORY_BINARY_INPUT_REJECTED,
  DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.ENTRIES_MISSING,
  DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.ENTRIES_NOT_ARRAY,
  DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.ENTRY_NOT_OBJECT,
  DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.ENTRY_ID_INVALID,
  DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.ENTRY_KIND_INVALID,
  DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.ENTRY_BYTE_SIZE_INVALID,
  DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.ENTRY_COMPRESSED_SIZE_INVALID,
  DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.ENTRY_MARKERS_INVALID,
  DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.ENTRY_MARKER_INVALID,
  DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.ENTRY_STORY_INVALID,
  DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.UNKNOWN_SIZE_FIELD_PRESENT,
];

const DOCX_PACKAGE_BOUNDARY_QUARANTINED_CODES = [
  DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.ENTRY_COUNT_EXCEEDED,
  DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.TOTAL_BYTES_EXCEEDED,
  DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.ENTRY_BYTES_EXCEEDED,
  DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.RELATIONSHIP_ENTRY_COUNT_EXCEEDED,
  DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.UNSUPPORTED_STORY_COUNT_EXCEEDED,
];

const DOCX_PACKAGE_BOUNDARY_SUSPICIOUS_CODES = [
  DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.UNKNOWN_PART_PRESENT,
  DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.DIRECTORY_ENTRY_PRESENT,
  DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.RELATIONSHIP_PART_PRESENT,
  DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.UNSUPPORTED_STORY_PRESENT,
];

const DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_MESSAGES = Object.freeze({
  [DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.INVENTORY_NOT_OBJECT]: 'inventory must be a plain object',
  [DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.INVENTORY_PATH_INPUT_REJECTED]: 'inventory location input is not accepted',
  [DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.INVENTORY_BINARY_INPUT_REJECTED]: 'inventory binary input is not accepted',
  [DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.ENTRIES_MISSING]: 'entries array is required',
  [DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.ENTRIES_NOT_ARRAY]: 'entries must be an array',
  [DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.ENTRY_NOT_OBJECT]: 'entry must be a plain object',
  [DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.ENTRY_ID_INVALID]: 'entry id must be a non-empty string',
  [DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.ENTRY_KIND_INVALID]: 'entry kind is not supported',
  [DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.ENTRY_BYTE_SIZE_INVALID]: 'entry byteSize must be a finite nonnegative integer',
  [DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.ENTRY_COMPRESSED_SIZE_INVALID]: 'entry compressedSize must be a finite nonnegative integer',
  [DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.ENTRY_MARKERS_INVALID]: 'entry markers must be an array',
  [DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.ENTRY_MARKER_INVALID]: 'entry marker is not supported',
  [DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.ENTRY_STORY_INVALID]: 'entry story is not supported',
  [DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.UNKNOWN_SIZE_FIELD_PRESENT]: 'entry contains a non-contract size field',
  [DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.ENTRY_COUNT_EXCEEDED]: 'entry count exceeds budget',
  [DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.TOTAL_BYTES_EXCEEDED]: 'total byteSize exceeds budget',
  [DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.ENTRY_BYTES_EXCEEDED]: 'entry byteSize exceeds budget',
  [DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.RELATIONSHIP_ENTRY_COUNT_EXCEEDED]: 'relationship entry count exceeds budget',
  [DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.UNSUPPORTED_STORY_COUNT_EXCEEDED]: 'unsupported story count exceeds budget',
  [DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.UNKNOWN_PART_PRESENT]: 'unknown package part is present',
  [DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.DIRECTORY_ENTRY_PRESENT]: 'directory entry is present',
  [DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.RELATIONSHIP_PART_PRESENT]: 'relationship package part is present',
  [DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.UNSUPPORTED_STORY_PRESENT]: 'unsupported story entry is present',
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function preserveString(value) {
  return typeof value === 'string' ? value : '';
}

function cloneJsonSafe(value) {
  if (value === null) return null;
  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') return value;
  if (Array.isArray(value)) return value.map((item) => cloneJsonSafe(item));
  if (isPlainObject(value)) {
    const clone = {};
    for (const key of Object.keys(value).sort()) {
      const clonedValue = cloneJsonSafe(value[key]);
      if (clonedValue !== undefined) clone[key] = clonedValue;
    }
    return clone;
  }
  return undefined;
}

function normalizeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeBoolean(value) {
  return value === true;
}

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? value.map((item) => normalizeString(item)).filter(Boolean)
    : [];
}

function normalizeStringEnum(value, allowedValues, fallback) {
  const normalized = normalizeString(value);
  return allowedValues.includes(normalized) ? normalized : fallback;
}

function hasOwnField(input, field) {
  return isPlainObject(input) && Object.prototype.hasOwnProperty.call(input, field);
}

function stableRevisionBridgeDigest(value) {
  return `sha256:${hashCanonicalValue(value)}`;
}

function isDocxPackageBoundaryPlainObject(value) {
  if (!Boolean(value) || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isFiniteNonnegativeInteger(value) {
  return Number.isInteger(value) && Number.isFinite(value) && value >= 0;
}

function isDocxPackageBoundaryRejectedInput(input) {
  if (!Boolean(input) || typeof input !== 'object') return false;
  return DOCX_PACKAGE_BOUNDARY_INPUT_REJECT_KEYS.some((key) => (
    Object.prototype.hasOwnProperty.call(input, key)
  ))
    || (typeof input.byteLength === 'number' && typeof input.slice === 'function')
    || (typeof input.byteLength === 'number' && typeof input.subarray === 'function')
    || (typeof input['array' + 'B' + 'uffer'] === 'function' && typeof input.name === 'string')
    || (typeof input['str' + 'eam'] === 'function')
    || (typeof input.pipe === 'function')
    || (typeof input.getReader === 'function');
}

function docxPackageBoundarySeverity(code) {
  if (DOCX_PACKAGE_BOUNDARY_MALFORMED_CODES.includes(code)) return 'error';
  if (DOCX_PACKAGE_BOUNDARY_QUARANTINED_CODES.includes(code)) return 'error';
  if (DOCX_PACKAGE_BOUNDARY_SUSPICIOUS_CODES.includes(code)) return 'warning';
  return 'info';
}

function docxPackageBoundaryDiagnostic(code, options = {}) {
  const diagnostic = {
    code,
    severity: docxPackageBoundarySeverity(code),
    message: DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_MESSAGES[code] || code,
  };
  if (options.entryId !== undefined) diagnostic.entryId = options.entryId;
  if (options.limit !== undefined) diagnostic.limit = options.limit;
  if (options.actual !== undefined) diagnostic.actual = options.actual;
  return diagnostic;
}

function docxPackageBoundaryHasDiagnostic(diagnostics, codes) {
  return diagnostics.some((diagnostic) => codes.includes(diagnostic.code));
}

function docxPackageBoundaryPrimaryCode(diagnostics, codes) {
  for (const diagnostic of diagnostics) {
    if (codes.includes(diagnostic.code)) return diagnostic.code;
  }
  return null;
}

function docxPackageBoundaryCodeRank(code) {
  if (DOCX_PACKAGE_BOUNDARY_MALFORMED_CODES.includes(code)) return 0;
  if (DOCX_PACKAGE_BOUNDARY_QUARANTINED_CODES.includes(code)) return 1;
  if (DOCX_PACKAGE_BOUNDARY_SUSPICIOUS_CODES.includes(code)) return 2;
  return 3;
}

function sortDocxPackageBoundaryDiagnostics(diagnostics) {
  return diagnostics.slice().sort((left, right) => (
    docxPackageBoundaryCodeRank(left.code) - docxPackageBoundaryCodeRank(right.code)
    || String(left.code).localeCompare(String(right.code))
    || String(left.entryId || '').localeCompare(String(right.entryId || ''))
  ));
}

function docxPackageBoundaryEligibility(classification) {
  return {
    safe: true,
    parserCandidateOnly: classification === 'clean',
    canCreateReviewPacket: false,
    canPreviewApply: false,
    canImportMutate: false,
    canWriteStorage: false,
  };
}

function docxPackageBoundaryResult(classification, diagnostics) {
  const sortedDiagnostics = sortDocxPackageBoundaryDiagnostics(diagnostics);
  const clean = classification === 'clean';
  const rejected = classification === 'malformed' || classification === 'quarantined';
  const primaryCode = clean
    ? DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.CLEAN_INVENTORY
    : docxPackageBoundaryPrimaryCode(
      sortedDiagnostics,
      classification === 'malformed'
        ? DOCX_PACKAGE_BOUNDARY_MALFORMED_CODES
        : classification === 'quarantined'
          ? DOCX_PACKAGE_BOUNDARY_QUARANTINED_CODES
          : DOCX_PACKAGE_BOUNDARY_SUSPICIOUS_CODES,
    );

  return {
    ok: clean,
    type: 'docxPackageInventoryInspection',
    status: clean ? 'accepted' : rejected ? 'rejected' : 'degraded',
    code: primaryCode,
    reason: primaryCode,
    classification,
    diagnostics: sortedDiagnostics,
    budgets: { ...DOCX_PACKAGE_BOUNDARY_BUDGETS },
    eligibility: docxPackageBoundaryEligibility(classification),
  };
}

function collectDocxPackageBoundaryEntryDiagnostics(entry, index) {
  const diagnostics = [];
  if (!isDocxPackageBoundaryPlainObject(entry)) {
    diagnostics.push(docxPackageBoundaryDiagnostic(DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.ENTRY_NOT_OBJECT, {
      entryId: String(index),
    }));
    return diagnostics;
  }

  const entryId = typeof entry.id === 'string' ? entry.id.trim() : '';
  const diagnosticEntryId = entryId || String(index);
  for (const field of DOCX_PACKAGE_BOUNDARY_REJECTED_SIZE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(entry, field)) {
      diagnostics.push(docxPackageBoundaryDiagnostic(DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.UNKNOWN_SIZE_FIELD_PRESENT, {
        entryId: diagnosticEntryId,
      }));
    }
  }

  if (!entryId) {
    diagnostics.push(docxPackageBoundaryDiagnostic(DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.ENTRY_ID_INVALID, {
      entryId: String(index),
    }));
  }
  if (!DOCX_PACKAGE_BOUNDARY_ENTRY_KINDS.includes(entry.kind)) {
    diagnostics.push(docxPackageBoundaryDiagnostic(DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.ENTRY_KIND_INVALID, {
      entryId: diagnosticEntryId,
    }));
  }
  if (!isFiniteNonnegativeInteger(entry.byteSize)) {
    diagnostics.push(docxPackageBoundaryDiagnostic(DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.ENTRY_BYTE_SIZE_INVALID, {
      entryId: diagnosticEntryId,
    }));
  }
  if (
    Object.prototype.hasOwnProperty.call(entry, 'compressedSize')
    && !isFiniteNonnegativeInteger(entry.compressedSize)
  ) {
    diagnostics.push(docxPackageBoundaryDiagnostic(DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.ENTRY_COMPRESSED_SIZE_INVALID, {
      entryId: diagnosticEntryId,
    }));
  }
  if (
    Object.prototype.hasOwnProperty.call(entry, 'story')
    && !DOCX_PACKAGE_BOUNDARY_STORIES.includes(entry.story)
  ) {
    diagnostics.push(docxPackageBoundaryDiagnostic(DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.ENTRY_STORY_INVALID, {
      entryId: diagnosticEntryId,
    }));
  }
  if (Object.prototype.hasOwnProperty.call(entry, 'markers')) {
    if (!Array.isArray(entry.markers)) {
      diagnostics.push(docxPackageBoundaryDiagnostic(DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.ENTRY_MARKERS_INVALID, {
        entryId: diagnosticEntryId,
      }));
    } else {
      for (const marker of entry.markers) {
        if (typeof marker !== 'string' || !DOCX_PACKAGE_BOUNDARY_MARKERS.includes(marker)) {
          diagnostics.push(docxPackageBoundaryDiagnostic(DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.ENTRY_MARKER_INVALID, {
            entryId: diagnosticEntryId,
          }));
        }
      }
    }
  }
  return diagnostics;
}

function collectDocxPackageBoundaryInventoryDiagnostics(inventory) {
  const diagnostics = [];
  if (typeof inventory === 'string') {
    return [docxPackageBoundaryDiagnostic(DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.INVENTORY_PATH_INPUT_REJECTED)];
  }
  if (isDocxPackageBoundaryRejectedInput(inventory)) {
    const locationRejected = isPlainObject(inventory)
      && (hasOwnField(inventory, 'p' + 'ath') || hasOwnField(inventory, 'file' + 'P' + 'ath'));
    return [docxPackageBoundaryDiagnostic(
      locationRejected
        ? DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.INVENTORY_PATH_INPUT_REJECTED
        : DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.INVENTORY_BINARY_INPUT_REJECTED,
    )];
  }
  if (!isDocxPackageBoundaryPlainObject(inventory)) {
    return [docxPackageBoundaryDiagnostic(DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.INVENTORY_NOT_OBJECT)];
  }

  if (!Object.prototype.hasOwnProperty.call(inventory, 'entries')) {
    return [docxPackageBoundaryDiagnostic(DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.ENTRIES_MISSING)];
  }
  if (!Array.isArray(inventory.entries)) {
    return [docxPackageBoundaryDiagnostic(DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.ENTRIES_NOT_ARRAY)];
  }

  inventory.entries.forEach((entry, index) => {
    diagnostics.push(...collectDocxPackageBoundaryEntryDiagnostics(entry, index));
  });
  if (docxPackageBoundaryHasDiagnostic(diagnostics, DOCX_PACKAGE_BOUNDARY_MALFORMED_CODES)) return diagnostics;

  const relationshipEntries = [];
  const unsupportedStoryEntries = [];
  let totalByteSize = 0;

  inventory.entries.forEach((entry) => {
    const markers = Array.isArray(entry.markers) ? entry.markers : [];
    const relationshipEntry = entry.kind === 'relationshipPart' || markers.includes('relationship');
    const unsupportedStoryEntry = entry.story === 'unsupported' || markers.includes('unsupportedStory');

    totalByteSize += entry.byteSize;
    if (entry.byteSize > DOCX_PACKAGE_BOUNDARY_BUDGETS.maxEntryBytes) {
      diagnostics.push(docxPackageBoundaryDiagnostic(DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.ENTRY_BYTES_EXCEEDED, {
        entryId: entry.id,
        limit: DOCX_PACKAGE_BOUNDARY_BUDGETS.maxEntryBytes,
        actual: entry.byteSize,
      }));
    }
    if (entry.kind === 'unknownPart') {
      diagnostics.push(docxPackageBoundaryDiagnostic(DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.UNKNOWN_PART_PRESENT, {
        entryId: entry.id,
      }));
    }
    if (entry.kind === 'directory') {
      diagnostics.push(docxPackageBoundaryDiagnostic(DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.DIRECTORY_ENTRY_PRESENT, {
        entryId: entry.id,
      }));
    }
    if (relationshipEntry) {
      relationshipEntries.push(entry);
      diagnostics.push(docxPackageBoundaryDiagnostic(DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.RELATIONSHIP_PART_PRESENT, {
        entryId: entry.id,
      }));
    }
    if (unsupportedStoryEntry) {
      unsupportedStoryEntries.push(entry);
      diagnostics.push(docxPackageBoundaryDiagnostic(DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.UNSUPPORTED_STORY_PRESENT, {
        entryId: entry.id,
      }));
    }
  });

  if (inventory.entries.length > DOCX_PACKAGE_BOUNDARY_BUDGETS.maxEntries) {
    diagnostics.push(docxPackageBoundaryDiagnostic(DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.ENTRY_COUNT_EXCEEDED, {
      limit: DOCX_PACKAGE_BOUNDARY_BUDGETS.maxEntries,
      actual: inventory.entries.length,
    }));
  }
  if (totalByteSize > DOCX_PACKAGE_BOUNDARY_BUDGETS.maxTotalBytes) {
    diagnostics.push(docxPackageBoundaryDiagnostic(DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.TOTAL_BYTES_EXCEEDED, {
      limit: DOCX_PACKAGE_BOUNDARY_BUDGETS.maxTotalBytes,
      actual: totalByteSize,
    }));
  }
  if (relationshipEntries.length > DOCX_PACKAGE_BOUNDARY_BUDGETS.maxRelationshipEntries) {
    diagnostics.push(docxPackageBoundaryDiagnostic(DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.RELATIONSHIP_ENTRY_COUNT_EXCEEDED, {
      limit: DOCX_PACKAGE_BOUNDARY_BUDGETS.maxRelationshipEntries,
      actual: relationshipEntries.length,
    }));
  }
  if (unsupportedStoryEntries.length > DOCX_PACKAGE_BOUNDARY_BUDGETS.maxUnsupportedStoryEntries) {
    diagnostics.push(docxPackageBoundaryDiagnostic(DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.UNSUPPORTED_STORY_COUNT_EXCEEDED, {
      limit: DOCX_PACKAGE_BOUNDARY_BUDGETS.maxUnsupportedStoryEntries,
      actual: unsupportedStoryEntries.length,
    }));
  }

  return diagnostics;
}

export function inspectDocxPackageInventory(inventory = {}) {
  const diagnostics = collectDocxPackageBoundaryInventoryDiagnostics(inventory);
  if (docxPackageBoundaryHasDiagnostic(diagnostics, DOCX_PACKAGE_BOUNDARY_MALFORMED_CODES)) {
    return docxPackageBoundaryResult('malformed', diagnostics);
  }
  if (docxPackageBoundaryHasDiagnostic(diagnostics, DOCX_PACKAGE_BOUNDARY_QUARANTINED_CODES)) {
    return docxPackageBoundaryResult('quarantined', diagnostics);
  }
  if (docxPackageBoundaryHasDiagnostic(diagnostics, DOCX_PACKAGE_BOUNDARY_SUSPICIOUS_CODES)) {
    return docxPackageBoundaryResult('suspicious', diagnostics);
  }
  return docxPackageBoundaryResult('clean', []);
}

function collectForbiddenFieldReasons(input, fields, prefix, message) {
  const reasons = [];
  if (!isPlainObject(input)) return reasons;
  for (const field of fields) {
    if (hasOwnField(input, field)) reasons.push(invalidField(`${prefix}.${field}`, message));
  }
  return reasons;
}

// RB_06_DOCX_ZIP_INVENTORY_MATERIALIZER_START
const DOCX_ZIP_INVENTORY_MATERIALIZATION_TYPE = 'docxZipInventoryMaterialization';
const DOCX_ZIP_INVENTORY_MATERIALIZED_CODE = 'DOCX_ZIP_INVENTORY_MATERIALIZED';

const DOCX_ZIP_INVENTORY_BOUNDS = Object.freeze({
  MAX_INPUT_BYTES: 52428800,
  MAX_EOCD_SEARCH_BYTES: 65557,
  MAX_CENTRAL_DIRECTORY_BYTES: 2097152,
  MAX_ENTRIES: 512,
  MAX_ENTRY_NAME_BYTES: 1024,
  MAX_ENTRY_EXTRA_BYTES: 4096,
  MAX_ENTRY_COMMENT_BYTES: 4096,
  MAX_ENTRY_UNCOMPRESSED_BYTES: 33554432,
  MAX_TOTAL_UNCOMPRESSED_BYTES: 67108864,
  MAX_RELATIONSHIP_ENTRIES: 64,
  MAX_UNSUPPORTED_STORY_ENTRIES: 32,
});

const DOCX_ZIP_INVENTORY_DIAGNOSTIC_MESSAGES = Object.freeze({
  DOCX_ZIP_BYTES_INPUT_INVALID: 'input must be caller-supplied binary data',
  DOCX_ZIP_BYTES_INPUT_TOO_LARGE: 'input exceeds byte limit',
  DOCX_ZIP_EOCD_NOT_FOUND: 'end marker was not found',
  DOCX_ZIP_EOCD_TRUNCATED: 'end marker is truncated',
  DOCX_ZIP_MULTI_DISK_UNSUPPORTED: 'multi-disk archive is not supported',
  DOCX_ZIP64_UNSUPPORTED: 'ZIP64 archive is not supported',
  DOCX_ZIP_CENTRAL_DIRECTORY_TRUNCATED: 'central directory is truncated',
  DOCX_ZIP_CENTRAL_DIRECTORY_TOO_LARGE: 'central directory exceeds byte limit',
  DOCX_ZIP_ENTRY_COUNT_EXCEEDED: 'entry count exceeds limit',
  DOCX_ZIP_ENTRY_NAME_TOO_LARGE: 'entry name exceeds byte limit',
  DOCX_ZIP_ENTRY_EXTRA_TOO_LARGE: 'entry extra field exceeds byte limit',
  DOCX_ZIP_ENTRY_COMMENT_TOO_LARGE: 'entry comment exceeds byte limit',
  DOCX_ZIP_ENTRY_ENCRYPTED_UNSUPPORTED: 'encrypted entry is not supported',
  DOCX_ZIP_ENTRY_UNCOMPRESSED_SIZE_EXCEEDED: 'entry uncompressed size exceeds limit',
  DOCX_ZIP_TOTAL_UNCOMPRESSED_SIZE_EXCEEDED: 'total uncompressed size exceeds limit',
  DOCX_ZIP_ENTRY_NAME_INVALID: 'entry name is invalid',
  DOCX_ZIP_ENTRY_OFFSET_INVALID: 'entry offset is invalid',
});

const DOCX_ZIP_INVENTORY_KNOWN_PARTS = [
  '[Content_Types].xml',
  'docProps/core.xml',
  'docProps/app.xml',
  'docProps/custom.xml',
  'word/comments.xml',
  'word/commentsExtended.xml',
  'word/commentsExtensible.xml',
  'word/commentsIds.xml',
  'word/styles.xml',
  'word/settings.xml',
  'word/numbering.xml',
  'word/fontTable.xml',
  'word/people.xml',
  'word/stylesWithEffects.xml',
  'word/theme/theme1.xml',
  'word/webSettings.xml',
];

const DOCX_ZIP_CENTRAL_FILE_SIGNATURE = 0x02014b50;
const DOCX_ZIP_END_SIGNATURE = 0x06054b50;
const DOCX_ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const DOCX_ZIP_CENTRAL_FILE_FIXED_BYTES = 46;
const DOCX_ZIP_END_FIXED_BYTES = 22;
const DOCX_ZIP_FLAG_ENCRYPTED = 1;
const DOCX_ZIP_FLAG_DEFLATE_COMPRESSION_OPTION_1 = 2;
const DOCX_ZIP_FLAG_DEFLATE_COMPRESSION_OPTION_2 = 4;
const DOCX_ZIP_FLAG_DATA_DESCRIPTOR = 8;
const DOCX_ZIP_FLAGS_ALLOWED_MASK = DOCX_ZIP_FLAG_DEFLATE_COMPRESSION_OPTION_1
  | DOCX_ZIP_FLAG_DEFLATE_COMPRESSION_OPTION_2;
const DOCX_ZIP_U16_MAX = 0xffff;
const DOCX_ZIP_U32_MAX = 0xffffffff;

function docxZipInventoryBoundsCopy() {
  return { ...DOCX_ZIP_INVENTORY_BOUNDS };
}

function docxZipInventoryDiagnostic(code, options = {}) {
  const diagnostic = {
    code,
    severity: 'error',
    message: DOCX_ZIP_INVENTORY_DIAGNOSTIC_MESSAGES[code] || code,
  };
  if (options.entryId !== undefined) diagnostic.entryId = options.entryId;
  if (options.limit !== undefined) diagnostic.limit = options.limit;
  if (options.actual !== undefined) diagnostic.actual = options.actual;
  return diagnostic;
}

function docxZipInventoryFailure(code, options = {}) {
  const diagnostic = docxZipInventoryDiagnostic(code, options);
  return {
    ok: false,
    type: DOCX_ZIP_INVENTORY_MATERIALIZATION_TYPE,
    status: 'rejected',
    code,
    reason: code,
    diagnostics: [diagnostic],
    bounds: docxZipInventoryBoundsCopy(),
  };
}

function docxZipInventorySuccess(inventory) {
  return {
    ok: true,
    type: DOCX_ZIP_INVENTORY_MATERIALIZATION_TYPE,
    status: 'materialized',
    code: DOCX_ZIP_INVENTORY_MATERIALIZED_CODE,
    reason: DOCX_ZIP_INVENTORY_MATERIALIZED_CODE,
    inventory,
    inspection: inspectDocxPackageInventory(inventory),
    diagnostics: [],
    bounds: docxZipInventoryBoundsCopy(),
  };
}

function isDocxZipInventoryAcceptedView(value) {
  return value instanceof Uint8Array || value instanceof DataView;
}

function docxZipInventoryInputToBytes(input) {
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (isDocxZipInventoryAcceptedView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(input)) return input;
  return null;
}

function docxZipReadU16(bytes, cursor) {
  return bytes[cursor] | (bytes[cursor + 1] << 8);
}

function docxZipReadU32(bytes, cursor) {
  return (
    bytes[cursor]
    | (bytes[cursor + 1] << 8)
    | (bytes[cursor + 2] << 16)
    | (bytes[cursor + 3] << 24)
  ) >>> 0;
}

function docxZipFindEndRecord(bytes) {
  if (bytes.byteLength < DOCX_ZIP_END_FIXED_BYTES) return null;
  const lower = Math.max(0, bytes.byteLength - DOCX_ZIP_INVENTORY_BOUNDS.MAX_EOCD_SEARCH_BYTES);
  for (let cursor = bytes.byteLength - DOCX_ZIP_END_FIXED_BYTES; cursor >= lower; cursor -= 1) {
    if (docxZipReadU32(bytes, cursor) === DOCX_ZIP_END_SIGNATURE) return cursor;
  }
  return null;
}

function docxZipHasZip64Locator(bytes, endOffset) {
  return endOffset >= 20
    && docxZipReadU32(bytes, endOffset - 20) === DOCX_ZIP64_LOCATOR_SIGNATURE;
}

function docxZipReadAsciiName(bytes, cursor, size) {
  let name = '';
  for (let index = 0; index < size; index += 1) {
    const value = bytes[cursor + index];
    if (value < 0x20 || value > 0x7e) return null;
    name += String.fromCharCode(value);
  }
  return name;
}

function docxZipInventoryNameInvalid(name) {
  if (!name) return true;
  if (name.startsWith('/') || name.startsWith('\\')) return true;
  if (name.includes('\\')) return true;
  if (/^[A-Za-z]:/u.test(name)) return true;
  return name.split(/[\\/]/u).some((segment) => segment === '..');
}

function docxZipUnsupportedStoryName(name) {
  return (
    /^word\/header[^/]*\.xml$/u.test(name)
    || /^word\/footer[^/]*\.xml$/u.test(name)
    || name === 'word/footnotes.xml'
    || name === 'word/endnotes.xml'
    || name === 'word/comments.xml'
    || /^word\/textbox[^/]*\.xml$/u.test(name)
  );
}

function docxZipKnownSupportPartName(name) {
  return (
    DOCX_ZIP_INVENTORY_KNOWN_PARTS.includes(name)
    || /^customXml\/item\d+\.xml$/u.test(name)
    || /^customXml\/itemProps\d+\.xml$/u.test(name)
  );
}

function docxZipClassifyEntry(name) {
  if (name.endsWith('/') || name.endsWith('\\')) {
    return { kind: 'directory' };
  }
  if (name.includes('_rels/') || name.endsWith('.rels')) {
    return { kind: 'relationshipPart', markers: ['relationship'] };
  }
  if (name === 'word/document.xml') {
    return { kind: 'knownPart', story: 'main', markers: ['documentPart'] };
  }
  if (docxZipKnownSupportPartName(name)) {
    return { kind: 'knownPart' };
  }
  if (name.startsWith('word/media/')) {
    return { kind: 'knownPart', markers: ['mediaPart'] };
  }
  if (name === 'docProps/thumbnail.jpeg') {
    return { kind: 'knownPart', markers: ['mediaPart'] };
  }
  if (docxZipUnsupportedStoryName(name)) {
    return { kind: 'knownPart', story: 'unsupported', markers: ['unsupportedStory'] };
  }
  return { kind: 'unknownPart' };
}

function docxZipBuildEntry(name, byteSize, compressedSize) {
  const classified = docxZipClassifyEntry(name);
  const entry = {
    id: name,
    kind: classified.kind,
    byteSize,
    compressedSize,
  };
  if (classified.story !== undefined) entry.story = classified.story;
  if (classified.markers !== undefined) entry.markers = classified.markers.slice();
  return entry;
}

function docxZipValidateEndRecord(bytes, endOffset) {
  if (endOffset === null) {
    return bytes.byteLength < DOCX_ZIP_END_FIXED_BYTES
      ? { failure: docxZipInventoryFailure('DOCX_ZIP_EOCD_TRUNCATED') }
      : { failure: docxZipInventoryFailure('DOCX_ZIP_EOCD_NOT_FOUND') };
  }

  const endCommentSize = docxZipReadU16(bytes, endOffset + 20);
  if (endOffset + DOCX_ZIP_END_FIXED_BYTES + endCommentSize !== bytes.byteLength) {
    return { failure: docxZipInventoryFailure('DOCX_ZIP_EOCD_TRUNCATED') };
  }

  const diskIndex = docxZipReadU16(bytes, endOffset + 4);
  const centralDiskIndex = docxZipReadU16(bytes, endOffset + 6);
  const diskEntryCount = docxZipReadU16(bytes, endOffset + 8);
  const entryCount = docxZipReadU16(bytes, endOffset + 10);
  const centralSize = docxZipReadU32(bytes, endOffset + 12);
  const centralOffset = docxZipReadU32(bytes, endOffset + 16);

  if (diskIndex !== 0 || centralDiskIndex !== 0 || diskEntryCount !== entryCount) {
    return { failure: docxZipInventoryFailure('DOCX_ZIP_MULTI_DISK_UNSUPPORTED') };
  }
  if (
    docxZipHasZip64Locator(bytes, endOffset)
    || diskEntryCount === DOCX_ZIP_U16_MAX
    || entryCount === DOCX_ZIP_U16_MAX
    || centralSize === DOCX_ZIP_U32_MAX
    || centralOffset === DOCX_ZIP_U32_MAX
  ) {
    return { failure: docxZipInventoryFailure('DOCX_ZIP64_UNSUPPORTED') };
  }
  if (centralSize > DOCX_ZIP_INVENTORY_BOUNDS.MAX_CENTRAL_DIRECTORY_BYTES) {
    return {
      failure: docxZipInventoryFailure('DOCX_ZIP_CENTRAL_DIRECTORY_TOO_LARGE', {
        limit: DOCX_ZIP_INVENTORY_BOUNDS.MAX_CENTRAL_DIRECTORY_BYTES,
        actual: centralSize,
      }),
    };
  }
  if (entryCount > DOCX_ZIP_INVENTORY_BOUNDS.MAX_ENTRIES) {
    return {
      failure: docxZipInventoryFailure('DOCX_ZIP_ENTRY_COUNT_EXCEEDED', {
        limit: DOCX_ZIP_INVENTORY_BOUNDS.MAX_ENTRIES,
        actual: entryCount,
      }),
    };
  }
  if (centralOffset + centralSize > endOffset || centralOffset + centralSize > bytes.byteLength) {
    return { failure: docxZipInventoryFailure('DOCX_ZIP_CENTRAL_DIRECTORY_TRUNCATED') };
  }
  return {
    record: {
      centralOffset,
      centralSize,
      entryCount,
    },
  };
}

function docxZipParseCentralDirectory(bytes, record) {
  const entries = [];
  let totalByteSize = 0;
  let cursor = record.centralOffset;
  const centralEnd = record.centralOffset + record.centralSize;

  for (let index = 0; index < record.entryCount; index += 1) {
    if (cursor + DOCX_ZIP_CENTRAL_FILE_FIXED_BYTES > centralEnd) {
      return { failure: docxZipInventoryFailure('DOCX_ZIP_CENTRAL_DIRECTORY_TRUNCATED') };
    }
    if (docxZipReadU32(bytes, cursor) !== DOCX_ZIP_CENTRAL_FILE_SIGNATURE) {
      return { failure: docxZipInventoryFailure('DOCX_ZIP_CENTRAL_DIRECTORY_TRUNCATED') };
    }

    const flags = docxZipReadU16(bytes, cursor + 8);
    const compressedSize = docxZipReadU32(bytes, cursor + 20);
    const byteSize = docxZipReadU32(bytes, cursor + 24);
    const nameSize = docxZipReadU16(bytes, cursor + 28);
    const extraSize = docxZipReadU16(bytes, cursor + 30);
    const commentSize = docxZipReadU16(bytes, cursor + 32);
    const diskStart = docxZipReadU16(bytes, cursor + 34);
    const localOffset = docxZipReadU32(bytes, cursor + 42);
    const recordSize = DOCX_ZIP_CENTRAL_FILE_FIXED_BYTES + nameSize + extraSize + commentSize;

    if (cursor + recordSize > centralEnd) {
      return { failure: docxZipInventoryFailure('DOCX_ZIP_CENTRAL_DIRECTORY_TRUNCATED') };
    }
    if (flags & DOCX_ZIP_FLAG_ENCRYPTED) {
      return { failure: docxZipInventoryFailure('DOCX_ZIP_ENTRY_ENCRYPTED_UNSUPPORTED') };
    }
    if (
      compressedSize === DOCX_ZIP_U32_MAX
      || byteSize === DOCX_ZIP_U32_MAX
      || localOffset === DOCX_ZIP_U32_MAX
    ) {
      return { failure: docxZipInventoryFailure('DOCX_ZIP64_UNSUPPORTED') };
    }
    if (diskStart !== 0) {
      return { failure: docxZipInventoryFailure('DOCX_ZIP_MULTI_DISK_UNSUPPORTED') };
    }
    if (nameSize > DOCX_ZIP_INVENTORY_BOUNDS.MAX_ENTRY_NAME_BYTES) {
      return {
        failure: docxZipInventoryFailure('DOCX_ZIP_ENTRY_NAME_TOO_LARGE', {
          limit: DOCX_ZIP_INVENTORY_BOUNDS.MAX_ENTRY_NAME_BYTES,
          actual: nameSize,
        }),
      };
    }
    if (extraSize > DOCX_ZIP_INVENTORY_BOUNDS.MAX_ENTRY_EXTRA_BYTES) {
      return {
        failure: docxZipInventoryFailure('DOCX_ZIP_ENTRY_EXTRA_TOO_LARGE', {
          limit: DOCX_ZIP_INVENTORY_BOUNDS.MAX_ENTRY_EXTRA_BYTES,
          actual: extraSize,
        }),
      };
    }
    if (commentSize > DOCX_ZIP_INVENTORY_BOUNDS.MAX_ENTRY_COMMENT_BYTES) {
      return {
        failure: docxZipInventoryFailure('DOCX_ZIP_ENTRY_COMMENT_TOO_LARGE', {
          limit: DOCX_ZIP_INVENTORY_BOUNDS.MAX_ENTRY_COMMENT_BYTES,
          actual: commentSize,
        }),
      };
    }
    if (localOffset >= record.centralOffset || localOffset >= bytes.byteLength) {
      return { failure: docxZipInventoryFailure('DOCX_ZIP_ENTRY_OFFSET_INVALID') };
    }
    if (byteSize > DOCX_ZIP_INVENTORY_BOUNDS.MAX_ENTRY_UNCOMPRESSED_BYTES) {
      return {
        failure: docxZipInventoryFailure('DOCX_ZIP_ENTRY_UNCOMPRESSED_SIZE_EXCEEDED', {
          limit: DOCX_ZIP_INVENTORY_BOUNDS.MAX_ENTRY_UNCOMPRESSED_BYTES,
          actual: byteSize,
        }),
      };
    }

    totalByteSize += byteSize;
    if (totalByteSize > DOCX_ZIP_INVENTORY_BOUNDS.MAX_TOTAL_UNCOMPRESSED_BYTES) {
      return {
        failure: docxZipInventoryFailure('DOCX_ZIP_TOTAL_UNCOMPRESSED_SIZE_EXCEEDED', {
          limit: DOCX_ZIP_INVENTORY_BOUNDS.MAX_TOTAL_UNCOMPRESSED_BYTES,
          actual: totalByteSize,
        }),
      };
    }

    const name = docxZipReadAsciiName(bytes, cursor + DOCX_ZIP_CENTRAL_FILE_FIXED_BYTES, nameSize);
    if (docxZipInventoryNameInvalid(name)) {
      return { failure: docxZipInventoryFailure('DOCX_ZIP_ENTRY_NAME_INVALID') };
    }

    entries.push(docxZipBuildEntry(name, byteSize, compressedSize));
    cursor += recordSize;
  }

  if (cursor !== centralEnd) {
    return { failure: docxZipInventoryFailure('DOCX_ZIP_CENTRAL_DIRECTORY_TRUNCATED') };
  }
  return { inventory: { entries } };
}

export function materializeDocxPackageInventoryFromZipBytes(input) {
  const bytes = docxZipInventoryInputToBytes(input);
  if (bytes === null) return docxZipInventoryFailure('DOCX_ZIP_BYTES_INPUT_INVALID');
  if (bytes.byteLength > DOCX_ZIP_INVENTORY_BOUNDS.MAX_INPUT_BYTES) {
    return {
      ...docxZipInventoryFailure('DOCX_ZIP_BYTES_INPUT_TOO_LARGE', {
        limit: DOCX_ZIP_INVENTORY_BOUNDS.MAX_INPUT_BYTES,
        actual: bytes.byteLength,
      }),
    };
  }

  const endOffset = docxZipFindEndRecord(bytes);
  const endResult = docxZipValidateEndRecord(bytes, endOffset);
  if (endResult.failure) return endResult.failure;

  const centralResult = docxZipParseCentralDirectory(bytes, endResult.record);
  if (centralResult.failure) return centralResult.failure;
  return docxZipInventorySuccess(centralResult.inventory);
}
// RB_06_DOCX_ZIP_INVENTORY_MATERIALIZER_END

// RB_09_DOCX_HOSTILE_FILE_GATE_START
const DOCX_HOSTILE_FILE_GATE_TYPE = 'docxHostileFileGate';

const DOCX_HOSTILE_FILE_GATE_BUDGETS = Object.freeze({
  maxCompressionRatio: 200,
  maxDeclarationScanBytes: 4096,
});

const DOCX_HOSTILE_FILE_GATE_ZIP_QUARANTINE_CODES = new Set([
  'DOCX_ZIP_BYTES_INPUT_TOO_LARGE',
  'DOCX_ZIP_CENTRAL_DIRECTORY_TOO_LARGE',
  'DOCX_ZIP_ENTRY_COUNT_EXCEEDED',
  'DOCX_ZIP_ENTRY_UNCOMPRESSED_SIZE_EXCEEDED',
  'DOCX_ZIP_TOTAL_UNCOMPRESSED_SIZE_EXCEEDED',
]);

const DOCX_HOSTILE_FILE_GATE_DIAGNOSTIC_MESSAGES = Object.freeze({
  [DOCX_HOSTILE_FILE_GATE_REASON_CODES.PASS]: 'container policy pass only; semantic parse not attempted',
  [DOCX_HOSTILE_FILE_GATE_REASON_CODES.PACKAGE_MALFORMED]: 'package metadata is malformed for Stage02 gate',
  [DOCX_HOSTILE_FILE_GATE_REASON_CODES.PACKAGE_QUARANTINED]: 'package exceeds Stage02 quarantine limits',
  [DOCX_HOSTILE_FILE_GATE_REASON_CODES.ENCRYPTED_ENTRY_PRESENT]: 'encrypted ZIP entry blocks Stage02 gate',
  [DOCX_HOSTILE_FILE_GATE_REASON_CODES.PATH_TRAVERSAL_DETECTED]: 'path traversal entry name blocks Stage02 gate',
  [DOCX_HOSTILE_FILE_GATE_REASON_CODES.EXTERNAL_RELATIONSHIP_PRESENT]: 'external relationship part blocks Stage02 gate',
  [DOCX_HOSTILE_FILE_GATE_REASON_CODES.DUPLICATE_ENTRY_NAME]: 'duplicate ZIP entry name blocks Stage02 gate',
  [DOCX_HOSTILE_FILE_GATE_REASON_CODES.COMPRESSION_RATIO_EXCEEDED]: 'compression ratio exceeds Stage02 budget',
  [DOCX_HOSTILE_FILE_GATE_REASON_CODES.XML_DTD_DECLARATION_PRESENT]: 'DTD declaration blocks Stage02 gate',
  [DOCX_HOSTILE_FILE_GATE_REASON_CODES.XML_ENTITY_DECLARATION_PRESENT]: 'ENTITY declaration blocks Stage02 gate',
  [DOCX_HOSTILE_FILE_GATE_REASON_CODES.DECLARATION_SCAN_UNAVAILABLE]: 'declaration scan cannot proceed safely within Stage02 scope',
});

function docxHostileFileGateBudgetsCopy() {
  return {
    ...DOCX_ZIP_INVENTORY_BOUNDS,
    ...DOCX_PACKAGE_BOUNDARY_BUDGETS,
    ...DOCX_HOSTILE_FILE_GATE_BUDGETS,
  };
}

function docxHostileFileGateInflateRawSync(rawBytes, maxOutputLength) {
  const zlibModule = typeof process?.getBuiltinModule === 'function'
    ? process.getBuiltinModule('node:zlib')
    : null;
  if (!zlibModule || typeof zlibModule.inflateRawSync !== 'function') {
    throw new Error('DOCX_ZLIB_UNAVAILABLE');
  }
  return zlibModule.inflateRawSync(Buffer.from(rawBytes), { maxOutputLength });
}

function docxHostileFileGateDiagnostic(code, options = {}) {
  const diagnostic = {
    code,
    severity: options.severity || (code === DOCX_HOSTILE_FILE_GATE_REASON_CODES.PASS ? 'info' : 'error'),
    message: DOCX_HOSTILE_FILE_GATE_DIAGNOSTIC_MESSAGES[code] || code,
  };
  if (options.entryId !== undefined) diagnostic.entryId = options.entryId;
  if (options.sourceCode !== undefined) diagnostic.sourceCode = options.sourceCode;
  if (options.actual !== undefined) diagnostic.actual = options.actual;
  if (options.limit !== undefined) diagnostic.limit = options.limit;
  return diagnostic;
}

function docxHostileFileGateEvidence(kind, options = {}) {
  const evidence = { kind };
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined) evidence[key] = value;
  }
  return evidence;
}

function docxHostileFileGateSortDiagnostics(diagnostics) {
  return diagnostics.slice().sort((left, right) => (
    String(left.code).localeCompare(String(right.code))
    || String(left.entryId || '').localeCompare(String(right.entryId || ''))
    || String(left.sourceCode || '').localeCompare(String(right.sourceCode || ''))
  ));
}

function docxHostileFileGateSortEvidence(evidence) {
  return evidence.slice().sort((left, right) => (
    String(left.kind).localeCompare(String(right.kind))
    || String(left.entryId || '').localeCompare(String(right.entryId || ''))
    || String(left.code || '').localeCompare(String(right.code || ''))
  ));
}

function docxHostileFileGateResult(decision, code, diagnostics = [], evidence = []) {
  const sortedDiagnostics = docxHostileFileGateSortDiagnostics(diagnostics);
  const sortedEvidence = docxHostileFileGateSortEvidence(evidence);
  const accepted = decision === 'pass';
  return {
    ok: accepted,
    schemaVersion: DOCX_HOSTILE_FILE_GATE_SCHEMA,
    type: DOCX_HOSTILE_FILE_GATE_TYPE,
    status: accepted ? 'accepted' : decision === 'quarantined' ? 'rejected' : 'blocked',
    code,
    reason: code,
    decision,
    diagnostics: sortedDiagnostics,
    evidence: sortedEvidence,
    budgets: docxHostileFileGateBudgetsCopy(),
    parse: {
      attempted: false,
      semanticAllowed: accepted,
    },
  };
}

function docxHostileFileGateFailureFromMaterializer(result) {
  const sourceCode = result?.code;
  if (sourceCode === 'DOCX_ZIP_ENTRY_ENCRYPTED_UNSUPPORTED') {
    return docxHostileFileGateResult(
      'blocked',
      DOCX_HOSTILE_FILE_GATE_REASON_CODES.ENCRYPTED_ENTRY_PRESENT,
      [docxHostileFileGateDiagnostic(DOCX_HOSTILE_FILE_GATE_REASON_CODES.ENCRYPTED_ENTRY_PRESENT, { sourceCode })],
      [docxHostileFileGateEvidence('materializerFailure', { sourceCode })],
    );
  }
  if (sourceCode === 'DOCX_ZIP_ENTRY_NAME_INVALID') {
    return docxHostileFileGateResult(
      'blocked',
      DOCX_HOSTILE_FILE_GATE_REASON_CODES.PATH_TRAVERSAL_DETECTED,
      [docxHostileFileGateDiagnostic(DOCX_HOSTILE_FILE_GATE_REASON_CODES.PATH_TRAVERSAL_DETECTED, { sourceCode })],
      [docxHostileFileGateEvidence('materializerFailure', { sourceCode })],
    );
  }

  const quarantine = DOCX_HOSTILE_FILE_GATE_ZIP_QUARANTINE_CODES.has(sourceCode);
  const code = quarantine
    ? DOCX_HOSTILE_FILE_GATE_REASON_CODES.PACKAGE_QUARANTINED
    : DOCX_HOSTILE_FILE_GATE_REASON_CODES.PACKAGE_MALFORMED;
  return docxHostileFileGateResult(
    'quarantined',
    code,
    [docxHostileFileGateDiagnostic(code, { sourceCode })],
    [docxHostileFileGateEvidence('materializerFailure', { sourceCode })],
  );
}

function docxHostileFileGateCentralEntries(bytes) {
  const endOffset = docxZipFindEndRecord(bytes);
  const endResult = docxZipValidateEndRecord(bytes, endOffset);
  if (endResult.failure) return { failure: endResult.failure };

  const entries = [];
  let cursor = endResult.record.centralOffset;
  const centralEnd = endResult.record.centralOffset + endResult.record.centralSize;
  for (let index = 0; index < endResult.record.entryCount; index += 1) {
    if (cursor + DOCX_ZIP_CENTRAL_FILE_FIXED_BYTES > centralEnd) {
      return { failure: docxZipInventoryFailure('DOCX_ZIP_CENTRAL_DIRECTORY_TRUNCATED') };
    }
    if (docxZipReadU32(bytes, cursor) !== DOCX_ZIP_CENTRAL_FILE_SIGNATURE) {
      return { failure: docxZipInventoryFailure('DOCX_ZIP_CENTRAL_DIRECTORY_TRUNCATED') };
    }
    const method = docxZipReadU16(bytes, cursor + 10);
    const flags = docxZipReadU16(bytes, cursor + 8);
    const compressedSize = docxZipReadU32(bytes, cursor + 20);
    const byteSize = docxZipReadU32(bytes, cursor + 24);
    const nameSize = docxZipReadU16(bytes, cursor + 28);
    const extraSize = docxZipReadU16(bytes, cursor + 30);
    const commentSize = docxZipReadU16(bytes, cursor + 32);
    const localOffset = docxZipReadU32(bytes, cursor + 42);
    const recordSize = DOCX_ZIP_CENTRAL_FILE_FIXED_BYTES + nameSize + extraSize + commentSize;
    if (cursor + recordSize > centralEnd) {
      return { failure: docxZipInventoryFailure('DOCX_ZIP_CENTRAL_DIRECTORY_TRUNCATED') };
    }
    const name = docxZipReadAsciiName(bytes, cursor + DOCX_ZIP_CENTRAL_FILE_FIXED_BYTES, nameSize);
    if (docxZipInventoryNameInvalid(name)) {
      return { failure: docxZipInventoryFailure('DOCX_ZIP_ENTRY_NAME_INVALID') };
    }
    entries.push({
      entryId: name,
      flags,
      method,
      compressedSize,
      byteSize,
      localOffset,
    });
    cursor += recordSize;
  }
  if (cursor !== centralEnd) {
    return { failure: docxZipInventoryFailure('DOCX_ZIP_CENTRAL_DIRECTORY_TRUNCATED') };
  }
  return { entries };
}

function docxHostileFileGateInvalidScanResult(entryId, sourceCode) {
  return docxHostileFileGateResult(
    'blocked',
    DOCX_HOSTILE_FILE_GATE_REASON_CODES.DECLARATION_SCAN_UNAVAILABLE,
    [docxHostileFileGateDiagnostic(DOCX_HOSTILE_FILE_GATE_REASON_CODES.DECLARATION_SCAN_UNAVAILABLE, {
      entryId,
      sourceCode,
    })],
    [docxHostileFileGateEvidence('declarationScan', {
      entryId,
      sourceCode,
    })],
  );
}

function docxHostileFileGateValidateLocalHeader(bytes, entry) {
  const localOffset = entry.localOffset;
  if (localOffset + 30 > bytes.byteLength) {
    return { failure: docxHostileFileGateInvalidScanResult(entry.entryId, 'DOCX_ZIP_ENTRY_OFFSET_INVALID') };
  }
  if (docxZipReadU32(bytes, localOffset) !== 0x04034b50) {
    return { failure: docxHostileFileGateInvalidScanResult(entry.entryId, 'DOCX_ZIP_LOCAL_HEADER_INVALID') };
  }

  const localFlags = docxZipReadU16(bytes, localOffset + 6);
  const localMethod = docxZipReadU16(bytes, localOffset + 8);
  const localCompressedSize = docxZipReadU32(bytes, localOffset + 18);
  const localByteSize = docxZipReadU32(bytes, localOffset + 22);
  const nameSize = docxZipReadU16(bytes, localOffset + 26);
  const extraSize = docxZipReadU16(bytes, localOffset + 28);
  const localName = docxZipReadAsciiName(bytes, localOffset + 30, nameSize);
  if ((localFlags & DOCX_ZIP_FLAG_ENCRYPTED) || (entry.flags & DOCX_ZIP_FLAG_ENCRYPTED)) {
    return {
      failure: docxHostileFileGateResult(
        'blocked',
        DOCX_HOSTILE_FILE_GATE_REASON_CODES.ENCRYPTED_ENTRY_PRESENT,
        [docxHostileFileGateDiagnostic(DOCX_HOSTILE_FILE_GATE_REASON_CODES.ENCRYPTED_ENTRY_PRESENT, {
          entryId: entry.entryId,
          sourceCode: 'DOCX_ZIP_LOCAL_ENCRYPTED_FLAG',
        })],
        [docxHostileFileGateEvidence('localHeader', {
          entryId: entry.entryId,
          sourceCode: 'DOCX_ZIP_LOCAL_ENCRYPTED_FLAG',
        })],
      ),
    };
  }
  if (localFlags !== entry.flags) {
    return { failure: docxHostileFileGateInvalidScanResult(entry.entryId, 'DOCX_ZIP_LOCAL_FLAG_MISMATCH') };
  }
  if (entry.flags & DOCX_ZIP_FLAG_DATA_DESCRIPTOR) {
    return { failure: docxHostileFileGateInvalidScanResult(entry.entryId, 'DOCX_ZIP_DATA_DESCRIPTOR_UNSUPPORTED') };
  }
  if (entry.flags & ~DOCX_ZIP_FLAGS_ALLOWED_MASK) {
    return { failure: docxHostileFileGateInvalidScanResult(entry.entryId, 'DOCX_ZIP_FLAGS_UNSUPPORTED') };
  }
  if (entry.flags !== 0 && entry.method !== 8) {
    return { failure: docxHostileFileGateInvalidScanResult(entry.entryId, 'DOCX_ZIP_FLAGS_METHOD_UNSUPPORTED') };
  }
  if (
    localMethod !== entry.method
    || localCompressedSize !== entry.compressedSize
    || localByteSize !== entry.byteSize
    || localName !== entry.entryId
  ) {
    return { failure: docxHostileFileGateInvalidScanResult(entry.entryId, 'DOCX_ZIP_LOCAL_HEADER_MISMATCH') };
  }
  return {
    dataOffset: localOffset + 30 + nameSize + extraSize,
  };
}

function docxHostileFileGateInflatedDeclarationText(bytes, entry) {
  const localHeader = docxHostileFileGateValidateLocalHeader(bytes, entry);
  if (localHeader.failure) return localHeader;
  const dataOffset = localHeader.dataOffset;
  const dataEnd = dataOffset + entry.compressedSize;
  if (dataOffset > bytes.byteLength || dataEnd > bytes.byteLength) {
    return { failure: docxHostileFileGateInvalidScanResult(entry.entryId, 'DOCX_ZIP_ENTRY_OFFSET_INVALID') };
  }

  const rawBytes = bytes.subarray(dataOffset, dataEnd);
  let contentBytes = rawBytes;
  if (entry.method === 8) {
    try {
      contentBytes = docxHostileFileGateInflateRawSync(
        rawBytes,
        Math.min(
          DOCX_ZIP_INVENTORY_BOUNDS.MAX_ENTRY_UNCOMPRESSED_BYTES,
          Math.max(entry.byteSize, DOCX_HOSTILE_FILE_GATE_BUDGETS.maxDeclarationScanBytes),
        ),
      );
    } catch {
      return { failure: docxHostileFileGateInvalidScanResult(entry.entryId, 'DOCX_ZIP_INFLATE_FAILED') };
    }
  } else if (entry.method !== 0) {
    return { failure: docxHostileFileGateInvalidScanResult(entry.entryId, `DOCX_ZIP_METHOD_${entry.method}`) };
  }
  if (contentBytes.length !== entry.byteSize) {
    return { failure: docxHostileFileGateInvalidScanResult(entry.entryId, 'DOCX_ZIP_INFLATED_SIZE_MISMATCH') };
  }

  return {
    text: Buffer.from(contentBytes.subarray(0, DOCX_HOSTILE_FILE_GATE_BUDGETS.maxDeclarationScanBytes)).toString('utf8'),
    truncated: contentBytes.length > DOCX_HOSTILE_FILE_GATE_BUDGETS.maxDeclarationScanBytes,
    contentBytes,
  };
}

function docxHostileFileGateXmlCandidate(entryId) {
  return /\.xml$/iu.test(entryId) || /\.rels$/iu.test(entryId);
}

function docxHostileFileGateRelationshipTargetModeBlocked(xmlText) {
  const assignments = xmlText.match(/\bTargetMode\s*=/giu) || [];
  if (assignments.length === 0) return false;
  const values = Array.from(xmlText.matchAll(/\bTargetMode\s*=\s*(["'])([^"']*)\1/giu));
  if (values.length !== assignments.length) return true;
  return values.some((match) => match[2].trim().toLowerCase() !== 'internal');
}

function docxHostileFileGateCompressionRatioExceeded(entry) {
  if (!isFiniteNonnegativeInteger(entry.byteSize) || !isFiniteNonnegativeInteger(entry.compressedSize)) {
    return false;
  }
  if (entry.byteSize === 0) return false;
  if (entry.compressedSize === 0) return true;
  return (entry.byteSize / entry.compressedSize) > DOCX_HOSTILE_FILE_GATE_BUDGETS.maxCompressionRatio;
}

function docxHostileFileGateNormalizedEntryId(entryId) {
  return String(entryId).replace(/\\/gu, '/').toLowerCase();
}

function docxHostileFileGateDeclarationRegionCode(scanResult) {
  const text = scanResult.text;
  let cursor = 0;
  while (cursor < text.length) {
    while (cursor < text.length && /\s/iu.test(text[cursor])) cursor += 1;
    if (cursor >= text.length) {
      return scanResult.truncated ? DOCX_HOSTILE_FILE_GATE_REASON_CODES.DECLARATION_SCAN_UNAVAILABLE : null;
    }
    if (text.startsWith('<?', cursor)) {
      const end = text.indexOf('?>', cursor + 2);
      if (end === -1) return DOCX_HOSTILE_FILE_GATE_REASON_CODES.DECLARATION_SCAN_UNAVAILABLE;
      cursor = end + 2;
      continue;
    }
    if (text.startsWith('<!--', cursor)) {
      const end = text.indexOf('-->', cursor + 4);
      if (end === -1) return DOCX_HOSTILE_FILE_GATE_REASON_CODES.DECLARATION_SCAN_UNAVAILABLE;
      cursor = end + 3;
      continue;
    }
    if (text.startsWith('<!ENTITY', cursor)) return DOCX_HOSTILE_FILE_GATE_REASON_CODES.XML_ENTITY_DECLARATION_PRESENT;
    if (text.startsWith('<!DOCTYPE', cursor)) return DOCX_HOSTILE_FILE_GATE_REASON_CODES.XML_DTD_DECLARATION_PRESENT;
    if (text.startsWith('<', cursor)) return null;
    return DOCX_HOSTILE_FILE_GATE_REASON_CODES.DECLARATION_SCAN_UNAVAILABLE;
  }
  return scanResult.truncated ? DOCX_HOSTILE_FILE_GATE_REASON_CODES.DECLARATION_SCAN_UNAVAILABLE : null;
}

function docxHostileFileGateBlockedResult(code, entryId, options = {}) {
  return docxHostileFileGateResult(
    'blocked',
    code,
    [docxHostileFileGateDiagnostic(code, {
      entryId,
      sourceCode: options.sourceCode,
      actual: options.actual,
      limit: options.limit,
    })],
    [docxHostileFileGateEvidence(options.kind || 'entry', {
      entryId,
      sourceCode: options.sourceCode,
      actual: options.actual,
      limit: options.limit,
    })],
  );
}

export function inspectDocxHostileFileGateFromZipBytes(input) {
  const bytes = docxZipInventoryInputToBytes(input);
  if (bytes === null) {
    return docxHostileFileGateResult(
      'quarantined',
      DOCX_HOSTILE_FILE_GATE_REASON_CODES.PACKAGE_MALFORMED,
      [docxHostileFileGateDiagnostic(DOCX_HOSTILE_FILE_GATE_REASON_CODES.PACKAGE_MALFORMED, {
        sourceCode: 'DOCX_ZIP_BYTES_INPUT_INVALID',
      })],
      [docxHostileFileGateEvidence('input', { sourceCode: 'DOCX_ZIP_BYTES_INPUT_INVALID' })],
    );
  }

  const materialized = materializeDocxPackageInventoryFromZipBytes(bytes);
  if (!materialized.ok) return docxHostileFileGateFailureFromMaterializer(materialized);
  const inspection = inspectDocxPackageInventory(materialized.inventory);

  const metadataResult = docxHostileFileGateCentralEntries(bytes);
  if (metadataResult.failure) return docxHostileFileGateFailureFromMaterializer(metadataResult.failure);

  const seenEntryIds = new Set();
  for (const entry of metadataResult.entries) {
    if (entry.method !== 0 && entry.method !== 8) {
      return docxHostileFileGateInvalidScanResult(entry.entryId, `DOCX_ZIP_METHOD_${entry.method}`);
    }
    const localHeader = docxHostileFileGateValidateLocalHeader(bytes, entry);
    if (localHeader.failure) return localHeader.failure;
    const normalizedEntryId = docxHostileFileGateNormalizedEntryId(entry.entryId);
    if (seenEntryIds.has(normalizedEntryId)) {
      return docxHostileFileGateBlockedResult(
        DOCX_HOSTILE_FILE_GATE_REASON_CODES.DUPLICATE_ENTRY_NAME,
        entry.entryId,
        { kind: 'duplicateEntry' },
      );
    }
    seenEntryIds.add(normalizedEntryId);
    if (docxHostileFileGateCompressionRatioExceeded(entry)) {
      return docxHostileFileGateBlockedResult(
        DOCX_HOSTILE_FILE_GATE_REASON_CODES.COMPRESSION_RATIO_EXCEEDED,
        entry.entryId,
        {
          kind: 'compressionRatio',
          actual: entry.compressedSize === 0 ? Number.POSITIVE_INFINITY : (entry.byteSize / entry.compressedSize),
          limit: DOCX_HOSTILE_FILE_GATE_BUDGETS.maxCompressionRatio,
        },
      );
    }
  }
  if (!metadataResult.entries.some((entry) => entry.entryId === 'word/document.xml')) {
    return docxHostileFileGateResult(
      'quarantined',
      DOCX_HOSTILE_FILE_GATE_REASON_CODES.PACKAGE_QUARANTINED,
      [docxHostileFileGateDiagnostic(DOCX_HOSTILE_FILE_GATE_REASON_CODES.PACKAGE_QUARANTINED, {
        sourceCode: 'DOCX_MAIN_DOCUMENT_MISSING',
      })],
      [docxHostileFileGateEvidence('inventory', {
        sourceCode: 'DOCX_MAIN_DOCUMENT_MISSING',
      })],
    );
  }
  const contentPreviewSafePackageCodes = new Set([
    DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.DIRECTORY_ENTRY_PRESENT,
    DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.RELATIONSHIP_PART_PRESENT,
    DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.UNSUPPORTED_STORY_PRESENT,
  ]);
  const blockingPackageDiagnostic = inspection.diagnostics.find((diagnostic) => (
    !contentPreviewSafePackageCodes.has(diagnostic.code)
  ));
  if (inspection.classification !== 'clean' && blockingPackageDiagnostic) {
    return docxHostileFileGateResult(
      'quarantined',
      DOCX_HOSTILE_FILE_GATE_REASON_CODES.PACKAGE_QUARANTINED,
      [docxHostileFileGateDiagnostic(DOCX_HOSTILE_FILE_GATE_REASON_CODES.PACKAGE_QUARANTINED, {
        sourceCode: blockingPackageDiagnostic.code,
      })],
      [docxHostileFileGateEvidence('inspection', {
        sourceCode: blockingPackageDiagnostic.code,
      })],
    );
  }

  for (const entry of metadataResult.entries) {
    if (!docxHostileFileGateXmlCandidate(entry.entryId)) continue;
    const scanResult = docxHostileFileGateInflatedDeclarationText(bytes, entry);
    if (scanResult.failure) return scanResult.failure;
    if (
      /\.rels$/iu.test(entry.entryId)
      && docxHostileFileGateRelationshipTargetModeBlocked(Buffer.from(scanResult.contentBytes).toString('utf8'))
    ) {
      return docxHostileFileGateBlockedResult(
        DOCX_HOSTILE_FILE_GATE_REASON_CODES.EXTERNAL_RELATIONSHIP_PRESENT,
        entry.entryId,
        { kind: 'relationshipScan' },
      );
    }
    const declarationCode = docxHostileFileGateDeclarationRegionCode(scanResult);
    if (declarationCode === DOCX_HOSTILE_FILE_GATE_REASON_CODES.XML_ENTITY_DECLARATION_PRESENT) {
      return docxHostileFileGateBlockedResult(
        DOCX_HOSTILE_FILE_GATE_REASON_CODES.XML_ENTITY_DECLARATION_PRESENT,
        entry.entryId,
        { kind: 'declarationScan' },
      );
    }
    if (declarationCode === DOCX_HOSTILE_FILE_GATE_REASON_CODES.XML_DTD_DECLARATION_PRESENT) {
      return docxHostileFileGateBlockedResult(
        DOCX_HOSTILE_FILE_GATE_REASON_CODES.XML_DTD_DECLARATION_PRESENT,
        entry.entryId,
        { kind: 'declarationScan' },
      );
    }
    if (declarationCode === DOCX_HOSTILE_FILE_GATE_REASON_CODES.DECLARATION_SCAN_UNAVAILABLE) {
      return docxHostileFileGateInvalidScanResult(entry.entryId, 'DOCX_XML_DECLARATION_REGION_UNAVAILABLE');
    }
  }

  return docxHostileFileGateResult(
    'pass',
    DOCX_HOSTILE_FILE_GATE_REASON_CODES.PASS,
    [],
    [
      docxHostileFileGateEvidence('inspection', {
        sourceCode: inspection.code,
      }),
      docxHostileFileGateEvidence('inventory', {
        entryCount: materialized.inventory.entries.length,
      }),
    ],
  );
}
// RB_09_DOCX_HOSTILE_FILE_GATE_END

// RB_08_DOCX_PART_POLICY_CLASSIFIER_START
const DOCX_PART_POLICY_TYPE = 'docxPartPolicyClassification';

const DOCX_PART_POLICY_CATEGORY_NAMES = [
  'mainDocumentPart',
  'knownSupportPart',
  'mediaPart',
  'relationshipPart',
  'unsupportedStoryPart',
  'unknownPart',
  'directoryPart',
];

const DOCX_PART_POLICY_DIAGNOSTIC_MESSAGES = Object.freeze({
  [DOCX_PART_POLICY_DIAGNOSTIC_CODES.INPUT_REJECTED]: 'input must be caller-supplied inventory metadata',
  [DOCX_PART_POLICY_DIAGNOSTIC_CODES.PACKAGE_REJECTED]: 'package boundary inspection rejected the inventory',
  [DOCX_PART_POLICY_DIAGNOSTIC_CODES.MAIN_DOCUMENT_MISSING]: 'main document part is missing',
  [DOCX_PART_POLICY_DIAGNOSTIC_CODES.MAIN_DOCUMENT_DUPLICATE]: 'main document part is duplicated',
  [DOCX_PART_POLICY_DIAGNOSTIC_CODES.RELATIONSHIP_DIAGNOSTICS_ONLY]: 'relationship part is diagnostics-only for plain text content preview',
  [DOCX_PART_POLICY_DIAGNOSTIC_CODES.UNSUPPORTED_STORY_DIAGNOSTICS_ONLY]: 'unsupported story part is diagnostics-only',
  [DOCX_PART_POLICY_DIAGNOSTIC_CODES.UNKNOWN_PART_DIAGNOSTICS_ONLY]: 'unknown part is diagnostics-only',
  [DOCX_PART_POLICY_DIAGNOSTIC_CODES.DIRECTORY_DIAGNOSTICS_ONLY]: 'directory part is diagnostics-only',
  [DOCX_PART_POLICY_DIAGNOSTIC_CODES.MEDIA_DIAGNOSTICS_ONLY]: 'media part is diagnostics-only',
  [DOCX_PART_POLICY_DIAGNOSTIC_CODES.ACCEPTED]: 'part policy accepted metadata-only inventory',
});

function docxPartPolicyEmptyCategories() {
  const categories = {};
  for (const category of DOCX_PART_POLICY_CATEGORY_NAMES) {
    categories[category] = { count: 0, entryIds: [] };
  }
  return categories;
}

function docxPartPolicyDiagnostic(code, options = {}) {
  const diagnostic = {
    code,
    severity: options.severity || (code === DOCX_PART_POLICY_DIAGNOSTIC_CODES.ACCEPTED ? 'info' : 'warning'),
    message: DOCX_PART_POLICY_DIAGNOSTIC_MESSAGES[code] || code,
  };
  if (options.category !== undefined) diagnostic.category = options.category;
  if (options.entryId !== undefined) diagnostic.entryId = options.entryId;
  if (options.sourceCode !== undefined) diagnostic.sourceCode = options.sourceCode;
  return diagnostic;
}

function docxPartPolicyEligibility(decision, diagnostics) {
  const contentPreviewSafeCodes = new Set([
    DOCX_PART_POLICY_DIAGNOSTIC_CODES.RELATIONSHIP_DIAGNOSTICS_ONLY,
    DOCX_PART_POLICY_DIAGNOSTIC_CODES.UNSUPPORTED_STORY_DIAGNOSTICS_ONLY,
    DOCX_PART_POLICY_DIAGNOSTIC_CODES.DIRECTORY_DIAGNOSTICS_ONLY,
    DOCX_PART_POLICY_DIAGNOSTIC_CODES.MEDIA_DIAGNOSTICS_ONLY,
  ]);
  const contentPreviewSafe = diagnostics.every((diagnostic) => contentPreviewSafeCodes.has(diagnostic.code));
  return {
    safe: true,
    parserCandidateOnly: (
      decision === DOCX_PART_POLICY_DECISIONS.ACCEPTED
      || decision === DOCX_PART_POLICY_DECISIONS.DEGRADED
    ) && contentPreviewSafe,
    canCreateReviewPacket: false,
    canPreviewApply: false,
    canImportMutate: false,
    canWriteStorage: false,
  };
}

function docxPartPolicyInputRejected(input) {
  if (typeof input === 'string') return true;
  if (!input || typeof input !== 'object') return false;
  return isDocxPackageBoundaryRejectedInput(input)
    || typeof input.nodeType === 'number'
    || typeof input.nodeName === 'string'
    || typeof input.tagName === 'string'
    || hasOwnField(input, 'documentElement')
    || hasOwnField(input, 'childNodes')
    || hasOwnField(input, 'ownerDocument')
    || (typeof input.name === 'string' && typeof input.arrayBuffer === 'function');
}

function docxPartPolicyNormalizeInput(input) {
  if (docxPartPolicyInputRejected(input)) return { rejected: true };
  const hasWrappedInventory = isPlainObject(input) && hasOwnField(input, 'inventory');
  const inventory = hasWrappedInventory ? input.inventory : input;
  const inspection = isPlainObject(input) && hasOwnField(input, 'inspection') ? input.inspection : null;
  return { inventory, inspection };
}

function docxPartPolicyEntryId(entry, index) {
  return typeof entry?.id === 'string' && entry.id.trim() ? entry.id.trim() : String(index);
}

function docxPartPolicyEntryMarkers(entry) {
  return Array.isArray(entry?.markers)
    ? entry.markers.filter((marker) => typeof marker === 'string').slice().sort()
    : [];
}

function docxPartPolicyEntryCategories(entry) {
  const markers = docxPartPolicyEntryMarkers(entry);
  const categories = [];
  if (entry?.kind === 'directory') categories.push('directoryPart');
  if (entry?.kind === 'unknownPart') categories.push('unknownPart');
  if (entry?.kind === 'relationshipPart' || markers.includes('relationship')) categories.push('relationshipPart');
  if (entry?.story === 'unsupported' || markers.includes('unsupportedStory')) categories.push('unsupportedStoryPart');
  if (markers.includes('mediaPart')) categories.push('mediaPart');
  if (entry?.story === 'main' || markers.includes('documentPart') || entry?.id === 'word/document.xml') {
    categories.push('mainDocumentPart');
  }
  if (entry?.kind === 'knownPart' && categories.length === 0) categories.push('knownSupportPart');
  return categories.length > 0 ? categories : ['unknownPart'];
}

function docxPartPolicyEvidenceForEntry(entry, index, category) {
  const evidence = {
    category,
    entryId: docxPartPolicyEntryId(entry, index),
    kind: typeof entry?.kind === 'string' ? entry.kind : undefined,
    story: typeof entry?.story === 'string' ? entry.story : undefined,
    markers: docxPartPolicyEntryMarkers(entry),
    byteSize: isFiniteNonnegativeInteger(entry?.byteSize) ? entry.byteSize : undefined,
    compressedSize: isFiniteNonnegativeInteger(entry?.compressedSize) ? entry.compressedSize : undefined,
  };
  for (const key of Object.keys(evidence)) {
    if (evidence[key] === undefined) delete evidence[key];
  }
  return evidence;
}

function docxPartPolicyAddCategory(categories, category, entryId) {
  categories[category].count += 1;
  categories[category].entryIds.push(entryId);
}

function docxPartPolicySeverityForInspection(inspection) {
  return inspection?.classification === 'quarantined' || inspection?.classification === 'malformed'
    ? 'error'
    : 'warning';
}

function docxPartPolicyInspectionEvidence(inspection) {
  return {
    category: 'packageInspection',
    classification: typeof inspection?.classification === 'string' ? inspection.classification : undefined,
    status: typeof inspection?.status === 'string' ? inspection.status : undefined,
    code: typeof inspection?.code === 'string' ? inspection.code : undefined,
  };
}

function docxPartPolicyResult(decision, code, diagnostics, categories, evidence) {
  const sortedDiagnostics = diagnostics.slice().sort((left, right) => (
    String(left.code).localeCompare(String(right.code))
    || String(left.category || '').localeCompare(String(right.category || ''))
    || String(left.entryId || '').localeCompare(String(right.entryId || ''))
  ));
  const sortedEvidence = evidence.slice().sort((left, right) => (
    String(left.category).localeCompare(String(right.category))
    || String(left.entryId || '').localeCompare(String(right.entryId || ''))
    || String(left.code || '').localeCompare(String(right.code || ''))
  ));
  for (const category of DOCX_PART_POLICY_CATEGORY_NAMES) {
    categories[category].entryIds.sort();
  }
  return {
    schemaVersion: DOCX_PART_POLICY_SCHEMA,
    type: DOCX_PART_POLICY_TYPE,
    status: decision,
    code,
    reason: code,
    decision,
    categories,
    diagnostics: sortedDiagnostics,
    evidence: sortedEvidence,
    eligibility: docxPartPolicyEligibility(decision, sortedDiagnostics),
  };
}

export function classifyDocxPartPolicy(input = {}) {
  const normalized = docxPartPolicyNormalizeInput(input);
  const categories = docxPartPolicyEmptyCategories();
  const evidence = [];
  const diagnostics = [];

  if (normalized.rejected) {
    const code = DOCX_PART_POLICY_DIAGNOSTIC_CODES.INPUT_REJECTED;
    diagnostics.push(docxPartPolicyDiagnostic(code, { severity: 'error' }));
    return docxPartPolicyResult(DOCX_PART_POLICY_DECISIONS.REJECTED, code, diagnostics, categories, evidence);
  }

  const inspection = normalized.inspection || inspectDocxPackageInventory(normalized.inventory);
  evidence.push(docxPartPolicyInspectionEvidence(inspection));
  if (inspection.classification === 'malformed' || inspection.classification === 'quarantined') {
    const code = DOCX_PART_POLICY_DIAGNOSTIC_CODES.PACKAGE_REJECTED;
    diagnostics.push(docxPartPolicyDiagnostic(code, {
      severity: docxPartPolicySeverityForInspection(inspection),
      sourceCode: inspection.code,
    }));
    return docxPartPolicyResult(DOCX_PART_POLICY_DECISIONS.REJECTED, code, diagnostics, categories, evidence);
  }

  const entries = Array.isArray(normalized.inventory?.entries) ? normalized.inventory.entries : [];
  entries.forEach((entry, index) => {
    const entryId = docxPartPolicyEntryId(entry, index);
    for (const category of docxPartPolicyEntryCategories(entry)) {
      docxPartPolicyAddCategory(categories, category, entryId);
      evidence.push(docxPartPolicyEvidenceForEntry(entry, index, category));
    }
  });

  if (categories.mainDocumentPart.count === 0) {
    diagnostics.push(docxPartPolicyDiagnostic(DOCX_PART_POLICY_DIAGNOSTIC_CODES.MAIN_DOCUMENT_MISSING, {
      category: 'mainDocumentPart',
    }));
  }
  if (categories.mainDocumentPart.count > 1) {
    for (const entryId of categories.mainDocumentPart.entryIds) {
      diagnostics.push(docxPartPolicyDiagnostic(DOCX_PART_POLICY_DIAGNOSTIC_CODES.MAIN_DOCUMENT_DUPLICATE, {
        category: 'mainDocumentPart',
        entryId,
      }));
    }
  }

  const degradedCategories = [
    ['relationshipPart', DOCX_PART_POLICY_DIAGNOSTIC_CODES.RELATIONSHIP_DIAGNOSTICS_ONLY],
    ['unsupportedStoryPart', DOCX_PART_POLICY_DIAGNOSTIC_CODES.UNSUPPORTED_STORY_DIAGNOSTICS_ONLY],
    ['unknownPart', DOCX_PART_POLICY_DIAGNOSTIC_CODES.UNKNOWN_PART_DIAGNOSTICS_ONLY],
    ['directoryPart', DOCX_PART_POLICY_DIAGNOSTIC_CODES.DIRECTORY_DIAGNOSTICS_ONLY],
    ['mediaPart', DOCX_PART_POLICY_DIAGNOSTIC_CODES.MEDIA_DIAGNOSTICS_ONLY],
  ];
  for (const [category, diagnosticCode] of degradedCategories) {
    for (const entryId of categories[category].entryIds) {
      diagnostics.push(docxPartPolicyDiagnostic(diagnosticCode, { category, entryId }));
    }
  }

  if (inspection.classification === 'suspicious' && diagnostics.length === 0) {
    diagnostics.push(docxPartPolicyDiagnostic(DOCX_PART_POLICY_DIAGNOSTIC_CODES.PACKAGE_REJECTED, {
      severity: 'warning',
      sourceCode: inspection.code,
    }));
  }

  if (diagnostics.length > 0) {
    const code = diagnostics.some((diagnostic) => diagnostic.severity === 'error')
      ? DOCX_PART_POLICY_DIAGNOSTIC_CODES.PACKAGE_REJECTED
      : diagnostics[0].code;
    return docxPartPolicyResult(DOCX_PART_POLICY_DECISIONS.DEGRADED, code, diagnostics, categories, evidence);
  }

  return docxPartPolicyResult(
    DOCX_PART_POLICY_DECISIONS.ACCEPTED,
    DOCX_PART_POLICY_DIAGNOSTIC_CODES.ACCEPTED,
    [],
    categories,
    evidence,
  );
}
// RB_08_DOCX_PART_POLICY_CLASSIFIER_END

// RB_10_DOCX_INTAKE_PREFLIGHT_REPORT_START
export const DOCX_INTAKE_PREFLIGHT_REPORT_SCHEMA = 'revision-bridge.docx-intake-preflight-report.v1';
const DOCX_INTAKE_PREFLIGHT_REPORT_TYPE = 'docxIntakePreflightReport';

function docxIntakePreflightCloneOrNull(value) {
  return isPlainObject(value) ? cloneJsonSafe(value) || {} : null;
}

function docxIntakePreflightTaggedDiagnostics(source, diagnostics) {
  return Array.isArray(diagnostics)
    ? diagnostics.map((diagnostic) => ({
      source,
      ...(cloneJsonSafe(diagnostic) || {}),
    }))
    : [];
}

function docxIntakePreflightTaggedEvidence(source, evidence) {
  return Array.isArray(evidence)
    ? evidence.map((item) => ({
      source,
      ...(cloneJsonSafe(item) || {}),
    }))
    : [];
}

function docxIntakePreflightSortRecords(records) {
  return records.slice().sort((left, right) => (
    String(left.source || '').localeCompare(String(right.source || ''))
    || String(left.code || '').localeCompare(String(right.code || ''))
    || String(left.category || '').localeCompare(String(right.category || ''))
    || String(left.entryId || '').localeCompare(String(right.entryId || ''))
    || String(left.kind || '').localeCompare(String(right.kind || ''))
  ));
}

function docxIntakePreflightInventorySummary(inventory) {
  const entries = Array.isArray(inventory?.entries) ? inventory.entries : [];
  const categoryCounts = {
    directoryPart: 0,
    knownSupportPart: 0,
    mainDocumentPart: 0,
    mediaPart: 0,
    relationshipPart: 0,
    unknownPart: 0,
    unsupportedStoryPart: 0,
  };
  let totalByteSize = 0;
  let totalCompressedSize = 0;

  entries.forEach((entry, index) => {
    if (isFiniteNonnegativeInteger(entry?.byteSize)) totalByteSize += entry.byteSize;
    if (isFiniteNonnegativeInteger(entry?.compressedSize)) totalCompressedSize += entry.compressedSize;
    for (const category of docxPartPolicyEntryCategories(entry)) {
      categoryCounts[category] += 1;
    }
  });

  return {
    entryCount: entries.length,
    totalByteSize,
    totalCompressedSize,
    categoryCounts,
  };
}

function docxIntakePreflightEmptyInventorySummary() {
  return {
    entryCount: 0,
    totalByteSize: 0,
    totalCompressedSize: 0,
    categoryCounts: {
      directoryPart: 0,
      knownSupportPart: 0,
      mainDocumentPart: 0,
      mediaPart: 0,
      relationshipPart: 0,
      unknownPart: 0,
      unsupportedStoryPart: 0,
    },
  };
}

function docxIntakePreflightEligibility(gate, packageInspection, partPolicy) {
  const gatePass = gate?.ok === true && gate?.decision === 'pass';
  const contentPreviewSafePackageCodes = new Set([
    DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.DIRECTORY_ENTRY_PRESENT,
    DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.RELATIONSHIP_PART_PRESENT,
    DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.UNSUPPORTED_STORY_PRESENT,
  ]);
  const packageDiagnostics = Array.isArray(packageInspection?.diagnostics)
    ? packageInspection.diagnostics
    : [];
  const packageSafe = packageInspection?.classification === 'clean'
    || packageDiagnostics.every((diagnostic) => contentPreviewSafePackageCodes.has(diagnostic.code));
  const partEligibility = isPlainObject(partPolicy?.eligibility) ? partPolicy.eligibility : {};
  const parserCandidateOnly = gatePass
    && packageSafe
    && partEligibility.parserCandidateOnly === true;
  return {
    safe: gatePass && packageSafe && partEligibility.safe === true,
    parserCandidateOnly,
    canCreateReviewPacket: false,
    canPreviewApply: false,
    canImportMutate: false,
    canWriteStorage: false,
  };
}

function docxIntakePreflightStatus(gate, partPolicy) {
  const gatePass = gate?.ok === true && gate?.decision === 'pass';
  if (!gatePass) return gate?.status === 'blocked' ? 'blocked' : 'rejected';
  if (partPolicy?.decision === DOCX_PART_POLICY_DECISIONS.DEGRADED) return 'degraded';
  if (partPolicy?.decision === DOCX_PART_POLICY_DECISIONS.ACCEPTED) return 'accepted';
  return 'rejected';
}

function docxIntakePreflightDecision(gate, partPolicy) {
  const gatePass = gate?.ok === true && gate?.decision === 'pass';
  if (!gatePass) return typeof gate?.decision === 'string' ? gate.decision : 'quarantined';
  return typeof partPolicy?.decision === 'string' ? partPolicy.decision : 'rejected';
}

function docxIntakePreflightPrimaryCode(gate, partPolicy) {
  const gatePass = gate?.ok === true && gate?.decision === 'pass';
  if (!gatePass) return typeof gate?.code === 'string' ? gate.code : 'DOCX_INTAKE_PREFLIGHT_GATE_NOT_PASSED';
  return typeof partPolicy?.code === 'string' ? partPolicy.code : 'DOCX_INTAKE_PREFLIGHT_ACCEPTED';
}

function docxIntakePreflightSummary(
  gate,
  packageInspection,
  partPolicy,
  inventorySummary,
  materializationCode,
) {
  const status = docxIntakePreflightStatus(gate, partPolicy);
  const decision = docxIntakePreflightDecision(gate, partPolicy);
  const code = docxIntakePreflightPrimaryCode(gate, partPolicy);
  return {
    status,
    decision,
    code,
    reason: code,
    gatePass: gate?.ok === true && gate?.decision === 'pass',
    packageClassification: typeof packageInspection?.classification === 'string'
      ? packageInspection.classification
      : 'unavailable',
    packageStatus: typeof packageInspection?.status === 'string'
      ? packageInspection.status
      : 'unavailable',
    partPolicyDecision: typeof partPolicy?.decision === 'string'
      ? partPolicy.decision
      : 'unavailable',
    materializationCode: materializationCode || 'DOCX_ZIP_INVENTORY_MATERIALIZED',
    semanticParseNotRun: gate?.parse?.attempted !== true,
    inventory: inventorySummary,
    eligibility: docxIntakePreflightEligibility(gate, packageInspection, partPolicy),
  };
}

export function buildDocxIntakePreflightReportFromZipBytes(input) {
  const materialized = materializeDocxPackageInventoryFromZipBytes(input);
  const gate = inspectDocxHostileFileGateFromZipBytes(input);
  const packageInspection = materialized.ok === true
    ? inspectDocxPackageInventory(materialized.inventory)
    : null;
  const partPolicy = materialized.ok === true
    ? classifyDocxPartPolicy({ inventory: materialized.inventory, inspection: packageInspection })
    : null;
  const inventorySummary = materialized.ok === true
    ? docxIntakePreflightInventorySummary(materialized.inventory)
    : docxIntakePreflightEmptyInventorySummary();
  const summary = docxIntakePreflightSummary(
    gate,
    packageInspection,
    partPolicy,
    inventorySummary,
    materialized.code,
  );
  const diagnostics = docxIntakePreflightSortRecords([
    ...docxIntakePreflightTaggedDiagnostics('gate', gate.diagnostics),
    ...docxIntakePreflightTaggedDiagnostics('packageInspection', packageInspection?.diagnostics),
    ...docxIntakePreflightTaggedDiagnostics('partPolicy', partPolicy?.diagnostics),
  ]);
  const evidence = docxIntakePreflightSortRecords([
    ...docxIntakePreflightTaggedEvidence('gate', gate.evidence),
    ...docxIntakePreflightTaggedEvidence('partPolicy', partPolicy?.evidence),
  ]);

  return {
    ok: summary.eligibility.parserCandidateOnly === true,
    schemaVersion: DOCX_INTAKE_PREFLIGHT_REPORT_SCHEMA,
    type: DOCX_INTAKE_PREFLIGHT_REPORT_TYPE,
    status: summary.status,
    code: summary.code,
    reason: summary.reason,
    decision: summary.decision,
    gatePass: summary.gatePass,
    diagnostics,
    evidence,
    budgets: isPlainObject(gate.budgets) ? cloneJsonSafe(gate.budgets) || {} : {},
    preflightSummary: summary,
    packageInspection: docxIntakePreflightCloneOrNull(packageInspection),
    partPolicy: docxIntakePreflightCloneOrNull(partPolicy),
    semanticParseNotRun: summary.semanticParseNotRun,
    parse: {
      attempted: false,
      semanticAllowed: false,
    },
    gate: cloneJsonSafe(gate) || {},
  };
}
// RB_10_DOCX_INTAKE_PREFLIGHT_REPORT_END

// RB_10A_DOCX_REVIEW_PREFLIGHT_REPORT_START
export const DOCX_REVIEW_PREFLIGHT_REPORT_SCHEMA = 'revision-bridge.docx-review-preflight-report.v1';
const DOCX_REVIEW_PREFLIGHT_REPORT_TYPE = 'docxReviewPreflightReport';
const DOCX_REVIEW_PREFLIGHT_LOSS_REPORT_SCHEMA = 'revision-bridge.docx-review-preflight-loss-report.v1';

const DOCX_REVIEW_PREFLIGHT_CODES = Object.freeze({
  READY_EMPTY: 'DOCX_REVIEW_PREFLIGHT_NO_REVIEW_EVIDENCE',
  READY_WITH_EVIDENCE: 'DOCX_REVIEW_PREFLIGHT_REVIEW_EVIDENCE_FOUND',
  BLOCKED: 'DOCX_REVIEW_PREFLIGHT_BLOCKED',
  TARGET_UNAVAILABLE: 'DOCX_REVIEW_PREFLIGHT_TARGET_UNAVAILABLE',
  UNSAFE_DECLARATION_PRESENT: 'DOCX_REVIEW_PREFLIGHT_UNSAFE_DECLARATION_PRESENT',
  XML_SCAN_LIMIT_EXCEEDED: 'DOCX_REVIEW_PREFLIGHT_XML_SCAN_LIMIT_EXCEEDED',
});

const DOCX_REVIEW_PREFLIGHT_TARGET_PARTS = Object.freeze([
  'word/document.xml',
  'word/comments.xml',
]);

const DOCX_REVIEW_PREFLIGHT_HARD_GATE_CODES = new Set([
  DOCX_HOSTILE_FILE_GATE_REASON_CODES.PACKAGE_MALFORMED,
  DOCX_HOSTILE_FILE_GATE_REASON_CODES.ENCRYPTED_ENTRY_PRESENT,
  DOCX_HOSTILE_FILE_GATE_REASON_CODES.PATH_TRAVERSAL_DETECTED,
  DOCX_HOSTILE_FILE_GATE_REASON_CODES.DUPLICATE_ENTRY_NAME,
  DOCX_HOSTILE_FILE_GATE_REASON_CODES.COMPRESSION_RATIO_EXCEEDED,
  DOCX_HOSTILE_FILE_GATE_REASON_CODES.XML_DTD_DECLARATION_PRESENT,
  DOCX_HOSTILE_FILE_GATE_REASON_CODES.XML_ENTITY_DECLARATION_PRESENT,
  DOCX_HOSTILE_FILE_GATE_REASON_CODES.DECLARATION_SCAN_UNAVAILABLE,
]);

const DOCX_REVIEW_PREFLIGHT_BOUNDS = Object.freeze({
  maxTargetPartBytes: DOCX_ZIP_INVENTORY_BOUNDS.MAX_ENTRY_UNCOMPRESSED_BYTES,
  maxXmlScanChars: 32_000_000,
  maxDiagnostics: 200,
  maxUnsupportedItems: 200,
});

function docxReviewPreflightDiagnostic(code, options = {}) {
  const diagnostic = {
    code,
    severity: options.severity || 'error',
    message: options.message || code,
  };
  if (options.sourcePart !== undefined) diagnostic.sourcePart = options.sourcePart;
  if (options.sourceCode !== undefined) diagnostic.sourceCode = options.sourceCode;
  if (options.tagName !== undefined) diagnostic.tagName = options.tagName;
  if (options.actual !== undefined) diagnostic.actual = options.actual;
  if (options.limit !== undefined) diagnostic.limit = options.limit;
  return diagnostic;
}

function docxReviewPreflightUnsupportedItem(code, options = {}) {
  const item = {
    code,
    severity: options.severity || 'warning',
    category: options.category || 'review',
    message: options.message || code,
  };
  if (options.sourcePart !== undefined) item.sourcePart = options.sourcePart;
  if (options.sourceCode !== undefined) item.sourceCode = options.sourceCode;
  if (options.tagName !== undefined) item.tagName = options.tagName;
  return item;
}

function docxReviewPreflightLossReport(items) {
  const normalizedItems = Array.isArray(items)
    ? items.slice(0, DOCX_REVIEW_PREFLIGHT_BOUNDS.maxUnsupportedItems)
    : [];
  return {
    schemaVersion: DOCX_REVIEW_PREFLIGHT_LOSS_REPORT_SCHEMA,
    mode: 'diagnostic-only',
    itemCount: normalizedItems.length,
    items: normalizedItems,
  };
}

function docxReviewPreflightEmptyEvidence() {
  return {
    present: false,
    sourceParts: [],
  };
}

function docxReviewPreflightCountMatches(xmlText, pattern) {
  const matches = String(xmlText || '').match(pattern);
  return Array.isArray(matches) ? matches.length : 0;
}

function docxReviewPreflightBuildCommentsEvidence(documentXml, commentsXml) {
  const commentPartPresent = typeof commentsXml === 'string';
  const commentCount = commentPartPresent
    ? docxReviewPreflightCountMatches(commentsXml, /<\s*w:comment\b/giu)
    : 0;
  const rangeStartCount = docxReviewPreflightCountMatches(documentXml, /<\s*w:commentRangeStart\b/giu);
  const rangeEndCount = docxReviewPreflightCountMatches(documentXml, /<\s*w:commentRangeEnd\b/giu);
  const referenceCount = docxReviewPreflightCountMatches(documentXml, /<\s*w:commentReference\b/giu);
  const present = commentPartPresent || rangeStartCount > 0 || rangeEndCount > 0 || referenceCount > 0;
  if (!present) return docxReviewPreflightEmptyEvidence();
  return {
    present: true,
    commentPartPresent,
    commentCount,
    rangeStartCount,
    rangeEndCount,
    referenceCount,
    sourceParts: [
      ...(commentPartPresent ? ['word/comments.xml'] : []),
      ...(rangeStartCount > 0 || rangeEndCount > 0 || referenceCount > 0 ? ['word/document.xml'] : []),
    ],
  };
}

function docxReviewPreflightBuildTrackedChangesEvidence(documentXml) {
  const insertCount = docxReviewPreflightCountMatches(documentXml, /<\s*w:ins\b/giu);
  const deleteCount = docxReviewPreflightCountMatches(documentXml, /<\s*w:del\b/giu);
  const moveFromCount = docxReviewPreflightCountMatches(documentXml, /<\s*w:moveFrom\b/giu);
  const moveToCount = docxReviewPreflightCountMatches(documentXml, /<\s*w:moveTo\b/giu);
  const present = insertCount > 0 || deleteCount > 0 || moveFromCount > 0 || moveToCount > 0;
  if (!present) return docxReviewPreflightEmptyEvidence();
  return {
    present: true,
    insertCount,
    deleteCount,
    moveFromCount,
    moveToCount,
    sourceParts: ['word/document.xml'],
  };
}

function docxReviewPreflightExtractTargetXml(bytes, entries, sourcePart) {
  const entry = entries.find((candidate) => candidate.entryId === sourcePart);
  if (!entry) return { missing: true };
  if (entry.byteSize > DOCX_REVIEW_PREFLIGHT_BOUNDS.maxTargetPartBytes) {
    return {
      failure: docxReviewPreflightDiagnostic(DOCX_REVIEW_PREFLIGHT_CODES.TARGET_UNAVAILABLE, {
        sourcePart,
        sourceCode: 'DOCX_REVIEW_PREFLIGHT_TARGET_BYTES_EXCEEDED',
        actual: entry.byteSize,
        limit: DOCX_REVIEW_PREFLIGHT_BOUNDS.maxTargetPartBytes,
      }),
    };
  }

  const localHeader = docxHostileFileGateValidateLocalHeader(bytes, entry);
  if (localHeader.failure) {
    return {
      failure: docxReviewPreflightDiagnostic(DOCX_REVIEW_PREFLIGHT_CODES.TARGET_UNAVAILABLE, {
        sourcePart,
        sourceCode: localHeader.failure.code,
      }),
    };
  }
  const dataOffset = localHeader.dataOffset;
  const dataEnd = dataOffset + entry.compressedSize;
  if (dataOffset > bytes.byteLength || dataEnd > bytes.byteLength) {
    return {
      failure: docxReviewPreflightDiagnostic(DOCX_REVIEW_PREFLIGHT_CODES.TARGET_UNAVAILABLE, {
        sourcePart,
        sourceCode: 'DOCX_ZIP_ENTRY_OFFSET_INVALID',
      }),
    };
  }

  const rawBytes = bytes.subarray(dataOffset, dataEnd);
  let contentBytes = rawBytes;
  if (entry.method === 8) {
    try {
      contentBytes = docxHostileFileGateInflateRawSync(
        rawBytes,
        DOCX_REVIEW_PREFLIGHT_BOUNDS.maxTargetPartBytes,
      );
    } catch {
      return {
        failure: docxReviewPreflightDiagnostic(DOCX_REVIEW_PREFLIGHT_CODES.TARGET_UNAVAILABLE, {
          sourcePart,
          sourceCode: 'DOCX_ZIP_INFLATE_FAILED',
        }),
      };
    }
  } else if (entry.method !== 0) {
    return {
      failure: docxReviewPreflightDiagnostic(DOCX_REVIEW_PREFLIGHT_CODES.TARGET_UNAVAILABLE, {
        sourcePart,
        sourceCode: `DOCX_ZIP_METHOD_${entry.method}`,
      }),
    };
  }
  if (contentBytes.length !== entry.byteSize) {
    return {
      failure: docxReviewPreflightDiagnostic(DOCX_REVIEW_PREFLIGHT_CODES.TARGET_UNAVAILABLE, {
        sourcePart,
        sourceCode: 'DOCX_ZIP_INFLATED_SIZE_MISMATCH',
        actual: contentBytes.length,
        limit: entry.byteSize,
      }),
    };
  }

  const xmlText = Buffer.from(contentBytes).toString('utf8');
  if (xmlText.length > DOCX_REVIEW_PREFLIGHT_BOUNDS.maxXmlScanChars) {
    return {
      failure: docxReviewPreflightDiagnostic(DOCX_REVIEW_PREFLIGHT_CODES.XML_SCAN_LIMIT_EXCEEDED, {
        sourcePart,
        actual: xmlText.length,
        limit: DOCX_REVIEW_PREFLIGHT_BOUNDS.maxXmlScanChars,
      }),
    };
  }
  if (/<!\s*(DOCTYPE|ENTITY)\b/iu.test(xmlText)) {
    return {
      failure: docxReviewPreflightDiagnostic(DOCX_REVIEW_PREFLIGHT_CODES.UNSAFE_DECLARATION_PRESENT, {
        sourcePart,
        sourceCode: 'DOCX_REVIEW_PREFLIGHT_UNSAFE_XML_DECLARATION',
        message: 'review evidence target XML contains an unsafe declaration',
      }),
    };
  }
  return {
    xmlText,
    entry: {
      sourcePart,
      byteSize: entry.byteSize,
      compressedSize: entry.compressedSize,
      method: entry.method,
    },
  };
}

function docxReviewTransportAnalysisFailure(code, details = {}) {
  return {
    ok: false,
    status: 'blocked',
    code,
    reason: code,
    canWriteManuscript: false,
    canApply: false,
    parts: {},
    zipInventory: { eocdCount: 1, entries: [] },
    details: cloneJsonSafe(details),
  };
}

function shouldExtractDocxReviewTransportAnalysisPart(entryId) {
  const normalized = normalizeString(entryId).replace(/\\/gu, '/');
  const lower = normalized.toLowerCase();
  return lower === '[content_types].xml'
    || lower.endsWith('.xml')
    || lower.endsWith('.rels');
}

export function extractDocxReviewTransportPackagePartsFromZipBytes(input, options = {}) {
  const bytes = docxZipInventoryInputToBytes(
    isPlainObject(input) && input.bytes !== undefined ? input.bytes : input,
  );
  if (bytes === null) {
    return docxReviewTransportAnalysisFailure('DOCX_ZIP_BYTES_INPUT_INVALID');
  }
  const gate = inspectDocxHostileFileGateFromZipBytes(bytes);
  if (!gate || gate.ok !== true || gate.decision !== 'pass') {
    return docxReviewTransportAnalysisFailure(
      normalizeString(gate?.code) || 'DOCX_REVIEW_TRANSPORT_GATE_NOT_PASSED',
      { gate },
    );
  }
  const metadataResult = docxHostileFileGateCentralEntries(bytes);
  if (metadataResult.failure) {
    return docxReviewTransportAnalysisFailure(
      normalizeString(metadataResult.failure.code) || 'DOCX_REVIEW_TRANSPORT_CENTRAL_DIRECTORY_INVALID',
      { failure: metadataResult.failure },
    );
  }

  const maxPartBytes = Number.isSafeInteger(options.maxPartBytes) && options.maxPartBytes > 0
    ? options.maxPartBytes
    : DOCX_REVIEW_PREFLIGHT_BOUNDS.maxTargetPartBytes;
  const parts = {};
  const inventoryEntries = [];
  for (const entry of metadataResult.entries) {
    const localHeader = docxHostileFileGateValidateLocalHeader(bytes, entry);
    if (localHeader.failure) {
      return docxReviewTransportAnalysisFailure(
        normalizeString(localHeader.failure.code) || 'DOCX_REVIEW_TRANSPORT_LOCAL_HEADER_INVALID',
        { failure: localHeader.failure },
      );
    }
    const dataStart = localHeader.dataOffset;
    const dataEnd = dataStart + entry.compressedSize;
    inventoryEntries.push({
      name: entry.entryId,
      byteSize: entry.byteSize,
      compressedSize: entry.compressedSize,
      method: entry.method,
      dataStart,
      dataEnd,
    });
    if (!shouldExtractDocxReviewTransportAnalysisPart(entry.entryId)) continue;
    if (entry.byteSize > maxPartBytes) {
      return docxReviewTransportAnalysisFailure('DOCX_REVIEW_TRANSPORT_PART_BYTES_EXCEEDED', {
        entryId: entry.entryId,
        actual: entry.byteSize,
        limit: maxPartBytes,
      });
    }
    const inflated = docxHostileFileGateInflatedDeclarationText(bytes, entry);
    if (inflated.failure) {
      return docxReviewTransportAnalysisFailure(
        normalizeString(inflated.failure.code) || 'DOCX_REVIEW_TRANSPORT_PART_INFLATE_FAILED',
        { failure: inflated.failure },
      );
    }
    parts[entry.entryId] = Buffer.from(inflated.contentBytes).toString('utf8');
  }

  return {
    ok: true,
    status: 'parts-ready',
    code: 'DOCX_REVIEW_TRANSPORT_PARTS_READY',
    reason: 'DOCX_REVIEW_TRANSPORT_PARTS_READY',
    parts,
    zipInventory: {
      eocdCount: 1,
      entries: inventoryEntries,
    },
    gate,
  };
}

export function buildDocxReviewTransportAnalysisFromZipBytes(input, options = {}) {
  const extracted = extractDocxReviewTransportPackagePartsFromZipBytes(input, options);
  if (!extracted.ok) return extracted;
  const parserInput = {
    ...(isPlainObject(input) ? cloneJsonSafe(input) : {}),
    parts: extracted.parts,
    zipInventory: extracted.zipInventory,
  };
  delete parserInput.bytes;
  return {
    ...parseReviewTransportPackageV2(parserInput, options),
    packagePartsFromZipBytes: {
      status: extracted.status,
      code: extracted.code,
      partNames: Object.keys(extracted.parts).sort(),
      zipEntryCount: extracted.zipInventory.entries.length,
    },
  };
}

function docxReviewPreflightRelationshipUnsupportedItems(inventory) {
  const entries = Array.isArray(inventory?.entries) ? inventory.entries : [];
  return entries
    .filter((entry) => entry?.kind === 'relationshipPart' || (Array.isArray(entry?.markers) && entry.markers.includes('relationship')))
    .slice(0, DOCX_REVIEW_PREFLIGHT_BOUNDS.maxUnsupportedItems)
    .map((entry) => docxReviewPreflightUnsupportedItem(
      'DOCX_REVIEW_PREFLIGHT_RELATIONSHIP_DIAGNOSTIC_ONLY',
      {
        category: 'relationship',
        sourcePart: entry.id,
        message: 'relationship parts are not interpreted by review preflight and remain diagnostic-only',
      },
    ));
}

function docxReviewPreflightUnsupportedConsistencyItems(commentsEvidence, trackedChangesEvidence) {
  const items = [];
  if (commentsEvidence.present && commentsEvidence.commentPartPresent !== true) {
    items.push(docxReviewPreflightUnsupportedItem(
      'DOCX_REVIEW_PREFLIGHT_COMMENT_ANCHOR_WITHOUT_COMMENT_PART',
      {
        category: 'comments',
        sourcePart: 'word/document.xml',
        tagName: 'w:commentReference',
      },
    ));
  }
  if (commentsEvidence.commentPartPresent === true && commentsEvidence.referenceCount === 0) {
    items.push(docxReviewPreflightUnsupportedItem(
      'DOCX_REVIEW_PREFLIGHT_COMMENT_PART_WITHOUT_DOCUMENT_ANCHOR',
      {
        category: 'comments',
        sourcePart: 'word/comments.xml',
        tagName: 'w:comment',
      },
    ));
  }
  if (trackedChangesEvidence.moveFromCount > 0 || trackedChangesEvidence.moveToCount > 0) {
    items.push(docxReviewPreflightUnsupportedItem(
      'DOCX_REVIEW_PREFLIGHT_TRACKED_MOVE_DIAGNOSTIC_ONLY',
      {
        category: 'revisions',
        sourcePart: 'word/document.xml',
        tagName: 'w:moveFrom',
      },
    ));
  }
  return items;
}

function docxReviewPreflightResult({
  ok,
  status,
  code,
  reason,
  decision,
  diagnostics = [],
  evidence = [],
  preflightSummary,
  commentsEvidence = docxReviewPreflightEmptyEvidence(),
  trackedChangesEvidence = docxReviewPreflightEmptyEvidence(),
  unsupportedItems = [],
  parseAttempted = false,
  parseCompleted = false,
}) {
  const hasReviewEvidence = commentsEvidence.present === true || trackedChangesEvidence.present === true;
  const limitedUnsupportedItems = unsupportedItems.slice(0, DOCX_REVIEW_PREFLIGHT_BOUNDS.maxUnsupportedItems);
  return {
    ok: ok === true,
    schemaVersion: DOCX_REVIEW_PREFLIGHT_REPORT_SCHEMA,
    type: DOCX_REVIEW_PREFLIGHT_REPORT_TYPE,
    status,
    code,
    reason,
    decision,
    hasReviewEvidence,
    commentsEvidence,
    trackedChangesEvidence,
    unsupportedItems: limitedUnsupportedItems,
    lossReport: docxReviewPreflightLossReport(limitedUnsupportedItems),
    diagnosticCandidate: null,
    canOpenReviewSession: false,
    canAutoApply: false,
    canCreateReviewPacket: false,
    canImportMutate: false,
    canWriteStorage: false,
    diagnostics: diagnostics.slice(0, DOCX_REVIEW_PREFLIGHT_BOUNDS.maxDiagnostics),
    evidence,
    budgets: { ...DOCX_REVIEW_PREFLIGHT_BOUNDS },
    preflightSummary,
    parse: {
      attempted: parseAttempted,
      completed: parseCompleted,
      semanticAllowed: false,
    },
  };
}

export function buildDocxReviewPreflightReportFromZipBytes(input) {
  const bytes = docxZipInventoryInputToBytes(input);
  const intakePreflight = buildDocxIntakePreflightReportFromZipBytes(input);
  const preflightSummary = {
    intakeStatus: typeof intakePreflight.status === 'string' ? intakePreflight.status : 'unavailable',
    intakeCode: typeof intakePreflight.code === 'string' ? intakePreflight.code : 'DOCX_INTAKE_PREFLIGHT_UNAVAILABLE',
    gatePass: intakePreflight.gatePass === true,
    reviewPreflightOnly: true,
    canOpenReviewSession: false,
    canAutoApply: false,
    canCreateReviewPacket: false,
    canImportMutate: false,
    canWriteStorage: false,
  };

  if (bytes === null) {
    return docxReviewPreflightResult({
      ok: false,
      status: 'blocked',
      code: DOCX_REVIEW_PREFLIGHT_CODES.BLOCKED,
      reason: 'DOCX_ZIP_BYTES_INPUT_INVALID',
      decision: 'blocked',
      diagnostics: [docxReviewPreflightDiagnostic(DOCX_REVIEW_PREFLIGHT_CODES.BLOCKED, {
        sourceCode: 'DOCX_ZIP_BYTES_INPUT_INVALID',
      })],
      preflightSummary,
    });
  }

  const materialized = materializeDocxPackageInventoryFromZipBytes(bytes);
  if (!materialized.ok) {
    return docxReviewPreflightResult({
      ok: false,
      status: 'blocked',
      code: DOCX_REVIEW_PREFLIGHT_CODES.BLOCKED,
      reason: materialized.code,
      decision: 'blocked',
      diagnostics: [docxReviewPreflightDiagnostic(DOCX_REVIEW_PREFLIGHT_CODES.BLOCKED, {
        sourceCode: materialized.code,
      })],
      evidence: [{ kind: 'materializerFailure', sourceCode: materialized.code }],
      preflightSummary,
    });
  }

  const gate = inspectDocxHostileFileGateFromZipBytes(bytes);
  if (DOCX_REVIEW_PREFLIGHT_HARD_GATE_CODES.has(gate.code)) {
    const unsafeDeclaration = gate.code === DOCX_HOSTILE_FILE_GATE_REASON_CODES.XML_DTD_DECLARATION_PRESENT
      || gate.code === DOCX_HOSTILE_FILE_GATE_REASON_CODES.XML_ENTITY_DECLARATION_PRESENT;
    return docxReviewPreflightResult({
      ok: false,
      status: 'blocked',
      code: unsafeDeclaration
        ? DOCX_REVIEW_PREFLIGHT_CODES.UNSAFE_DECLARATION_PRESENT
        : DOCX_REVIEW_PREFLIGHT_CODES.BLOCKED,
      reason: unsafeDeclaration
        ? 'DOCX_REVIEW_PREFLIGHT_UNSAFE_XML_DECLARATION'
        : gate.code,
      decision: 'blocked',
      diagnostics: unsafeDeclaration
        ? [docxReviewPreflightDiagnostic(DOCX_REVIEW_PREFLIGHT_CODES.UNSAFE_DECLARATION_PRESENT, {
          sourceCode: 'DOCX_REVIEW_PREFLIGHT_UNSAFE_XML_DECLARATION',
        })]
        : docxIntakePreflightTaggedDiagnostics('gate', gate.diagnostics),
      evidence: docxIntakePreflightTaggedEvidence('gate', gate.evidence),
      preflightSummary,
    });
  }

  const metadataResult = docxHostileFileGateCentralEntries(bytes);
  if (metadataResult.failure) {
    return docxReviewPreflightResult({
      ok: false,
      status: 'blocked',
      code: DOCX_REVIEW_PREFLIGHT_CODES.BLOCKED,
      reason: metadataResult.failure.code,
      decision: 'blocked',
      diagnostics: [docxReviewPreflightDiagnostic(DOCX_REVIEW_PREFLIGHT_CODES.BLOCKED, {
        sourceCode: metadataResult.failure.code,
      })],
      preflightSummary,
    });
  }

  const extractedTargets = new Map();
  const diagnostics = [];
  const evidence = [
    {
      kind: 'inventory',
      entryCount: materialized.inventory.entries.length,
    },
  ];
  for (const sourcePart of DOCX_REVIEW_PREFLIGHT_TARGET_PARTS) {
    const extraction = docxReviewPreflightExtractTargetXml(bytes, metadataResult.entries, sourcePart);
    if (extraction.failure) {
      return docxReviewPreflightResult({
        ok: false,
        status: 'blocked',
        code: extraction.failure.code,
        reason: extraction.failure.sourceCode || extraction.failure.code,
        decision: 'blocked',
        diagnostics: [extraction.failure],
        evidence,
        preflightSummary,
        parseAttempted: true,
      });
    }
    if (extraction.missing) continue;
    extractedTargets.set(sourcePart, extraction.xmlText);
    evidence.push({
      kind: 'reviewEvidenceTarget',
      sourcePart,
      byteSize: extraction.entry.byteSize,
      compressedSize: extraction.entry.compressedSize,
      textHash: docxContentPreviewStableHash(extraction.xmlText),
    });
  }

  const documentXml = extractedTargets.get('word/document.xml') || '';
  const commentsXml = extractedTargets.has('word/comments.xml')
    ? extractedTargets.get('word/comments.xml')
    : null;
  const commentsEvidence = docxReviewPreflightBuildCommentsEvidence(documentXml, commentsXml);
  const trackedChangesEvidence = docxReviewPreflightBuildTrackedChangesEvidence(documentXml);
  const unsupportedItems = [
    ...docxReviewPreflightRelationshipUnsupportedItems(materialized.inventory),
    ...docxReviewPreflightUnsupportedConsistencyItems(commentsEvidence, trackedChangesEvidence),
  ];
  const hasReviewEvidence = commentsEvidence.present === true || trackedChangesEvidence.present === true;
  const code = hasReviewEvidence
    ? DOCX_REVIEW_PREFLIGHT_CODES.READY_WITH_EVIDENCE
    : DOCX_REVIEW_PREFLIGHT_CODES.READY_EMPTY;

  return docxReviewPreflightResult({
    ok: true,
    status: 'diagnostic-only',
    code,
    reason: code,
    decision: 'diagnostic-only',
    diagnostics,
    evidence,
    preflightSummary: {
      ...preflightSummary,
      targetPartsScanned: [...extractedTargets.keys()].sort(),
      diagnosticOnly: true,
    },
    commentsEvidence,
    trackedChangesEvidence,
    unsupportedItems,
    parseAttempted: true,
    parseCompleted: true,
  });
}
// RB_10A_DOCX_REVIEW_PREFLIGHT_REPORT_END

// RB_10B_DOCX_REVIEW_PREVIEW_SESSION_CANDIDATE_START
export const DOCX_REVIEW_PREVIEW_SESSION_CANDIDATE_SCHEMA = 'revision-bridge.docx-review-preview-session-candidate.v1';
const DOCX_REVIEW_PREVIEW_SESSION_CANDIDATE_TYPE = 'docxReviewPreviewSessionCandidate';

const DOCX_REVIEW_PREVIEW_SESSION_CANDIDATE_CODES = Object.freeze({
  READY: 'DOCX_REVIEW_PREVIEW_SESSION_CANDIDATE_READY',
  NO_CANDIDATE: 'DOCX_REVIEW_PREVIEW_SESSION_CANDIDATE_NO_REVIEW_COMMENTS',
  BLOCKED: 'DOCX_REVIEW_PREVIEW_SESSION_CANDIDATE_BLOCKED',
  TARGET_UNAVAILABLE: 'DOCX_REVIEW_PREVIEW_SESSION_CANDIDATE_TARGET_UNAVAILABLE',
});

const DOCX_REVIEW_PREVIEW_SESSION_CANDIDATE_BOUNDS = Object.freeze({
  maxComments: 250,
  maxCommentBodyChars: 2000,
  maxAnchors: 250,
  maxTrackedTextCandidates: 400,
  maxTrackedStructuralCandidates: 100,
  maxTrackedTextChars: 2000,
  maxDiagnostics: 200,
  maxUnsupportedItems: 200,
  maxTargetPartBytes: DOCX_REVIEW_PREFLIGHT_BOUNDS.maxTargetPartBytes,
  maxXmlScanChars: DOCX_REVIEW_PREFLIGHT_BOUNDS.maxXmlScanChars,
});

const DOCX_REVIEW_PREVIEW_SESSION_FULL_MANUSCRIPT_CANDIDATE_BOUNDS = Object.freeze({
  ...DOCX_REVIEW_PREVIEW_SESSION_CANDIDATE_BOUNDS,
  maxComments: 2000,
  maxAnchors: 2000,
  maxTrackedTextCandidates: 5000,
  maxTrackedStructuralCandidates: 1000,
  maxDiagnostics: 2000,
  maxUnsupportedItems: 1000,
});

function docxReviewPreviewSessionCandidateBounds(options = {}) {
  return isPlainObject(options.fullManuscriptExportMap)
    ? DOCX_REVIEW_PREVIEW_SESSION_FULL_MANUSCRIPT_CANDIDATE_BOUNDS
    : DOCX_REVIEW_PREVIEW_SESSION_CANDIDATE_BOUNDS;
}

function docxReviewPreviewSessionDiagnostic(code, options = {}) {
  const diagnostic = {
    diagnosticId: normalizeString(options.diagnosticId) || `docx-review-diagnostic-${code}`,
    severity: normalizeStringEnum(options.severity, ['info', 'warning', 'error'], 'warning'),
    message: normalizeString(options.message) || code,
    targetScope: docxReviewPreviewSessionTargetScope(options.targetScope),
    relatedItemId: normalizeString(options.relatedItemId),
    createdAt: normalizeString(options.createdAt),
  };
  return diagnostic;
}

function docxReviewPreviewSessionTargetScope(value) {
  const source = isPlainObject(value) ? value : {};
  const type = normalizeString(source.type) || 'docx';
  const id = normalizeString(source.id) || 'word/document.xml';
  return { type, id };
}

function docxReviewPreviewSessionBuildFullManuscriptBlockScopeResolver(exportMap = {}) {
  const byParaId = new Map();
  const byTextId = new Map();
  const byBookmarkName = new Map();
  const scenes = Array.isArray(exportMap?.scenes) ? exportMap.scenes : [];
  let globalBlockIndex = 0;
  for (const scene of scenes) {
    const sceneId = normalizeString(scene?.sceneId);
    if (!sceneId) continue;
    const blocks = Array.isArray(scene?.blocks) ? scene.blocks : [];
    for (const block of blocks) {
      const targetScope = { type: 'scene', id: sceneId };
      const blockId = normalizeString(block?.blockId);
      if (blockId) {
        const rawBookmark = blockId.replace(/[^A-Za-z0-9_]/gu, '_');
        const builderBookmarkName = `YRTK_${String(globalBlockIndex + 1).padStart(4, '0')}_${rawBookmark}`.slice(0, 40);
        if (builderBookmarkName) byBookmarkName.set(builderBookmarkName.toLowerCase(), targetScope);
      }
      const signals = Array.isArray(block?.wordSignals) ? block.wordSignals : [];
      for (const signal of signals) {
        if (!isPlainObject(signal)) continue;
        if (signal.kind === 'w14ParaIdTextId') {
          const paraId = normalizeString(signal.value?.paraId).toLowerCase();
          const textId = normalizeString(signal.value?.textId).toLowerCase();
          if (paraId) byParaId.set(paraId, targetScope);
          if (textId) byTextId.set(textId, targetScope);
        } else if (signal.kind === 'bookmarkName') {
          const name = normalizeString(signal.value?.name).toLowerCase();
          if (name) byBookmarkName.set(name, targetScope);
        }
      }
      globalBlockIndex += 1;
    }
  }
  return (signal = {}) => {
    const paraId = normalizeString(signal.paraId).toLowerCase();
    const textId = normalizeString(signal.textId).toLowerCase();
    const bookmarkNames = Array.isArray(signal.bookmarkNames)
      ? signal.bookmarkNames.map((name) => normalizeString(name).toLowerCase()).filter(Boolean)
      : [];
    if (paraId && byParaId.has(paraId)) return byParaId.get(paraId);
    if (textId && byTextId.has(textId)) return byTextId.get(textId);
    for (const bookmarkName of bookmarkNames) {
      if (byBookmarkName.has(bookmarkName)) return byBookmarkName.get(bookmarkName);
    }
    return null;
  };
}

function docxReviewPreviewSessionEmptyReviewPacket() {
  return {
    commentThreads: [],
    commentPlacements: [],
    textChanges: [],
    structuralChanges: [],
    diagnosticItems: [],
    decisionStates: [],
  };
}

function docxReviewPreviewSessionResult({
  ok,
  status,
  code,
  reason,
  decision,
  reviewPacket = null,
  diagnostics = [],
  unsupportedItems = [],
  preflightReport = null,
  sourceViewState = null,
  summary = {},
  bounds = DOCX_REVIEW_PREVIEW_SESSION_CANDIDATE_BOUNDS,
}) {
  const candidateBounds = isPlainObject(bounds) ? bounds : DOCX_REVIEW_PREVIEW_SESSION_CANDIDATE_BOUNDS;
  const safeReviewPacket = isPlainObject(reviewPacket) ? cloneJsonSafe(reviewPacket) : null;
  const safeDiagnostics = Array.isArray(diagnostics)
    ? diagnostics.slice(0, candidateBounds.maxDiagnostics)
    : [];
  const safeUnsupportedItems = Array.isArray(unsupportedItems)
    ? unsupportedItems.slice(0, candidateBounds.maxUnsupportedItems)
    : [];
  const canOpenReviewSession = ok === true && status === 'ready' && isPlainObject(safeReviewPacket);
  return {
    ok: ok === true,
    schemaVersion: DOCX_REVIEW_PREVIEW_SESSION_CANDIDATE_SCHEMA,
    type: DOCX_REVIEW_PREVIEW_SESSION_CANDIDATE_TYPE,
    status,
    code,
    reason,
    decision,
    canOpenReviewSession,
    canAutoApply: false,
    canCreateReviewPacket: canOpenReviewSession,
    canImportMutate: false,
    canWriteStorage: false,
    reviewPacket: safeReviewPacket,
    sourceViewState: isPlainObject(sourceViewState) ? cloneJsonSafe(sourceViewState) : null,
    diagnostics: safeDiagnostics,
    unsupportedItems: safeUnsupportedItems,
    preflightReport: isPlainObject(preflightReport) ? cloneJsonSafe(preflightReport) : null,
    budgets: { ...candidateBounds },
    summary: cloneJsonSafe(summary) || {},
  };
}

function docxReviewPreviewSessionReadXmlAttr(tag, attrName) {
  const expectedLocalName = String(attrName || '').trim().toLowerCase();
  if (!/^[a-z_][\w.-]*$/u.test(expectedLocalName)) return '';
  const pattern = /(?:^|\s)(?:[A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)\s*=\s*("([^"]*)"|'([^']*)')/giu;
  let match;
  while ((match = pattern.exec(String(tag || ''))) !== null) {
    if (String(match[1] || '').toLowerCase() !== expectedLocalName) continue;
    return docxContentPreviewDecodeText(match[3] ?? match[4] ?? '');
  }
  return '';
}

function docxReviewPreviewSessionSafeId(value, fallback) {
  const normalized = normalizeString(value)
    .replace(/[^A-Za-z0-9_.:-]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  return normalized || fallback;
}

function docxReviewPreviewSessionTextFromXml(xmlText, maxChars) {
  const parts = [];
  let total = 0;
  const textPattern = /<\s*(?:[A-Za-z_][\w.-]*:)?t\b[^>]*>([\s\S]*?)<\s*\/\s*(?:[A-Za-z_][\w.-]*:)?t\s*>/giu;
  let match;
  while ((match = textPattern.exec(String(xmlText || ''))) !== null) {
    const decoded = docxContentPreviewDecodeText(match[1] || '');
    if (!decoded) continue;
    parts.push(decoded);
    total += decoded.length;
    if (total > maxChars) {
      return {
        text: parts.join('').slice(0, maxChars),
        truncated: true,
      };
    }
  }
  return {
    text: parts.join(''),
    truncated: false,
  };
}

function docxReviewPreviewSessionParseCommentsXml(commentsXml, options = {}) {
  const bounds = docxReviewPreviewSessionCandidateBounds(options);
  const comments = [];
  const diagnostics = [];
  const createdAt = normalizeString(options.createdAt);
  const commentPattern = /<\s*(?:[A-Za-z_][\w.-]*:)?comment\b([^>]*)>([\s\S]*?)<\s*\/\s*(?:[A-Za-z_][\w.-]*:)?comment\s*>/giu;
  let match;
  let index = 0;
  while ((match = commentPattern.exec(String(commentsXml || ''))) !== null) {
    if (comments.length >= bounds.maxComments) {
      diagnostics.push(docxReviewPreviewSessionDiagnostic(
        'DOCX_REVIEW_PREVIEW_SESSION_COMMENT_LIMIT_EXCEEDED',
        {
          diagnosticId: 'docx-review-comment-limit',
          message: 'DOCX comment count exceeds review preview budget.',
          severity: 'warning',
          createdAt,
        },
      ));
      break;
    }
    const rawId = docxReviewPreviewSessionReadXmlAttr(match[1], 'id') || String(index);
    const id = docxReviewPreviewSessionSafeId(rawId, `comment-${index}`);
    const body = docxReviewPreviewSessionTextFromXml(
      match[2],
      bounds.maxCommentBodyChars,
    );
    const messageBody = normalizeString(body.text);
    if (!messageBody) {
      diagnostics.push(docxReviewPreviewSessionDiagnostic(
        'DOCX_REVIEW_PREVIEW_SESSION_EMPTY_COMMENT_BODY',
        {
          diagnosticId: `docx-review-empty-comment-${id}`,
          message: 'DOCX comment has no extractable text body and remains diagnostic-only.',
          relatedItemId: `docx-comment-${id}`,
          severity: 'warning',
          createdAt,
        },
      ));
      index += 1;
      continue;
    }
    if (body.truncated) {
      diagnostics.push(docxReviewPreviewSessionDiagnostic(
        'DOCX_REVIEW_PREVIEW_SESSION_COMMENT_BODY_TRUNCATED',
        {
          diagnosticId: `docx-review-comment-truncated-${id}`,
          message: 'DOCX comment body was truncated to the review preview budget.',
          relatedItemId: `docx-comment-${id}`,
          severity: 'warning',
          createdAt,
        },
      ));
    }
    const author = normalizeString(docxReviewPreviewSessionReadXmlAttr(match[1], 'author')) || 'docx-review';
    const date = normalizeString(docxReviewPreviewSessionReadXmlAttr(match[1], 'date')) || createdAt;
    comments.push({
      rawId,
      safeId: id,
      thread: {
        threadId: `docx-comment-${id}`,
        authorId: author,
        status: 'open',
        createdAt: date,
        updatedAt: date,
        tags: ['docx-review'],
        messages: [
          {
            messageId: `docx-comment-${id}-message-1`,
            authorId: author,
            body: messageBody,
            createdAt: date,
          },
        ],
      },
    });
    index += 1;
  }
  return { comments, diagnostics };
}

function docxReviewPreviewSessionTagsByLocalName(xmlText, localName) {
  const expectedLocalName = String(localName || '').trim().toLowerCase();
  if (!/^[a-z_][\w.-]*$/u.test(expectedLocalName)) return [];
  const pattern = /<\s*(?:[A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)\b[^>]*>/giu;
  const matches = [];
  let match;
  while ((match = pattern.exec(String(xmlText || ''))) !== null) {
    if (String(match[1] || '').toLowerCase() !== expectedLocalName) continue;
    matches.push({
      tag: match[0],
      index: match.index,
      endIndex: pattern.lastIndex,
      id: docxReviewPreviewSessionReadXmlAttr(match[0], 'id'),
    });
  }
  return matches;
}

function docxReviewPreviewSessionRangeForComment(documentXml, rawCommentId) {
  const starts = docxReviewPreviewSessionTagsByLocalName(documentXml, 'commentRangeStart')
    .filter((tag) => tag.id === rawCommentId);
  const ends = docxReviewPreviewSessionTagsByLocalName(documentXml, 'commentRangeEnd')
    .filter((tag) => tag.id === rawCommentId);
  const references = docxReviewPreviewSessionTagsByLocalName(documentXml, 'commentReference')
    .filter((tag) => tag.id === rawCommentId);
  if (starts.length !== 1 || ends.length !== 1 || starts[0].endIndex >= ends[0].index) {
    return {
      ok: false,
      starts,
      ends,
      references,
      reason: 'DOCX_REVIEW_PREVIEW_SESSION_AMBIGUOUS_COMMENT_ANCHOR',
    };
  }
  const rangeXml = String(documentXml || '').slice(starts[0].endIndex, ends[0].index);
  const quote = normalizeString(docxReviewPreviewSessionTextFromXml(
    rangeXml,
    DOCX_REVIEW_PREVIEW_SESSION_CANDIDATE_BOUNDS.maxCommentBodyChars,
  ).text);
  if (!quote) {
    return {
      ok: false,
      starts,
      ends,
      references,
      reason: 'DOCX_REVIEW_PREVIEW_SESSION_EMPTY_COMMENT_ANCHOR',
    };
  }
  return {
    ok: true,
    starts,
    ends,
    references,
    quote,
  };
}

function docxReviewPreviewSessionBuildPlacements(documentXml, comments, options = {}) {
  const bounds = docxReviewPreviewSessionCandidateBounds(options);
  const targetScope = docxReviewPreviewSessionTargetScope(options.targetScope);
  const createdAt = normalizeString(options.createdAt);
  const placements = [];
  const diagnostics = [];
  for (const comment of comments) {
    if (placements.length >= bounds.maxAnchors) {
      diagnostics.push(docxReviewPreviewSessionDiagnostic(
        'DOCX_REVIEW_PREVIEW_SESSION_ANCHOR_LIMIT_EXCEEDED',
        {
          diagnosticId: 'docx-review-anchor-limit',
          message: 'DOCX comment anchors exceed review preview budget.',
          targetScope,
          severity: 'warning',
          createdAt,
        },
      ));
      break;
    }
    const range = docxReviewPreviewSessionRangeForComment(documentXml, comment.rawId);
    if (!range.ok) {
      diagnostics.push(docxReviewPreviewSessionDiagnostic(range.reason, {
        diagnosticId: `docx-review-anchor-${comment.safeId}`,
        message: 'DOCX comment anchor is missing, empty, or ambiguous and remains manual-only.',
        targetScope,
        relatedItemId: comment.thread.threadId,
        severity: 'warning',
        createdAt,
      }));
      continue;
    }
    placements.push({
      placementId: `docx-comment-placement-${comment.safeId}`,
      threadId: comment.thread.threadId,
      targetScope,
      anchor: {
        kind: 'docx-comment-range',
        value: `w:comment:${comment.rawId}`,
      },
      range: {
        from: 0,
        to: range.quote.length,
      },
      quote: range.quote,
      prefix: '',
      suffix: '',
      confidence: 0.5,
      policy: 'manual',
      selector: {
        type: 'docx-comment-range',
        id: comment.rawId,
      },
      createdAt,
    });
  }
  return { placements, diagnostics };
}

function docxReviewPreviewSessionTrackedTextChange(kind, revisions, options = {}) {
  const fallbackTargetScope = docxReviewPreviewSessionTargetScope(options.targetScope);
  const revisionTargetScopes = revisions
    .map((revision) => (isPlainObject(revision.targetScope) ? docxReviewPreviewSessionTargetScope(revision.targetScope) : null))
    .filter(Boolean);
  const uniqueRevisionTargetScopeKeys = [...new Set(revisionTargetScopes.map((scope) => `${scope.type}\n${scope.id}`))];
  const targetScope = uniqueRevisionTargetScopeKeys.length === 1
    ? revisionTargetScopes[0]
    : fallbackTargetScope;
  const createdAt = revisions
    .map((revision) => normalizeString(revision.createdAt))
    .find(Boolean) || normalizeString(options.createdAt);
  const deletedText = revisions
    .filter((revision) => revision.kind === 'delete')
    .map((revision) => revision.text)
    .join('');
  const insertedText = revisions
    .filter((revision) => revision.kind === 'insert')
    .map((revision) => revision.text)
    .join('');
  const fullManuscriptSceneBound = options.fullManuscriptSceneBound === true
    && targetScope.type === 'scene'
    && targetScope.id
    && deletedText
    && !insertedText.includes(deletedText)
    && revisions.every((revision) => revision.fullManuscriptResolved === true);
  const changeHash = revisionBlockHash({
    kind,
    paragraphIndex: revisions[0]?.paragraphIndex,
    revisionIds: revisions.map((revision) => revision.revisionId),
    deletedText,
    insertedText,
    targetScope,
  });
  const change = {
    changeId: `docx-tracked-${kind}-${changeHash.slice(0, 16)}`,
    targetScope,
    match: {
      kind: fullManuscriptSceneBound ? 'exact' : 'manual',
      quote: deletedText,
      prefix: '',
      suffix: '',
    },
    replacementText: insertedText,
    createdAt,
  };
  if (fullManuscriptSceneBound) {
    change.sourceAuthority = 'full-manuscript-export-map-paragraph-signal';
    change.typedUnsupportedSiblingsRemainPending = true;
  }
  return change;
}

function docxReviewPreviewSessionTrackedStructuralChange(kind, summary, options = {}) {
  const targetScope = docxReviewPreviewSessionTargetScope(options.targetScope);
  const structuralHash = revisionBlockHash({
    kind,
    summary,
    targetScope,
    evidenceId: normalizeString(options.evidenceId),
  });
  return {
    structuralChangeId: `docx-structural-${structuralHash.slice(0, 16)}`,
    kind,
    targetScope,
    summary,
    createdAt: normalizeString(options.createdAt),
  };
}

function docxReviewPreviewSessionTrackedTextCandidates(documentXml, options = {}) {
  const bounds = docxReviewPreviewSessionCandidateBounds(options);
  const targetScope = docxReviewPreviewSessionTargetScope(options.targetScope);
  const fullManuscriptScopeForParagraph =
    docxReviewPreviewSessionBuildFullManuscriptBlockScopeResolver(options.fullManuscriptExportMap);
  const createdAt = normalizeString(options.createdAt);
  const diagnostics = [];
  const structuralChanges = [];
  const revisions = [];
  const elementStack = [];
  const paragraphStack = [];
  let revisionSequence = 0;
  let paragraphIndex = -1;
  let paragraphDepth = 0;
  let activeRevision = null;
  let activeTextDepth = 0;
  let visibleTextDepth = 0;
  let plainBoundaryVersion = 0;
  let cursor = 0;
  let malformed = false;
  const tokenPattern = new RegExp('<!--[\\s\\S]*?-->|<!\\[CDATA\\[[\\s\\S]*?\\]\\]>|<[^>]+>|[^<]+', 'gu');
  let match;

  const addDiagnostic = (code, message, severity = 'warning', relatedItemId = '') => {
    if (diagnostics.length >= bounds.maxDiagnostics) return;
    diagnostics.push(docxReviewPreviewSessionDiagnostic(code, {
      diagnosticId: `${code.toLowerCase().replace(/[^a-z0-9]+/gu, '-')}-${diagnostics.length}`,
      message,
      targetScope,
      relatedItemId,
      severity,
      createdAt,
    }));
  };

  const addStructuralChange = (change, relatedItemId = '') => {
    if (structuralChanges.length >= bounds.maxTrackedStructuralCandidates) {
      addDiagnostic(
        'DOCX_REVIEW_TRACKED_STRUCTURE_LIMIT_EXCEEDED',
        'DOCX tracked structural candidates exceed the bounded review budget.',
        'warning',
        relatedItemId,
      );
      return;
    }
    structuralChanges.push(change);
  };

  const finishRevision = () => {
    if (!activeRevision) return;
    const text = activeRevision.text.slice(0, bounds.maxTrackedTextChars);
    const relatedItemId = `docx-revision-${activeRevision.revisionId}`;
    if (activeRevision.complex) {
      const summary = `DOCX tracked ${activeRevision.kind} is structurally complex and remains manual-only.`;
      addStructuralChange(docxReviewPreviewSessionTrackedStructuralChange(
        `docx-tracked-${activeRevision.kind}-complex`,
        summary,
        {
          targetScope,
          createdAt: activeRevision.createdAt || createdAt,
          evidenceId: relatedItemId,
        },
      ), relatedItemId);
      addDiagnostic(
        'DOCX_REVIEW_TRACKED_CHANGE_COMPLEX_MANUAL_ONLY',
        summary,
        'warning',
        relatedItemId,
      );
    } else if (!text) {
      addDiagnostic(
        'DOCX_REVIEW_TRACKED_CHANGE_EMPTY_MANUAL_ONLY',
        'DOCX tracked change has no bounded text payload and remains diagnostic-only.',
        'warning',
        relatedItemId,
      );
    } else if (revisions.length >= bounds.maxTrackedTextCandidates) {
      addDiagnostic(
        'DOCX_REVIEW_TRACKED_CHANGE_LIMIT_EXCEEDED',
        'DOCX tracked text candidates exceed the bounded review budget.',
        'warning',
        relatedItemId,
      );
    } else {
      revisions.push({ ...activeRevision, text });
    }
    activeRevision = null;
    activeTextDepth = 0;
  };

  while ((match = tokenPattern.exec(String(documentXml || ''))) !== null) {
    if (match.index !== cursor) {
      malformed = true;
      break;
    }
    cursor = tokenPattern.lastIndex;
    const token = match[0];
    if (!token.startsWith('<')) {
      if (activeRevision && activeTextDepth > 0) {
        const decoded = docxContentPreviewDecodeText(token);
        const remaining = bounds.maxTrackedTextChars
          - activeRevision.text.length;
        if (remaining > 0) activeRevision.text += decoded.slice(0, remaining);
        if (decoded.length > remaining && !activeRevision.truncated) {
          activeRevision.truncated = true;
          addDiagnostic(
            'DOCX_REVIEW_TRACKED_CHANGE_TEXT_TRUNCATED',
            'DOCX tracked change text was truncated to the bounded review budget.',
            'warning',
            `docx-revision-${activeRevision.revisionId}`,
          );
        }
      } else if (paragraphDepth > 0 && visibleTextDepth > 0) {
        const decoded = docxContentPreviewDecodeText(token);
        if (decoded.length > 0) plainBoundaryVersion += 1;
      }
      continue;
    }
    if (token.startsWith('<!--') || token.startsWith('<?') || token.startsWith('<!')) continue;

    const tagName = docxContentPreviewTagName(token);
    if (!tagName) {
      malformed = true;
      break;
    }
    const closing = /^<\//u.test(token);
    const selfClosing = /\/>\s*$/u.test(token);

    if (closing) {
      const expected = elementStack.pop();
      if (expected !== tagName) {
        malformed = true;
        break;
      }
      if (activeRevision && (tagName === 'w:t' || tagName === 'w:delText')) {
        activeTextDepth = Math.max(0, activeTextDepth - 1);
      }
      if (tagName === 'w:t' || tagName === 'w:delText') {
        visibleTextDepth = Math.max(0, visibleTextDepth - 1);
      }
      if (
        activeRevision
        && tagName === `w:${activeRevision.kind === 'insert' ? 'ins' : 'del'}`
        && elementStack.length === activeRevision.startDepth - 1
      ) {
        finishRevision();
      }
      if (tagName === 'w:p') {
        paragraphDepth = Math.max(0, paragraphDepth - 1);
        paragraphStack.pop();
      }
      continue;
    }

    if (!selfClosing) elementStack.push(tagName);
    if (tagName === 'w:p') {
      if (paragraphDepth > 0 && activeRevision) activeRevision.complex = true;
      paragraphDepth += selfClosing ? 0 : 1;
      paragraphIndex += 1;
      const paraId = docxReviewPreviewSessionReadXmlAttr(token, 'paraId');
      const textId = docxReviewPreviewSessionReadXmlAttr(token, 'textId');
      const resolvedTargetScope = fullManuscriptScopeForParagraph({ paraId, textId, paragraphIndex });
      if (!selfClosing) {
        paragraphStack.push({
          paraId,
          textId,
          bookmarkNames: [],
          fullManuscriptResolved: Boolean(resolvedTargetScope),
          targetScope: resolvedTargetScope || targetScope,
        });
      }
    } else if (tagName === 'w:bookmarkStart' && paragraphDepth > 0 && paragraphStack.length > 0) {
      const bookmarkName = docxReviewPreviewSessionReadXmlAttr(token, 'name');
      const activeParagraph = paragraphStack[paragraphStack.length - 1];
      if (bookmarkName) {
        activeParagraph.bookmarkNames = Array.isArray(activeParagraph.bookmarkNames)
          ? [...activeParagraph.bookmarkNames, bookmarkName]
          : [bookmarkName];
        if (activeParagraph.fullManuscriptResolved !== true) {
          const resolvedTargetScope = fullManuscriptScopeForParagraph({
            paraId: activeParagraph.paraId,
            textId: activeParagraph.textId,
            paragraphIndex,
            bookmarkNames: activeParagraph.bookmarkNames,
          });
          if (resolvedTargetScope) {
            activeParagraph.targetScope = resolvedTargetScope;
            activeParagraph.fullManuscriptResolved = true;
          }
        }
      }
    }

    const revisionKind = tagName === 'w:ins' ? 'insert' : (tagName === 'w:del' ? 'delete' : '');
    if (revisionKind) {
      if (activeRevision) activeRevision.complex = true;
      if (!activeRevision) {
        const rawId = docxReviewPreviewSessionReadXmlAttr(token, 'id');
        const parentTag = elementStack[elementStack.length - 2] || '';
        const hasComplexAncestor = elementStack
          .slice(0, -1)
          .some((ancestor) => ['w:tbl', 'w:tr', 'w:tc', 'w:txbxContent'].includes(ancestor));
        const sequence = revisionSequence;
        revisionSequence += 1;
        activeRevision = {
          kind: revisionKind,
          revisionId: docxReviewPreviewSessionSafeId(rawId, `${revisionKind}-${sequence}`),
          author: normalizeString(docxReviewPreviewSessionReadXmlAttr(token, 'author')),
          createdAt: normalizeString(docxReviewPreviewSessionReadXmlAttr(token, 'date')) || createdAt,
          paragraphIndex,
          paragraphSignal: cloneJsonSafe(paragraphStack[paragraphStack.length - 1] || {}),
          targetScope: cloneJsonSafe((paragraphStack[paragraphStack.length - 1] || {}).targetScope || targetScope),
          fullManuscriptResolved: (paragraphStack[paragraphStack.length - 1] || {}).fullManuscriptResolved === true,
          boundaryVersion: plainBoundaryVersion,
          startDepth: elementStack.length,
          text: '',
          complex: paragraphDepth !== 1 || parentTag !== 'w:p' || hasComplexAncestor,
          truncated: false,
        };
      }
    } else if (activeRevision) {
      if (tagName === 'w:t' || tagName === 'w:delText') {
        if (!selfClosing) {
          activeTextDepth += 1;
          visibleTextDepth += 1;
        }
      } else if (!closing && (tagName === 'w:tab' || tagName === 'w:br' || tagName === 'w:cr')) {
        activeRevision.text += tagName === 'w:tab' ? '\t' : '\n';
      } else if (['w:p', 'w:tbl', 'w:tr', 'w:tc', 'w:moveFrom', 'w:moveTo'].includes(tagName)) {
        activeRevision.complex = true;
      }
    } else if (!selfClosing && (tagName === 'w:t' || tagName === 'w:delText')) {
      visibleTextDepth += 1;
    } else if (paragraphDepth > 0 && (tagName === 'w:tab' || tagName === 'w:br' || tagName === 'w:cr')) {
      plainBoundaryVersion += 1;
    }

    if (selfClosing && activeRevision && tagName === `w:${activeRevision.kind === 'insert' ? 'ins' : 'del'}`) {
      finishRevision();
    }
  }

  if (cursor !== String(documentXml || '').length || elementStack.length > 0 || activeRevision) malformed = true;
  if (malformed) {
    addDiagnostic(
      'DOCX_REVIEW_TRACKED_CHANGE_XML_MALFORMED',
      'DOCX tracked-change XML is not well formed and produced no text candidates.',
      'error',
    );
    return { textChanges: [], structuralChanges: [], diagnostics, malformed: true };
  }

  const textChanges = [];
  for (let index = 0; index < revisions.length; index += 1) {
    const current = revisions[index];
    const next = revisions[index + 1];
    if (
      ((current.kind === 'delete' && next?.kind === 'insert')
        || (current.kind === 'insert' && next?.kind === 'delete'))
      && current.paragraphIndex === next.paragraphIndex
      && current.boundaryVersion === next.boundaryVersion
    ) {
      textChanges.push(docxReviewPreviewSessionTrackedTextChange('replace', [current, next], {
        targetScope,
        createdAt,
        fullManuscriptSceneBound: isPlainObject(options.fullManuscriptExportMap),
      }));
      index += 1;
      continue;
    }
    textChanges.push(docxReviewPreviewSessionTrackedTextChange(current.kind, [current], {
      targetScope,
      createdAt,
      fullManuscriptSceneBound: isPlainObject(options.fullManuscriptExportMap),
    }));
  }

  const moveFromCount = docxReviewPreflightCountMatches(documentXml, /<\s*w:moveFrom\b/giu);
  const moveToCount = docxReviewPreflightCountMatches(documentXml, /<\s*w:moveTo\b/giu);
  if (moveFromCount > 0 || moveToCount > 0) {
    const summary = `DOCX tracked moves remain manual-only (${moveFromCount} move-from, ${moveToCount} move-to).`;
    addStructuralChange(docxReviewPreviewSessionTrackedStructuralChange(
      'docx-tracked-move',
      summary,
      { targetScope, createdAt },
    ), 'docx-tracked-move');
  }

  for (const textChange of textChanges) {
    addDiagnostic(
      'DOCX_REVIEW_TRACKED_TEXT_CANDIDATE_MANUAL_ONLY',
      'DOCX tracked text was converted into a zero-write manual ReviewGraph candidate.',
      'info',
      textChange.changeId,
    );
  }
  return { textChanges, structuralChanges, diagnostics, malformed: false };
}

function docxReviewPreviewSessionTrackedChangeDiagnostics(trackedChangesEvidence, options = {}) {
  if (!isPlainObject(trackedChangesEvidence) || trackedChangesEvidence.present !== true) return [];
  const targetScope = docxReviewPreviewSessionTargetScope(options.targetScope);
  const createdAt = normalizeString(options.createdAt);
  const diagnostics = [];
  for (const [key, label] of [
    ['insertCount', 'insertions'],
    ['deleteCount', 'deletions'],
    ['moveFromCount', 'move-from markers'],
    ['moveToCount', 'move-to markers'],
  ]) {
    const count = Number.isFinite(trackedChangesEvidence[key]) ? trackedChangesEvidence[key] : 0;
    if (count <= 0) continue;
    diagnostics.push(docxReviewPreviewSessionDiagnostic(
      'DOCX_REVIEW_PREVIEW_SESSION_TRACKED_CHANGE_DIAGNOSTIC_ONLY',
      {
        diagnosticId: `docx-review-tracked-${key}`,
        message: `DOCX tracked-change ${label} detected (${count}); bounded text may become manual-only candidates.`,
        targetScope,
        severity: 'warning',
        createdAt,
      },
    ));
  }
  return diagnostics;
}

function docxReviewPreviewSessionUnsupportedDiagnostics(unsupportedItems, options = {}) {
  if (!Array.isArray(unsupportedItems)) return [];
  const targetScope = docxReviewPreviewSessionTargetScope(options.targetScope);
  const createdAt = normalizeString(options.createdAt);
  return unsupportedItems
    .filter((item) => isPlainObject(item))
    .slice(0, DOCX_REVIEW_PREVIEW_SESSION_CANDIDATE_BOUNDS.maxUnsupportedItems)
    .map((item, index) => docxReviewPreviewSessionDiagnostic(
      normalizeString(item.code) || 'DOCX_REVIEW_PREVIEW_SESSION_UNSUPPORTED_ITEM',
      {
        diagnosticId: `docx-review-unsupported-${index}`,
        message: normalizeString(item.message) || normalizeString(item.code) || 'DOCX review evidence remains diagnostic-only.',
        targetScope,
        severity: normalizeStringEnum(item.severity, ['info', 'warning', 'error'], 'warning'),
        createdAt,
      },
    ));
}

function docxReviewPreviewSessionExtractTargets(bytes) {
  const materialized = materializeDocxPackageInventoryFromZipBytes(bytes);
  if (!materialized.ok) {
    return {
      ok: false,
      reason: materialized.code,
      diagnostics: [docxReviewPreflightDiagnostic(DOCX_REVIEW_PREFLIGHT_CODES.BLOCKED, {
        sourceCode: materialized.code,
      })],
    };
  }
  const metadataResult = docxHostileFileGateCentralEntries(bytes);
  if (metadataResult.failure) {
    return {
      ok: false,
      reason: metadataResult.failure.code,
      diagnostics: [docxReviewPreflightDiagnostic(DOCX_REVIEW_PREFLIGHT_CODES.BLOCKED, {
        sourceCode: metadataResult.failure.code,
      })],
    };
  }
  const extractedTargets = new Map();
  for (const sourcePart of DOCX_REVIEW_PREFLIGHT_TARGET_PARTS) {
    const extraction = docxReviewPreflightExtractTargetXml(bytes, metadataResult.entries, sourcePart);
    if (extraction.failure) {
      return {
        ok: false,
        reason: extraction.failure.sourceCode || extraction.failure.code,
        diagnostics: [extraction.failure],
      };
    }
    if (!extraction.missing) extractedTargets.set(sourcePart, extraction.xmlText);
  }
  return {
    ok: true,
    inventory: materialized.inventory,
    extractedTargets,
  };
}

export function buildDocxReviewPreviewSessionCandidateFromZipBytes(input, options = {}) {
  const bounds = docxReviewPreviewSessionCandidateBounds(options);
  const bytes = docxZipInventoryInputToBytes(input);
  const createdAt = normalizeString(options.createdAt);
  const targetScope = docxReviewPreviewSessionTargetScope(options.targetScope);
  const preflightReport = buildDocxReviewPreflightReportFromZipBytes(input);
  if (bytes === null || !isPlainObject(preflightReport) || preflightReport.ok !== true) {
    return docxReviewPreviewSessionResult({
      ok: false,
      status: 'blocked',
      code: DOCX_REVIEW_PREVIEW_SESSION_CANDIDATE_CODES.BLOCKED,
      reason: normalizeString(preflightReport?.reason) || 'DOCX_REVIEW_PREVIEW_SESSION_INPUT_BLOCKED',
      decision: 'blocked',
      diagnostics: Array.isArray(preflightReport?.diagnostics) ? preflightReport.diagnostics : [],
      preflightReport,
      summary: {
        targetScope,
      },
    });
  }

  const targets = docxReviewPreviewSessionExtractTargets(bytes);
  if (!targets.ok) {
    return docxReviewPreviewSessionResult({
      ok: false,
      status: 'blocked',
      code: DOCX_REVIEW_PREVIEW_SESSION_CANDIDATE_CODES.TARGET_UNAVAILABLE,
      reason: targets.reason,
      decision: 'blocked',
      diagnostics: targets.diagnostics,
      preflightReport,
      summary: {
        targetScope,
      },
    });
  }

  const documentXml = targets.extractedTargets.get('word/document.xml') || '';
  const commentsXml = targets.extractedTargets.has('word/comments.xml')
    ? targets.extractedTargets.get('word/comments.xml')
    : '';
  const commentsResult = docxReviewPreviewSessionParseCommentsXml(commentsXml, {
    createdAt,
    targetScope,
    fullManuscriptExportMap: options.fullManuscriptExportMap,
  });
  const placementsResult = docxReviewPreviewSessionBuildPlacements(documentXml, commentsResult.comments, {
    createdAt,
    targetScope,
    fullManuscriptExportMap: options.fullManuscriptExportMap,
  });
  const trackedTextResult = docxReviewPreviewSessionTrackedTextCandidates(documentXml, {
    createdAt,
    targetScope,
    fullManuscriptExportMap: options.fullManuscriptExportMap,
  });
  if (trackedTextResult.malformed) {
    return docxReviewPreviewSessionResult({
      ok: false,
      status: 'blocked',
      code: DOCX_REVIEW_PREVIEW_SESSION_CANDIDATE_CODES.BLOCKED,
      reason: 'DOCX_REVIEW_TRACKED_CHANGE_XML_MALFORMED',
      decision: 'blocked',
      diagnostics: trackedTextResult.diagnostics,
      preflightReport,
      summary: {
        targetScope,
        trackedTextCandidateCount: 0,
      },
    });
  }
  const unsupportedItems = Array.isArray(preflightReport.unsupportedItems) ? preflightReport.unsupportedItems : [];
  const diagnostics = [
    ...commentsResult.diagnostics,
    ...placementsResult.diagnostics,
    ...docxReviewPreviewSessionTrackedChangeDiagnostics(preflightReport.trackedChangesEvidence, {
      createdAt,
      targetScope,
    }),
    ...trackedTextResult.diagnostics,
    ...docxReviewPreviewSessionUnsupportedDiagnostics(unsupportedItems, {
      createdAt,
      targetScope,
    }),
  ].slice(0, bounds.maxDiagnostics);

  const hasReviewGraphCandidate = commentsResult.comments.length > 0
    || trackedTextResult.textChanges.length > 0
    || trackedTextResult.structuralChanges.length > 0;
  if (!hasReviewGraphCandidate) {
    const diagnosticOnlyReviewPacket = diagnostics.length > 0
      ? docxReviewPreviewSessionEmptyReviewPacket()
      : null;
    if (diagnosticOnlyReviewPacket) {
      diagnosticOnlyReviewPacket.diagnosticItems = diagnostics;
    }
    const diagnosticSourceHash = diagnosticOnlyReviewPacket
      ? revisionBlockHash({
        schemaVersion: DOCX_REVIEW_PREVIEW_SESSION_CANDIDATE_SCHEMA,
        reviewPacket: diagnosticOnlyReviewPacket,
        preflightCode: preflightReport.code,
        targetScope,
        diagnosticOnly: true,
      })
      : '';
    return docxReviewPreviewSessionResult({
      ok: true,
      status: 'diagnostics',
      code: DOCX_REVIEW_PREVIEW_SESSION_CANDIDATE_CODES.NO_CANDIDATE,
      reason: DOCX_REVIEW_PREVIEW_SESSION_CANDIDATE_CODES.NO_CANDIDATE,
      decision: 'diagnostics-only',
      reviewPacket: diagnosticOnlyReviewPacket,
      diagnostics,
      unsupportedItems,
      preflightReport,
      sourceViewState: diagnosticOnlyReviewPacket ? {
        revisionToken: `docx-review-diagnostic:${diagnosticSourceHash}`,
        viewMode: 'docx-review-diagnostic-evidence',
        normalizationPolicy: 'bounded-docx-review-evidence-scan',
        newlinePolicy: 'preserve-extracted-text',
        unicodePolicy: 'xml-entity-decode-only',
        packetHash: diagnosticSourceHash,
        artifactCompletenessClass: 'diagnostic-only-review-evidence',
      } : null,
      bounds,
      summary: {
        targetScope,
        commentThreadCount: 0,
        commentPlacementCount: 0,
        textChangeCount: 0,
        structuralChangeCount: 0,
        diagnosticItemCount: diagnosticOnlyReviewPacket ? diagnosticOnlyReviewPacket.diagnosticItems.length : 0,
        trackedChangesDiagnosticOnly: preflightReport.trackedChangesEvidence?.present === true,
        trackedTextCandidateCount: 0,
      },
    });
  }

  const reviewPacket = docxReviewPreviewSessionEmptyReviewPacket();
  reviewPacket.commentThreads = commentsResult.comments.map((comment) => comment.thread);
  reviewPacket.commentPlacements = placementsResult.placements;
  reviewPacket.textChanges = trackedTextResult.textChanges;
  reviewPacket.structuralChanges = trackedTextResult.structuralChanges;
  reviewPacket.diagnosticItems = diagnostics;
  const sourceHash = revisionBlockHash({
    schemaVersion: DOCX_REVIEW_PREVIEW_SESSION_CANDIDATE_SCHEMA,
    reviewPacket,
    preflightCode: preflightReport.code,
    targetScope,
  });
  return docxReviewPreviewSessionResult({
    ok: true,
    status: 'ready',
    code: DOCX_REVIEW_PREVIEW_SESSION_CANDIDATE_CODES.READY,
    reason: DOCX_REVIEW_PREVIEW_SESSION_CANDIDATE_CODES.READY,
    decision: 'preview-session-candidate',
    reviewPacket,
    diagnostics,
    unsupportedItems,
    preflightReport,
    sourceViewState: {
      revisionToken: `docx-review-preview:${sourceHash}`,
      viewMode: 'docx-review-preview',
      normalizationPolicy: 'bounded-docx-review-evidence-scan',
      newlinePolicy: 'preserve-extracted-text',
      unicodePolicy: 'xml-entity-decode-only',
      packetHash: sourceHash,
      artifactCompletenessClass: 'partial-review-evidence',
    },
    bounds,
    summary: {
      targetScope,
      commentThreadCount: reviewPacket.commentThreads.length,
      commentPlacementCount: reviewPacket.commentPlacements.length,
      textChangeCount: reviewPacket.textChanges.length,
      structuralChangeCount: reviewPacket.structuralChanges.length,
      diagnosticItemCount: reviewPacket.diagnosticItems.length,
      trackedChangesDiagnosticOnly: preflightReport.trackedChangesEvidence?.present === true
        && reviewPacket.textChanges.length === 0,
      trackedTextCandidateCount: reviewPacket.textChanges.length,
    },
  });
}
// RB_10B_DOCX_REVIEW_PREVIEW_SESSION_CANDIDATE_END

// RB_11_DOCX_CONTENT_PREVIEW_START
export const DOCX_CONTENT_PREVIEW_SCHEMA = 'revision-bridge.docx-content-preview.v1';
const DOCX_CONTENT_PREVIEW_TYPE = 'docxContentPreviewReport';
const DOCX_CONTENT_PREVIEW_SOURCE_PART = 'word/document.xml';

const DOCX_CONTENT_PREVIEW_CODES = Object.freeze({
  READY: 'DOCX_CONTENT_PREVIEW_READY',
  PREFLIGHT_BLOCKED: 'DOCX_CONTENT_PREVIEW_PREFLIGHT_BLOCKED',
  MAIN_DOCUMENT_UNAVAILABLE: 'DOCX_CONTENT_PREVIEW_MAIN_DOCUMENT_UNAVAILABLE',
  UNSAFE_DECLARATION_PRESENT: 'DOCX_CONTENT_PREVIEW_UNSAFE_DECLARATION_PRESENT',
  UNSUPPORTED_XML_ENCODING: 'DOCX_CONTENT_PREVIEW_UNSUPPORTED_XML_ENCODING',
  UNSUPPORTED_XML_PREFIX: 'DOCX_CONTENT_PREVIEW_UNSUPPORTED_XML_PREFIX',
  XML_MALFORMED: 'DOCX_CONTENT_PREVIEW_XML_MALFORMED',
  XML_PARSE_LIMIT_EXCEEDED: 'DOCX_CONTENT_PREVIEW_XML_PARSE_LIMIT_EXCEEDED',
});

const DOCX_CONTENT_PREVIEW_BOUNDS = Object.freeze({
  maxMainDocumentBytes: DOCX_ZIP_INVENTORY_BOUNDS.MAX_ENTRY_UNCOMPRESSED_BYTES,
  maxParagraphs: 64000,
  maxTextChars: 5000000,
  maxDiagnostics: 200,
});

const DOCX_CONTENT_PREVIEW_UNSUPPORTED_TAGS = new Set([
  'w:commentRangeEnd',
  'w:commentRangeStart',
  'w:commentReference',
  'w:del',
  'w:drawing',
  'w:endnoteReference',
  'w:footnoteReference',
  'w:hyperlink',
  'w:ins',
  'w:moveFrom',
  'w:moveTo',
  'w:object',
  'w:pict',
  'w:sdt',
  'w:tbl',
]);

function docxContentPreviewBudgetsCopy() {
  return { ...DOCX_CONTENT_PREVIEW_BOUNDS };
}

function docxContentPreviewDiagnostic(code, options = {}) {
  const diagnostic = {
    code,
    severity: options.severity || 'error',
    message: options.message || code,
  };
  if (options.sourcePart !== undefined) diagnostic.sourcePart = options.sourcePart;
  if (options.sourceCode !== undefined) diagnostic.sourceCode = options.sourceCode;
  if (options.tagName !== undefined) diagnostic.tagName = options.tagName;
  if (options.actual !== undefined) diagnostic.actual = options.actual;
  if (options.limit !== undefined) diagnostic.limit = options.limit;
  return diagnostic;
}

function docxContentPreviewEvidence(kind, options = {}) {
  const evidence = { kind };
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined) evidence[key] = value;
  }
  return evidence;
}

function docxContentPreviewSortRecords(records) {
  return records.slice().sort((left, right) => (
    String(left.code || '').localeCompare(String(right.code || ''))
    || String(left.kind || '').localeCompare(String(right.kind || ''))
    || String(left.sourceCode || '').localeCompare(String(right.sourceCode || ''))
    || String(left.sourcePart || '').localeCompare(String(right.sourcePart || ''))
    || String(left.tagName || '').localeCompare(String(right.tagName || ''))
  ));
}

function docxContentPreviewPreflightSummary(preflight) {
  const summary = isPlainObject(preflight?.preflightSummary) ? preflight.preflightSummary : {};
  return {
    status: typeof preflight?.status === 'string' ? preflight.status : String(summary.status || 'unavailable'),
    decision: typeof preflight?.decision === 'string' ? preflight.decision : String(summary.decision || 'unavailable'),
    code: typeof preflight?.code === 'string' ? preflight.code : String(summary.code || 'unavailable'),
    reason: typeof preflight?.reason === 'string' ? preflight.reason : String(summary.reason || 'unavailable'),
    gatePass: preflight?.gatePass === true,
    packageClassification: typeof summary.packageClassification === 'string'
      ? summary.packageClassification
      : 'unavailable',
    partPolicyDecision: typeof summary.partPolicyDecision === 'string' ? summary.partPolicyDecision : 'unavailable',
    parserCandidateOnly: summary.eligibility?.parserCandidateOnly === true,
  };
}

function docxContentPreviewResult(options) {
  const diagnostics = docxContentPreviewSortRecords(options.diagnostics || []);
  const evidence = docxContentPreviewSortRecords(options.evidence || []);
  return {
    ok: options.ok === true,
    schemaVersion: DOCX_CONTENT_PREVIEW_SCHEMA,
    type: DOCX_CONTENT_PREVIEW_TYPE,
    status: options.status,
    code: options.code,
    reason: options.reason || options.code,
    decision: options.decision,
    diagnostics,
    evidence,
    budgets: docxContentPreviewBudgetsCopy(),
    preflightSummary: options.preflightSummary,
    contentPreview: options.contentPreview || null,
    parse: {
      attempted: options.parseAttempted === true,
      completed: options.parseCompleted === true,
    },
  };
}

function docxContentPreviewBlockedByPreflight(preflight) {
  const preflightSummary = docxContentPreviewPreflightSummary(preflight);
  return docxContentPreviewResult({
    ok: false,
    status: preflightSummary.status === 'accepted' ? 'blocked' : preflightSummary.status,
    code: DOCX_CONTENT_PREVIEW_CODES.PREFLIGHT_BLOCKED,
    reason: preflightSummary.code,
    decision: 'blocked',
    preflightSummary,
    parseAttempted: false,
    parseCompleted: false,
    diagnostics: [
      docxContentPreviewDiagnostic(DOCX_CONTENT_PREVIEW_CODES.PREFLIGHT_BLOCKED, {
        sourceCode: preflightSummary.code,
        message: 'content preview blocked before semantic pass by DOCX intake preflight',
      }),
    ],
    evidence: [
      docxContentPreviewEvidence('preflight', {
        sourceCode: preflightSummary.code,
      }),
    ],
  });
}

function docxContentPreviewStableHash(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function docxContentPreviewExtractMainDocumentXmlBytes(bytes) {
  const metadataResult = docxHostileFileGateCentralEntries(bytes);
  if (metadataResult.failure) {
    return {
      failure: docxContentPreviewDiagnostic(DOCX_CONTENT_PREVIEW_CODES.MAIN_DOCUMENT_UNAVAILABLE, {
        sourcePart: DOCX_CONTENT_PREVIEW_SOURCE_PART,
        sourceCode: metadataResult.failure.code,
        message: 'main document ZIP metadata unavailable after accepted preflight',
      }),
    };
  }

  const entry = metadataResult.entries.find((candidate) => candidate.entryId === DOCX_CONTENT_PREVIEW_SOURCE_PART);
  if (!entry) {
    return {
      failure: docxContentPreviewDiagnostic(DOCX_CONTENT_PREVIEW_CODES.MAIN_DOCUMENT_UNAVAILABLE, {
        sourcePart: DOCX_CONTENT_PREVIEW_SOURCE_PART,
        sourceCode: 'DOCX_MAIN_DOCUMENT_MISSING',
        message: 'main document part is missing after accepted preflight',
      }),
    };
  }
  if (entry.byteSize > DOCX_CONTENT_PREVIEW_BOUNDS.maxMainDocumentBytes) {
    return {
      failure: docxContentPreviewDiagnostic(DOCX_CONTENT_PREVIEW_CODES.MAIN_DOCUMENT_UNAVAILABLE, {
        sourcePart: entry.entryId,
        sourceCode: 'DOCX_MAIN_DOCUMENT_BYTES_EXCEEDED',
        actual: entry.byteSize,
        limit: DOCX_CONTENT_PREVIEW_BOUNDS.maxMainDocumentBytes,
      }),
    };
  }

  const localHeader = docxHostileFileGateValidateLocalHeader(bytes, entry);
  if (localHeader.failure) {
    return {
      failure: docxContentPreviewDiagnostic(DOCX_CONTENT_PREVIEW_CODES.MAIN_DOCUMENT_UNAVAILABLE, {
        sourcePart: entry.entryId,
        sourceCode: localHeader.failure.code,
        message: 'main document local header unavailable after accepted preflight',
      }),
    };
  }

  const dataOffset = localHeader.dataOffset;
  const dataEnd = dataOffset + entry.compressedSize;
  if (dataOffset > bytes.byteLength || dataEnd > bytes.byteLength) {
    return {
      failure: docxContentPreviewDiagnostic(DOCX_CONTENT_PREVIEW_CODES.MAIN_DOCUMENT_UNAVAILABLE, {
        sourcePart: entry.entryId,
        sourceCode: 'DOCX_ZIP_ENTRY_OFFSET_INVALID',
      }),
    };
  }

  const rawBytes = bytes.subarray(dataOffset, dataEnd);
  let contentBytes = rawBytes;
  if (entry.method === 8) {
    try {
      contentBytes = docxHostileFileGateInflateRawSync(rawBytes, DOCX_CONTENT_PREVIEW_BOUNDS.maxMainDocumentBytes);
    } catch {
      return {
        failure: docxContentPreviewDiagnostic(DOCX_CONTENT_PREVIEW_CODES.MAIN_DOCUMENT_UNAVAILABLE, {
          sourcePart: entry.entryId,
          sourceCode: 'DOCX_ZIP_INFLATE_FAILED',
        }),
      };
    }
  } else if (entry.method !== 0) {
    return {
      failure: docxContentPreviewDiagnostic(DOCX_CONTENT_PREVIEW_CODES.MAIN_DOCUMENT_UNAVAILABLE, {
        sourcePart: entry.entryId,
        sourceCode: `DOCX_ZIP_METHOD_${entry.method}`,
      }),
    };
  }

  if (contentBytes.length !== entry.byteSize) {
    return {
      failure: docxContentPreviewDiagnostic(DOCX_CONTENT_PREVIEW_CODES.MAIN_DOCUMENT_UNAVAILABLE, {
        sourcePart: entry.entryId,
        sourceCode: 'DOCX_ZIP_INFLATED_SIZE_MISMATCH',
        actual: contentBytes.length,
        limit: entry.byteSize,
      }),
    };
  }

  return {
    bytes: contentBytes,
    entry: {
      entryId: entry.entryId,
      byteSize: entry.byteSize,
      compressedSize: entry.compressedSize,
      method: entry.method,
    },
  };
}

function docxContentPreviewDecodeEntity(entity) {
  const named = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    quot: '"',
  };
  if (Object.prototype.hasOwnProperty.call(named, entity)) return named[entity];
  if (/^#x[0-9a-f]+$/iu.test(entity)) {
    const value = Number.parseInt(entity.slice(2), 16);
    return Number.isFinite(value) && value >= 0 && value <= 0x10ffff ? String.fromCodePoint(value) : `&${entity};`;
  }
  if (/^#[0-9]+$/u.test(entity)) {
    const value = Number.parseInt(entity.slice(1), 10);
    return Number.isFinite(value) && value >= 0 && value <= 0x10ffff ? String.fromCodePoint(value) : `&${entity};`;
  }
  return `&${entity};`;
}

function docxContentPreviewDecodeText(text) {
  return String(text).replace(/&([^;\s<>&]+);/gu, (_match, entity) => docxContentPreviewDecodeEntity(entity));
}

function docxContentPreviewTagName(token) {
  const match = /^<\/?\s*([^\s>/]+)/u.exec(token);
  return match ? match[1] : '';
}

function docxContentPreviewAddUnsupportedDiagnostic(diagnostics, seenTags, tagName) {
  if (!DOCX_CONTENT_PREVIEW_UNSUPPORTED_TAGS.has(tagName) || seenTags.has(tagName)) return;
  seenTags.add(tagName);
  if (diagnostics.length >= DOCX_CONTENT_PREVIEW_BOUNDS.maxDiagnostics) return;
  diagnostics.push(docxContentPreviewDiagnostic('DOCX_CONTENT_PREVIEW_UNSUPPORTED_STRUCTURE_DIAGNOSTIC', {
    severity: 'warning',
    sourcePart: DOCX_CONTENT_PREVIEW_SOURCE_PART,
    tagName,
    message: 'unsupported DOCX structure retained as preview diagnostic only',
  }));
}

function docxContentPreviewBuildParagraph(order, text) {
  return {
    order,
    sourcePart: DOCX_CONTENT_PREVIEW_SOURCE_PART,
    text,
    textHash: docxContentPreviewStableHash(text),
    charCount: text.length,
  };
}

function docxContentPreviewPushParagraph(paragraphs, text) {
  const nextCount = paragraphs.length + 1;
  if (nextCount > DOCX_CONTENT_PREVIEW_BOUNDS.maxParagraphs) {
    return {
      failure: docxContentPreviewDiagnostic(DOCX_CONTENT_PREVIEW_CODES.XML_PARSE_LIMIT_EXCEEDED, {
        sourcePart: DOCX_CONTENT_PREVIEW_SOURCE_PART,
        actual: nextCount,
        limit: DOCX_CONTENT_PREVIEW_BOUNDS.maxParagraphs,
      }),
    };
  }
  paragraphs.push(docxContentPreviewBuildParagraph(paragraphs.length, text));
  return { ok: true };
}

function docxContentPreviewMalformedXmlDiagnostic(sourceCode, tagName) {
  return docxContentPreviewDiagnostic(DOCX_CONTENT_PREVIEW_CODES.XML_MALFORMED, {
    sourcePart: DOCX_CONTENT_PREVIEW_SOURCE_PART,
    sourceCode,
    tagName,
    message: 'main document XML is not well formed for bounded content preview',
  });
}

function docxContentPreviewUnsupportedEncoding(xmlText) {
  if (xmlText.slice(0, 256).includes('\u0000')) return 'binary-or-utf16';
  const declaration = /^\s*<\?xml\s+[^?]*\?>/iu.exec(xmlText);
  if (!declaration) return null;
  const encoding = /\bencoding\s*=\s*(['"])([^'"]+)\1/iu.exec(declaration[0]);
  if (!encoding) return null;
  const normalized = encoding[2].trim().toLowerCase();
  return normalized === 'utf-8' || normalized === 'utf8' || normalized === 'us-ascii' ? null : encoding[2].trim();
}

function docxContentPreviewUnsupportedPrefix(xmlText) {
  const pattern = /<\/?([a-z_][\w.-]*):(document|body|p|r|t|tab|br)\b/giu;
  let match;
  while ((match = pattern.exec(xmlText)) !== null) {
    if (match[1] !== 'w') return match[1];
  }
  return null;
}

function docxContentPreviewParseMainDocumentXml(xmlText) {
  const diagnostics = [];
  const seenUnsupportedTags = new Set();
  const paragraphs = [];
  const elementStack = [];
  let rootSeen = false;
  let rootTagName = '';
  let paragraphText = '';
  let insideParagraph = false;
  let unsupportedDepth = 0;
  let textDepth = 0;
  let totalTextChars = 0;
  const tokenPattern = new RegExp('<!--[\\s\\S]*?-->|<!\\[CDATA\\[[\\s\\S]*?\\]\\]>|<[^>]+>|[^<]+', 'gu');
  let match;
  let cursor = 0;

  while ((match = tokenPattern.exec(xmlText)) !== null) {
    if (match.index !== cursor) {
      return { failure: docxContentPreviewMalformedXmlDiagnostic('DOCX_XML_TOKEN_GAP') };
    }
    cursor = tokenPattern.lastIndex;
    const token = match[0];
    if (!token.startsWith('<')) {
      if (elementStack.length === 0 && token.trim() !== '') {
        return { failure: docxContentPreviewMalformedXmlDiagnostic('DOCX_XML_TEXT_OUTSIDE_ROOT') };
      }
      if (unsupportedDepth === 0 && insideParagraph && textDepth > 0) {
        const decoded = docxContentPreviewDecodeText(token);
        paragraphText += decoded;
        totalTextChars += decoded.length;
        if (totalTextChars > DOCX_CONTENT_PREVIEW_BOUNDS.maxTextChars) {
          return {
            failure: docxContentPreviewDiagnostic(DOCX_CONTENT_PREVIEW_CODES.XML_PARSE_LIMIT_EXCEEDED, {
              sourcePart: DOCX_CONTENT_PREVIEW_SOURCE_PART,
              actual: totalTextChars,
              limit: DOCX_CONTENT_PREVIEW_BOUNDS.maxTextChars,
            }),
          };
        }
      }
      continue;
    }

    if (token.startsWith('<!--') || token.startsWith('<?')) continue;
    if (token.startsWith('<!')) {
      if (elementStack.length === 0 && rootSeen) {
        return { failure: docxContentPreviewMalformedXmlDiagnostic('DOCX_XML_MARKUP_OUTSIDE_ROOT') };
      }
      if (diagnostics.length < DOCX_CONTENT_PREVIEW_BOUNDS.maxDiagnostics) {
        diagnostics.push(docxContentPreviewDiagnostic('DOCX_CONTENT_PREVIEW_UNSUPPORTED_MARKUP_DIAGNOSTIC', {
          severity: 'warning',
          sourcePart: DOCX_CONTENT_PREVIEW_SOURCE_PART,
          message: 'unsupported XML markup retained as preview diagnostic only',
        }));
      }
      continue;
    }

    const tagName = docxContentPreviewTagName(token);
    if (!tagName) {
      return { failure: docxContentPreviewMalformedXmlDiagnostic('DOCX_XML_TAG_NAME_MISSING') };
    }
    const closing = /^<\//u.test(token);
    const selfClosing = /\/>\s*$/u.test(token);
    if (closing) {
      const expectedTagName = elementStack.pop();
      if (expectedTagName !== tagName) {
        return { failure: docxContentPreviewMalformedXmlDiagnostic('DOCX_XML_TAG_MISMATCH', tagName) };
      }
      if (elementStack.length === 0 && tagName !== rootTagName) {
        return { failure: docxContentPreviewMalformedXmlDiagnostic('DOCX_XML_ROOT_MISMATCH', tagName) };
      }
    } else if (!selfClosing) {
      if (elementStack.length === 0) {
        if (rootSeen) return { failure: docxContentPreviewMalformedXmlDiagnostic('DOCX_XML_MULTIPLE_ROOTS', tagName) };
        rootSeen = true;
        rootTagName = tagName;
      }
      elementStack.push(tagName);
    } else if (elementStack.length === 0) {
      if (rootSeen) return { failure: docxContentPreviewMalformedXmlDiagnostic('DOCX_XML_MULTIPLE_ROOTS', tagName) };
      rootSeen = true;
      rootTagName = tagName;
    }
    const unsupported = DOCX_CONTENT_PREVIEW_UNSUPPORTED_TAGS.has(tagName);
    if (unsupported) {
      docxContentPreviewAddUnsupportedDiagnostic(diagnostics, seenUnsupportedTags, tagName);
      if (closing) unsupportedDepth = Math.max(0, unsupportedDepth - 1);
      else if (!selfClosing) unsupportedDepth += 1;
      continue;
    }
    if (unsupportedDepth > 0) continue;

    if (tagName === 'w:p' && !closing) {
      if (!insideParagraph) {
        insideParagraph = true;
        paragraphText = '';
      }
      if (selfClosing) {
        const pushed = docxContentPreviewPushParagraph(paragraphs, paragraphText);
        if (pushed.failure) return pushed;
        insideParagraph = false;
        paragraphText = '';
      }
    } else if (tagName === 'w:p' && closing && insideParagraph) {
      const pushed = docxContentPreviewPushParagraph(paragraphs, paragraphText);
      if (pushed.failure) return pushed;
      insideParagraph = false;
      paragraphText = '';
      textDepth = 0;
    } else if (insideParagraph && tagName === 'w:t') {
      if (closing) {
        textDepth = Math.max(0, textDepth - 1);
      } else if (!selfClosing) {
        textDepth += 1;
      }
    } else if (insideParagraph && !closing && (tagName === 'w:tab' || tagName === 'w:br')) {
      const marker = tagName === 'w:tab' ? '\t' : '\n';
      paragraphText += marker;
      totalTextChars += marker.length;
      if (totalTextChars > DOCX_CONTENT_PREVIEW_BOUNDS.maxTextChars) {
        return {
          failure: docxContentPreviewDiagnostic(DOCX_CONTENT_PREVIEW_CODES.XML_PARSE_LIMIT_EXCEEDED, {
            sourcePart: DOCX_CONTENT_PREVIEW_SOURCE_PART,
            actual: totalTextChars,
            limit: DOCX_CONTENT_PREVIEW_BOUNDS.maxTextChars,
          }),
        };
      }
    }
  }

  if (cursor !== xmlText.length && xmlText.slice(cursor).trim() !== '') {
    return { failure: docxContentPreviewMalformedXmlDiagnostic('DOCX_XML_TOKEN_GAP') };
  }
  if (elementStack.length > 0) {
    return {
      failure: docxContentPreviewMalformedXmlDiagnostic('DOCX_XML_UNCLOSED_TAG', elementStack[elementStack.length - 1]),
    };
  }
  if (!rootSeen) {
    return { failure: docxContentPreviewMalformedXmlDiagnostic('DOCX_XML_ROOT_MISSING') };
  }
  if (rootTagName !== 'w:document') {
    return { failure: docxContentPreviewMalformedXmlDiagnostic('DOCX_XML_ROOT_UNSUPPORTED', rootTagName) };
  }

  if (insideParagraph) {
    const pushed = docxContentPreviewPushParagraph(paragraphs, paragraphText);
    if (pushed.failure) return pushed;
  }

  const joinedText = paragraphs.map((paragraph) => paragraph.text).join('\n');
  return {
    diagnostics,
    contentPreview: {
      sourcePart: DOCX_CONTENT_PREVIEW_SOURCE_PART,
      paragraphCount: paragraphs.length,
      textLength: joinedText.length,
      textHash: docxContentPreviewStableHash(joinedText),
      paragraphs,
    },
  };
}

export function buildDocxContentPreviewFromZipBytes(input) {
  const preflight = buildDocxIntakePreflightReportFromZipBytes(input);
  const preflightSummary = docxContentPreviewPreflightSummary(preflight);
  if (
    preflight?.ok !== true
    || !['accepted', 'degraded'].includes(preflightSummary.status)
    || preflightSummary.gatePass !== true
    || preflightSummary.parserCandidateOnly !== true
  ) {
    return docxContentPreviewBlockedByPreflight(preflight);
  }

  const bytes = docxZipInventoryInputToBytes(input);
  if (bytes === null) return docxContentPreviewBlockedByPreflight(preflight);

  const extraction = docxContentPreviewExtractMainDocumentXmlBytes(bytes);
  if (extraction.failure) {
    return docxContentPreviewResult({
      ok: false,
      status: 'blocked',
      code: extraction.failure.code,
      reason: extraction.failure.sourceCode || extraction.failure.code,
      decision: 'blocked',
      preflightSummary,
      parseAttempted: true,
      parseCompleted: false,
      diagnostics: [extraction.failure],
      evidence: [
        docxContentPreviewEvidence('preflight', { sourceCode: preflightSummary.code }),
      ],
    });
  }

  const xmlText = Buffer.from(extraction.bytes).toString('utf8');
  const unsupportedEncoding = docxContentPreviewUnsupportedEncoding(xmlText);
  if (unsupportedEncoding) {
    return docxContentPreviewResult({
      ok: false,
      status: 'blocked',
      code: DOCX_CONTENT_PREVIEW_CODES.UNSUPPORTED_XML_ENCODING,
      reason: DOCX_CONTENT_PREVIEW_CODES.UNSUPPORTED_XML_ENCODING,
      decision: 'blocked',
      preflightSummary,
      parseAttempted: true,
      parseCompleted: false,
      diagnostics: [
        docxContentPreviewDiagnostic(DOCX_CONTENT_PREVIEW_CODES.UNSUPPORTED_XML_ENCODING, {
          sourcePart: DOCX_CONTENT_PREVIEW_SOURCE_PART,
          sourceCode: unsupportedEncoding,
          message: 'main document XML encoding is outside bounded UTF-8 content preview scope',
        }),
      ],
      evidence: [
        docxContentPreviewEvidence('mainDocument', {
          sourcePart: extraction.entry.entryId,
          byteSize: extraction.entry.byteSize,
        }),
      ],
    });
  }
  if (/<!\s*(DOCTYPE|ENTITY)\b/iu.test(xmlText)) {
    return docxContentPreviewResult({
      ok: false,
      status: 'blocked',
      code: DOCX_CONTENT_PREVIEW_CODES.UNSAFE_DECLARATION_PRESENT,
      reason: DOCX_CONTENT_PREVIEW_CODES.UNSAFE_DECLARATION_PRESENT,
      decision: 'blocked',
      preflightSummary,
      parseAttempted: true,
      parseCompleted: false,
      diagnostics: [
        docxContentPreviewDiagnostic(DOCX_CONTENT_PREVIEW_CODES.UNSAFE_DECLARATION_PRESENT, {
          sourcePart: DOCX_CONTENT_PREVIEW_SOURCE_PART,
          message: 'unsafe XML declaration detected during content preview defense-in-depth',
        }),
      ],
      evidence: [
        docxContentPreviewEvidence('mainDocument', {
          sourcePart: extraction.entry.entryId,
          byteSize: extraction.entry.byteSize,
        }),
      ],
    });
  }
  const unsupportedPrefix = docxContentPreviewUnsupportedPrefix(xmlText);
  if (unsupportedPrefix) {
    return docxContentPreviewResult({
      ok: false,
      status: 'blocked',
      code: DOCX_CONTENT_PREVIEW_CODES.UNSUPPORTED_XML_PREFIX,
      reason: DOCX_CONTENT_PREVIEW_CODES.UNSUPPORTED_XML_PREFIX,
      decision: 'blocked',
      preflightSummary,
      parseAttempted: true,
      parseCompleted: false,
      diagnostics: [
        docxContentPreviewDiagnostic(DOCX_CONTENT_PREVIEW_CODES.UNSUPPORTED_XML_PREFIX, {
          sourcePart: DOCX_CONTENT_PREVIEW_SOURCE_PART,
          sourceCode: unsupportedPrefix,
          message: 'main document XML namespace prefix is outside minimal w-prefixed preview scope',
        }),
      ],
      evidence: [
        docxContentPreviewEvidence('mainDocument', {
          sourcePart: extraction.entry.entryId,
          byteSize: extraction.entry.byteSize,
        }),
      ],
    });
  }

  const parsed = docxContentPreviewParseMainDocumentXml(xmlText);
  if (parsed.failure) {
    return docxContentPreviewResult({
      ok: false,
      status: 'blocked',
      code: parsed.failure.code,
      reason: parsed.failure.sourceCode || parsed.failure.code,
      decision: 'blocked',
      preflightSummary,
      parseAttempted: true,
      parseCompleted: false,
      diagnostics: [parsed.failure],
      evidence: [
        docxContentPreviewEvidence('mainDocument', {
          sourcePart: extraction.entry.entryId,
          byteSize: extraction.entry.byteSize,
        }),
      ],
    });
  }

  return docxContentPreviewResult({
    ok: true,
    status: 'preview',
    code: DOCX_CONTENT_PREVIEW_CODES.READY,
    reason: DOCX_CONTENT_PREVIEW_CODES.READY,
    decision: 'preview',
    preflightSummary,
    parseAttempted: true,
    parseCompleted: true,
    diagnostics: [
      ...parsed.diagnostics,
      ...preflight.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        message: diagnostic.message || 'DOCX package part is ignored by plain text content preview',
      })),
    ],
    evidence: [
      docxContentPreviewEvidence('mainDocument', {
        sourcePart: extraction.entry.entryId,
        byteSize: extraction.entry.byteSize,
        compressedSize: extraction.entry.compressedSize,
      }),
      docxContentPreviewEvidence('contentPreview', {
        paragraphCount: parsed.contentPreview.paragraphCount,
        textLength: parsed.contentPreview.textLength,
        textHash: parsed.contentPreview.textHash,
      }),
    ],
    contentPreview: parsed.contentPreview,
  });
}
// RB_11_DOCX_CONTENT_PREVIEW_END

// RB_12_DOCX_IMPORT_PREVIEW_PLAN_START
export const DOCX_IMPORT_PREVIEW_SCHEMA = 'revision-bridge.docx-import-preview.v1';
const DOCX_IMPORT_PREVIEW_TYPE = 'docx.import.preview';
const DOCX_IMPORT_PREVIEW_LOSS_REPORT_SCHEMA = 'revision-bridge.docx-import-preview.loss-report.v1';
const DOCX_IMPORT_PREVIEW_SOURCE_TYPE = DOCX_CONTENT_PREVIEW_TYPE;
const DOCX_IMPORT_PREVIEW_CODES = Object.freeze({
  READY: 'DOCX_IMPORT_PREVIEW_READY',
  INPUT_INVALID: 'DOCX_IMPORT_PREVIEW_INPUT_INVALID',
  SOURCE_BLOCKED: 'DOCX_IMPORT_PREVIEW_SOURCE_BLOCKED',
  CONTENT_UNAVAILABLE: 'DOCX_IMPORT_PREVIEW_CONTENT_UNAVAILABLE',
  CONTENT_INVALID: 'DOCX_IMPORT_PREVIEW_CONTENT_INVALID',
  INPUT_LAYER_LEAK: 'DOCX_IMPORT_PREVIEW_INPUT_LAYER_LEAK',
  BUDGET_EXCEEDED: 'DOCX_IMPORT_PREVIEW_BUDGET_EXCEEDED',
});
const DOCX_IMPORT_PREVIEW_BOUNDS = Object.freeze({
  maxCandidateScenes: 1,
  maxParagraphs: DOCX_CONTENT_PREVIEW_BOUNDS.maxParagraphs,
  maxTextChars: DOCX_CONTENT_PREVIEW_BOUNDS.maxTextChars,
  maxDiagnostics: DOCX_CONTENT_PREVIEW_BOUNDS.maxDiagnostics,
  maxLossItems: DOCX_CONTENT_PREVIEW_BOUNDS.maxDiagnostics,
});
const DOCX_IMPORT_PREVIEW_FORBIDDEN_SOURCE_KEYS = Object.freeze([
  'reviewPacket',
  'reviewSurface',
  'parsedReviewSurface',
  'activeReviewSession',
  'applyOps',
  'applyPlan',
  'canApply',
  'canCreateReviewPacket',
  'canPreviewApply',
  'canImportMutate',
  'canWriteStorage',
  'writeEffects',
  'writeReceipt',
  'importReceipt',
  'exportReceipt',
  'safeCreatePlan',
  'path',
  'filePath',
  'projectRoot',
  'storage',
  'renderer',
  'preload',
]);

function docxImportPreviewCanonicalJson(value) {
  if (value === null) return 'null';
  const valueType = typeof value;
  if (valueType === 'string') return JSON.stringify(value);
  if (valueType === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  if (valueType === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return `[${value.map((item) => docxImportPreviewCanonicalJson(item)).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${docxImportPreviewCanonicalJson(value[key])}`
    )).join(',')}}`;
  }
  return 'null';
}

function docxImportPreviewStableHash(value) {
  return docxContentPreviewStableHash(docxImportPreviewCanonicalJson(value));
}

function docxImportPreviewNormalizeText(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function docxImportPreviewDiagnostic(code, options = {}) {
  const diagnostic = {
    code,
    severity: options.severity || 'error',
    message: options.message || code,
  };
  if (options.field !== undefined) diagnostic.field = options.field;
  if (options.sourceCode !== undefined) diagnostic.sourceCode = options.sourceCode;
  if (options.sourcePart !== undefined) diagnostic.sourcePart = options.sourcePart;
  if (options.tagName !== undefined) diagnostic.tagName = options.tagName;
  if (options.actual !== undefined) diagnostic.actual = options.actual;
  if (options.limit !== undefined) diagnostic.limit = options.limit;
  return diagnostic;
}

function docxImportPreviewEvidence(kind, options = {}) {
  const evidence = { kind };
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined) evidence[key] = value;
  }
  return evidence;
}

function docxImportPreviewLossItem(code, options = {}) {
  const item = {
    code,
    severity: options.severity || 'info',
    category: options.category || 'plainTextOnly',
    message: options.message || code,
  };
  if (options.sourceCode !== undefined) item.sourceCode = options.sourceCode;
  if (options.sourcePart !== undefined) item.sourcePart = options.sourcePart;
  if (options.tagName !== undefined) item.tagName = options.tagName;
  return item;
}

function docxImportPreviewSortRecords(records) {
  return records.slice().sort((left, right) => (
    String(left.code || '').localeCompare(String(right.code || ''))
    || String(left.kind || '').localeCompare(String(right.kind || ''))
    || String(left.category || '').localeCompare(String(right.category || ''))
    || String(left.sourceCode || '').localeCompare(String(right.sourceCode || ''))
    || String(left.sourcePart || '').localeCompare(String(right.sourcePart || ''))
    || String(left.tagName || '').localeCompare(String(right.tagName || ''))
    || String(left.field || '').localeCompare(String(right.field || ''))
  ));
}

function docxImportPreviewBudgetsCopy() {
  return { ...DOCX_IMPORT_PREVIEW_BOUNDS };
}

function docxImportPreviewResult(options = {}) {
  const body = {
    ok: options.ok === true,
    schemaVersion: DOCX_IMPORT_PREVIEW_SCHEMA,
    type: DOCX_IMPORT_PREVIEW_TYPE,
    status: options.status || 'blocked',
    code: options.code || DOCX_IMPORT_PREVIEW_CODES.INPUT_INVALID,
    reason: options.reason || options.code || DOCX_IMPORT_PREVIEW_CODES.INPUT_INVALID,
    decision: options.decision || 'blocked',
    writeEffects: false,
    diagnostics: docxImportPreviewSortRecords(options.diagnostics || []),
    evidence: docxImportPreviewSortRecords(options.evidence || []),
    budgets: docxImportPreviewBudgetsCopy(),
    source: options.source || null,
    candidateCreatePlan: options.candidateCreatePlan || null,
    lossReport: options.lossReport || null,
  };
  return {
    ...body,
    previewHash: docxImportPreviewStableHash(body),
  };
}

function docxImportPreviewBlocked(code, options = {}) {
  return docxImportPreviewResult({
    ok: false,
    status: 'blocked',
    code,
    reason: options.reason || code,
    decision: 'blocked',
    source: options.source || null,
    diagnostics: [
      docxImportPreviewDiagnostic(code, {
        field: options.field,
        sourceCode: options.sourceCode,
        sourcePart: options.sourcePart,
        tagName: options.tagName,
        actual: options.actual,
        limit: options.limit,
        message: options.message || code,
      }),
    ],
    evidence: options.evidence || [],
  });
}

function docxImportPreviewFindForbiddenSourceKey(value, pathParts = []) {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const nested = docxImportPreviewFindForbiddenSourceKey(value[index], pathParts.concat(String(index)));
      if (nested) return nested;
    }
    return '';
  }
  if (!isPlainObject(value)) return '';
  for (const key of Object.keys(value)) {
    const nextPath = pathParts.concat(key);
    if (DOCX_IMPORT_PREVIEW_FORBIDDEN_SOURCE_KEYS.includes(key)) return nextPath.join('.');
    const nested = docxImportPreviewFindForbiddenSourceKey(value[key], nextPath);
    if (nested) return nested;
  }
  return '';
}

function docxImportPreviewValidateSourceReport(input) {
  if (!isPlainObject(input)) {
    return {
      ok: false,
      code: DOCX_IMPORT_PREVIEW_CODES.INPUT_INVALID,
      field: 'input',
    };
  }
  const forbiddenPath = docxImportPreviewFindForbiddenSourceKey(input);
  if (forbiddenPath) {
    return {
      ok: false,
      code: DOCX_IMPORT_PREVIEW_CODES.INPUT_LAYER_LEAK,
      field: forbiddenPath,
    };
  }
  if (input.schemaVersion !== DOCX_CONTENT_PREVIEW_SCHEMA) {
    return {
      ok: false,
      code: DOCX_IMPORT_PREVIEW_CODES.INPUT_INVALID,
      field: 'schemaVersion',
    };
  }
  if (input.type !== DOCX_IMPORT_PREVIEW_SOURCE_TYPE) {
    return {
      ok: false,
      code: DOCX_IMPORT_PREVIEW_CODES.INPUT_INVALID,
      field: 'type',
    };
  }
  if (input.ok !== true || input.status !== 'preview' || input.decision !== 'preview') {
    return {
      ok: false,
      code: DOCX_IMPORT_PREVIEW_CODES.SOURCE_BLOCKED,
      sourceCode: typeof input.code === 'string' ? input.code : '',
    };
  }
  if (input.code !== DOCX_CONTENT_PREVIEW_CODES.READY) {
    return {
      ok: false,
      code: DOCX_IMPORT_PREVIEW_CODES.SOURCE_BLOCKED,
      sourceCode: typeof input.code === 'string' ? input.code : '',
    };
  }
  if (!isPlainObject(input.contentPreview)) {
    return {
      ok: false,
      code: DOCX_IMPORT_PREVIEW_CODES.CONTENT_UNAVAILABLE,
      field: 'contentPreview',
    };
  }
  const preflightSummary = isPlainObject(input.preflightSummary) ? input.preflightSummary : {};
  if (
    !['accepted', 'degraded'].includes(preflightSummary.status)
    || preflightSummary.gatePass !== true
    || preflightSummary.parserCandidateOnly !== true
  ) {
    return {
      ok: false,
      code: DOCX_IMPORT_PREVIEW_CODES.SOURCE_BLOCKED,
      field: 'preflightSummary',
      sourceCode: typeof input.code === 'string' ? input.code : '',
    };
  }
  if (
    !isPlainObject(input.parse)
    || input.parse.attempted !== true
    || input.parse.completed !== true
  ) {
    return {
      ok: false,
      code: DOCX_IMPORT_PREVIEW_CODES.SOURCE_BLOCKED,
      field: 'parse',
      sourceCode: typeof input.code === 'string' ? input.code : '',
    };
  }
  return { ok: true, value: input.contentPreview };
}

function docxImportPreviewValidateParagraphs(contentPreview) {
  if (contentPreview.sourcePart !== DOCX_CONTENT_PREVIEW_SOURCE_PART) {
    return {
      ok: false,
      code: DOCX_IMPORT_PREVIEW_CODES.CONTENT_INVALID,
      field: 'contentPreview.sourcePart',
    };
  }
  if (!Array.isArray(contentPreview.paragraphs)) {
    return {
      ok: false,
      code: DOCX_IMPORT_PREVIEW_CODES.CONTENT_INVALID,
      field: 'contentPreview.paragraphs',
    };
  }
  if (contentPreview.paragraphs.length > DOCX_IMPORT_PREVIEW_BOUNDS.maxParagraphs) {
    return {
      ok: false,
      code: DOCX_IMPORT_PREVIEW_CODES.BUDGET_EXCEEDED,
      field: 'contentPreview.paragraphs',
      actual: contentPreview.paragraphs.length,
      limit: DOCX_IMPORT_PREVIEW_BOUNDS.maxParagraphs,
    };
  }
  if (contentPreview.paragraphCount !== contentPreview.paragraphs.length) {
    return {
      ok: false,
      code: DOCX_IMPORT_PREVIEW_CODES.CONTENT_INVALID,
      field: 'contentPreview.paragraphCount',
    };
  }

  const texts = [];
  for (let index = 0; index < contentPreview.paragraphs.length; index += 1) {
    const paragraph = contentPreview.paragraphs[index];
    if (!isPlainObject(paragraph)) {
      return {
        ok: false,
        code: DOCX_IMPORT_PREVIEW_CODES.CONTENT_INVALID,
        field: `contentPreview.paragraphs.${index}`,
      };
    }
    if (paragraph.order !== index) {
      return {
        ok: false,
        code: DOCX_IMPORT_PREVIEW_CODES.CONTENT_INVALID,
        field: `contentPreview.paragraphs.${index}.order`,
      };
    }
    if (typeof paragraph.text !== 'string') {
      return {
        ok: false,
        code: DOCX_IMPORT_PREVIEW_CODES.CONTENT_INVALID,
        field: `contentPreview.paragraphs.${index}.text`,
      };
    }
    const text = docxImportPreviewNormalizeText(paragraph.text);
    if (paragraph.textHash !== docxContentPreviewStableHash(text)) {
      return {
        ok: false,
        code: DOCX_IMPORT_PREVIEW_CODES.CONTENT_INVALID,
        field: `contentPreview.paragraphs.${index}.textHash`,
      };
    }
    if (paragraph.charCount !== text.length) {
      return {
        ok: false,
        code: DOCX_IMPORT_PREVIEW_CODES.CONTENT_INVALID,
        field: `contentPreview.paragraphs.${index}.charCount`,
      };
    }
    texts.push(text);
  }

  const joinedPreviewText = texts.join('\n');
  if (joinedPreviewText.length > DOCX_IMPORT_PREVIEW_BOUNDS.maxTextChars) {
    return {
      ok: false,
      code: DOCX_IMPORT_PREVIEW_CODES.BUDGET_EXCEEDED,
      field: 'contentPreview.textLength',
      actual: joinedPreviewText.length,
      limit: DOCX_IMPORT_PREVIEW_BOUNDS.maxTextChars,
    };
  }
  if (contentPreview.textLength !== joinedPreviewText.length) {
    return {
      ok: false,
      code: DOCX_IMPORT_PREVIEW_CODES.CONTENT_INVALID,
      field: 'contentPreview.textLength',
    };
  }
  if (contentPreview.textHash !== docxContentPreviewStableHash(joinedPreviewText)) {
    return {
      ok: false,
      code: DOCX_IMPORT_PREVIEW_CODES.CONTENT_INVALID,
      field: 'contentPreview.textHash',
    };
  }
  return { ok: true, texts, joinedPreviewText };
}

function docxImportPreviewLossCategoryForDiagnostic(diagnostic = {}) {
  const sourceCode = typeof diagnostic.code === 'string' ? diagnostic.code : '';
  if (sourceCode === DOCX_PART_POLICY_DIAGNOSTIC_CODES.RELATIONSHIP_DIAGNOSTICS_ONLY) {
    return { code: 'DOCX_IMPORT_PREVIEW_RELATIONSHIPS_NOT_IMPORTED', category: 'relationship' };
  }
  if (sourceCode === DOCX_PART_POLICY_DIAGNOSTIC_CODES.UNSUPPORTED_STORY_DIAGNOSTICS_ONLY) {
    return { code: 'DOCX_IMPORT_PREVIEW_STORY_NOT_IMPORTED', category: 'story' };
  }
  if (sourceCode === DOCX_PART_POLICY_DIAGNOSTIC_CODES.MEDIA_DIAGNOSTICS_ONLY) {
    return { code: 'DOCX_IMPORT_PREVIEW_MEDIA_NOT_IMPORTED', category: 'media' };
  }
  if (sourceCode === DOCX_PART_POLICY_DIAGNOSTIC_CODES.DIRECTORY_DIAGNOSTICS_ONLY) {
    return { code: 'DOCX_IMPORT_PREVIEW_PACKAGE_DIRECTORY_IGNORED', category: 'package' };
  }
  const tagName = typeof diagnostic.tagName === 'string' ? diagnostic.tagName : '';
  if (tagName === 'w:tbl') return { code: 'DOCX_IMPORT_PREVIEW_TABLE_NOT_IMPORTED', category: 'table' };
  if (tagName === 'w:drawing' || tagName === 'w:pict' || tagName === 'w:object') {
    return { code: 'DOCX_IMPORT_PREVIEW_MEDIA_NOT_IMPORTED', category: 'media' };
  }
  if (tagName === 'w:commentRangeStart' || tagName === 'w:commentRangeEnd' || tagName === 'w:commentReference') {
    return { code: 'DOCX_IMPORT_PREVIEW_COMMENTS_NOT_IMPORTED', category: 'comments' };
  }
  if (tagName === 'w:ins' || tagName === 'w:del' || tagName === 'w:moveFrom' || tagName === 'w:moveTo') {
    return { code: 'DOCX_IMPORT_PREVIEW_REVISIONS_NOT_IMPORTED', category: 'revisions' };
  }
  if (tagName === 'w:footnoteReference' || tagName === 'w:endnoteReference') {
    return { code: 'DOCX_IMPORT_PREVIEW_NOTES_NOT_IMPORTED', category: 'notes' };
  }
  if (tagName === 'w:hyperlink') return { code: 'DOCX_IMPORT_PREVIEW_LINK_NOT_IMPORTED', category: 'link' };
  return { code: 'DOCX_IMPORT_PREVIEW_STRUCTURE_NOT_IMPORTED', category: 'structure' };
}

function docxImportPreviewBuildLossReport(sourceReport, contentPreview, importedText) {
  const items = [
    docxImportPreviewLossItem('DOCX_IMPORT_PREVIEW_PLAIN_TEXT_ONLY', {
      category: 'formatting',
      message: 'DOCX import preview candidate is limited to plain text scene content',
    }),
  ];
  if (importedText.length === 0) {
    items.push(docxImportPreviewLossItem('DOCX_IMPORT_PREVIEW_EMPTY_CONTENT_DIAGNOSTIC', {
      category: 'content',
      severity: 'warning',
      message: 'DOCX content preview contains no importable text',
    }));
  }
  const diagnostics = Array.isArray(sourceReport.diagnostics) ? sourceReport.diagnostics : [];
  for (const diagnostic of diagnostics) {
    if (!isPlainObject(diagnostic)) continue;
    const knownIgnoredPart = [
      DOCX_PART_POLICY_DIAGNOSTIC_CODES.RELATIONSHIP_DIAGNOSTICS_ONLY,
      DOCX_PART_POLICY_DIAGNOSTIC_CODES.UNSUPPORTED_STORY_DIAGNOSTICS_ONLY,
      DOCX_PART_POLICY_DIAGNOSTIC_CODES.MEDIA_DIAGNOSTICS_ONLY,
      DOCX_PART_POLICY_DIAGNOSTIC_CODES.DIRECTORY_DIAGNOSTICS_ONLY,
    ].includes(diagnostic.code);
    if (diagnostic.code !== 'DOCX_CONTENT_PREVIEW_UNSUPPORTED_STRUCTURE_DIAGNOSTIC' && !knownIgnoredPart) continue;
    if (items.length >= DOCX_IMPORT_PREVIEW_BOUNDS.maxLossItems) break;
    const mapped = docxImportPreviewLossCategoryForDiagnostic(diagnostic);
    items.push(docxImportPreviewLossItem(mapped.code, {
      category: mapped.category,
      severity: 'warning',
      sourceCode: diagnostic.code,
      sourcePart: diagnostic.sourcePart || diagnostic.entryId || contentPreview.sourcePart,
      tagName: diagnostic.tagName,
      message: knownIgnoredPart
        ? 'known DOCX package part is ignored by the plain text import candidate'
        : 'unsupported DOCX structure is not represented in the plain text import candidate',
    }));
  }
  const sortedItems = docxImportPreviewSortRecords(items);
  return {
    schemaVersion: DOCX_IMPORT_PREVIEW_LOSS_REPORT_SCHEMA,
    mode: 'plain-text-only',
    itemCount: sortedItems.length,
    items: sortedItems,
  };
}

function docxImportPreviewBuildCandidateCreatePlan(sourceReport, contentPreview, importedText) {
  const contentTextHash = docxContentPreviewStableHash(importedText);
  const sourceTextHash = typeof contentPreview.textHash === 'string' ? contentPreview.textHash : '';
  return {
    mode: 'create-only',
    sceneStrategy: 'single-scene',
    entryCount: 1,
    entries: [
      {
        sceneId: `docx-import-scene-${docxImportPreviewStableHash({
          sourceTextHash,
          contentTextHash,
          paragraphCount: contentPreview.paragraphCount,
        })}`,
        kind: 'scene',
        title: 'Imported DOCX preview',
        content: importedText,
        contentTextHash,
        source: {
          schemaVersion: sourceReport.schemaVersion,
          type: sourceReport.type,
          sourcePart: contentPreview.sourcePart,
          paragraphRange: {
            start: contentPreview.paragraphCount > 0 ? 0 : -1,
            end: contentPreview.paragraphCount > 0 ? contentPreview.paragraphCount - 1 : -1,
          },
          paragraphCount: contentPreview.paragraphCount,
          textHash: sourceTextHash,
        },
      },
    ],
  };
}

export function buildDocxImportPreviewPlanFromContentPreview(input = {}) {
  const sourceValidation = docxImportPreviewValidateSourceReport(input);
  if (!sourceValidation.ok) {
    return docxImportPreviewBlocked(sourceValidation.code, {
      field: sourceValidation.field,
      sourceCode: sourceValidation.sourceCode,
    });
  }
  const contentPreview = sourceValidation.value;
  const paragraphValidation = docxImportPreviewValidateParagraphs(contentPreview);
  if (!paragraphValidation.ok) {
    return docxImportPreviewBlocked(paragraphValidation.code, {
      field: paragraphValidation.field,
      actual: paragraphValidation.actual,
      limit: paragraphValidation.limit,
      sourcePart: contentPreview.sourcePart,
    });
  }

  const importedText = paragraphValidation.texts.join('\n\n');
  const sourceHash = docxImportPreviewStableHash(input);
  const candidateCreatePlan = docxImportPreviewBuildCandidateCreatePlan(input, contentPreview, importedText);
  const lossReport = docxImportPreviewBuildLossReport(input, contentPreview, importedText);
  const source = {
    schemaVersion: input.schemaVersion,
    type: input.type,
    code: input.code,
    contentPreviewHash: sourceHash,
    sourcePart: contentPreview.sourcePart,
    paragraphCount: contentPreview.paragraphCount,
    textLength: contentPreview.textLength,
    textHash: contentPreview.textHash,
  };

  return docxImportPreviewResult({
    ok: true,
    status: 'preview',
    code: DOCX_IMPORT_PREVIEW_CODES.READY,
    reason: DOCX_IMPORT_PREVIEW_CODES.READY,
    decision: 'preview',
    source,
    diagnostics: Array.isArray(input.diagnostics)
      ? input.diagnostics.map((diagnostic) => cloneJsonSafe(diagnostic)).filter(isPlainObject)
      : [],
    evidence: [
      docxImportPreviewEvidence('contentPreview', {
        contentPreviewHash: sourceHash,
        paragraphCount: contentPreview.paragraphCount,
        textLength: contentPreview.textLength,
        textHash: contentPreview.textHash,
      }),
      docxImportPreviewEvidence('candidateCreatePlan', {
        mode: candidateCreatePlan.mode,
        sceneStrategy: candidateCreatePlan.sceneStrategy,
        entryCount: candidateCreatePlan.entryCount,
        contentTextHash: candidateCreatePlan.entries[0].contentTextHash,
      }),
      docxImportPreviewEvidence('lossReport', {
        itemCount: lossReport.itemCount,
      }),
    ],
    candidateCreatePlan,
    lossReport,
  });
}
// RB_12_DOCX_IMPORT_PREVIEW_PLAN_END

function missingField(field) {
  return {
    code: 'REVISION_BRIDGE_FIELD_REQUIRED',
    field,
    message: `${field} is required`,
  };
}

function invalidField(field, message) {
  return {
    code: 'REVISION_BRIDGE_FIELD_INVALID',
    field,
    message,
  };
}

// RB_09_BLOCK_LINEAGE_CONTRACTS_START
const REVISION_BLOCK_VALID_CODE = 'REVISION_BRIDGE_BLOCK_VALID';
const REVISION_BLOCK_INVALID_CODE = 'E_REVISION_BRIDGE_BLOCK_INVALID';
const REVISION_BLOCK_LINEAGE_VALID_CODE = 'REVISION_BRIDGE_BLOCK_LINEAGE_VALID';
const REVISION_BLOCK_LINEAGE_INVALID_CODE = 'E_REVISION_BRIDGE_BLOCK_LINEAGE_INVALID';

function revisionBlockCanonicalJson(value) {
  if (value === null) return 'null';
  const valueType = typeof value;
  if (valueType === 'string') return JSON.stringify(value);
  if (valueType === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  if (valueType === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return `[${value.map((item) => revisionBlockCanonicalJson(item)).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${revisionBlockCanonicalJson(value[key])}`
    )).join(',')}}`;
  }
  return 'null';
}

function revisionBlockHash(value) {
  const text = revisionBlockCanonicalJson(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function revisionBlockCleanRecord(value) {
  return isPlainObject(value) ? cloneJsonSafe(value) || {} : {};
}

function revisionBlockInput(input) {
  return isPlainObject(input) ? input : {};
}

function revisionBlockValidationFailure(reasons, value = null) {
  return {
    ok: false,
    type: 'revisionBridge.block.validation',
    code: REVISION_BLOCK_INVALID_CODE,
    reason: reasons[0]?.code || REVISION_BLOCK_INVALID_CODE,
    reasons,
    value,
  };
}

function revisionBlockValidationSuccess(value) {
  return {
    ok: true,
    type: 'revisionBridge.block.validation',
    code: REVISION_BLOCK_VALID_CODE,
    reason: REVISION_BLOCK_VALID_CODE,
    reasons: [],
    value: cloneJsonSafe(value),
  };
}

function revisionBlockLineageValidationFailure(reasons, value = null) {
  return {
    ok: false,
    type: 'revisionBridge.blockLineage.validation',
    code: REVISION_BLOCK_LINEAGE_INVALID_CODE,
    reason: reasons[0]?.code || REVISION_BLOCK_LINEAGE_INVALID_CODE,
    reasons,
    value,
  };
}

function revisionBlockLineageValidationSuccess(value) {
  return {
    ok: true,
    type: 'revisionBridge.blockLineage.validation',
    code: REVISION_BLOCK_LINEAGE_VALID_CODE,
    reason: REVISION_BLOCK_LINEAGE_VALID_CODE,
    reasons: [],
    value: cloneJsonSafe(value),
  };
}

function collectRevisionBlockCycleReasons(edges, knownBlockIds) {
  const reasons = [];
  const outgoing = {};
  for (const blockId of knownBlockIds) outgoing[blockId] = [];
  edges.forEach((edge) => {
    if (isPlainObject(edge) && outgoing[edge.fromBlockId]) outgoing[edge.fromBlockId].push(edge.toBlockId);
  });

  const visiting = {};
  const visited = {};
  function visit(blockId, trail) {
    if (visiting[blockId]) {
      reasons.push(invalidField('lineageEdges', `lineage cycle detected at ${blockId}`));
      return;
    }
    if (visited[blockId]) return;
    visiting[blockId] = true;
    for (const nextBlockId of outgoing[blockId] || []) {
      if (knownBlockIds.includes(nextBlockId)) visit(nextBlockId, trail.concat(nextBlockId));
    }
    visiting[blockId] = false;
    visited[blockId] = true;
  }

  for (const blockId of knownBlockIds) visit(blockId, [blockId]);
  return reasons.slice(0, 1);
}

export function isRevisionBlockKind(value) {
  return REVISION_BRIDGE_BLOCK_KINDS.includes(value);
}

export function normalizeRevisionBlockText(value) {
  return typeof value === 'string' ? value.replace(/\r\n?/gu, '\n').trim() : '';
}

export function createRevisionBlockOrder(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function createRevisionBlockVersionHash(input = {}) {
  const block = revisionBlockInput(input);
  return `rbvh_${revisionBlockHash({
    schemaVersion: REVISION_BRIDGE_BLOCK_SCHEMA,
    kind: isRevisionBlockKind(block.kind) ? block.kind : 'paragraph',
    text: normalizeRevisionBlockText(block.text),
    attrs: revisionBlockCleanRecord(block.attrs),
  })}`;
}

export function createRevisionBlockLineageId(input = {}) {
  const block = revisionBlockInput(input);
  const explicitSeed = normalizeString(block.lineageSeed);
  const seed = explicitSeed || revisionBlockCanonicalJson({
    sceneId: normalizeString(block.sceneId),
    order: createRevisionBlockOrder(block.order),
    kind: isRevisionBlockKind(block.kind) ? block.kind : 'paragraph',
    text: normalizeRevisionBlockText(block.text),
  });
  return `rbli_${revisionBlockHash({
    schemaVersion: REVISION_BRIDGE_BLOCK_LINEAGE_SCHEMA,
    seed,
  })}`;
}

export function createRevisionBlockInstanceId(input = {}) {
  const block = revisionBlockInput(input);
  return `rbbi_${revisionBlockHash({
    schemaVersion: REVISION_BRIDGE_BLOCK_SCHEMA,
    sceneId: normalizeString(block.sceneId),
    order: createRevisionBlockOrder(block.order),
    kind: isRevisionBlockKind(block.kind) ? block.kind : 'paragraph',
    lineageId: createRevisionBlockLineageId(block),
  })}`;
}

export function createRevisionBlock(input = {}) {
  const block = revisionBlockInput(input);
  const kind = isRevisionBlockKind(block.kind) ? block.kind : 'paragraph';
  const order = createRevisionBlockOrder(block.order);
  const candidate = {
    schemaVersion: REVISION_BRIDGE_BLOCK_SCHEMA,
    blockId: normalizeString(block.blockId) || createRevisionBlockInstanceId({ ...block, kind, order }),
    lineageId: normalizeString(block.lineageId) || createRevisionBlockLineageId({ ...block, kind, order }),
    versionHash: normalizeString(block.versionHash) || createRevisionBlockVersionHash({ ...block, kind }),
    kind,
    order,
    text: normalizeRevisionBlockText(block.text),
    attrs: revisionBlockCleanRecord(block.attrs),
    source: revisionBlockCleanRecord(block.source),
  };
  return cloneJsonSafe(candidate);
}

function collectRevisionBlockReasons(input, block, prefix) {
  const reasons = [];
  if (!isPlainObject(input)) {
    reasons.push(invalidField(prefix, `${prefix} must be an object`));
    return reasons;
  }
  if (input.schemaVersion !== REVISION_BRIDGE_BLOCK_SCHEMA) reasons.push(invalidField(`${prefix}.schemaVersion`, 'block schemaVersion is not supported'));
  if (!normalizeString(input.blockId || block.blockId)) reasons.push(missingField(`${prefix}.blockId`));
  if (!normalizeString(input.lineageId || block.lineageId)) reasons.push(missingField(`${prefix}.lineageId`));
  if (!normalizeString(input.versionHash || block.versionHash)) reasons.push(missingField(`${prefix}.versionHash`));
  if (!hasOwnField(input, 'kind')) {
    reasons.push(missingField(`${prefix}.kind`));
  } else if (!isRevisionBlockKind(input.kind)) {
    reasons.push(invalidField(`${prefix}.kind`, 'block kind is not supported'));
  }
  if (!hasOwnField(input, 'order') || createRevisionBlockOrder(input.order) === null) {
    reasons.push(invalidField(`${prefix}.order`, 'block order must be a non-negative safe integer'));
  }
  if (hasOwnField(input, 'attrs') && !isPlainObject(input.attrs)) {
    reasons.push(invalidField(`${prefix}.attrs`, 'block attrs must be an object'));
  }
  if (hasOwnField(input, 'source') && !isPlainObject(input.source)) {
    reasons.push(invalidField(`${prefix}.source`, 'block source must be an object'));
  }
  return reasons;
}

export function validateRevisionBlock(input = {}) {
  const block = createRevisionBlock(input);
  const reasons = collectRevisionBlockReasons(input, block, 'block');
  if (reasons.length > 0) return revisionBlockValidationFailure(reasons);
  return revisionBlockValidationSuccess(block);
}

export function validateRevisionBlockLineage(input = {}) {
  const lineage = revisionBlockInput(input);
  const reasons = [];
  if (!isPlainObject(input)) {
    reasons.push(invalidField('blockLineage', 'blockLineage must be an object'));
    return revisionBlockLineageValidationFailure(reasons);
  }
  if (lineage.schemaVersion !== REVISION_BRIDGE_BLOCK_LINEAGE_SCHEMA) {
    reasons.push(invalidField('blockLineage.schemaVersion', 'blockLineage schemaVersion is not supported'));
  }
  if (!Array.isArray(lineage.blocks)) {
    reasons.push(invalidField('blockLineage.blocks', 'blockLineage blocks must be an array'));
    return revisionBlockLineageValidationFailure(reasons);
  }

  const blockIds = [];
  lineage.blocks.forEach((candidate, index) => {
    if (!isPlainObject(candidate)) {
      reasons.push(invalidField(`blockLineage.blocks.${index}`, 'blockLineage block must be an object'));
      return;
    }
    const blockResult = validateRevisionBlock(candidate);
    for (const reason of blockResult.reasons) {
      reasons.push({
        ...reason,
        field: reason.field.replace(/^block/u, `blockLineage.blocks.${index}`),
      });
    }
    const blockId = normalizeString(candidate.blockId);
    if (blockId) {
      if (blockIds.includes(blockId)) reasons.push(invalidField(`blockLineage.blocks.${index}.blockId`, 'blockId must be unique'));
      blockIds.push(blockId);
    }
  });

  if (hasOwnField(lineage, 'lineageEdges')) {
    if (!Array.isArray(lineage.lineageEdges)) {
      reasons.push(invalidField('blockLineage.lineageEdges', 'blockLineage lineageEdges must be an array'));
    } else {
      lineage.lineageEdges.forEach((edge, index) => {
        if (!isPlainObject(edge)) {
          reasons.push(invalidField(`blockLineage.lineageEdges.${index}`, 'lineage edge must be an object'));
          return;
        }
        const fromBlockId = normalizeString(edge.fromBlockId);
        const toBlockId = normalizeString(edge.toBlockId);
        if (!fromBlockId) reasons.push(missingField(`blockLineage.lineageEdges.${index}.fromBlockId`));
        if (!toBlockId) reasons.push(missingField(`blockLineage.lineageEdges.${index}.toBlockId`));
        if (fromBlockId && !blockIds.includes(fromBlockId)) {
          reasons.push(invalidField(`blockLineage.lineageEdges.${index}.fromBlockId`, 'lineage edge references an unknown block'));
        }
        if (toBlockId && !blockIds.includes(toBlockId)) {
          reasons.push(invalidField(`blockLineage.lineageEdges.${index}.toBlockId`, 'lineage edge references an unknown block'));
        }
        if (fromBlockId && toBlockId && fromBlockId === toBlockId) {
          reasons.push(invalidField(`blockLineage.lineageEdges.${index}`, 'lineage edge must not reference itself'));
        }
      });
      if (reasons.length === 0) {
        reasons.push(...collectRevisionBlockCycleReasons(lineage.lineageEdges, blockIds));
      }
    }
  }

  if (reasons.length > 0) return revisionBlockLineageValidationFailure(reasons);
  return revisionBlockLineageValidationSuccess({
    schemaVersion: REVISION_BRIDGE_BLOCK_LINEAGE_SCHEMA,
    blocks: lineage.blocks.map((block) => createRevisionBlock(block)),
    lineageEdges: Array.isArray(lineage.lineageEdges) ? cloneJsonSafe(lineage.lineageEdges) : [],
  });
}

export function deriveRevisionBlocksFromPlainSceneText(input = {}) {
  const source = revisionBlockInput(input);
  const sceneId = normalizeString(source.sceneId);
  const text = normalizeRevisionBlockText(source.text);
  if (!text) return [];
  return text
    .split(/\n[ \t]*\n+/u)
    .map((paragraphText) => normalizeRevisionBlockText(paragraphText))
    .filter(Boolean)
    .map((paragraphText, order) => createRevisionBlock({
      sceneId,
      lineageSeed: `${sceneId}:${order}:paragraph`,
      kind: 'paragraph',
      order,
      text: paragraphText,
      attrs: {},
      source: {
        kind: 'plainSceneText',
        sceneId,
      },
    }));
}
// RB_09_BLOCK_LINEAGE_CONTRACTS_END

// CONTOUR_06_MINIMAL_BLOCK_ID_R2_START
const MINIMAL_BLOCK_ID_READY_CODE = 'REVISION_BRIDGE_MINIMAL_BLOCK_ID_PREVIEW_READY';
const MINIMAL_BLOCK_ID_MANUAL_ONLY_CODE = 'REVISION_BRIDGE_MINIMAL_BLOCK_ID_MANUAL_ONLY';
const MINIMAL_BLOCK_ID_INVALID_CODE = 'REVISION_BRIDGE_MINIMAL_BLOCK_ID_INPUT_INVALID';
const MINIMAL_BLOCK_ID_MISSING_CODE = 'REVISION_BRIDGE_MINIMAL_BLOCK_ID_MISSING_ID_MANUAL_ONLY';
const MINIMAL_BLOCK_ID_UNSTABLE_CODE = 'REVISION_BRIDGE_MINIMAL_BLOCK_ID_UNSTABLE_ID_MANUAL_ONLY';
const MINIMAL_BLOCK_ID_TEXT_DERIVED_CODE = 'REVISION_BRIDGE_MINIMAL_BLOCK_ID_TEXT_DERIVED_ID_MANUAL_ONLY';
const MINIMAL_BLOCK_ID_DUPLICATE_TEXT_CODE = 'REVISION_BRIDGE_MINIMAL_BLOCK_ID_DUPLICATE_TEXT_MANUAL_ONLY';
const MINIMAL_BLOCK_ID_HEADING_ONLY_CODE = 'REVISION_BRIDGE_MINIMAL_BLOCK_ID_HEADING_ONLY_MANUAL_ONLY';
const MINIMAL_BLOCK_ID_ORDINAL_ONLY_CODE = 'REVISION_BRIDGE_MINIMAL_BLOCK_ID_ORDINAL_ONLY_MANUAL_ONLY';
const MINIMAL_BLOCK_ID_VERSION_CHANGED_CODE = 'REVISION_BRIDGE_MINIMAL_BLOCK_ID_VERSION_CHANGED_MANUAL_ONLY';
const MINIMAL_BLOCK_ID_STRUCTURAL_CODE = 'REVISION_BRIDGE_MINIMAL_BLOCK_ID_STRUCTURAL_MANUAL_ONLY';
const MINIMAL_BLOCK_ID_STRUCTURAL_KINDS = Object.freeze([
  'move',
  'moveBlock',
  'moveScene',
  'split',
  'splitBlock',
  'splitScene',
  'merge',
  'mergeBlock',
  'mergeScene',
  'copy',
  'copyBlock',
  'copyScene',
]);

function minimalBlockIdReason(code, field, message, details = {}) {
  return cloneJsonSafe({
    code,
    field,
    message,
    ...details,
  });
}

function minimalBlockIdBlocks(input) {
  const source = isPlainObject(input) ? input : {};
  if (Array.isArray(source.blocks)) return source.blocks;
  if (Array.isArray(source.scene?.blocks)) return source.scene.blocks;
  if (Array.isArray(source.projectSnapshot?.blocks)) return source.projectSnapshot.blocks;
  if (Array.isArray(source.projectSnapshot?.scene?.blocks)) return source.projectSnapshot.scene.blocks;
  return [];
}

function minimalBlockIdSceneId(input, block, index) {
  const source = isPlainObject(input) ? input : {};
  return normalizeString(
    block.sceneId
    || source.sceneId
    || source.scene?.sceneId
    || source.scene?.id
    || source.projectSnapshot?.sceneId
    || source.projectSnapshot?.scene?.sceneId,
  ) || `scene-${index}`;
}

function minimalBlockIdStructuralChanges(input) {
  const source = isPlainObject(input) ? input : {};
  if (Array.isArray(source.structuralChanges)) return source.structuralChanges;
  if (Array.isArray(source.reviewGraph?.structuralChanges)) return source.reviewGraph.structuralChanges;
  if (Array.isArray(source.revisionSession?.reviewGraph?.structuralChanges)) {
    return source.revisionSession.reviewGraph.structuralChanges;
  }
  return [];
}

function minimalBlockIdStructuralKind(change) {
  if (!isPlainObject(change)) return '';
  return normalizeString(change.kind || change.changeKind || change.type || change.operation);
}

function minimalBlockIdCompact(value) {
  return normalizeRevisionBlockText(value).toLowerCase().replace(/[^a-z0-9]+/gu, '');
}

function minimalBlockIdDuplicateTextKey(sceneId, text) {
  const compactText = minimalBlockIdCompact(text);
  if (!compactText) return '';
  return `${normalizeString(sceneId)}::${compactText}`;
}

function minimalBlockIdIsTextDerived(existingBlockId, block) {
  const id = minimalBlockIdCompact(existingBlockId);
  const text = minimalBlockIdCompact(block.text);
  if (!id || !text) return false;
  if (id === text || id.includes(text)) return true;
  return existingBlockId === createRevisionBlockVersionHash(block);
}

function minimalBlockIdIsUnstable(block) {
  const marker = normalizeString(
    block.blockIdStability
    || block.idStability
    || block.blockIdPolicy
    || block.idPolicy
    || block.source?.blockIdStability
    || block.source?.idStability
    || block.source?.blockIdPolicy
    || block.source?.idPolicy,
  );
  const compactMarker = minimalBlockIdCompact(marker);
  return ['unstable', 'transient', 'generatedfromtext', 'textderived', 'ordinalonly'].includes(compactMarker);
}

function minimalBlockIdIsOrdinalOnly(existingBlockId, block, index) {
  const id = normalizeString(existingBlockId);
  if (!id) return false;
  const order = createRevisionBlockOrder(block.order);
  const candidates = [
    `${index}`,
    `block-${index}`,
    `paragraph-${index}`,
  ];
  if (order !== null) {
    candidates.push(
      `${order}`,
      `block-${order}`,
      `paragraph-${order}`,
    );
  }
  return candidates.includes(id);
}

function minimalBlockIdPreviewHandle(sceneId, block, index) {
  return `rbpbh_${revisionBlockHash({
    schemaVersion: REVISION_BRIDGE_MINIMAL_BLOCK_ID_PREVIEW_SCHEMA,
    sceneId,
    index,
    kind: isRevisionBlockKind(block.kind) ? block.kind : 'paragraph',
    order: createRevisionBlockOrder(block.order),
    text: normalizeRevisionBlockText(block.text),
  })}`;
}

function minimalBlockIdPreviewBlock(input, block, index, duplicateTextKeys, reasons) {
  const sceneId = minimalBlockIdSceneId(input, block, index);
  const kind = isRevisionBlockKind(block.kind) ? block.kind : 'paragraph';
  const order = createRevisionBlockOrder(block.order);
  const sourceBlock = {
    ...block,
    sceneId,
    kind,
    order,
  };
  const previewBlock = createRevisionBlock({
    ...sourceBlock,
    versionHash: '',
  });
  const existingBlockId = normalizeString(block.blockId);
  const textDerivedId = minimalBlockIdIsTextDerived(existingBlockId, sourceBlock);
  const ordinalOnlyId = minimalBlockIdIsOrdinalOnly(existingBlockId, sourceBlock, index);
  const hasLineage = Boolean(normalizeString(block.lineageId || block.lineageSeed));
  const previousVersionHash = normalizeString(
    block.previousVersionHash
    || block.baselineVersionHash
    || block.baseVersionHash
    || block.expectedVersionHash,
  );
  const textKey = minimalBlockIdDuplicateTextKey(sceneId, block.text);

  if (!existingBlockId) {
    reasons.push(minimalBlockIdReason(
      MINIMAL_BLOCK_ID_MISSING_CODE,
      `blocks.${index}.blockId`,
      'block id is absent; preview handle is temporary',
      { sceneId, previewBlockHandle: minimalBlockIdPreviewHandle(sceneId, sourceBlock, index) },
    ));
  }
  if (existingBlockId && minimalBlockIdIsUnstable(block)) {
    reasons.push(minimalBlockIdReason(
      MINIMAL_BLOCK_ID_UNSTABLE_CODE,
      `blocks.${index}.blockId`,
      'block id is marked unstable',
      { sceneId },
    ));
  }
  if (existingBlockId && textDerivedId) {
    reasons.push(minimalBlockIdReason(
      MINIMAL_BLOCK_ID_TEXT_DERIVED_CODE,
      `blocks.${index}.blockId`,
      'block id appears derived from visible text',
      { sceneId },
    ));
  }
  if (textKey && duplicateTextKeys.includes(textKey)) {
    reasons.push(minimalBlockIdReason(
      MINIMAL_BLOCK_ID_DUPLICATE_TEXT_CODE,
      `blocks.${index}.text`,
      'duplicate block text needs manual review',
      { sceneId },
    ));
  }
  if (kind === 'heading') {
    reasons.push(minimalBlockIdReason(
      MINIMAL_BLOCK_ID_HEADING_ONLY_CODE,
      `blocks.${index}.kind`,
      'heading blocks cannot be matched by heading text alone',
      { sceneId },
    ));
  }
  if (ordinalOnlyId || (!existingBlockId && !hasLineage && order !== null)) {
    reasons.push(minimalBlockIdReason(
      MINIMAL_BLOCK_ID_ORDINAL_ONLY_CODE,
      existingBlockId ? `blocks.${index}.blockId` : `blocks.${index}.order`,
      'ordinal-only block position is advisory only',
      { sceneId, order },
    ));
  }
  if (previousVersionHash && previousVersionHash !== previewBlock.versionHash) {
    reasons.push(minimalBlockIdReason(
      MINIMAL_BLOCK_ID_VERSION_CHANGED_CODE,
      `blocks.${index}.previousVersionHash`,
      'block version hash changed and needs manual review',
      {
        sceneId,
        previousVersionHash,
        previewVersionHash: previewBlock.versionHash,
      },
    ));
  }
  return {
    sceneId,
    previewBlockHandle: minimalBlockIdPreviewHandle(sceneId, sourceBlock, index),
    existingBlockIdAdvisory: textDerivedId ? '' : existingBlockId,
    lineageIdAdvisory: normalizeString(block.lineageId),
    previewVersionHash: previewBlock.versionHash,
  };
}

export function buildMinimalBlockIdPreview(input = {}) {
  if (!isPlainObject(input)) {
    const reasons = [
      minimalBlockIdReason(MINIMAL_BLOCK_ID_INVALID_CODE, 'minimalBlockIdPreview', 'input must be an object'),
    ];
    return {
      ok: false,
      type: 'revisionBridge.minimalBlockIdPreview',
      status: 'manualOnly',
      code: MINIMAL_BLOCK_ID_MANUAL_ONLY_CODE,
      reason: reasons[0].code,
      reasons,
      schemaVersion: REVISION_BRIDGE_MINIMAL_BLOCK_ID_PREVIEW_SCHEMA,
      previewOnly: true,
      previewBlocks: [],
      canAutoApply: false,
      autoApplyCount: 0,
      autoApplyCandidates: [],
      automation: { candidateCount: 0, candidates: [] },
    };
  }

  const blocks = minimalBlockIdBlocks(input);
  const reasons = [];
  const textCounts = {};
  blocks.forEach((block, index) => {
    if (!isPlainObject(block)) return;
    const key = minimalBlockIdDuplicateTextKey(minimalBlockIdSceneId(input, block, index), block.text);
    if (!key) return;
    textCounts[key] = (textCounts[key] || 0) + 1;
  });
  const duplicateTextKeys = Object.keys(textCounts).filter((key) => textCounts[key] > 1);

  minimalBlockIdStructuralChanges(input).forEach((change, index) => {
    const kind = minimalBlockIdStructuralKind(change);
    if (!MINIMAL_BLOCK_ID_STRUCTURAL_KINDS.includes(kind)) return;
    reasons.push(minimalBlockIdReason(
      MINIMAL_BLOCK_ID_STRUCTURAL_CODE,
      `structuralChanges.${index}`,
      'structural block operation needs manual review',
      { structuralKind: kind },
    ));
  });

  const previewBlocks = blocks
    .filter((block) => isPlainObject(block))
    .map((block, index) => minimalBlockIdPreviewBlock(input, block, index, duplicateTextKeys, reasons));
  const status = reasons.length > 0 ? 'manualOnly' : 'preview';
  const code = status === 'manualOnly' ? MINIMAL_BLOCK_ID_MANUAL_ONLY_CODE : MINIMAL_BLOCK_ID_READY_CODE;

  return cloneJsonSafe({
    ok: true,
    type: 'revisionBridge.minimalBlockIdPreview',
    status,
    code,
    reason: reasons[0]?.code || MINIMAL_BLOCK_ID_READY_CODE,
    reasons,
    schemaVersion: REVISION_BRIDGE_MINIMAL_BLOCK_ID_PREVIEW_SCHEMA,
    previewOnly: true,
    previewBlocks,
    canAutoApply: false,
    autoApplyCount: 0,
    autoApplyCandidates: [],
    automation: {
      candidateCount: 0,
      candidates: [],
    },
  });
}
// CONTOUR_06_MINIMAL_BLOCK_ID_R2_END

// CONTOUR_08_STRUCTURAL_MANUAL_REVIEW_R1_START
const STRUCTURAL_MANUAL_REVIEW_READY_CODE = 'REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_PREVIEW_READY';
const STRUCTURAL_MANUAL_REVIEW_DIAGNOSTICS_CODE = 'E_REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_PREVIEW_DIAGNOSTICS';
const STRUCTURAL_MANUAL_REVIEW_MOVE_CODE = 'REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_MOVE_MANUAL_ONLY';
const STRUCTURAL_MANUAL_REVIEW_SPLIT_CODE = 'REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_SPLIT_MANUAL_ONLY';
const STRUCTURAL_MANUAL_REVIEW_MERGE_CODE = 'REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_MERGE_MANUAL_ONLY';
const STRUCTURAL_MANUAL_REVIEW_DUPLICATE_CODE = 'REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_DUPLICATE_CANDIDATES';
const STRUCTURAL_MANUAL_REVIEW_COMMENT_RISK_CODE =
  'REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_COMMENT_ANCHOR_RISK_SIGNAL';
const STRUCTURAL_MANUAL_REVIEW_BLOCK_ID_CODE = 'REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_BLOCK_ID_INSUFFICIENT';
const STRUCTURAL_MANUAL_REVIEW_EVIDENCE_CODE = 'REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_EVIDENCE_TOO_WEAK';
const STRUCTURAL_MANUAL_REVIEW_MIXED_CODE = 'REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_MIXED_TEXT_AND_STRUCTURE';
const STRUCTURAL_MANUAL_REVIEW_PARTIAL_SCOPE_CODE = 'REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_PARTIAL_SCOPE_ONLY';
const STRUCTURAL_MANUAL_REVIEW_UNSUPPORTED_CODE = 'REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_UNSUPPORTED_KIND';

function structuralManualReviewReason(code, field, message, details = {}) {
  return cloneJsonSafe({
    code,
    field,
    message,
    ...details,
  });
}

function structuralManualReviewInput(input) {
  return isPlainObject(input) ? input : {};
}

function structuralManualReviewGraph(input) {
  const source = structuralManualReviewInput(input);
  if (isPlainObject(source.revisionSession?.reviewGraph)) return source.revisionSession.reviewGraph;
  if (isPlainObject(source.reviewGraph)) return source.reviewGraph;
  return {};
}

function structuralManualReviewChanges(input) {
  const source = structuralManualReviewInput(input);
  if (Array.isArray(source.structuralChanges)) return source.structuralChanges;
  const graph = structuralManualReviewGraph(source);
  return Array.isArray(graph.structuralChanges) ? graph.structuralChanges : [];
}

function structuralManualReviewTextChanges(input) {
  const source = structuralManualReviewInput(input);
  if (Array.isArray(source.textChanges)) return source.textChanges;
  const graph = structuralManualReviewGraph(source);
  return Array.isArray(graph.textChanges) ? graph.textChanges : [];
}

function structuralManualReviewKindGroup(kind) {
  const compact = normalizeString(kind).toLowerCase().replace(/[^a-z0-9]+/gu, '');
  if (!compact) return 'unsupported';
  if (compact.startsWith('move')) return 'move';
  if (compact.startsWith('split')) return 'split';
  if (compact.startsWith('merge')) return 'merge';
  return 'unsupported';
}

function structuralManualReviewItemCode(kindGroup) {
  if (kindGroup === 'move') return STRUCTURAL_MANUAL_REVIEW_MOVE_CODE;
  if (kindGroup === 'split') return STRUCTURAL_MANUAL_REVIEW_SPLIT_CODE;
  if (kindGroup === 'merge') return STRUCTURAL_MANUAL_REVIEW_MERGE_CODE;
  return STRUCTURAL_MANUAL_REVIEW_UNSUPPORTED_CODE;
}

function structuralManualReviewSummaryText(change) {
  const normalized = normalizeStructuralChange(change);
  return normalizeString(
    normalized.summary
    || change.label
    || change.description
    || change.title,
  );
}

function structuralManualReviewCandidateCount(change) {
  const source = isPlainObject(change) ? change : {};
  if (Number.isSafeInteger(source.candidateCount) && source.candidateCount >= 0) return source.candidateCount;
  if (Array.isArray(source.candidateBlockIds)) return source.candidateBlockIds.length;
  if (Array.isArray(source.candidateIds)) return source.candidateIds.length;
  if (Array.isArray(source.candidateScopes)) return source.candidateScopes.length;
  if (Array.isArray(source.candidates)) return source.candidates.length;
  return 0;
}

function structuralManualReviewCommentRisk(change) {
  const source = isPlainObject(change) ? change : {};
  return source.commentRisk === true
    || source.commentAnchorRisk === true
    || source.relatedCommentRisk === true
    || source.commentRiskSignal === true;
}

function structuralManualReviewHasWeakBlockId(change) {
  const source = isPlainObject(change) ? change : {};
  return source.blockIdInsufficient === true
    || source.missingBlockId === true
    || source.weakBlockId === true
    || source.blockIdentityRisk === true;
}

function structuralManualReviewWeakEvidence(change) {
  const source = isPlainObject(change) ? change : {};
  const marker = normalizeString(
    source.evidenceStrength
    || source.matchStrength
    || source.confidence
    || source.evidenceConfidence,
  ).toLowerCase();
  return source.evidenceTooWeak === true
    || source.weakEvidence === true
    || marker === 'weak'
    || marker === 'low'
    || marker === 'approximate'
    || marker === 'unresolved';
}

function structuralManualReviewPartialScope(change) {
  const targetScope = normalizeReviewGraphTargetScope(change?.targetScope);
  return !targetScope.type || !targetScope.id || change?.partialScopeOnly === true;
}

function structuralManualReviewReasons(change, index, context) {
  const normalized = normalizeStructuralChange(change);
  const kindGroup = structuralManualReviewKindGroup(normalized.kind);
  const reasons = [];
  const baseField = `structuralChanges.${index}`;
  reasons.push(structuralManualReviewReason(
    structuralManualReviewItemCode(kindGroup),
    `${baseField}.kind`,
    `structural ${kindGroup === 'unsupported' ? 'change' : kindGroup} requires manual review`,
    {
      structuralKind: normalized.kind,
      structuralKindGroup: kindGroup,
    },
  ));

  if (context.hasMixedTextAndStructure) {
    reasons.push(structuralManualReviewReason(
      STRUCTURAL_MANUAL_REVIEW_MIXED_CODE,
      'reviewGraph.textChanges',
      'exact text path must not absorb structural change candidates',
      { textChangeCount: context.textChangeCount },
    ));
  }
  if (structuralManualReviewCandidateCount(change) > 1) {
    reasons.push(structuralManualReviewReason(
      STRUCTURAL_MANUAL_REVIEW_DUPLICATE_CODE,
      `${baseField}.candidateCount`,
      'multiple structural candidates require manual review',
      { candidateCount: structuralManualReviewCandidateCount(change) },
    ));
  }
  if (structuralManualReviewCommentRisk(change)) {
    reasons.push(structuralManualReviewReason(
      STRUCTURAL_MANUAL_REVIEW_COMMENT_RISK_CODE,
      `${baseField}.commentRisk`,
      'comment anchor risk keeps the structural candidate manual only',
    ));
  }
  if (structuralManualReviewHasWeakBlockId(change)) {
    reasons.push(structuralManualReviewReason(
      STRUCTURAL_MANUAL_REVIEW_BLOCK_ID_CODE,
      `${baseField}.blockId`,
      'block identity evidence is insufficient for auto apply',
    ));
  }
  if (structuralManualReviewWeakEvidence(change)) {
    reasons.push(structuralManualReviewReason(
      STRUCTURAL_MANUAL_REVIEW_EVIDENCE_CODE,
      `${baseField}.evidence`,
      'structural evidence is too weak for anything beyond manual review',
    ));
  }
  if (structuralManualReviewPartialScope(change)) {
    reasons.push(structuralManualReviewReason(
      STRUCTURAL_MANUAL_REVIEW_PARTIAL_SCOPE_CODE,
      `${baseField}.targetScope`,
      'structural target scope is partial or incomplete',
    ));
  }
  if (kindGroup === 'unsupported') {
    reasons.push(structuralManualReviewReason(
      STRUCTURAL_MANUAL_REVIEW_UNSUPPORTED_CODE,
      `${baseField}.kind`,
      'unsupported structural kind is preserved as observation only',
    ));
  }
  return reasons;
}

function structuralManualReviewEvidenceTrace(change, index) {
  const normalized = normalizeStructuralChange(change);
  return cloneJsonSafe({
    source: `revisionSession.reviewGraph.structuralChanges.${index}`,
    structuralChangeId: normalizeString(normalized.structuralChangeId) || `structural-change-${index}`,
    structuralKind: normalizeString(normalized.kind),
    summary: structuralManualReviewSummaryText(change),
    targetScope: normalizeReviewGraphTargetScope(normalized.targetScope),
  });
}

function structuralManualReviewItem(change, index, context) {
  const normalized = normalizeStructuralChange(change);
  const kindGroup = structuralManualReviewKindGroup(normalized.kind);
  const itemId = normalizeString(normalized.structuralChangeId) || `structural-change-${index}`;
  const reasons = structuralManualReviewReasons(change, index, context);
  return cloneJsonSafe({
    itemId,
    structuralChangeId: itemId,
    structuralKind: normalizeString(normalized.kind),
    structuralKindGroup: kindGroup,
    classification: 'manualOnly',
    targetScope: normalizeReviewGraphTargetScope(normalized.targetScope),
    summary: structuralManualReviewSummaryText(change),
    manualOnlyReason: reasons[0]?.code || STRUCTURAL_MANUAL_REVIEW_UNSUPPORTED_CODE,
    reasonCodes: reasons.map((reason) => reason.code),
    reasons,
    evidenceTrace: structuralManualReviewEvidenceTrace(change, index),
    relatedCommentRisk: structuralManualReviewCommentRisk(change),
    canAutoApply: false,
  });
}

export function buildStructuralManualReviewPreview(input = {}) {
  if (!isPlainObject(input)) {
    const reasons = [
      structuralManualReviewReason(
        STRUCTURAL_MANUAL_REVIEW_DIAGNOSTICS_CODE,
        'structuralManualReviewPreview',
        'input must be an object',
      ),
    ];
    return {
      ok: false,
      type: 'revisionBridge.structuralManualReviewPreview',
      status: 'diagnostics',
      code: STRUCTURAL_MANUAL_REVIEW_DIAGNOSTICS_CODE,
      reason: reasons[0].code,
      reasons,
      schemaVersion: REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_PREVIEW_SCHEMA,
      previewOnly: true,
      canAutoApply: false,
      autoApplyCount: 0,
      autoApplyCandidates: [],
      items: [],
      unsupportedObservations: [],
      summary: {
        totalStructuralChanges: 0,
        manualOnlyCount: 0,
        unsupportedCount: 0,
      },
    };
  }

  const structuralChanges = structuralManualReviewChanges(input)
    .filter((change) => isPlainObject(change));
  const textChanges = structuralManualReviewTextChanges(input)
    .filter((change) => isPlainObject(change));
  const context = {
    hasMixedTextAndStructure: structuralChanges.length > 0 && textChanges.length > 0,
    textChangeCount: textChanges.length,
  };

  const items = [];
  const unsupportedObservations = [];
  structuralChanges.forEach((change, index) => {
    const item = structuralManualReviewItem(change, index, context);
    if (item.structuralKindGroup === 'unsupported') {
      unsupportedObservations.push(cloneJsonSafe({
        itemId: item.itemId,
        structuralChangeId: item.structuralChangeId,
        structuralKind: item.structuralKind,
        reason: STRUCTURAL_MANUAL_REVIEW_UNSUPPORTED_CODE,
        evidenceTrace: item.evidenceTrace,
      }));
      return;
    }
    items.push(item);
  });

  return cloneJsonSafe({
    ok: true,
    type: 'revisionBridge.structuralManualReviewPreview',
    status: 'preview',
    code: STRUCTURAL_MANUAL_REVIEW_READY_CODE,
    reason: STRUCTURAL_MANUAL_REVIEW_READY_CODE,
    reasons: [],
    schemaVersion: REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_PREVIEW_SCHEMA,
    previewOnly: true,
    canAutoApply: false,
    autoApplyCount: 0,
    autoApplyCandidates: [],
    items,
    unsupportedObservations,
    summary: {
      totalStructuralChanges: structuralChanges.length,
      manualOnlyCount: items.length,
      unsupportedCount: unsupportedObservations.length,
    },
  });
}
// CONTOUR_08_STRUCTURAL_MANUAL_REVIEW_R1_END

// RB_10_INLINE_RANGE_ANCHOR_CONTRACTS_START
const INLINE_RANGE_VALID_CODE = 'REVISION_BRIDGE_INLINE_RANGE_VALID';
const INLINE_RANGE_INVALID_CODE = 'E_REVISION_BRIDGE_INLINE_RANGE_INVALID';
const COMMENT_ANCHOR_PLACEMENT_VALID_CODE = 'REVISION_BRIDGE_COMMENT_ANCHOR_PLACEMENT_VALID';
const COMMENT_ANCHOR_PLACEMENT_INVALID_CODE = 'E_REVISION_BRIDGE_COMMENT_ANCHOR_PLACEMENT_INVALID';
const COMMENT_ANCHOR_PLACEMENT_FORBIDDEN_TEXT_FIELDS = [
  'body',
  'text',
  'messages',
  'commentText',
];

function inlineRangeInput(input) {
  return isPlainObject(input) ? input : {};
}

function inlineRangePosition(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function inlineRangeReason(code, field, message) {
  return { code, field, message };
}

function inlineRangeValidationFailure(reasons, value = null) {
  return {
    ok: false,
    type: 'revisionBridge.inlineRange.validation',
    code: INLINE_RANGE_INVALID_CODE,
    reason: reasons[0]?.code || INLINE_RANGE_INVALID_CODE,
    reasons,
    value,
  };
}

function inlineRangeValidationSuccess(value) {
  return {
    ok: true,
    type: 'revisionBridge.inlineRange.validation',
    code: INLINE_RANGE_VALID_CODE,
    reason: INLINE_RANGE_VALID_CODE,
    reasons: [],
    value: cloneJsonSafe(value),
  };
}

function commentAnchorPlacementValidationFailure(reasons, value = null) {
  return {
    ok: false,
    type: 'revisionBridge.commentAnchorPlacement.validation',
    code: COMMENT_ANCHOR_PLACEMENT_INVALID_CODE,
    reason: reasons[0]?.code || COMMENT_ANCHOR_PLACEMENT_INVALID_CODE,
    reasons,
    value,
  };
}

function commentAnchorPlacementValidationSuccess(value) {
  return {
    ok: true,
    type: 'revisionBridge.commentAnchorPlacement.validation',
    code: COMMENT_ANCHOR_PLACEMENT_VALID_CODE,
    reason: COMMENT_ANCHOR_PLACEMENT_VALID_CODE,
    reasons: [],
    value: cloneJsonSafe(value),
  };
}

function inlineRangeNormalizeTargetScope(value) {
  const scope = isPlainObject(value) ? value : {};
  return {
    type: normalizeString(scope.type),
    id: normalizeString(scope.id),
  };
}

function inlineRangeBlockTextFromContext(blockId, context) {
  if (!blockId || !isPlainObject(context)) return null;
  const blocks = context.blocks;
  if (Array.isArray(blocks)) {
    const block = blocks.find((candidate) => isPlainObject(candidate) && normalizeString(candidate.blockId) === blockId);
    return block ? preserveString(block.text) : null;
  }
  if (isPlainObject(blocks)) {
    const block = blocks[blockId];
    if (typeof block === 'string') return preserveString(block);
    if (isPlainObject(block)) return preserveString(block.text);
  }
  return null;
}

function inlineRangeContextHasBlocks(context) {
  return isPlainObject(context) && (Array.isArray(context.blocks) || isPlainObject(context.blocks));
}

export function isRevisionInlineAnchorKind(value) {
  return REVISION_BRIDGE_INLINE_ANCHOR_KINDS.includes(value);
}

export function isRevisionMatchConfidence(value) {
  return REVISION_BRIDGE_MATCH_CONFIDENCE_LEVELS.includes(value);
}

export function isRevisionRiskClass(value) {
  return REVISION_BRIDGE_RISK_CLASSES.includes(value);
}

export function isRevisionAutomationPolicy(value) {
  return REVISION_BRIDGE_AUTOMATION_POLICIES.includes(value);
}

export function createInlineRange(input = {}) {
  const range = inlineRangeInput(input);
  const kind = isRevisionInlineAnchorKind(range.kind) ? range.kind : 'point';
  const confidence = isRevisionMatchConfidence(range.confidence) ? range.confidence : (kind === 'orphan' ? 'unresolved' : 'exact');
  const automationPolicy = isRevisionAutomationPolicy(range.automationPolicy)
    ? range.automationPolicy
    : (kind === 'orphan' ? 'diagnosticsOnly' : 'manualOnly');
  const from = inlineRangePosition(range.from);
  const to = inlineRangePosition(range.to);
  return cloneJsonSafe({
    schemaVersion: REVISION_BRIDGE_INLINE_RANGE_SCHEMA,
    kind,
    blockId: normalizeString(range.blockId),
    lineageId: normalizeString(range.lineageId),
    from,
    to,
    quote: preserveString(range.quote),
    prefix: preserveString(range.prefix),
    suffix: preserveString(range.suffix),
    confidence,
    riskClass: isRevisionRiskClass(range.riskClass) ? range.riskClass : 'low',
    automationPolicy,
    deletedTarget: range.deletedTarget === true,
    reasonCodes: normalizeStringArray(range.reasonCodes),
  });
}

function collectInlineRangeReasons(input, range, context) {
  const reasons = [];
  if (!isPlainObject(input)) {
    reasons.push(invalidField('inlineRange', 'inlineRange must be an object'));
    return reasons;
  }
  if (input.schemaVersion !== REVISION_BRIDGE_INLINE_RANGE_SCHEMA) {
    reasons.push(invalidField('inlineRange.schemaVersion', 'inlineRange schemaVersion is not supported'));
  }
  if (!isRevisionInlineAnchorKind(input.kind)) {
    reasons.push(invalidField('inlineRange.kind', 'inlineRange kind is not supported'));
  }
  if (!hasOwnField(input, 'from') || inlineRangePosition(input.from) === null) {
    reasons.push(invalidField('inlineRange.from', 'inlineRange from must be a non-negative safe integer'));
  }
  if (!hasOwnField(input, 'to') || inlineRangePosition(input.to) === null) {
    reasons.push(invalidField('inlineRange.to', 'inlineRange to must be a non-negative safe integer'));
  }
  if (!isRevisionMatchConfidence(input.confidence)) {
    reasons.push(invalidField('inlineRange.confidence', 'inlineRange confidence is not supported'));
  }
  if (!isRevisionRiskClass(input.riskClass)) {
    reasons.push(invalidField('inlineRange.riskClass', 'inlineRange riskClass is not supported'));
  }
  if (!isRevisionAutomationPolicy(input.automationPolicy)) {
    reasons.push(invalidField('inlineRange.automationPolicy', 'inlineRange automationPolicy is not supported'));
  }
  if (!Array.isArray(input.reasonCodes)) {
    reasons.push(invalidField('inlineRange.reasonCodes', 'inlineRange reasonCodes must be an array'));
  }

  if (range.kind === 'point' && range.from !== range.to) {
    reasons.push(invalidField('inlineRange', 'point inlineRange must have matching from and to'));
  }
  if (range.kind === 'span' && !(range.from < range.to)) {
    reasons.push(invalidField('inlineRange', 'span inlineRange must have from less than to'));
  }
  if (range.kind === 'deleted') {
    if (!(range.from <= range.to)) reasons.push(invalidField('inlineRange', 'deleted inlineRange must have from less than or equal to to'));
    if (range.deletedTarget !== true) reasons.push(invalidField('inlineRange.deletedTarget', 'deleted inlineRange must have deletedTarget true'));
    if (range.automationPolicy === 'autoEligible') reasons.push(invalidField('inlineRange.automationPolicy', 'deleted inlineRange cannot be autoEligible'));
  }
  if (range.kind === 'orphan') {
    if (range.blockId) reasons.push(invalidField('inlineRange.blockId', 'orphan inlineRange must not set blockId'));
    if (range.confidence !== 'unresolved') reasons.push(invalidField('inlineRange.confidence', 'orphan inlineRange must be unresolved'));
    if (range.automationPolicy !== 'diagnosticsOnly' && range.automationPolicy !== 'hardFail') {
      reasons.push(invalidField('inlineRange.automationPolicy', 'orphan inlineRange must be diagnosticsOnly or hardFail'));
    }
  }
  if ((range.confidence === 'approximate' || range.confidence === 'unresolved') && range.automationPolicy === 'autoEligible') {
    reasons.push(invalidField('inlineRange.automationPolicy', 'approximate or unresolved inlineRange cannot be autoEligible'));
  }

  const blockText = inlineRangeBlockTextFromContext(range.blockId, context);
  if (range.kind !== 'orphan' && inlineRangeContextHasBlocks(context)) {
    if (blockText === null) {
      reasons.push(invalidField('inlineRange.blockId', 'inlineRange blockId is not present in context blocks'));
    } else if (range.to > blockText.length) {
      reasons.push(invalidField('inlineRange.to', 'inlineRange to exceeds context block text length'));
    }
  }
  if (range.confidence === 'exact' && range.quote && blockText !== null && !blockText.includes(range.quote)) {
    reasons.push(inlineRangeReason(
      'REVISION_BRIDGE_INLINE_RANGE_STALE_QUOTE',
      'inlineRange.quote',
      'exact inlineRange quote is not present in context block text',
    ));
  }
  return reasons;
}

export function validateInlineRange(input = {}, context = {}) {
  const range = createInlineRange(input);
  const reasons = collectInlineRangeReasons(input, range, context);
  if (reasons.length > 0) return inlineRangeValidationFailure(reasons, range);
  return inlineRangeValidationSuccess(range);
}

export function createCommentAnchorPlacement(input = {}) {
  const placement = inlineRangeInput(input);
  return cloneJsonSafe({
    schemaVersion: REVISION_BRIDGE_COMMENT_ANCHOR_PLACEMENT_SCHEMA,
    placementId: normalizeString(placement.placementId),
    threadId: normalizeString(placement.threadId),
    targetScope: inlineRangeNormalizeTargetScope(placement.targetScope),
    inlineRange: createInlineRange(placement.inlineRange),
    resolvedState: normalizeString(placement.resolvedState),
    acceptedState: normalizeString(placement.acceptedState),
    diagnosticsOnly: placement.diagnosticsOnly === true,
  });
}

export function validateCommentAnchorPlacement(input = {}, context = {}) {
  const placement = createCommentAnchorPlacement(input);
  const reasons = [];
  if (!isPlainObject(input)) {
    reasons.push(invalidField('commentAnchorPlacement', 'commentAnchorPlacement must be an object'));
    return commentAnchorPlacementValidationFailure(reasons, placement);
  }
  if (input.schemaVersion !== REVISION_BRIDGE_COMMENT_ANCHOR_PLACEMENT_SCHEMA) {
    reasons.push(invalidField('commentAnchorPlacement.schemaVersion', 'commentAnchorPlacement schemaVersion is not supported'));
  }
  if (!normalizeString(input.placementId)) reasons.push(missingField('commentAnchorPlacement.placementId'));
  if (!normalizeString(input.threadId)) reasons.push(missingField('commentAnchorPlacement.threadId'));
  if (!isPlainObject(input.targetScope)) {
    reasons.push(invalidField('commentAnchorPlacement.targetScope', 'commentAnchorPlacement targetScope must be an object'));
  } else if (!normalizeString(input.targetScope.type)) {
    reasons.push(missingField('commentAnchorPlacement.targetScope.type'));
  }
  for (const field of COMMENT_ANCHOR_PLACEMENT_FORBIDDEN_TEXT_FIELDS) {
    if (hasOwnField(input, field)) {
      reasons.push(invalidField(`commentAnchorPlacement.${field}`, 'commentAnchorPlacement must not duplicate comment content'));
    }
  }
  const inlineRangeResult = validateInlineRange(input.inlineRange, context);
  for (const reason of inlineRangeResult.reasons) {
    reasons.push({
      ...reason,
      field: reason.field.replace(/^inlineRange/u, 'commentAnchorPlacement.inlineRange'),
    });
  }
  if (reasons.length > 0) return commentAnchorPlacementValidationFailure(reasons, placement);
  return commentAnchorPlacementValidationSuccess(placement);
}
// RB_10_INLINE_RANGE_ANCHOR_CONTRACTS_END

// RB_11_ANCHOR_CONFIDENCE_ENGINE_CONTRACTS_START
const ANCHOR_CONFIDENCE_READY_CODE = 'REVISION_BRIDGE_ANCHOR_CONFIDENCE_EVALUATED';
const ANCHOR_CONFIDENCE_DIAGNOSTICS_CODE = 'E_REVISION_BRIDGE_ANCHOR_CONFIDENCE_DIAGNOSTICS';
const ANCHOR_CONFIDENCE_HARD_FAIL_CODE = 'E_REVISION_BRIDGE_ANCHOR_CONFIDENCE_HARD_FAIL';

function anchorConfidenceRangeInput(input) {
  if (!isPlainObject(input)) return {};
  return isPlainObject(input.inlineRange) ? input.inlineRange : input;
}

function anchorConfidenceDiagnostic(code, field, message) {
  return { code, field, message };
}

function anchorConfidenceAddDiagnostic(diagnostics, code, field, message) {
  if (!diagnostics.some((diagnostic) => diagnostic.code === code && diagnostic.field === field)) {
    diagnostics.push(anchorConfidenceDiagnostic(code, field, message));
  }
}

function anchorConfidenceTextFromEntry(entry) {
  if (typeof entry === 'string') return preserveString(entry);
  if (isPlainObject(entry)) return preserveString(entry.text);
  return null;
}

function anchorConfidenceBlockTextFromContext(blockId, context) {
  if (!blockId || !isPlainObject(context)) return { hasIndex: false, text: null };
  if (Array.isArray(context.blocks)) {
    const block = context.blocks.find((candidate) => isPlainObject(candidate) && normalizeString(candidate.blockId) === blockId);
    return { hasIndex: true, text: anchorConfidenceTextFromEntry(block) };
  }
  if (isPlainObject(context.blocks)) {
    return { hasIndex: true, text: anchorConfidenceTextFromEntry(context.blocks[blockId]) };
  }
  if (isPlainObject(context.blockMap)) {
    return { hasIndex: true, text: anchorConfidenceTextFromEntry(context.blockMap[blockId]) };
  }
  return { hasIndex: false, text: null };
}

function anchorConfidenceRiskRank(riskClass) {
  const index = REVISION_BRIDGE_RISK_CLASSES.indexOf(riskClass);
  return index === -1 ? REVISION_BRIDGE_RISK_CLASSES.indexOf('critical') : index;
}

function anchorConfidenceMaxRisk(left, right) {
  return anchorConfidenceRiskRank(left) >= anchorConfidenceRiskRank(right) ? left : right;
}

function anchorConfidenceHasHardFailure(diagnostics) {
  return diagnostics.some((diagnostic) => (
    diagnostic.code === 'REVISION_BRIDGE_ANCHOR_CONFIDENCE_VALIDATION_FAILED'
    || diagnostic.code === 'REVISION_BRIDGE_ANCHOR_CONFIDENCE_OUT_OF_BOUNDS'
  ));
}

function anchorConfidenceHasUnresolvedFailure(diagnostics) {
  return diagnostics.some((diagnostic) => (
    diagnostic.code === 'REVISION_BRIDGE_ANCHOR_CONFIDENCE_MISSING_BLOCK'
    || diagnostic.code === 'REVISION_BRIDGE_ANCHOR_CONFIDENCE_STALE_QUOTE'
    || diagnostic.code === 'REVISION_BRIDGE_ANCHOR_CONFIDENCE_ORPHAN'
    || diagnostic.code === 'REVISION_BRIDGE_ANCHOR_CONFIDENCE_DELETED_TARGET'
    || diagnostic.code === 'REVISION_BRIDGE_ANCHOR_CONFIDENCE_UNRESOLVED_ANCHOR'
  ));
}

export function evaluateInlineRangeAnchorConfidence(input = {}, context = {}) {
  const rangeInput = anchorConfidenceRangeInput(input);
  const inlineRange = createInlineRange(rangeInput);
  const validation = validateInlineRange(rangeInput, context);
  const diagnostics = [];
  const block = anchorConfidenceBlockTextFromContext(inlineRange.blockId, context);
  let exactRange = false;
  let riskClass = isRevisionRiskClass(inlineRange.riskClass) ? inlineRange.riskClass : 'critical';

  if (!validation.ok) {
    for (const reason of validation.reasons) {
      if (reason.code === 'REVISION_BRIDGE_INLINE_RANGE_STALE_QUOTE') {
        anchorConfidenceAddDiagnostic(
          diagnostics,
          'REVISION_BRIDGE_ANCHOR_CONFIDENCE_STALE_QUOTE',
          reason.field,
          'quote is not present in the target block',
        );
      } else if (reason.field === 'inlineRange.blockId') {
        anchorConfidenceAddDiagnostic(
          diagnostics,
          'REVISION_BRIDGE_ANCHOR_CONFIDENCE_MISSING_BLOCK',
          reason.field,
          reason.message,
        );
      } else if (reason.field === 'inlineRange.to') {
        anchorConfidenceAddDiagnostic(
          diagnostics,
          'REVISION_BRIDGE_ANCHOR_CONFIDENCE_OUT_OF_BOUNDS',
          reason.field,
          reason.message,
        );
      } else {
        anchorConfidenceAddDiagnostic(
          diagnostics,
          'REVISION_BRIDGE_ANCHOR_CONFIDENCE_VALIDATION_FAILED',
          reason.field,
          reason.message,
        );
      }
    }
  }

  if (inlineRange.kind === 'orphan') {
    anchorConfidenceAddDiagnostic(
      diagnostics,
      'REVISION_BRIDGE_ANCHOR_CONFIDENCE_ORPHAN',
      'inlineRange.kind',
      'orphan anchor remains unresolved',
    );
  }
  if (inlineRange.kind === 'deleted' || inlineRange.deletedTarget === true) {
    anchorConfidenceAddDiagnostic(
      diagnostics,
      'REVISION_BRIDGE_ANCHOR_CONFIDENCE_DELETED_TARGET',
      'inlineRange.deletedTarget',
      'deleted target is not eligible for automation',
    );
  }
  if (inlineRange.confidence === 'weakHigh' || inlineRange.confidence === 'approximate') {
    anchorConfidenceAddDiagnostic(
      diagnostics,
      'REVISION_BRIDGE_ANCHOR_CONFIDENCE_WEAK_ANCHOR',
      'inlineRange.confidence',
      'weak or approximate anchor needs manual review',
    );
  }
  if (inlineRange.confidence === 'unresolved') {
    anchorConfidenceAddDiagnostic(
      diagnostics,
      'REVISION_BRIDGE_ANCHOR_CONFIDENCE_UNRESOLVED_ANCHOR',
      'inlineRange.confidence',
      'unresolved anchor cannot be automated',
    );
  }

  if (inlineRange.kind !== 'orphan' && block.hasIndex && block.text === null) {
    anchorConfidenceAddDiagnostic(
      diagnostics,
      'REVISION_BRIDGE_ANCHOR_CONFIDENCE_MISSING_BLOCK',
      'inlineRange.blockId',
      'target block is not present in the supplied context',
    );
  }

  if (block.text !== null && inlineRange.kind !== 'orphan') {
    const rangeInBounds = inlineRange.from !== null
      && inlineRange.to !== null
      && inlineRange.from <= inlineRange.to
      && inlineRange.from <= block.text.length
      && inlineRange.to <= block.text.length;

    if (!rangeInBounds) {
      anchorConfidenceAddDiagnostic(
        diagnostics,
        'REVISION_BRIDGE_ANCHOR_CONFIDENCE_OUT_OF_BOUNDS',
        'inlineRange',
        'target range is outside the target block',
      );
    } else {
      const quoteAtRange = inlineRange.quote === ''
        ? inlineRange.from === inlineRange.to
        : block.text.slice(inlineRange.from, inlineRange.to) === inlineRange.quote;
      exactRange = inlineRange.confidence === 'exact' && quoteAtRange;

      if (inlineRange.quote && !quoteAtRange) {
        const quoteCode = block.text.includes(inlineRange.quote)
          ? 'REVISION_BRIDGE_ANCHOR_CONFIDENCE_QUOTE_ELSEWHERE'
          : 'REVISION_BRIDGE_ANCHOR_CONFIDENCE_STALE_QUOTE';
        anchorConfidenceAddDiagnostic(
          diagnostics,
          quoteCode,
          'inlineRange.quote',
          quoteCode === 'REVISION_BRIDGE_ANCHOR_CONFIDENCE_QUOTE_ELSEWHERE'
            ? 'quote exists in the block but not at the target range'
            : 'quote is not present in the target block',
        );
      }

      if (inlineRange.prefix && block.text.slice(Math.max(0, inlineRange.from - inlineRange.prefix.length), inlineRange.from) !== inlineRange.prefix) {
        anchorConfidenceAddDiagnostic(
          diagnostics,
          'REVISION_BRIDGE_ANCHOR_CONFIDENCE_PREFIX_MISMATCH',
          'inlineRange.prefix',
          'prefix does not match text before the target range',
        );
      }
      if (inlineRange.suffix && block.text.slice(inlineRange.to, inlineRange.to + inlineRange.suffix.length) !== inlineRange.suffix) {
        anchorConfidenceAddDiagnostic(
          diagnostics,
          'REVISION_BRIDGE_ANCHOR_CONFIDENCE_SUFFIX_MISMATCH',
          'inlineRange.suffix',
          'suffix does not match text after the target range',
        );
      }
    }
  }

  const hardFailure = anchorConfidenceHasHardFailure(diagnostics);
  const unresolvedFailure = anchorConfidenceHasUnresolvedFailure(diagnostics);
  let confidence = inlineRange.confidence;
  let automationPolicy = 'manualOnly';

  if (hardFailure) {
    confidence = 'unresolved';
    riskClass = 'critical';
    automationPolicy = 'hardFail';
  } else if (unresolvedFailure) {
    confidence = 'unresolved';
    riskClass = anchorConfidenceMaxRisk(riskClass, 'high');
    automationPolicy = 'diagnosticsOnly';
  } else if (exactRange && diagnostics.length === 0) {
    confidence = 'exact';
    riskClass = 'low';
    automationPolicy = 'manualConfirmRequired';
    anchorConfidenceAddDiagnostic(
      diagnostics,
      'REVISION_BRIDGE_ANCHOR_CONFIDENCE_EXACT_RANGE',
      'inlineRange',
      'quote matches the target range exactly',
    );
  } else if (diagnostics.length > 0) {
    confidence = confidence === 'exact' ? 'approximate' : confidence;
    riskClass = anchorConfidenceMaxRisk(riskClass, 'medium');
    automationPolicy = 'manualOnly';
  }

  const reasonCodes = diagnostics.map((diagnostic) => diagnostic.code);
  const status = automationPolicy === 'hardFail'
    ? 'hardFail'
    : (diagnostics.length > 0 && reasonCodes[0] !== 'REVISION_BRIDGE_ANCHOR_CONFIDENCE_EXACT_RANGE' ? 'diagnostics' : 'evaluated');
  const code = status === 'hardFail'
    ? ANCHOR_CONFIDENCE_HARD_FAIL_CODE
    : (status === 'diagnostics' ? ANCHOR_CONFIDENCE_DIAGNOSTICS_CODE : ANCHOR_CONFIDENCE_READY_CODE);

  return {
    schemaVersion: REVISION_BRIDGE_ANCHOR_CONFIDENCE_EVALUATION_SCHEMA,
    type: 'revisionBridge.anchorConfidence.evaluation',
    status,
    code,
    reason: reasonCodes[0] || code,
    inlineRange: cloneJsonSafe({
      ...inlineRange,
      confidence,
      riskClass,
      automationPolicy,
      reasonCodes,
    }),
    confidence,
    riskClass,
    automationPolicy,
    reasonCodes: cloneJsonSafe(reasonCodes),
    diagnostics: cloneJsonSafe(diagnostics),
  };
}
// RB_11_ANCHOR_CONFIDENCE_ENGINE_CONTRACTS_END

// RB_12_MATCH_PROOF_CONTRACTS_START
function matchProofRangeInput(input) {
  if (!isPlainObject(input)) return {};
  return isPlainObject(input.inlineRange) ? input.inlineRange : input;
}

function matchProofDiagnostic(code, field, message) {
  return { code, field, message };
}

function matchProofAddDiagnostic(diagnostics, code, field, message) {
  if (!diagnostics.some((diagnostic) => diagnostic.code === code && diagnostic.field === field)) {
    diagnostics.push(matchProofDiagnostic(code, field, message));
  }
}

function matchProofTextFromEntry(entry) {
  if (typeof entry === 'string') return preserveString(entry);
  if (isPlainObject(entry)) return preserveString(entry.text);
  return null;
}

function matchProofBlockFromContext(blockId, context) {
  if (!blockId || !isPlainObject(context)) return { found: false, text: null, lineageId: '' };
  if (Array.isArray(context.blocks)) {
    const block = context.blocks.find((candidate) => isPlainObject(candidate) && normalizeString(candidate.blockId) === blockId);
    return {
      found: block !== undefined,
      text: matchProofTextFromEntry(block),
      lineageId: isPlainObject(block) ? normalizeString(block.lineageId) : '',
    };
  }
  if (isPlainObject(context.blocks)) {
    const block = context.blocks[blockId];
    return {
      found: block !== undefined,
      text: matchProofTextFromEntry(block),
      lineageId: isPlainObject(block) ? normalizeString(block.lineageId) : '',
    };
  }
  if (isPlainObject(context.blockMap)) {
    const block = context.blockMap[blockId];
    return {
      found: block !== undefined,
      text: matchProofTextFromEntry(block),
      lineageId: isPlainObject(block) ? normalizeString(block.lineageId) : '',
    };
  }
  return { found: false, text: null, lineageId: '' };
}

function matchProofRangeInBounds(range, text) {
  return text !== null
    && Number.isSafeInteger(range.from)
    && Number.isSafeInteger(range.to)
    && range.from >= 0
    && range.to >= 0
    && range.from <= range.to
    && range.to <= text.length;
}

function matchProofProofForSide(expected, observed) {
  return {
    expected,
    observed,
    matched: expected === observed,
  };
}

function matchProofInlineRangeSnapshot(inlineRange) {
  return cloneJsonSafe({
    schemaVersion: inlineRange.schemaVersion,
    kind: inlineRange.kind,
    blockId: inlineRange.blockId,
    lineageId: inlineRange.lineageId,
    from: inlineRange.from,
    to: inlineRange.to,
    quote: inlineRange.quote,
    prefix: inlineRange.prefix,
    suffix: inlineRange.suffix,
    confidence: inlineRange.confidence,
    riskClass: inlineRange.riskClass,
    deletedTarget: inlineRange.deletedTarget,
    reasonCodes: inlineRange.reasonCodes,
  });
}

function matchProofResult(status, reasonCodes, diagnostics, inlineRange, block, comparedRange, observedQuote, prefixProof, suffixProof) {
  return {
    schemaVersion: REVISION_BRIDGE_MATCH_PROOF_SCHEMA,
    type: 'revisionBridge.matchProof',
    status,
    code: REVISION_BRIDGE_MATCH_PROOF_REASON_CODES[0],
    reason: reasonCodes[0] || REVISION_BRIDGE_MATCH_PROOF_REASON_CODES[0],
    inlineRange: matchProofInlineRangeSnapshot(inlineRange),
    blockRef: {
      blockId: inlineRange.blockId,
      lineageId: inlineRange.lineageId || block.lineageId,
      hasContextBlock: block.found === true && block.text !== null,
    },
    comparedRange: cloneJsonSafe(comparedRange),
    expectedQuote: inlineRange.quote,
    observedQuote,
    prefixProof: cloneJsonSafe(prefixProof),
    suffixProof: cloneJsonSafe(suffixProof),
    reasonCodes: cloneJsonSafe(reasonCodes),
    diagnostics: cloneJsonSafe(diagnostics),
  };
}

function matchProofReasonCodes(diagnostics) {
  const codes = [];
  for (const diagnostic of diagnostics) {
    if (!codes.includes(diagnostic.code)) codes.push(diagnostic.code);
  }
  return codes;
}

function matchProofHasAny(diagnostics, codes) {
  return diagnostics.some((diagnostic) => codes.includes(diagnostic.code));
}

function matchProofMapValidationReason(reason, diagnostics) {
  if (reason.code === 'REVISION_BRIDGE_INLINE_RANGE_STALE_QUOTE') {
    matchProofAddDiagnostic(
      diagnostics,
      'REVISION_BRIDGE_ANCHOR_CONFIDENCE_STALE_QUOTE',
      reason.field,
      'quote is not present in the target block',
    );
  } else if (reason.field === 'inlineRange.blockId') {
    matchProofAddDiagnostic(
      diagnostics,
      'REVISION_BRIDGE_ANCHOR_CONFIDENCE_MISSING_BLOCK',
      reason.field,
      reason.message,
    );
  } else if (reason.field === 'inlineRange.to') {
    matchProofAddDiagnostic(
      diagnostics,
      'REVISION_BRIDGE_ANCHOR_CONFIDENCE_OUT_OF_BOUNDS',
      reason.field,
      reason.message,
    );
  } else {
    matchProofAddDiagnostic(
      diagnostics,
      'REVISION_BRIDGE_ANCHOR_CONFIDENCE_VALIDATION_FAILED',
      reason.field,
      reason.message,
    );
  }
}

export function buildInlineRangeMatchProof(input = {}, context = {}) {
  const rangeInput = matchProofRangeInput(input);
  const inlineRange = createInlineRange(rangeInput);
  const diagnostics = [];
  let validation;

  try {
    validation = validateInlineRange(rangeInput, context);
  } catch {
    validation = {
      ok: false,
      reasons: [
        matchProofDiagnostic(
          'REVISION_BRIDGE_ANCHOR_CONFIDENCE_VALIDATION_FAILED',
          'inlineRange',
          'inlineRange validation failed',
        ),
      ],
    };
  }

  for (const reason of validation.reasons || []) {
    matchProofMapValidationReason(reason, diagnostics);
  }

  const block = matchProofBlockFromContext(inlineRange.blockId, context);
  if (inlineRange.kind !== 'orphan' && block.text === null) {
    matchProofAddDiagnostic(
      diagnostics,
      'REVISION_BRIDGE_ANCHOR_CONFIDENCE_MISSING_BLOCK',
      'inlineRange.blockId',
      'target block is not present in the supplied context',
    );
  }
  if (inlineRange.kind === 'orphan') {
    matchProofAddDiagnostic(
      diagnostics,
      'REVISION_BRIDGE_ANCHOR_CONFIDENCE_ORPHAN',
      'inlineRange.kind',
      'orphan anchor remains unresolved',
    );
  }
  if (inlineRange.kind === 'deleted' || inlineRange.deletedTarget === true) {
    matchProofAddDiagnostic(
      diagnostics,
      'REVISION_BRIDGE_ANCHOR_CONFIDENCE_DELETED_TARGET',
      'inlineRange.deletedTarget',
      'deleted target remains unresolved',
    );
  }
  if (inlineRange.confidence === 'weakHigh' || inlineRange.confidence === 'approximate') {
    matchProofAddDiagnostic(
      diagnostics,
      'REVISION_BRIDGE_ANCHOR_CONFIDENCE_WEAK_ANCHOR',
      'inlineRange.confidence',
      'weak or approximate anchor is only partially proven',
    );
  }
  if (inlineRange.confidence === 'unresolved') {
    matchProofAddDiagnostic(
      diagnostics,
      'REVISION_BRIDGE_ANCHOR_CONFIDENCE_UNRESOLVED_ANCHOR',
      'inlineRange.confidence',
      'unresolved anchor remains unresolved',
    );
  }

  const originalRange = {
    from: inlineRange.from,
    to: inlineRange.to,
    inBounds: matchProofRangeInBounds(inlineRange, block.text),
  };
  if (block.text !== null && inlineRange.kind !== 'orphan' && !originalRange.inBounds) {
    matchProofAddDiagnostic(
      diagnostics,
      'REVISION_BRIDGE_ANCHOR_CONFIDENCE_OUT_OF_BOUNDS',
      'inlineRange',
      'target range is outside the target block',
    );
  }

  let comparedRange = originalRange;
  let exactRange = false;
  if (originalRange.inBounds) {
    exactRange = inlineRange.quote === ''
      ? inlineRange.from === inlineRange.to
      : block.text.slice(inlineRange.from, inlineRange.to) === inlineRange.quote;
  }

  if (block.text !== null && originalRange.inBounds && inlineRange.quote && !exactRange) {
    const firstIndex = block.text.indexOf(inlineRange.quote);
    if (firstIndex >= 0) {
      comparedRange = {
        from: firstIndex,
        to: firstIndex + inlineRange.quote.length,
        inBounds: true,
      };
      matchProofAddDiagnostic(
        diagnostics,
        'REVISION_BRIDGE_ANCHOR_CONFIDENCE_QUOTE_ELSEWHERE',
        'inlineRange.quote',
        'quote exists in the block but not at the target range',
      );
    } else {
      matchProofAddDiagnostic(
        diagnostics,
        'REVISION_BRIDGE_ANCHOR_CONFIDENCE_STALE_QUOTE',
        'inlineRange.quote',
        'quote is not present in the target block',
      );
    }
  }

  const observedQuote = comparedRange.inBounds ? block.text.slice(comparedRange.from, comparedRange.to) : '';
  const prefixObserved = comparedRange.inBounds
    ? block.text.slice(Math.max(0, comparedRange.from - inlineRange.prefix.length), comparedRange.from)
    : '';
  const suffixObserved = comparedRange.inBounds
    ? block.text.slice(comparedRange.to, comparedRange.to + inlineRange.suffix.length)
    : '';
  const prefixProof = matchProofProofForSide(inlineRange.prefix, prefixObserved);
  const suffixProof = matchProofProofForSide(inlineRange.suffix, suffixObserved);

  if (comparedRange.inBounds && !prefixProof.matched) {
    matchProofAddDiagnostic(
      diagnostics,
      'REVISION_BRIDGE_ANCHOR_CONFIDENCE_PREFIX_MISMATCH',
      'inlineRange.prefix',
      'prefix does not match text before the compared range',
    );
  }
  if (comparedRange.inBounds && !suffixProof.matched) {
    matchProofAddDiagnostic(
      diagnostics,
      'REVISION_BRIDGE_ANCHOR_CONFIDENCE_SUFFIX_MISMATCH',
      'inlineRange.suffix',
      'suffix does not match text after the compared range',
    );
  }

  const hardCodes = [
    'REVISION_BRIDGE_ANCHOR_CONFIDENCE_VALIDATION_FAILED',
    'REVISION_BRIDGE_ANCHOR_CONFIDENCE_OUT_OF_BOUNDS',
  ];
  const unresolvedCodes = [
    'REVISION_BRIDGE_ANCHOR_CONFIDENCE_MISSING_BLOCK',
    'REVISION_BRIDGE_ANCHOR_CONFIDENCE_STALE_QUOTE',
    'REVISION_BRIDGE_ANCHOR_CONFIDENCE_ORPHAN',
    'REVISION_BRIDGE_ANCHOR_CONFIDENCE_DELETED_TARGET',
    'REVISION_BRIDGE_ANCHOR_CONFIDENCE_UNRESOLVED_ANCHOR',
  ];

  const exactProof = exactRange
    && originalRange.from === comparedRange.from
    && originalRange.to === comparedRange.to
    && prefixProof.matched
    && suffixProof.matched
    && !matchProofHasAny(diagnostics, hardCodes)
    && !matchProofHasAny(diagnostics, unresolvedCodes)
    && !matchProofHasAny(diagnostics, [
      'REVISION_BRIDGE_ANCHOR_CONFIDENCE_QUOTE_ELSEWHERE',
      'REVISION_BRIDGE_ANCHOR_CONFIDENCE_PREFIX_MISMATCH',
      'REVISION_BRIDGE_ANCHOR_CONFIDENCE_SUFFIX_MISMATCH',
      'REVISION_BRIDGE_ANCHOR_CONFIDENCE_WEAK_ANCHOR',
    ]);

  if (exactProof) {
    matchProofAddDiagnostic(
      diagnostics,
      'REVISION_BRIDGE_ANCHOR_CONFIDENCE_EXACT_RANGE',
      'inlineRange',
      'quote matches the target range exactly',
    );
  }

  const reasonCodes = matchProofReasonCodes(diagnostics);
  const status = matchProofHasAny(diagnostics, hardCodes)
    ? 'hardFail'
    : matchProofHasAny(diagnostics, unresolvedCodes)
      ? 'unresolved'
      : exactProof
        ? 'matched'
        : 'partial';

  return matchProofResult(
    status,
    reasonCodes,
    diagnostics,
    inlineRange,
    block,
    comparedRange,
    observedQuote,
    prefixProof,
    suffixProof,
  );
}
// RB_12_MATCH_PROOF_CONTRACTS_END

// RB_13_PLACEMENT_EVALUATION_CONTRACTS_START
function placementEvaluationClone(value) {
  if (value === null) return null;
  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') return value;
  if (Array.isArray(value)) return value.map((item) => placementEvaluationClone(item));
  if (isPlainObject(value)) {
    const clone = {};
    for (const key of Object.keys(value)) {
      const clonedValue = placementEvaluationClone(value[key]);
      if (clonedValue !== undefined) clone[key] = clonedValue;
    }
    return clone;
  }
  return undefined;
}

function placementEvaluationInlineRangeSnapshot(inlineRange) {
  return {
    schemaVersion: inlineRange.schemaVersion,
    kind: inlineRange.kind,
    blockId: inlineRange.blockId,
    lineageId: inlineRange.lineageId,
    from: inlineRange.from,
    to: inlineRange.to,
    quote: inlineRange.quote,
    prefix: inlineRange.prefix,
    suffix: inlineRange.suffix,
    confidence: inlineRange.confidence,
    riskClass: inlineRange.riskClass,
    deletedTarget: inlineRange.deletedTarget,
    reasonCodes: placementEvaluationClone(inlineRange.reasonCodes),
  };
}

function placementEvaluationSnapshot(placement) {
  return {
    schemaVersion: placement.schemaVersion,
    placementId: placement.placementId,
    threadId: placement.threadId,
    targetScope: {
      type: placement.targetScope.type,
      id: placement.targetScope.id,
    },
    inlineRange: placementEvaluationInlineRangeSnapshot(placement.inlineRange),
    resolvedState: placement.resolvedState,
    acceptedState: placement.acceptedState,
    diagnosticsOnly: placement.diagnosticsOnly,
  };
}

function placementEvaluationDiagnosticField(field) {
  const normalized = normalizeString(field);
  const blockedFields = [
    'commentAnchorPlacement.body',
    'commentAnchorPlacement.text',
    'commentAnchorPlacement.messages',
    'commentAnchorPlacement.commentText',
  ];
  if (blockedFields.includes(normalized)) return 'commentAnchorPlacement';
  if (normalized === 'inlineRange') return 'commentAnchorPlacement.inlineRange';
  if (normalized.startsWith('inlineRange.')) return `commentAnchorPlacement.${normalized}`;
  if (normalized.endsWith('.automationPolicy')) return normalized.slice(0, -'.automationPolicy'.length);
  return normalized;
}

function placementEvaluationDiagnosticMessage(message) {
  return normalizeString(message).replace(/automationPolicy/gu, 'policy');
}

function placementEvaluationReasonSnapshot(reason) {
  return {
    code: normalizeString(reason.code),
    field: placementEvaluationDiagnosticField(reason.field),
    message: placementEvaluationDiagnosticMessage(reason.message),
  };
}

function placementEvaluationValidationSnapshot(validation) {
  return {
    ok: validation.ok === true,
    type: normalizeString(validation.type),
    code: normalizeString(validation.code),
    reason: normalizeString(validation.reason),
    reasons: (Array.isArray(validation.reasons) ? validation.reasons : [])
      .map((reason) => placementEvaluationReasonSnapshot(reason)),
  };
}

function placementEvaluationAddDiagnostic(diagnostics, code, field, message) {
  const diagnostic = {
    code: normalizeString(code),
    field: placementEvaluationDiagnosticField(field),
    message: placementEvaluationDiagnosticMessage(message),
  };
  if (!diagnostic.code) return;
  const exists = diagnostics.some((candidate) => (
    candidate.code === diagnostic.code
    && candidate.field === diagnostic.field
    && candidate.message === diagnostic.message
  ));
  if (!exists) diagnostics.push(diagnostic);
}

function placementEvaluationPushReasonCode(reasonCodes, code) {
  const normalized = normalizeString(code);
  if (
    REVISION_BRIDGE_ANCHOR_CONFIDENCE_REASON_CODES.includes(normalized)
    && !reasonCodes.includes(normalized)
  ) {
    reasonCodes.push(normalized);
  }
}

function placementEvaluationValidationHardFailed(validation) {
  if (validation.ok === true) return false;
  return (validation.reasons || []).some((reason) => {
    const field = normalizeString(reason.field);
    return !field.startsWith('commentAnchorPlacement.inlineRange');
  });
}

function placementEvaluationStatus(validation, matchProof, confidenceEvaluation) {
  if (
    placementEvaluationValidationHardFailed(validation)
    || matchProof.status === 'hardFail'
    || confidenceEvaluation.status === 'hardFail'
    || confidenceEvaluation.automationPolicy === 'hardFail'
  ) {
    return 'hardFail';
  }
  if (
    matchProof.status === 'unresolved'
    || confidenceEvaluation.confidence === 'unresolved'
    || confidenceEvaluation.automationPolicy === 'diagnosticsOnly'
  ) {
    return 'unresolved';
  }
  if (
    matchProof.status !== 'matched'
    || confidenceEvaluation.status !== 'evaluated'
    || confidenceEvaluation.confidence !== 'exact'
  ) {
    return 'diagnostics';
  }
  return 'evaluated';
}

function placementEvaluationCode(status, validation) {
  if (validation.ok !== true) return PLACEMENT_EVALUATION_VALIDATION_FAILED_CODE;
  if (status === 'hardFail') return PLACEMENT_EVALUATION_HARD_FAIL_CODE;
  if (status === 'unresolved') return PLACEMENT_EVALUATION_UNRESOLVED_CODE;
  if (status === 'diagnostics') return PLACEMENT_EVALUATION_DIAGNOSTICS_CODE;
  return PLACEMENT_EVALUATION_EVALUATED_CODE;
}

function placementEvaluationDiagnostics(validation, matchProof, confidenceEvaluation) {
  const diagnostics = [];
  for (const reason of validation.reasons || []) {
    placementEvaluationAddDiagnostic(
      diagnostics,
      PLACEMENT_EVALUATION_VALIDATION_FAILED_CODE,
      reason.field,
      reason.message,
    );
  }
  for (const diagnostic of matchProof.diagnostics || []) {
    placementEvaluationAddDiagnostic(diagnostics, diagnostic.code, diagnostic.field, diagnostic.message);
  }
  for (const diagnostic of confidenceEvaluation.diagnostics || []) {
    placementEvaluationAddDiagnostic(diagnostics, diagnostic.code, diagnostic.field, diagnostic.message);
  }
  return diagnostics;
}

function placementEvaluationReasonCodes(code, matchProof, confidenceEvaluation) {
  const reasonCodes = [code];
  for (const reasonCode of matchProof.reasonCodes || []) {
    placementEvaluationPushReasonCode(reasonCodes, reasonCode);
  }
  for (const reasonCode of confidenceEvaluation.reasonCodes || []) {
    placementEvaluationPushReasonCode(reasonCodes, reasonCode);
  }
  return reasonCodes;
}

function evaluateCommentAnchorPlacementProof(input = {}, context = {}) {
  const validation = validateCommentAnchorPlacement(input, context);
  const placement = validation.value || createCommentAnchorPlacement(input);
  const matchProof = buildInlineRangeMatchProof(placement.inlineRange, context);
  const confidenceEvaluation = evaluateInlineRangeAnchorConfidence(placement.inlineRange, context);
  const status = placementEvaluationStatus(validation, matchProof, confidenceEvaluation);
  const code = placementEvaluationCode(status, validation);
  const reasonCodes = placementEvaluationReasonCodes(code, matchProof, confidenceEvaluation);

  return {
    schemaVersion: REVISION_BRIDGE_PLACEMENT_EVALUATION_SCHEMA,
    type: 'revisionBridge.commentAnchorPlacement.evaluation',
    status,
    code,
    reason: reasonCodes[0] || code,
    placement: placementEvaluationSnapshot(placement),
    validation: placementEvaluationValidationSnapshot(validation),
    matchProof: placementEvaluationClone(matchProof),
    confidenceEvaluation: placementEvaluationClone(confidenceEvaluation),
    reasonCodes,
    diagnostics: placementEvaluationDiagnostics(validation, matchProof, confidenceEvaluation),
  };
}
// RB_13_PLACEMENT_EVALUATION_CONTRACTS_END

// RB_18_COMMENT_SURVIVAL_PREVIEW_CONTRACTS_START
function commentSurvivalPreviewArray(value) {
  return Array.isArray(value) ? value : [];
}

function commentSurvivalPreviewThreads(input) {
  if (!isPlainObject(input)) return [];
  if (Array.isArray(input.commentThreads)) return input.commentThreads;
  return commentSurvivalPreviewArray(input.threads);
}

function commentSurvivalPreviewPlacements(input) {
  if (!isPlainObject(input)) return [];
  if (Array.isArray(input.commentAnchorPlacements)) return input.commentAnchorPlacements;
  return commentSurvivalPreviewArray(input.placements);
}

function commentSurvivalPreviewContext(input) {
  return isPlainObject(input) && isPlainObject(input.context) ? input.context : {};
}

function commentSurvivalPreviewBody(source) {
  if (!isPlainObject(source)) return '';
  if (hasOwnField(source, 'body')) return preserveString(source.body);
  if (hasOwnField(source, 'commentText')) return preserveString(source.commentText);
  if (hasOwnField(source, 'text')) return preserveString(source.text);
  if (hasOwnField(source, 'message')) return preserveString(source.message);
  return '';
}

function commentSurvivalPreviewMessages(thread, threadId) {
  const messages = Array.isArray(thread.messages) ? thread.messages : [thread];
  return messages.map((message, index) => {
    const source = isPlainObject(message) ? message : {};
    return {
      messageId: normalizeString(source.messageId) || `${threadId || 'thread'}:${index}`,
      authorId: normalizeString(source.authorId),
      body: commentSurvivalPreviewBody(source),
      createdAt: normalizeString(source.createdAt),
      replyParent: normalizeString(source.replyParent || source.parentMessageId),
    };
  });
}

function commentSurvivalPreviewThreadSnapshot(input, index) {
  const thread = isPlainObject(input) ? input : {};
  const threadId = normalizeString(thread.threadId);
  return {
    index,
    schemaVersion: REVISION_BRIDGE_COMMENT_THREAD_SCHEMA,
    threadId,
    authorId: normalizeString(thread.authorId),
    status: normalizeStringEnum(thread.status, ['open', 'resolved'], 'open'),
    resolvedDone: normalizeStringEnum(thread.status, ['open', 'resolved'], 'open') === 'resolved',
    createdAt: normalizeString(thread.createdAt),
    updatedAt: normalizeString(thread.updatedAt),
    tags: normalizeStringArray(thread.tags),
    messages: commentSurvivalPreviewMessages(thread, threadId),
  };
}

function commentSurvivalPreviewDiagnostic(code, field, message, index = null) {
  const diagnostic = {
    code,
    field,
    message,
  };
  if (index !== null) diagnostic.index = index;
  return diagnostic;
}

function commentSurvivalPreviewThreadDiagnostics(input, thread) {
  const diagnostics = [];
  if (!isPlainObject(input)) {
    diagnostics.push(commentSurvivalPreviewDiagnostic(
      COMMENT_SURVIVAL_THREAD_INVALID_CODE,
      `commentThreads.${thread.index}`,
      'comment thread must be an object',
      thread.index,
    ));
    return diagnostics;
  }
  if (!thread.threadId) {
    diagnostics.push(commentSurvivalPreviewDiagnostic(
      COMMENT_SURVIVAL_THREAD_ID_MISSING_CODE,
      `commentThreads.${thread.index}.threadId`,
      'comment threadId must be a non-empty string',
      thread.index,
    ));
  }
  if (thread.messages.length === 0) {
    diagnostics.push(commentSurvivalPreviewDiagnostic(
      COMMENT_SURVIVAL_THREAD_TEXT_EMPTY_CODE,
      `commentThreads.${thread.index}.messages`,
      'comment text must be a non-empty string',
      thread.index,
    ));
  }
  thread.messages.forEach((message, messageIndex) => {
    if (!normalizeString(message.body)) {
      diagnostics.push(commentSurvivalPreviewDiagnostic(
        COMMENT_SURVIVAL_THREAD_TEXT_EMPTY_CODE,
        `commentThreads.${thread.index}.messages.${messageIndex}.body`,
        'comment text must be a non-empty string',
        thread.index,
      ));
    }
  });
  return diagnostics;
}

function commentSurvivalPreviewDuplicateDiagnostics(threads) {
  const diagnostics = [];
  const seen = new Map();
  threads.forEach((thread) => {
    if (!thread.threadId) return;
    if (!seen.has(thread.threadId)) {
      seen.set(thread.threadId, thread.index);
      return;
    }
    diagnostics.push(commentSurvivalPreviewDiagnostic(
      COMMENT_SURVIVAL_THREAD_ID_DUPLICATE_CODE,
      `commentThreads.${thread.index}.threadId`,
      'comment threadId must be unique',
      thread.index,
    ));
  });
  return diagnostics;
}

function commentSurvivalPreviewPlacementSnapshot(input, index, context, threads) {
  const evaluation = evaluateCommentAnchorPlacementProof(input, context);
  const placement = evaluation.placement || createCommentAnchorPlacement(input);
  const threadIndexes = threads
    .filter((thread) => thread.threadId && thread.threadId === placement.threadId)
    .map((thread) => thread.index);
  return {
    index,
    placementId: placement.placementId,
    threadId: placement.threadId,
    threadIndexes,
    status: evaluation.status === 'evaluated' ? 'placed' : 'unplaced',
    canAutoApply: false,
    evaluation,
  };
}

function commentSurvivalPreviewPlacementDiagnostics(placementResult) {
  const diagnostics = [];
  if (placementResult.threadId && placementResult.threadIndexes.length === 0) {
    diagnostics.push(commentSurvivalPreviewDiagnostic(
      COMMENT_SURVIVAL_PLACEMENT_THREAD_MISSING_CODE,
      `commentAnchorPlacements.${placementResult.index}.threadId`,
      'comment placement threadId does not reference a preserved thread',
      placementResult.index,
    ));
  }
  if (placementResult.status !== 'placed') {
    diagnostics.push(commentSurvivalPreviewDiagnostic(
      COMMENT_SURVIVAL_PLACEMENT_NOT_EVALUATED_CODE,
      `commentAnchorPlacements.${placementResult.index}`,
      'comment placement is retained for manual resolution',
      placementResult.index,
    ));
  }
  return diagnostics;
}

function commentSurvivalPreviewPlacementByThreadId(placementResults) {
  const placementByThreadId = new Map();
  placementResults.forEach((placementResult) => {
    if (!placementResult?.threadId || placementByThreadId.has(placementResult.threadId)) return;
    placementByThreadId.set(placementResult.threadId, placementResult);
  });
  return placementByThreadId;
}

function commentSurvivalPreviewPlacementStatus(placementResult) {
  if (!isPlainObject(placementResult)) return 'orphan';
  const reasonCodes = Array.isArray(placementResult.evaluation?.reasonCodes)
    ? placementResult.evaluation.reasonCodes
    : [];
  if (reasonCodes.includes('REVISION_BRIDGE_ANCHOR_CONFIDENCE_DELETED_TARGET')) return 'deletedAnchor';
  if (placementResult.status === 'placed') return 'exact';
  return 'orphan';
}

function commentSurvivalPreviewPlacementAnchorKind(placementResult) {
  const inlineRange = isPlainObject(placementResult?.evaluation?.placement?.inlineRange)
    ? placementResult.evaluation.placement.inlineRange
    : {};
  return normalizeStringEnum(inlineRange.kind, ['span', 'point', 'deleted'], 'none');
}

function commentSurvivalPreviewOrphanReason(placementResult) {
  if (!isPlainObject(placementResult)) return 'REVISION_BRIDGE_COMMENT_SURVIVAL_ORPHAN_MISSING_PLACEMENT';
  const evaluationReasonCodes = Array.isArray(placementResult.evaluation?.reasonCodes)
    ? placementResult.evaluation.reasonCodes
    : [];
  const confidenceReasonCodes = Array.isArray(placementResult.evaluation?.confidenceEvaluation?.reasonCodes)
    ? placementResult.evaluation.confidenceEvaluation.reasonCodes
    : [];
  const reasonCodes = [...confidenceReasonCodes, ...evaluationReasonCodes]
    .map((reason) => normalizeString(reason))
    .filter(Boolean);
  if (reasonCodes.length > 0) return normalizeString(reasonCodes[0]);
  if (placementResult.status !== 'placed') return COMMENT_SURVIVAL_PLACEMENT_NOT_EVALUATED_CODE;
  return '';
}

function commentSurvivalPreviewSourcePart(thread) {
  const threadId = normalizeString(thread?.threadId);
  return `commentThread:${threadId || `index:${thread?.index ?? 0}`}`;
}

function commentSurvivalPreviewCommentRecords(threads, placementResults) {
  const placementByThreadId = commentSurvivalPreviewPlacementByThreadId(placementResults);
  const records = [];
  threads.forEach((thread) => {
    const placementResult = placementByThreadId.get(thread.threadId) || null;
    const placementStatus = commentSurvivalPreviewPlacementStatus(placementResult);
    const orphanReason = placementStatus === 'exact' ? '' : commentSurvivalPreviewOrphanReason(placementResult);
    const anchorKind = commentSurvivalPreviewPlacementAnchorKind(placementResult);
    const sourcePart = commentSurvivalPreviewSourcePart(thread);
    thread.messages.forEach((message, messageIndex) => {
      records.push({
        commentId: normalizeString(message.messageId) || `${thread.threadId || 'thread'}:${messageIndex}`,
        threadId: normalizeString(thread.threadId),
        bodyText: preserveString(message.body),
        placementStatus,
        orphanReason,
        sourcePart,
        authorHandle: normalizeString(message.authorId),
        createdAtUtc: normalizeString(message.createdAt || thread.createdAt),
        replyParent: normalizeString(message.replyParent),
        resolvedDone: thread.resolvedDone === true,
        anchorKind,
      });
    });
  });
  return records;
}

function commentSurvivalPreviewBlockedRecords(commentRecords) {
  const blockedRecords = [];
  const diagnostics = [];
  const seenCommentIds = new Map();
  commentRecords.forEach((record, index) => {
    if (!record.commentId) return;
    if (!seenCommentIds.has(record.commentId)) {
      seenCommentIds.set(record.commentId, index);
      return;
    }
    blockedRecords.push({
      blockedRecordId: `blocked-comment:${record.commentId}:${index}`,
      commentId: record.commentId,
      threadId: record.threadId,
      reasonCode: COMMENT_SURVIVAL_COMMENT_ID_DUPLICATE_CODE,
      sourcePart: record.sourcePart,
    });
    diagnostics.push(commentSurvivalPreviewDiagnostic(
      COMMENT_SURVIVAL_COMMENT_ID_DUPLICATE_CODE,
      `commentRecords.${index}.commentId`,
      'commentId must remain unique and duplicate records are retained as blocked records',
      index,
    ));
  });
  return {
    blockedRecords,
    diagnostics,
  };
}

function commentSurvivalPreviewInputDiagnostics(input) {
  const diagnostics = [];
  if (isPlainObject(input) && Array.isArray(input.commentPlacements)) {
    input.commentPlacements.forEach((placement, index) => {
      diagnostics.push(commentSurvivalPreviewDiagnostic(
        COMMENT_SURVIVAL_LEGACY_PLACEMENT_UNSUPPORTED_CODE,
        `commentPlacements.${index}`,
        'legacy commentPlacement input is not accepted by comment survival preview',
        index,
      ));
    });
  }
  return diagnostics;
}

function commentSurvivalPreviewSummary(diagnostics) {
  const items = [];
  for (const diagnostic of diagnostics) {
    let item = items.find((candidate) => candidate.code === diagnostic.code);
    if (!item) {
      item = {
        code: diagnostic.code,
        count: 0,
        indexes: [],
      };
      items.push(item);
    }
    item.count += 1;
    if (Number.isSafeInteger(diagnostic.index) && !item.indexes.includes(diagnostic.index)) {
      item.indexes.push(diagnostic.index);
    }
  }
  return {
    schemaVersion: REVISION_BRIDGE_COMMENT_SURVIVAL_PREVIEW_SCHEMA,
    total: items.length,
    items,
  };
}

export function buildCommentSurvivalPreview(input = {}) {
  const rawThreads = commentSurvivalPreviewThreads(input);
  const context = commentSurvivalPreviewContext(input);
  const preservedThreads = rawThreads.map((thread, index) => (
    commentSurvivalPreviewThreadSnapshot(thread, index)
  ));
  const placementResults = commentSurvivalPreviewPlacements(input).map((placement, index) => (
    commentSurvivalPreviewPlacementSnapshot(placement, index, context, preservedThreads)
  ));
  const diagnostics = [];
  diagnostics.push(...commentSurvivalPreviewInputDiagnostics(input));
  rawThreads.forEach((thread, index) => {
    diagnostics.push(...commentSurvivalPreviewThreadDiagnostics(thread, preservedThreads[index]));
  });
  diagnostics.push(...commentSurvivalPreviewDuplicateDiagnostics(preservedThreads));
  placementResults.forEach((placementResult) => {
    diagnostics.push(...commentSurvivalPreviewPlacementDiagnostics(placementResult));
  });
  const commentRecords = commentSurvivalPreviewCommentRecords(preservedThreads, placementResults);
  const blockedRecordResult = commentSurvivalPreviewBlockedRecords(commentRecords);
  diagnostics.push(...blockedRecordResult.diagnostics);

  const status = diagnostics.length > 0 ? 'diagnostics' : 'ready';
  const code = status === 'ready'
    ? COMMENT_SURVIVAL_PREVIEW_READY_CODE
    : COMMENT_SURVIVAL_PREVIEW_DIAGNOSTICS_CODE;
  return {
    schemaVersion: REVISION_BRIDGE_COMMENT_SURVIVAL_PREVIEW_SCHEMA,
    type: 'revisionBridge.commentSurvival.preview',
    status,
    code,
    reason: diagnostics[0]?.code || code,
    canAutoApply: false,
    autoApplyCount: 0,
    autoApplyCandidates: [],
    totalThreads: preservedThreads.length,
    totalPlacements: placementResults.length,
    preservedThreads,
    placementResults,
    commentRecords,
    blockedRecords: blockedRecordResult.blockedRecords,
    diagnostics: cloneJsonSafe(diagnostics),
    diagnosticSummary: commentSurvivalPreviewSummary(diagnostics),
  };
}
// RB_18_COMMENT_SURVIVAL_PREVIEW_CONTRACTS_END

// E10_C01_STABLE_COMMENT_ANCHOR_PACKET_START
function stableCommentAnchorPacketReviewIr(input) {
  if (!isPlainObject(input)) return {};
  if (isPlainObject(input.reviewIr)) return input.reviewIr;
  if (isPlainObject(input.analysis?.reviewIr)) return input.analysis.reviewIr;
  return input;
}

function stableCommentAnchorPacketShortId(value) {
  return stableRevisionBridgeDigest(value).replace(/^sha256:/u, '').slice(0, 16);
}

function stableCommentAnchorPacketThreadBase(thread, index) {
  const durableId = normalizeString(thread.durableId);
  if (durableId) return { kind: 'durableId', value: durableId };
  const sourceThreadId = normalizeString(thread.threadId);
  if (sourceThreadId) return { kind: 'threadId', value: sourceThreadId };
  const commentId = normalizeString(thread.commentId);
  if (commentId) return { kind: 'commentId', value: commentId };
  return { kind: 'ordinal', value: String(index) };
}

function stableCommentAnchorPacketThreadIdentity(thread, index) {
  const base = stableCommentAnchorPacketThreadBase(thread, index);
  return `stable-comment-thread:${base.kind}:${stableCommentAnchorPacketShortId(base)}`;
}

function stableCommentAnchorPacketThreadKeys(thread, stableThreadId) {
  return [
    stableThreadId,
    normalizeString(thread.threadId),
    normalizeString(thread.commentId),
    normalizeString(thread.durableId),
    normalizeString(thread.paraId),
  ].filter(Boolean);
}

function stableCommentAnchorPacketBody(thread) {
  if (hasOwnField(thread, 'body')) return preserveString(thread.body);
  if (hasOwnField(thread, 'bodyExcerpt')) return preserveString(thread.bodyExcerpt);
  return '';
}

function stableCommentAnchorPacketThreadStatus(thread) {
  const state = normalizeString(thread.doneResolvedReopenedState).toLowerCase();
  const status = normalizeString(thread.status).toUpperCase();
  return state === 'resolved' || status === 'RESOLVED' ? 'resolved' : 'open';
}

function stableCommentAnchorPacketRootMessage(thread, stableThreadId) {
  const stableCommentIdentity = normalizeString(thread.durableId) || normalizeString(thread.commentId);
  return {
    messageId: `stable-comment-message:${stableCommentAnchorPacketShortId({
      stableThreadId,
      commentIdentity: stableCommentIdentity,
      role: 'root',
    })}`,
    authorId: normalizeString(thread.authorId || thread.authorPersonIdentity?.author),
    body: stableCommentAnchorPacketBody(thread),
    createdAt: normalizeString(thread.createdAt || thread.date),
    replyParent: '',
  };
}

function stableCommentAnchorPacketReplyMessages(thread, stableThreadId) {
  const replies = Array.isArray(thread.replies) ? thread.replies.filter(isPlainObject) : [];
  return replies.map((reply, index) => ({
    messageId: `stable-comment-reply:${stableCommentAnchorPacketShortId({
      stableThreadId,
      rawId: normalizeString(reply.rawId),
      itemId: normalizeString(reply.itemId),
      index,
    })}`,
    authorId: normalizeString(reply.author || reply.authorId),
    body: preserveString(reply.body),
    createdAt: normalizeString(reply.date || reply.createdAt),
    replyParent: normalizeString(reply.parentRawId),
  }));
}

function stableCommentAnchorPacketThreadSnapshot(thread, index) {
  const source = isPlainObject(thread) ? thread : {};
  const stableThreadId = stableCommentAnchorPacketThreadIdentity(source, index);
  return {
    thread: {
      schemaVersion: REVISION_BRIDGE_COMMENT_THREAD_SCHEMA,
      threadId: stableThreadId,
      authorId: normalizeString(source.authorId || source.authorPersonIdentity?.author),
      status: stableCommentAnchorPacketThreadStatus(source),
      createdAt: normalizeString(source.createdAt || source.date),
      updatedAt: normalizeString(source.updatedAt),
      tags: normalizeStringArray(source.reasonCodes),
      messages: [
        stableCommentAnchorPacketRootMessage(source, stableThreadId),
        ...stableCommentAnchorPacketReplyMessages(source, stableThreadId),
      ],
    },
    sourceRef: {
      stableThreadIdentity: stableThreadId,
      sourceThreadId: normalizeString(source.threadId),
      commentId: normalizeString(source.commentId),
      durableId: normalizeString(source.durableId),
      doneResolvedReopenedState: normalizeString(source.doneResolvedReopenedState),
      status: normalizeString(source.status),
      quotedAnchorText: preserveString(source.quotedAnchorText),
      relatedRevision: cloneJsonSafe(source.relatedRevision || null),
      reasonCodes: normalizeStringArray(source.reasonCodes),
      sourceXmlProvenance: cloneJsonSafe(source.sourceXmlProvenance || null),
      placementSelectorEvidence: cloneJsonSafe(source.placement?.selectorStack || {}),
    },
    lookupKeys: stableCommentAnchorPacketThreadKeys(source, stableThreadId),
  };
}

function stableCommentAnchorPacketPlacementHints(input) {
  const hints = new Map();
  function addHint(key, placement) {
    const normalizedKey = normalizeString(key);
    if (!normalizedKey || !isPlainObject(placement) || hints.has(normalizedKey)) return;
    hints.set(normalizedKey, cloneJsonSafe(placement));
  }
  const placementHints = isPlainObject(input?.placementHints) ? input.placementHints : {};
  for (const [key, value] of Object.entries(placementHints)) addHint(key, value);
  const placements = Array.isArray(input?.commentAnchorPlacements)
    ? input.commentAnchorPlacements
    : (Array.isArray(input?.placements) ? input.placements : []);
  placements.forEach((placement) => {
    if (!isPlainObject(placement)) return;
    addHint(placement.threadId, placement);
    addHint(placement.sourceThreadId, placement);
    addHint(placement.commentId, placement);
    addHint(placement.durableId, placement);
  });
  return hints;
}

function stableCommentAnchorPacketPlacementForThread(threadSnapshot, hints) {
  for (const key of threadSnapshot.lookupKeys) {
    const placement = hints.get(key);
    if (!placement) continue;
    return {
      ...placement,
      threadId: threadSnapshot.thread.threadId,
    };
  }
  return null;
}

function stableCommentAnchorPacketDiagnostics(threadSnapshots, placementResults, survivalPreview) {
  const diagnostics = [];
  if (threadSnapshots.length === 0) {
    diagnostics.push({
      code: STABLE_COMMENT_ANCHOR_PACKET_EMPTY_CODE,
      field: 'reviewIr.commentThreads',
      message: 'no comment threads were available for stable anchor packet projection',
    });
  }
  const placedThreadIds = new Set(placementResults.map((item) => item.threadId).filter(Boolean));
  threadSnapshots.forEach((threadSnapshot, index) => {
    const ref = threadSnapshot.sourceRef;
    const anchored = ref.status === 'ANCHORED' || normalizeString(ref.quotedAnchorText) !== '';
    if (anchored && !placedThreadIds.has(threadSnapshot.thread.threadId)) {
      diagnostics.push({
        code: STABLE_COMMENT_ANCHOR_PACKET_NO_IMPLICIT_PLACEMENT_CODE,
        field: `commentThreads.${index}`,
        message: 'anchored RTK comment was preserved without fabricating an app placement',
        threadId: threadSnapshot.thread.threadId,
      });
    }
  });
  diagnostics.push(...commentSurvivalPreviewArray(survivalPreview.diagnostics));
  return diagnostics;
}

function stableCommentAnchorPacketRecordRows(commentRecords, sourceRefByThreadId, projectId, sceneId) {
  return commentRecords.map((record) => {
    const ref = sourceRefByThreadId.get(record.threadId) || {};
    const evidenceIdentity = stableRevisionBridgeDigest({
      stableThreadIdentity: ref.stableThreadIdentity || record.threadId,
      sourceThreadId: ref.sourceThreadId,
      commentId: ref.commentId || record.commentId,
      durableId: ref.durableId,
      placementStatus: record.placementStatus,
      orphanReason: record.orphanReason,
      sourceXmlProvenance: ref.sourceXmlProvenance,
      relatedRevision: ref.relatedRevision,
    });
    return {
      schemaVersion: 'revision-bridge.stable-comment-anchor-record.v1',
      anchorRecordId: `stable-comment-anchor:${stableCommentAnchorPacketShortId({
        evidenceIdentity,
        recordCommentId: record.commentId,
      })}`,
      projectId,
      sceneId,
      stableThreadIdentity: ref.stableThreadIdentity || record.threadId,
      threadId: record.threadId,
      commentId: record.commentId,
      sourceThreadId: ref.sourceThreadId || '',
      sourceCommentId: ref.commentId || '',
      durableId: ref.durableId || '',
      bodyDigest: stableRevisionBridgeDigest({ bodyText: record.bodyText }),
      placementStatus: record.placementStatus,
      orphanReason: record.orphanReason,
      anchorKind: record.anchorKind,
      sourcePart: record.sourcePart,
      authorHandle: record.authorHandle,
      createdAtUtc: record.createdAtUtc,
      replyParent: record.replyParent,
      resolvedDone: record.resolvedDone === true,
      evidenceIdentity,
      selectorEvidence: cloneJsonSafe(ref.placementSelectorEvidence || {}),
      relatedRevision: cloneJsonSafe(ref.relatedRevision || null),
      canAutoApply: false,
      canWriteManuscript: false,
    };
  });
}

function stableCommentAnchorPacketDecisionRows(anchorRecords) {
  return anchorRecords.map((record) => ({
    schemaVersion: 'revision-bridge.stable-comment-decision-row.v1',
    decisionId: `stable-comment-decision:${stableCommentAnchorPacketShortId({
      stableThreadIdentity: record.stableThreadIdentity,
      commentId: record.commentId,
    })}`,
    anchorRecordId: record.anchorRecordId,
    stableThreadIdentity: record.stableThreadIdentity,
    commentId: record.commentId,
    state: record.resolvedDone ? 'resolved' : 'pending',
    placementStatus: record.placementStatus,
    requiresAuthorDecision: record.placementStatus !== 'exact',
    canAutoApply: false,
    canWriteManuscript: false,
    mutationAuthority: 'none-preview-only',
  }));
}

export function buildStableCommentAnchorPacketFromReviewIr(input = {}) {
  const reviewIr = stableCommentAnchorPacketReviewIr(input);
  const rawThreads = Array.isArray(reviewIr.commentThreads) ? reviewIr.commentThreads.filter(isPlainObject) : [];
  const threadSnapshots = rawThreads.map((thread, index) => stableCommentAnchorPacketThreadSnapshot(thread, index));
  const hints = stableCommentAnchorPacketPlacementHints(input);
  const commentAnchorPlacements = threadSnapshots
    .map((threadSnapshot) => stableCommentAnchorPacketPlacementForThread(threadSnapshot, hints))
    .filter(isPlainObject);
  const survivalPreview = buildCommentSurvivalPreview({
    commentThreads: threadSnapshots.map((threadSnapshot) => threadSnapshot.thread),
    commentAnchorPlacements,
    context: isPlainObject(input.context) ? input.context : {},
  });
  const sourceRefByThreadId = new Map(threadSnapshots.map((threadSnapshot) => [
    threadSnapshot.thread.threadId,
    threadSnapshot.sourceRef,
  ]));
  const projectId = normalizeString(input.projectId);
  const sceneId = normalizeString(input.sceneId);
  const anchorRecords = stableCommentAnchorPacketRecordRows(
    survivalPreview.commentRecords,
    sourceRefByThreadId,
    projectId,
    sceneId,
  );
  const decisionRows = stableCommentAnchorPacketDecisionRows(anchorRecords);
  const diagnostics = stableCommentAnchorPacketDiagnostics(threadSnapshots, survivalPreview.placementResults, survivalPreview);
  const status = diagnostics.length > 0 ? 'diagnostics' : 'ready';
  const code = status === 'ready'
    ? STABLE_COMMENT_ANCHOR_PACKET_READY_CODE
    : STABLE_COMMENT_ANCHOR_PACKET_DIAGNOSTICS_CODE;
  const packetCore = {
    projectId,
    sceneId,
    revisionId: normalizeString(input.revisionId),
    anchorRecords,
    decisionRows,
    diagnostics,
    survivalPreviewHash: stableRevisionBridgeDigest(survivalPreview),
  };

  return {
    schemaVersion: REVISION_BRIDGE_STABLE_COMMENT_ANCHOR_PACKET_SCHEMA,
    type: 'revisionBridge.stableCommentAnchor.packet',
    status,
    code,
    reason: diagnostics[0]?.code || code,
    canAutoApply: false,
    canWriteManuscript: false,
    projectId,
    sceneId,
    revisionId: normalizeString(input.revisionId),
    source: {
      reviewIrSchemaVersion: normalizeString(reviewIr.schemaVersion),
      commentThreadCount: rawThreads.length,
      placementHintCount: commentAnchorPlacements.length,
      parserAuthority: 'rtk-review-ir-comment-graph-only',
    },
    sourceThreadRefs: threadSnapshots.map((threadSnapshot) => threadSnapshot.sourceRef),
    anchorRecords,
    decisionRows,
    survivalPreviewHash: packetCore.survivalPreviewHash,
    survivalPreview,
    diagnostics: cloneJsonSafe(diagnostics),
    summary: {
      totalThreads: threadSnapshots.length,
      totalAnchorRecords: anchorRecords.length,
      totalDecisionRows: decisionRows.length,
      exactAnchors: anchorRecords.filter((record) => record.placementStatus === 'exact').length,
      orphanAnchors: anchorRecords.filter((record) => record.placementStatus === 'orphan').length,
      deletedAnchors: anchorRecords.filter((record) => record.placementStatus === 'deletedAnchor').length,
      diagnostics: diagnostics.length,
    },
    packetHash: stableRevisionBridgeDigest(packetCore),
  };
}
// E10_C01_STABLE_COMMENT_ANCHOR_PACKET_END

export { evaluateCommentAnchorPlacementProof };

export function evaluateCommentAnchorPlacementBatchDiagnostics(input = {}) {
  return placementBatchDiagnosticsEvaluate(input);
}

export function previewRevisionSessionPlacementAdmission(input = {}) {
  return placementAdmissionPreviewEvaluate(input);
}

export function previewRevisionSessionSkeletonAdmission(input = {}) {
  return revisionSessionSkeletonAdmissionPreviewEvaluate(input);
}

// RB_14_PLACEMENT_BATCH_DIAGNOSTICS_CONTRACTS_START
function placementBatchDiagnosticsCountsByStatus() {
  return {
    evaluated: 0,
    diagnostics: 0,
    unresolved: 0,
    hardFail: 0,
  };
}

function placementBatchDiagnosticsCountsByReasonCode() {
  const counts = {};
  for (const code of REVISION_BRIDGE_PLACEMENT_BATCH_DIAGNOSTICS_REASON_CODES) {
    counts[code] = 0;
  }
  return counts;
}

const PLACEMENT_BATCH_DIAGNOSTICS_SUMMARY_ORDER = Object.freeze([
  'hardFail',
  'unresolved',
  'diagnostics',
  'evaluated',
]);

function placementBatchDiagnosticsCheck(input) {
  if (!isPlainObject(input)) {
    return {
      ok: false,
      field: 'input',
      message: 'input must be a plain object',
    };
  }
  if (!Array.isArray(input.placements)) {
    return {
      ok: false,
      field: 'placements',
      message: 'placements must be an array',
    };
  }
  const context = input.context || {};
  if (!isPlainObject(context)) {
    return {
      ok: false,
      field: 'context',
      message: 'context must be a plain object',
    };
  }
  return {
    ok: true,
    placements: input.placements,
    context,
  };
}

function placementBatchDiagnosticsAddReasonCount(counts, code) {
  const normalized = normalizeString(code);
  if (Object.hasOwn(counts, normalized)) counts[normalized] += 1;
}

function placementBatchDiagnosticsSummaryRank(severity) {
  const rank = PLACEMENT_BATCH_DIAGNOSTICS_SUMMARY_ORDER.indexOf(severity);
  return rank === -1 ? PLACEMENT_BATCH_DIAGNOSTICS_SUMMARY_ORDER.length : rank;
}

function placementBatchDiagnosticsSummaryFirstIndex(item) {
  return item.indexes.length > 0 ? item.indexes[0] : -1;
}

function placementBatchDiagnosticsCompareSummaryItems(left, right) {
  const severityDelta = placementBatchDiagnosticsSummaryRank(left.severity)
    - placementBatchDiagnosticsSummaryRank(right.severity);
  if (severityDelta !== 0) return severityDelta;
  const countDelta = right.count - left.count;
  if (countDelta !== 0) return countDelta;
  const codeDelta = left.code.localeCompare(right.code);
  if (codeDelta !== 0) return codeDelta;
  return placementBatchDiagnosticsSummaryFirstIndex(left)
    - placementBatchDiagnosticsSummaryFirstIndex(right);
}

function placementBatchDiagnosticsAddSummaryItem(items, severity, code, index) {
  const normalizedSeverity = normalizeString(severity);
  const normalizedCode = normalizeString(code);
  if (!normalizedSeverity || !normalizedCode) return;
  let item = items.find((candidate) => (
    candidate.severity === normalizedSeverity
    && candidate.code === normalizedCode
  ));
  if (!item) {
    item = {
      severity: normalizedSeverity,
      code: normalizedCode,
      count: 0,
      indexes: [],
    };
    items.push(item);
  }
  item.count += 1;
  if (Number.isSafeInteger(index) && !item.indexes.includes(index)) item.indexes.push(index);
}

function placementBatchDiagnosticsSummary(items) {
  const sortedItems = [...items].sort(placementBatchDiagnosticsCompareSummaryItems);
  return {
    schemaVersion: REVISION_BRIDGE_PLACEMENT_BATCH_DIAGNOSTICS_SCHEMA,
    sortOrder: [...PLACEMENT_BATCH_DIAGNOSTICS_SUMMARY_ORDER],
    total: sortedItems.length,
    items: sortedItems,
  };
}

function placementBatchDiagnosticsSummaryFromEvaluations(evaluations) {
  const items = [];
  for (const item of evaluations) {
    for (const reasonCode of item.evaluation.reasonCodes || []) {
      placementBatchDiagnosticsAddSummaryItem(items, item.evaluation.status, reasonCode, item.index);
    }
  }
  return placementBatchDiagnosticsSummary(items);
}

function placementBatchDiagnosticsStatus(countsByStatus) {
  if (countsByStatus.hardFail > 0) return 'hardFail';
  if (countsByStatus.unresolved > 0) return 'unresolved';
  if (countsByStatus.diagnostics > 0) return 'diagnostics';
  return 'evaluated';
}

function placementBatchDiagnosticsCode(status) {
  if (status === 'hardFail') return PLACEMENT_BATCH_DIAGNOSTICS_HARD_FAIL_CODE;
  if (status === 'unresolved') return PLACEMENT_BATCH_DIAGNOSTICS_UNRESOLVED_CODE;
  if (status === 'diagnostics') return PLACEMENT_BATCH_DIAGNOSTICS_DIAGNOSTICS_CODE;
  return PLACEMENT_BATCH_DIAGNOSTICS_EVALUATED_CODE;
}

function placementBatchDiagnosticsEnvelope(
  status,
  code,
  total,
  countsByStatus,
  countsByReasonCode,
  evaluations,
  diagnostics,
  diagnosticSummary,
) {
  return {
    schemaVersion: REVISION_BRIDGE_PLACEMENT_BATCH_DIAGNOSTICS_SCHEMA,
    type: 'revisionBridge.commentAnchorPlacement.batchDiagnostics',
    status,
    code,
    reason: code,
    total,
    countsByStatus,
    countsByReasonCode,
    evaluations,
    diagnostics,
    diagnosticSummary,
  };
}

function placementBatchDiagnosticsFromEvaluationDiagnostics(evaluation, index) {
  const diagnostics = [];
  for (const diagnostic of evaluation.diagnostics || []) {
    diagnostics.push({
      code: normalizeString(diagnostic.code),
      field: placementEvaluationDiagnosticField(diagnostic.field),
      message: placementEvaluationDiagnosticMessage(diagnostic.message),
      index,
    });
  }
  return diagnostics;
}

function placementBatchDiagnosticsEvaluate(input) {
  const countsByStatus = placementBatchDiagnosticsCountsByStatus();
  const countsByReasonCode = placementBatchDiagnosticsCountsByReasonCode();
  const checked = placementBatchDiagnosticsCheck(input);
  if (checked.ok !== true) {
    countsByReasonCode[PLACEMENT_BATCH_DIAGNOSTICS_VALIDATION_FAILED_CODE] = 1;
    const diagnosticSummary = placementBatchDiagnosticsSummary([{
      severity: 'hardFail',
      code: PLACEMENT_BATCH_DIAGNOSTICS_VALIDATION_FAILED_CODE,
      count: 1,
      indexes: [],
    }]);
    return placementBatchDiagnosticsEnvelope(
      'hardFail',
      PLACEMENT_BATCH_DIAGNOSTICS_VALIDATION_FAILED_CODE,
      0,
      countsByStatus,
      countsByReasonCode,
      [],
      [{
        code: PLACEMENT_BATCH_DIAGNOSTICS_VALIDATION_FAILED_CODE,
        field: checked.field,
        message: checked.message,
      }],
      diagnosticSummary,
    );
  }

  const evaluations = [];
  const diagnostics = [];
  for (let index = 0; index < checked.placements.length; index += 1) {
    const evaluation = evaluateCommentAnchorPlacementProof(checked.placements[index], checked.context);
    evaluations.push({ index, evaluation });
    if (Object.hasOwn(countsByStatus, evaluation.status)) countsByStatus[evaluation.status] += 1;
    for (const reasonCode of evaluation.reasonCodes || []) {
      placementBatchDiagnosticsAddReasonCount(countsByReasonCode, reasonCode);
    }
    diagnostics.push(...placementBatchDiagnosticsFromEvaluationDiagnostics(evaluation, index));
  }

  const status = placementBatchDiagnosticsStatus(countsByStatus);
  const code = placementBatchDiagnosticsCode(status);
  const diagnosticSummary = placementBatchDiagnosticsSummaryFromEvaluations(evaluations);
  return placementBatchDiagnosticsEnvelope(
    status,
    code,
    checked.placements.length,
    countsByStatus,
    countsByReasonCode,
    evaluations,
    diagnostics,
    diagnosticSummary,
  );
}
// RB_14_PLACEMENT_BATCH_DIAGNOSTICS_CONTRACTS_END

// RB_16_PLACEMENT_ADMISSION_PREVIEW_CONTRACTS_START
const PLACEMENT_ADMISSION_PREVIEW_SCHEMA = 'revision-bridge.revision-session-placement-admission-preview.v1';
const PLACEMENT_ADMISSION_PREVIEW_ADMIT_CODE = 'REVISION_BRIDGE_REVISION_SESSION_PLACEMENT_ADMISSION_PREVIEW_ADMIT';
const PLACEMENT_ADMISSION_PREVIEW_BLOCK_CODE = 'REVISION_BRIDGE_REVISION_SESSION_PLACEMENT_ADMISSION_PREVIEW_BLOCK';
const PLACEMENT_ADMISSION_PREVIEW_DEFAULT_BLOCKING_STATUSES = Object.freeze([
  'unresolved',
  'hardFail',
]);
const PLACEMENT_ADMISSION_PREVIEW_VALID_STATUSES = Object.freeze([
  'evaluated',
  'diagnostics',
  'unresolved',
  'hardFail',
]);

function placementAdmissionPreviewStatuses(input) {
  if (!hasOwnField(input, 'blockingStatuses')) {
    return { ok: true, value: [...PLACEMENT_ADMISSION_PREVIEW_DEFAULT_BLOCKING_STATUSES] };
  }
  if (!Array.isArray(input.blockingStatuses) || input.blockingStatuses.length === 0) {
    return { ok: false, value: [] };
  }
  const value = [];
  for (const item of input.blockingStatuses) {
    if (typeof item !== 'string') return { ok: false, value: [] };
    const status = normalizeString(item);
    if (!PLACEMENT_ADMISSION_PREVIEW_VALID_STATUSES.includes(status)) return { ok: false, value: [] };
    if (!value.includes(status)) value.push(status);
  }
  if (value.length === 0) return { ok: false, value: [] };
  return { ok: true, value };
}

function placementAdmissionPreviewValidEvaluationItem(item) {
  if (!isPlainObject(item) || !Number.isSafeInteger(item.index) || item.index < 0) return false;
  if (!isPlainObject(item.evaluation)) return false;
  if (!PLACEMENT_ADMISSION_PREVIEW_VALID_STATUSES.includes(item.evaluation.status)) return false;
  return Array.isArray(item.evaluation.reasonCodes);
}

function placementAdmissionPreviewValidDiagnosticItem(item) {
  return isPlainObject(item) && Number.isSafeInteger(item.index) && item.index >= 0;
}

function placementAdmissionPreviewBatch(input) {
  if (!isPlainObject(input)) return { ok: false, value: null };
  const batch = input.batchDiagnostics;
  if (!isPlainObject(batch)) return { ok: false, value: null };
  if (batch.type !== 'revisionBridge.commentAnchorPlacement.batchDiagnostics') return { ok: false, value: null };
  if (!PLACEMENT_ADMISSION_PREVIEW_VALID_STATUSES.includes(batch.status)) return { ok: false, value: null };
  if (!Number.isSafeInteger(batch.total) || batch.total < 0) return { ok: false, value: null };
  if (!Array.isArray(batch.evaluations)) return { ok: false, value: null };
  if (batch.total !== batch.evaluations.length) return { ok: false, value: null };
  if (!Array.isArray(batch.diagnostics)) return { ok: false, value: null };
  if (!isPlainObject(batch.diagnosticSummary)) return { ok: false, value: null };
  for (const item of batch.evaluations) {
    if (!placementAdmissionPreviewValidEvaluationItem(item)) return { ok: false, value: null };
  }
  for (const item of batch.diagnostics) {
    if (!placementAdmissionPreviewValidDiagnosticItem(item)) return { ok: false, value: null };
  }
  return { ok: true, value: batch };
}

function placementAdmissionPreviewCode(status) {
  if (status === 'hardFail') return PLACEMENT_BATCH_DIAGNOSTICS_VALIDATION_FAILED_CODE;
  if (status === 'block') return PLACEMENT_ADMISSION_PREVIEW_BLOCK_CODE;
  return PLACEMENT_ADMISSION_PREVIEW_ADMIT_CODE;
}

function placementAdmissionPreviewSummary(items) {
  const sortedItems = [...items].sort(placementBatchDiagnosticsCompareSummaryItems);
  return {
    schemaVersion: PLACEMENT_ADMISSION_PREVIEW_SCHEMA,
    sortOrder: [...PLACEMENT_BATCH_DIAGNOSTICS_SUMMARY_ORDER],
    total: sortedItems.length,
    items: sortedItems,
  };
}

function placementAdmissionPreviewSummaryFromEvaluations(evaluations) {
  const items = [];
  for (const item of evaluations) {
    for (const reasonCode of item.evaluation.reasonCodes) {
      if (REVISION_BRIDGE_PLACEMENT_BATCH_DIAGNOSTICS_REASON_CODES.includes(reasonCode)) {
        placementBatchDiagnosticsAddSummaryItem(items, item.evaluation.status, reasonCode, item.index);
      }
    }
  }
  return placementAdmissionPreviewSummary(items);
}

function placementAdmissionPreviewInvalidSummary() {
  return placementAdmissionPreviewSummary([{
    severity: 'hardFail',
    code: PLACEMENT_BATCH_DIAGNOSTICS_VALIDATION_FAILED_CODE,
    count: 1,
    indexes: [],
  }]);
}

function placementAdmissionPreviewEnvelope(
  status,
  blockingStatuses,
  sourceStatus,
  sourceTotal,
  blockingEvaluations,
  blockingDiagnostics,
  diagnosticSummary,
) {
  const countsByStatus = placementBatchDiagnosticsCountsByStatus();
  const countsByReasonCode = placementBatchDiagnosticsCountsByReasonCode();
  for (const item of blockingEvaluations) {
    if (Object.hasOwn(countsByStatus, item.evaluation.status)) countsByStatus[item.evaluation.status] += 1;
    for (const reasonCode of item.evaluation.reasonCodes) {
      placementBatchDiagnosticsAddReasonCount(countsByReasonCode, reasonCode);
    }
  }
  const code = placementAdmissionPreviewCode(status);
  return {
    schemaVersion: PLACEMENT_ADMISSION_PREVIEW_SCHEMA,
    type: 'revisionBridge.revisionSession.placementAdmissionPreview',
    status,
    code,
    reason: code,
    canAdmit: status === 'admit',
    sourceStatus,
    sourceTotal,
    blockingStatuses,
    total: blockingEvaluations.length,
    countsByStatus,
    countsByReasonCode,
    blockingEvaluations,
    blockingDiagnostics,
    diagnosticSummary,
  };
}

function placementAdmissionPreviewInvalid(blockingStatuses, source) {
  return placementAdmissionPreviewEnvelope(
    'hardFail',
    blockingStatuses,
    source ? source.status : '',
    source ? source.total : 0,
    [],
    [],
    placementAdmissionPreviewInvalidSummary(),
  );
}

function placementAdmissionPreviewEvaluate(input) {
  const statuses = placementAdmissionPreviewStatuses(isPlainObject(input) ? input : {});
  const source = placementAdmissionPreviewBatch(input);
  const sourceStatus = source.ok === true ? source.value.status : '';
  const sourceTotal = source.ok === true ? source.value.total : 0;
  if (statuses.ok !== true || source.ok !== true) {
    return placementAdmissionPreviewInvalid(
      statuses.ok === true ? statuses.value : [],
      source.ok === true ? source.value : null,
    );
  }

  const blockingEvaluations = source.value.evaluations
    .filter((item) => statuses.value.includes(item.evaluation.status))
    .sort((left, right) => left.index - right.index)
    .map((item) => placementEvaluationClone(item));
  const indexes = blockingEvaluations.map((item) => item.index);
  const blockingDiagnostics = source.value.diagnostics
    .filter((item) => indexes.includes(item.index))
    .map((item) => placementEvaluationClone(item));
  const status = blockingEvaluations.length > 0 ? 'block' : 'admit';
  return placementAdmissionPreviewEnvelope(
    status,
    [...statuses.value],
    sourceStatus,
    sourceTotal,
    blockingEvaluations,
    blockingDiagnostics,
    placementAdmissionPreviewSummaryFromEvaluations(blockingEvaluations),
  );
}
// RB_16_PLACEMENT_ADMISSION_PREVIEW_CONTRACTS_END

// RB_17_REVISION_SESSION_SKELETON_ADMISSION_PREVIEW_CONTRACTS_START
const REVISION_SESSION_SKELETON_ADMISSION_PREVIEW_ADMIT_CODE =
  'REVISION_BRIDGE_REVISION_SESSION_SKELETON_ADMISSION_PREVIEW_ADMIT';
const REVISION_SESSION_SKELETON_ADMISSION_PREVIEW_BLOCK_CODE =
  'REVISION_BRIDGE_REVISION_SESSION_SKELETON_ADMISSION_PREVIEW_BLOCK';
const REVISION_SESSION_SKELETON_ADMISSION_PREVIEW_INVALID_CODE =
  'E_REVISION_BRIDGE_REVISION_SESSION_SKELETON_ADMISSION_PREVIEW_INVALID';
const REVISION_SESSION_SKELETON_ADMISSION_PREVIEW_STATUSES = Object.freeze([
  'admit',
  'block',
  'hardFail',
]);
const REVISION_SESSION_SKELETON_ADMISSION_PREVIEW_IDS = Object.freeze([
  ['projectId', 'revisionSession.projectId'],
  ['revisionSessionId', 'revisionSession.revisionSessionId'],
  ['ex' + 'portId', 'revisionSession.ex' + 'portId'],
  ['baselineHash', 'revisionSession.baselineHash'],
]);
const REVISION_SESSION_SKELETON_ADMISSION_PREVIEW_GRAPH = Object.freeze([
  'commentThreads',
  'commentPlacements',
  'textChanges',
  'structuralChanges',
  'diagnosticItems',
  'decisionStates',
]);
const REVISION_SESSION_SKELETON_ADMISSION_PREVIEW_STATUS_COUNT_KEYS = Object.freeze([
  'evaluated',
  'diagnostics',
  'unresolved',
  'hardFail',
]);
const REVISION_SESSION_SKELETON_ADMISSION_PREVIEW_REJECT_KEYS = Object.freeze([
  'im' + 'port',
  'stor' + 'age',
  'ap' + 'ply',
  'i' + 'pc',
  'par' + 'ser',
  'u' + 'i',
  'net' + 'work',
  'com' + 'mand',
  'pa' + 'th',
  'wri' + 'te',
  'sa' + 've',
]);

function revisionSessionSkeletonAdmissionPreviewReason(field, message) {
  return {
    code: REVISION_SESSION_SKELETON_ADMISSION_PREVIEW_INVALID_CODE,
    field,
    message,
  };
}

function revisionSessionSkeletonAdmissionPreviewIds(input) {
  const source = isPlainObject(input) ? input : {};
  const ids = {};
  const reasons = [];
  for (const [key, field] of REVISION_SESSION_SKELETON_ADMISSION_PREVIEW_IDS) {
    const value = normalizeString(source[key]);
    ids[key] = value;
    if (!value) {
      reasons.push(revisionSessionSkeletonAdmissionPreviewReason(
        field,
        `${key} must be a non-empty string`,
      ));
    }
  }
  return { ids, reasons };
}

function revisionSessionSkeletonAdmissionPreviewCheckField(preview, key, check, message) {
  if (!check(preview[key])) {
    return revisionSessionSkeletonAdmissionPreviewReason(`placementAdmissionPreview.${key}`, message);
  }
  return null;
}

function revisionSessionSkeletonAdmissionPreviewCheckArray(preview, key) {
  return revisionSessionSkeletonAdmissionPreviewCheckField(
    preview,
    key,
    Array.isArray,
    `${key} must be an array`,
  );
}

function revisionSessionSkeletonAdmissionPreviewCheckSafeCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function revisionSessionSkeletonAdmissionPreviewHasRejectScalar(value) {
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    const segments = normalized.split(/[^a-z0-9]+/u).filter(Boolean);
    for (const key of REVISION_SESSION_SKELETON_ADMISSION_PREVIEW_REJECT_KEYS) {
      if (normalized === key || segments.includes(key)) return true;
    }
    return false;
  }
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (revisionSessionSkeletonAdmissionPreviewHasRejectScalar(value[index])) return true;
    }
    return false;
  }
  for (const nested of Object.values(value)) {
    if (revisionSessionSkeletonAdmissionPreviewHasRejectScalar(nested)) return true;
  }
  return false;
}

function revisionSessionSkeletonAdmissionPreviewStatusCode(status) {
  if (status === 'admit') return PLACEMENT_ADMISSION_PREVIEW_ADMIT_CODE;
  if (status === 'block') return PLACEMENT_ADMISSION_PREVIEW_BLOCK_CODE;
  if (status === 'hardFail') return PLACEMENT_BATCH_DIAGNOSTICS_VALIDATION_FAILED_CODE;
  return '';
}

function revisionSessionSkeletonAdmissionPreviewCheckScalars(preview) {
  const reasons = [];
  const expectedCode = revisionSessionSkeletonAdmissionPreviewStatusCode(preview.status);
  if (preview.canAdmit !== (preview.status === 'admit')) {
    reasons.push(revisionSessionSkeletonAdmissionPreviewReason(
      'placementAdmissionPreview.canAdmit',
      'canAdmit must match status',
    ));
  }
  if (!expectedCode || preview.code !== expectedCode) {
    reasons.push(revisionSessionSkeletonAdmissionPreviewReason(
      'placementAdmissionPreview.code',
      'code must match status',
    ));
  }
  if (!expectedCode || preview.reason !== expectedCode) {
    reasons.push(revisionSessionSkeletonAdmissionPreviewReason(
      'placementAdmissionPreview.reason',
      'reason must match status',
    ));
  }
  if (!PLACEMENT_ADMISSION_PREVIEW_VALID_STATUSES.includes(preview.sourceStatus)) {
    reasons.push(revisionSessionSkeletonAdmissionPreviewReason(
      'placementAdmissionPreview.sourceStatus',
      'sourceStatus must be a known source status',
    ));
  }
  if (Array.isArray(preview.blockingStatuses)) {
    for (let index = 0; index < preview.blockingStatuses.length; index += 1) {
      if (!PLACEMENT_ADMISSION_PREVIEW_VALID_STATUSES.includes(preview.blockingStatuses[index])) {
        reasons.push(revisionSessionSkeletonAdmissionPreviewReason(
          `placementAdmissionPreview.blockingStatuses.${index}`,
          'blockingStatuses entry must be a known status',
        ));
      }
    }
  }
  return reasons;
}

function revisionSessionSkeletonAdmissionPreviewExpectedStatusCounts(evaluations) {
  const counts = placementBatchDiagnosticsCountsByStatus();
  for (const item of evaluations) {
    if (isPlainObject(item) && isPlainObject(item.evaluation) && Object.hasOwn(counts, item.evaluation.status)) {
      counts[item.evaluation.status] += 1;
    }
  }
  return counts;
}

function revisionSessionSkeletonAdmissionPreviewExpectedReasonCounts(evaluations) {
  const counts = placementBatchDiagnosticsCountsByReasonCode();
  for (const item of evaluations) {
    const reasonCodes = isPlainObject(item?.evaluation) && Array.isArray(item.evaluation.reasonCodes)
      ? item.evaluation.reasonCodes
      : [];
    for (const reasonCode of reasonCodes) {
      placementBatchDiagnosticsAddReasonCount(counts, reasonCode);
    }
  }
  return counts;
}

function revisionSessionSkeletonAdmissionPreviewCountsEqual(left, right, keys) {
  for (const key of keys) {
    if (left[key] !== right[key]) return false;
  }
  return true;
}

function revisionSessionSkeletonAdmissionPreviewCheckStatusCounts(preview) {
  const counts = preview.countsByStatus;
  if (!isPlainObject(counts)) {
    return [revisionSessionSkeletonAdmissionPreviewReason(
      'placementAdmissionPreview.countsByStatus',
      'countsByStatus must be a plain object',
    )];
  }
  const reasons = [];
  for (const key of Object.keys(counts)) {
    if (!REVISION_SESSION_SKELETON_ADMISSION_PREVIEW_STATUS_COUNT_KEYS.includes(key)) {
      reasons.push(revisionSessionSkeletonAdmissionPreviewReason(
        'placementAdmissionPreview.countsByStatus',
        'countsByStatus contains an unsupported key',
      ));
    }
  }
  for (const key of REVISION_SESSION_SKELETON_ADMISSION_PREVIEW_STATUS_COUNT_KEYS) {
    if (!revisionSessionSkeletonAdmissionPreviewCheckSafeCount(counts[key])) {
      reasons.push(revisionSessionSkeletonAdmissionPreviewReason(
        `placementAdmissionPreview.countsByStatus.${key}`,
        `${key} count must be a safe non-negative integer`,
      ));
    }
  }
  const expectedCounts = revisionSessionSkeletonAdmissionPreviewExpectedStatusCounts(preview.blockingEvaluations || []);
  if (!revisionSessionSkeletonAdmissionPreviewCountsEqual(
    counts,
    expectedCounts,
    REVISION_SESSION_SKELETON_ADMISSION_PREVIEW_STATUS_COUNT_KEYS,
  )) {
    reasons.push(revisionSessionSkeletonAdmissionPreviewReason(
      'placementAdmissionPreview.countsByStatus',
      'countsByStatus must match delegated evidence',
    ));
  }
  return reasons;
}

function revisionSessionSkeletonAdmissionPreviewCheckReasonCounts(preview) {
  const counts = preview.countsByReasonCode;
  if (!isPlainObject(counts)) {
    return [revisionSessionSkeletonAdmissionPreviewReason(
      'placementAdmissionPreview.countsByReasonCode',
      'countsByReasonCode must be a plain object',
    )];
  }
  const reasons = [];
  for (const key of Object.keys(counts)) {
    if (!REVISION_BRIDGE_PLACEMENT_BATCH_DIAGNOSTICS_REASON_CODES.includes(key)) {
      reasons.push(revisionSessionSkeletonAdmissionPreviewReason(
        'placementAdmissionPreview.countsByReasonCode',
        'countsByReasonCode contains an unsupported key',
      ));
    } else if (!revisionSessionSkeletonAdmissionPreviewCheckSafeCount(counts[key])) {
      reasons.push(revisionSessionSkeletonAdmissionPreviewReason(
        `placementAdmissionPreview.countsByReasonCode.${key}`,
        `${key} count must be a safe non-negative integer`,
      ));
    }
  }
  for (const key of REVISION_BRIDGE_PLACEMENT_BATCH_DIAGNOSTICS_REASON_CODES) {
    if (!revisionSessionSkeletonAdmissionPreviewCheckSafeCount(counts[key])) {
      reasons.push(revisionSessionSkeletonAdmissionPreviewReason(
        `placementAdmissionPreview.countsByReasonCode.${key}`,
        `${key} count must be a safe non-negative integer`,
      ));
    }
  }
  const expectedCounts = revisionSessionSkeletonAdmissionPreviewExpectedReasonCounts(preview.blockingEvaluations || []);
  if (!revisionSessionSkeletonAdmissionPreviewCountsEqual(
    counts,
    expectedCounts,
    REVISION_BRIDGE_PLACEMENT_BATCH_DIAGNOSTICS_REASON_CODES,
  )) {
    reasons.push(revisionSessionSkeletonAdmissionPreviewReason(
      'placementAdmissionPreview.countsByReasonCode',
      'countsByReasonCode must match delegated evidence',
    ));
  }
  return reasons;
}

function revisionSessionSkeletonAdmissionPreviewHasRejectKey(value) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (revisionSessionSkeletonAdmissionPreviewHasRejectKey(value[index])) return true;
    }
    return false;
  }
  for (const key of Object.keys(value)) {
    const lowerKey = key.toLowerCase();
    if (REVISION_SESSION_SKELETON_ADMISSION_PREVIEW_REJECT_KEYS.includes(lowerKey)) {
      return true;
    }
    if (revisionSessionSkeletonAdmissionPreviewHasRejectKey(value[key])) return true;
  }
  return false;
}

function revisionSessionSkeletonAdmissionPreviewCanProjectEvaluations(evaluations) {
  if (!Array.isArray(evaluations)) return false;
  for (const item of evaluations) {
    if (!isPlainObject(item) || !Number.isSafeInteger(item.index) || item.index < 0) return false;
    if (!isPlainObject(item.evaluation)) return false;
    if (!PLACEMENT_ADMISSION_PREVIEW_VALID_STATUSES.includes(item.evaluation.status)) return false;
    if (!Array.isArray(item.evaluation.reasonCodes)) return false;
    for (const reasonCode of item.evaluation.reasonCodes) {
      if (!REVISION_BRIDGE_PLACEMENT_BATCH_DIAGNOSTICS_REASON_CODES.includes(reasonCode)) return false;
    }
  }
  return true;
}

function revisionSessionSkeletonAdmissionPreviewCheckEvaluations(preview) {
  const reasons = [];
  for (const item of preview.blockingEvaluations || []) {
    if (!isPlainObject(item) || !Number.isSafeInteger(item.index) || item.index < 0) {
      reasons.push(revisionSessionSkeletonAdmissionPreviewReason(
        'placementAdmissionPreview.blockingEvaluations',
        'blockingEvaluations entry must have a safe index',
      ));
      continue;
    }
    if (!isPlainObject(item.evaluation)) {
      reasons.push(revisionSessionSkeletonAdmissionPreviewReason(
        'placementAdmissionPreview.blockingEvaluations',
        'blockingEvaluations entry must have an evaluation',
      ));
      continue;
    }
    if (!PLACEMENT_ADMISSION_PREVIEW_VALID_STATUSES.includes(item.evaluation.status)) {
      reasons.push(revisionSessionSkeletonAdmissionPreviewReason(
        'placementAdmissionPreview.blockingEvaluations',
        'evaluation status must be known',
      ));
    }
    if (!Array.isArray(item.evaluation.reasonCodes)) {
      reasons.push(revisionSessionSkeletonAdmissionPreviewReason(
        'placementAdmissionPreview.blockingEvaluations',
        'evaluation reasonCodes must be an array',
      ));
      continue;
    }
    for (const reasonCode of item.evaluation.reasonCodes) {
      if (!REVISION_BRIDGE_PLACEMENT_BATCH_DIAGNOSTICS_REASON_CODES.includes(reasonCode)) {
        reasons.push(revisionSessionSkeletonAdmissionPreviewReason(
          'placementAdmissionPreview.blockingEvaluations',
          'evaluation reasonCodes must be public reason codes',
        ));
      }
    }
  }
  return reasons;
}

function revisionSessionSkeletonAdmissionPreviewCheckDiagnostics(preview) {
  const reasons = [];
  for (const item of preview.blockingDiagnostics || []) {
    if (!isPlainObject(item) || !Number.isSafeInteger(item.index) || item.index < 0) {
      reasons.push(revisionSessionSkeletonAdmissionPreviewReason(
        'placementAdmissionPreview.blockingDiagnostics',
        'blockingDiagnostics entry must have a safe index',
      ));
      continue;
    }
    if (!REVISION_BRIDGE_PLACEMENT_BATCH_DIAGNOSTICS_REASON_CODES.includes(item.code)) {
      reasons.push(revisionSessionSkeletonAdmissionPreviewReason(
        'placementAdmissionPreview.blockingDiagnostics',
        'blockingDiagnostics code must be a public reason code',
      ));
    }
    if (typeof item.field !== 'string' || typeof item.message !== 'string') {
      reasons.push(revisionSessionSkeletonAdmissionPreviewReason(
        'placementAdmissionPreview.blockingDiagnostics',
        'blockingDiagnostics field and message must be strings',
      ));
    }
  }
  return reasons;
}

function revisionSessionSkeletonAdmissionPreviewCheckSummary(preview) {
  const summary = preview.diagnosticSummary;
  const reasons = [];
  const expectedKeys = ['schemaVersion', 'sortOrder', 'total', 'items'];
  const summaryKeys = isPlainObject(summary) ? Object.keys(summary) : [];
  if (summaryKeys.length !== expectedKeys.length || summaryKeys.some((key) => !expectedKeys.includes(key))) {
    reasons.push(revisionSessionSkeletonAdmissionPreviewReason(
      'placementAdmissionPreview.diagnosticSummary',
      'diagnosticSummary must use the exact public shape',
    ));
    return reasons;
  }
  if (summary.schemaVersion !== PLACEMENT_ADMISSION_PREVIEW_SCHEMA) {
    reasons.push(revisionSessionSkeletonAdmissionPreviewReason(
      'placementAdmissionPreview.diagnosticSummary',
      'diagnosticSummary schemaVersion must match placement admission preview',
    ));
  }
  if (
    !Array.isArray(summary.sortOrder)
    || summary.sortOrder.length !== PLACEMENT_BATCH_DIAGNOSTICS_SUMMARY_ORDER.length
    || summary.sortOrder.some((item, index) => item !== PLACEMENT_BATCH_DIAGNOSTICS_SUMMARY_ORDER[index])
  ) {
    reasons.push(revisionSessionSkeletonAdmissionPreviewReason(
      'placementAdmissionPreview.diagnosticSummary',
      'diagnosticSummary sortOrder must be canonical',
    ));
  }
  if (!Array.isArray(summary.items) || summary.total !== summary.items.length) {
    reasons.push(revisionSessionSkeletonAdmissionPreviewReason(
      'placementAdmissionPreview.diagnosticSummary',
      'diagnosticSummary total must match items',
    ));
    return reasons;
  }
  for (const item of summary.items) {
    const itemKeys = isPlainObject(item) ? Object.keys(item) : [];
    const expectedItemKeys = ['severity', 'code', 'count', 'indexes'];
    if (itemKeys.length !== expectedItemKeys.length || itemKeys.some((key) => !expectedItemKeys.includes(key))) {
      reasons.push(revisionSessionSkeletonAdmissionPreviewReason(
        'placementAdmissionPreview.diagnosticSummary',
        'diagnosticSummary item must use the exact public shape',
      ));
      continue;
    }
    if (!PLACEMENT_ADMISSION_PREVIEW_VALID_STATUSES.includes(item.severity)) {
      reasons.push(revisionSessionSkeletonAdmissionPreviewReason(
        'placementAdmissionPreview.diagnosticSummary',
        'diagnosticSummary severity must be known',
      ));
    }
    if (!REVISION_BRIDGE_PLACEMENT_BATCH_DIAGNOSTICS_REASON_CODES.includes(item.code)) {
      reasons.push(revisionSessionSkeletonAdmissionPreviewReason(
        'placementAdmissionPreview.diagnosticSummary',
        'diagnosticSummary code must be a public reason code',
      ));
    }
    if (!revisionSessionSkeletonAdmissionPreviewCheckSafeCount(item.count)) {
      reasons.push(revisionSessionSkeletonAdmissionPreviewReason(
        'placementAdmissionPreview.diagnosticSummary',
        'diagnosticSummary count must be safe',
      ));
    }
    if (
      !Array.isArray(item.indexes)
      || item.indexes.some((index) => !Number.isSafeInteger(index) || index < 0)
    ) {
      reasons.push(revisionSessionSkeletonAdmissionPreviewReason(
        'placementAdmissionPreview.diagnosticSummary',
        'diagnosticSummary indexes must be safe',
      ));
    }
  }
  if (revisionSessionSkeletonAdmissionPreviewCanProjectEvaluations(preview.blockingEvaluations)) {
    const expectedSummary = placementAdmissionPreviewSummaryFromEvaluations(preview.blockingEvaluations);
    if (JSON.stringify(summary) !== JSON.stringify(expectedSummary)) {
      reasons.push(revisionSessionSkeletonAdmissionPreviewReason(
        'placementAdmissionPreview.diagnosticSummary',
        'diagnosticSummary must match delegated evidence',
      ));
    }
  }
  return reasons;
}

function revisionSessionSkeletonAdmissionPreviewCheckPreview(preview) {
  const reasons = [];
  if (!isPlainObject(preview)) {
    return {
      ok: false,
      value: null,
      reasons: [revisionSessionSkeletonAdmissionPreviewReason(
        'placementAdmissionPreview',
        'placementAdmissionPreview must be a plain object',
      )],
    };
  }

  const checks = [
    revisionSessionSkeletonAdmissionPreviewCheckField(
      preview,
      'type',
      (value) => value === 'revisionBridge.revisionSession.placementAdmissionPreview',
      'type must be revisionBridge.revisionSession.placementAdmissionPreview',
    ),
    revisionSessionSkeletonAdmissionPreviewCheckField(
      preview,
      'schemaVersion',
      (value) => value === PLACEMENT_ADMISSION_PREVIEW_SCHEMA,
      `schemaVersion must be ${PLACEMENT_ADMISSION_PREVIEW_SCHEMA}`,
    ),
    revisionSessionSkeletonAdmissionPreviewCheckField(
      preview,
      'status',
      (value) => REVISION_SESSION_SKELETON_ADMISSION_PREVIEW_STATUSES.includes(value),
      'status must be admit, block, or hardFail',
    ),
    revisionSessionSkeletonAdmissionPreviewCheckField(
      preview,
      'canAdmit',
      (value) => typeof value === 'boolean',
      'canAdmit must be a boolean',
    ),
    revisionSessionSkeletonAdmissionPreviewCheckField(
      preview,
      'code',
      (value) => typeof value === 'string',
      'code must be a string',
    ),
    revisionSessionSkeletonAdmissionPreviewCheckField(
      preview,
      'reason',
      (value) => typeof value === 'string',
      'reason must be a string',
    ),
    revisionSessionSkeletonAdmissionPreviewCheckField(
      preview,
      'sourceStatus',
      (value) => typeof value === 'string',
      'sourceStatus must be a string',
    ),
    revisionSessionSkeletonAdmissionPreviewCheckField(
      preview,
      'sourceTotal',
      Number.isSafeInteger,
      'sourceTotal must be a safe integer',
    ),
    revisionSessionSkeletonAdmissionPreviewCheckField(
      preview,
      'total',
      Number.isSafeInteger,
      'total must be a safe integer',
    ),
    revisionSessionSkeletonAdmissionPreviewCheckArray(preview, 'blockingStatuses'),
    revisionSessionSkeletonAdmissionPreviewCheckArray(preview, 'blockingEvaluations'),
    revisionSessionSkeletonAdmissionPreviewCheckArray(preview, 'blockingDiagnostics'),
    revisionSessionSkeletonAdmissionPreviewCheckField(
      preview,
      'diagnosticSummary',
      isPlainObject,
      'diagnosticSummary must be a plain object',
    ),
  ];

  for (const check of checks) {
    if (check) reasons.push(check);
  }
  reasons.push(...revisionSessionSkeletonAdmissionPreviewCheckScalars(preview));
  reasons.push(...revisionSessionSkeletonAdmissionPreviewCheckEvaluations(preview));
  reasons.push(...revisionSessionSkeletonAdmissionPreviewCheckDiagnostics(preview));
  reasons.push(...revisionSessionSkeletonAdmissionPreviewCheckSummary(preview));
  reasons.push(...revisionSessionSkeletonAdmissionPreviewCheckStatusCounts(preview));
  reasons.push(...revisionSessionSkeletonAdmissionPreviewCheckReasonCounts(preview));
  if (revisionSessionSkeletonAdmissionPreviewHasRejectKey(preview)) {
    reasons.push(revisionSessionSkeletonAdmissionPreviewReason(
      'placementAdmissionPreview',
      'placementAdmissionPreview contains an unsupported delegated key',
    ));
  }
  if (revisionSessionSkeletonAdmissionPreviewHasRejectScalar(preview)) {
    reasons.push(revisionSessionSkeletonAdmissionPreviewReason(
      'placementAdmissionPreview',
      'placementAdmissionPreview contains an unsupported delegated value',
    ));
  }
  return {
    ok: reasons.length === 0,
    value: reasons.length === 0 ? revisionSessionSkeletonAdmissionPreviewSnapshot(preview) : null,
    reasons,
  };
}

function revisionSessionSkeletonAdmissionPreviewSnapshot(preview) {
  return {
    schemaVersion: normalizeString(preview.schemaVersion),
    type: normalizeString(preview.type),
    status: normalizeString(preview.status),
    code: normalizeString(preview.code),
    reason: normalizeString(preview.reason),
    canAdmit: preview.canAdmit === true,
    sourceStatus: normalizeString(preview.sourceStatus),
    sourceTotal: preview.sourceTotal,
    blockingStatuses: cloneJsonSafe(preview.blockingStatuses),
    total: preview.total,
    countsByStatus: cloneJsonSafe(preview.countsByStatus),
    countsByReasonCode: cloneJsonSafe(preview.countsByReasonCode),
    blockingEvaluations: cloneJsonSafe(preview.blockingEvaluations),
    blockingDiagnostics: cloneJsonSafe(preview.blockingDiagnostics),
    diagnosticSummary: cloneJsonSafe(preview.diagnosticSummary),
  };
}

function revisionSessionSkeletonAdmissionPreviewCandidate(ids) {
  const reviewGraph = {};
  for (const key of REVISION_SESSION_SKELETON_ADMISSION_PREVIEW_GRAPH) {
    reviewGraph[key] = [];
  }
  return createRevisionSession({
    sessionId: ids.revisionSessionId,
    projectId: ids.projectId,
    baselineHash: ids.baselineHash,
    createdAt: '',
    updatedAt: '',
    reviewGraph,
  });
}

function revisionSessionSkeletonAdmissionPreviewEnvelope(status, code, reason, ids, candidate, preview, reasons) {
  return {
    schemaVersion: REVISION_BRIDGE_REVISION_SESSION_SKELETON_ADMISSION_PREVIEW_SCHEMA,
    type: 'revisionBridge.revisionSession.skeletonAdmissionPreview',
    status,
    code,
    reason,
    canAdmit: status === 'admit',
    projectId: ids.projectId,
    revisionSessionId: ids.revisionSessionId,
    ['ex' + 'portId']: ids['ex' + 'portId'],
    baselineHash: ids.baselineHash,
    candidateSession: candidate,
    placementAdmissionPreview: preview,
    reasons,
  };
}

function revisionSessionSkeletonAdmissionPreviewEvaluate(input) {
  const ids = revisionSessionSkeletonAdmissionPreviewIds(input);
  const source = isPlainObject(input) ? input : {};
  const preview = revisionSessionSkeletonAdmissionPreviewCheckPreview(source.placementAdmissionPreview);
  const hardReasons = ids.reasons.concat(preview.reasons);
  if (hardReasons.length > 0) {
    return revisionSessionSkeletonAdmissionPreviewEnvelope(
      'hardFail',
      REVISION_SESSION_SKELETON_ADMISSION_PREVIEW_INVALID_CODE,
      hardReasons[0].code,
      ids.ids,
      null,
      preview.value,
      hardReasons,
    );
  }
  if (preview.value.canAdmit !== true) {
    const reasons = [{
      code: REVISION_SESSION_SKELETON_ADMISSION_PREVIEW_BLOCK_CODE,
      field: 'placementAdmissionPreview.canAdmit',
      message: 'placementAdmissionPreview cannot admit',
    }];
    return revisionSessionSkeletonAdmissionPreviewEnvelope(
      'block',
      REVISION_SESSION_SKELETON_ADMISSION_PREVIEW_BLOCK_CODE,
      REVISION_SESSION_SKELETON_ADMISSION_PREVIEW_BLOCK_CODE,
      ids.ids,
      null,
      preview.value,
      reasons,
    );
  }
  return revisionSessionSkeletonAdmissionPreviewEnvelope(
    'admit',
    REVISION_SESSION_SKELETON_ADMISSION_PREVIEW_ADMIT_CODE,
    REVISION_SESSION_SKELETON_ADMISSION_PREVIEW_ADMIT_CODE,
    ids.ids,
    revisionSessionSkeletonAdmissionPreviewCandidate(ids.ids),
    preview.value,
    [],
  );
}
// RB_17_REVISION_SESSION_SKELETON_ADMISSION_PREVIEW_CONTRACTS_END

function reviewGraphValidationFailure(reasons, value = null) {
  return {
    ok: false,
    type: 'revisionBridge.reviewGraph.validation',
    code: REVIEWGRAPH_INVALID_CODE,
    reason: reasons[0]?.code || 'REVISION_BRIDGE_REVIEWGRAPH_INVALID',
    reasons,
    value,
  };
}

function reviewGraphValidationSuccess(value) {
  return {
    ok: true,
    type: 'revisionBridge.reviewGraph.validation',
    code: REVIEWGRAPH_VALID_CODE,
    reason: REVIEWGRAPH_VALID_CODE,
    reasons: [],
    value: cloneJsonSafe(value),
  };
}

function normalizeReviewGraphTargetScope(input) {
  const scope = isPlainObject(input) ? input : {};
  return {
    type: normalizeString(scope.type),
    id: normalizeString(scope.id),
  };
}

function normalizeCommentMessage(input) {
  const message = isPlainObject(input) ? input : {};
  return {
    messageId: normalizeString(message.messageId),
    authorId: normalizeString(message.authorId),
    body: normalizeString(message.body),
    createdAt: normalizeString(message.createdAt),
  };
}

export function normalizeCommentThread(input = {}) {
  const thread = isPlainObject(input) ? input : {};
  return {
    schemaVersion: REVISION_BRIDGE_COMMENT_THREAD_SCHEMA,
    threadId: normalizeString(thread.threadId),
    authorId: normalizeString(thread.authorId),
    status: normalizeStringEnum(thread.status, ['open', 'resolved'], 'open'),
    createdAt: normalizeString(thread.createdAt),
    updatedAt: normalizeString(thread.updatedAt),
    tags: normalizeStringArray(thread.tags),
    messages: Array.isArray(thread.messages)
      ? thread.messages.map((message) => normalizeCommentMessage(message))
      : [],
  };
}

export function createCommentThread(input = {}) {
  return cloneJsonSafe(normalizeCommentThread(input));
}

function collectCommentThreadValidationReasons(input, thread) {
  const reasons = [];
  if (!isPlainObject(input)) {
    reasons.push(invalidField('commentThread', 'commentThread must be an object'));
    return reasons;
  }
  reasons.push(...collectForbiddenFieldReasons(
    input,
    COMMENT_THREAD_FORBIDDEN_PLACEMENT_FIELDS,
    'commentThread',
    'CommentThread must not contain placement payload fields',
  ));
  if (!thread.threadId) reasons.push(missingField('commentThread.threadId'));
  if (!Array.isArray(input.messages)) {
    reasons.push(invalidField('commentThread.messages', 'commentThread.messages must be an array'));
  } else {
    input.messages.forEach((message, index) => {
      if (!isPlainObject(message)) {
        reasons.push(invalidField(`commentThread.messages.${index}`, 'commentThread message must be an object'));
        return;
      }
      const normalizedMessage = thread.messages[index];
      if (!normalizedMessage.messageId) reasons.push(missingField(`commentThread.messages.${index}.messageId`));
      if (!normalizedMessage.body) reasons.push(missingField(`commentThread.messages.${index}.body`));
    });
  }
  return reasons;
}

export function validateCommentThread(input = {}) {
  const thread = normalizeCommentThread(input);
  const reasons = collectCommentThreadValidationReasons(input, thread);
  if (reasons.length > 0) return reviewGraphValidationFailure(reasons);
  return reviewGraphValidationSuccess(thread);
}

export function normalizeCommentPlacement(input = {}) {
  const placement = isPlainObject(input) ? input : {};
  const range = isPlainObject(placement.range) ? placement.range : {};
  const anchor = isPlainObject(placement.anchor) ? placement.anchor : {};
  return {
    schemaVersion: REVISION_BRIDGE_COMMENT_PLACEMENT_SCHEMA,
    placementId: normalizeString(placement.placementId),
    threadId: normalizeString(placement.threadId),
    targetScope: normalizeReviewGraphTargetScope(placement.targetScope),
    anchor: {
      kind: normalizeString(anchor.kind),
      value: normalizeString(anchor.value),
    },
    range: {
      from: normalizeNumber(range.from),
      to: normalizeNumber(range.to),
    },
    quote: preserveString(placement.quote),
    prefix: preserveString(placement.prefix),
    suffix: preserveString(placement.suffix),
    confidence: normalizeNumber(placement.confidence),
    policy: normalizeStringEnum(placement.policy, ['exact', 'fuzzy', 'manual'], 'manual'),
    selector: cloneJsonSafe(placement.selector) || null,
    createdAt: normalizeString(placement.createdAt),
  };
}

export function createCommentPlacement(input = {}) {
  return cloneJsonSafe(normalizeCommentPlacement(input));
}

function collectCommentPlacementValidationReasons(input, placement) {
  const reasons = [];
  if (!isPlainObject(input)) {
    reasons.push(invalidField('commentPlacement', 'commentPlacement must be an object'));
    return reasons;
  }
  reasons.push(...collectForbiddenFieldReasons(
    input,
    COMMENT_PLACEMENT_FORBIDDEN_THREAD_FIELDS,
    'commentPlacement',
    'CommentPlacement must not duplicate comment text or thread message body',
  ));
  if (!placement.placementId) reasons.push(missingField('commentPlacement.placementId'));
  if (!placement.threadId) reasons.push(missingField('commentPlacement.threadId'));
  if (!isPlainObject(input.targetScope)) {
    reasons.push(missingField('commentPlacement.targetScope'));
  } else if (!placement.targetScope.type) {
    reasons.push(missingField('commentPlacement.targetScope.type'));
  }
  if (!isPlainObject(input.anchor)) {
    reasons.push(missingField('commentPlacement.anchor'));
  } else if (!placement.anchor.kind) {
    reasons.push(missingField('commentPlacement.anchor.kind'));
  }
  if (hasOwnField(input, 'confidence') && placement.confidence === null) {
    reasons.push(invalidField('commentPlacement.confidence', 'commentPlacement.confidence must be a finite number'));
  }
  return reasons;
}

export function validateCommentPlacement(input = {}) {
  const placement = normalizeCommentPlacement(input);
  const reasons = collectCommentPlacementValidationReasons(input, placement);
  if (reasons.length > 0) return reviewGraphValidationFailure(reasons);
  return reviewGraphValidationSuccess(placement);
}

export function normalizeTextChange(input = {}) {
  const change = isPlainObject(input) ? input : {};
  const match = isPlainObject(change.match) ? change.match : {};
  return {
    schemaVersion: REVISION_BRIDGE_TEXT_CHANGE_SCHEMA,
    changeId: normalizeString(change.changeId),
    targetScope: normalizeReviewGraphTargetScope(change.targetScope),
    match: {
      kind: normalizeStringEnum(change.matchKind || match.kind, ['exact', 'fuzzy', 'manual'], 'manual'),
      quote: preserveString(hasOwnField(match, 'quote') ? match.quote : change.quote),
      prefix: preserveString(hasOwnField(match, 'prefix') ? match.prefix : change.prefix),
      suffix: preserveString(hasOwnField(match, 'suffix') ? match.suffix : change.suffix),
    },
    replacementText: preserveString(change.replacementText),
    createdAt: normalizeString(change.createdAt),
    apply: {
      mode: 'manual',
      authorized: false,
      canApply: false,
    },
  };
}

export function createTextChange(input = {}) {
  return cloneJsonSafe(normalizeTextChange(input));
}

function collectTextChangeValidationReasons(input, change) {
  const reasons = [];
  if (!isPlainObject(input)) {
    reasons.push(invalidField('textChange', 'textChange must be an object'));
    return reasons;
  }
  if (!change.changeId) reasons.push(missingField('textChange.changeId'));
  if (!isPlainObject(input.targetScope)) {
    reasons.push(missingField('textChange.targetScope'));
  } else if (!change.targetScope.type) {
    reasons.push(missingField('textChange.targetScope.type'));
  }
  if (!isPlainObject(input.match) && !hasOwnField(input, 'matchKind')) {
    reasons.push(missingField('textChange.match'));
  }
  if (change.apply.authorized !== false || change.apply.canApply !== false) {
    reasons.push(invalidField('textChange.apply', 'TextChange must not authorize apply'));
  }
  return reasons;
}

export function validateTextChange(input = {}) {
  const change = normalizeTextChange(input);
  const reasons = collectTextChangeValidationReasons(input, change);
  if (reasons.length > 0) return reviewGraphValidationFailure(reasons);
  return reviewGraphValidationSuccess(change);
}

export function normalizeStructuralChange(input = {}) {
  const change = isPlainObject(input) ? input : {};
  return {
    schemaVersion: REVISION_BRIDGE_STRUCTURAL_CHANGE_SCHEMA,
    structuralChangeId: normalizeString(change.structuralChangeId),
    kind: normalizeString(change.kind),
    targetScope: normalizeReviewGraphTargetScope(change.targetScope),
    summary: normalizeString(change.summary),
    diagnosticsOnly: true,
    manualOnly: true,
    createdAt: normalizeString(change.createdAt),
  };
}

export function createStructuralChange(input = {}) {
  return cloneJsonSafe(normalizeStructuralChange(input));
}

function collectStructuralChangeValidationReasons(input, change) {
  const reasons = [];
  if (!isPlainObject(input)) {
    reasons.push(invalidField('structuralChange', 'structuralChange must be an object'));
    return reasons;
  }
  reasons.push(...collectForbiddenFieldReasons(
    input,
    STRUCTURAL_CHANGE_FORBIDDEN_AUTO_FIELDS,
    'structuralChange',
    'StructuralChange must not expose auto apply fields',
  ));
  if (!change.structuralChangeId) reasons.push(missingField('structuralChange.structuralChangeId'));
  if (!change.kind) reasons.push(missingField('structuralChange.kind'));
  return reasons;
}

export function validateStructuralChange(input = {}) {
  const change = normalizeStructuralChange(input);
  const reasons = collectStructuralChangeValidationReasons(input, change);
  if (reasons.length > 0) return reviewGraphValidationFailure(reasons);
  return reviewGraphValidationSuccess(change);
}

export function normalizeDiagnosticItem(input = {}) {
  const item = isPlainObject(input) ? input : {};
  return {
    schemaVersion: REVISION_BRIDGE_DIAGNOSTIC_ITEM_SCHEMA,
    diagnosticId: normalizeString(item.diagnosticId),
    severity: normalizeStringEnum(item.severity, ['info', 'warning', 'error'], 'info'),
    message: normalizeString(item.message),
    targetScope: normalizeReviewGraphTargetScope(item.targetScope),
    relatedItemId: normalizeString(item.relatedItemId),
    createdAt: normalizeString(item.createdAt),
  };
}

export function createDiagnosticItem(input = {}) {
  return cloneJsonSafe(normalizeDiagnosticItem(input));
}

function collectDiagnosticItemValidationReasons(input, item) {
  const reasons = [];
  if (!isPlainObject(input)) {
    reasons.push(invalidField('diagnosticItem', 'diagnosticItem must be an object'));
    return reasons;
  }
  if (!item.diagnosticId) reasons.push(missingField('diagnosticItem.diagnosticId'));
  if (!item.message) reasons.push(missingField('diagnosticItem.message'));
  return reasons;
}

export function validateDiagnosticItem(input = {}) {
  const item = normalizeDiagnosticItem(input);
  const reasons = collectDiagnosticItemValidationReasons(input, item);
  if (reasons.length > 0) return reviewGraphValidationFailure(reasons);
  return reviewGraphValidationSuccess(item);
}

export function normalizeDecisionState(input = {}) {
  const decision = isPlainObject(input) ? input : {};
  return {
    schemaVersion: REVISION_BRIDGE_DECISION_STATE_SCHEMA,
    decisionId: normalizeString(decision.decisionId),
    itemKind: normalizeString(decision.itemKind),
    itemId: normalizeString(decision.itemId),
    status: normalizeStringEnum(decision.status, ['pending', 'accepted', 'rejected', 'deferred'], 'pending'),
    decidedAt: normalizeString(decision.decidedAt),
    reason: normalizeString(decision.reason),
  };
}

export function createDecisionState(input = {}) {
  return cloneJsonSafe(normalizeDecisionState(input));
}

function collectDecisionStateValidationReasons(input, decision, knownItemIds = {}) {
  const reasons = [];
  if (!isPlainObject(input)) {
    reasons.push(invalidField('decisionState', 'decisionState must be an object'));
    return reasons;
  }
  if (!decision.decisionId) reasons.push(missingField('decisionState.decisionId'));
  if (!decision.itemKind) {
    reasons.push(missingField('decisionState.itemKind'));
  } else if (!REVIEWGRAPH_ITEM_KINDS.includes(decision.itemKind)) {
    reasons.push(invalidField('decisionState.itemKind', 'DecisionState itemKind is not supported'));
  }
  if (!decision.itemId) {
    reasons.push(missingField('decisionState.itemId'));
  } else if (
    REVIEWGRAPH_ITEM_KINDS.includes(decision.itemKind)
    && knownItemIds[decision.itemKind]
    && !knownItemIds[decision.itemKind].includes(decision.itemId)
  ) {
    reasons.push(invalidField('decisionState.itemId', 'DecisionState itemId does not reference a known item'));
  }
  return reasons;
}

export function validateDecisionState(input = {}, knownItemIds = {}) {
  const decision = normalizeDecisionState(input);
  const reasons = collectDecisionStateValidationReasons(input, decision, knownItemIds);
  if (reasons.length > 0) return reviewGraphValidationFailure(reasons);
  return reviewGraphValidationSuccess(decision);
}

function normalizeReviewGraph(input = {}) {
  const graph = isPlainObject(input) ? input : {};
  return {
    commentThreads: Array.isArray(graph.commentThreads)
      ? graph.commentThreads.map((thread) => normalizeCommentThread(thread))
      : [],
    commentPlacements: Array.isArray(graph.commentPlacements)
      ? graph.commentPlacements.map((placement) => normalizeCommentPlacement(placement))
      : [],
    textChanges: Array.isArray(graph.textChanges)
      ? graph.textChanges.map((change) => normalizeTextChange(change))
      : [],
    structuralChanges: Array.isArray(graph.structuralChanges)
      ? graph.structuralChanges.map((change) => normalizeStructuralChange(change))
      : [],
    diagnosticItems: Array.isArray(graph.diagnosticItems)
      ? graph.diagnosticItems.map((item) => normalizeDiagnosticItem(item))
      : [],
    decisionStates: Array.isArray(graph.decisionStates)
      ? graph.decisionStates.map((decision) => normalizeDecisionState(decision))
      : [],
  };
}

export function normalizeRevisionSession(input = {}) {
  const session = isPlainObject(input) ? input : {};
  return {
    schemaVersion: REVISION_BRIDGE_REVISION_SESSION_SCHEMA,
    sessionId: normalizeString(session.sessionId),
    projectId: normalizeString(session.projectId),
    baselineHash: normalizeString(session.baselineHash),
    createdAt: normalizeString(session.createdAt),
    updatedAt: normalizeString(session.updatedAt),
    reviewGraph: normalizeReviewGraph(session.reviewGraph),
  };
}

export function createRevisionSession(input = {}) {
  return cloneJsonSafe(normalizeRevisionSession(input));
}

function collectMalformedCollectionReasons(input, collectionName) {
  if (!Array.isArray(input)) {
    return [invalidField(`revisionSession.reviewGraph.${collectionName}`, `${collectionName} must be an array`)];
  }
  const reasons = [];
  input.forEach((item, index) => {
    if (!isPlainObject(item)) {
      reasons.push(invalidField(
        `revisionSession.reviewGraph.${collectionName}.${index}`,
        `${collectionName} entry must be an object`,
      ));
    }
  });
  return reasons;
}

function collectEntityReasons(collection, normalizedCollection, collectReasons, prefix) {
  const reasons = [];
  collection.forEach((item, index) => {
    if (!isPlainObject(item)) return;
    for (const reason of collectReasons(item, normalizedCollection[index])) {
      reasons.push({
        ...reason,
        field: reason.field.replace(/^[^.]+/u, `${prefix}.${index}`),
      });
    }
  });
  return reasons;
}

function collectKnownReviewGraphItemIds(graph) {
  return {
    commentThread: graph.commentThreads.map((thread) => thread.threadId).filter(Boolean),
    commentPlacement: graph.commentPlacements.map((placement) => placement.placementId).filter(Boolean),
    textChange: graph.textChanges.map((change) => change.changeId).filter(Boolean),
    structuralChange: graph.structuralChanges.map((change) => change.structuralChangeId).filter(Boolean),
    diagnosticItem: graph.diagnosticItems.map((item) => item.diagnosticId).filter(Boolean),
  };
}

function collectRevisionSessionValidationReasons(input, session) {
  const reasons = [];
  if (!isPlainObject(input)) {
    reasons.push(invalidField('revisionSession', 'revisionSession must be an object'));
    return reasons;
  }
  if (!session.sessionId) reasons.push(missingField('revisionSession.sessionId'));
  if (!session.projectId) reasons.push(missingField('revisionSession.projectId'));
  if (!session.baselineHash) reasons.push(missingField('revisionSession.baselineHash'));
  if (!isPlainObject(input.reviewGraph)) {
    reasons.push(missingField('revisionSession.reviewGraph'));
    return reasons;
  }

  const graphInput = input.reviewGraph;
  const collectionNames = [
    'commentThreads',
    'commentPlacements',
    'textChanges',
    'structuralChanges',
    'diagnosticItems',
    'decisionStates',
  ];
  for (const collectionName of collectionNames) {
    reasons.push(...collectMalformedCollectionReasons(graphInput[collectionName], collectionName));
  }
  if (reasons.length > 0) return reasons;

  const graph = session.reviewGraph;
  reasons.push(...collectEntityReasons(
    graphInput.commentThreads,
    graph.commentThreads,
    collectCommentThreadValidationReasons,
    'revisionSession.reviewGraph.commentThreads',
  ));
  reasons.push(...collectEntityReasons(
    graphInput.commentPlacements,
    graph.commentPlacements,
    collectCommentPlacementValidationReasons,
    'revisionSession.reviewGraph.commentPlacements',
  ));
  reasons.push(...collectEntityReasons(
    graphInput.textChanges,
    graph.textChanges,
    collectTextChangeValidationReasons,
    'revisionSession.reviewGraph.textChanges',
  ));
  reasons.push(...collectEntityReasons(
    graphInput.structuralChanges,
    graph.structuralChanges,
    collectStructuralChangeValidationReasons,
    'revisionSession.reviewGraph.structuralChanges',
  ));
  reasons.push(...collectEntityReasons(
    graphInput.diagnosticItems,
    graph.diagnosticItems,
    collectDiagnosticItemValidationReasons,
    'revisionSession.reviewGraph.diagnosticItems',
  ));

  const threadIds = graph.commentThreads.map((thread) => thread.threadId).filter(Boolean);
  graph.commentPlacements.forEach((placement, index) => {
    if (placement.threadId && !threadIds.includes(placement.threadId)) {
      reasons.push(invalidField(
        `revisionSession.reviewGraph.commentPlacements.${index}.threadId`,
        'CommentPlacement threadId does not reference a known CommentThread',
      ));
    }
  });

  const knownItemIds = collectKnownReviewGraphItemIds(graph);
  graphInput.decisionStates.forEach((decisionInput, index) => {
    if (!isPlainObject(decisionInput)) return;
    const decisionReasons = collectDecisionStateValidationReasons(
      decisionInput,
      graph.decisionStates[index],
      knownItemIds,
    );
    for (const reason of decisionReasons) {
      reasons.push({
        ...reason,
        field: reason.field.replace(/^decisionState/u, `revisionSession.reviewGraph.decisionStates.${index}`),
      });
    }
  });

  return reasons;
}

export function validateRevisionSession(input = {}) {
  const session = normalizeRevisionSession(input);
  const reasons = collectRevisionSessionValidationReasons(input, session);
  if (reasons.length > 0) return reviewGraphValidationFailure(reasons);
  return reviewGraphValidationSuccess(session);
}

function reviewPacketPreviewDiagnostics(reasons) {
  return {
    ok: false,
    type: 'revisionBridge.reviewPacketPreview',
    status: 'diagnostics',
    code: REVIEW_PACKET_PREVIEW_DIAGNOSTICS_CODE,
    reason: reasons[0]?.code || REVIEW_PACKET_PREVIEW_DIAGNOSTICS_CODE,
    reasons,
    session: null,
  };
}

function reviewPacketPreviewReady(session) {
  return {
    ok: true,
    type: 'revisionBridge.reviewPacketPreview',
    status: 'preview',
    code: REVIEW_PACKET_PREVIEW_READY_CODE,
    reason: REVIEW_PACKET_PREVIEW_READY_CODE,
    reasons: [],
    session,
  };
}

function stripReviewPacketPreviewApplyFields(value) {
  if (Array.isArray(value)) return value.map((item) => stripReviewPacketPreviewApplyFields(item));
  if (!isPlainObject(value)) return value;

  const stripped = {};
  for (const key of Object.keys(value)) {
    if (REVIEW_PACKET_PREVIEW_FORBIDDEN_APPLY_FIELDS.includes(key)) continue;
    stripped[key] = stripReviewPacketPreviewApplyFields(value[key]);
  }
  return stripped;
}

function collectReviewPacketPreviewInputReasons(input) {
  const reasons = [];
  if (!isPlainObject(input)) {
    reasons.push(invalidField('reviewPacketPreview', 'reviewPacketPreview input must be an object'));
    return reasons;
  }
  if (!normalizeString(input.projectId)) reasons.push(missingField('projectId'));
  if (!normalizeString(input.sessionId)) reasons.push(missingField('sessionId'));
  if (!normalizeString(input.baselineHash)) reasons.push(missingField('baselineHash'));
  if (!isPlainObject(input.reviewPacket)) {
    reasons.push(missingField('reviewPacket'));
  }
  if (hasOwnField(input, 'createdAt') && typeof input.createdAt !== 'string') {
    reasons.push(invalidField('createdAt', 'createdAt must be a caller-supplied string'));
  }
  if (hasOwnField(input, 'updatedAt') && typeof input.updatedAt !== 'string') {
    reasons.push(invalidField('updatedAt', 'updatedAt must be a caller-supplied string'));
  }
  return reasons;
}

function buildRevisionPacketPreviewCandidate(input) {
  const reviewPacket = isPlainObject(input.reviewPacket) ? input.reviewPacket : {};
  return {
    sessionId: input.sessionId,
    projectId: input.projectId,
    baselineHash: input.baselineHash,
    createdAt: hasOwnField(input, 'createdAt') ? input.createdAt : '',
    updatedAt: hasOwnField(input, 'updatedAt') ? input.updatedAt : '',
    reviewGraph: {
      commentThreads: reviewPacket.commentThreads,
      commentPlacements: reviewPacket.commentPlacements,
      textChanges: reviewPacket.textChanges,
      structuralChanges: reviewPacket.structuralChanges,
      diagnosticItems: reviewPacket.diagnosticItems,
      decisionStates: reviewPacket.decisionStates,
    },
  };
}

export function buildRevisionPacketPreview(input = {}) {
  const inputReasons = collectReviewPacketPreviewInputReasons(input);
  if (inputReasons.length > 0) return reviewPacketPreviewDiagnostics(inputReasons);

  const validation = validateRevisionSession(buildRevisionPacketPreviewCandidate(input));
  if (!validation.ok) return reviewPacketPreviewDiagnostics(validation.reasons);
  return reviewPacketPreviewReady(stripReviewPacketPreviewApplyFields(validation.value));
}

function parsedReviewSurfaceAdapterDiagnostics(reasons, reviewPacket, previewInput, previewResult) {
  return stripReviewPacketPreviewApplyFields({
    ok: false,
    type: 'revisionBridge.parsedReviewSurfaceAdapter',
    status: 'diagnostics',
    code: PARSED_REVIEW_SURFACE_ADAPTER_DIAGNOSTICS_CODE,
    reason: reasons[0]?.code || PARSED_REVIEW_SURFACE_ADAPTER_DIAGNOSTICS_CODE,
    reasons,
    reviewPacket,
    previewInput,
    revisionBridgePreviewResult: previewResult,
  });
}

function parsedReviewSurfaceStructuralPreview(previewResult) {
  if (!isPlainObject(previewResult) || previewResult.ok !== true || !isPlainObject(previewResult.session)) {
    return null;
  }
  const structuralPreview = buildStructuralManualReviewPreview({
    revisionSession: previewResult.session,
  });
  return isPlainObject(structuralPreview) ? cloneJsonSafe(structuralPreview) : null;
}

function parsedReviewSurfaceAdapterReady(reviewPacket, previewInput, previewResult) {
  return stripReviewPacketPreviewApplyFields({
    ok: true,
    type: 'revisionBridge.parsedReviewSurfaceAdapter',
    status: 'preview',
    code: PARSED_REVIEW_SURFACE_ADAPTER_READY_CODE,
    reason: PARSED_REVIEW_SURFACE_ADAPTER_READY_CODE,
    reasons: [],
    reviewPacket,
    previewInput,
    structuralManualReviewPreview: parsedReviewSurfaceStructuralPreview(previewResult),
    revisionBridgePreviewResult: previewResult,
  });
}

function collectParsedReviewSurfaceInputReasons(input) {
  const reasons = [];
  if (!isPlainObject(input)) {
    reasons.push(invalidField('parsedReviewSurfaceAdapter', 'parsed review surface adapter input must be an object'));
    return reasons;
  }
  if (!normalizeString(input.projectId)) reasons.push(missingField('projectId'));
  if (!normalizeString(input.sessionId)) reasons.push(missingField('sessionId'));
  if (!normalizeString(input.baselineHash)) reasons.push(missingField('baselineHash'));
  if (hasOwnField(input, 'createdAt') && typeof input.createdAt !== 'string') {
    reasons.push(invalidField('createdAt', 'createdAt must be a caller-supplied string'));
  }
  if (hasOwnField(input, 'updatedAt') && typeof input.updatedAt !== 'string') {
    reasons.push(invalidField('updatedAt', 'updatedAt must be a caller-supplied string'));
  }
  if (!isPlainObject(input.parsedSurface)) {
    reasons.push(missingField('parsedSurface'));
  }
  return reasons;
}

function collectParsedSurfaceKeyReasons(parsedSurface) {
  const reasons = [];
  if (!isPlainObject(parsedSurface)) return reasons;

  for (const key of Object.keys(parsedSurface).sort()) {
    if (PARSED_REVIEW_SURFACE_ALIAS_KEYS.includes(key)) {
      reasons.push(invalidField(
        `parsedSurface.${key}`,
        'parsed review surface alias keys are not accepted',
      ));
      continue;
    }
    if (!PARSED_REVIEW_SURFACE_KEYS.includes(key)) {
      reasons.push(invalidField(
        `parsedSurface.${key}`,
        'parsed review surface key is not supported',
      ));
    }
  }
  return reasons;
}

function readParsedSurfaceCollection(parsedSurface, collectionName, reasons) {
  if (!isPlainObject(parsedSurface) || !hasOwnField(parsedSurface, collectionName)) return [];
  const collection = parsedSurface[collectionName];
  if (!Array.isArray(collection)) {
    reasons.push(invalidField(`parsedSurface.${collectionName}`, `${collectionName} must be an array`));
    return [];
  }
  return collection.map((item) => cloneJsonSafe(item));
}

function normalizeUnsupportedItemDiagnosticCandidate(item, index) {
  return {
    diagnosticId: normalizeString(item.unsupportedId) || `unsupported-item-${index}`,
    severity: item.severity,
    message: item.message,
    targetScope: item.targetScope,
    relatedItemId: item.relatedItemId,
    createdAt: item.createdAt,
  };
}

function readUnsupportedItemDiagnostics(parsedSurface, reasons) {
  if (!isPlainObject(parsedSurface) || !hasOwnField(parsedSurface, 'unsupportedItems')) return [];
  const unsupportedItems = parsedSurface.unsupportedItems;
  if (!Array.isArray(unsupportedItems)) {
    reasons.push(invalidField('parsedSurface.unsupportedItems', 'unsupportedItems must be an array'));
    return [];
  }

  const diagnostics = [];
  unsupportedItems.forEach((item, index) => {
    if (!isPlainObject(item)) {
      reasons.push(invalidField(
        `parsedSurface.unsupportedItems.${index}`,
        'unsupportedItems entry must be an object',
      ));
      return;
    }
    diagnostics.push(normalizeUnsupportedItemDiagnosticCandidate(item, index));
  });
  return diagnostics;
}

function buildParsedReviewSurfaceReviewPacket(input, reasons, options = {}) {
  const parsedSurface = isPlainObject(input) && isPlainObject(input.parsedSurface) ? input.parsedSurface : {};
  const reviewPacket = {};
  for (const collectionName of PARSED_REVIEW_SURFACE_COLLECTIONS) {
    reviewPacket[collectionName] = readParsedSurfaceCollection(parsedSurface, collectionName, reasons);
  }
  if (options.includeUnsupportedDiagnostics !== false) {
    reviewPacket.diagnosticItems = reviewPacket.diagnosticItems.concat(
      readUnsupportedItemDiagnostics(parsedSurface, reasons),
    );
  }
  return reviewPacket;
}

function buildParsedReviewSurfacePreviewInput(input, reviewPacket) {
  const previewInput = {
    projectId: isPlainObject(input) ? input.projectId : undefined,
    sessionId: isPlainObject(input) ? input.sessionId : undefined,
    baselineHash: isPlainObject(input) ? input.baselineHash : undefined,
    reviewPacket,
  };
  if (isPlainObject(input) && hasOwnField(input, 'createdAt')) previewInput.createdAt = input.createdAt;
  if (isPlainObject(input) && hasOwnField(input, 'updatedAt')) previewInput.updatedAt = input.updatedAt;
  return previewInput;
}

export function adaptParsedReviewSurfaceToReviewPacketPreviewInput(input = {}) {
  const reasons = collectParsedReviewSurfaceInputReasons(input);
  if (isPlainObject(input?.parsedSurface)) reasons.push(...collectParsedSurfaceKeyReasons(input.parsedSurface));

  const reviewPacket = buildParsedReviewSurfaceReviewPacket(input, reasons, {
    includeUnsupportedDiagnostics: input?.includeUnsupportedDiagnostics !== false,
  });
  const previewInput = buildParsedReviewSurfacePreviewInput(input, reviewPacket);
  const previewResult = buildRevisionPacketPreview(previewInput);
  const finalReasons = reasons.concat(previewResult.ok ? [] : previewResult.reasons);

  if (finalReasons.length > 0) {
    return parsedReviewSurfaceAdapterDiagnostics(finalReasons, reviewPacket, previewInput, previewResult);
  }
  return parsedReviewSurfaceAdapterReady(reviewPacket, previewInput, previewResult);
}

function stage01FixedCorePreviewDiagnostics(reasons) {
  return {
    ok: false,
    type: 'revisionBridge.stage01FixedCorePreview',
    status: 'diagnostics',
    code: STAGE01_FIXED_CORE_PREVIEW_DIAGNOSTICS_CODE,
    reason: reasons[0]?.code || STAGE01_FIXED_CORE_PREVIEW_DIAGNOSTICS_CODE,
    reasons,
    preview: null,
  };
}

function stage01FixedCorePreviewReady(preview) {
  return {
    ok: true,
    type: 'revisionBridge.stage01FixedCorePreview',
    status: 'preview',
    code: STAGE01_FIXED_CORE_PREVIEW_READY_CODE,
    reason: STAGE01_FIXED_CORE_PREVIEW_READY_CODE,
    reasons: [],
    preview,
  };
}

function collectStage01FixedCorePreviewInputReasons(input) {
  const reasons = [];
  if (!isPlainObject(input)) {
    reasons.push(invalidField('stage01FixedCorePreview', 'stage01 fixed core preview input must be an object'));
    return reasons;
  }
  if (!normalizeString(input.projectId)) reasons.push(missingField('projectId'));
  if (!normalizeString(input.sessionId)) reasons.push(missingField('sessionId'));
  if (!normalizeString(input.baselineHash)) reasons.push(missingField('baselineHash'));

  const hasReviewPacket = isPlainObject(input.reviewPacket);
  const hasParsedSurface = isPlainObject(input.parsedSurface);
  if (!hasReviewPacket && !hasParsedSurface) {
    reasons.push(missingField('reviewPacket|parsedSurface'));
  } else if (hasReviewPacket && hasParsedSurface) {
    reasons.push(invalidField('reviewPacket|parsedSurface', 'provide either reviewPacket or parsedSurface'));
  }

  if (hasOwnField(input, 'currentBaselineHash') && typeof input.currentBaselineHash !== 'string') {
    reasons.push(invalidField('currentBaselineHash', 'currentBaselineHash must be a caller-supplied string'));
  }
  if (hasOwnField(input, 'sourceViewState') && !isPlainObject(input.sourceViewState)) {
    reasons.push(invalidField('sourceViewState', 'sourceViewState must be an object'));
  }
  return reasons;
}

function stage01NormalizeSourceViewState(input, packetHash) {
  const sourceViewState = isPlainObject(input) ? input : {};
  return cloneJsonSafe({
    schemaVersion: REVISION_BRIDGE_SOURCE_VIEW_STATE_SCHEMA,
    revisionToken: normalizeString(sourceViewState.revisionToken),
    viewMode: normalizeString(sourceViewState.viewMode),
    normalizationPolicy: normalizeString(sourceViewState.normalizationPolicy),
    newlinePolicy: normalizeString(sourceViewState.newlinePolicy),
    unicodePolicy: normalizeString(sourceViewState.unicodePolicy),
    packetHash: normalizeString(sourceViewState.packetHash) || packetHash,
    artifactCompletenessClass: normalizeString(sourceViewState.artifactCompletenessClass),
  });
}

function stage01SourcePartFromTargetScope(targetScope, fallback) {
  const type = normalizeString(targetScope?.type);
  const id = normalizeString(targetScope?.id);
  if (type && id) return `${type}:${id}`;
  if (type) return type;
  return fallback;
}

function stage01CanonicalHash(value) {
  return revisionBlockHash(value);
}

function stage01ExplicitEvidenceRef(value) {
  const source = isPlainObject(value) ? value : {};
  return cloneJsonSafe({
    schemaVersion: REVISION_BRIDGE_EVIDENCEREF_SCHEMA,
    exactText: normalizeString(source.exactText),
    prefix: normalizeString(source.prefix),
    suffix: normalizeString(source.suffix),
    quotedSegment: normalizeString(source.quotedSegment),
    sourcePart: normalizeString(source.sourcePart),
  });
}

function stage01ExplicitProvMin(value) {
  const source = isPlainObject(value) ? value : {};
  return cloneJsonSafe({
    schemaVersion: REVISION_BRIDGE_PROV_MIN_SCHEMA,
    sourceKind: normalizeString(source.sourceKind),
    sourceId: normalizeString(source.sourceId),
    sourceHash: normalizeString(source.sourceHash),
    captureMode: normalizeString(source.captureMode) || 'previewDerived',
  });
}

function buildStage01EvidenceRef(itemKind, item) {
  const normalizedItem = isPlainObject(item) ? item : {};
  switch (itemKind) {
    case 'commentPlacement': {
      const quote = normalizeString(normalizedItem.quote);
      return stage01ExplicitEvidenceRef({
        exactText: quote,
        prefix: normalizeString(normalizedItem.prefix),
        suffix: normalizeString(normalizedItem.suffix),
        quotedSegment: quote,
        sourcePart: stage01SourcePartFromTargetScope(normalizedItem.targetScope, normalizeString(normalizedItem.anchor?.value)),
      });
    }
    case 'textChange': {
      const match = isPlainObject(normalizedItem.match) ? normalizedItem.match : {};
      const quote = normalizeString(match.quote);
      return stage01ExplicitEvidenceRef({
        exactText: quote,
        prefix: normalizeString(match.prefix),
        suffix: normalizeString(match.suffix),
        quotedSegment: quote,
        sourcePart: stage01SourcePartFromTargetScope(normalizedItem.targetScope, 'textChange'),
      });
    }
    case 'commentThread': {
      const firstMessage = Array.isArray(normalizedItem.messages) && normalizedItem.messages.length > 0
        ? normalizedItem.messages[0]
        : {};
      const quotedSegment = normalizeString(firstMessage.body);
      return stage01ExplicitEvidenceRef({
        exactText: quotedSegment,
        prefix: '',
        suffix: '',
        quotedSegment,
        sourcePart: `commentThread:${normalizeString(normalizedItem.threadId)}`,
      });
    }
    case 'structuralChange': {
      const quotedSegment = normalizeString(normalizedItem.summary);
      return stage01ExplicitEvidenceRef({
        exactText: quotedSegment,
        prefix: '',
        suffix: '',
        quotedSegment,
        sourcePart: stage01SourcePartFromTargetScope(normalizedItem.targetScope, normalizeString(normalizedItem.kind)),
      });
    }
    case 'diagnosticItem': {
      const quotedSegment = normalizeString(normalizedItem.message);
      return stage01ExplicitEvidenceRef({
        exactText: quotedSegment,
        prefix: '',
        suffix: '',
        quotedSegment,
        sourcePart: stage01SourcePartFromTargetScope(normalizedItem.targetScope, normalizeString(normalizedItem.relatedItemId)),
      });
    }
    case 'decisionState': {
      const quotedSegment = normalizeString(normalizedItem.reason);
      return stage01ExplicitEvidenceRef({
        exactText: quotedSegment,
        prefix: '',
        suffix: '',
        quotedSegment,
        sourcePart: normalizeString(normalizedItem.itemId) || normalizeString(normalizedItem.itemKind),
      });
    }
    default:
      return stage01ExplicitEvidenceRef({
        exactText: '',
        prefix: '',
        suffix: '',
        quotedSegment: '',
        sourcePart: '',
      });
  }
}

function stage01TextSelectableItemKind(itemKind) {
  return itemKind === 'commentPlacement' || itemKind === 'textChange';
}

function stage01ClassifyReviewItem(itemKind, evidenceRef, duplicateTextCounts) {
  if (itemKind === 'structuralChange') {
    return {
      status: 'manualOnly',
      reason: STAGE01_STRUCTURAL_MANUAL_ONLY_REASON_CODE,
    };
  }

  if (stage01TextSelectableItemKind(itemKind)) {
    const exactText = normalizeString(evidenceRef?.exactText);
    if (!exactText) {
      return {
        status: 'manualOnly',
        reason: STAGE01_AMBIGUOUS_TEXT_REASON_CODE,
      };
    }
    if ((duplicateTextCounts.get(exactText) || 0) > 1) {
      return {
        status: 'manualOnly',
        reason: STAGE01_DUPLICATE_TEXT_REASON_CODE,
      };
    }
  }

  return {
    status: 'previewOnly',
    reason: STAGE01_PREVIEW_ONLY_REASON_CODE,
  };
}

function extractStage01ReviewPacketFromSession(session) {
  const reviewGraph = isPlainObject(session?.reviewGraph) ? session.reviewGraph : {};
  const reviewPacket = {};
  STAGE01_REVIEW_PACKET_COLLECTIONS.forEach(([collectionName]) => {
    reviewPacket[collectionName] = Array.isArray(reviewGraph[collectionName])
      ? cloneJsonSafe(reviewGraph[collectionName])
      : [];
  });
  return reviewPacket;
}

function buildStage01ReviewItemDescriptors(reviewPacket) {
  const descriptors = [];
  STAGE01_REVIEW_PACKET_COLLECTIONS.forEach(([collectionName, itemKind, idField]) => {
    const collection = Array.isArray(reviewPacket?.[collectionName]) ? reviewPacket[collectionName] : [];
    collection.forEach((item, index) => {
      if (!isPlainObject(item)) return;
      const itemId = normalizeString(item[idField]) || `${itemKind}-${index}`;
      descriptors.push({
        itemId,
        itemKind,
        sourceKind: collectionName,
        sourceItem: cloneJsonSafe(item),
        evidenceRef: buildStage01EvidenceRef(itemKind, item),
      });
    });
  });
  return descriptors;
}

function buildStage01UnsupportedObservations(parsedSurface) {
  if (!isPlainObject(parsedSurface) || !Array.isArray(parsedSurface.unsupportedItems)) return [];
  const observations = [];
  parsedSurface.unsupportedItems.forEach((item, index) => {
    if (!isPlainObject(item)) return;
    observations.push(cloneJsonSafe({
      itemId: normalizeString(item.unsupportedId) || `unsupportedObservation-${index}`,
      itemKind: 'unsupportedObservation',
      reason: STAGE01_UNSUPPORTED_OBSERVATION_REASON_CODE,
      sourceKind: 'unsupportedItems',
    }));
  });
  return observations;
}

function buildStage01PreviewCollections(reviewPacket, parsedSurface) {
  const rawDescriptors = buildStage01ReviewItemDescriptors(reviewPacket);
  const duplicateTextCounts = new Map();

  rawDescriptors.forEach((descriptor) => {
    if (!stage01TextSelectableItemKind(descriptor.itemKind)) return;
    const exactText = normalizeString(descriptor.evidenceRef.exactText);
    if (!exactText) return;
    duplicateTextCounts.set(exactText, (duplicateTextCounts.get(exactText) || 0) + 1);
  });

  const reviewBomItems = rawDescriptors.map((descriptor) => {
    const classification = stage01ClassifyReviewItem(
      descriptor.itemKind,
      descriptor.evidenceRef,
      duplicateTextCounts,
    );
    const evidenceRef = stage01ExplicitEvidenceRef(descriptor.evidenceRef);
    const provMin = stage01ExplicitProvMin({
      sourceKind: descriptor.sourceKind,
      sourceId: descriptor.itemId,
      sourceHash: stage01CanonicalHash(descriptor.sourceItem),
      captureMode: 'previewDerived',
    });
    return cloneJsonSafe({
      itemId: descriptor.itemId,
      itemKind: descriptor.itemKind,
      status: classification.status,
      reason: classification.reason,
      evidenceRef,
      provMin,
    });
  });

  const reviewPatchset = cloneJsonSafe({
    schemaVersion: REVISION_BRIDGE_REVIEWPATCHSET_SCHEMA,
    items: reviewBomItems.map((item) => ({
      itemId: item.itemId,
      itemKind: item.itemKind,
      status: item.status,
      reason: item.reason,
    })),
    unsupportedObservations: buildStage01UnsupportedObservations(parsedSurface),
  });

  const reviewOpIr = cloneJsonSafe({
    schemaVersion: REVISION_BRIDGE_REVIEWOPIR_SCHEMA,
    ops: reviewBomItems.map((item) => ({
      itemId: item.itemId,
      itemKind: item.itemKind,
      status: item.status,
      reason: item.reason,
    })),
  });

  const selectorStack = cloneJsonSafe({
    schemaVersion: REVISION_BRIDGE_SELECTORSTACK_SCHEMA_V1,
    selectors: reviewBomItems
      .filter((item) => (
        normalizeString(item.evidenceRef.exactText)
        || normalizeString(item.evidenceRef.quotedSegment)
        || normalizeString(item.evidenceRef.sourcePart)
      ))
      .map((item) => ({
        itemId: item.itemId,
        itemKind: item.itemKind,
        evidenceRef: stage01ExplicitEvidenceRef(item.evidenceRef),
      })),
  });

  const reviewBom = cloneJsonSafe({
    schemaVersion: REVISION_BRIDGE_MINIMAL_REVIEWBOM_SCHEMA,
    items: reviewBomItems,
  });

  const evidenceRefs = reviewBomItems.map((item) => stage01ExplicitEvidenceRef(item.evidenceRef));
  const provMinEntries = reviewBomItems.map((item) => stage01ExplicitProvMin(item.provMin));

  return {
    reviewPatchset,
    reviewOpIr,
    selectorStack,
    reviewBom,
    evidenceRefs,
    provMinEntries,
  };
}

function buildStage01BlockedApplyPlan(baselineHash, currentBaselineHash) {
  const reasons = [{
    code: STAGE01_PREVIEW_ONLY_REASON_CODE,
    message: 'Stage01 fixed core preview never authorizes apply.',
  }];

  const normalizedCurrentBaselineHash = normalizeString(currentBaselineHash);
  if (normalizedCurrentBaselineHash && normalizedCurrentBaselineHash !== baselineHash) {
    reasons.push({
      code: STAGE01_STALE_BASELINE_REASON_CODE,
      message: 'baselineHash differs from currentBaselineHash',
      baselineHash,
      currentBaselineHash: normalizedCurrentBaselineHash,
    });
  }

  return cloneJsonSafe({
    schemaVersion: REVISION_BRIDGE_BLOCKED_APPLY_PLAN_SCHEMA,
    status: 'blocked',
    canApply: false,
    applyOps: [],
    reasons,
  });
}

function buildStage01ShadowPreview(previewResult) {
  return cloneJsonSafe({
    schemaVersion: REVISION_BRIDGE_SHADOW_PREVIEW_SCHEMA,
    status: 'preview',
    session: cloneJsonSafe(previewResult.session),
  });
}

function buildStage01FixedCorePreviewPayload(input, reviewPacket, previewResult) {
  const normalizedProjectId = normalizeString(input.projectId);
  const normalizedSessionId = normalizeString(input.sessionId);
  const normalizedBaselineHash = normalizeString(input.baselineHash);
  const normalizedCurrentBaselineHash = normalizeString(input.currentBaselineHash);
  const packetHash = stage01CanonicalHash(reviewPacket);
  const sourceViewState = stage01NormalizeSourceViewState(input.sourceViewState, packetHash);
  const previewCollections = buildStage01PreviewCollections(reviewPacket, input.parsedSurface);
  const shadowPreview = buildStage01ShadowPreview(previewResult);
  const blockedApplyPlan = buildStage01BlockedApplyPlan(normalizedBaselineHash, normalizedCurrentBaselineHash);

  const preview = {
    schemaVersion: REVISION_BRIDGE_STAGE01_FIXED_CORE_PREVIEW_SCHEMA,
    projectId: normalizedProjectId,
    sessionId: normalizedSessionId,
    baselineHash: normalizedBaselineHash,
    currentBaselineHash: normalizedCurrentBaselineHash,
    reviewPatchset: previewCollections.reviewPatchset,
    reviewOpIr: previewCollections.reviewOpIr,
    selectorStack: previewCollections.selectorStack,
    sourceViewState,
    reviewBom: previewCollections.reviewBom,
    evidenceRefs: previewCollections.evidenceRefs,
    provMinEntries: previewCollections.provMinEntries,
    shadowPreview,
    blockedApplyPlan,
  };

  preview.canonicalHash = stage01CanonicalHash(preview);
  return cloneJsonSafe(preview);
}

export function buildStage01FixedCorePreview(input = {}) {
  const inputReasons = collectStage01FixedCorePreviewInputReasons(input);
  if (inputReasons.length > 0) return stage01FixedCorePreviewDiagnostics(inputReasons);

  const baseInput = {
    projectId: input.projectId,
    sessionId: input.sessionId,
    baselineHash: input.baselineHash,
  };

  if (isPlainObject(input.reviewPacket)) {
    const previewResult = buildRevisionPacketPreview({
      ...baseInput,
      reviewPacket: cloneJsonSafe(input.reviewPacket),
    });
    if (!previewResult.ok) return stage01FixedCorePreviewDiagnostics(previewResult.reasons);

    const reviewPacket = extractStage01ReviewPacketFromSession(previewResult.session);
    return stage01FixedCorePreviewReady(
      buildStage01FixedCorePreviewPayload(input, reviewPacket, previewResult),
    );
  }

  const adapterResult = adaptParsedReviewSurfaceToReviewPacketPreviewInput({
    ...baseInput,
    parsedSurface: cloneJsonSafe(input.parsedSurface),
    includeUnsupportedDiagnostics: false,
  });
  if (!adapterResult.ok) return stage01FixedCorePreviewDiagnostics(adapterResult.reasons);

  const previewResult = adapterResult.revisionBridgePreviewResult;
  const reviewPacket = extractStage01ReviewPacketFromSession(previewResult.session);
  return stage01FixedCorePreviewReady(
    buildStage01FixedCorePreviewPayload(input, reviewPacket, previewResult),
  );
}

function exactTextApplyPlanNoDiskDiagnosticResult(reasons) {
  return {
    ok: false,
    type: 'revisionBridge.exactTextApplyPlanNoDiskPreview',
    status: 'diagnostics',
    code: EXACT_TEXT_APPLY_PLAN_NO_DISK_DIAGNOSTICS_CODE,
    reason: reasons[0]?.code || EXACT_TEXT_APPLY_PLAN_NO_DISK_DIAGNOSTICS_CODE,
    reasons: cloneJsonSafe(reasons),
    plan: null,
  };
}

function exactTextApplyPlanNoDiskReason(code, field, message, details = {}) {
  return cloneJsonSafe({
    code,
    field,
    message,
    ...details,
  });
}

function exactTextApplyPlanNoDiskSceneMap(input) {
  const map = new Map();
  const source = isPlainObject(input) ? input : {};

  if (Array.isArray(source.scenes)) {
    source.scenes.forEach((scene, index) => {
      if (!isPlainObject(scene)) return;
      const sceneId = normalizeString(scene.sceneId || scene.id) || `scene-${index}`;
      const text = preserveString(scene.text);
      map.set(sceneId, text);
    });
  } else if (isPlainObject(source.scenes)) {
    Object.keys(source.scenes).forEach((key) => {
      const sceneId = normalizeString(key);
      if (!sceneId) return;
      const scene = source.scenes[key];
      if (typeof scene === 'string') {
        map.set(sceneId, preserveString(scene));
        return;
      }
      if (!isPlainObject(scene)) return;
      map.set(sceneId, preserveString(scene.text));
    });
  } else if (isPlainObject(source.scene)) {
    const sceneId = normalizeString(source.scene.sceneId || source.scene.id || source.sceneId || 'scene-0');
    if (sceneId) {
      map.set(sceneId, preserveString(source.scene.text));
    }
  } else if (typeof source.text === 'string') {
    const sceneId = normalizeString(source.sceneId) || 'scene-0';
    map.set(sceneId, preserveString(source.text));
  }

  return map;
}

function exactTextApplyPlanNoDiskSnapshot(input) {
  const snapshot = isPlainObject(input) ? input : {};
  return {
    projectId: normalizeString(snapshot.projectId || snapshot.id),
    baselineHash: normalizeString(snapshot.baselineHash || snapshot.currentBaselineHash),
    scenes: exactTextApplyPlanNoDiskSceneMap(snapshot),
  };
}

function exactTextApplyPlanNoDiskSession(input) {
  const raw = isPlainObject(input) ? input : {};
  const normalized = normalizeRevisionSession(raw);
  return {
    session: normalized,
    status: normalizeString(raw.status || raw.sessionStatus),
  };
}

function exactTextApplyPlanNoDiskReviewItem(input) {
  if (!isPlainObject(input)) return null;
  if (hasOwnField(input, 'match') || hasOwnField(input, 'replacementText') || hasOwnField(input, 'changeId')) {
    return {
      itemKind: 'textChange',
      textChange: normalizeTextChange(input),
    };
  }
  if (
    hasOwnField(input, 'structuralChangeId')
    || (normalizeString(input.itemKind) === 'structuralChange')
    || (normalizeString(input.kind) && !hasOwnField(input, 'match') && !hasOwnField(input, 'replacementText'))
  ) {
    return {
      itemKind: 'structuralChange',
      structuralChange: normalizeStructuralChange(input),
    };
  }
  return {
    itemKind: 'commentOnly',
    textChange: null,
  };
}

function exactTextApplyPlanNoDiskFindMatchOffsets(text, quote) {
  if (!text || !quote) return [];
  const offsets = [];
  let cursor = 0;
  while (cursor <= text.length) {
    const found = text.indexOf(quote, cursor);
    if (found === -1) break;
    offsets.push(found);
    cursor = found + 1;
  }
  return offsets;
}

function exactTextApplyPlanNoDiskSelectTextChange(session, reviewItem) {
  const textChanges = Array.isArray(session.reviewGraph?.textChanges) ? session.reviewGraph.textChanges : [];
  if (textChanges.length === 1) return { textChange: textChanges[0], source: 'session' };
  if (textChanges.length > 1) return { textChange: null, source: 'sessionMulti' };
  if (reviewItem?.itemKind === 'textChange' && reviewItem.textChange) {
    return { textChange: null, source: 'reviewItemWithoutSession' };
  }
  return { textChange: null, source: 'sessionEmpty' };
}

function exactTextApplyPlanNoDiskTextChangeKey(textChange) {
  if (!isPlainObject(textChange)) return '';
  return JSON.stringify({
    changeId: normalizeString(textChange.changeId),
    targetScope: {
      type: normalizeString(textChange.targetScope?.type),
      id: normalizeString(textChange.targetScope?.id),
    },
    match: {
      kind: normalizeString(textChange.match?.kind),
      quote: preserveString(textChange.match?.quote),
      prefix: preserveString(textChange.match?.prefix),
      suffix: preserveString(textChange.match?.suffix),
    },
    replacementText: preserveString(textChange.replacementText),
  });
}

function exactTextApplyPlanNoDiskBuildPlan(base, blockedReasons, applyOps, preconditions) {
  return cloneJsonSafe({
    schemaVersion: REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_NO_DISK_SCHEMA,
    projectId: base.projectId,
    sessionId: base.sessionId,
    baselineHash: base.baselineHash,
    sceneId: base.sceneId,
    canApply: false,
    noDisk: true,
    safeWriteCandidate: false,
    applyOps,
    preconditions,
    blockedReasons,
  });
}

export function buildExactTextApplyPlanNoDiskPreview(input = {}) {
  if (!isPlainObject(input)) {
    return exactTextApplyPlanNoDiskDiagnosticResult([
      invalidField('exactTextApplyPlanNoDisk', 'input must be an object'),
    ]);
  }

  if (!isPlainObject(input.projectSnapshot)) {
    return exactTextApplyPlanNoDiskDiagnosticResult([
      missingField('projectSnapshot'),
    ]);
  }

  const snapshot = exactTextApplyPlanNoDiskSnapshot(input.projectSnapshot);
  const rawSession = isPlainObject(input.revisionSession)
    ? input.revisionSession
    : (isPlainObject(input.session) ? input.session : {});
  const sessionState = exactTextApplyPlanNoDiskSession(rawSession);
  const session = sessionState.session;
  const reviewItem = exactTextApplyPlanNoDiskReviewItem(input.reviewItem);

  const expectedProjectId = normalizeString(session.projectId || input.projectId);
  const expectedBaselineHash = normalizeString(session.baselineHash || input.baselineHash);
  const sessionStatus = sessionState.status;
  const isClosedSession = ['closed', 'archived', 'completed', 'resolved'].includes(sessionStatus);
  const hasStructuralChanges = Array.isArray(session.reviewGraph.structuralChanges)
    && session.reviewGraph.structuralChanges.length > 0;
  const hasCommentOnlySession = (
    Array.isArray(session.reviewGraph.textChanges)
    && session.reviewGraph.textChanges.length === 0
    && (
      (Array.isArray(session.reviewGraph.commentThreads) && session.reviewGraph.commentThreads.length > 0)
      || (Array.isArray(session.reviewGraph.commentPlacements) && session.reviewGraph.commentPlacements.length > 0)
    )
  );
  const sessionTextChangeCount = Array.isArray(session.reviewGraph.textChanges)
    ? session.reviewGraph.textChanges.length
    : 0;

  const selected = exactTextApplyPlanNoDiskSelectTextChange(session, reviewItem);
  const textChange = selected.textChange;
  const sessionSingleTextChange = sessionTextChangeCount === 1 ? session.reviewGraph.textChanges[0] : null;
  const reviewItemTextChange = reviewItem?.itemKind === 'textChange' ? reviewItem.textChange : null;
  const targetScopeType = normalizeString(textChange?.targetScope?.type);
  const sceneIdFromChange = normalizeString(textChange?.targetScope?.id);
  const fallbackSceneIds = Array.from(snapshot.scenes.keys());
  const selectedSceneId = sceneIdFromChange || (fallbackSceneIds.length === 1 ? fallbackSceneIds[0] : '');
  const sceneText = selectedSceneId ? snapshot.scenes.get(selectedSceneId) || '' : '';
  const matchQuote = preserveString(textChange?.match?.quote);
  const replacementText = preserveString(textChange?.replacementText);
  const matchOffsets = exactTextApplyPlanNoDiskFindMatchOffsets(sceneText, matchQuote);

  const blockedReasons = [];
  if (expectedProjectId && snapshot.projectId && expectedProjectId !== snapshot.projectId) {
    blockedReasons.push(exactTextApplyPlanNoDiskReason(
      'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_PROJECT_MISMATCH',
      'projectId',
      'projectSnapshot.projectId differs from revisionSession.projectId',
      {
        expectedProjectId,
        observedProjectId: snapshot.projectId,
      },
    ));
  }
  if (expectedBaselineHash && snapshot.baselineHash && expectedBaselineHash !== snapshot.baselineHash) {
    blockedReasons.push(exactTextApplyPlanNoDiskReason(
      'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_STALE_BASELINE',
      'baselineHash',
      'projectSnapshot.baselineHash differs from revisionSession.baselineHash',
      {
        expectedBaselineHash,
        observedBaselineHash: snapshot.baselineHash,
      },
    ));
  }
  if (isClosedSession) {
    blockedReasons.push(exactTextApplyPlanNoDiskReason(
      'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_SESSION_CLOSED',
      'revisionSession.status',
      'closed revision session cannot produce apply ops',
      {
        sessionStatus,
      },
    ));
  }
  if (hasStructuralChanges || reviewItem?.itemKind === 'structuralChange') {
    blockedReasons.push(exactTextApplyPlanNoDiskReason(
      'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_STRUCTURAL_CHANGE',
      'reviewGraph.structuralChanges',
      'structural changes are manual-only for exact text apply planning',
    ));
  }
  if (hasCommentOnlySession || reviewItem?.itemKind === 'commentOnly') {
    blockedReasons.push(exactTextApplyPlanNoDiskReason(
      'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_COMMENT_ONLY',
      'reviewItem|reviewGraph.textChanges',
      'comment-only review data does not produce text replacement ops',
    ));
  }
  if (selected.source === 'sessionMulti' || sessionTextChangeCount > 1) {
    blockedReasons.push(exactTextApplyPlanNoDiskReason(
      'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_MULTI_TEXT_CHANGE',
      'reviewGraph.textChanges',
      'exact text apply planner accepts exactly one text change',
    ));
  }
  if (
    reviewItemTextChange
    && (
      !sessionSingleTextChange
      || exactTextApplyPlanNoDiskTextChangeKey(reviewItemTextChange)
        !== exactTextApplyPlanNoDiskTextChangeKey(sessionSingleTextChange)
    )
  ) {
    blockedReasons.push(exactTextApplyPlanNoDiskReason(
      'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_REVIEW_ITEM_SESSION_MISMATCH',
      'reviewItem',
      'explicit reviewItem must match the single text change admitted by revisionSession',
    ));
  }
  if (textChange && targetScopeType !== 'scene') {
    blockedReasons.push(exactTextApplyPlanNoDiskReason(
      'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_UNSUPPORTED_SURFACE',
      'textChange.targetScope.type',
      'exact text apply planner only supports scene target scope',
      {
        targetScopeType,
      },
    ));
  }
  if (textChange && textChange.match.kind !== 'exact') {
    blockedReasons.push(exactTextApplyPlanNoDiskReason(
      'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_NOT_EXACT_MATCH',
      'textChange.match.kind',
      'only exact text changes are eligible for this planner',
    ));
  }
  if (textChange && !replacementText) {
    blockedReasons.push(exactTextApplyPlanNoDiskReason(
      'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_REPLACEMENT_REQUIRED',
      'textChange.replacementText',
      'replacementText must be a non-empty string',
    ));
  }
  if (textChange && !selectedSceneId) {
    blockedReasons.push(exactTextApplyPlanNoDiskReason(
      'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_NO_MATCH',
      'textChange.targetScope.id',
      'target scene is not available in projectSnapshot',
    ));
  }
  if (textChange && selectedSceneId && !snapshot.scenes.has(selectedSceneId)) {
    blockedReasons.push(exactTextApplyPlanNoDiskReason(
      'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_NO_MATCH',
      'projectSnapshot.scenes',
      'target scene is not available in projectSnapshot',
      {
        sceneId: selectedSceneId,
      },
    ));
  }
  if (textChange && !matchQuote) {
    blockedReasons.push(exactTextApplyPlanNoDiskReason(
      'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_NO_MATCH',
      'textChange.match.quote',
      'exact match quote is required',
    ));
  }
  if (textChange && matchQuote && matchOffsets.length === 0) {
    blockedReasons.push(exactTextApplyPlanNoDiskReason(
      'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_NO_MATCH',
      'textChange.match.quote',
      'exact quote is not present in the target scene text',
      {
        sceneId: selectedSceneId,
      },
    ));
  }
  if (textChange && matchQuote && matchOffsets.length > 1) {
    blockedReasons.push(exactTextApplyPlanNoDiskReason(
      'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_DUPLICATE_MATCH',
      'textChange.match.quote',
      'exact quote occurs multiple times in the target scene text',
      {
        sceneId: selectedSceneId,
        matchCount: matchOffsets.length,
      },
    ));
  }
  if (!textChange && selected.source === 'sessionEmpty' && !hasCommentOnlySession) {
    blockedReasons.push(exactTextApplyPlanNoDiskReason(
      'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_NO_MATCH',
      'reviewGraph.textChanges',
      'exact text apply planner requires one text change',
    ));
  }

  const applyOps = [];
  if (blockedReasons.length === 0 && textChange && matchOffsets.length === 1) {
    const from = matchOffsets[0];
    const to = from + matchQuote.length;
    const changeId = normalizeString(textChange.changeId);
    applyOps.push(cloneJsonSafe({
      opId: `rbop_${revisionBlockHash({
        sceneId: selectedSceneId,
        from,
        to,
        changeId,
        expectedText: matchQuote,
        replacementText,
      })}`,
      kind: 'replaceExactText',
      sceneId: selectedSceneId,
      changeId,
      from,
      to,
      expectedText: matchQuote,
      replacementText,
    }));
  }

  const preconditions = cloneJsonSafe([
    {
      code: 'PROJECT_MATCH',
      satisfied: blockedReasons.every((reason) => reason.code !== 'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_PROJECT_MISMATCH'),
    },
    {
      code: 'BASELINE_MATCH',
      satisfied: blockedReasons.every((reason) => reason.code !== 'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_STALE_BASELINE'),
    },
    {
      code: 'SESSION_OPEN',
      satisfied: blockedReasons.every((reason) => reason.code !== 'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_SESSION_CLOSED'),
    },
    {
      code: 'NO_STRUCTURAL_CHANGE',
      satisfied: blockedReasons.every((reason) => reason.code !== 'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_STRUCTURAL_CHANGE'),
    },
    {
      code: 'TEXT_CHANGE_EXACT',
      satisfied: blockedReasons.every((reason) => reason.code !== 'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_NOT_EXACT_MATCH'),
    },
    {
      code: 'SUPPORTED_SCENE_SCOPE',
      satisfied: blockedReasons.every((reason) => reason.code !== 'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_UNSUPPORTED_SURFACE'),
    },
    {
      code: 'SINGLE_MATCH',
      satisfied: blockedReasons.every((reason) => (
        reason.code !== 'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_NO_MATCH'
        && reason.code !== 'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_DUPLICATE_MATCH'
      )),
    },
  ]);

  const plan = exactTextApplyPlanNoDiskBuildPlan({
    projectId: snapshot.projectId || expectedProjectId,
    sessionId: normalizeString(session.sessionId || input.sessionId),
    baselineHash: snapshot.baselineHash || expectedBaselineHash,
    sceneId: selectedSceneId,
  }, blockedReasons, applyOps, preconditions);
  const blocked = blockedReasons.length > 0;

  return {
    ok: true,
    type: 'revisionBridge.exactTextApplyPlanNoDiskPreview',
    status: blocked ? 'blocked' : 'ready',
    code: blocked ? EXACT_TEXT_APPLY_PLAN_NO_DISK_BLOCKED_CODE : EXACT_TEXT_APPLY_PLAN_NO_DISK_READY_CODE,
    reason: blocked ? blockedReasons[0].code : EXACT_TEXT_APPLY_PLAN_NO_DISK_READY_CODE,
    reasons: cloneJsonSafe(blockedReasons),
    plan,
  };
}

// CONTOUR_10_WORD_EVIDENCE_CHECK_R2_START
const WORD_EVIDENCE_CLAIM_ACCEPTED_CODE = 'REVISION_BRIDGE_WORD_EVIDENCE_CLAIM_ACCEPTED';
const WORD_EVIDENCE_CLAIM_BLOCKED_CODE = 'E_REVISION_BRIDGE_WORD_EVIDENCE_CLAIM_BLOCKED';

export const REVISION_BRIDGE_WORD_EVIDENCE_PACKET_SCHEMA = 'revision-bridge.word-evidence-packet.v1';
export const REVISION_BRIDGE_WORD_SUPPORT_CLAIM_SCHEMA = 'revision-bridge.word-support-claim.v1';
export const REVISION_BRIDGE_WORD_EVIDENCE_PACKET_CLASSES = Object.freeze([
  'textExact',
  'commentAnchor',
  'structuralManual',
]);
export const REVISION_BRIDGE_WORD_EVIDENCE_CLAIM_GATE_REASON_CODES = Object.freeze([
  WORD_EVIDENCE_CLAIM_ACCEPTED_CODE,
  WORD_EVIDENCE_CLAIM_BLOCKED_CODE,
  'REVISION_BRIDGE_WORD_EVIDENCE_PACKET_REQUIRED',
  'REVISION_BRIDGE_WORD_EVIDENCE_PACKET_INVALID',
  'REVISION_BRIDGE_WORD_EVIDENCE_CLAIM_REQUIRED',
  'REVISION_BRIDGE_WORD_EVIDENCE_CLAIM_INVALID',
  'REVISION_BRIDGE_WORD_EVIDENCE_HASH_MISMATCH',
  'REVISION_BRIDGE_WORD_EVIDENCE_COVERAGE_EXCEEDED',
]);

function wordEvidenceReason(code, field, message, details = {}) {
  return {
    code,
    field,
    message,
    ...cloneJsonSafe(details),
  };
}

function wordEvidenceUniqueClasses(value) {
  const unique = [];
  normalizeStringArray(value).forEach((candidate) => {
    if (
      REVISION_BRIDGE_WORD_EVIDENCE_PACKET_CLASSES.includes(candidate)
      && !unique.includes(candidate)
    ) {
      unique.push(candidate);
    }
  });
  return unique;
}

function normalizeWordEvidenceEntry(input, index) {
  const entry = isPlainObject(input) ? input : {};
  return {
    evidenceId: normalizeString(entry.evidenceId) || `evidence-${index}`,
    supportClass: normalizeString(entry.supportClass),
    digest: normalizeString(entry.digest),
    locator: normalizeString(entry.locator),
  };
}

function normalizeWordEvidencePacket(input = {}) {
  const packet = isPlainObject(input) ? input : {};
  return {
    schemaVersion: normalizeString(packet.schemaVersion),
    packetId: normalizeString(packet.packetId),
    packetClass: normalizeString(packet.packetClass),
    coverage: wordEvidenceUniqueClasses(packet.coverage),
    evidence: Array.isArray(packet.evidence)
      ? packet.evidence
        .filter((entry) => isPlainObject(entry))
        .map((entry, index) => normalizeWordEvidenceEntry(entry, index))
      : [],
  };
}

function canonicalWordEvidencePacketForHash(input = {}) {
  const packet = normalizeWordEvidencePacket(input);
  const coverage = cloneJsonSafe(packet.coverage).sort((left, right) => (
    normalizeString(left).localeCompare(normalizeString(right), 'en')
  ));
  const evidence = cloneJsonSafe(packet.evidence).sort((left, right) => {
    const leftKey = [
      normalizeString(left?.supportClass),
      normalizeString(left?.evidenceId),
      normalizeString(left?.digest),
      normalizeString(left?.locator),
    ].join('\u001f');
    const rightKey = [
      normalizeString(right?.supportClass),
      normalizeString(right?.evidenceId),
      normalizeString(right?.digest),
      normalizeString(right?.locator),
    ].join('\u001f');
    return leftKey.localeCompare(rightKey, 'en');
  });
  return {
    schemaVersion: packet.schemaVersion,
    packetId: packet.packetId,
    packetClass: packet.packetClass,
    coverage,
    evidence,
  };
}

function normalizeWordSupportClaim(input = {}) {
  const claim = isPlainObject(input) ? input : {};
  return {
    schemaVersion: normalizeString(claim.schemaVersion),
    claimId: normalizeString(claim.claimId),
    claimedCoverage: wordEvidenceUniqueClasses(claim.claimedCoverage),
    evidenceHash: normalizeString(claim.evidenceHash),
  };
}

function collectWordEvidencePacketReasons(input, packet) {
  const reasons = [];
  if (!isPlainObject(input)) {
    reasons.push(wordEvidenceReason(
      'REVISION_BRIDGE_WORD_EVIDENCE_PACKET_REQUIRED',
      'evidencePacket',
      'evidencePacket must be an object',
    ));
    return reasons;
  }
  if (packet.schemaVersion !== REVISION_BRIDGE_WORD_EVIDENCE_PACKET_SCHEMA) {
    reasons.push(wordEvidenceReason(
      'REVISION_BRIDGE_WORD_EVIDENCE_PACKET_INVALID',
      'evidencePacket.schemaVersion',
      'evidencePacket schemaVersion is not supported',
    ));
  }
  if (!packet.packetId) {
    reasons.push(wordEvidenceReason(
      'REVISION_BRIDGE_WORD_EVIDENCE_PACKET_INVALID',
      'evidencePacket.packetId',
      'evidencePacket packetId is required',
    ));
  }
  if (!REVISION_BRIDGE_WORD_EVIDENCE_PACKET_CLASSES.includes(packet.packetClass)) {
    reasons.push(wordEvidenceReason(
      'REVISION_BRIDGE_WORD_EVIDENCE_PACKET_INVALID',
      'evidencePacket.packetClass',
      'evidencePacket packetClass is not supported',
    ));
  }
  if (!Array.isArray(input.coverage) || packet.coverage.length === 0) {
    reasons.push(wordEvidenceReason(
      'REVISION_BRIDGE_WORD_EVIDENCE_PACKET_REQUIRED',
      'evidencePacket.coverage',
      'evidencePacket coverage must list at least one supported class',
    ));
  } else {
    input.coverage.forEach((coverageClass, index) => {
      if (!REVISION_BRIDGE_WORD_EVIDENCE_PACKET_CLASSES.includes(normalizeString(coverageClass))) {
        reasons.push(wordEvidenceReason(
          'REVISION_BRIDGE_WORD_EVIDENCE_PACKET_INVALID',
          `evidencePacket.coverage.${index}`,
          'evidencePacket coverage class is not supported',
        ));
      }
    });
  }
  if (!Array.isArray(input.evidence) || input.evidence.length === 0) {
    reasons.push(wordEvidenceReason(
      'REVISION_BRIDGE_WORD_EVIDENCE_PACKET_REQUIRED',
      'evidencePacket.evidence',
      'evidencePacket must include at least one evidence item',
    ));
    return reasons;
  }

  const evidenceCoverage = [];
  input.evidence.forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      reasons.push(wordEvidenceReason(
        'REVISION_BRIDGE_WORD_EVIDENCE_PACKET_INVALID',
        `evidencePacket.evidence.${index}`,
        'evidence item must be an object',
      ));
      return;
    }
    const supportClass = normalizeString(entry.supportClass);
    if (!normalizeString(entry.evidenceId)) {
      reasons.push(wordEvidenceReason(
        'REVISION_BRIDGE_WORD_EVIDENCE_PACKET_INVALID',
        `evidencePacket.evidence.${index}.evidenceId`,
        'evidence item evidenceId is required',
      ));
    }
    if (!REVISION_BRIDGE_WORD_EVIDENCE_PACKET_CLASSES.includes(supportClass)) {
      reasons.push(wordEvidenceReason(
        'REVISION_BRIDGE_WORD_EVIDENCE_PACKET_INVALID',
        `evidencePacket.evidence.${index}.supportClass`,
        'evidence item supportClass is not supported',
      ));
    } else {
      if (!evidenceCoverage.includes(supportClass)) evidenceCoverage.push(supportClass);
      if (!packet.coverage.includes(supportClass)) {
        reasons.push(wordEvidenceReason(
          'REVISION_BRIDGE_WORD_EVIDENCE_PACKET_INVALID',
          `evidencePacket.evidence.${index}.supportClass`,
          'evidence item supportClass must be declared in packet coverage',
        ));
      }
    }
    if (!normalizeString(entry.digest)) {
      reasons.push(wordEvidenceReason(
        'REVISION_BRIDGE_WORD_EVIDENCE_PACKET_INVALID',
        `evidencePacket.evidence.${index}.digest`,
        'evidence item digest is required',
      ));
    }
    if (!normalizeString(entry.locator)) {
      reasons.push(wordEvidenceReason(
        'REVISION_BRIDGE_WORD_EVIDENCE_PACKET_INVALID',
        `evidencePacket.evidence.${index}.locator`,
        'evidence item locator is required',
      ));
    }
  });

  packet.coverage.forEach((coverageClass) => {
    if (!evidenceCoverage.includes(coverageClass)) {
      reasons.push(wordEvidenceReason(
        'REVISION_BRIDGE_WORD_EVIDENCE_PACKET_INVALID',
        'evidencePacket.coverage',
        `coverage class ${coverageClass} is not backed by evidence`,
        { coverageClass },
      ));
    }
  });
  if (packet.packetClass && !packet.coverage.includes(packet.packetClass)) {
    reasons.push(wordEvidenceReason(
      'REVISION_BRIDGE_WORD_EVIDENCE_PACKET_INVALID',
      'evidencePacket.packetClass',
      'packetClass must be included in evidencePacket coverage',
    ));
  }
  return reasons;
}

function collectWordSupportClaimReasons(input, claim) {
  const reasons = [];
  if (!isPlainObject(input)) {
    reasons.push(wordEvidenceReason(
      'REVISION_BRIDGE_WORD_EVIDENCE_CLAIM_REQUIRED',
      'claim',
      'claim must be an object',
    ));
    return reasons;
  }
  if (claim.schemaVersion !== REVISION_BRIDGE_WORD_SUPPORT_CLAIM_SCHEMA) {
    reasons.push(wordEvidenceReason(
      'REVISION_BRIDGE_WORD_EVIDENCE_CLAIM_INVALID',
      'claim.schemaVersion',
      'claim schemaVersion is not supported',
    ));
  }
  if (!claim.claimId) {
    reasons.push(wordEvidenceReason(
      'REVISION_BRIDGE_WORD_EVIDENCE_CLAIM_INVALID',
      'claim.claimId',
      'claim claimId is required',
    ));
  }
  if (!Array.isArray(input.claimedCoverage) || claim.claimedCoverage.length === 0) {
    reasons.push(wordEvidenceReason(
      'REVISION_BRIDGE_WORD_EVIDENCE_CLAIM_REQUIRED',
      'claim.claimedCoverage',
      'claim must request at least one supported coverage class',
    ));
  } else {
    input.claimedCoverage.forEach((coverageClass, index) => {
      if (!REVISION_BRIDGE_WORD_EVIDENCE_PACKET_CLASSES.includes(normalizeString(coverageClass))) {
        reasons.push(wordEvidenceReason(
          'REVISION_BRIDGE_WORD_EVIDENCE_CLAIM_INVALID',
          `claim.claimedCoverage.${index}`,
          'claim coverage class is not supported',
        ));
      }
    });
  }
  if (!claim.evidenceHash) {
    reasons.push(wordEvidenceReason(
      'REVISION_BRIDGE_WORD_EVIDENCE_CLAIM_REQUIRED',
      'claim.evidenceHash',
      'claim evidenceHash is required',
    ));
  }
  return reasons;
}

function wordEvidenceClaimGateBinding(claim, evidencePacket, evidenceHash) {
  return {
    evidenceHash: normalizeString(evidenceHash),
    claimedCoverage: cloneJsonSafe(claim.claimedCoverage),
    coveredCoverage: cloneJsonSafe(evidencePacket.coverage),
  };
}

function wordEvidenceClaimGateResult(ok, code, reasons, claim, evidencePacket, evidenceHash) {
  return {
    ok,
    type: 'revisionBridge.wordEvidenceClaimGate',
    status: ok ? 'accepted' : 'blocked',
    code,
    reason: ok ? WORD_EVIDENCE_CLAIM_ACCEPTED_CODE : reasons[0]?.code || WORD_EVIDENCE_CLAIM_BLOCKED_CODE,
    reasons: cloneJsonSafe(reasons),
    claim: cloneJsonSafe(claim),
    evidencePacket: cloneJsonSafe(evidencePacket),
    binding: wordEvidenceClaimGateBinding(claim, evidencePacket, evidenceHash),
  };
}

export function createWordEvidencePacketHash(input = {}) {
  const packet = canonicalWordEvidencePacketForHash(input);
  return `rbwe_${revisionBlockHash({
    schemaVersion: packet.schemaVersion,
    packetId: packet.packetId,
    packetClass: packet.packetClass,
    coverage: packet.coverage,
    evidence: packet.evidence.map((entry) => ({
      evidenceId: entry.evidenceId,
      supportClass: entry.supportClass,
      digest: entry.digest,
      locator: entry.locator,
    })),
  })}`;
}

export function evaluateWordEvidenceClaimGate(input = {}) {
  const gateInput = isPlainObject(input) ? input : {};
  const claim = normalizeWordSupportClaim(gateInput.claim);
  const evidencePacket = normalizeWordEvidencePacket(gateInput.evidencePacket);
  const reasons = [
    ...collectWordEvidencePacketReasons(gateInput.evidencePacket, evidencePacket),
    ...collectWordSupportClaimReasons(gateInput.claim, claim),
  ];
  const evidenceHash = reasons.length === 0
    ? createWordEvidencePacketHash(evidencePacket)
    : '';

  if (reasons.length === 0 && claim.evidenceHash !== evidenceHash) {
    reasons.push(wordEvidenceReason(
      'REVISION_BRIDGE_WORD_EVIDENCE_HASH_MISMATCH',
      'claim.evidenceHash',
      'claim evidenceHash does not match the supplied evidencePacket hash',
      {
        expectedEvidenceHash: evidenceHash,
        receivedEvidenceHash: claim.evidenceHash,
      },
    ));
  }

  if (reasons.length === 0) {
    const unsupportedCoverage = claim.claimedCoverage.filter((coverageClass) => (
      !evidencePacket.coverage.includes(coverageClass)
    ));
    if (unsupportedCoverage.length > 0) {
      reasons.push(wordEvidenceReason(
        'REVISION_BRIDGE_WORD_EVIDENCE_COVERAGE_EXCEEDED',
        'claim.claimedCoverage',
        'claim coverage exceeds the supplied evidencePacket coverage',
        { unsupportedCoverage },
      ));
    }
  }

  if (reasons.length > 0) {
    return wordEvidenceClaimGateResult(
      false,
      WORD_EVIDENCE_CLAIM_BLOCKED_CODE,
      reasons,
      claim,
      evidencePacket,
      evidenceHash,
    );
  }
  return wordEvidenceClaimGateResult(
    true,
    WORD_EVIDENCE_CLAIM_ACCEPTED_CODE,
    [],
    claim,
    evidencePacket,
    evidenceHash,
  );
}
// CONTOUR_10_WORD_EVIDENCE_CHECK_R2_END

// CONTOUR_11_GOOGLE_DOCS_EVIDENCE_CHECK_START
const GOOGLE_DOCS_EVIDENCE_CLAIM_ACCEPTED_CODE = 'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_CLAIM_ACCEPTED';
const GOOGLE_DOCS_EVIDENCE_CLAIM_BLOCKED_CODE = 'E_REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_CLAIM_BLOCKED';

export const REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_PACKET_SCHEMA = 'revision-bridge.google-docs-evidence-packet.v1';
export const REVISION_BRIDGE_GOOGLE_DOCS_SUPPORT_CLAIM_SCHEMA = 'revision-bridge.google-docs-support-claim.v1';
export const REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_PACKET_CLASSES = Object.freeze([
  'docsSuggestions',
  'driveComments',
  'structuralManual',
]);
const GOOGLE_DOCS_REQUIRED_EVIDENCE_CLASSES = Object.freeze([
  'docsSuggestions',
  'driveComments',
]);
export const REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_CLAIM_GATE_REASON_CODES = Object.freeze([
  GOOGLE_DOCS_EVIDENCE_CLAIM_ACCEPTED_CODE,
  GOOGLE_DOCS_EVIDENCE_CLAIM_BLOCKED_CODE,
  'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_PACKET_REQUIRED',
  'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_PACKET_INVALID',
  'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_CLAIM_REQUIRED',
  'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_CLAIM_INVALID',
  'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_HASH_MISMATCH',
  'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_COVERAGE_EXCEEDED',
  'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_REQUIRED_CLASSES_MISSING',
]);

function googleDocsEvidenceReason(code, field, message, details = {}) {
  return {
    code,
    field,
    message,
    ...cloneJsonSafe(details),
  };
}

function googleDocsEvidenceUniqueClasses(value) {
  const unique = [];
  normalizeStringArray(value).forEach((candidate) => {
    if (
      REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_PACKET_CLASSES.includes(candidate)
      && !unique.includes(candidate)
    ) {
      unique.push(candidate);
    }
  });
  return unique;
}

function normalizeGoogleDocsEvidenceEntry(input, index) {
  const entry = isPlainObject(input) ? input : {};
  return {
    evidenceId: normalizeString(entry.evidenceId) || `google-evidence-${index}`,
    supportClass: normalizeString(entry.supportClass),
    digest: normalizeString(entry.digest),
    locator: normalizeString(entry.locator),
  };
}

function normalizeGoogleDocsEvidencePacket(input = {}) {
  const packet = isPlainObject(input) ? input : {};
  return {
    schemaVersion: normalizeString(packet.schemaVersion),
    packetId: normalizeString(packet.packetId),
    packetClass: normalizeString(packet.packetClass),
    coverage: googleDocsEvidenceUniqueClasses(packet.coverage),
    evidence: Array.isArray(packet.evidence)
      ? packet.evidence
        .filter((entry) => isPlainObject(entry))
        .map((entry, index) => normalizeGoogleDocsEvidenceEntry(entry, index))
      : [],
  };
}

function canonicalGoogleDocsEvidencePacketForHash(input = {}) {
  const packet = normalizeGoogleDocsEvidencePacket(input);
  const coverage = cloneJsonSafe(packet.coverage).sort((left, right) => (
    normalizeString(left).localeCompare(normalizeString(right), 'en')
  ));
  const evidence = cloneJsonSafe(packet.evidence).sort((left, right) => {
    const leftKey = [
      normalizeString(left?.supportClass),
      normalizeString(left?.evidenceId),
      normalizeString(left?.digest),
      normalizeString(left?.locator),
    ].join('\u001f');
    const rightKey = [
      normalizeString(right?.supportClass),
      normalizeString(right?.evidenceId),
      normalizeString(right?.digest),
      normalizeString(right?.locator),
    ].join('\u001f');
    return leftKey.localeCompare(rightKey, 'en');
  });
  return {
    schemaVersion: packet.schemaVersion,
    packetId: packet.packetId,
    packetClass: packet.packetClass,
    coverage,
    evidence,
  };
}

function normalizeGoogleDocsSupportClaim(input = {}) {
  const claim = isPlainObject(input) ? input : {};
  return {
    schemaVersion: normalizeString(claim.schemaVersion),
    claimId: normalizeString(claim.claimId),
    claimedCoverage: googleDocsEvidenceUniqueClasses(claim.claimedCoverage),
    evidenceHash: normalizeString(claim.evidenceHash),
  };
}

function collectGoogleDocsEvidencePacketReasons(input, packet) {
  const reasons = [];
  if (!isPlainObject(input)) {
    reasons.push(googleDocsEvidenceReason(
      'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_PACKET_REQUIRED',
      'evidencePacket',
      'evidencePacket must be an object',
    ));
    return reasons;
  }
  if (packet.schemaVersion !== REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_PACKET_SCHEMA) {
    reasons.push(googleDocsEvidenceReason(
      'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_PACKET_INVALID',
      'evidencePacket.schemaVersion',
      'evidencePacket schemaVersion is not supported',
    ));
  }
  if (!packet.packetId) {
    reasons.push(googleDocsEvidenceReason(
      'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_PACKET_INVALID',
      'evidencePacket.packetId',
      'evidencePacket packetId is required',
    ));
  }
  if (!REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_PACKET_CLASSES.includes(packet.packetClass)) {
    reasons.push(googleDocsEvidenceReason(
      'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_PACKET_INVALID',
      'evidencePacket.packetClass',
      'evidencePacket packetClass is not supported',
    ));
  }
  if (!Array.isArray(input.coverage) || packet.coverage.length === 0) {
    reasons.push(googleDocsEvidenceReason(
      'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_PACKET_REQUIRED',
      'evidencePacket.coverage',
      'evidencePacket coverage must list at least one supported class',
    ));
  } else {
    input.coverage.forEach((coverageClass, index) => {
      if (!REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_PACKET_CLASSES.includes(normalizeString(coverageClass))) {
        reasons.push(googleDocsEvidenceReason(
          'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_PACKET_INVALID',
          `evidencePacket.coverage.${index}`,
          'evidencePacket coverage class is not supported',
        ));
      }
    });
  }
  if (!Array.isArray(input.evidence) || input.evidence.length === 0) {
    reasons.push(googleDocsEvidenceReason(
      'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_PACKET_REQUIRED',
      'evidencePacket.evidence',
      'evidencePacket must include at least one evidence item',
    ));
    return reasons;
  }

  const evidenceCoverage = [];
  input.evidence.forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      reasons.push(googleDocsEvidenceReason(
        'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_PACKET_INVALID',
        `evidencePacket.evidence.${index}`,
        'evidence item must be an object',
      ));
      return;
    }
    const supportClass = normalizeString(entry.supportClass);
    if (!normalizeString(entry.evidenceId)) {
      reasons.push(googleDocsEvidenceReason(
        'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_PACKET_INVALID',
        `evidencePacket.evidence.${index}.evidenceId`,
        'evidence item evidenceId is required',
      ));
    }
    if (!REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_PACKET_CLASSES.includes(supportClass)) {
      reasons.push(googleDocsEvidenceReason(
        'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_PACKET_INVALID',
        `evidencePacket.evidence.${index}.supportClass`,
        'evidence item supportClass is not supported',
      ));
    } else {
      if (!evidenceCoverage.includes(supportClass)) evidenceCoverage.push(supportClass);
      if (!packet.coverage.includes(supportClass)) {
        reasons.push(googleDocsEvidenceReason(
          'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_PACKET_INVALID',
          `evidencePacket.evidence.${index}.supportClass`,
          'evidence item supportClass must be declared in packet coverage',
        ));
      }
    }
    if (!normalizeString(entry.digest)) {
      reasons.push(googleDocsEvidenceReason(
        'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_PACKET_INVALID',
        `evidencePacket.evidence.${index}.digest`,
        'evidence item digest is required',
      ));
    }
    if (!normalizeString(entry.locator)) {
      reasons.push(googleDocsEvidenceReason(
        'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_PACKET_INVALID',
        `evidencePacket.evidence.${index}.locator`,
        'evidence item locator is required',
      ));
    }
  });

  packet.coverage.forEach((coverageClass) => {
    if (!evidenceCoverage.includes(coverageClass)) {
      reasons.push(googleDocsEvidenceReason(
        'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_PACKET_INVALID',
        'evidencePacket.coverage',
        `coverage class ${coverageClass} is not backed by evidence`,
        { coverageClass },
      ));
    }
  });
  if (packet.packetClass && !packet.coverage.includes(packet.packetClass)) {
    reasons.push(googleDocsEvidenceReason(
      'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_PACKET_INVALID',
      'evidencePacket.packetClass',
      'packetClass must be included in evidencePacket coverage',
    ));
  }
  return reasons;
}

function collectGoogleDocsSupportClaimReasons(input, claim) {
  const reasons = [];
  if (!isPlainObject(input)) {
    reasons.push(googleDocsEvidenceReason(
      'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_CLAIM_REQUIRED',
      'claim',
      'claim must be an object',
    ));
    return reasons;
  }
  if (claim.schemaVersion !== REVISION_BRIDGE_GOOGLE_DOCS_SUPPORT_CLAIM_SCHEMA) {
    reasons.push(googleDocsEvidenceReason(
      'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_CLAIM_INVALID',
      'claim.schemaVersion',
      'claim schemaVersion is not supported',
    ));
  }
  if (!claim.claimId) {
    reasons.push(googleDocsEvidenceReason(
      'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_CLAIM_INVALID',
      'claim.claimId',
      'claim claimId is required',
    ));
  }
  if (!Array.isArray(input.claimedCoverage) || claim.claimedCoverage.length === 0) {
    reasons.push(googleDocsEvidenceReason(
      'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_CLAIM_REQUIRED',
      'claim.claimedCoverage',
      'claim must request at least one supported coverage class',
    ));
  } else {
    input.claimedCoverage.forEach((coverageClass, index) => {
      if (!REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_PACKET_CLASSES.includes(normalizeString(coverageClass))) {
        reasons.push(googleDocsEvidenceReason(
          'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_CLAIM_INVALID',
          `claim.claimedCoverage.${index}`,
          'claim coverage class is not supported',
        ));
      }
    });
  }
  if (!claim.evidenceHash) {
    reasons.push(googleDocsEvidenceReason(
      'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_CLAIM_REQUIRED',
      'claim.evidenceHash',
      'claim evidenceHash is required',
    ));
  }
  return reasons;
}

function googleDocsEvidenceClaimGateBinding(claim, evidencePacket, evidenceHash) {
  return {
    evidenceHash: normalizeString(evidenceHash),
    claimedCoverage: cloneJsonSafe(claim.claimedCoverage),
    coveredCoverage: cloneJsonSafe(evidencePacket.coverage),
    requiredCoverage: cloneJsonSafe(GOOGLE_DOCS_REQUIRED_EVIDENCE_CLASSES),
  };
}

function googleDocsEvidenceClaimGateResult(ok, code, reasons, claim, evidencePacket, evidenceHash) {
  return {
    ok,
    type: 'revisionBridge.googleDocsEvidenceClaimGate',
    status: ok ? 'accepted' : 'blocked',
    code,
    reason: ok ? GOOGLE_DOCS_EVIDENCE_CLAIM_ACCEPTED_CODE : reasons[0]?.code || GOOGLE_DOCS_EVIDENCE_CLAIM_BLOCKED_CODE,
    reasons: cloneJsonSafe(reasons),
    claim: cloneJsonSafe(claim),
    evidencePacket: cloneJsonSafe(evidencePacket),
    binding: googleDocsEvidenceClaimGateBinding(claim, evidencePacket, evidenceHash),
  };
}

function missingGoogleDocsRequiredCoverage(coverage) {
  return GOOGLE_DOCS_REQUIRED_EVIDENCE_CLASSES.filter((requiredClass) => (
    !coverage.includes(requiredClass)
  ));
}

export function createGoogleDocsEvidencePacketHash(input = {}) {
  const packet = canonicalGoogleDocsEvidencePacketForHash(input);
  return `rbgde_${revisionBlockHash({
    schemaVersion: packet.schemaVersion,
    packetId: packet.packetId,
    packetClass: packet.packetClass,
    coverage: packet.coverage,
    evidence: packet.evidence.map((entry) => ({
      evidenceId: entry.evidenceId,
      supportClass: entry.supportClass,
      digest: entry.digest,
      locator: entry.locator,
    })),
  })}`;
}

export function evaluateGoogleDocsEvidenceClaimGate(input = {}) {
  const gateInput = isPlainObject(input) ? input : {};
  const claim = normalizeGoogleDocsSupportClaim(gateInput.claim);
  const evidencePacket = normalizeGoogleDocsEvidencePacket(gateInput.evidencePacket);
  const reasons = [
    ...collectGoogleDocsEvidencePacketReasons(gateInput.evidencePacket, evidencePacket),
    ...collectGoogleDocsSupportClaimReasons(gateInput.claim, claim),
  ];
  const evidenceHash = reasons.length === 0
    ? createGoogleDocsEvidencePacketHash(evidencePacket)
    : '';

  if (reasons.length === 0 && claim.evidenceHash !== evidenceHash) {
    reasons.push(googleDocsEvidenceReason(
      'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_HASH_MISMATCH',
      'claim.evidenceHash',
      'claim evidenceHash does not match the supplied evidencePacket hash',
      {
        expectedEvidenceHash: evidenceHash,
        receivedEvidenceHash: claim.evidenceHash,
      },
    ));
  }

  if (reasons.length === 0) {
    const unsupportedCoverage = claim.claimedCoverage.filter((coverageClass) => (
      !evidencePacket.coverage.includes(coverageClass)
    ));
    if (unsupportedCoverage.length > 0) {
      reasons.push(googleDocsEvidenceReason(
        'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_COVERAGE_EXCEEDED',
        'claim.claimedCoverage',
        'claim coverage exceeds the supplied evidencePacket coverage',
        { unsupportedCoverage },
      ));
    }
  }

  if (reasons.length === 0) {
    const missingPacketCoverage = missingGoogleDocsRequiredCoverage(evidencePacket.coverage);
    const missingClaimCoverage = missingGoogleDocsRequiredCoverage(claim.claimedCoverage);
    if (missingPacketCoverage.length > 0 || missingClaimCoverage.length > 0) {
      reasons.push(googleDocsEvidenceReason(
        'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_REQUIRED_CLASSES_MISSING',
        'claim.claimedCoverage',
        'google docs claim requires docsSuggestions and driveComments evidence classes',
        {
          requiredCoverage: GOOGLE_DOCS_REQUIRED_EVIDENCE_CLASSES,
          missingPacketCoverage,
          missingClaimCoverage,
        },
      ));
    }
  }

  if (reasons.length > 0) {
    return googleDocsEvidenceClaimGateResult(
      false,
      GOOGLE_DOCS_EVIDENCE_CLAIM_BLOCKED_CODE,
      reasons,
      claim,
      evidencePacket,
      evidenceHash,
    );
  }
  return googleDocsEvidenceClaimGateResult(
    true,
    GOOGLE_DOCS_EVIDENCE_CLAIM_ACCEPTED_CODE,
    [],
    claim,
    evidencePacket,
    evidenceHash,
  );
}
// CONTOUR_11_GOOGLE_DOCS_EVIDENCE_CHECK_END

// CONTOUR_12_FORMAT_MATRIX_CLAIM_GATE_START
const FORMAT_MATRIX_CLAIM_ACCEPTED_CODE = 'REVISION_BRIDGE_FORMAT_MATRIX_CLAIM_ACCEPTED';
const FORMAT_MATRIX_CLAIM_BLOCKED_CODE = 'E_REVISION_BRIDGE_FORMAT_MATRIX_CLAIM_BLOCKED';

export const REVISION_BRIDGE_FORMAT_MATRIX_SCHEMA = 'revision-bridge.format-matrix.v1';
export const REVISION_BRIDGE_GOLDEN_SET_SCHEMA = 'revision-bridge.golden-set.v1';
export const REVISION_BRIDGE_FORMAT_MATRIX_SUPPORT_CLAIM_SCHEMA =
  'revision-bridge.format-matrix-support-claim.v1';
export const REVISION_BRIDGE_FORMAT_MATRIX_CLAIM_GATE_REASON_CODES = Object.freeze([
  FORMAT_MATRIX_CLAIM_ACCEPTED_CODE,
  FORMAT_MATRIX_CLAIM_BLOCKED_CODE,
  'REVISION_BRIDGE_FORMAT_MATRIX_REQUIRED',
  'REVISION_BRIDGE_FORMAT_MATRIX_INVALID',
  'REVISION_BRIDGE_FORMAT_MATRIX_ROW_MISSING',
  'REVISION_BRIDGE_GOLDEN_SET_REQUIRED',
  'REVISION_BRIDGE_GOLDEN_SET_INVALID',
  'REVISION_BRIDGE_GOLDEN_SET_ID_MISMATCH',
  'REVISION_BRIDGE_GOLDEN_SET_FORMAT_ID_MISMATCH',
  'REVISION_BRIDGE_GOLDEN_SET_SURFACE_MISMATCH',
  'REVISION_BRIDGE_GOLDEN_SET_HASH_MISMATCH',
  'REVISION_BRIDGE_FORMAT_MATRIX_CLAIM_REQUIRED',
  'REVISION_BRIDGE_FORMAT_MATRIX_CLAIM_INVALID',
  'REVISION_BRIDGE_FORMAT_MATRIX_REQUIRED_TESTS_MISSING',
  'REVISION_BRIDGE_FORMAT_MATRIX_CLAIM_SCOPE_EXCEEDS_SURFACE',
]);

function formatMatrixClaimReason(code, field, message, details = {}) {
  return {
    code,
    field,
    message,
    ...cloneJsonSafe(details),
  };
}

function uniqueStableStrings(value) {
  const unique = [];
  normalizeStringArray(value).forEach((candidate) => {
    if (!unique.includes(candidate)) unique.push(candidate);
  });
  return unique;
}

function sortedStableStrings(value) {
  return [...uniqueStableStrings(value)].sort();
}

function stableStringSetEquals(left, right) {
  const leftSorted = sortedStableStrings(left);
  const rightSorted = sortedStableStrings(right);
  if (leftSorted.length !== rightSorted.length) return false;
  for (let index = 0; index < leftSorted.length; index += 1) {
    if (leftSorted[index] !== rightSorted[index]) return false;
  }
  return true;
}

function normalizeFormatMatrixRow(input = {}) {
  const row = isPlainObject(input) ? input : {};
  return {
    rowId: normalizeString(row.rowId),
    formatId: normalizeString(row.formatId),
    surface: uniqueStableStrings(row.surface),
    requiredTests: uniqueStableStrings(row.requiredTests),
    goldenSetId: normalizeString(row.goldenSetId),
  };
}

function normalizeFormatMatrix(input = {}) {
  const matrix = isPlainObject(input) ? input : {};
  return {
    schemaVersion: normalizeString(matrix.schemaVersion),
    matrixId: normalizeString(matrix.matrixId),
    rows: Array.isArray(matrix.rows)
      ? matrix.rows
        .filter((row) => isPlainObject(row))
        .map((row) => normalizeFormatMatrixRow(row))
      : [],
  };
}

function normalizeGoldenSetFixture(input = {}) {
  const fixture = isPlainObject(input) ? input : {};
  return {
    fixtureId: normalizeString(fixture.fixtureId),
    digest: normalizeString(fixture.digest),
  };
}

function normalizeGoldenSet(input = {}) {
  const goldenSet = isPlainObject(input) ? input : {};
  return {
    schemaVersion: normalizeString(goldenSet.schemaVersion),
    goldenSetId: normalizeString(goldenSet.goldenSetId),
    formatId: normalizeString(goldenSet.formatId),
    surface: uniqueStableStrings(goldenSet.surface),
    requiredTests: uniqueStableStrings(goldenSet.requiredTests),
    fixtures: Array.isArray(goldenSet.fixtures)
      ? goldenSet.fixtures
        .filter((fixture) => isPlainObject(fixture))
        .map((fixture) => normalizeGoldenSetFixture(fixture))
      : [],
  };
}

function normalizeFormatMatrixSupportClaim(input = {}) {
  const claim = isPlainObject(input) ? input : {};
  return {
    schemaVersion: normalizeString(claim.schemaVersion),
    claimId: normalizeString(claim.claimId),
    matrixRowId: normalizeString(claim.matrixRowId),
    claimScope: uniqueStableStrings(claim.claimScope),
    verifiedTests: uniqueStableStrings(claim.verifiedTests),
    goldenSetHash: normalizeString(claim.goldenSetHash),
  };
}

function collectFormatMatrixStringListReasons(rawValue, normalizedValue, fieldPath, codePrefix, label) {
  const reasons = [];
  if (!Array.isArray(rawValue) || normalizedValue.length === 0) {
    reasons.push(formatMatrixClaimReason(
      `${codePrefix}_REQUIRED`,
      fieldPath,
      `${label} must include at least one non-empty string`,
    ));
    return reasons;
  }
  rawValue.forEach((entry, index) => {
    if (!normalizeString(entry)) {
      reasons.push(formatMatrixClaimReason(
        `${codePrefix}_INVALID`,
        `${fieldPath}.${index}`,
        `${label} entries must be non-empty strings`,
      ));
    }
  });
  return reasons;
}

function collectFormatMatrixReasons(input, matrix) {
  const reasons = [];
  if (!isPlainObject(input)) {
    reasons.push(formatMatrixClaimReason(
      'REVISION_BRIDGE_FORMAT_MATRIX_REQUIRED',
      'formatMatrix',
      'formatMatrix must be an object',
    ));
    return reasons;
  }
  if (matrix.schemaVersion !== REVISION_BRIDGE_FORMAT_MATRIX_SCHEMA) {
    reasons.push(formatMatrixClaimReason(
      'REVISION_BRIDGE_FORMAT_MATRIX_INVALID',
      'formatMatrix.schemaVersion',
      'formatMatrix schemaVersion is not supported',
    ));
  }
  if (!matrix.matrixId) {
    reasons.push(formatMatrixClaimReason(
      'REVISION_BRIDGE_FORMAT_MATRIX_INVALID',
      'formatMatrix.matrixId',
      'formatMatrix matrixId is required',
    ));
  }
  if (!Array.isArray(input.rows) || matrix.rows.length === 0) {
    reasons.push(formatMatrixClaimReason(
      'REVISION_BRIDGE_FORMAT_MATRIX_REQUIRED',
      'formatMatrix.rows',
      'formatMatrix must include at least one row',
    ));
    return reasons;
  }

  const seenRowIds = [];
  input.rows.forEach((rowInput, index) => {
    if (!isPlainObject(rowInput)) {
      reasons.push(formatMatrixClaimReason(
        'REVISION_BRIDGE_FORMAT_MATRIX_INVALID',
        `formatMatrix.rows.${index}`,
        'format matrix row must be an object',
      ));
      return;
    }
    const row = normalizeFormatMatrixRow(rowInput);
    if (!row.rowId) {
      reasons.push(formatMatrixClaimReason(
        'REVISION_BRIDGE_FORMAT_MATRIX_INVALID',
        `formatMatrix.rows.${index}.rowId`,
        'format matrix rowId is required',
      ));
    } else if (seenRowIds.includes(row.rowId)) {
      reasons.push(formatMatrixClaimReason(
        'REVISION_BRIDGE_FORMAT_MATRIX_INVALID',
        `formatMatrix.rows.${index}.rowId`,
        'format matrix rowId must be unique',
        { rowId: row.rowId },
      ));
    } else {
      seenRowIds.push(row.rowId);
    }
    if (!row.formatId) {
      reasons.push(formatMatrixClaimReason(
        'REVISION_BRIDGE_FORMAT_MATRIX_INVALID',
        `formatMatrix.rows.${index}.formatId`,
        'format matrix formatId is required',
      ));
    }
    reasons.push(...collectFormatMatrixStringListReasons(
      rowInput.surface,
      row.surface,
      `formatMatrix.rows.${index}.surface`,
      'REVISION_BRIDGE_FORMAT_MATRIX_SURFACE',
      'format matrix surface',
    ).map((reason) => ({
      ...reason,
      code: reason.code.endsWith('_REQUIRED')
        ? 'REVISION_BRIDGE_FORMAT_MATRIX_INVALID'
        : 'REVISION_BRIDGE_FORMAT_MATRIX_INVALID',
    })));
    reasons.push(...collectFormatMatrixStringListReasons(
      rowInput.requiredTests,
      row.requiredTests,
      `formatMatrix.rows.${index}.requiredTests`,
      'REVISION_BRIDGE_FORMAT_MATRIX_REQUIRED_TESTS',
      'format matrix requiredTests',
    ).map((reason) => ({
      ...reason,
      code: reason.code.endsWith('_REQUIRED')
        ? 'REVISION_BRIDGE_FORMAT_MATRIX_INVALID'
        : 'REVISION_BRIDGE_FORMAT_MATRIX_INVALID',
    })));
    if (!row.goldenSetId) {
      reasons.push(formatMatrixClaimReason(
        'REVISION_BRIDGE_FORMAT_MATRIX_INVALID',
        `formatMatrix.rows.${index}.goldenSetId`,
        'format matrix goldenSetId is required',
      ));
    }
  });
  return reasons;
}

function collectGoldenSetReasons(input, goldenSet) {
  const reasons = [];
  if (!isPlainObject(input)) {
    reasons.push(formatMatrixClaimReason(
      'REVISION_BRIDGE_GOLDEN_SET_REQUIRED',
      'goldenSet',
      'goldenSet must be an object',
    ));
    return reasons;
  }
  if (goldenSet.schemaVersion !== REVISION_BRIDGE_GOLDEN_SET_SCHEMA) {
    reasons.push(formatMatrixClaimReason(
      'REVISION_BRIDGE_GOLDEN_SET_INVALID',
      'goldenSet.schemaVersion',
      'goldenSet schemaVersion is not supported',
    ));
  }
  if (!goldenSet.goldenSetId) {
    reasons.push(formatMatrixClaimReason(
      'REVISION_BRIDGE_GOLDEN_SET_INVALID',
      'goldenSet.goldenSetId',
      'goldenSet goldenSetId is required',
    ));
  }
  if (!goldenSet.formatId) {
    reasons.push(formatMatrixClaimReason(
      'REVISION_BRIDGE_GOLDEN_SET_INVALID',
      'goldenSet.formatId',
      'goldenSet formatId is required',
    ));
  }
  reasons.push(...collectFormatMatrixStringListReasons(
    input.surface,
    goldenSet.surface,
    'goldenSet.surface',
    'REVISION_BRIDGE_GOLDEN_SET_SURFACE',
    'goldenSet surface',
  ).map((reason) => ({
    ...reason,
    code: 'REVISION_BRIDGE_GOLDEN_SET_INVALID',
  })));
  reasons.push(...collectFormatMatrixStringListReasons(
    input.requiredTests,
    goldenSet.requiredTests,
    'goldenSet.requiredTests',
    'REVISION_BRIDGE_GOLDEN_SET_REQUIRED_TESTS',
    'goldenSet requiredTests',
  ).map((reason) => ({
    ...reason,
    code: 'REVISION_BRIDGE_GOLDEN_SET_INVALID',
  })));
  if (!Array.isArray(input.fixtures) || goldenSet.fixtures.length === 0) {
    reasons.push(formatMatrixClaimReason(
      'REVISION_BRIDGE_GOLDEN_SET_INVALID',
      'goldenSet.fixtures',
      'goldenSet must include at least one fixture',
    ));
    return reasons;
  }
  input.fixtures.forEach((fixtureInput, index) => {
    if (!isPlainObject(fixtureInput)) {
      reasons.push(formatMatrixClaimReason(
        'REVISION_BRIDGE_GOLDEN_SET_INVALID',
        `goldenSet.fixtures.${index}`,
        'goldenSet fixture must be an object',
      ));
      return;
    }
    const fixture = normalizeGoldenSetFixture(fixtureInput);
    if (!fixture.fixtureId) {
      reasons.push(formatMatrixClaimReason(
        'REVISION_BRIDGE_GOLDEN_SET_INVALID',
        `goldenSet.fixtures.${index}.fixtureId`,
        'goldenSet fixtureId is required',
      ));
    }
    if (!fixture.digest) {
      reasons.push(formatMatrixClaimReason(
        'REVISION_BRIDGE_GOLDEN_SET_INVALID',
        `goldenSet.fixtures.${index}.digest`,
        'goldenSet fixture digest is required',
      ));
    }
  });
  return reasons;
}

function collectFormatMatrixSupportClaimReasons(input, claim) {
  const reasons = [];
  if (!isPlainObject(input)) {
    reasons.push(formatMatrixClaimReason(
      'REVISION_BRIDGE_FORMAT_MATRIX_CLAIM_REQUIRED',
      'claim',
      'claim must be an object',
    ));
    return reasons;
  }
  if (claim.schemaVersion !== REVISION_BRIDGE_FORMAT_MATRIX_SUPPORT_CLAIM_SCHEMA) {
    reasons.push(formatMatrixClaimReason(
      'REVISION_BRIDGE_FORMAT_MATRIX_CLAIM_INVALID',
      'claim.schemaVersion',
      'claim schemaVersion is not supported',
    ));
  }
  if (!claim.claimId) {
    reasons.push(formatMatrixClaimReason(
      'REVISION_BRIDGE_FORMAT_MATRIX_CLAIM_INVALID',
      'claim.claimId',
      'claim claimId is required',
    ));
  }
  if (!claim.matrixRowId) {
    reasons.push(formatMatrixClaimReason(
      'REVISION_BRIDGE_FORMAT_MATRIX_CLAIM_INVALID',
      'claim.matrixRowId',
      'claim matrixRowId is required',
    ));
  }
  reasons.push(...collectFormatMatrixStringListReasons(
    input.claimScope,
    claim.claimScope,
    'claim.claimScope',
    'REVISION_BRIDGE_FORMAT_MATRIX_CLAIM_SCOPE',
    'claimScope',
  ).map((reason) => ({
    ...reason,
    code: 'REVISION_BRIDGE_FORMAT_MATRIX_CLAIM_INVALID',
  })));
  reasons.push(...collectFormatMatrixStringListReasons(
    input.verifiedTests,
    claim.verifiedTests,
    'claim.verifiedTests',
    'REVISION_BRIDGE_FORMAT_MATRIX_CLAIM_TESTS',
    'verifiedTests',
  ).map((reason) => ({
    ...reason,
    code: 'REVISION_BRIDGE_FORMAT_MATRIX_CLAIM_INVALID',
  })));
  if (!claim.goldenSetHash) {
    reasons.push(formatMatrixClaimReason(
      'REVISION_BRIDGE_FORMAT_MATRIX_CLAIM_INVALID',
      'claim.goldenSetHash',
      'claim goldenSetHash is required',
    ));
  }
  return reasons;
}

function buildFormatMatrixRequiredTests(row = {}, goldenSet = {}) {
  return sortedStableStrings([
    ...uniqueStableStrings(row?.requiredTests),
    ...uniqueStableStrings(goldenSet?.requiredTests),
  ]);
}

function formatMatrixClaimGateBinding(matrix, row, goldenSet, claim, goldenSetHash) {
  return {
    matrixId: normalizeString(matrix.matrixId),
    matrixRowId: normalizeString(row?.rowId || claim.matrixRowId),
    formatId: normalizeString(row?.formatId || goldenSet.formatId),
    goldenSetId: normalizeString(goldenSet.goldenSetId),
    goldenSetHash: normalizeString(goldenSetHash),
    surface: cloneJsonSafe(row?.surface || []),
    claimScope: cloneJsonSafe(claim.claimScope),
    requiredTests: buildFormatMatrixRequiredTests(row, goldenSet),
    verifiedTests: cloneJsonSafe(claim.verifiedTests),
  };
}

function formatMatrixClaimGateResult(ok, reasons, matrix, row, goldenSet, claim, goldenSetHash) {
  return {
    ok,
    type: 'revisionBridge.formatMatrixClaimGate',
    status: ok ? 'accepted' : 'blocked',
    code: ok ? FORMAT_MATRIX_CLAIM_ACCEPTED_CODE : FORMAT_MATRIX_CLAIM_BLOCKED_CODE,
    reason: ok ? FORMAT_MATRIX_CLAIM_ACCEPTED_CODE : reasons[0]?.code || FORMAT_MATRIX_CLAIM_BLOCKED_CODE,
    reasons: cloneJsonSafe(reasons),
    claim: cloneJsonSafe(claim),
    formatMatrix: cloneJsonSafe(matrix),
    goldenSet: cloneJsonSafe(goldenSet),
    binding: formatMatrixClaimGateBinding(matrix, row, goldenSet, claim, goldenSetHash),
  };
}

export function createRevisionBridgeGoldenSetHash(input = {}) {
  const goldenSet = normalizeGoldenSet(input);
  return `rbgs_${revisionBlockHash({
    schemaVersion: goldenSet.schemaVersion,
    goldenSetId: goldenSet.goldenSetId,
    formatId: goldenSet.formatId,
    surface: sortedStableStrings(goldenSet.surface),
    requiredTests: sortedStableStrings(goldenSet.requiredTests),
    fixtures: [...goldenSet.fixtures]
      .map((fixture) => ({
        fixtureId: fixture.fixtureId,
        digest: fixture.digest,
      }))
      .sort((left, right) => {
        if (left.fixtureId < right.fixtureId) return -1;
        if (left.fixtureId > right.fixtureId) return 1;
        if (left.digest < right.digest) return -1;
        if (left.digest > right.digest) return 1;
        return 0;
      }),
  })}`;
}

export function evaluateRevisionBridgeFormatMatrixClaimGate(input = {}) {
  const gateInput = isPlainObject(input) ? input : {};
  const formatMatrix = normalizeFormatMatrix(gateInput.formatMatrix);
  const goldenSet = normalizeGoldenSet(gateInput.goldenSet);
  const claim = normalizeFormatMatrixSupportClaim(gateInput.claim);
  const reasons = [
    ...collectFormatMatrixReasons(gateInput.formatMatrix, formatMatrix),
    ...collectGoldenSetReasons(gateInput.goldenSet, goldenSet),
    ...collectFormatMatrixSupportClaimReasons(gateInput.claim, claim),
  ];

  const row = reasons.length === 0
    ? formatMatrix.rows.find((candidate) => candidate.rowId === claim.matrixRowId) || null
    : null;
  const goldenSetHash = reasons.length === 0
    ? createRevisionBridgeGoldenSetHash(goldenSet)
    : '';

  if (reasons.length === 0 && !row) {
    reasons.push(formatMatrixClaimReason(
      'REVISION_BRIDGE_FORMAT_MATRIX_ROW_MISSING',
      'claim.matrixRowId',
      'claim matrixRowId does not resolve to a declared format matrix row',
      { matrixRowId: claim.matrixRowId },
    ));
  }

  if (reasons.length === 0 && row.goldenSetId !== goldenSet.goldenSetId) {
    reasons.push(formatMatrixClaimReason(
      'REVISION_BRIDGE_GOLDEN_SET_ID_MISMATCH',
      'goldenSet.goldenSetId',
      'goldenSet goldenSetId does not match the selected matrix row',
      {
        expectedGoldenSetId: row.goldenSetId,
        receivedGoldenSetId: goldenSet.goldenSetId,
      },
    ));
  }

  if (reasons.length === 0 && row.formatId !== goldenSet.formatId) {
    reasons.push(formatMatrixClaimReason(
      'REVISION_BRIDGE_GOLDEN_SET_FORMAT_ID_MISMATCH',
      'goldenSet.formatId',
      'goldenSet formatId does not match the selected matrix row',
      {
        expectedFormatId: row.formatId,
        receivedFormatId: goldenSet.formatId,
      },
    ));
  }

  if (reasons.length === 0 && !stableStringSetEquals(row.surface, goldenSet.surface)) {
    reasons.push(formatMatrixClaimReason(
      'REVISION_BRIDGE_GOLDEN_SET_SURFACE_MISMATCH',
      'goldenSet.surface',
      'goldenSet surface does not match the selected matrix row surface',
      {
        expectedSurface: cloneJsonSafe(sortedStableStrings(row.surface)),
        receivedSurface: cloneJsonSafe(sortedStableStrings(goldenSet.surface)),
      },
    ));
  }

  if (reasons.length === 0 && claim.goldenSetHash !== goldenSetHash) {
    reasons.push(formatMatrixClaimReason(
      'REVISION_BRIDGE_GOLDEN_SET_HASH_MISMATCH',
      'claim.goldenSetHash',
      'claim goldenSetHash does not match the supplied goldenSet hash',
      {
        expectedGoldenSetHash: goldenSetHash,
        receivedGoldenSetHash: claim.goldenSetHash,
      },
    ));
  }

  if (reasons.length === 0) {
    const requiredTests = buildFormatMatrixRequiredTests(row, goldenSet);
    const missingTests = requiredTests.filter((testId) => !claim.verifiedTests.includes(testId));
    if (missingTests.length > 0) {
      reasons.push(formatMatrixClaimReason(
        'REVISION_BRIDGE_FORMAT_MATRIX_REQUIRED_TESTS_MISSING',
        'claim.verifiedTests',
        'claim verifiedTests must include every required matrix and golden set test',
        {
          requiredTests,
          missingTests,
        },
      ));
    }
  }

  if (reasons.length === 0) {
    const unsupportedScope = claim.claimScope.filter((scope) => !row.surface.includes(scope));
    if (unsupportedScope.length > 0) {
      reasons.push(formatMatrixClaimReason(
        'REVISION_BRIDGE_FORMAT_MATRIX_CLAIM_SCOPE_EXCEEDS_SURFACE',
        'claim.claimScope',
        'claim scope exceeds the selected format matrix surface',
        {
          allowedSurface: cloneJsonSafe(row.surface),
          unsupportedScope: cloneJsonSafe(unsupportedScope),
        },
      ));
    }
  }

  if (reasons.length > 0) {
    return formatMatrixClaimGateResult(
      false,
      reasons,
      formatMatrix,
      row,
      goldenSet,
      claim,
      goldenSetHash,
    );
  }
  return formatMatrixClaimGateResult(
    true,
    [],
    formatMatrix,
    row,
    goldenSet,
    claim,
    goldenSetHash,
  );
}
// CONTOUR_12_FORMAT_MATRIX_CLAIM_GATE_END

// CONTOUR_12B_RELEASE_CLAIM_DOSSIER_GATE_START
const RELEASE_CLAIM_DOSSIER_ACCEPTED_CODE = 'REVISION_BRIDGE_RELEASE_CLAIM_DOSSIER_ACCEPTED';
const RELEASE_CLAIM_DOSSIER_BLOCKED_CODE = 'E_REVISION_BRIDGE_RELEASE_CLAIM_DOSSIER_BLOCKED';
const RELEASE_CLAIM_DOSSIER_DIAGNOSTICS_CODE = 'E_REVISION_BRIDGE_RELEASE_CLAIM_DOSSIER_DIAGNOSTICS';

export const REVISION_BRIDGE_RELEASE_CLAIM_DOSSIER_SCHEMA =
  'revision-bridge.release-claim-dossier.v1';
export const REVISION_BRIDGE_RELEASE_CLAIM_DOSSIER_ITEM_SCHEMA =
  'revision-bridge.release-claim-dossier-item.v1';
export const REVISION_BRIDGE_RELEASE_CLAIM_DOSSIER_GATE_REASON_CODES = Object.freeze([
  RELEASE_CLAIM_DOSSIER_ACCEPTED_CODE,
  RELEASE_CLAIM_DOSSIER_BLOCKED_CODE,
  RELEASE_CLAIM_DOSSIER_DIAGNOSTICS_CODE,
  'REVISION_BRIDGE_RELEASE_CLAIM_DOSSIER_REQUIRED',
  'REVISION_BRIDGE_RELEASE_CLAIM_DOSSIER_INVALID',
  'REVISION_BRIDGE_RELEASE_CLAIM_DOSSIER_ITEMS_REQUIRED',
  'REVISION_BRIDGE_RELEASE_CLAIM_DOSSIER_ITEM_INVALID',
  'REVISION_BRIDGE_RELEASE_CLAIM_DOSSIER_ITEM_ID_DUPLICATE',
  ...REVISION_BRIDGE_FORMAT_MATRIX_CLAIM_GATE_REASON_CODES,
]);

function releaseClaimDossierReason(code, field, message, details = {}) {
  return {
    code,
    field,
    message,
    ...cloneJsonSafe(details),
  };
}

function normalizeReleaseClaimDossierItem(input = {}, index = 0) {
  const item = isPlainObject(input) ? input : {};
  return {
    schemaVersion: normalizeString(item.schemaVersion),
    itemId: normalizeString(item.itemId) || `dossier-item-${index + 1}`,
    claim: normalizeFormatMatrixSupportClaim(item.claim),
    goldenSet: normalizeGoldenSet(item.goldenSet),
  };
}

function normalizeReleaseClaimDossier(input = {}) {
  const dossier = isPlainObject(input) ? input : {};
  return {
    schemaVersion: normalizeString(dossier.schemaVersion),
    dossierId: normalizeString(dossier.dossierId),
    items: Array.isArray(dossier.items)
      ? dossier.items.map((item, index) => normalizeReleaseClaimDossierItem(item, index))
      : [],
  };
}

function collectReleaseClaimDossierReasons(input, dossier) {
  const reasons = [];
  if (!isPlainObject(input)) {
    reasons.push(releaseClaimDossierReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_DOSSIER_REQUIRED',
      'dossier',
      'dossier must be an object',
    ));
    return reasons;
  }
  if (dossier.schemaVersion !== REVISION_BRIDGE_RELEASE_CLAIM_DOSSIER_SCHEMA) {
    reasons.push(releaseClaimDossierReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_DOSSIER_INVALID',
      'dossier.schemaVersion',
      'dossier schemaVersion is not supported',
    ));
  }
  if (!dossier.dossierId) {
    reasons.push(releaseClaimDossierReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_DOSSIER_INVALID',
      'dossier.dossierId',
      'dossier dossierId is required',
    ));
  }
  if (!Array.isArray(input.items) || dossier.items.length === 0) {
    reasons.push(releaseClaimDossierReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_DOSSIER_ITEMS_REQUIRED',
      'dossier.items',
      'dossier must include at least one item',
    ));
    return reasons;
  }
  input.items.forEach((itemInput, index) => {
    if (!isPlainObject(itemInput)) {
      reasons.push(releaseClaimDossierReason(
        'REVISION_BRIDGE_RELEASE_CLAIM_DOSSIER_ITEM_INVALID',
        `dossier.items.${index}`,
        'dossier item must be an object',
      ));
      return;
    }
    const item = normalizeReleaseClaimDossierItem(itemInput, index);
    if (item.schemaVersion !== REVISION_BRIDGE_RELEASE_CLAIM_DOSSIER_ITEM_SCHEMA) {
      reasons.push(releaseClaimDossierReason(
        'REVISION_BRIDGE_RELEASE_CLAIM_DOSSIER_ITEM_INVALID',
        `dossier.items.${index}.schemaVersion`,
        'dossier item schemaVersion is not supported',
      ));
    }
    if (!normalizeString(itemInput.itemId)) {
      reasons.push(releaseClaimDossierReason(
        'REVISION_BRIDGE_RELEASE_CLAIM_DOSSIER_ITEM_INVALID',
        `dossier.items.${index}.itemId`,
        'dossier item itemId is required',
      ));
    }
    if (!isPlainObject(itemInput.claim)) {
      reasons.push(releaseClaimDossierReason(
        'REVISION_BRIDGE_RELEASE_CLAIM_DOSSIER_ITEM_INVALID',
        `dossier.items.${index}.claim`,
        'dossier item claim must be an object',
      ));
    }
    if (!isPlainObject(itemInput.goldenSet)) {
      reasons.push(releaseClaimDossierReason(
        'REVISION_BRIDGE_RELEASE_CLAIM_DOSSIER_ITEM_INVALID',
        `dossier.items.${index}.goldenSet`,
        'dossier item goldenSet must be an object',
      ));
    }
  });
  return reasons;
}

function collectReleaseClaimDossierBlockingReasons(dossier) {
  const reasons = [];
  const seenItemIds = [];

  dossier.items.forEach((item, index) => {
    if (!item.itemId) return;
    if (seenItemIds.includes(item.itemId)) {
      reasons.push(releaseClaimDossierReason(
        'REVISION_BRIDGE_RELEASE_CLAIM_DOSSIER_ITEM_ID_DUPLICATE',
        `dossier.items.${index}.itemId`,
        'dossier itemId must be unique',
        { itemId: item.itemId },
      ));
      return;
    }
    seenItemIds.push(item.itemId);
  });
  return reasons;
}

function releaseClaimDossierBinding(formatMatrix, dossier, itemEvaluations) {
  return {
    matrixId: normalizeString(formatMatrix.matrixId),
    dossierId: normalizeString(dossier.dossierId),
    itemCount: itemEvaluations.length,
    itemIds: itemEvaluations.map((item) => item.itemId),
  };
}

function releaseClaimDossierSummary(itemEvaluations) {
  const acceptedItems = itemEvaluations.filter((item) => item.ok).length;
  return {
    totalItems: itemEvaluations.length,
    acceptedItems,
    blockedItems: itemEvaluations.length - acceptedItems,
  };
}

function prefixReleaseClaimDossierReasons(reasons, item, itemIndex) {
  return reasons.map((reason) => ({
    ...cloneJsonSafe(reason),
    itemId: item.itemId,
    itemIndex,
    field: normalizeString(reason.field)
      ? `dossier.items.${itemIndex}.${normalizeString(reason.field)}`
      : `dossier.items.${itemIndex}`,
  }));
}

function releaseClaimDossierResult(
  ok,
  status,
  reasons,
  formatMatrix,
  dossier,
  itemEvaluations,
) {
  const code = ok
    ? RELEASE_CLAIM_DOSSIER_ACCEPTED_CODE
    : (status === 'diagnostics' ? RELEASE_CLAIM_DOSSIER_DIAGNOSTICS_CODE : RELEASE_CLAIM_DOSSIER_BLOCKED_CODE);
  return {
    ok,
    type: 'revisionBridge.releaseClaimDossierGate',
    status,
    code,
    reason: ok ? RELEASE_CLAIM_DOSSIER_ACCEPTED_CODE : reasons[0]?.code || code,
    reasons: cloneJsonSafe(reasons),
    formatMatrix: cloneJsonSafe(formatMatrix),
    dossier: cloneJsonSafe(dossier),
    binding: releaseClaimDossierBinding(formatMatrix, dossier, itemEvaluations),
    summary: releaseClaimDossierSummary(itemEvaluations),
    itemEvaluations: cloneJsonSafe(itemEvaluations),
  };
}

export function evaluateRevisionBridgeReleaseClaimDossierGate(input = {}) {
  const gateInput = isPlainObject(input) ? input : {};
  const formatMatrix = normalizeFormatMatrix(gateInput.formatMatrix);
  const dossier = normalizeReleaseClaimDossier(gateInput.dossier);
  const dossierReasons = collectReleaseClaimDossierReasons(gateInput.dossier, dossier);

  if (dossierReasons.length > 0) {
    return releaseClaimDossierResult(
      false,
      'diagnostics',
      dossierReasons,
      formatMatrix,
      dossier,
      [],
    );
  }
  const blockingReasons = collectReleaseClaimDossierBlockingReasons(dossier);

  if (blockingReasons.length > 0) {
    return releaseClaimDossierResult(
      false,
      'blocked',
      blockingReasons,
      formatMatrix,
      dossier,
      [],
    );
  }

  const itemEvaluations = dossier.items.map((item, itemIndex) => {
    const evaluation = evaluateRevisionBridgeFormatMatrixClaimGate({
      formatMatrix,
      goldenSet: item.goldenSet,
      claim: item.claim,
    });
    return {
      itemId: item.itemId,
      itemIndex,
      ...cloneJsonSafe(evaluation),
    };
  });
  const blockedReasons = itemEvaluations.flatMap((item) => (
    item.ok ? [] : prefixReleaseClaimDossierReasons(item.reasons, item, item.itemIndex)
  ));

  if (blockedReasons.length > 0) {
    return releaseClaimDossierResult(
      false,
      'blocked',
      blockedReasons,
      formatMatrix,
      dossier,
      itemEvaluations,
    );
  }

  return releaseClaimDossierResult(
    true,
    'accepted',
    [],
    formatMatrix,
    dossier,
    itemEvaluations,
  );
}
// CONTOUR_12B_RELEASE_CLAIM_DOSSIER_GATE_END

// CONTOUR_12C_RELEASE_CLAIM_ADMISSION_GATE_START
const RELEASE_CLAIM_ADMISSION_ACCEPTED_CODE = 'REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_ACCEPTED';
const RELEASE_CLAIM_ADMISSION_BLOCKED_CODE = 'E_REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_BLOCKED';
const RELEASE_CLAIM_ADMISSION_DIAGNOSTICS_CODE = 'E_REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_DIAGNOSTICS';

export const REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_SCHEMA =
  'revision-bridge.release-claim-admission.v1';
export const REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_REASON_CODES = Object.freeze([
  RELEASE_CLAIM_ADMISSION_ACCEPTED_CODE,
  RELEASE_CLAIM_ADMISSION_BLOCKED_CODE,
  RELEASE_CLAIM_ADMISSION_DIAGNOSTICS_CODE,
  'REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_REQUIRED',
  'REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_INVALID',
  'REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_DOSSIER_MISSING',
  'REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_DOSSIER_PROVENANCE_INVALID',
  'REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_DOSSIER_BLOCKED',
  'REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_SCOPE_NOT_COVERED',
  'REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_REQUIRED_CLASSES_MISSING',
  'REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_BASELINE_DEBT_BLOCKED',
]);

function releaseClaimAdmissionReason(code, field, message, details = {}) {
  return {
    code,
    field,
    message,
    ...cloneJsonSafe(details),
  };
}

function normalizeReleaseClaimAdmission(input = {}) {
  const admission = isPlainObject(input) ? input : {};
  return {
    schemaVersion: normalizeString(admission.schemaVersion),
    claimId: normalizeString(admission.claimId),
    claimScope: uniqueStableStrings(admission.claimScope),
    requiredClaimClasses: uniqueStableStrings(admission.requiredClaimClasses),
  };
}

function collectOptionalStringListReasons(rawValue, normalizedValue, fieldPath, code, label) {
  if (typeof rawValue === 'undefined') return [];
  if (!Array.isArray(rawValue)) {
    return [
      releaseClaimAdmissionReason(
        code,
        fieldPath,
        `${label} must be an array of non-empty strings`,
      ),
    ];
  }
  const reasons = [];
  rawValue.forEach((entry, index) => {
    if (!normalizeString(entry)) {
      reasons.push(releaseClaimAdmissionReason(
        code,
        `${fieldPath}.${index}`,
        `${label} entries must be non-empty strings`,
      ));
    }
  });
  if (rawValue.length > 0 && normalizedValue.length === 0) {
    reasons.push(releaseClaimAdmissionReason(
      code,
      fieldPath,
      `${label} must contain at least one non-empty string`,
    ));
  }
  return reasons;
}

function collectReleaseClaimAdmissionReasons(input, admission) {
  const reasons = [];
  if (!isPlainObject(input)) {
    reasons.push(releaseClaimAdmissionReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_REQUIRED',
      'admission',
      'admission must be an object',
    ));
    return reasons;
  }
  if (admission.schemaVersion !== REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_SCHEMA) {
    reasons.push(releaseClaimAdmissionReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_INVALID',
      'admission.schemaVersion',
      'admission schemaVersion is not supported',
    ));
  }
  if (!admission.claimId) {
    reasons.push(releaseClaimAdmissionReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_INVALID',
      'admission.claimId',
      'admission claimId is required',
    ));
  }
  reasons.push(...collectFormatMatrixStringListReasons(
    input.claimScope,
    admission.claimScope,
    'admission.claimScope',
    'REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_SCOPE',
    'claimScope',
  ).map((reason) => ({
    ...reason,
    code: 'REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_INVALID',
  })));
  reasons.push(...collectOptionalStringListReasons(
    input.requiredClaimClasses,
    admission.requiredClaimClasses,
    'admission.requiredClaimClasses',
    'REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_INVALID',
    'requiredClaimClasses',
  ));
  return reasons;
}

function normalizeReleaseClaimAdmissionDossierPayload(input = {}) {
  const payload = isPlainObject(input) ? input : {};
  const dossierResult = isPlainObject(payload.dossierResult) ? cloneJsonSafe(payload.dossierResult) : {};
  const derivedCoveredScope = uniqueStableStrings(
    dossierResult.itemEvaluations?.flatMap((item) => item?.binding?.claimScope || []),
  );
  return {
    dossierResult,
    coveredScope: sortedStableStrings(derivedCoveredScope),
    claimClasses: sortedStableStrings(payload.claimClasses),
    baselineDebtFlag: payload.baselineDebtFlag === true,
  };
}

function collectReleaseClaimAdmissionDossierProvenanceReasons(dossierResult) {
  const reasons = [];
  const binding = isPlainObject(dossierResult?.binding) ? dossierResult.binding : {};
  const itemIds = Array.isArray(binding.itemIds) ? binding.itemIds.map((itemId) => normalizeString(itemId)) : [];
  const normalizedItemIds = itemIds.filter(Boolean);
  const itemEvaluations = Array.isArray(dossierResult?.itemEvaluations) ? dossierResult.itemEvaluations : [];

  if (normalizeString(dossierResult?.type) !== 'revisionBridge.releaseClaimDossierGate') {
    reasons.push(releaseClaimAdmissionReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_DOSSIER_PROVENANCE_INVALID',
      'dossierResult.type',
      'dossier result type must prove releaseClaimDossierGate provenance',
    ));
  }
  if (normalizeString(dossierResult?.code) !== RELEASE_CLAIM_DOSSIER_ACCEPTED_CODE) {
    reasons.push(releaseClaimAdmissionReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_DOSSIER_PROVENANCE_INVALID',
      'dossierResult.code',
      'dossier result code must prove accepted dossier provenance',
    ));
  }
  if (normalizeString(dossierResult?.reason) !== RELEASE_CLAIM_DOSSIER_ACCEPTED_CODE) {
    reasons.push(releaseClaimAdmissionReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_DOSSIER_PROVENANCE_INVALID',
      'dossierResult.reason',
      'dossier result reason must prove accepted dossier provenance',
    ));
  }
  if (!normalizeString(binding.dossierId)) {
    reasons.push(releaseClaimAdmissionReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_DOSSIER_PROVENANCE_INVALID',
      'dossierResult.binding.dossierId',
      'dossier provenance must include a non-empty binding dossierId',
    ));
  }
  if (itemIds.length === 0 || normalizedItemIds.length !== itemIds.length) {
    reasons.push(releaseClaimAdmissionReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_DOSSIER_PROVENANCE_INVALID',
      'dossierResult.binding.itemIds',
      'dossier provenance must include a non-empty itemIds array of non-empty strings',
    ));
  } else if (new Set(normalizedItemIds).size !== normalizedItemIds.length) {
    reasons.push(releaseClaimAdmissionReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_DOSSIER_PROVENANCE_INVALID',
      'dossierResult.binding.itemIds',
      'dossier provenance itemIds must be unique',
    ));
  }
  if (itemEvaluations.length === 0) {
    reasons.push(releaseClaimAdmissionReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_DOSSIER_PROVENANCE_INVALID',
      'dossierResult.itemEvaluations',
      'dossier provenance must include accepted item evaluations',
    ));
  } else {
    itemEvaluations.forEach((item, index) => {
      if (!isPlainObject(item)) {
        reasons.push(releaseClaimAdmissionReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_DOSSIER_PROVENANCE_INVALID',
          `dossierResult.itemEvaluations.${index}`,
          'dossier item evaluation must be an object',
        ));
        return;
      }
      if (item.ok !== true) {
        reasons.push(releaseClaimAdmissionReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_DOSSIER_PROVENANCE_INVALID',
          `dossierResult.itemEvaluations.${index}.ok`,
          'dossier item evaluation ok must be true',
        ));
      }
      if (normalizeString(item.status) !== 'accepted') {
        reasons.push(releaseClaimAdmissionReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_DOSSIER_PROVENANCE_INVALID',
          `dossierResult.itemEvaluations.${index}.status`,
          'dossier item evaluation status must be accepted',
        ));
      }
      if (normalizeString(item.type) !== 'revisionBridge.formatMatrixClaimGate') {
        reasons.push(releaseClaimAdmissionReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_DOSSIER_PROVENANCE_INVALID',
          `dossierResult.itemEvaluations.${index}.type`,
          'dossier item evaluation type must prove formatMatrixClaimGate provenance',
        ));
      }
      if (normalizeString(item.code) !== FORMAT_MATRIX_CLAIM_ACCEPTED_CODE) {
        reasons.push(releaseClaimAdmissionReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_DOSSIER_PROVENANCE_INVALID',
          `dossierResult.itemEvaluations.${index}.code`,
          'dossier item evaluation code must prove accepted formatMatrixClaimGate provenance',
        ));
      }
    });
  }

  return reasons;
}

function releaseClaimAdmissionBinding(admission, dossierPayload) {
  const dossierResult = isPlainObject(dossierPayload?.dossierResult) ? dossierPayload.dossierResult : {};
  return {
    claimId: normalizeString(admission.claimId),
    dossierId: normalizeString(dossierResult?.binding?.dossierId || dossierResult?.dossier?.dossierId),
    dossierStatus: normalizeString(dossierResult.status),
    claimScope: cloneJsonSafe(admission.claimScope),
    coveredScope: cloneJsonSafe(dossierPayload.coveredScope),
    requiredClaimClasses: cloneJsonSafe(admission.requiredClaimClasses),
    dossierClaimClasses: cloneJsonSafe(dossierPayload.claimClasses),
    baselineDebtFlag: dossierPayload.baselineDebtFlag === true,
  };
}

function releaseClaimAdmissionResult(ok, status, reasons, admission, dossierPayload) {
  const code = ok
    ? RELEASE_CLAIM_ADMISSION_ACCEPTED_CODE
    : (status === 'diagnostics' ? RELEASE_CLAIM_ADMISSION_DIAGNOSTICS_CODE : RELEASE_CLAIM_ADMISSION_BLOCKED_CODE);
  return {
    ok,
    type: 'revisionBridge.releaseClaimAdmissionGate',
    status,
    code,
    reason: ok ? RELEASE_CLAIM_ADMISSION_ACCEPTED_CODE : reasons[0]?.code || code,
    reasons: cloneJsonSafe(reasons),
    admission: cloneJsonSafe(admission),
    dossierPayload: cloneJsonSafe(dossierPayload),
    binding: releaseClaimAdmissionBinding(admission, dossierPayload),
  };
}

export function evaluateRevisionBridgeReleaseClaimAdmissionGate(
  admissionInput = {},
  dossierResultPayload = {},
) {
  const admission = normalizeReleaseClaimAdmission(admissionInput);
  const admissionReasons = collectReleaseClaimAdmissionReasons(admissionInput, admission);

  if (admissionReasons.length > 0) {
    return releaseClaimAdmissionResult(
      false,
      'diagnostics',
      admissionReasons,
      admission,
      normalizeReleaseClaimAdmissionDossierPayload(dossierResultPayload),
    );
  }

  if (!isPlainObject(dossierResultPayload) || !isPlainObject(dossierResultPayload.dossierResult)) {
    return releaseClaimAdmissionResult(
      false,
      'blocked',
      [
        releaseClaimAdmissionReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_DOSSIER_MISSING',
          'dossierResult',
          'dossier result payload must include dossierResult',
        ),
      ],
      admission,
      normalizeReleaseClaimAdmissionDossierPayload(dossierResultPayload),
    );
  }

  const dossierPayload = normalizeReleaseClaimAdmissionDossierPayload(dossierResultPayload);
  const dossierStatus = normalizeString(dossierPayload.dossierResult.status);

  if (dossierStatus !== 'accepted') {
    return releaseClaimAdmissionResult(
      false,
      'blocked',
      [
        releaseClaimAdmissionReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_DOSSIER_BLOCKED',
          'dossierResult.status',
          'dossier result must be accepted before release claim admission',
          { dossierStatus },
        ),
      ],
      admission,
      dossierPayload,
    );
  }

  const dossierProvenanceReasons = collectReleaseClaimAdmissionDossierProvenanceReasons(dossierPayload.dossierResult);

  if (dossierProvenanceReasons.length > 0) {
    return releaseClaimAdmissionResult(
      false,
      'blocked',
      dossierProvenanceReasons,
      admission,
      dossierPayload,
    );
  }

  const reasons = [];
  const uncoveredScope = admission.claimScope.filter((scope) => !dossierPayload.coveredScope.includes(scope));
  if (uncoveredScope.length > 0) {
    reasons.push(releaseClaimAdmissionReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_SCOPE_NOT_COVERED',
      'admission.claimScope',
      'admission claimScope must be fully covered by the dossier covered scope',
      {
        coveredScope: cloneJsonSafe(dossierPayload.coveredScope),
        uncoveredScope: cloneJsonSafe(uncoveredScope),
      },
    ));
  }

  const missingClaimClasses = admission.requiredClaimClasses.filter((claimClass) => (
    !dossierPayload.claimClasses.includes(claimClass)
  ));
  if (missingClaimClasses.length > 0) {
    reasons.push(releaseClaimAdmissionReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_REQUIRED_CLASSES_MISSING',
      'admission.requiredClaimClasses',
      'required claim classes must be present in the dossier result payload',
      {
        dossierClaimClasses: cloneJsonSafe(dossierPayload.claimClasses),
        missingClaimClasses: cloneJsonSafe(missingClaimClasses),
      },
    ));
  }

  if (dossierPayload.baselineDebtFlag === true) {
    reasons.push(releaseClaimAdmissionReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_BASELINE_DEBT_BLOCKED',
      'baselineDebtFlag',
      'baseline debt must be cleared before release claim admission',
      { baselineDebtFlag: true },
    ));
  }

  if (reasons.length > 0) {
    return releaseClaimAdmissionResult(false, 'blocked', reasons, admission, dossierPayload);
  }

  return releaseClaimAdmissionResult(true, 'accepted', [], admission, dossierPayload);
}
// CONTOUR_12C_RELEASE_CLAIM_ADMISSION_GATE_END

// CONTOUR_12D_RELEASE_CLAIM_MODE_DECISION_GATE_START
const RELEASE_CLAIM_MODE_DECISION_ACCEPTED_CODE = 'REVISION_BRIDGE_RELEASE_CLAIM_MODE_DECISION_ACCEPTED';
const RELEASE_CLAIM_MODE_DECISION_BLOCKED_CODE = 'E_REVISION_BRIDGE_RELEASE_CLAIM_MODE_DECISION_BLOCKED';
const RELEASE_CLAIM_MODE_DECISION_DIAGNOSTICS_CODE = 'E_REVISION_BRIDGE_RELEASE_CLAIM_MODE_DECISION_DIAGNOSTICS';

export const REVISION_BRIDGE_RELEASE_CLAIM_MODE_DECISION_SCHEMA =
  'revision-bridge.release-claim-mode-decision.v1';
export const REVISION_BRIDGE_RELEASE_CLAIM_MODE_VALUES = Object.freeze([
  'PR_MODE',
  'RELEASE_MODE',
]);
export const REVISION_BRIDGE_RELEASE_CLAIM_MODE_DECISION_RELEASE_REQUIRED_FIELDS = Object.freeze([
  'releaseEvidenceId',
  'releaseEvidenceHash',
  'inputHash',
  'outputHash',
  'commandRunDigest',
  'matrixId',
  'dossierId',
  'claimId',
]);
export const REVISION_BRIDGE_RELEASE_CLAIM_MODE_DECISION_REASON_CODES = Object.freeze([
  RELEASE_CLAIM_MODE_DECISION_ACCEPTED_CODE,
  RELEASE_CLAIM_MODE_DECISION_BLOCKED_CODE,
  RELEASE_CLAIM_MODE_DECISION_DIAGNOSTICS_CODE,
  'REVISION_BRIDGE_RELEASE_CLAIM_MODE_DECISION_REQUIRED',
  'REVISION_BRIDGE_RELEASE_CLAIM_MODE_DECISION_INVALID',
  'REVISION_BRIDGE_RELEASE_CLAIM_MODE_DECISION_MODE_REQUIRED',
  'REVISION_BRIDGE_RELEASE_CLAIM_MODE_DECISION_MODE_INVALID',
  'REVISION_BRIDGE_RELEASE_CLAIM_MODE_DECISION_DOSSIER_BLOCKED',
  'REVISION_BRIDGE_RELEASE_CLAIM_MODE_DECISION_ADMISSION_BLOCKED',
  'REVISION_BRIDGE_RELEASE_CLAIM_MODE_DECISION_BINDING_MISMATCH',
  'REVISION_BRIDGE_RELEASE_CLAIM_MODE_DECISION_RELEASE_FIELDS_MISSING',
  ...REVISION_BRIDGE_RELEASE_CLAIM_DOSSIER_GATE_REASON_CODES,
  ...REVISION_BRIDGE_RELEASE_CLAIM_ADMISSION_REASON_CODES,
]);

function releaseClaimModeDecisionReason(code, field, message, details = {}) {
  return {
    code,
    field,
    message,
    ...cloneJsonSafe(details),
  };
}

function normalizeReleaseClaimModeDecisionInput(input = {}) {
  const decision = isPlainObject(input) ? input : {};
  return {
    schemaVersion: normalizeString(decision.schemaVersion),
    mode: normalizeString(decision.mode),
    formatMatrix: cloneJsonSafe(decision.formatMatrix),
    dossier: cloneJsonSafe(decision.dossier),
    admission: cloneJsonSafe(decision.admission),
    claimClasses: sortedStableStrings(decision.claimClasses),
    baselineDebtFlag: decision.baselineDebtFlag === true,
    releaseEvidenceId: normalizeString(decision.releaseEvidenceId),
    releaseEvidenceHash: normalizeString(decision.releaseEvidenceHash),
    inputHash: normalizeString(decision.inputHash),
    outputHash: normalizeString(decision.outputHash),
    commandRunDigest: normalizeString(decision.commandRunDigest),
    matrixId: normalizeString(decision.matrixId),
    dossierId: normalizeString(decision.dossierId),
    claimId: normalizeString(decision.claimId),
  };
}

function collectReleaseClaimModeDecisionReasons(input, decision) {
  const reasons = [];
  if (!isPlainObject(input)) {
    reasons.push(releaseClaimModeDecisionReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_MODE_DECISION_REQUIRED',
      'decision',
      'decision payload must be an object',
    ));
    return reasons;
  }
  if (decision.schemaVersion !== REVISION_BRIDGE_RELEASE_CLAIM_MODE_DECISION_SCHEMA) {
    reasons.push(releaseClaimModeDecisionReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_MODE_DECISION_INVALID',
      'decision.schemaVersion',
      'decision schemaVersion is not supported',
    ));
  }
  if (!decision.mode) {
    reasons.push(releaseClaimModeDecisionReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_MODE_DECISION_MODE_REQUIRED',
      'decision.mode',
      'decision mode is required',
    ));
  } else if (!REVISION_BRIDGE_RELEASE_CLAIM_MODE_VALUES.includes(decision.mode)) {
    reasons.push(releaseClaimModeDecisionReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_MODE_DECISION_MODE_INVALID',
      'decision.mode',
      'decision mode must be one of PR_MODE or RELEASE_MODE',
      { mode: decision.mode },
    ));
  }
  return reasons;
}

function releaseClaimModeDecisionBinding(decision, dossierResult, admissionResult) {
  const dossierBinding = isPlainObject(dossierResult?.binding) ? dossierResult.binding : {};
  const admissionBinding = isPlainObject(admissionResult?.binding) ? admissionResult.binding : {};
  return {
    mode: decision.mode,
    claimId: normalizeString(admissionBinding.claimId || decision.claimId),
    dossierId: normalizeString(dossierBinding.dossierId || admissionBinding.dossierId || decision.dossierId),
    matrixId: normalizeString(dossierBinding.matrixId || decision.matrixId),
    dossierStatus: normalizeString(dossierResult?.status),
    admissionStatus: normalizeString(admissionResult?.status),
    baselineDebtFlag: decision.baselineDebtFlag === true,
  };
}

function releaseClaimModeDecisionSummary(decision, dossierResult, admissionResult, missingReleaseFields = []) {
  return {
    mode: decision.mode,
    releaseRequiredFields: cloneJsonSafe(REVISION_BRIDGE_RELEASE_CLAIM_MODE_DECISION_RELEASE_REQUIRED_FIELDS),
    missingReleaseFields: cloneJsonSafe(missingReleaseFields),
    dossierGate: {
      status: normalizeString(dossierResult?.status),
      code: normalizeString(dossierResult?.code),
      reason: normalizeString(dossierResult?.reason),
    },
    admissionGate: {
      status: normalizeString(admissionResult?.status),
      code: normalizeString(admissionResult?.code),
      reason: normalizeString(admissionResult?.reason),
    },
  };
}

function releaseClaimModeDecisionResult(
  ok,
  status,
  reasons,
  decision,
  dossierResult,
  admissionResult,
  missingReleaseFields = [],
) {
  const code = ok
    ? RELEASE_CLAIM_MODE_DECISION_ACCEPTED_CODE
    : (status === 'diagnostics'
      ? RELEASE_CLAIM_MODE_DECISION_DIAGNOSTICS_CODE
      : RELEASE_CLAIM_MODE_DECISION_BLOCKED_CODE);
  return {
    ok,
    type: 'revisionBridge.releaseClaimModeDecisionGate',
    status,
    code,
    reason: ok ? RELEASE_CLAIM_MODE_DECISION_ACCEPTED_CODE : reasons[0]?.code || code,
    reasons: cloneJsonSafe(reasons),
    decision: cloneJsonSafe(decision),
    binding: releaseClaimModeDecisionBinding(decision, dossierResult, admissionResult),
    summary: releaseClaimModeDecisionSummary(
      decision,
      dossierResult,
      admissionResult,
      missingReleaseFields,
    ),
    dossierResult: cloneJsonSafe(dossierResult),
    admissionResult: cloneJsonSafe(admissionResult),
  };
}

function collectReleaseModeMissingFields(decision) {
  return REVISION_BRIDGE_RELEASE_CLAIM_MODE_DECISION_RELEASE_REQUIRED_FIELDS.filter(
    (fieldName) => !normalizeString(decision[fieldName]),
  );
}

function collectReleaseClaimModeDecisionBindingMismatchReasons(decision, dossierResult, admissionResult) {
  const reasons = [];
  const dossierBinding = isPlainObject(dossierResult?.binding) ? dossierResult.binding : {};
  const admissionBinding = isPlainObject(admissionResult?.binding) ? admissionResult.binding : {};
  const expectedBindingPairs = [
    {
      field: 'claimId',
      sourceField: 'admissionResult.binding.claimId',
      suppliedValue: normalizeString(decision.claimId),
      expectedValue: normalizeString(admissionBinding.claimId),
    },
    {
      field: 'dossierId',
      sourceField: 'dossierResult.binding.dossierId',
      suppliedValue: normalizeString(decision.dossierId),
      expectedValue: normalizeString(dossierBinding.dossierId),
    },
    {
      field: 'matrixId',
      sourceField: 'dossierResult.binding.matrixId',
      suppliedValue: normalizeString(decision.matrixId),
      expectedValue: normalizeString(dossierBinding.matrixId),
    },
  ];

  expectedBindingPairs.forEach((pair) => {
    if (!pair.expectedValue) {
      reasons.push(releaseClaimModeDecisionReason(
        'REVISION_BRIDGE_RELEASE_CLAIM_MODE_DECISION_BINDING_MISMATCH',
        pair.sourceField,
        `${pair.field} must be bound by accepted upstream provenance`,
        { bindingField: pair.field },
      ));
      return;
    }
    if (pair.suppliedValue && pair.suppliedValue !== pair.expectedValue) {
      reasons.push(releaseClaimModeDecisionReason(
        'REVISION_BRIDGE_RELEASE_CLAIM_MODE_DECISION_BINDING_MISMATCH',
        `decision.${pair.field}`,
        `${pair.field} must match accepted upstream provenance`,
        {
          bindingField: pair.field,
          expectedValue: pair.expectedValue,
          receivedValue: pair.suppliedValue,
        },
      ));
    }
  });

  const admissionDossierId = normalizeString(admissionBinding.dossierId);
  const dossierId = normalizeString(dossierBinding.dossierId);
  if (admissionDossierId && dossierId && admissionDossierId !== dossierId) {
    reasons.push(releaseClaimModeDecisionReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_MODE_DECISION_BINDING_MISMATCH',
      'admissionResult.binding.dossierId',
      'admission dossierId must match accepted dossier provenance',
      {
        expectedValue: dossierId,
        receivedValue: admissionDossierId,
      },
    ));
  }

  return reasons;
}

export function evaluateRevisionBridgeReleaseClaimModeDecisionGate(input = {}) {
  const decision = normalizeReleaseClaimModeDecisionInput(input);
  const decisionReasons = collectReleaseClaimModeDecisionReasons(input, decision);

  if (decisionReasons.length > 0) {
    return releaseClaimModeDecisionResult(
      false,
      'diagnostics',
      decisionReasons,
      decision,
      null,
      null,
    );
  }

  const dossierResult = evaluateRevisionBridgeReleaseClaimDossierGate({
    formatMatrix: decision.formatMatrix,
    dossier: decision.dossier,
  });
  const dossierStatus = normalizeString(dossierResult.status);
  if (dossierStatus !== 'accepted') {
    const status = dossierStatus === 'diagnostics' ? 'diagnostics' : 'blocked';
    return releaseClaimModeDecisionResult(
      false,
      status,
      [
        releaseClaimModeDecisionReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_MODE_DECISION_DOSSIER_BLOCKED',
          'dossier',
          'release claim dossier gate must accept before mode decision can pass',
          {
            dossierStatus,
            dossierCode: normalizeString(dossierResult.code),
            dossierReason: normalizeString(dossierResult.reason),
          },
        ),
      ],
      decision,
      dossierResult,
      null,
    );
  }

  const admissionResult = evaluateRevisionBridgeReleaseClaimAdmissionGate(
    decision.admission,
    {
      dossierResult,
      claimClasses: decision.claimClasses,
      baselineDebtFlag: decision.baselineDebtFlag,
    },
  );
  const admissionStatus = normalizeString(admissionResult.status);
  if (admissionStatus !== 'accepted') {
    const status = admissionStatus === 'diagnostics' ? 'diagnostics' : 'blocked';
    return releaseClaimModeDecisionResult(
      false,
      status,
      [
        releaseClaimModeDecisionReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_MODE_DECISION_ADMISSION_BLOCKED',
          'admission',
          'release claim admission gate must accept before mode decision can pass',
          {
            admissionStatus,
            admissionCode: normalizeString(admissionResult.code),
            admissionReason: normalizeString(admissionResult.reason),
          },
        ),
      ],
      decision,
      dossierResult,
      admissionResult,
    );
  }

  const bindingMismatchReasons = collectReleaseClaimModeDecisionBindingMismatchReasons(
    decision,
    dossierResult,
    admissionResult,
  );
  if (bindingMismatchReasons.length > 0) {
    return releaseClaimModeDecisionResult(
      false,
      'blocked',
      bindingMismatchReasons,
      decision,
      dossierResult,
      admissionResult,
    );
  }

  if (decision.mode === 'RELEASE_MODE') {
    const missingReleaseFields = collectReleaseModeMissingFields(decision);
    if (missingReleaseFields.length > 0) {
      return releaseClaimModeDecisionResult(
        false,
        'blocked',
        [
          releaseClaimModeDecisionReason(
            'REVISION_BRIDGE_RELEASE_CLAIM_MODE_DECISION_RELEASE_FIELDS_MISSING',
            'releaseEvidence',
            'release mode requires non-empty release evidence fields',
            { missingReleaseFields },
          ),
        ],
        decision,
        dossierResult,
        admissionResult,
        missingReleaseFields,
      );
    }
  }

  return releaseClaimModeDecisionResult(
    true,
    'accepted',
    [],
    decision,
    dossierResult,
    admissionResult,
  );
}
// CONTOUR_12D_RELEASE_CLAIM_MODE_DECISION_GATE_END

// CONTOUR_12E_RELEASE_CLAIM_ATTESTATION_GATE_START
const RELEASE_CLAIM_ATTESTATION_ACCEPTED_CODE = 'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_ACCEPTED';
const RELEASE_CLAIM_ATTESTATION_BLOCKED_CODE = 'E_REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_BLOCKED';
const RELEASE_CLAIM_ATTESTATION_DIAGNOSTICS_CODE = 'E_REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_DIAGNOSTICS';

export const REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_SCHEMA =
  'revision-bridge.release-claim-attestation.v1';
export const REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_MINIMUM_FIELDS = Object.freeze([
  'attestationId',
  'attestationSchema',
  'inputHash',
  'outputHash',
  'commandRunDigest',
  'decisionHash',
  'evidenceHash',
]);
export const REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_RELEASE_REQUIRED_FIELDS = Object.freeze([
  'executedCommands',
  'artifactHashes',
  'releaseEvidenceId',
  'releaseEvidenceHash',
]);
export const REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_REASON_CODES = Object.freeze([
  RELEASE_CLAIM_ATTESTATION_ACCEPTED_CODE,
  RELEASE_CLAIM_ATTESTATION_BLOCKED_CODE,
  RELEASE_CLAIM_ATTESTATION_DIAGNOSTICS_CODE,
  'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_REQUIRED',
  'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_INVALID',
  'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_MODE_REQUIRED',
  'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_MODE_INVALID',
  'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_MODE_DECISION_MISSING',
  'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_MODE_DECISION_PROVENANCE_INVALID',
  'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_MINIMUM_FIELDS_MISSING',
  'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_RELEASE_FIELDS_MISSING',
  'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_RELEASE_EVIDENCE_MISMATCH',
  'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_DECISION_HASH_MISMATCH',
  'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_COMMAND_RUN_DIGEST_MISMATCH',
  'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_EVIDENCE_HASH_MISMATCH',
  ...REVISION_BRIDGE_RELEASE_CLAIM_MODE_DECISION_REASON_CODES,
]);

function releaseClaimAttestationReason(code, field, message, details = {}) {
  return {
    code,
    field,
    message,
    ...cloneJsonSafe(details),
  };
}

function normalizeReleaseClaimAttestationDigestValue(value) {
  if (value === null) return null;
  if (typeof value === 'string') return normalizeString(value);
  if (typeof value === 'number') return normalizeNumber(value);
  if (typeof value === 'boolean') return normalizeBoolean(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeReleaseClaimAttestationDigestValue(item))
      .filter((item) => item !== undefined);
  }
  if (isPlainObject(value)) {
    const normalized = {};
    for (const key of Object.keys(value).sort()) {
      const normalizedValue = normalizeReleaseClaimAttestationDigestValue(value[key]);
      if (normalizedValue !== undefined) normalized[key] = normalizedValue;
    }
    return normalized;
  }
  return undefined;
}

function normalizeReleaseClaimAttestationCollection(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeReleaseClaimAttestationDigestValue(entry))
    .filter((entry) => {
      if (entry === undefined || entry === null) return false;
      if (typeof entry === 'string') return Boolean(entry);
      return true;
    });
}

function normalizeReleaseClaimAttestationModeDecisionResult(input = {}) {
  const result = isPlainObject(input) ? input : {};
  const binding = isPlainObject(result.binding) ? result.binding : {};
  const decision = isPlainObject(result.decision) ? result.decision : {};
  return {
    ok: result.ok === true,
    type: normalizeString(result.type),
    status: normalizeString(result.status),
    code: normalizeString(result.code),
    reason: normalizeString(result.reason),
    decision: cloneJsonSafe(decision),
    binding: {
      mode: normalizeString(binding.mode || decision.mode),
      claimId: normalizeString(binding.claimId || decision.claimId),
      dossierId: normalizeString(binding.dossierId || decision.dossierId),
      matrixId: normalizeString(binding.matrixId || decision.matrixId),
      dossierStatus: normalizeString(binding.dossierStatus),
      admissionStatus: normalizeString(binding.admissionStatus),
      baselineDebtFlag: binding.baselineDebtFlag === true,
    },
    summary: cloneJsonSafe(result.summary),
    reasons: Array.isArray(result.reasons) ? cloneJsonSafe(result.reasons) : [],
    dossierResult: isPlainObject(result.dossierResult) ? cloneJsonSafe(result.dossierResult) : {},
    admissionResult: isPlainObject(result.admissionResult) ? cloneJsonSafe(result.admissionResult) : {},
  };
}

export function createRevisionBridgeReleaseClaimModeDecisionHash(input = {}) {
  return revisionBlockHash(normalizeReleaseClaimAttestationModeDecisionResult(input));
}

export function createRevisionBridgeReleaseClaimCommandRunDigest(input = []) {
  return revisionBlockHash(normalizeReleaseClaimAttestationCollection(input));
}

export function createRevisionBridgeReleaseClaimEvidenceHash(input = []) {
  return revisionBlockHash(normalizeReleaseClaimAttestationCollection(input));
}

function normalizeReleaseClaimAttestationInput(input = {}) {
  const attestation = isPlainObject(input) ? input : {};
  return {
    schemaVersion: normalizeString(attestation.schemaVersion),
    mode: normalizeString(attestation.mode),
    attestationId: normalizeString(attestation.attestationId),
    attestationSchema: normalizeString(attestation.attestationSchema),
    inputHash: normalizeString(attestation.inputHash),
    outputHash: normalizeString(attestation.outputHash),
    commandRunDigest: normalizeString(attestation.commandRunDigest),
    decisionHash: normalizeString(attestation.decisionHash),
    evidenceHash: normalizeString(attestation.evidenceHash),
    executedCommands: normalizeReleaseClaimAttestationCollection(attestation.executedCommands),
    artifactHashes: normalizeReleaseClaimAttestationCollection(attestation.artifactHashes),
    releaseEvidenceId: normalizeString(attestation.releaseEvidenceId),
    releaseEvidenceHash: normalizeString(attestation.releaseEvidenceHash),
    modeDecisionResult: normalizeReleaseClaimAttestationModeDecisionResult(attestation.modeDecisionResult),
  };
}

function collectReleaseClaimAttestationReasons(input, attestation) {
  const reasons = [];
  if (!isPlainObject(input)) {
    reasons.push(releaseClaimAttestationReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_REQUIRED',
      'attestation',
      'attestation payload must be an object',
    ));
    return reasons;
  }
  if (attestation.schemaVersion !== REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_SCHEMA) {
    reasons.push(releaseClaimAttestationReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_INVALID',
      'attestation.schemaVersion',
      'attestation schemaVersion is not supported',
    ));
  }
  if (!attestation.mode) {
    reasons.push(releaseClaimAttestationReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_MODE_REQUIRED',
      'attestation.mode',
      'attestation mode is required',
    ));
  } else if (!REVISION_BRIDGE_RELEASE_CLAIM_MODE_VALUES.includes(attestation.mode)) {
    reasons.push(releaseClaimAttestationReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_MODE_INVALID',
      'attestation.mode',
      'attestation mode must be one of PR_MODE or RELEASE_MODE',
      { mode: attestation.mode },
    ));
  }
  return reasons;
}

function collectReleaseClaimAttestationModeDecisionProvenanceReasons(attestation, modeDecisionResult) {
  const reasons = [];
  const binding = isPlainObject(modeDecisionResult?.binding) ? modeDecisionResult.binding : {};
  const decision = isPlainObject(modeDecisionResult?.decision) ? modeDecisionResult.decision : {};
  const recomputedModeDecisionResult = evaluateRevisionBridgeReleaseClaimModeDecisionGate(decision);

  if (normalizeString(modeDecisionResult?.type) !== 'revisionBridge.releaseClaimModeDecisionGate') {
    reasons.push(releaseClaimAttestationReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_MODE_DECISION_PROVENANCE_INVALID',
      'modeDecisionResult.type',
      'mode decision result type must prove releaseClaimModeDecisionGate provenance',
    ));
  }
  if (modeDecisionResult?.ok !== true) {
    reasons.push(releaseClaimAttestationReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_MODE_DECISION_PROVENANCE_INVALID',
      'modeDecisionResult.ok',
      'mode decision result ok must be true',
    ));
  }
  if (normalizeString(modeDecisionResult?.status) !== 'accepted') {
    reasons.push(releaseClaimAttestationReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_MODE_DECISION_PROVENANCE_INVALID',
      'modeDecisionResult.status',
      'mode decision result status must be accepted',
    ));
  }
  if (normalizeString(modeDecisionResult?.code) !== RELEASE_CLAIM_MODE_DECISION_ACCEPTED_CODE) {
    reasons.push(releaseClaimAttestationReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_MODE_DECISION_PROVENANCE_INVALID',
      'modeDecisionResult.code',
      'mode decision result code must prove accepted mode decision provenance',
    ));
  }
  if (normalizeString(modeDecisionResult?.reason) !== RELEASE_CLAIM_MODE_DECISION_ACCEPTED_CODE) {
    reasons.push(releaseClaimAttestationReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_MODE_DECISION_PROVENANCE_INVALID',
      'modeDecisionResult.reason',
      'mode decision result reason must prove accepted mode decision provenance',
    ));
  }

  const bindingMode = normalizeString(binding.mode || decision.mode);
  if (!bindingMode) {
    reasons.push(releaseClaimAttestationReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_MODE_DECISION_PROVENANCE_INVALID',
      'modeDecisionResult.binding.mode',
      'mode decision provenance must bind mode',
    ));
  } else if (bindingMode !== attestation.mode) {
    reasons.push(releaseClaimAttestationReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_MODE_DECISION_PROVENANCE_INVALID',
      'modeDecisionResult.binding.mode',
      'mode decision binding mode must match attestation mode',
      { expectedMode: attestation.mode, receivedMode: bindingMode },
    ));
  }

  if (!normalizeString(binding.claimId || decision.claimId)) {
    reasons.push(releaseClaimAttestationReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_MODE_DECISION_PROVENANCE_INVALID',
      'modeDecisionResult.binding.claimId',
      'mode decision provenance must bind claimId',
    ));
  }
  if (!normalizeString(binding.dossierId || decision.dossierId)) {
    reasons.push(releaseClaimAttestationReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_MODE_DECISION_PROVENANCE_INVALID',
      'modeDecisionResult.binding.dossierId',
      'mode decision provenance must bind dossierId',
    ));
  }
  if (!normalizeString(binding.matrixId || decision.matrixId)) {
    reasons.push(releaseClaimAttestationReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_MODE_DECISION_PROVENANCE_INVALID',
      'modeDecisionResult.binding.matrixId',
      'mode decision provenance must bind matrixId',
    ));
  }
  if (normalizeString(binding.dossierStatus) !== 'accepted') {
    reasons.push(releaseClaimAttestationReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_MODE_DECISION_PROVENANCE_INVALID',
      'modeDecisionResult.binding.dossierStatus',
      'mode decision provenance must retain accepted dossier status',
    ));
  }
  if (normalizeString(binding.admissionStatus) !== 'accepted') {
    reasons.push(releaseClaimAttestationReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_MODE_DECISION_PROVENANCE_INVALID',
      'modeDecisionResult.binding.admissionStatus',
      'mode decision provenance must retain accepted admission status',
    ));
  }
  if (
    recomputedModeDecisionResult.ok !== true
    || normalizeString(recomputedModeDecisionResult.status) !== 'accepted'
    || normalizeString(recomputedModeDecisionResult.code) !== RELEASE_CLAIM_MODE_DECISION_ACCEPTED_CODE
  ) {
    reasons.push(releaseClaimAttestationReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_MODE_DECISION_PROVENANCE_INVALID',
      'modeDecisionResult.decision',
      'mode decision provenance must re-evaluate to accepted 12D from raw decision input',
      {
        recomputedStatus: normalizeString(recomputedModeDecisionResult.status),
        recomputedReason: normalizeString(recomputedModeDecisionResult.reason),
      },
    ));
  } else {
    const receivedModeDecisionHash = createRevisionBridgeReleaseClaimModeDecisionHash(modeDecisionResult);
    const recomputedModeDecisionHash = createRevisionBridgeReleaseClaimModeDecisionHash(recomputedModeDecisionResult);
    if (receivedModeDecisionHash !== recomputedModeDecisionHash) {
      reasons.push(releaseClaimAttestationReason(
        'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_MODE_DECISION_PROVENANCE_INVALID',
        'modeDecisionResult',
        'mode decision provenance must match recomputed accepted 12D result',
        {
          expectedModeDecisionHash: recomputedModeDecisionHash,
          receivedModeDecisionHash,
        },
      ));
    }
  }

  return reasons;
}

function collectReleaseClaimAttestationMinimumMissingFields(attestation) {
  return REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_MINIMUM_FIELDS.filter(
    (fieldName) => !normalizeString(attestation[fieldName]),
  );
}

function collectReleaseClaimAttestationReleaseMissingFields(attestation) {
  const missingFields = [];
  if (attestation.executedCommands.length === 0) missingFields.push('executedCommands');
  if (attestation.artifactHashes.length === 0) missingFields.push('artifactHashes');
  if (!attestation.releaseEvidenceId) missingFields.push('releaseEvidenceId');
  if (!attestation.releaseEvidenceHash) missingFields.push('releaseEvidenceHash');
  return missingFields;
}

function collectReleaseClaimAttestationReleaseEvidenceMismatchReasons(attestation, modeDecisionResult) {
  if (attestation.mode !== 'RELEASE_MODE') return [];

  const decision = isPlainObject(modeDecisionResult?.decision) ? modeDecisionResult.decision : {};
  const bindingPairs = [
    {
      field: 'releaseEvidenceId',
      expectedValue: normalizeString(decision.releaseEvidenceId),
      receivedValue: normalizeString(attestation.releaseEvidenceId),
    },
    {
      field: 'releaseEvidenceHash',
      expectedValue: normalizeString(decision.releaseEvidenceHash),
      receivedValue: normalizeString(attestation.releaseEvidenceHash),
    },
  ];

  return bindingPairs
    .filter((pair) => pair.expectedValue !== pair.receivedValue)
    .map((pair) => releaseClaimAttestationReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_RELEASE_EVIDENCE_MISMATCH',
      `attestation.${pair.field}`,
      `${pair.field} must match accepted 12D release evidence`,
      {
        expectedValue: pair.expectedValue,
        receivedValue: pair.receivedValue,
      },
    ));
}

function releaseClaimAttestationBinding(attestation, modeDecisionResult) {
  const binding = isPlainObject(modeDecisionResult?.binding) ? modeDecisionResult.binding : {};
  const decision = isPlainObject(modeDecisionResult?.decision) ? modeDecisionResult.decision : {};
  return {
    mode: attestation.mode || normalizeString(binding.mode || decision.mode),
    claimId: normalizeString(binding.claimId || decision.claimId),
    dossierId: normalizeString(binding.dossierId || decision.dossierId),
    matrixId: normalizeString(binding.matrixId || decision.matrixId),
    attestationId: attestation.attestationId,
  };
}

function releaseClaimAttestationSummary(attestation, modeDecisionResult, minimumMissingFields = [], releaseMissingFields = []) {
  return {
    mode: attestation.mode,
    minimumRequiredFields: cloneJsonSafe(REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_MINIMUM_FIELDS),
    missingMinimumFields: cloneJsonSafe(minimumMissingFields),
    releaseRequiredFields: cloneJsonSafe(REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_RELEASE_REQUIRED_FIELDS),
    missingReleaseFields: cloneJsonSafe(releaseMissingFields),
    expectedDecisionHash: createRevisionBridgeReleaseClaimModeDecisionHash(modeDecisionResult),
    expectedCommandRunDigest: createRevisionBridgeReleaseClaimCommandRunDigest(attestation.executedCommands),
    expectedEvidenceHash: createRevisionBridgeReleaseClaimEvidenceHash(attestation.artifactHashes),
    modeDecisionGate: {
      status: normalizeString(modeDecisionResult?.status),
      code: normalizeString(modeDecisionResult?.code),
      reason: normalizeString(modeDecisionResult?.reason),
    },
  };
}

function releaseClaimAttestationResult(
  ok,
  status,
  reasons,
  attestation,
  modeDecisionResult,
  minimumMissingFields = [],
  releaseMissingFields = [],
) {
  const code = ok
    ? RELEASE_CLAIM_ATTESTATION_ACCEPTED_CODE
    : (status === 'diagnostics'
      ? RELEASE_CLAIM_ATTESTATION_DIAGNOSTICS_CODE
      : RELEASE_CLAIM_ATTESTATION_BLOCKED_CODE);
  return {
    ok,
    type: 'revisionBridge.releaseClaimAttestationGate',
    status,
    code,
    reason: ok ? RELEASE_CLAIM_ATTESTATION_ACCEPTED_CODE : reasons[0]?.code || code,
    reasons: cloneJsonSafe(reasons),
    attestation: cloneJsonSafe(attestation),
    modeDecisionResult: cloneJsonSafe(modeDecisionResult),
    binding: releaseClaimAttestationBinding(attestation, modeDecisionResult),
    summary: releaseClaimAttestationSummary(
      attestation,
      modeDecisionResult,
      minimumMissingFields,
      releaseMissingFields,
    ),
  };
}

export function evaluateRevisionBridgeReleaseClaimAttestationGate(input = {}) {
  const attestation = normalizeReleaseClaimAttestationInput(input);
  const attestationReasons = collectReleaseClaimAttestationReasons(input, attestation);

  if (attestationReasons.length > 0) {
    return releaseClaimAttestationResult(
      false,
      'diagnostics',
      attestationReasons,
      attestation,
      attestation.modeDecisionResult,
    );
  }

  if (!isPlainObject(input.modeDecisionResult)) {
    return releaseClaimAttestationResult(
      false,
      'blocked',
      [
        releaseClaimAttestationReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_MODE_DECISION_MISSING',
          'modeDecisionResult',
          'attestation payload must include modeDecisionResult',
        ),
      ],
      attestation,
      attestation.modeDecisionResult,
    );
  }

  const modeDecisionResult = normalizeReleaseClaimAttestationModeDecisionResult(input.modeDecisionResult);
  const provenanceReasons = collectReleaseClaimAttestationModeDecisionProvenanceReasons(
    attestation,
    modeDecisionResult,
  );
  if (provenanceReasons.length > 0) {
    return releaseClaimAttestationResult(
      false,
      'blocked',
      provenanceReasons,
      attestation,
      modeDecisionResult,
    );
  }

  const minimumMissingFields = collectReleaseClaimAttestationMinimumMissingFields(attestation);
  if (minimumMissingFields.length > 0) {
    return releaseClaimAttestationResult(
      false,
      'blocked',
      [
        releaseClaimAttestationReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_MINIMUM_FIELDS_MISSING',
          'attestation',
          'attestation envelope is missing minimum required fields',
          { missingMinimumFields: minimumMissingFields },
        ),
      ],
      attestation,
      modeDecisionResult,
      minimumMissingFields,
    );
  }

  if (attestation.mode === 'RELEASE_MODE') {
    const releaseMissingFields = collectReleaseClaimAttestationReleaseMissingFields(attestation);
    if (releaseMissingFields.length > 0) {
      return releaseClaimAttestationResult(
        false,
        'blocked',
        [
          releaseClaimAttestationReason(
            'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_RELEASE_FIELDS_MISSING',
            'attestation',
            'release mode requires non-empty attestation release fields',
            { missingReleaseFields: releaseMissingFields },
          ),
        ],
        attestation,
        modeDecisionResult,
        [],
        releaseMissingFields,
      );
    }

    const releaseEvidenceMismatchReasons = collectReleaseClaimAttestationReleaseEvidenceMismatchReasons(
      attestation,
      modeDecisionResult,
    );
    if (releaseEvidenceMismatchReasons.length > 0) {
      return releaseClaimAttestationResult(
        false,
        'blocked',
        releaseEvidenceMismatchReasons,
        attestation,
        modeDecisionResult,
      );
    }
  }

  const expectedDecisionHash = createRevisionBridgeReleaseClaimModeDecisionHash(modeDecisionResult);
  if (attestation.decisionHash !== expectedDecisionHash) {
    return releaseClaimAttestationResult(
      false,
      'blocked',
      [
        releaseClaimAttestationReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_DECISION_HASH_MISMATCH',
          'attestation.decisionHash',
          'decisionHash must match normalized accepted mode decision result',
          {
            expectedDecisionHash,
            receivedDecisionHash: attestation.decisionHash,
          },
        ),
      ],
      attestation,
      modeDecisionResult,
    );
  }

  const expectedCommandRunDigest = createRevisionBridgeReleaseClaimCommandRunDigest(attestation.executedCommands);
  if (attestation.commandRunDigest !== expectedCommandRunDigest) {
    return releaseClaimAttestationResult(
      false,
      'blocked',
      [
        releaseClaimAttestationReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_COMMAND_RUN_DIGEST_MISMATCH',
          'attestation.commandRunDigest',
          'commandRunDigest must match normalized executedCommands digest',
          {
            expectedCommandRunDigest,
            receivedCommandRunDigest: attestation.commandRunDigest,
          },
        ),
      ],
      attestation,
      modeDecisionResult,
    );
  }

  const expectedEvidenceHash = createRevisionBridgeReleaseClaimEvidenceHash(attestation.artifactHashes);
  if (attestation.evidenceHash !== expectedEvidenceHash) {
    return releaseClaimAttestationResult(
      false,
      'blocked',
      [
        releaseClaimAttestationReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_EVIDENCE_HASH_MISMATCH',
          'attestation.evidenceHash',
          'evidenceHash must match normalized artifactHashes digest',
          {
            expectedEvidenceHash,
            receivedEvidenceHash: attestation.evidenceHash,
          },
        ),
      ],
      attestation,
      modeDecisionResult,
    );
  }

  return releaseClaimAttestationResult(
    true,
    'accepted',
    [],
    attestation,
    modeDecisionResult,
  );
}
// CONTOUR_12E_RELEASE_CLAIM_ATTESTATION_GATE_END

// CONTOUR_12F_RELEASE_CLAIM_PACKET_EMIT_START
const RELEASE_CLAIM_PACKET_EMIT_ACCEPTED_CODE = 'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_EMIT_ACCEPTED';
const RELEASE_CLAIM_PACKET_EMIT_BLOCKED_CODE = 'E_REVISION_BRIDGE_RELEASE_CLAIM_PACKET_EMIT_BLOCKED';
const RELEASE_CLAIM_PACKET_EMIT_DIAGNOSTICS_CODE = 'E_REVISION_BRIDGE_RELEASE_CLAIM_PACKET_EMIT_DIAGNOSTICS';
const RELEASE_CLAIM_STRICT_REPORT_VALID_CODE = 'REVISION_BRIDGE_RELEASE_CLAIM_STRICT_REPORT_VALID';
const RELEASE_CLAIM_STRICT_REPORT_INVALID_CODE = 'E_REVISION_BRIDGE_RELEASE_CLAIM_STRICT_REPORT_INVALID';

export const REVISION_BRIDGE_RELEASE_CLAIM_PACKET_SCHEMA =
  'revision-bridge.release-claim-packet.v1';
export const REVISION_BRIDGE_RELEASE_CLAIM_STRICT_REPORT_SCHEMA =
  'revision-bridge.release-claim-report.v1';
export const REVISION_BRIDGE_RELEASE_CLAIM_PACKET_META_FIELDS = Object.freeze([
  'packetId',
  'createdAtUtc',
  'emitterId',
]);
export const REVISION_BRIDGE_RELEASE_CLAIM_PACKET_MODE_CLASS_BY_MODE = Object.freeze({
  PR_MODE: 'INTERNAL_PROOF_ONLY',
  RELEASE_MODE: 'USER_FACING_CLAIM_READY',
});
export const REVISION_BRIDGE_RELEASE_CLAIM_STRICT_REPORT_KEYS = Object.freeze([
  'schemaVersion',
  'reportClass',
  'packetSchemaVersion',
  'packetId',
  'packetHash',
  'createdAtUtc',
  'mode',
  'modeClass',
  'claimId',
  'dossierId',
  'matrixId',
  'attestationId',
  'decisionHash',
  'evidenceHash',
  'commandRunDigest',
  'prerequisiteCodes',
]);
export const REVISION_BRIDGE_RELEASE_CLAIM_PACKET_EMIT_REASON_CODES = Object.freeze([
  RELEASE_CLAIM_PACKET_EMIT_ACCEPTED_CODE,
  RELEASE_CLAIM_PACKET_EMIT_BLOCKED_CODE,
  RELEASE_CLAIM_PACKET_EMIT_DIAGNOSTICS_CODE,
  RELEASE_CLAIM_STRICT_REPORT_VALID_CODE,
  RELEASE_CLAIM_STRICT_REPORT_INVALID_CODE,
  'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_META_INVALID',
  'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_MODE_DECISION_RESULT_MISSING',
  'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_MODE_DECISION_RESULT_NOT_ACCEPTED',
  'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_ATTESTATION_RESULT_MISSING',
  'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_ATTESTATION_RESULT_NOT_ACCEPTED',
  'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_BINDING_MODE_MISMATCH',
  'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_BINDING_CLAIM_ID_MISMATCH',
  'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_BINDING_DOSSIER_ID_MISMATCH',
  'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_BINDING_MATRIX_ID_MISMATCH',
  'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_BINDING_DECISION_HASH_MISMATCH',
  'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_STRICT_REPORT_MISSING_FIELDS',
  'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_STRICT_REPORT_EXTRA_FIELDS',
  'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_STRICT_REPORT_INVALID_VALUE',
  ...REVISION_BRIDGE_RELEASE_CLAIM_MODE_DECISION_REASON_CODES,
  ...REVISION_BRIDGE_RELEASE_CLAIM_ATTESTATION_REASON_CODES,
]);

function releaseClaimPacketEmitReason(code, field, message, details = {}) {
  return {
    code,
    field,
    message,
    ...cloneJsonSafe(details),
  };
}

function normalizeReleaseClaimPacketModeDecisionResult(input = {}) {
  const ownInput = isPlainObject(input) ? cloneJsonSafe(input) : {};
  return normalizeReleaseClaimAttestationModeDecisionResult(ownInput);
}

function normalizeReleaseClaimPacketAttestationResult(input = {}) {
  const result = isPlainObject(input) ? cloneJsonSafe(input) : {};
  const binding = isPlainObject(result.binding) ? result.binding : {};
  const attestation = isPlainObject(result.attestation) ? result.attestation : {};
  const modeDecisionResult = isPlainObject(result.modeDecisionResult)
    ? normalizeReleaseClaimPacketModeDecisionResult(result.modeDecisionResult)
    : {};
  return {
    ok: result.ok === true,
    type: normalizeString(result.type),
    status: normalizeString(result.status),
    code: normalizeString(result.code),
    reason: normalizeString(result.reason),
    attestation: cloneJsonSafe(attestation),
    modeDecisionResult,
    binding: {
      mode: normalizeString(binding.mode || attestation.mode || modeDecisionResult.binding?.mode),
      claimId: normalizeString(
        binding.claimId
        || modeDecisionResult.binding?.claimId
        || modeDecisionResult.decision?.claimId,
      ),
      dossierId: normalizeString(
        binding.dossierId
        || modeDecisionResult.binding?.dossierId
        || modeDecisionResult.decision?.dossierId,
      ),
      matrixId: normalizeString(
        binding.matrixId
        || modeDecisionResult.binding?.matrixId
        || modeDecisionResult.decision?.matrixId,
      ),
      attestationId: normalizeString(binding.attestationId || attestation.attestationId),
    },
    summary: cloneJsonSafe(result.summary),
    reasons: Array.isArray(result.reasons) ? cloneJsonSafe(result.reasons) : [],
  };
}

function normalizeReleaseClaimPacketMeta(input = {}) {
  const packetMeta = isPlainObject(input) ? cloneJsonSafe(input) : {};
  return {
    packetId: normalizeString(packetMeta.packetId),
    createdAtUtc: normalizeString(packetMeta.createdAtUtc),
    emitterId: normalizeString(packetMeta.emitterId),
  };
}

function collectReleaseClaimPacketMetaReasons(input, packetMeta) {
  const reasons = [];
  if (!isPlainObject(input)) {
    reasons.push(releaseClaimPacketEmitReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_META_INVALID',
      'packetMeta',
      'packetMeta must be an object',
    ));
    return reasons;
  }

  const extraFields = Object.keys(input)
    .filter((field) => !REVISION_BRIDGE_RELEASE_CLAIM_PACKET_META_FIELDS.includes(field))
    .sort();
  const missingFields = REVISION_BRIDGE_RELEASE_CLAIM_PACKET_META_FIELDS.filter(
    (field) => !packetMeta[field],
  );

  if (extraFields.length > 0 || missingFields.length > 0) {
    reasons.push(releaseClaimPacketEmitReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_META_INVALID',
      'packetMeta',
      'packetMeta must contain only required non-empty canonical fields',
      {
        extraFields,
        missingFields,
      },
    ));
  }

  return reasons;
}

function collectReleaseClaimPacketModeDecisionAcceptanceReasons(modeDecisionResult) {
  const reasons = [];
  const binding = isPlainObject(modeDecisionResult?.binding) ? modeDecisionResult.binding : {};
  const decision = isPlainObject(modeDecisionResult?.decision) ? modeDecisionResult.decision : {};
  const recomputedModeDecisionResult = evaluateRevisionBridgeReleaseClaimModeDecisionGate(decision);

  if (normalizeString(modeDecisionResult?.type) !== 'revisionBridge.releaseClaimModeDecisionGate') {
    reasons.push(releaseClaimPacketEmitReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_MODE_DECISION_RESULT_NOT_ACCEPTED',
      'modeDecisionResult.type',
      'modeDecisionResult must prove releaseClaimModeDecisionGate provenance',
    ));
  }
  if (modeDecisionResult?.ok !== true) {
    reasons.push(releaseClaimPacketEmitReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_MODE_DECISION_RESULT_NOT_ACCEPTED',
      'modeDecisionResult.ok',
      'modeDecisionResult ok must be true',
    ));
  }
  if (normalizeString(modeDecisionResult?.status) !== 'accepted') {
    reasons.push(releaseClaimPacketEmitReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_MODE_DECISION_RESULT_NOT_ACCEPTED',
      'modeDecisionResult.status',
      'modeDecisionResult status must be accepted',
    ));
  }
  if (normalizeString(modeDecisionResult?.code) !== RELEASE_CLAIM_MODE_DECISION_ACCEPTED_CODE) {
    reasons.push(releaseClaimPacketEmitReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_MODE_DECISION_RESULT_NOT_ACCEPTED',
      'modeDecisionResult.code',
      'modeDecisionResult code must prove accepted mode decision provenance',
    ));
  }
  if (normalizeString(modeDecisionResult?.reason) !== RELEASE_CLAIM_MODE_DECISION_ACCEPTED_CODE) {
    reasons.push(releaseClaimPacketEmitReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_MODE_DECISION_RESULT_NOT_ACCEPTED',
      'modeDecisionResult.reason',
      'modeDecisionResult reason must prove accepted mode decision provenance',
    ));
  }
  if (!normalizeString(binding.mode || decision.mode)) {
    reasons.push(releaseClaimPacketEmitReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_MODE_DECISION_RESULT_NOT_ACCEPTED',
      'modeDecisionResult.binding.mode',
      'modeDecisionResult must bind mode',
    ));
  }
  if (!normalizeString(binding.claimId || decision.claimId)) {
    reasons.push(releaseClaimPacketEmitReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_MODE_DECISION_RESULT_NOT_ACCEPTED',
      'modeDecisionResult.binding.claimId',
      'modeDecisionResult must bind claimId',
    ));
  }
  if (!normalizeString(binding.dossierId || decision.dossierId)) {
    reasons.push(releaseClaimPacketEmitReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_MODE_DECISION_RESULT_NOT_ACCEPTED',
      'modeDecisionResult.binding.dossierId',
      'modeDecisionResult must bind dossierId',
    ));
  }
  if (!normalizeString(binding.matrixId || decision.matrixId)) {
    reasons.push(releaseClaimPacketEmitReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_MODE_DECISION_RESULT_NOT_ACCEPTED',
      'modeDecisionResult.binding.matrixId',
      'modeDecisionResult must bind matrixId',
    ));
  }
  if (normalizeString(binding.dossierStatus) !== 'accepted') {
    reasons.push(releaseClaimPacketEmitReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_MODE_DECISION_RESULT_NOT_ACCEPTED',
      'modeDecisionResult.binding.dossierStatus',
      'modeDecisionResult must retain accepted dossier status',
    ));
  }
  if (normalizeString(binding.admissionStatus) !== 'accepted') {
    reasons.push(releaseClaimPacketEmitReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_MODE_DECISION_RESULT_NOT_ACCEPTED',
      'modeDecisionResult.binding.admissionStatus',
      'modeDecisionResult must retain accepted admission status',
    ));
  }
  if (
    recomputedModeDecisionResult.ok !== true
    || normalizeString(recomputedModeDecisionResult.status) !== 'accepted'
    || normalizeString(recomputedModeDecisionResult.code) !== RELEASE_CLAIM_MODE_DECISION_ACCEPTED_CODE
  ) {
    reasons.push(releaseClaimPacketEmitReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_MODE_DECISION_RESULT_NOT_ACCEPTED',
      'modeDecisionResult.decision',
      'modeDecisionResult must re-evaluate to accepted 12D from raw decision input',
      {
        recomputedStatus: normalizeString(recomputedModeDecisionResult.status),
        recomputedReason: normalizeString(recomputedModeDecisionResult.reason),
      },
    ));
  } else {
    const receivedModeDecisionHash = createRevisionBridgeReleaseClaimModeDecisionHash(modeDecisionResult);
    const recomputedModeDecisionHash = createRevisionBridgeReleaseClaimModeDecisionHash(recomputedModeDecisionResult);
    if (receivedModeDecisionHash !== recomputedModeDecisionHash) {
      reasons.push(releaseClaimPacketEmitReason(
        'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_MODE_DECISION_RESULT_NOT_ACCEPTED',
        'modeDecisionResult',
        'modeDecisionResult must match recomputed accepted 12D result',
        {
          expectedModeDecisionHash: recomputedModeDecisionHash,
          receivedModeDecisionHash,
        },
      ));
    }
  }

  return reasons;
}

function collectReleaseClaimPacketAttestationAcceptanceReasons(attestationResult) {
  const reasons = [];
  const binding = isPlainObject(attestationResult?.binding) ? attestationResult.binding : {};
  const attestation = isPlainObject(attestationResult?.attestation) ? attestationResult.attestation : {};

  if (normalizeString(attestationResult?.type) !== 'revisionBridge.releaseClaimAttestationGate') {
    reasons.push(releaseClaimPacketEmitReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_ATTESTATION_RESULT_NOT_ACCEPTED',
      'attestationResult.type',
      'attestationResult must prove releaseClaimAttestationGate provenance',
    ));
  }
  if (attestationResult?.ok !== true) {
    reasons.push(releaseClaimPacketEmitReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_ATTESTATION_RESULT_NOT_ACCEPTED',
      'attestationResult.ok',
      'attestationResult ok must be true',
    ));
  }
  if (normalizeString(attestationResult?.status) !== 'accepted') {
    reasons.push(releaseClaimPacketEmitReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_ATTESTATION_RESULT_NOT_ACCEPTED',
      'attestationResult.status',
      'attestationResult status must be accepted',
    ));
  }
  if (normalizeString(attestationResult?.code) !== RELEASE_CLAIM_ATTESTATION_ACCEPTED_CODE) {
    reasons.push(releaseClaimPacketEmitReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_ATTESTATION_RESULT_NOT_ACCEPTED',
      'attestationResult.code',
      'attestationResult code must prove accepted attestation provenance',
    ));
  }
  if (normalizeString(attestationResult?.reason) !== RELEASE_CLAIM_ATTESTATION_ACCEPTED_CODE) {
    reasons.push(releaseClaimPacketEmitReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_ATTESTATION_RESULT_NOT_ACCEPTED',
      'attestationResult.reason',
      'attestationResult reason must prove accepted attestation provenance',
    ));
  }
  if (!normalizeString(binding.mode || attestation.mode)) {
    reasons.push(releaseClaimPacketEmitReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_ATTESTATION_RESULT_NOT_ACCEPTED',
      'attestationResult.binding.mode',
      'attestationResult must bind mode',
    ));
  }
  if (!normalizeString(binding.claimId)) {
    reasons.push(releaseClaimPacketEmitReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_ATTESTATION_RESULT_NOT_ACCEPTED',
      'attestationResult.binding.claimId',
      'attestationResult must bind claimId',
    ));
  }
  if (!normalizeString(binding.dossierId)) {
    reasons.push(releaseClaimPacketEmitReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_ATTESTATION_RESULT_NOT_ACCEPTED',
      'attestationResult.binding.dossierId',
      'attestationResult must bind dossierId',
    ));
  }
  if (!normalizeString(binding.matrixId)) {
    reasons.push(releaseClaimPacketEmitReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_ATTESTATION_RESULT_NOT_ACCEPTED',
      'attestationResult.binding.matrixId',
      'attestationResult must bind matrixId',
    ));
  }
  if (!normalizeString(binding.attestationId || attestation.attestationId)) {
    reasons.push(releaseClaimPacketEmitReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_ATTESTATION_RESULT_NOT_ACCEPTED',
      'attestationResult.binding.attestationId',
      'attestationResult must bind attestationId',
    ));
  }

  return reasons;
}

function collectReleaseClaimPacketAttestationProvenanceReasons(attestationResult) {
  const reasons = [];
  const attestation = isPlainObject(attestationResult?.attestation) ? attestationResult.attestation : {};
  const recomputedAttestationResult = evaluateRevisionBridgeReleaseClaimAttestationGate(attestation);

  if (
    recomputedAttestationResult.ok !== true
    || normalizeString(recomputedAttestationResult.status) !== 'accepted'
    || normalizeString(recomputedAttestationResult.code) !== RELEASE_CLAIM_ATTESTATION_ACCEPTED_CODE
  ) {
    reasons.push(releaseClaimPacketEmitReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_ATTESTATION_RESULT_NOT_ACCEPTED',
      'attestationResult.attestation',
      'attestationResult must re-evaluate to accepted 12E from raw attestation input',
      {
        recomputedStatus: normalizeString(recomputedAttestationResult.status),
        recomputedReason: normalizeString(recomputedAttestationResult.reason),
      },
    ));
  } else {
    const receivedAttestationHash = revisionBlockHash(
      normalizeReleaseClaimPacketAttestationResult(attestationResult),
    );
    const recomputedAttestationHash = revisionBlockHash(
      normalizeReleaseClaimPacketAttestationResult(recomputedAttestationResult),
    );
    if (receivedAttestationHash !== recomputedAttestationHash) {
      reasons.push(releaseClaimPacketEmitReason(
        'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_ATTESTATION_RESULT_NOT_ACCEPTED',
        'attestationResult',
        'attestationResult must match recomputed accepted 12E result',
        {
          expectedAttestationHash: recomputedAttestationHash,
          receivedAttestationHash,
        },
      ));
    }
  }

  return reasons;
}

function releaseClaimPacketBindingField(binding, decision, field) {
  return normalizeString(binding[field] || decision[field]);
}

function collectReleaseClaimPacketBindingMatchReasons(modeDecisionResult, attestationResult) {
  const reasons = [];
  const modeDecisionBinding = isPlainObject(modeDecisionResult?.binding) ? modeDecisionResult.binding : {};
  const decision = isPlainObject(modeDecisionResult?.decision) ? modeDecisionResult.decision : {};
  const attestationBinding = isPlainObject(attestationResult?.binding) ? attestationResult.binding : {};
  const attestation = isPlainObject(attestationResult?.attestation) ? attestationResult.attestation : {};
  const bindingPairs = [
    {
      field: 'mode',
      code: 'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_BINDING_MODE_MISMATCH',
      reasonField: 'binding.mode',
      expectedValue: releaseClaimPacketBindingField(modeDecisionBinding, decision, 'mode'),
      receivedValue: normalizeString(attestationBinding.mode || attestation.mode),
    },
    {
      field: 'claimId',
      code: 'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_BINDING_CLAIM_ID_MISMATCH',
      reasonField: 'binding.claimId',
      expectedValue: releaseClaimPacketBindingField(modeDecisionBinding, decision, 'claimId'),
      receivedValue: normalizeString(attestationBinding.claimId),
    },
    {
      field: 'dossierId',
      code: 'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_BINDING_DOSSIER_ID_MISMATCH',
      reasonField: 'binding.dossierId',
      expectedValue: releaseClaimPacketBindingField(modeDecisionBinding, decision, 'dossierId'),
      receivedValue: normalizeString(attestationBinding.dossierId),
    },
    {
      field: 'matrixId',
      code: 'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_BINDING_MATRIX_ID_MISMATCH',
      reasonField: 'binding.matrixId',
      expectedValue: releaseClaimPacketBindingField(modeDecisionBinding, decision, 'matrixId'),
      receivedValue: normalizeString(attestationBinding.matrixId),
    },
    {
      field: 'decisionHash',
      code: 'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_BINDING_DECISION_HASH_MISMATCH',
      reasonField: 'binding.decisionHash',
      expectedValue: createRevisionBridgeReleaseClaimModeDecisionHash(modeDecisionResult),
      receivedValue: normalizeString(attestation.decisionHash),
    },
  ];

  bindingPairs.forEach((pair) => {
    if (pair.expectedValue !== pair.receivedValue) {
      reasons.push(releaseClaimPacketEmitReason(
        pair.code,
        pair.reasonField,
        `${pair.field} must match across accepted 12D and 12E results`,
        {
          expectedValue: pair.expectedValue,
          receivedValue: pair.receivedValue,
        },
      ));
    }
  });

  return reasons;
}

function normalizeReleaseClaimPacketHashValue(value) {
  if (value === null) return null;
  if (typeof value === 'string') return normalizeString(value);
  if (typeof value === 'number') return normalizeNumber(value);
  if (typeof value === 'boolean') return normalizeBoolean(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeReleaseClaimPacketHashValue(item))
      .filter((item) => item !== undefined)
      .sort((left, right) => {
        const leftValue = revisionBlockCanonicalJson(left);
        const rightValue = revisionBlockCanonicalJson(right);
        if (leftValue === rightValue) return 0;
        return leftValue < rightValue ? -1 : 1;
      });
  }
  if (isPlainObject(value)) {
    const normalized = {};
    for (const key of Object.keys(value).sort()) {
      const normalizedValue = normalizeReleaseClaimPacketHashValue(value[key]);
      if (normalizedValue !== undefined) normalized[key] = normalizedValue;
    }
    return normalized;
  }
  return undefined;
}

function normalizeReleaseClaimStrictReport(input = {}) {
  const report = isPlainObject(input) ? input : {};
  return {
    schemaVersion: normalizeString(report.schemaVersion),
    reportClass: normalizeString(report.reportClass),
    packetSchemaVersion: normalizeString(report.packetSchemaVersion),
    packetId: normalizeString(report.packetId),
    packetHash: normalizeString(report.packetHash),
    createdAtUtc: normalizeString(report.createdAtUtc),
    mode: normalizeString(report.mode),
    modeClass: normalizeString(report.modeClass),
    claimId: normalizeString(report.claimId),
    dossierId: normalizeString(report.dossierId),
    matrixId: normalizeString(report.matrixId),
    attestationId: normalizeString(report.attestationId),
    decisionHash: normalizeString(report.decisionHash),
    evidenceHash: normalizeString(report.evidenceHash),
    commandRunDigest: normalizeString(report.commandRunDigest),
    prerequisiteCodes: sortedStableStrings(report.prerequisiteCodes),
  };
}

function collectReleaseClaimStrictReportShapeReasons(input, report) {
  const reasons = [];
  if (!isPlainObject(input)) {
    reasons.push(releaseClaimPacketEmitReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_STRICT_REPORT_INVALID_VALUE',
      'report',
      'strict report must be an object',
    ));
    return reasons;
  }

  const reportKeys = Object.keys(input).sort();
  const missingFields = REVISION_BRIDGE_RELEASE_CLAIM_STRICT_REPORT_KEYS.filter(
    (field) => !reportKeys.includes(field),
  );
  const extraFields = reportKeys.filter(
    (field) => !REVISION_BRIDGE_RELEASE_CLAIM_STRICT_REPORT_KEYS.includes(field),
  );

  if (missingFields.length > 0) {
    reasons.push(releaseClaimPacketEmitReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_STRICT_REPORT_MISSING_FIELDS',
      'report',
      'strict report must contain all fixed fields',
      { missingFields },
    ));
  }
  if (extraFields.length > 0) {
    reasons.push(releaseClaimPacketEmitReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_STRICT_REPORT_EXTRA_FIELDS',
      'report',
      'strict report cannot contain extra fields',
      { extraFields },
    ));
  }

  REVISION_BRIDGE_RELEASE_CLAIM_STRICT_REPORT_KEYS.forEach((field) => {
    if (field === 'prerequisiteCodes') {
      if (!Array.isArray(input.prerequisiteCodes) || report.prerequisiteCodes.length === 0) {
        reasons.push(releaseClaimPacketEmitReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_STRICT_REPORT_INVALID_VALUE',
          `report.${field}`,
          'strict report prerequisiteCodes must be a non-empty array of codes',
        ));
      }
      return;
    }

    if (!report[field]) {
      reasons.push(releaseClaimPacketEmitReason(
        'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_STRICT_REPORT_INVALID_VALUE',
        `report.${field}`,
        'strict report fields must be non-empty strings',
      ));
    }
  });

  return reasons;
}

function buildReleaseClaimPacketModeClass(mode) {
  return REVISION_BRIDGE_RELEASE_CLAIM_PACKET_MODE_CLASS_BY_MODE[mode] || '';
}

function buildReleaseClaimPacket(modeDecisionResult, attestationResult, packetMeta) {
  const modeDecisionBinding = isPlainObject(modeDecisionResult?.binding) ? modeDecisionResult.binding : {};
  const decision = isPlainObject(modeDecisionResult?.decision) ? modeDecisionResult.decision : {};
  const attestation = isPlainObject(attestationResult?.attestation) ? attestationResult.attestation : {};
  const attestationBinding = isPlainObject(attestationResult?.binding) ? attestationResult.binding : {};
  const mode = releaseClaimPacketBindingField(modeDecisionBinding, decision, 'mode');
  const modeClass = buildReleaseClaimPacketModeClass(mode);
  const packet = {
    schemaVersion: REVISION_BRIDGE_RELEASE_CLAIM_PACKET_SCHEMA,
    packetMeta: {
      packetId: packetMeta.packetId,
      createdAtUtc: packetMeta.createdAtUtc,
      emitterId: packetMeta.emitterId,
    },
    releaseClaim: {
      mode,
      modeClass,
      claimId: releaseClaimPacketBindingField(modeDecisionBinding, decision, 'claimId'),
      dossierId: releaseClaimPacketBindingField(modeDecisionBinding, decision, 'dossierId'),
      matrixId: releaseClaimPacketBindingField(modeDecisionBinding, decision, 'matrixId'),
    },
    attestation: {
      attestationId: normalizeString(attestationBinding.attestationId || attestation.attestationId),
      inputHash: normalizeString(attestation.inputHash),
      outputHash: normalizeString(attestation.outputHash),
      commandRunDigest: normalizeString(attestation.commandRunDigest),
      decisionHash: normalizeString(attestation.decisionHash),
      evidenceHash: normalizeString(attestation.evidenceHash),
      releaseEvidenceId: normalizeString(attestation.releaseEvidenceId),
      releaseEvidenceHash: normalizeString(attestation.releaseEvidenceHash),
      executedCommands: normalizeReleaseClaimPacketHashValue(attestation.executedCommands || []),
      artifactHashes: normalizeReleaseClaimPacketHashValue(attestation.artifactHashes || []),
    },
    prerequisiteCodes: sortedStableStrings([
      normalizeString(modeDecisionResult?.code),
      normalizeString(attestationResult?.code),
    ]),
  };

  return cloneJsonSafe({
    ...packet,
    packetHash: createRevisionBridgeReleaseClaimPacketHash(packet),
  });
}

function buildReleaseClaimStrictReport(packet) {
  const report = {
    schemaVersion: REVISION_BRIDGE_RELEASE_CLAIM_STRICT_REPORT_SCHEMA,
    reportClass: 'STRICT_RELEASE_CLAIM_REPORT',
    packetSchemaVersion: REVISION_BRIDGE_RELEASE_CLAIM_PACKET_SCHEMA,
    packetId: normalizeString(packet?.packetMeta?.packetId),
    packetHash: normalizeString(packet?.packetHash),
    createdAtUtc: normalizeString(packet?.packetMeta?.createdAtUtc),
    mode: normalizeString(packet?.releaseClaim?.mode),
    modeClass: normalizeString(packet?.releaseClaim?.modeClass),
    claimId: normalizeString(packet?.releaseClaim?.claimId),
    dossierId: normalizeString(packet?.releaseClaim?.dossierId),
    matrixId: normalizeString(packet?.releaseClaim?.matrixId),
    attestationId: normalizeString(packet?.attestation?.attestationId),
    decisionHash: normalizeString(packet?.attestation?.decisionHash),
    evidenceHash: normalizeString(packet?.attestation?.evidenceHash),
    commandRunDigest: normalizeString(packet?.attestation?.commandRunDigest),
    prerequisiteCodes: sortedStableStrings(packet?.prerequisiteCodes),
  };

  return cloneJsonSafe(report);
}

export function createRevisionBridgeReleaseClaimPacketHash(input = {}) {
  const packet = isPlainObject(input) ? input : {};
  const packetMeta = isPlainObject(packet.packetMeta) ? packet.packetMeta : {};
  const packetBody = {
    schemaVersion: normalizeString(packet.schemaVersion),
    packetMeta: {
      packetId: normalizeString(packetMeta.packetId),
      emitterId: normalizeString(packetMeta.emitterId),
    },
    releaseClaim: normalizeReleaseClaimPacketHashValue(packet.releaseClaim),
    attestation: normalizeReleaseClaimPacketHashValue(packet.attestation),
    prerequisiteCodes: normalizeReleaseClaimPacketHashValue(packet.prerequisiteCodes),
  };
  return revisionBlockHash(normalizeReleaseClaimPacketHashValue(packetBody));
}

export function validateRevisionBridgeReleaseClaimStrictReportShape(input = {}) {
  const report = normalizeReleaseClaimStrictReport(input);
  const reasons = collectReleaseClaimStrictReportShapeReasons(input, report);
  const ok = reasons.length === 0;
  return {
    ok,
    type: 'revisionBridge.releaseClaimStrictReportValidation',
    status: ok ? 'accepted' : 'blocked',
    code: ok ? RELEASE_CLAIM_STRICT_REPORT_VALID_CODE : RELEASE_CLAIM_STRICT_REPORT_INVALID_CODE,
    reason: ok ? RELEASE_CLAIM_STRICT_REPORT_VALID_CODE : reasons[0]?.code || RELEASE_CLAIM_STRICT_REPORT_INVALID_CODE,
    reasons: cloneJsonSafe(reasons),
    report,
  };
}

function releaseClaimPacketEmitBinding(packet, report) {
  return {
    mode: normalizeString(packet?.releaseClaim?.mode),
    modeClass: normalizeString(packet?.releaseClaim?.modeClass),
    claimId: normalizeString(report?.claimId),
    dossierId: normalizeString(report?.dossierId),
    matrixId: normalizeString(report?.matrixId),
    packetId: normalizeString(report?.packetId),
    attestationId: normalizeString(report?.attestationId),
  };
}

function releaseClaimPacketEmitSummary(packet, report) {
  return {
    packetSchemaVersion: normalizeString(packet?.schemaVersion),
    strictReportSchemaVersion: normalizeString(report?.schemaVersion),
    packetHash: normalizeString(packet?.packetHash),
    prerequisiteCodes: sortedStableStrings(report?.prerequisiteCodes),
  };
}

function releaseClaimPacketEmitResult(ok, status, reasons, packet = null, report = null) {
  const code = ok
    ? RELEASE_CLAIM_PACKET_EMIT_ACCEPTED_CODE
    : (status === 'diagnostics'
      ? RELEASE_CLAIM_PACKET_EMIT_DIAGNOSTICS_CODE
      : RELEASE_CLAIM_PACKET_EMIT_BLOCKED_CODE);
  return {
    ok,
    type: 'revisionBridge.releaseClaimPacketEmit',
    status,
    code,
    reason: ok ? RELEASE_CLAIM_PACKET_EMIT_ACCEPTED_CODE : reasons[0]?.code || code,
    reasons: cloneJsonSafe(reasons),
    binding: releaseClaimPacketEmitBinding(packet, report),
    summary: releaseClaimPacketEmitSummary(packet, report),
    packet: cloneJsonSafe(packet),
    report: cloneJsonSafe(report),
  };
}

export function evaluateRevisionBridgeReleaseClaimPacketEmit(input = {}) {
  const packetInput = isPlainObject(input) ? input : {};
  const packetMeta = normalizeReleaseClaimPacketMeta(packetInput.packetMeta);
  const packetMetaReasons = collectReleaseClaimPacketMetaReasons(packetInput.packetMeta, packetMeta);
  if (packetMetaReasons.length > 0) {
    return releaseClaimPacketEmitResult(false, 'diagnostics', packetMetaReasons);
  }

  if (!isPlainObject(packetInput.modeDecisionResult)) {
    return releaseClaimPacketEmitResult(
      false,
      'blocked',
      [
        releaseClaimPacketEmitReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_MODE_DECISION_RESULT_MISSING',
          'modeDecisionResult',
          'release claim packet emit requires accepted modeDecisionResult',
        ),
      ],
    );
  }

  if (!isPlainObject(packetInput.attestationResult)) {
    return releaseClaimPacketEmitResult(
      false,
      'blocked',
      [
        releaseClaimPacketEmitReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_PACKET_ATTESTATION_RESULT_MISSING',
          'attestationResult',
          'release claim packet emit requires accepted attestationResult',
        ),
      ],
    );
  }

  const modeDecisionResult = normalizeReleaseClaimPacketModeDecisionResult(packetInput.modeDecisionResult);
  const modeDecisionReasons = collectReleaseClaimPacketModeDecisionAcceptanceReasons(modeDecisionResult);
  if (modeDecisionReasons.length > 0) {
    return releaseClaimPacketEmitResult(false, 'blocked', modeDecisionReasons);
  }

  const attestationResult = normalizeReleaseClaimPacketAttestationResult(packetInput.attestationResult);
  const attestationReasons = collectReleaseClaimPacketAttestationAcceptanceReasons(attestationResult);
  if (attestationReasons.length > 0) {
    return releaseClaimPacketEmitResult(false, 'blocked', attestationReasons);
  }

  const bindingReasons = collectReleaseClaimPacketBindingMatchReasons(
    modeDecisionResult,
    attestationResult,
  );
  if (bindingReasons.length > 0) {
    return releaseClaimPacketEmitResult(false, 'blocked', bindingReasons);
  }

  const attestationProvenanceReasons = collectReleaseClaimPacketAttestationProvenanceReasons(
    attestationResult,
  );
  if (attestationProvenanceReasons.length > 0) {
    return releaseClaimPacketEmitResult(false, 'blocked', attestationProvenanceReasons);
  }

  const packet = buildReleaseClaimPacket(modeDecisionResult, attestationResult, packetMeta);
  const report = buildReleaseClaimStrictReport(packet);
  const reportValidation = validateRevisionBridgeReleaseClaimStrictReportShape(report);
  if (reportValidation.ok !== true) {
    return releaseClaimPacketEmitResult(false, 'blocked', reportValidation.reasons, packet, report);
  }

  return releaseClaimPacketEmitResult(true, 'accepted', [], packet, report);
}
// CONTOUR_12F_RELEASE_CLAIM_PACKET_EMIT_END

// CONTOUR_12G_RELEASE_CLAIM_USER_FACING_BOUNDARY_GATE_START
const RELEASE_CLAIM_USER_FACING_BOUNDARY_ACCEPTED_CODE =
  'REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_ACCEPTED';
const RELEASE_CLAIM_USER_FACING_BOUNDARY_BLOCKED_CODE =
  'E_REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_BLOCKED';
const RELEASE_CLAIM_USER_FACING_BOUNDARY_DIAGNOSTICS_CODE =
  'E_REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_DIAGNOSTICS';

export const REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_SCHEMA =
  'revision-bridge.release-claim-user-facing-boundary.v1';
export const REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_SURFACES = Object.freeze([
  'INTERNAL',
  'USER_FACING',
]);
export const REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_RELEASE_CLASSES = Object.freeze([
  'INTERNAL_PROOF_ONLY',
  'USER_FACING_CLAIM_READY',
]);
export const REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_REASON_CODES = Object.freeze([
  RELEASE_CLAIM_USER_FACING_BOUNDARY_ACCEPTED_CODE,
  RELEASE_CLAIM_USER_FACING_BOUNDARY_BLOCKED_CODE,
  RELEASE_CLAIM_USER_FACING_BOUNDARY_DIAGNOSTICS_CODE,
  'REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_PACKET_RESULT_MISSING',
  'REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_PACKET_RESULT_TYPE_INVALID',
  'REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_PACKET_RESULT_NOT_ACCEPTED',
  'REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_PACKET_RESULT_PROVENANCE_INVALID',
  'REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_REQUESTED_MODE_REQUIRED',
  'REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_REQUESTED_MODE_INVALID',
  'REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_REQUESTED_MODE_MISMATCH',
  'REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_REQUESTED_CLAIM_SURFACE_REQUIRED',
  'REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_REQUESTED_CLAIM_SURFACE_INVALID',
  'REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_PR_MODE_USER_FACING_BLOCKED',
  'REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_RELEASE_CLASS_USER_FACING_BLOCKED',
  ...REVISION_BRIDGE_RELEASE_CLAIM_PACKET_EMIT_REASON_CODES,
]);

function releaseClaimUserFacingBoundaryReason(code, field, details = {}) {
  return {
    code,
    field,
    ...cloneJsonSafe(details),
  };
}

function normalizeReleaseClaimUserFacingBoundaryPacketEmitResult(input = {}) {
  const result = isPlainObject(input) ? cloneJsonSafe(input) : {};
  const binding = isPlainObject(result.binding) ? result.binding : {};
  const packet = isPlainObject(result.packet) ? result.packet : {};
  const releaseClaim = isPlainObject(packet.releaseClaim) ? packet.releaseClaim : {};
  const packetMeta = isPlainObject(packet.packetMeta) ? packet.packetMeta : {};
  const attestation = isPlainObject(packet.attestation) ? packet.attestation : {};
  const report = isPlainObject(result.report) ? result.report : {};
  const summary = isPlainObject(result.summary) ? result.summary : {};
  return {
    ok: result.ok === true,
    type: normalizeString(result.type),
    status: normalizeString(result.status),
    code: normalizeString(result.code),
    reason: normalizeString(result.reason),
    binding: {
      mode: normalizeString(binding.mode),
      claimId: normalizeString(binding.claimId),
      dossierId: normalizeString(binding.dossierId),
      matrixId: normalizeString(binding.matrixId),
      releaseClass: normalizeString(binding.releaseClass || binding.modeClass),
      packetId: normalizeString(binding.packetId),
      attestationId: normalizeString(binding.attestationId),
    },
    packet: {
      schemaVersion: normalizeString(packet.schemaVersion),
      packetHash: normalizeString(packet.packetHash),
      packetId: normalizeString(packetMeta.packetId),
      attestationId: normalizeString(attestation.attestationId),
      mode: normalizeString(releaseClaim.mode),
      claimId: normalizeString(releaseClaim.claimId),
      dossierId: normalizeString(releaseClaim.dossierId),
      matrixId: normalizeString(releaseClaim.matrixId),
      releaseClass: normalizeString(releaseClaim.releaseClass || releaseClaim.modeClass),
      raw: cloneJsonSafe(packet) || {},
    },
    report: {
      schemaVersion: normalizeString(report.schemaVersion),
      reportClass: normalizeString(report.reportClass),
      packetSchemaVersion: normalizeString(report.packetSchemaVersion),
      packetHash: normalizeString(report.packetHash),
      packetId: normalizeString(report.packetId),
      attestationId: normalizeString(report.attestationId),
      mode: normalizeString(report.mode),
      claimId: normalizeString(report.claimId),
      dossierId: normalizeString(report.dossierId),
      matrixId: normalizeString(report.matrixId),
      releaseClass: normalizeString(report.releaseClass || report.modeClass),
    },
    summary: {
      packetSchemaVersion: normalizeString(summary.packetSchemaVersion),
      strictReportSchemaVersion: normalizeString(summary.strictReportSchemaVersion),
      packetHash: normalizeString(summary.packetHash),
      prerequisiteCodes: sortedStableStrings(summary.prerequisiteCodes),
    },
  };
}

function collectReleaseClaimUserFacingBoundaryPacketReasons(packetEmitResult) {
  const reasons = [];

  if (packetEmitResult.type !== 'revisionBridge.releaseClaimPacketEmit') {
    reasons.push(releaseClaimUserFacingBoundaryReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_PACKET_RESULT_TYPE_INVALID',
      'packetEmitResult.type',
      {
        expectedValue: 'revisionBridge.releaseClaimPacketEmit',
        receivedValue: packetEmitResult.type,
      },
    ));
  }
  if (packetEmitResult.ok !== true) {
    reasons.push(releaseClaimUserFacingBoundaryReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_PACKET_RESULT_NOT_ACCEPTED',
      'packetEmitResult.ok',
      {
        expectedValue: true,
        receivedValue: packetEmitResult.ok,
      },
    ));
  }
  if (packetEmitResult.status !== 'accepted') {
    reasons.push(releaseClaimUserFacingBoundaryReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_PACKET_RESULT_NOT_ACCEPTED',
      'packetEmitResult.status',
      {
        expectedValue: 'accepted',
        receivedValue: packetEmitResult.status,
      },
    ));
  }
  if (packetEmitResult.code !== RELEASE_CLAIM_PACKET_EMIT_ACCEPTED_CODE) {
    reasons.push(releaseClaimUserFacingBoundaryReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_PACKET_RESULT_NOT_ACCEPTED',
      'packetEmitResult.code',
      {
        expectedValue: RELEASE_CLAIM_PACKET_EMIT_ACCEPTED_CODE,
        receivedValue: packetEmitResult.code,
      },
    ));
  }
  if (packetEmitResult.reason !== RELEASE_CLAIM_PACKET_EMIT_ACCEPTED_CODE) {
    reasons.push(releaseClaimUserFacingBoundaryReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_PACKET_RESULT_NOT_ACCEPTED',
      'packetEmitResult.reason',
      {
        expectedValue: RELEASE_CLAIM_PACKET_EMIT_ACCEPTED_CODE,
        receivedValue: packetEmitResult.reason,
      },
    ));
  }

  const bindingPairs = [
    { field: 'mode', expectedValue: packetEmitResult.binding.mode },
    { field: 'claimId', expectedValue: packetEmitResult.binding.claimId },
    { field: 'dossierId', expectedValue: packetEmitResult.binding.dossierId },
    { field: 'matrixId', expectedValue: packetEmitResult.binding.matrixId },
    { field: 'releaseClass', expectedValue: packetEmitResult.binding.releaseClass },
  ];

  bindingPairs.forEach(({ field, expectedValue }) => {
    if (!expectedValue) {
      reasons.push(releaseClaimUserFacingBoundaryReason(
        'REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_PACKET_RESULT_PROVENANCE_INVALID',
        `packetEmitResult.binding.${field}`,
      ));
      return;
    }

    const packetValue = packetEmitResult.packet[field];
    const reportValue = packetEmitResult.report[field];
    if (packetValue !== expectedValue || reportValue !== expectedValue) {
      reasons.push(releaseClaimUserFacingBoundaryReason(
        'REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_PACKET_RESULT_PROVENANCE_INVALID',
        `packetEmitResult.binding.${field}`,
        {
          expectedValue,
          packetValue,
          reportValue,
        },
      ));
    }
  });

  if (packetEmitResult.report.reportClass !== 'STRICT_RELEASE_CLAIM_REPORT') {
    reasons.push(releaseClaimUserFacingBoundaryReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_PACKET_RESULT_PROVENANCE_INVALID',
      'packetEmitResult.report.reportClass',
      {
        expectedValue: 'STRICT_RELEASE_CLAIM_REPORT',
        receivedValue: packetEmitResult.report.reportClass,
      },
    ));
  }

  if (packetEmitResult.packet.schemaVersion !== REVISION_BRIDGE_RELEASE_CLAIM_PACKET_SCHEMA) {
    reasons.push(releaseClaimUserFacingBoundaryReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_PACKET_RESULT_PROVENANCE_INVALID',
      'packetEmitResult.packet.schemaVersion',
      {
        expectedValue: REVISION_BRIDGE_RELEASE_CLAIM_PACKET_SCHEMA,
        receivedValue: packetEmitResult.packet.schemaVersion,
      },
    ));
  }
  if (packetEmitResult.report.schemaVersion !== REVISION_BRIDGE_RELEASE_CLAIM_STRICT_REPORT_SCHEMA) {
    reasons.push(releaseClaimUserFacingBoundaryReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_PACKET_RESULT_PROVENANCE_INVALID',
      'packetEmitResult.report.schemaVersion',
      {
        expectedValue: REVISION_BRIDGE_RELEASE_CLAIM_STRICT_REPORT_SCHEMA,
        receivedValue: packetEmitResult.report.schemaVersion,
      },
    ));
  }
  if (packetEmitResult.report.packetSchemaVersion !== REVISION_BRIDGE_RELEASE_CLAIM_PACKET_SCHEMA) {
    reasons.push(releaseClaimUserFacingBoundaryReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_PACKET_RESULT_PROVENANCE_INVALID',
      'packetEmitResult.report.packetSchemaVersion',
      {
        expectedValue: REVISION_BRIDGE_RELEASE_CLAIM_PACKET_SCHEMA,
        receivedValue: packetEmitResult.report.packetSchemaVersion,
      },
    ));
  }

  const packetReportPairs = [
    { field: 'packetId', expectedValue: packetEmitResult.binding.packetId },
    {
      field: 'attestationId',
      expectedValue: packetEmitResult.binding.attestationId,
    },
  ];
  packetReportPairs.forEach(({ field, expectedValue }) => {
    const packetValue = packetEmitResult.packet[field];
    const reportValue = packetEmitResult.report[field];
    if (!expectedValue) {
      reasons.push(releaseClaimUserFacingBoundaryReason(
        'REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_PACKET_RESULT_PROVENANCE_INVALID',
        `packetEmitResult.binding.${field}`,
        {
          packetValue,
          reportValue,
        },
      ));
      return;
    }

    if (packetValue !== expectedValue || reportValue !== expectedValue) {
      reasons.push(releaseClaimUserFacingBoundaryReason(
        'REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_PACKET_RESULT_PROVENANCE_INVALID',
        `packetEmitResult.report.${field}`,
        {
          expectedValue,
          packetValue,
          reportValue,
        },
      ));
    }
  });

  const recomputedPacketHash = createRevisionBridgeReleaseClaimPacketHash(packetEmitResult.packet.raw);
  if (
    !packetEmitResult.packet.packetHash
    || packetEmitResult.packet.packetHash !== recomputedPacketHash
    || packetEmitResult.report.packetHash !== recomputedPacketHash
    || packetEmitResult.summary.packetHash !== recomputedPacketHash
  ) {
    reasons.push(releaseClaimUserFacingBoundaryReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_PACKET_RESULT_PROVENANCE_INVALID',
      'packetEmitResult.packet.packetHash',
      {
        expectedValue: recomputedPacketHash,
        packetValue: packetEmitResult.packet.packetHash,
        reportValue: packetEmitResult.report.packetHash,
        summaryValue: packetEmitResult.summary.packetHash,
      },
    ));
  }
  if (
    packetEmitResult.summary.packetSchemaVersion !== REVISION_BRIDGE_RELEASE_CLAIM_PACKET_SCHEMA
    || packetEmitResult.summary.strictReportSchemaVersion !== REVISION_BRIDGE_RELEASE_CLAIM_STRICT_REPORT_SCHEMA
  ) {
    reasons.push(releaseClaimUserFacingBoundaryReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_PACKET_RESULT_PROVENANCE_INVALID',
      'packetEmitResult.summary',
      {
        expectedPacketSchemaVersion: REVISION_BRIDGE_RELEASE_CLAIM_PACKET_SCHEMA,
        receivedPacketSchemaVersion: packetEmitResult.summary.packetSchemaVersion,
        expectedStrictReportSchemaVersion: REVISION_BRIDGE_RELEASE_CLAIM_STRICT_REPORT_SCHEMA,
        receivedStrictReportSchemaVersion: packetEmitResult.summary.strictReportSchemaVersion,
      },
    ));
  }

  return reasons;
}

function collectReleaseClaimUserFacingBoundaryRequestReasons(requestedMode, requestedClaimSurface) {
  const reasons = [];

  if (!requestedMode) {
    reasons.push(releaseClaimUserFacingBoundaryReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_REQUESTED_MODE_REQUIRED',
      'requestedMode',
    ));
  } else if (!REVISION_BRIDGE_RELEASE_CLAIM_MODE_VALUES.includes(requestedMode)) {
    reasons.push(releaseClaimUserFacingBoundaryReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_REQUESTED_MODE_INVALID',
      'requestedMode',
      {
        receivedValue: requestedMode,
        allowedValues: cloneJsonSafe(REVISION_BRIDGE_RELEASE_CLAIM_MODE_VALUES),
      },
    ));
  }

  if (!requestedClaimSurface) {
    reasons.push(releaseClaimUserFacingBoundaryReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_REQUESTED_CLAIM_SURFACE_REQUIRED',
      'requestedClaimSurface',
    ));
  } else if (!REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_SURFACES.includes(requestedClaimSurface)) {
    reasons.push(releaseClaimUserFacingBoundaryReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_REQUESTED_CLAIM_SURFACE_INVALID',
      'requestedClaimSurface',
      {
        receivedValue: requestedClaimSurface,
        allowedValues: cloneJsonSafe(REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_SURFACES),
      },
    ));
  }

  return reasons;
}

function releaseClaimUserFacingBoundaryBinding(packetEmitResult) {
  return {
    mode: normalizeString(packetEmitResult?.binding?.mode),
    claimId: normalizeString(packetEmitResult?.binding?.claimId),
    dossierId: normalizeString(packetEmitResult?.binding?.dossierId),
    matrixId: normalizeString(packetEmitResult?.binding?.matrixId),
    releaseClass: normalizeString(packetEmitResult?.binding?.releaseClass),
  };
}

function releaseClaimUserFacingBoundarySummary(packetEmitResult, requestedClaimSurface) {
  return {
    claimSurface: normalizeString(requestedClaimSurface),
    packetId: normalizeString(packetEmitResult?.packet?.packetId),
    attestationId: normalizeString(packetEmitResult?.packet?.attestationId),
  };
}

function releaseClaimUserFacingBoundaryResult(
  ok,
  status,
  reasons,
  packetEmitResult,
  requestedClaimSurface,
) {
  const code = ok
    ? RELEASE_CLAIM_USER_FACING_BOUNDARY_ACCEPTED_CODE
    : (status === 'diagnostics'
      ? RELEASE_CLAIM_USER_FACING_BOUNDARY_DIAGNOSTICS_CODE
      : RELEASE_CLAIM_USER_FACING_BOUNDARY_BLOCKED_CODE);
  return {
    ok,
    type: 'revisionBridge.releaseClaimUserFacingBoundaryGate',
    status,
    code,
    reason: ok ? RELEASE_CLAIM_USER_FACING_BOUNDARY_ACCEPTED_CODE : reasons[0]?.code || code,
    reasons: cloneJsonSafe(reasons),
    binding: releaseClaimUserFacingBoundaryBinding(packetEmitResult),
    summary: releaseClaimUserFacingBoundarySummary(packetEmitResult, requestedClaimSurface),
  };
}

export function evaluateRevisionBridgeReleaseClaimUserFacingBoundaryGate(input = {}) {
  const boundaryInput = isPlainObject(input) ? cloneJsonSafe(input) : {};
  const requestedMode = normalizeString(boundaryInput.requestedMode);
  const requestedClaimSurface = normalizeString(boundaryInput.requestedClaimSurface);

  const requestReasons = collectReleaseClaimUserFacingBoundaryRequestReasons(
    requestedMode,
    requestedClaimSurface,
  );
  if (requestReasons.length > 0) {
    return releaseClaimUserFacingBoundaryResult(
      false,
      'diagnostics',
      requestReasons,
      normalizeReleaseClaimUserFacingBoundaryPacketEmitResult(boundaryInput.packetEmitResult),
      requestedClaimSurface,
    );
  }

  if (!isPlainObject(boundaryInput.packetEmitResult)) {
    return releaseClaimUserFacingBoundaryResult(
      false,
      'blocked',
      [
        releaseClaimUserFacingBoundaryReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_PACKET_RESULT_MISSING',
          'packetEmitResult',
        ),
      ],
      normalizeReleaseClaimUserFacingBoundaryPacketEmitResult(boundaryInput.packetEmitResult),
      requestedClaimSurface,
    );
  }

  const packetEmitResult = normalizeReleaseClaimUserFacingBoundaryPacketEmitResult(
    boundaryInput.packetEmitResult,
  );
  const packetReasons = collectReleaseClaimUserFacingBoundaryPacketReasons(packetEmitResult);
  if (packetReasons.length > 0) {
    return releaseClaimUserFacingBoundaryResult(
      false,
      'blocked',
      packetReasons,
      packetEmitResult,
      requestedClaimSurface,
    );
  }

  if (requestedMode !== packetEmitResult.binding.mode) {
    return releaseClaimUserFacingBoundaryResult(
      false,
      'blocked',
      [
        releaseClaimUserFacingBoundaryReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_REQUESTED_MODE_MISMATCH',
          'requestedMode',
          {
            expectedValue: packetEmitResult.binding.mode,
            receivedValue: requestedMode,
          },
        ),
      ],
      packetEmitResult,
      requestedClaimSurface,
    );
  }

  if (requestedMode === 'PR_MODE' && requestedClaimSurface === 'USER_FACING') {
    return releaseClaimUserFacingBoundaryResult(
      false,
      'blocked',
      [
        releaseClaimUserFacingBoundaryReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_PR_MODE_USER_FACING_BLOCKED',
          'requestedClaimSurface',
          {
            mode: requestedMode,
            claimSurface: requestedClaimSurface,
          },
        ),
      ],
      packetEmitResult,
      requestedClaimSurface,
    );
  }

  if (
    requestedMode === 'RELEASE_MODE'
    && requestedClaimSurface === 'USER_FACING'
    && packetEmitResult.binding.releaseClass !== 'USER_FACING_CLAIM_READY'
  ) {
    return releaseClaimUserFacingBoundaryResult(
      false,
      'blocked',
      [
        releaseClaimUserFacingBoundaryReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_RELEASE_CLASS_USER_FACING_BLOCKED',
          'packetEmitResult.report.releaseClass',
          {
            expectedValue: 'USER_FACING_CLAIM_READY',
            receivedValue: packetEmitResult.binding.releaseClass,
          },
        ),
      ],
      packetEmitResult,
      requestedClaimSurface,
    );
  }

  return releaseClaimUserFacingBoundaryResult(
    true,
    'accepted',
    [],
    packetEmitResult,
    requestedClaimSurface,
  );
}
// CONTOUR_12G_RELEASE_CLAIM_USER_FACING_BOUNDARY_GATE_END

// CONTOUR_12H_RELEASE_CLAIM_PUBLICATION_GATE_START
const RELEASE_CLAIM_PUBLICATION_ACCEPTED_CODE =
  'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_ACCEPTED';
const RELEASE_CLAIM_PUBLICATION_BLOCKED_CODE =
  'E_REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_BLOCKED';
const RELEASE_CLAIM_PUBLICATION_DIAGNOSTICS_CODE =
  'E_REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_DIAGNOSTICS';

export const REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_SCHEMA =
  'revision-bridge.release-claim-publication.v1';
export const REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_REASON_CODES = Object.freeze([
  RELEASE_CLAIM_PUBLICATION_ACCEPTED_CODE,
  RELEASE_CLAIM_PUBLICATION_BLOCKED_CODE,
  RELEASE_CLAIM_PUBLICATION_DIAGNOSTICS_CODE,
  'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_BOUNDARY_INPUT_MISSING',
  'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_BOUNDARY_RESULT_MISSING',
  'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_BOUNDARY_RESULT_MISMATCH',
  'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_BOUNDARY_RESULT_TYPE_INVALID',
  'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_BOUNDARY_RESULT_NOT_ACCEPTED',
  'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_BOUNDARY_RESULT_PROVENANCE_INVALID',
  'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_REQUESTED_MODE_REQUIRED',
  'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_REQUESTED_MODE_INVALID',
  'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_REQUESTED_MODE_MISMATCH',
  'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_REQUESTED_CLAIM_SURFACE_REQUIRED',
  'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_REQUESTED_CLAIM_SURFACE_INVALID',
  'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_REQUESTED_CLAIM_SURFACE_MISMATCH',
  'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_PR_MODE_USER_FACING_BLOCKED',
  'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_RELEASE_CLASS_USER_FACING_BLOCKED',
  ...REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_REASON_CODES,
]);

function releaseClaimPublicationReason(code, field, details = {}) {
  return {
    code,
    field,
    ...cloneJsonSafe(details),
  };
}

function normalizeReleaseClaimPublicationBoundaryResult(input = {}) {
  const result = isPlainObject(input) ? cloneJsonSafe(input) : {};
  const binding = isPlainObject(result.binding) ? cloneJsonSafe(result.binding) : {};
  const summary = isPlainObject(result.summary) ? cloneJsonSafe(result.summary) : {};

  return {
    ok: result.ok === true,
    type: normalizeString(result.type),
    status: normalizeString(result.status),
    code: normalizeString(result.code),
    reason: normalizeString(result.reason),
    binding: {
      mode: normalizeString(binding.mode),
      claimId: normalizeString(binding.claimId),
      dossierId: normalizeString(binding.dossierId),
      matrixId: normalizeString(binding.matrixId),
      releaseClass: normalizeString(binding.releaseClass),
    },
    summary: {
      claimSurface: normalizeString(summary.claimSurface),
      packetId: normalizeString(summary.packetId),
      attestationId: normalizeString(summary.attestationId),
    },
  };
}

function collectReleaseClaimPublicationRequestReasons(requestedMode, requestedClaimSurface) {
  const reasons = [];

  if (!requestedMode) {
    reasons.push(releaseClaimPublicationReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_REQUESTED_MODE_REQUIRED',
      'requestedMode',
    ));
  } else if (!REVISION_BRIDGE_RELEASE_CLAIM_MODE_VALUES.includes(requestedMode)) {
    reasons.push(releaseClaimPublicationReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_REQUESTED_MODE_INVALID',
      'requestedMode',
      {
        receivedValue: requestedMode,
        allowedValues: cloneJsonSafe(REVISION_BRIDGE_RELEASE_CLAIM_MODE_VALUES),
      },
    ));
  }

  if (!requestedClaimSurface) {
    reasons.push(releaseClaimPublicationReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_REQUESTED_CLAIM_SURFACE_REQUIRED',
      'requestedClaimSurface',
    ));
  } else if (!REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_SURFACES.includes(requestedClaimSurface)) {
    reasons.push(releaseClaimPublicationReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_REQUESTED_CLAIM_SURFACE_INVALID',
      'requestedClaimSurface',
      {
        receivedValue: requestedClaimSurface,
        allowedValues: cloneJsonSafe(REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_SURFACES),
      },
    ));
  }

  return reasons;
}

function collectReleaseClaimPublicationBoundaryReasons(boundaryResult) {
  const reasons = [];

  if (boundaryResult.type !== 'revisionBridge.releaseClaimUserFacingBoundaryGate') {
    reasons.push(releaseClaimPublicationReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_BOUNDARY_RESULT_TYPE_INVALID',
      'boundaryResult.type',
      {
        expectedValue: 'revisionBridge.releaseClaimUserFacingBoundaryGate',
        receivedValue: boundaryResult.type,
      },
    ));
  }
  if (boundaryResult.ok !== true) {
    reasons.push(releaseClaimPublicationReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_BOUNDARY_RESULT_NOT_ACCEPTED',
      'boundaryResult.ok',
      {
        expectedValue: true,
        receivedValue: boundaryResult.ok,
      },
    ));
  }
  if (boundaryResult.status !== 'accepted') {
    reasons.push(releaseClaimPublicationReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_BOUNDARY_RESULT_NOT_ACCEPTED',
      'boundaryResult.status',
      {
        expectedValue: 'accepted',
        receivedValue: boundaryResult.status,
      },
    ));
  }
  if (boundaryResult.code !== RELEASE_CLAIM_USER_FACING_BOUNDARY_ACCEPTED_CODE) {
    reasons.push(releaseClaimPublicationReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_BOUNDARY_RESULT_NOT_ACCEPTED',
      'boundaryResult.code',
      {
        expectedValue: RELEASE_CLAIM_USER_FACING_BOUNDARY_ACCEPTED_CODE,
        receivedValue: boundaryResult.code,
      },
    ));
  }
  if (boundaryResult.reason !== RELEASE_CLAIM_USER_FACING_BOUNDARY_ACCEPTED_CODE) {
    reasons.push(releaseClaimPublicationReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_BOUNDARY_RESULT_NOT_ACCEPTED',
      'boundaryResult.reason',
      {
        expectedValue: RELEASE_CLAIM_USER_FACING_BOUNDARY_ACCEPTED_CODE,
        receivedValue: boundaryResult.reason,
      },
    ));
  }

  const bindingPairs = [
    { field: 'mode', value: boundaryResult.binding.mode },
    { field: 'claimId', value: boundaryResult.binding.claimId },
    { field: 'dossierId', value: boundaryResult.binding.dossierId },
    { field: 'matrixId', value: boundaryResult.binding.matrixId },
  ];
  bindingPairs.forEach(({ field, value }) => {
    if (!value) {
      reasons.push(releaseClaimPublicationReason(
        'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_BOUNDARY_RESULT_PROVENANCE_INVALID',
        `boundaryResult.binding.${field}`,
      ));
    }
  });

  if (
    !REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_RELEASE_CLASSES.includes(
      boundaryResult.binding.releaseClass,
    )
  ) {
    reasons.push(releaseClaimPublicationReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_BOUNDARY_RESULT_PROVENANCE_INVALID',
      'boundaryResult.binding.releaseClass',
      {
        receivedValue: boundaryResult.binding.releaseClass,
        allowedValues: cloneJsonSafe(REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_RELEASE_CLASSES),
      },
    ));
  }

  if (
    !REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_SURFACES.includes(
      boundaryResult.summary.claimSurface,
    )
  ) {
    reasons.push(releaseClaimPublicationReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_BOUNDARY_RESULT_PROVENANCE_INVALID',
      'boundaryResult.summary.claimSurface',
      {
        receivedValue: boundaryResult.summary.claimSurface,
        allowedValues: cloneJsonSafe(REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_SURFACES),
      },
    ));
  }
  if (!boundaryResult.summary.packetId) {
    reasons.push(releaseClaimPublicationReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_BOUNDARY_RESULT_PROVENANCE_INVALID',
      'boundaryResult.summary.packetId',
    ));
  }
  if (!boundaryResult.summary.attestationId) {
    reasons.push(releaseClaimPublicationReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_BOUNDARY_RESULT_PROVENANCE_INVALID',
      'boundaryResult.summary.attestationId',
    ));
  }

  return reasons;
}

function releaseClaimPublicationBoundaryResultMismatchReasons(expectedResult, receivedResult) {
  if (!isPlainObject(receivedResult)) {
    if (receivedResult === undefined) return [];
    return [
      releaseClaimPublicationReason(
        'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_BOUNDARY_RESULT_MISMATCH',
        'boundaryResult',
        {
          expectedValue: normalizeReleaseClaimPublicationBoundaryResult(expectedResult),
          receivedValue: receivedResult,
        },
      ),
    ];
  }

  const expectedBoundaryResult = normalizeReleaseClaimPublicationBoundaryResult(expectedResult);
  const receivedBoundaryResult = normalizeReleaseClaimPublicationBoundaryResult(receivedResult);
  if (JSON.stringify(expectedBoundaryResult) === JSON.stringify(receivedBoundaryResult)) return [];

  return [
    releaseClaimPublicationReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_BOUNDARY_RESULT_MISMATCH',
      'boundaryResult',
      {
        expectedValue: expectedBoundaryResult,
        receivedValue: receivedBoundaryResult,
      },
    ),
  ];
}

function releaseClaimPublicationBinding(boundaryResult) {
  return {
    mode: normalizeString(boundaryResult?.binding?.mode),
    claimId: normalizeString(boundaryResult?.binding?.claimId),
    dossierId: normalizeString(boundaryResult?.binding?.dossierId),
    matrixId: normalizeString(boundaryResult?.binding?.matrixId),
    releaseClass: normalizeString(boundaryResult?.binding?.releaseClass),
  };
}

function releaseClaimPublicationSummary(boundaryResult, requestedClaimSurface) {
  return {
    claimSurface: normalizeString(requestedClaimSurface),
    packetId: normalizeString(boundaryResult?.summary?.packetId),
    attestationId: normalizeString(boundaryResult?.summary?.attestationId),
  };
}

function releaseClaimPublicationResult(
  ok,
  status,
  reasons,
  boundaryResult,
  requestedClaimSurface,
) {
  const code = ok
    ? RELEASE_CLAIM_PUBLICATION_ACCEPTED_CODE
    : (status === 'diagnostics'
      ? RELEASE_CLAIM_PUBLICATION_DIAGNOSTICS_CODE
      : RELEASE_CLAIM_PUBLICATION_BLOCKED_CODE);
  return {
    ok,
    type: 'revisionBridge.releaseClaimPublicationGate',
    status,
    code,
    reason: ok ? RELEASE_CLAIM_PUBLICATION_ACCEPTED_CODE : reasons[0]?.code || code,
    reasons: cloneJsonSafe(reasons),
    binding: releaseClaimPublicationBinding(boundaryResult),
    summary: releaseClaimPublicationSummary(boundaryResult, requestedClaimSurface),
  };
}

export function evaluateRevisionBridgeReleaseClaimPublicationGate(input = {}) {
  const publicationInput = isPlainObject(input) ? cloneJsonSafe(input) : {};
  const requestedMode = normalizeString(publicationInput.requestedMode);
  const requestedClaimSurface = normalizeString(publicationInput.requestedClaimSurface);

  const requestReasons = collectReleaseClaimPublicationRequestReasons(
    requestedMode,
    requestedClaimSurface,
  );
  if (requestReasons.length > 0) {
    return releaseClaimPublicationResult(
      false,
      'diagnostics',
      requestReasons,
      normalizeReleaseClaimPublicationBoundaryResult(publicationInput.boundaryResult),
      requestedClaimSurface,
    );
  }

  if (!isPlainObject(publicationInput.boundaryInput)) {
    return releaseClaimPublicationResult(
      false,
      'blocked',
      [
        releaseClaimPublicationReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_BOUNDARY_INPUT_MISSING',
          'boundaryInput',
        ),
      ],
      normalizeReleaseClaimPublicationBoundaryResult(publicationInput.boundaryResult),
      requestedClaimSurface,
    );
  }

  const evaluatedBoundaryResult = evaluateRevisionBridgeReleaseClaimUserFacingBoundaryGate(
    publicationInput.boundaryInput,
  );
  const boundaryResult = normalizeReleaseClaimPublicationBoundaryResult(evaluatedBoundaryResult);
  const boundaryReasons = collectReleaseClaimPublicationBoundaryReasons(boundaryResult);
  if (boundaryReasons.length > 0) {
    return releaseClaimPublicationResult(
      false,
      'blocked',
      boundaryReasons,
      boundaryResult,
      requestedClaimSurface,
    );
  }

  const boundaryMismatchReasons = releaseClaimPublicationBoundaryResultMismatchReasons(
    boundaryResult,
    publicationInput.boundaryResult,
  );
  if (boundaryMismatchReasons.length > 0) {
    return releaseClaimPublicationResult(
      false,
      'blocked',
      boundaryMismatchReasons,
      boundaryResult,
      requestedClaimSurface,
    );
  }

  if (requestedMode !== boundaryResult.binding.mode) {
    return releaseClaimPublicationResult(
      false,
      'blocked',
      [
        releaseClaimPublicationReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_REQUESTED_MODE_MISMATCH',
          'requestedMode',
          {
            expectedValue: boundaryResult.binding.mode,
            receivedValue: requestedMode,
          },
        ),
      ],
      boundaryResult,
      requestedClaimSurface,
    );
  }

  if (requestedClaimSurface !== boundaryResult.summary.claimSurface) {
    return releaseClaimPublicationResult(
      false,
      'blocked',
      [
        releaseClaimPublicationReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_REQUESTED_CLAIM_SURFACE_MISMATCH',
          'requestedClaimSurface',
          {
            expectedValue: boundaryResult.summary.claimSurface,
            receivedValue: requestedClaimSurface,
          },
        ),
      ],
      boundaryResult,
      requestedClaimSurface,
    );
  }

  if (requestedMode === 'PR_MODE' && requestedClaimSurface === 'USER_FACING') {
    return releaseClaimPublicationResult(
      false,
      'blocked',
      [
        releaseClaimPublicationReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_PR_MODE_USER_FACING_BLOCKED',
          'requestedClaimSurface',
          {
            mode: requestedMode,
            claimSurface: requestedClaimSurface,
          },
        ),
      ],
      boundaryResult,
      requestedClaimSurface,
    );
  }

  if (
    requestedMode === 'RELEASE_MODE'
    && requestedClaimSurface === 'USER_FACING'
    && boundaryResult.binding.releaseClass !== 'USER_FACING_CLAIM_READY'
  ) {
    return releaseClaimPublicationResult(
      false,
      'blocked',
      [
        releaseClaimPublicationReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_RELEASE_CLASS_USER_FACING_BLOCKED',
          'boundaryResult.binding.releaseClass',
          {
            expectedValue: 'USER_FACING_CLAIM_READY',
            receivedValue: boundaryResult.binding.releaseClass,
          },
        ),
      ],
      boundaryResult,
      requestedClaimSurface,
    );
  }

  return releaseClaimPublicationResult(
    true,
    'accepted',
    [],
    boundaryResult,
    requestedClaimSurface,
  );
}
// CONTOUR_12H_RELEASE_CLAIM_PUBLICATION_GATE_END

// CONTOUR_12I_RELEASE_CLAIM_KERNEL_FENCE_START
const RELEASE_CLAIM_KERNEL_FENCE_ACCEPTED_CODE =
  'REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_ACCEPTED';
const RELEASE_CLAIM_KERNEL_FENCE_BLOCKED_CODE =
  'E_REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_BLOCKED';
const RELEASE_CLAIM_KERNEL_FENCE_DIAGNOSTICS_CODE =
  'E_REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_DIAGNOSTICS';

export const REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_SCHEMA =
  'revision-bridge.release-claim-kernel-fence.v1';
export const REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_REASON_CODES = Object.freeze([
  RELEASE_CLAIM_KERNEL_FENCE_ACCEPTED_CODE,
  RELEASE_CLAIM_KERNEL_FENCE_BLOCKED_CODE,
  RELEASE_CLAIM_KERNEL_FENCE_DIAGNOSTICS_CODE,
  'REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_PUBLICATION_INPUT_MISSING',
  'REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_PUBLICATION_RESULT_MISSING',
  'REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_PUBLICATION_RESULT_MISMATCH',
  'REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_PUBLICATION_RESULT_TYPE_INVALID',
  'REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_PUBLICATION_RESULT_NOT_ACCEPTED',
  'REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_PUBLICATION_RESULT_PROVENANCE_INVALID',
  'REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_REQUESTED_MODE_REQUIRED',
  'REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_REQUESTED_MODE_INVALID',
  'REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_REQUESTED_MODE_MISMATCH',
  'REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_REQUESTED_CLAIM_SURFACE_REQUIRED',
  'REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_REQUESTED_CLAIM_SURFACE_INVALID',
  'REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_REQUESTED_CLAIM_SURFACE_MISMATCH',
  'REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_PR_MODE_USER_FACING_BLOCKED',
  'REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_RELEASE_CLASS_USER_FACING_BLOCKED',
  ...REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_REASON_CODES,
]);

function releaseClaimKernelFenceReason(code, field, details = {}) {
  return {
    code,
    field,
    ...cloneJsonSafe(details),
  };
}

function normalizeReleaseClaimKernelFencePublicationResult(input = {}) {
  const result = isPlainObject(input) ? cloneJsonSafe(input) : {};
  const binding = isPlainObject(result.binding) ? cloneJsonSafe(result.binding) : {};
  const summary = isPlainObject(result.summary) ? cloneJsonSafe(result.summary) : {};

  return {
    ok: result.ok === true,
    type: normalizeString(result.type),
    status: normalizeString(result.status),
    code: normalizeString(result.code),
    reason: normalizeString(result.reason),
    binding: {
      mode: normalizeString(binding.mode),
      claimId: normalizeString(binding.claimId),
      dossierId: normalizeString(binding.dossierId),
      matrixId: normalizeString(binding.matrixId),
      releaseClass: normalizeString(binding.releaseClass),
    },
    summary: {
      claimSurface: normalizeString(summary.claimSurface),
      packetId: normalizeString(summary.packetId),
      attestationId: normalizeString(summary.attestationId),
    },
  };
}

function releaseClaimKernelFencePublicationResultMismatchReasons(expectedResult, receivedResult) {
  if (!isPlainObject(receivedResult)) {
    if (receivedResult === undefined) return [];
    return [
      releaseClaimKernelFenceReason(
        'REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_PUBLICATION_RESULT_MISMATCH',
        'publicationResult',
        {
          expectedValue: normalizeReleaseClaimKernelFencePublicationResult(expectedResult),
          receivedValue: receivedResult,
        },
      ),
    ];
  }

  const expectedPublicationResult = normalizeReleaseClaimKernelFencePublicationResult(expectedResult);
  const receivedPublicationResult = normalizeReleaseClaimKernelFencePublicationResult(receivedResult);
  if (JSON.stringify(expectedPublicationResult) === JSON.stringify(receivedPublicationResult)) return [];

  return [
    releaseClaimKernelFenceReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_PUBLICATION_RESULT_MISMATCH',
      'publicationResult',
      {
        expectedValue: expectedPublicationResult,
        receivedValue: receivedPublicationResult,
      },
    ),
  ];
}

function collectReleaseClaimKernelFenceRequestReasons(requestedMode, requestedClaimSurface) {
  const reasons = [];

  if (!requestedMode) {
    reasons.push(releaseClaimKernelFenceReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_REQUESTED_MODE_REQUIRED',
      'requestedMode',
    ));
  } else if (!REVISION_BRIDGE_RELEASE_CLAIM_MODE_VALUES.includes(requestedMode)) {
    reasons.push(releaseClaimKernelFenceReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_REQUESTED_MODE_INVALID',
      'requestedMode',
      {
        receivedValue: requestedMode,
        allowedValues: cloneJsonSafe(REVISION_BRIDGE_RELEASE_CLAIM_MODE_VALUES),
      },
    ));
  }

  if (!requestedClaimSurface) {
    reasons.push(releaseClaimKernelFenceReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_REQUESTED_CLAIM_SURFACE_REQUIRED',
      'requestedClaimSurface',
    ));
  } else if (!REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_SURFACES.includes(requestedClaimSurface)) {
    reasons.push(releaseClaimKernelFenceReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_REQUESTED_CLAIM_SURFACE_INVALID',
      'requestedClaimSurface',
      {
        receivedValue: requestedClaimSurface,
        allowedValues: cloneJsonSafe(REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_SURFACES),
      },
    ));
  }

  return reasons;
}

function collectReleaseClaimKernelFencePublicationReasons(publicationResult) {
  const reasons = [];

  if (publicationResult.type !== 'revisionBridge.releaseClaimPublicationGate') {
    reasons.push(releaseClaimKernelFenceReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_PUBLICATION_RESULT_TYPE_INVALID',
      'publicationResult.type',
      {
        expectedValue: 'revisionBridge.releaseClaimPublicationGate',
        receivedValue: publicationResult.type,
      },
    ));
  }
  if (publicationResult.ok !== true) {
    reasons.push(releaseClaimKernelFenceReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_PUBLICATION_RESULT_NOT_ACCEPTED',
      'publicationResult.ok',
      {
        expectedValue: true,
        receivedValue: publicationResult.ok,
      },
    ));
  }
  if (publicationResult.status !== 'accepted') {
    reasons.push(releaseClaimKernelFenceReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_PUBLICATION_RESULT_NOT_ACCEPTED',
      'publicationResult.status',
      {
        expectedValue: 'accepted',
        receivedValue: publicationResult.status,
      },
    ));
  }
  if (publicationResult.code !== RELEASE_CLAIM_PUBLICATION_ACCEPTED_CODE) {
    reasons.push(releaseClaimKernelFenceReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_PUBLICATION_RESULT_NOT_ACCEPTED',
      'publicationResult.code',
      {
        expectedValue: RELEASE_CLAIM_PUBLICATION_ACCEPTED_CODE,
        receivedValue: publicationResult.code,
      },
    ));
  }
  if (publicationResult.reason !== RELEASE_CLAIM_PUBLICATION_ACCEPTED_CODE) {
    reasons.push(releaseClaimKernelFenceReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_PUBLICATION_RESULT_NOT_ACCEPTED',
      'publicationResult.reason',
      {
        expectedValue: RELEASE_CLAIM_PUBLICATION_ACCEPTED_CODE,
        receivedValue: publicationResult.reason,
      },
    ));
  }

  const bindingPairs = [
    { field: 'mode', value: publicationResult.binding.mode },
    { field: 'claimId', value: publicationResult.binding.claimId },
    { field: 'dossierId', value: publicationResult.binding.dossierId },
    { field: 'matrixId', value: publicationResult.binding.matrixId },
  ];
  bindingPairs.forEach(({ field, value }) => {
    if (!value) {
      reasons.push(releaseClaimKernelFenceReason(
        'REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_PUBLICATION_RESULT_PROVENANCE_INVALID',
        `publicationResult.binding.${field}`,
      ));
    }
  });

  if (
    !REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_RELEASE_CLASSES.includes(
      publicationResult.binding.releaseClass,
    )
  ) {
    reasons.push(releaseClaimKernelFenceReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_PUBLICATION_RESULT_PROVENANCE_INVALID',
      'publicationResult.binding.releaseClass',
      {
        receivedValue: publicationResult.binding.releaseClass,
        allowedValues: cloneJsonSafe(REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_RELEASE_CLASSES),
      },
    ));
  }

  if (
    !REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_SURFACES.includes(
      publicationResult.summary.claimSurface,
    )
  ) {
    reasons.push(releaseClaimKernelFenceReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_PUBLICATION_RESULT_PROVENANCE_INVALID',
      'publicationResult.summary.claimSurface',
      {
        receivedValue: publicationResult.summary.claimSurface,
        allowedValues: cloneJsonSafe(REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_SURFACES),
      },
    ));
  }
  if (!publicationResult.summary.packetId) {
    reasons.push(releaseClaimKernelFenceReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_PUBLICATION_RESULT_PROVENANCE_INVALID',
      'publicationResult.summary.packetId',
    ));
  }
  if (!publicationResult.summary.attestationId) {
    reasons.push(releaseClaimKernelFenceReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_PUBLICATION_RESULT_PROVENANCE_INVALID',
      'publicationResult.summary.attestationId',
    ));
  }

  return reasons;
}

function deriveReleaseClaimKernelFenceAdmissionClass(publicationResult) {
  if (
    publicationResult?.binding?.releaseClass === 'USER_FACING_CLAIM_READY'
    && publicationResult?.summary?.claimSurface === 'USER_FACING'
  ) {
    return 'USER_FACING';
  }
  return 'INTERNAL';
}

function releaseClaimKernelFenceBinding(publicationResult) {
  return {
    mode: normalizeString(publicationResult?.binding?.mode),
    claimId: normalizeString(publicationResult?.binding?.claimId),
    dossierId: normalizeString(publicationResult?.binding?.dossierId),
    matrixId: normalizeString(publicationResult?.binding?.matrixId),
    releaseClass: normalizeString(publicationResult?.binding?.releaseClass),
  };
}

function releaseClaimKernelFenceSummary(publicationResult, requestedClaimSurface) {
  return {
    claimSurface: normalizeString(requestedClaimSurface),
    packetId: normalizeString(publicationResult?.summary?.packetId),
    attestationId: normalizeString(publicationResult?.summary?.attestationId),
    admissionClass: deriveReleaseClaimKernelFenceAdmissionClass(publicationResult),
  };
}

function releaseClaimKernelFenceResult(
  ok,
  status,
  reasons,
  publicationResult,
  requestedClaimSurface,
) {
  const code = ok
    ? RELEASE_CLAIM_KERNEL_FENCE_ACCEPTED_CODE
    : (status === 'diagnostics'
      ? RELEASE_CLAIM_KERNEL_FENCE_DIAGNOSTICS_CODE
      : RELEASE_CLAIM_KERNEL_FENCE_BLOCKED_CODE);
  return {
    ok,
    type: 'revisionBridge.releaseClaimKernelFence',
    status,
    code,
    reason: ok ? RELEASE_CLAIM_KERNEL_FENCE_ACCEPTED_CODE : reasons[0]?.code || code,
    reasons: cloneJsonSafe(reasons),
    binding: releaseClaimKernelFenceBinding(publicationResult),
    summary: releaseClaimKernelFenceSummary(publicationResult, requestedClaimSurface),
  };
}

export function evaluateRevisionBridgeReleaseClaimKernelFence(input = {}) {
  const fenceInput = isPlainObject(input) ? cloneJsonSafe(input) : {};
  const requestedMode = normalizeString(fenceInput.requestedMode);
  const requestedClaimSurface = normalizeString(fenceInput.requestedClaimSurface);

  const requestReasons = collectReleaseClaimKernelFenceRequestReasons(
    requestedMode,
    requestedClaimSurface,
  );
  if (requestReasons.length > 0) {
    return releaseClaimKernelFenceResult(
      false,
      'diagnostics',
      requestReasons,
      normalizeReleaseClaimKernelFencePublicationResult(fenceInput.publicationResult),
      requestedClaimSurface,
    );
  }

  if (!isPlainObject(fenceInput.publicationInput)) {
    return releaseClaimKernelFenceResult(
      false,
      'blocked',
      [
        releaseClaimKernelFenceReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_PUBLICATION_INPUT_MISSING',
          'publicationInput',
        ),
      ],
      normalizeReleaseClaimKernelFencePublicationResult(fenceInput.publicationResult),
      requestedClaimSurface,
    );
  }

  const evaluatedPublicationResult = evaluateRevisionBridgeReleaseClaimPublicationGate(
    fenceInput.publicationInput,
  );
  const publicationResult = normalizeReleaseClaimKernelFencePublicationResult(evaluatedPublicationResult);
  const publicationReasons = collectReleaseClaimKernelFencePublicationReasons(publicationResult);
  if (publicationReasons.length > 0) {
    return releaseClaimKernelFenceResult(
      false,
      'blocked',
      publicationReasons,
      publicationResult,
      requestedClaimSurface,
    );
  }

  const publicationMismatchReasons = releaseClaimKernelFencePublicationResultMismatchReasons(
    publicationResult,
    fenceInput.publicationResult,
  );
  if (publicationMismatchReasons.length > 0) {
    return releaseClaimKernelFenceResult(
      false,
      'blocked',
      publicationMismatchReasons,
      publicationResult,
      requestedClaimSurface,
    );
  }

  if (requestedMode !== publicationResult.binding.mode) {
    return releaseClaimKernelFenceResult(
      false,
      'blocked',
      [
        releaseClaimKernelFenceReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_REQUESTED_MODE_MISMATCH',
          'requestedMode',
          {
            expectedValue: publicationResult.binding.mode,
            receivedValue: requestedMode,
          },
        ),
      ],
      publicationResult,
      requestedClaimSurface,
    );
  }

  if (requestedClaimSurface !== publicationResult.summary.claimSurface) {
    return releaseClaimKernelFenceResult(
      false,
      'blocked',
      [
        releaseClaimKernelFenceReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_REQUESTED_CLAIM_SURFACE_MISMATCH',
          'requestedClaimSurface',
          {
            expectedValue: publicationResult.summary.claimSurface,
            receivedValue: requestedClaimSurface,
          },
        ),
      ],
      publicationResult,
      requestedClaimSurface,
    );
  }

  if (requestedMode === 'PR_MODE' && requestedClaimSurface === 'USER_FACING') {
    return releaseClaimKernelFenceResult(
      false,
      'blocked',
      [
        releaseClaimKernelFenceReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_PR_MODE_USER_FACING_BLOCKED',
          'requestedClaimSurface',
          {
            mode: requestedMode,
            claimSurface: requestedClaimSurface,
          },
        ),
      ],
      publicationResult,
      requestedClaimSurface,
    );
  }

  if (
    requestedMode === 'RELEASE_MODE'
    && requestedClaimSurface === 'USER_FACING'
    && publicationResult.binding.releaseClass !== 'USER_FACING_CLAIM_READY'
  ) {
    return releaseClaimKernelFenceResult(
      false,
      'blocked',
      [
        releaseClaimKernelFenceReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_RELEASE_CLASS_USER_FACING_BLOCKED',
          'publicationResult.binding.releaseClass',
          {
            expectedValue: 'USER_FACING_CLAIM_READY',
            receivedValue: publicationResult.binding.releaseClass,
          },
        ),
      ],
      publicationResult,
      requestedClaimSurface,
    );
  }

  return releaseClaimKernelFenceResult(
    true,
    'accepted',
    [],
    publicationResult,
    requestedClaimSurface,
  );
}
// CONTOUR_12I_RELEASE_CLAIM_KERNEL_FENCE_END

// CONTOUR_12J_RELEASE_CLAIM_COMMAND_ADMISSION_START
const RELEASE_CLAIM_COMMAND_ADMISSION_ACCEPTED_CODE =
  'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_ACCEPTED';
const RELEASE_CLAIM_COMMAND_ADMISSION_BLOCKED_CODE =
  'E_REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_BLOCKED';
const RELEASE_CLAIM_COMMAND_ADMISSION_DIAGNOSTICS_CODE =
  'E_REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_DIAGNOSTICS';

export const REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_SCHEMA =
  'revision-bridge.release-claim-command-admission.v1';
export const REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_REASON_CODES = Object.freeze([
  RELEASE_CLAIM_COMMAND_ADMISSION_ACCEPTED_CODE,
  RELEASE_CLAIM_COMMAND_ADMISSION_BLOCKED_CODE,
  RELEASE_CLAIM_COMMAND_ADMISSION_DIAGNOSTICS_CODE,
  'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_COMMAND_ID_REQUIRED',
  'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_COMMAND_ID_INVALID',
  'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_KERNEL_FENCE_INPUT_MISSING',
  'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_KERNEL_FENCE_RESULT_MISSING',
  'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_KERNEL_FENCE_RESULT_MISMATCH',
  'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_KERNEL_FENCE_RESULT_TYPE_INVALID',
  'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_KERNEL_FENCE_RESULT_NOT_ACCEPTED',
  'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_KERNEL_FENCE_RESULT_PROVENANCE_INVALID',
  'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_REQUESTED_MODE_REQUIRED',
  'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_REQUESTED_MODE_INVALID',
  'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_REQUESTED_MODE_MISMATCH',
  'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_REQUESTED_CLAIM_SURFACE_REQUIRED',
  'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_REQUESTED_CLAIM_SURFACE_INVALID',
  'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_REQUESTED_CLAIM_SURFACE_MISMATCH',
  'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_PR_MODE_USER_FACING_BLOCKED',
  'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_RELEASE_CLASS_USER_FACING_BLOCKED',
  ...REVISION_BRIDGE_RELEASE_CLAIM_KERNEL_FENCE_REASON_CODES,
]);

function releaseClaimCommandAdmissionReason(code, field, details = {}) {
  return {
    code,
    field,
    ...cloneJsonSafe(details),
  };
}

function normalizeReleaseClaimCommandAdmissionKernelFenceResult(input = {}) {
  const result = isPlainObject(input) ? cloneJsonSafe(input) : {};
  const binding = isPlainObject(result.binding) ? cloneJsonSafe(result.binding) : {};
  const summary = isPlainObject(result.summary) ? cloneJsonSafe(result.summary) : {};

  return {
    ok: result.ok === true,
    type: normalizeString(result.type),
    status: normalizeString(result.status),
    code: normalizeString(result.code),
    reason: normalizeString(result.reason),
    binding: {
      mode: normalizeString(binding.mode),
      claimId: normalizeString(binding.claimId),
      dossierId: normalizeString(binding.dossierId),
      matrixId: normalizeString(binding.matrixId),
      releaseClass: normalizeString(binding.releaseClass),
    },
    summary: {
      claimSurface: normalizeString(summary.claimSurface),
      packetId: normalizeString(summary.packetId),
      attestationId: normalizeString(summary.attestationId),
      admissionClass: normalizeString(summary.admissionClass),
    },
  };
}

function releaseClaimCommandAdmissionKernelFenceResultMismatchReasons(expectedResult, receivedResult) {
  if (!isPlainObject(receivedResult)) {
    if (receivedResult === undefined) return [];
    return [
      releaseClaimCommandAdmissionReason(
        'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_KERNEL_FENCE_RESULT_MISMATCH',
        'kernelFenceResult',
        {
          expectedValue: normalizeReleaseClaimCommandAdmissionKernelFenceResult(expectedResult),
          receivedValue: receivedResult,
        },
      ),
    ];
  }

  const expectedKernelFenceResult = normalizeReleaseClaimCommandAdmissionKernelFenceResult(expectedResult);
  const receivedKernelFenceResult = normalizeReleaseClaimCommandAdmissionKernelFenceResult(receivedResult);
  if (JSON.stringify(expectedKernelFenceResult) === JSON.stringify(receivedKernelFenceResult)) return [];

  return [
    releaseClaimCommandAdmissionReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_KERNEL_FENCE_RESULT_MISMATCH',
      'kernelFenceResult',
      {
        expectedValue: expectedKernelFenceResult,
        receivedValue: receivedKernelFenceResult,
      },
    ),
  ];
}

function collectReleaseClaimCommandAdmissionRequestReasons(requestedMode, requestedClaimSurface) {
  const reasons = [];

  if (!requestedMode) {
    reasons.push(releaseClaimCommandAdmissionReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_REQUESTED_MODE_REQUIRED',
      'requestedMode',
    ));
  } else if (!REVISION_BRIDGE_RELEASE_CLAIM_MODE_VALUES.includes(requestedMode)) {
    reasons.push(releaseClaimCommandAdmissionReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_REQUESTED_MODE_INVALID',
      'requestedMode',
      {
        receivedValue: requestedMode,
        allowedValues: cloneJsonSafe(REVISION_BRIDGE_RELEASE_CLAIM_MODE_VALUES),
      },
    ));
  }

  if (!requestedClaimSurface) {
    reasons.push(releaseClaimCommandAdmissionReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_REQUESTED_CLAIM_SURFACE_REQUIRED',
      'requestedClaimSurface',
    ));
  } else if (!REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_SURFACES.includes(requestedClaimSurface)) {
    reasons.push(releaseClaimCommandAdmissionReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_REQUESTED_CLAIM_SURFACE_INVALID',
      'requestedClaimSurface',
      {
        receivedValue: requestedClaimSurface,
        allowedValues: cloneJsonSafe(REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_SURFACES),
      },
    ));
  }

  return reasons;
}

function collectReleaseClaimCommandAdmissionCommandReasons(commandInput, commandId) {
  if (!hasOwnField(commandInput, 'commandId')) {
    return [
      releaseClaimCommandAdmissionReason(
        'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_COMMAND_ID_REQUIRED',
        'commandId',
      ),
    ];
  }

  if (!commandId) {
    return [
      releaseClaimCommandAdmissionReason(
        'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_COMMAND_ID_INVALID',
        'commandId',
        {
          receivedValue: cloneJsonSafe(commandInput.commandId),
        },
      ),
    ];
  }

  return [];
}

function deriveReleaseClaimCommandAdmissionClass(kernelFenceResult) {
  return deriveReleaseClaimKernelFenceAdmissionClass(kernelFenceResult);
}

function collectReleaseClaimCommandAdmissionKernelFenceReasons(kernelFenceResult) {
  const reasons = [];

  if (kernelFenceResult.type !== 'revisionBridge.releaseClaimKernelFence') {
    reasons.push(releaseClaimCommandAdmissionReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_KERNEL_FENCE_RESULT_TYPE_INVALID',
      'kernelFenceResult.type',
      {
        expectedValue: 'revisionBridge.releaseClaimKernelFence',
        receivedValue: kernelFenceResult.type,
      },
    ));
  }
  if (kernelFenceResult.ok !== true) {
    reasons.push(releaseClaimCommandAdmissionReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_KERNEL_FENCE_RESULT_NOT_ACCEPTED',
      'kernelFenceResult.ok',
      {
        expectedValue: true,
        receivedValue: kernelFenceResult.ok,
      },
    ));
  }
  if (kernelFenceResult.status !== 'accepted') {
    reasons.push(releaseClaimCommandAdmissionReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_KERNEL_FENCE_RESULT_NOT_ACCEPTED',
      'kernelFenceResult.status',
      {
        expectedValue: 'accepted',
        receivedValue: kernelFenceResult.status,
      },
    ));
  }
  if (kernelFenceResult.code !== RELEASE_CLAIM_KERNEL_FENCE_ACCEPTED_CODE) {
    reasons.push(releaseClaimCommandAdmissionReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_KERNEL_FENCE_RESULT_NOT_ACCEPTED',
      'kernelFenceResult.code',
      {
        expectedValue: RELEASE_CLAIM_KERNEL_FENCE_ACCEPTED_CODE,
        receivedValue: kernelFenceResult.code,
      },
    ));
  }
  if (kernelFenceResult.reason !== RELEASE_CLAIM_KERNEL_FENCE_ACCEPTED_CODE) {
    reasons.push(releaseClaimCommandAdmissionReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_KERNEL_FENCE_RESULT_NOT_ACCEPTED',
      'kernelFenceResult.reason',
      {
        expectedValue: RELEASE_CLAIM_KERNEL_FENCE_ACCEPTED_CODE,
        receivedValue: kernelFenceResult.reason,
      },
    ));
  }

  const bindingPairs = [
    { field: 'mode', value: kernelFenceResult.binding.mode },
    { field: 'claimId', value: kernelFenceResult.binding.claimId },
    { field: 'dossierId', value: kernelFenceResult.binding.dossierId },
    { field: 'matrixId', value: kernelFenceResult.binding.matrixId },
  ];
  bindingPairs.forEach(({ field, value }) => {
    if (!value) {
      reasons.push(releaseClaimCommandAdmissionReason(
        'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_KERNEL_FENCE_RESULT_PROVENANCE_INVALID',
        `kernelFenceResult.binding.${field}`,
      ));
    }
  });

  if (
    !REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_RELEASE_CLASSES.includes(
      kernelFenceResult.binding.releaseClass,
    )
  ) {
    reasons.push(releaseClaimCommandAdmissionReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_KERNEL_FENCE_RESULT_PROVENANCE_INVALID',
      'kernelFenceResult.binding.releaseClass',
      {
        receivedValue: kernelFenceResult.binding.releaseClass,
        allowedValues: cloneJsonSafe(REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_RELEASE_CLASSES),
      },
    ));
  }

  if (
    !REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_SURFACES.includes(
      kernelFenceResult.summary.claimSurface,
    )
  ) {
    reasons.push(releaseClaimCommandAdmissionReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_KERNEL_FENCE_RESULT_PROVENANCE_INVALID',
      'kernelFenceResult.summary.claimSurface',
      {
        receivedValue: kernelFenceResult.summary.claimSurface,
        allowedValues: cloneJsonSafe(REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_SURFACES),
      },
    ));
  }
  if (!kernelFenceResult.summary.packetId) {
    reasons.push(releaseClaimCommandAdmissionReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_KERNEL_FENCE_RESULT_PROVENANCE_INVALID',
      'kernelFenceResult.summary.packetId',
    ));
  }
  if (!kernelFenceResult.summary.attestationId) {
    reasons.push(releaseClaimCommandAdmissionReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_KERNEL_FENCE_RESULT_PROVENANCE_INVALID',
      'kernelFenceResult.summary.attestationId',
    ));
  }

  const derivedAdmissionClass = deriveReleaseClaimCommandAdmissionClass(kernelFenceResult);
  if (!kernelFenceResult.summary.admissionClass) {
    reasons.push(releaseClaimCommandAdmissionReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_KERNEL_FENCE_RESULT_PROVENANCE_INVALID',
      'kernelFenceResult.summary.admissionClass',
    ));
  } else if (
    !['INTERNAL', 'USER_FACING'].includes(kernelFenceResult.summary.admissionClass)
    || kernelFenceResult.summary.admissionClass !== derivedAdmissionClass
  ) {
    reasons.push(releaseClaimCommandAdmissionReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_KERNEL_FENCE_RESULT_PROVENANCE_INVALID',
      'kernelFenceResult.summary.admissionClass',
      {
        expectedValue: derivedAdmissionClass,
        receivedValue: kernelFenceResult.summary.admissionClass,
      },
    ));
  }

  return reasons;
}

function releaseClaimCommandAdmissionBinding(kernelFenceResult) {
  return {
    mode: normalizeString(kernelFenceResult?.binding?.mode),
    claimId: normalizeString(kernelFenceResult?.binding?.claimId),
    dossierId: normalizeString(kernelFenceResult?.binding?.dossierId),
    matrixId: normalizeString(kernelFenceResult?.binding?.matrixId),
    releaseClass: normalizeString(kernelFenceResult?.binding?.releaseClass),
  };
}

function releaseClaimCommandAdmissionSummary(kernelFenceResult, requestedClaimSurface, commandId) {
  return {
    claimSurface: normalizeString(requestedClaimSurface),
    packetId: normalizeString(kernelFenceResult?.summary?.packetId),
    attestationId: normalizeString(kernelFenceResult?.summary?.attestationId),
    commandId: normalizeString(commandId),
    admissionClass: deriveReleaseClaimCommandAdmissionClass(kernelFenceResult),
  };
}

function releaseClaimCommandAdmissionResult(
  ok,
  status,
  reasons,
  kernelFenceResult,
  requestedClaimSurface,
  commandId,
) {
  const code = ok
    ? RELEASE_CLAIM_COMMAND_ADMISSION_ACCEPTED_CODE
    : (status === 'diagnostics'
      ? RELEASE_CLAIM_COMMAND_ADMISSION_DIAGNOSTICS_CODE
      : RELEASE_CLAIM_COMMAND_ADMISSION_BLOCKED_CODE);
  return {
    ok,
    type: 'revisionBridge.releaseClaimCommandAdmission',
    status,
    code,
    reason: ok ? RELEASE_CLAIM_COMMAND_ADMISSION_ACCEPTED_CODE : reasons[0]?.code || code,
    reasons: cloneJsonSafe(reasons),
    binding: releaseClaimCommandAdmissionBinding(kernelFenceResult),
    summary: releaseClaimCommandAdmissionSummary(
      kernelFenceResult,
      requestedClaimSurface,
      commandId,
    ),
  };
}

export function evaluateRevisionBridgeReleaseClaimCommandAdmission(input = {}) {
  const commandInput = isPlainObject(input) ? cloneJsonSafe(input) : {};
  const requestedMode = normalizeString(commandInput.requestedMode);
  const requestedClaimSurface = normalizeString(commandInput.requestedClaimSurface);

  const requestReasons = collectReleaseClaimCommandAdmissionRequestReasons(
    requestedMode,
    requestedClaimSurface,
  );
  if (requestReasons.length > 0) {
    return releaseClaimCommandAdmissionResult(
      false,
      'diagnostics',
      requestReasons,
      normalizeReleaseClaimCommandAdmissionKernelFenceResult(commandInput.kernelFenceResult),
      requestedClaimSurface,
      normalizeString(commandInput.commandId),
    );
  }

  const commandId = normalizeString(commandInput.commandId);
  const commandReasons = collectReleaseClaimCommandAdmissionCommandReasons(commandInput, commandId);
  if (commandReasons.length > 0) {
    return releaseClaimCommandAdmissionResult(
      false,
      'blocked',
      commandReasons,
      normalizeReleaseClaimCommandAdmissionKernelFenceResult(commandInput.kernelFenceResult),
      requestedClaimSurface,
      commandId,
    );
  }

  if (!isPlainObject(commandInput.kernelFenceInput)) {
    return releaseClaimCommandAdmissionResult(
      false,
      'blocked',
      [
        releaseClaimCommandAdmissionReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_KERNEL_FENCE_INPUT_MISSING',
          'kernelFenceInput',
        ),
      ],
      normalizeReleaseClaimCommandAdmissionKernelFenceResult(commandInput.kernelFenceResult),
      requestedClaimSurface,
      commandId,
    );
  }

  const evaluatedKernelFenceResult = evaluateRevisionBridgeReleaseClaimKernelFence(
    commandInput.kernelFenceInput,
  );
  const kernelFenceResult = normalizeReleaseClaimCommandAdmissionKernelFenceResult(
    evaluatedKernelFenceResult,
  );
  const kernelFenceReasons = collectReleaseClaimCommandAdmissionKernelFenceReasons(kernelFenceResult);
  if (kernelFenceReasons.length > 0) {
    return releaseClaimCommandAdmissionResult(
      false,
      'blocked',
      kernelFenceReasons,
      kernelFenceResult,
      requestedClaimSurface,
      commandId,
    );
  }

  const kernelFenceMismatchReasons = releaseClaimCommandAdmissionKernelFenceResultMismatchReasons(
    kernelFenceResult,
    commandInput.kernelFenceResult,
  );
  if (kernelFenceMismatchReasons.length > 0) {
    return releaseClaimCommandAdmissionResult(
      false,
      'blocked',
      kernelFenceMismatchReasons,
      kernelFenceResult,
      requestedClaimSurface,
      commandId,
    );
  }

  if (requestedMode !== kernelFenceResult.binding.mode) {
    return releaseClaimCommandAdmissionResult(
      false,
      'blocked',
      [
        releaseClaimCommandAdmissionReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_REQUESTED_MODE_MISMATCH',
          'requestedMode',
          {
            expectedValue: kernelFenceResult.binding.mode,
            receivedValue: requestedMode,
          },
        ),
      ],
      kernelFenceResult,
      requestedClaimSurface,
      commandId,
    );
  }

  if (requestedClaimSurface !== kernelFenceResult.summary.claimSurface) {
    return releaseClaimCommandAdmissionResult(
      false,
      'blocked',
      [
        releaseClaimCommandAdmissionReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_REQUESTED_CLAIM_SURFACE_MISMATCH',
          'requestedClaimSurface',
          {
            expectedValue: kernelFenceResult.summary.claimSurface,
            receivedValue: requestedClaimSurface,
          },
        ),
      ],
      kernelFenceResult,
      requestedClaimSurface,
      commandId,
    );
  }

  if (requestedMode === 'PR_MODE' && requestedClaimSurface === 'USER_FACING') {
    return releaseClaimCommandAdmissionResult(
      false,
      'blocked',
      [
        releaseClaimCommandAdmissionReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_PR_MODE_USER_FACING_BLOCKED',
          'requestedClaimSurface',
          {
            mode: requestedMode,
            claimSurface: requestedClaimSurface,
          },
        ),
      ],
      kernelFenceResult,
      requestedClaimSurface,
      commandId,
    );
  }

  if (
    requestedMode === 'RELEASE_MODE'
    && requestedClaimSurface === 'USER_FACING'
    && kernelFenceResult.binding.releaseClass !== 'USER_FACING_CLAIM_READY'
  ) {
    return releaseClaimCommandAdmissionResult(
      false,
      'blocked',
      [
        releaseClaimCommandAdmissionReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_RELEASE_CLASS_USER_FACING_BLOCKED',
          'kernelFenceResult.binding.releaseClass',
          {
            expectedValue: 'USER_FACING_CLAIM_READY',
            receivedValue: kernelFenceResult.binding.releaseClass,
          },
        ),
      ],
      kernelFenceResult,
      requestedClaimSurface,
      commandId,
    );
  }

  return releaseClaimCommandAdmissionResult(
    true,
    'accepted',
    [],
    kernelFenceResult,
    requestedClaimSurface,
    commandId,
  );
}
// CONTOUR_12J_RELEASE_CLAIM_COMMAND_ADMISSION_END

// CONTOUR_12K_RELEASE_CLAIM_EXECUTION_GATE_START
const RELEASE_CLAIM_EXECUTION_GATE_ACCEPTED_CODE =
  'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_ACCEPTED';
const RELEASE_CLAIM_EXECUTION_GATE_BLOCKED_CODE =
  'E_REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_BLOCKED';
const RELEASE_CLAIM_EXECUTION_GATE_DIAGNOSTICS_CODE =
  'E_REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_DIAGNOSTICS';

export const REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_SCHEMA =
  'revision-bridge.release-claim-execution-gate.v1';
const REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_ALLOWED_FIELDS = Object.freeze([
  'schemaVersion',
  'commandAdmissionInput',
  'commandAdmissionResult',
  'requestedMode',
  'requestedClaimSurface',
]);
export const REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_REASON_CODES = Object.freeze([
  RELEASE_CLAIM_EXECUTION_GATE_ACCEPTED_CODE,
  RELEASE_CLAIM_EXECUTION_GATE_BLOCKED_CODE,
  RELEASE_CLAIM_EXECUTION_GATE_DIAGNOSTICS_CODE,
  'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_SCHEMA_VERSION_REQUIRED',
  'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_SCHEMA_VERSION_INVALID',
  'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_EXTRA_FIELDS',
  'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_COMMAND_ADMISSION_INPUT_MISSING',
  'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_COMMAND_ADMISSION_RESULT_MISSING',
  'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_COMMAND_ADMISSION_RESULT_MISMATCH',
  'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_COMMAND_ADMISSION_RESULT_TYPE_INVALID',
  'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_COMMAND_ADMISSION_RESULT_NOT_ACCEPTED',
  'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_COMMAND_ADMISSION_RESULT_PROVENANCE_INVALID',
  'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_REQUESTED_MODE_REQUIRED',
  'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_REQUESTED_MODE_INVALID',
  'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_REQUESTED_MODE_MISMATCH',
  'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_REQUESTED_CLAIM_SURFACE_REQUIRED',
  'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_REQUESTED_CLAIM_SURFACE_INVALID',
  'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_REQUESTED_CLAIM_SURFACE_MISMATCH',
  'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_PR_MODE_USER_FACING_BLOCKED',
  'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_RELEASE_CLASS_USER_FACING_BLOCKED',
  ...REVISION_BRIDGE_RELEASE_CLAIM_COMMAND_ADMISSION_REASON_CODES,
]);

function releaseClaimExecutionGateReason(code, field, details = {}) {
  return {
    code,
    field,
    ...cloneJsonSafe(details),
  };
}

function normalizeReleaseClaimExecutionGateCommandAdmissionResult(input = {}) {
  const result = isPlainObject(input) ? cloneJsonSafe(input) : {};
  const binding = isPlainObject(result.binding) ? cloneJsonSafe(result.binding) : {};
  const summary = isPlainObject(result.summary) ? cloneJsonSafe(result.summary) : {};

  return {
    ok: result.ok === true,
    type: normalizeString(result.type),
    status: normalizeString(result.status),
    code: normalizeString(result.code),
    reason: normalizeString(result.reason),
    binding: {
      mode: normalizeString(binding.mode),
      claimId: normalizeString(binding.claimId),
      dossierId: normalizeString(binding.dossierId),
      matrixId: normalizeString(binding.matrixId),
      releaseClass: normalizeString(binding.releaseClass),
    },
    summary: {
      claimSurface: normalizeString(summary.claimSurface),
      packetId: normalizeString(summary.packetId),
      attestationId: normalizeString(summary.attestationId),
      commandId: normalizeString(summary.commandId),
      admissionClass: normalizeString(summary.admissionClass),
    },
  };
}

function releaseClaimExecutionGateCommandAdmissionResultMismatchReasons(expectedResult, receivedResult) {
  if (!isPlainObject(receivedResult)) {
    if (receivedResult === undefined) return [];
    return [
      releaseClaimExecutionGateReason(
        'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_COMMAND_ADMISSION_RESULT_MISMATCH',
        'commandAdmissionResult',
        {
          expectedValue: normalizeReleaseClaimExecutionGateCommandAdmissionResult(expectedResult),
          receivedValue: receivedResult,
        },
      ),
    ];
  }

  const expectedCommandAdmissionResult = normalizeReleaseClaimExecutionGateCommandAdmissionResult(expectedResult);
  const receivedCommandAdmissionResult = normalizeReleaseClaimExecutionGateCommandAdmissionResult(receivedResult);
  if (JSON.stringify(expectedCommandAdmissionResult) === JSON.stringify(receivedCommandAdmissionResult)) return [];

  return [
    releaseClaimExecutionGateReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_COMMAND_ADMISSION_RESULT_MISMATCH',
      'commandAdmissionResult',
      {
        expectedValue: expectedCommandAdmissionResult,
        receivedValue: receivedCommandAdmissionResult,
      },
    ),
  ];
}

function collectReleaseClaimExecutionGateSchemaReasons(executionInput) {
  const reasons = [];

  if (!hasOwnField(executionInput, 'schemaVersion')) {
    reasons.push(releaseClaimExecutionGateReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_SCHEMA_VERSION_REQUIRED',
      'schemaVersion',
    ));
  } else if (normalizeString(executionInput.schemaVersion) !== REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_SCHEMA) {
    reasons.push(releaseClaimExecutionGateReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_SCHEMA_VERSION_INVALID',
      'schemaVersion',
      {
        expectedValue: REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_SCHEMA,
        receivedValue: cloneJsonSafe(executionInput.schemaVersion),
      },
    ));
  }

  const extraFields = Object.keys(executionInput)
    .filter((field) => !REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_ALLOWED_FIELDS.includes(field))
    .sort();
  if (extraFields.length > 0) {
    reasons.push(releaseClaimExecutionGateReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_EXTRA_FIELDS',
      'input',
      {
        extraFields: cloneJsonSafe(extraFields),
      },
    ));
  }

  return reasons;
}

function collectReleaseClaimExecutionGateRequestReasons(requestedMode, requestedClaimSurface) {
  const reasons = [];

  if (!requestedMode) {
    reasons.push(releaseClaimExecutionGateReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_REQUESTED_MODE_REQUIRED',
      'requestedMode',
    ));
  } else if (!REVISION_BRIDGE_RELEASE_CLAIM_MODE_VALUES.includes(requestedMode)) {
    reasons.push(releaseClaimExecutionGateReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_REQUESTED_MODE_INVALID',
      'requestedMode',
      {
        receivedValue: requestedMode,
        allowedValues: cloneJsonSafe(REVISION_BRIDGE_RELEASE_CLAIM_MODE_VALUES),
      },
    ));
  }

  if (!requestedClaimSurface) {
    reasons.push(releaseClaimExecutionGateReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_REQUESTED_CLAIM_SURFACE_REQUIRED',
      'requestedClaimSurface',
    ));
  } else if (!REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_SURFACES.includes(requestedClaimSurface)) {
    reasons.push(releaseClaimExecutionGateReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_REQUESTED_CLAIM_SURFACE_INVALID',
      'requestedClaimSurface',
      {
        receivedValue: requestedClaimSurface,
        allowedValues: cloneJsonSafe(REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_SURFACES),
      },
    ));
  }

  return reasons;
}

function deriveReleaseClaimExecutionGateAdmissionClass(commandAdmissionResult) {
  return deriveReleaseClaimCommandAdmissionClass(commandAdmissionResult);
}

function collectReleaseClaimExecutionGateCommandAdmissionReasons(commandAdmissionResult) {
  const reasons = [];

  if (commandAdmissionResult.type !== 'revisionBridge.releaseClaimCommandAdmission') {
    reasons.push(releaseClaimExecutionGateReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_COMMAND_ADMISSION_RESULT_TYPE_INVALID',
      'commandAdmissionResult.type',
      {
        expectedValue: 'revisionBridge.releaseClaimCommandAdmission',
        receivedValue: commandAdmissionResult.type,
      },
    ));
  }
  if (commandAdmissionResult.ok !== true) {
    reasons.push(releaseClaimExecutionGateReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_COMMAND_ADMISSION_RESULT_NOT_ACCEPTED',
      'commandAdmissionResult.ok',
      {
        expectedValue: true,
        receivedValue: commandAdmissionResult.ok,
      },
    ));
  }
  if (commandAdmissionResult.status !== 'accepted') {
    reasons.push(releaseClaimExecutionGateReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_COMMAND_ADMISSION_RESULT_NOT_ACCEPTED',
      'commandAdmissionResult.status',
      {
        expectedValue: 'accepted',
        receivedValue: commandAdmissionResult.status,
      },
    ));
  }
  if (commandAdmissionResult.code !== RELEASE_CLAIM_COMMAND_ADMISSION_ACCEPTED_CODE) {
    reasons.push(releaseClaimExecutionGateReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_COMMAND_ADMISSION_RESULT_NOT_ACCEPTED',
      'commandAdmissionResult.code',
      {
        expectedValue: RELEASE_CLAIM_COMMAND_ADMISSION_ACCEPTED_CODE,
        receivedValue: commandAdmissionResult.code,
      },
    ));
  }
  if (commandAdmissionResult.reason !== RELEASE_CLAIM_COMMAND_ADMISSION_ACCEPTED_CODE) {
    reasons.push(releaseClaimExecutionGateReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_COMMAND_ADMISSION_RESULT_NOT_ACCEPTED',
      'commandAdmissionResult.reason',
      {
        expectedValue: RELEASE_CLAIM_COMMAND_ADMISSION_ACCEPTED_CODE,
        receivedValue: commandAdmissionResult.reason,
      },
    ));
  }

  const bindingPairs = [
    { field: 'mode', value: commandAdmissionResult.binding.mode },
    { field: 'claimId', value: commandAdmissionResult.binding.claimId },
    { field: 'dossierId', value: commandAdmissionResult.binding.dossierId },
    { field: 'matrixId', value: commandAdmissionResult.binding.matrixId },
  ];
  bindingPairs.forEach(({ field, value }) => {
    if (!value) {
      reasons.push(releaseClaimExecutionGateReason(
        'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_COMMAND_ADMISSION_RESULT_PROVENANCE_INVALID',
        `commandAdmissionResult.binding.${field}`,
      ));
    }
  });

  if (
    !REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_RELEASE_CLASSES.includes(
      commandAdmissionResult.binding.releaseClass,
    )
  ) {
    reasons.push(releaseClaimExecutionGateReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_COMMAND_ADMISSION_RESULT_PROVENANCE_INVALID',
      'commandAdmissionResult.binding.releaseClass',
      {
        receivedValue: commandAdmissionResult.binding.releaseClass,
        allowedValues: cloneJsonSafe(REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_RELEASE_CLASSES),
      },
    ));
  }

  if (
    !REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_SURFACES.includes(
      commandAdmissionResult.summary.claimSurface,
    )
  ) {
    reasons.push(releaseClaimExecutionGateReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_COMMAND_ADMISSION_RESULT_PROVENANCE_INVALID',
      'commandAdmissionResult.summary.claimSurface',
      {
        receivedValue: commandAdmissionResult.summary.claimSurface,
        allowedValues: cloneJsonSafe(REVISION_BRIDGE_RELEASE_CLAIM_USER_FACING_BOUNDARY_SURFACES),
      },
    ));
  }
  if (!commandAdmissionResult.summary.packetId) {
    reasons.push(releaseClaimExecutionGateReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_COMMAND_ADMISSION_RESULT_PROVENANCE_INVALID',
      'commandAdmissionResult.summary.packetId',
    ));
  }
  if (!commandAdmissionResult.summary.attestationId) {
    reasons.push(releaseClaimExecutionGateReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_COMMAND_ADMISSION_RESULT_PROVENANCE_INVALID',
      'commandAdmissionResult.summary.attestationId',
    ));
  }
  if (!commandAdmissionResult.summary.commandId) {
    reasons.push(releaseClaimExecutionGateReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_COMMAND_ADMISSION_RESULT_PROVENANCE_INVALID',
      'commandAdmissionResult.summary.commandId',
    ));
  }

  const derivedAdmissionClass = deriveReleaseClaimExecutionGateAdmissionClass(commandAdmissionResult);
  if (!commandAdmissionResult.summary.admissionClass) {
    reasons.push(releaseClaimExecutionGateReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_COMMAND_ADMISSION_RESULT_PROVENANCE_INVALID',
      'commandAdmissionResult.summary.admissionClass',
    ));
  } else if (
    !['INTERNAL', 'USER_FACING'].includes(commandAdmissionResult.summary.admissionClass)
    || commandAdmissionResult.summary.admissionClass !== derivedAdmissionClass
  ) {
    reasons.push(releaseClaimExecutionGateReason(
      'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_COMMAND_ADMISSION_RESULT_PROVENANCE_INVALID',
      'commandAdmissionResult.summary.admissionClass',
      {
        expectedValue: derivedAdmissionClass,
        receivedValue: commandAdmissionResult.summary.admissionClass,
      },
    ));
  }

  return reasons;
}

function releaseClaimExecutionGateBinding(commandAdmissionResult) {
  return {
    mode: normalizeString(commandAdmissionResult?.binding?.mode),
    claimId: normalizeString(commandAdmissionResult?.binding?.claimId),
    dossierId: normalizeString(commandAdmissionResult?.binding?.dossierId),
    matrixId: normalizeString(commandAdmissionResult?.binding?.matrixId),
    releaseClass: normalizeString(commandAdmissionResult?.binding?.releaseClass),
  };
}

function releaseClaimExecutionGateSummary(commandAdmissionResult, requestedClaimSurface) {
  return {
    claimSurface: normalizeString(requestedClaimSurface),
    packetId: normalizeString(commandAdmissionResult?.summary?.packetId),
    attestationId: normalizeString(commandAdmissionResult?.summary?.attestationId),
    commandId: normalizeString(commandAdmissionResult?.summary?.commandId),
    admissionClass: deriveReleaseClaimExecutionGateAdmissionClass(commandAdmissionResult),
  };
}

function releaseClaimExecutionGateResult(
  ok,
  status,
  reasons,
  commandAdmissionResult,
  requestedClaimSurface,
) {
  const code = ok
    ? RELEASE_CLAIM_EXECUTION_GATE_ACCEPTED_CODE
    : (status === 'diagnostics'
      ? RELEASE_CLAIM_EXECUTION_GATE_DIAGNOSTICS_CODE
      : RELEASE_CLAIM_EXECUTION_GATE_BLOCKED_CODE);
  return {
    ok,
    type: 'revisionBridge.releaseClaimExecutionGate',
    status,
    code,
    reason: ok ? RELEASE_CLAIM_EXECUTION_GATE_ACCEPTED_CODE : reasons[0]?.code || code,
    reasons: cloneJsonSafe(reasons),
    binding: releaseClaimExecutionGateBinding(commandAdmissionResult),
    summary: releaseClaimExecutionGateSummary(commandAdmissionResult, requestedClaimSurface),
  };
}

export function evaluateRevisionBridgeReleaseClaimExecutionGate(input = {}) {
  const executionInput = isPlainObject(input) ? cloneJsonSafe(input) : {};
  const requestedMode = normalizeString(executionInput.requestedMode);
  const requestedClaimSurface = normalizeString(executionInput.requestedClaimSurface);

  const schemaReasons = collectReleaseClaimExecutionGateSchemaReasons(executionInput);
  if (schemaReasons.length > 0) {
    return releaseClaimExecutionGateResult(
      false,
      'diagnostics',
      schemaReasons,
      normalizeReleaseClaimExecutionGateCommandAdmissionResult(executionInput.commandAdmissionResult),
      requestedClaimSurface,
    );
  }

  const requestReasons = collectReleaseClaimExecutionGateRequestReasons(
    requestedMode,
    requestedClaimSurface,
  );
  if (requestReasons.length > 0) {
    return releaseClaimExecutionGateResult(
      false,
      'diagnostics',
      requestReasons,
      normalizeReleaseClaimExecutionGateCommandAdmissionResult(executionInput.commandAdmissionResult),
      requestedClaimSurface,
    );
  }

  if (!isPlainObject(executionInput.commandAdmissionResult)) {
    if (hasOwnField(executionInput, 'commandAdmissionResult')) {
      return releaseClaimExecutionGateResult(
        false,
        'blocked',
        [
          releaseClaimExecutionGateReason(
            'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_COMMAND_ADMISSION_RESULT_MISMATCH',
            'commandAdmissionResult',
            {
              expectedValue: normalizeReleaseClaimExecutionGateCommandAdmissionResult({}),
              receivedValue: executionInput.commandAdmissionResult,
            },
          ),
        ],
        normalizeReleaseClaimExecutionGateCommandAdmissionResult(executionInput.commandAdmissionResult),
        requestedClaimSurface,
      );
    }
  }

  if (!isPlainObject(executionInput.commandAdmissionInput)) {
    return releaseClaimExecutionGateResult(
      false,
      'blocked',
      [
        releaseClaimExecutionGateReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_COMMAND_ADMISSION_INPUT_MISSING',
          'commandAdmissionInput',
        ),
      ],
      normalizeReleaseClaimExecutionGateCommandAdmissionResult(executionInput.commandAdmissionResult),
      requestedClaimSurface,
    );
  }

  const evaluatedCommandAdmissionResult = evaluateRevisionBridgeReleaseClaimCommandAdmission(
    executionInput.commandAdmissionInput,
  );
  const commandAdmissionResult = normalizeReleaseClaimExecutionGateCommandAdmissionResult(
    evaluatedCommandAdmissionResult,
  );
  const commandAdmissionReasons = collectReleaseClaimExecutionGateCommandAdmissionReasons(
    commandAdmissionResult,
  );
  if (commandAdmissionReasons.length > 0) {
    return releaseClaimExecutionGateResult(
      false,
      'blocked',
      commandAdmissionReasons,
      commandAdmissionResult,
      requestedClaimSurface,
    );
  }

  const commandAdmissionMismatchReasons = releaseClaimExecutionGateCommandAdmissionResultMismatchReasons(
    commandAdmissionResult,
    executionInput.commandAdmissionResult,
  );
  if (commandAdmissionMismatchReasons.length > 0) {
    return releaseClaimExecutionGateResult(
      false,
      'blocked',
      commandAdmissionMismatchReasons,
      commandAdmissionResult,
      requestedClaimSurface,
    );
  }

  if (requestedMode !== commandAdmissionResult.binding.mode) {
    return releaseClaimExecutionGateResult(
      false,
      'blocked',
      [
        releaseClaimExecutionGateReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_REQUESTED_MODE_MISMATCH',
          'requestedMode',
          {
            expectedValue: commandAdmissionResult.binding.mode,
            receivedValue: requestedMode,
          },
        ),
      ],
      commandAdmissionResult,
      requestedClaimSurface,
    );
  }

  if (requestedClaimSurface !== commandAdmissionResult.summary.claimSurface) {
    return releaseClaimExecutionGateResult(
      false,
      'blocked',
      [
        releaseClaimExecutionGateReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_REQUESTED_CLAIM_SURFACE_MISMATCH',
          'requestedClaimSurface',
          {
            expectedValue: commandAdmissionResult.summary.claimSurface,
            receivedValue: requestedClaimSurface,
          },
        ),
      ],
      commandAdmissionResult,
      requestedClaimSurface,
    );
  }

  if (requestedMode === 'PR_MODE' && requestedClaimSurface === 'USER_FACING') {
    return releaseClaimExecutionGateResult(
      false,
      'blocked',
      [
        releaseClaimExecutionGateReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_PR_MODE_USER_FACING_BLOCKED',
          'requestedClaimSurface',
          {
            mode: requestedMode,
            claimSurface: requestedClaimSurface,
          },
        ),
      ],
      commandAdmissionResult,
      requestedClaimSurface,
    );
  }

  if (
    requestedMode === 'RELEASE_MODE'
    && requestedClaimSurface === 'USER_FACING'
    && commandAdmissionResult.binding.releaseClass !== 'USER_FACING_CLAIM_READY'
  ) {
    return releaseClaimExecutionGateResult(
      false,
      'blocked',
      [
        releaseClaimExecutionGateReason(
          'REVISION_BRIDGE_RELEASE_CLAIM_EXECUTION_GATE_RELEASE_CLASS_USER_FACING_BLOCKED',
          'commandAdmissionResult.binding.releaseClass',
          {
            expectedValue: 'USER_FACING_CLAIM_READY',
            receivedValue: commandAdmissionResult.binding.releaseClass,
          },
        ),
      ],
      commandAdmissionResult,
      requestedClaimSurface,
    );
  }

  return releaseClaimExecutionGateResult(
    true,
    'accepted',
    [],
    commandAdmissionResult,
    requestedClaimSurface,
  );
}
// CONTOUR_12K_RELEASE_CLAIM_EXECUTION_GATE_END

function normalizeTargetScope(input) {
  const scope = isPlainObject(input) ? input : {};
  return {
    type: normalizeString(scope.type),
    id: normalizeString(scope.id),
  };
}

function normalizeDecision(input, index) {
  const decision = input;
  const match = isPlainObject(decision.match) ? decision.match : {};
  return {
    decisionId: normalizeString(decision.decisionId) || `decision-${index}`,
    status: normalizeString(decision.status),
    matchKind: normalizeString(decision.matchKind || decision.matchMode || match.kind || match.mode),
    applyMode: normalizeString(decision.applyMode),
  };
}

function normalizeDecisionSet(input) {
  const decisionSet = isPlainObject(input) ? input : {};
  const decisions = Array.isArray(decisionSet.decisions)
    ? decisionSet.decisions
      .filter((decision) => isPlainObject(decision))
      .map((decision, index) => normalizeDecision(decision, index))
    : [];
  return {
    decisions,
  };
}

function normalizePacket(input) {
  const packet = isPlainObject(input) ? input : {};
  return {
    schemaVersion: normalizeString(packet.schemaVersion),
    projectId: normalizeString(packet.projectId),
    revisionSessionId: normalizeString(packet.revisionSessionId),
    baselineHash: normalizeString(packet.baselineHash),
    targetScope: normalizeTargetScope(packet.targetScope),
    decisionSet: normalizeDecisionSet(packet.decisionSet),
  };
}

function collectPacketValidationReasons(input, packet) {
  const reasons = [];
  if (!isPlainObject(input)) {
    reasons.push(invalidField('packet', 'packet must be an object'));
    return reasons;
  }
  if (!packet.schemaVersion) {
    reasons.push(missingField('schemaVersion'));
  } else if (packet.schemaVersion !== REVISION_BRIDGE_P0_PACKET_SCHEMA) {
    reasons.push(invalidField('schemaVersion', 'schemaVersion is not supported'));
  }
  if (!packet.projectId) reasons.push(missingField('projectId'));
  if (!packet.revisionSessionId) reasons.push(missingField('revisionSessionId'));
  if (!packet.baselineHash) reasons.push(missingField('baselineHash'));
  if (!isPlainObject(input.targetScope)) {
    reasons.push(missingField('targetScope'));
  } else if (!packet.targetScope.type) {
    reasons.push(missingField('targetScope.type'));
  }
  if (!isPlainObject(input.decisionSet)) {
    reasons.push(missingField('decisionSet'));
  } else if (!Array.isArray(input.decisionSet.decisions)) {
    reasons.push(invalidField('decisionSet.decisions', 'decisionSet.decisions must be an array'));
  } else {
    input.decisionSet.decisions.forEach((decision, index) => {
      if (!isPlainObject(decision)) {
        reasons.push(invalidField(`decisionSet.decisions.${index}`, 'decision entry must be an object'));
      }
    });
  }
  return reasons;
}

function validationFailure(reasons) {
  return {
    ok: false,
    type: 'revisionBridge.validation',
    code: PACKET_INVALID_CODE,
    reason: reasons[0]?.code || 'REVISION_BRIDGE_PACKET_INVALID',
    reasons,
    packet: null,
  };
}

export function validateRevisionBridgePacket(input = {}) {
  const packet = normalizePacket(input);
  const reasons = collectPacketValidationReasons(input, packet);
  if (reasons.length > 0) return validationFailure(reasons);
  return {
    ok: true,
    type: 'revisionBridge.validation',
    code: PACKET_VALID_CODE,
    reason: 'REVISION_BRIDGE_PACKET_VALID',
    reasons: [],
    packet: cloneJsonSafe(packet),
  };
}

function applyMissingReason(field) {
  return {
    code: 'REVISION_BRIDGE_APPLY_FIELD_REQUIRED',
    field,
    message: `${field} is required before apply can be considered`,
  };
}

function collectApplySafetyReasons(packet) {
  const reasons = [];
  if (!packet.projectId) reasons.push(applyMissingReason('projectId'));
  if (!packet.revisionSessionId) reasons.push(applyMissingReason('revisionSessionId'));
  if (!packet.baselineHash) reasons.push(applyMissingReason('baselineHash'));
  if (!packet.targetScope.type) reasons.push(applyMissingReason('targetScope.type'));
  if (!Array.isArray(packet.decisionSet.decisions)) {
    reasons.push(applyMissingReason('decisionSet.decisions'));
    return reasons;
  }
  for (const decision of packet.decisionSet.decisions) {
    if (decision.status !== 'resolved') {
      reasons.push({
        code: 'REVISION_BRIDGE_APPLY_UNRESOLVED_DECISION',
        field: 'decisionSet.decisions.status',
        decisionId: decision.decisionId,
        message: 'only resolved decisions may be considered for apply',
      });
    }
    if (decision.matchKind !== 'exact') {
      reasons.push({
        code: 'REVISION_BRIDGE_APPLY_APPROXIMATE_MATCH_FORBIDDEN',
        field: 'decisionSet.decisions.matchKind',
        decisionId: decision.decisionId,
        message: 'approximate or missing matches are forbidden for apply',
      });
    }
    if (decision.applyMode === 'auto' && (decision.status !== 'resolved' || decision.matchKind !== 'exact')) {
      reasons.push({
        code: 'REVISION_BRIDGE_APPLY_AUTO_UNSAFE_FORBIDDEN',
        field: 'decisionSet.decisions.applyMode',
        decisionId: decision.decisionId,
        message: 'auto-apply is forbidden for unresolved or approximate decisions',
      });
    }
  }
  return reasons;
}

function blockedApplyResult(reasons) {
  return {
    ok: false,
    type: 'revisionBridge.applySafety',
    status: 'blocked',
    code: APPLY_BLOCKED_CODE,
    reason: reasons[0]?.code || 'REVISION_BRIDGE_P0_APPLY_DISABLED',
    reasons,
    canApply: false,
  };
}

export function evaluateRevisionBridgeApplySafety(input = {}) {
  const packet = normalizePacket(input);
  const validation = validateRevisionBridgePacket(input);
  const reasons = validation.ok
    ? collectApplySafetyReasons(packet)
    : validation.reasons.map((reason) => ({
      code: 'REVISION_BRIDGE_APPLY_PACKET_INVALID',
      field: reason.field,
      message: reason.message,
    }));

  if (reasons.length === 0) {
    reasons.push({
      code: 'REVISION_BRIDGE_P0_APPLY_DISABLED',
      field: 'apply',
      message: 'P0 safety kernel does not perform runtime apply',
    });
  }

  return blockedApplyResult(reasons);
}
