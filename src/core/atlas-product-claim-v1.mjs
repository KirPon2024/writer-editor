import { hashCanonicalValue } from './browser-safe-hash.mjs';

export const ATLAS_PRODUCT_CLAIM_SCHEMA_VERSION = 'yalken.r24.atlasProductClaim.v1';
export const ATLAS_PRODUCT_NODE_PROOF_SCHEMA_VERSION = 'yalken.r24.atlasProductNodeProof.v1';
export const ATLAS_PRODUCT_ASSURANCE_PROOF_SCHEMA_VERSION = 'yalken.r24.atlasProductAssuranceProof.v1';
export const ATLAS_PRODUCT_EXPORT_IR_SCHEMA_VERSION = 'yalken.r24.atlasProductExportIr.v1';
export const ATLAS_PRODUCT_GATE_DECISION_SCHEMA_VERSION = 'yalken.r24.atlasProfileReleasePermit.v1';
export const ATLAS_PRODUCT_NODE_ID = 'WP-507_ATLAS_PRODUCT_CLAIM';
export const ATLAS_PRODUCT_PROFILE_ID = 'ATLAS_PRODUCT_V33';
export const ATLAS_PRODUCT_CLAIM_CEILING = 'NODE_AND_SELECTED_PROFILE_ONLY';
export const ATLAS_PRODUCT_PROFILE_VERDICT = 'ATLAS_PRODUCT_V33_EVIDENCE_BOUND_PACKAGED_CLAIM';
export const ATLAS_PRODUCT_PROGRAM_VERDICT = 'NEEDS_MORE_EVIDENCE';
export const ATLAS_PRODUCT_REQUIRED_EVIDENCE_CLASS = 'INDEPENDENT_EXACT_HEAD';
export const ATLAS_PROFILE_RELEASE_GATE_ID = 'ATLAS_PROFILE_RELEASE_PERMIT';
export const ATLAS_PRODUCT_MISSION_DIGEST = '2d188140211c4e2a65f0f1bf1bef5bac53e396e3c3887cb3563fa253a10b0c80';
export const ATLAS_PRODUCT_AUTHORITY_BINDING_DIGEST = 'be68bd97021d13fbfb75c73791bda7f6bfeebecebf525d4a927d1a4c9fe9efd6';
export const ATLAS_PRODUCT_MAX_SUPPORTING_EVIDENCE_PER_NODE = 2_048;
export const ATLAS_PRODUCT_MAX_SUPPORTING_EVIDENCE_TOTAL = 16_384;
export const ATLAS_PRODUCT_MAX_ASSURANCE_DENOMINATOR = 1_000_000;

export const REQUIRED_ATLAS_PRODUCT_NODE_IDS = Object.freeze([
  'WP-404_ATLAS_FOUNDATION_CLAIM',
  'WP-500_ASSOCIATIONS',
  'WP-501_TIME_KNOWLEDGE',
  'WP-502_THREADS_CAUSALITY',
  'WP-503_ATLAS_SURFACE',
  'WP-504_DOSSIER_LAYOUT_LINKS',
  'WP-505_REGISTER_AND_ASK',
  'WP-506_COUNTERFACTUAL',
]);

export const REQUIRED_ATLAS_PRODUCT_ASSURANCE_CLASSES = Object.freeze([
  'ACCESSIBILITY',
  'EXPORT_IR',
  'PERFORMANCE',
  'SECURITY',
]);

const NON_CLAIMS = Object.freeze([
  'NO_PROGRAM_DONE',
  'NO_GLOBAL_SCALAR_PASS',
  'NO_CROSS_PROFILE_PROMOTION',
  'NO_PUBLIC_RELEASE_OR_RELEASE_READINESS',
  'NO_PRODUCT_RUNTIME_MUTATION',
  'NO_COMMAND_OR_CAPABILITY_AUTHORITY',
  'NO_PERSISTENCE_OR_RENDERER_WIRING',
  'NO_RUNTIME_NETWORK_PLATFORM_OR_EXTERNAL_AI_EFFECT',
  'NO_CLAIM_BEYOND_WP507_AND_SELECTED_ATLAS_PRODUCT_V33_PROFILE',
]);

