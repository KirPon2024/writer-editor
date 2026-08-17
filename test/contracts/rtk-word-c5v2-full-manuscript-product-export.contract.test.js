'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const COMMAND_ID = 'cmd.project.review.exportFullManuscriptDocxReviewPacket';
const CAPABILITY_ID = 'cap.project.review.exportFullManuscriptDocxReviewPacket';
const C5V2_WORD_16_112_FULL_MANUSCRIPT_PROFILE_ID = 'word-mac-16.112-26081010-product-review-export-c5v2-full-manuscript';

function readText(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function makeScenes() {
  return [
    {
      sceneId: 'roman/preface.md',
      scenePath: '/project/roman/preface.md',
      title: 'Preface',
      text: 'The artist is the creator of beautiful things.\nTo reveal art and conceal the artist is art’s aim.',
      order: 0,
    },
    {
      sceneId: 'roman/chapter-01.md',
      scenePath: '/project/roman/chapter-01.md',
      title: 'Chapter 1',
      text: 'The studio was filled with the rich odour of roses.\nLord Henry looked at him.',
      order: 1,
    },
    {
      sceneId: 'roman/chapter-02.md',
      scenePath: '/project/roman/chapter-02.md',
      title: 'Chapter 2',
      text: 'The next day, of course, came the yellow book.\nDorian read until the afternoon shadows lengthened.',
      order: 2,
    },
  ];
}

function decodeAuthorityEnvelope(encoded) {
  const token = String(encoded || '').replace(/^YRTK1\./u, '');
  const padded = token + '='.repeat((4 - (token.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded.replaceAll('-', '+').replaceAll('_', '/'), 'base64').toString('utf8'));
}

test('C5V2 full-manuscript source builds one ordered multi-scene product review packet without synthetic positive anchors', () => {
  const {
    buildFullManuscriptDocxReviewPacketSource,
    validateFullManuscriptAuthorityReturn,
  } = require(path.join(REPO_ROOT, 'src', 'export', 'docx', 'fullManuscriptDocxReviewPacketSource.js'));
  const sourceText = readText('src/export/docx/fullManuscriptDocxReviewPacketSource.js');
  const source = buildFullManuscriptDocxReviewPacketSource({
    projectId: 'project-c5v2',
    projectRoot: '/project',
    manifestPath: '/project/manifest.json',
    scenes: makeScenes(),
    expectedOrderedSceneIds: ['roman/preface.md', 'roman/chapter-01.md', 'roman/chapter-02.md'],
  }, {
    createdAtUtc: '2026-08-01T00:00:00.000Z',
    roundIdHex: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    keyIdHex: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    hmacSecret: 'local-secret-for-test-only',
  });

  assert.equal(source.exportCapsule.scope, 'full-manuscript');
  assert.equal(source.exportCapsule.profileId, C5V2_WORD_16_112_FULL_MANUSCRIPT_PROFILE_ID);
  assert.equal(source.exportCapsule.fullManuscript, true);
  assert.equal(source.exportCapsule.sceneCount, 3);
  assert.deepEqual(source.exportCapsule.orderedSceneIds, ['roman/preface.md', 'roman/chapter-01.md', 'roman/chapter-02.md']);
  assert.equal(source.exportCapsule.returnIntakeWired, true);
  assert.equal(source.exportCapsule.productRuntimeWired, true);
  assert.equal(source.advisoryManifest.capabilityManifest.route.includes('command-surface-kernel'), true);
  assert.equal(source.advisoryManifest.capabilityManifest.prohibits.includes('harness-local-positive-authority'), true);
  assert.equal(source.blocks.length, 6);
  assert.deepEqual([...new Set(source.blocks.map((block) => block.sceneId))], [
    'roman/preface.md',
    'roman/chapter-01.md',
    'roman/chapter-02.md',
  ]);
  assert.equal(source.blocks.every((block) => block.text.includes('COMMENT_TARGET') === false), true);
  assert.equal(source.sceneText.includes('YALKEN_C5_CERTIFICATION_ANCHORS'), false);
  assert.equal(source.sceneText.includes('COMMENT_TARGET OLD_WORD'), false);
  assert.equal(source.sceneText.includes('The artist is the creator of beautiful things.'), true);
  assert.equal(source.sceneText.includes('The studio was filled with the rich odour of roses.'), true);
  assert.equal(source.sceneText.includes('Dorian read until the afternoon shadows lengthened.'), true);
  assert.equal(sourceText.includes("kind: 'signed-scene-block-baseline-v1'"), true);
  assert.equal(sourceText.includes("kind: 'signed-full-manuscript-scene-block-baseline-v1'"), false);
  assert.equal(JSON.stringify(source.exportCapsule).includes('local-secret-for-test-only'), false);
  assert.equal(JSON.stringify(source.advisoryManifest).includes('local-secret-for-test-only'), false);
  assert.equal(source.localAuthorityCapsule.hmacSecret, 'local-secret-for-test-only');
  assert.equal(source.localAuthorityCapsule.profileId, C5V2_WORD_16_112_FULL_MANUSCRIPT_PROFILE_ID);
  assert.equal(source.localAuthorityCapsule.expectedAuthority.profileId, C5V2_WORD_16_112_FULL_MANUSCRIPT_PROFILE_ID);
  assert.equal(source.localAuthorityCapsule.exportMap.profileId, C5V2_WORD_16_112_FULL_MANUSCRIPT_PROFILE_ID);
  assert.equal(source.advisoryManifest.coreManifest.profileId, C5V2_WORD_16_112_FULL_MANUSCRIPT_PROFILE_ID);
  assert.equal(source.advisoryManifest.transportManifest.profileId, C5V2_WORD_16_112_FULL_MANUSCRIPT_PROFILE_ID);
  assert.equal(source.advisoryManifest.coreManifest.parserProfileDigest, source.localAuthorityCapsule.parserProfileDigest);
  const authorityEnvelope = decodeAuthorityEnvelope(source.customProperties.find((item) => item.name === 'YRTK_C01_AUTH').value);
  assert.equal(authorityEnvelope.payload.profileId, C5V2_WORD_16_112_FULL_MANUSCRIPT_PROFILE_ID);
  assert.equal(JSON.stringify(source).includes('word-mac-latest-observed-16.111.x-product-review-export-c5v2-full-manuscript'), false);
  assert.equal(Buffer.isBuffer(source.provisionalSelfParseArtifact.bytes), true);
  assert.equal(
    `sha256:${crypto.createHash('sha256').update(source.provisionalSelfParseArtifact.bytes).digest('hex')}`,
    source.advisoryManifest.coreManifest.artifactIdentities.provisionalDocxSha256,
  );
  assert.equal(
    source.provisionalSelfParseArtifact.provisionalDocxSha256,
    source.advisoryManifest.coreManifest.artifactIdentities.provisionalDocxSha256,
  );

  const validation = validateFullManuscriptAuthorityReturn({
    scope: 'full-manuscript',
    roundId: source.localAuthorityCapsule.roundId,
    exportId: source.localAuthorityCapsule.exportIdentity,
    fullBookRawSha256: source.exportCapsule.fullBookRawSha256,
    orderedSceneIds: source.exportCapsule.orderedSceneIds,
  }, source.localAuthorityCapsule);
  assert.equal(validation.ok, true);
});

test('C5V2 manuscript source supports one scene and rejects duplicate, reordered, stale and tampered authority inputs', () => {
  const {
    buildFullManuscriptDocxReviewPacketSource,
    validateFullManuscriptAuthorityReturn,
  } = require(path.join(REPO_ROOT, 'src', 'export', 'docx', 'fullManuscriptDocxReviewPacketSource.js'));

  const singleScene = buildFullManuscriptDocxReviewPacketSource({
    projectId: 'project-c5v2',
    scenes: [makeScenes()[0]],
  });
  assert.equal(singleScene.exportCapsule.sceneCount, 1);
  assert.deepEqual(singleScene.exportCapsule.orderedSceneIds, [makeScenes()[0].sceneId]);

  assert.throws(() => buildFullManuscriptDocxReviewPacketSource({
    projectId: 'project-c5v2',
    scenes: [makeScenes()[0], { ...makeScenes()[1], sceneId: makeScenes()[0].sceneId }],
  }), /FULL_MANUSCRIPT_SCENE_ID_DUPLICATE/u);

  assert.throws(() => buildFullManuscriptDocxReviewPacketSource({
    projectId: 'project-c5v2',
    scenes: makeScenes().map((scene, index) => ({ ...scene, order: index === 0 ? 1 : index })),
  }), /FULL_MANUSCRIPT_SCENE_ORDER_NON_CANONICAL/u);

  assert.throws(() => buildFullManuscriptDocxReviewPacketSource({
    projectId: 'project-c5v2',
    scenes: makeScenes(),
    expectedOrderedSceneIds: ['roman/chapter-01.md', 'roman/preface.md', 'roman/chapter-02.md'],
  }), /FULL_MANUSCRIPT_SCENE_ORDER_MISMATCH/u);

  assert.throws(() => buildFullManuscriptDocxReviewPacketSource({
    projectId: 'project-c5v2',
    scenes: makeScenes().map((scene, index) => (index === 1 ? { ...scene, rawSha256: 'sha256:stale' } : scene)),
  }), /FULL_MANUSCRIPT_SCENE_BASELINE_HASH_STALE/u);

  const source = buildFullManuscriptDocxReviewPacketSource({
    projectId: 'project-c5v2',
    scenes: makeScenes(),
  }, {
    roundIdHex: 'cccccccccccccccccccccccccccccccc',
    keyIdHex: 'dddddddddddddddddddddddddddddddd',
    hmacSecret: 'local-secret-for-test-only',
  });
  assert.deepEqual(validateFullManuscriptAuthorityReturn({
    scope: 'full-manuscript',
    roundId: source.localAuthorityCapsule.roundId,
    exportId: source.localAuthorityCapsule.exportIdentity,
    fullBookRawSha256: 'sha256:tampered',
    orderedSceneIds: source.exportCapsule.orderedSceneIds,
  }, source.localAuthorityCapsule), {
    ok: false,
    code: 'FULL_MANUSCRIPT_RETURN_BASELINE_STALE_OR_TAMPERED',
  });
});

test('C5V2 full-manuscript export activation uses bridge CAS digest and fails closed on round transition failure', () => {
  const mainText = readText('src/main.js');
  const helperStart = mainText.indexOf('async function transitionPendingDocxReviewRoundToPublishedActive');
  const helperEnd = mainText.indexOf('async function handleReviewDocxExportPacketCommandSurface', helperStart);
  assert.notEqual(helperStart, -1);
  assert.notEqual(helperEnd, -1);
  const helperText = mainText.slice(helperStart, helperEnd);

  assert.match(helperText, /buildDocxReviewRoundV3BridgeStoreDigest\(bridgeStore\)/u);
  assert.doesNotMatch(helperText, /buildRoundRecordV3StoreRecord\(bridgeStore\)/u);
  assert.match(helperText, /RTK_ROUND_PUBLISH_TRANSITION_FAILED/u);
  assert.match(helperText, /throw error/u);
});

test('C5V2 full-manuscript source binds rich paragraph FormatIR and raw observable scene authority', () => {
  const { buildFullManuscriptDocxReviewPacketSource } = require(path.join(
    REPO_ROOT,
    'src',
    'export',
    'docx',
    'fullManuscriptDocxReviewPacketSource.js',
  ));
  const scenes = makeScenes().slice(0, 2);
  scenes[0] = {
    ...scenes[0],
    text: 'Bold\nline',
    observableContent: '[doc-v2 rich observable payload]',
    doc: {
      type: 'doc',
      content: [{
        type: 'paragraph',
        attrs: { textAlign: 'center' },
        content: [
          { type: 'text', text: 'Bold', marks: [{ type: 'bold' }] },
          { type: 'hardBreak' },
          { type: 'text', text: 'line', marks: [{ type: 'italic' }] },
        ],
      }],
    },
  };
  const source = buildFullManuscriptDocxReviewPacketSource({
    projectId: 'project-rich-format-ir',
    scenes,
  }, {
    roundIdHex: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    keyIdHex: 'ffffffffffffffffffffffffffffffff',
    hmacSecret: 'local-secret-for-test-only',
  });
  const richBlocks = source.blocks.filter((block) => block.sceneId === scenes[0].sceneId);
  assert.equal(richBlocks.length, 1);
  assert.equal(richBlocks[0].text, 'Bold\nline');
  assert.equal(richBlocks[0].formatIr.paragraph.textAlign, 'center');
  assert.deepEqual(richBlocks[0].formatIr.runs.map((run) => run.inline), [
    { bold: true },
    {},
    { italic: true },
  ]);
  assert.equal(source.localAuthorityCapsule.exportMap.scenes[0].rawSha256, source.advisoryManifest.coreManifest.exportMap.scenes[0].rawSha256);
  assert.notEqual(source.localAuthorityCapsule.exportMap.scenes[0].rawSha256, source.blocks[0].canonicalTextSha256);
});

test('C5V2 product DOCX carries one-scene headings links highlights lists quotes code and rules without flattening', () => {
  const { buildFullManuscriptDocxReviewPacketSource } = require(path.join(
    REPO_ROOT,
    'src',
    'export',
    'docx',
    'fullManuscriptDocxReviewPacketSource.js',
  ));
  const { buildDocxReviewPacketBuffer } = require(path.join(
    REPO_ROOT,
    'src',
    'export',
    'docx',
    'docxReviewPacketBuilder.js',
  ));
  const { extractStoredZipEntries } = require(path.join(
    REPO_ROOT,
    'src',
    'export',
    'docx',
    'docxArtifactValidator.js',
  ));
  const doc = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Linked', marks: [{ type: 'link', attrs: { href: 'https://example.test' } }] },
          { type: 'text', text: ' mark', marks: [{ type: 'highlight', attrs: { color: '#a1b2c3' } }] },
          { type: 'text', text: ' code', marks: [{ type: 'code' }] },
        ],
      },
      { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Quote' }] }] },
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Two' }] }] },
        ],
      },
      { type: 'codeBlock', attrs: { language: 'js' }, content: [{ type: 'text', text: 'const x = 1;' }] },
      { type: 'horizontalRule' },
    ],
  };
  const scene = {
    sceneId: 'roman/rich-single.md',
    scenePath: '/project/roman/rich-single.md',
    title: 'Rich single scene',
    order: 0,
    text: 'Title\nLinked mark code\nQuote\nOne\nTwo\nconst x = 1;',
    doc,
  };
  const source = buildFullManuscriptDocxReviewPacketSource({
    projectId: 'project-rich-single',
    scenes: [scene],
  }, {
    roundIdHex: '12121212121212121212121212121212',
    keyIdHex: '34343434343434343434343434343434',
    hmacSecret: 'local-rich-secret-test-only',
  });
  const product = buildDocxReviewPacketBuffer(source);
  const entries = extractStoredZipEntries(product);
  const documentXml = entries.get('word/document.xml').toString('utf8');
  const relsXml = entries.get('word/_rels/document.xml.rels').toString('utf8');
  const numberingXml = entries.get('word/numbering.xml').toString('utf8');
  const stylesXml = entries.get('word/styles.xml').toString('utf8');
  assert.equal(source.exportCapsule.sceneCount, 1);
  assert.equal(source.blocks.length, 7);
  assert.match(documentXml, /<w:outlineLvl w:val="1"\/>/u);
  assert.match(documentXml, /<w:hyperlink r:id="rIdYrtkLink1">/u);
  assert.match(documentXml, /<w:shd w:val="clear" w:color="auto" w:fill="A1B2C3"\/>/u);
  assert.match(documentXml, /<w:rStyle w:val="YalkenInlineCode"\/>/u);
  assert.match(documentXml, /<w:ind w:left="720"\/>/u);
  assert.match(documentXml, /<w:numPr><w:ilvl w:val="0"\/><w:numId w:val="1"\/><\/w:numPr>/u);
  assert.match(documentXml, /<w:pStyle w:val="YalkenCodeBlock"\/>/u);
  assert.match(documentXml, /<w:pBdr><w:bottom/u);
  assert.match(relsXml, /Target="https:\/\/example\.test" TargetMode="External"/u);
  assert.match(numberingXml, /<w:numFmt w:val="bullet"\/>/u);
  assert.match(stylesXml, /w:styleId="YalkenCodeBlock"/u);
  assert.match(stylesXml, /w:styleId="YalkenInlineCode"/u);
});

