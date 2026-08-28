import { Editor } from '@tiptap/core'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import { TextStyle } from '@tiptap/extension-text-style'
import Underline from '@tiptap/extension-underline'
import StarterKit from '@tiptap/starter-kit'
import {
  attachTiptapIpc,
  composeObservablePayload,
  detachTiptapIpc,
  parseObservablePayload,
} from './ipc.js'
import { createTiptapRuntimeBridge } from './runtimeBridge.js'
import {
  buildParagraphDocumentFromText,
  createDefaultDocumentMeta,
  canonicalizeDocumentJson,
} from '../documentContentEnvelope.mjs'

let currentEditorInstance = null
let currentIpcSession = null
let currentRuntimeBridge = null
let currentFormattingStateHandler = null
let unloadHookBound = false
let runtimeCommandListenerAttached = false
let recoveryRestoredListenerAttached = false

function readEditorText(editor) {
  if (!editor || typeof editor.getText !== 'function') {
    return ''
  }

  try {
    return editor.getText({ blockSeparator: '\n' })
  } catch {
    return editor.getText()
  }
}

function notifyDirtyState(nextDirty) {
  if (!window.electronAPI || typeof window.electronAPI.invokeSaveLifecycleSignalBridge !== 'function') {
    return
  }

  window.electronAPI.invokeSaveLifecycleSignalBridge({
    signalId: 'signal.localDirty.set',
    payload: { state: Boolean(nextDirty) },
  }).catch(() => {})
}

function readEditorDocument(editor) {
  if (!editor || typeof editor.getJSON !== 'function') {
    return buildParagraphDocumentFromText('')
  }

  try {
    return canonicalizeDocumentJson(editor.getJSON())
  } catch {
    return buildParagraphDocumentFromText(readEditorText(editor))
  }
}

function normalizeFormattingColor(value) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim().toLowerCase()
    : ''
}

const STRUCTURED_PARAGRAPH_STYLE_OPTIONS = new Set([
  'paragraph-none',
  'paragraph-title',
  'paragraph-heading1',
  'paragraph-heading2',
  'paragraph-blockquote',
])

const STRUCTURED_CHARACTER_STYLE_OPTIONS = new Set([
  'character-emphasis',
  'character-code-span',
])

function createStructuredStyleResult(action, performed, reason, optionId = null) {
  return {
    performed: Boolean(performed),
    action,
    reason: reason || null,
    optionId,
  }
}

function getStructuredParagraphStyleOption(editor) {
  if (!editor || typeof editor.isActive !== 'function') {
    return ''
  }

  if (
    editor.isActive('bulletList')
    || editor.isActive('orderedList')
    || editor.isActive('codeBlock')
  ) {
    return ''
  }

  if (editor.isActive('blockquote')) {
    return 'paragraph-blockquote'
  }
  if (editor.isActive('heading', { level: 1 })) {
    return 'paragraph-title'
  }
  if (editor.isActive('heading', { level: 2 })) {
    return 'paragraph-heading1'
  }
  if (editor.isActive('heading', { level: 3 })) {
    return 'paragraph-heading2'
  }
  if (editor.isActive('paragraph')) {
    return 'paragraph-none'
  }
  return ''
}

function getStructuredCharacterStyleOption(editor) {
  if (!editor || typeof editor.isActive !== 'function') {
    return ''
  }

  if (editor.isActive('code')) {
    return 'character-code-span'
  }
  if (editor.isActive('italic')) {
    return 'character-emphasis'
  }
  return ''
}

