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
  ATOMIC_RECEIPT_BACKUP_TARGET_ROLES,
  LegacyStranglerError,
  SAVE_AUTHORITY_ROUTES,
  executeAtomicReceiptBackupGatewayCutover,
} = core;

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function requestFor(targetRole = ATOMIC_RECEIPT_BACKUP_TARGET_ROLES.NOTES_RECOVERY_SNAPSHOT) {
  const content = targetRole === ATOMIC_RECEIPT_BACKUP_TARGET_ROLES.GENERIC_BACKUP_CONTENT
    ? Buffer.from([0, 1, 2, 255])
    : `${targetRole.toLowerCase()}\n`;
  return {
    targetRole,
    subjectDigest: sha256(`subject:${targetRole}`),
    content,
  };
}

function observers(module = core, route = SAVE_AUTHORITY_ROUTES.ATOMIC_RECEIPT_BACKUP_V1, calls = []) {
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
    subjectDigest: identity.subjectDigest,
    contentDigest: identity.contentDigest,
    byteCount: identity.byteCount,
    ...extra,
  };
}

test('C5C4 receipt and backup roles expose one executor with pathless authority evidence', async () => {
  for (const targetRole of Object.values(ATOMIC_RECEIPT_BACKUP_TARGET_ROLES)) {
    const request = requestFor(targetRole);
    const calls = [];
    let executions = 0;
    const receipt = await executeAtomicReceiptBackupGatewayCutover({
      request,
      ...observers(core, SAVE_AUTHORITY_ROUTES.ATOMIC_RECEIPT_BACKUP_V1, calls),
      executeGateway: async ({ authorityIdentity }) => {
        executions += 1;
        return validReceipt(authorityIdentity);
      },
      legacyExecutor: async () => assert.fail('legacy write is not an API'),
    });
    assert.deepEqual(calls, ['legacy-read-only', 'gateway']);
    assert.equal(executions, 1);
    assert.deepEqual(receipt.atomicReceiptBackupGateway, {
      schemaVersion: 'yalken.atomic-receipt-backup-gateway.v1',
      requestDigest: receipt.atomicReceiptBackupGateway.requestDigest,
      targetRole,
      subjectDigest: request.subjectDigest,
      contentDigest: sha256(request.content),
      byteCount: Buffer.byteLength(request.content),
      selectedRoute: 'ATOMIC_RECEIPT_BACKUP_V1',
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
    assert.equal(JSON.stringify(receipt).includes('targetPath'), false);
  }
});

test('C5C4 rejects role, subject, content and route defects before mutation', async (t) => {
  let executions = 0;
  const executeGateway = async ({ authorityIdentity }) => {
    executions += 1;
    return validReceipt(authorityIdentity);
  };
  const cases = [
    ['unknown role', { ...requestFor(), targetRole: 'PROJECT_PRIMARY' }, 'E_ATOMIC_RECEIPT_BACKUP_TARGET_ROLE_INVALID'],
    ['subject digest malformed', { ...requestFor(), subjectDigest: 'sha256:not-canonical' }, 'E_ATOMIC_RECEIPT_BACKUP_SUBJECT_DIGEST_INVALID'],
    ['content missing', { ...requestFor(), content: null }, 'E_ATOMIC_RECEIPT_BACKUP_CONTENT_REQUIRED'],
  ];
  for (const [name, request, code] of cases) {
    await t.test(name, async () => {
      await assert.rejects(executeAtomicReceiptBackupGatewayCutover({
        request,
        ...observers(),
        executeGateway,
      }), (error) => error instanceof LegacyStranglerError && error.code === code);
    });
  }
  await t.test('dedicated route required', async () => {
    await assert.rejects(executeAtomicReceiptBackupGatewayCutover({
      request: requestFor(),
      ...observers(core, SAVE_AUTHORITY_ROUTES.ATOMIC_FILE_V1),
      executeGateway,
    }), (error) => error.code === 'E_ATOMIC_RECEIPT_BACKUP_ROUTE_REQUIRED');
  });
  assert.equal(executions, 0);
});

test('C5C4 gateway failure preserves the prior target and has no legacy fallback', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-c5c4-fault-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const target = path.join(root, 'receipt.json');
  fs.writeFileSync(target, 'before');
  let executions = 0;
  const fault = Object.assign(new Error('injected C5C4 atomic failure'), { code: 'E_C5C4_INJECTED' });
  await assert.rejects(executeAtomicReceiptBackupGatewayCutover({
    request: requestFor(ATOMIC_RECEIPT_BACKUP_TARGET_ROLES.PROJECT_MANUAL_BACKUP_RECEIPT),
    ...observers(),
    executeGateway: async () => {
      executions += 1;
      throw fault;
    },
  }), (error) => error === fault);
  assert.equal(executions, 1);
  assert.equal(fs.readFileSync(target, 'utf8'), 'before');
});

test('C5C4 rejects forged, partial and failed executor receipts', async (t) => {
  const request = requestFor();
  const identity = core.createAtomicReceiptBackupAuthorityIdentity(request);
  const forged = [
    null,
    { success: false },
    { ...validReceipt(identity), targetRole: ATOMIC_RECEIPT_BACKUP_TARGET_ROLES.GENERIC_BACKUP_CONTENT },
    { ...validReceipt(identity), subjectDigest: sha256('wrong-subject') },
    { ...validReceipt(identity), contentDigest: sha256('wrong-content') },
    { ...validReceipt(identity), byteCount: identity.byteCount + 1 },
  ];
  for (const [index, result] of forged.entries()) {
    await t.test(`forged-${index}`, async () => {
      await assert.rejects(executeAtomicReceiptBackupGatewayCutover({
        request,
        ...observers(),
        executeGateway: async () => result,
      }), (error) => error.code === 'E_ATOMIC_RECEIPT_BACKUP_GATEWAY_RECEIPT_INVALID');
    });
  }
});

test('C5C4 physical gateway writes one binary backup pathlessly', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-c5c4-physical-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const target = path.join(root, 'backup.bin');
  const request = requestFor(ATOMIC_RECEIPT_BACKUP_TARGET_ROLES.GENERIC_BACKUP_CONTENT);
  let executions = 0;
  const receipt = await executeAtomicReceiptBackupGatewayCutover({
    request,
    ...observers(),
    executeGateway: async ({ authorityIdentity }) => {
      executions += 1;
      fs.writeFileSync(target, request.content);
      return validReceipt(authorityIdentity);
    },
  });
  assert.equal(executions, 1);
  assert.deepEqual(fs.readFileSync(target), request.content);
  assert.equal(JSON.stringify(receipt).includes(root), false);
  assert.equal(receipt.atomicReceiptBackupGateway.byteCount, request.content.length);
});

