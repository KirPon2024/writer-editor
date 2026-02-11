#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConflictEnvelope } from '../../src/collab/conflictEnvelope.mjs';
import { mergeRemoteEvent } from '../../src/collab/mergePolicy.mjs';
import { runCollabReplay } from '../../src/collab/replayDeterminism.mjs';

const TOOL_VERSION = 'collab-stress-safe-state.v1';
const COLLAB_DIR = 'src/collab';
const REQUIRED_FILES = [
  'src/collab/conflictEnvelope.mjs',
  'src/collab/mergePolicy.mjs',
  'src/collab/replayDeterminism.mjs',
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

function buildMergeFixture() {
  return {
    localState: {
      version: 3,
      content: 'Base',
      lastOpId: 'op-2',
    },
    remoteEvent: {
      opId: 'op-3',
      authorId: 'writer-A',
      ts: '2026-02-11T10:00:00.000Z',
      commandId: 'project.applyTextEdit',
      baseVersion: 3,
      nextVersion: 4,
      content: 'Base + change',
    },
  };
}

function buildReplayFixture() {
  return {
    initialState: {
      version: 1,
      content: 'Initial',
      lastOpId: 'op-0',
    },
    events: [
      {
        opId: 'op-1',
        authorId: 'writer-A',
        ts: '2026-02-11T10:00:00.000Z',
        commandId: 'project.applyTextEdit',
        baseVersion: 1,
        nextVersion: 2,
        content: 'Draft-1',
      },
      {
        opId: 'op-2',
        authorId: 'writer-B',
        ts: '2026-02-11T10:00:01.000Z',
        commandId: 'project.applyTextEdit',
        baseVersion: 2,
        nextVersion: 3,
        content: 'Draft-2',
      },
      {
        opId: 'op-2',
        authorId: 'writer-B',
        ts: '2026-02-11T10:00:01.000Z',
        commandId: 'project.applyTextEdit',
        baseVersion: 3,
        nextVersion: 4,
        content: 'Duplicate-op',
      },
      {
        opId: 'op-3',
        authorId: 'writer-C',
        ts: '2026-02-11T10:00:02.000Z',
        commandId: 'project.applyTextEdit',
        baseVersion: 99,
        nextVersion: 100,
        content: 'Conflicting-version',
      },
    ],
  };
}

export function evaluateCollabStressSafeState() {
  const state = {
    toolVersion: TOOL_VERSION,
    requiredFiles: REQUIRED_FILES,
    discoveredFiles: [],
    missingFiles: [],
    networkWiringViolations: [],
    coreBypassViolations: [],
    checks: {
      conflictEnvelopeShape: 0,
      mergeDeterministic: 0,
      mergeCanonicalVerdict: 0,
      replayDeterministic: 0,
      replayEnvelopeDeterministic: 0,
    },
    COLLAB_STRESS_SAFE_OK: 0,
    failReason: '',
  };

  state.discoveredFiles = listCollabFiles(COLLAB_DIR);
  state.missingFiles = REQUIRED_FILES.filter((filePath) => !fs.existsSync(filePath));

  for (const filePath of state.discoveredFiles) {
    const text = fs.readFileSync(filePath, 'utf8');
    for (const pattern of NO_NETWORK_WIRING_PATTERNS) {
      if (pattern.test(text)) {
        state.networkWiringViolations.push({ filePath, pattern: pattern.source });
      }
    }
    for (const pattern of NO_CORE_BYPASS_PATTERNS) {
      if (pattern.test(text)) {
        state.coreBypassViolations.push({ filePath, pattern: pattern.source });
      }
    }
  }

  const envelope = createConflictEnvelope({
    code: 'E_COLLAB_BASE_VERSION_MISMATCH',
    op: 'collab.merge',
    reason: 'BASE_VERSION_CONFLICT',
    details: {
      opId: 'op-9',
      authorId: 'writer-Z',
      ts: '2026-02-11T10:00:09.000Z',
      commandId: 'project.applyTextEdit',
    },
  });
  const envelopeShapeOk = envelope.code === 'E_COLLAB_BASE_VERSION_MISMATCH'
    && envelope.op === 'collab.merge'
    && envelope.reason === 'BASE_VERSION_CONFLICT'
    && envelope.details?.opId === 'op-9'
    && envelope.details?.authorId === 'writer-Z'
    && envelope.details?.ts === '2026-02-11T10:00:09.000Z'
    && envelope.details?.commandId === 'project.applyTextEdit';
  state.checks.conflictEnvelopeShape = toToken(envelopeShapeOk);

  const mergeFixture = buildMergeFixture();
  const mergeA = mergeRemoteEvent(mergeFixture);
  const mergeB = mergeRemoteEvent(mergeFixture);
  const mergeDeterministic = JSON.stringify(mergeA) === JSON.stringify(mergeB);
  const mergeCanonicalVerdict = mergeA.verdict === 'applied'
    && mergeA.state?.version === 4
    && mergeA.state?.content === 'Base + change'
    && mergeA.state?.lastOpId === 'op-3'
    && mergeA.envelope === null;
  state.checks.mergeDeterministic = toToken(mergeDeterministic);
  state.checks.mergeCanonicalVerdict = toToken(mergeCanonicalVerdict);

  const replayFixture = buildReplayFixture();
  const replayA = runCollabReplay(replayFixture);
  const replayB = runCollabReplay(replayFixture);
  const replayDeterministic = replayA.stateHash === replayB.stateHash
    && JSON.stringify(replayA.finalState) === JSON.stringify(replayB.finalState)
    && JSON.stringify(replayA.stats) === JSON.stringify(replayB.stats);
  const replayEnvelopeDeterministic = JSON.stringify(replayA.envelopes) === JSON.stringify(replayB.envelopes);
  state.checks.replayDeterministic = toToken(replayDeterministic);
  state.checks.replayEnvelopeDeterministic = toToken(replayEnvelopeDeterministic);

  const checksOk = Object.values(state.checks).every((value) => value === 1);
  const policyOk = state.missingFiles.length === 0
    && state.networkWiringViolations.length === 0
    && state.coreBypassViolations.length === 0;
  state.COLLAB_STRESS_SAFE_OK = toToken(checksOk && policyOk);

  if (state.COLLAB_STRESS_SAFE_OK !== 1) {
    if (state.missingFiles.length > 0) state.failReason = 'COLLAB_REQUIRED_FILES_MISSING';
    else if (state.networkWiringViolations.length > 0) state.failReason = 'COLLAB_NETWORK_WIRING_FORBIDDEN';
    else if (state.coreBypassViolations.length > 0) state.failReason = 'COLLAB_CORE_BYPASS_FORBIDDEN';
    else state.failReason = 'COLLAB_DETERMINISM_OR_POLICY_FAIL';
  }

  return state;
}

function printTokens(state) {
  console.log(`COLLAB_STRESS_SAFE_TOOL_VERSION=${state.toolVersion}`);
  console.log(`COLLAB_STRESS_SAFE_REQUIRED_FILES=${JSON.stringify(state.requiredFiles)}`);
  console.log(`COLLAB_STRESS_SAFE_DISCOVERED_FILES=${JSON.stringify(state.discoveredFiles)}`);
  console.log(`COLLAB_STRESS_SAFE_MISSING_FILES=${JSON.stringify(state.missingFiles)}`);
  console.log(`COLLAB_STRESS_SAFE_NETWORK_WIRING_VIOLATIONS=${JSON.stringify(state.networkWiringViolations)}`);
  console.log(`COLLAB_STRESS_SAFE_CORE_BYPASS_VIOLATIONS=${JSON.stringify(state.coreBypassViolations)}`);
  console.log(`COLLAB_STRESS_SAFE_CHECKS=${JSON.stringify(state.checks)}`);
  console.log(`COLLAB_STRESS_SAFE_OK=${state.COLLAB_STRESS_SAFE_OK}`);
  if (state.failReason) {
    console.log(`FAIL_REASON=${state.failReason}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateCollabStressSafeState();
  if (args.json) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  } else {
    printTokens(state);
  }
  process.exit(state.COLLAB_STRESS_SAFE_OK === 1 ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