function runTiptapStructuredParagraphStyle(optionId) {
  if (!STRUCTURED_PARAGRAPH_STYLE_OPTIONS.has(optionId)) {
    return createStructuredStyleResult('applyParagraphStyle', false, 'UNSUPPORTED_STYLE_OPTION', optionId)
  }
  if (!currentEditorInstance || !currentEditorInstance.commands) {
    return createStructuredStyleResult('applyParagraphStyle', false, 'EDITOR_UNAVAILABLE', optionId)
  }

  const currentOptionId = getStructuredParagraphStyleOption(currentEditorInstance)
  if (currentOptionId === optionId) {
    return createStructuredStyleResult('applyParagraphStyle', false, 'NO_OP', optionId)
  }

  const chain = typeof currentEditorInstance.chain === 'function'
    ? currentEditorInstance.chain().focus()
    : null
  if (!chain || typeof chain.run !== 'function') {
    return createStructuredStyleResult('applyParagraphStyle', false, 'FORMAT_COMMAND_UNSUPPORTED', optionId)
  }

  let performed = false
  if (optionId === 'paragraph-none') {
    if (
      typeof chain.clearNodes !== 'function'
      || typeof chain.setParagraph !== 'function'
    ) {
      return createStructuredStyleResult('applyParagraphStyle', false, 'FORMAT_COMMAND_UNSUPPORTED', optionId)
    }
    performed = Boolean(chain.clearNodes().setParagraph().run())
  } else if (optionId === 'paragraph-blockquote') {
    if (
      typeof chain.clearNodes !== 'function'
      || typeof chain.setBlockquote !== 'function'
    ) {
      return createStructuredStyleResult('applyParagraphStyle', false, 'FORMAT_COMMAND_UNSUPPORTED', optionId)
    }
    performed = Boolean(chain.clearNodes().setBlockquote().run())
  } else {
    const levelMap = {
      'paragraph-title': 1,
      'paragraph-heading1': 2,
      'paragraph-heading2': 3,
    }
    if (
      typeof chain.clearNodes !== 'function'
      || typeof chain.setHeading !== 'function'
    ) {
      return createStructuredStyleResult('applyParagraphStyle', false, 'FORMAT_COMMAND_UNSUPPORTED', optionId)
    }
    performed = Boolean(chain.clearNodes().setHeading({ level: levelMap[optionId] }).run())
  }

  notifyFormattingStateChange()
  return createStructuredStyleResult(
    'applyParagraphStyle',
    performed,
    performed ? null : 'NO_OP',
    optionId,
  )
}

function runTiptapStructuredCharacterStyle(optionId) {
  if (!STRUCTURED_CHARACTER_STYLE_OPTIONS.has(optionId)) {
    return createStructuredStyleResult('applyCharacterStyle', false, 'UNSUPPORTED_STYLE_OPTION', optionId)
  }
  if (!currentEditorInstance || !currentEditorInstance.commands) {
    return createStructuredStyleResult('applyCharacterStyle', false, 'EDITOR_UNAVAILABLE', optionId)
  }

  const state = readFormattingState(currentEditorInstance)
  if (state.selectionEmpty) {
    return createStructuredStyleResult('applyCharacterStyle', false, 'NO_SELECTION', optionId)
  }

  let performed = false
  if (optionId === 'character-emphasis') {
    const chainPerformed = runFocusedChainCommand('toggleItalic')
    if (chainPerformed !== null) {
      performed = chainPerformed
    } else if (typeof currentEditorInstance.commands.toggleItalic !== 'function') {
      return createStructuredStyleResult('applyCharacterStyle', false, 'FORMAT_COMMAND_UNSUPPORTED', optionId)
    } else {
      performed = Boolean(currentEditorInstance.commands.toggleItalic())
    }
  } else {
    const chainPerformed = runFocusedChainCommand('toggleCode')
    if (chainPerformed !== null) {
      performed = chainPerformed
    } else if (typeof currentEditorInstance.commands.toggleCode !== 'function') {
      return createStructuredStyleResult('applyCharacterStyle', false, 'FORMAT_COMMAND_UNSUPPORTED', optionId)
    } else {
      performed = Boolean(currentEditorInstance.commands.toggleCode())
    }
  }

  notifyFormattingStateChange()
  return createStructuredStyleResult(
    'applyCharacterStyle',
    performed,
    performed ? null : 'NO_OP',
    optionId,
  )
}

export function applyTiptapParagraphStyle(optionId) {
  return runTiptapStructuredParagraphStyle(optionId)
}

export function applyTiptapCharacterStyle(optionId) {
  return runTiptapStructuredCharacterStyle(optionId)
}

