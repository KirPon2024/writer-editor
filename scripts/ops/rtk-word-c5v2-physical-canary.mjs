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
import { buildC5V2Ledger } from './rtk-word-c5v2-ledger-engine.mjs';
import { resolveWordHostLocalQaWorkRoot } from './rtk-word-sandbox-work-root.mjs';
import { parseObservablePayload } from '../../src/renderer/documentContentEnvelope.mjs';

const require = createRequire(import.meta.url);
const electronBinary = require('electron');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RESULT_PREFIX = 'YALKEN_C5V2_CANARY_RESULT ';
const DEFAULT_ARTIFACT_ROOT = '/Volumes/T7-Secure/storage/yalken/word-safety-remediation-v1/current/c5v2-physical-canary';
const CORPUS_SCENE_ROOT = '/Volumes/T7-Secure/storage/yalken/word-safety-remediation-v1/current/c5-fullbook-certification/corpus/scenes';
const CORPUS_RAW_PATH = '/Volumes/T7-Secure/storage/yalken/word-safety-remediation-v1/current/c5-fullbook-certification/corpus/pg174-raw.txt';
const CORPUS_CLEANED_PATH = '/Volumes/T7-Secure/storage/yalken/word-safety-remediation-v1/current/c5-fullbook-certification/corpus/dorian-gray-cleaned-scenes.txt';

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

export function writeJsonAtomicDurable(filePath, value) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`);
  const fd = fs.openSync(tempPath, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tempPath, filePath);
  const dirFd = fs.openSync(dir, 'r');
  try {
    fs.fsyncSync(dirFd);
  } finally {
    fs.closeSync(dirFd);
  }
  return { path: filePath, sha256: sha256File(filePath) };
}

export function copyFileAtomicDurable(sourcePath, filePath) {
  const bytes = fs.readFileSync(sourcePath);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`);
  const fd = fs.openSync(tempPath, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tempPath, filePath);
  const dirFd = fs.openSync(dir, 'r');
  try {
    fs.fsyncSync(dirFd);
  } finally {
    fs.closeSync(dirFd);
  }
  return { path: filePath, sha256: `sha256:${sha256Bytes(bytes)}`, bytes: bytes.length };
}

export function shellValue(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd: options.cwd || REPO_ROOT,
      encoding: 'utf8',
      timeout: options.timeout || 30_000,
      maxBuffer: options.maxBuffer || (256 * 1024 * 1024),
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
  const seenStructuralParagraphScopes = new Set();
  const boundOperations = ledger.operations.map((operation) => {
    if (operation.physicalAction === 'typed-limit') return operation;
    const locatorQuote = operation.locatorQuote || operation.quote;
    const locatorStart = docxText.indexOf(locatorQuote);
    if (locatorStart < 0) {
      throw new Error(`C5V2_CANARY_SOURCE_ANCHOR_NOT_IN_EXPORTED_DOCX:${operation.id}`);
    }
    const second = docxText.indexOf(locatorQuote, locatorStart + 1);
    if (second >= 0) {
      throw new Error(`C5V2_CANARY_SOURCE_ANCHOR_NOT_UNIQUE_IN_EXPORTED_DOCX:${operation.id}`);
    }
    const selectionOffset = Number.isSafeInteger(operation.locatorSelectionStart)
      ? operation.locatorSelectionStart
      : 0;
    const start = locatorStart + selectionOffset;
    const end = start + operation.quote.length;
    if (docxText.slice(start, end) !== operation.quote) {
      throw new Error(`C5V2_CANARY_LOCATOR_SELECTION_MISMATCH:${operation.id}`);
    }
    if (seenStarts.has(start)) {
      throw new Error(`C5V2_CANARY_DUPLICATE_SOURCE_RANGE:${operation.id}`);
    }
    seenStarts.add(start);
    const paragraphStart = docxText.lastIndexOf('\r', Math.max(0, start - 1)) + 1;
    const nextParagraphBreak = docxText.indexOf('\r', start + operation.quote.length);
    const paragraphEnd = nextParagraphBreak >= 0 ? nextParagraphBreak : docxText.length;
    const paragraphText = docxText.slice(paragraphStart, paragraphEnd);
    if (operation.family === 'structural') {
      const structuralScopeKey = `${paragraphStart}:${paragraphEnd}`;
      if (seenStructuralParagraphScopes.has(structuralScopeKey)) {
        throw new Error(`C5V2_CANARY_DUPLICATE_STRUCTURAL_PARAGRAPH_SCOPE:${operation.id}`);
      }
      seenStructuralParagraphScopes.add(structuralScopeKey);
    }
    return {
      ...operation,
      wordRange: {
        sourceKind: 'raw-exported-docx-document-xml',
        start,
        end,
        selectedTextSha256: sha256Text(operation.quote),
        locatorTextSha256: sha256Text(locatorQuote),
        locatorSelectionStart: selectionOffset,
      },
      structuralParagraphScope: operation.family === 'structural'
        ? {
            sourceKind: 'raw-exported-docx-document-xml-paragraph',
            start: paragraphStart,
            end: paragraphEnd,
            selectedText: paragraphText,
            selectedTextSha256: sha256Text(paragraphText),
          }
        : undefined,
    };
  });
  return {
    ...ledger,
    sourceDocxTextSha256: sha256Text(docxText),
    operations: boundOperations,
  };
}

function graphemeParts(value) {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return Array.from(segmenter.segment(String(value || '')), (part) => part.segment);
  }
  return Array.from(String(value || ''));
}

function productParagraphs(value) {
  return String(value || '')
    .replace(/\r\n/gu, '\n')
    .replace(/\r/gu, '\n')
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

function documentTextBlocks(doc) {
  const blocks = [];
  const inlineText = (node) => {
    if (!node || typeof node !== 'object') return '';
    if (node.type === 'text') return typeof node.text === 'string' ? node.text : '';
    if (node.type === 'hardBreak') return '\n';
    return (Array.isArray(node.content) ? node.content : []).map((child) => inlineText(child)).join('');
  };
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (['paragraph', 'heading', 'codeBlock'].includes(node.type)) {
      blocks.push({
        type: node.type,
        attrs: node.attrs && typeof node.attrs === 'object' ? structuredClone(node.attrs) : {},
        text: inlineText(node),
        node,
      });
      return;
    }
    for (const child of (Array.isArray(node.content) ? node.content : [])) visit(child);
  };
  visit(doc);
  return blocks;
}

export function readProductSceneAuthority(rawContent) {
  const parsed = parseObservablePayload(String(rawContent || ''));
  if (parsed?.issue) {
    throw new Error(`C5V2_PRODUCT_SCENE_OBSERVABLE_PAYLOAD_INVALID:${parsed.issue.reason || parsed.issue.code || 'UNKNOWN'}`);
  }
  const blocks = parsed?.doc ? documentTextBlocks(parsed.doc) : productParagraphs(parsed?.text || '');
  const paragraphs = blocks.map((block) => (typeof block === 'string' ? block : block.text));
  return {
    rawContent: String(rawContent || ''),
    rawContentSha256: sha256Text(rawContent),
    text: parsed?.text || '',
    textSha256: sha256Text(parsed?.text || ''),
    doc: parsed?.doc || null,
    blocks: parsed?.doc ? blocks : [],
    paragraphs,
  };
}

function buildUniquePhysicalLocator({ paragraphText, graphemeStart, graphemeEnd, sourceDocxText, operationId }) {
  const parts = graphemeParts(paragraphText);
  const selectedText = parts.slice(graphemeStart, graphemeEnd).join('');
  if (!selectedText) throw new Error(`C5V2_PHYSICAL_SELECTED_TEXT_REQUIRED:${operationId}`);
  for (const radius of [8, 16, 24, 32, 48, 64, 96, 128, 192, 256, parts.length]) {
    const start = Math.max(0, graphemeStart - radius);
    const end = Math.min(parts.length, graphemeEnd + radius);
    const locatorQuote = parts.slice(start, end).join('');
    if (locatorQuote.length < selectedText.length) continue;
    if (countExactOccurrences(sourceDocxText, locatorQuote) !== 1) continue;
    return {
      quote: selectedText,
      locatorQuote,
      locatorSelectionStart: parts.slice(start, graphemeStart).join('').length,
    };
  }
  throw new Error(`C5V2_PHYSICAL_UNIQUE_LOCATOR_EXHAUSTED:${operationId}`);
}

export function adaptC5V2MasterRoundToPhysicalLedger({ masterLedger, currentScenes, roundNumber, sourceDocxPath }) {
  if (!masterLedger || masterLedger.gates?.ok !== true) throw new Error('C5V2_MASTER_LEDGER_GREEN_REQUIRED');
  if (!Number.isInteger(roundNumber) || roundNumber < 1 || roundNumber > masterLedger.roundCount) {
    throw new Error('C5V2_MASTER_LEDGER_ROUND_INVALID');
  }
  const sourceDocxText = docxDocumentWordText(sourceDocxPath);
  const sceneById = new Map((Array.isArray(currentScenes) ? currentScenes : []).map((scene) => [scene.sceneId, scene]));
  const masterOperations = masterLedger.operations.filter((operation) => operation.round === roundNumber);
  const rootPhysicalById = new Map();
  const operations = [];
  for (const operation of masterOperations.filter((item) => !['reply', 'comment_state'].includes(item.family))) {
    const scene = sceneById.get(operation.sceneId);
    if (!scene) throw new Error(`C5V2_PHYSICAL_SCENE_AUTHORITY_MISSING:${operation.id}:${operation.sceneId}`);
    const paragraphs = Array.isArray(scene.paragraphs) && scene.paragraphs.length > 0
      ? scene.paragraphs
      : productParagraphs(scene.text);
    const paragraph = paragraphs[operation.anchor?.paragraphOrdinal];
    if (typeof paragraph !== 'string') throw new Error(`C5V2_PHYSICAL_PARAGRAPH_AUTHORITY_MISSING:${operation.id}`);
    const locator = buildUniquePhysicalLocator({
      paragraphText: paragraph,
      graphemeStart: operation.anchor.graphemeStart,
      graphemeEnd: operation.anchor.graphemeEnd,
      sourceDocxText,
      operationId: operation.id,
    });
    if (locator.quote !== operation.anchor.selectedText) {
      throw new Error(`C5V2_PHYSICAL_MASTER_ANCHOR_STALE:${operation.id}`);
    }
    const family = operation.family === 'tracked_text_edit'
      ? `tracked_${operation.semanticIntent.kind}`
      : operation.family;
    const physical = {
      id: operation.id,
      formalFamily: operation.family,
      family,
      sceneId: operation.sceneId,
      band: operation.anchor.positionalThird,
      expectedOutcome: operation.expectedOutcome,
      semanticIntent: operation.semanticIntent,
      replacementText: operation.semanticIntent?.replacementText || '',
      formattingKind: operation.semanticIntent?.kind || '',
      headingLevel: operation.semanticIntent?.headingLevel || 2,
      masterAnchor: operation.anchor,
      ...locator,
    };
    operations.push(physical);
    if (operation.family === 'root_comment') rootPhysicalById.set(operation.id, physical);
  }
  for (const operation of masterOperations.filter((item) => ['reply', 'comment_state'].includes(item.family))) {
    const root = rootPhysicalById.get(operation.targetRootOperationId);
    if (!root) throw new Error(`C5V2_PHYSICAL_LIFECYCLE_ROOT_MISSING:${operation.id}`);
    operations.push({
      id: operation.id,
      formalFamily: operation.family,
      family: operation.family === 'reply' ? 'reply_attempt' : 'state_attempt',
      sceneId: operation.sceneId,
      band: operation.anchor?.positionalThird || root.band,
      expectedOutcome: operation.expectedOutcome,
      semanticIntent: operation.semanticIntent,
      masterAnchor: operation.anchor,
      targetRootOperationId: operation.targetRootOperationId,
      requestedState: operation.semanticIntent?.kind || '',
      physicalAction: 'typed-limit',
    });
  }
  const familyCounts = operations.reduce((acc, operation) => {
    acc[operation.family] = (acc[operation.family] || 0) + 1;
    return acc;
  }, {});
  const unbound = {
    schemaVersion: 'yalken.rtk.word.c5v2.physical-master-round-ledger.v1',
    topology: 'one-full-manuscript-project-cumulative-rounds',
    roundNumber,
    masterLedgerDigest: masterLedger.ledgerDigest,
    operationCount: operations.length,
    familyCounts,
    scenes: masterLedger.sceneProfiles,
    operations,
  };
  return bindLedgerToSourceDocxOffsets({ ledger: unbound, sourceDocxPath, sourceDocxText });
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
        && !message.startsWith('C5V2_CANARY_DUPLICATE_STRUCTURAL_PARAGRAPH_SCOPE:')
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
    const rawText = fs.readFileSync(sourcePath, 'utf8');
    const text = rawText
      .split(/\n{2,}/u)
      .map((paragraph) => paragraph.replace(/\s+/gu, ' ').trim())
      .filter((paragraph) => paragraph.trim().length > 40)
      .join('\n\n')
      .trim();
    return {
      ...scene,
      sourcePath,
      text,
      rawSourceSha256: sha256Text(rawText),
      cleanedSourceSha256: sha256Text(text),
      sourceSha256: sha256Text(text),
    };
  });
  if (options.includeMultilingualQa !== true) return baseScenes;
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

