const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

const PARSER_PATH = 'src/io/revisionBridge/reviewTransportPackageParserV2.mjs';
const MAIN_PATH = 'src/main.js';
const WORKER_PATH = 'src/main/rtkDocxReturnIntakeWorker.cjs';

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

async function loadParser() {
  return import(pathToFileURL(path.join(process.cwd(), PARSER_PATH)).href);
}

function documentXml(body, attrs = '') {
  return `<w:document xmlns:w="${W_NS}"${attrs}><w:body>${body}</w:body></w:document>`;
}

function baseParts(document) {
  return {
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': document,
  };
}

function parse(parser, parts, budgets = {}) {
  return parser.parseReviewTransportPackageV2({ parts, budgets }, { cryptoPort });
}

function hasReason(result, code) {
  return (Array.isArray(result?.reasons) ? result.reasons : []).some((reason) => reason.code === code);
}

test('C3 parser treats quoted greater-than as attribute text and decodes numeric entities one pass', async () => {
  const parser = await loadParser();
  const result = parse(parser, baseParts(documentXml(
    '<w:p><w:ins><w:r><w:t data-probe="quoted > marker">Alpha &#62; Beta &#x3E; Gamma &amp;#62;</w:t></w:r></w:ins></w:p>',
  )));

  assert.equal(result.ok, true);
  assert.equal(result.sourceMode, 'TRACKED');
  assert.equal(result.reviewIr.textRevisions[0].text, 'Alpha > Beta > Gamma &#62;');
  assert.equal(result.reviewIr.diagnostics.some((reason) => reason.code === 'RTK_XML_MALFORMED_BLOCKED'), false);
  assert.equal(result.reviewIr.diagnostics.some((reason) => reason.code === 'RTK_BUDGET_EXCEEDED'), false);
  assert.equal(result.supportedSemanticDigest, parse(parser, baseParts(documentXml(
    '<x:p xmlns:x="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><x:ins><x:r><x:t data-probe="quoted > marker">Alpha &#62; Beta &#x3E; Gamma &amp;#62;</x:t></x:r></x:ins></x:p>',
  ))).supportedSemanticDigest);
});

test('C3 parser rejects malformed quotes invalid numeric entities and DTD before semantic pass', async () => {
  const parser = await loadParser();
  const malformedQuote = parse(parser, baseParts(documentXml(
    '<w:p><w:r><w:t data-bad="unterminated>bad</w:t></w:r></w:p>',
  )));
  const invalidScalar = parse(parser, baseParts(documentXml(
    '<w:p><w:r><w:t>bad &#xD800;</w:t></w:r></w:p>',
  )));
  const invalidReference = parse(parser, baseParts(documentXml(
    '<w:p><w:r><w:t>bad &unknown;</w:t></w:r></w:p>',
  )));
  const unterminatedReference = parse(parser, baseParts(documentXml(
    '<w:p><w:r><w:t>bad &amp</w:t></w:r></w:p>',
  )));
  const dtd = parse(parser, baseParts(`<!DOCTYPE x [<!ENTITY bomb "boom">]>${documentXml(
    '<w:p><w:r><w:t>body</w:t></w:r></w:p>',
  )}`));

  assert.equal(malformedQuote.ok, false);
  assert.equal(malformedQuote.code, 'RTK_XML_MALFORMED_BLOCKED');
  assert.equal(invalidScalar.ok, false);
  assert.equal(invalidScalar.code, 'RTK_XML_MALFORMED_BLOCKED');
  assert.equal(invalidReference.ok, false);
  assert.equal(invalidReference.code, 'RTK_XML_MALFORMED_BLOCKED');
  assert.equal(unterminatedReference.ok, false);
  assert.equal(unterminatedReference.code, 'RTK_XML_MALFORMED_BLOCKED');
  assert.equal(dtd.ok, false);
  assert.equal(dtd.code, 'RTK_HOSTILE_PACKAGE_BLOCKED');
  assert.equal(hasReason(dtd, 'RTK_HOSTILE_PACKAGE_BLOCKED'), true);
});

test('C3 parser enforces maxBlocks maxRevisions maxComments and maxCandidates fail-closed', async () => {
  const parser = await loadParser();
  const tooManyBlocks = parse(parser, baseParts(documentXml(
    '<w:p><w:r><w:t>one</w:t></w:r></w:p><w:p><w:r><w:t>two</w:t></w:r></w:p>',
  )), { maxBlocks: 1 });
  const tooManyRevisions = parse(parser, baseParts(documentXml(
    '<w:p><w:ins><w:r><w:t>one</w:t></w:r></w:ins><w:del><w:r><w:delText>two</w:delText></w:r></w:del></w:p>',
  )), { maxRevisions: 1 });
  const tooManyComments = parse(parser, {
    ...baseParts(documentXml('<w:p><w:commentReference w:id="1"/></w:p>')),
    'word/comments.xml': `<w:comments xmlns:w="${W_NS}"><w:comment w:id="1"><w:p><w:r><w:t>one</w:t></w:r></w:p></w:comment><w:comment w:id="2"><w:p><w:r><w:t>two</w:t></w:r></w:p></w:comment></w:comments>`,
  }, { maxComments: 1 });
  const tooManyCandidates = parse(parser, baseParts(documentXml(
    '<w:tbl/><w:tbl/><w:p><w:r><w:t>body</w:t></w:r></w:p>',
  )), { maxCandidates: 1 });

  for (const result of [tooManyBlocks, tooManyRevisions, tooManyComments, tooManyCandidates]) {
    assert.equal(result.ok, false);
    assert.equal(result.code, 'RTK_BUDGET_EXCEEDED');
    assert.equal(result.canApply, false);
    assert.equal(result.canWriteManuscript, false);
    assert.equal(hasReason(result, 'RTK_BUDGET_EXCEEDED'), true);
  }
});

test('C3 parser and utility worker enforce maxWorkerOutputBytes mechanically', async () => {
  const parser = await loadParser();
  const outputOverflow = parse(parser, baseParts(documentXml(
    '<w:p><w:r><w:t>body</w:t></w:r></w:p>',
  )), { maxWorkerOutputBytes: 128 });
  const parserSource = fs.readFileSync(path.join(process.cwd(), PARSER_PATH), 'utf8');
  const mainSource = fs.readFileSync(path.join(process.cwd(), MAIN_PATH), 'utf8');
  const workerSource = fs.readFileSync(path.join(process.cwd(), WORKER_PATH), 'utf8');

  assert.equal(outputOverflow.ok, false);
  assert.equal(outputOverflow.code, 'RTK_BUDGET_EXCEEDED');
  assert.match(parserSource, /admitWorkerOutput/u);
  assert.match(mainSource, /docxReviewReturnIntakeWorkerResultWithinBudget/u);
  assert.match(workerSource, /enforceWorkerOutputBudget/u);
});
