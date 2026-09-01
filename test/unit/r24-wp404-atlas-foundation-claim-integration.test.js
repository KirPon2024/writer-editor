'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const importRepo = (relativePath) => import(pathToFileURL(path.join(ROOT, relativePath)).href);
const HEAD = '1'.repeat(40);
const TREE = '2'.repeat(40);
const ARTIFACT_DIGEST = '3'.repeat(64);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const digest = (value) => `sha256:${crypto.createHash('sha256').update(
  typeof value === 'string' ? value : canonical(value),
  'utf8',
).digest('hex')}`;

function observedWriterEvidence(writerCompiler, program) {
  return writerCompiler.expectedWriterStageIds(program).map((stageId, workflowIndex) => {
    const stage = program.stages.find((row) => row.stageId === stageId);
    const script = writerCompiler.STAGE_SCRIPT_BY_ID[stageId];
    return {
      stageId,
      status: 'SUCCESS',
      headSha: HEAD,
      treeSha: TREE,
      evidenceClass: 'INDEPENDENT_EXACT_HEAD',
      source: 'V0_COMPILER_CONTRACT_FIXTURE',
      workflowIndex,
      script,
      candidate: { stageId, script, profileId: stage.profile },
      run: { id: `run-${stageId}`, headSha: HEAD, conclusion: 'success' },
      job: { id: `job-${stageId}`, name: `job ${stageId}`, conclusion: 'success' },
      step: { name: `step ${stageId}`, number: 1, conclusion: 'success' },
      counts: { denominator: 1, passed: 1, failed: 0, skipped: 0, exitCode: 0 },
      artifact: { digest: ARTIFACT_DIGEST },
      tool: { digest: ARTIFACT_DIGEST },
      schema: { digest: ARTIFACT_DIGEST },
      fixture: { digest: ARTIFACT_DIGEST },
    };
  });
}

async function compileWriterV0() {
  const writerCompiler = await importRepo('scripts/ops/r24/writer-claim-compiler-v0.mjs');
  const program = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'docs/OPS/EVIDENCE/YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1/PROGRAM_DAG.json'),
    'utf8',
  ));
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const workflowText = fs.readFileSync(path.join(ROOT, '.github/workflows/rtk-required.yml'), 'utf8');
  const result = writerCompiler.compileWriterVerdict({
    program,
    packageJson,
    workflowText,
    repoState: { headSha: HEAD, originMainSha: HEAD, treeSha: TREE, dirty: false },
    expectedHeadSha: HEAD,
    expectedOriginMainSha: HEAD,
    gateEvidence: observedWriterEvidence(writerCompiler, program),
    now: '2026-09-01T00:00:00.000Z',
  });
  assert.equal(result.ok, true);
  return result;
}

async function realFoundationArtifacts() {
  const [anchor, snapshotModule, projector, substrate] = await Promise.all([
    importRepo('src/core/atlas-anchor-lineage-v1.mjs'),
    importRepo('src/core/atlas-book-snapshot-v1.mjs'),
    importRepo('src/core/atlas-projector-kernel-v1.mjs'),
    importRepo('src/core/atlas-decision-substrate-v1.mjs'),
  ]);
  const revision = {
    domain: { projectId: 'wp404-project', entityId: 'scene-1' },
    projectRevision: 1,
    entityRevision: 1,
    sourceRevision: 1,
    generation: 0,
    writerEpoch: 0,
  };
  const lineage = anchor.createAnchorLineage({
    anchorId: 'wp404-anchor',
    projectId: 'wp404-project',
    sceneId: 'scene-1',
    birthRevision: revision,
  });
  const snapshot = snapshotModule.createAtlasBookSnapshot({
    projectId: 'wp404-project',
    projectRevisionId: digest('wp404-project-revision'),
    manifestRevision: digest('wp404-manifest'),
    sceneOrder: ['scene-1'],
    sceneRevisionsById: { 'scene-1': digest('wp404-scene') },
    dependenciesBySceneId: { 'scene-1': [digest(lineage)] },
  });
  const job = projector.createAtlasProjectorJob({ snapshot, projectorId: 'atlas.foundation', generation: 1 });
  const result = projector.runAtlasProjectorJob(job, () => ({ decisionCandidates: [{
    candidateKey: 'foundation-review',
    candidateKind: 'foundation.review',
    entityId: 'scene-1',
    evidence: [{ evidenceId: 'anchor-lineage', evidenceDigest: digest(lineage) }],
    summary: { profile: 'ATLAS_FOUNDATION' },
  }] }));
  const cell = projector.createAtlasProjectorPublicationCell();
  assert.equal(cell.publish({ activeJob: job, result, currentSnapshot: snapshot, currentGeneration: 1 }).published, true);
  const publication = cell.read();
  const queue = substrate.buildAtlasDecisionCandidateQueue([publication], { maxQueueSize: 8 });
  const memory = substrate.createAtlasDecisionMemory({ projectId: snapshot.projectId });
  return { lineage, snapshot, publication, queue, memory };
}

