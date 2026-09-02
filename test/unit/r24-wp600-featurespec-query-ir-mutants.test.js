'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ROOT, fixture, clone, specInput, queryInput } = require('../fixtures/r24-wp600-featurespec-query-ir-fixtures.js');
const SOURCE = path.join(ROOT, 'src/core/frozen-feature-spec-query-ir-v1.mjs');
const source = fs.readFileSync(SOURCE, 'utf8');
const reject = (action) => assert.throws(action);
const mutations = [
  ['stale-generation', "if (input.generation !== input.currentGeneration) fail('E_FEATURE_QUERY_STALE_GENERATION');", '', async (api, f) => reject(() => api.queryFeatureAtlasAssociations({ ...f.input, currentGeneration: 8 }))],
  ['spec-binding', "if (digest(spec) !== digest(expected)) fail('E_FEATURE_SPEC_BINDING');", '', async (api, f) => { const spec = clone(f.input.spec); spec.authority.runtimeRegistry = true; reject(() => api.verifyFrozenFeatureSpec(spec)); }],
  ['query-binding', "if (digest(query) !== digest(expected)) fail('E_FEATURE_QUERY_BINDING');", '', async (api, f) => { const query = clone(f.input.query); query.featureId = 'other'; reject(() => api.verifyTypedQueryIr(f.input.spec, query)); }],
  ['receipt-replay', "if (digest(receipt) !== digest(expected)) fail('E_FEATURE_QUERY_RECEIPT_MISMATCH');", '', async (api, f) => { const receipt = clone(api.queryFeatureAtlasAssociations(f.input)); receipt.rows = []; reject(() => api.verifyFeatureQueryReceipt(receipt, f.input)); }],
  ['association-budget', 'rowsDescriptor.value.length > spec.limits.maxAssociations', 'false', async (api, f) => { const spec = api.freezeFeatureSpec({ ...specInput(), limits: { ...specInput().limits, maxAssociations: 2 } }); const query = api.compileTypedQueryIr(spec, queryInput()); assert.equal(api.queryFeatureAtlasAssociations({ ...f.input, spec, query }).reason, 'ASSOCIATION_BUDGET'); }],
  ['result-budget', 'matches.length > query.limit', 'false', async (api, f) => { const query = api.compileTypedQueryIr(f.input.spec, { ...queryInput(), limit: 2 }); assert.equal(api.queryFeatureAtlasAssociations({ ...f.input, query }).reason, 'RESULT_BUDGET'); }],
  ['evidence-budget', 'evidenceReferences > spec.limits.maxEvidenceReferences', 'false', async (api, f) => { const spec = api.freezeFeatureSpec({ ...specInput(), limits: { ...specInput().limits, maxEvidenceReferences: 2 } }); const query = api.compileTypedQueryIr(spec, queryInput()); assert.equal(api.queryFeatureAtlasAssociations({ ...f.input, spec, query }).reason, 'EVIDENCE_BUDGET'); }],
  ['unsupported-relation', 'query.relationTypes.some((type) => !spec.relationTypes.includes(type))', 'false', async (api, f) => { const query = api.compileTypedQueryIr(f.input.spec, { ...queryInput(), relationTypes: ['causes'] }); assert.equal(api.queryFeatureAtlasAssociations({ ...f.input, query }).reason, 'UNSUPPORTED_RELATION'); }],
  ['typed-direction', "if (row.direction !== expectedDirection) fail('E_FEATURE_QUERY_TYPED_DIRECTION');", '', async (api, f) => { const raw = clone(f.raw); raw[0].direction = 'UNDIRECTED'; const projection = f.associations.compileAtlasAssociations({ snapshot: f.input.snapshot, currentSnapshotIdentity: f.input.currentSnapshotIdentity, associations: raw }); reject(() => api.queryFeatureAtlasAssociations({ ...f.input, projection })); }],
  ['unknown-relation', "if (result.some((type) => !FEATURE_QUERY_RELATION_TYPES_V1.includes(type))) fail('E_FEATURE_QUERY_RELATION');", '', async (api) => reject(() => api.freezeFeatureSpec({ ...specInput(), relationTypes: ['execute-command'] }))],
  ['corpus-denominator', "if (corpus.negativeDenominator !== corpus.boundaryCases + corpus.adversarialCases + corpus.counterexampleCases) fail('E_FEATURE_SPEC_NEGATIVE_DENOMINATOR');", '', async (api) => { const spec = specInput(); spec.corpus.negativeDenominator += 1; reject(() => api.freezeFeatureSpec(spec)); }],
  ['accessor-boundary', "if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail(code);", '', async (api) => { const spec = specInput(); Object.defineProperty(spec, 'outcome', { enumerable: true, get: () => 'Getter must not run' }); reject(() => api.freezeFeatureSpec(spec)); }],
  ['type-filter', 'query.relationTypes.includes(row.associationKind)', 'true', async (api, f) => { const query = api.compileTypedQueryIr(f.input.spec, { ...queryInput(), relationTypes: ['foreshadows'] }); assert.deepEqual(api.queryFeatureAtlasAssociations({ ...f.input, query }).rows.map((row) => row.associationId), ['book-1']); }],
  ['endpoint-direction', "return query.endpoint === 'SOURCE' ? source : target;", "return query.endpoint === 'SOURCE' ? target : source;", async (api, f) => { const query = api.compileTypedQueryIr(f.input.spec, { ...queryInput(), relationTypes: ['foreshadows'], endpoint: 'SOURCE', entityIds: ['source-a'] }); assert.equal(api.queryFeatureAtlasAssociations({ ...f.input, query }).rows.length, 1); }],
  ['no-partial-success', 'const rows = reason === null ? matches : [];', 'const rows = matches;', async (api, f) => { const query = api.compileTypedQueryIr(f.input.spec, { ...queryInput(), limit: 2 }); assert.deepEqual(api.queryFeatureAtlasAssociations({ ...f.input, query }).rows, []); }],
  ['unknown-not-observed', "rows.length === 0 ? 'UNKNOWN' : 'OBSERVED'", "'OBSERVED'", async (api, f) => { const query = api.compileTypedQueryIr(f.input.spec, { ...queryInput(), entityIds: ['absent'] }); assert.equal(api.queryFeatureAtlasAssociations({ ...f.input, query }).status, 'UNKNOWN'); }],
];

test('WP600 real implementation mutation replay kills all 16 executable guard/semantic mutants', async (t) => {
  const original = await fixture();
  let killed = 0;
  for (const [id, before, after, oracle] of mutations) {
    await oracle(original.api, original);
    assert.equal(source.split(before).length - 1, 1, `${id}: exact mutation anchor`);
    const mutant = source.replace(before, after).replace(/from '(\.\/[^']+)'/g, (_, relative) => `from '${pathToFileURL(path.resolve(path.dirname(SOURCE), relative)).href}'`);
    const api = await import(`data:text/javascript;base64,${Buffer.from(mutant).toString('base64')}#${id}`);
    const f = await fixture(api);
    await assert.rejects(() => oracle(api, f), { name: 'AssertionError' }, `${id}: mutant must be killed by its behavioral oracle`);
    killed += 1;
  }
  assert.equal(killed, 16);
  assert.equal(fs.readFileSync(SOURCE, 'utf8'), source);
  t.diagnostic(JSON.stringify({ implementationMutants: 16, killed, survivors: 0, productionSourceMutations: 0 }));
});
