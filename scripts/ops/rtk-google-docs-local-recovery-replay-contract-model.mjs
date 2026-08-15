#!/usr/bin/env node
import {
  buildSyntheticGoogleDocsLocalRecoveryReplayPacket,
  evaluateGoogleDocsLocalRecoveryReplayContract,
  sha256Text,
} from './rtk-google-docs-local-recovery-replay-contract-v1.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function withoutDigest(objectValue, digestKey) {
  const next = {};
  for (const [key, value] of Object.entries(objectValue || {})) {
    if (key !== digestKey) next[key] = value;
  }
  return next;
}

function baseline() {
  return buildSyntheticGoogleDocsLocalRecoveryReplayPacket();
}

function expectedSource(overrides = {}) {
  return {
    projectId: 'synthetic-google-docs-project',
    rootId: 'synthetic-google-docs-root',
    documentId: 'synthetic-google-docs-document',
    canonicalRevision: `sha256:${sha256Text('canonical-google-docs-revision-v1')}`,
    workingRevision: `sha256:${sha256Text('working-google-docs-revision-v1')}`,
    generation: 1,
    sourceFence: `sha256:${sha256Text('google-docs-local-recovery-replay-source-fence-v1')}`,
    ...overrides,
  };
}

function expectedManifestBody(packet) {
  return {
    manifestId: 'synthetic-google-docs-recovery-replay-manifest-v1',
    sourceBindingSha256: `sha256:${sha256Text(stableJson(packet.sourceBinding))}`,
    artifactBindings: packet.returnedArtifacts.map((artifact) => ({
      artifactId: artifact.artifactId,
      mediaType: artifact.mediaType,
      payloadSha256: artifact.payloadSha256,
      sizeBytes: artifact.sizeBytes,
    })),
    aggregatePayloadSha256: `sha256:${sha256Text(packet.returnedArtifacts.map((artifact) => artifact.payloadSha256).join('\n'))}`,
    recoveryClass: 'LOCAL_QUARANTINE_RECOVERY_REPLAY_ONLY',
  };
}

function expectedEvents(packet) {
  const sourceBindingSha256 = `sha256:${sha256Text(stableJson(packet.sourceBinding))}`;
  const artifactSha256s = packet.returnedArtifacts.map((artifact) => artifact.payloadSha256);
  return [
    {
      eventId: 'google-recovery-event-1',
      eventType: 'QUARANTINE_MANIFEST_OBSERVED',
      sourceBindingSha256,
      artifactSha256s,
      manifestSha256: packet.recoveryManifest.manifestSha256,
    },
    {
      eventId: 'google-recovery-event-2',
      eventType: 'RECOVERY_RECONCILED_WITHOUT_WRITE',
      sourceBindingSha256,
      artifactSha256s,
      manifestSha256: packet.recoveryManifest.manifestSha256,
      writerCalls: 0,
    },
    {
      eventId: 'google-recovery-event-3',
      eventType: 'REPLAY_DETECTED_IDEMPOTENT_NO_WRITE',
      sourceBindingSha256,
      artifactSha256s,
      manifestSha256: packet.recoveryManifest.manifestSha256,
      writerCalls: 0,
    },
  ].map((event) => ({
    ...event,
    eventSha256: `sha256:${sha256Text(stableJson(event))}`,
  }));
}

function expectedLogBody(packet) {
  return {
    logId: 'synthetic-google-docs-recovery-replay-log-v1',
    sourceBindingSha256: `sha256:${sha256Text(stableJson(packet.sourceBinding))}`,
    manifestSha256: packet.recoveryManifest.manifestSha256,
    artifactSha256s: packet.returnedArtifacts.map((artifact) => artifact.payloadSha256),
    events: expectedEvents(packet),
  };
}

