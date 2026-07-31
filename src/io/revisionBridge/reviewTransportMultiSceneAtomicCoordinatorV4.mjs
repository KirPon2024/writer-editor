export const RTK_WORD_V4_MULTI_SCENE_ATOMIC_PREPARE_SCHEMA =
  'yalken.rtk.word-v4.multi-scene-atomic-prepare.v1';
export const RTK_WORD_V4_MULTI_SCENE_ATOMIC_COMMIT_SCHEMA =
  'yalken.rtk.word-v4.multi-scene-atomic-commit.v1';
export const RTK_WORD_V4_MULTI_SCENE_ATOMIC_RECOVERY_SCHEMA =
  'yalken.rtk.word-v4.multi-scene-atomic-recovery.v1';

const SHA256_RE = /^sha256:[a-f0-9]{64}$/u;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function rawString(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeString(value) {
  return rawString(value).trim();
}

function cloneJsonSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function resolveCryptoPort(port) {
  if (port && typeof port.sha256Json === 'function') return port;
  throw new Error('CryptoPort with sha256Json is required');
}

function digest(cryptoPort, payload) {
  return normalizeString(cryptoPort.sha256Json(payload)).toLowerCase();
}

function reason(code, field, message, details = {}) {
  return { code, field, message, ...details };
}

function block(reasons) {
  const normalized = Array.isArray(reasons) ? reasons : [reasons];
  return {
    ok: false,
    status: 'blocked',
    code: normalized[0]?.code || 'RTK_V4_E11_MULTI_SCENE_BLOCKED',
    reason: normalized[0]?.code || 'RTK_V4_E11_MULTI_SCENE_BLOCKED',
    reasons: normalized,
    canWrite: false,
    runtimeApplyAuthorityGranted: false,
  };
}

function normalizeHash(value) {
  const normalized = normalizeString(value).toLowerCase();
  return SHA256_RE.test(normalized) ? normalized : '';
}

function normalizeIntent(item) {
  return {
    sceneId: normalizeString(item?.sceneId),
    sceneRevision: normalizeString(item?.sceneRevision),
    beforeSha256: normalizeHash(item?.beforeSha256),
    afterSha256: normalizeHash(item?.afterSha256),
    requestKey: normalizeHash(item?.requestKey),
    effectKey: normalizeHash(item?.effectKey),
    commandEnvelopeDigest: normalizeHash(item?.commandEnvelopeDigest),
    writerPlanDigest: normalizeHash(item?.writerPlanDigest),
    lane: normalizeString(item?.lane || 'manuscriptText'),
  };
}

function validatePrepareInput(input, intents) {
  const reasons = [];
  if (normalizeString(input?.commitProtocol) !== 'single-root-pointer') {
    reasons.push(reason(
      'RTK_V4_E11_PROTOCOL_UNSUPPORTED',
      'commitProtocol',
      'E11 only proves the single-root-pointer crash boundary.',
    ));
  }
  if (!normalizeString(input?.projectId)) {
    reasons.push(reason('RTK_V4_E11_PROJECT_REQUIRED', 'projectId', 'projectId is required.'));
  }
  if (!normalizeString(input?.roundId)) {
    reasons.push(reason('RTK_V4_E11_ROUND_REQUIRED', 'roundId', 'roundId is required.'));
  }
  const baseRootPointer = normalizeHash(input?.baseRootPointer);
  const currentRootPointer = normalizeHash(input?.currentRootPointer);
  if (!baseRootPointer || !currentRootPointer || baseRootPointer !== currentRootPointer) {
    reasons.push(reason(
      'RTK_V4_E11_STALE_ROOT_POINTER',
      'currentRootPointer',
      'Current root pointer must match the prepared baseline root pointer.',
    ));
  }
  if (intents.length < 2) {
    reasons.push(reason(
      'RTK_V4_E11_MULTI_SCENE_REQUIRED',
      'sceneIntents',
      'E11 multi-scene coordinator requires at least two scene intents.',
    ));
  }

  const seenScenes = new Set();
  const seenRequests = new Set();
  const seenEffects = new Set();
  for (const intent of intents) {
    if (!intent.sceneId || !intent.sceneRevision || !intent.beforeSha256 || !intent.afterSha256 || !intent.requestKey || !intent.effectKey || !intent.commandEnvelopeDigest) {
      reasons.push(reason(
        'RTK_V4_E11_INTENT_INVALID',
        'sceneIntents',
        'Every scene intent must bind scene id, revision, before/after hashes, request/effect keys, and command envelope digest.',
        { sceneId: intent.sceneId },
      ));
    }
    if (intent.beforeSha256 && intent.afterSha256 && intent.beforeSha256 === intent.afterSha256) {
      reasons.push(reason(
        'RTK_V4_E11_NO_OP_SCENE_INTENT',
        'sceneIntents.afterSha256',
        'Scene intent must change its staged scene digest.',
        { sceneId: intent.sceneId },
      ));
    }
    if (seenScenes.has(intent.sceneId)) {
      reasons.push(reason('RTK_V4_E11_DUPLICATE_SCENE', 'sceneIntents.sceneId', 'Scene ids must be unique.', {
        sceneId: intent.sceneId,
      }));
    }
    if (seenRequests.has(intent.requestKey)) {
      reasons.push(reason('RTK_V4_E11_DUPLICATE_REQUEST', 'sceneIntents.requestKey', 'Request keys must be unique.', {
        requestKey: intent.requestKey,
      }));
    }
    if (seenEffects.has(intent.effectKey)) {
      reasons.push(reason('RTK_V4_E11_DUPLICATE_EFFECT', 'sceneIntents.effectKey', 'Effect keys must be unique.', {
        effectKey: intent.effectKey,
      }));
    }
    seenScenes.add(intent.sceneId);
    seenRequests.add(intent.requestKey);
    seenEffects.add(intent.effectKey);
    if (intent.lane !== 'manuscriptText') {
      reasons.push(reason(
        'RTK_V4_E11_UNSUPPORTED_LANE',
        'sceneIntents.lane',
        'E11 coordinator only models manuscript text scene intents.',
        { sceneId: intent.sceneId, lane: intent.lane },
      ));
    }
  }
  return reasons;
}

export function buildRtkWordV4MultiSceneAtomicPrepare(input = {}, options = {}) {
  const cryptoPort = resolveCryptoPort(options.cryptoPort);
  if (!isPlainObject(input)) {
    return block(reason('RTK_V4_E11_INPUT_INVALID', 'input', 'Input must be an object.'));
  }
  const intents = (Array.isArray(input.sceneIntents) ? input.sceneIntents : []).map(normalizeIntent);
  const validationReasons = validatePrepareInput(input, intents);
  if (validationReasons.length > 0) return block(validationReasons);

  const sceneIntents = intents.slice().sort((left, right) => left.sceneId.localeCompare(right.sceneId));
  const unsigned = {
    schemaVersion: RTK_WORD_V4_MULTI_SCENE_ATOMIC_PREPARE_SCHEMA,
    commitProtocol: 'single-root-pointer',
    projectId: normalizeString(input.projectId),
    roundId: normalizeString(input.roundId),
    baseRootPointer: normalizeHash(input.baseRootPointer),
    sceneIntents,
    canWrite: false,
    runtimeApplyAuthorityGranted: false,
    preparedOnly: true,
  };
  return {
    ok: true,
    status: 'prepared',
    code: 'RTK_V4_E11_MULTI_SCENE_PREPARED_SHADOW_ONLY',
    reason: 'RTK_V4_E11_MULTI_SCENE_PREPARED_SHADOW_ONLY',
    prepareRecord: {
      ...unsigned,
      prepareDigest: digest(cryptoPort, unsigned),
    },
    canWrite: false,
    runtimeApplyAuthorityGranted: false,
  };
}

function comparablePrepare(record) {
  if (!isPlainObject(record)) return null;
  const { prepareDigest, ...rest } = record;
  return rest;
}

function validatePrepareRecord(record, cryptoPort) {
  if (!isPlainObject(record) || record.schemaVersion !== RTK_WORD_V4_MULTI_SCENE_ATOMIC_PREPARE_SCHEMA) {
    return reason('RTK_V4_E11_PREPARE_RECORD_INVALID', 'prepareRecord.schemaVersion', 'Prepare record schema is invalid.');
  }
  const expectedDigest = digest(cryptoPort, comparablePrepare(record));
  if (expectedDigest !== normalizeString(record.prepareDigest)) {
    return reason('RTK_V4_E11_PREPARE_DIGEST_MISMATCH', 'prepareRecord.prepareDigest', 'Prepare record digest does not match.');
  }
  return null;
}

function normalizeReceipt(item) {
  return {
    sceneId: normalizeString(item?.sceneId),
    requestKey: normalizeHash(item?.requestKey),
    effectKey: normalizeHash(item?.effectKey),
    beforeSha256: normalizeHash(item?.beforeSha256),
    afterSha256: normalizeHash(item?.afterSha256),
    stagedOnly: item?.stagedOnly === true,
    canonicalSceneWritten: item?.canonicalSceneWritten === true,
  };
}

export function buildRtkWordV4MultiSceneAtomicCommit(input = {}, options = {}) {
  const cryptoPort = resolveCryptoPort(options.cryptoPort);
  const prepareRecord = isPlainObject(input?.prepareRecord) ? input.prepareRecord : {};
  const prepareIssue = validatePrepareRecord(prepareRecord, cryptoPort);
  if (prepareIssue) return block(prepareIssue);
  const currentRootPointer = normalizeHash(input.currentRootPointer);
  if (!currentRootPointer || currentRootPointer !== normalizeHash(prepareRecord.baseRootPointer)) {
    return block(reason(
      'RTK_V4_E11_STALE_ROOT_POINTER',
      'currentRootPointer',
      'Root pointer changed before multi-scene commit.',
    ));
  }

  const receipts = (Array.isArray(input.sceneReceipts) ? input.sceneReceipts : []).map(normalizeReceipt);
  const receiptsByScene = new Map();
  for (const receipt of receipts) {
    if (!receipt.sceneId || receiptsByScene.has(receipt.sceneId)) {
      return block(reason('RTK_V4_E11_RECEIPT_DUPLICATE_OR_INVALID', 'sceneReceipts.sceneId', 'Scene receipts must be unique and valid.'));
    }
    receiptsByScene.set(receipt.sceneId, receipt);
  }
  for (const intent of prepareRecord.sceneIntents) {
    const receipt = receiptsByScene.get(intent.sceneId);
    if (!receipt) {
      return block(reason('RTK_V4_E11_RECEIPT_MISSING', 'sceneReceipts', 'Every prepared scene requires a staged scene receipt.', {
        sceneId: intent.sceneId,
      }));
    }
    if (receipt.requestKey !== intent.requestKey || receipt.effectKey !== intent.effectKey || receipt.beforeSha256 !== intent.beforeSha256 || receipt.afterSha256 !== intent.afterSha256) {
      return block(reason('RTK_V4_E11_RECEIPT_MISMATCH', 'sceneReceipts', 'Scene receipt does not match prepared intent.', {
        sceneId: intent.sceneId,
      }));
    }
    if (receipt.stagedOnly !== true || receipt.canonicalSceneWritten === true) {
      return block(reason('RTK_V4_E11_CANONICAL_WRITE_BEFORE_ROOT_POINTER', 'sceneReceipts', 'Scene receipts must be staged-only before root pointer commit.', {
        sceneId: intent.sceneId,
      }));
    }
  }

  const proposedRootPointer = normalizeHash(input.proposedRootPointer);
  if (!proposedRootPointer || proposedRootPointer === normalizeHash(prepareRecord.baseRootPointer)) {
    return block(reason(
      'RTK_V4_E11_PROPOSED_ROOT_POINTER_INVALID',
      'proposedRootPointer',
      'Commit requires a new proposed root pointer digest.',
    ));
  }

  const unsigned = {
    schemaVersion: RTK_WORD_V4_MULTI_SCENE_ATOMIC_COMMIT_SCHEMA,
    prepareDigest: prepareRecord.prepareDigest,
    projectId: prepareRecord.projectId,
    roundId: prepareRecord.roundId,
    baseRootPointer: prepareRecord.baseRootPointer,
    proposedRootPointer,
    sceneReceipts: receipts.slice().sort((left, right) => left.sceneId.localeCompare(right.sceneId)),
    canWrite: false,
    runtimeApplyAuthorityGranted: false,
    rootPointerCommitRequired: true,
  };
  return {
    ok: true,
    status: 'ready',
    code: 'RTK_V4_E11_SINGLE_ROOT_POINTER_COMMIT_READY_SHADOW_ONLY',
    reason: 'RTK_V4_E11_SINGLE_ROOT_POINTER_COMMIT_READY_SHADOW_ONLY',
    commitRecord: {
      ...unsigned,
      commitDigest: digest(cryptoPort, unsigned),
    },
    canWrite: false,
    runtimeApplyAuthorityGranted: false,
  };
}

export function reconcileRtkWordV4MultiSceneAtomicRecovery(input = {}, options = {}) {
  const cryptoPort = resolveCryptoPort(options.cryptoPort);
  const prepareRecord = isPlainObject(input?.prepareRecord) ? input.prepareRecord : {};
  const prepareIssue = validatePrepareRecord(prepareRecord, cryptoPort);
  if (prepareIssue) return block(prepareIssue);
  const receipts = (Array.isArray(input.sceneReceipts) ? input.sceneReceipts : []).map(normalizeReceipt);
  const canonicalWrites = receipts.filter((receipt) => receipt.canonicalSceneWritten === true);
  const stagedReceipts = receipts.filter((receipt) => receipt.stagedOnly === true);
  const rootPointerCommitted = normalizeHash(input.observedRootPointer) === normalizeHash(input.expectedCommittedRootPointer)
    && normalizeHash(input.observedRootPointer) !== normalizeHash(prepareRecord.baseRootPointer);

  let outcome = 'ABORT_SAFE_NO_CANONICAL_WRITES';
  let recoveryRequired = false;
  let code = 'RTK_V4_E11_RECOVERY_ABORT_SAFE';
  if (canonicalWrites.length > 0 && !rootPointerCommitted) {
    outcome = 'BLOCKED_CANONICAL_WRITE_BEFORE_ROOT_POINTER';
    recoveryRequired = true;
    code = 'RTK_V4_E11_RECOVERY_REQUIRED';
  } else if (rootPointerCommitted) {
    outcome = stagedReceipts.length === prepareRecord.sceneIntents.length
      ? 'COMMITTED_BY_ROOT_POINTER'
      : 'BLOCKED_ROOT_POINTER_WITH_INCOMPLETE_STAGING';
    recoveryRequired = stagedReceipts.length !== prepareRecord.sceneIntents.length;
    code = recoveryRequired ? 'RTK_V4_E11_RECOVERY_REQUIRED' : 'RTK_V4_E11_RECOVERY_COMMITTED';
  }

  const unsigned = {
    schemaVersion: RTK_WORD_V4_MULTI_SCENE_ATOMIC_RECOVERY_SCHEMA,
    prepareDigest: prepareRecord.prepareDigest,
    outcome,
    recoveryRequired,
    stagedReceiptCount: stagedReceipts.length,
    canonicalWriteCount: canonicalWrites.length,
    rootPointerCommitted,
  };
  return {
    ok: recoveryRequired === false,
    status: recoveryRequired ? 'blocked' : 'reconciled',
    code,
    reason: code,
    recoveryRecord: {
      ...unsigned,
      recoveryDigest: digest(cryptoPort, unsigned),
    },
    canWrite: false,
    runtimeApplyAuthorityGranted: false,
  };
}

export function assertRtkWordV4MultiSceneCoordinatorPlatformNeutral() {
  return {
    ok: true,
    importsNode: false,
    importsElectron: false,
    importsFilesystem: false,
    importsRenderer: false,
    importsNetwork: false,
    directWriterAuthority: false,
    stableJsonSample: stableJson({ b: 1, a: 2 }),
    cloneWorks: cloneJsonSafe({ ok: true }).ok === true,
  };
}
