'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, clone, digest, canonicalDigest, specInput, queryInput } = require('../fixtures/r24-wp600-featurespec-query-ir-fixtures.js');

test('WP600 freezes complete FeatureSpec and deterministic plan-time catalog without granting authority', async () => {
  const { api, input } = await fixture();
  const { specDigest, ...body } = input.spec;
  assert.equal(specDigest, canonicalDigest(body));
  assert.equal(Object.isFrozen(input.spec.limits), true);
  assert.equal(input.spec.catalogRole, 'PLAN_TIME_ONLY_NOT_RUNTIME_AUTHORITY');
  assert.equal(input.spec.authority.runtimeRegistry, false);
  assert.deepEqual(api.verifyFrozenFeatureSpec(input.spec), input.spec);
  const other = api.freezeFeatureSpec({ ...specInput(), featureId: 'Café-😀' });
  assert.deepEqual(api.compileFeatureSpecCatalog([other, input.spec]), api.compileFeatureSpecCatalog([input.spec, other]));
  assert.equal(api.compileFeatureSpecCatalog([]).featureDenominator, 0);
  assert.throws(() => api.compileFeatureSpecCatalog([input.spec, input.spec]), /E_FEATURE_CATALOG_DUPLICATE/);
  assert.throws(() => api.queryFeatureAtlasAssociations(api.compileFeatureSpecCatalog([input.spec])), /E_FEATURE_QUERY_OBJECT/);
});

test('WP600 bounded Query IR and result bind independent canonical hashes and exact provenance', async () => {
  const { api, input } = await fixture();
  const result = api.queryFeatureAtlasAssociations(input);
  assert.equal(result.status, 'OBSERVED');
  assert.deepEqual(result.rows.map((row) => row.associationId), ['book-1', 'fragment-1', 'scene-1']);
  assert.deepEqual(result.denominator, { totalAssociations: 3, applicableAssociations: 3, typedCandidates: 3, matchedAssociations: 3, emittedAssociations: 3, evidenceReferences: 3, complete: true });
  const { receiptDigest, ...body } = result;
  assert.equal(receiptDigest, canonicalDigest(body));
  assert.equal(result.specDigest, input.spec.specDigest);
  assert.equal(result.queryDigest, input.query.queryDigest);
  assert.equal(result.snapshotId, input.snapshot.snapshotId);
  assert.equal(result.projectionDigest, input.projection.projectionDigest);
  assert.equal(Object.isFrozen(result.rows[0].scope), true);
  assert.deepEqual(api.verifyFeatureQueryReceipt(result, input), result);
  assert.deepEqual(api.queryFeatureAtlasAssociations(clone(input)), result);
});

test('WP600 all 22 declared relation types have deterministic direct-adapter direction laws', async () => {
  const { api, input, associations, book } = await fixture();
  const expected = ['allyOf','causes','contains','contrasts','echoes','enables','fears','follows','foreshadows','knows','locatedAt','mentions','opposes','overlaps','owns','partOf','participatesIn','precedes','prevents','requires','sameAs','wants'];
  assert.deepEqual(api.FEATURE_QUERY_RELATION_TYPES_V1, expected);
  const spec = api.freezeFeatureSpec({ ...specInput(), relationTypes: expected });
  const raw = expected.map((type, index) => ({ associationId: `r-${index}`, associationKind: type, direction: ['allyOf','contrasts','opposes','overlaps','sameAs'].includes(type) ? 'UNDIRECTED' : 'DIRECTED', sourceEntityId: `s-${index}`, targetEntityId: `t-${index}`, evidenceAnchorIds: [`a-${index}`], scope: book }));
  const projection = associations.compileAtlasAssociations({ snapshot: input.snapshot, currentSnapshotIdentity: input.currentSnapshotIdentity, associations: raw });
  for (const type of expected) {
    const query = api.compileTypedQueryIr(spec, { ...queryInput(), relationTypes: [type] });
    const receipt = api.queryFeatureAtlasAssociations({ ...input, spec, query, projection });
    assert.equal(receipt.rows.length, 1);
    assert.equal(receipt.rows[0].associationKind, type);
  }
});

test('WP600 UNKNOWN is not FALSE and every exceeded budget ABSTAINS without partial rows', async () => {
  const { api, input } = await fixture();
  const noMatch = api.compileTypedQueryIr(input.spec, { ...queryInput(), entityIds: ['absent'] });
  assert.equal(api.queryFeatureAtlasAssociations({ ...input, query: noMatch }).status, 'UNKNOWN');
  const unsupported = api.compileTypedQueryIr(input.spec, { ...queryInput(), relationTypes: ['causes'] });
  assert.equal(api.queryFeatureAtlasAssociations({ ...input, query: unsupported }).reason, 'UNSUPPORTED_RELATION');
  for (const [limits, queryLimit, reason] of [
    [{ maxAssociations: 2 }, 128, 'ASSOCIATION_BUDGET'], [{}, 2, 'RESULT_BUDGET'], [{ maxEvidenceReferences: 2 }, 128, 'EVIDENCE_BUDGET'],
  ]) {
    const spec = api.freezeFeatureSpec({ ...specInput(), limits: { ...specInput().limits, ...limits } });
    const query = api.compileTypedQueryIr(spec, { ...queryInput(), limit: queryLimit });
    const result = api.queryFeatureAtlasAssociations({ ...input, spec, query });
    assert.equal(result.status, 'ABSTAIN'); assert.equal(result.reason, reason);
    assert.deepEqual(result.rows, []); assert.equal(result.denominator.complete, false);
    assert.equal(result.denominator.matchedAssociations, 3);
  }
  const exactSpec = api.freezeFeatureSpec({ ...specInput(), limits: { maxAssociations: 3, maxResults: 3, maxEvidenceReferences: 3 } });
  const query = api.compileTypedQueryIr(exactSpec, { ...queryInput(), limit: 3 });
  assert.equal(api.queryFeatureAtlasAssociations({ ...input, spec: exactSpec, query }).status, 'OBSERVED');
});

