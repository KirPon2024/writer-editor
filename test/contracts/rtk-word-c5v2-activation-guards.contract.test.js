'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  createDocxActivationRequestDigestGuard,
  verifyFullManuscriptCurrentSceneBindings,
} = require('../../src/main/rtkDocxActivationGuards.cjs');
const { isPathInsideBoundary } = require('../../src/core/io/path-boundary');

function sha256Text(value) {
  return `sha256:${crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex')}`;
}

test('C5V2 activation guard permits exact replay and blocks a mutated payload on the same request', () => {
  const guard = createDocxActivationRequestDigestGuard({ maxEntries: 2 });
  const requestId = 'c5v2-negative-duplicate-request';
  const firstBytes = Buffer.from('first physical artifact');
  const mutatedBytes = Buffer.from('mutated physical artifact');

  assert.equal(guard.check({ requestId, bytes: firstBytes }).status, 'new');
  assert.equal(guard.remember({ requestId, bytes: firstBytes }).status, 'new');
  assert.equal(guard.check({ requestId, bytes: firstBytes }).status, 'replay');
  const conflict = guard.check({ requestId, bytes: mutatedBytes });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, 'RTK_DOCX_ACTIVATION_DUPLICATE_REQUEST_MUTATED_PAYLOAD');
  assert.notEqual(conflict.priorDigest, conflict.artifactDigest);

  guard.remember({ requestId: 'second', bytes: Buffer.from('second') });
  guard.remember({ requestId: 'third', bytes: Buffer.from('third') });
  assert.equal(guard.size(), 2);
  assert.equal(guard.check({ requestId, bytes: mutatedBytes }).status, 'new');
  guard.clear();
  assert.equal(guard.size(), 0);
});

test('C5V2 full-manuscript binding verifies every mapped scene and identifies distributed stale state', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-c5v2-full-binding-'));
  const scenePathBySceneId = {};
  const exportMapScenes = [];
  for (let index = 0; index < 21; index += 1) {
    const sceneId = `roman/${String(index + 1).padStart(2, '0')}_scene.txt`;
    const scenePath = path.join(projectRoot, ...sceneId.split('/'));
    const rawContent = `Scene ${index + 1} canonical raw content\n`;
    fs.mkdirSync(path.dirname(scenePath), { recursive: true });
    fs.writeFileSync(scenePath, rawContent, 'utf8');
    scenePathBySceneId[sceneId] = scenePath;
    exportMapScenes.push({ sceneId, rawSha256: sha256Text(rawContent) });
  }
  const deps = { readFileSync: fs.readFileSync, sha256Text, isPathInsideBoundary };
  const green = verifyFullManuscriptCurrentSceneBindings({
    projectRoot,
    exportMapScenes,
    scenePathBySceneId,
  }, deps);
  assert.equal(green.ok, true);
  assert.equal(green.sceneCount, 21);

  const staleSceneId = exportMapScenes[16].sceneId;
  fs.appendFileSync(scenePathBySceneId[staleSceneId], 'stale mutation\n', 'utf8');
  const stale = verifyFullManuscriptCurrentSceneBindings({
    projectRoot,
    exportMapScenes,
    scenePathBySceneId,
  }, deps);
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'RTK_RETURN_INTAKE_STALE_FULL_MANUSCRIPT_SCENE');
  assert.equal(stale.details.sceneId, staleSceneId);
  assert.notEqual(stale.details.actualRawSha256, stale.details.expectedRawSha256);
});

test('C5V2 full-manuscript binding fails closed on path escape, missing path and duplicate scene identity', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-c5v2-full-binding-negative-'));
  const outsidePath = path.join(os.tmpdir(), `outside-${process.pid}.txt`);
  fs.writeFileSync(outsidePath, 'outside', 'utf8');
  const deps = { readFileSync: fs.readFileSync, sha256Text, isPathInsideBoundary };
  const pathEscape = verifyFullManuscriptCurrentSceneBindings({
    projectRoot,
    exportMapScenes: [{ sceneId: 'roman/scene.txt', rawSha256: sha256Text('outside') }],
    scenePathBySceneId: { 'roman/scene.txt': outsidePath },
  }, deps);
  assert.equal(pathEscape.reason, 'RTK_RETURN_INTAKE_LOCAL_FULL_MANUSCRIPT_SCENE_PATH_BLOCKED');

  const missing = verifyFullManuscriptCurrentSceneBindings({
    projectRoot,
    exportMapScenes: [{ sceneId: 'roman/missing.txt', rawSha256: sha256Text('missing') }],
    scenePathBySceneId: {},
  }, deps);
  assert.equal(missing.reason, 'RTK_RETURN_INTAKE_LOCAL_FULL_MANUSCRIPT_CURRENT_BINDING_INVALID');

  const scenePath = path.join(projectRoot, 'roman', 'duplicate.txt');
  fs.mkdirSync(path.dirname(scenePath), { recursive: true });
  fs.writeFileSync(scenePath, 'duplicate', 'utf8');
  const duplicate = verifyFullManuscriptCurrentSceneBindings({
    projectRoot,
    exportMapScenes: [
      { sceneId: 'roman/duplicate.txt', rawSha256: sha256Text('duplicate') },
      { sceneId: 'roman/duplicate.txt', rawSha256: sha256Text('duplicate') },
    ],
    scenePathBySceneId: { 'roman/duplicate.txt': scenePath },
  }, deps);
  assert.equal(duplicate.reason, 'RTK_RETURN_INTAKE_LOCAL_FULL_MANUSCRIPT_CURRENT_BINDING_INVALID');
});

