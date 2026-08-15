#!/usr/bin/env node
import {
  buildSyntheticGoogleDocsLocalReturnIntakePacket,
  evaluateGoogleDocsLocalReturnIntakeQuarantine,
  sha256Text,
} from './rtk-google-docs-local-return-intake-quarantine-v1.mjs';

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
  return buildSyntheticGoogleDocsLocalReturnIntakePacket();
}

function expectedSource() {
  return {
    projectId: 'synthetic-google-docs-project',
    rootId: 'synthetic-google-docs-root',
    documentId: 'synthetic-google-docs-document',
    canonicalRevision: `sha256:${sha256Text('canonical-google-docs-revision-v1')}`,
    workingRevision: `sha256:${sha256Text('working-google-docs-revision-v1')}`,
    generation: 1,
    sourceFence: `sha256:${sha256Text('google-docs-local-return-intake-source-fence-v1')}`,
  };
}

function expectedManifestBody(packet) {
  return {
    manifestId: 'synthetic-google-docs-return-intake-manifest-v1',
    sourceBindingSha256: `sha256:${sha256Text(stableJson(packet.sourceBinding))}`,
    artifactBindings: packet.returnedArtifacts.map((artifact) => ({
      artifactId: artifact.artifactId,
      mediaType: artifact.mediaType,
      payloadSha256: artifact.payloadSha256,
      sizeBytes: artifact.sizeBytes,
    })),
    aggregatePayloadSha256: `sha256:${sha256Text(packet.returnedArtifacts.map((artifact) => artifact.payloadSha256).join('\n'))}`,
    quarantineClass: 'LOCAL_RETURN_INTAKE_QUARANTINE_ONLY',
  };
}

function expectedOracleBody(packet) {
  return {
    oracleId: 'synthetic-google-docs-return-intake-oracle-v1',
    expectedAction: 'QUARANTINE_ONLY',
    expectedTrustedProviderCases: 0,
    expectedApplyAdmitted: 0,
    expectedProductMutations: 0,
    expectedArtifactCount: packet.returnedArtifacts.length,
    manifestSha256: packet.quarantineManifest.manifestSha256,
  };
}

