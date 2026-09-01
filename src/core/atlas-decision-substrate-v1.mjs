import { hashCanonicalValue } from './browser-safe-hash.mjs';
import { verifyAtlasBookSnapshot } from './atlas-book-snapshot-v1.mjs';
import { verifyAtlasProjectorPublication } from './atlas-projector-kernel-v1.mjs';

export const ATLAS_DECISION_CANDIDATE_SCHEMA_VERSION = 'yalken.atlas.decisionCandidate.v1';
export const ATLAS_DECISION_QUEUE_SCHEMA_VERSION = 'yalken.atlas.decisionCandidateQueue.v1';
export const ATLAS_EVIDENCE_DELTA_SCHEMA_VERSION = 'yalken.atlas.evidenceDelta.v1';
export const ATLAS_DECISION_RECORD_SCHEMA_VERSION = 'yalken.atlas.decisionRecord.v1';
export const ATLAS_DECISION_MEMORY_SCHEMA_VERSION = 'yalken.atlas.decisionMemory.v1';
export const ATLAS_REVIEW_CENTER_SCHEMA_VERSION = 'yalken.atlas.reviewCenter.v1';
export const ATLAS_DECISION_MAX_QUEUE_SIZE = 256;
export const ATLAS_DECISION_MAX_SOURCE_PUBLICATIONS = 256;
export const ATLAS_DECISION_MAX_SOURCE_BYTES = 16 * 1024 * 1024;
export const ATLAS_DECISION_MAX_CANDIDATES_PER_PUBLICATION = 2_048;
export const ATLAS_DECISION_MAX_EVIDENCE_REFS = 512;
export const ATLAS_DECISION_MAX_MEMORY_ENTRIES = 4_096;
export const ATLAS_DECISION_MAX_SUMMARY_BYTES = 64 * 1024;
export const ATLAS_DECISION_MAX_SUMMARY_NODES = 4_096;
export const ATLAS_DECISION_MAX_SUMMARY_DEPTH = 32;

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const CANDIDATE_PAYLOAD_KEYS = Object.freeze([
  'candidateKey',
  'candidateKind',
  'entityId',
  'evidence',
  'summary',
]);
const CANDIDATE_KEYS = Object.freeze([
  'candidateId',
  'candidateKey',
  'candidateKind',
  'dependencyDigest',
  'entityId',
  'evidence',
  'evidenceDigest',
  'generation',
  'jobId',
  'orderDigest',
  'outputDigest',
  'projectId',
  'projectRevisionId',
  'projectorId',
  'publicationId',
  'resultId',
  'schemaVersion',
  'snapshotId',
  'sourceIndex',
  'summary',
  'summaryDigest',
]);
const EVIDENCE_REF_KEYS = Object.freeze(['evidenceDigest', 'evidenceId']);
const QUEUE_OPTIONS_KEYS = Object.freeze(['maxQueueSize']);
const QUEUE_KEYS = Object.freeze([
  'candidates',
  'coalescedCount',
  'discardedCount',
  'maxQueueSize',
  'projectId',
  'publications',
  'queueDigest',
  'schemaVersion',
  'sourceCount',
]);
const EVIDENCE_DELTA_INPUT_KEYS = Object.freeze(['afterEvidence', 'beforeEvidence']);
const EVIDENCE_DELTA_KEYS = Object.freeze([
  'added',
  'afterEvidenceDigest',
  'beforeEvidenceDigest',
  'changed',
  'deltaDigest',
  'removed',
  'retained',
  'schemaVersion',
  'summary',
]);
const CHANGED_EVIDENCE_KEYS = Object.freeze(['afterDigest', 'beforeDigest', 'evidenceId']);
const MEMORY_INPUT_KEYS = Object.freeze(['projectId']);
const MEMORY_KEYS = Object.freeze(['entries', 'memoryDigest', 'projectId', 'schemaVersion']);
const DECISION_RECORD_KEYS = Object.freeze([
  'candidate',
  'decisionId',
  'disposition',
  'previousMemoryDigest',
  'reason',
  'schemaVersion',
  'sequence',
]);
const DECISION_INPUT_KEYS = Object.freeze([
  'candidateId',
  'candidateQueue',
  'currentGeneration',
  'currentSnapshot',
  'decision',
  'decisionMemory',
]);
const DECISION_KEYS = Object.freeze(['disposition', 'reason']);
const REVIEW_INPUT_KEYS = Object.freeze([
  'candidateQueue',
  'currentGeneration',
  'currentSnapshot',
  'decisionMemory',
]);
const DISPOSITIONS = new Set(['ACCEPT', 'DEFER', 'REJECT']);

