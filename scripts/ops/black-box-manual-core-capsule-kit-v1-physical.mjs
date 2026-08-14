#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { createDeterministicTreeNodeId } from '../../src/core/projectTreeIdentity.mjs';
import {
  BLACK_BOX_CORE_SOURCE_ADAPTER_V1_FEATURE_FLAG,
  BLACK_BOX_CORE_SOURCE_ADAPTER_V1_SCHEMAS,
  computeBlackBoxCoreSourceDigestV1,
} from '../../src/product/blackBoxCoreSourceAdapterV1.mjs';
import {
  BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_FEATURE_FLAG,
  BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_SCHEMAS,
} from '../../src/product/blackBoxDarwinDurablePublisherV1.mjs';
import {
  BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_FEATURE_FLAG,
  BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS,
  createBlackBoxP0cAgeCliProviderV1,
  recoverBlackBoxStrictCapsuleV1,
} from '../../src/product/blackBoxStrictCapsuleRecoverV1.mjs';
import {
  BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_CODES,
  BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_FEATURE_FLAG,
  BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_SCHEMAS,
  buildBlackBoxManualCoreCapsuleKitV1,
} from '../../src/product/blackBoxManualCoreCapsuleKitV1.mjs';

const TASK_ID = 'F3_BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1';
const DEFAULT_AGE_ROOT = '/Volumes/T7-Secure/storage/yalken/toolchains/age-v1.3.1-darwin-arm64';
const DEFAULT_EVIDENCE_ROOT = '/Volumes/T7-Secure/storage/yalken/evidence/f3-manual-core-capsule-kit-v1';

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Buffer(bytes) {
  return `sha256:${crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex')}`;
}

async function sha256File(filePath) {
  return sha256Buffer(await fs.readFile(filePath));
}

async function readTrim(filePath) {
  return (await fs.readFile(filePath, 'utf8')).trim();
}

function timestamp() {
  return new Date().toISOString().replaceAll('-', '').replaceAll(':', '').replace(/\.\d{3}Z$/u, 'Z');
}

function runCli(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => child.kill('SIGKILL'), options.timeoutMs || 15000);
    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ status: -1, stdout: Buffer.concat(stdout), stderr: Buffer.from(String(error.message)) });
    });
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({ status, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) });
    });
    if (options.input) child.stdin.end(options.input);
    else child.stdin.end();
  });
}

async function buildProviderPin(ageRoot) {
  const providerBinDir = await readTrim(path.join(ageRoot, 'provenance', 'provider-bin-dir.txt'));
  const agePath = path.join(providerBinDir, 'age');
  const ageInspectPath = path.join(providerBinDir, 'age-inspect');
  return {
    schemaVersion: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.providerPin,
    kind: 'OFFICIAL_AGE_CLI',
    providerId: 'filosottile-age-v1.3.1-darwin-arm64',
    version: 'v1.3.1',
    platform: 'darwin-arm64',
    releaseUrl: 'https://github.com/FiloSottile/age/releases/tag/v1.3.1',
    artifactUrl: 'https://github.com/FiloSottile/age/releases/download/v1.3.1/age-v1.3.1-darwin-arm64.tar.gz',
    artifactSha256: await sha256File(path.join(ageRoot, 'downloads', 'age-v1.3.1-darwin-arm64.tar.gz')),
    proofSha256: await sha256File(path.join(ageRoot, 'downloads', 'age-v1.3.1-darwin-arm64.tar.gz.proof')),
    sigsum: {
      verified: true,
      policy: 'sigsum-generic-2025-1',
      keyDigest: await sha256File(path.join(ageRoot, 'provenance', 'age-sigsum-key.pub')),
    },
    executables: {
      agePath,
      ageSha256: await sha256File(agePath),
      ageInspectPath,
      ageInspectSha256: await sha256File(ageInspectPath),
    },
  };
}

async function generateSyntheticIdentity(ageKeygenPath, tempDir, label) {
  const identityPath = path.join(tempDir, `${label}.identity.txt`);
  const result = await runCli(ageKeygenPath, ['-o', identityPath]);
  if (result.status !== 0) throw new Error(`AGE_KEYGEN_FAILED:${result.stderr.toString('utf8')}`);
  const publicKey = result.stderr.toString('utf8')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('Public key: '))
    ?.slice('Public key: '.length);
  if (!publicKey || !publicKey.startsWith('age1')) throw new Error('AGE_KEYGEN_PUBLIC_KEY_PARSE_FAILED');
  const secretBytes = await fs.readFile(identityPath);
  return {
    recipient: {
      schemaVersion: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.recipient,
      type: 'AGE_X25519_RECIPIENT',
      publicKey,
      fingerprint: sha256Buffer(Buffer.from(publicKey, 'utf8')),
    },
    identity: {
      schemaVersion: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.identity,
      type: 'AGE_X25519_IDENTITY',
      secretKeyBase64: secretBytes.toString('base64'),
      fingerprint: sha256Buffer(Buffer.from(publicKey, 'utf8')),
    },
    identityPath,
  };
}

