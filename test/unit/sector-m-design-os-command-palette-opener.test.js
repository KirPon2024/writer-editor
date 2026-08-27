const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const ROOT = path.resolve(__dirname, '..', '..')

function readEditorSource() {
  return fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'editor.js'), 'utf8')
}

function readRendererHtml() {
  return fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'index.html'), 'utf8')
}

function readRendererStyles() {
  return fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'styles.css'), 'utf8')
}

function extractFunctionSource(source, name) {
  const signature = `function ${name}(`
  const start = source.indexOf(signature)
  assert.ok(start > -1, `${name} must exist`)
  const braceStart = source.indexOf('{', start)
  assert.ok(braceStart > start, `${name} body must exist`)
  let depth = 0
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index]
    if (char === '{') depth += 1
    if (char === '}') depth -= 1
    if (depth === 0) {
      return source.slice(start, index + 1)
    }
  }
  throw new Error(`Unclosed function body for ${name}`)
}

function instantiateFunctions(functionNames, context = {}) {
  const source = readEditorSource()
  const script = `${functionNames.map((name) => extractFunctionSource(source, name)).join('\n\n')}\nmodule.exports = { ${functionNames.join(', ')} };`
  const sandbox = {
    module: { exports: {} },
    exports: {},
    Array,
    Set,
    ...context,
  }
  vm.runInNewContext(script, sandbox, { filename: 'sector-m-design-os-command-palette-opener.editor-snippet.js' })
  return { exported: sandbox.module.exports, sandbox }
}

function toPlain(value) {
  return JSON.parse(JSON.stringify(value))
}

test('command palette opener: current renderer html exposes commands button and modal shell', () => {
  const html = readRendererHtml()
  assert.ok(html.includes('data-action="open-command-palette"'))
  assert.ok(html.includes('data-command-palette-modal'))
  assert.ok(html.includes('data-command-palette-search'))
  assert.ok(html.includes('data-command-palette-summary'))
  assert.ok(html.includes('data-command-palette-list'))
  assert.ok(html.includes('data-command-palette-close'))
})

test('command palette opener: literal stage keeps the right inspector visible for the commands surface', () => {
  const styles = readRendererStyles()
  assert.ok(styles.includes('.literal-stage-a .app-layout {'))
  assert.ok(styles.includes('grid-template-columns: minmax(250px, var(--app-left-sidebar-width)) minmax(640px, 1fr) minmax(280px, var(--app-right-sidebar-width));'))
  assert.ok(styles.includes('.literal-stage-a .sidebar--right {'))
  assert.ok(styles.includes('display: flex;'))
  assert.ok(styles.includes('.literal-stage-a .x101-mode-switcher {'))
})

test('command palette opener: commands modal keeps search field in viewport with bounded content and scrollable list', () => {
  const styles = readRendererStyles()
  assert.ok(styles.includes('[data-command-palette-modal] .modal__content {'))
  assert.ok(styles.includes('max-height: calc(100vh - 32px);'))
  assert.ok(styles.includes('overflow: hidden;'))
  assert.ok(styles.includes('[data-command-palette-modal] [data-command-palette-list] {'))
  assert.ok(styles.includes('flex: 1 1 auto;'))
  assert.ok(styles.includes('min-height: 0;'))
  assert.ok(styles.includes('overflow: auto;'))
})

