'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { fixture, clone, digest } = require('./r24-wp503-atlas-surface.test.js');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(ROOT, 'src/core/atlas-surface-v1.mjs');
const MUTANTS = Object.freeze([
  { id: 'unknown-input-field-admitted', find: "  assertExactDataObject(input, INPUT_KEYS, 'E_ATLAS_SURFACE_INPUT_INVALID');", replace: "  if (false) assertExactDataObject(input, INPUT_KEYS, 'E_ATLAS_SURFACE_INPUT_INVALID');" },
  { id: 'invalid-generation-admitted', find: "function assertGeneration(value) { if (!Number.isSafeInteger(value) || value < 0) fail('E_ATLAS_SURFACE_GENERATION_INVALID'); return value; }", replace: "function assertGeneration(value) { if (false) fail('E_ATLAS_SURFACE_GENERATION_INVALID'); return value; }" },
  { id: 'association-predecessor-tamper-admitted', find: '  const associations = verifyAtlasAssociationsProjection(input.associationsProjection, snapshot);', replace: '  const associations = input.associationsProjection;' },
  { id: 'graph-list-table-denominator-reduced', find: '  return Object.values(ATLAS_SURFACE_VIEW).map((view) => freezeDeep({ view, rowCount: rowIds.length, rowIds: [...rowIds], rowSetDigest: sharedRowSetDigest }));', replace: '  return [ATLAS_SURFACE_VIEW.GRAPH].map((view) => freezeDeep({ view, rowCount: rowIds.length, rowIds: [...rowIds], rowSetDigest: sharedRowSetDigest }));' },
  { id: 'product-mutation-authority-leaked', find: "  const authority = { stateClass: 'DERIVED_STATE', productMutation: false, persistence: false, rendererWiring: false, externalEffects: false, commandAuthority: 'NOT_APPLICABLE_PURE_QUERY' };", replace: "  const authority = { stateClass: 'DERIVED_STATE', productMutation: true, persistence: false, rendererWiring: false, externalEffects: false, commandAuthority: 'NOT_APPLICABLE_PURE_QUERY' };" },
  { id: 'stale-generation-admitted', find: "    if (projection[key] !== currentIdentity[key]) fail('E_ATLAS_SURFACE_STALE', key);", replace: "    if (false) fail('E_ATLAS_SURFACE_STALE', key);" },
  { id: 'view-row-set-drift-admitted', find: "  if (!view || view.rowSetDigest !== projection.sharedRowSetDigest) fail('E_ATLAS_SURFACE_VIEW_PARITY');", replace: "  if (!view) fail('E_ATLAS_SURFACE_VIEW_PARITY');" },
  { id: 'projection-recomputed-tamper-admitted', find: "  if (hashCanonicalValue(projection) !== hashCanonicalValue(rebuilt)) fail('E_ATLAS_SURFACE_PROJECTION_MISMATCH');", replace: "  if (false) fail('E_ATLAS_SURFACE_PROJECTION_MISMATCH');" },
  { id: 'view-result-tamper-admitted', find: "  if (hashCanonicalValue(result) !== hashCanonicalValue(rebuilt)) fail('E_ATLAS_SURFACE_VIEW_RESULT_MISMATCH');", replace: "  if (false) fail('E_ATLAS_SURFACE_VIEW_RESULT_MISMATCH');" },
]);

