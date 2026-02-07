#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const OPS_CONTOUR_ROOT = path.join(ROOT, 'docs', 'OPS', 'CONTOUR_C');
const LEDGER_PATH = path.join(OPS_CONTOUR_ROOT, 'EXIT_LEDGER.json');
const RUN_RESULT_LATEST = path.join(ROOT, 'artifacts', 'contour-c-run', 'latest', 'result.json');
const ENTRY_TYPES = new Set(['baseline', 'exit', 'rollback', 'waiver', 'signoff', 'close']);
const HOSIGNOFF_VALUES = new Set(['PENDING', 'APPROVED', 'N/A']);

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function nowIso() {
  return new Date().toISOString();
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function parseSignoff(raw) {
  const val = String(raw ?? '').trim();
  if (!val) return 'N/A';
  const upper = val.toUpperCase();
  if (upper === 'TRUE' || upper === 'YES' || upper === '1') return 'APPROVED';
  if (upper === 'FALSE' || upper === 'NO' || upper === '0') return 'PENDING';
  if (HOSIGNOFF_VALUES.has(upper)) return upper;
  throw new Error('HO_SIGNOFF_INVALID');
}

function parseArgs(argv) {
  const out = {
    mode: null,
    baselineSha: '',
    owner: '',
    action: '',
    hoSignoff: 'N/A',
    resultPath: '',
    entryType: '',
    p0Id: '',
    ruleId: '',
    refEntryId: '',
    contour: '',
    p0Count: 0,
    productStep: '',
    refReport: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') out.mode = 'check';
    else if (arg === '--bootstrap') out.mode = 'bootstrap';
    else if (arg === '--record') out.mode = 'record';
    else if (arg === '--baseline-sha') out.baselineSha = argv[++i] ?? '';
    else if (arg === '--owner') out.owner = argv[++i] ?? '';
    else if (arg === '--action') out.action = argv[++i] ?? '';
    else if (arg === '--ho-signoff') out.hoSignoff = parseSignoff(argv[++i] ?? '');
    else if (arg === '--result') out.resultPath = argv[++i] ?? '';
    else if (arg === '--entry-type') out.entryType = argv[++i] ?? '';
    else if (arg === '--p0-id') out.p0Id = argv[++i] ?? '';
    else if (arg === '--rule-id') out.ruleId = argv[++i] ?? '';
    else if (arg === '--ref-entry-id') out.refEntryId = argv[++i] ?? '';
    else if (arg === '--contour') out.contour = argv[++i] ?? '';
    else if (arg === '--p0-count') out.p0Count = Number.parseInt(argv[++i] ?? '', 10);
    else if (arg === '--product-step') out.productStep = argv[++i] ?? '';
    else if (arg === '--ref-report') out.refReport = argv[++i] ?? '';
    else if (arg === '--help' || arg === '-h') {
      process.stdout.write(
        [
          'Usage:',
          '  node scripts/contour-c-ledger.mjs --check',
          '  node scripts/contour-c-ledger.mjs --bootstrap --baseline-sha <sha> --owner <owner>',
          '  node scripts/contour-c-ledger.mjs --record [--result <path>] --owner <owner> [--entry-type baseline|exit|rollback|waiver|signoff|close] [--action <name>] [--ho-signoff PENDING|APPROVED|N/A] [--p0-id <id>] [--rule-id <id>] [--ref-entry-id <entryId>] [--contour <id>] [--p0-count <n>] [--product-step <id>] [--ref-report <path>]',
        ].join('\n') + '\n',
      );
      process.exit(0);
    } else {
      throw new Error(`UNKNOWN_ARG:${arg}`);
    }
  }

  if (!out.mode) throw new Error('MODE_REQUIRED');
  return out;
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function writeJsonAtomic(filePath, obj) {
  const temp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, filePath);
}

function stableEntryPayload(entry) {
  const payload = {
    entryId: entry.entryId,
    entryType: entry.entryType,
    timestamp: entry.timestamp,
    action: entry.action,
    baselineSha: entry.baselineSha,
    owner: entry.owner,
    hoSignoff: entry.hoSignoff,
    p0Id: entry.p0Id,
    ruleId: entry.ruleId,
    refEntryId: entry.refEntryId,
    kpi: entry.kpi,
    waivers: entry.waivers,
    proof: entry.proof,
    prevHash: entry.prevHash,
    generatedBy: entry.generatedBy,
  };

  if (entry && entry.entryType === 'close') {
    payload.contour = entry.contour;
    payload.p0Count = entry.p0Count;
    payload.productStep = entry.productStep;
    payload.refReport = entry.refReport;
  }

  return JSON.stringify(payload);
}

function defaultLedger() {
  return {
    schemaVersion: 2,
    appendOnly: true,
    entries: [],
  };
}

function normalizeLegacyEntry(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  const next = { ...entry };
  if (typeof next.entryType !== 'string' || !ENTRY_TYPES.has(next.entryType)) {
    if (next.action === 'bootstrap') next.entryType = 'baseline';
    else if (next.action === 'c0-baseline') next.entryType = 'signoff';
    else next.entryType = 'baseline';
  }
  if (typeof next.hoSignoff !== 'string' || !HOSIGNOFF_VALUES.has(next.hoSignoff)) {
    if (next.hoSignoff === true) next.hoSignoff = 'APPROVED';
    else if (next.entryType === 'exit') next.hoSignoff = 'PENDING';
    else next.hoSignoff = 'N/A';
  }
  if (typeof next.p0Id !== 'string') next.p0Id = '';
  if (typeof next.ruleId !== 'string') next.ruleId = '';
  if (typeof next.refEntryId !== 'string') next.refEntryId = '';
  if (typeof next.contour !== 'string') next.contour = '';
  if (!Number.isInteger(next.p0Count)) next.p0Count = 0;
  if (typeof next.productStep !== 'string') next.productStep = '';
  if (typeof next.refReport !== 'string') next.refReport = '';
  return next;
}

function loadLedgerOrDefault() {
  if (!fs.existsSync(LEDGER_PATH)) return defaultLedger();
  const parsed = readJson(LEDGER_PATH);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('LEDGER_INVALID_TOP');
  }
  if (!Array.isArray(parsed.entries)) {
    throw new Error('LEDGER_ENTRIES_NOT_ARRAY');
  }
  const schemaVersion = parsed.schemaVersion === 2 ? 2 : 1;
  const entries = parsed.entries.map(normalizeLegacyEntry);
  return {
    schemaVersion,
    appendOnly: parsed.appendOnly === true,
    entries,
  };
}

