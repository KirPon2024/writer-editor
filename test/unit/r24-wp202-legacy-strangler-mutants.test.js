'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MODULE_PATH = path.join(__dirname, '..', '..', 'src', 'core', 'legacy-strangler-v1.cjs');

const MUTANTS = [
  {
    id: 'comparison-guard-removed',
    find: 'if (legacy.route !== gateway.route) {',
    replace: 'if (false) {',
  },
  {
    id: 'request-binding-removed',
    find: 'if (observation.requestDigest !== identityDigest) {',
    replace: 'if (false) {',
  },
  {
    id: 'unknown-route-accepted',
    find: 'if (!Object.values(SAVE_AUTHORITY_ROUTES).includes(observation.route)) {',
    replace: 'if (false) {',
  },
  {
    id: 'observer-independence-removed',
    find: 'if (observeLegacy === observeGateway) {',
    replace: 'if (false) {',
  },
  {
    id: 'legacy-observation-aliased',
    find: 'await observeLegacy(identity),',
    replace: 'await observeGateway(identity),',
  },
  {
    id: 'duplicate-authority-execution',
    find: 'const result = await executor(Object.freeze({ ...request, authorityIdentity: identity }));',
    replace: 'await executor(Object.freeze({ ...request, authorityIdentity: identity }));\n  const result = await executor(Object.freeze({ ...request, authorityIdentity: identity }));',
  },
  {
    id: 'execution-count-forged',
    find: 'executedAuthorityCount: 1,',
    replace: 'executedAuthorityCount: 2,',
  },
];

function observation(module, observerId, route, digest) {
  return module.createAuthorityObservation({ observerId, requestDigest: digest, route });
}

async function killOracle(module) {
  const { OBSERVER_IDS, SAVE_AUTHORITY_ROUTES } = module;
  const request = {
    filePath: '/tmp/wp202.txt',
    content: 'bytes',
    revision: 3,
    projectBound: false,
    projectAuthorityPath: null,
  };
  const executions = [];
  const receipt = await module.executeWriterSaveThroughStranglerGateway({
    request,
    observeLegacy: async (identity) => observation(
      module,
      OBSERVER_IDS.LEGACY,
      SAVE_AUTHORITY_ROUTES.DURABLE_SAVE_V1,
      identity.identityDigest,
    ),
    observeGateway: async (identity) => observation(
      module,
      OBSERVER_IDS.GATEWAY,
      SAVE_AUTHORITY_ROUTES.DURABLE_SAVE_V1,
      identity.identityDigest,
    ),
    executors: {
      [SAVE_AUTHORITY_ROUTES.DURABLE_SAVE_V1]: async () => {
        executions.push('durable');
        return { success: true };
      },
    },
  });
  assert.deepEqual(executions, ['durable']);
  assert.equal(receipt.legacyStrangler.executedAuthorityCount, 1);

  let mismatchExecutions = 0;
  await assert.rejects(module.executeWriterSaveThroughStranglerGateway({
    request,
    observeLegacy: async (identity) => observation(
      module,
      OBSERVER_IDS.LEGACY,
      SAVE_AUTHORITY_ROUTES.DURABLE_SAVE_V1,
      identity.identityDigest,
    ),
    observeGateway: async (identity) => observation(
      module,
      OBSERVER_IDS.GATEWAY,
      SAVE_AUTHORITY_ROUTES.PROJECT_TRANSACTION_V1,
      identity.identityDigest,
    ),
    executors: {
      [SAVE_AUTHORITY_ROUTES.DURABLE_SAVE_V1]: async () => { mismatchExecutions += 1; return { success: true }; },
      [SAVE_AUTHORITY_ROUTES.PROJECT_TRANSACTION_V1]: async () => { mismatchExecutions += 1; return { success: true }; },
    },
  }), (error) => error.code === 'E_LEGACY_STRANGLER_OBSERVATION_MISMATCH'
    || error.code === 'E_LEGACY_STRANGLER_OBSERVER_IDENTITY');
  assert.equal(mismatchExecutions, 0);

  await assert.rejects(module.executeWriterSaveThroughStranglerGateway({
    request,
    observeLegacy: async () => observation(
      module,
      OBSERVER_IDS.LEGACY,
      SAVE_AUTHORITY_ROUTES.DURABLE_SAVE_V1,
      '0'.repeat(64),
    ),
    observeGateway: async (identity) => observation(
      module,
      OBSERVER_IDS.GATEWAY,
      SAVE_AUTHORITY_ROUTES.DURABLE_SAVE_V1,
      identity.identityDigest,
    ),
    executors: {},
  }), (error) => error.code === 'E_LEGACY_STRANGLER_REQUEST_IDENTITY_MISMATCH'
    || error.code === 'E_LEGACY_STRANGLER_OBSERVER_IDENTITY');

  await assert.rejects(module.executeWriterSaveThroughStranglerGateway({
    request,
    observeLegacy: async (identity) => observation(module, OBSERVER_IDS.LEGACY, 'DIRECT_WRITE', identity.identityDigest),
    observeGateway: async (identity) => observation(module, OBSERVER_IDS.GATEWAY, 'DIRECT_WRITE', identity.identityDigest),
    executors: {},
  }), (error) => error.code === 'E_LEGACY_STRANGLER_ROUTE_UNKNOWN'
    || error.code === 'E_LEGACY_STRANGLER_OBSERVER_IDENTITY');

  const same = async (identity) => observation(
    module,
    OBSERVER_IDS.LEGACY,
    SAVE_AUTHORITY_ROUTES.DURABLE_SAVE_V1,
    identity.identityDigest,
  );
  await assert.rejects(module.executeWriterSaveThroughStranglerGateway({
    request,
    observeLegacy: same,
    observeGateway: same,
    executors: {},
  }), (error) => error.code === 'E_LEGACY_STRANGLER_OBSERVERS_NOT_INDEPENDENT');
}

test('WP202 executes and kills all named implementation mutants', async () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const results = [];
  for (const mutant of MUTANTS) {
    assert.equal(source.split(mutant.find).length - 1, 1, `unique anchor: ${mutant.id}`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-wp202-mutant-'));
    const target = path.join(dir, 'legacy-strangler-v1.cjs');
    fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
    let killed = false;
    let detail = '';
    try {
      await killOracle(require(target));
      detail = 'survived';
    } catch (error) {
      killed = true;
      detail = error.code || error.message;
    }
    results.push({ id: mutant.id, killed, detail });
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const survived = results.filter((result) => !result.killed);
  console.log(`R24_WP202_MUTATION_RECEIPT=${JSON.stringify({ total: results.length, killed: results.length - survived.length, survived: survived.map(({ id }) => id) })}`);
  assert.equal(results.length, 7);
  assert.deepEqual(survived, []);
});
