'use strict';

// EXPORT-01 Pass 1 — RED-FIRST falsifiers. No implementation in this pass.
//
// Contour: EXPORT-01 — (A) unified bookmark generator (split-brain across three
// generators + resolver synthesis), (B) scene boundaries + real multi-scene
// self-parse, (C) post-write authority activation.
//
// Every RED subtest below is engineered to fail by the EXPECTED defect, not by a
// harness error. Each red reason is documented inline. CONTROL subtests (E5, E6)
// MUST stay green now and after Pass 2.
//
// Important constraint (recon-confirmed): `buildFullManuscriptPublicationGate`,
// `buildFullManuscriptProvisionalSelfParse`, `visibleTextFromWordDocumentXml`,
// `readActiveDocxReviewReturnAuthorityStore`, `persistDocxReviewReturnAuthorityStore`,
// `readFullManuscriptDocxReviewPacketExportSource`, and the main.js wrapper
// `buildDocxReviewPacketBuffer` are ALL internal to src/main.js and NOT exported.
// To observe the publication-gate defect signature on a REAL generated DOCX we
// reuse the SAME revision-bridge primitives the gate calls
// (`extractDocxReviewTransportPackagePartsFromZipBytes` for package parts and the
// same visible-text extraction algorithm as `visibleTextFromWordDocumentXml`), on
// REAL bytes produced by the REAL `buildDocxReviewPacketBuffer` builder. This is a
// real route (no gate/builder mock); it reproduces the exact defect the gate
// surfaces (`RTK_V4_PUBLICATION_GATE_PROVISIONAL_TEXT_MISMATCH`).

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FULL_SOURCE_MODULE = path.join(REPO_ROOT, 'src', 'export', 'docx', 'fullManuscriptDocxReviewPacketSource.js');
const BUILDER_MODULE = path.join(REPO_ROOT, 'src', 'export', 'docx', 'docxReviewPacketBuilder.js');
const HANDLER_MODULE = path.join(REPO_ROOT, 'src', 'export', 'docx', 'docxReviewPacketExportHandler.js');
const REVISION_BRIDGE_MODULE = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'index.mjs');
const MAIN_JS = path.join(REPO_ROOT, 'src', 'main.js');

function readText(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function loadRevisionBridge() {
  // revisionBridge is an ESM module (.mjs); use dynamic import via pathToFileURL.
  // Matches the donor pattern in rtk-word-c5v2-full-manuscript-return-router.
  // eslint-disable-next-line global-require
  const { pathToFileURL } = require('node:url');
  return import(pathToFileURL(REVISION_BRIDGE_MODULE).href);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function makeCryptoPort() {
  return {
    sha256Text(value) {
      return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
    },
    sha256Json(value) {
      return `sha256:${this.sha256Text(stableJson(value))}`;
    },
    hmacSha256Json(value, secret) {
      return `hmac-sha256:${crypto.createHmac('sha256', String(secret || '')).update(stableJson(value), 'utf8').digest('hex')}`;
    },
    byteLength(value) {
      return Buffer.byteLength(String(value || ''), 'utf8');
    },
  };
}

// Two scenes × two paragraphs each. This is the minimal multi-scene fixture that
// exposes the F-01/P0-01 scene-boundary defect: the exported DOCX has no scene
// boundary marker, so a flat re-parse cannot reproduce scenes.join('\n\n').
function makeTwoScenes() {
  return [
    {
      sceneId: 'roman/scene-one.md',
      scenePath: '/project/roman/scene-one.md',
      title: 'Scene One',
      text: 'First paragraph of scene one.\nSecond paragraph of scene one.',
      order: 0,
    },
    {
      sceneId: 'roman/scene-two.md',
      scenePath: '/project/roman/scene-two.md',
      title: 'Scene Two',
      text: 'First paragraph of scene two.\nSecond paragraph of scene two.',
      order: 1,
    },
  ];
}

function makeSingleScene() {
  const [first] = makeTwoScenes();
  return [first];
}

function buildSource(scenes, deps = {}) {
  const { buildFullManuscriptDocxReviewPacketSource } = require(FULL_SOURCE_MODULE);
  return buildFullManuscriptDocxReviewPacketSource({
    projectId: 'project-export01',
    projectRoot: '/project',
    manifestPath: '/project/manifest.json',
    scenes,
    expectedOrderedSceneIds: scenes.map((scene) => scene.sceneId),
  }, {
    roundIdHex: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
    keyIdHex: '0fedcba9876543210fedcba9876543210',
    hmacSecret: 'local-secret-for-test-only',
    cryptoPort: makeCryptoPort(),
    ...deps,
  });
}

// Visible-text extraction matching src/main.js visibleTextFromWordDocumentXml
// (paragraphs joined by '\n', collapsing 3+ newlines). Reproduced here because
// that helper is internal and not exported; using it keeps the observed defect
// signature identical to the real publication gate.
function visibleTextFromWordDocumentXml(documentXml) {
  const xml = String(documentXml || '');
  const paragraphs = [];
  const paragraphRe = /<w:p\b[\s\S]*?<\/w:p>/gu;
  let paragraphMatch = paragraphRe.exec(xml);
  while (paragraphMatch) {
    const paragraphXml = paragraphMatch[0];
    const runs = [];
    const textRe = /<w:(?:t|delText)\b[^>]*>([\s\S]*?)<\/w:(?:t|delText)>/gu;
    let textMatch = textRe.exec(paragraphXml);
    while (textMatch) {
      runs.push(decodeXmlEntities(textMatch[1]));
      textMatch = textRe.exec(paragraphXml);
    }
    paragraphs.push(runs.join(''));
    paragraphMatch = paragraphRe.exec(xml);
  }
  return paragraphs.join('\n').replace(/\n{3,}/gu, '\n\n').replace(/^\n+/u, '').replace(/\n+$/u, '');
}

function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'");
}

function readBookmarkStartNames(documentXml) {
  const xml = String(documentXml || '');
  const names = [];
  const re = /<w:bookmarkStart\b[^>]*\bw:name="([^"]*)"[^>]*\/>/gu;
  let match = re.exec(xml);
  while (match) {
    names.push(match[1]);
    match = re.exec(xml);
  }
  return names;
}

