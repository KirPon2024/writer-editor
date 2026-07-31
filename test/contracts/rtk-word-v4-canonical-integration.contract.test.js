const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');

const V4_SPEC_PATH = 'docs/OPS/RTK/YALKEN_WORD_SAFE_SEMANTIC_ROUNDTRIP_FINAL_V4.md';
const BINDING_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CANONICAL_BINDING_STATUS.json';
const MANIFEST_PATH = 'docs/OPS/RTK/FEATURE_INTEGRATION_MANIFEST_RTK_WORD_V4_V1.json';
const CAPABILITY_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json';
const RECEIPT_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CANONICAL_INTEGRATION_RECEIPT.json';
const CANON_STATUS_PATH = 'docs/OPS/STATUS/CANON_STATUS.json';
const PROGRAM_PATH = 'docs/OPS/RTK/POST_D1_PORTABILITY_PROGRAM_V1.json';
const C05_RECEIPT_PATH = 'docs/OPS/RTK/WORD_LATEST_SEMANTIC_ROUNDTRIP_V2_C05_BLOCK_RANGE_WRITER_RECEIPT.json';
const D1_STATUS_PATH = 'docs/OPS/RTK/WORD_MAC_CERTIFICATION_STATUS.json';
const EXPECTED_V4_SHA =
  'b2a66d1d65d71f25438b54a91160a260d6a2c7ba521496761361bbe4df6c07b4';
const C05_MERGE_SHA = '343e6142c7a59822a5a6cc087c30d779c7f12dcd';

const REQUIRED_MANIFEST_FIELDS = [
  'featureId',
  'featureVersion',
  'domainOwner',
  'authoritativeData',
  'derivedData',
  'commandIds',
  'eventTypes',
  'queryIds',
  'productProjectionIds',
  'capabilityIds',
  'authorityMap',
  'identityKeys',
  'revisionPolicy',
  'writePath',
  'readPath',
  'requiredProductPorts',
  'requiredDesignOsPorts',
  'adapterRequirements',
  'surfaceManifests',
  'slotRequirements',
  'supportedWorkspaces',
  'platformAvailability',
  'accessibilityRequirements',
  'fallbacks',
  'stateClasses',
  'persistenceClass',
  'migrations',
  'recovery',
  'rollback',
  'performanceBudget',
  'securityBoundary',
  'lifecycle',
  'negativeBypassChecks',
  'evidenceBindings',
  'currentReality',
];

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function sha256File(path) {
  return crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
}

