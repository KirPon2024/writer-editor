'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { importRepo } = require('../fixtures/r24-wp603-wse-state-evidence-fixtures.js');

function capability() {
  return { capabilities: { atlasContinuityLedgerSurface: true, atlasContinuityFindings: true, atlasContinuityFactLedgers: true } };
}

test('WP603 existing Continuity adapter publishes WSE even when authored facts have no finding', async () => {
  const runtime = await importRepo('src/core/runtime.mjs');
  const derived = await importRepo('src/derived/atlas/deriveAtlasContinuityLedgerSurface.mjs');
  const projectId = 'wp603-integration';
  let state = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    { type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE, payload: { projectId, title: 'WSE', sceneId: 'scene-a' } },
    { type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT, payload: { projectId, sceneId: 'scene-a', text: 'Mira knows the door code.' } },
    { type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE, payload: { projectId, entityId: 'mira', name: 'Mira', entityKind: 'character' } },
    { type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE, payload: { projectId, entityId: 'door', name: 'Door', entityKind: 'object' } },
  ]).state;
  const quote = 'Mira knows the door code.';
  const command = { type: runtime.CORE_COMMAND_IDS.ATLAS_CONTINUITY_FACT_RECORD, payload: {
    projectId, ledgerKind: 'knowledge', factId: 'knowledge-door', sceneId: 'scene-a', subjectEntityId: 'mira',
    relatedEntityIds: ['door'], factLabel: 'Door code', factValue: 'known', promiseState: '',
    evidenceAnchor: { schemaVersion: 'atlas.evidenceAnchor.v1', anchorId: 'anchor-door', projectId, sceneId: 'scene-a', entityId: 'mira', startOffset: 0, endOffset: quote.length, quote, quoteHash: runtime.hashCoreState(quote), sceneTextHash: runtime.hashCoreState(quote) },
  } };
  const recorded = runtime.reduceCoreState(state, command);
  assert.equal(recorded.ok, true); state = recorded.state;
  const result = derived.deriveAtlasContinuityLedgerSurface({ coreState: state, params: { projectId }, capabilitySnapshot: capability() });
  assert.equal(result.ok, true);
  assert.equal(result.value.state, 'ready');
  assert.equal(result.value.wseStateEvidence.views.livingEvidenceBible.totalCount, 1);
  assert.equal(result.value.wseStateEvidence.views.knowledgeMatrix.rows[0].claim, 'known');
  assert.equal(result.value.wseStateEvidence.views.sceneCockpit.rows[0].evidence[0].quoteHash, command.payload.evidenceAnchor.quoteHash);
  assert.equal(result.value.wseStateEvidence.openWorld.inference, false);
});

test('WP603 renderer presentation keeps all four native views and honest counts', async () => {
  const core = await importRepo('src/core/wse-state-evidence-v1.mjs');
  const renderer = await importRepo('src/renderer/atlasWseStateEvidencePresentationModel.mjs');
  const projection = core.buildWseStateEvidence({ projectId: 'project', facts: [], continuityRows: [] });
  const view = renderer.normalizeWseStateEvidencePresentation(projection, 'knowledgeMatrix');
  assert.equal(view.tabs.length, 4);
  assert.equal(view.tabs.filter((tab) => tab.selected).length, 1);
  assert.equal(view.viewId, 'knowledgeMatrix');
  assert.equal(view.openWorldLabel, 'UNKNOWN_NOT_RECORDED');
  assert.equal(renderer.wseRowEvidence({ evidence: [{ sceneId: 'scene-a' }] }).sceneId, 'scene-a');
});

test('WP603 UI source rejects late results and stale anchors before selection', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(process.cwd(), 'src/renderer/editor.js'), 'utf8');
  assert.match(source, /requestEpoch !== atlasContinuityRequestEpoch/u);
  assert.match(source, /currentProjectId !== requestProjectId/u);
  assert.match(source, /nextState\.projectId === requestProjectId/u);
  assert.match(source, /atlasContinuityLedgerExplicitOpen !== true/u);
  assert.match(source, /hashCanonicalValue\(currentQuote\) !== expectedQuoteHash/u);
  assert.match(source, /hashCanonicalValue\(sceneText\) !== expectedSceneTextHash/u);
  assert.match(source, /role', 'tablist'/u);
  assert.match(source, /aria-controls/u);
  assert.match(source, /ArrowLeft.*ArrowRight.*Home.*End/u);
});
