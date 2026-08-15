#!/usr/bin/env node
import {
  buildSyntheticGoogleDocsSuggestionsPacket,
  evaluateGoogleDocsLocalSuggestionsIrAbstain,
  sha256Text,
} from './rtk-google-docs-local-suggestions-ir-abstain-v1.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function baseline() {
  return buildSyntheticGoogleDocsSuggestionsPacket();
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function oracle(packet) {
  if (!isObjectRecord(packet)) return 'GOOGLE_SUGGESTIONS_SCHEMA_INVALID';
  if (packet.schemaVersion !== 'yalken.googleDocs.localSuggestionsIrAbstain.v1') return 'GOOGLE_SUGGESTIONS_SCHEMA_INVALID';
  if (packet.provider !== 'google-docs' || packet.inheritedEvidenceProfileId) return 'GOOGLE_SUGGESTIONS_WORD_EVIDENCE_INHERITANCE';
  if (!['google-docs-office-mode-post-d1-v1', 'google-docs-native-conversion-post-d1-v1'].includes(packet.profileId)) return 'GOOGLE_SUGGESTIONS_PROFILE_NOT_DECLARED';
  if (packet.localOnly !== true
    || packet.googleAccountUsed === true
    || packet.networkRuntimeUsed === true
    || packet.productRuntimeWired === true
    || packet.physicalGoogleEvidence === true
    || packet.userDocument === true
    || packet.claims?.supportProven === true
    || packet.claims?.importProven === true
    || packet.claims?.roundtripProven === true
    || packet.claims?.suggestionsParsed === true
    || packet.claims?.suggestionsIrTrusted === true
    || packet.claims?.suggestionsApplyAuthority === true
    || packet.claims?.applyAuthority === true
    || packet.claims?.productMutationAuthority === true) return 'GOOGLE_SUGGESTIONS_OVERCLAIM';
  if (!Array.isArray(packet.limitations) || packet.limitations.length === 0) return 'GOOGLE_SUGGESTIONS_SCHEMA_INVALID';
  if (packet.limitations.some((item) => /^(UNKNOWN|ABSTAIN)$/u.test(String(item || '').trim()))) return 'GOOGLE_SUGGESTIONS_UNKNOWN_ABSTAIN_NOT_PASS';
  if (packet.sourceBinding?.projectId !== 'synthetic-google-docs-project'
    || packet.sourceBinding?.rootId !== 'synthetic-google-docs-root'
    || packet.sourceBinding?.documentId !== 'synthetic-google-docs-document'
    || packet.sourceBinding?.canonicalRevision !== `sha256:${sha256Text('canonical-google-docs-revision-v1')}`
    || packet.sourceBinding?.workingRevision !== `sha256:${sha256Text('working-google-docs-revision-v1')}`
    || packet.sourceBinding?.generation !== 1) return 'GOOGLE_SUGGESTIONS_SOURCE_TRANSPLANT';
  if (!isObjectRecord(packet.fixture)) return 'GOOGLE_SUGGESTIONS_SCHEMA_INVALID';
  if (packet.fixture.mediaType !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'GOOGLE_SUGGESTIONS_UNSUPPORTED_FORMAT_ABSTAIN';
  if (typeof packet.fixture.payloadText !== 'string' || packet.fixture.payloadText.length === 0) return 'GOOGLE_SUGGESTIONS_SCHEMA_INVALID';
  if (packet.fixture.payloadSha256 !== `sha256:${sha256Text(packet.fixture.payloadText)}`) return 'GOOGLE_SUGGESTIONS_FIXTURE_DIGEST_MISMATCH';
  if (packet.fixture.sizeBytes !== Buffer.byteLength(packet.fixture.payloadText, 'utf8')) return 'GOOGLE_SUGGESTIONS_FIXTURE_DIGEST_MISMATCH';
  if (!Number.isInteger(packet.advertisedSuggestionCount) || packet.advertisedSuggestionCount < 0) return 'GOOGLE_SUGGESTIONS_SCHEMA_INVALID';
  if (!Array.isArray(packet.suggestions)) return 'GOOGLE_SUGGESTIONS_SCHEMA_INVALID';
  if (packet.suggestions.length !== packet.advertisedSuggestionCount) return 'GOOGLE_SUGGESTIONS_COUNT_MISMATCH';
  const ids = new Set();
  const kinds = new Set(['suggestedInsertion', 'suggestedDeletion', 'suggestedReplacement', 'suggestionCommentAssociation']);
  for (const suggestion of packet.suggestions) {
    if (!isObjectRecord(suggestion)) return 'GOOGLE_SUGGESTIONS_SCHEMA_INVALID';
    if (typeof suggestion.suggestionId !== 'string' || suggestion.suggestionId.length === 0) return 'GOOGLE_SUGGESTIONS_SCHEMA_INVALID';
    if (ids.has(suggestion.suggestionId)) return 'GOOGLE_SUGGESTIONS_COUNT_MISMATCH';
    ids.add(suggestion.suggestionId);
    if (!kinds.has(suggestion.kind)) return 'GOOGLE_SUGGESTIONS_UNSUPPORTED_KIND_ABSTAIN';
    if (typeof suggestion.anchor !== 'string' || suggestion.anchor.length === 0) return 'GOOGLE_SUGGESTIONS_SCHEMA_INVALID';
    if (typeof suggestion.payloadText !== 'string' || suggestion.payloadText.length === 0) return 'GOOGLE_SUGGESTIONS_SCHEMA_INVALID';
  }
  return 'GOOGLE_SUGGESTIONS_IR_ABSTAINED';
}

const hostileCases = [
  ['missing schema', (packet) => { packet.schemaVersion = ''; }],
  ['wrong provider', (packet) => { packet.provider = 'word'; }],
  ['word inheritance', (packet) => { packet.inheritedEvidenceProfileId = 'word-mac-16.112-26081010'; }],
  ['unknown profile', (packet) => { packet.profileId = 'google-docs-unknown'; }],
  ['support overclaim', (packet) => { packet.claims.supportProven = true; }],
  ['roundtrip overclaim', (packet) => { packet.claims.roundtripProven = true; }],
  ['suggestions parsed overclaim', (packet) => { packet.claims.suggestionsParsed = true; }],
  ['suggestions authority overclaim', (packet) => { packet.claims.suggestionsApplyAuthority = true; }],
  ['runtime overclaim', (packet) => { packet.productRuntimeWired = true; }],
  ['network overclaim', (packet) => { packet.networkRuntimeUsed = true; }],
  ['physical overclaim', (packet) => { packet.physicalGoogleEvidence = true; }],
  ['user document overclaim', (packet) => { packet.userDocument = true; }],
  ['stale fixture digest', (packet) => { packet.fixture.payloadSha256 = `sha256:${sha256Text('stale')}`; }],
  ['source transplant', (packet) => { packet.sourceBinding.projectId = 'foreign'; }],
  ['suggestion count mismatch', (packet) => { packet.advertisedSuggestionCount = 3; }],
  ['unknown limitation', (packet) => { packet.limitations = ['UNKNOWN']; }],
];

const semanticMutants = [
  'word inheritance',
  'support overclaim',
  'roundtrip overclaim',
  'suggestions parsed overclaim',
  'suggestions authority overclaim',
  'runtime overclaim',
  'network overclaim',
  'physical overclaim',
  'stale fixture digest',
  'source transplant',
  'unknown limitation',
];

function run() {
  const observations = [];
  const basePacket = baseline();
  const baseExpected = oracle(basePacket);
  const baseActual = evaluateGoogleDocsLocalSuggestionsIrAbstain(basePacket).code;
  observations.push({ name: 'baseline', oracle: baseExpected, evaluator: baseActual });

  for (const [name, mutate] of hostileCases) {
    const packet = clone(basePacket);
    mutate(packet);
    observations.push({
      name,
      oracle: oracle(packet),
      evaluator: evaluateGoogleDocsLocalSuggestionsIrAbstain(packet).code,
    });
  }

  const mismatches = observations.filter((row) => row.oracle !== row.evaluator);
  const survivors = observations.filter((row) => (
    row.name !== 'baseline'
    && semanticMutants.includes(row.name)
    && row.evaluator === 'GOOGLE_SUGGESTIONS_IR_ABSTAINED'
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