// ---- E1: real two-scene export must pass its own publication gate ----

test('EXPORT01-E1-real-two-scene-export-passes-own-gate', async () => {
  // EXPORT-01 Pass 2: strengthened from an algorithm-twin (a LOCAL copy of the
  // flat visibleTextFromWordDocumentXml) to the REAL boundary-aware re-parse the
  // publication gate uses. The gate's provisional self-parse now calls
  // revisionBridge.visibleSceneTextsFromWordDocumentXml (the single shared
  // implementation) to reconstruct ordered scene texts from the declared
  // bookmarks, so the re-parse converges with scenes.join('\n\n') on the real
  // multi-scene route. This subtest now exercises the SAME re-parse path as the
  // real gate — no local algorithm copy, no mock.
  //
  // Real route: REAL buildDocxReviewPacketBuffer (builder) on REAL source, REAL
  // revisionBridge.extractDocxReviewTransportPackagePartsFromZipBytes for parts,
  // REAL revisionBridge.visibleSceneTextsFromWordDocumentXml for the boundary
  // projection (the exact function the gate calls).
  const source = buildSource(makeTwoScenes());
  const { buildDocxReviewPacketBuffer } = require(BUILDER_MODULE);
  const bytes = buildDocxReviewPacketBuffer(source);
  const revisionBridge = await loadRevisionBridge();
  const extracted = revisionBridge.extractDocxReviewTransportPackagePartsFromZipBytes(
    { bytes },
    { cryptoPort: makeCryptoPort() },
  );
  assert.equal(extracted.ok, true, `package extraction failed: ${JSON.stringify(extracted)}`);

  // Real boundary-aware projection — the same function the gate calls.
  const exportMap = source.localAuthorityCapsule.exportMap;
  const projection = revisionBridge.visibleSceneTextsFromWordDocumentXml(
    extracted.parts['word/document.xml'],
    exportMap,
  );
  assert.equal(projection.ok, true, `boundary projection failed: ${JSON.stringify(projection)}`);
  const documentText = projection.sceneTexts.join('\n\n');
  const cryptoPort = makeCryptoPort();
  const documentTextSha256 = cryptoPort.sha256Json({ sceneText: documentText });
  const expectedDocumentTextSha256 = source.provisionalSelfParseArtifact.expectedDocumentTextSha256;

  assert.equal(
    documentTextSha256,
    expectedDocumentTextSha256,
    'E1: boundary-aware provisional self-parse must converge with scenes.join("\\n\\n") '
    + 'on the real multi-scene route. '
    + `actual=${documentTextSha256} expected=${expectedDocumentTextSha256} `
    + `sceneTexts=${JSON.stringify(projection.sceneTexts)}`,
  );
});

// ---- E2: bookmark name parity across declared / emitted / resolver ----

