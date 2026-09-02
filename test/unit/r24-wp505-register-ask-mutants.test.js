'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(ROOT, 'src/core/atlas-register-ask-v1.mjs');
const importRepo = (relative) => import(pathToFileURL(path.join(ROOT, relative)).href);
const clone = (value) => structuredClone(value);
const MUTANTS = Object.freeze([
  { id: 'unknown-input-field-admitted', find: "  exact(input, COMPILE_INPUT_KEYS, 'E_ATLAS_REGISTER_INPUT_INVALID');", replace: "  if (false) exact(input, COMPILE_INPUT_KEYS, 'E_ATLAS_REGISTER_INPUT_INVALID');" },
  { id: 'future-authored-revision-admitted', find: "  if (sourceRevisionDigest !== currentIdentity.projectRevisionId) fail('E_ATLAS_REGISTER_AUTHORED_REVISION_STALE');", replace: "  if (false) fail('E_ATLAS_REGISTER_AUTHORED_REVISION_STALE');" },
  { id: 'unknown-authored-evidence-admitted', find: "  for (const entry of authored) if (entry.evidenceIds.some((evidenceId) => !knownEvidenceIds.has(evidenceId))) fail('E_ATLAS_REGISTER_AUTHORED_EVIDENCE_UNKNOWN', entry.entryId);", replace: "  if (false) fail('E_ATLAS_REGISTER_AUTHORED_EVIDENCE_UNKNOWN');" },
  { id: 'product-mutation-authority-leaked', find: "  if (denominator.total !== denominator.authored + denominator.computed || denominator.computed !== denominator.dossierSources) fail('E_ATLAS_REGISTER_DENOMINATOR_MISMATCH');\n  const authority = freeze({ stateClass: 'DERIVED_STATE', productMutation: false, persistence: false, rendererWiring: false, externalEffects: false, network: false, externalAi: false, commandAuthority: 'NOT_APPLICABLE_PURE_QUERY' });", replace: "  if (denominator.total !== denominator.authored + denominator.computed || denominator.computed !== denominator.dossierSources) fail('E_ATLAS_REGISTER_DENOMINATOR_MISMATCH');\n  const authority = freeze({ stateClass: 'DERIVED_STATE', productMutation: true, persistence: false, rendererWiring: false, externalEffects: false, network: false, externalAi: false, commandAuthority: 'NOT_APPLICABLE_PURE_QUERY' });" },
  { id: 'stale-register-admitted', find: "  for (const key of CURRENT_IDENTITY_KEYS) if (projection[key] !== currentIdentity[key]) fail('E_ATLAS_REGISTER_STALE', key);", replace: "  for (const key of CURRENT_IDENTITY_KEYS) if (false) fail('E_ATLAS_REGISTER_STALE', key);" },
  { id: 'unknown-query-field-admitted', find: "    if (!Object.prototype.hasOwnProperty.call(allowed, field) || !allowed[field].includes(operator)) fail('E_ATLAS_ASK_FIELD_OPERATOR_INVALID', `${field}:${operator}`);", replace: "    if (false) fail('E_ATLAS_ASK_FIELD_OPERATOR_INVALID');" },
  { id: 'query-limit-unbounded', find: "  const limit = integer(query.limit, 'E_ATLAS_ASK_LIMIT_INVALID', 1, ATLAS_ASK_MAX_RESULTS);", replace: "  const limit = integer(query.limit, 'E_ATLAS_ASK_LIMIT_INVALID', 1, 1000000);" },
  { id: 'projection-tamper-admitted', find: "  if (hashCanonicalValue(projection) !== hashCanonicalValue(rebuilt)) fail('E_ATLAS_REGISTER_PROJECTION_MISMATCH');", replace: "  if (false) fail('E_ATLAS_REGISTER_PROJECTION_MISMATCH');" },
  { id: 'result-tamper-admitted', find: "  if (hashCanonicalValue(result) !== hashCanonicalValue(rebuilt)) fail('E_ATLAS_ASK_RESULT_MISMATCH');", replace: "  if (false) fail('E_ATLAS_ASK_RESULT_MISMATCH');" },
]);

