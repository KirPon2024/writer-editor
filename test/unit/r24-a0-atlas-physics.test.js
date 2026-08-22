'use strict';

// R2.4 A0 physics: exercise the real Atlas derived scheduler and resource
// planner on synthetic in-memory states. No filesystem, network, or renderer
// authority is used by the product path.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(ROOT, 'scripts', 'ops', 'r24', 'atlas-incremental-equivalence-a0.mjs');

async function compiler() {
  return import(pathToFileURL(MODULE_PATH).href);
}

test('A0 proof observes full/incremental/replay/idle equivalence on one source revision', async () => {
  const c = await compiler();
  const proof = c.runAtlasA0Proof({ deadlineMs: 2500 });

  assert.equal(proof.schemaVersion, c.A0_PROOF_SCHEMA_VERSION);
  assert.equal(proof.stageId, 'A0_ATLAS_INCREMENTAL_EQUIVALENCE');
  assert.equal(proof.profileId, 'ATLAS_MAPS_DERIVED');
  assert.equal(proof.model.zeroDenominator, false);
  assert.equal(proof.model.finiteCaseCount >= 8, true);
  assert.equal(proof.observations.normal.equivalent, true);
  assert.equal(proof.observations.replay.equivalent, true);
  assert.equal(proof.observations.idleBudget.equivalent, true);
  assert.equal(proof.observations.idleBudget.triggerMode, 'idleBudget');
  assert.match(proof.observations.normal.fullCompositeHash, /^[0-9a-f]{64}$/u);
  assert.equal(proof.observations.normal.fullCompositeHash, proof.observations.normal.incrementalCompositeHash);
  assert.equal(proof.observations.normal.fullCompositeHash, proof.observations.normal.acceptedCompositeHash);
  assert.equal(proof.observations.normal.nodeCount > 0, true);
  assert.equal(proof.observations.normal.sourceProjectionCount >= 6, true);
  assert.match(proof.proofHash, /^[0-9a-f]{64}$/u);
});

test('A0 proof rejects stale, out-of-order, crash, hash, and disabled-capability paths', async () => {
  const c = await compiler();
  const proof = c.runAtlasA0Proof({ deadlineMs: 2500 });

  assert.deepEqual(proof.faults.staleSource, {
    accepted: false,
    code: 'E_ATLAS_GLOBAL_COMPOSITE_STALE_RESULT',
    reason: 'STALE_RESULT_SOURCE_REVISION',
  });
  assert.equal(proof.faults.staleGeneration.accepted, false);
  assert.equal(proof.faults.staleGeneration.code, 'E_ATLAS_GLOBAL_COMPOSITE_STALE_RESULT');
  assert.equal(proof.faults.staleGeneration.reason, 'STALE_RESULT_IDENTITY_MISMATCH');
  assert.deepEqual(proof.faults.staleGeneration.mismatches, ['requestId', 'generation']);
  assert.equal(proof.faults.failedWorker.accepted, false);
  assert.equal(proof.faults.failedWorker.code, 'E_ATLAS_GLOBAL_COMPOSITE_RESULT_FAILED');
  assert.equal(proof.faults.hashMismatch.accepted, false);
  assert.equal(proof.faults.hashMismatch.code, 'E_ATLAS_GLOBAL_COMPOSITE_HASH_MISMATCH');
  assert.equal(proof.faults.disabledCapability.accepted, false);
  assert.equal(proof.faults.disabledCapability.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');
});

test('A0 proof records bounded queue fairness without daemon or persistent publication authority', async () => {
  const c = await compiler();
  const proof = c.runAtlasA0Proof({ deadlineMs: 2500 });
  const queue = proof.scheduler.queue;

  assert.equal(queue.ok, true);
  assert.equal(queue.maxQueueSize, 2);
  assert.equal(queue.queueLength <= queue.maxQueueSize, true);
  assert.equal(queue.discardedCount > 0, true);
  assert.equal(queue.oneJobPerProject, true);
  assert.equal(queue.latestPerRetainedProject, true);
  assert.equal(queue.bounded, true);
  assert.deepEqual(proof.scheduler.monotonicPublicationLaw.includes('sourceRevision'), true);
});

test('A0 proof records physical deadline, source immutability, and bounded resource evidence', async () => {
  const c = await compiler();
  const proof = c.runAtlasA0Proof({ deadlineMs: 2500 });

  assert.equal(proof.physical.runtime, 'node');
  assert.equal(proof.physical.deadlineWithinBudget, true);
  assert.equal(proof.physical.sourceStateUnchanged, true);
  assert.equal(proof.physical.productMutation, false);
  assert.equal(proof.physical.storageMutation, false);
  assert.equal(proof.physical.networkMutation, false);
  assert.match(proof.physical.beforeStateHash, /^[0-9a-f]{64}$/u);
  assert.equal(proof.physical.beforeStateHash, proof.physical.afterStateHash);

  assert.equal(proof.resource.schemaVersion, 'atlas.globalCompositeGraph.lodPlan.v1');
  assert.equal(proof.resource.proofSchemaVersion, 'atlas.globalCompositeGraph.resourceBudgetProof.v1');
  assert.equal(proof.resource.sourceNodeCount, 4096);
  assert.equal(proof.resource.sourceEdgeCount, 4095);
  assert.equal(proof.resource.plannedNodeCount <= proof.resource.limits.maxNodes, true);
  assert.equal(proof.resource.plannedEdgeCount <= proof.resource.limits.maxEdges, true);
  assert.equal(proof.resource.omittedNodeCount > 0, true);
  assert.equal(proof.resource.omittedEdgeCount > 0, true);
  assert.equal(proof.resource.renderAllNodes, false);
  assert.equal(proof.resource.renderAllEdges, false);
  assert.equal(proof.resource.withinBudget, true);
  assert.match(proof.resource.resourceBudgetProofHash, /^[0-9a-f]{64}$/u);
});

test('A0 CLI can compile fixture evidence when exact identity is provided explicitly', async () => {
  const c = await compiler();
  const proof = c.runAtlasA0Proof({ deadlineMs: 2500 });
  const result = c.compileAtlasA0Evidence({
    program: require(path.join(ROOT, 'docs', 'OPS', 'EVIDENCE', 'YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1', 'PROGRAM_DAG.json')),
    scientificContracts: require(path.join(ROOT, 'docs', 'OPS', 'EVIDENCE', 'YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1', 'SCIENTIFIC_CONTRACTS.json')),
    repoState: {
      headSha: '1'.repeat(40),
      originMainSha: '2'.repeat(40),
      treeSha: '3'.repeat(40),
      dirty: false,
    },
    packageJson: {
      scripts: {
        'test:r24-v0': 'node --test v0',
        'test:r24-a0': 'node --test a0',
      },
    },
    workflowText: '        run: npm run -s test:r24-v0\n        run: npm run -s test:r24-a0\n',
    expectedHeadSha: '1'.repeat(40),
    expectedOriginMainSha: '2'.repeat(40),
    proof,
  });

  assert.equal(result.ok, true);
  assert.equal(result.verdict, 'ATLAS_A0_INCREMENTAL_FULL_EQUIVALENCE_BOUND_TO_EXACT_HEAD');
  assert.equal(result.evidence.proofHash, proof.proofHash);
});