test('EXPORT01-E2-bookmark-name-parity', async () => {
  // EXPORT-01 Pass 2: strengthened from reproducing the OLD resolver formula to
  // exercising the REAL resolver path. Three sites previously diverged:
  //   (a) declared (fullManuscriptDocxReviewPacketSource wordSignals)
  //   (b) emitted (docxReviewPacketBuilder w:bookmarkStart)
  //   (c) resolved (revisionBridge resolver — formerly synthesized)
  // Pass 2 unifies all three behind deriveWordBookmarkNameV1. This subtest now
  // asserts: declared and emitted names match the unified 37-char form and are
  // byte-identical, AND the REAL resolver (buildDocxReviewPreviewSessionCandidateFromZipBytes)
  // resolves a paragraph carrying the emitted bookmark to the declared scene
  // with paragraph-signal authority — proving the resolver admits the SAME name
  // the builder emitted, on the real route (no formula reproduction).
  const source = buildSource(makeTwoScenes());
  const firstBlock = source.blocks[0];
  assert.ok(firstBlock, 'expected at least one block');
  const firstSceneId = makeTwoScenes()[0].sceneId;

  // (a) Declared bookmark name from ExportMap wordSignals.
  const declaredSignal = Array.isArray(firstBlock.wordSignals)
    ? firstBlock.wordSignals.find((signal) => signal && signal.kind === 'bookmarkName')
    : null;
  assert.ok(declaredSignal, 'block must carry a declared bookmarkName signal');
  const declaredName = declaredSignal.value.name;

  // (b) Emitted bookmark name parsed from the real DOCX.
  const { buildDocxReviewPacketBuffer } = require(BUILDER_MODULE);
  const bytes = buildDocxReviewPacketBuffer(source);
  const { extractStoredZipEntries } = require(path.join(REPO_ROOT, 'src', 'export', 'docx', 'docxArtifactValidator.js'));
  const entries = extractStoredZipEntries(bytes);
  const documentXml = entries.get('word/document.xml').toString('utf8');
  const emittedNames = readBookmarkStartNames(documentXml);
  assert.ok(emittedNames.length > 0, 'DOCX must emit at least one bookmarkStart');
  const emittedName = emittedNames[0];

  const unifiedForm = /^YRTK_[0-9a-f]{32}$/u;
  assert.match(declaredName, unifiedForm, `declared name ${declaredName} is not unified YRTK_<32hex>`);
  assert.match(emittedName, unifiedForm, `emitted name ${emittedName} is not unified YRTK_<32hex>`);
  assert.equal(declaredName, emittedName, 'declared name must equal emitted name byte-for-byte');

  // (c) REAL resolver path: build a minimal DOCX whose single paragraph carries
  // the EMITTED bookmark name (word-rewritten paraId/textId) plus a tracked
  // change, and assert the resolver routes it to the declared scene via the
  // declared bookmarkName signal. This proves resolver admits the same name.
  const revisionBridge = await loadRevisionBridge();
  const exportMap = source.localAuthorityCapsule.exportMap;
  const { deflateRawSync } = require('node:zlib');
  function crc32(buf) {
    let table = crc32.table;
    if (!table) {
      table = new Uint32Array(256);
      for (let i = 0; i < 256; i += 1) {
        let c = i;
        for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        table[i] = c >>> 0;
      }
      crc32.table = table;
    }
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i += 1) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  function cleanDocxZip(paragraphXml) {
    const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
    const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>';
    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphXml}</w:body></w:document>`;
    const zipEntries = [
      { name: '[Content_Types].xml', data: Buffer.from(contentTypes, 'utf8') },
      { name: '_rels/.rels', data: Buffer.from(rels, 'utf8') },
      { name: 'word/document.xml', data: Buffer.from(docXml, 'utf8') },
    ];
    const local = [];
    const central = [];
    let offset = 0;
    for (const entry of zipEntries) {
      const compressed = deflateRawSync(entry.data);
      const localHeader = Buffer.alloc(30);
      localHeader.writeUInt32LE(0x04034b50, 0);
      localHeader.writeUInt16LE(20, 4);
      localHeader.writeUInt16LE(0, 6);
      localHeader.writeUInt16LE(8, 8);
      localHeader.writeUInt32LE(0, 10);
      const crc = crc32(entry.data);
      localHeader.writeUInt32LE(crc >>> 0, 14);
      localHeader.writeUInt32LE(compressed.length, 18);
      localHeader.writeUInt32LE(entry.data.length, 22);
      localHeader.writeUInt16LE(Buffer.byteLength(entry.name, 'utf8'), 26);
      localHeader.writeUInt16LE(0, 28);
      const nameBuf = Buffer.from(entry.name, 'utf8');
      const lh = Buffer.concat([localHeader, nameBuf, compressed]);
      local.push({ lh });
      const centralRecord = Buffer.alloc(46);
      offset += lh.length;
      centralRecord.writeUInt32LE(0x02014b50, 0);
      centralRecord.writeUInt16LE(20, 4);
      centralRecord.writeUInt16LE(20, 6);
      centralRecord.writeUInt16LE(0, 8);
      centralRecord.writeUInt16LE(8, 10);
      centralRecord.writeUInt32LE(0, 12);
      centralRecord.writeUInt32LE(crc >>> 0, 16);
      centralRecord.writeUInt32LE(compressed.length, 20);
      centralRecord.writeUInt32LE(entry.data.length, 24);
      centralRecord.writeUInt16LE(Buffer.byteLength(entry.name, 'utf8'), 28);
      centralRecord.writeUInt16LE(0, 30);
      centralRecord.writeUInt16LE(0, 32);
      centralRecord.writeUInt16LE(0, 34);
      centralRecord.writeUInt32LE(0, 38);
      centralRecord.writeUInt32LE(offset - lh.length, 42);
      central.push(Buffer.concat([centralRecord, nameBuf]));
    }
    let centralStart = 0;
    for (const item of local) centralStart += item.lh.length;
    const centralBuf = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(zipEntries.length, 8);
    end.writeUInt16LE(zipEntries.length, 10);
    end.writeUInt32LE(centralBuf.length, 12);
    end.writeUInt32LE(centralStart, 16);
    end.writeUInt16LE(0, 20);
    return Buffer.concat([...local.map((item) => item.lh), centralBuf, end]);
  }
  const paragraphXml = [
    `<w:p w14:paraId="wordmade01" w14:textId="wordmade02" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">`,
    `<w:bookmarkStart w:id="1" w:name="${emittedName}"/>`,
    `<w:r><w:t>Alpha </w:t></w:r>`,
    `<w:del w:id="3"><w:r><w:delText>first phrase</w:delText></w:r></w:del>`,
    `<w:ins w:id="4"><w:r><w:t>first replacement</w:t></w:r></w:ins>`,
    `<w:bookmarkEnd w:id="1"/>`,
    `</w:p>`,
  ].join('');
  const candidate = revisionBridge.buildDocxReviewPreviewSessionCandidateFromZipBytes(
    cleanDocxZip(paragraphXml),
    { targetScope: { type: 'scene', id: 'roman/currently-open.md' }, fullManuscriptExportMap: exportMap },
  );
  assert.equal(candidate.ok, true, `resolver candidate failed: ${JSON.stringify(candidate)}`);
  const routed = Array.isArray(candidate?.reviewPacket?.textChanges)
    ? candidate.reviewPacket.textChanges.some((change) => (
      change?.targetScope?.id === firstSceneId
      && change?.sourceAuthority === 'full-manuscript-export-map-paragraph-signal'
    ))
    : false;
  assert.equal(
    routed,
    true,
    'E2: real resolver did not route the emitted-bookmark paragraph to the declared scene '
    + `${firstSceneId} with paragraph-signal authority. `
    + `textChanges=${JSON.stringify(candidate?.reviewPacket?.textChanges?.map((tc) => ({ targetScope: tc.targetScope, sourceAuthority: tc.sourceAuthority })))}`,
  );
});

// ---- E3: resolver must not synthesize a name for an unmatched bookmark ----

