import { createHash } from 'node:crypto';

const EVENTLOG_SCHEMA_VERSION = 'collab-eventlog.v1';

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

function normalizeEventEntry(input = {}) {
  const entry = isPlainObject(input) ? input : {};
  return {
    opId: normalizeString(entry.opId),
    ts: normalizeString(entry.ts),
    actorId: normalizeString(entry.actorId),
    commandId: normalizeString(entry.commandId),
    payloadHash: normalizeString(entry.payloadHash),
    preStateHash: normalizeString(entry.preStateHash),
    postStateHash: normalizeString(entry.postStateHash),
  };
}

function eventEntryValid(entry) {
  return Boolean(
    entry.opId
    && entry.ts
    && entry.actorId
    && entry.commandId
    && entry.payloadHash
    && entry.preStateHash
    && entry.postStateHash,
  );
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
  if (!eventEntryValid(entry)) {
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
  const entry = {
    opId: normalizeString(input.opId),
    ts: normalizeString(input.ts),
    actorId: normalizeString(input.actorId),
    commandId,
    payloadHash: hashCanonical(payload),
    preStateHash: currentStateHash,
    postStateHash,
  };
  const append = appendEventLogEntry({
    eventLog: input.eventLog,
    entry,
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
    if (!eventEntryValid(event)) {
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
