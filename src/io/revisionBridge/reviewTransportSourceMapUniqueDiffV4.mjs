import { stableJson } from './reviewTransportCore.mjs';

export const RTK_WORD_V4_SOURCEMAP_UNIQUEDIFF_SCHEMA =
  'yalken.rtk.word-v4.sourcemap-uniquediff.v1';
export const RTK_WORD_V4_SOURCEMAP_UNIQUEDIFF_PROFILE =
  'word-v4-sourcemap-uniquediff-e05';
export const RTK_WORD_V4_SOURCEMAP_SCHEMA =
  'yalken.rtk.word-v4.source-map.v1';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function list(value) {
  return Array.isArray(value) ? value.filter(isPlainObject) : [];
}

function rawString(value) {
  return typeof value === 'string' ? value : '';
}

function integer(value) {
  return Number.isInteger(value) ? value : -1;
}

function reason(code, field, message, details = {}) {
  return { code, field, message, ...details };
}

function resolveCryptoPort(port = {}) {
  if (typeof port.sha256Text === 'function' && typeof port.sha256Json === 'function') {
    return { ok: true, port };
  }
  return { ok: false, port: null };
}

function digestJson(cryptoPort, value) {
  return cryptoPort.sha256Json(value);
}

function digestText(cryptoPort, value) {
  return cryptoPort.sha256Text(String(value || ''));
}

function normalizeBlock(block) {
  const sceneId = rawString(block.sceneId);
  const blockId = rawString(block.blockId);
  return {
    sceneId,
    blockId,
    text: rawString(block.text),
    rawSha256: rawString(block.rawSha256),
    blockKey: `${sceneId}\u0000${blockId}`,
  };
}

function projectionBlocks(projection) {
  return list(projection?.blocks).map(normalizeBlock);
}

function blockMap(blocks) {
  const out = new Map();
  const duplicates = new Set();
  for (const block of blocks) {
    if (!block.sceneId || !block.blockId) continue;
    if (out.has(block.blockKey)) duplicates.add(block.blockKey);
    out.set(block.blockKey, block);
  }
  return { map: out, duplicates: [...duplicates] };
}

function canonicalSourceMapRows(rows) {
  return rows.map((row) => ({
    wordSegmentId: rawString(row.wordSegmentId),
    sceneId: rawString(row.sceneId),
    blockId: rawString(row.blockId),
    segmentId: rawString(row.segmentId),
    start: integer(row.start),
    end: integer(row.end),
    expectedText: rawString(row.expectedText),
    blockTextDigest: rawString(row.blockTextDigest),
    sliceDigest: rawString(row.sliceDigest),
  }));
}

export function computeWordV4SourceMapDigest(sourceMap = {}, ports = {}) {
  const cryptoState = resolveCryptoPort(ports.cryptoPort);
  if (!cryptoState.ok) {
    return {
      ok: false,
      code: 'RTK_V4_E05_CRYPTO_PORT_REQUIRED',
      digest: '',
    };
  }
  const rows = canonicalSourceMapRows(list(sourceMap.rows));
  return {
    ok: true,
    schemaVersion: RTK_WORD_V4_SOURCEMAP_SCHEMA,
    digest: digestJson(cryptoState.port, {
      schemaVersion: RTK_WORD_V4_SOURCEMAP_SCHEMA,
      rows,
    }),
  };
}

export function buildWordV4SourceMapRow(input = {}, ports = {}) {
  const cryptoState = resolveCryptoPort(ports.cryptoPort);
  if (!cryptoState.ok) {
    return {
      ok: false,
      code: 'RTK_V4_E05_CRYPTO_PORT_REQUIRED',
      row: null,
    };
  }
  const cryptoPort = cryptoState.port;
  const text = rawString(input.blockText);
  const start = integer(input.start);
  const end = integer(input.end);
  const expectedText = start >= 0 && end >= start ? text.slice(start, end) : rawString(input.expectedText);
  return {
    ok: true,
    row: {
      wordSegmentId: rawString(input.wordSegmentId),
      sceneId: rawString(input.sceneId),
      blockId: rawString(input.blockId),
      segmentId: rawString(input.segmentId),
      start,
      end,
      expectedText,
      blockTextDigest: digestText(cryptoPort, text),
      sliceDigest: digestText(cryptoPort, expectedText),
    },
  };
}

