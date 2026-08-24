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
const HEX_64_RE = /^[0-9a-f]{64}$/;
const CHECKPOINT_ID_RE = /^r6-cp-([1-9][0-9]*)-[0-9a-f]{12}$/;
const QUARANTINE_ID_RE = /^r6-quarantine-([1-9][0-9]*)-[0-9a-f]{12}$/;

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

function assertDirectoryNoFollow(directory, code) {
  const resolved = path.resolve(directory);
  const stat = fs.lstatSync(resolved);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new MigrationHistoryError(code, resolved);
  if (fs.realpathSync(resolved) !== resolved) throw new MigrationHistoryError(code, resolved);
  return resolved;
}

function ensureStoreDirs(storeDir) {
  const root = path.resolve(requirePathText(storeDir, 'E_R6_STORE_DIR_REQUIRED'));
  fs.mkdirSync(path.join(root, CHECKPOINT_DIRNAME), { recursive: true });
  fs.mkdirSync(path.join(root, QUARANTINE_DIRNAME), { recursive: true });
  assertDirectoryNoFollow(root, 'E_R6_STORE_PATH_UNSAFE');
  assertDirectoryNoFollow(path.join(root, CHECKPOINT_DIRNAME), 'E_R6_CHECKPOINT_ROOT_UNSAFE');
  assertDirectoryNoFollow(path.join(root, QUARANTINE_DIRNAME), 'E_R6_QUARANTINE_ROOT_UNSAFE');
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

function assertExactRecordKeys(record, expected, code) {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new MigrationHistoryError(code, actual.join(','));
  }
}

function requireIndexText(value, code) {
  if (typeof value !== 'string' || value.trim() === '') throw new MigrationHistoryError(code);
}

function requireIndexDigest(value, code) {
  if (typeof value !== 'string' || !HEX_64_RE.test(value)) throw new MigrationHistoryError(code);
}

function requireIndexTimestamp(value, code) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new MigrationHistoryError(code);
}

function assertIndexRecordIdentity({ record, idKey, idPattern, kind, nextSequence, seenIds, seenSequences }) {
  if (!isPlainObject(record)) throw new MigrationHistoryError(`E_R6_INDEX_${kind}_SHAPE`);
  const id = record[idKey];
  const match = typeof id === 'string' ? idPattern.exec(id) : null;
  if (!match || Number(match[1]) !== record.sequence) {
    throw new MigrationHistoryError(`E_R6_INDEX_${kind}_ID`, String(id));
  }
  if (!Number.isInteger(record.sequence) || record.sequence < 1 || record.sequence >= nextSequence) {
    throw new MigrationHistoryError(`E_R6_INDEX_${kind}_SEQUENCE`, String(record.sequence));
  }
  if (seenIds.has(id)) throw new MigrationHistoryError('E_R6_INDEX_ID_DUPLICATE', id);
  if (seenSequences.has(record.sequence)) {
    throw new MigrationHistoryError('E_R6_INDEX_SEQUENCE_DUPLICATE', String(record.sequence));
  }
  seenIds.add(id);
  seenSequences.add(record.sequence);
}

