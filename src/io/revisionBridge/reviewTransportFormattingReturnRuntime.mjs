import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { atomicWriteFile } from '../markdown/atomicWriteFile.mjs';
import {
  buildParagraphDocumentFromText,
  composeObservablePayload,
  deriveVisibleTextFromDocument,
  parseObservablePayload,
} from '../../renderer/documentContentEnvelope.mjs';

export const RTK_FORMATTING_RETURN_COMMAND_ID = 'cmd.rtk.review.applyMultiSceneFormattingReturn';
export const RTK_FORMATTING_RETURN_RUNTIME_SCHEMA = 'yalken.rtk.formatting-return-runtime.v1';

const INLINE_BOOLEAN_MARKS = new Set(['bold', 'italic', 'underline', 'strike']);
const TEXT_STYLE_KEYS = new Set(['color', 'fontFamily', 'fontSize']);
const INLINE_KEYS = new Set([...INLINE_BOOLEAN_MARKS, ...TEXT_STYLE_KEYS, 'highlight']);
const PARAGRAPH_KEYS = new Set(['textAlign']);
const OPERATION_KEYS = new Set([
  'operationId', 'sceneId', 'blockId', 'paragraphOrdinal', 'from', 'to', 'selectedText',
  'inline', 'paragraph', 'targetScope', 'sceneOrdinal', 'paragraphId', 'sourceAuthority', 'expectedOutcome',
  'sourceSceneRevision', 'sourceRawSha256',
]);
const INPUT_KEYS = new Set([
  'commandId', 'callerRole', 'commandAuthority', 'previewConfirmed', 'projectId', 'projectRoot',
  'requestId', 'returnArtifactSha256', 'scenePathBySceneId', 'operations',
]);
const STATE_SCHEMA = 'yalken.rtk.formatting-return-state.v1';
const SHA256_RE = /^sha256:[a-f0-9]{64}$/u;
const applyQueues = new Map();

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function rawString(value) {
  return typeof value === 'string' ? value : '';
}

function normalizedString(value) {
  return rawString(value).trim();
}

function result(ok, code, details = {}) {
  return {
    ok,
    type: 'yalken.rtk.formattingReturnRuntime',
    schemaVersion: RTK_FORMATTING_RETURN_RUNTIME_SCHEMA,
    commandId: RTK_FORMATTING_RETURN_COMMAND_ID,
    status: ok ? 'ready' : 'blocked',
    code,
    reason: code,
    ...details,
  };
}

function graphemeBoundaries(text) {
  if (typeof Intl?.Segmenter !== 'function') return null;
  const boundaries = new Set([0, text.length]);
  const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });
  for (const segment of segmenter.segment(text)) boundaries.add(segment.index);
  return boundaries;
}

function normalizeAction(value, key) {
  if (!isPlainObject(value)) return null;
  if (Object.keys(value).some((field) => !['action', 'value'].includes(field))) return null;
  const action = normalizedString(value.action);
  if (action === 'remove') return Object.hasOwn(value, 'value') ? null : { action: 'remove' };
  if (action !== 'set') return null;
  if (INLINE_BOOLEAN_MARKS.has(key)) return value.value === true ? { action: 'set', value: true } : null;
  const stringValue = rawString(value.value);
  if (!stringValue || /[\u0000-\u001f\u007f]/u.test(stringValue)) return null;
  if (key === 'color' || key === 'highlight') {
    return /^#[a-f0-9]{6}(?:[a-f0-9]{2})?$/iu.test(stringValue)
      ? { action: 'set', value: stringValue.toLowerCase() }
      : null;
  }
  if (key === 'fontFamily') return stringValue.length <= 128 ? { action: 'set', value: stringValue } : null;
  if (key === 'fontSize') {
    const matched = /^(\d{1,4}(?:\.5)?)pt$/u.exec(stringValue);
    const points = matched ? Number(matched[1]) : NaN;
    return Number.isFinite(points) && points >= 1 && points <= 1638
      ? { action: 'set', value: `${points}pt` }
      : null;
  }
  if (key === 'textAlign') {
    return ['left', 'center', 'right', 'justify'].includes(stringValue)
      ? { action: 'set', value: stringValue }
      : null;
  }
  return null;
}

function normalizeOperation(operation, index) {
  if (!isPlainObject(operation)) return result(false, 'RTK_FORMATTING_OPERATION_INVALID', { operationIndex: index });
  const unknownKeys = Object.keys(operation).filter((key) => !OPERATION_KEYS.has(key));
  if (unknownKeys.length > 0) {
    return result(false, 'RTK_FORMATTING_OPERATION_UNKNOWN_KEY', { operationIndex: index, unknownKeys });
  }
  const operationId = normalizedString(operation.operationId);
  const sceneId = normalizedString(operation.sceneId);
  const blockId = normalizedString(operation.blockId);
  const paragraphOrdinal = Number(operation.paragraphOrdinal);
  const from = Number(operation.from);
  const to = Number(operation.to);
  const selectedText = rawString(operation.selectedText);
  const sourceAuthority = normalizedString(operation.sourceAuthority);
  const sourceSceneRevision = normalizedString(operation.sourceSceneRevision);
  const sourceRawSha256 = normalizedString(operation.sourceRawSha256).toLowerCase();
  if (
    !operationId
    || !sceneId
    || !blockId
    || !Number.isSafeInteger(paragraphOrdinal)
    || paragraphOrdinal < 0
    || !Number.isSafeInteger(from)
    || !Number.isSafeInteger(to)
    || from < 0
    || to <= from
    || !selectedText
  ) {
    return result(false, 'RTK_FORMATTING_OPERATION_AUTHORITY_INVALID', { operationIndex: index, operationId });
  }
  if (sourceAuthority === 'authenticated-full-manuscript-export-map-format-ir-v1'
    && (!SHA256_RE.test(sourceSceneRevision) || !SHA256_RE.test(sourceRawSha256))) {
    return result(false, 'RTK_FORMATTING_OPERATION_SOURCE_REVISION_REQUIRED', { operationIndex: index, operationId });
  }
  const inline = {};
  for (const [key, value] of Object.entries(isPlainObject(operation.inline) ? operation.inline : {})) {
    if (!INLINE_KEYS.has(key)) {
      return result(false, 'RTK_FORMATTING_OPERATION_UNSUPPORTED_INLINE_KEY', { operationId, key });
    }
    const action = normalizeAction(value, key);
    if (!action) return result(false, 'RTK_FORMATTING_OPERATION_ACTION_INVALID', { operationId, key });
    inline[key] = action;
  }
  const paragraph = {};
  for (const [key, value] of Object.entries(isPlainObject(operation.paragraph) ? operation.paragraph : {})) {
    if (!PARAGRAPH_KEYS.has(key)) {
      return result(false, 'RTK_FORMATTING_OPERATION_UNSUPPORTED_PARAGRAPH_KEY', { operationId, key });
    }
    const action = normalizeAction(value, key);
    if (!action) return result(false, 'RTK_FORMATTING_OPERATION_ACTION_INVALID', { operationId, key });
    paragraph[key] = action;
  }
  if (Object.keys(inline).length === 0 && Object.keys(paragraph).length === 0) {
    return result(false, 'RTK_FORMATTING_OPERATION_EMPTY', { operationId });
  }
  return {
    ok: true,
    operation: {
      operationId,
      sceneId,
      blockId,
      paragraphOrdinal,
      from,
      to,
      selectedText,
      inline,
      paragraph,
      sourceSceneRevision,
      sourceRawSha256,
    },
  };
}

