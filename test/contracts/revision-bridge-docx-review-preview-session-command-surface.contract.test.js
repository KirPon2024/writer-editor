const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { deflateRawSync } = require('node:zlib');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MAIN_PATH = path.join(REPO_ROOT, 'src', 'main.js');
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
    getDocumentContextFromPath: options.getDocumentContextFromPath || (() => ({ kind: 'scene' })),
    getProjectRelativeFilePath: options.getProjectRelativeFilePath || (() => 'roman/imported/scene-1.txt'),
    hasReviewSurfacePayload,
    isAllowedFilePath: options.isAllowedFilePath || (() => true),
    isPlainObjectValue,
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

function docxWithAnchoredComment(extraBody = '') {
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
  assert.match(source, /targetScope:\s*\{\s*type:\s*documentContext\.kind,\s*id:\s*sceneId/u);
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

test('DOCX review preview session command: rooted comments enter product comment shadow command path', async () => {
  const calls = [];
  const port = instantiateDocxReviewPreviewSessionPort({
    dispatchCommandSurfaceKernel: async (commandId, payload = {}) => {
      calls.push({ commandId, payload });
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
          summary: { threadCount: payload.reviewIr.commentThreads.length },
        },
      };
    },
  });
  const result = await port.handleDocxReviewPreviewSessionActivationCommandSurface(
    toPayload(docxWithAnchoredComment()),
    {
      buildMainReviewContext: async () => reviewContext(),
    },
  );

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].commandId, 'cmd.rtk.reviewSession.importComments');
  assert.equal(calls[0].payload.projectRoot, '/project');
  assert.equal(calls[0].payload.reviewIr.commentThreads.length, 1);
  assert.equal(calls[0].payload.reviewIr.commentPlacements.length, 1);
  assert.equal(result.commentShadowResult.ok, true);
  assert.equal(result.commentShadowResult.writerCalled, false);
  assert.equal(result.commentShadowResult.manuscriptApplyAuthority, false);
  assert.equal(result.commentShadowSession.summary.threadCount, 1);
  assertNoWriteReceiptsOrApplyAuthority(result);
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
