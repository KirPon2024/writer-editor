import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const RESULT_PREFIX = 'YALKEN_ATLAS_ER_C06_RESPONSIVE_AUDIT_RESULT:';
const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname);

const VIEWPORTS = Object.freeze([
  Object.freeze({ id: 'desktop', width: 1440, height: 900, expectAtlasVisible: true }),
  Object.freeze({ id: 'tablet', width: 1024, height: 768, expectAtlasVisible: true }),
  Object.freeze({ id: 'mobile', width: 390, height: 844, expectAtlasVisible: false }),
]);

function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function normalizeOutputDir(value) {
  return path.resolve(value || path.join(os.tmpdir(), 'yalken-atlas-er-c06-responsive-audit'));
}

function createChildSource(outputDir) {
  return `\
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, dialog, Menu, session } = require('electron');

const repoRoot = ${JSON.stringify(repoRoot)};
const outputDir = ${JSON.stringify(outputDir)};
const viewports = ${JSON.stringify(VIEWPORTS)};
const resultPrefix = ${JSON.stringify(RESULT_PREFIX)};
const networkRequests = [];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emit(payload) {
  process.stdout.write(resultPrefix + JSON.stringify(payload) + '\\n');
}

async function waitUntil(predicate, label, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await predicate();
    if (value) return value;
    await sleep(50);
  }
  throw new Error('WAIT_TIMEOUT:' + label);
}

fsSync.mkdirSync(path.join(outputDir, 'user-data'), { recursive: true });
fsSync.mkdirSync(path.join(outputDir, 'app-data'), { recursive: true });
fsSync.mkdirSync(path.join(outputDir, 'documents'), { recursive: true });
fsSync.mkdirSync(path.join(outputDir, 'documents', 'craftsman', 'Роман', 'roman'), { recursive: true });
fsSync.mkdirSync(path.join(outputDir, 'documents', 'craftsman', '.autosave'), { recursive: true });
fsSync.writeFileSync(
  path.join(outputDir, 'documents', 'craftsman', 'Роман', 'roman', 'atlas-er-c06.txt'),
  'Ada met Bruno in the archive. Bruno carried the atlas ledger.',
  'utf8',
);
fsSync.writeFileSync(path.join(outputDir, 'documents', 'craftsman', '.autosave', 'autosave.txt'), '', 'utf8');
app.setPath('appData', path.join(outputDir, 'app-data'));
app.setPath('userData', path.join(outputDir, 'user-data'));
app.setPath('documents', path.join(outputDir, 'documents'));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('disable-features', 'UseSkiaRenderer');

dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
dialog.showSaveDialog = async () => ({ canceled: true });
dialog.showMessageBox = async () => ({ response: 0 });
Menu.setApplicationMenu(null);

app.whenReady().then(async () => {
  await fs.mkdir(outputDir, { recursive: true });
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = details && typeof details.url === 'string' ? details.url : '';
    const blocked = /^(https?|wss?):/u.test(url);
    if (blocked) networkRequests.push(url);
    callback({ cancel: blocked });
  });

  process.chdir(repoRoot);
  if (!process.argv.includes('--dev')) process.argv.push('--dev');
  require(path.join(repoRoot, 'src', 'main.js'));
  const win = await waitUntil(() => BrowserWindow.getAllWindows()[0] || null, 'WINDOW_NOT_CREATED', 15000);
  await waitUntil(async () => {
    try {
      return win.webContents && !win.webContents.isLoadingMainFrame();
    } catch {
      return false;
    }
  }, 'WINDOW_DID_NOT_LOAD', 15000);
  await waitUntil(async () => {
    try {
      return win.webContents.executeJavaScript(\`Boolean(document.querySelector('[data-right-tab="atlas"]') && document.querySelector('[data-atlas-surface-nav]'))\`, true);
    } catch {
      return false;
    }
  }, 'ATLAS_UI_NOT_READY', 15000);

  const results = [];
  for (const viewport of viewports) {
    win.setSize(viewport.width, viewport.height);
    await sleep(250);
    await win.webContents.executeJavaScript(\`(() => {
      const tab = document.querySelector('[data-right-tab="atlas"]');
      if (tab) tab.click();
    })()\`, true);
    await sleep(250);
    const metrics = await win.webContents.executeJavaScript(\`(() => {
      const parseRgb = (value) => {
        const match = String(value || '').match(/rgba?\\\\(([^)]+)\\\\)/);
        if (!match) return null;
        const parts = match[1].split(',').map((part) => Number(part.trim()));
        if (parts.length < 3 || parts.some((part, index) => index < 3 && !Number.isFinite(part))) return null;
        return { r: parts[0], g: parts[1], b: parts[2], a: Number.isFinite(parts[3]) ? parts[3] : 1 };
      };
      const luminance = (rgb) => {
        const channel = [rgb.r, rgb.g, rgb.b].map((value) => {
          const normalized = Math.max(0, Math.min(255, value)) / 255;
          return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * channel[0] + 0.7152 * channel[1] + 0.0722 * channel[2];
      };
      const contrastRatio = (fg, bg) => {
        if (!fg || !bg) return 0;
        const a = luminance(fg);
        const b = luminance(bg);
        const light = Math.max(a, b);
        const dark = Math.min(a, b);
        return Number(((light + 0.05) / (dark + 0.05)).toFixed(2));
      };
      const atlasPanel = document.querySelector('[data-right-panel-atlas]');
      const rightSidebar = document.querySelector('[data-right-sidebar]');
      const nav = document.querySelector('[data-atlas-surface-nav]');
      const activeShells = Array.from(document.querySelectorAll('[data-atlas-surface-shell]'))
        .filter((shell) => !shell.hidden && getComputedStyle(shell).display !== 'none');
      const visibleButtons = Array.from(document.querySelectorAll('[data-atlas-surface-button]'))
        .filter((button) => !button.hidden && getComputedStyle(button).display !== 'none');
      const selectedButtons = visibleButtons.filter((button) => button.getAttribute('aria-selected') === 'true');
      const activeButton = selectedButtons[0] || visibleButtons[0] || null;
      const beforeSelected = activeButton ? activeButton.getAttribute('data-atlas-surface-button') : '';
      if (activeButton) activeButton.focus({ preventScroll: true });
      const focusVisible = document.activeElement === activeButton;
      const keyboardEvent = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true });
      activeButton?.dispatchEvent(keyboardEvent);
      const afterSelected = document.querySelector('[data-atlas-surface-button][aria-selected="true"]')?.getAttribute('data-atlas-surface-button') || '';
      const navStyle = nav ? getComputedStyle(nav) : null;
      const buttonStyle = activeButton ? getComputedStyle(activeButton) : null;
      const rightRect = rightSidebar ? rightSidebar.getBoundingClientRect() : null;
      const atlasRect = atlasPanel ? atlasPanel.getBoundingClientRect() : null;
      return {
        activeAtlasSurface: atlasPanel?.dataset?.activeAtlasSurface || '',
        activeAtlasProvider: atlasPanel?.dataset?.activeAtlasProvider || '',
        activeShellCount: activeShells.length,
        hiddenShellCount: document.querySelectorAll('[data-atlas-surface-shell][hidden]').length,
        surfaceButtonCount: visibleButtons.length,
        selectedButtonCount: selectedButtons.length,
        focusVisible,
        keyboardMovedFocus: beforeSelected !== afterSelected && Boolean(afterSelected),
        atlasPanelHidden: atlasPanel ? atlasPanel.hidden : true,
        rightSidebarHidden: rightSidebar ? rightSidebar.hidden : true,
        rightSidebarDisplay: rightSidebar ? getComputedStyle(rightSidebar).display : '',
        rightSidebarWidth: rightRect ? Math.round(rightRect.width) : 0,
        atlasPanelHeight: atlasRect ? Math.round(atlasRect.height) : 0,
        atlasPanelScrollHeight: atlasPanel ? atlasPanel.scrollHeight : 0,
        navOverflowX: nav ? nav.scrollWidth > nav.clientWidth : false,
        navPosition: navStyle ? navStyle.position : '',
        navContrast: contrastRatio(parseRgb(buttonStyle?.color), parseRgb(navStyle?.backgroundColor)),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      };
    })()\`, true);
    const screenshot = await win.webContents.capturePage();
    const png = screenshot.toPNG();
    const screenshotName = 'atlas-er-c06-' + viewport.id + '.png';
    const screenshotPath = path.join(outputDir, screenshotName);
    await fs.writeFile(screenshotPath, png);
    results.push({
      ...viewport,
      ...metrics,
      screenshotName,
      screenshotBytes: png.length,
      screenshotSha256: require('node:crypto').createHash('sha256').update(png).digest('hex'),
    });
  }

  const assertions = {
    noNetwork: networkRequests.length === 0,
    desktopOneActiveShell: results.find((item) => item.id === 'desktop')?.activeShellCount === 1,
    tabletOneActiveShell: results.find((item) => item.id === 'tablet')?.activeShellCount === 1,
    keyboardNavigation: results.filter((item) => item.expectAtlasVisible).every((item) => item.focusVisible && item.keyboardMovedFocus),
    visibleAtlasScreenshots: results.every((item) => item.screenshotBytes > 1000),
    scrollBudget: results.filter((item) => item.expectAtlasVisible).every((item) => item.atlasPanelScrollHeight < 2400),
    contrastAA: results.filter((item) => item.expectAtlasVisible).every((item) => item.navContrast >= 4.5),
    tabletNotClipped: (() => {
      const tablet = results.find((item) => item.id === 'tablet');
      return tablet && tablet.rightSidebarWidth >= 240 && tablet.atlasPanelHeight > 300;
    })(),
    mobileHonestOverlayScope: (() => {
      const mobile = results.find((item) => item.id === 'mobile');
      return mobile && mobile.expectAtlasVisible === false && mobile.rightSidebarHidden === true;
    })(),
  };
  const proof = {
    schemaVersion: 'yalken.atlas.v5.erC06.responsiveAudit.v1',
    generatedAtUtc: new Date().toISOString(),
    repoRoot,
    outputDir,
    networkRequestCount: networkRequests.length,
    networkRequests,
    results,
    assertions,
    pass: Object.values(assertions).every(Boolean),
  };
  await fs.writeFile(path.join(outputDir, 'atlas-er-c06-responsive-audit.json'), JSON.stringify(proof, null, 2) + '\\n', 'utf8');
  emit(proof);
  app.exit(proof.pass ? 0 : 1);
}).catch((error) => {
  emit({
    schemaVersion: 'yalken.atlas.v5.erC06.responsiveAudit.v1',
    pass: false,
    error: error && error.message ? error.message : String(error),
  });
  app.exit(1);
});
`;
}