export const ATLAS_PRODUCT_FEATURE_INTEGRATION_MANIFEST_V1 = Object.freeze({
  featureId: 'yalken.atlas.productClaim.v1',
  featureVersion: 1,
  integrationMode: 'EXISTING_SEAM:BOUND_TO_CURRENT_APPROVED_ENTRYPOINTS',
  domainOwner: 'DERIVED_PROJECTOR_AUTHORITY',
  authoritativeData: 'NOT_APPLICABLE_DERIVED_CLAIM_ONLY',
  derivedData: 'EXACT_IDENTITY_EIGHT_NODE_AND_FOUR_ASSURANCE_EVIDENCE_PACKAGE',
  commandIds: ['NOT_APPLICABLE_NO_COMMAND'],
  eventTypes: ['NOT_APPLICABLE_NO_EVENT'],
  queryIds: ['atlas.productClaim.compile.v1'],
  productProjectionIds: ['atlas.productClaim.package.v1'],
  capabilityIds: ['NOT_APPLICABLE_NO_PRODUCT_CAPABILITY'],
  authorityMap: 'READ_ONLY_DERIVED_PROJECTOR_NO_PRODUCT_WRITE',
  identityKeys: ['headSha', 'treeSha', 'nodeProofSetDigest', 'assuranceProofSetDigest', 'exportIrManifestDigest'],
  revisionPolicy: 'EXACT_HEAD_AND_TREE_ONLY_STALE_OR_FUTURE_REJECTED',
  writePath: 'PURE_RETURN_VALUE_ONLY',
  readPath: 'COMPLETE_VERIFIED_NODE_ASSURANCE_GATE_AND_EXPORT_IR_INPUTS',
  requiredProductPorts: ['NOT_APPLICABLE_NO_EXTERNAL_EFFECT'],
  requiredDesignOsPorts: ['NOT_APPLICABLE_NO_INTERFACE_PLANE_CHANGE'],
  adapterRequirements: ['NOT_APPLICABLE_NO_ADAPTER'],
  surfaceManifests: ['NOT_APPLICABLE_NO_UI_SURFACE'],
  slotRequirements: ['NOT_APPLICABLE_NO_UI_SLOT'],
  supportedWorkspaces: ['NOT_APPLICABLE_NO_UI_WORKSPACE'],
  platformAvailability: 'PLATFORM_NEUTRAL_PURE_MODULE',
  accessibilityRequirements: 'EVIDENCE_PACKAGE_REQUIRES_ACCESSIBILITY_ASSURANCE_NO_VISUAL_SURFACE',
  fallbacks: ['FAIL_CLOSED_TO_NEEDS_MORE_EVIDENCE'],
  stateClasses: ['DERIVED_STATE'],
  persistenceClass: 'NOT_PERSISTED_BY_THIS_MODULE',
  migrations: ['NOT_APPLICABLE_NO_STORED_SCHEMA'],
  recovery: 'RECOMPILE_FROM_VERIFIED_EXACT_IDENTITY_INPUTS',
  rollback: 'REVERT_BOUNDED_MODULE_AND_TEST_COMMIT',
  performanceBudget: {
    maximumNodeProofs: REQUIRED_ATLAS_PRODUCT_NODE_IDS.length,
    maximumAssuranceProofs: REQUIRED_ATLAS_PRODUCT_ASSURANCE_CLASSES.length,
    maximumSupportingEvidencePerNode: ATLAS_PRODUCT_MAX_SUPPORTING_EVIDENCE_PER_NODE,
    maximumSupportingEvidenceTotal: ATLAS_PRODUCT_MAX_SUPPORTING_EVIDENCE_TOTAL,
  },
  securityBoundary: 'STRICT_OWN_DATA_EXACT_KEYSETS_NFC_BOUNDED_DENOMINATORS_NO_ACCESSORS_SYMBOLS_PATHS_URLS_COMMANDS_NETWORK_EXTERNAL_AI_OR_EFFECT_AUTHORITY',
  lifecycle: 'ON_DEMAND_PURE_COMPILATION_ONLY',
  negativeBypassChecks: [
    'STALE_OR_FUTURE_HEAD_OR_TREE_REJECTED',
    'MISSING_DUPLICATE_UNKNOWN_OR_TAMPERED_PROOF_REJECTED',
    'SKIPPED_TODO_ZERO_OR_PARTIAL_ASSURANCE_REJECTED',
    'EXPORT_IR_CROSS_DIGEST_TAMPER_REJECTED',
    'OWNER_GATE_SCOPE_MISSION_OR_DECISION_TAMPER_REJECTED',
    'GLOBAL_PROGRAM_OR_CROSS_PROFILE_PROMOTION_REJECTED',
  ],
  evidenceBindings: [
    'WP404_AND_WP500_WP506_COMPLETE_PROOF_SET',
    'SECURITY_PERFORMANCE_ACCESSIBILITY_EXPORT_IR_COMPLETE_ASSURANCE_SET',
    'EXACT_HEAD_AND_TREE',
    'ATLAS_PROFILE_RELEASE_PERMIT_EXACT_NODE_SCOPE',
  ],
  currentReality: 'PURE_EVIDENCE_PACKAGE_COMPILER_ONLY_NO_RUNTIME_WIRING_OR_PUBLIC_RELEASE',
});

