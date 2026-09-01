'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(ROOT, 'src/core/atlas-time-knowledge-v1.mjs');
const digest = (value) => `sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;
const clone = (value) => JSON.parse(JSON.stringify(value));
const MUTANTS = Object.freeze([
  { id: 'narrative-scene-order-mismatch-admitted', find: "    fail('E_ATLAS_NARRATIVE_TIME_SCENE_ORDER_MISMATCH');", replace: "    if (false) fail('E_ATLAS_NARRATIVE_TIME_SCENE_ORDER_MISMATCH');" },
  { id: 'unknown-ordinal-admitted', find: "    if (value.ordinal !== null) fail('E_ATLAS_TIME_UNKNOWN_ORDINAL', axis);", replace: "    if (false) fail('E_ATLAS_TIME_UNKNOWN_ORDINAL', axis);" },
  { id: 'multi-scene-evidence-admitted', find: "    fail('E_ATLAS_TIME_KNOWLEDGE_MULTI_SCENE_CELL');", replace: "    if (false) fail('E_ATLAS_TIME_KNOWLEDGE_MULTI_SCENE_CELL');" },
  { id: 'scope-leak-admitted', find: "  if (evidence.some((anchor) => !evidenceFitsScope(anchor, scope))) fail('E_ATLAS_TIME_KNOWLEDGE_SCOPE_LEAK');", replace: "  if (false) fail('E_ATLAS_TIME_KNOWLEDGE_SCOPE_LEAK');" },
  { id: 'unused-evidence-admitted', find: "  if (usedEvidence.size !== evidenceAnchors.length) fail('E_ATLAS_TIME_KNOWLEDGE_UNUSED_EVIDENCE');", replace: "  if (false) fail('E_ATLAS_TIME_KNOWLEDGE_UNUSED_EVIDENCE');" },
  { id: 'semantic-duplicate-admitted', find: "  if (new Set(semanticKeys).size !== semanticKeys.length) fail('E_ATLAS_TIME_KNOWLEDGE_SEMANTIC_DUPLICATE');", replace: "  if (false) fail('E_ATLAS_TIME_KNOWLEDGE_SEMANTIC_DUPLICATE');" },
  { id: 'product-mutation-authority-leaked', find: "    productMutation: false,", replace: "    productMutation: true," },
  { id: 'projection-rebuild-mismatch-admitted', find: "    fail('E_ATLAS_TIME_KNOWLEDGE_PROJECTION_MISMATCH');", replace: "    if (false) fail('E_ATLAS_TIME_KNOWLEDGE_PROJECTION_MISMATCH');" },
  { id: 'query-result-tamper-admitted', find: "    fail('E_ATLAS_TIME_KNOWLEDGE_QUERY_RESULT_MISMATCH');", replace: "    if (false) fail('E_ATLAS_TIME_KNOWLEDGE_QUERY_RESULT_MISMATCH');" },
]);

function identity(snapshot) {
  return {
    projectId: snapshot.projectId, projectRevisionId: snapshot.projectRevisionId,
    manifestRevision: snapshot.manifestRevision, orderDigest: snapshot.orderDigest,
    dependencyDigest: snapshot.dependencyDigest,
  };
}

function makeInput(snapshot) {
  const base = { projectId: snapshot.projectId, projectRevisionId: snapshot.projectRevisionId };
  const evidenceAnchors = [
    { anchorId: 'a1', anchorLineageId: 'lineage-1', sceneId: 's1', sceneRevision: snapshot.sceneRevisionsById.s1, startOffset: 1, endOffset: 5 },
    { anchorId: 'a2', anchorLineageId: 'lineage-2', sceneId: 's2', sceneRevision: snapshot.sceneRevisionsById.s2, startOffset: 2, endOffset: 7 },
  ];
  const cells = [
    {
      cellId: 'c1', propositionId: 'p1', perspectiveEntityId: 'e1', epistemicState: 'KNOWN', modality: 'ASSERTED',
      evidenceAnchorIds: ['a1'], tripleTime: {
        storyTime: { certainty: 'EXACT', ordinal: 5 }, narrativeTime: { certainty: 'EXACT', ordinal: 0 },
        knowledgeTime: { certainty: 'EXACT', ordinal: 1 },
      },
      scope: { kind: 'FRAGMENT', ...base, sceneId: 's1', sceneRevision: snapshot.sceneRevisionsById.s1, anchorLineageId: 'lineage-1', startOffset: 0, endOffset: 8 },
    },
    {
      cellId: 'c2', propositionId: 'p2', perspectiveEntityId: 'e2', epistemicState: 'UNKNOWN', modality: 'POSSIBLE',
      evidenceAnchorIds: ['a2'], tripleTime: {
        storyTime: { certainty: 'UNKNOWN', ordinal: null }, narrativeTime: { certainty: 'EXACT', ordinal: 1 },
        knowledgeTime: { certainty: 'UNKNOWN', ordinal: null },
      }, scope: { kind: 'BOOK', ...base },
    },
  ];
  return { snapshot, currentSnapshotIdentity: identity(snapshot), evidenceAnchors, cells };
}

async function oracle(module, snapshotModule, hashModule) {
  const snapshot = snapshotModule.createAtlasBookSnapshot({
    projectId: 'mutant-book', projectRevisionId: digest('r1'), manifestRevision: digest('m1'),
    sceneOrder: ['s1', 's2'], sceneRevisionsById: { s1: digest('s1'), s2: digest('s2') }, dependenciesBySceneId: { s1: [], s2: [] },
  });
  const input = makeInput(snapshot);
  const projection = module.compileAtlasTimeKnowledge(input);
  assert.equal(projection.authority.productMutation, false);
  assert.equal(module.verifyAtlasTimeKnowledgeProjection(projection, snapshot), projection);

  const narrative = clone(input); narrative.cells[0].tripleTime.narrativeTime.ordinal = 1;
  assert.throws(() => module.compileAtlasTimeKnowledge(narrative));
  const unknown = clone(input); unknown.cells[1].tripleTime.knowledgeTime.ordinal = 3;
  assert.throws(() => module.compileAtlasTimeKnowledge(unknown));
  const multiScene = clone(input); multiScene.cells[0].evidenceAnchorIds = ['a1', 'a2']; multiScene.cells[0].scope = { kind: 'BOOK', projectId: snapshot.projectId, projectRevisionId: snapshot.projectRevisionId }; multiScene.cells[1].evidenceAnchorIds = ['a2'];
  assert.throws(() => module.compileAtlasTimeKnowledge(multiScene));
  const scopeLeak = clone(input); scopeLeak.cells[0].scope.startOffset = 3;
  assert.throws(() => module.compileAtlasTimeKnowledge(scopeLeak));
  const unused = clone(input); unused.evidenceAnchors.push({ ...clone(unused.evidenceAnchors[0]), anchorId: 'a3' });
  assert.throws(() => module.compileAtlasTimeKnowledge(unused));
  const duplicate = clone(input); duplicate.cells.push({ ...clone(duplicate.cells[0]), cellId: 'c3' });
  assert.throws(() => module.compileAtlasTimeKnowledge(duplicate));

  const wrongDigest = clone(projection); wrongDigest.projectionDigest = `sha256:${'0'.repeat(64)}`;
  assert.throws(() => module.verifyAtlasTimeKnowledgeProjection(wrongDigest, snapshot));
  const reorderedEvidence = clone(projection);
  reorderedEvidence.evidenceAnchors.reverse();
  const { projectionDigest: ignoredProjectionDigest, ...reorderedIdentity } = reorderedEvidence;
  reorderedEvidence.projectionDigest = `sha256:${hashModule.hashCanonicalValue(reorderedIdentity)}`;
  assert.throws(() => module.verifyAtlasTimeKnowledgeProjection(reorderedEvidence, snapshot));
  const query = module.queryAtlasTimeKnowledge({
    snapshot: input.snapshot,
    currentSnapshotIdentity: input.currentSnapshotIdentity,
    projection,
    propositionId: 'p1',
    perspectiveEntityId: '',
  });
  const tamperedQuery = clone(query); tamperedQuery.applicableCells = []; tamperedQuery.applicableCellCount = 0;
  const { queryDigest, ...queryIdentity } = tamperedQuery;
  tamperedQuery.queryDigest = `sha256:${hashModule.hashCanonicalValue(queryIdentity)}`;
  assert.throws(() => module.verifyAtlasTimeKnowledgeQuery(tamperedQuery, projection, snapshot));
}

async function loadMutant(source, mutant) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-wp501-mutant-'));
  const core = path.join(dir, 'core'); fs.mkdirSync(core, { recursive: true });
  for (const name of ['browser-safe-hash.mjs', 'atlas-book-snapshot-v1.mjs']) {
    fs.copyFileSync(path.join(ROOT, 'src/core', name), path.join(core, name));
  }
  const target = path.join(core, 'atlas-time-knowledge-v1.mjs');
  fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
  return {
    dir,
    module: await import(`${pathToFileURL(target).href}?mutant=${encodeURIComponent(mutant.id)}`),
    snapshotModule: await import(pathToFileURL(path.join(core, 'atlas-book-snapshot-v1.mjs')).href),
    hashModule: await import(pathToFileURL(path.join(core, 'browser-safe-hash.mjs')).href),
  };
}

test('WP-501 mutants: time, evidence, scope, duplication, authority, digest and query mutants are all killed', async () => {
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
  console.log(`R24_WP501_MUTATION_RECEIPT=${JSON.stringify({ total: results.length, killed: results.length - survived.length, survived })}`);
  assert.equal(results.length, 9);
  assert.deepEqual(survived, []);
});