test('C5C4 production recovery and backup entrypoints reach the dedicated gateway', () => {
  const backupSource = fs.readFileSync(path.join(REPO_ROOT, 'src', 'utils', 'backupManager.js'), 'utf8');
  const notesSource = fs.readFileSync(path.join(REPO_ROOT, 'src', 'product', 'notesStoragePersistence.mjs'), 'utf8');
  const mainSource = fs.readFileSync(path.join(REPO_ROOT, 'src', 'main.js'), 'utf8');
  assert.equal(backupSource.split('async function writeReceiptOrBackupThroughAtomicGateway({').length - 1, 1);
  assert.equal(backupSource.split('executeAtomicReceiptBackupGatewayCutover({').length - 1, 1);
  assert.equal(backupSource.split('writeReceiptOrBackupThroughAtomicGateway({').length - 1, 3);
  assert.equal(backupSource.includes('fileManager.writeFileAtomic(backupPath, content)'), false);
  assert.equal(backupSource.includes('fileManager.writeFileAtomic(metaPath'), false);
  assert.equal(notesSource.includes('fs.writeFile(snapshotPath'), false);
  assert.equal(notesSource.split('writeRecoveryFileAtomic(snapshotPath, text)').length - 1, 1);
  assert.equal(mainSource.split('ATOMIC_RECEIPT_BACKUP_TARGET_ROLES.NOTES_RECOVERY_SNAPSHOT').length - 1, 2);
  assert.equal(mainSource.split('ATOMIC_RECEIPT_BACKUP_TARGET_ROLES.PROJECT_MANUAL_BACKUP_RECEIPT').length - 1, 1);
  assert.equal(mainSource.includes('() => fileManager.writeFileAtomic(receiptPath'), false);
});

