const editor = document.getElementById('editor');
const statusElement = document.getElementById('status');
const emptyState = document.querySelector('.empty-state');
const editorPanel = document.querySelector('.editor-panel');
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
const textStyleSelect = document.querySelector('[data-text-style-select]');
const themeDarkButton = document.querySelector('[data-action="theme-dark"]');
const themeLightButton = document.querySelector('[data-action="theme-light"]');
const wrapToggleButton = document.querySelector('[data-action="toggle-wrap"]');
const toolbarToggleButton = document.querySelector('[data-action="minimize"]');
const alignButtons = Array.from(document.querySelectorAll('[data-action^="align-"]'));
const treeContainer = document.querySelector('[data-tree]');
const metaPanel = document.querySelector('[data-meta-panel]');
const metaSynopsis = document.querySelector('[data-meta-synopsis]');
const metaStatus = document.querySelector('[data-meta-status]');
const metaTagPov = document.querySelector('[data-meta-tag="pov"]');
const metaTagLine = document.querySelector('[data-meta-tag="line"]');
const metaTagPlace = document.querySelector('[data-meta-tag="place"]');
const cardsList = document.querySelector('[data-cards-list]');
const addCardButton = document.querySelector('[data-action="add-card"]');
const contextMenu = document.querySelector('[data-context-menu]');
const cardModal = document.querySelector('[data-card-modal]');
const cardTitleInput = document.querySelector('[data-card-title]');
const cardTextInput = document.querySelector('[data-card-text]');
const cardTagsInput = document.querySelector('[data-card-tags]');
const cardSaveButtons = Array.from(document.querySelectorAll('[data-card-save]'));
const cardCancelButtons = Array.from(document.querySelectorAll('[data-card-cancel]'));
const TOOLBAR_COMPACT_CLASS = 'is-compact';
const TEXT_STYLE_DEFAULT = 'paragraph-none';
const ALIGNMENT_PREFIX_BY_ACTION = {
  'align-center': '::center:: ',
  'align-right': '::right:: ',
  'align-justify': '::justify:: ',
  'align-left': '',
};
const ALIGNMENT_MARKERS = ['::center:: ', '::right:: ', '::justify:: '];
const EDITOR_ZOOM_STORAGE_KEY = 'editorZoom';
const EDITOR_ZOOM_MIN = 0.5;
const EDITOR_ZOOM_MAX = 2.0;
const EDITOR_ZOOM_STEP = 0.05;
const EDITOR_ZOOM_DEFAULT = 1.0;
let editorZoom = EDITOR_ZOOM_DEFAULT;
const isMac = navigator.platform.toUpperCase().includes('MAC');
let currentFontSizePx = 16;
let wordWrapEnabled = true;
let lastSearchQuery = '';
let plainTextBuffer = '';
const activeTab = 'roman';
let currentDocumentPath = null;
let currentDocumentKind = null;
let metaEnabled = false;
let currentCards = [];
let currentMeta = {
  synopsis: '',
  status: 'черновик',
  tags: { pov: '', line: '', place: '' }
};
let expandedNodesByTab = new Map();
let autoSaveTimerId = null;
const AUTO_SAVE_DELAY = 600;

const PX_PER_MM_AT_ZOOM_1 = 96 / 25.4;
const ZOOM_DEFAULT = 1.0;
const PAGE_GAP_MM = 30;
const CANVAS_PADDING_PX = 48;
const MARGIN_MM = 25.4;
const PAGE_FORMATS = {
  A4: 210,
  A5: 148,
  A6: 105
};

function mmToPx(mm, zoom = ZOOM_DEFAULT) {
  return mm * PX_PER_MM_AT_ZOOM_1 * zoom;
}

function getPageMetrics({ pageWidthMm, zoom = ZOOM_DEFAULT }) {
  const pageHeightMm = pageWidthMm * Math.SQRT2;
  const marginPx = mmToPx(MARGIN_MM, zoom);
  return {
    pageWidthPx: mmToPx(pageWidthMm, zoom),
    pageHeightPx: mmToPx(pageHeightMm, zoom),
    marginTopPx: marginPx,
    marginRightPx: marginPx,
    marginBottomPx: marginPx,
    marginLeftPx: marginPx,
    pageGapPx: mmToPx(PAGE_GAP_MM, zoom),
    canvasPaddingPx: CANVAS_PADDING_PX,
    pageHeightMm
  };
}

function applyPageViewCssVars(metrics) {
  const root = document.documentElement;
  root.style.setProperty('--page-width-px', `${Math.round(metrics.pageWidthPx)}px`);
  root.style.setProperty('--page-height-px', `${Math.round(metrics.pageHeightPx)}px`);
  root.style.setProperty('--page-gap-px', `${Math.round(metrics.pageGapPx)}px`);
  root.style.setProperty('--page-margin-top-px', `${Math.round(metrics.marginTopPx)}px`);
  root.style.setProperty('--page-margin-right-px', `${Math.round(metrics.marginRightPx)}px`);
  root.style.setProperty('--page-margin-bottom-px', `${Math.round(metrics.marginBottomPx)}px`);
  root.style.setProperty('--page-margin-left-px', `${Math.round(metrics.marginLeftPx)}px`);
  root.style.setProperty('--canvas-padding-px', `${metrics.canvasPaddingPx}px`);
}

function getFormatLabel(pageWidthMm) {
  const height = Math.round(pageWidthMm * Math.SQRT2);
  const formatName = Object.keys(PAGE_FORMATS).find((key) => PAGE_FORMATS[key] === pageWidthMm) || 'Custom';
  return `${formatName} · ${pageWidthMm}×${height} мм`;
}

const initialPageWidthMm = PAGE_FORMATS.A4;
const initialPageMetrics = getPageMetrics({ pageWidthMm: initialPageWidthMm, zoom: ZOOM_DEFAULT });
applyPageViewCssVars(initialPageMetrics);
if (editorPanel) {
  editorPanel.setAttribute('data-format-label', getFormatLabel(initialPageWidthMm));
}

function getPlainText() {
  return plainTextBuffer;
}

function setPlainText(text = '') {
  plainTextBuffer = text;
  renderStyledView(text);
}

function parseIndentedValue(lines, startIndex) {
  const valueLines = [];
  const firstLine = lines[startIndex];
  const rawValue = firstLine.split(':').slice(1).join(':').trim();
  valueLines.push(rawValue);
  let index = startIndex + 1;
  while (index < lines.length) {
    const line = lines[index];
    if (/^[a-zA-Zа-яА-ЯёЁ]+\s*:/.test(line)) {
      break;
    }
    if (line.startsWith('  ') || line.startsWith('\t')) {
      valueLines.push(line.trim());
    }
    index += 1;
  }
  return { value: valueLines.join('\n').trim(), nextIndex: index };
}

function parseTagsValue(value) {
  const tags = { pov: '', line: '', place: '' };
  value.split(';').forEach((chunk) => {
    const [rawKey, ...rest] = chunk.split('=');
    const key = (rawKey || '').trim().toLowerCase();
    const val = rest.join('=').trim();
    if (key === 'pov') tags.pov = val;
    if (key === 'линия') tags.line = val;
    if (key === 'место') tags.place = val;
  });
  return tags;
}

