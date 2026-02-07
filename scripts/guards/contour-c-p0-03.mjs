#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const RULE_ID = 'C-P0-03-RULE-001';
const DEFAULT_REQUIRED_GATES_PATH = 'docs/OPS/CONTOUR_C/README.md';
const DEFAULT_WAIVED_GATES_PATH = 'docs/OPS/CONTOUR_C/WAIVED_GATES.json';
const REQUIRED_GATES_HEADER = '## REQUIRED_GATES';

function parseArgs(argv) {
  const out = {
    requiredGatesPath: DEFAULT_REQUIRED_GATES_PATH,
    waivedGatesPath: DEFAULT_WAIVED_GATES_PATH,
    ruleId: RULE_ID,
    nowIso: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--required-gates') out.requiredGatesPath = argv[index + 1] ?? out.requiredGatesPath;
    if (arg === '--waived-gates') out.waivedGatesPath = argv[index + 1] ?? out.waivedGatesPath;
    if (arg === '--rule-id') out.ruleId = argv[index + 1] ?? out.ruleId;
    if (arg === '--now-iso') out.nowIso = argv[index + 1] ?? out.nowIso;
    if (arg === '--required-gates' || arg === '--waived-gates' || arg === '--rule-id' || arg === '--now-iso') {
      index += 1;
    }
  }
  return out;
}

function normalizeRepoRelativePosixPath(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim().replaceAll('\\', '/');
  if (!v || v.startsWith('/')) return null;
  if (v.split('/').includes('..')) return null;
  return v;
}

