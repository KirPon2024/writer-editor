const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { deflateRawSync } = require('node:zlib');
const { pathToFileURL } = require('node:url');

const {
  applyDocxImportSafeCreate,
  isDocxImportPreviewPlanAdmitted,
  rememberDocxImportPreviewPlanAdmission,
} = require('../../src/utils/docxImportSafeCreate');
const { writeFlowSceneBatchAtomic } = require('../../src/utils/flowSceneBatchAtomic');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MAIN_PATH = path.join(REPO_ROOT, 'src', 'main.js');
const BRIDGE_MODULE_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'index.mjs');

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

function instantiateMainSection(startMarker, endMarker, exportSource, sandbox) {
  const section = extractMarkedSection(readMainSource(), startMarker, endMarker);
  vm.runInNewContext(
    `${section}
module.exports = {
${exportSource}
};`,
    sandbox,
    { filename: MAIN_PATH },
  );
  return sandbox.module.exports;
}

function instantiateDocxIntakeGatePort() {
  return instantiateMainSection(
    '// DOCX_INTAKE_GATE_COMMAND_SURFACE_START',
    '// DOCX_INTAKE_GATE_COMMAND_SURFACE_END',
    `
  DOCX_INTAKE_GATE_COMMAND_ID,
  handleDocxIntakeGateCommandSurface,
`,
    {
      activeReviewSessionStore: null,
      activeReviewSessionLifecycle: 'passive',
      currentReviewSurfacePayload: {},
      currentReviewSurfacePayloadSource: 'none',
      currentReviewSurfacePayloadContentHash: '',
      Buffer,
      cloneJsonSafe,
      isPlainObjectValue,
      loadRevisionBridgeModule: loadBridge,
      module: { exports: {} },
      exports: {},
    },
  );
}

function instantiateDocxContentPreviewPort() {
  return instantiateMainSection(
    '// DOCX_CONTENT_PREVIEW_COMMAND_SURFACE_START',
    '// DOCX_CONTENT_PREVIEW_COMMAND_SURFACE_END',
    `
  DOCX_CONTENT_PREVIEW_COMMAND_ID,
  handleDocxContentPreviewCommandSurface,
`,
    {
      Buffer,
      cloneJsonSafe,
      isPlainObjectValue,
      loadRevisionBridgeModule: loadBridge,
      module: { exports: {} },
      exports: {},
    },
  );
}

function instantiateDocxImportPreviewPort(options = {}) {
  const calls = {
    rememberAdmission: [],
  };
  return instantiateMainSection(
    '// DOCX_IMPORT_PREVIEW_COMMAND_SURFACE_START',
    '// DOCX_IMPORT_PREVIEW_COMMAND_SURFACE_END',
    `
  calls,
  DOCX_IMPORT_PREVIEW_COMMAND_ID,
  handleDocxImportPreviewCommandSurface,
`,
    {
      calls,
      cloneJsonSafe,
      isPlainObjectValue,
      loadRevisionBridgeModule: loadBridge,
      rememberDocxImportPreviewPlanAdmission: typeof options.rememberAdmission === 'function'
        ? options.rememberAdmission
        : (plan) => {
            calls.rememberAdmission.push(cloneJsonSafe(plan));
            return rememberDocxImportPreviewPlanAdmission(plan);
          },
      module: { exports: {} },
      exports: {},
    },
  );
}

