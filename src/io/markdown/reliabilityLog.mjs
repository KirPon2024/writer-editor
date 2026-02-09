import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const LOG_SCHEMA_VERSION = 'sector-m-reliability-log.v1';
const DEFAULT_LOG_PATH = path.join(os.tmpdir(), 'writer-editor-ops-state', 'markdown-io.log');

function sanitizeText(input, fallback = '') {
  if (typeof input === 'string' && input.length > 0) return input;
  return fallback;
}

function sanitizePath(input) {
  if (typeof input !== 'string' || input.trim().length === 0) return '';
  return path.resolve(input.trim());
}

function normalizeSafetyMode(input) {
  return input === 'compat' ? 'compat' : 'strict';
}

function normalizeActions(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((item) => typeof item === 'string' && item.length > 0)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 5);
}

export function buildReliabilityLogRecord(input = {}) {
  return {
    schemaVersion: LOG_SCHEMA_VERSION,
    op: sanitizeText(input.op, 'm:cmd:project:unknown'),
    code: sanitizeText(input.code, 'MDV1_INTERNAL_ERROR'),
    reason: sanitizeText(input.reason, 'io_failure'),
    safetyMode: normalizeSafetyMode(input.safetyMode),
    sourcePath: sanitizePath(input.sourcePath),
    targetPath: sanitizePath(input.targetPath),
    snapshotPath: sanitizePath(input.snapshotPath),
    recoveryActions: normalizeActions(input.recoveryActions),
  };
}

export async function appendReliabilityLog(record, options = {}) {
  const logPath = sanitizePath(options.logPath) || DEFAULT_LOG_PATH;
  const directory = path.dirname(logPath);
  await fs.mkdir(directory, { recursive: true });
  await fs.appendFile(logPath, `${JSON.stringify(record)}\n`, 'utf8');
  return { logPath };
}

