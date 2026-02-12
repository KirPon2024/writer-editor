#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const TOOL_VERSION = 'macos-signing-readiness-state.v1';
const DEFAULT_READINESS_PATH = 'docs/OPS/STATUS/MACOS_SIGNING_READINESS.json';
const MAX_SCAN_BYTES = 256 * 1024;
const TEXT_SCAN_EXTENSIONS = new Set([
  '.json',
  '.md',
  '.txt',
  '.yml',
  '.yaml',
  '.plist',
  '.entitlements',
  '.sh',
  '.ini',
]);

function stableSortValue(value) {
  if (Array.isArray(value)) return value.map((item) => stableSortValue(item));
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = stableSortValue(value[key]);
  return out;
}

function stableStringify(value) {
  return JSON.stringify(stableSortValue(value));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function parseJsonObject(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function normalizeStringList(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    const value = String(item || '').trim();
    if (value) out.push(value);
  }
  return [...new Set(out)].sort();
}

function isSafeRepoRelativePath(value) {
  const candidate = String(value || '').trim();
  if (!candidate || path.isAbsolute(candidate)) return false;
  if (candidate.includes('\\')) return false;
  if (candidate.split('/').includes('..')) return false;
  return true;
}

function canScanText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!TEXT_SCAN_EXTENSIONS.has(ext)) return false;
  let stat = null;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return false;
  }
  return stat.isFile() && stat.size <= MAX_SCAN_BYTES;
}

function findPlaceholderMarkers(text, markers, prefix) {
  const findings = [];
  for (const marker of markers) {
    if (text.includes(marker)) findings.push(`${prefix}:${marker}`);
  }
  return findings;
}

function parseArgs(argv) {
  const out = {
    json: false,
    readinessPath: '',
    repoRoot: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    else if (arg === '--readiness-path') {
      out.readinessPath = String(argv[i + 1] || '').trim();
      i += 1;
    } else if (arg === '--repo-root') {
      out.repoRoot = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }
  return out;
}

export function evaluateMacosSigningReadinessState(input = {}) {
  const readinessPath = String(input.readinessPath || DEFAULT_READINESS_PATH).trim();
  const repoRoot = String(input.repoRoot || process.cwd()).trim() || process.cwd();
  const doc = parseJsonObject(readinessPath);
  const normalizedDoc = doc && typeof doc === 'object' ? stableSortValue(doc) : {};
  const configSha256 = sha256(stableStringify(normalizedDoc));

  const schemaVersion = doc && typeof doc.schemaVersion === 'string' ? doc.schemaVersion.trim() : '';
  const statusRaw = doc && typeof doc.status === 'string' ? doc.status.trim().toUpperCase() : '';
  const status = statusRaw === 'READY' || statusRaw === 'PLACEHOLDER' ? statusRaw : 'PLACEHOLDER';
  const requiredArtifacts = normalizeStringList(doc ? doc.requiredArtifacts : []);
  const forbiddenPlaceholders = normalizeStringList(doc ? doc.forbiddenPlaceholders : []);
  const notes = doc && typeof doc.notes === 'string' ? doc.notes : '';

  const missingArtifacts = [];
  for (const artifact of requiredArtifacts) {
    if (!isSafeRepoRelativePath(artifact)) {
      missingArtifacts.push(artifact);
      continue;
    }
    const fullPath = path.resolve(repoRoot, artifact);
    if (!fs.existsSync(fullPath)) missingArtifacts.push(artifact);
  }
  missingArtifacts.sort();

  const placeholderFindings = [];
  const searchableConfig = stableStringify({
    schemaVersion,
    status,
    requiredArtifacts,
    notes,
  });
  placeholderFindings.push(...findPlaceholderMarkers(searchableConfig, forbiddenPlaceholders, 'config'));

  for (const artifact of requiredArtifacts) {
    if (!isSafeRepoRelativePath(artifact)) continue;
    const fullPath = path.resolve(repoRoot, artifact);
    if (!fs.existsSync(fullPath) || !canScanText(fullPath)) continue;
    const text = fs.readFileSync(fullPath, 'utf8');
    placeholderFindings.push(...findPlaceholderMarkers(text, forbiddenPlaceholders, artifact));
  }
  placeholderFindings.sort();

  const ok = schemaVersion === 'macos-signing-readiness.v1'
    && status === 'READY'
    && missingArtifacts.length === 0
    && placeholderFindings.length === 0;

  return {
    ok,
    status,
    missingArtifacts,
    placeholderFindings,
    configSha256,
    XPLAT_CONTRACT_MACOS_SIGNING_READY_OK: ok ? 1 : 0,
    toolVersion: TOOL_VERSION,
  };
}

function printTokens(state) {
  console.log(`XPLAT_CONTRACT_MACOS_SIGNING_READY_OK=${state.XPLAT_CONTRACT_MACOS_SIGNING_READY_OK}`);
  console.log(`MACOS_SIGNING_READINESS_STATUS=${state.status}`);
  console.log(`MACOS_SIGNING_READINESS_MISSING_ARTIFACTS=${JSON.stringify(state.missingArtifacts)}`);
  console.log(`MACOS_SIGNING_READINESS_PLACEHOLDER_FINDINGS=${JSON.stringify(state.placeholderFindings)}`);
  console.log(`MACOS_SIGNING_READINESS_CONFIG_SHA256=${state.configSha256}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateMacosSigningReadinessState({
    readinessPath: args.readinessPath,
    repoRoot: args.repoRoot,
  });
  if (args.json) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  } else {
    printTokens(state);
  }
  process.exit(0);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
