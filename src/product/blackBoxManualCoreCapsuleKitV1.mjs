import crypto from 'node:crypto';

import {
  BLACK_BOX_CORE_SOURCE_ADAPTER_V1_FEATURE_FLAG,
  BLACK_BOX_CORE_SOURCE_ADAPTER_V1_SCHEMAS,
  buildBlackBoxCoreSourceSetV1,
} from './blackBoxCoreSourceAdapterV1.mjs';
import {
  BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_FEATURE_FLAG,
  BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_SCHEMAS,
  publishBlackBoxArtifactDarwinDurableV1,
} from './blackBoxDarwinDurablePublisherV1.mjs';
import {
  BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_FEATURE_FLAG,
  BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS,
  buildBlackBoxStrictCapsuleV1,
  createBlackBoxP0cProviderPinDigestV1,
  createBlackBoxP0cSourceFenceTokenV1,
} from './blackBoxStrictCapsuleRecoverV1.mjs';

export const BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_FEATURE_FLAG = 'yalken.blackBox.manualCoreCapsuleKit.v1';

export const BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_SCHEMAS = Object.freeze({
  featureFlag: 'yalken.blackBoxManualCoreCapsuleKit.featureFlag.v1',
  receipt: 'yalken.blackBoxManualCoreCapsuleKit.receipt.v1',
  recoveryKit: 'yalken.blackBoxManualCoreCapsuleKit.recoveryKit.v1',
  request: 'yalken.blackBoxManualCoreCapsuleKit.request.v1',
  result: 'yalken.blackBoxManualCoreCapsuleKit.result.v1',
});

export const BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_CODES = Object.freeze({
  CAPSULE_BUILD_REJECTED: 'YALKEN_BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_CAPSULE_BUILD_REJECTED',
  FEATURE_DISABLED: 'YALKEN_BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_FEATURE_DISABLED',
  FIELD_INVALID: 'YALKEN_BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_FIELD_INVALID',
  KEYSET_INVALID: 'YALKEN_BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_KEYSET_INVALID',
  KIT_CREATED: 'YALKEN_BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_CREATED',
  PLAINTEXT_OR_KEY_LEAK: 'YALKEN_BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_PLAINTEXT_OR_KEY_LEAK',
  PUBLISH_REJECTED: 'YALKEN_BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_PUBLISH_REJECTED',
  SOURCE_SET_REJECTED: 'YALKEN_BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_SOURCE_SET_REJECTED',
  UNKNOWN_OR_ABSTAIN: 'YALKEN_BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_UNKNOWN_OR_ABSTAIN',
});