export class AtlasDecisionSubstrateError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'AtlasDecisionSubstrateError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') {
  throw new AtlasDecisionSubstrateError(code, detail);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactDataObject(value, expectedKeys, code) {
  if (!isPlainObject(value)) fail(code, 'OBJECT_REQUIRED');
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== 'string')) fail(code, 'STRING_KEYS_REQUIRED');
  const actual = ownKeys.slice().sort();
  if (actual.length !== expectedKeys.length || actual.some((key, index) => key !== expectedKeys[index])) {
    fail(code, 'EXACT_KEYSET_REQUIRED');
  }
  for (const key of ownKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.enumerable !== true || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      fail(code, 'DATA_PROPERTIES_REQUIRED');
    }
  }
}

function assertDenseDataArray(value, code) {
  if (!Array.isArray(value) || Object.getOwnPropertySymbols(value).length !== 0) fail(code, 'ARRAY_REQUIRED');
  const ownNames = Object.getOwnPropertyNames(value);
  if (ownNames.length !== value.length + 1 || !ownNames.includes('length')) fail(code, 'DENSE_ARRAY_REQUIRED');
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || descriptor.enumerable !== true || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      fail(code, 'DATA_ELEMENTS_REQUIRED');
    }
  }
}

function assertIdentifier(value, code, maxLength = 512) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > maxLength
    || value !== value.trim()
    || value !== value.normalize('NFC')
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) fail(code);
  return value;
}

function assertDigest(value, code) {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) fail(code);
  return value;
}

function assertGeneration(value, code) {
  if (!Number.isSafeInteger(value) || value < 1) fail(code);
  return value;
}

function assertQueueSize(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > ATLAS_DECISION_MAX_QUEUE_SIZE) {
    fail('E_ATLAS_DECISION_QUEUE_BOUND');
  }
  return value;
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}

function digestCanonical(value) {
  return `sha256:${hashCanonicalValue(value)}`;
}

function cloneBoundedPlainData(value) {
  let nodes = 0;
  function visit(current, depth) {
    nodes += 1;
    if (nodes > ATLAS_DECISION_MAX_SUMMARY_NODES) fail('E_ATLAS_DECISION_SUMMARY_NODE_LIMIT');
    if (depth > ATLAS_DECISION_MAX_SUMMARY_DEPTH) fail('E_ATLAS_DECISION_SUMMARY_DEPTH_LIMIT');
    if (current === null || typeof current === 'boolean' || typeof current === 'string') return current;
    if (typeof current === 'number' && Number.isFinite(current)) return current;
    if (Array.isArray(current)) {
      assertDenseDataArray(current, 'E_ATLAS_DECISION_SUMMARY_INVALID');
      return current.map((item) => visit(item, depth + 1));
    }
    if (!isPlainObject(current)) fail('E_ATLAS_DECISION_SUMMARY_INVALID', 'PLAIN_DATA_REQUIRED');
    const keys = Reflect.ownKeys(current);
    if (keys.some((key) => typeof key !== 'string')) fail('E_ATLAS_DECISION_SUMMARY_INVALID', 'STRING_KEYS_REQUIRED');
    const output = {};
    for (const key of keys.sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (!descriptor || descriptor.enumerable !== true || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        fail('E_ATLAS_DECISION_SUMMARY_INVALID', 'DATA_PROPERTIES_REQUIRED');
      }
      Object.defineProperty(output, key, {
        configurable: true,
        enumerable: true,
        value: visit(descriptor.value, depth + 1),
        writable: true,
      });
    }
    return output;
  }
  const output = visit(value, 0);
  if (new TextEncoder().encode(JSON.stringify(output)).length > ATLAS_DECISION_MAX_SUMMARY_BYTES) {
    fail('E_ATLAS_DECISION_SUMMARY_BYTE_LIMIT');
  }
  return freezeDeep(output);
}

function normalizeEvidenceRefs(value) {
  assertDenseDataArray(value, 'E_ATLAS_DECISION_EVIDENCE_INVALID');
  if (value.length > ATLAS_DECISION_MAX_EVIDENCE_REFS) fail('E_ATLAS_DECISION_EVIDENCE_BOUND');
  const evidence = value.map((item) => {
    assertExactDataObject(item, EVIDENCE_REF_KEYS, 'E_ATLAS_DECISION_EVIDENCE_REF_INVALID');
    return {
      evidenceId: assertIdentifier(item.evidenceId, 'E_ATLAS_DECISION_EVIDENCE_ID_INVALID'),
      evidenceDigest: assertDigest(item.evidenceDigest, 'E_ATLAS_DECISION_EVIDENCE_DIGEST_INVALID'),
    };
  }).sort((left, right) => left.evidenceId.localeCompare(right.evidenceId, 'en', { sensitivity: 'variant' }));
  if (new Set(evidence.map((item) => item.evidenceId)).size !== evidence.length) {
    fail('E_ATLAS_DECISION_EVIDENCE_DUPLICATE');
  }
  return freezeDeep(evidence);
}

