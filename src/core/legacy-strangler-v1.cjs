// R2.4 WP-202_LEGACY_STRANGLER - compare old and gateway routing observations
// before allowing exactly one existing save authority to execute.
'use strict';

const crypto = require('node:crypto');

const STRANGLER_SCHEMA_VERSION = 'yalken.writer-save-legacy-strangler.v1';
const OBSERVATION_SCHEMA_VERSION = 'yalken.writer-save-authority-observation.v1';
const ATOMIC_SCENE_MANIFEST_GATEWAY_SCHEMA_VERSION = 'yalken.atomic-scene-manifest-gateway.v1';

const ATOMIC_SCENE_MANIFEST_PHASE_CHAIN = Object.freeze([
  'ADMIT',
  'RECOVER',
  'PREPARE_JOURNAL',
  'MANIFEST_PUBLISH',
  'SCENE_PUBLISH',
  'COMMIT_POINT',
  'READBACK',
  'CLEANUP',
  'ACK',
]);

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

function assertIndependentObservers(observeLegacy, observeGateway) {
  if (typeof observeLegacy !== 'function' || typeof observeGateway !== 'function') {
    throw new LegacyStranglerError('E_LEGACY_STRANGLER_OBSERVER_REQUIRED', PHASES.ADMIT);
  }
  if (observeLegacy === observeGateway) {
    throw new LegacyStranglerError('E_LEGACY_STRANGLER_OBSERVERS_NOT_INDEPENDENT', PHASES.ADMIT);
  }
}

async function observeAuthorityPair(identity, observeLegacy, observeGateway) {
  assertIndependentObservers(observeLegacy, observeGateway);
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
  return Object.freeze({ legacy, gateway });
}

function validateAtomicSceneManifestReceipt(result, request) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new LegacyStranglerError(
      'E_ATOMIC_SCENE_MANIFEST_GATEWAY_RECEIPT_INVALID',
      PHASES.EXECUTE,
      'object',
    );
  }
  if (result.success !== true
    || result.revision !== request.revision
    || typeof result.transactionId !== 'string'
    || !/^[a-f0-9]{64}$/u.test(result.transactionId)
    || typeof result.sceneDigest !== 'string'
    || !/^[a-f0-9]{64}$/u.test(result.sceneDigest)
    || typeof result.manifestDigest !== 'string'
    || !/^[a-f0-9]{64}$/u.test(result.manifestDigest)
    || !Array.isArray(result.phases)
    || result.phases.length !== ATOMIC_SCENE_MANIFEST_PHASE_CHAIN.length
    || result.phases.some((phase, index) => phase !== ATOMIC_SCENE_MANIFEST_PHASE_CHAIN[index])) {
    throw new LegacyStranglerError(
      'E_ATOMIC_SCENE_MANIFEST_GATEWAY_RECEIPT_INVALID',
      PHASES.EXECUTE,
      'durable-project-transaction',
    );
  }
  return result;
}

// C5C1: project-bound scene + manifest writes expose exactly one executor.
// The legacy route is retained only as a read-only compatibility observation;
// it is structurally absent from the write API and can never be a fallback.
async function executeAtomicSceneManifestGatewayCutover({
  request,
  observeLegacy,
  observeGateway,
  executeGateway,
}) {
  if (typeof executeGateway !== 'function') {
    throw new LegacyStranglerError('E_ATOMIC_SCENE_MANIFEST_GATEWAY_REQUIRED', PHASES.ADMIT);
  }
  const identity = createWriterSaveAuthorityIdentity(request || {});
  if (identity.projectBound !== true || identity.projectAuthorityPath.length === 0) {
    throw new LegacyStranglerError('E_ATOMIC_SCENE_MANIFEST_PROJECT_BINDING_REQUIRED', PHASES.ADMIT);
  }
  const { legacy, gateway } = await observeAuthorityPair(identity, observeLegacy, observeGateway);
  if (gateway.route !== SAVE_AUTHORITY_ROUTES.PROJECT_TRANSACTION_V1) {
    throw new LegacyStranglerError(
      'E_ATOMIC_SCENE_MANIFEST_ROUTE_REQUIRED',
      PHASES.COMPARE,
      gateway.route,
    );
  }

  const result = validateAtomicSceneManifestReceipt(
    await executeGateway(Object.freeze({ ...request, authorityIdentity: identity })),
    request,
  );
  return Object.freeze({
    ...result,
    atomicSceneManifestGateway: Object.freeze({
      schemaVersion: ATOMIC_SCENE_MANIFEST_GATEWAY_SCHEMA_VERSION,
      requestDigest: identity.identityDigest,
      selectedRoute: gateway.route,
      observerCount: 2,
      legacyObserverId: legacy.observerId,
      gatewayObserverId: gateway.observerId,
      legacyAuthorityRole: 'READ_ONLY_OBSERVER',
      legacyFallbackMode: 'READ_ONLY_OBSERVATION_ONLY',
      legacyWriteFallbackAllowed: false,
      dualObserved: true,
      dualWriteAllowed: false,
      gatewayExecutorCount: 1,
      durabilityAuthority: SAVE_AUTHORITY_ROUTES.PROJECT_TRANSACTION_V1,
      durabilityPhaseChain: ATOMIC_SCENE_MANIFEST_PHASE_CHAIN,
    }),
  });
}

async function executeWriterSaveThroughStranglerGateway({
  request,
  observeLegacy,
  observeGateway,
  executors,
}) {
  assertIndependentObservers(observeLegacy, observeGateway);
  if (!executors || typeof executors !== 'object' || Array.isArray(executors)) {
    throw new LegacyStranglerError('E_LEGACY_STRANGLER_EXECUTORS_REQUIRED', PHASES.ADMIT);
  }

  const identity = createWriterSaveAuthorityIdentity(request || {});
  const { legacy, gateway } = await observeAuthorityPair(identity, observeLegacy, observeGateway);

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
  ATOMIC_SCENE_MANIFEST_GATEWAY_SCHEMA_VERSION,
  ATOMIC_SCENE_MANIFEST_PHASE_CHAIN,
  LegacyStranglerError,
  OBSERVATION_SCHEMA_VERSION,
  OBSERVER_IDS,
  PHASES,
  SAVE_AUTHORITY_ROUTES,
  STRANGLER_SCHEMA_VERSION,
  createAuthorityObservation,
  createWriterSaveAuthorityIdentity,
  executeAtomicSceneManifestGatewayCutover,
  executeWriterSaveThroughStranglerGateway,
  validateObservation,
});
