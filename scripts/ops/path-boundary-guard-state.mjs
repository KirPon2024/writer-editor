#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKEN_NAME = 'PATH_BOUNDARY_GUARD_OK';
const FAIL_SIGNAL = 'E_PATH_BOUNDARY_VIOLATION';
const DEFAULT_CONTRACT_TEST_PATH = 'test/contracts/path-boundary-guard.contract.test.js';

const REQUIRED_FILES = Object.freeze([
  'src/core/io/path-boundary.js',
  'src/main.js',
  'src/io/markdown/index.mjs',
  DEFAULT_CONTRACT_TEST_PATH,
]);

const REQUIRED_MAIN_MARKERS = Object.freeze([
  "require('./core/io/path-boundary')",
  'sanitizePathFields(',
  'E_PATH_BOUNDARY_VIOLATION',
  "ipcMain.handle('ui:open-document'",
  "ipcMain.handle('ui:create-node'",
  "ipcMain.handle('ui:rename-node'",
  "ipcMain.handle('ui:delete-node'",
  "ipcMain.handle('ui:reorder-node'",
]);

const REQUIRED_MARKDOWN_MARKERS = Object.freeze([
  "import pathBoundary from '../../core/io/path-boundary.js';",
  'pathBoundary.validatePathBoundary(',
  'E_PATH_BOUNDARY_VIOLATION',
]);

const REQUIRED_TEST_SCENARIOS = Object.freeze([
  'relative-path-positive',
  'parent-segment-negative',
  'absolute-path-negative',
  'unc-path-negative',
  'file-scheme-negative',
  'nul-byte-negative',
]);

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

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function collectMissingMarkers(text, markers) {
  return markers.filter((marker) => !text.includes(marker)).sort((a, b) => a.localeCompare(b));
}

export function evaluatePathBoundaryGuardState(input = {}) {
  const contractTestPath = String(input.contractTestPath || DEFAULT_CONTRACT_TEST_PATH).trim();
  const missingFiles = REQUIRED_FILES.filter((filePath) => !fs.existsSync(filePath)).sort((a, b) => a.localeCompare(b));
  const mainText = typeof input.mainText === 'string' ? input.mainText : readText('src/main.js');
  const markdownText = typeof input.markdownText === 'string'
    ? input.markdownText
    : readText('src/io/markdown/index.mjs');
  const testText = typeof input.testText === 'string' ? input.testText : readText(contractTestPath);

  const missingMainMarkers = collectMissingMarkers(mainText, REQUIRED_MAIN_MARKERS);
  const missingMarkdownMarkers = collectMissingMarkers(markdownText, REQUIRED_MARKDOWN_MARKERS);
  const missingTestScenarios = collectMissingMarkers(testText, REQUIRED_TEST_SCENARIOS);

  const ok = missingFiles.length === 0
    && missingMainMarkers.length === 0
    && missingMarkdownMarkers.length === 0
    && missingTestScenarios.length === 0;

  let failReason = '';
  if (!ok) {
    if (missingFiles.length > 0) failReason = 'PATH_BOUNDARY_FILES_MISSING';
    else if (missingMainMarkers.length > 0 || missingMarkdownMarkers.length > 0) failReason = 'PATH_BOUNDARY_GUARD_NOT_WIRED';
    else failReason = 'PATH_BOUNDARY_NEGATIVE_TESTS_MISSING';
  }

  return {
    ok,
    [TOKEN_NAME]: ok ? 1 : 0,
    failSignal: ok ? '' : FAIL_SIGNAL,
    failReason,
    contractTestPath,
    missingFiles,
    missingMainMarkers,
    missingMarkdownMarkers,
    missingTestScenarios,
    requiredTestScenarios: [...REQUIRED_TEST_SCENARIOS],
  };
}

function parseArgs(argv) {
  const out = {
    json: false,
    contractTestPath: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || '');
    if (arg === '--json') out.json = true;
    if (arg === '--contract-test-path' && i + 1 < argv.length) {
      out.contractTestPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }
  return out;
}

function printHuman(state) {
  console.log(`${TOKEN_NAME}=${state[TOKEN_NAME]}`);
  console.log(`PATH_BOUNDARY_FAIL_SIGNAL=${state.failSignal}`);
  console.log(`PATH_BOUNDARY_FAIL_REASON=${state.failReason}`);
  console.log(`PATH_BOUNDARY_CONTRACT_TEST_PATH=${state.contractTestPath}`);
  console.log(`PATH_BOUNDARY_MISSING_FILES=${JSON.stringify(state.missingFiles)}`);
  console.log(`PATH_BOUNDARY_MISSING_MAIN_MARKERS=${JSON.stringify(state.missingMainMarkers)}`);
  console.log(`PATH_BOUNDARY_MISSING_MARKDOWN_MARKERS=${JSON.stringify(state.missingMarkdownMarkers)}`);
  console.log(`PATH_BOUNDARY_MISSING_TEST_SCENARIOS=${JSON.stringify(state.missingTestScenarios)}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluatePathBoundaryGuardState({
    contractTestPath: args.contractTestPath || undefined,
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

