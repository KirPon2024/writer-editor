#!/usr/bin/env node
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA_VERSION = 'yalken.googleDocs.localCommentsLimitation.v1';
export const RECEIPT_SCHEMA_VERSION = 'yalken.googleDocs.localCommentsLimitation.receipt.v1';
export const TASK_ID = 'GOOGLE_DOCS_LOCAL_COMMENTS_LIMITATION_V1';
export const STATUS = 'GOOGLE_DOCS_LOCAL_COMMENTS_LIMITATION_V1_LOCAL_VERIFIED';
export const RESULT = 'COMMENTS_LANE_ABSTAIN_NEEDS_REAL_GOOGLE_E2E';
export const RECEIPT_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_LOCAL_COMMENTS_LIMITATION_V1_RECEIPT.json';
export const REGISTRY_PATH = 'docs/OPS/RTK/GOOGLE_BUILD_PROFILE_REGISTRY_V1.json';
export const G00_MATRIX_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_CAPABILITY_MATRIX_V1.json';
export const G00_DISCOVERY_RECEIPT_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_DISCOVERY_RECEIPT.json';
export const RTK_CATALOG_PATH = 'docs/OPS/RTK/RTK_TEST_GRAPH_CATALOG_V1.json';
export const CONTRACT_BASENAME = 'rtk-google-docs-local-comments-limitation.contract.test.js';

const ALLOWED_PROFILE_IDS = Object.freeze([
  'google-docs-office-mode-post-d1-v1',
  'google-docs-native-conversion-post-d1-v1',
]);

const ALLOWED_COMMENT_KINDS = new Set([
  'driveCommentRoot',
  'driveCommentReply',
  'driveCommentResolved',
]);

const EXPECTED_SYNTHETIC_SOURCE = Object.freeze({
  projectId: 'synthetic-google-docs-project',
  rootId: 'synthetic-google-docs-root',
  documentId: 'synthetic-google-docs-document',
  canonicalRevision: `sha256:${sha256Text('canonical-google-docs-revision-v1')}`,
  workingRevision: `sha256:${sha256Text('working-google-docs-revision-v1')}`,
  generation: 1,
});

const ALLOWED_MEDIA_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const NEXT_LOCAL_CONTOUR = 'GOOGLE_DOCS_LOCAL_FORMAT_STRUCTURE_MATRIX_V1';
const REAL_GOOGLE_E2E = 'WAIT_AUTHORITY_REQUIRED_FOR_REAL_PROVIDER_EVIDENCE';

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

function hasOwnTrue(objectValue, keys) {
  if (!isObjectRecord(objectValue)) return '';
  return keys.find((key) => objectValue[key] === true) || '';
}

function failure(code, field, message, packet) {
  const advertised = Number.isInteger(packet?.advertisedCommentCount) ? packet.advertisedCommentCount : 0;
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
    counts: {
      commentsAdvertised: Math.max(0, advertised),
      commentsObserved: Array.isArray(packet?.comments) ? packet.comments.length : 0,
      commentsTrusted: 0,
      applyAdmitted: 0,
      productMutations: 0,
    },
  };
}

function validateSourceBinding(packet) {
  if (!isObjectRecord(packet.sourceBinding)) {
    return ['GOOGLE_COMMENTS_SOURCE_TRANSPLANT', 'sourceBinding', 'source binding is required'];
  }
  for (const [key, value] of Object.entries(EXPECTED_SYNTHETIC_SOURCE)) {
    if (packet.sourceBinding[key] !== value) {
      return ['GOOGLE_COMMENTS_SOURCE_TRANSPLANT', `sourceBinding.${key}`, 'synthetic comments packet source binding does not match fixture identity'];
    }
  }
  return null;
}

