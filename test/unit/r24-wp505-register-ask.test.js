'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { fixture: wp504Fixture } = require('./r24-wp504-dossier-layout-links.test.js');

const ROOT = path.resolve(__dirname, '..', '..');
const importRepo = (relative) => import(pathToFileURL(path.join(ROOT, relative)).href);

async function fixture() {
  const base = await wp504Fixture();
  const module = await importRepo('src/core/atlas-register-ask-v1.mjs');
  const dossierProjection = base.module.compileAtlasDossierLayoutLinks({
    surfaceProjection: base.surfaceProjection,
    currentIdentity: base.currentIdentity,
    evidenceIdentity: base.evidenceIdentity,
    evidenceRecords: base.evidenceRecords,
  });
  const evidenceIds = dossierProjection.dossiers.flatMap((dossier) => dossier.evidence.map((record) => record.evidenceId)).sort();
  const authoredEntries = [
    {
      entryId: 'authored:decision-1', kind: 'DECISION', label: 'Café — решение', body: 'Анна остаётся в 東京.',
      sourceId: 'author-note-1', sourceRevisionDigest: base.currentIdentity.projectRevisionId,
      evidenceIds: [evidenceIds[0]], tags: ['canon', 'review'],
    },
    {
      entryId: 'authored:question-1', kind: 'QUESTION', label: 'Почему Анна вернулась?', body: 'Проверить точное свидетельство.',
      sourceId: 'author-question-1', sourceRevisionDigest: base.currentIdentity.projectRevisionId,
      evidenceIds: [evidenceIds.at(-1)], tags: ['open'],
    },
  ];
  const authoredIdentity = module.createAtlasAuthoredRegisterIdentity(authoredEntries, base.currentIdentity);
  const input = { currentIdentity: base.currentIdentity, dossierProjection, authoredEntries, authoredIdentity };
  const registerProjection = module.compileAtlasRegister(input);
  return { ...base, module, dossierProjection, authoredEntries, authoredIdentity, input, registerProjection, evidenceIds };
}

function query(overrides = {}) {
  return {
    clauses: [], limit: 16, orderBy: { field: 'ENTRY_ID', direction: 'ASC' }, ...overrides,
  };
}

test('WP-505 compiles distinct authored and computed register entries with a complete denominator', async () => {
  const f = await fixture();
  assert.equal(f.module.verifyAtlasRegisterProjection(f.registerProjection, f.input), f.registerProjection);
  assert.equal(f.module.verifyAtlasRegisterProjectionDigest(f.registerProjection), f.registerProjection);
  assert.equal(f.registerProjection.denominator.authored, 2);
  assert.equal(f.registerProjection.denominator.computed, f.dossierProjection.dossiers.length);
  assert.equal(f.registerProjection.denominator.dossierSources, f.dossierProjection.dossiers.length);
  assert.equal(f.registerProjection.denominator.total, f.registerProjection.entries.length);
  assert.equal(f.registerProjection.entries.filter((entry) => entry.origin === 'AUTHORED').every((entry) => entry.computedFromDossierId === ''), true);
  assert.equal(f.registerProjection.entries.filter((entry) => entry.origin === 'COMPUTED').every((entry) => entry.computedFromDossierId.startsWith('dossier:')), true);
  assert.equal(f.registerProjection.authority.productMutation, false);
  assert.equal(f.registerProjection.authority.persistence, false);
  assert.equal(f.registerProjection.authority.network, false);
  assert.equal(f.registerProjection.authority.externalAi, false);
  assert.equal(Object.isFrozen(f.registerProjection.entries[0]), true);
});

test('WP-505 evaluates closed bounded Query IR and binds results to exact evidence and register identity', async () => {
  const f = await fixture();
  const askInput = {
    currentIdentity: f.currentIdentity,
    registerProjection: f.registerProjection,
    query: query({ clauses: [{ field: 'ORIGIN', operator: 'EQ', value: 'AUTHORED' }] }),
  };
  const result = f.module.askAtlas(askInput);
  assert.equal(f.module.verifyAtlasAskResult(result, askInput), result);
  assert.equal(f.module.verifyAtlasAskResultDigest(result), result);
  assert.equal(result.totalMatched, 2);
  assert.equal(result.returned, 2);
  assert.equal(result.truncated, false);
  assert.equal(result.entries.every((entry) => entry.origin === 'AUTHORED'), true);
  assert.equal(result.entries.every((entry) => entry.evidenceIds.length === 1), true);
  assert.equal(result.registerProjectionDigest, f.registerProjection.projectionDigest);
  assert.match(result.queryDigest, /^sha256:[0-9a-f]{64}$/u);
});

