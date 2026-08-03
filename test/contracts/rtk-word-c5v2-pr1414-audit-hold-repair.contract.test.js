'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

async function loadCanary() {
  return import(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-physical-canary.mjs'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function createBoundCompletedRound(canary, overrides = {}) {
  const roundDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c5v2-pr1414-audit-hold-'));
  const ledger = {
    schemaVersion: 'yalken.rtk.word.c5v2.physical-master-round-ledger.v1',
    operations: [{
      id: 'op-exact-001',
      family: 'tracked_replace',
      expectedOutcome: 'EXACT',
      sceneId: 'roman/chapter-01.txt',
    }],
  };
  const exactLedgerBinding = {
    ok: true,
    matchedChangeCount: 1,
    exactApplyTextChangeIdsByScene: {
      'roman/chapter-01.txt': ['change-exact-001'],
    },
  };
  const files = {
    ledger: path.join(roundDir, 'canary-ledger.json'),
    wordOutput: path.join(roundDir, 'word-output.txt'),
    source: path.join(roundDir, 'c5v2-cumulative-source-fullmanuscript.docx'),
    returned: path.join(roundDir, 'c5v2-cumulative-returned-word-native.docx'),
    ready: path.join(roundDir, 'c5v2-cumulative-returned-ready.json'),
    oracle: path.join(roundDir, 'complete-round-oracle.json'),
    gate: path.join(roundDir, 'complete-round-oracle-gate.json'),
    truth: path.join(roundDir, 'yalken-reopened-truth.json'),
  };
  writeJson(files.ledger, ledger);
  fs.writeFileSync(files.wordOutput, 'WORD_STATUS=PASS\nOP=op-exact-001=EXACT\nNATIVE_READBACK=op-exact-001=EXACT\n', 'utf8');
  fs.writeFileSync(files.source, Buffer.from('source-docx-current'));
  fs.writeFileSync(files.returned, Buffer.from('returned-docx-current'));
  writeJson(files.oracle, { ok: true, oracleDigest: 'sha256:oracle-current' });
  writeJson(files.truth, { sourceKind: 'reopened-yalken-project', sceneReadback: [] });
  const returnedDocxSha256 = canary.sha256File(files.returned);
  writeJson(files.ready, { ready: true, returnedSha256: returnedDocxSha256 });
  const policy = canary.getC5V2OperationStatusPolicyBinding();
  const context = {
    exactHead: 'head-current',
    canaryScriptSha256: 'sha256:script-current',
    operationStatusPolicyBinding: policy,
    corpusDigest: 'sha256:corpus-current',
  };
  const completedRoundReuseBinding = canary.buildC5V2CompletedRoundReuseBinding({
    exactHead: overrides.exactHead || context.exactHead,
    canaryScriptSha256: overrides.canaryScriptSha256 || context.canaryScriptSha256,
    operationStatusPolicyVersion: overrides.operationStatusPolicyVersion || policy.version,
    operationStatusPolicyDigest: overrides.operationStatusPolicyDigest || policy.digest,
    corpusDigest: overrides.corpusDigest || context.corpusDigest,
    ledgerDigest: canary.resolveC5V2LedgerReuseDigest(ledger),
    sourceDocxSha256: canary.sha256File(files.source),
    returnedDocxSha256,
    yalkenTruthSha256: canary.sha256File(files.truth),
    exactLedgerBinding,
  });
  const gate = canary.buildC5V2CompleteRoundOracleGate({
    roundId: 'round-01',
    wordParsed: { scalars: { WORD_STATUS: 'PASS' } },
    nativeLifecycleVerification: { ok: true },
    oracleProbe: { ok: true, oracleDigest: 'sha256:oracle-current' },
    returnApply: { ok: true },
    completedRoundReuseBinding,
  });
  writeJson(files.gate, gate);
  return { roundDir, files, ledger, context, policy, gate, completedRoundReuseBinding, exactLedgerBinding };
}

test('C5V2 completed-round reuse rejects pre-fix green gates and BLOCKED-as-EXACT evidence', async () => {
  const canary = await loadCanary();
  const fixture = createBoundCompletedRound(canary);
  fs.writeFileSync(
    fixture.files.wordOutput,
    'WORD_STATUS=PASS\nOP=op-exact-001=BLOCKED\nNATIVE_READBACK=op-exact-001=EXACT\n',
    'utf8',
  );
  writeJson(fixture.files.gate, {
    schemaVersion: 'yalken.rtk.word.c5v2.complete-round-oracle-gate.v1',
    roundId: 'round-01',
    ok: true,
    oracleDigest: 'sha256:pre-fix-green',
    failures: [],
  });

  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, fixture.context), false);
  assert.equal(canary.isC5V2RecordedOperationStatusGreen({
    expectedOutcome: 'EXACT',
    reportedStatus: 'BLOCKED',
    nativeReadbackStatus: 'EXACT',
  }), false);
});