const SHA40_PATTERN = /^[a-f0-9]{40}$/u;
const DIGEST64_PATTERN = /^[a-f0-9]{64}$/u;
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const INPUT_KEYS = Object.freeze(['assuranceProofs', 'claimRequest', 'exactIdentity', 'exportIr', 'nodeProofs', 'ownerGateDecision']);
const EXACT_IDENTITY_KEYS = Object.freeze(['dirty', 'headSha', 'originMainSha', 'treeSha']);
const CLAIM_REQUEST_KEYS = Object.freeze(['claimCeiling', 'globalScalarPass', 'includeCompleteProofSet', 'profileId', 'programVerdict', 'promoteProfiles', 'publishMode']);
const SUPPORTING_EVIDENCE_KEYS = Object.freeze(['evidenceClass', 'evidenceDigest', 'evidenceId']);
const NODE_PROOF_INPUT_KEYS = Object.freeze(['claimBindingDigest', 'evaluationSha', 'evaluationTreeSha', 'evidenceClass', 'nodeId', 'schemaVersion', 'state', 'supportingEvidence', 'terminalReceiptDigest', 'verdict']);
const NODE_PROOF_KEYS = Object.freeze([...NODE_PROOF_INPUT_KEYS, 'proofDigest']);
const METRICS_KEYS = Object.freeze(['comparison', 'observed', 'threshold', 'unit']);
const ASSURANCE_PROOF_INPUT_KEYS = Object.freeze(['artifactDigest', 'assuranceClass', 'evaluationSha', 'evaluationTreeSha', 'evidenceClass', 'metrics', 'oracleId', 'passed', 'required', 'schemaVersion', 'skipped', 'todos', 'verdict']);
const ASSURANCE_PROOF_KEYS = Object.freeze([...ASSURANCE_PROOF_INPUT_KEYS, 'proofDigest']);
const GATE_DECISION_INPUT_KEYS = Object.freeze(['authorityBindingDigest', 'decision', 'gateId', 'issuedAtUtc', 'missionDigest', 'schemaVersion', 'scopeNodeId']);
const GATE_DECISION_KEYS = Object.freeze([...GATE_DECISION_INPUT_KEYS, 'decisionDigest']);
const EXPORT_IR_INPUT_KEYS = Object.freeze(['assuranceProofSetDigest', 'evaluationSha', 'evaluationTreeSha', 'nodeProofSetDigest', 'packageId', 'profileId', 'schemaVersion']);
const EXPORT_IR_KEYS = Object.freeze([...EXPORT_IR_INPUT_KEYS, 'manifestDigest']);
const RECEIPT_KEYS = Object.freeze(['assuranceProofs', 'authority', 'claimDigest', 'claimRequest', 'code', 'exactIdentity', 'exportIr', 'featureManifestDigest', 'globalScalarPassForbidden', 'nodeProofs', 'nonClaims', 'ok', 'ownerGateDecision', 'productPackage', 'profileVerdict', 'programVerdict', 'schemaVersion', 'verdict']);

export class AtlasProductClaimError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'AtlasProductClaimError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') {
  throw new AtlasProductClaimError(code, detail);
}

function isPlainDataObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactDataObject(value, expectedKeys, code) {
  if (!isPlainDataObject(value)) fail(code, 'PLAIN_OBJECT_REQUIRED');
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== 'string')) fail(code, 'STRING_KEYS_REQUIRED');
  const actual = ownKeys.slice().sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(code, 'EXACT_KEYSET_REQUIRED');
  }
  for (const key of ownKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.enumerable !== true || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      fail(code, 'DATA_PROPERTIES_REQUIRED');
    }
  }
}

function assertDenseDataArray(value, code) {
  if (!Array.isArray(value) || Object.getOwnPropertySymbols(value).length !== 0) fail(code, 'ARRAY_REQUIRED');
  const names = Object.getOwnPropertyNames(value);
  if (names.length !== value.length + 1 || !names.includes('length')) fail(code, 'DENSE_ARRAY_REQUIRED');
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || descriptor.enumerable !== true || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      fail(code, 'DATA_ELEMENTS_REQUIRED');
    }
  }
}

function assertIdentifier(value, code, maximum = 512) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > maximum
    || value !== value.trim()
    || value !== value.normalize('NFC')
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) fail(code);
  return value;
}

function assertSha40(value, code) {
  if (typeof value !== 'string' || !SHA40_PATTERN.test(value)) fail(code);
  return value;
}

function assertDigest64(value, code) {
  if (typeof value !== 'string' || !DIGEST64_PATTERN.test(value)) fail(code);
  return value;
}

function assertInteger(value, code, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) fail(code);
  return value;
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function digestAtlasProductValue(value) {
  return hashCanonicalValue(value);
}