function canonicalMarks(marks) {
  return marks
    .filter((mark) => isPlainObject(mark) && normalizedString(mark.type))
    .map((mark) => {
      const next = { type: normalizedString(mark.type) };
      if (isPlainObject(mark.attrs) && Object.keys(mark.attrs).length > 0) next.attrs = cloneJson(mark.attrs);
      return next;
    })
    .sort((left, right) => left.type.localeCompare(right.type));
}

function applyBooleanMark(marks, type, action) {
  const next = marks.filter((mark) => mark.type !== type);
  if (action.action === 'set' && action.value !== false) next.push({ type });
  return next;
}

function applyTextStyle(marks, key, action) {
  const existing = marks.find((mark) => mark.type === 'textStyle');
  const attrs = isPlainObject(existing?.attrs) ? cloneJson(existing.attrs) : {};
  if (action.action === 'remove') delete attrs[key];
  else attrs[key] = rawString(action.value);
  const next = marks.filter((mark) => mark.type !== 'textStyle');
  if (Object.keys(attrs).length > 0) next.push({ type: 'textStyle', attrs });
  return next;
}

function applyHighlight(marks, action) {
  const next = marks.filter((mark) => mark.type !== 'highlight');
  if (action.action === 'set' && rawString(action.value)) {
    next.push({ type: 'highlight', attrs: { color: rawString(action.value) } });
  }
  return next;
}

function applyInlineActions(marks, actions) {
  let next = canonicalMarks(Array.isArray(marks) ? marks : []);
  for (const [key, action] of Object.entries(actions)) {
    if (INLINE_BOOLEAN_MARKS.has(key)) next = applyBooleanMark(next, key, action);
    else if (TEXT_STYLE_KEYS.has(key)) next = applyTextStyle(next, key, action);
    else if (key === 'highlight') next = applyHighlight(next, action);
  }
  return canonicalMarks(next);
}

function textNode(text, marks) {
  const node = { type: 'text', text };
  if (marks.length > 0) node.marks = marks;
  return node;
}

function applyInlineRange(paragraph, operation) {
  const paragraphText = deriveVisibleTextFromDocument({ type: 'doc', content: [paragraph] });
  if (operation.to > paragraphText.length || paragraphText.slice(operation.from, operation.to) !== operation.selectedText) {
    return result(false, 'RTK_FORMATTING_EXPECTED_TEXT_MISMATCH', {
      operationId: operation.operationId,
      paragraphText,
    });
  }
  const boundaries = graphemeBoundaries(paragraphText);
  if (!boundaries) {
    return result(false, 'RTK_FORMATTING_GRAPHEME_SEGMENTER_REQUIRED', { operationId: operation.operationId });
  }
  if (!boundaries.has(operation.from) || !boundaries.has(operation.to)) {
    return result(false, 'RTK_FORMATTING_GRAPHEME_SPLIT_BLOCKED', { operationId: operation.operationId });
  }
  const content = Array.isArray(paragraph.content) ? paragraph.content : [];
  const nextContent = [];
  let cursor = 0;
  for (const node of content) {
    if (!isPlainObject(node) || node.type !== 'text') {
      nextContent.push(cloneJson(node));
      if (node?.type === 'hardBreak') cursor += 1;
      continue;
    }
    const value = rawString(node.text);
    const nodeStart = cursor;
    const nodeEnd = nodeStart + value.length;
    const overlapStart = Math.max(nodeStart, operation.from);
    const overlapEnd = Math.min(nodeEnd, operation.to);
    const marks = canonicalMarks(Array.isArray(node.marks) ? node.marks : []);
    if (overlapStart >= overlapEnd) {
      nextContent.push(textNode(value, marks));
    } else {
      const before = value.slice(0, overlapStart - nodeStart);
      const selected = value.slice(overlapStart - nodeStart, overlapEnd - nodeStart);
      const after = value.slice(overlapEnd - nodeStart);
      if (before) nextContent.push(textNode(before, marks));
      if (selected) nextContent.push(textNode(selected, applyInlineActions(marks, operation.inline)));
      if (after) nextContent.push(textNode(after, marks));
    }
    cursor = nodeEnd;
  }
  const nextParagraph = { ...cloneJson(paragraph), content: nextContent };
  if (Object.keys(operation.paragraph).length > 0) {
    const attrs = isPlainObject(nextParagraph.attrs) ? cloneJson(nextParagraph.attrs) : {};
    const align = operation.paragraph.textAlign;
    if (align?.action === 'remove') delete attrs.textAlign;
    else if (align?.action === 'set') attrs.textAlign = rawString(align.value);
    if (Object.keys(attrs).length > 0) nextParagraph.attrs = attrs;
    else delete nextParagraph.attrs;
  }
  return { ok: true, paragraph: nextParagraph };
}

function collectFormattingTextBlocks(doc) {
  const blocks = [];
  const visit = (node, nodePath) => {
    if (!isPlainObject(node)) return;
    if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'codeBlock') {
      blocks.push({ node, nodePath });
      return;
    }
    for (const [index, child] of (Array.isArray(node.content) ? node.content : []).entries()) {
      visit(child, [...nodePath, 'content', index]);
    }
  };
  for (const [index, node] of (Array.isArray(doc?.content) ? doc.content : []).entries()) {
    visit(node, ['content', index]);
  }
  return blocks;
}

function replaceDocumentNodeAtPath(doc, nodePath, nextNode) {
  let owner = doc;
  for (let index = 0; index < nodePath.length - 1; index += 1) {
    owner = owner?.[nodePath[index]];
  }
  const key = nodePath.at(-1);
  if (!owner || key === undefined) return false;
  owner[key] = nextNode;
  return true;
}

export function applyFormattingOperationsToObservableContent(baseContent, operations = []) {
  const parsed = parseObservablePayload(rawString(baseContent));
  if (parsed.issue) return result(false, 'RTK_FORMATTING_SCENE_ENVELOPE_INVALID', { issue: cloneJson(parsed.issue) });
  const normalized = [];
  const seenIds = new Set();
  for (const [index, operation] of (Array.isArray(operations) ? operations : []).entries()) {
    const checked = normalizeOperation(operation, index);
    if (!checked.ok) return checked;
    if (seenIds.has(checked.operation.operationId)) {
      return result(false, 'RTK_FORMATTING_DUPLICATE_OPERATION_ID', { operationId: checked.operation.operationId });
    }
    seenIds.add(checked.operation.operationId);
    normalized.push(checked.operation);
  }
  if (normalized.length === 0) return result(false, 'RTK_FORMATTING_OPERATIONS_REQUIRED');
  const sceneIds = [...new Set(normalized.map((operation) => operation.sceneId))];
  if (sceneIds.length !== 1) return result(false, 'RTK_FORMATTING_SINGLE_SCENE_TRANSFORM_REQUIRED', { sceneIds });

  const doc = parsed.doc ? cloneJson(parsed.doc) : buildParagraphDocumentFromText(parsed.text);
  if (!Array.isArray(doc.content)) return result(false, 'RTK_FORMATTING_DOCUMENT_CONTENT_INVALID');
  const ordered = normalized.slice().sort((left, right) => (
    left.paragraphOrdinal - right.paragraphOrdinal || left.from - right.from || left.operationId.localeCompare(right.operationId)
  ));
  for (const operation of ordered) {
    const blocks = collectFormattingTextBlocks(doc);
    const target = blocks[operation.paragraphOrdinal];
    const paragraph = target?.node;
    if (!isPlainObject(paragraph) || !['paragraph', 'heading'].includes(paragraph.type)) {
      return result(false, 'RTK_FORMATTING_PARAGRAPH_AUTHORITY_INVALID', {
        operationId: operation.operationId,
        paragraphOrdinal: operation.paragraphOrdinal,
        nodeType: normalizedString(paragraph?.type),
      });
    }
    const applied = applyInlineRange(paragraph, operation);
    if (!applied.ok) return applied;
    if (!replaceDocumentNodeAtPath(doc, target.nodePath, applied.paragraph)) {
      return result(false, 'RTK_FORMATTING_PARAGRAPH_AUTHORITY_INVALID', {
        operationId: operation.operationId,
        paragraphOrdinal: operation.paragraphOrdinal,
      });
    }
  }
  const visibleAfter = deriveVisibleTextFromDocument(doc);
  if (visibleAfter !== parsed.text) {
    return result(false, 'RTK_FORMATTING_VISIBLE_TEXT_CHANGED', { before: parsed.text, after: visibleAfter });
  }
  const content = composeObservablePayload({
    doc,
    metaEnabled: parsed.hasMetaBlock,
    meta: parsed.meta,
    cards: parsed.cards,
  });
  return result(true, 'RTK_FORMATTING_SCENE_TRANSFORM_READY', {
    content,
    doc,
    sceneId: sceneIds[0],
    operationCount: normalized.length,
    visibleTextPreserved: true,
    metaPreserved: true,
    cardsPreserved: true,
  });
}

