const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { deflateRawSync } = require('node:zlib');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const BRIDGE_PATH = path.join(ROOT, 'src', 'io', 'revisionBridge', 'index.mjs');
const RUNTIME_PATH = path.join(ROOT, 'src', 'io', 'revisionBridge', 'reviewTransportFormattingReturnRuntime.mjs');
const ENVELOPE_PATH = path.join(ROOT, 'src', 'renderer', 'documentContentEnvelope.mjs');
const PHYSICAL_CANARY_PATH = path.join(ROOT, 'scripts', 'ops', 'rtk-word-c5v2-physical-canary.mjs');
const { buildDocxReviewPacketBuffer } = require(path.join(ROOT, 'src', 'export', 'docx', 'docxReviewPacketBuilder.js'));

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const cryptoPort = {
  sha256Text(value) {
    return crypto.createHash('sha256').update(Buffer.from(String(value), 'utf8')).digest('hex');
  },
  sha256Json(value) {
    return `sha256:${this.sha256Text(stableJson(value))}`;
  },
  byteLength(value) {
    return Buffer.byteLength(String(value), 'utf8');
  },
};

function normalizeEntry(entry) {
  const body = Buffer.from(entry.body || '', 'utf8');
  const compressedBody = deflateRawSync(body);
  return { ...entry, method: 8, body, compressedBody, byteSize: body.length, compressedSize: compressedBody.length };
}

function localRecord(entry, offset) {
  const normalized = normalizeEntry(entry);
  const name = Buffer.from(normalized.name, 'ascii');
  const header = Buffer.alloc(30 + name.length);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(normalized.method, 8);
  header.writeUInt32LE(normalized.compressedSize, 18);
  header.writeUInt32LE(normalized.byteSize, 22);
  header.writeUInt16LE(name.length, 26);
  name.copy(header, 30);
  return { ...normalized, offset, bytes: Buffer.concat([header, normalized.compressedBody]) };
}

