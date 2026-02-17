#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COMMAND_BUS_ROUTE,
  REQUIRED_BYPASS_SCENARIO_IDS,
} from '../../src/renderer/commands/commandBusGuard.mjs';

const TOKEN_SINGLE_ENTRY = 'COMMAND_SURFACE_SINGLE_ENTRY_OK';
const TOKEN_BYPASS_TESTS = 'COMMAND_SURFACE_BYPASS_NEGATIVE_TESTS_OK';
const DEFAULT_CONTRACT_TEST_PATH = 'test/contracts/command-surface-single-entry.contract.test.js';

const REQUIRED_FILES = Object.freeze([
  'src/renderer/commands/registry.mjs',
  'src/renderer/commands/runCommand.mjs',
  'src/renderer/commands/projectCommands.mjs',
  'src/renderer/commands/commandBusGuard.mjs',
  'src/renderer/editor.js',
]);
const COMMAND_CATALOG_PATH = 'src/renderer/commands/command-catalog.v1.mjs';

const FORBIDDEN_EDITOR_DIRECT_CALLS = Object.freeze([
  'window.electronAPI.openFile(',
  'window.electronAPI.saveFile(',
  'window.electronAPI.exportDocxMin(',
  'window.electronAPI.importMarkdownV1(',
  'window.electronAPI.exportMarkdownV1(',
  'window.electronAPI.openFlowModeV1(',
  'window.electronAPI.saveFlowModeV1(',
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

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

function collectScenarioIds(testFileText) {
  const present = [];
  for (const scenarioId of REQUIRED_BYPASS_SCENARIO_IDS) {
    if (testFileText.includes(scenarioId)) present.push(scenarioId);
  }
  return present.sort((a, b) => a.localeCompare(b));
}

function evaluateSingleEntryState(editorText, projectCommandsText, commandCatalogText) {
  const legacyIdsDeclared = projectCommandsText.includes('cmd.project.open')
    && projectCommandsText.includes('cmd.project.save')
    && projectCommandsText.includes('cmd.project.export.docxMin');
  const catalogBackedIdsDeclared = projectCommandsText.includes('COMMAND_IDS.PROJECT_OPEN')
    && projectCommandsText.includes('COMMAND_IDS.PROJECT_SAVE')
    && projectCommandsText.includes('COMMAND_IDS.PROJECT_EXPORT_DOCX_MIN')
    && commandCatalogText.includes('cmd.project.open')
    && commandCatalogText.includes('cmd.project.save')
    && commandCatalogText.includes('cmd.project.export.docxMin');
  const checks = {
    busRouteWired: editorText.includes('runCommandThroughBus(')
      && (editorText.includes(`route: ${JSON.stringify(COMMAND_BUS_ROUTE)}`)
        || editorText.includes('route: COMMAND_BUS_ROUTE')),
    runCommandBypassAbsent: !/\brunCommand\s*\(/u.test(editorText),
    projectCommandIdsDeclared: legacyIdsDeclared || catalogBackedIdsDeclared,
  };

  for (const forbidden of FORBIDDEN_EDITOR_DIRECT_CALLS) {
    if (editorText.includes(forbidden)) {
      checks.runCommandBypassAbsent = false;
      break;
    }
  }

  const ok = Object.values(checks).every((flag) => flag === true);
  return { ok, checks };
}

export function evaluateCommandSurfaceState(input = {}) {
  const contractTestPath = String(input.contractTestPath || DEFAULT_CONTRACT_TEST_PATH).trim();
  const missingFiles = REQUIRED_FILES.filter((filePath) => !fileExists(filePath)).sort((a, b) => a.localeCompare(b));
  const editorText = typeof input.editorText === 'string' ? input.editorText : readText('src/renderer/editor.js');
  const projectCommandsText = typeof input.projectCommandsText === 'string'
    ? input.projectCommandsText
    : readText('src/renderer/commands/projectCommands.mjs');
  const commandCatalogText = typeof input.commandCatalogText === 'string'
    ? input.commandCatalogText
    : readText(COMMAND_CATALOG_PATH);
  const testFileText = typeof input.testFileText === 'string' ? input.testFileText : readText(contractTestPath);

  const singleEntryState = evaluateSingleEntryState(editorText, projectCommandsText, commandCatalogText);
  const presentScenarioIds = collectScenarioIds(testFileText);
  const presentScenarioSet = new Set(presentScenarioIds);
  const missingScenarioIds = REQUIRED_BYPASS_SCENARIO_IDS
    .filter((scenarioId) => !presentScenarioSet.has(scenarioId))
    .sort((a, b) => a.localeCompare(b));

  const singleEntryOk = missingFiles.length === 0 && singleEntryState.ok ? 1 : 0;
  const bypassTestsOk = missingScenarioIds.length === 0 ? 1 : 0;

  let failSignal = '';
  let failReason = '';
  if (singleEntryOk !== 1) {
    failSignal = 'E_COMMAND_SURFACE_BYPASS';
    failReason = missingFiles.length > 0
      ? 'COMMAND_SURFACE_FILES_MISSING'
      : 'COMMAND_SURFACE_SINGLE_ENTRY_NOT_ENFORCED';
  } else if (bypassTestsOk !== 1) {
    failSignal = 'E_COMMAND_SURFACE_NEGATIVE_MISSING';
    failReason = 'COMMAND_SURFACE_NEGATIVE_SCENARIOS_MISSING';
  }

  return {
    ok: singleEntryOk === 1 && bypassTestsOk === 1,
    [TOKEN_SINGLE_ENTRY]: singleEntryOk,
    [TOKEN_BYPASS_TESTS]: bypassTestsOk,
    COMMAND_SURFACE_FAIL_REASON: failReason,
    failSignal,
    failReason,
    contractTestPath,
    requiredScenarioIds: [...REQUIRED_BYPASS_SCENARIO_IDS],
    presentScenarioIds,
    missingScenarioIds,
    missingFiles,
    checks: singleEntryState.checks,
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
  console.log(`${TOKEN_SINGLE_ENTRY}=${state[TOKEN_SINGLE_ENTRY]}`);
  console.log(`${TOKEN_BYPASS_TESTS}=${state[TOKEN_BYPASS_TESTS]}`);
  console.log(`COMMAND_SURFACE_FAIL_REASON=${state.COMMAND_SURFACE_FAIL_REASON}`);
  console.log(`COMMAND_SURFACE_FAIL_SIGNAL=${state.failSignal}`);
  console.log(`COMMAND_SURFACE_CONTRACT_TEST_PATH=${state.contractTestPath}`);
  console.log(`COMMAND_SURFACE_REQUIRED_SCENARIOS=${JSON.stringify(state.requiredScenarioIds)}`);
  console.log(`COMMAND_SURFACE_PRESENT_SCENARIOS=${JSON.stringify(state.presentScenarioIds)}`);
  console.log(`COMMAND_SURFACE_MISSING_SCENARIOS=${JSON.stringify(state.missingScenarioIds)}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateCommandSurfaceState({
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