function sourceTextDigest(text) {
  return sha256Buffer(Buffer.from(String(text), 'utf8'));
}

function makeCore(projectId = 'project-manual-core-physical', rootId = 'root-manual-core') {
  const manifestObject = {
    schemaVersion: 'yalken.syntheticProjectManifest.v1',
    projectId,
    rootId,
    sceneOrder: ['scene-001', 'scene-002'],
    scenes: {
      'scene-001': { title: 'Opening', bindingKey: 'file:scenes/scene-001.json' },
      'scene-002': { title: 'Unicode', bindingKey: 'file:scenes/scene-002.json' },
    },
    notesOrder: [],
    historyOrder: [],
  };
  const manifestText = stableJson(manifestObject);
  const sceneOne = 'Disposable manual capsule fixture. Привет مرحبا שלום 漢字 👩‍💻';
  const sceneTwo = 'Recovery kit preview stays import-as-new only; live overwrite is denied.';
  return {
    schemaVersion: BLACK_BOX_CORE_SOURCE_ADAPTER_V1_SCHEMAS.coreSnapshot,
    manifest: {
      kind: 'PROJECT_MANIFEST',
      documentId: 'project-manifest',
      bindingKey: 'file:project.json',
      treeNodeId: createDeterministicTreeNodeId(projectId, 'file:project.json'),
      sourceText: manifestText,
      sourceTextDigest: sourceTextDigest(manifestText),
    },
    items: [
      {
        kind: 'SCENE_DOCUMENT',
        documentId: 'scene-001',
        bindingKey: 'file:scenes/scene-001.json',
        treeNodeId: createDeterministicTreeNodeId(projectId, 'file:scenes/scene-001.json'),
        ordinal: 0,
        sourceText: sceneOne,
        sourceTextDigest: sourceTextDigest(sceneOne),
      },
      {
        kind: 'SCENE_DOCUMENT',
        documentId: 'scene-002',
        bindingKey: 'file:scenes/scene-002.json',
        treeNodeId: createDeterministicTreeNodeId(projectId, 'file:scenes/scene-002.json'),
        ordinal: 1,
        sourceText: sceneTwo,
        sourceTextDigest: sourceTextDigest(sceneTwo),
      },
    ],
    expectedCounts: {
      projectManifest: 1,
      sceneDocuments: 2,
      notesDocuments: 0,
      historyDocuments: 0,
      totalItems: 3,
    },
  };
}

function makeSourceSnapshot(overrides = {}) {
  const binding = {
    projectId: overrides.projectId || 'project-manual-core-physical',
    rootId: overrides.rootId || 'root-manual-core',
    documentId: overrides.documentId || 'black-box-core',
    canonicalRevision: overrides.canonicalRevision || 'canon-manual-kit-0001',
    workingRevision: overrides.workingRevision || 'work-manual-kit-0001',
    generation: overrides.generation || 'gen-manual-kit-0001',
    sourceDigest: `sha256:${'0'.repeat(64)}`,
    ...(overrides.binding || {}),
  };
  const core = overrides.core || makeCore(binding.projectId, binding.rootId);
  binding.sourceDigest = overrides.sourceDigest || computeBlackBoxCoreSourceDigestV1(core, binding);
  return {
    schemaVersion: BLACK_BOX_CORE_SOURCE_ADAPTER_V1_SCHEMAS.sourceSnapshot,
    authority: {
      decision: overrides.decision || 'ALLOW',
      mayWrite: overrides.mayWrite ?? false,
      queryId: 'query.blackBoxManualCoreCapsuleKit.readSourceSnapshot.physical.v1',
    },
    expected: binding,
    current: {
      ...binding,
      dirtyState: overrides.dirtyState || 'CLEAN',
      ...(overrides.current || {}),
    },
    core,
  };
}

function featureFlags() {
  return {
    [BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_FEATURE_FLAG]: true,
    [BLACK_BOX_CORE_SOURCE_ADAPTER_V1_FEATURE_FLAG]: true,
    [BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_FEATURE_FLAG]: true,
    [BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_FEATURE_FLAG]: true,
  };
}

function makeRequest({ providerPin, recipient, identity, target, sourceSnapshot = makeSourceSnapshot(), overrides = {} }) {
  return {
    schemaVersion: BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_SCHEMAS.request,
    featureFlags: featureFlags(),
    sourceSnapshot,
    providerPin,
    recipient,
    auditIdentity: identity,
    target,
    ...overrides,
  };
}

