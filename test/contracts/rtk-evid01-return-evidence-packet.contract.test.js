'use strict';

// EVID-01 Pass 1 — RED-FIRST contract falsifiers.
//
// This file is INTENTIONALLY RED. It proves, at the exact base SHA
// c00e9d319c2e36b7de24738f8daf9ca95114204e, that the DOCX review return
// intake path:
//   - has no ReturnEvidencePacket schema anywhere (V1),
//   - leaks the HMAC secret into the worker parse lane (V2),
//   - spawns the worker twice and re-extracts YRTK2 in main (V3),
//   - reparses the artifact for preview / formatting / structural candidates
//     instead of consuming the verified packet projection (V4/V5/V6),
//   - accepts any workerResult shape without integrity verification (V7),
//   - and lives with a namespace split-brain between the worker parser and the
//     literal-w preview tokenizer (V8).
//
// V9 controls guard that the existing happy paths still hold so Pass 2 does
// not regress them.
//
// Implementation is FORBIDDEN in Pass 1. Each RED subtest documents its exact
// red reason. Controls must stay green.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { deflateRawSync } = require('node:zlib');
const { pathToFileURL } = require('node:url');
const { createDocxActivationRequestDigestGuard } = require('../../src/main/rtkDocxActivationGuards.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MAIN_PATH = path.join(REPO_ROOT, 'src', 'main.js');
const WORKER_PATH = path.join(REPO_ROOT, 'src', 'main', 'rtkDocxReturnIntakeWorker.cjs');
const BRIDGE_MODULE_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'index.mjs');
const MUTATE_SECTION_START = '// CONTOUR_01A_REVIEW_MUTATE_PORT_START';
const MUTATE_SECTION_END = '// CONTOUR_01A_REVIEW_MUTATE_PORT_END';
const INTAKE_SECTION_START = '// DOCX_INTAKE_GATE_COMMAND_SURFACE_START';
const INTAKE_SECTION_END = '// DOCX_INTAKE_GATE_COMMAND_SURFACE_END';
const ACTIVATION_SECTION_START = '// DOCX_REVIEW_PREVIEW_SESSION_COMMAND_SURFACE_START';
const ACTIVATION_SECTION_END = '// DOCX_REVIEW_PREVIEW_SESSION_COMMAND_SURFACE_END';

const RETURN_EVIDENCE_PACKET_SCHEMA_VERSION = 'yalken.interop.return-evidence.v1';
const REQUIRED_PACKET_FIELDS = Object.freeze([
  'requestId',
  'artifactSha256',
  'effectiveBudgets',
  'resourceReceipt',
  'packageInventoryDigest',
  'unverifiedCarrierEvidence',
  'returnedProjection',
  'projectionDigest',
  'diagnostics',
  'workerBuildDigest',
  'packetDigest',
]);
const FORBIDDEN_AUTHORITY_FIELDS = Object.freeze([
  'canApply',
  'exactAuthority',
  'semanticReady',
]);

// ---------------------------------------------------------------------------
// ZIP fixture helpers (table-impl CRC32, no external dependency).
// ---------------------------------------------------------------------------

function asciiBytes(value) {
  return Buffer.from(value, 'ascii');
}

function utf8Bytes(value) {
  return Buffer.from(value, 'utf8');
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return value >>> 0;
});

