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
  ATOMIC_IMPORT_LIBRARY_TARGET_ROLES,
  LegacyStranglerError,
  SAVE_AUTHORITY_ROUTES,
  executeAtomicImportLibraryGatewayCutover,
} = core;

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function requestFor(targetRole = ATOMIC_IMPORT_LIBRARY_TARGET_ROLES.PROJECT_ARCHIVE_IMPORT_BATCH) {
  const isImport = targetRole === ATOMIC_IMPORT_LIBRARY_TARGET_ROLES.PROJECT_ARCHIVE_IMPORT_BATCH;
  return {
    targetRole,
    projectId: isImport ? 'project-import-alpha' : null,
    payloadDigest: sha256(isImport ? 'archive-payload' : 'library-index-payload'),
    entryCount: isImport ? 3 : 1,
  };
}

function observers(module = core, route = SAVE_AUTHORITY_ROUTES.ATOMIC_IMPORT_LIBRARY_V1, calls = []) {
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
    projectId: identity.projectId,
    payloadDigest: identity.payloadDigest,
    entryCount: identity.entryCount,
    ...extra,
  };
}

test('C5C3 import and library roles expose one executor while legacy remains read-only', async () => {
  for (const targetRole of Object.values(ATOMIC_IMPORT_LIBRARY_TARGET_ROLES)) {
    const request = requestFor(targetRole);
    const calls = [];
    let executions = 0;
    const receipt = await executeAtomicImportLibraryGatewayCutover({
      request,
      ...observers(core, SAVE_AUTHORITY_ROUTES.ATOMIC_IMPORT_LIBRARY_V1, calls),
      executeGateway: async ({ authorityIdentity }) => {
        executions += 1;
        return validReceipt(authorityIdentity);
      },
      legacyExecutor: async () => assert.fail('legacy write is not an API'),
    });
    assert.deepEqual(calls, ['legacy-read-only', 'gateway']);
    assert.equal(executions, 1);
    assert.deepEqual(receipt.atomicImportLibraryGateway, {
      schemaVersion: 'yalken.atomic-import-library-gateway.v1',
      requestDigest: receipt.atomicImportLibraryGateway.requestDigest,
      targetRole,
      payloadDigest: request.payloadDigest,
      entryCount: request.entryCount,
      selectedRoute: 'ATOMIC_IMPORT_LIBRARY_V1',
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

test('C5C3 rejects role, project, digest, count and route mismatches before mutation', async (t) => {
  let executions = 0;
  const executeGateway = async ({ authorityIdentity }) => {
    executions += 1;
    return validReceipt(authorityIdentity);
  };
  const cases = [
    ['unknown role', { ...requestFor(), targetRole: 'RECEIPT_BACKUP' }, 'E_ATOMIC_IMPORT_LIBRARY_TARGET_ROLE_INVALID'],
    ['import project missing', { ...requestFor(), projectId: null }, 'E_ATOMIC_IMPORT_LIBRARY_PROJECT_ID_INVALID'],
    ['library project forbidden', { ...requestFor(ATOMIC_IMPORT_LIBRARY_TARGET_ROLES.PROJECT_LIBRARY_INDEX_PRIMARY), projectId: 'forged' }, 'E_ATOMIC_IMPORT_LIBRARY_PROJECT_ID_FORBIDDEN'],
    ['payload digest malformed', { ...requestFor(), payloadDigest: 'sha256:not-canonical' }, 'E_ATOMIC_IMPORT_LIBRARY_PAYLOAD_DIGEST_INVALID'],
    ['entry count zero', { ...requestFor(), entryCount: 0 }, 'E_ATOMIC_IMPORT_LIBRARY_ENTRY_COUNT_INVALID'],
  ];
  for (const [name, request, code] of cases) {
    await t.test(name, async () => {
      await assert.rejects(executeAtomicImportLibraryGatewayCutover({
        request,
        ...observers(),
        executeGateway,
      }), (error) => error instanceof LegacyStranglerError && error.code === code);
    });
  }
  await t.test('dedicated route required', async () => {
    await assert.rejects(executeAtomicImportLibraryGatewayCutover({
      request: requestFor(),
      ...observers(core, SAVE_AUTHORITY_ROUTES.DURABLE_SAVE_V1),
      executeGateway,
    }), (error) => error.code === 'E_ATOMIC_IMPORT_LIBRARY_ROUTE_REQUIRED');
  });
  assert.equal(executions, 0);
});

test('C5C3 gateway failure never invokes a legacy fallback or mutates the target', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-c5c3-fault-'));
  const target = path.join(root, 'library-index.json');
  fs.writeFileSync(target, 'before');
  let executions = 0;
  const fault = Object.assign(new Error('injected C5C3 primary failure'), { code: 'E_C5C3_INJECTED' });
  await assert.rejects(executeAtomicImportLibraryGatewayCutover({
    request: requestFor(ATOMIC_IMPORT_LIBRARY_TARGET_ROLES.PROJECT_LIBRARY_INDEX_PRIMARY),
    ...observers(),
    executeGateway: async () => {
      executions += 1;
      throw fault;
    },
  }), (error) => error === fault);
  assert.equal(executions, 1);
  assert.equal(fs.readFileSync(target, 'utf8'), 'before');
  fs.rmSync(root, { recursive: true, force: true });
});

test('C5C3 rejects forged, partial and failed executor receipts', async (t) => {
  const request = requestFor();
  const forged = [
    null,
    { success: false },
    { ...validReceipt(request), success: true, payloadDigest: sha256('wrong') },
    { ...validReceipt(request), success: true, projectId: 'wrong-project' },
    { ...validReceipt(request), success: true, entryCount: request.entryCount + 1 },
    { ...validReceipt(request), success: true, targetRole: ATOMIC_IMPORT_LIBRARY_TARGET_ROLES.PROJECT_LIBRARY_INDEX_PRIMARY },
  ];
  for (const [index, result] of forged.entries()) {
    await t.test(`forged-${index}`, async () => {
      await assert.rejects(executeAtomicImportLibraryGatewayCutover({
        request,
        ...observers(),
        executeGateway: async () => result,
      }), (error) => error.code === 'E_ATOMIC_IMPORT_LIBRARY_GATEWAY_RECEIPT_INVALID');
    });
  }
});

test('C5C3 physical gateway executes one pathless import batch', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-c5c3-physical-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const request = requestFor();
  let executions = 0;
  const receipt = await executeAtomicImportLibraryGatewayCutover({
    request,
    ...observers(),
    executeGateway: async ({ authorityIdentity }) => {
      executions += 1;
      fs.writeFileSync(path.join(root, 'scene-1.md'), 'one');
      fs.writeFileSync(path.join(root, 'scene-2.md'), 'two');
      return validReceipt(authorityIdentity);
    },
  });
  assert.equal(executions, 1);
  assert.deepEqual(fs.readdirSync(root).sort(), ['scene-1.md', 'scene-2.md']);
  assert.equal(JSON.stringify(receipt).includes(root), false);
  assert.equal(receipt.atomicImportLibraryGateway.payloadDigest, request.payloadDigest);
});

test('C5C3 production import and library entrypoints reach only the dedicated gateway', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, 'src', 'main.js'), 'utf8');
  assert.equal(source.split('async function executeImportOrLibraryThroughAtomicGateway({').length - 1, 1);
  assert.equal(source.split('executeAtomicImportLibraryGatewayCutover({').length - 1, 1);
  assert.equal(source.split('executeImportOrLibraryThroughAtomicGateway({').length - 1, 3);
  assert.match(source, /async function writeProjectLibraryPrivateIndex[\s\S]*ATOMIC_IMPORT_LIBRARY_TARGET_ROLES\.PROJECT_LIBRARY_INDEX_PRIMARY/u);
  assert.match(source, /async function handleImportProjectArchive[\s\S]*ATOMIC_IMPORT_LIBRARY_TARGET_ROLES\.PROJECT_ARCHIVE_IMPORT_BATCH/u);
  assert.equal(source.includes('() => fileManager.writeFileAtomic(getProjectLibraryIndexPath()'), false);
  assert.equal(/queueDiskOperation\(\s*\(\) => writeProjectArchivePayloadToTempRoot/u.test(source), false);
  assert.equal(source.includes("src/product/blackBoxImportAsNewProjectWriterV1.mjs"), false);
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
  ['target-role-guard-removed', (source) => mutateSection(source,
    'function createAtomicImportLibraryAuthorityIdentity({',
    'function validateObservation(',
    'if (!Object.values(ATOMIC_IMPORT_LIBRARY_TARGET_ROLES).includes(targetRole)) {',
    'if (false) {')],
  ['import-project-guard-removed', (source) => mutateSection(source,
    'function createAtomicImportLibraryAuthorityIdentity({',
    'function validateObservation(',
    'if (targetRole === ATOMIC_IMPORT_LIBRARY_TARGET_ROLES.PROJECT_ARCHIVE_IMPORT_BATCH) {',
    'if (false) {')],
  ['library-project-guard-removed', (source) => mutateSection(source,
    'function createAtomicImportLibraryAuthorityIdentity({',
    'function validateObservation(',
    '} else if (projectId !== null) {',
    '} else if (false) {')],
  ['payload-digest-guard-removed', (source) => mutateSection(source,
    'function createAtomicImportLibraryAuthorityIdentity({',
    'function validateObservation(',
    "if (typeof payloadDigest !== 'string' || !/^[a-f0-9]{64}$/u.test(payloadDigest)) {",
    'if (false) {')],
  ['entry-count-guard-removed', (source) => mutateSection(source,
    'function createAtomicImportLibraryAuthorityIdentity({',
    'function validateObservation(',
    'if (!Number.isSafeInteger(entryCount) || entryCount < 1) {',
    'if (false) {')],
  ['receipt-payload-binding-removed', (source) => mutateSection(source,
    'function validateAtomicImportLibraryReceipt(',
    '// C5C1:',
    '|| result.payloadDigest !== identity.payloadDigest',
    '|| false')],
  ['dedicated-route-guard-removed', (source) => mutateSection(source,
    'async function executeAtomicImportLibraryGatewayCutover({',
    'module.exports = Object.freeze({',
    'if (gateway.route !== SAVE_AUTHORITY_ROUTES.ATOMIC_IMPORT_LIBRARY_V1) {',
    'if (false) {')],
  ['gateway-executed-twice', (source) => mutateSection(source,
    'async function executeAtomicImportLibraryGatewayCutover({',
    'module.exports = Object.freeze({',
    'const result = validateAtomicImportLibraryReceipt(\n    await executeGateway(Object.freeze({ ...request, authorityIdentity: identity })),',
    'await executeGateway(Object.freeze({ ...request, authorityIdentity: identity }));\n  const result = validateAtomicImportLibraryReceipt(\n    await executeGateway(Object.freeze({ ...request, authorityIdentity: identity })),')],
  ['legacy-role-forged', (source) => mutateSection(source,
    'async function executeAtomicImportLibraryGatewayCutover({',
    'module.exports = Object.freeze({',
    "legacyAuthorityRole: 'READ_ONLY_OBSERVER',",
    "legacyAuthorityRole: 'WRITE_FALLBACK',")],
  ['legacy-fallback-enabled', (source) => mutateSection(source,
    'async function executeAtomicImportLibraryGatewayCutover({',
    'module.exports = Object.freeze({',
    'legacyWriteFallbackAllowed: false,',
    'legacyWriteFallbackAllowed: true,')],
  ['dual-write-enabled', (source) => mutateSection(source,
    'async function executeAtomicImportLibraryGatewayCutover({',
    'module.exports = Object.freeze({',
    'dualWriteAllowed: false,',
    'dualWriteAllowed: true,')],
  ['execution-count-forged', (source) => mutateSection(source,
    'async function executeAtomicImportLibraryGatewayCutover({',
    'module.exports = Object.freeze({',
    'gatewayExecutorCount: 1,',
    'gatewayExecutorCount: 2,')],
];

async function c5c3MutantOracle(module) {
  const request = requestFor();
  let executions = 0;
  const receipt = await module.executeAtomicImportLibraryGatewayCutover({
    request,
    ...observers(module, module.SAVE_AUTHORITY_ROUTES.ATOMIC_IMPORT_LIBRARY_V1),
    executeGateway: async ({ authorityIdentity }) => {
      executions += 1;
      return validReceipt(authorityIdentity);
    },
  });
  assert.equal(executions, 1);
  assert.equal(receipt.atomicImportLibraryGateway.legacyAuthorityRole, 'READ_ONLY_OBSERVER');
  assert.equal(receipt.atomicImportLibraryGateway.legacyWriteFallbackAllowed, false);
  assert.equal(receipt.atomicImportLibraryGateway.dualWriteAllowed, false);
  assert.equal(receipt.atomicImportLibraryGateway.gatewayExecutorCount, 1);
  const rejected = [
    { ...request, targetRole: 'RECEIPT_BACKUP', projectId: null },
    { ...request, projectId: null },
    { ...requestFor(module.ATOMIC_IMPORT_LIBRARY_TARGET_ROLES.PROJECT_LIBRARY_INDEX_PRIMARY), projectId: 'forged' },
    { ...request, payloadDigest: 'bad' },
    { ...request, entryCount: 0 },
  ];
  for (const invalid of rejected) {
    await assert.rejects(module.executeAtomicImportLibraryGatewayCutover({
      request: invalid,
      ...observers(module, module.SAVE_AUTHORITY_ROUTES.ATOMIC_IMPORT_LIBRARY_V1),
      executeGateway: async ({ authorityIdentity }) => validReceipt(authorityIdentity),
    }));
  }
  await assert.rejects(module.executeAtomicImportLibraryGatewayCutover({
    request,
    ...observers(module, module.SAVE_AUTHORITY_ROUTES.DURABLE_SAVE_V1),
    executeGateway: async ({ authorityIdentity }) => validReceipt(authorityIdentity),
  }));
  await assert.rejects(module.executeAtomicImportLibraryGatewayCutover({
    request,
    ...observers(module, module.SAVE_AUTHORITY_ROUTES.ATOMIC_IMPORT_LIBRARY_V1),
    executeGateway: async ({ authorityIdentity }) => ({
      ...validReceipt(authorityIdentity),
      payloadDigest: sha256('forged'),
    }),
  }));
}

test('C5C3 named implementation mutants have zero survivors', async () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const results = [];
  for (const [id, transform] of MUTANTS) {
    const mutated = transform(source);
    assert.notEqual(mutated, source, id);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-c5c3-mutant-'));
    const target = path.join(root, 'legacy-strangler-v1.cjs');
    fs.writeFileSync(target, mutated);
    let killed = false;
    try {
      await c5c3MutantOracle(require(target));
    } catch {
      killed = true;
    }
    results.push({ id, killed });
    fs.rmSync(root, { recursive: true, force: true });
  }
  const survived = results.filter((result) => !result.killed).map((result) => result.id);
  console.log(`R24_C5C3_MUTATION_RECEIPT=${JSON.stringify({ total: results.length, killed: results.length - survived.length, survived })}`);
  assert.equal(results.length, 12);
  assert.deepEqual(survived, []);
});