test('C5V2 shipped activation command wires both fail-closed guards before session import', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'main.js'), 'utf8');
  assert.match(mainSource, /verifyFullManuscriptCurrentSceneBindings\([\s\S]*RTK_RETURN_INTAKE_LOCAL_FULL_MANUSCRIPT_CURRENT_BINDING_REQUIRED/u);
  assert.match(mainSource, /activeDocxActivationRequestDigestGuard\.check\([\s\S]*E_DOCX_REVIEW_PREVIEW_SESSION_REQUEST_PAYLOAD_CONFLICT/u);
  assert.match(mainSource, /activeDocxActivationRequestDigestGuard\.remember\(\{ requestId, bytes: decoded\.bytes \}\)/u);
  const checkIndex = mainSource.indexOf('activeDocxActivationRequestDigestGuard.check');
  const importIndex = mainSource.indexOf('const importPayload = buildDocxReviewPreviewSessionImportPayload', checkIndex);
  assert.equal(checkIndex > 0 && importIndex > checkIndex, true);
});

test('C5V2 product activation requires isolated parser and keeps inline fallback test-only', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'main.js'), 'utf8');
  const helperIndex = mainSource.indexOf('async function runDocxReviewReturnIntakeParserV2InUtilityProcess');
  assert.notEqual(helperIndex, -1);
  const helperSource = mainSource.slice(helperIndex, mainSource.indexOf('async function inspectDocxReviewReturnIntakeV2', helperIndex));
  assert.match(helperSource, /RTK_RETURN_INTAKE_UTILITY_PROCESS_REQUIRED/u);
  assert.match(helperSource, /allowInlineDocxReturnIntakeParserForTests !== true/u);
  assert.match(helperSource, /mode:\s*'unavailable'/u);
  assert.match(helperSource, /mode:\s*'inline-test-fallback'/u);
  assert.ok(helperSource.indexOf('RTK_RETURN_INTAKE_UTILITY_PROCESS_REQUIRED') < helperSource.indexOf('inline-test-fallback'));
  assert.doesNotMatch(
    mainSource.slice(mainSource.indexOf('async function handleDocxReviewPreviewSessionCommandSurface')),
    /allowInlineDocxReturnIntakeParserForTests:\s*true/u,
  );
});

test('C5V2 physical canary waits for Roman project tree readiness after startup lease contention', () => {
  const canarySource = fs.readFileSync(
    path.join(__dirname, '..', '..', 'scripts', 'ops', 'rtk-word-c5v2-physical-canary.mjs'),
    'utf8',
  );
  const helperIndex = canarySource.indexOf('async function queryRomanProjectTreeUntilReady(win)');
  assert.notEqual(helperIndex, -1);
  const helperSource = canarySource.slice(helperIndex, canarySource.indexOf('async function captureReopenedYalkenTruth', helperIndex));
  assert.match(helperSource, /waitUntil\(async \(\) =>/u);
  assert.match(helperSource, /window\.electronAPI\.invokeWorkspaceQueryBridge\(\{queryId:'query\.projectTree',payload:\{tab:'roman'\}\}\)/u);
  assert.match(helperSource, /projectTreeProbe\.error === 'E_PROJECT_LEASE_HELD'\) return null/u);
  assert.match(helperSource, /C5V2_PROJECT_TREE_QUERY_FAILED/u);
  assert.match(helperSource, /'PROJECT_TREE_ROMAN_ROOT_NOT_READY', 30000/u);

  const startupIndex = canarySource.indexOf("progress('manifest-ready'");
  const readyIndex = canarySource.indexOf('await queryRomanProjectTreeUntilReady(win)', startupIndex);
  const createIndex = canarySource.indexOf("cmd.project.tree.createNode", startupIndex);
  assert.equal(startupIndex > 0 && readyIndex > startupIndex && readyIndex < createIndex, true);
  assert.match(canarySource.slice(readyIndex, createIndex), /progress\('project-tree-ready'/u);
  assert.doesNotMatch(canarySource.slice(startupIndex, readyIndex), /invokeWorkspaceQueryBridge/u);
});
