'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, clone } = require('../fixtures/r24-wp603-wse-state-evidence-fixtures.js');

test('WP603 exposes four immutable source-first views and preserves open-world unknown', async () => {
  const f = await fixture();
  const before = JSON.stringify({ facts: f.facts, rows: f.continuityRows });
  const result = f.api.buildWseStateEvidence({ projectId: f.projectId, facts: f.facts, continuityRows: f.continuityRows, rowLimit: 32 });
  assert.equal(result.schemaVersion, 'yalken.wseStateEvidence.v1');
  assert.deepEqual(Object.keys(result.views), ['storyStateDebugger', 'livingEvidenceBible', 'sceneCockpit', 'knowledgeMatrix']);
  assert.equal(result.views.storyStateDebugger.totalCount, 1);
  assert.equal(result.views.livingEvidenceBible.totalCount, 4);
  assert.equal(result.views.sceneCockpit.totalCount, 2);
  assert.equal(result.views.knowledgeMatrix.totalCount, 1);
  assert.equal(result.views.storyStateDebugger.rows[0].evidence[0].quoteHash, f.facts[1].evidenceAnchor.quoteHash);
  assert.equal(result.views.sceneCockpit.rows.every((row) => row.evidence.length > 0), true);
  assert.equal(result.openWorld.absenceMeans, 'UNKNOWN_NOT_RECORDED');
  assert.equal(result.openWorld.inference, false);
  assert.equal(result.state, 'degraded');
  assert.equal(result.authority.productMutation, false);
  assert.equal(result.authority.storageAuthority, false);
  assert.match(result.projectionDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(JSON.stringify({ facts: f.facts, rows: f.continuityRows }), before);
});

test('WP603 reports complete visible and omitted denominators without partial ambiguity', async () => {
  const f = await fixture();
  const facts = Array.from({ length: 300 }, (_, index) => ({ ...clone(f.facts[index % f.facts.length]), id: 'fact-' + String(index).padStart(4, '0') }));
  const result = f.api.buildWseStateEvidence({ projectId: f.projectId, facts, continuityRows: [], rowLimit: 17 });
  assert.equal(result.denominator.inputFacts, 300);
  assert.equal(result.denominator.complete, true);
  assert.equal(result.views.livingEvidenceBible.visibleCount, 17);
  assert.equal(result.views.livingEvidenceBible.omittedCount, 283);
  assert.equal(result.views.livingEvidenceBible.totalCount, 300);
});

test('WP603 degrades for missing or stale continuity evidence outside the visible row budget', async () => {
  const f = await fixture();
  const rows = Array.from({ length: 20 }, (_, index) => ({
    id: 'finding-' + index,
    evidenceRows: index === 19 ? [] : [clone(f.continuityRows[0].evidenceRows[0])],
  }));
  const result = f.api.buildWseStateEvidence({ projectId: f.projectId, facts: [], continuityRows: rows, rowLimit: 4 });
  assert.equal(result.views.storyStateDebugger.visibleCount, 4);
  assert.equal(result.views.storyStateDebugger.omittedCount, 16);
  assert.equal(result.views.storyStateDebugger.rows.every((row) => row.evidenceState === 'current'), true);
  assert.equal(result.state, 'degraded');
});

test('WP603 rejects cross-project, malformed and over-budget input before interpretation', async () => {
  const f = await fixture();
  const wrong = clone(f.facts); wrong[0].projectId = 'other-project';
  assert.throws(() => f.api.buildWseStateEvidence({ projectId: f.projectId, facts: wrong, continuityRows: [] }), { code: 'E_WSE_FACT_IDENTITY' });
  assert.throws(() => f.api.buildWseStateEvidence({ projectId: '', facts: [], continuityRows: [] }), { code: 'E_WSE_PROJECT_ID' });
  assert.throws(() => f.api.buildWseStateEvidence({ projectId: f.projectId, facts: Array(10001).fill(f.facts[0]), continuityRows: [] }), { code: 'E_WSE_FACT_BUDGET' });
  assert.throws(() => f.api.buildWseStateEvidence({ projectId: f.projectId, facts: [], continuityRows: Array(10001).fill({}) }), { code: 'E_WSE_ROW_BUDGET' });
  assert.throws(() => f.api.buildWseStateEvidence({ projectId: f.projectId, facts: [{ ...f.facts[0], relatedEntityIds: Array(65).fill('entity') }], continuityRows: [] }), { code: 'E_WSE_RELATED_ENTITY_BUDGET' });
  assert.throws(() => f.api.buildWseStateEvidence({ projectId: f.projectId, facts: Array(10000).fill(f.facts[0]), continuityRows: [{ evidenceRows: Array(6385).fill({}) }] }), { code: 'E_WSE_EVIDENCE_BUDGET' });
});

test('WP603 10000-fact corpus matches an independent view-count oracle within bounded output', async () => {
  const f = await fixture();
  const facts = Array.from({ length: 10000 }, (_, index) => ({
    ...clone(f.facts[index % f.facts.length]),
    id: 'large-' + String(index).padStart(5, '0'),
    sceneId: 'scene-' + String(index % 250).padStart(3, '0'),
  }));
  const expected = {
    bible: facts.length,
    scenes: new Set(facts.map((fact) => fact.sceneId)).size,
    matrix: facts.filter((fact) => fact.ledgerKind === 'knowledge').reduce((sum, fact) => sum + Math.max(1, new Set(fact.relatedEntityIds).size), 0),
  };
  const result = f.api.buildWseStateEvidence({ projectId: f.projectId, facts, continuityRows: [], rowLimit: 128 });
  assert.equal(result.views.livingEvidenceBible.totalCount, expected.bible);
  assert.equal(result.views.sceneCockpit.totalCount, expected.scenes);
  assert.equal(result.views.knowledgeMatrix.totalCount, expected.matrix);
  assert.equal(result.views.livingEvidenceBible.rows.length, 128);
  assert.equal(result.views.sceneCockpit.rows.every((row) => row.evidence.length <= 16), true);
  assert.equal(result.denominator.complete, true);
});

test('WP603 feature and surface manifests bind the existing read-only seam', async () => {
  const f = await fixture();
  const feature = f.api.WSE_STATE_EVIDENCE_FEATURE_INTEGRATION_MANIFEST_V1;
  const surface = f.api.WSE_STATE_EVIDENCE_SURFACE_MANIFEST_V1;
  assert.equal(feature.schemaVersion, 'FEATURE_INTEGRATION_MANIFEST_V1');
  assert.deepEqual(feature.productPorts, ['query.atlasContinuityLedgerSurface']);
  assert.equal(surface.schemaVersion, 'SURFACE_MANIFEST_V1');
  assert.equal(surface.slotId, 'rightRail.context.atlas.continuityLedger');
  assert.equal(surface.existingSurfaceReused, true);
  assert.equal(surface.productMutation, false);
  assert.equal(Object.keys(f.api.WSE_STATE_EVIDENCE_QUERY_PLANS_V1).length, 4);
});