function validateWaiversArray(waivers) {
  if (!Array.isArray(waivers)) return { ok: false, reason: 'WAIVERS_NOT_ARRAY' };
  const now = Date.now();
  for (const w of waivers) {
    if (!w || typeof w !== 'object') return { ok: false, reason: 'WAIVER_ITEM_INVALID' };
    if (typeof w.gateId !== 'string' || !w.gateId) return { ok: false, reason: 'WAIVER_GATE_INVALID' };
    if (typeof w.reason !== 'string') return { ok: false, reason: 'WAIVER_REASON_INVALID' };
    if (typeof w.owner !== 'string' || !w.owner) return { ok: false, reason: 'WAIVER_OWNER_INVALID' };
    if (typeof w.ttl !== 'string' || !w.ttl) return { ok: false, reason: 'WAIVER_TTL_INVALID' };
    const ttlMs = Date.parse(w.ttl);
    if (!Number.isFinite(ttlMs)) return { ok: false, reason: 'WAIVER_TTL_PARSE_INVALID' };
    if (ttlMs < now) return { ok: false, reason: `WAIVER_TTL_EXPIRED:${w.gateId}` };
  }
  return { ok: true, reason: '' };
}

function validateLedger(ledger) {
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) return { ok: false, reason: 'LEDGER_INVALID_TOP' };
  if (ledger.appendOnly !== true) return { ok: false, reason: 'LEDGER_APPEND_ONLY_REQUIRED' };
  if (!Array.isArray(ledger.entries)) return { ok: false, reason: 'LEDGER_ENTRIES_NOT_ARRAY' };

  const seenEntryIds = new Set();
  let prev = 'GENESIS';
  for (let index = 0; index < ledger.entries.length; index += 1) {
    const entry = normalizeLegacyEntry(ledger.entries[index]);
    ledger.entries[index] = entry;

    if (!entry || typeof entry !== 'object') return { ok: false, reason: `ENTRY_NOT_OBJECT:${index}` };
    if (typeof entry.entryId !== 'string' || !entry.entryId) return { ok: false, reason: `ENTRY_ID_INVALID:${index}` };
    if (seenEntryIds.has(entry.entryId)) return { ok: false, reason: `ENTRY_ID_DUPLICATE:${index}` };
    seenEntryIds.add(entry.entryId);

    if (typeof entry.entryType !== 'string' || !ENTRY_TYPES.has(entry.entryType)) return { ok: false, reason: `ENTRY_TYPE_INVALID:${index}` };
    if (typeof entry.timestamp !== 'string' || !entry.timestamp) return { ok: false, reason: `ENTRY_TS_INVALID:${index}` };
    if (typeof entry.action !== 'string' || !entry.action) return { ok: false, reason: `ENTRY_ACTION_INVALID:${index}` };
    if (typeof entry.owner !== 'string' || !entry.owner) return { ok: false, reason: `ENTRY_OWNER_INVALID:${index}` };
    if (typeof entry.hoSignoff !== 'string' || !HOSIGNOFF_VALUES.has(entry.hoSignoff)) return { ok: false, reason: `ENTRY_SIGNOFF_INVALID:${index}` };
    if (typeof entry.prevHash !== 'string' || !entry.prevHash) return { ok: false, reason: `ENTRY_PREV_HASH_INVALID:${index}` };
    if (typeof entry.entryHash !== 'string' || !entry.entryHash) return { ok: false, reason: `ENTRY_HASH_INVALID:${index}` };
    if (entry.prevHash !== prev) return { ok: false, reason: `ENTRY_PREV_HASH_MISMATCH:${index}` };
    if (!Array.isArray(entry.waivers)) return { ok: false, reason: `ENTRY_WAIVERS_INVALID:${index}` };

    if (entry.entryType === 'exit') {
      if (typeof entry.p0Id !== 'string' || !entry.p0Id) return { ok: false, reason: `ENTRY_EXIT_P0_ID_INVALID:${index}` };
      if (typeof entry.ruleId !== 'string' || !entry.ruleId) return { ok: false, reason: `ENTRY_EXIT_RULE_ID_INVALID:${index}` };
    }
    if (entry.entryType === 'signoff') {
      if (typeof entry.refEntryId !== 'string' || !entry.refEntryId) return { ok: false, reason: `ENTRY_SIGNOFF_REF_INVALID:${index}` };
      if (!seenEntryIds.has(entry.refEntryId)) return { ok: false, reason: `ENTRY_SIGNOFF_REF_MISSING:${index}` };
    }
    if (entry.entryType === 'close') {
      if (typeof entry.contour !== 'string' || !entry.contour) return { ok: false, reason: `ENTRY_CLOSE_CONTOUR_INVALID:${index}` };
      if (!Number.isInteger(entry.p0Count) || entry.p0Count < 0) return { ok: false, reason: `ENTRY_CLOSE_P0_COUNT_INVALID:${index}` };
      if (typeof entry.productStep !== 'string' || !entry.productStep) return { ok: false, reason: `ENTRY_CLOSE_PRODUCT_STEP_INVALID:${index}` };
      if (typeof entry.refReport !== 'string' || !entry.refReport) return { ok: false, reason: `ENTRY_CLOSE_REF_REPORT_INVALID:${index}` };
    }

    const waiversCheck = validateWaiversArray(entry.waivers);
    if (!waiversCheck.ok) return { ok: false, reason: `${waiversCheck.reason}:${index}` };

    const computed = sha256(stableEntryPayload(entry));
    if (computed !== entry.entryHash) return { ok: false, reason: `ENTRY_HASH_MISMATCH:${index}` };
    prev = entry.entryHash;
  }

  return { ok: true, reason: '' };
}

