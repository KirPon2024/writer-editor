import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { canonicalBytes } from '../../scripts/ops/r24/corrective/canonical-json.mjs';

const require = createRequire(import.meta.url);
const {
  COMMIT_SCHEMA_VERSION,
  PROJECT_COMMIT_REPAIR_CAPABILITY_ID,
  RECOVERY_PACKET_SCHEMA_VERSION,
  commitPathFor,
  commitProjectTransaction,
  journalPathFor,
  recoveryPacketPathFor,
  recoverProjectTransaction,
  repairCorruptProjectCommit,
} = require('../../src/core/project-transaction-v1.cjs');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-c5a-'));
  const scenePath = path.join(root, 'scenes', 'scene.txt');
  const manifestPath = path.join(root, 'project.json');
  fs.mkdirSync(path.dirname(scenePath), { recursive: true });
  fs.writeFileSync(scenePath, 'old scene');
  fs.writeFileSync(manifestPath, '{"revision":1}');
  return { root, scenePath, manifestPath };
}

function publisher() {
  return async ({ manifestPath, expectedText, nextText }) => {
    assert.equal(fs.readFileSync(manifestPath, 'utf8'), expectedText);
    fs.writeFileSync(manifestPath, nextText);
  };
}

async function createPendingCorrupt(mutation = 'JSON') {
  const paths = sandbox();
  await assert.rejects(commitProjectTransaction({
    ...paths,
    sceneContent: 'new scene',
    expectedSceneContent: 'old scene',
    manifestContent: '{"revision":2}',
    expectedManifestContent: '{"revision":1}',
    revision: 2,
    publishManifest: async ({ manifestPath, nextText }) => {
      fs.writeFileSync(manifestPath, nextText);
      throw new Error('bounded crash stand-in');
    },
  }));
  const journal = JSON.parse(fs.readFileSync(journalPathFor(paths.manifestPath), 'utf8'));
  const valid = {
    schemaVersion: COMMIT_SCHEMA_VERSION,
    transactionId: journal.transactionId,
    revision: journal.revision,
    scenePath: paths.scenePath,
    manifestPath: paths.manifestPath,
    sceneDigest: sha256('new scene'),
    manifestDigest: sha256('{"revision":2}'),
  };
  let source;
  if (mutation === 'JSON') source = '{torn';
  else {
    const record = { ...valid };
    if (mutation === 'SCHEMA') record.schemaVersion = 'unknown';
    if (mutation === 'BINDING') record.scenePath = `${paths.scenePath}.rebound`;
    if (mutation === 'TRANSACTION') record.transactionId = '0'.repeat(64);
    if (mutation === 'REVISION') record.revision += 1;
    if (mutation === 'DIGEST') record.sceneDigest = 'f'.repeat(64);
    source = `${JSON.stringify(record)}\n`;
  }
  fs.writeFileSync(commitPathFor(paths.scenePath), source);
  return { ...paths, corruptSource: source, journal };
}

async function captureCorruption(paths) {
  let failure;
  try {
    await recoverProjectTransaction({
      scenePath: paths.scenePath,
      manifestPath: paths.manifestPath,
      publishManifest: publisher(),
    });
  } catch (error) {
    failure = error;
  }
  assert.equal(failure?.code, 'E_PROJECT_COMMIT_CORRUPT');
  return failure;
}

