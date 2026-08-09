'use strict';

/*
 * MULTI-01 — RED-FIRST FALSIFIERS (Pass 1)
 *
 * This contract proves, today, that the multi-scene tracked-replacement apply
 * path has NO atomic convergence:
 *   - N scenes are written sequentially with ZERO durable boundary,
 *   - a crash between writes leaves mixed canonical state,
 *   - the only convergence-free recovery is RTK_MULTI_SCENE_PARTIAL_REPLAY_BLOCKED,
 *   - yet the runtime returns multiSceneAtomicApplyCertified:true,
 *   - and matrix/profile/CONTEXT surfaces claim multi-scene EXACT_SUPPORTED.
 *
 * Pass 1 adds ONLY red falsifiers. Implementation (hook seam + claim flip) is
 * Pass 2. Every RED subtest below documents its expected red reason so Pass 2
 * can flip it green by the documented TARGET.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(
  REPO_ROOT,
  'src',
  'io',
  'revisionBridge',
  'reviewTransportMultiSceneNonOverlapTrackedReplacementRuntime.mjs',
);
const COORDINATOR_PATH = path.join(
  REPO_ROOT,
  'src',
  'io',
  'revisionBridge',
  'reviewTransportMultiSceneAtomicCoordinatorV4.mjs',
);
const MATRIX_PATH = path.join(
  REPO_ROOT,
  'docs',
  'OPS',
  'STATUS',
  'YALKEN_WORD_C5V2_TERMINAL_ACCEPTANCE_MATRIX_V1.json',
);
const PROFILE_PATH = path.join(
  REPO_ROOT,
  'docs',
  'OPS',
  'RTK',
  'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json',
);
const CONTEXT_PATH = path.join(REPO_ROOT, 'docs', 'CONTEXT.md');
const COMMAND_KERNEL_PATH = path.join(REPO_ROOT, 'src', 'command', 'commandSurfaceKernel.js');

const MULTI_COMMAND_ID = 'cmd.rtk.review.applyMultiSceneNonOverlapTrackedReplacements';
const SINGLE_COMMAND_ID = 'cmd.rtk.review.applyNonOverlapTrackedReplacements';
const MARKER_PREFIX = 'MULTI01_AFTER_FIRST_SCENE ';
const RESULT_PREFIX = 'MULTI01_CHILD_RESULT ';

// ---------------------------------------------------------------------------
// Shared helpers (mirror rtk-word-safety-c2-multiscene-command-path harness)
// ---------------------------------------------------------------------------

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

function sha256File(filePath) {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

async function loadModule() {
  return import(pathToFileURL(MODULE_PATH).href);
}

async function loadCoordinator() {
  return import(pathToFileURL(COORDINATOR_PATH).href);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function tmpProject() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-multi01-'));
  const scenes = {
    alpha: {
      sceneId: 'scene-multi01-alpha',
      blockId: 'block-multi01-alpha',
      text: 'Alpha beta gamma multi.',
      replacement: 'delta',
      fileName: 'alpha.txt',
    },
    bravo: {
      sceneId: 'scene-multi01-bravo',
      blockId: 'block-multi01-bravo',
      text: 'One beta two multi.',
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
        roundId: 'round-multi01',
        exportId: 'export-multi01',
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
      projectId: 'project-multi01',
      baselineHash: 'baseline-multi01',
      scenes: [{ sceneId: scene.sceneId, text }],
    },
    revisionSession: {
      projectId: 'project-multi01',
      sessionId: `session-${scene.sceneId}`,
      baselineHash: 'baseline-multi01',
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
    roundId: overrides.roundId || 'round-multi01',
    requestId: overrides.requestId || `request-${scene.sceneId}`,
    exportIdentity: 'export-multi01',
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
    projectId: 'project-multi01',
    roundId: 'round-multi01',
    requestId: overrides.requestId || 'request-multiscene-multi01',
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

// ===========================================================================
// M1a — no crash seam exists (RED: afterSceneWrite hook absent)
// ===========================================================================

test('MULTI01-M1a-no-crash-seam-exists', async () => {
  const module = await loadModule();
  const project = tmpProject();

  const hookCalls = [];
  const afterSceneWrite = async (info) => {
    hookCalls.push(info);
  };

  // TARGET: createRtkMultiSceneNonOverlapTrackedReplacementCommandHandler accepts
  // an optional afterSceneWrite hook option invoked after each scene write with
  // { sceneIndex, sceneId, appliedSoFar } while production behavior without the
  // hook stays unchanged.
  const handler = module.createRtkMultiSceneNonOverlapTrackedReplacementCommandHandler({
    cryptoPort,
    afterSceneWrite,
  });

  const result = await handler(multiInput(project));

  // The hook must be invoked at least once (after the first scene write).
  // RED REASON: the multi-scene runtime has no afterSceneWrite seam today, so
  // the option is silently ignored and hookCalls stays empty. A real
  // per-scene crash drill (M1b) is impossible without this seam.
  assert.equal(
    hookCalls.length > 0,
    true,
    'afterSceneWrite hook must be called after each scene write; today the runtime has no such seam',
  );

  // When the seam exists, each hook call must carry scene identity and progress.
  if (hookCalls.length > 0) {
    const first = hookCalls[0];
    assert.equal(typeof first.sceneIndex, 'number', 'hook payload must carry sceneIndex');
    assert.equal(typeof first.sceneId, 'string', 'hook payload must carry sceneId');
    assert.ok(Array.isArray(first.appliedSoFar), 'hook payload must carry appliedSoFar');
  }

  // Production behavior without the hook is unchanged (staged apply still works).
  assert.equal(result.status, 'applied');
});

// ===========================================================================
// M1b — SIGKILL mixed-state drill has no convergence path (RED: seam absent)
// ===========================================================================

test('MULTI01-M1b-sigkill-mixed-state-no-convergence', async () => {
  const project = tmpProject();
  const beforeHashes = {
    alpha: sha256File(project.scenes.alpha.scenePath),
    bravo: sha256File(project.scenes.bravo.scenePath),
  };

  // Build a child script that imports the real multi-scene runtime and applies
  // two scenes with an afterSceneWrite hook that hangs after the FIRST write so
  // the parent can SIGKILL at the partial-write boundary. This mirrors the
  // Dorian killpoint child pattern (parent markers + fresh-process recovery).
  const childScript = `
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createRtkMultiSceneNonOverlapTrackedReplacementCommandHandler } from '${MODULE_PATH.replace(/\\/g, '/')}';

const MARKER_PREFIX = ${JSON.stringify(MARKER_PREFIX)};
const RESULT_PREFIX = ${JSON.stringify(RESULT_PREFIX)};
const REPO_ROOT = ${JSON.stringify(REPO_ROOT)};
const MODULE_PATH = ${JSON.stringify(MODULE_PATH)};

function stableJson(value) {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + stableJson(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

const cryptoPort = {
  sha256Text(v) { return crypto.createHash('sha256').update(Buffer.from(String(v || ''), 'utf8')).digest('hex'); },
  sha256Json(v) { return 'sha256:' + this.sha256Text(stableJson(v)); },
};

const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

const afterSceneWrite = async (info) => {
  if (info.sceneIndex !== 0) return;
  process.stdout.write(MARKER_PREFIX + JSON.stringify({ sceneIndex: info.sceneIndex, sceneId: info.sceneId, pid: process.pid }) + '\\n');
  // Hang forever so the parent can SIGKILL at the partial-write boundary.
  setInterval(() => {}, 1000);
  await new Promise(() => {});
};

const handler = createRtkMultiSceneNonOverlapTrackedReplacementCommandHandler({ cryptoPort, afterSceneWrite });
const result = await handler(input.payload);
process.stdout.write(RESULT_PREFIX + JSON.stringify({ ok: result.ok, status: result.status }) + '\\n');
process.exit(result && result.ok === true ? 0 : 1);
`;

  const childDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-multi01-child-'));
  const childScriptPath = path.join(childDir, 'multi01-killpoint-child.mjs');
  fs.writeFileSync(childScriptPath, childScript, 'utf8');

  const inputPath = path.join(childDir, 'multi01-input.json');
  fs.writeFileSync(inputPath, JSON.stringify({ payload: multiInput(project) }), 'utf8');

  const child = spawn(process.execPath, [childScriptPath, inputPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  let markerSeen = false;
  const markerPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('MULTI01_MARKER_TIMEOUT: afterSceneWrite seam absent, child never paused at partial-write boundary'));
    }, 12_000);
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
      if (stdout.includes(MARKER_PREFIX)) {
        markerSeen = true;
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code, signal) => {
      if (!markerSeen) {
        clearTimeout(timer);
        reject(new Error('MULTI01_CHILD_EXITED_BEFORE_MARKER: child completed both scene writes without pausing; afterSceneWrite seam absent'));
      }
    });
  });

  let markerError = null;
  try {
    await markerPromise;
  } catch (error) {
    markerError = error;
  }

  // If the marker was seen, the seam exists and we can proceed with the real
  // SIGKILL + fresh-process re-apply convergence drill.
  if (markerError === null && markerSeen) {
    const close = new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
    child.kill('SIGKILL');
    const killed = await close;

    // After SIGKILL between writes, scene-1 is afterText and scene-2 is beforeText.
    const partialHashes = {
      alpha: sha256File(project.scenes.alpha.scenePath),
      bravo: sha256File(project.scenes.bravo.scenePath),
    };

    // Fresh-process re-apply through the runtime must classify mixed state as
    // RTK_MULTI_SCENE_PARTIAL_REPLAY_BLOCKED with no convergence path.
    const module = await loadModule();
    const recovery = await module.applyMultiSceneNonOverlapTrackedReplacementRuntime(
      multiInput(project),
      { cryptoPort },
    );

    assert.equal(recovery.status, 'blocked');
    assert.equal(recovery.reason, 'RTK_MULTI_SCENE_PARTIAL_REPLAY_BLOCKED');

    // No atomic convergence path exists: all-old, all-new, and safe-fork are all
    // unreachable from mixed state through the runtime today.
    assert.equal(recovery.multiSceneAtomicApplyCertified, false);
    assert.ok(
      typeof recovery.multiSceneAtomicApplyBlockedReason === 'string'
      && recovery.multiSceneAtomicApplyBlockedReason.startsWith('MULTI_SCENE_SCOPE_BLOCKED'),
      'mixed-state recovery must surface a typed MULTI_SCENE_SCOPE_BLOCKED reason',
    );

    // Mixed state on disk is the proof that no durable boundary existed.
    assert.notEqual(partialHashes.alpha, beforeHashes.alpha);
    assert.equal(partialHashes.bravo, beforeHashes.bravo);
    return;
  }

  // RED: the drill cannot reproduce because the afterSceneWrite seam is absent.
  // The child either exited normally (both scenes applied) or timed out. Either
  // way, the parent could not SIGKILL at the partial-write boundary, so the
  // decisive crash proof (mixed state + PARTIAL_REPLAY_BLOCKED + no convergence)
  // is impossible to obtain today.
  child.kill('SIGKILL');
  assert.fail(
    'MULTI01 drill failed to reproduce the partial-write crash window: '
    + (markerError ? markerError.message : 'unknown marker failure')
    + '. The afterSceneWrite seam required to pause between scene writes does '
    + 'not exist in the multi-scene runtime today, so atomic convergence cannot '
    + 'be falsified by a real SIGKILL.',
  );
});

// ===========================================================================
// M2 — atomic claim must be typed BLOCKED (RED: certified true today)
// ===========================================================================

test('MULTI01-M2-atomic-claim-typed-blocked', async () => {
  const module = await loadModule();
  const project = tmpProject();
  const kernel = createKernel(module);

  const result = await kernel.dispatch(MULTI_COMMAND_ID, multiInput(project));

  // Staged sequential apply still works (this is the control portion).
  assert.equal(result.status, 'applied');
  assert.equal(result.writerCalled, true);
  assert.deepEqual(readScenes(project), {
    alpha: 'Alpha delta gamma multi.',
    bravo: 'One epsilon two multi.',
  });

  // TARGET: the result must NOT certify atomic apply. Today the runtime returns
  // multiSceneAtomicApplyCertified:true, which is a false atomic-certified claim
  // because the apply is a sequence of independent per-scene writes with no
  // durable boundary and no decisive crash proof.
  // RED REASON: result.multiSceneAtomicApplyCertified === true today.
  assert.equal(
    result.multiSceneAtomicApplyCertified,
    false,
    'multi-scene apply must not certify atomicity without a decisive crash proof',
  );

  // TARGET: a typed reason from the MULTI_SCENE_SCOPE_BLOCKED_UNTIL_DECISIVE_CRASH_PROOF
  // family must accompany the false certification. Today no such field exists.
  assert.ok(
    typeof result.multiSceneAtomicApplyBlockedReason === 'string'
    && result.multiSceneAtomicApplyBlockedReason.startsWith('MULTI_SCENE_SCOPE_BLOCKED_UNTIL_DECISIVE_CRASH_PROOF'),
    'result must carry a typed MULTI_SCENE_SCOPE_BLOCKED_UNTIL_DECISIVE_CRASH_PROOF reason',
  );

  // Staged fields (staged sequential apply applied/replay) must be preserved.
  assert.ok(Array.isArray(result.sceneResults));
  assert.equal(result.sceneResults.every((item) => item.stagedOutcomeOnly === true), true);
});

// ===========================================================================
// M3 — capability surfaces must be typed BLOCKED (RED: EXACT_SUPPORTED today)
// ===========================================================================

test('MULTI01-M3-capability-surfaces-typed-blocked', () => {
  const matrix = readJson(MATRIX_PATH);
  const profile = readJson(PROFILE_PATH);
  const contextText = fs.readFileSync(CONTEXT_PATH, 'utf8');

  const multiSceneRows = matrix.rows.filter((row) => [
    'MULTI_SCENE_COORDINATOR',
    'MULTI_SCENE_DELETE_TOMBSTONE',
    'RETURN_NON_OVERLAP_APPLY',
  ].includes(row.rowId));

  // Matrix rows that gate multi-scene atomic apply must be typed BLOCKED (or
  // TARGET_UNTIL_DECISIVE_CRASH_PROOF), not EXACT_SUPPORTED. Today they are all
  // EXACT_SUPPORTED, which overclaims atomic convergence.
  // RED REASON: every multi-scene row is EXACT_SUPPORTED today.
  for (const row of multiSceneRows) {
    assert.ok(
      row.status === 'BLOCKED' || row.status === 'TARGET_UNTIL_DECISIVE_CRASH_PROOF',
      `${row.rowId} must be typed BLOCKED/TARGET_UNTIL_DECISIVE_CRASH_PROOF, not ${row.status}; `
      + 'a kill criterion bound to the missing decisive crash proof is required',
    );
  }

  // Capability profile cell for the multi-scene atomic comment-state closure
  // must NOT certify atomic apply. Today multiSceneAtomicApplyCertified is true.
  // RED REASON: the profile cell sets multiSceneAtomicApplyCertified:true.
  const closureCell = profile.cells.find(
    (cell) => cell.capabilityId === 'rtk.word.releaseAudit.p0.multiSceneAtomicCommentStateClosure',
  );
  assert.ok(closureCell, 'multi-scene atomic comment-state closure cell must exist');
  assert.equal(
    closureCell.multiSceneAtomicApplyCertified,
    false,
    'profile cell must not certify multi-scene atomic apply without decisive crash proof',
  );

  const closureSummary = profile.latestProductMultiSceneAtomicCommentStateClosure;
  assert.ok(closureSummary, 'multi-scene atomic comment-state closure summary must exist');
  assert.equal(
    closureSummary.multiSceneAtomicApplyCertified,
    false,
    'closure summary must not certify multi-scene atomic apply without decisive crash proof',
  );

  // CONTEXT must not claim multi-scene atomic apply is EXACT_SUPPORTED. Today
  // the multi-scene clause is EXACT_SUPPORTED.
  // RED REASON: CONTEXT states multi-scene atomic apply is EXACT_SUPPORTED.
  const multiSceneClausePattern = /multi-scene[^.]*atomic apply[^.]*EXACT_SUPPORTED/iu;
  assert.equal(
    multiSceneClausePattern.test(contextText),
    false,
    'CONTEXT must not claim multi-scene atomic apply is EXACT_SUPPORTED',
  );
});

// ===========================================================================
// M4 — overclaim guard must reject atomic-certified mutations (RED: no guard)
// ===========================================================================

test('MULTI01-M4-overclaim-guard', async () => {
  const module = await loadModule();
  const project = tmpProject();
  const kernel = createKernel(module);

  const result = await kernel.dispatch(MULTI_COMMAND_ID, multiInput(project));

  // TARGET: a typed guard must reject any mutation that sets
  // multiSceneAtomicApplyCertified:true (or EXACT_SUPPORTED) without a decisive
  // crash proof. Today no such guard exists, so the runtime freely returns
  // multiSceneAtomicApplyCertified:true.
  // RED REASON: no typed guard exists; result.multiSceneAtomicApplyCertified is true.
  assert.ok(
    typeof module.assertMultiSceneAtomicApplyNotOverclaimed === 'function'
    || typeof module.guardMultiSceneAtomicApplyCertification === 'function',
    'a typed overclaim guard (assertMultiSceneAtomicApplyNotOverclaimed or '
    + 'guardMultiSceneAtomicApplyCertification) must exist and reject '
    + 'multiSceneAtomicApplyCertified:true without decisive crash proof',
  );

  // If the guard exists, it must reject the overclaimed result.
  const guard = module.assertMultiSceneAtomicApplyNotOverclaimed
    || module.guardMultiSceneAtomicApplyCertification;
  let guardRejected = false;
  try {
    guard(result);
  } catch (error) {
    guardRejected = true;
    assert.match(
      String(error.message || error),
      /MULTI_SCENE_SCOPE_BLOCKED/u,
      'guard must reject with a MULTI_SCENE_SCOPE_BLOCKED reason',
    );
  }
  assert.equal(guardRejected, true, 'overclaim guard must reject the certified-true result');
});

// ===========================================================================
// M5 — CONTROLS (these must stay GREEN today)
// ===========================================================================

test('MULTI01-M5a-staged-sequential-apply-works', async () => {
  const module = await loadModule();
  const project = tmpProject();
  const kernel = createKernel(module);

  const result = await kernel.dispatch(MULTI_COMMAND_ID, multiInput(project));

  assert.equal(result.status, 'applied');
  assert.equal(result.writerCalled, true);
  assert.equal(result.sceneResults.length, 2);
  assert.equal(result.sceneResults.every((item) => item.applied === true), true);
  assert.equal(result.sceneResults.every((item) => item.replay === false), true);
  assert.deepEqual(readScenes(project), {
    alpha: 'Alpha delta gamma multi.',
    bravo: 'One epsilon two multi.',
  });
});

test('MULTI01-M5b-simulated-failure-rollback-restores-all-scenes', async () => {
  const module = await loadModule();
  const project = tmpProject();
  const kernel = createKernel(module, { simulateMultiSceneApplyFailureAtIndex: 1 });

  const result = await kernel.dispatch(MULTI_COMMAND_ID, multiInput(project));

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'RTK_MULTI_SCENE_SIMULATED_SCENE_FAILURE_ROLLED_BACK');
  assert.equal(result.rollback.ok, true);
  assert.equal(result.rollback.results.every((item) => item.restoredBaseline === true), true);
  assert.deepEqual(readScenes(project), {
    alpha: project.scenes.alpha.text,
    bravo: project.scenes.bravo.text,
  });
});

test('MULTI01-M5c-replay-is-idempotent', async () => {
  const module = await loadModule();
  const project = tmpProject();
  const kernel = createKernel(module);
  const input = multiInput(project);

  const applied = await kernel.dispatch(MULTI_COMMAND_ID, input);
  assert.equal(applied.status, 'applied');

  const replay = await kernel.dispatch(MULTI_COMMAND_ID, input);
  assert.equal(replay.status, 'replay');
  assert.equal(replay.writerCalled, false);
  assert.equal(replay.sceneResults.every((item) => item.replay === true), true);
  assert.deepEqual(readScenes(project), {
    alpha: 'Alpha delta gamma multi.',
    bravo: 'One epsilon two multi.',
  });
});

test('MULTI01-M5d-coordinator-v4-stays-shadow-only', async () => {
  const coordinator = await loadCoordinator();

  const h = (label) => `sha256:${crypto.createHash('sha256').update(label).digest('hex')}`;
  const baseInput = {
    commitProtocol: 'single-root-pointer',
    projectId: 'project-multi01-coord',
    roundId: 'round-multi01-coord',
    baseRootPointer: h('root-before'),
    currentRootPointer: h('root-before'),
    sceneIntents: [
      {
        sceneId: 'scene-a',
        sceneRevision: 'rev-a',
        beforeSha256: h('scene-a-before'),
        afterSha256: h('scene-a-after'),
        requestKey: h('request-a'),
        effectKey: h('effect-a'),
        commandEnvelopeDigest: h('envelope-a'),
        writerPlanDigest: h('plan-a'),
      },
      {
        sceneId: 'scene-b',
        sceneRevision: 'rev-b',
        beforeSha256: h('scene-b-before'),
        afterSha256: h('scene-b-after'),
        requestKey: h('request-b'),
        effectKey: h('effect-b'),
        commandEnvelopeDigest: h('envelope-b'),
        writerPlanDigest: h('plan-b'),
      },
    ],
  };

  const prepare = coordinator.buildRtkWordV4MultiSceneAtomicPrepare(baseInput, { cryptoPort });
  assert.equal(prepare.runtimeApplyAuthorityGranted, false);
  assert.equal(prepare.canWrite, false);

  const receipts = prepare.prepareRecord.sceneIntents.map((intent) => ({
    sceneId: intent.sceneId,
    requestKey: intent.requestKey,
    effectKey: intent.effectKey,
    beforeSha256: intent.beforeSha256,
    afterSha256: intent.afterSha256,
    stagedOnly: true,
    canonicalSceneWritten: false,
  }));
  const commit = coordinator.buildRtkWordV4MultiSceneAtomicCommit({
    prepareRecord: prepare.prepareRecord,
    currentRootPointer: baseInput.baseRootPointer,
    proposedRootPointer: h('root-after'),
    sceneReceipts: receipts,
  }, { cryptoPort });
  assert.equal(commit.runtimeApplyAuthorityGranted, false);
  assert.equal(commit.canWrite, false);

  const recovery = coordinator.reconcileRtkWordV4MultiSceneAtomicRecovery({
    prepareRecord: prepare.prepareRecord,
    observedRootPointer: baseInput.baseRootPointer,
    expectedCommittedRootPointer: h('root-after'),
    sceneReceipts: [],
  }, { cryptoPort });
  assert.equal(recovery.runtimeApplyAuthorityGranted, false);
  assert.equal(recovery.canWrite, false);
});

test('MULTI01-M5e-e11-e12-shadow-pins-stay-typed-limitation', () => {
  const profile = readJson(PROFILE_PATH);

  // E11 coordinator cell stays COMPONENT_PROVEN shadow-only.
  const e11Cell = profile.cells.find(
    (cell) => cell.capabilityId === 'rtk.word.v4.multiSceneAtomicCoordinator',
  );
  assert.ok(e11Cell);
  assert.equal(e11Cell.state, 'COMPONENT_PROVEN');
  assert.equal(e11Cell.currentCapability, 'MULTI_SCENE_ATOMIC_COORDINATOR_COMPONENT_SHADOW_ONLY');
  assert.equal(e11Cell.physicalWordEvidence, false);
  assert.ok(
    e11Cell.limitations.includes('PRODUCT_MULTI_SCENE_APPLY_NOT_ENABLED_IN_E11'),
    'E11 must keep multi-scene apply as a typed shadow-only limitation',
  );

  // E12 saturation ledger keeps automatic multi-scene apply at zero.
  const saturationCell = profile.cells.find(
    (cell) => cell.capabilityId === 'rtk.word.v4.saturationLedger',
  );
  assert.ok(saturationCell);
  assert.equal(saturationCell.physicalTotals.automaticMultiSceneApplyCertified, 0);
  assert.equal(saturationCell.physicalTotals.falseMultiSceneApplyCertification, 0);
  assert.ok(
    saturationCell.supportedNow.some((line) => /multi-scene apply is explicitly kept shadow-only/u.test(line)),
    'E12 must keep multi-scene apply explicitly shadow-only',
  );
});

test('MULTI01-M5f-dorian-killpoint-pattern-uses-real-sigkill', () => {
  const parentSource = fs.readFileSync(
    path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-dorian-killpoint.mjs'),
    'utf8',
  );
  const childSource = fs.readFileSync(
    path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-dorian-killpoint-child.mjs'),
    'utf8',
  );

  // The Dorian killpoint harness (formatting return runtime) proves the real
  // SIGKILL boundary + fresh-process recovery pattern works in this repo. It
  // relies on an afterSceneWrite seam that the formatting runtime exposes but
  // the multi-scene runtime does NOT (the M1a/M1b gap).
  assert.match(parentSource, /child\.kill\('SIGKILL'\)/u);
  assert.match(parentSource, /recoveryOutcome === 'rolled-back'/u);
  assert.match(childSource, /createRtkFormattingReturnCommandHandler/u);
  assert.match(childSource, /afterSceneWrite/u);
  assert.match(childSource, /setInterval\(\(\) => \{\}, 1000\)/u);
});
