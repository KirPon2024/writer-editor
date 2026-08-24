'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  LegacyStranglerError,
  OBSERVER_IDS,
  SAVE_AUTHORITY_ROUTES,
  createAuthorityObservation,
  executeWriterSaveThroughStranglerGateway,
} = require('../../src/core/legacy-strangler-v1.cjs');

const request = Object.freeze({
  filePath: '/isolated/scene.txt',
  content: 'Writer bytes',
  revision: 7,
  projectBound: false,
  projectAuthorityPath: null,
});

function observer(observerId, route, calls) {
  return async (identity) => {
    calls.push(observerId);
    return createAuthorityObservation({ observerId, requestDigest: identity.identityDigest, route });
  };
}

test('WP202 dual-observes and executes only the selected durable authority', async () => {
  const observations = [];
  const executions = [];
  const receipt = await executeWriterSaveThroughStranglerGateway({
    request,
    observeLegacy: observer(OBSERVER_IDS.LEGACY, SAVE_AUTHORITY_ROUTES.DURABLE_SAVE_V1, observations),
    observeGateway: observer(OBSERVER_IDS.GATEWAY, SAVE_AUTHORITY_ROUTES.DURABLE_SAVE_V1, observations),
    executors: {
      [SAVE_AUTHORITY_ROUTES.DURABLE_SAVE_V1]: async () => {
        executions.push('durable');
        return { success: true, phases: ['ACK'], revision: 7 };
      },
      [SAVE_AUTHORITY_ROUTES.PROJECT_TRANSACTION_V1]: async () => {
        executions.push('project');
        return { success: true };
      },
    },
  });
  assert.deepEqual(observations, [OBSERVER_IDS.LEGACY, OBSERVER_IDS.GATEWAY]);
  assert.deepEqual(executions, ['durable']);
  assert.equal(receipt.legacyStrangler.dualObserved, true);
  assert.equal(receipt.legacyStrangler.executedAuthorityCount, 1);
  assert.equal(receipt.legacyStrangler.selectedRoute, SAVE_AUTHORITY_ROUTES.DURABLE_SAVE_V1);
});

test('WP202 project-bound routing executes only the existing project transaction authority', async () => {
  const executions = [];
  const projectRequest = {
    ...request,
    projectBound: true,
    projectAuthorityPath: '/isolated/project.json',
  };
  const receipt = await executeWriterSaveThroughStranglerGateway({
    request: projectRequest,
    observeLegacy: observer(OBSERVER_IDS.LEGACY, SAVE_AUTHORITY_ROUTES.PROJECT_TRANSACTION_V1, []),
    observeGateway: observer(OBSERVER_IDS.GATEWAY, SAVE_AUTHORITY_ROUTES.PROJECT_TRANSACTION_V1, []),
    executors: {
      [SAVE_AUTHORITY_ROUTES.DURABLE_SAVE_V1]: async () => executions.push('durable'),
      [SAVE_AUTHORITY_ROUTES.PROJECT_TRANSACTION_V1]: async ({ authorityIdentity }) => {
        executions.push('project');
        assert.equal(authorityIdentity.projectBound, true);
        return { success: true, phases: ['ACK'], revision: 7 };
      },
    },
  });
  assert.deepEqual(executions, ['project']);
  assert.equal(receipt.legacyStrangler.selectedRoute, SAVE_AUTHORITY_ROUTES.PROJECT_TRANSACTION_V1);
});

test('WP202 disagreement fails closed before any executor runs', async () => {
  let executions = 0;
  await assert.rejects(
    executeWriterSaveThroughStranglerGateway({
      request,
      observeLegacy: observer(OBSERVER_IDS.LEGACY, SAVE_AUTHORITY_ROUTES.DURABLE_SAVE_V1, []),
      observeGateway: observer(OBSERVER_IDS.GATEWAY, SAVE_AUTHORITY_ROUTES.PROJECT_TRANSACTION_V1, []),
      executors: {
        [SAVE_AUTHORITY_ROUTES.DURABLE_SAVE_V1]: async () => { executions += 1; },
        [SAVE_AUTHORITY_ROUTES.PROJECT_TRANSACTION_V1]: async () => { executions += 1; },
      },
    }),
    (error) => error instanceof LegacyStranglerError
      && error.code === 'E_LEGACY_STRANGLER_OBSERVATION_MISMATCH',
  );
  assert.equal(executions, 0);
});

