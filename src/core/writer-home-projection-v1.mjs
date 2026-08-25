export const WRITER_HOME_SURFACE_ID = 'writer.home.v1';

export const WRITER_HOME_ACTIONS = Object.freeze([
  Object.freeze({
    id: 'open-library',
    label: 'Проекты',
    action: 'open',
    description: 'Открыть локальную библиотеку проектов',
    enabledWhen: 'always',
  }),
  Object.freeze({
    id: 'create-project',
    label: 'Новый',
    action: 'new',
    description: 'Создать новый локальный проект через Command Kernel',
    enabledWhen: 'always',
  }),
  Object.freeze({
    id: 'find-in-project',
    label: 'Найти',
    action: 'search',
    description: 'Открыть поиск в текущем проекте',
    enabledWhen: 'project-tree',
  }),
  Object.freeze({
    id: 'open-current-scene',
    label: 'Сцена',
    action: 'open-current-scene',
    description: 'Вернуться к активной сцене',
    enabledWhen: 'active-document',
  }),
]);

const ROLE_ORDER = Object.freeze(['project', 'book', 'part', 'chapter', 'scene', 'block']);
const ROLE_LABELS = Object.freeze({
  project: 'Проект',
  book: 'Книга',
  part: 'Часть',
  chapter: 'Глава',
  scene: 'Сцена',
  block: 'Блок',
});
const ROLE_EMPTY_VALUES = Object.freeze({
  project: 'Локальный проект',
  book: 'Роман',
  part: 'Не выделена',
  chapter: 'Не выбрана',
  scene: 'Не выбрана',
  block: 'Нет активной сцены',
});
const TEXT_UNIT_KINDS = new Set(['chapter-file', 'scene']);
const MAX_TREE_NODES = 5000;
const SAFE_ID_PATTERN = /^[a-zA-Z0-9:_-]{1,160}$/u;
const ABSOLUTE_PATH_PATTERN = /^(?:\/|~\/|[a-zA-Z]:[\\/]|\\\\|.*[\\/](?:Users|Volumes|private|tmp|var)[\\/])/u;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return value;
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSafeId(value) {
  const text = normalizeString(value);
  if (!text || !SAFE_ID_PATTERN.test(text)) return '';
  return text;
}

function normalizeLabel(value, fallback) {
  const text = normalizeString(value).replace(/\s+/gu, ' ').slice(0, 96).trim();
  if (!text || ABSOLUTE_PATH_PATTERN.test(text) || text.includes('\\')) return fallback;
  return text;
}

function normalizeNonNegativeInteger(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) return 0;
  return number;
}

function normalizeOptionalNonNegativeInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) return null;
  return number;
}

function normalizeCounters(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.freeze({
    wordCount: normalizeNonNegativeInteger(source.wordCount),
    sceneCount: normalizeNonNegativeInteger(source.sceneCount),
    completedSceneCount: normalizeNonNegativeInteger(source.completedSceneCount),
    progressPercent: Math.min(100, normalizeNonNegativeInteger(source.progressPercent)),
  });
}

function roleForNodeKind(kind) {
  switch (kind) {
    case 'roman-tab-root':
    case 'presentation-workspace':
      return 'project';
    case 'roman-root':
    case 'presentation-manuscript':
      return 'book';
    case 'part':
    case 'roman-section':
      return 'part';
    case 'chapter-folder':
    case 'chapter-file':
      return 'chapter';
    case 'scene':
      return 'scene';
    case 'block':
    case 'text-block':
      return 'block';
    default:
      return '';
  }
}

function collectWriterHomeNodes(treeRoot) {
  if (!treeRoot || typeof treeRoot !== 'object' || Array.isArray(treeRoot)) {
    return { records: [], parentById: new Map(), rootRecord: null, truncated: false };
  }
  const records = [];
  const parentById = new Map();
  const stack = [{ node: treeRoot, parentId: '' }];
  let truncated = false;

  while (stack.length) {
    const { node, parentId } = stack.pop();
    if (!node || typeof node !== 'object' || Array.isArray(node)) continue;
    if (records.length >= MAX_TREE_NODES) {
      truncated = true;
      break;
    }

    const id = normalizeSafeId(node.nodeId) || normalizeSafeId(node.id);
    const kind = normalizeString(node.kind);
    const role = roleForNodeKind(kind);
    const record = Object.freeze({
      id,
      kind,
      role,
      label: normalizeLabel(node.label || node.name, ROLE_EMPTY_VALUES[role] || 'Без названия'),
      counters: normalizeCounters(node.derivedCounters),
    });
    records.push(record);
    if (id && parentId) parentById.set(id, parentId);

    const children = Array.isArray(node.children) ? node.children : [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ node: children[index], parentId: id });
    }
  }

  return { records, parentById, rootRecord: records[0] || null, truncated };
}

function countByRole(records) {
  const counts = Object.fromEntries(ROLE_ORDER.map((role) => [role, 0]));
  for (const record of records) {
    if (record.role && record.role in counts) counts[record.role] += 1;
    if (!record.role && TEXT_UNIT_KINDS.has(record.kind)) counts.scene += 1;
  }
  return counts;
}

