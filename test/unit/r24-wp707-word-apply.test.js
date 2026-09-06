const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { createWp707Scenario } = require('../fixtures/r24-wp707-word-apply-fixtures.js');

async function loadSubject() {
  return import(pathToFileURL(path.join(process.cwd(), 'src/interchange/word-single-scene-apply-v1.mjs')).href);
}

test('WP707 executes one explicit single-scene apply then reuses the completed round', async () => {
  const subject = await loadSubject();
  const scenario = createWp707Scenario({ ordinal: 101 });
  let calls = 0;
  const result = await subject.executeWordSingleSceneApplyV1(scenario.input, {
    ...scenario.options,
    exactApply: async () => {
      calls += 1;
      if (calls === 1) {
        fs.writeFileSync(scenario.scenePath, scenario.afterText, 'utf8');
        return { ok: true, status: 'applied', writerCalled: true };
      }
      return { ok: true, status: 'replay', writerCalled: false };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'verified');
  assert.equal(result.firstOutcome, 'applied');
  assert.equal(result.firstWriterCalled, true);
  assert.equal(result.replayOutcome, 'replay');
  assert.equal(result.replayWriterCalled, false);
  assert.equal(result.automaticApply, false);
  assert.equal(result.multiSceneApply, false);
  assert.equal(result.beforeTextSha256 !== result.afterTextSha256, true);
  assert.equal(result.afterTextSha256, result.readbackTextSha256);
  assert.deepEqual(scenario.commandRevalidations.map((item) => item.phase), [
    'APPLY_BEFORE_MUTATION',
    'REPLAY_BEFORE_IDEMPOTENCY_CHECK',
  ]);
  assert.deepEqual(scenario.lifecycleEvents.map((item) => item.event), [
    'close',
    'reopen',
    'readback',
    'readback',
  ]);
  assert.equal(fs.readFileSync(scenario.scenePath, 'utf8'), scenario.afterText);
  fs.rmSync(scenario.allowedRoot, { recursive: true, force: true });
});

test('WP707 rejects automatic apply before writer invocation', async () => {
  const subject = await loadSubject();
  const scenario = createWp707Scenario({ ordinal: 102 });
  scenario.input.automaticApply = true;
  let writerCalls = 0;
  const result = await subject.executeWordSingleSceneApplyV1(scenario.input, {
    ...scenario.options,
    exactApply: async () => { writerCalls += 1; },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'WP707_EXPLICIT_SINGLE_SCENE_REQUIRED');
  assert.equal(writerCalls, 0);
  assert.equal(fs.readFileSync(scenario.scenePath, 'utf8'), scenario.beforeText);
  fs.rmSync(scenario.allowedRoot, { recursive: true, force: true });
});

test('WP707 rejects cross-scene changes and path maps before writer invocation', async () => {
  const subject = await loadSubject();
  const scenario = createWp707Scenario({ ordinal: 103 });
  const secondScenePath = path.join(scenario.projectRoot, 'scene-second.md');
  fs.writeFileSync(secondScenePath, 'Second scene.', 'utf8');
  const second = {
    ...scenario.change,
    changeId: 'change-second',
    targetScope: { type: 'scene', id: 'scene-second.md' },
  };
  scenario.input.envelopeInput.writerInput.reviewItems.push(second);
  scenario.input.envelopeInput.writerInput.scenePathBySceneId['scene-second.md'] = secondScenePath;
  let writerCalls = 0;
  const result = await subject.executeWordSingleSceneApplyV1(scenario.input, {
    ...scenario.options,
    exactApply: async () => { writerCalls += 1; },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'WP707_CROSS_SCENE_WRITE_DENIED');
  assert.equal(writerCalls, 0);
  assert.equal(fs.readFileSync(scenario.scenePath, 'utf8'), scenario.beforeText);
  assert.equal(fs.readFileSync(secondScenePath, 'utf8'), 'Second scene.');
  fs.rmSync(scenario.allowedRoot, { recursive: true, force: true });
});