test('C5C4 notes recovery requires atomic authority and proves readback', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-c5c4-notes-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const notes = await import(path.join(REPO_ROOT, 'src', 'product', 'notesStoragePersistence.mjs'));
  await assert.rejects(notes.createNotesRecoverySnapshot({
    projectRoot: root,
    notesPath: path.join(root, 'notes.craftsman.json'),
    sourceText: 'before',
  }), /NOTES_RECOVERY_ATOMIC_WRITER_REQUIRED/u);
  let writes = 0;
  const receipt = await notes.createNotesRecoverySnapshot({
    projectRoot: root,
    notesPath: path.join(root, 'notes.craftsman.json'),
    sourceText: 'before',
    writeRecoveryFileAtomic: async (targetPath, content) => {
      writes += 1;
      fs.writeFileSync(targetPath, content);
      return { success: true };
    },
    now: () => '2026-08-28T09:00:00Z',
  });
  assert.equal(writes, 1);
  assert.equal(receipt.snapshotReadable, true);
  assert.equal(receipt.snapshotHashMatchesInput, true);
  assert.equal(JSON.stringify(receipt).includes(root), false);
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
    'function createAtomicReceiptBackupAuthorityIdentity({', 'function validateObservation(',
    'if (!Object.values(ATOMIC_RECEIPT_BACKUP_TARGET_ROLES).includes(targetRole)) {', 'if (false) {')],
  ['subject-digest-guard-removed', (source) => mutateSection(source,
    'function createAtomicReceiptBackupAuthorityIdentity({', 'function validateObservation(',
    "if (typeof subjectDigest !== 'string' || !/^[a-f0-9]{64}$/u.test(subjectDigest)) {", 'if (false) {')],
  ['content-guard-removed', (source) => mutateSection(source,
    'function createAtomicReceiptBackupAuthorityIdentity({', 'function validateObservation(',
    "if (typeof content !== 'string' && !Buffer.isBuffer(content)) {", 'if (false) {')],
  ['receipt-subject-binding-removed', (source) => mutateSection(source,
    'function validateAtomicReceiptBackupReceipt(', '// C5C1:',
    '|| result.subjectDigest !== identity.subjectDigest', '|| false')],
  ['receipt-content-binding-removed', (source) => mutateSection(source,
    'function validateAtomicReceiptBackupReceipt(', '// C5C1:',
    '|| result.contentDigest !== identity.contentDigest', '|| false')],
  ['receipt-byte-count-binding-removed', (source) => mutateSection(source,
    'function validateAtomicReceiptBackupReceipt(', '// C5C1:',
    '|| result.byteCount !== identity.byteCount) {', '|| false) {')],
  ['dedicated-route-guard-removed', (source) => mutateSection(source,
    'async function executeAtomicReceiptBackupGatewayCutover({', 'module.exports = Object.freeze({',
    'if (gateway.route !== SAVE_AUTHORITY_ROUTES.ATOMIC_RECEIPT_BACKUP_V1) {', 'if (false) {')],
  ['gateway-executed-twice', (source) => mutateSection(source,
    'async function executeAtomicReceiptBackupGatewayCutover({', 'module.exports = Object.freeze({',
    'const result = validateAtomicReceiptBackupReceipt(\n    await executeGateway(Object.freeze({ ...request, authorityIdentity: identity })),',
    'await executeGateway(Object.freeze({ ...request, authorityIdentity: identity }));\n  const result = validateAtomicReceiptBackupReceipt(\n    await executeGateway(Object.freeze({ ...request, authorityIdentity: identity })),')],
  ['legacy-role-forged', (source) => mutateSection(source,
    'async function executeAtomicReceiptBackupGatewayCutover({', 'module.exports = Object.freeze({',
    "legacyAuthorityRole: 'READ_ONLY_OBSERVER',", "legacyAuthorityRole: 'WRITE_FALLBACK',")],
  ['legacy-fallback-enabled', (source) => mutateSection(source,
    'async function executeAtomicReceiptBackupGatewayCutover({', 'module.exports = Object.freeze({',
    'legacyWriteFallbackAllowed: false,', 'legacyWriteFallbackAllowed: true,')],
  ['dual-write-enabled', (source) => mutateSection(source,
    'async function executeAtomicReceiptBackupGatewayCutover({', 'module.exports = Object.freeze({',
    'dualWriteAllowed: false,', 'dualWriteAllowed: true,')],
  ['execution-count-forged', (source) => mutateSection(source,
    'async function executeAtomicReceiptBackupGatewayCutover({', 'module.exports = Object.freeze({',
    'gatewayExecutorCount: 1,', 'gatewayExecutorCount: 2,')],
];

