#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyCoreSequence, CORE_COMMAND_IDS, createInitialCoreState } from '../../src/core/runtime.mjs';
import { hashCanonicalValue } from '../../src/derived/deriveView.mjs';
import { deriveMindMapGraph } from '../../src/derived/mindmap/deriveMindMapGraph.mjs';

const TOOL_VERSION = 'mindmap-derived-state.v1';
const MINDMAP_DERIVED_DIR = 'src/derived/mindmap';
const REQUIRED_FILES = [
  'src/derived/mindmap/deriveMindMapGraph.mjs',
  'src/derived/mindmap/mindMapGraphTypes.mjs',
  'src/derived/mindmap/index.mjs',
];
const FORBIDDEN_PATTERNS = [
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
];

function parseArgs(argv) {
  const out = { json: false };
  for (const arg of argv) {
    if (arg === '--json') out.json = true;
  }
  return out;
}

function listMindMapFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  return fs.readdirSync(rootDir)
    .filter((entry) => entry.endsWith('.mjs'))
    .map((entry) => `${rootDir}/${entry}`)
    .sort();
}

function toToken(value) {
  return value ? 1 : 0;
}

function buildFixtureState() {
  return applyCoreSequence(createInitialCoreState(), [
    {
      type: CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: {
        projectId: 'project-mindmap-fixture',
        title: 'MindMap Fixture',
        sceneId: 'scene-1',
      },
    },
    {
      type: CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: {
        projectId: 'project-mindmap-fixture',
        sceneId: 'scene-1',
        text: '# Chapter 1\n## Beat A\nLine\n',
      },
    },
  ]);
}

function evaluateMindMapDerivedState() {
  const state = {
    toolVersion: TOOL_VERSION,
    requiredFiles: REQUIRED_FILES,
    discoveredFiles: [],
    missingFiles: [],
    noSecondSotViolations: [],
    checks: {
      deterministicHash: 0,
      deterministicStructure: 0,
      hashMatchesCanonical: 0,
      invalidationEcho: 0,
      invalidationChangesOnParams: 0,
      invalidationChangesOnCapability: 0,
      invalidationChangesOnCoreState: 0,
      capabilityGateTypedError: 0,
    },
    MINDMAP_DERIVED_GRAPH_DETERMINISTIC_OK: 0,
    MINDMAP_DERIVED_GRAPH_HASH_OK: 0,
    MINDMAP_DERIVED_GRAPH_INVALIDATION_KEY_OK: 0,
    MINDMAP_DERIVED_GRAPH_NO_SECOND_SOT_OK: 0,
    MINDMAP_DERIVED_GRAPH_OK: 0,
    failReason: '',
  };

  state.discoveredFiles = listMindMapFiles(MINDMAP_DERIVED_DIR);
  state.missingFiles = REQUIRED_FILES.filter((filePath) => !fs.existsSync(filePath));
  for (const filePath of state.discoveredFiles) {
    const text = fs.readFileSync(filePath, 'utf8');
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(text)) {
        state.noSecondSotViolations.push({ filePath, pattern: pattern.source });
      }
    }
  }

  const fixture = buildFixtureState();
  if (!fixture.ok) {
    state.failReason = 'MINDMAP_DERIVED_FIXTURE_BUILD_FAILED';
  } else {
    const baseInput = {
      coreState: fixture.state,
      params: {
        projectId: 'project-mindmap-fixture',
        layout: 'tree',
      },
      capabilitySnapshot: {
        platformId: 'node',
        capabilities: { mindmapView: true },
      },
    };

    const runA = deriveMindMapGraph(baseInput);
    const runB = deriveMindMapGraph(baseInput);
    const runParamsChanged = deriveMindMapGraph({
      ...baseInput,
      params: {
        projectId: 'project-mindmap-fixture',
        layout: 'radial',
      },
    });
    const runCapabilityChanged = deriveMindMapGraph({
      ...baseInput,
      capabilitySnapshot: {
        platformId: 'node',
        capabilities: { mindmapView: true, graphTheme: 'dense' },
      },
    });
    const changedCore = applyCoreSequence(fixture.state, [
      {
        type: CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
        payload: {
          projectId: 'project-mindmap-fixture',
          sceneId: 'scene-1',
          text: '# Chapter 1\n## Beat B\nLine changed\n',
        },
      },
    ]);
    const runCoreChanged = changedCore.ok
      ? deriveMindMapGraph({
        ...baseInput,
        coreState: changedCore.state,
      })
      : null;
    const runCapabilityDisabled = deriveMindMapGraph({
      ...baseInput,
      capabilitySnapshot: {
        platformId: 'node',
        capabilities: { mindmapView: false },
      },
    });

    const deterministicHash = runA.ok && runB.ok
      && runA.value?.meta?.graphHash === runB.value?.meta?.graphHash;
    const deterministicStructure = runA.ok && runB.ok
      && JSON.stringify(runA.value?.nodes || []) === JSON.stringify(runB.value?.nodes || [])
      && JSON.stringify(runA.value?.edges || []) === JSON.stringify(runB.value?.edges || []);
    const expectedGraphHash = runA.ok
      ? hashCanonicalValue({
        nodes: runA.value?.nodes || [],
        edges: runA.value?.edges || [],
      })
      : '';
    const hashMatchesCanonical = runA.ok && expectedGraphHash === runA.value?.meta?.graphHash;
    const invalidationEcho = runA.ok
      && runA.meta?.invalidationKey === runA.value?.meta?.invalidationKey;
    const invalidationChangesOnParams = runA.ok && runParamsChanged.ok
      && runA.meta?.invalidationKey !== runParamsChanged.meta?.invalidationKey;
    const invalidationChangesOnCapability = runA.ok && runCapabilityChanged.ok
      && runA.meta?.invalidationKey !== runCapabilityChanged.meta?.invalidationKey;
    const invalidationChangesOnCoreState = runA.ok && runCoreChanged && runCoreChanged.ok
      && runA.meta?.invalidationKey !== runCoreChanged.meta?.invalidationKey;
    const capabilityGateTypedError = runCapabilityDisabled.ok === false
      && runCapabilityDisabled.error?.code === 'E_CAPABILITY_DISABLED_FOR_COMMAND'
      && runCapabilityDisabled.error?.reason === 'MINDMAP_VIEW_DISABLED';

    state.checks.deterministicHash = toToken(deterministicHash);
    state.checks.deterministicStructure = toToken(deterministicStructure);
    state.checks.hashMatchesCanonical = toToken(hashMatchesCanonical);
    state.checks.invalidationEcho = toToken(invalidationEcho);
    state.checks.invalidationChangesOnParams = toToken(invalidationChangesOnParams);
    state.checks.invalidationChangesOnCapability = toToken(invalidationChangesOnCapability);
    state.checks.invalidationChangesOnCoreState = toToken(invalidationChangesOnCoreState);
    state.checks.capabilityGateTypedError = toToken(capabilityGateTypedError);
  }

  state.MINDMAP_DERIVED_GRAPH_DETERMINISTIC_OK = toToken(
    state.checks.deterministicHash === 1 && state.checks.deterministicStructure === 1,
  );
  state.MINDMAP_DERIVED_GRAPH_HASH_OK = toToken(state.checks.hashMatchesCanonical === 1);
  state.MINDMAP_DERIVED_GRAPH_INVALIDATION_KEY_OK = toToken(
    state.checks.invalidationEcho === 1
      && state.checks.invalidationChangesOnParams === 1
      && state.checks.invalidationChangesOnCapability === 1
      && state.checks.invalidationChangesOnCoreState === 1,
  );
  state.MINDMAP_DERIVED_GRAPH_NO_SECOND_SOT_OK = toToken(
    state.missingFiles.length === 0 && state.noSecondSotViolations.length === 0,
  );
  state.MINDMAP_DERIVED_GRAPH_OK = toToken(
    state.MINDMAP_DERIVED_GRAPH_DETERMINISTIC_OK === 1
      && state.MINDMAP_DERIVED_GRAPH_HASH_OK === 1
      && state.MINDMAP_DERIVED_GRAPH_INVALIDATION_KEY_OK === 1
      && state.MINDMAP_DERIVED_GRAPH_NO_SECOND_SOT_OK === 1,
  );

  if (!state.failReason && state.MINDMAP_DERIVED_GRAPH_OK !== 1) {
    if (state.MINDMAP_DERIVED_GRAPH_DETERMINISTIC_OK !== 1) state.failReason = 'MINDMAP_DERIVED_DETERMINISTIC_FAIL';
    else if (state.MINDMAP_DERIVED_GRAPH_HASH_OK !== 1) state.failReason = 'MINDMAP_DERIVED_HASH_FAIL';
    else if (state.MINDMAP_DERIVED_GRAPH_INVALIDATION_KEY_OK !== 1) state.failReason = 'MINDMAP_DERIVED_INVALIDATION_FAIL';
    else if (state.MINDMAP_DERIVED_GRAPH_NO_SECOND_SOT_OK !== 1) state.failReason = 'MINDMAP_DERIVED_SECOND_SOT_FAIL';
    else state.failReason = 'MINDMAP_DERIVED_GRAPH_FAIL';
  }

  return state;
}