function resolveResultPath(explicitPath) {
  if (explicitPath) return path.isAbsolute(explicitPath) ? explicitPath : path.join(ROOT, explicitPath);
  return RUN_RESULT_LATEST;
}

function createEntry({
  ledger,
  entryType,
  action,
  baselineSha,
  owner,
  hoSignoff,
  result,
  p0Id,
  ruleId,
  refEntryId,
  contour,
  p0Count,
  productStep,
  refReport,
}) {
  const last = ledger.entries.length > 0 ? ledger.entries[ledger.entries.length - 1] : null;
  const prevHash = last ? last.entryHash : 'GENESIS';
  const entryId = `entry-${String(ledger.entries.length + 1).padStart(4, '0')}`;
  const payload = {
    entryId,
    entryType,
    timestamp: nowIso(),
    action: action || 'record',
    baselineSha: baselineSha || '-',
    owner: owner || 'unknown',
    hoSignoff,
    p0Id: p0Id || '',
    ruleId: ruleId || '',
    refEntryId: refEntryId || '',
    contour: contour || '',
    p0Count: Number.isInteger(p0Count) ? p0Count : 0,
    productStep: productStep || '',
    refReport: refReport || '',
    kpi: {
      STRICT_LIE_CLASSES_OK: result?.kpi?.STRICT_LIE_CLASSES_OK ?? 0,
      CONTOUR_C_EXIT_IMPLEMENTED_P0_COUNT: result?.kpi?.CONTOUR_C_EXIT_IMPLEMENTED_P0_COUNT ?? 0,
      CONTOUR_C_ENFORCEMENT_VIOLATIONS_COUNT: result?.kpi?.CONTOUR_C_ENFORCEMENT_VIOLATIONS_COUNT ?? 0,
      WARN_DELTA_TARGET: result?.kpi?.WARN_DELTA_TARGET ?? 0,
    },
    waivers: Array.isArray(result?.waivers?.active) ? result.waivers.active : [],
    proof: {
      runResultPath: typeof result?._resultPath === 'string' ? result._resultPath : '',
      runStatus: result?.summary?.result ?? 'UNKNOWN',
    },
    prevHash,
    generatedBy: 'scripts/contour-c-ledger.mjs',
  };

  if (entryType === 'exit') payload.hoSignoff = hoSignoff === 'APPROVED' ? 'APPROVED' : 'PENDING';
  if (entryType === 'signoff') payload.hoSignoff = 'APPROVED';
  if (entryType === 'close') payload.hoSignoff = hoSignoff === 'APPROVED' ? 'APPROVED' : 'PENDING';

  payload.entryHash = sha256(stableEntryPayload(payload));
  return payload;
}