function centralRecord(entry) {
  const name = Buffer.from(entry.name, 'ascii');
  const header = Buffer.alloc(46 + name.length);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(entry.method, 10);
  header.writeUInt32LE(entry.compressedSize, 20);
  header.writeUInt32LE(entry.byteSize, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt32LE(entry.offset, 42);
  name.copy(header, 46);
  return header;
}

function zipFixture(entries) {
  const locals = [];
  let offset = 0;
  for (const entry of entries) {
    const local = localRecord(entry, offset);
    locals.push(local);
    offset += local.bytes.length;
  }
  const central = Buffer.concat(locals.map((entry) => centralRecord(entry)));
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(locals.length, 8);
  end.writeUInt16LE(locals.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([Buffer.concat(locals.map((entry) => entry.bytes)), central, end]);
}

function exportMap(text = 'Alpha beta') {
  return {
    scenes: [{
      sceneId: 'scene-a',
      sceneOrdinal: 0,
      blocks: [{
        blockId: 'block-a-1',
        paragraphId: 'paragraph-a-1',
        canonicalTextSha256: `sha256:${crypto.createHash('sha256').update(text, 'utf8').digest('hex')}`,
        canonicalMarksSha256: cryptoPort.sha256Json({ marks: [] }),
        wordSignals: [
          { kind: 'w14ParaIdTextId', value: { paraId: 'A1B2C3D4', textId: 'D4C3B2A1' } },
          { kind: 'bookmarkName', value: { name: 'YRTK_01_0001_alpha' } },
        ],
      }],
    }],
  };
}

function richExportMap(text, formatIr) {
  const map = exportMap(text);
  map.scenes[0].sceneRevision = `sha256:${'b'.repeat(64)}`;
  map.scenes[0].rawSha256 = `sha256:${'c'.repeat(64)}`;
  map.scenes[0].blocks[0].formatIr = formatIr;
  map.scenes[0].blocks[0].canonicalMarksSha256 = cryptoPort.sha256Json(formatIr);
  return map;
}

function docx(documentBody) {
  return zipFixture([{
    name: 'word/document.xml',
    body: `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"><w:body>${documentBody}</w:body></w:document>`,
  }]);
}

test('N3 extractor binds safe inline formatting and ignores comment-reference-only run properties', async () => {
  const bridge = await import(pathToFileURL(BRIDGE_PATH).href);
  const input = docx([
    '<w:p w14:paraId="A1B2C3D4" w14:textId="D4C3B2A1">',
    '<w:bookmarkStart w:name="YRTK_01_0001_alpha"/>',
    '<w:r><w:rPr><w:b/><w:color w:val="FF0000"/></w:rPr><w:t>Alpha</w:t></w:r>',
    '<w:r><w:t> beta</w:t></w:r>',
    '<w:r><w:rPr><w:rStyle w:val="CommentReference"/><w:sz w:val="24"/></w:rPr><w:commentReference w:id="7"/></w:r>',
    '</w:p>',
  ].join(''));
  const extracted = bridge.buildDocxReviewFormattingReturnCandidatesFromZipBytes(input, {
    fullManuscriptExportMap: exportMap(),
    cryptoPort,
  });

  assert.equal(extracted.status, 'ready', JSON.stringify(extracted, null, 2));
  assert.equal(extracted.candidates.length, 1);
  assert.deepEqual(extracted.candidates[0].targetScope, { type: 'scene', id: 'scene-a' });
  assert.equal(extracted.candidates[0].blockId, 'block-a-1');
  assert.equal(extracted.candidates[0].paragraphOrdinal, 0);
  assert.equal(extracted.candidates[0].selectedText, 'Alpha');
  assert.deepEqual(extracted.candidates[0].inline, {
    bold: { action: 'set', value: true },
    color: { action: 'set', value: '#ff0000' },
  });
});

test('N3 extractor coalesces adjacent Word run fragments with identical effective formatting', async () => {
  const bridge = await import(pathToFileURL(BRIDGE_PATH).href);
  const input = docx([
    '<w:p w14:paraId="A1B2C3D4" w14:textId="D4C3B2A1">',
    '<w:bookmarkStart w:name="YRTK_01_0001_alpha"/>',
    '<w:r><w:rPr><w:b/></w:rPr><w:t>Alpha</w:t></w:r>',
    '<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve"> beta</w:t></w:r>',
    '</w:p>',
  ].join(''));
  const extracted = bridge.buildDocxReviewFormattingReturnCandidatesFromZipBytes(input, {
    fullManuscriptExportMap: exportMap(),
    cryptoPort,
  });

  assert.equal(extracted.status, 'ready', JSON.stringify(extracted, null, 2));
  assert.equal(extracted.candidates.length, 1, JSON.stringify(extracted, null, 2));
  assert.equal(extracted.candidates[0].from, 0);
  assert.equal(extracted.candidates[0].to, 10);
  assert.equal(extracted.candidates[0].selectedText, 'Alpha beta');
  assert.deepEqual(extracted.candidates[0].inline, {
    bold: { action: 'set', value: true },
  });
});

test('N3 extractor fails closed on unresolved block authority and routes duplicate text by parser offsets', async () => {
  const bridge = await import(pathToFileURL(BRIDGE_PATH).href);
  const unresolved = bridge.buildDocxReviewFormattingReturnCandidatesFromZipBytes(docx(
    '<w:p><w:r><w:rPr><w:i/></w:rPr><w:t>Alpha</w:t></w:r></w:p>',
  ), { fullManuscriptExportMap: exportMap(), cryptoPort });
  assert.equal(unresolved.candidates.length, 0);
  // MATCH-01 (M2): a paragraph with no declared bookmark / still-known
  // paraId is unresolved as a typed unclassified block — index no longer
  // creates authority, so BASELINE_NOT_EXACT (an index-rescue artefact) is
  // replaced by the topology-level RTK_MATCH_UNCLASSIFIED_BLOCKS reason that
  // blocks ready.
  assert.equal(unresolved.diagnostics[0].code, 'RTK_MATCH_UNCLASSIFIED_BLOCKS');
  assert.notEqual(unresolved.status, 'ready');

  const duplicate = bridge.buildDocxReviewFormattingReturnCandidatesFromZipBytes(docx([
    '<w:p w14:paraId="A1B2C3D4">',
    '<w:r><w:rPr><w:i/></w:rPr><w:t>Alpha</w:t></w:r>',
    '<w:r><w:t> and Alpha</w:t></w:r>',
    '</w:p>',
  ].join('')), { fullManuscriptExportMap: exportMap('Alpha and Alpha'), cryptoPort });
  assert.equal(duplicate.candidates.length, 1);
  assert.equal(duplicate.candidates[0].from, 0);
  assert.equal(duplicate.candidates[0].to, 5);
});

test('N3 extractor accepts Word-regenerated native ids only when stable index and bookmark authority agree', async () => {
  const bridge = await import(pathToFileURL(BRIDGE_PATH).href);
  const regenerated = bridge.buildDocxReviewFormattingReturnCandidatesFromZipBytes(docx([
    '<w:p w14:paraId="FFFFFFFF" w14:textId="77777777">',
    '<w:bookmarkStart w:name="YRTK_01_0001_alpha"/>',
    '<w:r><w:rPr><w:b/></w:rPr><w:t>Alpha</w:t></w:r>',
    '<w:r><w:t> beta</w:t></w:r>',
    '</w:p>',
  ].join('')), { fullManuscriptExportMap: exportMap(), cryptoPort });
  assert.equal(regenerated.status, 'ready', JSON.stringify(regenerated, null, 2));
  assert.equal(regenerated.candidates.length, 1);
  assert.equal(regenerated.candidates[0].selectedText, 'Alpha');

  const wrongBookmark = bridge.buildDocxReviewFormattingReturnCandidatesFromZipBytes(docx([
    '<w:p w14:paraId="FFFFFFFF" w14:textId="77777777">',
    '<w:bookmarkStart w:name="YRTK_WRONG_AUTHORITY"/>',
    '<w:r><w:rPr><w:b/></w:rPr><w:t>Alpha</w:t></w:r>',
    '<w:r><w:t> beta</w:t></w:r>',
    '</w:p>',
  ].join('')), { fullManuscriptExportMap: exportMap(), cryptoPort });
  assert.equal(wrongBookmark.candidates.length, 0);
  // MATCH-01 (M2): an unknown bookmark + regenerated paraId is unresolved as a
  // typed unclassified block; index no longer rescues identity. The topology
  // reason RTK_MATCH_UNCLASSIFIED_BLOCKS blocks ready.
  assert.equal(wrongBookmark.diagnostics[0].code, 'RTK_MATCH_UNCLASSIFIED_BLOCKS');
  assert.notEqual(wrongBookmark.status, 'ready');
});

test('N3 extractor rejects colliding or conflicting native paragraph locators', async () => {
  const bridge = await import(pathToFileURL(BRIDGE_PATH).href);
  const collidingMap = exportMap('Alpha beta');
  collidingMap.scenes.push({
    sceneId: 'scene-b',
    sceneOrdinal: 1,
    blocks: [{
      blockId: 'block-b-1',
      paragraphId: 'paragraph-b-1',
      canonicalTextSha256: collidingMap.scenes[0].blocks[0].canonicalTextSha256,
      canonicalMarksSha256: collidingMap.scenes[0].blocks[0].canonicalMarksSha256,
      wordSignals: [
        { kind: 'w14ParaIdTextId', value: { paraId: 'A1B2C3D4', textId: '11111111' } },
        { kind: 'bookmarkName', value: { name: 'YRTK_02_0001_beta' } },
      ],
    }],
  });
  const collision = bridge.buildDocxReviewFormattingReturnCandidatesFromZipBytes(docx([
    '<w:p w14:paraId="A1B2C3D4" w14:textId="D4C3B2A1">',
    '<w:bookmarkStart w:name="YRTK_01_0001_alpha"/>',
    '<w:r><w:rPr><w:b/></w:rPr><w:t>Alpha</w:t></w:r>',
    '<w:r><w:t> beta</w:t></w:r>',
    '</w:p>',
  ].join('')), { fullManuscriptExportMap: collidingMap, cryptoPort });
  assert.equal(collision.candidates.length, 0);
  // MATCH-01: the ambiguous paraId still yields a per-paragraph AMBIGUOUS
  // diagnostic; the topology-level RTK_MATCH_UNCLASSIFIED_BLOCKS reason is
  // surfaced first because the unresolved paragraph blocks ready.
  assert.equal(collision.diagnostics[0].code, 'RTK_MATCH_UNCLASSIFIED_BLOCKS');
  assert.ok(collision.diagnostics.some((d) => d.code === 'RTK_FORMATTING_RETURN_BLOCK_LOCATOR_AMBIGUOUS'));

  const conflict = bridge.buildDocxReviewFormattingReturnCandidatesFromZipBytes(docx([
    '<w:p w14:paraId="A1B2C3D4" w14:textId="11111111">',
    '<w:r><w:rPr><w:i/></w:rPr><w:t>Alpha</w:t></w:r>',
    '<w:r><w:t> beta</w:t></w:r>',
    '</w:p>',
  ].join('')), { fullManuscriptExportMap: collidingMap, cryptoPort });
  assert.equal(conflict.candidates.length, 0);
  assert.equal(conflict.diagnostics[0].code, 'RTK_MATCH_UNCLASSIFIED_BLOCKS');
  assert.ok(conflict.diagnostics.some((d) => d.code === 'RTK_FORMATTING_RETURN_BLOCK_LOCATOR_AMBIGUOUS'));

  const indexConflictMap = exportMap('Alpha beta');
  indexConflictMap.scenes.push({
    sceneId: 'scene-b',
    sceneOrdinal: 1,
    blocks: [{
      blockId: 'block-b-1',
      paragraphId: 'paragraph-b-1',
      canonicalTextSha256: indexConflictMap.scenes[0].blocks[0].canonicalTextSha256,
      canonicalMarksSha256: indexConflictMap.scenes[0].blocks[0].canonicalMarksSha256,
      wordSignals: [{ kind: 'w14ParaIdTextId', value: { paraId: '99999999', textId: '88888888' } }],
    }],
  });
  const swapped = bridge.buildDocxReviewFormattingReturnCandidatesFromZipBytes(docx([
    '<w:p w14:paraId="99999999" w14:textId="88888888">',
    '<w:r><w:rPr><w:i/></w:rPr><w:t>Alpha</w:t></w:r><w:r><w:t> beta</w:t></w:r>',
    '</w:p>',
  ].join('')), { fullManuscriptExportMap: indexConflictMap, cryptoPort });
  assert.equal(swapped.candidates.length, 0);
  // MATCH-01: a known index that names a different source block than the
  // paraId identity is a typed contradiction; the topology-level unclassified
  // reason surfaces first, the per-paragraph CONFLICT diagnostic follows.
  assert.equal(swapped.diagnostics[0].code, 'RTK_MATCH_UNCLASSIFIED_BLOCKS');
  assert.ok(swapped.diagnostics.some((d) => d.code === 'RTK_FORMATTING_RETURN_BLOCK_LOCATOR_CONFLICT'));
});

test('N3 extractor rejects formatting when returned paragraph text or baseline marks are not exact', async () => {
  const bridge = await import(pathToFileURL(BRIDGE_PATH).href);
  const input = docx([
    '<w:p w14:paraId="A1B2C3D4" w14:textId="D4C3B2A1">',
    '<w:r><w:rPr><w:b/></w:rPr><w:t>Changed</w:t></w:r>',
    '</w:p>',
  ].join(''));
  const textMismatch = bridge.buildDocxReviewFormattingReturnCandidatesFromZipBytes(input, {
    fullManuscriptExportMap: exportMap('Alpha'),
    cryptoPort,
  });
  assert.equal(textMismatch.candidates.length, 0);
  assert.equal(textMismatch.diagnostics[0].code, 'RTK_FORMATTING_RETURN_BASELINE_NOT_EXACT');

  const markedBaseline = exportMap('Changed');
  markedBaseline.scenes[0].blocks[0].canonicalMarksSha256 = cryptoPort.sha256Json({ marks: ['bold'] });
  const marksMismatch = bridge.buildDocxReviewFormattingReturnCandidatesFromZipBytes(input, {
    fullManuscriptExportMap: markedBaseline,
    cryptoPort,
  });
  assert.equal(marksMismatch.candidates.length, 0);
  assert.equal(marksMismatch.diagnostics[0].code, 'RTK_FORMATTING_RETURN_BASELINE_NOT_EXACT');
});

test('N3 extractor blocks an unsupported run as one typed unit without partial formatting', async () => {
  const bridge = await import(pathToFileURL(BRIDGE_PATH).href);
  const input = docx([
    '<w:p w14:paraId="A1B2C3D4" w14:textId="D4C3B2A1">',
    '<w:r><w:rPr><w:b/><w:vertAlign w:val="superscript"/></w:rPr><w:t>Alpha</w:t></w:r>',
    '<w:r><w:t> beta</w:t></w:r>',
    '</w:p>',
  ].join(''));
  const extracted = bridge.buildDocxReviewFormattingReturnCandidatesFromZipBytes(input, {
    fullManuscriptExportMap: exportMap(),
    cryptoPort,
  });
  assert.equal(extracted.candidates.length, 0);
  assert.equal(extracted.diagnostics.some((item) => item.code === 'RTK_FORMATTING_RETURN_UNSUPPORTED_RUN_FORMATTING'), true);
});

test('N3 FormatIR distinguishes a rich no-op from bold removal and paragraph alignment change', async () => {
  const bridge = await import(pathToFileURL(BRIDGE_PATH).href);
  const text = 'Bold plain';
  const formatIr = {
    schemaVersion: 'yalken.rtk.format-ir.v1',
    paragraph: { textAlign: 'center' },
    runs: [
      { from: 0, to: 4, text: 'Bold', inline: { bold: true } },
      { from: 4, to: 10, text: ' plain', inline: {} },
    ],
  };
  const map = richExportMap(text, formatIr);
  const block = {
    ...map.scenes[0].blocks[0],
    paraId: 'A1B2C3D4',
    textId: 'D4C3B2A1',
    text,
    formatIr,
  };
  const noOp = bridge.buildDocxReviewFormattingReturnCandidatesFromZipBytes(
    buildDocxReviewPacketBuffer({
      blocks: [block],
      customProperties: [
        { name: 'YRTK_C01_AUTH', value: 'YRTK1.test' },
        { name: 'YRTK2_TOKEN', value: 'YRTK2.test' },
      ],
    }),
    { fullManuscriptExportMap: map, cryptoPort },
  );
  assert.equal(noOp.candidates.length, 0, JSON.stringify(noOp, null, 2));
  assert.equal(noOp.diagnostics.length, 0, JSON.stringify(noOp, null, 2));

  const changed = bridge.buildDocxReviewFormattingReturnCandidatesFromZipBytes(docx([
    '<w:p w14:paraId="A1B2C3D4" w14:textId="D4C3B2A1">',
    '<w:pPr><w:jc w:val="left"/></w:pPr>',
    '<w:r><w:t>Bold</w:t></w:r><w:r><w:t xml:space="preserve"> plain</w:t></w:r>',
    '</w:p>',
  ].join('')), { fullManuscriptExportMap: map, cryptoPort });
  assert.equal(changed.candidates.length, 1, JSON.stringify(changed, null, 2));
  assert.equal(changed.diagnostics.some((item) => (
    item.code === 'RTK_FORMATTING_RETURN_EFFECTIVE_RUN_STYLE_UNRESOLVED'
    && item.keys.includes('bold')
  )), true, JSON.stringify(changed, null, 2));
  const paragraph = changed.candidates.find((candidate) => Object.keys(candidate.paragraph).length > 0);
  assert.deepEqual(paragraph.paragraph, { textAlign: { action: 'set', value: 'left' } });
  assert.equal(paragraph.sourceRawSha256, map.scenes[0].rawSha256);
  assert.equal(paragraph.sourceSceneRevision, map.scenes[0].sceneRevision);
});

test('N3 FormatIR keeps a hard break inside one paragraph and fails closed on inherited Word styles', async () => {
  const bridge = await import(pathToFileURL(BRIDGE_PATH).href);
  const text = 'Alpha\nBeta';
  const formatIr = {
    schemaVersion: 'yalken.rtk.format-ir.v1',
    paragraph: {},
    runs: [
      { from: 0, to: 5, text: 'Alpha', inline: {} },
      { from: 5, to: 6, text: '\n', inline: {} },
      { from: 6, to: 10, text: 'Beta', inline: {} },
    ],
  };
  const map = richExportMap(text, formatIr);
  const changed = bridge.buildDocxReviewFormattingReturnCandidatesFromZipBytes(docx([
    '<w:p w14:paraId="A1B2C3D4" w14:textId="D4C3B2A1">',
    '<w:r><w:t>Alpha</w:t></w:r><w:r><w:br/></w:r>',
    '<w:r><w:rPr><w:i/></w:rPr><w:t>Beta</w:t></w:r>',
    '</w:p>',
  ].join('')), { fullManuscriptExportMap: map, cryptoPort });
  assert.equal(changed.candidates.length, 1, JSON.stringify(changed, null, 2));
  assert.equal(changed.candidates[0].paragraphOrdinal, 0);
  assert.equal(changed.candidates[0].from, 6);
  assert.equal(changed.candidates[0].selectedText, 'Beta');

  const inherited = bridge.buildDocxReviewFormattingReturnCandidatesFromZipBytes(docx([
    '<w:p w14:paraId="A1B2C3D4" w14:textId="D4C3B2A1">',
    '<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>',
    '<w:r><w:rStyle w:val="Emphasis"/><w:t>Alpha</w:t></w:r>',
    '<w:r><w:br/></w:r><w:r><w:t>Beta</w:t></w:r>',
    '</w:p>',
  ].join('')), { fullManuscriptExportMap: map, cryptoPort });
  assert.equal(inherited.candidates.length, 0);
  assert.equal(inherited.diagnostics[0].code, 'RTK_FORMATTING_RETURN_UNSUPPORTED_WORD_FORMATTING');

  for (const properties of [
    '<w:rFonts w:asciiTheme="majorHAnsi"/>',
    '<w:color w:themeColor="accent1"/>',
    '<w:u w:val="words"/>',
  ]) {
    const unresolvedEffectiveStyle = bridge.buildDocxReviewFormattingReturnCandidatesFromZipBytes(docx([
      '<w:p w14:paraId="A1B2C3D4" w14:textId="D4C3B2A1">',
      `<w:r><w:rPr>${properties}</w:rPr><w:t>Alpha</w:t></w:r>`,
      '<w:r><w:br/></w:r><w:r><w:t>Beta</w:t></w:r>',
      '</w:p>',
    ].join('')), { fullManuscriptExportMap: map, cryptoPort });
    assert.equal(unresolvedEffectiveStyle.candidates.length, 0, properties);
    assert.equal(
      unresolvedEffectiveStyle.diagnostics.some((item) => item.code === 'RTK_FORMATTING_RETURN_UNSUPPORTED_RUN_FORMATTING'),
      true,
      properties,
    );
  }
});

test('N3 transformer preserves rich document, metadata, cards and visible Unicode text', async () => {
  const runtime = await import(pathToFileURL(RUNTIME_PATH).href);
  const envelope = await import(pathToFileURL(ENVELOPE_PATH).href);
  const visible = 'Cafe\u0301 👩‍💻 text';
  const base = envelope.composeObservablePayload({
    doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: visible }] }] },
    metaEnabled: true,
    meta: { synopsis: 'Keep', status: 'draft', tags: { pov: 'A', line: 'B', place: 'C' } },
    cards: [{ title: 'Card', text: 'Keep card', tags: 'x' }],
  });
  const transformed = runtime.applyFormattingOperationsToObservableContent(base, [{
    operationId: 'format-1',
    sceneId: 'scene-a',
    blockId: 'block-a-1',
    paragraphOrdinal: 0,
    from: 0,
    to: 5,
    selectedText: 'Cafe\u0301',
    inline: {
      italic: { action: 'set', value: true },
      highlight: { action: 'set', value: '#ffff00' },
    },
  }]);
  assert.equal(transformed.ok, true, JSON.stringify(transformed, null, 2));
  const parsed = envelope.parseObservablePayload(transformed.content);
  assert.equal(parsed.text, visible);
  assert.equal(parsed.meta.synopsis, 'Keep');
  assert.equal(parsed.cards[0].text, 'Keep card');
  assert.deepEqual(parsed.doc.content[0].content[0].marks, [
    { type: 'highlight', attrs: { color: '#ffff00' } },
    { type: 'italic' },
  ]);
});

