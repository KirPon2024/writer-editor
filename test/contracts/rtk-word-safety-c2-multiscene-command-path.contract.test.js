const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const COMMAND_KERNEL_PATH = path.join(REPO_ROOT, 'src', 'command', 'commandSurfaceKernel.js');
const MODULE_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'reviewTransportMultiSceneNonOverlapTrackedReplacementRuntime.mjs');
const MAIN_PATH = path.join(REPO_ROOT, 'src', 'main.js');

const MULTI_COMMAND_ID = 'cmd.rtk.review.applyMultiSceneNonOverlapTrackedReplacements';
const SINGLE_COMMAND_ID = 'cmd.rtk.review.applyNonOverlapTrackedReplacements';

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const cryptoPort = {
  sha256Text(value) {
    return crypto.createHash('sha256').update(Buffer.from(String(value || ''), 'utf8')).digest('hex');
  },
  sha256Json(value) {
    return `sha256:${this.sha256Text(stableJson(value))}`;
  },
};

function sha256Text(value) {
  return `sha256:${cryptoPort.sha256Text(value)}`;
}

async function loadModule() {
  return import(pathToFileURL(MODULE_PATH).href);
}

function tmpProject() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-c2-multiscene-'));
  const scenes = {
    alpha: {
      sceneId: 'scene-alpha',
      blockId: 'block-alpha',
      text: 'Alpha beta gamma.',
      replacement: 'delta',
      fileName: 'alpha.txt',
    },
    bravo: {
      sceneId: 'scene-bravo',
      blockId: 'block-bravo',
      text: 'One beta two.',
      replacement: 'epsilon',
      fileName: 'bravo.txt',
    },
  };
  for (const scene of Object.values(scenes)) {
    scene.scenePath = path.join(projectRoot, scene.fileName);
    fs.writeFileSync(scene.scenePath, scene.text, 'utf8');
  }
  return { projectRoot, scenes };
}

function exactAuthority(overrides = {}) {
  return {
    validSignedLocator: true,
    sceneRevisionUnchanged: true,
    rawSha256Unchanged: true,
    uniqueTarget: true,
    nonOverlapping: true,
    allRelevantXmlSemanticsAccounted: true,
    ambiguousDuplicate: false,
    crossScene: false,
    structuralTopologyChanged: false,
    ...overrides,
  };
}

function authorityCarrier(scene) {
  return {
    schemaVersion: 'yalken.rtk.review-transport-authority-carrier.v2',
    status: 'verified-baseline-bound',
    selectedCarrier: {
      carrier: 'customDocumentProperty',
      propertyName: 'YRTK_C01_AUTH',
      verified: true,
      validSignedLocator: true,
      payload: {
        sceneId: scene.sceneId,
        sceneRevision: `scene-revision-${scene.sceneId}`,
        rawSha256: sha256Text(`raw:${scene.text}`),
        blockId: scene.blockId,
        roundId: 'round-c2',
        exportId: 'export-c2',
      },
      baselineBinding: {
        allExpectedPresent: true,
        allExpectedMatched: true,
        sceneRevisionMatches: true,
        rawSha256Matches: true,
      },
    },
    carriers: [],
    exactAuthority: exactAuthority(),
    reasons: [],
  };
}

function reviewIr(scene, overrides = {}) {
  const groupId = `group-${scene.sceneId}`;
  return {
    schemaVersion: 'yalken.rtk.review-ir.v2',
    sourceMode: 'TRACKED',
    textRevisions: [
      {
        kind: 'TextRevision',
        operation: 'delete',
        nativeRevisionId: `del-${scene.sceneId}`,
        text: 'beta',
        textDigest: sha256Text('delete:beta'),
        replacementGroupId: groupId,
      },
      {
        kind: 'TextRevision',
        operation: 'insert',
        nativeRevisionId: `ins-${scene.sceneId}`,
        text: scene.replacement,
        textDigest: sha256Text(`insert:${scene.replacement}`),
        replacementGroupId: groupId,
      },
    ],
    moveRevisions: [],
    propertyRevisions: [],
    structureChanges: [],
    formattingDeltas: [],
    commentThreads: [],
    opaqueUnsupported: [],
    ...overrides,
  };
}

function writerContext(project, scene, text = scene.text, projectRoot = project.projectRoot) {
  return {
    projectRoot,
    scenePath: scene.scenePath,
    scenePathBySceneId: { [scene.sceneId]: scene.scenePath },
    projectSnapshot: {
      projectId: 'project-c2',
      baselineHash: 'baseline-c2',
      scenes: [{ sceneId: scene.sceneId, text }],
    },
    revisionSession: {
      projectId: 'project-c2',
      sessionId: `session-${scene.sceneId}`,
      baselineHash: 'baseline-c2',
      status: 'open',
      reviewGraph: {
        commentThreads: [],
        commentPlacements: [],
        textChanges: [],
        structuralChanges: [],
        diagnosticItems: [],
        decisionStates: [],
      },
    },
  };
}

