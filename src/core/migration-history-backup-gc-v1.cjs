'use strict';

// R2.4 R6_MIGRATION_HISTORY_BACKUP_GC — bounded migration, checkpoint
// backup/restore, quarantine and retention-GC protocol for Product Core.
// Callers provide explicit project/store paths; this module never derives
// authority from renderer state, UI visibility or external payloads.

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const { durableSaveTransaction } = require('./save-coordinator-v1.cjs');

const R6_SCHEMA_VERSION = 'yalken.migrationHistoryBackupGc.v1';
const HISTORY_BASENAME = 'migration-history.v1.jsonl';
const INDEX_BASENAME = 'migration-index.v1.json';
const CHECKPOINT_DIRNAME = 'checkpoints';
const QUARANTINE_DIRNAME = 'quarantine';
const GENESIS_DIGEST = '0'.repeat(64);
const DEFAULT_MAX_HISTORY_RECORDS = 2048;

const HISTORY_KINDS = Object.freeze([
  'migration.applied',
  'backup.restored',
  'quarantine.created',
  'gc.completed',
]);

class MigrationHistoryError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
  }
}

const sha256hex = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const projectPathHash = (projectPath) => sha256hex(Buffer.from(path.resolve(projectPath), 'utf8'));
const nowIso = () => new Date().toISOString();

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function sortJsonValue(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new MigrationHistoryError('E_R6_JSON_VALUE_INVALID');
    return value;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new MigrationHistoryError('E_R6_JSON_VALUE_INVALID', 'cycle');
    seen.add(value);
    const sorted = value.map((item) => sortJsonValue(item, seen));
    seen.delete(value);
    return sorted;
  }
  if (isPlainObject(value)) {
    if (seen.has(value)) throw new MigrationHistoryError('E_R6_JSON_VALUE_INVALID', 'cycle');
    seen.add(value);
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      const child = value[key];
      if (child === undefined || typeof child === 'function' || typeof child === 'symbol') {
        throw new MigrationHistoryError('E_R6_JSON_VALUE_INVALID', key);
      }
      sorted[key] = sortJsonValue(child, seen);
    }
    seen.delete(value);
    return sorted;
  }
  throw new MigrationHistoryError('E_R6_JSON_VALUE_INVALID');
}

function serializeJson(value) {
  return `${JSON.stringify(sortJsonValue(value), null, 2)}\n`;
}

function requirePathText(value, code) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new MigrationHistoryError(code);
  return text;
}

function ensureStoreDirs(storeDir) {
  const root = requirePathText(storeDir, 'E_R6_STORE_DIR_REQUIRED');
  fs.mkdirSync(path.join(root, CHECKPOINT_DIRNAME), { recursive: true });
  fs.mkdirSync(path.join(root, QUARANTINE_DIRNAME), { recursive: true });
  return root;
}

function emptyIndex() {
  return {
    schemaVersion: R6_SCHEMA_VERSION,
    nextSequence: 1,
    checkpoints: [],
    quarantines: [],
  };
}

function assertIndexShape(index) {
  if (!isPlainObject(index)) throw new MigrationHistoryError('E_R6_INDEX_SHAPE');
  if (index.schemaVersion !== R6_SCHEMA_VERSION) throw new MigrationHistoryError('E_R6_INDEX_SCHEMA');
  if (!Number.isInteger(index.nextSequence) || index.nextSequence < 1) throw new MigrationHistoryError('E_R6_INDEX_SEQUENCE');
  if (!Array.isArray(index.checkpoints) || !Array.isArray(index.quarantines)) throw new MigrationHistoryError('E_R6_INDEX_SHAPE');
}

function readIndex(storeDir) {
  const indexPath = path.join(storeDir, INDEX_BASENAME);
  if (!fs.existsSync(indexPath)) return emptyIndex();
  let index;
  try {
    index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  } catch (error) {
    throw new MigrationHistoryError('E_R6_INDEX_CORRUPT', error.message);
  }
  assertIndexShape(index);
  return index;
}

async function writeIndex(storeDir, index) {
  assertIndexShape(index);
  await durableSaveTransaction({
    filePath: path.join(storeDir, INDEX_BASENAME),
    content: serializeJson(index),
    revision: index.nextSequence,
  });
}

function checkpointPath(storeDir, checkpointId) {
  return path.join(storeDir, CHECKPOINT_DIRNAME, `${checkpointId}.json`);
}

function quarantinePath(storeDir, quarantineId) {
  return path.join(storeDir, QUARANTINE_DIRNAME, `${quarantineId}.json`);
}