function assertIndexShape(index) {
  if (!isPlainObject(index)) throw new MigrationHistoryError('E_R6_INDEX_SHAPE');
  assertExactRecordKeys(index, ['schemaVersion', 'nextSequence', 'checkpoints', 'quarantines'], 'E_R6_INDEX_SHAPE');
  if (index.schemaVersion !== R6_SCHEMA_VERSION) throw new MigrationHistoryError('E_R6_INDEX_SCHEMA');
  if (!Number.isInteger(index.nextSequence) || index.nextSequence < 1) {
    throw new MigrationHistoryError('E_R6_INDEX_SEQUENCE');
  }
  if (!Array.isArray(index.checkpoints) || !Array.isArray(index.quarantines)) {
    throw new MigrationHistoryError('E_R6_INDEX_SHAPE');
  }

  const seenIds = new Set();
  const seenSequences = new Set();
  for (const record of index.checkpoints) {
    assertIndexRecordIdentity({
      record,
      idKey: 'checkpointId',
      idPattern: CHECKPOINT_ID_RE,
      kind: 'CHECKPOINT',
      nextSequence: index.nextSequence,
      seenIds,
      seenSequences,
    });
    assertExactRecordKeys(record, [
      'checkpointId',
      'sequence',
      'projectId',
      'projectPathDigest',
      'sourceVersion',
      'sourceDigest',
      'bytes',
      'createdAt',
    ], 'E_R6_INDEX_CHECKPOINT_SHAPE');
    requireIndexText(record.projectId, 'E_R6_INDEX_CHECKPOINT_PROJECT_ID');
    requireIndexDigest(record.projectPathDigest, 'E_R6_INDEX_CHECKPOINT_PATH_DIGEST');
    requireIndexText(record.sourceVersion, 'E_R6_INDEX_CHECKPOINT_VERSION');
    requireIndexDigest(record.sourceDigest, 'E_R6_INDEX_CHECKPOINT_SOURCE_DIGEST');
    if (!Number.isInteger(record.bytes) || record.bytes < 0) {
      throw new MigrationHistoryError('E_R6_INDEX_CHECKPOINT_BYTES');
    }
    requireIndexTimestamp(record.createdAt, 'E_R6_INDEX_CHECKPOINT_CREATED_AT');
  }
  for (const record of index.quarantines) {
    assertIndexRecordIdentity({
      record,
      idKey: 'quarantineId',
      idPattern: QUARANTINE_ID_RE,
      kind: 'QUARANTINE',
      nextSequence: index.nextSequence,
      seenIds,
      seenSequences,
    });
    assertExactRecordKeys(record, [
      'quarantineId',
      'sequence',
      'projectPathDigest',
      'sourceDigest',
      'reason',
      'bytes',
      'createdAt',
    ], 'E_R6_INDEX_QUARANTINE_SHAPE');
    requireIndexDigest(record.projectPathDigest, 'E_R6_INDEX_QUARANTINE_PATH_DIGEST');
    requireIndexDigest(record.sourceDigest, 'E_R6_INDEX_QUARANTINE_SOURCE_DIGEST');
    requireIndexText(record.reason, 'E_R6_INDEX_QUARANTINE_REASON');
    if (!Number.isInteger(record.bytes) || record.bytes < 0) {
      throw new MigrationHistoryError('E_R6_INDEX_QUARANTINE_BYTES');
    }
    requireIndexTimestamp(record.createdAt, 'E_R6_INDEX_QUARANTINE_CREATED_AT');
  }
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

function containedArtifactPath(root, basename, { mustExist, code }) {
  const resolvedRoot = path.resolve(root);
  const candidate = path.resolve(resolvedRoot, basename);
  const relative = path.relative(resolvedRoot, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new MigrationHistoryError(code, basename);
  }
  if (!fs.existsSync(candidate)) {
    if (mustExist) throw new MigrationHistoryError(code, `missing:${basename}`);
    return candidate;
  }
  const stat = fs.lstatSync(candidate);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new MigrationHistoryError(code, basename);
  const canonical = fs.realpathSync(candidate);
  if (path.dirname(canonical) !== resolvedRoot) throw new MigrationHistoryError(code, basename);
  return candidate;
}

function checkpointPath(storeDir, checkpointId, { mustExist = false } = {}) {
  const id = normalizeCheckpointId(checkpointId);
  return containedArtifactPath(path.join(storeDir, CHECKPOINT_DIRNAME), `${id}.json`, {
    mustExist,
    code: 'E_R6_CHECKPOINT_PATH_UNSAFE',
  });
}

function quarantinePath(storeDir, quarantineId, { mustExist = false } = {}) {
  const id = normalizeQuarantineId(quarantineId);
  return containedArtifactPath(path.join(storeDir, QUARANTINE_DIRNAME), `${id}.json`, {
    mustExist,
    code: 'E_R6_QUARANTINE_PATH_UNSAFE',
  });
}

function normalizeCheckpointId(checkpointId) {
  const id = typeof checkpointId === 'string' ? checkpointId.trim() : '';
  if (!CHECKPOINT_ID_RE.test(id)) throw new MigrationHistoryError('E_R6_CHECKPOINT_ID_INVALID');
  return id;
}

function normalizeQuarantineId(quarantineId) {
  const id = typeof quarantineId === 'string' ? quarantineId.trim() : '';
  if (!QUARANTINE_ID_RE.test(id)) throw new MigrationHistoryError('E_R6_QUARANTINE_ID_INVALID');
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
  if (raw !== '' && !raw.endsWith('\n')) {
    const finalLine = raw.slice(raw.lastIndexOf('\n') + 1);
    try {
      JSON.parse(finalLine);
      throw new MigrationHistoryError('E_R6_HISTORY_LOG_CORRUPT', 'unterminated-valid-record');
    } catch (error) {
      if (error instanceof MigrationHistoryError) throw error;
    }
  }
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
  const stat = fs.lstatSync(historyPath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new MigrationHistoryError('E_R6_HISTORY_LOG_NOT_REGULAR');
  }
  let raw;
  try {
    raw = fs.readFileSync(historyPath, 'utf8');
  } catch (error) {
    throw new MigrationHistoryError('E_R6_HISTORY_LOG_UNREADABLE', error.message);
  }
  const parsed = parseHistoryText(raw);
  if (parsed.tornTail) {
    await durableSaveTransaction({ filePath: historyPath, content: serializeHistory(parsed.records), revision: parsed.records.length });
  }
  return { records: parsed.records, tornTailTruncated: parsed.tornTail };
}

function requireHistoryBound(maxHistoryRecords) {
  if (!Number.isInteger(maxHistoryRecords) || maxHistoryRecords < 1) {
    throw new MigrationHistoryError('E_R6_HISTORY_BOUND_INVALID');
  }
}

async function preflightHistoryAppend(storeDir, { maxHistoryRecords = DEFAULT_MAX_HISTORY_RECORDS } = {}) {
  requireHistoryBound(maxHistoryRecords);
  const history = await readHistory(storeDir);
  if (history.records.length >= maxHistoryRecords) {
    throw new MigrationHistoryError('E_R6_HISTORY_COMPACTION_REQUIRED');
  }
  return history;
}

async function appendHistory(
  storeDir,
  partial,
  { maxHistoryRecords = DEFAULT_MAX_HISTORY_RECORDS, fsAdapter = fsp } = {},
) {
  const { records } = await preflightHistoryAppend(storeDir, { maxHistoryRecords });
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
    fsAdapter,
  });
  return Object.freeze({ ...entry });
}

