import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { applyReviewTransportExactApply } from '../io/revisionBridge/reviewTransportExactApply.mjs';

export const WP707_MISSION_DIGEST =
  '2d188140211c4e2a65f0f1bf1bef5bac53e396e3c3887cb3563fa253a10b0c80';
export const WP707_STAGE_ID = 'WP-707_WORD_APPLY';
export const WP707_GATE_ID = 'WORD_MULTI_SCENE_SEPARATE_ADR';
export const WP707_DECISION_ID = 'WORD_MULTI_SCENE_SEPARATE_ADR_WP707_SINGLE_SCENE_ONLY_V1';
export const WP707_DISPOSABLE_MARKER_SCHEMA = 'YALKEN_WP707_DISPOSABLE_PROJECT_V1';
export const WP707_WORD_APPLY_SCHEMA = 'YALKEN_WORD_SINGLE_SCENE_APPLY_V1';

const APPLY_CAPABILITY = 'WORD_SINGLE_SCENE_EXACT_APPLY';
const WORD_PROFILE = 'WORD_LOCAL_PHYSICAL';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function rawString(value) {
  return typeof value === 'string' ? value : '';
}

function normalized(value) {
  return rawString(value).trim();
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(Buffer.from(rawString(value), 'utf8')).digest('hex');
}

function block(code, field, message, details = {}) {
  return {
    ok: false,
    schemaVersion: WP707_WORD_APPLY_SCHEMA,
    status: 'blocked',
    code,
    reason: code,
    reasons: [{ code, field, message }],
    applied: false,
    writerCalled: false,
    ...details,
  };
}

function failed(code, field, message, details = {}) {
  return {
    ...block(code, field, message, details),
    status: 'failed',
  };
}

