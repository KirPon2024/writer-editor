const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const YRTK2_CORE_PATH = 'src/io/revisionBridge/reviewTransportYrtk2Core.mjs';
const MANIFEST_CORE_PATH = 'src/io/revisionBridge/reviewTransportManifestCore.mjs';
const PARSER_V2_PATH = 'src/io/revisionBridge/reviewTransportPackageParserV2.mjs';
const IR_PATH = 'src/io/revisionBridge/reviewTransportIr.mjs';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function makeCrc32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c >>> 0;
  }
  return table;
}

const CRC32_TABLE = makeCrc32Table();

function crc32Text(value) {
  const buffer = Buffer.from(String(value || ''), 'utf8');
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const cryptoPort = {
  sha256Text(value) {
    return crypto.createHash('sha256').update(Buffer.from(String(value || ''), 'utf8')).digest('hex');
  },
  sha256Json(value) {
    return `sha256:${this.sha256Text(stableJson(value))}`;
  },
  hmacSha256Text(value, secret) {
    return `hmac-sha256:${crypto.createHmac('sha256', Buffer.from(String(secret || ''), 'utf8')).update(Buffer.from(String(value || ''), 'utf8')).digest('hex')}`;
  },
  hmacSha256Json(value, secret) {
    return `hmac-sha256:${crypto.createHmac('sha256', Buffer.from(String(secret || ''), 'utf8')).update(Buffer.from(stableJson(value), 'utf8')).digest('hex')}`;
  },
  byteLength(value) {
    return Buffer.byteLength(String(value || ''), 'utf8');
  },
  crc32(value) {
    return crc32Text(value);
  },
};

function digest(seed) {
  return `sha256:${crypto.createHash('sha256').update(Buffer.from(seed, 'utf8')).digest('hex')}`;
}

async function loadYrtk2Core() {
  return import(pathToFileURL(path.join(REPO_ROOT, YRTK2_CORE_PATH)).href);
}

async function loadManifestCore() {
  return import(pathToFileURL(path.join(REPO_ROOT, MANIFEST_CORE_PATH)).href);
}

async function loadParserV2() {
  return import(pathToFileURL(path.join(REPO_ROOT, PARSER_V2_PATH)).href);
}

async function loadIr() {
  return import(pathToFileURL(path.join(REPO_ROOT, IR_PATH)).href);
}

// ExportMap fixture with placement-bearing fields as the full-manuscript producer emits
// (src/export/docx/fullManuscriptDocxReviewPacketSource.js:717-739): scope, sceneOrdinal,
// documentParagraphIndex, formatIr. Two scenes x two blocks, with distinctive ordinals
// so any field-preserving digest MUST separate the variants.
function exportMapFixture(overrides = {}) {
  return {
    exportMapId: 'export-map-canon01',
    profileId: 'word-mac-latest-safe-semantic-roundtrip-v4',
    scope: 'full-manuscript',
    roundId: 'round-canon01',
    scenes: [
      {
        sceneId: 'scene-alpha',
        sceneOrdinal: 0,
        sceneRevision: 'revision-alpha',
        rawSha256: digest('scene-alpha-text'),
        blocks: [
          {
            blockId: 'block-alpha-0',
            paragraphId: 'yrtk-01-p-aaa',
            documentParagraphIndex: 0,
            canonicalTextSha256: digest('block-alpha-0-text'),
            canonicalMarksSha256: digest('block-alpha-0-marks'),
            formatIr: { runs: [{ bold: true }], kind: 'scene-01-block-0' },
            wordSignals: [
              {
                kind: 'w14ParaIdTextId',
                value: { paraId: '00aa00bb', textId: '11cc11dd' },
                applyAuthority: false,
              },
            ],
          },
          {
            blockId: 'block-alpha-1',
            paragraphId: 'yrtk-01-p-bbb',
            documentParagraphIndex: 1,
            canonicalTextSha256: digest('block-alpha-1-text'),
            canonicalMarksSha256: digest('block-alpha-1-marks'),
            formatIr: { runs: [{ italic: true }], kind: 'scene-01-block-1' },
            wordSignals: [
              {
                kind: 'w14ParaIdTextId',
                value: { paraId: '22bb22cc', textId: '33dd33ee' },
                applyAuthority: false,
              },
            ],
          },
        ],
      },
      {
        sceneId: 'scene-beta',
        sceneOrdinal: 1,
        sceneRevision: 'revision-beta',
        rawSha256: digest('scene-beta-text'),
        blocks: [
          {
            blockId: 'block-beta-0',
            paragraphId: 'yrtk-02-p-ccc',
            documentParagraphIndex: 2,
            canonicalTextSha256: digest('block-beta-0-text'),
            canonicalMarksSha256: digest('block-beta-0-marks'),
            formatIr: { runs: [{ underline: 'single' }], kind: 'scene-02-block-0' },
            wordSignals: [
              {
                kind: 'w14ParaIdTextId',
                value: { paraId: '44ee44ff', textId: '55aa55bb' },
                applyAuthority: false,
              },
            ],
          },
          {
            blockId: 'block-beta-1',
            paragraphId: 'yrtk-02-p-ddd',
            documentParagraphIndex: 3,
            canonicalTextSha256: digest('block-beta-1-text'),
            canonicalMarksSha256: digest('block-beta-1-marks'),
            formatIr: { runs: [{ strike: true }], kind: 'scene-02-block-1' },
            wordSignals: [
              {
                kind: 'w14ParaIdTextId',
                value: { paraId: '66ff6600', textId: '77bb77cc' },
                applyAuthority: false,
              },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

// Minimal manifest input shape compatible with createWordV4CoreManifest.
function manifestInputForExportMap(exportMap, { hashTree } = {}) {
  return {
    profileId: 'word-mac-latest-safe-semantic-roundtrip-v4',
    projectId: 'project-canon01',
    roundId: 'round-canon01',
    exportArtifactId: 'export-canon01',
    semanticReturnId: 'semantic-return-canon01',
    createdAtUtc: '2026-08-08T00:00:00.000Z',
    compileIrDigest: digest('compile-ir-canon01'),
    actualBaselineDigest: digest('actual-baseline-canon01'),
    parserProfileDigest: digest('parser-profile-canon01'),
    capabilityProfileDigest: digest('capability-profile-canon01'),
    artifactIdentities: {
      provisionalDocxSha256: digest('provisional-docx-canon01'),
      returnArtifactId: 'return-canon01',
      applyId: 'apply-canon01',
      effectIds: ['effect-b', 'effect-a'],
    },
    exportMap,
    hashTree: hashTree || canon01HashTreeForExportMap(exportMap, { projectId: 'project-canon01' }),
  };
}

// Canonical tree recipe expected from Pass 2: bottom-up BlockDigest -> SceneDigest -> RootDigest
// over the ORDERED export map, with domain separation. Pinned here as the contract the honest
// tree (C8) must satisfy and that recompute (C5) must reconcile against.
const CANON01_DOMAIN_BLOCK = 'domainBlock';
const CANON01_DOMAIN_SCENE = 'domainScene';
const CANON01_DOMAIN_ROOT = 'domainRoot';

// CANON-01 canonical tree recipe: bottom-up BlockDigest -> SceneDigest -> RootDigest over the
// ORDERED export map, with domain separation. The builder normalizes ordinals/formatIr to the
// same closed form the CoreManifest projection uses (safe-integer ordinals, else null; formatIr
// as the cloned object, else null), so an honestly-built tree reconciles against the validator's
// recompute over the normalized manifest payload.
function canon01NormOrdinal(value) {
  return Number.isSafeInteger(value) ? value : null;
}

function canon01NormFormatIr(value) {
  return value === undefined || value === null ? null : JSON.parse(JSON.stringify(value));
}

function canon01BlockDigest(block, { sceneId, sceneOrdinal, documentParagraphIndex }) {
  return cryptoPort.sha256Json({
    domain: CANON01_DOMAIN_BLOCK,
    sceneId,
    sceneOrdinal,
    documentParagraphIndex,
    blockId: block.blockId,
    paragraphId: block.paragraphId,
    canonicalTextSha256: block.canonicalTextSha256,
    canonicalMarksSha256: block.canonicalMarksSha256,
    formatIr: canon01NormFormatIr(block.formatIr),
  });
}

function canon01SceneDigest(scene, { projectId, blockDigestByBlockId }) {
  return cryptoPort.sha256Json({
    domain: CANON01_DOMAIN_SCENE,
    projectId,
    sceneId: scene.sceneId,
    sceneOrdinal: canon01NormOrdinal(scene.sceneOrdinal),
    sceneRevision: scene.sceneRevision,
    rawSha256: scene.rawSha256,
    blockDigests: scene.blocks.map((block) => ({
      blockId: block.blockId,
      digest: blockDigestByBlockId.get(block.blockId),
    })),
  });
}

function canon01RootDigest(sceneDigestsOrdered) {
  return cryptoPort.sha256Json({ domain: CANON01_DOMAIN_ROOT, sceneDigests: sceneDigestsOrdered });
}

function canon01HashTreeForExportMap(exportMap, { projectId = 'project-canon01' } = {}) {
  const blockDigests = [];
  const blockDigestByBlockId = new Map();
  for (const scene of exportMap.scenes) {
    for (const block of scene.blocks) {
      const sceneOrdinal = canon01NormOrdinal(scene.sceneOrdinal);
      const documentParagraphIndex = canon01NormOrdinal(block.documentParagraphIndex);
      const entry = {
        sceneId: scene.sceneId,
        sceneOrdinal,
        documentParagraphIndex,
        blockId: block.blockId,
        digest: canon01BlockDigest(block, {
          sceneId: scene.sceneId,
          sceneOrdinal,
          documentParagraphIndex,
        }),
      };
      blockDigests.push(entry);
      blockDigestByBlockId.set(block.blockId, entry.digest);
    }
  }
  const sceneDigests = exportMap.scenes.map((scene) => ({
    sceneId: scene.sceneId,
    sceneOrdinal: canon01NormOrdinal(scene.sceneOrdinal),
    digest: canon01SceneDigest(scene, { projectId, blockDigestByBlockId }),
  }));
  return {
    rootDigest: canon01RootDigest(sceneDigests.map((entry) => ({ sceneId: entry.sceneId, digest: entry.digest }))),
    sceneDigests,
    blockDigests,
  };
}

// --- YRTK2 CoreManifest collision falsifiers (C1-C5, C8) ---

test('CANON01-C1-scope-collision-killed', async () => {
  const core = await loadYrtk2Core();
  const fullManuscript = manifestInputForExportMap(exportMapFixture({ scope: 'full-manuscript' }));
  const sceneScope = manifestInputForExportMap(exportMapFixture({ scope: 'scene' }));
  const digestFull = core.createWordV4CoreManifest(fullManuscript, { cryptoPort });
  const digestScene = core.createWordV4CoreManifest(sceneScope, { cryptoPort });

  assert.equal(digestFull.ok, true);
  assert.equal(digestScene.ok, true);
  // CURRENT: normalizeExportMap drops scope (reviewTransportYrtk2Core.mjs:75-98), so digests collide.
  // TARGET: scope participates in the manifest digest, so the two digests MUST differ.
  assert.notEqual(
    digestFull.coreManifestDigest,
    digestScene.coreManifestDigest,
    'RED: scope field is dropped by normalizeExportMap, producing identical CoreManifest digests for full-manuscript vs scene scope over identical block payloads.',
  );
});

test('CANON01-C2-order-collision-killed', async () => {
  const core = await loadYrtk2Core();
  const mapA = exportMapFixture();
  // Swap scene order while keeping every ID identical; normalizeExportMap re-sorts by sceneId.
  const scenesSwapped = [...mapA.scenes].reverse();
  const mapB = exportMapFixture({ scenes: scenesSwapped });
  // Also exercise the block-order variant inside scene-alpha.
  const mapC = exportMapFixture({
    scenes: mapA.scenes.map((scene, index) => (
      index === 0 ? { ...scene, blocks: [...scene.blocks].reverse() } : scene
    )),
  });
  const inputA = manifestInputForExportMap(mapA);
  const inputB = manifestInputForExportMap(mapB);
  const inputC = manifestInputForExportMap(mapC);
  const digestA = core.createWordV4CoreManifest(inputA, { cryptoPort });
  const digestB = core.createWordV4CoreManifest(inputB, { cryptoPort });
  const digestC = core.createWordV4CoreManifest(inputC, { cryptoPort });

  assert.equal(digestA.ok, true);
  assert.equal(digestB.ok, true);
  assert.equal(digestC.ok, true);
  // CURRENT: normalizeExportMap sorts scenes and blocks by ID (reviewTransportYrtk2Core.mjs:95-96),
  // so a pure order swap leaves the normalized payload byte-identical and digests collide.
  // TARGET: ordered projection MUST feed the digest, so reordered maps MUST produce different digests.
  assert.notEqual(
    digestA.coreManifestDigest,
    digestB.coreManifestDigest,
    'RED: scene order swap is erased by ID sort in normalizeExportMap, colliding CoreManifest digests.',
  );
  assert.notEqual(
    digestA.coreManifestDigest,
    digestC.coreManifestDigest,
    'RED: block order swap is erased by ID sort in normalizeExportMap, colliding CoreManifest digests.',
  );
});

test('CANON01-C3-ordinal-drop-killed', async () => {
  const core = await loadYrtk2Core();
  const mapWithOrdinals = exportMapFixture();
  const mapWithoutOrdinals = exportMapFixture({
    scenes: mapWithOrdinals.scenes.map((scene) => ({
      ...scene,
      blocks: scene.blocks.map((block) => {
        const { documentParagraphIndex, formatIr, ...blockRest } = block;
        void documentParagraphIndex;
        void formatIr;
        const { sceneOrdinal, ...sceneRest } = scene;
        void sceneOrdinal;
        void sceneRest;
        return blockRest;
      }),
    })),
  });
  const inputWith = manifestInputForExportMap(mapWithOrdinals);
  const inputWithout = manifestInputForExportMap(mapWithoutOrdinals);
  const digestWith = core.createWordV4CoreManifest(inputWith, { cryptoPort });
  const digestWithout = core.createWordV4CoreManifest(inputWithout, { cryptoPort });

  assert.equal(digestWith.ok, true);
  assert.equal(digestWithout.ok, true);
  // CURRENT: normalizeExportMap never reads sceneOrdinal / documentParagraphIndex (only sceneId,
  // sceneRevision, rawSha256, blockId, paragraphId, digests, wordSignals), so dropping ordinals
  // leaves the digest unchanged.
  // TARGET: ordinals participate in the digest, so presence/absence of sceneOrdinal MUST change it.
  assert.notEqual(
    digestWith.coreManifestDigest,
    digestWithout.coreManifestDigest,
    'RED: sceneOrdinal / documentParagraphIndex are not read by normalizeExportMap, so dropping them never changes the CoreManifest digest.',
  );
});

test('CANON01-C4-formatir-collision-killed', async () => {
  const core = await loadYrtk2Core();
  const mapA = exportMapFixture();
  const mapB = exportMapFixture({
    scenes: mapA.scenes.map((scene, index) => (
      index === 0
        ? {
            ...scene,
            blocks: scene.blocks.map((block, blockIndex) => (
              blockIndex === 0
                ? { ...block, formatIr: { runs: [{ color: 'FF0000' }], kind: 'mutated-format-ir' } }
                : block
            )),
          }
        : scene
    )),
  });
  const inputA = manifestInputForExportMap(mapA);
  const inputB = manifestInputForExportMap(mapB);
  const digestA = core.createWordV4CoreManifest(inputA, { cryptoPort });
  const digestB = core.createWordV4CoreManifest(inputB, { cryptoPort });

  assert.equal(digestA.ok, true);
  assert.equal(digestB.ok, true);
  // CURRENT: normalizeExportMap drops formatIr (reviewTransportYrtk2Core.mjs:85-95), so mutating
  // a block's formatting IR does not change the digest.
  // TARGET: formatIr participates in the digest, so two blocks differing only in formatIr MUST differ.
  assert.notEqual(
    digestA.coreManifestDigest,
    digestB.coreManifestDigest,
    'RED: formatIr is dropped by normalizeExportMap, so a block formatting-IR mutation does not change the CoreManifest digest.',
  );
});

test('CANON01-C5-non-recomputing-tree-rejected', async () => {
  const core = await loadYrtk2Core();
  // Well-formed hash tree (all digests present, valid shape) BUT the digests are constants
  // unrelated to the exportMap payload — exactly the e03 fixture style where digest('root')
  // is a seed unrelated to block/scene content. A reconciling validator MUST recompute the tree
  // bottom-up from the ordered export map and reject this mismatch.
  const exportMap = exportMapFixture();
  const fakeTree = {
    rootDigest: digest('root'),
    sceneDigests: [
      { sceneId: 'scene-alpha', digest: digest('scene-alpha-fake') },
      { sceneId: 'scene-beta', digest: digest('scene-beta-fake') },
    ],
    blockDigests: [
      { sceneId: 'scene-alpha', blockId: 'block-alpha-0', digest: digest('block-alpha-0-fake') },
      { sceneId: 'scene-alpha', blockId: 'block-alpha-1', digest: digest('block-alpha-1-fake') },
      { sceneId: 'scene-beta', blockId: 'block-beta-0', digest: digest('block-beta-0-fake') },
      { sceneId: 'scene-beta', blockId: 'block-beta-1', digest: digest('block-beta-1-fake') },
    ],
  };
  const created = core.createWordV4CoreManifest(manifestInputForExportMap(exportMap, { hashTree: fakeTree }), { cryptoPort });

  // CURRENT: validateCoreManifestPayload (reviewTransportYrtk2Core.mjs:164-183) only checks that
  // rootDigest is a syntactically valid sha256 string; it never recomputes block/scene/root from
  // the export map, so a tree of arbitrary fake digests is accepted as ok.
  // TARGET: the validator MUST recompute the tree bottom-up and reject with a typed code in the
  // RTK_V4_CORE_MANIFEST_HASH_TREE_* family (e.g. RTK_V4_CORE_MANIFEST_HASH_TREE_RECOMPUTE_MISMATCH).
  assert.equal(created.ok, false, 'RED: validateCoreManifestPayload never recomputes the hash tree, so a well-formed tree of fake digests is accepted.');
  assert.equal(
    (created.reasons || []).some((item) => item.code.startsWith('RTK_V4_CORE_MANIFEST_HASH_TREE_')),
    true,
    'RED: no RTK_V4_CORE_MANIFEST_HASH_TREE_* recompute rejection exists; Pass 2 must introduce one.',
  );
});

test('CANON01-C8-honest-tree-validates', async () => {
  const core = await loadYrtk2Core();
  const exportMap = exportMapFixture();
  const honestTree = canon01HashTreeForExportMap(exportMap, { projectId: 'project-canon01' });
  const created = core.createWordV4CoreManifest(
    manifestInputForExportMap(exportMap, { hashTree: honestTree }),
    { cryptoPort },
  );

  assert.equal(created.ok, true);
  // CURRENT: there is no recompute path, so even an honestly-built canonical tree cannot be
  // validated BY recomputation — only accepted because rootDigest is a valid sha256 string.
  // TARGET: Pass 2 introduces bottom-up recompute over the ordered export map, and this honest
  // canonical tree MUST reconcile cleanly (no RTK_V4_CORE_MANIFEST_HASH_TREE_* reason).
  assert.equal(
    (created.reasons || []).some((item) => item.code.startsWith('RTK_V4_CORE_MANIFEST_HASH_TREE_')),
    false,
    'RED (acceptable): no recompute path exists yet, so the honest canonical tree cannot be validated by recomputation; Pass 2 must add it and keep this green.',
  );
});

// --- Semantic digest relocation falsifiers (C6) ---

function documentXml(body, prefix = 'w') {
  return `<${prefix}:document xmlns:${prefix}="${W_NS}"><${prefix}:body>${body}</${prefix}:body></${prefix}:document>`;
}

function baseParts(document) {
  return {
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': document,
  };
}

test('CANON01-C6-relocation-changes-semantic-digest', async () => {
  const parser = await loadParserV2();
  // Same insert revision, same author/date/id/text — only its paragraph placement differs.
  // Variant A: the revision lives in paragraph 1.
  const partsA = baseParts(documentXml(
    '<w:p><w:ins w:id="1" w:author="A" w:date="2026-08-08T10:00:00Z"><w:r><w:t>Inserted</w:t></w:r></w:ins></w:p>'
      + '<w:p><w:r><w:t>Plain paragraph two</w:t></w:r></w:p>',
  ));
  // Variant B: the revision lives in paragraph 2 (relocated between paragraphs).
  const partsB = baseParts(documentXml(
    '<w:p><w:r><w:t>Plain paragraph two</w:t></w:r></w:p>'
      + '<w:p><w:ins w:id="1" w:author="A" w:date="2026-08-08T10:00:00Z"><w:r><w:t>Inserted</w:t></w:r></w:ins></w:p>',
  ));
  const resultA = parser.parseReviewTransportPackageV2({ parts: partsA }, { cryptoPort });
  const resultB = parser.parseReviewTransportPackageV2({ parts: partsB }, { cryptoPort });

  assert.equal(resultA.ok, true);
  assert.equal(resultB.ok, true);
  // CURRENT: parserV2 semanticProjection.textRevisions emits operation/nativeRevisionId/
  // textDigest/replacementGroupId (reviewTransportPackageParserV2.mjs:2352-2357) WITHOUT any
  // paragraph index, so supportedSemanticDigest is placement-blind and identical after relocation.
  // TARGET: placement participates in the semantic projection, so relocation MUST change the digest.
  assert.notEqual(
    resultA.supportedSemanticDigest,
    resultB.supportedSemanticDigest,
    'RED: parserV2 semanticProjection omits paragraph placement, so supportedSemanticDigest is identical after relocating a revision between paragraphs.',
  );
});

test('CANON01-C6b-relocation-changes-semantic-digest-comment', async () => {
  const parser = await loadParserV2();
  const commentParts = (anchorBody) => ({
    ...baseParts(documentXml(anchorBody)),
    'word/comments.xml': `<w:comments xmlns:w="${W_NS}"><w:comment w:id="7" w:author="Author A" w:date="2026-08-08T10:00:00Z"><w:p><w:r><w:t>Root body</w:t></w:r></w:p></w:comment></w:comments>`,
  });
  // Variant A: commentRangeStart/End anchor paragraph 1.
  const partsA = commentParts(
    '<w:p><w:commentRangeStart w:id="7"/><w:r><w:t>quoted anchor</w:t></w:r><w:commentRangeEnd w:id="7"/><w:r><w:commentReference w:id="7"/></w:r></w:p>'
      + '<w:p><w:r><w:t>Unrelated paragraph two</w:t></w:r></w:p>',
  );
  // Variant B: the SAME comment anchor is relocated to paragraph 2.
  const partsB = commentParts(
    '<w:p><w:r><w:t>Unrelated paragraph two</w:t></w:r></w:p>'
      + '<w:p><w:commentRangeStart w:id="7"/><w:r><w:t>quoted anchor</w:t></w:r><w:commentRangeEnd w:id="7"/><w:r><w:commentReference w:id="7"/></w:r></w:p>',
  );
  const resultA = parser.parseReviewTransportPackageV2({ parts: partsA }, { cryptoPort });
  const resultB = parser.parseReviewTransportPackageV2({ parts: partsB }, { cryptoPort });

  assert.equal(resultA.ok, true);
  assert.equal(resultB.ok, true);
  // CURRENT: parserV2 semanticProjection.commentThreads emits commentId/durableId/status/
  // doneResolvedReopenedState/relatedRevision/replyDigests/bodyDigest (2365-2378) WITHOUT any
  // anchor paragraph index, so supportedSemanticDigest is placement-blind for comment relocation.
  // TARGET: anchor placement participates in the semantic projection, so relocation MUST change digest.
  assert.notEqual(
    resultA.supportedSemanticDigest,
    resultB.supportedSemanticDigest,
    'RED: parserV2 semanticProjection.commentThreads omits anchor placement, so supportedSemanticDigest is identical after relocating a comment between paragraphs.',
  );
});

test('CANON01-C6c-relocation-changes-semantic-digest-w2-path', async () => {
  const ir = await loadIr();
  // W2 path (buildW2ReviewIr -> buildReviewIRV2) builds semanticProjection over canonicalDocument
  // full XML (reviewTransportCore.mjs:709-711), so it is placement-aware TODAY. This control
  // documents the asymmetry: the same relocation that is blind in parserV2 MUST be visible in W2.
  // This subtest is expected GREEN now and must stay GREEN after Pass 2.
  const partsA = baseParts(documentXml(
    '<w:p><w:ins w:id="1" w:author="A" w:date="2026-08-08T10:00:00Z"><w:r><w:t>Inserted</w:t></w:r></w:ins></w:p>'
      + '<w:p><w:r><w:t>Plain paragraph two</w:t></w:r></w:p>',
  ));
  const partsB = baseParts(documentXml(
    '<w:p><w:r><w:t>Plain paragraph two</w:t></w:r></w:p>'
      + '<w:p><w:ins w:id="1" w:author="A" w:date="2026-08-08T10:00:00Z"><w:r><w:t>Inserted</w:t></w:r></w:ins></w:p>',
  ));
  const resultA = ir.buildW2ReviewIr({ parts: partsA });
  const resultB = ir.buildW2ReviewIr({ parts: partsB });

  assert.equal(resultA.ok, true);
  assert.equal(resultB.ok, true);
  assert.notEqual(
    resultA.supportedSemanticDigest,
    resultB.supportedSemanticDigest,
    'CONTROL (green now): W2 path digest is placement-aware via canonicalDocument XML and MUST differ on relocation; if this fails, W2 regressed.',
  );
});

// --- Namespace-invariance control (C7) ---

test('CANON01-C7-namespace-invariance-preserved', async () => {
  const parser = await loadParserV2();
  const first = parser.parseReviewTransportPackageV2({
    parts: baseParts(documentXml('<w:p><w:ins w:id="1" w:author="A" w:date="2026-08-08T10:00:00Z"><w:r><w:t>Alpha</w:t></w:r></w:ins></w:p>')),
  }, { cryptoPort });
  const second = parser.parseReviewTransportPackageV2({
    parts: baseParts(documentXml('<x:p><x:ins x:date="2026-08-08T10:00:00Z" x:author="A" x:id="1"><x:r><x:t>Alpha</x:t></x:r></x:ins></x:p>', 'x')),
  }, { cryptoPort });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  // CONTROL: namespace-prefix rename and attribute reorder MUST leave supportedSemanticDigest
  // identical (this is the b02 determinism pin). Green now and MUST remain green after Pass 2,
  // i.e. placement sensitivity must not break namespace invariance.
  assert.equal(first.supportedSemanticDigest, second.supportedSemanticDigest);
});

// --- YRTK2 token shape control (C9) ---

test('CANON01-C9-yrtk2-token-shape-and-roundtrip', async () => {
  const core = await loadYrtk2Core();
  const created = core.createWordV4CoreManifest(manifestInputForExportMap(exportMapFixture()), { cryptoPort });
  assert.equal(created.ok, true);
  const token = core.createYrtk2RoundLocatorToken({
    keyIdHex: '00112233445566778899aabbccddeeff',
    roundIdHex: 'ffeeddccbbaa99887766554433221100',
    coreManifestDigest: created.coreManifestDigest,
    hmacSecret: 'secret-canon01',
  }, { cryptoPort });
  const verified = core.verifyYrtk2RoundLocatorToken({
    token: token.token,
    hmacSecret: 'secret-canon01',
    expectedKeyIdHex: '00112233445566778899aabbccddeeff',
    expectedRoundIdHex: 'ffeeddccbbaa99887766554433221100',
    expectedCoreManifestDigest: created.coreManifestDigest,
  }, { cryptoPort });

  assert.equal(core.RTK_WORD_V4_YRTK2_TOKEN_LENGTH, 135);
  assert.equal(token.ok, true);
  assert.equal(token.token.length, 135);
  assert.equal(token.secretEmbeddedInDocx, false);
  assert.equal(verified.ok, true);
  assert.equal(verified.exactAuthority, true);
});

// --- Transport manifest order falsifier + HMAC round-trip control (C10) ---

function locatorSignal(blockId) {
  return {
    signalId: `${blockId}:signed-scene-block-baseline`,
    kind: 'signed-scene-block-baseline-v1',
    authority: 'required-apply-authority',
    value: { blockId },
  };
}

function transportSceneSnapshots(overrides = {}) {
  return [
    {
      sceneId: 'scene-alpha',
      sceneRevision: 'revision-alpha',
      rawSha256: digest('scene-alpha-text'),
      blocks: [
        {
          blockId: 'block-alpha-0',
          paragraphId: 'yrtk-01-p-aaa',
          canonicalTextSha256: digest('block-alpha-0-text'),
          canonicalMarksSha256: digest('block-alpha-0-marks'),
          locatorSignals: [locatorSignal('block-alpha-0')],
        },
        {
          blockId: 'block-alpha-1',
          paragraphId: 'yrtk-01-p-bbb',
          canonicalTextSha256: digest('block-alpha-1-text'),
          canonicalMarksSha256: digest('block-alpha-1-marks'),
          locatorSignals: [locatorSignal('block-alpha-1')],
        },
      ],
    },
    ...overrides.extra || [],
  ];
}

function transportManifestInput(snapshots) {
  return {
    profileId: 'word-mac-latest-safe-semantic-roundtrip-v4',
    manifestId: 'transport-manifest-canon01',
    projectId: 'project-canon01',
    roundId: 'round-canon01',
    exportId: 'export-canon01',
    exportedAtUtc: '2026-08-08T00:00:00.000Z',
    sceneSnapshots: snapshots,
    hmacSecret: 'secret-transport-canon01',
    keyId: 'local-yalken-export-secret-v1',
  };
}

test('CANON01-C10-transport-manifest-order-killed', async () => {
  const manifestCore = await loadManifestCore();
  // Variant A: blocks in canonical order (block-alpha-0 then block-alpha-1).
  const snapshotsA = transportSceneSnapshots();
  // Variant B: the SAME blocks are reversed inside scene-alpha.
  const snapshotsB = transportSceneSnapshots();
  snapshotsB[0] = { ...snapshotsB[0], blocks: [...snapshotsB[0].blocks].reverse() };
  const createdA = manifestCore.createReviewTransportManifestV2(transportManifestInput(snapshotsA), { cryptoPort });
  const createdB = manifestCore.createReviewTransportManifestV2(transportManifestInput(snapshotsB), { cryptoPort });

  assert.equal(createdA.ok, true);
  assert.equal(createdB.ok, true);
  // CURRENT: normalizeSceneSnapshots sorts blocks by blockId (reviewTransportManifestCore.mjs:67),
  // so reversing block order leaves the normalized payload byte-identical and payloadDigest collides.
  // TARGET: ordered block sequence MUST participate in payloadDigest, so order swap MUST differ.
  assert.notEqual(
    createdA.manifest.payloadDigest,
    createdB.manifest.payloadDigest,
    'RED: normalizeSceneSnapshots sorts blocks by blockId, so reversing block order inside a scene does not change payloadDigest.',
  );
});

test('CANON01-C10-control-honest-transport-manifest-roundtrip', async () => {
  const manifestCore = await loadManifestCore();
  const created = manifestCore.createReviewTransportManifestV2(
    transportManifestInput(transportSceneSnapshots()),
    { cryptoPort },
  );
  const verified = manifestCore.verifyReviewTransportManifestV2(created.manifest, {
    cryptoPort,
    hmacSecret: 'secret-transport-canon01',
  });

  // CONTROL (green now): honest transport manifest HMAC round-trip MUST verify. This must remain
  // green after Pass 2 introduces order sensitivity — order must not break the honest path.
  assert.equal(created.ok, true);
  assert.equal(verified.ok, true);
  assert.equal(verified.exactAuthority, true);
});