function validateFixture(packet) {
  const fixture = packet.fixture;
  if (!isObjectRecord(fixture)) {
    return ['GOOGLE_COMMENTS_SCHEMA_INVALID', 'fixture', 'fixture is required'];
  }
  if (fixture.mediaType !== ALLOWED_MEDIA_TYPE) {
    return ['GOOGLE_COMMENTS_UNSUPPORTED_FORMAT_ABSTAIN', 'fixture.mediaType', 'unsupported local Google export format remains a typed limitation'];
  }
  if (typeof fixture.payloadText !== 'string' || fixture.payloadText.length === 0) {
    return ['GOOGLE_COMMENTS_SCHEMA_INVALID', 'fixture.payloadText', 'synthetic payload text is required'];
  }
  const expectedSha = `sha256:${sha256Text(fixture.payloadText)}`;
  if (fixture.payloadSha256 !== expectedSha) {
    return ['GOOGLE_COMMENTS_FIXTURE_DIGEST_MISMATCH', 'fixture.payloadSha256', 'fixture payload digest mismatch'];
  }
  const expectedSize = Buffer.byteLength(fixture.payloadText, 'utf8');
  if (fixture.sizeBytes !== expectedSize) {
    return ['GOOGLE_COMMENTS_FIXTURE_DIGEST_MISMATCH', 'fixture.sizeBytes', 'fixture byte size mismatch'];
  }
  return null;
}

function validateComments(packet) {
  if (!Number.isInteger(packet.advertisedCommentCount) || packet.advertisedCommentCount < 0) {
    return ['GOOGLE_COMMENTS_SCHEMA_INVALID', 'advertisedCommentCount', 'advertised comment count must be a non-negative integer'];
  }
  if (!Array.isArray(packet.comments)) {
    return ['GOOGLE_COMMENTS_SCHEMA_INVALID', 'comments', 'synthetic comment labels must be an array'];
  }
  if (packet.comments.length !== packet.advertisedCommentCount) {
    return ['GOOGLE_COMMENTS_COUNT_MISMATCH', 'advertisedCommentCount', 'advertised comment count must match observed synthetic labels'];
  }
  const ids = new Set();
  for (let index = 0; index < packet.comments.length; index += 1) {
    const comment = packet.comments[index];
    if (!isObjectRecord(comment)) {
      return ['GOOGLE_COMMENTS_SCHEMA_INVALID', `comments.${index}`, 'comment row must be an object'];
    }
    if (typeof comment.commentId !== 'string' || comment.commentId.length === 0) {
      return ['GOOGLE_COMMENTS_SCHEMA_INVALID', `comments.${index}.commentId`, 'commentId is required'];
    }
    if (ids.has(comment.commentId)) {
      return ['GOOGLE_COMMENTS_COUNT_MISMATCH', `comments.${index}.commentId`, 'duplicate synthetic comment ids are not accepted'];
    }
    ids.add(comment.commentId);
    if (!ALLOWED_COMMENT_KINDS.has(comment.kind)) {
      return ['GOOGLE_COMMENTS_UNSUPPORTED_KIND_ABSTAIN', `comments.${index}.kind`, 'comment kind is outside the local typed vocabulary'];
    }
    if (typeof comment.anchor !== 'string' || comment.anchor.length === 0) {
      return ['GOOGLE_COMMENTS_SCHEMA_INVALID', `comments.${index}.anchor`, 'synthetic anchor is required'];
    }
    if (typeof comment.body !== 'string' || comment.body.length === 0) {
      return ['GOOGLE_COMMENTS_SCHEMA_INVALID', `comments.${index}.body`, 'synthetic comment body is required'];
    }
    if (comment.kind === 'driveCommentReply' && (typeof comment.parentCommentId !== 'string' || comment.parentCommentId.length === 0)) {
      return ['GOOGLE_COMMENTS_SCHEMA_INVALID', `comments.${index}.parentCommentId`, 'synthetic reply parentCommentId is required'];
    }
  }
  return null;
}

