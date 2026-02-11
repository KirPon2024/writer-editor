#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyCoreSequence, CORE_COMMAND_IDS, createInitialCoreState } from '../../src/core/runtime.mjs';
import { deriveComments } from '../../src/derived/commentsHistory/deriveComments.mjs';
import { deriveHistory } from '../../src/derived/commentsHistory/deriveHistory.mjs';

const TOOL_VERSION = 'comments-history-safe-state.v1';
const DERIVED_DIR = 'src/derived/commentsHistory';
const REQUIRED_FILES = [
  'src/derived/commentsHistory/index.mjs',
  'src/derived/commentsHistory/deriveComments.mjs',
  'src/derived/commentsHistory/deriveHistory.mjs',
];
const NO_SECOND_SOT_PATTERNS = [
  /from\s+['"]node:fs['"]/u,
  /from\s+['"]node:child_process['"]/u,
  /from\s+['"]node:http['"]/u,
  /from\s+['"]node:https['"]/u,
  /from\s+['"]node:net['"]/u,
  /from\s+['"]electron['"]/u,
  /\bwriteFile(?:Sync)?\s*\(/u,
  /\bappendFile(?:Sync)?\s*\(/u,
  /\bmkdir(?:Sync)?\s*\(/u,
  /\brename(?:Sync)?\s*\(/u,
  /\bunlink(?:Sync)?\s*\(/u,
  /\brm(?:Sync)?\s*\(/u,
  /\blocalStorage\b/u,
  /\bsessionStorage\b/u,
  /\bindexedDB\b/u,
];
const RECOVERY_SAFE_PATTERNS = [
  /from\s+['"][^'"]*\/(?:io|recovery)[^'"]*['"]/u,
  /\bbackupManager\b/u,
  /\brecovery\b/u,
];

function parseArgs(argv) {
  const out = { json: false };
  for (const arg of argv) {
    if (arg === '--json') out.json = true;
  }
  return out;
}

function toToken(value) {
  return value ? 1 : 0;
}

function listDerivedFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  return fs.readdirSync(rootDir)
    .filter((entry) => entry.endsWith('.mjs'))
    .map((entry) => `${rootDir}/${entry}`)
    .sort();
}

function buildFixtureState() {
  return applyCoreSequence(createInitialCoreState(), [
    {
      type: CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: {
        projectId: 'project-comments-history-fixture',
        title: 'Comments History Fixture',
        sceneId: 'scene-1',
      },
    },
    {
      type: CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: {
        projectId: 'project-comments-history-fixture',
        sceneId: 'scene-1',
        text: '# Scene A\nLine 1\n',
      },
    },
  ]);
}

export function evaluateCommentsHistorySafeState() {
  const state = {
    toolVersion: TOOL_VERSION,
    requiredFiles: REQUIRED_FILES,
    discoveredFiles: [],
    missingFiles: [],
    noSecondSotViolations: [],
    recoveryUnsafeViolations: [],
    checks: {
      commentsDeterministic: 0,
      historyDeterministic: 0,
      commentsInvalidationStable: 0,
      historyInvalidationStable: 0,
      commentsInvalidationChangesOnParams: 0,
      historyInvalidationChangesOnCapability: 0,
    },
    COMMENTS_HISTORY_SAFE_OK: 0,
    failReason: '',
  };

  state.discoveredFiles = listDerivedFiles(DERIVED_DIR);
  state.missingFiles = REQUIRED_FILES.filter((filePath) => !fs.existsSync(filePath));

  for (const filePath of state.discoveredFiles) {
    const text = fs.readFileSync(filePath, 'utf8');
    for (const pattern of NO_SECOND_SOT_PATTERNS) {
      if (pattern.test(text)) {
        state.noSecondSotViolations.push({ filePath, pattern: pattern.source });
      }
    }
    for (const pattern of RECOVERY_SAFE_PATTERNS) {
      if (pattern.test(text)) {
        state.recoveryUnsafeViolations.push({ filePath, pattern: pattern.source });
      }
    }
    if (/(^|\/)(model|store)\.[^/]+$/iu.test(filePath)) {
      state.noSecondSotViolations.push({ filePath, pattern: 'forbidden_file_name_model_or_store' });
    }
  }

  const fixture = buildFixtureState();
  if (!fixture.ok) {
    state.failReason = 'COMMENTS_HISTORY_FIXTURE_BUILD_FAILED';
  } else {
    const baseInput = {
      coreState: fixture.state,
      params: {
        projectId: 'project-comments-history-fixture',
        filter: 'all',
      },
      capabilitySnapshot: {
        platformId: 'node',
        capabilities: { commentsView: true, historyView: true },
      },
    };
    const commentsA = deriveComments(baseInput);
    const commentsB = deriveComments(baseInput);
    const commentsParamsChanged = deriveComments({
      ...baseInput,
      params: {
        projectId: 'project-comments-history-fixture',
        filter: 'resolved',
      },
    });

    const historyA = deriveHistory(baseInput);
    const historyB = deriveHistory(baseInput);
    const historyCapabilityChanged = deriveHistory({
      ...baseInput,
      capabilitySnapshot: {
        platformId: 'node',
        capabilities: { commentsView: true, historyView: true, auditTrace: true },
      },
    });

    const commentsDeterministic = commentsA.ok && commentsB.ok
      && JSON.stringify(commentsA.value) === JSON.stringify(commentsB.value)
      && commentsA.meta?.outputHash === commentsB.meta?.outputHash;
    const historyDeterministic = historyA.ok && historyB.ok
      && JSON.stringify(historyA.value) === JSON.stringify(historyB.value)
      && historyA.meta?.outputHash === historyB.meta?.outputHash;
    const commentsInvalidationStable = commentsA.ok && commentsB.ok
      && commentsA.meta?.invalidationKey === commentsB.meta?.invalidationKey;
    const historyInvalidationStable = historyA.ok && historyB.ok
      && historyA.meta?.invalidationKey === historyB.meta?.invalidationKey;
    const commentsInvalidationChangesOnParams = commentsA.ok && commentsParamsChanged.ok
      && commentsA.meta?.invalidationKey !== commentsParamsChanged.meta?.invalidationKey;
    const historyInvalidationChangesOnCapability = historyA.ok && historyCapabilityChanged.ok
      && historyA.meta?.invalidationKey !== historyCapabilityChanged.meta?.invalidationKey;

    state.checks.commentsDeterministic = toToken(commentsDeterministic);
    state.checks.historyDeterministic = toToken(historyDeterministic);
    state.checks.commentsInvalidationStable = toToken(commentsInvalidationStable);
    state.checks.historyInvalidationStable = toToken(historyInvalidationStable);
    state.checks.commentsInvalidationChangesOnParams = toToken(commentsInvalidationChangesOnParams);
    state.checks.historyInvalidationChangesOnCapability = toToken(historyInvalidationChangesOnCapability);
  }

  const deterministicOk = state.checks.commentsDeterministic === 1
    && state.checks.historyDeterministic === 1
    && state.checks.commentsInvalidationStable === 1
    && state.checks.historyInvalidationStable === 1
    && state.checks.commentsInvalidationChangesOnParams === 1
    && state.checks.historyInvalidationChangesOnCapability === 1;
  const noSecondSotOk = state.missingFiles.length === 0 && state.noSecondSotViolations.length === 0;
  const recoverySafeOk = state.recoveryUnsafeViolations.length === 0;

  state.COMMENTS_HISTORY_SAFE_OK = toToken(deterministicOk && noSecondSotOk && recoverySafeOk);

  if (!state.failReason && state.COMMENTS_HISTORY_SAFE_OK !== 1) {
    if (!deterministicOk) state.failReason = 'COMMENTS_HISTORY_DETERMINISM_FAIL';
    else if (!noSecondSotOk) state.failReason = 'COMMENTS_HISTORY_SECOND_SOT_FAIL';
    else if (!recoverySafeOk) state.failReason = 'COMMENTS_HISTORY_RECOVERY_SAFETY_FAIL';
    else state.failReason = 'COMMENTS_HISTORY_SAFE_FAIL';
  }

  return state;
}

function printTokens(state) {
  console.log(`COMMENTS_HISTORY_SAFE_TOOL_VERSION=${state.toolVersion}`);
  console.log(`COMMENTS_HISTORY_SAFE_REQUIRED_FILES=${JSON.stringify(state.requiredFiles)}`);
  console.log(`COMMENTS_HISTORY_SAFE_DISCOVERED_FILES=${JSON.stringify(state.discoveredFiles)}`);
  console.log(`COMMENTS_HISTORY_SAFE_MISSING_FILES=${JSON.stringify(state.missingFiles)}`);
  console.log(`COMMENTS_HISTORY_SAFE_NO_SECOND_SOT_VIOLATIONS=${JSON.stringify(state.noSecondSotViolations)}`);
  console.log(`COMMENTS_HISTORY_SAFE_RECOVERY_UNSAFE_VIOLATIONS=${JSON.stringify(state.recoveryUnsafeViolations)}`);
  console.log(`COMMENTS_HISTORY_SAFE_CHECKS=${JSON.stringify(state.checks)}`);
  console.log(`COMMENTS_HISTORY_SAFE_OK=${state.COMMENTS_HISTORY_SAFE_OK}`);
  if (state.failReason) {
    console.log(`FAIL_REASON=${state.failReason}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateCommentsHistorySafeState();
  if (args.json) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  } else {
    printTokens(state);
  }
  process.exit(state.COMMENTS_HISTORY_SAFE_OK === 1 ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
