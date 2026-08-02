#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

export const C5V2_LEDGER_SCHEMA = 'yalken.rtk.word.c5v2.fullbook-ledger.v1';
export const DEFAULT_C5V2_LEDGER_COUNTS = Object.freeze({
  tracked_text_edit: 1200,
  root_comment: 300,
  reply: 120,
  comment_state: 100,
  formatting: 180,
  structural: 60,
  negative_probe: 40,
});

const POSITIVE_FAMILIES = Object.freeze([
  'tracked_text_edit',
  'root_comment',
  'reply',
  'comment_state',
  'formatting',
  'structural',
]);

const HIGH_COUNT_SCENE_COVERAGE_FAMILIES = Object.freeze([
  'tracked_text_edit',
  'root_comment',
  'reply',
  'comment_state',
  'formatting',
  'structural',
]);

const TRACKED_INTENTS = Object.freeze(['insert', 'delete', 'replace']);
const TRACKED_SPAN_TYPES = Object.freeze(['character', 'word', 'phrase', 'sentence', 'paragraph-boundary']);
const COMMENT_SPAN_TYPES = Object.freeze(['word', 'multiword-phrase', 'clause', 'sentence', 'punctuation-adjacent', 'paragraph-boundary']);
const FORMAT_FEATURES = Object.freeze(['bold', 'italic']);
const STRUCTURAL_FEATURES = Object.freeze(['headingLevel']);
const COMMENT_STATE_INTENTS = Object.freeze(['resolve', 'reopen', 'delete', 'resolve-reopen']);
const SENTINEL_TOKENS = Object.freeze(['YALKEN_C5_CERTIFICATION_ANCHORS', 'COMMENT_TARGET', 'OLD_WORD', 'FORMAT_ME']);
const COMMENT_FAMILIES = new Set(['root_comment', 'reply', 'comment_state']);
const THREAD_TARGET_FAMILIES = new Set(['reply', 'comment_state']);
const MUTATING_CONTENT_FAMILIES = new Set(['tracked_text_edit', 'formatting', 'structural']);
const RANGE_ISOLATED_PRIMARY_FAMILIES = new Set([...MUTATING_CONTENT_FAMILIES, 'root_comment']);
const UNICODE_REPLACEMENTS = Object.freeze([
  { profile: 'nfc-composed', text: 'caf\u00e9' },
  { profile: 'nfd-combining', text: 'cafe\u0301' },
  { profile: 'emoji-zwj', text: '\ud83d\udc69\u200d\ud83d\udcbb' },
  { profile: 'rtl-arabic', text: '\u0645\u0631\u062d\u0628\u0627 \u0628\u0627\u0644\u0639\u0627\u0644\u0645' },
  { profile: 'rtl-hebrew', text: '\u05e9\u05dc\u05d5\u05dd \u05e2\u05d5\u05dc\u05dd' },
  { profile: 'cjk', text: '\u7de8\u96c6\u306e\u8a3c\u8de1' },
  { profile: 'indic', text: '\u0938\u0902\u092a\u093e\u0926\u0928 \u0938\u093e\u0915\u094d\u0937\u094d\u092f' },
  { profile: 'thai', text: '\u0e2b\u0e25\u0e31\u0e01\u0e10\u0e32\u0e19\u0e01\u0e32\u0e23\u0e41\u0e01\u0e49\u0e44\u0e02' },
]);

function sha256Text(value) {
  return `sha256:${crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex')}`;
}

function stableJson(value) {
  return JSON.stringify(value, Object.keys(value || {}).sort());
}

function stableHash(value) {
  return sha256Text(typeof value === 'string' ? value : JSON.stringify(value)).slice('sha256:'.length);
}

function assertPlainScene(scene, index) {
  if (!scene || typeof scene !== 'object' || Array.isArray(scene)) {
    throw new Error(`C5V2_SCENE_RECORD_INVALID:${index}`);
  }
  if (typeof scene.sceneId !== 'string' || !scene.sceneId.trim()) {
    throw new Error(`C5V2_SCENE_ID_REQUIRED:${index}`);
  }
  if (typeof scene.text !== 'string' || !scene.text.trim()) {
    throw new Error(`C5V2_SCENE_TEXT_REQUIRED:${scene.sceneId}`);
  }
}

function normalizeText(value) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function countExactOccurrences(haystack, needle) {
  const source = String(haystack || '');
  const query = String(needle || '');
  if (!query) return 0;
  let count = 0;
  let cursor = 0;
  while (cursor <= source.length - query.length) {
    const index = source.indexOf(query, cursor);
    if (index < 0) break;
    count += 1;
    cursor = index + query.length;
  }
  return count;
}

function graphemes(text) {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return Array.from(segmenter.segment(text), (part) => part.segment);
  }
  return Array.from(text);
}

