const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const BRIDGE_PATH = 'src/io/revisionBridge/index.mjs';
const COMMENTS_PATH = 'src/derived/commentsHistory/deriveComments.mjs';
const RUNTIME_PATH = 'src/core/runtime.mjs';
const C00_RECEIPT_PATH = 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E10_C00_STAGE_10_COMMENTS_HISTORY_COLLAB_CONTOUR_COMPILATION_RECEIPT.json';
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const W15_NS = 'http://schemas.microsoft.com/office/word/2012/wordml';
const W16CID_NS = 'http://schemas.microsoft.com/office/word/2016/wordml/cid';

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
  byteLength(value) {
    return Buffer.byteLength(String(value || ''), 'utf8');
  },
};

async function loadModule(relativePath) {
  return import(pathToFileURL(path.join(process.cwd(), relativePath)).href);
}

function documentXml(body) {
  return `<w:document xmlns:w="${W_NS}"><w:body>${body}</w:body></w:document>`;
}

function parts(document, comments = '') {
  return {
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': document,
    ...(comments ? { 'word/comments.xml': comments } : {}),
  };
}

function validInlineRange(overrides = {}) {
  return {
    schemaVersion: 'revision-bridge.inline-range.v1',
    kind: 'span',
    blockId: 'block-1',
    lineageId: 'lineage-1',
    from: 0,
    to: 6,
    quote: 'Anchor',
    prefix: '',
    suffix: ' body',
    confidence: 'exact',
    riskClass: 'low',
    automationPolicy: 'manualOnly',
    deletedTarget: false,
    reasonCodes: [],
    ...overrides,
  };
}

function placementHint(key, overrides = {}) {
  return {
    schemaVersion: 'revision-bridge.comment-anchor-placement.v1',
    placementId: `placement-${key}`,
    durableId: key,
    threadId: key,
    targetScope: { type: 'scene', id: 'scene-1' },
    inlineRange: validInlineRange(),
    resolvedState: 'open',
    acceptedState: 'pending',
    diagnosticsOnly: false,
    ...overrides,
  };
}

function packetInput(reviewIr, overrides = {}) {
  return {
    projectId: 'project-e10-c01',
    sceneId: 'scene-1',
    revisionId: 'revision-1',
    reviewIr,
    context: {
      blockMap: {
        'block-1': {
          lineageId: 'lineage-1',
          text: 'Anchor body text.',
        },
      },
    },
    ...overrides,
  };
}

test('E10 C01: RTK modern comment graph becomes stable anchor packet and decision rows', async () => {
  const bridge = await loadModule(BRIDGE_PATH);
  const parsed = bridge.parseReviewTransportPackageV2({
    expectedCommentThreads: [{ commentId: '7', durableId: 'durable-root', doneResolvedReopenedState: 'resolved' }],
    parts: {
      ...parts(
        documentXml('<w:p><w:commentRangeStart w:id="7"/><w:r><w:t>Anchor</w:t></w:r><w:commentRangeEnd w:id="7"/><w:r><w:commentReference w:id="7"/></w:r></w:p>'),
        `<w:comments xmlns:w="${W_NS}">
          <w:comment w:id="7" w:paraId="root" w:author="Author A" w:date="2026-07-30T10:00:00.000Z"><w:p><w:r><w:t>Root body survives.</w:t></w:r></w:p></w:comment>
          <w:comment w:id="8" w:paraId="reply1" w:parentId="7" w:author="Author B"><w:p><w:r><w:t>Reply survives.</w:t></w:r></w:p></w:comment>
        </w:comments>`,
      ),
      'word/commentsExtended.xml': `<w15:commentsEx xmlns:w15="${W15_NS}"><w15:commentEx w15:paraId="root" w15:done="0"/></w15:commentsEx>`,
      'word/commentsIds.xml': `<w16cid:commentsIds xmlns:w16cid="${W16CID_NS}"><w16cid:commentId w16cid:paraId="root" w16cid:durableId="durable-root"/></w16cid:commentsIds>`,
      'word/commentsExtensible.xml': '<w16cex:commentsExtensible xmlns:w16cex="http://schemas.microsoft.com/office/word/2018/wordml/cex"><w16cex:commentExtensible w16cex:paraId="root" w16cex:durableId="durable-root" w16cex:reopened="1"/></w16cex:commentsExtensible>',
    },
  }, { cryptoPort });

  assert.equal(parsed.ok, true);
  assert.equal(parsed.reviewIr.commentThreads[0].durableId, 'durable-root');
  assert.equal(parsed.reviewIr.commentThreads[0].doneResolvedReopenedState, 'reopened');

  const packet = bridge.buildStableCommentAnchorPacketFromReviewIr(packetInput(parsed.reviewIr, {
    placementHints: {
      'durable-root': placementHint('durable-root'),
    },
  }));

  assert.equal(packet.schemaVersion, 'revision-bridge.stable-comment-anchor-packet.v1');
  assert.equal(packet.status, 'ready');
  assert.equal(packet.source.parserAuthority, 'rtk-review-ir-comment-graph-only');
  assert.equal(packet.sourceThreadRefs[0].durableId, 'durable-root');
  assert.equal(packet.sourceThreadRefs[0].doneResolvedReopenedState, 'reopened');
  assert.equal(packet.summary.totalAnchorRecords, 2);
  assert.equal(packet.summary.exactAnchors, 2);
  assert.equal(packet.anchorRecords[0].placementStatus, 'exact');
  assert.equal(packet.anchorRecords[0].durableId, 'durable-root');
  assert.equal(packet.anchorRecords[0].canAutoApply, false);
  assert.equal(packet.anchorRecords[0].canWriteManuscript, false);
  assert.equal(packet.decisionRows[0].mutationAuthority, 'none-preview-only');
  assert.equal(packet.decisionRows[0].canAutoApply, false);
  assert.match(packet.packetHash, /^sha256:/u);
});

