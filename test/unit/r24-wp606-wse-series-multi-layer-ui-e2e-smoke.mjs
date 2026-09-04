import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('WP606 Continuity UI exposes four metadata-only keyboard tabs without mutation routes', () => {
  const editor = fs.readFileSync('src/renderer/editor.js', 'utf8');
  const presentation = fs.readFileSync('src/renderer/atlasWseSeriesMultiLayerPresentationModel.mjs', 'utf8');
  for (const token of ['Series canon', 'Multi-layer atlas', 'Evidence capsule', 'Agent context']) assert.equal(presentation.includes(token), true, token);
  for (const token of ['data-atlas-wse-series-view', 'Series knowledge', 'metadata only', 'no instruction authority']) assert.equal(editor.includes(token), true, token);
  for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) assert.equal(editor.includes(key), true, key);
  assert.equal(editor.includes('appendAtlasWseSeriesMultiLayer(atlasContinuityLedgerHost, state.wseSeriesMultiLayer)'), true);
  assert.equal(editor.includes('seriesMultiLayer.apply'), false);
  assert.equal(editor.includes('agentContext.execute'), false);
});