async function sample(module) {
  const hash = await importRepo('src/core/browser-safe-hash.mjs');
  const currentIdentity = { snapshotId: 'snapshot-1', projectRevisionId: `sha256:${'1'.repeat(64)}`, generation: 4, sharedRowSetDigest: `sha256:${'2'.repeat(64)}` };
  const dossier = {
    dossierId: 'dossier:row-1', rowId: 'row-1', sheetId: 'ASSOCIATIONS', sourceId: 'source-1', sourceDigest: `sha256:${'3'.repeat(64)}`,
    label: 'Анна ↔ Café', status: 'CURRENT', sceneIds: ['scene-1'], entityIds: ['entity-anna'], evidence: [{ evidenceId: 'evidence-1' }],
  };
  const normalized = {
    schemaVersion: 'yalken.r24.atlasDossierLayoutLinks.v1', stageId: 'WP-504_DOSSIER_LAYOUT_LINKS', profileId: 'ATLAS_PRODUCT_V33', projectId: 'project-1',
    ...currentIdentity, surfaceProjectionDigest: `sha256:${'4'.repeat(64)}`, evidenceRecordSetDigest: `sha256:${'5'.repeat(64)}`,
    dossiers: [dossier], positions: [], denominator: { rows: 1 }, authority: {}, featureManifestDigest: `sha256:${'6'.repeat(64)}`,
  };
  const dossierProjection = { ...normalized, projectionDigest: `sha256:${hash.hashCanonicalValue(normalized)}` };
  const authoredEntries = [{ entryId: 'authored:1', kind: 'NOTE', label: 'Анна', body: 'Café', sourceId: 'note-1', sourceRevisionDigest: currentIdentity.projectRevisionId, evidenceIds: ['evidence-1'], tags: ['canon'] }];
  const authoredIdentity = module.createAtlasAuthoredRegisterIdentity(authoredEntries, currentIdentity);
  const input = { currentIdentity, dossierProjection, authoredEntries, authoredIdentity };
  const registerProjection = module.compileAtlasRegister(input);
  const query = { clauses: [], limit: 16, orderBy: { field: 'ENTRY_ID', direction: 'ASC' } };
  return { currentIdentity, dossierProjection, authoredEntries, authoredIdentity, input, registerProjection, query };
}

async function loadMutant(source, mutant) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-wp505-mutant-'));
  const core = path.join(dir, 'core');
  fs.cpSync(path.join(ROOT, 'src/core'), core, { recursive: true });
  const target = path.join(core, 'atlas-register-ask-v1.mjs');
  fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
  return { dir, module: await import(`${pathToFileURL(target).href}?mutant=${encodeURIComponent(mutant.id)}`) };
}

async function oracle(module) {
  const f = await sample(module);
  assert.equal(f.registerProjection.authority.productMutation, false);
  assert.equal(f.registerProjection.denominator.computed, 1);
  assert.throws(() => module.compileAtlasRegister({ ...f.input, extra: true }));
  const future = [{ ...f.authoredEntries[0], sourceRevisionDigest: `sha256:${'f'.repeat(64)}` }];
  assert.throws(() => module.createAtlasAuthoredRegisterIdentity(future, f.currentIdentity));
  const missing = [{ ...f.authoredEntries[0], evidenceIds: ['evidence-future'] }];
  const missingIdentity = module.createAtlasAuthoredRegisterIdentity(missing, f.currentIdentity);
  assert.throws(() => module.compileAtlasRegister({ ...f.input, authoredEntries: missing, authoredIdentity: missingIdentity }));
  assert.throws(() => module.assertAtlasRegisterCurrent(f.registerProjection, { ...f.currentIdentity, generation: 5 }));
  assert.throws(
    () => module.askAtlas({ currentIdentity: f.currentIdentity, registerProjection: f.registerProjection, query: { clauses: [{ field: 'PATH', operator: 'EXEC', value: 'x' }], limit: 1, orderBy: { field: 'ENTRY_ID', direction: 'ASC' } } }),
    (error) => error.code === 'E_ATLAS_ASK_FIELD_OPERATOR_INVALID',
  );
  assert.throws(() => module.askAtlas({ currentIdentity: f.currentIdentity, registerProjection: f.registerProjection, query: { ...f.query, limit: 129 } }));
  const projectionTamper = clone(f.registerProjection); projectionTamper.authority.productMutation = true;
  assert.throws(() => module.verifyAtlasRegisterProjection(projectionTamper, f.input));
  const askInput = { currentIdentity: f.currentIdentity, registerProjection: f.registerProjection, query: f.query };
  const resultTamper = clone(module.askAtlas(askInput)); resultTamper.returned = 0;
  assert.throws(() => module.verifyAtlasAskResult(resultTamper, askInput));
}

test('WP-505 mutants: authority, denominator, freshness, query and tamper mutants are all killed', async () => {
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
  console.log(`R24_WP505_MUTATION_RECEIPT=${JSON.stringify({ total: results.length, killed: results.length - survived.length, survived })}`);
  assert.equal(results.length, 9);
  assert.deepEqual(survived, []);
});