function parseMetaBlock(block) {
  const meta = {
    synopsis: '',
    status: 'черновик',
    tags: { pov: '', line: '', place: '' }
  };
  const body = block.replace(/\[\/?meta\]/gi, '').trim();
  const lines = body.split('\n');
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (line.toLowerCase().startsWith('status:')) {
      meta.status = line.split(':').slice(1).join(':').trim() || meta.status;
      index += 1;
      continue;
    }
    if (line.toLowerCase().startsWith('tags:')) {
      const value = line.split(':').slice(1).join(':').trim();
      meta.tags = parseTagsValue(value);
      index += 1;
      continue;
    }
    if (line.toLowerCase().startsWith('synopsis:')) {
      const parsed = parseIndentedValue(lines, index);
      meta.synopsis = parsed.value;
      index = parsed.nextIndex;
      continue;
    }
    index += 1;
  }
  return meta;
}

function parseCardBlock(block) {
  const card = { title: '', text: '', tags: '' };
  const body = block.replace(/\[\/?card\]/gi, '').trim();
  const lines = body.split('\n');
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (line.toLowerCase().startsWith('title:')) {
      card.title = line.split(':').slice(1).join(':').trim();
      index += 1;
      continue;
    }
    if (line.toLowerCase().startsWith('tags:')) {
      card.tags = line.split(':').slice(1).join(':').trim();
      index += 1;
      continue;
    }
    if (line.toLowerCase().startsWith('text:')) {
      const parsed = parseIndentedValue(lines, index);
      card.text = parsed.value;
      index = parsed.nextIndex;
      continue;
    }
    index += 1;
  }
  return card;
}

function parseCardsBlock(block) {
  const cards = [];
  const body = block.replace(/\[\/?cards\]/gi, '').trim();
  const regex = /\[card\][\s\S]*?\[\/card\]/gi;
  let match = regex.exec(body);
  while (match) {
    cards.push(parseCardBlock(match[0]));
    match = regex.exec(body);
  }
  return cards;
}

function parseDocumentContent(rawText = '') {
  let content = String(rawText || '');
  let meta = { synopsis: '', status: 'черновик', tags: { pov: '', line: '', place: '' } };
  let cards = [];

  const metaMatch = content.match(/\[meta\][\s\S]*?\[\/meta\]/i);
  if (metaMatch) {
    meta = parseMetaBlock(metaMatch[0]);
    content = content.replace(metaMatch[0], '');
  }

  const cardsMatch = content.match(/\[cards\][\s\S]*?\[\/cards\]/i);
  if (cardsMatch) {
    cards = parseCardsBlock(cardsMatch[0]);
    content = content.replace(cardsMatch[0], '');
  }

  content = content.replace(/\n{3,}/g, '\n\n');
  content = content.replace(/^\n+/, '');
  content = content.replace(/\n+$/, '');

  return { text: content, meta, cards };
}

function composeMetaBlock(meta) {
  if (!metaEnabled) return '';
  const lines = ['[meta]'];
  const status = meta.status || 'черновик';
  const tags = `POV=${meta.tags.pov || ''}; линия=${meta.tags.line || ''}; место=${meta.tags.place || ''}`;
  lines.push(`status: ${status}`);
  lines.push(`tags: ${tags}`);
  const synopsisLines = String(meta.synopsis || '').split('\n');
  if (synopsisLines.length) {
    lines.push(`synopsis: ${synopsisLines[0] || ''}`);
    for (let i = 1; i < synopsisLines.length; i += 1) {
      lines.push(`  ${synopsisLines[i]}`);
    }
  } else {
    lines.push('synopsis:');
  }
  lines.push('[/meta]');
  return lines.join('\n');
}

function composeCardsBlock(cards) {
  if (!cards || !cards.length) return '';
  const lines = ['[cards]'];
  cards.forEach((card) => {
    lines.push('[card]');
    lines.push(`title: ${card.title || ''}`);
    const textLines = String(card.text || '').split('\n');
    lines.push(`text: ${textLines[0] || ''}`);
    for (let i = 1; i < textLines.length; i += 1) {
      lines.push(`  ${textLines[i]}`);
    }
    lines.push(`tags: ${card.tags || ''}`);
    lines.push('[/card]');
  });
  lines.push('[/cards]');
  return lines.join('\n');
}

function composeDocumentContent() {
  const parts = [];
  const metaBlock = composeMetaBlock(currentMeta);
  if (metaBlock) {
    parts.push(metaBlock);
  }
  parts.push(getPlainText());
  const cardsBlock = composeCardsBlock(currentCards);
  if (cardsBlock) {
    parts.push(cardsBlock);
  }
  return parts.filter(Boolean).join('\n\n');
}

function getSelectionOffsets() {
  if (!editor) return { start: 0, end: 0 };
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return { start: 0, end: 0 };
  }
  const range = selection.getRangeAt(0);
  const normalizePosition = (node, offset) => {
    const boundaryRange = document.createRange();
    boundaryRange.setStart(editor, 0);
    boundaryRange.setEnd(node, offset);
    return boundaryRange.toString().length;
  };
  if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
    return { start: 0, end: 0 };
  }
  const startOffset = normalizePosition(range.startContainer, range.startOffset);
  const endOffset = normalizePosition(range.endContainer, range.endOffset);
  return {
    start: Math.min(startOffset, endOffset),
    end: Math.max(startOffset, endOffset),
  };
}

function getNodeForOffset(offset) {
  if (!editor) return { node: editor || document.body, offset: 0 };
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null);
  let accumulated = 0;
  let currentNode = walker.nextNode();
  while (currentNode) {
    const length = currentNode.textContent?.length || 0;
    if (offset <= accumulated + length) {
      return { node: currentNode, offset: Math.max(0, offset - accumulated) };
    }
    accumulated += length;
    currentNode = walker.nextNode();
  }
  return { node: editor, offset: editor.childNodes.length };
}

function setSelectionRange(start, end) {
  if (!editor) return;
  const text = getPlainText();
  const normalizedStart = Math.max(0, Math.min(start, text.length));
  const normalizedEnd = Math.max(0, Math.min(end, text.length));
  const startPosition = getNodeForOffset(normalizedStart);
  const endPosition = getNodeForOffset(normalizedEnd);
  const range = document.createRange();
  range.setStart(startPosition.node, startPosition.offset);
  range.setEnd(endPosition.node, endPosition.offset);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function selectAllEditor() {
  const length = getPlainText().length;
  setSelectionRange(0, length);
}

function renderStyledView(text = '') {
  if (!editor) return;
  const { start, end } = getSelectionOffsets();
  if (!text) {
    editor.innerHTML = '';
    createEmptyPage();
    setSelectionRange(0, 0);
    return;
  }

  const nodes = [];
  const lines = text.split('\n');
  let inCodeBlock = false;

  const createLineElement = (styleClass, markerText, contentText) => {
    const lineEl = document.createElement('div');
    lineEl.classList.add('editor-line', styleClass);
    if (markerText) {
      const marker = document.createElement('span');
      marker.classList.add('marker');
      marker.textContent = markerText;
      lineEl.appendChild(marker);
    }
    const content = document.createElement('span');
    content.classList.add('content');
    content.textContent = contentText;
    lineEl.appendChild(content);
    return lineEl;
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === '```') {
      nodes.push(createLineElement('line--code-fence', '```', ''));
      inCodeBlock = !inCodeBlock;
    } else if (inCodeBlock) {
      nodes.push(createLineElement('line--codeblock', '', line));
    } else {
      const { styleClass, marker, content } = parseParagraphLine(line);
      nodes.push(createLineElement(styleClass, marker, content));
    }

    if (index < lines.length - 1) {
      nodes.push(document.createTextNode('\n'));
    }
  });

  editor.innerHTML = '';
  paginateNodes(nodes);
  setSelectionRange(start, end);
}