function readFormattingState(editor) {
  if (!editor || typeof editor.isActive !== 'function') {
    return {
      bold: false,
      italic: false,
      underline: false,
      textColor: '',
      textColorActive: false,
      highlightColor: '',
      highlightActive: false,
      link: false,
      linkActive: false,
      linkHref: '',
      paragraphStyle: '',
      characterStyle: '',
      selectionEmpty: true,
      bulletList: false,
      orderedList: false,
    }
  }

  const linkActive = Boolean(editor.isActive('link'))
  const linkAttributes = typeof editor.getAttributes === 'function' ? editor.getAttributes('link') : null
  const textStyleAttributes = typeof editor.getAttributes === 'function' ? editor.getAttributes('textStyle') : null
  const highlightAttributes = typeof editor.getAttributes === 'function' ? editor.getAttributes('highlight') : null
  const selectionEmpty = Boolean(editor.state && editor.state.selection ? editor.state.selection.empty : true)
  const textColor = normalizeFormattingColor(textStyleAttributes && textStyleAttributes.color)
  const highlightColor = normalizeFormattingColor(highlightAttributes && highlightAttributes.color)
  const highlightActive = Boolean(editor.isActive('highlight'))

  return {
    bold: Boolean(editor.isActive('bold')),
    italic: Boolean(editor.isActive('italic')),
    underline: Boolean(editor.isActive('underline')),
    textColor,
    textColorActive: textColor.length > 0,
    highlightColor,
    highlightActive,
    link: linkActive,
    linkActive,
    linkHref: linkAttributes && typeof linkAttributes.href === 'string' ? linkAttributes.href : '',
    paragraphStyle: getStructuredParagraphStyleOption(editor),
    characterStyle: getStructuredCharacterStyleOption(editor),
    selectionEmpty,
    bulletList: Boolean(editor.isActive('bulletList')),
    orderedList: Boolean(editor.isActive('orderedList')),
  }
}

function notifyFormattingStateChange() {
  if (typeof currentFormattingStateHandler !== 'function') return
  currentFormattingStateHandler(readFormattingState(currentEditorInstance))
}

function getTiptapDocumentContentSize(editor) {
  const doc = editor && editor.state ? editor.state.doc : null
  return doc && doc.content ? Math.max(1, doc.content.size) : 1
}

function getTextOffsetForDocumentPosition(editor, position) {
  const doc = editor && editor.state ? editor.state.doc : null
  if (!doc || typeof doc.textBetween !== 'function') {
    return 0
  }
  const boundedPosition = Math.max(0, Math.min(Number(position) || 0, getTiptapDocumentContentSize(editor)))
  try {
    return doc.textBetween(0, boundedPosition, '\n', '\0').length
  } catch {
    return 0
  }
}

function getDocumentPositionForTextOffset(editor, offset) {
  const doc = editor && editor.state ? editor.state.doc : null
  if (!doc || typeof doc.descendants !== 'function') {
    return 1
  }

  const targetOffset = Math.max(0, Math.floor(Number(offset) || 0))
  let plainOffset = 0
  let sawTextblock = false
  let resolvedPosition = 1
  let matched = false

  doc.descendants((node, pos) => {
    if (!node || !node.isTextblock) {
      return undefined
    }

    const blockStart = pos + 1
    const blockText = typeof node.textContent === 'string' ? node.textContent : ''

    if (sawTextblock) {
      if (targetOffset === plainOffset) {
        resolvedPosition = blockStart
        matched = true
        return false
      }
      plainOffset += 1
      if (targetOffset < plainOffset) {
        resolvedPosition = blockStart
        matched = true
        return false
      }
    }

    sawTextblock = true

    if (targetOffset <= plainOffset + blockText.length) {
      resolvedPosition = blockStart + (targetOffset - plainOffset)
      matched = true
      return false
    }

    plainOffset += blockText.length
    resolvedPosition = blockStart + blockText.length
    return undefined
  })

  if (matched) {
    return resolvedPosition
  }
  return getTiptapDocumentContentSize(editor)
}

function runFocusedChainCommand(commandName, payload = undefined) {
  if (!currentEditorInstance || typeof currentEditorInstance.chain !== 'function') {
    return null
  }
  const chain = currentEditorInstance.chain().focus()
  if (!chain || typeof chain[commandName] !== 'function' || typeof chain.run !== 'function') {
    return null
  }
  const nextChain = payload === undefined ? chain[commandName]() : chain[commandName](payload)
  return Boolean(nextChain.run())
}

