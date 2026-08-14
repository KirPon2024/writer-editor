import crypto from 'node:crypto';

import {
  BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_FEATURE_FLAG,
  BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS,
  createBlackBoxP0cProviderPinDigestV1,
  recoverBlackBoxStrictCapsuleV1,
} from './blackBoxStrictCapsuleRecoverV1.mjs';

export const BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_FEATURE_FLAG = 'yalken.blackBox.importAsNewRecoveryPlan.v1';

export const BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_SCHEMAS = Object.freeze({
  featureFlag: 'yalken.blackBoxImportAsNewRecoveryPlan.featureFlag.v1',
  plan: 'yalken.blackBoxImportAsNewRecoveryPlan.plan.v1',
  receipt: 'yalken.blackBoxImportAsNewRecoveryPlan.receipt.v1',
  request: 'yalken.blackBoxImportAsNewRecoveryPlan.request.v1',
  result: 'yalken.blackBoxImportAsNewRecoveryPlan.result.v1',
});

export const BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES = Object.freeze({
  FEATURE_DISABLED: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_FEATURE_DISABLED',
  FIELD_INVALID: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_FIELD_INVALID',
  KEYSET_INVALID: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_KEYSET_INVALID',
  P0C_RECOVER_REJECTED: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_P0C_RECOVER_REJECTED',
  PLAN_READY: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_READY',
  PLAINTEXT_OR_KEY_LEAK: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_PLAINTEXT_OR_KEY_LEAK',
  POLICY_REJECTED: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_POLICY_REJECTED',
  UPSTREAM_NOT_PASS: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_UPSTREAM_NOT_PASS',
});

const REQUEST_KEYS = Object.freeze([
  'capsule',
  'expectations',
  'expectedSourceBinding',
  'featureFlags',
  'identity',
  'providerPin',
  'schemaVersion',
]);
const EXPECTATION_KEYS = Object.freeze([
  'importMode',
  'liveProjectOverwrite',
  'quarantineRequired',
  'requireNoPlaintextInReceipt',
  'requireP0cRecoverExecution',
  'requireProviderExact',
]);
const IMPORT_AS_NEW = 'IMPORT_AS_NEW_PROJECT_ONLY';
const LEAK_PATTERN = /AGE-SECRET-KEY|bytesBase64|sourceText|synthetic manuscript|BLACK_BOX_CORE_GENOME_V1/iu;
const BLOCKING_UPSTREAM_DECISIONS = new Set(['UNKNOWN', 'ABSTAIN', 'CONFLICTING']);

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

function reason(code, field, expected, actual) {
  const out = { code, field };
  if (expected !== undefined) out.expected = expected;
  if (actual !== undefined) out.actual = actual;
  return Object.freeze(out);
}

function keysetReason(field, actual, expected) {
  return reason(BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.KEYSET_INVALID, field, expected, sortedKeys(actual));
}

function deny(code, reasons = [reason(code, 'request')], details = {}) {
  return deepFreeze({
    schemaVersion: BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_SCHEMAS.result,
    ok: false,
    decision: 'DENY',
    code,
    reasons,
    ...details,
  });
}

function pass(details) {
  return deepFreeze({
    schemaVersion: BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_SCHEMAS.result,
    ok: true,
    decision: 'PASS',
    code: BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.PLAN_READY,
    reasons: [],
    ...details,
  });
}

export function resolveBlackBoxImportAsNewRecoveryPlanFeatureFlag(featureFlags = {}) {
  const enabled = isPlainObject(featureFlags)
    && featureFlags[BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_FEATURE_FLAG] === true;
  return deepFreeze({
    schemaVersion: BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_SCHEMAS.featureFlag,
    flag: BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_FEATURE_FLAG,
    enabled,
    canWriteManuscript: false,
    canOverwriteLiveProject: false,
    canRecoverProject: false,
    canPreviewQuarantine: enabled,
    commandKernelWired: false,
    productUiWired: false,
  });
}

function validateExpectations(expectations, reasons) {
  if (!isPlainObject(expectations)) {
    reasons.push(keysetReason('expectations', expectations, EXPECTATION_KEYS));
    return;
  }
  if (!sameKeys(expectations, EXPECTATION_KEYS)) {
    reasons.push(keysetReason('expectations', expectations, EXPECTATION_KEYS));
  }
  if (expectations.importMode !== IMPORT_AS_NEW
    || expectations.liveProjectOverwrite !== false
    || expectations.quarantineRequired !== true
    || expectations.requireNoPlaintextInReceipt !== true
    || expectations.requireP0cRecoverExecution !== true
    || expectations.requireProviderExact !== true) {
    reasons.push(reason(
      BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.POLICY_REJECTED,
      'expectations',
      {
        importMode: IMPORT_AS_NEW,
        liveProjectOverwrite: false,
        quarantineRequired: true,
        requireNoPlaintextInReceipt: true,
        requireP0cRecoverExecution: true,
        requireProviderExact: true,
      },
    ));
  }
}