function getPageFormatLabelText() {
  return (editorPanel?.getAttribute('data-format-label') || '').trim();
}

function createPageElement(isFirstPage = false) {
  const wrapper = document.createElement('div');
  wrapper.classList.add('editor-page-wrap');

  if (isFirstPage) {
    const labelText = getPageFormatLabelText();
    if (labelText) {
      const label = document.createElement('div');
      label.classList.add('editor-page__label');
      label.textContent = labelText;
      wrapper.appendChild(label);
    }
  }

  const page = document.createElement('div');
  page.classList.add('editor-page');
  const content = document.createElement('div');
  content.classList.add('editor-page__content');
  page.appendChild(content);
  wrapper.appendChild(page);
  return wrapper;
}

function createEmptyPage() {
  if (!editor) return;
  editor.innerHTML = '';
  const page = createPageElement(true);
  editor.appendChild(page);
}

function paginateNodes(nodes) {
  if (!editor) return;
  if (!nodes.length) {
    createEmptyPage();
    return;
  }

  let currentPage = createPageElement(true);
  editor.appendChild(currentPage);
  let currentContent = currentPage.querySelector('.editor-page__content');

  const appendNode = (node) => {
    currentContent.appendChild(node);
    const limit = currentContent.clientHeight;
    if (limit > 0 && currentContent.scrollHeight > limit) {
      currentContent.removeChild(node);
      currentPage = createPageElement();
      editor.appendChild(currentPage);
      currentContent = currentPage.querySelector('.editor-page__content');
      currentContent.appendChild(node);
    }
  };

  nodes.forEach(appendNode);
}

let layoutRefreshScheduled = false;
function scheduleLayoutRefresh() {
  if (layoutRefreshScheduled) {
    return;
  }
  layoutRefreshScheduled = true;
  window.requestAnimationFrame(() => {
    layoutRefreshScheduled = false;
    renderStyledView(getPlainText());
  });
}

function parseParagraphLine(line) {
  const patternMatchers = [
    { prefix: '::caption:: ', className: 'line--caption' },
    { prefix: '::center:: ', className: 'line--centered' },
    { prefix: '::right:: ', className: 'line--align-right' },
    { prefix: '::justify:: ', className: 'line--align-justify' },
    { prefix: '::verse:: ', className: 'line--verse' },
    { prefix: '— ', className: 'line--attribution' },
    { prefix: '### ', className: 'line--heading2' },
    { prefix: '## ', className: 'line--heading1' },
    { prefix: '# ', className: 'line--title' },
    { prefix: '> ', className: 'line--blockquote' },
  ];

  for (const matcher of patternMatchers) {
    if (line.startsWith(matcher.prefix)) {
      return {
        styleClass: matcher.className,
        marker: matcher.prefix,
        content: line.slice(matcher.prefix.length),
      };
    }
  }

  return {
    styleClass: 'line--paragraph',
    marker: '',
    content: line,
  };
}

function positionCaretForCurrentText() {
  if (!editor) return;
  const textLength = Math.max(0, (getPlainText() || '').length);
  setSelectionRange(textLength, textLength);
}

function showEditorPanelFor(title) {
  editorPanel?.classList.add('active');
  mainContent?.classList.add('main-content--editor');
  emptyState?.classList.add('hidden');
  updateMetaVisibility();
  try {
    if (title) {
      localStorage.setItem('activeDocumentTitle', title);
    }
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
      positionCaretForCurrentText();
    }
  });
}

function collapseSelection() {
  editorPanel?.classList.remove('active');
  mainContent?.classList.remove('main-content--editor');
  emptyState?.classList.remove('hidden');
  metaPanel?.classList.add('is-hidden');
  metaEnabled = false;
  currentMeta = { synopsis: '', status: 'черновик', tags: { pov: '', line: '', place: '' } };
  currentCards = [];
  updateCardsList();
  if (editor) {
    setPlainText('');
    updateWordCount();
  }
}

function updateMetaInputs() {
  if (!metaSynopsis || !metaStatus || !metaTagPov || !metaTagLine || !metaTagPlace) return;
  metaSynopsis.value = currentMeta.synopsis || '';
  metaStatus.value = currentMeta.status || 'черновик';
  metaTagPov.value = currentMeta.tags.pov || '';
  metaTagLine.value = currentMeta.tags.line || '';
  metaTagPlace.value = currentMeta.tags.place || '';
}

function syncMetaFromInputs() {
  if (!metaSynopsis || !metaStatus || !metaTagPov || !metaTagLine || !metaTagPlace) return;
  currentMeta = {
    synopsis: metaSynopsis.value || '',
    status: metaStatus.value || 'черновик',
    tags: {
      pov: metaTagPov.value || '',
      line: metaTagLine.value || '',
      place: metaTagPlace.value || ''
    }
  };
}

function updateMetaVisibility() {
  if (!metaPanel) return;
  metaPanel.classList.toggle('is-hidden', !metaEnabled);
}

function updateCardsList() {
  if (!cardsList) return;
  cardsList.innerHTML = '';
  if (!currentCards.length) {
    const empty = document.createElement('div');
    empty.className = 'tree__empty';
    empty.textContent = 'Карточек пока нет';
    cardsList.appendChild(empty);
    return;
  }
  currentCards.forEach((card) => {
    const item = document.createElement('div');
    item.className = 'card-item';
    const title = document.createElement('div');
    title.className = 'card-item__title';
    title.textContent = card.title || 'Без названия';
    const text = document.createElement('div');
    text.className = 'card-item__text';
    text.textContent = card.text || '';
    item.appendChild(title);
    item.appendChild(text);
    cardsList.appendChild(item);
  });
}

function getExpandedSet(tab) {
  if (expandedNodesByTab.has(tab)) {
    return expandedNodesByTab.get(tab);
  }
  let stored = [];
  try {
    stored = JSON.parse(localStorage.getItem(`treeExpanded:${tab}`) || '[]');
  } catch {
    stored = [];
  }
  const set = new Set(stored);
  expandedNodesByTab.set(tab, set);
  return set;
}

function saveExpandedSet(tab) {
  const set = expandedNodesByTab.get(tab);
  if (!set) return;
  try {
    localStorage.setItem(`treeExpanded:${tab}`, JSON.stringify(Array.from(set)));
  } catch {}
}