test('C5V2 product review DOCX requires one deterministic modern mode 15 settings package contract', () => {
  const {
    buildDocxReviewPacketBuffer,
    validateDocxReviewPacketModernMode15,
  } = require(path.join(REPO_ROOT, 'src', 'export', 'docx', 'docxReviewPacketBuilder.js'));
  const { buildStoredZip } = require(path.join(REPO_ROOT, 'src', 'export', 'docx', 'docxMinBuilder.js'));
  const { extractStoredZipEntries } = require(path.join(REPO_ROOT, 'src', 'export', 'docx', 'docxArtifactValidator.js'));
  const { buildFullManuscriptDocxReviewPacketSource } = require(path.join(REPO_ROOT, 'src', 'export', 'docx', 'fullManuscriptDocxReviewPacketSource.js'));
  const source = buildFullManuscriptDocxReviewPacketSource({
    projectId: 'project-c5v2-modern-mode',
    scenes: makeScenes(),
  }, {
    roundIdHex: 'abababababababababababababababab',
    keyIdHex: 'cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd',
    hmacSecret: 'local-modern-mode-secret-test-only',
  });
  const product = buildDocxReviewPacketBuffer(source);
  const valid = validateDocxReviewPacketModernMode15(product);
  assert.equal(valid.ok, true, JSON.stringify(valid));
  assert.equal(valid.compatibilityMode, 15);

  const entries = [...extractStoredZipEntries(product).entries()].map(([name, data]) => ({ name, data }));
  const rebuild = (transform) => buildStoredZip(transform(entries.map((entry) => ({ ...entry }))));
  const settings = entries.find((entry) => entry.name === 'word/settings.xml');
  const rels = entries.find((entry) => entry.name === 'word/_rels/document.xml.rels');
  const contentTypes = entries.find((entry) => entry.name === '[Content_Types].xml');
  assert.ok(settings);
  assert.ok(rels);
  assert.ok(contentTypes);

  const cases = [
    ['missing', rebuild((items) => items.filter((entry) => entry.name !== 'word/settings.xml')), 'DOCX_REVIEW_PACKET_SETTINGS_PART_COUNT_INVALID'],
    ['duplicate', rebuild((items) => [...items, { ...settings }]), 'DOCX_REVIEW_PACKET_SETTINGS_PART_COUNT_INVALID'],
    ['malformed', rebuild((items) => items.map((entry) => entry.name === settings.name
      ? { ...entry, data: Buffer.from('<w:settings><w:compat>', 'utf8') }
      : entry)), 'DOCX_REVIEW_PACKET_SETTINGS_XML_MALFORMED'],
    ['downgraded', rebuild((items) => items.map((entry) => entry.name === settings.name
      ? { ...entry, data: Buffer.from(entry.data.toString('utf8').replace('w:val="15"', 'w:val="12"'), 'utf8') }
      : entry)), 'DOCX_REVIEW_PACKET_COMPATIBILITY_MODE_NOT_15'],
    ['missing-relationship', rebuild((items) => items.map((entry) => entry.name === rels.name
      ? { ...entry, data: Buffer.from(entry.data.toString('utf8').replace(/\s*<Relationship[^>]+settings[^>]+\/>/u, ''), 'utf8') }
      : entry)), 'DOCX_REVIEW_PACKET_SETTINGS_RELATIONSHIP_INVALID'],
    ['missing-override', rebuild((items) => items.map((entry) => entry.name === contentTypes.name
      ? { ...entry, data: Buffer.from(entry.data.toString('utf8').replace(/\s*<Override[^>]+settings\.xml[^>]+\/>/u, ''), 'utf8') }
      : entry)), 'DOCX_REVIEW_PACKET_SETTINGS_CONTENT_TYPE_INVALID'],
  ];
  for (const [name, buffer, code] of cases) {
    const result = validateDocxReviewPacketModernMode15(buffer);
    assert.equal(result.ok, false, name);
    assert.equal(result.failures.includes(code), true, `${name}:${JSON.stringify(result)}`);
  }
});