function validateRequest(request) {
  const reasons = [];
  if (!isPlainObject(request)) {
    return {
      ok: false,
      code: BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.KEYSET_INVALID,
      reasons: [keysetReason('request', request, REQUEST_KEYS)],
    };
  }
  if (!sameKeys(request, REQUEST_KEYS)) reasons.push(keysetReason('request', request, REQUEST_KEYS));
  if (request.schemaVersion !== BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_SCHEMAS.request) {
    reasons.push(reason(BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.FIELD_INVALID, 'schemaVersion'));
  }
  const feature = resolveBlackBoxImportAsNewRecoveryPlanFeatureFlag(request.featureFlags);
  if (!feature.enabled) {
    reasons.push(reason(BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.FEATURE_DISABLED, 'featureFlags'));
  }
  validateExpectations(request.expectations, reasons);
  if (reasons.length > 0) {
    const priority = [
      BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.KEYSET_INVALID,
      BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.FEATURE_DISABLED,
      BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.POLICY_REJECTED,
      BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.FIELD_INVALID,
    ];
    return {
      ok: false,
      code: priority.find((code) => reasons.some((entry) => entry.code === code)) || reasons[0].code,
      reasons,
    };
  }
  return { ok: true };
}

function p0cExpectationsFrom(expectations) {
  return {
    importMode: expectations.importMode,
    liveProjectOverwrite: expectations.liveProjectOverwrite,
    ownerKeyOutsideBuilder: true,
    quarantineRequired: expectations.quarantineRequired,
    requireCiphertextBoundManifest: true,
    requireNoPlaintextInReceipt: expectations.requireNoPlaintextInReceipt,
    requireProviderExact: expectations.requireProviderExact,
    requireStandardAgeV1: true,
    requireX25519Recipient: true,
  };
}

function p0cFeatureFlagsFrom(featureFlags) {
  return {
    [BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_FEATURE_FLAG]:
      isPlainObject(featureFlags) && featureFlags[BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_FEATURE_FLAG] === true,
  };
}

function validateRecoveredPolicy(recovered, providerPinDigest) {
  const reasons = [];
  if (!isPlainObject(recovered) || recovered.ok !== true || recovered.decision !== 'PASS') {
    return {
      ok: false,
      code: BLOCKING_UPSTREAM_DECISIONS.has(recovered?.decision)
        ? BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.UPSTREAM_NOT_PASS
        : BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.P0C_RECOVER_REJECTED,
      reasons: [
        reason(
          BLOCKING_UPSTREAM_DECISIONS.has(recovered?.decision)
            ? BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.UPSTREAM_NOT_PASS
            : BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.P0C_RECOVER_REJECTED,
          'p0cRecover',
          'PASS',
          recovered?.code || recovered?.decision,
        ),
        ...(Array.isArray(recovered?.reasons) ? recovered.reasons : []),
      ],
    };
  }
  const plan = recovered.recoverPlan;
  if (!isPlainObject(plan)) {
    reasons.push(reason(BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.POLICY_REJECTED, 'recoverPlan'));
  } else {
    if (plan.schemaVersion !== BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.recoverPlan) {
      reasons.push(reason(BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.POLICY_REJECTED, 'recoverPlan.schemaVersion'));
    }
    if (plan.importMode !== IMPORT_AS_NEW) {
      reasons.push(reason(BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.POLICY_REJECTED, 'recoverPlan.importMode', IMPORT_AS_NEW, plan.importMode));
    }
    if (plan.liveProjectOverwrite !== false) {
      reasons.push(reason(BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.POLICY_REJECTED, 'recoverPlan.liveProjectOverwrite', false, plan.liveProjectOverwrite));
    }
    if (!isPlainObject(plan.quarantine)
      || plan.quarantine.status !== 'QUARANTINED_PREVIEW_READY'
      || plan.quarantine.writeLiveProject !== false
      || plan.quarantine.requireOwnerConfirmBeforeImport !== true) {
      reasons.push(reason(BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.POLICY_REJECTED, 'recoverPlan.quarantine'));
    }
  }
  if (!isPlainObject(recovered.receipt)
    || recovered.receipt.providerPinDigest !== providerPinDigest
    || recovered.receipt.claims?.importAsNewProjectOnly !== 'PASS'
    || recovered.receipt.claims?.quarantinePreviewOnly !== 'PASS'
    || recovered.receipt.claims?.liveProjectOverwrite !== 'DENIED'
    || recovered.receipt.claims?.noPlaintextOrKeyMaterialInReceipt !== 'PASS') {
    reasons.push(reason(BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.POLICY_REJECTED, 'p0cReceipt.claims'));
  }
  if (reasons.length > 0) {
    return {
      ok: false,
      code: BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.POLICY_REJECTED,
      reasons,
    };
  }
  return { ok: true };
}

