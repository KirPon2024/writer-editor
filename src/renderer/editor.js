const editor = document.getElementById('editor');
const statusElement = document.getElementById('status');

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
