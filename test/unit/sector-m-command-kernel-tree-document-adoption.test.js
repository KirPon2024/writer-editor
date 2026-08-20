const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const ROOT = path.resolve(__dirname, '..', '..')

function read(filePath) {
  return fs.readFileSync(path.join(ROOT, filePath), 'utf8')
}

async function loadProjectCommands() {
  return import(pathToFileURL(path.join(ROOT, 'src', 'renderer', 'commands', 'projectCommands.mjs')).href)
}

async function loadCapabilityPolicy() {
  return import(pathToFileURL(path.join(ROOT, 'src', 'renderer', 'commands', 'capabilityPolicy.mjs')).href)
}

function readBindingDoc() {
  return JSON.parse(read('docs/OPS/STATUS/COMMAND_CAPABILITY_BINDING.json'))
}

function createCaptureRegistry() {
  const handlers = new Map()
  return {
    registry: {
      registerCommand(meta, handler) {
        handlers.set(meta.id, { meta, handler })
      },
    },
    handlers,
  }
}

function assertBridgeCall(call, expectedCommandId, expectedPayload) {
  assert.deepEqual(call, {
    route: 'command.bus',
    commandId: expectedCommandId,
    payload: expectedPayload,
  })
}

test('command kernel tree-document adoption: projectCommands defines and registers tree plus metadata stable command ids', async () => {
  const projectCommandsSource = read('src/renderer/commands/projectCommands.mjs')
  const commandEffectSource = read('src/renderer/commands/commandEffectModel.mjs')
  const projectCommands = await loadProjectCommands()

  assert.equal(projectCommands.EXTRA_COMMAND_IDS.PROJECT_DOCUMENT_OPEN, 'cmd.project.document.open')
  assert.equal(projectCommands.EXTRA_COMMAND_IDS.TREE_CREATE_NODE, 'cmd.project.tree.createNode')
  assert.equal(projectCommands.EXTRA_COMMAND_IDS.TREE_RENAME_NODE, 'cmd.project.tree.renameNode')
  assert.equal(projectCommands.EXTRA_COMMAND_IDS.TREE_DELETE_NODE, 'cmd.project.tree.deleteNode')
  assert.equal(projectCommands.EXTRA_COMMAND_IDS.TREE_REORDER_NODE, 'cmd.project.tree.reorderNode')
  assert.equal(projectCommands.EXTRA_COMMAND_IDS.TREE_MOVE_NODE, 'cmd.project.tree.moveNode')
  assert.equal(projectCommands.EXTRA_COMMAND_IDS.METADATA_UPDATE, 'cmd.project.metadata.update')

  assert.ok(projectCommandsSource.includes('id: EXTRA_COMMAND_IDS.PROJECT_DOCUMENT_OPEN,'))
  assert.ok(projectCommandsSource.includes('id: EXTRA_COMMAND_IDS.TREE_CREATE_NODE,'))
  assert.ok(projectCommandsSource.includes('id: EXTRA_COMMAND_IDS.TREE_RENAME_NODE,'))
  assert.ok(projectCommandsSource.includes('id: EXTRA_COMMAND_IDS.TREE_DELETE_NODE,'))
  assert.ok(projectCommandsSource.includes('id: EXTRA_COMMAND_IDS.TREE_REORDER_NODE,'))
  assert.ok(projectCommandsSource.includes('id: EXTRA_COMMAND_IDS.TREE_MOVE_NODE,'))
  assert.ok(projectCommandsSource.includes('id: EXTRA_COMMAND_IDS.METADATA_UPDATE,'))

  assert.equal(projectCommandsSource.includes('electronAPI.openDocument('), false)
  assert.equal(projectCommandsSource.includes('electronAPI.createNode('), false)
  assert.equal(projectCommandsSource.includes('electronAPI.renameNode('), false)
  assert.equal(projectCommandsSource.includes('electronAPI.deleteNode('), false)
  assert.equal(projectCommandsSource.includes('electronAPI.reorderNode('), false)
  assert.equal(projectCommandsSource.includes('electronAPI.moveNode('), false)

  assert.ok(projectCommandsSource.includes('invokeBridgeOnlyCommand('))
  assert.ok(projectCommandsSource.includes("effectType: 'electron-bridge-only',"))
  assert.ok(commandEffectSource.includes('electronAPI.invokeUiCommandBridge({'))
  assert.ok(commandEffectSource.includes('route: plan.route,'))
  assert.ok(commandEffectSource.includes('commandId: plan.commandId,'))
  assert.ok(commandEffectSource.includes('payload: plan.payload,'))
  assert.ok(projectCommandsSource.includes('EXTRA_COMMAND_IDS.PROJECT_DOCUMENT_OPEN,'))
  assert.ok(projectCommandsSource.includes('{ projectId, nodeId },'))
  assert.ok(projectCommandsSource.includes('EXTRA_COMMAND_IDS.TREE_CREATE_NODE,'))
  assert.ok(projectCommandsSource.includes('{ projectId, parentNodeId, kind, name },'))
  assert.ok(projectCommandsSource.includes('EXTRA_COMMAND_IDS.TREE_RENAME_NODE,'))
  assert.ok(projectCommandsSource.includes('{ projectId, nodeId, name },'))
  assert.ok(projectCommandsSource.includes('EXTRA_COMMAND_IDS.TREE_DELETE_NODE,'))
  assert.ok(projectCommandsSource.includes('{ projectId, nodeId },'))
  assert.ok(projectCommandsSource.includes('EXTRA_COMMAND_IDS.TREE_REORDER_NODE,'))
  assert.ok(projectCommandsSource.includes('{ projectId, nodeId, direction },'))
  assert.ok(projectCommandsSource.includes('EXTRA_COMMAND_IDS.TREE_MOVE_NODE,'))
  assert.ok(projectCommandsSource.includes('{ projectId, nodeId, targetParentNodeId, targetIndex },'))
  assert.ok(projectCommandsSource.includes('EXTRA_COMMAND_IDS.METADATA_UPDATE,'))
  assert.ok(projectCommandsSource.includes('{ projectId, nodeId, baselineHash, metadata },'))
  assert.equal(projectCommandsSource.includes('DOCUMENT_PATH_REQUIRED'), false)
})

