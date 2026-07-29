import crypto from 'node:crypto';

import {
  RTK_FEATURE_FLAG,
  RTK_LIFECYCLE_STATES,
  RTK_NO_WRITE_ANALYSIS_V2_SCHEMA,
  RTK_PRIVATE_MANIFEST_V2_SCHEMA,
  RTK_REASON_CODES,
  RTK_TERMINAL_LIFECYCLE_STATES,
  RTK_TRANSPORT_ARTIFACT_V2_SCHEMA,
} from './reviewTransportCore.mjs';

export const REVISION_BRIDGE_G0B_TRANSPORT_CONTRACT_SCHEMA =
  'revision-bridge.g0b-transport-contract.v1';
export const REVISION_BRIDGE_G0B_WORD_SETTINGS_CAPSULE_SCHEMA =
  'revision-bridge.g0b-word-settings-capsule.v1';
export const REVISION_BRIDGE_G0B_SUPPORTED_CORPUS_SCHEMA =
  'revision-bridge.g0b-supported-corpus.v1';
export const REVISION_BRIDGE_W1_NO_WRITE_ANALYSIS_SCHEMA =
  RTK_NO_WRITE_ANALYSIS_V2_SCHEMA;
export const REVISION_BRIDGE_W1_TRANSPORT_ARTIFACT_SCHEMA =
  RTK_TRANSPORT_ARTIFACT_V2_SCHEMA;
export const REVISION_BRIDGE_W1_PRIVATE_MANIFEST_SCHEMA =
  RTK_PRIVATE_MANIFEST_V2_SCHEMA;
export const REVISION_BRIDGE_W1_FEATURE_FLAG = RTK_FEATURE_FLAG;

export const REVISION_BRIDGE_G0B_RETURN_MODES = Object.freeze(['TRACKED', 'CLEAN', 'MIXED']);
export const REVISION_BRIDGE_W1_LIFECYCLE_STATES = RTK_LIFECYCLE_STATES;
export const REVISION_BRIDGE_W1_TERMINAL_LIFECYCLE_STATES = RTK_TERMINAL_LIFECYCLE_STATES;
export const REVISION_BRIDGE_G0B_REASON_CODES = Object.freeze([
  'G0B_LOCAL_CONTRACTS_OK',
  'G0B_NO_TEXT_CANDIDATE',
  'G0B_EXACT_TEXT_CANDIDATE',
  'G0B_DUPLICATE_TEXT_CANDIDATE',
  'G0B_STRUCTURAL_PARAGRAPH_MARK',
  'G0B_STRUCTURAL_MOVE_REVISION',
  'G0B_STRUCTURAL_SPLIT_MERGE',
  'G0B_COMMENT_LANE_CONSERVED',
  'G0B_CROSS_ROUND_LOCATOR_BLOCKED',
  'G0B_ANCHOR_HMAC_VALID',
  'G0B_ANCHOR_HMAC_TAMPERED',
  'G0B_CORPUS_DIGEST_FROZEN',
  'G0B_CORPUS_DIGEST_MISMATCH',
  'G0B_PARSER_EXISTING_TOKENIZER_ACCEPTED',
  'G0B_PARSER_DEPENDENCY_OWNER_DECISION_REQUIRED',
  'DEFERRED_EXTERNAL_WORD_EVIDENCE',
]);
export const REVISION_BRIDGE_W1_REASON_CODES = RTK_REASON_CODES;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function rawString(value) {
  return typeof value === 'string' ? value : '';
}

function cloneJsonSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Text(text) {
  return crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

function hmacSha256Text(secretKey, text) {
  return crypto.createHmac('sha256', Buffer.from(secretKey, 'utf8'))
    .update(Buffer.from(text, 'utf8'))
    .digest('hex');
}

function countOccurrences(text, needle) {
  if (!needle) return 0;
  let count = 0;
  let cursor = 0;
  while (cursor <= text.length) {
    const found = text.indexOf(needle, cursor);
    if (found === -1) break;
    count += 1;
    cursor = found + 1;
  }
  return count;
}

function buildReason(code, field, message, details = {}) {
  return { code, field, message, ...details };
}

function normalizeBlocks(blocks) {
  return Array.isArray(blocks) ? blocks.filter(isPlainObject) : [];
}

function normalizeChanges(changes) {
  return Array.isArray(changes) ? changes.filter(isPlainObject) : [];
}

function normalizeComments(comments) {
  return Array.isArray(comments) ? comments.filter(isPlainObject).map(cloneJsonSafe) : [];
}

function isStructuralKind(kind) {
  return kind === 'paragraphMark' || kind === 'move' || kind === 'split' || kind === 'merge';
}

function structuralReasonForKind(kind) {
  if (kind === 'paragraphMark') return 'G0B_STRUCTURAL_PARAGRAPH_MARK';
  if (kind === 'move') return 'G0B_STRUCTURAL_MOVE_REVISION';
  return 'G0B_STRUCTURAL_SPLIT_MERGE';
}

export function createSupportedCorpusDigest(corpus) {
  return `sha256:${sha256Text(stableJson(corpus))}`;
}

export function buildG0BAnchor(block, secretKey) {
  const blockId = rawString(block?.blockId);
  const text = rawString(block?.text);
  const digest = `sha256:${sha256Text(`${blockId}\n${text}`)}`;
  const unsigned = {
    schemaVersion: 'revision-bridge.g0b-anchor.v1',
    blockId,
    textDigest: digest,
  };
  return {
    ...unsigned,
    hmac: secretKey ? `hmac-sha256:${hmacSha256Text(secretKey, stableJson(unsigned))}` : '',
  };
}

export function verifyG0BAnchor(anchor, block, secretKey) {
  const expected = buildG0BAnchor(block, secretKey);
  const ok = isPlainObject(anchor)
    && anchor.schemaVersion === expected.schemaVersion
    && anchor.blockId === expected.blockId
    && anchor.textDigest === expected.textDigest
    && anchor.hmac === expected.hmac;
  return {
    ok,
    code: ok ? 'G0B_ANCHOR_HMAC_VALID' : 'G0B_ANCHOR_HMAC_TAMPERED',
    expected,
    observed: cloneJsonSafe(anchor || {}),
  };
}

export function freezeSupportedCorpus(corpus, expectedDigest) {
  const observedDigest = createSupportedCorpusDigest(corpus);
  const ok = observedDigest === expectedDigest;
  return {
    ok,
    schemaVersion: REVISION_BRIDGE_G0B_SUPPORTED_CORPUS_SCHEMA,
    code: ok ? 'G0B_CORPUS_DIGEST_FROZEN' : 'G0B_CORPUS_DIGEST_MISMATCH',
    expectedDigest,
    observedDigest,
  };
}

export function compareParserCandidates(candidates, options = {}) {
  const list = Array.isArray(candidates) ? candidates.filter(isPlainObject) : [];
  const existing = list.find((candidate) => candidate.id === 'bounded-scanner-no-regex-v2');
  const safeExisting = existing
    && existing.correctness === 'pass'
    && existing.boundedAuditability === true
    && existing.generalXmlPlatform !== true
    && existing.regexXmlParser !== true
    && existing.namespaceAware === true
    && existing.chunkBoundaryInvariant === true;
  if (safeExisting) {
    return {
      ok: true,
      selected: 'bounded-scanner-no-regex-v2',
      code: 'G0B_PARSER_EXISTING_TOKENIZER_ACCEPTED',
      ownerDecisionRequired: false,
      candidates: cloneJsonSafe(list),
    };
  }

  const maintainedDependency = list.find((candidate) => candidate.requiresDependency === true);
  return {
    ok: false,
    selected: maintainedDependency?.id || null,
    code: 'G0B_PARSER_DEPENDENCY_OWNER_DECISION_REQUIRED',
    ownerDecisionRequired: options.ownerApprovedDependency !== true,
    candidates: cloneJsonSafe(list),
  };
}

export function analyzeG0BTransportContract(input = {}) {
  const roundId = rawString(input.roundId);
  const returnMode = REVISION_BRIDGE_G0B_RETURN_MODES.includes(input.returnMode)
    ? input.returnMode
    : 'TRACKED';
  const blocks = normalizeBlocks(input.blocks);
  const changes = normalizeChanges(input.changes);
  const comments = normalizeComments(input.comments);
  const secretKey = rawString(input.secretKey);
  const reasons = [];
  const operations = [];
  const anchors = [];

  for (const block of blocks) {
    anchors.push(buildG0BAnchor(block, secretKey));
  }

  for (const comment of comments) {
    reasons.push(buildReason(
      'G0B_COMMENT_LANE_CONSERVED',
      `comments.${rawString(comment.commentId) || 'unknown'}`,
      'Comment body is conserved in an independent lane and cannot authorize text mutation.',
    ));
  }

  for (const change of changes) {
    const changeId = rawString(change.changeId);
    const kind = rawString(change.kind || 'textExact');
    const locatorRoundId = rawString(change.locator?.roundId || roundId);
    const block = blocks.find((candidate) => rawString(candidate.blockId) === rawString(change.blockId));
    const blockText = rawString(block?.text);

    if (locatorRoundId && roundId && locatorRoundId !== roundId) {
      reasons.push(buildReason(
        'G0B_CROSS_ROUND_LOCATOR_BLOCKED',
        `changes.${changeId}.locator.roundId`,
        'Cross-round locators never bind to the current analysis round.',
        { changeId },
      ));
      continue;
    }

    if (isStructuralKind(kind)) {
      reasons.push(buildReason(
        structuralReasonForKind(kind),
        `changes.${changeId}.kind`,
        'Structural return evidence is manual-only and produces zero text operations.',
        { changeId, kind },
      ));
      continue;
    }

    if (kind === 'commentOnly' || kind === 'noEdit') {
      reasons.push(buildReason(
        'G0B_NO_TEXT_CANDIDATE',
        `changes.${changeId}.kind`,
        'No-edit and comment-only evidence produces zero text operations.',
        { changeId, kind },
      ));
      continue;
    }

    const oldText = rawString(change.oldText);
    const newText = rawString(change.newText);
    const occurrenceCount = countOccurrences(blockText, oldText);
    if (occurrenceCount === 1 && oldText !== newText) {
      const from = blockText.indexOf(oldText);
      operations.push({
        changeId,
        blockId: rawString(block?.blockId),
        kind: 'replaceText',
        from,
        to: from + oldText.length,
        expectedText: oldText,
        replacementText: newText,
        returnMode,
      });
      reasons.push(buildReason(
        'G0B_EXACT_TEXT_CANDIDATE',
        `changes.${changeId}.oldText`,
        'Exactly one baseline occurrence can become a local exact candidate.',
        { changeId },
      ));
      continue;
    }

    reasons.push(buildReason(
      occurrenceCount === 0 ? 'G0B_NO_TEXT_CANDIDATE' : 'G0B_DUPLICATE_TEXT_CANDIDATE',
      `changes.${changeId}.oldText`,
      'Text evidence is not uniquely exact and produces zero operations.',
      { changeId, occurrenceCount },
    ));
  }

  return {
    schemaVersion: REVISION_BRIDGE_G0B_TRANSPORT_CONTRACT_SCHEMA,
    type: 'revisionBridge.g0bTransportContract',
    status: operations.length > 0 ? 'localContractsOk' : 'manualOrNoChange',
    code: 'G0B_LOCAL_CONTRACTS_OK',
    reason: 'G0B_LOCAL_CONTRACTS_OK',
    returnMode,
    roundId,
    localContractStatus: 'PASS',
    externalWordStatus: 'DEFERRED_EXTERNAL_WORD_EVIDENCE',
    exactOperations: operations,
    commentsLane: comments,
    anchors,
    reasons,
    metrics: {
      blockCount: blocks.length,
      changeCount: changes.length,
      commentCount: comments.length,
      exactOperationCount: operations.length,
      manualReasonCount: reasons.filter((reason) => reason.code !== 'G0B_EXACT_TEXT_CANDIDATE').length,
    },
  };
}

function normalizeLifecycleState(value, fallback = 'DRAFT_EXPORT_INTENT') {
  return REVISION_BRIDGE_W1_LIFECYCLE_STATES.includes(value) ? value : fallback;
}

function assertMainAuthorityToken(token) {
  return isPlainObject(token)
    && token.kind === 'main-process-export-authority'
    && typeof token.requestId === 'string'
    && token.requestId.trim()
    && token.canWriteManuscript !== true;
}

function redactExternalTransport(value) {
  if (Array.isArray(value)) return value.map((item) => redactExternalTransport(item));
  if (!isPlainObject(value)) return value;
  const redacted = {};
  for (const [key, item] of Object.entries(value)) {
    if (/secret|privateKey|hmacKey|token/iu.test(key)) continue;
    redacted[key] = redactExternalTransport(item);
  }
  return redacted;
}

export function resolveW1NoWriteFeatureFlag(flags = {}) {
  const enabled = flags[REVISION_BRIDGE_W1_FEATURE_FLAG] === true;
  return {
    schemaVersion: 'yalken.rtk.feature-flag.v2',
    flag: REVISION_BRIDGE_W1_FEATURE_FLAG,
    enabled,
    mutationSurfaceEnabled: false,
    canApply: false,
    canWriteManuscript: false,
    code: 'RTK_NO_WRITE_ANALYSIS_READY',
  };
}

export function buildW1ExportIntent(input = {}) {
  const authorityToken = input.authorityToken;
  const ok = assertMainAuthorityToken(authorityToken);
  const roundId = rawString(input.roundId);
  if (!ok) {
    return {
      ok: false,
      schemaVersion: 'yalken.rtk.export-intent.v2',
      code: 'RTK_BLOCKED_RECONCILING',
      canWriteManuscript: false,
      reasons: [buildReason(
        'RTK_BLOCKED_RECONCILING',
        'authorityToken',
        'W1 export intent requires main-process authority and never carries writer authority.',
      )],
    };
  }
  return {
    ok: true,
    schemaVersion: 'yalken.rtk.export-intent.v2',
    roundId,
    requestId: rawString(authorityToken.requestId),
    lifecycleState: 'OPEN_FOR_RETURN',
    canWriteManuscript: false,
    canApply: false,
    code: 'RTK_ROUND_OPEN_FOR_RETURN',
    filenameHint: createW1HumanFilenameHint(input),
  };
}

export function createW1HumanFilenameHint(input = {}) {
  const title = rawString(input.title).replace(/[^a-z0-9а-яё._ -]+/giu, '').trim()
    || 'review-round';
  const roundId = rawString(input.roundId).replace(/[^a-z0-9_-]+/giu, '').slice(0, 48)
    || 'round';
  return {
    schemaVersion: 'yalken.rtk.filename-hint.v2',
    value: `${title}-${roundId}.docx`,
    participatesInAuthority: false,
    code: 'RTK_FILENAME_HINT_NON_AUTHORITY',
  };
}

export function buildW1NeutralTransportArtifact(input = {}) {
  const roundId = rawString(input.roundId);
  const publicTransport = redactExternalTransport(input.transport || {});
  const publicManifest = {
    schemaVersion: REVISION_BRIDGE_W1_TRANSPORT_ARTIFACT_SCHEMA,
    roundId,
    lifecycleState: normalizeLifecycleState(input.lifecycleState, 'OPEN_FOR_RETURN'),
    returnMode: REVISION_BRIDGE_G0B_RETURN_MODES.includes(input.returnMode) ? input.returnMode : 'TRACKED',
    transport: publicTransport,
    filenameHint: createW1HumanFilenameHint(input),
    canWriteManuscript: false,
    canApply: false,
  };
  const privateManifest = {
    schemaVersion: REVISION_BRIDGE_W1_PRIVATE_MANIFEST_SCHEMA,
    roundId,
    lifecycleState: publicManifest.lifecycleState,
    privateKeyRef: rawString(input.privateKeyRef),
    sourceProjectDigest: rawString(input.sourceProjectDigest),
    externalArtifactDigest: createSupportedCorpusDigest(publicManifest),
  };
  return {
    ok: true,
    schemaVersion: 'yalken.rtk.neutral-transport-bundle.v2',
    code: 'RTK_PRIVATE_MANIFEST_BOUNDARY_OK',
    publicManifest,
    privateManifest,
    reasons: [
      buildReason(
        'RTK_PRIVATE_MANIFEST_BOUNDARY_OK',
        'publicManifest',
        'Private manifest identity is stored separately from the external transport artifact.',
      ),
      buildReason(
        'RTK_PRIVATE_KEY_NOT_EXPORTED',
        'publicManifest',
        'Secret and private-key fields are removed from the external artifact.',
      ),
    ],
  };
}

export function analyzeW1ReturnedArtifact(input = {}) {
  const lifecycleState = normalizeLifecycleState(input.lifecycleState || input.publicManifest?.lifecycleState);
  if (lifecycleState !== 'OPEN_FOR_RETURN') {
    return {
      ok: false,
      schemaVersion: REVISION_BRIDGE_W1_NO_WRITE_ANALYSIS_SCHEMA,
      status: 'blocked',
      code: 'RTK_ROUND_NOT_OPEN_FOR_RETURN',
      canWriteManuscript: false,
      canApply: false,
      exactOperations: [],
      reasons: [buildReason(
        'RTK_ROUND_NOT_OPEN_FOR_RETURN',
        'lifecycleState',
        'Only OPEN_FOR_RETURN rounds can admit a returned artifact for no-write analysis.',
        { lifecycleState },
      )],
    };
  }
  const transport = analyzeG0BTransportContract(input.transport || input.publicManifest?.transport || {});
  return {
    ok: true,
    schemaVersion: REVISION_BRIDGE_W1_NO_WRITE_ANALYSIS_SCHEMA,
    status: 'analyzed-no-write',
    code: 'RTK_NO_WRITE_ANALYSIS_READY',
    lifecycleState: 'RETURN_ANALYZED',
    canWriteManuscript: false,
    canApply: false,
    roundId: rawString(input.roundId || input.publicManifest?.roundId),
    exactOperations: cloneJsonSafe(transport.exactOperations),
    commentsLane: cloneJsonSafe(transport.commentsLane),
    reasons: [
      buildReason(
        'RTK_NO_WRITE_ANALYSIS_READY',
        'transport',
        'Returned artifact was analyzed through the normative no-write oracle boundary.',
      ),
      ...cloneJsonSafe(transport.reasons),
    ],
    transport,
  };
}

export function evaluateW1ColdArchiveEligibility(roundManifest = {}) {
  const lifecycleState = normalizeLifecycleState(roundManifest.lifecycleState);
  if (lifecycleState === 'OPEN_FOR_RETURN') {
    return {
      ok: false,
      code: 'RTK_ROUND_NOT_OPEN_FOR_RETURN',
      lifecycleState,
    };
  }
  if (lifecycleState === 'RECOVERY_REQUIRED') {
    return {
      ok: false,
      code: 'RTK_RECOVERY_REQUIRED',
      lifecycleState,
    };
  }
  return {
    ok: REVISION_BRIDGE_W1_TERMINAL_LIFECYCLE_STATES.includes(lifecycleState),
    code: REVISION_BRIDGE_W1_TERMINAL_LIFECYCLE_STATES.includes(lifecycleState)
      ? 'RTK_NO_WRITE_ANALYSIS_READY'
      : 'RTK_ROUND_NOT_OPEN_FOR_RETURN',
    lifecycleState,
  };
}

export function probeW1DirectorySyncCapability(capabilities = {}) {
  const supported = capabilities.directoryFsync === true;
  return {
    schemaVersion: 'yalken.rtk.directory-sync-capability.v2',
    supported,
    durabilityClaim: supported ? 'DIRECTORY_SYNC_SUPPORTED' : 'DIAGNOSTIC_ONLY_UNSUPPORTED',
    code: supported
      ? 'RTK_NO_WRITE_ANALYSIS_READY'
      : 'RTK_DURABILITY_DIR_SYNC_UNAVAILABLE',
  };
}
