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
const mainContent = document.querySelector('.main-content');
const toolbar = document.querySelector('[data-toolbar]');
const wordCountElement = document.querySelector('[data-word-count]');
const zoomValueElement = document.querySelector('[data-zoom-value]');
const styleSelect = document.querySelector('[data-style-select]');
const fontSelect = document.querySelector('[data-font-select]');
const weightSelect = document.querySelector('[data-weight-select]');
const sizeSelect = document.querySelector('[data-size-select]');
const lineHeightSelect = document.querySelector('[data-line-height-select]');
const themeDarkButton = document.querySelector('[data-action="theme-dark"]');
const themeLightButton = document.querySelector('[data-action="theme-light"]');
const wrapToggleButton = document.querySelector('[data-action="toggle-wrap"]');
const toolbarToggleButton = document.querySelector('[data-action="minimize"]');
const TOOLBAR_COMPACT_CLASS = 'is-compact';
let activeSectionName = null;
const isMac = navigator.platform.toUpperCase().includes('MAC');
let currentFontSizePx = 16;
let lastSearchQuery = '';

function updateSectionSelection(targetName) {
  sectionButtons.forEach((button) => {
    const isActive = button.dataset.section === targetName;
    button.classList.toggle('selected', isActive);
  });
}

function showEditorPanelFor(section) {
  activeSectionName = section;
  if (editorTitle) {
    editorTitle.textContent = section;
  }
  editorPanel?.classList.add('active');
  mainContent?.classList.add('main-content--editor');
  emptyState?.classList.add('hidden');
  updateSectionSelection(section);
  try {
    localStorage.setItem('activeSection', section);
  } catch {}

  requestAnimationFrame(() => {
    if (mainContent) {
      mainContent.scrollTop = 0;
    }
    if (editor) {
      editor.scrollTop = 0;
      try {
        editor.focus({ preventScroll: true });
      } catch {
        editor.focus();
      }
    }
  });
}

function collapseSelection() {
  activeSectionName = null;
  editorPanel?.classList.remove('active');
  mainContent?.classList.remove('main-content--editor');
  emptyState?.classList.remove('hidden');
  updateSectionSelection(null);
  if (editor) {
    editor.value = '';
    updateWordCount();
  }
}