function evidenceDigest(evidence) {
  return digestCanonical({ schemaVersion: 'yalken.atlas.evidenceSet.v1', evidence });
}

function assertCandidatePayload(value) {
  assertExactDataObject(value, CANDIDATE_PAYLOAD_KEYS, 'E_ATLAS_DECISION_CANDIDATE_PAYLOAD_INVALID');
  return {
    candidateKey: assertIdentifier(value.candidateKey, 'E_ATLAS_DECISION_CANDIDATE_KEY_INVALID'),
    candidateKind: assertIdentifier(value.candidateKind, 'E_ATLAS_DECISION_CANDIDATE_KIND_INVALID', 200),
    entityId: assertIdentifier(value.entityId, 'E_ATLAS_DECISION_ENTITY_ID_INVALID'),
    evidence: normalizeEvidenceRefs(value.evidence),
    summary: cloneBoundedPlainData(value.summary),
  };
}

function candidateIdentity(candidate) {
  return {
    schemaVersion: ATLAS_DECISION_CANDIDATE_SCHEMA_VERSION,
    candidateKey: candidate.candidateKey,
    candidateKind: candidate.candidateKind,
    entityId: candidate.entityId,
    evidenceDigest: candidate.evidenceDigest,
    summaryDigest: candidate.summaryDigest,
    sourceIndex: candidate.sourceIndex,
    publicationId: candidate.publicationId,
    resultId: candidate.resultId,
    jobId: candidate.jobId,
    projectorId: candidate.projectorId,
    generation: candidate.generation,
    projectId: candidate.projectId,
    projectRevisionId: candidate.projectRevisionId,
    snapshotId: candidate.snapshotId,
    orderDigest: candidate.orderDigest,
    dependencyDigest: candidate.dependencyDigest,
    outputDigest: candidate.outputDigest,
  };
}

function buildCandidate(publication, payload, sourceIndex) {
  const evidence = payload.evidence;
  const summary = payload.summary;
  const candidate = {
    schemaVersion: ATLAS_DECISION_CANDIDATE_SCHEMA_VERSION,
    candidateKey: payload.candidateKey,
    candidateKind: payload.candidateKind,
    entityId: payload.entityId,
    evidence,
    evidenceDigest: evidenceDigest(evidence),
    summary,
    summaryDigest: digestCanonical({ schemaVersion: 'yalken.atlas.decisionSummary.v1', summary }),
    sourceIndex,
    publicationId: publication.publicationId,
    resultId: publication.resultId,
    jobId: publication.jobId,
    projectorId: publication.projectorId,
    generation: publication.generation,
    projectId: publication.projectId,
    projectRevisionId: publication.projectRevisionId,
    snapshotId: publication.snapshotId,
    orderDigest: publication.orderDigest,
    dependencyDigest: publication.dependencyDigest,
    outputDigest: publication.outputDigest,
  };
  return freezeDeep({ ...candidate, candidateId: digestCanonical(candidateIdentity(candidate)) });
}

