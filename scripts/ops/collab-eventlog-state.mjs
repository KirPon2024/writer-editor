#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInitialCoreState, hashCoreState, reduceCoreState } from '../../src/core/runtime.mjs';
import {
  createEmptyEventLog,
  appendEventLogEntry,
  applyCommandWithEventLog,
  replayEventLog,
  serializeEventLog,
} from '../../src/collab/eventLog.mjs';

const TOOL_VERSION = 'collab-eventlog-state.v1';
const COLLAB_DIR = 'src/collab';
const REQUIRED_FILES = [
  'src/collab/eventLog.mjs',
  'src/collab/index.mjs',
];
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

function listCollabFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  return fs.readdirSync(rootDir)
    .filter((entry) => entry.endsWith('.mjs'))
    .map((entry) => `${rootDir}/${entry}`)
    .sort();
}

function buildReplayFixture() {
  return [
    {
      opId: 'evt-1',
      ts: '2026-02-13T09:00:00.000Z',
      actorId: 'writer-A',
      command: {
        type: 'project.create',
        payload: {
          projectId: 'collab-eventlog-project',
          title: 'Collab EventLog Fixture',
          sceneId: 'scene-1',
        },
      },
    },
    {
      opId: 'evt-2',
      ts: '2026-02-13T09:00:01.000Z',
      actorId: 'writer-A',
      command: {
        type: 'project.applyTextEdit',
        payload: {
          projectId: 'collab-eventlog-project',
          sceneId: 'scene-1',
          text: '# Fixture\nLine 1\n',
        },
      },
    },
  ];
}

function runReplayFixture() {
  const fixture = buildReplayFixture();
  let eventLog = createEmptyEventLog();
  let state = createInitialCoreState();
  let stateHash = hashCoreState(state);

  for (const step of fixture) {
    const result = applyCommandWithEventLog({
      eventLog,
      currentState: state,
      currentStateHash: stateHash,
      opId: step.opId,
      ts: step.ts,
      actorId: step.actorId,
      commandId: step.command.type,
      payload: step.command.payload,
      applyCommand: (currentState, command) => reduceCoreState(currentState, command),
    });

    if (!result.ok) {
      return {
        ok: false,
        error: result.error || {},
      };
    }

    state = result.state;
    stateHash = result.stateHash;
    eventLog = result.eventLog;
  }

  const replayA = replayEventLog({
    eventLog,
    initialStateHash: hashCoreState(createInitialCoreState()),
  });
  const replayB = replayEventLog({
    eventLog,
    initialStateHash: hashCoreState(createInitialCoreState()),
  });

  return {
    ok: replayA.ok && replayB.ok,
    stateHash,
    replayA,
    replayB,
    eventLog,
  };
}