function crc32Bytes(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
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
  header.writeUInt32LE(crc32Bytes(normalized.body), 14);
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

function centralRecord(entry, offset) {
  const normalized = normalizeEntry(entry);
  const name = asciiBytes(normalized.name);
  const header = Buffer.alloc(46 + name.length);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(entry.flags ?? 0, 8);
  header.writeUInt16LE(normalized.method, 10);
  header.writeUInt32LE(crc32Bytes(normalized.body), 16);
  header.writeUInt32LE(normalized.compressedSize, 20);
  header.writeUInt32LE(normalized.byteSize, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt32LE(offset, 42);
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
  const central = Buffer.concat(locals.map((entry) => centralRecord(entry, entry.offset)));
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(locals.length, 8);
  end.writeUInt16LE(locals.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([Buffer.concat(locals.map((entry) => entry.bytes)), central, end]);
}

function documentXml(body) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
}

function documentXmlNonWPrefix(body) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><x:document xmlns:x="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><x:body>${body}</x:body></x:document>`;
}

function paragraphXml(text) {
  return `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
}

function trackedReplacementBody() {
  return [
    '<w:p>',
    '<w:r><w:t>Alpha </w:t></w:r>',
    '<w:del w:id="1"><w:r><w:delText>beta</w:delText></w:r></w:del>',
    '<w:ins w:id="2"><w:r><w:t>delta</w:t></w:r></w:ins>',
    '<w:r><w:t> gamma.</w:t></w:r>',
    '</w:p>',
  ].join('');
}

function trackedReplacementBodyNonWPrefix() {
  return [
    '<x:p>',
    '<x:r><x:t>Alpha </x:t></x:r>',
    '<x:del x:id="1"><x:r><x:delText>beta</x:delText></x:r></x:del>',
    '<x:ins x:id="2"><x:r><x:t>delta</x:t></x:r></x:ins>',
    '<x:r><x:t> gamma.</x:t></x:r>',
    '</x:p>',
  ].join('');
}

function cleanDocxZip(body = '<w:p/>', extraEntries = []) {
  return zipFixture([
    { name: 'word/document.xml', method: 8, body: documentXml(body) },
    ...extraEntries,
  ]);
}

function trackedReplacementDocx() {
  return cleanDocxZip(trackedReplacementBody());
}

function trackedReplacementNonWPrefixDocx() {
  return zipFixture([
    { name: 'word/document.xml', method: 8, body: documentXmlNonWPrefix(trackedReplacementBodyNonWPrefix()) },
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
        '<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
        '<w:comment w:id="0" w:author="reviewer" w:date="2026-04-24T08:00:00.000Z">',
        '<w:p><w:r><w:t>Resolve this comment.</w:t></w:r></w:p>',
        '</w:comment>',
        '</w:comments>',
      ].join(''),
    },
  ]);
}

// ---------------------------------------------------------------------------
// Shared crypto/JSON helpers.
// ---------------------------------------------------------------------------

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const testCryptoPort = {
  sha256Text(value) {
    return crypto.createHash('sha256').update(Buffer.from(String(value || ''), 'utf8')).digest('hex');
  },
  sha256Json(value) {
    return `sha256:${testCryptoPort.sha256Text(stableJson(value))}`;
  },
  hmacSha256Text(value, secret) {
    return `hmac-sha256:${crypto
      .createHmac('sha256', Buffer.from(String(secret || ''), 'utf8'))
      .update(Buffer.from(String(value || ''), 'utf8'))
      .digest('hex')}`;
  },
  hmacSha256Json(value, secret) {
    return `hmac-sha256:${crypto
      .createHmac('sha256', Buffer.from(String(secret || ''), 'utf8'))
      .update(Buffer.from(stableJson(value), 'utf8'))
      .digest('hex')}`;
  },
  byteLength(value) {
    return Buffer.byteLength(String(value || ''), 'utf8');
  },
};

function isPlainObjectValue(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJsonSafe(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

// ---------------------------------------------------------------------------
// main.js VM harness (same pattern as the command-surface contract test).
// ---------------------------------------------------------------------------

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

const COMMAND_SURFACE_KERNEL_COMMAND_IDS = Object.freeze({
  RTK_REVIEW_APPLY_NON_OVERLAP_TRACKED_REPLACEMENTS: 'cmd.rtk.review.applyNonOverlapTrackedReplacements',
  RTK_REVIEW_APPLY_MULTI_SCENE_NON_OVERLAP_TRACKED_REPLACEMENTS:
    'cmd.rtk.review.applyMultiSceneNonOverlapTrackedReplacements',
  RTK_REVIEW_APPLY_ROOT_COMMENT_RETURN: 'cmd.rtk.review.applyRootCommentReturn',
  RTK_REVIEW_APPLY_COMMENT_LIFECYCLE_RETURN: 'cmd.rtk.review.applyCommentLifecycleReturn',
  RTK_REVIEW_APPLY_MULTI_SCENE_FORMATTING_RETURN: 'cmd.rtk.review.applyMultiSceneFormattingReturn',
  RTK_REVIEW_APPLY_MULTI_SCENE_STRUCTURAL_RETURN: 'cmd.rtk.review.applyMultiSceneStructuralReturn',
});

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

function reviewContext(overrides = {}) {
  return {
    ok: true,
    projectId: 'project-1',
    projectRoot: '/project',
    baselineHash: 'baseline-1',
    currentBaselineHash: 'baseline-1',
    targetScope: { type: 'scene', id: 'roman/imported/scene-1.txt' },
    createdAt: '2026-04-24T08:00:00.000Z',
    ...overrides,
  };
}

function toPayload(bytes, overrides = {}) {
  return {
    requestId: 'docx-review-preview-session-request',
    bufferSource: Buffer.from(bytes).toString('base64'),
    ...overrides,
  };
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
    activeRtkStructuralReturnApplyStore: null,
    autoSaveInProgress: false,
    currentFilePath: '/project/roman/imported/scene-1.txt',
    currentReviewSurfacePayload: {},
    currentReviewSurfacePayloadSource: 'none',
    currentReviewSurfacePayloadContentHash: '',
    isDirty: false,
    crypto,
    Buffer,
    COMMAND_SURFACE_KERNEL_COMMAND_IDS,
    ...MENU_HANDLER_COMPUTED_KEY_GLOBALS,
    cloneJsonSafe,
    computeHash: (text) => crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex'),
    fs: options.fs || { readFile: async () => 'Anchored text' },
    fsSync: options.fsSync || {
      existsSync: () => false,
      lstatSync: () => ({ isSymbolicLink: () => false, isFile: () => false }),
      readFileSync: () => 'Anchored text',
    },
    getDocumentContextFromPath: options.getDocumentContextFromPath || (() => ({ kind: 'scene' })),
    getProjectRootPath: options.getProjectRootPath || (() => '/project'),
    getProjectRelativeFilePath: options.getProjectRelativeFilePath || (() => 'roman/imported/scene-1.txt'),
    hasReviewSurfacePayload: (value) => isPlainObjectValue(value) && Object.keys(value).length > 0,
    isAllowedFilePath: options.isAllowedFilePath || (() => true),
    isPlainObjectValue,
    isPathInsideBoundary: options.isPathInsideBoundary || (() => true),
    loadRevisionBridgeModule: typeof options.loadRevisionBridgeModule === 'function'
      ? options.loadRevisionBridgeModule
      : async () => import(pathToFileURL(BRIDGE_MODULE_PATH).href),
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
const __testHandleDocxReviewPreviewSessionActivationCommandSurface = handleDocxReviewPreviewSessionActivationCommandSurface;
handleDocxReviewPreviewSessionActivationCommandSurface = (payload = {}, testOptions = {}) => (
  __testHandleDocxReviewPreviewSessionActivationCommandSurface(payload, {
    allowInlineDocxReturnIntakeParserForTests: true,
    ...testOptions,
  })
);
${menuCommandHandlersSection}
module.exports = {
  DOCX_REVIEW_PREVIEW_SESSION_COMMAND_ID,
  MENU_COMMAND_HANDLERS,
  runtimeCommands,
  handleDocxReviewPreviewSessionActivationCommandSurface,
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

// ===========================================================================
// V1 — ReturnEvidencePacket does not exist on the worker result.
// ===========================================================================

test('EVID01-V1-return-evidence-packet-exists-and-verified', async () => {
  const worker = require(WORKER_PATH);
  const bytes = trackedReplacementDocx();
  const result = await worker.run({ bytes });

  // RED reason: the worker currently returns { ok, parserResult } (or a blocked
  // envelope) and never emits a ReturnEvidencePacket. schemaVersion must be the
  // canonical packet schema, with every required packet field present, and no
  // forbidden authority field leaking into the worker output.
  assert.equal(
    result?.packet?.schemaVersion,
    RETURN_EVIDENCE_PACKET_SCHEMA_VERSION,
    'RED: worker result has no packet.schemaVersion === yalken.interop.return-evidence.v1',
  );
  assert.equal(result?.ok, true, 'RED: worker must succeed on a tracked-replacement DOCX for the packet to be observable');
  assert.ok(
    isPlainObjectValue(result?.packet),
    'RED: worker result has no packet object',
  );
  for (const field of REQUIRED_PACKET_FIELDS) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(result.packet, field),
      `RED: packet missing required field ${field}`,
    );
  }
  for (const field of FORBIDDEN_AUTHORITY_FIELDS) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(result.packet, field),
      false,
      `RED: packet must not carry authority field ${field} (carriers verified in main)`,
    );
  }
});

// ===========================================================================
// V2 — Worker has no secret; carrier verification happens in main.
// ===========================================================================

test('EVID01-V2-worker-has-no-secret', async () => {
  const workerSource = fs.readFileSync(WORKER_PATH, 'utf8');

  // RED reason (source-pin): the worker reads message.hmacSecret and forwards
  // it into the parser input. The worker must be secret-free; the packet must
  // carry unverifiedCarrierEvidence without verified verdicts.
  assert.equal(
    workerSource.includes('hmacSecret'),
    false,
    'RED: rtkDocxReturnIntakeWorker.cjs reads hmacSecret (secret leaks into worker parse lane)',
  );

  const worker = require(WORKER_PATH);
  const bytes = trackedReplacementDocx();
  const result = await worker.run({ bytes });
  const carrierEvidence = result?.packet?.unverifiedCarrierEvidence;
  assert.ok(
    isPlainObjectValue(carrierEvidence),
    'RED: packet must carry unverifiedCarrierEvidence (no verified verdicts from worker)',
  );
  assert.equal(
    carrierEvidence?.verifiedVerdict,
    undefined,
    'RED: unverifiedCarrierEvidence must not contain a verified verdict',
  );
});

// ===========================================================================
// V3 — Single bounded parse per artifact; YRTK2 from packet, not main re-extract.
// ===========================================================================

test('EVID01-V3-single-bounded-parse-per-artifact', async () => {
  const mainSource = readMainSource();

  // RED reason (source-pin): inspectDocxReviewReturnIntakeV2 (outside the
  // marker section, in the shared intake support functions) calls the worker
  // runner twice (probe + verified) and re-extracts YRTK2 in main via
  // verifyDocxReviewReturnYrtk2Binding -> extractDocxReviewReturnYrtk2Properties
  // -> extractDocxReviewTransportPackagePartsFromZipBytes.
  // The authenticated intake path must call the injectable worker runner at
  // most once. Count call sites (not the function definition) across the whole
  // main source. Today there are two call sites: probe + verified.
  const runnerCallCount = (mainSource.match(/\brunDocxReviewReturnIntakeParserV2InUtilityProcess\(/gu) || []).length;
  const runnerDefinitionCount = (mainSource.match(/function runDocxReviewReturnIntakeParserV2InUtilityProcess\(/gu) || []).length;
  const runnerActualCalls = runnerCallCount - runnerDefinitionCount;
  assert.equal(
    runnerActualCalls,
    1,
    `RED: authenticated intake spawns the worker ${runnerActualCalls} times (expected exactly 1 bounded parse per artifact)`,
  );

  // After the (single) worker run, the intake flow must not re-extract package
  // parts from the DOCX ZIP in main for YRTK2. YRTK2 must come from the packet.
  // extractDocxReviewTransportPackagePartsFromZipBytes is invoked in main
  // through extractDocxReviewReturnYrtk2Properties / verifyDocxReviewReturnYrtk2Binding.
  const mainReextractForYrtk2 = /extractDocxReviewTransportPackagePartsFromZipBytes\(/u.test(mainSource);
  assert.equal(
    mainReextractForYrtk2,
    false,
    'RED: main re-extracts package parts from the DOCX ZIP for YRTK2 (must come from the packet, not a main-side reparse)',
  );

  // Behavior pin: an injectable runner spy must observe exactly one call for an
  // authenticated artifact. We drive the activation surface with a spy runner.
  // EVID-01 Pass 2: the spy now returns a packet-shaped result (the worker
  // emits a ReturnEvidencePacket). The packet carries an unverified carrier
  // (status 'missing' → legacy-unbound path) + a returnedProjection with the
  // anchored comment so the preview candidate is built from the packet, not a
  // reparse. This documents the packet lane the production worker now emits.
  let spawnCount = 0;
  const port = instantiateDocxReviewPreviewSessionPort({
    dispatchCommandSurfaceKernel: async () => ({
      ok: true,
      status: 'applied',
      code: 'RTK_COMMENT_SHADOW_IMPORTED',
      reason: 'RTK_COMMENT_SHADOW_IMPORTED',
      session: { sessionId: 'session-evid01-v3' },
      reviewSurface: {},
    }),
  });
  const result = await port.handleDocxReviewPreviewSessionActivationCommandSurface(
    toPayload(docxWithAnchoredComment()),
    {
      runDocxReviewReturnIntakeInUtilityProcess: async (input) => {
        spawnCount += 1;
        const { buildReturnEvidencePacketV1 } = await import(pathToFileURL(BRIDGE_MODULE_PATH).href);
        const packet = buildReturnEvidencePacketV1({
          requestId: 'docx-review-preview-session-request',
          // The packet artifactSha256 MUST match the artifact the user dropped
          // (input.returnedArtifactSha256 is computed by main over the bytes).
          artifactSha256: input?.returnedArtifactSha256 || '',
          effectiveBudgets: { maxWorkerOutputBytes: 16 * 1024 * 1024 },
          effectiveBudgetDigest: testCryptoPort.sha256Json({ maxWorkerOutputBytes: 16 * 1024 * 1024 }),
          resourceReceipt: { parserStatus: 'review-ir-ready', sourceMode: 'TRACKED' },
          packageInventoryDigest: testCryptoPort.sha256Json({}),
          unverifiedCarrierEvidence: { status: 'missing' },
          returnedProjection: {
            schemaVersion: 'yalken.rtk.review-ir.v2',
            sourceMode: 'TRACKED',
            textRevisions: [],
            commentThreads: [{
              commentId: '0',
              threadId: 'rtk-comment-0',
              authorPersonIdentity: { author: 'reviewer' },
              body: 'Resolve this comment.',
              status: 'ANCHORED',
              replies: [],
            }],
            formattingDeltas: [],
            structureChanges: [],
          },
          projectionDigest: testCryptoPort.sha256Json({ sourceMode: 'TRACKED' }),
          diagnostics: [],
          workerBuildDigest: testCryptoPort.sha256Json({ implementationId: 'spy-v3' }),
        });
        return { ok: true, packet, parserResult: { authorityCarrier: { status: 'missing' } } };
      },
    },
  );
  assert.equal(result?.ok, true, JSON.stringify(result, null, 2));
  assert.equal(
    spawnCount,
    1,
    `RED: activation observed ${spawnCount} worker spawns for one artifact (expected exactly 1)`,
  );
});

// ===========================================================================
// V4 — Preview candidate comes from the packet projection, not a raw reparse.
// ===========================================================================

test('EVID01-V4-preview-candidate-from-packet-not-reparse', () => {
  const mainSource = readMainSource();

  // RED reason (source-order pin): after intake, the activation handler calls
  // buildDocxReviewPreviewSessionCandidateFromZipBytes(decoded.bytes, ...) which
  // reparses the artifact instead of consuming packet.returnedProjection.
  const activationSection = extractMarkedSection(mainSource, ACTIVATION_SECTION_START, ACTIVATION_SECTION_END);
  const reparseInActivation = /buildDocxReviewPreviewSessionCandidateFromZipBytes\(\s*decoded\.bytes/u.test(activationSection);
  assert.equal(
    reparseInActivation,
    false,
    'RED: activation flow reparses the artifact via buildDocxReviewPreviewSessionCandidateFromZipBytes(decoded.bytes) after intake',
  );
});

// ===========================================================================
// V5 — Formatting candidates come from the packet projection, not a re-scan.
// ===========================================================================

test('EVID01-V5-formatting-candidates-from-packet', () => {
  const mainSource = readMainSource();

  // RED reason (source-order pin): the formatting product path re-scans the
  // DOCX bytes via buildDocxReviewFormattingReturnCandidatesFromZipBytes.
  const reformatFromBytes = /buildDocxReviewFormattingReturnCandidatesFromZipBytes\(\s*docxBytes/u.test(mainSource);
  assert.equal(
    reformatFromBytes,
    false,
    'RED: formatting candidates are re-scanned from docxBytes via buildDocxReviewFormattingReturnCandidatesFromZipBytes instead of packet.returnedProjection.formattingDeltas',
  );

  // Parity contract: candidates produced from the projection must be equivalent
  // to candidates produced from a fresh re-scan of the same artifact. This is a
  // forward-looking expectation that pins the parity basis for Pass 2.
  // (Asserted as a documented invariant; the builder is wired today from bytes,
  //  so this is the RED marker that the packet lane does not yet exist.)
  const packetFormattingLane = /\.returnedProjection\.formattingDeltas/u.test(mainSource);
  assert.equal(
    packetFormattingLane,
    true,
    'RED: no production code path consumes packet.returnedProjection.formattingDeltas',
  );
});

// ===========================================================================
// V6 — Structural candidates come from the packet projection, not a re-scan.
// ===========================================================================

test('EVID01-V6-structural-candidates-from-packet', () => {
  const mainSource = readMainSource();

  // RED reason (source-order pin): the structural product path re-scans the
  // DOCX bytes via buildDocxReviewStructuralReturnCandidatesFromZipBytes.
  const restructuringFromBytes = /buildDocxReviewStructuralReturnCandidatesFromZipBytes\(\s*docxBytes/u.test(mainSource);
  assert.equal(
    restructuringFromBytes,
    false,
    'RED: structural candidates are re-scanned from docxBytes via buildDocxReviewStructuralReturnCandidatesFromZipBytes instead of packet.returnedProjection.structureChanges',
  );

  const packetStructuralLane = /\.returnedProjection\.structureChanges/u.test(mainSource);
  assert.equal(
    packetStructuralLane,
    true,
    'RED: no production code path consumes packet.returnedProjection.structureChanges',
  );
});

// ===========================================================================
// V7 — Forged packet is typed-rejected by main.
// ===========================================================================

test('EVID01-V7-forged-packet-typed-rejection', () => {
  const mainSource = readMainSource();

  // RED reason: main performs no schema/artifact-digest/packet-digest
  // verification on the worker result. A tampered packet (wrong projectionDigest
  // or mismatching artifactSha256) must be rejected with a typed
  // RTK_RETURN_EVIDENCE_* code and zero downstream consumption.
  const activationSection = extractMarkedSection(mainSource, ACTIVATION_SECTION_START, ACTIVATION_SECTION_END);
  const hasEvidenceVerify = /RTK_RETURN_EVIDENCE_/u.test(activationSection);
  assert.equal(
    hasEvidenceVerify,
    true,
    'RED: activation flow has no RTK_RETURN_EVIDENCE_* typed rejection for forged packets (no verify step)',
  );
});

test('EVID01-V7b-forged-packet-runtime-rejection', async () => {
  // Behavioral complement to V7's source pin: a forged packet (tampered
  // artifactSha256 + non-recomputing packetDigest) injected through the real
  // activation runner path must be rejected with a typed RTK_RETURN_EVIDENCE_*
  // code and zero activation. Kills the verify-disabled mutation class.
  const port = instantiateDocxReviewPreviewSessionPort();
  const forgedPacket = {
    schemaVersion: 'yalken.interop.return-evidence.v1',
    requestId: 'docx-review-preview-session-request',
    artifactSha256: `sha256:${'0'.repeat(64)}`,
    effectiveBudgets: { maxWorkerOutputBytes: 16 * 1024 * 1024 },
    effectiveBudgetDigest: `sha256:${'3'.repeat(64)}`,
    resourceReceipt: { parserStatus: 'review-ir-ready', sourceMode: 'TRACKED' },
    packageInventoryDigest: `sha256:${'4'.repeat(64)}`,
    unverifiedCarrierEvidence: {},
    returnedProjection: { commentThreads: [], textRevisions: [], structureChanges: [], formattingDeltas: [] },
    projectionDigest: `sha256:${'1'.repeat(64)}`,
    diagnostics: [],
    workerBuildDigest: `sha256:${'5'.repeat(64)}`,
    packetDigest: `sha256:${'2'.repeat(64)}`,
  };
  const result = await port.handleDocxReviewPreviewSessionActivationCommandSurface(
    toPayload(docxWithAnchoredComment()),
    {
      runDocxReviewReturnIntakeInUtilityProcess: async () => ({ ok: true, packet: forgedPacket }),
    },
  );
  assert.equal(result.ok, false, JSON.stringify(result, null, 2).slice(0, 800));
  const code = result?.error?.code || result?.code || '';
  const reason = result?.error?.reason || result?.reason || '';
  assert.match(`${code} ${reason}`, /RTK_RETURN_EVIDENCE_/u, 'forged packet must be rejected with typed RTK_RETURN_EVIDENCE_* code');
});

// ===========================================================================
// V8 — Namespace split-brain is unreachable in the production chain.
// ===========================================================================

test('EVID01-V8-namespace-split-brain-unreachable', async () => {
  const bridge = await import(pathToFileURL(BRIDGE_MODULE_PATH).href);
  const bytes = trackedReplacementNonWPrefixDocx();

  // Step 1: prove the split-brain exists TODAY. The worker parser
  // (buildDocxReviewTransportAnalysisFromZipBytes) is namespace-aware and sees
  // the two revisions under a non-w prefix bound to WordprocessingML.
  const transport = bridge.buildDocxReviewTransportAnalysisFromZipBytes(
    { bytes },
    { cryptoPort: testCryptoPort },
  );
  assert.equal(transport?.ok, true, JSON.stringify(transport, null, 2));
  const workerRevisions = (transport?.reviewIr?.textRevisions || []).length;
  assert.ok(
    workerRevisions > 0,
    `RED precondition: namespace-aware worker parser must see revisions on non-w prefix (saw ${workerRevisions})`,
  );

  // The literal-w preview tokenizer
  // (buildDocxReviewPreviewSessionCandidateFromZipBytes ->
  //  docxReviewPreviewSessionTrackedTextCandidates) is prefix-bound and sees 0.
  const candidate = bridge.buildDocxReviewPreviewSessionCandidateFromZipBytes(bytes, {});
  const candidateTextChanges = (candidate?.reviewPacket?.textChanges || []).length;
  assert.equal(
    candidateTextChanges,
    0,
    `RED precondition: literal-w tokenizer must see 0 tracked changes on non-w prefix (split-brain vs worker ${workerRevisions})`,
  );
  assert.ok(
    workerRevisions !== candidateTextChanges,
    'RED: split-brain confirmed — worker and literal-w tokenizer disagree on the same non-w-prefixed artifact',
  );

  // Step 2: the production chain must not use the literal-w path for tracked
  // text candidates. Once the packet lane exists, candidates must be equivalent
  // to the worker parse, not the literal-w re-scan.
  const mainSource = readMainSource();
  const activationSection = extractMarkedSection(mainSource, ACTIVATION_SECTION_START, ACTIVATION_SECTION_END);
  const activationUsesLiteralCandidate = /buildDocxReviewPreviewSessionCandidateFromZipBytes\(/u.test(activationSection);
  assert.equal(
    activationUsesLiteralCandidate,
    false,
    'RED: production activation chain still uses the literal-w candidate path (candidates must come from the packet projection, not the split-brain tokenizer)',
  );
});

// ===========================================================================
// V9 — Controls: existing happy paths stay green.
// ===========================================================================

test('EVID01-V9-CONTROL-preview-activation-happy-path', async () => {
  const port = instantiateDocxReviewPreviewSessionPort();
  const result = await port.handleDocxReviewPreviewSessionActivationCommandSurface(
    toPayload(docxWithAnchoredComment()),
  );
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.activated, true);
  assert.equal(port.getState().activeReviewSessionLifecycle, 'active');
});

test('EVID01-V9-CONTROL-no-evidence-docx-leaves-session-passive', async () => {
  const port = instantiateDocxReviewPreviewSessionPort();
  const result = await port.handleDocxReviewPreviewSessionActivationCommandSurface(
    toPayload(cleanDocxZip(paragraphXml('Clean'))),
  );
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'E_DOCX_REVIEW_PREVIEW_SESSION_NO_CANDIDATE');
  assert.equal(port.getState().activeReviewSessionLifecycle, 'passive');
});

test('EVID01-V9-CONTROL-menu-handler-opens-comments-after-activation', async () => {
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

test('EVID01-V9-CONTROL-worker-byte-size-budget-enforced', async () => {
  // Control: the worker byte-size budget guard (the only worker result check
  // today) must still reject an oversized result. This pins the existing
  // boundary so Pass 2 does not regress it.
  const worker = require(WORKER_PATH);
  const bytes = trackedReplacementDocx();
  const result = await worker.run({ bytes, effectiveBudgets: { maxWorkerOutputBytes: 1 } });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'blocked');
  assert.equal(result.code, 'RTK_BUDGET_EXCEEDED');
});
