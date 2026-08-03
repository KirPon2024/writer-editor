import { createHash } from 'node:crypto';

export const COLLABORATOR_EVENT_ENVELOPE_SCHEMA_VERSION = 'yalken.collaborator.eventEnvelope.v1';
export const COLLABORATOR_COMMAND_VERSION = 1;

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

function normalizeStringArray(value) {
  return Array.isArray(value) ? value.map((item) => normalizeString(item)).filter(Boolean) : [];
}

function normalizeTargets(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((target) => isPlainObject(target))
    .map((target) => ({
      ...cloneJson(target),
      targetKind: normalizeString(target.targetKind || target.kind),
      targetId: normalizeString(target.targetId || target.id),
    }))
    .filter((target) => target.targetKind && target.targetId);
}

function collaboratorAdmissionError(event, code, reason, details = {}) {
  return {
    ok: false,
    error: buildRejectionEnvelope(isPlainObject(event) ? event : {}, code, reason, details),
  };
}

/**
 * Validate the original transport object before any lossy normalization. This
 * function is intentionally strict: collaborator input is an authority
 * boundary, not a migration surface for unknown schema versions.
 */
export function admitCollaboratorEventEnvelope(input, options = {}) {
  if (!isPlainObject(input)) {
    return collaboratorAdmissionError({}, 'E_COLLAB_APPLY_ENVELOPE_REQUIRED', 'COLLABORATOR_EVENT_ENVELOPE_REQUIRED');
  }
  const legacyEnvelope = input.schemaVersion === undefined && input.commandVersion === undefined;
  if (!legacyEnvelope && input.schemaVersion !== COLLABORATOR_EVENT_ENVELOPE_SCHEMA_VERSION) {
    return collaboratorAdmissionError(
      input,
      'E_COLLAB_APPLY_EVENT_SCHEMA_UNSUPPORTED',
      'COLLABORATOR_EVENT_SCHEMA_UNSUPPORTED',
      { schemaVersion: normalizeString(input.schemaVersion) },
    );
  }
  if (!legacyEnvelope && (!Number.isSafeInteger(input.commandVersion) || input.commandVersion !== COLLABORATOR_COMMAND_VERSION)) {
    return collaboratorAdmissionError(
      input,
      'E_COLLAB_APPLY_COMMAND_VERSION_UNSUPPORTED',
      'COLLABORATOR_COMMAND_VERSION_UNSUPPORTED',
      { commandVersion: input.commandVersion },
    );
  }
  const expectedProjectId = normalizeString(options.expectedProjectId);
  const expectedLifecycleId = normalizeString(options.expectedLifecycleId);
  const projectId = normalizeString(input.projectId) || (legacyEnvelope ? expectedProjectId : '');
  const lifecycleId = normalizeString(input.lifecycleId) || (legacyEnvelope ? expectedLifecycleId : '');
  if (!projectId || (expectedProjectId && projectId !== expectedProjectId)) {
    return collaboratorAdmissionError(
      input,
      'E_COLLAB_APPLY_PROJECT_MISMATCH',
      'COLLABORATOR_EVENT_PROJECT_MISMATCH',
      { expectedProjectId, actualProjectId: projectId },
    );
  }
  if (!lifecycleId || (expectedLifecycleId && lifecycleId !== expectedLifecycleId)) {
    return collaboratorAdmissionError(
      input,
      'E_COLLAB_APPLY_LIFECYCLE_MISMATCH',
      'COLLABORATOR_EVENT_LIFECYCLE_MISMATCH',
      { expectedLifecycleId, actualLifecycleId: lifecycleId },
    );
  }
  const requiredStrings = ['eventId', 'actorId', 'ts', 'opId', 'commandId', 'prevHash'];
  if (!legacyEnvelope) requiredStrings.push('sessionId');
  const missingFields = requiredStrings.filter((field) => !normalizeString(input[field]));
  if (missingFields.length > 0 || !Object.prototype.hasOwnProperty.call(input, 'payload')) {
    return collaboratorAdmissionError(
      input,
      'E_COLLAB_APPLY_EVENT_INVALID',
      'EVENT_FIELDS_REQUIRED',
      { missingFields: [...missingFields, ...(!Object.prototype.hasOwnProperty.call(input, 'payload') ? ['payload'] : [])] },
    );
  }
  if (
    !legacyEnvelope
    && (!Array.isArray(input.dependencies) || !Array.isArray(input.targets) || !isPlainObject(input.causal))
  ) {
    return collaboratorAdmissionError(
      input,
      'E_COLLAB_APPLY_PROVENANCE_REQUIRED',
      'COLLABORATOR_EVENT_PROVENANCE_REQUIRED',
      { required: ['dependencies', 'targets', 'causal'] },
    );
  }
  const dependencies = Array.isArray(input.dependencies) ? normalizeStringArray(input.dependencies) : [];
  const targets = Array.isArray(input.targets)
    ? normalizeTargets(input.targets)
    : [{ targetKind: 'project', targetId: projectId }];
  const causal = isPlainObject(input.causal)
    ? cloneJson(input.causal)
    : { correlationId: normalizeString(input.opId), causationId: normalizeString(input.opId) };
  if (
    (Array.isArray(input.dependencies) && dependencies.length !== input.dependencies.length)
    || (Array.isArray(input.targets) && targets.length !== input.targets.length)
    || !normalizeString(causal.correlationId)
    || !normalizeString(causal.causationId)
  ) {
    return collaboratorAdmissionError(
      input,
      'E_COLLAB_APPLY_PROVENANCE_INVALID',
      'COLLABORATOR_EVENT_PROVENANCE_INVALID',
    );
  }
  const envelope = {
    schemaVersion: COLLABORATOR_EVENT_ENVELOPE_SCHEMA_VERSION,
    commandVersion: COLLABORATOR_COMMAND_VERSION,
    projectId,
    lifecycleId,
    eventId: normalizeString(input.eventId),
    actorId: normalizeString(input.actorId),
    ts: normalizeString(input.ts),
    opId: normalizeString(input.opId),
    commandId: normalizeString(input.commandId),
    sessionId: normalizeString(input.sessionId) || `legacy-session:${normalizeString(input.actorId)}`,
    payload: cloneJson(input.payload),
    prevHash: normalizeString(input.prevHash),
    dependencies,
    targets,
    causal,
    admission: {
      legacyEnvelopeMigrated: legacyEnvelope,
      originalFieldNames: Object.keys(input).sort(),
    },
  };
  return {
    ok: true,
    event: envelope,
    provenanceDigest: hashCanonical(envelope),
  };
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
  const normalized = {
    eventId: normalizeString(event.eventId),
    actorId: normalizeString(event.actorId),
    ts: normalizeString(event.ts),
    opId: normalizeString(event.opId),
    commandId: normalizeString(event.commandId),
    payload,
    prevHash: normalizeString(event.prevHash),
  };
  if (event.schemaVersion) normalized.schemaVersion = normalizeString(event.schemaVersion);
  if (Number.isSafeInteger(event.commandVersion)) normalized.commandVersion = event.commandVersion;
  if (event.projectId) normalized.projectId = normalizeString(event.projectId);
  if (event.lifecycleId) normalized.lifecycleId = normalizeString(event.lifecycleId);
  if (event.sessionId) normalized.sessionId = normalizeString(event.sessionId);
  if (Array.isArray(event.dependencies)) normalized.dependencies = normalizeStringArray(event.dependencies);
  if (Array.isArray(event.targets)) normalized.targets = normalizeTargets(event.targets);
  if (isPlainObject(event.causal)) normalized.causal = cloneJson(event.causal);
  if (isPlainObject(event.admission)) normalized.admission = cloneJson(event.admission);
  if (event.provenanceDigest) normalized.provenanceDigest = normalizeString(event.provenanceDigest);
  return normalized;
}