test('N3 transformer removes explicit false marks and blocks grapheme splits', async () => {
  const runtime = await import(pathToFileURL(RUNTIME_PATH).href);
  const envelope = await import(pathToFileURL(ENVELOPE_PATH).href);
  const base = envelope.composeObservablePayload({
    doc: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bold', marks: [{ type: 'bold' }] }] }],
    },
  });
  const removed = runtime.applyFormattingOperationsToObservableContent(base, [{
    operationId: 'format-remove', sceneId: 'scene-a', blockId: 'block-a-1', paragraphOrdinal: 0,
    from: 0, to: 4, selectedText: 'Bold', inline: { bold: { action: 'remove' } },
  }]);
  assert.equal(removed.ok, true);
  assert.equal(removed.doc.content[0].content[0].marks, undefined);

  const emoji = envelope.composeObservablePayload({ text: '👩‍💻 test' });
  const split = runtime.applyFormattingOperationsToObservableContent(emoji, [{
    operationId: 'format-split', sceneId: 'scene-a', blockId: 'block-a-1', paragraphOrdinal: 0,
    from: 0, to: 2, selectedText: '👩', inline: { bold: { action: 'set', value: true } },
  }]);
  assert.equal(split.ok, false);
  assert.equal(split.code, 'RTK_FORMATTING_GRAPHEME_SPLIT_BLOCKED');

  const segmenterDescriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');
  Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: undefined });
  try {
    const unavailable = runtime.applyFormattingOperationsToObservableContent(base, [{
      operationId: 'format-no-segmenter', sceneId: 'scene-a', blockId: 'block-a-1', paragraphOrdinal: 0,
      from: 0, to: 4, selectedText: 'Bold', inline: { italic: { action: 'set', value: true } },
    }]);
    assert.equal(unavailable.ok, false);
    assert.equal(unavailable.code, 'RTK_FORMATTING_GRAPHEME_SEGMENTER_REQUIRED');
  } finally {
    Object.defineProperty(Intl, 'Segmenter', segmenterDescriptor);
  }
});