test('WP202 rejects stale identities, unknown routes and aliased observers', async (t) => {
  await t.test('stale identity', async () => {
    await assert.rejects(
      executeWriterSaveThroughStranglerGateway({
        request,
        observeLegacy: async () => createAuthorityObservation({
          observerId: OBSERVER_IDS.LEGACY,
          requestDigest: '0'.repeat(64),
          route: SAVE_AUTHORITY_ROUTES.DURABLE_SAVE_V1,
        }),
        observeGateway: observer(OBSERVER_IDS.GATEWAY, SAVE_AUTHORITY_ROUTES.DURABLE_SAVE_V1, []),
        executors: {},
      }),
      (error) => error.code === 'E_LEGACY_STRANGLER_REQUEST_IDENTITY_MISMATCH',
    );
  });
  await t.test('unknown route', async () => {
    await assert.rejects(
      executeWriterSaveThroughStranglerGateway({
        request,
        observeLegacy: observer(OBSERVER_IDS.LEGACY, 'DIRECT_LEGACY_WRITE', []),
        observeGateway: observer(OBSERVER_IDS.GATEWAY, 'DIRECT_LEGACY_WRITE', []),
        executors: {},
      }),
      (error) => error.code === 'E_LEGACY_STRANGLER_ROUTE_UNKNOWN',
    );
  });
  await t.test('aliased observers', async () => {
    const same = observer(OBSERVER_IDS.LEGACY, SAVE_AUTHORITY_ROUTES.DURABLE_SAVE_V1, []);
    await assert.rejects(
      executeWriterSaveThroughStranglerGateway({
        request,
        observeLegacy: same,
        observeGateway: same,
        executors: {},
      }),
      (error) => error.code === 'E_LEGACY_STRANGLER_OBSERVERS_NOT_INDEPENDENT',
    );
  });
});

test('WP202 executor failure never invokes a fallback authority', async () => {
  const executions = [];
  const denied = new Error('primary denied');
  denied.code = 'E_PRIMARY_DENIED';
  await assert.rejects(
    executeWriterSaveThroughStranglerGateway({
      request,
      observeLegacy: observer(OBSERVER_IDS.LEGACY, SAVE_AUTHORITY_ROUTES.DURABLE_SAVE_V1, []),
      observeGateway: observer(OBSERVER_IDS.GATEWAY, SAVE_AUTHORITY_ROUTES.DURABLE_SAVE_V1, []),
      executors: {
        [SAVE_AUTHORITY_ROUTES.DURABLE_SAVE_V1]: async () => {
          executions.push('durable');
          throw denied;
        },
        [SAVE_AUTHORITY_ROUTES.PROJECT_TRANSACTION_V1]: async () => executions.push('project'),
      },
    }),
    (error) => error === denied,
  );
  assert.deepEqual(executions, ['durable']);
});

test('WP202 request identity is immutable and bound to content bytes', async () => {
  let firstDigest = null;
  const inspect = (observerId) => async (identity) => {
    assert.equal(Object.isFrozen(identity), true);
    assert.equal(identity.projectAuthorityPath, null);
    if (firstDigest === null) firstDigest = identity.identityDigest;
    assert.equal(identity.identityDigest, firstDigest);
    return createAuthorityObservation({
      observerId,
      requestDigest: identity.identityDigest,
      route: SAVE_AUTHORITY_ROUTES.DURABLE_SAVE_V1,
    });
  };
  await executeWriterSaveThroughStranglerGateway({
    request: { ...request, content: Buffer.from('Привет 👋', 'utf8') },
    observeLegacy: inspect(OBSERVER_IDS.LEGACY),
    observeGateway: inspect(OBSERVER_IDS.GATEWAY),
    executors: {
      [SAVE_AUTHORITY_ROUTES.DURABLE_SAVE_V1]: async () => ({ success: true }),
    },
  });
  assert.match(firstDigest, /^[a-f0-9]{64}$/u);
});