test('C5V2 completed-round reuse is bound to current head, canary digest, status policy, corpus, and ledger', async () => {
  const canary = await loadCanary();
  const fixture = createBoundCompletedRound(canary);

  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, fixture.context), true);
  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, {
    ...fixture.context,
    exactHead: 'head-prior',
  }), false);
  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, {
    ...fixture.context,
    canaryScriptSha256: 'sha256:script-mismatch',
  }), false);
  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, {
    ...fixture.context,
    operationStatusPolicyBinding: { ...fixture.policy, version: `${fixture.policy.version}.stale` },
  }), false);
  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, {
    ...fixture.context,
    operationStatusPolicyBinding: { ...fixture.policy, digest: 'sha256:policy-mismatch' },
  }), false);
  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, {
    ...fixture.context,
    corpusDigest: 'sha256:corpus-mismatch',
  }), false);

  fixture.ledger.operations.push({
    id: 'op-unbound-002',
    family: 'tracked_replace',
    expectedOutcome: 'EXACT',
    sceneId: 'roman/chapter-01.txt',
  });
  writeJson(fixture.files.ledger, fixture.ledger);
  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, fixture.context), false);
});

test('C5V2 current bound completed round is reusable and carries only ledger-bound exact candidates', async () => {
  const canary = await loadCanary();
  const fixture = createBoundCompletedRound(canary);
  const yalkenTruthArtifact = {
    path: fixture.files.truth,
    sha256: canary.sha256File(fixture.files.truth),
  };
  const reused = canary.buildC5V2CompletedRoundReuseReturnApply({
    gate: fixture.gate,
    expectedReuseBinding: fixture.completedRoundReuseBinding,
    yalkenTruthArtifact,
    returnedDocxSha256: canary.sha256File(fixture.files.returned),
  });

  assert.equal(reused.ok, true);
  assert.equal(reused.resumedCompletedRound, true);
  assert.equal(reused.exactLedgerBinding.ok, true);
  assert.deepEqual(canary.deriveC5V2LedgerBoundExactSummary(reused), {
    ok: true,
    code: 'C5V2_EXACT_SUMMARY_LEDGER_BOUND',
    exactApplyTextChangeIdsByScene: {
      'roman/chapter-01.txt': ['change-exact-001'],
    },
    exactScenes: 1,
    exactTotal: 1,
  });
});

test('C5V2 activation-only candidates never contribute to exactTotal', async () => {
  const canary = await loadCanary();
  const summary = canary.deriveC5V2LedgerBoundExactSummary({
    ok: true,
    activation: {
      exactApplyTextChangeIdsByScene: {
        'roman/chapter-01.txt': ['raw-activation-only'],
      },
    },
  });

  assert.equal(summary.ok, false);
  assert.equal(summary.code, 'C5V2_EXACT_SUMMARY_LEDGER_BINDING_REQUIRED');
  assert.equal(summary.exactTotal, 0);
  assert.deepEqual(summary.exactApplyTextChangeIdsByScene, {});
});

test('C5V2 fresh status gate and comment lifecycle maturity remain fail-closed and intact', async () => {
  const canary = await loadCanary();
  assert.equal(canary.isC5V2RecordedOperationStatusGreen({
    expectedOutcome: 'EXACT',
    reportedStatus: 'EXACT',
    nativeReadbackStatus: 'EXACT',
  }), true);
  assert.equal(canary.isC5V2RecordedOperationStatusGreen({
    expectedOutcome: 'EXACT',
    reportedStatus: 'EXACT',
    nativeReadbackStatus: 'BLOCKED',
  }), false);
  assert.deepEqual(canary.deriveC5V2CommentLaneMaturity({
    ok: true,
    planSummary: { replyCount: 1, commentStateCount: 1 },
    semanticOracle: { rootApplied: 1, lifecycleApplied: 2, triangleGreen: true },
  }), {
    rootCommentsState: 'CANONICAL_ROOT_COMMENT_APPLY_AND_REPLAY_PROVEN',
    repliesState: 'CANONICAL_REPLY_APPLY_AND_REPLAY_PROVEN',
    commentState: 'CANONICAL_COMMENT_STATE_APPLY_AND_REPLAY_PROVEN',
    commentsRepliesState: 'CANONICAL_PRODUCT_APPLY_AND_REPLAY_PROVEN',
  });
});