async function loadMutant(source, mutant) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-wp503-mutant-'));
  const core = path.join(dir, 'core');
  fs.mkdirSync(core, { recursive: true });
  for (const name of [
    'browser-safe-hash.mjs', 'atlas-book-snapshot-v1.mjs', 'atlas-associations-v1.mjs',
    'atlas-time-knowledge-v1.mjs', 'atlas-threads-causality-v1.mjs',
  ]) fs.copyFileSync(path.join(ROOT, 'src/core', name), path.join(core, name));
  const target = path.join(core, 'atlas-surface-v1.mjs');
  fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
  const modules = await Promise.all([
    import(`${pathToFileURL(target).href}?mutant=${encodeURIComponent(mutant.id)}`),
    import(pathToFileURL(path.join(core, 'atlas-book-snapshot-v1.mjs')).href),
    import(pathToFileURL(path.join(core, 'atlas-associations-v1.mjs')).href),
    import(pathToFileURL(path.join(core, 'atlas-time-knowledge-v1.mjs')).href),
    import(pathToFileURL(path.join(core, 'atlas-threads-causality-v1.mjs')).href),
  ]);
  return { dir, modules };
}

async function oracle(modules) {
  const f = await fixture(modules);
  const module = f.surfaceModule;
  const projection = module.compileAtlasSurface(f.input);
  assert.equal(projection.views.length, 3);
  assert.equal(projection.authority.productMutation, false);
  assert.throws(() => module.compileAtlasSurface({ ...f.input, extra: true }));
  assert.throws(() => module.compileAtlasSurface({ ...f.input, generation: -1 }));
  const predecessorTamper = clone(f.associationsProjection);
  predecessorTamper.scopeDenominator.total = 99;
  assert.throws(() => module.compileAtlasSurface({ ...f.input, associationsProjection: predecessorTamper }));
  const currentIdentity = { snapshotId: projection.snapshotId, projectRevisionId: projection.projectRevisionId, generation: projection.generation, sharedRowSetDigest: projection.sharedRowSetDigest };
  assert.throws(() => module.assertAtlasSurfaceCurrent(projection, { ...currentIdentity, generation: projection.generation + 1 }));
  const viewDrift = clone(projection);
  viewDrift.views[0].rowSetDigest = digest('drift');
  assert.throws(() => module.projectAtlasSurfaceView({ projection: viewDrift, currentIdentity, posture: 'FULL', view: 'GRAPH' }));
  const projectionTamper = clone(projection);
  projectionTamper.authority.productMutation = true;
  assert.throws(() => module.verifyAtlasSurfaceProjection(projectionTamper, f.snapshot, f.associationsProjection, f.timeKnowledgeProjection, f.threadsCausalityProjection));
  const view = clone(module.projectAtlasSurfaceView({ projection, currentIdentity, posture: 'FULL', view: 'TABLE' }));
  view.rowCount = 0;
  assert.throws(() => module.verifyAtlasSurfaceView(view, projection, currentIdentity));
}

test('WP-503 mutants: identity, predecessor, parity, authority and tamper mutants are all killed', async () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const originalModules = await Promise.all([
    import(pathToFileURL(MODULE_PATH).href),
    import(pathToFileURL(path.join(ROOT, 'src/core/atlas-book-snapshot-v1.mjs')).href),
    import(pathToFileURL(path.join(ROOT, 'src/core/atlas-associations-v1.mjs')).href),
    import(pathToFileURL(path.join(ROOT, 'src/core/atlas-time-knowledge-v1.mjs')).href),
    import(pathToFileURL(path.join(ROOT, 'src/core/atlas-threads-causality-v1.mjs')).href),
  ]);
  await oracle(originalModules);
  const results = [];
  for (const mutant of MUTANTS) {
    assert.equal(source.split(mutant.find).length - 1, 1, `mutant anchor must be unique: ${mutant.id}`);
    const loaded = await loadMutant(source, mutant);
    let killed = false;
    try { await oracle(loaded.modules); } catch { killed = true; }
    finally { fs.rmSync(loaded.dir, { recursive: true, force: true }); }
    results.push({ id: mutant.id, killed });
  }
  const survived = results.filter((row) => !row.killed).map((row) => row.id);
  console.log(`R24_WP503_MUTATION_RECEIPT=${JSON.stringify({ total: results.length, killed: results.length - survived.length, survived })}`);
  assert.equal(results.length, 9);
  assert.deepEqual(survived, []);
});

