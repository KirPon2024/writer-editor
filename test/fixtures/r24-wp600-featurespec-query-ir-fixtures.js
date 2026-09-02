'use strict';
const crypto = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const ROOT = path.resolve(__dirname, '../..');
const importRepo = (file) => import(pathToFileURL(path.join(ROOT, file)).href);
const clone = (value) => JSON.parse(JSON.stringify(value));
const digest = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
const canonicalDigest = (value) => digest(canonical(value));
function specInput() {
  return { featureId: 'wp600.synthetic-association-query', outcome: 'Read declared scoped associations without product mutation',
    nonGoals: ['NO_RUNTIME_REGISTRY', 'NO_SEMANTIC_TRUTH_INFERENCE'], inputs: ['VERIFIED_ATLAS_ASSOCIATIONS'], outputs: ['DERIVED_QUERY_RECEIPT'],
    invariants: ['EXACT_SNAPSHOT_GENERATION', 'NO_PARTIAL_SUCCESS'], limits: { maxAssociations: 10_000, maxResults: 128, maxEvidenceReferences: 16_384 },
    threatProfile: ['STALE_INPUT', 'TAMPERED_PROJECTION', 'UNBOUNDED_QUERY'], rollback: 'Discard derived receipt and recompute',
    corpus: { corpusId: 'WP600_SYNTHETIC_QUERY_CORPUS_V1', normalCases: 4, boundaryCases: 5, adversarialCases: 12, counterexampleCases: 4, negativeDenominator: 21 },
    relationTypes: ['foreshadows', 'contrasts', 'echoes'] };
}
function queryInput() { return { queryId: 'query-1', relationTypes: ['foreshadows', 'contrasts', 'echoes'], entityIds: [], endpoint: 'EITHER', limit: 128 }; }
async function fixture(apiOverride) {
  const [api, snapshots, associations] = await Promise.all([
    apiOverride || importRepo('src/core/frozen-feature-spec-query-ir-v1.mjs'),
    importRepo('src/core/atlas-book-snapshot-v1.mjs'), importRepo('src/core/atlas-associations-v1.mjs'),
  ]);
  const snapshot = snapshots.createAtlasBookSnapshot({ projectId: 'wp600-project', projectRevisionId: digest('project-7'), manifestRevision: digest('manifest-7'),
    sceneOrder: ['scene-a', 'scene-b'], sceneRevisionsById: { 'scene-a': digest('scene-a-3'), 'scene-b': digest('scene-b-2') }, dependenciesBySceneId: { 'scene-a': [], 'scene-b': [] } });
  const currentSnapshotIdentity = Object.fromEntries(['projectId', 'projectRevisionId', 'manifestRevision', 'orderDigest', 'dependencyDigest'].map((key) => [key, snapshot[key]]));
  const book = { kind: 'BOOK', projectId: snapshot.projectId, projectRevisionId: snapshot.projectRevisionId };
  const scene = { ...book, kind: 'SCENE', sceneId: 'scene-a', sceneRevision: snapshot.sceneRevisionsById['scene-a'] };
  const fragment = { ...scene, kind: 'FRAGMENT', anchorLineageId: 'lineage-1', startOffset: 10, endOffset: 30 };
  const raw = [
    { associationId: 'book-1', associationKind: 'foreshadows', direction: 'DIRECTED', sourceEntityId: 'source-a', targetEntityId: 'target-a', evidenceAnchorIds: ['anchor-1'], scope: book },
    { associationId: 'scene-1', associationKind: 'contrasts', direction: 'UNDIRECTED', sourceEntityId: 'source-a', targetEntityId: 'target-b', evidenceAnchorIds: ['anchor-2'], scope: scene },
    { associationId: 'fragment-1', associationKind: 'echoes', direction: 'DIRECTED', sourceEntityId: 'source-b', targetEntityId: 'target-b', evidenceAnchorIds: ['anchor-3'], scope: fragment },
  ];
  const projection = associations.compileAtlasAssociations({ snapshot, currentSnapshotIdentity, associations: raw });
  const spec = api.freezeFeatureSpec(specInput());
  const query = api.compileTypedQueryIr(spec, queryInput());
  const input = { spec, query, snapshot, currentSnapshotIdentity, projection, focusScope: { ...fragment, startOffset: 12, endOffset: 20 }, generation: 7, currentGeneration: 7 };
  return { api, snapshots, associations, raw, book, scene, fragment, input };
}
module.exports = { ROOT, importRepo, clone, digest, canonicalDigest, specInput, queryInput, fixture };
