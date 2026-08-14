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
  createBlackBoxP0cProviderPinDigestV1,
  createBlackBoxP0cSourceFenceTokenV1,
} from '../../src/product/blackBoxStrictCapsuleRecoverV1.mjs';
import {
  BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES,
  BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_FEATURE_FLAG,
  BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_SCHEMAS,
  prepareBlackBoxImportAsNewRecoveryPlanV1,
} from '../../src/product/blackBoxImportAsNewRecoveryPlanV1.mjs';

const TASK_ID = 'F3_BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1';
const DEFAULT_AGE_ROOT = '/Volumes/T7-Secure/storage/yalken/toolchains/age-v1.3.1-darwin-arm64';
const DEFAULT_EVIDENCE_ROOT = '/Volumes/T7-Secure/storage/yalken/evidence/f3-import-as-new-recovery-plan-v1';

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

function toBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
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
    projectId: 'proj_blackbox_import_plan_physical',
    rootId: 'root-blackbox-import-plan-physical',
    documentId: 'manuscript/core',
    canonicalRevision: 'canon-import-plan-physical-0001',
    workingRevision: 'work-import-plan-physical-0001',
    generation: 'gen-import-plan-physical-0001',
    sourceSetDigest: `sha256:${'c'.repeat(64)}`,
  };
}