test('command kernel tree-document adoption: tree document commands execute exact command bridge payloads', async () => {
  const projectCommands = await loadProjectCommands()
  const calls = []
  const electronAPI = {
    invokeUiCommandBridge(request) {
      calls.push(request)
      return { ok: true }
    },
  }
  const { registry, handlers } = createCaptureRegistry()
  projectCommands.registerProjectCommands(registry, { electronAPI })

  const cases = [
    [
      projectCommands.EXTRA_COMMAND_IDS.PROJECT_DOCUMENT_OPEN,
      { projectId: 'project-1', nodeId: 'scene-1' },
      { projectId: 'project-1', nodeId: 'scene-1' },
    ],
    [
      projectCommands.EXTRA_COMMAND_IDS.TREE_CREATE_NODE,
      { projectId: 'project-1', parentNodeId: 'chapter-1', kind: 'scene', name: 'New Scene' },
      { projectId: 'project-1', parentNodeId: 'chapter-1', kind: 'scene', name: 'New Scene' },
    ],
    [
      projectCommands.EXTRA_COMMAND_IDS.TREE_RENAME_NODE,
      { projectId: 'project-1', nodeId: 'scene-1', name: 'New Name' },
      { projectId: 'project-1', nodeId: 'scene-1', name: 'New Name' },
    ],
    [
      projectCommands.EXTRA_COMMAND_IDS.TREE_DELETE_NODE,
      { projectId: 'project-1', nodeId: 'scene-1' },
      { projectId: 'project-1', nodeId: 'scene-1' },
    ],
    [
      projectCommands.EXTRA_COMMAND_IDS.TREE_REORDER_NODE,
      { projectId: 'project-1', nodeId: 'scene-1', direction: 'up' },
      { projectId: 'project-1', nodeId: 'scene-1', direction: 'up' },
    ],
    [
      projectCommands.EXTRA_COMMAND_IDS.TREE_MOVE_NODE,
      { projectId: 'project-1', nodeId: 'scene-1', targetParentNodeId: 'chapter-1', targetIndex: 0 },
      { projectId: 'project-1', nodeId: 'scene-1', targetParentNodeId: 'chapter-1', targetIndex: 0 },
    ],
    [
      projectCommands.EXTRA_COMMAND_IDS.METADATA_UPDATE,
      {
        projectId: 'project-1',
        nodeId: 'scene-1',
        baselineHash: 'a'.repeat(64),
        metadata: { synopsis: 'One', status: 'черновик', tags: { pov: 'A' } },
      },
      {
        projectId: 'project-1',
        nodeId: 'scene-1',
        baselineHash: 'a'.repeat(64),
        metadata: { synopsis: 'One', status: 'черновик', tags: { pov: 'A' } },
      },
    ],
  ]

  for (const [commandId, input, expectedPayload] of cases) {
    const registered = handlers.get(commandId)
    assert.ok(registered, `missing registered handler for ${commandId}`)
    const before = calls.length
    const result = await registered.handler(input)
    assert.equal(result.ok, true)
    assert.equal(calls.length, before + 1)
    assertBridgeCall(calls.at(-1), commandId, expectedPayload)
  }
})

