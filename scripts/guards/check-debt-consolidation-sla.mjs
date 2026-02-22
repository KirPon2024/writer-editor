#!/usr/bin/env node
import fs from 'node:fs';

const FAIL_SIGNAL_CODE = 'E_DEBT_TTL_EXPIRED';
const DEFAULT_DEBT_REGISTRY_PATH = 'docs/OPS/DEBT_REGISTRY.json';

function parseArgs(argv) {
  const out = {
    json: false,
    debtRegistryPath: DEFAULT_DEBT_REGISTRY_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = String(argv[index] || '').trim();
    if (arg === '--json') {
      out.json = true;
      continue;
    }
    if (arg === '--debt-registry-path' && index + 1 < argv.length) {
      out.debtRegistryPath = String(argv[index + 1] || '').trim() || DEFAULT_DEBT_REGISTRY_PATH;
      index += 1;
    }
  }
  return out;
}

function parseDebtRegistry(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (!Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function evaluateDebtTtl(doc, nowMs) {
  const expired = [];
  let checkedActiveCount = 0;

  for (const row of doc.items) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    if (row.active !== true) continue;
    checkedActiveCount += 1;

    const debtId = String(row.debtId || '').trim() || '<missing-debt-id>';
    const ttlUntil = String(row.ttlUntil || '').trim();
    const ttlMs = Date.parse(ttlUntil);

    if (!Number.isFinite(ttlMs)) {
      expired.push({
        debtId,
        ttlUntil,
        reason: 'TTL_INVALID',
      });
      continue;
    }

    if (ttlMs < nowMs) {
      expired.push({
        debtId,
        ttlUntil,
        reason: 'TTL_EXPIRED',
      });
    }
  }

  return {
    checkedActiveCount,
    expired,
  };
}

function buildResult(input) {
  const nowMs = Date.now();
  const nowUtc = new Date(nowMs).toISOString();
  const parsed = parseDebtRegistry(input.debtRegistryPath);

  if (!parsed) {
    return {
      ok: false,
      failSignalCode: FAIL_SIGNAL_CODE,
      failReason: 'DEBT_REGISTRY_INVALID',
      debtRegistryPath: input.debtRegistryPath,
      nowUtc,
      checkedActiveCount: 0,
      expiredCount: 1,
      expiredDebtIds: [],
      details: [
        {
          debtId: '<registry>',
          ttlUntil: '',
          reason: 'DEBT_REGISTRY_INVALID',
        },
      ],
    };
  }

  const ttlState = evaluateDebtTtl(parsed, nowMs);
  const expiredDebtIds = ttlState.expired.map((item) => item.debtId);
  const ok = ttlState.expired.length === 0;

  return {
    ok,
    failSignalCode: ok ? '' : FAIL_SIGNAL_CODE,
    failReason: ok ? '' : 'DEBT_TTL_EXPIRED',
    debtRegistryPath: input.debtRegistryPath,
    nowUtc,
    checkedActiveCount: ttlState.checkedActiveCount,
    expiredCount: ttlState.expired.length,
    expiredDebtIds,
    details: ttlState.expired,
  };
}

function printHuman(state) {
  if (!state.ok) {
    console.log(FAIL_SIGNAL_CODE);
    console.log(JSON.stringify(state, null, 2));
    return;
  }

  console.log('DEBT_TTL_GUARD_OK=1');
  console.log('DEBT_TTL_EXPIRED_COUNT=0');
  console.log(`DEBT_TTL_REGISTRY_PATH=${state.debtRegistryPath}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = buildResult(args);

  if (args.json) {
    console.log(JSON.stringify(state, null, 2));
  } else {
    printHuman(state);
  }

  process.exit(state.ok ? 0 : 1);
}

main();
