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

function stableJson(value) {
  return JSON.stringify(value, Object.keys(value || {}).sort());
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
    sourceDocxSha256: input.sourceDocxSha256,
    returnedDocxSha256: input.returnedDocxSha256,
    projectRecoveryRevision: typeof input.projectRecoveryRevision === 'string' ? input.projectRecoveryRevision : '',
    oracleDigest: input.oracleDigest,
    checkpointDigest: '',
    completedAtUtc: typeof input.completedAtUtc === 'string' ? input.completedAtUtc : new Date().toISOString(),
  };
  checkpoint.checkpointDigest = sha256Text(stableJson({ ...checkpoint, checkpointDigest: '' }));
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

export function readC5V2ResumeState(checkpointDir, { ledgerDigest, roundPlan } = {}) {
  const files = fs.existsSync(checkpointDir)
    ? fs.readdirSync(checkpointDir).filter((name) => name.endsWith('.json')).sort()
    : [];
  const completedChunks = [];
  const completedOperationIds = new Set();
  for (const name of files) {
    const parsed = JSON.parse(fs.readFileSync(path.join(checkpointDir, name), 'utf8'));
    if (parsed.schemaVersion !== C5V2_CHUNK_CHECKPOINT_SCHEMA) continue;
    if (ledgerDigest && parsed.ledgerDigest !== ledgerDigest) continue;
    completedChunks.push({
      file: name,
      roundId: parsed.roundId,
      chunkId: parsed.chunkId,
      attemptId: parsed.attemptId,
      checkpointDigest: parsed.checkpointDigest,
      completedOperationIds: parsed.completedOperationIds,
    });
    for (const operationId of parsed.completedOperationIds || []) {
      completedOperationIds.add(operationId);
    }
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
