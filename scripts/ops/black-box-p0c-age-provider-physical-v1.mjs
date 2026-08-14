#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import {
  BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES,
  BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_FEATURE_FLAG,
  BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS,
  buildBlackBoxStrictCapsuleV1,
  createBlackBoxP0cAgeCliProviderV1,
  createBlackBoxP0cProviderPinDigestV1,
  createBlackBoxP0cSourceFenceTokenV1,
  recoverBlackBoxStrictCapsuleV1,
} from '../../src/product/blackBoxStrictCapsuleRecoverV1.mjs';

const DEFAULT_AGE_ROOT = '/Volumes/T7-Secure/storage/yalken/toolchains/age-v1.3.1-darwin-arm64';
const DEFAULT_EVIDENCE_ROOT = '/Volumes/T7-Secure/storage/yalken/evidence/f3-p0c-strict-capsule-recover-v1';
const TASK_ID = 'F3_BLACK_BOX_P0C_STRICT_CAPSULE_RECOVER_V1';

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Buffer(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

async function sha256File(filePath) {
  return sha256Buffer(await fs.readFile(filePath));
}

function toBase64(textOrBytes) {
  return Buffer.from(textOrBytes).toString('base64');
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

async function readTrim(filePath) {
  return (await fs.readFile(filePath, 'utf8')).trim();
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
  const stderr = result.stderr.toString('utf8');
  const publicKey = stderr.split('\n').map((line) => line.trim()).find((line) => line.startsWith('Public key: '))?.slice('Public key: '.length);
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

function makeSourceBinding() {
  return {
    schemaVersion: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.sourceBinding,
    projectId: 'proj_blackbox_p0c_physical',
    rootId: 'root-blackbox-physical',
    documentId: 'manuscript/core',
    canonicalRevision: 'canon-physical-0001',
    workingRevision: 'work-physical-0001',
    generation: 'gen-physical-0001',
    sourceSetDigest: `sha256:${'b'.repeat(64)}`,
  };
}

function makeCurrent(sourceBinding, overrides = {}) {
  return {
    projectId: sourceBinding.projectId,
    rootId: sourceBinding.rootId,
    documentId: sourceBinding.documentId,
    canonicalRevision: sourceBinding.canonicalRevision,
    workingRevision: sourceBinding.workingRevision,
    generation: sourceBinding.generation,
    sourceDigest: sourceBinding.sourceSetDigest,
    dirtyState: 'CLEAN',
    ...overrides,
  };
}

function makeFence(sourceBinding, current = makeCurrent(sourceBinding), authority = { commandId: 'read-source-snapshot-black-box-p0c-physical', decision: 'ALLOW', mayWrite: false }) {
  return {
    authority,
    current,
    expected: {
      projectId: sourceBinding.projectId,
      rootId: sourceBinding.rootId,
      documentId: sourceBinding.documentId,
      canonicalRevision: sourceBinding.canonicalRevision,
      workingRevision: sourceBinding.workingRevision,
      sourceDigest: sourceBinding.sourceSetDigest,
    },
    fence: createBlackBoxP0cSourceFenceTokenV1(sourceBinding),
  };
}

function makeCorePayload(sourceBinding) {
  const bytes = Buffer.from(stableJson({
    synthetic: true,
    taskId: TASK_ID,
    scenes: [
      { id: 'scene-001', text: 'Synthetic capsule only. Привет مرحبا שלום 漢字 👩‍💻' },
      { id: 'notes-001', text: 'Recovery kit preview must import as new project only.' },
    ],
  }), 'utf8');
  return {
    schemaVersion: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.corePayload,
    type: 'BLACK_BOX_CORE_GENOME_V1',
    byteLength: bytes.byteLength,
    bytesBase64: bytes.toString('base64'),
    sha256: sha256Buffer(bytes),
    sourceSetDigest: sourceBinding.sourceSetDigest,
  };
}

function expectations(overrides = {}) {
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
    ...overrides,
  };
}

function makeBuildRequest({ providerPin, sourceBinding, recipient, auditRecipient, auditIdentity, overrides = {} }) {
  return {
    schemaVersion: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.buildRequest,
    featureFlags: { [BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_FEATURE_FLAG]: true },
    providerPin,
    sourceBinding,
    sourceFence: makeFence(sourceBinding),
    auditIdentity,
    auditRecipient,
    recipient,
    corePayload: makeCorePayload(sourceBinding),
    expectations: expectations(),
    ...overrides,
  };
}

function makeRecoverRequest({ providerPin, sourceBinding, capsule, identity, overrides = {} }) {
  return {
    schemaVersion: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.recoverRequest,
    featureFlags: { [BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_FEATURE_FLAG]: true },
    providerPin,
    expectedSourceBinding: sourceBinding,
    capsule,
    identity,
    expectations: expectations(),
    ...overrides,
  };
}

function redactedResult(result) {
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
    capsule: result.capsule ? {
      schemaVersion: result.capsule.schemaVersion,
      type: result.capsule.type,
      provider: result.capsule.provider,
      manifest: result.capsule.manifest,
      ciphertextSha256: result.capsule.ciphertext.sha256,
      ciphertextByteLength: result.capsule.ciphertext.byteLength,
    } : null,
  };
}

async function main() {
  const ageRoot = process.env.YALKEN_P0C_AGE_ROOT || DEFAULT_AGE_ROOT;
  const evidenceRoot = process.env.YALKEN_P0C_EVIDENCE_ROOT || DEFAULT_EVIDENCE_ROOT;
  const runId = process.env.YALKEN_P0C_RUN_ID || timestamp();
  const evidenceDir = path.join(evidenceRoot, runId);
  await fs.mkdir(evidenceRoot, { recursive: true });
  await fs.mkdir(evidenceDir, { recursive: false });
  const tempDir = await fs.mkdtemp(path.join(evidenceDir, 'tmp-'));
  let cleanupOk = false;
  try {
    const providerPin = await buildProviderPin(ageRoot);
    const provider = createBlackBoxP0cAgeCliProviderV1(providerPin, { tempRoot: tempDir });
    const primary = await generateSyntheticIdentity(path.join(await readTrim(path.join(ageRoot, 'provenance', 'provider-bin-dir.txt')), 'age-keygen'), tempDir, 'primary');
    const audit = await generateSyntheticIdentity(path.join(await readTrim(path.join(ageRoot, 'provenance', 'provider-bin-dir.txt')), 'age-keygen'), tempDir, 'audit');
    const wrong = await generateSyntheticIdentity(path.join(await readTrim(path.join(ageRoot, 'provenance', 'provider-bin-dir.txt')), 'age-keygen'), tempDir, 'wrong');
    const sourceBinding = makeSourceBinding();
    const started = performance.now();
    const build = await buildBlackBoxStrictCapsuleV1(makeBuildRequest({
      providerPin,
      sourceBinding,
      recipient: primary.recipient,
      auditRecipient: audit.recipient,
      auditIdentity: audit.identity,
    }), { ageProvider: provider });
    const recover = build.ok
      ? await recoverBlackBoxStrictCapsuleV1(makeRecoverRequest({
        providerPin,
        sourceBinding,
        capsule: build.capsule,
        identity: primary.identity,
      }), { ageProvider: provider })
      : null;
    const elapsedMs = performance.now() - started;

    const negativeCases = [];
    if (build.ok) {
      const wrongIdentity = await recoverBlackBoxStrictCapsuleV1(makeRecoverRequest({
        providerPin,
        sourceBinding,
        capsule: build.capsule,
        identity: wrong.identity,
      }), { ageProvider: provider });
      negativeCases.push({ id: 'wrong-identity', pass: wrongIdentity.ok !== true, result: redactedResult(wrongIdentity) });

      const auditIdentityAsRecovery = await recoverBlackBoxStrictCapsuleV1(makeRecoverRequest({
        providerPin,
        sourceBinding,
        capsule: build.capsule,
        identity: audit.identity,
      }), { ageProvider: provider });
      negativeCases.push({ id: 'audit-identity-not-recovery-authority', pass: auditIdentityAsRecovery.ok !== true && auditIdentityAsRecovery.code === BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, result: redactedResult(auditIdentityAsRecovery) });

      const ciphertext = Buffer.from(build.capsule.ciphertext.bytesBase64, 'base64');
      const tamperedBytes = Buffer.from(ciphertext);
      tamperedBytes[Math.max(0, tamperedBytes.length - 1)] ^= 0xff;
      const tamperedCapsule = {
        ...build.capsule,
        ciphertext: {
          ...build.capsule.ciphertext,
          bytesBase64: tamperedBytes.toString('base64'),
          sha256: sha256Buffer(tamperedBytes),
        },
      };
      const tampered = await recoverBlackBoxStrictCapsuleV1(makeRecoverRequest({
        providerPin,
        sourceBinding,
        capsule: tamperedCapsule,
        identity: primary.identity,
      }), { ageProvider: provider });
      negativeCases.push({ id: 'tampered-ciphertext', pass: tampered.ok !== true, result: redactedResult(tampered) });

      const truncatedBytes = ciphertext.subarray(0, Math.max(1, ciphertext.length - 8));
      const truncatedCapsule = {
        ...build.capsule,
        ciphertext: {
          ...build.capsule.ciphertext,
          bytesBase64: truncatedBytes.toString('base64'),
          byteLength: truncatedBytes.byteLength,
          sha256: sha256Buffer(truncatedBytes),
        },
      };
      const truncated = await recoverBlackBoxStrictCapsuleV1(makeRecoverRequest({
        providerPin,
        sourceBinding,
        capsule: truncatedCapsule,
        identity: primary.identity,
      }), { ageProvider: provider });
      negativeCases.push({ id: 'truncated-ciphertext', pass: truncated.ok !== true, result: redactedResult(truncated) });
    }

    const wrongDigest = await buildBlackBoxStrictCapsuleV1(makeBuildRequest({
      providerPin: {
        ...providerPin,
        executables: { ...providerPin.executables, ageSha256: `sha256:${'9'.repeat(64)}` },
      },
      sourceBinding,
      recipient: primary.recipient,
      auditRecipient: audit.recipient,
      auditIdentity: audit.identity,
    }), { ageProvider: provider });
    negativeCases.push({ id: 'provider-digest-mismatch', pass: wrongDigest.ok !== true && wrongDigest.code === BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.PROVIDER_PIN_MISMATCH, result: redactedResult(wrongDigest) });

    const stale = await buildBlackBoxStrictCapsuleV1(makeBuildRequest({
      providerPin,
      sourceBinding,
      recipient: primary.recipient,
      auditRecipient: audit.recipient,
      auditIdentity: audit.identity,
      overrides: { sourceFence: makeFence(sourceBinding, makeCurrent(sourceBinding, { generation: 'gen-stale' })) },
    }), { ageProvider: provider });
    negativeCases.push({ id: 'stale-generation', pass: stale.ok !== true && stale.code === BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.SOURCE_BINDING_MISMATCH, result: redactedResult(stale) });

    const unknown = await buildBlackBoxStrictCapsuleV1(makeBuildRequest({
      providerPin,
      sourceBinding,
      recipient: primary.recipient,
      auditRecipient: audit.recipient,
      auditIdentity: audit.identity,
      overrides: { sourceFence: makeFence(sourceBinding, makeCurrent(sourceBinding), { commandId: 'read-source-snapshot-black-box-p0c-physical', decision: 'UNKNOWN', mayWrite: false }) },
    }), { ageProvider: provider });
    negativeCases.push({ id: 'unknown-authority', pass: unknown.ok !== true && unknown.code === BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.SOURCE_FENCE_REJECTED, result: redactedResult(unknown) });

    const providerPinDigest = createBlackBoxP0cProviderPinDigestV1(providerPin);
    const report = {
      schemaVersion: 'yalken.blackBoxStrictCapsuleRecover.physicalEvidence.v1',
      taskId: TASK_ID,
      runId,
      status: build.ok === true && recover?.ok === true && negativeCases.every((item) => item.pass) ? 'PASS' : 'FAIL',
      provider: {
        version: providerPin.version,
        platform: providerPin.platform,
        providerPinDigest,
        artifactSha256: providerPin.artifactSha256,
        proofSha256: providerPin.proofSha256,
        ageSha256: providerPin.executables.ageSha256,
        ageInspectSha256: providerPin.executables.ageInspectSha256,
        sigsumVerified: providerPin.sigsum.verified,
        sigsumPolicy: providerPin.sigsum.policy,
        sigsumKeyDigest: providerPin.sigsum.keyDigest,
      },
      positive: {
        build: redactedResult(build),
        recover: recover ? redactedResult(recover) : null,
        recipientSeparation: {
          ownerRecipientFingerprint: primary.recipient.fingerprint,
          auditRecipientFingerprint: audit.recipient.fingerprint,
          distinct: primary.recipient.fingerprint !== audit.recipient.fingerprint,
          ownerRecipientPreserved: build.capsule?.manifest?.recipientFingerprint === primary.recipient.fingerprint,
          auditRecipientManifestBound: build.capsule?.manifest?.auditRecipientFingerprint === audit.recipient.fingerprint,
          auditIdentityRejectedAsRecovery: negativeCases.some((item) => item.id === 'audit-identity-not-recovery-authority' && item.pass === true),
        },
      },
      negativeCases,
      resourceCeilings: {
        bytes: makeCorePayload(sourceBinding).byteLength,
        elapsedMs,
        ceilingMs: 2000,
        elapsedWithinCeiling: elapsedMs < 2000,
        productSlo: 'NOT_CLAIMED_LAB_ONLY',
      },
      boundaries: {
        disposableSyntheticOnly: true,
        userDocumentsTouched: false,
        productRuntimeWiring: false,
        systemWideInstall: false,
        plaintextOrSecretMaterialInReport: false,
        ownerKeyRecoveryDrill: 'NOT_CLAIMED',
        disasterReady: 'NOT_CLAIMED',
        physicalPowerLossProof: 'NOT_CLAIMED',
      },
    };
    const serialized = JSON.stringify(report, null, 2);
    if (/AGE-SECRET-KEY|bytesBase64|Synthetic capsule only|Recovery kit preview/iu.test(serialized)) {
      report.status = 'FAIL';
      report.boundaries.plaintextOrSecretMaterialInReport = true;
    }
    const reportPath = path.join(evidenceDir, 'physical-evidence.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    await fs.rm(tempDir, { recursive: true, force: true });
    cleanupOk = true;
    const reportSha256 = await sha256File(reportPath);
    const summary = {
      reportPath,
      reportSha256,
      status: report.status,
      positiveBuild: build.ok === true,
      positiveRecover: recover?.ok === true,
      negativeCases: negativeCases.length,
      negativeFailures: negativeCases.filter((item) => !item.pass).length,
      cleanupOk,
      elapsedMs,
    };
    console.log(JSON.stringify(summary, null, 2));
    if (report.status !== 'PASS' || !report.resourceCeilings.elapsedWithinCeiling) process.exitCode = 1;
  } finally {
    if (!cleanupOk) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    schemaVersion: 'yalken.blackBoxStrictCapsuleRecover.physicalEvidenceError.v1',
    taskId: TASK_ID,
    status: 'FAIL',
    code: error?.code || 'PHYSICAL_RUNNER_ERROR',
    message: error?.message || String(error),
  }, null, 2));
  process.exitCode = 1;
});
