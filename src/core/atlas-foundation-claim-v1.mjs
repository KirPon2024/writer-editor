import { hashCanonicalValue } from './browser-safe-hash.mjs';

export const ATLAS_FOUNDATION_CLAIM_SCHEMA_VERSION = 'yalken.r24.atlasFoundationClaim.v1';
export const ATLAS_FOUNDATION_PROOF_SCHEMA_VERSION = 'yalken.r24.atlasFoundationProof.v1';
export const ATLAS_FOUNDATION_NODE_ID = 'WP-404_ATLAS_FOUNDATION_CLAIM';
export const ATLAS_FOUNDATION_PROFILE_ID = 'ATLAS_FOUNDATION';
export const ATLAS_FOUNDATION_CLAIM_CEILING = 'NODE_AND_SELECTED_PROFILE_ONLY';
export const ATLAS_FOUNDATION_PROFILE_VERDICT = 'ATLAS_FOUNDATION_EVIDENCE_BOUND_BY_WRITER_V0_AND_WP400_WP403';
export const WRITER_V0_SCHEMA_VERSION = 'yalken.r24.v0.writer-claim-compiler.receipt.v1';
export const WRITER_V0_STAGE_ID = 'V0_WRITER_CLAIM_COMPILER';
export const WRITER_V0_PROFILE_ID = 'WRITER_CORE';
export const WRITER_V0_PROFILE_VERDICT = 'WRITER_CORE_EVIDENCE_BOUND_BY_R24_EXACT_HEAD_PREFIX';
export const REQUIRED_EVIDENCE_CLASS = 'INDEPENDENT_EXACT_HEAD';
export const PROGRAM_VERDICT = 'NEEDS_MORE_EVIDENCE';
export const REQUIRED_FOUNDATION_NODE_IDS = Object.freeze([
  'WP-400_ANCHOR_LINEAGE',
  'WP-401_BOOK_SNAPSHOT',
  'WP-402_PROJECTOR_KERNEL',
  'WP-403_DECISION_SUBSTRATE',
]);
export const ATLAS_FOUNDATION_MAX_SUPPORTING_EVIDENCE_PER_NODE = 2_048;
export const ATLAS_FOUNDATION_MAX_SUPPORTING_EVIDENCE_TOTAL = 8_192;

const SHA40_PATTERN = /^[a-f0-9]{40}$/u;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const INPUT_KEYS = Object.freeze([
  'claimRequest',
  'exactIdentity',
  'foundationProofs',
  'writerV0Receipt',
  'writerV0ReceiptDigest',
]);
const EXACT_IDENTITY_KEYS = Object.freeze(['dirty', 'headSha', 'originMainSha', 'treeSha']);
const CLAIM_REQUEST_KEYS = Object.freeze([
  'claimCeiling',
  'globalScalarPass',
  'includeWriterV0',
  'profileId',
  'programVerdict',
  'promoteProfiles',
]);
const WRITER_RECEIPT_KEYS = Object.freeze([
  'code',
  'exactIdentity',
  'generatedAt',
  'globalScalarPassForbidden',
  'nonClaims',
  'ok',
  'optionalProfilesExcluded',
  'profileVerdict',
  'programVerdict',
  'schemaVersion',
  'selectedProfiles',
  'verdict',
  'workflow',
]);
const WRITER_PROFILE_KEYS = Object.freeze([
  'claimCeiling',
  'closedStageCount',
  'gateEvidenceDigest',
  'profileId',
  'requiredEvidenceClass',
  'requiredStageCount',
  'requiredStageIds',
  'verdict',
]);
const FOUNDATION_PROOF_KEYS = Object.freeze([
  'claimBindingDigest',
  'evaluationSha',
  'evaluationTreeSha',
  'evidenceClass',
  'nodeId',
  'proofDigest',
  'schemaVersion',
  'state',
  'supportingEvidence',
  'terminalReceiptDigest',
  'verdict',
]);
const SUPPORTING_EVIDENCE_KEYS = Object.freeze(['evidenceClass', 'evidenceDigest', 'evidenceId']);
const RECEIPT_KEYS = Object.freeze([
  'authority',
  'claimDigest',
  'code',
  'exactIdentity',
  'featureManifestDigest',
  'foundation',
  'globalScalarPassForbidden',
  'nonClaims',
  'ok',
  'profileVerdict',
  'programVerdict',
  'schemaVersion',
  'verdict',
  'writerInheritance',
]);