test('WP600 rejects stale project, revision, snapshot, generation and rehashed semantic tampering', async () => {
  const { api, input } = await fixture();
  for (const key of Object.keys(input.currentSnapshotIdentity)) {
    const bad = clone(input); bad.currentSnapshotIdentity[key] = key === 'projectId' ? 'different' : digest('stale');
    assert.throws(() => api.queryFeatureAtlasAssociations(bad), /E_ATLAS_BOOK_SNAPSHOT_STALE/);
  }
  assert.throws(() => api.queryFeatureAtlasAssociations({ ...input, currentGeneration: 8 }), /E_FEATURE_QUERY_STALE_GENERATION/);
  for (const mutate of [
    (r) => { r.rows.pop(); }, (r) => { r.denominator.emittedAssociations = 0; }, (r) => { r.authority.productMutation = true; },
    (r) => { r.snapshotId = digest('other'); }, (r) => { r.generation = 8; }, (r) => { r.status = 'UNKNOWN'; },
  ]) {
    const receipt = clone(api.queryFeatureAtlasAssociations(input)); mutate(receipt);
    const { receiptDigest, ...body } = receipt; receipt.receiptDigest = canonicalDigest(body);
    assert.throws(() => api.verifyFeatureQueryReceipt(receipt, input), /E_FEATURE_QUERY_RECEIPT_MISMATCH/);
  }
  const spec = clone(input.spec); spec.authority.runtimeRegistry = true;
  const { specDigest, ...body } = spec; spec.specDigest = canonicalDigest(body);
  assert.throws(() => api.verifyFrozenFeatureSpec(spec), /E_FEATURE_SPEC_BINDING/);
  const query = clone(input.query); query.specDigest = digest('other-spec');
  const { queryDigest, ...queryBody } = query; query.queryDigest = canonicalDigest(queryBody);
  assert.throws(() => api.verifyTypedQueryIr(input.spec, query), /E_FEATURE_QUERY_BINDING/);
});

test('WP600 hostile own-data boundary rejects accessors without executing them, symbols and sparse arrays', async () => {
  const { api, input } = await fixture();
  let invoked = 0;
  const accessor = specInput(); Object.defineProperty(accessor, 'outcome', { enumerable: true, get() { invoked += 1; return 'bad'; } });
  assert.throws(() => api.freezeFeatureSpec(accessor));
  const sparse = specInput(); sparse.nonGoals = new Array(2); assert.throws(() => api.freezeFeatureSpec(sparse));
  const arrayAccessor = specInput(); Object.defineProperty(arrayAccessor.nonGoals, '0', { enumerable: true, get() { invoked += 1; return 'bad'; } });
  assert.throws(() => api.freezeFeatureSpec(arrayAccessor));
  const inherited = specInput();
  const arrayPrototype = Object.create(Array.prototype);
  arrayPrototype.map = function (callback) { invoked += 1; return Array.prototype.map.call(this, callback); };
  Object.setPrototypeOf(inherited.nonGoals, arrayPrototype);
  assert.throws(() => api.freezeFeatureSpec(inherited), /E_FEATURE_QUERY_ARRAY/);
  const catalog = [input.spec]; Object.setPrototypeOf(catalog, arrayPrototype);
  assert.throws(() => api.compileFeatureSpecCatalog(catalog), /E_FEATURE_QUERY_ARRAY/);
  const symbol = specInput(); symbol[Symbol('hidden')] = true; assert.throws(() => api.freezeFeatureSpec(symbol));
  const receipt = clone(api.queryFeatureAtlasAssociations(input)); Object.defineProperty(receipt.rows[0], 'direction', { enumerable: true, get() { invoked += 1; return 'DIRECTED'; } });
  assert.throws(() => api.verifyFeatureQueryReceipt(receipt, input));
  assert.equal(invoked, 0);
  const overflow = { ...input, projection: { associations: new Array(10_001) } };
  assert.throws(() => api.queryFeatureAtlasAssociations(overflow), /E_FEATURE_QUERY_HARD_ASSOCIATION_LIMIT/);
});

test('WP600 spec/query bounds, canonical Unicode and complete corpus denominator fail closed', async () => {
  const { api, input } = await fixture();
  for (const mutate of [
    (s) => { s.extra = true; }, (s) => { s.featureId = 'Cafe\u0301'; }, (s) => { s.featureId = '\ud800'; },
    (s) => { s.corpus.negativeDenominator = 20; }, (s) => { s.corpus.normalCases = 0; },
    (s) => { s.limits.maxAssociations = 10_001; }, (s) => { s.limits.maxResults = 0; }, (s) => { s.limits.maxEvidenceReferences = Infinity; },
    (s) => { s.relationTypes = ['unknown']; }, (s) => { s.relationTypes = ['echoes', 'echoes']; }, (s) => { s.outcome = ''; }, (s) => { s.rollback = ' x '; },
  ]) { const candidate = specInput(); mutate(candidate); assert.throws(() => api.freezeFeatureSpec(candidate)); }
  for (const query of [
    { ...queryInput(), limit: 129 }, { ...queryInput(), limit: NaN }, { ...queryInput(), endpoint: 'MUTATE' },
    { ...queryInput(), entityIds: Array.from({ length: 129 }, (_, i) => `e-${i}`) }, { ...queryInput(), relationTypes: [] },
  ]) assert.throws(() => api.compileTypedQueryIr(input.spec, query));
  assert.throws(() => api.compileFeatureSpecCatalog(Array.from({ length: 129 }, () => input.spec)));
});