function expectedReplayBody(packet) {
  return {
    replayId: 'synthetic-google-docs-recovery-replay-receipt-v1',
    sourceBindingSha256: `sha256:${sha256Text(stableJson(packet.sourceBinding))}`,
    logSha256: packet.recoveryLog.logSha256,
    artifactSha256s: packet.returnedArtifacts.map((artifact) => artifact.payloadSha256),
    replayStatus: 'IDEMPOTENT_REPLAY_NO_WRITE',
    recoveredArtifacts: packet.returnedArtifacts.length,
    writerCalls: 0,
    applyAdmitted: 0,
    productMutations: 0,
    outputClass: 'QUARANTINE_PREVIEW_ONLY',
  };
}

function expectedOracleBody(packet) {
  return {
    oracleId: 'synthetic-google-docs-recovery-replay-oracle-v1',
    expectedAction: 'RECOVER_OR_REPLAY_QUARANTINE_ONLY',
    expectedRecoveryEvents: 3,
    expectedIdempotentReplays: 1,
    expectedWriterCalls: 0,
    expectedApplyAdmitted: 0,
    expectedProductMutations: 0,
    expectedArtifactCount: packet.returnedArtifacts.length,
    manifestSha256: packet.recoveryManifest.manifestSha256,
    logSha256: packet.recoveryLog.logSha256,
    replaySha256: packet.replayReceipt.replaySha256,
  };
}

function artifact(overrides = {}) {
  const payloadText = overrides.payloadText ?? [
    'Yalken Google Docs local recovery replay synthetic returned artifact.',
    'Disposable only. No user document. No Google account.',
    'This payload may be recovered or replayed only as quarantined preview evidence.',
  ].join('\n');
  return {
    artifactId: 'google-docs-recovery-replay-returned-office-mode-docx',
    fileName: 'synthetic-google-docs-recovery-replay-returned-office-mode.docx',
    mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    payloadText,
    payloadSha256: `sha256:${sha256Text(payloadText)}`,
    sizeBytes: Buffer.byteLength(payloadText, 'utf8'),
    contentClasses: ['plainText', 'paragraphBreaks'],
    ...overrides,
  };
}

function replayReceipt(packet, overrides = {}) {
  const body = {
    ...withoutDigest(packet.replayReceipt, 'replaySha256'),
    ...overrides,
  };
  return {
    ...body,
    replaySha256: `sha256:${sha256Text(stableJson(body))}`,
  };
}

function recoveryOracle(packet, overrides = {}) {
  const body = {
    ...withoutDigest(packet.recoveryOracle, 'oracleSha256'),
    ...overrides,
  };
  return {
    ...body,
    oracleSha256: `sha256:${sha256Text(stableJson(body))}`,
  };
}

