const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MAIN_PATH = path.join(REPO_ROOT, 'src', 'main.js');
const SECTION_START = '// DOCX_IMPORT_SAFE_CREATE_COMMAND_SURFACE_START';
const SECTION_END = '// DOCX_IMPORT_SAFE_CREATE_COMMAND_SURFACE_END';

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

function instantiateDocxImportSafeCreatePort(options = {}) {
  const mainSource = readMainSource();
  const section = extractMarkedSection(mainSource, SECTION_START, SECTION_END);
  const calls = {
    helper: [],
    ensureProjectStructure: 0,
    resolveProjectBindingForFile: [],
    admission: [],
  };
  const sandbox = {
    calls,
    cloneJsonSafe,
    isPlainObjectValue,
    isDocxImportPreviewPlanAdmitted: typeof options.isDocxImportPreviewPlanAdmitted === 'function'
      ? (plan) => {
          calls.admission.push(cloneJsonSafe(plan));
          return options.isDocxImportPreviewPlanAdmitted(plan);
        }
      : (plan) => {
          calls.admission.push(cloneJsonSafe(plan));
          return true;
        },
    applyDocxImportSafeCreate: Object.prototype.hasOwnProperty.call(options, 'applyDocxImportSafeCreate')
      ? options.applyDocxImportSafeCreate
      : async (input, helperOptions) => {
          calls.helper.push({ input: cloneJsonSafe(input), options: cloneJsonSafe({
            projectRoot: helperOptions.projectRoot,
            romanRoot: helperOptions.romanRoot,
            projectId: helperOptions.projectId,
            operationLabel: helperOptions.operationLabel,
            hasQueueDiskOperation: typeof helperOptions.queueDiskOperation === 'function',
            hasWriteBatchAtomic: typeof helperOptions.writeBatchAtomic === 'function',
            hasTransactionAuthority: helperOptions.transactionAuthority !== null
              && typeof helperOptions.transactionAuthority === 'object',
          }) });
          return {
            ok: true,
            value: {
              created: true,
              createdSceneIds: ['docx-import-scene-1234abcd'],
              importOperationId: 'docx-import-op-teststub0001',
              receipt: {
                // GENERIC-01 (G8 amendment): receipt schema bumped to v2.
                schemaVersion: 'revision-bridge.docx-import-receipt.v2',
                type: 'docx.import.safeCreate.receipt',
                reason: 'DOCX_IMPORT_SAFE_CREATE_APPLIED',
                importOperationId: 'docx-import-op-teststub0001',
                projectId: helperOptions.projectId,
                sourceArtifactSha256: 'd'.repeat(64),
                candidateContentSha256: 'e'.repeat(64),
                batchId: 'flow-batch-test',
                sourcePreviewHash: input.docxImportPreviewPlan.previewHash,
                inputHash: 'a'.repeat(64),
                outputHash: 'b'.repeat(64),
                createdSceneIds: ['docx-import-scene-1234abcd'],
                createdScenes: [
                  {
                    sceneId: 'docx-import-scene-1234abcd',
                    kind: 'scene',
                    bytesWritten: 5,
                    outputHash: 'c'.repeat(64),
                    treeNodeId: 'yalken.scene.tree.stubtree0001',
                    treeId: 'yalken.scene.tree.root.stubroot01',
                  },
                ],
                sceneTreeIdentities: [
                  {
                    sceneId: 'docx-import-scene-1234abcd',
                    treeNodeId: 'yalken.scene.tree.stubtree0001',
                    treeId: 'yalken.scene.tree.root.stubroot01',
                  },
                ],
                lossReport: {
                  schemaVersion: 'revision-bridge.docx-import-preview.loss-report.v1',
                  mode: 'plain-text-only',
                  itemCount: 1,
                  items: [
                    {
                      code: 'DOCX_IMPORT_PREVIEW_PLAIN_TEXT_ONLY',
                      severity: 'info',
                      category: 'formatting',
                      message: 'DOCX import preview candidate is limited to plain text scene content',
                    },
                  ],
                },
                lossReportSummary: {
                  schemaVersion: 'revision-bridge.docx-import-preview.loss-report.v1',
                  mode: 'plain-text-only',
                  itemCount: 1,
                },
                manifestAuthority: {
                  revision: 'stubrev01',
                  algorithmic: true,
                  algorithmicHash: 'f'.repeat(64),
                  durablePublication: false,
                },
                carrierIgnored: null,
                transactionEvidence: {
                  lease: { algorithmic: true },
                  manifestHash: 'f'.repeat(64),
                  batchManifestHash: '1'.repeat(64),
                },
                atomicEvidence: {
                  sceneCount: 1,
                  markerCleared: true,
                },
                createdAt: '2026-01-01T00:00:00.000Z',
              },
            },
          };
        },
    ensureProjectStructure: async () => {
      calls.ensureProjectStructure += 1;
    },
    getProjectSectionPath: () => '/trusted/project/roman',
    getProjectRootPath: () => '/trusted/project',
    resolveProjectBindingForFile: async (targetPath) => {
      calls.resolveProjectBindingForFile.push(targetPath);
      return { projectId: 'trusted-project-id' };
    },
    queueDiskOperation: async (operation) => operation(),
    writeFlowSceneBatchAtomic: async () => ({ ok: true }),
    module: { exports: {} },
    exports: {},
  };
  vm.runInNewContext(
    `${section}
module.exports = {
  calls,
  DOCX_IMPORT_SAFE_CREATE_COMMAND_ID,
  validateDocxImportSafeCreatePayload,
  handleDocxImportSafeCreateCommandSurface,
};`,
    sandbox,
    { filename: MAIN_PATH },
  );
  return sandbox.module.exports;
}