test('EXPORT01-E3-resolver-synthesis-impossible', async () => {
  // RED REASON: docxReviewPreviewSessionBuildFullManuscriptBlockScopeResolver
  // (revisionBridge index.mjs:3207-3210) and docxReviewFormattingBuildFullManuscriptBlockResolver
  // (index.mjs:3279-3282) synthesize a bookmark name from blockId + globalBlockIndex
  // IN ADDITION to the declared bookmarkName signal (3220-3223, 3292-3295). A DOCX
  // bookmark that matches the synthesized form but corresponds to NO declared
  // bookmarkName signal is still resolved by the resolver, fabricating authority.
  // TARGET (Pass 2): no synthesis; an unmatched bookmark yields a typed no-match,
  // never a fabricated resolution.
  const revisionBridge = await loadRevisionBridge();
  const { buildDocxReviewPreviewSessionCandidateFromZipBytes } = revisionBridge;

  // Export map with ONE block that carries a w14ParaIdTextId signal but NO
  // declared bookmarkName signal. The resolver should only resolve via declared
  // signals; the synthesized blockId-based name must not be admitted.
  const exportMap = {
    scenes: [
      {
        sceneId: 'roman/declared-scene.md',
        blocks: [
          {
            blockId: 'scene-01-block-0001-1122334455667788',
            wordSignals: [
              { kind: 'w14ParaIdTextId', value: { paraId: '11223344', textId: '55667788' } },
              // NOTE: no kind:'bookmarkName' signal is declared here.
            ],
          },
        ],
      },
    ],
  };

  // A DOCX paragraph whose bookmark name matches the SYNTHESIZED form derived
  // from the blockId (revisionBridge index.mjs:3207-3210 formula), but whose
  // paraId/textId do NOT match the declared w14 signal. The resolver must not
  // resolve this paragraph to the declared scene via the synthesized bookmark.
  const globalBlockIndex = 0;
  const rawBookmark = 'scene-01-block-0001-1122334455667788'.replace(/[^A-Za-z0-9_]/gu, '_');
  const synthesizedBookmarkName = `YRTK_${String(globalBlockIndex + 1).padStart(4, '0')}_${rawBookmark}`.slice(0, 40);

  function cleanDocxZip(paragraphXml) {
    const { deflateRawSync } = require('node:zlib');
    const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
    const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>';
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphXml}</w:body></w:document>`;
    const entries = [
      { name: '[Content_Types].xml', data: Buffer.from(contentTypes, 'utf8') },
      { name: '_rels/.rels', data: Buffer.from(rels, 'utf8') },
      { name: 'word/document.xml', data: Buffer.from(documentXml, 'utf8') },
    ];
    const local = [];
    const central = [];
    let offset = 0;
    for (const entry of entries) {
      const compressed = deflateRawSync(entry.data);
      const localHeader = Buffer.alloc(30);
      localHeader.writeUInt32LE(0x04034b50, 0);
      localHeader.writeUInt16LE(20, 4);
      localHeader.writeUInt16LE(0, 6);
      localHeader.writeUInt16LE(8, 8);
      localHeader.writeUInt32LE(0, 10);
      const crc = crc32(entry.data);
      localHeader.writeUInt32LE(crc >>> 0, 14);
      localHeader.writeUInt32LE(compressed.length, 18);
      localHeader.writeUInt32LE(entry.data.length, 22);
      localHeader.writeUInt16LE(Buffer.byteLength(entry.name, 'utf8'), 26);
      localHeader.writeUInt16LE(0, 28);
      const nameBuf = Buffer.from(entry.name, 'utf8');
      const lh = Buffer.concat([localHeader, nameBuf, compressed]);
      local.push({ lh, name: entry.name, crc, compressedLength: compressed.length, dataLength: entry.data.length });
      const centralRecord = Buffer.alloc(46);
      offset += lh.length;
      centralRecord.writeUInt32LE(0x02014b50, 0);
      centralRecord.writeUInt16LE(20, 4);
      centralRecord.writeUInt16LE(20, 6);
      centralRecord.writeUInt16LE(0, 8);
      centralRecord.writeUInt16LE(8, 10);
      centralRecord.writeUInt32LE(0, 12);
      centralRecord.writeUInt32LE(crc >>> 0, 16);
      centralRecord.writeUInt32LE(compressed.length, 20);
      centralRecord.writeUInt32LE(entry.data.length, 24);
      centralRecord.writeUInt16LE(Buffer.byteLength(entry.name, 'utf8'), 28);
      centralRecord.writeUInt16LE(0, 30);
      centralRecord.writeUInt16LE(0, 32);
      centralRecord.writeUInt16LE(0, 34);
      centralRecord.writeUInt32LE(0, 38);
      centralRecord.writeUInt32LE(offset - lh.length, 42);
      central.push(Buffer.concat([centralRecord, nameBuf]));
    }
    let centralStart = 0;
    for (const item of local) centralStart += item.lh.length;
    const centralBuf = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralBuf.length, 12);
    end.writeUInt32LE(centralStart, 16);
    end.writeUInt16LE(0, 20);
    return Buffer.concat([...local.map((item) => item.lh), centralBuf, end]);
  }

  function crc32(buf) {
    let table = crc32.table;
    if (!table) {
      table = new Uint32Array(256);
      for (let i = 0; i < 256; i += 1) {
        let c = i;
        for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        table[i] = c >>> 0;
      }
      crc32.table = table;
    }
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i += 1) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  // Paragraph carries a tracked change (delText/insText) so the preview session
  // candidate produces a textChange whose targetScope reveals whether the
  // resolver fabricated authority via the synthesized bookmark name.
  const paragraphXml = [
    `<w:p w14:paraId="ffffffff" w14:textId="eeeeeeee" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">`,
    `<w:bookmarkStart w:id="1" w:name="${synthesizedBookmarkName}"/>`,
    `<w:r><w:t>Alpha </w:t></w:r>`,
    `<w:del w:id="3"><w:r><w:delText>first phrase</w:delText></w:r></w:del>`,
    `<w:ins w:id="4"><w:r><w:t>first replacement</w:t></w:r></w:ins>`,
    `<w:bookmarkEnd w:id="1"/>`,
    `</w:p>`,
  ].join('');

  const result = buildDocxReviewPreviewSessionCandidateFromZipBytes(cleanDocxZip(paragraphXml), {
    targetScope: { type: 'scene', id: 'roman/currently-open.md' },
    fullManuscriptExportMap: exportMap,
  });
  assert.equal(result.ok, true, `preview session candidate failed: ${JSON.stringify(result)}`);

  // E3 RED: today the resolver fabricates authority via the synthesized bookmark
  // name (blockId + globalBlockIndex formula), routing the tracked change to
  // 'roman/declared-scene.md' with sourceAuthority
  // 'full-manuscript-export-map-paragraph-signal' even though NO bookmarkName
  // signal was declared for that block. TARGET: the tracked change must not be
  // routed to the declared scene (typed no-match / unresolved / manual).
  const routedToDeclared = Array.isArray(result?.reviewPacket?.textChanges)
    ? result.reviewPacket.textChanges.some((change) => (
      change?.targetScope?.id === 'roman/declared-scene.md'
      && change?.sourceAuthority === 'full-manuscript-export-map-paragraph-signal'
    ))
    : false;
  assert.equal(
    routedToDeclared,
    false,
    'E3 RED: resolver synthesized authority for an unmatched bookmark '
    + `(synthesized=${synthesizedBookmarkName}) and routed the tracked change to `
    + `'roman/declared-scene.md' with paragraph-signal authority without a `
    + `declared bookmarkName signal. `
    + `textChanges=${JSON.stringify(result?.reviewPacket?.textChanges?.map((tc) => ({ targetScope: tc.targetScope, sourceAuthority: tc.sourceAuthority })))}`,
  );
});

