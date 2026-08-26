const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(ROOT, 'src', 'renderer', 'a11yPerformanceRuntime.mjs');

async function importModule(modulePath = MODULE_PATH, nonce = 'base') {
  return import(`${pathToFileURL(modulePath).href}?wp304=${nonce}-${Date.now()}-${Math.random()}`);
}

class FakeElement {
  constructor(textContent = '') {
    this.attributes = new Map();
    this.textContent = textContent;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }
}

test('WP304 projection seals locale direction, reflow, motion and authoring boundaries', async () => {
  const module = await importModule();
  const desktop = module.buildWriterA11yPerformanceProjection({
    viewportWidth: 1440,
    locale: 'ru',
    requestedDirection: 'auto',
    reducedMotion: false,
  });
  assert.equal(desktop.interfaceDirection, 'ltr');
  assert.equal(desktop.authoringDirection, 'auto');
  assert.equal(desktop.bidiPolicy, 'plaintext');
  assert.equal(desktop.reflowMode, 'calm-docked');
  assert.equal(desktop.motionMode, 'standard');
  assert.equal(desktop.productTruth, false);
  assert.equal(desktop.storageTruth, false);
  assert.equal(Object.isFrozen(desktop), true);

  const compact = module.buildWriterA11yPerformanceProjection({ viewportWidth: 1279, locale: 'he-IL' });
  assert.equal(compact.interfaceDirection, 'rtl');
  assert.equal(compact.reflowMode, 'compact-docked');

  const narrow = module.buildWriterA11yPerformanceProjection({
    viewportWidth: 899,
    locale: 'ar-EG',
    reducedMotion: true,
  });
  assert.equal(narrow.interfaceDirection, 'rtl');
  assert.equal(narrow.reflowMode, 'single-column-overlay');
  assert.equal(narrow.motionMode, 'reduced');

  assert.equal(module.resolveWriterInterfaceDirection({ locale: 'ar', requestedDirection: 'ltr' }), 'ltr');
  assert.equal(module.resolveWriterInterfaceDirection({ locale: 'en', requestedDirection: 'rtl' }), 'rtl');
  assert.equal(module.resolveWriterInterfaceDirection({ locale: 'en', requestedDirection: 'unsafe' }), 'ltr');
});

test('WP304 DOM projection is presentation-only and preserves mixed-script author text', async () => {
  const module = await importModule();
  const documentElement = new FakeElement();
  const appLayout = new FakeElement();
  const authorText = 'English אבג العربية İß e\u0301 👩🏽‍💻';
  const editorElement = new FakeElement(authorText);
  const statusRegion = new FakeElement('Ready');
  const projection = module.buildWriterA11yPerformanceProjection({
    viewportWidth: 720,
    locale: 'fa-IR',
    reducedMotion: true,
  });

  const receipt = module.applyWriterA11yPerformanceProjection({
    documentElement,
    appLayout,
    editorElement,
    statusRegion,
    projection,
  });
  assert.equal(receipt.applied, true);
  assert.equal(documentElement.getAttribute('dir'), 'rtl');
  assert.equal(appLayout.getAttribute('data-writer-reflow'), 'single-column-overlay');
  assert.equal(appLayout.getAttribute('data-writer-motion'), 'reduced');
  assert.equal(editorElement.getAttribute('dir'), 'auto');
  assert.equal(editorElement.getAttribute('data-bidi-policy'), 'plaintext');
  assert.equal(editorElement.textContent, authorText);
  assert.equal(statusRegion.getAttribute('role'), 'status');
  assert.equal(statusRegion.getAttribute('aria-live'), 'polite');
  assert.equal(statusRegion.getAttribute('aria-atomic'), 'true');

  const invalid = module.applyWriterA11yPerformanceProjection({
    documentElement: new FakeElement(),
    projection: { schemaVersion: 'forged' },
  });
  assert.deepEqual(invalid, { applied: false, code: 'E_WRITER_A11Y_PROJECTION_INVALID' });
});

test('WP304 typing and survivor budgets fail closed on overrun, malformed and stale samples', async () => {
  const module = await importModule();
  const monitor = module.createWriterPerformanceBudgetMonitor({
    typingBudgetMs: 16,
    survivorBudgetMs: 8,
    sampleLimit: 3,
  });

  assert.equal(monitor.record({ lane: 'typing', durationMs: 4, generation: 1 }).ok, true);
  assert.equal(monitor.record({ lane: 'survivor', durationMs: 7, generation: 1 }).ok, true);
  assert.equal(monitor.record({ lane: 'typing', durationMs: 16, generation: 2 }).ok, true);

  const typingOverrun = monitor.record({ lane: 'typing', durationMs: 16.01, generation: 3 });
  assert.equal(typingOverrun.ok, false);
  assert.equal(typingOverrun.code, 'E_WRITER_BUDGET_EXCEEDED');

  const survivorOverrun = monitor.record({ lane: 'survivor', durationMs: 9, generation: 3 });
  assert.equal(survivorOverrun.ok, false);
  assert.equal(survivorOverrun.code, 'E_WRITER_BUDGET_EXCEEDED');

  const stale = monitor.record({ lane: 'survivor', durationMs: 1, generation: 2 });
  assert.equal(stale.ok, false);
  assert.equal(stale.code, 'E_WRITER_SURVIVOR_STALE_GENERATION');
  assert.equal(monitor.record({ lane: 'unknown', durationMs: 1, generation: 3 }).code, 'E_WRITER_BUDGET_LANE_INVALID');
  assert.equal(monitor.record({ lane: 'typing', durationMs: Number.NaN, generation: 3 }).code, 'E_WRITER_BUDGET_DURATION_INVALID');
  assert.equal(monitor.record({ lane: 'typing', durationMs: 1, generation: -1 }).code, 'E_WRITER_BUDGET_GENERATION_INVALID');

  const snapshot = monitor.snapshot();
  assert.equal(snapshot.typing.count, 3);
  assert.equal(snapshot.survivor.count, 2);
  assert.equal(snapshot.latestGeneration, 3);
});

