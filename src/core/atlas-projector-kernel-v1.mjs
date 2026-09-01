import { hashCanonicalValue } from './browser-safe-hash.mjs';
import { verifyAtlasBookSnapshot } from './atlas-book-snapshot-v1.mjs';

export const ATLAS_PROJECTOR_JOB_SCHEMA_VERSION = 'yalken.atlas.projectorJob.v1';
export const ATLAS_PROJECTOR_QUEUE_SCHEMA_VERSION = 'yalken.atlas.projectorQueue.v1';
export const ATLAS_PROJECTOR_OUTPUT_SCHEMA_VERSION = 'yalken.atlas.projectorOutput.v1';
export const ATLAS_PROJECTOR_RESULT_SCHEMA_VERSION = 'yalken.atlas.projectorResult.v1';
export const ATLAS_PROJECTOR_PUBLICATION_SCHEMA_VERSION = 'yalken.atlas.projectorPublication.v1';
export const ATLAS_PROJECTOR_MAX_QUEUE_SIZE = 256;
export const ATLAS_PROJECTOR_MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
export const ATLAS_PROJECTOR_MAX_OUTPUT_NODES = 100_000;
export const ATLAS_PROJECTOR_MAX_OUTPUT_DEPTH = 64;

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const JOB_INPUT_KEYS = Object.freeze(['generation', 'projectorId', 'snapshot']);
const JOB_KEYS = Object.freeze([
  'dependencyDigest',
  'generation',
  'jobId',
  'orderDigest',
  'projectId',
  'projectRevisionId',
  'projectorId',
  'schemaVersion',
  'snapshot',
  'snapshotId',
]);
const QUEUE_OPTIONS_KEYS = Object.freeze(['maxQueueSize']);
const RESULT_KEYS = Object.freeze([
  'dependencyDigest',
  'generation',
  'jobId',
  'orderDigest',
  'output',
  'outputDigest',
  'projectId',
  'projectRevisionId',
  'projectorId',
  'resultId',
  'schemaVersion',
  'snapshotId',
]);
const PUBLICATION_INPUT_KEYS = Object.freeze([
  'activeJob',
  'currentGeneration',
  'currentSnapshot',
  'result',
]);
const PUBLICATION_KEYS = Object.freeze([
  'dependencyDigest',
  'generation',
  'jobId',
  'orderDigest',
  'output',
  'outputDigest',
  'projectId',
  'projectRevisionId',
  'projectorId',
  'publicationId',
  'resultId',
  'schemaVersion',
  'snapshotId',
]);

