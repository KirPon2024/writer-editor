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
} from '../../src/product/blackBoxStrictCapsuleRecoverV1.mjs';
import {
  BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_FEATURE_FLAG,
  BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_SCHEMAS,
  buildBlackBoxManualCoreCapsuleKitV1,
} from '../../src/product/blackBoxManualCoreCapsuleKitV1.mjs';
import {
  BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES,
  BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_FEATURE_FLAG,
  BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_SCHEMAS,
  writeBlackBoxImportAsNewProjectV1,
} from '../../src/product/blackBoxImportAsNewProjectWriterV1.mjs';

const TASK_ID = 'F3_BLACK_BOX_SYNTHETIC_INDEPENDENT_RESTORE_DRILL_V1';
const DEFAULT_AGE_ROOT = '/Volumes/T7-Secure/storage/yalken/toolchains/age-v1.3.1-darwin-arm64';
const DEFAULT_EVIDENCE_ROOT = '/Volumes/T7-Secure/storage/yalken/evidence/f3-synthetic-independent-restore-drill-v1';
const IMPORT_PLAN_FLAG = 'yalken.blackBox.importAsNewRecoveryPlan.v1';

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

function textDigest(text) {
  return sha256Buffer(Buffer.from(String(text), 'utf8'));
}

function makeCore(projectId = 'project-independent-restore-drill', rootId = 'root-independent-restore-drill', overrides = {}) {
  const manifestObject = {
    schemaVersion: 'yalken.syntheticProjectManifest.v1',
    projectId,
    rootId,
    sceneOrder: ['scene-alpha', 'scene-beta'],
    scenes: {
      'scene-alpha': { title: 'Alpha', bindingKey: 'file:scenes/scene-alpha.json' },
      'scene-beta': { title: 'Beta', bindingKey: 'file:scenes/scene-beta.json' },
    },
    notesOrder: [],
    historyOrder: [],
  };
  const manifestText = stableJson(manifestObject);
  const sceneAlpha = 'Independent restore synthetic alpha. Привет مرحبا שלום 漢字 👩‍💻';
  const sceneBeta = 'Import-as-new writer must create a separate disposable project.';
  const defaultItems = [
    {
      kind: 'SCENE_DOCUMENT',
      documentId: 'scene-alpha',
      bindingKey: 'file:scenes/scene-alpha.json',
      treeNodeId: createDeterministicTreeNodeId(projectId, 'file:scenes/scene-alpha.json'),
      ordinal: 0,
      sourceText: sceneAlpha,
      sourceTextDigest: textDigest(sceneAlpha),
    },
    {
      kind: 'SCENE_DOCUMENT',
      documentId: 'scene-beta',
      bindingKey: 'file:scenes/scene-beta.json',
      treeNodeId: createDeterministicTreeNodeId(projectId, 'file:scenes/scene-beta.json'),
      ordinal: 1,
      sourceText: sceneBeta,
      sourceTextDigest: textDigest(sceneBeta),
    },
  ];
  return {
    schemaVersion: BLACK_BOX_CORE_SOURCE_ADAPTER_V1_SCHEMAS.coreSnapshot,
    manifest: {
      kind: 'PROJECT_MANIFEST',
      documentId: 'project-manifest',
      bindingKey: 'file:project.json',
      treeNodeId: createDeterministicTreeNodeId(projectId, 'file:project.json'),
      sourceText: manifestText,
      sourceTextDigest: textDigest(manifestText),
    },
    items: overrides.items || defaultItems,
    expectedCounts: {
      projectManifest: 1,
      sceneDocuments: (overrides.items || defaultItems).length,
      notesDocuments: 0,
      historyDocuments: 0,
      totalItems: (overrides.items || defaultItems).length + 1,
    },
  };
}