function getTitleFromPath(filePath) {
  if (!filePath) return '';
  const parts = filePath.split(/[\\/]/);
  const fileName = parts[parts.length - 1] || '';
  return fileName.replace(/^\d+_/, '').replace(/\.txt$/i, '');
}

function getCategoryIndexDocumentPath(node) {
  if (!node || !node.path) return '';
  return `${node.path.replace(/[\\/]$/, '')}/.index.txt`;
}

function getEffectiveDocumentPath(node) {
  if (!node) return '';
  if (node.kind === 'materials-category' || node.kind === 'reference-category') {
    return getCategoryIndexDocumentPath(node);
  }
  return node.path || '';
}

function getEffectiveDocumentKind(node) {
  if (!node) return '';
  if (node.kind === 'materials-category') return 'material';
  if (node.kind === 'reference-category') return 'reference';
  return node.kind || '';
}

function clearContextMenu() {
  if (!contextMenu) return;
  contextMenu.innerHTML = '';
  contextMenu.hidden = true;
}

function showContextMenu(items, x, y) {
  if (!contextMenu) return;
  contextMenu.innerHTML = '';
  items.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'context-menu__item';
    button.textContent = item.label;
    button.addEventListener('click', () => {
      clearContextMenu();
      item.onClick();
    });
    contextMenu.appendChild(button);
  });
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
  contextMenu.hidden = false;
}

function openCardModal(prefillText = '') {
  if (!cardModal || !cardTitleInput || !cardTextInput || !cardTagsInput) return;
  cardTitleInput.value = '';
  cardTextInput.value = prefillText || '';
  cardTagsInput.value = '';
  cardModal.hidden = false;
  cardTitleInput.focus();
}

function closeCardModal() {
  if (!cardModal) return;
  cardModal.hidden = true;
}

async function openDocumentNode(node) {
  if (!window.electronAPI || !window.electronAPI.openDocument) return false;
  const documentPath = getEffectiveDocumentPath(node);
  if (!documentPath) return false;
  try {
    const result = await window.electronAPI.openDocument({
      path: documentPath,
      title: node.label,
      kind: getEffectiveDocumentKind(node)
    });
    if (!result || result.ok === false) {
      if (result && result.cancelled) {
        return false;
      }
      updateStatusText('Ошибка');
      return false;
    }
    currentDocumentPath = documentPath;
    currentDocumentKind = getEffectiveDocumentKind(node);
    metaEnabled = currentDocumentKind === 'scene' || currentDocumentKind === 'chapter-file';
    updateMetaVisibility();
    return true;
  } catch {
    updateStatusText('Ошибка');
    return false;
  }
}

async function handleCreateNode(node, kind, promptLabel) {
  const name = window.prompt(promptLabel || 'Название', '');
  if (!name) return;
  const result = await window.electronAPI.createNode({
    parentPath: node.path,
    kind,
    name
  });
  if (!result || result.ok === false) {
    updateStatusText('Ошибка');
    return;
  }
  await loadTree();
}

async function handleRenameNode(node) {
  const name = window.prompt('Новое имя', node.label || '');
  if (!name) return;
  const result = await window.electronAPI.renameNode({ path: node.path, name });
  if (!result || result.ok === false) {
    updateStatusText('Ошибка');
    return;
  }
  if (currentDocumentPath && result.path && currentDocumentPath === node.path) {
    currentDocumentPath = result.path;
  }
  await loadTree();
}

async function handleDeleteNode(node) {
  const confirmed = window.confirm('Переместить в корзину?');
  if (!confirmed) return;
  const result = await window.electronAPI.deleteNode({ path: node.path });
  if (!result || result.ok === false) {
    updateStatusText('Ошибка');
    return;
  }
  if (currentDocumentPath && currentDocumentPath === node.path) {
    currentDocumentPath = null;
  }
  await loadTree();
  if (!currentDocumentPath) {
    collapseSelection();
  }
}

async function handleReorderNode(node, direction) {
  const result = await window.electronAPI.reorderNode({ path: node.path, direction });
  if (!result || result.ok === false) {
    return;
  }
  if (currentDocumentPath && result.path && currentDocumentPath === node.path) {
    currentDocumentPath = result.path;
  }
  await loadTree();
}

function buildContextMenuItems(node) {
  const items = [];
  if (!node) return items;

  if (node.kind === 'part') {
    items.push({ label: 'Новая глава (документ)', onClick: () => handleCreateNode(node, 'chapter-file', 'Название главы') });
    items.push({ label: 'Новая глава (со сценами)', onClick: () => handleCreateNode(node, 'chapter-folder', 'Название главы') });
    items.push({ label: 'Вверх', onClick: () => handleReorderNode(node, 'up') });
    items.push({ label: 'Вниз', onClick: () => handleReorderNode(node, 'down') });
    items.push({ label: 'Переименовать', onClick: () => handleRenameNode(node) });
    items.push({ label: 'Удалить', onClick: () => handleDeleteNode(node) });
    return items;
  }

  if (node.kind === 'chapter-folder') {
    items.push({ label: 'Новая сцена', onClick: () => handleCreateNode(node, 'scene', 'Название сцены') });
    items.push({ label: 'Вверх', onClick: () => handleReorderNode(node, 'up') });
    items.push({ label: 'Вниз', onClick: () => handleReorderNode(node, 'down') });
    items.push({ label: 'Переименовать', onClick: () => handleRenameNode(node) });
    items.push({ label: 'Удалить', onClick: () => handleDeleteNode(node) });
    return items;
  }

  if (node.kind === 'chapter-file' || node.kind === 'scene') {
    items.push({ label: 'Добавить карточку…', onClick: async () => {
      const opened = await openDocumentNode(node);
      if (opened) openCardModal('');
    }});
    items.push({ label: 'Вверх', onClick: () => handleReorderNode(node, 'up') });
    items.push({ label: 'Вниз', onClick: () => handleReorderNode(node, 'down') });
    items.push({ label: 'Переименовать', onClick: () => handleRenameNode(node) });
    items.push({ label: 'Удалить', onClick: () => handleDeleteNode(node) });
    return items;
  }

  if (node.kind === 'materials-category' || node.kind === 'reference-category' || node.kind === 'folder') {
    if (node.kind === 'materials-category' || node.kind === 'reference-category') {
      items.push({
        label: 'Добавить карточку…',
        onClick: async () => {
          const opened = await openDocumentNode(node);
          if (opened) openCardModal('');
        }
      });
    }
    items.push({ label: 'Новая папка', onClick: () => handleCreateNode(node, 'folder', 'Название папки') });
    items.push({ label: 'Новый документ', onClick: () => handleCreateNode(node, 'file', 'Название документа') });
    if (node.kind === 'folder') {
      items.push({ label: 'Переименовать', onClick: () => handleRenameNode(node) });
      items.push({ label: 'Удалить', onClick: () => handleDeleteNode(node) });
    }
    return items;
  }

  if (node.kind === 'material' || node.kind === 'reference') {
    items.push({ label: 'Добавить карточку…', onClick: async () => {
      const opened = await openDocumentNode(node);
      if (opened) openCardModal('');
    }});
    items.push({ label: 'Переименовать', onClick: () => handleRenameNode(node) });
    items.push({ label: 'Удалить', onClick: () => handleDeleteNode(node) });
    return items;
  }

  return items;
}

