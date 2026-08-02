const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { deflateRawSync } = require('node:zlib');
const { pathToFileURL } = require('node:url');
const { createDocxActivationRequestDigestGuard } = require('../../src/main/rtkDocxActivationGuards.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MAIN_PATH = path.join(REPO_ROOT, 'src', 'main.js');
const RETURN_INTAKE_WORKER_PATH = path.join(REPO_ROOT, 'src', 'main', 'rtkDocxReturnIntakeWorker.cjs');
const BRIDGE_MODULE_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'index.mjs');
const MUTATE_SECTION_START = '// CONTOUR_01A_REVIEW_MUTATE_PORT_START';
const MUTATE_SECTION_END = '// CONTOUR_01A_REVIEW_MUTATE_PORT_END';
const INTAKE_SECTION_START = '// DOCX_INTAKE_GATE_COMMAND_SURFACE_START';
const INTAKE_SECTION_END = '// DOCX_INTAKE_GATE_COMMAND_SURFACE_END';
const ACTIVATION_SECTION_START = '// DOCX_REVIEW_PREVIEW_SESSION_COMMAND_SURFACE_START';
const ACTIVATION_SECTION_END = '// DOCX_REVIEW_PREVIEW_SESSION_COMMAND_SURFACE_END';

function readMainSource() {
  return fs.readFileSync(MAIN_PATH, 'utf8');
}

function extractMarkedSection(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker);
  assert.notEqual(start, -1, `missing marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing marker: ${endMarker}`);
  assert.ok(end > start, `marker order invalid: ${startMarker}`);
  return text.slice(start, end + endMarker.length);
}

function extractMenuCommandHandlersSection(text) {
  const startMarker = 'const MENU_COMMAND_HANDLERS = Object.freeze({';
  const endMarker = '\n\nfunction shouldFailHardOnMenuConfigError';
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start);
  assert.notEqual(start, -1, `missing marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing marker: ${endMarker}`);
  assert.ok(end > start, 'menu command handler markers must be ordered');
  return text.slice(start, end);
}

const MENU_HANDLER_COMPUTED_KEY_GLOBALS = Object.freeze({
  EXPORT_CURRENT_SCENE_TXT_COMMAND_ID: 'cmd.project.exportCurrentSceneTxtV1',
  EXPORT_SELECTED_SCENES_TXT_COMMAND_ID: 'cmd.project.exportSelectedScenesTxtV1',
  EXPORT_ALL_SCENES_TXT_COMMAND_ID: 'cmd.project.exportAllScenesTxtV1',
  EXPORT_PDF_COMMAND_ID: 'cmd.project.exportPdfV1',
  EXPORT_PROJECT_ARCHIVE_COMMAND_ID: 'cmd.project.exportFullArchiveV1',
  IMPORT_PROJECT_ARCHIVE_COMMAND_ID: 'cmd.project.importFullArchiveV1',
  TXT_IMPORT_LOCAL_FILE_PREVIEW_COMMAND_ID: 'cmd.project.txt.previewLocalFile',
  TXT_IMPORT_SAFE_CREATE_COMMAND_ID: 'cmd.project.txt.importSafeCreate',
  TREE_MOVE_COMMAND_ID: 'cmd.project.tree.moveNode',
  METADATA_UPDATE_COMMAND_ID: 'cmd.project.metadata.update',
  NOTES_CREATE_COMMAND_ID: 'cmd.project.notes.create',
  NOTES_UPDATE_COMMAND_ID: 'cmd.project.notes.update',
  NOTES_DELETE_COMMAND_ID: 'cmd.project.notes.delete',
  NOTES_RESTORE_COMMAND_ID: 'cmd.project.notes.restore',
  NOTES_ATTACH_SCENE_COMMAND_ID: 'cmd.project.notes.attachToScene',
  NOTES_CONVERT_SCENE_COMMAND_ID: 'cmd.project.notes.convertToScene',
  REPLACE_SINGLE_SAFE_COMMAND_ID: 'cmd.project.edit.replaceSingleSafe',
  REPLACE_MASS_PREVIEW_COMMAND_ID: 'cmd.project.edit.replaceMassPreview',
  REPLACE_MASS_APPLY_COMMAND_ID: 'cmd.project.edit.replaceMassApply',
  REPLACE_MASS_ROLLBACK_COMMAND_ID: 'cmd.project.edit.replaceMassRollback',
  PROJECT_LIFECYCLE_CREATE_COMMAND_ID: 'cmd.project.lifecycle.create',
  PROJECT_LIFECYCLE_OPEN_COMMAND_ID: 'cmd.project.lifecycle.open',
  PROJECT_LIFECYCLE_CONTINUE_COMMAND_ID: 'cmd.project.lifecycle.continue',
  PROJECT_LIFECYCLE_RENAME_COMMAND_ID: 'cmd.project.lifecycle.rename',
  PROJECT_LIFECYCLE_DUPLICATE_COMMAND_ID: 'cmd.project.lifecycle.duplicate',
  PROJECT_LIFECYCLE_MOVE_LOCATION_COMMAND_ID: 'cmd.project.lifecycle.moveLocation',
  PROJECT_LIFECYCLE_ARCHIVE_COMMAND_ID: 'cmd.project.lifecycle.archive',
  PROJECT_LIFECYCLE_TRASH_COMMAND_ID: 'cmd.project.lifecycle.trash',
  PROJECT_LIFECYCLE_RESTORE_COMMAND_ID: 'cmd.project.lifecycle.restore',
  PROJECT_LIFECYCLE_BACKUP_COMMAND_ID: 'cmd.project.lifecycle.createBackup',
  PROJECT_LIFECYCLE_INTEGRITY_COMMAND_ID: 'cmd.project.lifecycle.inspectIntegrity',
  PROJECT_LIFECYCLE_PERMANENT_DELETE_COMMAND_ID: 'cmd.project.lifecycle.permanentDelete',
  HISTORY_CREATE_CHECKPOINT_COMMAND_ID: 'cmd.project.history.createCheckpoint',
  HISTORY_RESTORE_PREVIEW_COMMAND_ID: 'cmd.project.history.restorePreview',
  HISTORY_RESTORE_APPLY_COMMAND_ID: 'cmd.project.history.restoreApply',
  HISTORY_RESTORE_UNDO_COMMAND_ID: 'cmd.project.history.restoreUndo',
});