function request() {
  return {
    profileId: 'ATLAS_FOUNDATION',
    claimCeiling: 'NODE_AND_SELECTED_PROFILE_ONLY',
    programVerdict: 'NEEDS_MORE_EVIDENCE',
    globalScalarPass: false,
    includeWriterV0: true,
    promoteProfiles: [],
  };
}

test('WP-404 integration: actual Writer V0 output and WP400-WP403 artifacts form one exact bounded foundation claim', async () => {
  const [claimCompiler, writerV0Receipt, artifacts] = await Promise.all([
    importRepo('src/core/atlas-foundation-claim-v1.mjs'),
    compileWriterV0(),
    realFoundationArtifacts(),
  ]);
  const supporting = [
    ['WP-400_ANCHOR_LINEAGE', 'anchor-lineage', artifacts.lineage],
    ['WP-401_BOOK_SNAPSHOT', 'book-snapshot', artifacts.snapshot],
    ['WP-402_PROJECTOR_KERNEL', 'projector-publication', artifacts.publication],
    ['WP-403_DECISION_SUBSTRATE', 'decision-queue-and-memory', {
      queueDigest: artifacts.queue.queueDigest,
      memoryDigest: artifacts.memory.memoryDigest,
    }],
  ];
  const foundationProofs = supporting.map(([nodeId, evidenceId, artifact]) => claimCompiler.createAtlasFoundationProof({
    schemaVersion: claimCompiler.ATLAS_FOUNDATION_PROOF_SCHEMA_VERSION,
    nodeId,
    state: 'DONE',
    verdict: 'PASS',
    evidenceClass: 'INDEPENDENT_EXACT_HEAD',
    evaluationSha: HEAD,
    evaluationTreeSha: TREE,
    terminalReceiptDigest: digest(`terminal-${nodeId}`),
    claimBindingDigest: digest(`binding-${nodeId}`),
    supportingEvidence: [{ evidenceId, evidenceClass: 'INTEGRATION', evidenceDigest: digest(artifact) }],
  }));
  const receipt = claimCompiler.compileAtlasFoundationClaim({
    exactIdentity: { headSha: HEAD, originMainSha: HEAD, treeSha: TREE, dirty: false },
    writerV0Receipt,
    writerV0ReceiptDigest: digest(writerV0Receipt),
    foundationProofs,
    claimRequest: request(),
  });
  assert.equal(receipt.verdict, 'PASS');
  assert.equal(receipt.writerInheritance.requiredStageCount, writerV0Receipt.profileVerdict.requiredStageCount);
  assert.equal(receipt.writerInheritance.closedStageCount, writerV0Receipt.profileVerdict.closedStageCount);
  assert.deepEqual(receipt.foundation.requiredNodeIds, claimCompiler.REQUIRED_FOUNDATION_NODE_IDS);
  assert.equal(receipt.foundation.nodeProofs[3].supportingEvidence[0].evidenceId, 'decision-queue-and-memory');
  assert.equal(receipt.nonClaims.includes('NO_LATER_ATLAS_PRODUCT_NODE_PROMOTION'), true);
});