function createIpcSession(editor, options = {}) {
  const onContentParseIssue = typeof options.onContentParseIssue === 'function'
    ? options.onContentParseIssue
    : null
  const state = {
    metaEnabled: false,
    meta: createDefaultDocumentMeta(),
    cards: [],
    path: null,
    kind: null,
    title: '',
    applyingExternalPayload: false,
  }

  return {
    editor,
    readObservablePayload() {
      return composeObservablePayload({
        doc: readEditorDocument(editor),
        metaEnabled: state.metaEnabled,
        meta: state.meta,
        cards: state.cards,
      })
    },
    applyIncomingPayload(payload) {
      const hasObjectPayload = payload && typeof payload === 'object'
      const content = typeof payload === 'string'
        ? payload
        : hasObjectPayload && typeof payload.content === 'string'
          ? payload.content
          : ''

      const parsed = parseObservablePayload(content)
      if (parsed.issue && onContentParseIssue) {
        onContentParseIssue(parsed.issue)
      }
      state.metaEnabled = hasObjectPayload ? Boolean(payload.metaEnabled) : false
      state.meta = parsed.meta
      state.cards = parsed.cards
      state.path = hasObjectPayload && Object.prototype.hasOwnProperty.call(payload, 'path')
        ? payload.path || null
        : null
      state.kind = hasObjectPayload && Object.prototype.hasOwnProperty.call(payload, 'kind')
        ? payload.kind || null
        : null
      state.title = hasObjectPayload && typeof payload.title === 'string'
        ? payload.title
        : ''

      state.applyingExternalPayload = true
      try {
        editor.commands.setContent(parsed.doc || buildParagraphDocumentFromText(parsed.text || ''), false)
      } finally {
        state.applyingExternalPayload = false
      }

      notifyDirtyState(false)
    },
    handleUpdate() {
      if (state.applyingExternalPayload) return
      notifyDirtyState(true)
    },
  }
}

function destroyCurrentEditor() {
  if (!currentEditorInstance) return

  detachTiptapIpc(currentIpcSession)
  currentEditorInstance.destroy()
  currentEditorInstance = null
  currentIpcSession = null
  currentRuntimeBridge = null
  currentFormattingStateHandler = null
}

function ensureRuntimeListenersAttached() {
  if (!window.electronAPI) return

  if (!runtimeCommandListenerAttached && typeof window.electronAPI.onRuntimeCommand === 'function') {
    window.electronAPI.onRuntimeCommand((payload) => {
      currentRuntimeBridge?.handleRuntimeCommand(payload)
    })
    runtimeCommandListenerAttached = true
  }

  if (!recoveryRestoredListenerAttached && typeof window.electronAPI.onRecoveryRestored === 'function') {
    window.electronAPI.onRecoveryRestored((payload) => {
      currentRuntimeBridge?.handleRecoveryRestored(payload)
    })
    recoveryRestoredListenerAttached = true
  }
}