function uniqueStructuralParagraphPhrases(text, maxCount) {
  const normalizedText = String(text || '').replace(/\s+/gu, ' ');
  const paragraphs = String(text || '').split(/\n{2,}/u)
    .map((paragraph) => paragraph.replace(/\s+/gu, ' ').trim())
    .filter((paragraph) => paragraph.length >= 40);
  const seen = new Set();
  const out = [];
  function candidatesForParagraph(paragraph) {
    const sentences = paragraph.match(/[^.!?;:]{28,90}[.!?;:]?/gu) || [];
    const words = paragraph.match(/[\p{L}\p{N}][\p{L}\p{N}’'-]*|[^\s]/gu) || [];
    const wordCandidates = [];
    for (let start = 0; start < words.length; start += 6) {
      const phrase = words.slice(start, start + 12).join(' ')
        .replace(/\s+([,.;:!?])/gu, '$1')
        .replace(/([“‘])\s+/gu, '$1')
        .replace(/\s+([”’])/gu, '$1');
      wordCandidates.push(phrase);
    }
    return [...sentences, ...wordCandidates]
      .map((phrase) => String(phrase || '').trim().replace(/"/gu, "'"))
      .filter((phrase) => phrase.length >= 24 && phrase.length <= 96);
  }
  for (const paragraph of paragraphs) {
    const paragraphStart = normalizedText.indexOf(paragraph);
    if (paragraphStart < 0) continue;
    const paragraphEnd = paragraphStart + paragraph.length;
    const paragraphOccurrences = countExactOccurrences(normalizedText, paragraph);
    if (paragraphOccurrences !== 1) continue;
    const candidate = candidatesForParagraph(paragraph).find((phrase) => (
      !seen.has(phrase)
      && normalizedText.indexOf(phrase) >= paragraphStart
      && normalizedText.indexOf(phrase) < paragraphEnd
      && countExactOccurrences(normalizedText, phrase) === 1
    ));
    if (!candidate) continue;
    seen.add(candidate);
    out.push(candidate);
    if (out.length >= maxCount) break;
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
  const structuralPhrasesByScene = new Map(scenes.map((scene) => [
    scene.sceneId,
    uniqueStructuralParagraphPhrases(scene.text, 260),
  ]));
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
    const phrases = family === 'structural'
      ? structuralPhrasesByScene.get(scene.sceneId) || []
      : phrasesByScene.get(scene.sceneId) || [];
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
      expectedOutcome: family.includes('attempt')
        ? 'MANUAL_OR_BLOCKED'
        : family === 'tracked_insert'
          ? 'MANUAL'
          : ['tracked_replace', 'tracked_delete'].includes(family)
            ? 'EXACT'
            : 'SAFE_APPLY',
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
  const structuralCandidateCount = Math.max(
    Number(graphCounts.structuralChanges || 0),
    Number(activationSummary?.structuralProductPath?.candidateCount || 0),
  );
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
    structuralMixedWithOtherMutationLane: hasStructure && (hasExactText || hasComments || hasFormatting),
  };
}

export function deriveC5V2ProductRouteGaps(returnApply = {}, options = {}) {
  const normalizedReturnApply = returnApply && typeof returnApply === 'object'
    ? returnApply
    : {};
  const lanes = normalizedReturnApply.typedPendingLanes && typeof normalizedReturnApply.typedPendingLanes === 'object'
    ? normalizedReturnApply.typedPendingLanes
    : {};
  const expectedFamilies = new Set(
    Array.isArray(options.expectedFamilies)
      ? options.expectedFamilies.filter((family) => typeof family === 'string' && family)
      : [],
  );
  const expectedFamilyCounts = options.expectedFamilyCounts && typeof options.expectedFamilyCounts === 'object'
    ? options.expectedFamilyCounts
    : {};
  const gaps = [];
  if (normalizedReturnApply.ok !== true) {
    gaps.push('full-manuscript authenticated intake preview explicit apply did not complete green in this canary script');
  }
  if (lanes.exactText === 'PENDING_PRODUCT_APPLY_LANE') gaps.push('exact text operations remain typed pending product outcomes');
  const rootCommentsExpected = Number(expectedFamilyCounts.root_comment || 0) > 0;
  const exactTextExpected = Number(normalizedReturnApply.lanePlan?.expectedCounts?.exactText || 0) > 0;
  if (rootCommentsExpected && lanes.rootCommentsState === 'PENDING_ROOT_COMMENT_PRODUCT_APPLY_LANE') {
    gaps.push('root comment operations remain typed pending product outcomes');
  }
  if (lanes.formatting === 'PENDING_PRODUCT_APPLY_LANE') gaps.push('formatting operations remain typed pending product outcomes');
  if (lanes.formatting === 'BLOCKED_MIXED_LANE_ATOMICITY_REQUIRED') gaps.push('formatting is blocked until mixed return lanes share one atomic product transaction');
  if (lanes.structural === 'PENDING_PRODUCT_APPLY_LANE') gaps.push('structural operations remain typed pending product outcomes');
  if (
    expectedFamilies.has('formatting')
    && (!lanes.formatting || lanes.formatting === 'NO_FORMATTING_CANDIDATE')
  ) {
    gaps.push('formatting was required by the physical ledger but produced no product candidate');
  }
  if (
    exactTextExpected
    && (!lanes.exactText || lanes.exactText === 'NO_EXACT_TEXT_CANDIDATE')
  ) {
    gaps.push('tracked text was required by the physical ledger but produced no product candidate');
  }
  if (
    [...expectedFamilies].some((family) => ['root_comment', 'reply_attempt', 'state_attempt'].includes(family))
    && (!lanes.commentsRepliesState || lanes.commentsRepliesState === 'NO_COMMENT_CANDIDATE')
  ) {
    gaps.push('comments or lifecycle work was required by the physical ledger but produced no product candidate');
  }
  if (
    expectedFamilies.has('structural')
    && (!lanes.structural || lanes.structural === 'NO_STRUCTURAL_CANDIDATE')
  ) {
    gaps.push('structure was required by the physical ledger but produced no product candidate');
  }
  const expectedStructuralCount = Number(expectedFamilyCounts.structural || 0);
  if (expectedStructuralCount > 0 && lanes.structural === 'PRODUCT_APPLY_AND_REPLAY_VERIFIED') {
    const appliedStructuralCount = Number(
      normalizedReturnApply.structuralApplyResult?.reviewSurface?.structuralReturnPreview?.operationCount || 0,
    );
    const candidateStructuralCount = Number(normalizedReturnApply.lanePlan?.structuralCandidateCount || 0);
    if (appliedStructuralCount !== expectedStructuralCount || candidateStructuralCount !== expectedStructuralCount) {
      gaps.push(`structural ledger expected ${expectedStructuralCount} operations but product applied ${appliedStructuralCount} from ${candidateStructuralCount} candidates`);
    }
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
function writeChildJsonAtomicDurable(filePath, value) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = path.join(dir, '.' + path.basename(filePath) + '.' + process.pid + '.' + crypto.randomBytes(8).toString('hex') + '.tmp');
  const fd = fs.openSync(tempPath, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\\n', 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tempPath, filePath);
  const dirFd = fs.openSync(dir, 'r');
  try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
  return { path: filePath, sha256: sha256ChildText(fs.readFileSync(filePath, 'utf8')) };
}
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
async function captureReopenedYalkenTruth(win, roundId, returnedPath) {
  const passes = [];
  for (let pass = 1; pass <= 2; pass += 1) {
    const passResults = [];
    for (const context of global.productSceneContexts || []) {
      const treeProbe = await win.webContents.executeJavaScript(
        "window.electronAPI.invokeWorkspaceQueryBridge({queryId:'query.projectTree',payload:{tab:'roman'}})",
        true,
      );
      const resolved = findTreeNodeByPathSuffix(treeProbe && treeProbe.root, context.relativePath) || context;
      const openResult = await invokeUiCommand(win, 'cmd.project.document.open', {
        nodeId: typeof resolved.nodeId === 'string' ? resolved.nodeId : context.nodeId,
        sceneId: context.relativePath,
      });
      passResults.push({
        sceneId: context.relativePath,
        ok: openResult && openResult.ok === true,
        nodeId: typeof resolved.nodeId === 'string' ? resolved.nodeId : context.nodeId,
      });
      if (!openResult || openResult.ok !== true) {
        throw new Error('C5V2_REOPENED_YALKEN_SCENE_OPEN_FAILED:' + roundId + ':' + context.relativePath);
      }
    }
    passes.push({ pass, scenes: passResults });
  }
  const sceneReadback = (global.productSceneContexts || []).map((context) => {
    const rawContent = fs.readFileSync(context.nodePath, 'utf8');
    return {
      sceneId: context.relativePath,
      nodePath: context.nodePath,
      rawContent,
      rawContentSha256: sha256ChildText(rawContent),
    };
  });
  const artifactPath = path.join(path.dirname(returnedPath), 'yalken-reopened-truth.json');
  const artifact = {
    schemaVersion: 'yalken.rtk.word.c5v2.reopened-yalken-truth.v1',
    roundId,
    sourceKind: 'reopened-yalken-project',
    reopenPassCount: 2,
    passes,
    sceneReadback,
    projectRoot: global.productProjectRoot || '',
    createdAtUtc: new Date().toISOString(),
  };
  const written = writeChildJsonAtomicDurable(artifactPath, artifact);
  return {
    path: written.path,
    sha256: written.sha256,
    sceneCount: sceneReadback.length,
    reopenPassCount: artifact.reopenPassCount,
    allOpenGreen: passes.every((pass) => pass.scenes.every((scene) => scene.ok === true)),
  };
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
    structuralProductPath: result && result.structuralProductPath
      ? {
        prepared: result.structuralProductPath.prepared === true,
        status: result.structuralProductPath.status || '',
        code: result.structuralProductPath.code || '',
        candidateCount: Number.isSafeInteger(result.structuralProductPath.candidateCount)
          ? result.structuralProductPath.candidateCount
          : 0,
        sceneCount: Number.isSafeInteger(result.structuralProductPath.sceneCount)
          ? result.structuralProductPath.sceneCount
          : 0,
        diagnosticCount: Number.isSafeInteger(result.structuralProductPath.diagnosticCount)
          ? result.structuralProductPath.diagnosticCount
          : 0,
        writerCalled: result.structuralProductPath.writerCalled === true,
        rendererAuthority: result.structuralProductPath.rendererAuthority === true,
      }
      : null,
    reviewGraphCounts: {
      textChanges: textChanges.length,
      commentThreads: commentThreads.length,
      commentPlacements: commentPlacements.length,
      structuralChanges: structuralChanges.length,
    },
    commentThreadDiagnostics: commentThreads.map((thread) => ({
      threadId: thread && typeof thread.threadId === 'string' ? thread.threadId : '',
      commentId: thread && typeof thread.commentId === 'string' ? thread.commentId : '',
      sceneId: thread && typeof thread.sceneId === 'string' ? thread.sceneId : '',
      targetScope: thread && thread.targetScope ? thread.targetScope : null,
      status: thread && typeof thread.status === 'string' ? thread.status : '',
      doneResolvedReopenedState: thread && typeof thread.doneResolvedReopenedState === 'string'
        ? thread.doneResolvedReopenedState
        : '',
      messages: Array.isArray(thread?.messages) ? thread.messages.map((message) => ({
        messageId: message && typeof message.messageId === 'string' ? message.messageId : '',
        body: message && typeof message.body === 'string' ? message.body : '',
      })) : [],
    })),
    commentPlacementDiagnostics: commentPlacements.map((placement) => ({
      threadId: placement && typeof placement.threadId === 'string' ? placement.threadId : '',
      quote: placement && typeof placement.quote === 'string' ? placement.quote : '',
      targetScope: placement && placement.targetScope ? placement.targetScope : null,
      nativeCommentId: placement && typeof placement.nativeCommentId === 'string' ? placement.nativeCommentId : '',
    })),
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
  await waitUntil(() => returnedReadyPath && fs.existsSync(returnedReadyPath), 'RETURNED_DOCX_READY_FOR_PRODUCT_INTAKE', 3_600_000);
  await waitUntil(() => returnedPath && fs.existsSync(returnedPath), 'RETURNED_DOCX_FILE_FOR_PRODUCT_INTAKE', 30000);
  const expectedLedgerPath = path.join(path.dirname(returnedPath), 'canary-ledger.json');
  await waitUntil(() => fs.existsSync(expectedLedgerPath), 'EXPECTED_CANARY_LEDGER_NOT_DURABLY_VISIBLE', 30000);
  const expectedLedger = JSON.parse(fs.readFileSync(expectedLedgerPath, 'utf8'));
  const expectedOperations = Array.isArray(expectedLedger?.operations) ? expectedLedger.operations : [];
  if (expectedOperations.length === 0) throw new Error('EXPECTED_CANARY_LEDGER_OPERATIONS_REQUIRED');
  const expectedFamilyCount = (family) => expectedOperations.filter((operation) => operation.family === family).length;
  const expectedExactTextCount = expectedOperations.filter((operation) => (
    ['tracked_replace', 'tracked_insert', 'tracked_delete'].includes(operation.family)
    && operation.expectedOutcome === 'EXACT'
  )).length;
  const expectedRootCommentCount = expectedFamilyCount('root_comment');
  const expectedReplyCount = expectedFamilyCount('reply_attempt');
  const expectedCommentStateCount = expectedFamilyCount('state_attempt');
  const expectedFormattingCount = expectedFamilyCount('formatting');
  const expectedStructuralCount = expectedFamilyCount('structural');
  const expectedTypedLifecycleCount = expectedOperations.filter((operation) => (
    ['reply_attempt', 'state_attempt'].includes(operation.family) && operation.physicalAction === 'typed-limit'
  )).length;
  const expectedLifecycleCount = expectedOperations.filter((operation) => (
    ['reply_attempt', 'state_attempt'].includes(operation.family)
  )).length;
  const returnedBytes = fs.readFileSync(returnedPath);
  progress('return-activation-start', { requestPrefix, returnedBytes: returnedBytes.length });
  const activation = await invokeUiCommand(win, 'cmd.project.review.activateDocxReviewPreviewSession', {
    requestId: 'c5v2-physical-canary-authenticated-return-activation-' + requestPrefix,
    bufferSource: returnedBytes.toString('base64'),
  });
  const activationSummary = summarizeActivation(activation);
  const lanePlan = deriveC5V2ReturnLanePlan(activationSummary);
  const mutationFamiliesByScene = new Map();
  for (const operation of expectedOperations) {
    const mutationFamily = ['tracked_replace', 'tracked_insert', 'tracked_delete'].includes(operation.family)
      ? 'exactText'
      : operation.family === 'formatting'
        ? 'formatting'
        : operation.family === 'structural'
          ? 'structural'
          : '';
    if (!mutationFamily || !operation.sceneId) continue;
    const families = mutationFamiliesByScene.get(operation.sceneId) || new Set();
    families.add(mutationFamily);
    mutationFamiliesByScene.set(operation.sceneId, families);
  }
  const mixedSceneConflicts = [...mutationFamiliesByScene.entries()]
    .filter(([, families]) => families.size > 1)
    .map(([sceneId, families]) => ({ sceneId, families: [...families].sort() }));
  lanePlan.expectedCounts = {
    exactText: expectedExactTextCount,
    rootComments: expectedRootCommentCount,
    formatting: expectedFormattingCount,
    structural: expectedStructuralCount,
    typedLifecycle: expectedTypedLifecycleCount,
  };
  lanePlan.mixedSceneConflicts = mixedSceneConflicts;
  progress('return-activation-complete', {
    ok: activationSummary.ok === true,
    formattingCandidateCount: lanePlan.formattingCandidateCount,
    exactTextCandidateCount: lanePlan.exactTextCandidateCount,
    commentCandidateCount: lanePlan.commentCandidateCount,
    structuralCandidateCount: lanePlan.structuralCandidateCount,
  });
  const textChangeIdsByScene = activationSummary.exactApplyTextChangeIdsByScene || {};
  const applyResults = [];
  const replayResults = [];
  const staleRetryResults = [];
  let formattingApplyResult = null;
  let formattingReplayInspection = null;
  let structuralApplyResult = null;
  let structuralReplayInspection = null;
  if ((lanePlan.formattingMixedWithOtherMutationLane || lanePlan.structuralMixedWithOtherMutationLane) && mixedSceneConflicts.length > 0) {
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
      structuralApplyResult,
      structuralReplayInspection,
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
        formatting: lanePlan.hasFormatting ? 'BLOCKED_MIXED_LANE_ATOMICITY_REQUIRED' : 'NO_FORMATTING_CANDIDATE',
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
    progress('formatting-apply-start', { candidateCount: lanePlan.formattingCandidateCount });
    formattingApplyResult = await invokeUiCommand(win, 'cmd.project.review.applyFormattingReturn', {
      requestId: 'c5v2-physical-canary-formatting-apply-' + requestPrefix,
    });
    progress('formatting-apply-complete', {
      ok: formattingApplyResult?.ok === true,
      applied: formattingApplyResult?.applied === true,
      replayVerified: formattingApplyResult?.replayVerified === true,
      code: formattingApplyResult?.code || '',
    });
    progress('formatting-replay-inspection-start', {});
    formattingReplayInspection = await invokeUiCommand(win, 'cmd.project.review.inspectFormattingReturnReplay', {
      requestId: 'c5v2-physical-canary-formatting-replay-inspect-' + requestPrefix,
    });
    progress('formatting-replay-inspection-complete', {
      ok: formattingReplayInspection?.ok === true,
      replayVerified: formattingReplayInspection?.replayVerified === true,
      code: formattingReplayInspection?.code || '',
    });
  }
  if (lanePlan.hasStructure) {
    progress('structural-apply-start', { candidateCount: lanePlan.structuralCandidateCount });
    structuralApplyResult = await invokeUiCommand(win, 'cmd.project.review.applyStructuralReturn', {
      requestId: 'c5v2-physical-canary-structural-apply-' + requestPrefix,
    });
    progress('structural-apply-complete', {
      ok: structuralApplyResult?.ok === true,
      applied: structuralApplyResult?.applied === true,
      replayVerified: structuralApplyResult?.replayVerified === true,
      code: structuralApplyResult?.code || '',
    });
    progress('structural-replay-inspection-start', {});
    structuralReplayInspection = await invokeUiCommand(win, 'cmd.project.review.inspectStructuralReturnReplay', {
      requestId: 'c5v2-physical-canary-structural-replay-inspect-' + requestPrefix,
    });
    progress('structural-replay-inspection-complete', {
      ok: structuralReplayInspection?.ok === true,
      replayVerified: structuralReplayInspection?.replayVerified === true,
      code: structuralReplayInspection?.code || '',
    });
  }
  const exactTextGreen = !lanePlan.hasExactText || (
    lanePlan.exactTextCandidateCount === expectedExactTextCount
    && applyResults.length > 0
    && applyResults.reduce((total, result) => total + result.changeIds.length, 0) === expectedExactTextCount
    && applyResults.every((result) => result.ok === true && result.applied === true)
    && replayResults.every((result) => result.ok === true && result.replay === true)
    && staleRetryResults.every((result) => (
      result.status === 'blocked'
      && result.applied !== true
      && ACCEPTABLE_STALE_RETRY_BLOCK_REASONS.has(result.reason)
    ))
  );
  const lifecycleAppliedGreen = expectedLifecycleCount === 0
    ? true
    : expectedTypedLifecycleCount === expectedLifecycleCount
      ? activationSummary.commentProductPath?.semanticOracle?.lifecycleApplied === 0
      : Boolean(
          activationSummary.commentProductPath
          && activationSummary.commentProductPath.semanticOracle?.lifecycleApplied > 0
        );
  const commentsGreen = !lanePlan.hasComments || Boolean(
    activationSummary.commentProductPath
    && activationSummary.commentProductPath.ok === true
    && activationSummary.commentProductPath.pendingProductApplyLane === false
    && activationSummary.commentProductPath.commandBusDispatchOnly === true
    && activationSummary.commentProductPath.directPortDispatch === false
    && activationSummary.commentProductPath.semanticOracle?.triangleGreen === true
    && activationSummary.commentProductPath.semanticOracle?.rootApplied === expectedRootCommentCount
    && lifecycleAppliedGreen
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
    lanePlan.formattingCandidateCount === expectedFormattingCount
    && activationSummary.formattingProductPath?.prepared === true
    && activationSummary.formattingProductPath?.writerCalled === false
    && formattingApplyResult?.ok === true
    && formattingApplyResult?.applied === true
    && formattingApplyResult?.replayVerified === true
    && formattingReplayInspection?.ok === true
    && formattingReplayInspection?.replayVerified === true
    && formattingReplayInspection?.writerCalled !== true
  );
  const structureGreen = !lanePlan.hasStructure || Boolean(
    lanePlan.structuralCandidateCount === expectedStructuralCount
    && activationSummary.structuralProductPath?.prepared === true
    && activationSummary.structuralProductPath?.writerCalled === false
    && structuralApplyResult?.ok === true
    && structuralApplyResult?.applied === true
    && structuralApplyResult?.replayVerified === true
    && structuralReplayInspection?.ok === true
    && structuralReplayInspection?.replayVerified === true
    && structuralReplayInspection?.writerCalled !== true
  );
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
    structuralApplyResult,
    structuralReplayInspection,
    productOpenContext: global.productOpenContext || null,
    typedPendingLanes: {
      exactText: lanePlan.hasExactText
        ? (exactTextGreen ? 'CANONICAL_PRODUCT_APPLY_AND_REPLAY_PROVEN' : 'PENDING_PRODUCT_APPLY_LANE')
        : 'NO_EXACT_TEXT_CANDIDATE',
      ...(lanePlan.hasComments
        ? expectedTypedLifecycleCount > 0
          ? {
              ...deriveC5V2CommentLaneMaturity(activationSummary.commentProductPath || {}),
              repliesState: expectedReplyCount > 0
                ? 'TYPED_MANUAL_NO_PRODUCT_MUTATION_VERIFIED'
                : 'NO_REPLY_OPERATION',
              commentState: expectedCommentStateCount > 0
                ? 'TYPED_MANUAL_OR_BLOCKED_NO_PRODUCT_MUTATION_VERIFIED'
                : 'NO_COMMENT_STATE_OPERATION',
              commentsRepliesState: commentsGreen
                ? 'ROOT_APPLY_PLUS_TYPED_LIFECYCLE_VERIFIED'
                : 'PENDING_PRODUCT_APPLY_LANE',
            }
          : deriveC5V2CommentLaneMaturity(activationSummary.commentProductPath || {})
        : {
          rootCommentsState: 'NO_COMMENT_CANDIDATE',
          repliesState: 'NO_COMMENT_CANDIDATE',
          commentState: 'NO_COMMENT_CANDIDATE',
          commentsRepliesState: 'NO_COMMENT_CANDIDATE',
        }),
      formatting: lanePlan.hasFormatting
        ? (formattingGreen ? 'PRODUCT_APPLY_AND_REPLAY_VERIFIED' : 'PENDING_PRODUCT_APPLY_LANE')
        : 'NO_FORMATTING_CANDIDATE',
      structural: lanePlan.hasStructure
        ? (structureGreen ? 'PRODUCT_APPLY_AND_REPLAY_VERIFIED' : 'PENDING_PRODUCT_APPLY_LANE')
        : 'NO_STRUCTURAL_CANDIDATE',
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
      returnApply.yalkenTruthArtifact = await captureReopenedYalkenTruth(win, roundId, returnedPath);
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
          wordOutput = await runWord(exportPayload);
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
  }, 10_800_000);
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
      }, `ELECTRON_CUMULATIVE_RETURN_APPLY_NOT_EMITTED:${round.roundId}`, 1_800_000);
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

function orderWordOperations(operations) {
  const source = Array.isArray(operations) ? operations : [];
  const rootOperations = source.filter((operation) => operation.family === 'root_comment' && operation.wordRange);
  const lifecycleOperations = source.filter((operation) => (
    ['reply_attempt', 'state_attempt'].includes(operation.family) && operation.physicalAction !== 'typed-limit'
  ));
  const nonLifecycleOperations = source.filter((operation) => (
    !rootOperations.includes(operation) && !lifecycleOperations.includes(operation)
  ));
  return [
    ...rootOperations,
    ...nonLifecycleOperations.slice().sort((left, right) => (right.wordRange?.start || 0) - (left.wordRange?.start || 0)),
    ...lifecycleOperations,
  ];
}

function wordOperationLines(ledger, returnedPath) {
  const lines = [];
  lines.push('set yOpsDone to ""');
  lines.push('set yLimitations to ""');
  lines.push('set yUiDiagnostics to ""');
  lines.push('set yRootComments to {}');
  const markLine = (id, status, indent = '  ') => `${indent}set yOpsDone to yOpsDone & "OP|" & ${appleText(id)} & "|${status}" & linefeed`;
  const rootOperations = ledger.operations.filter((operation) => operation.family === 'root_comment' && operation.wordRange);
  const orderedOperations = orderWordOperations(ledger.operations);
  const expectedNativeRevisionCount = ledger.operations.reduce((count, operation) => (
    count + (['tracked_replace', 'tracked_insert'].includes(operation.family) ? 2 : operation.family === 'tracked_delete' ? 1 : 0)
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
    if (['reply_attempt', 'state_attempt'].includes(operation.family) && operation.physicalAction !== 'typed-limit' && !materializationBoundaryWritten) {
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
    if (operation.physicalAction === 'typed-limit') {
      lines.push(`  set yLimitations to yLimitations & ${appleText(`${operation.family}|${id}|${operation.expectedOutcome}|PHYSICALLY_UNSUPPORTED_TYPED_OUTCOME`)} & linefeed`);
      lines.push(markLine(id, operation.expectedOutcome));
      lines.push('on error errMsg number errNo');
      lines.push('  set yLimitations to yLimitations & "TYPED_LIMIT_ERROR|' + id.replaceAll('"', '') + '|" & errNo & "|" & errMsg & linefeed');
      lines.push(markLine(id, 'BLOCKED'));
      lines.push('end try');
      continue;
    }
    if (!Number.isInteger(rangeStart) || !Number.isInteger(rangeEnd) || rangeEnd <= rangeStart) {
      lines.push('  error "SOURCE_RANGE_NOT_BOUND" number 9104');
    } else {
      lines.push(`  set yRange to create range yDoc start ${rangeStart} end ${rangeEnd}`);
    }
    if (operation.family === 'tracked_replace') {
      lines.push('  set track revisions of yDoc to true');
      lines.push(`  set content of yRange to ${appleText(operation.replacementText)}`);
      lines.push(markLine(id, operation.expectedOutcome || 'EXACT'));
    } else if (operation.family === 'tracked_insert') {
      lines.push('  set track revisions of yDoc to true');
      lines.push(`  set content of yRange to ${appleText(`${operation.replacementText} ${quote}`)}`);
      lines.push(markLine(id, operation.expectedOutcome || 'EXACT'));
    } else if (operation.family === 'tracked_delete') {
      lines.push('  set track revisions of yDoc to true');
      lines.push('  set content of yRange to ""');
      lines.push(markLine(id, operation.expectedOutcome || 'EXACT'));
    } else if (operation.family === 'root_comment') {
      lines.push('  set track revisions of yDoc to false');
      lines.push(`  my yCheckpoint(yCheckpointPath, ${appleText(`${id}:ROOT_CREATE_BEFORE`)}, "")`);
      lines.push(`  set yComment to make new Word comment at yRange with properties {comment text:${appleText(`C5V2 root ${id}`)}}`);
      lines.push('  set end of yRootComments to yComment');
      lines.push(`  my yCheckpoint(yCheckpointPath, ${appleText(`${id}:ROOT_CREATE_AFTER`)}, "")`);
      lines.push(markLine(id, operation.expectedOutcome || 'SAFE_APPLY'));
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
      if (operation.formattingKind === 'italic') lines.push('  set italic of font object of yRange to true');
      else lines.push('  set bold of font object of yRange to true');
      lines.push(markLine(id, operation.expectedOutcome || 'SAFE_APPLY'));
    } else if (operation.family === 'structural') {
      lines.push('  set track revisions of yDoc to false');
      const headingLevel = Number.isSafeInteger(Number(operation.headingLevel))
        ? Math.min(3, Math.max(1, Number(operation.headingLevel)))
        : 2;
      if (headingLevel === 1) lines.push('  set outline level of paragraph format of yRange to outline level1');
      else if (headingLevel === 3) lines.push('  set outline level of paragraph format of yRange to outline level3');
      else lines.push('  set outline level of paragraph format of yRange to outline level2');
      lines.push(markLine(id, operation.expectedOutcome || 'SAFE_APPLY'));
    }
    lines.push('on error errMsg number errNo');
    lines.push('  set yLimitations to yLimitations & "OP_ERROR|' + id.replaceAll('"', '') + '|" & errNo & "|" & errMsg & linefeed');
    lines.push(markLine(id, 'BLOCKED'));
    lines.push('end try');
  }
  return lines.join('\n');
}

function wordSemanticReadbackLines(ledger) {
  const lines = [];
  const operations = Array.isArray(ledger?.operations) ? ledger.operations : [];
  const tracked = operations.filter((operation) => (
    ['tracked_replace', 'tracked_insert', 'tracked_delete'].includes(operation.family)
  ));
  lines.push('set yNativeReadback to ""');
  if (tracked.length > 0) lines.push('set yTrackedOperationCount to ' + tracked.length);
  for (const operation of operations) {
    const id = String(operation.id || '').replaceAll('"', '');
    const expected = operation.expectedOutcome || (
      ['tracked_replace', 'tracked_insert', 'tracked_delete'].includes(operation.family) ? 'EXACT' : 'SAFE_APPLY'
    );
    if (operation.physicalAction === 'typed-limit') {
      lines.push(`set yNativeReadback to yNativeReadback & ${appleText(`READBACK|${id}|${expected}|TYPED_LIMIT_NO_NATIVE_MUTATION`)} & linefeed`);
      continue;
    }
    lines.push('try');
    if (['tracked_replace', 'tracked_insert', 'tracked_delete'].includes(operation.family)) {
      lines.push('  if yTrackedOperationCount is less than 1 then error "NATIVE_TRACKED_CHUNK_READBACK_MISSING" number 9740');
    } else if (operation.family === 'formatting' || operation.family === 'structural') {
      const locator = operation.locatorQuote || operation.quote;
      const selectionOffset = Number.isSafeInteger(operation.locatorSelectionStart) ? operation.locatorSelectionStart : 0;
      lines.push(`  set yReadbackLocatorRange to my yFindRange(yDoc, ${appleText(locator)})`);
      lines.push(`  if yReadbackLocatorRange is missing value then error "NATIVE_READBACK_LOCATOR_MISSING:${id}" number 9742`);
      lines.push(`  set yReadbackStart to (start of content of yReadbackLocatorRange) + ${selectionOffset}`);
      lines.push(`  set yReadbackRange to create range yDoc start yReadbackStart end (yReadbackStart + ${String(operation.quote || '').length})`);
      lines.push(`  if (content of text object of yReadbackRange as text) is not ${appleText(operation.quote)} then error "NATIVE_READBACK_RANGE_MISMATCH:${id}" number 9743`);
      if (operation.family === 'formatting') {
        if (operation.formattingKind === 'italic') {
          lines.push(`  if (italic of font object of yReadbackRange) is not true then error "NATIVE_ITALIC_READBACK_MISMATCH:${id}" number 9744`);
        } else {
          lines.push(`  if (bold of font object of yReadbackRange) is not true then error "NATIVE_BOLD_READBACK_MISMATCH:${id}" number 9745`);
        }
      } else {
        const headingLevel = Number.isSafeInteger(Number(operation.headingLevel))
          ? Math.min(3, Math.max(1, Number(operation.headingLevel)))
          : 2;
        lines.push(`  if (outline level of paragraph format of yReadbackRange) is not outline level${headingLevel} then error "NATIVE_OUTLINE_READBACK_MISMATCH:${id}" number 9746`);
      }
    }
    lines.push(`  set yNativeReadback to yNativeReadback & ${appleText(`READBACK|${id}|${expected}|WORD_OBJECT_MODEL_REOPENED`)} & linefeed`);
    lines.push('on error errMsg number errNo');
    lines.push(`  set yNativeReadback to yNativeReadback & ${appleText(`READBACK|${id}|BLOCKED|`)} & (errNo as text) & ":" & errMsg & linefeed`);
    lines.push('end try');
  }
  return lines.join('\n');
}

export function buildWordScript({
  sourcePath,
  returnedPath,
  artifactReturnedPath = returnedPath,
  ledger,
  initializeFromSource = true,
  resetCheckpoint = true,
  expectedNativeRevisionCount: expectedNativeRevisionCountInput = null,
  minimumNativeRevisionCount: minimumNativeRevisionCountInput = null,
  expectedRootMarkers: expectedRootMarkersInput = null,
  chunkId = '',
  visibleReadbackPath = '',
}) {
  const expectedName = path.basename(returnedPath);
  const expectedNativeRevisionCount = Number.isSafeInteger(expectedNativeRevisionCountInput)
    ? expectedNativeRevisionCountInput
    : ledger.operations.reduce((count, operation) => (
        count + (['tracked_replace', 'tracked_insert'].includes(operation.family) ? 2 : operation.family === 'tracked_delete' ? 1 : 0)
      ), 0);
  const expectedRootMarkers = Array.isArray(expectedRootMarkersInput)
    ? expectedRootMarkersInput
    : ledger.operations
      .filter((operation) => operation.family === 'root_comment')
      .map((operation) => `C5V2 root ${operation.id}`);
  const minimumNativeRevisionCount = Number.isSafeInteger(minimumNativeRevisionCountInput)
    ? minimumNativeRevisionCountInput
    : expectedNativeRevisionCount;
  const requiresAccessibilityUi = ledger.operations.some((operation) => (
    ['reply_attempt', 'state_attempt'].includes(operation.family) && operation.physicalAction !== 'typed-limit'
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
    '  tell application "Microsoft Word"',
    '    activate',
    '    repeat with yIndex from (count of documents) to 1 by -1',
    '      try',
    '        set yCandidate to document yIndex',
    '        set yCandidatePosixPath to ""',
    '        try',
    '          set yCandidatePosixPath to POSIX path of ((full name of yCandidate as text) as alias)',
    '        end try',
    '        if (name of yCandidate as text) is yExpectedName and ((full name of yCandidate as text) is yExpectedFullName or yCandidatePosixPath is yPosixPath) then return true',
    '      end try',
    '    end repeat',
    '  end tell',
    '  do shell script "/usr/bin/open -a " & quoted form of "Microsoft Word" & " " & quoted form of yPosixPath',
    '  set yDeadline to (current date) + 90',
    '  tell application "Microsoft Word"',
    '    activate',
    '    repeat while (current date) is less than yDeadline',
    '      try',
    '        repeat with yIndex from (count of documents) to 1 by -1',
    '          set yCandidate to document yIndex',
    '          set yCandidatePosixPath to ""',
    '          try',
    '            set yCandidatePosixPath to POSIX path of ((full name of yCandidate as text) as alias)',
    '          end try',
    '          if (name of yCandidate as text) is yExpectedName and ((full name of yCandidate as text) is yExpectedFullName or yCandidatePosixPath is yPosixPath) then return true',
    '        end repeat',
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
    ...(resetCheckpoint ? ['  my yResetCheckpoint(yCheckpointPath)'] : []),
    `  my yCheckpoint(yCheckpointPath, ${appleText(chunkId ? `CHUNK_START:${chunkId}` : 'CANARY_START')}, yReturnedPath)`,
    '  my yCloseStaleExpectedDocuments(yReturnedPath)',
    '  my yCheckpoint(yCheckpointPath, "STALE_EXPECTED_DOCUMENTS_CLEANED", yReturnedPath)',
    ...(initializeFromSource
      ? [`  do shell script "/bin/cp " & quoted form of ${appleText(sourcePath)} & " " & quoted form of yReturnedPath`]
      : []),
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
    ...(visibleReadbackPath ? [
      `  set yVisibleReadbackFile to open for access POSIX file ${appleText(visibleReadbackPath)} with write permission`,
      '  try',
      '    set eof yVisibleReadbackFile to 0',
      '    write yReadback to yVisibleReadbackFile as «class utf8»',
      '  on error yVisibleErrMsg number yVisibleErrNo',
      '    try',
      '      close access yVisibleReadbackFile',
      '    end try',
      '    error yVisibleErrMsg number yVisibleErrNo',
      '  end try',
      '  close access yVisibleReadbackFile',
      '  do shell script "/bin/sync"',
      '  my yCheckpoint(yCheckpointPath, "NATIVE_VISIBLE_READBACK_WRITTEN", ' + appleText(visibleReadbackPath) + ')',
    ] : []),
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
    minimumNativeRevisionCount === expectedNativeRevisionCount
      ? `  if yRevisionCount is not ${expectedNativeRevisionCount} then error "FINAL_NATIVE_REVISION_COUNT_MISMATCH:" & yRevisionCount & ":${expectedNativeRevisionCount}" number 9747`
      : `  if yRevisionCount is less than ${minimumNativeRevisionCount} or yRevisionCount is greater than ${expectedNativeRevisionCount} then error "FINAL_NATIVE_REVISION_COUNT_OUTSIDE_COALESCING_RANGE:" & yRevisionCount & ":${minimumNativeRevisionCount}:${expectedNativeRevisionCount}" number 9747`,
    `  if yCommentCount is not ${expectedRootMarkers.length} then error "FINAL_NATIVE_ROOT_COUNT_MISMATCH:" & yCommentCount & ":${expectedRootMarkers.length}" number 9748`,
    `  my yVerifyNativeRootMarkers(yDoc, ${appleList(expectedRootMarkers)})`,
    wordSemanticReadbackLines(ledger),
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
    '  return "WORD_STATUS=PASS" & linefeed & "REVISION_COUNT=" & yRevisionCount & linefeed & "COMMENT_COUNT=" & yCommentCount & linefeed & "READBACK_CHARS=" & (count of yReadback) & linefeed & yOpsDone & yNativeReadback & "UI_DIAGNOSTICS_BEGIN" & linefeed & yUiDiagnostics & "UI_DIAGNOSTICS_END" & linefeed & "LIMITATIONS_BEGIN" & linefeed & yLimitations & "LIMITATIONS_END"',
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

function nativeRevisionCountForOperations(operations) {
  return (Array.isArray(operations) ? operations : []).reduce((count, operation) => (
    count + (['tracked_replace', 'tracked_insert'].includes(operation.family) ? 2 : operation.family === 'tracked_delete' ? 1 : 0)
  ), 0);
}

export function buildWordLedgerChunkPlan(ledger, chunkSize = 48) {
  const ordered = orderWordOperations(ledger?.operations || []);
  const size = Number.isSafeInteger(chunkSize) && chunkSize > 0 ? chunkSize : 48;
  const chunks = [];
  for (let start = 0; start < ordered.length; start += size) {
    const operations = ordered.slice(start, start + size);
    const completed = ordered.slice(0, start + operations.length);
    const completedTracked = completed.filter((operation) => (
      ['tracked_replace', 'tracked_insert', 'tracked_delete'].includes(operation.family)
    ));
    const minimumNativeRevisionCount = new Set(completedTracked.map((operation) => {
      const anchor = operation.masterAnchor || {};
      if (anchor.paragraphId) return `${operation.sceneId}|${anchor.paragraphId}`;
      return `${operation.sceneId || ''}|${operation.wordRange?.start || operation.id}`;
    })).size;
    chunks.push({
      chunkIndex: chunks.length,
      chunkId: `word-chunk-${String(chunks.length + 1).padStart(3, '0')}`,
      operations,
      completedOperationIds: completed.map((operation) => operation.id),
      expectedNativeRevisionCount: nativeRevisionCountForOperations(completed),
      minimumNativeRevisionCount,
      expectedRootMarkers: completed
        .filter((operation) => operation.family === 'root_comment')
        .map((operation) => `C5V2 root ${operation.id}`),
    });
  }
  return chunks;
}

export function runWordLedgerInChunks({
  sourcePath,
  returnedPath,
  artifactReturnedPath,
  ledger,
  evidenceDir,
  chunkSize = 48,
}) {
  const chunks = buildWordLedgerChunkPlan(ledger, chunkSize);
  const outputs = [];
  const ledgerDigest = ledger.masterLedgerDigest
    || ledger.ledgerDigest
    || sha256Text(stableCanonicalJson(ledger.operations || []));
  let firstPendingChunkIndex = 0;
  let resumeSnapshot = null;
  for (const chunk of chunks) {
    const checkpointPath = path.join(evidenceDir, `${chunk.chunkId}.checkpoint.json`);
    if (!fs.existsSync(checkpointPath)) break;
    const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
    const expectedCompletedIds = chunk.completedOperationIds;
    const snapshot = checkpoint?.returnedArtifactSnapshot;
    const valid = checkpoint?.schemaVersion === 'yalken.rtk.word.c5v2.word-chunk-checkpoint.v1'
      && checkpoint?.ledgerDigest === ledgerDigest
      && JSON.stringify(checkpoint?.completedOperationIds || []) === JSON.stringify(expectedCompletedIds)
      && typeof checkpoint?.wordOutput === 'string'
      && snapshot
      && typeof snapshot.path === 'string'
      && fs.existsSync(snapshot.path)
      && sha256File(snapshot.path) === snapshot.sha256;
    if (!valid) throw new Error(`C5V2_WORD_CHUNK_RESUME_CHECKPOINT_INVALID:${chunk.chunkId}`);
    outputs.push(checkpoint.wordOutput);
    firstPendingChunkIndex = chunk.chunkIndex + 1;
    resumeSnapshot = snapshot;
  }
  if (firstPendingChunkIndex < chunks.length) {
    const laterCheckpoint = chunks.slice(firstPendingChunkIndex + 1)
      .find((chunk) => fs.existsSync(path.join(evidenceDir, `${chunk.chunkId}.checkpoint.json`)));
    if (laterCheckpoint) throw new Error(`C5V2_WORD_CHUNK_RESUME_GAP:${laterCheckpoint.chunkId}`);
  }
  if (resumeSnapshot) {
    copyFileAtomicDurable(resumeSnapshot.path, artifactReturnedPath);
    copyFileAtomicDurable(resumeSnapshot.path, returnedPath);
  }
  for (const chunk of chunks.slice(firstPendingChunkIndex)) {
    const chunkLedger = { ...ledger, operations: chunk.operations, operationCount: chunk.operations.length };
    const scriptPath = path.join(evidenceDir, `${chunk.chunkId}.applescript`);
    const output = runAppleScript(buildWordScript({
      sourcePath,
      returnedPath,
      artifactReturnedPath,
      ledger: chunkLedger,
      initializeFromSource: chunk.chunkIndex === 0 && firstPendingChunkIndex === 0,
      resetCheckpoint: chunk.chunkIndex === 0 && firstPendingChunkIndex === 0,
      expectedNativeRevisionCount: chunk.expectedNativeRevisionCount,
      minimumNativeRevisionCount: chunk.minimumNativeRevisionCount,
      expectedRootMarkers: chunk.expectedRootMarkers,
      chunkId: chunk.chunkId,
      visibleReadbackPath: chunk.chunkIndex === chunks.length - 1
        ? `${artifactReturnedPath}.word-visible-readback.txt`
        : '',
    }), scriptPath);
    const parsed = parseWordOutput(output);
    if (parsed.scalars.WORD_STATUS !== 'PASS') {
      throw new Error(`C5V2_WORD_CHUNK_FAILED:${chunk.chunkId}:${output}`);
    }
    outputs.push(output);
    const returnedArtifactSnapshot = copyFileAtomicDurable(
      artifactReturnedPath,
      path.join(evidenceDir, `${chunk.chunkId}.returned.docx`),
    );
    writeJsonAtomicDurable(path.join(evidenceDir, `${chunk.chunkId}.checkpoint.json`), {
      schemaVersion: 'yalken.rtk.word.c5v2.word-chunk-checkpoint.v1',
      chunkId: chunk.chunkId,
      chunkIndex: chunk.chunkIndex,
      headSha: shellValue('git', ['rev-parse', 'HEAD']),
      ledgerDigest,
      chunkOperationIds: chunk.operations.map((operation) => operation.id),
      completedOperationIds: chunk.completedOperationIds,
      expectedNativeRevisionCount: chunk.expectedNativeRevisionCount,
      minimumNativeRevisionCount: chunk.minimumNativeRevisionCount,
      expectedRootCommentCount: chunk.expectedRootMarkers.length,
      returnedArtifactSha256: fs.existsSync(artifactReturnedPath) ? sha256File(artifactReturnedPath) : '',
      returnedArtifactSnapshot,
      outputSha256: sha256Text(output),
      wordOutput: output,
      requestEffectKeys: chunk.operations.map((operation) => ({
        operationId: operation.id,
        requestKey: `${chunk.chunkId}:${operation.id}`,
        effectKey: `${ledgerDigest}:${operation.id}`,
      })),
    });
  }
  return outputs.join('\n');
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
  const readbacks = [];
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
    if (line.startsWith('READBACK|')) {
      const [, id = '', status = '', ...detailParts] = line.split('|');
      readbacks.push({ id, status, detail: detailParts.join('|') });
      continue;
    }
    const eq = line.indexOf('=');
    if (eq > 0) scalars[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return { scalars, ops, readbacks, limitations, uiDiagnostics };
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
  const allLifecycleOperations = operations.filter((item) => ['reply_attempt', 'state_attempt'].includes(item.family));
  const typedLimitOperations = allLifecycleOperations.filter((item) => item.physicalAction === 'typed-limit');
  const lifecycleOperations = allLifecycleOperations.filter((item) => item.physicalAction !== 'typed-limit');
  const typedResults = typedLimitOperations.map((operation) => ({
    operationId: operation.id,
    status: operation.expectedOutcome === 'BLOCKED' ? 'BLOCKED' : 'MANUAL',
    reason: 'PHYSICALLY_UNSUPPORTED_TYPED_OUTCOME',
  }));
  if (allLifecycleOperations.length > 0 && lifecycleOperations.length === 0) {
    return {
      ok: true,
      notApplicable: false,
      typedLimitOnly: true,
      results: typedResults,
      verifiedCount: 0,
      blockedCount: typedResults.length,
    };
  }
  if (lifecycleOperations.length === 0) {
    return {
      ok: true,
      notApplicable: true,
      results: [],
      verifiedCount: 0,
      blockedCount: 0,
    };
  }
  const results = [...typedResults];
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
    ok: lifecycleOperations.length > 0 && results
      .filter((result) => !typedResults.includes(result))
      .every((result) => result.status === 'SAFE_APPLY'),
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

function readDocxPart(docxPath, partName, optional = false) {
  try {
    return execFileSync('/usr/bin/unzip', ['-p', docxPath, partName], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 60_000,
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    if (optional) return '';
    throw new Error(`C5V2_ORACLE_DOCX_PART_UNAVAILABLE:${partName}:${error.status || error.signal || 'ERR'}`);
  }
}

function xmlRunText(value, includeDeleted = false) {
  const tag = includeDeleted ? '(?:t|delText)' : 't';
  return [...String(value || '').matchAll(new RegExp(`<w:${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/w:${tag}>`, 'gu'))]
    .map((match) => decodeXmlText(match[1]))
    .join('');
}

function docxParagraphRecords(documentXml) {
  return [...String(documentXml || '').matchAll(/<w:p\b[\s\S]*?<\/w:p>/gu)].map((match, paragraphOrdinal) => {
    const paragraphXml = match[0];
    let cursor = 0;
    const runs = [...paragraphXml.matchAll(/<w:r\b[\s\S]*?<\/w:r>/gu)].map((runMatch) => {
      const runXml = runMatch[0];
      const text = xmlRunText(runXml);
      const start = cursor;
      cursor += text.length;
      return {
        text,
        start,
        end: cursor,
        bold: /<w:b(?:\s[^>]*)?\/?\s*>/u.test(runXml) && !/<w:b\b[^>]*w:val="(?:0|false|off)"/u.test(runXml),
        italic: /<w:i(?:\s[^>]*)?\/?\s*>/u.test(runXml) && !/<w:i\b[^>]*w:val="(?:0|false|off)"/u.test(runXml),
      };
    });
    const text = runs.map((run) => run.text).join('');
    const outlineMatch = paragraphXml.match(/<w:outlineLvl\b[^>]*w:val="(\d+)"/u);
    const styleMatch = paragraphXml.match(/<w:pStyle\b[^>]*w:val="([^"]+)"/u);
    return {
      paragraphOrdinal,
      xml: paragraphXml,
      text,
      runs,
      outlineLevel: outlineMatch ? Number.parseInt(outlineMatch[1], 10) + 1 : 0,
      style: styleMatch ? styleMatch[1] : '',
    };
  });
}

function docxCommentRecords(commentsXml) {
  return [...String(commentsXml || '').matchAll(/<w:comment\b([^>]*)>([\s\S]*?)<\/w:comment>/gu)].map((match) => ({
    commentId: xmlAttribute(match[1], 'id'),
    body: xmlRunText(match[2]),
  }));
}

function stableCanonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableCanonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableCanonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function verifyDocxFormattingEvidence(paragraphs, operation) {
  const locator = operation.locatorQuote || operation.quote;
  const matches = paragraphs.filter((paragraph) => paragraph.text.includes(locator));
  if (matches.length !== 1) return { ok: false, reason: `LOCATOR_PARAGRAPH_COUNT:${matches.length}` };
  const paragraph = matches[0];
  const locatorStart = paragraph.text.indexOf(locator);
  const start = locatorStart + (Number.isSafeInteger(operation.locatorSelectionStart) ? operation.locatorSelectionStart : 0);
  const end = start + String(operation.quote || '').length;
  if (paragraph.text.slice(start, end) !== operation.quote) return { ok: false, reason: 'SELECTED_TEXT_MISMATCH' };
  const overlappingRuns = paragraph.runs.filter((run) => run.text && start < run.end && end > run.start);
  const mark = operation.formattingKind === 'italic' ? 'italic' : 'bold';
  return {
    ok: overlappingRuns.length > 0 && overlappingRuns.every((run) => run[mark] === true),
    reason: overlappingRuns.length > 0 ? `${mark.toUpperCase()}_RUN_READBACK` : 'NO_OVERLAPPING_RUN',
    paragraphOrdinal: paragraph.paragraphOrdinal,
  };
}

function verifyDocxStructuralEvidence(paragraphs, operation) {
  const locator = operation.locatorQuote || operation.quote;
  const matches = paragraphs.filter((paragraph) => paragraph.text.includes(locator));
  if (matches.length !== 1) return { ok: false, reason: `LOCATOR_PARAGRAPH_COUNT:${matches.length}` };
  const paragraph = matches[0];
  const expectedLevel = Number(operation.headingLevel || 2);
  const styleLevelMatch = String(paragraph.style || '').match(/(?:Heading|heading)([1-6])/u);
  const styleLevel = styleLevelMatch ? Number.parseInt(styleLevelMatch[1], 10) : 0;
  return {
    ok: paragraph.outlineLevel === expectedLevel || styleLevel === expectedLevel,
    reason: 'OOXML_HEADING_LEVEL_READBACK',
    paragraphOrdinal: paragraph.paragraphOrdinal,
    outlineLevel: paragraph.outlineLevel,
    style: paragraph.style,
  };
}

function richBlockMarkGreen(block, start, end, markType) {
  if (!block?.node || !Number.isInteger(start) || !Number.isInteger(end) || end <= start) return false;
  let cursor = 0;
  let overlapCount = 0;
  let allMarked = true;
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'text') {
      const parts = graphemeParts(node.text || '');
      const nodeStart = cursor;
      const nodeEnd = cursor + parts.length;
      if (start < nodeEnd && end > nodeStart) {
        overlapCount += 1;
        const marks = Array.isArray(node.marks) ? node.marks : [];
        if (!marks.some((mark) => mark?.type === markType)) allMarked = false;
      }
      cursor = nodeEnd;
      return;
    }
    if (node.type === 'hardBreak') {
      cursor += 1;
      return;
    }
    for (const child of (Array.isArray(node.content) ? node.content : [])) visit(child);
  };
  visit(block.node);
  return overlapCount > 0 && allMarked;
}

function buildExpectedSceneParagraphs(baselineScene, operations) {
  const paragraphs = (Array.isArray(baselineScene?.paragraphs) ? baselineScene.paragraphs : []).slice();
  const byParagraph = new Map();
  for (const operation of operations.filter((item) => (
    ['tracked_replace', 'tracked_insert', 'tracked_delete'].includes(item.family)
    && item.expectedOutcome === 'EXACT'
  ))) {
    const ordinal = operation.masterAnchor?.paragraphOrdinal;
    if (!Number.isInteger(ordinal) || typeof paragraphs[ordinal] !== 'string') {
      return { ok: false, reason: `BASELINE_PARAGRAPH_MISSING:${operation.id}`, paragraphs };
    }
    if (!byParagraph.has(ordinal)) byParagraph.set(ordinal, []);
    byParagraph.get(ordinal).push(operation);
  }
  for (const [ordinal, paragraphOperations] of byParagraph.entries()) {
    let parts = graphemeParts(paragraphs[ordinal]);
    for (const operation of paragraphOperations.slice().sort((left, right) => (
      right.masterAnchor.graphemeStart - left.masterAnchor.graphemeStart
    ))) {
      const start = operation.masterAnchor.graphemeStart;
      const end = operation.masterAnchor.graphemeEnd;
      if (parts.slice(start, end).join('') !== operation.quote) {
        return { ok: false, reason: `BASELINE_ANCHOR_STALE:${operation.id}`, paragraphs };
      }
      const replacement = operation.family === 'tracked_delete'
        ? ''
        : operation.family === 'tracked_insert'
          ? `${operation.replacementText} ${operation.quote}`
          : operation.replacementText;
      parts.splice(start, end - start, ...graphemeParts(replacement));
    }
    paragraphs[ordinal] = parts.join('');
  }
  return { ok: true, reason: 'EXPECTED_SCENE_PARAGRAPHS_COMPUTED', paragraphs };
}

function oracleSemantics(operation, commentThreadId = '') {
  if (operation.formalFamily === 'tracked_text_edit') {
    return { textSemantics: { kind: operation.semanticIntent?.kind || '', replacementText: operation.replacementText || '' } };
  }
  if (['root_comment', 'reply', 'comment_state'].includes(operation.formalFamily)) {
    return {
      commentSemantics: {
        threadId: commentThreadId || operation.targetRootOperationId || '',
        state: operation.formalFamily === 'root_comment' ? 'open' : 'typed-limit-no-native-mutation',
      },
    };
  }
  if (operation.formalFamily === 'formatting') {
    return { formattingSemantics: { kind: operation.formattingKind || operation.semanticIntent?.kind || '', effective: true } };
  }
  if (operation.formalFamily === 'structural') {
    return {
      structuralSemantics: { kind: operation.semanticIntent.kind,
        nodeType: 'heading',
        headingLevel: Number(operation.headingLevel || 2),
      },
    };
  }
  return {};
}

function buildLegacyBoundedOracleProbe({ ledger, wordParsed }) {
  const eligible = (ledger?.operations || []).filter((operation) => (
    ['tracked_replace', 'tracked_insert', 'tracked_delete', 'root_comment', 'formatting', 'structural'].includes(operation.family)
  ));
  const statusById = new Map((wordParsed?.ops || []).map((row) => [row.id, row.status]));
  const results = eligible.map((operation) => {
    const expected = operation.expectedOutcome || (
      ['tracked_replace', 'tracked_delete'].includes(operation.family) ? 'EXACT' : 'SAFE_APPLY'
    );
    return {
      operationId: operation.id,
      expectedOutcome: expected,
      reportedStatus: statusById.get(operation.id) || '',
      green: statusById.get(operation.id) === expected,
    };
  });
  return {
    schemaVersion: 'yalken.rtk.word.c5v2.legacy-bounded-oracle.v1',
    ok: results.length > 0 && results.every((result) => result.green),
    nonCertificationBoundedLegacyRoute: true,
    operationCount: results.length,
    operationResults: results,
    oracleDigest: sha256Text(stableCanonicalJson(results)),
  };
}

export function buildOracleProbe({
  ledger,
  wordParsed,
  returnedDocxPath,
  wordVisibleReadbackPath,
  baselineArtifactPath,
  yalkenTruthPath,
  returnApply = {},
}) {
  if (ledger?.schemaVersion !== 'yalken.rtk.word.c5v2.physical-master-round-ledger.v1') {
    return buildLegacyBoundedOracleProbe({ ledger, wordParsed });
  }
  const operations = Array.isArray(ledger?.operations) ? ledger.operations : [];
  const documentXml = returnedDocxPath ? readDocxPart(returnedDocxPath, 'word/document.xml') : '';
  const commentsXml = returnedDocxPath ? readDocxPart(returnedDocxPath, 'word/comments.xml', true) : '';
  const paragraphs = docxParagraphRecords(documentXml);
  const comments = docxCommentRecords(commentsXml);
  const insertedText = [...documentXml.matchAll(/<w:ins\b[\s\S]*?<\/w:ins>/gu)].map((match) => xmlRunText(match[0])).join('');
  const deletedText = [...documentXml.matchAll(/<w:del\b[\s\S]*?<\/w:del>/gu)].map((match) => xmlRunText(match[0], true)).join('');
  const nativeVisibleReadback = wordVisibleReadbackPath && fs.existsSync(wordVisibleReadbackPath)
    ? fs.readFileSync(wordVisibleReadbackPath, 'utf8')
    : '';
  const wordStatusRows = Array.isArray(wordParsed?.ops) ? wordParsed.ops : [];
  const wordReadbackRows = Array.isArray(wordParsed?.readbacks) ? wordParsed.readbacks : [];
  const statusById = new Map(wordStatusRows.map((row) => [row.id, row.status]));
  const readbackById = new Map(wordReadbackRows.map((row) => [row.id, row]));
  const baselineArtifact = baselineArtifactPath && fs.existsSync(baselineArtifactPath)
    ? JSON.parse(fs.readFileSync(baselineArtifactPath, 'utf8'))
    : null;
  const truthArtifact = yalkenTruthPath && fs.existsSync(yalkenTruthPath)
    ? JSON.parse(fs.readFileSync(yalkenTruthPath, 'utf8'))
    : null;
  const baselineByScene = new Map((baselineArtifact?.scenes || []).map((scene) => [scene.sceneId, scene]));
  const truthByScene = new Map((truthArtifact?.sceneReadback || []).map((scene) => {
    const authority = readProductSceneAuthority(scene.rawContent || '');
    return [scene.sceneId, { ...scene, authority }];
  }));
  const expectedSceneById = new Map();
  for (const [sceneId, baselineScene] of baselineByScene.entries()) {
    expectedSceneById.set(sceneId, buildExpectedSceneParagraphs(
      baselineScene,
      operations.filter((operation) => operation.sceneId === sceneId),
    ));
  }
  const productSceneGreenById = new Map();
  for (const [sceneId, expected] of expectedSceneById.entries()) {
    const truth = truthByScene.get(sceneId);
    productSceneGreenById.set(sceneId, Boolean(
      expected?.ok === true
      && truth
      && JSON.stringify(truth.authority.paragraphs) === JSON.stringify(expected.paragraphs)
    ));
  }
  const activation = returnApply?.activation || {};
  const threadDiagnostics = Array.isArray(activation.commentThreadDiagnostics) ? activation.commentThreadDiagnostics : [];
  const placementDiagnostics = Array.isArray(activation.commentPlacementDiagnostics) ? activation.commentPlacementDiagnostics : [];
  const commentPath = activation.commentProductPath || {};
  const returnedArtifactId = activation.returnIntake?.returnedArtifactSha256 || '';
  const applyReceipts = Array.isArray(commentPath.applyReceipts) ? commentPath.applyReceipts : [];
  const replayReceipts = Array.isArray(commentPath.replayReceipts) ? commentPath.replayReceipts : [];
  const formalOperations = [];
  const wordOperationsById = {};
  const yalkenOperationsById = {};
  const operationResults = [];
  for (const operation of operations) {
    const expectedOutcome = operation.expectedOutcome || 'SAFE_APPLY';
    const anchor = operation.masterAnchor || {};
    const formalOperation = {
      id: operation.id,
      family: operation.formalFamily || operation.family,
      expectedOutcome,
      anchor,
      semanticIntent: operation.semanticIntent || {},
    };
    formalOperations.push(formalOperation);
    const reportedStatus = statusById.get(operation.id) || '';
    const nativeReadback = readbackById.get(operation.id) || null;
    const expectedReported = reportedStatus === expectedOutcome && nativeReadback?.status === expectedOutcome;
    let wordRawGreen = false;
    let wordEvidence = {};
    let yalkenGreen = productSceneGreenById.get(operation.sceneId) === true;
    let yalkenEvidence = { sceneParagraphsExact: yalkenGreen };
    let commentThreadId = '';
    if (operation.formalFamily === 'tracked_text_edit') {
      const replacementPresent = operation.family === 'tracked_delete' || insertedText.includes(operation.replacementText || '');
      const sourcePresent = operation.family === 'tracked_insert' || deletedText.includes(operation.quote || '');
      const nativeVisibleReplacementPresent = operation.family === 'tracked_delete'
        || nativeVisibleReadback.includes(operation.replacementText || '');
      wordRawGreen = replacementPresent && sourcePresent && nativeVisibleReplacementPresent;
      wordEvidence = {
        replacementPresent,
        sourcePresent,
        nativeVisibleReplacementPresent,
        sourceKind: 'raw-ooxml-revisions-plus-word-object-model-visible-snapshot',
      };
    } else if (operation.formalFamily === 'root_comment') {
      const marker = `C5V2 root ${operation.id}`;
      const nativeComments = comments.filter((comment) => comment.body.includes(marker));
      const nativeComment = nativeComments[0] || null;
      const rangeStartCount = nativeComment
        ? (documentXml.match(new RegExp(`<w:commentRangeStart\\b[^>]*w:id="${nativeComment.commentId}"`, 'gu')) || []).length
        : 0;
      const rangeEndCount = nativeComment
        ? (documentXml.match(new RegExp(`<w:commentRangeEnd\\b[^>]*w:id="${nativeComment.commentId}"`, 'gu')) || []).length
        : 0;
      wordRawGreen = nativeComments.length === 1 && rangeStartCount === 1 && rangeEndCount === 1;
      const threadMatches = threadDiagnostics.filter((thread) => (
        (thread.messages || []).some((message) => message.body === marker)
      ));
      const thread = threadMatches[0] || null;
      commentThreadId = thread?.threadId || '';
      const placementMatches = placementDiagnostics.filter((placement) => placement.threadId === commentThreadId);
      const placement = placementMatches[0] || null;
      const sceneId = placement?.targetScope?.id || thread?.targetScope?.id || thread?.sceneId || '';
      const selectedText = placement?.quote || '';
      const expectedReceiptId = commentThreadId && sceneId && selectedText
        ? `physical-root:${sha256Bytes(Buffer.from(stableCanonicalJson({
            returnArtifactId: returnedArtifactId,
            threadId: commentThreadId,
            sceneId,
            selectedText,
            rootBody: marker,
          }), 'utf8'))}`
        : '';
      const applyReceipt = applyReceipts.find((receipt) => receipt.operationId === expectedReceiptId);
      const replayReceipt = replayReceipts.find((receipt) => receipt.operationId === expectedReceiptId);
      yalkenGreen = yalkenGreen
        && threadMatches.length === 1
        && placementMatches.length === 1
        && sceneId === operation.sceneId
        && selectedText === operation.quote
        && applyReceipt?.ok === true
        && applyReceipt?.status === 'applied'
        && applyReceipt?.recoveryWritten === true
        && replayReceipt?.ok === true
        && replayReceipt?.status === 'replay'
        && applyReceipt?.canonicalDigest
        && replayReceipt?.canonicalDigest === applyReceipt.canonicalDigest;
      wordEvidence = { marker, nativeCommentCount: nativeComments.length, rangeStartCount, rangeEndCount };
      yalkenEvidence = {
        ...yalkenEvidence,
        threadMatchCount: threadMatches.length,
        placementMatchCount: placementMatches.length,
        expectedReceiptId,
        applyReceiptGreen: applyReceipt?.ok === true && applyReceipt?.status === 'applied',
        replayReceiptGreen: replayReceipt?.ok === true && replayReceipt?.status === 'replay',
        canonicalDigest: applyReceipt?.canonicalDigest || '',
      };
    } else if (['reply', 'comment_state'].includes(operation.formalFamily)) {
      const replyMarker = `C5V2 reply ${operation.id}`;
      const nativeMutationAbsent = !comments.some((comment) => comment.body.includes(replyMarker));
      wordRawGreen = nativeMutationAbsent;
      yalkenGreen = yalkenGreen
        && nativeMutationAbsent
        && Number(commentPath.semanticOracle?.lifecycleApplied || 0) === 0;
      wordEvidence = { nativeMutationAbsent, typedLimit: true };
      yalkenEvidence = { ...yalkenEvidence, lifecycleApplied: Number(commentPath.semanticOracle?.lifecycleApplied || 0), typedLimit: true };
    } else if (operation.formalFamily === 'formatting') {
      const formatting = verifyDocxFormattingEvidence(paragraphs, operation);
      wordRawGreen = formatting.ok === true;
      const truth = truthByScene.get(operation.sceneId);
      const block = truth?.authority?.blocks?.[operation.masterAnchor?.paragraphOrdinal];
      const richMarkGreen = richBlockMarkGreen(
        block,
        operation.masterAnchor?.graphemeStart,
        operation.masterAnchor?.graphemeEnd,
        operation.formattingKind === 'italic' ? 'italic' : 'bold',
      );
      yalkenGreen = yalkenGreen && richMarkGreen;
      wordEvidence = formatting;
      yalkenEvidence = { ...yalkenEvidence, richMarkGreen };
    } else if (operation.formalFamily === 'structural') {
      const structural = verifyDocxStructuralEvidence(paragraphs, operation);
      wordRawGreen = structural.ok === true;
      const truth = truthByScene.get(operation.sceneId);
      const block = truth?.authority?.blocks?.[operation.masterAnchor?.paragraphOrdinal];
      const structureGreen = block?.type === 'heading' && Number(block?.attrs?.level) === Number(operation.headingLevel || 2);
      yalkenGreen = yalkenGreen && structureGreen;
      wordEvidence = structural;
      yalkenEvidence = { ...yalkenEvidence, structureGreen, observedType: block?.type || '', observedLevel: Number(block?.attrs?.level || 0) };
    }
    const wordGreen = expectedReported && wordRawGreen;
    const semantics = oracleSemantics(operation, commentThreadId);
    wordOperationsById[operation.id] = {
      outcome: wordGreen ? expectedOutcome : 'BLOCKED',
      anchor,
      ...semantics,
    };
    yalkenOperationsById[operation.id] = {
      outcome: yalkenGreen ? expectedOutcome : 'BLOCKED',
      anchor,
      ...semantics,
    };
    operationResults.push({
      operationId: operation.id,
      family: formalOperation.family,
      expectedOutcome,
      reportedStatus,
      nativeReadbackStatus: nativeReadback?.status || '',
      wordGreen,
      yalkenGreen,
      wordEvidence,
      yalkenEvidence,
    });
  }
  const semanticOracle = validateC5V2SemanticOracle({
    operations: formalOperations,
    wordReadback: { sourceKind: 'raw-ooxml', countsOnly: false, operationsById: wordOperationsById },
    yalkenTruth: { sourceKind: 'reopened-yalken-project', countsOnly: false, operationsById: yalkenOperationsById },
  });
  const duplicateWordStatuses = wordStatusRows.length !== new Set(wordStatusRows.map((row) => row.id)).size;
  const duplicateNativeReadbacks = wordReadbackRows.length !== new Set(wordReadbackRows.map((row) => row.id)).size;
  const complete = wordStatusRows.length === operations.length
    && wordReadbackRows.length === operations.length
    && duplicateWordStatuses === false
    && duplicateNativeReadbacks === false
    && operationResults.every((result) => result.wordGreen && result.yalkenGreen);
  return {
    schemaVersion: 'yalken.rtk.word.c5v2.complete-round-oracle.v1',
    ok: complete && semanticOracle.ok === true,
    operationCount: operations.length,
    wordStatusCount: wordStatusRows.length,
    nativeWordReadbackCount: wordReadbackRows.length,
    reopenedYalkenSceneCount: truthByScene.size,
    nativeWordVisibleReadbackPresent: nativeVisibleReadback.length > 0,
    duplicateWordStatuses,
    duplicateNativeReadbacks,
    sourceKinds: ['ledger-intent', 'raw-ooxml', 'word-object-model-reopened', 'reopened-yalken-project'],
    semanticOracle,
    operationResults,
    oracleDigest: sha256Text(stableCanonicalJson(operationResults)),
  };
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
    masterLedgerCampaign: false,
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
    } else if (arg === '--master-ledger-campaign') {
      options.masterLedgerCampaign = true;
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
  if (options.masterLedgerCampaign && (scenes.length !== 21 || roundCount !== 5)) {
    throw new Error(`C5V2_MASTER_LEDGER_CAMPAIGN_REQUIRES_21_SCENES_5_ROUNDS:${scenes.length}:${roundCount}`);
  }
  let masterLedger = null;
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
    writeJsonAtomicDurable(path.join(roundDir, 'round-plan.pre-export.json'), {
      schemaVersion: 'yalken.rtk.word.c5v2.cumulative-round-plan.v1',
      roundId: roundLabel,
      counts: options.counts,
      ledgerAuthority: options.masterLedgerCampaign
        ? 'MASTER_2000_OPERATION_LEDGER_BOUND_TO_FIRST_PRODUCT_EXPORT'
        : 'DERIVE_FROM_CURRENT_PRODUCT_SCENE_FILES_AFTER_ROUND_EXPORT',
    });
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
        const rawContent = fs.readFileSync(scenePath, 'utf8');
        const observable = readProductSceneAuthority(rawContent);
        const sceneId = projectRoot
          ? path.relative(projectRoot, scenePath).replace(/\\/gu, '/')
          : (scenes[sceneIndex]?.sceneId || path.basename(scenePath));
        return {
          ...(scenes[sceneIndex] || {}),
          file: path.basename(scenePath),
          sceneId,
          title: scenes[sceneIndex]?.title || path.basename(scenePath, '.txt'),
          rawContent,
          rawContentSha256: observable.rawContentSha256,
          text: observable.text,
          sourceSha256: observable.textSha256,
          paragraphs: observable.paragraphs,
        };
      });
      round.productBaselineArtifact = writeJsonAtomicDurable(
        path.join(round.roundDir, 'product-baseline-scenes.json'),
        {
          schemaVersion: 'yalken.rtk.word.c5v2.product-baseline-scenes.v1',
          roundId: round.roundId,
          projectRoot,
          scenes: currentScenes.map((scene) => ({
            sceneId: scene.sceneId,
            rawContent: scene.rawContent,
            rawContentSha256: scene.rawContentSha256,
            text: scene.text,
            textSha256: scene.sourceSha256,
            paragraphs: scene.paragraphs,
          })),
        },
      );
      if (options.masterLedgerCampaign && !masterLedger) {
        masterLedger = buildC5V2Ledger({ scenes: currentScenes, roundCount });
        if (masterLedger.gates?.ok !== true || masterLedger.operations.length !== 2000) {
          throw new Error(`C5V2_MASTER_LEDGER_GATES_FAILED:${JSON.stringify(masterLedger.gates || {})}`);
        }
        writeJsonAtomicDurable(path.join(runDir, 'c5v2-master-ledger.json'), masterLedger);
        writeJsonAtomicDurable(path.join(runDir, 'c5v2-corpus-provenance.json'), {
          schemaVersion: 'yalken.rtk.word.c5v2.corpus-provenance.v1',
          corpus: 'Project Gutenberg 174 cleaned internal QA Dorian Gray corpus',
          topology: 'one-genuine-21-scene-product-project',
          rawCorpusPath: CORPUS_RAW_PATH,
          rawCorpusSha256: sha256File(CORPUS_RAW_PATH),
          cleanedCorpusPath: CORPUS_CLEANED_PATH,
          cleanedCorpusSha256: sha256File(CORPUS_CLEANED_PATH),
          syntheticTailAuthority: false,
          sourceScenes: scenes.map((scene) => ({
            file: scene.file,
            rawSourceSha256: scene.rawSourceSha256,
            cleanedSourceSha256: scene.cleanedSourceSha256,
          })),
          productScenes: currentScenes.map((scene) => ({
            sceneId: scene.sceneId,
            sourceSha256: scene.sourceSha256,
          })),
          masterLedgerDigest: masterLedger.ledgerDigest,
        });
      }
      const ledger = options.masterLedgerCampaign
        ? adaptC5V2MasterRoundToPhysicalLedger({
            masterLedger,
            currentScenes,
            roundNumber: roundIndex + 1,
            sourceDocxPath: round.sourcePath,
          })
        : buildExportBoundCanaryLedger({
            scenes: currentScenes,
            counts: options.counts,
            sourceDocxPath: round.sourcePath,
            anchorOffset: roundIndex * 11,
            idPrefix: `r${String(roundIndex + 1).padStart(2, '0')}-`,
            weightedSceneAllocation: true,
          });
      round.ledger = ledger;
      writeJsonAtomicDurable(path.join(round.roundDir, 'canary-ledger.json'), ledger);
      const wordOutput = options.masterLedgerCampaign
        ? runWordLedgerInChunks({
            sourcePath: round.sourcePath,
            returnedPath: round.wordReturnedPath,
            artifactReturnedPath: round.returnedPath,
            ledger,
            evidenceDir: round.roundDir,
          })
        : await runAppleScript(
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
    const oracleProbe = wordParsed.ops.length > 0 && round.ledger && fs.existsSync(round.returnedPath)
      ? buildOracleProbe({
          ledger: round.ledger,
          wordParsed,
          returnedDocxPath: round.returnedPath,
          wordVisibleReadbackPath: `${round.returnedPath}.word-visible-readback.txt`,
          baselineArtifactPath: round.productBaselineArtifact?.path || path.join(round.roundDir, 'product-baseline-scenes.json'),
          yalkenTruthPath: returnApply?.yalkenTruthArtifact?.path || path.join(round.roundDir, 'yalken-reopened-truth.json'),
          returnApply,
        })
      : null;
    const oracleArtifact = oracleProbe
      ? writeJsonAtomicDurable(path.join(round.roundDir, 'complete-round-oracle.json'), oracleProbe)
      : null;
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
        exact: wordParsed.ops.filter((op) => op.status === 'EXACT').length,
        safeApply: wordParsed.ops.filter((op) => op.status === 'SAFE_APPLY').length,
        manual: wordParsed.ops.filter((op) => op.status === 'MANUAL').length,
        blocked: wordParsed.ops.filter((op) => op.status === 'BLOCKED').length,
        manualOrBlocked: wordParsed.ops.filter((op) => ['MANUAL', 'MANUAL_OR_BLOCKED', 'BLOCKED'].includes(op.status)).length,
        byStatus: wordParsed.ops.reduce((acc, op) => {
          acc[op.status] = (acc[op.status] || 0) + 1;
          return acc;
        }, {}),
      },
      limitations: wordParsed.limitations,
      uiDiagnostics: wordParsed.uiDiagnostics,
      nativeLifecycleVerification,
      packageSummary: fs.existsSync(round.returnedPath) ? packageSummary(round.returnedPath) : null,
      oracleProbe,
      oracleArtifact,
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
    acc.exact += round.wordOperationSummary.exact;
    acc.safeApply += round.wordOperationSummary.safeApply;
    acc.manual += round.wordOperationSummary.manual;
    acc.blocked += round.wordOperationSummary.blocked;
    acc.exactTotal += round.exactTotal;
    acc.productApplyGreen += round.productApplyOk ? 1 : 0;
    return acc;
  }, { attempted: 0, reported: 0, exact: 0, safeApply: 0, manual: 0, blocked: 0, exactTotal: 0, productApplyGreen: 0 });
  const summary = {
    schemaVersion: 'yalken.rtk.word.c5v2.physical-cumulative.result.v1',
    runId,
    headSha: shellValue('git', ['rev-parse', 'HEAD']),
    originMainSha: shellValue('git', ['rev-parse', 'origin/main']),
    wordVersion,
    wordWorkRoot,
    sceneCount: scenes.length,
    roundCount,
    masterLedger: masterLedger ? {
      schemaVersion: masterLedger.schemaVersion,
      operationCount: masterLedger.operations.length,
      counts: masterLedger.counts,
      ledgerDigest: masterLedger.ledgerDigest,
      gates: masterLedger.gates,
      negativeProbeCount: masterLedger.operations.filter((operation) => operation.family === 'negative_probe').length,
    } : null,
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
      ...(rounds.some((round) => (round.ledger?.operations || []).some((operation) => operation.family === 'structural'))
        ? ['shipped-structural-command-apply-and-persisted-replay-inspection-per-round']
        : []),
      ...(rounds.some((round) => (round.ledger?.operations || []).some((operation) => operation.physicalAction === 'typed-limit'))
        ? ['unsupported-lifecycle-operations-remain-deterministic-typed-outcomes']
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
  writeJsonAtomicDurable(path.join(runDir, 'cumulative-result.json'), summary);
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
        && round.oracleProbe?.ok === true
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
      {
        expectedFamilies: ledger.operations.map((operation) => operation.family),
        expectedFamilyCounts: ledger.familyCounts,
      },
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
      && summary.oracleProbe?.ok === true
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