function validPreviewPlan(overrides = {}) {
  return {
    ok: true,
    schemaVersion: 'revision-bridge.docx-import-preview.v1',
    type: 'docx.import.preview',
    status: 'preview',
    code: 'DOCX_IMPORT_PREVIEW_READY',
    reason: 'DOCX_IMPORT_PREVIEW_READY',
    decision: 'preview',
    writeEffects: false,
    previewHash: '1234abcd',
    candidateCreatePlan: {
      mode: 'create-only',
      sceneStrategy: 'single-scene',
      entryCount: 1,
      entries: [
        {
          sceneId: 'docx-import-scene-1234abcd',
          kind: 'scene',
          content: 'Alpha',
          contentTextHash: '11111111',
          source: {
            schemaVersion: 'revision-bridge.docx-content-preview.v1',
            type: 'docxContentPreviewReport',
            sourcePart: 'word/document.xml',
            paragraphRange: { start: 0, end: 0 },
            paragraphCount: 1,
            textHash: '22222222',
          },
        },
      ],
    },
    lossReport: {
      schemaVersion: 'revision-bridge.docx-import-preview.loss-report.v1',
      mode: 'plain-text-only',
      itemCount: 1,
      items: [
        {
          code: 'DOCX_IMPORT_PREVIEW_PLAIN_TEXT_ONLY',
          severity: 'info',
          category: 'formatting',
          message: 'plain text only',
        },
      ],
    },
    ...overrides,
  };
}

