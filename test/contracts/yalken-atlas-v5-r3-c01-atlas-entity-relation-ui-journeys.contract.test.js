const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = process.cwd();
const REPORT_PATH = path.join(
  REPO_ROOT,
  'docs/OPS/EVIDENCE/YALKEN_ATLAS_V5_R3_C01_ATLAS_ENTITY_RELATION_UI_JOURNEYS/r3-c01-atlas-entity-relation-ui-journeys-report.json',
);

async function importJourneyModule() {
  return import(pathToFileURL(path.join(
    REPO_ROOT,
    'scripts/ops/yalken-atlas-v5-r3-c01-atlas-entity-relation-ui-journeys.mjs',
  )).href);
}

function readReport() {
  return JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
}

test('R3 C01: physical Atlas entity/relation/evidence journey report is executable UI proof', () => {
  const report = readReport();
  assert.equal(report.pass, true);
  assert.equal(report.status, 'PASS_ATLAS_ENTITY_RELATION_UI_JOURNEY');
  assert.equal(report.runtime.first.runtimeKind, 'production-electron-visible-input-black-box');
  assert.equal(report.runtime.second.runtimeKind, 'production-electron-visible-input-black-box');
  assert.equal(report.runtime.first.ok, true);
  assert.equal(report.runtime.second.ok, true);
  for (const [key, value] of Object.entries(report.accepted)) {
    assert.equal(value, true, `accepted.${key}`);
  }
  assert.equal(report.negativeAssertions.directIpcAcceptedJourney, false);
  assert.equal(report.negativeAssertions.hiddenFirstEntityFallbackAccepted, false);
  assert.equal(report.negativeAssertions.generatedArtifactOnlyAccepted, false);
  assert.equal(report.negativeAssertions.networkActivated, false);
  assert.equal(report.negativeAssertions.overflowAccepted, false);
});

test('R3 C01: persisted author truth includes Atlas entity, alias, mention, relation and reattach operations', () => {
  const report = readReport();
  const atlas = report.persistence.atlas;
  assert.deepEqual(atlas.entityNames.sort(), ['AlphaR3C01', 'BetaR3C01']);
  assert.ok(atlas.aliasValues.includes('AlphaAliasR3C01'));
  assert.ok(atlas.decisionCount >= 1);
  assert.ok(atlas.suppressionCount >= 1);
  assert.ok(atlas.reassignmentCount >= 1);
  assert.ok(atlas.mergeOperationCount >= 1);
  assert.ok(atlas.restoredMergeOperationCount >= 1);
  assert.ok(atlas.reattachmentCount >= 1);
  assert.ok(report.evidenceFiles.journeyScreenshot.bytes > 1000);
  assert.ok(report.evidenceFiles.reopenScreenshot.bytes > 1000);
});

test('R3 C01: renderer exposes explicit Journey fields and no hidden first-target fallback', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, 'src/renderer/editor.js'), 'utf8');
  for (const field of ['entityName', 'aliasValue', 'sourceEntityId', 'targetEntityId', 'mentionId']) {
    assert.match(source, new RegExp(`data-atlas-journey-field[^\\n]+${field}|fieldName: '${field}'`, 'u'));
  }
  for (const action of [
    'create-entity',
    'add-alias',
    'confirm-mention',
    'suppress-observation',
    'reassign-observation',
    'merge-entities',
    'split-restore',
    'reattach-evidence',
  ]) {
    assert.match(source, new RegExp(`actionId: '${action}'`, 'u'));
  }
  assert.doesNotMatch(source, /firstAtlasEntity|firstAtlasMention/u);
  assert.match(source, /refreshAtlasCurrentScene\(\{ force: true \}\)/u);
});

test('R3 C01: evaluator rejects screenshot-only or hidden fallback acceptance', async () => {
  const module = await importJourneyModule();
  const report = readReport();
  const rejected = module.evaluateAtlasEntityRelationUiJourneys({
    first: report.runtime.first,
    second: report.runtime.second,
    persistence: report.persistence,
    rendererSourceHasFirstFallback: true,
  });
  assert.equal(rejected.pass, false);
  assert.equal(rejected.accepted.noFirstTargetFallbackSurface, false);
  assert.equal(rejected.negativeAssertions.hiddenFirstEntityFallbackAccepted, true);
});