export function initTiptap(mountEl, options = {}) {
  if (!mountEl) throw new Error('TipTap mount element not found (#editor)')
  const attachIpc = options.attachIpc !== false
  const nextFormattingStateHandler = typeof options.onFormattingStateChange === 'function'
    ? options.onFormattingStateChange
    : null
  const editorAccessibilityAttributes = {
    'aria-label': mountEl.getAttribute('aria-label') || 'Текст сцены',
    'aria-multiline': mountEl.getAttribute('aria-multiline') || 'true',
    'data-bidi-policy': mountEl.getAttribute('data-bidi-policy') || 'plaintext',
    dir: mountEl.getAttribute('dir') || 'auto',
    role: 'textbox',
  }

  destroyCurrentEditor()
  currentFormattingStateHandler = nextFormattingStateHandler

  destroyCurrentEditor()

  // legacy editor раньше работал через textContent; TipTapу нужен контейнер
  mountEl.innerHTML = ''
  mountEl.classList.add('tiptap-host')
  mountEl.removeAttribute('contenteditable')
  mountEl.removeAttribute('role')
  mountEl.removeAttribute('aria-label')
  mountEl.removeAttribute('aria-multiline')
  mountEl.setAttribute('data-editor-surface', 'tiptap')

  const pageWrapEl = document.createElement('div')
  pageWrapEl.className = 'editor-page-wrap tiptap-page-wrap'

  const pageEl = document.createElement('div')
  pageEl.className = 'editor-page tiptap-page'

  const contentSurfaceEl = document.createElement('div')
  contentSurfaceEl.className = 'editor-page__content tiptap-page__content'

  const contentEl = document.createElement('div')
  contentEl.className = 'tiptap-editor'

  contentSurfaceEl.appendChild(contentEl)
  pageEl.appendChild(contentSurfaceEl)
  pageWrapEl.appendChild(pageEl)
  mountEl.appendChild(pageWrapEl)

  const editor = new Editor({
    element: contentEl,
    editorProps: {
      attributes: editorAccessibilityAttributes,
    },
    extensions: [
      StarterKit.configure({
        link: false,
        underline: false,
      }),
      TextStyle,
      Color,
      Highlight.configure({
        multicolor: true,
      }),
      Underline,
      Link.configure({
        autolink: false,
        linkOnPaste: false,
        openOnClick: false,
      }),
    ],
    content: '<p></p>',
    onUpdate: () => {
      currentIpcSession?.handleUpdate()
      notifyFormattingStateChange()
    },
    onSelectionUpdate: () => {
      notifyFormattingStateChange()
    },
  })

  currentIpcSession = attachIpc ? createIpcSession(editor, options) : null
  if (currentIpcSession) {
    attachTiptapIpc(currentIpcSession, {
      attachWindowListeners: options.attachWindowListeners === true,
    })
  }
  currentRuntimeBridge = createTiptapRuntimeBridge({
    editor,
    runtimeHandlers: options.runtimeHandlers || {},
    onRecoveryRestored: ({ message }) => {
      const statusElement = document.getElementById('status')
      if (statusElement) {
        statusElement.textContent = message
      }
    },
  })
  ensureRuntimeListenersAttached()
  currentEditorInstance = editor

  if (!unloadHookBound) {
    window.addEventListener('beforeunload', () => {
      destroyCurrentEditor()
    })
    unloadHookBound = true
  }

  return editor
}

export function destroyTiptap() {
  destroyCurrentEditor()
}
export function setTiptapRuntimeHandlers(runtimeHandlers = {}) {
  if (!currentRuntimeBridge || typeof currentRuntimeBridge.setRuntimeHandlers !== 'function') {
    return
  }

  currentRuntimeBridge.setRuntimeHandlers(runtimeHandlers)
}

export function setTiptapFormattingStateHandler(handler = null) {
  currentFormattingStateHandler = typeof handler === 'function' ? handler : null
  notifyFormattingStateChange()
}

export function focusTiptapSurface(position = 'current') {
  if (!currentEditorInstance) {
    return { performed: false, action: 'focus', reason: 'EDITOR_UNAVAILABLE', position }
  }

  const normalizedPosition = position === 'start' || position === 'end' ? position : null
  const focusCommand = currentEditorInstance.commands && typeof currentEditorInstance.commands.focus === 'function'
    ? currentEditorInstance.commands.focus
    : null
  if (!focusCommand) {
    return { performed: false, action: 'focus', reason: 'COMMAND_UNAVAILABLE', position }
  }

  const performed = normalizedPosition
    ? Boolean(focusCommand(normalizedPosition))
    : Boolean(focusCommand())
  notifyFormattingStateChange()
  return { performed, action: 'focus', reason: performed ? null : 'COMMAND_RETURNED_FALSE', position }
}

export function getTiptapSelectionOffsets() {
  if (!currentEditorInstance || !currentEditorInstance.state || !currentEditorInstance.state.selection) {
    return { start: 0, end: 0 }
  }

  const { from, to } = currentEditorInstance.state.selection
  const start = getTextOffsetForDocumentPosition(currentEditorInstance, Math.min(from, to))
  const end = getTextOffsetForDocumentPosition(currentEditorInstance, Math.max(from, to))
  return { start, end }
}