test('WP-404 differential oracle independently recomputes every proof, proof-set and final claim digest', async () => {
  const claimCompiler = await importRepo('src/core/atlas-foundation-claim-v1.mjs');
  const writerV0Receipt = await compileWriterV0();
  const foundationProofs = claimCompiler.REQUIRED_FOUNDATION_NODE_IDS.map((nodeId, index) => {
    const identity = {
      schemaVersion: claimCompiler.ATLAS_FOUNDATION_PROOF_SCHEMA_VERSION,
      nodeId,
      state: 'DONE',
      verdict: 'PASS',
      evidenceClass: 'INDEPENDENT_EXACT_HEAD',
      evaluationSha: HEAD,
      evaluationTreeSha: TREE,
      terminalReceiptDigest: digest(`terminal-${index}`),
      claimBindingDigest: digest(`binding-${index}`),
      supportingEvidence: [{
        evidenceId: `proof-${index}`,
        evidenceClass: 'INDEPENDENT_EXACT_HEAD',
        evidenceDigest: digest(`proof-${index}`),
      }],
    };
    const proof = claimCompiler.createAtlasFoundationProof(identity);
    assert.equal(proof.proofDigest, digest(identity));
    return proof;
  });
  const receipt = claimCompiler.compileAtlasFoundationClaim({
    exactIdentity: { headSha: HEAD, originMainSha: HEAD, treeSha: TREE, dirty: false },
    writerV0Receipt,
    writerV0ReceiptDigest: digest(writerV0Receipt),
    foundationProofs,
    claimRequest: request(),
  });
  assert.equal(receipt.foundation.proofSetDigest, digest(receipt.foundation.nodeProofs.map(
    (proof) => ({ nodeId: proof.nodeId, proofDigest: proof.proofDigest }),
  )));
  const { claimDigest, ...claimIdentity } = receipt;
  assert.equal(claimDigest, digest(claimIdentity));
});

test('WP-404 large corpus: the complete 8,192 supporting-evidence denominator remains deterministic and bounded', async () => {
  const claimCompiler = await importRepo('src/core/atlas-foundation-claim-v1.mjs');
  const writerV0Receipt = await compileWriterV0();
  const proofs = claimCompiler.REQUIRED_FOUNDATION_NODE_IDS.map((nodeId, nodeIndex) => claimCompiler.createAtlasFoundationProof({
    schemaVersion: claimCompiler.ATLAS_FOUNDATION_PROOF_SCHEMA_VERSION,
    nodeId,
    state: 'DONE',
    verdict: 'PASS',
    evidenceClass: 'INDEPENDENT_EXACT_HEAD',
    evaluationSha: HEAD,
    evaluationTreeSha: TREE,
    terminalReceiptDigest: digest(`large-terminal-${nodeIndex}`),
    claimBindingDigest: digest(`large-binding-${nodeIndex}`),
    supportingEvidence: Array.from({ length: 2_048 }, (_, evidenceIndex) => ({
      evidenceId: `node-${nodeIndex}-evidence-${String(evidenceIndex).padStart(4, '0')}`,
      evidenceClass: 'INDEPENDENT_EXACT_HEAD',
      evidenceDigest: digest(`large-${nodeIndex}-${evidenceIndex}`),
    })),
  }));
  const input = {
    exactIdentity: { headSha: HEAD, originMainSha: HEAD, treeSha: TREE, dirty: false },
    writerV0Receipt,
    writerV0ReceiptDigest: digest(writerV0Receipt),
    foundationProofs: proofs,
    claimRequest: request(),
  };
  const startedAt = performance.now();
  const receipt = claimCompiler.compileAtlasFoundationClaim(input);
  const elapsedMs = performance.now() - startedAt;
  assert.equal(receipt.foundation.supportingEvidenceDenominator, 8_192);
  assert.deepEqual(claimCompiler.compileAtlasFoundationClaim(input), receipt);
  assert.ok(elapsedMs < 5_000, `large corpus exceeded bound: ${elapsedMs}ms`);
  const tooLarge = Array.from({ length: 2_049 }, (_, index) => ({
    evidenceId: `overflow-${index}`,
    evidenceClass: 'INDEPENDENT_EXACT_HEAD',
    evidenceDigest: digest(`overflow-${index}`),
  }));
  assert.throws(() => claimCompiler.createAtlasFoundationProof({
    schemaVersion: claimCompiler.ATLAS_FOUNDATION_PROOF_SCHEMA_VERSION,
    nodeId: claimCompiler.REQUIRED_FOUNDATION_NODE_IDS[0],
    state: 'DONE',
    verdict: 'PASS',
    evidenceClass: 'INDEPENDENT_EXACT_HEAD',
    evaluationSha: HEAD,
    evaluationTreeSha: TREE,
    terminalReceiptDigest: digest('overflow-terminal'),
    claimBindingDigest: digest('overflow-binding'),
    supportingEvidence: tooLarge,
  }), (error) => error.code === 'E_ATLAS_FOUNDATION_SUPPORTING_EVIDENCE_BOUND');
});