test('WP304 integration binds strict keyboard, SR, reflow, motion, RTL and budget paths without authority widening', async () => {
  const moduleSource = fs.readFileSync(MODULE_PATH, 'utf8');
  const editorSource = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'editor.js'), 'utf8');
  const htmlSource = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'index.html'), 'utf8');
  const cssSource = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'styles.css'), 'utf8');

  for (const token of [
    "from './a11yPerformanceRuntime.mjs'",
    'syncWriterA11yPerformanceProjection();',
    "recordWriterRuntimeBudget('typing'",
    "recordWriterRuntimeBudget('survivor'",
    "writerReducedMotionQuery.addEventListener('change'",
    "editor.addEventListener('compositionstart'",
    "editor.addEventListener('compositionend'",
    "leftTabsHost.addEventListener('keydown'",
  ]) {
    assert.equal(editorSource.includes(token), true, `missing renderer integration: ${token}`);
  }

  assert.match(htmlSource, /id="editor"[\s\S]*dir="auto"[\s\S]*data-bidi-policy="plaintext"/);
  assert.match(htmlSource, /class="status-dock" role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(cssSource, /unicode-bidi: plaintext/);
  assert.match(cssSource, /text-align: start/);
  assert.match(cssSource, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(cssSource, /@media \(max-width: 899px\)/);

  for (const forbidden of [
    'localStorage',
    'sessionStorage',
    'node:fs',
    'ipcRenderer',
    'ipcMain',
    'electronAPI',
    'fetch(',
    'writeFileAtomic',
  ]) {
    assert.equal(moduleSource.includes(forbidden), false, `forbidden authority token: ${forbidden}`);
  }
});

test('WP304 implementation mutants are killed by independent behavioral oracles', async (t) => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-wp304-mutants-')));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

  const mutants = [
    {
      id: 'rtl-locale-forced-ltr',
      find: "return RTL_LANGUAGE_IDS.has(languageIdFromLocale(locale)) ? 'rtl' : 'ltr';",
      replace: "return 'ltr';",
      oracle: (module) => assert.equal(module.resolveWriterInterfaceDirection({ locale: 'ar' }), 'rtl'),
    },
    {
      id: 'authoring-direction-normalized',
      find: "authoringDirection: 'auto',",
      replace: "authoringDirection: 'ltr',",
      oracle: (module) => assert.equal(module.buildWriterA11yPerformanceProjection().authoringDirection, 'auto'),
    },
    {
      id: 'reduced-motion-ignored',
      find: "motionMode: reducedMotion === true ? 'reduced' : 'standard',",
      replace: "motionMode: 'standard',",
      oracle: (module) => assert.equal(module.buildWriterA11yPerformanceProjection({ reducedMotion: true }).motionMode, 'reduced'),
    },
    {
      id: 'narrow-reflow-disabled',
      find: "const reflowMode = boundedViewportWidth <= 899",
      replace: 'const reflowMode = boundedViewportWidth <= 320',
      oracle: (module) => assert.equal(module.buildWriterA11yPerformanceProjection({ viewportWidth: 899 }).reflowMode, 'single-column-overlay'),
    },
    {
      id: 'invalid-projection-admitted',
      find: 'if (!projection || projection.schemaVersion !== WRITER_A11Y_PERFORMANCE_SCHEMA_VERSION) {',
      replace: 'if (false) {',
      oracle: (module) => assert.equal(module.applyWriterA11yPerformanceProjection({ projection: {} }).applied, false),
    },
    {
      id: 'stale-survivor-admitted',
      find: 'if (generation < latestGeneration) {',
      replace: 'if (false) {',
      oracle: (module) => {
        const monitor = module.createWriterPerformanceBudgetMonitor();
        monitor.record({ lane: 'typing', durationMs: 1, generation: 2 });
        assert.equal(monitor.record({ lane: 'survivor', durationMs: 1, generation: 1 }).ok, false);
      },
    },
    {
      id: 'budget-overrun-admitted',
      find: 'const withinBudget = duration <= budgetMs;',
      replace: 'const withinBudget = true;',
      oracle: (module) => {
        const monitor = module.createWriterPerformanceBudgetMonitor();
        assert.equal(monitor.record({ lane: 'typing', durationMs: 17, generation: 1 }).ok, false);
      },
    },
  ];

  let killed = 0;
  for (const mutant of mutants) {
    assert.equal(source.includes(mutant.find), true, `missing mutation target: ${mutant.id}`);
    const mutantPath = path.join(tempRoot, `${mutant.id}.mjs`);
    fs.writeFileSync(mutantPath, source.replace(mutant.find, mutant.replace), 'utf8');
    const module = await importModule(mutantPath, mutant.id);
    try {
      mutant.oracle(module);
    } catch {
      killed += 1;
    }
  }
  assert.equal(killed, mutants.length);
  console.log(`R24_WP304_IMPLEMENTATION_MUTANTS=${killed}/${mutants.length}`);
});
