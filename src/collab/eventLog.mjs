import { createHash } from 'node:crypto';

const EVENTLOG_SCHEMA_VERSION = 'collab-eventlog.v1';
const OPERATION_REPLAY_REPORT_SCHEMA_VERSION = 'collab-operation-replay.report.v1';
export const COMMAND_KERNEL_OPERATION_ENVELOPE_SCHEMA_VERSION = 'yalken.commandKernel.operationEnvelope.v1';
export const COMMAND_KERNEL_RECEIPT_SCHEMA_VERSION = 'command-kernel.receipt.v1';
export const COMMAND_KERNEL_RECEIPT_AUTHORITY_KIND = 'command-kernel-receipt-authority.v1';
const SHA256_HEX_RE = /^[a-f0-9]{64}$/u;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function canonicalSerialize(value) {
  if (value === null) return 'null';
  const valueType = typeof value;
  if (valueType === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (valueType === 'boolean') return value ? 'true' : 'false';
  if (valueType === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalSerialize(item)).join(',')}]`;
  }
  if (valueType === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalSerialize(value[key])}`).join(',')}}`;
  }
  return 'null';
}

function hashCanonical(value) {
  return createHash('sha256').update(Buffer.from(canonicalSerialize(value), 'utf8')).digest('hex');
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function typedError(code, op, reason, details) {
  const envelope = { code, op, reason };
  if (isPlainObject(details)) envelope.details = cloneJson(details);
  return envelope;
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeDomainEvents(events) {
  return Array.isArray(events) ? events.map((event) => cloneJson(event)) : [];
}

function normalizeStringArray(value) {
  return Array.isArray(value) ? value.map((item) => normalizeString(item)).filter(Boolean) : [];
}

function normalizeTargets(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((target) => isPlainObject(target))
    .map((target) => ({
      targetKind: normalizeString(target.targetKind || target.kind),
      targetId: normalizeString(target.targetId || target.id),
    }))
    .filter((target) => target.targetKind && target.targetId);
}

function isSha256Hex(value) {
  return SHA256_HEX_RE.test(normalizeString(value));
}

function domainEventPort(input = {}) {
  const port = isPlainObject(input) ? input : {};
  const validate = typeof port.validateCoreDomainEvent === 'function'
    ? port.validateCoreDomainEvent
    : typeof port.validate === 'function'
      ? port.validate
      : null;
  const hash = typeof port.hashCoreDomainEvents === 'function'
    ? port.hashCoreDomainEvents
    : typeof port.hash === 'function'
      ? port.hash
      : null;
  return { validate, hash };
}

function hashDomainEventsWithPort(events, portInput = {}) {
  const port = domainEventPort(portInput);
  if (typeof port.hash !== 'function') return '';
  return normalizeString(port.hash(normalizeDomainEvents(events)));
}

function inferCommandTargets(payload = {}) {
  const source = isPlainObject(payload) ? payload : {};
  const targets = [];
  for (const [field, targetKind] of [
    ['projectId', 'project'],
    ['sceneId', 'scene'],
    ['mapId', 'manualMap'],
    ['nodeId', 'manualMapNode'],
    ['edgeId', 'manualMapEdge'],
    ['entityId', 'atlasEntity'],
    ['ideaId', 'idea'],
    ['meaningId', 'meaning'],
  ]) {
    const targetId = normalizeString(source[field]);
    if (targetId) targets.push({ targetKind, targetId });
  }
  return targets;
}

export function createCommandKernelOperationEnvelope(input = {}) {
  const payload = isPlainObject(input.payload) || Array.isArray(input.payload) ? cloneJson(input.payload) : null;
  const payloadHash = hashCanonical(payload);
  const baseRevision = isPlainObject(input.baseRevision) ? cloneJson(input.baseRevision) : {};
  const envelope = {
    schemaVersion: COMMAND_KERNEL_OPERATION_ENVELOPE_SCHEMA_VERSION,
    commandId: normalizeString(input.commandId),
    commandVersion: Number.isSafeInteger(Number(input.commandVersion)) && Number(input.commandVersion) > 0
      ? Number(input.commandVersion)
      : 1,
    payload,
    payloadHash,
    baseRevision: {
      stateHash: normalizeString(baseRevision.stateHash || input.preStateHash),
      projectRevision: normalizeString(baseRevision.projectRevision),
    },
    targets: normalizeTargets(input.targets).length > 0 ? normalizeTargets(input.targets) : inferCommandTargets(payload),
    correlationId: normalizeString(input.correlationId || input.opId),
    sessionId: normalizeString(input.sessionId),
    dependencies: normalizeStringArray(input.dependencies),
  };
  if (normalizeString(input.eventId)) envelope.eventId = normalizeString(input.eventId);
  if (isPlainObject(input.canonicalTruthLink)) envelope.canonicalTruthLink = cloneJson(input.canonicalTruthLink);
  return {
    envelope,
    envelopeDigest: hashCanonical(envelope),
  };
}

function validateCommandKernelOperationEnvelope(envelope, {
  commandId,
  payloadHash,
  preStateHash,
  operationEnvelopeDigest,
} = {}) {
  if (!isPlainObject(envelope)) {
    return typedError(
      'E_COLLAB_EVENTLOG_OPERATION_ENVELOPE_MISSING',
      'collab.eventlog.operationEnvelope',
      'EXECUTABLE_OPERATION_ENVELOPE_REQUIRED',
    );
  }
  if (envelope.schemaVersion !== COMMAND_KERNEL_OPERATION_ENVELOPE_SCHEMA_VERSION) {
    return typedError(
      'E_COLLAB_EVENTLOG_OPERATION_ENVELOPE_SCHEMA_INVALID',
      'collab.eventlog.operationEnvelope',
      'EXECUTABLE_OPERATION_ENVELOPE_SCHEMA_UNSUPPORTED',
    );
  }
  if (normalizeString(envelope.commandId) !== normalizeString(commandId) || Number(envelope.commandVersion) !== 1) {
    return typedError(
      'E_COLLAB_EVENTLOG_OPERATION_ENVELOPE_COMMAND_INVALID',
      'collab.eventlog.operationEnvelope',
      'EXECUTABLE_OPERATION_COMMAND_VERSION_UNSUPPORTED',
    );
  }
  if (normalizeString(envelope.payloadHash) !== normalizeString(payloadHash) || hashCanonical(envelope.payload) !== normalizeString(payloadHash)) {
    return typedError(
      'E_COLLAB_EVENTLOG_OPERATION_ENVELOPE_PAYLOAD_HASH_MISMATCH',
      'collab.eventlog.operationEnvelope',
      'EXECUTABLE_OPERATION_PAYLOAD_HASH_MISMATCH',
    );
  }
  if (normalizeString(envelope.baseRevision?.stateHash) !== normalizeString(preStateHash)) {
    return typedError(
      'E_COLLAB_EVENTLOG_OPERATION_ENVELOPE_BASE_MISMATCH',
      'collab.eventlog.operationEnvelope',
      'EXECUTABLE_OPERATION_BASE_REVISION_MISMATCH',
    );
  }
  if (normalizeString(operationEnvelopeDigest) !== hashCanonical(envelope)) {
    return typedError(
      'E_COLLAB_EVENTLOG_OPERATION_ENVELOPE_DIGEST_MISMATCH',
      'collab.eventlog.operationEnvelope',
      'EXECUTABLE_OPERATION_ENVELOPE_DIGEST_MISMATCH',
    );
  }
  return null;
}

function domainEventsValid(events, expectedDigest = '', portInput = {}) {
  try {
    const normalized = normalizeDomainEvents(events);
    const port = domainEventPort(portInput);
    if (typeof port.validate !== 'function' || typeof port.hash !== 'function') return false;
    for (const event of normalized) {
      const validation = port.validate(event);
      if (!validation.ok) return false;
    }
    return !expectedDigest || port.hash(normalized) === expectedDigest;
  } catch {
    return false;
  }
}

function normalizeEventEntry(input = {}) {
  const entry = isPlainObject(input) ? input : {};
  const normalized = {
    eventId: normalizeString(entry.eventId),
    opId: normalizeString(entry.opId),
    ts: normalizeString(entry.ts),
    actorId: normalizeString(entry.actorId),
    commandId: normalizeString(entry.commandId),
    payloadHash: normalizeString(entry.payloadHash),
    preStateHash: normalizeString(entry.preStateHash),
    postStateHash: normalizeString(entry.postStateHash),
  };
  if (isPlainObject(entry.operationEnvelope) || typeof entry.operationEnvelopeDigest === 'string') {
    normalized.operationEnvelope = isPlainObject(entry.operationEnvelope) ? cloneJson(entry.operationEnvelope) : null;
    normalized.operationEnvelopeDigest = normalizeString(entry.operationEnvelopeDigest);
  }
  if (
    Array.isArray(entry.domainEvents)
    || typeof entry.domainEventDigest === 'string'
  ) {
    const domainEvents = normalizeDomainEvents(entry.domainEvents);
    normalized.domainEvents = domainEvents;
    normalized.domainEventDigest = normalizeString(entry.domainEventDigest);
  }
  return normalized;
}

function eventEntryValid(entry, portInput = {}) {
  const requiredFieldsValid = Boolean(
    entry.eventId
    && entry.opId
    && entry.ts
    && entry.actorId
    && entry.commandId
    && entry.payloadHash
    && entry.preStateHash
    && entry.postStateHash,
  );
  if (!requiredFieldsValid) return false;
  if (entry.operationEnvelope || entry.operationEnvelopeDigest) {
    const envelopeError = validateCommandKernelOperationEnvelope(entry.operationEnvelope, {
      commandId: entry.commandId,
      payloadHash: entry.payloadHash,
      preStateHash: entry.preStateHash,
      operationEnvelopeDigest: entry.operationEnvelopeDigest,
    });
    if (envelopeError) return false;
  }
  if (Array.isArray(entry.domainEvents) || entry.domainEventDigest) {
    return Array.isArray(entry.domainEvents)
      && isSha256Hex(entry.domainEventDigest)
      && domainEventsValid(entry.domainEvents, entry.domainEventDigest, portInput);
  }
  return true;
}

function normalizeEventLog(input = {}) {
  const src = isPlainObject(input) ? input : {};
  const events = Array.isArray(src.events) ? src.events.map((entry) => normalizeEventEntry(entry)) : [];
  return {
    schemaVersion: EVENTLOG_SCHEMA_VERSION,
    events,
  };
}

function collectKnownOpIds(events) {
  const known = new Set();
  for (const event of events) known.add(event.opId);
  return known;
}

function collectKnownEventIds(events) {
  const known = new Set();
  for (const event of events) {
    const eventId = normalizeString(event.eventId);
    if (eventId) known.add(eventId);
  }
  return known;
}

function normalizeCommandReceipt(input = {}) {
  const receipt = isPlainObject(input) ? input : {};
  const normalized = {
    schemaVersion: normalizeString(receipt.schemaVersion),
    receiptId: normalizeString(receipt.receiptId || receipt.id || receipt.kernelReceiptId),
    operationId: normalizeString(receipt.operationId || receipt.opId),
    commandId: normalizeString(receipt.commandId || receipt.type),
    status: normalizeString(receipt.status || receipt.result || receipt.writeStatus),
    appliedAt: normalizeString(receipt.appliedAt || receipt.completedAt || receipt.ts || receipt.writtenAt),
    preStateHash: normalizeString(receipt.preStateHash || receipt.stateHashBefore || receipt.baselineHashBefore),
    postStateHash: normalizeString(receipt.postStateHash || receipt.stateHashAfter || receipt.outputHash),
    capabilityRevalidated: receipt.capabilityRevalidated === true
      || receipt.commandKernelCapabilityRevalidation === true,
    domainEventDigest: normalizeString(receipt.domainEventDigest || receipt.eventDigest),
    domainEventCount: Number.isSafeInteger(Number(receipt.domainEventCount)) && Number(receipt.domainEventCount) >= 0
      ? Number(receipt.domainEventCount)
      : 0,
    factsForbidden: !Array.isArray(receipt.domainEvents)
      && !Array.isArray(receipt.events)
      && !(isPlainObject(receipt.details) && Array.isArray(receipt.details.domainEvents)),
  };
  return normalized;
}

function normalizeCommandReceipts(receipts) {
  if (!Array.isArray(receipts)) return [];
  return receipts.map((receipt) => normalizeCommandReceipt(receipt));
}

function receiptMatchesEvent(receipt, event) {
  if (receipt.commandId && receipt.commandId !== event.commandId) return false;
  if (receipt.domainEventDigest && event.domainEventDigest && receipt.domainEventDigest !== event.domainEventDigest) return false;
  if (receipt.operationId && receipt.operationId === event.opId) return true;
  if (receipt.receiptId && receipt.receiptId === event.opId) return true;
  if (receipt.preStateHash && receipt.postStateHash) {
    return receipt.preStateHash === event.preStateHash && receipt.postStateHash === event.postStateHash;
  }
  return false;
}

function receiptAuthority(input = {}) {
  const port = isPlainObject(input.commandReceiptAuthorityPort)
    ? input.commandReceiptAuthorityPort
    : isPlainObject(input.commandKernelReceiptAuthorityPort)
      ? input.commandKernelReceiptAuthorityPort
      : null;
  if (!port) return null;
  const getReceipt = typeof port.getCommandKernelReceipt === 'function'
    ? port.getCommandKernelReceipt
    : typeof port.getReceipt === 'function'
      ? port.getReceipt
      : null;
  if (!getReceipt) return null;
  return {
    authorityKind: normalizeString(port.authorityKind || port.schemaVersion),
    getReceipt,
  };
}

function resolveAuthorityReceipt(authority, event, index) {
  if (!authority || authority.authorityKind !== COMMAND_KERNEL_RECEIPT_AUTHORITY_KIND) {
    return {
      ok: false,
      code: 'E_COLLAB_OPERATION_REPLAY_RECEIPT_AUTHORITY_REQUIRED',
      reason: 'COMMAND_KERNEL_RECEIPT_AUTHORITY_REQUIRED',
      details: { index, opId: event.opId, commandId: event.commandId },
      receipt: null,
    };
  }
  const rawReceipt = authority.getReceipt({
    operationId: event.opId,
    opId: event.opId,
    commandId: event.commandId,
    event: cloneJson(event),
  });
  if (!rawReceipt) return { ok: true, receipt: null };
  return { ok: true, receipt: normalizeCommandReceipt(rawReceipt) };
}

function validateCommandKernelReceiptForEvent(receipt, event, index, portInput = {}) {
  if (!receipt) {
    return {
      ok: false,
      code: 'E_COLLAB_OPERATION_REPLAY_COMMAND_RECEIPT_MISSING',
      reason: 'COMMAND_KERNEL_RECEIPT_REQUIRED',
      details: { index, opId: event.opId, commandId: event.commandId },
    };
  }
  if (receipt.schemaVersion !== COMMAND_KERNEL_RECEIPT_SCHEMA_VERSION) {
    return {
      ok: false,
      code: 'E_COLLAB_OPERATION_REPLAY_RECEIPT_SCHEMA_INVALID',
      reason: 'COMMAND_KERNEL_RECEIPT_SCHEMA_VERSION_REQUIRED',
      details: { index, opId: event.opId, commandId: event.commandId, receiptId: receipt.receiptId },
    };
  }
  if (!receipt.factsForbidden) {
    return {
      ok: false,
      code: 'E_COLLAB_OPERATION_REPLAY_RECEIPT_FACTS_FORBIDDEN',
      reason: 'COMMAND_KERNEL_RECEIPT_DIGEST_REF_ONLY',
      details: { index, opId: event.opId, receiptId: receipt.receiptId },
    };
  }
  if (!receipt.receiptId || receipt.operationId !== event.opId || receipt.commandId !== event.commandId || !receipt.status || !receipt.appliedAt) {
    return {
      ok: false,
      code: 'E_COLLAB_OPERATION_REPLAY_RECEIPT_BINDING_INVALID',
      reason: 'COMMAND_KERNEL_RECEIPT_OPERATION_COMMAND_BINDING_INVALID',
      details: { index, opId: event.opId, commandId: event.commandId, receiptId: receipt.receiptId },
    };
  }
  if (receipt.capabilityRevalidated !== true) {
    return {
      ok: false,
      code: 'E_COLLAB_OPERATION_REPLAY_CAPABILITY_NOT_REVALIDATED',
      reason: 'COMMAND_KERNEL_CAPABILITY_REVALIDATION_REQUIRED',
      details: { index, opId: event.opId, commandId: event.commandId, receiptId: receipt.receiptId },
    };
  }
  if (!isSha256Hex(receipt.preStateHash) || receipt.preStateHash !== event.preStateHash) {
    return {
      ok: false,
      code: 'E_COLLAB_OPERATION_REPLAY_RECEIPT_PRE_HASH_MISMATCH',
      reason: 'COMMAND_KERNEL_RECEIPT_PRE_HASH_MISMATCH',
      details: { index, opId: event.opId, receiptId: receipt.receiptId },
    };
  }
  if (!isSha256Hex(receipt.postStateHash) || receipt.postStateHash !== event.postStateHash) {
    return {
      ok: false,
      code: 'E_COLLAB_OPERATION_REPLAY_RECEIPT_POST_HASH_MISMATCH',
      reason: 'COMMAND_KERNEL_RECEIPT_POST_HASH_MISMATCH',
      details: { index, opId: event.opId, receiptId: receipt.receiptId },
    };
  }
  if (!isSha256Hex(event.domainEventDigest) || !Array.isArray(event.domainEvents) || !domainEventsValid(event.domainEvents, event.domainEventDigest, portInput)) {
    return {
      ok: false,
      code: 'E_COLLAB_OPERATION_REPLAY_EVENT_DOMAIN_EVENT_DIGEST_INVALID',
      reason: 'COLLAB_EVENT_DOMAIN_EVENT_DIGEST_REQUIRED',
      details: { index, opId: event.opId },
    };
  }
  if (!isSha256Hex(receipt.domainEventDigest) || receipt.domainEventDigest !== event.domainEventDigest) {
    return {
      ok: false,
      code: 'E_COLLAB_OPERATION_REPLAY_RECEIPT_DOMAIN_EVENT_DIGEST_MISMATCH',
      reason: 'COMMAND_KERNEL_RECEIPT_DOMAIN_EVENT_DIGEST_MISMATCH',
      details: { index, opId: event.opId, receiptId: receipt.receiptId },
    };
  }
  if (receipt.domainEventCount !== event.domainEvents.length) {
    return {
      ok: false,
      code: 'E_COLLAB_OPERATION_REPLAY_RECEIPT_DOMAIN_EVENT_COUNT_MISMATCH',
      reason: 'COMMAND_KERNEL_RECEIPT_DOMAIN_EVENT_COUNT_MISMATCH',
      details: { index, opId: event.opId, receiptId: receipt.receiptId },
    };
  }
  return { ok: true };
}

function findCommandReceipt(receipts, event) {
  return receipts.find((receipt) => receiptMatchesEvent(receipt, event)) || null;
}

function commandReceiptRef(receipt) {
  const ref = {
    schemaVersion: receipt.schemaVersion,
    receiptId: receipt.receiptId,
    operationId: receipt.operationId,
    commandId: receipt.commandId,
    status: receipt.status,
    appliedAt: receipt.appliedAt,
    preStateHash: receipt.preStateHash,
    postStateHash: receipt.postStateHash,
    capabilityRevalidated: receipt.capabilityRevalidated,
  };
  if (receipt.domainEventDigest) {
    ref.domainEventDigest = receipt.domainEventDigest;
    ref.domainEventCount = receipt.domainEventCount;
  }
  return {
    ...ref,
    receiptRefHash: hashCanonical(ref),
  };
}

function replayError(code, reason, details) {
  return typedError(
    code,
    'collab.operationReplay.buildReport',
    reason,
    details,
  );
}

function normalizeApplyCommandResult(result) {
  if (!isPlainObject(result) || result.ok !== true || !isPlainObject(result.state)) return null;
  return {
    state: cloneJson(result.state),
    stateHash: normalizeString(result.stateHash) || hashCanonical(result.state),
    domainEvents: normalizeDomainEvents(result.events),
  };
}

function executeReplayEnvelope({
  event,
  index,
  currentState,
  currentHash,
  applyCommand,
  hashState,
  domainEventAuthorityPort,
}) {
  const envelopeError = validateCommandKernelOperationEnvelope(event.operationEnvelope, {
    commandId: event.commandId,
    payloadHash: event.payloadHash,
    preStateHash: event.preStateHash,
    operationEnvelopeDigest: event.operationEnvelopeDigest,
  });
  if (envelopeError) {
    return {
      ok: false,
      error: replayError(
        envelopeError.code,
        envelopeError.reason,
        { index, opId: event.opId, commandId: event.commandId },
      ),
    };
  }
  let reducerState = currentState;
  const canonicalTruthLink = event.operationEnvelope.canonicalTruthLink;
  if (isPlainObject(canonicalTruthLink)) {
    const linkedState = canonicalTruthLink.coreState;
    const linkedHash = normalizeString(canonicalTruthLink.stateHash);
    if (!isPlainObject(linkedState) || !isSha256Hex(linkedHash) || hashState(linkedState) !== linkedHash) {
      return {
        ok: false,
        error: replayError(
          'E_COLLAB_OPERATION_REPLAY_CANONICAL_TRUTH_LINK_INVALID',
          'EXECUTABLE_CANONICAL_TRUTH_LINK_INVALID',
          { index, opId: event.opId, commandId: event.commandId },
        ),
      };
    }
    reducerState = cloneJson(linkedState);
  }
  const applyResult = normalizeApplyCommandResult(applyCommand(reducerState, {
    type: event.commandId,
    payload: cloneJson(event.operationEnvelope.payload),
    event: cloneJson(event),
  }));
  if (!applyResult) {
    return {
      ok: false,
      error: replayError(
        'E_COLLAB_OPERATION_REPLAY_REDUCER_REJECTED',
        'EXECUTABLE_REPLAY_REDUCER_REJECTED',
        { index, opId: event.opId, commandId: event.commandId },
      ),
    };
  }
  if (event.preStateHash !== currentHash || event.postStateHash !== applyResult.stateHash) {
    return {
      ok: false,
      error: replayError(
        'E_COLLAB_OPERATION_REPLAY_EXECUTABLE_STATE_HASH_MISMATCH',
        'EXECUTABLE_REPLAY_STATE_HASH_MISMATCH',
        {
          index,
          opId: event.opId,
          commandId: event.commandId,
          expectedPostStateHash: event.postStateHash,
          actualPostStateHash: applyResult.stateHash,
        },
      ),
    };
  }
  const eventDomainDigest = hashDomainEventsWithPort(applyResult.domainEvents, domainEventAuthorityPort);
  if (
    normalizeString(event.domainEventDigest) !== eventDomainDigest
    || hashCanonical(normalizeDomainEvents(event.domainEvents)) !== hashCanonical(applyResult.domainEvents)
  ) {
    return {
      ok: false,
      error: replayError(
        'E_COLLAB_OPERATION_REPLAY_EXECUTABLE_DOMAIN_EVENTS_MISMATCH',
        'EXECUTABLE_REPLAY_DOMAIN_EVENTS_MISMATCH',
        { index, opId: event.opId, commandId: event.commandId },
      ),
    };
  }
  return {
    ok: true,
    state: applyResult.state,
    stateHash: applyResult.stateHash,
  };
}

function buildReplayStep(event, index, currentHash, receipt) {
  return {
    index,
    eventId: event.eventId || '',
    opId: event.opId,
    actorId: event.actorId,
    ts: event.ts,
    commandId: event.commandId,
    payloadHash: event.payloadHash,
    preStateHash: event.preStateHash,
    postStateHash: event.postStateHash,
    domainEventDigest: event.domainEventDigest || '',
    domainEventCount: Array.isArray(event.domainEvents) ? event.domainEvents.length : 0,
    operationEnvelopeRef: event.operationEnvelopeDigest
      ? {
          schemaVersion: event.operationEnvelope?.schemaVersion || '',
          commandVersion: Number(event.operationEnvelope?.commandVersion) || 0,
          operationEnvelopeDigest: event.operationEnvelopeDigest,
          payloadHash: event.payloadHash,
        }
      : null,
    replayedFromStateHash: currentHash,
    commandReceiptRef: receipt ? commandReceiptRef(receipt) : null,
    stateHashProof: {
      preStateHashMatches: event.preStateHash === currentHash,
      nextStateHash: event.postStateHash,
    },
  };
}

function buildReplayReport(base) {
  return {
    ...base,
    replayHash: hashCanonical(base),
  };
}

export function createEmptyEventLog() {
  return {
    schemaVersion: EVENTLOG_SCHEMA_VERSION,
    events: [],
  };
}

export function serializeEventLog(input = {}) {
  const eventLog = normalizeEventLog(input);
  return canonicalSerialize(eventLog);
}

export function hashEventLog(input = {}) {
  const eventLog = normalizeEventLog(input);
  return hashCanonical(eventLog);
}

export function appendEventLogEntry(input = {}) {
  const eventLog = normalizeEventLog(input.eventLog);
  const entry = normalizeEventEntry(input.entry);
  if (!eventEntryValid(entry, input.domainEventPort)) {
    return {
      ok: false,
      eventLog,
      error: typedError(
        'E_COLLAB_EVENTLOG_ENTRY_INVALID',
        'collab.eventlog.append',
        'ENTRY_FIELDS_REQUIRED',
      ),
    };
  }

  const knownOpIds = collectKnownOpIds(eventLog.events);
  const knownEventIds = collectKnownEventIds(eventLog.events);
  if (entry.eventId && knownEventIds.has(entry.eventId)) {
    return {
      ok: false,
      eventLog,
      error: typedError(
        'E_COLLAB_EVENTLOG_EVENTID_DUPLICATE',
        'collab.eventlog.append',
        'EVENT_ID_ALREADY_EXISTS',
        { eventId: entry.eventId },
      ),
    };
  }
  if (knownOpIds.has(entry.opId)) {
    return {
      ok: false,
      eventLog,
      error: typedError(
        'E_COLLAB_EVENTLOG_OPID_DUPLICATE',
        'collab.eventlog.append',
        'OP_ID_ALREADY_EXISTS',
        { opId: entry.opId },
      ),
    };
  }

  const nextEvents = [...eventLog.events, entry];
  const nextEventLog = {
    schemaVersion: EVENTLOG_SCHEMA_VERSION,
    events: nextEvents,
  };

  return {
    ok: true,
    eventLog: nextEventLog,
    entry,
    entryHash: hashCanonical(entry),
    eventLogHash: hashCanonical(nextEventLog),
  };
}

export function applyCommandWithEventLog(input = {}) {
  const applyCommand = typeof input.applyCommand === 'function' ? input.applyCommand : null;
  if (!applyCommand) {
    return {
      ok: false,
      eventLog: normalizeEventLog(input.eventLog),
      error: typedError(
        'E_COLLAB_EVENTLOG_APPLY_COMMAND_REQUIRED',
        'collab.eventlog.applyCommand',
        'APPLY_COMMAND_CALLBACK_REQUIRED',
      ),
    };
  }

  const currentState = isPlainObject(input.currentState) ? cloneJson(input.currentState) : {};
  const currentStateHash = normalizeString(input.currentStateHash) || hashCanonical(currentState);
  const commandId = normalizeString(input.commandId);
  const payload = isPlainObject(input.payload) || Array.isArray(input.payload) ? cloneJson(input.payload) : null;
  const payloadHash = hashCanonical(payload);
  const operationEnvelope = createCommandKernelOperationEnvelope({
    commandId,
    payload,
    opId: input.opId,
    eventId: input.eventId || input.opId,
    preStateHash: currentStateHash,
    sessionId: input.sessionId,
    correlationId: input.correlationId,
    dependencies: input.dependencies,
    targets: input.targets,
    canonicalTruthLink: input.canonicalTruthLink,
    commandVersion: input.commandVersion,
  });

  const command = {
    type: commandId,
    payload,
  };
  const applyResult = applyCommand(currentState, command);
  if (!isPlainObject(applyResult) || applyResult.ok !== true) {
    return {
      ok: false,
      eventLog: normalizeEventLog(input.eventLog),
      error: typedError(
        'E_COLLAB_EVENTLOG_APPLY_COMMAND_FAILED',
        'collab.eventlog.applyCommand',
        'APPLY_COMMAND_FAILED',
        {
          commandId,
          innerCode: applyResult?.error?.code || '',
        },
      ),
      applyResult: isPlainObject(applyResult) ? cloneJson(applyResult) : applyResult,
    };
  }

  const nextState = cloneJson(applyResult.state);
  const postStateHash = normalizeString(applyResult.stateHash) || hashCanonical(nextState);
  const domainEvents = normalizeDomainEvents(applyResult.events);
  if (!domainEventsValid(domainEvents, '', input.domainEventPort)) {
    return {
      ok: false,
      eventLog: normalizeEventLog(input.eventLog),
      error: typedError(
        'E_COLLAB_EVENTLOG_DOMAIN_EVENTS_INVALID',
        'collab.eventlog.applyCommand',
        'DOMAIN_EVENTS_INVALID',
        { commandId },
      ),
      state: nextState,
      stateHash: postStateHash,
    };
  }
  const domainEventDigest = hashDomainEventsWithPort(domainEvents, input.domainEventPort);
  const entry = {
    eventId: normalizeString(input.eventId || input.opId),
    opId: normalizeString(input.opId),
    ts: normalizeString(input.ts),
    actorId: normalizeString(input.actorId),
    commandId,
    payloadHash,
    preStateHash: currentStateHash,
    postStateHash,
    operationEnvelope: operationEnvelope.envelope,
    operationEnvelopeDigest: operationEnvelope.envelopeDigest,
    domainEvents,
    domainEventDigest,
  };
  const append = appendEventLogEntry({
    eventLog: input.eventLog,
    entry,
    domainEventPort: input.domainEventPort,
  });
  if (!append.ok) {
    return {
      ok: false,
      eventLog: append.eventLog,
      error: append.error,
      state: nextState,
      stateHash: postStateHash,
    };
  }

  return {
    ok: true,
    eventLog: append.eventLog,
    eventLogHash: append.eventLogHash,
    entry: append.entry,
    domainEvents,
    domainEventDigest,
    state: nextState,
    stateHash: postStateHash,
  };
}

export function replayEventLog(input = {}) {
  const eventLog = normalizeEventLog(input.eventLog);
  const initialStateHash = normalizeString(input.initialStateHash);
  if (!initialStateHash) {
    return {
      ok: false,
      finalStateHash: '',
      error: typedError(
        'E_COLLAB_EVENTLOG_INITIAL_STATE_HASH_REQUIRED',
        'collab.eventlog.replay',
        'INITIAL_STATE_HASH_REQUIRED',
      ),
    };
  }

  let currentHash = initialStateHash;
  for (let index = 0; index < eventLog.events.length; index += 1) {
    const event = eventLog.events[index];
    if (!eventEntryValid(event, input.domainEventPort)) {
      return {
        ok: false,
        finalStateHash: currentHash,
        error: typedError(
          'E_COLLAB_EVENTLOG_ENTRY_INVALID',
          'collab.eventlog.replay',
          'ENTRY_FIELDS_REQUIRED',
          { index },
        ),
      };
    }
    if (event.preStateHash !== currentHash) {
      return {
        ok: false,
        finalStateHash: currentHash,
        error: typedError(
          'E_COLLAB_EVENTLOG_REPLAY_HASH_MISMATCH',
          'collab.eventlog.replay',
          'PRE_STATE_HASH_MISMATCH',
          { index, opId: event.opId },
        ),
      };
    }
    currentHash = event.postStateHash;
  }

  return {
    ok: true,
    finalStateHash: currentHash,
    appliedEvents: eventLog.events.length,
    eventLogHash: hashCanonical(eventLog),
  };
}

export function buildOperationReplayReport(input = {}) {
  const eventLog = normalizeEventLog(input.eventLog);
  const initialStateHash = normalizeString(input.initialStateHash);
  const expectedFinalStateHash = normalizeString(input.expectedFinalStateHash);
  const requireCommandKernelReceipt = input.requireCommandKernelReceipt === true;
  const requireExecutableOperationEnvelope = input.requireExecutableOperationEnvelope === true;
  const applyCommand = typeof input.applyCommand === 'function' ? input.applyCommand : null;
  const hashState = typeof input.hashState === 'function' ? input.hashState : hashCanonical;
  const initialState = isPlainObject(input.initialState) ? cloneJson(input.initialState) : null;
  const domainEventAuthorityPort = input.domainEventPort;
  const authorityPort = receiptAuthority(input);
  const commandReceipts = requireCommandKernelReceipt ? [] : normalizeCommandReceipts(input.commandReceipts);
  const authority = {
    usesExistingEventLog: true,
    commandKernelReceiptBinding: requireCommandKernelReceipt,
    commandKernelReceiptAuthority: requireCommandKernelReceipt ? COMMAND_KERNEL_RECEIPT_AUTHORITY_KIND : '',
    executableOperationEnvelope: requireExecutableOperationEnvelope,
    secondOperationLogTruth: false,
    privateCommandBus: false,
    directManuscriptMutation: false,
    projectTruthMutation: false,
    transportExchange: false,
    networkAdapter: false,
  };

  if (!initialStateHash || (requireExecutableOperationEnvelope && (!initialState || !applyCommand))) {
    return buildReplayReport({
      schemaVersion: OPERATION_REPLAY_REPORT_SCHEMA_VERSION,
      ok: false,
      eventLogHash: hashCanonical(eventLog),
      initialStateHash: '',
      finalStateHash: '',
      expectedFinalStateHash,
      expectedFinalStateHashMatches: expectedFinalStateHash ? false : null,
      appliedCount: 0,
      rejectedCount: 1,
      steps: [],
      rejected: [
        !initialStateHash
          ? replayError(
              'E_COLLAB_OPERATION_REPLAY_INITIAL_STATE_HASH_REQUIRED',
              'INITIAL_STATE_HASH_REQUIRED',
            )
          : replayError(
              'E_COLLAB_OPERATION_REPLAY_EXECUTABLE_BASELINE_REQUIRED',
              'EXECUTABLE_REPLAY_BASELINE_AND_REDUCER_REQUIRED',
            ),
      ],
      authority,
    });
  }

  const steps = [];
  const rejected = [];
  const seenOpIds = new Set();
  const seenEventIds = new Set();
  let currentHash = initialStateHash;
  let currentState = initialState;

  for (let index = 0; index < eventLog.events.length; index += 1) {
    const event = eventLog.events[index];
    if (seenOpIds.has(event.opId)) {
      rejected.push(replayError(
        'E_COLLAB_OPERATION_REPLAY_DUPLICATE_OP_ID',
        'OP_ID_ALREADY_REPLAYED',
        { index, opId: event.opId },
      ));
      continue;
    }
    seenOpIds.add(event.opId);

    if (event.eventId && seenEventIds.has(event.eventId)) {
      rejected.push(replayError(
        'E_COLLAB_OPERATION_REPLAY_DUPLICATE_EVENT_ID',
        'EVENT_ID_ALREADY_REPLAYED',
        { index, eventId: event.eventId },
      ));
      continue;
    }
    if (event.eventId) seenEventIds.add(event.eventId);

    if (!eventEntryValid(event, domainEventAuthorityPort)) {
      rejected.push(replayError(
        'E_COLLAB_OPERATION_REPLAY_ENTRY_INVALID',
        'ENTRY_FIELDS_REQUIRED',
        { index, opId: event.opId },
      ));
      continue;
    }

    if (event.preStateHash !== currentHash) {
      rejected.push(replayError(
        'E_COLLAB_OPERATION_REPLAY_PRE_STATE_HASH_MISMATCH',
        'PRE_STATE_HASH_MISMATCH',
        {
          index,
          opId: event.opId,
          expectedPreStateHash: currentHash,
          actualPreStateHash: event.preStateHash,
        },
      ));
      continue;
    }

    let receipt = null;
    if (requireCommandKernelReceipt) {
      const resolved = resolveAuthorityReceipt(authorityPort, event, index);
      if (!resolved.ok) {
        rejected.push(replayError(resolved.code, resolved.reason, resolved.details));
        continue;
      }
      receipt = resolved.receipt;
      const receiptValidation = validateCommandKernelReceiptForEvent(receipt, event, index, domainEventAuthorityPort);
      if (!receiptValidation.ok) {
        rejected.push(replayError(receiptValidation.code, receiptValidation.reason, receiptValidation.details));
        continue;
      }
    } else {
      receipt = findCommandReceipt(commandReceipts, event);
    }

    let executable = null;
    if (requireExecutableOperationEnvelope) {
      executable = executeReplayEnvelope({
        event,
        index,
        currentState,
        currentHash,
        applyCommand,
        hashState,
        domainEventAuthorityPort,
      });
      if (!executable.ok) {
        rejected.push(executable.error);
        continue;
      }
    }

    steps.push(buildReplayStep(event, index, currentHash, receipt));
    currentHash = requireExecutableOperationEnvelope ? executable.stateHash : event.postStateHash;
    if (requireExecutableOperationEnvelope) currentState = executable.state;
  }

  if (expectedFinalStateHash && expectedFinalStateHash !== currentHash) {
    rejected.push(replayError(
      'E_COLLAB_OPERATION_REPLAY_FINAL_STATE_HASH_MISMATCH',
      'FINAL_STATE_HASH_MISMATCH',
      {
        expectedFinalStateHash,
        actualFinalStateHash: currentHash,
      },
    ));
  }

  return buildReplayReport({
    schemaVersion: OPERATION_REPLAY_REPORT_SCHEMA_VERSION,
    ok: rejected.length === 0,
    eventLogHash: hashCanonical(eventLog),
    initialStateHash,
    finalStateHash: currentHash,
    expectedFinalStateHash,
    expectedFinalStateHashMatches: expectedFinalStateHash ? expectedFinalStateHash === currentHash : null,
    appliedCount: steps.length,
    rejectedCount: rejected.length,
    steps,
    rejected,
    authority,
  });
}
