import { createHash } from 'node:crypto';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function canonicalSerialize(value) {
  if (value === null) return 'null';
  const valueType = typeof value;
  if (valueType === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (valueType === 'boolean') return value ? 'true' : 'false';
  if (valueType === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalSerialize(item)).join(',')}]`;
  if (valueType === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalSerialize(value[key])}`).join(',')}}`;
  }
  return 'null';
}

function hashCanonical(value) {
  return createHash('sha256').update(Buffer.from(canonicalSerialize(value), 'utf8')).digest('hex');
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeDomainEvents(events) {
  return Array.isArray(events) ? events.map((event) => cloneJson(event)) : [];
}

function getDomainEventPort(input = {}) {
  const port = isPlainObject(input.domainEventPort) ? input.domainEventPort : {};
  const validate = typeof port.validateCoreDomainEvent === 'function'
    ? port.validateCoreDomainEvent
    : typeof port.validateDomainEvent === 'function'
      ? port.validateDomainEvent
      : null;
  return {
    validate,
    hash: typeof port.hashCoreDomainEvents === 'function'
      ? port.hashCoreDomainEvents
      : typeof port.hashDomainEvents === 'function'
        ? port.hashDomainEvents
        : null,
  };
}

function domainEventsValid(events, domainEventPort) {
  try {
    const normalized = normalizeDomainEvents(events);
    if (normalized.length > 0 && (typeof domainEventPort.validate !== 'function' || typeof domainEventPort.hash !== 'function')) return false;
    return normalized.every((event) => {
      const validation = domainEventPort.validate(event);
      return validation === true || validation?.ok === true;
    });
  } catch {
    return false;
  }
}

function normalizeEvent(input = {}) {
  const event = isPlainObject(input) ? input : {};
  const payload = Object.prototype.hasOwnProperty.call(event, 'payload')
    ? cloneJson(event.payload)
    : null;
  return {
    eventId: normalizeString(event.eventId),
    actorId: normalizeString(event.actorId),
    ts: normalizeString(event.ts),
    opId: normalizeString(event.opId),
    commandId: normalizeString(event.commandId),
    payload,
    prevHash: normalizeString(event.prevHash),
  };
}

function normalizeEvents(events) {
  if (!Array.isArray(events)) return [];
  return events.map((event) => normalizeEvent(event));
}

function buildRejectionEnvelope(base, code, reason, details = {}) {
  return {
    code,
    opId: base.opId || '',
    eventId: base.eventId || '',
    commandId: base.commandId || '',
    reason,
    details: isPlainObject(details) ? cloneJson(details) : {},
  };
}

function collectMissingFields(event) {
  const missing = [];
  if (!event.eventId) missing.push('eventId');
  if (!event.actorId) missing.push('actorId');
  if (!event.ts) missing.push('ts');
  if (!event.opId) missing.push('opId');
  if (!event.commandId) missing.push('commandId');
  return missing;
}

function defaultHashState(state) {
  return hashCanonical(state);
}

export function applyEventLog(input = {}) {
  const coreState = isPlainObject(input.coreState) ? cloneJson(input.coreState) : {};
  const events = normalizeEvents(input.events);
  const applyCommand = typeof input.applyCommand === 'function' ? input.applyCommand : null;
  const hashState = typeof input.hashState === 'function' ? input.hashState : defaultHashState;
  const domainEventPort = getDomainEventPort(input);
  const rejected = [];
  const seenEventIds = new Set();

  let nextState = coreState;
  let stateHash = normalizeString(input.initialStateHash) || hashState(nextState);
  let appliedCount = 0;
  const domainEvents = [];

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const missingFields = collectMissingFields(event);
    if (missingFields.length > 0) {
      rejected.push(buildRejectionEnvelope(
        event,
        'E_COLLAB_APPLY_EVENT_INVALID',
        'EVENT_FIELDS_REQUIRED',
        { index, missingFields },
      ));
      continue;
    }

    if (seenEventIds.has(event.eventId)) {
      rejected.push(buildRejectionEnvelope(
        event,
        'E_COLLAB_APPLY_DUPLICATE_EVENT_ID',
        'EVENT_ID_DUPLICATE',
        { index, eventId: event.eventId },
      ));
      continue;
    }
    seenEventIds.add(event.eventId);

    if (event.prevHash && event.prevHash !== stateHash) {
      rejected.push(buildRejectionEnvelope(
        event,
        'E_COLLAB_APPLY_PREV_HASH_MISMATCH',
        'PREV_HASH_MISMATCH',
        {
          index,
          expectedPrevHash: stateHash,
          actualPrevHash: event.prevHash,
        },
      ));
      continue;
    }

    if (!applyCommand) {
      rejected.push(buildRejectionEnvelope(
        event,
        'E_COLLAB_APPLY_HANDLER_REQUIRED',
        'APPLY_COMMAND_HANDLER_REQUIRED',
        { index },
      ));
      continue;
    }

    const command = {
      type: event.commandId,
      payload: cloneJson(event.payload),
    };
    const applyResult = applyCommand(nextState, command);
    if (!isPlainObject(applyResult) || applyResult.ok !== true || !isPlainObject(applyResult.state)) {
      rejected.push(buildRejectionEnvelope(
        event,
        'E_COLLAB_APPLY_COMMAND_REJECTED',
        'COMMAND_REJECTED',
        {
          index,
          innerCode: applyResult?.error?.code || '',
          innerReason: applyResult?.error?.reason || '',
        },
      ));
      continue;
    }

    const resultEvents = normalizeDomainEvents(applyResult.events);
    if (!domainEventsValid(resultEvents, domainEventPort)) {
      rejected.push(buildRejectionEnvelope(
        event,
        'E_COLLAB_APPLY_DOMAIN_EVENTS_INVALID',
        'DOMAIN_EVENTS_INVALID',
        { index },
      ));
      continue;
    }
    nextState = cloneJson(applyResult.state);
    stateHash = normalizeString(applyResult.stateHash) || hashState(nextState);
    domainEvents.push(...resultEvents);
    appliedCount += 1;
  }

  return {
    nextState,
    appliedCount,
    rejected,
    stateHash,
    domainEvents,
    domainEventDigest: typeof domainEventPort.hash === 'function'
      ? domainEventPort.hash(domainEvents)
      : hashCanonical(domainEvents),
  };
}