function instantiateDocxSafeCreatePort(options = {}) {
  const projectRoot = options.projectRoot;
  const romanRoot = options.romanRoot || path.join(projectRoot, 'roman');
  const calls = {
    ensureProjectStructure: 0,
    resolveProjectBindingForFile: [],
    queueDiskOperation: [],
  };

  return instantiateMainSection(
    '// DOCX_IMPORT_SAFE_CREATE_COMMAND_SURFACE_START',
    '// DOCX_IMPORT_SAFE_CREATE_COMMAND_SURFACE_END',
    `
  calls,
  DOCX_IMPORT_SAFE_CREATE_COMMAND_ID,
  handleDocxImportSafeCreateCommandSurface,
`,
    {
      calls,
      cloneJsonSafe,
      isPlainObjectValue,
      isDocxImportPreviewPlanAdmitted,
      applyDocxImportSafeCreate,
      ensureProjectStructure: async () => {
        calls.ensureProjectStructure += 1;
        fs.mkdirSync(romanRoot, { recursive: true });
      },
      getProjectSectionPath: (sectionName) => (
        sectionName === 'roman' ? romanRoot : path.join(projectRoot, sectionName)
      ),
      getProjectRootPath: () => projectRoot,
      resolveProjectBindingForFile: async (targetPath) => {
        calls.resolveProjectBindingForFile.push(targetPath);
        return { projectId: 'docx-e2e-project' };
      },
      queueDiskOperation: async (operation, operationLabel) => {
        calls.queueDiskOperation.push(operationLabel);
        return operation();
      },
      writeFlowSceneBatchAtomic,
      module: { exports: {} },
      exports: {},
    },
  );
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

function cleanDocxZip(paragraphs = ['Alpha', 'Bravo']) {
  return zipFixture([
    {
      name: 'word/document.xml',
      method: 8,
      body: documentXml(paragraphs.map(paragraphXml).join('')),
    },
  ]);
}

function hostileDuplicateDocxZip() {
  return zipFixture([
    { name: 'word/document.xml', body: documentXml(paragraphXml('A')) },
    { name: 'WORD/DOCUMENT.XML', body: documentXml(paragraphXml('B')) },
  ]);
}

function toBufferPayload(bytes, requestId = 'request-1') {
  return {
    requestId,
    bufferSource: Buffer.from(bytes).toString('base64'),
  };
}

function makeProjectRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
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

function assertNoPublicAuthorityLeak(value) {
  const keys = collectKeys(value);
  for (const forbidden of [
    'path',
    'filePath',
    'projectRoot',
    'rawBytes',
    'bufferSource',
    'zip',
    'storage',
    'writeReceipt',
    'importReceipt',
    'exportReceipt',
  ]) {
    assert.equal(
      keys.some((key) => key === forbidden || key.endsWith(`.${forbidden}`)),
      false,
      forbidden,
    );
  }
}

function assertDocxCommandBridgeWiring() {
  const source = readMainSource();
  const wiring = [
    {
      commandId: 'cmd.project.review.inspectDocxIntakeGate',
      handler: 'handleDocxIntakeGateCommandSurface',
    },
    {
      commandId: 'cmd.project.docx.previewContent',
      handler: 'handleDocxContentPreviewCommandSurface',
    },
    {
      commandId: 'cmd.project.docx.previewImportPlan',
      handler: 'handleDocxImportPreviewCommandSurface',
    },
    {
      commandId: 'cmd.project.docx.importSafeCreate',
      handler: 'handleDocxImportSafeCreateCommandSurface',
    },
  ];

  for (const item of wiring) {
    assert.match(
      source,
      new RegExp(`UI_COMMAND_BRIDGE_ALLOWED_COMMAND_IDS\\s*=\\s*new Set\\(\\[[\\s\\S]*'${item.commandId.replace(/\./gu, '\\.')}'`, 'u'),
      item.commandId,
    );
    assert.match(
      source,
      new RegExp(`'${item.commandId.replace(/\./gu, '\\.')}':\\s*async\\s*\\(payload\\s*=\\s*\\{\\}\\)\\s*=>\\s*\\{\\s*return ${item.handler}\\(payload\\);`, 'u'),
      item.handler,
    );
  }
}

function readOnlyCreatedScene(romanRoot) {
  const importedRoot = path.join(romanRoot, 'Imported');
  const names = fs.readdirSync(importedRoot).filter((name) => name.endsWith('.txt')).sort();
  assert.equal(names.length, 1);
  return fs.readFileSync(path.join(importedRoot, names[0]), 'utf8');
}

async function runDocxImportCommandChain(bytes, options = {}) {
  const projectRoot = options.projectRoot || makeProjectRoot('docx-import-e2e-command-chain-');
  const romanRoot = path.join(projectRoot, 'roman');
  const intakePort = instantiateDocxIntakeGatePort();
  const contentPort = instantiateDocxContentPreviewPort();
  const importPreviewPort = instantiateDocxImportPreviewPort(options.importPreviewOptions || {});
  const safeCreatePort = instantiateDocxSafeCreatePort({ projectRoot, romanRoot });
  const bufferPayload = toBufferPayload(bytes);

  const intake = await intakePort.handleDocxIntakeGateCommandSurface(bufferPayload);
  const content = await contentPort.handleDocxContentPreviewCommandSurface(bufferPayload);
  const preview = await importPreviewPort.handleDocxImportPreviewCommandSurface({
    requestId: 'request-1',
    docxContentPreviewReport: content.docxContentPreviewReport,
  });
  const safeCreate = await safeCreatePort.handleDocxImportSafeCreateCommandSurface({
    requestId: 'request-1',
    docxImportPreviewPlan: preview.docxImportPreviewPlan,
  });

  return {
    projectRoot,
    romanRoot,
    ports: {
      importPreview: importPreviewPort,
      safeCreate: safeCreatePort,
    },
    intake,
    content,
    preview,
    safeCreate,
  };
}

test('DOCX import e2e command chain: command ids remain live-dispatch wired', () => {
  assertDocxCommandBridgeWiring();
});

test('DOCX import e2e command chain: clean DOCX creates one local scene with pathless receipt', async () => {
  const result = await runDocxImportCommandChain(cleanDocxZip(['Alpha', 'Bravo']));

  assert.equal(result.intake.ok, true);
  assert.equal(result.intake.gatePass, true);
  assert.equal(result.content.ok, true);
  assert.equal(result.content.previewOk, true);
  assert.equal(result.preview.ok, true);
  assert.equal(result.preview.importPreviewOk, true);
  assert.equal(result.preview.docxImportPreviewPlan.writeEffects, false);
  assert.equal(result.ports.importPreview.calls.rememberAdmission.length, 1);

  assert.equal(result.safeCreate.ok, true, JSON.stringify(result.safeCreate, null, 2));
  assert.equal(result.safeCreate.commandOk, true);
  assert.equal(result.safeCreate.safeCreateOk, true);
  assert.equal(result.safeCreate.created, true);
  assert.deepEqual(result.safeCreate.createdSceneIds, [
    result.preview.docxImportPreviewPlan.candidateCreatePlan.entries[0].sceneId,
  ]);
  assert.equal(readOnlyCreatedScene(result.romanRoot), 'Alpha\n\nBravo');
  assert.deepEqual(fs.readdirSync(path.join(result.projectRoot, '.flow-batch')), []);
  assert.equal(result.safeCreate.receipt.atomicEvidence.sceneCount, 1);
  assert.equal(result.safeCreate.receipt.atomicEvidence.markerCleared, true);
  assert.equal(result.safeCreate.receipt.projectId, 'docx-e2e-project');
  assert.equal(result.ports.safeCreate.calls.ensureProjectStructure, 1);
  assert.deepEqual(result.ports.safeCreate.calls.resolveProjectBindingForFile, [result.romanRoot]);
  assert.deepEqual(result.ports.safeCreate.calls.queueDiskOperation, ['safe create DOCX import scene batch']);
  assertNoPublicAuthorityLeak(result.intake);
  assertNoPublicAuthorityLeak(result.content);
  assertNoPublicAuthorityLeak(result.preview);
  assertNoPublicAuthorityLeak(result.safeCreate);
});

test('DOCX import e2e command chain: safe create rejects preview that command did not admit', async () => {
  const result = await runDocxImportCommandChain(cleanDocxZip([`Unadmitted ${Date.now()}`]), {
    importPreviewOptions: {
      rememberAdmission: () => '',
    },
  });

  assert.equal(result.intake.gatePass, true);
  assert.equal(result.content.previewOk, true);
  assert.equal(result.preview.importPreviewOk, true);
  assert.equal(result.safeCreate.ok, false);
  assert.equal(result.safeCreate.error.code, 'E_DOCX_IMPORT_SAFE_CREATE_PREVIEW_NOT_ADMITTED');
  assert.equal(result.safeCreate.error.reason, 'DOCX_IMPORT_SAFE_CREATE_PREVIEW_NOT_ADMITTED');
  assert.equal(result.ports.safeCreate.calls.ensureProjectStructure, 0);
  assert.equal(fs.existsSync(path.join(result.romanRoot, 'Imported')), false);
});

test('DOCX import e2e command chain: blocked intake never becomes storage mutation', async () => {
  const result = await runDocxImportCommandChain(hostileDuplicateDocxZip());

  assert.equal(result.intake.ok, true);
  assert.equal(result.intake.gatePass, false);
  assert.equal(result.content.ok, true);
  assert.equal(result.content.previewOk, false);
  assert.equal(result.preview.ok, true);
  assert.equal(result.preview.importPreviewOk, false);
  assert.equal(result.preview.docxImportPreviewPlan.candidateCreatePlan, null);
  assert.equal(result.safeCreate.ok, false);
  assert.equal(result.safeCreate.error.code, 'E_DOCX_IMPORT_SAFE_CREATE_PREVIEW_NOT_ADMITTED');
  assert.equal(result.ports.safeCreate.calls.ensureProjectStructure, 0);
  assert.equal(fs.existsSync(path.join(result.projectRoot, '.flow-batch')), false);
  assert.equal(fs.existsSync(path.join(result.romanRoot, 'Imported')), false);
  assertNoPublicAuthorityLeak(result.intake);
  assertNoPublicAuthorityLeak(result.content);
  assertNoPublicAuthorityLeak(result.preview);
  assertNoPublicAuthorityLeak(result.safeCreate);
});

test('DOCX import e2e command chain: tamper fails closed and duplicate apply returns idempotent receipt without public leaks', async () => {
  const first = await runDocxImportCommandChain(cleanDocxZip([`Once ${Date.now()}`]));
  assert.equal(first.safeCreate.ok, true, JSON.stringify(first.safeCreate, null, 2));
  const originalText = readOnlyCreatedScene(first.romanRoot);
  const firstOperationId = first.safeCreate.receipt.importOperationId;

  // GENERIC-01 (G2 amendment): duplicate = same idempotent receipt (zero new
  // writes), not a blocking error. Re-applying the same admitted plan returns
  // the original receipt with the same importOperationId and performs no new
  // storage writes.
  const duplicate = await first.ports.safeCreate.handleDocxImportSafeCreateCommandSurface({
    requestId: 'request-2',
    docxImportPreviewPlan: first.preview.docxImportPreviewPlan,
  });
  assert.equal(duplicate.ok, true, JSON.stringify(duplicate, null, 2));
  assert.equal(duplicate.safeCreateOk, true);
  assert.equal(duplicate.created, false, 'duplicate must not create a new scene');
  assert.equal(duplicate.receipt.importOperationId, firstOperationId);
  assert.equal(readOnlyCreatedScene(first.romanRoot), originalText);
  assertNoPublicAuthorityLeak(duplicate);

  const tamperedPlan = cloneJsonSafe(first.preview.docxImportPreviewPlan);
  tamperedPlan.previewHash = '00000000';
  rememberDocxImportPreviewPlanAdmission(tamperedPlan);
  const tampered = await first.ports.safeCreate.handleDocxImportSafeCreateCommandSurface({
    requestId: 'request-3',
    docxImportPreviewPlan: tamperedPlan,
  });
  assert.equal(tampered.ok, false);
  assert.equal(tampered.error.code, 'DOCX_SAFE_CREATE_PREVIEW_TAMPERED');
  assert.equal(readOnlyCreatedScene(first.romanRoot), originalText);
  assertNoPublicAuthorityLeak(tampered);
});
