'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(ROOT, 'src/core/atlas-projector-kernel-v1.mjs');
const digest = (value) => `sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;
const clone = (value) => JSON.parse(JSON.stringify(value));

const MUTANTS = Object.freeze([
  {
    id: 'generation-removed-from-job-identity',
    find: "    generation,\n    projectId: snapshot.projectId,",
    replace: "    generation: 1,\n    projectId: snapshot.projectId,",
  },
  {
    id: 'older-job-replaces-latest',
    find: '    if (!current || job.generation > current.generation) latestByKey.set(key, job);',
    replace: '    if (!current || job.generation < current.generation) latestByKey.set(key, job);',
  },
  {
    id: 'queue-bound-disabled',
    find: '  const queue = coalesced.slice(-maxQueueSize);',
    replace: '  const queue = coalesced;',
  },
  {
    id: 'output-digest-no-longer-checked',
    find: "  if (identity.outputDigest !== expectedOutputDigest) fail('E_ATLAS_PROJECTOR_OUTPUT_DIGEST_MISMATCH');",
    replace: "  if (false) fail('E_ATLAS_PROJECTOR_OUTPUT_DIGEST_MISMATCH');",
  },
  {
    id: 'result-job-identity-not-checked',
    find: "    if (result[key] !== activeJob[key]) resultMismatches.push(key);",
    replace: "    if (key !== 'jobId' && result[key] !== activeJob[key]) resultMismatches.push(key);",
  },
  {
    id: 'generation-stale-accepted',
    find: "  if (currentGeneration !== activeJob.generation) return rejection('GENERATION_STALE', ['generation']);",
    replace: "  if (false) return rejection('GENERATION_STALE', ['generation']);",
  },
  {
    id: 'snapshot-stale-accepted',
    find: "  if (snapshotMismatches.length > 0) return rejection('SNAPSHOT_STALE', snapshotMismatches);",
    replace: "  if (false) return rejection('SNAPSHOT_STALE', snapshotMismatches);",
  },
  {
    id: 'publication-envelope-replaced-by-output',
    find: '      current = next;',
    replace: '      current = next.output;',
  },
]);

function snapshotInput(revision = 1) {
  return {
    projectId: 'wp402-mutant-project',
    projectRevisionId: digest(`project-${revision}`),
    manifestRevision: digest(`manifest-${revision}`),
    sceneOrder: ['scene-b', 'scene-a'],
    sceneRevisionsById: {
      'scene-a': digest(`scene-a-${revision}`),
      'scene-b': digest(`scene-b-${revision}`),
    },
    dependenciesBySceneId: {
      'scene-a': [digest('dep-a')],
      'scene-b': [digest('dep-b')],
    },
  };
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function independentDigest(value) {
  return `sha256:${crypto.createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`;
}

async function assertWp402Oracle(module, snapshotModule) {
  const snapshot = snapshotModule.createAtlasBookSnapshot(snapshotInput());
  const generationOne = module.createAtlasProjectorJob({
    snapshot,
    projectorId: 'atlas.graph',
    generation: 1,
  });
  const generationTwo = module.createAtlasProjectorJob({
    snapshot,
    projectorId: 'atlas.graph',
    generation: 2,
  });
  assert.notEqual(generationOne.jobId, generationTwo.jobId);
  const queue = module.coalesceAtlasProjectorJobs([
    generationTwo,
    generationOne,
    module.createAtlasProjectorJob({ snapshot, projectorId: 'atlas.timeline', generation: 3 }),
  ], { maxQueueSize: 1 });
  assert.equal(queue.jobs.length, 1);
  assert.equal(queue.jobs[0].projectorId, 'atlas.timeline');
  assert.equal(queue.discardedCount, 2);
  const graphOnlyQueue = module.coalesceAtlasProjectorJobs([
    generationTwo,
    generationOne,
  ], { maxQueueSize: 1 });
  assert.equal(graphOnlyQueue.jobs[0].generation, 2);

  const result = module.runAtlasProjectorJob(generationTwo, () => ({ edges: ['a->b'] }));
  assert.deepEqual(module.verifyAtlasProjectorResult(result), result);
  const tampered = clone(result);
  tampered.output.edges.push('forged');
  assert.throws(() => module.verifyAtlasProjectorResult(tampered));

  const otherJob = module.createAtlasProjectorJob({
    snapshot,
    projectorId: 'atlas.other',
    generation: 2,
  });
  assert.equal(module.assessAtlasProjectorResultForPublication({
    activeJob: otherJob,
    result,
    currentSnapshot: snapshot,
    currentGeneration: 2,
  }).ok, false);
  const forgedJobResult = clone(result);
  forgedJobResult.jobId = digest('different-job-only');
  forgedJobResult.outputDigest = independentDigest({
    schemaVersion: module.ATLAS_PROJECTOR_OUTPUT_SCHEMA_VERSION,
    jobId: forgedJobResult.jobId,
    output: forgedJobResult.output,
  });
  forgedJobResult.resultId = independentDigest({
    schemaVersion: module.ATLAS_PROJECTOR_RESULT_SCHEMA_VERSION,
    jobId: forgedJobResult.jobId,
    projectorId: forgedJobResult.projectorId,
    generation: forgedJobResult.generation,
    projectId: forgedJobResult.projectId,
    projectRevisionId: forgedJobResult.projectRevisionId,
    snapshotId: forgedJobResult.snapshotId,
    orderDigest: forgedJobResult.orderDigest,
    dependencyDigest: forgedJobResult.dependencyDigest,
    outputDigest: forgedJobResult.outputDigest,
  });
  assert.equal(module.assessAtlasProjectorResultForPublication({
    activeJob: generationTwo,
    result: forgedJobResult,
    currentSnapshot: snapshot,
    currentGeneration: 2,
  }).ok, false);
  assert.equal(module.assessAtlasProjectorResultForPublication({
    activeJob: generationTwo,
    result,
    currentSnapshot: snapshot,
    currentGeneration: 3,
  }).reason, 'GENERATION_STALE');
  const newerSnapshot = snapshotModule.createAtlasBookSnapshot(snapshotInput(2));
  assert.equal(module.assessAtlasProjectorResultForPublication({
    activeJob: generationTwo,
    result,
    currentSnapshot: newerSnapshot,
    currentGeneration: 2,
  }).reason, 'SNAPSHOT_STALE');

  const cell = module.createAtlasProjectorPublicationCell();
  assert.equal(cell.publish({
    activeJob: generationTwo,
    result,
    currentSnapshot: snapshot,
    currentGeneration: 2,
  }).published, true);
  assert.equal(cell.read().schemaVersion, module.ATLAS_PROJECTOR_PUBLICATION_SCHEMA_VERSION);
  assert.equal(cell.read().resultId, result.resultId);
  assert.equal(Object.isFrozen(cell.read()), true);
  assert.equal(Object.isFrozen(cell.read().output), true);
}

async function loadMutant(source, mutant) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-wp402-mutant-'));
  const coreDir = path.join(dir, 'core');
  fs.mkdirSync(coreDir, { recursive: true });
  for (const basename of ['browser-safe-hash.mjs', 'atlas-book-snapshot-v1.mjs']) {
    fs.copyFileSync(path.join(ROOT, 'src/core', basename), path.join(coreDir, basename));
  }
  const target = path.join(coreDir, 'atlas-projector-kernel-v1.mjs');
  fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
  const [module, snapshotModule] = await Promise.all([
    import(`${pathToFileURL(target).href}?mutant=${encodeURIComponent(mutant.id)}`),
    import(`${pathToFileURL(path.join(coreDir, 'atlas-book-snapshot-v1.mjs')).href}?mutant=${encodeURIComponent(mutant.id)}`),
  ]);
  return { dir, module, snapshotModule };
}

test('WP-402 implementation mutants: every scheduling, identity, stale and atomic-publication mutant is killed', async () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const module = await import(pathToFileURL(MODULE_PATH).href);
  const snapshotModule = await import(pathToFileURL(path.join(ROOT, 'src/core/atlas-book-snapshot-v1.mjs')).href);
  await assertWp402Oracle(module, snapshotModule);
  const results = [];
  for (const mutant of MUTANTS) {
    const occurrences = source.split(mutant.find).length - 1;
    assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
    const loaded = await loadMutant(source, mutant);
    let killed = false;
    let detail = 'survived';
    try {
      await assertWp402Oracle(loaded.module, loaded.snapshotModule);
    } catch (error) {
      killed = true;
      detail = error.code || error.message;
    } finally {
      fs.rmSync(loaded.dir, { recursive: true, force: true });
    }
    results.push({ id: mutant.id, killed, detail });
  }
  const survived = results.filter((result) => !result.killed);
  console.log(`R24_WP402_MUTATION_RECEIPT=${JSON.stringify({
    total: results.length,
    killed: results.length - survived.length,
    survived: survived.map((result) => result.id),
    score: results.length ? (results.length - survived.length) / results.length : 0,
  })}`);
  assert.equal(results.length, MUTANTS.length);
  assert.deepEqual(survived, []);
});