function sourceFence(binding) {
  return {
    authority: {
      commandId: 'read-source-snapshot-black-box-import-plan-physical',
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

function corePayload(binding) {
  const bytes = Buffer.from(stableJson({
    schemaVersion: 'yalken.blackBoxImportAsNewRecoveryPlan.physicalCore.v1',
    note: 'disposable synthetic import-as-new recovery plan fixture',
    sourceBinding: binding,
  }), 'utf8');
  return {
    schemaVersion: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.corePayload,
    type: 'BLACK_BOX_CORE_GENOME_V1',
    byteLength: bytes.byteLength,
    bytesBase64: toBase64(bytes),
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

function planExpectations() {
  return {
    importMode: 'IMPORT_AS_NEW_PROJECT_ONLY',
    liveProjectOverwrite: false,
    quarantineRequired: true,
    requireNoPlaintextInReceipt: true,
    requireP0cRecoverExecution: true,
    requireProviderExact: true,
  };
}

function planRequest({ providerPin, capsule, identity, binding, overrides = {} }) {
  return {
    schemaVersion: BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_SCHEMAS.request,
    featureFlags: {
      [BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_FEATURE_FLAG]: true,
      [BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_FEATURE_FLAG]: true,
    },
    providerPin,
    expectedSourceBinding: binding,
    capsule,
    identity,
    expectations: planExpectations(),
    ...overrides,
  };
}

function safeSummary(result) {
  return {
    ok: result.ok,
    decision: result.decision,
    code: result.code,
    p0cCode: result.p0cCode,
    reasons: Array.isArray(result.reasons)
      ? result.reasons.map((entry) => ({ code: entry.code, field: entry.field }))
      : [],
    importMode: result.recoveryPlan?.importMode,
    liveProjectOverwrite: result.recoveryPlan?.liveProjectOverwrite,
    quarantineStatus: result.recoveryPlan?.quarantine?.status,
    providerPinDigest: result.recoveryPlan?.providerPinDigest || result.receipt?.providerPinDigest,
    capsuleManifestDigest: result.recoveryPlan?.capsuleManifestDigest,
    claims: result.receipt?.claims,
  };
}

export async function runBlackBoxImportAsNewRecoveryPlanV1Physical(options = {}) {
  const ageRoot = options.ageRoot || DEFAULT_AGE_ROOT;
  const evidenceRoot = options.evidenceRoot || DEFAULT_EVIDENCE_ROOT;
  const runId = options.runId || timestamp();
  const evidenceDir = path.join(evidenceRoot, runId);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yalken-import-plan-physical-'));
  await fs.mkdir(evidenceDir, { recursive: true });
  try {
    const providerPin = await buildProviderPin(ageRoot);
    const providerBinDir = await readTrim(path.join(ageRoot, 'provenance', 'provider-bin-dir.txt'));
    const ageKeygenPath = path.join(providerBinDir, 'age-keygen');
    const primary = await generateSyntheticIdentity(ageKeygenPath, tempDir, 'primary');
    const wrong = await generateSyntheticIdentity(ageKeygenPath, tempDir, 'wrong');
    const binding = sourceBinding();
    const provider = createBlackBoxP0cAgeCliProviderV1(providerPin, { tempRoot: tempDir });
    const build = await buildBlackBoxStrictCapsuleV1({
      schemaVersion: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.buildRequest,
      featureFlags: { [BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_FEATURE_FLAG]: true },
      providerPin,
      sourceBinding: binding,
      sourceFence: sourceFence(binding),
      auditIdentity: primary.identity,
      recipient: primary.recipient,
      corePayload: corePayload(binding),
      expectations: p0cExpectations(),
    }, { ageProvider: provider });

    const positive = build.ok === true
      ? await prepareBlackBoxImportAsNewRecoveryPlanV1(planRequest({
        providerPin,
        capsule: build.capsule,
        identity: primary.identity,
        binding,
      }), { ageProvider: provider })
      : build;

    const negatives = [];
    if (build.ok === true) {
      negatives.push({
        id: 'wrong-identity-key',
        result: safeSummary(await prepareBlackBoxImportAsNewRecoveryPlanV1(planRequest({
          providerPin,
          capsule: build.capsule,
          identity: wrong.identity,
          binding,
        }), { ageProvider: provider })),
      });
      negatives.push({
        id: 'stale-revision-replay',
        result: safeSummary(await prepareBlackBoxImportAsNewRecoveryPlanV1(planRequest({
          providerPin,
          capsule: build.capsule,
          identity: primary.identity,
          binding,
          overrides: { expectedSourceBinding: { ...binding, canonicalRevision: 'canon-replayed' } },
        }), { ageProvider: provider })),
      });
      negatives.push({
        id: 'live-overwrite-policy',
        result: safeSummary(await prepareBlackBoxImportAsNewRecoveryPlanV1(planRequest({
          providerPin,
          capsule: build.capsule,
          identity: primary.identity,
          binding,
          overrides: { expectations: { ...planExpectations(), liveProjectOverwrite: true } },
        }), { ageProvider: provider })),
      });
      negatives.push({
        id: 'caller-carried-proof',
        result: safeSummary(await prepareBlackBoxImportAsNewRecoveryPlanV1(planRequest({
          providerPin,
          capsule: build.capsule,
          identity: primary.identity,
          binding,
          overrides: { recoverPlan: { ok: true, decision: 'PASS' } },
        }), { ageProvider: provider })),
      });
    }

    const expectedNegativeCodes = new Map([
      ['wrong-identity-key', BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.P0C_RECOVER_REJECTED],
      ['stale-revision-replay', BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.P0C_RECOVER_REJECTED],
      ['live-overwrite-policy', BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.POLICY_REJECTED],
      ['caller-carried-proof', BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.KEYSET_INVALID],
    ]);
    const negativeFailures = negatives.filter((row) => (
      row.result.ok !== false
      || row.result.decision === 'PASS'
      || row.result.code !== expectedNegativeCodes.get(row.id)
    ));
    const evidence = {
      schemaVersion: 'yalken.blackBoxImportAsNewRecoveryPlan.physicalEvidence.v1',
      taskId: TASK_ID,
      runId,
      provider: {
        kind: providerPin.kind,
        providerId: providerPin.providerId,
        version: providerPin.version,
        platform: providerPin.platform,
        providerPinDigest: createBlackBoxP0cProviderPinDigestV1(providerPin),
        artifactSha256: providerPin.artifactSha256,
        proofSha256: providerPin.proofSha256,
        ageSha256: providerPin.executables.ageSha256,
        ageInspectSha256: providerPin.executables.ageInspectSha256,
        sigsumVerified: providerPin.sigsum.verified,
      },
      positive: safeSummary(positive),
      negatives,
      denominator: {
        positiveCases: 1,
        negativeCases: negatives.length,
      },
      failures: [],
      limitations: {
        userDocuments: 'FORBIDDEN',
        liveProjectRestore: 'NOT_CLAIMED',
        liveProjectOverwrite: 'DENIED',
        exactByteDonorReplication: 'NOT_CLAIMED',
        disasterReady: 'NOT_CLAIMED',
      },
    };
    if (build.ok !== true) evidence.failures.push({ id: 'p0c-build', code: build.code });
    if (positive.ok !== true || positive.decision !== 'PASS') evidence.failures.push({ id: 'positive-plan', code: positive.code });
    evidence.failures.push(...negativeFailures.map((row) => ({ id: row.id, code: row.result.code })));
    const leakagePayload = JSON.stringify(evidence);
    if (/AGE-SECRET-KEY|bytesBase64|sourceText|disposable synthetic import-as-new recovery plan fixture|BLACK_BOX_CORE_GENOME_V1/iu.test(leakagePayload)) {
      evidence.failures.push({ id: 'leakage', code: BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.PLAINTEXT_OR_KEY_LEAK });
    }
    evidence.ok = evidence.failures.length === 0;
    const evidencePath = path.join(evidenceDir, 'physical-evidence.json');
    await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
    const evidenceSha256 = await sha256File(evidencePath);
    return {
      ...evidence,
      evidencePath,
      evidenceSha256,
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const result = await runBlackBoxImportAsNewRecoveryPlanV1Physical();
  console.log(JSON.stringify({
    ok: result.ok,
    taskId: result.taskId,
    runId: result.runId,
    evidenceSha256: result.evidenceSha256,
    denominator: result.denominator,
    failures: result.failures,
  }, null, 2));
  if (!result.ok) process.exitCode = 1;
}