export function verifyAtlasDecisionCandidate(candidate) {
  assertExactDataObject(candidate, CANDIDATE_KEYS, 'E_ATLAS_DECISION_CANDIDATE_INVALID');
  if (candidate.schemaVersion !== ATLAS_DECISION_CANDIDATE_SCHEMA_VERSION) fail('E_ATLAS_DECISION_CANDIDATE_SCHEMA');
  const normalized = {
    schemaVersion: candidate.schemaVersion,
    candidateKey: assertIdentifier(candidate.candidateKey, 'E_ATLAS_DECISION_CANDIDATE_KEY_INVALID'),
    candidateKind: assertIdentifier(candidate.candidateKind, 'E_ATLAS_DECISION_CANDIDATE_KIND_INVALID', 200),
    entityId: assertIdentifier(candidate.entityId, 'E_ATLAS_DECISION_ENTITY_ID_INVALID'),
    evidence: normalizeEvidenceRefs(candidate.evidence),
    evidenceDigest: assertDigest(candidate.evidenceDigest, 'E_ATLAS_DECISION_EVIDENCE_DIGEST_INVALID'),
    summary: cloneBoundedPlainData(candidate.summary),
    summaryDigest: assertDigest(candidate.summaryDigest, 'E_ATLAS_DECISION_SUMMARY_DIGEST_INVALID'),
    sourceIndex: candidate.sourceIndex,
    publicationId: assertDigest(candidate.publicationId, 'E_ATLAS_DECISION_PUBLICATION_ID_INVALID'),
    resultId: assertDigest(candidate.resultId, 'E_ATLAS_DECISION_RESULT_ID_INVALID'),
    jobId: assertDigest(candidate.jobId, 'E_ATLAS_DECISION_JOB_ID_INVALID'),
    projectorId: assertIdentifier(candidate.projectorId, 'E_ATLAS_DECISION_PROJECTOR_ID_INVALID', 200),
    generation: assertGeneration(candidate.generation, 'E_ATLAS_DECISION_GENERATION_INVALID'),
    projectId: assertIdentifier(candidate.projectId, 'E_ATLAS_DECISION_PROJECT_ID_INVALID', 200),
    projectRevisionId: assertDigest(candidate.projectRevisionId, 'E_ATLAS_DECISION_PROJECT_REVISION_INVALID'),
    snapshotId: assertDigest(candidate.snapshotId, 'E_ATLAS_DECISION_SNAPSHOT_ID_INVALID'),
    orderDigest: assertDigest(candidate.orderDigest, 'E_ATLAS_DECISION_ORDER_DIGEST_INVALID'),
    dependencyDigest: assertDigest(candidate.dependencyDigest, 'E_ATLAS_DECISION_DEPENDENCY_DIGEST_INVALID'),
    outputDigest: assertDigest(candidate.outputDigest, 'E_ATLAS_DECISION_OUTPUT_DIGEST_INVALID'),
  };
  if (!Number.isSafeInteger(normalized.sourceIndex) || normalized.sourceIndex < 0) fail('E_ATLAS_DECISION_SOURCE_INDEX_INVALID');
  if (normalized.evidenceDigest !== evidenceDigest(normalized.evidence)) fail('E_ATLAS_DECISION_EVIDENCE_DIGEST_MISMATCH');
  const expectedSummaryDigest = digestCanonical({ schemaVersion: 'yalken.atlas.decisionSummary.v1', summary: normalized.summary });
  if (normalized.summaryDigest !== expectedSummaryDigest) fail('E_ATLAS_DECISION_SUMMARY_DIGEST_MISMATCH');
  if (candidate.candidateId !== digestCanonical(candidateIdentity(normalized))) fail('E_ATLAS_DECISION_CANDIDATE_DIGEST_MISMATCH');
  return freezeDeep({ ...normalized, candidateId: candidate.candidateId });
}

function publicationCandidates(publicationInput) {
  const publication = verifyAtlasProjectorPublication(publicationInput);
  if (!isPlainObject(publication.output)) fail('E_ATLAS_DECISION_PUBLICATION_OUTPUT_INVALID');
  const descriptor = Object.getOwnPropertyDescriptor(publication.output, 'decisionCandidates');
  if (!descriptor || descriptor.enumerable !== true || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
    fail('E_ATLAS_DECISION_PUBLICATION_CANDIDATES_REQUIRED');
  }
  assertDenseDataArray(descriptor.value, 'E_ATLAS_DECISION_PUBLICATION_CANDIDATES_INVALID');
  if (descriptor.value.length > ATLAS_DECISION_MAX_CANDIDATES_PER_PUBLICATION) {
    fail('E_ATLAS_DECISION_PUBLICATION_CANDIDATE_BOUND');
  }
  return {
    publication,
    candidates: descriptor.value.map((payload, sourceIndex) => buildCandidate(
      publication,
      assertCandidatePayload(payload),
      sourceIndex,
    )),
  };
}

function candidateKey(candidate) {
  return `${candidate.projectorId}\u0000${candidate.candidateKey}`;
}

function compareCandidates(left, right) {
  if (left.generation !== right.generation) return left.generation - right.generation;
  const leftKey = candidateKey(left);
  const rightKey = candidateKey(right);
  if (leftKey < rightKey) return -1;
  if (leftKey > rightKey) return 1;
  return left.candidateId < right.candidateId ? -1 : left.candidateId > right.candidateId ? 1 : 0;
}

function comparePublications(left, right) {
  if (left.generation !== right.generation) return left.generation - right.generation;
  if (left.projectorId !== right.projectorId) return left.projectorId < right.projectorId ? -1 : 1;
  return left.publicationId < right.publicationId ? -1 : left.publicationId > right.publicationId ? 1 : 0;
}

