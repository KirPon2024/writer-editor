#!/usr/bin/env node
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA_VERSION = 'yalken.googleDocs.localRecoveryReplay.v1';
export const RECEIPT_SCHEMA_VERSION = 'yalken.googleDocs.localRecoveryReplay.receipt.v1';
export const TASK_ID = 'GOOGLE_DOCS_LOCAL_RECOVERY_REPLAY_CONTRACT_V1';
export const STATUS = 'GOOGLE_DOCS_LOCAL_RECOVERY_REPLAY_CONTRACT_V1_LOCAL_VERIFIED';
export const RESULT = 'RECOVERY_REPLAY_CONTRACT_LOCAL_ONLY_NEEDS_REAL_GOOGLE_E2E';
export const RECEIPT_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_LOCAL_RECOVERY_REPLAY_CONTRACT_V1_RECEIPT.json';
export const REGISTRY_PATH = 'docs/OPS/RTK/GOOGLE_BUILD_PROFILE_REGISTRY_V1.json';
export const G00_MATRIX_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_CAPABILITY_MATRIX_V1.json';
export const G00_DISCOVERY_RECEIPT_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_DISCOVERY_RECEIPT.json';
export const RTK_CATALOG_PATH = 'docs/OPS/RTK/RTK_TEST_GRAPH_CATALOG_V1.json';
export const CONTRACT_BASENAME = 'rtk-google-docs-local-recovery-replay-contract.contract.test.js';

const REAL_GOOGLE_E2E = 'WAIT_AUTHORITY_REQUIRED_FOR_REAL_PROVIDER_EVIDENCE';
const NEXT_LOCAL_CONTOUR = 'GOOGLE_DOCS_LOCAL_FINAL_COMPATIBILITY_VERDICT_V1';
const ALLOWED_MEDIA_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_RETURNED_ARTIFACTS = 8;
const MAX_AGGREGATE_BYTES = 64 * 1024;
const EXPECTED_RECOVERY_EVENTS = Object.freeze([
  'QUARANTINE_MANIFEST_OBSERVED',
  'RECOVERY_RECONCILED_WITHOUT_WRITE',
  'REPLAY_DETECTED_IDEMPOTENT_NO_WRITE',
]);

const ALLOWED_PROFILE_IDS = Object.freeze([
  'google-docs-office-mode-post-d1-v1',
  'google-docs-native-conversion-post-d1-v1',
]);

const EXPECTED_SYNTHETIC_SOURCE = Object.freeze({
  projectId: 'synthetic-google-docs-project',
  rootId: 'synthetic-google-docs-root',
  documentId: 'synthetic-google-docs-document',
  canonicalRevision: `sha256:${sha256Text('canonical-google-docs-revision-v1')}`,
  workingRevision: `sha256:${sha256Text('working-google-docs-revision-v1')}`,
  generation: 1,
  sourceFence: `sha256:${sha256Text('google-docs-local-recovery-replay-source-fence-v1')}`,
});

