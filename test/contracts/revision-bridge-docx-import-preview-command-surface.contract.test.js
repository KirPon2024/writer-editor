const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const {
  rememberDocxImportPreviewPlanAdmission,
} = require('../../src/utils/docxImportSafeCreate');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MAIN_PATH = path.join(REPO_ROOT, 'src', 'main.js');
const BRIDGE_MODULE_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'index.mjs');
const SECTION_START = '// DOCX_IMPORT_PREVIEW_COMMAND_SURFACE_START';
const SECTION_END = '// DOCX_IMPORT_PREVIEW_COMMAND_SURFACE_END';

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

function cloneJsonSafe(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function isPlainObjectValue(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function loadBridge() {
  return import(pathToFileURL(BRIDGE_MODULE_PATH).href);
}

function instantiateDocxImportPreviewPort(options = {}) {
  const mainSource = readMainSource();
  const section = extractMarkedSection(mainSource, SECTION_START, SECTION_END);
  const calls = {
    rememberAdmission: [],
  };
  const sandbox = {
    calls,
    cloneJsonSafe,
    isPlainObjectValue,
    loadRevisionBridgeModule: typeof options.loadRevisionBridgeModule === 'function'
      ? options.loadRevisionBridgeModule
      : loadBridge,
    rememberDocxImportPreviewPlanAdmission: typeof options.rememberDocxImportPreviewPlanAdmission === 'function'
      ? options.rememberDocxImportPreviewPlanAdmission
      : (plan) => {
          calls.rememberAdmission.push(cloneJsonSafe(plan));
          return rememberDocxImportPreviewPlanAdmission(plan);
        },
    module: { exports: {} },
    exports: {},
  };
  vm.runInNewContext(
    `${section}
module.exports = {
  calls,
  DOCX_IMPORT_PREVIEW_COMMAND_ID,
  DOCX_IMPORT_PREVIEW_MAX_PAYLOAD_CHARS,
  DOCX_IMPORT_PREVIEW_MAX_OBJECT_DEPTH,
  DOCX_IMPORT_PREVIEW_MAX_REQUEST_ID_CHARS,
  validateDocxImportPreviewPayload,
  buildDocxImportPreviewCommandResult,
  handleDocxImportPreviewCommandSurface,
};`,
    sandbox,
    { filename: MAIN_PATH },
  );
  return sandbox.module.exports;
}

function stableHash(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function normalizeText(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function paragraph(order, rawText) {
  const text = normalizeText(rawText);
  return {
    order,
    sourcePart: 'word/document.xml',
    text,
    textHash: stableHash(text),
    charCount: text.length,
  };
}

function contentPreviewReport(paragraphTexts, overrides = {}) {
  const paragraphs = paragraphTexts.map((text, index) => paragraph(index, text));
  const joinedText = paragraphs.map((item) => item.text).join('\n');
  return {
    ok: true,
    schemaVersion: 'revision-bridge.docx-content-preview.v1',
    type: 'docxContentPreviewReport',
    status: 'preview',
    code: 'DOCX_CONTENT_PREVIEW_READY',
    reason: 'DOCX_CONTENT_PREVIEW_READY',
    decision: 'preview',
    diagnostics: overrides.diagnostics || [],
    evidence: [
      {
        kind: 'contentPreview',
        paragraphCount: paragraphs.length,
        textLength: joinedText.length,
        textHash: stableHash(joinedText),
      },
    ],
    budgets: {
      maxParagraphs: 64000,
      maxTextChars: 5000000,
      maxDiagnostics: 200,
    },
    preflightSummary: {
      status: 'accepted',
      decision: 'accept',
      code: 'DOCX_INTAKE_PREFLIGHT_ACCEPTED',
      gatePass: true,
      parserCandidateOnly: true,
    },
    contentPreview: {
      sourcePart: 'word/document.xml',
      paragraphCount: paragraphs.length,
      textLength: joinedText.length,
      textHash: stableHash(joinedText),
      paragraphs,
    },
    parse: {
      attempted: true,
      completed: true,
    },
    ...overrides.reportOverrides,
  };
}

function toPayload(docxContentPreviewReport = contentPreviewReport(['Alpha']), overrides = {}) {
  return {
    requestId: 'request-1',
    docxContentPreviewReport,
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

function assertNoForbiddenCommandFields(result) {
  const resultKeys = collectKeys(result);
  const forbiddenResultKeys = [
    'reviewPacket',
    'reviewSurface',
    'parsedReviewSurface',
    'activeReviewSession',
    'previewInput',
    'applyOps',
    'applyPlan',
    'canApply',
    'canCreateReviewPacket',
    'canPreviewApply',
    'canImportMutate',
    'canWriteStorage',
    'writeReceipt',
    'importReceipt',
    'exportReceipt',
    'safeCreatePlan',
    'rawBytes',
    'bufferSource',
    'filePath',
    'projectRoot',
    'storage',
    'renderer',
    'preload',
    'path',
  ];

  for (const forbidden of forbiddenResultKeys) {
    assert.equal(
      resultKeys.some((key) => key === forbidden || key.endsWith(`.${forbidden}`)),
      false,
      forbidden,
    );
  }
}

function deepObject(depth) {
  let value = { leaf: true };
  for (let index = 0; index < depth; index += 1) {
    value = { nested: value };
  }
  return value;
}

test('DOCX import preview command surface: command id is bridge-allowlisted and handler-owned', () => {
  const source = readMainSource();

  assert.match(
    source,
    /UI_COMMAND_BRIDGE_ALLOWED_COMMAND_IDS\s*=\s*new Set\(\[[\s\S]*'cmd\.project\.docx\.previewImportPlan'/,
  );
  assert.match(
    source,
    /'cmd\.project\.docx\.previewImportPlan':\s*async\s*\(payload\s*=\s*\{\}\)\s*=>\s*\{\s*return handleDocxImportPreviewCommandSurface\(payload\);/,
  );
});

test('DOCX import preview command surface: clean content report returns wrapped candidate plan', async () => {
  const port = instantiateDocxImportPreviewPort();
  const result = await port.handleDocxImportPreviewCommandSurface(toPayload(
    contentPreviewReport(['Alpha', 'Bravo']),
  ));

  assert.equal(result.ok, true);
  assert.equal(result.requestId, 'request-1');
  assert.equal(result.commandId, 'cmd.project.docx.previewImportPlan');
  assert.equal(result.commandOk, true);
  assert.equal(result.importPreviewOk, true);
  assert.equal(result.importPreviewStatus, 'preview');
  assert.equal(result.importPreviewCode, 'DOCX_IMPORT_PREVIEW_READY');
  assert.equal(result.importPreviewReason, 'DOCX_IMPORT_PREVIEW_READY');
  assert.equal(result.docxImportPreviewPlan.schemaVersion, 'revision-bridge.docx-import-preview.v1');
  assert.equal(result.docxImportPreviewPlan.type, 'docx.import.preview');
  assert.equal(result.docxImportPreviewPlan.writeEffects, false);
  assert.equal(result.docxImportPreviewPlan.candidateCreatePlan.mode, 'create-only');
  assert.equal(result.docxImportPreviewPlan.candidateCreatePlan.entryCount, 1);
  assert.equal(result.docxImportPreviewPlan.candidateCreatePlan.entries[0].content, 'Alpha\n\nBravo');
  assert.equal(result.docxImportPreviewPlan.lossReport.mode, 'plain-text-only');
  assert.equal(port.calls.rememberAdmission.length, 1);
  assert.equal(port.calls.rememberAdmission[0].previewHash, result.docxImportPreviewPlan.previewHash);
  assertNoForbiddenCommandFields(result);
});

test('DOCX import preview command surface: blocked source report remains transport-successful inner failure', async () => {
  const port = instantiateDocxImportPreviewPort();
  const blockedReport = {
    ...contentPreviewReport(['Hidden']),
    ok: false,
    status: 'blocked',
    decision: 'blocked',
    code: 'DOCX_CONTENT_PREVIEW_PREFLIGHT_BLOCKED',
    contentPreview: null,
  };
  const result = await port.handleDocxImportPreviewCommandSurface(toPayload(blockedReport));

  assert.equal(result.ok, true);
  assert.equal(result.commandOk, true);
  assert.equal(result.importPreviewOk, false);
  assert.equal(result.importPreviewStatus, 'blocked');
  assert.equal(result.importPreviewCode, 'DOCX_IMPORT_PREVIEW_SOURCE_BLOCKED');
  assert.equal(result.docxImportPreviewPlan.ok, false);
  assert.equal(result.docxImportPreviewPlan.candidateCreatePlan, null);
  assert.equal(result.docxImportPreviewPlan.lossReport, null);
  assert.equal(port.calls.rememberAdmission.length, 0);
  assertNoForbiddenCommandFields(result);
});

test('DOCX import preview command surface: malformed payloads fail as typed command errors', async () => {
  const port = instantiateDocxImportPreviewPort();
  const missing = await port.handleDocxImportPreviewCommandSurface({});
  const nonObject = await port.handleDocxImportPreviewCommandSurface(null);
  const unsupported = await port.handleDocxImportPreviewCommandSurface(toPayload(contentPreviewReport(['A']), {
    extra: true,
  }));
  const bufferInput = await port.handleDocxImportPreviewCommandSurface({
    requestId: 'request-1',
    bufferSource: 'AAAA',
  });
  const invalidRequestId = await port.handleDocxImportPreviewCommandSurface(toPayload(
    contentPreviewReport(['A']),
    { requestId: 12 },
  ));
  const oversizedRequestId = await port.handleDocxImportPreviewCommandSurface(toPayload(
    contentPreviewReport(['A']),
    { requestId: 'x'.repeat(port.DOCX_IMPORT_PREVIEW_MAX_REQUEST_ID_CHARS + 1) },
  ));
  const layerLeak = await port.handleDocxImportPreviewCommandSurface(toPayload(contentPreviewReport(['A'], {
    diagnostics: [
      {
        code: 'DOCX_CONTENT_PREVIEW_UNSUPPORTED_STRUCTURE_DIAGNOSTIC',
        sourcePart: 'word/document.xml',
        path: 'secret.docx',
      },
    ],
  })));
  const intakeLeak = await port.handleDocxImportPreviewCommandSurface(toPayload({
    ...contentPreviewReport(['A']),
    gate: {
      gatePass: true,
    },
  }));
  const unsupportedReportField = await port.handleDocxImportPreviewCommandSurface(toPayload({
    ...contentPreviewReport(['A']),
    extraMetadata: {
      note: 'benign drift must not enter planning hash',
    },
  }));
  const wrongSchema = await port.handleDocxImportPreviewCommandSurface(toPayload({
    ...contentPreviewReport(['A']),
    schemaVersion: 'revision-bridge.docx-intake-preflight.v1',
  }));
  const tooDeep = await port.handleDocxImportPreviewCommandSurface(toPayload({
    ...contentPreviewReport(['A']),
    diagnostics: [deepObject(port.DOCX_IMPORT_PREVIEW_MAX_OBJECT_DEPTH + 2)],
  }));
  const oversized = await port.handleDocxImportPreviewCommandSurface(toPayload({
    ...contentPreviewReport(['A']),
    diagnostics: [
      {
        code: 'DOCX_CONTENT_PREVIEW_UNSUPPORTED_STRUCTURE_DIAGNOSTIC',
        message: 'A'.repeat(port.DOCX_IMPORT_PREVIEW_MAX_PAYLOAD_CHARS + 1),
      },
    ],
  }));

  assert.deepEqual(cloneJsonSafe(missing), {
    ok: false,
    error: {
      code: 'E_DOCX_IMPORT_PREVIEW_PAYLOAD_INVALID',
      op: 'cmd.project.docx.previewImportPlan',
      reason: 'DOCX_IMPORT_PREVIEW_SOURCE_REPORT_REQUIRED',
    },
  });
  assert.deepEqual(cloneJsonSafe(nonObject), {
    ok: false,
    error: {
      code: 'E_DOCX_IMPORT_PREVIEW_PAYLOAD_INVALID',
      op: 'cmd.project.docx.previewImportPlan',
      reason: 'DOCX_IMPORT_PREVIEW_PAYLOAD_REQUIRED',
    },
  });
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.error.reason, 'DOCX_IMPORT_PREVIEW_PAYLOAD_UNSUPPORTED_FIELDS');
  assert.deepEqual(unsupported.error.details.fields, ['extra']);
  assert.equal(bufferInput.ok, false);
  assert.equal(bufferInput.error.reason, 'DOCX_IMPORT_PREVIEW_PAYLOAD_UNSUPPORTED_FIELDS');
  assert.deepEqual(bufferInput.error.details.fields, ['bufferSource']);
  assert.equal(invalidRequestId.ok, false);
  assert.equal(invalidRequestId.error.reason, 'DOCX_IMPORT_PREVIEW_REQUEST_ID_INVALID');
  assert.equal(oversizedRequestId.ok, false);
  assert.equal(oversizedRequestId.error.code, 'E_DOCX_IMPORT_PREVIEW_PAYLOAD_TOO_LARGE');
  assert.equal(oversizedRequestId.error.reason, 'DOCX_IMPORT_PREVIEW_REQUEST_ID_TOO_LARGE');
  assert.equal(layerLeak.ok, false);
  assert.equal(layerLeak.error.reason, 'DOCX_IMPORT_PREVIEW_PAYLOAD_FORBIDDEN_FIELD');
  assert.equal(layerLeak.error.details.key, 'docxContentPreviewReport.diagnostics.0.path');
  assert.equal(intakeLeak.ok, false);
  assert.equal(intakeLeak.error.reason, 'DOCX_IMPORT_PREVIEW_PAYLOAD_FORBIDDEN_FIELD');
  assert.equal(intakeLeak.error.details.key, 'docxContentPreviewReport.gate');
  assert.equal(unsupportedReportField.ok, false);
  assert.equal(unsupportedReportField.error.reason, 'DOCX_IMPORT_PREVIEW_SOURCE_REPORT_UNSUPPORTED_FIELDS');
  assert.deepEqual(unsupportedReportField.error.details.fields, ['extraMetadata']);
  assert.equal(wrongSchema.ok, false);
  assert.equal(wrongSchema.error.reason, 'DOCX_IMPORT_PREVIEW_SOURCE_REPORT_SCHEMA_INVALID');
  assert.equal(tooDeep.ok, false);
  assert.equal(tooDeep.error.reason, 'DOCX_IMPORT_PREVIEW_PAYLOAD_DEPTH_EXCEEDED');
  assert.equal(oversized.ok, false);
  assert.equal(oversized.error.code, 'E_DOCX_IMPORT_PREVIEW_PAYLOAD_TOO_LARGE');
  assert.equal(oversized.error.reason, 'DOCX_IMPORT_PREVIEW_PAYLOAD_TOO_LARGE');
});

test('DOCX import preview command surface: benign nested extras are stripped before helper hashing', async () => {
  const port = instantiateDocxImportPreviewPort();
  const baseReport = contentPreviewReport(['Alpha'], {
    diagnostics: [
      {
        code: 'DOCX_CONTENT_PREVIEW_UNSUPPORTED_STRUCTURE_DIAGNOSTIC',
        severity: 'warning',
        message: 'unsupported DOCX structure retained as preview diagnostic only',
        sourcePart: 'word/document.xml',
        tagName: 'w:tbl',
      },
    ],
  });
  const driftReport = contentPreviewReport(['Alpha'], {
    diagnostics: [
      {
        code: 'DOCX_CONTENT_PREVIEW_UNSUPPORTED_STRUCTURE_DIAGNOSTIC',
        severity: 'warning',
        message: 'unsupported DOCX structure retained as preview diagnostic only',
        sourcePart: 'word/document.xml',
        tagName: 'w:tbl',
        harmlessExtra: 'must not affect plan hash',
      },
    ],
  });

  const baseResult = await port.handleDocxImportPreviewCommandSurface(toPayload(baseReport));
  const driftResult = await port.handleDocxImportPreviewCommandSurface(toPayload(driftReport));

  assert.equal(baseResult.ok, true);
  assert.equal(driftResult.ok, true);
  assert.equal(
    driftResult.docxImportPreviewPlan.previewHash,
    baseResult.docxImportPreviewPlan.previewHash,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(driftResult.docxImportPreviewPlan.diagnostics[0], 'harmlessExtra'),
    false,
  );
});

test('DOCX import preview command surface: helper failures and forbidden results fail closed', async () => {
  const unavailable = instantiateDocxImportPreviewPort({
    loadRevisionBridgeModule: async () => {
      throw new Error('bridge unavailable');
    },
  });
  const helperUnavailable = instantiateDocxImportPreviewPort({
    loadRevisionBridgeModule: async () => ({}),
  });
  const helperThrows = instantiateDocxImportPreviewPort({
    loadRevisionBridgeModule: async () => ({
      buildDocxImportPreviewPlanFromContentPreview: () => {
        throw new Error('preview crash');
      },
    }),
  });
  const invalidResult = instantiateDocxImportPreviewPort({
    loadRevisionBridgeModule: async () => ({
      buildDocxImportPreviewPlanFromContentPreview: () => null,
    }),
  });
  const forbiddenResult = instantiateDocxImportPreviewPort({
    loadRevisionBridgeModule: async () => ({
      buildDocxImportPreviewPlanFromContentPreview: () => ({
        ok: true,
        schemaVersion: 'revision-bridge.docx-import-preview.v1',
        type: 'docx.import.preview',
        status: 'preview',
        code: 'DOCX_IMPORT_PREVIEW_READY',
        reason: 'DOCX_IMPORT_PREVIEW_READY',
        decision: 'preview',
        writeEffects: false,
        path: 'secret.docx',
      }),
    }),
  });
  const writeEffectResult = instantiateDocxImportPreviewPort({
    loadRevisionBridgeModule: async () => ({
      buildDocxImportPreviewPlanFromContentPreview: () => ({
        ok: true,
        schemaVersion: 'revision-bridge.docx-import-preview.v1',
        type: 'docx.import.preview',
        status: 'preview',
        code: 'DOCX_IMPORT_PREVIEW_READY',
        reason: 'DOCX_IMPORT_PREVIEW_READY',
        decision: 'preview',
        writeEffects: true,
      }),
    }),
  });
  const mutateCandidateResult = instantiateDocxImportPreviewPort({
    loadRevisionBridgeModule: async () => ({
      buildDocxImportPreviewPlanFromContentPreview: () => ({
        ok: true,
        schemaVersion: 'revision-bridge.docx-import-preview.v1',
        type: 'docx.import.preview',
        status: 'preview',
        code: 'DOCX_IMPORT_PREVIEW_READY',
        reason: 'DOCX_IMPORT_PREVIEW_READY',
        decision: 'preview',
        writeEffects: false,
        candidateCreatePlan: {
          mode: 'mutate-existing',
        },
      }),
    }),
  });

  const unavailableResult = await unavailable.handleDocxImportPreviewCommandSurface(toPayload());
  const helperUnavailableResult = await helperUnavailable.handleDocxImportPreviewCommandSurface(toPayload());
  const helperThrowsResult = await helperThrows.handleDocxImportPreviewCommandSurface(toPayload());
  const invalidResultValue = await invalidResult.handleDocxImportPreviewCommandSurface(toPayload());
  const forbiddenResultValue = await forbiddenResult.handleDocxImportPreviewCommandSurface(toPayload());
  const writeEffectResultValue = await writeEffectResult.handleDocxImportPreviewCommandSurface(toPayload());
  const mutateCandidateResultValue = await mutateCandidateResult.handleDocxImportPreviewCommandSurface(toPayload());

  assert.equal(unavailableResult.ok, false);
  assert.equal(unavailableResult.error.code, 'E_DOCX_IMPORT_PREVIEW_UNAVAILABLE');
  assert.equal(unavailableResult.error.reason, 'DOCX_IMPORT_PREVIEW_BRIDGE_UNAVAILABLE');
  assert.equal(helperUnavailableResult.ok, false);
  assert.equal(helperUnavailableResult.error.code, 'E_DOCX_IMPORT_PREVIEW_UNAVAILABLE');
  assert.equal(helperUnavailableResult.error.reason, 'DOCX_IMPORT_PREVIEW_HELPER_UNAVAILABLE');
  assert.equal(helperThrowsResult.ok, false);
  assert.equal(helperThrowsResult.error.code, 'E_DOCX_IMPORT_PREVIEW_FAILED');
  assert.equal(helperThrowsResult.error.reason, 'DOCX_IMPORT_PREVIEW_EXECUTION_FAILED');
  assert.equal(invalidResultValue.ok, false);
  assert.equal(invalidResultValue.error.code, 'E_DOCX_IMPORT_PREVIEW_INVALID_RESULT');
  assert.equal(forbiddenResultValue.ok, false);
  assert.equal(forbiddenResultValue.error.code, 'E_DOCX_IMPORT_PREVIEW_FORBIDDEN_RESULT');
  assert.equal(forbiddenResultValue.error.details.key, 'path');
  assert.equal(writeEffectResultValue.ok, false);
  assert.equal(writeEffectResultValue.error.code, 'E_DOCX_IMPORT_PREVIEW_INVALID_RESULT');
  assert.equal(writeEffectResultValue.error.reason, 'DOCX_IMPORT_PREVIEW_WRITE_EFFECTS_INVALID');
  assert.equal(mutateCandidateResultValue.ok, false);
  assert.equal(mutateCandidateResultValue.error.code, 'E_DOCX_IMPORT_PREVIEW_INVALID_RESULT');
  assert.equal(mutateCandidateResultValue.error.reason, 'DOCX_IMPORT_PREVIEW_CANDIDATE_PLAN_MODE_INVALID');
});

test('DOCX import preview command surface: contour section stays out of UI storage apply export layers', () => {
  const section = extractMarkedSection(readMainSource(), SECTION_START, SECTION_END);
  const forbiddenRuntimeMarkers = [
    'fs.',
    'readFile',
    'writeFile',
    'writeFileAtomic',
    'writeBufferAtomic',
    'exactTextMinSafeWrite',
    'buildDocxMinBuffer',
    'runDocxMinExport',
    'applyMarkdownImportSafeCreate',
    'handleReviewSurfaceImportPacketCommandSurface',
    'activeReviewSessionStore =',
    'currentReviewSurfacePayload =',
    'ipcMain',
    'BrowserWindow',
    'dialog.',
    'fetch',
    'http',
    'https',
    'reviewPacket',
    'reviewSurface',
    'parsedReviewSurface',
    'activeReviewSession',
    'applyOps',
    'applyPlan',
    'canApply: true',
    'safeCreatePlan',
    'writeReceipt',
    'importReceipt',
    'exportReceipt',
    'bufferSource',
    'rawBytes',
    'filePath',
    'projectRoot',
  ];

  for (const marker of forbiddenRuntimeMarkers) {
    assert.equal(section.includes(marker), false, `${marker} must stay out of DOCX import preview command surface`);
  }
});
