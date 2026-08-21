'use strict';

// R2.4 T1 — anchor lineage law.
//
// A text anchor has a DURABLE IDENTITY (anchorId, scene, birth revision)
// and a FALLIBLE WITNESS (offsets, quote, context). The identity is never
// recomputed from the witness; the witness is evidence that can drift and
// must be re-proven. Carrying an anchor across edits is a typed protocol:
// lineage carry yields EXACT (shifted) or LOST; witness resolution yields
// exactly-one EXACT, many AMBIGUOUS with typed candidates, or none LOST.
// A silent first match is forbidden. Revision relatedness is decided by the
// R0 revision algebra; unrelated revisions are a typed refusal.

const { createHash } = require('node:crypto');

const {
  normalizeRevisionCoordinate,
  compareRevisionCoordinates,
  isLineageDescendant,
  RevisionAlgebraError,
} = require('./revision-algebra-v1.cjs');

const ANCHOR_LINEAGE_SCHEMA_VERSION = 'yalken.anchorLineage.v1';

const ANCHOR_STATUS = Object.freeze({
  EXACT: 'exact',
  AMBIGUOUS: 'ambiguous',
  LOST: 'lost',
});

const ANCHOR_CONTEXT_RADIUS = 32;

class AnchorLineageError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
  }
}

const trimString = (value) => (typeof value === 'string' ? value.trim() : '');

const witnessHash = (value) => createHash('sha256').update(`yalken.anchor-witness.v1:${value}`, 'utf8').digest('hex');

// The durable identity: an anchor id, its scene and its birth revision.
// Offsets and quotes are never part of identity.
function createAnchorIdentity(input = {}) {
  const anchorId = trimString(input.anchorId);
  const projectId = trimString(input.projectId);
  const sceneId = trimString(input.sceneId);
  if (!anchorId) throw new AnchorLineageError('E_ANCHOR_ID_REQUIRED');
  if (!projectId || !sceneId) throw new AnchorLineageError('E_ANCHOR_DOMAIN_REQUIRED');
  let birthRevision;
  try {
    birthRevision = normalizeRevisionCoordinate(input.birthRevision);
  } catch (error) {
    throw new AnchorLineageError('E_ANCHOR_BIRTH_REVISION_INVALID', error && error.code);
  }
  if (birthRevision.domain.projectId !== projectId || birthRevision.domain.entityId !== sceneId) {
    throw new AnchorLineageError('E_ANCHOR_DOMAIN_MISMATCH', `${birthRevision.domain.projectId}/${birthRevision.domain.entityId} vs ${projectId}/${sceneId}`);
  }
  return Object.freeze({
    schemaVersion: ANCHOR_LINEAGE_SCHEMA_VERSION,
    anchorId,
    projectId,
    sceneId,
    birthRevision,
  });
}

// The fallible witness: what the span said at birth, with context.
function createAnchorWitness(sceneText, spanInput = {}) {
  if (typeof sceneText !== 'string') throw new AnchorLineageError('E_ANCHOR_SCENE_TEXT_SHAPE');
  const startOffset = Number(spanInput.startOffset);
  const endOffset = Number(spanInput.endOffset);
  if (!Number.isInteger(startOffset) || !Number.isInteger(endOffset) || startOffset < 0 || endOffset < startOffset || endOffset > sceneText.length) {
    throw new AnchorLineageError('E_ANCHOR_WITNESS_SPAN', `${String(spanInput.startOffset)}..${String(spanInput.endOffset)}`);
  }
  const quote = sceneText.slice(startOffset, endOffset);
  const prefixContext = sceneText.slice(Math.max(0, startOffset - ANCHOR_CONTEXT_RADIUS), startOffset);
  const suffixContext = sceneText.slice(endOffset, Math.min(sceneText.length, endOffset + ANCHOR_CONTEXT_RADIUS));
  return Object.freeze({
    startOffset,
    endOffset,
    quote,
    quoteHash: witnessHash(quote),
    sceneTextHash: witnessHash(sceneText),
    prefixContextHash: witnessHash(prefixContext),
    suffixContextHash: witnessHash(suffixContext),
  });
}

// Lineage guard: the anchor may be carried only between related revisions
// of its own domain; anything else is a typed refusal, never a guess.
function assertAnchorLineageRelated(identity, targetRevisionInput) {
  let targetRevision;
  try {
    targetRevision = normalizeRevisionCoordinate(targetRevisionInput);
  } catch (error) {
    throw new AnchorLineageError('E_ANCHOR_TARGET_REVISION_INVALID', error && error.code);
  }
  try {
    if (!isLineageDescendant(targetRevision, identity.birthRevision)) {
      throw new AnchorLineageError(
        'E_ANCHOR_LINEAGE_UNRELATED',
        `target precedes birth: ${compareRevisionCoordinates(targetRevision, identity.birthRevision)}`,
      );
    }
  } catch (error) {
    if (error instanceof AnchorLineageError) throw error;
    if (error instanceof RevisionAlgebraError) {
      throw new AnchorLineageError('E_ANCHOR_LINEAGE_UNRELATED', error.code);
    }
    throw error;
  }
  return targetRevision;
}

