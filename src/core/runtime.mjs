import { createHash } from 'node:crypto';

export const CORE_COMMAND_IDS = Object.freeze({
  PROJECT_CREATE: 'project.create',
  PROJECT_APPLY_TEXT_EDIT: 'project.applyTextEdit',
});

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function canonicalSerialize(value) {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalSerialize(item)).join(',')}]`;
  if (t === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalSerialize(value[key])}`).join(',')}}`;
  }
  return 'null';
}

export function hashCoreState(state) {
  const canonical = canonicalSerialize(state);
  return createHash('sha256').update(Buffer.from(canonical, 'utf8')).digest('hex');
}

export function createInitialCoreState() {
  return {
    version: 1,
    data: {
      projects: {},
      lastCommandId: 0,
    },
  };
}

function typedError(code, op, reason, details) {
  const error = { code, op, reason };
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    error.details = cloneJson(details);
  }
  return error;
}

function ok(state) {
  return {
    ok: true,
    state,
    stateHash: hashCoreState(state),
  };
}

function fail(state, code, op, reason, details) {
  return {
    ok: false,
    state,
    stateHash: hashCoreState(state),
    error: typedError(code, op, reason, details),
  };
}

function normalizeState(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return createInitialCoreState();
  }
  if (!input.data || typeof input.data !== 'object' || Array.isArray(input.data)) {
    return createInitialCoreState();
  }
  const projects = input.data.projects;
  if (!projects || typeof projects !== 'object' || Array.isArray(projects)) {
    return createInitialCoreState();
  }
  const version = Number.isInteger(input.version) ? input.version : 1;
  const lastCommandId = Number.isInteger(input.data.lastCommandId) ? input.data.lastCommandId : 0;
  return {
    version,
    data: {
      projects: cloneJson(projects),
      lastCommandId,
    },
  };
}

function applyCreateProject(state, payload) {
  const projectId = typeof payload?.projectId === 'string' ? payload.projectId.trim() : '';
  const title = typeof payload?.title === 'string' && payload.title.trim().length > 0
    ? payload.title.trim()
    : 'Untitled project';
  const sceneId = typeof payload?.sceneId === 'string' && payload.sceneId.trim().length > 0
    ? payload.sceneId.trim()
    : 'scene-1';

  if (!projectId) {
    return fail(state, 'E_CORE_PROJECT_ID_REQUIRED', 'project.create', 'PROJECT_ID_REQUIRED');
  }

  if (state.data.projects[projectId]) {
    return fail(state, 'E_CORE_PROJECT_ALREADY_EXISTS', 'project.create', 'PROJECT_ALREADY_EXISTS', { projectId });
  }

  const next = cloneJson(state);
  next.data.projects[projectId] = {
    id: projectId,
    title,
    scenes: {
      [sceneId]: {
        id: sceneId,
        text: '',
      },
    },
  };
  next.data.lastCommandId += 1;
  return ok(next);
}

function applyTextEdit(state, payload) {
  const projectId = typeof payload?.projectId === 'string' ? payload.projectId.trim() : '';
  const sceneId = typeof payload?.sceneId === 'string' ? payload.sceneId.trim() : '';
  const text = typeof payload?.text === 'string' ? payload.text : '';

  if (!projectId) {
    return fail(state, 'E_CORE_PROJECT_ID_REQUIRED', 'project.applyTextEdit', 'PROJECT_ID_REQUIRED');
  }
  if (!sceneId) {
    return fail(state, 'E_CORE_SCENE_ID_REQUIRED', 'project.applyTextEdit', 'SCENE_ID_REQUIRED');
  }

  const project = state.data.projects[projectId];
  if (!project) {
    return fail(state, 'E_CORE_PROJECT_NOT_FOUND', 'project.applyTextEdit', 'PROJECT_NOT_FOUND', { projectId });
  }

  const scene = project.scenes && project.scenes[sceneId];
  if (!scene) {
    return fail(state, 'E_CORE_SCENE_NOT_FOUND', 'project.applyTextEdit', 'SCENE_NOT_FOUND', { projectId, sceneId });
  }

  const next = cloneJson(state);
  next.data.projects[projectId].scenes[sceneId].text = text;
  next.data.lastCommandId += 1;
  return ok(next);
}

export function reduceCoreState(stateInput, commandInput) {
  const state = normalizeState(stateInput);
  const command = commandInput && typeof commandInput === 'object' && !Array.isArray(commandInput)
    ? commandInput
    : { type: '' };
  const type = typeof command.type === 'string' ? command.type : '';

  if (type === CORE_COMMAND_IDS.PROJECT_CREATE) {
    return applyCreateProject(state, command.payload || {});
  }
  if (type === CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT) {
    return applyTextEdit(state, command.payload || {});
  }

  return fail(state, 'E_CORE_COMMAND_NOT_FOUND', type || 'unknown', 'COMMAND_NOT_FOUND', { type });
}

export function reduceCoreStateUnsafe(stateInput, commandInput) {
  const result = reduceCoreState(stateInput, commandInput);
  return result.state;
}

export function applyCoreSequence(initialState, commands) {
  let current = normalizeState(initialState);
  for (const command of Array.isArray(commands) ? commands : []) {
    const result = reduceCoreState(current, command);
    if (!result.ok) return result;
    current = result.state;
  }
  return ok(current);
}
