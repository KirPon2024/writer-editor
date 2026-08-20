const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..', '..')

function read(filePath) {
  return fs.readFileSync(path.join(ROOT, filePath), 'utf8')
}

test('preload save lifecycle signal bridge: preload exposes one typed signal bridge api', () => {
  const source = read('src/preload.js')

  assert.equal((source.match(/invokeSaveLifecycleSignalBridge:\s*\(request\)\s*=>\s*\{/g) || []).length, 1)
  assert.ok(source.includes("const SAVE_LIFECYCLE_SIGNAL_BRIDGE_CHANNEL = 'ui:save-lifecycle-signal-bridge';"))
  assert.ok(source.includes('return ipcRenderer.invoke(SAVE_LIFECYCLE_SIGNAL_BRIDGE_CHANNEL, { signalId, payload });'))
})

test('preload save lifecycle signal bridge: main exposes one handler with strict signal allowlist', () => {
  const source = read('src/main.js')

  assert.equal((source.match(/ipcMain\.handle\('ui:save-lifecycle-signal-bridge'/g) || []).length, 1)
  assert.ok(source.includes('const SAVE_LIFECYCLE_SIGNAL_BRIDGE_ALLOWED_SIGNAL_IDS = new Set(['))
  assert.ok(source.includes("'signal.localDirty.set'"))
  assert.ok(source.includes("'signal.autoSave.request'"))
  assert.ok(source.includes('if (!SAVE_LIFECYCLE_SIGNAL_BRIDGE_ALLOWED_SIGNAL_IDS.has(signalId)) {'))
  assert.ok(source.includes("return { ok: false, error: 'SIGNAL_ID_NOT_ALLOWED' };"))
  assert.ok(source.includes("if (signalId === 'signal.localDirty.set') {"))
  assert.ok(source.includes("if (typeof payload.state !== 'boolean') {"))
  assert.ok(source.includes('isDirty = payload.state;'))
  assert.ok(source.includes("if (signalId === 'signal.autoSave.request') {"))
  assert.ok(source.includes('return autoSave();'))
})

test('preload save lifecycle signal bridge: editor routes dirty and autosave call sites through signal bridge only', () => {
  const source = read('src/renderer/editor.js')

  assert.ok(source.includes("await invokeSaveLifecycleSignalBridge('signal.localDirty.set', { state: false });"))
  assert.ok(source.includes("invokeSaveLifecycleSignalBridge('signal.autoSave.request')"))
  assert.ok(source.includes("void invokeSaveLifecycleSignalBridge('signal.localDirty.set', { state: true, generation: localEditGeneration });"))
  assert.ok(source.includes('typeof window.electronAPI.invokeSaveLifecycleSignalBridge !=='))

  assert.equal(source.includes('window.electronAPI.notifyDirtyState('), false)
  assert.equal(source.includes('.requestAutoSave()'), false)
})

test('preload save lifecycle signal bridge: existing compatibility paths remain present', () => {
  const preloadSource = read('src/preload.js')
  const mainSource = read('src/main.js')

  assert.ok(preloadSource.includes('notifyDirtyState: (state) => {'))
  assert.ok(preloadSource.includes('requestAutoSave: () => {'))
  assert.ok(mainSource.includes("ipcMain.on('dirty-changed', (_, state) => {"))
  assert.ok(mainSource.includes("ipcMain.handle('ui:request-autosave', async () => {"))
  assert.ok(mainSource.includes("ipcMain.handle('ui:command-bridge', async (_, request) => {"))
  assert.ok(mainSource.includes("ipcMain.handle('ui:workspace-query-bridge', async (_, request) => {"))
})