function recoverExpectations() {
  return {
    importMode: 'IMPORT_AS_NEW_PROJECT_ONLY',
    liveProjectOverwrite: false,
    ownerKeyOutsideBuilder: true,
    quarantineRequired: true,
    requireCiphertextBoundManifest: true,
    requireNoPlaintextInReceipt: true,
    requireProviderExact: true,
    requireStandardAgeV1: true,
    requireX25519Recipient: true,
  };
}

function recoverRequest({ providerPin, capsule, identity }) {
  return {
    schemaVersion: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.recoverRequest,
    featureFlags: { [BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_FEATURE_FLAG]: true },
    providerPin,
    expectedSourceBinding: capsule.sourceBinding,
    capsule,
    identity,
    expectations: recoverExpectations(),
  };
}

function redactedKitResult(result) {
  return {
    ok: result.ok,
    decision: result.decision,
    code: result.code,
    recoveryKit: result.recoveryKit || null,
    receipt: result.receipt || null,
    reasons: result.reasons || [],
    sourceSetCode: result.sourceSetCode || '',
    capsuleCode: result.capsuleCode || '',
    publishCode: result.publishCode || '',
  };
}

function redactedRecoverResult(result) {
  return {
    ok: result.ok,
    decision: result.decision,
    code: result.code,
    receipt: result.receipt || null,
    recoverPlan: result.recoverPlan ? {
      schemaVersion: result.recoverPlan.schemaVersion,
      importMode: result.recoverPlan.importMode,
      liveProjectOverwrite: result.recoverPlan.liveProjectOverwrite,
      quarantine: result.recoverPlan.quarantine,
      preview: result.recoverPlan.preview,
    } : null,
    reasons: result.reasons || [],
  };
}

async function cleanupIdentity(identityInfo) {
  if (identityInfo?.identityPath) await fs.unlink(identityInfo.identityPath).catch(() => {});
}

