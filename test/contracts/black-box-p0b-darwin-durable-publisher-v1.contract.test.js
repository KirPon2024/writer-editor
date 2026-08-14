'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(REPO_ROOT, 'src', 'product', 'blackBoxDarwinDurablePublisherV1.mjs');

async function loadModule() {
  return import(pathToFileURL(MODULE_PATH).href);
}

function sha256Buffer(buffer) {
  return `sha256:${crypto.createHash('sha256').update(buffer).digest('hex')}`;
}

function sortedKeys(value) {
  return Object.keys(value).sort();
}

function artifactBytes(label = 'alpha') {
  return Buffer.from(`YALKEN_BLACK_BOX_P0B_SYNTHETIC_ARTIFACT:${label}:Привет:مرحبا:こんにちは`, 'utf8');
}

function buildRequest(module, overrides = {}) {
  const bytes = overrides.bytes || artifactBytes(overrides.label);
  const sourceSetDigest = overrides.sourceSetDigest || `sha256:${'1'.repeat(64)}`;
  const target = overrides.target || {
    schemaVersion: module.BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_SCHEMAS.target,
    platform: 'darwin',
    directoryPath: overrides.directoryPath || path.join(os.tmpdir(), 'yalken-p0b-test-not-created'),
    fileName: overrides.fileName || 'capsule-alpha.yalken-capsule',
  };
  return {
    schemaVersion: module.BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_SCHEMAS.request,
    featureFlags: overrides.featureFlags || {
      [module.BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_FEATURE_FLAG]: true,
    },
    sourceBinding: overrides.sourceBinding || {
      schemaVersion: module.BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_SCHEMAS.sourceBinding,
      projectId: 'project-alpha',
      rootId: 'root-main',
      documentId: 'black-box-core',
      canonicalRevision: 'canon-r001',
      workingRevision: 'work-r001',
      generation: 'gen-r001',
      sourceSetDigest,
    },
    artifact: overrides.artifact || {
      schemaVersion: module.BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_SCHEMAS.artifact,
      type: 'BLACK_BOX_CAPSULE_ARTIFACT_OPAQUE_BYTES_V1',
      bytesBase64: bytes.toString('base64'),
      byteLength: bytes.byteLength,
      sha256: overrides.artifactDigest || sha256Buffer(bytes),
      sourceSetDigest,
    },
    target,
    expectations: overrides.expectations || {
      expectedAbsent: true,
      noReplace: true,
      requireNoFollow: true,
      requireFileSync: true,
      requireDirectorySync: true,
      requireFullReadback: true,
    },
    ...(overrides.extraRequestFields || {}),
  };
}

function assertDenied(result, code) {
  assert.equal(result.ok, false);
  assert.equal(result.decision, 'DENY');
  assert.ok(
    result.reasons.some((reason) => reason.code === code),
    `expected ${code} in ${JSON.stringify(result.reasons)}`,
  );
}

function fakeHandle(events, kind, options = {}) {
  return {
    async writeFile(bytes) {
      events.push(['writeFile', kind, Buffer.from(bytes).toString('utf8')]);
    },
    async sync() {
      events.push(['sync', kind]);
      if (options.failSyncKind === kind) {
        const error = new Error(`${kind} sync failed`);
        error.code = 'EIO';
        throw error;
      }
    },
    async close() {
      events.push(['close', kind]);
    },
  };
}

function createFakeFsPort(options = {}) {
  const events = [];
  const constants = {
    O_WRONLY: 0x0001,
    O_CREAT: 0x0200,
    O_EXCL: 0x0800,
    O_NOFOLLOW: 0x0100,
  };
  return {
    events,
    constants,
    async lstat(targetPath) {
      events.push(['lstat', targetPath]);
      if (options.existingTargetPath === targetPath) {
        return { isDirectory: () => false, isSymbolicLink: () => false, isFile: () => true };
      }
      if (options.symlinkTargetPath === targetPath) {
        return { isDirectory: () => false, isSymbolicLink: () => true, isFile: () => false };
      }
      if (targetPath === options.directoryPath) {
        return { isDirectory: () => true, isSymbolicLink: () => false, isFile: () => false };
      }
      const error = new Error(`missing ${targetPath}`);
      error.code = 'ENOENT';
      throw error;
    },
    async open(targetPath, flags, mode) {
      events.push(['open', targetPath, flags, mode]);
      if (targetPath === options.directoryPath) return fakeHandle(events, 'directory', options);
      return fakeHandle(events, 'file', options);
    },
    async readFile() {
      events.push(['readFile']);
      return options.readbackBytes || artifactBytes('fake');
    },
  };
}

