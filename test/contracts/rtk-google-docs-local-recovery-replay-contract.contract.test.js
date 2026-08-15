const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(REPO_ROOT, 'scripts/ops/rtk-google-docs-local-recovery-replay-contract-v1.mjs');
const MODEL_PATH = path.join(REPO_ROOT, 'scripts/ops/rtk-google-docs-local-recovery-replay-contract-model.mjs');

const REGISTRY_PATH = 'docs/OPS/RTK/GOOGLE_BUILD_PROFILE_REGISTRY_V1.json';
const G00_MATRIX_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_CAPABILITY_MATRIX_V1.json';
const G00_DISCOVERY_RECEIPT_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_DISCOVERY_RECEIPT.json';
const RTK_CATALOG_PATH = 'docs/OPS/RTK/RTK_TEST_GRAPH_CATALOG_V1.json';
const RECEIPT_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_LOCAL_RECOVERY_REPLAY_CONTRACT_V1_RECEIPT.json';
const CONTRACT_BASENAME = 'rtk-google-docs-local-recovery-replay-contract.contract.test.js';

const SCHEMA_VERSION = 'yalken.googleDocs.localRecoveryReplay.v1';
const RECEIPT_SCHEMA_VERSION = 'yalken.googleDocs.localRecoveryReplay.receipt.v1';
const STATUS = 'GOOGLE_DOCS_LOCAL_RECOVERY_REPLAY_CONTRACT_V1_LOCAL_VERIFIED';
const RESULT = 'RECOVERY_REPLAY_CONTRACT_LOCAL_ONLY_NEEDS_REAL_GOOGLE_E2E';