async function main() {
  const ageRoot = process.env.YALKEN_P0C_AGE_ROOT || DEFAULT_AGE_ROOT;
  const evidenceRoot = process.env.YALKEN_MANUAL_KIT_EVIDENCE_ROOT || DEFAULT_EVIDENCE_ROOT;
  const runId = process.env.YALKEN_MANUAL_KIT_RUN_ID || timestamp();
  const evidenceDir = path.join(evidenceRoot, runId);
  await fs.mkdir(evidenceRoot, { recursive: true });
  await fs.mkdir(evidenceDir, { recursive: false });
  const tempDir = await fs.mkdtemp(path.join(evidenceDir, 'tmp-'));
  const targetDir = path.join(evidenceDir, 'published');
  await fs.mkdir(targetDir);

  let cleanupOk = false;
  const started = performance.now();
  try {
    const providerBinDir = await readTrim(path.join(ageRoot, 'provenance', 'provider-bin-dir.txt'));
    const providerPin = await buildProviderPin(ageRoot);
    const provider = createBlackBoxP0cAgeCliProviderV1(providerPin, { tempRoot: tempDir });
    const primary = await generateSyntheticIdentity(path.join(providerBinDir, 'age-keygen'), tempDir, 'primary');
    const wrong = await generateSyntheticIdentity(path.join(providerBinDir, 'age-keygen'), tempDir, 'wrong');
    const target = {
      schemaVersion: BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_SCHEMAS.target,
      platform: 'darwin',
      directoryPath: targetDir,
      fileName: 'manual-core-kit-physical.yalken-capsule',
    };

    const build = await buildBlackBoxManualCoreCapsuleKitV1(makeRequest({
      providerPin,
      recipient: primary.recipient,
      identity: primary.identity,
      target,
    }), { ageProvider: provider });
    const artifactPath = path.join(targetDir, target.fileName);
    const artifactBytes = build.ok ? await fs.readFile(artifactPath) : Buffer.alloc(0);
    const capsule = build.ok ? JSON.parse(artifactBytes.toString('utf8')) : null;
    const recover = capsule
      ? await recoverBlackBoxStrictCapsuleV1(recoverRequest({ providerPin, capsule, identity: primary.identity }), { ageProvider: provider })
      : { ok: false, code: 'BUILD_NOT_READY' };

    const negatives = [];
    if (capsule) {
      negatives.push({
        id: 'wrong-identity',
        result: redactedRecoverResult(await recoverBlackBoxStrictCapsuleV1(recoverRequest({ providerPin, capsule, identity: wrong.identity }), { ageProvider: provider })),
      });
    }
    const stale = await buildBlackBoxManualCoreCapsuleKitV1(makeRequest({
      providerPin,
      recipient: primary.recipient,
      identity: primary.identity,
      target: {
        ...target,
        fileName: 'manual-core-kit-stale.yalken-capsule',
      },
      sourceSnapshot: makeSourceSnapshot({ current: { canonicalRevision: 'canon-stale' } }),
    }), { ageProvider: provider });
    negatives.push({ id: 'stale-source', result: redactedKitResult(stale) });

    const providerMismatchPin = {
      ...providerPin,
      executables: {
        ...providerPin.executables,
        ageSha256: `sha256:${'9'.repeat(64)}`,
      },
    };
    const providerMismatch = await buildBlackBoxManualCoreCapsuleKitV1(makeRequest({
      providerPin: providerMismatchPin,
      recipient: primary.recipient,
      identity: primary.identity,
      target: {
        ...target,
        fileName: 'manual-core-kit-provider-mismatch.yalken-capsule',
      },
    }), { ageProvider: provider });
    negatives.push({ id: 'provider-pin-mismatch', result: redactedKitResult(providerMismatch) });

    const existingTarget = {
      ...target,
      fileName: 'manual-core-kit-existing.yalken-capsule',
    };
    await fs.writeFile(path.join(targetDir, existingTarget.fileName), 'pre-existing-owner-bytes', 'utf8');
    const publishConflict = await buildBlackBoxManualCoreCapsuleKitV1(makeRequest({
      providerPin,
      recipient: primary.recipient,
      identity: primary.identity,
      target: existingTarget,
    }), { ageProvider: provider });
    negatives.push({
      id: 'publish-target-exists',
      result: redactedKitResult(publishConflict),
      preservedExistingBytes: (await fs.readFile(path.join(targetDir, existingTarget.fileName), 'utf8')) === 'pre-existing-owner-bytes',
    });

    await cleanupIdentity(primary);
    await cleanupIdentity(wrong);
    await fs.rm(tempDir, { recursive: true, force: true });
    cleanupOk = true;

    const negativeFailures = negatives.filter((row) => row.result.ok === true || row.result.decision === 'PASS' || row.preservedExistingBytes === false);
    const leakagePayload = JSON.stringify({
      build: redactedKitResult(build),
      recover: redactedRecoverResult(recover),
      negatives,
    });
    const leakageDetected = /AGE-SECRET-KEY|sourceText|Disposable manual capsule fixture|bytesBase64/iu.test(leakagePayload);
    const evidence = {
      schemaVersion: 'yalken.blackBoxManualCoreCapsuleKit.physicalEvidence.v1',
      taskId: TASK_ID,
      runId,
      createdAtUtc: new Date().toISOString(),
      providerPin: {
        providerId: providerPin.providerId,
        version: providerPin.version,
        platform: providerPin.platform,
        artifactSha256: providerPin.artifactSha256,
        proofSha256: providerPin.proofSha256,
        sigsumVerified: providerPin.sigsum.verified,
        ageSha256: providerPin.executables.ageSha256,
        ageInspectSha256: providerPin.executables.ageInspectSha256,
      },
      artifact: {
        path: artifactPath,
        byteLength: artifactBytes.byteLength,
        sha256: artifactBytes.byteLength > 0 ? sha256Buffer(artifactBytes) : '',
      },
      positive: {
        build: redactedKitResult(build),
        recover: redactedRecoverResult(recover),
      },
      negatives,
      negativeCases: negatives.length,
      negativeFailures: negativeFailures.length,
      leakageDetected,
      cleanupOk,
      elapsedMs: performance.now() - started,
      claimBoundary: 'Disposable synthetic CORE capsule only; no user documents, no private manuscript, no live project overwrite, no Disaster Ready claim.',
    };
    const evidencePath = path.join(evidenceDir, 'physical-evidence.json');
    await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
    const evidenceSha256 = await sha256File(evidencePath);
    const ok = build.ok === true
      && build.code === BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_CODES.KIT_CREATED
      && recover.ok === true
      && negativeFailures.length === 0
      && leakageDetected === false
      && cleanupOk === true;
    const summary = {
      ok,
      evidencePath,
      evidenceSha256,
      positiveBuild: build.ok === true,
      positiveRecover: recover.ok === true,
      artifactSha256: evidence.artifact.sha256,
      negativeCases: negatives.length,
      negativeFailures: negativeFailures.length,
      leakageDetected,
      cleanupOk,
      elapsedMs: evidence.elapsedMs,
    };
    console.log(JSON.stringify(summary, null, 2));
    if (!ok) process.exitCode = 1;
  } finally {
    if (!cleanupOk) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

await main();
