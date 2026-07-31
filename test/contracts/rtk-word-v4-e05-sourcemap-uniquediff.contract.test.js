const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CORE_PATH = 'src/io/revisionBridge/reviewTransportSourceMapUniqueDiffV4.mjs';
const INDEX_PATH = 'src/io/revisionBridge/index.mjs';
const RECEIPT_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E05_SOURCEMAP_UNIQUEDIFF_RECEIPT.json';

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

async function loadCore() {
  return import(pathToFileURL(path.join(REPO_ROOT, CORE_PATH)).href);
}

function block(sceneId, blockId, text) {
  return {
    sceneId,
    blockId,
    text,
    rawSha256: cryptoPort.sha256Text(text),
  };
}

async function sourceMapFor(rowsInput) {
  const core = await loadCore();
  const rows = rowsInput.map((item) => core.buildWordV4SourceMapRow(item, { cryptoPort }).row);
  const digest = core.computeWordV4SourceMapDigest({ rows }, { cryptoPort }).digest;
  return {
    schemaVersion: core.RTK_WORD_V4_SOURCEMAP_SCHEMA,
    digest,
    rows,
  };
}

function kernelReady() {
  return {
    exactSemanticReady: true,
    semantics: {
      text: [],
    },
  };
}

test('V4 E05 distinguishes duplicate quote text by SourceMap block identity and effect footprint', async () => {
  const core = await loadCore();
  const duplicateText = 'repeat target repeat';
  const changedText = 'repeat edited repeat';
  const baselineBlocks = [
    block('scene-a', 'block-1', duplicateText),
    block('scene-a', 'block-2', duplicateText),
  ];
  const sourceMap = await sourceMapFor([
    { wordSegmentId: 'seg-block-1-target', sceneId: 'scene-a', blockId: 'block-1', segmentId: 'target', blockText: duplicateText, start: 7, end: 13 },
    { wordSegmentId: 'seg-block-2-target', sceneId: 'scene-a', blockId: 'block-2', segmentId: 'target', blockText: duplicateText, start: 7, end: 13 },
  ]);
  const blockTwoResult = core.evaluateWordV4SourceMapUniqueDiff({
    projections: {
      B: { blocks: baselineBlocks },
      O: { blocks: [baselineBlocks[0], block('scene-a', 'block-2', changedText)] },
      C: { blocks: [baselineBlocks[0], block('scene-a', 'block-2', changedText)] },
      G: { textRevisions: [] },
    },
    sourceMap,
    kernelResult: kernelReady(),
  }, { cryptoPort });
  const blockOneResult = core.evaluateWordV4SourceMapUniqueDiff({
    projections: {
      B: { blocks: baselineBlocks },
      O: { blocks: [block('scene-a', 'block-1', changedText), baselineBlocks[1]] },
      C: { blocks: [block('scene-a', 'block-1', changedText), baselineBlocks[1]] },
      G: { textRevisions: [] },
    },
    sourceMap,
    kernelResult: kernelReady(),
  }, { cryptoPort });

  assert.equal(blockTwoResult.exactEffectReady, true);
  assert.equal(blockTwoResult.uniqueDiff.acceptedUntrackedEffects.length, 1);
  assert.equal(blockTwoResult.uniqueDiff.acceptedUntrackedEffects[0].blockId, 'block-2');
  assert.equal(blockTwoResult.conservation.quoteTextIsNeverAuthority, true);
  assert.equal(blockOneResult.exactEffectReady, true);
  assert.notEqual(
    blockTwoResult.uniqueDiff.acceptedUntrackedEffects[0].effectId,
    blockOneResult.uniqueDiff.acceptedUntrackedEffects[0].effectId,
  );
});

test('V4 E05 blocks tampered stale duplicate or overlapping SourceMap rows before exact effects', async () => {
  const core = await loadCore();
  const baseline = block('scene-a', 'block-1', 'alpha beta gamma');
  const row = core.buildWordV4SourceMapRow({
    wordSegmentId: 'seg-beta',
    sceneId: 'scene-a',
    blockId: 'block-1',
    segmentId: 'beta',
    blockText: baseline.text,
    start: 6,
    end: 10,
  }, { cryptoPort }).row;
  const stale = {
    ...row,
    blockTextDigest: cryptoPort.sha256Text('stale'),
  };
  const result = core.evaluateWordV4SourceMapUniqueDiff({
    projections: {
      B: { blocks: [baseline] },
      O: { blocks: [block('scene-a', 'block-1', 'alpha BETA gamma')] },
      C: { blocks: [block('scene-a', 'block-1', 'alpha BETA gamma')] },
      G: { textRevisions: [] },
    },
    sourceMap: {
      schemaVersion: core.RTK_WORD_V4_SOURCEMAP_SCHEMA,
      digest: 'sha256:tampered',
      rows: [row, { ...stale, wordSegmentId: 'seg-overlap', start: 8, end: 12 }],
    },
    kernelResult: kernelReady(),
  }, { cryptoPort });

  assert.equal(result.exactEffectReady, false);
  assert.equal(result.reasons.some((item) => item.code === 'RTK_V4_E05_SOURCEMAP_DIGEST_MISMATCH'), true);
  assert.equal(result.reasons.some((item) => item.code === 'RTK_V4_E05_SOURCEMAP_BLOCK_DIGEST_STALE'), true);
  assert.equal(result.reasons.some((item) => item.code === 'RTK_V4_E05_SOURCEMAP_OVERLAP'), true);
});

