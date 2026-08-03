#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { C5V2_LEDGER_SCHEMA } from './rtk-word-c5v2-ledger-engine.mjs';

const __filename = fileURLToPath(import.meta.url);

export const C5V2_ROUND_RUNNER_SCHEMA = 'yalken.rtk.word.c5v2.fullbook-round-runner.v1';
export const C5V2_CHUNK_CHECKPOINT_SCHEMA = 'yalken.rtk.word.c5v2.fullbook-chunk-checkpoint.v1';
export const C5V2_FULL_MANUSCRIPT_PRODUCT_COMMAND_ID = 'cmd.project.review.exportFullManuscriptDocxReviewPacket';

function sha256Text(value) {
  return `sha256:${crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex')}`;
}

function sha256Bytes(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function assertSha256Digest(value, code) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw new Error(code);
  }
}

function arraysEqual(left = [], right = []) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function checkpointDigest(checkpoint) {
  return sha256Text(stableJson({ ...checkpoint, checkpointDigest: '' }));
}

function roundIdFor(round) {
  return `round-${String(round).padStart(2, '0')}`;
}

function indexRoundPlan(roundPlan) {
  const chunks = new Map();
  if (!roundPlan) return chunks;
  if (!Array.isArray(roundPlan.rounds)) throw new Error('C5V2_RESUME_ROUND_PLAN_INVALID');
  for (const round of roundPlan.rounds) {
    if (!Number.isInteger(round.round) || !Array.isArray(round.chunks)) {
      throw new Error('C5V2_RESUME_ROUND_PLAN_INVALID');
    }
    for (const chunk of round.chunks) {
      if (typeof chunk.chunkId !== 'string' || !chunk.chunkId) {
        throw new Error('C5V2_RESUME_ROUND_PLAN_CHUNK_INVALID');
      }
      chunks.set(chunk.chunkId, {
        ...chunk,
        expectedRoundId: roundIdFor(round.round),
      });
    }
  }
  return chunks;
}

function assertArtifactHash(checkpoint, pathKey, hashKey, requireArtifactPaths) {
  const artifactPath = checkpoint[pathKey];
  if (typeof artifactPath !== 'string' || !artifactPath.trim()) {
    if (requireArtifactPaths) throw new Error(`C5V2_CHECKPOINT_${pathKey.toUpperCase()}_REQUIRED`);
    return;
  }
  if (!fs.existsSync(artifactPath) || !fs.statSync(artifactPath).isFile()) {
    throw new Error(`C5V2_CHECKPOINT_${pathKey.toUpperCase()}_MISSING`);
  }
  const actual = sha256Bytes(fs.readFileSync(artifactPath));
  if (actual !== checkpoint[hashKey]) {
    throw new Error(`C5V2_CHECKPOINT_${hashKey.toUpperCase()}_MISMATCH`);
  }
}