function sceneCommandInput(project, scene, overrides = {}) {
  const sourceRevisionSha256 = sha256Text(`revision:${scene.text}`);
  const sourceRawBytesSha256 = sha256Text(`raw:${scene.text}`);
  return {
    commandId: SINGLE_COMMAND_ID,
    callerRole: 'main',
    commandAuthority: {
      issuer: 'main',
      intent: 'rtk.exactApply',
      commandId: SINGLE_COMMAND_ID,
    },
    roundId: overrides.roundId || 'round-c2',
    requestId: overrides.requestId || `request-${scene.sceneId}`,
    exportIdentity: 'export-c2',
    returnArtifactSha256: sha256Text(`returned-docx-${scene.sceneId}`),
    manifestDigest: sha256Text(`manifest-${scene.sceneId}`),
    analysisDigest: sha256Text(`analysis-${scene.sceneId}`),
    returnLifecycleState: 'RETURN_ANALYZED',
    sourceIdentity: {
      sourceTokenDomain: 'SOURCE_TOKEN_DOMAIN_V1',
      writerTextDomain: 'WRITER_TEXT_DOMAIN_V1',
      revisionSha256: sourceRevisionSha256,
      rawBytesSha256: sourceRawBytesSha256,
    },
    currentIdentity: {
      revisionSha256: sourceRevisionSha256,
      rawBytesSha256: sourceRawBytesSha256,
    },
    exactAuthority: exactAuthority(overrides.exactAuthority),
    authorityCarrier: authorityCarrier(scene),
    blockExactAuthority: overrides.blockExactAuthority,
    reviewIr: overrides.reviewIr || reviewIr(scene, overrides.reviewIrOverride),
    localBaseline: overrides.localBaseline || {
      sceneId: scene.sceneId,
      sceneBlocks: [
        {
          sceneId: scene.sceneId,
          blockId: scene.blockId,
          text: scene.text,
        },
      ],
    },
    writerContext: overrides.writerContext || writerContext(
      project,
      scene,
      scene.text,
      overrides.projectRoot || project.projectRoot,
    ),
    previewConfirmed: true,
  };
}

function multiInput(project, overrides = {}) {
  const alpha = overrides.alphaInput || sceneCommandInput(project, project.scenes.alpha, overrides.alpha || {});
  const bravo = overrides.bravoInput || sceneCommandInput(project, project.scenes.bravo, overrides.bravo || {});
  return {
    commandId: MULTI_COMMAND_ID,
    projectId: 'project-c2',
    roundId: 'round-c2',
    requestId: overrides.requestId || 'request-multiscene-c2',
    previewConfirmed: overrides.previewConfirmed !== false,
    sceneCommands: [
      { sceneId: overrides.alphaSceneId || project.scenes.alpha.sceneId, input: alpha },
      { sceneId: overrides.bravoSceneId || project.scenes.bravo.sceneId, input: bravo },
    ],
  };
}

function createKernel(module, options = {}) {
  const { createCommandSurfaceKernel } = require(COMMAND_KERNEL_PATH);
  return createCommandSurfaceKernel({
    [MULTI_COMMAND_ID]: module.createRtkMultiSceneNonOverlapTrackedReplacementCommandHandler({
      cryptoPort,
      ...options,
    }),
  });
}

function readScenes(project) {
  return {
    alpha: fs.readFileSync(project.scenes.alpha.scenePath, 'utf8'),
    bravo: fs.readFileSync(project.scenes.bravo.scenePath, 'utf8'),
  };
}

test('C2 allowlists multi-scene command and dispatches through canonical command surface', async () => {
  const { ALLOWED_COMMAND_IDS, createCommandSurfaceKernel } = require(COMMAND_KERNEL_PATH);
  const module = await loadModule();
  const project = tmpProject();
  const kernel = createKernel(module);

  assert.equal(ALLOWED_COMMAND_IDS.includes(MULTI_COMMAND_ID), true);
  assert.equal(ALLOWED_COMMAND_IDS.includes(SINGLE_COMMAND_ID), true);
  assert.equal(
    (await createCommandSurfaceKernel({}).dispatch('cmd.rtk.review.applyMultiSceneTypo', {})).error.reason,
    'COMMAND_ID_NOT_ALLOWED',
  );

  const applied = await kernel.dispatch(MULTI_COMMAND_ID, multiInput(project));
  assert.equal(applied.type, module.RTK_MULTI_SCENE_NON_OVERLAP_TRACKED_REPLACEMENT_RUNTIME_TYPE);
  assert.equal(applied.status, 'applied', JSON.stringify(applied, null, 2));
  // MULTI-01: staged sequential apply is certified as STAGED, not atomic. The
  // runtime apply works, but multiSceneAtomicApplyCertified stays false until a
  // decisive K-MS SIGKILL series proves an atomic convergence path.
  assert.equal(applied.multiSceneAtomicApplyCertified, false);
  assert.equal(applied.automaticApplyCertified, false);
  assert.equal(applied.writerCalled, true);
  assert.deepEqual(readScenes(project), {
    alpha: 'Alpha delta gamma.',
    bravo: 'One epsilon two.',
  });

  const replay = await kernel.dispatch(MULTI_COMMAND_ID, multiInput(project));
  assert.equal(replay.status, 'replay', JSON.stringify(replay, null, 2));
  assert.equal(replay.writerCalled, false);
  assert.deepEqual(readScenes(project), {
    alpha: 'Alpha delta gamma.',
    bravo: 'One epsilon two.',
  });
});

