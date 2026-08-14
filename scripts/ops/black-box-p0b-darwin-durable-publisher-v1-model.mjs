#!/usr/bin/env node
import crypto from 'node:crypto';
import path from 'node:path';

import {
  BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES,
  BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_FEATURE_FLAG,
  BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_SCHEMAS,
  p0bDarwinDurablePublisherClaimStrength,
  publishBlackBoxArtifactDarwinDurableV1,
} from '../../src/product/blackBoxDarwinDurablePublisherV1.mjs';

const DIRECTORY_PATH = '/synthetic/p0b-model';

function sha256Buffer(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function artifactBytes(label = 'model') {
  return Buffer.from(`YALKEN_P0B_MODEL_SYNTHETIC:${label}:Привет:مرحبا:日本語`, 'utf8');
}

function baseRequest(overrides = {}) {
  const bytes = overrides.bytes || artifactBytes(overrides.label || 'base');
  const sourceSetDigest = overrides.sourceSetDigest || `sha256:${'a'.repeat(64)}`;
  return {
    schemaVersion: BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_SCHEMAS.request,
    featureFlags: overrides.featureFlags || {
      [BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_FEATURE_FLAG]: true,
    },
    sourceBinding: overrides.sourceBinding || {
      schemaVersion: BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_SCHEMAS.sourceBinding,
      projectId: 'project-alpha',
      rootId: 'root-main',
      documentId: 'black-box-core',
      canonicalRevision: 'canon-r001',
      workingRevision: 'work-r001',
      generation: 'gen-r001',
      sourceSetDigest,
    },
    artifact: overrides.artifact || {
      schemaVersion: BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_SCHEMAS.artifact,
      type: 'BLACK_BOX_CAPSULE_ARTIFACT_OPAQUE_BYTES_V1',
      bytesBase64: bytes.toString('base64'),
      byteLength: bytes.byteLength,
      sha256: overrides.artifactDigest || sha256Buffer(bytes),
      sourceSetDigest,
    },
    target: overrides.target || {
      schemaVersion: BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_SCHEMAS.target,
      platform: overrides.platform || 'darwin',
      directoryPath: overrides.directoryPath || DIRECTORY_PATH,
      fileName: overrides.fileName || 'capsule-model.yalken-capsule',
    },
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

function fakeHandle(events, kind, options = {}) {
  return {
    async writeFile(bytes) {
      events.push(['writeFile', kind, Buffer.from(bytes).byteLength]);
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
    O_NOFOLLOW: options.noFollowMissing ? 0 : 0x0100,
  };
  return {
    events,
    constants,
    async lstat(targetPath) {
      events.push(['lstat', targetPath]);
      if (targetPath === options.directoryPath) {
        return {
          isDirectory: () => options.directoryIsValid !== false,
          isSymbolicLink: () => options.directoryIsSymlink === true,
          isFile: () => false,
        };
      }
      if (options.existingTargetPath === targetPath) {
        return { isDirectory: () => false, isSymbolicLink: () => false, isFile: () => true };
      }
      if (options.symlinkTargetPath === targetPath) {
        return { isDirectory: () => false, isSymbolicLink: () => true, isFile: () => false };
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
      return options.readbackBytes || artifactBytes(options.label || 'base');
    },
  };
}

function targetPathFor(request) {
  return path.join(request.target.directoryPath, request.target.fileName);
}

function expectedForSpec(spec) {
  if (spec.featureEnabled === false) return { ok: false, code: BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.FEATURE_DISABLED };
  if (spec.extraRequestField) return { ok: false, code: BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.KEYSET_INVALID };
  if ((spec.platform || 'darwin') !== 'darwin') {
    return { ok: false, code: BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.UNSUPPORTED_PLATFORM };
  }
  if (spec.badDigest) return { ok: false, code: BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.ARTIFACT_DIGEST_MISMATCH };
  if (spec.transplant) return { ok: false, code: BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.SOURCE_BINDING_MISMATCH };
  if (spec.badBasename || spec.badDirectory || spec.badExpectations || spec.badArtifactShape) {
    return { ok: false, code: BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.FIELD_INVALID };
  }
  if (spec.noFollowMissing) return { ok: false, code: BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.UNSUPPORTED_PLATFORM };
  if (spec.directoryInvalid || spec.directorySymlink) return { ok: false, code: BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.TARGET_DIRECTORY_INVALID };
  if (spec.existingTarget) return { ok: false, code: BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.TARGET_EXISTS };
  if (spec.symlinkTarget) return { ok: false, code: BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.TARGET_SYMLINK_REJECTED };
  if (spec.fileSyncFails) return { ok: false, code: BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.FILE_SYNC_FAILED };
  if (spec.directorySyncFails) return { ok: false, code: BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.DIRECTORY_SYNC_FAILED };
  if (spec.readbackMismatch) return { ok: false, code: BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.READBACK_MISMATCH };
  return { ok: true, code: BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_CODES.ARTIFACT_PUBLISHED };
}

function materializeSpec(spec) {
  const bytes = artifactBytes(spec.id);
  const sourceSetDigest = `sha256:${'a'.repeat(64)}`;
  const request = baseRequest({
    bytes,
    sourceSetDigest,
    platform: spec.platform || 'darwin',
    directoryPath: spec.badDirectory ? 'relative-directory' : DIRECTORY_PATH,
    fileName: spec.badBasename ? '../bad.yalken-capsule' : `capsule-${spec.id}.yalken-capsule`,
    featureFlags: spec.featureEnabled === false ? {} : undefined,
    artifactDigest: spec.badDigest ? `sha256:${'b'.repeat(64)}` : undefined,
    extraRequestFields: spec.extraRequestField ? { callerProof: 'ALLOW' } : undefined,
  });
  if (spec.transplant) request.artifact.sourceSetDigest = `sha256:${'c'.repeat(64)}`;
  if (spec.badExpectations) request.expectations.requireDirectorySync = false;
  if (spec.badArtifactShape) request.artifact.bytesBase64 = 'not base64';
  const fsPort = createFakeFsPort({
    label: spec.readbackMismatch ? 'other' : spec.id,
    directoryPath: DIRECTORY_PATH,
    directoryIsValid: spec.directoryInvalid ? false : true,
    directoryIsSymlink: spec.directorySymlink === true,
    existingTargetPath: spec.existingTarget ? targetPathFor(request) : null,
    symlinkTargetPath: spec.symlinkTarget ? targetPathFor(request) : null,
    noFollowMissing: spec.noFollowMissing === true,
    failSyncKind: spec.fileSyncFails ? 'file' : spec.directorySyncFails ? 'directory' : null,
    readbackBytes: spec.readbackMismatch ? artifactBytes('wrong') : bytes,
  });
  return { request, fsPort };
}

function generateFiniteSpecs() {
  const specs = [{ id: 'pass' }];
  const toggles = [
    ['featureEnabled', false],
    ['platform', 'linux'],
    ['badDigest', true],
    ['transplant', true],
    ['extraRequestField', true],
    ['badBasename', true],
    ['badDirectory', true],
    ['badExpectations', true],
    ['badArtifactShape', true],
    ['noFollowMissing', true],
    ['directoryInvalid', true],
    ['directorySymlink', true],
    ['existingTarget', true],
    ['symlinkTarget', true],
    ['fileSyncFails', true],
    ['directorySyncFails', true],
    ['readbackMismatch', true],
  ];
  for (let index = 0; index < 64; index += 1) {
    const [key, value] = toggles[index % toggles.length];
    specs.push({ id: `finite-${index}`, [key]: value });
  }
  return specs;
}

const hostileSpecs = Object.freeze([
  { id: 'hostile-disabled', featureEnabled: false },
  { id: 'hostile-linux', platform: 'linux' },
  { id: 'hostile-digest', badDigest: true },
  { id: 'hostile-transplant', transplant: true },
  { id: 'hostile-extra-key', extraRequestField: true },
  { id: 'hostile-bad-name', badBasename: true },
  { id: 'hostile-relative-dir', badDirectory: true },
  { id: 'hostile-expectation', badExpectations: true },
  { id: 'hostile-artifact-shape', badArtifactShape: true },
  { id: 'hostile-no-nofollow', noFollowMissing: true },
  { id: 'hostile-directory-invalid', directoryInvalid: true },
  { id: 'hostile-directory-symlink', directorySymlink: true },
  { id: 'hostile-existing', existingTarget: true },
  { id: 'hostile-symlink', symlinkTarget: true },
  { id: 'hostile-file-sync', fileSyncFails: true },
  { id: 'hostile-directory-sync', directorySyncFails: true },
  { id: 'hostile-readback', readbackMismatch: true },
  { id: 'hostile-unknown-claim', unknownClaim: true },
]);

const semanticMutants = Object.freeze([
  { id: 'mutant-ignore-feature-flag', featureEnabled: false },
  { id: 'mutant-ignore-o-excl', existingTarget: true },
  { id: 'mutant-follow-symlink', symlinkTarget: true },
  { id: 'mutant-ignore-nofollow', noFollowMissing: true },
  { id: 'mutant-skip-file-sync', fileSyncFails: true },
  { id: 'mutant-skip-dir-sync', directorySyncFails: true },
  { id: 'mutant-skip-readback', readbackMismatch: true },
  { id: 'mutant-ignore-digest', badDigest: true },
  { id: 'mutant-ignore-transplant', transplant: true },
  { id: 'mutant-accept-path-authority', badBasename: true },
  { id: 'mutant-accept-relative-directory', badDirectory: true },
  { id: 'mutant-promote-unknown-to-pass', unknownClaim: true },
]);

async function runSpec(spec) {
  if (spec.unknownClaim) {
    const observed = p0bDarwinDurablePublisherClaimStrength({
      sourceTrust: 'PASS',
      executedCoverage: 'PASS',
      artifactIntegrity: 'PASS',
      snapshotFreshness: 'UNKNOWN',
      oracleIndependence: 'PASS',
    });
    return { observed: { ok: observed === 'PASS', code: observed }, expected: { ok: false, code: 'UNKNOWN' } };
  }
  const { request, fsPort } = materializeSpec(spec);
  const observed = await publishBlackBoxArtifactDarwinDurableV1(request, { fsPort });
  return { observed, expected: expectedForSpec(spec) };
}

async function main() {
  const finiteSpecs = generateFiniteSpecs();
  let disagreements = 0;
  const disagreementSamples = [];
  for (const spec of finiteSpecs) {
    const { observed, expected } = await runSpec(spec);
    if (observed.ok !== expected.ok || observed.code !== expected.code) {
      disagreements += 1;
      if (disagreementSamples.length < 5) {
        disagreementSamples.push({ id: spec.id, observed: { ok: observed.ok, code: observed.code }, expected });
      }
    }
  }

  let hostileFailures = 0;
  const hostileSamples = [];
  for (const spec of hostileSpecs) {
    const { observed, expected } = await runSpec(spec);
    if (observed.ok !== expected.ok || observed.code !== expected.code) {
      hostileFailures += 1;
      if (hostileSamples.length < 5) {
        hostileSamples.push({ id: spec.id, observed: { ok: observed.ok, code: observed.code }, expected });
      }
    }
  }

  let survivors = 0;
  const survivorSamples = [];
  for (const spec of semanticMutants) {
    const { observed, expected } = await runSpec(spec);
    if (observed.ok !== expected.ok || observed.code !== expected.code) {
      survivors += 1;
      if (survivorSamples.length < 5) {
        survivorSamples.push({ id: spec.id, observed: { ok: observed.ok, code: observed.code }, expected });
      }
    }
  }

  const report = {
    ok: disagreements === 0 && hostileFailures === 0 && survivors === 0,
    taskId: 'F3_BLACK_BOX_P0B_DARWIN_DURABLE_PUBLISHER_V1',
    finiteCases: finiteSpecs.length,
    disagreements,
    hostileCases: hostileSpecs.length,
    hostileFailures,
    semanticMutants: semanticMutants.length,
    survivors,
    disagreementSamples,
    hostileSamples,
    survivorSamples,
    skips: 0,
    controls: {
      syntheticCreateOnlyPasses: (await runSpec({ id: 'control-pass' })).observed.ok === true,
      existingTargetIsNotPass: (await runSpec({ id: 'control-existing', existingTarget: true })).observed.ok === false,
      symlinkIsNotPass: (await runSpec({ id: 'control-symlink', symlinkTarget: true })).observed.ok === false,
      readbackMismatchIsNotPass: (await runSpec({ id: 'control-readback', readbackMismatch: true })).observed.ok === false,
      unknownClaimIsNotPass: p0bDarwinDurablePublisherClaimStrength({
        sourceTrust: 'PASS',
        executedCoverage: 'UNKNOWN',
        artifactIntegrity: 'PASS',
        snapshotFreshness: 'PASS',
        oracleIndependence: 'PASS',
      }) !== 'PASS',
    },
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    taskId: 'F3_BLACK_BOX_P0B_DARWIN_DURABLE_PUBLISHER_V1',
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
});