function renderTreeNode(node, level, isLast, ancestorHasNext = []) {
  const li = document.createElement('li');
  li.className = 'tree__node';

  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'tree__row';
  row.dataset.level = String(level);

  const effectivePath = getEffectiveDocumentPath(node);
  if (currentDocumentPath && effectivePath && currentDocumentPath === effectivePath) {
    row.classList.add('is-selected');
  }

  const indent = document.createElement('span');
  indent.className = 'tree__indent';
  ancestorHasNext.forEach((hasNext) => {
    const guide = document.createElement('span');
    guide.className = 'tree__guide';
    if (hasNext) {
      guide.classList.add('is-active');
    }
    indent.appendChild(guide);
  });
  const currentGuide = document.createElement('span');
  currentGuide.className = 'tree__guide is-current';
  if (isLast) {
    currentGuide.classList.add('is-last');
  }
  indent.appendChild(currentGuide);
  row.appendChild(indent);

  const toggle = document.createElement('span');
  toggle.className = 'tree__toggle';
  const hasChildren = node.children && node.children.length > 0;
  if (hasChildren) {
    toggle.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4 10 8 6 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  const expandedSet = getExpandedSet(activeTab);
  const isExpanded =
    hasChildren &&
    (expandedSet.has(node.path) ||
      node.kind === 'materials-root' ||
      node.kind === 'reference-root' ||
      node.kind === 'materials-category' ||
      node.kind === 'reference-category');
  if (isExpanded) {
    toggle.classList.add('is-expanded');
  }

  toggle.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!hasChildren) return;
    if (expandedSet.has(node.path)) {
      expandedSet.delete(node.path);
    } else {
      expandedSet.add(node.path);
    }
    saveExpandedSet(activeTab);
    renderTree();
  });

  const label = document.createElement('span');
  label.className = 'tree__label';
  label.textContent = node.label || node.name || '';

  if (!hasChildren) {
    toggle.classList.add('is-empty');
  }
  row.appendChild(toggle);
  row.appendChild(label);
  row.addEventListener('click', async () => {
    if (
      hasChildren &&
      (node.kind === 'part' ||
        node.kind === 'chapter-folder' ||
        node.kind === 'folder' ||
        node.kind === 'roman-root' ||
        node.kind === 'roman-section-group' ||
        node.kind === 'mindmap-root' ||
        node.kind === 'print-root')
    ) {
      if (expandedSet.has(node.path)) {
        expandedSet.delete(node.path);
      } else {
        expandedSet.add(node.path);
      }
      saveExpandedSet(activeTab);
      renderTree();
      return;
    }
    if (
      node.path &&
      (node.kind === 'chapter-file' ||
        node.kind === 'scene' ||
        node.kind === 'material' ||
        node.kind === 'reference' ||
        node.kind === 'materials-category' ||
        node.kind === 'reference-category' ||
        node.kind === 'roman-section' ||
        node.kind === 'mindmap-section' ||
        node.kind === 'print-section')
    ) {
      const opened = await openDocumentNode(node);
      if (opened) {
        renderTree();
      }
    }
  });

  row.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    const items = buildContextMenuItems(node);
    if (items.length) {
      showContextMenu(items, event.clientX, event.clientY);
    }
  });

  li.appendChild(row);

  if (hasChildren && isExpanded) {
    const ul = document.createElement('ul');
    ul.className = 'tree__children';
    node.children.forEach((child, index) => {
      ul.appendChild(
        renderTreeNode(
          child,
          level + 1,
          index === node.children.length - 1,
          ancestorHasNext.concat(!isLast)
        )
      );
    });
    li.appendChild(ul);
  }

  return li;
}

function findRomanRootNode(root) {
  if (!root) return null;
  if (root.kind === 'roman-root') return root;
  if (Array.isArray(root.children)) {
    return root.children.find((child) => child.kind === 'roman-root') || null;
  }
  return null;
}

let treeRoot = null;

function renderTree() {
  if (!treeContainer) return;
  treeContainer.innerHTML = '';
  if (!treeRoot) {
    const empty = document.createElement('div');
    empty.className = 'tree__empty';
    empty.textContent = 'Дерево пустое';
    treeContainer.appendChild(empty);
    return;
  }
  const list = document.createElement('ul');
  list.className = 'tree__list';
  const nodesToRender =
    (treeRoot.kind === 'roman-root' ? [treeRoot] : treeRoot.children) || [];
  nodesToRender.forEach((child, index) => {
    list.appendChild(renderTreeNode(child, 0, index === nodesToRender.length - 1, []));
  });
  treeContainer.appendChild(list);
}

async function loadTree() {
  if (!window.electronAPI || !window.electronAPI.getProjectTree) return;
  try {
    const result = await window.electronAPI.getProjectTree(activeTab);
    if (!result || result.ok === false) {
      updateStatusText('Ошибка');
      return;
    }
    treeRoot = result.root;
    if (treeContainer) {
      treeContainer.dataset.tab = activeTab;
    }
    if (activeTab === 'roman' && treeRoot) {
      const expandedSet = getExpandedSet(activeTab);
      let stored = null;
      try {
        stored = localStorage.getItem('treeExpanded:roman');
      } catch {}
      if (stored === null) {
        const romanRoot = findRomanRootNode(treeRoot);
        const pathToExpand = (romanRoot && romanRoot.path) || treeRoot.path;
        if (pathToExpand) {
          expandedSet.add(pathToExpand);
          saveExpandedSet(activeTab);
        }
      }
    }
    renderTree();
  } catch {
    updateStatusText('Ошибка');
  }
}

if (treeContainer) {
  treeContainer.addEventListener('contextmenu', (event) => {
    if (event.target.closest('.tree__row')) {
      return;
    }
    if (!treeRoot) return;
    event.preventDefault();
    if (activeTab === 'roman') {
      const romanRoot = findRomanRootNode(treeRoot);
      if (!romanRoot) return;
      showContextMenu(
        [
          {
            label: 'Новая часть',
            onClick: () => handleCreateNode(romanRoot, 'part', 'Название части')
          },
          {
            label: 'Новая глава (документ)',
            onClick: () => handleCreateNode(romanRoot, 'chapter-file', 'Название главы')
          },
          {
            label: 'Новая глава (со сценами)',
            onClick: () => handleCreateNode(romanRoot, 'chapter-folder', 'Название главы')
          }
        ],
        event.clientX,
        event.clientY
      );
    }
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
    scheduleLayoutRefresh();
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

if (metaSynopsis) {
  metaSynopsis.addEventListener('input', () => {
    syncMetaFromInputs();
    markAsModified();
  });
}

if (metaStatus) {
  metaStatus.addEventListener('change', () => {
    syncMetaFromInputs();
    markAsModified();
  });
}

if (metaTagPov) {
  metaTagPov.addEventListener('input', () => {
    syncMetaFromInputs();
    markAsModified();
  });
}

if (metaTagLine) {
  metaTagLine.addEventListener('input', () => {
    syncMetaFromInputs();
    markAsModified();
  });
}

if (metaTagPlace) {
  metaTagPlace.addEventListener('input', () => {
    syncMetaFromInputs();
    markAsModified();
  });
}

if (addCardButton) {
  addCardButton.addEventListener('click', () => {
    const selection = window.getSelection();
    const text = selection && editor && editor.contains(selection.anchorNode) ? selection.toString() : '';
    openCardModal(text);
  });
}

if (cardSaveButtons.length) {
  cardSaveButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (!cardTitleInput || !cardTextInput || !cardTagsInput) return;
      const card = {
        title: cardTitleInput.value.trim(),
        text: cardTextInput.value.trim(),
        tags: cardTagsInput.value.trim()
      };
      currentCards.push(card);
      updateCardsList();
      markAsModified();
      closeCardModal();
    });
  });
}

