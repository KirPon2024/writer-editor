#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const TOOL_VERSION = 'scr-calc.v2';
const ROOT = process.cwd();
const SRC_ROOT = 'src';
const RUNTIME_SHARED_DIRS = ['src/core', 'src/shared', 'src/ports', 'src/contracts'];
const RUNTIME_ADAPTERS_DIR = 'src/adapters';
const SHARED_ADAPTER_SEGMENTS = ['shared'];
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
    runtimeSharedDirs: RUNTIME_SHARED_DIRS,
    runtimeAdaptersDir: RUNTIME_ADAPTERS_DIR,
    sharedAdapterSegments: SHARED_ADAPTER_SEGMENTS,
    exclude: EXCLUDE_PREFIXES,
    textExtensions: [...TEXT_EXT].sort(),
    rules: [
      'non-blank',
      'not-comment-only',
      'runtime_scope_only_for_runtime_ratio',
      'runtime_platform_adapter_dir_is_first_segment_under_src_adapters_except_shared_adapter_segments',
    ],
  };
  const payload = JSON.stringify(normalized);
  return createHash('sha256').update(payload).digest('hex');
}

function startsWithPath(relPath, prefix) {
  return relPath === prefix || relPath.startsWith(`${prefix}/`);
}

function classifyAdapterFile(relPath) {
  if (!startsWithPath(relPath, RUNTIME_ADAPTERS_DIR)) {
    return { inAdaptersScope: false, shared: false, platformSpecific: false };
  }
  const afterPrefix = relPath.slice(`${RUNTIME_ADAPTERS_DIR}/`.length);
  if (!afterPrefix || !afterPrefix.includes('/')) {
    return { inAdaptersScope: true, shared: true, platformSpecific: false };
  }
  const firstSegment = afterPrefix.split('/')[0].toLowerCase();
  const shared = SHARED_ADAPTER_SEGMENTS.includes(firstSegment);
  return {
    inAdaptersScope: true,
    shared,
    platformSpecific: !shared,
  };
}

export function evaluateScrState() {
  const srcAbs = path.join(ROOT, SRC_ROOT);
  const files = walkFiles(srcAbs);

  let runtimeSharedLoc = 0;
  let runtimeTotalLoc = 0;
  let appTotalLoc = 0;
  const platformRuntimeBreakdown = [];

  for (const relPath of files) {
    const fullPath = path.join(ROOT, relPath);
    const loc = countLoc(fullPath);
    appTotalLoc += loc;

    const inRuntimeSharedDir = RUNTIME_SHARED_DIRS.some((prefix) => startsWithPath(relPath, prefix));
    const adapterClass = classifyAdapterFile(relPath);
    const inRuntimeScope = inRuntimeSharedDir || adapterClass.inAdaptersScope;
    if (!inRuntimeScope) continue;

    runtimeTotalLoc += loc;

    if (inRuntimeSharedDir || adapterClass.shared) {
      runtimeSharedLoc += loc;
    } else if (adapterClass.platformSpecific) {
      platformRuntimeBreakdown.push({
        path: relPath,
        loc,
      });
    }
  }

  platformRuntimeBreakdown.sort((a, b) => b.loc - a.loc);

  const runtimeScr = runtimeTotalLoc > 0 ? runtimeSharedLoc / runtimeTotalLoc : 0;
  const appScr = appTotalLoc > 0 ? runtimeSharedLoc / appTotalLoc : 0;
  const runtimeScrRounded = Number(runtimeScr.toFixed(6));
  const appScrRounded = Number(appScr.toFixed(6));
  const runtimeSharedRatioOk = runtimeScrRounded >= TOKEN_THRESHOLD ? 1 : 0;

  return {
    runtime_shared_loc: runtimeSharedLoc,
    runtime_total_loc: runtimeTotalLoc,
    runtime_scr: runtimeScrRounded,
    app_total_loc: appTotalLoc,
    app_scr: appScrRounded,
    runtime_platform_breakdown: platformRuntimeBreakdown.slice(0, 50),
    toolVersion: TOOL_VERSION,
    configHash: buildConfigHash(),
    SCR_RUNTIME_SHARED_RATIO_OK: runtimeSharedRatioOk,
    SCR_APP_TOTAL_SHARED_RATIO_INFO: appScrRounded,
    SCR_SHARED_CODE_RATIO_OK: runtimeSharedRatioOk,
    shared_runtime_loc: runtimeSharedLoc,
    total_runtime_loc: runtimeTotalLoc,
    scr: runtimeScrRounded,
  };
}

function printTokens(state) {
  console.log(`SCR_RUNTIME_SHARED_LOC=${state.runtime_shared_loc}`);
  console.log(`SCR_RUNTIME_TOTAL_LOC=${state.runtime_total_loc}`);
  console.log(`SCR_RUNTIME_VALUE=${state.runtime_scr}`);
  console.log(`SCR_APP_TOTAL_LOC=${state.app_total_loc}`);
  console.log(`SCR_APP_VALUE=${state.app_scr}`);
  console.log(`SCR_TOOL_VERSION=${state.toolVersion}`);
  console.log(`SCR_CONFIG_HASH=${state.configHash}`);
  console.log(`SCR_RUNTIME_SHARED_RATIO_OK=${state.SCR_RUNTIME_SHARED_RATIO_OK}`);
  console.log(`SCR_APP_TOTAL_SHARED_RATIO_INFO=${state.SCR_APP_TOTAL_SHARED_RATIO_INFO}`);
  console.log(`SCR_SHARED_RUNTIME_LOC=${state.shared_runtime_loc}`);
  console.log(`SCR_TOTAL_RUNTIME_LOC=${state.total_runtime_loc}`);
  console.log(`SCR_VALUE=${state.scr}`);
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