test('command kernel tree-document adoption: runtime and docs capability bindings match for new command ids', async () => {
  const projectCommands = await loadProjectCommands()
  const capabilityPolicy = await loadCapabilityPolicy()
  const bindingDoc = readBindingDoc()
  const bindingMap = new Map(bindingDoc.items.map((item) => [item.commandId, item.capabilityId]))

  const expected = new Map([
    [projectCommands.EXTRA_COMMAND_IDS.PROJECT_DOCUMENT_OPEN, 'cap.project.document.open'],
    [projectCommands.EXTRA_COMMAND_IDS.PROJECT_EXPORT_SELECTED_SCENES_TXT, 'cap.project.export.selectedScenesTxtV1'],
    [projectCommands.EXTRA_COMMAND_IDS.TREE_CREATE_NODE, 'cap.project.tree.createNode'],
    [projectCommands.EXTRA_COMMAND_IDS.TREE_RENAME_NODE, 'cap.project.tree.renameNode'],
    [projectCommands.EXTRA_COMMAND_IDS.TREE_DELETE_NODE, 'cap.project.tree.deleteNode'],
    [projectCommands.EXTRA_COMMAND_IDS.TREE_REORDER_NODE, 'cap.project.tree.reorderNode'],
    [projectCommands.EXTRA_COMMAND_IDS.TREE_MOVE_NODE, 'cap.project.tree.moveNode'],
    [projectCommands.EXTRA_COMMAND_IDS.METADATA_UPDATE, 'cap.project.metadata.update'],
  ])

  for (const [commandId, capabilityId] of expected.entries()) {
    assert.equal(capabilityPolicy.CAPABILITY_BINDING[commandId], capabilityId)
    assert.equal(bindingMap.get(commandId), capabilityId)

    assert.equal(capabilityPolicy.CAPABILITY_MATRIX.node[capabilityId], true)
    assert.equal(capabilityPolicy.CAPABILITY_MATRIX.web[capabilityId], false)
    assert.equal(capabilityPolicy.CAPABILITY_MATRIX['mobile-wrapper'][capabilityId], false)
  }
})

test('navigator context command bindings: selected-scenes export uses one registered command for open and confirm', async () => {
  const projectCommands = await loadProjectCommands()
  const calls = []
  let opened = 0
  const electronAPI = {
    invokeUiCommandBridge(request) {
      calls.push(request)
      return { ok: true, exported: true, sceneCount: 2 }
    },
  }
  const { registry, handlers } = createCaptureRegistry()
  projectCommands.registerProjectCommands(registry, {
    electronAPI,
    uiActions: {
      openSelectedScenesTxtExport() {
        opened += 1
      },
    },
  })

  const commandId = projectCommands.EXTRA_COMMAND_IDS.PROJECT_EXPORT_SELECTED_SCENES_TXT
  assert.equal(commandId, 'cmd.project.exportSelectedScenesTxtV1')
  const registered = handlers.get(commandId)
  assert.ok(registered)
  assert.deepEqual(registered.meta.surface, ['menu', 'context'])

  const openResult = await registered.handler({})
  assert.equal(openResult.ok, true)
  assert.equal(opened, 1)
  assert.equal(calls.length, 0)

  const confirmResult = await registered.handler({
    confirmed: true,
    requestId: 'export-request-1',
    selectedSceneIds: ['scene-1', 'scene-2'],
  })
  assert.equal(confirmResult.ok, true)
  assert.equal(confirmResult.value.exported, true)
  assert.equal(confirmResult.value.sceneCount, 2)
  assertBridgeCall(calls.at(-1), commandId, {
    confirmed: true,
    requestId: 'export-request-1',
    selectedSceneIds: ['scene-1', 'scene-2'],
  })
})

