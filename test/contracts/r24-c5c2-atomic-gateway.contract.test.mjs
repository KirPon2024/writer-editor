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
const core = require(MODULE_PATH);
const {
  ATOMIC_SINGLE_FILE_TARGET_ROLES,
  LegacyStranglerError,
  OBSERVER_IDS,
  SAVE_AUTHORITY_ROUTES,
  createAuthorityObservation,
  executeAtomicSingleFileGatewayCutover,
} = core;

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function singleFileRequest(root, targetRole = ATOMIC_SINGLE_FILE_TARGET_ROLES.NOTES_PRIMARY) {
  const notes = targetRole === ATOMIC_SINGLE_FILE_TARGET_ROLES.NOTES_PRIMARY;
  return {
    filePath: path.join(root, notes ? 'notes.craftsman.json' : 'settings.json'),
    content: notes ? '{"notes":["Привет 👩🏽‍💻"]}\n' : '{"fontSize":17}',
    targetRole,
    projectId: notes ? 'project-alpha' : null,
  };
}

function observers(module = core, route = SAVE_AUTHORITY_ROUTES.ATOMIC_FILE_V1, calls = []) {
  return {
    observeLegacy: async (identity) => {
      calls.push('legacy-read-only');
      return module.createAuthorityObservation({
        observerId: module.OBSERVER_IDS.LEGACY,
        requestDigest: identity.identityDigest,
        route,
      });
    },
    observeGateway: async (identity) => {
      calls.push('gateway');
      return module.createAuthorityObservation({
        observerId: module.OBSERVER_IDS.GATEWAY,
        requestDigest: identity.identityDigest,
        route,
      });
    },
  };
}

function validReceipt(identity, extra = {}) {
  return {
    success: true,
    targetRole: identity.targetRole,
    contentDigest: identity.contentDigest,
    ...extra,
  };
}

test('C5C2 notes and settings share one typed executor while legacy remains read-only', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-c5c2-api-'));
  for (const targetRole of Object.values(ATOMIC_SINGLE_FILE_TARGET_ROLES)) {
    const request = singleFileRequest(root, targetRole);
    const calls = [];
    let executions = 0;
    const receipt = await executeAtomicSingleFileGatewayCutover({
      request,
      ...observers(core, SAVE_AUTHORITY_ROUTES.ATOMIC_FILE_V1, calls),
      executeGateway: async ({ authorityIdentity }) => {
        executions += 1;
        return validReceipt(authorityIdentity);
      },
      legacyExecutor: async () => assert.fail('legacy write is not an API'),
    });
    assert.deepEqual(calls, ['legacy-read-only', 'gateway']);
    assert.equal(executions, 1);
    assert.deepEqual(receipt.atomicSingleFileGateway, {
      schemaVersion: 'yalken.atomic-single-file-gateway.v1',
      requestDigest: receipt.atomicSingleFileGateway.requestDigest,
      targetRole,
      contentDigest: sha256(request.content),
      selectedRoute: 'ATOMIC_FILE_V1',
      observerCount: 2,
      legacyObserverId: 'LEGACY_ROUTER_V1',
      gatewayObserverId: 'AUTHORITY_GATEWAY_V1',
      legacyAuthorityRole: 'READ_ONLY_OBSERVER',
      legacyFallbackMode: 'READ_ONLY_OBSERVATION_ONLY',
      legacyWriteFallbackAllowed: false,
      dualObserved: true,
      dualWriteAllowed: false,
      gatewayExecutorCount: 1,
    });
  }
});