function isPathInside(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function semanticChanges(writerInput) {
  const items = Array.isArray(writerInput?.reviewItems)
    ? writerInput.reviewItems
    : Array.isArray(writerInput?.textChanges)
      ? writerInput.textChanges
      : [];
  return items.map((item) => (isPlainObject(item?.textChange) ? item.textChange : item));
}

function expectedAfterText(beforeText, changes) {
  const ranges = [];
  for (const item of changes) {
    const quote = rawString(item?.match?.quote);
    const replacementText = rawString(item?.replacementText);
    if (normalized(item?.match?.kind) !== 'exact' || !quote) return null;
    const first = beforeText.indexOf(quote);
    if (first < 0 || beforeText.indexOf(quote, first + 1) >= 0) return null;
    ranges.push({ from: first, to: first + quote.length, replacementText });
  }
  ranges.sort((left, right) => right.from - left.from);
  for (let index = 1; index < ranges.length; index += 1) {
    if (ranges[index - 1].from < ranges[index].to) return null;
  }
  return ranges.reduce(
    (text, range) => `${text.slice(0, range.from)}${range.replacementText}${text.slice(range.to)}`,
    beforeText,
  );
}

async function validateNoSymlinkChain(fsPort, rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  const parts = relative.split(path.sep).filter(Boolean);
  let cursor = rootPath;
  const rootStat = await fsPort.lstat(rootPath);
  if (rootStat.isSymbolicLink()) return false;
  for (const part of parts) {
    cursor = path.join(cursor, part);
    const stat = await fsPort.lstat(cursor);
    if (stat.isSymbolicLink()) return false;
  }
  return true;
}

async function validateDisposableBoundary(input, target, ports) {
  const writerInput = input.envelopeInput.writerInput;
  const projectRoot = path.resolve(normalized(writerInput.projectRoot));
  const scenePath = path.resolve(normalized(writerInput.scenePath));
  const allowedRoot = path.resolve(normalized(input.disposable?.allowedRoot));
  if (!path.isAbsolute(normalized(writerInput.projectRoot)) || !path.isAbsolute(normalized(input.disposable?.allowedRoot))) {
    return block('WP707_DISPOSABLE_PATH_ABSOLUTE_REQUIRED', 'disposable.allowedRoot', 'Disposable roots and project roots must be absolute.');
  }
  if (!isPathInside(allowedRoot, projectRoot) || !isPathInside(projectRoot, scenePath)) {
    return block('WP707_DISPOSABLE_PATH_ESCAPE', 'writerInput.projectRoot', 'Project and scene must stay inside the admitted disposable root.');
  }

  let allowedReal;
  let projectReal;
  let sceneReal;
  try {
    if (
      !(await validateNoSymlinkChain(ports.fsPort, allowedRoot, projectRoot))
      || !(await validateNoSymlinkChain(ports.fsPort, projectRoot, scenePath))
    ) {
      return block('WP707_DISPOSABLE_SYMLINK_DENIED', 'writerInput.scenePath', 'Symlinks are denied in the disposable write path.');
    }
    [allowedReal, projectReal, sceneReal] = await Promise.all([
      ports.fsPort.realpath(allowedRoot),
      ports.fsPort.realpath(projectRoot),
      ports.fsPort.realpath(scenePath),
    ]);
    if (!isPathInside(allowedReal, projectReal) || !isPathInside(projectReal, sceneReal)) {
      return block('WP707_DISPOSABLE_REALPATH_ESCAPE', 'writerInput.scenePath', 'Resolved project or scene escaped the disposable root.');
    }
    if (
      !(await validateNoSymlinkChain(ports.fsPort, allowedReal, sceneReal))
      || !(await validateNoSymlinkChain(ports.fsPort, projectReal, sceneReal))
    ) {
      return block('WP707_DISPOSABLE_SYMLINK_DENIED', 'writerInput.scenePath', 'Symlinks are denied in the disposable write path.');
    }
  } catch (error) {
    return block('WP707_DISPOSABLE_PATH_UNREADABLE', 'writerInput.projectRoot', 'Disposable path identity could not be verified.', {
      errorCode: normalized(error?.code),
    });
  }

  const markerPath = path.join(projectReal, '.yalken-wp707-disposable.json');
  let marker;
  try {
    const markerStat = await ports.fsPort.lstat(markerPath);
    if (markerStat.isSymbolicLink() || !markerStat.isFile()) throw Object.assign(new Error('marker type'), { code: 'E_MARKER_TYPE' });
    marker = JSON.parse(await ports.fsPort.readFile(markerPath, 'utf8'));
  } catch (error) {
    return block('WP707_DISPOSABLE_MARKER_INVALID', 'disposable.marker', 'Task-created disposable marker is missing or invalid.', {
      errorCode: normalized(error?.code),
    });
  }
  const expectedMarker = {
    schemaVersion: WP707_DISPOSABLE_MARKER_SCHEMA,
    taskId: WP707_STAGE_ID,
    missionDigest: WP707_MISSION_DIGEST,
    projectId: target.projectId,
    sceneId: target.sceneId,
    ownership: 'TASK_CREATED_DISPOSABLE',
    preexisting: false,
    userData: false,
  };
  for (const [key, value] of Object.entries(expectedMarker)) {
    if (marker?.[key] !== value) {
      return block('WP707_DISPOSABLE_MARKER_MISMATCH', `disposable.marker.${key}`, 'Disposable marker does not match the admitted project identity.');
    }
  }
  if (!normalized(marker?.creationNonce) || normalized(marker?.creationNonce) !== normalized(input.disposable?.creationNonce)) {
    return block('WP707_DISPOSABLE_NONCE_MISMATCH', 'disposable.creationNonce', 'Disposable creation nonce is missing or stale.');
  }
  return { ok: true, projectRoot: projectReal, scenePath: sceneReal };
}

function validateStaticAuthority(input) {
  if (!isPlainObject(input) || !isPlainObject(input.envelopeInput)) {
    return block('WP707_INPUT_INVALID', 'input', 'A plain-object request and exact-apply envelope input are required.');
  }
  if (normalized(input.missionDigest) !== WP707_MISSION_DIGEST) {
    return block('WP707_MISSION_DIGEST_MISMATCH', 'missionDigest', 'Mission digest is not authorized for WP-707.');
  }
  const decision = input.decision;
  if (
    !isPlainObject(decision)
    || decision.schemaVersion !== 'YALKEN_R24_WP707_EXACT_BOUND_OWNER_DECISION_V1'
    || decision.decisionId !== WP707_DECISION_ID
    || decision.missionDigest !== WP707_MISSION_DIGEST
    || decision.stageId !== WP707_STAGE_ID
    || decision.gateId !== WP707_GATE_ID
    || decision.status !== 'APPROVED'
    || decision.noSelfApproval !== true
  ) {
    return block('WP707_DECISION_NOT_EXACT_BOUND', 'decision', 'Exact digest-bound delegate approval is required.');
  }
  if (
    input.explicitUserConfirmation !== true
    || input.automaticApply !== false
    || input.multiSceneApply !== false
    || input.atomicMultiSceneSemantics !== false
  ) {
    return block('WP707_EXPLICIT_SINGLE_SCENE_REQUIRED', 'explicitUserConfirmation', 'Apply requires explicit confirmation and must keep all automatic or multi-scene modes false.');
  }
  if (
    input.wordProfile?.profileId !== WORD_PROFILE
    || input.wordProfile?.freshAtAdmission !== true
    || !normalized(input.wordProfile?.buildId)
    || normalized(input.wordProfile?.buildId) !== normalized(input.wordProfile?.admissionBuildId)
  ) {
    return block('WP707_WORD_PROFILE_STALE', 'wordProfile', 'A fresh exact Word build profile bound at admission is required.');
  }
  if (
    input.lifecycle?.returnState !== 'RETURN_ANALYZED'
    || input.lifecycle?.previewState !== 'VISIBLE_EXPLICIT'
    || input.lifecycle?.closeReopenReadbackRequired !== true
    || input.lifecycle?.completedRoundReuseRequired !== true
  ) {
    return block('WP707_LIFECYCLE_NOT_ADMITTED', 'lifecycle', 'Analyzed return, explicit preview, reopen readback, and completed-round reuse are required.');
  }
  return { ok: true };
}

function validateTarget(input) {
  const writerInput = input.envelopeInput.writerInput;
  const changes = semanticChanges(writerInput);
  if (changes.length < 1 || changes.length > 64 || changes.some((item) => !isPlainObject(item))) {
    return block('WP707_CHANGE_DENOMINATOR_INVALID', 'writerInput.reviewItems', 'Between one and 64 exact text changes are required.');
  }
  const sceneIds = new Set(changes.map((item) => normalized(item?.targetScope?.id)).filter(Boolean));
  if (
    sceneIds.size !== 1
    || changes.some((item) => normalized(item?.targetScope?.type) !== 'scene')
  ) {
    return block('WP707_CROSS_SCENE_WRITE_DENIED', 'writerInput.reviewItems.targetScope', 'Every change must target exactly one identical scene.');
  }
  const sceneId = [...sceneIds][0];
  const projectId = normalized(writerInput?.projectSnapshot?.projectId);
  const snapshotScenes = Array.isArray(writerInput?.projectSnapshot?.scenes)
    ? writerInput.projectSnapshot.scenes
    : [];
  const selectedScene = snapshotScenes.find((scene) => normalized(scene?.sceneId || scene?.id) === sceneId);
  if (!projectId || !selectedScene || typeof selectedScene.text !== 'string') {
    return block('WP707_SCENE_IDENTITY_INVALID', 'writerInput.projectSnapshot', 'Canonical project and scene identity are required.');
  }
  const mappedPaths = isPlainObject(writerInput.scenePathBySceneId)
    ? Object.keys(writerInput.scenePathBySceneId)
    : [];
  if (mappedPaths.length !== 1 || mappedPaths[0] !== sceneId || writerInput.scenePathBySceneId[sceneId] !== writerInput.scenePath) {
    return block('WP707_CROSS_SCENE_PATH_DENIED', 'writerInput.scenePathBySceneId', 'Only the selected scene path may enter the writer.');
  }
  const afterText = expectedAfterText(selectedScene.text, changes);
  if (afterText === null) {
    return block('WP707_EXACT_OPERATION_UNSUPPORTED', 'writerInput.reviewItems', 'Only unique, non-overlapping exact replacements are supported.');
  }
  return { ok: true, projectId, sceneId, beforeText: selectedScene.text, afterText, changes };
}

async function revalidateCommand(input, target, ports, phase) {
  if (typeof ports.commandKernelPort?.revalidateWordSingleSceneApply !== 'function') {
    return block('WP707_COMMAND_KERNEL_REVALIDATION_REQUIRED', 'commandKernelPort', 'Command Kernel revalidation port is required.');
  }
  let result;
  try {
    result = await ports.commandKernelPort.revalidateWordSingleSceneApply({
      phase,
      commandId: normalized(input.envelopeInput?.commandAuthority?.commandId),
      projectId: target.projectId,
      sceneId: target.sceneId,
      capability: APPLY_CAPABILITY,
      wordBuildId: normalized(input.wordProfile?.buildId),
      missionDigest: WP707_MISSION_DIGEST,
      decisionId: WP707_DECISION_ID,
      automaticApply: false,
    });
  } catch (error) {
    return block('WP707_COMMAND_KERNEL_REVALIDATION_FAILED', 'commandKernelPort', 'Command Kernel revalidation failed closed.', {
      errorCode: normalized(error?.code),
    });
  }
  if (
    result?.decision !== 'ALLOW'
    || result?.revalidatedBy !== 'COMMAND_KERNEL'
    || result?.phase !== phase
    || result?.commandId !== normalized(input.envelopeInput?.commandAuthority?.commandId)
    || result?.projectId !== target.projectId
    || result?.sceneId !== target.sceneId
    || result?.capability !== APPLY_CAPABILITY
    || result?.wordBuildId !== normalized(input.wordProfile?.buildId)
    || result?.automaticApply !== false
  ) {
    return block('WP707_COMMAND_KERNEL_REVALIDATION_DENIED', 'commandKernelPort.result', 'Command Kernel did not return an exact identity-bound ALLOW.');
  }
  return { ok: true, receipt: result };
}

async function lifecycleReadback(input, target, ports) {
  const lifecyclePort = ports.lifecyclePort;
  if (
    typeof lifecyclePort?.closeProject !== 'function'
    || typeof lifecyclePort?.reopenProject !== 'function'
    || typeof lifecyclePort?.readCanonicalScene !== 'function'
  ) {
    return failed('WP707_LIFECYCLE_PORT_REQUIRED', 'lifecyclePort', 'Close, reopen, and canonical readback ports are required.');
  }
  try {
    const closed = await lifecyclePort.closeProject({ projectId: target.projectId, sceneId: target.sceneId });
    if (closed?.ok !== true || closed?.projectId !== target.projectId) {
      return failed('WP707_CLOSE_FAILED', 'lifecyclePort.closeProject', 'Project close did not preserve exact identity.');
    }
    const reopened = await lifecyclePort.reopenProject({ projectId: target.projectId, sceneId: target.sceneId });
    if (reopened?.ok !== true || reopened?.projectId !== target.projectId || reopened?.sceneId !== target.sceneId) {
      return failed('WP707_REOPEN_FAILED', 'lifecyclePort.reopenProject', 'Project reopen did not preserve exact identity.');
    }
    const readback = await lifecyclePort.readCanonicalScene({ projectId: target.projectId, sceneId: target.sceneId });
    if (
      readback?.ok !== true
      || readback?.projectId !== target.projectId
      || readback?.sceneId !== target.sceneId
      || rawString(readback?.text) !== target.afterText
    ) {
      return failed('WP707_CANONICAL_READBACK_MISMATCH', 'lifecyclePort.readCanonicalScene', 'Reopened canonical scene bytes do not match the exact expected text.');
    }
    return {
      ok: true,
      receipt: {
        close: closed,
        reopen: reopened,
        readback: {
          projectId: readback.projectId,
          sceneId: readback.sceneId,
          textSha256: sha256Text(readback.text),
          byteLength: Buffer.byteLength(readback.text, 'utf8'),
        },
      },
    };
  } catch (error) {
    return failed('WP707_LIFECYCLE_FAILED', 'lifecyclePort', 'Lifecycle verification failed closed.', {
      errorCode: normalized(error?.code),
    });
  }
}

export async function executeWordSingleSceneApplyV1(input = {}, options = {}) {
  const staticValidation = validateStaticAuthority(input);
  if (!staticValidation.ok) return staticValidation;
  const target = validateTarget(input);
  if (!target.ok) return target;
  const ports = {
    fsPort: options.fsPort || fs,
    commandKernelPort: options.commandKernelPort,
    lifecyclePort: options.lifecyclePort,
    exactApply: typeof options.exactApply === 'function'
      ? options.exactApply
      : applyReviewTransportExactApply,
  };
  const boundary = await validateDisposableBoundary(input, target, ports);
  if (!boundary.ok) return boundary;

  const beforeApply = await revalidateCommand(input, target, ports, 'APPLY_BEFORE_MUTATION');
  if (!beforeApply.ok) return beforeApply;
  const first = await ports.exactApply(input.envelopeInput, options.exactApplyOptions || {});
  if (first?.ok !== true || !['applied', 'replay'].includes(first?.status)) {
    return failed('WP707_EXACT_APPLY_FAILED', 'exactApply', 'Canonical exact apply did not produce an applied or replay outcome.', {
      exactApplyResult: first,
      writerCalled: first?.writerCalled === true,
    });
  }

  const lifecycle = await lifecycleReadback(input, target, ports);
  if (!lifecycle.ok) return { ...lifecycle, writerCalled: first?.writerCalled === true };

  const beforeReplay = await revalidateCommand(input, target, ports, 'REPLAY_BEFORE_IDEMPOTENCY_CHECK');
  if (!beforeReplay.ok) return { ...beforeReplay, writerCalled: first?.writerCalled === true };
  const replayResult = await ports.exactApply(input.envelopeInput, options.exactApplyOptions || {});
  if (replayResult?.ok !== true || replayResult?.status !== 'replay' || replayResult?.writerCalled !== false) {
    return failed('WP707_COMPLETED_ROUND_REUSE_FAILED', 'exactApply.replay', 'Completed-round reuse must replay without calling the writer.', {
      replayResult,
      writerCalled: first?.writerCalled === true,
    });
  }
  const replayReadback = await ports.lifecyclePort.readCanonicalScene({
    projectId: target.projectId,
    sceneId: target.sceneId,
  });
  if (
    replayReadback?.ok !== true
    || replayReadback?.projectId !== target.projectId
    || replayReadback?.sceneId !== target.sceneId
    || rawString(replayReadback?.text) !== target.afterText
  ) {
    return failed('WP707_REPLAY_READBACK_MISMATCH', 'lifecyclePort.readCanonicalScene', 'Replay changed or lost the canonical scene bytes.', {
      writerCalled: first?.writerCalled === true,
    });
  }

  return {
    ok: true,
    schemaVersion: WP707_WORD_APPLY_SCHEMA,
    status: 'verified',
    code: 'WP707_SINGLE_SCENE_APPLY_VERIFIED',
    reason: 'WP707_SINGLE_SCENE_APPLY_VERIFIED',
    missionDigest: WP707_MISSION_DIGEST,
    stageId: WP707_STAGE_ID,
    decisionId: WP707_DECISION_ID,
    projectId: target.projectId,
    sceneId: target.sceneId,
    changeCount: target.changes.length,
    firstOutcome: first.status,
    firstWriterCalled: first.writerCalled === true,
    replayOutcome: replayResult.status,
    replayWriterCalled: replayResult.writerCalled === true,
    automaticApply: false,
    multiSceneApply: false,
    atomicMultiSceneSemantics: false,
    beforeTextSha256: sha256Text(target.beforeText),
    afterTextSha256: sha256Text(target.afterText),
    readbackTextSha256: lifecycle.receipt.readback.textSha256,
    commandKernelRevalidation: [beforeApply.receipt, beforeReplay.receipt],
    lifecycle: lifecycle.receipt,
    disposableBoundary: {
      ownership: 'TASK_CREATED_DISPOSABLE',
      projectRootSha256: sha256Text(boundary.projectRoot),
      scenePathSha256: sha256Text(boundary.scenePath),
    },
  };
}