async function loadModule() {
  return import(pathToFileURL(MODULE_PATH).href);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function sourceBinding(overrides = {}) {
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

function returnedArtifact(overrides = {}) {
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

function recoveryManifest(returnedArtifacts, binding, overrides = {}) {
  const body = {
    manifestId: 'synthetic-google-docs-recovery-replay-manifest-v1',
    sourceBindingSha256: `sha256:${sha256Text(stableJson(binding))}`,
    artifactBindings: returnedArtifacts.map((artifact) => ({
      artifactId: artifact.artifactId,
      mediaType: artifact.mediaType,
      payloadSha256: artifact.payloadSha256,
      sizeBytes: artifact.sizeBytes,
    })),
    aggregatePayloadSha256: `sha256:${sha256Text(returnedArtifacts.map((artifact) => artifact.payloadSha256).join('\n'))}`,
    recoveryClass: 'LOCAL_QUARANTINE_RECOVERY_REPLAY_ONLY',
    ...overrides,
  };
  return {
    ...body,
    manifestSha256: `sha256:${sha256Text(stableJson(body))}`,
  };
}

function recoveryLog(binding, returnedArtifacts, manifest, overrides = {}) {
  const events = [
    {
      eventId: 'google-recovery-event-1',
      eventType: 'QUARANTINE_MANIFEST_OBSERVED',
      sourceBindingSha256: manifest.sourceBindingSha256,
      artifactSha256s: returnedArtifacts.map((artifact) => artifact.payloadSha256),
      manifestSha256: manifest.manifestSha256,
    },
    {
      eventId: 'google-recovery-event-2',
      eventType: 'RECOVERY_RECONCILED_WITHOUT_WRITE',
      sourceBindingSha256: manifest.sourceBindingSha256,
      artifactSha256s: returnedArtifacts.map((artifact) => artifact.payloadSha256),
      manifestSha256: manifest.manifestSha256,
      writerCalls: 0,
    },
    {
      eventId: 'google-recovery-event-3',
      eventType: 'REPLAY_DETECTED_IDEMPOTENT_NO_WRITE',
      sourceBindingSha256: manifest.sourceBindingSha256,
      artifactSha256s: returnedArtifacts.map((artifact) => artifact.payloadSha256),
      manifestSha256: manifest.manifestSha256,
      writerCalls: 0,
    },
  ];
  const body = {
    logId: 'synthetic-google-docs-recovery-replay-log-v1',
    sourceBindingSha256: `sha256:${sha256Text(stableJson(binding))}`,
    manifestSha256: manifest.manifestSha256,
    artifactSha256s: returnedArtifacts.map((artifact) => artifact.payloadSha256),
    events: events.map((event) => ({
      ...event,
      eventSha256: `sha256:${sha256Text(stableJson(event))}`,
    })),
    ...overrides,
  };
  return {
    ...body,
    logSha256: `sha256:${sha256Text(stableJson(body))}`,
  };
}

function replayReceipt(binding, returnedArtifacts, log, overrides = {}) {
  const body = {
    replayId: 'synthetic-google-docs-recovery-replay-receipt-v1',
    sourceBindingSha256: `sha256:${sha256Text(stableJson(binding))}`,
    logSha256: log.logSha256,
    artifactSha256s: returnedArtifacts.map((artifact) => artifact.payloadSha256),
    replayStatus: 'IDEMPOTENT_REPLAY_NO_WRITE',
    recoveredArtifacts: returnedArtifacts.length,
    writerCalls: 0,
    applyAdmitted: 0,
    productMutations: 0,
    outputClass: 'QUARANTINE_PREVIEW_ONLY',
    ...overrides,
  };
  return {
    ...body,
    replaySha256: `sha256:${sha256Text(stableJson(body))}`,
  };
}

function recoveryOracle(returnedArtifacts, manifest, log, replay, overrides = {}) {
  const body = {
    oracleId: 'synthetic-google-docs-recovery-replay-oracle-v1',
    expectedAction: 'RECOVER_OR_REPLAY_QUARANTINE_ONLY',
    expectedRecoveryEvents: 3,
    expectedIdempotentReplays: 1,
    expectedWriterCalls: 0,
    expectedApplyAdmitted: 0,
    expectedProductMutations: 0,
    expectedArtifactCount: returnedArtifacts.length,
    manifestSha256: manifest.manifestSha256,
    logSha256: log.logSha256,
    replaySha256: replay.replaySha256,
    ...overrides,
  };
  return {
    ...body,
    oracleSha256: `sha256:${sha256Text(stableJson(body))}`,
  };
}

function recoveryPacket(overrides = {}) {
  const binding = overrides.sourceBinding || sourceBinding();
  const artifacts = overrides.returnedArtifacts || [returnedArtifact()];
  const manifest = overrides.recoveryManifest || recoveryManifest(artifacts, binding);
  const log = overrides.recoveryLog || recoveryLog(binding, artifacts, manifest);
  const replay = overrides.replayReceipt || replayReceipt(binding, artifacts, log);
  const oracle = overrides.recoveryOracle || recoveryOracle(artifacts, manifest, log, replay);
  const base = {
    schemaVersion: SCHEMA_VERSION,
    packetId: 'synthetic-google-docs-recovery-replay-office-mode-docx-v1',
    provider: 'google-docs',
    profileId: 'google-docs-office-mode-post-d1-v1',
    localOnly: true,
    googleAccountUsed: false,
    networkRuntimeUsed: false,
    productRuntimeWired: false,
    physicalGoogleEvidence: false,
    userDocument: false,
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
    sourceBinding: binding,
    returnedArtifacts: artifacts,
    recoveryManifest: manifest,
    recoveryLog: log,
    replayReceipt: replay,
    recoveryOracle: oracle,
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
  return { ...base, ...overrides };
}

function copyFixtureFile(tempRoot, relativePath) {
  const sourcePath = path.join(REPO_ROOT, relativePath);
  const targetPath = path.join(tempRoot, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

test('Google Docs local recovery/replay admits only idempotent quarantine recovery with zero writer calls', async () => {
  const mod = await loadModule();
  assert.equal(mod.SCHEMA_VERSION, SCHEMA_VERSION);
  assert.equal(mod.RECEIPT_SCHEMA_VERSION, RECEIPT_SCHEMA_VERSION);

  const result = mod.evaluateGoogleDocsLocalRecoveryReplayContract(recoveryPacket());
  assert.equal(result.ok, true);
  assert.equal(result.status, STATUS);
  assert.equal(result.result, RESULT);
  assert.equal(result.action, 'RECOVER_OR_REPLAY_QUARANTINE_ONLY');
  assert.equal(result.realAccountE2E, 'WAIT_AUTHORITY_REQUIRED_FOR_REAL_PROVIDER_EVIDENCE');
  assert.equal(result.localRecoveryReplayOnly, true);
  assert.equal(result.noProductMutation, true);
  assert.equal(result.applyAuthority, 'DENY');
  assert.equal(result.supportClaimed, false);
  assert.equal(result.importClaimed, false);
  assert.equal(result.roundtripClaimed, false);
  assert.equal(result.returnIntakeTrusted, false);
  assert.equal(result.previewDecisionTrusted, false);
  assert.equal(result.recoveryTrusted, false);
  assert.equal(result.counts.returnedArtifacts, 1);
  assert.equal(result.counts.recoveryEvents, 3);
  assert.equal(result.counts.idempotentReplays, 1);
  assert.equal(result.counts.writerCalls, 0);
  assert.equal(result.counts.applyAdmitted, 0);
  assert.equal(result.counts.productMutations, 0);
  assert.equal(result.packetDigest.startsWith('sha256:'), true);
  assert.equal(result.logDigest.startsWith('sha256:'), true);
  assert.equal(result.replayDigest.startsWith('sha256:'), true);
  assert.equal(result.oracleDigest.startsWith('sha256:'), true);
});

test('Google Docs local recovery/replay rejects overclaims, stale source, replay/tamper, partial output, and UNKNOWN/ABSTAIN as PASS', async () => {
  const mod = await loadModule();
  const baseline = recoveryPacket();
  const duplicateArtifact = returnedArtifact({
    artifactId: 'google-docs-recovery-replay-returned-office-mode-docx-duplicate',
    payloadSha256: baseline.returnedArtifacts[0].payloadSha256,
  });
  const cases = [
    ['missing schema', { ...baseline, schemaVersion: '' }, 'GOOGLE_RECOVERY_REPLAY_SCHEMA_INVALID'],
    ['unknown profile', { ...baseline, profileId: 'word-mac-16.112-26081010' }, 'GOOGLE_RECOVERY_REPLAY_PROFILE_NOT_DECLARED'],
    ['word inheritance', { ...baseline, provider: 'word', inheritedEvidenceProfileId: 'word-mac-16.112-26081010' }, 'GOOGLE_RECOVERY_REPLAY_WORD_EVIDENCE_INHERITANCE'],
    ['support overclaim', { ...baseline, claims: { ...baseline.claims, supportProven: true } }, 'GOOGLE_RECOVERY_REPLAY_OVERCLAIM'],
    ['import overclaim', { ...baseline, claims: { ...baseline.claims, importProven: true } }, 'GOOGLE_RECOVERY_REPLAY_OVERCLAIM'],
    ['roundtrip overclaim', { ...baseline, claims: { ...baseline.claims, roundtripProven: true } }, 'GOOGLE_RECOVERY_REPLAY_OVERCLAIM'],
    ['return intake trust overclaim', { ...baseline, claims: { ...baseline.claims, returnIntakeTrusted: true } }, 'GOOGLE_RECOVERY_REPLAY_OVERCLAIM'],
    ['preview trust overclaim', { ...baseline, claims: { ...baseline.claims, previewDecisionTrusted: true } }, 'GOOGLE_RECOVERY_REPLAY_OVERCLAIM'],
    ['recovery trust overclaim', { ...baseline, claims: { ...baseline.claims, recoveryTrusted: true } }, 'GOOGLE_RECOVERY_REPLAY_OVERCLAIM'],
    ['apply overclaim', { ...baseline, claims: { ...baseline.claims, applyAuthority: true } }, 'GOOGLE_RECOVERY_REPLAY_OVERCLAIM'],
    ['product mutation overclaim', { ...baseline, claims: { ...baseline.claims, productMutationAuthority: true } }, 'GOOGLE_RECOVERY_REPLAY_OVERCLAIM'],
    ['runtime overclaim', { ...baseline, productRuntimeWired: true }, 'GOOGLE_RECOVERY_REPLAY_OVERCLAIM'],
    ['network overclaim', { ...baseline, networkRuntimeUsed: true }, 'GOOGLE_RECOVERY_REPLAY_OVERCLAIM'],
    ['account overclaim', { ...baseline, googleAccountUsed: true }, 'GOOGLE_RECOVERY_REPLAY_OVERCLAIM'],
    ['user document overclaim', { ...baseline, userDocument: true }, 'GOOGLE_RECOVERY_REPLAY_OVERCLAIM'],
    ['physical provider overclaim', { ...baseline, physicalGoogleEvidence: true }, 'GOOGLE_RECOVERY_REPLAY_OVERCLAIM'],
    ['missing upstream preview', { ...baseline, upstreamLocalPreviewOnlyNoApply: { ...baseline.upstreamLocalPreviewOnlyNoApply, status: 'UNKNOWN' } }, 'GOOGLE_RECOVERY_REPLAY_UPSTREAM_PREVIEW_NOT_BOUND'],
    ['source transplant', { ...baseline, sourceBinding: sourceBinding({ documentId: 'foreign-doc' }) }, 'GOOGLE_RECOVERY_REPLAY_SOURCE_TRANSPLANT'],
    ['stale canonical revision', { ...baseline, sourceBinding: sourceBinding({ canonicalRevision: `sha256:${sha256Text('stale')}` }) }, 'GOOGLE_RECOVERY_REPLAY_SOURCE_TRANSPLANT'],
    ['stale working revision', { ...baseline, sourceBinding: sourceBinding({ workingRevision: `sha256:${sha256Text('stale')}` }) }, 'GOOGLE_RECOVERY_REPLAY_SOURCE_TRANSPLANT'],
    ['stale generation', { ...baseline, sourceBinding: sourceBinding({ generation: 2 }) }, 'GOOGLE_RECOVERY_REPLAY_SOURCE_TRANSPLANT'],
    ['source fence replay', { ...baseline, sourceBinding: sourceBinding({ sourceFence: `sha256:${sha256Text('replayed-fence')}` }) }, 'GOOGLE_RECOVERY_REPLAY_SOURCE_TRANSPLANT'],
    ['artifact digest mismatch', { ...baseline, returnedArtifacts: [{ ...baseline.returnedArtifacts[0], payloadSha256: `sha256:${sha256Text('stale')}` }] }, 'GOOGLE_RECOVERY_REPLAY_ARTIFACT_DIGEST_MISMATCH'],
    ['unsupported media type', { ...baseline, returnedArtifacts: [{ ...baseline.returnedArtifacts[0], mediaType: 'text/html' }] }, 'GOOGLE_RECOVERY_REPLAY_UNSUPPORTED_FORMAT_ABSTAIN'],
    ['duplicate returned bytes', { ...baseline, returnedArtifacts: [baseline.returnedArtifacts[0], duplicateArtifact] }, 'GOOGLE_RECOVERY_REPLAY_DUPLICATE_REPLAY_REJECTED'],
    ['manifest digest mismatch', { ...baseline, recoveryManifest: { ...baseline.recoveryManifest, manifestSha256: `sha256:${sha256Text('stale')}` } }, 'GOOGLE_RECOVERY_REPLAY_MANIFEST_DIGEST_MISMATCH'],
    ['log digest mismatch', { ...baseline, recoveryLog: { ...baseline.recoveryLog, logSha256: `sha256:${sha256Text('stale')}` } }, 'GOOGLE_RECOVERY_REPLAY_LOG_DIGEST_MISMATCH'],
    ['event digest mismatch', { ...baseline, recoveryLog: { ...baseline.recoveryLog, events: [{ ...baseline.recoveryLog.events[0], eventSha256: `sha256:${sha256Text('stale')}` }, ...baseline.recoveryLog.events.slice(1)] } }, 'GOOGLE_RECOVERY_REPLAY_LOG_DIGEST_MISMATCH'],
    ['replay digest mismatch', { ...baseline, replayReceipt: { ...baseline.replayReceipt, replaySha256: `sha256:${sha256Text('stale')}` } }, 'GOOGLE_RECOVERY_REPLAY_RECEIPT_DIGEST_MISMATCH'],
    ['writer calls overclaim', { ...baseline, replayReceipt: replayReceipt(baseline.sourceBinding, baseline.returnedArtifacts, baseline.recoveryLog, { writerCalls: 1 }) }, 'GOOGLE_RECOVERY_REPLAY_WRITER_CALL_OVERCLAIM'],
    ['apply overclaim in receipt', { ...baseline, replayReceipt: replayReceipt(baseline.sourceBinding, baseline.returnedArtifacts, baseline.recoveryLog, { applyAdmitted: 1 }) }, 'GOOGLE_RECOVERY_REPLAY_WRITER_CALL_OVERCLAIM'],
    ['mutating replay status', { ...baseline, replayReceipt: replayReceipt(baseline.sourceBinding, baseline.returnedArtifacts, baseline.recoveryLog, { replayStatus: 'APPLIED' }) }, 'GOOGLE_RECOVERY_REPLAY_RECEIPT_OVERCLAIM'],
    ['partial corrupt output', { ...baseline, replayReceipt: replayReceipt(baseline.sourceBinding, baseline.returnedArtifacts, baseline.recoveryLog, { recoveredArtifacts: 0 }) }, 'GOOGLE_RECOVERY_REPLAY_PARTIAL_OUTPUT_CORRUPT'],
    ['oracle digest mismatch', { ...baseline, recoveryOracle: { ...baseline.recoveryOracle, oracleSha256: `sha256:${sha256Text('stale')}` } }, 'GOOGLE_RECOVERY_REPLAY_ORACLE_DIGEST_MISMATCH'],
    ['oracle writer overclaim', { ...baseline, recoveryOracle: recoveryOracle(baseline.returnedArtifacts, baseline.recoveryManifest, baseline.recoveryLog, baseline.replayReceipt, { expectedWriterCalls: 1 }) }, 'GOOGLE_RECOVERY_REPLAY_ORACLE_OVERCLAIM'],
    ['unknown limitation cannot pass', { ...baseline, limitations: ['UNKNOWN'] }, 'GOOGLE_RECOVERY_REPLAY_UNKNOWN_ABSTAIN_NOT_PASS'],
  ];

  for (const [name, packet, code] of cases) {
    const result = mod.evaluateGoogleDocsLocalRecoveryReplayContract(packet);
    assert.equal(result.ok, false, name);
    assert.equal(result.result, 'FAIL_CLOSED', name);
    assert.equal(result.code, code, name);
    assert.equal(result.counts.writerCalls, 0, name);
    assert.equal(result.counts.applyAdmitted, 0, name);
    assert.equal(result.counts.productMutations, 0, name);
  }
});

test('Google Docs local recovery/replay writes exact receipts and keeps recovery row honest', async (t) => {
  const mod = await loadModule();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-google-recovery-replay-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  for (const relativePath of [REGISTRY_PATH, G00_MATRIX_PATH, G00_DISCOVERY_RECEIPT_PATH, RTK_CATALOG_PATH]) {
    copyFixtureFile(tempRoot, relativePath);
  }

  const json = mod.writeGoogleDocsLocalRecoveryReplayArtifacts({ repoRoot: tempRoot });
  assert.equal(json.ok, true);
  assert.equal(json.status, STATUS);
  assert.equal(json.result, RESULT);
  assert.equal(json.physicalGoogleEvidence, 0);
  assert.equal(json.productRuntimeWired, 0);

  const receipt = JSON.parse(fs.readFileSync(path.join(tempRoot, RECEIPT_PATH), 'utf8'));
  const registry = JSON.parse(fs.readFileSync(path.join(tempRoot, REGISTRY_PATH), 'utf8'));
  const matrix = JSON.parse(fs.readFileSync(path.join(tempRoot, G00_MATRIX_PATH), 'utf8'));
  const discovery = JSON.parse(fs.readFileSync(path.join(tempRoot, G00_DISCOVERY_RECEIPT_PATH), 'utf8'));
  const catalog = JSON.parse(fs.readFileSync(path.join(tempRoot, RTK_CATALOG_PATH), 'utf8'));

  assert.equal(receipt.status, STATUS);
  assert.equal(receipt.result, RESULT);
  assert.equal(receipt.localRecoveryReplayOnly, true);
  assert.equal(receipt.noProductMutation, true);
  assert.equal(receipt.realAccountE2E, 'WAIT_AUTHORITY_REQUIRED_FOR_REAL_PROVIDER_EVIDENCE');
  assert.equal(receipt.samplePacket.result.ok, true);
  assert.equal(receipt.samplePacket.result.action, 'RECOVER_OR_REPLAY_QUARANTINE_ONLY');
  assert.equal(receipt.samplePacket.result.applyAuthority, 'DENY');
  assert.equal(registry.discoveryHeads.some((row) => row.path === RECEIPT_PATH), true);
  assert.equal(matrix.localRecoveryReplayContract.status, STATUS);
  assert.equal(matrix.localRecoveryReplayContract.applyAuthority, false);
  assert.equal(matrix.localRecoveryReplayContract.writerCalls, 0);
  assert.equal(matrix.googleCurrentState.automaticApplyCertified, 0);
  assert.equal(matrix.googleCurrentState.googleStageDone, false);
  assert.equal(matrix.googleCurrentState.nextLocalContour, 'GOOGLE_DOCS_LOCAL_FINAL_COMPATIBILITY_VERDICT_V1');
  const recoveryRow = matrix.rows.find((row) => row.cellId === 'google.recoveryReopenReplay');
  assert.equal(recoveryRow.currentTerminalClass, 'TYPED_RECOVERY_REPLAY_LOCAL_NO_APPLY');
  assert.equal(recoveryRow.userFacingAuthority, 'LOCAL_RECOVERY_REPLAY_NO_APPLY_AUTHORITY');
  assert.equal(recoveryRow.reasonCode, 'GOOGLE_RECOVERY_REPLAY_LOCAL_ONLY_NO_REAL_GOOGLE_E2E');
  assert.equal(recoveryRow.requiredNextContour, 'GOOGLE_DOCS_LOCAL_FINAL_COMPATIBILITY_VERDICT_V1');
  assert.equal(recoveryRow.blocksGoogleStage, true);
  assert.equal(discovery.localRecoveryReplayContract.status, STATUS);
  assert.equal(discovery.localRecoveryReplayContract.applyAuthority, false);
  assert.equal(discovery.nextLocalContour, 'GOOGLE_DOCS_LOCAL_FINAL_COMPATIBILITY_VERDICT_V1');
  assert.equal(catalog.contractBasenames.includes(CONTRACT_BASENAME), true);
});

test('Google Docs local recovery/replay model and mutation oracle have zero survivors', async () => {
  const stdout = execFileSync(process.execPath, [MODEL_PATH], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  const report = JSON.parse(stdout);
  assert.equal(report.ok, true);
  assert.equal(report.finiteCases, 1);
  assert.equal(report.hostileCases, 36);
  assert.equal(report.semanticMutants, 26);
  assert.equal(report.survivors, 0);
  assert.equal(report.mismatches, 0);
});
