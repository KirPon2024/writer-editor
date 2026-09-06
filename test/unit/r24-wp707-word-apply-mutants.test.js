const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { createWp707Scenario } = require('../fixtures/r24-wp707-word-apply-fixtures.js');

async function subject() {
  return import(pathToFileURL(path.join(process.cwd(), 'src/interchange/word-single-scene-apply-v1.mjs')).href);
}

test('WP707 authority and lifecycle mutants fail closed without broadening the writer', async (t) => {
  const module = await subject();
  const cases = [
    {
      name: 'mission digest drift',
      expected: 'WP707_MISSION_DIGEST_MISMATCH',
      mutate(scenario) { scenario.input.missionDigest = '0'.repeat(64); },
    },
    {
      name: 'decision stage drift',
      expected: 'WP707_DECISION_NOT_EXACT_BOUND',
      mutate(scenario) { scenario.input.decision.stageId = 'WP-708_GOOGLE_PROVIDER'; },
    },
    {
      name: 'stale Word build profile',
      expected: 'WP707_WORD_PROFILE_STALE',
      mutate(scenario) { scenario.input.wordProfile.admissionBuildId = 'different-build'; },
    },
    {
      name: 'existing user data marker',
      expected: 'WP707_DISPOSABLE_MARKER_MISMATCH',
      mutate(scenario) {
        const markerPath = path.join(scenario.projectRoot, '.yalken-wp707-disposable.json');
        const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
        marker.preexisting = true;
        fs.writeFileSync(markerPath, `${JSON.stringify(marker)}\n`, 'utf8');
      },
    },
    {
      name: 'command kernel identity drift',
      expected: 'WP707_COMMAND_KERNEL_REVALIDATION_DENIED',
      mutate(scenario) {
        scenario.options.commandKernelPort.revalidateWordSingleSceneApply = async (request) => ({
          decision: 'ALLOW',
          revalidatedBy: 'COMMAND_KERNEL',
          phase: request.phase,
          commandId: request.commandId,
          projectId: request.projectId,
          sceneId: 'wrong-scene',
          capability: request.capability,
          wordBuildId: request.wordBuildId,
          automaticApply: false,
        });
      },
    },
  ];

  for (const [index, item] of cases.entries()) {
    await t.test(item.name, async () => {
      const scenario = createWp707Scenario({ ordinal: 300 + index });
      item.mutate(scenario);
      let writerCalls = 0;
      const result = await module.executeWordSingleSceneApplyV1(scenario.input, {
        ...scenario.options,
        exactApply: async () => { writerCalls += 1; },
      });
      assert.equal(result.ok, false);
      assert.equal(result.code, item.expected);
      assert.equal(writerCalls, 0);
      assert.equal(fs.readFileSync(scenario.scenePath, 'utf8'), scenario.beforeText);
      fs.rmSync(scenario.allowedRoot, { recursive: true, force: true });
    });
  }
});

test('WP707 rejects a symlink scene path before command dispatch', async () => {
  const module = await subject();
  const scenario = createWp707Scenario({ ordinal: 399 });
  const actualPath = path.join(scenario.projectRoot, 'actual-scene.md');
  fs.renameSync(scenario.scenePath, actualPath);
  fs.symlinkSync(actualPath, scenario.scenePath);
  let revalidations = 0;
  scenario.options.commandKernelPort.revalidateWordSingleSceneApply = async () => {
    revalidations += 1;
    return { decision: 'ALLOW' };
  };
  const result = await module.executeWordSingleSceneApplyV1(scenario.input, scenario.options);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'WP707_DISPOSABLE_SYMLINK_DENIED');
  assert.equal(revalidations, 0);
  assert.equal(fs.readFileSync(actualPath, 'utf8'), scenario.beforeText);
  fs.rmSync(scenario.allowedRoot, { recursive: true, force: true });
});

test('WP707 kills ten actual source mutants without counting import failures', async (t) => {
  const subjectPath = path.join(process.cwd(), 'src/interchange/word-single-scene-apply-v1.mjs');
  const exactApplyUrl = pathToFileURL(path.join(process.cwd(), 'src/io/revisionBridge/reviewTransportExactApply.mjs')).href;
  const original = fs.readFileSync(subjectPath, 'utf8').replace(
    "from '../io/revisionBridge/reviewTransportExactApply.mjs';",
    `from '${exactApplyUrl}';`,
  );
  const mutations = [
    ["'2d188140211c4e2a65f0f1bf1bef5bac53e396e3c3887cb3563fa253a10b0c80';", "'0d188140211c4e2a65f0f1bf1bef5bac53e396e3c3887cb3563fa253a10b0c80';"],
    ["export const WP707_STAGE_ID = 'WP-707_WORD_APPLY';", "export const WP707_STAGE_ID = 'WP-707_WORD_APPLY_MUTANT';"],
    ["export const WP707_GATE_ID = 'WORD_MULTI_SCENE_SEPARATE_ADR';", "export const WP707_GATE_ID = 'WORD_MULTI_SCENE_SEPARATE_ADR_MUTANT';"],
    ["export const WP707_DECISION_ID = 'WORD_MULTI_SCENE_SEPARATE_ADR_WP707_SINGLE_SCENE_ONLY_V1';", "export const WP707_DECISION_ID = 'WORD_MULTI_SCENE_SEPARATE_ADR_WP707_SINGLE_SCENE_ONLY_MUTANT';"],
    ["const WORD_PROFILE = 'WORD_LOCAL_PHYSICAL';", "const WORD_PROFILE = 'WORD_LOCAL_PHYSICAL_MUTANT';"],
    ['input.explicitUserConfirmation !== true', 'input.explicitUserConfirmation === true'],
    ['input.automaticApply !== false', 'input.automaticApply === false'],
    ['input.multiSceneApply !== false', 'input.multiSceneApply === false'],
    ['input.atomicMultiSceneSemantics !== false', 'input.atomicMultiSceneSemantics === false'],
    ["input.lifecycle?.returnState !== 'RETURN_ANALYZED'", "input.lifecycle?.returnState !== 'RETURN_ANALYZED_MUTANT'"],
  ];

  for (const [index, [needle, replacement]] of mutations.entries()) {
    await t.test(`source mutant ${index + 1} is killed`, async () => {
      assert.equal(original.includes(needle), true, `mutation anchor ${index + 1} missing`);
      const mutated = original.replace(needle, replacement);
      assert.notEqual(mutated, original);
      const dataUrl = `data:text/javascript;base64,${Buffer.from(`${mutated}\n//# sourceURL=wp707-mutant-${index + 1}.mjs\n`, 'utf8').toString('base64')}`;
      let module;
      await assert.doesNotReject(async () => { module = await import(dataUrl); });
      const scenario = createWp707Scenario({ ordinal: 500 + index });
      let calls = 0;
      const result = await module.executeWordSingleSceneApplyV1(scenario.input, {
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
      assert.equal(result.ok, false, `mutant ${index + 1} survived`);
      assert.equal(calls, 0);
      fs.rmSync(scenario.allowedRoot, { recursive: true, force: true });
    });
  }
});
