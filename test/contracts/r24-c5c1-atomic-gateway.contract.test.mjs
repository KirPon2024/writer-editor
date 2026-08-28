import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const MODULE_PATH = path.join(REPO_ROOT, 'src', 'core', 'legacy-strangler-v1.cjs');
const {
  ATOMIC_SCENE_MANIFEST_PHASE_CHAIN,
  LegacyStranglerError,
  OBSERVER_IDS,
  SAVE_AUTHORITY_ROUTES,
  createAuthorityObservation,
  executeAtomicSceneManifestGatewayCutover,
} = require(MODULE_PATH);
const { commitProjectTransaction } = require(path.join(REPO_ROOT, 'src', 'core', 'project-transaction-v1.cjs'));
const { durableSaveTransaction } = require(path.join(REPO_ROOT, 'src', 'core', 'save-coordinator-v1.cjs'));

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function projectRequest(root, revision = 9) {
  return {
    filePath: path.join(root, 'scenes', 'scene.txt'),
    content: 'new scene Привет 👩🏽‍💻\n',
    revision,
    projectBound: true,
    projectAuthorityPath: path.join(root, 'project.json'),
  };
}

function observers(route = SAVE_AUTHORITY_ROUTES.PROJECT_TRANSACTION_V1, calls = []) {
  return {
    observeLegacy: async (identity) => {
      calls.push('legacy-read-only');
      return createAuthorityObservation({
        observerId: OBSERVER_IDS.LEGACY,
        requestDigest: identity.identityDigest,
        route,
      });
    },
    observeGateway: async (identity) => {
      calls.push('gateway');
      return createAuthorityObservation({
        observerId: OBSERVER_IDS.GATEWAY,
        requestDigest: identity.identityDigest,
        route,
      });
    },
  };
}

function validReceipt(request, extra = {}) {
  return {
    success: true,
    phases: [...ATOMIC_SCENE_MANIFEST_PHASE_CHAIN],
    revision: request.revision,
    transactionId: sha256('transaction'),
    sceneDigest: sha256(request.content),
    manifestDigest: sha256('manifest'),
    ...extra,
  };
}

test('C5C1 exposes one gateway executor and makes legacy a read-only observation only', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-c5c1-api-'));
  const request = projectRequest(root);
  const calls = [];
  let executions = 0;
  const receipt = await executeAtomicSceneManifestGatewayCutover({
    request,
    ...observers(SAVE_AUTHORITY_ROUTES.PROJECT_TRANSACTION_V1, calls),
    executeGateway: async ({ authorityIdentity }) => {
      executions += 1;
      assert.equal(authorityIdentity.projectAuthorityPath, request.projectAuthorityPath);
      return validReceipt(request);
    },
    legacyExecutor: async () => assert.fail('legacy write must not be an API'),
  });
  assert.deepEqual(calls, ['legacy-read-only', 'gateway']);
  assert.equal(executions, 1);
  assert.deepEqual(receipt.atomicSceneManifestGateway, {
    schemaVersion: 'yalken.atomic-scene-manifest-gateway.v1',
    requestDigest: receipt.atomicSceneManifestGateway.requestDigest,
    selectedRoute: 'PROJECT_TRANSACTION_V1',
    observerCount: 2,
    legacyObserverId: 'LEGACY_ROUTER_V1',
    gatewayObserverId: 'AUTHORITY_GATEWAY_V1',
    legacyAuthorityRole: 'READ_ONLY_OBSERVER',
    legacyFallbackMode: 'READ_ONLY_OBSERVATION_ONLY',
    legacyWriteFallbackAllowed: false,
    dualObserved: true,
    dualWriteAllowed: false,
    gatewayExecutorCount: 1,
    durabilityAuthority: 'PROJECT_TRANSACTION_V1',
    durabilityPhaseChain: [...ATOMIC_SCENE_MANIFEST_PHASE_CHAIN],
  });
});

