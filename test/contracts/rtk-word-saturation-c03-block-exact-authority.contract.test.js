const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const MODULE_PATH = 'src/io/revisionBridge/index.mjs';
const AUTHORITY_PATH = 'src/io/revisionBridge/reviewTransportBlockExactAuthorityV2.mjs';
const RECEIPT_PATH = 'docs/OPS/RTK/WORD_LATEST_SEMANTIC_ROUNDTRIP_V2_C03_BLOCK_EXACT_AUTHORITY_RECEIPT.json';

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

async function loadBridge() {
  return import(pathToFileURL(path.join(process.cwd(), MODULE_PATH)).href);
}

function sha256Text(value) {
  return `sha256:${cryptoPort.sha256Text(value)}`;
}

function c02AuthorityCarrier(overrides = {}) {
  return {
    schemaVersion: 'yalken.rtk.review-transport-authority-carrier.v2',
    status: 'verified-baseline-bound',
    selectedCarrier: {
      carrier: 'customDocumentProperty',
      propertyName: 'YRTK_C01_AUTH',
      verified: true,
      validSignedLocator: true,
      payload: {
        sceneId: 'scene-c03',
        sceneRevision: 'scene-revision-c03-0001',
        rawSha256: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        blockId: 'block-c03-target',
        roundId: 'round-c03',
        exportId: 'export-c03',
        ...overrides.payload,
      },
      baselineBinding: {
        allExpectedPresent: true,
        allExpectedMatched: true,
        sceneRevisionMatches: true,
        rawSha256Matches: true,
      },
    },
    carriers: [],
    exactAuthority: c02ExactAuthority(overrides.exactAuthority),
    reasons: [],
  };
}

function c02ExactAuthority(overrides = {}) {
  return {
    validSignedLocator: true,
    sceneRevisionUnchanged: true,
    rawSha256Unchanged: true,
    uniqueTarget: false,
    nonOverlapping: false,
    allRelevantXmlSemanticsAccounted: false,
    ambiguousDuplicate: false,
    crossScene: false,
    structuralTopologyChanged: false,
    ...overrides,
  };
}

function replacementReviewIr({ deleted = 'beta', inserted = 'delta', groupId = 'group-c03', extra = {} } = {}) {
  return {
    schemaVersion: 'yalken.rtk.review-ir.v2',
    sourceMode: 'TRACKED',
    textRevisions: [
      {
        kind: 'TextRevision',
        operation: 'delete',
        nativeRevisionId: 'del-c03',
        text: deleted,
        textDigest: sha256Text(`delete:${deleted}`),
        replacementGroupId: groupId,
      },
      {
        kind: 'TextRevision',
        operation: 'insert',
        nativeRevisionId: 'ins-c03',
        text: inserted,
        textDigest: sha256Text(`insert:${inserted}`),
        replacementGroupId: groupId,
      },
    ],
    moveRevisions: [],
    propertyRevisions: [],
    structureChanges: [],
    formattingDeltas: [
      {
        kind: 'FormattingDelta',
        formatKind: 'rPr',
        values: { bold: true },
      },
    ],
    commentThreads: [
      {
        kind: 'CommentThread',
        threadId: 'thread-c03',
        commentId: '7',
        status: 'ANCHORED',
        body: 'Comment lane survives independently.',
      },
    ],
    opaqueUnsupported: [],
    ...extra,
  };
}

function baseline(overrides = {}) {
  return {
    sceneId: 'scene-c03',
    sceneBlocks: [
      {
        sceneId: 'scene-c03',
        blockId: 'block-c03-target',
        text: 'Alpha beta gamma.',
      },
      {
        sceneId: 'scene-c03',
        blockId: 'block-c03-other',
        text: 'Another beta outside the signed block.',
      },
    ],
    ...overrides,
  };
}

