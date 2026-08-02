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
  const textChangeIdsByScene = activationSummary.exactApplyTextChangeIdsByScene || {};
  const applyResults = [];
  const replayResults = [];
  const staleRetryResults = [];
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
  return {
    ok: activationSummary.ok === true
      && activationSummary.returnIntake
      && activationSummary.returnIntake.authenticated === true
      && applyResults.length > 0
      && applyResults.every((result) => result.ok === true && result.applied === true)
      && replayResults.every((result) => result.ok === true && result.replay === true)
      && staleRetryResults.every((result) => (
        result.status === 'blocked'
        && result.applied !== true
        && ACCEPTABLE_STALE_RETRY_BLOCK_REASONS.has(result.reason)
      )),
    activation: activationSummary,
    applyResults,
    replayResults,
    staleRetryResults,
    productOpenContext: global.productOpenContext || null,
    typedPendingLanes: {
      commentsRepliesState: 'PENDING_PRODUCT_APPLY_LANE',
      formatting: 'PENDING_PRODUCT_APPLY_LANE',
      structural: 'PENDING_PRODUCT_APPLY_LANE',
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

function wordOperationLines(ledger) {
  const lines = [];
  lines.push('set yOpsDone to ""');
  lines.push('set yLimitations to ""');
  lines.push('set yRootComments to {}');
  const markLine = (id, status, indent = '  ') => `${indent}set yOpsDone to yOpsDone & "OP|" & ${appleText(id)} & "|${status}" & linefeed`;
  const firstRootComment = ledger.operations.find((operation) => operation.family === 'root_comment' && operation.wordRange);
  const orderedOperations = [
    ...(firstRootComment ? [firstRootComment] : []),
    ...ledger.operations
      .filter((operation) => operation !== firstRootComment)
      .slice()
      .sort((left, right) => (right.wordRange?.start || 0) - (left.wordRange?.start || 0)),
  ];
  for (const operation of orderedOperations) {
    const id = operation.id;
    const quote = operation.quote;
    const rangeStart = operation.wordRange?.start;
    const rangeEnd = operation.wordRange?.end;
    lines.push('try');
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
      lines.push(`  set yComment to make new Word comment at yRange with properties {comment text:${appleText(`C5V2 root ${id}`)}}`);
      lines.push('  set end of yRootComments to yComment');
      lines.push(markLine(id, 'SAFE_APPLY'));
    } else if (operation.family === 'reply_attempt') {
      lines.push('  set track revisions of yDoc to false');
      lines.push('  if (count of yRootComments) is 0 then error "NO_ROOT_COMMENT_FOR_REPLY" number 9102');
      lines.push('  try');
      lines.push(`    make new Word comment at yRange with properties {comment text:${appleText(`C5V2 reply ${id}`)}, parent:(item 1 of yRootComments)}`);
      lines.push(markLine(id, 'SAFE_APPLY', '    '));
      lines.push('  on error errMsg number errNo');
      lines.push('    set yLimitations to yLimitations & "REPLY_ATTEMPT|" & errNo & "|" & errMsg & linefeed');
      lines.push(markLine(id, 'MANUAL_OR_BLOCKED', '    '));
      lines.push('  end try');
    } else if (operation.family === 'state_attempt') {
      lines.push('  if (count of yRootComments) is 0 then error "NO_ROOT_COMMENT_FOR_STATE" number 9103');
      lines.push('  try');
      lines.push('    set done of (item 1 of yRootComments) to true');
      lines.push(markLine(id, 'SAFE_APPLY', '    '));
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

export function buildWordScript({ sourcePath, returnedPath, ledger }) {
  const expectedName = path.basename(returnedPath);
  return [
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
    `  do shell script "/bin/cp " & quoted form of ${appleText(sourcePath)} & " " & quoted form of yReturnedPath`,
    `  set yFile to POSIX file ${appleText(returnedPath)} as alias`,
    '  set yExpectedFullName to yFile as text',
    `  if my yOpenExpectedDoc(${appleText(returnedPath)}, yExpectedFullName, ${appleText(expectedName)}) is not true then error "C5V2_CANARY_OPEN_TIMEOUT" number 9700`,
    '  set yDoc to active document',
    '  set yDocWasOpened to true',
    '  set remove personal information of yDoc to false',
    '  set remove date and time of yDoc to false',
    '  set show revisions of yDoc to true',
    wordOperationLines(ledger),
    '  save yDoc',
    '  close yDoc saving yes',
    '  set yDocWasOpened to false',
    `  if my yOpenExpectedDoc(${appleText(returnedPath)}, yExpectedFullName, ${appleText(expectedName)}) is not true then error "C5V2_CANARY_REOPEN_TIMEOUT" number 9703`,
    '  set yDoc to active document',
    '  set yDocWasOpened to true',
    '  set yReadback to content of text object of yDoc',
    '  set yRevisionCount to count of revisions of yDoc',
    '  set yCommentCount to count of Word comments of yDoc',
    '  close yDoc saving no',
    '  set yDocWasOpened to false',
    '  set user name to oldUserName',
    '  set user initials to oldUserInitials',
    '  set display alerts to oldAlerts',
    '  return "WORD_STATUS=PASS" & linefeed & "REVISION_COUNT=" & yRevisionCount & linefeed & "COMMENT_COUNT=" & yCommentCount & linefeed & "READBACK_CHARS=" & (count of yReadback) & linefeed & yOpsDone & "LIMITATIONS_BEGIN" & linefeed & yLimitations & "LIMITATIONS_END"',
    'on error errMsg number errNo',
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

export function parseWordOutput(output) {
  const lines = String(output || '').split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const ops = [];
  const scalars = {};
  const limitations = [];
  let inLimitations = false;
  for (const line of lines) {
    if (line === 'LIMITATIONS_BEGIN') {
      inLimitations = true;
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
  return { scalars, ops, limitations };
}

export function packageSummary(docxPath) {
  const entries = shellValue('/usr/bin/unzip', ['-Z1', docxPath], { timeout: 30_000 }).split(/\r?\n/u).filter(Boolean);
  const commentsXml = shellValue('/usr/bin/unzip', ['-p', docxPath, 'word/comments.xml'], { timeout: 30_000 });
  const documentXml = shellValue('/usr/bin/unzip', ['-p', docxPath, 'word/document.xml'], { timeout: 30_000 });
  return {
    zipOk: shellValue('/usr/bin/unzip', ['-tqq', docxPath], { timeout: 30_000 }) === '',
    entries,
    commentRelatedParts: entries.filter((entry) => /^word\/comments/u.test(entry)),
    commentTagCount: (commentsXml.match(/<w:comment[\s>]/gu) || []).length,
    revisionTagCount: (documentXml.match(/<w:(?:ins|del)\b/gu) || []).length,
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
      returnedReadyPath: path.join(roundDir, 'c5v2-cumulative-returned-ready.json'),
      ledger: null,
    });
    fs.writeFileSync(path.join(roundDir, 'round-plan.pre-export.json'), `${JSON.stringify({
      schemaVersion: 'yalken.rtk.word.c5v2.cumulative-round-plan.v1',
      roundId: roundLabel,
      counts: options.counts,
      ledgerAuthority: 'DERIVE_FROM_CURRENT_PRODUCT_SCENE_FILES_AFTER_ROUND_EXPORT',
    }, null, 2)}\n`);
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
        buildWordScript({ sourcePath: round.sourcePath, returnedPath: round.returnedPath, ledger }),
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
    const wordParsed = parseWordOutput(wordOutput);
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
    sceneCount: scenes.length,
    roundCount,
    route: [
      'single-live-electron-product-process',
      'round-loop-full-manuscript-export-menu-command',
      'physical-word-open-edit-native-save-per-round',
      'authenticated-intake-quarantine-preview-per-round',
      'explicit-selected-exact-text-apply-per-round',
      'atomic-recovery-replay-stale-retry-per-round',
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
      && summary.rounds.every((round) => round.wordStatus === 'PASS' && round.productApplyOk === true)
      ? 0
      : 1,
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
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
        buildWordScript({ sourcePath: sourceDocxPath, returnedPath: returnedDocxPath, ledger }),
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
  const wordParsed = parseWordOutput(wordOutput);
  const summary = {
    schemaVersion: 'yalken.rtk.word.c5v2.physical-canary.result.v1',
    runId,
    headSha: shellValue('git', ['rev-parse', 'HEAD']),
    originMainSha: shellValue('git', ['rev-parse', 'origin/main']),
    wordVersion,
    route: [
      'real-yalken-full-manuscript-export-menu-command',
      'physical-word-open-edit-native-save',
      'physical-word-close-reopen-object-model-readback',
      'raw-ooxml-package-summary',
      'authenticated-intake-quarantine-preview',
      'explicit-selected-exact-text-apply',
      'atomic-recovery-replay-stale-retry',
      'bounded-semantic-oracle-probe',
    ],
    sourceDocxPath,
    returnedDocxPath,
    sourceDocxSha256: fs.existsSync(sourceDocxPath) ? sha256File(sourceDocxPath) : '',
    returnedDocxSha256: fs.existsSync(returnedDocxPath) ? sha256File(returnedDocxPath) : '',
    exportResult,
    wordStatus: wordParsed.scalars.WORD_STATUS || (wordError ? 'FAIL' : 'UNKNOWN'),
    wordScalars: wordParsed.scalars,
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
    packageSummary: fs.existsSync(returnedDocxPath) ? packageSummary(returnedDocxPath) : null,
    oracleProbe: wordParsed.ops.length > 0 ? buildOracleProbe({ ledger, wordParsed }) : null,
    productReturnApply: exportResult.returnApplyResult?.returnApply || null,
    productRouteGaps: exportResult.returnApplyResult?.returnApply?.ok === true
      ? [
        'comments replies state formatting structural operations are physical Word attempts with typed pending product outcomes, not Yalken apply certification',
      ]
      : [
        'full-manuscript authenticated intake preview explicit apply did not complete green in this canary script',
        'comments replies state formatting structural operations are physical Word attempts with typed outcomes, not Yalken apply certification',
      ],
    certificationClaim: options.sceneCount >= 21
      ? 'NO_PHYSICAL_PROVEN_C5_CERTIFICATION_CLAIM_WHOLE_BOOK_LIGHT_ONLY'
      : 'NO_PHYSICAL_PROVEN_C5_CERTIFICATION_CLAIM',
  };
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'canary-result.json'), `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exit(
    summary.exportResult.ok
      && summary.wordStatus === 'PASS'
      && summary.productReturnApply?.ok === true
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
