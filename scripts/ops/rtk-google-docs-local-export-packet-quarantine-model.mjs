#!/usr/bin/env node
import {
  buildSyntheticGoogleDocsLocalExportPacket,
  evaluateGoogleDocsLocalExportPacketQuarantine,
  sha256Text,
} from './rtk-google-docs-local-export-packet-quarantine-v1.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function baseline() {
  return buildSyntheticGoogleDocsLocalExportPacket();
}

function oracle(packet) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) return 'GOOGLE_EXPORT_PACKET_SCHEMA_INVALID';
  if (packet.schemaVersion !== 'yalken.googleDocs.localExportPacket.v1') return 'GOOGLE_EXPORT_PACKET_SCHEMA_INVALID';
  if (packet.provider !== 'google-docs' || packet.inheritedEvidenceProfileId) return 'GOOGLE_EXPORT_PACKET_WORD_EVIDENCE_INHERITANCE';
  if (!['google-docs-office-mode-post-d1-v1', 'google-docs-native-conversion-post-d1-v1'].includes(packet.profileId)) return 'GOOGLE_EXPORT_PACKET_PROFILE_NOT_DECLARED';
  if (packet.localOnly !== true
    || packet.googleAccountUsed === true
    || packet.networkRuntimeUsed === true
    || packet.productRuntimeWired === true
    || packet.physicalGoogleEvidence === true
    || packet.userDocument === true
    || packet.claims?.supportProven === true
    || packet.claims?.importProven === true
    || packet.claims?.roundtripProven === true
    || packet.claims?.applyAuthority === true
    || packet.claims?.productMutationAuthority === true) return 'GOOGLE_EXPORT_PACKET_OVERCLAIM';
  if (!Array.isArray(packet.limitations) || packet.limitations.length === 0) return 'GOOGLE_EXPORT_PACKET_SCHEMA_INVALID';
  if (packet.limitations.some((item) => /^(UNKNOWN|ABSTAIN)$/u.test(String(item || '').trim()))) return 'GOOGLE_EXPORT_PACKET_UNKNOWN_ABSTAIN_NOT_PASS';
  if (packet.sourceBinding?.projectId !== 'synthetic-google-docs-project'
    || packet.sourceBinding?.rootId !== 'synthetic-google-docs-root'
    || packet.sourceBinding?.documentId !== 'synthetic-google-docs-document'
    || packet.sourceBinding?.generation !== 1) return 'GOOGLE_EXPORT_PACKET_SOURCE_TRANSPLANT';
  if (!Array.isArray(packet.artifacts) || packet.artifacts.length === 0) return 'GOOGLE_EXPORT_PACKET_SCHEMA_INVALID';
  for (const artifact of packet.artifacts) {
    if (artifact.mediaType !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'GOOGLE_EXPORT_PACKET_UNSUPPORTED_FORMAT_ABSTAIN';
    if (typeof artifact.payloadText !== 'string' || artifact.payloadText.length === 0) return 'GOOGLE_EXPORT_PACKET_SCHEMA_INVALID';
    if (artifact.payloadSha256 !== `sha256:${sha256Text(artifact.payloadText)}`) return 'GOOGLE_EXPORT_PACKET_ARTIFACT_DIGEST_MISMATCH';
    if (artifact.sizeBytes !== Buffer.byteLength(artifact.payloadText, 'utf8')) return 'GOOGLE_EXPORT_PACKET_ARTIFACT_DIGEST_MISMATCH';
  }
  return 'GOOGLE_EXPORT_PACKET_QUARANTINED';
}

const hostileCases = [
  ['missing schema', (packet) => { packet.schemaVersion = ''; }],
  ['wrong provider', (packet) => { packet.provider = 'word'; }],
  ['word inheritance', (packet) => { packet.inheritedEvidenceProfileId = 'word-mac-16.112-26081010'; }],
  ['unknown profile', (packet) => { packet.profileId = 'google-docs-unknown'; }],
  ['support overclaim', (packet) => { packet.claims.supportProven = true; }],
  ['roundtrip overclaim', (packet) => { packet.claims.roundtripProven = true; }],
  ['apply overclaim', (packet) => { packet.claims.applyAuthority = true; }],
  ['runtime overclaim', (packet) => { packet.productRuntimeWired = true; }],
  ['physical overclaim', (packet) => { packet.physicalGoogleEvidence = true; }],
  ['user document overclaim', (packet) => { packet.userDocument = true; }],
  ['stale digest', (packet) => { packet.artifacts[0].payloadSha256 = `sha256:${sha256Text('stale')}`; }],
  ['size mismatch', (packet) => { packet.artifacts[0].sizeBytes += 1; }],
  ['source transplant', (packet) => { packet.sourceBinding.projectId = 'foreign'; }],
  ['unsupported html', (packet) => { packet.artifacts[0].mediaType = 'text/html'; }],
  ['unknown limitation', (packet) => { packet.limitations = ['UNKNOWN']; }],
];

const semanticMutants = [
  'support overclaim',
  'roundtrip overclaim',
  'apply overclaim',
  'runtime overclaim',
  'physical overclaim',
  'word inheritance',
  'stale digest',
  'source transplant',
  'unknown limitation',
];

function run() {
  const observations = [];
  const basePacket = baseline();
  const baseExpected = oracle(basePacket);
  const baseActual = evaluateGoogleDocsLocalExportPacketQuarantine(basePacket).code;
  observations.push({ name: 'baseline', oracle: baseExpected, evaluator: baseActual });

  for (const [name, mutate] of hostileCases) {
    const packet = clone(basePacket);
    mutate(packet);
    observations.push({
      name,
      oracle: oracle(packet),
      evaluator: evaluateGoogleDocsLocalExportPacketQuarantine(packet).code,
    });
  }

  const mismatches = observations.filter((row) => row.oracle !== row.evaluator);
  const survivors = observations.filter((row) => (
    row.name !== 'baseline'
    && semanticMutants.includes(row.name)
    && row.evaluator === 'GOOGLE_EXPORT_PACKET_QUARANTINED'
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
