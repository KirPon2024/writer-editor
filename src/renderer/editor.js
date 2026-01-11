const editor = document.getElementById('editor');
const statusElement = document.getElementById('status');

// Применение шрифта к редактору
function applyFont(fontFamily) {
  editor.style.fontFamily = fontFamily;
  localStorage.setItem('editorFont', fontFamily);
}

// Загрузка сохранённого шрифта при запуске
function loadSavedFont() {
  const savedFont = localStorage.getItem('editorFont');
  if (savedFont) {
    applyFont(savedFont);
  }
}

// Обработчик изменения шрифта из меню
if (window.electronAPI) {
  window.electronAPI.onFontChanged((fontFamily) => {
    applyFont(fontFamily);
  });
}

// Применение сохранённого шрифта при загрузке
loadSavedFont();

// Применение темы
function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark-theme');
  } else {
    document.body.classList.remove('dark-theme');
  }
  localStorage.setItem('editorTheme', theme);
}

// Загрузка сохранённой темы при запуске
function loadSavedTheme() {
  const savedTheme = localStorage.getItem('editorTheme') || 'light';
  applyTheme(savedTheme);
}

// Обработчик изменения темы из меню
if (window.electronAPI) {
  window.electronAPI.onThemeChanged((theme) => {
    applyTheme(theme);
  });
}

// Применение сохранённой темы при загрузке
loadSavedTheme();

// Базовый обработчик изменений (для будущей реализации автосохранения)
editor.addEventListener('input', () => {
  // TODO: реализация автосохранения
});
