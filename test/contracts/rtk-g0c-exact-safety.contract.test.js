const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  return import(pathToFileURL(path.join(process.cwd(), relativePath)).href);
}

function sha256Text(text) {
  return crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

function tmpScene(text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-g0c-exact-'));
  const scenePath = path.join(dir, 'scene.md');
  fs.writeFileSync(scenePath, text, 'utf8');
  return { dir, scenePath };
}

function projectSnapshot({
  projectId = 'project-g0c',
  baselineHash = 'baseline-g0c',
  sceneId = 'scene-1',
  sceneText,
} = {}) {
  return {
    projectId,
    baselineHash,
    scenes: [{ sceneId, text: sceneText }],
  };
}

function revisionSession({
  projectId = 'project-g0c',
  baselineHash = 'baseline-g0c',
  sessionId = 'session-g0c',
  status = 'open',
  textChanges,
  structuralChanges = [],
} = {}) {
  return {
    projectId,
    baselineHash,
    sessionId,
    status,
    reviewGraph: {
      commentThreads: [],
      commentPlacements: [],
      textChanges,
      structuralChanges,
      diagnosticItems: [],
      decisionStates: [],
    },
  };
}

function textChange({
  changeId,
  quote,
  replacementText,
  sceneId = 'scene-1',
} = {}) {
  return {
    changeId,
    targetScope: { type: 'scene', id: sceneId },
    match: { kind: 'exact', quote, prefix: '', suffix: '' },
    replacementText,
    createdAt: '2026-07-29T12:00:00.000Z',
  };
}

function batchInput(scenePath, sceneText, changes, overrides = {}) {
  const snapshot = overrides.projectSnapshot || projectSnapshot({
    projectId: overrides.projectId || 'project-g0c',
    baselineHash: overrides.baselineHash || 'baseline-g0c',
    sceneText,
  });
  const session = overrides.revisionSession || revisionSession({
    projectId: overrides.sessionProjectId || snapshot.projectId,
    baselineHash: overrides.sessionBaselineHash || snapshot.baselineHash,
    status: overrides.status || 'open',
    structuralChanges: overrides.structuralChanges || [],
    textChanges: changes,
  });
  return {
    projectRoot: path.dirname(scenePath),
    projectSnapshot: snapshot,
    revisionSession: session,
    reviewItems: changes,
    scenePath,
    scenePathBySceneId: { 'scene-1': scenePath },
  };
}

test('G0C exact planner counts overlapping occurrences with step one', async () => {
  const bridge = await loadModule('src/io/revisionBridge/index.mjs');
  const cases = [
    { label: 'aaa-aa', sceneText: 'aaa', quote: 'aa', matchCount: 2 },
    { label: 'aaaa-aa', sceneText: 'aaaa', quote: 'aa', matchCount: 3 },
    { label: 'unicode-combining-overlap', sceneText: 'a\u0301a\u0301a\u0301', quote: 'a\u0301a\u0301', matchCount: 2 },
  ];

  for (const item of cases) {
    const result = bridge.buildExactTextApplyPlanNoDiskPreview({
      projectSnapshot: projectSnapshot({ sceneText: item.sceneText }),
      revisionSession: revisionSession({
        textChanges: [textChange({
          changeId: `change-${item.label}`,
          quote: item.quote,
          replacementText: 'replacement',
        })],
      }),
    });

    assert.equal(result.status, 'blocked', item.label);
    assert.equal(result.reason, 'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_DUPLICATE_MATCH', item.label);
    assert.deepEqual(result.plan.applyOps, [], item.label);
    assert.equal(result.reasons[0].matchCount, item.matchCount, item.label);
  }
});

test('G0C batch exact apply blocks duplicate change IDs and overlapping baseline ranges with zero writes', async () => {
  const safeWrite = await loadModule('src/io/revisionBridge/exactTextMinSafeWrite.mjs');

  const duplicateScene = tmpScene('Alpha beta gamma.');
  const duplicateChanges = [
    textChange({ changeId: 'same-change', quote: 'Alpha', replacementText: 'One' }),
    textChange({ changeId: 'same-change', quote: 'gamma', replacementText: 'Two' }),
  ];
  const duplicateResult = await safeWrite.applyExactTextBatchMinSafeWrite(
    batchInput(duplicateScene.scenePath, 'Alpha beta gamma.', duplicateChanges),
  );

  assert.equal(duplicateResult.status, 'blocked');
  assert.equal(duplicateResult.reason, 'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_DUPLICATE_CHANGE_ID');
  assert.equal(duplicateResult.receipt, null);
  assert.equal(duplicateResult.applied, false);
  assert.equal(fs.readFileSync(duplicateScene.scenePath, 'utf8'), 'Alpha beta gamma.');

  const overlapScene = tmpScene('abcd');
  const overlapChanges = [
    textChange({ changeId: 'change-left', quote: 'abc', replacementText: 'x' }),
    textChange({ changeId: 'change-right', quote: 'bcd', replacementText: 'y' }),
  ];
  const overlapResult = await safeWrite.applyExactTextBatchMinSafeWrite(
    batchInput(overlapScene.scenePath, 'abcd', overlapChanges),
  );

  assert.equal(overlapResult.status, 'blocked');
  assert.equal(overlapResult.reason, 'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_OVERLAPPING_RANGE');
  assert.equal(overlapResult.receipt, null);
  assert.equal(overlapResult.applied, false);
  assert.equal(fs.readFileSync(overlapScene.scenePath, 'utf8'), 'abcd');
});

test('G0C batch exact apply computes all ranges on immutable baseline', async () => {
  const safeWrite = await loadModule('src/io/revisionBridge/exactTextMinSafeWrite.mjs');
  const scene = tmpScene('cat');
  const changes = [
    textChange({ changeId: 'change-create-dog', quote: 'cat', replacementText: 'dog' }),
    textChange({ changeId: 'change-use-created-dog', quote: 'dog', replacementText: 'wolf' }),
  ];

  const result = await safeWrite.applyExactTextBatchMinSafeWrite(
    batchInput(scene.scenePath, 'cat', changes),
  );

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_CURRENT_NO_MATCH');
  assert.equal(result.reasons[0].changeId, 'change-use-created-dog');
  assert.equal(result.receipt, null);
  assert.equal(result.applied, false);
  assert.equal(fs.readFileSync(scene.scenePath, 'utf8'), 'cat');
});

test('G0C disjoint batch permutation preserves final text hash', async () => {
  const safeWrite = await loadModule('src/io/revisionBridge/exactTextMinSafeWrite.mjs');
  const firstScene = tmpScene('one two three four');
  const secondScene = tmpScene('one two three four');
  const firstChanges = [
    textChange({ changeId: 'change-two', quote: 'two', replacementText: '2' }),
    textChange({ changeId: 'change-four', quote: 'four', replacementText: '4' }),
  ];
  const secondChanges = firstChanges.slice().reverse();

  const first = await safeWrite.applyExactTextBatchMinSafeWrite(
    batchInput(firstScene.scenePath, 'one two three four', firstChanges),
    { operationId: 'op_g0c_permutation_first' },
  );
  const second = await safeWrite.applyExactTextBatchMinSafeWrite(
    batchInput(secondScene.scenePath, 'one two three four', secondChanges),
    { operationId: 'op_g0c_permutation_second' },
  );

  assert.equal(first.status, 'applied');
  assert.equal(second.status, 'applied');
  assert.equal(fs.readFileSync(firstScene.scenePath, 'utf8'), 'one 2 three 4');
  assert.equal(fs.readFileSync(secondScene.scenePath, 'utf8'), 'one 2 three 4');
  assert.equal(first.receipt.outputHash, sha256Text('one 2 three 4'));
  assert.equal(second.receipt.outputHash, first.receipt.outputHash);
});

test('G0C batch binding guards return stable typed reasons and zero writes', async () => {
  const safeWrite = await loadModule('src/io/revisionBridge/exactTextMinSafeWrite.mjs');
  const cases = [
    {
      label: 'project mismatch',
      overrides: { projectId: 'project-snapshot', sessionProjectId: 'project-session' },
      reason: 'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_PROJECT_MISMATCH',
    },
    {
      label: 'stale baseline',
      overrides: { baselineHash: 'baseline-snapshot', sessionBaselineHash: 'baseline-session' },
      reason: 'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_STALE_BASELINE',
    },
    {
      label: 'closed session',
      overrides: { status: 'closed' },
      reason: 'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_SESSION_CLOSED',
    },
    {
      label: 'structural candidate',
      overrides: {
        structuralChanges: [{
          structuralChangeId: 'structural-1',
          kind: 'split-scene',
          targetScope: { type: 'scene', id: 'scene-1' },
        }],
      },
      reason: 'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_STRUCTURAL_CHANGE',
    },
  ];

  for (const item of cases) {
    const scene = tmpScene('Alpha beta gamma.');
    const changes = [textChange({ changeId: `change-${item.label}`, quote: 'beta', replacementText: 'delta' })];
    const result = await safeWrite.applyExactTextBatchMinSafeWrite(
      batchInput(scene.scenePath, 'Alpha beta gamma.', changes, item.overrides),
    );

    assert.equal(result.status, 'blocked', item.label);
    assert.equal(result.reason, item.reason, item.label);
    assert.equal(result.receipt, null, item.label);
    assert.equal(result.applied, false, item.label);
    assert.equal(fs.readFileSync(scene.scenePath, 'utf8'), 'Alpha beta gamma.', item.label);
  }
});

test('G0C single exact writer hard-fails tampered claimed plan binding with zero writes', async () => {
  const bridge = await loadModule('src/io/revisionBridge/index.mjs');
  const safeWrite = await loadModule('src/io/revisionBridge/exactTextMinSafeWrite.mjs');
  const scene = tmpScene('Alpha beta gamma.');
  const snapshot = projectSnapshot({ sceneText: 'Alpha beta gamma.' });
  const session = revisionSession({
    textChanges: [textChange({ changeId: 'change-single', quote: 'beta', replacementText: 'delta' })],
  });
  const planPreview = bridge.buildExactTextApplyPlanNoDiskPreview({
    projectSnapshot: snapshot,
    revisionSession: session,
  });
  assert.equal(planPreview.status, 'ready');
  const tampered = JSON.parse(JSON.stringify(planPreview));
  tampered.plan.baselineHash = 'attacker-baseline';

  const result = await safeWrite.applyExactTextMinSafeWrite({
    projectRoot: path.dirname(scene.scenePath),
    projectSnapshot: snapshot,
    revisionSession: session,
    planPreview: tampered,
    scenePath: scene.scenePath,
    scenePathBySceneId: { 'scene-1': scene.scenePath },
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_PLAN_MISMATCH');
  assert.equal(result.receipt, null);
  assert.equal(result.applied, false);
  assert.equal(fs.readFileSync(scene.scenePath, 'utf8'), 'Alpha beta gamma.');
});
