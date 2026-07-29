import crypto from 'node:crypto';

export const REVISION_BRIDGE_G0B_TRANSPORT_CONTRACT_SCHEMA =
  'revision-bridge.g0b-transport-contract.v1';
export const REVISION_BRIDGE_G0B_WORD_SETTINGS_CAPSULE_SCHEMA =
  'revision-bridge.g0b-word-settings-capsule.v1';
export const REVISION_BRIDGE_G0B_SUPPORTED_CORPUS_SCHEMA =
  'revision-bridge.g0b-supported-corpus.v1';

export const REVISION_BRIDGE_G0B_RETURN_MODES = Object.freeze(['TRACKED', 'CLEAN', 'MIXED']);
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
  const existing = list.find((candidate) => candidate.id === 'existing-tokenizer');
  const safeExisting = existing
    && existing.correctness === 'pass'
    && existing.boundedAuditability === true
    && existing.generalXmlPlatform !== true;
  if (safeExisting) {
    return {
      ok: true,
      selected: 'existing-tokenizer',
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