function runtimeInput(projectRoot, scenePathBySceneId, requestId = 'request-format-1') {
  const revisionBySceneId = Object.fromEntries(Object.entries(scenePathBySceneId).map(([sceneId, scenePath]) => {
    const content = fs.readFileSync(scenePath, 'utf8');
    return [sceneId, `sha256:${cryptoPort.sha256Text(content)}`];
  }));
  return {
    commandId: 'cmd.rtk.review.applyMultiSceneFormattingReturn',
    callerRole: 'main',
    commandAuthority: {
      issuer: 'main',
      intent: 'rtk.formattingApply',
      commandId: 'cmd.rtk.review.applyMultiSceneFormattingReturn',
    },
    projectId: 'project-formatting-n3',
    projectRoot,
    requestId,
    returnArtifactSha256: `sha256:${'a'.repeat(64)}`,
    scenePathBySceneId,
    previewConfirmed: true,
    operations: [
      {
        operationId: `${requestId}-scene-a`, sceneId: 'scene-a', blockId: 'block-a', paragraphOrdinal: 0,
        from: 0, to: 5, selectedText: 'Alpha', inline: { bold: { action: 'set', value: true } },
        sourceAuthority: 'authenticated-full-manuscript-export-map-format-ir-v1',
        sourceSceneRevision: revisionBySceneId['scene-a'],
        sourceRawSha256: revisionBySceneId['scene-a'],
      },
      {
        operationId: `${requestId}-scene-b`, sceneId: 'scene-b', blockId: 'block-b', paragraphOrdinal: 0,
        from: 0, to: 4, selectedText: 'Beta', inline: { italic: { action: 'set', value: true } },
        sourceAuthority: 'authenticated-full-manuscript-export-map-format-ir-v1',
        sourceSceneRevision: revisionBySceneId['scene-b'],
        sourceRawSha256: revisionBySceneId['scene-b'],
      },
    ],
  };
}

function runtimeProject() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-n3-formatting-'));
  const scenesRoot = path.join(projectRoot, 'roman');
  fs.mkdirSync(scenesRoot);
  const sceneA = path.join(scenesRoot, 'scene-a.txt');
  const sceneB = path.join(scenesRoot, 'scene-b.txt');
  const sceneC = path.join(scenesRoot, 'scene-c.txt');
  fs.writeFileSync(sceneA, 'Alpha scene', 'utf8');
  fs.writeFileSync(sceneB, 'Beta scene', 'utf8');
  fs.writeFileSync(sceneC, 'Alpha scene', 'utf8');
  return {
    projectRoot,
    sceneA,
    sceneB,
    sceneC,
    scenePathBySceneId: { 'scene-a': sceneA, 'scene-b': sceneB, 'scene-c': sceneC },
  };
}

test('N3 runtime atomically applies two scenes and replays from persisted effect authority', async () => {
  const runtime = await import(pathToFileURL(RUNTIME_PATH).href);
  const envelope = await import(pathToFileURL(ENVELOPE_PATH).href);
  const project = runtimeProject();
  const input = runtimeInput(project.projectRoot, project.scenePathBySceneId);
  const applied = await runtime.applyMultiSceneFormattingReturnRuntime(input, { cryptoPort });
  assert.equal(applied.status, 'applied', JSON.stringify(applied, null, 2));
  assert.equal(applied.readback.every((item) => item.matchesAfter), true);
  assert.equal(envelope.parseObservablePayload(fs.readFileSync(project.sceneA, 'utf8')).text, 'Alpha scene');
  assert.equal(envelope.parseObservablePayload(fs.readFileSync(project.sceneB, 'utf8')).text, 'Beta scene');

  const replayed = await runtime.applyMultiSceneFormattingReturnRuntime(input, { cryptoPort });
  assert.equal(replayed.status, 'replay', JSON.stringify(replayed, null, 2));
  assert.equal(replayed.writerCalled, false);
});

test('N3 runtime applies a formatting return that changes only one canonical roman scene', async () => {
  const runtime = await import(pathToFileURL(RUNTIME_PATH).href);
  const project = runtimeProject();
  const input = runtimeInput(project.projectRoot, project.scenePathBySceneId, 'request-format-single-scene');
  input.operations = input.operations.filter((operation) => operation.sceneId === 'scene-a');
  const applied = await runtime.applyMultiSceneFormattingReturnRuntime(input, { cryptoPort });
  assert.equal(applied.status, 'applied', JSON.stringify(applied, null, 2));
  assert.equal(applied.readback.length, 1);
  assert.equal(applied.readback[0].sceneId, 'scene-a');
});

test('N3 runtime rolls both scenes back after a deterministic mid-transaction killpoint', async () => {
  const runtime = await import(pathToFileURL(RUNTIME_PATH).href);
  const project = runtimeProject();
  const beforeA = fs.readFileSync(project.sceneA, 'utf8');
  const beforeB = fs.readFileSync(project.sceneB, 'utf8');
  const blocked = await runtime.applyMultiSceneFormattingReturnRuntime(
    runtimeInput(project.projectRoot, project.scenePathBySceneId, 'request-format-killpoint'),
    { cryptoPort, simulateFailureAtSceneIndex: 0 },
  );
  assert.equal(blocked.code, 'RTK_FORMATTING_WRITE_FAILED_ROLLED_BACK', JSON.stringify(blocked, null, 2));
  assert.equal(fs.readFileSync(project.sceneA, 'utf8'), beforeA);
  assert.equal(fs.readFileSync(project.sceneB, 'utf8'), beforeB);
  assert.equal(blocked.restored.every((item) => item.restored), true);
});

test('N3 runtime recovers an abrupt partial transaction before applying and replaying it', async () => {
  const runtime = await import(pathToFileURL(RUNTIME_PATH).href);
  const project = runtimeProject();
  const input = runtimeInput(project.projectRoot, project.scenePathBySceneId, 'request-format-abrupt');
  await assert.rejects(
    runtime.applyMultiSceneFormattingReturnRuntime(input, {
      cryptoPort,
      simulateAbruptFailureAtSceneIndex: 0,
    }),
    /RTK_FORMATTING_SIMULATED_ABRUPT_PROCESS_EXIT/u,
  );
  assert.notEqual(fs.readFileSync(project.sceneA, 'utf8'), 'Alpha scene');
  assert.equal(fs.readFileSync(project.sceneB, 'utf8'), 'Beta scene');

  const recovered = await runtime.applyMultiSceneFormattingReturnRuntime(input, { cryptoPort });
  assert.equal(recovered.status, 'applied', JSON.stringify(recovered, null, 2));
  assert.equal(recovered.recoveryOutcome, 'rolled-back');
  const replayed = await runtime.applyMultiSceneFormattingReturnRuntime(input, { cryptoPort });
  assert.equal(replayed.status, 'replay');
  assert.equal(replayed.writerCalled, false);
});