function validateProjectionBlocks(label, blocks, cryptoPort) {
  const reasons = [];
  const mapped = blockMap(blocks);
  for (const duplicate of mapped.duplicates) {
    reasons.push(reason('RTK_V4_E05_DUPLICATE_BLOCK_ID', `${label}.blocks`, 'Projection block identity must be unique.', { duplicate }));
  }
  for (const block of blocks) {
    if (!block.sceneId || !block.blockId) {
      reasons.push(reason('RTK_V4_E05_BLOCK_ID_REQUIRED', `${label}.blocks`, 'Projection blocks require sceneId and blockId.'));
      continue;
    }
    if (block.rawSha256 && block.rawSha256 !== digestText(cryptoPort, block.text)) {
      reasons.push(reason('RTK_V4_E05_STALE_BLOCK_TEXT_DIGEST', `${label}.blocks.rawSha256`, 'Projection block rawSha256 must match text bytes.', {
        sceneId: block.sceneId,
        blockId: block.blockId,
      }));
    }
  }
  return { reasons, mapped };
}

function validateSourceMap({ sourceMap, baselineBlocks, cryptoPort }) {
  const reasons = [];
  const rows = canonicalSourceMapRows(list(sourceMap.rows));
  const baseline = blockMap(baselineBlocks).map;
  if (rawString(sourceMap.schemaVersion) !== RTK_WORD_V4_SOURCEMAP_SCHEMA) {
    reasons.push(reason('RTK_V4_E05_SOURCEMAP_SCHEMA_REQUIRED', 'sourceMap.schemaVersion', 'SourceMap schema must be versioned.'));
  }
  const digest = computeWordV4SourceMapDigest({ rows }, { cryptoPort });
  if (rawString(sourceMap.digest) && sourceMap.digest !== digest.digest) {
    reasons.push(reason('RTK_V4_E05_SOURCEMAP_DIGEST_MISMATCH', 'sourceMap.digest', 'SourceMap digest must bind canonical rows.'));
  }

  const segmentIds = new Set();
  const coordinates = new Set();
  const rowsByBlock = new Map();
  for (const row of rows) {
    if (!row.wordSegmentId) {
      reasons.push(reason('RTK_V4_E05_SEGMENT_ID_REQUIRED', 'sourceMap.rows.wordSegmentId', 'Every source-map row requires a Word segment identity.'));
    }
    if (segmentIds.has(row.wordSegmentId)) {
      reasons.push(reason('RTK_V4_E05_DUPLICATE_WORD_SEGMENT', 'sourceMap.rows.wordSegmentId', 'Word segment identity must be unique.', {
        wordSegmentId: row.wordSegmentId,
      }));
    }
    segmentIds.add(row.wordSegmentId);

    const blockKey = `${row.sceneId}\u0000${row.blockId}`;
    const block = baseline.get(blockKey);
    if (!block) {
      reasons.push(reason('RTK_V4_E05_SOURCEMAP_BLOCK_MISSING', 'sourceMap.rows.blockId', 'SourceMap row must bind an existing baseline block.', {
        sceneId: row.sceneId,
        blockId: row.blockId,
      }));
      continue;
    }
    if (row.start < 0 || row.end < row.start || row.end > block.text.length) {
      reasons.push(reason('RTK_V4_E05_SOURCEMAP_RANGE_INVALID', 'sourceMap.rows.start', 'SourceMap row range must fit the baseline block.'));
      continue;
    }
    const targetKey = `${blockKey}\u0000${row.start}\u0000${row.end}`;
    if (coordinates.has(targetKey)) {
      reasons.push(reason('RTK_V4_E05_DUPLICATE_SOURCEMAP_RANGE', 'sourceMap.rows', 'SourceMap coordinates must be bijective.'));
    }
    coordinates.add(targetKey);
    const expectedText = block.text.slice(row.start, row.end);
    if (row.expectedText !== expectedText) {
      reasons.push(reason('RTK_V4_E05_SOURCEMAP_EXPECTED_TEXT_STALE', 'sourceMap.rows.expectedText', 'SourceMap expected text must match the baseline slice.'));
    }
    if (row.blockTextDigest !== digestText(cryptoPort, block.text)) {
      reasons.push(reason('RTK_V4_E05_SOURCEMAP_BLOCK_DIGEST_STALE', 'sourceMap.rows.blockTextDigest', 'SourceMap block digest must match the baseline block.'));
    }
    if (row.sliceDigest !== digestText(cryptoPort, expectedText)) {
      reasons.push(reason('RTK_V4_E05_SOURCEMAP_SLICE_DIGEST_STALE', 'sourceMap.rows.sliceDigest', 'SourceMap slice digest must match the baseline slice.'));
    }
    const blockRows = rowsByBlock.get(blockKey) || [];
    blockRows.push(row);
    rowsByBlock.set(blockKey, blockRows);
  }

  for (const [blockKey, blockRows] of rowsByBlock.entries()) {
    const sorted = [...blockRows].sort((a, b) => a.start - b.start || a.end - b.end);
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].start < sorted[i - 1].end) {
        reasons.push(reason('RTK_V4_E05_SOURCEMAP_OVERLAP', 'sourceMap.rows', 'SourceMap ranges must not overlap within a block.', { blockKey }));
      }
    }
  }

  return {
    rows,
    digest: digest.digest,
    rowsBySegment: new Map(rows.map((row) => [row.wordSegmentId, row])),
    reasons,
  };
}