function buildRecoveryPlan({ request, recovered, providerPinDigest }) {
  const sourceBindingDigest = sha256Stable(recovered.recoverPlan.sourceBinding);
  return {
    schemaVersion: BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_SCHEMAS.plan,
    importMode: IMPORT_AS_NEW,
    liveProjectOverwrite: false,
    sourceBinding: recovered.recoverPlan.sourceBinding,
    sourceBindingDigest,
    providerPinDigest,
    recipientFingerprint: request.capsule.recipient.fingerprint,
    capsuleManifestDigest: request.capsule.manifest.manifestDigest,
    capsuleCiphertextSha256: request.capsule.ciphertext.sha256,
    corePayloadSha256: recovered.recoverPlan.preview.corePayloadSha256,
    plaintextSha256: recovered.recoverPlan.preview.plaintextSha256,
    quarantine: {
      status: 'QUARANTINED_PREVIEW_READY',
      writeLiveProject: false,
      requireOwnerConfirmBeforeImport: true,
    },
    commandKernelWired: false,
    productUiWired: false,
    liveProjectRestore: false,
  };
}

function buildReceipt({ recoveryPlan, recovered }) {
  return {
    schemaVersion: BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_SCHEMAS.receipt,
    code: BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.PLAN_READY,
    providerPinDigest: recoveryPlan.providerPinDigest,
    sourceBindingDigest: recoveryPlan.sourceBindingDigest,
    capsuleManifestDigest: recoveryPlan.capsuleManifestDigest,
    capsuleCiphertextSha256: recoveryPlan.capsuleCiphertextSha256,
    p0cCode: recovered.code,
    p0cReceiptDigest: sha256Stable({
      schemaVersion: recovered.receipt.schemaVersion,
      code: recovered.receipt.code,
      providerPinDigest: recovered.receipt.providerPinDigest,
      sourceBindingDigest: recovered.receipt.sourceBindingDigest,
      recipientFingerprint: recovered.receipt.recipientFingerprint,
      manifestDigest: recovered.receipt.manifestDigest,
      ciphertextSha256: recovered.receipt.ciphertextSha256,
      plaintextSha256: recovered.receipt.plaintextSha256,
      corePayloadSha256: recovered.receipt.corePayloadSha256,
      claims: recovered.receipt.claims,
    }),
    claims: {
      p0cRecoverExecuted: 'PASS',
      importAsNewProjectOnly: 'PASS',
      quarantinePreviewOnly: 'PASS',
      liveProjectOverwrite: 'DENIED',
      noPlaintextOrKeyMaterialInReceipt: 'PASS',
      productRuntimeWiring: 'NOT_CLAIMED',
      commandKernelWiring: 'NOT_CLAIMED',
      productUiWiring: 'NOT_CLAIMED',
      ownerKeyRecoveryDrill: 'NOT_CLAIMED',
      disasterReady: 'NOT_CLAIMED',
    },
    limitations: {
      readOnlyPlanOnly: true,
      userDocuments: 'FORBIDDEN_IN_THIS_CONTOUR',
      liveProjectRestore: 'NOT_CLAIMED',
      liveProjectOverwrite: 'DENIED',
      finalCompleteDonor: 'NOT_CLAIMED',
      physicalPowerLossProof: 'NOT_CLAIMED',
    },
  };
}

function includesPlaintextOrKeyLeak(value) {
  return LEAK_PATTERN.test(JSON.stringify(value));
}

export async function prepareBlackBoxImportAsNewRecoveryPlanV1(request = {}, options = {}) {
  const validation = validateRequest(request);
  if (!validation.ok) return deny(validation.code, validation.reasons);

  const recover = typeof options.recoverStrictCapsule === 'function'
    ? options.recoverStrictCapsule
    : recoverBlackBoxStrictCapsuleV1;
  const p0cRequest = {
    schemaVersion: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.recoverRequest,
    featureFlags: p0cFeatureFlagsFrom(request.featureFlags),
    providerPin: request.providerPin,
    expectedSourceBinding: request.expectedSourceBinding,
    capsule: request.capsule,
    identity: request.identity,
    expectations: p0cExpectationsFrom(request.expectations),
  };
  let recovered;
  try {
    recovered = await recover(p0cRequest, { ageProvider: options.ageProvider });
  } catch {
    return deny(BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.P0C_RECOVER_REJECTED, [
      reason(BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.P0C_RECOVER_REJECTED, 'p0cRecover'),
    ]);
  }

  const providerPinDigest = createBlackBoxP0cProviderPinDigestV1(request.providerPin);
  const policy = validateRecoveredPolicy(recovered, providerPinDigest);
  if (!policy.ok) return deny(policy.code, policy.reasons, { p0cCode: recovered?.code });

  const recoveryPlan = buildRecoveryPlan({ request, recovered, providerPinDigest });
  const receipt = buildReceipt({ recoveryPlan, recovered });
  const result = { recoveryPlan, receipt };
  if (includesPlaintextOrKeyLeak(result)) {
    return deny(BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.PLAINTEXT_OR_KEY_LEAK, [
      reason(BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.PLAINTEXT_OR_KEY_LEAK, 'result'),
    ]);
  }
  return pass(result);
}