test('C2 concurrent duplicate multi-scene dispatch serializes to one transaction', async () => {
  const module = await loadModule();
  const project = tmpProject();
  const kernel = createKernel(module);
  const input = multiInput(project, { requestId: 'request-multiscene-concurrent' });

  const results = await Promise.all(Array.from({ length: 16 }, () => kernel.dispatch(MULTI_COMMAND_ID, input)));
  const applied = results.filter((result) => result.status === 'applied');
  const replay = results.filter((result) => result.status === 'replay');

  assert.equal(applied.length, 1, JSON.stringify(results, null, 2));
  assert.equal(replay.length, 15, JSON.stringify(results, null, 2));
  assert.equal(results.filter((result) => result.writerCalled === true).length, 1);
  assert.deepEqual(readScenes(project), {
    alpha: 'Alpha delta gamma.',
    bravo: 'One epsilon two.',
  });
});

test('C2 direct module invocation and invalid routes fail before writer authority', async () => {
  const module = await loadModule();
  const project = tmpProject();

  const direct = await module.applyMultiSceneNonOverlapTrackedReplacementRuntime({
    ...multiInput(project),
    callerRole: 'parser',
    commandAuthority: { issuer: 'parser', intent: 'rtk.exactApply', commandId: MULTI_COMMAND_ID },
  }, { cryptoPort });
  assert.equal(direct.status, 'blocked');
  assert.equal(direct.reason, 'RTK_COMMAND_AUTHORITY_BLOCKED');
  assert.equal(direct.writerCalled, false);

  const kernel = createKernel(module);
  const wrongScene = await kernel.dispatch(MULTI_COMMAND_ID, multiInput(project, {
    alphaSceneId: 'scene-other',
  }));
  assert.equal(wrongScene.status, 'blocked');
  assert.equal(wrongScene.reason, 'RTK_MULTI_SCENE_WRONG_SCENE_ROUTE');
  assert.equal(wrongScene.writerCalled, false);

  const duplicateScene = await kernel.dispatch(MULTI_COMMAND_ID, {
    ...multiInput(project),
    sceneCommands: [
      { sceneId: project.scenes.alpha.sceneId, input: sceneCommandInput(project, project.scenes.alpha, { requestId: 'dup-a' }) },
      { sceneId: project.scenes.alpha.sceneId, input: sceneCommandInput(project, project.scenes.alpha, { requestId: 'dup-b' }) },
    ],
  });
  assert.equal(duplicateScene.status, 'blocked');
  assert.equal(duplicateScene.reason, 'RTK_MULTI_SCENE_DUPLICATE_SCENE');
  assert.equal(duplicateScene.writerCalled, false);

  assert.deepEqual(readScenes(project), {
    alpha: project.scenes.alpha.text,
    bravo: project.scenes.bravo.text,
  });
});

