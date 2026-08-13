import {
  RTK_APPLY_ELIGIBLE_LIFECYCLE_STATES,
  RTK_EXACT_APPLY_COMMAND_ENVELOPE_V2_SCHEMA,
  RTK_EXACT_APPLY_OUTCOME_V2_SCHEMA,
  RTK_EXACT_APPLY_OUTCOME_EFFECT_INDEX_V1_SCHEMA,
  RTK_EXACT_APPLY_RECOVERY_RESOLUTION_V2_SCHEMA,
  RTK_EXACT_APPLY_RESERVATION_STATE_V1_SCHEMA,
  RTK_EXACT_APPLY_RESERVATION_V1_SCHEMA,
  RTK_REASON_CODES,
  stableJson,
} from './reviewTransportCore.mjs';
import {
  evaluateSourceFenceV1,
  SOURCE_FENCE_V1_CODES,
  SOURCE_FENCE_V1_SCHEMAS,
} from '../../product/sourceFenceV1.mjs';

export {
  RTK_EXACT_APPLY_COMMAND_ENVELOPE_V2_SCHEMA,
  RTK_EXACT_APPLY_OUTCOME_V2_SCHEMA,
  RTK_EXACT_APPLY_OUTCOME_EFFECT_INDEX_V1_SCHEMA,
  RTK_EXACT_APPLY_RECOVERY_RESOLUTION_V2_SCHEMA,
  RTK_EXACT_APPLY_RESERVATION_STATE_V1_SCHEMA,
  RTK_EXACT_APPLY_RESERVATION_V1_SCHEMA,
};

export const SOURCE_TOKEN_DOMAIN_V1 = 'SOURCE_TOKEN_DOMAIN_V1';
export const WRITER_TEXT_DOMAIN_V1 = 'WRITER_TEXT_DOMAIN_V1';
export const RTK_EXACT_APPLY_INTENT = 'rtk.exactApply';
export const RTK_ROUND_AUTHORITY_SOURCE_FENCE_V1_SCHEMA =
  'yalken.rtk.round-authority-source-fence.v1';

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const HEX_HASH_PATTERN = /^[a-f0-9]{64}$/u;
const BLOCKED_CALLERS = new Set(['renderer', 'parser', 'comments', 'ui', 'ai', 'worker']);
const SOURCE_FENCE_BINDING_KEYS = Object.freeze(['request', 'result', 'schemaVersion']);
const RTK_SOURCE_FENCE_REASON_CODES = Object.freeze([
  'RTK_SOURCE_FENCE_AUTHORITY_MISMATCH',
  'RTK_SOURCE_FENCE_IDENTITY_MISMATCH',
  'RTK_SOURCE_FENCE_PURPOSE_INVALID',
  'RTK_SOURCE_FENCE_REJECTED',
  'RTK_SOURCE_FENCE_REQUIRED',
  'RTK_SOURCE_FENCE_RESULT_MISMATCH',
  'RTK_SOURCE_FENCE_SCHEMA_INVALID',
]);
const RTK_EXACT_APPLY_REASON_CATALOG = Object.freeze([
  ...RTK_REASON_CODES,
  ...RTK_SOURCE_FENCE_REASON_CODES,
]);

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

function sortedKeys(value) {
  return isPlainObject(value) ? Object.keys(value).sort() : [];
}