function firstRecordByRole(records, role) {
  return records.find((record) => record.role === role) || null;
}

function activePathRoleMap(records, parentById, activeDocumentId) {
  const activeId = normalizeSafeId(activeDocumentId);
  if (!activeId) return new Map();
  const byId = new Map(records.filter((record) => record.id).map((record) => [record.id, record]));
  const path = [];
  const seen = new Set();
  for (let cursor = activeId; cursor && !seen.has(cursor); cursor = parentById.get(cursor) || '') {
    seen.add(cursor);
    const record = byId.get(cursor);
    if (!record) break;
    path.unshift(record);
  }
  const roleMap = new Map();
  for (const record of path) {
    if (record.role && !roleMap.has(record.role)) roleMap.set(record.role, record);
  }
  return roleMap;
}

function selectCounters(rootRecord, records) {
  const romanRoot = firstRecordByRole(records, 'book');
  if (romanRoot) return romanRoot.counters;
  if (rootRecord) return rootRecord.counters;
  return normalizeCounters(null);
}

function buildHierarchy({ records, parentById, rootRecord, projectId, activeDocumentId, activeBlockCount }) {
  const counts = countByRole(records);
  const activeRoles = activePathRoleMap(records, parentById, activeDocumentId);
  const safeProjectId = normalizeSafeId(projectId);

  return ROLE_ORDER.map((role) => {
    if (role === 'project') {
      const projectLabel = normalizeLabel(rootRecord?.label, 'Локальный проект');
      return Object.freeze({
        role,
        label: ROLE_LABELS[role],
        value: projectLabel,
        detail: safeProjectId || 'локальный',
        count: records.length > 0 ? 1 : 0,
        state: records.length > 0 ? 'ready' : 'empty',
      });
    }
    if (role === 'block') {
      const count = normalizeOptionalNonNegativeInteger(activeBlockCount);
      const hasActiveDocument = Boolean(normalizeSafeId(activeDocumentId));
      return Object.freeze({
        role,
        label: ROLE_LABELS[role],
        value: hasActiveDocument ? 'Текущий документ' : ROLE_EMPTY_VALUES.block,
        detail: hasActiveDocument
          ? 'Считано из текущего текста редактора'
          : 'Привязка появится после открытия сцены',
        count,
        state: hasActiveDocument ? 'ready' : 'unavailable',
      });
    }

    const selected = activeRoles.get(role) || firstRecordByRole(records, role);
    const count = counts[role] || 0;
    return Object.freeze({
      role,
      label: ROLE_LABELS[role],
      value: selected ? selected.label : ROLE_EMPTY_VALUES[role],
      detail: count > 0 ? `${count}` : 'нет',
      count,
      state: selected ? 'ready' : 'empty',
    });
  });
}

function buildActions({ hasProjectTree, activeDocumentId }) {
  const hasActiveDocument = Boolean(normalizeSafeId(activeDocumentId));
  return WRITER_HOME_ACTIONS.map((action) => Object.freeze({
    id: action.id,
    label: action.label,
    action: action.action,
    description: action.description,
    enabled:
      action.enabledWhen === 'always'
      || (action.enabledWhen === 'project-tree' && hasProjectTree)
      || (action.enabledWhen === 'active-document' && hasActiveDocument),
    commandBoundary: 'EXISTING_UI_ACTION_REVALIDATED_BY_COMMAND_KERNEL',
  }));
}

export function countWriterHomeTextBlocks(text) {
  const normalized = String(text || '').trim();
  if (!normalized) return 0;
  return normalized.split(/\n{2,}/u).map((part) => part.trim()).filter(Boolean).length;
}

export function buildWriterHomeProjection(options = {}) {
  const {
    treeRoot = null,
    projectId = '',
    activeDocumentId = '',
    activeBlockCount = null,
    onboardingDismissed = false,
  } = options && typeof options === 'object' ? options : {};
  const { records, parentById, rootRecord, truncated } = collectWriterHomeNodes(treeRoot);
  const hasProjectTree = records.length > 0;
  const counters = selectCounters(rootRecord, records);

  return deepFreeze({
    schemaVersion: 1,
    surfaceId: WRITER_HOME_SURFACE_ID,
    state: hasProjectTree ? 'ready' : 'empty',
    transient: true,
    projectId: normalizeSafeId(projectId),
    activeDocumentId: normalizeSafeId(activeDocumentId),
    sourceProjection: 'query.projectTree',
    treeTruncated: truncated,
    summary: {
      wordCount: counters.wordCount,
      sceneCount: counters.sceneCount,
      completedSceneCount: counters.completedSceneCount,
      progressPercent: counters.progressPercent,
    },
    hierarchy: buildHierarchy({
      records,
      parentById,
      rootRecord,
      projectId,
      activeDocumentId,
      activeBlockCount,
    }),
    actions: buildActions({ hasProjectTree, activeDocumentId }),
    onboarding: {
      visible: onboardingDismissed !== true,
      title: 'Начните с карты проекта',
      body: 'Yalken показывает структуру рукописи до открытия сцены и не выдает интерфейс за сохраненную истину.',
      transientStorage: 'localStorage.writerHome:onboardingDismissed',
    },
  });
}
