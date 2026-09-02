'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { fixture, query } = require('./r24-wp505-register-ask.test.js');

const ROOT = path.resolve(__dirname, '..', '..');
const importRepo = (relative) => import(pathToFileURL(path.join(ROOT, relative)).href);

test('WP-505 renderer adapter preserves authored/computed roles, evidence text and exact query parity', async () => {
  const f = await fixture();
  const renderer = await importRepo('src/renderer/atlasRegisterAskPresentationModel.mjs');
  const queryResult = f.module.askAtlas({
    currentIdentity: f.currentIdentity,
    registerProjection: f.registerProjection,
    query: query({ clauses: [{ field: 'ORIGIN', operator: 'EQ', value: 'AUTHORED' }] }),
  });
  const presentation = renderer.buildAtlasRegisterAskPresentation({ currentIdentity: f.currentIdentity, registerProjection: f.registerProjection, queryResult });
  assert.equal(renderer.assertAtlasRegisterAskPresentationParity(presentation, f.registerProjection, queryResult), presentation);
  assert.equal(presentation.summary.authoredCount, 2);
  assert.equal(presentation.summary.computedCount, f.dossierProjection.dossiers.length);
  assert.equal(presentation.results.every((entry) => entry.origin === 'AUTHORED'), true);
  assert.equal(presentation.results.some((entry) => entry.label === 'Café — решение'), true);
  assert.equal(presentation.results.every((entry) => entry.evidenceCount === 1), true);
});

test('WP-505 differential oracle yields identical results for equivalent immutable inputs', async () => {
  const f = await fixture();
  const queryIr = query({ clauses: [{ field: 'TAG', operator: 'CONTAINS', value: 'review' }], orderBy: { field: 'LABEL', direction: 'ASC' } });
  const firstProjection = f.module.compileAtlasRegister(f.input);
  const secondProjection = f.module.compileAtlasRegister(structuredClone(f.input));
  assert.deepEqual(secondProjection, firstProjection);
  const first = f.module.askAtlas({ currentIdentity: f.currentIdentity, registerProjection: firstProjection, query: queryIr });
  const second = f.module.askAtlas({ currentIdentity: structuredClone(f.currentIdentity), registerProjection: secondProjection, query: structuredClone(queryIr) });
  assert.deepEqual(second, first);
  assert.equal(first.totalMatched, 1);
  assert.equal(first.entries[0].entryId, 'authored:decision-1');
});

test('WP-505 large-corpus register and bounded Ask Atlas stay within explicit limits', async () => {
  const [module, hash] = await Promise.all([importRepo('src/core/atlas-register-ask-v1.mjs'), importRepo('src/core/browser-safe-hash.mjs')]);
  const count = 10_000;
  const currentIdentity = { snapshotId: 'snapshot-large', projectRevisionId: `sha256:${'1'.repeat(64)}`, generation: 11, sharedRowSetDigest: `sha256:${'2'.repeat(64)}` };
  const dossiers = Array.from({ length: count }, (_, index) => {
    const id = String(index).padStart(5, '0');
    return {
      dossierId: `dossier:row-${id}`, rowId: `row-${id}`, sheetId: 'ASSOCIATIONS', sourceId: `source-${id}`,
      sourceDigest: `sha256:${String(index % 10).repeat(64)}`, label: `Node ${id}`, status: 'CURRENT',
      sceneIds: [`scene-${index % 40}`], entityIds: [`entity-${index % 500}`],
      evidence: [{ evidenceId: `evidence-${id}` }],
    };
  });
  const normalized = {
    schemaVersion: 'yalken.r24.atlasDossierLayoutLinks.v1', stageId: 'WP-504_DOSSIER_LAYOUT_LINKS', profileId: 'ATLAS_PRODUCT_V33', projectId: 'project-large',
    ...currentIdentity, surfaceProjectionDigest: `sha256:${'3'.repeat(64)}`, evidenceRecordSetDigest: `sha256:${'4'.repeat(64)}`,
    dossiers, positions: [], denominator: { rows: count }, authority: {}, featureManifestDigest: `sha256:${'5'.repeat(64)}`,
  };
  const dossierProjection = { ...normalized, projectionDigest: `sha256:${hash.hashCanonicalValue(normalized)}` };
  const authoredEntries = [];
  const authoredIdentity = module.createAtlasAuthoredRegisterIdentity(authoredEntries, currentIdentity);
  const started = performance.now();
  const registerProjection = module.compileAtlasRegister({ currentIdentity, dossierProjection, authoredEntries, authoredIdentity });
  const result = module.askAtlas({ currentIdentity, registerProjection, query: query({ clauses: [{ field: 'ENTITY_ID', operator: 'CONTAINS', value: 'entity-42' }], limit: 64 }) });
  const elapsed = performance.now() - started;
  assert.equal(registerProjection.denominator.computed, count);
  assert.equal(registerProjection.denominator.total, count);
  assert.equal(result.returned, 20);
  assert.equal(result.truncated, false);
  assert.ok(elapsed < 20_000, `WP505 large corpus exceeded budget: ${elapsed}ms`);
});

test('WP-505 presentation rejects a stale query result from another register projection', async () => {
  const f = await fixture();
  const renderer = await importRepo('src/renderer/atlasRegisterAskPresentationModel.mjs');
  const queryResult = structuredClone(f.module.askAtlas({ currentIdentity: f.currentIdentity, registerProjection: f.registerProjection, query: query() }));
  queryResult.registerProjectionDigest = `sha256:${'f'.repeat(64)}`;
  const { resultDigest, ...identity } = queryResult;
  const hash = await importRepo('src/core/browser-safe-hash.mjs');
  queryResult.resultDigest = `sha256:${hash.hashCanonicalValue(identity)}`;
  assert.throws(() => renderer.buildAtlasRegisterAskPresentation({ currentIdentity: f.currentIdentity, registerProjection: f.registerProjection, queryResult }), /E_ATLAS_REGISTER_ASK_PRESENTATION_RESULT_STALE/u);
});
