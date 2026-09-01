'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(ROOT, 'src/core/atlas-dossier-layout-links-v1.mjs');
const digest = (value) => `sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;
const clone = (value) => JSON.parse(JSON.stringify(value));
const MUTANTS = Object.freeze([
  { id: 'unknown-input-field-admitted', find: "  exact(input, INPUT_KEYS, 'E_ATLAS_DOSSIER_INPUT_INVALID');", replace: "  if (false) exact(input, INPUT_KEYS, 'E_ATLAS_DOSSIER_INPUT_INVALID');" },
  { id: 'future-evidence-admitted', find: "  if (input.evidenceIdentity.recordCount !== evidence.length || input.evidenceIdentity.recordSetDigest !== digest(evidence)) fail('E_ATLAS_DOSSIER_EVIDENCE_IDENTITY_MISMATCH');", replace: "  if (false) fail('E_ATLAS_DOSSIER_EVIDENCE_IDENTITY_MISMATCH');" },
  { id: 'invalid-evidence-revision-admitted', find: "    sourceRevisionDigest: digestValue(record.sourceRevisionDigest, 'E_ATLAS_DOSSIER_EVIDENCE_REVISION_INVALID'),", replace: "    sourceRevisionDigest: String(record.sourceRevisionDigest)," },
  { id: 'product-mutation-authority-leaked', find: "  const authority = { stateClass: 'DERIVED_STATE', productMutation: false, persistence: false, rendererWiring: false, externalEffects: false, commandAuthority: 'NOT_APPLICABLE_PURE_QUERY' };", replace: "  const authority = { stateClass: 'DERIVED_STATE', productMutation: true, persistence: false, rendererWiring: false, externalEffects: false, commandAuthority: 'NOT_APPLICABLE_PURE_QUERY' };" },
  { id: 'stale-generation-admitted', find: "  for (const key of ['projectRevisionId', 'snapshotId', 'generation', 'sharedRowSetDigest']) if (projection[key] !== currentIdentity[key]) fail('E_ATLAS_DOSSIER_STALE', key);", replace: "  for (const key of ['projectRevisionId', 'snapshotId', 'generation', 'sharedRowSetDigest']) if (false) fail('E_ATLAS_DOSSIER_STALE', key);" },
  { id: 'projection-tamper-admitted', find: "  if (hashCanonicalValue(projection) !== hashCanonicalValue(rebuilt)) fail('E_ATLAS_DOSSIER_PROJECTION_MISMATCH');", replace: "  if (false) fail('E_ATLAS_DOSSIER_PROJECTION_MISMATCH');" },
  { id: 'view-tamper-admitted', find: "  if (hashCanonicalValue(view) !== hashCanonicalValue(rebuilt)) fail('E_ATLAS_DOSSIER_VIEW_MISMATCH');", replace: "  if (false) fail('E_ATLAS_DOSSIER_VIEW_MISMATCH');" },
  { id: 'unknown-link-kind-admitted', find: "  if (!Object.values(ATLAS_DEEP_LINK_KIND).includes(link.kind)) fail('E_ATLAS_DOSSIER_LINK_KIND_INVALID');", replace: "  if (false) fail('E_ATLAS_DOSSIER_LINK_KIND_INVALID');" },
  { id: 'lod-position-drift', find: "  const nodes = dossiers.map((dossier) => freeze({ rowId: dossier.rowId, x: dossier.position.x, y: dossier.position.y, detail, selected: dossier.rowId === selectedRowId, evidenceCount: dossier.evidenceCount }));", replace: "  const nodes = dossiers.map((dossier) => freeze({ rowId: dossier.rowId, x: dossier.position.x + (input.lod === 'EVIDENCE' ? 1 : 0), y: dossier.position.y, detail, selected: dossier.rowId === selectedRowId, evidenceCount: dossier.evidenceCount }));" },
]);

function sample(module) {
  const currentIdentity = { snapshotId: 'snapshot-1', projectRevisionId: digest('revision-1'), generation: 4, sharedRowSetDigest: digest('rows-1') };
  const surfaceProjection = {
    ...currentIdentity,
    projectId: 'project-1', projectionDigest: digest('surface-1'),
    rows: [{ rowId: 'row-1', sheetId: 'ASSOCIATIONS', sourceId: 'association-1', sourceDigest: digest('association-1'), label: 'Анна ↔ Café', status: 'CURRENT', sceneIds: ['scene-1'], entityIds: ['entity-anna', 'entity-cafe'], evidenceIds: ['evidence-1'] }],
  };
  const evidenceRecords = [{ evidenceId: 'evidence-1', kind: 'SCENE_RANGE', sourceId: 'anchor-1', sourceRevisionDigest: digest('scene-1-r1'), sceneId: 'scene-1', startOffset: 2, endOffset: 8, quoteDigest: digest('quote-1'), label: 'Анна' }];
  const evidenceIdentity = module.createAtlasEvidenceSetIdentity(evidenceRecords, currentIdentity);
  return { currentIdentity, surfaceProjection, evidenceRecords, evidenceIdentity };
}

async function loadMutant(source, mutant) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-wp504-mutant-'));
  const core = path.join(dir, 'core');
  fs.mkdirSync(core, { recursive: true });
  for (const name of ['browser-safe-hash.mjs', 'atlas-book-snapshot-v1.mjs', 'atlas-associations-v1.mjs', 'atlas-time-knowledge-v1.mjs', 'atlas-threads-causality-v1.mjs', 'atlas-surface-v1.mjs']) fs.copyFileSync(path.join(ROOT, 'src/core', name), path.join(core, name));
  const target = path.join(core, 'atlas-dossier-layout-links-v1.mjs');
  fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
  return { dir, module: await import(`${pathToFileURL(target).href}?mutant=${encodeURIComponent(mutant.id)}`) };
}

async function oracle(module) {
  const input = sample(module);
  const projection = module.compileAtlasDossierLayoutLinks(input);
  assert.equal(projection.authority.productMutation, false);
  assert.equal(projection.denominator.evidenceRecords, 1);
  assert.throws(() => module.compileAtlasDossierLayoutLinks({ ...input, extra: true }));
  const future = [{ ...input.evidenceRecords[0], sourceRevisionDigest: digest('future') }];
  assert.throws(() => module.compileAtlasDossierLayoutLinks({ ...input, evidenceRecords: future }));
  assert.throws(() => module.createAtlasEvidenceSetIdentity([{ ...input.evidenceRecords[0], sourceRevisionDigest: 'future' }], input.currentIdentity));
  const missing = module.createAtlasEvidenceSetIdentity([], input.currentIdentity);
  assert.throws(() => module.compileAtlasDossierLayoutLinks({ ...input, evidenceIdentity: missing, evidenceRecords: [] }));
  const extraRecords = [...input.evidenceRecords, { ...input.evidenceRecords[0], evidenceId: 'evidence-extra', sourceId: 'anchor-extra' }];
  const extraIdentity = module.createAtlasEvidenceSetIdentity(extraRecords, input.currentIdentity);
  assert.throws(() => module.compileAtlasDossierLayoutLinks({ ...input, evidenceIdentity: extraIdentity, evidenceRecords: extraRecords }));
  assert.throws(() => module.assertAtlasDossierLayoutLinksCurrent(projection, { ...input.currentIdentity, generation: 5 }));
  const projectionTamper = clone(projection); projectionTamper.authority.productMutation = true;
  assert.throws(() => module.verifyAtlasDossierLayoutLinksProjection(projectionTamper, input));
  const visibleRowIds = ['row-1'];
  const overview = module.projectAtlasDossierLayoutView({ projection, currentIdentity: input.currentIdentity, lod: 'OVERVIEW', selectedRowId: 'row-1', visibleRowIds });
  const evidence = module.projectAtlasDossierLayoutView({ projection, currentIdentity: input.currentIdentity, lod: 'EVIDENCE', selectedRowId: 'row-1', visibleRowIds });
  assert.equal(module.assertAtlasDossierMentalMapStable(overview, evidence).status, 'PASS');
  const viewTamper = clone(evidence); viewTamper.nodeCount = 0;
  assert.throws(() => module.verifyAtlasDossierLayoutView(viewTamper, projection, input.currentIdentity));
  const link = clone(projection.dossiers[0].deepLinks[0]); link.kind = 'URL';
  assert.throws(() => module.assertAtlasDeepLinkCurrent(link, { ...input.currentIdentity, projectId: 'project-1' }));
}

test('WP-504 mutants: denominator, freshness, authority, tamper, link and layout mutants are all killed', async () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const original = await import(pathToFileURL(MODULE_PATH).href);
  await oracle(original);
  const results = [];
  for (const mutant of MUTANTS) {
    assert.equal(source.split(mutant.find).length - 1, 1, `mutant anchor must be unique: ${mutant.id}`);
    const loaded = await loadMutant(source, mutant);
    let killed = false;
    try { await oracle(loaded.module); } catch { killed = true; }
    finally { fs.rmSync(loaded.dir, { recursive: true, force: true }); }
    results.push({ id: mutant.id, killed });
  }
  const survived = results.filter((row) => !row.killed).map((row) => row.id);
  console.log(`R24_WP504_MUTATION_RECEIPT=${JSON.stringify({ total: results.length, killed: results.length - survived.length, survived })}`);
  assert.equal(results.length, 9);
  assert.deepEqual(survived, []);
});