test('C03 proves block-local exact authority from C02 carrier without global duplicate text authority', async () => {
  const bridge = await loadBridge();
  const authority = bridge.evaluateReviewTransportBlockExactAuthorityV2({
    reviewIr: replacementReviewIr(),
    authorityCarrier: c02AuthorityCarrier(),
    exactAuthority: c02ExactAuthority(),
    localBaseline: baseline(),
  }, { cryptoPort });
  const classified = bridge.classifyReviewTransportIrV2({
    reviewIr: replacementReviewIr(),
    exactAuthority: authority.exactAuthority,
  }, { cryptoPort });

  assert.equal(authority.ok, true);
  assert.equal(authority.status, 'exact-authority-ready');
  assert.equal(authority.canApply, false);
  assert.equal(authority.canWriteManuscript, false);
  assert.equal(authority.exactAuthority.validSignedLocator, true);
  assert.equal(authority.exactAuthority.uniqueTarget, true);
  assert.equal(authority.exactAuthority.nonOverlapping, true);
  assert.equal(authority.exactAuthority.allRelevantXmlSemanticsAccounted, true);
  assert.equal(authority.falseExactGuards.globalTextSearchAuthority, false);
  assert.equal(authority.exactTextAnchors.length, 1);
  assert.equal(authority.exactTextAnchors[0].blockId, 'block-c03-target');
  assert.equal(classified.summary.exactAutomaticCandidates, 1);
  assert.equal(classified.classifications.text[0].disposition, 'EXACT_AUTOMATIC_CANDIDATE');
  assert.equal(classified.canApply, false);
  assert.equal(classified.classifications.comments[0].disposition, 'COMMENTS_ONLY');
  assert.equal(classified.classifications.formatting[0].disposition, 'MANUAL_REVIEW');
});

test('C03 blocks duplicate text inside the signed block and duplicate block identities', async () => {
  const bridge = await loadBridge();
  const duplicateText = bridge.evaluateReviewTransportBlockExactAuthorityV2({
    reviewIr: replacementReviewIr(),
    authorityCarrier: c02AuthorityCarrier(),
    exactAuthority: c02ExactAuthority(),
    localBaseline: baseline({
      sceneBlocks: [
        { sceneId: 'scene-c03', blockId: 'block-c03-target', text: 'Alpha beta beta gamma.' },
      ],
    }),
  }, { cryptoPort });
  const duplicateBlock = bridge.evaluateReviewTransportBlockExactAuthorityV2({
    reviewIr: replacementReviewIr(),
    authorityCarrier: c02AuthorityCarrier(),
    exactAuthority: c02ExactAuthority(),
    localBaseline: baseline({
      sceneBlocks: [
        { sceneId: 'scene-c03', blockId: 'block-c03-target', text: 'Alpha beta gamma.' },
        { sceneId: 'scene-c03', blockId: 'block-c03-target', text: 'Second beta target.' },
      ],
    }),
  }, { cryptoPort });

  assert.equal(duplicateText.status, 'manual-or-blocked');
  assert.equal(duplicateText.exactAuthority.uniqueTarget, false);
  assert.equal(duplicateText.exactAuthority.ambiguousDuplicate, true);
  assert.equal(duplicateText.reasons.some((item) => item.code === 'RTK_BLOCKED_AMBIGUOUS_TEXT'), true);
  assert.equal(duplicateBlock.exactAuthority.uniqueTarget, false);
  assert.equal(duplicateBlock.exactAuthority.ambiguousDuplicate, true);
});