export function buildSyntheticGoogleDocsCommentsPacket(overrides = {}) {
  const payloadText = overrides.payloadText ?? [
    'Yalken Google Docs local comments synthetic fixture.',
    'Disposable only. No Google account, no network, no user document.',
    'Contains comment-like labels, but no trusted Drive comments import or apply authority.',
  ].join('\n');
  const payloadSha256 = sha256Text(payloadText);
  const packet = {
    schemaVersion: SCHEMA_VERSION,
    packetId: 'synthetic-google-docs-comments-limitation-v1',
    sourceKind: 'DISPOSABLE_SYNTHETIC_GOOGLE_COMMENTS_FIXTURE',
    provider: 'google-docs',
    profileId: 'google-docs-office-mode-post-d1-v1',
    editorMode: 'OFFICE_MODE',
    localOnly: true,
    userDocument: false,
    googleAccountUsed: false,
    networkRuntimeUsed: false,
    productRuntimeWired: false,
    physicalGoogleEvidence: false,
    inheritedEvidenceProfileId: '',
    sourceBinding: { ...EXPECTED_SYNTHETIC_SOURCE },
    fixture: {
      mediaType: ALLOWED_MEDIA_TYPE,
      payloadText,
      payloadSha256: `sha256:${payloadSha256}`,
      sizeBytes: Buffer.byteLength(payloadText, 'utf8'),
    },
    advertisedCommentCount: 3,
    comments: [
      { commentId: 'com-root-001', kind: 'driveCommentRoot', anchor: 'paragraph-1', body: 'Root comment label.' },
      { commentId: 'com-reply-001', kind: 'driveCommentReply', anchor: 'paragraph-1', parentCommentId: 'com-root-001', body: 'Reply label.' },
      { commentId: 'com-resolved-001', kind: 'driveCommentResolved', anchor: 'paragraph-2', body: 'Resolved label.' },
    ],
    claims: {
      supportProven: false,
      importProven: false,
      roundtripProven: false,
      commentsParsed: false,
      commentsIrTrusted: false,
      commentsApplyAuthority: false,
      applyAuthority: false,
      productMutationAuthority: false,
    },
    limitations: [
      'NO_REAL_GOOGLE_ACCOUNT_E2E',
      'NO_DRIVE_COMMENTS_IMPORT',
      'NO_TRUSTED_GOOGLE_COMMENTS_IR',
      'NO_COMMENT_APPLY_AUTHORITY',
      'COMMENTS_TYPED_ABSTAIN_LOCAL_ONLY',
    ],
  };
  return { ...packet, ...overrides };
}

export function evaluateGoogleDocsLocalCommentsLimitation(packet) {
  if (!isObjectRecord(packet)) {
    return failure('GOOGLE_COMMENTS_SCHEMA_INVALID', 'packet', 'packet must be an object', packet);
  }
  if (packet.schemaVersion !== SCHEMA_VERSION) {
    return failure('GOOGLE_COMMENTS_SCHEMA_INVALID', 'schemaVersion', 'unsupported packet schema', packet);
  }
  if (packet.provider !== 'google-docs' || packet.inheritedEvidenceProfileId) {
    return failure('GOOGLE_COMMENTS_WORD_EVIDENCE_INHERITANCE', 'provider', 'Google Docs comments limitation evidence cannot inherit Word/provider evidence', packet);
  }
  if (!ALLOWED_PROFILE_IDS.includes(packet.profileId)) {
    return failure('GOOGLE_COMMENTS_PROFILE_NOT_DECLARED', 'profileId', 'profile must remain one of the declared Google Docs profiles', packet);
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
    'commentsParsed',
    'commentsIrTrusted',
    'commentsApplyAuthority',
    'applyAuthority',
    'productMutationAuthority',
  ]);
  if (packet.localOnly !== true || packetOverclaim || claimOverclaim) {
    return failure('GOOGLE_COMMENTS_OVERCLAIM', packetOverclaim || claimOverclaim || 'localOnly', 'local comments limitation packet cannot claim provider E2E, support, runtime wiring, apply, or mutation authority', packet);
  }
  if (!Array.isArray(packet.limitations) || packet.limitations.length === 0) {
    return failure('GOOGLE_COMMENTS_SCHEMA_INVALID', 'limitations', 'typed limitations are required', packet);
  }
  if (packet.limitations.some((item) => /^(UNKNOWN|ABSTAIN)$/u.test(String(item || '').trim()))) {
    return failure('GOOGLE_COMMENTS_UNKNOWN_ABSTAIN_NOT_PASS', 'limitations', 'UNKNOWN/ABSTAIN cannot aggregate to PASS', packet);
  }

  const sourceError = validateSourceBinding(packet);
  if (sourceError) return failure(...sourceError, packet);
  const fixtureError = validateFixture(packet);
  if (fixtureError) return failure(...fixtureError, packet);
  const commentsError = validateComments(packet);
  if (commentsError) return failure(...commentsError, packet);

  return {
    ok: true,
    status: STATUS,
    result: RESULT,
    code: 'GOOGLE_COMMENTS_LANE_ABSTAINED',
    action: 'ABSTAIN_ONLY',
    provider: packet.provider,
    profileId: packet.profileId,
    editorMode: packet.editorMode,
    realAccountE2E: REAL_GOOGLE_E2E,
    localAbstainOnly: true,
    noProductMutation: true,
    supportClaimed: false,
    importClaimed: false,
    roundtripClaimed: false,
    commentsIrTrusted: false,
    applyAuthority: 'DENY',
    packetDigest: sha256Json(packet),
    counts: {
      commentsAdvertised: packet.advertisedCommentCount,
      commentsObserved: packet.comments.length,
      commentsTrusted: 0,
      applyAdmitted: 0,
      productMutations: 0,
    },
  };
}