test('C5C1 rejects unbound requests, non-project routes and forged durability receipts', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-c5c1-negative-'));
  const request = projectRequest(root);
  await t.test('project binding required', async () => {
    await assert.rejects(executeAtomicSceneManifestGatewayCutover({
      request: { ...request, projectBound: false, projectAuthorityPath: null },
      ...observers(),
      executeGateway: async () => validReceipt(request),
    }), (error) => error instanceof LegacyStranglerError
      && error.code === 'E_ATOMIC_SCENE_MANIFEST_PROJECT_BINDING_REQUIRED');
  });
  await t.test('project transaction route required', async () => {
    await assert.rejects(executeAtomicSceneManifestGatewayCutover({
      request,
      ...observers(SAVE_AUTHORITY_ROUTES.DURABLE_SAVE_V1),
      executeGateway: async () => validReceipt(request),
    }), (error) => error.code === 'E_ATOMIC_SCENE_MANIFEST_ROUTE_REQUIRED');
  });
  await t.test('full durability receipt required', async () => {
    await assert.rejects(executeAtomicSceneManifestGatewayCutover({
      request,
      ...observers(),
      executeGateway: async () => ({ success: true, phases: ['ACK'] }),
    }), (error) => error.code === 'E_ATOMIC_SCENE_MANIFEST_GATEWAY_RECEIPT_INVALID');
  });
});

test('C5C1 gateway failure has no legacy write fallback and no target mutation', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-c5c1-fault-'));
  const request = projectRequest(root);
  fs.mkdirSync(path.dirname(request.filePath), { recursive: true });
  fs.writeFileSync(request.filePath, 'before scene');
  fs.writeFileSync(request.projectAuthorityPath, '{"revision":1}');
  let gatewayExecutions = 0;
  const fault = Object.assign(new Error('injected before publish'), { code: 'E_C5C1_INJECTED' });
  await assert.rejects(executeAtomicSceneManifestGatewayCutover({
    request,
    ...observers(),
    executeGateway: async () => {
      gatewayExecutions += 1;
      throw fault;
    },
  }), (error) => error === fault);
  assert.equal(gatewayExecutions, 1);
  assert.equal(fs.readFileSync(request.filePath, 'utf8'), 'before scene');
  assert.equal(fs.readFileSync(request.projectAuthorityPath, 'utf8'), '{"revision":1}');
});

test('C5C1 real gateway durably publishes and reads back one scene plus manifest pair', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-c5c1-physical-'));
  const request = projectRequest(root, 10);
  const beforeScene = 'before scene';
  const beforeManifest = '{"revision":1}';
  const afterManifest = '{"revision":2}';
  fs.mkdirSync(path.dirname(request.filePath), { recursive: true });
  fs.writeFileSync(request.filePath, beforeScene);
  fs.writeFileSync(request.projectAuthorityPath, beforeManifest);
  const receipt = await executeAtomicSceneManifestGatewayCutover({
    request,
    ...observers(),
    executeGateway: async () => commitProjectTransaction({
      scenePath: request.filePath,
      sceneContent: request.content,
      expectedSceneContent: beforeScene,
      manifestPath: request.projectAuthorityPath,
      manifestContent: afterManifest,
      expectedManifestContent: beforeManifest,
      revision: request.revision,
      publishManifest: async ({ expectedText, nextText, revision }) => {
        assert.equal(fs.readFileSync(request.projectAuthorityPath, 'utf8'), expectedText);
        await durableSaveTransaction({
          filePath: request.projectAuthorityPath,
          content: nextText,
          revision,
        });
      },
    }),
  });
  assert.equal(fs.readFileSync(request.filePath, 'utf8'), request.content);
  assert.equal(fs.readFileSync(request.projectAuthorityPath, 'utf8'), afterManifest);
  assert.equal(receipt.sceneDigest, sha256(request.content));
  assert.equal(receipt.manifestDigest, sha256(afterManifest));
  assert.deepEqual(receipt.phases, [...ATOMIC_SCENE_MANIFEST_PHASE_CHAIN]);
  assert.equal(receipt.atomicSceneManifestGateway.gatewayExecutorCount, 1);
});

test('C5C1 production Writer path reaches the dedicated cutover and retains the unbound gateway', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, 'src', 'main.js'), 'utf8');
  assert.equal(source.split('async function commitWriterProjectSnapshot(').length - 1, 1);
  assert.equal(source.split('executeAtomicSceneManifestGatewayCutover({').length - 1, 1);
  assert.equal(source.split('executeWriterSaveThroughStranglerGateway({').length - 1, 1);
  assert.match(source, /if \(!projectBound\)[\s\S]*executeWriterSaveThroughStranglerGateway/u);
  assert.match(source, /executeAtomicSceneManifestGatewayCutover\([\s\S]*executeGateway:[\s\S]*commitProjectTransaction/u);
});