test('N3 startup recovery rolls back a real child process killed after its first scene commit', async () => {
  const runtime = await import(pathToFileURL(RUNTIME_PATH).href);
  const project = runtimeProject();
  const input = runtimeInput(project.projectRoot, project.scenePathBySceneId, 'request-format-sigkill');
  const childRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-n3-sigkill-child-'));
  const inputPath = path.join(childRoot, 'input.json');
  const childPath = path.join(childRoot, 'child.mjs');
  fs.writeFileSync(inputPath, JSON.stringify(input), 'utf8');
  fs.writeFileSync(childPath, [
    "import fs from 'node:fs';",
    "import crypto from 'node:crypto';",
    "import { pathToFileURL } from 'node:url';",
    'const stableJson = (value) => Array.isArray(value)',
    "  ? `[${value.map((item) => stableJson(item)).join(',')}]`",
    "  : value && typeof value === 'object'",
    "    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`",
    '    : JSON.stringify(value);',
    'const cryptoPort = {',
    "  sha256Text(value) { return crypto.createHash('sha256').update(Buffer.from(String(value), 'utf8')).digest('hex'); },",
    '  sha256Json(value) { return `sha256:${this.sha256Text(stableJson(value))}`; },',
    '};',
    'const runtime = await import(pathToFileURL(process.argv[2]).href);',
    "const input = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));",
    'await runtime.applyMultiSceneFormattingReturnRuntime(input, {',
    '  cryptoPort,',
    '  afterSceneWrite: async ({ index }) => {',
    "    if (index === 0) process.stdout.write('AFTER_FIRST_SCENE\\n');",
    '    if (index === 0) setInterval(() => {}, 1000);',
    '    if (index === 0) await new Promise(() => {});',
    '  },',
    '});',
  ].join('\n'), 'utf8');
  const child = spawn(process.execPath, [childPath, RUNTIME_PATH, inputPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => reject(new Error(`SIGKILL child timeout: ${stderr}`)), 30_000);
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
      if (stdout.includes('AFTER_FIRST_SCENE')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (!stdout.includes('AFTER_FIRST_SCENE')) {
        clearTimeout(timeout);
        reject(new Error(`SIGKILL child exited early: code=${code} signal=${signal} stderr=${stderr}`));
      }
    });
  });
  const concurrent = await runtime.applyMultiSceneFormattingReturnRuntime(
    runtimeInput(project.projectRoot, project.scenePathBySceneId, 'request-format-concurrent-process'),
    { cryptoPort },
  );
  assert.equal(concurrent.ok, false, JSON.stringify(concurrent, null, 2));
  assert.equal(concurrent.code, 'RTK_FORMATTING_PROJECT_LEASE_HELD');
  child.kill('SIGKILL');
  await new Promise((resolve) => child.once('close', resolve));
  assert.notEqual(fs.readFileSync(project.sceneA, 'utf8'), 'Alpha scene');
  assert.equal(fs.readFileSync(project.sceneB, 'utf8'), 'Beta scene');

  const recovered = await runtime.reconcileFormattingReturnRuntimeAtStartup({
    projectId: 'project-formatting-n3',
    projectRoot: project.projectRoot,
    scenePathBySceneId: project.scenePathBySceneId,
    startupSingleInstanceAuthority: true,
  }, { cryptoPort });
  assert.equal(recovered.ok, true, JSON.stringify(recovered, null, 2));
  assert.equal(recovered.recoveryOutcome, 'rolled-back');
  assert.equal(recovered.staleLeaseRecovered, true);
  assert.equal(fs.readFileSync(project.sceneA, 'utf8'), 'Alpha scene');
  assert.equal(fs.readFileSync(project.sceneB, 'utf8'), 'Beta scene');
});

test('N3 runtime replays one effect under a new request id and does not write twice', async () => {
  const runtime = await import(pathToFileURL(RUNTIME_PATH).href);
  const project = runtimeProject();
  const firstInput = runtimeInput(project.projectRoot, project.scenePathBySceneId, 'request-format-effect-a');
  const applied = await runtime.applyMultiSceneFormattingReturnRuntime(firstInput, { cryptoPort });
  assert.equal(applied.status, 'applied');
  const secondInput = {
    ...firstInput,
    requestId: 'request-format-effect-b',
  };
  const replayed = await runtime.applyMultiSceneFormattingReturnRuntime(secondInput, { cryptoPort });
  assert.equal(replayed.status, 'replay', JSON.stringify(replayed, null, 2));
  assert.equal(replayed.writerCalled, false);
});

test('N3 runtime rejects a product FormatIR operation after its observable scene baseline becomes stale', async () => {
  const runtime = await import(pathToFileURL(RUNTIME_PATH).href);
  const project = runtimeProject();
  const before = fs.readFileSync(project.sceneA, 'utf8');
  const input = runtimeInput(project.projectRoot, project.scenePathBySceneId, 'request-format-stale-source');
  input.operations = input.operations.filter((operation) => operation.sceneId === 'scene-a');
  input.operations[0] = {
    ...input.operations[0],
    sourceAuthority: 'authenticated-full-manuscript-export-map-format-ir-v1',
    sourceSceneRevision: `sha256:${cryptoPort.sha256Text(before)}`,
    sourceRawSha256: `sha256:${cryptoPort.sha256Text(before)}`,
  };
  fs.writeFileSync(project.sceneA, 'Alpha scene changed outside Word', 'utf8');
  const blocked = await runtime.applyMultiSceneFormattingReturnRuntime(input, { cryptoPort });
  assert.equal(blocked.ok, false, JSON.stringify(blocked, null, 2));
  assert.equal(blocked.code, 'RTK_FORMATTING_SOURCE_SCENE_STALE');
  assert.equal(fs.readFileSync(project.sceneA, 'utf8'), 'Alpha scene changed outside Word');
});

test('N3 runtime rejects a recomputed recovery state containing a path outside scenes', async () => {
  const runtime = await import(pathToFileURL(RUNTIME_PATH).href);
  const project = runtimeProject();
  const outside = path.join(project.projectRoot, 'outside.md');
  fs.writeFileSync(outside, 'outside-safe', 'utf8');
  const recoveryRoot = path.join(project.projectRoot, '.yalken', 'recovery');
  fs.mkdirSync(recoveryRoot, { recursive: true });
  const sceneRecords = [
    { sceneId: 'scene-a', sceneRelativePath: '../outside.md', content: 'Alpha scene', operationId: 'tamper-a' },
    { sceneId: 'scene-b', sceneRelativePath: 'roman/scene-b.txt', content: 'Beta scene', operationId: 'tamper-b' },
  ].map((scene) => ({
    sceneId: scene.sceneId,
    sceneRelativePath: scene.sceneRelativePath,
    beforeContent: scene.content,
    afterContent: scene.content,
    beforeSha256: `sha256:${cryptoPort.sha256Text(scene.content)}`,
    afterSha256: `sha256:${cryptoPort.sha256Text(scene.content)}`,
    operationIds: [scene.operationId],
  }));
  const unsigned = {
    schemaVersion: 'yalken.rtk.formatting-return-state.v1',
    projectId: 'project-formatting-n3',
    generation: 1,
    activeTransaction: {
      requestId: 'tampered-request',
      effectDigest: `sha256:${'b'.repeat(64)}`,
      operationIds: ['tamper-a', 'tamper-b'],
      scenes: sceneRecords,
    },
    receiptsByRequestId: {},
    requestIdByEffectDigest: {},
    requestIdByOperationId: {},
    recoveredTransactions: [],
  };
  const state = { ...unsigned, stateDigest: cryptoPort.sha256Json(unsigned) };
  fs.writeFileSync(path.join(recoveryRoot, 'rtk-formatting-return-v1.json'), `${JSON.stringify(state)}\n`, 'utf8');

  const blocked = await runtime.applyMultiSceneFormattingReturnRuntime(
    runtimeInput(project.projectRoot, project.scenePathBySceneId, 'request-after-tamper'),
    { cryptoPort },
  );
  assert.equal(blocked.code, 'RTK_FORMATTING_STATE_INTEGRITY_INVALID');
  assert.equal(fs.readFileSync(outside, 'utf8'), 'outside-safe');
});

