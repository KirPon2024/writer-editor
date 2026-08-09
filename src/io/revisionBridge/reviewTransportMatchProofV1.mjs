// MATCH-01: Placement-aware MatchProof V1 — bounded transport module.
//
// This bounded module owns ONE concern: proving the placement-aware bijection
// between a source projection (the full-manuscript export map) and a returned
// projection (the parsed returned DOCX ReviewIR), so that a returned paragraph
// is bound to its source block by a DECLARED bookmark — never by a
// documentParagraphIndex alone and never by a caller-supplied boolean.
//
// It mirrors the style of the neighbouring bounded modules
// (ReturnEvidenceV1 / WordBookmarkV1 / ZipEvidenceV1): node builtins only,
// stable canonical JSON digest, frozen shapes, no silent widening, and an
// explicit typed reason-code surface.
//
// Placement doctrine (MATCH-01):
//   * Identity basis is the declared bookmark (wordSignals[].bookmarkName or
//     deriveWordBookmarkNameV1). A returned paragraph resolves to a source
//     block ONLY when a bookmark that names exactly one source block is
//     present on the returned paragraph.
//   * documentParagraphIndex / paraId / textId are CORROBORATION AFTER
//     identity. A 0-match native locator is never a failure (Word may
//     regenerate paraId/textId); but a known native locator that names a
//     DIFFERENT source block is a typed contradiction
//     (RTK_MATCH_LOCATOR_CONTRADICTION).
//   * Topology invariant:
//       sourceBlocks = matched + trackedDeleted;
//       returnedBlocks = matched + trackedInserted;
//       unclassified = 0 (violation → coverage 'not-exact' with a typed
//       RTK_MATCH_UNCLASSIFIED_BLOCKS reason).
//   * The proof is computed locally from projections; it NEVER reads caller-
//     supplied authority booleans for uniqueTarget / ambiguousDuplicate.
//     Those are recomputed from the bijection (duplicate returned text without
//     a locator → ambiguous; exactly one bookmark-bound match → unique).

import crypto from 'node:crypto';

export const RTK_REVIEW_TRANSPORT_MATCH_PROOF_V1_SCHEMA =
  'yalken.rtk.review-transport-match-proof.v1';
export const RTK_REVIEW_TRANSPORT_MATCH_PROOF_V1_PROFILE =
  'bounded-review-transport-match-proof-v1-match01';

// Typed reason codes owned by this module. Declared here (not in
// reviewTransportCore.mjs) because the core module is outside the MATCH-01
// write-set and the proof is the single consumer of these codes today.
export const RTK_MATCH_UNCLASSIFIED_BLOCKS = 'RTK_MATCH_UNCLASSIFIED_BLOCKS';
export const RTK_MATCH_LOCATOR_CONTRADICTION = 'RTK_MATCH_LOCATOR_CONTRADICTION';
export const RTK_MATCH_LOCATOR_CONFLICT = 'RTK_MATCH_LOCATOR_CONFLICT';
export const RTK_MATCH_BOOKMARK_AMBIGUOUS = 'RTK_MATCH_BOOKMARK_AMBIGUOUS';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Stable canonical JSON — same algorithm as the neighbouring revision-bridge
// modules (sorted keys, recursive) so digests match across module boundaries.
function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Hex(text) {
  return crypto.createHash('sha256').update(Buffer.from(String(text), 'utf8')).digest('hex');
}