function oracle(packet) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) return 'GOOGLE_RETURN_INTAKE_SCHEMA_INVALID';
  if (packet.schemaVersion !== 'yalken.googleDocs.localReturnIntake.v1') return 'GOOGLE_RETURN_INTAKE_SCHEMA_INVALID';
  if (packet.provider !== 'google-docs' || packet.inheritedEvidenceProfileId) return 'GOOGLE_RETURN_INTAKE_WORD_EVIDENCE_INHERITANCE';
  if (!['google-docs-office-mode-post-d1-v1', 'google-docs-native-conversion-post-d1-v1'].includes(packet.profileId)) return 'GOOGLE_RETURN_INTAKE_PROFILE_NOT_DECLARED';
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
    || packet.claims?.applyAuthority === true
    || packet.claims?.productMutationAuthority === true) return 'GOOGLE_RETURN_INTAKE_OVERCLAIM';
  if (!Array.isArray(packet.limitations) || packet.limitations.length === 0) return 'GOOGLE_RETURN_INTAKE_SCHEMA_INVALID';
  if (packet.limitations.some((item) => /^(UNKNOWN|ABSTAIN)$/u.test(String(item || '').trim()))) return 'GOOGLE_RETURN_INTAKE_UNKNOWN_ABSTAIN_NOT_PASS';

  const source = expectedSource();
  for (const [key, value] of Object.entries(source)) {
    if (packet.sourceBinding?.[key] !== value) return 'GOOGLE_RETURN_INTAKE_SOURCE_TRANSPLANT';
  }

  if (!Array.isArray(packet.returnedArtifacts) || packet.returnedArtifacts.length === 0 || packet.returnedArtifacts.length > 8) return 'GOOGLE_RETURN_INTAKE_SCHEMA_INVALID';
  const artifactIds = new Set();
  const payloadDigests = new Set();
  let aggregateBytes = 0;
  for (const artifact of packet.returnedArtifacts) {
    if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) return 'GOOGLE_RETURN_INTAKE_SCHEMA_INVALID';
    if (typeof artifact.artifactId !== 'string' || artifact.artifactId.length === 0) return 'GOOGLE_RETURN_INTAKE_SCHEMA_INVALID';
    if (artifactIds.has(artifact.artifactId)) return 'GOOGLE_RETURN_INTAKE_REPLAY_REJECTED';
    artifactIds.add(artifact.artifactId);
    if (artifact.mediaType !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'GOOGLE_RETURN_INTAKE_UNSUPPORTED_FORMAT_ABSTAIN';
    if (typeof artifact.payloadText !== 'string' || artifact.payloadText.length === 0) return 'GOOGLE_RETURN_INTAKE_SCHEMA_INVALID';
    if (artifact.payloadSha256 !== `sha256:${sha256Text(artifact.payloadText)}`) return 'GOOGLE_RETURN_INTAKE_ARTIFACT_DIGEST_MISMATCH';
    if (artifact.sizeBytes !== Buffer.byteLength(artifact.payloadText, 'utf8')) return 'GOOGLE_RETURN_INTAKE_ARTIFACT_DIGEST_MISMATCH';
    if (payloadDigests.has(artifact.payloadSha256)) return 'GOOGLE_RETURN_INTAKE_REPLAY_REJECTED';
    payloadDigests.add(artifact.payloadSha256);
    aggregateBytes += artifact.sizeBytes;
  }
  if (aggregateBytes > 64 * 1024) return 'GOOGLE_RETURN_INTAKE_SCHEMA_INVALID';

  if (!packet.quarantineManifest || typeof packet.quarantineManifest !== 'object' || Array.isArray(packet.quarantineManifest)) return 'GOOGLE_RETURN_INTAKE_MANIFEST_DIGEST_MISMATCH';
  const manifestBody = expectedManifestBody(packet);
  if (stableJson(withoutDigest(packet.quarantineManifest, 'manifestSha256')) !== stableJson(manifestBody)) return 'GOOGLE_RETURN_INTAKE_MANIFEST_DIGEST_MISMATCH';
  if (packet.quarantineManifest.manifestSha256 !== `sha256:${sha256Text(stableJson(manifestBody))}`) return 'GOOGLE_RETURN_INTAKE_MANIFEST_DIGEST_MISMATCH';

  if (!packet.quarantineOracle || typeof packet.quarantineOracle !== 'object' || Array.isArray(packet.quarantineOracle)) return 'GOOGLE_RETURN_INTAKE_ORACLE_DIGEST_MISMATCH';
  if (packet.quarantineOracle.expectedTrustedProviderCases !== 0
    || packet.quarantineOracle.expectedApplyAdmitted !== 0
    || packet.quarantineOracle.expectedProductMutations !== 0) return 'GOOGLE_RETURN_INTAKE_ORACLE_OVERCLAIM';
  const oracleBody = expectedOracleBody(packet);
  if (stableJson(withoutDigest(packet.quarantineOracle, 'oracleSha256')) !== stableJson(oracleBody)) return 'GOOGLE_RETURN_INTAKE_ORACLE_DIGEST_MISMATCH';
  if (packet.quarantineOracle.oracleSha256 !== `sha256:${sha256Text(stableJson(oracleBody))}`) return 'GOOGLE_RETURN_INTAKE_ORACLE_DIGEST_MISMATCH';

  return 'GOOGLE_RETURN_INTAKE_QUARANTINED';
}

function artifact(overrides = {}) {
  const payloadText = overrides.payloadText ?? [
    'Yalken Google Docs local returned-artifact synthetic fixture.',
    'Disposable only. No user document. No Google account.',
    'This payload is quarantined and never imported or applied.',
  ].join('\n');
  return {
    artifactId: 'google-docs-returned-office-mode-docx',
    fileName: 'synthetic-google-docs-returned-office-mode.docx',
    mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    payloadText,
    payloadSha256: `sha256:${sha256Text(payloadText)}`,
    sizeBytes: Buffer.byteLength(payloadText, 'utf8'),
    returnedContentClasses: ['plainText', 'paragraphBreaks'],
    ...overrides,
  };
}

function source(overrides = {}) {
  return { ...expectedSource(), ...overrides };
}