test('C5C2 rejects target, project and route mismatches before mutation', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-c5c2-negative-'));
  let executions = 0;
  const executeGateway = async ({ authorityIdentity }) => {
    executions += 1;
    return validReceipt(authorityIdentity);
  };
  await t.test('unknown target role', async () => {
    await assert.rejects(executeAtomicSingleFileGatewayCutover({
      request: { ...singleFileRequest(root), targetRole: 'IMPORT_PRIMARY', projectId: null },
      ...observers(),
      executeGateway,
    }), (error) => error instanceof LegacyStranglerError
      && error.code === 'E_ATOMIC_SINGLE_FILE_TARGET_ROLE_INVALID');
  });
  await t.test('notes require a project id', async () => {
    await assert.rejects(executeAtomicSingleFileGatewayCutover({
      request: { ...singleFileRequest(root), projectId: null },
      ...observers(),
      executeGateway,
    }), (error) => error.code === 'E_ATOMIC_SINGLE_FILE_PROJECT_ID_INVALID');
  });
  await t.test('settings forbid a project id', async () => {
    await assert.rejects(executeAtomicSingleFileGatewayCutover({
      request: { ...singleFileRequest(root, ATOMIC_SINGLE_FILE_TARGET_ROLES.SETTINGS_PRIMARY), projectId: 'forged' },
      ...observers(),
      executeGateway,
    }), (error) => error.code === 'E_ATOMIC_SINGLE_FILE_PROJECT_ID_FORBIDDEN');
  });
  await t.test('atomic-file route is mandatory', async () => {
    await assert.rejects(executeAtomicSingleFileGatewayCutover({
      request: singleFileRequest(root),
      ...observers(core, SAVE_AUTHORITY_ROUTES.DURABLE_SAVE_V1),
      executeGateway,
    }), (error) => error.code === 'E_ATOMIC_SINGLE_FILE_ROUTE_REQUIRED');
  });
  assert.equal(executions, 0);
});

test('C5C2 gateway failure never calls a legacy write fallback or mutates the target', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-c5c2-fault-'));
  const request = singleFileRequest(root);
  fs.writeFileSync(request.filePath, 'before');
  let gatewayExecutions = 0;
  const fault = Object.assign(new Error('injected primary write failure'), { code: 'E_C5C2_INJECTED' });
  await assert.rejects(executeAtomicSingleFileGatewayCutover({
    request,
    ...observers(),
    executeGateway: async () => {
      gatewayExecutions += 1;
      throw fault;
    },
  }), (error) => error === fault);
  assert.equal(gatewayExecutions, 1);
  assert.equal(fs.readFileSync(request.filePath, 'utf8'), 'before');
});

test('C5C2 rejects forged, partial and failed executor receipts', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-c5c2-receipt-'));
  const request = singleFileRequest(root);
  const forged = [
    null,
    { success: false },
    { success: true, targetRole: request.targetRole, contentDigest: sha256('wrong') },
    { success: true, targetRole: ATOMIC_SINGLE_FILE_TARGET_ROLES.SETTINGS_PRIMARY, contentDigest: sha256(request.content) },
  ];
  for (const [index, result] of forged.entries()) {
    await t.test(`forged-${index}`, async () => {
      await assert.rejects(executeAtomicSingleFileGatewayCutover({
        request,
        ...observers(),
        executeGateway: async () => result,
      }), (error) => error.code === 'E_ATOMIC_SINGLE_FILE_GATEWAY_RECEIPT_INVALID');
    });
  }
});

test('C5C2 physical gateway writes exactly one file and returns pathless capability evidence', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-c5c2-physical-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const request = singleFileRequest(root, ATOMIC_SINGLE_FILE_TARGET_ROLES.SETTINGS_PRIMARY);
  let executions = 0;
  const receipt = await executeAtomicSingleFileGatewayCutover({
    request,
    ...observers(),
    executeGateway: async ({ authorityIdentity }) => {
      executions += 1;
      fs.writeFileSync(request.filePath, request.content);
      return validReceipt(authorityIdentity);
    },
  });
  assert.equal(executions, 1);
  assert.equal(fs.readFileSync(request.filePath, 'utf8'), request.content);
  assert.equal(JSON.stringify(receipt).includes(root), false);
  assert.equal(receipt.atomicSingleFileGateway.contentDigest, sha256(request.content));
});