function buildQueue(publicationsInput, maxQueueSize) {
  assertDenseDataArray(publicationsInput, 'E_ATLAS_DECISION_PUBLICATIONS_INVALID');
  if (publicationsInput.length > ATLAS_DECISION_MAX_SOURCE_PUBLICATIONS) fail('E_ATLAS_DECISION_PUBLICATION_COUNT_BOUND');
  const normalized = publicationsInput.map((publication) => publicationCandidates(publication));
  const publications = normalized.map((item) => item.publication).sort(comparePublications);
  if (new Set(publications.map((publication) => publication.publicationId)).size !== publications.length) {
    fail('E_ATLAS_DECISION_PUBLICATION_DUPLICATE');
  }
  const sourceBytes = new TextEncoder().encode(JSON.stringify(publications)).length;
  if (sourceBytes > ATLAS_DECISION_MAX_SOURCE_BYTES) fail('E_ATLAS_DECISION_PUBLICATION_BYTE_BOUND');
  const allCandidates = normalized.flatMap((item) => item.candidates);
  const projectIds = new Set(publications.map((publication) => publication.projectId));
  if (projectIds.size > 1) fail('E_ATLAS_DECISION_QUEUE_PROJECT_COLLISION');
  const latestByKey = new Map();
  for (const candidate of allCandidates) {
    const key = candidateKey(candidate);
    const current = latestByKey.get(key);
    if (current && candidate.generation === current.generation && candidate.candidateId !== current.candidateId) {
      fail('E_ATLAS_DECISION_GENERATION_COLLISION', key);
    }
    if (!current || candidate.generation > current.generation) latestByKey.set(key, candidate);
  }
  const coalesced = [...latestByKey.values()].sort(compareCandidates);
  const candidates = coalesced.slice(-maxQueueSize);
  const identity = {
    schemaVersion: ATLAS_DECISION_QUEUE_SCHEMA_VERSION,
    projectId: projectIds.size === 0 ? '' : [...projectIds][0],
    maxQueueSize,
    sourceCount: allCandidates.length,
    coalescedCount: coalesced.length,
    discardedCount: allCandidates.length - candidates.length,
    publications,
    candidates,
  };
  return freezeDeep({ ...identity, queueDigest: digestCanonical(identity) });
}

export function buildAtlasDecisionCandidateQueue(
  publications,
  options = { maxQueueSize: ATLAS_DECISION_MAX_QUEUE_SIZE },
) {
  assertExactDataObject(options, QUEUE_OPTIONS_KEYS, 'E_ATLAS_DECISION_QUEUE_OPTIONS_INVALID');
  return buildQueue(publications, assertQueueSize(options.maxQueueSize));
}

export function verifyAtlasDecisionCandidateQueue(queue) {
  assertExactDataObject(queue, QUEUE_KEYS, 'E_ATLAS_DECISION_QUEUE_INVALID');
  if (queue.schemaVersion !== ATLAS_DECISION_QUEUE_SCHEMA_VERSION) fail('E_ATLAS_DECISION_QUEUE_SCHEMA');
  const rebuilt = buildAtlasDecisionCandidateQueue(queue.publications, { maxQueueSize: queue.maxQueueSize });
  if (hashCanonicalValue(queue) !== hashCanonicalValue(rebuilt)) fail('E_ATLAS_DECISION_QUEUE_DIGEST_MISMATCH');
  return rebuilt;
}

export function computeAtlasEvidenceDelta(input) {
  assertExactDataObject(input, EVIDENCE_DELTA_INPUT_KEYS, 'E_ATLAS_EVIDENCE_DELTA_INPUT_INVALID');
  const beforeEvidence = normalizeEvidenceRefs(input.beforeEvidence);
  const afterEvidence = normalizeEvidenceRefs(input.afterEvidence);
  const beforeById = new Map(beforeEvidence.map((item) => [item.evidenceId, item]));
  const afterById = new Map(afterEvidence.map((item) => [item.evidenceId, item]));
  const added = afterEvidence.filter((item) => !beforeById.has(item.evidenceId));
  const removed = beforeEvidence.filter((item) => !afterById.has(item.evidenceId));
  const retained = afterEvidence.filter((item) => beforeById.get(item.evidenceId)?.evidenceDigest === item.evidenceDigest);
  const changed = afterEvidence
    .filter((item) => beforeById.has(item.evidenceId) && beforeById.get(item.evidenceId).evidenceDigest !== item.evidenceDigest)
    .map((item) => ({
      evidenceId: item.evidenceId,
      beforeDigest: beforeById.get(item.evidenceId).evidenceDigest,
      afterDigest: item.evidenceDigest,
    }));
  for (const item of changed) assertExactDataObject(item, CHANGED_EVIDENCE_KEYS, 'E_ATLAS_EVIDENCE_DELTA_CHANGED_INVALID');
  const identity = {
    schemaVersion: ATLAS_EVIDENCE_DELTA_SCHEMA_VERSION,
    beforeEvidenceDigest: evidenceDigest(beforeEvidence),
    afterEvidenceDigest: evidenceDigest(afterEvidence),
    added,
    removed,
    retained,
    changed,
    summary: {
      beforeCount: beforeEvidence.length,
      afterCount: afterEvidence.length,
      addedCount: added.length,
      removedCount: removed.length,
      retainedCount: retained.length,
      changedCount: changed.length,
      hasDelta: added.length + removed.length + changed.length > 0,
    },
  };
  return freezeDeep({ ...identity, deltaDigest: digestCanonical(identity) });
}