function cloneJsonSafe(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function isPlainObjectValue(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasReviewSurfacePayload(value) {
  return isPlainObjectValue(value) && Object.keys(value).length > 0;
}

function computeHash(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

async function loadBridge() {
  return import(pathToFileURL(BRIDGE_MODULE_PATH).href);
}

function instantiateDocxReviewPreviewSessionPort(options = {}) {
  const mainSource = readMainSource();
  const mutateSection = extractMarkedSection(mainSource, MUTATE_SECTION_START, MUTATE_SECTION_END);
  const intakeSection = extractMarkedSection(mainSource, INTAKE_SECTION_START, INTAKE_SECTION_END);
  const activationSection = extractMarkedSection(mainSource, ACTIVATION_SECTION_START, ACTIVATION_SECTION_END);
  const menuCommandHandlersSection = extractMenuCommandHandlersSection(mainSource);
  const runtimeCommands = [];
  const sandbox = {
    activeDocxActivationRequestDigestGuard: options.activeDocxActivationRequestDigestGuard
      || createDocxActivationRequestDigestGuard(),
    activeReviewSessionStore: null,
    activeReviewSessionLifecycle: 'passive',
    autoSaveInProgress: false,
    currentFilePath: '/project/roman/imported/scene-1.txt',
    currentReviewSurfacePayload: {},
    currentReviewSurfacePayloadSource: 'none',
    currentReviewSurfacePayloadContentHash: '',
    isDirty: false,
    crypto,
    Buffer,
    ...MENU_HANDLER_COMPUTED_KEY_GLOBALS,
    cloneJsonSafe,
    computeHash,
    fs: options.fs || { readFile: async () => 'Anchored text' },
    fsSync: options.fsSync || { readFileSync: () => 'Anchored text' },
    getDocumentContextFromPath: options.getDocumentContextFromPath || (() => ({ kind: 'scene' })),
    getProjectRelativeFilePath: options.getProjectRelativeFilePath || (() => 'roman/imported/scene-1.txt'),
    hasReviewSurfacePayload,
    isAllowedFilePath: options.isAllowedFilePath || (() => true),
    isPlainObjectValue,
    isPathInsideBoundary: options.isPathInsideBoundary || (() => true),
    loadRevisionBridgeModule: typeof options.loadRevisionBridgeModule === 'function'
      ? options.loadRevisionBridgeModule
      : loadBridge,
    dispatchCommandSurfaceKernel: typeof options.dispatchCommandSurfaceKernel === 'function'
      ? options.dispatchCommandSurfaceKernel
      : async () => ({ ok: false, error: { code: 'E_TEST_COMMAND_HANDLER_MISSING', reason: 'TEST_COMMAND_HANDLER_MISSING' } }),
    module: { exports: {} },
    exports: {},
    path,
    readReviewExactTextApplyProjectBinding: options.readReviewExactTextApplyProjectBinding || (async () => ({
      ok: true,
      projectId: 'project-1',
      manifestPath: '/project/manifest.json',
      projectRoot: '/project',
    })),
    verifyFullManuscriptCurrentSceneBindings: options.verifyFullManuscriptCurrentSceneBindings
      || (() => ({ ok: true, status: 'verified', sceneCount: 1, sceneReadback: [] })),
    runtimeCommands,
    sendCanonicalRuntimeCommand(commandId, payload = {}, legacyCommand = '') {
      runtimeCommands.push({ commandId, payload, legacyCommand });
      return true;
    },
  };
  vm.runInNewContext(
    `${mutateSection}
${intakeSection}
${activationSection}
const MENU_PRESENTATION_COMMAND_CLASSIC = 'cmd.menu.presentation.classic';
const MENU_PRESENTATION_COMMAND_COMPACT = 'cmd.menu.presentation.compact';
const MENU_LOCALE_COMMAND_BASE = 'cmd.menu.locale.base';
const MENU_LOCALE_COMMAND_RU = 'cmd.menu.locale.ru';
const MENU_LOCALE_COMMAND_EN = 'cmd.menu.locale.en';
const MENU_CUSTOMIZATION_COMMAND_RESET = 'cmd.menu.customization.reset';
const MENU_CUSTOMIZATION_COMMAND_TOGGLE_VISIBILITY = 'cmd.menu.customization.toggleVisibility';
const MENU_CUSTOMIZATION_COMMAND_MOVE_EARLIER = 'cmd.menu.customization.moveEarlier';
const MENU_CUSTOMIZATION_COMMAND_MOVE_LATER = 'cmd.menu.customization.moveLater';
${menuCommandHandlersSection}
module.exports = {
  DOCX_REVIEW_PREVIEW_SESSION_COMMAND_ID,
  MENU_COMMAND_HANDLERS,
  runtimeCommands,
  handleDocxReviewPreviewSessionActivationCommandSurface,
  handleReviewSurfaceApplyExactTextChangeCommandSurface,
  getState() {
    return {
      activeReviewSessionStore,
      activeReviewSessionLifecycle,
      currentReviewSurfacePayload,
      currentReviewSurfacePayloadSource,
      currentReviewSurfacePayloadContentHash,
    };
  },
};`,
    sandbox,
    { filename: MAIN_PATH },
  );
  return sandbox.module.exports;
}

function asciiBytes(value) {
  return Buffer.from(value, 'ascii');
}

function utf8Bytes(value) {
  return Buffer.from(value, 'utf8');
}

function normalizeEntry(entry) {
  const body = Buffer.isBuffer(entry.body)
    ? entry.body
    : utf8Bytes(typeof entry.body === 'string' ? entry.body : '');
  const method = entry.method ?? 0;
  const compressedBody = method === 8 ? deflateRawSync(body) : body;
  return {
    name: entry.name,
    method,
    body,
    compressedBody,
    byteSize: entry.byteSize ?? body.length,
    compressedSize: entry.compressedSize ?? compressedBody.length,
  };
}

function localRecord(entry, offset) {
  const normalized = normalizeEntry(entry);
  const name = asciiBytes(normalized.name);
  const header = Buffer.alloc(30 + name.length);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(entry.flags ?? 0, 6);
  header.writeUInt16LE(normalized.method, 8);
  header.writeUInt32LE(0, 14);
  header.writeUInt32LE(normalized.compressedSize, 18);
  header.writeUInt32LE(normalized.byteSize, 22);
  header.writeUInt16LE(name.length, 26);
  name.copy(header, 30);
  return {
    ...normalized,
    offset,
    bytes: Buffer.concat([header, normalized.compressedBody]),
  };
}

function centralRecord(entry) {
  const name = asciiBytes(entry.name);
  const header = Buffer.alloc(46 + name.length);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(entry.flags ?? 0, 8);
  header.writeUInt16LE(entry.method, 10);
  header.writeUInt32LE(0, 16);
  header.writeUInt32LE(entry.compressedSize, 20);
  header.writeUInt32LE(entry.byteSize, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
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
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(locals.length, 8);
  end.writeUInt16LE(locals.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([Buffer.concat(locals.map((entry) => entry.bytes)), central, end]);
}

function documentXml(body) {
  return `<w:document><w:body>${body}</w:body></w:document>`;
}

function paragraphXml(text) {
  return `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
}

function cleanDocxZip(body = '<w:p/>', extraEntries = []) {
  return zipFixture([
    {
      name: 'word/document.xml',
      method: 8,
      body: documentXml(body),
    },
    ...extraEntries,
  ]);
}

function docxWithAnchoredComment(extraBody = '', extraEntries = []) {
  return cleanDocxZip([
    '<w:p>',
    '<w:commentRangeStart w:id="0"/>',
    '<w:r><w:t>Anchored text</w:t></w:r>',
    '<w:commentRangeEnd w:id="0"/>',
    '<w:r><w:commentReference w:id="0"/></w:r>',
    '</w:p>',
    extraBody,
  ].join(''), [
    {
      name: 'word/comments.xml',
      method: 8,
      body: [
        '<w:comments>',
        '<w:comment w:id="0" w:author="reviewer" w:date="2026-04-24T08:00:00.000Z">',
        '<w:p><w:r><w:t>Resolve this comment.</w:t></w:r></w:p>',
        '</w:comment>',
        '</w:comments>',
      ].join(''),
    },
    ...extraEntries,
  ]);
}

function docxWithCommentAndBody(body, commentBody = 'Resolve this comment.') {
  return cleanDocxZip(body, [
    {
      name: 'word/comments.xml',
      method: 8,
      body: [
        '<w:comments>',
        '<w:comment w:id="0" w:author="reviewer">',
        `<w:p><w:r><w:t>${commentBody}</w:t></w:r></w:p>`,
        '</w:comment>',
        '</w:comments>',
      ].join(''),
    },
  ]);
}

function toPayload(bytes, overrides = {}) {
  return {
    requestId: 'docx-review-preview-session-request',
    bufferSource: Buffer.from(bytes).toString('base64'),
    ...overrides,
  };
}

function collectKeys(value, pathParts = []) {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectKeys(item, pathParts.concat(String(index))));
  }
  if (!value || typeof value !== 'object') return [];
  return Object.keys(value).flatMap((key) => (
    [pathParts.concat(key).join('.')].concat(collectKeys(value[key], pathParts.concat(key)))
  ));
}

function assertNoWriteReceiptsOrApplyAuthority(value) {
  const keys = collectKeys(value);
  for (const forbidden of [
    'receipt',
    'recovery',
    'writeReceipt',
    'importReceipt',
    'exportReceipt',
  ]) {
    assert.equal(keys.some((key) => key === forbidden || key.endsWith(`.${forbidden}`)), false, forbidden);
  }
}

function reviewContext(overrides = {}) {
  return {
    ok: true,
    projectId: 'project-1',
    projectRoot: '/project',
    baselineHash: 'baseline-1',
    currentBaselineHash: 'baseline-1',
    targetScope: {
      type: 'scene',
      id: 'roman/imported/scene-1.txt',
    },
    createdAt: '2026-04-24T08:00:00.000Z',
    ...overrides,
  };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const c05CryptoPort = {
  sha256Text(value) {
    return crypto.createHash('sha256').update(Buffer.from(String(value || ''), 'utf8')).digest('hex');
  },
  sha256Json(value) {
    return `sha256:${this.sha256Text(stableJson(value))}`;
  },
};

function c05Sha256Text(value) {
  return `sha256:${c05CryptoPort.sha256Text(value)}`;
}

function base64UrlText(value) {
  return Buffer.from(String(value || ''), 'utf8')
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

function hmacSha256Json(value, secret) {
  return `hmac-sha256:${crypto
    .createHmac('sha256', Buffer.from(String(secret || ''), 'utf8'))
    .update(Buffer.from(stableJson(value), 'utf8'))
    .digest('hex')}`;
}

function customPropertiesXml(properties = []) {
  return [
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">',
    ...properties.map((property, index) => (
      `<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="${index + 2}" name="${property.name}"><vt:lpwstr>${property.value}</vt:lpwstr></property>`
    )),
    '</Properties>',
  ].join('');
}

function productContentTypesXml(options = {}) {
  const includeComments = options.includeComments !== false;
  return [
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
    ...(includeComments ? ['<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>'] : []),
    '<Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/>',
    '</Types>',
  ].join('');
}

function productRootRelsXml() {
  return [
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>',
    '<Relationship Id="rIdYrtkCustomProps" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/>',
    '</Relationships>',
  ].join('');
}

function productDocumentRelsXml() {
  return [
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rIdComments" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>',
    '</Relationships>',
  ].join('');
}

function productAuthorityEnvelope(payload, secret, overrides = {}) {
  const body = {
    schemaVersion: 'yalken.rtk.locator-authority-envelope.c01.v1',
    payload,
    payloadDigest: c05CryptoPort.sha256Json(payload),
    signature: hmacSha256Json(payload, secret),
    keyId: 'product-review-docx-local-secret-v1',
    secretEmbeddedInDocx: false,
    ...overrides,
  };
  return `YRTK1.${base64UrlText(JSON.stringify(body))}`;
}

function productReviewDocxWithAnchoredComment({
  secret = 'local-secret-for-product-return-intake',
  roundId = 'round-product-intake-1',
  exportId = 'export-product-intake-1',
  sceneId = 'roman/imported/scene-1.txt',
  sceneText = 'Anchored text',
  blockId = 'block-product-intake-1',
  envelopeOverrides = {},
} = {}) {
  const rawSha256 = c05Sha256Text(sceneText);
  const payload = {
    schemaVersion: 'yalken.rtk.locator-authority-envelope.c01.v1',
    taskId: 'YALKEN_WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01',
    profileId: 'word-mac-latest-observed-16.111.x-product-review-export-p0',
    caseId: 'product-review-docx-export-p0',
    sceneId,
    sceneRevision: rawSha256,
    rawSha256,
    blockId,
    roundId,
    exportId,
    exportArtifactId: 'export-artifact-product-intake-1',
    semanticReturnId: 'semantic-return-product-intake-1',
    coreManifestDigest: c05Sha256Text('core-manifest-product-intake-1'),
    transportManifestDigest: c05Sha256Text('transport-manifest-product-intake-1'),
    yrtk2TokenDigest: c05Sha256Text('yrtk2-product-intake-1'),
    blockCount: 1,
  };
  const authority = productAuthorityEnvelope(payload, secret, envelopeOverrides);
  return {
    payload,
    secret,
    bytes: docxWithAnchoredComment('', [
      {
        name: '[Content_Types].xml',
        method: 8,
        body: productContentTypesXml(),
      },
      {
        name: '_rels/.rels',
        method: 8,
        body: productRootRelsXml(),
      },
      {
        name: 'word/_rels/document.xml.rels',
        method: 8,
        body: productDocumentRelsXml(),
      },
      {
        name: 'docProps/custom.xml',
        method: 8,
        body: customPropertiesXml([
          { name: 'YRTK_C01_AUTH', value: authority },
          { name: 'YRTK2_TOKEN', value: 'YRTK2.product-intake-token' },
          { name: 'YRTK_CORE_DIGEST', value: payload.coreManifestDigest },
        ]),
      },
    ]),
  };
}

function productReviewDocxWithTrackedReplacement({
  secret = 'local-secret-for-product-return-intake',
  roundId = 'round-product-intake-replacement-1',
  exportId = 'export-product-intake-replacement-1',
  sceneId = 'roman/imported/scene-1.txt',
  sceneText = 'Alpha beta gamma.',
  deletedText = 'beta',
  insertedText = 'delta',
  blockId = 'block-product-intake-replacement-1',
  envelopeOverrides = {},
} = {}) {
  const rawSha256 = c05Sha256Text(sceneText);
  const payload = {
    schemaVersion: 'yalken.rtk.locator-authority-envelope.c01.v1',
    taskId: 'YALKEN_WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01',
    profileId: 'word-mac-latest-observed-16.111.x-product-review-export-p0',
    caseId: 'product-review-docx-export-p0-tracked-replacement',
    sceneId,
    sceneRevision: rawSha256,
    rawSha256,
    blockId,
    roundId,
    exportId,
    exportArtifactId: 'export-artifact-product-intake-replacement-1',
    semanticReturnId: 'semantic-return-product-intake-replacement-1',
    coreManifestDigest: c05Sha256Text('core-manifest-product-intake-replacement-1'),
    transportManifestDigest: c05Sha256Text('transport-manifest-product-intake-replacement-1'),
    yrtk2TokenDigest: c05Sha256Text('yrtk2-product-intake-replacement-1'),
    blockCount: 1,
  };
  const authority = productAuthorityEnvelope(payload, secret, envelopeOverrides);
  return {
    payload,
    secret,
    sceneText,
    deletedText,
    insertedText,
    bytes: cleanDocxZip([
      '<w:p>',
      '<w:r><w:t>Alpha </w:t></w:r>',
      `<w:del w:id="1"><w:r><w:delText>${deletedText}</w:delText></w:r></w:del>`,
      `<w:ins w:id="2"><w:r><w:t>${insertedText}</w:t></w:r></w:ins>`,
      '<w:r><w:t> gamma.</w:t></w:r>',
      '</w:p>',
    ].join(''), [
      {
        name: '[Content_Types].xml',
        method: 8,
        body: productContentTypesXml({ includeComments: false }),
      },
      {
        name: '_rels/.rels',
        method: 8,
        body: productRootRelsXml(),
      },
      {
        name: 'docProps/custom.xml',
        method: 8,
        body: customPropertiesXml([
          { name: 'YRTK_C01_AUTH', value: authority },
          { name: 'YRTK2_TOKEN', value: 'YRTK2.product-intake-replacement-token' },
          { name: 'YRTK_CORE_DIGEST', value: payload.coreManifestDigest },
        ]),
      },
    ]),
  };
}

function productAuthorityStoreFromDocx(docx, overrides = {}) {
  return {
    schemaVersion: 'yalken.rtk.word.product-review-docx-export.authority-store.v1',
    lastRoundId: docx.payload.roundId,
    roundsById: {
      [docx.payload.roundId]: {
        schemaVersion: 'yalken.rtk.word.product-review-docx-export.local-authority.v1',
        projectRoot: '/project',
        scenePath: '/project/roman/imported/scene-1.txt',
        baselineFinalText: 'Anchored text',
        hmacSecret: docx.secret,
        expectedAuthority: {
          sceneId: docx.payload.sceneId,
          sceneRevision: docx.payload.sceneRevision,
          rawSha256: docx.payload.rawSha256,
          blockId: docx.payload.blockId,
          roundId: docx.payload.roundId,
          exportId: docx.payload.exportId,
        },
        roundId: docx.payload.roundId,
        exportIdentity: docx.payload.exportId,
        manifestDigest: docx.payload.transportManifestDigest,
        coreManifestDigest: docx.payload.coreManifestDigest,
        exportMap: {
          scenes: [
            {
              sceneId: docx.payload.sceneId,
              rawSha256: docx.payload.rawSha256,
            },
          ],
        },
        ...overrides,
      },
    },
    secretExposedToRenderer: false,
  };
}

function c05ReviewIr({ deleted = 'beta', inserted = 'delta', groupId = 'group-c05' } = {}) {
  return {
    schemaVersion: 'yalken.rtk.review-ir.v2',
    sourceMode: 'TRACKED',
    textRevisions: [
      {
        kind: 'TextRevision',
        operation: 'delete',
        nativeRevisionId: `del-${groupId}`,
        text: deleted,
        textDigest: c05Sha256Text(`delete:${deleted}`),
        replacementGroupId: groupId,
      },
      {
        kind: 'TextRevision',
        operation: 'insert',
        nativeRevisionId: `ins-${groupId}`,
        text: inserted,
        textDigest: c05Sha256Text(`insert:${inserted}`),
        replacementGroupId: groupId,
      },
    ],
    moveRevisions: [],
    propertyRevisions: [],
    structureChanges: [],
    formattingDeltas: [],
    commentThreads: [],
    opaqueUnsupported: [],
  };
}

function c05ExactAuthority(overrides = {}) {
  return {
    validSignedLocator: true,
    sceneRevisionUnchanged: true,
    rawSha256Unchanged: true,
    uniqueTarget: true,
    nonOverlapping: true,
    allRelevantXmlSemanticsAccounted: true,
    ambiguousDuplicate: false,
    crossScene: false,
    structuralTopologyChanged: false,
    ...overrides,
  };
}

function c05AuthorityCarrier(sceneId = 'roman/imported/scene-1.txt', blockId = 'block-c05-target') {
  return {
    schemaVersion: 'yalken.rtk.review-transport-authority-carrier.v2',
    status: 'verified-baseline-bound',
    selectedCarrier: {
      carrier: 'customDocumentProperty',
      propertyName: 'YRTK_C01_AUTH',
      verified: true,
      validSignedLocator: true,
      payload: {
        sceneId,
        sceneRevision: 'scene-revision-c05-0001',
        rawSha256: 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
        blockId,
        roundId: 'round-c05',
        exportId: 'export-c05',
      },
      baselineBinding: {
        allExpectedPresent: true,
        allExpectedMatched: true,
        sceneRevisionMatches: true,
        rawSha256Matches: true,
      },
    },
    carriers: [],
    exactAuthority: c05ExactAuthority(),
    reasons: [],
  };
}

function c05ProductApplyInput({
  sceneText = 'Alpha beta gamma.',
  sceneId = 'roman/imported/scene-1.txt',
  blockId = 'block-c05-target',
  baselineHash = 'baseline-1',
} = {}) {
  const sourceRevisionSha256 = c05Sha256Text(`revision:${sceneText}`);
  const sourceRawBytesSha256 = c05Sha256Text(`raw:${sceneText}`);
  return {
    commandId: 'cmd.rtk.review.applyNonOverlapTrackedReplacements',
    callerRole: 'main',
    commandAuthority: {
      issuer: 'main',
      intent: 'rtk.exactApply',
      commandId: 'cmd.rtk.review.applyNonOverlapTrackedReplacements',
    },
    roundId: 'round-c05',
    requestId: 'request-c05-1',
    exportIdentity: 'export-c05',
    returnArtifactSha256: c05Sha256Text('returned-docx-c05'),
    manifestDigest: c05Sha256Text('manifest-c05'),
    analysisDigest: c05Sha256Text('analysis-c05'),
    returnLifecycleState: 'RETURN_ANALYZED',
    sourceIdentity: {
      sourceTokenDomain: 'SOURCE_TOKEN_DOMAIN_V1',
      writerTextDomain: 'WRITER_TEXT_DOMAIN_V1',
      revisionSha256: sourceRevisionSha256,
      rawBytesSha256: sourceRawBytesSha256,
    },
    currentIdentity: {
      revisionSha256: sourceRevisionSha256,
      rawBytesSha256: sourceRawBytesSha256,
    },
    exactAuthority: c05ExactAuthority(),
    authorityCarrier: c05AuthorityCarrier(sceneId, blockId),
    reviewIr: c05ReviewIr(),
    localBaseline: {
      sceneId,
      sceneBlocks: [
        {
          sceneId,
          blockId,
          text: sceneText,
        },
      ],
    },
    writerContext: {
      projectRoot: '/project',
      scenePath: '/project/roman/imported/scene-1.txt',
      scenePathBySceneId: { [sceneId]: '/project/roman/imported/scene-1.txt' },
      projectSnapshot: {
        projectId: 'project-1',
        baselineHash,
        scenes: [{ sceneId, text: sceneText }],
      },
      revisionSession: {
        projectId: 'project-1',
        sessionId: 'session-c05',
        baselineHash,
        status: 'open',
        reviewGraph: {
          commentThreads: [],
          commentPlacements: [],
          textChanges: [],
          structuralChanges: [],
          diagnosticItems: [],
          decisionStates: [],
        },
      },
    },
    previewConfirmed: false,
  };
}

test('DOCX review preview session command: command is bridge-allowlisted and handler-owned', () => {
  const source = readMainSource();

  assert.match(
    source,
    /UI_COMMAND_BRIDGE_ALLOWED_COMMAND_IDS\s*=\s*new Set\(\[[\s\S]*'cmd\.project\.review\.activateDocxReviewPreviewSession'/,
  );
  assert.match(
    source,
    /'cmd\.project\.review\.activateDocxReviewPreviewSession':\s*async\s*\(payload\s*=\s*\{\}\)\s*=>\s*\{[\s\S]*handleDocxReviewPreviewSessionActivationCommandSurface\(payload\)/,
  );
  assert.match(
    source,
    /'cmd\.project\.review\.activateDocxReviewPreviewSession':\s*async\s*\(payload\s*=\s*\{\}\)\s*=>\s*\{[\s\S]*sendCanonicalRuntimeCommand\(\s*'cmd\.project\.review\.openComments',\s*\{\s*source:\s*'review-docx-preview-session',\s*requestId:\s*result\.requestId\s*\}/,
  );
  assert.match(
    source,
    /DOCX_REVIEW_PREVIEW_SESSION_ALLOWED_CONTEXT_KINDS\s*=\s*new Set\(\[[\s\S]*'scene'[\s\S]*'chapter-file'[\s\S]*'roman-section'/,
  );
  assert.match(source, /documentKind:\s*documentContext\.kind/u);
  assert.match(source, /targetScope:\s*\{\s*type:\s*'scene',\s*id:\s*sceneId/u);
});

test('DOCX review preview session command: activates an in-memory review session from DOCX comments', async () => {
  const port = instantiateDocxReviewPreviewSessionPort();
  const result = await port.handleDocxReviewPreviewSessionActivationCommandSurface(
    toPayload(docxWithAnchoredComment()),
    {
      buildMainReviewContext: async () => reviewContext(),
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.commandId, 'cmd.project.review.activateDocxReviewPreviewSession');
  assert.equal(result.activated, true);
  assert.equal(result.canOpenReviewSession, true);
  assert.equal(result.canAutoApply, false);
  assert.equal(result.canImportMutate, false);
  assert.equal(result.canWriteStorage, false);
  assert.equal(result.session.projectId, 'project-1');
  assert.equal(result.session.baselineHash, 'baseline-1');
  assert.equal(result.reviewSurface.revisionSession.reviewGraph.commentThreads.length, 1);
  assert.equal(
    result.reviewSurface.revisionSession.reviewGraph.commentThreads[0].messages[0].body,
    'Resolve this comment.',
  );
  assert.deepEqual(result.reviewSurface.revisionSession.reviewGraph.textChanges, []);
  assert.equal(result.reviewSurface.blockedApplyPlan.canApply, false);
  assert.deepEqual(result.reviewSurface.blockedApplyPlan.applyOps, []);
  assert.equal(result.candidateSummary.commentThreadCount, 1);
  assertNoWriteReceiptsOrApplyAuthority(result);
  assert.equal(port.getState().activeReviewSessionLifecycle, 'active');
});

test('DOCX review preview session command: menu handler opens comments after activation', async () => {
  const port = instantiateDocxReviewPreviewSessionPort();
  const result = await port.MENU_COMMAND_HANDLERS['cmd.project.review.activateDocxReviewPreviewSession'](
    toPayload(docxWithAnchoredComment()),
  );

  assert.equal(result.ok, true);
  assert.equal(result.activated, true);
  assert.deepEqual(cloneJsonSafe(port.runtimeCommands), [
    {
      commandId: 'cmd.project.review.openComments',
      payload: {
        source: 'review-docx-preview-session',
        requestId: 'docx-review-preview-session-request',
      },
      legacyCommand: 'review-comment',
    },
  ]);
});

test('DOCX review preview session command: no-evidence DOCX leaves session passive', async () => {
  const port = instantiateDocxReviewPreviewSessionPort();
  const result = await port.handleDocxReviewPreviewSessionActivationCommandSurface(
    toPayload(cleanDocxZip(paragraphXml('Clean'))),
    {
      buildMainReviewContext: async () => reviewContext(),
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.op, 'cmd.project.review.activateDocxReviewPreviewSession');
  assert.equal(result.error.code, 'E_DOCX_REVIEW_PREVIEW_SESSION_NO_CANDIDATE');
  assert.equal(result.error.reason, 'DOCX_REVIEW_PREVIEW_SESSION_CANDIDATE_NO_REVIEW_COMMENTS');
  assert.equal(port.getState().activeReviewSessionLifecycle, 'passive');
});

test('DOCX review preview session command: forbidden renderer fields are rejected before context', async () => {
  const port = instantiateDocxReviewPreviewSessionPort();
  const result = await port.handleDocxReviewPreviewSessionActivationCommandSurface(
    toPayload(docxWithAnchoredComment(), {
      reviewPacket: { leak: true },
    }),
    {
      buildMainReviewContext: async () => {
        throw new Error('context must not be read for forbidden payload fields');
      },
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.op, 'cmd.project.review.activateDocxReviewPreviewSession');
  assert.equal(result.error.code, 'E_DOCX_INTAKE_GATE_PAYLOAD_INVALID');
  assert.equal(result.error.reason, 'DOCX_INTAKE_GATE_PAYLOAD_UNSUPPORTED_FIELDS');
  assert.deepEqual(result.error.details.fields, ['reviewPacket']);
  assert.equal(port.getState().activeReviewSessionLifecycle, 'passive');
});

test('DOCX review preview session command: complex tracked changes open manual structural review', async () => {
  const port = instantiateDocxReviewPreviewSessionPort();
  const result = await port.handleDocxReviewPreviewSessionActivationCommandSurface(
    toPayload(cleanDocxZip([
      paragraphXml('Before'),
      '<w:ins><w:p><w:r><w:t>Inserted</w:t></w:r></w:p></w:ins>',
    ].join(''))),
    {
      buildMainReviewContext: async () => reviewContext(),
    },
  );

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.activated, true);
  assert.equal(result.diagnosticOnly, false);
  assert.equal(result.canOpenReviewSession, true);
  assert.equal(result.canCreateReviewPacket, true);
  assert.equal(result.canAutoApply, false);
  assert.equal(result.canImportMutate, false);
  assert.equal(result.canWriteStorage, false);
  assert.equal(result.candidateSummary.status, 'ready');
  assert.equal(result.candidateSummary.diagnosticItemCount, 2);
  assert.equal(result.candidateSummary.structuralChangeCount, 1);
  const reviewGraph = result.reviewSurface.revisionSession.reviewGraph;
  assert.equal(reviewGraph.diagnosticItems.length, 2);
  assert.equal(reviewGraph.diagnosticItems[0].diagnosticId, 'docx-review-tracked-insertCount');
  assert.deepEqual(reviewGraph.textChanges, []);
  assert.equal(reviewGraph.structuralChanges.length, 1);
  assert.equal(reviewGraph.structuralChanges[0].manualOnly, true);
  assert.equal(result.reviewSurface.blockedApplyPlan.canApply, false);
  assert.deepEqual(result.reviewSurface.blockedApplyPlan.applyOps, []);
  assertNoWriteReceiptsOrApplyAuthority(result);
  assert.equal(port.getState().activeReviewSessionLifecycle, 'active');
});

test('DOCX review preview session command: simple replacement opens one manual text candidate', async () => {
  const port = instantiateDocxReviewPreviewSessionPort();
  const result = await port.handleDocxReviewPreviewSessionActivationCommandSurface(
    toPayload(cleanDocxZip([
      '<w:p>',
      '<w:r><w:t>Alpha </w:t></w:r>',
      '<w:del w:id="1"><w:r><w:delText>beta</w:delText></w:r></w:del>',
      '<w:ins w:id="2"><w:r><w:t>delta</w:t></w:r></w:ins>',
      '<w:r><w:t> gamma.</w:t></w:r>',
      '</w:p>',
    ].join(''))),
    {
      buildMainReviewContext: async () => reviewContext(),
    },
  );

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.activated, true);
  assert.equal(result.diagnosticOnly, false);
  assert.equal(result.canOpenReviewSession, true);
  assert.equal(result.canAutoApply, false);
  assert.equal(result.candidateSummary.textChangeCount, 1);
  assert.equal(result.candidateSummary.trackedTextCandidateCount, 1);
  const reviewGraph = result.reviewSurface.revisionSession.reviewGraph;
  assert.equal(reviewGraph.textChanges.length, 1);
  assert.equal(reviewGraph.textChanges[0].match.kind, 'manual');
  assert.equal(reviewGraph.textChanges[0].match.quote, 'beta');
  assert.equal(reviewGraph.textChanges[0].replacementText, 'delta');
  assert.equal(result.nonOverlapTrackedReplacementProductPath, null);
  assert.equal(result.reviewSurface.blockedApplyPlan.canApply, false);
  assert.deepEqual(result.reviewSurface.blockedApplyPlan.applyOps, []);
  assertNoWriteReceiptsOrApplyAuthority(result);
});

test('DOCX review preview session command: non-overlap tracked replacements reach product apply path only through a hidden main envelope', async () => {
  const calls = [];
  const port = instantiateDocxReviewPreviewSessionPort({
    dispatchCommandSurfaceKernel: async (commandId, payload = {}) => {
      calls.push({ commandId, payload: cloneJsonSafe(payload) });
      assert.equal(commandId, 'cmd.rtk.review.applyNonOverlapTrackedReplacements');
      assert.equal(payload.previewConfirmed, true);
      assert.equal(payload.commandAuthority.issuer, 'main');
      assert.equal(payload.commandAuthority.intent, 'rtk.exactApply');
      assert.equal(payload.exactAuthority.validSignedLocator, true);
      assert.equal(payload.exactAuthority.uniqueTarget, true);
      assert.equal(payload.writerContext.scenePath, '/project/roman/imported/scene-1.txt');
      return {
        status: 'applied',
        code: 'RTK_APPLIED',
        reason: 'RTK_APPLIED',
        applied: true,
        writerCalled: true,
        automaticApplyCertified: true,
        runtimeSummary: {
          replacementPairCount: 1,
          trustedBlockRangeDigestCount: 1,
        },
        vetoMetrics: {
          falseExact: 0,
          wrongSceneRouting: 0,
          silentApply: 0,
          replayFailure: 0,
          silentLoss: 0,
        },
      };
    },
  });
  const result = await port.handleDocxReviewPreviewSessionActivationCommandSurface(
    toPayload(cleanDocxZip([
      '<w:p>',
      '<w:r><w:t>Alpha </w:t></w:r>',
      '<w:del w:id="1"><w:r><w:delText>beta</w:delText></w:r></w:del>',
      '<w:ins w:id="2"><w:r><w:t>delta</w:t></w:r></w:ins>',
      '<w:r><w:t> gamma.</w:t></w:r>',
      '</w:p>',
    ].join(''))),
    {
      buildMainReviewContext: async () => reviewContext({
        scenePath: '/project/roman/imported/scene-1.txt',
        sceneText: 'Alpha beta gamma.',
      }),
      buildRtkNonOverlapTrackedReplacementApplyInput: async () => ({
        ok: true,
        input: c05ProductApplyInput(),
      }),
    },
  );

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.canAutoApply, false);
  assert.equal(result.canImportMutate, false);
  assert.equal(result.canWriteStorage, false);
  assert.equal(result.nonOverlapTrackedReplacementProductPath.prepared, true);
  assert.equal(result.nonOverlapTrackedReplacementProductPath.status, 'preview-ready');
  assert.equal(result.nonOverlapTrackedReplacementProductPath.writerCalled, false);
  assert.equal(result.nonOverlapTrackedReplacementProductPath.rendererAuthority, false);
  assert.equal(calls.length, 0);

  const textChanges = result.reviewSurface.revisionSession.reviewGraph.textChanges;
  assert.equal(textChanges.length, 1);
  assert.equal(textChanges[0].rtkProductPath, 'nonOverlapTrackedReplacement');
  assert.equal(textChanges[0].match.kind, 'exact');
  assert.equal(textChanges[0].match.quote, 'beta');
  assert.equal(textChanges[0].match.blockId, 'block-c05-target');
  assert.equal(Object.prototype.hasOwnProperty.call(textChanges[0].match, 'blockRange'), false);
  assert.equal(result.reviewSurface.exactTextPlanPreview.status, 'ready');
  assert.equal(result.reviewSurface.exactTextPlanPreview.productPath.rendererAuthority, false);
  assert.equal(result.reviewSurface.rtkNonOverlapTrackedReplacementProductPath.productRuntimeWired, true);
  assert.equal(result.reviewSurface.rtkNonOverlapTrackedReplacementProductPath.automaticApplyCertified, false);
  assertNoWriteReceiptsOrApplyAuthority(result);

  const changeId = textChanges[0].changeId;
  const applied = await port.handleReviewSurfaceApplyExactTextChangeCommandSurface({
    requestId: 'apply-c05-from-visible-preview',
    changeId,
  });
  assert.equal(applied.ok, true, JSON.stringify(applied, null, 2));
  assert.equal(applied.applied, true);
  assert.equal(applied.result.automaticApplyCertified, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.requestId, 'apply-c05-from-visible-preview');
  assert.equal(calls[0].payload.previewConfirmed, true);
  assert.equal(applied.reviewSurface.exactTextAppliedChangeIds.includes(changeId), true);
  assert.equal(applied.reviewSurface.rtkNonOverlapTrackedReplacementApplyResult.status, 'applied');
  assert.equal(port.getState().currentReviewSurfacePayload.rtkNonOverlapTrackedReplacementApplyResult.status, 'applied');
});

test('DOCX review preview session command: authenticated return IR drives visible preview explicit apply and replay', async () => {
  const docx = productReviewDocxWithTrackedReplacement();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-rtk-p0-return-loop-'));
  const scenePath = path.join(tmpDir, 'scene-1.txt');
  fs.writeFileSync(scenePath, docx.sceneText, 'utf8');
  const bridge = await loadBridge();
  const calls = [];
  const applyHandler = bridge.createRtkNonOverlapTrackedReplacementCommandHandler({
    cryptoPort: c05CryptoPort,
    now: () => 1700000000000,
  });
  const port = instantiateDocxReviewPreviewSessionPort({
    dispatchCommandSurfaceKernel: async (commandId, payload = {}) => {
      calls.push({ commandId, payload: cloneJsonSafe(payload) });
      assert.equal(commandId, 'cmd.rtk.review.applyNonOverlapTrackedReplacements');
      return applyHandler(payload);
    },
  });
  const sceneHash = computeHash(docx.sceneText);
  const result = await port.handleDocxReviewPreviewSessionActivationCommandSurface(
    toPayload(docx.bytes),
    {
      activeReviewDocxExportAuthorityStore: productAuthorityStoreFromDocx(docx, {
        projectRoot: tmpDir,
        scenePath,
        baselineFinalText: docx.sceneText,
      }),
      buildMainReviewContext: async () => reviewContext({
        projectRoot: tmpDir,
        scenePath,
        sceneText: docx.sceneText,
        baselineHash: sceneHash,
        currentBaselineHash: sceneHash,
      }),
    },
  );

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.returnIntake.authenticated, true);
  assert.equal(result.returnIntake.status, 'authenticated-return-ir-ready');
  assert.equal(result.nonOverlapTrackedReplacementProductPath.prepared, true);
  assert.equal(result.reviewSurface.rtkNonOverlapTrackedReplacementProductPath.productRuntimeWired, true);
  assert.equal(result.reviewSurface.rtkNonOverlapTrackedReplacementProductPath.automaticApplyCertified, false);
  assert.equal(fs.readFileSync(scenePath, 'utf8'), docx.sceneText);
  assert.equal(calls.length, 0);

  const textChanges = result.reviewSurface.revisionSession.reviewGraph.textChanges;
  assert.equal(textChanges.length, 1);
  assert.equal(textChanges[0].match.kind, 'exact');
  assert.equal(textChanges[0].match.quote, docx.deletedText);
  assert.equal(textChanges[0].replacementText, docx.insertedText);
  assert.equal(textChanges[0].rtkProductPath, 'nonOverlapTrackedReplacement');

  const applied = await port.handleReviewSurfaceApplyExactTextChangeCommandSurface({
    requestId: 'apply-authenticated-return-ir',
    changeId: textChanges[0].changeId,
  });
  assert.equal(applied.ok, true, JSON.stringify(applied, null, 2));
  assert.equal(applied.applied, true);
  assert.equal(applied.result.status, 'applied');
  assert.equal(applied.result.writerCalled, true);
  assert.equal(fs.readFileSync(scenePath, 'utf8'), 'Alpha delta gamma.');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.previewConfirmed, true);
  assert.equal(calls[0].payload.returnArtifactSha256, result.returnIntake.returnedArtifactSha256);
  assert.equal(calls[0].payload.reviewIr.textRevisions.length, 2);
  assert.equal(calls[0].payload.authorityCarrier.selectedCarrier.payload.roundId, docx.payload.roundId);

  const replay = await port.handleReviewSurfaceApplyExactTextChangeCommandSurface({
    requestId: 'apply-authenticated-return-ir-replay',
    changeId: textChanges[0].changeId,
  });
  assert.equal(replay.ok, true, JSON.stringify(replay, null, 2));
  assert.equal(replay.replay, true);
  assert.equal(replay.result.status, 'replay');
  assert.equal(fs.readFileSync(scenePath, 'utf8'), 'Alpha delta gamma.');
  assert.equal(calls.length, 2);
});

test('DOCX review preview session command: forged renderer fields cannot manufacture C05 product authority', async () => {
  const port = instantiateDocxReviewPreviewSessionPort({
    dispatchCommandSurfaceKernel: async () => {
      throw new Error('forged renderer payload must not reach runtime apply command');
    },
  });
  const result = await port.handleDocxReviewPreviewSessionActivationCommandSurface(
    toPayload(cleanDocxZip([
      '<w:p>',
      '<w:r><w:t>Alpha </w:t></w:r>',
      '<w:del w:id="1"><w:r><w:delText>beta</w:delText></w:r></w:del>',
      '<w:ins w:id="2"><w:r><w:t>delta</w:t></w:r></w:ins>',
      '<w:r><w:t> gamma.</w:t></w:r>',
      '</w:p>',
    ].join('')), {
      rtkNonOverlapTrackedReplacementAuthority: {
        hmacSecret: 'attacker-controlled',
        expectedAuthority: { sceneId: 'roman/imported/scene-1.txt' },
      },
    }),
    {
      buildMainReviewContext: async () => reviewContext(),
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'E_DOCX_INTAKE_GATE_PAYLOAD_INVALID');
  assert.equal(result.error.reason, 'DOCX_INTAKE_GATE_PAYLOAD_UNSUPPORTED_FIELDS');
  assert.deepEqual(result.error.details.fields, ['rtkNonOverlapTrackedReplacementAuthority']);
  assert.equal(port.getState().activeReviewSessionLifecycle, 'passive');
});

test('DOCX review preview session command: legacy rooted comments stay preview-only without persistent comment shadow storage', async () => {
  const calls = [];
  const port = instantiateDocxReviewPreviewSessionPort({
    dispatchCommandSurfaceKernel: async () => {
      calls.push({});
      throw new Error('legacy unbound comments must not reach persistent comment shadow import');
    },
  });
  const result = await port.handleDocxReviewPreviewSessionActivationCommandSurface(
    toPayload(docxWithAnchoredComment()),
    {
      buildMainReviewContext: async () => reviewContext(),
    },
  );

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(calls.length, 0);
  assert.equal(result.returnIntake.authenticated, false);
  assert.equal(result.commentShadowResult, null);
  assert.equal(result.commentShadowSession, null);
  assert.equal(result.reviewSurface.revisionSession.reviewGraph.commentThreads.length, 1);
  assertNoWriteReceiptsOrApplyAuthority(result);
});

test('DOCX review preview session command: authenticated product return intake gates before session import and binds comment shadow identity', async () => {
  const docx = productReviewDocxWithAnchoredComment();
  const calls = [];
  const port = instantiateDocxReviewPreviewSessionPort({
    dispatchCommandSurfaceKernel: async (commandId, payload = {}) => {
      calls.push({ commandId, payload: cloneJsonSafe(payload) });
      return {
        ok: true,
        status: 'committed',
        code: 'RTK_COMMENT_SHADOW_SESSION_COMMITTED',
        writerCalled: false,
        manuscriptApplyAuthority: false,
        session: {
          authorityLevel: {
            productRuntimeWired: true,
            automaticApplyCertified: false,
          },
          authenticatedReturnIdentity: payload.authenticatedReturnIdentity,
          roundId: payload.roundId,
          semanticReturnId: payload.semanticReturnId,
          summary: { threadCount: payload.reviewIr.commentThreads.length },
        },
        storageEffects: {
          sessionRecordCreated: true,
          receiptCreated: true,
          manuscriptBytesWritten: 0,
        },
      };
    },
  });
  const result = await port.handleDocxReviewPreviewSessionActivationCommandSurface(
    toPayload(docx.bytes),
    {
      activeReviewDocxExportAuthorityStore: productAuthorityStoreFromDocx(docx),
      buildMainReviewContext: async () => reviewContext({
        scenePath: '/project/roman/imported/scene-1.txt',
        sceneText: 'Anchored text',
      }),
    },
  );

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.returnIntake.authenticated, true);
  assert.equal(result.returnIntake.status, 'authenticated-return-ir-ready');
  assert.equal(result.returnIntake.authority.validSignedLocator, true);
  assert.equal(result.returnIntake.roundId, docx.payload.roundId);
  assert.equal(result.returnIntake.exportId, docx.payload.exportId);
  assert.equal(result.returnIntake.semanticReturnId, docx.payload.semanticReturnId);
  assert.equal(result.returnIntake.canAutoApply, false);
  assert.equal(result.canAutoApply, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].commandId, 'cmd.rtk.reviewSession.importComments');
  assert.equal(calls[0].payload.roundId, docx.payload.roundId);
  assert.equal(calls[0].payload.returnArtifactId, result.returnIntake.returnedArtifactSha256);
  assert.equal(calls[0].payload.semanticReturnId, docx.payload.semanticReturnId);
  assert.equal(calls[0].payload.authenticatedReturnIdentity.authenticated, true);
  assert.equal(calls[0].payload.authenticatedReturnIdentity.projectId, 'project-1');
  assert.equal(calls[0].payload.authenticatedReturnIdentity.sceneId, docx.payload.sceneId);
  assert.equal(calls[0].payload.authenticatedReturnIdentity.sceneRevision, docx.payload.sceneRevision);
  assert.equal(calls[0].payload.authenticatedReturnIdentity.rawSha256, docx.payload.rawSha256);
  assert.equal(calls[0].payload.authenticatedReturnIdentity.exportId, docx.payload.exportId);
  assert.equal(calls[0].payload.authenticatedReturnIdentity.returnArtifactId, result.returnIntake.returnedArtifactSha256);
  assert.equal(calls[0].payload.reviewIr.roundId, docx.payload.roundId);
  assert.equal(calls[0].payload.reviewIr.commentThreads.length, 1);
  assert.equal(result.commentShadowSession.authenticatedReturnIdentity.sceneId, docx.payload.sceneId);
  assert.equal(result.commentShadowResult.storageEffects.sessionRecordCreated, true);
  assert.equal(result.commentShadowResult.storageEffects.manuscriptBytesWritten, 0);
  assert.equal(port.getState().activeReviewSessionLifecycle, 'active');
  assertNoWriteReceiptsOrApplyAuthority(result);
});

test('DOCX review preview session command: full-manuscript active authority store transports local export map into candidate and canonical comment commands', async () => {
  const bridge = await loadBridge();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-n2-authority-transport-'));
  const sceneId = 'roman/chapter-01.txt';
  const sceneText = 'Physical comment anchor';
  const scenePath = path.join(tmpDir, sceneId);
  fs.mkdirSync(path.dirname(scenePath), { recursive: true });
  fs.writeFileSync(scenePath, sceneText);
  const roundId = 'round-full-manuscript-authority-transport';
  const exportId = 'export-full-manuscript-authority-transport';
  const payload = {
    scope: 'full-manuscript', projectId: 'project-1', sceneCount: 1, orderedSceneIds: [sceneId],
    fullBookRawSha256: c05Sha256Text(sceneText), roundId, exportId,
    semanticReturnId: 'semantic-full-manuscript-authority-transport',
    coreManifestDigest: c05Sha256Text('core-full-manuscript-authority-transport'),
    transportManifestDigest: c05Sha256Text('transport-full-manuscript-authority-transport'),
  };
  const parserResult = {
    ok: true,
    authorityCarrier: {
      status: 'verified-baseline-bound',
      selectedCarrier: { payload, baselineBinding: { allExpectedMatched: true } },
    },
    exactAuthority: { validSignedLocator: true, sceneRevisionUnchanged: true, rawSha256Unchanged: true },
    parserProfileDigest: c05Sha256Text('parser'), analysisDigest: c05Sha256Text('analysis'), sourceMode: 'TRACKED',
    reviewIr: {
      commentThreads: [{
        threadId: 'rtk-comment-0', commentId: '0', status: 'resolved',
        messages: [
          { messageId: 'docx-comment-0-root', body: 'Physical root body' },
          { messageId: 'docx-comment-0-reply', body: 'Physical reply body' },
        ],
      }],
      commentPlacements: [{
        threadId: 'rtk-comment-0', sourceCommentId: '0', targetScope: { type: 'scene', id: '' }, quote: sceneText,
      }],
      textRevisions: [], moveRevisions: [], propertyRevisions: [], formattingDeltas: [],
      structureChanges: [], opaqueUnsupported: [],
    },
  };
  const bytes = docxWithCommentAndBody([
    '<w:p w14:paraId="aaaabbbb" w14:textId="11112222">',
    '<w:commentRangeStart w:id="0"/>',
    '<w:r><w:t>Physical comment anchor</w:t></w:r>',
    '<w:commentRangeEnd w:id="0"/>',
    '<w:r><w:commentReference w:id="0"/></w:r>',
    '</w:p>',
  ].join(''), 'Physical root body');
  const localAuthority = {
    schemaVersion: 'yalken.rtk.word.product-review-docx-export.local-authority.v1',
    projectRoot: tmpDir,
    scope: 'full-manuscript',
    scenePathBySceneId: { [sceneId]: scenePath },
    baselineFinalTextBySceneId: { [sceneId]: sceneText },
    hmacSecret: 'main-owned-local-secret',
    expectedAuthority: {
      scope: 'full-manuscript', sceneCount: 1, orderedSceneIds: [sceneId],
      fullBookRawSha256: payload.fullBookRawSha256, roundId, exportId,
    },
    roundId, exportIdentity: exportId,
    manifestDigest: payload.transportManifestDigest,
    coreManifestDigest: payload.coreManifestDigest,
    exportMap: {
      scenes: [{
        sceneId,
        blocks: [{
          blockId: 'block-1',
          wordSignals: [{ kind: 'w14ParaIdTextId', value: { paraId: 'aaaabbbb', textId: '11112222' } }],
        }],
      }],
    },
  };
  const calls = [];
  const rootHandler = bridge.createRtkRootCommentReturnCommandHandler();
  const lifecycleHandler = bridge.createRtkCommentLifecycleReturnCommandHandler();
  const port = instantiateDocxReviewPreviewSessionPort({
    dispatchCommandSurfaceKernel: async (commandId, commandPayload = {}) => {
      calls.push(commandId);
      if (commandId === 'cmd.rtk.reviewSession.importComments') {
        return { ok: true, status: 'committed', session: { summary: { threadCount: 1 } }, storageEffects: {} };
      }
      if (commandId === 'cmd.rtk.review.applyRootCommentReturn') return rootHandler(commandPayload);
      if (commandId === 'cmd.rtk.review.applyCommentLifecycleReturn') return lifecycleHandler(commandPayload);
      return { ok: false, code: 'UNEXPECTED_COMMAND' };
    },
  });
  const result = await port.handleDocxReviewPreviewSessionActivationCommandSurface(toPayload(bytes), {
    activeReviewDocxExportAuthorityStore: {
      schemaVersion: 'yalken.rtk.word.product-review-docx-export.authority-store.v1',
      scope: 'full-manuscript', lastRoundId: roundId, roundsById: { [roundId]: localAuthority },
      secretExposedToRenderer: false,
    },
    runDocxReviewReturnIntakeInUtilityProcess: async () => ({ ok: true, parserResult }),
    buildMainReviewContext: async () => reviewContext({
      projectRoot: tmpDir, scenePath, sceneText,
      targetScope: { type: 'scene', id: sceneId },
    }),
  });
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.returnIntake.fullManuscriptExportMapTransport.present, true);
  assert.equal(result.returnIntake.fullManuscriptExportMapTransport.returnedArtifactExportMapAccepted, false);
  assert.equal(result.candidateSummary.pendingFallbackCommentPlacementCount, 0);
  assert.deepEqual(Array.from(result.candidateSummary.commentSceneAuthoritySources), [
    'authenticated-full-manuscript-export-map-paragraph-signal',
  ]);
  assert.equal(result.commentProductPath.ok, true);
  assert.equal(result.commentProductPath.sceneAuthorityIdentityJoin.identityJoinCount, 1);
  assert.equal(result.commentProductPath.sceneAuthorityIdentityJoin.unjoinedPlacementCount, 0);
  assert.equal(result.commentProductPath.semanticOracle.triangleGreen, true);
  assert.equal(result.commentProductPath.applyReceipts.length, 3);
  assert.equal(result.commentProductPath.replayReceipts.length, 3);
  assert.equal(calls.filter((commandId) => commandId === 'cmd.rtk.review.applyRootCommentReturn').length, 2);
  assert.equal(calls.filter((commandId) => commandId === 'cmd.rtk.review.applyCommentLifecycleReturn').length, 4);
});

test('DOCX review preview session command: authenticated full-manuscript missing and forged local maps block before command dispatch', async () => {
  const roundId = 'round-map-negatives';
  const payload = {
    scope: 'full-manuscript', roundId, exportId: 'export-map-negatives', orderedSceneIds: ['scene-a'],
    coreManifestDigest: c05Sha256Text('core-map-negatives'),
    transportManifestDigest: c05Sha256Text('transport-map-negatives'),
  };
  const parserResult = {
    ok: true,
    authorityCarrier: { status: 'verified-baseline-bound', selectedCarrier: { payload, baselineBinding: { allExpectedMatched: true } } },
    exactAuthority: { validSignedLocator: true }, reviewIr: { commentThreads: [], commentPlacements: [] },
  };
  for (const [name, exportMap, expectedReason] of [
    ['missing', undefined, 'RTK_RETURN_INTAKE_LOCAL_FULL_MANUSCRIPT_EXPORT_MAP_REQUIRED'],
    ['forged', { scenes: [{ sceneId: 'scene-forged', blocks: [{ blockId: 'block-forged' }] }] }, 'RTK_RETURN_INTAKE_LOCAL_FULL_MANUSCRIPT_EXPORT_MAP_MISMATCH'],
  ]) {
    let dispatchCount = 0;
    const port = instantiateDocxReviewPreviewSessionPort({ dispatchCommandSurfaceKernel: async () => { dispatchCount += 1; } });
    const localAuthority = {
      scope: 'full-manuscript', hmacSecret: 'main-owned-local-secret', roundId,
      expectedAuthority: { scope: 'full-manuscript', orderedSceneIds: ['scene-a'], roundId },
      exportMap,
    };
    const result = await port.handleDocxReviewPreviewSessionActivationCommandSurface(toPayload(docxWithAnchoredComment()), {
      activeReviewDocxExportAuthorityStore: { roundsById: { [roundId]: localAuthority } },
      runDocxReviewReturnIntakeInUtilityProcess: async () => ({ ok: true, parserResult }),
      buildMainReviewContext: async () => reviewContext(),
    });
    assert.equal(result.ok, false, name);
    assert.equal(result.error.reason, expectedReason, name);
    assert.equal(dispatchCount, 0, name);
  }
});

test('DOCX review preview session command: product carrier without local round store is blocked before import', async () => {
  const docx = productReviewDocxWithAnchoredComment();
  const port = instantiateDocxReviewPreviewSessionPort({
    dispatchCommandSurfaceKernel: async () => {
      throw new Error('foreign product return must not reach comment shadow import');
    },
  });
  const result = await port.handleDocxReviewPreviewSessionActivationCommandSurface(
    toPayload(docx.bytes),
    {
      buildMainReviewContext: async () => reviewContext({
        scenePath: '/project/roman/imported/scene-1.txt',
        sceneText: 'Anchored text',
      }),
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'E_DOCX_REVIEW_PREVIEW_SESSION_RETURN_INTAKE_BLOCKED');
  assert.equal(result.error.reason, 'RTK_RETURN_INTAKE_FOREIGN_OR_EXPIRED_ROUND');
  assert.equal(port.getState().activeReviewSessionLifecycle, 'passive');
});

test('DOCX review preview session command: tampered product carrier HMAC cannot open a session', async () => {
  const docx = productReviewDocxWithAnchoredComment({
    envelopeOverrides: {
      signature: 'hmac-sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    },
  });
  const port = instantiateDocxReviewPreviewSessionPort({
    dispatchCommandSurfaceKernel: async () => {
      throw new Error('tampered product return must not reach comment shadow import');
    },
  });
  const result = await port.handleDocxReviewPreviewSessionActivationCommandSurface(
    toPayload(docx.bytes),
    {
      activeReviewDocxExportAuthorityStore: productAuthorityStoreFromDocx(docx),
      buildMainReviewContext: async () => reviewContext({
        scenePath: '/project/roman/imported/scene-1.txt',
        sceneText: 'Anchored text',
      }),
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'E_DOCX_REVIEW_PREVIEW_SESSION_RETURN_INTAKE_BLOCKED');
  assert.equal(result.error.reason, 'RTK_RETURN_INTAKE_AUTHORITY_NOT_VERIFIED');
  assert.equal(port.getState().activeReviewSessionLifecycle, 'passive');
});

test('DOCX review preview session command: stale local scene blocks authenticated return before import', async () => {
  const docx = productReviewDocxWithAnchoredComment();
  const port = instantiateDocxReviewPreviewSessionPort({
    dispatchCommandSurfaceKernel: async () => {
      throw new Error('stale product return must not reach comment shadow import');
    },
  });
  const result = await port.handleDocxReviewPreviewSessionActivationCommandSurface(
    toPayload(docx.bytes),
    {
      activeReviewDocxExportAuthorityStore: productAuthorityStoreFromDocx(docx),
      buildMainReviewContext: async () => reviewContext({
        scenePath: '/project/roman/imported/scene-1.txt',
        sceneText: 'Edited after export',
      }),
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'E_DOCX_REVIEW_PREVIEW_SESSION_RETURN_INTAKE_BLOCKED');
  assert.equal(result.error.reason, 'RTK_RETURN_INTAKE_STALE_CURRENT_SCENE');
  assert.equal(port.getState().activeReviewSessionLifecycle, 'passive');
});

test('DOCX review preview session command: return intake V2 source is before session import and uses parser utility boundary', () => {
  const source = extractMarkedSection(readMainSource(), ACTIVATION_SECTION_START, ACTIVATION_SECTION_END);
  assert.match(source, /inspectDocxReviewReturnIntakeV2[\s\S]*buildDocxReviewPreviewSessionCandidateFromZipBytes/u);
  assert.match(source, /runDocxReviewReturnIntakeParserV2InUtilityProcess/u);
  assert.match(source, /buildDocxReviewTransportAnalysisFromZipBytes/u);
  assert.match(source, /RTK_RETURN_INTAKE_FOREIGN_OR_EXPIRED_ROUND/u);
  assert.match(source, /RTK_RETURN_INTAKE_AUTHORITY_NOT_VERIFIED/u);
});

test('DOCX review preview session command: return intake worker accepts Electron parentPort event payloads', () => {
  delete require.cache[RETURN_INTAKE_WORKER_PATH];
  const worker = require(RETURN_INTAKE_WORKER_PATH);
  assert.equal(typeof worker.unwrapParentPortMessage, 'function');
  assert.equal(typeof worker.stripSecret, 'function');
  assert.deepEqual(
    worker.unwrapParentPortMessage({ data: { bytesBase64: 'QUJD', requestId: 'physical-canary' } }),
    { bytesBase64: 'QUJD', requestId: 'physical-canary' },
  );
  assert.deepEqual(
    worker.unwrapParentPortMessage({ bytesBase64: 'REVG', requestId: 'direct' }),
    { bytesBase64: 'REVG', requestId: 'direct' },
  );
  const bytes = Buffer.from('PK\x03\x04', 'binary');
  const stripped = worker.stripSecret({ bytes, hmacSecret: 'local-secret-never-returned' });
  assert.equal(Buffer.isBuffer(stripped.bytes), true);
  assert.equal(stripped.bytes.equals(bytes), true);
  assert.equal(Object.prototype.hasOwnProperty.call(stripped, 'hmacSecret'), false);
});

test('DOCX review preview session command: source section has no storage write authority', () => {
  const source = extractMarkedSection(readMainSource(), ACTIVATION_SECTION_START, ACTIVATION_SECTION_END);
  for (const forbidden of [
    'writeFileAtomic',
    'queueDiskOperation',
    'applyExactTextMinSafeWrite',
    'applyDocxImportSafeCreate',
    'buildDocxMinBuffer',
    'receipt:',
    'recovery:',
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
