'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(ROOT, 'src/core/atlas-threads-causality-v1.mjs');
const digest = (value) => `sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;
const clone = (value) => JSON.parse(JSON.stringify(value));
const MUTANTS = Object.freeze([
  { id: 'thread-proposition-orphan-admitted', find: "  for (const propositionId of threadPropositionIds) if (!propositionIds.has(propositionId)) fail('E_ATLAS_THREADS_CAUSALITY_PROPOSITION_NOT_FOUND', propositionId);", replace: "  for (const propositionId of threadPropositionIds) if (false) fail('E_ATLAS_THREADS_CAUSALITY_PROPOSITION_NOT_FOUND', propositionId);" },
  { id: 'edge-evidence-leak-admitted', find: "    if (cell.propositionId !== sourcePropositionId && cell.propositionId !== targetPropositionId) fail('E_ATLAS_THREADS_CAUSALITY_EDGE_EVIDENCE_LEAK', cellId);", replace: "    if (false) fail('E_ATLAS_THREADS_CAUSALITY_EDGE_EVIDENCE_LEAK', cellId);" },
  { id: 'edge-without-thread-admitted', find: "    fail('E_ATLAS_THREADS_CAUSALITY_EDGE_WITHOUT_THREAD', edgeId);", replace: "    if (false) fail('E_ATLAS_THREADS_CAUSALITY_EDGE_WITHOUT_THREAD', edgeId);" },
  { id: 'self-edge-admitted', find: "  if (sourcePropositionId === targetPropositionId) fail('E_ATLAS_THREADS_CAUSALITY_SELF_EDGE', edgeId);", replace: "  if (false) fail('E_ATLAS_THREADS_CAUSALITY_SELF_EDGE', edgeId);" },
  { id: 'cycle-admitted', find: "  if (visited !== indegree.size) fail('E_ATLAS_THREADS_CAUSALITY_CYCLE');", replace: "  if (false) fail('E_ATLAS_THREADS_CAUSALITY_CYCLE');" },
  { id: 'thread-semantic-duplicate-admitted', find: "  if (new Set(threadSemanticKeys).size !== threadSemanticKeys.length) fail('E_ATLAS_THREADS_CAUSALITY_THREAD_SEMANTIC_DUPLICATE');", replace: "  if (false) fail('E_ATLAS_THREADS_CAUSALITY_THREAD_SEMANTIC_DUPLICATE');" },
  { id: 'edge-semantic-duplicate-admitted', find: "  if (new Set(edgeSemanticKeys).size !== edgeSemanticKeys.length) fail('E_ATLAS_THREADS_CAUSALITY_EDGE_SEMANTIC_DUPLICATE');", replace: "  if (false) fail('E_ATLAS_THREADS_CAUSALITY_EDGE_SEMANTIC_DUPLICATE');" },
  { id: 'product-mutation-authority-leaked', find: "const authority = { stateClass: 'DERIVED_STATE', productMutation: false,", replace: "const authority = { stateClass: 'DERIVED_STATE', productMutation: true," },
  { id: 'open-world-absence-collapsed-to-false', find: "  const relationState = expected.causalEdges.length > 0 ? 'EXPLICIT' : 'UNKNOWN';", replace: "  const relationState = expected.causalEdges.length > 0 ? 'EXPLICIT' : 'FALSE';" },
  { id: 'query-result-tamper-admitted', find: "  if (hashCanonicalValue(result) !== hashCanonicalValue(rebuilt)) fail('E_ATLAS_THREADS_CAUSALITY_QUERY_RESULT_MISMATCH');", replace: "  if (false) fail('E_ATLAS_THREADS_CAUSALITY_QUERY_RESULT_MISMATCH');" },
]);

const identity = (snapshot) => ({ projectId: snapshot.projectId, projectRevisionId: snapshot.projectRevisionId, manifestRevision: snapshot.manifestRevision, orderDigest: snapshot.orderDigest, dependencyDigest: snapshot.dependencyDigest });

function makeTimeInput(snapshot) {
  const base = { projectId: snapshot.projectId, projectRevisionId: snapshot.projectRevisionId };
  const evidenceAnchors = ['1', '2', '3'].map((id, index) => ({ anchorId: `a${id}`, anchorLineageId: `l${id}`, sceneId: 's1', sceneRevision: snapshot.sceneRevisionsById.s1, startOffset: index, endOffset: index + 1 }));
  const cells = evidenceAnchors.map((anchor, index) => ({ cellId: `c${index + 1}`, propositionId: `p${index + 1}`, perspectiveEntityId: `e${index + 1}`, epistemicState: index === 2 ? 'UNKNOWN' : 'KNOWN', modality: index === 2 ? 'POSSIBLE' : 'ASSERTED', evidenceAnchorIds: [anchor.anchorId], tripleTime: { storyTime: { certainty: 'EXACT', ordinal: index }, narrativeTime: { certainty: 'EXACT', ordinal: 0 }, knowledgeTime: { certainty: index === 2 ? 'UNKNOWN' : 'EXACT', ordinal: index === 2 ? null : index } }, scope: { kind: 'BOOK', ...base } }));
  return { evidenceAnchors, cells };
}

async function oracle(module, snapshotModule, timeModule, hashModule) {
  const snapshot = snapshotModule.createAtlasBookSnapshot({ projectId: 'mutant-wp502', projectRevisionId: digest('r1'), manifestRevision: digest('m1'), sceneOrder: ['s1'], sceneRevisionsById: { s1: digest('s1') }, dependenciesBySceneId: { s1: [] } });
  const currentSnapshotIdentity = identity(snapshot);
  const timeKnowledgeProjection = timeModule.compileAtlasTimeKnowledge({ snapshot, currentSnapshotIdentity, ...makeTimeInput(snapshot) });
  const threads = [
    { threadId: 't1', threadKind: 'PROMISE', state: 'OPEN', participantEntityIds: ['e1'], propositionIds: ['p1', 'p2'], evidenceCellIds: ['c1', 'c2'] },
    { threadId: 't2', threadKind: 'PLOT', state: 'UNKNOWN', participantEntityIds: ['e2'], propositionIds: ['p2', 'p3'], evidenceCellIds: ['c2', 'c3'] },
  ];
  const causalEdges = [
    { edgeId: 'edge-1', sourcePropositionId: 'p1', targetPropositionId: 'p2', relation: 'CAUSES', epistemicState: 'ASSERTED', evidenceCellIds: ['c1', 'c2'] },
    { edgeId: 'edge-2', sourcePropositionId: 'p2', targetPropositionId: 'p3', relation: 'ENABLES', epistemicState: 'UNKNOWN', evidenceCellIds: ['c2', 'c3'] },
  ];
  const input = { snapshot, currentSnapshotIdentity, timeKnowledgeProjection, threads, causalEdges };
  const projection = module.compileAtlasThreadsCausality(input);
  assert.equal(projection.authority.productMutation, false);
  assert.equal(module.verifyAtlasThreadsCausalityProjection(projection, snapshot, timeKnowledgeProjection), projection);

  const orphan = clone(threads); orphan[0].propositionIds = ['missing', 'p2']; orphan[0].evidenceCellIds = ['c2'];
  assert.throws(() => module.compileAtlasThreadsCausality({ ...input, threads: orphan, causalEdges: [] }), (error) => error.code === 'E_ATLAS_THREADS_CAUSALITY_PROPOSITION_NOT_FOUND');
  const leak = clone(causalEdges); leak[0].evidenceCellIds = ['c3'];
  assert.throws(() => module.compileAtlasThreadsCausality({ ...input, causalEdges: leak }));
  const withoutThread = [...clone(causalEdges), { edgeId: 'edge-no-thread', sourcePropositionId: 'p1', targetPropositionId: 'p3', relation: 'MOTIVATES', epistemicState: 'POSSIBLE', evidenceCellIds: ['c1', 'c3'] }];
  assert.throws(() => module.compileAtlasThreadsCausality({ ...input, causalEdges: withoutThread }));
  const self = clone(causalEdges); self[0].targetPropositionId = 'p1'; self[0].evidenceCellIds = ['c1'];
  assert.throws(() => module.compileAtlasThreadsCausality({ ...input, causalEdges: self }), (error) => error.code === 'E_ATLAS_THREADS_CAUSALITY_SELF_EDGE');
  const spanning = [{ threadId: 'all', threadKind: 'PLOT', state: 'OPEN', participantEntityIds: ['e1'], propositionIds: ['p1', 'p2', 'p3'], evidenceCellIds: ['c1', 'c2', 'c3'] }];
  const cycle = [...clone(causalEdges), { edgeId: 'edge-3', sourcePropositionId: 'p3', targetPropositionId: 'p1', relation: 'CAUSES', epistemicState: 'POSSIBLE', evidenceCellIds: ['c1', 'c3'] }];
  assert.throws(() => module.compileAtlasThreadsCausality({ ...input, threads: spanning, causalEdges: cycle }));
  const threadDuplicate = [...clone(threads), { ...clone(threads[0]), threadId: 't3' }];
  assert.throws(() => module.compileAtlasThreadsCausality({ ...input, threads: threadDuplicate }));
  const edgeDuplicate = [...clone(causalEdges), { ...clone(causalEdges[0]), edgeId: 'edge-3' }];
  assert.throws(() => module.compileAtlasThreadsCausality({ ...input, causalEdges: edgeDuplicate }));

  const absent = module.queryAtlasThreadsCausality({ snapshot, currentSnapshotIdentity, timeKnowledgeProjection, projection, threadId: '', sourcePropositionId: 'p1', targetPropositionId: 'p3' });
  assert.equal(absent.relationState, 'UNKNOWN');
  const tampered = clone(absent); tampered.relationState = 'FALSE'; tampered.unknownReason = '';
  const { queryDigest, ...queryBody } = tampered; tampered.queryDigest = `sha256:${hashModule.hashCanonicalValue(queryBody)}`;
  assert.throws(() => module.verifyAtlasThreadsCausalityQuery(tampered, projection, snapshot, timeKnowledgeProjection));
}

async function loadMutant(source, mutant) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-wp502-mutant-'));
  const core = path.join(dir, 'core'); fs.mkdirSync(core, { recursive: true });
  for (const name of ['browser-safe-hash.mjs', 'atlas-book-snapshot-v1.mjs', 'atlas-time-knowledge-v1.mjs']) fs.copyFileSync(path.join(ROOT, 'src/core', name), path.join(core, name));
  const target = path.join(core, 'atlas-threads-causality-v1.mjs');
  fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
  return { dir, module: await import(`${pathToFileURL(target).href}?mutant=${encodeURIComponent(mutant.id)}`), snapshotModule: await import(pathToFileURL(path.join(core, 'atlas-book-snapshot-v1.mjs')).href), timeModule: await import(pathToFileURL(path.join(core, 'atlas-time-knowledge-v1.mjs')).href), hashModule: await import(pathToFileURL(path.join(core, 'browser-safe-hash.mjs')).href) };
}

test('WP-502 mutants: reference, evidence, graph, authority and open-world mutants are all killed', async () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const original = await import(pathToFileURL(MODULE_PATH).href);
  const snapshotModule = await import(pathToFileURL(path.join(ROOT, 'src/core/atlas-book-snapshot-v1.mjs')).href);
  const timeModule = await import(pathToFileURL(path.join(ROOT, 'src/core/atlas-time-knowledge-v1.mjs')).href);
  const hashModule = await import(pathToFileURL(path.join(ROOT, 'src/core/browser-safe-hash.mjs')).href);
  await oracle(original, snapshotModule, timeModule, hashModule);
  const results = [];
  for (const mutant of MUTANTS) {
    assert.equal(source.split(mutant.find).length - 1, 1, `mutant anchor must be unique: ${mutant.id}`);
    const loaded = await loadMutant(source, mutant);
    let killed = false;
    try { await oracle(loaded.module, loaded.snapshotModule, loaded.timeModule, loaded.hashModule); } catch { killed = true; }
    finally { fs.rmSync(loaded.dir, { recursive: true, force: true }); }
    results.push({ id: mutant.id, killed });
  }
  const survived = results.filter((row) => !row.killed).map((row) => row.id);
  console.log(`R24_WP502_MUTATION_RECEIPT=${JSON.stringify({ total: results.length, killed: results.length - survived.length, survived })}`);
  assert.equal(results.length, 10);
  assert.deepEqual(survived, []);
});
