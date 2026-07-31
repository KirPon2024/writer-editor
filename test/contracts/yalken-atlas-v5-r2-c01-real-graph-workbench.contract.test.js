const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readRepoFile(...parts) {
  return fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');
}

test('R2 C01 places Manual Map workbench in the central plan workspace, not only the right rail', () => {
  const html = readRepoFile('src', 'renderer', 'index.html');
  const editor = readRepoFile('src', 'renderer', 'editor.js');
  const css = readRepoFile('src', 'renderer', 'styles.css');

  assert.match(html, /data-manual-map-plan-workspace/u);
  assert.match(html, /data-manual-map-plan-host/u);
  assert.match(editor, /const manualMapPlanHost = document\.querySelector\('\[data-manual-map-plan-host\]'\)/u);
  assert.match(editor, /function showManualMapPlanWorkspace\(\)/u);
  assert.match(editor, /setCurrentAtlasSurface\('manualMap', \{ refresh: false \}\)/u);
  assert.match(css, /\.main-content--manual-map/u);
  assert.match(css, /\.manual-map-workspace__body\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(260px,\s*320px\)/u);
});

test('R2 C01 renderer adapter reuses the existing graph interaction, viewport, layout, and list parity modules', () => {
  const editor = readRepoFile('src', 'renderer', 'editor.js');

  assert.match(editor, /manualMapInteraction\.mjs/u);
  assert.match(editor, /manualMapViewportPlanner\.mjs/u);
  assert.match(editor, /manualMapLayoutScheduler\.mjs/u);
  assert.match(editor, /manualMapListKeyboardParity\.mjs/u);
  assert.match(editor, /buildManualMapViewportPlan\(/u);
  assert.match(editor, /createManualMapLayoutJob\(/u);
  assert.match(editor, /runManualMapLayoutJob\(/u);
  assert.match(editor, /acceptManualMapLayoutResult\(/u);
  assert.match(editor, /buildManualMapListParityModel\(/u);
  assert.match(editor, /reduceManualMapListKeyboardIntent\(/u);
});

test('R2 C01 renders a hit-testable native SVG graph with list parity, selection, zoom, pan, drag and minimap affordances', () => {
  const editor = readRepoFile('src', 'renderer', 'editor.js');
  const css = readRepoFile('src', 'renderer', 'styles.css');

  assert.match(editor, /document\.createElementNS\(MANUAL_MAP_SVG_NS, 'svg'\)/u);
  assert.match(editor, /data-manual-map-node-id/u);
  assert.match(editor, /data-manual-map-edge-id/u);
  assert.match(editor, /role', 'listbox'/u);
  assert.match(editor, /handleManualMapWorkbenchWheel/u);
  assert.match(editor, /MANUAL_MAP_VIEW_INTENT\.PAN/u);
  assert.match(editor, /MANUAL_MAP_VIEW_INTENT\.ZOOM/u);
  assert.match(editor, /manualMap\.node\.update/u);
  assert.match(editor, /position:\s*\{\s*x:\s*Math\.round\(drag\.startX \+ dx\)/u);
  assert.match(css, /\.manual-map-workspace__svg/u);
  assert.match(css, /\.manual-map-workspace__minimap/u);
  assert.match(css, /\.manual-map-workspace__node\.is-selected/u);
  assert.match(css, /\.manual-map-workspace__row\[aria-selected="true"\]/u);
});

test('R2 C01 semantic actions target explicit selection and never fall back to first node, edge, or group', () => {
  const editor = readRepoFile('src', 'renderer', 'editor.js');

  assert.doesNotMatch(editor, /nodes\[0\]\?/u);
  assert.doesNotMatch(editor, /edges\[0\]\?/u);
  assert.doesNotMatch(editor, /groups\[0\]\?/u);
  assert.match(editor, /getManualMapSelectedNodeId\(\)/u);
  assert.match(editor, /getManualMapSelectedEdgeId\(\)/u);
  assert.match(editor, /disabled:\s*!selectedNode/u);
  assert.match(editor, /disabled:\s*!selectedEdge/u);
  assert.match(editor, /reason:\s*'Select a node'/u);
  assert.match(editor, /reason:\s*'Select an edge'/u);
});

test('R2 C01 keeps ViewState transient and does not persist viewport/layout into project or localStorage truth', () => {
  const editor = readRepoFile('src', 'renderer', 'editor.js');
  const viewStateStorageWrites = editor.match(/localStorage\.setItem\([^)]*manualMap/ug) || [];
  const projectTruthWrites = editor.match(/manualMapTransientViewState[\s\S]{0,120}(save|write|persist|manifest)/ug) || [];

  assert.equal(viewStateStorageWrites.length, 0);
  assert.equal(projectTruthWrites.length, 0);
  assert.match(editor, /let manualMapTransientViewState = normalizeManualMapViewState/u);
  assert.match(editor, /ViewState transient/u);
});
