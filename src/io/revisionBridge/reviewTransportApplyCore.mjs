import {
  RTK_EXACT_APPLY_COMMAND_ENVELOPE_V2_SCHEMA,
  RTK_EXACT_APPLY_OUTCOME_V2_SCHEMA,
  RTK_EXACT_APPLY_RECOVERY_RESOLUTION_V2_SCHEMA,
  RTK_REASON_CODES,
  RTK_TERMINAL_LIFECYCLE_STATES,
  stableJson,
} from './reviewTransportCore.mjs';

export {
  RTK_EXACT_APPLY_COMMAND_ENVELOPE_V2_SCHEMA,
  RTK_EXACT_APPLY_OUTCOME_V2_SCHEMA,
  RTK_EXACT_APPLY_RECOVERY_RESOLUTION_V2_SCHEMA,
};

export const SOURCE_TOKEN_DOMAIN_V1 = 'SOURCE_TOKEN_DOMAIN_V1';
export const WRITER_TEXT_DOMAIN_V1 = 'WRITER_TEXT_DOMAIN_V1';
export const RTK_EXACT_APPLY_INTENT = 'rtk.exactApply';

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const HEX_HASH_PATTERN = /^[a-f0-9]{64}$/u;
const BLOCKED_CALLERS = new Set(['renderer', 'parser', 'comments', 'ui', 'ai', 'worker']);

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
    sourceRevisionSha256: normalizeHash(source.revisionSha256 || source.sourceRevisionSha256),
    sourceRawBytesSha256: normalizeHash(source.rawBytesSha256 || source.sourceRawBytesSha256),
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
  if (!RTK_TERMINAL_LIFECYCLE_STATES.includes(lifecycleState)) {
    reasons.push(reason(
      'RTK_WRITE_PRECONDITION_FAILED',
      'returnLifecycleState',
      'Exact apply requires terminal returned-review analysis.',
      { lifecycleState },
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
  return reasons;
}

export function buildRtkExactApplyCommandEnvelope(input = {}, options = {}) {
  const cryptoPort = resolveCryptoPort(options.cryptoPort);
  if (!isPlainObject(input)) {
    return blockResult(reason('RTK_WRITE_PRECONDITION_FAILED', 'input', 'Envelope input must be an object.'));
  }
  const writerInput = isPlainObject(input.writerInput) ? input.writerInput : {};
  const changes = semanticChanges(writerInput);
  const validationReasons = validateEnvelopeInput(input, changes);
  if (validationReasons.length > 0) return blockResult(validationReasons);

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
  });
  const effectKey = canonicalKey(cryptoPort, {
    schemaVersion: RTK_EXACT_APPLY_COMMAND_ENVELOPE_V2_SCHEMA,
    kind: 'effect',
    roundId,
    lifecycleState,
    exportIdentity,
    sourceRevisionSha256: identity.sourceRevisionSha256,
    sourceRawBytesSha256: identity.sourceRawBytesSha256,
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
    writerInputDigest,
    textLane: {
      sourceTokenDomain: SOURCE_TOKEN_DOMAIN_V1,
      writerTextDomain: WRITER_TEXT_DOMAIN_V1,
      semanticChangeCount: changes.length,
      semanticChanges,
    },
    commentLane,
    reasonCatalog: RTK_REASON_CODES,
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
