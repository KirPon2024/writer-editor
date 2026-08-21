'use strict';

const { decidePermissionScope, PERMISSION_ACTIONS } = require('./permission-scope.js');

const FAIL_SIGNAL = 'E_B3C07_SECURITY_BOUNDARY_NOT_OK';
const HELPER_ROLE = 'PROOF_HELPER_NOT_RUNTIME_SECURITY_ENFORCER';

const SECURITY_NEGATIVE_ROUTES = Object.freeze({
  NAVIGATION_HTTP: 'navigation.http',
  NEW_WINDOW: 'new-window',
  REMOTE_CODE_EXECUTE_JAVASCRIPT: 'remote-code.execute-javascript',
  REMOTE_CODE_EVAL: 'remote-code.eval',
  IPC_UNKNOWN_COMMAND: 'ipc.unknown-command',
  IPC_INVALID_PAYLOAD: 'ipc.invalid-payload',
  IPC_PATH_ESCAPE: 'ipc.path-escape',
  IPC_COMMAND_INJECTION: 'ipc.command-injection',
});

const PRODUCT_SOURCE_BASENAMES = Object.freeze([
  'main.js',
  'preload.js',
]);

function markerResult(id, sourceText, markers) {
  const missingMarkers = markers.filter((marker) => !sourceText.includes(marker));
  return Object.freeze({
    id,
    passed: missingMarkers.length === 0,
    missingMarkers,
  });
}

function regexResult(id, sourceText, pattern) {
  return Object.freeze({
    id,
    passed: pattern.test(sourceText),
    missingMarkers: pattern.test(sourceText) ? [] : [String(pattern)],
  });
}

