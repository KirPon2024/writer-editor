const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function functionSection(source, functionName, nextFunctionName) {
  const start = source.indexOf(`function ${functionName}`);
  const asyncStart = source.indexOf(`async function ${functionName}`);
  const actualStart = start >= 0 ? start : asyncStart;
  assert.notEqual(actualStart, -1, `${functionName} must exist`);
  const next = nextFunctionName
    ? Math.max(source.indexOf(`function ${nextFunctionName}`, actualStart + 1), source.indexOf(`async function ${nextFunctionName}`, actualStart + 1))
    : -1;
  return source.slice(actualStart, next > actualStart ? next : source.length);
}

test('project tree public read model serializes stable IDs without file authority', () => {
  const main = read('src/main.js');
  const section = functionSection(main, 'serializeProjectTreeNode', 'buildProjectTreeRootsWithIdentities');

  assert.match(section, /id: nodeId/u);
  assert.match(section, /nodeId/u);
  assert.equal(/\bpath\s*:/u.test(section), false);
  assert.equal(/effectivePath/u.test(section), false);
  assert.match(main, /root: serializeProjectTreeNode\(roots\[tab\]\)/u);
});

test('project tree renderer emits project and node identity only for tree commands', () => {
  const editor = read('src/renderer/editor.js');
  const functionNames = [
    ['openDocumentNode', 'handleCreateNode'],
    ['handleCreateNode', 'handleRenameNode'],
    ['handleRenameNode', 'handleDeleteNode'],
    ['handleDeleteNode', 'handleMoveNode'],
    ['handleMoveNode', 'handleReorderNode'],
  ];

  for (const [name, next] of functionNames) {
    const section = functionSection(editor, name, next);
    assert.match(section, /projectId: currentProjectId/u);
    assert.match(section, /nodeId|parentNodeId/u);
    assert.equal(/\bpath\s*:/u.test(section), false, `${name} must not emit a path`);
  }
  assert.match(editor, /currentDocumentId/u);
  assert.match(editor, /hasDocumentId/u);
  assert.match(editor, /currentDocumentId === effectiveDocumentId/u);
  const reorderSection = functionSection(editor, 'handleReorderNode', 'handleAddCardForNode');
  assert.match(reorderSection, /await handleMoveNode\(node, targetParentNodeId, targetIndex\)/u);
  assert.equal(/\bpath\s*:/u.test(reorderSection), false, 'handleReorderNode must not emit a path');
});

test('main owns node resolution and tree command results stay pathless', () => {
  const main = read('src/main.js');
  const openSection = functionSection(main, 'handleUiOpenDocumentCommand', 'normalizeLegacyUiBridgePayload');
  const renameSection = functionSection(main, 'handleUiRenameNodeCommand', 'handleUiDeleteNodeCommand');

  assert.match(openSection, /resolveProjectTreeNodeIdentity/u);
  assert.match(openSection, /resolveProjectTreeSceneIdentity/u);
  assert.match(openSection, /return \{ ok: true, documentId: resolvedNode\.nodeId \}/u);
  assert.equal(/sanitizePayloadWithinProjectRoot\(payload, \['path'\]\)/u.test(openSection), false);
  assert.match(renameSection, /resolveProjectTreeNodeIdentity/u);
  assert.match(renameSection, /return \{ ok: true, nodeId: resolvedNode\.nodeId \}/u);
});

test('main document open scene-id fallback is project-relative roman txt only', () => {
  const main = read('src/main.js');
  const normalizeSection = functionSection(main, 'normalizeProjectRelativeSceneId', 'resolveProjectTreeSceneIdentity');
  const resolverSection = functionSection(main, 'resolveProjectTreeSceneIdentity', 'getProjectDocumentIdentityPayload');

  assert.ok(normalizeSection.includes(".replace(/\\\\/g, '/')"));
  assert.match(normalizeSection, /normalized\.startsWith\('roman\/'\)/u);
  assert.match(normalizeSection, /normalized\.toLowerCase\(\)\.endsWith\('\.txt'\)/u);
  assert.match(normalizeSection, /segment === '\.\.'/u);
  assert.match(normalizeSection, /segment\.startsWith\('\.'\)/u);
  assert.match(resolverSection, /joinPathSegmentsWithinRoot\(projectRoot, normalizedSceneId\.split\('\/'\)/u);
  assert.match(resolverSection, /sanitizePathFieldsWithinRoot/u);
  assert.match(resolverSection, /upsertProjectTreeIdentityForPath\(pathGuard\.payload\.path, 'scene'\)/u);
  assert.equal(/\bsafePayload\.path\b/u.test(resolverSection), false);
});

test('active document channel exposes document identity without renderer path authority', () => {
  const main = read('src/main.js');
  const editor = read('src/renderer/editor.js');
  const sendSection = functionSection(main, 'sendEditorText', 'attachProjectIdToEditorPayload');
  const attachSection = functionSection(main, 'attachProjectIdToEditorPayload', 'sendEditorFontSize');
  const listenerStart = editor.indexOf('window.electronAPI.onEditorSetText((payload) => {');
  const listenerEnd = editor.indexOf('window.electronAPI.onEditorTextRequest', listenerStart);
  const listenerSection = editor.slice(listenerStart, listenerEnd);

  assert.match(sendSection, /documentId: typeof payload\.documentId/u);
  assert.equal(/path: typeof payload\.path/u.test(sendSection), false);
  assert.match(attachSection, /privateFilePath/u);
  assert.match(attachSection, /documentId: typeof source\.documentId/u);
  assert.equal(/path: typeof source\.path/u.test(attachSection), false);
  assert.notEqual(listenerStart, -1);
  assert.ok(listenerEnd > listenerStart);
  assert.match(listenerSection, /hasDocumentId/u);
  assert.equal(/hasPath|currentDocumentPath/u.test(listenerSection), false);
  assert.equal(/currentDocumentPath/u.test(editor), false);
});