function memorySeed(projectId) {
  return digestCanonical({ schemaVersion: 'yalken.atlas.decisionMemorySeed.v1', projectId });
}

function buildMemory(projectId, entries, memoryDigest) {
  return freezeDeep({
    schemaVersion: ATLAS_DECISION_MEMORY_SCHEMA_VERSION,
    projectId,
    entries,
    memoryDigest,
  });
}

export function createAtlasDecisionMemory(input) {
  assertExactDataObject(input, MEMORY_INPUT_KEYS, 'E_ATLAS_DECISION_MEMORY_INPUT_INVALID');
  const projectId = assertIdentifier(input.projectId, 'E_ATLAS_DECISION_MEMORY_PROJECT_ID_INVALID', 200);
  return buildMemory(projectId, freezeDeep([]), memorySeed(projectId));
}

function decisionIdentity(record) {
  return {
    schemaVersion: ATLAS_DECISION_RECORD_SCHEMA_VERSION,
    sequence: record.sequence,
    previousMemoryDigest: record.previousMemoryDigest,
    candidateId: record.candidate.candidateId,
    disposition: record.disposition,
    reason: record.reason,
  };
}

function nextMemoryDigest(previousMemoryDigest, decisionId) {
  return digestCanonical({
    schemaVersion: 'yalken.atlas.decisionMemoryChain.v1',
    previousMemoryDigest,
    decisionId,
  });
}

function normalizeDecision(value) {
  assertExactDataObject(value, DECISION_KEYS, 'E_ATLAS_DECISION_INPUT_DECISION_INVALID');
  if (!DISPOSITIONS.has(value.disposition)) fail('E_ATLAS_DECISION_DISPOSITION_INVALID');
  const reason = assertIdentifier(value.reason, 'E_ATLAS_DECISION_REASON_INVALID', 2_000);
  return { disposition: value.disposition, reason };
}

function verifyDecisionRecord(record, expectedSequence, expectedPreviousDigest, projectId) {
  assertExactDataObject(record, DECISION_RECORD_KEYS, 'E_ATLAS_DECISION_RECORD_INVALID');
  if (record.schemaVersion !== ATLAS_DECISION_RECORD_SCHEMA_VERSION) fail('E_ATLAS_DECISION_RECORD_SCHEMA');
  if (record.sequence !== expectedSequence) fail('E_ATLAS_DECISION_SEQUENCE_MISMATCH');
  if (record.previousMemoryDigest !== expectedPreviousDigest) fail('E_ATLAS_DECISION_MEMORY_CHAIN_MISMATCH');
  const candidate = verifyAtlasDecisionCandidate(record.candidate);
  if (candidate.projectId !== projectId) fail('E_ATLAS_DECISION_MEMORY_PROJECT_MISMATCH');
  const decision = normalizeDecision({ disposition: record.disposition, reason: record.reason });
  const normalized = {
    schemaVersion: ATLAS_DECISION_RECORD_SCHEMA_VERSION,
    sequence: expectedSequence,
    previousMemoryDigest: expectedPreviousDigest,
    candidate,
    disposition: decision.disposition,
    reason: decision.reason,
  };
  if (record.decisionId !== digestCanonical(decisionIdentity(normalized))) fail('E_ATLAS_DECISION_RECORD_DIGEST_MISMATCH');
  return freezeDeep({ ...normalized, decisionId: record.decisionId });
}