function validateBinding({ binding, canon, program, receipt, manifest, capability }) {
  const errors = [];
  if (sha256File(V4_SPEC_PATH) !== EXPECTED_V4_SHA) errors.push('V4_SPEC_DIGEST_MISMATCH');
  if (binding.canonicalSpec?.sha256 !== EXPECTED_V4_SHA) errors.push('BINDING_DIGEST_MISMATCH');
  if (binding.status !== 'ACTIVE_POST_D1_WORD_EXTENSION_AFTER_C05_MERGE') {
    errors.push('BINDING_NOT_ACTIVE');
  }
  if (binding.remoteHeadAtStart !== C05_MERGE_SHA) errors.push('C05_MERGE_NOT_BOUND');
  if (binding.supersession?.v6HistoryRewritten !== false) errors.push('V6_HISTORY_REWRITE_CLAIM');
  if (binding.supersession?.d1EvidenceRewritten !== false) errors.push('D1_EVIDENCE_REWRITE_CLAIM');
  if (binding.supersession?.googleDocsExecutionOpened !== false) errors.push('GOOGLE_OPENED_TOO_EARLY');
  if (canon.canonVersion !== 'v3.13a-final') errors.push('GLOBAL_CANON_VERSION_CHANGED');
  if (canon.status !== 'ACTIVE_CANON') errors.push('GLOBAL_CANON_STATUS_CHANGED');
  const extension = (canon.activeFeatureExtensions || []).find((item) => (
    item.extensionId === 'YALKEN_WORD_SAFE_SEMANTIC_ROUNDTRIP_FINAL_V4'
  ));
  if (!extension) errors.push('CANON_EXTENSION_MISSING');
  if (extension?.sha256 !== EXPECTED_V4_SHA) errors.push('CANON_EXTENSION_DIGEST_MISMATCH');
  if (extension?.globalCanonReplaced !== false) errors.push('GLOBAL_CANON_REPLACED');
  if (program.v4CanonicalIntegration?.canonicalSpecSha256 !== EXPECTED_V4_SHA) {
    errors.push('PROGRAM_DIGEST_MISMATCH');
  }
  if (program.v4CanonicalIntegration?.currentExecutionFocus !== 'WORD_SATURATION_BEFORE_GOOGLE_DOCS') {
    errors.push('PROGRAM_FOCUS_DRIFT');
  }
  if (receipt.artifacts?.canonicalSpecSha256 !== EXPECTED_V4_SHA) errors.push('RECEIPT_DIGEST_MISMATCH');
  if (receipt.base?.precedingC05MergeSha !== C05_MERGE_SHA) errors.push('RECEIPT_C05_MERGE_MISMATCH');
  if (manifest.schemaVersion !== 'FEATURE_INTEGRATION_MANIFEST_V1') {
    errors.push('FEATURE_MANIFEST_SCHEMA_MISSING');
  }
  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (!(field in manifest)) errors.push(`FEATURE_MANIFEST_FIELD_MISSING_${field}`);
  }
  if (manifest.integrationMode !== 'EXISTING_SEAM: BOUND_TO_CURRENT_APPROVED_ENTRYPOINTS') {
    errors.push('FEATURE_MANIFEST_NOT_EXISTING_SEAM');
  }
  if (manifest.securityBoundary?.productNetworkRequests !== 0) errors.push('NETWORK_REQUEST_CLAIM');
  if (!String(manifest.surfaceManifests || '').startsWith('NOT_APPLICABLE')) {
    errors.push('UI_SURFACE_ADDED');
  }
  if (!manifest.negativeBypassChecks?.includes('no Google Docs execution before Word saturation')) {
    errors.push('GOOGLE_SEQUENCE_GUARD_MISSING');
  }
  if (capability.boundSpec?.sha256 !== EXPECTED_V4_SHA) errors.push('CAPABILITY_DIGEST_MISMATCH');
  if (capability.capabilityClaimPolicy?.userPromiseAllowedFrom !== 'PHYSICAL_WORD_PROVEN') {
    errors.push('USER_CLAIM_TOO_EARLY');
  }
  if (capability.capabilityClaimPolicy?.fixtureOnlyPassAllowed !== false) {
    errors.push('FIXTURE_ONLY_PASS_ALLOWED');
  }
  const reasonCodes = capability.reasonRegistry?.stableCodes?.map((item) => item.code) || [];
  if (new Set(reasonCodes).size !== reasonCodes.length) errors.push('REASON_CODES_NOT_UNIQUE');
  for (const code of [
    'RTK_V4_PACKAGE_REJECT',
    'RTK_V4_MANUAL_RESOURCE_LIMIT',
    'RTK_V4_AUTHORITY_REJECT_READ_ONLY',
    'RTK_V4_PHYSICAL_WORD_EVIDENCE_PENDING',
  ]) {
    if (!reasonCodes.includes(code)) errors.push(`REASON_CODE_MISSING_${code}`);
  }
  const c05Cell = capability.cells?.find((item) => (
    item.capabilityId === 'rtk.word.v4.locallyBoundBlockRangeExactText'
  ));
  if (!c05Cell) errors.push('C05_CAPABILITY_CELL_MISSING');
  if (c05Cell?.state !== 'COMPONENT_PROVEN') errors.push('C05_CAPABILITY_NOT_COMPONENT_PROVEN');
  if (c05Cell?.physicalWordEvidence !== false) errors.push('C05_FALSE_PHYSICAL_WORD_CLAIM');
  return errors;
}

