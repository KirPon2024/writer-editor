const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const PARSER_PATH = 'src/io/revisionBridge/reviewTransportPackageParserV2.mjs';
const CLASSIFIER_PATH = 'src/io/revisionBridge/reviewTransportClassifierV2.mjs';
const INDEX_PATH = 'src/io/revisionBridge/index.mjs';
const RECEIPT_PATH = 'docs/OPS/RTK/WORD_LATEST_SEMANTIC_ROUNDTRIP_V2_B04_CLASSIFIER_RECEIPT.json';
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

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

async function load(relativePath) {
  return import(pathToFileURL(path.join(process.cwd(), relativePath)).href);
}

function documentXml(body) {
  return `<w:document xmlns:w="${W_NS}"><w:body>${body}</w:body></w:document>`;
}

function parts(body) {
  return {
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': documentXml(body),
  };
}

const fullAuthority = Object.freeze({
  validSignedLocator: true,
  sceneRevisionUnchanged: true,
  rawSha256Unchanged: true,
  uniqueTarget: true,
  nonOverlapping: true,
  allRelevantXmlSemanticsAccounted: true,
});

test('B04 classifier marks text exact only when every signed locator and baseline guard is true', async () => {
  const parser = await load(PARSER_PATH);
  const classifier = await load(CLASSIFIER_PATH);
  const parsed = parser.parseReviewTransportPackageV2({
    parts: parts('<w:p><w:ins w:id="1"><w:r><w:t>inserted</w:t></w:r></w:ins></w:p>'),
  }, { cryptoPort });
  const exact = classifier.classifyReviewTransportIrV2({
    reviewIr: parsed.reviewIr,
    exactAuthority: fullAuthority,
  }, { cryptoPort });
  const degraded = classifier.classifyReviewTransportIrV2({
    reviewIr: parsed.reviewIr,
    exactAuthority: { ...fullAuthority, validSignedLocator: false },
  }, { cryptoPort });

  assert.equal(exact.ok, true);
  assert.equal(exact.canApply, false);
  assert.equal(exact.candidateDisposition.textLane, 'RTK_EXACT_APPLICABLE');
  assert.equal(exact.summary.exactAutomaticCandidates, 1);
  assert.equal(exact.classifications.text[0].disposition, 'EXACT_AUTOMATIC_CANDIDATE');
  assert.equal(degraded.summary.exactAutomaticCandidates, 0);
  assert.equal(degraded.classifications.text[0].disposition, 'MANUAL_REVIEW');
  assert.equal(degraded.reasons.some((reason) => reason.code === 'RTK_MANUAL_DEGRADED_LOCATOR'), true);
});

test('B04 classifier keeps replacement pairs atomic and duplicate ambiguity blocks exact', async () => {
  const parser = await load(PARSER_PATH);
  const classifier = await load(CLASSIFIER_PATH);
  const parsed = parser.parseReviewTransportPackageV2({
    parts: parts('<w:p><w:del w:id="d1"><w:r><w:delText>old</w:delText></w:r></w:del><w:ins w:id="i1"><w:r><w:t>new</w:t></w:r></w:ins></w:p>'),
  }, { cryptoPort });
  const exact = classifier.classifyReviewTransportIrV2({
    reviewIr: parsed.reviewIr,
    exactAuthority: fullAuthority,
  }, { cryptoPort });
  const ambiguous = classifier.classifyReviewTransportIrV2({
    reviewIr: parsed.reviewIr,
    exactAuthority: { ...fullAuthority, ambiguousDuplicate: true },
  }, { cryptoPort });

  assert.equal(exact.classifications.text.length, 1);
  assert.equal(exact.classifications.text[0].kind, 'replacement-pair');
  assert.equal(exact.classifications.text[0].disposition, 'EXACT_AUTOMATIC_CANDIDATE');
  assert.deepEqual(exact.classifications.text[0].sourceRevisionIds, ['d1', 'i1']);
  assert.equal(ambiguous.classifications.text[0].disposition, 'MANUAL_REVIEW');
  assert.equal(ambiguous.reasons.some((reason) => reason.code === 'RTK_BLOCKED_AMBIGUOUS_TEXT'), true);
});

