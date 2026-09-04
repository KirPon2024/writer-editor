import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('WP604 built Continuity surface exposes four keyboard-readable story-thread views', () => {
  const editor = fs.readFileSync(new URL('../../src/renderer/editor.js', import.meta.url), 'utf8');
  const presentation = fs.readFileSync(new URL('../../src/renderer/atlasWseThreadsExplanationPresentationModel.mjs', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../../src/renderer/styles.css', import.meta.url), 'utf8');
  for (const view of ['setupPayoffBoard', 'dependencyDag', 'canonCi', 'whyWhyNot']) assert.match(presentation, new RegExp(view, 'u'));
  assert.match(editor, /data-atlas-wse-thread-view/u);
  assert.match(editor, /role', 'tablist'/u);
  assert.match(editor, /role', 'tabpanel'/u);
  assert.match(editor, /No explicit causal projection is available\. No relation is inferred\./u);
  assert.match(editor, /requestEpoch !== atlasContinuityRequestEpoch/u);
  assert.match(editor, /currentProjectId !== requestProjectId/u);
  assert.match(css, /\.right-rail-atlas-wse-tab:focus-visible/u);
  assert.match(css, /min-height: 44px/u);
  assert.match(css, /data-wse-thread-status="ABSTAIN"/u);
});
