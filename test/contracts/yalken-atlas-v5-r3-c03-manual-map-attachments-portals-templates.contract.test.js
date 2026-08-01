const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readRepoFile(...parts) {
  return fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');
}

const REPORT_PATH = path.join(
  'docs',
  'OPS',
  'EVIDENCE',
  'YALKEN_ATLAS_V5_R3_C03_MANUAL_MAP_ATTACHMENTS_PORTALS_TEMPLATES',
  'r3-c03-manual-map-attachments-portals-templates-report.json',
);

test('R3 C03: Manual Map workbench exposes visible attachment, portal and template command drafts', () => {
  const editor = readRepoFile('src', 'renderer', 'editor.js');

  assert.match(editor, /manualMap\.attachment\.add/u);
  assert.match(editor, /manualMap\.portal\.add/u);
  assert.match(editor, /manualMap\.template\.apply/u);
  assert.match(editor, /Add attachment/u);
  assert.match(editor, /Add portal/u);
  assert.match(editor, /Apply template/u);
  assert.match(editor, /manualMapPortabilityKind/u);
  assert.match(editor, /manualMapPortabilityReadback/u);
  assert.match(editor, /File bytes are not embedded and scene text is unchanged/u);
  assert.match(editor, /ViewState is not persisted/u);
});

test('R3 C03: portability commands stay in command draft path and do not create a renderer storage bypass', () => {
  const editor = readRepoFile('src', 'renderer', 'editor.js');
  const portabilityBlock = editor.slice(
    editor.indexOf("makeManualMapDraftButton('Add attachment'"),
    editor.indexOf('  if (!options.compact) {', editor.indexOf("makeManualMapDraftButton('Add attachment'")),
  );

  assert.match(portabilityBlock, /makeManualMapDraftButton\('Add attachment'/u);
  assert.match(portabilityBlock, /makeManualMapDraftButton\('Add portal'/u);
  assert.match(portabilityBlock, /makeManualMapDraftButton\('Apply template'/u);
  assert.doesNotMatch(portabilityBlock, /localStorage\.setItem/u);
  assert.doesNotMatch(portabilityBlock, /writeFile|fs\.|ipcRenderer\.send/u);
  assert.doesNotMatch(portabilityBlock, /runProductJourneyCommand\(/u);
  assert.match(editor, /const result = await runProductJourneyCommand\(commandId, payload\)/u);
});

test('R3 C03: physical report proves visible UI persistence, reopen and portability roundtrip', () => {
  assert.equal(fs.existsSync(REPORT_PATH), true, 'Run the R3_C03 physical journey before accepting this contour.');
  const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));

  assert.equal(report.status, 'PASS_MANUAL_MAP_ATTACHMENTS_PORTALS_TEMPLATES_UI_JOURNEY');
  assert.equal(report.pass, true);
  assert.equal(report.accepted.visibleInputRuntime, true);
  assert.equal(report.accepted.attachmentPortalTemplateCommandsVisible, true);
  assert.equal(report.accepted.persistedPortabilityTruth, true);
  assert.equal(report.accepted.reopenProjectionVisible, true);
  assert.equal(report.accepted.exportRepeatImport, true);
  assert.equal(report.accepted.imagePdfEvidenceIncludesPortability, true);
  assert.equal(report.accepted.noNetworkNoDialogs, true);
  assert.equal(report.accepted.noDirectIpcOrStorageBypass, true);
  assert.equal(report.negativeAssertions.generatedArtifactOnlyAccepted, false);
  assert.equal(report.negativeAssertions.directIpcAcceptedJourney, false);
  assert.equal(report.negativeAssertions.hiddenPortabilityControlsAccepted, false);
});

test('R3 C03: evaluator rejects report-only or missing-portability false green', async () => {
  const module = await import(path.join(process.cwd(), 'scripts', 'ops', 'yalken-atlas-v5-r3-c03-manual-map-attachments-portals-templates.mjs'));
  const rejected = module.evaluateManualMapPortabilityJourney({
    first: { ok: true, runtimeKind: 'generated-report-only', result: { rendererProbe: { snapshot: {} } } },
    second: { ok: true, runtimeKind: 'generated-report-only', result: { rendererProbe: { snapshot: {} } } },
    portability: { exportLossCount: 0, repeatImportOk: true },
  });

  assert.equal(rejected.pass, false);
  assert.equal(rejected.status, 'NOT_READY');
  assert.equal(rejected.accepted.visibleInputRuntime, false);
  assert.equal(rejected.accepted.persistedPortabilityTruth, false);
});
