'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const importRepo = (relative) => import(pathToFileURL(path.join(ROOT, relative)).href);
const digest = (value) => `sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;

function overview() {
  return {
    state: 'ready',
    summary: { sceneCount: 2, entityCount: 2, cooccurrencePairCount: 1, evidenceHealth: 'current' },
    topEntities: [
      { entityId: 'entity-anna', name: 'Анна', appearanceCount: 8, sceneCount: 2, entityKind: 'CHARACTER' },
      { entityId: 'entity-cafe', name: 'Café', appearanceCount: 3, sceneCount: 1, entityKind: 'PLACE' },
    ],
    topRelations: [{ pairId: 'pair-1', leftEntityId: 'entity-anna', rightEntityId: 'entity-cafe', leftName: 'Анна', rightName: 'Café', occurrenceCount: 2, sceneCount: 1 }],
    sceneCoverage: [{ sceneId: 'scene-1', title: 'Возвращение', entityCount: 2, observationCount: 4, evidenceHealth: 'current' }],
  };
}

test('WP-504 renderer dossier keeps selection, exact evidence and typed deep-link semantics', async () => {
  const [surface, dossier] = await Promise.all([importRepo('src/renderer/atlasSurfacePresentationModel.mjs'), importRepo('src/renderer/atlasDossierLayoutPresentationModel.mjs')]);
  const surfacePresentation = surface.buildAtlasSurfacePresentation({ overview: overview(), posture: 'FULL', view: 'GRAPH', selectedRowId: 'entity:entity-anna', viewportWidth: 1440 });
  const entityDossier = {
    selectedEntityId: 'entity-anna',
    evidenceLedger: { rows: [{ evidenceId: 'anchor-1', quote: 'Анна вошла в Café.', sceneId: 'scene-1', startOffset: 4, endOffset: 23, evidenceState: 'CURRENT' }] },
  };
  const result = dossier.buildAtlasDossierLayoutPresentation({ surfacePresentation, lod: 'EVIDENCE', entityDossier, relationDossier: {} });
  assert.equal(dossier.assertAtlasDossierPresentationParity(result, surfacePresentation), result);
  assert.equal(result.selectedRowId, 'entity:entity-anna');
  assert.equal(result.dossier.evidence[0].label, 'Анна вошла в Café.');
  assert.equal(result.dossier.typedLinks.some((link) => link.kind === 'ATLAS_ENTITY' && link.targetId === 'entity-anna'), true);
  assert.equal(result.dossier.typedLinks.some((link) => link.kind === 'ATLAS_EVIDENCE' && link.targetId === 'anchor-1'), true);
  assert.equal(result.graphNodes.every((node) => node.detail === 'EVIDENCE_COUNT'), true);
});

test('WP-504 renderer differential oracle keeps graph positions identical across LOD and view state', async () => {
  const [surface, dossier] = await Promise.all([importRepo('src/renderer/atlasSurfacePresentationModel.mjs'), importRepo('src/renderer/atlasDossierLayoutPresentationModel.mjs')]);
  const presentations = [];
  for (const view of ['GRAPH', 'LIST', 'TABLE']) {
    const surfacePresentation = surface.buildAtlasSurfacePresentation({ overview: overview(), posture: 'FULL', view, selectedRowId: 'relation:pair-1', viewportWidth: 1440 });
    for (const lod of ['OVERVIEW', 'CONTEXT', 'EVIDENCE']) presentations.push(dossier.buildAtlasDossierLayoutPresentation({ surfacePresentation, lod, entityDossier: {}, relationDossier: { selectedPairId: 'pair-1', evidencePacket: { rows: [] } } }));
  }
  const stable = dossier.assertAtlasDossierPresentationMentalMapStable(...presentations);
  assert.equal(stable.status, 'PASS');
  assert.equal(new Set(presentations.map((item) => item.positionDigest)).size, 1);
  assert.equal(presentations.every((item) => item.rowCount === 4), true);
});

test('WP-504 large-corpus dossier compilation stays within the explicit bound', async () => {
  const module = await importRepo('src/core/atlas-dossier-layout-links-v1.mjs');
  const count = 10_000;
  const rows = Array.from({ length: count }, (_, index) => ({
    rowId: `row-${String(index).padStart(5, '0')}`, sheetId: 'ASSOCIATIONS', sourceId: `source-${index}`,
    sourceDigest: digest(`source-${index}`), label: `Node ${index}`, status: 'CURRENT',
    sceneIds: index % 3 === 0 ? [`scene-${index % 40}`] : [], entityIds: [`entity-${index % 500}`], evidenceIds: [`evidence-${index}`],
  }));
  const currentIdentity = { snapshotId: 'snapshot-large', projectRevisionId: digest('project-large-r1'), generation: 9, sharedRowSetDigest: digest('rows-large') };
  const surfaceProjection = { ...currentIdentity, projectId: 'project-large', projectionDigest: digest('surface-large'), rows };
  const evidenceRecords = rows.map((row, index) => ({ evidenceId: row.evidenceIds[0], kind: 'RECORD', sourceId: `record-${index}`, sourceRevisionDigest: currentIdentity.projectRevisionId, sceneId: '', startOffset: null, endOffset: null, quoteDigest: digest(`quote-${index}`), label: `Evidence ${index}` }));
  const evidenceIdentity = module.createAtlasEvidenceSetIdentity(evidenceRecords, currentIdentity);
  const started = performance.now();
  const projection = module.compileAtlasDossierLayoutLinks({ surfaceProjection, currentIdentity, evidenceIdentity, evidenceRecords });
  const elapsed = performance.now() - started;
  assert.equal(projection.denominator.dossiers, count);
  assert.equal(projection.denominator.evidenceRecords, count);
  assert.ok(elapsed < 20_000, `WP504 large corpus exceeded budget: ${elapsed}ms`);
});

test('WP-504 shipped renderer adapter is keyboard-visible, text-parity complete and mutation-free', () => {
  const editor = fs.readFileSync(path.join(ROOT, 'src/renderer/editor.js'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'src/renderer/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'src/renderer/styles.css'), 'utf8');
  const start = editor.indexOf('function renderAtlasWorkspaceGraph');
  const end = editor.indexOf('\nfunction normalizeManualMapWorkbench', start);
  assert.ok(start > 0 && end > start);
  const adapter = editor.slice(start, end);
  for (const forbidden of [/localStorage/u, /writeFileAtomic/u, /fetch\s*\(/u, /XMLHttpRequest/u, /indexedDB/u]) assert.doesNotMatch(adapter, forbidden);
  assert.match(adapter, /renderAtlasWorkspaceDossier/u);
  assert.match(editor, /ATLAS_DEEP_LINK_KIND\.EVIDENCE/u);
  assert.match(adapter, /data-atlas-lod/u);
  assert.match(adapter, /ArrowLeft/u);
  assert.match(adapter, /ArrowRight/u);
  assert.match(html, /data-atlas-lod-tabs/u);
  assert.match(html, /aria-label="Atlas level of detail"/u);
  assert.match(css, /\.atlas-workspace__dossier/u);
  assert.match(css, /\.atlas-workspace__deep-link:focus-visible/u);
});