function normalizeCheckpointId(checkpointId) {
  const id = typeof checkpointId === 'string' ? checkpointId.trim() : '';
  if (!/^r6-cp-[1-9][0-9]*-[0-9a-f]{12}$/.test(id)) throw new MigrationHistoryError('E_R6_CHECKPOINT_ID_INVALID');
  return id;
}

function normalizeProjectDocument(raw, source) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new MigrationHistoryError('E_R6_PROJECT_JSON_INVALID', `${source}:${error.message}`);
  }
  if (!isPlainObject(parsed)) throw new MigrationHistoryError('E_R6_PROJECT_SHAPE', source);
  if (typeof parsed.projectId !== 'string' || parsed.projectId.trim().length === 0) {
    throw new MigrationHistoryError('E_R6_PROJECT_ID_REQUIRED', source);
  }
  if (typeof parsed.schemaVersion !== 'string' || parsed.schemaVersion.trim().length === 0) {
    throw new MigrationHistoryError('E_R6_PROJECT_VERSION_REQUIRED', source);
  }
  return parsed;
}

function normalizeMigrations(migrations) {
  if (!Array.isArray(migrations) || migrations.length === 0) throw new MigrationHistoryError('E_R6_MIGRATIONS_REQUIRED');
  return migrations.map((migration, index) => {
    if (!isPlainObject(migration)) throw new MigrationHistoryError('E_R6_MIGRATION_SHAPE', String(index));
    const id = typeof migration.id === 'string' ? migration.id.trim() : '';
    const fromVersion = typeof migration.fromVersion === 'string' ? migration.fromVersion.trim() : '';
    const toVersion = typeof migration.toVersion === 'string' ? migration.toVersion.trim() : '';
    if (!id || !fromVersion || !toVersion) throw new MigrationHistoryError('E_R6_MIGRATION_IDENTITY_REQUIRED', String(index));
    if (fromVersion === toVersion) throw new MigrationHistoryError('E_R6_MIGRATION_SELF_LOOP', id);
    if (typeof migration.apply !== 'function') throw new MigrationHistoryError('E_R6_MIGRATION_APPLY_REQUIRED', id);
    return Object.freeze({ id, fromVersion, toVersion, apply: migration.apply });
  });
}

function buildMigrationChain(currentVersion, targetVersion, migrations) {
  const target = typeof targetVersion === 'string' ? targetVersion.trim() : '';
  if (!target) throw new MigrationHistoryError('E_R6_TARGET_VERSION_REQUIRED');
  const normalized = normalizeMigrations(migrations);
  const byFrom = new Map();
  for (const migration of normalized) {
    if (byFrom.has(migration.fromVersion)) throw new MigrationHistoryError('E_R6_MIGRATION_AMBIGUOUS', migration.fromVersion);
    byFrom.set(migration.fromVersion, migration);
  }
  const chain = [];
  const seen = new Set();
  let cursor = currentVersion;
  while (cursor !== target) {
    if (seen.has(cursor)) throw new MigrationHistoryError('E_R6_MIGRATION_CYCLE', cursor);
    seen.add(cursor);
    const step = byFrom.get(cursor);
    if (!step) throw new MigrationHistoryError('E_R6_MIGRATION_STEP_MISSING', `${cursor}->${target}`);
    chain.push(step);
    cursor = step.toVersion;
  }
  return chain;
}

function historyEntryDigest(entry) {
  const { seq, kind, projectId, projectPathDigest, checkpointId, sourceVersion, targetVersion, sourceDigest, targetDigest, prevDigest, payload } = entry;
  return sha256hex(Buffer.from(JSON.stringify({
    seq,
    kind,
    projectId,
    projectPathDigest,
    checkpointId,
    sourceVersion,
    targetVersion,
    sourceDigest,
    targetDigest,
    prevDigest,
    payload,
  }), 'utf8'));
}

function validateHistoryEntry(entry, expectedSeq, prevDigest) {
  if (!isPlainObject(entry)) throw new MigrationHistoryError('E_R6_HISTORY_LOG_CORRUPT', 'shape');
  if (entry.schemaVersion !== R6_SCHEMA_VERSION) throw new MigrationHistoryError('E_R6_HISTORY_LOG_CORRUPT', 'schema');
  if (entry.seq !== expectedSeq) throw new MigrationHistoryError('E_R6_HISTORY_SEQ', String(entry.seq));
  if (!HISTORY_KINDS.includes(entry.kind)) throw new MigrationHistoryError('E_R6_HISTORY_KIND', String(entry.kind));
  if (entry.prevDigest !== prevDigest) throw new MigrationHistoryError('E_R6_HISTORY_CHAIN', String(entry.seq));
  if (historyEntryDigest(entry) !== entry.digest) throw new MigrationHistoryError('E_R6_HISTORY_DIGEST', String(entry.seq));
}

