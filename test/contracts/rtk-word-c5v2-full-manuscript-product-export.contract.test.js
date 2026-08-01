'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const COMMAND_ID = 'cmd.project.review.exportFullManuscriptDocxReviewPacket';
const CAPABILITY_ID = 'cap.project.review.exportFullManuscriptDocxReviewPacket';

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

test('C5V2 full-manuscript source builds one ordered multi-scene product review packet without synthetic positive anchors', () => {
  const {
    buildFullManuscriptDocxReviewPacketSource,
    validateFullManuscriptAuthorityReturn,
  } = require(path.join(REPO_ROOT, 'src', 'export', 'docx', 'fullManuscriptDocxReviewPacketSource.js'));
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
  assert.equal(JSON.stringify(source.exportCapsule).includes('local-secret-for-test-only'), false);
  assert.equal(JSON.stringify(source.advisoryManifest).includes('local-secret-for-test-only'), false);
  assert.equal(source.localAuthorityCapsule.hmacSecret, 'local-secret-for-test-only');

  const validation = validateFullManuscriptAuthorityReturn({
    scope: 'full-manuscript',
    roundId: source.localAuthorityCapsule.roundId,
    exportId: source.localAuthorityCapsule.exportIdentity,
    fullBookRawSha256: source.exportCapsule.fullBookRawSha256,
    orderedSceneIds: source.exportCapsule.orderedSceneIds,
  }, source.localAuthorityCapsule);
  assert.equal(validation.ok, true);
});

test('C5V2 full-manuscript source rejects duplicate, reordered, stale and tampered authority inputs', () => {
  const {
    buildFullManuscriptDocxReviewPacketSource,
    validateFullManuscriptAuthorityReturn,
  } = require(path.join(REPO_ROOT, 'src', 'export', 'docx', 'fullManuscriptDocxReviewPacketSource.js'));

  assert.throws(() => buildFullManuscriptDocxReviewPacketSource({
    projectId: 'project-c5v2',
    scenes: [makeScenes()[0]],
  }), /FULL_MANUSCRIPT_MULTI_SCENE_PROJECT_REQUIRED/u);

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
  assert.equal(JSON.stringify(result).includes('local-secret-for-test-only'), false);
  assert.equal(fs.readFileSync(outPath, 'utf8'), 'FULLBOOK-DOCX');
});

test('C5V2 full-manuscript product export is reachable through command kernel, renderer, capability and menu layers', () => {
  const mainSource = readText('src/main.js');
  const projectCommands = readText('src/renderer/commands/projectCommands.mjs');
  const capabilityPolicy = readText('src/renderer/commands/capabilityPolicy.mjs');
  const localCapabilityProvider = readText('src/renderer/commands/localCapabilityProvider.mjs');
  const menuConfig = JSON.parse(readText('src/menu/menu-config.v2.json'));
  const locale = JSON.parse(readText('src/menu/menu-locale.catalog.v1.json'));
  const c5v1Harness = readText('scripts/ops/rtk-word-c5-fullbook-certification.mjs');

  assert.equal(mainSource.includes(`PROJECT_REVIEW_EXPORT_FULL_MANUSCRIPT_DOCX_PACKET: FULL_MANUSCRIPT_REVIEW_DOCX_COMMAND_ID`), true);
  assert.match(mainSource, /handleFullManuscriptReviewDocxExportPacketCommandSurface\(payload\)/u);
  assert.match(mainSource, /'cmd\.project\.review\.exportFullManuscriptDocxReviewPacket':\s*async\s*\(payload\s*=\s*\{\}\)\s*=>\s*\{/u);
  assert.match(mainSource, /dispatchCommandSurfaceKernel\(\s*COMMAND_SURFACE_KERNEL_COMMAND_IDS\.PROJECT_REVIEW_EXPORT_FULL_MANUSCRIPT_DOCX_PACKET,/u);
  assert.equal(mainSource.includes('buildFullManuscriptDocxReviewPacketSource'), true);
  assert.equal(mainSource.includes('readFullManuscriptDocxReviewPacketExportSource'), true);
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
  assert.equal(locale.entries['menu.review.exportFullManuscriptDocxReviewPacket'].base, 'Export Full Manuscript Review DOCX Packet...');
  assert.equal(c5v1Harness.includes('YALKEN_C5_CERTIFICATION_ANCHORS'), true);
  assert.equal(mainSource.includes('YALKEN_C5_CERTIFICATION_ANCHORS'), false);
});
