#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const RULE_ID = 'U2-RULE-001';
const DEFAULT_MODE = 'DETECT_ONLY';
const VALID_MODES = new Set(['DETECT_ONLY', 'BLOCKING', 'DROPPED']);
const DEFAULT_TARGET_PATHS_PATH = 'docs/OPS/STATUS/UI_TARGET_PATHS.json';
const DEFAULT_SECTOR_U_STATUS_PATH = 'docs/OPS/STATUS/SECTOR_U.json';

const DETECTORS = [
  { kind: 'WINDOW_ELECTRON_API', detail: 'window.electronAPI', re: /window\.electronAPI\b/ },
  { kind: 'IPC_RENDERER_USAGE', detail: 'ipcRenderer', re: /\bipcRenderer\b/ },
  { kind: 'ELECTRON_REQUIRE', detail: "require('electron')", re: /require\(\s*['"]electron['"]\s*\)/ },
  { kind: 'ELECTRON_IMPORT', detail: "from 'electron'", re: /(?:^\s*import\b.*\bfrom\s*['"]electron['"]|^\s*import\s*['"]electron['"])/ },
  { kind: 'NODE_FS_IMPORT', detail: "node:fs", re: /['"]node:fs['"]/ },
  { kind: 'NODE_PATH_IMPORT', detail: "node:path", re: /['"]node:path['"]/ },
  { kind: 'FS_IMPORT', detail: "fs", re: /(?:^\s*import\b.*\bfrom\s*['"]fs['"]|require\(\s*['"]fs['"]\s*\))/ },
  { kind: 'PATH_IMPORT', detail: "path", re: /(?:^\s*import\b.*\bfrom\s*['"]path['"]|require\(\s*['"]path['"]\s*\))/ },
];

function parseArgs(argv) {
  const args = {
    scanRoot: '',
    mode: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--scan-root') {
      args.scanRoot = String(argv[i + 1] || '');
      i += 1;
      continue;
    }
    if (arg === '--mode') {
      args.mode = String(argv[i + 1] || '').toUpperCase();
      i += 1;
      continue;
    }
  }
  return args;
}

function normalizePosix(p) {
  return String(p).replaceAll('\\', '/');
}

function readJsonObjectOptional(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function uniqueSorted(list) {
  return [...new Set(list)].sort();
}

function globToRegex(glob) {
  let out = '^';
  const source = normalizePosix(glob);
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '*') {
      const isDouble = source[i + 1] === '*';
      if (isDouble) {
        out += '.*';
        i += 1;
      } else {
        out += '[^/]*';
      }
      continue;
    }
    if (ch === '?') {
      out += '[^/]';
      continue;
    }
    if ('\\.^$+()[]{}|'.includes(ch)) out += `\\${ch}`;
    else out += ch;
  }
  out += '$';
  return new RegExp(out);
}

function createMatcher(globs) {
  const patterns = uniqueSorted(
    (Array.isArray(globs) ? globs : [])
      .map((it) => (typeof it === 'string' ? it.trim() : ''))
      .filter((it) => it.length > 0),
  ).map((glob) => ({ glob, re: globToRegex(glob) }));

  return {
    globs: patterns.map((it) => it.glob),
    matches(relPath) {
      if (patterns.length === 0) return false;
      for (const pattern of patterns) {
        if (pattern.re.test(relPath)) return true;
      }
      return false;
    },
  };
}

function computeScanRoots(includeGlobs, cwdAbs) {
  const roots = new Set();
  for (const include of includeGlobs) {
    const glob = String(include || '');
    const wildcardIndex = glob.search(/[*?]/);
    const rawBase = wildcardIndex >= 0 ? glob.slice(0, wildcardIndex) : glob;
    const trimmed = rawBase.replace(/\/+$/, '');
    if (!trimmed) {
      roots.add(cwdAbs);
      continue;
    }
    const base = rawBase.endsWith('/')
      ? trimmed
      : (trimmed.includes('/') ? trimmed.replace(/\/[^/]*$/, '') || trimmed : trimmed);
    roots.add(path.resolve(cwdAbs, base));
  }
  if (roots.size === 0) roots.add(cwdAbs);
  return [...roots].sort();
}

function shouldScanExtension(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.js' || ext === '.mjs' || ext === '.cjs' || ext === '.ts' || ext === '.tsx' || ext === '.jsx';
}

function listFilesRecursively(rootAbs) {
  const files = [];
  const stack = [rootAbs];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || !fs.existsSync(current)) continue;
    const stat = fs.statSync(current);
    if (!stat.isDirectory()) {
      if (shouldScanExtension(current)) files.push(current);
      continue;
    }

    const entries = fs.readdirSync(current, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i];
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'artifacts') continue;
      stack.push(path.join(current, entry.name));
    }
  }
  return files.sort();
}

function readTargetPaths() {
  const parsed = readJsonObjectOptional(DEFAULT_TARGET_PATHS_PATH) || {};
  const include = Array.isArray(parsed.pathsInclude) ? parsed.pathsInclude : ['src/renderer/**'];
  const exclude = Array.isArray(parsed.pathsExclude) ? parsed.pathsExclude : ['**/*.spec.*', 'test/**', 'scripts/**'];
  return {
    schemaVersion: parsed.schemaVersion === 'ui-target-paths.v1' ? parsed.schemaVersion : 'ui-target-paths.v1',
    pathsInclude: uniqueSorted(include.map((it) => String(it))),
    pathsExclude: uniqueSorted(exclude.map((it) => String(it))),
  };
}

function readMode(modeArg) {
  if (VALID_MODES.has(modeArg)) return modeArg;
  const parsed = readJsonObjectOptional(DEFAULT_SECTOR_U_STATUS_PATH);
  const mode = parsed && typeof parsed.u2Mode === 'string' ? parsed.u2Mode.toUpperCase() : '';
  if (VALID_MODES.has(mode)) return mode;
  return DEFAULT_MODE;
}

function collectTargetFiles(args, targetPaths) {
  const cwdAbs = process.cwd();
  const includeMatcher = createMatcher(targetPaths.pathsInclude);
  const excludeMatcher = createMatcher(targetPaths.pathsExclude);
  const scanRootAbs = args.scanRoot ? path.resolve(cwdAbs, args.scanRoot) : '';
  const roots = scanRootAbs
    ? [scanRootAbs]
    : computeScanRoots(targetPaths.pathsInclude, cwdAbs);

  const files = new Set();
  for (const root of roots) {
    for (const file of listFilesRecursively(root)) {
      files.add(path.resolve(file));
    }
  }

  const target = [];
  for (const absPath of [...files].sort()) {
    const base = scanRootAbs || cwdAbs;
    const rel = normalizePosix(path.relative(base, absPath));
    if (!rel || rel.startsWith('..')) continue;
    if (!includeMatcher.matches(rel)) continue;
    if (excludeMatcher.matches(rel)) continue;
    target.push({ absPath, relPath: rel });
  }
  return target.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

function detectViolations(targetFiles) {
  const violations = [];
  for (const file of targetFiles) {
    const content = fs.readFileSync(file.absPath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      for (const detector of DETECTORS) {
        if (!detector.re.test(line)) continue;
        violations.push({
          file: file.relPath,
          line: i + 1,
          kind: detector.kind,
          detail: detector.detail,
        });
      }
    }
  }
  return violations.sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    if (a.line !== b.line) return a.line - b.line;
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return a.detail.localeCompare(b.detail);
  });
}

function printOutput({ mode, targetPaths, violations }) {
  console.log(`RULE_ID=${RULE_ID}`);
  console.log(`MODE=${mode}`);
  console.log(`TARGET_SCHEMA=${targetPaths.schemaVersion}`);
  console.log(`TARGET_INCLUDE=${JSON.stringify(targetPaths.pathsInclude)}`);
  console.log(`TARGET_EXCLUDE=${JSON.stringify(targetPaths.pathsExclude)}`);
  console.log(`VIOLATIONS_COUNT=${violations.length}`);
  for (const v of violations) {
    console.log(`VIOLATION file=${v.file} line=${v.line} kind=${v.kind} detail=${v.detail}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = readMode(args.mode);
  const targetPaths = readTargetPaths();

  if (mode === 'DROPPED') {
    printOutput({ mode, targetPaths, violations: [] });
    process.exit(0);
  }

  const targetFiles = collectTargetFiles(args, targetPaths);
  const violations = detectViolations(targetFiles);
  printOutput({ mode, targetPaths, violations });

  if (mode === 'BLOCKING' && violations.length > 0) {
    process.exit(2);
  }
  process.exit(0);
}

main();
