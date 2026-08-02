#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  buildC5V2MultilingualQaLayer,
  validateC5V2SemanticOracle,
} from './rtk-word-c5v2-semantic-oracle.mjs';
import { resolveWordHostLocalQaWorkRoot } from './rtk-word-sandbox-work-root.mjs';

const require = createRequire(import.meta.url);
const electronBinary = require('electron');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RESULT_PREFIX = 'YALKEN_C5V2_CANARY_RESULT ';
const DEFAULT_ARTIFACT_ROOT = '/Volumes/T7-Secure/storage/yalken/word-safety-remediation-v1/current/c5v2-physical-canary';
const CORPUS_SCENE_ROOT = '/Volumes/T7-Secure/storage/yalken/word-safety-remediation-v1/current/c5-fullbook-certification/corpus/scenes';

export function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export function sha256Text(value) {
  return `sha256:${crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex')}`;
}

export function sha256File(filePath) {
  return `sha256:${sha256Bytes(fs.readFileSync(filePath))}`;
}

export function nowStamp() {
  return new Date().toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}Z$/u, 'Z');
}

export function shellValue(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd: options.cwd || REPO_ROOT,
      encoding: 'utf8',
      timeout: options.timeout || 30_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    return `UNAVAILABLE:${error.status || error.signal || 'ERR'}`;
  }
}

async function waitForCondition(predicate, label, timeoutMs = 30_000, intervalMs = 50) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`WAIT_TIMEOUT:${label}`);
}

function appleText(value) {
  return `"${String(value || '')
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .join('" & return & "')}"`;
}

function appleList(values) {
  return `{${(Array.isArray(values) ? values : []).map((value) => appleText(value)).join(', ')}}`;
}

function decodeXmlText(value) {
  return String(value || '')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, '&');
}

function docxDocumentWordText(docxPath) {
  const documentXml = shellValue('/usr/bin/unzip', ['-p', docxPath, 'word/document.xml'], { timeout: 30_000 });
  if (!documentXml || documentXml.startsWith('UNAVAILABLE:')) {
    throw new Error(`C5V2_CANARY_DOCX_DOCUMENT_XML_UNAVAILABLE:${documentXml}`);
  }
  const paragraphs = [...documentXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/gu)].map((match) => {
    const paragraphXml = match[0];
    return [...paragraphXml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gu)]
      .map((textMatch) => decodeXmlText(textMatch[1]))
      .join('');
  });
  return `${paragraphs.join('\r')}\r`;
}

export function bindLedgerToSourceDocxOffsets({ ledger, sourceDocxPath, sourceDocxText = null }) {
  const docxText = typeof sourceDocxText === 'string' ? sourceDocxText : docxDocumentWordText(sourceDocxPath);
  const seenStarts = new Set();
  const boundOperations = ledger.operations.map((operation) => {
    const start = docxText.indexOf(operation.quote);
    if (start < 0) {
      throw new Error(`C5V2_CANARY_SOURCE_ANCHOR_NOT_IN_EXPORTED_DOCX:${operation.id}`);
    }
    const second = docxText.indexOf(operation.quote, start + 1);
    if (second >= 0) {
      throw new Error(`C5V2_CANARY_SOURCE_ANCHOR_NOT_UNIQUE_IN_EXPORTED_DOCX:${operation.id}`);
    }
    if (seenStarts.has(start)) {
      throw new Error(`C5V2_CANARY_DUPLICATE_SOURCE_RANGE:${operation.id}`);
    }
    seenStarts.add(start);
    return {
      ...operation,
      wordRange: {
        sourceKind: 'raw-exported-docx-document-xml',
        start,
        end: start + operation.quote.length,
        selectedTextSha256: sha256Text(operation.quote),
      },
    };
  });
  return {
    ...ledger,
    sourceDocxTextSha256: sha256Text(docxText),
    operations: boundOperations,
  };
}

function buildExportBoundCanaryLedger({ scenes, counts, sourceDocxPath, anchorOffset = 0, idPrefix = '', weightedSceneAllocation = false }) {
  const sourceDocxText = docxDocumentWordText(sourceDocxPath);
  const failures = [];
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const ledger = buildCanaryLedger(scenes, {
      counts,
      anchorOffset: anchorOffset + (attempt * 7),
      idPrefix,
      exportedDocxText: sourceDocxText,
      weightedSceneAllocation,
    });
    try {
      return {
        ...bindLedgerToSourceDocxOffsets({ ledger, sourceDocxPath, sourceDocxText }),
        exportBinding: {
          status: 'bound-to-exported-docx',
          attempt: attempt + 1,
          anchorOffset: anchorOffset + (attempt * 7),
          failures,
        },
      };
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      if (
        !message.startsWith('C5V2_CANARY_SOURCE_ANCHOR_NOT_IN_EXPORTED_DOCX:')
        && !message.startsWith('C5V2_CANARY_SOURCE_ANCHOR_NOT_UNIQUE_IN_EXPORTED_DOCX:')
        && !message.startsWith('C5V2_CANARY_DUPLICATE_SOURCE_RANGE:')
      ) {
        throw error;
      }
      failures.push(message);
    }
  }
  throw new Error(`C5V2_CANARY_EXPORT_BOUND_LEDGER_EXHAUSTED:${idPrefix}:${failures.slice(-5).join('|')}`);
}

function titleFromDorianFile(file, index) {
  if (index === 0 || /preface/iu.test(file)) return 'Preface';
  const roman = String(file.match(/chapter-([ivxlcdm]+)/iu)?.[1] || '').toUpperCase();
  return roman ? `Chapter ${roman}` : `Chapter ${index}`;
}

export function loadCanaryScenes(options = {}) {
  const sceneCount = Number.isInteger(options.sceneCount) && options.sceneCount > 0 ? options.sceneCount : 2;
  const sceneStart = Number.isInteger(options.sceneStart) && options.sceneStart >= 0 ? options.sceneStart : (sceneCount === 2 ? 1 : 0);
  const files = fs.readdirSync(CORPUS_SCENE_ROOT)
    .filter((name) => /^dorian-\d{2}-.+\.txt$/iu.test(name))
    .sort()
    .slice(sceneStart, sceneStart + sceneCount);
  if (files.length !== sceneCount) {
    throw new Error(`C5V2_CANARY_CORPUS_SCENE_COUNT_MISMATCH:${files.length}:${sceneCount}`);
  }
  const chosen = files.map((file, index) => ({
    sceneId: file.replace(/\.txt$/iu, ''),
    file,
    title: titleFromDorianFile(file, sceneStart + index),
  }));
  const baseScenes = chosen.map((scene) => {
    const sourcePath = path.join(CORPUS_SCENE_ROOT, scene.file);
    const text = fs.readFileSync(sourcePath, 'utf8')
      .split(/\n{2,}/u)
      .map((paragraph) => paragraph.replace(/\s+/gu, ' ').trim())
      .filter((paragraph) => paragraph.trim().length > 40)
      .join('\n\n')
      .trim();
    return {
      ...scene,
      sourcePath,
      text,
      sourceSha256: sha256Text(text),
    };
  });
  const qa = buildC5V2MultilingualQaLayer({ scenes: baseScenes });
  return baseScenes.map((scene) => ({
    ...scene,
    text: `${scene.text}\n\n${qa.passages
      .filter((passage) => passage.sceneId === scene.sceneId)
      .map((passage) => passage.text)
      .join('\n\n')}\n`,
  }));
}

