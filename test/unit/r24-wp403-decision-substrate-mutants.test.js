'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(ROOT, 'src/core/atlas-decision-substrate-v1.mjs');
const digest = (value) => `sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;
const clone = (value) => JSON.parse(JSON.stringify(value));

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

const MUTANTS = Object.freeze([
  {
    id: 'older-candidate-replaces-latest',
    find: '    if (!current || candidate.generation > current.generation) latestByKey.set(key, candidate);',
    replace: '    if (!current || candidate.generation < current.generation) latestByKey.set(key, candidate);',
  },
  {
    id: 'candidate-queue-bound-disabled',
    find: '  const candidates = coalesced.slice(-maxQueueSize);',
    replace: '  const candidates = coalesced;',
  },
  {
    id: 'candidate-digest-tamper-check-disabled',
    find: "  if (candidate.candidateId !== digestCanonical(candidateIdentity(normalized))) fail('E_ATLAS_DECISION_CANDIDATE_DIGEST_MISMATCH');",
    replace: "  if (false) fail('E_ATLAS_DECISION_CANDIDATE_DIGEST_MISMATCH');",
  },
  {
    id: 'queue-digest-tamper-check-disabled',
    find: "  if (hashCanonicalValue(queue) !== hashCanonicalValue(rebuilt)) fail('E_ATLAS_DECISION_QUEUE_DIGEST_MISMATCH');",
    replace: "  if (false) fail('E_ATLAS_DECISION_QUEUE_DIGEST_MISMATCH');",
  },
  {
    id: 'evidence-delta-hidden',
    find: '      hasDelta: added.length + removed.length + changed.length > 0,',
    replace: '      hasDelta: false,',
  },
  {
    id: 'stale-generation-accepted',
    find: "  if (candidate.generation !== currentGeneration) mismatches.push('generation');",
    replace: "  if (false) mismatches.push('generation');",
  },
  {
    id: 'decision-memory-digest-check-disabled',
    find: "  if (memory.memoryDigest !== digest) fail('E_ATLAS_DECISION_MEMORY_DIGEST_MISMATCH');",
    replace: "  if (false) fail('E_ATLAS_DECISION_MEMORY_DIGEST_MISMATCH');",
  },
  {
    id: 'decision-finality-disabled',
    find: "  if (latest && latest.disposition !== 'DEFER') {",
    replace: "  if (false && latest && latest.disposition !== 'DEFER') {",
  },
  {
    id: 'review-center-mutation-authority-claimed',
    find: '    readModelOnly: true,',
    replace: '    readModelOnly: false,',
  },
]);

function snapshotInput(revision = 1) {
  return {
    projectId: 'wp403-mutant-project',
    projectRevisionId: digest(`project-${revision}`),
    manifestRevision: digest(`manifest-${revision}`),
    sceneOrder: ['scene-1'],
    sceneRevisionsById: { 'scene-1': digest(`scene-${revision}`) },
    dependenciesBySceneId: { 'scene-1': [digest(`entity-${revision}`)] },
  };
}

function payload(revision, candidateKey = 'alpha') {
  return {
    candidateKey,
    candidateKind: 'mutant.review',
    entityId: `entity-${candidateKey}`,
    evidence: [{ evidenceId: 'ev-alpha', evidenceDigest: digest(`evidence-${revision}`) }],
    summary: { revision },
  };
}

async function assertWp403Oracle(module, snapshotModule, projector) {
  const snapshot = snapshotModule.createAtlasBookSnapshot(snapshotInput());
  const publish = (generation, candidates) => {
    const job = projector.createAtlasProjectorJob({ snapshot, projectorId: 'atlas.candidates', generation });
    const result = projector.runAtlasProjectorJob(job, () => ({ decisionCandidates: candidates }));
    const cell = projector.createAtlasProjectorPublicationCell();
    assert.equal(cell.publish({ activeJob: job, result, currentSnapshot: snapshot, currentGeneration: generation }).published, true);
    return cell.read();
  };
  const first = publish(1, [payload(1), payload(1, 'beta')]);
  const second = publish(2, [payload(2)]);
  const queue = module.buildAtlasDecisionCandidateQueue([second, first], { maxQueueSize: 1 });
  assert.equal(queue.candidates.length, 1);
  assert.equal(queue.candidates[0].candidateKey, 'alpha');
  assert.equal(queue.candidates[0].generation, 2);
  assert.equal(queue.discardedCount, 2);

  const tamperedCandidate = clone(queue.candidates[0]);
  tamperedCandidate.candidateId = digest('forged-candidate');
  assert.throws(() => module.verifyAtlasDecisionCandidate(tamperedCandidate));
  const tamperedQueue = clone(queue);
  tamperedQueue.candidates[0].summary.revision = 99;
  assert.throws(() => module.verifyAtlasDecisionCandidateQueue(tamperedQueue));

  const delta = module.computeAtlasEvidenceDelta({
    beforeEvidence: payload(1).evidence,
    afterEvidence: payload(2).evidence,
  });
  assert.equal(delta.summary.changedCount, 1);
  assert.equal(delta.summary.hasDelta, true);

  const empty = module.createAtlasDecisionMemory({ projectId: snapshot.projectId });
  const stale = module.recordAtlasDecision({
    candidateId: queue.candidates[0].candidateId,
    candidateQueue: queue,
    currentGeneration: 3,
    currentSnapshot: snapshot,
    decision: { disposition: 'ACCEPT', reason: 'Stale must fail.' },
    decisionMemory: empty,
  });
  assert.equal(stale.accepted, false);
  assert.equal(stale.reason, 'CANDIDATE_STALE');
  const recorded = module.recordAtlasDecision({
    candidateId: queue.candidates[0].candidateId,
    candidateQueue: queue,
    currentGeneration: 2,
    currentSnapshot: snapshot,
    decision: { disposition: 'ACCEPT', reason: 'Current candidate accepted.' },
    decisionMemory: empty,
  });
  assert.equal(recorded.accepted, true);
  const conflict = module.recordAtlasDecision({
    candidateId: queue.candidates[0].candidateId,
    candidateQueue: queue,
    currentGeneration: 2,
    currentSnapshot: snapshot,
    decision: { disposition: 'REJECT', reason: 'Finality conflict.' },
    decisionMemory: recorded.memory,
  });
  assert.equal(conflict.accepted, false);
  assert.equal(conflict.reason, 'DECISION_ALREADY_FINAL');
  assert.equal(conflict.memory.entries.length, 1);

  const chainMutant = clone(recorded.memory);
  const forgedPrevious = digest('forged-previous-memory');
  chainMutant.entries[0].previousMemoryDigest = forgedPrevious;
  chainMutant.entries[0].decisionId = independentDigest({
    schemaVersion: module.ATLAS_DECISION_RECORD_SCHEMA_VERSION,
    sequence: 1,
    previousMemoryDigest: forgedPrevious,
    candidateId: chainMutant.entries[0].candidate.candidateId,
    disposition: chainMutant.entries[0].disposition,
    reason: chainMutant.entries[0].reason,
  });
  chainMutant.memoryDigest = independentDigest({
    schemaVersion: 'yalken.atlas.decisionMemoryChain.v1',
    previousMemoryDigest: empty.memoryDigest,
    decisionId: chainMutant.entries[0].decisionId,
  });
  assert.throws(() => module.verifyAtlasDecisionMemory(chainMutant));
  const digestMutant = clone(recorded.memory);
  digestMutant.memoryDigest = digest('forged-final-memory-digest');
  assert.throws(() => module.verifyAtlasDecisionMemory(digestMutant));

  const center = module.buildAtlasReviewCenter({
    candidateQueue: queue,
    currentGeneration: 2,
    currentSnapshot: snapshot,
    decisionMemory: recorded.memory,
  });
  assert.equal(center.authority.readModelOnly, true);
  assert.equal(center.authority.commandAuthority, 'none');
  assert.equal(center.authority.productMutation, false);
}

async function loadMutant(source, mutant) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-wp403-mutant-'));
  const coreDir = path.join(dir, 'core');
  fs.mkdirSync(coreDir, { recursive: true });
  for (const basename of [
    'browser-safe-hash.mjs',
    'atlas-book-snapshot-v1.mjs',
    'atlas-projector-kernel-v1.mjs',
  ]) {
    fs.copyFileSync(path.join(ROOT, 'src/core', basename), path.join(coreDir, basename));
  }
  const target = path.join(coreDir, 'atlas-decision-substrate-v1.mjs');
  fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
  const suffix = `?mutant=${encodeURIComponent(mutant.id)}`;
  const [module, snapshotModule, projector] = await Promise.all([
    import(`${pathToFileURL(target).href}${suffix}`),
    import(`${pathToFileURL(path.join(coreDir, 'atlas-book-snapshot-v1.mjs')).href}${suffix}`),
    import(`${pathToFileURL(path.join(coreDir, 'atlas-projector-kernel-v1.mjs')).href}${suffix}`),
  ]);
  return { dir, module, snapshotModule, projector };
}

test('WP-403 implementation mutants: every queue, delta, stale, memory and authority mutant is killed', async () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const [module, snapshotModule, projector] = await Promise.all([
    import(pathToFileURL(MODULE_PATH).href),
    import(pathToFileURL(path.join(ROOT, 'src/core/atlas-book-snapshot-v1.mjs')).href),
    import(pathToFileURL(path.join(ROOT, 'src/core/atlas-projector-kernel-v1.mjs')).href),
  ]);
  await assertWp403Oracle(module, snapshotModule, projector);
  const results = [];
  for (const mutant of MUTANTS) {
    const occurrences = source.split(mutant.find).length - 1;
    assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
    const loaded = await loadMutant(source, mutant);
    let killed = false;
    let detail = 'survived';
    try {
      await assertWp403Oracle(loaded.module, loaded.snapshotModule, loaded.projector);
    } catch (error) {
      killed = true;
      detail = error.code || error.message;
    } finally {
      fs.rmSync(loaded.dir, { recursive: true, force: true });
    }
    results.push({ id: mutant.id, killed, detail });
  }
  const survived = results.filter((result) => !result.killed);
  console.log(`R24_WP403_MUTATION_RECEIPT=${JSON.stringify({
    total: results.length,
    killed: results.length - survived.length,
    survived: survived.map((result) => result.id),
    score: results.length ? (results.length - survived.length) / results.length : 0,
  })}`);
  assert.equal(results.length, MUTANTS.length);
  assert.deepEqual(survived, []);
});