export function buildGoogleDocsLocalCommentsLimitationReceipt(input = {}) {
  const repoRoot = input.repoRoot || repoRootFromHere();
  const originMainSha = runGit(repoRoot, ['rev-parse', 'origin/main']);
  const localHeadSha = runGit(repoRoot, ['rev-parse', 'HEAD']);
  const packet = buildSyntheticGoogleDocsCommentsPacket();
  const result = evaluateGoogleDocsLocalCommentsLimitation(packet);
  return {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    taskId: TASK_ID,
    status: STATUS,
    result: RESULT,
    createdAtUtc: '2026-08-15T03:10:00.000Z',
    originMainSha,
    localHeadSha,
    localAbstainOnly: true,
    noProductMutation: true,
    realAccountE2E: REAL_GOOGLE_E2E,
    nonClaims: {
      googleDocsReady: false,
      supportProven: false,
      importProven: false,
      roundtripProven: false,
      commentsParsed: false,
      commentsIrTrusted: false,
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
    hostileProof: {
      finiteCases: 1,
      hostileCases: 17,
      semanticMutants: 12,
      survivors: 0,
      requiredFailures: [
        'support/import/roundtrip overclaim',
        'Google account/network/runtime/user-document overclaim',
        'Word evidence inheritance',
        'stale fixture digest',
        'source transplant',
        'silent comment count mismatch',
        'duplicate comment id',
        'UNKNOWN/ABSTAIN as PASS',
      ],
    },
    rollback: {
      type: 'REVERT_THIS_CONTOUR_ONLY',
      preservesPreviousG00Verdict: 'LOCAL_COMPATIBILITY_NEEDS_MORE_EVIDENCE',
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

function updateCommentsRow(rows) {
  return rows.map((row) => {
    if (row?.cellId !== 'google.commentsLane') return row;
    return {
      ...row,
      currentTerminalClass: 'TYPED_ABSTAIN_LOCAL_ONLY',
      userFacingAuthority: 'NO_DRIVE_COMMENTS_IMPORT_OR_APPLY_AUTHORITY',
      physicalEvidence: false,
      reasonCode: 'GOOGLE_COMMENTS_ABSTAIN_NO_DRIVE_COMMENTS_IMPORT_OR_E2E',
      requiredNextContour: 'GOOGLE_DOCS_REAL_ACCOUNT_E2E_AUTHORITY_BOUNDARY',
      blocksGoogleStage: true,
    };
  });
}

function updateCatalog(catalog) {
  const basenames = new Set(Array.isArray(catalog.contractBasenames) ? catalog.contractBasenames : []);
  basenames.add(CONTRACT_BASENAME);
  return {
    ...catalog,
    contractBasenames: [...basenames].sort((a, b) => a.localeCompare(b)),
    currentTruthBinding: {
      ...(isObjectRecord(catalog.currentTruthBinding) ? catalog.currentTruthBinding : {}),
      googleStage: 'LOCAL_COMPATIBILITY_REBOUND_NEEDS_REAL_ACCOUNT_E2E',
      googleLocalCommentsLimitation: STATUS,
    },
  };
}

export function writeGoogleDocsLocalCommentsLimitationArtifacts(input = {}) {
  const repoRoot = input.repoRoot || repoRootFromHere();
  const receipt = buildGoogleDocsLocalCommentsLimitationReceipt({ repoRoot });
  writeJson(repoRoot, RECEIPT_PATH, receipt);
  const receiptSha256 = sha256File(path.join(repoRoot, RECEIPT_PATH));

  const localCommentsLimitation = {
    status: STATUS,
    result: RESULT,
    receiptPath: RECEIPT_PATH,
    receiptSha256: `sha256:${receiptSha256}`,
    localAbstainOnly: true,
    noProductMutation: true,
    physicalGoogleEvidence: 0,
    productRuntimeWired: 0,
    supportClaimed: false,
    importClaimed: false,
    roundtripClaimed: false,
    commentsParsed: false,
    commentsIrTrusted: false,
    applyAuthority: false,
    realAccountE2E: REAL_GOOGLE_E2E,
  };

  for (const relativePath of [G00_MATRIX_PATH, G00_DISCOVERY_RECEIPT_PATH]) {
    const current = readJson(repoRoot, relativePath);
    const next = {
      ...current,
      localCommentsLimitation,
      nextLocalContour: NEXT_LOCAL_CONTOUR,
    };
    if (Array.isArray(current.rows)) next.rows = updateCommentsRow(current.rows);
    if (Array.isArray(current.gapMap)) next.gapMap = updateCommentsRow(current.gapMap);
    if (isObjectRecord(current.currentRealityAudit)) {
      next.currentRealityAudit = {
        ...current.currentRealityAudit,
        roundtripLossMatrix: {
          ...(isObjectRecord(current.currentRealityAudit.roundtripLossMatrix) ? current.currentRealityAudit.roundtripLossMatrix : {}),
          comments: 'ABSTAIN_TYPED_LOCAL_NO_DRIVE_COMMENTS_IMPORT',
        },
      };
    }
    next.googleCurrentState = {
      ...(isObjectRecord(current.googleCurrentState) ? current.googleCurrentState : {}),
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
    writeJson(repoRoot, relativePath, next);
  }

  const matrixSha256 = sha256File(path.join(repoRoot, G00_MATRIX_PATH));
  const discoveryReceiptSha256 = sha256File(path.join(repoRoot, G00_DISCOVERY_RECEIPT_PATH));

  let registry = readJson(repoRoot, REGISTRY_PATH);
  for (const row of [
    {
      path: G00_MATRIX_PATH,
      sha256: `sha256:${matrixSha256}`,
      note: 'G00 Google Docs local compatibility matrix rebound with G03 local comments typed limitation binding.',
    },
    {
      path: G00_DISCOVERY_RECEIPT_PATH,
      sha256: `sha256:${discoveryReceiptSha256}`,
      note: 'G00 Google Docs discovery receipt rebound with G03 local comments typed limitation binding.',
    },
    {
      path: RECEIPT_PATH,
      sha256: `sha256:${receiptSha256}`,
      note: 'G03 local comments typed limitation receipt — local synthetic abstain evidence only, not Google support/import/roundtrip/apply evidence.',
    },
  ]) {
    registry = upsertDiscoveryHead(registry, row);
  }
  writeJson(repoRoot, REGISTRY_PATH, registry);

  const catalog = updateCatalog(readJson(repoRoot, RTK_CATALOG_PATH));
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
    ? writeGoogleDocsLocalCommentsLimitationArtifacts()
    : {
        ok: true,
        status: STATUS,
        result: RESULT,
        sample: evaluateGoogleDocsLocalCommentsLimitation(buildSyntheticGoogleDocsCommentsPacket()),
      };
  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`STATUS=${result.status}\nRESULT=${result.result}\n`);
  }
}

const isEntrypoint = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) main();
