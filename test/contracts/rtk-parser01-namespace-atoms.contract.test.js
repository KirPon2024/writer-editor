const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const PARSER_PATH = 'src/io/revisionBridge/reviewTransportPackageParserV2.mjs';
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

// ---------------------------------------------------------------------------
// Shared helpers (mirror the b02/b03 in-memory fixture + cryptoPort pattern).
// ---------------------------------------------------------------------------

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
  crc32(value) {
    // Deterministic stub; real CRC32 is only exercised by ZIP inventory cases.
    let crc = 0xffffffff;
    for (const byte of Buffer.from(String(value || ''), 'utf8')) crc = ((crc ^ byte) & 0xff) ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  },
};

async function loadParser() {
  return import(pathToFileURL(path.join(process.cwd(), PARSER_PATH)).href);
}

// Document body wrapped with the Word main namespace under the given prefix.
function documentXml(body, prefix = 'w', extraNamespaces = '') {
  return `<${prefix}:document xmlns:${prefix}="${W_NS}"${extraNamespaces}><${prefix}:body>${body}</${prefix}:body></${prefix}:document>`;
}

// A default-namespace variant (no prefix) used by P4 to probe empty-namespace tokens.
function documentXmlDefaultNs(body, namespaceUri = '') {
  return `<document xmlns="${namespaceUri}"><body>${body}</body></document>`;
}

const CONTENT_TYPES = '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
const ROOT_RELS = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';

function baseParts(document, extra = {}) {
  return {
    '[Content_Types].xml': CONTENT_TYPES,
    '_rels/.rels': ROOT_RELS,
    'word/document.xml': document,
    ...extra,
  };
}

// Reason helpers for terse assertions.
function hasReason(result, code) {
  return Boolean(result.reasons && result.reasons.some((item) => item.code === code));
}

// ===========================================================================
// P1 — QName close-tag mismatch must be typed, not silently accepted.
// ===========================================================================

test('PARSER01-P1-qname-close-mismatch-rejected', async () => {
  const parser = await loadParser();
  // Open <w:p>, close </x:p>: same localName, same namespace, different prefix.
  // RED REASON: parseXmlPart closes by localName only (line ~509), so </x:p> silently
  // matches the open <w:p> and ok=true. TARGET: typed RTK_XML_QNAME_MISMATCH.
  const document = documentXml('<w:p><w:r><w:t>hi</w:t></w:r></x:p>', 'w', ` xmlns:x="${W_NS}"`);
  const result = parser.parseReviewTransportPackageV2(
    { parts: baseParts(document) },
    { cryptoPort },
  );
  assert.equal(result.ok, false, 'RED: qname mismatch on close tag is silently accepted (ok=true); target is typed RTK_XML_QNAME_MISMATCH rejection');
  assert.equal(hasReason(result, 'RTK_XML_QNAME_MISMATCH'), true, 'RED: parser emits no RTK_XML_QNAME_MISMATCH diagnostic for prefix-mismatched close tag');
});

// ===========================================================================
// P2 — Unbound prefix must be typed, not coerced to empty namespace.
// ===========================================================================

test('PARSER01-P2-unbound-prefix-rejected', async () => {
  const parser = await loadParser();
  // <zz:ins> with no xmlns:zz declared.
  // RED REASON: unbound prefix resolves to namespaceUri '' (line ~524), isWordToken
  // accepts empty namespace (line ~949), so a foreign element becomes Word revision
  // evidence. TARGET: typed RTK_XML_NAMESPACE_UNBOUND.
  const document = documentXml('<zz:ins w:id="1" w:author="A"><w:r><w:t>x</w:t></w:r></zz:ins>');
  const result = parser.parseReviewTransportPackageV2(
    { parts: baseParts(document) },
    { cryptoPort },
  );
  assert.equal(result.ok, false, 'RED: unbound prefix zz becomes empty-namespace Word token instead of typed RTK_XML_NAMESPACE_UNBOUND');
  assert.equal(hasReason(result, 'RTK_XML_NAMESPACE_UNBOUND'), true, 'RED: parser emits no RTK_XML_NAMESPACE_UNBOUND diagnostic for undeclared prefix');
  if (result.ok) {
    const revisions = result.reviewIr.textRevisions || [];
    assert.equal(revisions.length, 0, 'RED: unbound-prefix element must not become Word revision evidence');
  }
});

