'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { fixture: wp503Fixture } = require('./r24-wp503-atlas-surface.test.js');

const ROOT = path.resolve(__dirname, '..', '..');
const importRepo = (relative) => import(pathToFileURL(path.join(ROOT, relative)).href);
const digest = (value) => `sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;

async function fixture() {
  const base = await wp503Fixture();
  const module = await importRepo('src/core/atlas-dossier-layout-links-v1.mjs');
  const surfaceProjection = base.surfaceModule.compileAtlasSurface(base.input);
  const currentIdentity = {
    snapshotId: surfaceProjection.snapshotId,
    projectRevisionId: surfaceProjection.projectRevisionId,
    generation: surfaceProjection.generation,
    sharedRowSetDigest: surfaceProjection.sharedRowSetDigest,
  };
  const evidenceIds = [...new Set(surfaceProjection.rows.flatMap((row) => row.evidenceIds))].sort();
  const evidenceRecords = evidenceIds.map((evidenceId, index) => ({
    evidenceId,
    kind: index % 2 === 0 ? 'SCENE_RANGE' : 'RECORD',
    sourceId: `source:${evidenceId}`,
    sourceRevisionDigest: digest(`revision:${evidenceId}`),
    sceneId: index % 2 === 0 ? 'scene-1' : '',
    startOffset: index % 2 === 0 ? index * 2 : null,
    endOffset: index % 2 === 0 ? index * 2 + 1 : null,
    quoteDigest: digest(`quote:${evidenceId}`),
    label: index % 2 === 0 ? `Точное свидетельство ${index + 1}` : `Evidence ${index + 1}`,
  }));
  const evidenceIdentity = module.createAtlasEvidenceSetIdentity(evidenceRecords, currentIdentity);
  return { ...base, module, surfaceProjection, currentIdentity, evidenceRecords, evidenceIdentity };
}

test('WP-504 compiles one immutable dossier and stable position per WP503 row', async () => {
  const f = await fixture();
  const projection = f.module.compileAtlasDossierLayoutLinks({ surfaceProjection: f.surfaceProjection, currentIdentity: f.currentIdentity, evidenceIdentity: f.evidenceIdentity, evidenceRecords: f.evidenceRecords });
  assert.equal(f.module.verifyAtlasDossierProjectionDigest(projection), projection);
  assert.equal(projection.denominator.rows, f.surfaceProjection.denominator.totalRows);
  assert.equal(projection.denominator.dossiers, projection.denominator.rows);
  assert.equal(projection.denominator.positions, projection.denominator.rows);
  assert.equal(projection.denominator.evidenceRecords, f.evidenceRecords.length);
  assert.equal(projection.authority.productMutation, false);
  assert.equal(projection.authority.persistence, false);
  assert.equal(Object.isFrozen(projection), true);
  assert.equal(Object.isFrozen(projection.dossiers[0].deepLinks), true);
});

test('WP-504 typed links preserve legitimate Unicode and exact revision identity', async () => {
  const f = await fixture();
  f.evidenceRecords[0].label = 'Анна — Café — 東京';
  const evidenceIdentity = f.module.createAtlasEvidenceSetIdentity(f.evidenceRecords, f.currentIdentity);
  const projection = f.module.compileAtlasDossierLayoutLinks({ surfaceProjection: f.surfaceProjection, currentIdentity: f.currentIdentity, evidenceIdentity, evidenceRecords: f.evidenceRecords });
  const evidenceLink = projection.dossiers.flatMap((dossier) => dossier.deepLinks).find((link) => link.kind === f.module.ATLAS_DEEP_LINK_KIND.EVIDENCE && link.label === 'Анна — Café — 東京');
  assert.ok(evidenceLink);
  assert.equal(f.module.assertAtlasDeepLinkCurrent(evidenceLink, { ...f.currentIdentity, projectId: projection.projectId }), evidenceLink);
  assert.equal(evidenceLink.identity.projectRevisionId, projection.projectRevisionId);
  assert.equal(evidenceLink.identity.sharedRowSetDigest, projection.sharedRowSetDigest);
  assert.equal(Object.hasOwn(evidenceLink, 'href'), false);
  assert.equal(Object.hasOwn(evidenceLink, 'commandId'), false);
});

test('WP-504 LOD and filtering preserve survivor coordinates', async () => {
  const f = await fixture();
  const projection = f.module.compileAtlasDossierLayoutLinks({ surfaceProjection: f.surfaceProjection, currentIdentity: f.currentIdentity, evidenceIdentity: f.evidenceIdentity, evidenceRecords: f.evidenceRecords });
  const all = projection.dossiers.map((dossier) => dossier.rowId);
  const subset = all.filter((_, index) => index % 2 === 0);
  const overview = f.module.projectAtlasDossierLayoutView({ projection, currentIdentity: f.currentIdentity, lod: 'OVERVIEW', selectedRowId: all[0], visibleRowIds: all });
  const context = f.module.projectAtlasDossierLayoutView({ projection, currentIdentity: f.currentIdentity, lod: 'CONTEXT', selectedRowId: all[0], visibleRowIds: subset });
  const evidence = f.module.projectAtlasDossierLayoutView({ projection, currentIdentity: f.currentIdentity, lod: 'EVIDENCE', selectedRowId: all[0], visibleRowIds: all });
  const stable = f.module.assertAtlasDossierMentalMapStable(overview, context, evidence);
  assert.equal(stable.status, 'PASS');
  assert.equal(stable.viewCount, 3);
  assert.equal(context.nodes.every((node) => node.detail === 'LABEL'), true);
  assert.equal(evidence.nodes.every((node) => node.detail === 'EVIDENCE_COUNT'), true);
});

test('WP-504 rejects missing, duplicate, extra, malformed and future evidence', async () => {
  const f = await fixture();
  const compile = (records) => f.module.compileAtlasDossierLayoutLinks({ surfaceProjection: f.surfaceProjection, currentIdentity: f.currentIdentity, evidenceIdentity: f.evidenceIdentity, evidenceRecords: records });
  assert.throws(() => compile(f.evidenceRecords.slice(1)), (error) => error.code === 'E_ATLAS_DOSSIER_EVIDENCE_IDENTITY_MISMATCH');
  assert.throws(() => compile([...f.evidenceRecords, f.evidenceRecords[0]]), (error) => error.code === 'E_ATLAS_DOSSIER_EVIDENCE_ID_DUPLICATE');
  assert.throws(() => compile([...f.evidenceRecords, { ...f.evidenceRecords[0], evidenceId: 'future-evidence' }]), (error) => error.code === 'E_ATLAS_DOSSIER_EVIDENCE_IDENTITY_MISMATCH');
  assert.throws(() => compile(f.evidenceRecords.map((record, index) => index ? record : { ...record, sourceRevisionDigest: digest('future-tree') })), (error) => error.code === 'E_ATLAS_DOSSIER_EVIDENCE_IDENTITY_MISMATCH');
  assert.throws(() => compile(f.evidenceRecords.map((record, index) => index ? record : { ...record, endOffset: record.startOffset })), (error) => error.code === 'E_ATLAS_DOSSIER_EVIDENCE_RANGE_INVALID');
});

test('WP-504 rejects stale projection, stale typed links and unknown LOD', async () => {
  const f = await fixture();
  const projection = f.module.compileAtlasDossierLayoutLinks({ surfaceProjection: f.surfaceProjection, currentIdentity: f.currentIdentity, evidenceIdentity: f.evidenceIdentity, evidenceRecords: f.evidenceRecords });
  const stale = { ...f.currentIdentity, generation: f.currentIdentity.generation + 1 };
  assert.throws(() => f.module.assertAtlasDossierLayoutLinksCurrent(projection, stale), (error) => error.code === 'E_ATLAS_DOSSIER_STALE');
  assert.throws(() => f.module.projectAtlasDossierLayoutView({ projection, currentIdentity: f.currentIdentity, lod: 'MAXIMUM', selectedRowId: '', visibleRowIds: [] }), (error) => error.code === 'E_ATLAS_DOSSIER_LOD_INVALID');
  const link = projection.dossiers[0].deepLinks[0];
  assert.throws(() => f.module.assertAtlasDeepLinkCurrent(link, { ...f.currentIdentity, generation: f.currentIdentity.generation + 1 }), (error) => error.code === 'E_ATLAS_DOSSIER_LINK_STALE');
});

test('WP-504 rejects accessors, symbols, sparse arrays and unknown fields without invoking them', async () => {
  const f = await fixture();
  let invoked = false;
  const hostile = { surfaceProjection: f.surfaceProjection, currentIdentity: f.currentIdentity, evidenceIdentity: f.evidenceIdentity, evidenceRecords: f.evidenceRecords };
  Object.defineProperty(hostile, 'trap', { enumerable: true, get() { invoked = true; return true; } });
  assert.throws(() => f.module.compileAtlasDossierLayoutLinks(hostile), (error) => error.code === 'E_ATLAS_DOSSIER_INPUT_INVALID');
  assert.equal(invoked, false);
  const symbolic = { surfaceProjection: f.surfaceProjection, currentIdentity: f.currentIdentity, evidenceIdentity: f.evidenceIdentity, evidenceRecords: f.evidenceRecords };
  symbolic[Symbol('authority')] = true;
  assert.throws(() => f.module.compileAtlasDossierLayoutLinks(symbolic), (error) => error.code === 'E_ATLAS_DOSSIER_INPUT_INVALID');
  const sparse = [...f.evidenceRecords]; delete sparse[0];
  assert.throws(() => f.module.compileAtlasDossierLayoutLinks({ surfaceProjection: f.surfaceProjection, currentIdentity: f.currentIdentity, evidenceIdentity: f.evidenceIdentity, evidenceRecords: sparse }), (error) => error.code === 'E_ATLAS_DOSSIER_EVIDENCE_ARRAY_INVALID');
});

module.exports = { fixture };
