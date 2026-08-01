const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, nativeImage, session } = require('electron');
const inputPath = "/Volumes/T7-Secure/worktrees/yalken/atlas-v5-e00/docs/OPS/EVIDENCE/YALKEN_ATLAS_V5_FINAL_AUDIT_P0_07_STRESS_PRODUCT_PROOF/p0-07-render-input-50000.json";
const outDir = "/Volumes/T7-Secure/worktrees/yalken/atlas-v5-e00/docs/OPS/EVIDENCE/YALKEN_ATLAS_V5_FINAL_AUDIT_P0_07_STRESS_PRODUCT_PROOF";
let networkRequests = 0;
function emit(payload) { process.stdout.write('P0_07_RENDER_RESULT:' + JSON.stringify(payload) + '\n'); }
function esc(value) { return String(value || '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }
function makeHtml(input) {
  const xs = input.nodes.map((node) => node.x);
  const ys = input.nodes.map((node) => node.y);
  const minX = Math.min(...xs, -480);
  const minY = Math.min(...ys, -360);
  const maxX = Math.max(...xs, 480);
  const maxY = Math.max(...ys, 360);
  const width = Math.max(960, maxX - minX + 240);
  const height = Math.max(720, maxY - minY + 240);
  const nodeById = new Map(input.nodes.map((node) => [node.id, node]));
  const edgeLines = input.edges.map((edge) => {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to) return '';
    return '<line data-edge-id="' + esc(edge.id) + '" x1="' + (from.x - minX + 120) + '" y1="' + (from.y - minY + 120) + '" x2="' + (to.x - minX + 120) + '" y2="' + (to.y - minY + 120) + '"></line>';
  }).join('');
  const nodeGroups = input.nodes.map((node) => (
    '<g data-node-id="' + esc(node.id) + '" transform="translate(' + (node.x - minX + 120) + ' ' + (node.y - minY + 120) + ')" tabindex="0" role="button" aria-label="' + esc(node.label) + '">' +
    '<rect x="-44" y="-16" width="88" height="32" rx="6"></rect><text text-anchor="middle" dominant-baseline="middle">' + esc(String(node.label || '').slice(0, 18)) + '</text></g>'
  )).join('');
  return '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#f7f6f3;color:#242424;font:12px system-ui,sans-serif}svg{display:block;width:100vw;height:100vh;background:#f7f6f3}.edges line{stroke:#697586;stroke-width:1.25;opacity:.66}.nodes rect{fill:#fffefb;stroke:#27364a;stroke-width:1.4}.nodes text{fill:#111827;font-size:10px}</style><svg data-p0-07-rendered-graph="' + input.graphSourceCount + '" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="P0 07 rendered graph ' + input.graphSourceCount + '"><g class="edges">' + edgeLines + '</g><g class="nodes">' + nodeGroups + '</g></svg>';
}
function nonBlankRatio(buffer) {
  const image = nativeImage.createFromBuffer(buffer);
  const bitmap = image.getBitmap();
  if (!bitmap || bitmap.length < 4) return 0;
  let nonBlank = 0;
  const total = Math.floor(bitmap.length / 4);
  for (let index = 0; index < bitmap.length; index += 4) {
    const b = bitmap[index];
    const g = bitmap[index + 1];
    const r = bitmap[index + 2];
    const a = bitmap[index + 3];
    if (a > 0 && !(r > 244 && g > 242 && b > 238)) nonBlank += 1;
  }
  return total > 0 ? nonBlank / total : 0;
}
app.whenReady().then(async () => {
  try {
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      if (!String(details.url || '').startsWith('data:')) networkRequests += 1;
      callback({ cancel: !String(details.url || '').startsWith('data:') });
    });
    const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const win = new BrowserWindow({ width: 1200, height: 900, show: false, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(makeHtml(input)));
    const dom = await win.webContents.executeJavaScript('(() => ({ nodeCount: document.querySelectorAll("[data-node-id]").length, edgeCount: document.querySelectorAll("[data-edge-id]").length, svgCount: document.querySelectorAll("svg[data-p0-07-rendered-graph]").length, text: document.body.innerText, horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1, focusableNodeCount: document.querySelectorAll("[data-node-id][tabindex]").length }))()', true);
    const image = await win.webContents.capturePage();
    const png = image.toPNG();
    const screenshotPath = path.join(outDir, 'p0-07-render-' + input.graphSourceCount + '.png');
    fs.writeFileSync(screenshotPath, png);
    emit({ ok: 1, graphSourceCount: input.graphSourceCount, dom, screenshotPath, screenshotBytes: png.length, nonBlankRatio: nonBlankRatio(png), networkRequests });
    app.quit();
  } catch (error) {
    emit({ ok: 0, error: String(error && error.stack || error) });
    app.quit();
  }
});