function validateCheckpointRecord(parsed, context) {
  const {
    ledgerDigest,
    exactHead,
    runId,
    chunkIndex,
    completedOperationIds,
    requireArtifactPaths,
  } = context;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('C5V2_CHECKPOINT_RECORD_INVALID');
  }
  if (parsed.schemaVersion !== C5V2_CHUNK_CHECKPOINT_SCHEMA) {
    throw new Error('C5V2_CHECKPOINT_SCHEMA_INVALID');
  }
  assertSha256Digest(parsed.ledgerDigest, 'C5V2_CHECKPOINT_LEDGER_DIGEST_INVALID');
  assertSha256Digest(parsed.immutableLedgerDigest, 'C5V2_CHECKPOINT_IMMUTABLE_LEDGER_DIGEST_INVALID');
  if (parsed.ledgerDigest !== parsed.immutableLedgerDigest) {
    throw new Error('C5V2_CHECKPOINT_IMMUTABLE_LEDGER_DIGEST_MISMATCH');
  }
  if (ledgerDigest && parsed.ledgerDigest !== ledgerDigest) {
    throw new Error('C5V2_CHECKPOINT_LEDGER_DIGEST_MISMATCH');
  }
  if (exactHead && parsed.exactHead !== exactHead) {
    throw new Error('C5V2_CHECKPOINT_HEAD_MISMATCH');
  }
  if (runId && parsed.runId !== runId) {
    throw new Error('C5V2_CHECKPOINT_RUN_ID_MISMATCH');
  }
  assertSha256Digest(parsed.sourceDocxSha256, 'C5V2_CHECKPOINT_SOURCE_DOCX_SHA_INVALID');
  assertSha256Digest(parsed.returnedDocxSha256, 'C5V2_CHECKPOINT_RETURNED_DOCX_SHA_INVALID');
  assertSha256Digest(parsed.oracleDigest, 'C5V2_CHECKPOINT_ORACLE_DIGEST_INVALID');
  assertSha256Digest(parsed.checkpointDigest, 'C5V2_CHECKPOINT_DIGEST_INVALID');
  if (checkpointDigest(parsed) !== parsed.checkpointDigest) {
    throw new Error('C5V2_CHECKPOINT_DIGEST_MISMATCH');
  }
  const expectedChunk = chunkIndex.get(parsed.chunkId);
  if (chunkIndex.size > 0 && !expectedChunk) {
    throw new Error('C5V2_CHECKPOINT_CHUNK_NOT_IN_ROUND_PLAN');
  }
  if (expectedChunk) {
    if (parsed.roundId !== expectedChunk.expectedRoundId) {
      throw new Error('C5V2_CHECKPOINT_ROUND_MISMATCH');
    }
    if (!arraysEqual(parsed.completedOperationIds, expectedChunk.operationIds)) {
      throw new Error('C5V2_CHECKPOINT_OPERATION_IDS_MISMATCH');
    }
    if (!arraysEqual(parsed.requestKeys, expectedChunk.requestKeys)) {
      throw new Error('C5V2_CHECKPOINT_REQUEST_KEYS_MISMATCH');
    }
    if (!arraysEqual(parsed.effectKeys, expectedChunk.effectKeys)) {
      throw new Error('C5V2_CHECKPOINT_EFFECT_KEYS_MISMATCH');
    }
  }
  for (const operationId of parsed.completedOperationIds || []) {
    if (completedOperationIds.has(operationId)) {
      throw new Error('C5V2_CHECKPOINT_DUPLICATE_OPERATION_ID');
    }
    completedOperationIds.add(operationId);
  }
  assertArtifactHash(parsed, 'sourceDocxPath', 'sourceDocxSha256', requireArtifactPaths);
  assertArtifactHash(parsed, 'returnedDocxPath', 'returnedDocxSha256', requireArtifactPaths);
}

function assertLedger(ledger) {
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) {
    throw new Error('C5V2_LEDGER_REQUIRED');
  }
  if (ledger.schemaVersion !== C5V2_LEDGER_SCHEMA) {
    throw new Error('C5V2_LEDGER_SCHEMA_INVALID');
  }
  if (ledger.gates?.ok !== true) {
    throw new Error('C5V2_LEDGER_GATES_NOT_GREEN');
  }
  if (ledger.topology !== 'one-full-manuscript-project-cumulative-rounds') {
    throw new Error('C5V2_LEDGER_TOPOLOGY_NOT_FULL_MANUSCRIPT_CUMULATIVE');
  }
  if (!Array.isArray(ledger.operations) || ledger.operations.length === 0) {
    throw new Error('C5V2_LEDGER_OPERATIONS_REQUIRED');
  }
  if (typeof ledger.ledgerDigest !== 'string' || !ledger.ledgerDigest.startsWith('sha256:')) {
    throw new Error('C5V2_LEDGER_DIGEST_REQUIRED');
  }
}

function groupByRound(operations, roundCount) {
  const rounds = new Map();
  for (let round = 1; round <= roundCount; round += 1) {
    rounds.set(round, []);
  }
  for (const operation of operations) {
    if (!operation || typeof operation !== 'object') continue;
    if (operation.family === 'negative_probe') continue;
    const round = Number.isInteger(operation.round) && operation.round >= 1 && operation.round <= roundCount
      ? operation.round
      : ((rounds.size % roundCount) + 1);
    rounds.get(round).push(operation);
  }
  return rounds;
}