// ===========================================================================
// P3 — Duplicate expanded attribute must be typed, not silently overwritten.
// ===========================================================================

test('PARSER01-P3-duplicate-expanded-attribute-rejected', async () => {
  const parser = await loadParser();
  // (a) same prefix duplicate: <w:p w:id="1" w:id="2">.
  // RED REASON: bindAttributes overwrites attrsByLocal/attrsByNs (line ~348), so the
  // second value silently wins. TARGET: typed RTK_XML_DUPLICATE_ATTRIBUTE.
  const samePrefixDoc = documentXml('<w:p w:id="1" w:id="2"><w:r><w:t>x</w:t></w:r></w:p>');
  const samePrefix = parser.parseReviewTransportPackageV2(
    { parts: baseParts(samePrefixDoc) },
    { cryptoPort },
  );
  assert.equal(samePrefix.ok, false, 'RED: duplicate same-prefix attribute is silently overwritten (ok=true); target is typed RTK_XML_DUPLICATE_ATTRIBUTE');
  assert.equal(hasReason(samePrefix, 'RTK_XML_DUPLICATE_ATTRIBUTE'), true, 'RED: parser emits no RTK_XML_DUPLICATE_ATTRIBUTE diagnostic for duplicate same-prefix attribute');

  // (b) different prefix, same localName, same expanded namespace: <w:p w:id="1" x:id="2">.
  // RED REASON: attrsByNs["{ns}|id"] overwrites (line ~350). TARGET: typed rejection.
  const diffPrefixDoc = documentXml('<w:p w:id="1" x:id="2"><w:r><w:t>x</w:t></w:r></w:p>', 'w', ` xmlns:x="${W_NS}"`);
  const diffPrefix = parser.parseReviewTransportPackageV2(
    { parts: baseParts(diffPrefixDoc) },
    { cryptoPort },
  );
  assert.equal(diffPrefix.ok, false, 'RED: duplicate expanded attribute (diff prefix, same ns) is silently overwritten; target is typed RTK_XML_DUPLICATE_ATTRIBUTE');
  assert.equal(hasReason(diffPrefix, 'RTK_XML_DUPLICATE_ATTRIBUTE'), true, 'RED: parser emits no RTK_XML_DUPLICATE_ATTRIBUTE diagnostic for duplicate expanded attribute');
});

// ===========================================================================
// P4 — Empty-namespace revision element must not be Word revision evidence.
// ===========================================================================

test('PARSER01-P4-empty-namespace-not-word', async () => {
  const parser = await loadParser();
  // <ins> with empty default namespace: no namespace at all.
  // RED REASON: isWordToken accepts empty namespaceUri (line ~949), so a no-namespace
  // <ins> becomes a Word TextRevision. TARGET: NOT Word revision (typed block or opaque).
  const document = documentXmlDefaultNs('<ins id="1" author="A"><r><t>x</t></r></ins>', '');
  const result = parser.parseReviewTransportPackageV2(
    { parts: baseParts(document) },
    { cryptoPort },
  );
  const revisions = result.ok ? (result.reviewIr.textRevisions || []) : [];
  assert.equal(
    revisions.length,
    0,
    'RED: empty-namespace <ins> yields a Word TextRevision (namespaceUri=""), so it is treated as Word revision evidence instead of non-Word',
  );

  // Foreign-namespace <f:ins> must also never be Word revision evidence.
  const foreignDoc = `<f:document xmlns:f="urn:foreign"><f:body><f:ins id="1" author="A"><f:r><f:t>x</f:t></f:r></f:ins></f:body></f:document>`;
  const foreign = parser.parseReviewTransportPackageV2(
    { parts: baseParts(foreignDoc) },
    { cryptoPort },
  );
  const foreignRevisions = foreign.ok ? (foreign.reviewIr.textRevisions || []) : [];
  assert.equal(
    foreignRevisions.length,
    0,
    'CONTROL: foreign-namespace <f:ins> is already filtered (namespaceUri != W_NS and != "")',
  );
});

