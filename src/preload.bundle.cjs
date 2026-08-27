var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// src/core/ipc-envelope-v1.cjs
var require_ipc_envelope_v1 = __commonJS({
  "src/core/ipc-envelope-v1.cjs"(exports2, module2) {
    "use strict";
    var IpcEnvelopeError = class extends Error {
      constructor(code, detail = "") {
        super(detail ? `${code}: ${detail}` : code);
        this.code = code;
      }
    };
    var ENVELOPE_VERSION = 1;
    var isObjectRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
    var BRIDGE_KEY_SETS = Object.freeze({
      "ui:command-bridge": Object.freeze(["v", "correlationId", "issuedAt", "route", "commandId", "payload"]),
      "ui:workspace-query-bridge": Object.freeze(["v", "correlationId", "issuedAt", "queryId", "payload"]),
      "ui:save-lifecycle-signal-bridge": Object.freeze(["v", "correlationId", "issuedAt", "signalId", "payload"])
    });
    var BRIDGE_ID_FIELD = Object.freeze({
      "ui:command-bridge": "commandId",
      "ui:workspace-query-bridge": "queryId",
      "ui:save-lifecycle-signal-bridge": "signalId"
    });
    function validateIpcEnvelope(envelope, channel, { maxDepth = 8, maxKeys = 256, maxBytes = 1024 * 1024 } = {}) {
      if (!isObjectRecord(envelope)) return { ok: false, code: "E_ENVELOPE_SHAPE" };
      const keySet = BRIDGE_KEY_SETS[channel];
      if (!keySet) return { ok: false, code: "E_ENVELOPE_CHANNEL_UNKNOWN" };
      if (envelope.v !== ENVELOPE_VERSION) return { ok: false, code: "E_ENVELOPE_VERSION" };
      if (typeof envelope.correlationId !== "string" || envelope.correlationId.length < 8 || envelope.correlationId.length > 128) {
        return { ok: false, code: "E_ENVELOPE_CORRELATION_ID" };
      }
      if (typeof envelope.issuedAt !== "string" || !Number.isFinite(Date.parse(envelope.issuedAt))) {
        return { ok: false, code: "E_ENVELOPE_ISSUED_AT" };
      }
      for (const key of Object.keys(envelope)) {
        if (!keySet.includes(key)) return { ok: false, code: "E_ENVELOPE_KEY_UNKNOWN", detail: key };
      }
      const idField = BRIDGE_ID_FIELD[channel];
      if (typeof envelope[idField] !== "string" || envelope[idField].length === 0) {
        return { ok: false, code: "E_ENVELOPE_IDENTITY_MISSING" };
      }
      if (!isObjectRecord(envelope.payload)) return { ok: false, code: "E_ENVELOPE_PAYLOAD_SHAPE" };
      let keys = 0;
      const seen = /* @__PURE__ */ new Set();
      const walk = (value, depth) => {
        if (depth > maxDepth) return { code: "E_ENVELOPE_DEPTH" };
        if (!isObjectRecord(value) && !Array.isArray(value)) return null;
        if (seen.has(value)) return { code: "E_ENVELOPE_CYCLE" };
        seen.add(value);
        const entries = Array.isArray(value) ? value.map((v, i) => [i, v]) : Object.entries(value);
        keys += entries.length;
        if (keys > maxKeys) return { code: "E_ENVELOPE_BREADTH" };
        for (const [, v] of entries) {
          const inner = walk(v, depth + 1);
          if (inner) return inner;
        }
        seen.delete(value);
        return null;
      };
      const boundViolation = walk(envelope.payload, 0);
      if (boundViolation) return { ok: false, code: boundViolation.code };
      let size = 0;
      try {
        size = Buffer.byteLength(JSON.stringify(envelope.payload));
      } catch {
        return { ok: false, code: "E_ENVELOPE_SERIALIZATION" };
      }
      if (size > maxBytes) return { ok: false, code: "E_ENVELOPE_BYTES", detail: `${size}>${maxBytes}` };
      return { ok: true, code: "" };
    }
    function createEnvelope2(channel, idFieldValue, payload, { correlationId, issuedAt } = {}) {
      const idField = BRIDGE_ID_FIELD[channel];
      if (!idField) throw new IpcEnvelopeError("E_ENVELOPE_CHANNEL_UNKNOWN", String(channel));
      const envelope = {
        v: ENVELOPE_VERSION,
        correlationId: typeof correlationId === "string" && correlationId.length >= 8 ? correlationId : `corr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
        issuedAt: typeof issuedAt === "string" ? issuedAt : (/* @__PURE__ */ new Date()).toISOString(),
        [idField]: idFieldValue,
        payload: isObjectRecord(payload) ? payload : {}
      };
      if (channel === "ui:command-bridge") envelope.route = "command.bus";
      return envelope;
    }
    function withTimeoutBudget2(invokeFactory, { timeoutMs, correlationId }) {
      if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new IpcEnvelopeError("E_BRIDGE_TIMEOUT_BUDGET_INVALID");
      if (typeof invokeFactory !== "function") throw new IpcEnvelopeError("E_BRIDGE_INVOKE_REQUIRED");
      return new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new IpcEnvelopeError("E_BRIDGE_TIMEOUT", correlationId || ""));
        }, timeoutMs);
        Promise.resolve().then(() => invokeFactory()).then((value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        }, (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        });
      });
    }
    module2.exports = Object.freeze({
      BRIDGE_KEY_SETS,
      ENVELOPE_VERSION,
      IpcEnvelopeError,
      createEnvelope: createEnvelope2,
      validateIpcEnvelope,
      withTimeoutBudget: withTimeoutBudget2
    });
  }
});

// src/preload.js
var { contextBridge, ipcRenderer } = require("electron");
var { createEnvelope, withTimeoutBudget } = require_ipc_envelope_v1();
var PRELOAD_WORKSPACE_QUERY_IDS = Object.freeze({
  PROJECT_TREE: "query.projectTree",
  PROJECT_LIBRARY: "query.projectLibrary"
});
var EXPORT_DOCX_MIN_CHANNEL = "u:cmd:project:export:docxMin:v1";
var IMPORT_MARKDOWN_V1_CHANNEL = "m:cmd:project:import:markdownV1:v1";
var EXPORT_MARKDOWN_V1_CHANNEL = "m:cmd:project:export:markdownV1:v1";
var FLOW_OPEN_V1_CHANNEL = "m:cmd:project:flow:open:v1";
var FLOW_SAVE_V1_CHANNEL = "m:cmd:project:flow:save:v1";
var UI_COMMAND_BRIDGE_CHANNEL = "ui:command-bridge";
var WORKSPACE_QUERY_BRIDGE_CHANNEL = "ui:workspace-query-bridge";
var SAVE_LIFECYCLE_SIGNAL_BRIDGE_CHANNEL = "ui:save-lifecycle-signal-bridge";
var EDITOR_PASTE_FOCUS_STATE_CHANNEL = "editor:paste-focus-state";
var PROJECT_NEW_COMMAND_ID = "cmd.project.new";
var PROJECT_OPEN_COMMAND_ID = "cmd.project.open";
var PROJECT_SAVE_COMMAND_ID = "cmd.project.save";
var PROJECT_SAVE_AS_COMMAND_ID = "cmd.project.saveAs";
var DOCUMENT_OPEN_COMMAND_ID = "cmd.project.document.open";
var TREE_COMMAND_IDS = Object.freeze({
  CREATE_NODE: "cmd.project.tree.createNode",
  RENAME_NODE: "cmd.project.tree.renameNode",
  DELETE_NODE: "cmd.project.tree.deleteNode",
  REORDER_NODE: "cmd.project.tree.reorderNode",
  MOVE_NODE: "cmd.project.tree.moveNode"
});
var TREE_COMMAND_ID_SET = new Set(Object.values(TREE_COMMAND_IDS));
function normalizeRequestRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function normalizeRequestPayload(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
var COMMAND_BRIDGE_TIMEOUT_MS = 12e4;
var QUERY_BRIDGE_TIMEOUT_MS = 3e4;
function invokeUiCommand(commandId, payload = {}) {
  const envelope = createEnvelope(
    UI_COMMAND_BRIDGE_CHANNEL,
    typeof commandId === "string" ? commandId : "",
    normalizeRequestPayload(payload)
  );
  return withTimeoutBudget(
    () => ipcRenderer.invoke(UI_COMMAND_BRIDGE_CHANNEL, envelope),
    { timeoutMs: COMMAND_BRIDGE_TIMEOUT_MS, correlationId: envelope.correlationId }
  );
}
function dispatchTreeCommand(request = {}) {
  const safeRequest = normalizeRequestRecord(request);
  const commandId = typeof safeRequest.commandId === "string" ? safeRequest.commandId : "";
  if (!TREE_COMMAND_ID_SET.has(commandId)) {
    return Promise.resolve({ ok: false, error: "TREE_COMMAND_NOT_ALLOWED" });
  }
  return invokeUiCommand(commandId, safeRequest.payload);
}
contextBridge.exposeInMainWorld("electronAPI", {
  onFontChanged: (callback) => {
    ipcRenderer.on("font-changed", (event, fontFamily) => callback(fontFamily));
  },
  onThemeChanged: (callback) => {
    ipcRenderer.on("theme-changed", (event, theme) => callback(theme));
  },
  onEditorSetText: (callback) => {
    ipcRenderer.on("editor:set-text", (event, text) => callback(text));
  },
  onEditorTextRequest: (callback) => {
    ipcRenderer.on("editor:text-request", (event, payload) => callback(payload));
  },
  sendEditorTextResponse: (requestId, text) => {
    ipcRenderer.send("editor:text-response", { requestId, text });
  },
  onEditorSnapshotRequest: (callback) => {
    ipcRenderer.on("editor:snapshot-request", (event, payload) => callback(payload));
  },
  sendEditorSnapshotResponse: (requestId, snapshot) => {
    ipcRenderer.send("editor:snapshot-response", { requestId, snapshot });
  },
  onEditorSetFontSize: (callback) => {
    ipcRenderer.on("editor:set-font-size", (event, payload) => callback(payload));
  },
  newFile: () => {
    return invokeUiCommand(PROJECT_NEW_COMMAND_ID, {});
  },
  openFile: () => {
    return invokeUiCommand(PROJECT_OPEN_COMMAND_ID, {});
  },
  saveFile: () => {
    return invokeUiCommand(PROJECT_SAVE_COMMAND_ID, {});
  },
  saveAs: () => {
    return invokeUiCommand(PROJECT_SAVE_AS_COMMAND_ID, {});
  },
  /**
   * @param {unknown} payload
   * @returns {Promise<{ ok: false, reason: "not-implemented" }>}
   */
  fileSave: (payload) => {
    const safePayload = normalizeRequestPayload(payload);
    const intent = typeof safePayload.intent === "string" ? safePayload.intent : "";
    if (intent && intent !== "save") {
      return Promise.resolve({ ok: false, reason: "FILE_SAVE_INTENT_NOT_ALLOWED" });
    }
    return invokeUiCommand(PROJECT_SAVE_COMMAND_ID, {});
  },
  /**
   * @param {unknown} payload
   * @returns {Promise<{ ok: false, reason: "not-implemented" }>}
   */
  fileSaveAs: (payload) => {
    const safePayload = normalizeRequestPayload(payload);
    const intent = typeof safePayload.intent === "string" ? safePayload.intent : "";
    if (intent && intent !== "saveAs") {
      return Promise.resolve({ ok: false, reason: "FILE_SAVE_AS_INTENT_NOT_ALLOWED" });
    }
    return invokeUiCommand(PROJECT_SAVE_AS_COMMAND_ID, {});
  },
  /**
   * @param {unknown} payload
   * @returns {Promise<{ ok: false, reason: "not-implemented" }>}
   */
  fileOpen: (payload) => {
    const safePayload = normalizeRequestPayload(payload);
    const intent = typeof safePayload.intent === "string" ? safePayload.intent : "";
    if (intent === "new") {
      return invokeUiCommand(PROJECT_NEW_COMMAND_ID, {});
    }
    if (!intent || intent === "open") {
      return invokeUiCommand(PROJECT_OPEN_COMMAND_ID, {});
    }
    return Promise.resolve({ ok: false, reason: "FILE_OPEN_INTENT_NOT_ALLOWED" });
  },
  openSection: (sectionName) => {
    return ipcRenderer.invoke("ui:open-section", { sectionName });
  },
  getProjectTree: (tab) => {
    const envelope = createEnvelope(WORKSPACE_QUERY_BRIDGE_CHANNEL, PRELOAD_WORKSPACE_QUERY_IDS.PROJECT_TREE, { tab });
    return withTimeoutBudget(
      () => ipcRenderer.invoke(WORKSPACE_QUERY_BRIDGE_CHANNEL, envelope),
      { timeoutMs: QUERY_BRIDGE_TIMEOUT_MS, correlationId: envelope.correlationId }
    );
  },
  getProjectLibrary: (payload) => {
    const envelope = createEnvelope(WORKSPACE_QUERY_BRIDGE_CHANNEL, PRELOAD_WORKSPACE_QUERY_IDS.PROJECT_LIBRARY, normalizeRequestPayload(payload));
    return withTimeoutBudget(
      () => ipcRenderer.invoke(WORKSPACE_QUERY_BRIDGE_CHANNEL, envelope),
      { timeoutMs: QUERY_BRIDGE_TIMEOUT_MS, correlationId: envelope.correlationId }
    );
  },
  openDocument: (payload) => {
    return invokeUiCommand(DOCUMENT_OPEN_COMMAND_ID, payload);
  },
  dispatchTreeCommand: (request) => {
    return dispatchTreeCommand(request);
  },
  createNode: (payload) => {
    return dispatchTreeCommand({
      commandId: TREE_COMMAND_IDS.CREATE_NODE,
      payload
    });
  },
  renameNode: (payload) => {
    return dispatchTreeCommand({
      commandId: TREE_COMMAND_IDS.RENAME_NODE,
      payload
    });
  },
  deleteNode: (payload) => {
    return dispatchTreeCommand({
      commandId: TREE_COMMAND_IDS.DELETE_NODE,
      payload
    });
  },
  reorderNode: (payload) => {
    return dispatchTreeCommand({
      commandId: TREE_COMMAND_IDS.REORDER_NODE,
      payload
    });
  },
  moveNode: (payload) => {
    return dispatchTreeCommand({
      commandId: TREE_COMMAND_IDS.MOVE_NODE,
      payload
    });
  },
  exportDocxMin: (payload) => {
    return ipcRenderer.invoke(EXPORT_DOCX_MIN_CHANNEL, payload);
  },
  importMarkdownV1: (payload) => {
    return ipcRenderer.invoke(IMPORT_MARKDOWN_V1_CHANNEL, payload);
  },
  exportMarkdownV1: (payload) => {
    return ipcRenderer.invoke(EXPORT_MARKDOWN_V1_CHANNEL, payload);
  },
  openFlowModeV1: () => {
    return ipcRenderer.invoke(FLOW_OPEN_V1_CHANNEL);
  },
  saveFlowModeV1: (payload) => {
    return ipcRenderer.invoke(FLOW_SAVE_V1_CHANNEL, payload);
  },
  invokeUiCommandBridge: (request) => {
    const safeRequest = request && typeof request === "object" && !Array.isArray(request) ? request : {};
    const commandId = typeof safeRequest.commandId === "string" ? safeRequest.commandId : "";
    const payload = safeRequest.payload && typeof safeRequest.payload === "object" && !Array.isArray(safeRequest.payload) ? safeRequest.payload : {};
    const envelope = createEnvelope(UI_COMMAND_BRIDGE_CHANNEL, commandId, payload);
    return withTimeoutBudget(
      () => ipcRenderer.invoke(UI_COMMAND_BRIDGE_CHANNEL, envelope),
      { timeoutMs: COMMAND_BRIDGE_TIMEOUT_MS, correlationId: envelope.correlationId }
    );
  },
  invokeWorkspaceQueryBridge: (request) => {
    const safeRequest = request && typeof request === "object" && !Array.isArray(request) ? request : {};
    const queryId = typeof safeRequest.queryId === "string" ? safeRequest.queryId : "";
    const payload = safeRequest.payload && typeof safeRequest.payload === "object" && !Array.isArray(safeRequest.payload) ? safeRequest.payload : {};
    const envelope = createEnvelope(WORKSPACE_QUERY_BRIDGE_CHANNEL, queryId, payload);
    return withTimeoutBudget(
      () => ipcRenderer.invoke(WORKSPACE_QUERY_BRIDGE_CHANNEL, envelope),
      { timeoutMs: QUERY_BRIDGE_TIMEOUT_MS, correlationId: envelope.correlationId }
    );
  },
  invokeSaveLifecycleSignalBridge: (request) => {
    const safeRequest = request && typeof request === "object" && !Array.isArray(request) ? request : {};
    const signalId = typeof safeRequest.signalId === "string" ? safeRequest.signalId : "";
    const payload = safeRequest.payload && typeof safeRequest.payload === "object" && !Array.isArray(safeRequest.payload) ? safeRequest.payload : {};
    return ipcRenderer.invoke(SAVE_LIFECYCLE_SIGNAL_BRIDGE_CHANNEL, createEnvelope(SAVE_LIFECYCLE_SIGNAL_BRIDGE_CHANNEL, signalId, payload));
  },
  setTheme: (theme) => {
    ipcRenderer.send("ui:set-theme", theme);
  },
  setFont: (fontFamily) => {
    ipcRenderer.send("ui:set-font", fontFamily);
  },
  setFontSizePx: (px) => {
    ipcRenderer.send("ui:set-font-size", px);
  },
  changeFontSize: (action) => {
    ipcRenderer.send("ui:font-size", action);
  },
  minimizeWindow: () => {
    ipcRenderer.send("ui:window-minimize");
  },
  notifyDirtyState: (state) => {
    ipcRenderer.send("dirty-changed", state);
  },
  notifyEditorPasteFocusState: (focused) => {
    ipcRenderer.send(EDITOR_PASTE_FOCUS_STATE_CHANNEL, { focused: focused === true });
  },
  requestAutoSave: () => {
    return ipcRenderer.invoke("ui:request-autosave");
  },
  onStatusUpdate: (callback) => {
    ipcRenderer.on("status-update", (event, status) => callback(status));
  },
  onRecoveryRestored: (callback) => {
    ipcRenderer.on("ui:recovery-restored", (event, payload) => callback(payload));
  },
  onRuntimeCommand: (callback) => {
    ipcRenderer.on("ui:runtime-command", (event, payload) => callback(payload));
  },
  getCollabScopeLocal: () => {
    return ipcRenderer.invoke("ui:get-collab-scope-local");
  },
  onSetDirty: (callback) => {
    ipcRenderer.on("set-dirty", (event, state) => callback(state));
  }
});