function printTokens(state) {
  console.log(`MINDMAP_DERIVED_TOOL_VERSION=${state.toolVersion}`);
  console.log(`MINDMAP_DERIVED_REQUIRED_FILES=${JSON.stringify(state.requiredFiles)}`);
  console.log(`MINDMAP_DERIVED_DISCOVERED_FILES=${JSON.stringify(state.discoveredFiles)}`);
  console.log(`MINDMAP_DERIVED_MISSING_FILES=${JSON.stringify(state.missingFiles)}`);
  console.log(`MINDMAP_DERIVED_NO_SECOND_SOT_VIOLATIONS=${JSON.stringify(state.noSecondSotViolations)}`);
  console.log(`MINDMAP_DERIVED_CHECKS=${JSON.stringify(state.checks)}`);
  console.log(`MINDMAP_DERIVED_GRAPH_DETERMINISTIC_OK=${state.MINDMAP_DERIVED_GRAPH_DETERMINISTIC_OK}`);
  console.log(`MINDMAP_DERIVED_GRAPH_HASH_OK=${state.MINDMAP_DERIVED_GRAPH_HASH_OK}`);
  console.log(`MINDMAP_DERIVED_GRAPH_INVALIDATION_KEY_OK=${state.MINDMAP_DERIVED_GRAPH_INVALIDATION_KEY_OK}`);
  console.log(`MINDMAP_DERIVED_GRAPH_NO_SECOND_SOT_OK=${state.MINDMAP_DERIVED_GRAPH_NO_SECOND_SOT_OK}`);
  console.log(`MINDMAP_DERIVED_GRAPH_OK=${state.MINDMAP_DERIVED_GRAPH_OK}`);
  if (state.failReason) {
    console.log(`FAIL_REASON=${state.failReason}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateMindMapDerivedState();
  if (args.json) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  } else {
    printTokens(state);
  }
  process.exit(state.MINDMAP_DERIVED_GRAPH_OK === 1 ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}

export { evaluateMindMapDerivedState };
