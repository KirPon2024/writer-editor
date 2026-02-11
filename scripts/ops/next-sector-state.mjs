#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

export function readJsonObject(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function loadSectorStatuses(statusDir) {
  const statuses = {};
  let entries = [];
  try {
    entries = fs.readdirSync(statusDir, { withFileTypes: true });
  } catch {
    return statuses;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = /^SECTOR_([A-Z0-9]+)\.json$/.exec(entry.name);
    if (!match) continue;
    const sectorId = match[1];
    const filePath = path.join(statusDir, entry.name);
    const parsed = readJsonObject(filePath);
    if (!parsed) {
      statuses[sectorId] = 'UNKNOWN';
      continue;
    }
    const status = typeof parsed.status === 'string' ? parsed.status.trim().toUpperCase() : 'UNKNOWN';
    statuses[sectorId] = status || 'UNKNOWN';
  }

  return statuses;
}

export function evaluateNextSectorState(input = {}) {
  const statusDir = input.statusDir || process.env.OPS_STATUS_DIR || 'docs/OPS/STATUS';
  const nextSectorPath = input.nextSectorPath
    || process.env.NEXT_SECTOR_STATUS_PATH
    || path.join(statusDir, 'NEXT_SECTOR.json');

  const sectorStatuses = loadSectorStatuses(statusDir);
  const knownSectors = Object.keys(sectorStatuses).sort();
  const allSectorsDone = knownSectors.length > 0 && knownSectors.every((id) => sectorStatuses[id] === 'DONE');

  const nextDoc = readJsonObject(nextSectorPath);
  if (!nextDoc) {
    return {
      valid: false,
      failReason: 'NEXT_SECTOR_MISSING_OR_INVALID',
      id: '',
      mode: '',
      reason: '',
      knownSectors,
      allSectorsDone,
      targetSector: '',
      targetStatus: '',
    };
  }

  const id = typeof nextDoc.id === 'string' ? nextDoc.id.trim() : '';
  const mode = typeof nextDoc.mode === 'string' ? nextDoc.mode.trim().toUpperCase() : '';
  const reason = typeof nextDoc.reason === 'string' ? nextDoc.reason.trim().toUpperCase() : '';

  if (id === 'NONE') {
    const idleOk = mode === 'IDLE' && reason === 'ALL_SECTORS_DONE';
    if (!allSectorsDone) {
      return {
        valid: false,
        failReason: 'NEXT_SECTOR_IDLE_WITH_OPEN_SECTORS',
        id,
        mode,
        reason,
        knownSectors,
        allSectorsDone,
        targetSector: '',
        targetStatus: '',
      };
    }
    return {
      valid: idleOk,
      failReason: idleOk ? '' : 'NEXT_SECTOR_IDLE_SHAPE_INVALID',
      id,
      mode,
      reason,
      knownSectors,
      allSectorsDone,
      targetSector: '',
      targetStatus: '',
    };
  }

  const match = /^SECTOR\s+([A-Z0-9]+)$/u.exec(id);
  const targetSector = match ? match[1] : '';
  if (!targetSector) {
    return {
      valid: false,
      failReason: 'NEXT_SECTOR_ID_INVALID',
      id,
      mode,
      reason,
      knownSectors,
      allSectorsDone,
      targetSector: '',
      targetStatus: '',
    };
  }

  const targetStatus = sectorStatuses[targetSector] || '';
  if (!targetStatus) {
    return {
      valid: false,
      failReason: 'NEXT_SECTOR_TARGET_MISSING',
      id,
      mode,
      reason,
      knownSectors,
      allSectorsDone,
      targetSector,
      targetStatus: '',
    };
  }

  if (targetStatus === 'DONE') {
    return {
      valid: false,
      failReason: allSectorsDone ? 'NEXT_SECTOR_POINTS_TO_DONE_WHEN_ALL_DONE' : 'NEXT_SECTOR_POINTS_TO_DONE',
      id,
      mode,
      reason,
      knownSectors,
      allSectorsDone,
      targetSector,
      targetStatus,
    };
  }

  return {
    valid: true,
    failReason: '',
    id,
    mode: mode || 'ACTIVE',
    reason: reason || '',
    knownSectors,
    allSectorsDone,
    targetSector,
    targetStatus,
  };
}
