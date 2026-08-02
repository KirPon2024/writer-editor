import {
  STAGE10_ACTIVATION_MODES,
  STAGE10_PRODUCT_COMMAND_IDS,
} from './stage10ProductWiring.mjs';
import { CORE_COMMAND_IDS } from '../core/runtime.mjs';

export const STAGE10_APPLICATION_COMMAND_ROUTE_SCHEMA = 'yalken.stage10.applicationCommandRoute.v1';

const CANONICAL_AUTHOR_COMMAND_IDS = new Set(
  Object.values(CORE_COMMAND_IDS).filter((commandId) => ![
    CORE_COMMAND_IDS.PROJECT_CREATE,
    CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
    CORE_COMMAND_IDS.MANUAL_MAP_EXPORT_JSON,
    CORE_COMMAND_IDS.MANUAL_MAP_EXPORT_IMAGE_PDF,
    CORE_COMMAND_IDS.MANUAL_MAP_IMPORT_JSON_REPEAT,
  ].includes(commandId)),
);
const ALLOWED_COMMAND_IDS = new Set([
  ...Object.values(STAGE10_PRODUCT_COMMAND_IDS),
  ...CANONICAL_AUTHOR_COMMAND_IDS,
]);

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function typedError(code, commandId, reason, details) {
  const error = { code, op: commandId || 'stage10.applicationCommandRoute', reason };
  if (details && typeof details === 'object' && !Array.isArray(details)) error.details = { ...details };
  return { ok: false, error };
}

export function createStage10ApplicationCommandRoute(input = {}) {
  const getBootstrap = typeof input.getBootstrap === 'function' ? input.getBootstrap : () => null;
  const canonicalProjectTruthPort = input.canonicalProjectTruthPort;
  return {
    schemaVersion: STAGE10_APPLICATION_COMMAND_ROUTE_SCHEMA,
    async dispatch(commandIdInput, payloadInput = {}) {
      const commandId = normalizeString(commandIdInput);
      if (!ALLOWED_COMMAND_IDS.has(commandId)) {
        return typedError('E_STAGE10_APPLICATION_COMMAND_NOT_ALLOWED', commandId, 'STAGE10_APPLICATION_COMMAND_NOT_ALLOWED');
      }
      const bootstrap = getBootstrap();
      if (!bootstrap || typeof bootstrap.dispatchProjectCommand !== 'function') {
        return typedError('E_STAGE10_APPLICATION_BOOTSTRAP_MISSING', commandId, 'STAGE10_APPLICATION_BOOTSTRAP_MISSING');
      }
      const activeProjectId = normalizeString(bootstrap.getProjectId?.());
      const payload = payloadInput && typeof payloadInput === 'object' && !Array.isArray(payloadInput)
        ? JSON.parse(JSON.stringify(payloadInput))
        : {};
      const requestedProjectId = normalizeString(payload.projectId);
      if (!activeProjectId || (requestedProjectId && requestedProjectId !== activeProjectId)) {
        return typedError('E_STAGE10_APPLICATION_PROJECT_MISMATCH', commandId, 'STAGE10_APPLICATION_PROJECT_MISMATCH', {
          requestedProjectId,
          activeProjectId,
        });
      }
      payload.projectId = activeProjectId;
      if (CANONICAL_AUTHOR_COMMAND_IDS.has(commandId)) {
        if (
          !canonicalProjectTruthPort
          || typeof canonicalProjectTruthPort.prepare !== 'function'
          || typeof bootstrap.dispatchCanonicalProjectCommand !== 'function'
        ) {
          return typedError(
            'E_STAGE10_CANONICAL_PROJECT_TRUTH_PORT_MISSING',
            commandId,
            'CANONICAL_PROJECT_TRUTH_PORT_MISSING',
          );
        }
        const canonicalProjectTruth = await canonicalProjectTruthPort.prepare(commandId, payload);
        if (canonicalProjectTruth?.ok === false) return canonicalProjectTruth;
        return bootstrap.dispatchCanonicalProjectCommand(commandId, payload, canonicalProjectTruth);
      }
      return bootstrap.dispatchProjectCommand(commandId, payload, {
        mode: STAGE10_ACTIVATION_MODES.DOM_VISIBLE_CONTROL_LISTENER_FALLBACK,
        controlId: `stage10-product-command-${commandId}`,
      });
    },
  };
}