function serializeHistory(records) {
  return records.map((record) => JSON.stringify(record)).join('\n') + (records.length > 0 ? '\n' : '');
}

function parseHistoryText(raw) {
  const records = [];
  let expectedSeq = 1;
  let prevDigest = GENESIS_DIGEST;
  let tornTail = false;
  const lines = raw.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === '') {
      if (index === lines.length - 1) continue;
      throw new MigrationHistoryError('E_R6_HISTORY_LOG_CORRUPT', 'empty-line');
    }
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      if (index === lines.length - 1) {
        tornTail = true;
        break;
      }
      throw new MigrationHistoryError('E_R6_HISTORY_LOG_CORRUPT', 'invalid-json');
    }
    validateHistoryEntry(parsed, expectedSeq, prevDigest);
    records.push(parsed);
    prevDigest = parsed.digest;
    expectedSeq += 1;
  }
  return { records, tornTail };
}

async function readHistory(storeDir) {
  const historyPath = path.join(storeDir, HISTORY_BASENAME);
  if (!fs.existsSync(historyPath)) return { records: [], tornTailTruncated: false };
  const parsed = parseHistoryText(fs.readFileSync(historyPath, 'utf8'));
  if (parsed.tornTail) {
    await durableSaveTransaction({ filePath: historyPath, content: serializeHistory(parsed.records), revision: parsed.records.length });
  }
  return { records: parsed.records, tornTailTruncated: parsed.tornTail };
}

async function appendHistory(storeDir, partial, { maxHistoryRecords = DEFAULT_MAX_HISTORY_RECORDS } = {}) {
  if (!Number.isInteger(maxHistoryRecords) || maxHistoryRecords < 1) {
    throw new MigrationHistoryError('E_R6_HISTORY_BOUND_INVALID');
  }
  const { records } = await readHistory(storeDir);
  if (records.length >= maxHistoryRecords) throw new MigrationHistoryError('E_R6_HISTORY_COMPACTION_REQUIRED');
  const prevDigest = records.length > 0 ? records[records.length - 1].digest : GENESIS_DIGEST;
  const entry = {
    schemaVersion: R6_SCHEMA_VERSION,
    seq: records.length + 1,
    kind: partial.kind,
    projectId: partial.projectId,
    projectPathDigest: partial.projectPathDigest,
    checkpointId: partial.checkpointId || null,
    sourceVersion: partial.sourceVersion || null,
    targetVersion: partial.targetVersion || null,
    sourceDigest: partial.sourceDigest || null,
    targetDigest: partial.targetDigest || null,
    prevDigest,
    payload: sortJsonValue(partial.payload || null),
  };
  if (!HISTORY_KINDS.includes(entry.kind)) throw new MigrationHistoryError('E_R6_HISTORY_KIND', String(entry.kind));
  entry.digest = historyEntryDigest(entry);
  const next = [...records, entry];
  await durableSaveTransaction({
    filePath: path.join(storeDir, HISTORY_BASENAME),
    content: serializeHistory(next),
    revision: entry.seq,
  });
  return Object.freeze({ ...entry });
}

async function createCheckpoint({ storeDir, projectPath, rawContent, project, now = nowIso() }) {
  const index = readIndex(storeDir);
  const sequence = index.nextSequence;
  const checkpointId = `r6-cp-${sequence}-${sha256hex(Buffer.from(`${project.projectId}:${sequence}:${rawContent}`, 'utf8')).slice(0, 12)}`;
  const digest = sha256hex(Buffer.from(rawContent, 'utf8'));
  const record = {
    checkpointId,
    sequence,
    projectId: project.projectId,
    projectPathDigest: projectPathHash(projectPath),
    sourceVersion: project.schemaVersion,
    sourceDigest: digest,
    bytes: Buffer.byteLength(rawContent, 'utf8'),
    createdAt: now,
  };
  await durableSaveTransaction({ filePath: checkpointPath(storeDir, checkpointId), content: rawContent, revision: sequence });
  index.checkpoints.push(record);
  index.nextSequence += 1;
  await writeIndex(storeDir, index);
  return Object.freeze({ ...record });
}