test('C5C2 production notes and settings entrypoints reach only the dedicated gateway', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, 'src', 'main.js'), 'utf8');
  assert.equal(source.split('async function writeNotesOrSettingsThroughAtomicGateway({').length - 1, 1);
  assert.equal(source.split('executeAtomicSingleFileGatewayCutover({').length - 1, 1);
  assert.equal(source.split('writeNotesOrSettingsThroughAtomicGateway({').length - 1, 4);
  assert.equal(source.split('fileManager.writeFileAtomic(filePath, content)').length - 1, 1);
  assert.equal(source.includes('fileManager.writeFileAtomic(notesPath'), false);
  assert.equal(source.includes('fileManager.writeFileAtomic(getSettingsPath()'), false);
  assert.match(source, /migrateProjectNotesStorage[\s\S]*ATOMIC_SINGLE_FILE_TARGET_ROLES\.NOTES_PRIMARY/u);
  assert.match(source, /writeProjectNotesDocument[\s\S]*ATOMIC_SINGLE_FILE_TARGET_ROLES\.NOTES_PRIMARY/u);
  assert.match(source, /async function saveSettings[\s\S]*ATOMIC_SINGLE_FILE_TARGET_ROLES\.SETTINGS_PRIMARY/u);
});

function mutateSection(source, startToken, endToken, find, replacement) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.notEqual(start, -1, startToken);
  assert.notEqual(end, -1, endToken);
  const section = source.slice(start, end);
  assert.equal(section.split(find).length - 1, 1, find);
  return `${source.slice(0, start)}${section.replace(find, replacement)}${source.slice(end)}`;
}

const MUTANTS = [
  ['target-role-guard-removed', (source) => source.replace(
    'if (!Object.values(ATOMIC_SINGLE_FILE_TARGET_ROLES).includes(targetRole)) {',
    'if (false) {',
  )],
  ['notes-project-guard-removed', (source) => source.replace(
    'if (targetRole === ATOMIC_SINGLE_FILE_TARGET_ROLES.NOTES_PRIMARY) {',
    'if (false) {',
  )],
  ['settings-project-guard-removed', (source) => source.replace(
    '} else if (projectId !== null) {',
    '} else if (false) {',
  )],
  ['receipt-content-binding-removed', (source) => source.replace(
    '|| result.contentDigest !== identity.contentDigest) {',
    '|| false) {',
  )],
  ['atomic-route-guard-removed', (source) => mutateSection(
    source,
    'async function executeAtomicSingleFileGatewayCutover({',
    'async function executeWriterSaveThroughStranglerGateway({',
    'if (gateway.route !== SAVE_AUTHORITY_ROUTES.ATOMIC_FILE_V1) {',
    'if (false) {',
  )],
  ['gateway-executed-twice', (source) => mutateSection(
    source,
    'async function executeAtomicSingleFileGatewayCutover({',
    'async function executeWriterSaveThroughStranglerGateway({',
    'const result = validateAtomicSingleFileReceipt(\n    await executeGateway(Object.freeze({ ...request, authorityIdentity: identity })),',
    'await executeGateway(Object.freeze({ ...request, authorityIdentity: identity }));\n  const result = validateAtomicSingleFileReceipt(\n    await executeGateway(Object.freeze({ ...request, authorityIdentity: identity })),',
  )],
  ['legacy-role-forged', (source) => mutateSection(
    source,
    'async function executeAtomicSingleFileGatewayCutover({',
    'async function executeWriterSaveThroughStranglerGateway({',
    "legacyAuthorityRole: 'READ_ONLY_OBSERVER',",
    "legacyAuthorityRole: 'WRITE_FALLBACK',",
  )],
  ['legacy-fallback-enabled', (source) => mutateSection(
    source,
    'async function executeAtomicSingleFileGatewayCutover({',
    'async function executeWriterSaveThroughStranglerGateway({',
    'legacyWriteFallbackAllowed: false,',
    'legacyWriteFallbackAllowed: true,',
  )],
  ['dual-write-enabled', (source) => mutateSection(
    source,
    'async function executeAtomicSingleFileGatewayCutover({',
    'async function executeWriterSaveThroughStranglerGateway({',
    'dualWriteAllowed: false,',
    'dualWriteAllowed: true,',
  )],
  ['execution-count-forged', (source) => mutateSection(
    source,
    'async function executeAtomicSingleFileGatewayCutover({',
    'async function executeWriterSaveThroughStranglerGateway({',
    'gatewayExecutorCount: 1,',
    'gatewayExecutorCount: 2,',
  )],
];