// ===========================================================================
// P5 — Semantic whitespace atoms must be distinct and preserved.
// ===========================================================================

test('PARSER01-P5-semantic-whitespace-preserved', async () => {
  const parser = await loadParser();
  const digestOf = (document) => {
    const wrapped = documentXml(document);
    const result = parser.parseReviewTransportPackageV2(
      { parts: baseParts(wrapped) },
      { cryptoPort },
    );
    assert.equal(result.ok, true);
    return result;
  };

  // (a) xml:space="preserve" tracked whitespace is trimmed away by tokenText.
  // RED REASON: tokenText calls .trim() (line ~673), so ' beta ' becomes 'beta'.
  const tracked = digestOf('<w:p><w:ins w:id="1" w:author="A"><w:r><w:t xml:space="preserve"> beta </w:t></w:r></w:ins></w:p>');
  const trackedText = tracked.reviewIr.textRevisions[0].text;
  assert.equal(
    trackedText,
    ' beta ',
    'RED: tracked whitespace (xml:space="preserve") is trimmed to "beta" instead of preserved as " beta "',
  );

  // (b) softHyphen is indistinguishable from an empty run (colliding textDigest).
  // RED REASON: stripTagsToText has no softHyphen branch (line ~582), so its text is "".
  const softHyphen = digestOf('<w:p><w:ins w:id="1" w:author="A"><w:r><w:softHyphen/></w:r></w:ins></w:p>');
  const emptyRun = digestOf('<w:p><w:ins w:id="1" w:author="A"><w:r></w:r></w:ins></w:p>');
  assert.notEqual(
    softHyphen.reviewIr.textRevisions[0].textDigest,
    emptyRun.reviewIr.textRevisions[0].textDigest,
    'RED: softHyphen textDigest collides with empty-run digest (softHyphen == absent)',
  );

  // (c) <w:br/> and <w:br w:type="page"/> collide — line break == page break.
  // RED REASON: wordDocumentText/stripTagsToText map every br to "\n" with no type
  // awareness (line ~666, ~583).
  const brLine = digestOf('<w:p><w:ins w:id="1" w:author="A"><w:r><w:br/></w:r></w:ins></w:p>');
  const brPage = digestOf('<w:p><w:ins w:id="1" w:author="A"><w:r><w:br w:type="page"/></w:r></w:ins></w:p>');
  assert.notEqual(
    brLine.reviewIr.textRevisions[0].textDigest,
    brPage.reviewIr.textRevisions[0].textDigest,
    'RED: <w:br/> and <w:br w:type="page"/> share one textDigest (line break == page break)',
  );

  // (d) noBreakHyphen must be a distinct atom from a plain hyphen text run.
  const noBreakHyphen = digestOf('<w:p><w:ins w:id="1" w:author="A"><w:r><w:noBreakHyphen/></w:r></w:ins></w:p>');
  const plainHyphen = digestOf('<w:p><w:ins w:id="1" w:author="A"><w:r><w:t>-</w:t></w:r></w:ins></w:p>');
  assert.notEqual(
    noBreakHyphen.reviewIr.textRevisions[0].textDigest,
    plainHyphen.reviewIr.textRevisions[0].textDigest,
    'RED: <w:noBreakHyphen/> is not a distinct semantic atom from a plain "-" text run',
  );

  // (e) <w:tab/> must be a distinct tab atom (currently mapped to "\t", which is fine
  // as long as it does not collide with a literal tab text run).
  const tabAtom = digestOf('<w:p><w:ins w:id="1" w:author="A"><w:r><w:tab/></w:r></w:ins></w:p>');
  const emptyForTab = digestOf('<w:p><w:ins w:id="1" w:author="A"><w:r></w:r></w:ins></w:p>');
  assert.notEqual(
    tabAtom.reviewIr.textRevisions[0].textDigest,
    emptyForTab.reviewIr.textRevisions[0].textDigest,
    'RED: <w:tab/> textDigest collides with empty-run digest (tab == absent)',
  );
});

