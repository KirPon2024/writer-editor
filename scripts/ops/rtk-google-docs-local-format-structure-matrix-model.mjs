#!/usr/bin/env node
import {
  buildSyntheticGoogleDocsFormatStructurePacket,
  evaluateGoogleDocsLocalFormatStructureMatrix,
  sha256Text,
} from './rtk-google-docs-local-format-structure-matrix-v1.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function baseline() {
  return buildSyntheticGoogleDocsFormatStructurePacket();
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function oracle(packet) {
  if (!isObjectRecord(packet)) return 'GOOGLE_FORMAT_STRUCTURE_SCHEMA_INVALID';
  if (packet.schemaVersion !== 'yalken.googleDocs.localFormatStructureMatrix.v1') return 'GOOGLE_FORMAT_STRUCTURE_SCHEMA_INVALID';
  if (packet.provider !== 'google-docs' || packet.inheritedEvidenceProfileId) return 'GOOGLE_FORMAT_STRUCTURE_WORD_EVIDENCE_INHERITANCE';
  if (!['google-docs-office-mode-post-d1-v1', 'google-docs-native-conversion-post-d1-v1'].includes(packet.profileId)) return 'GOOGLE_FORMAT_STRUCTURE_PROFILE_NOT_DECLARED';
  if (packet.localOnly !== true
    || packet.googleAccountUsed === true
    || packet.networkRuntimeUsed === true
    || packet.productRuntimeWired === true
    || packet.physicalGoogleEvidence === true
    || packet.userDocument === true
    || packet.claims?.supportProven === true
    || packet.claims?.importProven === true
    || packet.claims?.roundtripProven === true
    || packet.claims?.formattingParsed === true
    || packet.claims?.formattingTrusted === true
    || packet.claims?.structureParsed === true
    || packet.claims?.structureTrusted === true
    || packet.claims?.applyAuthority === true
    || packet.claims?.productMutationAuthority === true) return 'GOOGLE_FORMAT_STRUCTURE_OVERCLAIM';
  if (!Array.isArray(packet.limitations) || packet.limitations.length === 0) return 'GOOGLE_FORMAT_STRUCTURE_SCHEMA_INVALID';
  if (packet.limitations.some((item) => /^(UNKNOWN|ABSTAIN)$/u.test(String(item || '').trim()))) return 'GOOGLE_FORMAT_STRUCTURE_UNKNOWN_ABSTAIN_NOT_PASS';
  if (packet.sourceBinding?.projectId !== 'synthetic-google-docs-project'
    || packet.sourceBinding?.rootId !== 'synthetic-google-docs-root'
    || packet.sourceBinding?.documentId !== 'synthetic-google-docs-document'
    || packet.sourceBinding?.canonicalRevision !== `sha256:${sha256Text('canonical-google-docs-revision-v1')}`
    || packet.sourceBinding?.workingRevision !== `sha256:${sha256Text('working-google-docs-revision-v1')}`
    || packet.sourceBinding?.generation !== 1) return 'GOOGLE_FORMAT_STRUCTURE_SOURCE_TRANSPLANT';
  if (!isObjectRecord(packet.fixture)) return 'GOOGLE_FORMAT_STRUCTURE_SCHEMA_INVALID';
  if (packet.fixture.mediaType !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'GOOGLE_FORMAT_STRUCTURE_UNSUPPORTED_FORMAT_ABSTAIN';
  if (typeof packet.fixture.payloadText !== 'string' || packet.fixture.payloadText.length === 0) return 'GOOGLE_FORMAT_STRUCTURE_SCHEMA_INVALID';
  if (packet.fixture.payloadSha256 !== `sha256:${sha256Text(packet.fixture.payloadText)}`) return 'GOOGLE_FORMAT_STRUCTURE_FIXTURE_DIGEST_MISMATCH';
  if (packet.fixture.sizeBytes !== Buffer.byteLength(packet.fixture.payloadText, 'utf8')) return 'GOOGLE_FORMAT_STRUCTURE_FIXTURE_DIGEST_MISMATCH';
  if (!Number.isInteger(packet.advertisedFormatCaseCount) || packet.advertisedFormatCaseCount < 0) return 'GOOGLE_FORMAT_STRUCTURE_SCHEMA_INVALID';
  if (!Number.isInteger(packet.advertisedStructureCaseCount) || packet.advertisedStructureCaseCount < 0) return 'GOOGLE_FORMAT_STRUCTURE_SCHEMA_INVALID';
  if (!Array.isArray(packet.cases)) return 'GOOGLE_FORMAT_STRUCTURE_SCHEMA_INVALID';

  const caseIds = new Set();
  const payloadDigests = new Set();
  const expectedDigests = new Set();
  let formatCount = 0;
  let structureCount = 0;
  const formatKinds = new Set(['bold', 'italic', 'underline', 'heading', 'list', 'link']);
  const structureKinds = new Set(['footnote', 'table', 'media', 'stableId']);
  for (const item of packet.cases) {
    if (!isObjectRecord(item)) return 'GOOGLE_FORMAT_STRUCTURE_SCHEMA_INVALID';
    if (typeof item.caseId !== 'string' || item.caseId.length === 0) return 'GOOGLE_FORMAT_STRUCTURE_SCHEMA_INVALID';
    if (caseIds.has(item.caseId)) return 'GOOGLE_FORMAT_STRUCTURE_COUNT_MISMATCH';
    caseIds.add(item.caseId);
    if (item.lane === 'formatting') {
      formatCount += 1;
      if (!formatKinds.has(item.kind)) return 'GOOGLE_FORMAT_STRUCTURE_UNSUPPORTED_KIND_ABSTAIN';
    } else if (item.lane === 'structure') {
      structureCount += 1;
      if (!structureKinds.has(item.kind)) return 'GOOGLE_FORMAT_STRUCTURE_UNSUPPORTED_KIND_ABSTAIN';
    } else {
      return 'GOOGLE_FORMAT_STRUCTURE_UNSUPPORTED_KIND_ABSTAIN';
    }
    if (typeof item.anchor !== 'string' || item.anchor.length === 0) return 'GOOGLE_FORMAT_STRUCTURE_SCHEMA_INVALID';
    if (typeof item.payloadText !== 'string' || item.payloadText.length === 0) return 'GOOGLE_FORMAT_STRUCTURE_SCHEMA_INVALID';
    if (typeof item.expectedText !== 'string' || item.expectedText.length === 0) return 'GOOGLE_FORMAT_STRUCTURE_SCHEMA_INVALID';
    if (payloadDigests.has(item.payloadSha256) || expectedDigests.has(item.expectedSha256)) return 'GOOGLE_FORMAT_STRUCTURE_PHANTOM_DIVERSITY_REJECTED';
    payloadDigests.add(item.payloadSha256);
    expectedDigests.add(item.expectedSha256);
    if (item.payloadSha256 !== `sha256:${sha256Text(item.payloadText)}`) return 'GOOGLE_FORMAT_STRUCTURE_CASE_DIGEST_MISMATCH';
    if (item.sizeBytes !== Buffer.byteLength(item.payloadText, 'utf8')) return 'GOOGLE_FORMAT_STRUCTURE_CASE_DIGEST_MISMATCH';
    if (item.expectedSha256 !== `sha256:${sha256Text(item.expectedText)}`) return 'GOOGLE_FORMAT_STRUCTURE_CASE_DIGEST_MISMATCH';
    if (item.localDisposition !== 'LOCAL_OBSERVED_UNTRUSTED') return 'GOOGLE_FORMAT_STRUCTURE_UNKNOWN_ABSTAIN_NOT_PASS';
  }
  if (formatCount !== packet.advertisedFormatCaseCount || structureCount !== packet.advertisedStructureCaseCount) return 'GOOGLE_FORMAT_STRUCTURE_COUNT_MISMATCH';
  return 'GOOGLE_FORMAT_STRUCTURE_LANES_ABSTAINED';
}

const hostileCases = [
  ['missing schema', (packet) => { packet.schemaVersion = ''; }],
  ['unknown profile', (packet) => { packet.profileId = 'word-mac-16.112-26081010'; }],
  ['word inheritance', (packet) => { packet.provider = 'word'; packet.inheritedEvidenceProfileId = 'word-mac-16.112-26081010'; }],
  ['support overclaim', (packet) => { packet.claims.supportProven = true; }],
  ['import overclaim', (packet) => { packet.claims.importProven = true; }],
  ['roundtrip overclaim', (packet) => { packet.claims.roundtripProven = true; }],
  ['formatting parsed overclaim', (packet) => { packet.claims.formattingParsed = true; }],
  ['formatting trusted overclaim', (packet) => { packet.claims.formattingTrusted = true; }],
  ['structure parsed overclaim', (packet) => { packet.claims.structureParsed = true; }],
  ['structure trusted overclaim', (packet) => { packet.claims.structureTrusted = true; }],
  ['apply overclaim', (packet) => { packet.claims.applyAuthority = true; }],
  ['runtime overclaim', (packet) => { packet.productRuntimeWired = true; }],
  ['network overclaim', (packet) => { packet.networkRuntimeUsed = true; }],
  ['user document overclaim', (packet) => { packet.userDocument = true; }],
  ['physical provider overclaim', (packet) => { packet.physicalGoogleEvidence = true; }],
  ['source transplant', (packet) => { packet.sourceBinding.documentId = 'foreign-doc'; }],
  ['stale generation', (packet) => { packet.sourceBinding.generation = 2; }],
  ['stale fixture digest', (packet) => { packet.fixture.payloadSha256 = `sha256:${sha256Text('stale')}`; }],
  ['format count mismatch', (packet) => { packet.advertisedFormatCaseCount = 5; }],
  ['structure count mismatch', (packet) => { packet.advertisedStructureCaseCount = 3; }],
  ['duplicate case id', (packet) => { packet.cases[1].caseId = packet.cases[0].caseId; }],
  ['unsupported kind', (packet) => { packet.cases[0].kind = 'floatingCanvas'; }],
  ['case digest reuse', (packet) => { packet.cases[1].payloadSha256 = packet.cases[0].payloadSha256; }],
  ['case payload digest mismatch', (packet) => { packet.cases[0].payloadSha256 = `sha256:${sha256Text('stale')}`; }],
  ['case expected digest mismatch', (packet) => { packet.cases[0].expectedSha256 = `sha256:${sha256Text('stale')}`; }],
  ['unknown limitation', (packet) => { packet.limitations = ['UNKNOWN']; }],
];

const semanticMutants = [
  'word inheritance',
  'support overclaim',
  'import overclaim',
  'roundtrip overclaim',
  'formatting parsed overclaim',
  'formatting trusted overclaim',
  'structure parsed overclaim',
  'structure trusted overclaim',
  'apply overclaim',
  'runtime overclaim',
  'network overclaim',
  'user document overclaim',
  'physical provider overclaim',
  'source transplant',
  'stale generation',
  'stale fixture digest',
  'case digest reuse',
];

function run() {
  const observations = [];
  const basePacket = baseline();
  const baseExpected = oracle(basePacket);
  const baseActual = evaluateGoogleDocsLocalFormatStructureMatrix(basePacket).code;
  observations.push({ name: 'baseline', oracle: baseExpected, evaluator: baseActual });

  for (const [name, mutate] of hostileCases) {
    const packet = clone(basePacket);
    mutate(packet);
    observations.push({
      name,
      oracle: oracle(packet),
      evaluator: evaluateGoogleDocsLocalFormatStructureMatrix(packet).code,
    });
  }

  const mismatches = observations.filter((row) => row.oracle !== row.evaluator);
  const survivors = observations.filter((row) => (
    row.name !== 'baseline'
    && semanticMutants.includes(row.name)
    && row.evaluator === 'GOOGLE_FORMAT_STRUCTURE_LANES_ABSTAINED'
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