function checkMode() {
  const ledger = loadLedgerOrDefault();
  const valid = validateLedger(ledger);
  if (!valid.ok) {
    process.stdout.write('CONTOUR_C_LEDGER_CHECK=FAIL\n');
    process.stdout.write(`CONTOUR_C_LEDGER_FAIL_REASON=${valid.reason}\n`);
    process.exit(1);
  }

  if (ledger.schemaVersion !== 2) {
    ledger.schemaVersion = 2;
    writeJsonAtomic(LEDGER_PATH, ledger);
  }

  process.stdout.write('CONTOUR_C_LEDGER_CHECK=PASS\n');
  process.stdout.write(`CONTOUR_C_LEDGER_ENTRIES=${ledger.entries.length}\n`);
  process.exit(0);
}

function bootstrapMode(args) {
  ensureDir(OPS_CONTOUR_ROOT);
  if (fs.existsSync(LEDGER_PATH)) {
    const ledger = loadLedgerOrDefault();
    const valid = validateLedger(ledger);
    if (!valid.ok) throw new Error(`LEDGER_INVALID:${valid.reason}`);
    if (ledger.schemaVersion !== 2) {
      ledger.schemaVersion = 2;
      writeJsonAtomic(LEDGER_PATH, ledger);
    }
    process.stdout.write('CONTOUR_C_LEDGER_BOOTSTRAP=SKIP\n');
    process.stdout.write(`CONTOUR_C_LEDGER_ENTRIES=${ledger.entries.length}\n`);
    return;
  }

  const ledger = defaultLedger();
  const entry = createEntry({
    ledger,
    entryType: 'baseline',
    action: 'bootstrap',
    baselineSha: args.baselineSha || '-',
    owner: args.owner || 'HO',
    hoSignoff: 'N/A',
    result: null,
    p0Id: '',
    ruleId: '',
    refEntryId: '',
  });
  ledger.entries.push(entry);
  writeJsonAtomic(LEDGER_PATH, ledger);
  process.stdout.write('CONTOUR_C_LEDGER_BOOTSTRAP=PASS\n');
  process.stdout.write('CONTOUR_C_LEDGER_ENTRIES=1\n');
}