// ===========================================================================
// P6 — Paragraph-mark ins/del under pPr/rPr must be structural, not empty TextRevision.
// ===========================================================================

test('PARSER01-P6-paragraph-mark-structural', async () => {
  const parser = await loadParser();
  // Paragraph-mark deletion: <w:del> sits under pPr/rPr and marks the paragraph mark,
  // not run text. RTK_STRUCTURAL_PARAGRAPH_MARK_DELETED is already registered in core.
  const delDoc = documentXml('<w:p><w:pPr><w:rPr><w:del w:id="1" w:author="A" w:date="2026-08-08T10:00:00Z"/></w:rPr></w:pPr><w:r><w:t>body</w:t></w:r></w:p>');
  const delResult = parser.parseReviewTransportPackageV2(
    { parts: baseParts(delDoc) },
    { cryptoPort },
  );
  assert.equal(delResult.ok, true);
  const delTextRevisions = (delResult.reviewIr.textRevisions || []).filter((item) => item.kind === 'TextRevision');
  assert.equal(
    delTextRevisions.length,
    0,
    'RED: paragraph-mark <w:del> under pPr/rPr becomes an empty TextRevision instead of ParagraphMarkRevision',
  );
  assert.equal(
    (delResult.reviewIr.structureChanges || []).some((item) => item.reasonCode === 'RTK_STRUCTURAL_PARAGRAPH_MARK_DELETED' || item.structureKind === 'paragraphMarkDeleted'),
    true,
    'RED: paragraph-mark deletion is not classified structurally as RTK_STRUCTURAL_PARAGRAPH_MARK_DELETED',
  );

  // Paragraph-mark insertion variant.
  const insDoc = documentXml('<w:p><w:pPr><w:rPr><w:ins w:id="2" w:author="A" w:date="2026-08-08T10:00:00Z"/></w:rPr></w:pPr><w:r><w:t>body</w:t></w:r></w:p>');
  const insResult = parser.parseReviewTransportPackageV2(
    { parts: baseParts(insDoc) },
    { cryptoPort },
  );
  assert.equal(insResult.ok, true);
  const insTextRevisions = (insResult.reviewIr.textRevisions || []).filter((item) => item.kind === 'TextRevision');
  assert.equal(
    insTextRevisions.length,
    0,
    'RED: paragraph-mark <w:ins> under pPr/rPr becomes an empty TextRevision instead of ParagraphMarkRevision',
  );
  assert.equal(
    (insResult.reviewIr.structureChanges || []).some((item) => item.reasonCode === 'RTK_STRUCTURAL_PARAGRAPH_MARK_INSERTED' || item.structureKind === 'paragraphMarkInserted'),
    true,
    'RED: paragraph-mark insertion is not classified structurally as RTK_STRUCTURAL_PARAGRAPH_MARK_INSERTED',
  );
});

// ===========================================================================
// P7 — No cross-paragraph replacement group (red) + same-paragraph control (green).
// ===========================================================================