test('command palette opener: editor wiring exposes action case and data-provider based rendering path', () => {
  const source = readEditorSource()
  assert.ok(source.includes('const commandPaletteModal = document.querySelector(\'[data-command-palette-modal]\');'))
  assert.ok(source.includes('const commandPaletteSearchInput = document.querySelector(\'[data-command-palette-search]\');'))
  assert.ok(source.includes('const commandPaletteList = document.querySelector(\'[data-command-palette-list]\');'))
  assert.ok(source.includes('function ensureCommandsOpenerInRightInspectorSurface() {'))
  assert.ok(source.includes('if (tab === \'inspector\') {'))
  assert.ok(source.includes('ensureCommandsOpenerInRightInspectorSurface();'))
  assert.ok(source.includes('function renderCommandPaletteList(rawQuery = \'\') {'))
  assert.ok(source.includes('function ensureCommandPaletteSearchFieldVisible() {'))
  assert.ok(source.includes('commandPaletteSearchInput.hidden = false;'))
  assert.ok(source.includes('commandPaletteSearchInput.disabled = false;'))
  assert.ok(source.includes('commandPaletteSearchInput.readOnly = false;'))
  assert.ok(source.includes('commandPaletteSearchInput.tabIndex = 0;'))
  assert.ok(source.includes('commandPaletteSearchInput.removeAttribute(\'hidden\');'))
  assert.ok(source.includes('commandPaletteSearchInput.removeAttribute(\'disabled\');'))
  assert.ok(source.includes('commandPaletteSearchInput.removeAttribute(\'readonly\');'))
  assert.ok(source.includes('commandPaletteSearchInput.style.display = \'block\';'))
  assert.ok(source.includes('commandPaletteSearchInput.style.visibility = \'visible\';'))
  assert.ok(source.includes('commandPaletteSearchInput.style.opacity = \'1\';'))
  assert.ok(source.includes('commandPaletteSearchInput.style.pointerEvents = \'auto\';'))
  assert.ok(source.includes('const sourceEntries ='))
  assert.ok(source.includes('commandPaletteDataProvider.listAll()'))
  assert.ok(source.includes('case \'open-command-palette\':'))
  assert.ok(source.includes('openCommandPaletteModal();'))
  assert.ok(source.includes('ensureCommandPaletteSearchFieldVisible();'))
  assert.ok(source.includes('return dispatchUiCommand(commandId.trim());'))
})

test('command palette opener: inspector surface keeps a visible commands opener', () => {
  const hostButtons = [
    {
      dataset: { action: 'open-settings' },
      textContent: 'Settings',
      hidden: false,
      disabled: false,
    },
    {
      dataset: { action: 'open-diagnostics' },
      textContent: 'Diagnostics',
      hidden: false,
      disabled: false,
    },
  ]

  const actionsHost = {
    querySelector: (selector) => {
      const match = selector.match(/data-action="([^"]+)"/)
      if (!match) return null
      const action = match[1]
      return hostButtons.find((button) => button.dataset?.action === action) || null
    },
    insertBefore: (node, beforeNode) => {
      const index = hostButtons.indexOf(beforeNode)
      if (index >= 0) {
        hostButtons.splice(index, 0, node)
        return
      }
      hostButtons.push(node)
    },
    prepend: (node) => {
      hostButtons.unshift(node)
    },
  }

  const rightInspectorPanel = {
    querySelector: (selector) => (selector === '.x101-action-buttons' ? actionsHost : null),
  }

  const { exported } = instantiateFunctions([
    'ensureCommandsOpenerInRightInspectorSurface',
  ], {
    rightInspectorPanel,
    document: {
      createElement: () => ({
        type: '',
        className: '',
        dataset: {},
        textContent: '',
        hidden: true,
        disabled: true,
      }),
    },
  })

  const created = exported.ensureCommandsOpenerInRightInspectorSurface()
  assert.equal(created?.dataset?.action, 'open-command-palette')
  assert.equal(created?.hidden, false)
  assert.equal(created?.disabled, false)
  assert.equal(created?.textContent, 'Commands')
  assert.equal(hostButtons[0]?.dataset?.action, 'open-command-palette')
  assert.equal(hostButtons[1]?.dataset?.action, 'open-settings')
})