test('V4 E05 refuses quote-only fallback when SourceMap footprint is absent', async () => {
  const core = await loadCore();
  const baseline = block('scene-a', 'block-1', 'only unique quote here');
  const result = core.evaluateWordV4SourceMapUniqueDiff({
    projections: {
      B: { blocks: [baseline] },
      O: { blocks: [block('scene-a', 'block-1', 'only changed quote here')] },
      C: { blocks: [block('scene-a', 'block-1', 'only changed quote here')] },
      G: { textRevisions: [] },
    },
    sourceMap: {
      schemaVersion: core.RTK_WORD_V4_SOURCEMAP_SCHEMA,
      rows: [],
    },
    kernelResult: kernelReady(),
  }, { cryptoPort });

  assert.equal(result.exactEffectReady, false);
  assert.equal(result.uniqueDiff.acceptedUntrackedEffects.length, 0);
  assert.equal(result.reasons.some((item) => item.code === 'RTK_V4_E05_SOURCE_MAP_BIJECTION_REQUIRED'), true);
  assert.equal(result.conservation.noFuzzyApply, true);
});

test('V4 E05 keeps multi-hunk and O-to-C divergence manual rather than flattening to blind replace', async () => {
  const core = await loadCore();
  const baseline = block('scene-a', 'block-1', 'aa one bb two cc');
  const sourceMap = await sourceMapFor([
    { wordSegmentId: 'seg-whole', sceneId: 'scene-a', blockId: 'block-1', segmentId: 'whole', blockText: baseline.text, start: 0, end: baseline.text.length },
  ]);
  const result = core.evaluateWordV4SourceMapUniqueDiff({
    projections: {
      B: { blocks: [baseline] },
      O: { blocks: [block('scene-a', 'block-1', 'aa uno bb dos cc')] },
      C: { blocks: [block('scene-a', 'block-1', 'aa uno bb drift cc')] },
      G: { textRevisions: [] },
    },
    sourceMap,
    kernelResult: kernelReady(),
  }, { cryptoPort });

  assert.equal(result.exactEffectReady, false);
  assert.equal(result.reasons.some((item) => item.code === 'RTK_V4_E05_MULTI_HUNK_UNIQUE_DIFF_REQUIRED'), true);
  assert.equal(result.reasons.some((item) => item.code === 'RTK_V4_E05_CURRENT_ORIGINAL_DIVERGED'), true);
  assert.equal(result.uniqueDiff.acceptedUntrackedEffects.length, 0);
});

test('V4 E05 derives pending G revision effects only through SourceMap and kernel semantics', async () => {
  const core = await loadCore();
  const baseline = block('scene-a', 'block-1', 'alpha beta gamma');
  const sourceMap = await sourceMapFor([
    { wordSegmentId: 'seg-beta', sceneId: 'scene-a', blockId: 'block-1', segmentId: 'beta', blockText: baseline.text, start: 6, end: 10 },
  ]);
  const reviewIr = {
    textRevisions: [
      {
        kind: 'TextRevision',
        operation: 'delete',
        nativeRevisionId: 'del-beta',
        sourceMap: { wordSegmentId: 'seg-beta' },
        expectedText: 'beta',
      },
    ],
  };
  const result = core.evaluateWordV4SourceMapUniqueDiff({
    projections: {
      B: { blocks: [baseline] },
      O: { blocks: [baseline] },
      C: { blocks: [baseline] },
      G: reviewIr,
    },
    reviewIr,
    sourceMap,
    kernelResult: {
      exactSemanticReady: true,
      semantics: {
        text: [
          {
            nativeRevisionId: 'del-beta',
            semanticId: 'semantic-del-beta',
            semanticSupport: 'SUPPORTED_TEXT_REVISION',
          },
        ],
      },
    },
  }, { cryptoPort });

  assert.equal(result.exactEffectReady, true);
  assert.equal(result.uniqueDiff.pendingRevisionEffects.length, 1);
  assert.equal(result.uniqueDiff.pendingRevisionEffects[0].sourceMapSegmentId, 'seg-beta');
  assert.equal(result.lanes.comments, 'independent-shadow-analysis');
});

test('V4 E05 public barrel receipt and source boundaries remain immutable analysis only', async () => {
  const bridge = await import(pathToFileURL(path.join(REPO_ROOT, INDEX_PATH)).href);
  const receipt = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, RECEIPT_PATH), 'utf8'));
  const source = fs.readFileSync(path.join(REPO_ROOT, CORE_PATH), 'utf8');

  assert.equal(typeof bridge.evaluateWordV4SourceMapUniqueDiff, 'function');
  assert.equal(typeof bridge.computeWordV4SourceMapDigest, 'function');
  assert.equal(bridge.RTK_WORD_V4_SOURCEMAP_UNIQUEDIFF_PROFILE, 'word-v4-sourcemap-uniquediff-e05');
  assert.equal(receipt.status, 'LOCAL_VERIFIED_READY_FOR_DELIVERY_CHAIN');
  assert.equal(receipt.runtimeClaims.automaticApplyExpanded, false);
  assert.equal(receipt.vetoMetrics.falseExact, 0);
  for (const forbidden of ['node:', 'Buffer', 'child_process', 'fetch(', 'XMLHttpRequest', 'WebSocket']) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
