// R2.4 WP-202_LEGACY_STRANGLER - compare old and gateway routing observations
// before allowing exactly one existing save authority to execute.
'use strict';

const crypto = require('node:crypto');

const STRANGLER_SCHEMA_VERSION = 'yalken.writer-save-legacy-strangler.v1';
const OBSERVATION_SCHEMA_VERSION = 'yalken.writer-save-authority-observation.v1';

const SAVE_AUTHORITY_ROUTES = Object.freeze({
  DURABLE_SAVE_V1: 'DURABLE_SAVE_V1',
  PROJECT_TRANSACTION_V1: 'PROJECT_TRANSACTION_V1',
});

const OBSERVER_IDS = Object.freeze({
  LEGACY: 'LEGACY_ROUTER_V1',
  GATEWAY: 'AUTHORITY_GATEWAY_V1',
});

const PHASES = Object.freeze({
  ADMIT: 'ADMIT',
  OBSERVE: 'OBSERVE',
  COMPARE: 'COMPARE',
  EXECUTE: 'EXECUTE',
});

class LegacyStranglerError extends Error {
  constructor(code, phase, detail = '') {
    super(detail ? `${code}@${phase}: ${detail}` : `${code}@${phase}`);
    this.code = code;
    this.phase = phase;
  }
}

const sha256hex = (value) => crypto.createHash('sha256').update(value).digest('hex');

function createWriterSaveAuthorityIdentity({
  filePath,
  content,
  revision,
  projectBound,
  projectAuthorityPath,
}) {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new LegacyStranglerError('E_LEGACY_STRANGLER_FILE_PATH_REQUIRED', PHASES.ADMIT);
  }
  if (typeof content !== 'string' && !Buffer.isBuffer(content)) {
    throw new LegacyStranglerError('E_LEGACY_STRANGLER_CONTENT_REQUIRED', PHASES.ADMIT);
  }
  if (!Number.isInteger(revision) || revision < 0) {
    throw new LegacyStranglerError('E_LEGACY_STRANGLER_REVISION_INVALID', PHASES.ADMIT);
  }
  if (typeof projectBound !== 'boolean') {
    throw new LegacyStranglerError('E_LEGACY_STRANGLER_PROJECT_BINDING_INVALID', PHASES.ADMIT);
  }
  if ((projectBound && (typeof projectAuthorityPath !== 'string' || projectAuthorityPath.length === 0))
    || (!projectBound && projectAuthorityPath !== null)) {
    throw new LegacyStranglerError('E_LEGACY_STRANGLER_PROJECT_AUTHORITY_PATH_INVALID', PHASES.ADMIT);
  }

  const identity = {
    schemaVersion: STRANGLER_SCHEMA_VERSION,
    filePath,
    contentDigest: sha256hex(content),
    revision,
    projectBound,
    projectAuthorityPath,
  };
  return Object.freeze({
    ...identity,
    identityDigest: sha256hex(JSON.stringify(identity)),
  });
}

function validateObservation(observation, expectedObserverId, identityDigest) {
  if (!observation || typeof observation !== 'object' || Array.isArray(observation)) {
    throw new LegacyStranglerError('E_LEGACY_STRANGLER_OBSERVATION_REQUIRED', PHASES.OBSERVE, expectedObserverId);
  }
  const keys = Object.keys(observation).sort();
  const expectedKeys = ['observerId', 'requestDigest', 'route', 'schemaVersion'];
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
    throw new LegacyStranglerError('E_LEGACY_STRANGLER_OBSERVATION_SHAPE', PHASES.OBSERVE, expectedObserverId);
  }
  if (observation.schemaVersion !== OBSERVATION_SCHEMA_VERSION
    || observation.observerId !== expectedObserverId) {
    throw new LegacyStranglerError('E_LEGACY_STRANGLER_OBSERVER_IDENTITY', PHASES.OBSERVE, expectedObserverId);
  }
  if (observation.requestDigest !== identityDigest) {
    throw new LegacyStranglerError('E_LEGACY_STRANGLER_REQUEST_IDENTITY_MISMATCH', PHASES.OBSERVE, expectedObserverId);
  }
  if (!Object.values(SAVE_AUTHORITY_ROUTES).includes(observation.route)) {
    throw new LegacyStranglerError('E_LEGACY_STRANGLER_ROUTE_UNKNOWN', PHASES.OBSERVE, String(observation.route));
  }
  return Object.freeze({ ...observation });
}

function createAuthorityObservation({ observerId, requestDigest, route }) {
  return Object.freeze({
    schemaVersion: OBSERVATION_SCHEMA_VERSION,
    observerId,
    requestDigest,
    route,
  });
}

async function executeWriterSaveThroughStranglerGateway({
  request,
  observeLegacy,
  observeGateway,
  executors,
}) {
  if (typeof observeLegacy !== 'function' || typeof observeGateway !== 'function') {
    throw new LegacyStranglerError('E_LEGACY_STRANGLER_OBSERVER_REQUIRED', PHASES.ADMIT);
  }
  if (observeLegacy === observeGateway) {
    throw new LegacyStranglerError('E_LEGACY_STRANGLER_OBSERVERS_NOT_INDEPENDENT', PHASES.ADMIT);
  }
  if (!executors || typeof executors !== 'object' || Array.isArray(executors)) {
    throw new LegacyStranglerError('E_LEGACY_STRANGLER_EXECUTORS_REQUIRED', PHASES.ADMIT);
  }

  const identity = createWriterSaveAuthorityIdentity(request || {});
  const legacy = validateObservation(
    await observeLegacy(identity),
    OBSERVER_IDS.LEGACY,
    identity.identityDigest,
  );
  const gateway = validateObservation(
    await observeGateway(identity),
    OBSERVER_IDS.GATEWAY,
    identity.identityDigest,
  );

  if (legacy.route !== gateway.route) {
    throw new LegacyStranglerError(
      'E_LEGACY_STRANGLER_OBSERVATION_MISMATCH',
      PHASES.COMPARE,
      `${legacy.route}!=${gateway.route}`,
    );
  }

  const executor = executors[gateway.route];
  if (typeof executor !== 'function') {
    throw new LegacyStranglerError('E_LEGACY_STRANGLER_EXECUTOR_MISSING', PHASES.EXECUTE, gateway.route);
  }
  const result = await executor(Object.freeze({ ...request, authorityIdentity: identity }));
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new LegacyStranglerError('E_LEGACY_STRANGLER_EXECUTOR_RECEIPT_INVALID', PHASES.EXECUTE, gateway.route);
  }

  return Object.freeze({
    ...result,
    legacyStrangler: Object.freeze({
      schemaVersion: STRANGLER_SCHEMA_VERSION,
      requestDigest: identity.identityDigest,
      dualObserved: true,
      observerCount: 2,
      selectedRoute: gateway.route,
      executedAuthorityCount: 1,
      legacyObserverId: legacy.observerId,
      gatewayObserverId: gateway.observerId,
    }),
  });
}

module.exports = Object.freeze({
  LegacyStranglerError,
  OBSERVATION_SCHEMA_VERSION,
  OBSERVER_IDS,
  PHASES,
  SAVE_AUTHORITY_ROUTES,
  STRANGLER_SCHEMA_VERSION,
  createAuthorityObservation,
  createWriterSaveAuthorityIdentity,
  executeWriterSaveThroughStranglerGateway,
  validateObservation,
});