export function evaluateCollabEventLogState() {
  const state = {
    toolVersion: TOOL_VERSION,
    requiredFiles: REQUIRED_FILES,
    discoveredFiles: [],
    missingFiles: [],
    networkWiringViolations: [],
    coreBypassViolations: [],
    checks: {
      schemaDeterministic: 0,
      appendOnly: 0,
      replayDeterministic: 0,
      idempotency: 0,
      noBypassCore: 0,
    },
    COLLAB_EVENTLOG_SCHEMA_OK: 0,
    COLLAB_EVENTLOG_APPEND_ONLY_OK: 0,
    COLLAB_EVENTLOG_REPLAY_DETERMINISTIC_OK: 0,
    COLLAB_EVENTLOG_IDEMPOTENCY_OK: 0,
    COLLAB_EVENTLOG_OK: 0,
    failReason: '',
  };

  state.discoveredFiles = listCollabFiles(COLLAB_DIR);
  state.missingFiles = REQUIRED_FILES.filter((filePath) => !fs.existsSync(filePath));

  for (const filePath of state.discoveredFiles) {
    const text = fs.readFileSync(filePath, 'utf8');
    for (const pattern of NO_NETWORK_WIRING_PATTERNS) {
      if (pattern.test(text)) state.networkWiringViolations.push({ filePath, pattern: pattern.source });
    }
    for (const pattern of NO_CORE_BYPASS_PATTERNS) {
      if (pattern.test(text)) state.coreBypassViolations.push({ filePath, pattern: pattern.source });
    }
  }

  const schemaLog = createEmptyEventLog();
  const serializedA = serializeEventLog(schemaLog);
  const serializedB = serializeEventLog(schemaLog);
  const schemaDeterministic = schemaLog.schemaVersion === 'collab-eventlog.v1'
    && Array.isArray(schemaLog.events)
    && schemaLog.events.length === 0
    && serializedA === serializedB;
  state.checks.schemaDeterministic = toToken(schemaDeterministic);

  const entryA = {
    opId: 'append-1',
    ts: '2026-02-13T09:10:00.000Z',
    actorId: 'writer-A',
    commandId: 'project.create',
    payloadHash: 'payload-hash-1',
    preStateHash: 'state-hash-0',
    postStateHash: 'state-hash-1',
  };
  const entryB = {
    opId: 'append-2',
    ts: '2026-02-13T09:10:01.000Z',
    actorId: 'writer-B',
    commandId: 'project.applyTextEdit',
    payloadHash: 'payload-hash-2',
    preStateHash: 'state-hash-1',
    postStateHash: 'state-hash-2',
  };
  const appendA = appendEventLogEntry({ eventLog: createEmptyEventLog(), entry: entryA });
  const appendB = appendA.ok
    ? appendEventLogEntry({ eventLog: appendA.eventLog, entry: entryB })
    : { ok: false, eventLog: createEmptyEventLog() };
  const appendOnly = appendA.ok
    && appendB.ok
    && appendA.eventLog.events.length === 1
    && appendB.eventLog.events.length === 2
    && JSON.stringify(appendB.eventLog.events[0]) === JSON.stringify(entryA)
    && JSON.stringify(appendB.eventLog.events[1]) === JSON.stringify(entryB);
  state.checks.appendOnly = toToken(appendOnly);

  const replayRun = runReplayFixture();
  const replayDeterministic = replayRun.ok
    && replayRun.replayA.finalStateHash === replayRun.replayB.finalStateHash
    && replayRun.replayA.finalStateHash === replayRun.stateHash
    && replayRun.replayA.eventLogHash === replayRun.replayB.eventLogHash;
  state.checks.replayDeterministic = toToken(replayDeterministic);

  const duplicate = appendA.ok
    ? appendEventLogEntry({
      eventLog: appendA.eventLog,
      entry: {
        ...entryA,
        postStateHash: 'state-hash-9',
      },
    })
    : { ok: true };
  const idempotency = appendA.ok
    && duplicate.ok === false
    && duplicate.error?.code === 'E_COLLAB_EVENTLOG_OPID_DUPLICATE';
  state.checks.idempotency = toToken(idempotency);

  let callbackCalls = 0;
  const noBypassApply = applyCommandWithEventLog({
    eventLog: createEmptyEventLog(),
    currentState: { marker: 'before' },
    currentStateHash: 'hash-before',
    opId: 'evt-bypass-1',
    ts: '2026-02-13T09:12:00.000Z',
    actorId: 'writer-Z',
    commandId: 'project.applyTextEdit',
    payload: { text: 'x' },
    applyCommand: () => {
      callbackCalls += 1;
      return {
        ok: true,
        state: { marker: 'from-core' },
        stateHash: 'hash-from-core',
      };
    },
  });
  const noBypassFail = applyCommandWithEventLog({
    eventLog: createEmptyEventLog(),
    currentState: { marker: 'before' },
    currentStateHash: 'hash-before',
    opId: 'evt-bypass-2',
    ts: '2026-02-13T09:12:01.000Z',
    actorId: 'writer-Z',
    commandId: 'project.applyTextEdit',
    payload: { text: 'x' },
    applyCommand: () => ({ ok: false, error: { code: 'E_CORE_FAILURE' } }),
  });
  const noBypassCore = callbackCalls === 1
    && noBypassApply.ok
    && noBypassApply.stateHash === 'hash-from-core'
    && noBypassApply.entry?.preStateHash === 'hash-before'
    && noBypassApply.entry?.postStateHash === 'hash-from-core'
    && noBypassFail.ok === false
    && noBypassFail.error?.code === 'E_COLLAB_EVENTLOG_APPLY_COMMAND_FAILED'
    && Array.isArray(noBypassFail.eventLog?.events)
    && noBypassFail.eventLog.events.length === 0;
  state.checks.noBypassCore = toToken(noBypassCore);

  state.COLLAB_EVENTLOG_SCHEMA_OK = toToken(state.checks.schemaDeterministic === 1);
  state.COLLAB_EVENTLOG_APPEND_ONLY_OK = toToken(state.checks.appendOnly === 1);
  state.COLLAB_EVENTLOG_REPLAY_DETERMINISTIC_OK = toToken(state.checks.replayDeterministic === 1);
  state.COLLAB_EVENTLOG_IDEMPOTENCY_OK = toToken(state.checks.idempotency === 1);

  const checksOk = state.COLLAB_EVENTLOG_SCHEMA_OK === 1
    && state.COLLAB_EVENTLOG_APPEND_ONLY_OK === 1
    && state.COLLAB_EVENTLOG_REPLAY_DETERMINISTIC_OK === 1
    && state.COLLAB_EVENTLOG_IDEMPOTENCY_OK === 1
    && state.checks.noBypassCore === 1;
  const policyOk = state.missingFiles.length === 0
    && state.networkWiringViolations.length === 0
    && state.coreBypassViolations.length === 0;
  state.COLLAB_EVENTLOG_OK = toToken(checksOk && policyOk);

  if (state.COLLAB_EVENTLOG_OK !== 1) {
    if (state.missingFiles.length > 0) state.failReason = 'COLLAB_EVENTLOG_REQUIRED_FILES_MISSING';
    else if (state.networkWiringViolations.length > 0) state.failReason = 'COLLAB_EVENTLOG_NETWORK_WIRING_FORBIDDEN';
    else if (state.coreBypassViolations.length > 0) state.failReason = 'COLLAB_EVENTLOG_CORE_BYPASS_FORBIDDEN';
    else if (state.checks.noBypassCore !== 1) state.failReason = 'COLLAB_EVENTLOG_NO_BYPASS_CORE_FAIL';
    else state.failReason = 'COLLAB_EVENTLOG_CONTRACT_FAIL';
  }

  return state;
}

