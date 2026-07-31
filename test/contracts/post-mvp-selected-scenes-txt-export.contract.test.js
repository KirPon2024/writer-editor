const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = process.cwd();
const MAIN_PATH = path.join(REPO_ROOT, 'src', 'main.js');
const MENU_CONFIG_PATH = path.join(REPO_ROOT, 'src', 'menu', 'menu-config.v2.json');
const MENU_LOCALE_PATH = path.join(REPO_ROOT, 'src', 'menu', 'menu-locale.catalog.v1.json');
const KERNEL_PATH = path.join(REPO_ROOT, 'src', 'command', 'commandSurfaceKernel.js');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function sliceBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `start marker not found: ${startNeedle}`);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `end marker not found: ${endNeedle}`);
  return source.slice(start, end);
}

test('post-mvp selected scenes TXT export: file menu exposes one bounded command entry with locale binding', () => {
  const config = readJson(MENU_CONFIG_PATH);
  const locale = readJson(MENU_LOCALE_PATH);
  const fileMenu = config.menus.find((item) => item && item.id === 'file');
  assert.ok(fileMenu, 'file menu missing');

  const matches = fileMenu.items.filter((item) => item && item.command === 'cmd.project.exportSelectedScenesTxtV1');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, 'file-export-selected-scenes-txt');
  assert.equal(matches[0].actionId, undefined);
  assert.equal(matches[0].labelKey, 'menu.file.exportSelectedScenesTxt');
  assert.deepEqual(matches[0].profile, ['minimal', 'pro', 'guru']);

  assert.deepEqual(locale.entries['menu.file.exportSelectedScenesTxt'], {
    base: 'Экспорт TXT выбранных сцен',
    ru: 'Экспорт TXT выбранных сцен',
    en: 'Export Selected Scenes TXT',
  });
});

test('post-mvp selected scenes TXT export: main surface opens transient picker first and keeps export execution main-owned', () => {
  const source = readText(MAIN_PATH);

  assert.match(
    source,
    /\[EXPORT_SELECTED_SCENES_TXT_COMMAND_ID\]: async \(payload = \{\}\) => \{\s*const confirmed = payload && payload\.confirmed === true;[\s\S]*sendCanonicalRuntimeCommand\(\s*EXPORT_SELECTED_SCENES_TXT_COMMAND_ID,[\s\S]*preview:\s*true[\s\S]*dispatchCommandSurfaceKernel\(\s*COMMAND_SURFACE_KERNEL_COMMAND_IDS\.PROJECT_EXPORT_SELECTED_SCENES_TXT_V1,\s*payload,\s*\)/mu,
  );
  assert.match(source, /SELECTED_SCENES_TXT_EXPORT_SCOPE_QUERY_ID\s*=\s*WORKSPACE_QUERY_IDS\.SELECTED_SCENES_TXT_EXPORT_SCOPE/u);
  assert.match(source, /\[SELECTED_SCENES_TXT_EXPORT_SCOPE_QUERY_ID,\s*handleWorkspaceSelectedScenesTxtExportScopeQuery\]/u);
});

test('post-mvp selected scenes TXT export: kernel and handler stay bounded to scene ids and external TXT write', () => {
  const source = readText(MAIN_PATH);
  const kernelSource = readText(KERNEL_PATH);
  const normalizeSource = sliceBetween(
    source,
    'function normalizeSelectedScenesTxtExportPayload(payload = {}) {',
    'function buildMarkdownExportDefaultPath(payload) {',
  );
  const handlerSource = sliceBetween(
    source,
    'async function handleExportSelectedScenesTxt(payloadRaw = {}) {',
    'async function handleExportDocxMin(payloadRaw) {',
  );

  assert.match(kernelSource, /'cmd\.project\.exportSelectedScenesTxtV1'/u);
  assert.match(source, /\[COMMAND_SURFACE_KERNEL_COMMAND_IDS\.PROJECT_EXPORT_SELECTED_SCENES_TXT_V1\]: async \(payload = \{\}\) => \{\s*return handleExportSelectedScenesTxt\(payload\);/mu);

  assert.match(normalizeSource, /SELECTED_SCENES_TXT_EXPORT_FORBIDDEN_AUTHORITY_KEYS/u);
  assert.match(normalizeSource, /selectedSceneIds/u);
  assert.doesNotMatch(normalizeSource, /plainText|rendererState|viewportDomText/u);

  assert.match(handlerSource, /buildSelectedScenesTxtExportScope\(\)/u);
  assert.match(handlerSource, /payload\.confirmed !== true/u);
  assert.match(handlerSource, /unknownSceneIds/u);
  assert.match(handlerSource, /validateTxtExportPhysicalTargetPath\(outPath/u);
  assert.match(handlerSource, /readSelectedScenesTxtExportSceneContent/u);
  assert.match(handlerSource, /sceneTexts\.join\('\\n\\n'\)/u);
  assert.match(handlerSource, /fileManager\.writeFileAtomic\(outPath, content\)/u);
  assert.match(handlerSource, /!writeResult\s*\|\|\s*writeResult\.success !== true/u);
  assert.match(handlerSource, /sceneCount:\s*selectedCandidates\.length/u);
  assert.doesNotMatch(handlerSource, /payload\.text|payload\.scenePaths|payload\.viewportDomText|payload\.plainText/u);
});

test('post-mvp selected scenes TXT export: scope query returns renderer-safe scene candidates only', () => {
  const source = readText(MAIN_PATH);
  const scopeQuerySource = sliceBetween(
    source,
    'async function handleWorkspaceSelectedScenesTxtExportScopeQuery() {',
    'function handleWorkspaceCollabScopeLocalQuery() {',
  );

  assert.match(scopeQuerySource, /buildSelectedScenesTxtExportScope\(\)/u);
  assert.match(scopeQuerySource, /sceneCandidates:\s*Array\.isArray\(scope\.sceneCandidates\)/u);
  assert.match(scopeQuerySource, /sceneId:\s*candidate\.sceneId/u);
  assert.match(scopeQuerySource, /label:\s*candidate\.label/u);
  assert.equal(scopeQuerySource.includes('path: candidate.path'), false);
  assert.equal(scopeQuerySource.includes('projectRoot'), false);
});

test('post-mvp selected scenes TXT export: scope build stays read-only before confirm', () => {
  const source = readText(MAIN_PATH);
  const scopeBuildSource = sliceBetween(
    source,
    'async function buildSelectedScenesTxtExportScope() {',
    'function validateSelectedScenesTxtExportOutPath(outPath, scope, selectedCandidates) {',
  );

  assert.equal(scopeBuildSource.includes('ensureProjectStructure('), false);
  assert.equal(scopeBuildSource.includes('ensureProjectManifest('), false);
  assert.match(scopeBuildSource, /readProjectManifest\(DEFAULT_PROJECT_NAME\)/u);
  assert.match(scopeBuildSource, /fileExists\(romanPath\)/u);
});

test('post-mvp selected scenes TXT export: target validation blocks selected source overwrite and project-root writes', () => {
  const source = readText(MAIN_PATH);
  const validateSource = sliceBetween(
    source,
    'function validateSelectedScenesTxtExportOutPath(outPath, scope, selectedCandidates) {',
    'async function readSelectedScenesTxtExportSceneContent(sceneCandidate) {',
  );

  assert.match(validateSource, /candidate && candidate\.path === outPath/u);
  assert.match(validateSource, /isPathInside\(scope\.projectRoot, outPath\)/u);
  assert.match(validateSource, /reason:\s*'export_target_matches_selected_scene'/u);
  assert.match(validateSource, /reason:\s*'export_target_inside_project_root'/u);
});