test('F3 P0B durable publisher v1 exports a closed default-off Black Box create-only contract', async () => {
  const module = await loadModule();
  const disabled = module.resolveBlackBoxDarwinDurablePublisherFeatureFlag({});
  const enabled = module.resolveBlackBoxDarwinDurablePublisherFeatureFlag({
    [module.BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_FEATURE_FLAG]: true,
  });

  assert.equal(module.BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_FEATURE_FLAG, 'yalken.blackBox.darwinDurablePublisher.p0bV1');
  assert.deepEqual(sortedKeys(module.BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_SCHEMAS), [
    'artifact',
    'featureFlag',
    'receipt',
    'request',
    'sourceBinding',
    'target',
  ]);
  assert.deepEqual(sortedKeys(module.BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES), [
    'ARTIFACT_DIGEST_MISMATCH',
    'ARTIFACT_PUBLISHED',
    'DIRECTORY_SYNC_FAILED',
    'FEATURE_DISABLED',
    'FIELD_INVALID',
    'FILE_SYNC_FAILED',
    'KEYSET_INVALID',
    'READBACK_MISMATCH',
    'SOURCE_BINDING_MISMATCH',
    'TARGET_DIRECTORY_INVALID',
    'TARGET_EXISTS',
    'TARGET_SYMLINK_REJECTED',
    'UNSUPPORTED_PLATFORM',
    'WRITE_FAILED',
  ]);
  assert.deepEqual(disabled, {
    enabled: false,
    canWriteManuscript: false,
    canReplaceArtifact: false,
    canRecoverProject: false,
    canPublishBlackBoxArtifact: false,
  });
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.canWriteManuscript, false);
  assert.equal(enabled.canReplaceArtifact, false);
  assert.equal(enabled.canRecoverProject, false);
  assert.equal(enabled.canPublishBlackBoxArtifact, true);
});

test('F3 P0B durable publisher v1 creates one disposable synthetic artifact with file+directory sync and exact reread receipt', async () => {
  const module = await loadModule();
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yalken-p0b-contract-'));
  const bytes = artifactBytes('success');
  const request = buildRequest(module, {
    bytes,
    directoryPath: tempRoot,
    fileName: 'capsule-success.yalken-capsule',
  });

  const result = await module.publishBlackBoxArtifactDarwinDurableV1(request);
  const targetPath = path.join(tempRoot, 'capsule-success.yalken-capsule');
  const readback = await fs.readFile(targetPath);

  assert.equal(result.ok, true);
  assert.equal(result.code, module.BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.ARTIFACT_PUBLISHED);
  assert.equal(readback.equals(bytes), true);
  assert.equal(result.receipt.schemaVersion, module.BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_SCHEMAS.receipt);
  assert.equal(result.receipt.durableDialect, 'DARWIN_CREATE_ONLY_FILE_DIRECTORY_FSYNC_REOPEN_REREAD_V1');
  assert.equal(result.receipt.artifact.sha256, sha256Buffer(bytes));
  assert.equal(result.receipt.target.fileName, 'capsule-success.yalken-capsule');
  assert.equal(result.receipt.durability.openedExclusive, true);
  assert.equal(result.receipt.durability.noFollowRequested, true);
  assert.equal(result.receipt.durability.noReplace, true);
  assert.equal(result.receipt.durability.fileSynced, true);
  assert.equal(result.receipt.durability.directorySynced, true);
  assert.equal(result.receipt.durability.finalReopenReread, true);
  assert.equal(result.receipt.durability.readbackDigest, sha256Buffer(bytes));
  assert.equal(result.receipt.durability.processCrashProof, false);
  assert.equal(result.receipt.durability.physicalPowerLossProof, false);
  assert.equal(result.receipt.claims.disasterReady, false);
});

test('F3 P0B durable publisher v1 requests O_EXCL and O_NOFOLLOW and rejects any existing target before write', async () => {
  const module = await loadModule();
  const directoryPath = '/synthetic/p0b';
  const targetPath = '/synthetic/p0b/capsule-fake.yalken-capsule';
  const bytes = artifactBytes('fake');
  const fsPort = createFakeFsPort({
    directoryPath,
    existingTargetPath: targetPath,
    readbackBytes: bytes,
  });
  const request = buildRequest(module, {
    bytes,
    directoryPath,
    fileName: 'capsule-fake.yalken-capsule',
  });

  const denied = await module.publishBlackBoxArtifactDarwinDurableV1(request, { fsPort });
  assertDenied(denied, module.BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.TARGET_EXISTS);
  assert.equal(fsPort.events.some((event) => event[0] === 'open'), false);

  const fsPort2 = createFakeFsPort({ directoryPath, readbackBytes: bytes });
  const allowed = await module.publishBlackBoxArtifactDarwinDurableV1(request, { fsPort: fsPort2 });
  const openEvent = fsPort2.events.find((event) => event[0] === 'open' && event[2] !== 'r');
  assert.equal(allowed.ok, true);
  assert.equal(Boolean(openEvent[2] & fsPort2.constants.O_EXCL), true);
  assert.equal(Boolean(openEvent[2] & fsPort2.constants.O_NOFOLLOW), true);
  assert.equal(Boolean(openEvent[2] & fsPort2.constants.O_CREAT), true);
  assert.equal(Boolean(openEvent[2] & fsPort2.constants.O_WRONLY), true);
});