export function verifyAtlasDecisionMemory(memory) {
  assertExactDataObject(memory, MEMORY_KEYS, 'E_ATLAS_DECISION_MEMORY_INVALID');
  if (memory.schemaVersion !== ATLAS_DECISION_MEMORY_SCHEMA_VERSION) fail('E_ATLAS_DECISION_MEMORY_SCHEMA');
  const projectId = assertIdentifier(memory.projectId, 'E_ATLAS_DECISION_MEMORY_PROJECT_ID_INVALID', 200);
  assertDenseDataArray(memory.entries, 'E_ATLAS_DECISION_MEMORY_ENTRIES_INVALID');
  if (memory.entries.length > ATLAS_DECISION_MAX_MEMORY_ENTRIES) fail('E_ATLAS_DECISION_MEMORY_BOUND');
  let digest = memorySeed(projectId);
  const terminalByCandidateId = new Map();
  const entries = memory.entries.map((entry, index) => {
    const normalized = verifyDecisionRecord(entry, index + 1, digest, projectId);
    const previous = terminalByCandidateId.get(normalized.candidate.candidateId);
    if (previous === 'ACCEPT' || previous === 'REJECT') fail('E_ATLAS_DECISION_AFTER_FINAL');
    if (previous === 'DEFER' && normalized.disposition === 'DEFER') fail('E_ATLAS_DECISION_REPEATED_DEFER');
    terminalByCandidateId.set(normalized.candidate.candidateId, normalized.disposition);
    digest = nextMemoryDigest(digest, normalized.decisionId);
    return normalized;
  });
  if (memory.memoryDigest !== digest) fail('E_ATLAS_DECISION_MEMORY_DIGEST_MISMATCH');
  return buildMemory(projectId, freezeDeep(entries), digest);
}

function currentCandidateMismatches(candidate, snapshot, currentGeneration) {
  const mismatches = [];
  if (candidate.generation !== currentGeneration) mismatches.push('generation');
  for (const key of ['projectId', 'projectRevisionId', 'snapshotId', 'orderDigest', 'dependencyDigest']) {
    if (candidate[key] !== snapshot[key]) mismatches.push(key);
  }
  return mismatches.sort();
}

function decisionRejection(reason, mismatches, memory) {
  return freezeDeep({
    accepted: false,
    code: 'E_ATLAS_DECISION_REJECTED',
    reason,
    mismatches: [...mismatches].sort(),
    memory,
  });
}

export function recordAtlasDecision(input) {
  assertExactDataObject(input, DECISION_INPUT_KEYS, 'E_ATLAS_DECISION_INPUT_INVALID');
  const queue = verifyAtlasDecisionCandidateQueue(input.candidateQueue);
  const snapshot = verifyAtlasBookSnapshot(input.currentSnapshot);
  const currentGeneration = assertGeneration(input.currentGeneration, 'E_ATLAS_DECISION_CURRENT_GENERATION_INVALID');
  const memory = verifyAtlasDecisionMemory(input.decisionMemory);
  const decision = normalizeDecision(input.decision);
  const candidateId = assertDigest(input.candidateId, 'E_ATLAS_DECISION_CANDIDATE_ID_INVALID');
  if (memory.projectId !== snapshot.projectId || (queue.projectId && queue.projectId !== snapshot.projectId)) {
    fail('E_ATLAS_DECISION_PROJECT_MISMATCH');
  }
  const candidate = queue.candidates.find((item) => item.candidateId === candidateId);
  if (!candidate) return decisionRejection('CANDIDATE_NOT_IN_QUEUE', ['candidateId'], memory);
  const mismatches = currentCandidateMismatches(candidate, snapshot, currentGeneration);
  if (mismatches.length > 0) return decisionRejection('CANDIDATE_STALE', mismatches, memory);
  const sameCandidate = memory.entries.filter((entry) => entry.candidate.candidateId === candidateId);
  const latest = sameCandidate.at(-1) || null;
  if (latest && latest.disposition !== 'DEFER') {
    if (latest.disposition === decision.disposition && latest.reason === decision.reason) {
      return freezeDeep({
        accepted: true,
        code: 'ATLAS_DECISION_IDEMPOTENT_REPLAY',
        decision: latest,
        memory,
      });
    }
    return decisionRejection('DECISION_ALREADY_FINAL', ['candidateId'], memory);
  }
  if (latest?.disposition === 'DEFER' && decision.disposition === 'DEFER') {
    if (latest.reason === decision.reason) {
      return freezeDeep({
        accepted: true,
        code: 'ATLAS_DECISION_IDEMPOTENT_REPLAY',
        decision: latest,
        memory,
      });
    }
    return decisionRejection('DECISION_ALREADY_DEFERRED', ['candidateId'], memory);
  }
  if (memory.entries.length >= ATLAS_DECISION_MAX_MEMORY_ENTRIES) fail('E_ATLAS_DECISION_MEMORY_BOUND');
  const record = {
    schemaVersion: ATLAS_DECISION_RECORD_SCHEMA_VERSION,
    sequence: memory.entries.length + 1,
    previousMemoryDigest: memory.memoryDigest,
    candidate,
    disposition: decision.disposition,
    reason: decision.reason,
  };
  const normalizedRecord = freezeDeep({ ...record, decisionId: digestCanonical(decisionIdentity(record)) });
  const nextDigest = nextMemoryDigest(memory.memoryDigest, normalizedRecord.decisionId);
  const nextMemory = buildMemory(memory.projectId, freezeDeep([...memory.entries, normalizedRecord]), nextDigest);
  return freezeDeep({
    accepted: true,
    code: 'ATLAS_DECISION_RECORDED',
    decision: normalizedRecord,
    memory: nextMemory,
  });
}