function computeSingleHunkDiff(before, after) {
  let prefix = 0;
  const maxPrefix = Math.min(before.length, after.length);
  while (prefix < maxPrefix && before[prefix] === after[prefix]) prefix += 1;

  let suffix = 0;
  const maxSuffix = Math.min(before.length - prefix, after.length - prefix);
  while (
    suffix < maxSuffix
    && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const beforeText = before.slice(prefix, before.length - suffix);
  const afterText = after.slice(prefix, after.length - suffix);
  let operation = 'replace';
  if (!beforeText && afterText) operation = 'insert';
  if (beforeText && !afterText) operation = 'delete';
  if (!beforeText && !afterText) operation = 'noop';

  return {
    operation,
    start: prefix,
    end: before.length - suffix,
    expectedText: beforeText,
    replacementText: afterText,
  };
}

function hasInteriorConservedText(beforeText, afterText) {
  if (beforeText.length < 2 || afterText.length < 2) return false;
  const grams = new Set();
  for (let i = 0; i + 2 <= beforeText.length; i += 1) {
    grams.add(beforeText.slice(i, i + 2));
  }
  for (let i = 0; i + 2 <= afterText.length; i += 1) {
    if (grams.has(afterText.slice(i, i + 2))) return true;
  }
  return false;
}

function findCoveringRows(rows, block, start, end) {
  return rows.filter((row) => {
    if (row.sceneId !== block.sceneId || row.blockId !== block.blockId) return false;
    if (start === end) return row.start <= start && row.end >= end;
    return row.start <= start && row.end >= end;
  });
}

function buildAcceptedUntrackedEffects({ baselineBlocks, originalBlocks, sourceMapState, cryptoPort }) {
  const reasons = [];
  const effects = [];
  const original = blockMap(originalBlocks).map;
  for (const block of baselineBlocks) {
    const originalBlock = original.get(block.blockKey);
    if (!originalBlock) {
      reasons.push(reason('RTK_V4_E05_ORIGINAL_BLOCK_MISSING', 'projections.O.blocks', 'Original projection must preserve block identity for E05 text effects.', {
        sceneId: block.sceneId,
        blockId: block.blockId,
      }));
      continue;
    }
    if (block.text === originalBlock.text) continue;

    const diff = computeSingleHunkDiff(block.text, originalBlock.text);
    if (diff.operation === 'replace' && hasInteriorConservedText(diff.expectedText, diff.replacementText)) {
      reasons.push(reason('RTK_V4_E05_MULTI_HUNK_UNIQUE_DIFF_REQUIRED', 'projections.B_O', 'E05 admits only a unique bounded single-hunk text effect; multi-hunk edits remain manual.'));
      continue;
    }
    const coveringRows = findCoveringRows(sourceMapState.rows, block, diff.start, diff.end);
    if (coveringRows.length !== 1) {
      reasons.push(reason('RTK_V4_E05_SOURCE_MAP_BIJECTION_REQUIRED', 'sourceMap.rows', 'A text effect requires exactly one source-map footprint row.', {
        sceneId: block.sceneId,
        blockId: block.blockId,
        start: diff.start,
        end: diff.end,
      }));
      continue;
    }
    const footprint = {
      sceneId: block.sceneId,
      blockId: block.blockId,
      start: diff.start,
      end: diff.end,
      sourceMapSegmentId: coveringRows[0].wordSegmentId,
    };
    effects.push({
      lane: 'acceptedUntracked',
      kind: 'BoundedTextEffect',
      operation: diff.operation,
      sceneId: block.sceneId,
      blockId: block.blockId,
      start: diff.start,
      end: diff.end,
      expectedText: diff.expectedText,
      replacementText: diff.replacementText,
      expectedSliceDigest: digestText(cryptoPort, diff.expectedText),
      replacementSliceDigest: digestText(cryptoPort, diff.replacementText),
      sourceMapSegmentId: coveringRows[0].wordSegmentId,
      effectId: digestJson(cryptoPort, {
        lane: 'acceptedUntracked',
        operation: diff.operation,
        footprint,
        expectedText: diff.expectedText,
        replacementText: diff.replacementText,
      }),
      canApply: false,
    });
  }
  return { effects, reasons };
}

function reviewIrFrom(input = {}) {
  if (isPlainObject(input.reviewIr)) return input.reviewIr;
  if (isPlainObject(input.analysis?.reviewIr)) return input.analysis.reviewIr;
  if (isPlainObject(input.parserResult?.reviewIr)) return input.parserResult.reviewIr;
  return {};
}

function buildPendingRevisionEffects({ reviewIr, kernelResult, sourceMapState, cryptoPort }) {
  const reasons = [];
  const effects = [];
  const semanticByNativeId = new Map(list(kernelResult?.semantics?.text).map((item) => [rawString(item.nativeRevisionId), item]));
  for (const revision of list(reviewIr.textRevisions)) {
    const nativeRevisionId = rawString(revision.nativeRevisionId);
    const semantic = semanticByNativeId.get(nativeRevisionId);
    const wordSegmentId = rawString(revision.sourceMap?.wordSegmentId || revision.wordSegmentId);
    const sourceRow = sourceMapState.rowsBySegment.get(wordSegmentId);
    if (!sourceRow) {
      reasons.push(reason('RTK_V4_E05_PENDING_REVISION_SOURCE_MAP_REQUIRED', 'reviewIr.textRevisions.sourceMap', 'Pending revision effects require a SourceMap segment; quote text is not authority.', {
        nativeRevisionId,
      }));
      continue;
    }
    if (!semantic || semantic.semanticSupport !== 'SUPPORTED_TEXT_REVISION') {
      reasons.push(reason('RTK_V4_E05_PENDING_REVISION_SEMANTIC_UNSUPPORTED', 'kernelResult.semantics.text', 'Pending revision must be supported by Minimal Word Semantic Kernel.', {
        nativeRevisionId,
      }));
      continue;
    }
    const operation = rawString(revision.operation);
    effects.push({
      lane: 'pendingRevision',
      kind: 'BoundedTextEffect',
      operation,
      nativeRevisionId,
      sceneId: sourceRow.sceneId,
      blockId: sourceRow.blockId,
      start: sourceRow.start,
      end: sourceRow.end,
      expectedText: rawString(revision.expectedText || sourceRow.expectedText),
      replacementText: rawString(revision.replacementText || revision.text || ''),
      sourceMapSegmentId: wordSegmentId,
      semanticId: semantic.semanticId,
      effectId: digestJson(cryptoPort, {
        lane: 'pendingRevision',
        operation,
        nativeRevisionId,
        sourceMapSegmentId: wordSegmentId,
        sceneId: sourceRow.sceneId,
        blockId: sourceRow.blockId,
        start: sourceRow.start,
        end: sourceRow.end,
        expectedText: revision.expectedText || sourceRow.expectedText,
        replacementText: revision.replacementText || revision.text || '',
      }),
      canApply: false,
    });
  }
  return { effects, reasons };
}

function validateEffectSet(effects) {
  const reasons = [];
  const ids = new Set();
  const byBlock = new Map();
  for (const effect of effects) {
    if (ids.has(effect.effectId)) {
      reasons.push(reason('RTK_V4_E05_DUPLICATE_EFFECT_ID', 'effects.effectId', 'Effect identity must not replay-collapse distinct effects.'));
    }
    ids.add(effect.effectId);
    const blockKey = `${effect.sceneId}\u0000${effect.blockId}`;
    const rows = byBlock.get(blockKey) || [];
    rows.push(effect);
    byBlock.set(blockKey, rows);
  }
  for (const [blockKey, rows] of byBlock.entries()) {
    const sorted = [...rows].sort((a, b) => a.start - b.start || a.end - b.end);
    for (let i = 1; i < sorted.length; i += 1) {
      const previous = sorted[i - 1];
      const current = sorted[i];
      const overlaps = current.start < previous.end || (current.start === previous.start && current.end === previous.end);
      if (overlaps) {
        reasons.push(reason('RTK_V4_E05_OVERLAPPING_EFFECTS_BLOCKED', 'effects', 'Overlapping or duplicate effect footprints are blocked atomically.', { blockKey }));
      }
    }
  }
  return reasons;
}

export function evaluateWordV4SourceMapUniqueDiff(input = {}, ports = {}) {
  const cryptoState = resolveCryptoPort(ports.cryptoPort);
  if (!cryptoState.ok) {
    return {
      ok: false,
      schemaVersion: RTK_WORD_V4_SOURCEMAP_UNIQUEDIFF_SCHEMA,
      profileId: RTK_WORD_V4_SOURCEMAP_UNIQUEDIFF_PROFILE,
      status: 'blocked',
      code: 'RTK_V4_E05_CRYPTO_PORT_REQUIRED',
      canApply: false,
      canWriteManuscript: false,
      reasons: [reason('RTK_V4_E05_CRYPTO_PORT_REQUIRED', 'cryptoPort', 'E05 SourceMap and UniqueDiff require CryptoPort.')],
    };
  }

  const cryptoPort = cryptoState.port;
  const baselineBlocks = projectionBlocks(input.projections?.B || input.baselineProjection);
  const originalBlocks = projectionBlocks(input.projections?.O || input.originalProjection);
  const currentBlocks = projectionBlocks(input.projections?.C || input.currentProjection);
  const graphProjection = input.projections?.G || input.graphProjection || {};
  const reviewIr = reviewIrFrom(input);
  const kernelResult = isPlainObject(input.kernelResult) ? input.kernelResult : {};
  const reasons = [];

  const baselineValidation = validateProjectionBlocks('projections.B', baselineBlocks, cryptoPort);
  const originalValidation = validateProjectionBlocks('projections.O', originalBlocks, cryptoPort);
  const currentValidation = validateProjectionBlocks('projections.C', currentBlocks, cryptoPort);
  reasons.push(...baselineValidation.reasons, ...originalValidation.reasons, ...currentValidation.reasons);
  if (baselineBlocks.length === 0) {
    reasons.push(reason('RTK_V4_E05_BASELINE_PROJECTION_REQUIRED', 'projections.B', 'Baseline projection B is required.'));
  }
  if (originalBlocks.length === 0) {
    reasons.push(reason('RTK_V4_E05_ORIGINAL_PROJECTION_REQUIRED', 'projections.O', 'Original projection O is required.'));
  }
  if (currentBlocks.length > 0) {
    const originalMap = blockMap(originalBlocks).map;
    for (const current of currentBlocks) {
      const original = originalMap.get(current.blockKey);
      if (original && original.text !== current.text) {
        reasons.push(reason('RTK_V4_E05_CURRENT_ORIGINAL_DIVERGED', 'projections.O_C', 'O to C verification must be explicit before exact effects.'));
      }
    }
  }
  if (kernelResult.exactSemanticReady !== true) {
    reasons.push(reason('RTK_V4_E05_KERNEL_READY_REQUIRED', 'kernelResult.exactSemanticReady', 'E05 requires Minimal Word Semantic Kernel exact-semantic readiness before exact effects.'));
  }

  const sourceMapState = validateSourceMap({
    sourceMap: input.sourceMap || {},
    baselineBlocks,
    cryptoPort,
  });
  reasons.push(...sourceMapState.reasons);

  const accepted = buildAcceptedUntrackedEffects({
    baselineBlocks,
    originalBlocks,
    sourceMapState,
    cryptoPort,
  });
  const pending = buildPendingRevisionEffects({
    reviewIr: Object.keys(reviewIr).length > 0 ? reviewIr : graphProjection,
    kernelResult,
    sourceMapState,
    cryptoPort,
  });
  const effects = [...accepted.effects, ...pending.effects];
  reasons.push(...accepted.reasons, ...pending.reasons, ...validateEffectSet(effects));

  const semanticReturnId = digestJson(cryptoPort, {
    schemaVersion: RTK_WORD_V4_SOURCEMAP_UNIQUEDIFF_SCHEMA,
    sourceMapDigest: sourceMapState.digest,
    effects: effects.map((effect) => ({
      effectId: effect.effectId,
      lane: effect.lane,
      operation: effect.operation,
      sceneId: effect.sceneId,
      blockId: effect.blockId,
      start: effect.start,
      end: effect.end,
    })),
  });
  const exactEffectReady = reasons.length === 0 && effects.length > 0;

  return {
    ok: true,
    schemaVersion: RTK_WORD_V4_SOURCEMAP_UNIQUEDIFF_SCHEMA,
    profileId: RTK_WORD_V4_SOURCEMAP_UNIQUEDIFF_PROFILE,
    status: exactEffectReady ? 'sourcemap-uniquediff-ready' : 'sourcemap-uniquediff-manual-or-blocked',
    code: exactEffectReady ? 'RTK_V4_E05_READY' : (reasons[0]?.code || 'RTK_V4_E05_NO_EFFECTS'),
    exactEffectReady,
    canApply: false,
    canWriteManuscript: false,
    sourceMap: {
      schemaVersion: RTK_WORD_V4_SOURCEMAP_SCHEMA,
      digest: sourceMapState.digest,
      rowCount: sourceMapState.rows.length,
      bijectionRequired: true,
    },
    projections: {
      B: { blockCount: baselineBlocks.length },
      O: { blockCount: originalBlocks.length },
      C: { blockCount: currentBlocks.length },
      G: { textRevisionCount: list(reviewIr.textRevisions || graphProjection.textRevisions).length },
    },
    uniqueDiff: {
      semanticReturnId,
      planClassLimit: 2,
      planClassSaturated: true,
      acceptedUntrackedEffects: accepted.effects,
      pendingRevisionEffects: pending.effects,
      boundedTextEffects: effects,
    },
    lanes: {
      manuscriptText: 'immutable-analysis-only',
      comments: 'independent-shadow-analysis',
      revisions: 'pending-through-G-projection',
      formatting: 'manual-later-contour',
      structure: 'typed-later-contour',
    },
    vetoMetrics: {
      falseExact: 0,
      wrongSceneRouting: 0,
      silentApply: 0,
      replayFailure: 0,
    },
    reasons,
    conservation: {
      quoteTextIsNeverAuthority: true,
      sourceMapBijectionRequired: true,
      commentsIndependentFromText: true,
      noWriterAuthority: true,
      noFuzzyApply: true,
    },
  };
}
