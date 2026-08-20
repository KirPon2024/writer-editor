const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..', '..')

function read(filePath) {
  return fs.readFileSync(path.join(ROOT, filePath), 'utf8')
}

test('preload workspace query bridge: preload exposes one typed query bridge api', () => {
  const source = read('src/preload.js')

  assert.equal((source.match(/invokeWorkspaceQueryBridge:\s*\(request\)\s*=>\s*\{/g) || []).length, 1)
  assert.ok(source.includes("const WORKSPACE_QUERY_BRIDGE_CHANNEL = 'ui:workspace-query-bridge';"))
  assert.ok(source.includes("return ipcRenderer.invoke(WORKSPACE_QUERY_BRIDGE_CHANNEL, { queryId, payload });"))
})

test('preload workspace query bridge: main has one query bridge handler with strict allowlist', () => {
  const source = read('src/main.js')

  assert.equal((source.match(/guardedHandle\('ui:workspace-query-bridge'/g) || []).length, 1)
  assert.ok(source.includes("} = require('./shared/workspaceQueryRegistry.cjs');"))
  assert.ok(source.includes('const WORKSPACE_QUERY_BRIDGE_ALLOWED_QUERY_IDS = new Set(WORKSPACE_QUERY_ID_LIST);'))
  assert.ok(source.includes('if (!WORKSPACE_QUERY_BRIDGE_ALLOWED_QUERY_IDS.has(queryId)) {'))
  assert.ok(source.includes("return { ok: false, error: 'QUERY_ID_NOT_ALLOWED' };"))
  assert.ok(source.includes('const WORKSPACE_QUERY_BRIDGE_HANDLERS = new Map(['))
  assert.ok(source.includes('[PROJECT_TREE_QUERY_ID, handleWorkspaceProjectTreeQuery]'))
  assert.ok(source.includes('[COLLAB_SCOPE_LOCAL_QUERY_ID, handleWorkspaceCollabScopeLocalQuery]'))
  assert.ok(source.includes('[REVIEW_SURFACE_QUERY_ID, handleWorkspaceReviewSurfaceQuery]'))
  assert.ok(source.includes('[METADATA_INSPECTOR_QUERY_ID, handleWorkspaceMetadataInspectorQuery]'))
  assert.ok(source.includes('const handler = WORKSPACE_QUERY_BRIDGE_HANDLERS.get(queryId);'))
  assert.ok(source.includes('return handler(payload);'))
  assert.ok(source.includes('function handleWorkspaceReviewSurfaceQuery() {'))
  assert.ok(source.includes('reviewSurface: attachReviewExactTextApplyReconciliationState('))
})

test('preload workspace query bridge: editor tree collab and review surface reads use query bridge only', () => {
  const source = read('src/renderer/editor.js')

  assert.ok(source.includes('const PROJECT_TREE_QUERY_ID = WORKSPACE_QUERY_IDS.PROJECT_TREE;'))
  assert.ok(source.includes('const COLLAB_SCOPE_LOCAL_QUERY_ID = WORKSPACE_QUERY_IDS.COLLAB_SCOPE_LOCAL;'))
  assert.ok(source.includes('const result = await invokeWorkspaceQueryBridge(PROJECT_TREE_QUERY_ID, { tab: activeTab });'))
  assert.ok(source.includes('collabScopeLocal = (await invokeWorkspaceQueryBridge(COLLAB_SCOPE_LOCAL_QUERY_ID)) === true;'))
  assert.ok(source.includes('const REVIEW_SURFACE_QUERY_ID = WORKSPACE_QUERY_IDS.REVIEW_SURFACE;'))
  assert.ok(source.includes('const result = await invokeWorkspaceQueryBridge(REVIEW_SURFACE_QUERY_ID);'))
  assert.ok(source.includes('return setReviewSurfaceState(result.reviewSurface);'))
  assert.ok(source.includes('const METADATA_INSPECTOR_QUERY_ID = WORKSPACE_QUERY_IDS.METADATA_INSPECTOR;'))
  assert.ok(source.includes('const result = await invokeWorkspaceQueryBridge(METADATA_INSPECTOR_QUERY_ID, {'))

  assert.equal(source.includes('window.electronAPI.getProjectTree(activeTab)'), false)
  assert.equal(source.includes('window.electronAPI.getCollabScopeLocal()'), false)
  assert.equal(source.includes('window.electronAPI.getReviewSurface('), false)
  assert.equal(source.includes('window.electronAPI.getMetadataInspector('), false)
  assert.equal(source.includes('__getYalkenReviewSurfaceState'), false)
})

test('preload workspace query bridge: existing query semantics and out-of-scope paths stay compatible', () => {
  const preloadSource = read('src/preload.js')
  const mainSource = read('src/main.js')
  const editorSource = read('src/renderer/editor.js')

  assert.ok(preloadSource.includes('getProjectTree: (tab) => {'))
  assert.ok(preloadSource.includes('getCollabScopeLocal: () => {'))
  assert.equal(preloadSource.includes('getReviewSurface:'), false)

  assert.ok(mainSource.includes('async function handleWorkspaceProjectTreeQuery(payload) {'))
  assert.ok(mainSource.includes('function handleWorkspaceCollabScopeLocalQuery() {'))
  assert.ok(mainSource.includes('function handleWorkspaceReviewSurfaceQuery() {'))
  assert.ok(mainSource.includes('async function handleWorkspaceMetadataInspectorQuery(payload = {}) {'))
  assert.ok(mainSource.includes("guardedHandle('ui:get-project-tree', async (_, payload) => {"))
  assert.ok(mainSource.includes('return handleWorkspaceProjectTreeQuery(payload);'))
  assert.ok(mainSource.includes("guardedHandle('ui:get-collab-scope-local', async () => {"))
  assert.ok(mainSource.includes('return handleWorkspaceCollabScopeLocalQuery();'))

  assert.ok(preloadSource.includes('requestAutoSave: () => {'))
  assert.ok(preloadSource.includes('notifyDirtyState: (state) => {'))
  assert.ok(mainSource.includes("guardedHandle('ui:command-bridge', async (_, request) => {"))
  assert.ok(preloadSource.includes('invokeSaveLifecycleSignalBridge: (request) => {'))
  assert.ok(mainSource.includes("guardedHandle('ui:save-lifecycle-signal-bridge', async (_, request) => {"))
  assert.ok(editorSource.includes('typeof window.electronAPI.invokeSaveLifecycleSignalBridge !=='))
  assert.ok(editorSource.includes("invokeSaveLifecycleSignalBridge('signal.autoSave.request')"))
  assert.ok(editorSource.includes("void invokeSaveLifecycleSignalBridge('signal.localDirty.set', { state: true, generation: localEditGeneration });"))
})

test('preload workspace query bridge: review surface query reads active session plus main-owned crash reconciliation', () => {
  const source = read('src/main.js')

  assert.ok(source.includes('let activeReviewSessionStore = null;'))
  assert.ok(source.includes("let activeReviewSessionLifecycle = 'passive';"))
  assert.ok(source.includes('function resetActiveReviewSessionStore(nextLifecycle = \'passive\') {'))
  assert.ok(source.includes('function readActiveReviewSessionReviewSurface() {'))
  assert.ok(source.includes("if (activeReviewSessionLifecycle !== 'active' || !isPlainObjectValue(activeReviewSessionStore)) {"))
  assert.ok(source.includes('return hasReviewSurfacePayload(reviewSurface)'))
  assert.ok(source.includes('function handleReviewSurfaceImportPacketCommandSurface(payload = {}) {'))
  assert.ok(source.includes('function handleReviewSurfaceClearSessionCommandSurface() {'))
  assert.ok(source.includes('async function handleReviewSurfaceApplyExactTextChangeCommandSurface(payload = {}, options = {}) {'))
  assert.ok(source.includes('function attachReviewExactTextApplyReceipt(receipt, safeWriteResult) {'))
  assert.ok(source.includes("activeReviewSessionLifecycle = 'active';"))
  assert.ok(source.includes("resetActiveReviewSessionStore('cleared');"))
  assert.ok(source.includes("currentReviewSurfacePayloadSource = 'session';"))
  assert.ok(source.includes('function attachReviewExactTextApplyReconciliationState(reviewSurface = {}, filePath = currentFilePath) {'))
  assert.ok(source.includes('readReviewExactTextApplyReconciliationsForFile(filePath)'))
  assert.ok(source.includes('reviewSurface: attachReviewExactTextApplyReconciliationState('))
  assert.ok(source.includes('readActiveReviewSessionReviewSurface(),'))
  assert.equal(source.includes('const derivedPayload = await buildDerivedReviewSurfacePayload();'), false)
})