test('C5V2 full-manuscript export handler writes one DOCX and sanitizes full-book capsule fields', async () => {
  const { runDocxReviewPacketExport } = require(path.join(REPO_ROOT, 'src', 'export', 'docx', 'docxReviewPacketExportHandler.js'));
  const { buildFullManuscriptDocxReviewPacketSource } = require(path.join(REPO_ROOT, 'src', 'export', 'docx', 'fullManuscriptDocxReviewPacketSource.js'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-c5v2-fullbook-export-'));
  const outPath = path.join(dir, 'fullbook.docx');
  const source = buildFullManuscriptDocxReviewPacketSource({
    projectId: 'project-c5v2',
    scenes: makeScenes(),
  }, {
    roundIdHex: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    keyIdHex: 'ffffffffffffffffffffffffffffffff',
    hmacSecret: 'local-secret-for-test-only',
  });

  const result = await runDocxReviewPacketExport(
    { requestId: 'req-c5v2', outPath },
    {
      commandId: COMMAND_ID,
      normalizeExportPayload(input) {
        return {
          requestId: input.requestId,
          outPath: input.outPath,
          outDir: '',
          bufferSource: typeof input.bufferSource === 'string' ? input.bufferSource : '',
          options: {},
        };
      },
      makeTypedReviewDocxExportError(code, reason, details) {
        return { ok: false, error: { code, op: COMMAND_ID, reason, details } };
      },
      resolveDocxReviewPacketExportPath(payload) {
        return payload.outPath;
      },
      validateDocxExportTarget() {
        return { ok: true };
      },
      readDocxReviewPacketExportSource() {
        return source;
      },
      buildDocxReviewPacketBuffer(input) {
        return {
          documentBuffer: Buffer.from('FULLBOOK-DOCX'),
          exportCapsule: input.exportCapsule,
          publicationGate: {
            ok: true,
            code: 'RTK_V4_DOUBLE_SELF_PARSE_PASS',
            publishAllowed: true,
            finalArtifactSha256: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            coreManifestDigest: input.exportCapsule.coreManifestDigest,
            provisionalSelfParse: {
              verified: true,
              actualBaselineDigest: input.exportCapsule.fullBookRawSha256,
              provisionalDocxSha256: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            },
            finalSelfParse: {
              semanticEquivalent: true,
            },
            yrtk2Verification: {
              code: 'RTK_RETURN_INTAKE_YRTK2_VERIFIED',
            },
          },
        };
      },
      async queueDiskOperation(operation) {
        return operation();
      },
      async writeBufferAtomic(targetPath, buffer) {
        fs.writeFileSync(targetPath, buffer);
        return { success: true, bytesWritten: buffer.length };
      },
      updateStatus() {},
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.commandId, COMMAND_ID);
  assert.equal(result.exportCapsule.scope, 'full-manuscript');
  assert.equal(result.exportCapsule.fullManuscript, true);
  assert.equal(result.exportCapsule.sceneCount, 3);
  assert.deepEqual(result.exportCapsule.orderedSceneIds, ['roman/preface.md', 'roman/chapter-01.md', 'roman/chapter-02.md']);
  assert.equal(result.exportCapsule.returnIntakeWired, true);
  assert.equal(result.exportCapsule.fullBookRawSha256.startsWith('sha256:'), true);
  assert.equal(result.exportCapsule.capabilityManifestDigest.startsWith('sha256:'), true);
  assert.equal(result.publicationGate.publishAllowed, true);
  assert.equal(result.publicationGate.code, 'RTK_V4_DOUBLE_SELF_PARSE_PASS');
  assert.equal(JSON.stringify(result).includes('local-secret-for-test-only'), false);
  assert.equal(fs.readFileSync(outPath, 'utf8'), 'FULLBOOK-DOCX');
});

test('C5V2 full-manuscript export handler rejects final DOCX publication without V4 publication gate', async () => {
  const { runDocxReviewPacketExport } = require(path.join(REPO_ROOT, 'src', 'export', 'docx', 'docxReviewPacketExportHandler.js'));
  const { buildFullManuscriptDocxReviewPacketSource } = require(path.join(REPO_ROOT, 'src', 'export', 'docx', 'fullManuscriptDocxReviewPacketSource.js'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-c5v2-fullbook-export-gate-'));
  const outPath = path.join(dir, 'fullbook.docx');
  const source = buildFullManuscriptDocxReviewPacketSource({
    projectId: 'project-c5v2',
    scenes: makeScenes(),
  }, {
    roundIdHex: '01010101010101010101010101010101',
    keyIdHex: '02020202020202020202020202020202',
    hmacSecret: 'local-secret-for-test-only',
  });

  const result = await runDocxReviewPacketExport(
    { requestId: 'req-c5v2', outPath },
    {
      commandId: COMMAND_ID,
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
        return { ok: false, error: { code, op: COMMAND_ID, reason, details } };
      },
      resolveDocxReviewPacketExportPath(payload) {
        return payload.outPath;
      },
      validateDocxExportTarget() {
        return { ok: true };
      },
      readDocxReviewPacketExportSource() {
        return source;
      },
      buildDocxReviewPacketBuffer(input) {
        return {
          documentBuffer: Buffer.from('FULLBOOK-DOCX'),
          exportCapsule: input.exportCapsule,
        };
      },
      async queueDiskOperation(operation) {
        return operation();
      },
      async writeBufferAtomic(targetPath, buffer) {
        fs.writeFileSync(targetPath, buffer);
        return { success: true, bytesWritten: buffer.length };
      },
      updateStatus() {},
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'E_REVIEW_DOCX_EXPORT_PUBLICATION_GATE_BLOCKED');
  assert.equal(result.error.reason, 'REVIEW_DOCX_EXPORT_PUBLICATION_GATE_REQUIRED');
  assert.equal(fs.existsSync(outPath), false);
});

test('C5V2 full-manuscript export handler rejects self-consistent gate without provisional parse evidence', async () => {
  const { runDocxReviewPacketExport } = require(path.join(REPO_ROOT, 'src', 'export', 'docx', 'docxReviewPacketExportHandler.js'));
  const { buildFullManuscriptDocxReviewPacketSource } = require(path.join(REPO_ROOT, 'src', 'export', 'docx', 'fullManuscriptDocxReviewPacketSource.js'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-c5v2-fullbook-export-provisional-gate-'));
  const outPath = path.join(dir, 'fullbook.docx');
  const source = buildFullManuscriptDocxReviewPacketSource({
    projectId: 'project-c5v2',
    scenes: makeScenes(),
  }, {
    roundIdHex: '11111111111111111111111111111111',
    keyIdHex: '22222222222222222222222222222222',
    hmacSecret: 'local-secret-for-test-only',
  });

  const result = await runDocxReviewPacketExport(
    { requestId: 'req-c5v2', outPath },
    {
      commandId: COMMAND_ID,
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
        return { ok: false, error: { code, op: COMMAND_ID, reason, details } };
      },
      resolveDocxReviewPacketExportPath(payload) {
        return payload.outPath;
      },
      validateDocxExportTarget() {
        return { ok: true };
      },
      readDocxReviewPacketExportSource() {
        return source;
      },
      buildDocxReviewPacketBuffer(input) {
        return {
          documentBuffer: Buffer.from('FULLBOOK-DOCX'),
          exportCapsule: input.exportCapsule,
          publicationGate: {
            ok: true,
            code: 'RTK_V4_DOUBLE_SELF_PARSE_PASS',
            publishAllowed: true,
            finalArtifactSha256: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            coreManifestDigest: input.exportCapsule.coreManifestDigest,
            finalSelfParse: { semanticEquivalent: true },
            yrtk2Verification: { code: 'RTK_RETURN_INTAKE_YRTK2_VERIFIED' },
          },
        };
      },
      async queueDiskOperation(operation) {
        return operation();
      },
      async writeBufferAtomic(targetPath, buffer) {
        fs.writeFileSync(targetPath, buffer);
        return { success: true, bytesWritten: buffer.length };
      },
      updateStatus() {},
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'E_REVIEW_DOCX_EXPORT_PUBLICATION_GATE_BLOCKED');
  assert.equal(result.error.details.provisionalSelfParseVerified, false);
  assert.equal(fs.existsSync(outPath), false);
});

test('C5V2 full-manuscript product export is reachable through command kernel, renderer, capability and menu layers', () => {
  const mainSource = readText('src/main.js');
  const commandSurfaceKernel = readText('src/command/commandSurfaceKernel.js');
  const projectCommands = readText('src/renderer/commands/projectCommands.mjs');
  const capabilityPolicy = readText('src/renderer/commands/capabilityPolicy.mjs');
  const localCapabilityProvider = readText('src/renderer/commands/localCapabilityProvider.mjs');
  const menuConfig = JSON.parse(readText('src/menu/menu-config.v2.json'));
  const normalizedMenuArtifact = JSON.parse(readText('docs/OPS/ARTIFACTS/menu/menu.normalized.json'));
  const locale = JSON.parse(readText('src/menu/menu-locale.catalog.v1.json'));
  const c5v1Harness = readText('scripts/ops/rtk-word-c5-fullbook-certification.mjs');

  assert.equal(mainSource.includes(`PROJECT_REVIEW_EXPORT_FULL_MANUSCRIPT_DOCX_PACKET: FULL_MANUSCRIPT_REVIEW_DOCX_COMMAND_ID`), true);
  assert.match(mainSource, /handleFullManuscriptReviewDocxExportPacketCommandSurface\(payload\)/u);
  assert.match(mainSource, /'cmd\.project\.review\.exportFullManuscriptDocxReviewPacket':\s*async\s*\(payload\s*=\s*\{\}\)\s*=>\s*\{/u);
  assert.match(mainSource, /dispatchCommandSurfaceKernel\(\s*COMMAND_SURFACE_KERNEL_COMMAND_IDS\.PROJECT_REVIEW_EXPORT_FULL_MANUSCRIPT_DOCX_PACKET,/u);
  assert.match(mainSource, /DOCX_REVIEW_RETURN_INTAKE_FULL_MANUSCRIPT_PRODUCT_BUDGETS\s*=\s*Object\.freeze\(\{\s*maxBlocks:\s*50_000,/u);
  assert.match(mainSource, /budgets:\s*docxReviewReturnIntakeProductBudgets\(options\)/u);
  assert.equal(mainSource.includes('buildFullManuscriptDocxReviewPacketSource'), true);
  assert.equal(mainSource.includes('readFullManuscriptDocxReviewPacketExportSource'), true);
  assert.equal(mainSource.includes('buildFullManuscriptPublicationGate'), true);
  assert.match(mainSource, /evaluateWordV4DoubleSelfParse/u);
  assert.match(mainSource, /verifyYrtk2RoundLocatorToken/u);
  assert.equal(mainSource.includes('collectFullManuscriptDocxReviewExportCandidates'), true);
  assert.equal(mainSource.includes('readFullManuscriptDocxReviewExportDocumentContent'), true);
  const readFullExportSourceStart = mainSource.indexOf('async function readFullManuscriptDocxReviewPacketExportSource()');
  const readFullExportSourceEnd = mainSource.indexOf('async function buildDocxReviewPacketBuffer', readFullExportSourceStart);
  const readFullExportSourceBody = mainSource.slice(readFullExportSourceStart, readFullExportSourceEnd);
  assert.match(readFullExportSourceBody, /const scope = await buildFullManuscriptDocxReviewExportScope\(\);/u);
  assert.match(readFullExportSourceBody, /readFullManuscriptDocxReviewExportDocumentContent\(candidate\)/u);
  assert.match(readFullExportSourceBody, /doc:\s*content\.doc/u);
  assert.match(readFullExportSourceBody, /observableContent:\s*content\.observableContent/u);
  assert.match(readFullExportSourceBody, /rawSha256:\s*`sha256:\$\{createRtkReviewTransportCryptoPort\(\)\.sha256Text\(content\.observableContent\)\}`/u);
  assert.equal(readFullExportSourceBody.includes('buildSelectedScenesTxtExportScope'), false);
  assert.equal(readFullExportSourceBody.includes('readSelectedScenesTxtExportSceneContent'), false);
  assert.equal(commandSurfaceKernel.includes(`'${COMMAND_ID}'`), true);
  const disabledComplexitySet = mainSource.match(/const MAIN_FREE_PRO_COMPLEXITY_COMMAND_IDS = new Set\(\[\n(?<body>[\s\S]*?)\n\]\);/u);
  assert.notEqual(disabledComplexitySet, null);
  assert.equal(disabledComplexitySet.groups.body.includes(COMMAND_ID), false);
  assert.equal(projectCommands.includes(`REVIEW_EXPORT_FULL_MANUSCRIPT_DOCX_REVIEW_PACKET: '${COMMAND_ID}'`), true);
  assert.equal(projectCommands.includes('runReviewExportFullManuscriptDocxReviewPacketBridge'), true);
  assert.equal(capabilityPolicy.includes(`'${COMMAND_ID}': '${CAPABILITY_ID}'`), true);
  assert.equal(localCapabilityProvider.includes(`'${COMMAND_ID}'`), true);
  const reviewMenu = menuConfig.menus.find((menu) => menu.id === 'review');
  const reviewItem = reviewMenu.items.find((item) => item.id === 'review-export-full-manuscript-docx-review-packet');
  assert.deepEqual(reviewItem, {
    id: 'review-export-full-manuscript-docx-review-packet',
    label: 'Export Full Manuscript Review DOCX Packet...',
    labelKey: 'menu.review.exportFullManuscriptDocxReviewPacket',
    command: COMMAND_ID,
  });
  const normalizedReviewMenu = normalizedMenuArtifact.menus.find((menu) => menu.id === 'review');
  const normalizedReviewItem = normalizedReviewMenu.items.find((item) => item.id === 'review-export-full-manuscript-docx-review-packet');
  assert.equal(normalizedReviewItem.canonicalCmdId, COMMAND_ID);
  assert.equal(normalizedReviewItem.visibilityPolicy, 'visible_enabled');
  assert.equal(normalizedReviewItem.disabledReasonCode, null);
  assert.equal(normalizedReviewItem.labelKey, 'menu.review.exportFullManuscriptDocxReviewPacket');
  assert.equal(locale.entries['menu.review.exportFullManuscriptDocxReviewPacket'].base, 'Export Full Manuscript Review DOCX Packet...');
  assert.equal(c5v1Harness.includes('YALKEN_C5_CERTIFICATION_ANCHORS'), true);
  assert.equal(mainSource.includes('YALKEN_C5_CERTIFICATION_ANCHORS'), false);
});