async function c5c4MutantOracle(module) {
  const request = requestFor();
  let executions = 0;
  const receipt = await module.executeAtomicReceiptBackupGatewayCutover({
    request,
    ...observers(module, module.SAVE_AUTHORITY_ROUTES.ATOMIC_RECEIPT_BACKUP_V1),
    executeGateway: async ({ authorityIdentity }) => {
      executions += 1;
      return validReceipt(authorityIdentity);
    },
  });
  assert.equal(executions, 1);
  assert.equal(receipt.atomicReceiptBackupGateway.legacyAuthorityRole, 'READ_ONLY_OBSERVER');
  assert.equal(receipt.atomicReceiptBackupGateway.legacyWriteFallbackAllowed, false);
  assert.equal(receipt.atomicReceiptBackupGateway.dualWriteAllowed, false);
  assert.equal(receipt.atomicReceiptBackupGateway.gatewayExecutorCount, 1);
  const rejected = [
    [{ ...request, targetRole: 'PROJECT_PRIMARY' }, 'E_ATOMIC_RECEIPT_BACKUP_TARGET_ROLE_INVALID'],
    [{ ...request, subjectDigest: 'bad' }, 'E_ATOMIC_RECEIPT_BACKUP_SUBJECT_DIGEST_INVALID'],
    [{ ...request, content: null }, 'E_ATOMIC_RECEIPT_BACKUP_CONTENT_REQUIRED'],
  ];
  for (const [invalid, code] of rejected) {
    await assert.rejects(module.executeAtomicReceiptBackupGatewayCutover({
      request: invalid,
      ...observers(module, module.SAVE_AUTHORITY_ROUTES.ATOMIC_RECEIPT_BACKUP_V1),
      executeGateway: async ({ authorityIdentity }) => validReceipt(authorityIdentity),
    }), (error) => error && error.code === code);
  }
  await assert.rejects(module.executeAtomicReceiptBackupGatewayCutover({
    request,
    ...observers(module, module.SAVE_AUTHORITY_ROUTES.ATOMIC_FILE_V1),
    executeGateway: async ({ authorityIdentity }) => validReceipt(authorityIdentity),
  }));
  const forgedFields = {
    subjectDigest: sha256('forged-subject'),
    contentDigest: sha256('forged-content'),
    byteCount: Buffer.byteLength(request.content) + 1,
  };
  for (const [field, value] of Object.entries(forgedFields)) {
    await assert.rejects(module.executeAtomicReceiptBackupGatewayCutover({
      request,
      ...observers(module, module.SAVE_AUTHORITY_ROUTES.ATOMIC_RECEIPT_BACKUP_V1),
      executeGateway: async ({ authorityIdentity }) => ({ ...validReceipt(authorityIdentity), [field]: value }),
    }));
  }
}

test('C5C4 named implementation mutants have zero survivors', async () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const results = [];
  for (const [id, transform] of MUTANTS) {
    const mutated = transform(source);
    assert.notEqual(mutated, source, id);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-c5c4-mutant-'));
    const target = path.join(root, 'legacy-strangler-v1.cjs');
    fs.writeFileSync(target, mutated);
    let killed = false;
    try {
      await c5c4MutantOracle(require(target));
    } catch {
      killed = true;
    }
    results.push({ id, killed });
    fs.rmSync(root, { recursive: true, force: true });
  }
  const survived = results.filter((result) => !result.killed).map((result) => result.id);
  console.log(`R24_C5C4_MUTATION_RECEIPT=${JSON.stringify({ total: results.length, killed: results.length - survived.length, survived })}`);
  assert.equal(results.length, 12);
  assert.deepEqual(survived, []);
});