function sha256Text(cryptoPort, value) {
  const digest = normalizedString(cryptoPort.sha256Text(value)).toLowerCase();
  return digest.startsWith('sha256:') ? digest : `sha256:${digest}`;
}

function sha256Json(cryptoPort, value) {
  const digest = normalizedString(cryptoPort.sha256Json(value)).toLowerCase();
  return digest.startsWith('sha256:') ? digest : `sha256:${digest}`;
}

function resolveCryptoPort(port) {
  if (typeof port?.sha256Text === 'function' && typeof port?.sha256Json === 'function') return port;
  throw new Error('CryptoPort with sha256Text and sha256Json is required');
}

function enqueueProject(projectRoot, task) {
  const previous = applyQueues.get(projectRoot) || Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  applyQueues.set(projectRoot, next);
  return next.finally(() => {
    if (applyQueues.get(projectRoot) === next) applyQueues.delete(projectRoot);
  });
}

function pathIsInside(root, target) {
  const relative = path.relative(root, target);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function ensureRealDirectory(directoryPath) {
  let stat;
  try {
    stat = await fs.lstat(directoryPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await fs.mkdir(directoryPath);
    stat = await fs.lstat(directoryPath);
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('RTK_FORMATTING_RECOVERY_DIRECTORY_UNSAFE');
  return fs.realpath(directoryPath);
}

async function prepareStatePaths(projectRoot) {
  const rootStat = await fs.lstat(projectRoot);
  if (!rootStat.isDirectory()) throw new Error('RTK_FORMATTING_PROJECT_ROOT_INVALID');
  const projectRealRoot = await fs.realpath(projectRoot);
  const yalkenRoot = await ensureRealDirectory(path.join(projectRealRoot, '.yalken'));
  const recoveryRoot = await ensureRealDirectory(path.join(yalkenRoot, 'recovery'));
  if (!pathIsInside(projectRealRoot, recoveryRoot)) throw new Error('RTK_FORMATTING_RECOVERY_PATH_ESCAPE');
  return {
    projectRealRoot,
    recoveryRoot,
    statePath: path.join(recoveryRoot, 'rtk-formatting-return-v1.json'),
    lockPath: path.join(recoveryRoot, 'rtk-formatting-return-v1.lock'),
  };
}

function stateWithoutDigest(state) {
  const { stateDigest: _stateDigest, ...unsigned } = state;
  return unsigned;
}

function finalizeState(state, cryptoPort) {
  const unsigned = stateWithoutDigest(state);
  return { ...unsigned, stateDigest: sha256Json(cryptoPort, unsigned) };
}

function emptyState(projectId, cryptoPort) {
  return finalizeState({
    schemaVersion: STATE_SCHEMA,
    projectId,
    generation: 0,
    activeTransaction: null,
    receiptsByRequestId: {},
    requestIdByEffectDigest: {},
    requestIdByOperationId: {},
    recoveredTransactions: [],
  }, cryptoPort);
}

function relativeScenePathIsSafe(value) {
  const normalized = rawString(value);
  if (!normalized || path.isAbsolute(normalized)) return false;
  const segments = normalized.split(/[\\/]/u);
  return segments.length >= 2
    && segments[0] === 'roman'
    && normalized.toLowerCase().endsWith('.txt')
    && segments.every((segment) => segment && segment !== '.' && segment !== '..' && !segment.startsWith('.'));
}

function stateIndexIsValid(value) {
  return isPlainObject(value) && Object.entries(value).every(([key, requestId]) => (
    normalizedString(key) === key
    && normalizedString(requestId) === requestId
  ));
}

function stateSceneIsValid(scene, cryptoPort) {
  return isPlainObject(scene)
    && normalizedString(scene.sceneId)
    && relativeScenePathIsSafe(scene.sceneRelativePath)
    && typeof scene.beforeContent === 'string'
    && typeof scene.afterContent === 'string'
    && SHA256_RE.test(normalizedString(scene.beforeSha256))
    && SHA256_RE.test(normalizedString(scene.afterSha256))
    && normalizedString(scene.beforeSha256) === sha256Text(cryptoPort, scene.beforeContent)
    && normalizedString(scene.afterSha256) === sha256Text(cryptoPort, scene.afterContent)
    && Array.isArray(scene.operationIds)
    && scene.operationIds.length > 0
    && scene.operationIds.every((operationId) => normalizedString(operationId) === operationId);
}

function stateReceiptIsValid(receipt, requestId) {
  if (!(
    isPlainObject(receipt)
    && normalizedString(receipt.requestId) === requestId
    && SHA256_RE.test(normalizedString(receipt.effectDigest))
    && Array.isArray(receipt.scenes)
    && receipt.scenes.length >= 1
    && receipt.scenes.every((scene) => (
      isPlainObject(scene)
      && normalizedString(scene.sceneId)
      && SHA256_RE.test(normalizedString(scene.beforeSha256))
      && SHA256_RE.test(normalizedString(scene.afterSha256))
    ))
    && Array.isArray(receipt.operationIds)
    && receipt.operationIds.length > 0
    && receipt.operationIds.every((operationId) => normalizedString(operationId) === operationId)
  )) return false;
  return new Set(receipt.scenes.map((scene) => scene.sceneId)).size === receipt.scenes.length
    && new Set(receipt.operationIds).size === receipt.operationIds.length
    && (
      receipt.committedStateGeneration === undefined
      || (Number.isSafeInteger(receipt.committedStateGeneration) && receipt.committedStateGeneration > 0)
    );
}

function stateStructureIsValid(state, cryptoPort) {
  const receiptEntries = Object.entries(state.receiptsByRequestId);
  if (!receiptEntries.every(([requestId, receipt]) => stateReceiptIsValid(receipt, requestId))) return false;
  if (!stateIndexIsValid(state.requestIdByEffectDigest) || !stateIndexIsValid(state.requestIdByOperationId)) return false;
  for (const [requestId, receipt] of receiptEntries) {
    if (state.requestIdByEffectDigest[receipt.effectDigest] !== requestId) return false;
    if (receipt.operationIds.some((operationId) => state.requestIdByOperationId[operationId] !== requestId)) return false;
  }
  for (const [effectDigest, requestId] of Object.entries(state.requestIdByEffectDigest)) {
    const receipt = state.receiptsByRequestId[requestId];
    if (!receipt || receipt.effectDigest !== effectDigest) return false;
  }
  for (const [operationId, requestId] of Object.entries(state.requestIdByOperationId)) {
    const receipt = state.receiptsByRequestId[requestId];
    if (!receipt || !receipt.operationIds.includes(operationId)) return false;
  }
  const active = state.activeTransaction;
  if (active !== null) {
    if (
      !isPlainObject(active)
      || !normalizedString(active.requestId)
      || !SHA256_RE.test(normalizedString(active.effectDigest))
      || !Array.isArray(active.operationIds)
      || active.operationIds.length === 0
      || !Array.isArray(active.scenes)
      || active.scenes.length < 1
      || !active.scenes.every((scene) => stateSceneIsValid(scene, cryptoPort))
    ) return false;
    const sceneIds = active.scenes.map((scene) => scene.sceneId);
    const operationIds = active.scenes.flatMap((scene) => scene.operationIds);
    if (new Set(sceneIds).size !== sceneIds.length || new Set(operationIds).size !== operationIds.length) return false;
    if (stableStringArray(active.operationIds) !== stableStringArray(operationIds)) return false;
  }
  return state.recoveredTransactions.every((entry) => (
    isPlainObject(entry)
    && normalizedString(entry.requestId)
    && SHA256_RE.test(normalizedString(entry.effectDigest))
    && normalizedString(entry.outcome)
  ));
}

function stableStringArray(value) {
  return (Array.isArray(value) ? value : []).map(normalizedString).sort().join('\u0000');
}

async function readState(statePath, projectId, cryptoPort) {
  const text = await fs.readFile(statePath, 'utf8').catch((error) => {
    if (error?.code === 'ENOENT') return '';
    throw error;
  });
  if (!text) return emptyState(projectId, cryptoPort);
  let state;
  try {
    state = JSON.parse(text);
  } catch {
    return result(false, 'RTK_FORMATTING_STATE_JSON_INVALID');
  }
  if (
    !isPlainObject(state)
    || state.schemaVersion !== STATE_SCHEMA
    || normalizedString(state.projectId) !== projectId
    || !Number.isSafeInteger(state.generation)
    || state.generation < 0
    || !isPlainObject(state.receiptsByRequestId)
    || !isPlainObject(state.requestIdByEffectDigest)
    || !isPlainObject(state.requestIdByOperationId)
    || !Array.isArray(state.recoveredTransactions)
    || normalizedString(state.stateDigest) !== sha256Json(cryptoPort, stateWithoutDigest(state))
    || !stateStructureIsValid(state, cryptoPort)
  ) {
    return result(false, 'RTK_FORMATTING_STATE_INTEGRITY_INVALID');
  }
  return state;
}

async function writeState(statePath, state, cryptoPort) {
  const next = finalizeState(state, cryptoPort);
  await atomicWriteFile(statePath, `${JSON.stringify(next, null, 2)}\n`, { safetyMode: 'strict' });
  const readback = JSON.parse(await fs.readFile(statePath, 'utf8'));
  if (normalizedString(readback.stateDigest) !== next.stateDigest) {
    throw new Error('RTK_FORMATTING_STATE_READBACK_MISMATCH');
  }
  return next;
}

async function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

async function syncDirectory(directoryPath) {
  let handle = null;
  try {
    handle = await fs.open(directoryPath, 'r');
    await handle.sync();
  } catch (error) {
    const unsupportedOnWindows = process.platform === 'win32'
      && ['EPERM', 'EISDIR', 'EINVAL', 'ENOTSUP'].includes(error?.code);
    if (!unsupportedOnWindows) throw error;
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

async function acquireProjectLease(lockPath, requestId) {
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  const token = randomUUID();
  try {
    const handle = await fs.open(lockPath, 'wx');
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, requestId, token })}\n`);
    await handle.sync();
    await handle.close();
    await syncDirectory(path.dirname(lockPath));
    return { ok: true, token };
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    let existing = null;
    try {
      existing = JSON.parse(await fs.readFile(lockPath, 'utf8'));
    } catch {
      return result(false, 'RTK_FORMATTING_PROJECT_LEASE_CORRUPT');
    }
    if (await processIsAlive(Number(existing?.pid))) {
      return result(false, 'RTK_FORMATTING_PROJECT_LEASE_HELD', { holderPid: Number(existing.pid) });
    }
    return result(false, 'RTK_FORMATTING_PROJECT_LEASE_RECOVERY_REQUIRED', {
      holderPid: Number(existing?.pid),
    });
  }
}

async function releaseProjectLease(lockPath, token) {
  if (!normalizedString(token)) return false;
  let existing = null;
  try {
    existing = JSON.parse(await fs.readFile(lockPath, 'utf8'));
  } catch {
    return false;
  }
  if (normalizedString(existing?.token) !== token || Number(existing?.pid) !== process.pid) return false;
  await fs.unlink(lockPath);
  await syncDirectory(path.dirname(lockPath));
  return true;
}

async function recoverStaleProjectLeaseAtStartup(lockPath) {
  let existing = null;
  try {
    existing = JSON.parse(await fs.readFile(lockPath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return { ok: true, recovered: false };
    return result(false, 'RTK_FORMATTING_PROJECT_LEASE_CORRUPT');
  }
  const pid = Number(existing?.pid);
  const token = normalizedString(existing?.token);
  if (!Number.isSafeInteger(pid) || pid <= 0 || !token) {
    return result(false, 'RTK_FORMATTING_PROJECT_LEASE_CORRUPT');
  }
  if (await processIsAlive(pid)) {
    return result(false, 'RTK_FORMATTING_PROJECT_LEASE_HELD', { holderPid: pid });
  }
  await fs.unlink(lockPath);
  await syncDirectory(path.dirname(lockPath));
  return { ok: true, recovered: true, holderPid: pid };
}

async function validateScenePath(projectRoot, scenePath) {
  const root = await fs.realpath(projectRoot);
  const target = path.resolve(scenePath);
  const stat = await fs.lstat(target).catch(() => null);
  if (!stat?.isFile() || stat.isSymbolicLink()) return null;
  const realTarget = await fs.realpath(target);
  const sceneRelativePath = path.relative(root, realTarget);
  if (!pathIsInside(root, realTarget) || !relativeScenePathIsSafe(sceneRelativePath)) return null;
  const parentSegments = path.dirname(sceneRelativePath).split(path.sep).filter(Boolean);
  const parentIdentities = [];
  let current = root;
  for (const segment of parentSegments) {
    current = path.join(current, segment);
    const parentStat = await fs.lstat(current).catch(() => null);
    if (!parentStat?.isDirectory() || parentStat.isSymbolicLink()) return null;
    parentIdentities.push(`${parentStat.dev}:${parentStat.ino}`);
  }
  return { scenePath: realTarget, sceneRelativePath, parentIdentities };
}

async function revalidateSceneAuthority(projectRoot, authority) {
  if (!isPlainObject(authority)) return null;
  const current = await validateScenePath(projectRoot, authority.scenePath);
  if (!current || current.sceneRelativePath !== authority.sceneRelativePath) return null;
  return stableStringArray(current.parentIdentities) === stableStringArray(authority.parentIdentities)
    ? current
    : null;
}

async function prepareTransactionRecovery(projectRoot, transaction, sceneAuthorityBySceneId, cryptoPort) {
  const prepared = [];
  for (const scene of Array.isArray(transaction?.scenes) ? transaction.scenes : []) {
    const authority = sceneAuthorityBySceneId[scene.sceneId];
    const revalidated = authority?.sceneRelativePath === scene.sceneRelativePath
      ? await revalidateSceneAuthority(projectRoot, authority)
      : null;
    const scenePath = revalidated?.scenePath || '';
    const current = scenePath ? await fs.readFile(scenePath, 'utf8').catch(() => null) : null;
    const currentSha256 = current === null ? '' : sha256Text(cryptoPort, current);
    if (!scenePath) {
      return result(false, 'RTK_FORMATTING_RECOVERY_STATE_DIVERGED', {
        sceneId: scene.sceneId,
        scenePathValid: Boolean(scenePath),
        currentSha256,
      });
    }
    prepared.push({
      ...scene,
      scenePath,
      currentSha256,
      matchesBefore: currentSha256 === scene.beforeSha256,
      matchesAfter: currentSha256 === scene.afterSha256,
      diverged: ![scene.beforeSha256, scene.afterSha256].includes(currentSha256),
    });
  }
  return { ok: true, scenes: prepared };
}

async function verifySceneCommitAuthority(projectRoot, authority, expectedSha256, cryptoPort) {
  const revalidated = await revalidateSceneAuthority(projectRoot, authority);
  if (!revalidated) return { ok: false, code: 'RTK_FORMATTING_SCENE_PATH_AUTHORITY_CHANGED' };
  const current = await fs.readFile(revalidated.scenePath, 'utf8').catch(() => null);
  if (current === null) return { ok: false, code: 'RTK_FORMATTING_SCENE_READ_FAILED' };
  const currentSha256 = sha256Text(cryptoPort, current);
  if (currentSha256 !== expectedSha256) {
    return {
      ok: false,
      code: 'RTK_FORMATTING_CONCURRENT_SCENE_CHANGE_BLOCKED',
      currentSha256,
      expectedSha256,
    };
  }
  if (!await revalidateSceneAuthority(projectRoot, authority)) {
    return { ok: false, code: 'RTK_FORMATTING_SCENE_PATH_AUTHORITY_CHANGED' };
  }
  return { ok: true, currentSha256 };
}

function sceneCommitGuard(projectRoot, authority, expectedSha256, cryptoPort, options = {}, context = {}) {
  return async () => {
    if (typeof options.beforeAtomicSceneRename === 'function') {
      await options.beforeAtomicSceneRename({ ...context });
    }
    const verified = await verifySceneCommitAuthority(projectRoot, authority, expectedSha256, cryptoPort);
    if (!verified.ok) {
      const error = new Error(verified.code);
      error.details = verified;
      throw error;
    }
  };
}

async function restoreTransaction(projectRoot, transaction, sceneAuthorityBySceneId, cryptoPort, options = {}) {
  const prepared = await prepareTransactionRecovery(
    projectRoot,
    transaction,
    sceneAuthorityBySceneId,
    cryptoPort,
  );
  if (!prepared.ok) return prepared;
  const restored = [];
  const conflicts = [];
  for (const scene of prepared.scenes) {
    const authority = sceneAuthorityBySceneId[scene.sceneId];
    if (scene.diverged) {
      conflicts.push({
        sceneId: scene.sceneId,
        currentSha256: scene.currentSha256,
        beforeSha256: scene.beforeSha256,
        afterSha256: scene.afterSha256,
      });
      restored.push({ sceneId: scene.sceneId, restored: false, concurrentContentPreserved: true });
      continue;
    }
    if (scene.matchesBefore) {
      restored.push({ sceneId: scene.sceneId, restored: true, writerCalled: false });
      continue;
    }
    try {
      await atomicWriteFile(scene.scenePath, rawString(scene.beforeContent), {
        safetyMode: 'strict',
        beforeRename: sceneCommitGuard(
          projectRoot,
          authority,
          scene.afterSha256,
          cryptoPort,
          options,
          { phase: 'rollback', sceneId: scene.sceneId },
        ),
      });
    } catch (error) {
      const current = await fs.readFile(scene.scenePath, 'utf8').catch(() => null);
      const currentSha256 = current === null ? '' : sha256Text(cryptoPort, current);
      conflicts.push({
        sceneId: scene.sceneId,
        currentSha256,
        beforeSha256: scene.beforeSha256,
        afterSha256: scene.afterSha256,
        errorCode: normalizedString(error?.message || error?.code),
      });
      restored.push({ sceneId: scene.sceneId, restored: false, concurrentContentPreserved: true });
      continue;
    }
    if (!await revalidateSceneAuthority(projectRoot, authority)) {
      return result(false, 'RTK_FORMATTING_SCENE_PATH_AUTHORITY_CHANGED', { sceneId: scene.sceneId });
    }
    const readback = await fs.readFile(scene.scenePath, 'utf8');
    restored.push({
      sceneId: scene.sceneId,
      restored: readback === rawString(scene.beforeContent),
      writerCalled: true,
    });
  }
  return {
    ok: restored.every((scene) => scene.restored || scene.concurrentContentPreserved),
    restored,
    conflicts,
  };
}

async function reconcileActiveTransaction(
  projectRoot,
  statePath,
  state,
  sceneAuthorityBySceneId,
  cryptoPort,
  options = {},
) {
  const active = isPlainObject(state.activeTransaction) ? state.activeTransaction : null;
  if (!active) return { ok: true, state, outcome: 'none' };
  const prepared = await prepareTransactionRecovery(
    projectRoot,
    active,
    sceneAuthorityBySceneId,
    cryptoPort,
  );
  if (!prepared.ok) return prepared;
  const sceneStates = [];
  for (const scene of prepared.scenes) {
    const current = await fs.readFile(scene.scenePath, 'utf8').catch(() => null);
    sceneStates.push({
      sceneId: scene.sceneId,
      scenePathValid: Boolean(scene.scenePath),
      matchesBefore: current !== null && sha256Text(cryptoPort, current) === scene.beforeSha256,
      matchesAfter: current !== null && sha256Text(cryptoPort, current) === scene.afterSha256,
    });
  }
  if (sceneStates.length > 0 && sceneStates.every((scene) => scene.matchesAfter)) {
    const receipt = {
      requestId: active.requestId,
      effectDigest: active.effectDigest,
      status: 'applied-after-recovery-readback',
      committedStateGeneration: state.generation + 1,
      scenes: active.scenes.map((scene) => ({
        sceneId: scene.sceneId,
        beforeSha256: scene.beforeSha256,
        afterSha256: scene.afterSha256,
      })),
      operationIds: active.operationIds,
    };
    const next = await writeState(statePath, {
      ...state,
      generation: state.generation + 1,
      activeTransaction: null,
      receiptsByRequestId: { ...state.receiptsByRequestId, [active.requestId]: receipt },
      requestIdByEffectDigest: { ...state.requestIdByEffectDigest, [active.effectDigest]: active.requestId },
      requestIdByOperationId: {
        ...state.requestIdByOperationId,
        ...Object.fromEntries(active.operationIds.map((operationId) => [operationId, active.requestId])),
      },
    }, cryptoPort);
    return { ok: true, state: next, outcome: 'completed-forward', receipt };
  }
  const rollback = await restoreTransaction(
    projectRoot,
    active,
    sceneAuthorityBySceneId,
    cryptoPort,
    options,
  );
  if (!rollback.ok) {
    return result(false, 'RTK_FORMATTING_RECOVERY_ROLLBACK_FAILED', { rollback });
  }
  const recoveryOutcome = rollback.conflicts.length > 0
    ? 'rolled-back-with-concurrent-content-preserved'
    : 'rolled-back-to-baseline';
  const recoveredTransactions = [...state.recoveredTransactions, {
    requestId: active.requestId,
    effectDigest: active.effectDigest,
    outcome: recoveryOutcome,
  }];
  const next = await writeState(statePath, {
    ...state,
    generation: state.generation + 1,
    activeTransaction: null,
    recoveredTransactions,
  }, cryptoPort);
  return {
    ok: true,
    state: next,
    outcome: rollback.conflicts.length > 0 ? 'rolled-back-conflict-preserved' : 'rolled-back',
    restored: rollback.restored,
    conflicts: rollback.conflicts,
    manualRequired: rollback.conflicts.length > 0,
  };
}

async function buildFormattingReplaySnapshot(state, projectRoot, sceneAuthorityBySceneId, cryptoPort) {
  const receipts = Object.values(state.receiptsByRequestId);
  const latestReceipt = receipts.at(-1) || null;
  const sceneReadback = [];
  if (latestReceipt) {
    for (const scene of latestReceipt.scenes) {
      const authority = sceneAuthorityBySceneId[scene.sceneId];
      const revalidated = authority
        ? await revalidateSceneAuthority(projectRoot, authority)
        : null;
      const current = revalidated
        ? await fs.readFile(revalidated.scenePath, 'utf8').catch(() => null)
        : null;
      const currentSha256 = current === null ? '' : sha256Text(cryptoPort, current);
      sceneReadback.push({
        sceneId: scene.sceneId,
        expectedAfterSha256: scene.afterSha256,
        currentSha256,
        matchesAfter: currentSha256 === scene.afterSha256,
      });
    }
  }
  const replayVerified = Boolean(latestReceipt) && sceneReadback.every((scene) => scene.matchesAfter);
  return {
    schemaVersion: 'yalken.rtk.formatting-return-replay-snapshot.v1',
    status: !latestReceipt ? 'empty' : (replayVerified ? 'replayed' : 'recovery-required'),
    projectId: state.projectId,
    stateGeneration: state.generation,
    stateDigest: state.stateDigest,
    receiptCount: receipts.length,
    latestReceipt: latestReceipt ? cloneJson(latestReceipt) : null,
    sceneReadback,
    replayVerified,
    writerCalled: false,
    recoveredTransactions: cloneJson(state.recoveredTransactions),
  };
}

async function normalizeRuntimeInput(input, cryptoPort) {
  if (!isPlainObject(input)) return result(false, 'RTK_FORMATTING_INPUT_INVALID');
  const unknownInputKeys = Object.keys(input).filter((key) => !INPUT_KEYS.has(key));
  if (unknownInputKeys.length > 0) return result(false, 'RTK_FORMATTING_INPUT_UNKNOWN_KEY', { unknownInputKeys });
  const authority = isPlainObject(input.commandAuthority) ? input.commandAuthority : {};
  if (Object.keys(authority).some((key) => !['issuer', 'intent', 'commandId'].includes(key))) {
    return result(false, 'RTK_FORMATTING_COMMAND_AUTHORITY_BLOCKED');
  }
  if (
    normalizedString(input.commandId) !== RTK_FORMATTING_RETURN_COMMAND_ID
    || normalizedString(input.callerRole) !== 'main'
    || normalizedString(authority.issuer) !== 'main'
    || normalizedString(authority.intent) !== 'rtk.formattingApply'
    || normalizedString(authority.commandId) !== RTK_FORMATTING_RETURN_COMMAND_ID
  ) return result(false, 'RTK_FORMATTING_COMMAND_AUTHORITY_BLOCKED');
  if (input.previewConfirmed !== true) return result(false, 'RTK_FORMATTING_PREVIEW_CONFIRMATION_REQUIRED');
  const projectId = normalizedString(input.projectId);
  const projectRoot = normalizedString(input.projectRoot);
  const requestId = normalizedString(input.requestId);
  const returnArtifactSha256 = normalizedString(input.returnArtifactSha256).toLowerCase();
  const scenePathBySceneId = isPlainObject(input.scenePathBySceneId) ? input.scenePathBySceneId : {};
  if (!projectId || !projectRoot || !requestId || !SHA256_RE.test(returnArtifactSha256)) {
    return result(false, 'RTK_FORMATTING_PROJECT_AUTHORITY_REQUIRED');
  }
  const operations = [];
  const operationIds = new Set();
  for (const [index, operation] of (Array.isArray(input.operations) ? input.operations : []).entries()) {
    const checked = normalizeOperation(operation, index);
    if (!checked.ok) return checked;
    if (operationIds.has(checked.operation.operationId)) {
      return result(false, 'RTK_FORMATTING_DUPLICATE_OPERATION_ID', { operationId: checked.operation.operationId });
    }
    operationIds.add(checked.operation.operationId);
    operations.push(checked.operation);
  }
  const sceneIds = [...new Set(operations.map((operation) => operation.sceneId))].sort();
  if (sceneIds.length < 1) return result(false, 'RTK_FORMATTING_SCENE_REQUIRED', { sceneCount: sceneIds.length });
  const scenePathKeys = Object.keys(scenePathBySceneId).sort();
  if (scenePathKeys.some((sceneId) => !sceneId || normalizedString(sceneId) !== sceneId)
    || sceneIds.some((sceneId) => !scenePathKeys.includes(sceneId))) {
    return result(false, 'RTK_FORMATTING_SCENE_PATH_AUTHORITY_INVALID', { sceneIds, scenePathKeys });
  }
  let paths;
  try {
    paths = await prepareStatePaths(projectRoot);
  } catch (error) {
    return result(false, normalizedString(error?.message) || 'RTK_FORMATTING_PROJECT_STORAGE_INVALID');
  }
  const sceneAuthorityBySceneId = {};
  for (const sceneId of scenePathKeys) {
    const scenePathAuthority = await validateScenePath(
      paths.projectRealRoot,
      normalizedString(scenePathBySceneId[sceneId]),
    );
    if (!scenePathAuthority) return result(false, 'RTK_FORMATTING_SCENE_PATH_AUTHORITY_INVALID', { sceneId });
    sceneAuthorityBySceneId[sceneId] = scenePathAuthority;
  }
  const scenes = [];
  for (const sceneId of sceneIds) {
    scenes.push({
      sceneId,
      ...sceneAuthorityBySceneId[sceneId],
      operations: operations.filter((operation) => operation.sceneId === sceneId),
    });
  }
  const effectDigest = sha256Json(cryptoPort, {
    schemaVersion: RTK_FORMATTING_RETURN_RUNTIME_SCHEMA,
    projectId,
    returnArtifactSha256,
    operations,
  });
  return {
    ok: true,
    projectId,
    projectRoot: paths.projectRealRoot,
    paths,
    requestId,
    scenes,
    sceneAuthorityBySceneId,
    operations,
    effectDigest,
  };
}

async function normalizeStartupRecoveryInput(input) {
  if (!isPlainObject(input) || input.startupSingleInstanceAuthority !== true) {
    return result(false, 'RTK_FORMATTING_STARTUP_AUTHORITY_REQUIRED');
  }
  const unknownKeys = Object.keys(input)
    .filter((key) => !['projectId', 'projectRoot', 'scenePathBySceneId', 'startupSingleInstanceAuthority'].includes(key));
  if (unknownKeys.length > 0) {
    return result(false, 'RTK_FORMATTING_STARTUP_INPUT_UNKNOWN_KEY', { unknownKeys });
  }
  const projectId = normalizedString(input.projectId);
  const projectRoot = normalizedString(input.projectRoot);
  const scenePathBySceneId = isPlainObject(input.scenePathBySceneId) ? input.scenePathBySceneId : {};
  if (!projectId || !projectRoot) return result(false, 'RTK_FORMATTING_PROJECT_AUTHORITY_REQUIRED');
  let paths;
  try {
    paths = await prepareStatePaths(projectRoot);
  } catch (error) {
    return result(false, normalizedString(error?.message) || 'RTK_FORMATTING_PROJECT_STORAGE_INVALID');
  }
  const sceneAuthorityBySceneId = {};
  for (const sceneId of Object.keys(scenePathBySceneId).sort()) {
    if (!sceneId || normalizedString(sceneId) !== sceneId) {
      return result(false, 'RTK_FORMATTING_SCENE_PATH_AUTHORITY_INVALID', { sceneId });
    }
    const authority = await validateScenePath(paths.projectRealRoot, normalizedString(scenePathBySceneId[sceneId]));
    if (!authority) return result(false, 'RTK_FORMATTING_SCENE_PATH_AUTHORITY_INVALID', { sceneId });
    sceneAuthorityBySceneId[sceneId] = authority;
  }
  return { ok: true, projectId, projectRoot: paths.projectRealRoot, paths, sceneAuthorityBySceneId };
}

export async function reconcileFormattingReturnRuntimeAtStartup(input = {}, options = {}) {
  const cryptoPort = resolveCryptoPort(options.cryptoPort);
  const normalized = await normalizeStartupRecoveryInput(input);
  if (!normalized.ok) return normalized;
  return enqueueProject(normalized.projectRoot, async () => {
    const staleLease = await recoverStaleProjectLeaseAtStartup(normalized.paths.lockPath);
    if (!staleLease.ok) return staleLease;
    const lease = await acquireProjectLease(normalized.paths.lockPath, 'startup-formatting-recovery');
    if (!lease.ok) return lease;
    try {
      const state = await readState(normalized.paths.statePath, normalized.projectId, cryptoPort);
      if (state?.ok === false) return state;
      const reconciliation = await reconcileActiveTransaction(
        normalized.projectRoot,
        normalized.paths.statePath,
        state,
        normalized.sceneAuthorityBySceneId,
        cryptoPort,
        options,
      );
      if (!reconciliation.ok) return reconciliation;
      const replaySnapshot = await buildFormattingReplaySnapshot(
        reconciliation.state,
        normalized.projectRoot,
        normalized.sceneAuthorityBySceneId,
        cryptoPort,
      );
      return result(true, 'RTK_FORMATTING_STARTUP_RECOVERY_COMPLETE', {
        status: 'recovered',
        staleLeaseRecovered: staleLease.recovered === true,
        recoveryOutcome: reconciliation.outcome,
        replaySnapshot,
      });
    } finally {
      await releaseProjectLease(normalized.paths.lockPath, lease.token).catch(() => {});
    }
  });
}

export async function inspectFormattingReturnRuntimeState(input = {}, options = {}) {
  const cryptoPort = resolveCryptoPort(options.cryptoPort);
  const normalized = await normalizeStartupRecoveryInput(input);
  if (!normalized.ok) return normalized;
  return enqueueProject(normalized.projectRoot, async () => {
    const lease = await acquireProjectLease(normalized.paths.lockPath, 'inspect-formatting-replay');
    if (!lease.ok) return lease;
    try {
      let state = await readState(normalized.paths.statePath, normalized.projectId, cryptoPort);
      if (state?.ok === false) return state;
      const reconciliation = await reconcileActiveTransaction(
        normalized.projectRoot,
        normalized.paths.statePath,
        state,
        normalized.sceneAuthorityBySceneId,
        cryptoPort,
        options,
      );
      if (!reconciliation.ok) return reconciliation;
      state = reconciliation.state;
      const replaySnapshot = await buildFormattingReplaySnapshot(
        state,
        normalized.projectRoot,
        normalized.sceneAuthorityBySceneId,
        cryptoPort,
      );
      return result(true, 'RTK_FORMATTING_REPLAY_STATE_INSPECTED', {
        status: replaySnapshot.status,
        replaySnapshot,
        writerCalled: false,
      });
    } finally {
      await releaseProjectLease(normalized.paths.lockPath, lease.token).catch(() => {});
    }
  });
}

export async function applyMultiSceneFormattingReturnRuntime(input = {}, options = {}) {
  const cryptoPort = resolveCryptoPort(options.cryptoPort);
  const normalized = await normalizeRuntimeInput(input, cryptoPort);
  if (!normalized.ok) return normalized;
  return enqueueProject(normalized.projectRoot, async () => {
    const paths = normalized.paths;
    const lease = await acquireProjectLease(paths.lockPath, normalized.requestId);
    if (!lease.ok) return lease;
    try {
      let state = await readState(paths.statePath, normalized.projectId, cryptoPort);
      if (state?.ok === false) return state;
      const reconciliation = await reconcileActiveTransaction(
        normalized.projectRoot,
        paths.statePath,
        state,
        normalized.sceneAuthorityBySceneId,
        cryptoPort,
        options,
      );
      if (!reconciliation.ok) return reconciliation;
      state = reconciliation.state;
      const existingRequestId = state.receiptsByRequestId[normalized.requestId]
        ? normalized.requestId
        : state.requestIdByEffectDigest[normalized.effectDigest];
      const existing = existingRequestId ? state.receiptsByRequestId[existingRequestId] : null;
      if (existing) {
        if (normalizedString(existing.effectDigest) !== normalized.effectDigest) {
          return result(false, 'RTK_FORMATTING_REQUEST_EFFECT_MISMATCH');
        }
        const readback = [];
        for (const scene of existing.scenes) {
          const scenePath = normalized.scenes.find((item) => item.sceneId === scene.sceneId)?.scenePath;
          const current = scenePath ? await fs.readFile(scenePath, 'utf8').catch(() => null) : null;
          readback.push({ sceneId: scene.sceneId, matchesAfter: current !== null && sha256Text(cryptoPort, current) === scene.afterSha256 });
        }
        if (readback.every((item) => item.matchesAfter)) {
          return result(true, 'RTK_FORMATTING_ALREADY_APPLIED', {
            status: 'replay', replay: true, applied: false, writerCalled: false, readback, receipt: cloneJson(existing),
          });
        }
        return result(false, 'RTK_FORMATTING_REPLAY_STATE_DIVERGED', { readback });
      }
      const priorOperationRequestIds = [...new Set(normalized.operations
        .map((operation) => state.requestIdByOperationId[operation.operationId])
        .filter(Boolean))];
      if (priorOperationRequestIds.length > 0) {
        return result(false, 'RTK_FORMATTING_OPERATION_REPLAY_CONFLICT', { priorOperationRequestIds });
      }

      const preparedScenes = [];
      for (const scene of normalized.scenes) {
        if (!await revalidateSceneAuthority(normalized.projectRoot, normalized.sceneAuthorityBySceneId[scene.sceneId])) {
          return result(false, 'RTK_FORMATTING_SCENE_PATH_AUTHORITY_CHANGED', { sceneId: scene.sceneId });
        }
        const beforeContent = await fs.readFile(scene.scenePath, 'utf8');
        const beforeSha256 = sha256Text(cryptoPort, beforeContent);
        const expectedRawHashes = [...new Set(scene.operations.map((operation) => operation.sourceRawSha256).filter(Boolean))];
        const expectedSceneRevisions = [...new Set(scene.operations.map((operation) => operation.sourceSceneRevision).filter(Boolean))];
        if (expectedRawHashes.length > 1 || expectedSceneRevisions.length > 1) {
          return result(false, 'RTK_FORMATTING_SOURCE_REVISION_CONFLICT', { sceneId: scene.sceneId });
        }
        if (
          expectedRawHashes.length !== 1
          || expectedSceneRevisions.length !== 1
          || expectedSceneRevisions[0] !== expectedRawHashes[0]
        ) {
          return result(false, 'RTK_FORMATTING_SOURCE_REVISION_INVALID', {
            sceneId: scene.sceneId,
            expectedRawSha256: expectedRawHashes[0] || '',
            expectedSceneRevision: expectedSceneRevisions[0] || '',
          });
        }
        if (expectedRawHashes.length === 1 && expectedRawHashes[0] !== beforeSha256) {
          return result(false, 'RTK_FORMATTING_SOURCE_SCENE_STALE', {
            sceneId: scene.sceneId,
            expectedRawSha256: expectedRawHashes[0],
            actualRawSha256: beforeSha256,
          });
        }
        const transformed = applyFormattingOperationsToObservableContent(beforeContent, scene.operations);
        if (!transformed.ok) return transformed;
        preparedScenes.push({
          sceneId: scene.sceneId,
          scenePath: scene.scenePath,
          sceneRelativePath: scene.sceneRelativePath,
          beforeContent,
          afterContent: transformed.content,
          beforeSha256,
          afterSha256: sha256Text(cryptoPort, transformed.content),
          operationIds: scene.operations.map((operation) => operation.operationId),
        });
      }
      const activeTransaction = {
        requestId: normalized.requestId,
        effectDigest: normalized.effectDigest,
        operationIds: normalized.operations.map((operation) => operation.operationId),
        scenes: preparedScenes.map(({ scenePath: _scenePath, ...scene }) => scene),
      };
      state = await writeState(paths.statePath, {
        ...state,
        generation: state.generation + 1,
        activeTransaction,
      }, cryptoPort);
      let writerCalled = false;
      try {
        for (const [index, scene] of preparedScenes.entries()) {
          const authority = normalized.sceneAuthorityBySceneId[scene.sceneId];
          if (typeof options.beforeSceneWrite === 'function') {
            await options.beforeSceneWrite({ index, sceneId: scene.sceneId });
          }
          if (!await revalidateSceneAuthority(normalized.projectRoot, authority)) {
            throw new Error('RTK_FORMATTING_SCENE_PATH_AUTHORITY_CHANGED');
          }
          await atomicWriteFile(scene.scenePath, scene.afterContent, {
            safetyMode: 'strict',
            beforeRename: sceneCommitGuard(
              normalized.projectRoot,
              authority,
              scene.beforeSha256,
              cryptoPort,
              options,
              { phase: 'commit', index, sceneId: scene.sceneId },
            ),
          });
          writerCalled = true;
          if (!await revalidateSceneAuthority(normalized.projectRoot, authority)) {
            throw new Error('RTK_FORMATTING_SCENE_PATH_AUTHORITY_CHANGED');
          }
          if (typeof options.afterSceneWrite === 'function') {
            await options.afterSceneWrite({ index, sceneId: scene.sceneId });
          }
          if (Number(options.simulateAbruptFailureAtSceneIndex) === index) {
            throw new Error('RTK_FORMATTING_SIMULATED_ABRUPT_PROCESS_EXIT');
          }
          if (Number(options.simulateFailureAtSceneIndex) === index) {
            throw new Error('RTK_FORMATTING_SIMULATED_KILLPOINT');
          }
        }
      } catch (error) {
        if (error?.message === 'RTK_FORMATTING_SIMULATED_ABRUPT_PROCESS_EXIT') throw error;
        const rollback = await restoreTransaction(
          normalized.projectRoot,
          activeTransaction,
          normalized.sceneAuthorityBySceneId,
          cryptoPort,
          options,
        );
        if (!rollback.ok) {
          return result(false, 'RTK_FORMATTING_RECOVERY_ROLLBACK_FAILED', {
            writerCalled,
            rollback,
            errorCode: normalizedString(error?.message || error?.code),
          });
        }
        state = await writeState(paths.statePath, {
          ...state,
          generation: state.generation + 1,
          activeTransaction: null,
          recoveredTransactions: [...state.recoveredTransactions, {
            requestId: normalized.requestId,
            effectDigest: normalized.effectDigest,
            outcome: rollback.conflicts.length > 0
              ? 'writer-failure-concurrent-content-preserved'
              : 'writer-failure-rolled-back',
          }],
        }, cryptoPort);
        return result(false, rollback.conflicts.length > 0
          ? 'RTK_FORMATTING_CONCURRENT_SCENE_CHANGE_BLOCKED'
          : 'RTK_FORMATTING_WRITE_FAILED_ROLLED_BACK', {
          writerCalled,
          restored: rollback.restored,
          conflicts: rollback.conflicts,
          errorCode: normalizedString(error?.message || error?.code),
        });
      }
      const readback = [];
      for (const scene of preparedScenes) {
        if (!await revalidateSceneAuthority(normalized.projectRoot, normalized.sceneAuthorityBySceneId[scene.sceneId])) {
          return result(false, 'RTK_FORMATTING_SCENE_PATH_AUTHORITY_CHANGED', { sceneId: scene.sceneId });
        }
        const current = await fs.readFile(scene.scenePath, 'utf8');
        readback.push({ sceneId: scene.sceneId, matchesAfter: sha256Text(cryptoPort, current) === scene.afterSha256 });
      }
      if (readback.some((item) => item.matchesAfter !== true)) {
        const rollback = await restoreTransaction(
          normalized.projectRoot,
          activeTransaction,
          normalized.sceneAuthorityBySceneId,
          cryptoPort,
          options,
        );
        if (!rollback.ok) {
          return result(false, 'RTK_FORMATTING_RECOVERY_ROLLBACK_FAILED', {
            writerCalled,
            readback,
            rollback,
          });
        }
        await writeState(paths.statePath, {
          ...state,
          generation: state.generation + 1,
          activeTransaction: null,
          recoveredTransactions: [...state.recoveredTransactions, {
            requestId: normalized.requestId,
            effectDigest: normalized.effectDigest,
            outcome: rollback.conflicts.length > 0
              ? 'reverse-verify-failure-concurrent-content-preserved'
              : 'reverse-verify-failure-rolled-back',
          }],
        }, cryptoPort);
        return result(false, 'RTK_FORMATTING_REVERSE_VERIFY_FAILED', {
          writerCalled,
          readback,
          restored: rollback.restored,
          conflicts: rollback.conflicts,
        });
      }
      const receipt = {
        requestId: normalized.requestId,
        effectDigest: normalized.effectDigest,
        status: 'applied',
        committedStateGeneration: state.generation + 1,
        scenes: preparedScenes.map((scene) => ({
          sceneId: scene.sceneId,
          beforeSha256: scene.beforeSha256,
          afterSha256: scene.afterSha256,
        })),
        operationIds: normalized.operations.map((operation) => operation.operationId),
      };
      await writeState(paths.statePath, {
        ...state,
        generation: state.generation + 1,
        activeTransaction: null,
        receiptsByRequestId: { ...state.receiptsByRequestId, [normalized.requestId]: receipt },
        requestIdByEffectDigest: { ...state.requestIdByEffectDigest, [normalized.effectDigest]: normalized.requestId },
        requestIdByOperationId: {
          ...state.requestIdByOperationId,
          ...Object.fromEntries(normalized.operations.map((operation) => [operation.operationId, normalized.requestId])),
        },
      }, cryptoPort);
      return result(true, 'RTK_FORMATTING_MULTI_SCENE_APPLIED', {
        status: 'applied', applied: true, replay: false, writerCalled, readback, receipt,
        recoveryOutcome: reconciliation.outcome,
      });
    } finally {
      await releaseProjectLease(paths.lockPath, lease.token).catch(() => {});
    }
  });
}

export function createRtkFormattingReturnCommandHandler(options = {}) {
  return async function handleRtkFormattingReturnCommand(payload = {}) {
    return applyMultiSceneFormattingReturnRuntime({
      ...payload,
      commandId: RTK_FORMATTING_RETURN_COMMAND_ID,
      callerRole: 'main',
      commandAuthority: {
        ...(isPlainObject(payload.commandAuthority) ? payload.commandAuthority : {}),
        issuer: 'main',
        intent: 'rtk.formattingApply',
        commandId: RTK_FORMATTING_RETURN_COMMAND_ID,
      },
    }, options);
  };
}
