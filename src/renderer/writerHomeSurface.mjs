function clearNode(node) {
  if (node && typeof node.replaceChildren === 'function') {
    node.replaceChildren();
  }
}

function appendText(parent, text) {
  parent.appendChild(document.createTextNode(String(text || '')));
}

function createElement(tagName, className = '', attributes = {}) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  for (const [name, value] of Object.entries(attributes)) {
    if (value === null || value === undefined || value === false) continue;
    if (name === 'text') {
      appendText(element, value);
    } else if (name === 'dataset' && value && typeof value === 'object') {
      for (const [key, dataValue] of Object.entries(value)) {
        element.dataset[key] = String(dataValue);
      }
    } else if (name in element && name !== 'role') {
      element[name] = value;
    } else {
      element.setAttribute(name, String(value));
    }
  }
  return element;
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) return '0';
  return new Intl.NumberFormat('ru-RU').format(number);
}

function formatCount(value) {
  if (value === null || value === undefined) return 'ожидание';
  return formatNumber(value);
}

function appendChildren(parent, children) {
  for (const child of children) {
    if (!child) continue;
    parent.appendChild(child);
  }
  return parent;
}

function renderActionButton(action) {
  const button = createElement('button', 'writer-home__action', {
    type: 'button',
    dataset: {
      action: action.action,
      writerHomeAction: action.id,
    },
    'aria-label': action.description || action.label,
    title: action.description || action.label,
  });
  if (action.enabled !== true) {
    button.disabled = true;
    button.setAttribute('aria-disabled', 'true');
  }
  const icon = createElement('span', `writer-home__action-icon writer-home__action-icon--${action.id}`, {
    'aria-hidden': 'true',
  });
  const label = createElement('span', 'writer-home__action-label', { text: action.label });
  appendChildren(button, [icon, label]);
  return button;
}

function renderHierarchyRow(row) {
  const item = createElement('li', `writer-home__identity-row writer-home__identity-row--${row.state || 'empty'}`, {
    dataset: {
      writerHomeRole: row.role,
      writerHomeState: row.state || 'empty',
    },
  });
  const label = createElement('span', 'writer-home__identity-label', { text: row.label });
  const value = createElement('span', 'writer-home__identity-value', { text: row.value });
  const detail = createElement('span', 'writer-home__identity-detail', {
    text: row.role === 'block' ? row.detail : formatCount(row.count),
  });
  appendChildren(item, [label, value, detail]);
  return item;
}

function renderSummary(summary) {
  const list = createElement('dl', 'writer-home__stats', { 'aria-label': 'Сводка рукописи' });
  const rows = [
    ['Слов', formatNumber(summary?.wordCount)],
    ['Сцен', formatNumber(summary?.sceneCount)],
    ['Готово', `${formatNumber(summary?.progressPercent)}%`],
  ];
  for (const [label, value] of rows) {
    list.appendChild(createElement('dt', 'writer-home__stat-label', { text: label }));
    list.appendChild(createElement('dd', 'writer-home__stat-value', { text: value }));
  }
  return list;
}

function renderOnboarding(onboarding, onDismissOnboarding) {
  if (!onboarding || onboarding.visible !== true) return null;
  const panel = createElement('aside', 'writer-home__onboarding', {
    'aria-label': 'Стартовая подсказка',
  });
  const content = createElement('div', 'writer-home__onboarding-copy');
  content.appendChild(createElement('h2', 'writer-home__onboarding-title', { text: onboarding.title }));
  content.appendChild(createElement('p', 'writer-home__onboarding-body', { text: onboarding.body }));
  const dismiss = createElement('button', 'writer-home__dismiss', {
    type: 'button',
    text: 'Понятно',
    'aria-label': 'Скрыть стартовую подсказку',
  });
  dismiss.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (typeof onDismissOnboarding === 'function') onDismissOnboarding();
  });
  appendChildren(panel, [content, dismiss]);
  return panel;
}

export function renderWriterHomeSurface(host, projection, options = {}) {
  if (!(host instanceof HTMLElement)) return false;
  clearNode(host);
  const source = projection && typeof projection === 'object' ? projection : {};
  host.dataset.writerHomeState = source.state || 'empty';
  host.setAttribute('aria-label', 'Дом проекта');
  host.setAttribute('aria-live', 'polite');

  const shell = createElement('div', 'writer-home__shell');
  const header = createElement('header', 'writer-home__header');
  const headerCopy = createElement('div', 'writer-home__header-copy');
  headerCopy.appendChild(createElement('div', 'writer-home__eyebrow', { text: 'Дом проекта' }));
  headerCopy.appendChild(createElement('h1', 'writer-home__title', { text: 'Рукопись рядом' }));
  headerCopy.appendChild(createElement('p', 'writer-home__subtitle', {
    text: 'Откройте проект, сцену или поиск без догадок о том, что уже сохранено.',
  }));
  appendChildren(header, [headerCopy, renderSummary(source.summary)]);

  const identity = createElement('ol', 'writer-home__identity', {
    'aria-label': 'Иерархия проекта',
  });
  for (const row of Array.isArray(source.hierarchy) ? source.hierarchy : []) {
    identity.appendChild(renderHierarchyRow(row));
  }

  const actions = createElement('div', 'writer-home__actions', {
    role: 'group',
    'aria-label': 'Команды дома проекта',
  });
  for (const action of Array.isArray(source.actions) ? source.actions : []) {
    actions.appendChild(renderActionButton(action));
  }

  const onboarding = renderOnboarding(source.onboarding, options.onDismissOnboarding);
  appendChildren(shell, [header, identity, actions, onboarding]);
  host.appendChild(shell);
  return true;
}
