import crypto from 'node:crypto';

import {
  BLACK_BOX_CORE_SOURCE_ADAPTER_V1_FEATURE_FLAG,
} from './blackBoxCoreSourceAdapterV1.mjs';
import {
  BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_FEATURE_FLAG,
} from './blackBoxDarwinDurablePublisherV1.mjs';
import {
  BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_FEATURE_FLAG,
  BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_SCHEMAS,
  buildBlackBoxManualCoreCapsuleKitV1,
} from './blackBoxManualCoreCapsuleKitV1.mjs';
import {
  BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_FEATURE_FLAG,
  BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS,
} from './blackBoxStrictCapsuleRecoverV1.mjs';
import {
  BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_SCHEMAS,
  buildBlackBoxTrustedSourceSnapshotV1,
} from './blackBoxTrustedSourceSnapshotV1.mjs';

export const BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_COMMAND_ID = 'cmd.project.blackBox.exportManualCoreCapsuleKitV1';
export const BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CAPABILITY_ID = 'cap.blackBox.manualCoreCapsule.export';
export const BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_FEATURE_FLAG = BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_FEATURE_FLAG;

export const BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_SCHEMAS = Object.freeze({
  featureFlag: 'yalken.blackBoxProductCommandExportManualCore.featureFlag.v1',
  integrationManifest: 'yalken.blackBoxProductCommandExportManualCore.integrationManifest.v1',
  request: 'yalken.blackBoxProductCommandExportManualCore.request.v1',
  result: 'yalken.blackBoxProductCommandExportManualCore.result.v1',
});

export const BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES = Object.freeze({
  EXPORTED: 'YALKEN_BLACK_BOX_PRODUCT_COMMAND_EXPORT_CREATED',
  KEYSET_INVALID: 'YALKEN_BLACK_BOX_PRODUCT_COMMAND_EXPORT_KEYSET_INVALID',
  FIELD_INVALID: 'YALKEN_BLACK_BOX_PRODUCT_COMMAND_EXPORT_FIELD_INVALID',
  FEATURE_DISABLED: 'YALKEN_BLACK_BOX_PRODUCT_COMMAND_EXPORT_FEATURE_DISABLED',
  PORT_REQUIRED: 'YALKEN_BLACK_BOX_PRODUCT_COMMAND_EXPORT_TRUSTED_PORT_REQUIRED',
  SOURCE_REJECTED: 'YALKEN_BLACK_BOX_PRODUCT_COMMAND_EXPORT_SOURCE_REJECTED',
  PROVIDER_PIN_REQUIRED: 'YALKEN_BLACK_BOX_PRODUCT_COMMAND_EXPORT_PROVIDER_PIN_REQUIRED',
  AUDIT_RECIPIENT_REQUIRED: 'YALKEN_BLACK_BOX_PRODUCT_COMMAND_EXPORT_AUDIT_RECIPIENT_REQUIRED',
  AUDIT_IDENTITY_REQUIRED: 'YALKEN_BLACK_BOX_PRODUCT_COMMAND_EXPORT_AUDIT_IDENTITY_REQUIRED',
  AGE_PROVIDER_REQUIRED: 'YALKEN_BLACK_BOX_PRODUCT_COMMAND_EXPORT_AGE_PROVIDER_REQUIRED',
  TARGET_REJECTED: 'YALKEN_BLACK_BOX_PRODUCT_COMMAND_EXPORT_TARGET_REJECTED',
  KIT_REJECTED: 'YALKEN_BLACK_BOX_PRODUCT_COMMAND_EXPORT_KIT_REJECTED',
});

