#!/usr/bin/env node
import {
  buildSyntheticGoogleDocsLocalPreviewOnlyNoApplyPacket,
  evaluateGoogleDocsLocalPreviewOnlyNoApply,
  sha256Text,
} from './rtk-google-docs-local-preview-only-no-apply-v1.mjs';

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
  return buildSyntheticGoogleDocsLocalPreviewOnlyNoApplyPacket();
}

function expectedSource() {
  return {
    projectId: 'synthetic-google-docs-project',
    rootId: 'synthetic-google-docs-root',
    documentId: 'synthetic-google-docs-document',
    canonicalRevision: `sha256:${sha256Text('canonical-google-docs-revision-v1')}`,
    workingRevision: `sha256:${sha256Text('working-google-docs-revision-v1')}`,
    generation: 1,
    sourceFence: `sha256:${sha256Text('google-docs-local-preview-source-fence-v1')}`,
  };
}

function expectedManifestBody(packet) {
  return {
    manifestId: 'synthetic-google-docs-preview-manifest-v1',
    sourceBindingSha256: `sha256:${sha256Text(stableJson(packet.sourceBinding))}`,
    artifactBindings: packet.returnedArtifacts.map((artifact) => ({
      artifactId: artifact.artifactId,
      mediaType: artifact.mediaType,
      payloadSha256: artifact.payloadSha256,
      sizeBytes: artifact.sizeBytes,
    })),
    aggregatePayloadSha256: `sha256:${sha256Text(packet.returnedArtifacts.map((artifact) => artifact.payloadSha256).join('\n'))}`,
    previewClass: 'LOCAL_PREVIEW_ONLY_NO_APPLY',
  };
}

function expectedCandidateBody(packet, artifact) {
  const previewText = artifact.payloadText.split('\n').slice(0, 3).join('\n').slice(0, 4096);
  return {
    candidateId: 'google-docs-preview-candidate-1',
    sourceBindingSha256: `sha256:${sha256Text(stableJson(packet.sourceBinding))}`,
    artifactId: artifact.artifactId,
    artifactSha256: artifact.payloadSha256,
    previewText,
    previewTextSha256: `sha256:${sha256Text(previewText)}`,
    decision: 'PREVIEW_ONLY',
    applyAuthority: 'DENY',
  };
}

function expectedOracleBody(packet) {
  return {
    oracleId: 'synthetic-google-docs-preview-only-oracle-v1',
    expectedAction: 'PREVIEW_ONLY',
    expectedPreviewCandidates: packet.previewCandidates.length,
    expectedApplyAdmitted: 0,
    expectedProductMutations: 0,
    manifestSha256: packet.previewManifest.manifestSha256,
    candidateSha256s: packet.previewCandidates.map((candidate) => candidate.candidateSha256),
    artifactSha256s: packet.returnedArtifacts.map((artifact) => artifact.payloadSha256),
  };
}