test('command kernel tree-document adoption: editor routes tree and document actions via dispatchUiCommand only', () => {
  const source = read('src/renderer/editor.js')

  assert.equal(source.includes('window.electronAPI.openDocument('), false)
  assert.equal(source.includes('window.electronAPI.createNode('), false)
  assert.equal(source.includes('window.electronAPI.renameNode('), false)
  assert.equal(source.includes('window.electronAPI.deleteNode('), false)
  assert.equal(source.includes('window.electronAPI.reorderNode('), false)
  assert.equal(source.includes('window.electronAPI.moveNode('), false)

  assert.ok(source.includes('dispatchUiCommand(EXTRA_COMMAND_IDS.PROJECT_DOCUMENT_OPEN, {'))
  assert.ok(source.includes('dispatchUiCommand(EXTRA_COMMAND_IDS.TREE_CREATE_NODE, {'))
  assert.ok(source.includes('dispatchUiCommand(EXTRA_COMMAND_IDS.TREE_RENAME_NODE, {'))
  assert.ok(source.includes('dispatchUiCommand(EXTRA_COMMAND_IDS.TREE_DELETE_NODE, {'))
  assert.ok(source.includes('dispatchUiCommand(EXTRA_COMMAND_IDS.TREE_MOVE_NODE, {'))
  assert.equal(source.includes('path: node.path'), false)
  assert.ok(source.includes('nodeId: getEffectiveDocumentId(node)'))
})

test('command kernel tree-document adoption: tree click and context actions continue through openDocumentNode and handlers', () => {
  const source = read('src/renderer/editor.js')

  assert.ok(source.includes('const opened = await openDocumentNode(node);'))
  assert.ok(source.includes("append(EXTRA_COMMAND_IDS.TREE_CREATE_NODE, 'Новая папка'"))
  assert.ok(source.includes("append(EXTRA_COMMAND_IDS.TREE_RENAME_NODE, 'Переименовать'"))
  assert.ok(source.includes("append(EXTRA_COMMAND_IDS.TREE_DELETE_NODE, 'Удалить'"))
  assert.ok(source.includes("append(EXTRA_COMMAND_IDS.TREE_MOVE_NODE, 'Вверх'"))
  assert.ok(source.includes('button.dataset.commandId = item.commandId;'))
  assert.ok(source.includes('isNavigatorContextCommandAvailable(commandId)'))
})

test('navigator context command bindings: every visible item is registry-gated and command-addressable', () => {
  const source = read('src/renderer/editor.js')
  const start = source.indexOf('function buildContextMenuItems(node)')
  const end = source.indexOf('function renderTreeNode(node, level, isLast, ancestorHasNext = [], parentNodeId = \'\', siblingIndex = 0)', start)
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  const section = source.slice(start, end)

  assert.ok(source.includes('button.dataset.commandId = item.commandId;'))
  assert.ok(source.includes('if (!commandRegistry.hasCommand(commandId)) return false;'))
  assert.ok(source.includes('enforceCapabilityForCommand('))
  assert.equal(section.includes('items.push('), false)
  assert.equal(section.includes('onClick:'), false)
  assert.equal(section.includes('openCardModal('), false)
  assert.equal(section.toLowerCase().includes('duplicate'), false)

  for (const commandId of [
    'PROJECT_DOCUMENT_OPEN',
    'PROJECT_EXPORT_SELECTED_SCENES_TXT',
    'TREE_CREATE_NODE',
    'TREE_RENAME_NODE',
    'TREE_DELETE_NODE',
    'TREE_MOVE_NODE',
    'INSERT_ADD_CARD',
  ]) {
    assert.ok(section.includes(`EXTRA_COMMAND_IDS.${commandId}`), commandId)
  }
})

test('command kernel tree-document adoption: loadTree data fetch uses query bridge and signal paths remain canonicalized', () => {
  const source = read('src/renderer/editor.js')

  assert.ok(source.includes('async function loadTree() {'))
  assert.ok(source.includes('const result = await invokeWorkspaceQueryBridge(PROJECT_TREE_QUERY_ID, { tab: activeTab });'))
  assert.ok(source.includes("void invokeSaveLifecycleSignalBridge('signal.localDirty.set', { state: true, generation: localEditGeneration });"))
  assert.ok(source.includes("invokeSaveLifecycleSignalBridge('signal.autoSave.request')"))
  assert.ok(source.includes('collabScopeLocal = (await invokeWorkspaceQueryBridge(COLLAB_SCOPE_LOCAL_QUERY_ID)) === true;'))
})