const NON_CLAIMS = Object.freeze([
  'NO_PROGRAM_DONE',
  'NO_GLOBAL_SCALAR_PASS',
  'NO_WRITER_V0_RECOMPUTATION',
  'NO_WRITER_CORE_PROMOTION',
  'NO_LATER_ATLAS_PRODUCT_NODE_PROMOTION',
  'NO_WORD_OR_PACKAGE_PROFILE_VERDICT',
  'NO_RELEASE_READINESS',
  'NO_PRODUCT_RUNTIME_MUTATION',
  'NO_PERSISTENCE_OR_RENDERER_WIRING',
  'NO_RUNTIME_NETWORK_OR_PLATFORM_EFFECT',
]);

export const ATLAS_FOUNDATION_FEATURE_INTEGRATION_MANIFEST_V1 = Object.freeze({
  featureId: 'yalken.atlas.foundationClaim.v1',
  featureVersion: 1,
  integrationMode: 'EXISTING_SEAM:BOUND_TO_CURRENT_APPROVED_ENTRYPOINTS',
  domainOwner: 'DERIVED_PROJECTOR_AUTHORITY',
  authoritativeData: 'NOT_APPLICABLE_DERIVED_CLAIM_ONLY',
  derivedData: 'WRITER_V0_AND_WP400_WP403_EVIDENCE_BOUND_FOUNDATION_VERDICT',
  commandIds: ['NOT_APPLICABLE_NO_COMMAND'],
  eventTypes: ['NOT_APPLICABLE_NO_EVENT'],
  queryIds: ['atlas.foundationClaim.compile.v1'],
  productProjectionIds: ['atlas.foundationClaim.v1'],
  capabilityIds: ['NOT_APPLICABLE_NO_PRODUCT_CAPABILITY'],
  authorityMap: 'READ_ONLY_DERIVED_PROJECTOR_NO_PRODUCT_WRITE',
  identityKeys: ['headSha', 'treeSha', 'writerV0ReceiptDigest', 'foundationProofSetDigest'],
  revisionPolicy: 'EXACT_HEAD_AND_TREE_ONLY_STALE_REJECTED',
  writePath: 'PURE_RETURN_VALUE_ONLY',
  readPath: 'VERIFIED_WRITER_V0_RECEIPT_AND_COMPLETE_FOUNDATION_PROOF_SET',
  requiredProductPorts: ['NOT_APPLICABLE_NO_EXTERNAL_EFFECT'],
  requiredDesignOsPorts: ['NOT_APPLICABLE_NO_INTERFACE_PLANE_CHANGE'],
  adapterRequirements: ['NOT_APPLICABLE_NO_ADAPTER'],
  surfaceManifests: ['NOT_APPLICABLE_NO_UI_SURFACE'],
  slotRequirements: ['NOT_APPLICABLE_NO_UI_SLOT'],
  supportedWorkspaces: ['NOT_APPLICABLE_NO_UI_WORKSPACE'],
  platformAvailability: 'PLATFORM_NEUTRAL_PURE_MODULE',
  accessibilityRequirements: 'NOT_APPLICABLE_NO_VISUAL_OR_INTERACTIVE_SURFACE',
  fallbacks: ['FAIL_CLOSED_TO_NEEDS_MORE_EVIDENCE'],
  stateClasses: ['DERIVED_STATE'],
  persistenceClass: 'NOT_PERSISTED_BY_THIS_MODULE',
  migrations: ['NOT_APPLICABLE_NO_STORED_SCHEMA'],
  recovery: 'RECOMPILE_FROM_VERIFIED_EXACT_IDENTITY_INPUTS',
  rollback: 'REVERT_BOUNDED_MODULE_AND_TEST_COMMIT',
  performanceBudget: {
    maximumFoundationNodes: REQUIRED_FOUNDATION_NODE_IDS.length,
    maximumSupportingEvidencePerNode: ATLAS_FOUNDATION_MAX_SUPPORTING_EVIDENCE_PER_NODE,
    maximumSupportingEvidenceTotal: ATLAS_FOUNDATION_MAX_SUPPORTING_EVIDENCE_TOTAL,
  },
  securityBoundary: 'STRICT_OWN_DATA_NO_ACCESSORS_SYMBOLS_OR_EXTERNAL_IO',
  lifecycle: 'ON_DEMAND_PURE_COMPILATION_ONLY',
  negativeBypassChecks: [
    'STALE_HEAD_OR_TREE_REJECTED',
    'MISSING_DUPLICATE_OR_UNKNOWN_NODE_REJECTED',
    'TAMPERED_WRITER_OR_PROOF_DIGEST_REJECTED',
    'GLOBAL_OR_CROSS_PROFILE_PROMOTION_REJECTED',
  ],
  evidenceBindings: [
    'WRITER_V0_RECEIPT_DIGEST',
    'WP400_WP403_PROOF_SET_DIGEST',
    'EXACT_HEAD_AND_TREE',
  ],
  currentReality: 'PURE_FOUNDATION_CLAIM_COMPILER_ONLY_NO_RUNTIME_WIRING',
});