function lastDecisionsByCandidateKey(memory) {
  const byKey = new Map();
  for (const entry of memory.entries) byKey.set(candidateKey(entry.candidate), entry);
  return byKey;
}

export function buildAtlasReviewCenter(input) {
  assertExactDataObject(input, REVIEW_INPUT_KEYS, 'E_ATLAS_REVIEW_CENTER_INPUT_INVALID');
  const queue = verifyAtlasDecisionCandidateQueue(input.candidateQueue);
  const snapshot = verifyAtlasBookSnapshot(input.currentSnapshot);
  const currentGeneration = assertGeneration(input.currentGeneration, 'E_ATLAS_REVIEW_CENTER_GENERATION_INVALID');
  const memory = verifyAtlasDecisionMemory(input.decisionMemory);
  if (memory.projectId !== snapshot.projectId || (queue.projectId && queue.projectId !== snapshot.projectId)) {
    fail('E_ATLAS_REVIEW_CENTER_PROJECT_MISMATCH');
  }
  const latestByKey = lastDecisionsByCandidateKey(memory);
  const items = queue.candidates.map((candidate) => {
    const mismatches = currentCandidateMismatches(candidate, snapshot, currentGeneration);
    const lastDecision = latestByKey.get(candidateKey(candidate)) || null;
    const delta = computeAtlasEvidenceDelta({
      beforeEvidence: lastDecision ? lastDecision.candidate.evidence : [],
      afterEvidence: candidate.evidence,
    });
    let reviewStatus = 'REVIEW_REQUIRED';
    let decisionEligible = mismatches.length === 0;
    if (mismatches.length > 0) {
      reviewStatus = 'STALE_BLOCKED';
    } else if (lastDecision?.candidate.candidateId === candidate.candidateId) {
      if (lastDecision.disposition === 'DEFER') {
        reviewStatus = 'DEFERRED';
      } else {
        reviewStatus = lastDecision.disposition === 'ACCEPT' ? 'RESOLVED_ACCEPTED' : 'RESOLVED_REJECTED';
        decisionEligible = false;
      }
    } else if (lastDecision && delta.summary.hasDelta) {
      reviewStatus = 'EVIDENCE_CHANGED';
    }
    return {
      candidate,
      reviewStatus,
      decisionEligible,
      staleMismatches: mismatches,
      lastDecisionId: lastDecision?.decisionId || '',
      lastDisposition: lastDecision?.disposition || '',
      evidenceDelta: delta,
    };
  });
  const summary = {
    totalCount: items.length,
    reviewRequiredCount: items.filter((item) => item.reviewStatus === 'REVIEW_REQUIRED').length,
    evidenceChangedCount: items.filter((item) => item.reviewStatus === 'EVIDENCE_CHANGED').length,
    deferredCount: items.filter((item) => item.reviewStatus === 'DEFERRED').length,
    resolvedCount: items.filter((item) => item.reviewStatus.startsWith('RESOLVED_')).length,
    staleBlockedCount: items.filter((item) => item.reviewStatus === 'STALE_BLOCKED').length,
    decisionEligibleCount: items.filter((item) => item.decisionEligible).length,
    completeDenominator: queue.candidates.length,
  };
  const authority = {
    sourceOfTruth: 'verified WP402 projector publications + caller-owned decision memory',
    readModelOnly: true,
    commandAuthority: 'none',
    productMutation: false,
    storageMutation: false,
    automaticDecision: false,
  };
  const identity = {
    schemaVersion: ATLAS_REVIEW_CENTER_SCHEMA_VERSION,
    projectId: snapshot.projectId,
    projectRevisionId: snapshot.projectRevisionId,
    snapshotId: snapshot.snapshotId,
    generation: currentGeneration,
    queueDigest: queue.queueDigest,
    memoryDigest: memory.memoryDigest,
    authority,
    summary,
    items,
  };
  return freezeDeep({ ...identity, reviewCenterId: digestCanonical(identity) });
}