test('N3 runtime rejects a recomputed recovery state that retargets a scene inside scenes', async () => {
  const runtime = await import(pathToFileURL(RUNTIME_PATH).href);
  const project = runtimeProject();
  const input = runtimeInput(project.projectRoot, project.scenePathBySceneId, 'request-scene-retarget');
  await assert.rejects(
    runtime.applyMultiSceneFormattingReturnRuntime(input, {
      cryptoPort,
      simulateAbruptFailureAtSceneIndex: 0,
    }),
    /RTK_FORMATTING_SIMULATED_ABRUPT_PROCESS_EXIT/u,
  );
  const statePath = path.join(project.projectRoot, '.yalken', 'recovery', 'rtk-formatting-return-v1.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const sceneARecord = state.activeTransaction.scenes.find((scene) => scene.sceneId === 'scene-a');
  sceneARecord.sceneRelativePath = 'roman/scene-c.txt';
  const { stateDigest: _stateDigest, ...unsigned } = state;
  state.stateDigest = cryptoPort.sha256Json(unsigned);
  fs.writeFileSync(statePath, `${JSON.stringify(state)}\n`, 'utf8');

  const blocked = await runtime.applyMultiSceneFormattingReturnRuntime(input, { cryptoPort });
  assert.equal(blocked.code, 'RTK_FORMATTING_RECOVERY_STATE_DIVERGED', JSON.stringify(blocked, null, 2));
  assert.equal(fs.readFileSync(project.sceneC, 'utf8'), 'Alpha scene');
});

test('N3 runtime rejects a scene symlink that escapes the project root', async () => {
  const runtime = await import(pathToFileURL(RUNTIME_PATH).href);
  const project = runtimeProject();
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-n3-outside-'));
  const outsideScene = path.join(outsideRoot, 'outside.md');
  const symlinkScene = path.join(project.projectRoot, 'roman', 'scene-link.txt');
  fs.writeFileSync(outsideScene, 'Beta scene', 'utf8');
  fs.symlinkSync(outsideScene, symlinkScene);
  const blocked = await runtime.applyMultiSceneFormattingReturnRuntime(
    runtimeInput(project.projectRoot, { 'scene-a': project.sceneA, 'scene-b': symlinkScene }, 'request-format-symlink'),
    { cryptoPort },
  );
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'RTK_FORMATTING_SCENE_PATH_AUTHORITY_INVALID');
  assert.equal(fs.readFileSync(outsideScene, 'utf8'), 'Beta scene');
});

test('N3 runtime detects a parent-directory symlink swap before the first scene write', async () => {
  const runtime = await import(pathToFileURL(RUNTIME_PATH).href);
  const project = runtimeProject();
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-n3-parent-swap-outside-'));
  const outsideA = path.join(outsideRoot, 'scene-a.txt');
  const outsideB = path.join(outsideRoot, 'scene-b.txt');
  fs.writeFileSync(outsideA, 'outside-a-safe', 'utf8');
  fs.writeFileSync(outsideB, 'outside-b-safe', 'utf8');
  const romanRoot = path.join(project.projectRoot, 'roman');
  const preservedRomanRoot = path.join(project.projectRoot, 'roman-preserved');
  const blocked = await runtime.applyMultiSceneFormattingReturnRuntime(
    runtimeInput(project.projectRoot, project.scenePathBySceneId, 'request-format-parent-swap'),
    {
      cryptoPort,
      beforeSceneWrite: async ({ index }) => {
        if (index !== 0) return;
        fs.renameSync(romanRoot, preservedRomanRoot);
        fs.symlinkSync(outsideRoot, romanRoot);
      },
    },
  );
  assert.equal(blocked.ok, false, JSON.stringify(blocked, null, 2));
  assert.equal(blocked.code, 'RTK_FORMATTING_RECOVERY_ROLLBACK_FAILED');
  assert.equal(fs.readFileSync(outsideA, 'utf8'), 'outside-a-safe');
  assert.equal(fs.readFileSync(outsideB, 'utf8'), 'outside-b-safe');
  assert.equal(fs.readFileSync(path.join(preservedRomanRoot, 'scene-a.txt'), 'utf8'), 'Alpha scene');
  assert.equal(fs.readFileSync(path.join(preservedRomanRoot, 'scene-b.txt'), 'utf8'), 'Beta scene');
});

test('N3 runtime preserves a concurrent scene edit made at the atomic rename boundary', async () => {
  const runtime = await import(pathToFileURL(RUNTIME_PATH).href);
  const project = runtimeProject();
  const input = runtimeInput(project.projectRoot, project.scenePathBySceneId, 'request-format-cas-race');
  input.operations = input.operations.filter((operation) => operation.sceneId === 'scene-a');
  let injected = false;
  const blocked = await runtime.applyMultiSceneFormattingReturnRuntime(input, {
    cryptoPort,
    beforeAtomicSceneRename: async ({ phase, sceneId }) => {
      if (!injected && phase === 'commit' && sceneId === 'scene-a') {
        injected = true;
        fs.writeFileSync(project.sceneA, 'Concurrent author edit', 'utf8');
      }
    },
  });
  assert.equal(blocked.ok, false, JSON.stringify(blocked, null, 2));
  assert.equal(blocked.code, 'RTK_FORMATTING_CONCURRENT_SCENE_CHANGE_BLOCKED');
  assert.equal(fs.readFileSync(project.sceneA, 'utf8'), 'Concurrent author edit');
  assert.equal(blocked.conflicts[0].sceneId, 'scene-a');
});

test('N3 runtime rejects a parent-directory swap at the atomic rename boundary', async () => {
  const runtime = await import(pathToFileURL(RUNTIME_PATH).href);
  const project = runtimeProject();
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-n3-atomic-swap-outside-'));
  const outsideA = path.join(outsideRoot, 'scene-a.txt');
  fs.writeFileSync(outsideA, 'outside-safe', 'utf8');
  const romanRoot = path.join(project.projectRoot, 'roman');
  const preservedRomanRoot = path.join(project.projectRoot, 'roman-preserved');
  const input = runtimeInput(project.projectRoot, project.scenePathBySceneId, 'request-format-atomic-path-swap');
  input.operations = input.operations.filter((operation) => operation.sceneId === 'scene-a');
  let injected = false;
  const blocked = await runtime.applyMultiSceneFormattingReturnRuntime(input, {
    cryptoPort,
    beforeAtomicSceneRename: async ({ phase, sceneId }) => {
      if (!injected && phase === 'commit' && sceneId === 'scene-a') {
        injected = true;
        fs.renameSync(romanRoot, preservedRomanRoot);
        fs.symlinkSync(outsideRoot, romanRoot);
      }
    },
  });
  assert.equal(blocked.ok, false, JSON.stringify(blocked, null, 2));
  assert.equal(blocked.code, 'RTK_FORMATTING_RECOVERY_ROLLBACK_FAILED');
  assert.equal(fs.readFileSync(outsideA, 'utf8'), 'outside-safe');
  assert.equal(fs.readFileSync(path.join(preservedRomanRoot, 'scene-a.txt'), 'utf8'), 'Alpha scene');
});

test('N3 persisted replay inspection revalidates receipt and canonical scene readback after reopen', async () => {
  const runtime = await import(pathToFileURL(RUNTIME_PATH).href);
  const project = runtimeProject();
  const input = runtimeInput(project.projectRoot, project.scenePathBySceneId, 'request-format-reopen-query');
  const applied = await runtime.applyMultiSceneFormattingReturnRuntime(input, { cryptoPort });
  assert.equal(applied.status, 'applied', JSON.stringify(applied, null, 2));
  const inspected = await runtime.inspectFormattingReturnRuntimeState({
    projectId: input.projectId,
    projectRoot: project.projectRoot,
    scenePathBySceneId: project.scenePathBySceneId,
    startupSingleInstanceAuthority: true,
  }, { cryptoPort });
  assert.equal(inspected.ok, true, JSON.stringify(inspected, null, 2));
  assert.equal(inspected.status, 'replayed');
  assert.equal(inspected.writerCalled, false);
  assert.equal(inspected.replaySnapshot.sceneReadback.every((item) => item.matchesAfter), true);

  fs.writeFileSync(project.sceneA, 'Concurrent edit after receipt', 'utf8');
  const diverged = await runtime.inspectFormattingReturnRuntimeState({
    projectId: input.projectId,
    projectRoot: project.projectRoot,
    scenePathBySceneId: project.scenePathBySceneId,
    startupSingleInstanceAuthority: true,
  }, { cryptoPort });
  assert.equal(diverged.ok, true, JSON.stringify(diverged, null, 2));
  assert.equal(diverged.status, 'recovery-required');
  assert.equal(diverged.replaySnapshot.replayVerified, false);
});

