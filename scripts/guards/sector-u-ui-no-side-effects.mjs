#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const RULE_ID = 'U4-RULE-002';
const DEFAULT_MODE = 'DETECT_ONLY';
const VALID_MODES = new Set(['DETECT_ONLY', 'BLOCKING', 'DROPPED']);
const DEFAULT_SECTOR_U_PATH = 'docs/OPS/STATUS/SECTOR_U.json';

const DENY_RULES = [
  { kind: 'ELECTRON_IMPORT', detail: "from 'electron'", re: /(?:^\s*import\b.*\bfrom\s*['"]electron['"]|^\s*import\s*['"]electron['"])/ },
  { kind: 'ELECTRON_REQUIRE', detail: "require('electron')", re: /require\(\s*['"]electron['"]\s*\)/ },
  { kind: 'IPC_RENDERER', detail: 'ipcRenderer', re: /\bipcRenderer\b/ },
  { kind: 'FS_IMPORT', detail: "from 'fs' | from 'node:fs'", re: /(?:from\s*['"]fs['"]|from\s*['"]node:fs['"])/ },
  { kind: 'FS_REQUIRE', detail: "require('fs') | require('node:fs')", re: /require\(\s*['"](?:node:)?fs['"]\s*\)/ },
  { kind: 'PATH_IMPORT', detail: "from 'path' | from 'node:path'", re: /(?:from\s*['"]path['"]|from\s*['"]node:path['"])/ },
  { kind: 'PATH_REQUIRE', detail: "require('path') | require('node:path')", re: /require\(\s*['"](?:node:)?path['"]\s*\)/ },
  { kind: 'DIRECT_OPENFILE', detail: 'window.electronAPI.openFile', re: /window\.electronAPI\.openFile\s*\(/ },
  { kind: 'DIRECT_SAVEFILE', detail: 'window.electronAPI.saveFile', re: /window\.electronAPI\.saveFile\s*\(/ },
  { kind: 'DIRECT_EXPORT', detail: 'window.electronAPI.exportDocxMin', re: /window\.electronAPI\.exportDocxMin\s*\(/ },
];

function parseArgs(argv) {
  const out = { mode: '', scanRoot: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--mode') {
      out.mode = String(argv[i + 1] || '').toUpperCase();
      i += 1;
      continue;
    }
    if (arg === '--scan-root') {
      out.scanRoot = String(argv[i + 1] || '');
      i += 1;
    }
  }
  return out;
}

function readSectorUConfig() {
  if (!fs.existsSync(DEFAULT_SECTOR_U_PATH)) {
    return { uiRootPath: 'src/renderer', mode: DEFAULT_MODE };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(DEFAULT_SECTOR_U_PATH, 'utf8'));
    const uiRootPath = parsed && typeof parsed.uiRootPath === 'string' && parsed.uiRootPath.length > 0
      ? parsed.uiRootPath
      : 'src/renderer';
    const modeRaw = parsed && typeof parsed.u4NoSideEffectsMode === 'string'
      ? parsed.u4NoSideEffectsMode.toUpperCase()
      : DEFAULT_MODE;
    const mode = VALID_MODES.has(modeRaw) ? modeRaw : DEFAULT_MODE;
    return { uiRootPath, mode };
  } catch {
    return { uiRootPath: 'src/renderer', mode: DEFAULT_MODE };
  }
}

function shouldScan(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.js' || ext === '.mjs' || ext === '.cjs' || ext === '.ts' || ext === '.tsx' || ext === '.jsx';
}

function listFiles(rootAbs) {
  const out = [];
  const stack = [rootAbs];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || !fs.existsSync(current)) continue;
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
      for (let i = entries.length - 1; i >= 0; i -= 1) {
        const entry = entries[i];
        if (entry.name === '.git' || entry.name === 'node_modules') continue;
        stack.push(path.join(current, entry.name));
      }
      continue;
    }
    if (shouldScan(current)) out.push(current);
  }
  return out.sort();
}

function normalizePosix(p) {
  return String(p).replaceAll('\\', '/');
}

function detectViolations(files, baseRoot) {
  const violations = [];
  for (const abs of files) {
    const rel = normalizePosix(path.relative(baseRoot, abs));
    const text = fs.readFileSync(abs, 'utf8');
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      for (const rule of DENY_RULES) {
        if (!rule.re.test(line)) continue;
        violations.push({
          file: rel,
          line: i + 1,
          kind: rule.kind,
          detail: rule.detail,
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = readSectorUConfig();
  const mode = VALID_MODES.has(args.mode) ? args.mode : config.mode;
  const rootRel = args.scanRoot || config.uiRootPath || 'src/renderer';
  const rootAbs = path.resolve(process.cwd(), rootRel);

  if (mode === 'DROPPED') {
    console.log(`RULE_ID=${RULE_ID}`);
    console.log(`MODE=${mode}`);
    console.log(`SCAN_ROOT=${rootRel}`);
    console.log('VIOLATIONS_COUNT=0');
    process.exit(0);
  }

  const files = listFiles(rootAbs);
  const violations = detectViolations(files, rootAbs);

  console.log(`RULE_ID=${RULE_ID}`);
  console.log(`MODE=${mode}`);
  console.log(`SCAN_ROOT=${rootRel}`);
  console.log(`VIOLATIONS_COUNT=${violations.length}`);
  for (const item of violations) {
    console.log(`VIOLATION file=${item.file} line=${item.line} kind=${item.kind} detail=${item.detail}`);
  }

  if (mode === 'BLOCKING' && violations.length > 0) {
    process.exit(2);
  }
  process.exit(0);
}

main();
