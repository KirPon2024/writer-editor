const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = process.cwd();
const REPORT_PATH = path.join(
  REPO_ROOT,
  'docs/OPS/EVIDENCE/YALKEN_ATLAS_V5_R3_C02_TEMPORAL_CONTINUITY_SAVED_QUERY_JOURNEYS/r3-c02-temporal-continuity-saved-query-journeys-report.json',
);

async function importJourneyModule() {
  return import(pathToFileURL(path.join(
    REPO_ROOT,
    'scripts/ops/yalken-atlas-v5-r3-c02-temporal-continuity-saved-query-journeys.mjs',
  )).href);
}

function readReport() {
  return JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
}

test('R3 C02: renderer exposes visible temporal, continuity and saved-query command controls', () => {
  const editorSource = fs.readFileSync(path.join(REPO_ROOT, 'src', 'renderer', 'editor.js'), 'utf8');

  for (const commandId of [
    'atlas.calendar.define',
    'atlas.sceneTemporalAnchor.set',
    'atlas.continuityFact.record',
    'atlas.savedQuery.save',
  ]) {
    assert.match(editorSource, new RegExp(`makeAtlasSurfaceCommandButton\\([\\s\\S]{0,260}'${commandId}'`, 'u'), commandId);
  }

  for (const marker of [
    'atlasTemporalAction',
    'define-calendar',
    'set-scene-time',
    'atlasContinuityAction',
    'record-fact',
    'atlasReportsAction',
    'save-query',
  ]) {
    assert.match(editorSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'), marker);
  }

  assert.doesNotMatch(editorSource, /function announceAtlasContinuityCorrectionRoute/u);
  assert.doesNotMatch(editorSource, /Atlas correction route: \$\{commandId\}/u);
});

test('R3 C02: Atlas product core builder no longer silently slices source scenes', () => {
  const mainSource = fs.readFileSync(path.join(REPO_ROOT, 'src', 'main.js'), 'utf8');
  const builderMatch = /async function buildProductCoreStateForCurrentProject\(\) \{([\s\S]*?)\n\}/u.exec(mainSource);
  assert.ok(builderMatch, 'buildProductCoreStateForCurrentProject is present');
  assert.doesNotMatch(builderMatch[1], /collectAtlasOverviewSceneNodes\(roots\)\.slice\(0,\s*500\)/u);
  assert.match(builderMatch[1], /for \(const node of collectAtlasOverviewSceneNodes\(roots\)\)/u);
});

test('R3 C02: physical report proves command persistence, reopen and negative cases', () => {
  const report = readReport();
  assert.equal(report.pass, true);
  assert.equal(report.status, 'PASS_ATLAS_TEMPORAL_CONTINUITY_SAVED_QUERY_UI_JOURNEY');
  assert.equal(report.runtime.continuation.runtimeKind, 'production-electron-visible-input-black-box');
  assert.equal(report.runtime.reopen.runtimeKind, 'production-electron-visible-input-black-box');
  assert.equal(report.runtime.continuation.ok, true);
  assert.equal(report.runtime.reopen.ok, true);
  for (const [key, value] of Object.entries(report.accepted)) {
    assert.equal(value, true, `accepted.${key}`);
  }
  assert.equal(report.negativeAssertions.statusOnlyCorrectionAccepted, false);
  assert.equal(report.negativeAssertions.silentSceneSliceAccepted, false);
  assert.equal(report.negativeAssertions.directIpcAcceptedJourney, false);
});

test('R3 C02: evaluator rejects status-only continuity and silent scene slicing', async () => {
  const module = await importJourneyModule();
  const report = readReport();
  const rejected = module.evaluateTemporalContinuitySavedQueryJourneys({
    ...report.evaluationInput,
    rendererSourceHasStatusOnlyContinuity: true,
    productCoreHasSilentSceneSlice: true,
  });
  assert.equal(rejected.pass, false);
  assert.equal(rejected.accepted.noStatusOnlyContinuityRoute, false);
  assert.equal(rejected.accepted.noSilentSceneSlice, false);
});