async function parseResult(stdout) {
  const line = String(stdout || '')
    .split(/\r?\n/u)
    .find((item) => item.startsWith(RESULT_PREFIX));
  return line ? JSON.parse(line.slice(RESULT_PREFIX.length)) : null;
}

export async function runAtlasRailResponsiveAudit(options = {}) {
  const outputDir = normalizeOutputDir(options.outputDir || process.env.YALKEN_ATLAS_ER_C06_OUT_DIR);
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yalken-atlas-er-c06-audit-child-'));
  const childPath = path.join(tempRoot, 'atlas-er-c06-responsive-audit-child.cjs');
  const requireFromRoot = createRequire(path.join(repoRoot, 'package.json'));
  const electronBinary = requireFromRoot('electron');
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(childPath, createChildSource(outputDir), 'utf8');

  const stdoutChunks = [];
  const stderrChunks = [];
  const child = spawn(electronBinary, [childPath], {
    cwd: repoRoot,
    env: { ...process.env, ELECTRON_ENABLE_SECURITY_WARNINGS: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
  child.stderr.on('data', (chunk) => stderrChunks.push(chunk));

  let timedOut = false;
  const exitState = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, 30000);
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });

  const stdout = Buffer.concat(stdoutChunks).toString('utf8');
  const stderr = Buffer.concat(stderrChunks).toString('utf8');
  const result = await parseResult(stdout);
  await fs.rm(tempRoot, { recursive: true, force: true });
  const proofPath = path.join(outputDir, 'atlas-er-c06-responsive-audit.json');
  let proofBytes = Buffer.alloc(0);
  try {
    proofBytes = await fs.readFile(proofPath);
  } catch {}
  return {
    ok: exitState.code === 0 && result?.pass === true && timedOut === false,
    exitCode: exitState.code,
    signal: exitState.signal || '',
    timedOut,
    outputDir,
    proofPath,
    proofSha256: proofBytes.length > 0 ? sha256Buffer(proofBytes) : '',
    result,
    stdout,
    stderr,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outputIndex = process.argv.indexOf('--out');
  const outputDir = outputIndex >= 0 ? process.argv[outputIndex + 1] : '';
  const audit = await runAtlasRailResponsiveAudit({ outputDir });
  process.stdout.write(JSON.stringify({
    ok: audit.ok,
    outputDir: audit.outputDir,
    proofPath: audit.proofPath,
    proofSha256: audit.proofSha256,
    exitCode: audit.exitCode,
    timedOut: audit.timedOut,
    assertions: audit.result?.assertions || {},
    stdout: audit.ok ? '' : audit.stdout,
    stderr: audit.ok ? '' : audit.stderr,
  }, null, 2) + '\n');
  if (audit.stderr) process.stderr.write(audit.stderr);
  process.exit(audit.ok ? 0 : 1);
}