function makeSourceSnapshot(overrides = {}) {
  const binding = {
    projectId: overrides.projectId || 'project-independent-restore-drill',
    rootId: overrides.rootId || 'root-independent-restore-drill',
    documentId: overrides.documentId || 'black-box-core',
    canonicalRevision: overrides.canonicalRevision || 'canon-independent-restore-0001',
    workingRevision: overrides.workingRevision || 'work-independent-restore-0001',
    generation: overrides.generation || 'gen-independent-restore-0001',
    sourceDigest: `sha256:${'0'.repeat(64)}`,
    ...(overrides.binding || {}),
  };
  const core = overrides.core || makeCore(binding.projectId, binding.rootId, overrides.coreOverrides || {});
  binding.sourceDigest = overrides.sourceDigest || computeBlackBoxCoreSourceDigestV1(core, binding);
  return {
    schemaVersion: BLACK_BOX_CORE_SOURCE_ADAPTER_V1_SCHEMAS.sourceSnapshot,
    authority: {
      decision: overrides.decision || 'ALLOW',
      mayWrite: overrides.mayWrite ?? false,
      queryId: 'query.blackBoxSyntheticIndependentRestoreDrill.readSourceSnapshot.v1',
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
    [BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_FEATURE_FLAG]: true,
    [IMPORT_PLAN_FLAG]: true,
  };
}

function manualKitRequest({ providerPin, recipient, identity, target, sourceSnapshot = makeSourceSnapshot() }) {
  return {
    schemaVersion: BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_SCHEMAS.request,
    featureFlags: featureFlags(),
    sourceSnapshot,
    providerPin,
    recipient,
    auditIdentity: identity,
    target,
  };
}

function writerExpectations() {
  return {
    importMode: 'IMPORT_AS_NEW_PROJECT_ONLY',
    liveProjectOverwrite: false,
    requireCreateOnly: true,
    requireNoPlaintextInReceipt: true,
    requireP0cSink: true,
    requireReadback: true,
  };
}

function writerRequest({ providerPin, capsule, identity, parentDirectoryPath, projectDirectoryName }) {
  return {
    schemaVersion: BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_SCHEMAS.request,
    featureFlags: featureFlags(),
    recoveryRequest: {
      schemaVersion: 'yalken.blackBoxImportAsNewRecoveryPlan.request.v1',
      featureFlags: featureFlags(),
      providerPin,
      expectedSourceBinding: capsule.sourceBinding,
      capsule,
      identity,
      expectations: {
        importMode: 'IMPORT_AS_NEW_PROJECT_ONLY',
        liveProjectOverwrite: false,
        quarantineRequired: true,
        requireNoPlaintextInReceipt: true,
        requireProviderExact: true,
        requireP0cRecoverExecution: true,
      },
    },
    target: {
      schemaVersion: BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_SCHEMAS.target,
      parentDirectoryPath,
      projectDirectoryName,
      platform: process.platform,
    },
    expectations: writerExpectations(),
  };
}

function redactedDecision(result) {
  return {
    ok: result?.ok === true,
    decision: result?.decision || '',
    code: result?.code || '',
    reasons: Array.isArray(result?.reasons) ? result.reasons : [],
  };
}

async function cleanupIdentity(identityInfo) {
  if (identityInfo?.identityPath) await fs.unlink(identityInfo.identityPath).catch(() => {});
}

async function readImportedHashes(projectRoot) {
  const manifest = await fs.readFile(path.join(projectRoot, 'project.json'), 'utf8');
  const alpha = await fs.readFile(path.join(projectRoot, 'scenes', 'scene-alpha.json'), 'utf8');
  const beta = await fs.readFile(path.join(projectRoot, 'scenes', 'scene-beta.json'), 'utf8');
  const receipt = await fs.readFile(path.join(projectRoot, '.yalken-black-box-import-receipt.json'), 'utf8');
  return {
    manifestSha256: sha256Buffer(Buffer.from(manifest, 'utf8')),
    alphaSha256: sha256Buffer(Buffer.from(alpha, 'utf8')),
    betaSha256: sha256Buffer(Buffer.from(beta, 'utf8')),
    receiptSha256: sha256Buffer(Buffer.from(receipt, 'utf8')),
    leakageDetected: /AGE-SECRET-KEY|bytesBase64|BLACK_BOX_CORE_GENOME_V1|sourceText|Independent restore synthetic alpha|Import-as-new writer must create/iu.test(receipt),
  };
}

async function main() {
  const ageRoot = process.env.YALKEN_P0C_AGE_ROOT || DEFAULT_AGE_ROOT;
  const evidenceRoot = process.env.YALKEN_SYNTHETIC_RESTORE_EVIDENCE_ROOT || DEFAULT_EVIDENCE_ROOT;
  const runId = process.env.YALKEN_SYNTHETIC_RESTORE_RUN_ID || timestamp();
  const evidenceDir = path.join(evidenceRoot, runId);
  await fs.mkdir(evidenceRoot, { recursive: true });
  await fs.mkdir(evidenceDir, { recursive: false });
  const workDir = await fs.mkdtemp(path.join(evidenceDir, 'work-'));
  const capsuleDir = path.join(workDir, 'capsule-artifact');
  const restoreParent = path.join(workDir, 'restored-projects');
  await fs.mkdir(capsuleDir);
  await fs.mkdir(restoreParent);

  let cleanupOk = false;
  const started = performance.now();
  try {
    const providerPin = await buildProviderPin(ageRoot);
    const providerBinDir = await readTrim(path.join(ageRoot, 'provenance', 'provider-bin-dir.txt'));
    const ageKeygenPath = path.join(providerBinDir, 'age-keygen');
    const primary = await generateSyntheticIdentity(ageKeygenPath, workDir, 'primary');
    const wrong = await generateSyntheticIdentity(ageKeygenPath, workDir, 'wrong');
    const provider = createBlackBoxP0cAgeCliProviderV1(providerPin, { tempRoot: workDir });
    const target = {
      schemaVersion: BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_SCHEMAS.target,
      platform: 'darwin',
      directoryPath: capsuleDir,
      fileName: 'synthetic-independent-restore.yalken-capsule',
    };

    const sourceSnapshot = makeSourceSnapshot();
    const manualKit = await buildBlackBoxManualCoreCapsuleKitV1(manualKitRequest({
      providerPin,
      recipient: primary.recipient,
      identity: primary.identity,
      target,
      sourceSnapshot,
    }), { ageProvider: provider });
    const artifactPath = path.join(capsuleDir, target.fileName);
    const artifactBytes = manualKit.ok ? await fs.readFile(artifactPath) : Buffer.alloc(0);
    const artifactSha256 = artifactBytes.length > 0 ? sha256Buffer(artifactBytes) : '';
    const capsule = artifactBytes.length > 0 ? JSON.parse(artifactBytes.toString('utf8')) : null;

    const positive = capsule
      ? await writeBlackBoxImportAsNewProjectV1(writerRequest({
        providerPin,
        capsule,
        identity: primary.identity,
        parentDirectoryPath: restoreParent,
        projectDirectoryName: 'RecoveredIndependentSyntheticProject',
      }), { ageProvider: provider })
      : { ok: false, decision: 'DENY', code: 'CAPSULE_NOT_CREATED' };
    const projectRoot = path.join(restoreParent, 'RecoveredIndependentSyntheticProject');
    const readback = positive.ok ? await readImportedHashes(projectRoot) : null;

    const negatives = [];
    if (capsule) {
      negatives.push({
        id: 'wrong-identity',
        result: redactedDecision(await writeBlackBoxImportAsNewProjectV1(writerRequest({
          providerPin,
          capsule,
          identity: wrong.identity,
          parentDirectoryPath: restoreParent,
          projectDirectoryName: 'WrongIdentityProject',
        }), { ageProvider: provider })),
      });
      negatives.push({
        id: 'target-exists',
        result: redactedDecision(await writeBlackBoxImportAsNewProjectV1(writerRequest({
          providerPin,
          capsule,
          identity: primary.identity,
          parentDirectoryPath: restoreParent,
          projectDirectoryName: 'RecoveredIndependentSyntheticProject',
        }), { ageProvider: provider })),
      });
      const tamperedCapsule = {
        ...capsule,
        manifest: {
          ...capsule.manifest,
          ciphertextSha256: `sha256:${'9'.repeat(64)}`,
        },
      };
      negatives.push({
        id: 'tampered-artifact-digest',
        result: redactedDecision(await writeBlackBoxImportAsNewProjectV1(writerRequest({
          providerPin,
          capsule: tamperedCapsule,
          identity: primary.identity,
          parentDirectoryPath: restoreParent,
          projectDirectoryName: 'TamperedDigestProject',
        }), { ageProvider: provider })),
      });
    }
    const staleBuild = await buildBlackBoxManualCoreCapsuleKitV1(manualKitRequest({
      providerPin,
      recipient: primary.recipient,
      identity: primary.identity,
      target: {
        ...target,
        fileName: 'synthetic-independent-restore-stale.yalken-capsule',
      },
      sourceSnapshot: makeSourceSnapshot({ current: { canonicalRevision: 'canon-independent-restore-stale' } }),
    }), { ageProvider: provider });
    negatives.push({ id: 'stale-source-snapshot', result: redactedDecision(staleBuild) });

    const maliciousCore = makeCore('project-independent-restore-drill', 'root-independent-restore-drill', {
      items: [
        {
          kind: 'SCENE_DOCUMENT',
          documentId: 'escape',
          bindingKey: 'file:../escape.txt',
          treeNodeId: createDeterministicTreeNodeId('project-independent-restore-drill', 'file:../escape.txt'),
          ordinal: 0,
          sourceText: 'escape',
          sourceTextDigest: textDigest('escape'),
        },
      ],
    });
    const maliciousBuild = await buildBlackBoxManualCoreCapsuleKitV1(manualKitRequest({
      providerPin,
      recipient: primary.recipient,
      identity: primary.identity,
      target: {
        ...target,
        fileName: 'synthetic-independent-restore-malicious.yalken-capsule',
      },
      sourceSnapshot: makeSourceSnapshot({ core: maliciousCore }),
    }), { ageProvider: provider });
    if (maliciousBuild.ok === true) {
      const maliciousBytes = await fs.readFile(path.join(capsuleDir, 'synthetic-independent-restore-malicious.yalken-capsule'));
      const maliciousCapsule = JSON.parse(maliciousBytes.toString('utf8'));
      negatives.push({
        id: 'path-traversal-core',
        result: redactedDecision(await writeBlackBoxImportAsNewProjectV1(writerRequest({
          providerPin,
          capsule: maliciousCapsule,
          identity: primary.identity,
          parentDirectoryPath: restoreParent,
          projectDirectoryName: 'PathTraversalProject',
        }), { ageProvider: provider })),
      });
    } else {
      negatives.push({ id: 'path-traversal-core', result: redactedDecision(maliciousBuild) });
    }

    const negativeFailures = negatives.filter((entry) => entry.result.ok === true || entry.result.decision === 'PASS');
    const leakagePayload = JSON.stringify({
      manualKit: redactedDecision(manualKit),
      positive: redactedDecision(positive),
      readback,
      negatives,
    });
    const leakageDetected = /AGE-SECRET-KEY|bytesBase64|BLACK_BOX_CORE_GENOME_V1|sourceText|Independent restore synthetic alpha|Import-as-new writer must create/iu.test(leakagePayload)
      || readback?.leakageDetected === true;

    await cleanupIdentity(primary);
    await cleanupIdentity(wrong);
    await fs.rm(workDir, { recursive: true, force: true });
    cleanupOk = true;

    const report = {
      schemaVersion: 'yalken.blackBoxSyntheticIndependentRestoreDrill.physicalEvidence.v1',
      taskId: TASK_ID,
      runId,
      createdAtUtc: new Date().toISOString(),
      status: manualKit.ok === true
        && positive.ok === true
        && positive.code === BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.PROJECT_WRITTEN
        && negativeFailures.length === 0
        && leakageDetected === false
        && cleanupOk === true
        ? 'PASS'
        : 'FAIL',
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
      positive: {
        manualKit: redactedDecision(manualKit),
        artifactSha256,
        importWriter: redactedDecision(positive),
        importedProjectFileCount: positive.project?.fileCount || 0,
        readback,
      },
      negatives,
      negativeCases: negatives.length,
      negativeFailures: negativeFailures.length,
      leakageDetected,
      cleanupOk,
      elapsedMs: performance.now() - started,
      userDocumentsTouched: false,
      liveProjectOverwrite: false,
      productRuntimeWiringChanged: false,
      commandKernelWiringChanged: false,
      productUiWiringChanged: false,
      claimBoundary: 'Disposable synthetic independent restore drill only; no user documents, no private manuscript, no live project overwrite, no product command or UI wiring, no real owner-key drill, no off-host restore and no Disaster Ready claim.',
    };
    const reportPath = path.join(evidenceDir, 'physical-evidence.json');
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    const reportSha256 = await sha256File(reportPath);
    console.log(JSON.stringify({
      reportPath,
      reportSha256,
      status: report.status,
      positiveManualKit: manualKit.ok === true,
      positiveImportWriter: positive.ok === true,
      importedProjectFileCount: report.positive.importedProjectFileCount,
      negativeCases: report.negativeCases,
      negativeFailures: report.negativeFailures,
      leakageDetected,
      cleanupOk,
    }, null, 2));
    if (report.status !== 'PASS') process.exitCode = 1;
  } finally {
    if (!cleanupOk) await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

await main();