test('N3 runtime rejects mismatched scene revision authority before any write', async () => {
  const runtime = await import(pathToFileURL(RUNTIME_PATH).href);
  const project = runtimeProject();
  const input = runtimeInput(project.projectRoot, project.scenePathBySceneId, 'request-format-revision-mismatch');
  input.operations = input.operations.filter((operation) => operation.sceneId === 'scene-a');
  input.operations[0].sourceSceneRevision = `sha256:${'f'.repeat(64)}`;
  const blocked = await runtime.applyMultiSceneFormattingReturnRuntime(input, { cryptoPort });
  assert.equal(blocked.ok, false, JSON.stringify(blocked, null, 2));
  assert.equal(blocked.code, 'RTK_FORMATTING_SOURCE_REVISION_INVALID');
  assert.equal(fs.readFileSync(project.sceneA, 'utf8'), 'Alpha scene');
});

test('N3 formatting command is admitted only through the typed Command Surface Kernel', async () => {
  const { ALLOWED_COMMAND_IDS, createCommandSurfaceKernel } = require('../../src/command/commandSurfaceKernel.js');
  const commandId = 'cmd.rtk.review.applyMultiSceneFormattingReturn';
  assert.equal(ALLOWED_COMMAND_IDS.includes(commandId), true);
  const kernel = createCommandSurfaceKernel({
    [commandId]: async () => ({
      ok: true,
      type: 'yalken.rtk.formattingReturnRuntime',
      status: 'replay',
      code: 'RTK_FORMATTING_ALREADY_APPLIED',
      reason: 'RTK_FORMATTING_ALREADY_APPLIED',
    }),
  });
  const dispatched = await kernel.dispatch(commandId, {});
  assert.equal(dispatched.ok, true);
  assert.equal(dispatched.status, 'replay');
});

