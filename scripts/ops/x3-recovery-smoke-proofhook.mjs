#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKEN_NAME = 'X3_RECOVERY_SMOKE_OK';
const FAIL_SIGNAL_CODE = 'E_X3_RECOVERY_SMOKE_FAILED';
const EXPECTED_RECOVERED_TEXT = 'Draft v1 recovered';

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

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function applyRecoveryEvents(snapshot, events) {
  const next = deepClone(snapshot);
  if (!isObjectRecord(next.scenes)) {
    throw new Error('E_SMOKE_SCENES_MISSING');
  }

  for (const event of events) {
    if (!isObjectRecord(event)) {
      throw new Error('E_SMOKE_EVENT_INVALID');
    }

    const type = String(event.type || '').trim();
    const sceneId = String(event.sceneId || '').trim();
    if (!type || !sceneId) {
      throw new Error('E_SMOKE_EVENT_FIELDS_INVALID');
    }

    const scene = next.scenes[sceneId];
    if (!isObjectRecord(scene) || typeof scene.text !== 'string') {
      throw new Error('E_SMOKE_SCENE_STATE_INVALID');
    }

    if (type === 'appendText') {
      const text = String(event.text || '');
      if (!text) throw new Error('E_SMOKE_APPEND_TEXT_EMPTY');
      scene.text = `${scene.text}${text}`;
      continue;
    }

    if (type === 'setCursor') {
      const offset = Number(event.offset);
      if (!Number.isInteger(offset) || offset < 0) {
        throw new Error('E_SMOKE_CURSOR_OFFSET_INVALID');
      }
      next.cursorSceneId = sceneId;
      next.cursorOffset = offset;
      continue;
    }

    throw new Error('E_SMOKE_EVENT_TYPE_UNSUPPORTED');
  }

  return next;
}

function runDeterministicRecoverySmokeScenario() {
  const baseline = {
    schemaVersion: 1,
    scenes: {
      scene_1: {
        text: 'Draft',
      },
    },
    cursorSceneId: 'scene_1',
    cursorOffset: 5,
  };

  const eventLog = [
    { type: 'appendText', sceneId: 'scene_1', text: ' v1' },
    { type: 'setCursor', sceneId: 'scene_1', offset: 8 },
    { type: 'appendText', sceneId: 'scene_1', text: ' recovered' },
  ];

  const snapshotBeforeSuspend = applyRecoveryEvents(baseline, eventLog.slice(0, 2));
  const pendingAfterResume = eventLog.slice(2);

  const resumedState = applyRecoveryEvents(snapshotBeforeSuspend, pendingAfterResume);
  const resumedStateSecondRun = applyRecoveryEvents(snapshotBeforeSuspend, pendingAfterResume);
  const fullReplayState = applyRecoveryEvents(baseline, eventLog);

  const recoveredText = String(resumedState?.scenes?.scene_1?.text || '');
  const deterministicResume = stableStringify(resumedState) === stableStringify(resumedStateSecondRun);
  const replayDeterminism = stableStringify(resumedState) === stableStringify(fullReplayState);
  const cursorBound = resumedState.cursorSceneId === 'scene_1'
    && Number.isInteger(resumedState.cursorOffset)
    && resumedState.cursorOffset >= 0;

  return recoveredText === EXPECTED_RECOVERED_TEXT
    && deterministicResume
    && replayDeterminism
    && cursorBound;
}

export function evaluateX3RecoverySmokeProofhook(input = {}) {
  const forceFail = input.forceFail === true || String(process.env.X3_RECOVERY_SMOKE_FORCE_FAIL || '').trim() === '1';
  if (forceFail) {
    return {
      ok: false,
      [TOKEN_NAME]: 0,
      resumeRecoverySmokePass: false,
      failReason: FAIL_SIGNAL_CODE,
    };
  }

  try {
    const pass = runDeterministicRecoverySmokeScenario();
    if (!pass) {
      return {
        ok: false,
        [TOKEN_NAME]: 0,
        resumeRecoverySmokePass: false,
        failReason: FAIL_SIGNAL_CODE,
      };
    }
    return {
      ok: true,
      [TOKEN_NAME]: 1,
      resumeRecoverySmokePass: true,
      failReason: '',
    };
  } catch {
    return {
      ok: false,
      [TOKEN_NAME]: 0,
      resumeRecoverySmokePass: false,
      failReason: FAIL_SIGNAL_CODE,
    };
  }
}

function parseArgs(argv) {
  return {
    json: argv.includes('--json'),
    forceFail: argv.includes('--force-fail'),
  };
}

function printHuman(state) {
  console.log(`${TOKEN_NAME}=${state[TOKEN_NAME]}`);
  console.log(`RESUME_RECOVERY_SMOKE_PASS=${state.resumeRecoverySmokePass ? 1 : 0}`);
  if (state.failReason) {
    console.log(`FAIL_REASON=${state.failReason}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateX3RecoverySmokeProofhook({
    forceFail: args.forceFail,
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