async function quarantineProjectSource({ projectPath, storeDir, reason, now = nowIso() }) {
  const root = ensureStoreDirs(storeDir);
  const targetPath = requirePathText(projectPath, 'E_R6_PROJECT_PATH_REQUIRED');
  const rawContent = fs.readFileSync(targetPath, 'utf8');
  const index = readIndex(root);
  const sequence = index.nextSequence;
  const sourceDigest = sha256hex(Buffer.from(rawContent, 'utf8'));
  const quarantineId = `r6-quarantine-${sequence}-${sourceDigest.slice(0, 12)}`;
  const record = {
    quarantineId,
    sequence,
    projectPathDigest: projectPathHash(targetPath),
    sourceDigest,
    reason: typeof reason === 'string' && reason ? reason : 'UNSPECIFIED',
    bytes: Buffer.byteLength(rawContent, 'utf8'),
    createdAt: now,
  };
  await durableSaveTransaction({ filePath: quarantinePath(root, quarantineId), content: rawContent, revision: sequence });
  index.quarantines.push(record);
  index.nextSequence += 1;
  await writeIndex(root, index);
  await appendHistory(root, {
    kind: 'quarantine.created',
    projectId: null,
    projectPathDigest: record.projectPathDigest,
    checkpointId: null,
    sourceDigest,
    payload: { quarantineId, reason: record.reason },
  });
  return Object.freeze({ ...record });
}

async function migrateProjectFile({
  projectPath,
  storeDir,
  targetVersion,
  migrations,
  now = nowIso(),
  fsAdapter = fsp,
  retainCheckpoints = null,
} = {}) {
  const root = ensureStoreDirs(storeDir);
  const targetPath = requirePathText(projectPath, 'E_R6_PROJECT_PATH_REQUIRED');
  let rawContent;
  try {
    rawContent = fs.readFileSync(targetPath, 'utf8');
  } catch (error) {
    throw new MigrationHistoryError('E_R6_PROJECT_READ_FAILED', error.message);
  }
  let project;
  try {
    project = normalizeProjectDocument(rawContent, targetPath);
  } catch (error) {
    if (error instanceof MigrationHistoryError && error.code === 'E_R6_PROJECT_JSON_INVALID') {
      const quarantine = await quarantineProjectSource({ projectPath: targetPath, storeDir: root, reason: error.code, now });
      return Object.freeze({ success: false, quarantined: true, error: { code: error.code }, quarantine });
    }
    throw error;
  }

  if (project.schemaVersion === targetVersion) {
    return Object.freeze({
      success: true,
      noop: true,
      projectId: project.projectId,
      sourceVersion: project.schemaVersion,
      targetVersion,
    });
  }

  const chain = buildMigrationChain(project.schemaVersion, targetVersion, migrations);
  const checkpoint = await createCheckpoint({ storeDir: root, projectPath: targetPath, rawContent, project, now });
  let current = sortJsonValue(project);
  for (const step of chain) {
    const next = step.apply(sortJsonValue(current));
    if (!isPlainObject(next)) throw new MigrationHistoryError('E_R6_MIGRATION_OUTPUT_SHAPE', step.id);
    if (next.projectId !== project.projectId) throw new MigrationHistoryError('E_R6_MIGRATION_PROJECT_ID_CHANGED', step.id);
    if (next.schemaVersion !== step.toVersion) throw new MigrationHistoryError('E_R6_MIGRATION_VERSION_MISMATCH', step.id);
    current = sortJsonValue(next);
  }
  if (current.schemaVersion !== targetVersion) throw new MigrationHistoryError('E_R6_MIGRATION_TARGET_NOT_REACHED', targetVersion);

  const targetContent = serializeJson(current);
  const targetDigest = sha256hex(Buffer.from(targetContent, 'utf8'));
  await durableSaveTransaction({ filePath: targetPath, content: targetContent, revision: checkpoint.sequence, fsAdapter });
  const history = await appendHistory(root, {
    kind: 'migration.applied',
    projectId: project.projectId,
    projectPathDigest: checkpoint.projectPathDigest,
    checkpointId: checkpoint.checkpointId,
    sourceVersion: checkpoint.sourceVersion,
    targetVersion,
    sourceDigest: checkpoint.sourceDigest,
    targetDigest,
    payload: { migrationIds: chain.map((step) => step.id) },
  });
  let gc = null;
  if (retainCheckpoints !== null && retainCheckpoints !== undefined) {
    gc = await garbageCollectCheckpoints({ storeDir: root, retainLast: retainCheckpoints, now });
  }
  return Object.freeze({
    success: true,
    noop: false,
    projectId: project.projectId,
    sourceVersion: checkpoint.sourceVersion,
    targetVersion,
    checkpoint,
    targetDigest,
    migrationIds: Object.freeze(chain.map((step) => step.id)),
    history,
    gc,
  });
}

