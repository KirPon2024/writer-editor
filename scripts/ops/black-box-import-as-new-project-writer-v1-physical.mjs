#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import {
  BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_FEATURE_FLAG,
  BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS,
  buildBlackBoxStrictCapsuleV1,
  createBlackBoxP0cAgeCliProviderV1,
  createBlackBoxP0cSourceFenceTokenV1,
} from '../../src/product/blackBoxStrictCapsuleRecoverV1.mjs';
import {
  BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES,
  BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_FEATURE_FLAG,
  BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_SCHEMAS,
  writeBlackBoxImportAsNewProjectV1,
} from '../../src/product/blackBoxImportAsNewProjectWriterV1.mjs';

const TASK_ID = 'F3_IMPORT_AS_NEW_PROJECT_WRITER_V1';
const DEFAULT_AGE_ROOT = '/Volumes/T7-Secure/storage/yalken/toolchains/age-v1.3.1-darwin-arm64';
const DEFAULT_EVIDENCE_ROOT = '/Volumes/T7-Secure/storage/yalken/evidence/f3-import-as-new-project-writer-v1';

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
  };
}

function sourceBinding() {
  return {
    schemaVersion: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.sourceBinding,
    projectId: 'proj_blackbox_import_writer_physical',
    rootId: 'root-blackbox-import-writer-physical',
    documentId: 'manuscript/core',
    canonicalRevision: 'canon-import-writer-physical-0001',
    workingRevision: 'work-import-writer-physical-0001',
    generation: 'gen-import-writer-physical-0001',
    sourceSetDigest: `sha256:${'d'.repeat(64)}`,
  };
}

function sourceFence(binding) {
  return {
    authority: {
      commandId: 'read-source-snapshot-black-box-import-writer-physical',
      decision: 'ALLOW',
      mayWrite: false,
    },
    current: {
      projectId: binding.projectId,
      rootId: binding.rootId,
      documentId: binding.documentId,
      canonicalRevision: binding.canonicalRevision,
      workingRevision: binding.workingRevision,
      generation: binding.generation,
      sourceDigest: binding.sourceSetDigest,
      dirtyState: 'CLEAN',
    },
    expected: {
      projectId: binding.projectId,
      rootId: binding.rootId,
      documentId: binding.documentId,
      canonicalRevision: binding.canonicalRevision,
      workingRevision: binding.workingRevision,
      sourceDigest: binding.sourceSetDigest,
    },
    fence: createBlackBoxP0cSourceFenceTokenV1(binding),
  };
}

function coreGenome(binding, overrides = {}) {
  const manifestText = '{"projectId":"proj_blackbox_import_writer_physical","projectName":"Physical Synthetic","schemaVersion":1}';
  const sceneText = 'Physical synthetic scene one.\nLine two.';
  const items = overrides.items || [
    {
      kind: 'PROJECT_MANIFEST',
      documentId: 'project-manifest',
      bindingKey: 'file:project.craftsman.json',
      ordinal: 0,
      sourceText: manifestText,
      sourceTextDigest: sha256Buffer(Buffer.from(manifestText, 'utf8')),
      byteLength: Buffer.byteLength(manifestText, 'utf8'),
    },
    {
      kind: 'SCENE_DOCUMENT',
      documentId: 'scene-physical',
      bindingKey: 'file:roman/Physical.txt',
      ordinal: 1,
      sourceText: sceneText,
      sourceTextDigest: sha256Buffer(Buffer.from(sceneText, 'utf8')),
      byteLength: Buffer.byteLength(sceneText, 'utf8'),
    },
  ];
  return {
    schemaVersion: 'yalken.blackBoxManualCoreCapsuleKit.coreGenome.v1',
    sourceBinding: binding,
    sourceSetDigest: binding.sourceSetDigest,
    accounting: {
      projectManifest: 1,
      sceneDocuments: items.length - 1,
      notesDocuments: 0,
      historyDocuments: 0,
      totalItems: items.length,
    },
    items,
    recovery: {
      importMode: 'IMPORT_AS_NEW_PROJECT_ONLY',
      liveProjectOverwrite: false,
      ownerKeyOutsideBuilder: true,
      quarantineRequired: true,
    },
  };
}