function printTokens(state) {
  console.log(`COLLAB_EVENTLOG_TOOL_VERSION=${state.toolVersion}`);
  console.log(`COLLAB_EVENTLOG_REQUIRED_FILES=${JSON.stringify(state.requiredFiles)}`);
  console.log(`COLLAB_EVENTLOG_DISCOVERED_FILES=${JSON.stringify(state.discoveredFiles)}`);
  console.log(`COLLAB_EVENTLOG_MISSING_FILES=${JSON.stringify(state.missingFiles)}`);
  console.log(`COLLAB_EVENTLOG_NETWORK_WIRING_VIOLATIONS=${JSON.stringify(state.networkWiringViolations)}`);
  console.log(`COLLAB_EVENTLOG_CORE_BYPASS_VIOLATIONS=${JSON.stringify(state.coreBypassViolations)}`);
  console.log(`COLLAB_EVENTLOG_CHECKS=${JSON.stringify(state.checks)}`);
  console.log(`COLLAB_EVENTLOG_SCHEMA_OK=${state.COLLAB_EVENTLOG_SCHEMA_OK}`);
  console.log(`COLLAB_EVENTLOG_APPEND_ONLY_OK=${state.COLLAB_EVENTLOG_APPEND_ONLY_OK}`);
  console.log(`COLLAB_EVENTLOG_REPLAY_DETERMINISTIC_OK=${state.COLLAB_EVENTLOG_REPLAY_DETERMINISTIC_OK}`);
  console.log(`COLLAB_EVENTLOG_IDEMPOTENCY_OK=${state.COLLAB_EVENTLOG_IDEMPOTENCY_OK}`);
  console.log(`COLLAB_EVENTLOG_OK=${state.COLLAB_EVENTLOG_OK}`);
  if (state.failReason) console.log(`FAIL_REASON=${state.failReason}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateCollabEventLogState();
  if (args.json) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  } else {
    printTokens(state);
  }
  process.exit(state.COLLAB_EVENTLOG_OK === 1 ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
