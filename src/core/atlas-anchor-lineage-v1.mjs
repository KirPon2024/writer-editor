import { hashCanonicalValue } from './browser-safe-hash.mjs';

export const ATLAS_ANCHOR_IDENTITY_SCHEMA_VERSION = 'atlas.anchorIdentity.v1';
export const ATLAS_ANCHOR_WITNESS_SCHEMA_VERSION = 'atlas.anchorWitness.v1';
export const ATLAS_ANCHOR_LINEAGE_SCHEMA_VERSION = 'atlas.anchorLineageLedger.v1';

export const ATLAS_ANCHOR_STATUS = Object.freeze({
  EXACT: 'exact',
  AMBIGUOUS: 'ambiguous',
  LOST: 'lost',
});

export const ATLAS_ANCHOR_CONTEXT_RADIUS = 32;

const REVISION_COUNTERS = Object.freeze([
  'projectRevision',
  'entityRevision',
  'sourceRevision',
  'generation',
  'writerEpoch',
]);

export class AtlasAnchorLineageError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'AtlasAnchorLineageError';
    this.code = code;
  }
}

function fail(code, detail) {
  throw new AtlasAnchorLineageError(code, detail);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function freezeJson(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeJson(child);
  return Object.freeze(value);
}

function frozenClone(value) {
  return freezeJson(cloneJson(value));
}

function assertHexDigest(value, code) {
  const normalized = trimString(value);
  if (value !== normalized || !/^[0-9a-f]{64}$/u.test(normalized)) fail(code);
  return normalized;
}

function normalizeRevisionCoordinate(input, code = 'E_ATLAS_ANCHOR_REVISION_INVALID') {
  if (!isPlainObject(input) || !isPlainObject(input.domain)) fail(code);
  const projectId = trimString(input.domain.projectId);
  const entityId = trimString(input.domain.entityId);
  if (!projectId || !entityId) fail(code, 'REVISION_DOMAIN_REQUIRED');
  const counters = {};
  for (const field of REVISION_COUNTERS) {
    const value = input[field];
    if (!Number.isSafeInteger(value) || value < 0) fail(code, field);
    counters[field] = value;
  }
  return {
    domain: { projectId, entityId },
    ...counters,
  };
}

function assertRevisionDomain(revision, identity, code) {
  if (revision.domain.projectId !== identity.projectId || revision.domain.entityId !== identity.sceneId) {
    fail(code, 'PROJECT_OR_SCENE_MISMATCH');
  }
}

function assertRevisionDescendant(candidate, ancestor, code) {
  if (candidate.domain.projectId !== ancestor.domain.projectId || candidate.domain.entityId !== ancestor.domain.entityId) {
    fail(code, 'REVISION_DOMAIN_MISMATCH');
  }
  if (REVISION_COUNTERS.some((field) => candidate[field] < ancestor[field])) {
    fail(code, 'REVISION_PRECEDES_ANCESTOR');
  }
}

function normalizeSpan(input, code = 'E_ATLAS_ANCHOR_SPAN_INVALID') {
  const startOffset = Number(input?.startOffset);
  const endOffset = Number(input?.endOffset);
  if (!Number.isSafeInteger(startOffset) || !Number.isSafeInteger(endOffset) || startOffset < 0 || endOffset <= startOffset) {
    fail(code);
  }
  return { startOffset, endOffset };
}

function contextFor(sceneText, span) {
  return {
    prefix: sceneText.slice(Math.max(0, span.startOffset - ATLAS_ANCHOR_CONTEXT_RADIUS), span.startOffset),
    suffix: sceneText.slice(span.endOffset, Math.min(sceneText.length, span.endOffset + ATLAS_ANCHOR_CONTEXT_RADIUS)),
  };
}

export function createDurableAnchorIdentity(input = {}) {
  if (!isPlainObject(input)) fail('E_ATLAS_ANCHOR_IDENTITY_INVALID');
  if (input.schemaVersion !== undefined && input.schemaVersion !== ATLAS_ANCHOR_IDENTITY_SCHEMA_VERSION) {
    fail('E_ATLAS_ANCHOR_IDENTITY_SCHEMA_INVALID');
  }
  const anchorId = trimString(input.anchorId);
  const projectId = trimString(input.projectId);
  const sceneId = trimString(input.sceneId);
  if (!anchorId) fail('E_ATLAS_ANCHOR_ID_REQUIRED');
  if (!projectId || !sceneId) fail('E_ATLAS_ANCHOR_DOMAIN_REQUIRED');
  const birthRevision = normalizeRevisionCoordinate(input.birthRevision, 'E_ATLAS_ANCHOR_BIRTH_REVISION_INVALID');
  assertRevisionDomain(birthRevision, { projectId, sceneId }, 'E_ATLAS_ANCHOR_BIRTH_DOMAIN_MISMATCH');
  return frozenClone({
    schemaVersion: ATLAS_ANCHOR_IDENTITY_SCHEMA_VERSION,
    anchorId,
    projectId,
    sceneId,
    birthRevision,
  });
}

export function createRelocationWitness(identityInput, sceneText, spanInput, sourceRevisionInput) {
  const identity = createDurableAnchorIdentity(identityInput);
  if (typeof sceneText !== 'string') fail('E_ATLAS_ANCHOR_SCENE_TEXT_INVALID');
  const span = normalizeSpan(spanInput);
  if (span.endOffset > sceneText.length) fail('E_ATLAS_ANCHOR_SPAN_INVALID', 'SPAN_EXCEEDS_SCENE');
  const sourceRevision = normalizeRevisionCoordinate(sourceRevisionInput, 'E_ATLAS_ANCHOR_SOURCE_REVISION_INVALID');
  assertRevisionDomain(sourceRevision, identity, 'E_ATLAS_ANCHOR_SOURCE_DOMAIN_MISMATCH');
  assertRevisionDescendant(sourceRevision, identity.birthRevision, 'E_ATLAS_ANCHOR_SOURCE_REVISION_UNRELATED');
  const quote = sceneText.slice(span.startOffset, span.endOffset);
  const context = contextFor(sceneText, span);
  return frozenClone({
    schemaVersion: ATLAS_ANCHOR_WITNESS_SCHEMA_VERSION,
    anchorId: identity.anchorId,
    projectId: identity.projectId,
    sceneId: identity.sceneId,
    sourceRevision,
    ...span,
    quote,
    quoteHash: hashCanonicalValue(quote),
    sceneTextHash: hashCanonicalValue(sceneText),
    prefixContextHash: hashCanonicalValue(context.prefix),
    suffixContextHash: hashCanonicalValue(context.suffix),
  });
}

export function validateRelocationWitness(witnessInput, identityInput = null) {
  if (!isPlainObject(witnessInput)) fail('E_ATLAS_ANCHOR_WITNESS_INVALID');
  const witness = cloneJson(witnessInput);
  if (witness.schemaVersion !== ATLAS_ANCHOR_WITNESS_SCHEMA_VERSION) fail('E_ATLAS_ANCHOR_WITNESS_SCHEMA_INVALID');
  const anchorId = trimString(witness.anchorId);
  const projectId = trimString(witness.projectId);
  const sceneId = trimString(witness.sceneId);
  const quote = typeof witness.quote === 'string' ? witness.quote : '';
  if (!anchorId || !projectId || !sceneId || !quote) fail('E_ATLAS_ANCHOR_WITNESS_INVALID', 'IDENTITY_OR_QUOTE_REQUIRED');
  const span = normalizeSpan(witness, 'E_ATLAS_ANCHOR_WITNESS_SPAN_INVALID');
  if (span.endOffset - span.startOffset !== quote.length) fail('E_ATLAS_ANCHOR_WITNESS_SPAN_INVALID', 'QUOTE_LENGTH_MISMATCH');
  const quoteHash = assertHexDigest(witness.quoteHash, 'E_ATLAS_ANCHOR_WITNESS_QUOTE_HASH_INVALID');
  if (quoteHash !== hashCanonicalValue(quote)) {
    fail('E_ATLAS_ANCHOR_WITNESS_QUOTE_HASH_MISMATCH');
  }
  const sceneTextHash = assertHexDigest(witness.sceneTextHash, 'E_ATLAS_ANCHOR_WITNESS_SCENE_HASH_INVALID');
  const prefixContextHash = assertHexDigest(witness.prefixContextHash, 'E_ATLAS_ANCHOR_WITNESS_PREFIX_HASH_INVALID');
  const suffixContextHash = assertHexDigest(witness.suffixContextHash, 'E_ATLAS_ANCHOR_WITNESS_SUFFIX_HASH_INVALID');
  const sourceRevision = normalizeRevisionCoordinate(witness.sourceRevision, 'E_ATLAS_ANCHOR_SOURCE_REVISION_INVALID');
  if (identityInput) {
    const identity = createDurableAnchorIdentity(identityInput);
    if (anchorId !== identity.anchorId || projectId !== identity.projectId || sceneId !== identity.sceneId) {
      fail('E_ATLAS_ANCHOR_WITNESS_IDENTITY_MISMATCH');
    }
    assertRevisionDomain(sourceRevision, identity, 'E_ATLAS_ANCHOR_SOURCE_DOMAIN_MISMATCH');
    assertRevisionDescendant(sourceRevision, identity.birthRevision, 'E_ATLAS_ANCHOR_SOURCE_REVISION_UNRELATED');
  }
  return frozenClone({
    schemaVersion: ATLAS_ANCHOR_WITNESS_SCHEMA_VERSION,
    anchorId,
    projectId,
    sceneId,
    sourceRevision,
    ...span,
    quote,
    quoteHash,
    sceneTextHash,
    prefixContextHash,
    suffixContextHash,
  });
}

function normalizeDiagnosticWitness(witnessInput) {
  if (!isPlainObject(witnessInput)) fail('E_ATLAS_ANCHOR_WITNESS_INVALID');
  const quote = typeof witnessInput.quote === 'string' ? witnessInput.quote : '';
  if (!quote) fail('E_ATLAS_ANCHOR_WITNESS_QUOTE_REQUIRED');
  const span = normalizeSpan(witnessInput, 'E_ATLAS_ANCHOR_WITNESS_SPAN_INVALID');
  if (span.endOffset - span.startOffset !== quote.length) fail('E_ATLAS_ANCHOR_WITNESS_SPAN_INVALID', 'QUOTE_LENGTH_MISMATCH');
  const quoteHash = trimString(witnessInput.quoteHash);
  if (quoteHash && quoteHash !== hashCanonicalValue(quote)) fail('E_ATLAS_ANCHOR_WITNESS_QUOTE_HASH_MISMATCH');
  const sceneTextHash = trimString(witnessInput.sceneTextHash);
  if (sceneTextHash) assertHexDigest(sceneTextHash, 'E_ATLAS_ANCHOR_WITNESS_SCENE_HASH_INVALID');
  const prefixContextHash = trimString(witnessInput.prefixContextHash);
  const suffixContextHash = trimString(witnessInput.suffixContextHash);
  if (prefixContextHash) assertHexDigest(prefixContextHash, 'E_ATLAS_ANCHOR_WITNESS_PREFIX_HASH_INVALID');
  if (suffixContextHash) assertHexDigest(suffixContextHash, 'E_ATLAS_ANCHOR_WITNESS_SUFFIX_HASH_INVALID');
  return { ...span, quote, quoteHash, sceneTextHash, prefixContextHash, suffixContextHash };
}

function candidateFor({ anchorId, sceneId, quoteHash, targetRevision, startOffset, endOffset, contextMatches }) {
  const candidateId = `atlas-anchor-candidate:${hashCanonicalValue({
    anchorId,
    sceneId,
    quoteHash,
    targetRevision: targetRevision || null,
    startOffset,
    endOffset,
  })}`;
  return frozenClone({ candidateId, startOffset, endOffset, contextMatches });
}

export function diagnoseRelocationWitness(input = {}) {
  if (!isPlainObject(input)) fail('E_ATLAS_ANCHOR_RELOCATION_INPUT_INVALID');
  const anchorId = trimString(input.anchorId || input.witness?.anchorId);
  const sceneId = trimString(input.sceneId || input.witness?.sceneId);
  if (!anchorId || !sceneId) fail('E_ATLAS_ANCHOR_RELOCATION_DOMAIN_REQUIRED');
  if (typeof input.currentSceneText !== 'string') fail('E_ATLAS_ANCHOR_SCENE_TEXT_INVALID');
  const witness = normalizeDiagnosticWitness(input.witness);
  const targetRevision = input.targetRevision ? normalizeRevisionCoordinate(input.targetRevision) : null;
  const quoteHash = witness.quoteHash || hashCanonicalValue(witness.quote);
  const hasContext = Boolean(witness.prefixContextHash && witness.suffixContextHash);
  const candidates = [];
  let searchFrom = 0;
  while (searchFrom <= input.currentSceneText.length - witness.quote.length) {
    const startOffset = input.currentSceneText.indexOf(witness.quote, searchFrom);
    if (startOffset === -1) break;
    const endOffset = startOffset + witness.quote.length;
    const context = contextFor(input.currentSceneText, { startOffset, endOffset });
    candidates.push(candidateFor({
      anchorId,
      sceneId,
      quoteHash,
      targetRevision,
      startOffset,
      endOffset,
      contextMatches: hasContext
        && hashCanonicalValue(context.prefix) === witness.prefixContextHash
        && hashCanonicalValue(context.suffix) === witness.suffixContextHash,
    }));
    searchFrom = startOffset + 1;
  }

  if (candidates.length === 0) {
    return frozenClone({
      status: ATLAS_ANCHOR_STATUS.LOST,
      reason: 'QUOTE_NOT_FOUND',
      anchorId,
      sceneId,
      candidates: [],
      candidateCount: 0,
      automaticReattachment: false,
      requiresExplicitSelection: false,
    });
  }

  const selectedCandidateId = trimString(input.selectedCandidateId);
  if (selectedCandidateId) {
    const selected = candidates.find((candidate) => candidate.candidateId === selectedCandidateId);
    if (!selected) fail('E_ATLAS_ANCHOR_SELECTION_NOT_A_CANDIDATE');
    return frozenClone({
      status: ATLAS_ANCHOR_STATUS.EXACT,
      basis: 'explicit-selection',
      anchorId,
      sceneId,
      candidateCount: candidates.length,
      selectedCandidateId,
      span: selected,
      candidates,
      automaticReattachment: false,
      requiresExplicitSelection: false,
      requiresExplicitReattachment: true,
    });
  }

  if (candidates.length === 1) {
    return frozenClone({
      status: ATLAS_ANCHOR_STATUS.EXACT,
      basis: 'unique-quote',
      anchorId,
      sceneId,
      candidateCount: 1,
      span: candidates[0],
      candidates,
      automaticReattachment: false,
      requiresExplicitSelection: false,
      requiresExplicitReattachment: true,
    });
  }

  const contextMatches = candidates.filter((candidate) => candidate.contextMatches);
  if (contextMatches.length === 1) {
    return frozenClone({
      status: ATLAS_ANCHOR_STATUS.EXACT,
      basis: 'unique-context',
      anchorId,
      sceneId,
      candidateCount: candidates.length,
      span: contextMatches[0],
      candidates,
      automaticReattachment: false,
      requiresExplicitSelection: false,
      requiresExplicitReattachment: true,
    });
  }

  return frozenClone({
    status: ATLAS_ANCHOR_STATUS.AMBIGUOUS,
    reason: 'MULTIPLE_CANDIDATES_REQUIRE_EXPLICIT_SELECTION',
    anchorId,
    sceneId,
    candidateCount: candidates.length,
    candidates,
    automaticReattachment: false,
    requiresExplicitSelection: true,
  });
}

export function relocateAnchor(input = {}) {
  const identity = createDurableAnchorIdentity(input.identity);
  const witness = validateRelocationWitness(input.witness, identity);
  const targetRevision = normalizeRevisionCoordinate(input.targetRevision, 'E_ATLAS_ANCHOR_TARGET_REVISION_INVALID');
  assertRevisionDomain(targetRevision, identity, 'E_ATLAS_ANCHOR_TARGET_DOMAIN_MISMATCH');
  assertRevisionDescendant(targetRevision, witness.sourceRevision, 'E_ATLAS_ANCHOR_TARGET_REVISION_UNRELATED');
  const diagnosis = diagnoseRelocationWitness({
    anchorId: identity.anchorId,
    sceneId: identity.sceneId,
    witness,
    currentSceneText: input.currentSceneText,
    targetRevision,
    selectedCandidateId: input.selectedCandidateId,
  });
  return frozenClone({ ...diagnosis, identity, targetRevision });
}

export function createAnchorLineage(identityInput) {
  const identity = createDurableAnchorIdentity(identityInput);
  return frozenClone({
    schemaVersion: ATLAS_ANCHOR_LINEAGE_SCHEMA_VERSION,
    identity,
    entries: [],
    headEntryHash: '',
  });
}

function entryPayload(input, identity, ordinal, previousEntryHash) {
  if (!isPlainObject(input)) fail('E_ATLAS_ANCHOR_LINEAGE_ENTRY_INVALID');
  const fromRevision = normalizeRevisionCoordinate(input.fromRevision, 'E_ATLAS_ANCHOR_LINEAGE_FROM_REVISION_INVALID');
  const toRevision = normalizeRevisionCoordinate(input.toRevision, 'E_ATLAS_ANCHOR_LINEAGE_TO_REVISION_INVALID');
  assertRevisionDomain(fromRevision, identity, 'E_ATLAS_ANCHOR_LINEAGE_DOMAIN_MISMATCH');
  assertRevisionDomain(toRevision, identity, 'E_ATLAS_ANCHOR_LINEAGE_DOMAIN_MISMATCH');
  assertRevisionDescendant(toRevision, fromRevision, 'E_ATLAS_ANCHOR_LINEAGE_REVISION_REWIND');
  const status = trimString(input.status);
  if (!Object.values(ATLAS_ANCHOR_STATUS).includes(status)) fail('E_ATLAS_ANCHOR_LINEAGE_STATUS_INVALID');
  const selectedCandidateId = trimString(input.selectedCandidateId);
  if (status === ATLAS_ANCHOR_STATUS.AMBIGUOUS && selectedCandidateId) fail('E_ATLAS_ANCHOR_LINEAGE_AMBIGUOUS_SELECTION_INVALID');
  if (status === ATLAS_ANCHOR_STATUS.EXACT && input.selectionRequired === true && !selectedCandidateId) {
    fail('E_ATLAS_ANCHOR_LINEAGE_EXPLICIT_SELECTION_REQUIRED');
  }
  return {
    schemaVersion: 'atlas.anchorLineageEntry.v1',
    anchorId: identity.anchorId,
    ordinal,
    previousEntryHash,
    fromRevision,
    toRevision,
    status,
    basis: trimString(input.basis),
    reason: trimString(input.reason),
    witnessHash: trimString(input.witnessHash),
    selectedCandidateId,
    span: status === ATLAS_ANCHOR_STATUS.EXACT && input.span ? normalizeSpan(input.span) : null,
    reattachmentId: trimString(input.reattachmentId),
    commandSeq: Number.isSafeInteger(input.commandSeq) && input.commandSeq >= 0 ? input.commandSeq : null,
    automaticReattachment: false,
  };
}

export function verifyAnchorLineage(lineageInput) {
  if (!isPlainObject(lineageInput) || lineageInput.schemaVersion !== ATLAS_ANCHOR_LINEAGE_SCHEMA_VERSION) {
    fail('E_ATLAS_ANCHOR_LINEAGE_INVALID');
  }
  const identity = createDurableAnchorIdentity(lineageInput.identity);
  const entries = Array.isArray(lineageInput.entries) ? lineageInput.entries : fail('E_ATLAS_ANCHOR_LINEAGE_ENTRIES_INVALID');
  let previousEntryHash = '';
  let previousRevision = identity.birthRevision;
  const normalizedEntries = [];
  for (let index = 0; index < entries.length; index += 1) {
    const source = entries[index];
    if (!isPlainObject(source) || source.ordinal !== index || source.previousEntryHash !== previousEntryHash || source.anchorId !== identity.anchorId) {
      fail('E_ATLAS_ANCHOR_LINEAGE_REWRITE_DETECTED', String(index));
    }
    const normalized = entryPayload(source, identity, index, previousEntryHash);
    if (hashCanonicalValue(normalized) !== source.entryHash) fail('E_ATLAS_ANCHOR_LINEAGE_ENTRY_HASH_MISMATCH', String(index));
    if (hashCanonicalValue(normalized.fromRevision) !== hashCanonicalValue(previousRevision)) {
      fail('E_ATLAS_ANCHOR_LINEAGE_REVISION_GAP', String(index));
    }
    previousEntryHash = source.entryHash;
    previousRevision = normalized.toRevision;
    normalizedEntries.push(frozenClone({ ...normalized, entryHash: source.entryHash }));
  }
  if (trimString(lineageInput.headEntryHash) !== previousEntryHash) fail('E_ATLAS_ANCHOR_LINEAGE_HEAD_MISMATCH');
  return frozenClone({
    schemaVersion: ATLAS_ANCHOR_LINEAGE_SCHEMA_VERSION,
    identity,
    entries: normalizedEntries,
    headEntryHash: previousEntryHash,
  });
}

export function appendAnchorLineageEntry(lineageInput, entryInput) {
  const lineage = verifyAnchorLineage(lineageInput);
  const previousRevision = lineage.entries.length > 0
    ? lineage.entries[lineage.entries.length - 1].toRevision
    : lineage.identity.birthRevision;
  const payload = entryPayload({ ...entryInput, fromRevision: entryInput?.fromRevision || previousRevision }, lineage.identity, lineage.entries.length, lineage.headEntryHash);
  if (hashCanonicalValue(payload.fromRevision) !== hashCanonicalValue(previousRevision)) {
    fail('E_ATLAS_ANCHOR_LINEAGE_REVISION_GAP');
  }
  const entry = frozenClone({ ...payload, entryHash: hashCanonicalValue(payload) });
  return frozenClone({
    schemaVersion: ATLAS_ANCHOR_LINEAGE_SCHEMA_VERSION,
    identity: lineage.identity,
    entries: [...lineage.entries, entry],
    headEntryHash: entry.entryHash,
  });
}

export default Object.freeze({
  ATLAS_ANCHOR_IDENTITY_SCHEMA_VERSION,
  ATLAS_ANCHOR_WITNESS_SCHEMA_VERSION,
  ATLAS_ANCHOR_LINEAGE_SCHEMA_VERSION,
  ATLAS_ANCHOR_STATUS,
  AtlasAnchorLineageError,
  createDurableAnchorIdentity,
  createRelocationWitness,
  validateRelocationWitness,
  diagnoseRelocationWitness,
  relocateAnchor,
  createAnchorLineage,
  verifyAnchorLineage,
  appendAnchorLineageEntry,
});