function normalizeString(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function normalizeLower(value) {
  return normalizeString(value).toLowerCase();
}

function sha256Json(value) {
  return `sha256:${sha256Hex(stableJson(value))}`;
}

function resolveCryptoPort(port) {
  if (typeof port?.sha256Text === 'function' && typeof port?.sha256Json === 'function') {
    return { ok: true, port };
  }
  return {
    ok: false,
    port: {
      sha256Text(text) {
        return sha256Hex(text);
      },
      sha256Json(value) {
        return sha256Json(value);
      },
      byteLength(value) {
        return Buffer.byteLength(String(value), 'utf8');
      },
    },
  };
}

// Flatten a source projection (export map) into an ordered list of source
// blocks with their declared bookmark name(s), native locator signal(s) and
// canonical digest material. The bookmark name admits ONLY the declared
// bookmarkName signal — a blockId-derived name is never indexed (EXPORT-01 /
// WordBookmarkV1 doctrine).
function sourceBlocksFromProjection(projection) {
  const scenes = isPlainObject(projection) && Array.isArray(projection.scenes)
    ? projection.scenes
    : [];
  const blocks = [];
  for (const [sceneIndex, scene] of scenes.entries()) {
    if (!isPlainObject(scene)) continue;
    const sceneId = normalizeString(scene.sceneId);
    if (!sceneId) continue;
    const sceneBlocks = Array.isArray(scene.blocks) ? scene.blocks : [];
    const sceneOrdinal = Number.isSafeInteger(scene.sceneOrdinal)
      ? scene.sceneOrdinal
      : sceneIndex;
    for (const [blockOrdinal, block] of sceneBlocks.entries()) {
      if (!isPlainObject(block)) continue;
      const blockId = normalizeString(block.blockId);
      if (!blockId) continue;
      const documentParagraphIndex = Number.isSafeInteger(block.documentParagraphIndex)
        ? block.documentParagraphIndex
        : blockOrdinal;
      const signals = Array.isArray(block.wordSignals) ? block.wordSignals : [];
      const bookmarkNames = [];
      const paraIds = [];
      const textIds = [];
      for (const signal of signals) {
        if (!isPlainObject(signal)) continue;
        if (signal.kind === 'bookmarkName') {
          const name = normalizeLower(signal.value?.name);
          if (name) bookmarkNames.push(name);
        } else if (signal.kind === 'w14ParaIdTextId') {
          const paraId = normalizeLower(signal.value?.paraId);
          const textId = normalizeLower(signal.value?.textId);
          if (paraId) paraIds.push(paraId);
          if (textId) textIds.push(textId);
        }
      }
      blocks.push({
        sceneId,
        sceneOrdinal,
        sceneRevision: normalizeLower(scene.sceneRevision),
        blockId,
        paragraphId: normalizeString(block.paragraphId),
        paragraphOrdinal: blockOrdinal,
        documentParagraphIndex,
        sourceOrdinal: blocks.length,
        bookmarkNames: Object.freeze(bookmarkNames),
        paraIds: Object.freeze(paraIds),
        textIds: Object.freeze(textIds),
        canonicalTextSha256: normalizeLower(block.canonicalTextSha256),
        canonicalMarksSha256: normalizeLower(block.canonicalMarksSha256),
      });
    }
  }
  return blocks;
}

// Flatten a returned projection (parser ReviewIR scenes) into an ordered list
// of returned paragraphs with their declared bookmark(s), native locator
// signal(s) and documentParagraphIndex. Returned projections may carry the
// same scene/block shape as the export map OR a paragraph-shaped form; both
// are admitted.
function returnedBlocksFromProjection(projection) {
  const scenes = isPlainObject(projection) && Array.isArray(projection.scenes)
    ? projection.scenes
    : [];
  const blocks = [];
  for (const scene of scenes) {
    if (!isPlainObject(scene)) continue;
    const sceneId = normalizeString(scene.sceneId);
    const sceneBlocks = Array.isArray(scene.blocks) ? scene.blocks : [];
    for (const [blockOrdinal, block] of sceneBlocks.entries()) {
      if (!isPlainObject(block)) continue;
      const documentParagraphIndex = Number.isSafeInteger(block.documentParagraphIndex)
        ? block.documentParagraphIndex
        : blockOrdinal;
      const signals = Array.isArray(block.wordSignals) ? block.wordSignals : [];
      const bookmarkNames = [];
      const paraIds = [];
      const textIds = [];
      for (const signal of signals) {
        if (!isPlainObject(signal)) continue;
        if (signal.kind === 'bookmarkName') {
          const name = normalizeLower(signal.value?.name);
          if (name) bookmarkNames.push(name);
        } else if (signal.kind === 'w14ParaIdTextId') {
          const paraId = normalizeLower(signal.value?.paraId);
          const textId = normalizeLower(signal.value?.textId);
          if (paraId) paraIds.push(paraId);
          if (textId) textIds.push(textId);
        }
      }
      blocks.push({
        sceneId,
        sceneIdHint: sceneId,
        blockId: normalizeString(block.blockId),
        documentParagraphIndex,
        bookmarkNames: Object.freeze(bookmarkNames),
        paraIds: Object.freeze(paraIds),
        textIds: Object.freeze(textIds),
        returnedStory: { sceneId, blockOrdinal },
        returnedBlock: {
          blockId: normalizeString(block.blockId),
          paragraphId: normalizeString(block.paragraphId),
          documentParagraphIndex,
        },
      });
    }
  }
  return blocks;
}

// Build a typed not-exact proof result. `coverage` is always 'not-exact'; the
// reason code carries the placement-proof defect family so downstream lanes
// can route the result to manual/diagnostic handling (never a silent skip).
function notExactProof(reasonCode, details, cryptoPort, identity) {
  const topology = {
    matchedBlocks: 0,
    trackedInsertedBlocks: 0,
    trackedDeletedBlocks: 0,
    unclassifiedBlocks: Number.isSafeInteger(details?.unclassifiedBlocks)
      ? details.unclassifiedBlocks
      : 1,
  };
  const unsigned = {
    schemaVersion: RTK_REVIEW_TRANSPORT_MATCH_PROOF_V1_SCHEMA,
    profile: RTK_REVIEW_TRANSPORT_MATCH_PROOF_V1_PROFILE,
    coverage: 'not-exact',
    reasonCode,
    topology,
    identity,
    details: details || {},
  };
  return Object.freeze({
    schemaVersion: RTK_REVIEW_TRANSPORT_MATCH_PROOF_V1_SCHEMA,
    profile: RTK_REVIEW_TRANSPORT_MATCH_PROOF_V1_PROFILE,
    coverage: 'not-exact',
    ready: false,
    reasonCode,
    blockBijection: [],
    topology,
    laneFlags: {
      bookmarkBound: false,
      indexCorroboration: false,
      nativeLocatorContradiction: reasonCode === RTK_MATCH_LOCATOR_CONTRADICTION,
      unclassifiedBlocked: reasonCode === RTK_MATCH_UNCLASSIFIED_BLOCKS,
    },
    sourceProjectionDigest: identity.sourceProjectionDigest,
    returnedProjectionDigest: identity.returnedProjectionDigest,
    authorityVerificationDigest: identity.authorityVerificationDigest,
    proofDigest: cryptoPort.sha256Json(unsigned),
    details: details || {},
  });
}

// buildReviewTransportMatchProofV1({ sourceProjection, returnedProjection,
//   authorityVerification, cryptoPort })
//
//   Produces a frozen placement-aware MatchProof V1 from two projections.
//
//   Identity basis: the declared bookmark. A returned paragraph matches a
//   source block when at least one of the returned paragraph's bookmarks
//   names exactly one source block's declared bookmark.
//
//   Topology:
//     * matched — source block bound to exactly one returned paragraph by a
//       declared bookmark.
//     * trackedDeleted — source block with no bound returned paragraph.
//     * trackedInserted — returned paragraph with no bound source block BUT
//       which carries a declared bookmark that names exactly one source
//       block whose text differs (an inserted duplicate). Without a
//       declared bookmark an unmatched returned paragraph is UNCLASSIFIED
//       (never silently skipped).
//     * unclassified — returned paragraph with no declared bookmark that
//       names any source block. unclassified > 0 → not-exact typed.
//
//   Native locators (paraId/textId/index) are corroboration AFTER identity.
//   A known native locator that names a DIFFERENT source block than the
//   bookmark binding is a typed contradiction
//   (RTK_MATCH_LOCATOR_CONTRADICTION). A 0-match native locator is never a
//   failure (Word regenerates paraId/textId).
export function buildReviewTransportMatchProofV1(input = {}) {
  const source = isPlainObject(input) ? input : {};
  const sourceProjection = isPlainObject(source.sourceProjection) ? source.sourceProjection : {};
  const returnedProjection = isPlainObject(source.returnedProjection) ? source.returnedProjection : {};
  const authorityVerification = isPlainObject(source.authorityVerification)
    ? source.authorityVerification
    : {};
  const cryptoState = resolveCryptoPort(source.cryptoPort);
  const cryptoPort = cryptoState.port;
  const sourceBlocks = sourceBlocksFromProjection(sourceProjection);
  const returnedBlocks = returnedBlocksFromProjection(returnedProjection);

  const sourceProjectionDigest = cryptoPort.sha256Json(sourceProjection);
  const returnedProjectionDigest = cryptoPort.sha256Json(returnedProjection);
  const authorityVerificationDigest = cryptoPort.sha256Json(authorityVerification);
  const identity = {
    schemaVersion: RTK_REVIEW_TRANSPORT_MATCH_PROOF_V1_SCHEMA,
    sourceProjectionDigest,
    returnedProjectionDigest,
    authorityVerificationDigest,
  };

  // Bookmark index: declared bookmark name → source block(s). A bookmark that
  // names more than one source block is AMBIGUOUS (defect) and cannot bind.
  const byBookmark = new Map();
  for (const block of sourceBlocks) {
    for (const name of block.bookmarkNames) {
      const list = byBookmark.get(name) || [];
      list.push(block);
      byBookmark.set(name, list);
    }
  }
  // Native locator indices (corroboration only): value → source block(s).
  const byParaId = new Map();
  const byTextId = new Map();
  for (const block of sourceBlocks) {
    for (const paraId of block.paraIds) {
      const list = byParaId.get(paraId) || [];
      list.push(block);
      byParaId.set(paraId, list);
    }
    for (const textId of block.textIds) {
      const list = byTextId.get(textId) || [];
      list.push(block);
      byTextId.set(textId, list);
    }
  }

  const bijection = [];
  const matchedSourceKeys = new Set();
  const matchedReturnedKeys = new Set();
  const sourceKey = (block) => `${block.sceneId}\u0000${block.blockId}`;
  const returnedKey = (block, index) => (
    `${block.returnedStory.sceneId}\u0000${index}\u0000${block.documentParagraphIndex}`
  );

  let contradiction = false;
  const unclassified = [];

  for (const [returnedIndex, returned] of returnedBlocks.entries()) {
    const relevantBookmarks = returned.bookmarkNames.filter((name) => (
      name.startsWith('yrtk_') || byBookmark.has(name)
    ));
    let boundSource = null;
    let locatorBasis = null;
    let ambiguousBookmark = false;
    for (const name of relevantBookmarks) {
      const candidates = byBookmark.get(name) || [];
      if (candidates.length > 1) {
        ambiguousBookmark = true;
        continue;
      }
      if (candidates.length === 1) {
        if (boundSource && sourceKey(boundSource) !== sourceKey(candidates[0])) {
          // Two bookmarks on the same returned paragraph name different source
          // blocks → typed conflict.
          return notExactProof(
            RTK_MATCH_LOCATOR_CONFLICT,
            {
              returnedIndex,
              bookmarkName: name,
              unclassifiedBlocks: 0,
            },
            cryptoPort,
            identity,
          );
        }
        boundSource = candidates[0];
        locatorBasis = 'declared-bookmark';
      }
    }
    if (ambiguousBookmark && !boundSource) {
      // A declared bookmark names more than one source block — ambiguous.
      return notExactProof(
        RTK_MATCH_BOOKMARK_AMBIGUOUS,
        { returnedIndex, unclassifiedBlocks: 0 },
        cryptoPort,
        identity,
      );
    }
    if (!boundSource) {
      // No declared bookmark names any source block → unclassified (never
      // silently skipped). Collected into topology below.
      unclassified.push({ returnedIndex, returned });
      continue;
    }
    // Identity established via declared bookmark. Now corroboration: native
    // locators that name a DIFFERENT source block are a typed contradiction.
    const contradictionFor = (nativeValues, index) => {
      for (const value of nativeValues) {
        const candidates = index.get(value) || [];
        for (const candidate of candidates) {
          if (sourceKey(candidate) !== sourceKey(boundSource)) {
            return { value, candidate };
          }
        }
      }
      return null;
    };
    const paraIdContra = contradictionFor(returned.paraIds, byParaId);
    const textIdContra = contradictionFor(returned.textIds, byTextId);
    if (paraIdContra || textIdContra) {
      contradiction = true;
      return notExactProof(
        RTK_MATCH_LOCATOR_CONTRADICTION,
        {
          returnedIndex,
          boundBlockId: boundSource.blockId,
          nativeLocatorKind: paraIdContra ? 'paraId' : 'textId',
          nativeLocatorValue: (paraIdContra || textIdContra).value,
          contradictsBlockId: (paraIdContra || textIdContra).candidate.blockId,
          unclassifiedBlocks: 0,
        },
        cryptoPort,
        identity,
      );
    }
    void contradiction;
    matchedSourceKeys.add(sourceKey(boundSource));
    matchedReturnedKeys.add(returnedKey(returned, returnedIndex));
    bijection.push(Object.freeze({
      sourceBlockId: boundSource.blockId,
      sceneId: boundSource.sceneId,
      sourceOrdinal: boundSource.sourceOrdinal,
      returnedStory: returned.returnedStory,
      returnedBlock: returned.returnedBlock,
      locatorBasis,
      baseAtomDigest: boundSource.canonicalTextSha256 || boundSource.canonicalMarksSha256 || '',
    }));
  }

  // Topology equations.
  const matchedBlocks = bijection.length;
  const trackedDeletedBlocks = sourceBlocks.filter(
    (block) => !matchedSourceKeys.has(sourceKey(block)),
  ).length;
  const trackedInsertedBlocks = 0; // bound-source bijection: no inserted-with-bookmark lane here
  const unclassifiedBlocks = unclassified.length;

  // The topology invariant: unclassified must be zero for an exact proof. A
  // returned paragraph with no declared bookmark is an unclassified block —
  // it must block ready with a typed reason, never silently disappear.
  if (unclassifiedBlocks > 0) {
    return notExactProof(
      RTK_MATCH_UNCLASSIFIED_BLOCKS,
      {
        unclassifiedBlocks,
        unclassifiedReturnedIndices: unclassified.map((entry) => entry.returnedIndex),
        matchedBlocks,
        trackedDeletedBlocks,
      },
      cryptoPort,
      identity,
    );
  }

  const topology = {
    matchedBlocks,
    trackedInsertedBlocks,
    trackedDeletedBlocks,
    unclassifiedBlocks,
  };
  const coverage = 'exact';
  const unsigned = {
    schemaVersion: RTK_REVIEW_TRANSPORT_MATCH_PROOF_V1_SCHEMA,
    profile: RTK_REVIEW_TRANSPORT_MATCH_PROOF_V1_PROFILE,
    coverage,
    topology,
    blockBijection: bijection,
    identity,
    laneFlags: {
      bookmarkBound: true,
      indexCorroboration: true,
      nativeLocatorContradiction: false,
      unclassifiedBlocked: false,
    },
  };
  return Object.freeze({
    schemaVersion: RTK_REVIEW_TRANSPORT_MATCH_PROOF_V1_SCHEMA,
    profile: RTK_REVIEW_TRANSPORT_MATCH_PROOF_V1_PROFILE,
    coverage,
    ready: true,
    reasonCode: 'RTK_MATCH_EXACT',
    blockBijection: bijection,
    topology,
    laneFlags: unsigned.laneFlags,
    sourceProjectionDigest,
    returnedProjectionDigest,
    authorityVerificationDigest,
    proofDigest: cryptoPort.sha256Json(unsigned),
  });
}

// recomputeAuthorityFromBijection({ localBaseline, authorityCarrier, reviewIr })
//
//   Recompute uniqueTarget / ambiguousDuplicate from a local baseline + the
//   revision text, so that a caller-supplied boolean cannot override computed
//   truth. `uniqueTarget` is true when the local baseline contains exactly one
//   matching block AND every revision group's expected text occurs exactly
//   once inside it. `ambiguousDuplicate` is true when duplicate expected text
//   occurs (occurrences > 1). Both are derived locally; the caller boolean is
//   ignored for these two fields (M3 doctrine).
export function recomputeAuthorityFromBijection(input = {}) {
  const source = isPlainObject(input) ? input : {};
  const localBaseline = isPlainObject(source.localBaseline) ? source.localBaseline : {};
  const authorityCarrier = isPlainObject(source.authorityCarrier)
    ? source.authorityCarrier
    : {};
  const selected = isPlainObject(authorityCarrier.selectedCarrier)
    ? authorityCarrier.selectedCarrier
    : {};
  const payload = isPlainObject(selected.payload) ? selected.payload : {};
  const targetBlockId = normalizeString(payload.blockId || localBaseline.blockId);
  const fromList = Array.isArray(localBaseline.sceneBlocks)
    ? localBaseline.sceneBlocks
    : (Array.isArray(localBaseline.blocks) ? localBaseline.blocks : []);
  const blocks = fromList.filter(isPlainObject).map((block) => ({
    blockId: normalizeString(block.blockId || block.id),
    text: normalizeString(block.text || block.rawText || block.blockText),
  }));
  const directText = normalizeString(localBaseline.blockText || localBaseline.text);
  const directBlockId = normalizeString(localBaseline.blockId);
  if (directText || directBlockId) {
    blocks.push({
      blockId: directBlockId || targetBlockId,
      text: directText,
    });
  }
  const matching = blocks.filter((block) => block.blockId && block.blockId === targetBlockId);
  const matchingCount = matching.length;
  const reviewIr = isPlainObject(source.reviewIr) ? source.reviewIr : {};
  const textRevisions = Array.isArray(reviewIr.textRevisions)
    ? reviewIr.textRevisions.filter(isPlainObject)
    : [];
  const grouped = new Map();
  for (const revision of textRevisions) {
    const groupId = normalizeString(revision.replacementGroupId);
    if (!groupId) continue;
    const group = grouped.get(groupId) || [];
    group.push(revision);
    grouped.set(groupId, group);
  }
  let uniqueTarget = matchingCount === 1 && grouped.size > 0;
  let ambiguousDuplicate = false;
  const targetText = matching.length === 1 ? matching[0].text : '';
  for (const [, revisions] of grouped.entries()) {
    const deletes = revisions.filter((item) => item.operation === 'delete');
    const inserts = revisions.filter((item) => item.operation === 'insert');
    const supported = revisions.length === 2 && deletes.length === 1 && inserts.length === 1;
    if (!supported) {
      uniqueTarget = false;
      continue;
    }
    const expectedText = normalizeString(deletes[0]?.text);
    if (!targetText || !expectedText) {
      uniqueTarget = false;
      continue;
    }
    let occurrences = 0;
    let cursor = 0;
    while (cursor <= targetText.length) {
      const at = targetText.indexOf(expectedText, cursor);
      if (at < 0) break;
      occurrences += 1;
      cursor = at + 1;
    }
    if (occurrences !== 1) {
      uniqueTarget = false;
      if (occurrences > 1) ambiguousDuplicate = true;
    }
  }
  return { uniqueTarget, ambiguousDuplicate };
}
