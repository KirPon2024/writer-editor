import { createHash } from 'node:crypto';

const EVENTLOG_SCHEMA_VERSION = 'collab-eventlog.v1';
const OPERATION_REPLAY_REPORT_SCHEMA_VERSION = 'collab-operation-replay.report.v1';
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
    opId: normalizeString(entry.opId),
    ts: normalizeString(entry.ts),
    actorId: normalizeString(entry.actorId),
    commandId: normalizeString(entry.commandId),
    payloadHash: normalizeString(entry.payloadHash),
    preStateHash: normalizeString(entry.preStateHash),
    postStateHash: normalizeString(entry.postStateHash),
  };
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
    entry.opId
    && entry.ts
    && entry.actorId
    && entry.commandId
    && entry.payloadHash
    && entry.preStateHash
    && entry.postStateHash,
  );
  if (!requiredFieldsValid) return false;
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

function buildReplayStep(event, index, currentHash, receipt) {
  return {
    index,
    opId: event.opId,
    actorId: event.actorId,
    ts: event.ts,
    commandId: event.commandId,
    payloadHash: event.payloadHash,
    preStateHash: event.preStateHash,
    postStateHash: event.postStateHash,
    domainEventDigest: event.domainEventDigest || '',
    domainEventCount: Array.isArray(event.domainEvents) ? event.domainEvents.length : 0,
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
    opId: normalizeString(input.opId),
    ts: normalizeString(input.ts),
    actorId: normalizeString(input.actorId),
    commandId,
    payloadHash: hashCanonical(payload),
    preStateHash: currentStateHash,
    postStateHash,
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
  const domainEventAuthorityPort = input.domainEventPort;
  const authorityPort = receiptAuthority(input);
  const commandReceipts = requireCommandKernelReceipt ? [] : normalizeCommandReceipts(input.commandReceipts);
  const authority = {
    usesExistingEventLog: true,
    commandKernelReceiptBinding: requireCommandKernelReceipt,
    commandKernelReceiptAuthority: requireCommandKernelReceipt ? COMMAND_KERNEL_RECEIPT_AUTHORITY_KIND : '',
    secondOperationLogTruth: false,
    privateCommandBus: false,
    directManuscriptMutation: false,
    projectTruthMutation: false,
    transportExchange: false,
    networkAdapter: false,
  };

  if (!initialStateHash) {
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
        replayError(
          'E_COLLAB_OPERATION_REPLAY_INITIAL_STATE_HASH_REQUIRED',
          'INITIAL_STATE_HASH_REQUIRED',
        ),
      ],
      authority,
    });
  }

  const steps = [];
  const rejected = [];
  const seenOpIds = new Set();
  let currentHash = initialStateHash;

  for (let index = 0; index < eventLog.events.length; index += 1) {
    const event = eventLog.events[index];
    if (!eventEntryValid(event, domainEventAuthorityPort)) {
      rejected.push(replayError(
        'E_COLLAB_OPERATION_REPLAY_ENTRY_INVALID',
        'ENTRY_FIELDS_REQUIRED',
        { index, opId: event.opId },
      ));
      continue;
    }

    if (seenOpIds.has(event.opId)) {
      rejected.push(replayError(
        'E_COLLAB_OPERATION_REPLAY_DUPLICATE_OP_ID',
        'OP_ID_ALREADY_REPLAYED',
        { index, opId: event.opId },
      ));
      continue;
    }
    seenOpIds.add(event.opId);

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

    steps.push(buildReplayStep(event, index, currentHash, receipt));
    currentHash = event.postStateHash;
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
