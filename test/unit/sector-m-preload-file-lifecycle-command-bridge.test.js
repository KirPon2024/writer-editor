const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..', '..')

function read(filePath) {
  return fs.readFileSync(path.join(ROOT, filePath), 'utf8')
}

test('preload file lifecycle bridge: projectCommands routes four existing file commands through invokeUiCommandBridge', () => {
  const source = read('src/renderer/commands/projectCommands.mjs')

  assert.ok(source.includes("const COMMAND_BRIDGE_ROUTE = 'command.bus';"))
  assert.ok(source.includes('async function invokeFileLifecycleBridge(electronAPI, commandId) {'))
  assert.ok(source.includes('typeof electronAPI.invokeUiCommandBridge === \'function\''))
  assert.ok(source.includes('response = await invokeFileLifecycleBridge(electronAPI, EXTRA_COMMAND_IDS.PROJECT_NEW);'))
  assert.ok(source.includes('response = await invokeFileLifecycleBridge(electronAPI, COMMAND_IDS.PROJECT_OPEN);'))
  assert.ok(source.includes('response = await invokeFileLifecycleBridge(electronAPI, COMMAND_IDS.PROJECT_SAVE);'))
  assert.ok(source.includes('response = await invokeFileLifecycleBridge(electronAPI, EXTRA_COMMAND_IDS.PROJECT_SAVE_AS);'))

  assert.equal(source.includes('electronAPI.fileOpen('), false)
  assert.equal(source.includes('electronAPI.newFile('), false)
  assert.equal(source.includes('electronAPI.openFile('), false)
  assert.equal(source.includes('electronAPI.fileSave('), false)
  assert.equal(source.includes('electronAPI.saveFile('), false)
  assert.equal(source.includes('electronAPI.fileSaveAs('), false)
  assert.equal(source.includes('electronAPI.saveAs('), false)
})

test('preload file lifecycle bridge: main command bridge allowlist includes only existing four file command ids plus previous adopted ids', () => {
  const source = read('src/main.js')

  assert.ok(source.includes('const UI_COMMAND_BRIDGE_ALLOWED_COMMAND_IDS = new Set(['))
  assert.ok(source.includes("'cmd.project.new'"))
  assert.ok(source.includes("'cmd.project.open'"))
  assert.ok(source.includes("'cmd.project.save'"))
  assert.ok(source.includes("'cmd.project.saveAs'"))

  assert.ok(source.includes("'cmd.project.document.open'"))
  assert.ok(source.includes("'cmd.project.tree.createNode'"))
  assert.ok(source.includes("'cmd.project.tree.renameNode'"))
  assert.ok(source.includes("'cmd.project.tree.deleteNode'"))
  assert.ok(source.includes("'cmd.project.tree.reorderNode'"))
  assert.ok(source.includes('TREE_MOVE_COMMAND_ID'))
  assert.ok(source.includes("'cmd.ui.theme.set'"))
  assert.ok(source.includes("'cmd.ui.font.set'"))
  assert.ok(source.includes("'cmd.ui.fontSize.set'"))

  assert.ok(source.includes("if (!UI_COMMAND_BRIDGE_ALLOWED_COMMAND_IDS.has(commandId)) {"))
  assert.ok(source.includes("return { ok: false, reason: 'COMMAND_ID_NOT_ALLOWED' };"))
})

test('preload file lifecycle bridge: main reuses existing file lifecycle semantics for bridged commands', () => {
  const source = read('src/main.js')

  assert.ok(source.includes('const { createCommandSurfaceKernel } = require(\'./command/commandSurfaceKernel\');'))
  assert.ok(source.includes('function dispatchCommandSurfaceKernel(commandId, payload = {}) {'))
  assert.ok(source.includes("'cmd.project.new': async () => {"))
  assert.ok(source.includes('await ensureCleanAction(handleNew);'))
  assert.ok(source.includes("'cmd.project.open': async () => {"))
  assert.ok(source.includes('await ensureCleanAction(handleOpen);'))
  assert.ok(source.includes("'cmd.project.save': async () => {"))
  assert.ok(source.includes('const saved = await handleSave();'))
  assert.ok(source.includes("'cmd.project.saveAs': async () => {"))
  assert.ok(source.includes('const savedAs = await handleSaveAs();'))

  assert.ok(source.includes("guardedHandle('file:open', async (_, payload) => {"))
  assert.ok(source.includes("guardedHandle('file:save', async () => {"))
  assert.ok(source.includes("guardedHandle('file:save-as', async () => {"))
})

test('preload file lifecycle bridge: out-of-scope surfaces remain present and compatible', () => {
  const preloadSource = read('src/preload.js')
  const capabilitySource = read('src/renderer/commands/capabilityPolicy.mjs')
  const bindingDoc = read('docs/OPS/STATUS/COMMAND_CAPABILITY_BINDING.json')
  const namespaceDoc = read('docs/OPS/STATUS/COMMAND_NAMESPACE_CANON.json')
  const mainSource = read('src/main.js')

  assert.ok(preloadSource.includes('invokeUiCommandBridge: (request) => {'))
  assert.ok(mainSource.includes("guardedProtocolHandle('ui:workspace-query-bridge', async (_, request) => {"))
  assert.ok(mainSource.includes("guardedProtocolHandle('ui:save-lifecycle-signal-bridge', async (_, request) => {"))
  assert.ok(mainSource.includes("guardedHandle('ui:open-section', async (_, payload) => {"))
  assert.ok(mainSource.includes("guardedHandle(EXPORT_DOCX_MIN_CHANNEL, async (_, payload) => {"))
  assert.ok(mainSource.includes("guardedHandle(IMPORT_MARKDOWN_V1_CHANNEL, async (_, payload) => {"))
  assert.ok(mainSource.includes("guardedHandle(EXPORT_MARKDOWN_V1_CHANNEL, async (_, payload) => {"))
  assert.ok(capabilitySource.includes("'cmd.project.new': 'cap.project.new'"))
  assert.ok(bindingDoc.includes('"commandId": "cmd.project.new"'))
  assert.ok(namespaceDoc.includes('"cmd.project.new"'))
})