export class AtlasFoundationClaimError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'AtlasFoundationClaimError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') {
  throw new AtlasFoundationClaimError(code, detail);
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
  if (actual.length !== expectedKeys.length || actual.some((key, index) => key !== expectedKeys[index])) {
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

function assertIdentifier(value, code, maxLength = 512) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > maxLength
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

function assertDigest(value, code) {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) fail(code);
  return value;
}

function digestCanonical(value) {
  return `sha256:${hashCanonicalValue(value)}`;
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function normalizeExactIdentity(value, code = 'E_ATLAS_FOUNDATION_IDENTITY_INVALID') {
  assertExactDataObject(value, EXACT_IDENTITY_KEYS, code);
  const identity = {
    headSha: assertSha40(value.headSha, 'E_ATLAS_FOUNDATION_HEAD_INVALID'),
    originMainSha: assertSha40(value.originMainSha, 'E_ATLAS_FOUNDATION_ORIGIN_INVALID'),
    treeSha: assertSha40(value.treeSha, 'E_ATLAS_FOUNDATION_TREE_INVALID'),
    dirty: value.dirty,
  };
  if (identity.dirty !== false) fail('E_ATLAS_FOUNDATION_WORKTREE_DIRTY');
  if (identity.originMainSha !== identity.headSha) fail('E_ATLAS_FOUNDATION_ORIGIN_MISMATCH');
  return Object.freeze(identity);
}

function normalizeClaimRequest(value) {
  assertExactDataObject(value, CLAIM_REQUEST_KEYS, 'E_ATLAS_FOUNDATION_CLAIM_REQUEST_INVALID');
  assertDenseDataArray(value.promoteProfiles, 'E_ATLAS_FOUNDATION_PROMOTION_LIST_INVALID');
  if (value.profileId !== ATLAS_FOUNDATION_PROFILE_ID) fail('E_ATLAS_FOUNDATION_PROFILE_IMPORT_FORBIDDEN');
  if (value.claimCeiling !== ATLAS_FOUNDATION_CLAIM_CEILING) fail('E_ATLAS_FOUNDATION_OVERCLAIM');
  if (value.programVerdict !== PROGRAM_VERDICT || value.globalScalarPass !== false) {
    fail('E_ATLAS_FOUNDATION_PROGRAM_SCALAR_PASS_FORBIDDEN');
  }
  if (value.includeWriterV0 !== true) fail('E_ATLAS_FOUNDATION_WRITER_V0_INHERITANCE_REQUIRED');
  if (value.promoteProfiles.length !== 0) fail('E_ATLAS_FOUNDATION_PROFILE_PROMOTION_FORBIDDEN');
  return value;
}

function normalizeWriterV0Receipt(receipt, suppliedDigest, exactIdentity) {
  assertExactDataObject(receipt, WRITER_RECEIPT_KEYS, 'E_ATLAS_FOUNDATION_WRITER_RECEIPT_INVALID');
  assertExactDataObject(receipt.profileVerdict, WRITER_PROFILE_KEYS, 'E_ATLAS_FOUNDATION_WRITER_PROFILE_INVALID');
  const writerIdentity = normalizeExactIdentity(receipt.exactIdentity, 'E_ATLAS_FOUNDATION_WRITER_IDENTITY_INVALID');
  assertDigest(suppliedDigest, 'E_ATLAS_FOUNDATION_WRITER_RECEIPT_DIGEST_INVALID');
  if (suppliedDigest !== digestCanonical(receipt)) fail('E_ATLAS_FOUNDATION_WRITER_RECEIPT_DIGEST_MISMATCH');
  if (
    writerIdentity.headSha !== exactIdentity.headSha
    || writerIdentity.originMainSha !== exactIdentity.originMainSha
    || writerIdentity.treeSha !== exactIdentity.treeSha
  ) fail('E_ATLAS_FOUNDATION_WRITER_IDENTITY_STALE');
  if (
    receipt.schemaVersion !== WRITER_V0_SCHEMA_VERSION
    || receipt.ok !== true
    || receipt.verdict !== 'PASS'
    || receipt.code !== 'R24_V0_PROFILE_VERDICT_COMPILED'
  ) fail('E_ATLAS_FOUNDATION_WRITER_VERDICT_INVALID');
  if (receipt.programVerdict !== PROGRAM_VERDICT || receipt.globalScalarPassForbidden !== true) {
    fail('E_ATLAS_FOUNDATION_WRITER_OVERCLAIM');
  }
  assertDenseDataArray(receipt.selectedProfiles, 'E_ATLAS_FOUNDATION_WRITER_PROFILES_INVALID');
  if (!sameArray(receipt.selectedProfiles, ['SHARED_ASSURANCE', WRITER_V0_PROFILE_ID])) {
    fail('E_ATLAS_FOUNDATION_WRITER_PROFILE_SCOPE');
  }
  assertDenseDataArray(receipt.optionalProfilesExcluded, 'E_ATLAS_FOUNDATION_WRITER_OPTIONAL_PROFILES_INVALID');
  if (!sameArray(receipt.optionalProfilesExcluded, ['ATLAS_MAPS_DERIVED', 'WORD_ROUNDTRIP', 'PACKAGED_RELEASE_SECURITY'])) {
    fail('E_ATLAS_FOUNDATION_WRITER_OPTIONAL_PROFILE_SCOPE');
  }
  const profile = receipt.profileVerdict;
  assertDenseDataArray(profile.requiredStageIds, 'E_ATLAS_FOUNDATION_WRITER_STAGE_IDS_INVALID');
  if (new Set(profile.requiredStageIds).size !== profile.requiredStageIds.length || profile.requiredStageIds.length === 0) {
    fail('E_ATLAS_FOUNDATION_WRITER_STAGE_DENOMINATOR');
  }
  if (
    profile.profileId !== WRITER_V0_PROFILE_ID
    || profile.verdict !== WRITER_V0_PROFILE_VERDICT
    || profile.claimCeiling !== 'PROFILE_VERDICT_ONLY'
    || profile.requiredEvidenceClass !== REQUIRED_EVIDENCE_CLASS
    || profile.requiredStageCount !== profile.requiredStageIds.length
    || profile.closedStageCount !== profile.requiredStageCount
  ) fail('E_ATLAS_FOUNDATION_WRITER_PROFILE_VERDICT_INVALID');
  assertDigest(`sha256:${profile.gateEvidenceDigest}`, 'E_ATLAS_FOUNDATION_WRITER_GATE_DIGEST_INVALID');
  assertDenseDataArray(receipt.nonClaims, 'E_ATLAS_FOUNDATION_WRITER_NON_CLAIMS_INVALID');
  for (const required of ['NO_PROGRAM_DONE', 'NO_GLOBAL_SCALAR_PASS', 'NO_ATLAS_PROFILE_VERDICT']) {
    if (!receipt.nonClaims.includes(required)) fail('E_ATLAS_FOUNDATION_WRITER_NON_CLAIM_MISSING', required);
  }
  return Object.freeze({
    stageId: WRITER_V0_STAGE_ID,
    receiptSchemaVersion: receipt.schemaVersion,
    receiptDigest: suppliedDigest,
    profileId: profile.profileId,
    profileVerdict: profile.verdict,
    exactIdentityDigest: digestCanonical(writerIdentity),
    gateEvidenceDigest: `sha256:${profile.gateEvidenceDigest}`,
    requiredStageCount: profile.requiredStageCount,
    closedStageCount: profile.closedStageCount,
  });
}

function normalizeSupportingEvidence(value) {
  assertDenseDataArray(value, 'E_ATLAS_FOUNDATION_SUPPORTING_EVIDENCE_INVALID');
  if (value.length === 0 || value.length > ATLAS_FOUNDATION_MAX_SUPPORTING_EVIDENCE_PER_NODE) {
    fail('E_ATLAS_FOUNDATION_SUPPORTING_EVIDENCE_BOUND');
  }
  const normalized = value.map((row) => {
    assertExactDataObject(row, SUPPORTING_EVIDENCE_KEYS, 'E_ATLAS_FOUNDATION_SUPPORTING_EVIDENCE_ROW_INVALID');
    return Object.freeze({
      evidenceId: assertIdentifier(row.evidenceId, 'E_ATLAS_FOUNDATION_EVIDENCE_ID_INVALID'),
      evidenceClass: assertIdentifier(row.evidenceClass, 'E_ATLAS_FOUNDATION_EVIDENCE_CLASS_INVALID', 100),
      evidenceDigest: assertDigest(row.evidenceDigest, 'E_ATLAS_FOUNDATION_EVIDENCE_DIGEST_INVALID'),
    });
  }).sort((left, right) => left.evidenceId.localeCompare(right.evidenceId, 'en', { sensitivity: 'variant' }));
  if (new Set(normalized.map((row) => row.evidenceId)).size !== normalized.length) {
    fail('E_ATLAS_FOUNDATION_SUPPORTING_EVIDENCE_DUPLICATE');
  }
  return Object.freeze(normalized);
}

function proofIdentity(proof) {
  return {
    schemaVersion: proof.schemaVersion,
    nodeId: proof.nodeId,
    state: proof.state,
    verdict: proof.verdict,
    evidenceClass: proof.evidenceClass,
    evaluationSha: proof.evaluationSha,
    evaluationTreeSha: proof.evaluationTreeSha,
    terminalReceiptDigest: proof.terminalReceiptDigest,
    claimBindingDigest: proof.claimBindingDigest,
    supportingEvidence: proof.supportingEvidence,
  };
}

export function createAtlasFoundationProof(value) {
  const expected = new Set(FOUNDATION_PROOF_KEYS.filter((key) => key !== 'proofDigest'));
  if (!isPlainDataObject(value)) fail('E_ATLAS_FOUNDATION_PROOF_INVALID', 'PLAIN_OBJECT_REQUIRED');
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string') || keys.length !== expected.size || keys.some((key) => !expected.has(key))) {
    fail('E_ATLAS_FOUNDATION_PROOF_INVALID', 'EXACT_INPUT_KEYSET_REQUIRED');
  }
  const proof = {
    schemaVersion: value.schemaVersion,
    nodeId: assertIdentifier(value.nodeId, 'E_ATLAS_FOUNDATION_NODE_ID_INVALID', 100),
    state: value.state,
    verdict: value.verdict,
    evidenceClass: value.evidenceClass,
    evaluationSha: assertSha40(value.evaluationSha, 'E_ATLAS_FOUNDATION_PROOF_HEAD_INVALID'),
    evaluationTreeSha: assertSha40(value.evaluationTreeSha, 'E_ATLAS_FOUNDATION_PROOF_TREE_INVALID'),
    terminalReceiptDigest: assertDigest(value.terminalReceiptDigest, 'E_ATLAS_FOUNDATION_TERMINAL_DIGEST_INVALID'),
    claimBindingDigest: assertDigest(value.claimBindingDigest, 'E_ATLAS_FOUNDATION_CLAIM_BINDING_DIGEST_INVALID'),
    supportingEvidence: normalizeSupportingEvidence(value.supportingEvidence),
  };
  if (proof.schemaVersion !== ATLAS_FOUNDATION_PROOF_SCHEMA_VERSION) fail('E_ATLAS_FOUNDATION_PROOF_SCHEMA');
  if (!REQUIRED_FOUNDATION_NODE_IDS.includes(proof.nodeId)) fail('E_ATLAS_FOUNDATION_UNKNOWN_NODE', proof.nodeId);
  if (proof.state !== 'DONE' || proof.verdict !== 'PASS' || proof.evidenceClass !== REQUIRED_EVIDENCE_CLASS) {
    fail('E_ATLAS_FOUNDATION_PROOF_NOT_CLOSED', proof.nodeId);
  }
  return Object.freeze({ ...proof, proofDigest: digestCanonical(proofIdentity(proof)) });
}

function normalizeFoundationProof(proof, exactIdentity) {
  assertExactDataObject(proof, FOUNDATION_PROOF_KEYS, 'E_ATLAS_FOUNDATION_PROOF_INVALID');
  const rebuilt = createAtlasFoundationProof(proofIdentity(proof));
  if (proof.proofDigest !== rebuilt.proofDigest) fail('E_ATLAS_FOUNDATION_PROOF_DIGEST_MISMATCH', proof.nodeId);
  if (proof.evaluationSha !== exactIdentity.headSha || proof.evaluationTreeSha !== exactIdentity.treeSha) {
    fail('E_ATLAS_FOUNDATION_PROOF_IDENTITY_STALE', proof.nodeId);
  }
  return rebuilt;
}

function normalizeFoundationProofSet(value, exactIdentity) {
  assertDenseDataArray(value, 'E_ATLAS_FOUNDATION_PROOF_SET_INVALID');
  if (value.length !== REQUIRED_FOUNDATION_NODE_IDS.length) fail('E_ATLAS_FOUNDATION_PROOF_DENOMINATOR');
  const proofs = value.map((proof) => normalizeFoundationProof(proof, exactIdentity))
    .sort((left, right) => REQUIRED_FOUNDATION_NODE_IDS.indexOf(left.nodeId) - REQUIRED_FOUNDATION_NODE_IDS.indexOf(right.nodeId));
  if (new Set(proofs.map((proof) => proof.nodeId)).size !== proofs.length) fail('E_ATLAS_FOUNDATION_DUPLICATE_NODE');
  if (!sameArray(proofs.map((proof) => proof.nodeId), REQUIRED_FOUNDATION_NODE_IDS)) {
    fail('E_ATLAS_FOUNDATION_REQUIRED_NODE_MISSING');
  }
  const supportingEvidenceDenominator = proofs.reduce((sum, proof) => sum + proof.supportingEvidence.length, 0);
  if (supportingEvidenceDenominator > ATLAS_FOUNDATION_MAX_SUPPORTING_EVIDENCE_TOTAL) {
    fail('E_ATLAS_FOUNDATION_SUPPORTING_EVIDENCE_TOTAL_BOUND');
  }
  return Object.freeze({
    requiredNodeIds: REQUIRED_FOUNDATION_NODE_IDS,
    requiredNodeCount: REQUIRED_FOUNDATION_NODE_IDS.length,
    closedNodeCount: proofs.length,
    nodeProofs: Object.freeze(proofs),
    supportingEvidenceDenominator,
    proofSetDigest: digestCanonical(proofs.map((proof) => ({ nodeId: proof.nodeId, proofDigest: proof.proofDigest }))),
  });
}

function claimDigestInput(receipt) {
  const { claimDigest, ...identity } = receipt;
  return identity;
}

export function compileAtlasFoundationClaim(input) {
  assertExactDataObject(input, INPUT_KEYS, 'E_ATLAS_FOUNDATION_INPUT_INVALID');
  const exactIdentity = normalizeExactIdentity(input.exactIdentity);
  normalizeClaimRequest(input.claimRequest);
  const writerInheritance = normalizeWriterV0Receipt(input.writerV0Receipt, input.writerV0ReceiptDigest, exactIdentity);
  const foundation = normalizeFoundationProofSet(input.foundationProofs, exactIdentity);
  const featureManifestDigest = digestCanonical(ATLAS_FOUNDATION_FEATURE_INTEGRATION_MANIFEST_V1);
  const profileVerdict = Object.freeze({
    nodeId: ATLAS_FOUNDATION_NODE_ID,
    profileId: ATLAS_FOUNDATION_PROFILE_ID,
    verdict: ATLAS_FOUNDATION_PROFILE_VERDICT,
    claimCeiling: ATLAS_FOUNDATION_CLAIM_CEILING,
    writerInheritanceDigest: writerInheritance.receiptDigest,
    foundationProofSetDigest: foundation.proofSetDigest,
  });
  const receipt = {
    schemaVersion: ATLAS_FOUNDATION_CLAIM_SCHEMA_VERSION,
    ok: true,
    verdict: 'PASS',
    code: 'R24_WP404_ATLAS_FOUNDATION_VERDICT_COMPILED',
    exactIdentity,
    writerInheritance,
    foundation,
    profileVerdict,
    programVerdict: PROGRAM_VERDICT,
    globalScalarPassForbidden: true,
    authority: Object.freeze({
      stateOwner: 'DERIVED_PROJECTOR_AUTHORITY',
      productMutation: false,
      commandAuthority: 'none',
      persistence: 'none',
      rendererWiring: false,
      network: false,
    }),
    featureManifestDigest,
    nonClaims: NON_CLAIMS,
  };
  return Object.freeze({ ...receipt, claimDigest: digestCanonical(receipt) });
}

export function verifyAtlasFoundationClaim(receipt) {
  assertExactDataObject(receipt, RECEIPT_KEYS, 'E_ATLAS_FOUNDATION_RECEIPT_INVALID');
  if (receipt.schemaVersion !== ATLAS_FOUNDATION_CLAIM_SCHEMA_VERSION || receipt.ok !== true || receipt.verdict !== 'PASS') {
    fail('E_ATLAS_FOUNDATION_RECEIPT_VERDICT');
  }
  assertDigest(receipt.claimDigest, 'E_ATLAS_FOUNDATION_CLAIM_DIGEST_INVALID');
  if (receipt.claimDigest !== digestCanonical(claimDigestInput(receipt))) fail('E_ATLAS_FOUNDATION_CLAIM_DIGEST_MISMATCH');
  if (receipt.featureManifestDigest !== digestCanonical(ATLAS_FOUNDATION_FEATURE_INTEGRATION_MANIFEST_V1)) {
    fail('E_ATLAS_FOUNDATION_FEATURE_MANIFEST_DIGEST_MISMATCH');
  }
  if (
    receipt.profileVerdict?.nodeId !== ATLAS_FOUNDATION_NODE_ID
    || receipt.profileVerdict?.profileId !== ATLAS_FOUNDATION_PROFILE_ID
    || receipt.profileVerdict?.verdict !== ATLAS_FOUNDATION_PROFILE_VERDICT
    || receipt.profileVerdict?.claimCeiling !== ATLAS_FOUNDATION_CLAIM_CEILING
    || receipt.programVerdict !== PROGRAM_VERDICT
    || receipt.globalScalarPassForbidden !== true
  ) fail('E_ATLAS_FOUNDATION_RECEIPT_OVERCLAIM');
  if (
    receipt.authority?.stateOwner !== 'DERIVED_PROJECTOR_AUTHORITY'
    || receipt.authority?.productMutation !== false
    || receipt.authority?.commandAuthority !== 'none'
    || receipt.authority?.persistence !== 'none'
    || receipt.authority?.rendererWiring !== false
    || receipt.authority?.network !== false
  ) fail('E_ATLAS_FOUNDATION_AUTHORITY_LEAK');
  return receipt;
}