export function buildC5V2RoundPlan(ledger, options = {}) {
  assertLedger(ledger);
  const roundCount = Number.isInteger(options.roundCount) && options.roundCount > 0 ? options.roundCount : ledger.roundCount || 5;
  const chunkSize = Number.isInteger(options.chunkSize) && options.chunkSize > 0 ? options.chunkSize : 100;
  const rounds = groupByRound(ledger.operations, roundCount);
  const roundPlans = [];
  const cumulativeCompletedOperationIds = [];
  for (let round = 1; round <= roundCount; round += 1) {
    const operations = rounds.get(round) || [];
    const chunks = [];
    for (let start = 0; start < operations.length; start += chunkSize) {
      const chunkOps = operations.slice(start, start + chunkSize);
      const chunkId = `round-${String(round).padStart(2, '0')}-chunk-${String(chunks.length + 1).padStart(3, '0')}`;
      chunks.push({
        chunkId,
        round,
        attemptPolicy: 'partial-chunk-reruns-with-new-attempt-id',
        operationIds: chunkOps.map((operation) => operation.id),
        requestKeys: chunkOps.map((operation) => `request:${operation.id}`),
        effectKeys: chunkOps.map((operation) => `effect:${operation.id}`),
      });
    }
    cumulativeCompletedOperationIds.push(...operations.map((operation) => operation.id));
    roundPlans.push({
      round,
      sourceProductCommandId: C5V2_FULL_MANUSCRIPT_PRODUCT_COMMAND_ID,
      route: [
        'product-ui-command-export',
        'physical-word-open-edit-native-save',
        'authenticated-intake-quarantine-preview',
        'explicit-decision',
        'command-kernel-apply',
        'atomic-recovery',
        'close-reopen',
        'canonical-readback',
        'replay',
      ],
      operationCount: operations.length,
      cumulativeOperationCount: cumulativeCompletedOperationIds.length,
      chunks,
    });
  }
  const negativeForks = ledger.operations
    .filter((operation) => operation.family === 'negative_probe')
    .map((operation) => ({
      operationId: operation.id,
      isolatedFork: true,
      sceneId: operation.sceneId,
      expectedOutcome: operation.expectedOutcome || 'REJECT',
    }));
  return {
    schemaVersion: C5V2_ROUND_RUNNER_SCHEMA,
    topology: 'single-21-scene-project-one-full-book-docx-per-editorial-round',
    productExportCommandId: C5V2_FULL_MANUSCRIPT_PRODUCT_COMMAND_ID,
    ledgerDigest: ledger.ledgerDigest,
    roundCount,
    chunkSize,
    rounds: roundPlans,
    negativeForks,
    cumulativePositiveOperationCount: cumulativeCompletedOperationIds.length,
  };
}

function fsyncFileWriteJsonAtomic(filePath, payload) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  const data = `${JSON.stringify(payload, null, 2)}\n`;
  const fd = fs.openSync(tempPath, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, data, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tempPath, filePath);
  const dirFd = fs.openSync(dir, 'r');
  try {
    fs.fsyncSync(dirFd);
  } finally {
    fs.closeSync(dirFd);
  }
  return {
    path: filePath,
    sha256: sha256Text(data),
  };
}