const PAYLOAD_KEYS = Object.freeze(['recipient', 'requestId', 'schemaVersion']);
const RECIPIENT_KEYS = Object.freeze(['fingerprint', 'publicKey', 'schemaVersion', 'type']);
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const SAFE_FILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const REQUIRED_FEATURE_FLAGS = Object.freeze([
  BLACK_BOX_CORE_SOURCE_ADAPTER_V1_FEATURE_FLAG,
  BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_FEATURE_FLAG,
  BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_FEATURE_FLAG,
  BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_FEATURE_FLAG,
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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

function sha256Stable(value) {
  return `sha256:${crypto.createHash('sha256').update(Buffer.from(stableJson(value), 'utf8')).digest('hex')}`;
}

function sortedKeys(value) {
  return isPlainObject(value) ? Object.keys(value).sort() : [];
}

function sameKeys(value, keys) {
  const actual = sortedKeys(value);
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function reason(code, field, expected, actual) {
  const out = { code, field };
  if (expected !== undefined) out.expected = expected;
  if (actual !== undefined) out.actual = actual;
  return Object.freeze(out);
}

function deny(code, reasons = [reason(code, 'request')], details = {}) {
  return deepFreeze({
    schemaVersion: BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_SCHEMAS.result,
    ok: false,
    decision: 'DENY',
    commandId: BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_COMMAND_ID,
    code,
    reasons,
    claims: {
      productRuntimeWiring: 'FAIL',
      commandKernelWiring: 'FAIL',
      productUiWiring: 'NOT_CLAIMED',
      liveProjectOverwrite: 'DENIED',
      disasterReady: 'NOT_CLAIMED',
    },
    ...details,
  });
}

function pass(details) {
  return deepFreeze({
    schemaVersion: BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_SCHEMAS.result,
    ok: true,
    decision: 'PASS',
    commandId: BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_COMMAND_ID,
    code: BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES.EXPORTED,
    reasons: [],
    claims: {
      productRuntimeWiring: 'PASS',
      commandKernelWiring: 'PASS',
      productUiWiring: 'NOT_CLAIMED',
      wholeCoreSourceAccounted: 'PASS',
      createOnlyDurablePublication: 'PASS',
      importAsNewProjectOnly: 'PASS',
      liveProjectOverwrite: 'DENIED',
      disasterReady: 'NOT_CLAIMED',
      ownerKeyRecoveryDrill: 'NOT_CLAIMED',
      exactByteDonorReplication: 'NOT_CLAIMED',
    },
    ...details,
  });
}

function validateRecipient(value, reasons, field = 'recipient') {
  const before = reasons.length;
  if (!isPlainObject(value) || !sameKeys(value, RECIPIENT_KEYS)) {
    reasons.push(reason(BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES.KEYSET_INVALID, field, RECIPIENT_KEYS, sortedKeys(value)));
    return false;
  }
  if (value.schemaVersion !== BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.recipient) {
    reasons.push(reason(BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES.FIELD_INVALID, `${field}.schemaVersion`));
  }
  if (value.type !== 'AGE_X25519_RECIPIENT') {
    reasons.push(reason(BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES.FIELD_INVALID, `${field}.type`));
  }
  if (typeof value.publicKey !== 'string' || !value.publicKey.startsWith('age1') || /[\u0000-\u001F]/u.test(value.publicKey)) {
    reasons.push(reason(BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES.FIELD_INVALID, `${field}.publicKey`));
  }
  if (typeof value.fingerprint !== 'string' || !DIGEST_PATTERN.test(value.fingerprint)) {
    reasons.push(reason(BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES.FIELD_INVALID, `${field}.fingerprint`));
  }
  return reasons.length === before;
}

function validatePayload(payload) {
  const reasons = [];
  if (!isPlainObject(payload) || !sameKeys(payload, PAYLOAD_KEYS)) {
    reasons.push(reason(BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES.KEYSET_INVALID, 'payload', PAYLOAD_KEYS, sortedKeys(payload)));
    return { ok: false, code: BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES.KEYSET_INVALID, reasons };
  }
  if (payload.schemaVersion !== BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_SCHEMAS.request) {
    reasons.push(reason(BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES.FIELD_INVALID, 'schemaVersion'));
  }
  if (typeof payload.requestId !== 'string' || !payload.requestId || payload.requestId.trim() !== payload.requestId || /[\u0000-\u001F]/u.test(payload.requestId)) {
    reasons.push(reason(BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES.FIELD_INVALID, 'requestId'));
  }
  validateRecipient(payload.recipient, reasons);
  return {
    ok: reasons.length === 0,
    code: reasons.some((entry) => entry.code === BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES.KEYSET_INVALID)
      ? BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES.KEYSET_INVALID
      : BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES.FIELD_INVALID,
    reasons,
  };
}

function trustedPort(ports, name) {
  const fn = ports?.[name];
  return typeof fn === 'function' ? fn : null;
}

async function callRequiredPort(ports, name, ...args) {
  const fn = trustedPort(ports, name);
  if (!fn) {
    return {
      ok: false,
      error: deny(
        BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES.PORT_REQUIRED,
        [reason(BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES.PORT_REQUIRED, `ports.${name}`)],
      ),
    };
  }
  return { ok: true, value: await fn(...args) };
}

function featureEnabled(featureFlags) {
  if (!isPlainObject(featureFlags)) return false;
  return REQUIRED_FEATURE_FLAGS.every((flag) => featureFlags[flag] === true);
}

function targetFromSelection(selection) {
  if (!selection) {
    return { ok: false, code: BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES.TARGET_REJECTED };
  }
  if (selection.ok === false) {
    return { ok: false, code: BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES.TARGET_REJECTED, details: { sourceCode: selection.code || '', sourceReason: selection.reason || '' } };
  }
  const target = isPlainObject(selection.target) ? selection.target : selection;
  if (!isPlainObject(target)) return { ok: false, code: BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES.TARGET_REJECTED };
  return { ok: true, target };
}

function artifactFromKit(kit) {
  const recoveryKit = isPlainObject(kit?.recoveryKit) ? kit.recoveryKit : {};
  const target = isPlainObject(recoveryKit.publishedTarget) ? recoveryKit.publishedTarget : {};
  const fileName = typeof target.fileName === 'string' && SAFE_FILE_PATTERN.test(target.fileName)
    ? target.fileName
    : 'manual-core.yalken-capsule';
  return {
    fileName,
    sha256: typeof recoveryKit.publishedArtifactSha256 === 'string' ? recoveryKit.publishedArtifactSha256 : '',
    capsuleManifestDigest: typeof recoveryKit.capsuleManifestDigest === 'string' ? recoveryKit.capsuleManifestDigest : '',
    capsuleCiphertextSha256: typeof recoveryKit.capsuleCiphertextSha256 === 'string' ? recoveryKit.capsuleCiphertextSha256 : '',
  };
}

function recoveryFromKit(kit) {
  const recoveryKit = isPlainObject(kit?.recoveryKit) ? kit.recoveryKit : {};
  return {
    importMode: recoveryKit.importMode === 'IMPORT_AS_NEW_PROJECT_ONLY'
      ? recoveryKit.importMode
      : 'IMPORT_AS_NEW_PROJECT_ONLY',
    liveProjectOverwrite: false,
    quarantineRequired: recoveryKit.quarantineRequired === true,
    ownerKeyOutsideBuilder: recoveryKit.ownerKeyOutsideBuilder !== false,
    recipientFingerprint: typeof recoveryKit.recipientFingerprint === 'string' ? recoveryKit.recipientFingerprint : '',
    auditRecipientFingerprint: typeof recoveryKit.auditRecipientFingerprint === 'string' ? recoveryKit.auditRecipientFingerprint : '',
    sourceSetDigest: typeof recoveryKit.sourceSetDigest === 'string' ? recoveryKit.sourceSetDigest : '',
    providerPinDigest: typeof recoveryKit.providerPinDigest === 'string' ? recoveryKit.providerPinDigest : '',
  };
}

export async function executeBlackBoxProductCommandExportManualCoreV1(payload = {}, options = {}) {
  const validation = validatePayload(payload);
  if (!validation.ok) return deny(validation.code, validation.reasons);

  const ports = isPlainObject(options.ports) ? options.ports : {};
  const featureFlagsResult = await callRequiredPort(ports, 'getFeatureFlags');
  if (!featureFlagsResult.ok) return featureFlagsResult.error;
  const featureFlags = featureFlagsResult.value;
  if (!featureEnabled(featureFlags)) {
    return deny(
      BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES.FEATURE_DISABLED,
      [reason(BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES.FEATURE_DISABLED, 'featureFlags')],
    );
  }

  const expectedResult = await callRequiredPort(ports, 'getExpectedSourceIdentity');
  if (!expectedResult.ok) return expectedResult.error;
  const rootResult = await callRequiredPort(ports, 'getProjectRoot');
  if (!rootResult.ok) return rootResult.error;
  const buildTrustedSourceSnapshot = trustedPort(ports, 'buildTrustedSourceSnapshot') || buildBlackBoxTrustedSourceSnapshotV1;
  const trustedSource = await buildTrustedSourceSnapshot({
    schemaVersion: BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_SCHEMAS.request,
    featureFlags,
    projectRoot: rootResult.value,
    expected: expectedResult.value,
  }, {
    observeRevision: trustedPort(ports, 'observeRevision'),
  });
  if (!trustedSource || trustedSource.ok !== true || trustedSource.decision !== 'ALLOW' || !trustedSource.sourceSnapshot) {
    return deny(
      BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES.SOURCE_REJECTED,
      [reason(BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES.SOURCE_REJECTED, 'trustedSourceSnapshot', 'ALLOW', trustedSource?.code || trustedSource?.decision || 'UNKNOWN')],
      { sourceCode: typeof trustedSource?.code === 'string' ? trustedSource.code : '' },
    );
  }

  const providerPinResult = await callRequiredPort(ports, 'getProviderPin');
  if (!providerPinResult.ok) return providerPinResult.error;
  if (!isPlainObject(providerPinResult.value)) {
    return deny(
      BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES.PROVIDER_PIN_REQUIRED,
      [reason(BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES.PROVIDER_PIN_REQUIRED, 'providerPin')],
    );
  }

  const getAuditRecipient = trustedPort(ports, 'getAuditRecipient');
  if (!getAuditRecipient) {
    return deny(
      BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES.AUDIT_RECIPIENT_REQUIRED,
      [reason(BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES.AUDIT_RECIPIENT_REQUIRED, 'ports.getAuditRecipient')],
    );
  }
  const auditRecipientResult = { value: await getAuditRecipient() };
  const auditRecipientReasons = [];
  const auditRecipient = auditRecipientResult.value;
  validateRecipient(auditRecipient, auditRecipientReasons, 'auditRecipient');
  if (
    auditRecipientReasons.length > 0
    || auditRecipient?.fingerprint === payload.recipient.fingerprint
  ) {
    const reasons = auditRecipientReasons.length > 0
      ? auditRecipientReasons
      : [reason(BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES.AUDIT_RECIPIENT_REQUIRED, 'auditRecipient.fingerprint', 'distinct-from-owner-recipient', auditRecipient?.fingerprint)];
    return deny(
      BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES.AUDIT_RECIPIENT_REQUIRED,
      reasons,
    );
  }

  const auditIdentityResult = await callRequiredPort(ports, 'getAuditIdentity');
  if (!auditIdentityResult.ok) return auditIdentityResult.error;
  if (
    !isPlainObject(auditIdentityResult.value)
    || auditIdentityResult.value.schemaVersion !== BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.identity
    || auditIdentityResult.value.type !== 'AGE_X25519_IDENTITY'
    || auditIdentityResult.value.fingerprint !== auditRecipient.fingerprint
  ) {
    return deny(
      BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES.AUDIT_IDENTITY_REQUIRED,
      [reason(BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES.AUDIT_IDENTITY_REQUIRED, 'auditIdentity.fingerprint', auditRecipient.fingerprint, auditIdentityResult.value?.fingerprint)],
    );
  }

  const ageProviderResult = await callRequiredPort(ports, 'getAgeProvider');
  if (!ageProviderResult.ok) return ageProviderResult.error;
  if (!ageProviderResult.value) {
    return deny(
      BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES.AGE_PROVIDER_REQUIRED,
      [reason(BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES.AGE_PROVIDER_REQUIRED, 'ageProvider')],
    );
  }

  const targetResult = await callRequiredPort(ports, 'selectCreateOnlyTarget', {
    commandId: BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_COMMAND_ID,
    requestId: payload.requestId,
    defaultFileName: 'manual-core.yalken-capsule',
    sourceSetDigest: trustedSource.sourceSetDigest,
    recipientFingerprint: payload.recipient.fingerprint,
  });
  if (!targetResult.ok) return targetResult.error;
  const selectedTarget = targetFromSelection(targetResult.value);
  if (!selectedTarget.ok) {
    return deny(
      BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES.TARGET_REJECTED,
      [reason(BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES.TARGET_REJECTED, 'target')],
      selectedTarget.details || {},
    );
  }

  const buildManualCoreCapsuleKit = trustedPort(ports, 'buildManualCoreCapsuleKit') || buildBlackBoxManualCoreCapsuleKitV1;
  const kit = await buildManualCoreCapsuleKit({
    schemaVersion: BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_SCHEMAS.request,
    featureFlags,
    sourceSnapshot: trustedSource.sourceSnapshot,
    providerPin: providerPinResult.value,
    recipient: payload.recipient,
    auditRecipient,
    auditIdentity: auditIdentityResult.value,
    target: selectedTarget.target,
  }, {
    ageProvider: ageProviderResult.value,
    fsPort: ports.fsPort,
  });
  if (!kit || kit.ok !== true || kit.decision !== 'PASS') {
    return deny(
      BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES.KIT_REJECTED,
      [reason(BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CODES.KIT_REJECTED, 'manualCoreCapsuleKit', 'PASS', kit?.code || kit?.decision || 'UNKNOWN')],
      { kitCode: typeof kit?.code === 'string' ? kit.code : '' },
    );
  }

  return pass({
    requestId: payload.requestId,
    artifact: artifactFromKit(kit),
    recovery: recoveryFromKit(kit),
    receiptDigest: sha256Stable({
      schemaVersion: kit.receipt?.schemaVersion || '',
      code: kit.receipt?.code || '',
      sourceSetDigest: kit.receipt?.sourceSetDigest || '',
      providerPinDigest: kit.receipt?.providerPinDigest || '',
      recipientFingerprint: kit.receipt?.recipientFingerprint || '',
      publishedArtifactSha256: kit.receipt?.publishedArtifactSha256 || '',
      claims: kit.receipt?.claims || {},
    }),
    canWriteManuscript: false,
    canOverwriteLiveProject: false,
    userDocumentsTouched: false,
  });
}

export const BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_INTEGRATION_MANIFEST = deepFreeze({
  schemaVersion: BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_SCHEMAS.integrationManifest,
  manifestStandard: 'FEATURE_INTEGRATION_MANIFEST_V1',
  featureId: 'yalken.blackBox.productCommand.exportManualCoreCapsule',
  featureVersion: 'v1',
  integrationMode: 'EXISTING_COMMAND_KERNEL_AND_PRODUCT_BRIDGE',
  domainOwner: 'Product Core',
  authoritativeData: [
    'Product Core project manifest bytes',
    'Product Core scene bytes',
    'Product Core notes/history bytes',
  ],
  derivedData: [
    'capsule manifest digest',
    'published artifact metadata',
    'sanitized recovery metadata',
  ],
  commandIds: [BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_COMMAND_ID],
  capabilityIds: [BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CAPABILITY_ID],
  queryIds: ['query.blackBoxProductCommandExportManualCore.readSourceSnapshot.v1'],
  eventTypes: [],
  productProjectionIds: [],
  authorityMap: {
    payloadAuthority: 'recipient public key and requestId only',
    sourceAuthority: 'trusted Product Core snapshot port recomputes bytes/revision/generation',
    providerAuthority: 'trusted provider pin port only',
    auditAuthority: 'trusted audit recipient and matching audit identity ports only',
    targetAuthority: 'trusted create-only target port only',
    liveProjectOverwrite: 'DENIED',
    productUiWiring: 'NOT_CLAIMED',
  },
  identityKeys: [
    'projectId',
    'rootId',
    'documentId',
    'canonicalRevision',
    'workingRevision',
    'generation',
    'sourceSetDigest',
    'recipientFingerprint',
    'auditRecipientFingerprint',
    'providerPinDigest',
  ],
  revisionPolicy: {
    sourceSnapshot: 'TRUSTED_PRODUCT_CORE_QUERY_RECOMPUTES_PROJECT_ROOT_DOCUMENT_CANONICAL_WORKING_GENERATION_AND_DIGEST',
    dirtyPolicy: 'CLEAN_ONLY_DIRTY_OR_AUTOSAVE_DENY',
    currentSourceInvalidation: 'BEFORE_AFTER_REVISION_AND_GENERATION_MUST_MATCH',
    staleReplayTransplant: 'DENY',
  },
  writePath: {
    commandKernel: BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_COMMAND_ID,
    canonicalProjectMutation: 'NONE',
    externalEffect: 'CREATE_ONLY_CAPSULE_ARTIFACT_THROUGH_TRUSTED_TARGET_PORT',
    liveProjectOverwrite: 'DENIED',
  },
  readPath: {
    source: 'READ_SOURCE_SNAPSHOT_LEAST_PRIVILEGE_MAY_WRITE_FALSE',
    provider: 'TRUSTED_RUNTIME_PROVIDER_PIN_PORT',
    target: 'TRUSTED_CREATE_ONLY_TARGET_PORT',
  },
  requiredProductPorts: [
    'getFeatureFlags',
    'getExpectedSourceIdentity',
    'getProjectRoot',
    'observeRevision',
    'getProviderPin',
    'getAuditRecipient',
    'getAuditIdentity',
    'getAgeProvider',
    'selectCreateOnlyTarget',
  ],
  requiredDesignOsPorts: [
    'CommandCatalogPort:READ_ONLY_EXISTING',
    'CommandDispatchPort:INTENT_ONLY_EXISTING_BRIDGE',
  ],
  adapterRequirements: [
    'official age provider remains task-local/provider-bound',
    'create-only target adapter must deny missing env, symlink, collision, project-root and outside-root targets',
  ],
  surfaceManifests: [
    {
      schemaVersion: 'SURFACE_MANIFEST_V1',
      surfaceId: 'surface.menu.fileExport.blackBoxManualCoreCapsule.v1',
      surfaceKind: 'MENU_ITEM',
      slotId: 'menu.file.export',
      commandRepresentations: [BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_COMMAND_ID],
      platformAvailability: 'DESKTOP_ONLY_WITH_COMMAND_KERNEL_REVALIDATION',
      fallbackSurface: 'HIDDEN_OR_DISABLED_WHEN_CAPABILITY_DENIED',
      stateOwnership: 'SHELL_STATE_ONLY_NOT_PROJECT_TRUTH',
    },
    {
      schemaVersion: 'SURFACE_MANIFEST_V1',
      surfaceId: 'surface.exportModal.blackBoxManualCoreCapsule.v1',
      surfaceKind: 'EXPORT_MODAL_OPTION',
      slotId: 'export.modal.options',
      commandRepresentations: [BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_COMMAND_ID],
      platformAvailability: 'DESKTOP_ONLY_WITH_COMMAND_KERNEL_REVALIDATION',
      fallbackSurface: 'OMITTED_WHEN_CAPABILITY_DENIED',
      stateOwnership: 'TRANSIENT_STATE_ONLY_NOT_PROJECT_TRUTH',
    },
    {
      schemaVersion: 'SURFACE_MANIFEST_V1',
      surfaceId: 'surface.commandPalette.blackBoxManualCoreCapsule.v1',
      surfaceKind: 'COMMAND_PALETTE_ACTION',
      slotId: 'command.palette',
      commandRepresentations: [BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_COMMAND_ID],
      platformAvailability: 'DESKTOP_ONLY_WITH_COMMAND_KERNEL_REVALIDATION',
      fallbackSurface: 'UNAVAILABLE_WHEN_CAPABILITY_DENIED',
      stateOwnership: 'SHELL_STATE_ONLY_NOT_PROJECT_TRUTH',
    },
  ],
  slotRequirements: ['existing menu/export modal/command palette typed slots only'],
  supportedWorkspaces: ['WRITE', 'PLAN', 'REVIEW'],
  platformAvailability: {
    node: {
      capability: 'AVAILABLE_WHEN_FLAG_PROVIDER_AUDIT_SOURCE_AND_TARGET_PORTS_PASS',
      fallback: 'DENY_TYPED_REASON_WHEN_ANY_TRUSTED_PORT_ABSENT',
    },
    darwin: {
      capability: 'AVAILABLE_FOR_LOCAL_CREATE_ONLY_TARGET_WHEN_PROVIDER_AND_ENV_ARE_EXACT',
      fallback: 'DENY_TARGET_OR_PROVIDER_REASON',
    },
    web: {
      capability: 'DENIED_NO_PLATFORM_ADAPTER',
      fallback: 'CAPABILITY_FALSE_NO_DIRECT_PLATFORM_ACCESS',
    },
    windows: {
      capability: 'NOT_CLAIMED_NO_PROVIDER_PROFILE',
      fallback: 'CAPABILITY_FALSE_NO_INHERITED_WORD_EVIDENCE',
    },
    googleDocs: {
      capability: 'NOT_INHERITED_SEPARATE_PROFILE',
      fallback: 'ABSTAIN_NEEDS_REAL_GOOGLE_E2E',
    },
  },
  accessibilityRequirements: [
    'existing menu/modal/palette labels only',
    'visibility never enforces capability',
    'Command Kernel revalidates on dispatch',
  ],
  fallbacks: [
    'feature flag default off',
    'provider/audit/source/target missing returns typed DENY',
    'Google Docs and Word evidence do not transfer to Black Box Product V1',
  ],
  stateClasses: [
    'PROJECT_STATE',
    'AUTHORING_WORKING_STATE',
    'DERIVED_STATE',
    'SHELL_STATE',
    'TRANSIENT_STATE',
  ],
  stateClassPolicy: {
    PROJECT_STATE: {
      owner: 'Product Core',
      mutation: 'NONE_READ_ONLY_SOURCE_PLUS_EXTERNAL_CREATE_ONLY_ARTIFACT',
      protectedBy: 'source snapshot identity/revision/generation fence',
    },
    AUTHORING_WORKING_STATE: {
      owner: 'Product Core editor/save/recovery path',
      mutation: 'DENIED',
      noLossDuty: 'PROTECTED_NOT_CLASSIFIED_AS_TRANSIENT',
      policy: 'dirty/autosave authoring state blocks export instead of being discarded',
    },
    DERIVED_STATE: {
      owner: 'Product Core derived evidence',
      rebuildable: true,
      persistence: 'artifact metadata and receipts only, never product truth',
    },
    SHELL_STATE: {
      owner: 'Design OS',
      projectTruthAuthority: false,
      persistence: 'existing UI placement/visibility only',
    },
    TRANSIENT_STATE: {
      owner: 'Renderer/session',
      persistedAsTruth: false,
      examples: ['modal open state', 'command palette query', 'focus'],
    },
  },
  persistenceClass: 'NO_PROJECT_DATA_MIGRATION_EXTERNAL_CREATE_ONLY_ARTIFACT',
  migrations: {
    required: false,
    tier: 'Tier C architecture/manifest/evidence only',
    nMinusOneCompatibility: 'NOT_APPLICABLE_NO_PROJECT_FORMAT_CHANGE',
  },
  recovery: {
    mode: 'IMPORT_AS_NEW_PROJECT_ONLY_WITH_QUARANTINE_PREVIEW',
    liveProjectOverwrite: 'DENIED',
    physicalOwnerOffHostEvidence: 'NOT_CLAIMED',
  },
  rollback: {
    mode: 'REVERT_ONLY_NO_CANONICAL_PROJECT_DATA_ROLLBACK',
    action: 'Revert product command manifest/test/model/receipt/ledger/governance changes.',
  },
  performanceBudget: {
    typingHotPath: 'NO_CHANGE_NOT_ON_TYPING_PATH',
    commandOverhead: 'BOUNDED_BY_EXISTING_TRUSTED_PORT_SEQUENCE',
  },
  securityBoundary: {
    userDocuments: 'FORBIDDEN',
    secretsInPayload: 'FORBIDDEN',
    productNetworkRuntime: 'FORBIDDEN',
    selfWrittenCrypto: 'FORBIDDEN',
  },
  lifecycle: {
    featureFlagDefault: 'OFF',
    rollout: 'LOCAL_CANDIDATE_ONLY_UNTIL_PHYSICAL_OWNER_GATES',
    currentVsTarget: 'CURRENT_SEAMS_BOUND_TARGET_PRODUCT_V1_NOT_READY',
  },
  negativeBypassChecks: [
    'CALLER_CARRIED_SOURCE_PROVIDER_TARGET_AUDIT_AGE_AUTHORITY_DENIED',
    'UNKNOWN_ABSTAIN_CONFLICTING_NEVER_PASS',
    'LIVE_PROJECT_OVERWRITE_DENIED',
    'TARGET_ARCHITECTURE_MUST_NOT_BE_REPORTED_AS_CURRENT_READY',
    'GOOGLE_DOCS_OR_WORD_EVIDENCE_MUST_NOT_TRANSFER_TO_BLACK_BOX_PRODUCT_V1',
    'AUTHORING_WORKING_STATE_MUST_NOT_BE_CLASSIFIED_AS_TRANSIENT',
  ],
  evidenceBindings: {
    contractTest: 'black-box-product-command-export-manual-core-v1.contract.test.js',
    model: 'black-box-product-command-export-manual-core-v1-model.mjs',
    receipt: 'YALKEN_F3_BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_RECEIPT.json',
    ledger: 'FINAL_LAB_TO_PRODUCT_TRACEABILITY_V2_LEDGER.json',
  },
  currentReality: {
    runtimeWired: true,
    commandKernelSingleEntry: true,
    productUiPathBound: true,
    fullBlackBoxProductV1: false,
    ownerKeyDrill: false,
    offHostRestore: false,
    exactByteFinalCompleteDonorReplication: false,
    projectLibraryRegistration: false,
    googleDocsEvidenceInherited: false,
  },
  effectBoundary: 'EXTERNAL_EFFECT_ARTIFACT_CREATE_ONLY',
});