test('PARSER01-P7-no-cross-paragraph-replacement-group', async () => {
  const parser = await loadParser();
  // del in paragraph 1 (author A) + ins in paragraph 2 (author B), raw gap < 256.
  // RED REASON: parseTextRevisions groups by raw XML distance only (line ~1196),
  // with no story/paragraph boundary check, so both share replacementGroupId.
  const crossDoc = documentXml(
    '<w:p><w:del w:id="d1" w:author="A"><w:r><w:delText>old</w:delText></w:r></w:del></w:p>'
    + '<w:p><w:ins w:id="i1" w:author="B"><w:r><w:t>new</w:t></w:r></w:ins></w:p>',
  );
  const cross = parser.parseReviewTransportPackageV2(
    { parts: baseParts(crossDoc) },
    { cryptoPort },
  );
  assert.equal(cross.ok, true);
  const crossRevisions = cross.reviewIr.textRevisions || [];
  const sharedCrossGroup = crossRevisions.length === 2
    && crossRevisions[0].replacementGroupId
    && crossRevisions[0].replacementGroupId === crossRevisions[1].replacementGroupId;
  assert.equal(
    sharedCrossGroup,
    false,
    'RED: cross-paragraph del (author A) + ins (author B) share one replacementGroupId because grouping uses raw XML distance only',
  );
});

test('PARSER01-P7b-same-author-cross-paragraph-no-group', async () => {
  const parser = await loadParser();
  // del in paragraph 1 + ins in paragraph 2, SAME author (metadata check passes),
  // raw XML gap < 256. Isolates the paragraph-dimension pin: P7 (different authors)
  // is masked by the metadata check (different authors -> continue before the
  // paragraph guard is even meaningfully exercised), so removing the paragraph-index
  // check still passes P7. P7b forces grouping to be rejected by paragraph dimension
  // alone — both revisions must stay false-sentinel, never a shared groupId.
  // AMDG transparency: the single dimension under test is named explicitly.
  const crossDoc = documentXml(
    '<w:p><w:del w:id="d1" w:author="A"><w:r><w:delText>old</w:delText></w:r></w:del></w:p>'
    + '<w:p><w:ins w:id="i1" w:author="A"><w:r><w:t>new</w:t></w:r></w:ins></w:p>',
  );
  const cross = parser.parseReviewTransportPackageV2(
    { parts: baseParts(crossDoc) },
    { cryptoPort },
  );
  assert.equal(cross.ok, true);
  const crossRevisions = cross.reviewIr.textRevisions || [];
  const sharedCrossGroup = crossRevisions.length === 2
    && crossRevisions[0].replacementGroupId
    && crossRevisions[0].replacementGroupId === crossRevisions[1].replacementGroupId;
  assert.equal(
    sharedCrossGroup,
    false,
    'RED: same-author cross-paragraph del + ins share one replacementGroupId because the paragraph-index guard was removed and the (passing) metadata check no longer blocks grouping',
  );
});

test('PARSER01-P7c-same-paragraph-replacement-control', async () => {
  const parser = await loadParser();
  // CONTROL: same-paragraph adjacent del+ins (b02 fixture style) group into one pair.
  // Green now and MUST remain green after Pass 2.
  const sameDoc = documentXml(
    '<w:p><w:del w:id="d1" w:author="A"><w:r><w:delText>old</w:delText></w:r></w:del>'
    + '<w:ins w:id="i1" w:author="A"><w:r><w:t>new</w:t></w:r></w:ins></w:p>',
  );
  const same = parser.parseReviewTransportPackageV2(
    { parts: baseParts(sameDoc) },
    { cryptoPort },
  );
  assert.equal(same.ok, true);
  const revisions = same.reviewIr.textRevisions || [];
  assert.equal(revisions.length, 2);
  assert.match(revisions[0].replacementGroupId, /^[a-f0-9]{64}$/u);
  assert.equal(revisions[0].replacementGroupId, revisions[1].replacementGroupId);
});

// ===========================================================================
// P8 — Comment anchor violations must be typed, not exact/anchored candidates.
// ===========================================================================