function corePayload(binding, genome) {
  const bytes = Buffer.from(stableJson(genome), 'utf8');
  return {
    schemaVersion: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.corePayload,
    type: 'BLACK_BOX_CORE_GENOME_V1',
    byteLength: bytes.byteLength,
    bytesBase64: bytes.toString('base64'),
    sha256: sha256Buffer(bytes),
    sourceSetDigest: binding.sourceSetDigest,
  };
}

function p0cExpectations() {
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

function writerRequest({ providerPin, capsule, identity, binding, parentDirectoryPath, projectDirectoryName }) {
  return {
    schemaVersion: BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_SCHEMAS.request,
    featureFlags: {
      [BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_FEATURE_FLAG]: true,
      'yalken.blackBox.importAsNewRecoveryPlan.v1': true,
      [BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_FEATURE_FLAG]: true,
    },
    recoveryRequest: {
      schemaVersion: 'yalken.blackBoxImportAsNewRecoveryPlan.request.v1',
      featureFlags: {
        'yalken.blackBox.importAsNewRecoveryPlan.v1': true,
        [BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_FEATURE_FLAG]: true,
      },
      providerPin,
      expectedSourceBinding: binding,
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

async function buildCapsule({ providerPin, provider, binding, identity, recipient, genome }) {
  return buildBlackBoxStrictCapsuleV1({
    schemaVersion: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.buildRequest,
    featureFlags: { [BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_FEATURE_FLAG]: true },
    providerPin,
    sourceBinding: binding,
    sourceFence: sourceFence(binding),
    auditIdentity: identity,
    recipient,
    corePayload: corePayload(binding, genome),
    expectations: p0cExpectations(),
  }, { ageProvider: provider });
}

async function main() {
  const ageRoot = process.env.YALKEN_AGE_ROOT || DEFAULT_AGE_ROOT;
  const evidenceRoot = process.env.YALKEN_EVIDENCE_ROOT || DEFAULT_EVIDENCE_ROOT;
  const runId = timestamp();
  const runRoot = path.join(evidenceRoot, runId);
  await fs.mkdir(runRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yalken-f3-import-writer-physical-'));
  const providerPin = await buildProviderPin(ageRoot);
  const providerBinDir = await readTrim(path.join(ageRoot, 'provenance', 'provider-bin-dir.txt'));
  const ageKeygenPath = path.join(providerBinDir, 'age-keygen');
  const identity = await generateSyntheticIdentity(ageKeygenPath, tempDir, 'writer');
  const binding = sourceBinding();
  const genome = coreGenome(binding);
  const provider = createBlackBoxP0cAgeCliProviderV1(providerPin, { tempRoot: tempDir });
  const built = await buildCapsule({
    providerPin,
    provider,
    binding,
    identity: identity.identity,
    recipient: identity.recipient,
    genome,
  });
  if (built.ok !== true) throw new Error(`BUILD_FAILED:${built.code}`);
  const targetParent = path.join(tempDir, 'targets');
  await fs.mkdir(targetParent, { recursive: true });
  const positive = await writeBlackBoxImportAsNewProjectV1(writerRequest({
    providerPin,
    capsule: built.capsule,
    identity: identity.identity,
    binding,
    parentDirectoryPath: targetParent,
    projectDirectoryName: 'PhysicalRecoveredProject',
  }), { ageProvider: provider });
  const projectRoot = path.join(targetParent, 'PhysicalRecoveredProject');
  const manifestReadback = await fs.readFile(path.join(projectRoot, 'project.craftsman.json'), 'utf8');
  const sceneReadback = await fs.readFile(path.join(projectRoot, 'roman', 'Physical.txt'), 'utf8');
  const receiptReadback = await fs.readFile(path.join(projectRoot, '.yalken-black-box-import-receipt.json'), 'utf8');
  const targetExists = await writeBlackBoxImportAsNewProjectV1(writerRequest({
    providerPin,
    capsule: built.capsule,
    identity: identity.identity,
    binding,
    parentDirectoryPath: targetParent,
    projectDirectoryName: 'PhysicalRecoveredProject',
  }), { ageProvider: provider });
  const malicious = coreGenome(binding, {
    items: [
      genome.items[0],
      {
        kind: 'SCENE_DOCUMENT',
        documentId: 'escape',
        bindingKey: 'file:../escape.txt',
        ordinal: 1,
        sourceText: 'escape',
        sourceTextDigest: sha256Buffer(Buffer.from('escape', 'utf8')),
        byteLength: Buffer.byteLength('escape', 'utf8'),
      },
    ],
  });
  const badBuilt = await buildCapsule({
    providerPin,
    provider,
    binding,
    identity: identity.identity,
    recipient: identity.recipient,
    genome: malicious,
  });
  if (badBuilt.ok !== true) throw new Error(`BAD_BUILD_FAILED:${badBuilt.code}`);
  const badPath = await writeBlackBoxImportAsNewProjectV1(writerRequest({
    providerPin,
    capsule: badBuilt.capsule,
    identity: identity.identity,
    binding,
    parentDirectoryPath: targetParent,
    projectDirectoryName: 'PhysicalRejectedProject',
  }), { ageProvider: provider });
  const cleanupOk = await fs.rm(tempDir, { recursive: true, force: true }).then(() => true, () => false);
  const report = {
    schemaVersion: 'yalken.blackBoxImportAsNewProjectWriter.physicalReport.v1',
    taskId: TASK_ID,
    runId,
    status: positive.ok === true
      && targetExists.code === BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.TARGET_EXISTS
      && badPath.code === BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.PATH_REJECTED
      && manifestReadback === genome.items[0].sourceText
      && sceneReadback === genome.items[1].sourceText
      && !/Physical synthetic scene|AGE-SECRET-KEY|bytesBase64|BLACK_BOX_CORE_GENOME_V1|sourceText/iu.test(JSON.stringify(positive))
      && !/Physical synthetic scene|AGE-SECRET-KEY|bytesBase64|BLACK_BOX_CORE_GENOME_V1|sourceText/iu.test(receiptReadback)
      && cleanupOk
      ? 'PASS'
      : 'FAIL',
    positiveWritten: positive.ok === true,
    writtenFileCount: positive.project?.fileCount || 0,
    manifestReadbackSha256: sha256Buffer(Buffer.from(manifestReadback, 'utf8')),
    sceneReadbackSha256: sha256Buffer(Buffer.from(sceneReadback, 'utf8')),
    receiptReadbackSha256: sha256Buffer(Buffer.from(receiptReadback, 'utf8')),
    negativeCases: 2,
    negativeFailures: [
      targetExists.code === BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.TARGET_EXISTS ? null : 'target-exists',
      badPath.code === BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.PATH_REJECTED ? null : 'path-traversal',
    ].filter(Boolean).length,
    cleanupOk,
    userDocumentsTouched: false,
    productRuntimeWiringChanged: false,
  };
  const reportPath = path.join(runRoot, 'physical-evidence.json');
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  const reportSha256 = await sha256File(reportPath);
  console.log(JSON.stringify({
    reportPath,
    reportSha256,
    status: report.status,
    positiveWritten: report.positiveWritten,
    writtenFileCount: report.writtenFileCount,
    negativeCases: report.negativeCases,
    negativeFailures: report.negativeFailures,
    cleanupOk,
  }, null, 2));
  if (report.status !== 'PASS') process.exitCode = 1;
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