export class AtlasProjectorKernelError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'AtlasProjectorKernelError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') {
  throw new AtlasProjectorKernelError(code, detail);
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
  if (!Number.isSafeInteger(value) || value < 1 || value > ATLAS_PROJECTOR_MAX_QUEUE_SIZE) {
    fail('E_ATLAS_PROJECTOR_QUEUE_BOUND');
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
    if (nodes > ATLAS_PROJECTOR_MAX_OUTPUT_NODES) fail('E_ATLAS_PROJECTOR_OUTPUT_NODE_LIMIT');
    if (depth > ATLAS_PROJECTOR_MAX_OUTPUT_DEPTH) fail('E_ATLAS_PROJECTOR_OUTPUT_DEPTH_LIMIT');
    if (current === null || typeof current === 'boolean' || typeof current === 'string') return current;
    if (typeof current === 'number' && Number.isFinite(current)) return current;
    if (Array.isArray(current)) {
      assertDenseDataArray(current, 'E_ATLAS_PROJECTOR_OUTPUT_INVALID');
      return current.map((item) => visit(item, depth + 1));
    }
    if (!isPlainObject(current)) fail('E_ATLAS_PROJECTOR_OUTPUT_INVALID', 'PLAIN_DATA_REQUIRED');
    const keys = Reflect.ownKeys(current);
    if (keys.some((key) => typeof key !== 'string')) fail('E_ATLAS_PROJECTOR_OUTPUT_INVALID', 'STRING_KEYS_REQUIRED');
    const output = {};
    for (const key of keys.sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (!descriptor || descriptor.enumerable !== true || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        fail('E_ATLAS_PROJECTOR_OUTPUT_INVALID', 'DATA_PROPERTIES_REQUIRED');
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
  const byteLength = new TextEncoder().encode(JSON.stringify(output)).length;
  if (byteLength > ATLAS_PROJECTOR_MAX_OUTPUT_BYTES) fail('E_ATLAS_PROJECTOR_OUTPUT_BYTE_LIMIT');
  return freezeDeep(output);
}

function buildJob(snapshot, projectorId, generation) {
  const identity = {
    schemaVersion: ATLAS_PROJECTOR_JOB_SCHEMA_VERSION,
    projectorId,
    generation,
    projectId: snapshot.projectId,
    projectRevisionId: snapshot.projectRevisionId,
    snapshotId: snapshot.snapshotId,
    orderDigest: snapshot.orderDigest,
    dependencyDigest: snapshot.dependencyDigest,
  };
  return freezeDeep({
    ...identity,
    jobId: digestCanonical(identity),
    snapshot,
  });
}

export function createAtlasProjectorJob(input) {
  assertExactDataObject(input, JOB_INPUT_KEYS, 'E_ATLAS_PROJECTOR_JOB_INPUT_INVALID');
  const snapshot = verifyAtlasBookSnapshot(input.snapshot);
  const projectorId = assertIdentifier(input.projectorId, 'E_ATLAS_PROJECTOR_ID_INVALID', 200);
  const generation = assertGeneration(input.generation, 'E_ATLAS_PROJECTOR_GENERATION_INVALID');
  return buildJob(snapshot, projectorId, generation);
}

export function verifyAtlasProjectorJob(job) {
  assertExactDataObject(job, JOB_KEYS, 'E_ATLAS_PROJECTOR_JOB_INVALID');
  if (job.schemaVersion !== ATLAS_PROJECTOR_JOB_SCHEMA_VERSION) fail('E_ATLAS_PROJECTOR_JOB_SCHEMA');
  const rebuilt = createAtlasProjectorJob({
    snapshot: job.snapshot,
    projectorId: job.projectorId,
    generation: job.generation,
  });
  if (hashCanonicalValue(job) !== hashCanonicalValue(rebuilt)) fail('E_ATLAS_PROJECTOR_JOB_DIGEST_MISMATCH');
  return rebuilt;
}

function queueKey(job) {
  return `${job.projectId}\u0000${job.projectorId}`;
}

function compareJobs(left, right) {
  if (left.generation !== right.generation) return left.generation - right.generation;
  const leftKey = queueKey(left);
  const rightKey = queueKey(right);
  if (leftKey < rightKey) return -1;
  if (leftKey > rightKey) return 1;
  return left.jobId < right.jobId ? -1 : left.jobId > right.jobId ? 1 : 0;
}

export function coalesceAtlasProjectorJobs(jobs, options = { maxQueueSize: ATLAS_PROJECTOR_MAX_QUEUE_SIZE }) {
  assertDenseDataArray(jobs, 'E_ATLAS_PROJECTOR_QUEUE_INPUT_INVALID');
  assertExactDataObject(options, QUEUE_OPTIONS_KEYS, 'E_ATLAS_PROJECTOR_QUEUE_OPTIONS_INVALID');
  const maxQueueSize = assertQueueSize(options.maxQueueSize);
  const latestByKey = new Map();
  for (const input of jobs) {
    const job = verifyAtlasProjectorJob(input);
    const key = queueKey(job);
    const current = latestByKey.get(key);
    if (current && job.generation === current.generation && job.jobId !== current.jobId) {
      fail('E_ATLAS_PROJECTOR_GENERATION_COLLISION', key);
    }
    if (!current || job.generation > current.generation) latestByKey.set(key, job);
  }
  const coalesced = [...latestByKey.values()].sort(compareJobs);
  const queue = coalesced.slice(-maxQueueSize);
  const identity = {
    schemaVersion: ATLAS_PROJECTOR_QUEUE_SCHEMA_VERSION,
    maxQueueSize,
    sourceCount: jobs.length,
    coalescedCount: coalesced.length,
    discardedCount: jobs.length - queue.length,
    jobs: queue,
  };
  return freezeDeep({ ...identity, queueDigest: digestCanonical(identity) });
}

function buildResult(job, output) {
  const outputDigest = digestCanonical({
    schemaVersion: ATLAS_PROJECTOR_OUTPUT_SCHEMA_VERSION,
    jobId: job.jobId,
    output,
  });
  const identity = {
    schemaVersion: ATLAS_PROJECTOR_RESULT_SCHEMA_VERSION,
    jobId: job.jobId,
    projectorId: job.projectorId,
    generation: job.generation,
    projectId: job.projectId,
    projectRevisionId: job.projectRevisionId,
    snapshotId: job.snapshotId,
    orderDigest: job.orderDigest,
    dependencyDigest: job.dependencyDigest,
    outputDigest,
  };
  return freezeDeep({ ...identity, resultId: digestCanonical(identity), output });
}

export function runAtlasProjectorJob(jobInput, derive) {
  const job = verifyAtlasProjectorJob(jobInput);
  if (typeof derive !== 'function') fail('E_ATLAS_PROJECTOR_DERIVE_REQUIRED');
  let derived;
  try {
    derived = derive(job.snapshot);
  } catch (error) {
    fail('E_ATLAS_PROJECTOR_DERIVE_FAILED', error instanceof Error ? error.name : 'UNIDENTIFIED_THROW');
  }
  return buildResult(job, cloneBoundedPlainData(derived));
}

export function verifyAtlasProjectorResult(result) {
  assertExactDataObject(result, RESULT_KEYS, 'E_ATLAS_PROJECTOR_RESULT_INVALID');
  if (result.schemaVersion !== ATLAS_PROJECTOR_RESULT_SCHEMA_VERSION) fail('E_ATLAS_PROJECTOR_RESULT_SCHEMA');
  const identity = {
    schemaVersion: result.schemaVersion,
    jobId: assertDigest(result.jobId, 'E_ATLAS_PROJECTOR_RESULT_JOB_ID_INVALID'),
    projectorId: assertIdentifier(result.projectorId, 'E_ATLAS_PROJECTOR_ID_INVALID', 200),
    generation: assertGeneration(result.generation, 'E_ATLAS_PROJECTOR_GENERATION_INVALID'),
    projectId: assertIdentifier(result.projectId, 'E_ATLAS_PROJECTOR_PROJECT_ID_INVALID', 200),
    projectRevisionId: assertDigest(result.projectRevisionId, 'E_ATLAS_PROJECTOR_PROJECT_REVISION_INVALID'),
    snapshotId: assertDigest(result.snapshotId, 'E_ATLAS_PROJECTOR_SNAPSHOT_ID_INVALID'),
    orderDigest: assertDigest(result.orderDigest, 'E_ATLAS_PROJECTOR_ORDER_DIGEST_INVALID'),
    dependencyDigest: assertDigest(result.dependencyDigest, 'E_ATLAS_PROJECTOR_DEPENDENCY_DIGEST_INVALID'),
    outputDigest: assertDigest(result.outputDigest, 'E_ATLAS_PROJECTOR_OUTPUT_DIGEST_INVALID'),
  };
  const output = cloneBoundedPlainData(result.output);
  const expectedOutputDigest = digestCanonical({
    schemaVersion: ATLAS_PROJECTOR_OUTPUT_SCHEMA_VERSION,
    jobId: identity.jobId,
    output,
  });
  if (identity.outputDigest !== expectedOutputDigest) fail('E_ATLAS_PROJECTOR_OUTPUT_DIGEST_MISMATCH');
  if (result.resultId !== digestCanonical(identity)) fail('E_ATLAS_PROJECTOR_RESULT_DIGEST_MISMATCH');
  return freezeDeep({ ...identity, resultId: result.resultId, output });
}

function rejection(reason, mismatches = []) {
  return freezeDeep({
    ok: false,
    code: 'E_ATLAS_PROJECTOR_PUBLICATION_REJECTED',
    reason,
    mismatches: [...mismatches].sort(),
  });
}

export function assessAtlasProjectorResultForPublication(input) {
  assertExactDataObject(input, PUBLICATION_INPUT_KEYS, 'E_ATLAS_PROJECTOR_PUBLICATION_INPUT_INVALID');
  const activeJob = verifyAtlasProjectorJob(input.activeJob);
  const result = verifyAtlasProjectorResult(input.result);
  const currentSnapshot = verifyAtlasBookSnapshot(input.currentSnapshot);
  const currentGeneration = assertGeneration(
    input.currentGeneration,
    'E_ATLAS_PROJECTOR_CURRENT_GENERATION_INVALID',
  );
  const resultMismatches = [];
  for (const key of [
    'jobId',
    'projectorId',
    'generation',
    'projectId',
    'projectRevisionId',
    'snapshotId',
    'orderDigest',
    'dependencyDigest',
  ]) {
    if (result[key] !== activeJob[key]) resultMismatches.push(key);
  }
  if (resultMismatches.length > 0) return rejection('RESULT_JOB_IDENTITY_MISMATCH', resultMismatches);
  if (currentGeneration !== activeJob.generation) return rejection('GENERATION_STALE', ['generation']);
  const snapshotMismatches = [];
  for (const key of [
    'projectId',
    'projectRevisionId',
    'snapshotId',
    'orderDigest',
    'dependencyDigest',
  ]) {
    if (currentSnapshot[key] !== activeJob[key]) snapshotMismatches.push(key);
  }
  if (snapshotMismatches.length > 0) return rejection('SNAPSHOT_STALE', snapshotMismatches);
  return freezeDeep({
    ok: true,
    code: 'ATLAS_PROJECTOR_PUBLICATION_ACCEPTED',
    jobId: activeJob.jobId,
    resultId: result.resultId,
    snapshotId: currentSnapshot.snapshotId,
    generation: currentGeneration,
  });
}

function buildPublication(result) {
  const identity = {
    schemaVersion: ATLAS_PROJECTOR_PUBLICATION_SCHEMA_VERSION,
    resultId: result.resultId,
    jobId: result.jobId,
    projectorId: result.projectorId,
    generation: result.generation,
    projectId: result.projectId,
    projectRevisionId: result.projectRevisionId,
    snapshotId: result.snapshotId,
    orderDigest: result.orderDigest,
    dependencyDigest: result.dependencyDigest,
    outputDigest: result.outputDigest,
  };
  return freezeDeep({ ...identity, publicationId: digestCanonical(identity), output: result.output });
}

function verifyPublication(publication) {
  assertExactDataObject(publication, PUBLICATION_KEYS, 'E_ATLAS_PROJECTOR_PUBLICATION_INVALID');
  if (publication.schemaVersion !== ATLAS_PROJECTOR_PUBLICATION_SCHEMA_VERSION) {
    fail('E_ATLAS_PROJECTOR_PUBLICATION_SCHEMA');
  }
  const result = verifyAtlasProjectorResult({
    schemaVersion: ATLAS_PROJECTOR_RESULT_SCHEMA_VERSION,
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
    output: publication.output,
  });
  const rebuilt = buildPublication(result);
  if (hashCanonicalValue(publication) !== hashCanonicalValue(rebuilt)) {
    fail('E_ATLAS_PROJECTOR_PUBLICATION_DIGEST_MISMATCH');
  }
  return rebuilt;
}

export function verifyAtlasProjectorPublication(publication) {
  return verifyPublication(publication);
}

export function createAtlasProjectorPublicationCell(initialPublication = null) {
  let current = initialPublication === null ? null : verifyPublication(initialPublication);
  return Object.freeze({
    read() {
      return current;
    },
    publish(input) {
      const assessment = assessAtlasProjectorResultForPublication(input);
      if (!assessment.ok) {
        return freezeDeep({ published: false, assessment, current });
      }
      const next = buildPublication(verifyAtlasProjectorResult(input.result));
      current = next;
      return freezeDeep({ published: true, assessment, current });
    },
  });
}