test('WP-505 preserves legitimate Unicode while rejecting stale, future, missing and duplicate authored records', async () => {
  const f = await fixture();
  assert.ok(f.registerProjection.entries.find((entry) => entry.label === 'Café — решение' && entry.body === 'Анна остаётся в 東京.'));
  assert.throws(() => f.module.compileAtlasRegister({ ...f.input, currentIdentity: { ...f.currentIdentity, generation: f.currentIdentity.generation + 1 } }), (error) => error.code === 'E_ATLAS_DOSSIER_STALE');
  const future = f.authoredEntries.map((entry, index) => index ? entry : { ...entry, sourceRevisionDigest: `sha256:${'f'.repeat(64)}` });
  assert.throws(() => f.module.createAtlasAuthoredRegisterIdentity(future, f.currentIdentity), (error) => error.code === 'E_ATLAS_REGISTER_AUTHORED_REVISION_STALE');
  const missingEvidence = f.authoredEntries.map((entry, index) => index ? entry : { ...entry, evidenceIds: ['evidence:future'] });
  const missingIdentity = f.module.createAtlasAuthoredRegisterIdentity(missingEvidence, f.currentIdentity);
  assert.throws(() => f.module.compileAtlasRegister({ ...f.input, authoredEntries: missingEvidence, authoredIdentity: missingIdentity }), (error) => error.code === 'E_ATLAS_REGISTER_AUTHORED_EVIDENCE_UNKNOWN');
  const duplicate = [...f.authoredEntries, f.authoredEntries[0]];
  assert.throws(() => f.module.createAtlasAuthoredRegisterIdentity(duplicate, f.currentIdentity), (error) => error.code === 'E_ATLAS_REGISTER_AUTHORED_ID_DUPLICATE');
  assert.throws(() => f.module.createAtlasAuthoredRegisterIdentity([{ ...f.authoredEntries[0], entryId: 'computed:forged' }], f.currentIdentity), (error) => error.code === 'E_ATLAS_REGISTER_AUTHORED_RESERVED_ID');
});

test('WP-505 fails closed on unknown, noncanonical, duplicate and oversized Query IR', async () => {
  const f = await fixture();
  const ask = (candidate) => f.module.askAtlas({ currentIdentity: f.currentIdentity, registerProjection: f.registerProjection, query: candidate });
  assert.throws(() => ask(query({ clauses: [{ field: 'PATH', operator: 'EQ', value: '/tmp' }] })), (error) => error.code === 'E_ATLAS_ASK_FIELD_OPERATOR_INVALID');
  assert.throws(() => ask(query({ clauses: [{ field: 'LABEL', operator: 'CONTAINS', value: 'Анна' }] })), (error) => error.code === 'E_ATLAS_ASK_FIELD_OPERATOR_INVALID');
  assert.throws(() => ask(query({ limit: 129 })), (error) => error.code === 'E_ATLAS_ASK_LIMIT_INVALID');
  const clause = { field: 'ORIGIN', operator: 'EQ', value: 'AUTHORED' };
  assert.throws(() => ask(query({ clauses: [clause, clause] })), (error) => error.code === 'E_ATLAS_ASK_CLAUSE_DUPLICATE');
  assert.throws(() => ask(query({ clauses: [{ field: 'TAG', operator: 'CONTAINS', value: 'review' }, clause] })), (error) => error.code === 'E_ATLAS_ASK_CLAUSE_ORDER');
  assert.throws(() => ask(query({ orderBy: { field: 'PATH', direction: 'ASC' } })), (error) => error.code === 'E_ATLAS_ASK_ORDER_FIELD_INVALID');
});

test('WP-505 rejects accessors, symbols, sparse arrays and tampered projections without invoking accessors', async () => {
  const f = await fixture();
  let invoked = false;
  const hostile = { ...f.input };
  Object.defineProperty(hostile, 'trap', { enumerable: true, get() { invoked = true; return true; } });
  assert.throws(() => f.module.compileAtlasRegister(hostile), (error) => error.code === 'E_ATLAS_REGISTER_INPUT_INVALID');
  assert.equal(invoked, false);
  const symbolic = { ...f.input }; symbolic[Symbol('authority')] = true;
  assert.throws(() => f.module.compileAtlasRegister(symbolic), (error) => error.code === 'E_ATLAS_REGISTER_INPUT_INVALID');
  const sparse = [...f.authoredEntries]; delete sparse[0];
  assert.throws(() => f.module.createAtlasAuthoredRegisterIdentity(sparse, f.currentIdentity), (error) => error.code === 'E_ATLAS_REGISTER_AUTHORED_ARRAY_INVALID');
  const tampered = structuredClone(f.registerProjection); tampered.authority.productMutation = true;
  assert.throws(() => f.module.verifyAtlasRegisterProjection(tampered, f.input), (error) => error.code === 'E_ATLAS_REGISTER_PROJECTION_MISMATCH');
  const askInput = { currentIdentity: f.currentIdentity, registerProjection: f.registerProjection, query: query() };
  const result = structuredClone(f.module.askAtlas(askInput)); result.totalMatched = 0;
  assert.throws(() => f.module.verifyAtlasAskResult(result, askInput), (error) => error.code === 'E_ATLAS_ASK_RESULT_MISMATCH');
});

module.exports = { fixture, query };
