#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const TOOL_VERSION = 'scr-calc.v1';
const ROOT = process.cwd();
const SRC_ROOT = 'src';
const SHARED_INCLUDE_DIRS = ['src/core', 'src/shared', 'src/ports', 'src/adapters'];
const EXCLUDE_PREFIXES = ['test/', 'scripts/', 'dev-tools/', 'vendor/', 'node_modules/', 'generated/'];
const TOKEN_THRESHOLD = 0.85;

const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json', '.css', '.html', '.md']);

function normalizePath(p) {
  return p.split(path.sep).join('/');
}

function isExcluded(relPath) {
  const normalized = normalizePath(relPath);
  return EXCLUDE_PREFIXES.some((prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix));
}

function isPlatformSpecificAdapter(relPath) {
  const normalized = normalizePath(relPath).toLowerCase();
  if (!normalized.startsWith('src/adapters/')) return false;
  const tags = ['/platform/', '/electron/', '/desktop/', '/web/', '/android/', '/ios/', '/windows/', '/linux/', '/macos/'];
  return tags.some((tag) => normalized.includes(tag));
}

function isTextFile(relPath) {
  const ext = path.extname(relPath).toLowerCase();
  return TEXT_EXT.has(ext);
}

function isCommentOnlyLine(trimmed) {
  if (!trimmed) return false;
  if (trimmed.startsWith('//')) return true;
  if (trimmed.startsWith('/*')) return true;
  if (trimmed === '*/') return true;
  if (trimmed.startsWith('*')) return true;
  if (trimmed.startsWith('#')) return true;
  if (trimmed.startsWith('<!--') && trimmed.endsWith('-->')) return true;
  return false;
}

function countLoc(filePath) {
  let text = '';
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch {
    return 0;
  }
  let count = 0;
  for (const rawLine of text.split(/\r?\n/u)) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (isCommentOnlyLine(trimmed)) continue;
    count += 1;
  }
  return count;
}

function walkFiles(rootDir) {
  const out = [];
  if (!fs.existsSync(rootDir)) return out;
  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = normalizePath(path.relative(ROOT, fullPath));
      if (entry.isDirectory()) {
        if (isExcluded(relPath)) continue;
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (isExcluded(relPath)) continue;
      if (!isTextFile(relPath)) continue;
      out.push(relPath);
    }
  }
  return out.sort();
}

function buildConfigHash() {
  const normalized = {
    toolVersion: TOOL_VERSION,
    sourceRoot: SRC_ROOT,
    include: SHARED_INCLUDE_DIRS,
    exclude: EXCLUDE_PREFIXES,
    textExtensions: [...TEXT_EXT].sort(),
    rules: ['non-blank', 'not-comment-only', 'exclude-platform-specific-adapters'],
  };
  const payload = JSON.stringify(normalized);
  return createHash('sha256').update(payload).digest('hex');
}

export function evaluateScrState() {
  const srcAbs = path.join(ROOT, SRC_ROOT);
  const files = walkFiles(srcAbs);

  let sharedRuntimeLoc = 0;
  let totalRuntimeLoc = 0;

  for (const relPath of files) {
    const fullPath = path.join(ROOT, relPath);
    const loc = countLoc(fullPath);
    totalRuntimeLoc += loc;

    const inSharedScope = SHARED_INCLUDE_DIRS.some((prefix) => relPath === prefix || relPath.startsWith(`${prefix}/`));
    if (!inSharedScope) continue;
    if (isPlatformSpecificAdapter(relPath)) continue;
    sharedRuntimeLoc += loc;
  }

  const scr = totalRuntimeLoc > 0 ? sharedRuntimeLoc / totalRuntimeLoc : 0;
  const scrRounded = Number(scr.toFixed(6));

  return {
    shared_runtime_loc: sharedRuntimeLoc,
    total_runtime_loc: totalRuntimeLoc,
    scr: scrRounded,
    toolVersion: TOOL_VERSION,
    configHash: buildConfigHash(),
    SCR_SHARED_CODE_RATIO_OK: scrRounded >= TOKEN_THRESHOLD ? 1 : 0,
  };
}

function printTokens(state) {
  console.log(`SCR_SHARED_RUNTIME_LOC=${state.shared_runtime_loc}`);
  console.log(`SCR_TOTAL_RUNTIME_LOC=${state.total_runtime_loc}`);
  console.log(`SCR_VALUE=${state.scr}`);
  console.log(`SCR_TOOL_VERSION=${state.toolVersion}`);
  console.log(`SCR_CONFIG_HASH=${state.configHash}`);
  console.log(`SCR_SHARED_CODE_RATIO_OK=${state.SCR_SHARED_CODE_RATIO_OK}`);
}

function main() {
  const wantsJson = process.argv.slice(2).includes('--json');
  const state = evaluateScrState();
  if (wantsJson) {
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