sectionButtons.forEach((button) => {
  button.addEventListener('click', async () => {
    const sectionName = button.dataset.section;
    if (sectionName) {
      if (window.electronAPI && typeof window.electronAPI.openSection === 'function') {
        try {
          const result = await window.electronAPI.openSection(sectionName);
          if (!result || result.ok === false) {
            if (result && result.cancelled) {
              return;
            }
            updateStatusText('Ошибка');
            return;
          }
        } catch {
          updateStatusText('Ошибка');
          return;
        }
      }
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

function updateWordCount() {
  if (!editor || !wordCountElement) return;
  const text = editor.value || '';
  const trimmed = text.trim();
  const count = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
  wordCountElement.textContent = `${count} words`;
}

function updateZoomValue() {
  if (!zoomValueElement) return;
  const percent = Math.round((currentFontSizePx / 16) * 100);
  zoomValueElement.textContent = `${percent}%`;
}

function setCurrentFontSize(px) {
  if (!Number.isFinite(px)) return;
  currentFontSizePx = px;
  if (sizeSelect) {
    sizeSelect.value = String(px);
  }
  updateZoomValue();
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

function applyFontWeight(weight, persist = true) {
  if (!editor) return;
  editor.style.fontWeight = String(weight);
  if (persist) {
    localStorage.setItem('editorFontWeight', String(weight));
  }
}

function applyLineHeight(value, persist = true) {
  if (!editor) return;
  editor.style.lineHeight = String(value);
  if (lineHeightSelect) {
    lineHeightSelect.value = String(value);
  }
  if (persist) {
    localStorage.setItem('editorLineHeight', String(value));
  }
}

function applyWordWrap(enabled, persist = true) {
  if (!editor) return;
  editor.wrap = enabled ? 'soft' : 'off';
  editor.style.whiteSpace = enabled ? 'pre-wrap' : 'pre';
  editor.style.overflowX = enabled ? 'hidden' : 'auto';
  if (wrapToggleButton) {
    wrapToggleButton.classList.toggle('is-active', enabled);
    wrapToggleButton.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  }
  if (persist) {
    localStorage.setItem('editorWordWrap', enabled ? 'on' : 'off');
  }
}

function applyViewMode(mode, persist = true) {
  const isFocus = mode === 'focus';
  document.body.classList.toggle('focus-mode', isFocus);
  if (styleSelect) {
    styleSelect.value = mode;
  }
  if (persist) {
    localStorage.setItem('editorViewMode', mode);
  }
}

function updateThemeSwatches(theme) {
  if (themeDarkButton) {
    themeDarkButton.classList.toggle('is-active', theme === 'dark');
  }
  if (themeLightButton) {
    themeLightButton.classList.toggle('is-active', theme === 'light');
  }
}

  function applyFont(fontFamily) {
    editor.style.fontFamily = fontFamily;
    localStorage.setItem('editorFont', fontFamily);
  }

function loadSavedFont() {
  const savedFont = localStorage.getItem('editorFont');
  const hasOption =
    fontSelect &&
    Array.from(fontSelect.options).some((option) => option.value === savedFont);

  if (savedFont && hasOption) {
    applyFont(savedFont);
    if (fontSelect) {
      fontSelect.value = savedFont;
    }
  } else if (fontSelect) {
    const fallbackFont = fontSelect.value;
    if (fallbackFont) {
      applyFont(fallbackFont);
      localStorage.setItem('editorFont', fallbackFont);
    }
  }
}

if (window.electronAPI) {
  window.electronAPI.onFontChanged((fontFamily) => {
    applyFont(fontFamily);
    if (fontSelect) {
      fontSelect.value = fontFamily;
    }
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
  updateThemeSwatches(theme);
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

function setToolbarCompactMode(isCompact) {
  if (!toolbar) return;
  toolbar.classList.toggle(TOOLBAR_COMPACT_CLASS, isCompact);
  if (toolbarToggleButton) {
    toolbarToggleButton.textContent = isCompact ? 'max' : 'min';
    toolbarToggleButton.setAttribute(
      'aria-label',
      isCompact ? 'Maximize toolbar' : 'Minimize toolbar'
    );
  }
}

function toggleToolbarCompactMode() {
  if (!toolbar) return;
  const nextState = !toolbar.classList.contains(TOOLBAR_COMPACT_CLASS);
  setToolbarCompactMode(nextState);
}

setToolbarCompactMode(false);

function handleFind() {
  if (!editor) return;
  const query = window.prompt('Find', lastSearchQuery);
  if (!query) return;
  const text = editor.value || '';
  const normalized = text.toLowerCase();
  const needle = query.toLowerCase();
  const startIndex = query === lastSearchQuery ? editor.selectionEnd : 0;
  let index = normalized.indexOf(needle, startIndex);

  if (index === -1 && startIndex > 0) {
    index = normalized.indexOf(needle, 0);
  }

  if (index === -1) {
    updateStatusText('Не найдено');
    return;
  }

  lastSearchQuery = query;
  editor.focus();
  editor.setSelectionRange(index, index + query.length);
}

if (toolbar) {
  toolbar.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;

    switch (action) {
      case 'save-as':
        window.electronAPI?.saveAs();
        break;
      case 'search':
        handleFind();
        break;
      case 'new':
        window.electronAPI?.newFile();
        break;
      case 'clear':
        if (editor) {
          editor.value = '';
          markAsModified();
          updateWordCount();
        }
        break;
      case 'open':
        window.electronAPI?.openFile();
        break;
      case 'save':
        window.electronAPI?.saveFile();
        break;
      case 'theme-dark':
        window.electronAPI?.setTheme('dark');
        break;
      case 'theme-light':
        window.electronAPI?.setTheme('light');
        break;
      case 'toggle-wrap': {
        const isWrapped = editor && editor.wrap !== 'off';
        applyWordWrap(!isWrapped);
        break;
      }
      case 'zoom-out':
        window.electronAPI?.changeFontSize('decrease');
        break;
      case 'zoom-in':
        window.electronAPI?.changeFontSize('increase');
        break;
      case 'minimize':
        toggleToolbarCompactMode();
        break;
      default:
        break;
    }
  });
}

if (styleSelect) {
  styleSelect.addEventListener('change', (event) => {
    applyViewMode(event.target.value);
  });
}

if (fontSelect) {
  fontSelect.addEventListener('change', (event) => {
    window.electronAPI?.setFont(event.target.value);
  });
}

if (weightSelect) {
  weightSelect.addEventListener('change', (event) => {
    applyFontWeight(event.target.value);
  });
}

if (sizeSelect) {
  sizeSelect.addEventListener('change', (event) => {
    const nextSize = Number(event.target.value);
    if (Number.isFinite(nextSize)) {
      window.electronAPI?.setFontSizePx(nextSize);
    }
  });
}

if (lineHeightSelect) {
  lineHeightSelect.addEventListener('change', (event) => {
    applyLineHeight(event.target.value);
  });
}

function loadSavedViewMode() {
  const saved = localStorage.getItem('editorViewMode') || 'default';
  applyViewMode(saved, false);
}

function loadSavedFontWeight() {
  const saved = localStorage.getItem('editorFontWeight');
  if (saved) {
    applyFontWeight(saved, false);
    if (weightSelect) {
      weightSelect.value = saved;
    }
  } else {
    applyFontWeight('400', false);
    if (weightSelect) {
      weightSelect.value = '400';
    }
  }
}

function loadSavedLineHeight() {
  const saved = localStorage.getItem('editorLineHeight');
  if (saved) {
    applyLineHeight(saved, false);
  } else {
    applyLineHeight('1.625', false);
  }
}

function loadSavedWordWrap() {
  const saved = localStorage.getItem('editorWordWrap');
  const enabled = saved !== 'off';
  applyWordWrap(enabled, false);
}

loadSavedViewMode();
loadSavedFontWeight();
loadSavedLineHeight();
loadSavedWordWrap();

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
    updateWordCount();

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
      setCurrentFontSize(px);
    }
  });
}

editor.addEventListener('input', () => {
  markAsModified();
  updateWordCount();
});

if (window.electronAPI) {
  window.electronAPI.onStatusUpdate((status) => {
    updateStatusText(status);
  });

  window.electronAPI.onSetDirty((state) => {
    localDirty = state;
  });
}

setCurrentFontSize(currentFontSizePx);
updateWordCount();
