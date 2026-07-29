import fs from 'node:fs/promises';
import path from 'node:path';

import { atomicWriteFile } from '../markdown/atomicWriteFile.mjs';
import {
  RTK_EXACT_APPLY_OUTCOME_V2_SCHEMA,
  RTK_EXACT_APPLY_RECOVERY_RESOLUTION_V2_SCHEMA,
} from './reviewTransportApplyCore.mjs';
import { stableJson } from './reviewTransportCore.mjs';

const OUTCOME_DIRECTORY_SEGMENTS = ['backups', 'revision-bridge-rtk-apply-outcomes'];
const RECOVERY_DIRECTORY_SEGMENTS = ['backups', 'revision-bridge-rtk-apply-recovery'];
const MAX_RECORD_BYTES = 512 * 1024;
const MAX_SCAN = 512;

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
  const records = [];
  for (const entry of entries.slice(0, MAX_SCAN)) {
    if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith('.json')) continue;
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
  const records = await readRtkExactApplyOutcomeRecords(projectRoot);
  const requestKey = normalizeString(envelope?.requestKey);
  const effectKey = normalizeString(envelope?.effectKey);
  const roundId = normalizeString(envelope?.roundId);
  return {
    requestMatch: records.find((record) => normalizeString(record.requestKey) === requestKey) || null,
    sameRoundEffectMatch: records.find((record) => (
      normalizeString(record.roundId) === roundId
      && normalizeString(record.effectKey) === effectKey
    )) || null,
    records,
  };
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
  try {
    const existing = await readJsonFile(targetPath);
    if (stableJson(existing) !== stableJson(record)) {
      throw new Error('RTK apply outcome is immutable and cannot be replaced');
    }
    return { ok: true, targetPath, existing: true, bytesWritten: Buffer.byteLength(content, 'utf8') };
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const result = await atomicWriteFile(targetPath, content, { safetyMode: 'strict' });
  return { ok: true, targetPath, existing: false, bytesWritten: result.bytesWritten };
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
  const result = await atomicWriteFile(targetPath, content, { safetyMode: 'strict' });
  return { ok: true, targetPath, bytesWritten: result.bytesWritten };
}