function run() {
  const basePacket = baseline();
  const duplicateArtifact = artifact({
    artifactId: 'google-docs-returned-office-mode-docx-duplicate',
    payloadSha256: basePacket.returnedArtifacts[0].payloadSha256,
  });
  const hostileCases = [
    ['missing schema', (packet) => { packet.schemaVersion = ''; }],
    ['unknown profile', (packet) => { packet.profileId = 'word-mac-16.112-26081010'; }],
    ['word inheritance', (packet) => { packet.provider = 'word'; packet.inheritedEvidenceProfileId = 'word-mac-16.112-26081010'; }],
    ['support overclaim', (packet) => { packet.claims.supportProven = true; }],
    ['import overclaim', (packet) => { packet.claims.importProven = true; }],
    ['roundtrip overclaim', (packet) => { packet.claims.roundtripProven = true; }],
    ['trusted intake overclaim', (packet) => { packet.claims.returnIntakeTrusted = true; }],
    ['apply overclaim', (packet) => { packet.claims.applyAuthority = true; }],
    ['runtime overclaim', (packet) => { packet.productRuntimeWired = true; }],
    ['network overclaim', (packet) => { packet.networkRuntimeUsed = true; }],
    ['account overclaim', (packet) => { packet.googleAccountUsed = true; }],
    ['user document overclaim', (packet) => { packet.userDocument = true; }],
    ['physical provider overclaim', (packet) => { packet.physicalGoogleEvidence = true; }],
    ['source transplant', (packet) => { packet.sourceBinding = source({ documentId: 'foreign-doc' }); }],
    ['stale canonical revision', (packet) => { packet.sourceBinding = source({ canonicalRevision: `sha256:${sha256Text('stale')}` }); }],
    ['stale working revision', (packet) => { packet.sourceBinding = source({ workingRevision: `sha256:${sha256Text('stale')}` }); }],
    ['stale generation', (packet) => { packet.sourceBinding = source({ generation: 2 }); }],
    ['source fence replay', (packet) => { packet.sourceBinding = source({ sourceFence: `sha256:${sha256Text('replayed-fence')}` }); }],
    ['artifact digest mismatch', (packet) => { packet.returnedArtifacts[0].payloadSha256 = `sha256:${sha256Text('stale')}`; }],
    ['artifact size mismatch', (packet) => { packet.returnedArtifacts[0].sizeBytes += 1; }],
    ['unsupported media type', (packet) => { packet.returnedArtifacts[0].mediaType = 'text/html'; }],
    ['duplicate returned bytes', (packet) => { packet.returnedArtifacts = [packet.returnedArtifacts[0], duplicateArtifact]; }],
    ['manifest artifact mismatch', (packet) => { packet.quarantineManifest.artifactBindings[0].payloadSha256 = `sha256:${sha256Text('stale')}`; }],
    ['manifest digest mismatch', (packet) => { packet.quarantineManifest.manifestSha256 = `sha256:${sha256Text('stale')}`; }],
    ['oracle digest mismatch', (packet) => { packet.quarantineOracle.oracleSha256 = `sha256:${sha256Text('stale')}`; }],
    ['oracle trusted provider overclaim', (packet) => { packet.quarantineOracle.expectedTrustedProviderCases = 1; packet.quarantineOracle.oracleSha256 = `sha256:${sha256Text(stableJson(withoutDigest(packet.quarantineOracle, 'oracleSha256')))}`; }],
    ['oracle apply overclaim', (packet) => { packet.quarantineOracle.expectedApplyAdmitted = 1; packet.quarantineOracle.oracleSha256 = `sha256:${sha256Text(stableJson(withoutDigest(packet.quarantineOracle, 'oracleSha256')))}`; }],
    ['unknown limitation cannot pass', (packet) => { packet.limitations = ['UNKNOWN']; }],
  ];

  const semanticMutants = [
    'unknown profile',
    'word inheritance',
    'support overclaim',
    'import overclaim',
    'roundtrip overclaim',
    'trusted intake overclaim',
    'apply overclaim',
    'runtime overclaim',
    'network overclaim',
    'account overclaim',
    'user document overclaim',
    'physical provider overclaim',
    'source transplant',
    'stale generation',
    'source fence replay',
    'artifact digest mismatch',
    'duplicate returned bytes',
    'manifest digest mismatch',
    'oracle apply overclaim',
    'unknown limitation cannot pass',
  ];

  const observations = [];
  observations.push({
    name: 'baseline',
    oracle: oracle(basePacket),
    evaluator: evaluateGoogleDocsLocalReturnIntakeQuarantine(basePacket).code,
  });
  for (const [name, mutate] of hostileCases) {
    const packet = clone(basePacket);
    mutate(packet);
    observations.push({
      name,
      oracle: oracle(packet),
      evaluator: evaluateGoogleDocsLocalReturnIntakeQuarantine(packet).code,
    });
  }

  const mismatches = observations.filter((row) => row.oracle !== row.evaluator);
  const survivors = observations.filter((row) => (
    row.name !== 'baseline'
    && semanticMutants.includes(row.name)
    && row.evaluator === 'GOOGLE_RETURN_INTAKE_QUARANTINED'
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
