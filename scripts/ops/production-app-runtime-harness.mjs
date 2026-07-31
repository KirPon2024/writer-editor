import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const DEFAULT_TIMEOUT_MS = 10000;
const API_SHAPE_SOURCE = `(() => ({
  hasElectronAPI: Boolean(window.electronAPI),
  exportDocxMinType: typeof window.electronAPI?.exportDocxMin,
  invokeUiCommandBridgeType: typeof window.electronAPI?.invokeUiCommandBridge,
  invokeWorkspaceQueryBridgeType: typeof window.electronAPI?.invokeWorkspaceQueryBridge
}))()`;
const DEFAULT_RENDERER_PROBE_LABEL = 'apiShape';

function normalizeTimeoutMs(value) {
  if (!Number.isInteger(value) || value <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(value, DEFAULT_TIMEOUT_MS);
}

async function resolveElectronBinary(rootDir, explicitBinary = '') {
  const envBinary = process.env.PRODUCTION_APP_RUNTIME_HARNESS_ELECTRON_BIN
    || process.env.ELECTRON_BIN
    || '';
  const candidate = explicitBinary || envBinary;
  if (candidate) return candidate;

  const requireFromRoot = createRequire(path.join(rootDir, 'package.json'));
  return requireFromRoot('electron');
}

function parseHarnessResult(stdout) {
  const line = String(stdout || '')
    .split(/\r?\n/u)
    .find((item) => item.startsWith('PRODUCTION_APP_RUNTIME_HARNESS_RESULT:'));
  if (!line) return null;
  return JSON.parse(line.slice('PRODUCTION_APP_RUNTIME_HARNESS_RESULT:'.length));
}

function createChildSource({
  rootDir,
  tempRoot,
  rendererProbeSource = API_SHAPE_SOURCE,
  rendererProbeLabel = DEFAULT_RENDERER_PROBE_LABEL,
}) {
  return `\
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, dialog, session } = require('electron');

const rootDir = ${JSON.stringify(rootDir)};
const tempRoot = ${JSON.stringify(tempRoot)};
const rendererProbeSource = ${JSON.stringify(rendererProbeSource || API_SHAPE_SOURCE)};
const rendererProbeLabel = ${JSON.stringify(rendererProbeLabel || DEFAULT_RENDERER_PROBE_LABEL)};
let networkRequests = 0;
let dialogCalls = 0;

function emitResult(payload) {
  process.stdout.write('PRODUCTION_APP_RUNTIME_HARNESS_RESULT:' + JSON.stringify(payload) + '\\n');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

for (const dirName of ['appData', 'userData', 'documents']) {
  fs.mkdirSync(path.join(tempRoot, dirName), { recursive: true });
}

for (const methodName of ['showOpenDialog', 'showSaveDialog', 'showMessageBox']) {
  const original = dialog[methodName];
  dialog[methodName] = async (...args) => {
    dialogCalls += 1;
    if (typeof original !== 'function') {
      throw new Error('DIALOG_BLOCKED');
    }
    throw new Error('DIALOG_BLOCKED');
  };
}

app.setPath('appData', path.join(tempRoot, 'appData'));
app.setPath('userData', path.join(tempRoot, 'userData'));
app.setPath('documents', path.join(tempRoot, 'documents'));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('disable-features', 'UseSkiaRenderer');

app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = details && typeof details.url === 'string' ? details.url : '';
    const shouldBlock = /^(https?|wss?):/u.test(url);
    if (shouldBlock) {
      networkRequests += 1;
    }
    callback({ cancel: shouldBlock });
  });
});

process.chdir(rootDir);
if (!process.argv.includes('--dev')) {
  process.argv.push('--dev');
}
require(path.join(rootDir, 'src', 'main.js'));

async function waitForWindow() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) return windows[0];
    await sleep(50);
  }
  throw new Error('WINDOW_NOT_CREATED');
}

async function waitForLoad(win) {
  if (!win.webContents.isLoadingMainFrame()) return true;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('LOAD_TIMEOUT')), 5000);
    win.webContents.once('did-finish-load', () => {
      clearTimeout(timer);
      resolve();
    });
    win.webContents.once('did-fail-load', (_event, _code, description) => {
      clearTimeout(timer);
      reject(new Error('DID_FAIL_LOAD:' + description));
    });
  });
  return true;
}

app.whenReady().then(async () => {
  try {
    const win = await waitForWindow();
    await waitForLoad(win);
    await win.webContents.executeJavaScript(
      'window.__PRODUCTION_APP_RUNTIME_HARNESS_TEMP_ROOT = ' + JSON.stringify(tempRoot),
      true,
    );
    const rendererProbe = await win.webContents.executeJavaScript(rendererProbeSource, true);
    const payload = {
      ok: 1,
      appReady: app.isReady(),
      windowCount: BrowserWindow.getAllWindows().length,
      loadComplete: true,
      rendererProbeLabel,
      rendererProbe,
      networkRequests,
      dialogCalls,
      tempRoot,
    };
    if (rendererProbeLabel === 'apiShape') {
      payload.apiShape = rendererProbe;
    }
    emitResult(payload);
    app.exit(0);
  } catch (error) {
    emitResult({
      ok: 0,
      message: error && error.message ? error.message : String(error),
      windowCount: BrowserWindow.getAllWindows().length,
      networkRequests,
      dialogCalls,
    });
    app.exit(1);
  }
});
`;
}

async function writeChildFile(tempRoot, rootDir, options = {}) {
  const childPath = path.join(tempRoot, 'production-app-runtime-harness-child.cjs');
  await fs.writeFile(childPath, createChildSource({
    rootDir,
    tempRoot,
    rendererProbeSource: options.rendererProbeSource,
    rendererProbeLabel: options.rendererProbeLabel,
  }), 'utf8');
  return childPath;
}

export async function runProductionAppRuntimeHarness(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const tempRoot = options.tempRoot
    ? path.resolve(String(options.tempRoot))
    : await fs.mkdtemp(path.join(os.tmpdir(), 'yalken-production-app-runtime-harness-'));
  await fs.mkdir(tempRoot, { recursive: true });
  let child = null;
  let timedOut = false;

  try {
    const electronBinary = await resolveElectronBinary(rootDir, options.electronBinary || '');
    const childPath = await writeChildFile(tempRoot, rootDir, {
      rendererProbeSource: options.rendererProbeSource,
      rendererProbeLabel: options.rendererProbeLabel,
    });
    const stdoutChunks = [];
    const stderrChunks = [];

    child = spawn(electronBinary, [childPath], {
      cwd: rootDir,
      env: {
        ...process.env,
        ELECTRON_ENABLE_SECURITY_WARNINGS: 'false',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk));

    const exitState = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);

      child.once('exit', (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal });
      });
    });

    const stdout = Buffer.concat(stdoutChunks).toString('utf8');
    const stderr = Buffer.concat(stderrChunks).toString('utf8');
    const result = parseHarnessResult(stdout);

    return {
      ok: exitState.code === 0 && result && result.ok === 1 && timedOut === false,
      runtimeKind: 'production-app-runtime-harness',
      tempRoot,
      timedOut,
      timeoutMs,
      exitCode: exitState.code,
      signal: exitState.signal || '',
      result,
      stdout,
      stderr,
    };
  } finally {
    if (child && !child.killed) {
      child.kill('SIGKILL');
    }
    if (options.preserveTempRoot !== true) {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  }
}

export async function runProductionAppRuntimeHarnessSelfTest(options = {}) {
  const result = await runProductionAppRuntimeHarness(options);
  const payload = result.result || {};
  const apiShape = payload.apiShape || {};

  return {
    ...result,
    assertions: {
      productionRuntime: result.runtimeKind === 'production-app-runtime-harness',
      cleanExit: result.ok === true,
      appReady: payload.appReady === true,
      oneBrowserWindow: payload.windowCount === 1,
      loadComplete: payload.loadComplete === true,
      noNetwork: payload.networkRequests === 0,
      noDialogs: payload.dialogCalls === 0,
      apiShapePresent: apiShape.hasElectronAPI === true
        && apiShape.exportDocxMinType === 'function'
        && apiShape.invokeUiCommandBridgeType === 'function'
        && apiShape.invokeWorkspaceQueryBridgeType === 'function',
    },
  };
}