export function buildC5V2ChunkCheckpoint(input = {}) {
  const requiredStrings = [
    'runId',
    'attemptId',
    'exactHead',
    'ledgerDigest',
    'roundId',
    'chunkId',
    'sourceDocxSha256',
    'returnedDocxSha256',
    'oracleDigest',
  ];
  for (const key of requiredStrings) {
    if (typeof input[key] !== 'string' || !input[key].trim()) {
      throw new Error(`C5V2_CHECKPOINT_${key.toUpperCase()}_REQUIRED`);
    }
  }
  const completedOperationIds = Array.isArray(input.completedOperationIds)
    ? input.completedOperationIds.filter((value) => typeof value === 'string' && value)
    : [];
  if (completedOperationIds.length === 0) {
    throw new Error('C5V2_CHECKPOINT_COMPLETED_OPERATION_IDS_REQUIRED');
  }
  const checkpoint = {
    schemaVersion: C5V2_CHUNK_CHECKPOINT_SCHEMA,
    runId: input.runId,
    attemptId: input.attemptId,
    exactHead: input.exactHead,
    ledgerDigest: input.ledgerDigest,
    immutableLedgerDigest: input.ledgerDigest,
    productExportCommandId: C5V2_FULL_MANUSCRIPT_PRODUCT_COMMAND_ID,
    roundId: input.roundId,
    chunkId: input.chunkId,
    completedOperationIds,
    requestKeys: Array.isArray(input.requestKeys) ? input.requestKeys.filter((value) => typeof value === 'string' && value) : [],
    effectKeys: Array.isArray(input.effectKeys) ? input.effectKeys.filter((value) => typeof value === 'string' && value) : [],
    sourceDocxPath: typeof input.sourceDocxPath === 'string' ? input.sourceDocxPath : '',
    sourceDocxSha256: input.sourceDocxSha256,
    returnedDocxPath: typeof input.returnedDocxPath === 'string' ? input.returnedDocxPath : '',
    returnedDocxSha256: input.returnedDocxSha256,
    projectRecoveryRevision: typeof input.projectRecoveryRevision === 'string' ? input.projectRecoveryRevision : '',
    oracleDigest: input.oracleDigest,
    checkpointDigest: '',
    completedAtUtc: typeof input.completedAtUtc === 'string' ? input.completedAtUtc : new Date().toISOString(),
  };
  checkpoint.checkpointDigest = checkpointDigest(checkpoint);
  return checkpoint;
}

export function writeC5V2ChunkCheckpoint(filePath, input = {}) {
  const checkpoint = buildC5V2ChunkCheckpoint(input);
  const write = fsyncFileWriteJsonAtomic(filePath, checkpoint);
  return {
    checkpoint,
    write,
  };
}

export function readC5V2ResumeState(checkpointDir, { ledgerDigest, roundPlan, exactHead = '', runId = '', requireArtifactPaths = false } = {}) {
  const files = fs.existsSync(checkpointDir)
    ? fs.readdirSync(checkpointDir).filter((name) => name.endsWith('.json')).sort()
    : [];
  const completedChunks = [];
  const completedOperationIds = new Set();
  const chunkIndex = indexRoundPlan(roundPlan);
  for (const name of files) {
    const parsed = JSON.parse(fs.readFileSync(path.join(checkpointDir, name), 'utf8'));
    validateCheckpointRecord(parsed, {
      ledgerDigest,
      exactHead,
      runId,
      chunkIndex,
      completedOperationIds,
      requireArtifactPaths,
    });
    completedChunks.push({
      file: name,
      runId: parsed.runId,
      exactHead: parsed.exactHead,
      roundId: parsed.roundId,
      chunkId: parsed.chunkId,
      attemptId: parsed.attemptId,
      checkpointDigest: parsed.checkpointDigest,
      completedOperationIds: parsed.completedOperationIds,
      requestKeys: parsed.requestKeys,
      effectKeys: parsed.effectKeys,
      sourceDocxSha256: parsed.sourceDocxSha256,
      returnedDocxSha256: parsed.returnedDocxSha256,
      oracleDigest: parsed.oracleDigest,
    });
  }
  let nextChunk = null;
  if (roundPlan && Array.isArray(roundPlan.rounds)) {
    for (const round of roundPlan.rounds) {
      for (const chunk of round.chunks || []) {
        if (!completedChunks.some((completed) => completed.chunkId === chunk.chunkId)) {
          nextChunk = {
            round: round.round,
            chunkId: chunk.chunkId,
            operationIds: chunk.operationIds,
            nextAttemptId: `${chunk.chunkId}-attempt-${String(
              completedChunks.filter((completed) => completed.chunkId === chunk.chunkId).length + 1,
            ).padStart(2, '0')}`,
          };
          break;
        }
      }
      if (nextChunk) break;
    }
  }
  return {
    schemaVersion: 'yalken.rtk.word.c5v2.resume-state.v1',
    ledgerDigest: ledgerDigest || '',
    completedChunks,
    completedOperationIds: [...completedOperationIds].sort(),
    nextChunk,
  };
}

if (process.argv[1] === __filename) {
  console.error('C5V2_ROUND_CHECKPOINT_MODULE_ONLY');
  process.exit(2);
}