function wordCount(text) {
  return (String(text || '').match(/\b[\p{L}\p{N}'’-]+\b/gu) || []).length;
}

function splitNaturalParagraphs(text) {
  const normalized = normalizeText(text);
  const parts = [];
  let offset = 0;
  for (const raw of normalized.split(/\n{2,}/u)) {
    const trimmed = raw.trim();
    const sourceIndex = normalized.indexOf(raw, offset);
    offset = sourceIndex + raw.length;
    if (trimmed.length > 0 && wordCount(trimmed) >= 4) {
      parts.push({ text: trimmed, charStart: Math.max(0, sourceIndex + raw.indexOf(trimmed)) });
    }
  }
  if (parts.length > 0) return parts;
  return normalized
    .split('\n')
    .map((line, index) => ({ text: line.trim(), charStart: index }))
    .filter((paragraph) => paragraph.text.length > 0 && wordCount(paragraph.text) >= 4);
}

function buildSceneProfiles(scenes) {
  const seen = new Set();
  return scenes.map((scene, sceneOrdinal) => {
    assertPlainScene(scene, sceneOrdinal);
    const sceneId = scene.sceneId.trim();
    if (seen.has(sceneId)) {
      throw new Error(`C5V2_SCENE_ID_DUPLICATE:${sceneId}`);
    }
    seen.add(sceneId);
    const text = normalizeText(scene.text);
    for (const token of SENTINEL_TOKENS) {
      if (text.includes(token)) {
        throw new Error(`C5V2_SYNTHETIC_SENTINEL_IN_POSITIVE_SOURCE:${sceneId}:${token}`);
      }
    }
    const paragraphs = splitNaturalParagraphs(text);
    if (paragraphs.length === 0) {
      throw new Error(`C5V2_NATURAL_PARAGRAPH_REQUIRED:${sceneId}`);
    }
    const sceneGraphemes = graphemes(text).length;
    const sceneWords = wordCount(text);
    return {
      sceneId,
      sceneOrdinal,
      title: typeof scene.title === 'string' ? scene.title : '',
      text,
      graphemeCount: sceneGraphemes,
      wordCount: sceneWords,
      rawSha256: sha256Text(text),
      paragraphs: paragraphs.map((paragraph, paragraphOrdinal) => {
        const paragraphGraphemes = graphemes(paragraph.text);
        const paragraphId = `p-${String(sceneOrdinal + 1).padStart(2, '0')}-${String(paragraphOrdinal + 1).padStart(4, '0')}-${stableHash(`${sceneId}:${paragraphOrdinal}:${paragraph.text}`).slice(0, 12)}`;
        const paragraphStartGrapheme = graphemes(text.slice(0, paragraph.charStart)).length;
        const midpoint = paragraphStartGrapheme + Math.floor(paragraphGraphemes.length / 2);
        const decile = Math.min(9, Math.max(0, Math.floor((midpoint / Math.max(1, sceneGraphemes)) * 10)));
        const third = midpoint < sceneGraphemes / 3
          ? 'beginning'
          : midpoint < (sceneGraphemes * 2) / 3
            ? 'middle'
            : 'end';
        return {
          sceneId,
          sceneOrdinal,
          paragraphId,
          paragraphOrdinal,
          text: paragraph.text,
          graphemeCount: paragraphGraphemes.length,
          wordCount: wordCount(paragraph.text),
          paragraphStartGrapheme,
          decile,
          third,
          baselineHash: sha256Text(paragraph.text),
        };
      }),
    };
  });
}

function allocateWeightedCounts(sceneProfiles, total) {
  if (!Number.isInteger(total) || total < 0) {
    throw new Error('C5V2_LEDGER_COUNT_INVALID');
  }
  if (total === 0) return sceneProfiles.map(() => 0);
  const floor = total >= sceneProfiles.length ? 1 : 0;
  const base = sceneProfiles.map(() => floor);
  let remaining = total - base.reduce((sum, value) => sum + value, 0);
  const weightTotal = sceneProfiles.reduce((sum, scene) => sum + Math.max(1, scene.wordCount), 0);
  const weighted = sceneProfiles.map((scene, index) => {
    const exact = remaining * (Math.max(1, scene.wordCount) / weightTotal);
    const whole = Math.floor(exact);
    return { index, whole, frac: exact - whole };
  });
  for (const entry of weighted) {
    base[entry.index] += entry.whole;
    remaining -= entry.whole;
  }
  weighted.sort((a, b) => (b.frac - a.frac) || (a.index - b.index));
  for (let index = 0; index < remaining; index += 1) {
    if (weighted.length === 0) throw new Error('C5V2_LEDGER_SCENES_REQUIRED');
    base[weighted[index % weighted.length].index] += 1;
  }
  return base;
}

function orderedParagraphs(sceneProfile, family, familySceneOrdinal, globalOrdinal, state) {
  const targetDecile = (familySceneOrdinal + (sceneProfile.sceneOrdinal * 3)) % 10;
  return [...sceneProfile.paragraphs].sort((a, b) => {
    const rootA = state.commentParagraphCounts.get(a.paragraphId) || 0;
    const rootB = state.commentParagraphCounts.get(b.paragraphId) || 0;
    if (family === 'root_comment' && rootA !== rootB) return rootA - rootB;
    const useA = state.familyParagraphUseCounts.get(`${family}:${a.paragraphId}`) || 0;
    const useB = state.familyParagraphUseCounts.get(`${family}:${b.paragraphId}`) || 0;
    if (useA !== useB) return useA - useB;
    const da = Math.abs(a.decile - targetDecile);
    const db = Math.abs(b.decile - targetDecile);
    return (da - db) || (a.paragraphOrdinal - b.paragraphOrdinal);
  });
}

function makeSpan(paragraph, spanType, family, ordinal) {
  const count = Math.max(1, paragraph.graphemeCount);
  const maxStart = Math.max(1, count - 1);
  let length;
  switch (spanType) {
    case 'character':
      length = 1;
      break;
    case 'word':
      length = Math.min(8, Math.max(1, Math.floor(count / 18)));
      break;
    case 'multiword-phrase':
    case 'phrase':
      length = Math.min(24, Math.max(3, Math.floor(count / 8)));
      break;
    case 'clause':
      length = Math.min(42, Math.max(6, Math.floor(count / 5)));
      break;
    case 'sentence':
      length = Math.min(96, Math.min(count, Math.max(8, Math.floor(count / 4))));
      break;
    case 'paragraph-boundary':
      length = Math.min(32, Math.min(count, Math.max(2, Math.floor(count / 18))));
      break;
    default:
      length = Math.min(12, Math.max(1, Math.floor(count / 10)));
      break;
  }
  let start;
  if (spanType === 'paragraph-boundary') {
    start = ordinal % 2 === 0 ? 0 : Math.max(0, count - length);
  } else if (spanType === 'punctuation-adjacent') {
    const punctuationIndex = graphemes(paragraph.text).findIndex((value) => /[,.!?;:]/u.test(value));
    start = punctuationIndex >= 0 ? Math.max(0, punctuationIndex - 1) : ((ordinal * 7) % maxStart);
  } else {
    start = (ordinal * 17 + stableHash(`${family}:${paragraph.paragraphId}:${ordinal}`).charCodeAt(0)) % maxStart;
  }
  const end = Math.min(count, start + length);
  const parts = graphemes(paragraph.text);
  const selected = parts.slice(start, end).join('');
  const before = parts.slice(Math.max(0, start - 16), start).join('');
  const after = parts.slice(end, Math.min(count, end + 16)).join('');
  return {
    graphemeStart: start,
    graphemeEnd: end,
    spanType,
    selectedText: selected,
    contextBefore: before,
    contextAfter: after,
    baselineHash: paragraph.baselineHash,
  };
}

function shiftSpanToGraphemeStart(paragraph, span, graphemeStart) {
  const parts = graphemes(paragraph.text);
  const length = Math.max(1, span.graphemeEnd - span.graphemeStart);
  const start = Math.min(Math.max(0, graphemeStart), Math.max(0, parts.length - length));
  const end = Math.min(parts.length, start + length);
  return {
    ...span,
    graphemeStart: start,
    graphemeEnd: end,
    selectedText: parts.slice(start, end).join(''),
    contextBefore: parts.slice(Math.max(0, start - 16), start).join(''),
    contextAfter: parts.slice(end, Math.min(parts.length, end + 16)).join(''),
  };
}

function makeAnchor(sceneProfile, paragraph, span, globalOffset = 0) {
  return {
    sceneId: sceneProfile.sceneId,
    sceneOrdinal: sceneProfile.sceneOrdinal,
    paragraphId: paragraph.paragraphId,
    paragraphOrdinal: paragraph.paragraphOrdinal,
    positionalDecile: paragraph.decile,
    positionalThird: paragraph.third,
    spanType: span.spanType,
    graphemeStart: span.graphemeStart,
    graphemeEnd: span.graphemeEnd,
    globalGraphemeStart: globalOffset + paragraph.paragraphStartGrapheme + span.graphemeStart,
    contextBefore: span.contextBefore,
    contextAfter: span.contextAfter,
    selectedText: span.selectedText,
    sceneSelectedTextOccurrenceCount: countExactOccurrences(sceneProfile.text, span.selectedText),
    baselineHash: span.baselineHash,
  };
}

function addOperation(operations, op) {
  const defaultOutcome = op.family === 'negative_probe'
    ? 'REJECT'
    : op.family === 'tracked_text_edit'
      ? (op.semanticIntent?.kind === 'insert' ? 'MANUAL' : 'EXACT')
      : op.family === 'reply'
        ? 'MANUAL'
        : op.family === 'comment_state'
          ? (op.semanticIntent?.kind === 'delete' ? 'BLOCKED' : 'MANUAL')
          : 'SAFE_APPLY';
  operations.push({
    expectedOutcome: defaultOutcome,
    ...op,
  });
}

function selectUniqueAnchor({
  sceneProfile,
  family,
  familyCount,
  familySceneOrdinal,
  globalOrdinal,
  globalOffset,
  spanType,
  state,
  requireSceneUniqueSelectedText = false,
}) {
  const paragraphs = orderedParagraphs(sceneProfile, family, familySceneOrdinal, globalOrdinal, state);
  const rejectCounts = { short: 0, rootUsed: 0, mixedFamily: 0, reserved: 0, empty: 0, ambiguousSelection: 0, boundaryReserved: 0, overlap: 0, duplicate: 0, duplicateStart: 0, hotspot: 0 };
  for (const paragraph of paragraphs) {
    if (paragraph.graphemeCount < 4) { rejectCounts.short += 1; continue; }
    if (family === 'root_comment' && (state.commentParagraphCounts.get(paragraph.paragraphId) || 0) > 0) { rejectCounts.rootUsed += 1; continue; }
    const existingMutationFamily = state.paragraphMutationFamily.get(paragraph.paragraphId) || '';
    const reservation = state.paragraphReservation.get(paragraph.paragraphId) || '';
    if (MUTATING_CONTENT_FAMILIES.has(family) && existingMutationFamily && existingMutationFamily !== family) { rejectCounts.mixedFamily += 1; continue; }
    if (MUTATING_CONTENT_FAMILIES.has(family) && reservation && reservation !== family) { rejectCounts.reserved += 1; continue; }
    const trySpan = (span) => {
      if (!span.selectedText) { rejectCounts.empty += 1; return null; }
      if (requireSceneUniqueSelectedText && countExactOccurrences(sceneProfile.text, span.selectedText) !== 1) {
        rejectCounts.ambiguousSelection += 1;
        return null;
      }
      const boundaryLength = Math.min(32, Math.min(
        paragraph.graphemeCount,
        Math.max(2, Math.floor(paragraph.graphemeCount / 18)),
      ));
      if (
        family === 'tracked_text_edit'
        && spanType !== 'paragraph-boundary'
        && paragraph.graphemeCount > ((boundaryLength * 2) + (span.graphemeEnd - span.graphemeStart))
        && (span.graphemeStart < boundaryLength || span.graphemeEnd > paragraph.graphemeCount - boundaryLength)
      ) {
        rejectCounts.boundaryReserved += 1;
        return null;
      }
      const usedRanges = state.paragraphPrimaryRanges.get(paragraph.paragraphId) || [];
      if (
        RANGE_ISOLATED_PRIMARY_FAMILIES.has(family)
        && usedRanges.some((range) => span.graphemeStart < range.end && span.graphemeEnd > range.start)
      ) { rejectCounts.overlap += 1; return null; }
      const anchor = makeAnchor(sceneProfile, paragraph, span, globalOffset);
      const key = operationAnchorKey({ anchor });
      if (state.primaryAnchorKeys.has(key)) { rejectCounts.duplicate += 1; return null; }
      const startKey = `${anchor.sceneId}|${anchor.paragraphId}|${anchor.graphemeStart}`;
      if (state.primaryAnchorStarts.has(startKey)) { rejectCounts.duplicateStart += 1; return null; }
      const bucket = Math.min(99, Math.max(0, Math.floor(
        (anchor.globalGraphemeStart / Math.max(1, state.totalGraphemes)) * 100,
      )));
      const bucketKey = `${family}:${bucket}`;
      const maxBucket = Math.max(2, Math.ceil(familyCount * 0.02));
      if ((state.familyBucketCounts.get(bucketKey) || 0) >= maxBucket) { rejectCounts.hotspot += 1; return null; }
      state.primaryAnchorKeys.add(key);
      state.primaryAnchorStarts.add(startKey);
      if (RANGE_ISOLATED_PRIMARY_FAMILIES.has(family)) {
        usedRanges.push({ start: span.graphemeStart, end: span.graphemeEnd, family });
        state.paragraphPrimaryRanges.set(paragraph.paragraphId, usedRanges);
      }
      state.familyBucketCounts.set(bucketKey, (state.familyBucketCounts.get(bucketKey) || 0) + 1);
      if (MUTATING_CONTENT_FAMILIES.has(family)) state.paragraphMutationFamily.set(paragraph.paragraphId, family);
      const useKey = `${family}:${paragraph.paragraphId}`;
      state.familyParagraphUseCounts.set(useKey, (state.familyParagraphUseCounts.get(useKey) || 0) + 1);
      return { paragraph, anchor };
    };
    const attemptLimit = Math.min(256, Math.max(24, paragraph.graphemeCount * 2));
    for (let salt = 0; salt < attemptLimit; salt += 1) {
      const span = makeSpan(paragraph, spanType, family, globalOrdinal + (salt * 37));
      const accepted = trySpan(span);
      if (accepted) return accepted;
    }
    const template = makeSpan(paragraph, spanType, family, globalOrdinal);
    let fallbackStarts;
    if (spanType === 'paragraph-boundary') {
      fallbackStarts = [0, Math.max(0, paragraph.graphemeCount - (template.graphemeEnd - template.graphemeStart))];
    } else if (spanType === 'punctuation-adjacent') {
      fallbackStarts = graphemes(paragraph.text)
        .map((value, index) => (/[,.!?;:]/u.test(value) ? Math.max(0, index - 1) : -1))
        .filter((value) => value >= 0);
    } else {
      fallbackStarts = Array.from({ length: Math.max(1, paragraph.graphemeCount) }, (_, index) => index);
    }
    for (const fallbackStart of new Set(fallbackStarts)) {
      const accepted = trySpan(shiftSpanToGraphemeStart(paragraph, template, fallbackStart));
      if (accepted) return accepted;
    }
  }
  throw new Error(`C5V2_UNIQUE_ANCHOR_EXHAUSTED:${sceneProfile.sceneId}:${family}:${globalOrdinal}:${JSON.stringify(rejectCounts)}`);
}

function buildParagraphReservations(sceneProfiles, counts) {
  const paragraphReservation = new Map();
  const reservationCountBySceneFamily = new Map();
  const structuralAllocations = allocateWeightedCounts(sceneProfiles, counts.structural);
  const formattingAllocations = allocateWeightedCounts(sceneProfiles, counts.formatting);
  for (let sceneIndex = 0; sceneIndex < sceneProfiles.length; sceneIndex += 1) {
    const scene = sceneProfiles[sceneIndex];
    const available = [...scene.paragraphs].sort((left, right) => left.paragraphOrdinal - right.paragraphOrdinal);
    const reserve = (family, requested) => {
      const chosen = [];
      for (let index = 0; index < requested; index += 1) {
        const phase = ((sceneIndex * 3) + (family === 'formatting' ? 1 : 0)) % 10;
        const spreadDecile = Math.floor(((index + 0.5) * 10) / Math.max(1, requested));
        const targetDecile = (phase + spreadDecile) % 10;
        const candidate = [...available]
          .filter((paragraph) => !paragraphReservation.has(paragraph.paragraphId))
          .sort((left, right) => (
            Math.abs(left.decile - targetDecile) - Math.abs(right.decile - targetDecile)
          ) || (left.paragraphOrdinal - right.paragraphOrdinal))[0];
        if (!candidate) throw new Error(`C5V2_PARAGRAPH_RESERVATION_EXHAUSTED:${scene.sceneId}:${family}`);
        paragraphReservation.set(candidate.paragraphId, family);
        chosen.push(candidate);
      }
      reservationCountBySceneFamily.set(`${scene.sceneId}:${family}`, chosen.length);
    };
    reserve('structural', structuralAllocations[sceneIndex]);
    const remainingParagraphs = Math.max(0, available.length - structuralAllocations[sceneIndex] - 1);
    const formattingParagraphs = formattingAllocations[sceneIndex] > 0
      ? Math.min(remainingParagraphs, formattingAllocations[sceneIndex])
      : 0;
    reserve('formatting', formattingParagraphs);
  }
  return { paragraphReservation, reservationCountBySceneFamily };
}

function buildPositiveFamilyOperations({
  operations,
  family,
  count,
  sceneProfiles,
  globalOffsets,
  state,
  roundCount,
}) {
  const allocations = allocateWeightedCounts(sceneProfiles, count);
  let familyOrdinal = 0;
  for (let sceneIndex = 0; sceneIndex < sceneProfiles.length; sceneIndex += 1) {
    const sceneProfile = sceneProfiles[sceneIndex];
    for (let localOrdinal = 0; localOrdinal < allocations[sceneIndex]; localOrdinal += 1) {
      const trackedKind = family === 'tracked_text_edit'
        ? TRACKED_INTENTS[familyOrdinal % TRACKED_INTENTS.length]
        : '';
      const spanType = family === 'root_comment'
        ? COMMENT_SPAN_TYPES[familyOrdinal % COMMENT_SPAN_TYPES.length]
        : family === 'tracked_text_edit'
          ? TRACKED_SPAN_TYPES[familyOrdinal % TRACKED_SPAN_TYPES.length]
          : 'phrase';
      const { paragraph, anchor } = selectUniqueAnchor({
        sceneProfile,
        family,
        familyCount: count,
        familySceneOrdinal: localOrdinal,
        globalOrdinal: familyOrdinal,
        globalOffset: globalOffsets[sceneIndex] || 0,
        spanType,
        state,
        requireSceneUniqueSelectedText: family === 'root_comment',
      });
      const id = `c5v2-${family}-${String(familyOrdinal + 1).padStart(4, '0')}`;
      const round = (familyOrdinal % roundCount) + 1;
      if (family === 'root_comment') {
        state.rootCommentAnchorKeys.add([
          anchor.sceneId,
          anchor.paragraphId,
          anchor.graphemeStart,
          anchor.graphemeEnd,
          anchor.contextBefore,
          anchor.contextAfter,
        ].join('|'));
        state.commentParagraphCounts.set(paragraph.paragraphId, (state.commentParagraphCounts.get(paragraph.paragraphId) || 0) + 1);
        state.commentThreads.push({
          threadId: `thread-${String(state.commentThreads.length + 1).padStart(4, '0')}`,
          rootOperationId: id,
          sceneId: sceneProfile.sceneId,
          paragraphId: paragraph.paragraphId,
          anchor,
        });
      }
      const intent = family === 'tracked_text_edit'
        ? {
            kind: trackedKind,
            spanType,
            replacementText: `${UNICODE_REPLACEMENTS[familyOrdinal % UNICODE_REPLACEMENTS.length].text} c5v2 edit ${familyOrdinal + 1}`,
            unicodeProfile: UNICODE_REPLACEMENTS[familyOrdinal % UNICODE_REPLACEMENTS.length].profile,
          }
        : family === 'formatting'
          ? {
              kind: FORMAT_FEATURES[familyOrdinal % FORMAT_FEATURES.length],
              spanType: FORMAT_FEATURES[familyOrdinal % FORMAT_FEATURES.length] === 'textAlign' ? 'paragraph' : 'inline',
            }
          : family === 'structural'
            ? {
                kind: STRUCTURAL_FEATURES[0],
                nodeType: 'heading',
                headingLevel: (familyOrdinal % 3) + 1,
                supportedProductRoute: 'cmd.project.review.applyStructuralReturn',
                typedPendingStructuralKinds: ['split', 'merge', 'list', 'pageBreak', 'reorder'],
              }
            : {
                kind: 'root-comment',
                spanType,
                commentText: `C5V2 natural root comment ${familyOrdinal + 1}`,
              };
      addOperation(operations, {
        id,
        family,
        round,
        sceneId: sceneProfile.sceneId,
        anchor,
        semanticIntent: intent,
        ...(family === 'tracked_text_edit'
          ? {
              expectedOutcome: trackedKind === 'insert' || anchor.sceneSelectedTextOccurrenceCount !== 1
                ? 'MANUAL'
                : 'EXACT',
            }
          : {}),
      });
      familyOrdinal += 1;
    }
  }
}

function buildThreadLifecycleOperations({ operations, family, count, state, sceneProfiles, roundCount }) {
  if (state.commentThreads.length === 0) {
    throw new Error(`C5V2_${family.toUpperCase()}_ROOT_THREADS_REQUIRED`);
  }
  const threadsBySceneId = new Map();
  for (const thread of state.commentThreads) {
    if (!threadsBySceneId.has(thread.sceneId)) threadsBySceneId.set(thread.sceneId, []);
    threadsBySceneId.get(thread.sceneId).push(thread);
  }
  const sortedThreads = [...state.commentThreads].sort((a, b) => (
    (a.anchor?.globalGraphemeStart || 0) - (b.anchor?.globalGraphemeStart || 0)
  ) || a.threadId.localeCompare(b.threadId));
  for (let index = 0; index < count; index += 1) {
    let candidates;
    if (index < sceneProfiles.length) {
      const sceneProfile = sceneProfiles[index % sceneProfiles.length];
      candidates = threadsBySceneId.get(sceneProfile.sceneId) || [];
    } else {
      const targetIndex = Math.min(sortedThreads.length - 1, Math.floor((index * sortedThreads.length) / count));
      candidates = [...sortedThreads.slice(targetIndex), ...sortedThreads.slice(0, targetIndex)];
    }
    const maxBucket = Math.max(2, Math.ceil(count * 0.02));
    const thread = candidates.find((candidate) => {
      if (state.lifecycleThreadIdsUsed.has(candidate.threadId)) return false;
      const start = Number(candidate.anchor?.globalGraphemeStart || 0);
      const bucket = Math.min(99, Math.max(0, Math.floor((start / Math.max(1, state.totalGraphemes)) * 100)));
      return (state.lifecycleBucketCounts.get(`${family}:${bucket}`) || 0) < maxBucket;
    });
    if (!thread) throw new Error(`C5V2_${family.toUpperCase()}_UNIQUE_THREAD_TARGET_EXHAUSTED:${index}`);
    state.lifecycleThreadIdsUsed.add(thread.threadId);
    const threadBucket = Math.min(99, Math.max(0, Math.floor(
      (Number(thread.anchor?.globalGraphemeStart || 0) / Math.max(1, state.totalGraphemes)) * 100,
    )));
    const lifecycleBucketKey = `${family}:${threadBucket}`;
    state.lifecycleBucketCounts.set(lifecycleBucketKey, (state.lifecycleBucketCounts.get(lifecycleBucketKey) || 0) + 1);
    const id = `c5v2-${family}-${String(index + 1).padStart(4, '0')}`;
    addOperation(operations, {
      id,
      family,
      round: (index % roundCount) + 1,
      sceneId: thread.sceneId,
      anchor: thread.anchor,
      targetRootOperationId: thread.rootOperationId,
      targetThreadId: thread.threadId,
      semanticIntent: family === 'reply'
        ? {
            kind: index % 5 === 0 ? 'multi-reply-thread' : 'single-reply-thread',
            parentThreadId: thread.threadId,
            replyText: `C5V2 reply ${index + 1}`,
          }
        : {
            kind: COMMENT_STATE_INTENTS[index % COMMENT_STATE_INTENTS.length],
            parentThreadId: thread.threadId,
            lifecycleOrder: Math.floor(index / state.commentThreads.length) + 1,
          },
    });
  }
}

function buildNegativeProbeOperations({ operations, count, sceneProfiles }) {
  const kinds = ['stale-baseline', 'conflicting-overlap', 'tampered-authority', 'wrong-scene', 'corrupt-package', 'replay-conflict', 'truncated-package', 'duplicate-request-mutated-payload'];
  for (let index = 0; index < count; index += 1) {
    const sceneProfile = sceneProfiles[index % sceneProfiles.length];
    addOperation(operations, {
      id: `c5v2-negative-probe-${String(index + 1).padStart(4, '0')}`,
      family: 'negative_probe',
      round: 0,
      sceneId: sceneProfile.sceneId,
      isolatedFork: true,
      semanticIntent: {
        kind: kinds[index % kinds.length],
        contaminationPolicy: 'separate-copy-never-positive-authority-chain',
      },
    });
  }
}

function assignCumulativeRounds(operations, sceneProfiles, roundCount) {
  const sceneOrdinalById = new Map(sceneProfiles.map((scene) => [scene.sceneId, scene.sceneOrdinal]));
  const paragraphRound = new Map();
  const rootRoundByOperationId = new Map();
  const roundAtOffset = (base, offset) => ((base - 1 + offset) % roundCount) + 1;
  for (const operation of operations) {
    if (!MUTATING_CONTENT_FAMILIES.has(operation.family)) continue;
    const paragraphId = operation.anchor?.paragraphId || '';
    if (!paragraphId) continue;
    let round = paragraphRound.get(paragraphId);
    if (!round) {
      const sceneOrdinal = sceneOrdinalById.get(operation.sceneId) || 0;
      const base = (sceneOrdinal % roundCount) + 1;
      const hashParity = Number.parseInt(stableHash(paragraphId).slice(0, 8), 16) % 2;
      if (operation.family === 'tracked_text_edit') round = roundAtOffset(base, hashParity === 0 ? 0 : 4);
      else if (operation.family === 'formatting') round = roundAtOffset(base, 2);
      else if (operation.family === 'structural') round = roundAtOffset(base, 3);
      else round = roundAtOffset(base, 1 + (Number.parseInt(stableHash(paragraphId).slice(8, 16), 16) % 4));
      paragraphRound.set(paragraphId, round);
    }
    operation.round = round;
  }
  for (const operation of operations) {
    if (operation.family === 'negative_probe' || THREAD_TARGET_FAMILIES.has(operation.family)) continue;
    if (MUTATING_CONTENT_FAMILIES.has(operation.family)) continue;
    const paragraphId = operation.anchor?.paragraphId || '';
    if (!paragraphId) continue;
    let round = paragraphRound.get(paragraphId);
    if (!round) {
      const sceneOrdinal = sceneOrdinalById.get(operation.sceneId) || 0;
      const base = (sceneOrdinal % roundCount) + 1;
      round = roundAtOffset(base, 1 + (Number.parseInt(stableHash(paragraphId).slice(8, 16), 16) % 4));
      paragraphRound.set(paragraphId, round);
    }
    operation.round = round;
    if (operation.family === 'root_comment') rootRoundByOperationId.set(operation.id, round);
  }
  for (const operation of operations) {
    if (!THREAD_TARGET_FAMILIES.has(operation.family)) continue;
    const round = rootRoundByOperationId.get(operation.targetRootOperationId)
      || paragraphRound.get(operation.anchor?.paragraphId || '');
    if (!Number.isInteger(round)) throw new Error(`C5V2_LIFECYCLE_ROUND_AUTHORITY_MISSING:${operation.id}`);
    operation.round = round;
  }
}

function operationAnchorKey(operation) {
  const anchor = operation.anchor || {};
  return [
    anchor.sceneId,
    anchor.paragraphId,
    anchor.graphemeStart,
    anchor.graphemeEnd,
    anchor.contextBefore,
    anchor.contextAfter,
  ].join('|');
}

function computeCoverage(operations, sceneProfiles, counts) {
  const sceneIds = sceneProfiles.map((scene) => scene.sceneId);
  const byFamily = {};
  const featureSceneBandRound = {};
  for (const [family, expected] of Object.entries(counts)) {
    const familyOps = operations.filter((operation) => operation.family === family);
    const scenes = new Set(familyOps.map((operation) => operation.sceneId).filter(Boolean));
    const deciles = new Set(familyOps.map((operation) => operation.anchor?.positionalDecile).filter((value) => Number.isInteger(value)));
    const thirds = new Set(familyOps.map((operation) => operation.anchor?.positionalThird).filter(Boolean));
    const paragraphs = new Set(familyOps.map((operation) => operation.anchor?.paragraphId).filter(Boolean));
    const contexts = new Set(familyOps.map(operationAnchorKey).filter(Boolean));
    const spanTypes = {};
    for (const operation of familyOps) {
      const spanType = operation.anchor?.spanType || operation.semanticIntent?.spanType || operation.semanticIntent?.kind || 'none';
      spanTypes[spanType] = (spanTypes[spanType] || 0) + 1;
      if (operation.anchor) {
        const key = [
          family,
          operation.sceneId,
          operation.anchor.positionalThird,
          operation.round,
        ].join('|');
        featureSceneBandRound[key] = (featureSceneBandRound[key] || 0) + 1;
      }
    }
    byFamily[family] = {
      expected,
      actual: familyOps.length,
      sceneCoverage: scenes.size,
      requiredSceneCoverage: HIGH_COUNT_SCENE_COVERAGE_FAMILIES.includes(family) ? sceneIds.length : 0,
      decileCoverage: deciles.size,
      thirdCoverage: thirds.size,
      uniqueParagraphRatio: familyOps.length > 0 ? paragraphs.size / familyOps.length : 1,
      uniqueContextRatio: familyOps.length > 0 ? contexts.size / familyOps.length : 1,
      spanTypes,
    };
  }
  return {
    sceneCount: sceneIds.length,
    byFamily,
    featureSceneBandRound,
  };
}

function gini(values) {
  const sorted = values.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  const sum = sorted.reduce((total, value) => total + value, 0);
  if (sum === 0) return 0;
  let weighted = 0;
  for (let index = 0; index < n; index += 1) {
    weighted += (index + 1) * sorted[index];
  }
  return (2 * weighted) / (n * sum) - (n + 1) / n;
}

export function validateC5V2LedgerDistribution({ operations, sceneProfiles, counts = DEFAULT_C5V2_LEDGER_COUNTS }) {
  const failures = [];
  const positives = operations.filter((operation) => operation.family !== 'negative_probe');
  const anchorKeys = new Set();
  const primaryAnchorStarts = new Set();
  const rootCommentAnchorKeys = new Set();
  const paragraphCommentCounts = new Map();
  const familyBucketCounts = new Map();
  const paragraphRounds = new Map();
  const paragraphMutationFamilies = new Map();
  const sceneRoundMutationFamilies = new Map();
  const totalGraphemes = sceneProfiles.reduce((sum, scene) => sum + scene.graphemeCount, 0);
  const sceneProfileById = new Map(sceneProfiles.map((scene) => [scene.sceneId, scene]));
  const coverage = computeCoverage(operations, sceneProfiles, counts);

  for (const [family, expected] of Object.entries(counts)) {
    const actual = operations.filter((operation) => operation.family === family).length;
    if (actual !== expected) {
      failures.push({ code: 'C5V2_FAMILY_COUNT_MISMATCH', family, expected, actual });
    }
  }

  for (const family of HIGH_COUNT_SCENE_COVERAGE_FAMILIES) {
    const stats = coverage.byFamily[family];
    if (stats && stats.sceneCoverage !== sceneProfiles.length) {
      failures.push({ code: 'C5V2_SCENE_COVERAGE_MISSING', family, expected: sceneProfiles.length, actual: stats.sceneCoverage });
    }
    if (stats && stats.decileCoverage < Math.min(10, sceneProfiles.length > 1 ? 10 : 1)) {
      failures.push({ code: 'C5V2_DECILE_COVERAGE_MISSING', family, actual: stats.decileCoverage });
    }
    if (stats && stats.thirdCoverage < 3) {
      failures.push({ code: 'C5V2_BEGINNING_MIDDLE_END_COVERAGE_MISSING', family, actual: stats.thirdCoverage });
    }
  }

  for (const operation of positives) {
    const serialized = JSON.stringify(operation);
    for (const token of SENTINEL_TOKENS) {
      if (serialized.includes(token)) {
        failures.push({ code: 'C5V2_SYNTHETIC_POSITIVE_AUTHORITY', operationId: operation.id, token });
      }
    }
    if (!operation.anchor && !['reply', 'comment_state'].includes(operation.family)) {
      failures.push({ code: 'C5V2_POSITIVE_ANCHOR_REQUIRED', operationId: operation.id });
      continue;
    }
    if (operation.anchor) {
      const sceneProfile = sceneProfileById.get(operation.sceneId);
      const occurrenceCount = Number.isInteger(operation.anchor.sceneSelectedTextOccurrenceCount)
        ? operation.anchor.sceneSelectedTextOccurrenceCount
        : typeof sceneProfile?.text === 'string'
          ? countExactOccurrences(sceneProfile.text, operation.anchor.selectedText)
          : null;
      if (
        operation.family === 'tracked_text_edit'
        && operation.expectedOutcome === 'EXACT'
        && occurrenceCount !== 1
      ) {
        failures.push({ code: 'C5V2_EXACT_TRACKED_SELECTION_NOT_SCENE_UNIQUE', operationId: operation.id, occurrenceCount });
      }
      if (operation.family === 'root_comment' && occurrenceCount !== 1) {
        failures.push({ code: 'C5V2_ROOT_COMMENT_SELECTION_NOT_SCENE_UNIQUE', operationId: operation.id, occurrenceCount });
      }
      const key = operationAnchorKey(operation);
      if (!THREAD_TARGET_FAMILIES.has(operation.family) && anchorKeys.has(key)) {
        failures.push({ code: 'C5V2_DUPLICATE_POSITIVE_ANCHOR', operationId: operation.id });
      }
      if (!THREAD_TARGET_FAMILIES.has(operation.family)) {
        anchorKeys.add(key);
        const startKey = `${operation.anchor.sceneId}|${operation.anchor.paragraphId}|${operation.anchor.graphemeStart}`;
        if (primaryAnchorStarts.has(startKey)) {
          failures.push({ code: 'C5V2_DUPLICATE_POSITIVE_ANCHOR_START', operationId: operation.id });
        }
        primaryAnchorStarts.add(startKey);
      }
      if (operation.family === 'root_comment') {
        if (rootCommentAnchorKeys.has(key)) {
          failures.push({ code: 'C5V2_DUPLICATE_POSITIVE_ROOT_COMMENT_ANCHOR', operationId: operation.id });
        }
        rootCommentAnchorKeys.add(key);
      }
      if (COMMENT_FAMILIES.has(operation.family)) {
        paragraphCommentCounts.set(
          operation.anchor.paragraphId,
          (paragraphCommentCounts.get(operation.anchor.paragraphId) || 0) + 1,
        );
      }
      const paragraphRoundSet = paragraphRounds.get(operation.anchor.paragraphId) || new Set();
      paragraphRoundSet.add(operation.round);
      paragraphRounds.set(operation.anchor.paragraphId, paragraphRoundSet);
      if (MUTATING_CONTENT_FAMILIES.has(operation.family)) {
        const paragraphFamilySet = paragraphMutationFamilies.get(operation.anchor.paragraphId) || new Set();
        paragraphFamilySet.add(operation.family);
        paragraphMutationFamilies.set(operation.anchor.paragraphId, paragraphFamilySet);
        const sceneRoundKey = `${operation.sceneId}:${operation.round}`;
        const sceneRoundFamilySet = sceneRoundMutationFamilies.get(sceneRoundKey) || new Set();
        sceneRoundFamilySet.add(operation.family);
        sceneRoundMutationFamilies.set(sceneRoundKey, sceneRoundFamilySet);
      }
      const bucket = Math.min(99, Math.max(0, Math.floor((operation.anchor.globalGraphemeStart / Math.max(1, totalGraphemes)) * 100)));
      const familyBucketKey = `${operation.family}:${bucket}`;
      familyBucketCounts.set(familyBucketKey, (familyBucketCounts.get(familyBucketKey) || 0) + 1);
    }
  }

  for (const [paragraphId, count] of paragraphCommentCounts.entries()) {
    if (count > 2) {
      failures.push({ code: 'C5V2_COMMENT_PARAGRAPH_HOTSPOT', paragraphId, count });
    }
  }

  for (const [paragraphId, rounds] of paragraphRounds.entries()) {
    if (rounds.size > 1) {
      failures.push({ code: 'C5V2_PARAGRAPH_REUSED_ACROSS_CUMULATIVE_ROUNDS', paragraphId, rounds: [...rounds].sort() });
    }
  }
  for (const [paragraphId, families] of paragraphMutationFamilies.entries()) {
    if (families.size > 1) {
      failures.push({ code: 'C5V2_PARAGRAPH_MIXED_MUTATION_FAMILIES', paragraphId, families: [...families].sort() });
    }
  }
  for (const [sceneRound, families] of sceneRoundMutationFamilies.entries()) {
    if (families.size > 1) {
      failures.push({ code: 'C5V2_SCENE_ROUND_MIXED_MUTATION_FAMILIES', sceneRound, families: [...families].sort() });
    }
  }

  for (const family of POSITIVE_FAMILIES) {
    const familyTotal = operations.filter((operation) => operation.family === family).length;
    const maxBucket = Math.max(2, Math.ceil(familyTotal * 0.02));
    for (const [key, count] of familyBucketCounts.entries()) {
      if (!key.startsWith(`${family}:`)) continue;
      if (count > maxBucket) {
        failures.push({ code: 'C5V2_ONE_PERCENT_WINDOW_HOTSPOT', family, bucket: key.split(':')[1], count, maxAllowed: maxBucket });
      }
    }
  }

  const paragraphTotals = new Map();
  for (const operation of positives) {
    if (!operation.anchor?.paragraphId) continue;
    paragraphTotals.set(operation.anchor.paragraphId, (paragraphTotals.get(operation.anchor.paragraphId) || 0) + 1);
  }
  const heatmap = {
    schemaVersion: 'yalken.rtk.word.c5v2.coverage-heatmap.v1',
    coverage,
    paragraphHotspotGini: gini([...paragraphTotals.values()]),
    paragraphOperationHistogram: [...paragraphTotals.entries()]
      .map(([paragraphId, count]) => ({ paragraphId, count }))
      .sort((a, b) => (b.count - a.count) || a.paragraphId.localeCompare(b.paragraphId)),
  };

  return {
    ok: failures.length === 0,
    failures,
    heatmap,
  };
}

export function buildC5V2Ledger(input = {}) {
  const scenes = Array.isArray(input.scenes) ? input.scenes : [];
  const counts = { ...DEFAULT_C5V2_LEDGER_COUNTS, ...(input.counts || {}) };
  const roundCount = Number.isInteger(input.roundCount) && input.roundCount > 0 ? input.roundCount : 5;
  const sceneProfiles = buildSceneProfiles(scenes);
  const globalOffsets = [];
  let offset = 0;
  for (const scene of sceneProfiles) {
    globalOffsets.push(offset);
    offset += scene.graphemeCount;
  }
  const reservations = buildParagraphReservations(sceneProfiles, counts);
  const state = {
    commentParagraphCounts: new Map(),
    rootCommentAnchorKeys: new Set(),
    commentThreads: [],
    primaryAnchorKeys: new Set(),
    primaryAnchorStarts: new Set(),
    familyParagraphUseCounts: new Map(),
    familyBucketCounts: new Map(),
    lifecycleThreadIdsUsed: new Set(),
    lifecycleBucketCounts: new Map(),
    paragraphMutationFamily: new Map(),
    paragraphPrimaryRanges: new Map(),
    paragraphReservation: reservations.paragraphReservation,
    reservationCountBySceneFamily: reservations.reservationCountBySceneFamily,
    totalGraphemes: offset,
  };
  const operations = [];
  buildPositiveFamilyOperations({
    operations,
    family: 'tracked_text_edit',
    count: counts.tracked_text_edit,
    sceneProfiles,
    globalOffsets,
    state,
    roundCount,
  });
  buildPositiveFamilyOperations({
    operations,
    family: 'root_comment',
    count: counts.root_comment,
    sceneProfiles,
    globalOffsets,
    state,
    roundCount,
  });
  buildThreadLifecycleOperations({
    operations,
    family: 'reply',
    count: counts.reply,
    state,
    sceneProfiles,
    roundCount,
  });
  buildThreadLifecycleOperations({
    operations,
    family: 'comment_state',
    count: counts.comment_state,
    state,
    sceneProfiles,
    roundCount,
  });
  buildPositiveFamilyOperations({
    operations,
    family: 'formatting',
    count: counts.formatting,
    sceneProfiles,
    globalOffsets,
    state,
    roundCount,
  });
  buildPositiveFamilyOperations({
    operations,
    family: 'structural',
    count: counts.structural,
    sceneProfiles,
    globalOffsets,
    state,
    roundCount,
  });
  assignCumulativeRounds(operations, sceneProfiles, roundCount);
  buildNegativeProbeOperations({
    operations,
    count: counts.negative_probe,
    sceneProfiles,
  });
  const validation = validateC5V2LedgerDistribution({ operations, sceneProfiles, counts });
  const ledger = {
    schemaVersion: C5V2_LEDGER_SCHEMA,
    topology: 'one-full-manuscript-project-cumulative-rounds',
    roundCount,
    counts,
    sceneCount: sceneProfiles.length,
    sceneProfiles: sceneProfiles.map((scene) => ({
      sceneId: scene.sceneId,
      sceneOrdinal: scene.sceneOrdinal,
      title: scene.title,
      wordCount: scene.wordCount,
      graphemeCount: scene.graphemeCount,
      rawSha256: scene.rawSha256,
      paragraphCount: scene.paragraphs.length,
    })),
    operations,
    ledgerDigest: sha256Text(JSON.stringify(operations)),
    distribution: validation.heatmap,
    gates: {
      ok: validation.ok,
      failures: validation.failures,
    },
  };
  return ledger;
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--scenes-json') {
      out.scenesJson = argv[index + 1];
      index += 1;
    } else if (arg === '--out') {
      out.out = argv[index + 1];
      index += 1;
    }
  }
  return out;
}

if (process.argv[1] === __filename) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.scenesJson) {
    console.error('C5V2_SCENES_JSON_REQUIRED');
    process.exit(2);
  }
  const scenes = JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, args.scenesJson), 'utf8'));
  const ledger = buildC5V2Ledger({ scenes });
  if (args.out) {
    fs.writeFileSync(path.resolve(REPO_ROOT, args.out), `${JSON.stringify(ledger, null, 2)}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(ledger, null, 2)}\n`);
  }
  process.exit(ledger.gates.ok ? 0 : 1);
}