function oracle(packet) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) return 'GOOGLE_RECOVERY_REPLAY_SCHEMA_INVALID';
  if (packet.schemaVersion !== 'yalken.googleDocs.localRecoveryReplay.v1') return 'GOOGLE_RECOVERY_REPLAY_SCHEMA_INVALID';
  if (packet.provider !== 'google-docs' || packet.inheritedEvidenceProfileId) return 'GOOGLE_RECOVERY_REPLAY_WORD_EVIDENCE_INHERITANCE';
  if (!['google-docs-office-mode-post-d1-v1', 'google-docs-native-conversion-post-d1-v1'].includes(packet.profileId)) return 'GOOGLE_RECOVERY_REPLAY_PROFILE_NOT_DECLARED';
  if (packet.localOnly !== true
    || packet.googleAccountUsed === true
    || packet.networkRuntimeUsed === true
    || packet.productRuntimeWired === true
    || packet.physicalGoogleEvidence === true
    || packet.userDocument === true
    || packet.claims?.supportProven === true
    || packet.claims?.importProven === true
    || packet.claims?.roundtripProven === true
    || packet.claims?.returnIntakeTrusted === true
    || packet.claims?.previewDecisionTrusted === true
    || packet.claims?.recoveryTrusted === true
    || packet.claims?.applyAuthority === true
    || packet.claims?.productMutationAuthority === true) return 'GOOGLE_RECOVERY_REPLAY_OVERCLAIM';
  if (packet.upstreamLocalPreviewOnlyNoApply?.status !== 'GOOGLE_DOCS_LOCAL_PREVIEW_ONLY_NO_APPLY_V1_LOCAL_VERIFIED'
    || packet.upstreamLocalPreviewOnlyNoApply?.result !== 'PREVIEW_ONLY_NO_APPLY_NEEDS_REAL_GOOGLE_E2E'
    || packet.upstreamLocalPreviewOnlyNoApply?.action !== 'PREVIEW_ONLY'
    || packet.upstreamLocalPreviewOnlyNoApply?.applyAuthority !== 'DENY') return 'GOOGLE_RECOVERY_REPLAY_UPSTREAM_PREVIEW_NOT_BOUND';
  if (!Array.isArray(packet.limitations) || packet.limitations.length === 0) return 'GOOGLE_RECOVERY_REPLAY_SCHEMA_INVALID';
  if (packet.limitations.some((item) => /^(UNKNOWN|ABSTAIN)$/u.test(String(item || '').trim()))) return 'GOOGLE_RECOVERY_REPLAY_UNKNOWN_ABSTAIN_NOT_PASS';

  const source = expectedSource();
  for (const [key, value] of Object.entries(source)) {
    if (packet.sourceBinding?.[key] !== value) return 'GOOGLE_RECOVERY_REPLAY_SOURCE_TRANSPLANT';
  }

  if (!Array.isArray(packet.returnedArtifacts) || packet.returnedArtifacts.length === 0 || packet.returnedArtifacts.length > 8) return 'GOOGLE_RECOVERY_REPLAY_SCHEMA_INVALID';
  const artifactIds = new Set();
  const payloadDigests = new Set();
  let aggregateBytes = 0;
  for (const entry of packet.returnedArtifacts) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return 'GOOGLE_RECOVERY_REPLAY_SCHEMA_INVALID';
    if (typeof entry.artifactId !== 'string' || entry.artifactId.length === 0) return 'GOOGLE_RECOVERY_REPLAY_SCHEMA_INVALID';
    if (artifactIds.has(entry.artifactId)) return 'GOOGLE_RECOVERY_REPLAY_DUPLICATE_REPLAY_REJECTED';
    artifactIds.add(entry.artifactId);
    if (entry.mediaType !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'GOOGLE_RECOVERY_REPLAY_UNSUPPORTED_FORMAT_ABSTAIN';
    if (typeof entry.payloadText !== 'string' || entry.payloadText.length === 0) return 'GOOGLE_RECOVERY_REPLAY_SCHEMA_INVALID';
    if (entry.payloadSha256 !== `sha256:${sha256Text(entry.payloadText)}`) return 'GOOGLE_RECOVERY_REPLAY_ARTIFACT_DIGEST_MISMATCH';
    if (entry.sizeBytes !== Buffer.byteLength(entry.payloadText, 'utf8')) return 'GOOGLE_RECOVERY_REPLAY_ARTIFACT_DIGEST_MISMATCH';
    if (payloadDigests.has(entry.payloadSha256)) return 'GOOGLE_RECOVERY_REPLAY_DUPLICATE_REPLAY_REJECTED';
    payloadDigests.add(entry.payloadSha256);
    aggregateBytes += entry.sizeBytes;
  }
  if (aggregateBytes > 64 * 1024) return 'GOOGLE_RECOVERY_REPLAY_SCHEMA_INVALID';

  if (!packet.recoveryManifest || typeof packet.recoveryManifest !== 'object' || Array.isArray(packet.recoveryManifest)) return 'GOOGLE_RECOVERY_REPLAY_MANIFEST_DIGEST_MISMATCH';
  const manifestBody = expectedManifestBody(packet);
  if (stableJson(withoutDigest(packet.recoveryManifest, 'manifestSha256')) !== stableJson(manifestBody)) return 'GOOGLE_RECOVERY_REPLAY_MANIFEST_DIGEST_MISMATCH';
  if (packet.recoveryManifest.manifestSha256 !== `sha256:${sha256Text(stableJson(manifestBody))}`) return 'GOOGLE_RECOVERY_REPLAY_MANIFEST_DIGEST_MISMATCH';

  if (!packet.recoveryLog || typeof packet.recoveryLog !== 'object' || Array.isArray(packet.recoveryLog)) return 'GOOGLE_RECOVERY_REPLAY_LOG_DIGEST_MISMATCH';
  const logBody = expectedLogBody(packet);
  if (stableJson(withoutDigest(packet.recoveryLog, 'logSha256')) !== stableJson(logBody)) return 'GOOGLE_RECOVERY_REPLAY_LOG_DIGEST_MISMATCH';
  if (packet.recoveryLog.logSha256 !== `sha256:${sha256Text(stableJson(logBody))}`) return 'GOOGLE_RECOVERY_REPLAY_LOG_DIGEST_MISMATCH';

  if (!packet.replayReceipt || typeof packet.replayReceipt !== 'object' || Array.isArray(packet.replayReceipt)) return 'GOOGLE_RECOVERY_REPLAY_RECEIPT_DIGEST_MISMATCH';
  if (packet.replayReceipt.replayStatus !== 'IDEMPOTENT_REPLAY_NO_WRITE' || packet.replayReceipt.outputClass !== 'QUARANTINE_PREVIEW_ONLY') return 'GOOGLE_RECOVERY_REPLAY_RECEIPT_OVERCLAIM';
  if (packet.replayReceipt.recoveredArtifacts !== packet.returnedArtifacts.length) return 'GOOGLE_RECOVERY_REPLAY_PARTIAL_OUTPUT_CORRUPT';
  if (packet.replayReceipt.writerCalls !== 0 || packet.replayReceipt.applyAdmitted !== 0 || packet.replayReceipt.productMutations !== 0) return 'GOOGLE_RECOVERY_REPLAY_WRITER_CALL_OVERCLAIM';
  const replayBody = expectedReplayBody(packet);
  if (stableJson(withoutDigest(packet.replayReceipt, 'replaySha256')) !== stableJson(replayBody)) return 'GOOGLE_RECOVERY_REPLAY_RECEIPT_DIGEST_MISMATCH';
  if (packet.replayReceipt.replaySha256 !== `sha256:${sha256Text(stableJson(replayBody))}`) return 'GOOGLE_RECOVERY_REPLAY_RECEIPT_DIGEST_MISMATCH';

  if (!packet.recoveryOracle || typeof packet.recoveryOracle !== 'object' || Array.isArray(packet.recoveryOracle)) return 'GOOGLE_RECOVERY_REPLAY_ORACLE_DIGEST_MISMATCH';
  if (packet.recoveryOracle.expectedWriterCalls !== 0 || packet.recoveryOracle.expectedApplyAdmitted !== 0 || packet.recoveryOracle.expectedProductMutations !== 0) return 'GOOGLE_RECOVERY_REPLAY_ORACLE_OVERCLAIM';
  const oracleBody = expectedOracleBody(packet);
  if (stableJson(withoutDigest(packet.recoveryOracle, 'oracleSha256')) !== stableJson(oracleBody)) return 'GOOGLE_RECOVERY_REPLAY_ORACLE_DIGEST_MISMATCH';
  if (packet.recoveryOracle.oracleSha256 !== `sha256:${sha256Text(stableJson(oracleBody))}`) return 'GOOGLE_RECOVERY_REPLAY_ORACLE_DIGEST_MISMATCH';

  return 'GOOGLE_RECOVERY_REPLAY_LOCAL_NO_APPLY_DECISION';
}