function normalizeExactIdentity(value) {
  assertExactDataObject(value, EXACT_IDENTITY_KEYS, 'E_ATLAS_PRODUCT_IDENTITY_INVALID');
  const identity = {
    headSha: assertSha40(value.headSha, 'E_ATLAS_PRODUCT_HEAD_INVALID'),
    originMainSha: assertSha40(value.originMainSha, 'E_ATLAS_PRODUCT_ORIGIN_INVALID'),
    treeSha: assertSha40(value.treeSha, 'E_ATLAS_PRODUCT_TREE_INVALID'),
    dirty: value.dirty,
  };
  if (identity.dirty !== false) fail('E_ATLAS_PRODUCT_WORKTREE_DIRTY');
  if (identity.originMainSha !== identity.headSha) fail('E_ATLAS_PRODUCT_ORIGIN_MISMATCH');
  return identity;
}

function normalizeClaimRequest(value) {
  assertExactDataObject(value, CLAIM_REQUEST_KEYS, 'E_ATLAS_PRODUCT_CLAIM_REQUEST_INVALID');
  assertDenseDataArray(value.promoteProfiles, 'E_ATLAS_PRODUCT_PROMOTION_LIST_INVALID');
  if (value.profileId !== ATLAS_PRODUCT_PROFILE_ID) fail('E_ATLAS_PRODUCT_PROFILE_IMPORT_FORBIDDEN');
  if (value.claimCeiling !== ATLAS_PRODUCT_CLAIM_CEILING) fail('E_ATLAS_PRODUCT_OVERCLAIM');
  if (value.programVerdict !== ATLAS_PRODUCT_PROGRAM_VERDICT || value.globalScalarPass !== false) {
    fail('E_ATLAS_PRODUCT_PROGRAM_SCALAR_PASS_FORBIDDEN');
  }
  if (value.includeCompleteProofSet !== true || value.publishMode !== 'EVIDENCE_PACKAGE_ONLY') {
    fail('E_ATLAS_PRODUCT_REQUEST_MODE_INVALID');
  }
  if (value.promoteProfiles.length !== 0) fail('E_ATLAS_PRODUCT_CROSS_PROFILE_PROMOTION_FORBIDDEN');
  return {
    profileId: value.profileId,
    claimCeiling: value.claimCeiling,
    programVerdict: value.programVerdict,
    globalScalarPass: value.globalScalarPass,
    includeCompleteProofSet: value.includeCompleteProofSet,
    publishMode: value.publishMode,
    promoteProfiles: [],
  };
}

function normalizeSupportingEvidence(value) {
  assertExactDataObject(value, SUPPORTING_EVIDENCE_KEYS, 'E_ATLAS_PRODUCT_SUPPORTING_EVIDENCE_INVALID');
  if (value.evidenceClass !== ATLAS_PRODUCT_REQUIRED_EVIDENCE_CLASS) fail('E_ATLAS_PRODUCT_EVIDENCE_CLASS_INVALID');
  return {
    evidenceId: assertIdentifier(value.evidenceId, 'E_ATLAS_PRODUCT_EVIDENCE_ID_INVALID'),
    evidenceClass: value.evidenceClass,
    evidenceDigest: assertDigest64(value.evidenceDigest, 'E_ATLAS_PRODUCT_EVIDENCE_DIGEST_INVALID'),
  };
}

export function createAtlasProductNodeProof(input) {
  assertExactDataObject(input, NODE_PROOF_INPUT_KEYS, 'E_ATLAS_PRODUCT_NODE_PROOF_INVALID');
  if (input.schemaVersion !== ATLAS_PRODUCT_NODE_PROOF_SCHEMA_VERSION) fail('E_ATLAS_PRODUCT_NODE_PROOF_SCHEMA');
  if (!REQUIRED_ATLAS_PRODUCT_NODE_IDS.includes(input.nodeId)) fail('E_ATLAS_PRODUCT_UNKNOWN_NODE', String(input.nodeId));
  if (input.state !== 'DONE' || input.verdict !== 'PASS') fail('E_ATLAS_PRODUCT_NODE_NOT_CLOSED', input.nodeId);
  if (input.evidenceClass !== ATLAS_PRODUCT_REQUIRED_EVIDENCE_CLASS) fail('E_ATLAS_PRODUCT_EVIDENCE_CLASS_INVALID');
  assertDenseDataArray(input.supportingEvidence, 'E_ATLAS_PRODUCT_SUPPORTING_EVIDENCE_ARRAY_INVALID');
  if (input.supportingEvidence.length === 0 || input.supportingEvidence.length > ATLAS_PRODUCT_MAX_SUPPORTING_EVIDENCE_PER_NODE) {
    fail('E_ATLAS_PRODUCT_SUPPORTING_EVIDENCE_BOUND', input.nodeId);
  }
  const supportingEvidence = input.supportingEvidence.map(normalizeSupportingEvidence)
    .sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
  if (new Set(supportingEvidence.map((row) => row.evidenceId)).size !== supportingEvidence.length) {
    fail('E_ATLAS_PRODUCT_DUPLICATE_SUPPORTING_EVIDENCE', input.nodeId);
  }
  const payload = {
    schemaVersion: input.schemaVersion,
    nodeId: input.nodeId,
    state: input.state,
    verdict: input.verdict,
    evidenceClass: input.evidenceClass,
    evaluationSha: assertSha40(input.evaluationSha, 'E_ATLAS_PRODUCT_NODE_EVALUATION_SHA_INVALID'),
    evaluationTreeSha: assertSha40(input.evaluationTreeSha, 'E_ATLAS_PRODUCT_NODE_EVALUATION_TREE_INVALID'),
    terminalReceiptDigest: assertDigest64(input.terminalReceiptDigest, 'E_ATLAS_PRODUCT_TERMINAL_DIGEST_INVALID'),
    claimBindingDigest: assertDigest64(input.claimBindingDigest, 'E_ATLAS_PRODUCT_CLAIM_BINDING_DIGEST_INVALID'),
    supportingEvidence,
  };
  return deepFreeze({ ...payload, proofDigest: digestAtlasProductValue(payload) });
}