function oracle(packet) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) return 'GOOGLE_PREVIEW_ONLY_SCHEMA_INVALID';
  if (packet.schemaVersion !== 'yalken.googleDocs.localPreviewDecision.v1') return 'GOOGLE_PREVIEW_ONLY_SCHEMA_INVALID';
  if (packet.provider !== 'google-docs' || packet.inheritedEvidenceProfileId) return 'GOOGLE_PREVIEW_ONLY_WORD_EVIDENCE_INHERITANCE';
  if (!['google-docs-office-mode-post-d1-v1', 'google-docs-native-conversion-post-d1-v1'].includes(packet.profileId)) return 'GOOGLE_PREVIEW_ONLY_PROFILE_NOT_DECLARED';
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
    || packet.claims?.applyAuthority === true
    || packet.claims?.productMutationAuthority === true) return 'GOOGLE_PREVIEW_ONLY_OVERCLAIM';
  if (packet.upstreamLocalReturnIntake?.status !== 'GOOGLE_DOCS_LOCAL_RETURN_INTAKE_QUARANTINE_V1_LOCAL_VERIFIED'
    || packet.upstreamLocalReturnIntake?.result !== 'RETURN_INTAKE_QUARANTINE_ONLY_NEEDS_REAL_GOOGLE_E2E'
    || packet.upstreamLocalReturnIntake?.action !== 'QUARANTINE_ONLY'
    || packet.upstreamLocalReturnIntake?.applyAuthority !== 'DENY') return 'GOOGLE_PREVIEW_ONLY_UPSTREAM_NOT_QUARANTINED';
  if (!Array.isArray(packet.limitations) || packet.limitations.length === 0) return 'GOOGLE_PREVIEW_ONLY_SCHEMA_INVALID';
  if (packet.limitations.some((item) => /^(UNKNOWN|ABSTAIN)$/u.test(String(item || '').trim()))) return 'GOOGLE_PREVIEW_ONLY_UNKNOWN_ABSTAIN_NOT_PASS';

  const source = expectedSource();
  for (const [key, value] of Object.entries(source)) {
    if (packet.sourceBinding?.[key] !== value) return 'GOOGLE_PREVIEW_ONLY_SOURCE_TRANSPLANT';
  }

  if (!Array.isArray(packet.returnedArtifacts) || packet.returnedArtifacts.length === 0 || packet.returnedArtifacts.length > 8) return 'GOOGLE_PREVIEW_ONLY_SCHEMA_INVALID';
  const artifactIds = new Set();
  const payloadDigests = new Set();
  let aggregateBytes = 0;
  for (const artifact of packet.returnedArtifacts) {
    if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) return 'GOOGLE_PREVIEW_ONLY_SCHEMA_INVALID';
    if (typeof artifact.artifactId !== 'string' || artifact.artifactId.length === 0) return 'GOOGLE_PREVIEW_ONLY_SCHEMA_INVALID';
    if (artifactIds.has(artifact.artifactId)) return 'GOOGLE_PREVIEW_ONLY_REPLAY_REJECTED';
    artifactIds.add(artifact.artifactId);
    if (artifact.mediaType !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'GOOGLE_PREVIEW_ONLY_UNSUPPORTED_FORMAT_ABSTAIN';
    if (typeof artifact.payloadText !== 'string' || artifact.payloadText.length === 0) return 'GOOGLE_PREVIEW_ONLY_SCHEMA_INVALID';
    if (artifact.payloadSha256 !== `sha256:${sha256Text(artifact.payloadText)}`) return 'GOOGLE_PREVIEW_ONLY_ARTIFACT_DIGEST_MISMATCH';
    if (artifact.sizeBytes !== Buffer.byteLength(artifact.payloadText, 'utf8')) return 'GOOGLE_PREVIEW_ONLY_ARTIFACT_DIGEST_MISMATCH';
    if (payloadDigests.has(artifact.payloadSha256)) return 'GOOGLE_PREVIEW_ONLY_REPLAY_REJECTED';
    payloadDigests.add(artifact.payloadSha256);
    aggregateBytes += artifact.sizeBytes;
  }
  if (aggregateBytes > 64 * 1024) return 'GOOGLE_PREVIEW_ONLY_SCHEMA_INVALID';

  if (!packet.previewManifest || typeof packet.previewManifest !== 'object' || Array.isArray(packet.previewManifest)) return 'GOOGLE_PREVIEW_ONLY_MANIFEST_DIGEST_MISMATCH';
  const manifestBody = expectedManifestBody(packet);
  if (stableJson(withoutDigest(packet.previewManifest, 'manifestSha256')) !== stableJson(manifestBody)) return 'GOOGLE_PREVIEW_ONLY_MANIFEST_DIGEST_MISMATCH';
  if (packet.previewManifest.manifestSha256 !== `sha256:${sha256Text(stableJson(manifestBody))}`) return 'GOOGLE_PREVIEW_ONLY_MANIFEST_DIGEST_MISMATCH';

  if (!Array.isArray(packet.previewCandidates) || packet.previewCandidates.length !== packet.returnedArtifacts.length) return 'GOOGLE_PREVIEW_ONLY_CANDIDATE_DIGEST_MISMATCH';
  const candidateIds = new Set();
  for (let index = 0; index < packet.previewCandidates.length; index += 1) {
    const candidate = packet.previewCandidates[index];
    const artifact = packet.returnedArtifacts[index];
    if (candidate.applyAuthority !== 'DENY' || candidate.decision !== 'PREVIEW_ONLY') return 'GOOGLE_PREVIEW_ONLY_CANDIDATE_APPLY_OVERCLAIM';
    if (candidateIds.has(candidate.candidateId)) return 'GOOGLE_PREVIEW_ONLY_REPLAY_REJECTED';
    candidateIds.add(candidate.candidateId);
    const candidateBody = expectedCandidateBody(packet, artifact);
    if (stableJson(withoutDigest(candidate, 'candidateSha256')) !== stableJson(candidateBody)) return 'GOOGLE_PREVIEW_ONLY_CANDIDATE_DIGEST_MISMATCH';
    if (candidate.candidateSha256 !== `sha256:${sha256Text(stableJson(candidateBody))}`) return 'GOOGLE_PREVIEW_ONLY_CANDIDATE_DIGEST_MISMATCH';
  }

  if (!packet.previewOracle || typeof packet.previewOracle !== 'object' || Array.isArray(packet.previewOracle)) return 'GOOGLE_PREVIEW_ONLY_ORACLE_DIGEST_MISMATCH';
  if (packet.previewOracle.expectedApplyAdmitted !== 0 || packet.previewOracle.expectedProductMutations !== 0) return 'GOOGLE_PREVIEW_ONLY_ORACLE_OVERCLAIM';
  const oracleBody = expectedOracleBody(packet);
  if (stableJson(withoutDigest(packet.previewOracle, 'oracleSha256')) !== stableJson(oracleBody)) return 'GOOGLE_PREVIEW_ONLY_ORACLE_DIGEST_MISMATCH';
  if (packet.previewOracle.oracleSha256 !== `sha256:${sha256Text(stableJson(oracleBody))}`) return 'GOOGLE_PREVIEW_ONLY_ORACLE_DIGEST_MISMATCH';

  return 'GOOGLE_PREVIEW_ONLY_NO_APPLY_DECISION';
}

