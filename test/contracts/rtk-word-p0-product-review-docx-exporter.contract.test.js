'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const COMMAND_ID = 'cmd.project.review.exportDocxReviewPacket';
const CAPABILITY_ID = 'cap.project.review.exportDocxReviewPacket';

function readText(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

test('P0 Review DOCX exporter builds a DOCX packet distinct from DOCX Minimal with carrier and advisory manifest', () => {
  const { buildDocxReviewPacketBuffer } = require(path.join(REPO_ROOT, 'src', 'export', 'docx', 'docxReviewPacketBuilder.js'));
  const forbiddenSecret = 'local-secret-must-not-appear';
  const buffer = buildDocxReviewPacketBuffer({
    sceneText: 'Alpha\nBeta',
    blocks: [
      { blockId: 'block-alpha', paragraphId: 'p-alpha', paraId: '00112233', textId: '44556677', text: 'Alpha' },
      { blockId: 'block-beta', paragraphId: 'p-beta', paraId: '8899aabb', textId: 'ccddeeff', text: 'Beta' },
    ],
    forbiddenSecret,
    customProperties: [
      { name: 'YRTK_C01_AUTH', value: 'YRTK1.encoded-authority' },
      { name: 'YRTK2_TOKEN', value: 'YRT2-token-placeholder' },
      { name: 'YRTK_CORE_DIGEST', value: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    ],
    advisoryManifest: {
      schemaVersion: 'yalken.rtk.word.product-review-docx-export.advisory-manifest.v1',
      authorityRole: 'advisory-not-apply-authority',
    },
  });
  const raw = buffer.toString('utf8');

  assert.equal(Buffer.isBuffer(buffer), true);
  assert.equal(raw.includes('word/document.xml'), true);
  assert.equal(raw.includes('docProps/custom.xml'), true);
  assert.equal(raw.includes('customXml/item1.xml'), true);
  assert.equal(raw.includes('Target="../customXml/item1.xml"'), false);
  assert.equal(raw.includes('Target="customXml/item1.xml"'), true);
  assert.equal(raw.includes('YRTK_C01_AUTH'), true);
  assert.equal(raw.includes('YRTK2_TOKEN'), true);
  assert.equal(raw.includes('YRTK_CORE_DIGEST'), true);
  assert.equal(raw.includes('advisory-not-apply-authority'), true);
  assert.equal(raw.includes(forbiddenSecret), false);
});

test('P0 Review DOCX export handler writes one external DOCX and returns only a sanitized export capsule', async () => {
  const { runDocxReviewPacketExport } = require(path.join(REPO_ROOT, 'src', 'export', 'docx', 'docxReviewPacketExportHandler.js'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-review-docx-export-'));
  const outPath = path.join(dir, 'review.docx');
  const status = [];
  const writes = [];
  const source = {
    sceneText: 'Alpha',
    exportCapsule: {
      schemaVersion: 'yalken.rtk.word.product-review-docx-export.v1',
      projectId: 'project-p0',
      sceneId: 'roman/scene.txt',
      sceneRevision: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      rawSha256: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      roundId: 'round-p0',
      exportId: 'export-p0',
      exportArtifactId: 'export-artifact-p0',
      semanticReturnId: 'semantic-return-p0',
      coreManifestDigest: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      transportManifestDigest: 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      yrtk2TokenLength: 135,
      blockCount: 1,
      authorityCarrier: 'customDocumentProperty',
      authorityPropertyName: 'YRTK_C01_AUTH',
      secretEmbeddedInDocx: false,
      productRuntimeWired: true,
      returnIntakeWired: false,
      hmacSecret: 'must-not-leak',
    },
  };

  const result = await runDocxReviewPacketExport(
    { requestId: 'req-p0', outPath },
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
          documentBuffer: Buffer.from('DOCX-P0'),
          exportCapsule: input.exportCapsule,
        };
      },
      async queueDiskOperation(operation) {
        return operation();
      },
      async writeBufferAtomic(targetPath, buffer) {
        writes.push({ targetPath, bytes: buffer.length });
        fs.writeFileSync(targetPath, buffer);
        return { success: true, bytesWritten: buffer.length };
      },
      updateStatus(message) {
        status.push(message);
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.commandId, COMMAND_ID);
  assert.equal(result.exported, true);
  assert.equal(result.bytesWritten, 7);
  assert.equal(fs.readFileSync(outPath, 'utf8'), 'DOCX-P0');
  assert.deepEqual(writes, [{ targetPath: outPath, bytes: 7 }]);
  assert.equal(status.includes('Review DOCX экспортирован'), true);
  assert.equal(result.canAutoApply, false);
  assert.equal(result.canWriteManuscript, false);
  assert.equal(result.canImportMutate, false);
  assert.equal(result.exportCapsule.productRuntimeWired, true);
  assert.equal(result.exportCapsule.returnIntakeWired, false);
  assert.equal(JSON.stringify(result).includes('must-not-leak'), false);
});

test('P0 Review DOCX export handler rejects renderer bufferSource authority', async () => {
  const { runDocxReviewPacketExport } = require(path.join(REPO_ROOT, 'src', 'export', 'docx', 'docxReviewPacketExportHandler.js'));
  const result = await runDocxReviewPacketExport(
    { requestId: 'req-p0', outPath: '/tmp/review.docx', bufferSource: 'Zm9yZ2Vk' },
    {
      normalizeExportPayload(input) {
        return {
          requestId: input.requestId,
          outPath: input.outPath,
          outDir: '',
          bufferSource: input.bufferSource,
          options: {},
        };
      },
      makeTypedReviewDocxExportError(code, reason) {
        return { ok: false, error: { code, op: COMMAND_ID, reason } };
      },
      resolveDocxReviewPacketExportPath() { throw new Error('should not resolve'); },
      validateDocxExportTarget() { throw new Error('should not validate'); },
      readDocxReviewPacketExportSource() { throw new Error('should not read'); },
      buildDocxReviewPacketBuffer() { throw new Error('should not build'); },
      queueDiskOperation() { throw new Error('should not write'); },
      writeBufferAtomic() { throw new Error('should not write'); },
      updateStatus() {},
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.op, COMMAND_ID);
  assert.equal(result.error.reason, 'REVIEW_DOCX_EXPORT_BUFFER_SOURCE_FORBIDDEN');
});

test('P0 Review DOCX exporter is reachable from product command, menu and capability layers without altering DOCX Minimal', () => {
  const mainSource = readText('src/main.js');
  const projectCommands = readText('src/renderer/commands/projectCommands.mjs');
  const capabilityPolicy = readText('src/renderer/commands/capabilityPolicy.mjs');
  const localCapabilityProvider = readText('src/renderer/commands/localCapabilityProvider.mjs');
  const menuConfig = JSON.parse(readText('src/menu/menu-config.v2.json'));
  const locale = JSON.parse(readText('src/menu/menu-locale.catalog.v1.json'));
  const docxMinBuilder = readText('src/export/docx/docxMinBuilder.js');

  assert.equal(mainSource.includes(`const REVIEW_EXPORT_DOCX_PACKET_COMMAND_ID = '${COMMAND_ID}'`), true);
  assert.equal(mainSource.includes(`'${COMMAND_ID}'`), true);
  assert.match(mainSource, /'cmd\.project\.review\.exportDocxReviewPacket':\s*async\s*\(payload\s*=\s*\{\}\)\s*=>\s*\{\s*return handleReviewDocxExportPacketCommandSurface\(payload\);/u);
  assert.equal(projectCommands.includes(`REVIEW_EXPORT_DOCX_REVIEW_PACKET: '${COMMAND_ID}'`), true);
  assert.equal(projectCommands.includes('runReviewExportDocxReviewPacketBridge'), true);
  assert.equal(capabilityPolicy.includes(`'${COMMAND_ID}': '${CAPABILITY_ID}'`), true);
  assert.equal(localCapabilityProvider.includes(`'${COMMAND_ID}'`), true);
  const reviewMenu = menuConfig.menus.find((menu) => menu.id === 'review');
  const reviewItem = reviewMenu.items.find((item) => item.id === 'review-export-docx-review-packet');
  assert.deepEqual(reviewItem, {
    id: 'review-export-docx-review-packet',
    label: 'Export Review DOCX Packet...',
    labelKey: 'menu.review.exportDocxReviewPacket',
    command: COMMAND_ID,
  });
  assert.equal(locale.entries['menu.review.exportDocxReviewPacket'].base, 'Export Review DOCX Packet...');
  assert.equal(docxMinBuilder.includes('YRTK_C01_AUTH'), false);
  assert.equal(docxMinBuilder.includes('YRTK2_TOKEN'), false);
});
