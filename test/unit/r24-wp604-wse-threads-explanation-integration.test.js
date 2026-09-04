'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { importRepo } = require('../fixtures/r24-wp604-wse-threads-explanation-fixtures.js');

function capability() {
  return { capabilities: { atlasContinuityLedgerSurface: true, atlasContinuityFindings: true, atlasContinuityFactLedgers: true } };
}

test('WP604 existing Continuity query derives an evidence-bound setup/payoff board from authored project facts', async () => {
  const runtime = await importRepo('src/core/runtime.mjs');
  const derived = await importRepo('src/derived/atlas/deriveAtlasContinuityLedgerSurface.mjs');
  const projectId = 'wp604-integration';
  let state = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    { type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE, payload: { projectId, title: 'Threads', sceneId: 'scene-a' } },
    { type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT, payload: { projectId, sceneId: 'scene-a', text: 'Anna promises to return.' } },
    { type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE, payload: { projectId, entityId: 'anna', name: 'Anna', entityKind: 'character' } },
    { type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE, payload: { projectId, entityId: 'boris', name: 'Boris', entityKind: 'character' } },
  ]).state;
  const quote = 'Anna promises to return.';
  const record = (factId, promiseState) => ({
    type: runtime.CORE_COMMAND_IDS.ATLAS_CONTINUITY_FACT_RECORD,
    payload: {
      projectId, ledgerKind: 'promise', factId, sceneId: 'scene-a', subjectEntityId: 'anna',
      relatedEntityIds: ['boris'], factLabel: 'Return promise', factValue: 'return', promiseState,
      evidenceAnchor: { schemaVersion: 'atlas.evidenceAnchor.v1', anchorId: `anchor-${factId}`, projectId, sceneId: 'scene-a', entityId: 'anna', startOffset: 0, endOffset: quote.length, quote, quoteHash: runtime.hashCoreState(quote), sceneTextHash: runtime.hashCoreState(quote) },
    },
  });
  for (const command of [record('promise-open', 'open'), record('promise-fulfilled', 'fulfilled')]) {
    const result = runtime.reduceCoreState(state, command);
    assert.equal(result.ok, true); state = result.state;
  }
  const result = derived.deriveAtlasContinuityLedgerSurface({ coreState: state, params: { projectId }, capabilitySnapshot: capability() });
  assert.equal(result.ok, true);
  const threads = result.value.wseThreadsExplanation;
  assert.equal(threads.views.setupPayoffBoard.totalCount, 1);
  assert.equal(threads.views.setupPayoffBoard.rows[0].payoffState, 'FULFILLED');
  assert.equal(threads.views.setupPayoffBoard.rows[0].setupEvidence[0].quote, quote);
  assert.equal(threads.availability.causalProjection, 'UNKNOWN_NO_EXPLICIT_CAUSAL_PROJECTION');
  assert.equal(threads.views.dependencyDag.rows.length, 0);
  assert.equal(threads.openWorld.inference, false);
  assert.equal(result.value.summary.surfaceHash.length, 64);
});

test('WP604 renderer model keeps all native views, honest counts and authored evidence routes', async () => {
  const core = await importRepo('src/core/wse-threads-explanation-v1.mjs');
  const renderer = await importRepo('src/renderer/atlasWseThreadsExplanationPresentationModel.mjs');
  const projection = core.buildWseThreadsExplanation({
    projectId: 'project', sourceRevision: 'revision', currentSourceRevision: 'revision', generation: 1, currentGeneration: 1,
    facts: [], causalContext: null, rowLimit: 32,
  });
  const view = renderer.normalizeWseThreadsExplanationPresentation(projection, 'whyWhyNot');
  assert.equal(view.tabs.length, 4);
  assert.equal(view.tabs.filter((tab) => tab.selected).length, 1);
  assert.equal(view.viewId, 'whyWhyNot');
  assert.equal(view.causalAvailability, 'UNKNOWN_NO_EXPLICIT_CAUSAL_PROJECTION');
  assert.equal(view.view.rows[0].unknownReason, 'UNKNOWN_NO_EXPLICIT_CAUSAL_PROJECTION');
  assert.equal(renderer.wseThreadsRowEvidence({ evidence: [{ sceneId: '', quote: '' }] }), null);
});

test('WP604 renderer wiring adds no product command, persistence, network or implicit relation authority', () => {
  const editor = fs.readFileSync(path.join(process.cwd(), 'src/renderer/editor.js'), 'utf8');
  const projection = fs.readFileSync(path.join(process.cwd(), 'src/core/wse-threads-explanation-v1.mjs'), 'utf8');
  assert.match(editor, /dataset\.atlasWseThreadView/u);
  assert.match(editor, /No explicit causal projection is available\. No relation is inferred\./u);
  assert.match(editor, /role', 'tablist'/u);
  assert.match(editor, /ArrowLeft.*ArrowRight.*Home.*End/u);
  assert.doesNotMatch(projection, /from ['"](?:node:fs|electron)['"]|fetch\(|XMLHttpRequest|WebSocket|writeFile|localStorage/u);
  assert.doesNotMatch(projection, /relatedEntityIds.*CAUS/u);
  assert.match(projection, /productMutation: false/u);
  assert.match(projection, /commandAuthority: false/u);
});