function sameKeys(value, expected) {
  const keys = sortedKeys(value);
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function normalizeHash(value) {
  const text = normalizeString(value).toLowerCase();
  if (HASH_PATTERN.test(text)) return text;
  if (HEX_HASH_PATTERN.test(text)) return `sha256:${text}`;
  return '';
}

function reason(code, field, message, details = {}) {
  return { code, field, message, ...details };
}

function blockResult(reasons) {
  const normalized = Array.isArray(reasons) ? reasons : [reasons];
  return {
    ok: false,
    status: 'blocked',
    code: normalized[0]?.code || 'RTK_WRITE_PRECONDITION_FAILED',
    reason: normalized[0]?.code || 'RTK_WRITE_PRECONDITION_FAILED',
    reasons: normalized,
    envelope: null,
  };
}

function okResult(envelope) {
  return {
    ok: true,
    status: 'ready',
    code: 'RTK_COMMAND_ENVELOPE_BOUND',
    reason: 'RTK_COMMAND_ENVELOPE_BOUND',
    reasons: [],
    envelope,
  };
}

function resolveCryptoPort(port) {
  if (port && typeof port.sha256Text === 'function' && typeof port.sha256Json === 'function') {
    return port;
  }
  throw new Error('CryptoPort with sha256Text and sha256Json is required');
}

function canonicalKey(cryptoPort, payload) {
  return normalizeHash(cryptoPort.sha256Json(payload));
}

function normalizeTextChange(item) {
  const textChange = isPlainObject(item?.textChange) ? item.textChange : item;
  const match = isPlainObject(textChange?.match) ? textChange.match : {};
  const blockRange = isPlainObject(match.blockRange) ? match.blockRange : {};
  return {
    changeId: normalizeString(textChange?.changeId),
    sceneId: normalizeString(textChange?.targetScope?.id),
    targetScopeType: normalizeString(textChange?.targetScope?.type),
    matchKind: normalizeString(match.kind),
    quote: rawString(match.quote),
    blockId: normalizeString(match.blockId || blockRange.blockId),
    blockRangeDigest: normalizeString(blockRange.rangeDigest),
    blockLocalStart: Number.isSafeInteger(blockRange.blockLocalStart)
      ? blockRange.blockLocalStart
      : (Number.isSafeInteger(match.blockLocalStart) ? match.blockLocalStart : null),
    blockLocalEnd: Number.isSafeInteger(blockRange.blockLocalEnd)
      ? blockRange.blockLocalEnd
      : (Number.isSafeInteger(match.blockLocalEnd) ? match.blockLocalEnd : null),
    replacementText: rawString(textChange?.replacementText),
  };
}

function normalizeReviewItems(writerInput) {
  const items = Array.isArray(writerInput?.reviewItems)
    ? writerInput.reviewItems
    : Array.isArray(writerInput?.textChanges)
      ? writerInput.textChanges
      : [];
  return items.filter(isPlainObject).map(normalizeTextChange);
}

function semanticChanges(writerInput) {
  return normalizeReviewItems(writerInput)
    .map((item) => ({
      changeId: item.changeId,
      sceneId: item.sceneId,
      targetScopeType: item.targetScopeType,
      matchKind: item.matchKind,
      quote: item.quote,
      blockId: item.blockId,
      blockRangeDigest: item.blockRangeDigest,
      blockLocalStart: item.blockLocalStart,
      blockLocalEnd: item.blockLocalEnd,
      replacementText: item.replacementText,
    }))
    .sort((left, right) => (
      left.sceneId.localeCompare(right.sceneId)
      || left.changeId.localeCompare(right.changeId)
      || left.quote.localeCompare(right.quote)
      || left.replacementText.localeCompare(right.replacementText)
    ));
}

function normalizeCommandAuthority(authority) {
  return {
    issuer: normalizeString(authority?.issuer),
    intent: normalizeString(authority?.intent),
    commandId: normalizeString(authority?.commandId),
  };
}

function normalizeDisposition(input) {
  const disposition = isPlainObject(input?.candidateDisposition) ? input.candidateDisposition : {};
  return {
    textLane: normalizeString(disposition.textLane || input?.textLaneDisposition),
    commentLane: normalizeString(disposition.commentLane || input?.commentLaneDisposition),
    priority: normalizeString(disposition.priority || input?.candidatePriority),
  };
}

function normalizeLifecycleState(input) {
  return normalizeString(input?.returnLifecycleState || input?.lifecycleState);
}

function normalizeIdentityPair(input) {
  const source = isPlainObject(input?.sourceIdentity) ? input.sourceIdentity : {};
  const current = isPlainObject(input?.currentIdentity) ? input.currentIdentity : {};
  return {
    sourceTokenDomain: normalizeString(source.sourceTokenDomain || input?.sourceTokenDomain),
    writerTextDomain: normalizeString(source.writerTextDomain || input?.writerTextDomain),
    projectId: normalizeString(source.projectId || input?.projectId),
    rootId: normalizeString(source.rootId || input?.rootId),
    documentId: normalizeString(source.documentId || input?.documentId),
    canonicalRevision: normalizeString(source.canonicalRevision || source.sourceCanonicalRevision),
    workingRevision: normalizeString(source.workingRevision || source.sourceWorkingRevision),
    sourceRevisionSha256: normalizeHash(source.revisionSha256 || source.sourceRevisionSha256),
    sourceRawBytesSha256: normalizeHash(source.rawBytesSha256 || source.sourceRawBytesSha256),
    currentProjectId: normalizeString(current.projectId || current.currentProjectId),
    currentRootId: normalizeString(current.rootId || current.currentRootId),
    currentDocumentId: normalizeString(current.documentId || current.currentDocumentId),
    currentCanonicalRevision: normalizeString(current.canonicalRevision || current.currentCanonicalRevision),
    currentWorkingRevision: normalizeString(current.workingRevision || current.currentWorkingRevision),
    currentRevisionSha256: normalizeHash(current.revisionSha256 || current.currentRevisionSha256),
    currentRawBytesSha256: normalizeHash(current.rawBytesSha256 || current.currentRawBytesSha256),
  };
}

function validateEnvelopeInput(input, writerSemanticChanges) {
  const reasons = [];
  const callerRole = normalizeString(input?.callerRole);
  const authority = normalizeCommandAuthority(input?.commandAuthority);
  const lifecycleState = normalizeLifecycleState(input);
  const identity = normalizeIdentityPair(input);
  const disposition = normalizeDisposition(input);

  if (BLOCKED_CALLERS.has(callerRole)) {
    reasons.push(reason(
      'RTK_COMMAND_AUTHORITY_BLOCKED',
      'callerRole',
      'Only main command authority can request exact apply.',
      { callerRole },
    ));
  }
  if (authority.issuer !== 'main' || authority.intent !== RTK_EXACT_APPLY_INTENT || !authority.commandId) {
    reasons.push(reason(
      'RTK_COMMAND_AUTHORITY_BLOCKED',
      'commandAuthority',
      'Exact apply requires a main-owned command authority token.',
      { expectedIntent: RTK_EXACT_APPLY_INTENT },
    ));
  }
  if (!RTK_APPLY_ELIGIBLE_LIFECYCLE_STATES.includes(lifecycleState)) {
    reasons.push(reason(
      'RTK_APPLY_STATE_NOT_ELIGIBLE',
      'returnLifecycleState',
      'Exact apply requires the returned round to be in RETURN_ANALYZED lifecycle before writer admission.',
      { lifecycleState, eligibleStates: RTK_APPLY_ELIGIBLE_LIFECYCLE_STATES },
    ));
  }
  if (identity.sourceTokenDomain !== SOURCE_TOKEN_DOMAIN_V1) {
    reasons.push(reason(
      'RTK_WRITE_PRECONDITION_FAILED',
      'sourceIdentity.sourceTokenDomain',
      'Source-token domain is not canonical.',
    ));
  }
  if (identity.writerTextDomain !== WRITER_TEXT_DOMAIN_V1) {
    reasons.push(reason(
      'RTK_WRITE_PRECONDITION_FAILED',
      'sourceIdentity.writerTextDomain',
      'Writer-text domain is not canonical.',
    ));
  }
  if (!identity.sourceRevisionSha256 || identity.sourceRevisionSha256 !== identity.currentRevisionSha256) {
    reasons.push(reason(
      'RTK_BLOCKED_STALE_REVISION',
      'sourceIdentity.revisionSha256',
      'Returned review revision identity is stale.',
    ));
  }
  if (!identity.sourceRawBytesSha256 || identity.sourceRawBytesSha256 !== identity.currentRawBytesSha256) {
    reasons.push(reason(
      'RTK_BLOCKED_STALE_BYTES',
      'sourceIdentity.rawBytesSha256',
      'Returned review raw-byte identity is stale.',
    ));
  }
  if (writerSemanticChanges.length > 0 && disposition.textLane !== 'RTK_EXACT_APPLICABLE') {
    reasons.push(reason(
      'RTK_WRITE_PRECONDITION_FAILED',
      'candidateDisposition.textLane',
      'Text lane must be independently marked exact-applicable before writer admission.',
      { textLane: disposition.textLane },
    ));
  }
  const sourceFence = validateRoundAuthoritySourceFence(input, identity, authority, writerSemanticChanges);
  reasons.push(...sourceFence.reasons);
  return { reasons, sourceFence: sourceFence.envelopeSourceFence };
}

function validateRoundAuthoritySourceFence(input, identity, authority, writerSemanticChanges) {
  const binding = input?.sourceFence;
  const reasons = [];
  if (!isPlainObject(binding)) {
    return {
      reasons: [reason(
        'RTK_SOURCE_FENCE_REQUIRED',
        'sourceFence',
        'Exact apply requires a closed Product Core sourceFenceV1 WRITE_SOURCE revalidation binding.',
      )],
      envelopeSourceFence: null,
    };
  }
  if (!sameKeys(binding, SOURCE_FENCE_BINDING_KEYS)) {
    reasons.push(reason(
      'RTK_SOURCE_FENCE_SCHEMA_INVALID',
      'sourceFence',
      'Source fence binding must use the exact schema/request/result keyset.',
      { expectedKeys: SOURCE_FENCE_BINDING_KEYS, actualKeys: sortedKeys(binding) },
    ));
  }
  if (binding.schemaVersion !== RTK_ROUND_AUTHORITY_SOURCE_FENCE_V1_SCHEMA) {
    reasons.push(reason(
      'RTK_SOURCE_FENCE_SCHEMA_INVALID',
      'sourceFence.schemaVersion',
      'Source fence binding schema is not the T0 round-authority source-fence profile.',
      {
        expected: RTK_ROUND_AUTHORITY_SOURCE_FENCE_V1_SCHEMA,
        actual: normalizeString(binding.schemaVersion),
      },
    ));
  }
  if (!isPlainObject(binding.request) || !isPlainObject(binding.result)) {
    reasons.push(reason(
      'RTK_SOURCE_FENCE_SCHEMA_INVALID',
      'sourceFence',
      'Source fence binding requires request and result objects.',
    ));
    return { reasons, envelopeSourceFence: null };
  }

  const computed = evaluateSourceFenceV1(binding.request);
  if (stableJson(binding.result) !== stableJson(computed)) {
    reasons.push(reason(
      'RTK_SOURCE_FENCE_RESULT_MISMATCH',
      'sourceFence.result',
      'Caller-carried source fence result does not match a fresh Product Core recomputation.',
      {
        expectedCode: computed.code,
        observedCode: normalizeString(binding.result?.code),
      },
    ));
  }

  const observed = isPlainObject(computed?.observed) ? computed.observed : {};
  if (
    binding.request?.schemaVersion !== SOURCE_FENCE_V1_SCHEMAS.request
    || binding.result?.schemaVersion !== SOURCE_FENCE_V1_SCHEMAS.result
  ) {
    reasons.push(reason(
      'RTK_SOURCE_FENCE_SCHEMA_INVALID',
      'sourceFence.sourceFenceV1Schema',
      'Source fence request/result must use sourceFenceV1 schemas.',
      {
        requestSchema: normalizeString(binding.request?.schemaVersion),
        resultSchema: normalizeString(binding.result?.schemaVersion),
      },
    ));
  }
  if (normalizeString(binding.request?.purpose) !== 'WRITE_SOURCE' || normalizeString(observed.purpose) !== 'WRITE_SOURCE') {
    reasons.push(reason(
      'RTK_SOURCE_FENCE_PURPOSE_INVALID',
      'sourceFence.request.purpose',
      'Exact apply can reserve writer authority only with a WRITE_SOURCE source fence.',
      { observedPurpose: normalizeString(observed.purpose) },
    ));
  }
  if (normalizeString(binding.request?.authority?.commandId) !== authority.commandId) {
    reasons.push(reason(
      'RTK_SOURCE_FENCE_AUTHORITY_MISMATCH',
      'sourceFence.request.authority.commandId',
      'Source fence authority must be bound to the same main command id.',
      {
        expectedCommandId: authority.commandId,
        observedCommandId: normalizeString(binding.request?.authority?.commandId),
      },
    ));
  }
  if (computed.ok !== true || computed.decision !== 'ALLOW' || computed.code !== SOURCE_FENCE_V1_CODES.ALLOWED) {
    reasons.push(reason(
      'RTK_SOURCE_FENCE_REJECTED',
      'sourceFence.result',
      'Source fence did not recompute to ALLOW; writer authority remains closed.',
      { sourceFenceCode: normalizeString(computed.code) },
    ));
  }

  const identityMismatches = [];
  for (const requiredField of ['projectId', 'rootId', 'documentId', 'canonicalRevision', 'workingRevision']) {
    if (!identity[requiredField]) {
      identityMismatches.push({ field: requiredField, expected: 'present', actual: '' });
    }
  }
  const compareIfPresent = (field, expected, actual) => {
    if (expected && expected !== actual) identityMismatches.push({ field, expected, actual });
  };
  compareIfPresent('projectId', identity.projectId, normalizeString(observed.projectId));
  compareIfPresent('rootId', identity.rootId, normalizeString(observed.rootId));
  compareIfPresent('documentId', identity.documentId, normalizeString(observed.documentId));
  compareIfPresent('canonicalRevision', identity.canonicalRevision, normalizeString(observed.canonicalRevision));
  compareIfPresent('workingRevision', identity.workingRevision, normalizeString(observed.workingRevision));
  compareIfPresent('sourceRevisionSha256', identity.sourceRevisionSha256, normalizeString(observed.canonicalRevision));
  compareIfPresent('currentRevisionSha256', identity.currentRevisionSha256, normalizeString(observed.canonicalRevision));
  compareIfPresent('sourceRawBytesSha256', identity.sourceRawBytesSha256, normalizeString(observed.sourceDigest));
  compareIfPresent('currentRawBytesSha256', identity.currentRawBytesSha256, normalizeString(observed.sourceDigest));
  compareIfPresent('currentProjectId', identity.currentProjectId, normalizeString(observed.projectId));
  compareIfPresent('currentRootId', identity.currentRootId, normalizeString(observed.rootId));
  compareIfPresent('currentDocumentId', identity.currentDocumentId, normalizeString(observed.documentId));
  compareIfPresent('currentCanonicalRevision', identity.currentCanonicalRevision, normalizeString(observed.canonicalRevision));
  compareIfPresent('currentWorkingRevision', identity.currentWorkingRevision, normalizeString(observed.workingRevision));
  const writerInput = isPlainObject(input?.writerInput) ? input.writerInput : {};
  compareIfPresent('writerInput.projectSnapshot.projectId', normalizeString(writerInput?.projectSnapshot?.projectId), normalizeString(observed.projectId));
  compareIfPresent('writerInput.revisionSession.projectId', normalizeString(writerInput?.revisionSession?.projectId), normalizeString(observed.projectId));
  const writerSceneIds = [...new Set(
    (Array.isArray(writerSemanticChanges) ? writerSemanticChanges : [])
      .map((item) => normalizeString(item.sceneId))
      .filter(Boolean),
  )].sort();
  if (writerSceneIds.length > 0 && writerSceneIds.some((sceneId) => sceneId !== normalizeString(observed.documentId))) {
    identityMismatches.push({
      field: 'writerInput.reviewItems.targetScope.id',
      expected: normalizeString(observed.documentId),
      actual: writerSceneIds.join(','),
    });
  }
  if (identityMismatches.length > 0) {
    reasons.push(reason(
      'RTK_SOURCE_FENCE_IDENTITY_MISMATCH',
      'sourceFence.observed',
      'Source fence observed identity does not match the exact-apply source/current identity.',
      { identityMismatches },
    ));
  }

  return {
    reasons,
    envelopeSourceFence: {
      schemaVersion: RTK_ROUND_AUTHORITY_SOURCE_FENCE_V1_SCHEMA,
      purpose: 'WRITE_SOURCE',
      sourceFenceDigest: '',
      sourceFenceCode: normalizeString(computed.code),
      observed: cloneJsonSafe(observed),
    },
  };
}

export function buildRtkExactApplyCommandEnvelope(input = {}, options = {}) {
  const cryptoPort = resolveCryptoPort(options.cryptoPort);
  if (!isPlainObject(input)) {
    return blockResult(reason('RTK_WRITE_PRECONDITION_FAILED', 'input', 'Envelope input must be an object.'));
  }
  const writerInput = isPlainObject(input.writerInput) ? input.writerInput : {};
  const changes = semanticChanges(writerInput);
  const validation = validateEnvelopeInput(input, changes);
  if (validation.reasons.length > 0) return blockResult(validation.reasons);

  const authority = normalizeCommandAuthority(input.commandAuthority);
  const lifecycleState = normalizeLifecycleState(input);
  const disposition = normalizeDisposition(input);
  const identity = normalizeIdentityPair(input);
  const roundId = normalizeString(input.roundId);
  const requestId = normalizeString(input.requestId);
  const returnArtifactSha256 = normalizeHash(input.returnArtifactSha256 || input.returnArtifactHash);
  const manifestDigest = normalizeHash(input.manifestDigest);
  const analysisDigest = normalizeHash(input.analysisDigest);
  const exportIdentity = normalizeString(input.exportIdentity || input.exportId);
  const commentLane = Array.isArray(input.commentLane)
    ? input.commentLane.map(cloneJsonSafe)
    : [];
  const sourceFence = cloneJsonSafe(validation.sourceFence);
  sourceFence.sourceFenceDigest = canonicalKey(cryptoPort, {
    schemaVersion: sourceFence.schemaVersion,
    purpose: sourceFence.purpose,
    sourceFenceCode: sourceFence.sourceFenceCode,
    observed: sourceFence.observed,
  });
  const writerInputDigest = canonicalKey(cryptoPort, {
    projectId: normalizeString(writerInput?.projectSnapshot?.projectId || writerInput?.revisionSession?.projectId),
    sessionId: normalizeString(writerInput?.revisionSession?.sessionId),
    baselineHash: normalizeString(writerInput?.projectSnapshot?.baselineHash || writerInput?.revisionSession?.baselineHash),
    semanticChanges: changes,
  });
  const requestKey = canonicalKey(cryptoPort, {
    schemaVersion: RTK_EXACT_APPLY_COMMAND_ENVELOPE_V2_SCHEMA,
    kind: 'request',
    roundId,
    requestId,
    commandId: authority.commandId,
    returnArtifactSha256,
    manifestDigest,
    analysisDigest,
    sourceFenceDigest: sourceFence.sourceFenceDigest,
  });
  const effectKey = canonicalKey(cryptoPort, {
    schemaVersion: RTK_EXACT_APPLY_COMMAND_ENVELOPE_V2_SCHEMA,
    kind: 'effect',
    roundId,
    lifecycleState,
    exportIdentity,
    sourceRevisionSha256: identity.sourceRevisionSha256,
    sourceRawBytesSha256: identity.sourceRawBytesSha256,
    sourceFenceDigest: sourceFence.sourceFenceDigest,
    writerInputDigest,
  });
  const envelopeUnsigned = {
    schemaVersion: RTK_EXACT_APPLY_COMMAND_ENVELOPE_V2_SCHEMA,
    intent: RTK_EXACT_APPLY_INTENT,
    authority,
    roundId,
    requestId,
    requestKey,
    effectKey,
    exportIdentity,
    returnArtifactSha256,
    manifestDigest,
    analysisDigest,
    lifecycleState,
    candidateDisposition: disposition,
    sourceIdentity: identity,
    sourceFence,
    writerInputDigest,
    textLane: {
      sourceTokenDomain: SOURCE_TOKEN_DOMAIN_V1,
      writerTextDomain: WRITER_TEXT_DOMAIN_V1,
      semanticChangeCount: changes.length,
      semanticChanges,
    },
    commentLane,
    reasonCatalog: RTK_EXACT_APPLY_REASON_CATALOG,
  };
  return okResult({
    ...envelopeUnsigned,
    envelopeDigest: canonicalKey(cryptoPort, envelopeUnsigned),
  });
}

export function validateRtkExactApplyCommandEnvelope(input = {}, envelope = {}, options = {}) {
  const built = buildRtkExactApplyCommandEnvelope(input, options);
  if (!built.ok) return built;
  if (!isPlainObject(envelope) || envelope.schemaVersion !== RTK_EXACT_APPLY_COMMAND_ENVELOPE_V2_SCHEMA) {
    return blockResult(reason(
      'RTK_COMMAND_ENVELOPE_TAMPERED',
      'envelope.schemaVersion',
      'Command envelope schema is invalid.',
    ));
  }
  const expected = built.envelope;
  const observedComparable = {
    ...envelope,
    reasonCatalog: expected.reasonCatalog,
  };
  if (stableJson(observedComparable) !== stableJson(expected)) {
    return blockResult(reason(
      'RTK_COMMAND_ENVELOPE_TAMPERED',
      'envelope',
      'Command envelope no longer matches current main-owned inputs.',
      {
        expectedDigest: expected.envelopeDigest,
        observedDigest: normalizeString(envelope.envelopeDigest),
      },
    ));
  }
  return okResult(expected);
}

export function buildRtkExactApplyOutcomeRecord(envelope, writerResult = {}, options = {}) {
  const cryptoPort = resolveCryptoPort(options.cryptoPort);
  const applied = writerResult?.status === 'applied' && writerResult?.applied === true;
  const recordUnsigned = {
    schemaVersion: RTK_EXACT_APPLY_OUTCOME_V2_SCHEMA,
    roundId: normalizeString(envelope?.roundId),
    requestKey: normalizeString(envelope?.requestKey),
    effectKey: normalizeString(envelope?.effectKey),
    envelopeDigest: normalizeString(envelope?.envelopeDigest),
    lifecycleState: normalizeString(envelope?.lifecycleState),
    status: applied ? 'APPLIED_ONCE' : 'NOT_APPLIED',
    reason: applied ? 'RTK_EXACT_APPLICABLE' : 'RTK_WRITE_PRECONDITION_FAILED',
    writerReceipt: isPlainObject(writerResult?.receipt) ? cloneJsonSafe(writerResult.receipt) : null,
    writerReason: normalizeString(writerResult?.reason),
  };
  return {
    ...recordUnsigned,
    outcomeDigest: canonicalKey(cryptoPort, recordUnsigned),
  };
}

export function buildRtkExactApplyRecoveryResolution(envelope, reconciliation = {}, options = {}) {
  const cryptoPort = resolveCryptoPort(options.cryptoPort);
  const recordUnsigned = {
    schemaVersion: RTK_EXACT_APPLY_RECOVERY_RESOLUTION_V2_SCHEMA,
    roundId: normalizeString(envelope?.roundId),
    requestKey: normalizeString(envelope?.requestKey),
    effectKey: normalizeString(envelope?.effectKey),
    envelopeDigest: normalizeString(envelope?.envelopeDigest),
    status: 'RECOVERY_RECONCILED',
    reason: reconciliation?.outcome === 'applied_receipt_present' ? 'RTK_WRITE_RECOVERED' : 'RTK_RECOVERY_REQUIRED',
    reconciliation: cloneJsonSafe(reconciliation || {}),
  };
  return {
    ...recordUnsigned,
    resolutionDigest: canonicalKey(cryptoPort, recordUnsigned),
  };
}