function normalizeNodeProof(value) {
  assertExactDataObject(value, NODE_PROOF_KEYS, 'E_ATLAS_PRODUCT_NODE_PROOF_INVALID');
  const input = { ...value };
  delete input.proofDigest;
  const rebuilt = createAtlasProductNodeProof(input);
  if (value.proofDigest !== rebuilt.proofDigest) fail('E_ATLAS_PRODUCT_NODE_PROOF_DIGEST_MISMATCH', String(value.nodeId));
  return rebuilt;
}

function normalizeMetrics(value) {
  assertExactDataObject(value, METRICS_KEYS, 'E_ATLAS_PRODUCT_ASSURANCE_METRICS_INVALID');
  if (!['GTE', 'LTE'].includes(value.comparison)) fail('E_ATLAS_PRODUCT_ASSURANCE_COMPARISON_INVALID');
  const observed = assertInteger(value.observed, 'E_ATLAS_PRODUCT_ASSURANCE_OBSERVED_INVALID', ATLAS_PRODUCT_MAX_ASSURANCE_DENOMINATOR);
  const threshold = assertInteger(value.threshold, 'E_ATLAS_PRODUCT_ASSURANCE_THRESHOLD_INVALID', ATLAS_PRODUCT_MAX_ASSURANCE_DENOMINATOR);
  if ((value.comparison === 'LTE' && observed > threshold) || (value.comparison === 'GTE' && observed < threshold)) {
    fail('E_ATLAS_PRODUCT_ASSURANCE_THRESHOLD_NOT_MET');
  }
  return {
    comparison: value.comparison,
    observed,
    threshold,
    unit: assertIdentifier(value.unit, 'E_ATLAS_PRODUCT_ASSURANCE_UNIT_INVALID', 128),
  };
}

export function createAtlasProductAssuranceProof(input) {
  assertExactDataObject(input, ASSURANCE_PROOF_INPUT_KEYS, 'E_ATLAS_PRODUCT_ASSURANCE_PROOF_INVALID');
  if (input.schemaVersion !== ATLAS_PRODUCT_ASSURANCE_PROOF_SCHEMA_VERSION) fail('E_ATLAS_PRODUCT_ASSURANCE_SCHEMA');
  if (!REQUIRED_ATLAS_PRODUCT_ASSURANCE_CLASSES.includes(input.assuranceClass)) {
    fail('E_ATLAS_PRODUCT_UNKNOWN_ASSURANCE', String(input.assuranceClass));
  }
  if (input.verdict !== 'PASS' || input.evidenceClass !== ATLAS_PRODUCT_REQUIRED_EVIDENCE_CLASS) {
    fail('E_ATLAS_PRODUCT_ASSURANCE_NOT_CLOSED', input.assuranceClass);
  }
  const required = assertInteger(input.required, 'E_ATLAS_PRODUCT_ASSURANCE_DENOMINATOR_INVALID', ATLAS_PRODUCT_MAX_ASSURANCE_DENOMINATOR);
  const passed = assertInteger(input.passed, 'E_ATLAS_PRODUCT_ASSURANCE_PASSED_INVALID', ATLAS_PRODUCT_MAX_ASSURANCE_DENOMINATOR);
  const skipped = assertInteger(input.skipped, 'E_ATLAS_PRODUCT_ASSURANCE_SKIPPED_INVALID', ATLAS_PRODUCT_MAX_ASSURANCE_DENOMINATOR);
  const todos = assertInteger(input.todos, 'E_ATLAS_PRODUCT_ASSURANCE_TODOS_INVALID', ATLAS_PRODUCT_MAX_ASSURANCE_DENOMINATOR);
  if (required === 0 || passed !== required || skipped !== 0 || todos !== 0) {
    fail('E_ATLAS_PRODUCT_ASSURANCE_DENOMINATOR_NOT_CLOSED', input.assuranceClass);
  }
  const payload = {
    schemaVersion: input.schemaVersion,
    assuranceClass: input.assuranceClass,
    verdict: input.verdict,
    evidenceClass: input.evidenceClass,
    evaluationSha: assertSha40(input.evaluationSha, 'E_ATLAS_PRODUCT_ASSURANCE_EVALUATION_SHA_INVALID'),
    evaluationTreeSha: assertSha40(input.evaluationTreeSha, 'E_ATLAS_PRODUCT_ASSURANCE_EVALUATION_TREE_INVALID'),
    oracleId: assertIdentifier(input.oracleId, 'E_ATLAS_PRODUCT_ASSURANCE_ORACLE_INVALID'),
    artifactDigest: assertDigest64(input.artifactDigest, 'E_ATLAS_PRODUCT_ASSURANCE_ARTIFACT_DIGEST_INVALID'),
    required,
    passed,
    skipped,
    todos,
    metrics: normalizeMetrics(input.metrics),
  };
  return deepFreeze({ ...payload, proofDigest: digestAtlasProductValue(payload) });
}