function payload(overrides = {}) {
  return {
    requestId: 'request-1',
    docxImportPreviewPlan: validPreviewPlan(),
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

test('DOCX import safe create command surface: command id is bridge-allowlisted and handler-owned', () => {
  const source = readMainSource();

  assert.match(
    source,
    /UI_COMMAND_BRIDGE_ALLOWED_COMMAND_IDS\s*=\s*new Set\(\[[\s\S]*'cmd\.project\.docx\.importSafeCreate'/,
  );
  assert.match(
    source,
    /'cmd\.project\.docx\.importSafeCreate':\s*async\s*\(payload\s*=\s*\{\}\)\s*=>\s*\{\s*return handleDocxImportSafeCreateCommandSurface\(payload\);/,
  );
});

test('DOCX import safe create command surface: clean plan delegates with trusted context only', async () => {
  const port = instantiateDocxImportSafeCreatePort();
  const result = await port.handleDocxImportSafeCreateCommandSurface(payload());

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.requestId, 'request-1');
  assert.equal(result.commandId, 'cmd.project.docx.importSafeCreate');
  assert.equal(result.commandOk, true);
  assert.equal(result.safeCreateOk, true);
  assert.equal(result.created, true);
  assert.deepEqual(result.createdSceneIds, ['docx-import-scene-1234abcd']);
  assert.equal(port.calls.admission.length, 1);
  assert.equal(port.calls.admission[0].previewHash, payload().docxImportPreviewPlan.previewHash);
  assert.equal(result.receipt.projectId, 'trusted-project-id');
  assert.equal(port.calls.ensureProjectStructure, 1);
  assert.deepEqual(port.calls.resolveProjectBindingForFile, ['/trusted/project/roman']);
  assert.equal(port.calls.helper.length, 1);
  assert.deepEqual(Object.keys(port.calls.helper[0].input), ['docxImportPreviewPlan']);
  assert.equal(port.calls.helper[0].options.projectRoot, '/trusted/project');
  assert.equal(port.calls.helper[0].options.romanRoot, '/trusted/project/roman');
  assert.equal(port.calls.helper[0].options.operationLabel, 'safe create DOCX import scene batch');
  assert.equal(port.calls.helper[0].options.hasQueueDiskOperation, true);
  assert.equal(port.calls.helper[0].options.hasWriteBatchAtomic, true);

  const resultKeys = collectKeys(result);
  for (const forbidden of ['path', 'filePath', 'projectRoot', 'rawBytes', 'bufferSource', 'writeReceipt', 'importReceipt', 'exportReceipt']) {
    assert.equal(resultKeys.some((key) => key === forbidden || key.endsWith(`.${forbidden}`)), false, forbidden);
  }
});

test('DOCX import safe create command surface: payload fields and authority leaks fail before helper', async () => {
  const port = instantiateDocxImportSafeCreatePort();
  const unsupported = await port.handleDocxImportSafeCreateCommandSurface(payload({ projectRoot: '/tmp/project' }));
  const wrongSchema = await port.handleDocxImportSafeCreateCommandSurface(payload({
    docxImportPreviewPlan: validPreviewPlan({ schemaVersion: 'wrong' }),
  }));
  const nestedForbidden = await port.handleDocxImportSafeCreateCommandSurface(payload({
    docxImportPreviewPlan: {
      ...validPreviewPlan(),
      source: {
        projectRoot: '/tmp/project',
      },
    },
  }));
  const rawBytes = await port.handleDocxImportSafeCreateCommandSurface(payload({
    docxImportPreviewPlan: {
      ...validPreviewPlan(),
      rawBytes: 'base64',
    },
  }));

  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.error.reason, 'DOCX_IMPORT_SAFE_CREATE_PAYLOAD_UNSUPPORTED_FIELDS');
  assert.equal(wrongSchema.ok, false);
  assert.equal(wrongSchema.error.reason, 'DOCX_IMPORT_SAFE_CREATE_PREVIEW_PLAN_SCHEMA_INVALID');
  assert.equal(nestedForbidden.ok, false);
  assert.equal(nestedForbidden.error.reason, 'DOCX_IMPORT_SAFE_CREATE_PAYLOAD_FORBIDDEN_FIELD');
  assert.equal(nestedForbidden.error.details.key, 'docxImportPreviewPlan.source.projectRoot');
  assert.equal(rawBytes.ok, false);
  assert.equal(rawBytes.error.reason, 'DOCX_IMPORT_SAFE_CREATE_PAYLOAD_FORBIDDEN_FIELD');
  assert.equal(rawBytes.error.details.key, 'docxImportPreviewPlan.rawBytes');
  assert.equal(port.calls.helper.length, 0);
});

test('DOCX import safe create command surface: unadmitted preview fails before helper and project context', async () => {
  const port = instantiateDocxImportSafeCreatePort({
    isDocxImportPreviewPlanAdmitted: () => false,
  });

  const result = await port.handleDocxImportSafeCreateCommandSurface(payload());

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'E_DOCX_IMPORT_SAFE_CREATE_PREVIEW_NOT_ADMITTED');
  assert.equal(result.error.reason, 'DOCX_IMPORT_SAFE_CREATE_PREVIEW_NOT_ADMITTED');
  assert.equal(port.calls.admission.length, 1);
  assert.equal(port.calls.helper.length, 0);
  assert.equal(port.calls.ensureProjectStructure, 0);
  assert.equal(port.calls.resolveProjectBindingForFile.length, 0);
});

test('DOCX import safe create command surface: helper unavailable, helper failure, and forbidden result fail closed', async () => {
  const unavailable = instantiateDocxImportSafeCreatePort({
    applyDocxImportSafeCreate: undefined,
  });
  const helperFails = instantiateDocxImportSafeCreatePort({
    applyDocxImportSafeCreate: async () => ({
      ok: false,
      error: {
        code: 'DOCX_SAFE_CREATE_PREVIEW_TAMPERED',
        reason: 'docx_import_safe_create_preview_hash_mismatch',
        details: {
          field: 'previewHash',
          markerPath: '/private/tmp/project/.flow-batch/secret.json',
          staleMarkers: ['/private/tmp/project/.flow-batch/stale.json'],
          batchId: 'flow-batch-command',
          messageCode: 'FLOW_BATCH_FAILED /private/tmp/project/.flow-batch/secret.json',
        },
      },
    }),
  });
  const helperThrows = instantiateDocxImportSafeCreatePort({
    applyDocxImportSafeCreate: async () => {
      throw new Error('write crashed');
    },
  });
  const forbiddenResult = instantiateDocxImportSafeCreatePort({
    applyDocxImportSafeCreate: async () => ({
      ok: true,
      value: {
        created: true,
        createdSceneIds: ['docx-import-scene-1234abcd'],
        receipt: {
          schemaVersion: 'revision-bridge.docx-import-safe-create-receipt.v1',
          path: '/tmp/leak.txt',
          createdSceneIds: ['docx-import-scene-1234abcd'],
        },
      },
    }),
  });

  const unavailableResult = await unavailable.handleDocxImportSafeCreateCommandSurface(payload());
  const helperFailResult = await helperFails.handleDocxImportSafeCreateCommandSurface(payload());
  const helperThrowResult = await helperThrows.handleDocxImportSafeCreateCommandSurface(payload());
  const forbiddenResultValue = await forbiddenResult.handleDocxImportSafeCreateCommandSurface(payload());

  assert.equal(unavailableResult.ok, false);
  assert.equal(unavailableResult.error.code, 'E_DOCX_IMPORT_SAFE_CREATE_UNAVAILABLE');
  assert.equal(unavailableResult.error.reason, 'DOCX_IMPORT_SAFE_CREATE_HELPER_UNAVAILABLE');
  assert.equal(helperFailResult.ok, false);
  assert.equal(helperFailResult.error.code, 'DOCX_SAFE_CREATE_PREVIEW_TAMPERED');
  assert.equal(helperFailResult.error.reason, 'docx_import_safe_create_preview_hash_mismatch');
  assert.equal(helperFailResult.error.details.field, 'previewHash');
  assert.equal(helperFailResult.error.details.batchId, 'flow-batch-command');
  assert.equal(helperFailResult.error.details.staleMarkerCount, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(helperFailResult.error.details, 'messageCode'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(helperFailResult.error.details, 'markerPath'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(helperFailResult.error.details, 'staleMarkers'), false);
  assert.equal(helperThrowResult.ok, false);
  assert.equal(helperThrowResult.error.code, 'E_DOCX_IMPORT_SAFE_CREATE_FAILED');
  assert.equal(helperThrowResult.error.reason, 'DOCX_IMPORT_SAFE_CREATE_EXECUTION_FAILED');
  assert.equal(forbiddenResultValue.ok, false);
  assert.equal(forbiddenResultValue.error.code, 'E_DOCX_IMPORT_SAFE_CREATE_INVALID_RESULT');
  assert.equal(forbiddenResultValue.error.reason, 'DOCX_IMPORT_SAFE_CREATE_FORBIDDEN_RESULT');
  assert.equal(forbiddenResultValue.error.details.key, 'receipt.path');
});

test('DOCX import safe create command surface: contour section does not reparse DOCX or touch UI/export layers', () => {
  const section = extractMarkedSection(readMainSource(), SECTION_START, SECTION_END);
  const forbiddenRuntimeMarkers = [
    'buildDocxImportPreviewPlanFromContentPreview',
    'buildDocxContentPreviewReportFromBufferSource',
    'buildDocxMinBuffer',
    'runDocxMinExport',
    'applyMarkdownImportSafeCreate',
    'handleDocxImportPreviewCommandSurface',
    'handleReviewSurfaceImportPacketCommandSurface',
    'BrowserWindow',
    'dialog.',
    'ipcMain',
    'fetch',
    'http',
    'https',
    'DOMParser',
    'XMLParser',
  ];

  for (const marker of forbiddenRuntimeMarkers) {
    assert.equal(section.includes(marker), false, `${marker} must stay out of DOCX safe-create command surface`);
  }
});