for (const mutation of ['JSON', 'SCHEMA', 'BINDING', 'TRANSACTION', 'REVISION', 'DIGEST']) {
  test(`C5A preserves both versions and fails closed for ${mutation} commit metadata`, async () => {
    const paths = await createPendingCorrupt(mutation);
    const beforePair = [
      fs.readFileSync(paths.scenePath, 'utf8'),
      fs.readFileSync(paths.manifestPath, 'utf8'),
      fs.readFileSync(journalPathFor(paths.manifestPath), 'utf8'),
      fs.readFileSync(commitPathFor(paths.scenePath), 'utf8'),
    ];
    const failure = await captureCorruption(paths);
    assert.equal(failure.recovery.capabilityId, PROJECT_COMMIT_REPAIR_CAPABILITY_ID);
    assert.equal(failure.recovery.repairAuthorityRequired, true);
    assert.deepEqual(failure.recovery.versionRoles, ['BEFORE', 'AFTER', 'CORRUPT_COMMIT_METADATA']);
    assert.equal(JSON.stringify(failure.recovery).includes('/'), false);
    const packetPath = recoveryPacketPathFor(paths.manifestPath, paths.journal.transactionId);
    const packetBytes = fs.readFileSync(packetPath);
    const packet = JSON.parse(packetBytes);
    assert.equal(packetBytes.equals(canonicalBytes(packet)), true);
    assert.equal(packet.schemaVersion, RECOVERY_PACKET_SCHEMA_VERSION);
    assert.equal(packet.capabilityId, PROJECT_COMMIT_REPAIR_CAPABILITY_ID);
    assert.equal(sha256(packetBytes), failure.recovery.packetDigest);
    const roles = new Map(packet.artifacts.map((artifact) => [artifact.role, artifact]));
    assert.equal(Buffer.from(roles.get('BEFORE_SCENE').valueBase64, 'base64').toString(), 'old scene');
    assert.equal(Buffer.from(roles.get('AFTER_SCENE').valueBase64, 'base64').toString(), 'new scene');
    assert.equal(Buffer.from(roles.get('BEFORE_MANIFEST').valueBase64, 'base64').toString(), '{"revision":1}');
    assert.equal(Buffer.from(roles.get('AFTER_MANIFEST').valueBase64, 'base64').toString(), '{"revision":2}');
    assert.equal(Buffer.from(roles.get('CORRUPT_COMMIT_METADATA').valueBase64, 'base64').toString(), paths.corruptSource);
    assert.deepEqual([
      fs.readFileSync(paths.scenePath, 'utf8'),
      fs.readFileSync(paths.manifestPath, 'utf8'),
      fs.readFileSync(journalPathFor(paths.manifestPath), 'utf8'),
      fs.readFileSync(commitPathFor(paths.scenePath), 'utf8'),
    ], beforePair);
  });
}

test('C5A refuses absent, false, or mismatched repair authority without pair mutation', async () => {
  const paths = await createPendingCorrupt('DIGEST');
  const failure = await captureCorruption(paths);
  const pairBefore = [fs.readFileSync(paths.scenePath), fs.readFileSync(paths.manifestPath), fs.readFileSync(commitPathFor(paths.scenePath))];
  const base = {
    scenePath: paths.scenePath,
    manifestPath: paths.manifestPath,
    publishManifest: publisher(),
    decision: 'REPAIR_TO_BEFORE',
    authorityProof: { proofId: 'independent-test-proof' },
  };
  await assert.rejects(repairCorruptProjectCommit(base), (error) => error.code === 'E_PROJECT_COMMIT_REPAIR_AUTHORITY_REQUIRED');
  await assert.rejects(
    repairCorruptProjectCommit({ ...base, verifyAuthorityProof: () => false }),
    (error) => error.code === 'E_PROJECT_COMMIT_REPAIR_AUTHORITY_REQUIRED',
  );
  await assert.rejects(
    repairCorruptProjectCommit({
      ...base,
      verifyAuthorityProof: (request) => request.packetDigest === `${failure.recovery.packetDigest}0`,
    }),
    (error) => error.code === 'E_PROJECT_COMMIT_REPAIR_AUTHORITY_REQUIRED',
  );
  assert.deepEqual(
    [fs.readFileSync(paths.scenePath), fs.readFileSync(paths.manifestPath), fs.readFileSync(commitPathFor(paths.scenePath))],
    pairBefore,
  );
});

for (const [decision, expectedOutcome, expectedScene, expectedManifest] of [
  ['REPAIR_TO_BEFORE', 'UNCOMMITTED_ROLLED_BACK', 'old scene', '{"revision":1}'],
  ['REPAIR_TO_AFTER', 'COMMITTED_CONVERGED', 'new scene', '{"revision":2}'],
]) {
  test(`C5A applies ${decision} only after exact independent authority proof`, async () => {
    const paths = await createPendingCorrupt('JSON');
    const failure = await captureCorruption(paths);
    const packetPath = recoveryPacketPathFor(paths.manifestPath, paths.journal.transactionId);
    let verifiedRequest;
    const result = await repairCorruptProjectCommit({
      scenePath: paths.scenePath,
      manifestPath: paths.manifestPath,
      publishManifest: publisher(),
      decision,
      authorityProof: { proofId: `proof-${decision}` },
      verifyAuthorityProof: (request) => {
        verifiedRequest = request;
        return request.capabilityId === PROJECT_COMMIT_REPAIR_CAPABILITY_ID
          && request.packetDigest === failure.recovery.packetDigest
          && request.transactionId === paths.journal.transactionId
          && request.decision === decision;
      },
    });
    assert.equal(verifiedRequest.packetDigest, failure.recovery.packetDigest);
    assert.equal(result.outcome, expectedOutcome);
    assert.equal(result.recoveryPacketRetained, true);
    assert.equal(JSON.stringify(result).includes('/'), false);
    assert.equal(fs.readFileSync(paths.scenePath, 'utf8'), expectedScene);
    assert.equal(fs.readFileSync(paths.manifestPath, 'utf8'), expectedManifest);
    assert.equal(fs.existsSync(journalPathFor(paths.manifestPath)), false);
    assert.equal(fs.existsSync(packetPath), true);
  });
}