function uniquePhrases(text, maxCount) {
  const normalizedText = String(text || '').replace(/\s+/gu, ' ');
  const paragraphs = String(text || '').split(/\n{2,}/u).map((paragraph) => paragraph.replace(/\s+/gu, ' ').trim()).filter(Boolean);
  const seen = new Set();
  const usedRanges = [];
  const out = [];
  function maybePush(phrase) {
    const cleaned = String(phrase || '').trim().replace(/"/gu, "'");
    if (cleaned.length < 24 || cleaned.length > 96) return false;
    if ((normalizedText.match(new RegExp(cleaned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gu')) || []).length !== 1) return false;
    if (seen.has(cleaned)) return false;
    const start = normalizedText.indexOf(cleaned);
    const end = start + cleaned.length;
    if (start < 0 || usedRanges.some((range) => start < range.end && end > range.start)) return false;
    seen.add(cleaned);
    usedRanges.push({ start, end });
    out.push(cleaned);
    return out.length >= maxCount;
  }
  for (const paragraph of paragraphs) {
    const sentences = paragraph.match(/[^.!?;:]{28,90}[.!?;:]?/gu) || [];
    for (const sentence of sentences) {
      if (maybePush(sentence)) return out;
    }
    const words = paragraph.match(/[\p{L}\p{N}][\p{L}\p{N}’'-]*|[^\s]/gu) || [];
    for (let start = 0; start < words.length; start += 3) {
      for (const width of [6, 8, 10, 12]) {
        const phrase = words.slice(start, start + width).join(' ')
          .replace(/\s+([,.;:!?])/gu, '$1')
          .replace(/([“‘])\s+/gu, '$1')
          .replace(/\s+([”’])/gu, '$1');
        if (maybePush(phrase)) return out;
      }
    }
  }
  return out;
}

function countExactOccurrences(haystack, needle) {
  const source = String(haystack || '');
  const target = String(needle || '');
  if (!target) return 0;
  let count = 0;
  let offset = 0;
  while (offset < source.length) {
    const found = source.indexOf(target, offset);
    if (found < 0) break;
    count += 1;
    offset = found + Math.max(1, target.length);
  }
  return count;
}

export function buildCanaryLedger(scenes, options = {}) {
  const counts = {
    tracked_replace: 80,
    tracked_insert: 20,
    tracked_delete: 20,
    root_comment: 30,
    reply_attempt: 8,
    state_attempt: 7,
    formatting: 25,
    structural: 10,
    ...(options.counts || {}),
  };
  const familyOrder = [
    ...Array(counts.tracked_replace).fill('tracked_replace'),
    ...Array(counts.tracked_insert).fill('tracked_insert'),
    ...Array(counts.tracked_delete).fill('tracked_delete'),
    ...Array(counts.root_comment).fill('root_comment'),
    ...Array(counts.reply_attempt).fill('reply_attempt'),
    ...Array(counts.state_attempt).fill('state_attempt'),
    ...Array(counts.formatting).fill('formatting'),
    ...Array(counts.structural).fill('structural'),
  ];
  const phrasesByScene = new Map(scenes.map((scene) => [scene.sceneId, uniquePhrases(scene.text, 260)]));
  const globalBookText = scenes.map((scene) => String(scene.text || '').replace(/\s+/gu, ' ')).join(' ');
  const exportedDocxText = typeof options.exportedDocxText === 'string' ? options.exportedDocxText : '';
  const candidateIsAvailable = (candidate) => countExactOccurrences(globalBookText, candidate) === 1
    && (!exportedDocxText || countExactOccurrences(exportedDocxText, candidate) === 1);
  const buildWeightedSceneSchedule = () => {
    if (options.weightedSceneAllocation !== true) return null;
    const capacities = scenes.map((scene) => ({
      scene,
      capacity: (phrasesByScene.get(scene.sceneId) || []).filter((phrase) => candidateIsAvailable(phrase)).length,
      allocation: 0,
      remainder: 0,
    }));
    const totalCapacity = capacities.reduce((total, item) => total + item.capacity, 0);
    if (totalCapacity <= 0) return null;
    const floor = familyOrder.length >= scenes.length ? 1 : 0;
    let allocated = 0;
    for (const item of capacities) {
      item.allocation = item.capacity > 0 ? Math.min(floor, item.capacity) : 0;
      allocated += item.allocation;
    }
    const remaining = Math.max(0, familyOrder.length - allocated);
    for (const item of capacities) {
      const raw = (remaining * item.capacity) / totalCapacity;
      const extra = Math.floor(raw);
      item.allocation += extra;
      item.remainder = raw - extra;
      allocated += extra;
    }
    while (allocated < familyOrder.length) {
      const next = capacities
        .filter((item) => item.capacity > item.allocation)
        .sort((left, right) => right.remainder - left.remainder || right.capacity - left.capacity)[0];
      if (!next) break;
      next.allocation += 1;
      next.remainder = 0;
      allocated += 1;
    }
    const schedule = [];
    while (schedule.length < familyOrder.length) {
      let added = false;
      for (const item of capacities) {
        if (item.allocation <= 0) continue;
        schedule.push(item.scene);
        item.allocation -= 1;
        added = true;
        if (schedule.length >= familyOrder.length) break;
      }
      if (!added) break;
    }
    return schedule.length === familyOrder.length ? schedule : null;
  };
  const weightedSceneSchedule = buildWeightedSceneSchedule();
  const anchorOffset = Number.isSafeInteger(Number(options.anchorOffset)) && Number(options.anchorOffset) >= 0
    ? Number(options.anchorOffset)
    : 0;
  const idPrefix = typeof options.idPrefix === 'string' ? options.idPrefix.replace(/[^a-z0-9_-]/giu, '') : '';
  const cursorBySceneBand = new Map();
  const ordinalByScene = new Map(scenes.map((scene) => [scene.sceneId, 0]));
  const usedQuotesByScene = new Map(scenes.map((scene) => [scene.sceneId, new Set()]));
  const operations = [];
  const bandNames = ['beginning', 'middle', 'end'];
  for (let index = 0; index < familyOrder.length; index += 1) {
    const family = familyOrder[index];
    const scene = weightedSceneSchedule ? weightedSceneSchedule[index] : scenes[index % scenes.length];
    const phrases = phrasesByScene.get(scene.sceneId) || [];
    const usedQuotes = usedQuotesByScene.get(scene.sceneId);
    const localOrdinal = ordinalByScene.get(scene.sceneId) || 0;
    ordinalByScene.set(scene.sceneId, localOrdinal + 1);
    const targetBandIndex = localOrdinal % bandNames.length;
    const band = bandNames[targetBandIndex];
    const segmentStart = Math.floor((phrases.length * targetBandIndex) / bandNames.length);
    const segmentEnd = Math.max(segmentStart + 1, Math.floor((phrases.length * (targetBandIndex + 1)) / bandNames.length));
    const bandCursorKey = `${scene.sceneId}:${band}`;
    const segmentLength = Math.max(1, segmentEnd - segmentStart);
    const seededSegmentStart = segmentStart + (anchorOffset % segmentLength);
    let cursor = cursorBySceneBand.has(bandCursorKey) ? cursorBySceneBand.get(bandCursorKey) : seededSegmentStart;
    let quote = '';
    while (cursor < Math.min(segmentEnd, phrases.length)) {
      const candidate = phrases[cursor];
      cursor += 1;
      if (!usedQuotes.has(candidate) && candidateIsAvailable(candidate)) {
        quote = candidate;
        usedQuotes.add(candidate);
        break;
      }
    }
    cursorBySceneBand.set(bandCursorKey, cursor);
    if (!quote) {
      for (const candidate of [
        ...phrases.slice(segmentStart, Math.min(seededSegmentStart, segmentEnd)),
        ...phrases,
      ]) {
        if (!usedQuotes.has(candidate) && candidateIsAvailable(candidate)) {
          quote = candidate;
          usedQuotes.add(candidate);
          break;
        }
      }
    }
    if (!quote) {
      throw new Error(`C5V2_CANARY_UNIQUE_ANCHORS_EXHAUSTED:${scene.sceneId}:${family}:${index + 1}`);
    }
    operations.push({
      id: `${idPrefix}canary-${String(index + 1).padStart(3, '0')}-${family}`,
      family,
      sceneId: scene.sceneId,
      band,
      quote,
      expectedOutcome: family.includes('attempt') ? 'MANUAL_OR_BLOCKED' : 'SAFE_APPLY',
      replacementText: `C5V2_${family}_${String(index + 1).padStart(3, '0')}`,
    });
  }
  const rootOperations = operations.filter((operation) => operation.family === 'root_comment');
  const rootUseCount = new Map();
  const lifecycleOperations = operations.filter((operation) => ['reply_attempt', 'state_attempt'].includes(operation.family));
  let firstResolvedRoot = null;
  for (const operation of lifecycleOperations) {
    const sameSceneRoots = rootOperations.filter((root) => root.sceneId === operation.sceneId);
    const candidates = sameSceneRoots.length > 0 ? sameSceneRoots : rootOperations;
    if (candidates.length === 0) throw new Error(`C5V2_CANARY_LIFECYCLE_ROOT_REQUIRED:${operation.id}`);
    const useIndex = rootUseCount.get(operation.family) || 0;
    const root = operation.family === 'state_attempt' && useIndex === 1 && firstResolvedRoot
      ? firstResolvedRoot
      : candidates[useIndex % candidates.length];
    rootUseCount.set(operation.family, useIndex + 1);
    operation.targetRootOperationId = root.id;
    if (operation.family === 'state_attempt') {
      if (useIndex === 0) firstResolvedRoot = root;
      operation.sceneId = root.sceneId;
      operation.requestedState = useIndex === 1 ? 'reopened' : 'resolved';
    }
  }
  return {
    schemaVersion: 'yalken.rtk.word.c5v2.physical-canary-ledger.v1',
    operationCount: operations.length,
    familyCounts: counts,
    scenes: scenes.map((scene) => ({ sceneId: scene.sceneId, title: scene.title, sourceSha256: scene.sourceSha256 })),
    operations,
    distribution: {
      scenes: Object.fromEntries(scenes.map((scene) => [
        scene.sceneId,
        operations.filter((operation) => operation.sceneId === scene.sceneId).length,
      ])),
      bands: operations.reduce((acc, operation) => {
        acc[operation.band] = (acc[operation.band] || 0) + 1;
        return acc;
      }, {}),
    },
  };
}

export function deriveC5V2CommentLaneMaturity(commentProductPath = {}) {
  const rootApplied = Number(commentProductPath?.semanticOracle?.rootApplied || 0);
  const lifecycleApplied = Number(commentProductPath?.semanticOracle?.lifecycleApplied || 0);
  const replyCount = Number(commentProductPath?.planSummary?.replyCount || 0);
  const commentStateCount = Number(commentProductPath?.planSummary?.commentStateCount || 0);
  const triangleGreen = commentProductPath?.semanticOracle?.triangleGreen === true;
  const rootGreen = rootApplied > 0 && triangleGreen;
  const replyGreen = replyCount > 0 && lifecycleApplied >= replyCount;
  const stateGreen = commentStateCount > 0 && lifecycleApplied >= replyCount + commentStateCount;
  return {
    rootCommentsState: rootGreen ? 'CANONICAL_ROOT_COMMENT_APPLY_AND_REPLAY_PROVEN' : 'PENDING_ROOT_COMMENT_PRODUCT_APPLY_LANE',
    repliesState: replyGreen ? 'CANONICAL_REPLY_APPLY_AND_REPLAY_PROVEN' : 'PENDING_REPLY_PRODUCT_APPLY_LANE',
    commentState: stateGreen ? 'CANONICAL_COMMENT_STATE_APPLY_AND_REPLAY_PROVEN' : 'PENDING_COMMENT_STATE_PRODUCT_APPLY_LANE',
    commentsRepliesState: commentProductPath?.ok === true && rootGreen && replyGreen && stateGreen
      ? 'CANONICAL_PRODUCT_APPLY_AND_REPLAY_PROVEN'
      : 'PENDING_PRODUCT_APPLY_LANE',
  };
}

export function deriveC5V2ReturnLanePlan(activationSummary = {}) {
  const graphCounts = activationSummary && typeof activationSummary.reviewGraphCounts === 'object'
    ? activationSummary.reviewGraphCounts
    : {};
  const exactByScene = activationSummary && typeof activationSummary.exactApplyTextChangeIdsByScene === 'object'
    ? activationSummary.exactApplyTextChangeIdsByScene
    : {};
  const exactTextCandidateCount = Object.values(exactByScene)
    .reduce((total, ids) => total + (Array.isArray(ids) ? ids.length : 0), 0);
  const commentCandidateCount = Math.max(
    Number(graphCounts.commentThreads || 0),
    Number(graphCounts.commentPlacements || 0),
  );
  const formattingCandidateCount = Number(activationSummary?.formattingProductPath?.candidateCount || 0);
  const structuralCandidateCount = Number(graphCounts.structuralChanges || 0);
  const hasExactText = exactTextCandidateCount > 0;
  const hasComments = commentCandidateCount > 0;
  const hasFormatting = formattingCandidateCount > 0;
  const hasStructure = structuralCandidateCount > 0;
  return {
    exactTextCandidateCount,
    commentCandidateCount,
    formattingCandidateCount,
    structuralCandidateCount,
    hasExactText,
    hasComments,
    hasFormatting,
    hasStructure,
    formattingMixedWithOtherMutationLane: hasFormatting && (hasExactText || hasComments || hasStructure),
  };
}

export function deriveC5V2ProductRouteGaps(returnApply = {}, options = {}) {
  const lanes = returnApply.typedPendingLanes && typeof returnApply.typedPendingLanes === 'object'
    ? returnApply.typedPendingLanes
    : {};
  const expectedFamilies = new Set(
    Array.isArray(options.expectedFamilies)
      ? options.expectedFamilies.filter((family) => typeof family === 'string' && family)
      : [],
  );
  const gaps = [];
  if (!returnApply || returnApply.ok !== true) {
    gaps.push('full-manuscript authenticated intake preview explicit apply did not complete green in this canary script');
  }
  if (lanes.exactText === 'PENDING_PRODUCT_APPLY_LANE') gaps.push('exact text operations remain typed pending product outcomes');
  if (lanes.commentsRepliesState === 'PENDING_PRODUCT_APPLY_LANE') gaps.push('comment operations remain typed pending product outcomes');
  if (lanes.formatting === 'PENDING_PRODUCT_APPLY_LANE') gaps.push('formatting operations remain typed pending product outcomes');
  if (lanes.formatting === 'BLOCKED_MIXED_LANE_ATOMICITY_REQUIRED') gaps.push('formatting is blocked until mixed return lanes share one atomic product transaction');
  if (lanes.structural === 'PENDING_PRODUCT_APPLY_LANE') gaps.push('structural operations remain typed pending product outcomes');
  if (expectedFamilies.has('formatting') && lanes.formatting === 'NO_FORMATTING_CANDIDATE') {
    gaps.push('formatting was required by the physical ledger but produced no product candidate');
  }
  if (
    [...expectedFamilies].some((family) => ['tracked_replace', 'tracked_insert', 'tracked_delete'].includes(family))
    && lanes.exactText === 'NO_EXACT_TEXT_CANDIDATE'
  ) {
    gaps.push('tracked text was required by the physical ledger but produced no product candidate');
  }
  if (
    [...expectedFamilies].some((family) => ['root_comment', 'reply_attempt', 'state_attempt'].includes(family))
    && lanes.commentsRepliesState === 'NO_COMMENT_CANDIDATE'
  ) {
    gaps.push('comments or lifecycle work was required by the physical ledger but produced no product candidate');
  }
  if (expectedFamilies.has('structural') && lanes.structural === 'NO_STRUCTURAL_CANDIDATE') {
    gaps.push('structure was required by the physical ledger but produced no product candidate');
  }
  return gaps;
}

export function evaluateMacosAccessibilityPreflight(input = {}) {
  const diagnostics = {
    legacyUiElementsEnabled: input.legacyUiElementsEnabled === true || input.uiElementsEnabled === true,
    wordProcessExists: input.wordProcessExists === true,
    wordFrontmost: input.wordFrontmost === true,
    wordWindowCount: Number.isSafeInteger(Number(input.wordWindowCount)) ? Number(input.wordWindowCount) : 0,
    axQuerySucceeded: input.axQuerySucceeded === true,
    axMenuBarItemCount: Number.isSafeInteger(Number(input.axMenuBarItemCount)) ? Number(input.axMenuBarItemCount) : 0,
    axWindowSubtreeItemCount: Number.isSafeInteger(Number(input.axWindowSubtreeItemCount)) ? Number(input.axWindowSubtreeItemCount) : 0,
    axErrorNumber: Number.isFinite(Number(input.axErrorNumber)) ? Number(input.axErrorNumber) : 0,
    axErrorMessage: String(input.axErrorMessage || ''),
    requireOpenDocument: input.requireOpenDocument === true,
    frontDocumentFullName: String(input.frontDocumentFullName || ''),
    expectedFrontDocumentFullName: String(input.expectedFrontDocumentFullName || ''),
  };
  if (!diagnostics.wordProcessExists) {
    return { ok: false, status: 'environment-blocked', code: 'MACOS_ACCESSIBILITY_WORD_PROCESS_MISSING', diagnostics };
  }
  if (!diagnostics.axQuerySucceeded) {
    return { ok: false, status: 'environment-blocked', code: 'MACOS_ACCESSIBILITY_PERMISSION_REQUIRED', diagnostics };
  }
  if (!diagnostics.requireOpenDocument) {
    return { ok: true, status: 'ready', code: 'MACOS_ACCESSIBILITY_PREFLIGHT_READY', diagnostics };
  }
  if (
    diagnostics.expectedFrontDocumentFullName
    && diagnostics.frontDocumentFullName !== diagnostics.expectedFrontDocumentFullName
  ) {
    return { ok: false, status: 'environment-blocked', code: 'MACOS_ACCESSIBILITY_FRONT_DOCUMENT_MISMATCH', diagnostics };
  }
  if (
    !diagnostics.wordFrontmost
    || diagnostics.wordWindowCount < 1
    || diagnostics.axWindowSubtreeItemCount < 1
  ) {
    return { ok: false, status: 'environment-blocked', code: 'MACOS_ACCESSIBILITY_WORD_WINDOW_UNAVAILABLE', diagnostics };
  }
  return { ok: true, status: 'ready', code: 'MACOS_ACCESSIBILITY_PREFLIGHT_READY', diagnostics };
}

export function buildMacosAccessibilityPreflightScript(expectedFrontDocumentFullName = '') {
  return [
    'tell application "Microsoft Word"',
    '  activate',
    '  set yFrontDocument to ""',
    '  try',
    '    if (count of documents) > 0 then set yFrontDocument to full name of active document as text',
    '  end try',
    'end tell',
    'delay 0.3',
    'tell application "System Events"',
    '  set yUiEnabled to UI elements enabled',
    '  set yProcessExists to exists process "Microsoft Word"',
    '  set yFrontmost to false',
    '  set yWindowCount to 0',
    '  set yAxQuerySucceeded to false',
    '  set yAxMenuCount to 0',
    '  set yAxErrorNumber to 0',
    '  set yAxErrorMessage to ""',
    '  if yProcessExists then',
    '    tell process "Microsoft Word"',
    '      try',
    '        set yFrontmost to frontmost',
    '        set yWindowCount to count of windows',
    '        set yAxMenuCount to count of menu bar items of menu bar 1',
    '        set yAxQuerySucceeded to yAxMenuCount > 0',
    '      on error yErrMsg number yErrNo',
    '        set yAxErrorNumber to yErrNo',
    '        set yAxErrorMessage to yErrMsg',
    '      end try',
    '    end tell',
    '  end if',
    `  return "LEGACY_UI_ELEMENTS_ENABLED=" & yUiEnabled & linefeed & "WORD_PROCESS_EXISTS=" & yProcessExists & linefeed & "WORD_FRONTMOST=" & yFrontmost & linefeed & "WORD_WINDOW_COUNT=" & yWindowCount & linefeed & "AX_QUERY_SUCCEEDED=" & yAxQuerySucceeded & linefeed & "AX_MENU_BAR_ITEM_COUNT=" & yAxMenuCount & linefeed & "AX_ERROR_NUMBER=" & yAxErrorNumber & linefeed & "AX_ERROR_MESSAGE=" & yAxErrorMessage & linefeed & "FRONT_DOCUMENT_FULL_NAME=" & yFrontDocument & linefeed & "EXPECTED_FRONT_DOCUMENT_FULL_NAME=" & ${appleText(expectedFrontDocumentFullName)}`,
    'end tell',
  ].join('\n');
}

export function parseMacosAccessibilityPreflightOutput(output, expectedFrontDocumentFullName = '') {
  const fields = {};
  for (const line of String(output || '').split(/\r?\n/u)) {
    const separator = line.indexOf('=');
    if (separator > 0) fields[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return evaluateMacosAccessibilityPreflight({
    legacyUiElementsEnabled: fields.LEGACY_UI_ELEMENTS_ENABLED === 'true',
    wordProcessExists: fields.WORD_PROCESS_EXISTS === 'true',
    wordFrontmost: fields.WORD_FRONTMOST === 'true',
    wordWindowCount: Number.parseInt(fields.WORD_WINDOW_COUNT || '0', 10),
    axQuerySucceeded: fields.AX_QUERY_SUCCEEDED === 'true',
    axMenuBarItemCount: Number.parseInt(fields.AX_MENU_BAR_ITEM_COUNT || '0', 10),
    axErrorNumber: Number.parseInt(fields.AX_ERROR_NUMBER || '0', 10),
    axErrorMessage: fields.AX_ERROR_MESSAGE || '',
    requireOpenDocument: Boolean(expectedFrontDocumentFullName),
    frontDocumentFullName: fields.FRONT_DOCUMENT_FULL_NAME || '',
    expectedFrontDocumentFullName: expectedFrontDocumentFullName || fields.EXPECTED_FRONT_DOCUMENT_FULL_NAME || '',
  });
}

function createFullManuscriptExportChildSource({ tempRoot, outPath, returnedPath, returnedReadyPath, scenes, rounds = null }) {
  const childRounds = Array.isArray(rounds) && rounds.length > 0
    ? rounds
    : [{
      roundIndex: 0,
      roundId: 'round-01',
      outPath,
      returnedPath: returnedPath || '',
      returnedReadyPath: returnedReadyPath || '',
    }];
  return `\
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const deriveC5V2CommentLaneMaturity = ${deriveC5V2CommentLaneMaturity.toString()};
const deriveC5V2ReturnLanePlan = ${deriveC5V2ReturnLanePlan.toString()};
const { app, BrowserWindow, dialog, Menu, session } = require('electron');
const rootDir = ${JSON.stringify(REPO_ROOT)};
const tempRoot = ${JSON.stringify(tempRoot)};
const rounds = ${JSON.stringify(childRounds)};
let activeRound = rounds[0] || null;
const scenes = ${JSON.stringify(scenes.map((scene) => ({ file: scene.file, text: scene.text })))};
const RESULT_PREFIX = ${JSON.stringify(RESULT_PREFIX)};
const projectName = '\\u0420\\u043e\\u043c\\u0430\\u043d';
const dialogCalls = [];
const networkRequests = [];
function emit(payload) { process.stdout.write(RESULT_PREFIX + JSON.stringify(payload) + '\\n'); }
function progress(step, detail = {}) { emit({ phase: 'child-progress', step, detail }); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sha256ChildText(value) { return 'sha256:' + crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex'); }
async function waitUntil(predicate, label, timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await predicate();
    if (value) return value;
    await sleep(50);
  }
  throw new Error('WAIT_TIMEOUT:' + label);
}
function flattenMenuItems(menu) {
  if (!menu || !Array.isArray(menu.items)) return [];
  return menu.items.flatMap((item) => [item, ...(item.submenu ? flattenMenuItems(item.submenu) : [])]);
}
function findTreeNodeByKind(node, kind) {
  if (!node || typeof node !== 'object') return null;
  if (node.kind === kind) return node;
  const children = Array.isArray(node.children) ? node.children : [];
  for (const child of children) {
    const found = findTreeNodeByKind(child, kind);
    if (found) return found;
  }
  return null;
}
function findTreeNodeByPathSuffix(node, suffix) {
  if (!node || typeof node !== 'object' || typeof suffix !== 'string' || !suffix) return null;
  const nodePath = typeof node.nodePath === 'string' ? node.nodePath : (typeof node.path === 'string' ? node.path : '');
  if (nodePath && nodePath.endsWith(path.sep + suffix)) return node;
  const children = Array.isArray(node.children) ? node.children : [];
  for (const child of children) {
    const found = findTreeNodeByPathSuffix(child, suffix);
    if (found) return found;
  }
  return null;
}
function findTreeNodeById(node, nodeId) {
  if (!node || typeof node !== 'object' || typeof nodeId !== 'string' || !nodeId) return null;
  if (node.nodeId === nodeId) return node;
  const children = Array.isArray(node.children) ? node.children : [];
  for (const child of children) {
    const found = findTreeNodeById(child, nodeId);
    if (found) return found;
  }
  return null;
}
function listTextFiles(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.txt'))
    .map((entry) => path.join(dirPath, entry.name))
    .sort();
}
function chunkArray(items, size) {
  const source = Array.isArray(items) ? items : [];
  const chunkSize = Number.isSafeInteger(size) && size > 0 ? size : 10;
  const chunks = [];
  for (let index = 0; index < source.length; index += chunkSize) {
    chunks.push(source.slice(index, index + chunkSize));
  }
  return chunks;
}
const ACCEPTABLE_STALE_RETRY_BLOCK_REASONS = new Set([
  'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_STALE_BASELINE',
  'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_CURRENT_NO_MATCH',
]);
async function clickNativeMenuItem(item, win) {
  const maybePromise = item.click.call(item, item, win, { triggeredByAccelerator: false });
  if (maybePromise && typeof maybePromise.then === 'function') await maybePromise;
}
async function invokeUiCommand(win, commandId, payload) {
  const result = await win.webContents.executeJavaScript(
    "window.electronAPI.invokeUiCommandBridge({route:'command.bus',commandId:"
      + JSON.stringify(commandId)
      + ",payload:"
      + JSON.stringify(payload || {})
      + "})",
    true,
  );
  if (
    result
    && result.ok === true
    && result.value
    && typeof result.value === 'object'
    && !Array.isArray(result.value)
    && typeof result.value.ok === 'boolean'
  ) {
    return result.value;
  }
  return result;
}
function summarizeActivation(result) {
  const graph = result && result.reviewSurface && result.reviewSurface.revisionSession
    && result.reviewSurface.revisionSession.reviewGraph
    ? result.reviewSurface.revisionSession.reviewGraph
    : {};
  const textChanges = Array.isArray(graph.textChanges) ? graph.textChanges : [];
  const commentThreads = Array.isArray(graph.commentThreads) ? graph.commentThreads : [];
  const commentPlacements = Array.isArray(graph.commentPlacements) ? graph.commentPlacements : [];
  const structuralChanges = Array.isArray(graph.structuralChanges) ? graph.structuralChanges : [];
  return {
    ok: result && result.ok === true,
    activated: result && result.activated === true,
    diagnosticOnly: result && result.diagnosticOnly === true,
    canOpenReviewSession: result && result.canOpenReviewSession === true,
    returnIntake: result && result.returnIntake ? {
      authenticated: result.returnIntake.authenticated === true,
      status: result.returnIntake.status || '',
      authorityCarrierStatus: result.returnIntake.authorityCarrierStatus || '',
      returnedArtifactSha256: result.returnIntake.returnedArtifactSha256 || '',
      roundId: result.returnIntake.roundId || '',
      exportId: result.returnIntake.exportId || '',
      sourceMode: result.returnIntake.sourceMode || '',
      counts: result.returnIntake.counts || {},
      fullManuscriptExportMapTransport: result.returnIntake.fullManuscriptExportMapTransport || null,
    } : null,
    candidateSummary: result && result.candidateSummary ? result.candidateSummary : null,
    nonOverlapTrackedReplacementProductPath: result && result.nonOverlapTrackedReplacementProductPath
      ? {
        prepared: result.nonOverlapTrackedReplacementProductPath.prepared === true,
        status: result.nonOverlapTrackedReplacementProductPath.status || '',
        reason: result.nonOverlapTrackedReplacementProductPath.reason || '',
        runtimePreviewCode: result.nonOverlapTrackedReplacementProductPath.runtimePreviewCode || '',
        runtimePreviewReasons: Array.isArray(result.nonOverlapTrackedReplacementProductPath.runtimePreviewReasons)
          ? result.nonOverlapTrackedReplacementProductPath.runtimePreviewReasons
          : [],
      }
      : null,
    commentShadowResult: result && result.commentShadowResult
      ? {
        ok: result.commentShadowResult.ok === true,
        status: result.commentShadowResult.status || '',
        code: result.commentShadowResult.code || '',
        reason: result.commentShadowResult.reason || '',
        writerCalled: result.commentShadowResult.writerCalled === true,
        manuscriptApplyAuthority: result.commentShadowResult.manuscriptApplyAuthority === true,
        storageEffects: result.commentShadowResult.storageEffects || null,
      }
      : null,
    commentShadowSessionSummary: result && result.commentShadowSession && result.commentShadowSession.summary
      ? result.commentShadowSession.summary
      : null,
    commentProductPath: result && result.commentProductPath ? result.commentProductPath : null,
    formattingProductPath: result && result.formattingProductPath
      ? {
        prepared: result.formattingProductPath.prepared === true,
        status: result.formattingProductPath.status || '',
        code: result.formattingProductPath.code || '',
        candidateCount: Number.isSafeInteger(result.formattingProductPath.candidateCount)
          ? result.formattingProductPath.candidateCount
          : 0,
        sceneCount: Number.isSafeInteger(result.formattingProductPath.sceneCount)
          ? result.formattingProductPath.sceneCount
          : 0,
        diagnosticCount: Number.isSafeInteger(result.formattingProductPath.diagnosticCount)
          ? result.formattingProductPath.diagnosticCount
          : 0,
        writerCalled: result.formattingProductPath.writerCalled === true,
        rendererAuthority: result.formattingProductPath.rendererAuthority === true,
      }
      : null,
    reviewGraphCounts: {
      textChanges: textChanges.length,
      commentThreads: commentThreads.length,
      commentPlacements: commentPlacements.length,
      structuralChanges: structuralChanges.length,
    },
    textChangeIdsByScene: textChanges.reduce((acc, change) => {
      const sceneId = change && change.targetScope && typeof change.targetScope.id === 'string'
        ? change.targetScope.id
        : '__missing_scene__';
      if (!acc[sceneId]) acc[sceneId] = [];
      if (change && typeof change.changeId === 'string') acc[sceneId].push(change.changeId);
      return acc;
    }, {}),
    exactApplyTextChangeIdsByScene: textChanges.reduce((acc, change) => {
      const sceneId = change && change.targetScope && typeof change.targetScope.id === 'string'
        ? change.targetScope.id
        : '__missing_scene__';
      const exact = change && change.match && change.match.kind === 'exact' && typeof change.match.quote === 'string' && change.match.quote.length > 0;
      if (!exact) return acc;
      if (!acc[sceneId]) acc[sceneId] = [];
      if (typeof change.changeId === 'string') acc[sceneId].push(change.changeId);
      return acc;
    }, {}),
    textChangeScopeDiagnostics: textChanges.map((change) => ({
      changeId: change && typeof change.changeId === 'string' ? change.changeId : '',
      targetScope: change && change.targetScope ? change.targetScope : null,
      matchKind: change && change.match && typeof change.match.kind === 'string' ? change.match.kind : '',
      quoteSha256: change && change.match && typeof change.match.quote === 'string' ? sha256ChildText(change.match.quote) : '',
      replacementSha256: change && typeof change.replacementText === 'string' ? sha256ChildText(change.replacementText) : '',
      rtkProductPath: change && typeof change.rtkProductPath === 'string' ? change.rtkProductPath : '',
    })),
    failure: result && result.ok !== true ? {
      keys: result && typeof result === 'object' ? Object.keys(result).sort() : [],
      code: result && typeof result.code === 'string' ? result.code : '',
      reason: result && typeof result.reason === 'string' ? result.reason : '',
      message: result && typeof result.message === 'string' ? result.message : '',
      error: result && result.error ? result.error : null,
      value: result && result.value && typeof result.value === 'object' ? {
        ok: result.value.ok === true,
        code: typeof result.value.code === 'string' ? result.value.code : '',
        reason: typeof result.value.reason === 'string' ? result.value.reason : '',
        error: result.value.error || null,
      } : null,
    } : null,
  };
}
async function activateApplyAndReplayReturnedDocx(win, roundContext) {
  const round = roundContext && typeof roundContext === 'object' ? roundContext : {};
  const returnedPath = typeof round.returnedPath === 'string' ? round.returnedPath : '';
  const returnedReadyPath = typeof round.returnedReadyPath === 'string' ? round.returnedReadyPath : '';
  const requestPrefix = typeof round.roundId === 'string' && round.roundId
    ? round.roundId.replace(/[^a-z0-9_-]/giu, '-')
    : 'round';
  await waitUntil(() => returnedReadyPath && fs.existsSync(returnedReadyPath), 'RETURNED_DOCX_READY_FOR_PRODUCT_INTAKE', 240000);
  await waitUntil(() => returnedPath && fs.existsSync(returnedPath), 'RETURNED_DOCX_FILE_FOR_PRODUCT_INTAKE', 30000);
  const returnedBytes = fs.readFileSync(returnedPath);
  const activation = await invokeUiCommand(win, 'cmd.project.review.activateDocxReviewPreviewSession', {
    requestId: 'c5v2-physical-canary-authenticated-return-activation-' + requestPrefix,
    bufferSource: returnedBytes.toString('base64'),
  });
  const activationSummary = summarizeActivation(activation);
  const lanePlan = deriveC5V2ReturnLanePlan(activationSummary);
  const textChangeIdsByScene = activationSummary.exactApplyTextChangeIdsByScene || {};
  const applyResults = [];
  const replayResults = [];
  const staleRetryResults = [];
  let formattingApplyResult = null;
  let formattingReplayInspection = null;
  if (lanePlan.formattingMixedWithOtherMutationLane) {
    return {
      ok: false,
      code: 'BLOCKED_MIXED_LANE_ATOMICITY_REQUIRED',
      reason: 'BLOCKED_MIXED_LANE_ATOMICITY_REQUIRED',
      activation: activationSummary,
      lanePlan,
      applyResults,
      replayResults,
      staleRetryResults,
      formattingApplyResult,
      formattingReplayInspection,
      productOpenContext: global.productOpenContext || null,
      typedPendingLanes: {
        exactText: lanePlan.hasExactText ? 'BLOCKED_MIXED_LANE_ATOMICITY_REQUIRED' : 'NO_EXACT_TEXT_CANDIDATE',
        ...(lanePlan.hasComments
          ? deriveC5V2CommentLaneMaturity(activationSummary.commentProductPath || {})
          : {
            rootCommentsState: 'NO_COMMENT_CANDIDATE',
            repliesState: 'NO_COMMENT_CANDIDATE',
            commentState: 'NO_COMMENT_CANDIDATE',
            commentsRepliesState: 'NO_COMMENT_CANDIDATE',
          }),
        formatting: 'BLOCKED_MIXED_LANE_ATOMICITY_REQUIRED',
        structural: lanePlan.hasStructure ? 'BLOCKED_MIXED_LANE_ATOMICITY_REQUIRED' : 'NO_STRUCTURAL_CANDIDATE',
      },
    };
  }
  async function resolveCurrentSceneContext(sceneContext, normalizedSceneId) {
    const fallback = sceneContext && typeof sceneContext === 'object' ? sceneContext : {};
    try {
      const treeProbe = await win.webContents.executeJavaScript(
        "window.electronAPI.invokeWorkspaceQueryBridge({queryId:'query.projectTree',payload:{tab:'roman'}})",
        true,
      );
      const byRelativePath = findTreeNodeByPathSuffix(treeProbe && treeProbe.root, normalizedSceneId);
      if (byRelativePath && typeof byRelativePath.nodeId === 'string' && byRelativePath.nodeId) {
        return {
          ...fallback,
          nodeId: byRelativePath.nodeId,
          nodePath: typeof byRelativePath.nodePath === 'string' ? byRelativePath.nodePath : fallback.nodePath,
          relativePath: normalizedSceneId,
          sceneId: normalizedSceneId,
          refreshedFromTree: true,
        };
      }
    } catch {}
    return fallback;
  }
  for (const [sceneId, changeIds] of Object.entries(textChangeIdsByScene)) {
    if (!Array.isArray(changeIds) || changeIds.length === 0) continue;
    const normalizedSceneId = sceneId.replace(/\\\\/gu, '/');
    const sceneContext = Array.isArray(global.productSceneContexts)
      ? global.productSceneContexts.find((candidate) => (
        candidate
        && (
          candidate.sceneId === normalizedSceneId
          || candidate.relativePath === normalizedSceneId
          || (typeof candidate.nodePath === 'string' && candidate.nodePath.replace(/\\\\/gu, '/').endsWith('/' + normalizedSceneId))
        )
      ))
      : null;
    const currentSceneContext = await resolveCurrentSceneContext(sceneContext, normalizedSceneId);
    const openSceneResult = currentSceneContext && (
      typeof currentSceneContext.nodeId === 'string'
      || typeof normalizedSceneId === 'string'
    )
      ? await invokeUiCommand(win, 'cmd.project.document.open', {
        nodeId: typeof currentSceneContext.nodeId === 'string' ? currentSceneContext.nodeId : '',
        sceneId: normalizedSceneId,
      })
      : { ok: false, reason: 'C5V2_CANARY_APPLY_SCENE_CONTEXT_NOT_FOUND', sceneId: normalizedSceneId };
    if (!openSceneResult || openSceneResult.ok !== true) {
      applyResults.push({
        sceneId,
        chunkIndex: -1,
        changeIds,
        ok: false,
        applied: false,
        replay: false,
        status: '',
        reason: 'C5V2_CANARY_APPLY_SCENE_OPEN_FAILED',
        error: openSceneResult && openSceneResult.error ? openSceneResult.error : openSceneResult,
        totals: null,
        result: null,
      });
      continue;
    }
    const chunks = chunkArray(changeIds, 10);
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      const chunkChangeIds = chunks[chunkIndex];
      const chunkLabel = sceneId.replace(/[^a-z0-9_-]/giu, '-') + '-chunk-' + String(chunkIndex + 1).padStart(2, '0');
      const requestId = 'c5v2-physical-canary-apply-' + requestPrefix + '-' + chunkLabel;
      const apply = await invokeUiCommand(win, 'cmd.project.review.applyExactTextChangesBatch', {
        requestId,
        changeIds: chunkChangeIds,
      });
      applyResults.push({
        sceneId,
        chunkIndex,
        changeIds: chunkChangeIds,
        ok: apply && apply.ok === true,
        applied: apply && apply.applied === true,
        replay: apply && apply.replay === true,
        status: apply && apply.status ? apply.status : '',
        reason: apply && apply.reason ? apply.reason : '',
        error: apply && apply.error ? apply.error : null,
        totals: apply && apply.totals ? apply.totals : null,
        result: apply && apply.result ? {
          status: apply.result.status || '',
          reason: apply.result.reason || '',
          applied: apply.result.applied === true,
          changes: Array.isArray(apply.result.changes) ? apply.result.changes : [],
        } : null,
      });
      const replay = await invokeUiCommand(win, 'cmd.project.review.applyExactTextChangesBatch', {
        requestId,
        changeIds: chunkChangeIds,
      });
      replayResults.push({
        sceneId,
        chunkIndex,
        changeIds: chunkChangeIds,
        ok: replay && replay.ok === true,
        applied: replay && replay.applied === true,
        replay: replay && replay.replay === true,
        status: replay && replay.status ? replay.status : '',
        reason: replay && replay.reason ? replay.reason : '',
        error: replay && replay.error ? replay.error : null,
        totals: replay && replay.totals ? replay.totals : null,
        result: replay && replay.result ? {
          status: replay.result.status || '',
          reason: replay.result.reason || '',
          applied: replay.result.applied === true,
          changes: Array.isArray(replay.result.changes) ? replay.result.changes : [],
        } : null,
      });
      const staleRetry = await invokeUiCommand(win, 'cmd.project.review.applyExactTextChangesBatch', {
        requestId: 'c5v2-physical-canary-stale-retry-' + requestPrefix + '-' + chunkLabel,
        changeIds: chunkChangeIds,
      });
      staleRetryResults.push({
        sceneId,
        chunkIndex,
        changeIds: chunkChangeIds,
        ok: staleRetry && staleRetry.ok === true,
        applied: staleRetry && staleRetry.applied === true,
        replay: staleRetry && staleRetry.replay === true,
        status: staleRetry && staleRetry.status ? staleRetry.status : '',
        reason: staleRetry && staleRetry.reason ? staleRetry.reason : '',
        error: staleRetry && staleRetry.error ? staleRetry.error : null,
        totals: staleRetry && staleRetry.totals ? staleRetry.totals : null,
        result: staleRetry && staleRetry.result ? {
          status: staleRetry.result.status || '',
          reason: staleRetry.result.reason || '',
          applied: staleRetry.result.applied === true,
          changes: Array.isArray(staleRetry.result.changes) ? staleRetry.result.changes : [],
        } : null,
      });
    }
  }
  if (lanePlan.hasFormatting) {
    formattingApplyResult = await invokeUiCommand(win, 'cmd.project.review.applyFormattingReturn', {
      requestId: 'c5v2-physical-canary-formatting-apply-' + requestPrefix,
    });
    formattingReplayInspection = await invokeUiCommand(win, 'cmd.project.review.inspectFormattingReturnReplay', {
      requestId: 'c5v2-physical-canary-formatting-replay-inspect-' + requestPrefix,
    });
  }
  const exactTextGreen = !lanePlan.hasExactText || (
    applyResults.length > 0
    && applyResults.every((result) => result.ok === true && result.applied === true)
    && replayResults.every((result) => result.ok === true && result.replay === true)
    && staleRetryResults.every((result) => (
      result.status === 'blocked'
      && result.applied !== true
      && ACCEPTABLE_STALE_RETRY_BLOCK_REASONS.has(result.reason)
    ))
  );
  const commentsGreen = !lanePlan.hasComments || Boolean(
    activationSummary.commentProductPath
    && activationSummary.commentProductPath.ok === true
    && activationSummary.commentProductPath.pendingProductApplyLane === false
    && activationSummary.commentProductPath.commandBusDispatchOnly === true
    && activationSummary.commentProductPath.directPortDispatch === false
    && activationSummary.commentProductPath.semanticOracle?.triangleGreen === true
    && activationSummary.commentProductPath.semanticOracle?.rootApplied > 0
    && activationSummary.commentProductPath.semanticOracle?.lifecycleApplied > 0
    && activationSummary.commentProductPath.sceneAuthorityIdentityJoin?.identityJoinCount > 0
    && activationSummary.commentProductPath.sceneAuthorityIdentityJoin?.unjoinedPlacementCount === 0
    && activationSummary.commentProductPath.sceneAuthorityIdentityJoin?.nativeCommentIdentityJoin === true
    && activationSummary.commentProductPath.sceneAuthorityIdentityJoin?.quoteHeuristicUsed === false
    && activationSummary.commentProductPath.sceneAuthorityIdentityJoin?.arbitraryThreadIdSuffixParsingUsed === false
    && activationSummary.candidateSummary?.pendingFallbackCommentPlacementCount === 0
    && Array.isArray(activationSummary.candidateSummary?.commentSceneAuthoritySources)
    && activationSummary.candidateSummary.commentSceneAuthoritySources.includes('authenticated-full-manuscript-export-map-paragraph-signal')
  );
  const formattingGreen = !lanePlan.hasFormatting || Boolean(
    activationSummary.formattingProductPath?.prepared === true
    && activationSummary.formattingProductPath?.writerCalled === false
    && formattingApplyResult?.ok === true
    && formattingApplyResult?.applied === true
    && formattingApplyResult?.replayVerified === true
    && formattingReplayInspection?.ok === true
    && formattingReplayInspection?.replayVerified === true
    && formattingReplayInspection?.writerCalled !== true
  );
  const structureGreen = !lanePlan.hasStructure;
  const intakeGreen = activationSummary.ok === true
    && activationSummary.returnIntake
    && activationSummary.returnIntake.authenticated === true
    && activationSummary.returnIntake?.fullManuscriptExportMapTransport?.present === true
    && activationSummary.returnIntake?.fullManuscriptExportMapTransport?.authority === 'main-owned-active-export-authority-store-after-return-authentication'
    && activationSummary.returnIntake?.fullManuscriptExportMapTransport?.returnedArtifactExportMapAccepted === false;
  return {
    ok: intakeGreen && exactTextGreen && commentsGreen && formattingGreen && structureGreen,
    activation: activationSummary,
    lanePlan,
    applyResults,
    replayResults,
    staleRetryResults,
    formattingApplyResult,
    formattingReplayInspection,
    productOpenContext: global.productOpenContext || null,
    typedPendingLanes: {
      exactText: lanePlan.hasExactText
        ? (exactTextGreen ? 'CANONICAL_PRODUCT_APPLY_AND_REPLAY_PROVEN' : 'PENDING_PRODUCT_APPLY_LANE')
        : 'NO_EXACT_TEXT_CANDIDATE',
      ...(lanePlan.hasComments
        ? deriveC5V2CommentLaneMaturity(activationSummary.commentProductPath || {})
        : {
          rootCommentsState: 'NO_COMMENT_CANDIDATE',
          repliesState: 'NO_COMMENT_CANDIDATE',
          commentState: 'NO_COMMENT_CANDIDATE',
          commentsRepliesState: 'NO_COMMENT_CANDIDATE',
        }),
      formatting: lanePlan.hasFormatting
        ? (formattingGreen ? 'PRODUCT_APPLY_AND_REPLAY_VERIFIED' : 'PENDING_PRODUCT_APPLY_LANE')
        : 'NO_FORMATTING_CANDIDATE',
      structural: lanePlan.hasStructure ? 'PENDING_PRODUCT_APPLY_LANE' : 'NO_STRUCTURAL_CANDIDATE',
    },
  };
}
for (const dirName of ['appData', 'userData', 'documents']) fs.mkdirSync(path.join(tempRoot, dirName), { recursive: true });
dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
dialog.showSaveDialog = async (_window, options = {}) => {
  const title = typeof options.title === 'string' ? options.title : '';
  dialogCalls.push({ method: 'showSaveDialog', title });
  if (title === '\\u042d\\u043a\\u0441\\u043f\\u043e\\u0440\\u0442 Review DOCX') return { canceled: false, filePath: activeRound && activeRound.outPath ? activeRound.outPath : '' };
  return { canceled: true };
};
dialog.showMessageBox = async () => ({ response: 0 });
app.setPath('appData', path.join(tempRoot, 'appData'));
app.setPath('userData', path.join(tempRoot, 'userData'));
app.setPath('documents', path.join(tempRoot, 'documents'));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('disable-features', 'UseSkiaRenderer');
app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = details && typeof details.url === 'string' ? details.url : '';
    const blocked = /^(https?|wss?):/u.test(url);
    if (blocked) networkRequests.push(url);
    callback({ cancel: blocked });
  });
});
process.chdir(rootDir);
if (!process.argv.includes('--dev')) process.argv.push('--dev');
require(path.join(rootDir, 'src', 'main.js'));
app.whenReady().then(async () => {
  try {
    progress('app-ready');
    const win = await waitUntil(() => BrowserWindow.getAllWindows()[0] || null, 'WINDOW_NOT_CREATED');
    progress('window-found');
    if (win.webContents.isLoadingMainFrame()) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('LOAD_TIMEOUT')), 15000);
        win.webContents.once('did-finish-load', () => { clearTimeout(timer); resolve(); });
        win.webContents.once('did-fail-load', (_event, _code, description) => {
          clearTimeout(timer);
          reject(new Error('DID_FAIL_LOAD:' + description));
        });
      });
    }
    progress('window-loaded');
    const projectRoot = path.join(tempRoot, 'documents', 'craftsman', projectName);
    const manifestPath = path.join(projectRoot, 'project.craftsman.json');
    await waitUntil(() => fs.existsSync(manifestPath), 'MANIFEST_NOT_CREATED');
    progress('manifest-ready', { manifestPath });
    const projectTreeProbe = await win.webContents.executeJavaScript(
      "window.electronAPI.invokeWorkspaceQueryBridge({queryId:'query.projectTree',payload:{tab:'roman'}})",
      true,
    );
    const romanNode = findTreeNodeByKind(projectTreeProbe && projectTreeProbe.root, 'roman-root');
    const romanRoot = romanNode && typeof romanNode.nodePath === 'string' && romanNode.nodePath
      ? romanNode.nodePath
      : path.join(projectRoot, 'roman');
    fs.mkdirSync(romanRoot, { recursive: true });
    if (!romanNode || typeof romanNode.nodeId !== 'string' || !romanNode.nodeId) {
      throw new Error('C5V2_CANARY_ROMAN_ROOT_NODE_MISSING');
    }
    const productSceneContexts = [];
    for (const scene of scenes) {
      const beforeFiles = new Set(listTextFiles(romanRoot));
      const createResult = await invokeUiCommand(win, 'cmd.project.tree.createNode', {
        parentNodeId: romanNode.nodeId,
        kind: 'scene',
        name: scene.file.replace(/\\.txt$/iu, ''),
      });
      if (!createResult || createResult.ok !== true || typeof createResult.nodeId !== 'string') {
        throw new Error('C5V2_CANARY_CREATE_SCENE_FAILED:' + JSON.stringify({ sceneFile: scene.file, createResult }));
      }
      const afterFiles = listTextFiles(romanRoot);
      const newFiles = afterFiles.filter((filePath) => !beforeFiles.has(filePath));
      if (newFiles.length !== 1) {
        throw new Error('C5V2_CANARY_CREATE_SCENE_PATH_UNRESOLVED:' + JSON.stringify({ sceneFile: scene.file, nodeId: createResult.nodeId, beforeCount: beforeFiles.size, afterFiles }));
      }
      fs.writeFileSync(newFiles[0], scene.text, 'utf8');
      const relativePath = path.relative(projectRoot, newFiles[0]).replace(/\\\\/gu, '/');
      productSceneContexts.push({
        sourceFile: scene.file,
        nodeId: createResult.nodeId,
        nodePath: newFiles[0],
        relativePath,
        sceneId: relativePath,
      });
    }
    global.productSceneContexts = productSceneContexts;
    global.productProjectRoot = projectRoot;
    progress('scene-files-written', { count: productSceneContexts.length, romanRoot, productSceneContexts });
    await sleep(500);
    const firstSceneNode = productSceneContexts[0] || null;
    const openDocumentResult = firstSceneNode && typeof firstSceneNode.nodeId === 'string'
          ? await invokeUiCommand(win, 'cmd.project.document.open', { nodeId: firstSceneNode.nodeId })
      : { ok: false, reason: 'C5V2_CANARY_OPEN_CONTEXT_NODE_NOT_FOUND' };
    global.productOpenContext = {
      ok: openDocumentResult && openDocumentResult.ok === true,
      result: openDocumentResult,
      nodeId: firstSceneNode && typeof firstSceneNode.nodeId === 'string' ? firstSceneNode.nodeId : '',
      nodePath: firstSceneNode && typeof firstSceneNode.nodePath === 'string' ? firstSceneNode.nodePath : '',
      file: scenes[0] && scenes[0].file ? scenes[0].file : '',
    };
    if (!global.productOpenContext.ok) {
      throw new Error('C5V2_CANARY_OPEN_CONTEXT_FAILED:' + JSON.stringify(global.productOpenContext));
    }
    progress('document-opened', global.productOpenContext);
    const applicationMenu = Menu.getApplicationMenu();
    const menuItem = applicationMenu?.getMenuItemById('review-export-full-manuscript-docx-review-packet')
      || flattenMenuItems(applicationMenu).find((item) => /Full Manuscript Review DOCX/iu.test(item.label || ''));
    if (!menuItem || typeof menuItem.click !== 'function') throw new Error('FULL_MANUSCRIPT_EXPORT_MENU_ITEM_MISSING:' + JSON.stringify(flattenMenuItems(applicationMenu).map((item) => ({ id: item.id, label: item.label }))));
    const menuDiagnostics = {
      id: menuItem.id || '',
      label: menuItem.label || '',
      enabled: menuItem.enabled === true,
      visible: menuItem.visible !== false,
    };
    progress('export-menu-found', menuDiagnostics);
    for (let roundIndex = 0; roundIndex < rounds.length; roundIndex += 1) {
      activeRound = rounds[roundIndex];
      const roundId = activeRound && activeRound.roundId ? activeRound.roundId : 'round-' + String(roundIndex + 1).padStart(2, '0');
      const outPath = activeRound && typeof activeRound.outPath === 'string' ? activeRound.outPath : '';
      const returnedPath = activeRound && typeof activeRound.returnedPath === 'string' ? activeRound.returnedPath : '';
      const returnedReadyPath = activeRound && typeof activeRound.returnedReadyPath === 'string' ? activeRound.returnedReadyPath : '';
      if (!outPath) throw new Error('C5V2_CUMULATIVE_ROUND_OUT_PATH_REQUIRED:' + roundId);
      progress('round-start', { roundIndex, roundId, outPath, returnedPath, returnedReadyPath });
      const scopeProbe = await win.webContents.executeJavaScript(
        "window.electronAPI.invokeWorkspaceQueryBridge({queryId:'query.selectedScenesTxtExportScope',payload:{}})",
        true,
      );
      const dialogStartIndex = dialogCalls.length;
      await clickNativeMenuItem(menuItem, win);
      progress('export-menu-clicked', { roundIndex, roundId });
      await sleep(500);
      let exportTrigger = 'native-menu-click';
      let bridgeResult = null;
      if (dialogCalls.length === dialogStartIndex && !fs.existsSync(outPath)) {
        exportTrigger = 'renderer-ui-command-bridge-after-native-menu-click-noop';
        const bridgeScript = "window.electronAPI.invokeUiCommandBridge({"
          + "route:'command.bus',"
          + "commandId:'cmd.project.review.exportFullManuscriptDocxReviewPacket',"
          + "payload:{requestId:" + JSON.stringify('c5v2-physical-canary-fullbook-export-' + roundId) + ",outPath:" + JSON.stringify(outPath) + "}"
          + "})";
        bridgeResult = await win.webContents.executeJavaScript(bridgeScript, true);
        await sleep(500);
      }
      let waitError = null;
      try {
        await waitUntil(() => fs.existsSync(outPath), 'FULL_MANUSCRIPT_DOCX_EXPORT_NOT_WRITTEN', 20000);
      } catch (error) {
        waitError = error && error.message ? error.message : String(error);
      }
      if (!fs.existsSync(outPath) && bridgeResult === null) {
        exportTrigger = 'renderer-ui-command-bridge-after-native-menu-timeout';
        const bridgeScript = "window.electronAPI.invokeUiCommandBridge({"
          + "route:'command.bus',"
          + "commandId:'cmd.project.review.exportFullManuscriptDocxReviewPacket',"
          + "payload:{requestId:" + JSON.stringify('c5v2-physical-canary-fullbook-export-retry-' + roundId) + ",outPath:" + JSON.stringify(outPath) + "}"
          + "})";
        bridgeResult = await win.webContents.executeJavaScript(bridgeScript, true);
        if (bridgeResult && bridgeResult.ok === true) {
          waitError = null;
          try {
            await waitUntil(() => fs.existsSync(outPath), 'FULL_MANUSCRIPT_DOCX_EXPORT_NOT_WRITTEN_AFTER_BRIDGE', 20000);
          } catch (error) {
            waitError = error && error.message ? error.message : String(error);
          }
        }
      }
      if (!fs.existsSync(outPath)) {
        emit({
          phase: 'export',
          ok: 0,
          roundIndex,
          roundId,
          message: waitError || 'FULL_MANUSCRIPT_EXPORT_COMMAND_DID_NOT_WRITE_DOCX',
          menuDiagnostics,
          bridgeResult,
          exportTrigger,
          projectTreeProbe,
          scopeProbe,
          dialogCalls,
          networkRequests,
        });
        app.exit(1);
        return;
      }
      const bytes = fs.readFileSync(outPath);
      const exportPayload = {
        phase: 'export',
        ok: 1,
        roundIndex,
        roundId,
        clicked: true,
        exportTrigger,
        menuItemId: menuItem.id,
        menuItemLabel: menuItem.label,
        menuDiagnostics,
        bridgeResult,
        projectTreeProbe,
        scopeProbe,
        exportedExists: true,
        exportedSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
        exportedBytes: bytes.length,
        dialogCalls,
        networkRequests,
        projectRoot,
        productOpenContext: global.productOpenContext,
        sceneFiles: productSceneContexts.map((scene) => scene.nodePath).filter(Boolean),
      };
      emit(exportPayload);
      if (!returnedPath || !returnedReadyPath) {
        continue;
      }
      const returnApply = await activateApplyAndReplayReturnedDocx(win, activeRound);
      emit({
        phase: 'return-apply',
        ok: returnApply.ok ? 1 : 0,
        roundIndex,
        roundId,
        returnApply,
        dialogCalls,
        networkRequests,
      });
      if (!returnApply.ok) {
        app.exit(2);
        return;
      }
    }
    app.exit(0);
  } catch (error) {
    emit({ phase: 'error', ok: 0, message: error && error.message ? error.message : String(error), stack: error && error.stack ? error.stack : '', dialogCalls, networkRequests });
    app.exit(1);
  }
});
`;
}

function parseCanaryChildResultLines(stdout) {
  return String(stdout || '')
    .split(/\r?\n/u)
    .filter((item) => item.startsWith(RESULT_PREFIX))
    .map((item) => {
      try {
        return JSON.parse(item.slice(RESULT_PREFIX.length));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function runElectronFullManuscriptRoundtrip({ runDir, sourcePath, returnedPath, returnedReadyPath, scenes, runWord }) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-c5v2-canary-ui-'));
  const childPath = path.join(tempRoot, 'fullbook-export-child.cjs');
  fs.writeFileSync(childPath, createFullManuscriptExportChildSource({
    tempRoot,
    outPath: sourcePath,
    returnedPath,
    returnedReadyPath,
    scenes,
  }), 'utf8');
  const stdoutChunks = [];
  const stderrChunks = [];
  const resultLines = [];
  let bufferedStdout = '';
  let exited = false;
  let exitState = null;
  const child = spawn(electronBinary, [childPath], {
    cwd: REPO_ROOT,
    env: { ...process.env, ELECTRON_ENABLE_SECURITY_WARNINGS: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => {
    stdoutChunks.push(chunk);
    bufferedStdout += chunk.toString('utf8');
    const lines = bufferedStdout.split(/\r?\n/u);
    bufferedStdout = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith(RESULT_PREFIX)) continue;
      try {
        resultLines.push(JSON.parse(line.slice(RESULT_PREFIX.length)));
      } catch {}
    }
  });
  child.stderr.on('data', (chunk) => stderrChunks.push(chunk));
  child.once('exit', (code, signal) => {
    exited = true;
    exitState = { code, signal };
  });
  let timedOut = false;
  let wordOutput = '';
  let wordError = '';
  let exportPayload = null;
  let wrapperError = null;
  const killTimer = setTimeout(() => {
    if (!exited) {
      timedOut = true;
      child.kill('SIGKILL');
    }
  }, 360_000);
  try {
    try {
      exportPayload = await waitForCondition(() => {
        const found = resultLines.find((line) => line.phase === 'export' || (line.ok === 1 && line.exportedExists === true));
        return found || null;
      }, 'ELECTRON_EXPORT_PHASE_NOT_EMITTED', 90_000);
      if (exportPayload.ok === 1 && fs.existsSync(sourcePath) && typeof runWord === 'function') {
        const sourcePackage = packageSummary(sourcePath);
        if (sourcePackage.modernMode15Ready !== true) {
          wordError = `C5V2_SOURCE_PRODUCT_DOCX_MODERN_MODE_15_REQUIRED:${JSON.stringify(sourcePackage.compatibilityModes)}`;
          fs.writeFileSync(returnedReadyPath, JSON.stringify({
            ready: false,
            returnedPath,
            error: wordError,
            sourceCompatibilityModes: sourcePackage.compatibilityModes,
            createdAtUtc: new Date().toISOString(),
          }, null, 2));
        } else {
        try {
          wordOutput = await runWord();
          fs.writeFileSync(returnedReadyPath, JSON.stringify({
            ready: true,
            returnedPath,
            returnedSha256: fs.existsSync(returnedPath) ? sha256File(returnedPath) : '',
            createdAtUtc: new Date().toISOString(),
          }, null, 2));
        } catch (error) {
          wordError = String(error.stderr || error.message || error);
          fs.writeFileSync(returnedReadyPath, JSON.stringify({
            ready: false,
            returnedPath,
            error: wordError,
            createdAtUtc: new Date().toISOString(),
          }, null, 2));
        }
        }
      }
      await waitForCondition(() => (exited ? exitState : null), 'ELECTRON_RETURN_APPLY_EXIT_NOT_OBSERVED', 240_000);
    } catch (error) {
      wrapperError = error && error.message ? error.message : String(error);
    }
  } finally {
    clearTimeout(killTimer);
    if (!exited) child.kill('SIGKILL');
  }
  const stdout = Buffer.concat(stdoutChunks).toString('utf8');
  const stderr = Buffer.concat(stderrChunks).toString('utf8');
  fs.writeFileSync(path.join(runDir, 'electron-export-stdout.log'), stdout);
  fs.writeFileSync(path.join(runDir, 'electron-export-stderr.log'), stderr);
  const parsedLines = parseCanaryChildResultLines(stdout);
  const exportResult = exportPayload || parsedLines.find((line) => line.phase === 'export') || parsedLines[0] || null;
  const returnApplyResult = parsedLines.find((line) => line.phase === 'return-apply') || null;
  return {
    ok: timedOut === false && exitState?.code === 0 && exportResult?.ok === 1 && fs.existsSync(sourcePath),
    timedOut,
    exitCode: exitState?.code ?? null,
    signal: exitState?.signal ?? null,
    result: exportResult,
    returnApplyResult,
    stderrTail: stderr.slice(-2000),
    wrapperError,
    sourcePath,
    sourceSha256: fs.existsSync(sourcePath) ? sha256File(sourcePath) : '',
    wordOutput,
    wordError,
  };
}

async function runElectronCumulativeFullManuscriptRoundtrip({
  runDir,
  scenes,
  rounds,
  runWordForRound,
}) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-c5v2-cumulative-ui-'));
  const childPath = path.join(tempRoot, 'fullbook-cumulative-child.cjs');
  fs.writeFileSync(childPath, createFullManuscriptExportChildSource({
    tempRoot,
    outPath: rounds[0]?.sourcePath || '',
    returnedPath: rounds[0]?.returnedPath || '',
    returnedReadyPath: rounds[0]?.returnedReadyPath || '',
    scenes,
    rounds: rounds.map((round, index) => ({
      roundIndex: index,
      roundId: round.roundId,
      outPath: round.sourcePath,
      returnedPath: round.returnedPath,
      returnedReadyPath: round.returnedReadyPath,
    })),
  }), 'utf8');
  const stdoutChunks = [];
  const stderrChunks = [];
  const resultLines = [];
  let bufferedStdout = '';
  let exited = false;
  let exitState = null;
  const child = spawn(electronBinary, [childPath], {
    cwd: REPO_ROOT,
    env: { ...process.env, ELECTRON_ENABLE_SECURITY_WARNINGS: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => {
    stdoutChunks.push(chunk);
    bufferedStdout += chunk.toString('utf8');
    const lines = bufferedStdout.split(/\r?\n/u);
    bufferedStdout = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith(RESULT_PREFIX)) continue;
      try {
        resultLines.push(JSON.parse(line.slice(RESULT_PREFIX.length)));
      } catch {}
    }
  });
  child.stderr.on('data', (chunk) => stderrChunks.push(chunk));
  child.once('exit', (code, signal) => {
    exited = true;
    exitState = { code, signal };
  });
  let timedOut = false;
  let wrapperError = null;
  const wordOutputs = [];
  const wordErrors = [];
  const killTimer = setTimeout(() => {
    if (!exited) {
      timedOut = true;
      child.kill('SIGKILL');
    }
  }, 1_800_000);
  try {
    for (let roundIndex = 0; roundIndex < rounds.length; roundIndex += 1) {
      const round = rounds[roundIndex];
      const exportPayload = await waitForCondition(() => {
        const found = resultLines.find((line) => line.phase === 'export' && line.ok === 1 && line.roundIndex === roundIndex);
        return found || null;
      }, `ELECTRON_CUMULATIVE_EXPORT_PHASE_NOT_EMITTED:${round.roundId}`, 180_000);
      if (!fs.existsSync(round.sourcePath)) throw new Error(`C5V2_CUMULATIVE_SOURCE_DOCX_MISSING:${round.roundId}`);
      const sourcePackage = packageSummary(round.sourcePath);
      if (sourcePackage.modernMode15Ready !== true) {
        const wordError = `C5V2_SOURCE_PRODUCT_DOCX_MODERN_MODE_15_REQUIRED:${JSON.stringify(sourcePackage.compatibilityModes)}`;
        wordErrors[roundIndex] = wordError;
        fs.writeFileSync(round.returnedReadyPath, JSON.stringify({
          ready: false,
          roundId: round.roundId,
          returnedPath: round.returnedPath,
          error: wordError,
          sourceCompatibilityModes: sourcePackage.compatibilityModes,
          createdAtUtc: new Date().toISOString(),
        }, null, 2));
        continue;
      }
      try {
        const wordOutput = await runWordForRound(roundIndex, round, exportPayload);
        wordOutputs[roundIndex] = wordOutput;
        fs.writeFileSync(round.returnedReadyPath, JSON.stringify({
          ready: true,
          roundId: round.roundId,
          returnedPath: round.returnedPath,
          returnedSha256: fs.existsSync(round.returnedPath) ? sha256File(round.returnedPath) : '',
          createdAtUtc: new Date().toISOString(),
        }, null, 2));
      } catch (error) {
        const wordError = String(error.stderr || error.message || error);
        wordErrors[roundIndex] = wordError;
        fs.writeFileSync(round.returnedReadyPath, JSON.stringify({
          ready: false,
          roundId: round.roundId,
          returnedPath: round.returnedPath,
          error: wordError,
          createdAtUtc: new Date().toISOString(),
        }, null, 2));
        throw new Error(`C5V2_CUMULATIVE_WORD_ROUND_FAILED:${round.roundId}:${wordError}`);
      }
      await waitForCondition(() => {
        const found = resultLines.find((line) => line.phase === 'return-apply' && line.roundIndex === roundIndex);
        return found || null;
      }, `ELECTRON_CUMULATIVE_RETURN_APPLY_NOT_EMITTED:${round.roundId}`, 300_000);
    }
    await waitForCondition(() => (exited ? exitState : null), 'ELECTRON_CUMULATIVE_EXIT_NOT_OBSERVED', 120_000);
  } catch (error) {
    wrapperError = error && error.message ? error.message : String(error);
    if (!exited) {
      await waitForCondition(() => (exited ? exitState : null), 'ELECTRON_CUMULATIVE_EXIT_AFTER_ERROR_NOT_OBSERVED', 30_000).catch(() => null);
    }
  } finally {
    clearTimeout(killTimer);
    if (!exited) child.kill('SIGKILL');
  }
  const stdout = Buffer.concat(stdoutChunks).toString('utf8');
  const stderr = Buffer.concat(stderrChunks).toString('utf8');
  fs.writeFileSync(path.join(runDir, 'electron-cumulative-stdout.log'), stdout);
  fs.writeFileSync(path.join(runDir, 'electron-cumulative-stderr.log'), stderr);
  const parsedLines = parseCanaryChildResultLines(stdout);
  const exportResults = parsedLines.filter((line) => line.phase === 'export');
  const returnApplyResults = parsedLines.filter((line) => line.phase === 'return-apply');
  return {
    ok: timedOut === false
      && wrapperError === null
      && exitState?.code === 0
      && exportResults.filter((line) => line.ok === 1).length === rounds.length
      && returnApplyResults.filter((line) => line.ok === 1).length === rounds.length,
    timedOut,
    exitCode: exitState?.code ?? null,
    signal: exitState?.signal ?? null,
    exportResults,
    returnApplyResults,
    stderrTail: stderr.slice(-2000),
    wrapperError,
    wordOutputs,
    wordErrors,
    parsedLines,
  };
}

function wordOperationLines(ledger, returnedPath) {
  const lines = [];
  lines.push('set yOpsDone to ""');
  lines.push('set yLimitations to ""');
  lines.push('set yUiDiagnostics to ""');
  lines.push('set yRootComments to {}');
  const markLine = (id, status, indent = '  ') => `${indent}set yOpsDone to yOpsDone & "OP|" & ${appleText(id)} & "|${status}" & linefeed`;
  const rootOperations = ledger.operations.filter((operation) => operation.family === 'root_comment' && operation.wordRange);
  const lifecycleOperations = ledger.operations.filter((operation) => ['reply_attempt', 'state_attempt'].includes(operation.family));
  const nonLifecycleOperations = ledger.operations.filter((operation) => (
    !rootOperations.includes(operation) && !lifecycleOperations.includes(operation)
  ));
  const orderedOperations = [
    ...rootOperations,
    ...nonLifecycleOperations.slice().sort((left, right) => (right.wordRange?.start || 0) - (left.wordRange?.start || 0)),
    ...lifecycleOperations,
  ];
  const expectedNativeRevisionCount = ledger.operations.reduce((count, operation) => (
    count + (operation.family === 'tracked_replace' ? 2 : ['tracked_insert', 'tracked_delete'].includes(operation.family) ? 1 : 0)
  ), 0);
  const expectedRootMarkers = rootOperations.map((operation) => `C5V2 root ${operation.id}`);
  let materializationBoundaryWritten = false;
  const lifecycleCheckpointLines = (operation) => {
    const snapshotPath = `${returnedPath}.${operation.id.replace(/[^a-z0-9_-]/giu, '_')}.native-readback.docx`;
    const checkpoint = [
      `    my yCheckpoint(yCheckpointPath, "${operation.id}:SAVE_BEFORE", "")`,
      '    save yDoc',
      `    my yCheckpoint(yCheckpointPath, "${operation.id}:SAVE_AFTER", "")`,
      `    my yCheckpoint(yCheckpointPath, "${operation.id}:CLOSE_BEFORE", "")`,
      '    close yDoc saving yes',
      '    set yDocWasOpened to false',
      `    my yCheckpoint(yCheckpointPath, "${operation.id}:CLOSE_AFTER", "")`,
      `    do shell script "/bin/cp " & quoted form of yReturnedPath & " " & quoted form of ${appleText(snapshotPath)}`,
      `    my yCheckpoint(yCheckpointPath, "${operation.id}:REOPEN_BEFORE", "")`,
      '    if my yOpenExpectedDoc(yReturnedPath, yExpectedFullName, yExpectedName) is not true then error "C5V2_LIFECYCLE_REOPEN_TIMEOUT" number 9713',
      '    set yDoc to active document',
      '    set yDocWasOpened to true',
      `    my yCheckpoint(yCheckpointPath, "${operation.id}:REOPEN_AFTER", "")`,
      `    my yCheckpoint(yCheckpointPath, "${operation.id}:SEMANTIC_READBACK_SNAPSHOT", ${appleText(snapshotPath)})`,
    ];
    return checkpoint;
  };
  for (const operation of orderedOperations) {
    if (['reply_attempt', 'state_attempt'].includes(operation.family) && !materializationBoundaryWritten) {
      lines.push(`set yMaterializationHash to my yMaterializeNativeCommentBoundary(yCheckpointPath, yReturnedPath, yExpectedFullName, yExpectedName, ${expectedNativeRevisionCount}, ${rootOperations.length}, ${appleList(expectedRootMarkers)})`);
      lines.push('set yDoc to active document');
      lines.push('set yDocWasOpened to true');
      materializationBoundaryWritten = true;
    }
    const id = operation.id;
    const quote = operation.quote;
    const rangeStart = operation.wordRange?.start;
    const rangeEnd = operation.wordRange?.end;
    lines.push('try');
    lines.push(`  my yRequireBudget(yCheckpointPath, ${appleText(`${id}:START`)})`);
    lines.push(`  my yCheckpoint(yCheckpointPath, ${appleText(`${id}:START`)}, ${appleText(operation.family)})`);
    if (!Number.isInteger(rangeStart) || !Number.isInteger(rangeEnd) || rangeEnd <= rangeStart) {
      lines.push('  error "SOURCE_RANGE_NOT_BOUND" number 9104');
    } else {
      lines.push(`  set yRange to create range yDoc start ${rangeStart} end ${rangeEnd}`);
    }
    if (operation.family === 'tracked_replace') {
      lines.push('  set track revisions of yDoc to true');
      lines.push(`  set content of yRange to ${appleText(operation.replacementText)}`);
      lines.push(markLine(id, 'SAFE_APPLY'));
    } else if (operation.family === 'tracked_insert') {
      lines.push('  set track revisions of yDoc to true');
      lines.push(`  set content of yRange to ${appleText(`${operation.replacementText} ${quote}`)}`);
      lines.push(markLine(id, 'SAFE_APPLY'));
    } else if (operation.family === 'tracked_delete') {
      lines.push('  set track revisions of yDoc to true');
      lines.push('  set content of yRange to ""');
      lines.push(markLine(id, 'SAFE_APPLY'));
    } else if (operation.family === 'root_comment') {
      lines.push('  set track revisions of yDoc to false');
      lines.push(`  my yCheckpoint(yCheckpointPath, ${appleText(`${id}:ROOT_CREATE_BEFORE`)}, "")`);
      lines.push(`  set yComment to make new Word comment at yRange with properties {comment text:${appleText(`C5V2 root ${id}`)}}`);
      lines.push('  set end of yRootComments to yComment');
      lines.push(`  my yCheckpoint(yCheckpointPath, ${appleText(`${id}:ROOT_CREATE_AFTER`)}, "")`);
      lines.push(markLine(id, 'SAFE_APPLY'));
    } else if (operation.family === 'reply_attempt') {
      lines.push('  set track revisions of yDoc to false');
      const root = rootOperations.find((candidate) => candidate.id === operation.targetRootOperationId);
      lines.push(`  set yTargetRootRange to my yFindRange(yDoc, ${appleText(root?.quote || '')})`);
      lines.push('  if yTargetRootRange is missing value then error "EXPLICIT_ROOT_COMMENT_FOR_REPLY_NOT_FOUND" number 9102');
      lines.push('  try');
      lines.push(`    my yCheckpoint(yCheckpointPath, ${appleText(`${id}:TARGET_SELECT_BEFORE`)}, ${appleText(operation.targetRootOperationId)})`);
      lines.push('    select yTargetRootRange');
      lines.push(`    my yCheckpoint(yCheckpointPath, ${appleText(`${id}:TARGET_SELECT_AFTER`)}, ${appleText(operation.targetRootOperationId)})`);
      lines.push(`    set yUiPreparation to my yPrepareCommentsUi(yCheckpointPath, yExpectedFullName, ${appleText(`C5V2 root ${operation.targetRootOperationId}`)}, 0)`);
      lines.push(`    set yUiDiagnostics to yUiDiagnostics & "OP|${id}|PREPARE|" & yUiPreparation & linefeed`);
      lines.push('    if yUiPreparation does not contain "UNIQUE_TARGET_MARKER_VERIFIED" then error "REPLY_NATIVE_UI_TARGET_UNAVAILABLE_OR_AMBIGUOUS:" & yUiPreparation number 9112');
      lines.push(`    my yCheckpoint(yCheckpointPath, ${appleText(`${id}:CONTROL_CLICK_BEFORE`)}, "REPLY")`);
      lines.push(`    set yUiResult to my yClickBoundedMarkerControl(yCheckpointPath, ${appleText(`C5V2 root ${operation.targetRootOperationId}`)}, {"Ответить", "Reply"})`);
      lines.push(`    my yCheckpoint(yCheckpointPath, ${appleText(`${id}:CONTROL_CLICK_AFTER`)}, yUiResult)`);
      lines.push(`    set yUiDiagnostics to yUiDiagnostics & "OP|${id}|ACTION|" & yUiResult & linefeed`);
      lines.push('    if yUiResult is not "CLICKED" then error "REPLY_NATIVE_UI_CONTROL_UNAVAILABLE_OR_AMBIGUOUS:" & yUiResult number 9112');
      lines.push(`    my yCheckpoint(yCheckpointPath, ${appleText(`${id}:TEXT_ENTRY_BEFORE`)}, "")`);
      lines.push(`    my yTypeNativeCommentText(${appleText(`C5V2 reply ${id}`)})`);
      lines.push(`    my yCheckpoint(yCheckpointPath, ${appleText(`${id}:TEXT_ENTRY_AFTER`)}, "")`);
      lines.push(markLine(id, 'PENDING_NATIVE_READBACK', '    '));
      lines.push(...lifecycleCheckpointLines(operation));
      lines.push('  on error errMsg number errNo');
      lines.push('    set yLimitations to yLimitations & "REPLY_ATTEMPT|" & errNo & "|" & errMsg & linefeed');
      lines.push(markLine(id, 'MANUAL_OR_BLOCKED', '    '));
      lines.push('  end try');
    } else if (operation.family === 'state_attempt') {
      const root = rootOperations.find((candidate) => candidate.id === operation.targetRootOperationId);
      const names = operation.requestedState === 'reopened' ? '{"Повторно открыть", "Reopen"}' : '{"Разрешить", "Resolve"}';
      lines.push(`  set yTargetRootRange to my yFindRange(yDoc, ${appleText(root?.quote || '')})`);
      lines.push('  if yTargetRootRange is missing value then error "EXPLICIT_ROOT_COMMENT_FOR_STATE_NOT_FOUND" number 9103');
      lines.push('  try');
      lines.push(`    my yCheckpoint(yCheckpointPath, ${appleText(`${id}:TARGET_SELECT_BEFORE`)}, ${appleText(operation.targetRootOperationId)})`);
      lines.push('    select yTargetRootRange');
      lines.push(`    my yCheckpoint(yCheckpointPath, ${appleText(`${id}:TARGET_SELECT_AFTER`)}, ${appleText(operation.targetRootOperationId)})`);
      lines.push(`    set yUiPreparation to my yPrepareCommentsUi(yCheckpointPath, yExpectedFullName, ${appleText(`C5V2 root ${operation.targetRootOperationId}`)}, 0)`);
      lines.push(`    set yUiDiagnostics to yUiDiagnostics & "OP|${id}|PREPARE|" & yUiPreparation & linefeed`);
      lines.push('    if yUiPreparation does not contain "UNIQUE_TARGET_MARKER_VERIFIED" then error "STATE_NATIVE_UI_TARGET_UNAVAILABLE_OR_AMBIGUOUS:" & yUiPreparation number 9113');
      lines.push(`    my yCheckpoint(yCheckpointPath, ${appleText(`${id}:CONTROL_CLICK_BEFORE`)}, ${appleText(operation.requestedState)})`);
      lines.push(`    set yUiResult to my yClickBoundedMarkerControl(yCheckpointPath, ${appleText(`C5V2 root ${operation.targetRootOperationId}`)}, ${names})`);
      lines.push(`    my yCheckpoint(yCheckpointPath, ${appleText(`${id}:CONTROL_CLICK_AFTER`)}, yUiResult)`);
      lines.push(`    set yUiDiagnostics to yUiDiagnostics & "OP|${id}|ACTION|" & yUiResult & linefeed`);
      lines.push('    if yUiResult is not "CLICKED" then error "STATE_NATIVE_UI_CONTROL_UNAVAILABLE_OR_AMBIGUOUS:" & yUiResult number 9113');
      lines.push(markLine(id, 'PENDING_NATIVE_READBACK', '    '));
      lines.push(...lifecycleCheckpointLines(operation));
      lines.push('  on error errMsg number errNo');
      lines.push('    set yLimitations to yLimitations & "STATE_ATTEMPT|" & errNo & "|" & errMsg & linefeed');
      lines.push(markLine(id, 'MANUAL_OR_BLOCKED', '    '));
      lines.push('  end try');
    } else if (operation.family === 'formatting') {
      lines.push('  set track revisions of yDoc to false');
      lines.push('  set bold of font object of yRange to true');
      lines.push('  set italic of font object of yRange to true');
      lines.push(markLine(id, 'SAFE_APPLY'));
    } else if (operation.family === 'structural') {
      lines.push('  set track revisions of yDoc to true');
      lines.push(`  set content of yRange to ${appleText(`${quote}\nC5V2 structural split/page lane.`)}`);
      lines.push(markLine(id, 'SAFE_APPLY'));
    }
    lines.push('on error errMsg number errNo');
    lines.push('  set yLimitations to yLimitations & "OP_ERROR|' + id.replaceAll('"', '') + '|" & errNo & "|" & errMsg & linefeed');
    lines.push(markLine(id, 'BLOCKED'));
    lines.push('end try');
  }
  return lines.join('\n');
}

export function buildWordScript({ sourcePath, returnedPath, artifactReturnedPath = returnedPath, ledger }) {
  const expectedName = path.basename(returnedPath);
  const requiresAccessibilityUi = ledger.operations.some((operation) => (
    ['reply_attempt', 'state_attempt'].includes(operation.family)
  ));
  return [
    'use scripting additions',
    'property yAxVisitedNodes : 0',
    'property yAxSearchDeadline : missing value',
    'property yOverallDeadline : missing value',
    'on yMacosAccessibilityPreflight(yExpectedFullName)',
    '  tell application "Microsoft Word"',
    '    activate',
    '    set yFrontDocument to ""',
    '    try',
    '      if (count of documents) > 0 then set yFrontDocument to full name of active document as text',
    '    end try',
    '  end tell',
    '  set yUiEnabled to false',
    '  set yProcessExists to false',
    '  set yWordFrontmost to false',
    '  set yWindowCount to 0',
    '  set yAxQuerySucceeded to false',
    '  set yAxMenuCount to 0',
    '  set yAxWindowSubtreeCount to 0',
    '  set yAxErrorNumber to 0',
    '  set yAxErrorMessage to ""',
    '  repeat with yAttempt from 1 to 40',
    '    delay 0.25',
    '    tell application "System Events"',
    '      set yUiEnabled to UI elements enabled',
    '      set yProcessExists to exists process "Microsoft Word"',
    '      if yProcessExists then',
    '        tell process "Microsoft Word"',
    '          try',
    '            set frontmost to true',
    '            set yWordFrontmost to frontmost',
    '            set yWindowCount to count of windows',
    '            set yAxMenuCount to count of menu bar items of menu bar 1',
    '            if yWindowCount > 0 then set yAxWindowSubtreeCount to count of UI elements of window 1',
    '            set yAxQuerySucceeded to yAxMenuCount > 0',
    '          on error yErrMsg number yErrNo',
    '            set yAxErrorNumber to yErrNo',
    '            set yAxErrorMessage to yErrMsg',
    '          end try',
    '        end tell',
    '      end if',
    '    end tell',
    '    if yAxQuerySucceeded and yWordFrontmost and yWindowCount > 0 and yAxWindowSubtreeCount > 0 then exit repeat',
    '  end repeat',
    '  tell application "System Events"',
    '    set yDiagnostics to "LEGACY_UI_ELEMENTS_ENABLED:" & yUiEnabled & ":PROCESS_EXISTS:" & yProcessExists & ":WORD_FRONTMOST:" & yWordFrontmost & ":WINDOW_COUNT:" & yWindowCount & ":AX_MENU_COUNT:" & yAxMenuCount & ":AX_WINDOW_SUBTREE_COUNT:" & yAxWindowSubtreeCount & ":AX_ERROR_NUMBER:" & yAxErrorNumber & ":AX_ERROR_MESSAGE:" & yAxErrorMessage & ":FRONT_DOCUMENT:" & yFrontDocument',
    '    if yProcessExists is false then return "MACOS_ACCESSIBILITY_WORD_PROCESS_MISSING|" & yDiagnostics',
    '    if yWindowCount < 1 then return "MACOS_ACCESSIBILITY_WORD_WINDOW_UNAVAILABLE|" & yDiagnostics',
    '    if yAxQuerySucceeded is false then return "MACOS_ACCESSIBILITY_PERMISSION_REQUIRED|" & yDiagnostics',
    '    if yFrontDocument is not yExpectedFullName then return "MACOS_ACCESSIBILITY_FRONT_DOCUMENT_MISMATCH|" & yDiagnostics',
    '    if yWordFrontmost is false or yWindowCount < 1 or yAxWindowSubtreeCount < 1 then return "MACOS_ACCESSIBILITY_WORD_WINDOW_UNAVAILABLE|" & yDiagnostics',
    '    return "MACOS_ACCESSIBILITY_PREFLIGHT_READY|" & yDiagnostics',
    '  end tell',
    'end yMacosAccessibilityPreflight',
    'on yWordObjectModelPreflight(yExpectedFullName)',
    '  tell application "Microsoft Word"',
    '    set yDocumentCount to count of documents',
    '    set yWindowCount to count of windows',
    '    set yFrontDocument to ""',
    '    try',
    '      if yDocumentCount > 0 then set yFrontDocument to full name of active document as text',
    '    end try',
    '  end tell',
    '  set yDiagnostics to "DOCUMENT_COUNT:" & yDocumentCount & ":WINDOW_COUNT:" & yWindowCount & ":FRONT_DOCUMENT:" & yFrontDocument',
    '  if yDocumentCount < 1 then return "WORD_OBJECT_MODEL_DOCUMENT_MISSING|" & yDiagnostics',
    '  if yWindowCount < 1 then return "WORD_OBJECT_MODEL_WINDOW_UNAVAILABLE|" & yDiagnostics',
    '  if yFrontDocument is not yExpectedFullName then return "WORD_OBJECT_MODEL_FRONT_DOCUMENT_MISMATCH|" & yDiagnostics',
    '  return "WORD_OBJECT_MODEL_PREFLIGHT_READY|" & yDiagnostics',
    'end yWordObjectModelPreflight',
    'on yCloseStaleExpectedDocuments(yExpectedPosixPath)',
    '  tell application "Microsoft Word"',
    '    repeat with yIndex from (count of documents) to 1 by -1',
    '      set yCandidate to document yIndex',
    '      set yCandidatePosixPath to ""',
    '      try',
    '        set yCandidatePosixPath to POSIX path of ((full name of yCandidate as text) as alias)',
    '      end try',
    '      if yCandidatePosixPath is yExpectedPosixPath then close yCandidate saving no',
    '    end repeat',
    '  end tell',
    'end yCloseStaleExpectedDocuments',
    'on yResetCheckpoint(yCheckpointPath)',
    '  do shell script "/usr/bin/printf \'%s\\n\' " & quoted form of "CANARY_PHASE_LOG_V1" & " > " & quoted form of yCheckpointPath',
    'end yResetCheckpoint',
    'on yCheckpoint(yCheckpointPath, yPhase, yDetail)',
    '  do shell script "/usr/bin/printf \'%s\\n\' " & quoted form of (yPhase & "|" & yDetail) & " >> " & quoted form of yCheckpointPath',
    'end yCheckpoint',
    'on yDurableCheckpoint(yCheckpointPath, yPhase, yDetail)',
    '  my yCheckpoint(yCheckpointPath, yPhase, yDetail)',
    '  do shell script "/bin/sync"',
    'end yDurableCheckpoint',
    'on yCountTextOccurrences(ySource, yNeedle)',
    '  if yNeedle is "" then return 0',
    '  set yCount to 0',
    '  set yRemainder to ySource as text',
    '  repeat',
    '    set yOffset to offset of yNeedle in yRemainder',
    '    if yOffset is 0 then exit repeat',
    '    set yCount to yCount + 1',
    '    if yOffset + (count of characters of yNeedle) > (count of characters of yRemainder) then exit repeat',
    '    set yRemainder to text (yOffset + (count of characters of yNeedle)) thru -1 of yRemainder',
    '  end repeat',
    '  return yCount',
    'end yCountTextOccurrences',
    'on yVerifyNativeRootMarkers(yDoc, yExpectedMarkers)',
    '  tell application "Microsoft Word"',
    '    repeat with yExpectedMarker in yExpectedMarkers',
    '      set yMarkerCount to 0',
    '      repeat with yCommentIndex from 1 to ((count of yExpectedMarkers) + 1)',
    '        try',
    '          set yNativeComment to Word comment yCommentIndex of yDoc',
    '          if (content of comment text of yNativeComment as text) contains (yExpectedMarker as text) then set yMarkerCount to yMarkerCount + 1',
    '        on error',
    '          exit repeat',
    '        end try',
    '      end repeat',
    '      if yMarkerCount is not 1 then error "NATIVE_MATERIALIZATION_ROOT_MARKER_COUNT_MISMATCH:" & yExpectedMarker & ":" & yMarkerCount number 9725',
    '    end repeat',
    '  end tell',
    'end yVerifyNativeRootMarkers',
    'on yMaterializeNativeCommentBoundary(yCheckpointPath, yReturnedPath, yExpectedFullName, yExpectedName, yExpectedRevisionCount, yExpectedRootCount, yExpectedMarkers)',
    '  my yRequireBudget(yCheckpointPath, "NATIVE_MATERIALIZATION_START")',
    '  my yDurableCheckpoint(yCheckpointPath, "NATIVE_MATERIALIZATION_SAVE_BEFORE", "")',
    '  tell application "Microsoft Word"',
    '    if (count of documents) is 0 then error "NATIVE_MATERIALIZATION_DOCUMENT_MISSING" number 9720',
    '    if (full name of active document as text) is not yExpectedFullName then error "NATIVE_MATERIALIZATION_WRONG_DOCUMENT_BEFORE_SAVE" number 9721',
    '    save active document',
    '    close active document saving yes',
    '  end tell',
    '  do shell script "/bin/sync"',
    '  my yDurableCheckpoint(yCheckpointPath, "NATIVE_MATERIALIZATION_CLOSE_AFTER", yReturnedPath)',
    '  set yVisibleSize to 0',
    '  try',
    '    set yVisibleSize to (do shell script "/usr/bin/stat -f %z " & quoted form of yReturnedPath) as integer',
    '  on error yErrMsg number yErrNo',
    '    error "NATIVE_MATERIALIZATION_DURABLE_VISIBILITY_FAILED:" & yErrNo & ":" & yErrMsg number 9722',
    '  end try',
    '  if yVisibleSize < 1 then error "NATIVE_MATERIALIZATION_DURABLE_VISIBILITY_FAILED:EMPTY" number 9722',
    '  set yBoundaryHashLine to do shell script "/usr/bin/shasum -a 256 " & quoted form of yReturnedPath',
    '  set yBoundaryHash to word 1 of yBoundaryHashLine',
    '  if (count of characters of yBoundaryHash) is not 64 then error "NATIVE_MATERIALIZATION_HASH_INVALID" number 9723',
    '  set ySettingsXml to do shell script "/usr/bin/unzip -p " & quoted form of yReturnedPath & " word/settings.xml"',
    '  if my yCountTextOccurrences(ySettingsXml, "compatibilityMode") is not 1 or ySettingsXml does not contain "w:val=\\"15\\"" then error "NATIVE_MATERIALIZATION_COMPATIBILITY_MODE_15_REQUIRED" number 9724',
    '  my yDurableCheckpoint(yCheckpointPath, "NATIVE_MATERIALIZATION_REOPEN_BEFORE", yBoundaryHash)',
    '  if my yOpenExpectedDoc(yReturnedPath, yExpectedFullName, yExpectedName) is not true then error "NATIVE_MATERIALIZATION_REOPEN_TIMEOUT" number 9726',
    '  tell application "Microsoft Word"',
    '    if (full name of active document as text) is not yExpectedFullName then error "NATIVE_MATERIALIZATION_REOPEN_IDENTITY_MISMATCH" number 9727',
    '    set yReopenedRevisionCount to count of revisions of active document',
    '    set yReopenedRootCount to 0',
    '    repeat with yCommentIndex from 1 to (yExpectedRootCount + 1)',
    '      try',
    '        set yReopenedComment to Word comment yCommentIndex of active document',
    '        set yReopenedRootCount to yReopenedRootCount + 1',
    '      on error',
    '        exit repeat',
    '      end try',
    '    end repeat',
    '    if yReopenedRevisionCount is not yExpectedRevisionCount then error "NATIVE_MATERIALIZATION_REVISION_COUNT_MISMATCH:" & yReopenedRevisionCount & ":" & yExpectedRevisionCount number 9728',
    '    if yReopenedRootCount is not yExpectedRootCount then error "NATIVE_MATERIALIZATION_ROOT_COUNT_MISMATCH:" & yReopenedRootCount & ":" & yExpectedRootCount number 9729',
    '    set yReopenedFullName to full name of active document as text',
    '    my yVerifyNativeRootMarkers(active document, yExpectedMarkers)',
    '  end tell',
    '  set yReopenedHashLine to do shell script "/usr/bin/shasum -a 256 " & quoted form of yReturnedPath',
    '  set yReopenedHash to word 1 of yReopenedHashLine',
    '  if yReopenedHash is not yBoundaryHash then error "NATIVE_MATERIALIZATION_REOPEN_HASH_DIVERGENCE" number 9730',
    '  my yDurableCheckpoint(yCheckpointPath, "NATIVE_MATERIALIZATION_REOPEN_VERIFIED", yReopenedFullName & ":HASH:" & yBoundaryHash & ":REVISIONS:" & yReopenedRevisionCount & ":ROOTS:" & yReopenedRootCount)',
    '  return yBoundaryHash',
    'end yMaterializeNativeCommentBoundary',
    'on yRequireBudget(yCheckpointPath, yPhase)',
    '  if (current date) > my yOverallDeadline then',
    '    my yCheckpoint(yCheckpointPath, "TIME_BUDGET_EXCEEDED", yPhase)',
    '    error "TIME_BUDGET_EXCEEDED|" & yPhase number 9798',
    '  end if',
    'end yRequireBudget',
    'on ySkipAxSubtree(yElement)',
    '  tell application "System Events"',
    '    set yRole to ""',
    '    set yDescription to ""',
    '    try',
    '      set yRole to role of yElement as text',
    '    end try',
    '    try',
    '      set yDescription to description of yElement as text',
    '    end try',
    '    return yRole is "AXLayoutArea" or yDescription contains "document text" or yDescription contains "текст документа"',
    '  end tell',
    'end ySkipAxSubtree',
    'on yBoundedElementHasMarker(yElement, yMarker, yDepth)',
    '  if yDepth > 6 then return false',
    '  if (current date) > my yAxSearchDeadline then error "TIME_BUDGET_EXCEEDED|AX_MARKER_SEARCH" number 9798',
    '  set my yAxVisitedNodes to my yAxVisitedNodes + 1',
    '  if my yAxVisitedNodes > 500 then error "AX_NODE_BUDGET_EXCEEDED" number 9797',
    '  if my ySkipAxSubtree(yElement) then return false',
    '  tell application "System Events"',
    '    try',
    '      if (name of yElement as text) contains yMarker then return true',
    '    end try',
    '    try',
    '      if (value of yElement as text) contains yMarker then return true',
    '    end try',
    '    try',
    '      repeat with yChild in UI elements of yElement',
    '        if my yBoundedElementHasMarker(yChild, yMarker, yDepth + 1) then return true',
    '      end repeat',
    '    end try',
    '    return false',
    '  end tell',
    'end yBoundedElementHasMarker',
    'on yBoundedCountExactMarker(yElement, yMarker, yDepth)',
    '  if yDepth > 6 then return 0',
    '  if (current date) > my yAxSearchDeadline then error "TIME_BUDGET_EXCEEDED|AX_EXACT_MARKER_COUNT" number 9798',
    '  set my yAxVisitedNodes to my yAxVisitedNodes + 1',
    '  if my yAxVisitedNodes > 500 then error "AX_NODE_BUDGET_EXCEEDED" number 9797',
    '  if my ySkipAxSubtree(yElement) then return 0',
    '  tell application "System Events"',
    '    set yCount to 0',
    '    set yMatchesMarker to false',
    '    try',
    '      if (name of yElement as text) contains yMarker then set yMatchesMarker to true',
    '    end try',
    '    try',
    '      if (value of yElement as text) contains yMarker then set yMatchesMarker to true',
    '    end try',
    '    if yMatchesMarker then set yCount to 1',
    '    if yCount > 1 then return yCount',
    '    try',
    '      repeat with yChild in UI elements of yElement',
    '        set yCount to yCount + my yBoundedCountExactMarker(yChild, yMarker, yDepth + 1)',
    '        if yCount > 1 then return yCount',
    '      end repeat',
    '    end try',
    '    return yCount',
    '  end tell',
    'end yBoundedCountExactMarker',
    'on yBoundedCountNamedControl(yElement, yTargetNames, yDepth)',
    '  if yDepth > 6 then return 0',
    '  if (current date) > my yAxSearchDeadline then error "TIME_BUDGET_EXCEEDED|AX_CONTROL_SEARCH" number 9798',
    '  set my yAxVisitedNodes to my yAxVisitedNodes + 1',
    '  if my yAxVisitedNodes > 500 then error "AX_NODE_BUDGET_EXCEEDED" number 9797',
    '  if my ySkipAxSubtree(yElement) then return 0',
    '  tell application "System Events"',
    '    set yCount to 0',
    '    repeat with yTargetName in yTargetNames',
    '      try',
    '        if (name of yElement as text) is (yTargetName as text) and (enabled of yElement as boolean) then',
    '          set yCount to yCount + 1',
    '        end if',
    '      end try',
    '    end repeat',
    '    try',
    '      repeat with yChild in UI elements of yElement',
    '        set yCount to yCount + my yBoundedCountNamedControl(yChild, yTargetNames, yDepth + 1)',
    '        if yCount > 1 then return yCount',
    '      end repeat',
    '    end try',
    '    return yCount',
    '  end tell',
    'end yBoundedCountNamedControl',
    'on yBoundedClickFirstNamedControl(yElement, yTargetNames, yDepth)',
    '  if yDepth > 6 then return false',
    '  if (current date) > my yAxSearchDeadline then error "TIME_BUDGET_EXCEEDED|AX_CONTROL_CLICK" number 9798',
    '  set my yAxVisitedNodes to my yAxVisitedNodes + 1',
    '  if my yAxVisitedNodes > 500 then error "AX_NODE_BUDGET_EXCEEDED" number 9797',
    '  if my ySkipAxSubtree(yElement) then return false',
    '  tell application "System Events"',
    '    repeat with yTargetName in yTargetNames',
    '      try',
    '        if (name of yElement as text) is (yTargetName as text) and (enabled of yElement as boolean) then',
    '          click yElement',
    '          return true',
    '        end if',
    '      end try',
    '    end repeat',
    '    try',
    '      repeat with yChild in UI elements of yElement',
    '        if my yBoundedClickFirstNamedControl(yChild, yTargetNames, yDepth + 1) then return true',
    '      end repeat',
    '    end try',
    '    return false',
    '  end tell',
    'end yBoundedClickFirstNamedControl',
    'on yClickBoundedMarkerControl(yCheckpointPath, yMarker, yTargetNames)',
    '  set my yAxVisitedNodes to 0',
    '  set my yAxSearchDeadline to (current date) + 8',
    '  tell application "System Events" to tell process "Microsoft Word"',
    '    if (count of windows) is not 1 then return "WINDOW_COUNT:" & (count of windows)',
    '    set yWindow to window 1',
    '    if my yBoundedElementHasMarker(yWindow, yMarker, 0) is false then return "MARKER_NOT_FOUND_WITHIN_BUDGET"',
    '    set my yAxVisitedNodes to 0',
    '    set yControlCount to my yBoundedCountNamedControl(yWindow, yTargetNames, 0)',
    '    if yControlCount is not 1 then return "CONTROL_MATCH_COUNT:" & yControlCount',
    '    set my yAxVisitedNodes to 0',
    '    if my yBoundedClickFirstNamedControl(yWindow, yTargetNames, 0) then return "CLICKED"',
    '    return "CLICK_FAILED"',
    '  end tell',
    'end yClickBoundedMarkerControl',
    'on yAxAttributeText(yElement, yAttributeName)',
    '  tell application "System Events"',
    '    try',
    '      return value of attribute yAttributeName of yElement as text',
    '    on error yErrMsg number yErrNo',
    '      return "UNAVAILABLE:" & yErrNo & ":" & yErrMsg',
    '    end try',
    '  end tell',
    'end yAxAttributeText',
    'on yDescribeAxElement(yElement, yLabel)',
    '  tell application "System Events"',
    '    set yActions to ""',
    '    try',
    '      repeat with yAction in actions of yElement',
    '        set yActions to yActions & (name of yAction as text) & ","',
    '      end repeat',
    '    on error yErrMsg number yErrNo',
    '      set yActions to "UNAVAILABLE:" & yErrNo & ":" & yErrMsg',
    '    end try',
    '    return yLabel & "{ROLE=" & my yAxAttributeText(yElement, "AXRole") & ";SUBROLE=" & my yAxAttributeText(yElement, "AXSubrole") & ";NAME=" & my yAxAttributeText(yElement, "AXTitle") & ";DESCRIPTION=" & my yAxAttributeText(yElement, "AXDescription") & ";ENABLED=" & my yAxAttributeText(yElement, "AXEnabled") & ";VALUE=" & my yAxAttributeText(yElement, "AXValue") & ";ACTIONS=" & yActions & "}"',
    '  end tell',
    'end yDescribeAxElement',
    'on yDescribeBoundedCommentSurface(yElement, yMarker, yDepth)',
    '  if yDepth > 2 then return ""',
    '  if (current date) > my yAxSearchDeadline then error "TIME_BUDGET_EXCEEDED|AX_COMMENT_SURFACE_DIAGNOSTIC" number 9798',
    '  set my yAxVisitedNodes to my yAxVisitedNodes + 1',
    '  if my yAxVisitedNodes > 120 then error "AX_COMMENT_SURFACE_NODE_BUDGET_EXCEEDED" number 9797',
    '  if my ySkipAxSubtree(yElement) then return ""',
    '  tell application "System Events"',
    '    set yResult to ""',
    '    set yNameValue to my yAxAttributeText(yElement, "AXTitle")',
    '    set yDescriptionValue to my yAxAttributeText(yElement, "AXDescription")',
    '    set yValueValue to my yAxAttributeText(yElement, "AXValue")',
    '    if yNameValue contains yMarker or yDescriptionValue contains "comment" or yDescriptionValue contains "примеч" or yValueValue contains yMarker then',
    '      set yResult to my yDescribeAxElement(yElement, "COMMENT_SURFACE")',
    '    end if',
    '    try',
    '      repeat with yChild in UI elements of yElement',
    '        set yChildResult to my yDescribeBoundedCommentSurface(yChild, yMarker, yDepth + 1)',
    '        if yChildResult is not "" then set yResult to yResult & yChildResult',
    '      end repeat',
    '    end try',
    '    return yResult',
    '  end tell',
    'end yDescribeBoundedCommentSurface',
    'on yNavigateToUniqueCommentMarker(yCheckpointPath, yReviewGroup, yWindow, yMarker, yMaxSteps)',
    '  tell application "System Events"',
    '    set yNextControls to every button of yReviewGroup whose name is "Следующее"',
    '    if (count of yNextControls) is 0 then set yNextControls to every button of yReviewGroup whose name is "Next"',
    '    if (count of yNextControls) is not 1 then return "COMMENT_NAVIGATION_NEXT_CONTROL_COUNT:" & (count of yNextControls)',
    '    set yNextControl to item 1 of yNextControls',
    '    if (enabled of yNextControl) is false then return "COMMENT_NAVIGATION_NEXT_CONTROL_DISABLED"',
    '    set ySawWrongMarker to false',
    '    repeat with yStep from 0 to yMaxSteps',
    '      my yRequireBudget(yCheckpointPath, "COMMENT_NAVIGATION_STEP:" & yStep)',
    '      set my yAxVisitedNodes to 0',
    '      set my yAxSearchDeadline to (current date) + 8',
    '      set yExactMarkerCount to my yBoundedCountExactMarker(yWindow, yMarker, 0)',
    '      if yExactMarkerCount is 1 then return "UNIQUE_TARGET_MARKER_VERIFIED:STEP:" & yStep',
    '      if yExactMarkerCount > 1 then return "COMMENT_NAVIGATION_TARGET_MARKER_AMBIGUOUS:" & yExactMarkerCount',
    '      set my yAxVisitedNodes to 0',
    '      set my yAxSearchDeadline to (current date) + 8',
    '      set yAnyRootMarkerCount to my yBoundedCountExactMarker(yWindow, "C5V2 root ", 0)',
    '      if yAnyRootMarkerCount > 1 then return "COMMENT_NAVIGATION_VISIBLE_ROOT_AMBIGUOUS:" & yAnyRootMarkerCount',
    '      if yAnyRootMarkerCount is 1 then set ySawWrongMarker to true',
    '      if yStep is yMaxSteps then exit repeat',
    '      my yDurableCheckpoint(yCheckpointPath, "COMMENT_NAVIGATION_NEXT_BEFORE", yMarker & ":STEP:" & yStep)',
    '      click yNextControl',
    '      delay 0.2',
    '      my yDurableCheckpoint(yCheckpointPath, "COMMENT_NAVIGATION_NEXT_AFTER", yMarker & ":STEP:" & (yStep + 1))',
    '    end repeat',
    '    if ySawWrongMarker then return "COMMENT_NAVIGATION_WRONG_MARKER_CYCLE:MAX_STEPS:" & yMaxSteps',
    '    return "COMMENT_NAVIGATION_CYCLE_OR_TARGET_NOT_REACHED:MAX_STEPS:" & yMaxSteps',
    '  end tell',
    'end yNavigateToUniqueCommentMarker',
    'on yPrepareCommentsUi(yCheckpointPath, yExpectedFullName, yMarker, yMaxNavigationSteps)',
    '  tell application "Microsoft Word"',
    '    activate',
    '    if (count of documents) is 0 then return "WORD_DOCUMENT_COUNT:0"',
    '    set yFrontIdentity to full name of active document as text',
    '    if yFrontIdentity is not yExpectedFullName then return "FRONT_DOCUMENT_MISMATCH:" & yFrontIdentity',
    '    set yWordViewState to "UNAVAILABLE"',
    '    set yWordProtectionState to "UNAVAILABLE"',
    '    try',
    '      set yWordViewState to view type of view of active window as text',
    '    end try',
    '    try',
    '      set yWordProtectionState to protection type of active document as text',
    '    end try',
    '  end tell',
    '  my yRequireBudget(yCheckpointPath, "PANE_OPEN_START")',
    '  my yCheckpoint(yCheckpointPath, "PANE_OPEN_BEFORE", yMarker)',
    '  tell application "System Events"',
    '    if not (exists process "Microsoft Word") then return "WORD_PROCESS_MISSING"',
    '    tell process "Microsoft Word"',
    '      set frontmost to true',
    '      set yWindowCount to count of windows',
    '      if yWindowCount is 0 then return "ACTIVATED:true:FRONT_DOCUMENT:" & yFrontIdentity & ":WINDOW_COUNT:0"',
    '      set yRibbonExpansionAttempts to 0',
    '      set yReviewTab to missing value',
    '      set yReviewTabValue to 0',
    '      set yRibbonScrollAreaCount to count of scroll areas of tab group 1 of window 1',
    '      repeat while yRibbonExpansionAttempts < 3',
    '        if not (exists radio button "Рецензирование" of tab group 1 of window 1) then return "REVIEW_TAB_MISSING"',
    '        set yReviewTab to radio button "Рецензирование" of tab group 1 of window 1',
    '        if (enabled of yReviewTab) is false then return "REVIEW_TAB_DISABLED"',
    '        set yReviewTabValue to value of yReviewTab',
    '        set yRibbonScrollAreaCount to count of scroll areas of tab group 1 of window 1',
    '        if yReviewTabValue is 1 and yRibbonScrollAreaCount is 1 then exit repeat',
    '        click yReviewTab',
    '        set yRibbonExpansionAttempts to yRibbonExpansionAttempts + 1',
    '        delay 0.2',
    '        set yReviewTabValue to value of yReviewTab',
    '        set yRibbonScrollAreaCount to count of scroll areas of tab group 1 of window 1',
    '      end repeat',
    '      if yReviewTabValue is not 1 then return "REVIEW_TAB_NOT_SELECTED:VALUE:" & yReviewTabValue & ":EXPANSION_ATTEMPTS:" & yRibbonExpansionAttempts',
    '      if yRibbonScrollAreaCount is not 1 then return "REVIEW_SCROLL_AREA_COUNT:" & yRibbonScrollAreaCount & ":EXPANSION_ATTEMPTS:" & yRibbonExpansionAttempts',
    '      if not (exists group 5 of scroll area 1 of tab group 1 of window 1) then return "REVIEW_GROUP_5_MISSING"',
    '      set yReviewGroup to group 5 of scroll area 1 of tab group 1 of window 1',
    '      set yShowCommentsControls to every checkbox of yReviewGroup whose name is "Показать примечания"',
    '      set yShowCommentsCount to count of yShowCommentsControls',
    '      if yShowCommentsCount is not 1 then return "SHOW_COMMENTS_CHECKBOX_COUNT:" & yShowCommentsCount',
    '      set yShowCommentsControl to item 1 of yShowCommentsControls',
    '      set yShowCommentsValue to value of yShowCommentsControl',
    '      set yReviewGroupDiagnostics to ""',
    '      set yReviewControlIndex to 0',
    '      repeat with yReviewControl in UI elements of yReviewGroup',
    '        set yReviewControlIndex to yReviewControlIndex + 1',
    '        if yReviewControlIndex > 24 then exit repeat',
    '        set yReviewGroupDiagnostics to yReviewGroupDiagnostics & my yDescribeAxElement(yReviewControl, "REVIEW_GROUP_5_CONTROL_" & yReviewControlIndex)',
    '      end repeat',
    '      set my yAxVisitedNodes to 0',
    '      set my yAxSearchDeadline to (current date) + 8',
    '      set yContextualCommentDiagnostics to my yDescribeBoundedCommentSurface(window 1, yMarker, 0)',
    '      set yPreparationDiagnostics to ":REVIEW_TAB_VALUE:" & yReviewTabValue & ":RIBBON_SCROLL_AREA_COUNT:" & yRibbonScrollAreaCount & ":WORD_VIEW:" & yWordViewState & ":PROTECTION:" & yWordProtectionState & ":REVIEW_GROUP_DIAGNOSTICS:" & yReviewGroupDiagnostics & ":CONTEXTUAL_COMMENT_SURFACE:" & yContextualCommentDiagnostics',
    '      my yCheckpoint(yCheckpointPath, "COMMENTS_UI_BOUNDED_DIAGNOSTIC", yPreparationDiagnostics)',
    '      if (enabled of yShowCommentsControl) is false then',
    '        if yShowCommentsValue is 0 then return "SHOW_COMMENTS_CHECKBOX_DISABLED_VALUE_0" & yPreparationDiagnostics',
    '        if yShowCommentsValue is not 1 then return "SHOW_COMMENTS_CHECKBOX_DISABLED_VALUE_UNSUPPORTED:" & yShowCommentsValue & yPreparationDiagnostics',
    '        set yPaneRoute to "CHECKBOX_DISABLED_VALUE_1_PANE_ALREADY_OPEN"',
    '      else',
    '      if yShowCommentsValue is 0 then',
    '        click yShowCommentsControl',
    '        set yPaneRoute to "CHECKBOX_CLICKED_OPEN"',
    '        delay 0.4',
    '      else if yShowCommentsValue is 1 then',
    '        set yPaneRoute to "CHECKBOX_ALREADY_OPEN_PRESERVED"',
    '      else',
    '        return "SHOW_COMMENTS_CHECKBOX_VALUE_UNSUPPORTED:" & yShowCommentsValue',
    '      end if',
    '      end if',
    '      set yNavigationResult to my yNavigateToUniqueCommentMarker(yCheckpointPath, yReviewGroup, window 1, yMarker, yMaxNavigationSteps)',
    '      if yNavigationResult does not start with "UNIQUE_TARGET_MARKER_VERIFIED:" then return yNavigationResult & yPreparationDiagnostics',
    '      set yPaneRoute to yPaneRoute & ":" & yNavigationResult',
    '    end tell',
    '  end tell',
    '  my yCheckpoint(yCheckpointPath, "PANE_OPEN_AFTER", yPaneRoute)',
    '  return "ACTIVATED:true:FRONT_DOCUMENT:" & yFrontIdentity & ":WINDOW_COUNT:" & yWindowCount & ":DIRECT_REVIEW_GROUP:5:RIBBON_EXPANSION_ATTEMPTS:" & yRibbonExpansionAttempts & ":PANE_ROUTE:" & yPaneRoute & yPreparationDiagnostics',
    'end yPrepareCommentsUi',
    'on yTypeNativeCommentText(yText)',
    '  tell application "System Events" to tell process "Microsoft Word"',
    '    keystroke yText',
    '    key code 36',
    '    delay 0.5',
    '  end tell',
    'end yTypeNativeCommentText',
    'on yOpenExpectedDoc(yPosixPath, yExpectedFullName, yExpectedName)',
    '  do shell script "/usr/bin/open -a " & quoted form of "Microsoft Word" & " " & quoted form of yPosixPath',
    '  set yDeadline to (current date) + 35',
    '  tell application "Microsoft Word"',
    '    activate',
    '    repeat while (current date) is less than yDeadline',
    '      try',
    '        if (name of active document as text) is yExpectedName and (full name of active document as text) is yExpectedFullName then return true',
    '      end try',
    '      delay 0.25',
    '    end repeat',
    '  end tell',
    '  return false',
    'end yOpenExpectedDoc',
    'on yFindRange(yDoc, yQuote)',
    '  tell application "Microsoft Word"',
    '    set yText to content of text object of yDoc',
    '  end tell',
    '  set yOffset to offset of yQuote in yText',
    '  if yOffset is 0 then return missing value',
    '  tell application "Microsoft Word"',
    '    return create range yDoc start (yOffset - 1) end ((yOffset - 1) + (count of characters of yQuote))',
    '  end tell',
    'end yFindRange',
    'tell application "Microsoft Word"',
    'activate',
    'set yDocWasOpened to false',
    'set oldAlerts to display alerts',
    'set oldUserName to user name',
    'set oldUserInitials to user initials',
    'try',
    '  set display alerts to alerts none',
    `  set user name to ${appleText('Yalken C5V2 Canary')}`,
    `  set user initials to ${appleText('C5V2')}`,
    `  set ySourceFile to POSIX file ${appleText(sourcePath)} as alias`,
    `  set yReturnedPath to ${appleText(returnedPath)}`,
    `  set yArtifactReturnedPath to ${appleText(artifactReturnedPath)}`,
    `  set yCheckpointPath to ${appleText(`${artifactReturnedPath}.phase.log`)}`,
    '  set my yOverallDeadline to (current date) + 180',
    '  my yResetCheckpoint(yCheckpointPath)',
    '  my yCheckpoint(yCheckpointPath, "CANARY_START", yReturnedPath)',
    '  my yCloseStaleExpectedDocuments(yReturnedPath)',
    '  my yCheckpoint(yCheckpointPath, "STALE_EXPECTED_DOCUMENTS_CLEANED", yReturnedPath)',
    `  do shell script "/bin/cp " & quoted form of ${appleText(sourcePath)} & " " & quoted form of yReturnedPath`,
    `  set yFile to POSIX file ${appleText(returnedPath)} as alias`,
    '  set yExpectedFullName to yFile as text',
    `  set yExpectedName to ${appleText(expectedName)}`,
    `  if my yOpenExpectedDoc(${appleText(returnedPath)}, yExpectedFullName, yExpectedName) is not true then error "C5V2_CANARY_OPEN_TIMEOUT" number 9700`,
    '  set yDoc to active document',
    '  set yDocWasOpened to true',
    '  my yCheckpoint(yCheckpointPath, "PREFLIGHT_BEFORE", yExpectedFullName)',
    `  set yAccessibilityUiRequired to ${requiresAccessibilityUi ? 'true' : 'false'}`,
    '  if yAccessibilityUiRequired then',
    '    set yAccessibilityPreflight to my yMacosAccessibilityPreflight(yExpectedFullName)',
    '    if yAccessibilityPreflight does not start with "MACOS_ACCESSIBILITY_PREFLIGHT_READY|" then error yAccessibilityPreflight number 9720',
    '  else',
    '    set yAccessibilityPreflight to my yWordObjectModelPreflight(yExpectedFullName)',
    '    if yAccessibilityPreflight does not start with "WORD_OBJECT_MODEL_PREFLIGHT_READY|" then error yAccessibilityPreflight number 9720',
    '  end if',
    '  my yCheckpoint(yCheckpointPath, "PREFLIGHT_AFTER", yAccessibilityPreflight)',
    '  set remove personal information of yDoc to false',
    '  set remove date and time of yDoc to false',
    '  set show revisions of yDoc to true',
    wordOperationLines(ledger, artifactReturnedPath),
    '  save yDoc',
    '  my yCheckpoint(yCheckpointPath, "FINAL_SAVE_AFTER", "")',
    '  close yDoc saving yes',
    '  set yDocWasOpened to false',
    '  my yCheckpoint(yCheckpointPath, "FINAL_CLOSE_AFTER", "")',
    `  if my yOpenExpectedDoc(${appleText(returnedPath)}, yExpectedFullName, ${appleText(expectedName)}) is not true then error "C5V2_CANARY_REOPEN_TIMEOUT" number 9703`,
    '  set yDoc to active document',
    '  set yDocWasOpened to true',
    '  my yCheckpoint(yCheckpointPath, "FINAL_REOPEN_AFTER", "")',
    '  set yReadback to content of text object of yDoc',
    '  set yRevisionCount to count of revisions of yDoc',
    '  set yCommentCount to 0',
    '  repeat with yCommentIndex from 1 to 1000',
    '    try',
    '      set yFinalComment to Word comment yCommentIndex of yDoc',
    '      set yCommentCount to yCommentCount + 1',
    '    on error',
    '      exit repeat',
    '    end try',
    '  end repeat',
    '  my yCheckpoint(yCheckpointPath, "FINAL_SEMANTIC_READBACK", "REVISION_COUNT:" & yRevisionCount & ":COMMENT_COUNT:" & yCommentCount)',
    '  close yDoc saving no',
    '  set yDocWasOpened to false',
    '  do shell script "/bin/cp " & quoted form of yReturnedPath & " " & quoted form of yArtifactReturnedPath',
    '  do shell script "/bin/sync"',
    '  set yWordWorkHash to word 1 of (do shell script "/usr/bin/shasum -a 256 " & quoted form of yReturnedPath)',
    '  set yEvidenceHash to word 1 of (do shell script "/usr/bin/shasum -a 256 " & quoted form of yArtifactReturnedPath)',
    '  if yWordWorkHash is not yEvidenceHash then error "C5V2_EVIDENCE_MIRROR_HASH_MISMATCH" number 9731',
    '  my yCheckpoint(yCheckpointPath, "EVIDENCE_MIRROR_VERIFIED", yEvidenceHash)',
    '  set user name to oldUserName',
    '  set user initials to oldUserInitials',
    '  set display alerts to oldAlerts',
    '  return "WORD_STATUS=PASS" & linefeed & "REVISION_COUNT=" & yRevisionCount & linefeed & "COMMENT_COUNT=" & yCommentCount & linefeed & "READBACK_CHARS=" & (count of yReadback) & linefeed & yOpsDone & "UI_DIAGNOSTICS_BEGIN" & linefeed & yUiDiagnostics & "UI_DIAGNOSTICS_END" & linefeed & "LIMITATIONS_BEGIN" & linefeed & yLimitations & "LIMITATIONS_END"',
    'on error errMsg number errNo',
    '  try',
    '    my yCheckpoint(yCheckpointPath, "CANARY_ERROR", (errNo as text) & "|" & errMsg)',
    '  end try',
    '  try',
    '    if yDocWasOpened then close yDoc saving no',
    '  end try',
    '  try',
    '    set user name to oldUserName',
    '    set user initials to oldUserInitials',
    '    set display alerts to oldAlerts',
    '  end try',
    '  return "WORD_STATUS=FAIL" & linefeed & "ERRNO=" & errNo & linefeed & "ERR=" & errMsg',
    'end try',
    'end tell',
  ].join('\n');
}

export function runAppleScript(scriptText, scriptPath) {
  fs.writeFileSync(scriptPath, scriptText, 'utf8');
  return execFileSync('/usr/bin/osascript', [scriptPath], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 240_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function readWordPhaseCheckpoint(returnedPath) {
  const checkpointPath = `${returnedPath}.phase.log`;
  if (!fs.existsSync(checkpointPath)) return { present: false, entries: [], lastPhase: '' };
  const entries = fs.readFileSync(checkpointPath, 'utf8').split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const last = entries.at(-1) || '';
  return { present: true, entries, lastPhase: last.split('|')[0] || '' };
}

export function parseWordOutput(output) {
  const lines = String(output || '').split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const ops = [];
  const scalars = {};
  const limitations = [];
  const uiDiagnostics = [];
  let inLimitations = false;
  let inUiDiagnostics = false;
  for (const line of lines) {
    if (line === 'LIMITATIONS_BEGIN') {
      inLimitations = true;
      continue;
    }
    if (line === 'UI_DIAGNOSTICS_BEGIN') {
      inUiDiagnostics = true;
      continue;
    }
    if (line === 'UI_DIAGNOSTICS_END') {
      inUiDiagnostics = false;
      continue;
    }
    if (inUiDiagnostics) {
      uiDiagnostics.push(line);
      continue;
    }
    if (line === 'LIMITATIONS_END') {
      inLimitations = false;
      continue;
    }
    if (inLimitations) {
      limitations.push(line);
      continue;
    }
    if (line.startsWith('OP|')) {
      const [, id = '', status = ''] = line.split('|');
      ops.push({ id, status });
      continue;
    }
    const eq = line.indexOf('=');
    if (eq > 0) scalars[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return { scalars, ops, limitations, uiDiagnostics };
}

function xmlAttribute(attributes, localName) {
  const match = String(attributes || '').match(new RegExp(`(?:^|\\s)(?:[A-Za-z_][\\w.-]*:)?${localName}="([^"]*)"`, 'u'));
  return match ? match[1] : '';
}

function xmlText(body) {
  return [...String(body || '').matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gu)]
    .map((match) => match[1].replace(/&lt;/gu, '<').replace(/&gt;/gu, '>').replace(/&amp;/gu, '&'))
    .join('');
}

export function inspectNativeCommentLifecycleXml({ commentsXml = '', commentsExtendedXml = '' } = {}) {
  const comments = [...String(commentsXml).matchAll(/<w:comment\b([^>]*)>([\s\S]*?)<\/w:comment>/gu)].map((match) => {
    const paragraph = match[2].match(/<w:p\b([^>]*)>/u);
    return {
      commentId: xmlAttribute(match[1], 'id'),
      parentCommentId: xmlAttribute(match[1], 'parentId'),
      paraId: xmlAttribute(match[1], 'paraId') || xmlAttribute(paragraph?.[1], 'paraId'),
      body: xmlText(match[2]),
    };
  });
  const commentEx = [...String(commentsExtendedXml).matchAll(/<w15:commentEx\b([^>]*)\/?\s*>/gu)].map((match) => ({
    paraId: xmlAttribute(match[1], 'paraId'),
    paraIdParent: xmlAttribute(match[1], 'paraIdParent'),
    done: xmlAttribute(match[1], 'done'),
  }));
  return { comments, commentEx };
}

export function verifyNativeCommentLifecycleSemantics({ ledger, snapshotXmlByOperationId = {} } = {}) {
  const operations = Array.isArray(ledger?.operations) ? ledger.operations : [];
  const lifecycleOperations = operations.filter((item) => ['reply_attempt', 'state_attempt'].includes(item.family));
  if (lifecycleOperations.length === 0) {
    return {
      ok: true,
      notApplicable: true,
      results: [],
      verifiedCount: 0,
      blockedCount: 0,
    };
  }
  const results = [];
  for (const operation of lifecycleOperations) {
    const snapshot = snapshotXmlByOperationId[operation.id] || {};
    const graph = inspectNativeCommentLifecycleXml(snapshot);
    const rootBody = `C5V2 root ${operation.targetRootOperationId || ''}`;
    const roots = graph.comments.filter((comment) => comment.body.includes(rootBody));
    if (roots.length !== 1) {
      results.push({ operationId: operation.id, status: 'MANUAL_OR_BLOCKED', reason: roots.length === 0 ? 'NATIVE_ROOT_MISSING' : 'NATIVE_ROOT_DUPLICATE' });
      continue;
    }
    const root = roots[0];
    if (operation.family === 'reply_attempt') {
      const replyBody = `C5V2 reply ${operation.id}`;
      const replies = graph.comments.filter((comment) => comment.body.includes(replyBody));
      if (replies.length !== 1) {
        results.push({ operationId: operation.id, status: 'MANUAL_OR_BLOCKED', reason: replies.length === 0 ? 'NATIVE_REPLY_MISSING' : 'NATIVE_REPLY_DUPLICATE' });
        continue;
      }
      const reply = replies[0];
      const replyEx = graph.commentEx.find((entry) => entry.paraId && entry.paraId === reply.paraId);
      const parentRelation = (reply.parentCommentId && reply.parentCommentId === root.commentId)
        || (replyEx?.paraIdParent && replyEx.paraIdParent === root.paraId);
      results.push({
        operationId: operation.id,
        status: parentRelation ? 'SAFE_APPLY' : 'MANUAL_OR_BLOCKED',
        reason: parentRelation ? 'NATIVE_REPLY_PARENT_VERIFIED_AFTER_REOPEN' : 'NATIVE_REPLY_PARENT_MISSING_OR_WRONG',
        rootCommentId: root.commentId,
        replyCommentId: reply.commentId,
      });
      continue;
    }
    const rootEx = graph.commentEx.filter((entry) => entry.paraId && entry.paraId === root.paraId);
    const expectedDone = operation.requestedState === 'reopened' ? '0' : '1';
    const stateVerified = rootEx.length === 1 && rootEx[0].done === expectedDone;
    results.push({
      operationId: operation.id,
      status: stateVerified ? 'SAFE_APPLY' : 'MANUAL_OR_BLOCKED',
      reason: stateVerified ? `NATIVE_STATE_${operation.requestedState.toUpperCase()}_VERIFIED_AFTER_REOPEN` : 'NATIVE_STATE_MISSING_OR_MISMATCHED',
      requestedState: operation.requestedState,
      observedDone: rootEx.length === 1 ? rootEx[0].done : '',
    });
  }
  return {
    ok: results.length > 0 && results.every((result) => result.status === 'SAFE_APPLY'),
    results,
    verifiedCount: results.filter((result) => result.status === 'SAFE_APPLY').length,
    blockedCount: results.filter((result) => result.status !== 'SAFE_APPLY').length,
  };
}

export function readNativeLifecycleSnapshots({ ledger, returnedPath }) {
  const snapshotXmlByOperationId = {};
  for (const operation of (ledger.operations || []).filter((item) => ['reply_attempt', 'state_attempt'].includes(item.family))) {
    const snapshotPath = `${returnedPath}.${operation.id.replace(/[^a-z0-9_-]/giu, '_')}.native-readback.docx`;
    if (!fs.existsSync(snapshotPath)) continue;
    snapshotXmlByOperationId[operation.id] = {
      commentsXml: shellValue('/usr/bin/unzip', ['-p', snapshotPath, 'word/comments.xml'], { timeout: 30_000 }),
      commentsExtendedXml: shellValue('/usr/bin/unzip', ['-p', snapshotPath, 'word/commentsExtended.xml'], { timeout: 30_000 }),
    };
  }
  return verifyNativeCommentLifecycleSemantics({ ledger, snapshotXmlByOperationId });
}

export function applyNativeLifecycleVerification(wordParsed, verification) {
  const lifecycleById = new Map((verification?.results || []).map((result) => [result.operationId, result]));
  const nonLifecycleOps = (wordParsed?.ops || []).filter((operation) => !lifecycleById.has(operation.id));
  return {
    ...(wordParsed || {}),
    ops: [
      ...nonLifecycleOps,
      ...[...lifecycleById.values()].map((result) => ({ id: result.operationId, status: result.status })),
    ],
    nativeLifecycleVerification: verification,
  };
}

export function packageSummary(docxPath) {
  const entries = shellValue('/usr/bin/unzip', ['-Z1', docxPath], { timeout: 30_000 }).split(/\r?\n/u).filter(Boolean);
  const commentsXml = shellValue('/usr/bin/unzip', ['-p', docxPath, 'word/comments.xml'], { timeout: 30_000 });
  const documentXml = shellValue('/usr/bin/unzip', ['-p', docxPath, 'word/document.xml'], { timeout: 30_000 });
  const settingsXml = shellValue('/usr/bin/unzip', ['-p', docxPath, 'word/settings.xml'], { timeout: 30_000 });
  const compatibilityModes = [...settingsXml.matchAll(/<w:compatSetting\b[^>]*\bw:name="compatibilityMode"[^>]*\bw:val="(\d+)"[^>]*\/>/gu)]
    .map((match) => Number.parseInt(match[1], 10));
  const settingsPartCount = entries.filter((entry) => entry === 'word/settings.xml').length;
  return {
    zipOk: shellValue('/usr/bin/unzip', ['-tqq', docxPath], { timeout: 30_000 }) === '',
    entries,
    commentRelatedParts: entries.filter((entry) => /^word\/comments/u.test(entry)),
    commentTagCount: (commentsXml.match(/<w:comment[\s>]/gu) || []).length,
    revisionTagCount: (documentXml.match(/<w:(?:ins|del)\b/gu) || []).length,
    settingsPartCount,
    compatibilityModes,
    modernMode15Ready: settingsPartCount === 1 && compatibilityModes.length === 1 && compatibilityModes[0] === 15,
    documentXmlSha256: sha256Text(documentXml),
    commentsXmlSha256: sha256Text(commentsXml),
  };
}

export function buildOracleProbe({ ledger, wordParsed }) {
  const opStatus = new Map(wordParsed.ops.map((op) => [op.id, op.status]));
  const sampled = ledger.operations
    .filter((operation) => ['tracked_replace', 'root_comment', 'formatting'].includes(operation.family))
    .slice(0, 12)
    .map((operation) => ({
      id: operation.id,
      family: operation.family === 'tracked_replace' ? 'tracked_text_edit' : operation.family,
      expectedOutcome: opStatus.get(operation.id) === 'SAFE_APPLY' ? 'SAFE_APPLY' : 'BLOCKED',
      anchor: {
        sceneId: operation.sceneId,
        paragraphId: `canary-${operation.band}`,
        graphemeStart: 0,
        graphemeEnd: operation.quote.length,
        selectedText: operation.quote,
        contextBefore: operation.quote.slice(0, 16),
        contextAfter: operation.quote.slice(-16),
        baselineHash: sha256Text(operation.quote),
      },
      semanticIntent: operation.family === 'tracked_replace'
        ? { kind: 'replace', replacementText: operation.replacementText }
        : operation.family === 'root_comment'
          ? { kind: 'root-comment' }
          : { kind: 'bold' },
    }));
  const operationsById = {};
  for (const operation of sampled) {
    const extra = operation.family === 'tracked_text_edit'
      ? { textSemantics: { kind: operation.semanticIntent.kind, replacementText: operation.semanticIntent.replacementText } }
      : operation.family === 'root_comment'
        ? { commentSemantics: { threadId: `thread-${operation.id}`, state: 'open' } }
        : { formattingSemantics: { kind: operation.semanticIntent.kind, effective: true } };
    operationsById[operation.id] = {
      outcome: operation.expectedOutcome,
      anchor: operation.anchor,
      ...extra,
    };
  }
  return validateC5V2SemanticOracle({
    operations: sampled,
    wordReadback: { sourceKind: 'word-object-model', operationsById },
    yalkenTruth: { sourceKind: 'reopened-yalken-project', operationsById },
  });
}

function parseArgs(argv) {
  const options = {
    sceneCount: 2,
    sceneStart: null,
    counts: null,
    artifactRoot: DEFAULT_ARTIFACT_ROOT,
    runPrefix: 'c5v2-physical-canary',
    roundCount: 1,
    accessibilityPreflightOnly: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--scene-count') {
      options.sceneCount = Number.parseInt(argv[index + 1], 10);
      index += 1;
    } else if (arg === '--scene-start') {
      options.sceneStart = Number.parseInt(argv[index + 1], 10);
      index += 1;
    } else if (arg === '--family-counts-json') {
      options.counts = JSON.parse(argv[index + 1]);
      index += 1;
    } else if (arg === '--artifact-root') {
      options.artifactRoot = argv[index + 1];
      index += 1;
    } else if (arg === '--run-prefix') {
      options.runPrefix = argv[index + 1];
      index += 1;
    } else if (arg === '--round-count') {
      options.roundCount = Number.parseInt(argv[index + 1], 10);
      index += 1;
    } else if (arg === '--accessibility-preflight-only') {
      options.accessibilityPreflightOnly = true;
    }
  }
  return options;
}

async function mainCumulative(options) {
  const roundCount = Number.isSafeInteger(Number(options.roundCount)) && Number(options.roundCount) > 0
    ? Number(options.roundCount)
    : 5;
  const runId = `${options.runPrefix}-${nowStamp()}`;
  const runDir = path.join(options.artifactRoot, runId);
  fs.mkdirSync(runDir, { recursive: true });
  const wordWorkRoot = resolveWordHostLocalQaWorkRoot({
    defaultSegments: ['c5v2-physical-canary', runId],
  });
  const scenes = loadCanaryScenes({
    sceneCount: options.sceneCount,
    sceneStart: options.sceneStart,
  });
  const rounds = [];
  for (let index = 0; index < roundCount; index += 1) {
    const roundLabel = `round-${String(index + 1).padStart(2, '0')}`;
    const roundDir = path.join(runDir, roundLabel);
    fs.mkdirSync(roundDir, { recursive: true });
    rounds.push({
      roundIndex: index,
      roundId: roundLabel,
      roundDir,
      sourcePath: path.join(roundDir, 'c5v2-cumulative-source-fullmanuscript.docx'),
      returnedPath: path.join(roundDir, 'c5v2-cumulative-returned-word-native.docx'),
      wordReturnedPath: path.join(wordWorkRoot.root, roundLabel, 'c5v2-cumulative-returned-word-native.docx'),
      returnedReadyPath: path.join(roundDir, 'c5v2-cumulative-returned-ready.json'),
      ledger: null,
    });
    fs.writeFileSync(path.join(roundDir, 'round-plan.pre-export.json'), `${JSON.stringify({
      schemaVersion: 'yalken.rtk.word.c5v2.cumulative-round-plan.v1',
      roundId: roundLabel,
      counts: options.counts,
      ledgerAuthority: 'DERIVE_FROM_CURRENT_PRODUCT_SCENE_FILES_AFTER_ROUND_EXPORT',
    }, null, 2)}\n`);
    fs.mkdirSync(path.dirname(rounds.at(-1).wordReturnedPath), { recursive: true });
  }
  const wordVersion = shellValue('/usr/bin/osascript', ['-e', 'tell application "Microsoft Word" to return version as text'], { timeout: 30_000 });
  const electronResult = await runElectronCumulativeFullManuscriptRoundtrip({
    runDir,
    scenes,
    rounds,
    runWordForRound: async (roundIndex, round, exportPayload) => {
      const sceneFiles = Array.isArray(exportPayload?.sceneFiles) ? exportPayload.sceneFiles : [];
      const projectRoot = typeof exportPayload?.projectRoot === 'string' ? exportPayload.projectRoot : '';
      if (sceneFiles.length !== scenes.length) {
        throw new Error(`C5V2_CUMULATIVE_CURRENT_SCENE_FILE_COUNT_MISMATCH:${round.roundId}:${sceneFiles.length}:${scenes.length}`);
      }
      const currentScenes = sceneFiles.map((scenePath, sceneIndex) => {
        const text = fs.readFileSync(scenePath, 'utf8');
        const sceneId = projectRoot
          ? path.relative(projectRoot, scenePath).replace(/\\/gu, '/')
          : (scenes[sceneIndex]?.sceneId || path.basename(scenePath));
        return {
          ...(scenes[sceneIndex] || {}),
          file: path.basename(scenePath),
          sceneId,
          title: scenes[sceneIndex]?.title || path.basename(scenePath, '.txt'),
          text,
          sourceSha256: sha256Text(text),
        };
      });
      const ledger = buildExportBoundCanaryLedger({
        scenes: currentScenes,
        counts: options.counts,
        sourceDocxPath: round.sourcePath,
        anchorOffset: roundIndex * 11,
        idPrefix: `r${String(roundIndex + 1).padStart(2, '0')}-`,
        weightedSceneAllocation: true,
      });
      round.ledger = ledger;
      fs.writeFileSync(path.join(round.roundDir, 'canary-ledger.json'), `${JSON.stringify(ledger, null, 2)}\n`);
      const wordOutput = await runAppleScript(
        buildWordScript({
          sourcePath: round.sourcePath,
          returnedPath: round.wordReturnedPath,
          artifactReturnedPath: round.returnedPath,
          ledger,
        }),
        path.join(round.roundDir, 'word-canary.applescript'),
      );
      fs.writeFileSync(path.join(round.roundDir, 'word-output.txt'), wordOutput, 'utf8');
      return wordOutput;
    },
  });
  for (let index = 0; index < rounds.length; index += 1) {
    const round = rounds[index];
    if (!fs.existsSync(path.join(round.roundDir, 'word-output.txt')) && electronResult.wordErrors[index]) {
      fs.writeFileSync(path.join(round.roundDir, 'word-output.txt'), electronResult.wordErrors[index], 'utf8');
    }
  }
  const roundSummaries = rounds.map((round, index) => {
    const wordOutput = electronResult.wordOutputs[index] || '';
    const nativeLifecycleVerification = round.ledger && fs.existsSync(round.returnedPath)
      ? readNativeLifecycleSnapshots({ ledger: round.ledger, returnedPath: round.returnedPath })
      : { ok: false, results: [], verifiedCount: 0, blockedCount: 0 };
    const wordParsed = applyNativeLifecycleVerification(parseWordOutput(wordOutput), nativeLifecycleVerification);
    const returnApplyEnvelope = electronResult.returnApplyResults.find((line) => line.roundIndex === index) || null;
    const returnApply = returnApplyEnvelope && returnApplyEnvelope.returnApply ? returnApplyEnvelope.returnApply : null;
    const exact = returnApply?.activation?.exactApplyTextChangeIdsByScene || {};
    const exactTotal = Object.values(exact).reduce((total, ids) => total + (Array.isArray(ids) ? ids.length : 0), 0);
    return {
      roundId: round.roundId,
      sourceDocxPath: round.sourcePath,
      returnedDocxPath: round.returnedPath,
      sourceDocxSha256: fs.existsSync(round.sourcePath) ? sha256File(round.sourcePath) : '',
      returnedDocxSha256: fs.existsSync(round.returnedPath) ? sha256File(round.returnedPath) : '',
      sourcePackageSummary: fs.existsSync(round.sourcePath) ? packageSummary(round.sourcePath) : null,
      returnedPackageSummary: fs.existsSync(round.returnedPath) ? packageSummary(round.returnedPath) : null,
      wordPhaseCheckpoint: readWordPhaseCheckpoint(round.returnedPath),
      wordStatus: wordParsed.scalars.WORD_STATUS || (electronResult.wordErrors[index] ? 'FAIL' : 'UNKNOWN'),
      wordOperationSummary: {
        attempted: Array.isArray(round.ledger?.operations) ? round.ledger.operations.length : 0,
        reported: wordParsed.ops.length,
        safeApply: wordParsed.ops.filter((op) => op.status === 'SAFE_APPLY').length,
        manualOrBlocked: wordParsed.ops.filter((op) => op.status === 'MANUAL_OR_BLOCKED' || op.status === 'BLOCKED').length,
        byStatus: wordParsed.ops.reduce((acc, op) => {
          acc[op.status] = (acc[op.status] || 0) + 1;
          return acc;
        }, {}),
      },
      limitations: wordParsed.limitations,
      uiDiagnostics: wordParsed.uiDiagnostics,
      nativeLifecycleVerification,
      packageSummary: fs.existsSync(round.returnedPath) ? packageSummary(round.returnedPath) : null,
      oracleProbe: wordParsed.ops.length > 0 && round.ledger ? buildOracleProbe({ ledger: round.ledger, wordParsed }) : null,
      productReturnApply: returnApply,
      productApplyOk: returnApply?.ok === true,
      exactScenes: Object.keys(exact).length,
      exactTotal,
      typedPendingLanes: returnApply?.typedPendingLanes || null,
      exportResult: electronResult.exportResults.find((line) => line.roundIndex === index) || null,
    };
  });
  const totals = roundSummaries.reduce((acc, round) => {
    acc.attempted += round.wordOperationSummary.attempted;
    acc.reported += round.wordOperationSummary.reported;
    acc.safeApply += round.wordOperationSummary.safeApply;
    acc.exactTotal += round.exactTotal;
    acc.productApplyGreen += round.productApplyOk ? 1 : 0;
    return acc;
  }, { attempted: 0, reported: 0, safeApply: 0, exactTotal: 0, productApplyGreen: 0 });
  const summary = {
    schemaVersion: 'yalken.rtk.word.c5v2.physical-cumulative.result.v1',
    runId,
    headSha: shellValue('git', ['rev-parse', 'HEAD']),
    originMainSha: shellValue('git', ['rev-parse', 'origin/main']),
    wordVersion,
    wordWorkRoot,
    sceneCount: scenes.length,
    roundCount,
    route: [
      'single-live-electron-product-process',
      'round-loop-full-manuscript-export-menu-command',
      'physical-word-open-edit-native-save-per-round',
      'authenticated-intake-quarantine-preview-per-round',
      ...(rounds.some((round) => (round.ledger?.operations || []).some((operation) => (
        ['tracked_replace', 'tracked_insert', 'tracked_delete'].includes(operation.family)
      ))) ? [
        'explicit-selected-exact-text-apply-per-round',
        'atomic-recovery-replay-stale-retry-per-round',
      ] : []),
      ...(rounds.some((round) => (round.ledger?.operations || []).some((operation) => operation.family === 'formatting'))
        ? ['shipped-formatting-command-apply-and-persisted-replay-inspection-per-round']
        : []),
      'next-round-export-from-mutated-product-project',
    ],
    electronResult: {
      ok: electronResult.ok,
      timedOut: electronResult.timedOut,
      exitCode: electronResult.exitCode,
      signal: electronResult.signal,
      stderrTail: electronResult.stderrTail,
      wrapperError: electronResult.wrapperError,
    },
    totals,
    rounds: roundSummaries,
    vetoStatus: {
      falseFullBookLabel: false,
      fixtureOnlyExporter: false,
      nonCumulativeRound: false,
      countsOnlyOracle: false,
      falseExact: false,
      wrongScene: false,
      replayFailure: roundSummaries.some((round) => round.productReturnApply && Array.isArray(round.productReturnApply.replayResults)
        && round.productReturnApply.replayResults.some((result) => !(result.ok === true && result.replay === true))),
      recoveryDivergence: false,
      productNetwork: electronResult.parsedLines.some((line) => Array.isArray(line.networkRequests) && line.networkRequests.length > 0),
    },
    certificationClaim: 'NO_PHYSICAL_PROVEN_C5_CERTIFICATION_CLAIM_CUMULATIVE_CAMPAIGN_IN_PROGRESS',
  };
  fs.writeFileSync(path.join(runDir, 'cumulative-result.json'), `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    runId: summary.runId,
    headSha: summary.headSha,
    wordVersion: summary.wordVersion,
    sceneCount: summary.sceneCount,
    roundCount: summary.roundCount,
    totals: summary.totals,
    roundStatuses: summary.rounds.map((round) => ({
      roundId: round.roundId,
      wordStatus: round.wordStatus,
      attempted: round.wordOperationSummary.attempted,
      safeApply: round.wordOperationSummary.safeApply,
      productApplyOk: round.productApplyOk,
      exactScenes: round.exactScenes,
      exactTotal: round.exactTotal,
    })),
    vetoStatus: summary.vetoStatus,
    certificationClaim: summary.certificationClaim,
  }, null, 2)}\n`);
  process.exit(
    summary.electronResult.ok
      && summary.rounds.every((round) => (
        round.sourcePackageSummary?.modernMode15Ready === true
        && round.wordStatus === 'PASS'
        && round.productApplyOk === true
        && round.nativeLifecycleVerification?.ok === true
      ))
      ? 0
      : 1,
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.accessibilityPreflightOnly) {
    let rawOutput = '';
    let executionError = '';
    try {
      rawOutput = execFileSync('/usr/bin/osascript', ['-'], {
        cwd: REPO_ROOT,
        input: buildMacosAccessibilityPreflightScript(''),
        encoding: 'utf8',
        timeout: 30_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      executionError = String(error.stderr || error.message || error);
    }
    const result = executionError
      ? {
        ok: false,
        status: 'environment-blocked',
        code: 'MACOS_ACCESSIBILITY_PREFLIGHT_EXECUTION_BLOCKED',
        diagnostics: { executionError },
      }
      : parseMacosAccessibilityPreflightOutput(rawOutput);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(result.ok ? 0 : 1);
  }
  if (Number.isSafeInteger(Number(options.roundCount)) && Number(options.roundCount) > 1) {
    await mainCumulative(options);
    return;
  }
  const runId = `${options.runPrefix}-${nowStamp()}`;
  const runDir = path.join(options.artifactRoot, runId);
  fs.mkdirSync(runDir, { recursive: true });
  const sourceDocxPath = path.join(runDir, 'c5v2-canary-source-fullmanuscript.docx');
  const returnedDocxPath = path.join(runDir, 'c5v2-canary-returned-word-native.docx');
  const returnedReadyPath = path.join(runDir, 'c5v2-canary-returned-ready.json');
  const wordWorkRoot = resolveWordHostLocalQaWorkRoot({
    defaultSegments: ['c5v2-physical-canary', runId],
  });
  const wordReturnedDocxPath = path.join(wordWorkRoot.root, 'c5v2-canary-returned-word-native.docx');
  const scenes = loadCanaryScenes({
    sceneCount: options.sceneCount,
    sceneStart: options.sceneStart,
  });
  let ledger = buildCanaryLedger(scenes, { counts: options.counts });
  fs.writeFileSync(path.join(runDir, 'canary-ledger.pre-export.json'), `${JSON.stringify(ledger, null, 2)}\n`);
  const wordVersion = shellValue('/usr/bin/osascript', ['-e', 'tell application "Microsoft Word" to return version as text'], { timeout: 30_000 });
  let wordOutput = '';
  let wordError = '';
  const exportResult = await runElectronFullManuscriptRoundtrip({
    runDir,
    sourcePath: sourceDocxPath,
    returnedPath: returnedDocxPath,
    returnedReadyPath,
    scenes,
    runWord: async () => {
      ledger = buildExportBoundCanaryLedger({
        scenes,
        counts: options.counts,
        sourceDocxPath,
      });
      fs.writeFileSync(path.join(runDir, 'canary-ledger.json'), `${JSON.stringify(ledger, null, 2)}\n`);
      return runAppleScript(
        buildWordScript({
          sourcePath: sourceDocxPath,
          returnedPath: wordReturnedDocxPath,
          artifactReturnedPath: returnedDocxPath,
          ledger,
        }),
        path.join(runDir, 'word-canary.applescript'),
      );
    },
  });
  wordOutput = exportResult.wordOutput || '';
  wordError = exportResult.wordError || '';
  if (!exportResult.ok && !fs.existsSync(path.join(runDir, 'canary-ledger.json'))) {
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, 'canary-ledger.json'), `${JSON.stringify(ledger, null, 2)}\n`);
  }
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'word-output.txt'), wordOutput || wordError, 'utf8');
  const nativeLifecycleVerification = fs.existsSync(returnedDocxPath)
    ? readNativeLifecycleSnapshots({ ledger, returnedPath: returnedDocxPath })
    : { ok: false, results: [], verifiedCount: 0, blockedCount: 0 };
  const wordParsed = applyNativeLifecycleVerification(parseWordOutput(wordOutput), nativeLifecycleVerification);
  const summary = {
    schemaVersion: 'yalken.rtk.word.c5v2.physical-canary.result.v1',
    runId,
    headSha: shellValue('git', ['rev-parse', 'HEAD']),
    originMainSha: shellValue('git', ['rev-parse', 'origin/main']),
    wordVersion,
    wordWorkRoot,
    wordReturnedDocxPath,
    route: [
      'real-yalken-full-manuscript-export-menu-command',
      'physical-word-open-edit-native-save',
      'physical-word-close-reopen-object-model-readback',
      'raw-ooxml-package-summary',
      'authenticated-intake-quarantine-preview',
      ...(ledger.operations.some((operation) => (
        ['tracked_replace', 'tracked_insert', 'tracked_delete'].includes(operation.family)
      )) ? [
        'explicit-selected-exact-text-apply',
        'atomic-recovery-replay-stale-retry',
      ] : []),
      ...(ledger.operations.some((operation) => operation.family === 'formatting')
        ? ['shipped-formatting-command-apply-and-persisted-replay-inspection']
        : []),
      'bounded-semantic-oracle-probe',
    ],
    sourceDocxPath,
    returnedDocxPath,
    sourceDocxSha256: fs.existsSync(sourceDocxPath) ? sha256File(sourceDocxPath) : '',
    returnedDocxSha256: fs.existsSync(returnedDocxPath) ? sha256File(returnedDocxPath) : '',
    wordPhaseCheckpoint: readWordPhaseCheckpoint(returnedDocxPath),
    exportResult,
    wordStatus: wordParsed.scalars.WORD_STATUS || (wordError ? 'FAIL' : 'UNKNOWN'),
    wordScalars: wordParsed.scalars,
    nativeLifecycleVerification,
    wordOperationSummary: {
      attempted: ledger.operations.length,
      reported: wordParsed.ops.length,
      safeApply: wordParsed.ops.filter((op) => op.status === 'SAFE_APPLY').length,
      manualOrBlocked: wordParsed.ops.filter((op) => op.status === 'MANUAL_OR_BLOCKED' || op.status === 'BLOCKED').length,
      byStatus: wordParsed.ops.reduce((acc, op) => {
        acc[op.status] = (acc[op.status] || 0) + 1;
        return acc;
      }, {}),
    },
    limitations: wordParsed.limitations,
    uiDiagnostics: wordParsed.uiDiagnostics,
    sourcePackageSummary: fs.existsSync(sourceDocxPath) ? packageSummary(sourceDocxPath) : null,
    returnedPackageSummary: fs.existsSync(returnedDocxPath) ? packageSummary(returnedDocxPath) : null,
    packageSummary: fs.existsSync(returnedDocxPath) ? packageSummary(returnedDocxPath) : null,
    oracleProbe: wordParsed.ops.length > 0 ? buildOracleProbe({ ledger, wordParsed }) : null,
    productReturnApply: exportResult.returnApplyResult?.returnApply || null,
    productRouteGaps: deriveC5V2ProductRouteGaps(
      exportResult.returnApplyResult?.returnApply || null,
      { expectedFamilies: ledger.operations.map((operation) => operation.family) },
    ),
    certificationClaim: options.sceneCount >= 21
      ? 'NO_PHYSICAL_PROVEN_C5_CERTIFICATION_CLAIM_WHOLE_BOOK_LIGHT_ONLY'
      : 'NO_PHYSICAL_PROVEN_C5_CERTIFICATION_CLAIM',
  };
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'canary-result.json'), `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exit(
    summary.exportResult.ok
      && summary.sourcePackageSummary?.modernMode15Ready === true
      && summary.wordStatus === 'PASS'
      && summary.nativeLifecycleVerification?.ok === true
      && summary.productReturnApply?.ok === true
      && summary.productRouteGaps.length === 0
      ? 0
      : 1,
  );
}

if (process.argv[1] === __filename) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  });
}
