#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyCoreSequence, CORE_COMMAND_IDS, createInitialCoreState } from '../../src/core/runtime.mjs';
import { deriveReferenceOutline } from '../../src/derived/referenceOutline.mjs';

const TOOL_VERSION = 'derived-views-state.v1';
const DERIVED_DIR = 'src/derived';
const REQUIRED_FILES = [
  'src/derived/deriveView.mjs',
  'src/derived/deriveCache.mjs',
  'src/derived/referenceOutline.mjs',
  'src/derived/index.mjs',
];
const PURE_FORBIDDEN_PATTERNS = [
  /from\s+['"]node:fs['"]/u,
  /from\s+['"]node:child_process['"]/u,
  /from\s+['"]node:http['"]/u,
  /from\s+['"]node:https['"]/u,
  /from\s+['"]node:net['"]/u,
  /from\s+['"]electron['"]/u,
  /\bipcMain\b/u,
  /\bipcRenderer\b/u,
  /\bBrowserWindow\b/u,
  /\bfetch\s*\(/u,
];
const SECOND_SOT_FORBIDDEN_PATTERNS = [
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

function parseArgs(argv) {
  const out = { json: false };
  for (const arg of argv) {
    if (arg === '--json') out.json = true;
  }
  return out;
}

function listDerivedFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const out = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!fullPath.endsWith('.mjs')) continue;
      out.push(fullPath.replaceAll('\\', '/'));
    }
  }
  return out.sort();
}

function toToken(value) {
  return value ? 1 : 0;
}

function buildFixtureState() {
  const result = applyCoreSequence(createInitialCoreState(), [
    {
      type: CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: {
        projectId: 'project-derived-fixture',
        title: 'Derived Fixture',
        sceneId: 'scene-1',
      },
    },
    {
      type: CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: {
        projectId: 'project-derived-fixture',
        sceneId: 'scene-1',
        text: '# Chapter 1\nDeterministic line\n',
      },
    },
  ]);
  return result;
}

function evaluateDerivedViewsState() {
  const state = {
    toolVersion: TOOL_VERSION,
    requiredFiles: REQUIRED_FILES,
    derivedFiles: [],
    missingFiles: [],
    pureViolations: [],
    secondSotViolations: [],
    deterministicChecks: {
      sameInputSameOutput: 0,
      sameInputSameInvalidationKey: 0,
      paramsChangeChangesInvalidationKey: 0,
      capabilityChangeChangesInvalidationKey: 0,
      coreStateChangeChangesInvalidationKey: 0,
    },
    DERIVED_VIEWS_PURE_OK: 0,
    DERIVED_VIEWS_DETERMINISTIC_OK: 0,
    DERIVED_VIEWS_NO_SECOND_SOT_OK: 0,
    DERIVED_VIEWS_INVALIDATION_KEY_OK: 0,
    DERIVED_VIEWS_INFRA_OK: 0,
    failReason: '',
  };

  state.derivedFiles = listDerivedFiles(DERIVED_DIR);
  state.missingFiles = REQUIRED_FILES.filter((filePath) => !fs.existsSync(filePath));

  for (const filePath of state.derivedFiles) {
    const text = fs.readFileSync(filePath, 'utf8');
    for (const pattern of PURE_FORBIDDEN_PATTERNS) {
      if (pattern.test(text)) {
        state.pureViolations.push({ filePath, pattern: pattern.source });
      }
    }
    for (const pattern of SECOND_SOT_FORBIDDEN_PATTERNS) {
      if (pattern.test(text)) {
        state.secondSotViolations.push({ filePath, pattern: pattern.source });
      }
    }
    if (/(^|\/)(model|store)\.[^/]+$/iu.test(filePath)) {
      state.secondSotViolations.push({ filePath, pattern: 'forbidden_file_name_model_or_store' });
    }
  }

  const fixture = buildFixtureState();
  let deterministicOk = false;
  let invalidationOk = false;

  if (fixture.ok) {
    const inputBase = {
      coreState: fixture.state,
      params: { projectId: 'project-derived-fixture', viewMode: 'compact' },
      capabilitySnapshot: {
        platformId: 'node',
        capabilities: { outline: true },
      },
    };

    const runA = deriveReferenceOutline(inputBase);
    const runB = deriveReferenceOutline(inputBase);
    const runParamsChanged = deriveReferenceOutline({
      ...inputBase,
      params: { projectId: 'project-derived-fixture', viewMode: 'expanded' },
    });
    const runCapabilityChanged = deriveReferenceOutline({
      ...inputBase,
      capabilitySnapshot: {
        platformId: 'node',
        capabilities: { outline: true, historyViews: true },
      },
    });
    const changedCore = applyCoreSequence(fixture.state, [
      {
        type: CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
        payload: {
          projectId: 'project-derived-fixture',
          sceneId: 'scene-1',
          text: '# Chapter 1\nDeterministic line changed\n',
        },
      },
    ]);
    const runCoreChanged = changedCore.ok
      ? deriveReferenceOutline({
        ...inputBase,
        coreState: changedCore.state,
      })
      : null;

    const sameValue = runA.ok && runB.ok
      && JSON.stringify(runA.value) === JSON.stringify(runB.value)
      && runA.meta?.outputHash === runB.meta?.outputHash;
    const sameInvalidation = runA.ok && runB.ok
      && typeof runA.meta?.invalidationKey === 'string'
      && runA.meta.invalidationKey.length > 0
      && runA.meta.invalidationKey === runB.meta?.invalidationKey;
    const paramsChangesKey = runA.ok && runParamsChanged.ok
      && runA.meta?.invalidationKey !== runParamsChanged.meta?.invalidationKey;
    const capabilityChangesKey = runA.ok && runCapabilityChanged.ok
      && runA.meta?.invalidationKey !== runCapabilityChanged.meta?.invalidationKey;
    const coreChangesKey = runA.ok && runCoreChanged && runCoreChanged.ok
      && runA.meta?.invalidationKey !== runCoreChanged.meta?.invalidationKey;

    state.deterministicChecks.sameInputSameOutput = toToken(sameValue);
    state.deterministicChecks.sameInputSameInvalidationKey = toToken(sameInvalidation);
    state.deterministicChecks.paramsChangeChangesInvalidationKey = toToken(paramsChangesKey);
    state.deterministicChecks.capabilityChangeChangesInvalidationKey = toToken(capabilityChangesKey);
    state.deterministicChecks.coreStateChangeChangesInvalidationKey = toToken(coreChangesKey);

    deterministicOk = Boolean(sameValue && sameInvalidation);
    invalidationOk = Boolean(paramsChangesKey && capabilityChangesKey && coreChangesKey);
  } else {
    state.failReason = 'DERIVED_VIEWS_FIXTURE_BUILD_FAILED';
  }

  state.DERIVED_VIEWS_PURE_OK = toToken(
    state.missingFiles.length === 0 && state.pureViolations.length === 0,
  );
  state.DERIVED_VIEWS_DETERMINISTIC_OK = toToken(deterministicOk);
  state.DERIVED_VIEWS_NO_SECOND_SOT_OK = toToken(
    state.missingFiles.length === 0 && state.secondSotViolations.length === 0,
  );
  state.DERIVED_VIEWS_INVALIDATION_KEY_OK = toToken(invalidationOk);
  state.DERIVED_VIEWS_INFRA_OK = toToken(
    state.DERIVED_VIEWS_PURE_OK === 1
      && state.DERIVED_VIEWS_DETERMINISTIC_OK === 1
      && state.DERIVED_VIEWS_NO_SECOND_SOT_OK === 1
      && state.DERIVED_VIEWS_INVALIDATION_KEY_OK === 1,
  );

  if (!state.failReason && state.DERIVED_VIEWS_INFRA_OK !== 1) {
    if (state.DERIVED_VIEWS_PURE_OK !== 1) state.failReason = 'DERIVED_VIEWS_PURITY_FAIL';
    else if (state.DERIVED_VIEWS_DETERMINISTIC_OK !== 1) state.failReason = 'DERIVED_VIEWS_DETERMINISM_FAIL';
    else if (state.DERIVED_VIEWS_NO_SECOND_SOT_OK !== 1) state.failReason = 'DERIVED_VIEWS_SECOND_SOT_FAIL';
    else if (state.DERIVED_VIEWS_INVALIDATION_KEY_OK !== 1) state.failReason = 'DERIVED_VIEWS_INVALIDATION_KEY_FAIL';
    else state.failReason = 'DERIVED_VIEWS_INFRA_FAIL';
  }

  return state;
}

function printTokens(state) {
  console.log(`DERIVED_VIEWS_TOOL_VERSION=${state.toolVersion}`);
  console.log(`DERIVED_VIEWS_REQUIRED_FILES=${JSON.stringify(state.requiredFiles)}`);
  console.log(`DERIVED_VIEWS_DISCOVERED_FILES=${JSON.stringify(state.derivedFiles)}`);
  console.log(`DERIVED_VIEWS_MISSING_FILES=${JSON.stringify(state.missingFiles)}`);
  console.log(`DERIVED_VIEWS_PURE_VIOLATIONS=${JSON.stringify(state.pureViolations)}`);
  console.log(`DERIVED_VIEWS_SECOND_SOT_VIOLATIONS=${JSON.stringify(state.secondSotViolations)}`);
  console.log(`DERIVED_VIEWS_DETERMINISTIC_CHECKS=${JSON.stringify(state.deterministicChecks)}`);
  console.log(`DERIVED_VIEWS_PURE_OK=${state.DERIVED_VIEWS_PURE_OK}`);
  console.log(`DERIVED_VIEWS_DETERMINISTIC_OK=${state.DERIVED_VIEWS_DETERMINISTIC_OK}`);
  console.log(`DERIVED_VIEWS_NO_SECOND_SOT_OK=${state.DERIVED_VIEWS_NO_SECOND_SOT_OK}`);
  console.log(`DERIVED_VIEWS_INVALIDATION_KEY_OK=${state.DERIVED_VIEWS_INVALIDATION_KEY_OK}`);
  console.log(`DERIVED_VIEWS_INFRA_OK=${state.DERIVED_VIEWS_INFRA_OK}`);
  if (state.failReason) {
    console.log(`FAIL_REASON=${state.failReason}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateDerivedViewsState();
  if (args.json) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  } else {
    printTokens(state);
  }
  process.exit(state.DERIVED_VIEWS_INFRA_OK === 1 ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}

export { evaluateDerivedViewsState };