test('PARSER01-P8-comment-anchor-violations-typed', async () => {
  const parser = await loadParser();
  const commentsXml = (inner) => `<w:comments xmlns:w="${W_NS}">${inner}</w:comments>`;

  // (a) lone anchor: commentRangeStart with no matching commentRangeEnd.
  // RED REASON: commentAnchorMap sets anchored=true even when rangeEnd is absent
  // (line ~1746), so a lone anchor looks exact.
  const loneDoc = documentXml('<w:p><w:commentRangeStart w:id="7"/><w:r><w:t>anchor</w:t></w:r></w:p>');
  const loneComments = commentsXml('<w:comment w:id="7" w:author="A"><w:p><w:r><w:t>body7</w:t></w:r></w:p></w:comment>');
  const lone = parser.parseReviewTransportPackageV2(
    { parts: baseParts(loneDoc, { 'word/comments.xml': loneComments }) },
    { cryptoPort },
  );
  assert.equal(lone.ok, true);
  const loneThread = lone.reviewIr.commentThreads[0];
  assert.equal(
    loneThread.status === 'ANCHORED' && loneThread.placement.anchored === true,
    false,
    'RED: lone anchor (rangeStart without end) is reported as exact/ANCHORED instead of typed RTK_COMMENT_ANCHOR_*',
  );

  // (b) commentReference without commentRangeStart.
  // RED REASON: commentReference is treated as an anchor start (line ~1731), so a
  // dangling reference looks exact.
  const refDoc = documentXml('<w:p><w:r><w:t>x</w:t></w:r><w:r><w:commentReference w:id="8"/></w:r></w:p>');
  const refComments = commentsXml('<w:comment w:id="8" w:author="A"><w:p><w:r><w:t>body8</w:t></w:r></w:p></w:comment>');
  const ref = parser.parseReviewTransportPackageV2(
    { parts: baseParts(refDoc, { 'word/comments.xml': refComments }) },
    { cryptoPort },
  );
  assert.equal(ref.ok, true);
  const refThread = ref.reviewIr.commentThreads[0];
  assert.equal(
    refThread.status === 'ANCHORED' && refThread.placement.anchored === true,
    false,
    'RED: commentReference without rangeStart is reported as exact/ANCHORED instead of typed RTK_COMMENT_ANCHOR_*',
  );

  // (c) crossing intervals of two comments.
  // RED REASON: no non-crossing/acyclic check exists, so both crossing ranges look exact.
  const crossDoc = documentXml(
    '<w:p>'
    + '<w:commentRangeStart w:id="1"/><w:r><w:t>AAA</w:t></w:r>'
    + '<w:commentRangeStart w:id="2"/><w:r><w:t>BB</w:t></w:r>'
    + '<w:commentRangeEnd w:id="1"/><w:r><w:t>CC</w:t></w:r>'
    + '<w:commentRangeEnd w:id="2"/>'
    + '</w:p>',
  );
  const crossComments = commentsXml(
    '<w:comment w:id="1" w:author="A"><w:p><w:r><w:t>c1</w:t></w:r></w:p></w:comment>'
    + '<w:comment w:id="2" w:author="B"><w:p><w:r><w:t>c2</w:t></w:r></w:p></w:comment>',
  );
  const cross = parser.parseReviewTransportPackageV2(
    { parts: baseParts(crossDoc, { 'word/comments.xml': crossComments }) },
    { cryptoPort },
  );
  assert.equal(cross.ok, true);
  const exactCrossCount = (cross.reviewIr.commentThreads || [])
    .filter((thread) => thread.status === 'ANCHORED').length;
  assert.equal(
    exactCrossCount === 2,
    false,
    'RED: crossing comment intervals are both reported as exact/ANCHORED instead of typed RTK_COMMENT_ANCHOR_*',
  );

  // (d) duplicate anchor id: two commentRangeStart with the same id.
  // RED REASON: commentAnchorMap is first-wins (line ~1733), so the duplicate is
  // silently dropped rather than typed.
  const dupDoc = documentXml(
    '<w:p>'
    + '<w:commentRangeStart w:id="9"/><w:r><w:t>first</w:t></w:r><w:commentRangeEnd w:id="9"/>'
    + '<w:commentRangeStart w:id="9"/><w:r><w:t>second</w:t></w:r><w:commentRangeEnd w:id="9"/>'
    + '</w:p>',
  );
  const dupComments = commentsXml('<w:comment w:id="9" w:author="A"><w:p><w:r><w:t>body9</w:t></w:r></w:p></w:comment>');
  const dup = parser.parseReviewTransportPackageV2(
    { parts: baseParts(dupDoc, { 'word/comments.xml': dupComments }) },
    { cryptoPort },
  );
  assert.equal(dup.ok, true);
  assert.equal(
    hasReason(dup, 'RTK_COMMENT_ANCHOR_DUPLICATE') || (dup.reviewIr.commentThreads || []).some((thread) => thread.status !== 'ANCHORED'),
    true,
    'RED: duplicate comment anchor id is silently first-wins instead of typed RTK_COMMENT_ANCHOR_DUPLICATE',
  );
});

