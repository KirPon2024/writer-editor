const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = process.cwd();
const editorPath = path.join(repoRoot, 'src', 'renderer', 'editor.js');
const cssPath = path.join(repoRoot, 'src', 'renderer', 'styles.css');
const editor = fs.readFileSync(editorPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');

test('R2 C02 routes Manual Map semantic actions through visible draft forms before dispatch', () => {
  assert.match(editor, /let manualMapCommandDraft = null/u);
  assert.match(editor, /schemaVersion:\s*'manualMap\.commandDraft\.v1'/u);
  assert.match(editor, /dataset\.manualMapCommandForm = 'true'/u);
  assert.match(editor, /dataset\.manualMapSelectionTarget = draft\.targetId/u);
  assert.match(editor, /dataset\.manualMapImpactPreview = 'true'/u);
  assert.match(editor, /dataset\.manualMapCommandApply = 'true'/u);
  assert.match(editor, /runProductJourneyCommand\(commandId, payload\)/u);

  const toolbarDirectDispatch = /button\.addEventListener\('click',\s*\(\)\s*=>\s*\{[\s\S]{0,160}runManualMapWorkbenchCommand/u;
  assert.doesNotMatch(editor, toolbarDirectDispatch);
});

test('R2 C02 destructive and structural Manual Map changes require explicit confirmation and expose cancel no-op', () => {
  assert.match(editor, /risk:\s*'destructive'/u);
  assert.match(editor, /risk:\s*'structural'/u);
  assert.match(editor, /dataset\.manualMapConfirmRisk = draft\.risk/u);
  assert.match(editor, /reason:\s*'CONFIRMATION_REQUIRED'/u);
  assert.match(editor, /dataset\.manualMapCommandCancel = 'true'/u);
  assert.match(editor, /status:\s*'CANCELLED_NOOP'/u);
  assert.match(editor, /mutationDispatched:\s*false/u);
});

test('R2 C02 preserves explicit targets and forbids first-object fallback mutations', () => {
  assert.doesNotMatch(editor, /nodes\.slice\(0,\s*3\)/u);
  assert.doesNotMatch(editor, /selectedNode\s*\|\|\s*nodes\[0\]/u);
  assert.doesNotMatch(editor, /selectedEdge\s*\|\|\s*edges\[0\]/u);
  assert.doesNotMatch(editor, /selectedGroup\s*\|\|\s*groups\[0\]/u);
  assert.match(editor, /targetId:\s*selectedNodeId/u);
  assert.match(editor, /targetId:\s*selectedEdgeId/u);
  assert.match(editor, /targetId:\s*manualMapText\(selectedGroup\?\.id\)/u);
});

test('R2 C02 turns drag persistence into previewed Apply instead of direct pointer-up mutation', () => {
  const pointerUpStart = editor.indexOf('function handleManualMapWorkbenchPointerUp');
  assert.notEqual(pointerUpStart, -1);
  const pointerUpEnd = editor.indexOf('async function refreshManualMapWorkbench', pointerUpStart);
  const pointerUpSource = editor.slice(pointerUpStart, pointerUpEnd);
  assert.match(pointerUpSource, /openManualMapCommandDraft\(/u);
  assert.match(pointerUpSource, /title:\s*'Move node'/u);
  assert.match(pointerUpSource, /impactPreview:/u);
  assert.doesNotMatch(pointerUpSource, /runManualMapWorkbenchCommand/u);
  assert.doesNotMatch(pointerUpSource, /runProductJourneyCommand/u);
});

test('R2 C02 styles command forms without adding a new UI framework or dependency marker', () => {
  assert.match(css, /\.manual-map-workspace__command-form/u);
  assert.match(css, /\.manual-map-workspace__impact-preview/u);
  assert.match(css, /\.manual-map-workspace__confirm/u);
  assert.match(css, /\.manual-map-workspace__command-actions/u);
  assert.doesNotMatch(editor + css, /from ['"](?:react|vue|svelte|@mui|antd)/u);
});