const MUTANTS = [
  ['project-binding-guard-removed', "if (identity.projectBound !== true || identity.projectAuthorityPath.length === 0) {", 'if (false) {'],
  ['project-route-guard-removed', "if (gateway.route !== SAVE_AUTHORITY_ROUTES.PROJECT_TRANSACTION_V1) {", 'if (false) {'],
  ['gateway-executed-twice', 'const result = validateAtomicSceneManifestReceipt(\n    await executeGateway(Object.freeze({ ...request, authorityIdentity: identity })),', 'await executeGateway(Object.freeze({ ...request, authorityIdentity: identity }));\n  const result = validateAtomicSceneManifestReceipt(\n    await executeGateway(Object.freeze({ ...request, authorityIdentity: identity })),'],
  ['legacy-role-forged', "legacyAuthorityRole: 'READ_ONLY_OBSERVER',", "legacyAuthorityRole: 'WRITE_FALLBACK',"],
  ['legacy-fallback-enabled', 'legacyWriteFallbackAllowed: false,', 'legacyWriteFallbackAllowed: true,'],
  ['dual-write-enabled', 'dualWriteAllowed: false,', 'dualWriteAllowed: true,'],
  ['execution-count-forged', 'gatewayExecutorCount: 1,', 'gatewayExecutorCount: 2,'],
  ['phase-validation-removed', '|| result.phases.length !== ATOMIC_SCENE_MANIFEST_PHASE_CHAIN.length', '|| false'],
];

async function c5c1MutantOracle(module) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-c5c1-mutant-oracle-'));
  const request = projectRequest(root);
  let executions = 0;
  const localObservers = {
    observeLegacy: async (identity) => module.createAuthorityObservation({
      observerId: module.OBSERVER_IDS.LEGACY,
      requestDigest: identity.identityDigest,
      route: module.SAVE_AUTHORITY_ROUTES.PROJECT_TRANSACTION_V1,
    }),
    observeGateway: async (identity) => module.createAuthorityObservation({
      observerId: module.OBSERVER_IDS.GATEWAY,
      requestDigest: identity.identityDigest,
      route: module.SAVE_AUTHORITY_ROUTES.PROJECT_TRANSACTION_V1,
    }),
  };
  const receipt = await module.executeAtomicSceneManifestGatewayCutover({
    request,
    ...localObservers,
    executeGateway: async () => {
      executions += 1;
      return validReceipt(request);
    },
  });
  assert.equal(executions, 1);
  assert.equal(receipt.atomicSceneManifestGateway.legacyAuthorityRole, 'READ_ONLY_OBSERVER');
  assert.equal(receipt.atomicSceneManifestGateway.legacyWriteFallbackAllowed, false);
  assert.equal(receipt.atomicSceneManifestGateway.dualWriteAllowed, false);
  assert.equal(receipt.atomicSceneManifestGateway.gatewayExecutorCount, 1);
  await assert.rejects(module.executeAtomicSceneManifestGatewayCutover({
    request: { ...request, projectBound: false, projectAuthorityPath: null },
    ...localObservers,
    executeGateway: async () => validReceipt(request),
  }));
  await assert.rejects(module.executeAtomicSceneManifestGatewayCutover({
    request,
    observeLegacy: async (identity) => module.createAuthorityObservation({ observerId: module.OBSERVER_IDS.LEGACY, requestDigest: identity.identityDigest, route: module.SAVE_AUTHORITY_ROUTES.DURABLE_SAVE_V1 }),
    observeGateway: async (identity) => module.createAuthorityObservation({ observerId: module.OBSERVER_IDS.GATEWAY, requestDigest: identity.identityDigest, route: module.SAVE_AUTHORITY_ROUTES.DURABLE_SAVE_V1 }),
    executeGateway: async () => validReceipt(request),
  }));
  await assert.rejects(module.executeAtomicSceneManifestGatewayCutover({
    request,
    ...localObservers,
    executeGateway: async () => ({ ...validReceipt(request), phases: [] }),
  }));
}

test('C5C1 named implementation mutants have zero survivors', async () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const results = [];
  for (const [id, find, replacement] of MUTANTS) {
    assert.equal(source.split(find).length - 1, 1, `unique anchor: ${id}`);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-c5c1-mutant-'));
    const target = path.join(root, 'legacy-strangler-v1.cjs');
    fs.writeFileSync(target, source.replace(find, replacement));
    let killed = false;
    try {
      await c5c1MutantOracle(require(target));
    } catch {
      killed = true;
    }
    results.push({ id, killed });
    fs.rmSync(root, { recursive: true, force: true });
  }
  const survived = results.filter((result) => !result.killed).map((result) => result.id);
  console.log(`R24_C5C1_MUTATION_RECEIPT=${JSON.stringify({ total: results.length, killed: results.length - survived.length, survived })}`);
  assert.equal(results.length, 8);
  assert.deepEqual(survived, []);
});