function errorIdentity(error) {
  return error && (error.code || error.message) ? String(error.code || error.message) : 'UNKNOWN';
}

async function historyContainsCommittedPartial(storeDir, partial) {
  try {
    const { records } = await readHistory(storeDir);
    const last = records.at(-1);
    if (!last) return false;
    const expected = {
      kind: partial.kind,
      projectId: partial.projectId ?? null,
      projectPathDigest: partial.projectPathDigest ?? null,
      checkpointId: partial.checkpointId || null,
      sourceVersion: partial.sourceVersion || null,
      targetVersion: partial.targetVersion || null,
      sourceDigest: partial.sourceDigest || null,
      targetDigest: partial.targetDigest || null,
      payload: sortJsonValue(partial.payload || null),
    };
    return Object.entries(expected).every(([key, value]) => JSON.stringify(last[key]) === JSON.stringify(value));
  } catch {
    return false;
  }
}

async function failAfterProjectRollback({ targetPath, previousContent, revision, fsAdapter, cause }) {
  try {
    await durableSaveTransaction({
      filePath: targetPath,
      content: previousContent,
      revision,
      fsAdapter,
    });
  } catch (rollbackError) {
    throw new MigrationHistoryError(
      'E_R6_HISTORY_ACK_FAILED_ROLLBACK_FAILED',
      `${errorIdentity(cause)};${errorIdentity(rollbackError)}`,
    );
  }
  throw new MigrationHistoryError('E_R6_HISTORY_ACK_FAILED_ROLLED_BACK', errorIdentity(cause));
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

async function quarantineProjectSource({
  projectPath,
  storeDir,
  reason,
  now = nowIso(),
  historyFsAdapter = fsp,
}) {
  const root = ensureStoreDirs(storeDir);
  const targetPath = requirePathText(projectPath, 'E_R6_PROJECT_PATH_REQUIRED');
  const rawContent = fs.readFileSync(targetPath, 'utf8');
  const index = readIndex(root);
  const originalIndex = JSON.parse(JSON.stringify(index));
  await preflightHistoryAppend(root);
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
  const artifactPath = quarantinePath(root, quarantineId);
  await durableSaveTransaction({ filePath: artifactPath, content: rawContent, revision: sequence });
  index.quarantines.push(record);
  index.nextSequence += 1;
  await writeIndex(root, index);
  const historyPartial = {
    kind: 'quarantine.created',
    projectId: null,
    projectPathDigest: record.projectPathDigest,
    checkpointId: null,
    sourceDigest,
    payload: { quarantineId, reason: record.reason },
  };
  try {
    await appendHistory(root, historyPartial, { fsAdapter: historyFsAdapter });
  } catch (error) {
    if (await historyContainsCommittedPartial(root, historyPartial)) {
      throw new MigrationHistoryError('E_R6_HISTORY_ACK_DURABILITY_INDETERMINATE', errorIdentity(error));
    }
    try {
      await writeIndex(root, originalIndex);
      await fsp.unlink(artifactPath);
    } catch (rollbackError) {
      throw new MigrationHistoryError(
        'E_R6_HISTORY_ACK_FAILED_ROLLBACK_FAILED',
        `${errorIdentity(error)};${errorIdentity(rollbackError)}`,
      );
    }
    throw new MigrationHistoryError('E_R6_HISTORY_ACK_FAILED_ROLLED_BACK', errorIdentity(error));
  }
  return Object.freeze({ ...record });
}

async function migrateProjectFile({
  projectPath,
  storeDir,
  targetVersion,
  migrations,
  now = nowIso(),
  fsAdapter = fsp,
  historyFsAdapter = fsp,
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
      const quarantine = await quarantineProjectSource({
        projectPath: targetPath,
        storeDir: root,
        reason: error.code,
        now,
        historyFsAdapter,
      });
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
  await preflightHistoryAppend(root);
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
  const historyPartial = {
    kind: 'migration.applied',
    projectId: project.projectId,
    projectPathDigest: checkpoint.projectPathDigest,
    checkpointId: checkpoint.checkpointId,
    sourceVersion: checkpoint.sourceVersion,
    targetVersion,
    sourceDigest: checkpoint.sourceDigest,
    targetDigest,
    payload: { migrationIds: chain.map((step) => step.id) },
  };
  let history;
  try {
    history = await appendHistory(root, historyPartial, { fsAdapter: historyFsAdapter });
  } catch (error) {
    if (await historyContainsCommittedPartial(root, historyPartial)) {
      throw new MigrationHistoryError('E_R6_HISTORY_ACK_DURABILITY_INDETERMINATE', errorIdentity(error));
    }
    await failAfterProjectRollback({
      targetPath,
      previousContent: rawContent,
      revision: checkpoint.sequence,
      fsAdapter,
      cause: error,
    });
  }
  let gc = null;
  if (retainCheckpoints !== null && retainCheckpoints !== undefined) {
    gc = await garbageCollectCheckpoints({
      storeDir: root,
      retainLast: retainCheckpoints,
      now,
      historyFsAdapter,
    });
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
  historyFsAdapter = fsp,
} = {}) {
  const root = ensureStoreDirs(storeDir);
  const targetPath = requirePathText(projectPath, 'E_R6_PROJECT_PATH_REQUIRED');
  const id = normalizeCheckpointId(checkpointId);
  const index = readIndex(root);
  const record = index.checkpoints.find((checkpoint) => checkpoint.checkpointId === id);
  if (!record) throw new MigrationHistoryError('E_R6_CHECKPOINT_UNKNOWN', id);
  if (record.projectPathDigest !== projectPathHash(targetPath)) throw new MigrationHistoryError('E_R6_CHECKPOINT_TARGET_MISMATCH', id);
  const checkpointFile = checkpointPath(root, id, { mustExist: true });
  const rawContent = fs.readFileSync(checkpointFile, 'utf8');
  const digest = sha256hex(Buffer.from(rawContent, 'utf8'));
  if (digest !== record.sourceDigest) throw new MigrationHistoryError('E_R6_CHECKPOINT_DIGEST_MISMATCH', id);
  const previousContent = fs.readFileSync(targetPath, 'utf8');
  await preflightHistoryAppend(root);
  await durableSaveTransaction({ filePath: targetPath, content: rawContent, revision: record.sequence, fsAdapter });
  const historyPartial = {
    kind: 'backup.restored',
    projectId: record.projectId,
    projectPathDigest: record.projectPathDigest,
    checkpointId: id,
    sourceVersion: record.sourceVersion,
    targetVersion: record.sourceVersion,
    sourceDigest: record.sourceDigest,
    targetDigest: record.sourceDigest,
    payload: { restoredAt: now },
  };
  let history;
  try {
    history = await appendHistory(root, historyPartial, { fsAdapter: historyFsAdapter });
  } catch (error) {
    if (await historyContainsCommittedPartial(root, historyPartial)) {
      throw new MigrationHistoryError('E_R6_HISTORY_ACK_DURABILITY_INDETERMINATE', errorIdentity(error));
    }
    await failAfterProjectRollback({
      targetPath,
      previousContent,
      revision: record.sequence,
      fsAdapter,
      cause: error,
    });
  }
  return Object.freeze({ success: true, checkpoint: Object.freeze({ ...record }), history });
}

async function garbageCollectCheckpoints({
  storeDir,
  retainLast,
  now = nowIso(),
  historyFsAdapter = fsp,
} = {}) {
  const root = ensureStoreDirs(storeDir);
  if (!Number.isInteger(retainLast) || retainLast < 1) throw new MigrationHistoryError('E_R6_GC_RETAIN_INVALID');
  const index = readIndex(root);
  const originalIndex = JSON.parse(JSON.stringify(index));
  await preflightHistoryAppend(root);
  const sorted = index.checkpoints.slice().sort((a, b) => a.sequence - b.sequence);
  const keep = new Set(sorted.slice(-retainLast).map((record) => record.checkpointId));
  const artifacts = new Map();
  for (const record of sorted) {
    const filePath = checkpointPath(root, record.checkpointId, { mustExist: true });
    const rawContent = fs.readFileSync(filePath);
    if (rawContent.length !== record.bytes) {
      throw new MigrationHistoryError('E_R6_CHECKPOINT_BYTES_MISMATCH', record.checkpointId);
    }
    if (sha256hex(rawContent) !== record.sourceDigest) {
      throw new MigrationHistoryError('E_R6_CHECKPOINT_DIGEST_MISMATCH', record.checkpointId);
    }
    artifacts.set(record.checkpointId, { filePath, rawContent, sequence: record.sequence });
  }
  const deletedRecords = sorted.filter((record) => !keep.has(record.checkpointId));
  const deleted = deletedRecords.map((record) => record.checkpointId);
  const historyPartial = {
    kind: 'gc.completed',
    projectId: null,
    projectPathDigest: null,
    checkpointId: null,
    payload: { retainLast, deleted, completedAt: now },
  };
  let history;
  try {
    for (const record of deletedRecords) {
      await fsp.unlink(artifacts.get(record.checkpointId).filePath);
    }
    index.checkpoints = index.checkpoints.filter((record) => keep.has(record.checkpointId));
    await writeIndex(root, index);
    history = await appendHistory(root, historyPartial, { fsAdapter: historyFsAdapter });
  } catch (error) {
    if (await historyContainsCommittedPartial(root, historyPartial)) {
      throw new MigrationHistoryError('E_R6_HISTORY_ACK_DURABILITY_INDETERMINATE', errorIdentity(error));
    }
    try {
      for (const record of deletedRecords) {
        const artifact = artifacts.get(record.checkpointId);
        if (!fs.existsSync(artifact.filePath)) {
          await durableSaveTransaction({
            filePath: artifact.filePath,
            content: artifact.rawContent,
            revision: artifact.sequence,
          });
        }
      }
      await writeIndex(root, originalIndex);
    } catch (rollbackError) {
      throw new MigrationHistoryError(
        'E_R6_GC_FAILED_ROLLBACK_FAILED',
        `${errorIdentity(error)};${errorIdentity(rollbackError)}`,
      );
    }
    throw new MigrationHistoryError('E_R6_GC_FAILED_ROLLED_BACK', errorIdentity(error));
  }
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
