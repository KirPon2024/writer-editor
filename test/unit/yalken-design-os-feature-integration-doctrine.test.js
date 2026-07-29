const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = process.cwd();
const CHECKER_PATH = path.join(REPO_ROOT, 'scripts/check-design-os-integration-doctrine.mjs');

async function loadChecker() {
  return import(pathToFileURL(CHECKER_PATH).href);
}

function loadActualTextMap(requiredPaths) {
  const doctrinePath = 'docs/YALKEN_DESIGN_OS_FEATURE_INTEGRATION_DOCTRINE_V1.md';
  return Object.fromEntries([doctrinePath, ...requiredPaths].map((relativePath) => [
    relativePath,
    fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'),
  ]));
}

function loadPackageJson() {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
}

test('feature integration doctrine is bound from every active agent entrypoint', async () => {
  const checker = await loadChecker();
  const result = checker.evaluateDoctrineTextMap(
    loadActualTextMap(checker.REQUIRED_REFERENCE_PATHS),
    loadPackageJson(),
  );
  assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
});

test('feature integration doctrine rejects a missing authority marker', async () => {
  const checker = await loadChecker();
  const textMap = loadActualTextMap(checker.REQUIRED_REFERENCE_PATHS);
  const doctrinePath = 'docs/YALKEN_DESIGN_OS_FEATURE_INTEGRATION_DOCTRINE_V1.md';
  textMap[doctrinePath] = textMap[doctrinePath].replace(
    'DESIGN_AUTHORITY: FORM_VISIBILITY_LAYOUT_PROJECTION_FALLBACK',
    'DESIGN_AUTHORITY_REMOVED',
  );
  const result = checker.evaluateDoctrineTextMap(textMap, loadPackageJson());
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => entry.code === 'E_DOCTRINE_MARKER_MISSING'));
});

test('feature integration doctrine rejects an unbound active entrypoint', async () => {
  const checker = await loadChecker();
  const textMap = loadActualTextMap(checker.REQUIRED_REFERENCE_PATHS);
  textMap['agents.md'] = textMap['agents.md'].replaceAll(
    'YALKEN_DESIGN_OS_FEATURE_INTEGRATION_DOCTRINE_V1.md',
    'REMOVED_DOCTRINE_REFERENCE.md',
  );
  const result = checker.evaluateDoctrineTextMap(textMap, loadPackageJson());
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => (
    entry.code === 'E_DOCTRINE_REFERENCE_MISSING' && entry.path === 'agents.md'
  )));
});

test('feature integration doctrine rejects a missing package script binding', async () => {
  const checker = await loadChecker();
  const packageJson = loadPackageJson();
  delete packageJson.scripts['design-os:doctrine'];
  const result = checker.evaluateDoctrineTextMap(
    loadActualTextMap(checker.REQUIRED_REFERENCE_PATHS),
    packageJson,
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => entry.code === 'E_DOCTRINE_CHECK_SCRIPT_UNBOUND'));
});

test('feature integration doctrine rejects canon source order drift', async () => {
  const checker = await loadChecker();
  const textMap = loadActualTextMap(checker.REQUIRED_REFERENCE_PATHS);
  textMap['README.md'] = textMap['README.md'].replace(
    '- Active execution canon: `docs/OPS/STATUS/CANON_STATUS.json`\n- Верхний repo canon: `CANON.md`',
    '- Верхний repo canon: `CANON.md`\n- Active execution canon: `docs/OPS/STATUS/CANON_STATUS.json`',
  );
  const result = checker.evaluateDoctrineTextMap(textMap, loadPackageJson());
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => (
    entry.code === 'E_CANON_SOURCE_ORDER_INVALID' && entry.path === 'README.md'
  )));
});

test('feature integration doctrine rejects obsolete path-line output contract', async () => {
  const checker = await loadChecker();
  const textMap = loadActualTextMap(checker.REQUIRED_REFERENCE_PATHS);
  textMap['docs/templates/FEATURE_TZ.md'] = textMap['docs/templates/FEATURE_TZ.md'].replace(
    '- `CHANGED_BASENAMES`: только имена файлов без директорий; URL, пути и `path:line` запрещены.',
    '- Изменённые файлы: список + ссылки `path:line` на ключевые места.',
  );
  const result = checker.evaluateDoctrineTextMap(textMap, loadPackageJson());
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => (
    entry.code === 'E_OUTPUT_POLICY_PATH_LINE_CONFLICT'
      && entry.path === 'docs/templates/FEATURE_TZ.md'
  )));
});

test('feature integration doctrine rejects missing basenames output binding', async () => {
  const checker = await loadChecker();
  const textMap = loadActualTextMap(checker.REQUIRED_REFERENCE_PATHS);
  textMap['docs/templates/hard-tz.md'] = textMap['docs/templates/hard-tz.md'].replace(
    '`CHANGED_BASENAMES`,',
    '`CHANGED_FILES`,',
  );
  const result = checker.evaluateDoctrineTextMap(textMap, loadPackageJson());
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => (
    entry.code === 'E_OUTPUT_POLICY_BASENAMES_MISSING'
      && entry.path === 'docs/templates/hard-tz.md'
  )));
});
