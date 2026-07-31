const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function extractFunction(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} missing`);
  const next = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

test('ER C06: Atlas tab owns one local surface navigator and one initially active shell', () => {
  const html = read(path.join('src', 'renderer', 'index.html'));
  const buttonMatches = html.match(/data-atlas-surface-button="/g) || [];
  const shellMatches = html.match(/data-atlas-surface-shell="/g) || [];

  assert.equal(buttonMatches.length, 13);
  assert.equal(shellMatches.length, 13);
  assert.match(html, /data-atlas-surface-nav role="tablist"/u);
  assert.match(html, /data-atlas-surface-button="currentScene"[\s\S]{0,180}aria-selected="true"/u);
  assert.match(html, /id="atlas-surface-panel-current-scene"[\s\S]{0,260}data-atlas-surface-shell="currentScene"/u);

  for (const surface of [
    'journey',
    'manualMap',
    'projection',
    'overview',
    'entity',
    'relation',
    'matrices',
    'reports',
    'diagnostics',
    'heatmap',
    'temporal',
    'continuity',
  ]) {
    assert.match(html, new RegExp(`data-atlas-surface-button="${surface}"`, 'u'), surface);
    assert.match(html, new RegExp(`role="tabpanel"[\\s\\S]{0,180}data-atlas-surface-shell="${surface}"|data-atlas-surface-shell="${surface}"[\\s\\S]{0,180}role="tabpanel"`, 'u'), surface);
  }
});

test('ER C06: renderer refreshes only the active Atlas sub-surface', () => {
  const source = read(path.join('src', 'renderer', 'editor.js'));
  const refreshActive = extractFunction(source, 'refreshActiveAtlasSurface');
  const applyRightTab = extractFunction(source, 'applyRightTab');
  const openDocumentNode = extractFunction(source, 'openDocumentNode');

  assert.match(source, /const ATLAS_SURFACE_IDS = Object\.freeze/u);
  assert.match(source, /function syncAtlasSurfaceCompositionState/u);
  assert.match(source, /function setCurrentAtlasSurface/u);
  assert.match(applyRightTab, /refreshActiveAtlasSurface\(\)/u);
  assert.match(openDocumentNode, /refreshActiveAtlasSurface\(\)/u);
  assert.doesNotMatch(applyRightTab, /refreshManualMapWorkbench\(\)[\s\S]*refreshProjectionInspector\(\)[\s\S]*refreshAtlasOverview\(\)[\s\S]*refreshAtlasCurrentScene\(\)/u);
  assert.doesNotMatch(openDocumentNode, /refreshManualMapWorkbench\(\)[\s\S]*refreshProjectionInspector\(\)[\s\S]*refreshAtlasOverview\(\)[\s\S]*refreshAtlasCurrentScene\(\)/u);

  for (const call of [
    'refreshAtlasCurrentScene',
    'refreshManualMapWorkbench',
    'refreshProjectionInspector',
    'refreshAtlasOverview',
    'refreshAtlasEntityDossier',
    'refreshAtlasRelationDossier',
    'refreshAtlasMatrices',
    'refreshAtlasReportsSavedQueries',
    'refreshAtlasDiagnosticsStageAcceptance',
    'refreshAtlasHeatmap',
    'refreshAtlasTemporalLayout',
    'refreshAtlasContinuityLedgerSurface',
  ]) {
    assert.match(refreshActive, new RegExp(`${call}\\(`, 'u'), call);
  }
});

test('ER C06: dependent Atlas actions route into the same surface switcher', () => {
  const source = read(path.join('src', 'renderer', 'editor.js'));
  const selectEntity = extractFunction(source, 'selectAtlasEntity');
  const selectRelation = extractFunction(source, 'selectAtlasRelation');
  const openHeatmap = extractFunction(source, 'openAtlasHeatmapSurface');
  const openTemporal = extractFunction(source, 'openAtlasTemporalLayoutSurface');
  const openContinuity = extractFunction(source, 'openAtlasContinuityLedgerSurface');

  assert.match(selectEntity, /setCurrentAtlasSurface\('entity', \{ refresh: false \}\)/u);
  assert.match(selectRelation, /setCurrentAtlasSurface\('relation', \{ refresh: false \}\)/u);
  assert.match(openHeatmap, /setCurrentAtlasSurface\('heatmap', \{ refresh: false \}\)/u);
  assert.match(openTemporal, /setCurrentAtlasSurface\('temporal', \{ refresh: false \}\)/u);
  assert.match(openContinuity, /setCurrentAtlasSurface\('continuity', \{ refresh: false \}\)/u);
});

test('ER C06: CSS removes stacked full-height Atlas shells and raises operational contrast', () => {
  const css = read(path.join('src', 'renderer', 'styles.css'));

  assert.match(css, /\[data-right-panel-atlas\]:not\(\[hidden\]\) \{[\s\S]*display: flex;[\s\S]*min-height: 0;/u);
  assert.match(css, /\.right-rail-shell--atlas \{[\s\S]*flex: 1 1 auto;[\s\S]*min-height: 0;/u);
  assert.match(css, /\[data-atlas-surface-shell\]\[hidden\] \{[\s\S]*display: none !important;/u);
  assert.match(css, /\.right-rail-atlas-nav \{[\s\S]*position: sticky;[\s\S]*overflow-x: auto;/u);
  assert.match(css, /--atlas-rail-muted: #625a52;/u);
  assert.match(css, /--atlas-rail-soft: #574f47;/u);
  assert.doesNotMatch(css, /\.right-rail-shell--atlas \{[\s\S]{0,120}min-height: 100%/u);
});

test('ER C06: visual audit script binds machine screenshots and negative assertions', () => {
  const script = read(path.join('scripts', 'ops', 'yalken-atlas-v5-er-c06-atlas-rail-responsive-audit.mjs'));
  assert.match(script, /id: 'desktop'/u);
  assert.match(script, /id: 'tablet'/u);
  assert.match(script, /id: 'mobile'/u);
  assert.match(script, /atlas-er-c06-' \+ viewport\.id \+ '\.png'/u);
  assert.match(script, /desktopOneActiveShell/u);
  assert.match(script, /tabletOneActiveShell/u);
  assert.match(script, /keyboardNavigation/u);
  assert.match(script, /scrollBudget/u);
  assert.match(script, /contrastAA/u);
  assert.match(script, /mobileHonestOverlayScope/u);
  assert.match(script, /networkRequests\.length === 0/u);
});

test('ER C06: Atlas surface switcher stays out of product truth and storage authority', () => {
  const source = read(path.join('src', 'renderer', 'editor.js'));
  const switcher = [
    extractFunction(source, 'syncAtlasSurfaceCompositionState'),
    extractFunction(source, 'refreshActiveAtlasSurface'),
    extractFunction(source, 'setCurrentAtlasSurface'),
  ].join('\n');
  for (const forbidden of [
    /localStorage/u,
    /writeFileAtomic/u,
    /fetch\s*\(/u,
    /XMLHttpRequest/u,
    /indexedDB/u,
    /manualMaps\s*=/u,
  ]) {
    assert.doesNotMatch(switcher, forbidden);
  }
});