test('B04 classifier blocks move and structural changes even with otherwise valid exact authority', async () => {
  const parser = await load(PARSER_PATH);
  const classifier = await load(CLASSIFIER_PATH);
  const parsed = parser.parseReviewTransportPackageV2({
    parts: parts('<w:p><w:moveFrom w:id="m1"><w:r><w:t>from</w:t></w:r></w:moveFrom><w:moveTo w:id="m1"><w:r><w:t>to</w:t></w:r></w:moveTo><w:pPr><w:pPrChange w:id="p1"/></w:pPr></w:p>'),
  }, { cryptoPort });
  const result = classifier.classifyReviewTransportIrV2({
    reviewIr: parsed.reviewIr,
    exactAuthority: fullAuthority,
  }, { cryptoPort });

  assert.equal(result.summary.exactAutomaticCandidates, 0);
  assert.equal(result.classifications.moves[0].disposition, 'BLOCKED');
  assert.equal(result.classifications.moves[0].reasonCode, 'RTK_BLOCKED_MOVE_REVISION');
  assert.equal(result.classifications.structure.some((item) => item.reasonCode === 'RTK_BLOCKED_STRUCTURAL'), true);
  assert.equal(result.candidateDisposition.textLane, 'RTK_BLOCKED_STRUCTURAL');
  assert.equal(result.falseExactGuards.moveRevisionExactAuthority, false);
});

test('B04 classifier keeps property formatting and comments in separate non-writer lanes', async () => {
  const parser = await load(PARSER_PATH);
  const classifier = await load(CLASSIFIER_PATH);
  const parsed = parser.parseReviewTransportPackageV2({
    parts: {
      ...parts('<w:p><w:pPr><w:pPrChange w:id="p1"/></w:pPr><w:r><w:rPr><w:b/><w:rPrChange w:id="r1"/></w:rPr><w:t>styled</w:t></w:r><w:commentRangeStart w:id="7"/><w:r><w:t>anchor</w:t></w:r><w:commentRangeEnd w:id="7"/><w:r><w:commentReference w:id="7"/></w:r></w:p>'),
      'word/comments.xml': `<w:comments xmlns:w="${W_NS}"><w:comment w:id="7"><w:p><w:r><w:t>Comment</w:t></w:r></w:p></w:comment></w:comments>`,
    },
  }, { cryptoPort });
  const result = classifier.classifyReviewTransportIrV2({
    reviewIr: parsed.reviewIr,
    exactAuthority: fullAuthority,
  }, { cryptoPort });

  assert.equal(result.classifications.properties.every((item) => item.disposition === 'MANUAL_REVIEW'), true);
  assert.equal(result.classifications.formatting.every((item) => item.disposition === 'MANUAL_REVIEW'), true);
  assert.equal(result.classifications.comments[0].disposition, 'COMMENTS_ONLY');
  assert.equal(result.candidateDisposition.commentLane, 'RTK_COMMENT_ANCHORED');
  assert.equal(result.canWriteManuscript, false);
});

test('B04 public export receipt and core boundaries forbid writer authority and fuzzy exact', async () => {
  const bridge = await load(INDEX_PATH);
  const receipt = JSON.parse(fs.readFileSync(path.join(process.cwd(), RECEIPT_PATH), 'utf8'));
  const source = fs.readFileSync(path.join(process.cwd(), CLASSIFIER_PATH), 'utf8');

  assert.equal(typeof bridge.classifyReviewTransportIrV2, 'function');
  assert.equal(bridge.RTK_REVIEW_TRANSPORT_CLASSIFIER_V2_PROFILE, 'bounded-review-ir-classifier-v2-b04');
  assert.equal(receipt.status, 'B04_CLASSIFIER_READY_NOT_APPLY_INTEGRATED');
  assert.equal(receipt.nonClaims.automaticApplyExpanded, false);
  assert.equal(receipt.nonClaims.fuzzyApplyAuthority, false);
  for (const forbidden of ['node:', 'Buffer', 'child_process', 'fetch(', 'XMLHttpRequest', 'WebSocket']) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