async function restoreCheckpoint({
  projectPath,
  storeDir,
  checkpointId,
  now = nowIso(),
  fsAdapter = fsp,
} = {}) {
  const root = ensureStoreDirs(storeDir);
  const targetPath = requirePathText(projectPath, 'E_R6_PROJECT_PATH_REQUIRED');
  const id = normalizeCheckpointId(checkpointId);
  const index = readIndex(root);
  const record = index.checkpoints.find((checkpoint) => checkpoint.checkpointId === id);
  if (!record) throw new MigrationHistoryError('E_R6_CHECKPOINT_UNKNOWN', id);
  if (record.projectPathDigest !== projectPathHash(targetPath)) throw new MigrationHistoryError('E_R6_CHECKPOINT_TARGET_MISMATCH', id);
  const rawContent = fs.readFileSync(checkpointPath(root, id), 'utf8');
  const digest = sha256hex(Buffer.from(rawContent, 'utf8'));
  if (digest !== record.sourceDigest) throw new MigrationHistoryError('E_R6_CHECKPOINT_DIGEST_MISMATCH', id);
  await durableSaveTransaction({ filePath: targetPath, content: rawContent, revision: record.sequence, fsAdapter });
  const history = await appendHistory(root, {
    kind: 'backup.restored',
    projectId: record.projectId,
    projectPathDigest: record.projectPathDigest,
    checkpointId: id,
    sourceVersion: record.sourceVersion,
    targetVersion: record.sourceVersion,
    sourceDigest: record.sourceDigest,
    targetDigest: record.sourceDigest,
    payload: { restoredAt: now },
  });
  return Object.freeze({ success: true, checkpoint: Object.freeze({ ...record }), history });
}

async function garbageCollectCheckpoints({ storeDir, retainLast, now = nowIso() } = {}) {
  const root = ensureStoreDirs(storeDir);
  if (!Number.isInteger(retainLast) || retainLast < 1) throw new MigrationHistoryError('E_R6_GC_RETAIN_INVALID');
  const index = readIndex(root);
  const sorted = index.checkpoints.slice().sort((a, b) => a.sequence - b.sequence);
  const keep = new Set(sorted.slice(-retainLast).map((record) => record.checkpointId));
  const deleted = [];
  for (const record of sorted) {
    if (keep.has(record.checkpointId)) continue;
    const filePath = checkpointPath(root, record.checkpointId);
    if (!fs.existsSync(filePath)) throw new MigrationHistoryError('E_R6_CHECKPOINT_FILE_MISSING', record.checkpointId);
    await fsp.unlink(filePath);
    deleted.push(record.checkpointId);
  }
  index.checkpoints = index.checkpoints.filter((record) => keep.has(record.checkpointId));
  await writeIndex(root, index);
  const history = await appendHistory(root, {
    kind: 'gc.completed',
    projectId: null,
    projectPathDigest: null,
    checkpointId: null,
    payload: { retainLast, deleted, completedAt: now },
  });
  return Object.freeze({
    success: true,
    retained: index.checkpoints.length,
    deleted: Object.freeze(deleted),
    history,
  });
}

async function replayMigrationHistory(storeDir) {
  const root = ensureStoreDirs(storeDir);
  const history = await readHistory(root);
  const index = readIndex(root);
  return Object.freeze({
    schemaVersion: R6_SCHEMA_VERSION,
    tornTailTruncated: history.tornTailTruncated,
    historyCount: history.records.length,
    checkpoints: Object.freeze(index.checkpoints.map((record) => Object.freeze({ ...record }))),
    quarantines: Object.freeze(index.quarantines.map((record) => Object.freeze({ ...record }))),
    lastRecord: history.records.length > 0 ? Object.freeze({ ...history.records[history.records.length - 1] }) : null,
  });
}

module.exports = Object.freeze({
  R6_SCHEMA_VERSION,
  HISTORY_BASENAME,
  INDEX_BASENAME,
  CHECKPOINT_DIRNAME,
  QUARANTINE_DIRNAME,
  HISTORY_KINDS,
  GENESIS_DIGEST,
  MigrationHistoryError,
  buildMigrationChain,
  parseHistoryText,
  migrateProjectFile,
  restoreCheckpoint,
  garbageCollectCheckpoints,
  quarantineProjectSource,
  replayMigrationHistory,
});