function normalizeAssuranceProof(value) {
  assertExactDataObject(value, ASSURANCE_PROOF_KEYS, 'E_ATLAS_PRODUCT_ASSURANCE_PROOF_INVALID');
  const input = { ...value };
  delete input.proofDigest;
  const rebuilt = createAtlasProductAssuranceProof(input);
  if (value.proofDigest !== rebuilt.proofDigest) fail('E_ATLAS_PRODUCT_ASSURANCE_PROOF_DIGEST_MISMATCH', String(value.assuranceClass));
  return rebuilt;
}

export function createAtlasProfileReleaseDecision(input) {
  assertExactDataObject(input, GATE_DECISION_INPUT_KEYS, 'E_ATLAS_PRODUCT_GATE_DECISION_INVALID');
  if (input.schemaVersion !== ATLAS_PRODUCT_GATE_DECISION_SCHEMA_VERSION) fail('E_ATLAS_PRODUCT_GATE_SCHEMA');
  if (input.gateId !== ATLAS_PROFILE_RELEASE_GATE_ID || input.scopeNodeId !== ATLAS_PRODUCT_NODE_ID) {
    fail('E_ATLAS_PRODUCT_GATE_SCOPE_INVALID');
  }
  if (input.decision !== 'APPROVED') fail('E_ATLAS_PRODUCT_GATE_NOT_APPROVED');
  if (input.missionDigest !== ATLAS_PRODUCT_MISSION_DIGEST || input.authorityBindingDigest !== ATLAS_PRODUCT_AUTHORITY_BINDING_DIGEST) {
    fail('E_ATLAS_PRODUCT_GATE_AUTHORITY_INVALID');
  }
  if (typeof input.issuedAtUtc !== 'string' || !ISO_UTC_PATTERN.test(input.issuedAtUtc)) fail('E_ATLAS_PRODUCT_GATE_TIME_INVALID');
  const payload = {
    schemaVersion: input.schemaVersion,
    gateId: input.gateId,
    decision: input.decision,
    scopeNodeId: input.scopeNodeId,
    missionDigest: input.missionDigest,
    authorityBindingDigest: input.authorityBindingDigest,
    issuedAtUtc: input.issuedAtUtc,
  };
  return deepFreeze({ ...payload, decisionDigest: digestAtlasProductValue(payload) });
}

function normalizeGateDecision(value) {
  assertExactDataObject(value, GATE_DECISION_KEYS, 'E_ATLAS_PRODUCT_GATE_DECISION_INVALID');
  const input = { ...value };
  delete input.decisionDigest;
  const rebuilt = createAtlasProfileReleaseDecision(input);
  if (value.decisionDigest !== rebuilt.decisionDigest) fail('E_ATLAS_PRODUCT_GATE_DECISION_DIGEST_MISMATCH');
  return rebuilt;
}

