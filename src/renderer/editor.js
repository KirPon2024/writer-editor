const editor = document.getElementById('editor');
const statusElement = document.getElementById('status');
const sectionButtons = Array.from(document.querySelectorAll('.section-item'));
const emptyState = document.querySelector('.empty-state');
const editorPanel = document.querySelector('.editor-panel');
const editorTitle = document.querySelector('.editor-panel__title');
const projectToggle = document.querySelector('[data-project-toggle]');
const sectionList = document.querySelector('[data-section-list]');
const sidebar = document.querySelector('.sidebar');
const sidebarResizer = document.querySelector('[data-sidebar-resizer]');
let activeSectionName = null;
const isMac = navigator.platform.toUpperCase().includes('MAC');

function updateSectionSelection(targetName) {
  sectionButtons.forEach((button) => {
    const isActive = button.dataset.section === targetName;
    button.classList.toggle('selected', isActive);
  });
}

function showEditorPanelFor(section) {
  activeSectionName = section;
  if (editor) {
    editor.focus();
  }
  if (editorTitle) {
    editorTitle.textContent = section;
  }
  editorPanel?.classList.add('active');
  emptyState?.classList.add('hidden');
  updateSectionSelection(section);
  try {
    localStorage.setItem('activeSection', section);
  } catch {}
}

function collapseSelection() {
  activeSectionName = null;
  editorPanel?.classList.remove('active');
  emptyState?.classList.remove('hidden');
  updateSectionSelection(null);
  if (editor) {
    editor.value = '';
  }
}

sectionButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const sectionName = button.dataset.section;
    if (sectionName) {
      showEditorPanelFor(sectionName);
    }
  });
});

if (projectToggle && sectionList) {
  projectToggle.classList.add('is-expanded');
  projectToggle.addEventListener('click', () => {
    const expanded = sectionList.classList.toggle('is-expanded');
    projectToggle.classList.toggle('is-expanded', expanded);
  });
}

if (sidebar && sidebarResizer) {
  const MIN_WIDTH = 200;
  const MAX_WIDTH = 600;
  let dragStartX = null;
  let dragStartWidth = null;

  function onMove(event) {
    if (dragStartX === null || dragStartWidth === null) return;
    const delta = event.clientX - dragStartX;
    const nextWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, dragStartWidth + delta));
    sidebar.style.width = `${nextWidth}px`;
  }

  function stop() {
    dragStartX = null;
    dragStartWidth = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', stop);
  }

  sidebarResizer.addEventListener('pointerdown', (event) => {
    dragStartX = event.clientX;
    dragStartWidth = sidebar.getBoundingClientRect().width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop);
  });
}

let localDirty = false;

function updateStatusText(text) {
  if (statusElement && text) {
    statusElement.textContent = text;
  }
}

function markAsModified() {
  if (!localDirty) {
    localDirty = true;
    if (window.electronAPI && window.electronAPI.notifyDirtyState) {
      window.electronAPI.notifyDirtyState(true);
    }
  }

  updateStatusText('Изменено');
}

  function applyFont(fontFamily) {
    editor.style.fontFamily = fontFamily;
    localStorage.setItem('editorFont', fontFamily);
  }

function loadSavedFont() {
  const savedFont = localStorage.getItem('editorFont');
  if (savedFont) {
    applyFont(savedFont);
  }
}

if (window.electronAPI) {
  window.electronAPI.onFontChanged((fontFamily) => {
    applyFont(fontFamily);
  });
}

loadSavedFont();

function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark-theme');
  } else {
    document.body.classList.remove('dark-theme');
  }
  localStorage.setItem('editorTheme', theme);
}

function loadSavedTheme() {
  const savedTheme = localStorage.getItem('editorTheme') || 'light';
  applyTheme(savedTheme);
}

if (window.electronAPI) {
  window.electronAPI.onThemeChanged((theme) => {
    applyTheme(theme);
  });
}

loadSavedTheme();

function handleSelectAllShortcut(event) {
  const isCmdOrCtrl = isMac ? event.metaKey : event.ctrlKey;
  const isSelectAll = isCmdOrCtrl && !event.shiftKey && !event.altKey && event.key && event.key.toLowerCase() === 'a';

  if (!isSelectAll || !editor) {
    return;
  }

  event.preventDefault();
  editor.focus();
  editor.select();
}

document.addEventListener('keydown', handleSelectAllShortcut);

// Ensure a previously loaded document is visible even before selecting a section.
if (editor && editor.value && !activeSectionName) {
  const preferred =
    (typeof localStorage !== 'undefined' && localStorage.getItem('activeSection')) ||
    'Главы';
  showEditorPanelFor(preferred);
}

if (window.electronAPI) {
  window.electronAPI.onEditorSetText((text) => {
    editor.value = text || '';
    localDirty = false;

    const hasContent = typeof text === 'string' && text.length > 0;
    if (hasContent && !activeSectionName) {
      const preferred =
        (typeof localStorage !== 'undefined' && localStorage.getItem('activeSection')) ||
        'Главы';
      showEditorPanelFor(preferred);
    }
  });

  window.electronAPI.onEditorTextRequest(({ requestId }) => {
    window.electronAPI.sendEditorTextResponse(requestId, editor.value);
  });

  window.electronAPI.onEditorSetFontSize(({ px }) => {
    if (Number.isFinite(px)) {
      editor.style.fontSize = `${px}px`;
    }
  });
}

editor.addEventListener('input', () => {
  markAsModified();
});

if (window.electronAPI) {
  window.electronAPI.onStatusUpdate((status) => {
    updateStatusText(status);
  });

  window.electronAPI.onSetDirty((state) => {
    localDirty = state;
  });
}
