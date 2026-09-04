import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('WP607 Continuity UI exposes four status-first keyboard tabs without mutation routes', () => {
  const editor = fs.readFileSync('src/renderer/editor.js', 'utf8');
  const presentation = fs.readFileSync('src/renderer/atlasWseClaimsPresentationModel.mjs', 'utf8');
  for (const token of ['User jobs', 'No bloat', 'Corpus', 'Hard limits']) assert.equal(presentation.includes(token), true, token);
  for (const token of ['data-atlas-wse-claims-view', 'Module claims', 'dataset.wseClaimsStatus', 'PASS · ']) assert.equal(editor.includes(token), true, token);
  for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) assert.equal(editor.includes(key), true, key);
  assert.equal(editor.includes('appendAtlasWseClaims(atlasContinuityLedgerHost, state.wseClaims)'), true);
  assert.equal(editor.includes('wseClaims.apply'), false);
  assert.equal(editor.includes('wseClaims.execute'), false);
  assert.equal(editor.includes('wseClaims.persist'), false);
});