function hostileCases(basePacket) {
  const duplicateArtifact = artifact({
    artifactId: 'google-docs-recovery-replay-returned-office-mode-docx-duplicate',
    payloadSha256: basePacket.returnedArtifacts[0].payloadSha256,
  });
  return [
    ['missing schema', (packet) => { packet.schemaVersion = ''; }],
    ['unknown profile', (packet) => { packet.profileId = 'word-mac-16.112-26081010'; }],
    ['word inheritance', (packet) => { packet.provider = 'word'; packet.inheritedEvidenceProfileId = 'word-mac-16.112-26081010'; }],
    ['support overclaim', (packet) => { packet.claims.supportProven = true; }],
    ['import overclaim', (packet) => { packet.claims.importProven = true; }],
    ['roundtrip overclaim', (packet) => { packet.claims.roundtripProven = true; }],
    ['return intake trust overclaim', (packet) => { packet.claims.returnIntakeTrusted = true; }],
    ['preview trust overclaim', (packet) => { packet.claims.previewDecisionTrusted = true; }],
    ['recovery trust overclaim', (packet) => { packet.claims.recoveryTrusted = true; }],
    ['apply overclaim', (packet) => { packet.claims.applyAuthority = true; }],
    ['product mutation overclaim', (packet) => { packet.claims.productMutationAuthority = true; }],
    ['runtime overclaim', (packet) => { packet.productRuntimeWired = true; }],
    ['network overclaim', (packet) => { packet.networkRuntimeUsed = true; }],
    ['account overclaim', (packet) => { packet.googleAccountUsed = true; }],
    ['user document overclaim', (packet) => { packet.userDocument = true; }],
    ['physical provider overclaim', (packet) => { packet.physicalGoogleEvidence = true; }],
    ['missing upstream preview', (packet) => { packet.upstreamLocalPreviewOnlyNoApply.status = 'UNKNOWN'; }],
    ['source transplant', (packet) => { packet.sourceBinding = expectedSource({ documentId: 'foreign-doc' }); }],
    ['stale canonical revision', (packet) => { packet.sourceBinding = expectedSource({ canonicalRevision: `sha256:${sha256Text('stale')}` }); }],
    ['stale working revision', (packet) => { packet.sourceBinding = expectedSource({ workingRevision: `sha256:${sha256Text('stale')}` }); }],
    ['stale generation', (packet) => { packet.sourceBinding = expectedSource({ generation: 2 }); }],
    ['source fence replay', (packet) => { packet.sourceBinding = expectedSource({ sourceFence: `sha256:${sha256Text('replayed-fence')}` }); }],
    ['artifact digest mismatch', (packet) => { packet.returnedArtifacts[0].payloadSha256 = `sha256:${sha256Text('stale')}`; }],
    ['unsupported media type', (packet) => { packet.returnedArtifacts[0].mediaType = 'text/html'; }],
    ['duplicate returned bytes', (packet) => { packet.returnedArtifacts.push(duplicateArtifact); }],
    ['manifest digest mismatch', (packet) => { packet.recoveryManifest.manifestSha256 = `sha256:${sha256Text('stale')}`; }],
    ['log digest mismatch', (packet) => { packet.recoveryLog.logSha256 = `sha256:${sha256Text('stale')}`; }],
    ['event digest mismatch', (packet) => { packet.recoveryLog.events[0].eventSha256 = `sha256:${sha256Text('stale')}`; }],
    ['replay digest mismatch', (packet) => { packet.replayReceipt.replaySha256 = `sha256:${sha256Text('stale')}`; }],
    ['writer calls overclaim', (packet) => { packet.replayReceipt = replayReceipt(packet, { writerCalls: 1 }); }],
    ['apply overclaim in receipt', (packet) => { packet.replayReceipt = replayReceipt(packet, { applyAdmitted: 1 }); }],
    ['mutating replay status', (packet) => { packet.replayReceipt = replayReceipt(packet, { replayStatus: 'APPLIED' }); }],
    ['partial corrupt output', (packet) => { packet.replayReceipt = replayReceipt(packet, { recoveredArtifacts: 0 }); }],
    ['oracle digest mismatch', (packet) => { packet.recoveryOracle.oracleSha256 = `sha256:${sha256Text('stale')}`; }],
    ['oracle writer overclaim', (packet) => { packet.recoveryOracle = recoveryOracle(packet, { expectedWriterCalls: 1 }); }],
    ['unknown limitation cannot pass', (packet) => { packet.limitations = ['UNKNOWN']; }],
  ];
}