// ===========================================================================
// P9 — Own-hyperlink roundtrip must be consistent (red) + inert rel control (green).
// ===========================================================================

test('PARSER01-P9-own-hyperlink-roundtrip', async () => {
  const parser = await loadParser();
  // Product-exported packet style: document hyperlinks reference an External rel
  // emitted by the builder (docxReviewPacketBuilder.js line ~333).
  // RED REASON: parser blocks ALL External rels (line ~799), so the product's own
  // packet is rejected as RTK_HOSTILE_PACKAGE_BLOCKED — a self-conflict.
  const document = documentXml(
    '<w:p><w:hyperlink r:id="rIdLink"><w:r><w:t>click</w:t></w:r></w:hyperlink></w:p>',
    'w',
    ` xmlns:r="${R_NS}"`,
  );
  const rels = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLink" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.invalid" TargetMode="External"/></Relationships>`;
  const result = parser.parseReviewTransportPackageV2(
    { parts: baseParts(document, { 'word/_rels/document.xml.rels': rels }) },
    { cryptoPort },
  );
  assert.equal(
    result.ok && result.code !== 'RTK_HOSTILE_PACKAGE_BLOCKED',
    true,
    'RED: own product-exported hyperlink packet is blocked as RTK_HOSTILE_PACKAGE_BLOCKED (builder emits External, parser blocks External) — self-conflict; target is a consistent exact-text or declared-inert profile',
  );
});

test('PARSER01-P9c-external-active-rel-control', async () => {
  const parser = await loadParser();
  // CONTROL: External rel outside the hyperlink profile (attached template / executable)
  // MUST remain blocked now and after Pass 2.
  const document = documentXml('<w:p><w:r><w:t>safe</w:t></w:r></w:p>');
  const rels = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rTpl" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate" Target="https://evil.invalid/template.dotx" TargetMode="External"/></Relationships>`;
  const result = parser.parseReviewTransportPackageV2(
    { parts: baseParts(document, { 'word/_rels/document.xml.rels': rels }) },
    { cryptoPort },
  );
  assert.equal(result.ok, false);
  assert.equal(hasReason(result, 'RTK_HOSTILE_PACKAGE_BLOCKED'), true);
});

// ===========================================================================
// P10 — Namespace-invariance control (CANON-01 C7): green now and after Pass 2.
// ===========================================================================

test('PARSER01-P10-namespace-invariance-control', async () => {
  const parser = await loadParser();
  const first = parser.parseReviewTransportPackageV2(
    { parts: baseParts(documentXml('<w:p><w:ins w:id="1" w:author="A" w:date="2026-08-08T10:00:00Z"><w:r><w:t>Alpha</w:t></w:r></w:ins></w:p>')) },
    { cryptoPort },
  );
  const second = parser.parseReviewTransportPackageV2(
    { parts: baseParts(documentXml('<x:p><x:ins x:date="2026-08-08T10:00:00Z" x:author="A" x:id="1"><x:r><x:t>Alpha</x:t></x:r></x:ins></x:p>', 'x')) },
    { cryptoPort },
  );
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.supportedSemanticDigest, second.supportedSemanticDigest);
});