// ---- E4: a failed export must leave no active authority for that round ----

test('EXPORT01-E4-failed-export-leaves-no-authority', async () => {
  // EXPORT-01 Pass 2: strengthened from a RED-artefact (the test pre-created the
  // authority store to simulate the source-reader persist that Pass 2 removes)
  // to a direct activation-discipline probe. The source now carries the
  // authority store in-memory as pendingAuthorityStore; the handler persists it
  // ONLY after a successful gate + atomic write + exact readback (activation
  // phase). This subtest injects an activate spy and forces a WRITE failure, then
  // asserts the spy was NEVER called — i.e. a failed write leaves zero durable
  // authority. This is stronger than the file-existence check: it directly
  // proves the handler did not attempt activation on the failure path.
  const { runDocxReviewPacketExport } = require(HANDLER_MODULE);
  const source = buildSource(makeTwoScenes());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-export01-e4-'));
  const outPath = path.join(dir, 'failed.docx');
  const roundId = source.localAuthorityCapsule.roundId;

  // The source carries the pending authority store in-memory (the real
  // readFullManuscriptDocxReviewPacketExportSource now surfaces it as
  // pendingAuthorityStore instead of persisting eagerly).
  source.pendingAuthorityStore = {
    schemaVersion: 'yalken.docx-review-return-authority-store.v1',
    scope: 'full-manuscript',
    lastRoundId: roundId,
    roundsById: { [roundId]: { ...source.localAuthorityCapsule, projectRoot: dir } },
    secretExposedToRenderer: false,
  };

  let writeAttempted = false;
  let activateCallCount = 0;
  const result = await runDocxReviewPacketExport(
    { requestId: 'req-e4', outPath },
    {
      commandId: 'cmd.project.review.exportFullManuscriptDocxReviewPacket',
      normalizeExportPayload(input) {
        return {
          requestId: input.requestId,
          outPath: input.outPath,
          outDir: '',
          bufferSource: '',
          options: {},
        };
      },
      makeTypedReviewDocxExportError(code, reason, details) {
        return { ok: false, error: { code, op: 'cmd.project.review.exportFullManuscriptDocxReviewPacket', reason, details } };
      },
      resolveDocxReviewPacketExportPath(payload) { return payload.outPath; },
      validateDocxExportTarget() { return { ok: true }; },
      readDocxReviewPacketExportSource() { return source; },
      buildDocxReviewPacketBuffer(input) {
        return {
          documentBuffer: Buffer.from('EXPORT01-E4-DOCX'),
          exportCapsule: input.exportCapsule,
          publicationGate: {
            ok: true,
            code: 'RTK_V4_DOUBLE_SELF_PARSE_PASS',
            publishAllowed: true,
            finalArtifactSha256: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            coreManifestDigest: input.exportCapsule.coreManifestDigest,
            provisionalSelfParse: { verified: true, actualBaselineDigest: input.exportCapsule.fullBookRawSha256, provisionalDocxSha256: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
            finalSelfParse: { semanticEquivalent: true },
            yrtk2Verification: { code: 'RTK_RETURN_INTAKE_YRTK2_VERIFIED' },
          },
        };
      },
      async queueDiskOperation(operation) { return operation(); },
      async writeBufferAtomic() {
        writeAttempted = true;
        throw new Error('EXPORT01_E4_FORCED_WRITE_FAILURE');
      },
      updateStatus() {},
      async readWrittenBuffer() { return Buffer.alloc(0); },
      async activateReviewDocxExportAuthority() {
        activateCallCount += 1;
        return { storePath: outPath, authorityStoreDigest: 'should-not-happen' };
      },
    },
  );

  assert.equal(writeAttempted, true, 'the write must have been attempted to exercise the failure path');
  assert.equal(result.ok, false, 'forced write failure must yield ok:false');
  assert.equal(result.error.code, 'E_REVIEW_DOCX_EXPORT_WRITE_FAILED');

  // E4: a failed write must NOT activate the authority store. The activation
  // spy must never have been called — zero durable authority for this round.
  assert.equal(
    activateCallCount,
    0,
    'E4: handler activated the authority store after a failed write; '
    + 'activation must happen only after gate + write + exact readback. '
    + `activateCallCount=${activateCallCount}`,
  );
});

// ---- E5 CONTROL: single-scene export happy path stays green ----

test('EXPORT01-E5-CONTROL-single-scene-export-gate-compatible', async () => {
  // CONTROL: single-scene export must be green now and after Pass 2. A single
  // scene has no inter-scene boundary, so the flat re-parse digest matches
  // scenes.join('\n\n') (which for one scene is just the scene text with no
  // separator). This guards against regressions in the happy path.
  const source = buildSource(makeSingleScene());
  const { buildDocxReviewPacketBuffer } = require(BUILDER_MODULE);
  const bytes = buildDocxReviewPacketBuffer(source);
  const revisionBridge = await loadRevisionBridge();
  const extracted = revisionBridge.extractDocxReviewTransportPackagePartsFromZipBytes(
    { bytes },
    { cryptoPort: makeCryptoPort() },
  );
  assert.equal(extracted.ok, true, `single-scene extraction failed: ${JSON.stringify(extracted)}`);
  // EXPORT-01 Pass 2: single-scene CONTROL now also uses the real boundary-aware
  // projection (the same function the gate calls). For one scene the projection
  // is trivially equivalent to the flat join, so this stays a regression guard.
  const exportMap = source.localAuthorityCapsule.exportMap;
  const projection = revisionBridge.visibleSceneTextsFromWordDocumentXml(
    extracted.parts['word/document.xml'],
    exportMap,
  );
  assert.equal(projection.ok, true, `single-scene boundary projection failed: ${JSON.stringify(projection)}`);
  const documentText = projection.sceneTexts.join('\n\n');
  const cryptoPort = makeCryptoPort();
  const documentTextSha256 = cryptoPort.sha256Json({ sceneText: documentText });
  assert.equal(
    documentTextSha256,
    source.provisionalSelfParseArtifact.expectedDocumentTextSha256,
    'single-scene visible text must match scenes.join("\\n\\n") digest',
  );
});

// ---- E6 CONTROL: packet parts / custom properties plumbing stays green ----

test('EXPORT01-E6-CONTROL-packet-parts-custom-properties', () => {
  // CONTROL: the packet must carry the YRTK_C01_AUTH, YRTK2_TOKEN and
  // YRTK_CORE_DIGEST custom properties and the customXml payload. This is the
  // p0-suite pattern and must stay green now and after Pass 2.
  const source = buildSource(makeTwoScenes());
  const { buildDocxReviewPacketBuffer } = require(BUILDER_MODULE);
  const bytes = buildDocxReviewPacketBuffer(source);
  const { extractStoredZipEntries } = require(path.join(REPO_ROOT, 'src', 'export', 'docx', 'docxArtifactValidator.js'));
  const entries = extractStoredZipEntries(bytes);
  const customXml = entries.get('docProps/custom.xml').toString('utf8');
  assert.match(customXml, /YRTK_C01_AUTH/u, 'YRTK_C01_AUTH custom property must be present');
  assert.match(customXml, /YRTK2_TOKEN/u, 'YRTK2_TOKEN custom property must be present');
  assert.match(customXml, /YRTK_CORE_DIGEST/u, 'YRTK_CORE_DIGEST custom property must be present');
  assert.equal(source.exportCapsule.scope, 'full-manuscript');
  assert.equal(source.exportCapsule.sceneCount, 2);
});

// ---- E7: unified bookmark generator contract ----

test('EXPORT01-E7-unified-generator-contract', () => {
  // RED REASON: deriveWordBookmarkNameV1 does not exist yet. TARGET (Pass 2): a
  // single deterministic generator deriveWordBookmarkNameV1({ roundId, sceneId,
  // roundBlockOccurrenceId }) produces YRTK_<32hex> (37 chars), differs across
  // scenes/blocks/rounds, and is stable across calls.
  const mainSource = readText('src/main.js');
  const builderSource = readText('src/export/docx/docxReviewPacketBuilder.js');
  const fullSourceText = readText('src/export/docx/fullManuscriptDocxReviewPacketSource.js');
  const revisionBridgeSource = readText('src/io/revisionBridge/index.mjs');

  // E7 RED: no unified generator exists in any of the three generator sites or
  // the resolver. The function name must appear and be the single source of truth.
  // Use boolean includes() (not assert.match) to avoid dumping entire source
  // files into the failure output.
  assert.equal(
    mainSource.includes('deriveWordBookmarkNameV1'),
    true,
    'E7 RED: src/main.js does not define or import deriveWordBookmarkNameV1',
  );
  assert.equal(
    builderSource.includes('deriveWordBookmarkNameV1'),
    true,
    'E7 RED: docxReviewPacketBuilder.js does not use deriveWordBookmarkNameV1',
  );
  assert.equal(
    fullSourceText.includes('deriveWordBookmarkNameV1'),
    true,
    'E7 RED: fullManuscriptDocxReviewPacketSource.js does not use deriveWordBookmarkNameV1',
  );
  assert.equal(
    revisionBridgeSource.includes('deriveWordBookmarkNameV1'),
    true,
    'E7 RED: revisionBridge does not use deriveWordBookmarkNameV1',
  );

  // Determinism + shape contract (executed once the function exists; today it is
  // absent so this also contributes to the red). We require it from the builder
  // module because Pass 2 will host it there as the single source of truth.
  let deriveWordBookmarkNameV1 = null;
  try {
    ({ deriveWordBookmarkNameV1 } = require(BUILDER_MODULE));
  } catch {
    deriveWordBookmarkNameV1 = null;
  }
  assert.equal(typeof deriveWordBookmarkNameV1, 'function', 'E7 RED: deriveWordBookmarkNameV1 is not exported');

  if (typeof deriveWordBookmarkNameV1 === 'function') {
    const a = deriveWordBookmarkNameV1({ roundId: 'r1', sceneId: 's1', roundBlockOccurrenceId: 0 });
    const aAgain = deriveWordBookmarkNameV1({ roundId: 'r1', sceneId: 's1', roundBlockOccurrenceId: 0 });
    const b = deriveWordBookmarkNameV1({ roundId: 'r1', sceneId: 's1', roundBlockOccurrenceId: 1 });
    const c = deriveWordBookmarkNameV1({ roundId: 'r1', sceneId: 's2', roundBlockOccurrenceId: 0 });
    const d = deriveWordBookmarkNameV1({ roundId: 'r2', sceneId: 's1', roundBlockOccurrenceId: 0 });
    assert.match(a, /^YRTK_[0-9a-f]{32}$/u, 'unified name must be YRTK_ + 32 lowercase hex (37 chars)');
    assert.equal(a, aAgain, 'unified name must be stable across calls');
    assert.notEqual(a, b, 'unified name must differ by block occurrence');
    assert.notEqual(a, c, 'unified name must differ by scene');
    assert.notEqual(a, d, 'unified name must differ by round');
    assert.equal(a.length, 37, 'unified name length must be exactly 37');
  }
});

// ---- E8 CONTROL: activated round must stay resolvable after a successful export ----

test('EXPORT01-E8-CONTROL-activated-round-resolvable-after-successful-export', async () => {
  // POSITIVE CONTROL round-trip. The defect this guards against: an advisory
  // manifest field was renamed from the canonical `secretEmbeddedInDocx` to the
  // non-canonical `secretExposedInDocx` at exactly one site — the single-scene
  // yrtk2 advisory block in src/main.js readDocxReviewPacketExportSource
  // (advisoryManifest.yrtk2). That advisoryManifest is serialized verbatim into
  // the DOCX customXml payload by the builder (buildCustomXmlPayloadXml), and
  // the return-intake parser (reviewTransportPackageParserV2.mjs) reads
  // `envelope.secretEmbeddedInDocx`. A renamed field reads `undefined`, and
  // `undefined !== false` is true, so the return-intake authority carrier is
  // degraded to a manual locator — an ACTIVATED single-scene round fails to
  // resolve at return intake even though activation succeeded.
  //
  // This is a positive control on TWO surfaces:
  //   (1) FUNCTIONAL: a real successful export (gate + atomic write + exact
  //       readback) activates the authority store, and the activated round
  //       STAYS resolvable — it is present in roundsById and carries its local
  //       authority binding (roundId + hmacSecret + expectedAuthority).
  //   (2) FIELD-NAME CANONICALITY: the single-scene advisoryManifest.yrtk2 in
  //       src/main.js carries the canonical `secretEmbeddedInDocx` key with
  //       value `false`, so the customXml payload it produces is readable by
  //       the return-intake parser. A source-text assertion is used because
  //       readDocxReviewPacketExportSource is internal to main.js and not
  //       exported — the same constraint the E7 and C5V2 source-text controls
  //       operate under. This is the exact point that would re-regress if the
  //       typo crept back in.
  const { runDocxReviewPacketExport } = require(HANDLER_MODULE);
  const { buildDocxReviewPacketBuffer } = require(BUILDER_MODULE);
  const source = buildSource(makeTwoScenes());
  const realDocumentBuffer = buildDocxReviewPacketBuffer(source);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-export01-e8-'));
  const outPath = path.join(dir, 'activated.docx');
  const roundId = source.localAuthorityCapsule.roundId;
  const capsule = source.localAuthorityCapsule;

  // The source carries the pending authority store in-memory, exactly as the
  // real readFullManuscriptDocxReviewPacketExportSource surfaces it.
  source.pendingAuthorityStore = {
    schemaVersion: 'yalken.docx-review-return-authority-store.v1',
    scope: 'full-manuscript',
    lastRoundId: roundId,
    roundsById: { [roundId]: { ...capsule, projectRoot: dir } },
    secretExposedToRenderer: false,
  };

  let capturedStore = null;
  let activateCallCount = 0;
  const result = await runDocxReviewPacketExport(
    { requestId: 'req-e8', outPath },
    {
      commandId: 'cmd.project.review.exportFullManuscriptDocxReviewPacket',
      normalizeExportPayload(input) {
        return {
          requestId: input.requestId,
          outPath: input.outPath,
          outDir: '',
          bufferSource: '',
          options: {},
        };
      },
      makeTypedReviewDocxExportError(code, reason, details) {
        return { ok: false, error: { code, op: 'cmd.project.review.exportFullManuscriptDocxReviewPacket', reason, details } };
      },
      resolveDocxReviewPacketExportPath(payload) { return payload.outPath; },
      validateDocxExportTarget() { return { ok: true }; },
      readDocxReviewPacketExportSource() { return source; },
      buildDocxReviewPacketBuffer() {
        // Real builder bytes + real publication-gate-ready capsule. The gate
        // fields mirror what a successful real buildDocxReviewPacketBuffer
        // produces on this source.
        return {
          documentBuffer: realDocumentBuffer,
          exportCapsule: source.exportCapsule,
          publicationGate: {
            ok: true,
            code: 'RTK_V4_DOUBLE_SELF_PARSE_PASS',
            publishAllowed: true,
            finalArtifactSha256: `sha256:${crypto.createHash('sha256').update(realDocumentBuffer).digest('hex')}`,
            coreManifestDigest: source.exportCapsule.coreManifestDigest,
            provisionalSelfParse: { verified: true },
            finalSelfParse: { semanticEquivalent: true },
            yrtk2Verification: { code: 'RTK_RETURN_INTAKE_YRTK2_VERIFIED' },
          },
        };
      },
      async queueDiskOperation(operation) { return operation(); },
      async writeBufferAtomic(targetPath, buffer) {
        fs.writeFileSync(targetPath, buffer);
      },
      updateStatus() {},
      async readWrittenBuffer(targetPath) { return fs.readFileSync(targetPath); },
      async activateReviewDocxExportAuthority(pendingStore) {
        activateCallCount += 1;
        capturedStore = pendingStore;
        return { storePath: outPath, authorityStoreDigest: 'activated-e8' };
      },
    },
  );

  // E8 CONTROL (1) FUNCTIONAL: the export must succeed and the activation must
  // have run exactly once after gate + atomic write + exact readback.
  assert.equal(result.ok, true, `E8: successful export expected but got ok:false: ${JSON.stringify(result)}`);
  assert.equal(
    activateCallCount,
    1,
    'E8: activation must run exactly once after gate + write + exact readback',
  );

  // POSITIVE CONTROL round-trip: the activated round must stay RESOLVABLE.
  // This mirrors findDocxReviewReturnIntakeRoundAuthority(store, roundId) in
  // src/main.js (roundsById lookup), which is the exact point that returns null
  // when the authority store record is rejected by the validator. We assert the
  // round is present and carries the local authority binding (hmacSecret +
  // expectedAuthority + roundId) so return intake can resolve it.
  assert.ok(isPlainObjectValue(capturedStore), 'E8: activation must capture the authority store');
  assert.equal(
    capturedStore.schemaVersion,
    'yalken.docx-review-return-authority-store.v1',
    'E8: captured store must carry the canonical authority-store schema version',
  );
  assert.equal(capturedStore.lastRoundId, roundId, 'E8: captured store lastRoundId must match the exported round');
  const roundsById = isPlainObjectValue(capturedStore.roundsById) ? capturedStore.roundsById : {};
  const activatedRound = roundsById[roundId];
  assert.ok(
    isPlainObjectValue(activatedRound),
    'E8: activated round must be present in roundsById so return intake can resolve it',
  );
  assert.equal(
    activatedRound.roundId,
    roundId,
    'E8: activated round capsule must carry the matching roundId',
  );
  // ROUND-01 (V3) amendment: the raw HMAC secret is replaced by an opaque
  // keyRef on the durable round (the secret now lives only in the main-process
  // key vault, and buildDocxReviewReturnAuthorityStoreRecord redacts it before
  // the durable write). The activated round must carry the opaque keyRef + the
  // public correlation material (keyIdHex / roundIdHex) so return intake can
  // resolve the vault handle. The raw hmacSecret is verified absent from the
  // DURABLE record by R2 (buildCurrentDurableRecord redacts it); the in-memory
  // pending capsule may retain it for the live return-router proof binding.
  assert.equal(
    typeof activatedRound.keyRef,
    'string',
    'E8: activated round must carry the opaque keyRef for return-intake binding',
  );
  assert.ok(
    activatedRound.keyRef.length > 0,
    'E8: activated round keyRef must be non-empty',
  );
  assert.equal(
    typeof activatedRound.keyIdHex,
    'string',
    'E8: activated round must carry public keyIdHex correlation',
  );
  assert.equal(
    typeof activatedRound.roundIdHex,
    'string',
    'E8: activated round must carry public roundIdHex correlation',
  );
  assert.ok(
    isPlainObjectValue(activatedRound.expectedAuthority),
    'E8: activated round must carry expectedAuthority for return-intake binding',
  );

  // E8 CONTROL (2) FIELD-NAME CANONICALITY on the single-scene advisory block in
  // src/main.js. The typo that caused the round-trip regression lived in
  // readDocxReviewPacketExportSource's final advisoryManifest.yrtk2 block. This
  // source-text assertion is the direct guard: the canonical
  // `secretEmbeddedInDocx` key MUST appear in that block, and the non-canonical
  // `secretExposedInDocx` typo MUST NOT appear anywhere in main.js. A read of
  // the single-scene advisory block (between the final advisoryManifest: { and
  // the next exportCapsule key) confirms the value is boolean false.
  const mainSource = readText('src/main.js');
  assert.equal(
    mainSource.includes('secretExposedInDocx'),
    false,
    'E8: src/main.js must not contain the non-canonical secretExposedInDocx typo '
    + '(the return-intake parser and durable validator read secretEmbeddedInDocx; '
    + 'a renamed field reads undefined and breaks round-trip resolution)',
  );
  assert.equal(
    mainSource.includes('secretEmbeddedInDocx'),
    true,
    'E8: src/main.js must use the canonical secretEmbeddedInDocx field name',
  );

  // Isolate the single-scene final advisoryManifest.yrtk2 block and assert the
  // canonical field is present there with value false. The block starts at the
  // final `advisoryManifest: {` (the non-provisional one) and ends at the
  // `exportCapsule,` key that follows it.
  const advisoryIndex = mainSource.lastIndexOf('advisoryManifest: {');
  assert.notEqual(advisoryIndex, -1, 'E8: expected a final advisoryManifest block in src/main.js');
  const exportCapsuleIndex = mainSource.indexOf('exportCapsule,', advisoryIndex);
  assert.ok(exportCapsuleIndex > advisoryIndex, 'E8: expected exportCapsule key after the final advisoryManifest');
  const advisoryBlock = mainSource.slice(advisoryIndex, exportCapsuleIndex);
  assert.match(
    advisoryBlock,
    /secretEmbeddedInDocx:\s*false/u,
    'E8: single-scene advisoryManifest.yrtk2 must carry canonical secretEmbeddedInDocx: false '
    + '(a renamed field here would serialize into the DOCX customXml payload and break return-intake resolution)',
  );
  assert.doesNotMatch(
    advisoryBlock,
    /secretExposedInDocx/u,
    'E8: single-scene advisoryManifest.yrtk2 must not carry the secretExposedInDocx typo',
  );

  // Canonicality of the full-manuscript source route (used by this test's
  // functional leg): the advisory yrtk2 block must carry the canonical field
  // too, so the customXml payload it produces is readable by the return-intake
  // parser. This double-checks the round-trip on the real builder output.
  assert.equal(
    source.advisoryManifest.yrtk2.secretEmbeddedInDocx,
    false,
    'E8: full-manuscript advisory yrtk2 secret guard must be canonical secretEmbeddedInDocx === false',
  );
  assert.equal(
    'secretEmbeddedInDocx' in source.advisoryManifest.yrtk2,
    true,
    'E8: full-manuscript advisory yrtk2 must carry the canonical secretEmbeddedInDocx key',
  );
});

function isPlainObjectValue(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
