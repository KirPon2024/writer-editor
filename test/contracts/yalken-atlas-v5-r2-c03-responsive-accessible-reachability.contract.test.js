const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function extractFunction(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} missing`);
  const next = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

test('R2 C03 provides a permanent Atlas opener outside the right rail', () => {
  const html = read(path.join('src', 'renderer', 'index.html'));
  const openerIndex = html.indexOf('data-atlas-reachability-opener');
  const mainIndex = html.indexOf('<main class="main-content"');
  const rightRailIndex = html.indexOf('data-right-sidebar');

  assert.notEqual(openerIndex, -1);
  assert.notEqual(mainIndex, -1);
  assert.notEqual(rightRailIndex, -1);
  assert.equal(openerIndex < mainIndex, true);
  assert.equal(openerIndex < rightRailIndex, true);
  assert.match(html, /data-action="open-atlas-rail"/u);
  assert.match(html, /aria-controls="right-panel-atlas"/u);
  assert.match(html, /data-atlas-reachability-caption/u);
});

test('R2 C03 opener opens Atlas through existing rail state instead of a parallel UI path', () => {
  const source = read(path.join('src', 'renderer', 'editor.js'));
  const opener = extractFunction(source, 'openAtlasRailFromReachabilityOpener');
  const sync = extractFunction(source, 'syncAtlasReachabilityOpenerState');
  const handleUiActionStart = source.indexOf('function handleUiAction');
  const handleUiAction = source.slice(handleUiActionStart, source.indexOf('\nasync function ', handleUiActionStart));

  assert.match(source, /const atlasReachabilityOpener = document\.querySelector\('\[data-atlas-reachability-opener\]'\)/u);
  assert.match(source, /function isAtlasSupportedViewportWidth/u);
  assert.match(source, />= 768/u);
  assert.match(opener, /applyRightTab\('atlas'\)/u);
  assert.match(opener, /setCurrentAtlasSurface\(surfaceId, \{ refresh: true \}\)/u);
  assert.match(opener, /setRightRailOverlayOpen\(true\)/u);
  assert.match(opener, /setRightRailCollapsed\(false\)/u);
  assert.match(sync, /dataset\.atlasReachabilitySupported = supported \? 'true' : 'false'/u);
  assert.match(sync, /dataset\.atlasReachabilityMode = supported \? 'supported' : 'handset-advisory'/u);
  assert.match(sync, /aria-expanded/u);
  assert.match(handleUiAction, /case 'open-atlas-rail':[\s\S]{0,90}openAtlasRailFromReachabilityOpener\(\)/u);
  assert.doesNotMatch(opener, /localStorage|writeFileAtomic|fetch\s*\(|indexedDB/u);
});

test('R2 C03 CSS prevents hidden opener, horizontal overflow, and toolbar collision regressions', () => {
  const css = read(path.join('src', 'renderer', 'styles.css'));

  assert.match(css, /\.app-layout \{[\s\S]*?overflow: hidden;/u);
  assert.match(css, /\.atlas-reachability-opener \{[\s\S]{0,420}position: absolute;[\s\S]{0,420}min-width: 44px;[\s\S]{0,420}min-height: 32px;/u);
  assert.match(css, /\.atlas-reachability-opener:focus-visible \{[\s\S]{0,180}outline: 2px solid var\(--a11y-focus-outline\)/u);
  assert.match(css, /\.app-layout\[data-right-rail-mode="overlay"\] \.atlas-reachability-opener/u);
  assert.match(css, /\.app-layout\[data-right-rail-mode="overlay"\] \.sidebar--right\.is-overlay-mode\.is-overlay-open \{[\s\S]{0,420}width: min\(/u);
  assert.match(css, /calc\(100% - var\(--app-left-sidebar-collapsed-width\) - 16px\)/u);
  assert.doesNotMatch(css, /\.atlas-reachability-opener[\s\S]{0,220}display: none/u);
});

test('R2 C03 audit binds supported desktop widths, focus trap, Escape return, and honest handset fallback', () => {
  const script = read(path.join('scripts', 'ops', 'yalken-atlas-v5-er-c06-atlas-rail-responsive-audit.mjs'));

  for (const token of [
    "id: 'desktop', width: 1440",
    "id: 'laptop', width: 1024",
    "id: 'compact', width: 900",
    "id: 'tablet', width: 768",
    "id: 'handset-advisory', width: 390",
    'data-atlas-reachability-opener',
    'externalOpenerReachable',
    'openerNoToolbarCollision',
    'noHorizontalOverflow',
    'overlayFocusTrapAndEscape',
    'escapeReturnedFocus',
    'supportedWidthsNotClipped',
    'handsetHonestAdvisory',
  ]) {
    assert.match(script, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'), token);
  }
  assert.match(script, /results\.filter\(\(item\) => item\.supported\)\.map\(\(item\) => item\.width\)\.join\(','\) === '1440,1024,900,768'/u);
  assert.match(script, /handset\.openerSupported === false/u);
  assert.doesNotMatch(script, /mobileHonestOverlayScope/u);
});

test('R2 C03 E11 revalidation refuses the old narrow three-screenshot proof shape', () => {
  const script = read(path.join('scripts', 'ops', 'yalken-atlas-v5-e11-c03-packaged-accessibility-responsive-visual-regression.mjs'));
  const contract = read(path.join('test', 'contracts', 'yalken-atlas-v5-e11-c03-packaged-accessibility-responsive-visual-regression.contract.test.js'));
  const joined = `${script}\n${contract}`;

  assert.match(script, /atlas-er-c06-laptop\.png/u);
  assert.match(script, /atlas-er-c06-compact\.png/u);
  assert.match(script, /atlas-er-c06-handset-advisory\.png/u);
  assert.match(script, /\['compact', 'desktop', 'handset-advisory', 'laptop', 'tablet'\]/u);
  for (const assertion of [
    'externalOpenerReachable',
    'noHorizontalOverflow',
    'overlayFocusTrapAndEscape',
    'supportedWidthsNotClipped',
    'handsetHonestAdvisory',
  ]) {
    assert.match(joined, new RegExp(assertion, 'u'));
  }
  assert.doesNotMatch(joined, /desktopOneActiveShell|tabletOneActiveShell|mobileHonestOverlayScope/u);
});
