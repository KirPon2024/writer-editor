import { sha256Hex } from './browser-safe-hash.mjs';

export const ANCHOR_STATUS = Object.freeze({
  EXACT: 'exact',
  AMBIGUOUS: 'ambiguous',
  LOST: 'lost',
});

const ANCHOR_CONTEXT_RADIUS = 32;

function witnessHash(value) {
  return sha256Hex(`yalken.anchor-witness.v1:${value}`);
}

function resolveAnchorByWitness(witnessInput, sceneText) {
  if (!witnessInput || typeof witnessInput !== 'object' || Array.isArray(witnessInput)) {
    throw new Error('E_ANCHOR_WITNESS_SHAPE');
  }
  const quote = typeof witnessInput.quote === 'string' ? witnessInput.quote : '';
  if (!quote) throw new Error('E_ANCHOR_WITNESS_QUOTE_REQUIRED');
  if (typeof sceneText !== 'string') throw new Error('E_ANCHOR_SCENE_TEXT_SHAPE');

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

export { resolveAnchorByWitness };

export default Object.freeze({
  ANCHOR_STATUS,
  resolveAnchorByWitness,
});