test('C2 stale tampered overlapping and cross-project envelopes block before writes', async () => {
  const module = await loadModule();
  const project = tmpProject();
  const kernel = createKernel(module);

  fs.writeFileSync(project.scenes.alpha.scenePath, 'Alpha drifted beta gamma.', 'utf8');
  const stale = await kernel.dispatch(MULTI_COMMAND_ID, multiInput(project, { requestId: 'request-stale' }));
  assert.equal(stale.status, 'blocked', JSON.stringify(stale, null, 2));
  assert.equal(stale.reason, 'RTK_MULTI_SCENE_STALE_SCENE');
  assert.equal(stale.writerCalled, false);
  fs.writeFileSync(project.scenes.alpha.scenePath, project.scenes.alpha.text, 'utf8');

  const tampered = await kernel.dispatch(MULTI_COMMAND_ID, multiInput(project, {
    alpha: {
      blockExactAuthority: {
        authorityDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      },
    },
  }));
  assert.equal(tampered.status, 'blocked');
  assert.equal(tampered.reason, 'RTK_COMMAND_ENVELOPE_TAMPERED');
  assert.equal(tampered.writerCalled, false);

  const overlapping = await kernel.dispatch(MULTI_COMMAND_ID, multiInput(project, {
    alpha: { exactAuthority: { nonOverlapping: false } },
  }));
  assert.equal(overlapping.status, 'blocked');
  assert.equal(overlapping.reason, 'RTK_BLOCKED_TOKEN_CONTRADICTION');
  assert.equal(overlapping.writerCalled, false);

  const otherRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-c2-other-root-'));
  const crossProject = await kernel.dispatch(MULTI_COMMAND_ID, multiInput(project, {
    bravo: { projectRoot: otherRoot },
  }));
  assert.equal(crossProject.status, 'blocked');
  assert.equal(crossProject.reason, 'RTK_MULTI_SCENE_SINGLE_PROJECT_REQUIRED');
  assert.equal(crossProject.writerCalled, false);

  assert.deepEqual(readScenes(project), {
    alpha: project.scenes.alpha.text,
    bravo: project.scenes.bravo.text,
  });
});

test('C2 failure in scene N rolls back every scene to the prepared baseline', async () => {
  const module = await loadModule();
  const project = tmpProject();
  const kernel = createKernel(module, {
    simulateMultiSceneApplyFailureAtIndex: 1,
  });

  const result = await kernel.dispatch(MULTI_COMMAND_ID, multiInput(project, {
    requestId: 'request-multiscene-failure',
  }));
  assert.equal(result.status, 'blocked', JSON.stringify(result, null, 2));
  assert.equal(result.reason, 'RTK_MULTI_SCENE_SIMULATED_SCENE_FAILURE_ROLLED_BACK');
  assert.equal(result.writerCalled, true);
  assert.equal(result.rollback.ok, true);
  assert.equal(result.rollback.results.every((item) => item.restoredBaseline === true), true);
  assert.deepEqual(readScenes(project), {
    alpha: project.scenes.alpha.text,
    bravo: project.scenes.bravo.text,
  });
});

test('C2 rollback invalidates child replay authority and retry converges through parent transaction', async () => {
  const module = await loadModule();
  const project = tmpProject();
  const failingKernel = createKernel(module, {
    simulateMultiSceneApplyFailureAtIndex: 1,
  });
  const input = multiInput(project, {
    requestId: 'request-multiscene-failure-retry',
  });

  const failed = await failingKernel.dispatch(MULTI_COMMAND_ID, input);
  assert.equal(failed.status, 'blocked', JSON.stringify(failed, null, 2));
  assert.equal(failed.reason, 'RTK_MULTI_SCENE_SIMULATED_SCENE_FAILURE_ROLLED_BACK');
  assert.equal(failed.rollback.ok, true);
  assert.deepEqual(readScenes(project), {
    alpha: project.scenes.alpha.text,
    bravo: project.scenes.bravo.text,
  });

  const recovered = await createKernel(module).dispatch(MULTI_COMMAND_ID, input);
  assert.equal(recovered.status, 'applied', JSON.stringify(recovered, null, 2));
  // MULTI-01: staged sequential recovery apply is certified as STAGED, not atomic.
  assert.equal(recovered.multiSceneAtomicApplyCertified, false);
  assert.equal(recovered.writerCalled, true);
  assert.equal(recovered.sceneResults.every((item) => item.replay === false), true);
  assert.equal(recovered.sceneResults.every((item) => item.stagedOutcomeOnly === true), true);
  assert.deepEqual(readScenes(project), {
    alpha: 'Alpha delta gamma.',
    bravo: 'One epsilon two.',
  });

  const replay = await createKernel(module).dispatch(MULTI_COMMAND_ID, input);
  assert.equal(replay.status, 'replay', JSON.stringify(replay, null, 2));
  assert.equal(replay.writerCalled, false);
});

test('C2 main bridge registers the multi-scene handler without renderer writer authority', () => {
  const mainSource = fs.readFileSync(MAIN_PATH, 'utf8');

  assert.match(mainSource, /RTK_REVIEW_APPLY_MULTI_SCENE_NON_OVERLAP_TRACKED_REPLACEMENTS/u);
  assert.match(mainSource, /handleRtkMultiSceneNonOverlapTrackedReplacementCommandSurface/u);
  assert.match(
    mainSource,
    /\[COMMAND_SURFACE_KERNEL_COMMAND_IDS\.RTK_REVIEW_APPLY_MULTI_SCENE_NON_OVERLAP_TRACKED_REPLACEMENTS\]: async \(payload = \{\}\) => \{/u,
  );
  assert.equal(mainSource.includes('rendererWriteAuthority: true'), false);
});