export function setTiptapSelectionOffsets(start = 0, end = start) {
  if (!currentEditorInstance || !currentEditorInstance.commands) {
    return { performed: false, action: 'setSelection', reason: 'EDITOR_UNAVAILABLE' }
  }

  const boundedStart = getDocumentPositionForTextOffset(currentEditorInstance, Math.min(start, end))
  const boundedEnd = getDocumentPositionForTextOffset(currentEditorInstance, Math.max(start, end))
  const chainResult = runFocusedChainCommand('setTextSelection', { from: boundedStart, to: boundedEnd })
  if (chainResult !== null) {
    notifyFormattingStateChange()
    return { performed: chainResult, action: 'setSelection', reason: chainResult ? null : 'COMMAND_RETURNED_FALSE' }
  }

  if (typeof currentEditorInstance.commands.setTextSelection !== 'function') {
    return { performed: false, action: 'setSelection', reason: 'COMMAND_UNAVAILABLE' }
  }

  const performed = Boolean(currentEditorInstance.commands.setTextSelection({ from: boundedStart, to: boundedEnd }))
  if (performed && typeof currentEditorInstance.commands.focus === 'function') {
    currentEditorInstance.commands.focus()
  }
  notifyFormattingStateChange()
  return { performed, action: 'setSelection', reason: performed ? null : 'COMMAND_RETURNED_FALSE' }
}

export function getTiptapPlainText() {
  return readEditorText(currentEditorInstance)
}

export function setTiptapPlainText(text = '') {
  if (!currentEditorInstance) return
  currentEditorInstance.commands.setContent(buildParagraphDocumentFromText(text), false)
  notifyFormattingStateChange()
}

export function getTiptapDocumentSnapshot() {
  return {
    doc: readEditorDocument(currentEditorInstance),
    text: readEditorText(currentEditorInstance),
  }
}

export function setTiptapDocumentSnapshot(snapshot = {}) {
  if (!currentEditorInstance) return
  const doc = snapshot && snapshot.doc && typeof snapshot.doc === 'object'
    ? snapshot.doc
    : buildParagraphDocumentFromText(snapshot && typeof snapshot.text === 'string' ? snapshot.text : '')
  currentEditorInstance.commands.setContent(doc, false)
  notifyFormattingStateChange()
}

export function getTiptapFormattingState() {
  return readFormattingState(currentEditorInstance)
}