test('F3 P0B durable publisher v1 rejects symlink, path authority, digest mismatch, disabled flag and source transplant', async () => {
  const module = await loadModule();
  const directoryPath = '/synthetic/p0b';
  const bytes = artifactBytes('hostile');
  const good = buildRequest(module, { bytes, directoryPath, fileName: 'capsule-hostile.yalken-capsule' });
  const cases = [
    {
      name: 'disabled',
      request: buildRequest(module, { bytes, directoryPath, featureFlags: {} }),
      code: module.BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.FEATURE_DISABLED,
    },
    {
      name: 'extra request key',
      request: { ...good, callerProof: 'ALLOW' },
      code: module.BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.KEYSET_INVALID,
    },
    {
      name: 'wrong artifact digest',
      request: buildRequest(module, { bytes, directoryPath, artifactDigest: `sha256:${'2'.repeat(64)}` }),
      code: module.BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.ARTIFACT_DIGEST_MISMATCH,
    },
    {
      name: 'slash basename',
      request: buildRequest(module, { bytes, directoryPath, fileName: 'nested/capsule.yalken-capsule' }),
      code: module.BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.FIELD_INVALID,
    },
    {
      name: 'dotdot basename',
      request: buildRequest(module, { bytes, directoryPath, fileName: '..' }),
      code: module.BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.FIELD_INVALID,
    },
    {
      name: 'source transplant',
      request: buildRequest(module, {
        bytes,
        directoryPath,
        artifact: {
          ...good.artifact,
          sourceSetDigest: `sha256:${'3'.repeat(64)}`,
        },
      }),
      code: module.BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.SOURCE_BINDING_MISMATCH,
    },
  ];

  for (const entry of cases) {
    const result = await module.publishBlackBoxArtifactDarwinDurableV1(entry.request, {
      fsPort: createFakeFsPort({ directoryPath, readbackBytes: bytes }),
    });
    assertDenied(result, entry.code);
  }

  const symlink = await module.publishBlackBoxArtifactDarwinDurableV1(good, {
    fsPort: createFakeFsPort({
      directoryPath,
      symlinkTargetPath: path.join(directoryPath, 'capsule-hostile.yalken-capsule'),
      readbackBytes: bytes,
    }),
  });
  assertDenied(symlink, module.BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.TARGET_SYMLINK_REJECTED);
});

test('F3 P0B durable publisher v1 fails closed on file sync, directory sync and final readback mismatch', async () => {
  const module = await loadModule();
  const directoryPath = '/synthetic/p0b';
  const bytes = artifactBytes('sync');
  const request = buildRequest(module, { bytes, directoryPath, fileName: 'capsule-sync.yalken-capsule' });
  const cases = [
    {
      name: 'file sync',
      fsPort: createFakeFsPort({ directoryPath, failSyncKind: 'file', readbackBytes: bytes }),
      code: module.BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.FILE_SYNC_FAILED,
    },
    {
      name: 'directory sync',
      fsPort: createFakeFsPort({ directoryPath, failSyncKind: 'directory', readbackBytes: bytes }),
      code: module.BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.DIRECTORY_SYNC_FAILED,
    },
    {
      name: 'readback mismatch',
      fsPort: createFakeFsPort({ directoryPath, readbackBytes: Buffer.from('wrong', 'utf8') }),
      code: module.BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.READBACK_MISMATCH,
    },
  ];

  for (const entry of cases) {
    const result = await module.publishBlackBoxArtifactDarwinDurableV1(request, { fsPort: entry.fsPort });
    assertDenied(result, entry.code);
  }
});

test('F3 P0B durable publisher v1 model keeps UNKNOWN/ABSTAIN style gaps out of PASS by denominator', async () => {
  const module = await loadModule();
  assert.equal(module.p0bDarwinDurablePublisherClaimStrength({
    sourceTrust: 'PASS',
    executedCoverage: 'PASS',
    artifactIntegrity: 'PASS',
    snapshotFreshness: 'PASS',
    oracleIndependence: 'PASS',
  }), 'PASS');
  for (const key of ['sourceTrust', 'executedCoverage', 'artifactIntegrity', 'snapshotFreshness', 'oracleIndependence']) {
    const claim = module.p0bDarwinDurablePublisherClaimStrength({
      sourceTrust: 'PASS',
      executedCoverage: 'PASS',
      artifactIntegrity: 'PASS',
      snapshotFreshness: 'PASS',
      oracleIndependence: 'PASS',
      [key]: 'UNKNOWN',
    });
    assert.equal(claim, 'UNKNOWN');
  }
});
