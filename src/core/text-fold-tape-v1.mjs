// R2.4 T0_TEXT_COORDINATE_ALGEBRA — deterministic Unicode fold with a
// transform tape. Offsets computed in folded space map back to the original
// string only through the tape, never directly. The fold is pinned per code
// point (host-locale independent) with an explicit contextual rule for the
// Greek final sigma. Positions are UTF-16 code units, the declared system.

import {
  buildTextTransformTape,
  mapTextTransformPosition,
  TEXT_TRANSFORM_AFFINITY,
  TEXT_TRANSFORM_DIRECTION,
  TEXT_TRANSFORM_POSITION_STATUS,
} from './textTransformAlgebra.mjs';

export const TEXT_FOLD_TAPE_SCHEMA_VERSION = 'yalken.textFoldTape.v1';

const isLetter = (char) => /\p{L}/u.test(char);
const isGreekUpperSigma = (char) => char === 'Σ';

// Pinned contextual rule: uppercase sigma folds to the final sigma ς when
// the following code point is not a letter (word end), else to σ.
// Everything else folds by the Unicode default casing, which is stable and
// identical on every host (toLowerCase carries no locale parameter).
function foldCodePointDeterministic(char, nextChar) {
  if (isGreekUpperSigma(char)) {
    return nextChar !== undefined && isLetter(nextChar) ? 'σ' : 'ς';
  }
  return char.toLowerCase();
}

function foldRunDeterministic(run) {
  const codePoints = [...run];
  return codePoints
    .map((char, index) => foldCodePointDeterministic(char, codePoints[index + 1]))
    .join('');
}

// Builds the deterministic fold of `text` plus a replay-validated transform
// tape from original to folded. Maximal runs of changed code points coalesce
// into single operations, as the tape law requires non-touching operations.
// Position mapping is exact at operation boundaries and in unchanged
// regions; positions strictly inside a changed run refuse typed, never guess.
export function buildDeterministicFoldTape(text, { sourceRevisionId = 'fold-source', targetRevisionId = 'fold-target' } = {}) {
  if (typeof text !== 'string') {
    const error = new Error('E_TEXT_FOLD_INPUT_SHAPE');
    error.code = 'E_TEXT_FOLD_INPUT_SHAPE';
    throw error;
  }
  const operations = [];
  const foldedPieces = [];
  const codePoints = [...text];
  const utf16PrefixOffsets = new Uint32Array(codePoints.length + 1);
  for (let index = 0; index < codePoints.length; index += 1) {
    utf16PrefixOffsets[index + 1] = utf16PrefixOffsets[index] + codePoints[index].length;
  }
  let cursor = 0;
  let runStart = -1;

  const utf16OffsetOf = (codePointIndex) => utf16PrefixOffsets[codePointIndex];

  const closeRun = (endIndex) => {
    if (runStart === -1) return;
    const sourceRun = codePoints.slice(runStart, endIndex).join('');
    const foldedRun = foldRunDeterministic(sourceRun);
    foldedPieces.push(codePoints.slice(cursor, runStart).join(''), foldedRun);
    operations.push({
      sourceStart: utf16OffsetOf(runStart),
      sourceEnd: utf16OffsetOf(endIndex),
      insertedText: foldedRun,
    });
    cursor = endIndex;
    runStart = -1;
  };

  codePoints.forEach((char, index) => {
    const next = codePoints[index + 1];
    const folded = foldCodePointDeterministic(char, next);
    const changed = folded !== char;
    if (changed) {
      if (runStart === -1) runStart = index;
      return;
    }
    closeRun(index);
  });
  closeRun(codePoints.length);
  foldedPieces.push(codePoints.slice(cursor).join(''));
  const foldedText = foldedPieces.join('');

  const tape = buildTextTransformTape({
    sourceText: text,
    targetText: foldedText,
    sourceRevisionId,
    targetRevisionId,
    operations,
  });

  return Object.freeze({
    schemaVersion: TEXT_FOLD_TAPE_SCHEMA_VERSION,
    originalText: text,
    foldedText,
    tape,
  });
}

// Folded-space offset mapped back to the original through the tape only.
// Positions inside a length-changing span resolve by affinity, never by
// silent code-unit arithmetic.
export function mapFoldedOffsetToOriginal(foldTape, offset, affinity = TEXT_TRANSFORM_AFFINITY.BEFORE) {
  if (!foldTape || foldTape.schemaVersion !== TEXT_FOLD_TAPE_SCHEMA_VERSION) {
    const error = new Error('E_TEXT_FOLD_TAPE_REQUIRED');
    error.code = 'E_TEXT_FOLD_TAPE_REQUIRED';
    throw error;
  }
  const result = mapTextTransformPosition({
    transform: foldTape.tape,
    direction: TEXT_TRANSFORM_DIRECTION.INVERSE,
    inputRevisionId: foldTape.tape.targetRevisionId,
    position: offset,
    affinity,
  });
  return Object.freeze({
    status: result.status,
    position: result.status === TEXT_TRANSFORM_POSITION_STATUS.EXACT ? result.outputPosition : null,
    reason: result.status === TEXT_TRANSFORM_POSITION_STATUS.EXACT ? '' : result.reason,
  });
}

export function mapOriginalOffsetToFolded(foldTape, offset, affinity = TEXT_TRANSFORM_AFFINITY.BEFORE) {
  if (!foldTape || foldTape.schemaVersion !== TEXT_FOLD_TAPE_SCHEMA_VERSION) {
    const error = new Error('E_TEXT_FOLD_TAPE_REQUIRED');
    error.code = 'E_TEXT_FOLD_TAPE_REQUIRED';
    throw error;
  }
  const result = mapTextTransformPosition({
    transform: foldTape.tape,
    direction: TEXT_TRANSFORM_DIRECTION.FORWARD,
    inputRevisionId: foldTape.tape.sourceRevisionId,
    position: offset,
    affinity,
  });
  return Object.freeze({
    status: result.status,
    position: result.status === TEXT_TRANSFORM_POSITION_STATUS.EXACT ? result.outputPosition : null,
    reason: result.status === TEXT_TRANSFORM_POSITION_STATUS.EXACT ? '' : result.reason,
  });
}

// Case-insensitive containment on the deterministic fold, for search paths.
export function foldIncludes(haystack, needle) {
  return buildDeterministicFoldTape(haystack).foldedText.includes(buildDeterministicFoldTape(needle).foldedText);
}