if (cardCancelButtons.length) {
  cardCancelButtons.forEach((button) => {
    button.addEventListener('click', () => {
      closeCardModal();
    });
  });
}

document.addEventListener('click', (event) => {
  if (contextMenu && !contextMenu.hidden && !contextMenu.contains(event.target)) {
    clearContextMenu();
  }
});

document.addEventListener('contextmenu', (event) => {
  if (editor && editor.contains(event.target)) {
    event.preventDefault();
    const selection = window.getSelection();
    const selectedText = selection ? selection.toString() : '';
    showContextMenu(
      [
        {
          label: 'Добавить карточку…',
          onClick: () => openCardModal(selectedText)
        }
      ],
      event.clientX,
      event.clientY
    );
  }
});

document.addEventListener('scroll', () => {
  clearContextMenu();
}, true);

function updateStatusText(text) {
  if (statusElement && text) {
    statusElement.textContent = text;
  }
}

function updateWordCount() {
  if (!editor || !wordCountElement) return;
  const text = getPlainText();
  const trimmed = text.trim();
  const count = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
  wordCountElement.textContent = `${count} words`;
}

function updateZoomValue() {
  if (!zoomValueElement) return;
  const percent = Math.round(editorZoom * 100);
  zoomValueElement.textContent = `${percent}%`;
}

function setEditorZoom(value, persist = true) {
  const quantized = Math.round(value / EDITOR_ZOOM_STEP) * EDITOR_ZOOM_STEP;
  const nextZoom = Math.max(EDITOR_ZOOM_MIN, Math.min(EDITOR_ZOOM_MAX, quantized));
  editorZoom = nextZoom;
  document.documentElement.style.setProperty('--editor-zoom', String(editorZoom));
  updateZoomValue();
  if (!persist) {
    return;
  }

  try {
    localStorage.setItem(EDITOR_ZOOM_STORAGE_KEY, String(editorZoom));
  } catch {}
}

function changeEditorZoom(delta) {
  setEditorZoom(editorZoom + delta);
}

function loadSavedEditorZoom() {
  try {
    const saved = Number(localStorage.getItem(EDITOR_ZOOM_STORAGE_KEY));
    if (Number.isFinite(saved)) {
      setEditorZoom(saved, false);
      return;
    }
  } catch {}

  setEditorZoom(EDITOR_ZOOM_DEFAULT, false);
}

function setCurrentFontSize(px) {
  if (!Number.isFinite(px)) return;
  currentFontSizePx = px;
  if (sizeSelect) {
    sizeSelect.value = String(px);
  }
}

function scheduleAutoSave(delay = AUTO_SAVE_DELAY) {
  if (!window.electronAPI || typeof window.electronAPI.requestAutoSave !== 'function') {
    return;
  }

  if (autoSaveTimerId) {
    clearTimeout(autoSaveTimerId);
  }

  autoSaveTimerId = window.setTimeout(() => {
    window.electronAPI
      .requestAutoSave()
      .catch(() => {})
      .finally(() => {
        autoSaveTimerId = null;
      });
  }, delay);
}

function markAsModified() {
  if (!localDirty) {
    localDirty = true;
    if (window.electronAPI && window.electronAPI.notifyDirtyState) {
      window.electronAPI.notifyDirtyState(true);
    }
  }

  updateStatusText('Изменено');
  scheduleAutoSave();
}

function applyFontWeight(weight, persist = true) {
  if (!editor) return;
  editor.style.fontWeight = String(weight);
  if (persist) {
    localStorage.setItem('editorFontWeight', String(weight));
  }
  renderStyledView(getPlainText());
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
  renderStyledView(getPlainText());
}

