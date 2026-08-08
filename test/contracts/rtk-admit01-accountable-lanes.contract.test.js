const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

// ADMIT-01, Pass 1 — RED-FIRST FALSIFIERS ONLY.
//
// This contract holds the ReviewTransportKernel evidence lanes accountable: an
// overflow on the text/structure/comments lane must NEVER become an empty
// success. The subtests below are intentionally written against the TARGET
// accountable shape (typed abort + laneCompleteness markers). They fail on the
// exact base SHA because the CURRENT implementation either masks overflow as
// `RTK_EXACT_APPLICABLE` (V1 F-14/F-15) or emits success-shaped per-comment
// reasons for dropped threads while leaving abort results without a
// laneCompleteness marker (V2 F-15 polish).
//
// Each subtest documents its CURRENT red reason so Pass 2 implementation can
// verify the failure flips green for the documented cause (and not a harness
// error). Control subtests (A4/B3) are green now and must remain green after
// Pass 2.

const IR_PATH = 'src/io/revisionBridge/reviewTransportIr.mjs';
const V2_PARSER_PATH = 'src/io/revisionBridge/reviewTransportPackageParserV2.mjs';
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

async function loadIr() {
  return import(pathToFileURL(path.join(process.cwd(), IR_PATH)).href);
}

async function loadV2Parser() {
  return import(pathToFileURL(path.join(process.cwd(), V2_PARSER_PATH)).href);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

// Self-contained bounded parser CryptoPort (mirrors createNodeCryptoPort from
// reviewTransportIr.mjs so the contract does not depend on V1 wiring for the
// V2 package-parser path which requires sha256Text/sha256Json/byteLength/crc32).
function makeCryptoPort() {
  function sha256Text(value) {
    return crypto.createHash('sha256').update(Buffer.from(String(value || ''), 'utf8')).digest('hex');
  }
  return {
    sha256Text,
    sha256Json(value) {
      return `sha256:${sha256Text(stableJson(value))}`;
    },
    byteLength(value) {
      return Buffer.byteLength(String(value || ''), 'utf8');
    },
    crc32(value) {
      let crc = 0xffffffff;
      const buffer = Buffer.from(String(value || ''), 'utf8');
      const table = makeCryptoPort.crc32Table || (makeCryptoPort.crc32Table = (() => {
        const t = new Uint32Array(256);
        for (let i = 0; i < 256; i += 1) {
          let c = i;
          for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
          t[i] = c >>> 0;
        }
        return t;
      })());
      for (const byte of buffer) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
      return (crc ^ 0xffffffff) >>> 0;
    },
  };
}

function reviewIrDigest(reviewIr) {
  return `sha256:${crypto.createHash('sha256').update(Buffer.from(stableJson(reviewIr), 'utf8')).digest('hex')}`;
}

// ---- V1 parts builders (in-memory parts consumed by buildW2ReviewIr) ----

function documentXml(body) {
  return `<w:document xmlns:w="${W_NS}"><w:body>${body}</w:body></w:document>`;
}

function commentsXml(count) {
  const items = Array.from({ length: count }, (_, index) => (
    `<w:comment w:id="${index}"><w:p><w:r><w:t>comment ${index}</w:t></w:r></w:p></w:comment>`
  )).join('');
  return `<w:comments xmlns:w="${W_NS}">${items}</w:comments>`;
}

// A1 fixture: 20 <w:ins> + trailing <w:tbl/>, exactly the F-14 reproduction.
function f14DocumentXml(insertionCount = 20) {
  const insertions = Array.from({ length: insertionCount }, (_, index) => (
    `<w:ins w:id="${index}"><w:r><w:t>txt${index}</w:t></w:r></w:ins>`
  )).join('');
  return documentXml(`<w:p>${insertions}</w:p><w:tbl/>`);
}

// ---- V2 package parts builder (in-memory OPC parts consumed by V2 parser) ----

function v2BaseParts(document) {
  return {
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': document,
  };
}

const COMMENT_SUCCESS_CODES = Object.freeze([
  'RTK_COMMENT_ANCHORED',
  'RTK_COMMENT_RESOLVED',
  'RTK_COMMENT_ORPHAN',
  'RTK_COMMENT_UNSUPPORTED',
]);

// =====================================================================
// Group A — V1 masking (F-14 / F-15)
// =====================================================================

test('ADMIT01-A1-v1-text-truncation-never-masked-success', async () => {
  const ir = await loadIr();
  // CURRENT RED REASON: buildReviewIRV2 runs the blocking gate BEFORE parsing
  // lanes (reviewTransportCore.mjs:613 gate precedes parseTrackedChanges at
  // :628), so the RTK_BUDGET_EXCEEDED truncation diagnostic from
  // parseTrackedChanges (:454) is appended AFTER the gate and the result is
  // {ok:true, code:'RTK_EXACT_APPLICABLE'} with structural:0 — masking the
  // overflow as an empty success.
  const result = ir.buildW2ReviewIr({
    parts: { 'word/document.xml': f14DocumentXml(20) },
    budgets: { maxRevisions: 5 },
  });

  // TARGET: text truncation must be a typed budget abort, never a masked success.
  assert.equal(result.ok, false, 'V1 text-truncation must abort, not mask as ok:true');
  assert.notEqual(result.code, 'RTK_EXACT_APPLICABLE', 'V1 text-truncation must not raise RTK_EXACT_APPLICABLE');
  assert.notEqual(result.status, 'review-ir-ready', 'V1 text-truncation must not be review-ir-ready');
  assert.equal(
    result.reasons.some((item) => item.code === 'RTK_BUDGET_EXCEEDED'),
    true,
    'V1 text-truncation must surface a typed RTK_BUDGET_EXCEEDED reason',
  );
  // TARGET: a laneCompleteness marker must be present and must mark the text
  // lane as BLOCKED_RESOURCE so an empty text lane is never confused with an
  // absent one.
  assert.equal(
    typeof result.laneCompleteness === 'object' && result.laneCompleteness !== null,
    true,
    'V1 text-truncation must carry a laneCompleteness marker',
  );
  assert.equal(
    result.laneCompleteness.text,
    'BLOCKED_RESOURCE',
    'V1 text-truncation must mark the text lane as BLOCKED_RESOURCE',
  );
});

test('ADMIT01-A2-v1-structure-masking-never-raises-text-authority', async () => {
  const ir = await loadIr();
  // CURRENT RED REASON: the same F-14 fixture (20 <w:ins> truncated to 5 +
  // trailing <w:tbl/>) returns code:'RTK_EXACT_APPLICABLE' with zero
  // structural changes, so the structure lane is silently dropped while the
  // text-authority success code is raised — an authority-guard violation.
  const result = ir.buildW2ReviewIr({
    parts: { 'word/document.xml': f14DocumentXml(20) },
    budgets: { maxRevisions: 5 },
  });

  // TARGET: the masked text-authority success code must not be raised when a
  // lane is truncated.
  assert.equal(
    result.code === 'RTK_EXACT_APPLICABLE',
    false,
    'V1 structure/text truncation must not raise the text-authority success code',
  );
  // TARGET: structure and text lanes must be explicitly marked
  // aborted/incomplete (BLOCKED_RESOURCE) rather than empty-as-absent.
  assert.equal(
    typeof result.laneCompleteness === 'object' && result.laneCompleteness !== null,
    true,
    'V1 structure/text truncation must carry a laneCompleteness marker',
  );
  const lanes = result.laneCompleteness || {};
  const markedBlocked = lanes.text === 'BLOCKED_RESOURCE' || lanes.structure === 'BLOCKED_RESOURCE';
  assert.equal(
    markedBlocked,
    true,
    'V1 structure/text truncation must mark at least one affected lane BLOCKED_RESOURCE',
  );
});

test('ADMIT01-A3-v1-comment-count-overflow-typed-abort', async () => {
  const ir = await loadIr();
  // CURRENT RED REASON: parseComments (reviewTransportCore.mjs:497) has no byte
  // accounting; maxComments overflow (:563) only appends an RTK_BUDGET_EXCEEDED
  // annotation after parsing every comment, so the result is ok:true with
  // silently-dropped comment accounting.
  const result = ir.buildW2ReviewIr({
    parts: {
      'word/document.xml': documentXml('<w:p><w:commentReference w:id="0"/></w:p>'),
      'word/comments.xml': commentsXml(5),
    },
    budgets: { maxComments: 2 },
  });

  // TARGET: comment count overflow must be a typed budget abort.
  assert.equal(result.ok, false, 'V1 comment-count overflow must abort, not mask as ok:true');
  assert.notEqual(result.code, 'RTK_EXACT_APPLICABLE', 'V1 comment overflow must not raise RTK_EXACT_APPLICABLE');
  assert.equal(
    result.reasons.some((item) => item.code === 'RTK_BUDGET_EXCEEDED'),
    true,
    'V1 comment overflow must surface a typed RTK_BUDGET_EXCEEDED reason',
  );
  assert.equal(
    typeof result.laneCompleteness === 'object' && result.laneCompleteness !== null,
    true,
    'V1 comment overflow must carry a laneCompleteness marker',
  );
  assert.equal(
    result.laneCompleteness.comments,
    'BLOCKED_RESOURCE',
    'V1 comment overflow must mark the comments lane as BLOCKED_RESOURCE',
  );
});

test('ADMIT01-A4-v1-control-within-budget-byte-stable', async () => {
  const ir = await loadIr();
  // CONTROL (green now and must stay green): the same fixtures with default
  // budgets parse byte-for-byte unchanged. The pre-fix ReviewIR digest is
  // pinned so Pass 2 cannot regress within-budget behavior.
  const textResult = ir.buildW2ReviewIr({
    parts: { 'word/document.xml': f14DocumentXml(20) },
  });
  const commentResult = ir.buildW2ReviewIr({
    parts: {
      'word/document.xml': documentXml('<w:p><w:commentReference w:id="0"/></w:p>'),
      'word/comments.xml': commentsXml(5),
    },
  });

  assert.equal(textResult.ok, true);
  assert.equal(textResult.code, 'RTK_EXACT_APPLICABLE');
  assert.equal(textResult.reviewIr.textChanges.length, 20);
  assert.equal(reviewIrDigest(textResult.reviewIr), 'sha256:c8c0f4f86435dce9c0a7b44ae4d2cac107e40995b3dc8a2e8119f41ab54d9334');

  assert.equal(commentResult.ok, true);
  assert.equal(commentResult.reviewIr.comments.length, 5);
  assert.equal(reviewIrDigest(commentResult.reviewIr), 'sha256:065c4d9ce84577929f390dc2eb777f5bbd394f0114b1908d999ae2d7d2e2ae06');
});

// =====================================================================
// Group B — V2 accountability (F-15 polish)
// =====================================================================

test('ADMIT01-B1-v2-comment-drop-no-success-reason', async () => {
  const parser = await loadV2Parser();
  const cryptoPort = makeCryptoPort();
  // CURRENT RED REASON: parseCommentThreads (reviewTransportPackageParserV2.mjs:1743)
  // still pushes a success-shaped per-comment reason (~:1882) for threads that
  // admitWorkerOutput (:243) just dropped from reviewIr.commentThreads, so a
  // blocked result carries ANCHORED/ORPHAN success reasons for threads that no
  // longer exist in the IR, and there is no laneCompleteness marker.
  const parts = {
    ...v2BaseParts(documentXml('<w:p><w:commentReference w:id="0"/></w:p>')),
    'word/comments.xml': commentsXml(5),
  };
  const result = parser.parseReviewTransportPackageV2(
    { parts, budgets: { maxWorkerOutputBytes: 600 } },
    { cryptoPort },
  );

  assert.equal(result.ok, false, 'V2 comment-drop budget must remain blocked');
  assert.equal(result.code, 'RTK_BUDGET_EXCEEDED');
  // TARGET: no dropped thread may carry a success-shaped comment reason.
  const successReasons = (result.reasons || []).filter((item) => COMMENT_SUCCESS_CODES.includes(item.code));
  assert.equal(
    successReasons.length === 0,
    true,
    `V2 dropped comment threads must not carry success-shaped reasons, got: ${successReasons.map((item) => item.code).join(',')}`,
  );
  // TARGET: comment lane must be marked BLOCKED_RESOURCE.
  assert.equal(
    typeof result.laneCompleteness === 'object' && result.laneCompleteness !== null,
    true,
    'V2 comment-drop result must carry a laneCompleteness marker',
  );
  assert.equal(
    result.laneCompleteness.commentThreads,
    'BLOCKED_RESOURCE',
    'V2 comment-drop must mark commentThreads lane as BLOCKED_RESOURCE',
  );
});

test('ADMIT01-B2-v2-abort-carries-lane-markers', async () => {
  const parser = await loadV2Parser();
  const cryptoPort = makeCryptoPort();
  // CURRENT RED REASON: any V2 abort (here maxWorkerOutputBytes tiny enough to
  // trip the worker-output gate) returns a blocked result that has no
  // laneCompleteness field at all, so callers cannot tell an empty-as-absent
  // lane from an aborted lane.
  const result = parser.parseReviewTransportPackageV2(
    { parts: v2BaseParts(documentXml('<w:p><w:commentReference w:id="0"/></w:p>')), budgets: { maxWorkerOutputBytes: 128 } },
    { cryptoPort },
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, 'RTK_BUDGET_EXCEEDED');
  // TARGET: a blocked result must carry laneCompleteness with per-lane statuses
  // covering at minimum text / structure / comments lanes.
  assert.equal(
    typeof result.laneCompleteness === 'object' && result.laneCompleteness !== null,
    true,
    'V2 abort must carry a laneCompleteness marker',
  );
  for (const lane of ['text', 'structure', 'comments']) {
    assert.equal(
      Object.hasOwn(result.laneCompleteness, lane),
      true,
      `V2 abort laneCompleteness must include the ${lane} lane`,
    );
  }
});

test('ADMIT01-B3-v2-control-within-budget-comments-green', async () => {
  const parser = await loadV2Parser();
  const cryptoPort = makeCryptoPort();
  // CONTROL (green now and must stay green): within-budget comments parse to an
  // analysis-ready result. laneCompleteness-COMPLETE assertions belong to the
  // B1/B2 TARGET shape; this control only pins the current ok:true outcome so
  // Pass 2 does not regress within-budget behavior.
  const result = parser.parseReviewTransportPackageV2(
    {
      parts: {
        ...v2BaseParts(documentXml('<w:p><w:commentReference w:id="0"/></w:p>')),
        'word/comments.xml': commentsXml(3),
      },
    },
    { cryptoPort },
  );

  assert.equal(result.ok, true);
  assert.equal(result.code, 'RTK_NO_WRITE_ANALYSIS_READY');
  assert.equal(result.reviewIr.comments.length, 3);
});

// =====================================================================
// Group C — authority guard: the masked IR shape must be unproducible
// =====================================================================

test('ADMIT01-C1-masked-ir-shape-unproducible', async () => {
  const ir = await loadIr();
  const parser = await loadV2Parser();
  const cryptoPort = makeCryptoPort();

  // V1 path: the F-14 fixture must NOT produce {ok:true, code:'RTK_EXACT_APPLICABLE'}
  // while a truncation diagnostic is present.
  // CURRENT RED REASON: the V1 path currently produces exactly that masked shape.
  const v1 = ir.buildW2ReviewIr({
    parts: { 'word/document.xml': f14DocumentXml(20) },
    budgets: { maxRevisions: 5 },
  });
  const v1Masked = v1.ok === true
    && v1.code === 'RTK_EXACT_APPLICABLE'
    && (v1.reasons || []).some((item) => item.code === 'RTK_BUDGET_EXCEEDED');
  assert.equal(
    v1Masked,
    false,
    'V1 path must not produce ok:true + RTK_EXACT_APPLICABLE alongside a truncation diagnostic',
  );

  // V2 path: an analogous overflow must also be a typed blocked result.
  // CURRENT: the V2 path already blocks typed (verified separately); this leg
  // pins that the masked success shape stays unproducible on both parser paths.
  const v2 = parser.parseReviewTransportPackageV2(
    {
      parts: {
        ...v2BaseParts(documentXml('<w:p><w:commentReference w:id="0"/></w:p>')),
        'word/comments.xml': commentsXml(5),
      },
      budgets: { maxComments: 2 },
    },
    { cryptoPort },
  );
  const v2Masked = v2.ok === true && (v2.reasons || []).some((item) => item.code === 'RTK_BUDGET_EXCEEDED');
  assert.equal(
    v2Masked,
    false,
    'V2 path must not produce ok:true alongside a comment budget diagnostic',
  );
});
