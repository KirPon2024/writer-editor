import productCommandRegistry from '../../shared/productCommandRegistry.cjs';

const { PRODUCT_COMMAND_CATALOG_ROWS } = productCommandRegistry;

const COMMAND_CATALOG_ROWS = [
  {
    key: 'PROJECT_OPEN',
    id: 'cmd.project.open',
    label: 'Open Project',
    group: 'file',
    surface: ['palette', 'toolbar'],
    hotkey: 'Cmd/Ctrl+O',
  },
  {
    key: 'PROJECT_SAVE',
    id: 'cmd.project.save',
    label: 'Save Project',
    group: 'file',
    surface: ['palette', 'toolbar'],
    hotkey: 'Cmd/Ctrl+S',
  },
  {
    key: 'PROJECT_EXPORT_DOCX_MIN',
    id: 'cmd.project.export.docxMin',
    label: 'Export DOCX (Minimal)',
    group: 'export',
    surface: ['palette', 'shortcut', 'toolbar'],
    hotkey: 'Cmd/Ctrl+Shift+E',
  },
  {
    key: 'PROJECT_EXPORT_PDF_V1',
    id: 'cmd.project.exportPdfV1',
    label: 'Export PDF',
    group: 'export',
    surface: ['palette'],
    hotkey: '',
  },
  {
    key: 'PROJECT_EXPORT_FULL_ARCHIVE_V1',
    id: 'cmd.project.exportFullArchiveV1',
    label: 'Export Full Project Archive',
    group: 'export',
    surface: ['palette'],
    hotkey: '',
  },
  {
    key: 'PROJECT_IMPORT_FULL_ARCHIVE_V1',
    id: 'cmd.project.importFullArchiveV1',
    label: 'Import Full Project Archive',
    group: 'import',
    surface: ['palette'],
    hotkey: '',
  },
  {
    key: 'PROJECT_IMPORT_MARKDOWN_V1',
    id: 'cmd.project.importMarkdownV1',
    label: 'Import Markdown Content',
    group: 'import',
    surface: ['palette'],
    hotkey: '',
  },
  {
    key: 'PROJECT_IMPORT_DOCX_V1',
    id: 'cmd.project.importDocxV1',
    label: 'Import DOCX Content (Content only)',
    group: 'import',
    surface: ['palette'],
    hotkey: '',
  },
  {
    key: 'PROJECT_IMPORT_TXT_V1',
    id: 'cmd.project.importTxtV1',
    label: 'Import TXT Content',
    group: 'import',
    surface: ['palette'],
    hotkey: '',
  },
  {
    key: 'PROJECT_EXPORT_MARKDOWN_V1',
    id: 'cmd.project.exportMarkdownV1',
    label: 'Export Markdown',
    group: 'export',
    surface: ['palette'],
    hotkey: '',
  },
  {
    key: 'PROJECT_FLOW_OPEN_V1',
    id: 'cmd.project.flowOpenV1',
    label: 'Open Flow Mode',
    group: 'flow',
    surface: ['palette', 'shortcut'],
    hotkey: 'Cmd/Ctrl+Shift+F',
  },
  {
    key: 'PROJECT_FLOW_SAVE_V1',
    id: 'cmd.project.flowSaveV1',
    label: 'Save Flow Mode',
    group: 'flow',
    surface: ['palette', 'shortcut'],
    hotkey: 'Cmd/Ctrl+Shift+S',
  },
  ...PRODUCT_COMMAND_CATALOG_ROWS,
];

function freezeCatalogEntry(entry) {
  return Object.freeze({
    key: entry.key,
    id: entry.id,
    label: entry.label,
    group: entry.group,
    surface: Object.freeze([...entry.surface]),
    hotkey: entry.hotkey,
  });
}

export const COMMAND_CATALOG_V1 = Object.freeze(COMMAND_CATALOG_ROWS.map(freezeCatalogEntry));

const COMMAND_CATALOG_BY_ID = new Map(COMMAND_CATALOG_V1.map((entry) => [entry.id, entry]));
const COMMAND_CATALOG_BY_KEY = new Map(COMMAND_CATALOG_V1.map((entry) => [entry.key, entry]));

export function listCommandCatalog() {
  return COMMAND_CATALOG_V1.map((entry) => ({
    ...entry,
    surface: [...entry.surface],
  }));
}

export function getCommandCatalogById(id) {
  if (typeof id !== 'string') return null;
  return COMMAND_CATALOG_BY_ID.get(id) || null;
}

export function getCommandCatalogByKey(key) {
  if (typeof key !== 'string') return null;
  return COMMAND_CATALOG_BY_KEY.get(key) || null;
}