function parseRequiredGates(markdownPath) {
  const markdown = fs.readFileSync(markdownPath, 'utf8');
  const lines = markdown.split(/\r?\n/);
  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() === REQUIRED_GATES_HEADER) {
      start = index + 1;
      break;
    }
  }
  if (start === -1) {
    return { ok: false, reason: 'REQUIRED_GATES_SECTION_MISSING', items: [] };
  }

  const out = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^##\s+/.test(line.trim())) break;
    const match = line.match(/^\s*-\s*`?([^`]+?)`?\s*$/);
    if (!match) continue;
    const parts = match[1].split('|').map((part) => part.trim());
    if (parts.length !== 3) {
      return { ok: false, reason: 'REQUIRED_GATES_ROW_INVALID', items: [] };
    }
    const [gateIdRaw, kindRaw, targetRaw] = parts;
    const gateId = gateIdRaw;
    const kind = kindRaw.toLowerCase();
    if (!gateId || !/^C-GATE-\d{3}$/.test(gateId)) {
      return { ok: false, reason: 'GATE_ID_INVALID', items: [] };
    }
    if (!['script', 'file', 'command'].includes(kind)) {
      return { ok: false, reason: 'GATE_KIND_INVALID', items: [] };
    }
    const target = kind === 'command' ? targetRaw : normalizeRepoRelativePosixPath(targetRaw);
    if (!target) {
      return { ok: false, reason: 'GATE_TARGET_INVALID', items: [] };
    }
    out.push({ gateId, kind, target });
  }

  if (out.length === 0) {
    return { ok: false, reason: 'REQUIRED_GATES_EMPTY', items: [] };
  }

  const dedupe = new Map();
  for (const item of out) {
    if (dedupe.has(item.gateId)) {
      return { ok: false, reason: 'GATE_ID_DUPLICATE', items: [] };
    }
    dedupe.set(item.gateId, item);
  }

  return {
    ok: true,
    reason: '',
    items: [...dedupe.values()].sort((left, right) => left.gateId.localeCompare(right.gateId)),
  };
}

function parseWaivedGates(waivedPath) {
  if (!fs.existsSync(waivedPath)) {
    return { ok: true, reason: '', waivers: [] };
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(waivedPath, 'utf8'));
  } catch {
    return { ok: false, reason: 'WAIVED_GATES_JSON_INVALID', waivers: [] };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'WAIVED_GATES_TOP_LEVEL_INVALID', waivers: [] };
  }
  if (!Array.isArray(parsed.waivers)) {
    return { ok: false, reason: 'WAIVED_GATES_NOT_ARRAY', waivers: [] };
  }

  const waivers = [];
  for (const item of parsed.waivers) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, reason: 'WAIVER_ITEM_INVALID', waivers: [] };
    }
    const gateId = typeof item.gateId === 'string' ? item.gateId : '';
    const reason = typeof item.reason === 'string' ? item.reason : '';
    const owner = typeof item.owner === 'string' ? item.owner : '';
    const ttl = typeof item.ttl === 'string' ? item.ttl : '';
    if (!gateId || !reason || !owner || !ttl) {
      return { ok: false, reason: 'WAIVER_FIELDS_INVALID', waivers: [] };
    }
    waivers.push({ gateId, reason, owner, ttl });
  }

  return { ok: true, reason: '', waivers };
}

function commandExists(commandName) {
  if (!commandName || /\s/.test(commandName)) return false;
  const pathEnv = process.env.PATH ?? '';
  const entries = pathEnv.split(path.delimiter).filter(Boolean);
  for (const entry of entries) {
    const candidate = path.join(entry, commandName);
    if (fs.existsSync(candidate)) return true;
  }
  return false;
}

function gateExists(gate) {
  if (gate.kind === 'command') return commandExists(gate.target);
  return fs.existsSync(gate.target);
}

function printFact({ ruleId, gateId, status, reason, ttl }) {
  process.stdout.write(`RULE_ID=${ruleId}\n`);
  process.stdout.write(`GATE_ID=${gateId}\n`);
  process.stdout.write(`STATUS=${status}\n`);
  process.stdout.write(`REASON=${reason}\n`);
  process.stdout.write(`TTL=${ttl ?? '-'}\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const nowMs = args.nowIso ? Date.parse(args.nowIso) : Date.now();
  if (!Number.isFinite(nowMs)) {
    printFact({
      ruleId: args.ruleId,
      gateId: 'C-GATE-000',
      status: 'MISSING',
      reason: 'NOW_ISO_INVALID',
      ttl: '-',
    });
    process.exit(1);
  }

  let gates = parseRequiredGates(args.requiredGatesPath);
  if (!gates.ok) {
    printFact({
      ruleId: args.ruleId,
      gateId: 'C-GATE-000',
      status: 'MISSING',
      reason: gates.reason,
      ttl: '-',
    });
    process.exit(1);
  }
  gates = gates.items;

  const waiversResult = parseWaivedGates(args.waivedGatesPath);
  if (!waiversResult.ok) {
    printFact({
      ruleId: args.ruleId,
      gateId: 'C-GATE-000',
      status: 'MISSING',
      reason: waiversResult.reason,
      ttl: '-',
    });
    process.exit(1);
  }

  const waiverByGate = new Map();
  for (const waiver of waiversResult.waivers) {
    if (!waiverByGate.has(waiver.gateId)) {
      waiverByGate.set(waiver.gateId, waiver);
    }
  }

  let hasMissing = false;
  for (const gate of gates) {
    const exists = gateExists(gate);
    const waiver = waiverByGate.get(gate.gateId);
    const ttlMs = waiver ? Date.parse(waiver.ttl) : Number.NaN;
    const waiverValid = waiver && Number.isFinite(ttlMs) && ttlMs >= nowMs;

    if (exists) {
      printFact({
        ruleId: args.ruleId,
        gateId: gate.gateId,
        status: 'OK',
        reason: 'GATE_EXISTS',
        ttl: '-',
      });
      continue;
    }

    if (waiverValid) {
      printFact({
        ruleId: args.ruleId,
        gateId: gate.gateId,
        status: 'WAIVED',
        reason: `WAIVER_ACTIVE:${waiver.reason}`,
        ttl: waiver.ttl,
      });
      continue;
    }

    hasMissing = true;
    if (waiver) {
      printFact({
        ruleId: args.ruleId,
        gateId: gate.gateId,
        status: 'MISSING',
        reason: 'WAIVER_TTL_EXPIRED',
        ttl: waiver.ttl,
      });
      continue;
    }

    printFact({
      ruleId: args.ruleId,
      gateId: gate.gateId,
      status: 'MISSING',
      reason: 'GATE_NOT_FOUND',
      ttl: '-',
    });
  }

  process.exit(hasMissing ? 1 : 0);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  printFact({
    ruleId: RULE_ID,
    gateId: 'C-GATE-000',
    status: 'MISSING',
    reason: `UNHANDLED:${message}`,
    ttl: '-',
  });
  process.exit(1);
}
