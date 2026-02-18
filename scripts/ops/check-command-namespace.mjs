#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_CANON_PATH = 'docs/OPS/STATUS/COMMAND_NAMESPACE_CANON.json';
const DEFAULT_SCAN_ROOTS = Object.freeze([
  'src',
  'src/menu',
  'src/renderer',
]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;
const RESULT_PASS = 'PASS';
const RESULT_WARN = 'WARN';
const RESULT_FAIL = 'FAIL';
const MODE_RELEASE = 'release';
const MODE_PROMOTION = 'promotion';
const FAIL_SIGNAL = 'E_COMMAND_NAMESPACE_DRIFT';

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseBooleanish(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) return false;
  return normalized === '1'
    || normalized === 'true'
    || normalized === 'yes'
    || normalized === 'on';
}

function normalizeMode(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (normalized === MODE_PROMOTION) return MODE_PROMOTION;
  return MODE_RELEASE;
}

function resolveMode(args) {
  const explicitMode = normalizeString(args.mode);
  if (explicitMode) return normalizeMode(explicitMode);
  if (parseBooleanish(process.env.promotionMode)
    || parseBooleanish(process.env.PROMOTION_MODE)
    || parseBooleanish(process.env.WAVE_PROMOTION_MODE)) {
    return MODE_PROMOTION;
  }
  return MODE_RELEASE;
}

