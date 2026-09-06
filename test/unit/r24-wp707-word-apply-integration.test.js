const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { createWp707Scenario } = require('../fixtures/r24-wp707-word-apply-fixtures.js');

test('WP707 real exact writer closes three independent disposable project lifecycles', async () => {
  const subject = await import(pathToFileURL(path.join(process.cwd(), 'src/interchange/word-single-scene-apply-v1.mjs')).href);
  const results = [];
  const roots = [];
  try {
    for (let ordinal = 201; ordinal <= 203; ordinal += 1) {
      const scenario = createWp707Scenario({ ordinal });
      roots.push(scenario.allowedRoot);
      const result = await subject.executeWordSingleSceneApplyV1(scenario.input, scenario.options);
      assert.equal(result.ok, true, JSON.stringify(result));
      assert.equal(result.status, 'verified');
      assert.equal(result.firstOutcome, 'applied');
      assert.equal(result.firstWriterCalled, true);
      assert.equal(result.replayOutcome, 'replay');
      assert.equal(result.replayWriterCalled, false);
      assert.equal(result.afterTextSha256, result.readbackTextSha256);
      assert.equal(fs.readFileSync(scenario.scenePath, 'utf8'), scenario.afterText);
      assert.equal(scenario.commandRevalidations.length, 2);
      assert.equal(scenario.lifecycleEvents.length, 4);
      results.push(result);
    }
  } finally {
    for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
  }
  assert.equal(results.length, 3);
  assert.equal(new Set(results.map((item) => item.projectId)).size, 3);
  assert.equal(new Set(results.map((item) => item.sceneId)).size, 3);
  assert.equal(new Set(results.map((item) => item.disposableBoundary.projectRootSha256)).size, 3);
});