function artifact(overrides = {}) {
  const payloadText = overrides.payloadText ?? [
    'Yalken Google Docs local preview synthetic returned artifact.',
    'Disposable only. No user document. No Google account.',
    'This payload can be previewed locally but cannot be imported or applied.',
  ].join('\n');
  return {
    artifactId: 'google-docs-preview-returned-office-mode-docx',
    fileName: 'synthetic-google-docs-preview-returned-office-mode.docx',
    mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    payloadText,
    payloadSha256: `sha256:${sha256Text(payloadText)}`,
    sizeBytes: Buffer.byteLength(payloadText, 'utf8'),
    contentClasses: ['plainText', 'paragraphBreaks'],
    ...overrides,
  };
}

function source(overrides = {}) {
  return { ...expectedSource(), ...overrides };
}

function recomputeCandidateDigest(candidate) {
  return `sha256:${sha256Text(stableJson(withoutDigest(candidate, 'candidateSha256')))}`;
}

function recomputeOracleDigest(previewOracle) {
  return `sha256:${sha256Text(stableJson(withoutDigest(previewOracle, 'oracleSha256')))}`;
}

function run() {
  const basePacket = baseline();
  const duplicateArtifact = artifact({
    artifactId: 'google-docs-preview-returned-office-mode-docx-duplicate',
    payloadSha256: basePacket.returnedArtifacts[0].payloadSha256,
  });
  const hostileCases = [
    ['missing schema', (packet) => { packet.schemaVersion = ''; }],
    ['unknown profile', (packet) => { packet.profileId = 'word-mac-16.112-26081010'; }],
    ['word inheritance', (packet) => { packet.provider = 'word'; packet.inheritedEvidenceProfileId = 'word-mac-16.112-26081010'; }],
    ['support overclaim', (packet) => { packet.claims.supportProven = true; }],
    ['import overclaim', (packet) => { packet.claims.importProven = true; }],
    ['roundtrip overclaim', (packet) => { packet.claims.roundtripProven = true; }],
    ['return intake trust overclaim', (packet) => { packet.claims.returnIntakeTrusted = true; }],
    ['preview trust overclaim', (packet) => { packet.claims.previewDecisionTrusted = true; }],
    ['apply overclaim', (packet) => { packet.claims.applyAuthority = true; }],
    ['product mutation overclaim', (packet) => { packet.claims.productMutationAuthority = true; }],
    ['runtime overclaim', (packet) => { packet.productRuntimeWired = true; }],
    ['network overclaim', (packet) => { packet.networkRuntimeUsed = true; }],
    ['account overclaim', (packet) => { packet.googleAccountUsed = true; }],
    ['user document overclaim', (packet) => { packet.userDocument = true; }],
    ['physical provider overclaim', (packet) => { packet.physicalGoogleEvidence = true; }],
    ['missing upstream quarantine', (packet) => { packet.upstreamLocalReturnIntake.status = 'UNKNOWN'; }],
    ['source transplant', (packet) => { packet.sourceBinding = source({ documentId: 'foreign-doc' }); }],
    ['stale canonical revision', (packet) => { packet.sourceBinding = source({ canonicalRevision: `sha256:${sha256Text('stale')}` }); }],
    ['stale working revision', (packet) => { packet.sourceBinding = source({ workingRevision: `sha256:${sha256Text('stale')}` }); }],
    ['stale generation', (packet) => { packet.sourceBinding = source({ generation: 2 }); }],
    ['source fence replay', (packet) => { packet.sourceBinding = source({ sourceFence: `sha256:${sha256Text('replayed-fence')}` }); }],
    ['artifact digest mismatch', (packet) => { packet.returnedArtifacts[0].payloadSha256 = `sha256:${sha256Text('stale')}`; }],
    ['unsupported media type', (packet) => { packet.returnedArtifacts[0].mediaType = 'text/html'; }],
    ['duplicate returned bytes', (packet) => { packet.returnedArtifacts = [packet.returnedArtifacts[0], duplicateArtifact]; }],
    ['manifest digest mismatch', (packet) => { packet.previewManifest.manifestSha256 = `sha256:${sha256Text('stale')}`; }],
    ['candidate digest mismatch', (packet) => { packet.previewCandidates[0].candidateSha256 = `sha256:${sha256Text('stale')}`; }],
    ['candidate apply overclaim', (packet) => { packet.previewCandidates[0].applyAuthority = 'ALLOW'; packet.previewCandidates[0].candidateSha256 = recomputeCandidateDigest(packet.previewCandidates[0]); }],
    ['oracle digest mismatch', (packet) => { packet.previewOracle.oracleSha256 = `sha256:${sha256Text('stale')}`; }],
    ['oracle apply overclaim', (packet) => { packet.previewOracle.expectedApplyAdmitted = 1; packet.previewOracle.oracleSha256 = recomputeOracleDigest(packet.previewOracle); }],
    ['unknown limitation cannot pass', (packet) => { packet.limitations = ['UNKNOWN']; }],
  ];

  const semanticMutants = [
    'unknown profile',
    'word inheritance',
    'support overclaim',
    'import overclaim',
    'roundtrip overclaim',
    'return intake trust overclaim',
    'preview trust overclaim',
    'apply overclaim',
    'product mutation overclaim',
    'runtime overclaim',
    'network overclaim',
    'account overclaim',
    'user document overclaim',
    'physical provider overclaim',
    'missing upstream quarantine',
    'source transplant',
    'stale generation',
    'source fence replay',
    'artifact digest mismatch',
    'duplicate returned bytes',
    'candidate apply overclaim',
    'unknown limitation cannot pass',
  ];

  const observations = [];
  observations.push({
    name: 'baseline',
    oracle: oracle(basePacket),
    evaluator: evaluateGoogleDocsLocalPreviewOnlyNoApply(basePacket).code,
  });
  for (const [name, mutate] of hostileCases) {
    const packet = clone(basePacket);
    mutate(packet);
    observations.push({
      name,
      oracle: oracle(packet),
      evaluator: evaluateGoogleDocsLocalPreviewOnlyNoApply(packet).code,
    });
  }

  const mismatches = observations.filter((row) => row.oracle !== row.evaluator);
  const survivors = observations.filter((row) => (
    row.name !== 'baseline'
    && semanticMutants.includes(row.name)
    && row.evaluator === 'GOOGLE_PREVIEW_ONLY_NO_APPLY_DECISION'
  ));
  return {
    ok: mismatches.length === 0 && survivors.length === 0,
    finiteCases: 1,
    hostileCases: hostileCases.length,
    semanticMutants: semanticMutants.length,
    survivors: survivors.length,
    mismatches: mismatches.length,
    observations,
  };
}

const result = run();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exitCode = result.ok ? 0 : 1;