function resolveTodayDate(rawValue) {
  const normalized = normalizeString(rawValue);
  if (DATE_RE.test(normalized)) return normalized;
  return new Date().toISOString().slice(0, 10);
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizePrefixes(value) {
  if (!Array.isArray(value)) return [];
  const unique = new Set();
  for (const entry of value) {
    const normalized = normalizeString(entry);
    if (!normalized) continue;
    unique.add(normalized);
  }
  return [...unique];
}

function normalizeAliasMap(value) {
  if (!isObjectRecord(value)) return {};
  const out = {};
  for (const [rawLegacy, rawCanonical] of Object.entries(value)) {
    const legacyId = normalizeString(rawLegacy);
    const canonicalId = normalizeString(rawCanonical);
    if (!legacyId || !canonicalId) continue;
    out[legacyId] = canonicalId;
  }
  return out;
}

function readCanon(canonPath) {
  const raw = JSON.parse(fs.readFileSync(canonPath, 'utf8'));
  const aliasPolicy = isObjectRecord(raw.aliasPolicy) ? raw.aliasPolicy : {};
  return {
    canonicalPrefix: normalizeString(raw.canonicalPrefix),
    deprecatedPrefixes: normalizePrefixes(raw.deprecatedPrefixes),
    aliasPolicy: {
      allowDeprecatedInConfigsUntil: DATE_RE.test(String(aliasPolicy.allowDeprecatedInConfigsUntil || '').trim())
        ? String(aliasPolicy.allowDeprecatedInConfigsUntil).trim()
        : '',
      resolutionRule: normalizeString(aliasPolicy.resolutionRule),
      noNewDeprecatedCommandIds: aliasPolicy.noNewDeprecatedCommandIds === true,
    },
    aliasMap: normalizeAliasMap(raw.aliasMap),
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    json: false,
    mode: '',
    canonPath: DEFAULT_CANON_PATH,
    today: '',
    scanRoots: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = normalizeString(argv[i]);
    if (!arg) continue;
    if (arg === '--json') {
      out.json = true;
      continue;
    }
    if (arg.startsWith('--mode=')) {
      out.mode = arg.slice('--mode='.length);
      continue;
    }
    if (arg === '--mode' && i + 1 < argv.length) {
      out.mode = normalizeString(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--canon' && i + 1 < argv.length) {
      out.canonPath = normalizeString(argv[i + 1]) || DEFAULT_CANON_PATH;
      i += 1;
      continue;
    }
    if (arg.startsWith('--canon=')) {
      out.canonPath = normalizeString(arg.slice('--canon='.length)) || DEFAULT_CANON_PATH;
      continue;
    }
    if (arg === '--today' && i + 1 < argv.length) {
      out.today = normalizeString(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith('--today=')) {
      out.today = normalizeString(arg.slice('--today='.length));
      continue;
    }
    if (arg === '--scan-root' && i + 1 < argv.length) {
      const value = normalizeString(argv[i + 1]);
      if (value) out.scanRoots.push(value);
      i += 1;
      continue;
    }
    if (arg.startsWith('--scan-root=')) {
      const value = normalizeString(arg.slice('--scan-root='.length));
      if (value) out.scanRoots.push(value);
    }
  }
  return out;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectFilesRecursive(absDir, out = []) {
  if (!fs.existsSync(absDir)) return out;
  const entries = fs.readdirSync(absDir, { withFileTypes: true });
  for (const entry of entries) {
    const absPath = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      collectFilesRecursive(absPath, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/\.(?:[cm]?js|json|tsx?|jsx|mts|cts)$/u.test(entry.name)) continue;
    out.push(absPath);
  }
  return out;
}

function toRepoRelative(cwd, absPath) {
  return path.relative(cwd, absPath).replaceAll(path.sep, '/');
}

function collectDeprecatedHits({ cwd, scanRoots, deprecatedPrefixes }) {
  const hits = [];
  const files = [];
  const seenFiles = new Set();
  const matchers = deprecatedPrefixes.map((prefix) => ({
    prefix,
    pattern: new RegExp(`${escapeRegExp(prefix)}[a-zA-Z0-9._-]+`, 'g'),
  }));

  for (const root of scanRoots) {
    const absRoot = path.resolve(cwd, root);
    const absFiles = collectFilesRecursive(absRoot);
    for (const absPath of absFiles) {
      const relPath = toRepoRelative(cwd, absPath);
      if (!seenFiles.has(relPath)) {
        seenFiles.add(relPath);
        files.push(relPath);
      }
      const text = fs.readFileSync(absPath, 'utf8');
      for (const matcher of matchers) {
        matcher.pattern.lastIndex = 0;
        let match = null;
        while ((match = matcher.pattern.exec(text)) !== null) {
          const commandId = String(match[0] || '');
          hits.push({
            filePath: relPath,
            commandId,
            deprecatedPrefix: matcher.prefix,
            aliasedTo: '',
          });
        }
      }
    }
  }
  return { hits, filesScanned: [...files].sort((a, b) => a.localeCompare(b)) };
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

function normalizeScanRoots(rawScanRoots) {
  const source = rawScanRoots.length > 0 ? rawScanRoots : [...DEFAULT_SCAN_ROOTS];
  const unique = new Set();
  for (const root of source) {
    const normalized = normalizeString(root);
    if (!normalized) continue;
    unique.add(normalized);
  }
  return [...unique];
}

export function evaluateCommandNamespaceCheck(input = {}) {
  const cwd = normalizeString(input.cwd) || process.cwd();
  const scanRoots = normalizeScanRoots(Array.isArray(input.scanRoots) ? input.scanRoots : []);
  const canonPath = path.resolve(cwd, normalizeString(input.canonPath) || DEFAULT_CANON_PATH);
  const mode = resolveMode({ mode: input.mode });
  const today = resolveTodayDate(input.today);

  const canon = readCanon(canonPath);
  const cutoff = canon.aliasPolicy.allowDeprecatedInConfigsUntil;
  const sunsetExpired = cutoff ? today > cutoff : false;
  const scanState = collectDeprecatedHits({
    cwd,
    scanRoots,
    deprecatedPrefixes: canon.deprecatedPrefixes,
  });

  const aliasMap = canon.aliasMap;
  const hitsWithAlias = scanState.hits.map((hit) => ({
    ...hit,
    aliasedTo: normalizeString(aliasMap[hit.commandId]),
  }));
  const missingAliases = hitsWithAlias.filter((hit) => !hit.aliasedTo);

  let result = RESULT_PASS;
  let failReason = '';
  if (missingAliases.length > 0) {
    result = RESULT_FAIL;
    failReason = 'COMMAND_NAMESPACE_ALIAS_MISSING';
  } else if (hitsWithAlias.length > 0 && sunsetExpired && mode === MODE_PROMOTION) {
    result = RESULT_FAIL;
    failReason = 'COMMAND_NAMESPACE_SUNSET_EXPIRED';
  } else if (hitsWithAlias.length > 0 && sunsetExpired) {
    result = RESULT_WARN;
    failReason = 'COMMAND_NAMESPACE_SUNSET_EXPIRED_ADVISORY_RELEASE_MODE';
  }

  return {
    deprecatedHits: hitsWithAlias.length,
    mode,
    sunsetExpired,
    result,
    failReason,
    failSignalCode: result === RESULT_FAIL ? FAIL_SIGNAL : '',
    allowDeprecatedInConfigsUntil: cutoff,
    canonicalPrefix: canon.canonicalPrefix,
    scanRoots,
    filesScanned: scanState.filesScanned,
    missingAliases,
    deprecatedEntries: hitsWithAlias,
  };
}

function printHuman(payload) {
  console.log(`COMMAND_NAMESPACE_CHECK_RESULT=${payload.result}`);
  console.log(`COMMAND_NAMESPACE_CHECK_MODE=${payload.mode}`);
  console.log(`COMMAND_NAMESPACE_CHECK_DEPRECATED_HITS=${payload.deprecatedHits}`);
  console.log(`COMMAND_NAMESPACE_CHECK_SUNSET_EXPIRED=${payload.sunsetExpired ? 1 : 0}`);
  console.log(`COMMAND_NAMESPACE_CHECK_MISSING_ALIASES=${JSON.stringify(payload.missingAliases)}`);
  if (payload.failReason) {
    console.log(`COMMAND_NAMESPACE_CHECK_FAIL_REASON=${payload.failReason}`);
  }
  if (payload.failSignalCode) {
    console.log(`COMMAND_NAMESPACE_CHECK_FAIL_SIGNAL=${payload.failSignalCode}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const payload = evaluateCommandNamespaceCheck({
    mode: args.mode,
    canonPath: args.canonPath,
    today: args.today,
    scanRoots: args.scanRoots,
  });
  if (args.json) process.stdout.write(`${stableStringify(payload)}\n`);
  else printHuman(payload);
  process.exit(payload.result === RESULT_FAIL ? 1 : 0);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