test('command palette opener: filter matches by label id and hotkey and trims query', () => {
  const { exported } = instantiateFunctions([
    'filterCommandPaletteEntries',
  ])
  const entries = [
    { id: 'cmd.project.open', label: 'Open Project', hotkey: 'Cmd+O' },
    { id: 'cmd.project.save', label: 'Save', hotkey: 'Cmd+S' },
    { id: 'cmd.editor.find', label: 'Find', hotkey: 'Cmd+F' },
  ]

  assert.deepEqual(
    toPlain(exported.filterCommandPaletteEntries(entries, '  open  ').map((entry) => entry.id)),
    ['cmd.project.open'],
  )
  assert.deepEqual(
    toPlain(exported.filterCommandPaletteEntries(entries, 'cmd+f').map((entry) => entry.id)),
    ['cmd.editor.find'],
  )
  assert.deepEqual(
    toPlain(exported.filterCommandPaletteEntries(entries, '').map((entry) => entry.id)),
    ['cmd.project.open', 'cmd.project.save', 'cmd.editor.find'],
  )
})

test('command palette opener: open modal resets query renders list and focuses input', () => {
  const events = []
  const commandPaletteSearchInput = {
    hidden: false,
    value: 'pre-existing',
    style: {},
    focus: () => events.push('focus'),
  }
  const commandPaletteModal = { hidden: true }
  const { exported } = instantiateFunctions([
    'ensureCommandPaletteSearchFieldVisible',
    'openCommandPaletteModal',
  ], {
    commandPaletteSearchInput,
    commandPaletteModal,
    renderCommandPaletteList: (query) => events.push(['render', query]),
    openSimpleModal: (modal) => {
      modal.hidden = false
      events.push(['open', modal.hidden])
    },
  })

  exported.openCommandPaletteModal()
  assert.equal(commandPaletteSearchInput.value, '')
  assert.equal(commandPaletteModal.hidden, false)
  assert.deepEqual(toPlain(events), [
    ['render', ''],
    ['open', false],
    'focus',
  ])
})

test('command palette opener: open modal restores hidden search input visibility', () => {
  const commandPaletteSearchInput = {
    hidden: true,
    disabled: true,
    readOnly: true,
    tabIndex: -1,
    value: 'search',
    style: { display: 'none' },
    removed: [],
    removeAttribute: (name) => {
      commandPaletteSearchInput.removed.push(name)
    },
    focus: () => {},
  }
  const { exported } = instantiateFunctions([
    'ensureCommandPaletteSearchFieldVisible',
    'openCommandPaletteModal',
  ], {
    commandPaletteSearchInput,
    commandPaletteModal: { hidden: true },
    renderCommandPaletteList: () => {},
    openSimpleModal: () => {},
  })

  exported.openCommandPaletteModal()
  assert.equal(commandPaletteSearchInput.hidden, false)
  assert.equal(commandPaletteSearchInput.disabled, false)
  assert.equal(commandPaletteSearchInput.readOnly, false)
  assert.equal(commandPaletteSearchInput.tabIndex, 0)
  assert.equal(commandPaletteSearchInput.style.display, 'block')
  assert.equal(commandPaletteSearchInput.style.visibility, 'visible')
  assert.equal(commandPaletteSearchInput.style.opacity, '1')
  assert.equal(commandPaletteSearchInput.style.pointerEvents, 'auto')
  assert.equal(commandPaletteSearchInput.style.minHeight, '36px')
  assert.deepEqual(toPlain(commandPaletteSearchInput.removed), ['hidden', 'disabled', 'readonly'])
})

test('command palette opener: selecting entry closes modal and dispatches command id', async () => {
  const events = []
  const commandPaletteModal = { hidden: false }
  const { exported } = instantiateFunctions([
    'runCommandPaletteAction',
  ], {
    BLACK_BOX_EXPORT_MANUAL_CORE_COMMAND_ID: 'cmd.project.blackBox.exportManualCoreCapsuleKitV1',
    commandPaletteModal,
    closeSimpleModal: (modal) => {
      modal.hidden = true
      events.push(['close', modal.hidden])
    },
    dispatchUiCommand: async (commandId) => {
      events.push(['dispatch', commandId])
      return { ok: true }
    },
  })

  await exported.runCommandPaletteAction(' cmd.project.open ')
  await exported.runCommandPaletteAction(' ')

  assert.deepEqual(toPlain(events), [
    ['close', true],
    ['dispatch', 'cmd.project.open'],
  ])
})
