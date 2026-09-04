import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('WP605 Continuity UI exposes four read-only keyboard tabs without mutation routes', () => {
  const editor = fs.readFileSync('src/renderer/editor.js', 'utf8');
  const presentation = fs.readFileSync('src/renderer/atlasWseRevisionTimeObjectPresentationModel.mjs', 'utf8');
  const styles = fs.readFileSync('src/renderer/styles.css', 'utf8');
  for (const token of ['Semantic diff', 'Retcon', 'Story clock', 'Object custody']) assert.equal(presentation.includes(token), true, token);
  for (const token of ['data-atlas-wse-revision-view', 'Revision & time', 'read only']) assert.equal(editor.includes(token), true, token);
  for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) assert.equal(editor.includes(key), true, key);
  assert.equal(editor.includes('appendAtlasWseRevisionTimeObject(atlasContinuityLedgerHost, state.wseRevisionTimeObject)'), true);
  assert.equal(editor.includes('retcon.apply'), false);
  assert.equal(styles.includes('right-rail-atlas-wse-revision-row'), true);
});
