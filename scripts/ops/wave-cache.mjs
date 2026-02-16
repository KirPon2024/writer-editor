#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_WAVE_CACHE_PATH = 'artifacts/ops/wave-cache-v3_12.json';

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stableSortObject(value) {
  if (Array.isArray(value)) return value.map((entry) => stableSortObject(entry));
  if (!isObjectRecord(value)) return value;
  const out = {};
  for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
    out[key] = stableSortObject(value[key]);
  }
  return out;
}

function stableStringify(value) {
  return JSON.stringify(stableSortObject(value), null, 2);
}

function parseBooleanish(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function readCache(cachePath) {
  if (!fs.existsSync(cachePath)) {
    return {
      schemaVersion: 'v3.12',
      entries: {},
      updatedAtUtc: '',
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (!isObjectRecord(parsed) || !isObjectRecord(parsed.entries)) {
      return {
        schemaVersion: 'v3.12',
        entries: {},
        updatedAtUtc: '',
      };
    }
    return {
      schemaVersion: String(parsed.schemaVersion || 'v3.12'),
      entries: parsed.entries,
      updatedAtUtc: String(parsed.updatedAtUtc || ''),
    };
  } catch {
    return {
      schemaVersion: 'v3.12',
      entries: {},
      updatedAtUtc: '',
    };
  }
}

function writeCache(cachePath, cacheDoc) {
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, `${stableStringify(cacheDoc)}\n`, 'utf8');
}

function parseArgs(argv) {
  const out = {
    json: false,
    mode: 'check',
    cachePath: '',
    waveInputHash: '',
    ttlClass: '',
    ttlSec: '',
    reuseRequested: '',
    nowUtc: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || '');
    if (arg === '--json') {
      out.json = true;
      continue;
    }

    const parseInline = (name) => arg.startsWith(`${name}=`) ? arg.slice(name.length + 1).trim() : null;

    const modeInline = parseInline('--mode');
    if (modeInline !== null) {
      out.mode = modeInline;
      continue;
    }
    if (arg === '--mode' && i + 1 < argv.length) {
      out.mode = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }

    const cacheInline = parseInline('--cache-path');
    if (cacheInline !== null) {
      out.cachePath = cacheInline;
      continue;
    }
    if (arg === '--cache-path' && i + 1 < argv.length) {
      out.cachePath = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }

    const hashInline = parseInline('--wave-input-hash');
    if (hashInline !== null) {
      out.waveInputHash = hashInline;
      continue;
    }
    if (arg === '--wave-input-hash' && i + 1 < argv.length) {
      out.waveInputHash = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }

    const ttlClassInline = parseInline('--ttl-class');
    if (ttlClassInline !== null) {
      out.ttlClass = ttlClassInline;
      continue;
    }
    if (arg === '--ttl-class' && i + 1 < argv.length) {
      out.ttlClass = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }

    const ttlSecInline = parseInline('--ttl-sec');
    if (ttlSecInline !== null) {
      out.ttlSec = ttlSecInline;
      continue;
    }
    if (arg === '--ttl-sec' && i + 1 < argv.length) {
      out.ttlSec = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }

    const reuseInline = parseInline('--reuse-requested');
    if (reuseInline !== null) {
      out.reuseRequested = reuseInline;
      continue;
    }
    if (arg === '--reuse-requested' && i + 1 < argv.length) {
      out.reuseRequested = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }

    const nowInline = parseInline('--now-utc');
    if (nowInline !== null) {
      out.nowUtc = nowInline;
      continue;
    }
    if (arg === '--now-utc' && i + 1 < argv.length) {
      out.nowUtc = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }

  return out;
}

export function evaluateWaveCacheState(input = {}) {
  const mode = String(input.mode || 'check').trim().toLowerCase() === 'store' ? 'store' : 'check';
  const cachePath = String(input.cachePath || process.env.WAVE_CACHE_PATH || DEFAULT_WAVE_CACHE_PATH).trim();
  const waveInputHash = String(input.waveInputHash || '').trim();
  const ttlClass = String(input.ttlClass || '').trim() || 'deterministicLocal';
  const ttlSecRaw = Number(input.ttlSec || 0);
  const ttlSec = Number.isFinite(ttlSecRaw) && ttlSecRaw > 0 ? Math.trunc(ttlSecRaw) : 0;
  const reuseRequested = input.reuseRequested === true
    || parseBooleanish(input.reuseRequested)
    || parseBooleanish(process.env.WAVE_REUSE_REQUESTED);

  const nowMs = Number.isFinite(Date.parse(String(input.nowUtc || '').trim()))
    ? Date.parse(String(input.nowUtc || '').trim())
    : Date.now();

  const cacheDoc = readCache(cachePath);

  if (!/^[0-9a-f]{64}$/u.test(waveInputHash)) {
    return {
      ok: false,
      mode,
      cachePath,
      WAVE_RESULT_REUSED: 0,
      WAVE_RESULT_STALE: 1,
      WAVE_TTL_VALID: 0,
      WAVE_FRESHNESS_OK: 0,
      failSignal: 'E_WAVE_RESULT_STALE',
      failReason: 'WAVE_INPUT_HASH_INVALID',
      waveInputHash,
      ttlClass,
      ttlExpiresAtUtc: '',
      reusedRecord: null,
    };
  }

  if (mode === 'store') {
    if (ttlSec <= 0) {
      return {
        ok: false,
        mode,
        cachePath,
        WAVE_RESULT_REUSED: 0,
        WAVE_RESULT_STALE: 1,
        WAVE_TTL_VALID: 0,
        WAVE_FRESHNESS_OK: 0,
        failSignal: 'E_WAVE_RESULT_STALE',
        failReason: 'WAVE_TTL_SEC_INVALID',
        waveInputHash,
        ttlClass,
        ttlExpiresAtUtc: '',
        reusedRecord: null,
      };
    }

    const ttlExpiresAtMs = nowMs + (ttlSec * 1000);
    const entry = {
      waveInputHash,
      ttlClass,
      ttlSec,
      createdAtUtc: new Date(nowMs).toISOString(),
      ttlExpiresAtUtc: new Date(ttlExpiresAtMs).toISOString(),
    };

    const nextCache = {
      schemaVersion: 'v3.12',
      updatedAtUtc: new Date(nowMs).toISOString(),
      entries: {
        ...(isObjectRecord(cacheDoc.entries) ? cacheDoc.entries : {}),
        [waveInputHash]: entry,
      },
    };
    writeCache(cachePath, nextCache);

    return {
      ok: true,
      mode,
      cachePath,
      WAVE_RESULT_REUSED: 0,
      WAVE_RESULT_STALE: 0,
      WAVE_TTL_VALID: 1,
      WAVE_FRESHNESS_OK: 1,
      failSignal: '',
      failReason: '',
      waveInputHash,
      ttlClass,
      ttlExpiresAtUtc: entry.ttlExpiresAtUtc,
      reusedRecord: null,
    };
  }

  if (!reuseRequested) {
    return {
      ok: true,
      mode,
      cachePath,
      WAVE_RESULT_REUSED: 0,
      WAVE_RESULT_STALE: 0,
      WAVE_TTL_VALID: 1,
      WAVE_FRESHNESS_OK: 1,
      failSignal: '',
      failReason: '',
      waveInputHash,
      ttlClass,
      ttlExpiresAtUtc: '',
      reusedRecord: null,
    };
  }

  const entry = isObjectRecord(cacheDoc.entries) && isObjectRecord(cacheDoc.entries[waveInputHash])
    ? cacheDoc.entries[waveInputHash]
    : null;

  if (!entry) {
    return {
      ok: false,
      mode,
      cachePath,
      WAVE_RESULT_REUSED: 0,
      WAVE_RESULT_STALE: 1,
      WAVE_TTL_VALID: 0,
      WAVE_FRESHNESS_OK: 0,
      failSignal: 'E_WAVE_RESULT_STALE',
      failReason: 'WAVE_CACHE_ENTRY_MISSING',
      waveInputHash,
      ttlClass,
      ttlExpiresAtUtc: '',
      reusedRecord: null,
    };
  }

  const ttlExpiresAtUtc = String(entry.ttlExpiresAtUtc || '').trim();
  const ttlExpiresAtMs = Date.parse(ttlExpiresAtUtc);
  const ttlValid = Number.isFinite(ttlExpiresAtMs) && ttlExpiresAtMs > nowMs;

  if (!ttlValid) {
    return {
      ok: false,
      mode,
      cachePath,
      WAVE_RESULT_REUSED: 0,
      WAVE_RESULT_STALE: 1,
      WAVE_TTL_VALID: 0,
      WAVE_FRESHNESS_OK: 0,
      failSignal: 'E_WAVE_RESULT_STALE',
      failReason: 'WAVE_CACHE_TTL_EXPIRED',
      waveInputHash,
      ttlClass,
      ttlExpiresAtUtc,
      reusedRecord: {
        waveInputHash,
        ttlClass: String(entry.ttlClass || ''),
      },
    };
  }

  return {
    ok: true,
    mode,
    cachePath,
    WAVE_RESULT_REUSED: 1,
    WAVE_RESULT_STALE: 0,
    WAVE_TTL_VALID: 1,
    WAVE_FRESHNESS_OK: 1,
    failSignal: '',
    failReason: '',
    waveInputHash,
    ttlClass,
    ttlExpiresAtUtc,
    reusedRecord: {
      waveInputHash,
      ttlClass: String(entry.ttlClass || ''),
    },
  };
}

function printHuman(state) {
  console.log(`WAVE_RESULT_REUSED=${state.WAVE_RESULT_REUSED}`);
  console.log(`WAVE_RESULT_STALE=${state.WAVE_RESULT_STALE}`);
  console.log(`WAVE_TTL_VALID=${state.WAVE_TTL_VALID}`);
  console.log(`WAVE_FRESHNESS_OK=${state.WAVE_FRESHNESS_OK}`);
  console.log(`WAVE_FAIL_SIGNAL=${state.failSignal}`);
  console.log(`WAVE_FAIL_REASON=${state.failReason}`);
  console.log(`WAVE_CACHE_PATH=${state.cachePath}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateWaveCacheState({
    mode: args.mode,
    cachePath: args.cachePath,
    waveInputHash: args.waveInputHash,
    ttlClass: args.ttlClass,
    ttlSec: args.ttlSec,
    reuseRequested: args.reuseRequested,
    nowUtc: args.nowUtc,
  });

  if (args.json) {
    process.stdout.write(`${stableStringify(state)}\n`);
  } else {
    printHuman(state);
  }

  process.exit(state.ok ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
