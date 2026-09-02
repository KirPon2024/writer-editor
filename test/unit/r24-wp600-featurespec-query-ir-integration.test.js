'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { fixture, clone, digest, canonicalDigest, specInput, queryInput } = require('../fixtures/r24-wp600-featurespec-query-ir-fixtures.js');

// Independent oracle: raw source records only. It does not use the query
// implementation, normalized projection rows, or production scope helpers.
function expectedIds(records, focus, types, entities, endpoint) {
  const ids = [];
  for (const record of records) {
    const scope = record.scope;
    switch (scope.kind) {
      case 'BOOK': break;
      case 'SCENE': if (focus.kind === 'BOOK' || focus.sceneId !== scope.sceneId) continue; break;
      case 'FRAGMENT':
        if (focus.kind !== 'FRAGMENT' || focus.sceneId !== scope.sceneId || focus.anchorLineageId !== scope.anchorLineageId
          || focus.startOffset < scope.startOffset || focus.endOffset > scope.endOffset) continue;
        break;
      default: throw new Error('ORACLE_UNKNOWN_SCOPE');
    }
    if (!types.includes(record.associationKind)) continue;
    if (entities.length !== 0) {
      const endpoints = record.direction === 'UNDIRECTED' || endpoint === 'EITHER' ? [record.sourceEntityId, record.targetEntityId]
        : endpoint === 'SOURCE' ? [record.sourceEntityId] : [record.targetEntityId];
      if (!endpoints.some((entity) => entities.includes(entity))) continue;
    }
    ids.push(record.associationId);
  }
  return ids.sort();
}

test('WP600 differential oracle covers 288 normal/boundary/adversarial scope and endpoint combinations', async () => {
  const { api, input, raw, book, scene, fragment } = await fixture();
  const focuses = [book, scene, { ...scene, sceneId: 'scene-b', sceneRevision: input.snapshot.sceneRevisionsById['scene-b'] },
    fragment, { ...fragment, startOffset: 9 }, { ...fragment, endOffset: 31 }, { ...fragment, anchorLineageId: 'other' }, { ...fragment, startOffset: 15, endOffset: 16 }];
  const entities = [[], ['source-a'], ['target-b'], ['absent']];
  let count = 0;
  for (const focusScope of focuses) for (const entityIds of entities) for (const endpoint of ['SOURCE', 'TARGET', 'EITHER']) for (const relationTypes of [['foreshadows'], ['echoes'], ['foreshadows','contrasts','echoes']]) {
    const query = api.compileTypedQueryIr(input.spec, { ...queryInput(), entityIds, endpoint, relationTypes });
    const receipt = api.queryFeatureAtlasAssociations({ ...input, focusScope, query });
    const expected = expectedIds(raw, focusScope, relationTypes, entityIds, endpoint);
    assert.deepEqual(receipt.rows.map((row) => row.associationId), expected);
    assert.equal(receipt.status, expected.length === 0 ? 'UNKNOWN' : 'OBSERVED');
    assert.equal(receipt.denominator.matchedAssociations, expected.length);
    count += 1;
  }
  assert.equal(count, 288);
});

test('WP600 replay rejects changed snapshot, wrong typed direction and projection corruption without altering source', async () => {
  const { api, input, raw, associations } = await fixture();
  const before = canonicalDigest(input);
  const result = api.queryFeatureAtlasAssociations(input);
  const tampered = clone(input); tampered.projection.associations[0].evidenceAnchorIds = ['made-up'];
  assert.throws(() => api.queryFeatureAtlasAssociations(tampered));
  const wrongDirection = clone(raw); wrongDirection[0].direction = 'UNDIRECTED';
  const projection = associations.compileAtlasAssociations({ snapshot: input.snapshot, currentSnapshotIdentity: input.currentSnapshotIdentity, associations: wrongDirection });
  assert.throws(() => api.queryFeatureAtlasAssociations({ ...input, projection }), /E_FEATURE_QUERY_TYPED_DIRECTION/);
  assert.throws(() => api.verifyFeatureQueryReceipt(result, { ...input, currentGeneration: 8 }), /E_FEATURE_QUERY_STALE_GENERATION/);
  assert.equal(canonicalDigest(input), before);
  for (const field of ['productMutation','persistence','externalEffects','runtimeRegistry','commandAuthority']) assert.equal(result.authority[field], false);
});

test('WP600 160000-word synthetic revision bridge and 10000 associations stay bounded with deterministic receipts', async (t) => {
  const { api, snapshots, associations } = await fixture();
  const started = performance.now();
  const text = 'synthetic '.repeat(80_000).trim();
  const bridge = { schemaVersion: 'yalken.atlas.productRevisionBridge.v1', revisionScope: 'WHOLE_PROJECT', projectId: 'large-synthetic',
    projectRevisionId: digest('large-project'), manifestRevision: digest('large-manifest'), sceneOrder: ['a','b'],
    scenesById: Object.fromEntries(['a','b'].map((sceneId) => [sceneId, { sceneId, sceneRevision: digest(`large-${sceneId}`), title: sceneId, text }])) };
  assert.equal(Object.values(bridge.scenesById).reduce((sum, scene) => sum + scene.text.split(' ').length, 0), 160_000);
  const snapshot = snapshots.createAtlasBookSnapshotFromRevisionBridge(bridge, { a: [], b: [] });
  const currentSnapshotIdentity = Object.fromEntries(['projectId','projectRevisionId','manifestRevision','orderDigest','dependencyDigest'].map((key) => [key, snapshot[key]]));
  const focusScope = { kind: 'BOOK', projectId: snapshot.projectId, projectRevisionId: snapshot.projectRevisionId };
  const raw = Array.from({ length: 10_000 }, (_, index) => ({ associationId: `a-${String(index).padStart(5,'0')}`, associationKind: 'foreshadows', direction: 'DIRECTED',
    sourceEntityId: `source-${index}`, targetEntityId: `target-${index}`, evidenceAnchorIds: [`anchor-${index}`], scope: focusScope }));
  const projection = associations.compileAtlasAssociations({ snapshot, currentSnapshotIdentity, associations: raw });
  const spec = api.freezeFeatureSpec(specInput());
  const query = api.compileTypedQueryIr(spec, { ...queryInput(), entityIds: Array.from({ length: 128 }, (_, index) => `source-${index}`), relationTypes: ['foreshadows'] });
  const input = { spec, query, snapshot, currentSnapshotIdentity, projection, focusScope, generation: 1, currentGeneration: 1 };
  const receipt = api.queryFeatureAtlasAssociations(input);
  assert.equal(receipt.status, 'OBSERVED'); assert.equal(receipt.rows.length, 128);
  assert.equal(receipt.denominator.totalAssociations, 10_000);
  assert.deepEqual(receipt.rows.map((row) => row.associationId), expectedIds(raw, focusScope, ['foreshadows'], query.entityIds, 'EITHER'));
  assert.deepEqual(api.verifyFeatureQueryReceipt(receipt, input), receipt);
  const wide = api.compileTypedQueryIr(spec, { ...queryInput(), relationTypes: ['foreshadows'] });
  const abstain = api.queryFeatureAtlasAssociations({ ...input, query: wide });
  assert.equal(abstain.status, 'ABSTAIN'); assert.equal(abstain.denominator.matchedAssociations, 10_000); assert.deepEqual(abstain.rows, []);
  t.diagnostic(JSON.stringify({ corpus: 'SYNTHETIC_ONLY', sourceWords: 160_000, associationDenominator: 10_000, emittedDenominator: 128, elapsedMs: Math.round(performance.now() - started), typingPathClaim: false }));
});
