#!/usr/bin/env node
import fs from 'node:fs';
import { createHash } from 'node:crypto';

export const DEFAULT_XPLAT_CONTRACT_PATH = 'docs/OPS/STATUS/XPLAT_UNIFIED_MASTER_EXECUTION_CONTRACT_v3.12.md';

const REQUIRED_MARKERS = [
  'SSOT-only',
  'no runtime wiring',
  'PASS criteria',
  'BLOCKED criteria',
  'sha256',
];

function sha256File(filePath) {
  try {
    const data = fs.readFileSync(filePath);
    return createHash('sha256').update(data).digest('hex');
  } catch {
    return '';
  }
}

export function evaluateXplatContractState(input = {}) {
  const contractPath = input.contractPath || process.env.XPLAT_CONTRACT_PATH || DEFAULT_XPLAT_CONTRACT_PATH;
  const present = fs.existsSync(contractPath) ? 1 : 0;

  if (present !== 1) {
    return {
      path: contractPath,
      present: 0,
      sha256: '',
      ok: 0,
      failReason: 'XPLAT_CONTRACT_MISSING',
    };
  }

  let text = '';
  try {
    text = fs.readFileSync(contractPath, 'utf8');
  } catch {
    return {
      path: contractPath,
      present: 1,
      sha256: '',
      ok: 0,
      failReason: 'XPLAT_CONTRACT_READ_FAILED',
    };
  }

  const missingMarkers = REQUIRED_MARKERS.filter((marker) => !text.includes(marker));
  if (missingMarkers.length > 0) {
    return {
      path: contractPath,
      present: 1,
      sha256: sha256File(contractPath),
      ok: 0,
      failReason: `XPLAT_CONTRACT_MARKERS_MISSING:${missingMarkers.join(',')}`,
    };
  }

  return {
    path: contractPath,
    present: 1,
    sha256: sha256File(contractPath),
    ok: 1,
    failReason: '',
  };
}