test('C5A treats a digest-valid prior marker as uncommitted history, not corruption', async () => {
  const paths = sandbox();
  await commitProjectTransaction({
    ...paths,
    sceneContent: 'first scene',
    expectedSceneContent: 'old scene',
    manifestContent: '{"revision":2}',
    expectedManifestContent: '{"revision":1}',
    revision: 2,
    publishManifest: publisher(),
  });
  await assert.rejects(commitProjectTransaction({
    ...paths,
    sceneContent: 'second scene',
    expectedSceneContent: 'first scene',
    manifestContent: '{"revision":3}',
    expectedManifestContent: '{"revision":2}',
    revision: 3,
    publishManifest: async ({ manifestPath, nextText }) => {
      fs.writeFileSync(manifestPath, nextText);
      throw new Error('bounded crash stand-in');
    },
  }));
  const recovery = await recoverProjectTransaction({
    scenePath: paths.scenePath,
    manifestPath: paths.manifestPath,
    publishManifest: publisher(),
  });
  assert.equal(recovery.outcome, 'UNCOMMITTED_ROLLED_BACK');
  assert.equal(fs.readFileSync(paths.scenePath, 'utf8'), 'first scene');
  assert.equal(fs.readFileSync(paths.manifestPath, 'utf8'), '{"revision":2}');
});

test('C5A no-journal commit preserves corruption and only synthesizes repair after exact authority', async () => {
  const paths = sandbox();
  fs.writeFileSync(commitPathFor(paths.scenePath), '{torn');
  let failure;
  try {
    await commitProjectTransaction({
      ...paths,
      sceneContent: 'new scene',
      expectedSceneContent: 'old scene',
      manifestContent: '{"revision":2}',
      expectedManifestContent: '{"revision":1}',
      revision: 2,
      publishManifest: publisher(),
    });
  } catch (error) {
    failure = error;
  }
  assert.equal(failure?.code, 'E_PROJECT_COMMIT_CORRUPT');
  assert.equal(fs.readFileSync(paths.scenePath, 'utf8'), 'old scene');
  assert.equal(fs.readFileSync(paths.manifestPath, 'utf8'), '{"revision":1}');
  assert.equal(fs.readFileSync(commitPathFor(paths.scenePath), 'utf8'), '{torn');
  assert.equal(fs.existsSync(recoveryPacketPathFor(paths.manifestPath, failure.recovery.transactionId)), true);
  const repair = await repairCorruptProjectCommit({
    scenePath: paths.scenePath,
    manifestPath: paths.manifestPath,
    publishManifest: publisher(),
    decision: 'REPAIR_TO_AFTER',
    authorityProof: { proofId: 'synthetic-journal-independent-proof' },
    recoveryTransactionId: failure.recovery.transactionId,
    recoveryPacketDigest: failure.recovery.packetDigest,
    verifyAuthorityProof: (request) => request.packetDigest === failure.recovery.packetDigest
      && request.transactionId === failure.recovery.transactionId
      && request.decision === 'REPAIR_TO_AFTER',
  });
  assert.equal(repair.outcome, 'COMMITTED_CONVERGED');
  assert.equal(fs.readFileSync(paths.scenePath, 'utf8'), 'new scene');
  assert.equal(fs.readFileSync(paths.manifestPath, 'utf8'), '{"revision":2}');
  assert.equal(fs.existsSync(journalPathFor(paths.manifestPath)), false);
});

test('C5A implementation and generated governance artifacts stay inside the admitted exact write set', async () => {
  const module = await import('../../scripts/ops/r24/corrective/c5a-project-commit-recovery.mjs');
  assert.equal(module.WRITE_SET.length, 10);
  assert.equal(module.STAGE_INSTANCE_DIGEST, 'd010d4f44980973162fe5f0756c23d9a53e0b118977c22bac238a8e425c936b6');
  assert.equal(module.STAGE_ADMISSION_DIGEST, 'eaf58a7a25843bc19b6e1a2fa1e294ac97b7f9c41798891be93d7a9f0ed8e911');
  const identity = module.assertSourceIdentity(ROOT);
  assert.equal(identity.sourceHeadSha, '717e1c1a07a269ebbbe9873a187259784181d90d');
  assert.equal(identity.sourceTreeSha, '4ff5b7e8579f688896f3065b18fd005255911ea1');
});