export function runTiptapFormatCommand(commandName, commandPayload = undefined) {
  if (!currentEditorInstance || !currentEditorInstance.commands) {
    return { performed: false, action: commandName, reason: 'EDITOR_UNAVAILABLE' }
  }

  if (commandName === 'clearList') {
    const state = readFormattingState(currentEditorInstance)
    if (state.bulletList && typeof currentEditorInstance.commands.toggleBulletList === 'function') {
      const chainPerformed = runFocusedChainCommand('toggleBulletList')
      const performed = chainPerformed !== null
        ? chainPerformed
        : Boolean(currentEditorInstance.commands.toggleBulletList())
      notifyFormattingStateChange()
      return { performed, action: commandName, reason: performed ? null : 'COMMAND_RETURNED_FALSE' }
    }
    if (state.orderedList && typeof currentEditorInstance.commands.toggleOrderedList === 'function') {
      const chainPerformed = runFocusedChainCommand('toggleOrderedList')
      const performed = chainPerformed !== null
        ? chainPerformed
        : Boolean(currentEditorInstance.commands.toggleOrderedList())
      notifyFormattingStateChange()
      return { performed, action: commandName, reason: performed ? null : 'COMMAND_RETURNED_FALSE' }
    }
    return { performed: false, action: commandName, reason: 'LIST_NOT_ACTIVE' }
  }

  if (commandName === 'toggleUnderline') {
    const performed = runFocusedChainCommand('toggleUnderline')
    if (performed !== null) {
      notifyFormattingStateChange()
      return { performed, action: commandName, reason: performed ? null : 'COMMAND_RETURNED_FALSE' }
    }
    if (typeof currentEditorInstance.commands.toggleUnderline !== 'function') {
      return { performed: false, action: commandName, reason: 'FORMAT_COMMAND_UNSUPPORTED' }
    }
    const fallbackPerformed = Boolean(currentEditorInstance.commands.toggleUnderline())
    notifyFormattingStateChange()
    return { performed: fallbackPerformed, action: commandName, reason: fallbackPerformed ? null : 'COMMAND_RETURNED_FALSE' }
  }

  if (commandName === 'setColor') {
    const colorPayload = commandPayload && typeof commandPayload === 'object' && !Array.isArray(commandPayload)
      ? commandPayload
      : null
    const value = normalizeFormattingColor(colorPayload && colorPayload.value)
    if (!value) {
      return { performed: false, action: commandName, reason: 'COLOR_PAYLOAD_INVALID' }
    }
    const state = readFormattingState(currentEditorInstance)
    let chain = typeof currentEditorInstance.chain === 'function'
      ? currentEditorInstance.chain().focus()
      : null
    if (state.selectionEmpty && state.textColorActive && chain && typeof chain.extendMarkRange === 'function') {
      chain = chain.extendMarkRange('textStyle')
    }
    if (!chain && typeof currentEditorInstance.commands.setColor !== 'function') {
      return { performed: false, action: commandName, reason: 'FORMAT_COMMAND_UNSUPPORTED' }
    }
    const performed = chain && typeof chain.setColor === 'function' && typeof chain.run === 'function'
      ? Boolean(chain.setColor(value).run())
      : Boolean(currentEditorInstance.commands.setColor(value))
    notifyFormattingStateChange()
    return { performed, action: commandName, reason: performed ? null : 'COMMAND_RETURNED_FALSE' }
  }

  if (commandName === 'unsetColor') {
    const state = readFormattingState(currentEditorInstance)
    if (state.selectionEmpty && !state.textColorActive) {
      return { performed: false, action: commandName, reason: 'NO_OP' }
    }
    let chain = typeof currentEditorInstance.chain === 'function'
      ? currentEditorInstance.chain().focus()
      : null
    if (state.selectionEmpty && state.textColorActive && chain && typeof chain.extendMarkRange === 'function') {
      chain = chain.extendMarkRange('textStyle')
    }
    if (!chain && typeof currentEditorInstance.commands.unsetColor !== 'function') {
      return { performed: false, action: commandName, reason: 'FORMAT_COMMAND_UNSUPPORTED' }
    }
    const performed = chain && typeof chain.unsetColor === 'function' && typeof chain.run === 'function'
      ? Boolean(chain.unsetColor().run())
      : Boolean(currentEditorInstance.commands.unsetColor())
    notifyFormattingStateChange()
    return { performed, action: commandName, reason: performed ? null : 'COMMAND_RETURNED_FALSE' }
  }

  if (commandName === 'setHighlight') {
    const highlightPayload = commandPayload && typeof commandPayload === 'object' && !Array.isArray(commandPayload)
      ? commandPayload
      : null
    const value = normalizeFormattingColor(highlightPayload && highlightPayload.value)
    if (!value) {
      return { performed: false, action: commandName, reason: 'HIGHLIGHT_PAYLOAD_INVALID' }
    }
    const state = readFormattingState(currentEditorInstance)
    let chain = typeof currentEditorInstance.chain === 'function'
      ? currentEditorInstance.chain().focus()
      : null
    if (state.selectionEmpty && state.highlightActive && chain && typeof chain.extendMarkRange === 'function') {
      chain = chain.extendMarkRange('highlight')
    }
    if (!chain && typeof currentEditorInstance.commands.setHighlight !== 'function') {
      return { performed: false, action: commandName, reason: 'FORMAT_COMMAND_UNSUPPORTED' }
    }
    const performed = chain && typeof chain.setHighlight === 'function' && typeof chain.run === 'function'
      ? Boolean(chain.setHighlight({ color: value }).run())
      : Boolean(currentEditorInstance.commands.setHighlight({ color: value }))
    notifyFormattingStateChange()
    return { performed, action: commandName, reason: performed ? null : 'COMMAND_RETURNED_FALSE' }
  }

  if (commandName === 'unsetHighlight') {
    const state = readFormattingState(currentEditorInstance)
    if (state.selectionEmpty && !state.highlightActive) {
      return { performed: false, action: commandName, reason: 'NO_OP' }
    }
    let chain = typeof currentEditorInstance.chain === 'function'
      ? currentEditorInstance.chain().focus()
      : null
    if (state.selectionEmpty && state.highlightActive && chain && typeof chain.extendMarkRange === 'function') {
      chain = chain.extendMarkRange('highlight')
    }
    if (!chain && typeof currentEditorInstance.commands.unsetHighlight !== 'function') {
      return { performed: false, action: commandName, reason: 'FORMAT_COMMAND_UNSUPPORTED' }
    }
    const performed = chain && typeof chain.unsetHighlight === 'function' && typeof chain.run === 'function'
      ? Boolean(chain.unsetHighlight().run())
      : Boolean(currentEditorInstance.commands.unsetHighlight())
    notifyFormattingStateChange()
    return { performed, action: commandName, reason: performed ? null : 'COMMAND_RETURNED_FALSE' }
  }

  if (commandName === 'setLink') {
    const linkPayload = commandPayload && typeof commandPayload === 'object' && !Array.isArray(commandPayload)
      ? commandPayload
      : null
    if (!linkPayload || typeof linkPayload.href !== 'string' || linkPayload.href.length === 0) {
      return { performed: false, action: commandName, reason: 'LINK_PAYLOAD_INVALID' }
    }
    const href = linkPayload.href.trim()
    if (!href) {
      return { performed: false, action: commandName, reason: 'LINK_PAYLOAD_INVALID' }
    }
    const chain = typeof currentEditorInstance.chain === 'function'
      ? currentEditorInstance.chain().focus().extendMarkRange('link')
      : null
    if (!chain && typeof currentEditorInstance.commands.setLink !== 'function') {
      return { performed: false, action: commandName, reason: 'FORMAT_COMMAND_UNSUPPORTED' }
    }
    const performed = chain && typeof chain.setLink === 'function' && typeof chain.run === 'function'
      ? Boolean(chain.setLink({ href }).run())
      : Boolean(currentEditorInstance.commands.setLink({ href }))
    notifyFormattingStateChange()
    return { performed, action: commandName, reason: performed ? null : 'COMMAND_RETURNED_FALSE' }
  }

  if (commandName === 'unsetLink') {
    const chain = typeof currentEditorInstance.chain === 'function'
      ? currentEditorInstance.chain().focus().extendMarkRange('link')
      : null
    if (!chain && typeof currentEditorInstance.commands.unsetLink !== 'function') {
      return { performed: false, action: commandName, reason: 'FORMAT_COMMAND_UNSUPPORTED' }
    }
    const performed = chain && typeof chain.unsetLink === 'function' && typeof chain.run === 'function'
      ? Boolean(chain.unsetLink().run())
      : Boolean(currentEditorInstance.commands.unsetLink())
    notifyFormattingStateChange()
    return { performed, action: commandName, reason: performed ? null : 'COMMAND_RETURNED_FALSE' }
  }

  const commandMap = {
    toggleBold: () => runFocusedChainCommand('toggleBold'),
    toggleItalic: () => runFocusedChainCommand('toggleItalic'),
    toggleBulletList: () => runFocusedChainCommand('toggleBulletList'),
    toggleOrderedList: () => runFocusedChainCommand('toggleOrderedList'),
  }

  const command = commandMap[commandName]
  if (typeof command !== 'function') {
    return { performed: false, action: commandName, reason: 'FORMAT_COMMAND_UNSUPPORTED' }
  }

  const result = command()
  const performed = typeof result === 'boolean' ? result : Boolean(result)
  notifyFormattingStateChange()
  return { performed, action: commandName, reason: performed ? null : 'COMMAND_RETURNED_FALSE' }
}

export function undoTiptap() {
  if (!currentEditorInstance || !currentEditorInstance.commands || typeof currentEditorInstance.commands.undo !== 'function') {
    return { performed: false }
  }

  return { performed: Boolean(currentEditorInstance.commands.undo()) }
}

export function redoTiptap() {
  if (!currentEditorInstance || !currentEditorInstance.commands || typeof currentEditorInstance.commands.redo !== 'function') {
    return { performed: false }
  }

  return { performed: Boolean(currentEditorInstance.commands.redo()) }
}
