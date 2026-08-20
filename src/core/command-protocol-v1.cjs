// R2.4 K0_COMMAND_PROTOCOL — unified operation identities and result/error
// contract. The five operation classes stay distinct; every refusal carries
// one canonical machine code plus the legacy fields for consumers.
'use strict';

const OPERATION_CLASSES = Object.freeze({
  COMMAND: 'COMMAND',
  QUERY: 'QUERY',
  EVENT: 'EVENT',
  EFFECT: 'EFFECT',
  BACKGROUND_JOB: 'BACKGROUND_JOB',
});

// The bridge registry binds each payload channel to its operation class and
// identity field. Classes are never interchangeable: a query id cannot ride
// the command bridge, a command id cannot ride the query bridge.
const BRIDGE_PROTOCOL_REGISTRY = Object.freeze({
  'ui:command-bridge': Object.freeze({ operationClass: OPERATION_CLASSES.COMMAND, idField: 'commandId' }),
  'ui:workspace-query-bridge': Object.freeze({ operationClass: OPERATION_CLASSES.QUERY, idField: 'queryId' }),
  'ui:save-lifecycle-signal-bridge': Object.freeze({ operationClass: OPERATION_CLASSES.COMMAND, idField: 'signalId' }),
});

class CommandProtocolError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
  }
}

const isObjectRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function bridgeOperationClass(channel) {
  const entry = BRIDGE_PROTOCOL_REGISTRY[channel];
  if (!entry) throw new CommandProtocolError('E_PROTOCOL_CHANNEL_UNKNOWN', String(channel));
  return entry.operationClass;
}

// Canonical refusal: { ok:false, code, reason }. Legacy fields (error) are
// preserved verbatim so existing consumers keep working; the machine code is
// the unified contract surface.
function normalizeProtocolResult(result) {
  if (!isObjectRecord(result)) throw new CommandProtocolError('E_PROTOCOL_RESULT_SHAPE');
  if (result.ok === true) return result;
  // Handler-produced payloads without an ok flag pass through unchanged;
  // the unified contract governs declared results, not free-form payloads.
  if (result.ok !== false) return result;
  const code = typeof result.code === 'string' && result.code.length > 0
    ? result.code
    : (typeof result.error === 'string' && result.error.length > 0
      ? result.error
      : (isObjectRecord(result.error) && typeof result.error.code === 'string' && result.error.code.length > 0
        ? result.error.code
        : (typeof result.reason === 'string' && result.reason.length > 0 ? result.reason : null)));
  if (code === null) throw new CommandProtocolError('E_PROTOCOL_REFUSAL_CODE_MISSING');
  const reason = typeof result.reason === 'string' && result.reason.length > 0
    ? result.reason
    : (typeof result.error === 'string' ? result.error : (isObjectRecord(result.error) && typeof result.error.reason === 'string' ? result.error.reason : code));
  return Object.freeze({ ...result, ok: false, code, reason });
}

module.exports = Object.freeze({
  BRIDGE_PROTOCOL_REGISTRY,
  OPERATION_CLASSES,
  CommandProtocolError,
  bridgeOperationClass,
  normalizeProtocolResult,
});
