#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_CANON_PATH = 'docs/OPS/STATUS/COMMAND_NAMESPACE_CANON.json';
const DEFAULT_SCAN_ROOT = 'src';
const MODE_RELEASE = 'release';
const MODE_PROMOTION = 'promotion';
const RESULT_PASS = 'PASS';
const RESULT_WARN = 'WARN';
const RESULT_FAIL = 'FAIL';
const FAIL_SIGNAL_CODE = 'E_COMMAND_NAMESPACE_UNKNOWN';
const JS_EXT_RE = /\.(?:[cm]?js)$/u;

const ALLOWED_HIT_PATH_SEGMENTS = Object.freeze([
  '/test/fixtures/',
]);

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

function resolveMode(inputMode) {
  const explicitMode = normalizeString(inputMode);
  if (explicitMode) return normalizeMode(explicitMode);
  if (parseBooleanish(process.env.promotionMode)
    || parseBooleanish(process.env.PROMOTION_MODE)
    || parseBooleanish(process.env.WAVE_PROMOTION_MODE)) {
    return MODE_PROMOTION;
  }
  return MODE_RELEASE;
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    json: false,
    mode: '',
    canonPath: DEFAULT_CANON_PATH,
    scanRoot: DEFAULT_SCAN_ROOT,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = normalizeString(argv[i]);
    if (!arg) continue;
    if (arg === '--json') {
      out.json = true;
      continue;
    }
    if (arg === '--mode' && i + 1 < argv.length) {
      out.mode = normalizeString(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith('--mode=')) {
      out.mode = normalizeString(arg.slice('--mode='.length));
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
    if (arg === '--scan-root' && i + 1 < argv.length) {
      out.scanRoot = normalizeString(argv[i + 1]) || DEFAULT_SCAN_ROOT;
      i += 1;
      continue;
    }
    if (arg.startsWith('--scan-root=')) {
      out.scanRoot = normalizeString(arg.slice('--scan-root='.length)) || DEFAULT_SCAN_ROOT;
    }
  }
  return out;
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readCanon(cwd, canonPathRaw) {
  const canonPath = path.resolve(cwd, canonPathRaw);
  const parsed = JSON.parse(fs.readFileSync(canonPath, 'utf8'));
  const deprecatedPrefixes = Array.isArray(parsed.deprecatedPrefixes)
    ? [...new Set(parsed.deprecatedPrefixes.map((entry) => normalizeString(entry)).filter(Boolean))]
    : [];
  const aliasMap = isObjectRecord(parsed.aliasMap) ? parsed.aliasMap : {};
  return {
    canonPath,
    deprecatedPrefixes,
    aliasMapKeys: Object.keys(aliasMap).sort((a, b) => a.localeCompare(b)),
  };
}

function collectFilesRecursive(absRoot, out = []) {
  if (!fs.existsSync(absRoot)) return out;
  const entries = fs.readdirSync(absRoot, { withFileTypes: true });
  for (const entry of entries) {
    const absPath = path.join(absRoot, entry.name);
    if (entry.isDirectory()) {
      collectFilesRecursive(absPath, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!JS_EXT_RE.test(entry.name)) continue;
    out.push(absPath);
  }
  return out;
}

function toRepoPath(cwd, absPath) {
  return path.relative(cwd, absPath).replaceAll(path.sep, '/');
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isAllowedAliasZone(hit) {
  const filePath = `/${hit.filePath}/`;
  if (ALLOWED_HIT_PATH_SEGMENTS.some((segment) => filePath.includes(segment))) return true;
  if (/\baliasMap\b/u.test(hit.lineText)) return true;
  if (/\bALIAS\b/u.test(hit.lineText)) return true;
  return false;
}

function collectLegacyPrefixHits(cwd, scanRootRaw, deprecatedPrefixes) {
  const scanRootAbs = path.resolve(cwd, scanRootRaw);
  const files = collectFilesRecursive(scanRootAbs).sort((a, b) => a.localeCompare(b));
  const rawHits = [];
  const compiled = deprecatedPrefixes.map((prefix) => ({
    prefix,
    pattern: new RegExp(`${escapeRegExp(prefix)}[a-zA-Z0-9._-]+`, 'g'),
  }));

  for (const absPath of files) {
    const filePath = toRepoPath(cwd, absPath);
    const text = fs.readFileSync(absPath, 'utf8');
    const lines = text.split(/\r?\n/u);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const lineText = String(lines[lineIndex] || '');
      for (const matcher of compiled) {
        matcher.pattern.lastIndex = 0;
        let match = null;
        while ((match = matcher.pattern.exec(lineText)) !== null) {
          rawHits.push({
            filePath,
            line: lineIndex + 1,
            commandId: String(match[0] || ''),
            deprecatedPrefix: matcher.prefix,
            lineText: lineText.trim(),
          });
        }
      }
    }
  }

  const allowedHits = rawHits.filter((hit) => isAllowedAliasZone(hit));
  const violations = rawHits.filter((hit) => !isAllowedAliasZone(hit));
  return {
    scanRoot: toRepoPath(cwd, scanRootAbs),
    scannedFiles: files.map((absPath) => toRepoPath(cwd, absPath)),
    rawHits,
    allowedHits,
    violations,
  };
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

export function evaluateCommandNamespaceStaticCheck(input = {}) {
  const cwd = normalizeString(input.cwd) || process.cwd();
  const mode = resolveMode(input.mode);
  const canon = readCanon(cwd, normalizeString(input.canonPath) || DEFAULT_CANON_PATH);
  const scanState = collectLegacyPrefixHits(
    cwd,
    normalizeString(input.scanRoot) || DEFAULT_SCAN_ROOT,
    canon.deprecatedPrefixes,
  );

  const hasViolations = scanState.violations.length > 0;
  const result = !hasViolations
    ? RESULT_PASS
    : (mode === MODE_PROMOTION ? RESULT_FAIL : RESULT_WARN);

  return {
    mode,
    result,
    failSignalCode: result === RESULT_FAIL ? FAIL_SIGNAL_CODE : '',
    failReason: hasViolations ? 'LEGACY_PREFIX_LITERAL_FOUND' : '',
    deprecatedPrefixes: canon.deprecatedPrefixes,
    aliasMapSize: canon.aliasMapKeys.length,
    scanRoot: scanState.scanRoot,
    scannedFilesCount: scanState.scannedFiles.length,
    scannedFiles: scanState.scannedFiles,
    legacyPrefixHits: scanState.rawHits.length,
    allowedHits: scanState.allowedHits,
    violations: scanState.violations,
  };
}

function printHuman(payload) {
  console.log(`COMMAND_NAMESPACE_STATIC_RESULT=${payload.result}`);
  console.log(`COMMAND_NAMESPACE_STATIC_MODE=${payload.mode}`);
  console.log(`COMMAND_NAMESPACE_STATIC_HITS=${payload.legacyPrefixHits}`);
  console.log(`COMMAND_NAMESPACE_STATIC_VIOLATIONS=${payload.violations.length}`);
  console.log(`COMMAND_NAMESPACE_STATIC_DEPRECATED_PREFIXES=${JSON.stringify(payload.deprecatedPrefixes)}`);
  if (payload.failReason) console.log(`COMMAND_NAMESPACE_STATIC_FAIL_REASON=${payload.failReason}`);
  if (payload.failSignalCode) console.log(`COMMAND_NAMESPACE_STATIC_FAIL_SIGNAL=${payload.failSignalCode}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const payload = evaluateCommandNamespaceStaticCheck({
    mode: args.mode,
    canonPath: args.canonPath,
    scanRoot: args.scanRoot,
  });
  if (args.json) process.stdout.write(`${stableStringify(payload)}\n`);
  else printHuman(payload);
  process.exit(payload.result === RESULT_FAIL ? 1 : 0);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
