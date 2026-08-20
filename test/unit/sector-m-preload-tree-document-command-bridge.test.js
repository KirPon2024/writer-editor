const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..', '..')

function read(filePath) {
  return fs.readFileSync(path.join(ROOT, filePath), 'utf8')
}

function assertCommandBridgePath(source, commandEffectSource, commandId, payloadMarker) {
  assert.ok(source.includes(`invokeBridgeOnlyCommand(\n          electronAPI,\n          EXTRA_COMMAND_IDS.${commandId},\n          ${payloadMarker},\n        );`))
  assert.ok(commandEffectSource.includes("if (effectType === 'electron-bridge-only') {"))
  assert.ok(commandEffectSource.includes('kind: \'electron-bridge\','))
  assert.ok(commandEffectSource.includes('route: COMMAND_BRIDGE_ROUTE,'))
  assert.ok(commandEffectSource.includes('return electronAPI.invokeUiCommandBridge({'))
  assert.ok(commandEffectSource.includes('route: plan.route,'))
  assert.ok(commandEffectSource.includes('commandId: plan.commandId,'))
  assert.ok(commandEffectSource.includes('payload: plan.payload,'))
}

test('preload tree document bridge: projectCommands routes six tree and document commands through invokeUiCommandBridge', () => {
  const source = read('src/renderer/commands/projectCommands.mjs')
  const commandEffectSource = read('src/renderer/commands/commandEffectModel.mjs')

  assert.ok(source.includes('invokeBridgeOnlyCommand('))
  assert.ok(commandEffectSource.includes("const COMMAND_BRIDGE_ROUTE = 'command.bus';"))

  assert.equal(source.includes('electronAPI.openDocument('), false)
  assert.equal(source.includes('electronAPI.createNode('), false)
  assert.equal(source.includes('electronAPI.renameNode('), false)
  assert.equal(source.includes('electronAPI.deleteNode('), false)
  assert.equal(source.includes('electronAPI.reorderNode('), false)
  assert.equal(source.includes('electronAPI.moveNode('), false)

  assertCommandBridgePath(source, commandEffectSource, 'PROJECT_DOCUMENT_OPEN', '{ projectId, nodeId }')
  assertCommandBridgePath(source, commandEffectSource, 'TREE_CREATE_NODE', '{ projectId, parentNodeId, kind, name }')
  assertCommandBridgePath(source, commandEffectSource, 'TREE_RENAME_NODE', '{ projectId, nodeId, name }')
  assertCommandBridgePath(source, commandEffectSource, 'TREE_DELETE_NODE', '{ projectId, nodeId }')
  assertCommandBridgePath(source, commandEffectSource, 'TREE_REORDER_NODE', '{ projectId, nodeId, direction }')
  assertCommandBridgePath(source, commandEffectSource, 'TREE_MOVE_NODE', '{ projectId, nodeId, targetParentNodeId, targetIndex }')
})

test('preload tree document bridge: main bridge allowlist includes only existing cmd.ui set and existing tree document ids', () => {
  const source = read('src/main.js')

  assert.ok(source.includes('const UI_COMMAND_BRIDGE_ALLOWED_COMMAND_IDS = new Set(['))
  assert.ok(source.includes("'cmd.ui.theme.set'"))
  assert.ok(source.includes("'cmd.ui.font.set'"))
  assert.ok(source.includes("'cmd.ui.fontSize.set'"))
  assert.ok(source.includes("'cmd.project.document.open'"))
  assert.ok(source.includes("'cmd.project.tree.createNode'"))
  assert.ok(source.includes("'cmd.project.tree.renameNode'"))
  assert.ok(source.includes("'cmd.project.tree.deleteNode'"))
  assert.ok(source.includes("'cmd.project.tree.reorderNode'"))
  assert.ok(source.includes('TREE_MOVE_COMMAND_ID'))

  assert.ok(source.includes("if (!UI_COMMAND_BRIDGE_ALLOWED_COMMAND_IDS.has(commandId)) {"))
  assert.ok(source.includes("return { ok: false, reason: 'COMMAND_ID_NOT_ALLOWED' };"))
})

test('preload tree document bridge: main bridge reuses existing tree and document semantics through shared handlers', () => {
  const source = read('src/main.js')

  assert.ok(source.includes('async function handleUiOpenDocumentCommand(payload) {'))
  assert.ok(source.includes('async function handleUiCreateNodeCommand(payload) {'))
  assert.ok(source.includes('async function handleUiRenameNodeCommand(payload) {'))
  assert.ok(source.includes('async function handleUiDeleteNodeCommand(payload) {'))
  assert.ok(source.includes('async function handleUiReorderNodeCommand(payload) {'))
  assert.ok(source.includes('async function handleUiMoveNodeCommand(payload, options = {}) {'))

  assert.ok(source.includes("'cmd.project.document.open': async (payload = {}) => {"))
  assert.ok(source.includes('return handleUiOpenDocumentCommand(payload);'))
  assert.ok(source.includes("'cmd.project.tree.createNode': async (payload = {}) => {"))
  assert.ok(source.includes('return handleUiCreateNodeCommand(payload);'))
  assert.ok(source.includes("'cmd.project.tree.renameNode': async (payload = {}) => {"))
  assert.ok(source.includes('return handleUiRenameNodeCommand(payload);'))
  assert.ok(source.includes("'cmd.project.tree.deleteNode': async (payload = {}) => {"))
  assert.ok(source.includes('return handleUiDeleteNodeCommand(payload);'))
  assert.ok(source.includes("'cmd.project.tree.reorderNode': async (payload = {}) => {"))
  assert.ok(source.includes('return handleUiReorderNodeCommand(payload);'))
  assert.ok(source.includes('[TREE_MOVE_COMMAND_ID]: async (payload = {}) => {'))
  assert.ok(source.includes('return handleUiMoveNodeCommand(payload);'))

  assert.ok(source.includes("guardedHandle('ui:open-document', async (_, payload) => {"))
  assert.ok(source.includes("guardedHandle('ui:create-node', async (_, payload) => {"))
  assert.ok(source.includes("guardedHandle('ui:rename-node', async (_, payload) => {"))
  assert.ok(source.includes("guardedHandle('ui:delete-node', async (_, payload) => {"))
  assert.ok(source.includes("guardedHandle('ui:reorder-node', async (_, payload) => {"))
  assert.ok(source.includes("guardedHandle('ui:move-node', async (_, payload) => {"))
})

test('preload tree document bridge: out-of-scope surfaces remain present and unchanged by intent', () => {
  const preloadSource = read('src/preload.js')
  const editorSource = read('src/renderer/editor.js')
  const capabilitySource = read('src/renderer/commands/capabilityPolicy.mjs')
  const bindingDoc = read('docs/OPS/STATUS/COMMAND_CAPABILITY_BINDING.json')
  const namespaceDoc = read('docs/OPS/STATUS/COMMAND_NAMESPACE_CANON.json')

  assert.ok(preloadSource.includes('invokeUiCommandBridge: (request) => {'))
  assert.ok(editorSource.includes('async function openDocumentNode(node) {'))
  assert.ok(editorSource.includes('async function handleCreateNode(node, kind, promptLabel) {'))
  assert.ok(capabilitySource.includes("'cmd.project.document.open': 'cap.project.document.open'"))
  assert.ok(bindingDoc.includes('"commandId": "cmd.project.document.open"'))
  assert.ok(namespaceDoc.includes('"cmd.ui.theme.set"'))
})
