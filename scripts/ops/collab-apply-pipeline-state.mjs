#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORE_COMMAND_IDS, createInitialCoreState, hashCoreState, reduceCoreState } from '../../src/core/runtime.mjs';
import { applyEventLog } from '../../src/collab/applyEventLog.mjs';

const TOOL_VERSION = 'collab-apply-pipeline-state.v1';
const REQUIRED_FILES = [
  'src/collab/applyEventLog.mjs',
  'src/collab/index.mjs',
];
const APPLY_PIPELINE_FILE = 'src/collab/applyEventLog.mjs';
const NO_NETWORK_WIRING_PATTERNS = [
  /from\s+['"]node:net['"]/u,
  /from\s+['"]node:http['"]/u,
  /from\s+['"]node:https['"]/u,
  /from\s+['"]ws['"]/u,
  /from\s+['"]electron['"]/u,
  /\bWebSocket\b/u,
  /\bfetch\s*\(/u,
  /\bXMLHttpRequest\b/u,
];
const NO_CORE_BYPASS_PATTERNS = [
  /from\s+['"][^'"]*\/core\/[^'"]*['"]/u,
  /from\s+['"][^'"]*\/renderer\/[^'"]*['"]/u,
];
const PURE_FORBIDDEN_PATTERNS = [
  /from\s+['"]node:fs['"]/u,
  /from\s+['"]node:child_process['"]/u,
  /\bDate\.now\s*\(/u,
  /\bnew\s+Date\s*\(/u,
  /\bMath\.random\s*\(/u,
  /\bcrypto\.randomUUID\s*\(/u,
  /\bsetTimeout\s*\(/u,
  /\bsetInterval\s*\(/u,
  /\bperformance\.now\s*\(/u,
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

function stableJson(value) {
  return JSON.stringify(value);
}

function buildDeterministicFixture() {
  const initialState = createInitialCoreState();
  const initialStateHash = hashCoreState(initialState);
  const step1 = reduceCoreState(initialState, {
    type: CORE_COMMAND_IDS.PROJECT_CREATE,
    payload: {
      projectId: 'collab-apply-project',
      title: 'Collab Apply Fixture',
      sceneId: 'scene-1',
    },
  });
  const step2 = reduceCoreState(step1.state, {
    type: CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
    payload: {
      projectId: 'collab-apply-project',
      sceneId: 'scene-1',
      text: '# Fixture\nLine 1\n',
    },
  });

  return {
    initialState,
    initialStateHash,
    expectedFinalHash: step2.stateHash,
    events: [
      {
        eventId: 'ev-1',
        actorId: 'writer-A',
        ts: '2026-02-13T11:00:00.000Z',
        opId: 'op-1',
        commandId: CORE_COMMAND_IDS.PROJECT_CREATE,
        payload: {
          projectId: 'collab-apply-project',
          title: 'Collab Apply Fixture',
          sceneId: 'scene-1',
        },
        prevHash: initialStateHash,
      },
      {
        eventId: 'ev-2',
        actorId: 'writer-A',
        ts: '2026-02-13T11:00:01.000Z',
        opId: 'op-2',
        commandId: CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
        payload: {
          projectId: 'collab-apply-project',
          sceneId: 'scene-1',
          text: '# Fixture\nLine 1\n',
        },
        prevHash: step1.stateHash,
      },
      {
        eventId: 'ev-2',
        actorId: 'writer-A',
        ts: '2026-02-13T11:00:02.000Z',
        opId: 'op-2-dup',
        commandId: CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
        payload: {
          projectId: 'collab-apply-project',
          sceneId: 'scene-1',
          text: '# Fixture\nLine duplicate\n',
        },
        prevHash: step2.stateHash,
      },
    ],
  };
}

function hasTypedRejectionShape(rejection) {
  return Boolean(
    rejection
    && typeof rejection.code === 'string'
    && typeof rejection.opId === 'string'
    && typeof rejection.eventId === 'string'
    && typeof rejection.commandId === 'string'
    && typeof rejection.reason === 'string'
    && rejection.details
    && typeof rejection.details === 'object'
    && !Array.isArray(rejection.details),
  );
}

export function evaluateCollabApplyPipelineState() {
  const state = {
    toolVersion: TOOL_VERSION,
    requiredFiles: REQUIRED_FILES,
    missingFiles: [],
    policyViolations: {
      network: [],
      coreBypass: [],
      purity: [],
    },
    checks: {
      deterministicResult: 0,
      deterministicRejected: 0,
      deterministicHash: 0,
      typedRejections: 0,
      typedPrevHashMismatch: 0,
      typedCommandRejected: 0,
      pureStatic: 0,
    },
    COLLAB_APPLY_PIPELINE_PURE_OK: 0,
    COLLAB_APPLY_PIPELINE_DETERMINISTIC_OK: 0,
    COLLAB_APPLY_PIPELINE_TYPED_ERRORS_OK: 0,
    COLLAB_APPLY_PIPELINE_OK: 0,
    failReason: '',
  };

  state.missingFiles = REQUIRED_FILES.filter((filePath) => !fs.existsSync(filePath));
  const text = fs.existsSync(APPLY_PIPELINE_FILE) ? fs.readFileSync(APPLY_PIPELINE_FILE, 'utf8') : '';

  for (const pattern of NO_NETWORK_WIRING_PATTERNS) {
    if (pattern.test(text)) state.policyViolations.network.push(pattern.source);
  }
  for (const pattern of NO_CORE_BYPASS_PATTERNS) {
    if (pattern.test(text)) state.policyViolations.coreBypass.push(pattern.source);
  }
  for (const pattern of PURE_FORBIDDEN_PATTERNS) {
    if (pattern.test(text)) state.policyViolations.purity.push(pattern.source);
  }

  const pureStatic = state.missingFiles.length === 0
    && state.policyViolations.network.length === 0
    && state.policyViolations.coreBypass.length === 0
    && state.policyViolations.purity.length === 0;
  state.checks.pureStatic = toToken(pureStatic);

  const fixture = buildDeterministicFixture();
  const applyOnce = () => applyEventLog({
    coreState: fixture.initialState,
    events: fixture.events,
    initialStateHash: fixture.initialStateHash,
    applyCommand: (currentState, command) => reduceCoreState(currentState, command),
    hashState: (value) => hashCoreState(value),
  });

  const runA = applyOnce();
  const runB = applyOnce();
  const deterministicResult = stableJson(runA.nextState) === stableJson(runB.nextState)
    && runA.appliedCount === runB.appliedCount;
  const deterministicRejected = stableJson(runA.rejected) === stableJson(runB.rejected);
  const deterministicHash = runA.stateHash === runB.stateHash
    && runA.stateHash === fixture.expectedFinalHash
    && runA.appliedCount === 2;
  state.checks.deterministicResult = toToken(deterministicResult);
  state.checks.deterministicRejected = toToken(deterministicRejected);
  state.checks.deterministicHash = toToken(deterministicHash);

  const typedRejections = Array.isArray(runA.rejected)
    && runA.rejected.length >= 1
    && runA.rejected.every((rejection) => hasTypedRejectionShape(rejection));

  const invalidEventRun = applyEventLog({
    coreState: fixture.initialState,
    events: [
      {
        eventId: '',
        actorId: 'writer-B',
        ts: '2026-02-13T11:10:00.000Z',
        opId: 'op-invalid',
        commandId: CORE_COMMAND_IDS.PROJECT_CREATE,
        payload: {},
      },
      {
        eventId: 'ev-prev',
        actorId: 'writer-B',
        ts: '2026-02-13T11:10:01.000Z',
        opId: 'op-prev',
        commandId: CORE_COMMAND_IDS.PROJECT_CREATE,
        payload: {},
        prevHash: 'wrong-prev-hash',
      },
      {
        eventId: 'ev-reject',
        actorId: 'writer-B',
        ts: '2026-02-13T11:10:02.000Z',
        opId: 'op-reject',
        commandId: 'project.unknown',
        payload: {},
      },
    ],
    initialStateHash: fixture.initialStateHash,
    applyCommand: (currentState, command) => reduceCoreState(currentState, command),
    hashState: (value) => hashCoreState(value),
  });

  const typedPrevHashMismatch = invalidEventRun.rejected.some((rejection) => rejection.code === 'E_COLLAB_APPLY_PREV_HASH_MISMATCH');
  const typedCommandRejected = invalidEventRun.rejected.some((rejection) => rejection.code === 'E_COLLAB_APPLY_COMMAND_REJECTED');
  state.checks.typedRejections = toToken(typedRejections);
  state.checks.typedPrevHashMismatch = toToken(typedPrevHashMismatch);
  state.checks.typedCommandRejected = toToken(typedCommandRejected);

  state.COLLAB_APPLY_PIPELINE_PURE_OK = toToken(state.checks.pureStatic === 1);
  state.COLLAB_APPLY_PIPELINE_DETERMINISTIC_OK = toToken(
    state.checks.deterministicResult === 1
      && state.checks.deterministicRejected === 1
      && state.checks.deterministicHash === 1,
  );
  state.COLLAB_APPLY_PIPELINE_TYPED_ERRORS_OK = toToken(
    state.checks.typedRejections === 1
      && state.checks.typedPrevHashMismatch === 1
      && state.checks.typedCommandRejected === 1,
  );
  state.COLLAB_APPLY_PIPELINE_OK = toToken(
    state.COLLAB_APPLY_PIPELINE_PURE_OK === 1
      && state.COLLAB_APPLY_PIPELINE_DETERMINISTIC_OK === 1
      && state.COLLAB_APPLY_PIPELINE_TYPED_ERRORS_OK === 1,
  );

  if (state.COLLAB_APPLY_PIPELINE_OK !== 1) {
    if (state.missingFiles.length > 0) state.failReason = 'COLLAB_APPLY_PIPELINE_REQUIRED_FILES_MISSING';
    else if (state.COLLAB_APPLY_PIPELINE_PURE_OK !== 1) state.failReason = 'COLLAB_APPLY_PIPELINE_PURITY_FAIL';
    else if (state.COLLAB_APPLY_PIPELINE_DETERMINISTIC_OK !== 1) state.failReason = 'COLLAB_APPLY_PIPELINE_DETERMINISM_FAIL';
    else if (state.COLLAB_APPLY_PIPELINE_TYPED_ERRORS_OK !== 1) state.failReason = 'COLLAB_APPLY_PIPELINE_TYPED_ERRORS_FAIL';
    else state.failReason = 'COLLAB_APPLY_PIPELINE_FAIL';
  }

  return state;
}

function printTokens(state) {
  console.log(`COLLAB_APPLY_PIPELINE_TOOL_VERSION=${state.toolVersion}`);
  console.log(`COLLAB_APPLY_PIPELINE_REQUIRED_FILES=${JSON.stringify(state.requiredFiles)}`);
  console.log(`COLLAB_APPLY_PIPELINE_MISSING_FILES=${JSON.stringify(state.missingFiles)}`);
  console.log(`COLLAB_APPLY_PIPELINE_POLICY_VIOLATIONS=${JSON.stringify(state.policyViolations)}`);
  console.log(`COLLAB_APPLY_PIPELINE_CHECKS=${JSON.stringify(state.checks)}`);
  console.log(`COLLAB_APPLY_PIPELINE_PURE_OK=${state.COLLAB_APPLY_PIPELINE_PURE_OK}`);
  console.log(`COLLAB_APPLY_PIPELINE_DETERMINISTIC_OK=${state.COLLAB_APPLY_PIPELINE_DETERMINISTIC_OK}`);
  console.log(`COLLAB_APPLY_PIPELINE_TYPED_ERRORS_OK=${state.COLLAB_APPLY_PIPELINE_TYPED_ERRORS_OK}`);
  console.log(`COLLAB_APPLY_PIPELINE_OK=${state.COLLAB_APPLY_PIPELINE_OK}`);
  if (state.failReason) console.log(`FAIL_REASON=${state.failReason}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateCollabApplyPipelineState();
  if (args.json) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  } else {
    printTokens(state);
  }
  process.exit(state.COLLAB_APPLY_PIPELINE_OK === 1 ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
