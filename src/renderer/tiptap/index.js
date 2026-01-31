import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { attachTiptapIpc } from './ipc.js'

export function initTiptap(mountEl) {
  if (!mountEl) throw new Error('TipTap mount element not found (#editor)')

  // legacy editor раньше работал через textContent; TipTapу нужен контейнер
  mountEl.innerHTML = ''
  mountEl.classList.add('tiptap-host')

  const contentEl = document.createElement('div')
  contentEl.className = 'tiptap-editor'
  mountEl.appendChild(contentEl)

  const editor = new Editor({
    element: contentEl,
    extensions: [StarterKit],
    content: '<p></p>',
  })
  attachTiptapIpc(editor)

  return editor
}