function semanticMutations(basePacket) {
  return [
    ['claim support', (packet) => { packet.claims.supportProven = true; }],
    ['claim import', (packet) => { packet.claims.importProven = true; }],
    ['claim roundtrip', (packet) => { packet.claims.roundtripProven = true; }],
    ['claim apply', (packet) => { packet.claims.applyAuthority = true; }],
    ['claim mutation', (packet) => { packet.claims.productMutationAuthority = true; }],
    ['claim trusted recovery', (packet) => { packet.claims.recoveryTrusted = true; }],
    ['network used', (packet) => { packet.networkRuntimeUsed = true; }],
    ['google account used', (packet) => { packet.googleAccountUsed = true; }],
    ['physical evidence used', (packet) => { packet.physicalGoogleEvidence = true; }],
    ['user document used', (packet) => { packet.userDocument = true; }],
    ['foreign provider', (packet) => { packet.provider = 'word'; }],
    ['foreign profile', (packet) => { packet.profileId = 'word-mac-16.112-26081010'; }],
    ['foreign doc', (packet) => { packet.sourceBinding.documentId = 'foreign-doc'; }],
    ['stale generation', (packet) => { packet.sourceBinding.generation = 2; }],
    ['stale fence', (packet) => { packet.sourceBinding.sourceFence = `sha256:${sha256Text('replayed-fence')}`; }],
    ['payload mismatch', (packet) => { packet.returnedArtifacts[0].payloadSha256 = `sha256:${sha256Text('other')}`; }],
    ['duplicate id', (packet) => { packet.returnedArtifacts.push({ ...packet.returnedArtifacts[0] }); }],
    ['manifest class drift', (packet) => { packet.recoveryManifest.recoveryClass = 'APPLY_READY'; }],
    ['manifest digest drift', (packet) => { packet.recoveryManifest.manifestSha256 = `sha256:${sha256Text('other')}`; }],
    ['log event order drift', (packet) => { packet.recoveryLog.events.reverse(); }],
    ['log digest drift', (packet) => { packet.recoveryLog.logSha256 = `sha256:${sha256Text('other')}`; }],
    ['replay writer', (packet) => { packet.replayReceipt = replayReceipt(packet, { writerCalls: 1 }); }],
    ['replay apply', (packet) => { packet.replayReceipt = replayReceipt(packet, { applyAdmitted: 1 }); }],
    ['replay mutation', (packet) => { packet.replayReceipt = replayReceipt(packet, { productMutations: 1 }); }],
    ['oracle writer', (packet) => { packet.recoveryOracle = recoveryOracle(packet, { expectedWriterCalls: 1 }); }],
    ['unknown limitation', (packet) => { packet.limitations = ['ABSTAIN']; }],
  ];
}