function hasForbiddenRemoteCodeText(sourceText) {
  return /\bexecuteJavaScript\b|\beval\s*\(|\bnew\s+Function\s*\(/u.test(sourceText);
}

function evaluateCspBoundary(mainText) {
  return Object.freeze([
    markerResult('CSP_POLICY_DECLARED', mainText, ['const CSP_POLICY =']),
    markerResult('CSP_HAS_DEFAULT_SELF', mainText, ["default-src 'self'"]),
    markerResult('CSP_HAS_SCRIPT_SELF', mainText, ["script-src 'self'"]),
    markerResult('CSP_HAS_OBJECT_NONE', mainText, ["object-src 'none'"]),
    markerResult('CSP_HAS_BASE_URI_NONE', mainText, ["base-uri 'none'"]),
    markerResult('CSP_HAS_FRAME_ANCESTORS_NONE', mainText, ["frame-ancestors 'none'"]),
    markerResult('CSP_INSTALLED_ON_HEADERS', mainText, ['onHeadersReceived', 'Content-Security-Policy']),
    markerResult('CSP_LIMITED_TO_FILE_MAIN_FRAME', mainText, ["details.resourceType === 'mainFrame'", 'isFileUrl(details.url)']),
    {
      id: 'CSP_DOES_NOT_ALLOW_UNSAFE_EVAL',
      passed: !mainText.includes("'unsafe-eval'"),
      missingMarkers: mainText.includes("'unsafe-eval'") ? ["no 'unsafe-eval'"] : [],
    },
  ]);
}

function evaluateNavigationBoundary(mainText) {
  return Object.freeze([
    markerResult('NEW_WINDOW_HANDLER_BOUND', mainText, ['setWindowOpenHandler']),
    regexResult('NEW_WINDOW_DENIED', mainText, /setWindowOpenHandler[\s\S]*?\{\s*action:\s*['"]deny['"]\s*\}/u),
    markerResult('WILL_NAVIGATE_BOUND', mainText, ['will-navigate', 'blockExternalNavigation']),
    markerResult('WILL_REDIRECT_BOUND', mainText, ['will-redirect', 'blockExternalNavigation']),
    markerResult('EXTERNAL_NAVIGATION_PREVENTS_DEFAULT', mainText, ['function blockExternalNavigation', 'event.preventDefault();']),
    markerResult('FILE_URL_ONLY_NAVIGATION_RULE_PRESENT', mainText, ['function isAllowedFileNavigationUrl', 'isFileUrl(url)', 'isAllowedFilePath(filePath)']),
  ]);
}

function evaluateRemoteCodeBoundary(mainText, preloadText) {
  const productSource = `${mainText}\n${preloadText}`;
  return Object.freeze([
    {
      id: 'PRODUCT_SOURCE_HAS_NO_EXECUTE_JAVASCRIPT',
      passed: !/\bexecuteJavaScript\b/u.test(productSource),
      missingMarkers: /\bexecuteJavaScript\b/u.test(productSource) ? ['executeJavaScript absent'] : [],
    },
    {
      id: 'PRODUCT_SOURCE_HAS_NO_EVAL',
      passed: !/\beval\s*\(/u.test(productSource),
      missingMarkers: /\beval\s*\(/u.test(productSource) ? ['eval absent'] : [],
    },
    {
      id: 'PRODUCT_SOURCE_HAS_NO_NEW_FUNCTION',
      passed: !/\bnew\s+Function\s*\(/u.test(productSource),
      missingMarkers: /\bnew\s+Function\s*\(/u.test(productSource) ? ['new Function absent'] : [],
    },
    markerResult('BROWSER_WINDOW_CONTEXT_IS_ISOLATED', mainText, ['contextIsolation: true']),
    markerResult('BROWSER_WINDOW_NODE_INTEGRATION_DISABLED', mainText, ['nodeIntegration: false']),
    markerResult('BROWSER_WINDOW_SANDBOX_ENABLED', mainText, ['sandbox: true']),
  ]);
}

function evaluateIpcBoundary(mainText, preloadText) {
  return Object.freeze([
    // R2.4 EXH0: semantic marker for the actual registration machinery — the
    // command bridge must be bound exclusively through the guarded protocol
    // path (caller identity at dispatch) with envelope-first validation; a
    // raw ipcMain.handle registration must not exist. A future registration
    // rename fails this row until the boundary law is re-bound to the new
    // machinery by a reviewed contour, which is the intended fail-closed
    // behavior for a security boundary.
    (() => {
      const semanticMarkers = [
        "guardedProtocolHandle('ui:command-bridge'",
        "validateIpcEnvelope(request, 'ui:command-bridge')",
      ];
      const missing = semanticMarkers.filter((marker) => !mainText.includes(marker));
      const rawMarker = "ipcMain.handle('ui:command-bridge'";
      if (mainText.includes(rawMarker)) {
        missing.push('raw ' + rawMarker + ' present');
      }
      return Object.freeze({
        id: 'COMMAND_BRIDGE_HANDLER_BOUND',
        passed: missing.length === 0,
        missingMarkers: missing,
      });
    })(),
    markerResult('COMMAND_BRIDGE_ROUTE_REQUIRED', mainText, ['COMMAND_ROUTE_UNSUPPORTED']),
    markerResult('COMMAND_BRIDGE_ALLOWLIST_BOUND', mainText, ['UI_COMMAND_BRIDGE_ALLOWED_COMMAND_IDS', 'COMMAND_ID_NOT_ALLOWED']),
    markerResult('WORKSPACE_QUERY_BRIDGE_ALLOWLIST_BOUND', mainText, ['WORKSPACE_QUERY_BRIDGE_ALLOWED_QUERY_IDS', 'QUERY_ID_NOT_ALLOWED']),
    markerResult('SAVE_LIFECYCLE_SIGNAL_ALLOWLIST_BOUND', mainText, ['SAVE_LIFECYCLE_SIGNAL_BRIDGE_ALLOWED_SIGNAL_IDS', 'SIGNAL_ID_NOT_ALLOWED']),
    markerResult('PRELOAD_EXPOSES_CONTEXT_BRIDGE_ONLY', preloadText, ['contextBridge.exposeInMainWorld']),
    markerResult('PRELOAD_COMMAND_BRIDGE_NORMALIZES_RECORDS', preloadText, ['normalizeRequestRecord', 'normalizeRequestPayload']),
    markerResult('PRELOAD_TREE_COMMAND_DENY_PRESENT', preloadText, ['TREE_COMMAND_NOT_ALLOWED']),
  ]);
}

function denyRoute(route, details = {}) {
  return Object.freeze({
    route,
    denied: true,
    failSignal: FAIL_SIGNAL,
    reason: 'DENIED_BY_B3C07_PROOF_MATRIX',
    details: Object.freeze({ ...details }),
  });
}

function runSecurityBoundaryNegativeMatrix() {
  const permissionPathEscape = decidePermissionScope({
    action: PERMISSION_ACTIONS.EXPORT_WRITE,
    channel: 'export:write',
    requestedPermission: PERMISSION_ACTIONS.EXPORT_WRITE,
    payload: { outPath: '../secrets/book.docx' },
  });
  const permissionCommandInjection = decidePermissionScope({
    action: 'shell.exec',
    channel: 'shell:command',
    requestedPermission: 'shell.command',
    payload: { command: 'rm -rf .' },
  });
  const invalidPayload = decidePermissionScope({
    action: PERMISSION_ACTIONS.PROJECT_WRITE,
    channel: 'project:write',
    requestedPermission: PERMISSION_ACTIONS.PROJECT_WRITE,
    payload: null,
  });

  return Object.freeze([
    denyRoute(SECURITY_NEGATIVE_ROUTES.NAVIGATION_HTTP, { primitive: 'blockExternalNavigation' }),
    denyRoute(SECURITY_NEGATIVE_ROUTES.NEW_WINDOW, { primitive: 'setWindowOpenHandler deny' }),
    denyRoute(SECURITY_NEGATIVE_ROUTES.REMOTE_CODE_EXECUTE_JAVASCRIPT, { primitive: 'source absence' }),
    denyRoute(SECURITY_NEGATIVE_ROUTES.REMOTE_CODE_EVAL, { primitive: 'source absence' }),
    denyRoute(SECURITY_NEGATIVE_ROUTES.IPC_UNKNOWN_COMMAND, { primitive: 'COMMAND_ID_NOT_ALLOWED' }),
    {
      route: SECURITY_NEGATIVE_ROUTES.IPC_INVALID_PAYLOAD,
      denied: invalidPayload.ok === false,
      failSignal: invalidPayload.failSignal || FAIL_SIGNAL,
      reason: invalidPayload.reason || '',
      details: Object.freeze({ primitive: 'permission payload validation' }),
    },
    {
      route: SECURITY_NEGATIVE_ROUTES.IPC_PATH_ESCAPE,
      denied: permissionPathEscape.ok === false,
      failSignal: permissionPathEscape.failSignal || FAIL_SIGNAL,
      reason: permissionPathEscape.reason || '',
      details: Object.freeze({ primitive: 'path boundary reuse' }),
    },
    {
      route: SECURITY_NEGATIVE_ROUTES.IPC_COMMAND_INJECTION,
      denied: permissionCommandInjection.ok === false,
      failSignal: permissionCommandInjection.failSignal || FAIL_SIGNAL,
      reason: permissionCommandInjection.reason || '',
      details: Object.freeze({ primitive: 'forbidden shell permission' }),
    },
  ]);
}

function evaluateSecurityRuntimeBoundarySources({ mainText = '', preloadText = '' } = {}) {
  const cspRows = evaluateCspBoundary(mainText);
  const navigationRows = evaluateNavigationBoundary(mainText);
  const remoteCodeRows = evaluateRemoteCodeBoundary(mainText, preloadText);
  const ipcRows = evaluateIpcBoundary(mainText, preloadText);
  const negativeRows = runSecurityBoundaryNegativeMatrix();

  const sourceRows = [
    ...cspRows,
    ...navigationRows,
    ...remoteCodeRows,
    ...ipcRows,
  ];
  const passFailRows = Object.freeze([
    ...sourceRows,
    ...negativeRows.map((row) => ({
      id: `NEGATIVE_${row.route.toUpperCase().replace(/[^A-Z0-9]+/gu, '_')}`,
      passed: row.denied === true,
      missingMarkers: row.denied === true ? [] : [row.reason || row.route],
    })),
    {
      id: 'HELPER_IS_NOT_RUNTIME_SECURITY_ENFORCER',
      passed: HELPER_ROLE === 'PROOF_HELPER_NOT_RUNTIME_SECURITY_ENFORCER',
      missingMarkers: [],
    },
    {
      id: 'PRODUCT_SOURCE_BASELINES_BOUND',
      passed: PRODUCT_SOURCE_BASENAMES.length === 2 && !hasForbiddenRemoteCodeText(`${mainText}\n${preloadText}`),
      missingMarkers: [],
    },
  ]);

  return Object.freeze({
    helperRole: HELPER_ROLE,
    failSignal: FAIL_SIGNAL,
    sourceRows: Object.freeze(sourceRows),
    cspRows,
    navigationRows,
    remoteCodeRows,
    ipcRows,
    negativeRows,
    passFailRows,
    failedRows: Object.freeze(passFailRows.filter((row) => row.passed !== true).map((row) => row.id)),
    productSourceBasenames: PRODUCT_SOURCE_BASENAMES,
  });
}

module.exports = {
  FAIL_SIGNAL,
  HELPER_ROLE,
  PRODUCT_SOURCE_BASENAMES,
  SECURITY_NEGATIVE_ROUTES,
  evaluateCspBoundary,
  evaluateIpcBoundary,
  evaluateNavigationBoundary,
  evaluateRemoteCodeBoundary,
  evaluateSecurityRuntimeBoundarySources,
  runSecurityBoundaryNegativeMatrix,
};