test('N3 product route exposes a working Review control without renderer-owned authority', () => {
  const mainSource = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  const rendererSource = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'editor.js'), 'utf8');
  const bridgeSource = fs.readFileSync(path.join(ROOT, 'src', 'io', 'revisionBridge', 'index.mjs'), 'utf8');
  const testCatalog = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'docs', 'OPS', 'RTK', 'RTK_TEST_GRAPH_CATALOG_V1.json'),
    'utf8',
  ));

  assert.match(mainSource, /prepareAuthenticatedDocxFormattingReturnProductPath\s*\(/u);
  // EVID-01 Pass 2: the production formatting-return path now consumes the
  // verified packet projection (buildDocxReviewFormattingReturnCandidatesFromEvidence)
  // instead of re-scanning the DOCX bytes. Pin the packet-based builder call.
  assert.match(mainSource, /buildDocxReviewFormattingReturnCandidatesFromEvidence\(formattingPacket,\s*\{[\s\S]*?budgets,/u);
  assert.match(mainSource, /dispatchCommandSurfaceKernel\(\s*COMMAND_SURFACE_KERNEL_COMMAND_IDS\.RTK_REVIEW_APPLY_MULTI_SCENE_FORMATTING_RETURN/u);
  assert.match(mainSource, /handleReviewSurfaceApplyFormattingReturnCommandSurface[\s\S]*?queueDiskOperation\(async \(\) =>[\s\S]*?'rtk-formatting-return'\)/u);
  assert.match(mainSource, /E_RTK_FORMATTING_RETURN_DIRTY_EDITOR_BLOCKED/u);
  assert.match(mainSource, /writerAuthorityExposedToRenderer:\s*false/u);
  assert.match(mainSource, /rendererAuthority:\s*false/u);
  assert.match(mainSource, /makeCommandBridgeSuccess\(result\)/u);
  assert.match(mainSource, /makeCommandBridgeFailure\(reason,\s*result\)/u);
  assert.match(mainSource, /makeFormattingReturnBridgeReviewSurface\(reviewSurface\)/u);
  assert.match(mainSource, /deferRtkFormattingReturnEditorSyncAfterBridgeReply\(\{[\s\S]*?bridgeReviewSurface/u);
  assert.match(mainSource, /RTK_FORMATTING_RETURN_EDITOR_SYNC_DEFERRED_AFTER_BRIDGE_REPLY/u);
  assert.match(mainSource, /'cmd\.project\.review\.applyFormattingReturn':\s*async/u);
  assert.match(bridgeSource, /extractReviewTransportFormattingRunsV2\(documentXml/u);
  assert.doesNotMatch(rendererSource, /scenePathBySceneId/u);
  assert.doesNotMatch(rendererSource, /projectRoot[^A-Za-z]/u);
  assert.match(rendererSource, /data-review-apply-formatting-return/u);
  assert.match(rendererSource, /data-review-inspect-formatting-replay/u);
  assert.match(rendererSource, /REVIEW_SURFACE_FORMATTING_REPLAY_INSPECT_COMMAND_ID/u);
  assert.match(mainSource, /'cmd\.project\.review\.inspectFormattingReturnReplay':\s*async/u);
  assert.match(rendererSource, /REVIEW_SURFACE_FORMATTING_APPLY_COMMAND_ID/u);
  assert.match(rendererSource, /setReviewFormattingEditorLock\(true\)[\s\S]*?finally[\s\S]*?setReviewFormattingEditorLock\(false\)/u);
  assert.match(rendererSource, /replayVerified === true/u);
  assert.equal(
    JSON.stringify(testCatalog).includes('rtk-word-n3-formatting-return.contract.test.js'),
    true,
  );
});

test('N3 command bridge response boundary serializes durable apply results after replay verification', () => {
  const {
    makeCommandBridgeFailure,
    makeCommandBridgeSuccess,
    makeFormattingReturnBridgeReviewSurface,
    toCommandBridgeSerializableValue,
  } = require('../../src/shared/commandBridgeResponse.cjs');
  const circular = { status: 'applied-and-replayed' };
  circular.self = circular;
  const success = makeCommandBridgeSuccess({
    ok: true,
    type: 'yalken.rtk.formattingReturnUiApply',
    status: 'applied-and-replayed',
    code: 'RTK_FORMATTING_RETURN_APPLIED_AND_REPLAYED',
    applied: true,
    replayVerified: true,
    writerCalled: true,
    durableGeneration: 12n,
    rawDocxBytes: Buffer.from('not-renderer-authority', 'utf8'),
    circular,
    reviewSurface: {
      formattingReturnResult: {
        ok: true,
        status: 'applied-and-replayed',
        replayVerified: true,
        sceneReadback: [{ sceneId: 'scene-a', matchesAfter: true }],
      },
    },
  });
  assert.equal(success.ok, true);
  assert.equal(success.value.ok, true);
  assert.equal(success.value.status, 'applied-and-replayed');
  assert.equal(success.value.replayVerified, true);
  assert.equal(success.value.durableGeneration, '12');
  assert.deepEqual(success.value.rawDocxBytes, { type: 'Buffer', byteLength: 22, redacted: true });
  assert.equal(success.value.circular.self, '[Circular]');
  assert.doesNotThrow(() => JSON.stringify(success));

  const failure = makeCommandBridgeFailure('COMMAND_EXECUTION_FAILED', {
    ok: false,
    error: Object.assign(new Error('post-commit refresh failed'), { code: 'E_REFRESH' }),
  });
  assert.equal(failure.ok, false);
  assert.equal(failure.reason, 'COMMAND_EXECUTION_FAILED');
  assert.equal(failure.value.error.code, 'E_REFRESH');
  assert.doesNotThrow(() => JSON.stringify(failure));

  const array = toCommandBridgeSerializableValue([undefined, 1n, () => {}]);
  assert.deepEqual(array, [null, '1', null]);

  const bridgeSurface = makeFormattingReturnBridgeReviewSurface({
    revisionSession: {
      reviewGraph: {
        textChanges: [{ changeId: 'must-not-cross-ipc-boundary' }],
      },
    },
    formattingReturnPreview: {
      status: 'applied',
      code: 'RTK_FORMATTING_RETURN_APPLIED_AND_REPLAYED',
      operationCount: 24,
      sceneCount: 2,
      diagnosticCount: 0,
      operations: [{ operationId: 'must-not-return-full-operation-list' }],
      diagnostics: [],
      writerCalled: true,
      rendererAuthority: false,
      applyCommandId: 'cmd.project.review.applyFormattingReturn',
    },
    formattingReturnResult: {
      ok: true,
      status: 'applied',
      code: 'RTK_FORMATTING_MULTI_SCENE_APPLIED',
      writerCalled: true,
      applied: true,
      replayVerified: true,
      sceneReadback: [
        { sceneId: 'roman/01.txt', matchesAfter: true },
        { sceneId: 'roman/02.txt', matchesAfter: true },
      ],
    },
  });
  assert.equal(bridgeSurface.revisionSession, undefined);
  assert.equal(bridgeSurface.formattingReturnPreview.operationCount, 24);
  assert.equal(bridgeSurface.formattingReturnPreview.operations.length, 0);
  assert.equal(bridgeSurface.formattingReturnResult.replayVerified, true);
  assert.equal(bridgeSurface.formattingReturnResult.sceneReadback.length, 2);
  assert.doesNotThrow(() => JSON.stringify(bridgeSurface));
});

test('N3 physical canary invokes shipped formatting apply and persisted replay inspection', async () => {
  const canary = await import(pathToFileURL(PHYSICAL_CANARY_PATH).href);
  const workRootHelper = await import(pathToFileURL(path.join(ROOT, 'scripts', 'ops', 'rtk-word-sandbox-work-root.mjs')).href);
  const source = fs.readFileSync(PHYSICAL_CANARY_PATH, 'utf8');
  const formattingOnly = canary.deriveC5V2ReturnLanePlan({
    reviewGraphCounts: { textChanges: 0, commentThreads: 0, commentPlacements: 0, structuralChanges: 0 },
    exactApplyTextChangeIdsByScene: {},
    formattingProductPath: { candidateCount: 25 },
  });
  assert.deepEqual(formattingOnly, {
    exactTextCandidateCount: 0,
    commentCandidateCount: 0,
    formattingCandidateCount: 25,
    structuralCandidateCount: 0,
    hasExactText: false,
    hasComments: false,
    hasFormatting: true,
    hasStructure: false,
    formattingMixedWithOtherMutationLane: false,
    structuralMixedWithOtherMutationLane: false,
  });
  assert.match(source, /invokeUiCommand\(win, 'cmd\.project\.review\.applyFormattingReturn'/u);
  assert.match(source, /invokeUiCommand\(win, 'cmd\.project\.review\.inspectFormattingReturnReplay'/u);
  assert.match(source, /formattingApplyResult\?\.replayVerified === true/u);
  assert.match(source, /formattingReplayInspection\?\.writerCalled !== true/u);
  const wordWorkRoot = workRootHelper.resolveWordHostLocalQaWorkRoot({
    defaultSegments: ['n3-contract-probe'],
  });
  assert.equal(wordWorkRoot.hostLocalGeneratedQaCache, true);
  assert.equal(wordWorkRoot.userDocumentsTouched, false);
  assert.equal(wordWorkRoot.evidenceMirrorRequired, true);
  assert.equal(wordWorkRoot.root.includes(`${path.sep}Library${path.sep}Caches${path.sep}YalkenWordLab${path.sep}`), true);
  assert.equal(wordWorkRoot.root.includes(`${path.sep}Documents${path.sep}`), false);
  const wordScript = canary.buildWordScript({
    sourcePath: '/generated-evidence/source.docx',
    returnedPath: path.join(wordWorkRoot.root, 'returned.docx'),
    artifactReturnedPath: '/generated-evidence/returned.docx',
    ledger: { operations: [{ id: 'format-01', family: 'formatting', wordRange: { start: 0, end: 1 } }] },
  });
  assert.match(wordScript, /set yAccessibilityUiRequired to false/u);
  assert.match(wordScript, /WORD_OBJECT_MODEL_PREFLIGHT_READY/u);
  assert.match(wordScript, /EVIDENCE_MIRROR_VERIFIED/u);
  assert.match(wordScript, /C5V2_EVIDENCE_MIRROR_HASH_MISMATCH/u);
  assert.deepEqual(canary.deriveC5V2ProductRouteGaps({
    ok: true,
    typedPendingLanes: {
      exactText: 'NO_EXACT_TEXT_CANDIDATE',
      commentsRepliesState: 'NO_COMMENT_CANDIDATE',
      formatting: 'PRODUCT_APPLY_AND_REPLAY_VERIFIED',
      structural: 'NO_STRUCTURAL_CANDIDATE',
    },
  }), []);
  assert.deepEqual(canary.deriveC5V2ProductRouteGaps({
    ok: true,
    lanePlan: { expectedCounts: { exactText: 0 } },
    typedPendingLanes: {
      exactText: 'NO_EXACT_TEXT_CANDIDATE',
      rootCommentsState: 'CANONICAL_ROOT_COMMENT_APPLY_AND_REPLAY_PROVEN',
      repliesState: 'PENDING_REPLY_PRODUCT_APPLY_LANE',
      commentState: 'PENDING_COMMENT_STATE_PRODUCT_APPLY_LANE',
      commentsRepliesState: 'PENDING_PRODUCT_APPLY_LANE',
      formatting: 'NO_FORMATTING_CANDIDATE',
      structural: 'NO_STRUCTURAL_CANDIDATE',
    },
  }, {
    expectedFamilies: ['root_comment'],
    expectedFamilyCounts: { root_comment: 4 },
  }), []);
  assert.deepEqual(canary.deriveC5V2ProductRouteGaps({
    ok: true,
    typedPendingLanes: {
      exactText: 'NO_EXACT_TEXT_CANDIDATE',
      commentsRepliesState: 'NO_COMMENT_CANDIDATE',
      formatting: 'NO_FORMATTING_CANDIDATE',
      structural: 'NO_STRUCTURAL_CANDIDATE',
    },
  }, { expectedFamilies: ['formatting'] }), [
    'formatting was required by the physical ledger but produced no product candidate',
  ]);
  assert.match(source, /summary\.productRouteGaps\.length === 0/u);
  assert.deepEqual(canary.deriveC5V2ProductRouteGaps(null, {
    expectedFamilies: ['formatting'],
  }), [
    'full-manuscript authenticated intake preview explicit apply did not complete green in this canary script',
    'formatting was required by the physical ledger but produced no product candidate',
  ]);
  assert.match(source, /progress\('formatting-apply-start'/u);
  assert.match(source, /progress\('formatting-replay-inspection-complete'/u);
  assert.match(source, /content of yReadbackRange as text/u);
  assert.doesNotMatch(source, /content of text object of yReadbackRange/u);
});

test('N3 physical canary retains AX preflight only for native reply and state UI lanes', async () => {
  const canary = await import(pathToFileURL(PHYSICAL_CANARY_PATH).href);
  const wordScript = canary.buildWordScript({
    sourcePath: '/generated-evidence/source.docx',
    returnedPath: '/generated-word-work/returned.docx',
    artifactReturnedPath: '/generated-evidence/returned.docx',
    ledger: { operations: [{ id: 'reply-01', family: 'reply_attempt' }] },
  });
  assert.match(wordScript, /set yAccessibilityUiRequired to true/u);
  assert.match(wordScript, /MACOS_ACCESSIBILITY_PREFLIGHT_READY/u);
});

test('N3 physical canary refuses mixed formatting mutation lanes without one atomic transaction', async () => {
  const canary = await import(pathToFileURL(PHYSICAL_CANARY_PATH).href);
  const mixed = canary.deriveC5V2ReturnLanePlan({
    reviewGraphCounts: { textChanges: 1, commentThreads: 0, commentPlacements: 0, structuralChanges: 0 },
    exactApplyTextChangeIdsByScene: { 'roman/chapter-01.txt': ['change-01'] },
    formattingProductPath: { candidateCount: 1 },
  });
  assert.equal(mixed.hasExactText, true);
  assert.equal(mixed.hasFormatting, true);
  assert.equal(mixed.formattingMixedWithOtherMutationLane, true);
  assert.match(fs.readFileSync(PHYSICAL_CANARY_PATH, 'utf8'), /BLOCKED_MIXED_LANE_ATOMICITY_REQUIRED/u);
  assert.deepEqual(canary.deriveC5V2ProductRouteGaps({
    ok: true,
    typedPendingLanes: { formatting: 'BLOCKED_MIXED_LANE_ATOMICITY_REQUIRED' },
  }), ['formatting is blocked until mixed return lanes share one atomic product transaction']);
});