function run() {
  const basePacket = baseline();
  const observations = [];
  const mismatches = [];
  const survivors = [];

  const baseExpected = oracle(basePacket);
  const baseActual = evaluateGoogleDocsLocalRecoveryReplayContract(basePacket).code;
  observations.push({ name: 'baseline', oracle: baseExpected, evaluator: baseActual });
  if (baseExpected !== baseActual) {
    mismatches.push({ name: 'baseline', oracle: baseExpected, evaluator: baseActual });
  }

  const hostiles = hostileCases(basePacket);
  for (const [name, mutate] of hostiles) {
    const packet = clone(basePacket);
    mutate(packet);
    const expected = oracle(packet);
    const actualResult = evaluateGoogleDocsLocalRecoveryReplayContract(packet);
    observations.push({ name, oracle: expected, evaluator: actualResult.code });
    if (expected !== actualResult.code) mismatches.push({ name, oracle: expected, evaluator: actualResult.code });
    if (actualResult.ok) survivors.push({ name, code: actualResult.code });
  }

  const mutants = semanticMutations(basePacket);
  for (const [name, mutate] of mutants) {
    const packet = clone(basePacket);
    mutate(packet);
    const actualResult = evaluateGoogleDocsLocalRecoveryReplayContract(packet);
    if (actualResult.ok) survivors.push({ name, code: actualResult.code });
  }

  const report = {
    ok: mismatches.length === 0 && survivors.length === 0,
    finiteCases: 1,
    hostileCases: hostiles.length,
    semanticMutants: mutants.length,
    survivors: survivors.length,
    mismatches: mismatches.length,
    observations,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
}

run();
