'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(ROOT, 'src/core/atlas-associations-v1.mjs');
const digest = (value) => `sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;
const clone = (value) => JSON.parse(JSON.stringify(value));
const MUTANTS = Object.freeze([
  { id: 'book-inheritance-dropped', find: "  if (associationScope.kind === ATLAS_ASSOCIATION_SCOPE_KIND.BOOK) return true;", replace: "  if (associationScope.kind === ATLAS_ASSOCIATION_SCOPE_KIND.BOOK) return false;" },
  { id: 'cross-scene-leak-admitted', find: '  if (associationScope.sceneId !== focusScope.sceneId) return false;', replace: '  if (false) return false;' },
  { id: 'fragment-anchor-identity-ignored', find: '  return associationScope.anchorLineageId === focusScope.anchorLineageId', replace: '  return true' },
  { id: 'semantic-duplicate-admitted', find: "  if (new Set(associations.map(semanticAssociationKey)).size !== associations.length) {\n    fail('E_ATLAS_ASSOCIATION_SEMANTIC_DUPLICATE');\n  }", replace: "  if (false) {\n    fail('E_ATLAS_ASSOCIATION_SEMANTIC_DUPLICATE');\n  }" },
  { id: 'projection-digest-tamper-admitted', find: "    fail('E_ATLAS_ASSOCIATIONS_PROJECTION_DIGEST_MISMATCH');", replace: "    if (false) fail('E_ATLAS_ASSOCIATIONS_PROJECTION_DIGEST_MISMATCH');" },
  { id: 'projection-index-tamper-admitted', find: "  ) fail('E_ATLAS_ASSOCIATIONS_INDEX_MISMATCH');", replace: "  ) { /* mutant admits inconsistent index */ }" },
  { id: 'product-mutation-authority-leaked', find: '    productMutation: false,', replace: '    productMutation: true,' },
  { id: 'query-tamper-admitted', find: "    fail('E_ATLAS_ASSOCIATION_QUERY_RESULT_MISMATCH');", replace: "    if (false) fail('E_ATLAS_ASSOCIATION_QUERY_RESULT_MISMATCH');" },
]);

async function input(module, snapshotModule) {
  const snapshot = snapshotModule.createAtlasBookSnapshot({
    projectId: 'mutant-book', projectRevisionId: digest('project-r1'), manifestRevision: digest('manifest-r1'),
    sceneOrder: ['s1', 's2'], sceneRevisionsById: { s1: digest('s1'), s2: digest('s2') }, dependenciesBySceneId: { s1: [], s2: [] },
  });
  const currentSnapshotIdentity = { projectId: snapshot.projectId, projectRevisionId: snapshot.projectRevisionId, manifestRevision: snapshot.manifestRevision, orderDigest: snapshot.orderDigest, dependencyDigest: snapshot.dependencyDigest };
  const base = { projectId: snapshot.projectId, projectRevisionId: snapshot.projectRevisionId };
  const associations = [
    { associationId: 'book', associationKind: 'book-kind', direction: 'DIRECTED', sourceEntityId: 'a', targetEntityId: 'b', evidenceAnchorIds: ['eb'], scope: { kind: 'BOOK', ...base } },
    { associationId: 'scene', associationKind: 'scene-kind', direction: 'DIRECTED', sourceEntityId: 'c', targetEntityId: 'd', evidenceAnchorIds: ['es'], scope: { kind: 'SCENE', ...base, sceneId: 's1', sceneRevision: snapshot.sceneRevisionsById.s1 } },
    { associationId: 'fragment', associationKind: 'fragment-kind', direction: 'DIRECTED', sourceEntityId: 'e', targetEntityId: 'f', evidenceAnchorIds: ['ef'], scope: { kind: 'FRAGMENT', ...base, sceneId: 's1', sceneRevision: snapshot.sceneRevisionsById.s1, anchorLineageId: 'lineage', startOffset: 2, endOffset: 20 } },
  ];
  return { module, snapshot, currentSnapshotIdentity, base, associations };
}

async function oracle(module, snapshotModule, hashModule) {
  const value = await input(module, snapshotModule);
  const { snapshot, currentSnapshotIdentity, base, associations } = value;
  const projection = module.compileAtlasAssociations({ snapshot, currentSnapshotIdentity, associations });
  assert.equal(projection.authority.productMutation, false);
  assert.equal(module.verifyAtlasAssociationsProjection(projection, snapshot), projection);
  const wrongOuterDigest = clone(projection); wrongOuterDigest.projectionDigest = `sha256:${'0'.repeat(64)}`;
  assert.throws(() => module.verifyAtlasAssociationsProjection(wrongOuterDigest, snapshot));
  const scene1 = module.queryAtlasAssociations({ snapshot, currentSnapshotIdentity, projection, focusScope: { kind: 'SCENE', ...base, sceneId: 's1', sceneRevision: snapshot.sceneRevisionsById.s1 } });
  assert.deepEqual(scene1.applicableAssociations.map((row) => row.associationId), ['book', 'scene']);
  const scene2 = module.queryAtlasAssociations({ snapshot, currentSnapshotIdentity, projection, focusScope: { kind: 'SCENE', ...base, sceneId: 's2', sceneRevision: snapshot.sceneRevisionsById.s2 } });
  assert.deepEqual(scene2.applicableAssociations.map((row) => row.associationId), ['book']);
  const wrongAnchor = module.queryAtlasAssociations({ snapshot, currentSnapshotIdentity, projection, focusScope: { kind: 'FRAGMENT', ...base, sceneId: 's1', sceneRevision: snapshot.sceneRevisionsById.s1, anchorLineageId: 'other', startOffset: 4, endOffset: 8 } });
  assert.deepEqual(wrongAnchor.applicableAssociations.map((row) => row.associationId), ['book', 'scene']);
  assert.throws(() => module.compileAtlasAssociations({ snapshot, currentSnapshotIdentity, associations: [...associations, { ...clone(associations[0]), associationId: 'book-copy' }] }));
  const tamperedProjection = clone(projection); tamperedProjection.bookAssociationIds = [];
  assert.throws(() => module.verifyAtlasAssociationsProjection(tamperedProjection, snapshot));
  const tamperedIndex = clone(projection); tamperedIndex.bookAssociationIds = [];
  const { projectionDigest, ...projectionIdentity } = tamperedIndex;
  tamperedIndex.projectionDigest = `sha256:${hashModule.hashCanonicalValue(projectionIdentity)}`;
  assert.throws(() => module.verifyAtlasAssociationsProjection(tamperedIndex, snapshot));
  const tamperedQuery = clone(scene1); tamperedQuery.applicableAssociations = []; tamperedQuery.applicableAssociationCount = 0;
  const { queryDigest, ...queryIdentity } = tamperedQuery;
  tamperedQuery.queryDigest = `sha256:${hashModule.hashCanonicalValue(queryIdentity)}`;
  assert.throws(() => module.verifyAtlasAssociationQuery(tamperedQuery, projection, snapshot));
}

async function loadMutant(source, mutant) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-wp500-mutant-'));
  const core = path.join(dir, 'core'); fs.mkdirSync(core, { recursive: true });
  for (const name of ['browser-safe-hash.mjs', 'atlas-book-snapshot-v1.mjs']) fs.copyFileSync(path.join(ROOT, 'src/core', name), path.join(core, name));
  const target = path.join(core, 'atlas-associations-v1.mjs');
  fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
  const module = await import(`${pathToFileURL(target).href}?mutant=${encodeURIComponent(mutant.id)}`);
  return {
    dir,
    module,
    snapshotModule: await import(pathToFileURL(path.join(core, 'atlas-book-snapshot-v1.mjs')).href),
    hashModule: await import(pathToFileURL(path.join(core, 'browser-safe-hash.mjs')).href),
  };
}

test('WP-500 mutants: scope, duplication, digest, index, query and authority mutants are all killed', async () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const original = await import(pathToFileURL(MODULE_PATH).href);
  const snapshotModule = await import(pathToFileURL(path.join(ROOT, 'src/core/atlas-book-snapshot-v1.mjs')).href);
  const hashModule = await import(pathToFileURL(path.join(ROOT, 'src/core/browser-safe-hash.mjs')).href);
  await oracle(original, snapshotModule, hashModule);
  const results = [];
  for (const mutant of MUTANTS) {
    assert.equal(source.split(mutant.find).length - 1, 1, `mutant anchor must be unique: ${mutant.id}`);
    const loaded = await loadMutant(source, mutant);
    let killed = false;
    try { await oracle(loaded.module, loaded.snapshotModule, loaded.hashModule); } catch { killed = true; }
    finally { fs.rmSync(loaded.dir, { recursive: true, force: true }); }
    results.push({ id: mutant.id, killed });
  }
  const survived = results.filter((row) => !row.killed).map((row) => row.id);
  console.log(`R24_WP500_MUTATION_RECEIPT=${JSON.stringify({ total: results.length, killed: results.length - survived.length, survived })}`);
  assert.equal(results.length, 8);
  assert.deepEqual(survived, []);
});