test('C03 blocks overlapping ranges, standalone inserts, structure and cross-scene drift', async () => {
  const bridge = await loadBridge();
  const overlapIr = replacementReviewIr({
    extra: {
      textRevisions: [
        {
          kind: 'TextRevision',
          operation: 'delete',
          nativeRevisionId: 'del-beta',
          text: 'beta',
          textDigest: sha256Text('delete:beta'),
          replacementGroupId: '',
        },
        {
          kind: 'TextRevision',
          operation: 'delete',
          nativeRevisionId: 'del-beta-gamma',
          text: 'beta gamma',
          textDigest: sha256Text('delete:beta gamma'),
          replacementGroupId: '',
        },
      ],
    },
  });
  const insertIr = replacementReviewIr({
    extra: {
      textRevisions: [
        {
          kind: 'TextRevision',
          operation: 'insert',
          nativeRevisionId: 'ins-alone',
          text: 'new ',
          textDigest: sha256Text('insert:new'),
          replacementGroupId: '',
        },
      ],
    },
  });
  const structuralIr = replacementReviewIr({
    extra: {
      moveRevisions: [{ kind: 'MoveRevision', nativeRevisionId: 'move-c03' }],
      structureChanges: [{ kind: 'StructureChange', structureKind: 'moveRevision' }],
    },
  });

  const overlap = bridge.evaluateReviewTransportBlockExactAuthorityV2({
    reviewIr: overlapIr,
    authorityCarrier: c02AuthorityCarrier(),
    exactAuthority: c02ExactAuthority(),
    localBaseline: baseline(),
  }, { cryptoPort });
  const insert = bridge.evaluateReviewTransportBlockExactAuthorityV2({
    reviewIr: insertIr,
    authorityCarrier: c02AuthorityCarrier(),
    exactAuthority: c02ExactAuthority(),
    localBaseline: baseline(),
  }, { cryptoPort });
  const structural = bridge.evaluateReviewTransportBlockExactAuthorityV2({
    reviewIr: structuralIr,
    authorityCarrier: c02AuthorityCarrier(),
    exactAuthority: c02ExactAuthority(),
    localBaseline: baseline(),
  }, { cryptoPort });
  const crossScene = bridge.evaluateReviewTransportBlockExactAuthorityV2({
    reviewIr: replacementReviewIr(),
    authorityCarrier: c02AuthorityCarrier(),
    exactAuthority: c02ExactAuthority(),
    localBaseline: baseline({
      sceneBlocks: [{ sceneId: 'scene-other', blockId: 'block-c03-target', text: 'Alpha beta gamma.' }],
    }),
  }, { cryptoPort });

  assert.equal(overlap.exactAuthority.nonOverlapping, false);
  assert.equal(overlap.reasons.some((item) => item.code === 'RTK_BLOCKED_TOKEN_CONTRADICTION'), true);
  assert.equal(insert.exactAuthority.allRelevantXmlSemanticsAccounted, false);
  assert.equal(insert.falseExactGuards.standaloneInsertExactAuthority, false);
  assert.equal(structural.exactAuthority.structuralTopologyChanged, true);
  assert.equal(structural.exactAuthority.allRelevantXmlSemanticsAccounted, false);
  assert.equal(crossScene.exactAuthority.crossScene, true);
  assert.equal(crossScene.exactAuthority.uniqueTarget, false);
});

test('C03 stale C02 authority cannot be repaired by matching text', async () => {
  const bridge = await loadBridge();
  const stale = bridge.evaluateReviewTransportBlockExactAuthorityV2({
    reviewIr: replacementReviewIr(),
    authorityCarrier: c02AuthorityCarrier(),
    exactAuthority: c02ExactAuthority({
      sceneRevisionUnchanged: false,
      rawSha256Unchanged: false,
    }),
    localBaseline: baseline(),
  }, { cryptoPort });
  const classified = bridge.classifyReviewTransportIrV2({
    reviewIr: replacementReviewIr(),
    exactAuthority: stale.exactAuthority,
  }, { cryptoPort });

  assert.equal(stale.status, 'manual-or-blocked');
  assert.equal(stale.exactAuthority.uniqueTarget, false);
  assert.equal(stale.exactAuthority.nonOverlapping, false);
  assert.equal(stale.reasons.some((item) => item.code === 'RTK_BLOCKED_STALE_REVISION'), true);
  assert.equal(stale.reasons.some((item) => item.code === 'RTK_BLOCKED_STALE_BYTES'), true);
  assert.equal(classified.summary.exactAutomaticCandidates, 0);
});

test('C03 public export receipt and source boundaries preserve no-writer authority', async () => {
  const bridge = await loadBridge();
  const receipt = JSON.parse(fs.readFileSync(path.join(process.cwd(), RECEIPT_PATH), 'utf8'));
  const source = fs.readFileSync(path.join(process.cwd(), AUTHORITY_PATH), 'utf8');

  assert.equal(typeof bridge.evaluateReviewTransportBlockExactAuthorityV2, 'function');
  assert.equal(
    bridge.RTK_REVIEW_TRANSPORT_BLOCK_EXACT_AUTHORITY_V2_SCHEMA,
    'yalken.rtk.review-transport-block-exact-authority.v2',
  );
  assert.equal(receipt.status, 'C03_BLOCK_LOCAL_EXACT_AUTHORITY_READY_NOT_WRITER_AUTHORITY');
  assert.equal(receipt.nonClaims.automaticApplyExpanded, false);
  assert.equal(receipt.zeroFalseExactPolicy.falseExact, 0);
  for (const forbidden of ['node:', 'Buffer', 'child_process', 'fetch(', 'XMLHttpRequest', 'WebSocket', 'new RegExp', '.match(', '.matchAll(']) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