function recordMode(args) {
  ensureDir(OPS_CONTOUR_ROOT);
  const ledger = loadLedgerOrDefault();
  const valid = validateLedger(ledger);
  if (!valid.ok) throw new Error(`LEDGER_INVALID:${valid.reason}`);

  const resultPath = resolveResultPath(args.resultPath);
  if (!fs.existsSync(resultPath)) throw new Error('RUN_RESULT_MISSING');
  const result = readJson(resultPath);
  result._resultPath = path.relative(ROOT, resultPath).replaceAll('\\', '/');

  const baselineSha = args.baselineSha || (ledger.entries.length > 0 ? ledger.entries[0].baselineSha : '-');
  const owner = args.owner || 'HO';
  const entryType = args.entryType || 'baseline';
  if (!ENTRY_TYPES.has(entryType)) throw new Error('ENTRY_TYPE_INVALID');

  if (entryType === 'exit' && (!args.p0Id || !args.ruleId)) {
    throw new Error('ENTRY_EXIT_REQUIRES_P0_AND_RULE');
  }
  if (entryType === 'signoff' && !args.refEntryId) {
    throw new Error('ENTRY_SIGNOFF_REQUIRES_REF');
  }
  if (entryType === 'close') {
    if (!args.contour) throw new Error('ENTRY_CLOSE_REQUIRES_CONTOUR');
    if (!Number.isInteger(args.p0Count) || args.p0Count < 0) throw new Error('ENTRY_CLOSE_REQUIRES_P0_COUNT');
    if (!args.productStep) throw new Error('ENTRY_CLOSE_REQUIRES_PRODUCT_STEP');
    if (!args.refReport) throw new Error('ENTRY_CLOSE_REQUIRES_REF_REPORT');
  }

  const entry = createEntry({
    ledger,
    entryType,
    action: args.action || 'record',
    baselineSha,
    owner,
    hoSignoff: args.hoSignoff || (entryType === 'exit' ? 'PENDING' : 'N/A'),
    result,
    p0Id: args.p0Id,
    ruleId: args.ruleId,
    refEntryId: args.refEntryId,
    contour: args.contour,
    p0Count: args.p0Count,
    productStep: args.productStep,
    refReport: args.refReport,
  });

  ledger.entries.push(entry);
  const check = validateLedger(ledger);
  if (!check.ok) throw new Error(`LEDGER_INVALID_AFTER_RECORD:${check.reason}`);

  ledger.schemaVersion = 2;
  writeJsonAtomic(LEDGER_PATH, ledger);

  process.stdout.write('CONTOUR_C_LEDGER_RECORD=PASS\n');
  process.stdout.write(`CONTOUR_C_LEDGER_ENTRY_ID=${entry.entryId}\n`);
  process.stdout.write(`CONTOUR_C_LEDGER_ENTRY_TYPE=${entry.entryType}\n`);
  process.stdout.write(`CONTOUR_C_LEDGER_ENTRIES=${ledger.entries.length}\n`);
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === 'check') checkMode();
  else if (args.mode === 'bootstrap') bootstrapMode(args);
  else if (args.mode === 'record') recordMode(args);
  else throw new Error('UNKNOWN_MODE');
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  process.stdout.write('CONTOUR_C_LEDGER_RESULT=FAIL\n');
  process.stdout.write(`CONTOUR_C_LEDGER_FAIL_REASON=${message}\n`);
  process.exit(1);
}
