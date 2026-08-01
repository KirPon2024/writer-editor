import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { atomicWriteFile } from '../markdown/atomicWriteFile.mjs';
import {
  RTK_EXACT_APPLY_OUTCOME_V2_SCHEMA,
  RTK_EXACT_APPLY_OUTCOME_EFFECT_INDEX_V1_SCHEMA,
  RTK_EXACT_APPLY_RECOVERY_RESOLUTION_V2_SCHEMA,
  RTK_EXACT_APPLY_RESERVATION_STATE_V1_SCHEMA,
  RTK_EXACT_APPLY_RESERVATION_V1_SCHEMA,
} from './reviewTransportApplyCore.mjs';
import { stableJson } from './reviewTransportCore.mjs';

const OUTCOME_DIRECTORY_SEGMENTS = ['backups', 'revision-bridge-rtk-apply-outcomes'];
const OUTCOME_EFFECT_INDEX_DIRECTORY_SEGMENTS = ['backups', 'revision-bridge-rtk-apply-outcome-effects'];
const RECOVERY_DIRECTORY_SEGMENTS = ['backups', 'revision-bridge-rtk-apply-recovery'];
const RESERVATION_REQUEST_DIRECTORY_SEGMENTS = ['backups', 'revision-bridge-rtk-apply-reservations', 'by-request'];
const RESERVATION_EFFECT_DIRECTORY_SEGMENTS = ['backups', 'revision-bridge-rtk-apply-reservations', 'by-effect'];
const RESERVATION_STATE_DIRECTORY_SEGMENTS = ['backups', 'revision-bridge-rtk-apply-reservations', 'states'];
const MAX_RECORD_BYTES = 512 * 1024;
const MAX_SCAN = 512;
const RESERVATION_STATE_ORDER = Object.freeze({
  RESERVED: 1,
  WRITER_STARTED: 2,
  WRITER_APPLIED: 3,
  OUTCOME_COMMITTED: 4,
  RECOVERY_REQUIRED: 5,
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function rawString(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeString(value) {
  return rawString(value).trim();
}

function cloneJsonSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function portableHashName(value) {
  const match = normalizeString(value).toLowerCase().match(/^sha256:([a-f0-9]{64})$/u);
  if (!match) throw new Error('RTK apply store key must be a sha256 identity');
  return match[1];
}

function sha256Json(value) {
  return `sha256:${crypto.createHash('sha256').update(Buffer.from(stableJson(value), 'utf8')).digest('hex')}`;
}

function nowIso(options = {}) {
  const value = typeof options.now === 'function' ? options.now() : Date.now();
  return new Date(value).toISOString();
}

function typedStoreError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function isPathInside(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function ensureRealDirectory(root, segments) {
  let cursor = root;
  const rootReal = await fs.realpath(root);
  for (const segment of segments) {
    cursor = path.join(cursor, segment);
    try {
      const stat = await fs.lstat(cursor);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error('RTK apply store directory must be a real directory');
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      await fs.mkdir(cursor);
    }
  }
  const directoryReal = await fs.realpath(cursor);
  if (!isPathInside(rootReal, directoryReal)) {
    throw new Error('RTK apply store directory resolves outside project');
  }
  return cursor;
}

async function readJsonFile(filePath) {
  const stat = await fs.lstat(filePath);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size > MAX_RECORD_BYTES) {
    throw new Error('RTK apply store record is unsafe');
  }
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function readJsonFileIfPresent(filePath) {
  try {
    return await readJsonFile(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeJsonFileExclusive(targetPath, record) {
  const content = `${JSON.stringify(record, null, 2)}\n`;
  let handle = null;
  try {
    handle = await fs.open(targetPath, 'wx');
    await handle.writeFile(content, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    return { ok: true, targetPath, existing: false, bytesWritten: Buffer.byteLength(content, 'utf8') };
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const existing = await readJsonFile(targetPath);
    if (stableJson(existing) !== stableJson(record)) {
      throw typedStoreError(
        'RTK_WRITE_RESERVATION_CONFLICT',
        'RTK apply store immutable record cannot be replaced',
        { targetPath },
      );
    }
    return { ok: true, targetPath, existing: true, bytesWritten: Buffer.byteLength(content, 'utf8') };
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

function outcomePath(root, requestKey) {
  return path.join(root, ...OUTCOME_DIRECTORY_SEGMENTS, `${portableHashName(requestKey)}.json`);
}

function outcomeEffectIndexPath(root, effectKey) {
  return path.join(root, ...OUTCOME_EFFECT_INDEX_DIRECTORY_SEGMENTS, `${portableHashName(effectKey)}.json`);
}

function reservationRequestPath(root, requestKey) {
  return path.join(root, ...RESERVATION_REQUEST_DIRECTORY_SEGMENTS, `${portableHashName(requestKey)}.json`);
}

function reservationEffectPath(root, effectKey) {
  return path.join(root, ...RESERVATION_EFFECT_DIRECTORY_SEGMENTS, `${portableHashName(effectKey)}.json`);
}

function reservationStateDirectory(root, requestKey) {
  return path.join(root, ...RESERVATION_STATE_DIRECTORY_SEGMENTS, portableHashName(requestKey));
}

function reservationStatePath(root, requestKey, state) {
  const stateOrder = RESERVATION_STATE_ORDER[state];
  if (!Number.isInteger(stateOrder)) {
    throw typedStoreError('RTK_WRITE_PRECONDITION_FAILED', 'Unknown RTK exact apply reservation state', { state });
  }
  return path.join(reservationStateDirectory(root, requestKey), `${String(stateOrder).padStart(4, '0')}-${state}.json`);
}

function buildOutcomeEffectIndex(record) {
  const unsigned = {
    schemaVersion: RTK_EXACT_APPLY_OUTCOME_EFFECT_INDEX_V1_SCHEMA,
    indexKind: 'same-round-effect',
    roundId: normalizeString(record.roundId),
    requestKey: normalizeString(record.requestKey),
    effectKey: normalizeString(record.effectKey),
    envelopeDigest: normalizeString(record.envelopeDigest),
    outcomeDigest: normalizeString(record.outcomeDigest),
  };
  return {
    ...unsigned,
    indexDigest: sha256Json(unsigned),
  };
}

function buildReservationRecord(envelope, options = {}) {
  const unsigned = {
    schemaVersion: RTK_EXACT_APPLY_RESERVATION_V1_SCHEMA,
    reservationKind: 'request',
    roundId: normalizeString(envelope?.roundId),
    requestKey: normalizeString(envelope?.requestKey),
    effectKey: normalizeString(envelope?.effectKey),
    envelopeDigest: normalizeString(envelope?.envelopeDigest),
    state: 'RESERVED',
    stateOrder: RESERVATION_STATE_ORDER.RESERVED,
    createdAt: nowIso(options),
  };
  return {
    ...unsigned,
    reservationDigest: sha256Json(unsigned),
  };
}

function buildReservationEffectIndex(envelope, reservationRecord) {
  const unsigned = {
    schemaVersion: RTK_EXACT_APPLY_RESERVATION_V1_SCHEMA,
    reservationKind: 'same-round-effect',
    roundId: normalizeString(envelope?.roundId),
    requestKey: normalizeString(envelope?.requestKey),
    effectKey: normalizeString(envelope?.effectKey),
    envelopeDigest: normalizeString(envelope?.envelopeDigest),
    reservationDigest: normalizeString(reservationRecord?.reservationDigest),
  };
  return {
    ...unsigned,
    reservationDigest: sha256Json(unsigned),
  };
}

function buildReservationStateRecord(envelope, state, options = {}) {
  const stateOrder = RESERVATION_STATE_ORDER[state];
  if (!Number.isInteger(stateOrder)) {
    throw typedStoreError('RTK_WRITE_PRECONDITION_FAILED', 'Unknown RTK exact apply reservation state', { state });
  }
  const unsigned = {
    schemaVersion: RTK_EXACT_APPLY_RESERVATION_STATE_V1_SCHEMA,
    roundId: normalizeString(envelope?.roundId),
    requestKey: normalizeString(envelope?.requestKey),
    effectKey: normalizeString(envelope?.effectKey),
    envelopeDigest: normalizeString(envelope?.envelopeDigest),
    state,
    stateOrder,
    recordedAt: nowIso(options),
    detail: isPlainObject(options.detail) ? cloneJsonSafe(options.detail) : null,
  };
  return {
    ...unsigned,
    stateDigest: sha256Json(unsigned),
  };
}

function sameReservationIdentity(left, right) {
  return normalizeString(left?.roundId) === normalizeString(right?.roundId)
    && normalizeString(left?.requestKey) === normalizeString(right?.requestKey)
    && normalizeString(left?.effectKey) === normalizeString(right?.effectKey)
    && normalizeString(left?.envelopeDigest) === normalizeString(right?.envelopeDigest);
}

async function readOutcomeByRequestKey(root, requestKey) {
  const record = await readJsonFileIfPresent(outcomePath(root, requestKey));
  if (!record) return null;
  if (record.schemaVersion !== RTK_EXACT_APPLY_OUTCOME_V2_SCHEMA) {
    throw typedStoreError('RTK_WRITE_RESERVATION_RECOVERY_REQUIRED', 'RTK apply outcome schema is invalid');
  }
  return record;
}

async function readOutcomeByEffectKey(root, effectKey, roundId) {
  const index = await readJsonFileIfPresent(outcomeEffectIndexPath(root, effectKey));
  if (!index) return null;
  if (index.schemaVersion !== RTK_EXACT_APPLY_OUTCOME_EFFECT_INDEX_V1_SCHEMA) {
    throw typedStoreError('RTK_WRITE_RESERVATION_RECOVERY_REQUIRED', 'RTK apply outcome effect index schema is invalid');
  }
  if (normalizeString(index.roundId) !== normalizeString(roundId)) return null;
  const record = await readOutcomeByRequestKey(root, index.requestKey);
  if (!record) {
    throw typedStoreError('RTK_WRITE_RESERVATION_RECOVERY_REQUIRED', 'RTK apply outcome effect index points to a missing outcome');
  }
  if (
    normalizeString(record.roundId) !== normalizeString(roundId)
    || normalizeString(record.effectKey) !== normalizeString(effectKey)
    || normalizeString(record.outcomeDigest) !== normalizeString(index.outcomeDigest)
  ) {
    throw typedStoreError('RTK_WRITE_RESERVATION_RECOVERY_REQUIRED', 'RTK apply outcome effect index does not match outcome record');
  }
  return record;
}

export async function readRtkExactApplyOutcomeRecords(projectRoot) {
  const root = path.resolve(normalizeString(projectRoot));
  const directory = path.join(root, ...OUTCOME_DIRECTORY_SEGMENTS);
  let entries = [];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const jsonEntries = entries
    .filter((entry) => entry.isFile() && !entry.isSymbolicLink() && entry.name.endsWith('.json'))
    .sort((left, right) => left.name.localeCompare(right.name));
  if (jsonEntries.length > MAX_SCAN) {
    throw typedStoreError(
      'RTK_APPLY_STORE_SCAN_LIMIT_EXCEEDED',
      'RTK apply outcome maintenance scan exceeded its deterministic bound; direct indexes remain authoritative',
      { maxScan: MAX_SCAN, observed: jsonEntries.length },
    );
  }
  const records = [];
  for (const entry of jsonEntries) {
    try {
      const record = await readJsonFile(path.join(directory, entry.name));
      if (record?.schemaVersion === RTK_EXACT_APPLY_OUTCOME_V2_SCHEMA) {
        records.push(cloneJsonSafe(record));
      }
    } catch {}
  }
  return records;
}

export async function findRtkExactApplyOutcome(projectRoot, envelope) {
  const root = path.resolve(normalizeString(projectRoot));
  const requestKey = normalizeString(envelope?.requestKey);
  const effectKey = normalizeString(envelope?.effectKey);
  const roundId = normalizeString(envelope?.roundId);
  const requestMatch = requestKey ? await readOutcomeByRequestKey(root, requestKey) : null;
  const effectMatch = effectKey ? await readOutcomeByEffectKey(root, effectKey, roundId) : null;
  const records = [requestMatch, effectMatch]
    .filter(Boolean)
    .filter((record, index, array) => (
      array.findIndex((candidate) => normalizeString(candidate.requestKey) === normalizeString(record.requestKey)) === index
    ))
    .map(cloneJsonSafe);
  return {
    requestMatch: requestMatch ? cloneJsonSafe(requestMatch) : null,
    sameRoundEffectMatch: effectMatch ? cloneJsonSafe(effectMatch) : null,
    records,
  };
}

export async function readRtkExactApplyReservation(projectRoot, envelope) {
  const root = path.resolve(normalizeString(projectRoot));
  const requestKey = normalizeString(envelope?.requestKey);
  const reservation = await readJsonFileIfPresent(reservationRequestPath(root, requestKey));
  if (!reservation) return null;
  if (reservation.schemaVersion !== RTK_EXACT_APPLY_RESERVATION_V1_SCHEMA) {
    throw typedStoreError('RTK_WRITE_RESERVATION_RECOVERY_REQUIRED', 'RTK exact apply reservation schema is invalid');
  }
  const stateDir = reservationStateDirectory(root, requestKey);
  let entries = [];
  try {
    entries = await fs.readdir(stateDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const states = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith('.json')) continue;
    const stateRecord = await readJsonFile(path.join(stateDir, entry.name));
    if (stateRecord?.schemaVersion === RTK_EXACT_APPLY_RESERVATION_STATE_V1_SCHEMA) {
      states.push(cloneJsonSafe(stateRecord));
    }
  }
  if (states.length === 0) {
    states.push({
      schemaVersion: RTK_EXACT_APPLY_RESERVATION_STATE_V1_SCHEMA,
      roundId: reservation.roundId,
      requestKey: reservation.requestKey,
      effectKey: reservation.effectKey,
      envelopeDigest: reservation.envelopeDigest,
      state: 'RESERVED',
      stateOrder: RESERVATION_STATE_ORDER.RESERVED,
      recordedAt: reservation.createdAt,
      detail: null,
      stateDigest: reservation.reservationDigest,
    });
  }
  const currentState = states.reduce((latest, item) => (
    Number(item.stateOrder) > Number(latest.stateOrder) ? item : latest
  ), states[0]);
  return {
    reservation: cloneJsonSafe(reservation),
    states,
    currentState: cloneJsonSafe(currentState),
  };
}

export async function reserveRtkExactApplyMutation(projectRoot, envelope, options = {}) {
  const root = path.resolve(normalizeString(projectRoot));
  await fs.stat(root);
  const requestDirectory = await ensureRealDirectory(root, RESERVATION_REQUEST_DIRECTORY_SEGMENTS);
  const effectDirectory = await ensureRealDirectory(root, RESERVATION_EFFECT_DIRECTORY_SEGMENTS);
  await ensureRealDirectory(root, RESERVATION_STATE_DIRECTORY_SEGMENTS);

  const reservationRecord = buildReservationRecord(envelope, options);
  const requestPath = path.join(requestDirectory, `${portableHashName(envelope?.requestKey)}.json`);
  const effectPath = path.join(effectDirectory, `${portableHashName(envelope?.effectKey)}.json`);

  const existingRequest = await readJsonFileIfPresent(requestPath);
  if (existingRequest) {
    const code = sameReservationIdentity(existingRequest, reservationRecord)
      ? 'RTK_WRITE_RESERVATION_RECOVERY_REQUIRED'
      : 'RTK_WRITE_RESERVATION_CONFLICT';
    return {
      ok: false,
      status: 'reservation_existing',
      code,
      reason: code,
      reservation: await readRtkExactApplyReservation(projectRoot, envelope),
    };
  }

  await writeJsonFileExclusive(requestPath, reservationRecord);

  const effectRecord = buildReservationEffectIndex(envelope, reservationRecord);
  const existingEffect = await readJsonFileIfPresent(effectPath);
  if (existingEffect) {
    return {
      ok: false,
      status: 'effect_reservation_existing',
      code: sameReservationIdentity(existingEffect, effectRecord)
        ? 'RTK_WRITE_RESERVATION_RECOVERY_REQUIRED'
        : 'RTK_WRITE_RESERVATION_CONFLICT',
      reason: sameReservationIdentity(existingEffect, effectRecord)
        ? 'RTK_WRITE_RESERVATION_RECOVERY_REQUIRED'
        : 'RTK_WRITE_RESERVATION_CONFLICT',
      reservation: await readRtkExactApplyReservation(projectRoot, envelope),
      effectReservation: cloneJsonSafe(existingEffect),
    };
  }
  await writeJsonFileExclusive(effectPath, effectRecord);
  const stateRecord = await writeRtkExactApplyReservationState(projectRoot, envelope, 'RESERVED', options);
  return {
    ok: true,
    status: 'reserved',
    code: 'RTK_COMMAND_ENVELOPE_BOUND',
    reason: 'RTK_COMMAND_ENVELOPE_BOUND',
    reservation: {
      reservation: cloneJsonSafe(reservationRecord),
      states: [cloneJsonSafe(stateRecord.record)],
      currentState: cloneJsonSafe(stateRecord.record),
    },
  };
}

export async function writeRtkExactApplyReservationState(projectRoot, envelope, state, options = {}) {
  const root = path.resolve(normalizeString(projectRoot));
  await fs.stat(root);
  const directory = reservationStateDirectory(root, envelope?.requestKey);
  await fs.mkdir(directory, { recursive: true });
  const directoryReal = await fs.realpath(directory);
  const rootReal = await fs.realpath(root);
  if (!isPathInside(rootReal, directoryReal)) {
    throw new Error('RTK exact apply reservation state directory resolves outside project');
  }
  const targetPath = reservationStatePath(root, envelope?.requestKey, state);
  const existing = await readJsonFileIfPresent(targetPath);
  if (existing) {
    if (
      existing.schemaVersion !== RTK_EXACT_APPLY_RESERVATION_STATE_V1_SCHEMA
      || normalizeString(existing.requestKey) !== normalizeString(envelope?.requestKey)
      || normalizeString(existing.effectKey) !== normalizeString(envelope?.effectKey)
      || normalizeString(existing.envelopeDigest) !== normalizeString(envelope?.envelopeDigest)
      || normalizeString(existing.state) !== normalizeString(state)
    ) {
      throw typedStoreError('RTK_WRITE_RESERVATION_CONFLICT', 'RTK exact apply reservation state is immutable and conflicting');
    }
    return { ok: true, targetPath, existing: true, record: cloneJsonSafe(existing) };
  }
  const record = buildReservationStateRecord(envelope, state, options);
  const writeResult = await writeJsonFileExclusive(targetPath, record);
  return { ...writeResult, record: cloneJsonSafe(record) };
}

export async function writeRtkExactApplyOutcomeRecord(projectRoot, record) {
  if (!isPlainObject(record) || record.schemaVersion !== RTK_EXACT_APPLY_OUTCOME_V2_SCHEMA) {
    throw new Error('RTK apply outcome schema is invalid');
  }
  const root = path.resolve(normalizeString(projectRoot));
  await fs.stat(root);
  const directory = await ensureRealDirectory(root, OUTCOME_DIRECTORY_SEGMENTS);
  const targetPath = path.join(directory, `${portableHashName(record.requestKey)}.json`);
  const content = `${JSON.stringify(record, null, 2)}\n`;
  let existing = false;
  try {
    const existingRecord = await readJsonFile(targetPath);
    if (stableJson(existingRecord) !== stableJson(record)) {
      throw new Error('RTK apply outcome is immutable and cannot be replaced');
    }
    existing = true;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const result = existing
    ? { bytesWritten: Buffer.byteLength(content, 'utf8') }
    : await atomicWriteFile(targetPath, content, { safetyMode: 'strict' });

  const indexDirectory = await ensureRealDirectory(root, OUTCOME_EFFECT_INDEX_DIRECTORY_SEGMENTS);
  const indexPath = path.join(indexDirectory, `${portableHashName(record.effectKey)}.json`);
  const indexRecord = buildOutcomeEffectIndex(record);
  await writeJsonFileExclusive(indexPath, indexRecord);
  return { ok: true, targetPath, effectIndexPath: indexPath, existing, bytesWritten: result.bytesWritten };
}

export async function writeRtkExactApplyRecoveryResolution(projectRoot, record) {
  if (!isPlainObject(record) || record.schemaVersion !== RTK_EXACT_APPLY_RECOVERY_RESOLUTION_V2_SCHEMA) {
    throw new Error('RTK apply recovery resolution schema is invalid');
  }
  const root = path.resolve(normalizeString(projectRoot));
  await fs.stat(root);
  const directory = await ensureRealDirectory(root, RECOVERY_DIRECTORY_SEGMENTS);
  const targetPath = path.join(directory, `${portableHashName(record.requestKey)}.json`);
  const content = `${JSON.stringify(record, null, 2)}\n`;
  try {
    const existing = await readJsonFile(targetPath);
    if (stableJson(existing) !== stableJson(record)) {
      throw new Error('RTK apply recovery resolution is immutable and cannot be replaced');
    }
    return { ok: true, targetPath, existing: true, bytesWritten: Buffer.byteLength(content, 'utf8') };
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const result = await atomicWriteFile(targetPath, content, { safetyMode: 'strict' });
  return { ok: true, targetPath, existing: false, bytesWritten: result.bytesWritten };
}