export function createAtlasProductExportIr(input) {
  assertExactDataObject(input, EXPORT_IR_INPUT_KEYS, 'E_ATLAS_PRODUCT_EXPORT_IR_INVALID');
  if (input.schemaVersion !== ATLAS_PRODUCT_EXPORT_IR_SCHEMA_VERSION) fail('E_ATLAS_PRODUCT_EXPORT_IR_SCHEMA');
  if (input.profileId !== ATLAS_PRODUCT_PROFILE_ID) fail('E_ATLAS_PRODUCT_EXPORT_IR_PROFILE_INVALID');
  const payload = {
    schemaVersion: input.schemaVersion,
    packageId: assertIdentifier(input.packageId, 'E_ATLAS_PRODUCT_EXPORT_IR_PACKAGE_ID_INVALID'),
    profileId: input.profileId,
    evaluationSha: assertSha40(input.evaluationSha, 'E_ATLAS_PRODUCT_EXPORT_IR_SHA_INVALID'),
    evaluationTreeSha: assertSha40(input.evaluationTreeSha, 'E_ATLAS_PRODUCT_EXPORT_IR_TREE_INVALID'),
    nodeProofSetDigest: assertDigest64(input.nodeProofSetDigest, 'E_ATLAS_PRODUCT_EXPORT_IR_NODE_SET_DIGEST_INVALID'),
    assuranceProofSetDigest: assertDigest64(input.assuranceProofSetDigest, 'E_ATLAS_PRODUCT_EXPORT_IR_ASSURANCE_SET_DIGEST_INVALID'),
  };
  return deepFreeze({ ...payload, manifestDigest: digestAtlasProductValue(payload) });
}

function normalizeExportIr(value) {
  assertExactDataObject(value, EXPORT_IR_KEYS, 'E_ATLAS_PRODUCT_EXPORT_IR_INVALID');
  const input = { ...value };
  delete input.manifestDigest;
  const rebuilt = createAtlasProductExportIr(input);
  if (value.manifestDigest !== rebuilt.manifestDigest) fail('E_ATLAS_PRODUCT_EXPORT_IR_DIGEST_MISMATCH');
  return rebuilt;
}

function normalizeCompleteNodeProofs(value, identity) {
  assertDenseDataArray(value, 'E_ATLAS_PRODUCT_NODE_PROOF_ARRAY_INVALID');
  if (value.length !== REQUIRED_ATLAS_PRODUCT_NODE_IDS.length) fail('E_ATLAS_PRODUCT_NODE_PROOF_DENOMINATOR');
  const proofs = value.map(normalizeNodeProof).sort((left, right) => left.nodeId.localeCompare(right.nodeId));
  if (new Set(proofs.map((proof) => proof.nodeId)).size !== proofs.length) fail('E_ATLAS_PRODUCT_DUPLICATE_NODE');
  if (!sameArray(proofs.map((proof) => proof.nodeId), REQUIRED_ATLAS_PRODUCT_NODE_IDS)) fail('E_ATLAS_PRODUCT_NODE_PROOF_SET_MISMATCH');
  let supportingEvidenceDenominator = 0;
  for (const proof of proofs) {
    if (proof.evaluationSha !== identity.headSha || proof.evaluationTreeSha !== identity.treeSha) {
      fail('E_ATLAS_PRODUCT_NODE_PROOF_IDENTITY_STALE', proof.nodeId);
    }
    supportingEvidenceDenominator += proof.supportingEvidence.length;
  }
  if (supportingEvidenceDenominator === 0 || supportingEvidenceDenominator > ATLAS_PRODUCT_MAX_SUPPORTING_EVIDENCE_TOTAL) {
    fail('E_ATLAS_PRODUCT_SUPPORTING_EVIDENCE_TOTAL_BOUND');
  }
  return { proofs, supportingEvidenceDenominator };
}

function normalizeCompleteAssuranceProofs(value, identity) {
  assertDenseDataArray(value, 'E_ATLAS_PRODUCT_ASSURANCE_PROOF_ARRAY_INVALID');
  if (value.length !== REQUIRED_ATLAS_PRODUCT_ASSURANCE_CLASSES.length) fail('E_ATLAS_PRODUCT_ASSURANCE_PROOF_DENOMINATOR');
  const proofs = value.map(normalizeAssuranceProof).sort((left, right) => left.assuranceClass.localeCompare(right.assuranceClass));
  if (new Set(proofs.map((proof) => proof.assuranceClass)).size !== proofs.length) fail('E_ATLAS_PRODUCT_DUPLICATE_ASSURANCE');
  if (!sameArray(proofs.map((proof) => proof.assuranceClass), REQUIRED_ATLAS_PRODUCT_ASSURANCE_CLASSES)) {
    fail('E_ATLAS_PRODUCT_ASSURANCE_PROOF_SET_MISMATCH');
  }
  for (const proof of proofs) {
    if (proof.evaluationSha !== identity.headSha || proof.evaluationTreeSha !== identity.treeSha) {
      fail('E_ATLAS_PRODUCT_ASSURANCE_PROOF_IDENTITY_STALE', proof.assuranceClass);
    }
  }
  return proofs;
}