function applyWordWrap(enabled, persist = true) {
  if (!editor) return;
  wordWrapEnabled = enabled;
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

function applyTextStyle(action) {
  if (!editor || !action) return;
  const text = getPlainText();
  const { start: rawStart, end: rawEnd } = getSelectionOffsets();
  const boundedStart = Math.max(0, Math.min(rawStart, rawEnd));
  const boundedEnd = Math.max(0, Math.max(rawStart, rawEnd));
  const start = Math.min(boundedStart, text.length);
  const end = Math.min(boundedEnd, text.length);
  let result = null;

  if (action.startsWith('paragraph-')) {
    result = applyParagraphStyle(text, start, end, action);
  } else if (action.startsWith('character-')) {
    result = applyCharacterStyle(text, start, end, action);
  }

  if (!result) return;
  setPlainText(result.newText);
  setSelectionRange(result.newStart, result.newEnd);
  markAsModified();
  updateWordCount();
}

function updateAlignmentButtons(activeAction) {
  if (!alignButtons.length) return;
  alignButtons.forEach((button) => {
    const isActive = button.dataset.action === activeAction;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function getAlignmentActionForLine(line) {
  if (line.startsWith('::center:: ')) return 'align-center';
  if (line.startsWith('::right:: ')) return 'align-right';
  if (line.startsWith('::justify:: ')) return 'align-justify';
  return 'align-left';
}

function syncAlignmentButtonsToSelection() {
  if (!editor) return;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
    return;
  }
  const text = getPlainText();
  const { start: rawStart } = getSelectionOffsets();
  const start = Math.max(0, Math.min(rawStart, text.length));
  const lineMeta = getLineMeta(text);
  const lineIndex = findLineIndexForPosition(lineMeta, start);
  if (lineIndex === -1) return;
  const action = getAlignmentActionForLine(lineMeta[lineIndex].content);
  updateAlignmentButtons(action);
}

function stripAlignmentMarker(line) {
  for (const marker of ALIGNMENT_MARKERS) {
    if (line.startsWith(marker)) {
      return line.slice(marker.length);
    }
  }
  return line;
}

function applyAlignmentStyle(action) {
  if (!editor || !action) return;
  const prefix = ALIGNMENT_PREFIX_BY_ACTION[action];
  if (prefix === undefined) return;

  const text = getPlainText();
  const { start: rawStart, end: rawEnd } = getSelectionOffsets();
  const boundedStart = Math.max(0, Math.min(rawStart, rawEnd));
  const boundedEnd = Math.max(0, Math.max(rawStart, rawEnd));
  const start = Math.min(boundedStart, text.length);
  const end = Math.min(boundedEnd, text.length);
  const result = applyAlignmentMarkers(text, start, end, prefix);

  if (!result) return;
  setPlainText(result.newText);
  setSelectionRange(result.newStart, result.newEnd);
  markAsModified();
  updateWordCount();
}

function applyAlignmentMarkers(text, selectionStart, selectionEnd, prefix) {
  const lineMeta = getLineMeta(text);
  if (!lineMeta.length) return null;
  const { startIdx, endIdx } = getSelectionLineRange(lineMeta, selectionStart, selectionEnd);
  if (startIdx === -1 || endIdx === -1) return null;

  const edits = [];
  const adjustments = [];

  const queueEdit = (start, end, value) => {
    if (start === end && !value) return;
    edits.push({ start, end, value });
    adjustments.push({ pos: start, delta: value.length - (end - start) });
  };

  const queueLineReplacement = (idx, content) => {
    const line = lineMeta[idx];
    if (!line || line.content === content) return;
    queueEdit(line.start, line.end, content);
  };

  for (let idx = startIdx; idx <= endIdx; idx++) {
    const baseLine = stripAlignmentMarker(lineMeta[idx].content);
    const nextLine = prefix ? `${prefix}${baseLine}` : baseLine;
    queueLineReplacement(idx, nextLine);
  }

  if (!edits.length) {
    return null;
  }

  return finalizeEdits(text, edits, adjustments, selectionStart, selectionEnd);
}

function applyParagraphStyle(text, selectionStart, selectionEnd, style) {
  const lineMeta = getLineMeta(text);
  if (!lineMeta.length) return null;
  const { startIdx, endIdx } = getSelectionLineRange(lineMeta, selectionStart, selectionEnd);
  if (startIdx === -1 || endIdx === -1) return null;

  const edits = [];
  const adjustments = [];

  const queueEdit = (start, end, value) => {
    if (start === end && !value) return;
    edits.push({ start, end, value });
    adjustments.push({ pos: start, delta: value.length - (end - start) });
  };

  const queueLineReplacement = (idx, content) => {
    const line = lineMeta[idx];
    if (!line || line.content === content) return;
    queueEdit(line.start, line.end, content);
  };

  const applyParagraphPrefix = (prefix) => {
    for (let idx = startIdx; idx <= endIdx; idx++) {
      const baseLine = stripParagraphMarkers(lineMeta[idx].content);
      queueLineReplacement(idx, `${prefix}${baseLine}`);
    }
  };

  switch (style) {
    case 'paragraph-none':
      for (let idx = startIdx; idx <= endIdx; idx++) {
        const cleaned = stripParagraphMarkers(lineMeta[idx].content);
        queueLineReplacement(idx, cleaned);
      }
      removeCodeBlockFences(lineMeta, startIdx, endIdx, queueEdit);
      break;

    case 'paragraph-codeblock': {
      const removed = removeCodeBlockFences(lineMeta, startIdx, endIdx, queueEdit);
      if (!removed) {
        const prefix = '```\n';
        const suffix = '\n```\n';
        queueEdit(lineMeta[startIdx].start, lineMeta[startIdx].start, prefix);
        queueEdit(lineMeta[endIdx].endWithNewline, lineMeta[endIdx].endWithNewline, suffix);
      }
      break;
    }

    default: {
      const paragraphPrefixes = {
        'paragraph-title': '# ',
        'paragraph-heading1': '## ',
        'paragraph-heading2': '### ',
        'paragraph-blockquote': '> ',
        'paragraph-caption': '::caption:: ',
        'paragraph-centered': '::center:: ',
        'paragraph-verse': '::verse:: ',
        'paragraph-attribution': '— ',
      };
      if (paragraphPrefixes[style]) {
        applyParagraphPrefix(paragraphPrefixes[style]);
      }
      break;
    }
  }

  if (!edits.length) {
    return null;
  }

  return finalizeEdits(text, edits, adjustments, selectionStart, selectionEnd);
}

function applyCharacterStyle(text, selectionStart, selectionEnd, style) {
  if (selectionStart === selectionEnd) {
    updateStatusText('Выделите текст');
    return null;
  }

  const selected = text.slice(selectionStart, selectionEnd);
  let replacement = selected;

  if (style === 'character-emphasis') {
    if (selected.startsWith('*') && selected.endsWith('*') && selected.length >= 2) {
      replacement = selected.slice(1, -1);
    } else {
      replacement = `*${selected}*`;
    }
  } else if (style === 'character-code-span') {
    if (selected.startsWith('`') && selected.endsWith('`') && selected.length >= 2) {
      replacement = selected.slice(1, -1);
    } else {
      replacement = `\`${selected}\``;
    }
  }

  const edits = [{ start: selectionStart, end: selectionEnd, value: replacement }];
  const adjustments = [{ pos: selectionStart, delta: replacement.length - (selectionEnd - selectionStart) }];
  const newText = applyEditsToText(text, edits);
  const sortedAdjustments = adjustments.slice().sort((a, b) => a.pos - b.pos);
  const newStart = mapPosition(selectionStart, sortedAdjustments, newText.length);
  const newEnd = mapPosition(selectionEnd, sortedAdjustments, newText.length);
  return { newText, newStart, newEnd };
}

function getLineMeta(text) {
  const rawLines = text.split('\n');
  const meta = [];
  let cursor = 0;
  for (let i = 0; i < rawLines.length; i++) {
    const content = rawLines[i];
    const start = cursor;
    const end = start + content.length;
    const hasNewline = i < rawLines.length - 1;
    const endWithNewline = hasNewline ? end + 1 : end;
    meta.push({ content, start, end, endWithNewline });
    cursor = endWithNewline;
  }
  if (!meta.length) {
    meta.push({ content: '', start: 0, end: 0, endWithNewline: 0 });
  }
  return meta;
}

function getSelectionLineRange(meta, selectionStart, selectionEnd) {
  const startIdx = findLineIndexForPosition(meta, selectionStart);
  const effectiveEnd = selectionEnd > selectionStart ? selectionEnd - 1 : selectionStart;
  const endIdx = findLineIndexForPosition(meta, effectiveEnd);
  return { startIdx, endIdx };
}

function findLineIndexForPosition(meta, position) {
  if (!meta.length) return -1;
  for (let i = 0; i < meta.length; i++) {
    if (position <= meta[i].endWithNewline) {
      return i;
    }
  }
  return meta.length - 1;
}

function stripParagraphMarkers(line) {
  let cleaned = line;
  const markers = [
    '::caption:: ',
    '::center:: ',
    '::right:: ',
    '::justify:: ',
    '::verse:: ',
    '— ',
    '> ',
    '### ',
    '## ',
    '# ',
  ];
  let loop = true;
  while (loop) {
    loop = false;
    for (const marker of markers) {
      if (cleaned.startsWith(marker)) {
        cleaned = cleaned.slice(marker.length);
        loop = true;
        break;
      }
    }
  }
  return cleaned;
}

function removeCodeBlockFences(meta, startIdx, endIdx, queueEdit) {
  const beforeIdx = startIdx - 1;
  const afterIdx = endIdx + 1;
  if (
    beforeIdx >= 0 &&
    afterIdx < meta.length &&
    meta[beforeIdx].content.trim() === '```' &&
    meta[afterIdx].content.trim() === '```'
  ) {
    queueEdit(meta[beforeIdx].start, meta[beforeIdx].endWithNewline, '');
    queueEdit(meta[afterIdx].start, meta[afterIdx].endWithNewline, '');
    return true;
  }
  return false;
}

function applyEditsToText(text, edits) {
  if (!edits.length) return text;
  const sorted = edits.slice().sort((a, b) => a.start - b.start);
  let cursor = 0;
  let result = '';
  for (const edit of sorted) {
    if (edit.start > cursor) {
      result += text.slice(cursor, edit.start);
    }
    result += edit.value;
    cursor = edit.end;
  }
  result += text.slice(cursor);
  return result;
}

function finalizeEdits(text, edits, adjustments, selectionStart, selectionEnd) {
  const newText = applyEditsToText(text, edits);
  const sortedAdjustments = adjustments.slice().sort((a, b) => a.pos - b.pos);
  const newStart = mapPosition(selectionStart, sortedAdjustments, newText.length);
  const newEnd = mapPosition(selectionEnd, sortedAdjustments, newText.length);
  return { newText, newStart, newEnd };
}

function mapPosition(index, adjustments, textLength) {
  let mapped = index;
  for (const adjustment of adjustments) {
    if (adjustment.pos <= index) {
      mapped += adjustment.delta;
    }
  }
  return Math.max(0, Math.min(mapped, textLength));
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
  const text = getPlainText();
  const normalized = text.toLowerCase();
  const needle = query.toLowerCase();
  const { end: currentEnd } = getSelectionOffsets();
  const startIndex = query === lastSearchQuery ? currentEnd : 0;
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
  setSelectionRange(index, index + query.length);
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
          setPlainText('');
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
        applyWordWrap(!wordWrapEnabled);
        break;
      }
      case 'zoom-out':
        changeEditorZoom(-EDITOR_ZOOM_STEP);
        break;
      case 'zoom-in':
        changeEditorZoom(EDITOR_ZOOM_STEP);
        break;
      case 'align-left':
      case 'align-center':
      case 'align-right':
      case 'align-justify':
        applyAlignmentStyle(action);
        updateAlignmentButtons(action);
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

if (textStyleSelect) {
  textStyleSelect.addEventListener('change', (event) => {
    applyTextStyle(event.target.value);
    textStyleSelect.value = TEXT_STYLE_DEFAULT;
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
loadSavedEditorZoom();

setPlainText('');
metaPanel?.classList.add('is-hidden');

loadTree();

function handleSelectAllShortcut(event) {
  const isCmdOrCtrl = isMac ? event.metaKey : event.ctrlKey;
  const isSelectAll = isCmdOrCtrl && !event.shiftKey && !event.altKey && event.key && event.key.toLowerCase() === 'a';

  if (!isSelectAll || !editor) {
    return;
  }

  event.preventDefault();
  editor.focus();
  selectAllEditor();
}

document.addEventListener('keydown', handleSelectAllShortcut);
document.addEventListener('keydown', (event) => {
  const isPrimaryModifier = isMac ? event.metaKey : event.ctrlKey;
  if (!isPrimaryModifier || event.altKey) {
    return;
  }

  const { key, code } = event;
  const isPlus =
    ['+', '=', 'Add'].includes(key) || code === 'Equal' || code === 'NumpadAdd';
  const isMinus =
    ['-'].includes(key) || code === 'Minus' || code === 'NumpadSubtract';
  const isZero =
    key === '0' || code === 'Digit0' || code === 'Numpad0';

  if (!isPlus && !isMinus && !isZero) {
    return;
  }

  event.preventDefault();
  if (isPlus) {
    changeEditorZoom(EDITOR_ZOOM_STEP);
    return;
  }
  if (isMinus) {
    changeEditorZoom(-EDITOR_ZOOM_STEP);
    return;
  }
  if (isZero) {
    setEditorZoom(EDITOR_ZOOM_DEFAULT);
  }
});
document.addEventListener('selectionchange', syncAlignmentButtonsToSelection);

window.addEventListener('resize', scheduleLayoutRefresh);

if (window.electronAPI) {
  window.electronAPI.onEditorSetText((payload) => {
    const content = typeof payload === 'string' ? payload : payload?.content || '';
    const title = typeof payload === 'object' && payload ? payload.title : '';
    const hasPath = typeof payload === 'object' && payload && Object.prototype.hasOwnProperty.call(payload, 'path');
    const hasKind = typeof payload === 'object' && payload && Object.prototype.hasOwnProperty.call(payload, 'kind');
    const path = hasPath ? payload.path : '';
    const kind = hasKind ? payload.kind : '';
    const nextMetaEnabled = typeof payload === 'object' && payload ? Boolean(payload.metaEnabled) : false;

    metaEnabled = nextMetaEnabled;
    if (hasPath) {
      currentDocumentPath = path || null;
    }
    if (hasKind) {
      currentDocumentKind = kind || null;
    }

    const parsed = parseDocumentContent(content);
    currentMeta = parsed.meta;
    currentCards = parsed.cards;
    setPlainText(parsed.text || '');
    updateMetaInputs();
    updateMetaVisibility();
    updateCardsList();

    localDirty = false;
    updateWordCount();

    const resolvedTitle = title || getTitleFromPath(path);
    if (resolvedTitle) {
      showEditorPanelFor(resolvedTitle);
    }
    renderTree();
  });

  window.electronAPI.onEditorTextRequest(({ requestId }) => {
    window.electronAPI.sendEditorTextResponse(requestId, composeDocumentContent());
  });

  window.electronAPI.onEditorSetFontSize(({ px }) => {
    if (Number.isFinite(px)) {
      editor.style.fontSize = `${px}px`;
      setCurrentFontSize(px);
      renderStyledView(getPlainText());
    }
  });
}

editor.addEventListener('input', () => {
  const updated = (editor.textContent || '').replace(/\u00a0/g, ' ');
  setPlainText(updated);
  markAsModified();
  updateWordCount();
});

editor.addEventListener('paste', (event) => {
  event.preventDefault();
  const text = event.clipboardData?.getData('text/plain') || '';
  if (text) {
    document.execCommand('insertText', false, text);
  }
});

editor.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    const { start, end } = getSelectionOffsets();
    const text = getPlainText();
    const normalizedStart = Math.max(0, Math.min(start, text.length));
    const normalizedEnd = Math.max(0, Math.min(end, text.length));
    const nextText = `${text.slice(0, normalizedStart)}\n${text.slice(normalizedEnd)}`;
    setPlainText(nextText);
    setSelectionRange(normalizedStart + 1, normalizedStart + 1);
    markAsModified();
    updateWordCount();
  }
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
