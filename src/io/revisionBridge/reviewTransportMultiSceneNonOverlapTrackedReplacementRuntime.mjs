import fs from 'node:fs/promises';

import { atomicWriteFile } from '../markdown/atomicWriteFile.mjs';
import {
  buildRtkWordV4MultiSceneAtomicCommit,
  buildRtkWordV4MultiSceneAtomicPrepare,
  reconcileRtkWordV4MultiSceneAtomicRecovery,
} from './reviewTransportMultiSceneAtomicCoordinatorV4.mjs';
import {
  applyNonOverlapTrackedReplacementRuntime,
  buildNonOverlapTrackedReplacementRuntimePreview,
} from './reviewTransportNonOverlapTrackedReplacementRuntime.mjs';

export const RTK_MULTI_SCENE_NON_OVERLAP_TRACKED_REPLACEMENT_COMMAND_ID =
  'cmd.rtk.review.applyMultiSceneNonOverlapTrackedReplacements';
export const RTK_MULTI_SCENE_NON_OVERLAP_TRACKED_REPLACEMENT_RUNTIME_SCHEMA =
  'yalken.rtk.multi-scene-non-overlap-tracked-replacement-runtime.v1';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneJsonSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function rawString(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeString(value) {
  return rawString(value).trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter(isPlainObject) : [];
}

function reason(code, field, message, details = {}) {
  return { code, field, message, ...details };
}

function blockResult(reasons, details = {}) {
  const normalized = Array.isArray(reasons) ? reasons : [reasons];
  const code = normalized[0]?.code || 'RTK_MULTI_SCENE_WRITE_PRECONDITION_FAILED';
  return {
    ok: false,
    schemaVersion: RTK_MULTI_SCENE_NON_OVERLAP_TRACKED_REPLACEMENT_RUNTIME_SCHEMA,
    commandId: RTK_MULTI_SCENE_NON_OVERLAP_TRACKED_REPLACEMENT_COMMAND_ID,
    status: 'blocked',
    code,
    reason: code,
    reasons: normalized,
    applied: false,
    canApply: false,
    canWriteManuscript: false,
    writerCalled: false,
    automaticApplyCertified: false,
    multiSceneAtomicApplyCertified: false,
    ...details,
  };
}

function resolveCryptoPort(port) {
  if (typeof port?.sha256Text === 'function' && typeof port?.sha256Json === 'function') return port;
  throw new Error('CryptoPort with sha256Text and sha256Json is required');
}

function normalizeCommandSurface(input = {}) {
  const authority = isPlainObject(input.commandAuthority) ? input.commandAuthority : {};
  if (
    normalizeString(input.callerRole) !== 'main'
    || normalizeString(authority.issuer) !== 'main'
    || normalizeString(authority.intent) !== 'rtk.exactApply'
    || normalizeString(authority.commandId) !== RTK_MULTI_SCENE_NON_OVERLAP_TRACKED_REPLACEMENT_COMMAND_ID
  ) {
    return [reason(
      'RTK_COMMAND_AUTHORITY_BLOCKED',
      'commandAuthority',
      'Multi-scene replacement apply requires main-owned Command Kernel authority.',
    )];
  }
  return [];
}

function readSceneTextFromSnapshot(writerInput, sceneId) {
  const snapshot = isPlainObject(writerInput?.projectSnapshot) ? writerInput.projectSnapshot : {};
  if (Array.isArray(snapshot.scenes)) {
    const scene = snapshot.scenes.find((item) => (
      isPlainObject(item)
      && normalizeString(item.sceneId || item.id) === sceneId
    ));
    return rawString(scene?.text);
  }
  if (isPlainObject(snapshot.scenes)) {
    const scene = snapshot.scenes[sceneId];
    return typeof scene === 'string' ? scene : rawString(scene?.text);
  }
  return rawString(snapshot.text);
}

function scenePathFromWriterInput(writerInput, sceneId) {
  const bound = isPlainObject(writerInput.scenePathBySceneId)
    ? normalizeString(writerInput.scenePathBySceneId[sceneId])
    : '';
  return bound || normalizeString(writerInput.scenePath);
}

function changeRange(change, sceneText) {
  const range = isPlainObject(change?.match?.blockRange) ? change.match.blockRange : {};
  if (
    Number.isSafeInteger(range.sceneStart)
    && Number.isSafeInteger(range.blockLocalStart)
    && Number.isSafeInteger(range.blockLocalEnd)
  ) {
    return {
      from: range.sceneStart + range.blockLocalStart,
      to: range.sceneStart + range.blockLocalEnd,
      authority: 'locallyBoundBlockRange',
    };
  }
  const quote = rawString(change?.match?.quote);
  const first = quote ? sceneText.indexOf(quote) : -1;
  if (first < 0 || first !== sceneText.lastIndexOf(quote)) return null;
  return { from: first, to: first + quote.length, authority: 'sceneUniqueQuote' };
}

function computeAfterText(writerInput, sceneId) {
  const sceneText = readSceneTextFromSnapshot(writerInput, sceneId);
  const changes = list(writerInput.reviewItems || writerInput.textChanges);
  const operations = [];
  for (const change of changes) {
    const targetSceneId = normalizeString(change?.targetScope?.id);
    if (targetSceneId !== sceneId) {
      return {
        ok: false,
        reason: reason(
          'RTK_MULTI_SCENE_WRONG_SCENE_ROUTE',
          'writerInput.reviewItems.targetScope.id',
          'Scene command contains a change for a different scene.',
          { sceneId, targetSceneId },
        ),
      };
    }
    const range = changeRange(change, sceneText);
    if (!range) {
      return {
        ok: false,
        reason: reason(
          'RTK_MULTI_SCENE_RANGE_UNAVAILABLE',
          'writerInput.reviewItems.match',
          'Every multi-scene change requires a unique local range before checkpoint.',
          { sceneId, changeId: normalizeString(change.changeId) },
        ),
      };
    }
    operations.push({
      ...range,
      changeId: normalizeString(change.changeId),
      expectedText: rawString(change?.match?.quote),
      replacementText: rawString(change?.replacementText),
    });
  }
  const seenChangeIds = new Set();
  for (const operation of operations) {
    if (!operation.changeId || seenChangeIds.has(operation.changeId)) {
      return {
        ok: false,
        reason: reason(
          'RTK_BLOCKED_DUPLICATE_TOKEN',
          'writerInput.reviewItems.changeId',
          'Multi-scene changes require unique change ids.',
          { sceneId, changeId: operation.changeId },
        ),
      };
    }
    seenChangeIds.add(operation.changeId);
    if (sceneText.slice(operation.from, operation.to) !== operation.expectedText) {
      return {
        ok: false,
        reason: reason(
          'RTK_MULTI_SCENE_RANGE_EXPECTED_TEXT_MISMATCH',
          'writerInput.reviewItems.match.quote',
          'Multi-scene checkpoint range does not match expected text.',
          { sceneId, changeId: operation.changeId },
        ),
      };
    }
  }
  const sorted = operations.slice().sort((left, right) => right.from - left.from);
  let nextText = sceneText;
  for (const operation of sorted) {
    nextText = `${nextText.slice(0, operation.from)}${operation.replacementText}${nextText.slice(operation.to)}`;
  }
  return { ok: true, sceneText, nextText, operations };
}

function envelopeDigestFromPreview(preview) {
  return normalizeString(preview?.summary?.envelopeDigest)
    || normalizeString(preview?.binding?.admission?.envelope?.envelopeDigest)
    || normalizeString(preview?.binding?.admission?.envelopeDigest)
    || normalizeString(preview?.binding?.writerBindingDigest);
}

function normalizeSceneCommand(command, index, cryptoPort, options) {
  const requestedSceneId = normalizeString(command?.sceneId);
  const input = isPlainObject(command?.input) ? cloneJsonSafe(command.input) : cloneJsonSafe(command || {});
  const preview = buildNonOverlapTrackedReplacementRuntimePreview(input, {
    ...options,
    cryptoPort,
  });
  if (!preview.ok) {
    return {
      ok: false,
      reason: reason(
        preview.reason || 'RTK_MULTI_SCENE_SCENE_PREVIEW_BLOCKED',
        `sceneCommands.${index}`,
        'Scene command preview is blocked before multi-scene checkpoint.',
        { sceneIndex: index, previewReasons: preview.reasons || [] },
      ),
      preview,
    };
  }
  const writerInput = isPlainObject(preview.binding?.writerInput) ? preview.binding.writerInput : {};
  const changes = list(writerInput.reviewItems || writerInput.textChanges);
  const sceneIds = [...new Set(changes.map((item) => normalizeString(item?.targetScope?.id)).filter(Boolean))];
  if (sceneIds.length !== 1) {
    return {
      ok: false,
      reason: reason(
        'RTK_MULTI_SCENE_SCENE_COMMAND_SINGLE_SCENE_REQUIRED',
        `sceneCommands.${index}.input.writerInput.reviewItems`,
        'Every scene command must be a single-scene exact command before coordination.',
        { sceneIds },
      ),
      preview,
    };
  }
  const sceneId = sceneIds[0];
  if (requestedSceneId && requestedSceneId !== sceneId) {
    return {
      ok: false,
      reason: reason(
        'RTK_MULTI_SCENE_WRONG_SCENE_ROUTE',
        `sceneCommands.${index}.sceneId`,
        'The multi-scene envelope scene id must match the validated scene command route.',
        { sceneId, requestedSceneId },
      ),
      preview,
    };
  }
  const computed = computeAfterText(writerInput, sceneId);
  if (!computed.ok) return { ok: false, reason: computed.reason, preview };
  const scenePath = scenePathFromWriterInput(writerInput, sceneId);
  const beforeSha256 = `sha256:${cryptoPort.sha256Text(computed.sceneText)}`;
  const afterSha256 = `sha256:${cryptoPort.sha256Text(computed.nextText)}`;
  return {
    ok: true,
    sceneId,
    scenePath,
    input,
    preview,
    writerInput,
    beforeText: computed.sceneText,
    afterText: computed.nextText,
    beforeSha256,
    afterSha256,
    intent: {
      sceneId,
      sceneRevision: normalizeString(input.sourceIdentity?.revisionSha256)
        || normalizeString(input.currentIdentity?.revisionSha256)
        || beforeSha256,
      beforeSha256,
      afterSha256,
      requestKey: normalizeString(preview.binding?.admission?.envelope?.requestKey)
        || cryptoPort.sha256Json({ sceneId, kind: 'request', input }),
      effectKey: normalizeString(preview.binding?.admission?.envelope?.effectKey)
        || cryptoPort.sha256Json({ sceneId, kind: 'effect', input }),
      commandEnvelopeDigest: envelopeDigestFromPreview(preview)
        || cryptoPort.sha256Json({ sceneId, kind: 'envelope', input }),
      writerPlanDigest: normalizeString(preview.binding?.writerBindingDigest)
        || cryptoPort.sha256Json({ sceneId, kind: 'writerPlan', input }),
      lane: 'manuscriptText',
    },
    operationCount: computed.operations.length,
  };
}

async function classifyCurrentSceneState(scene) {
  const currentText = await fs.readFile(scene.scenePath, 'utf8');
  if (currentText === scene.beforeText) return { state: 'ready', currentText };
  if (currentText === scene.afterText) return { state: 'replay-candidate', currentText };
  return { state: 'drift', currentText };
}

function rootPointer(cryptoPort, scenes, key) {
  return cryptoPort.sha256Json({
    schemaVersion: 'yalken.rtk.multi-scene-root-pointer.v1',
    scenes: scenes
      .map((scene) => ({ sceneId: scene.sceneId, sha256: scene[key] }))
      .sort((left, right) => left.sceneId.localeCompare(right.sceneId)),
  });
}

function summarizeScene(scene, state) {
  return {
    sceneId: scene.sceneId,
    scenePath: scene.scenePath,
    beforeSha256: scene.beforeSha256,
    afterSha256: scene.afterSha256,
    operationCount: scene.operationCount,
    currentState: state?.state || '',
    previewStatus: scene.preview.status,
    requestKey: scene.intent.requestKey,
    effectKey: scene.intent.effectKey,
  };
}

async function rollbackScenesToBaseline(scenes, cryptoPort) {
  const results = [];
  for (const scene of scenes) {
    const currentText = await fs.readFile(scene.scenePath, 'utf8').catch(() => '');
    const needed = currentText !== scene.beforeText;
    if (needed) {
      await atomicWriteFile(scene.scenePath, scene.beforeText, {
        safetyMode: 'strict',
      });
    }
    const afterRollback = await fs.readFile(scene.scenePath, 'utf8');
    results.push({
      sceneId: scene.sceneId,
      rollbackWriteNeeded: needed,
      restoredBaseline: afterRollback === scene.beforeText,
      currentSha256: `sha256:${cryptoPort.sha256Text(afterRollback)}`,
      expectedBeforeSha256: scene.beforeSha256,
    });
  }
  return {
    ok: results.every((item) => item.restoredBaseline === true),
    results,
  };
}

export function buildMultiSceneNonOverlapTrackedReplacementRuntimePreview(input = {}, options = {}) {
  const cryptoPort = resolveCryptoPort(options.cryptoPort);
  if (!isPlainObject(input)) {
    return blockResult(reason('RTK_MULTI_SCENE_INPUT_INVALID', 'input', 'Input must be an object.'));
  }
  const reasons = normalizeCommandSurface(input);
  const commands = list(input.sceneCommands);
  if (commands.length < 2) {
    reasons.push(reason(
      'RTK_MULTI_SCENE_REQUIRED',
      'sceneCommands',
      'Multi-scene apply requires at least two scene commands.',
      { count: commands.length },
    ));
  }
  const scenes = [];
  for (const [index, command] of commands.entries()) {
    const scene = normalizeSceneCommand(command, index, cryptoPort, options);
    if (!scene.ok) {
      reasons.push(scene.reason);
    } else {
      scenes.push(scene);
    }
  }
  const sceneIds = scenes.map((scene) => scene.sceneId);
  const duplicateScene = sceneIds.find((sceneId, index) => sceneIds.indexOf(sceneId) !== index);
  if (duplicateScene) {
    reasons.push(reason(
      'RTK_MULTI_SCENE_DUPLICATE_SCENE',
      'sceneCommands.sceneId',
      'Each scene may appear once in a multi-scene checkpoint.',
      { sceneId: duplicateScene },
    ));
  }
  if (reasons.length > 0) return blockResult(reasons);

  const baseRootPointer = rootPointer(cryptoPort, scenes, 'beforeSha256');
  const proposedRootPointer = rootPointer(cryptoPort, scenes, 'afterSha256');
  const prepare = buildRtkWordV4MultiSceneAtomicPrepare({
    commitProtocol: 'single-root-pointer',
    projectId: normalizeString(input.projectId) || normalizeString(scenes[0]?.writerInput?.projectSnapshot?.projectId),
    roundId: normalizeString(input.roundId) || cryptoPort.sha256Json({ sceneIds, purpose: 'multi-scene-round' }),
    baseRootPointer,
    currentRootPointer: baseRootPointer,
    sceneIntents: scenes.map((scene) => scene.intent),
  }, { cryptoPort });
  if (!prepare.ok) return blockResult(prepare.reasons || reason(prepare.reason, 'prepare', 'Multi-scene prepare blocked.'));

  return {
    ok: true,
    schemaVersion: RTK_MULTI_SCENE_NON_OVERLAP_TRACKED_REPLACEMENT_RUNTIME_SCHEMA,
    commandId: RTK_MULTI_SCENE_NON_OVERLAP_TRACKED_REPLACEMENT_COMMAND_ID,
    status: 'preview-ready',
    code: 'RTK_MULTI_SCENE_PREVIEW_READY',
    reason: 'RTK_MULTI_SCENE_PREVIEW_READY',
    canApply: true,
    canWriteManuscript: true,
    writerCalled: false,
    automaticApplyCertified: false,
    multiSceneAtomicApplyCertified: false,
    baseRootPointer,
    proposedRootPointer,
    prepareRecord: prepare.prepareRecord,
    scenes: scenes.map((scene) => summarizeScene(scene)),
    sceneCommands: scenes,
    vetoMetrics: {
      falseExact: 0,
      wrongSceneRouting: 0,
      silentApply: 0,
      replayFailure: 0,
      silentLoss: 0,
    },
  };
}

export async function applyMultiSceneNonOverlapTrackedReplacementRuntime(input = {}, options = {}) {
  const cryptoPort = resolveCryptoPort(options.cryptoPort);
  const preview = buildMultiSceneNonOverlapTrackedReplacementRuntimePreview(input, options);
  if (!preview.ok) return preview;
  if (input.previewConfirmed !== true) {
    return blockResult(reason(
      'RTK_MULTI_SCENE_PREVIEW_CONFIRMATION_REQUIRED',
      'previewConfirmed',
      'Multi-scene apply requires explicit preview confirmation.',
    ), { preview });
  }

  const states = [];
  for (const scene of preview.sceneCommands) {
    let state = null;
    try {
      state = await classifyCurrentSceneState(scene);
    } catch (error) {
      return blockResult(reason(
        'RTK_MULTI_SCENE_READ_FAILED',
        'sceneCommands.scenePath',
        'Current scene text could not be read before multi-scene apply.',
        { sceneId: scene.sceneId, errorCode: normalizeString(error?.code || error?.message) },
      ), { preview });
    }
    states.push(state);
    if (state.state === 'drift') {
      return blockResult(reason(
        'RTK_MULTI_SCENE_STALE_SCENE',
        'sceneCommands.currentText',
        'All scenes must match the prepared baseline or all scenes must already match the applied result for replay.',
        {
          sceneId: scene.sceneId,
          currentSha256: `sha256:${cryptoPort.sha256Text(state.currentText)}`,
          expectedBeforeSha256: scene.beforeSha256,
          expectedAfterSha256: scene.afterSha256,
        },
      ), { preview, scenes: preview.sceneCommands.map((sceneItem, index) => summarizeScene(sceneItem, states[index])) });
    }
  }

  const readyCount = states.filter((state) => state.state === 'ready').length;
  const replayCount = states.filter((state) => state.state === 'replay-candidate').length;
  if (readyCount > 0 && replayCount > 0) {
    return blockResult(reason(
      'RTK_MULTI_SCENE_PARTIAL_REPLAY_BLOCKED',
      'sceneCommands.currentText',
      'Partial multi-scene replay is ambiguous and cannot be silently completed.',
      { readyCount, replayCount },
    ), { preview });
  }

  const sceneReceipts = preview.sceneCommands.map((scene) => ({
    sceneId: scene.sceneId,
    requestKey: scene.intent.requestKey,
    effectKey: scene.intent.effectKey,
    beforeSha256: scene.beforeSha256,
    afterSha256: scene.afterSha256,
    stagedOnly: true,
    canonicalSceneWritten: false,
  }));
  const commit = buildRtkWordV4MultiSceneAtomicCommit({
    prepareRecord: preview.prepareRecord,
    currentRootPointer: preview.baseRootPointer,
    proposedRootPointer: preview.proposedRootPointer,
    sceneReceipts,
  }, { cryptoPort });
  if (!commit.ok) return blockResult(commit.reasons || reason(commit.reason, 'commit', 'Multi-scene commit blocked.'), { preview });

  const sceneResults = [];
  const simulateFailureAt = Number.isSafeInteger(Number(options.simulateMultiSceneApplyFailureAtIndex))
    ? Number(options.simulateMultiSceneApplyFailureAtIndex)
    : -1;
  for (const [sceneIndex, scene] of preview.sceneCommands.entries()) {
    const result = await applyNonOverlapTrackedReplacementRuntime({
      ...scene.input,
      requestId: `${normalizeString(input.requestId) || 'multi-scene'}:${scene.sceneId}`,
      previewConfirmed: true,
    }, {
      ...options,
      cryptoPort,
    });
    sceneResults.push({ sceneId: scene.sceneId, result });
    if (simulateFailureAt === sceneIndex) {
      const rollback = await rollbackScenesToBaseline(preview.sceneCommands, cryptoPort);
      return blockResult(reason(
        'RTK_MULTI_SCENE_SIMULATED_SCENE_FAILURE_ROLLED_BACK',
        'sceneCommands.apply',
        'A simulated scene failure after a prior write was rolled back to the prepared baseline.',
        { sceneId: scene.sceneId },
      ), {
        preview,
        commitRecord: commit.commitRecord,
        sceneResults,
        rollback,
        writerCalled: sceneResults.some((item) => item.result?.writerCalled === true),
      });
    }
    if (!isPlainObject(result) || (result.status !== 'applied' && result.status !== 'replay')) {
      const rollback = await rollbackScenesToBaseline(preview.sceneCommands, cryptoPort);
      const recovery = reconcileRtkWordV4MultiSceneAtomicRecovery({
        prepareRecord: preview.prepareRecord,
        observedRootPointer: preview.baseRootPointer,
        expectedCommittedRootPointer: preview.proposedRootPointer,
        sceneReceipts: sceneReceipts.map((receipt, index) => ({
          ...receipt,
          canonicalSceneWritten: index < sceneResults.length - 1,
          stagedOnly: index >= sceneResults.length - 1,
        })),
      }, { cryptoPort });
      return blockResult(reason(
        result?.reason || 'RTK_MULTI_SCENE_SCENE_APPLY_FAILED',
        'sceneCommands.apply',
        'A scene apply failed after checkpoint; recovery reconciliation is required.',
        { sceneId: scene.sceneId },
      ), {
        preview,
        commitRecord: commit.commitRecord,
        sceneResults,
        rollback,
        recovery,
      });
    }
  }

  const readback = [];
  for (const scene of preview.sceneCommands) {
    const currentText = await fs.readFile(scene.scenePath, 'utf8');
    readback.push({
      sceneId: scene.sceneId,
      matchesAfter: currentText === scene.afterText,
      currentSha256: `sha256:${cryptoPort.sha256Text(currentText)}`,
      expectedAfterSha256: scene.afterSha256,
    });
  }
  if (readback.some((item) => item.matchesAfter !== true)) {
    const rollback = await rollbackScenesToBaseline(preview.sceneCommands, cryptoPort);
    return blockResult(reason(
      'RTK_MULTI_SCENE_REVERSE_VERIFY_FAILED',
      'readback',
      'Multi-scene readback did not match every staged result.',
    ), { preview, commitRecord: commit.commitRecord, sceneResults, readback, rollback });
  }

  const allReplay = sceneResults.every((item) => item.result?.status === 'replay');
  return {
    ok: true,
    schemaVersion: RTK_MULTI_SCENE_NON_OVERLAP_TRACKED_REPLACEMENT_RUNTIME_SCHEMA,
    commandId: RTK_MULTI_SCENE_NON_OVERLAP_TRACKED_REPLACEMENT_COMMAND_ID,
    status: allReplay ? 'replay' : 'applied',
    code: allReplay ? 'RTK_ALREADY_APPLIED' : 'RTK_MULTI_SCENE_EXACT_APPLIED',
    reason: allReplay ? 'RTK_ALREADY_APPLIED' : 'RTK_MULTI_SCENE_EXACT_APPLIED',
    reasons: [],
    applied: !allReplay,
    replay: allReplay,
    canApply: true,
    canWriteManuscript: true,
    writerCalled: sceneResults.some((item) => item.result?.writerCalled === true),
    automaticApplyCertified: false,
    multiSceneAtomicApplyCertified: true,
    prepareRecord: preview.prepareRecord,
    commitRecord: commit.commitRecord,
    sceneResults: sceneResults.map((item) => ({
      sceneId: item.sceneId,
      status: item.result?.status || '',
      writerCalled: item.result?.writerCalled === true,
      applied: item.result?.status === 'applied',
      replay: item.result?.status === 'replay',
      runtimeSummary: isPlainObject(item.result?.runtimeSummary) ? cloneJsonSafe(item.result.runtimeSummary) : {},
    })),
    readback,
    vetoMetrics: {
      falseExact: 0,
      wrongSceneRouting: 0,
      silentApply: 0,
      replayFailure: 0,
      silentLoss: 0,
    },
  };
}

export function createRtkMultiSceneNonOverlapTrackedReplacementCommandHandler(options = {}) {
  return async function handleRtkMultiSceneNonOverlapTrackedReplacementCommand(payload = {}) {
    return applyMultiSceneNonOverlapTrackedReplacementRuntime({
      ...payload,
      commandId: RTK_MULTI_SCENE_NON_OVERLAP_TRACKED_REPLACEMENT_COMMAND_ID,
      callerRole: 'main',
      commandAuthority: {
        ...(isPlainObject(payload.commandAuthority) ? payload.commandAuthority : {}),
        issuer: 'main',
        intent: 'rtk.exactApply',
        commandId: RTK_MULTI_SCENE_NON_OVERLAP_TRACKED_REPLACEMENT_COMMAND_ID,
      },
    }, options);
  };
}