function repoRootFromHere() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Buffer(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function sha256Text(value) {
  return sha256Buffer(Buffer.from(String(value), 'utf8'));
}

function sha256Json(value) {
  return `sha256:${sha256Text(stableJson(value))}`;
}

function sha256File(absPath) {
  return sha256Buffer(fs.readFileSync(absPath));
}

function readJson(repoRoot, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function writeJson(repoRoot, relativePath, value) {
  const absPath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, `${JSON.stringify(value, null, 2)}\n`);
}

function runGit(repoRoot, args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  if (result.status === 0) return String(result.stdout || '').trim();
  return '';
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function withoutKey(objectValue, keyToRemove) {
  const next = {};
  for (const [key, value] of Object.entries(objectValue || {})) {
    if (key !== keyToRemove) next[key] = value;
  }
  return next;
}

function hasOwnTrue(objectValue, keys) {
  if (!isObjectRecord(objectValue)) return '';
  return keys.find((key) => objectValue[key] === true) || '';
}

function zeroCounts(packet) {
  const returnedArtifacts = Array.isArray(packet?.returnedArtifacts) ? packet.returnedArtifacts : [];
  const recoveryEvents = Array.isArray(packet?.recoveryLog?.events) ? packet.recoveryLog.events : [];
  return {
    returnedArtifacts: returnedArtifacts.length,
    recoveryEvents: recoveryEvents.length,
    idempotentReplays: 0,
    writerCalls: 0,
    applyAdmitted: 0,
    productMutations: 0,
  };
}

function failure(code, field, message, packet) {
  return {
    ok: false,
    status: 'FAIL_CLOSED',
    result: 'FAIL_CLOSED',
    code,
    field,
    message,
    action: 'DENY',
    provider: typeof packet?.provider === 'string' ? packet.provider : '',
    profileId: typeof packet?.profileId === 'string' ? packet.profileId : '',
    realAccountE2E: REAL_GOOGLE_E2E,
    packetDigest: packet && typeof packet === 'object' ? sha256Json(packet) : '',
    counts: zeroCounts(packet),
  };
}

function expectedManifestBody(returnedArtifacts, sourceBinding) {
  return {
    manifestId: 'synthetic-google-docs-recovery-replay-manifest-v1',
    sourceBindingSha256: `sha256:${sha256Text(stableJson(sourceBinding))}`,
    artifactBindings: returnedArtifacts.map((artifact) => ({
      artifactId: artifact.artifactId,
      mediaType: artifact.mediaType,
      payloadSha256: artifact.payloadSha256,
      sizeBytes: artifact.sizeBytes,
    })),
    aggregatePayloadSha256: `sha256:${sha256Text(returnedArtifacts.map((artifact) => artifact.payloadSha256).join('\n'))}`,
    recoveryClass: 'LOCAL_QUARANTINE_RECOVERY_REPLAY_ONLY',
  };
}

function withDigest(body, digestKey) {
  return {
    ...body,
    [digestKey]: `sha256:${sha256Text(stableJson(body))}`,
  };
}

function expectedRecoveryEvents(sourceBinding, returnedArtifacts, manifest) {
  const sourceBindingSha256 = `sha256:${sha256Text(stableJson(sourceBinding))}`;
  const artifactSha256s = returnedArtifacts.map((artifact) => artifact.payloadSha256);
  return [
    {
      eventId: 'google-recovery-event-1',
      eventType: 'QUARANTINE_MANIFEST_OBSERVED',
      sourceBindingSha256,
      artifactSha256s,
      manifestSha256: manifest.manifestSha256,
    },
    {
      eventId: 'google-recovery-event-2',
      eventType: 'RECOVERY_RECONCILED_WITHOUT_WRITE',
      sourceBindingSha256,
      artifactSha256s,
      manifestSha256: manifest.manifestSha256,
      writerCalls: 0,
    },
    {
      eventId: 'google-recovery-event-3',
      eventType: 'REPLAY_DETECTED_IDEMPOTENT_NO_WRITE',
      sourceBindingSha256,
      artifactSha256s,
      manifestSha256: manifest.manifestSha256,
      writerCalls: 0,
    },
  ].map((event) => ({
    ...event,
    eventSha256: `sha256:${sha256Text(stableJson(event))}`,
  }));
}

function expectedRecoveryLogBody(sourceBinding, returnedArtifacts, manifest) {
  return {
    logId: 'synthetic-google-docs-recovery-replay-log-v1',
    sourceBindingSha256: `sha256:${sha256Text(stableJson(sourceBinding))}`,
    manifestSha256: manifest.manifestSha256,
    artifactSha256s: returnedArtifacts.map((artifact) => artifact.payloadSha256),
    events: expectedRecoveryEvents(sourceBinding, returnedArtifacts, manifest),
  };
}

function expectedReplayBody(sourceBinding, returnedArtifacts, recoveryLog) {
  return {
    replayId: 'synthetic-google-docs-recovery-replay-receipt-v1',
    sourceBindingSha256: `sha256:${sha256Text(stableJson(sourceBinding))}`,
    logSha256: recoveryLog.logSha256,
    artifactSha256s: returnedArtifacts.map((artifact) => artifact.payloadSha256),
    replayStatus: 'IDEMPOTENT_REPLAY_NO_WRITE',
    recoveredArtifacts: returnedArtifacts.length,
    writerCalls: 0,
    applyAdmitted: 0,
    productMutations: 0,
    outputClass: 'QUARANTINE_PREVIEW_ONLY',
  };
}

function expectedOracleBody(returnedArtifacts, manifest, recoveryLog, replayReceipt) {
  return {
    oracleId: 'synthetic-google-docs-recovery-replay-oracle-v1',
    expectedAction: 'RECOVER_OR_REPLAY_QUARANTINE_ONLY',
    expectedRecoveryEvents: EXPECTED_RECOVERY_EVENTS.length,
    expectedIdempotentReplays: 1,
    expectedWriterCalls: 0,
    expectedApplyAdmitted: 0,
    expectedProductMutations: 0,
    expectedArtifactCount: returnedArtifacts.length,
    manifestSha256: manifest.manifestSha256,
    logSha256: recoveryLog.logSha256,
    replaySha256: replayReceipt.replaySha256,
  };
}

function validateUpstream(packet) {
  const upstream = packet.upstreamLocalPreviewOnlyNoApply;
  if (!isObjectRecord(upstream)) {
    return ['GOOGLE_RECOVERY_REPLAY_UPSTREAM_PREVIEW_NOT_BOUND', 'upstreamLocalPreviewOnlyNoApply', 'upstream preview-only no-apply result is required'];
  }
  if (upstream.status !== 'GOOGLE_DOCS_LOCAL_PREVIEW_ONLY_NO_APPLY_V1_LOCAL_VERIFIED'
    || upstream.result !== 'PREVIEW_ONLY_NO_APPLY_NEEDS_REAL_GOOGLE_E2E'
    || upstream.action !== 'PREVIEW_ONLY'
    || upstream.applyAuthority !== 'DENY') {
    return ['GOOGLE_RECOVERY_REPLAY_UPSTREAM_PREVIEW_NOT_BOUND', 'upstreamLocalPreviewOnlyNoApply', 'recovery/replay may only derive from local preview-only no-apply evidence'];
  }
  return null;
}

function validateSourceBinding(packet) {
  if (!isObjectRecord(packet.sourceBinding)) {
    return ['GOOGLE_RECOVERY_REPLAY_SOURCE_TRANSPLANT', 'sourceBinding', 'source binding is required'];
  }
  for (const [key, value] of Object.entries(EXPECTED_SYNTHETIC_SOURCE)) {
    if (packet.sourceBinding[key] !== value) {
      return ['GOOGLE_RECOVERY_REPLAY_SOURCE_TRANSPLANT', `sourceBinding.${key}`, 'synthetic recovery/replay source binding does not match fixture identity'];
    }
  }
  return null;
}

function validateArtifacts(packet) {
  const artifacts = packet.returnedArtifacts;
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    return ['GOOGLE_RECOVERY_REPLAY_SCHEMA_INVALID', 'returnedArtifacts', 'at least one returned artifact is required'];
  }
  if (artifacts.length > MAX_RETURNED_ARTIFACTS) {
    return ['GOOGLE_RECOVERY_REPLAY_SCHEMA_INVALID', 'returnedArtifacts', 'too many returned artifacts for the local recovery/replay envelope'];
  }
  const artifactIds = new Set();
  const payloadDigests = new Set();
  let aggregateBytes = 0;
  for (let index = 0; index < artifacts.length; index += 1) {
    const artifact = artifacts[index];
    if (!isObjectRecord(artifact)) {
      return ['GOOGLE_RECOVERY_REPLAY_SCHEMA_INVALID', `returnedArtifacts.${index}`, 'artifact must be an object'];
    }
    if (typeof artifact.artifactId !== 'string' || artifact.artifactId.length === 0) {
      return ['GOOGLE_RECOVERY_REPLAY_SCHEMA_INVALID', `returnedArtifacts.${index}.artifactId`, 'artifactId is required'];
    }
    if (artifactIds.has(artifact.artifactId)) {
      return ['GOOGLE_RECOVERY_REPLAY_DUPLICATE_REPLAY_REJECTED', `returnedArtifacts.${index}.artifactId`, 'duplicate artifact id is replay evidence'];
    }
    artifactIds.add(artifact.artifactId);
    if (artifact.mediaType !== ALLOWED_MEDIA_TYPE) {
      return ['GOOGLE_RECOVERY_REPLAY_UNSUPPORTED_FORMAT_ABSTAIN', `returnedArtifacts.${index}.mediaType`, 'unsupported returned Google export format remains a typed limitation'];
    }
    if (typeof artifact.payloadText !== 'string' || artifact.payloadText.length === 0) {
      return ['GOOGLE_RECOVERY_REPLAY_SCHEMA_INVALID', `returnedArtifacts.${index}.payloadText`, 'synthetic returned payload text is required'];
    }
    const expectedPayloadSha256 = `sha256:${sha256Text(artifact.payloadText)}`;
    if (artifact.payloadSha256 !== expectedPayloadSha256) {
      return ['GOOGLE_RECOVERY_REPLAY_ARTIFACT_DIGEST_MISMATCH', `returnedArtifacts.${index}.payloadSha256`, 'returned artifact payload digest mismatch'];
    }
    const expectedSize = Buffer.byteLength(artifact.payloadText, 'utf8');
    if (artifact.sizeBytes !== expectedSize) {
      return ['GOOGLE_RECOVERY_REPLAY_ARTIFACT_DIGEST_MISMATCH', `returnedArtifacts.${index}.sizeBytes`, 'returned artifact byte size mismatch'];
    }
    if (payloadDigests.has(artifact.payloadSha256)) {
      return ['GOOGLE_RECOVERY_REPLAY_DUPLICATE_REPLAY_REJECTED', `returnedArtifacts.${index}.payloadSha256`, 'duplicate returned bytes are replay/transplant evidence, not diversity'];
    }
    payloadDigests.add(artifact.payloadSha256);
    aggregateBytes += expectedSize;
  }
  if (aggregateBytes > MAX_AGGREGATE_BYTES) {
    return ['GOOGLE_RECOVERY_REPLAY_SCHEMA_INVALID', 'returnedArtifacts', 'aggregate returned payload exceeds local recovery/replay envelope'];
  }
  return null;
}

function validateManifest(packet) {
  const manifest = packet.recoveryManifest;
  if (!isObjectRecord(manifest)) {
    return ['GOOGLE_RECOVERY_REPLAY_MANIFEST_DIGEST_MISMATCH', 'recoveryManifest', 'recovery manifest is required'];
  }
  const expectedBody = expectedManifestBody(packet.returnedArtifacts, packet.sourceBinding);
  const actualBody = withoutKey(manifest, 'manifestSha256');
  if (stableJson(actualBody) !== stableJson(expectedBody)) {
    return ['GOOGLE_RECOVERY_REPLAY_MANIFEST_DIGEST_MISMATCH', 'recoveryManifest', 'recovery manifest must bind source and returned artifact bytes'];
  }
  if (manifest.manifestSha256 !== `sha256:${sha256Text(stableJson(expectedBody))}`) {
    return ['GOOGLE_RECOVERY_REPLAY_MANIFEST_DIGEST_MISMATCH', 'recoveryManifest.manifestSha256', 'recovery manifest digest mismatch'];
  }
  return null;
}

function validateRecoveryLog(packet) {
  const recoveryLog = packet.recoveryLog;
  if (!isObjectRecord(recoveryLog)) {
    return ['GOOGLE_RECOVERY_REPLAY_LOG_DIGEST_MISMATCH', 'recoveryLog', 'recovery log is required'];
  }
  const expectedBody = expectedRecoveryLogBody(packet.sourceBinding, packet.returnedArtifacts, packet.recoveryManifest);
  const actualBody = withoutKey(recoveryLog, 'logSha256');
  if (stableJson(actualBody) !== stableJson(expectedBody)) {
    return ['GOOGLE_RECOVERY_REPLAY_LOG_DIGEST_MISMATCH', 'recoveryLog', 'recovery log must bind source, manifest, artifacts, ordered events, and zero writer calls'];
  }
  if (recoveryLog.logSha256 !== `sha256:${sha256Text(stableJson(expectedBody))}`) {
    return ['GOOGLE_RECOVERY_REPLAY_LOG_DIGEST_MISMATCH', 'recoveryLog.logSha256', 'recovery log digest mismatch'];
  }
  return null;
}

function validateReplayReceipt(packet) {
  const replayReceipt = packet.replayReceipt;
  if (!isObjectRecord(replayReceipt)) {
    return ['GOOGLE_RECOVERY_REPLAY_RECEIPT_DIGEST_MISMATCH', 'replayReceipt', 'replay receipt is required'];
  }
  if (replayReceipt.replayStatus !== 'IDEMPOTENT_REPLAY_NO_WRITE' || replayReceipt.outputClass !== 'QUARANTINE_PREVIEW_ONLY') {
    return ['GOOGLE_RECOVERY_REPLAY_RECEIPT_OVERCLAIM', 'replayReceipt.replayStatus', 'replay cannot claim apply, import, or product mutation'];
  }
  if (replayReceipt.recoveredArtifacts !== packet.returnedArtifacts.length) {
    return ['GOOGLE_RECOVERY_REPLAY_PARTIAL_OUTPUT_CORRUPT', 'replayReceipt.recoveredArtifacts', 'replay/recovery output must account for every returned artifact'];
  }
  if (replayReceipt.writerCalls !== 0 || replayReceipt.applyAdmitted !== 0 || replayReceipt.productMutations !== 0) {
    return ['GOOGLE_RECOVERY_REPLAY_WRITER_CALL_OVERCLAIM', 'replayReceipt', 'local replay must have zero writer calls, zero apply, and zero product mutations'];
  }
  const expectedBody = expectedReplayBody(packet.sourceBinding, packet.returnedArtifacts, packet.recoveryLog);
  const actualBody = withoutKey(replayReceipt, 'replaySha256');
  if (stableJson(actualBody) !== stableJson(expectedBody)) {
    return ['GOOGLE_RECOVERY_REPLAY_RECEIPT_DIGEST_MISMATCH', 'replayReceipt', 'replay receipt must bind source, log, artifacts, and no-write outcome'];
  }
  if (replayReceipt.replaySha256 !== `sha256:${sha256Text(stableJson(expectedBody))}`) {
    return ['GOOGLE_RECOVERY_REPLAY_RECEIPT_DIGEST_MISMATCH', 'replayReceipt.replaySha256', 'replay receipt digest mismatch'];
  }
  return null;
}

function validateOracle(packet) {
  const oracle = packet.recoveryOracle;
  if (!isObjectRecord(oracle)) {
    return ['GOOGLE_RECOVERY_REPLAY_ORACLE_DIGEST_MISMATCH', 'recoveryOracle', 'recovery oracle is required'];
  }
  if (oracle.expectedWriterCalls !== 0 || oracle.expectedApplyAdmitted !== 0 || oracle.expectedProductMutations !== 0) {
    return ['GOOGLE_RECOVERY_REPLAY_ORACLE_OVERCLAIM', 'recoveryOracle', 'oracle cannot admit writer calls, apply, or product mutations'];
  }
  const expectedBody = expectedOracleBody(packet.returnedArtifacts, packet.recoveryManifest, packet.recoveryLog, packet.replayReceipt);
  const actualBody = withoutKey(oracle, 'oracleSha256');
  if (stableJson(actualBody) !== stableJson(expectedBody)) {
    return ['GOOGLE_RECOVERY_REPLAY_ORACLE_DIGEST_MISMATCH', 'recoveryOracle', 'recovery oracle must bind manifest, recovery log, replay receipt, and zero-authority expectations'];
  }
  if (oracle.oracleSha256 !== `sha256:${sha256Text(stableJson(expectedBody))}`) {
    return ['GOOGLE_RECOVERY_REPLAY_ORACLE_DIGEST_MISMATCH', 'recoveryOracle.oracleSha256', 'recovery oracle digest mismatch'];
  }
  return null;
}

export function buildSyntheticGoogleDocsLocalRecoveryReplayPacket(overrides = {}) {
  const returnedArtifacts = overrides.returnedArtifacts || [buildReturnedArtifact()];
  const source = overrides.sourceBinding || { ...EXPECTED_SYNTHETIC_SOURCE };
  const recoveryManifest = overrides.recoveryManifest || withDigest(
    expectedManifestBody(returnedArtifacts, source),
    'manifestSha256',
  );
  const recoveryLog = overrides.recoveryLog || withDigest(
    expectedRecoveryLogBody(source, returnedArtifacts, recoveryManifest),
    'logSha256',
  );
  const replayReceipt = overrides.replayReceipt || withDigest(
    expectedReplayBody(source, returnedArtifacts, recoveryLog),
    'replaySha256',
  );
  const recoveryOracle = overrides.recoveryOracle || withDigest(
    expectedOracleBody(returnedArtifacts, recoveryManifest, recoveryLog, replayReceipt),
    'oracleSha256',
  );
  const packet = {
    schemaVersion: SCHEMA_VERSION,
    packetId: 'synthetic-google-docs-recovery-replay-office-mode-docx-v1',
    sourceKind: 'DISPOSABLE_SYNTHETIC_GOOGLE_RECOVERY_REPLAY_FIXTURE',
    provider: 'google-docs',
    profileId: 'google-docs-office-mode-post-d1-v1',
    recoveryMode: 'LOCAL_SYNTHETIC_RECOVERY_REPLAY_ONLY',
    localOnly: true,
    userDocument: false,
    googleAccountUsed: false,
    networkRuntimeUsed: false,
    productRuntimeWired: false,
    physicalGoogleEvidence: false,
    inheritedEvidenceProfileId: '',
    claims: {
      supportProven: false,
      importProven: false,
      roundtripProven: false,
      returnIntakeTrusted: false,
      previewDecisionTrusted: false,
      recoveryTrusted: false,
      applyAuthority: false,
      productMutationAuthority: false,
    },
    sourceBinding: source,
    returnedArtifacts,
    recoveryManifest,
    recoveryLog,
    replayReceipt,
    recoveryOracle,
    limitations: [
      'NO_REAL_GOOGLE_ACCOUNT_E2E',
      'LOCAL_RECOVERY_REPLAY_CONTRACT_ONLY',
      'NO_GOOGLE_RETURN_IMPORT_AUTHORITY',
      'NO_GOOGLE_RETURN_APPLY_AUTHORITY',
      'NO_PRODUCT_MUTATION_AUTHORITY',
    ],
    upstreamLocalPreviewOnlyNoApply: {
      status: 'GOOGLE_DOCS_LOCAL_PREVIEW_ONLY_NO_APPLY_V1_LOCAL_VERIFIED',
      result: 'PREVIEW_ONLY_NO_APPLY_NEEDS_REAL_GOOGLE_E2E',
      action: 'PREVIEW_ONLY',
      applyAuthority: 'DENY',
    },
  };
  return { ...packet, ...overrides };
}

function buildReturnedArtifact(overrides = {}) {
  const payloadText = overrides.payloadText ?? [
    'Yalken Google Docs local recovery replay synthetic returned artifact.',
    'Disposable only. No user document. No Google account.',
    'This payload may be recovered or replayed only as quarantined preview evidence.',
  ].join('\n');
  return {
    artifactId: 'google-docs-recovery-replay-returned-office-mode-docx',
    fileName: 'synthetic-google-docs-recovery-replay-returned-office-mode.docx',
    mediaType: ALLOWED_MEDIA_TYPE,
    payloadText,
    payloadSha256: `sha256:${sha256Text(payloadText)}`,
    sizeBytes: Buffer.byteLength(payloadText, 'utf8'),
    contentClasses: ['plainText', 'paragraphBreaks'],
    ...overrides,
  };
}

export function evaluateGoogleDocsLocalRecoveryReplayContract(packet) {
  if (!isObjectRecord(packet)) {
    return failure('GOOGLE_RECOVERY_REPLAY_SCHEMA_INVALID', 'packet', 'packet must be an object', packet);
  }
  if (packet.schemaVersion !== SCHEMA_VERSION) {
    return failure('GOOGLE_RECOVERY_REPLAY_SCHEMA_INVALID', 'schemaVersion', 'unsupported packet schema', packet);
  }
  if (packet.provider !== 'google-docs' || packet.inheritedEvidenceProfileId) {
    return failure('GOOGLE_RECOVERY_REPLAY_WORD_EVIDENCE_INHERITANCE', 'provider', 'Google recovery/replay cannot inherit Word/provider evidence', packet);
  }
  if (!ALLOWED_PROFILE_IDS.includes(packet.profileId)) {
    return failure('GOOGLE_RECOVERY_REPLAY_PROFILE_NOT_DECLARED', 'profileId', 'profile must remain one of the declared Google Docs profiles', packet);
  }
  const packetOverclaim = hasOwnTrue(packet, [
    'googleAccountUsed',
    'networkRuntimeUsed',
    'productRuntimeWired',
    'physicalGoogleEvidence',
    'userDocument',
  ]);
  const claimOverclaim = hasOwnTrue(packet.claims, [
    'supportProven',
    'importProven',
    'roundtripProven',
    'returnIntakeTrusted',
    'previewDecisionTrusted',
    'recoveryTrusted',
    'applyAuthority',
    'productMutationAuthority',
  ]);
  if (packet.localOnly !== true || packetOverclaim || claimOverclaim) {
    return failure('GOOGLE_RECOVERY_REPLAY_OVERCLAIM', packetOverclaim || claimOverclaim || 'localOnly', 'local Google recovery/replay cannot claim support, provider E2E, import, roundtrip, trusted recovery, apply, or mutation authority', packet);
  }
  const upstreamError = validateUpstream(packet);
  if (upstreamError) return failure(...upstreamError, packet);
  if (!Array.isArray(packet.limitations) || packet.limitations.length === 0) {
    return failure('GOOGLE_RECOVERY_REPLAY_SCHEMA_INVALID', 'limitations', 'typed limitations are required', packet);
  }
  if (packet.limitations.some((item) => /^(UNKNOWN|ABSTAIN)$/u.test(String(item || '').trim()))) {
    return failure('GOOGLE_RECOVERY_REPLAY_UNKNOWN_ABSTAIN_NOT_PASS', 'limitations', 'UNKNOWN/ABSTAIN cannot aggregate to PASS', packet);
  }
  const sourceError = validateSourceBinding(packet);
  if (sourceError) return failure(...sourceError, packet);
  const artifactError = validateArtifacts(packet);
  if (artifactError) return failure(...artifactError, packet);
  const manifestError = validateManifest(packet);
  if (manifestError) return failure(...manifestError, packet);
  const logError = validateRecoveryLog(packet);
  if (logError) return failure(...logError, packet);
  const replayError = validateReplayReceipt(packet);
  if (replayError) return failure(...replayError, packet);
  const oracleError = validateOracle(packet);
  if (oracleError) return failure(...oracleError, packet);

  return {
    ok: true,
    status: STATUS,
    result: RESULT,
    code: 'GOOGLE_RECOVERY_REPLAY_LOCAL_NO_APPLY_DECISION',
    action: 'RECOVER_OR_REPLAY_QUARANTINE_ONLY',
    provider: packet.provider,
    profileId: packet.profileId,
    recoveryMode: packet.recoveryMode,
    realAccountE2E: REAL_GOOGLE_E2E,
    localRecoveryReplayOnly: true,
    noProductMutation: true,
    supportClaimed: false,
    importClaimed: false,
    roundtripClaimed: false,
    returnIntakeTrusted: false,
    previewDecisionTrusted: false,
    recoveryTrusted: false,
    applyAuthority: 'DENY',
    packetDigest: sha256Json(packet),
    manifestDigest: packet.recoveryManifest.manifestSha256,
    logDigest: packet.recoveryLog.logSha256,
    replayDigest: packet.replayReceipt.replaySha256,
    oracleDigest: packet.recoveryOracle.oracleSha256,
    counts: {
      returnedArtifacts: packet.returnedArtifacts.length,
      recoveryEvents: packet.recoveryLog.events.length,
      idempotentReplays: 1,
      writerCalls: 0,
      applyAdmitted: 0,
      productMutations: 0,
    },
  };
}

export function buildGoogleDocsLocalRecoveryReplayReceipt(input = {}) {
  const repoRoot = input.repoRoot || repoRootFromHere();
  const originMainSha = runGit(repoRoot, ['rev-parse', 'origin/main']);
  const localHeadSha = runGit(repoRoot, ['rev-parse', 'HEAD']);
  const packet = buildSyntheticGoogleDocsLocalRecoveryReplayPacket();
  const result = evaluateGoogleDocsLocalRecoveryReplayContract(packet);
  return {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    taskId: TASK_ID,
    status: STATUS,
    result: RESULT,
    createdAtUtc: '2026-08-15T00:00:00.000Z',
    originMainSha,
    localHeadSha,
    localRecoveryReplayOnly: true,
    noProductMutation: true,
    realAccountE2E: REAL_GOOGLE_E2E,
    resourceCeilings: {
      maxReturnedArtifacts: MAX_RETURNED_ARTIFACTS,
      maxAggregatePayloadBytes: MAX_AGGREGATE_BYTES,
      expectedRecoveryEvents: EXPECTED_RECOVERY_EVENTS.length,
      writerCallsAllowed: 0,
      userDocumentsAllowed: false,
      googleAccountAllowed: false,
      networkRuntimeAllowed: false,
    },
    nonClaims: {
      googleDocsReady: false,
      supportProven: false,
      importProven: false,
      roundtripProven: false,
      returnIntakeTrusted: false,
      previewDecisionTrusted: false,
      recoveryTrusted: false,
      applyAuthority: false,
      physicalGoogleEvidence: false,
      productRuntimeWired: false,
      userDocumentsUsed: false,
      googleAccountUsed: false,
      networkRuntimeUsed: false,
      wordEvidenceTransferred: false,
    },
    samplePacket: {
      packet,
      result,
    },
    profileBoundary: {
      acceptedProfiles: [...ALLOWED_PROFILE_IDS],
      wordEvidenceTransferToGoogleDocs: 'DENY',
      recoveryTrust: 'DENY_UNTIL_REAL_GOOGLE_PROVIDER_E2E_AND_COMMAND_KERNEL_CONTOUR',
      replayOutcome: 'IDEMPOTENT_QUARANTINE_REPLAY_WITH_ZERO_WRITER_CALLS',
      applyAuthority: 'DENY',
    },
    rollback: {
      type: 'REVERT_THIS_CONTOUR_ONLY',
      preservesPreviousG00Verdict: 'LOCAL_COMPATIBILITY_NEEDS_MORE_EVIDENCE',
      restoresNextLocalContour: 'GOOGLE_DOCS_LOCAL_RECOVERY_REPLAY_CONTRACT_V1',
    },
  };
}

function upsertDiscoveryHead(registry, row) {
  const discoveryHeads = Array.isArray(registry.discoveryHeads) ? registry.discoveryHeads : [];
  const next = discoveryHeads.filter((item) => item.path !== row.path);
  next.push(row);
  next.sort((a, b) => String(a.path).localeCompare(String(b.path)));
  return { ...registry, discoveryHeads: next };
}

function updateRows(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((row) => {
    if (row?.cellId === 'google.recoveryReopenReplay') {
      return {
        ...row,
        currentTerminalClass: 'TYPED_RECOVERY_REPLAY_LOCAL_NO_APPLY',
        userFacingAuthority: 'LOCAL_RECOVERY_REPLAY_NO_APPLY_AUTHORITY',
        physicalEvidence: false,
        reasonCode: 'GOOGLE_RECOVERY_REPLAY_LOCAL_ONLY_NO_REAL_GOOGLE_E2E',
        requiredNextContour: NEXT_LOCAL_CONTOUR,
        blocksGoogleStage: true,
      };
    }
    if (row?.cellId === 'google.previewDecisionCommandApply') {
      return {
        ...row,
        requiredNextContour: NEXT_LOCAL_CONTOUR,
      };
    }
    return row;
  });
}

function updateGoogleCurrentState(current) {
  return {
    ...(isObjectRecord(current) ? current : {}),
    supportClaimed: false,
    importClaimed: false,
    roundtripClaimed: false,
    physicalGoogleEvidence: 0,
    productRuntimeWired: 0,
    automaticApplyCertified: 0,
    googleStageDone: false,
    localCompatibilityVerdict: 'LOCAL_COMPATIBILITY_NEEDS_MORE_EVIDENCE',
    realAccountE2E: REAL_GOOGLE_E2E,
    nextLocalContour: NEXT_LOCAL_CONTOUR,
  };
}

function updateCurrentRealityAudit(current) {
  return {
    ...(isObjectRecord(current) ? current : {}),
    recoveryReplay: 'LOCAL_SYNTHETIC_RECOVERY_REPLAY_ONLY_NOT_RUNTIME_WIRED',
    realAccountE2E: REAL_GOOGLE_E2E,
  };
}

export function writeGoogleDocsLocalRecoveryReplayArtifacts(input = {}) {
  const repoRoot = input.repoRoot || repoRootFromHere();
  const receipt = buildGoogleDocsLocalRecoveryReplayReceipt({ repoRoot });
  writeJson(repoRoot, RECEIPT_PATH, receipt);
  const receiptSha256 = sha256File(path.join(repoRoot, RECEIPT_PATH));

  const localRecoveryReplayContract = {
    status: STATUS,
    result: RESULT,
    receiptPath: RECEIPT_PATH,
    receiptSha256: `sha256:${receiptSha256}`,
    localRecoveryReplayOnly: true,
    noProductMutation: true,
    physicalGoogleEvidence: 0,
    productRuntimeWired: 0,
    supportClaimed: false,
    importClaimed: false,
    roundtripClaimed: false,
    returnIntakeTrusted: false,
    previewDecisionTrusted: false,
    recoveryTrusted: false,
    applyAuthority: false,
    writerCalls: 0,
    realAccountE2E: REAL_GOOGLE_E2E,
  };

  for (const relativePath of [G00_MATRIX_PATH, G00_DISCOVERY_RECEIPT_PATH]) {
    const current = readJson(repoRoot, relativePath);
    writeJson(repoRoot, relativePath, {
      ...current,
      rows: updateRows(current.rows),
      currentRealityAudit: updateCurrentRealityAudit(current.currentRealityAudit),
      googleCurrentState: updateGoogleCurrentState(current.googleCurrentState),
      nextLocalContour: NEXT_LOCAL_CONTOUR,
      localRecoveryReplayContract,
    });
  }

  const matrixSha256 = sha256File(path.join(repoRoot, G00_MATRIX_PATH));
  const discoveryReceiptSha256 = sha256File(path.join(repoRoot, G00_DISCOVERY_RECEIPT_PATH));

  let registry = readJson(repoRoot, REGISTRY_PATH);
  for (const row of [
    {
      path: G00_MATRIX_PATH,
      sha256: `sha256:${matrixSha256}`,
      note: 'G00 Google Docs local compatibility matrix rebound with local recovery/replay no-apply binding.',
    },
    {
      path: G00_DISCOVERY_RECEIPT_PATH,
      sha256: `sha256:${discoveryReceiptSha256}`,
      note: 'G00 Google Docs discovery receipt rebound with local recovery/replay no-apply binding.',
    },
    {
      path: RECEIPT_PATH,
      sha256: `sha256:${receiptSha256}`,
      note: 'Local recovery/replay receipt — synthetic idempotent quarantine replay only, not Google support/import/roundtrip/apply evidence.',
    },
  ]) {
    registry = upsertDiscoveryHead(registry, row);
  }
  writeJson(repoRoot, REGISTRY_PATH, registry);

  let catalog = readJson(repoRoot, RTK_CATALOG_PATH);
  const contractBasenames = Array.isArray(catalog.contractBasenames) ? [...catalog.contractBasenames] : [];
  if (!contractBasenames.includes(CONTRACT_BASENAME)) contractBasenames.push(CONTRACT_BASENAME);
  contractBasenames.sort();
  catalog = {
    ...catalog,
    contractBasenames,
    currentTruthBinding: {
      ...(isObjectRecord(catalog.currentTruthBinding) ? catalog.currentTruthBinding : {}),
      googleStage: 'LOCAL_COMPATIBILITY_REBOUND_NEEDS_REAL_ACCOUNT_E2E',
      googleLocalRecoveryReplayContract: STATUS,
    },
  };
  writeJson(repoRoot, RTK_CATALOG_PATH, catalog);

  return {
    ok: true,
    status: STATUS,
    result: RESULT,
    receiptPath: RECEIPT_PATH,
    receiptSha256: `sha256:${receiptSha256}`,
    physicalGoogleEvidence: 0,
    productRuntimeWired: 0,
    realAccountE2E: REAL_GOOGLE_E2E,
  };
}

function parseArgs(argv) {
  const args = new Set(argv);
  return {
    json: args.has('--json'),
    write: args.has('--write'),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = args.write
    ? writeGoogleDocsLocalRecoveryReplayArtifacts()
    : {
        ok: true,
        status: STATUS,
        result: RESULT,
        sample: evaluateGoogleDocsLocalRecoveryReplayContract(buildSyntheticGoogleDocsLocalRecoveryReplayPacket()),
      };
  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`STATUS=${result.status}\nRESULT=${result.result}\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
