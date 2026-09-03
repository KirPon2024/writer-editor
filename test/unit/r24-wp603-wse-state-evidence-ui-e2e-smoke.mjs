import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('WP603 built renderer contract exposes four keyboard views through the existing Continuity query', () => {
  const editor = fs.readFileSync(new URL('../../src/renderer/editor.js', import.meta.url), 'utf8');
  const presentation = fs.readFileSync(new URL('../../src/renderer/atlasWseStateEvidencePresentationModel.mjs', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../../src/renderer/styles.css', import.meta.url), 'utf8');
  assert.match(editor, /ATLAS_CONTINUITY_LEDGER_SURFACE_QUERY_ID/u);
  for (const view of ['storyStateDebugger', 'livingEvidenceBible', 'sceneCockpit', 'knowledgeMatrix']) assert.match(presentation, new RegExp(view, 'u'));
  assert.match(editor, /role', 'tablist'/u);
  assert.match(editor, /role', 'tabpanel'/u);
  assert.match(editor, /requestEpoch !== atlasContinuityRequestEpoch/u);
  assert.match(editor, /hashCanonicalValue\(sceneText\) !== expectedSceneTextHash/u);
  assert.match(css, /\.right-rail-atlas-wse-tab:focus-visible/u);
  assert.match(css, /min-height: 44px/u);
});