test('V4 canonical integration binds the exact owner artifact without rewriting V6 D1 or global canon', () => {
  const spec = fs.readFileSync(V4_SPEC_PATH, 'utf8');
  const binding = readJson(BINDING_PATH);
  const canon = readJson(CANON_STATUS_PATH);
  const program = readJson(PROGRAM_PATH);
  const receipt = readJson(RECEIPT_PATH);
  const manifest = readJson(MANIFEST_PATH);
  const capability = readJson(CAPABILITY_PATH);
  const c05 = readJson(C05_RECEIPT_PATH);
  const d1 = readJson(D1_STATUS_PATH);

  assert.equal(sha256File(V4_SPEC_PATH), EXPECTED_V4_SHA);
  assert.equal(spec.includes('BLOCK_ID: YALKEN_WORD_SAFE_SEMANTIC_ROUNDTRIP_FINAL_V4'), true);
  assert.equal(spec.includes('STATUS: CANDIDATE_CANONICAL_NOT_ACTIVATED'), true);
  assert.equal(binding.status, 'ACTIVE_POST_D1_WORD_EXTENSION_AFTER_C05_MERGE');
  assert.equal(c05.status, 'C05_BLOCK_RANGE_WRITER_READY_NOT_YRTK2_HMAC_NOT_WORD_SATURATION');
  assert.equal(d1.taskId, 'YALKEN_RTK_WORD_MAC_CERTIFICATION_AND_F00');
  assert.deepEqual(validateBinding({ binding, canon, program, receipt, manifest, capability }), []);
});

test('V4 canonical integration negative contract blocks drift broad claims and missing consumers', () => {
  const binding = readJson(BINDING_PATH);
  const canon = readJson(CANON_STATUS_PATH);
  const program = readJson(PROGRAM_PATH);
  const receipt = readJson(RECEIPT_PATH);
  const manifest = readJson(MANIFEST_PATH);
  const capability = readJson(CAPABILITY_PATH);

  const wrongDigest = structuredClone(binding);
  wrongDigest.canonicalSpec.sha256 = '0'.repeat(64);
  assert(validateBinding({
    binding: wrongDigest,
    canon,
    program,
    receipt,
    manifest,
    capability,
  }).includes('BINDING_DIGEST_MISMATCH'));

  const missingManifestField = structuredClone(manifest);
  delete missingManifestField.commandIds;
  assert(validateBinding({
    binding,
    canon,
    program,
    receipt,
    manifest: missingManifestField,
    capability,
  }).includes('FEATURE_MANIFEST_FIELD_MISSING_commandIds'));

  const earlyPhysicalClaim = structuredClone(capability);
  earlyPhysicalClaim.cells[0].physicalWordEvidence = true;
  assert(validateBinding({
    binding,
    canon,
    program,
    receipt,
    manifest,
    capability: earlyPhysicalClaim,
  }).includes('C05_FALSE_PHYSICAL_WORD_CLAIM'));

  const googleOpened = structuredClone(binding);
  googleOpened.supersession.googleDocsExecutionOpened = true;
  assert(validateBinding({
    binding: googleOpened,
    canon,
    program,
    receipt,
    manifest,
    capability,
  }).includes('GOOGLE_OPENED_TOO_EARLY'));

  const missingConsumer = structuredClone(capability);
  missingConsumer.cells = missingConsumer.cells.filter((item) => (
    item.capabilityId !== 'rtk.word.v4.locallyBoundBlockRangeExactText'
  ));
  assert(validateBinding({
    binding,
    canon,
    program,
    receipt,
    manifest,
    capability: missingConsumer,
  }).includes('C05_CAPABILITY_CELL_MISSING'));
});
