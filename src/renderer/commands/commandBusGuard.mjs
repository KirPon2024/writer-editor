import { resolveCommandId } from './commandNamespaceCanon.mjs';

export const COMMAND_BUS_ROUTE = 'command.bus';

export const REQUIRED_BYPASS_SCENARIO_IDS = Object.freeze([
  'hotkey-bypass',
  'palette-bypass',
  'ipc-direct-bypass',
  'context-button-bypass',
  'plugin-overlay-bypass',
]);

const BYPASS_ROUTE_TO_SCENARIO = Object.freeze({
  'hotkey.direct': 'hotkey-bypass',
  'palette.direct': 'palette-bypass',
  'ipc.renderer-main.direct': 'ipc-direct-bypass',
  'context.button.direct': 'context-button-bypass',
  'plugin.overlay.exec': 'plugin-overlay-bypass',
});

function normalizeRoute(route) {
  return typeof route === 'string' ? route.trim() : '';
}

function makeBypassError(commandId, route, scenarioId) {
  return {
    ok: false,
    error: {
      code: 'E_COMMAND_SURFACE_BYPASS',
      op: commandId,
      reason: 'COMMAND_SURFACE_BYPASS',
      details: {
        failSignal: 'E_COMMAND_SURFACE_BYPASS',
        route,
        scenarioId,
      },
    },
  };
}

export function evaluateCommandBusRoute(input = {}) {
  const route = normalizeRoute(input.route);
  const scenarioId = BYPASS_ROUTE_TO_SCENARIO[route] || '';
  if (!route || route !== COMMAND_BUS_ROUTE) {
    return {
      ok: false,
      route,
      scenarioId,
      failSignal: 'E_COMMAND_SURFACE_BYPASS',
      failReason: route ? 'COMMAND_ROUTE_BYPASS' : 'COMMAND_ROUTE_MISSING',
    };
  }
  return {
    ok: true,
    route: COMMAND_BUS_ROUTE,
    scenarioId: '',
    failSignal: '',
    failReason: '',
  };
}

export async function runCommandThroughBus(runCommand, commandId, payload = {}, options = {}) {
  if (typeof runCommand !== 'function') {
    return {
      ok: false,
      error: {
        code: 'E_COMMAND_FAILED',
        op: commandId,
        reason: 'COMMAND_RUNNER_INVALID',
      },
    };
  }
  const routeState = evaluateCommandBusRoute({ route: options.route });
  if (!routeState.ok) {
    return makeBypassError(commandId, routeState.route, routeState.scenarioId);
  }
  const resolved = resolveCommandId(commandId, {
    mode: options.mode,
    today: options.today,
    promotionMode: options.promotionMode,
  });
  if (!resolved.ok) {
    return {
      ok: false,
      error: {
        code: resolved.code || 'E_COMMAND_NAMESPACE_UNKNOWN',
        op: typeof commandId === 'string' && commandId.length > 0 ? commandId : String(commandId || ''),
        reason: resolved.reason || 'COMMAND_NAMESPACE_RESOLUTION_FAILED',
        details: resolved.details && typeof resolved.details === 'object' && !Array.isArray(resolved.details)
          ? { ...resolved.details }
          : undefined,
      },
    };
  }
  return runCommand(resolved.commandId, payload);
}