const REQUEST_KEYS = Object.freeze([
  'auditIdentity',
  'auditRecipient',
  'featureFlags',
  'providerPin',
  'recipient',
  'schemaVersion',
  'sourceSnapshot',
  'target',
]);
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const BLOCKING_DECISIONS = Object.freeze(['UNKNOWN', 'ABSTAIN', 'CONFLICTING']);
const PLAINTEXT_LEAK_PATTERN = /sourceText|AGE-SECRET-KEY|bytesBase64|Opening line|Second line|A later scene/iu;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze(value) {
  if (!isPlainObject(value) && !Array.isArray(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) {
    if ((isPlainObject(nested) || Array.isArray(nested)) && !Object.isFrozen(nested)) deepFreeze(nested);
  }
  return value;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Buffer(bytes) {
  return `sha256:${crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex')}`;
}

function sha256Stable(value) {
  return sha256Buffer(Buffer.from(stableJson(value), 'utf8'));
}

function sortedKeys(value) {
  return isPlainObject(value) ? Object.keys(value).sort() : [];
}

function sameKeys(value, keys) {
  const actual = sortedKeys(value);
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function validDigest(value) {
  return typeof value === 'string' && DIGEST_PATTERN.test(value);
}

function reason(code, field, expected, actual) {
  const out = { code, field };
  if (expected !== undefined) out.expected = expected;
  if (actual !== undefined) out.actual = actual;
  return Object.freeze(out);
}

function addKeysetReason(reasons, field, actual, expected) {
  reasons.push(reason(
    BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_CODES.KEYSET_INVALID,
    field,
    expected,
    sortedKeys(actual),
  ));
}

function deny(code, reasons = [reason(code, 'request')], details = {}) {
  return deepFreeze({
    schemaVersion: BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_SCHEMAS.result,
    ok: false,
    decision: 'DENY',
    code,
    reasons,
    ...details,
  });
}

function pass(details) {
  return deepFreeze({
    schemaVersion: BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_SCHEMAS.result,
    ok: true,
    decision: 'PASS',
    code: BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_CODES.KIT_CREATED,
    reasons: [],
    ...details,
  });
}

export function resolveBlackBoxManualCoreCapsuleKitFeatureFlag(featureFlags = {}) {
  const enabled = isPlainObject(featureFlags)
    && featureFlags[BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_FEATURE_FLAG] === true;
  return deepFreeze({
    schemaVersion: BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_SCHEMAS.featureFlag,
    flag: BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_FEATURE_FLAG,
    enabled,
    canWriteManuscript: false,
    canOverwriteLiveProject: false,
    canPublishCreateOnlyCapsule: enabled,
    canRecoverProject: false,
    commandKernelWired: false,
    productUiWired: false,
  });
}

function validateRequest(request) {
  const reasons = [];
  if (!isPlainObject(request)) {
    addKeysetReason(reasons, 'request', request, REQUEST_KEYS);
    return { ok: false, code: BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_CODES.KEYSET_INVALID, reasons };
  }
  if (!sameKeys(request, REQUEST_KEYS)) addKeysetReason(reasons, 'request', request, REQUEST_KEYS);
  if (request.schemaVersion !== BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_SCHEMAS.request) {
    reasons.push(reason(BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_CODES.FIELD_INVALID, 'schemaVersion'));
  }
  const feature = resolveBlackBoxManualCoreCapsuleKitFeatureFlag(request.featureFlags);
  if (!feature.enabled) {
    reasons.push(reason(BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_CODES.FEATURE_DISABLED, 'featureFlags'));
  }
  const authorityDecision = request.sourceSnapshot?.authority?.decision;
  if (BLOCKING_DECISIONS.includes(authorityDecision)) {
    reasons.push(reason(BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_CODES.UNKNOWN_OR_ABSTAIN, 'sourceSnapshot.authority.decision', 'ALLOW', authorityDecision));
  }
  if (reasons.length > 0) {
    const priority = [
      BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_CODES.KEYSET_INVALID,
      BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_CODES.FEATURE_DISABLED,
      BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_CODES.UNKNOWN_OR_ABSTAIN,
      BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_CODES.FIELD_INVALID,
    ];
    return { ok: false, code: priority.find((code) => reasons.some((entry) => entry.code === code)) || reasons[0].code, reasons };
  }
  return { ok: true };
}

function buildCoreGenome(sourceSet) {
  return {
    schemaVersion: 'yalken.blackBoxManualCoreCapsuleKit.coreGenome.v1',
    sourceBinding: sourceSet.sourceBinding,
    sourceSetDigest: sourceSet.sourceSetDigest,
    accounting: sourceSet.accounting,
    items: sourceSet.items.map((item) => ({
      kind: item.kind,
      documentId: item.documentId,
      bindingKey: item.bindingKey,
      treeNodeId: item.treeNodeId,
      ordinal: item.ordinal,
      sourceText: item.sourceText,
      sourceTextDigest: item.sourceTextDigest,
      byteLength: item.byteLength,
    })),
    recovery: {
      importMode: 'IMPORT_AS_NEW_PROJECT_ONLY',
      liveProjectOverwrite: false,
      ownerKeyOutsideBuilder: true,
      quarantineRequired: true,
    },
  };
}

function p0cSourceBindingFrom(sourceSet) {
  return {
    schemaVersion: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.sourceBinding,
    projectId: sourceSet.sourceBinding.projectId,
    rootId: sourceSet.sourceBinding.rootId,
    documentId: sourceSet.sourceBinding.documentId,
    canonicalRevision: sourceSet.sourceBinding.canonicalRevision,
    workingRevision: sourceSet.sourceBinding.workingRevision,
    generation: sourceSet.sourceBinding.generation,
    sourceSetDigest: sourceSet.sourceSetDigest,
  };
}

function p0bSourceBindingFrom(sourceSet) {
  return {
    schemaVersion: BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_SCHEMAS.sourceBinding,
    projectId: sourceSet.sourceBinding.projectId,
    rootId: sourceSet.sourceBinding.rootId,
    documentId: sourceSet.sourceBinding.documentId,
    canonicalRevision: sourceSet.sourceBinding.canonicalRevision,
    workingRevision: sourceSet.sourceBinding.workingRevision,
    generation: sourceSet.sourceBinding.generation,
    sourceSetDigest: sourceSet.sourceSetDigest,
  };
}

function sourceFenceFrom(sourceBinding) {
  return {
    authority: {
      commandId: 'query.blackBoxManualCoreCapsuleKit.readSourceSnapshot.v1',
      decision: 'ALLOW',
      mayWrite: false,
    },
    current: {
      projectId: sourceBinding.projectId,
      rootId: sourceBinding.rootId,
      documentId: sourceBinding.documentId,
      canonicalRevision: sourceBinding.canonicalRevision,
      workingRevision: sourceBinding.workingRevision,
      generation: sourceBinding.generation,
      sourceDigest: sourceBinding.sourceSetDigest,
      dirtyState: 'CLEAN',
    },
    expected: {
      projectId: sourceBinding.projectId,
      rootId: sourceBinding.rootId,
      documentId: sourceBinding.documentId,
      canonicalRevision: sourceBinding.canonicalRevision,
      workingRevision: sourceBinding.workingRevision,
      sourceDigest: sourceBinding.sourceSetDigest,
    },
    fence: createBlackBoxP0cSourceFenceTokenV1(sourceBinding),
  };
}

function buildCorePayload(sourceSet) {
  const genomeBytes = Buffer.from(stableJson(buildCoreGenome(sourceSet)), 'utf8');
  return {
    schemaVersion: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.corePayload,
    type: 'BLACK_BOX_CORE_GENOME_V1',
    byteLength: genomeBytes.byteLength,
    bytesBase64: genomeBytes.toString('base64'),
    sha256: sha256Buffer(genomeBytes),
    sourceSetDigest: sourceSet.sourceSetDigest,
  };
}

function p0cExpectations() {
  return {
    importMode: 'IMPORT_AS_NEW_PROJECT_ONLY',
    liveProjectOverwrite: false,
    ownerKeyOutsideBuilder: true,
    quarantineRequired: true,
    requireCiphertextBoundManifest: true,
    requireNoPlaintextInReceipt: true,
    requireProviderExact: true,
    requireStandardAgeV1: true,
    requireX25519Recipient: true,
  };
}

function p0bExpectations() {
  return {
    expectedAbsent: true,
    noReplace: true,
    requireDirectorySync: true,
    requireFileSync: true,
    requireFullReadback: true,
    requireNoFollow: true,
  };
}

function capsuleArtifactFrom(capsule, sourceSetDigest) {
  const bytes = Buffer.from(stableJson(capsule), 'utf8');
  return {
    schemaVersion: BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_SCHEMAS.artifact,
    type: 'BLACK_BOX_CAPSULE_ARTIFACT_OPAQUE_BYTES_V1',
    byteLength: bytes.byteLength,
    bytesBase64: bytes.toString('base64'),
    sha256: sha256Buffer(bytes),
    sourceSetDigest,
  };
}

function safeReceiptFrom({ sourceSet, sourceBindingDigest, providerPinDigest, corePayload, capsuleBuild, publish }) {
  return {
    schemaVersion: BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_SCHEMAS.receipt,
    code: BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_CODES.KIT_CREATED,
    sourceBindingDigest,
    sourceSetDigest: sourceSet.sourceSetDigest,
    providerPinDigest,
    recipientFingerprint: capsuleBuild.receipt.recipientFingerprint,
    auditRecipientFingerprint: capsuleBuild.receipt.auditRecipientFingerprint,
    corePayloadSha256: corePayload.sha256,
    capsuleManifestDigest: capsuleBuild.capsule.manifest.manifestDigest,
    capsuleCiphertextSha256: capsuleBuild.capsule.manifest.ciphertextSha256,
    publishedArtifactSha256: publish.receipt.artifact.sha256,
    sourceAccounting: sourceSet.accounting,
    capsuleReceipt: capsuleBuild.receipt,
    publishReceipt: publish.receipt,
    claims: {
      wholeCoreSourceAccounted: 'PASS',
      standardAgeV1: capsuleBuild.receipt.claims.standardAgeV1,
      x25519Recipient: capsuleBuild.receipt.claims.x25519Recipient,
      ciphertextBoundManifest: capsuleBuild.receipt.claims.ciphertextBoundManifest,
      createOnlyDurablePublication: 'PASS',
      importAsNewProjectOnly: 'PASS',
      liveProjectOverwrite: 'DENIED',
      noPlaintextOrKeyMaterialInReceipt: 'PASS',
      productRuntimeWiring: 'NOT_CLAIMED',
      commandKernelWiring: 'NOT_CLAIMED',
      productUiWiring: 'NOT_CLAIMED',
      disasterReady: 'NOT_CLAIMED',
      ownerKeyRecoveryDrill: 'NOT_CLAIMED',
      exactByteDonorReplication: 'NOT_CLAIMED',
    },
    limitations: {
      userDocuments: 'FORBIDDEN_IN_THIS_CONTOUR',
      liveProjectRestore: 'NOT_CLAIMED',
      physicalPowerLossProof: 'NOT_CLAIMED',
      finalCompleteDonor: 'NOT_CLAIMED',
    },
  };
}

function recoveryKitFrom({ sourceSet, p0cSourceBinding, sourceBindingDigest, providerPinDigest, corePayload, capsuleBuild, publish }) {
  return {
    schemaVersion: BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_SCHEMAS.recoveryKit,
    sourceBinding: p0cSourceBinding,
    sourceBindingDigest,
    sourceSetDigest: sourceSet.sourceSetDigest,
    providerPinDigest,
    recipientFingerprint: capsuleBuild.receipt.recipientFingerprint,
    auditRecipientFingerprint: capsuleBuild.receipt.auditRecipientFingerprint,
    corePayloadSha256: corePayload.sha256,
    capsuleManifestDigest: capsuleBuild.capsule.manifest.manifestDigest,
    capsuleCiphertextSha256: capsuleBuild.capsule.manifest.ciphertextSha256,
    publishedArtifactSha256: publish.receipt.artifact.sha256,
    publishedTarget: publish.receipt.target,
    importMode: 'IMPORT_AS_NEW_PROJECT_ONLY',
    liveProjectOverwrite: false,
    quarantineRequired: true,
    ownerKeyOutsideBuilder: true,
    commandKernelWired: false,
    productUiWired: false,
    disasterReady: false,
  };
}

function includesPlaintextOrKeyLeak(value) {
  return PLAINTEXT_LEAK_PATTERN.test(JSON.stringify(value));
}

export async function buildBlackBoxManualCoreCapsuleKitV1(request = {}, options = {}) {
  const validation = validateRequest(request);
  if (!validation.ok) return deny(validation.code, validation.reasons);

  const sourceSet = buildBlackBoxCoreSourceSetV1({
    schemaVersion: BLACK_BOX_CORE_SOURCE_ADAPTER_V1_SCHEMAS.request,
    featureFlags: request.featureFlags,
    sourceSnapshot: request.sourceSnapshot,
  });
  if (sourceSet.ok !== true || sourceSet.decision !== 'ALLOW') {
    return deny(BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_CODES.SOURCE_SET_REJECTED, [
      reason(BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_CODES.SOURCE_SET_REJECTED, 'sourceSnapshot', 'ALLOW', sourceSet.code),
      ...(Array.isArray(sourceSet.reasons) ? sourceSet.reasons : []),
    ], { sourceSetCode: sourceSet.code });
  }
  if (!validDigest(sourceSet.sourceSetDigest)) {
    return deny(BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_CODES.SOURCE_SET_REJECTED, [
      reason(BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_CODES.SOURCE_SET_REJECTED, 'sourceSetDigest'),
    ]);
  }

  const p0cSourceBinding = p0cSourceBindingFrom(sourceSet);
  const corePayload = buildCorePayload(sourceSet);
  const capsuleBuild = await buildBlackBoxStrictCapsuleV1({
    schemaVersion: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.buildRequest,
    featureFlags: request.featureFlags,
    providerPin: request.providerPin,
    sourceBinding: p0cSourceBinding,
    sourceFence: sourceFenceFrom(p0cSourceBinding),
    auditIdentity: request.auditIdentity,
    auditRecipient: request.auditRecipient,
    recipient: request.recipient,
    corePayload,
    expectations: p0cExpectations(),
  }, { ageProvider: options.ageProvider });
  if (capsuleBuild.ok !== true || capsuleBuild.decision !== 'PASS') {
    return deny(BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_CODES.CAPSULE_BUILD_REJECTED, [
      reason(BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_CODES.CAPSULE_BUILD_REJECTED, 'capsule', 'PASS', capsuleBuild.code),
      ...(Array.isArray(capsuleBuild.reasons) ? capsuleBuild.reasons : []),
    ], { capsuleCode: capsuleBuild.code });
  }

  const artifact = capsuleArtifactFrom(capsuleBuild.capsule, sourceSet.sourceSetDigest);
  const publish = await publishBlackBoxArtifactDarwinDurableV1({
    schemaVersion: BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_SCHEMAS.request,
    featureFlags: request.featureFlags,
    sourceBinding: p0bSourceBindingFrom(sourceSet),
    artifact,
    target: request.target,
    expectations: p0bExpectations(),
  }, { fsPort: options.fsPort });
  if (publish.ok !== true || publish.decision !== 'ALLOW') {
    return deny(BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_CODES.PUBLISH_REJECTED, [
      reason(BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_CODES.PUBLISH_REJECTED, 'publish', 'ALLOW', publish.code),
      ...(Array.isArray(publish.reasons) ? publish.reasons : []),
    ], { publishCode: publish.code, partialTargetMayExist: publish.partialTargetMayExist === true });
  }

  const providerPinDigest = createBlackBoxP0cProviderPinDigestV1(request.providerPin);
  const sourceBindingDigest = sha256Stable(p0cSourceBinding);
  const receipt = safeReceiptFrom({
    sourceSet,
    sourceBindingDigest,
    providerPinDigest,
    corePayload,
    capsuleBuild,
    publish,
  });
  const recoveryKit = recoveryKitFrom({
    sourceSet,
    p0cSourceBinding,
    sourceBindingDigest,
    providerPinDigest,
    corePayload,
    capsuleBuild,
    publish,
  });
  const result = {
    recoveryKit,
    receipt,
  };
  if (includesPlaintextOrKeyLeak(result)) {
    return deny(BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_CODES.PLAINTEXT_OR_KEY_LEAK, [
      reason(BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_CODES.PLAINTEXT_OR_KEY_LEAK, 'receipt'),
    ]);
  }
  return pass(result);
}

export const BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_INTEGRATION_MANIFEST = Object.freeze({
  schemaVersion: 'FEATURE_INTEGRATION_MANIFEST_V1',
  featureId: 'yalken.blackBox.manualCoreCapsuleKit',
  featureVersion: 'v1',
  integrationMode: 'EXISTING_SEAM',
  domainOwner: 'Product Core',
  authoritativeData: 'Trusted Product Core whole-CORE source snapshot, read-only',
  derivedData: 'Recovery kit metadata and ciphertext capsule artifact',
  commandIds: [],
  eventTypes: [],
  queryIds: ['query.blackBoxManualCoreCapsuleKit.readSourceSnapshot.v1'],
  productProjectionIds: [],
  capabilityIds: [BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_FEATURE_FLAG],
  authorityMap: {
    readSourceSnapshot: 'P0A least-privilege read authority',
    buildCapsule: 'P0C provider-bound standard age v1/X25519 seam',
    publishArtifact: 'P0B create-only durable publisher seam',
    liveProjectOverwrite: 'DENIED',
    commandKernelWiring: 'TARGET_ONLY_NOT_RUNTIME_WIRED',
    productUiWiring: 'TARGET_ONLY_NOT_RUNTIME_WIRED',
  },
  identityKeys: [
    'projectId',
    'rootId',
    'documentId',
    'canonicalRevision',
    'workingRevision',
    'generation',
    'sourceSetDigest',
    'providerPinDigest',
    'publishedArtifactSha256',
  ],
  revisionPolicy: 'source-revision-bound; stale/dirty/unknown source refuses publication',
  writePath: 'P0B create-only durable artifact target only; no canonical project mutation',
  readPath: 'P0A trusted Product Core source snapshot',
  requiredProductPorts: [
    'BlackBoxCoreSourceAdapterP0A',
    'BlackBoxStrictCapsuleRecoverP0C',
    'BlackBoxDarwinDurablePublisherP0B',
  ],
  requiredDesignOsPorts: ['NOT_APPLICABLE_NO_UI'],
  surfaceManifests: ['NOT_APPLICABLE_NO_UI'],
  stateClasses: ['PROJECT_STATE_READ_ONLY', 'DERIVED_STATE', 'EXTERNAL_EFFECT_ARTIFACT_CREATE_ONLY'],
  rollback: 'Revert this seam, contract/model, receipt, ledger and governance entries; published synthetic artifacts are test temp files only.',
});
