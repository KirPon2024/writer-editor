import { CORE_COMMAND_IDS } from '../core/runtime.mjs';
import {
  STAGE10_ACTIVATION_MODES,
  createStage10ProductRuntime,
  reopenStage10ProductRuntime,
} from './stage10ProductWiring.mjs';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function typedError(code, op, reason, details) {
  const error = { code, op, reason };
  if (isPlainObject(details)) error.details = cloneJson(details);
  return error;
}

function activation(controlId) {
  return {
    mode: STAGE10_ACTIVATION_MODES.DOM_VISIBLE_CONTROL_LISTENER_FALLBACK,
    controlId,
    visibleControl: true,
  };
}

export function createStage10ApplicationBootstrap(input = {}) {
  const persistencePort = input.persistencePort;
  const uiPort = isPlainObject(input.uiPort) ? input.uiPort : {};
  const now = typeof input.now === 'function' ? input.now : undefined;
  let runtime = null;
  let projectId = '';

  async function createProjectRuntime(projectInput = {}) {
    projectId = normalizeString(projectInput.projectId);
    if (!projectId) {
      throw typedError('E_STAGE10_BOOTSTRAP_PROJECT_ID_REQUIRED', 'stage10.applicationBootstrap.create', 'PROJECT_ID_REQUIRED');
    }
    runtime = await createStage10ProductRuntime({
      projectId,
      actorId: normalizeString(projectInput.actorId) || 'local-author',
      sessionId: normalizeString(projectInput.sessionId) || `stage10:${projectId}`,
      persistencePort,
      uiPort,
      now,
      capabilitySnapshot: projectInput.capabilitySnapshot,
    });
    const receipt = await runtime.dispatchVisibleCommand(
      CORE_COMMAND_IDS.PROJECT_CREATE,
      {
        projectId,
        title: normalizeString(projectInput.title) || projectId,
      },
      activation('stage10-app-bootstrap-project-create'),
    );
    if (!receipt?.ok) {
      throw typedError('E_STAGE10_BOOTSTRAP_CREATE_COMMAND_FAILED', 'stage10.applicationBootstrap.create', 'PROJECT_CREATE_COMMAND_FAILED', {
        error: receipt?.error,
      });
    }
    return {
      ok: true,
      projectId,
      receipt: receipt.receipt,
      surface: runtime.getVisibleSurface(),
      readModels: runtime.getReadModels(),
    };
  }

  async function reopenProjectRuntime(projectInput = {}) {
    projectId = normalizeString(projectInput.projectId) || projectId;
    if (!projectId) {
      throw typedError('E_STAGE10_BOOTSTRAP_PROJECT_ID_REQUIRED', 'stage10.applicationBootstrap.reopen', 'PROJECT_ID_REQUIRED');
    }
    runtime = await reopenStage10ProductRuntime({
      projectId,
      persistencePort,
      uiPort,
      now,
      capabilitySnapshot: projectInput.capabilitySnapshot,
    });
    return {
      ok: true,
      projectId,
      surface: runtime.getVisibleSurface(),
      readModels: runtime.getReadModels(),
    };
  }

  async function dispatchProjectCommand(commandId, payload = {}, activationInput = {}) {
    if (!runtime) {
      throw typedError('E_STAGE10_BOOTSTRAP_RUNTIME_MISSING', 'stage10.applicationBootstrap.dispatch', 'APPLICATION_BOOTSTRAP_RUNTIME_MISSING');
    }
    return runtime.dispatchVisibleCommand(
      commandId,
      payload,
      Object.keys(activationInput).length > 0 ? activationInput : activation(`stage10-app-bootstrap-${commandId}`),
    );
  }

  async function dispatchCanonicalProjectCommand(commandId, payload = {}, canonicalProjectTruth = {}) {
    if (!runtime) {
      throw typedError('E_STAGE10_BOOTSTRAP_RUNTIME_MISSING', 'stage10.applicationBootstrap.dispatchCanonical', 'APPLICATION_BOOTSTRAP_RUNTIME_MISSING');
    }
    return runtime.dispatchVisibleCommand(
      commandId,
      payload,
      activation(`stage10-app-bootstrap-${commandId}`),
      { canonicalProjectTruth },
    );
  }

  return {
    createProjectRuntime,
    reopenProjectRuntime,
    dispatchProjectCommand,
    dispatchCanonicalProjectCommand,
    getRuntime: () => runtime,
    getProjectId: () => projectId,
  };
}