async function c5c2MutantOracle(module) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-c5c2-mutant-oracle-'));
  const request = singleFileRequest(root);
  let executions = 0;
  const receipt = await module.executeAtomicSingleFileGatewayCutover({
    request,
    ...observers(module, module.SAVE_AUTHORITY_ROUTES.ATOMIC_FILE_V1),
    executeGateway: async ({ authorityIdentity }) => {
      executions += 1;
      return validReceipt(authorityIdentity);
    },
  });
  assert.equal(executions, 1);
  assert.equal(receipt.atomicSingleFileGateway.legacyAuthorityRole, 'READ_ONLY_OBSERVER');
  assert.equal(receipt.atomicSingleFileGateway.legacyWriteFallbackAllowed, false);
  assert.equal(receipt.atomicSingleFileGateway.dualWriteAllowed, false);
  assert.equal(receipt.atomicSingleFileGateway.gatewayExecutorCount, 1);
  await assert.rejects(module.executeAtomicSingleFileGatewayCutover({
    request: { ...request, targetRole: 'IMPORT_PRIMARY', projectId: null },
    ...observers(module, module.SAVE_AUTHORITY_ROUTES.ATOMIC_FILE_V1),
    executeGateway: async ({ authorityIdentity }) => validReceipt(authorityIdentity),
  }));
  await assert.rejects(module.executeAtomicSingleFileGatewayCutover({
    request: { ...request, projectId: null },
    ...observers(module, module.SAVE_AUTHORITY_ROUTES.ATOMIC_FILE_V1),
    executeGateway: async ({ authorityIdentity }) => validReceipt(authorityIdentity),
  }));
  const settings = singleFileRequest(root, ATOMIC_SINGLE_FILE_TARGET_ROLES.SETTINGS_PRIMARY);
  await assert.rejects(module.executeAtomicSingleFileGatewayCutover({
    request: { ...settings, projectId: 'forged' },
    ...observers(module, module.SAVE_AUTHORITY_ROUTES.ATOMIC_FILE_V1),
    executeGateway: async ({ authorityIdentity }) => validReceipt(authorityIdentity),
  }));
  await assert.rejects(module.executeAtomicSingleFileGatewayCutover({
    request,
    ...observers(module, module.SAVE_AUTHORITY_ROUTES.DURABLE_SAVE_V1),
    executeGateway: async ({ authorityIdentity }) => validReceipt(authorityIdentity),
  }));
  await assert.rejects(module.executeAtomicSingleFileGatewayCutover({
    request,
    ...observers(module, module.SAVE_AUTHORITY_ROUTES.ATOMIC_FILE_V1),
    executeGateway: async ({ authorityIdentity }) => ({
      ...validReceipt(authorityIdentity),
      contentDigest: sha256('forged'),
    }),
  }));
}

test('C5C2 named implementation mutants have zero survivors', async () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const results = [];
  for (const [id, transform] of MUTANTS) {
    const mutated = transform(source);
    assert.notEqual(mutated, source, id);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-c5c2-mutant-'));
    const target = path.join(root, 'legacy-strangler-v1.cjs');
    fs.writeFileSync(target, mutated);
    let killed = false;
    try {
      await c5c2MutantOracle(require(target));
    } catch {
      killed = true;
    }
    results.push({ id, killed });
    fs.rmSync(root, { recursive: true, force: true });
  }
  const survived = results.filter((result) => !result.killed).map((result) => result.id);
  console.log(`R24_C5C2_MUTATION_RECEIPT=${JSON.stringify({ total: results.length, killed: results.length - survived.length, survived })}`);
  assert.equal(results.length, 10);
  assert.deepEqual(survived, []);
});
