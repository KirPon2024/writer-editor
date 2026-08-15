#!/usr/bin/env node
import {
  buildSyntheticGoogleDocsCommentsPacket,
  evaluateGoogleDocsLocalCommentsLimitation,
  sha256Text,
} from './rtk-google-docs-local-comments-limitation-v1.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function baseline() {
  return buildSyntheticGoogleDocsCommentsPacket();
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function oracle(packet) {
  if (!isObjectRecord(packet)) return 'GOOGLE_COMMENTS_SCHEMA_INVALID';
  if (packet.schemaVersion !== 'yalken.googleDocs.localCommentsLimitation.v1') return 'GOOGLE_COMMENTS_SCHEMA_INVALID';
  if (packet.provider !== 'google-docs' || packet.inheritedEvidenceProfileId) return 'GOOGLE_COMMENTS_WORD_EVIDENCE_INHERITANCE';
  if (!['google-docs-office-mode-post-d1-v1', 'google-docs-native-conversion-post-d1-v1'].includes(packet.profileId)) return 'GOOGLE_COMMENTS_PROFILE_NOT_DECLARED';
  if (packet.localOnly !== true
    || packet.googleAccountUsed === true
    || packet.networkRuntimeUsed === true
    || packet.productRuntimeWired === true
    || packet.physicalGoogleEvidence === true
    || packet.userDocument === true
    || packet.claims?.supportProven === true
    || packet.claims?.importProven === true
    || packet.claims?.roundtripProven === true
    || packet.claims?.commentsParsed === true
    || packet.claims?.commentsIrTrusted === true
    || packet.claims?.commentsApplyAuthority === true
    || packet.claims?.applyAuthority === true
    || packet.claims?.productMutationAuthority === true) return 'GOOGLE_COMMENTS_OVERCLAIM';
  if (!Array.isArray(packet.limitations) || packet.limitations.length === 0) return 'GOOGLE_COMMENTS_SCHEMA_INVALID';
  if (packet.limitations.some((item) => /^(UNKNOWN|ABSTAIN)$/u.test(String(item || '').trim()))) return 'GOOGLE_COMMENTS_UNKNOWN_ABSTAIN_NOT_PASS';
  if (packet.sourceBinding?.projectId !== 'synthetic-google-docs-project'
    || packet.sourceBinding?.rootId !== 'synthetic-google-docs-root'
    || packet.sourceBinding?.documentId !== 'synthetic-google-docs-document'
    || packet.sourceBinding?.canonicalRevision !== `sha256:${sha256Text('canonical-google-docs-revision-v1')}`
    || packet.sourceBinding?.workingRevision !== `sha256:${sha256Text('working-google-docs-revision-v1')}`
    || packet.sourceBinding?.generation !== 1) return 'GOOGLE_COMMENTS_SOURCE_TRANSPLANT';
  if (!isObjectRecord(packet.fixture)) return 'GOOGLE_COMMENTS_SCHEMA_INVALID';
  if (packet.fixture.mediaType !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'GOOGLE_COMMENTS_UNSUPPORTED_FORMAT_ABSTAIN';
  if (typeof packet.fixture.payloadText !== 'string' || packet.fixture.payloadText.length === 0) return 'GOOGLE_COMMENTS_SCHEMA_INVALID';
  if (packet.fixture.payloadSha256 !== `sha256:${sha256Text(packet.fixture.payloadText)}`) return 'GOOGLE_COMMENTS_FIXTURE_DIGEST_MISMATCH';
  if (packet.fixture.sizeBytes !== Buffer.byteLength(packet.fixture.payloadText, 'utf8')) return 'GOOGLE_COMMENTS_FIXTURE_DIGEST_MISMATCH';
  if (!Number.isInteger(packet.advertisedCommentCount) || packet.advertisedCommentCount < 0) return 'GOOGLE_COMMENTS_SCHEMA_INVALID';
  if (!Array.isArray(packet.comments)) return 'GOOGLE_COMMENTS_SCHEMA_INVALID';
  if (packet.comments.length !== packet.advertisedCommentCount) return 'GOOGLE_COMMENTS_COUNT_MISMATCH';
  const ids = new Set();
  const kinds = new Set(['driveCommentRoot', 'driveCommentReply', 'driveCommentResolved']);
  for (const comment of packet.comments) {
    if (!isObjectRecord(comment)) return 'GOOGLE_COMMENTS_SCHEMA_INVALID';
    if (typeof comment.commentId !== 'string' || comment.commentId.length === 0) return 'GOOGLE_COMMENTS_SCHEMA_INVALID';
    if (ids.has(comment.commentId)) return 'GOOGLE_COMMENTS_COUNT_MISMATCH';
    ids.add(comment.commentId);
    if (!kinds.has(comment.kind)) return 'GOOGLE_COMMENTS_UNSUPPORTED_KIND_ABSTAIN';
    if (typeof comment.anchor !== 'string' || comment.anchor.length === 0) return 'GOOGLE_COMMENTS_SCHEMA_INVALID';
    if (typeof comment.body !== 'string' || comment.body.length === 0) return 'GOOGLE_COMMENTS_SCHEMA_INVALID';
    if (comment.kind === 'driveCommentReply' && (typeof comment.parentCommentId !== 'string' || comment.parentCommentId.length === 0)) return 'GOOGLE_COMMENTS_SCHEMA_INVALID';
  }
  return 'GOOGLE_COMMENTS_LANE_ABSTAINED';
}

const hostileCases = [
  ['missing schema', (packet) => { packet.schemaVersion = ''; }],
  ['wrong provider', (packet) => { packet.provider = 'word'; }],
  ['word inheritance', (packet) => { packet.inheritedEvidenceProfileId = 'word-mac-16.112-26081010'; }],
  ['unknown profile', (packet) => { packet.profileId = 'google-docs-unknown'; }],
  ['support overclaim', (packet) => { packet.claims.supportProven = true; }],
  ['import overclaim', (packet) => { packet.claims.importProven = true; }],
  ['roundtrip overclaim', (packet) => { packet.claims.roundtripProven = true; }],
  ['comments parsed overclaim', (packet) => { packet.claims.commentsParsed = true; }],
  ['comments trusted overclaim', (packet) => { packet.claims.commentsIrTrusted = true; }],
  ['comments authority overclaim', (packet) => { packet.claims.commentsApplyAuthority = true; }],
  ['runtime overclaim', (packet) => { packet.productRuntimeWired = true; }],
  ['network overclaim', (packet) => { packet.networkRuntimeUsed = true; }],
  ['user document overclaim', (packet) => { packet.userDocument = true; }],
  ['stale fixture digest', (packet) => { packet.fixture.payloadSha256 = `sha256:${sha256Text('stale')}`; }],
  ['source transplant', (packet) => { packet.sourceBinding.projectId = 'foreign'; }],
  ['comment count mismatch', (packet) => { packet.advertisedCommentCount = 2; }],
  ['unknown limitation', (packet) => { packet.limitations = ['UNKNOWN']; }],
];

const semanticMutants = [
  'word inheritance',
  'support overclaim',
  'import overclaim',
  'roundtrip overclaim',
  'comments parsed overclaim',
  'comments trusted overclaim',
  'comments authority overclaim',
  'runtime overclaim',
  'network overclaim',
  'user document overclaim',
  'stale fixture digest',
  'source transplant',
];

function run() {
  const observations = [];
  const basePacket = baseline();
  const baseExpected = oracle(basePacket);
  const baseActual = evaluateGoogleDocsLocalCommentsLimitation(basePacket).code;
  observations.push({ name: 'baseline', oracle: baseExpected, evaluator: baseActual });

  for (const [name, mutate] of hostileCases) {
    const packet = clone(basePacket);
    mutate(packet);
    observations.push({
      name,
      oracle: oracle(packet),
      evaluator: evaluateGoogleDocsLocalCommentsLimitation(packet).code,
    });
  }

  const mismatches = observations.filter((row) => row.oracle !== row.evaluator);
  const survivors = observations.filter((row) => (
    row.name !== 'baseline'
    && semanticMutants.includes(row.name)
    && row.evaluator === 'GOOGLE_COMMENTS_LANE_ABSTAINED'
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