test('E10 C01: durable identity keeps decision row stable when Word comment id drifts', async () => {
  const bridge = await loadModule(BRIDGE_PATH);
  const reviewIrA = {
    schemaVersion: 'yalken.rtk.review-ir.v2',
    commentThreads: [{
      threadId: 'rtk-comment-7',
      commentId: '7',
      durableId: 'durable-same',
      doneResolvedReopenedState: 'active',
      body: 'Same durable body.',
      status: 'ANCHORED',
      quotedAnchorText: 'Anchor',
      placement: { selectorStack: { exactQuote: 'Anchor' } },
      replies: [],
      reasonCodes: ['RTK_COMMENT_ANCHORED'],
    }],
  };
  const reviewIrB = {
    ...reviewIrA,
    commentThreads: [{
      ...reviewIrA.commentThreads[0],
      threadId: 'rtk-comment-42',
      commentId: '42',
    }],
  };

  const packetA = bridge.buildStableCommentAnchorPacketFromReviewIr(packetInput(reviewIrA));
  const packetB = bridge.buildStableCommentAnchorPacketFromReviewIr(packetInput(reviewIrB));

  assert.equal(packetA.status, 'diagnostics');
  assert.equal(packetB.status, 'diagnostics');
  assert.equal(packetA.sourceThreadRefs[0].stableThreadIdentity, packetB.sourceThreadRefs[0].stableThreadIdentity);
  assert.equal(packetA.decisionRows[0].decisionId, packetB.decisionRows[0].decisionId);
  assert.equal(packetA.diagnostics.some((row) => row.code === 'REVISION_BRIDGE_STABLE_COMMENT_ANCHOR_PACKET_NO_IMPLICIT_PLACEMENT'), true);
  assert.equal(packetA.canAutoApply, false);
  assert.equal(packetB.canWriteManuscript, false);
});

test('E10 C01: comments derived view projects packet rows without creating comment truth', async () => {
  const bridge = await loadModule(BRIDGE_PATH);
  const comments = await loadModule(COMMENTS_PATH);
  const runtime = await loadModule(RUNTIME_PATH);
  const reviewIr = {
    schemaVersion: 'yalken.rtk.review-ir.v2',
    commentThreads: [{
      threadId: 'rtk-comment-1',
      commentId: '1',
      durableId: 'durable-view',
      doneResolvedReopenedState: 'resolved',
      body: 'Visible in derived view.',
      status: 'RESOLVED',
      quotedAnchorText: 'Anchor',
      replies: [],
      reasonCodes: ['RTK_COMMENT_RESOLVED'],
    }],
  };
  const packet = bridge.buildStableCommentAnchorPacketFromReviewIr(packetInput(reviewIr, {
    placementHints: {
      'durable-view': placementHint('durable-view'),
    },
  }));
  const result = comments.deriveComments({
    coreState: runtime.createInitialCoreState(),
    params: {
      projectId: 'project-e10-c01',
      filter: 'all',
      stableCommentAnchorPacket: packet,
    },
    capabilitySnapshot: { platformId: 'node', capabilities: { commentsView: true } },
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.items.length, 1);
  assert.equal(result.value.items[0].itemType, 'stableCommentAnchor');
  assert.equal(result.value.items[0].durableId, 'durable-view');
  assert.equal(result.value.items[0].placementStatus, 'exact');
  assert.equal(result.value.items[0].decisionState, 'resolved');
  assert.equal(result.value.items[0].canAutoApply, false);
  assert.equal(result.value.items[0].canWriteManuscript, false);
  assert.equal(result.value.meta.stableCommentAnchorPacketHash, packet.packetHash);
});

test('E10 C01: C00 handoff and source boundaries stay local preview-only', () => {
  const c00 = JSON.parse(fs.readFileSync(path.join(process.cwd(), C00_RECEIPT_PATH), 'utf8'));
  assert.equal(c00.nextContour, 'E10_C01_STABLE_COMMENT_ANCHORS_AND_DECISION_SURVIVAL');

  const bridgeSource = fs.readFileSync(path.join(process.cwd(), BRIDGE_PATH), 'utf8');
  const start = bridgeSource.indexOf('// E10_C01_STABLE_COMMENT_ANCHOR_PACKET_START');
  const end = bridgeSource.indexOf('// E10_C01_STABLE_COMMENT_ANCHOR_PACKET_END');
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const section = bridgeSource.slice(start, end);
  for (const pattern of [
    /fetch\s*\(/u,
    /from\s+['"]node:fs['"]/u,
    /from\s+['"]node:http['"]/u,
    /from\s+['"]node:https['"]/u,
    /from\s+['"]electron['"]/u,
    /\bipcMain\b/u,
    /\bipcRenderer\b/u,
    /\bwriteFile(?:Sync)?\s*\(/u,
    /\bappendFile(?:Sync)?\s*\(/u,
    /canAutoApply:\s*true/u,
    /canWriteManuscript:\s*true/u,
  ]) {
    assert.doesNotMatch(section, pattern);
  }
});