function buildAtlasProductClaim(input) {
  assertExactDataObject(input, INPUT_KEYS, 'E_ATLAS_PRODUCT_INPUT_INVALID');
  const exactIdentity = normalizeExactIdentity(input.exactIdentity);
  const claimRequest = normalizeClaimRequest(input.claimRequest);
  const ownerGateDecision = normalizeGateDecision(input.ownerGateDecision);
  const normalizedNodes = normalizeCompleteNodeProofs(input.nodeProofs, exactIdentity);
  const assuranceProofs = normalizeCompleteAssuranceProofs(input.assuranceProofs, exactIdentity);
  const nodeProofSetDigest = digestAtlasProductValue(normalizedNodes.proofs);
  const assuranceProofSetDigest = digestAtlasProductValue(assuranceProofs);
  const exportIr = normalizeExportIr(input.exportIr);
  if (exportIr.evaluationSha !== exactIdentity.headSha || exportIr.evaluationTreeSha !== exactIdentity.treeSha) {
    fail('E_ATLAS_PRODUCT_EXPORT_IR_IDENTITY_STALE');
  }
  if (exportIr.nodeProofSetDigest !== nodeProofSetDigest || exportIr.assuranceProofSetDigest !== assuranceProofSetDigest) {
    fail('E_ATLAS_PRODUCT_EXPORT_IR_CROSS_BINDING_MISMATCH');
  }
  const featureManifestDigest = digestAtlasProductValue(ATLAS_PRODUCT_FEATURE_INTEGRATION_MANIFEST_V1);
  const payload = {
    ok: true,
    schemaVersion: ATLAS_PRODUCT_CLAIM_SCHEMA_VERSION,
    verdict: 'PASS',
    code: 'R24_WP507_ATLAS_PRODUCT_CLAIM_COMPILED',
    exactIdentity,
    claimRequest,
    ownerGateDecision,
    nodeProofs: normalizedNodes.proofs,
    assuranceProofs,
    exportIr,
    profileVerdict: {
      profileId: ATLAS_PRODUCT_PROFILE_ID,
      verdict: ATLAS_PRODUCT_PROFILE_VERDICT,
      claimCeiling: ATLAS_PRODUCT_CLAIM_CEILING,
      requiredNodeIds: [...REQUIRED_ATLAS_PRODUCT_NODE_IDS],
      requiredNodeCount: REQUIRED_ATLAS_PRODUCT_NODE_IDS.length,
      closedNodeCount: normalizedNodes.proofs.length,
      nodeProofSetDigest,
      requiredAssuranceClasses: [...REQUIRED_ATLAS_PRODUCT_ASSURANCE_CLASSES],
      requiredAssuranceCount: REQUIRED_ATLAS_PRODUCT_ASSURANCE_CLASSES.length,
      closedAssuranceCount: assuranceProofs.length,
      assuranceProofSetDigest,
      supportingEvidenceDenominator: normalizedNodes.supportingEvidenceDenominator,
    },
    productPackage: {
      packageId: exportIr.packageId,
      exportIrManifestDigest: exportIr.manifestDigest,
      nodeProofSetDigest,
      assuranceProofSetDigest,
      evidencePackageOnly: true,
    },
    authority: {
      commandDispatch: false,
      externalEffect: false,
      externalProvider: false,
      network: false,
      notarization: false,
      payments: false,
      persistence: false,
      productMutation: false,
      productionRelease: false,
      publicDistribution: false,
      publicRelease: false,
      rendererWiring: false,
      secrets: false,
      signing: false,
      userDocumentMutation: false,
    },
    featureManifestDigest,
    programVerdict: ATLAS_PRODUCT_PROGRAM_VERDICT,
    globalScalarPassForbidden: true,
    nonClaims: [...NON_CLAIMS],
  };
  return deepFreeze({ ...payload, claimDigest: digestAtlasProductValue(payload) });
}

export function compileAtlasProductClaim(input) {
  return buildAtlasProductClaim(input);
}

export function verifyAtlasProductClaim(receipt) {
  assertExactDataObject(receipt, RECEIPT_KEYS, 'E_ATLAS_PRODUCT_RECEIPT_INVALID');
  const rebuilt = buildAtlasProductClaim({
    exactIdentity: receipt.exactIdentity,
    claimRequest: receipt.claimRequest,
    ownerGateDecision: receipt.ownerGateDecision,
    nodeProofs: receipt.nodeProofs,
    assuranceProofs: receipt.assuranceProofs,
    exportIr: receipt.exportIr,
  });
  if (receipt.claimDigest !== rebuilt.claimDigest || digestAtlasProductValue(receipt) !== digestAtlasProductValue(rebuilt)) {
    fail('E_ATLAS_PRODUCT_CLAIM_DIGEST_MISMATCH');
  }
  return rebuilt;
}
