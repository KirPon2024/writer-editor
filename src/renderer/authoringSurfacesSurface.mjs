import { AUTHORING_SURFACES_SURFACE_ID } from '../core/authoring-surfaces-projection-v1.mjs';

function clearNode(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function appendText(parent, value) {
  parent.appendChild(document.createTextNode(String(value || '')));
}

function createElement(tagName, className = '', text = '') {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text) appendText(element, text);
  return element;
}

function applyActionAttributes(element, action) {
  if (!action || !action.action) return;
  element.dataset.action = action.action;
  element.dataset.sourceSurface = action.sourceSurface || AUTHORING_SURFACES_SURFACE_ID;
  if (action.commandId) element.dataset.commandId = action.commandId;
  if (action.queryId) element.dataset.queryId = action.queryId;
}

function renderActionItem(item, variant) {
  const button = createElement('button', `authoring-surface__${variant}`, '');
  button.type = 'button';
  button.disabled = item.enabled === false;
  button.dataset.authoringSurfaceItem = item.id;
  button.dataset.state = item.state || 'ready';
  button.dataset.stateClass = item.stateClass || 'DERIVED_STATE';
  if (variant === 'posture') {
    button.setAttribute('aria-pressed', item.active ? 'true' : 'false');
  }
  applyActionAttributes(button, item.action);

  const label = createElement('span', `authoring-surface__${variant}-label`, item.label);
  const value = createElement('span', `authoring-surface__${variant}-value`, item.value);
  button.append(label, value);
  return button;
}

function renderPostures(postures = []) {
  const group = createElement('div', 'authoring-surface__postures', '');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Позиция письма');
  for (const posture of postures) {
    group.appendChild(renderActionItem(posture, 'posture'));
  }
  return group;
}

function renderSurfaceGrid(surfaces = []) {
  const grid = createElement('div', 'authoring-surface__grid', '');
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', 'Рабочие поверхности');
  for (const surface of surfaces) {
    grid.appendChild(renderActionItem(surface, 'item'));
  }
  return grid;
}

export function renderAuthoringSurfacesSurface(host, projection) {
  if (!(host instanceof HTMLElement)) return false;
  if (!projection || projection.surfaceId !== AUTHORING_SURFACES_SURFACE_ID) {
    host.hidden = true;
    clearNode(host);
    return false;
  }

  clearNode(host);
  host.hidden = false;
  host.dataset.authoringSurface = projection.surfaceId;
  host.dataset.authoringSurfacePosture = projection.summary?.posture || 'write';
  host.dataset.authoringSurfaceSheetState = projection.summary?.sheetState || 'empty';

  const shell = createElement('div', 'authoring-surface__shell', '');
  const header = createElement('header', 'authoring-surface__header', '');
  const copy = createElement('div', 'authoring-surface__copy', '');
  const eyebrow = createElement('div', 'authoring-surface__eyebrow', 'Рабочая сцена');
  const title = createElement('h2', 'authoring-surface__title', projection.summary?.activeTitle || 'Сцена');
  const meta = createElement('div', 'authoring-surface__meta', `${projection.summary?.wordCount || 0} слов`);

  copy.append(eyebrow, title);
  header.append(copy, meta);
  shell.append(header, renderPostures(projection.postures), renderSurfaceGrid(projection.surfaces));
  host.appendChild(shell);
  return true;
}