// Lineage carry over an ordered edit list. An edit is
// { startOffset, endOffset, insertedLength }: the range
// [startOffset, endOffset) is replaced by insertedLength code units.
// Edits ending at or before the span start shift the span (an insertion at
// the start boundary belongs before the anchor); edits starting at or
// after the span end leave it untouched; anything else overlaps the
// interior and the span is LOST with a typed reason — lineage carries a
// position only while the bracketed text provably survives.
function carryAnchorSpan(spanInput, editsInput) {
  const startOffset = Number(spanInput && spanInput.startOffset);
  const endOffset = Number(spanInput && spanInput.endOffset);
  if (!Number.isInteger(startOffset) || !Number.isInteger(endOffset) || startOffset < 0 || endOffset < startOffset) {
    throw new AnchorLineageError('E_ANCHOR_SPAN_SHAPE');
  }
  const edits = Array.isArray(editsInput) ? editsInput : [];
  let start = startOffset;
  let end = endOffset;
  for (const edit of edits) {
    const editStart = Number(edit && edit.startOffset);
    const editEnd = Number(edit && edit.endOffset);
    const insertedLength = Number(edit && edit.insertedLength);
    if (!Number.isInteger(editStart) || !Number.isInteger(editEnd) || editStart < 0 || editEnd < editStart || !Number.isInteger(insertedLength) || insertedLength < 0) {
      throw new AnchorLineageError('E_ANCHOR_EDIT_SHAPE');
    }
    if (editEnd <= start) {
      const delta = insertedLength - (editEnd - editStart);
      start += delta;
      end += delta;
      continue;
    }
    if (editStart >= end) {
      continue;
    }
    return Object.freeze({
      status: ANCHOR_STATUS.LOST,
      reason: 'SPAN_OVERWRITTEN',
      edit: Object.freeze({ startOffset: editStart, endOffset: editEnd, insertedLength }),
    });
  }
  return Object.freeze({
    status: ANCHOR_STATUS.EXACT,
    span: Object.freeze({ startOffset: start, endOffset: end }),
  });
}

// Witness ambiguity protocol over the current scene text. Zero occurrences
// is LOST, exactly one is EXACT, many require context disambiguation and
// otherwise stay AMBIGUOUS with typed candidates. Never a silent first
// match.
function resolveAnchorByWitness(witnessInput, sceneText) {
  if (!witnessInput || typeof witnessInput !== 'object' || Array.isArray(witnessInput)) {
    throw new AnchorLineageError('E_ANCHOR_WITNESS_SHAPE');
  }
  const quote = typeof witnessInput.quote === 'string' ? witnessInput.quote : '';
  if (!quote) throw new AnchorLineageError('E_ANCHOR_WITNESS_QUOTE_REQUIRED');
  if (typeof sceneText !== 'string') throw new AnchorLineageError('E_ANCHOR_SCENE_TEXT_SHAPE');

  const hasContext = (
    typeof witnessInput.prefixContextHash === 'string' && witnessInput.prefixContextHash.length > 0
    && typeof witnessInput.suffixContextHash === 'string' && witnessInput.suffixContextHash.length > 0
  );
  const candidates = [];
  let searchFrom = 0;
  while (searchFrom <= sceneText.length - quote.length) {
    const found = sceneText.indexOf(quote, searchFrom);
    if (found === -1) break;
    const prefixContext = sceneText.slice(Math.max(0, found - ANCHOR_CONTEXT_RADIUS), found);
    const suffixContext = sceneText.slice(found + quote.length, Math.min(sceneText.length, found + quote.length + ANCHOR_CONTEXT_RADIUS));
    candidates.push(Object.freeze({
      startOffset: found,
      endOffset: found + quote.length,
      contextMatches: (
        hasContext
        && witnessHash(prefixContext) === witnessInput.prefixContextHash
        && witnessHash(suffixContext) === witnessInput.suffixContextHash
      ),
    }));
    searchFrom = found + 1;
  }

  if (candidates.length === 0) {
    return Object.freeze({ status: ANCHOR_STATUS.LOST, reason: 'QUOTE_NOT_FOUND', candidates: Object.freeze([]) });
  }
  if (candidates.length === 1) {
    return Object.freeze({ status: ANCHOR_STATUS.EXACT, basis: 'quote', span: candidates[0], candidateCount: 1 });
  }
  const contextMatches = candidates.filter((candidate) => candidate.contextMatches);
  if (contextMatches.length === 1) {
    return Object.freeze({ status: ANCHOR_STATUS.EXACT, basis: 'context', span: contextMatches[0], candidateCount: candidates.length });
  }
  return Object.freeze({ status: ANCHOR_STATUS.AMBIGUOUS, reason: 'MULTIPLE_CANDIDATES', candidates: Object.freeze(candidates) });
}

// Full carry: lineage guard, then span carry, then (when the carried span's
// witness no longer verifies) witness resolution for a typed diagnosis.
function carryAnchor(identity, witness, edits, targetRevision, sceneText) {
  assertAnchorLineageRelated(identity, targetRevision);
  const carried = carryAnchorSpan(witness, edits);
  if (carried.status !== ANCHOR_STATUS.EXACT) {
    return Object.freeze({ status: ANCHOR_STATUS.LOST, reason: carried.reason, identity });
  }
  const carriedQuote = sceneText.slice(carried.span.startOffset, carried.span.endOffset);
  if (carriedQuote === witness.quote) {
    return Object.freeze({ status: ANCHOR_STATUS.EXACT, basis: 'lineage', span: carried.span, identity });
  }
  const resolved = resolveAnchorByWitness(witness, sceneText);
  return Object.freeze({ ...resolved, identity });
}

module.exports = Object.freeze({
  ANCHOR_LINEAGE_SCHEMA_VERSION,
  ANCHOR_STATUS,
  ANCHOR_CONTEXT_RADIUS,
  AnchorLineageError,
  createAnchorIdentity,
  createAnchorWitness,
  assertAnchorLineageRelated,
  carryAnchorSpan,
  resolveAnchorByWitness,
  carryAnchor,
});