function normalizeEvents(events) {
  if (!Array.isArray(events)) return [];
  return events.map((event) => normalizeEvent(event));
}

function normalizeKnownIds(value) {
  if (value instanceof Set) return new Set([...value].map((item) => normalizeString(item)).filter(Boolean));
  if (Array.isArray(value)) return new Set(value.map((item) => normalizeString(item)).filter(Boolean));
  return new Set();
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
  const rawEvents = Array.isArray(input.events) ? input.events : [];
  let events;
  if (input.requireStrictEnvelope === true) {
    const admitted = rawEvents.map((event) => admitCollaboratorEventEnvelope(event, {
      expectedProjectId: input.expectedProjectId,
      expectedLifecycleId: input.expectedLifecycleId,
    }));
    const rejectedAdmission = admitted
      .map((result, index) => (result.ok ? null : { ...result.error, details: { ...result.error.details, index } }))
      .filter(Boolean);
    if (rejectedAdmission.length > 0) {
      const initialStateHash = normalizeString(input.initialStateHash) || (
        typeof input.hashState === 'function' ? input.hashState(coreState) : defaultHashState(coreState)
      );
      return {
        nextState: coreState,
        appliedCount: 0,
        rejected: rejectedAdmission,
        stateHash: initialStateHash,
        domainEvents: [],
        appliedEvents: [],
        domainEventDigest: hashCanonical([]),
      };
    }
    events = admitted.map((result) => normalizeEvent({
      ...result.event,
      provenanceDigest: result.provenanceDigest,
    }));
  } else {
    events = normalizeEvents(rawEvents);
  }
  const applyCommand = typeof input.applyCommand === 'function' ? input.applyCommand : null;
  const hashState = typeof input.hashState === 'function' ? input.hashState : defaultHashState;
  const domainEventPort = getDomainEventPort(input);
  const rejected = [];
  const seenEventIds = new Set();
  const seenOpIds = new Set();
  const knownEventIds = normalizeKnownIds(input.knownEventIds);
  const knownOpIds = normalizeKnownIds(input.knownOpIds);

  let nextState = coreState;
  let stateHash = normalizeString(input.initialStateHash) || hashState(nextState);
  let appliedCount = 0;
  const domainEvents = [];
  const appliedEvents = [];

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

    if (knownEventIds.has(event.eventId)) {
      rejected.push(buildRejectionEnvelope(
        event,
        'E_COLLAB_APPLY_DUPLICATE_EVENT_ID_DURABLE',
        'EVENT_ID_ALREADY_DURABLE',
        { index, eventId: event.eventId },
      ));
      continue;
    }

    if (seenOpIds.has(event.opId) || knownOpIds.has(event.opId)) {
      rejected.push(buildRejectionEnvelope(
        event,
        'E_COLLAB_APPLY_DUPLICATE_OP_ID',
        'OP_ID_DUPLICATE',
        { index, opId: event.opId, durable: knownOpIds.has(event.opId) },
      ));
      continue;
    }
    seenOpIds.add(event.opId);

    if (!event.prevHash) {
      rejected.push(buildRejectionEnvelope(
        event,
        'E_COLLAB_APPLY_PREV_HASH_REQUIRED',
        'PREV_HASH_REQUIRED',
        { index },
      ));
      continue;
    }

    if (event.prevHash !== stateHash) {
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
    const beforeStateHash = stateHash;
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
    appliedEvents.push({
      event: cloneJson(event),
      command,
      preStateHash: beforeStateHash,
      postStateHash: stateHash,
      domainEvents: resultEvents,
      domainEventDigest: typeof domainEventPort.hash === 'function'
        ? domainEventPort.hash(resultEvents)
        : hashCanonical(resultEvents),
    });
    appliedCount += 1;
  }

  return {
    nextState,
    appliedCount,
    rejected,
    stateHash,
    domainEvents,
    appliedEvents,
    domainEventDigest: typeof domainEventPort.hash === 'function'
      ? domainEventPort.hash(domainEvents)
      : hashCanonical(domainEvents),
  };
}
