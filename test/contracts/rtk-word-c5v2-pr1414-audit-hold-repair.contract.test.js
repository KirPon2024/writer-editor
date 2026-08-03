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

function rewriteBoundGate(canary, fixture, bindingChanges = {}, gateChanges = {}) {
  const gate = JSON.parse(fs.readFileSync(fixture.files.gate, 'utf8'));
  const binding = { ...gate.completedRoundReuseBinding, ...bindingChanges };
  const { bindingDigest: _priorDigest, ...body } = binding;
  binding.bindingDigest = canary.sha256Text(canary.stableCanonicalJson(body));
  const nextGate = { ...gate, ...gateChanges, completedRoundReuseBinding: binding };
  writeJson(fixture.files.gate, nextGate);
  return nextGate;
}

function createBoundCompletedRound(canary, overrides = {}) {
  const roundDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c5v2-pr1414-audit-hold-'));
  const operations = Array.isArray(overrides.operations) ? overrides.operations : [{
    id: 'op-exact-001',
    formalFamily: 'tracked_text_edit',
    family: 'tracked_replace',
    expectedOutcome: 'EXACT',
    sceneId: 'roman/chapter-01.txt',
    quote: 'old text',
    replacementText: 'new text',
  }];
  const changeIdByOperationId = Object.fromEntries(operations.map((operation, index) => [
    operation.id,
    `change-exact-${String(index + 1).padStart(3, '0')}`,
  ]));
  const sceneIds = [...new Set(operations.map((operation) => operation.sceneId))];
  const ledger = {
    schemaVersion: 'yalken.rtk.word.c5v2.physical-master-round-ledger.v1',
    topology: 'one-full-manuscript-project-cumulative-rounds',
    roundNumber: 1,
    masterLedgerDigest: 'sha256:stored-master-ledger-digest',
    ledgerDigest: 'sha256:stored-round-ledger-digest',
    operationCount: operations.length,
    familyCounts: operations.reduce((counts, operation) => ({
      ...counts,
      [operation.family]: Number(counts[operation.family] || 0) + 1,
    }), {}),
    scenes: sceneIds.map((sceneId) => ({ sceneId })),
    operations,
  };
  const exactLedgerBinding = {
    ok: true,
    expectedOperationCount: operations.length,
    matchedOperationCount: operations.length,
    matchedChangeCount: operations.length,
    excludedCandidateCount: 0,
    exactApplyTextChangeIdsByScene: operations.reduce((byScene, operation) => {
      if (!byScene[operation.sceneId]) byScene[operation.sceneId] = [];
      byScene[operation.sceneId].push(changeIdByOperationId[operation.id]);
      return byScene;
    }, {}),
    exactOperationBindings: operations.map((operation) => ({
      operationId: operation.id,
      sceneId: operation.sceneId,
      changeId: changeIdByOperationId[operation.id],
    })),
    unmatchedExpectedOperationIds: [],
    duplicateExpectedSignatureOperationIds: [],
    duplicateCandidateBindingIds: [],
    missingDiagnosticCandidateIds: [],
  };
  const files = {
    ledger: path.join(roundDir, 'canary-ledger.json'),
    wordOutput: path.join(roundDir, 'word-output.txt'),
    source: path.join(roundDir, 'c5v2-cumulative-source-fullmanuscript.docx'),
    returned: path.join(roundDir, 'c5v2-cumulative-returned-word-native.docx'),
    ready: path.join(roundDir, 'c5v2-cumulative-returned-ready.json'),
    oracle: path.join(roundDir, 'complete-round-oracle.json'),
    gate: path.join(roundDir, 'complete-round-oracle-gate.json'),
    candidateAuthority: path.join(roundDir, 'return-apply-candidate-authority.json'),
    truth: path.join(roundDir, 'yalken-reopened-truth.json'),
  };
  writeJson(files.ledger, ledger);
  fs.writeFileSync(files.wordOutput, [
    'WORD_STATUS=PASS',
    ...operations.map((operation) => `OP|${operation.id}|${operation.expectedOutcome}`),
    ...operations.map((operation) => `READBACK|${operation.id}|${operation.expectedOutcome}|WORD_OBJECT_MODEL_REOPENED`),
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(files.source, Buffer.from('source-docx-current'));
  fs.writeFileSync(files.returned, Buffer.from('returned-docx-current'));
  const operationResults = operations.map((operation) => ({
    operationId: operation.id,
    family: operation.formalFamily,
    expectedOutcome: operation.expectedOutcome,
    reportedStatus: operation.expectedOutcome,
    nativeReadbackStatus: operation.expectedOutcome,
    wordGreen: true,
    yalkenGreen: true,
  }));
  writeJson(files.oracle, {
    schemaVersion: 'yalken.rtk.word.c5v2.complete-round-oracle.v1',
    ok: true,
    operationCount: operations.length,
    wordStatusCount: operations.length,
    nativeWordReadbackCount: operations.length,
    duplicateWordStatuses: false,
    duplicateNativeReadbacks: false,
    semanticOracle: { ok: true, operationCount: operations.length, failures: [] },
    operationResults,
    oracleDigest: canary.sha256Text(canary.stableCanonicalJson(operationResults)),
  });
  const rawContent = 'production shaped reopened scene';
  writeJson(files.truth, {
    schemaVersion: 'yalken.rtk.word.c5v2.reopened-yalken-truth.v1',
    roundId: 'round-01',
    sourceKind: 'reopened-yalken-project',
    reopenPassCount: 2,
    passes: [1, 2].map((pass) => ({
      pass,
      scenes: sceneIds.map((sceneId) => ({ sceneId, ok: true })),
    })),
    sceneReadback: sceneIds.map((sceneId) => ({
      sceneId,
      rawContent: `${rawContent}:${sceneId}`,
      rawContentSha256: canary.sha256Text(`${rawContent}:${sceneId}`),
    })),
    expectedRootCommentCount: 0,
    canonicalNonTextState: { present: false },
    recoveryNonTextState: { present: false },
  });
  const returnedDocxSha256 = canary.sha256File(files.returned);
  writeJson(files.ready, { ready: true, roundId: 'round-01', returnedSha256: returnedDocxSha256 });
  const policy = canary.getC5V2OperationStatusPolicyBinding();
  const context = {
    exactHead: 'head-current',
    canaryScriptSha256: 'sha256:script-current',
    operationStatusPolicyBinding: policy,
    corpusDigest: 'sha256:corpus-current',
    roundId: 'round-01',
  };
  const returnApply = {
    ok: true,
    activation: {
      textChangeScopeDiagnostics: operations.map((operation) => ({
        changeId: changeIdByOperationId[operation.id],
        targetScope: { id: operation.sceneId },
        matchKind: 'exact',
        quoteSha256: canary.sha256Text(operation.quote),
        replacementSha256: canary.sha256Text(operation.replacementText),
      })),
    },
  };
  const returnApplyCandidateAuthority = canary.buildC5V2ReturnApplyCandidateAuthority({
    roundId: context.roundId,
    returnApply,
  });
  writeJson(files.candidateAuthority, returnApplyCandidateAuthority);
  const completedRoundReuseBinding = canary.buildC5V2CompletedRoundReuseBinding({
    roundId: overrides.roundId || context.roundId,
    exactHead: overrides.exactHead || context.exactHead,
    canaryScriptSha256: overrides.canaryScriptSha256 || context.canaryScriptSha256,
    operationStatusPolicyVersion: overrides.operationStatusPolicyVersion || policy.version,
    operationStatusPolicyDigest: overrides.operationStatusPolicyDigest || policy.digest,
    corpusDigest: overrides.corpusDigest || context.corpusDigest,
    ledger,
    ledgerContentDigest: canary.resolveC5V2LedgerReuseDigest(ledger),
    wordOutputSha256: canary.sha256File(files.wordOutput),
    completeRoundOracleSha256: canary.sha256File(files.oracle),
    returnedReadySha256: canary.sha256File(files.ready),
    sourceDocxSha256: canary.sha256File(files.source),
    returnedDocxSha256,
    yalkenTruthSha256: canary.sha256File(files.truth),
    returnApplyCandidateAuthority,
    returnApplyCandidateAuthoritySha256: canary.sha256File(files.candidateAuthority),
    exactLedgerBinding,
  });
  const gate = canary.buildC5V2CompleteRoundOracleGate({
    roundId: overrides.gateRoundId || 'round-01',
    wordParsed: { scalars: { WORD_STATUS: 'PASS' } },
    nativeLifecycleVerification: { ok: true },
    oracleProbe: { ok: true, oracleDigest: 'sha256:oracle-current' },
    returnApply,
    completedRoundReuseBinding,
  });
  writeJson(files.gate, gate);
  return {
    roundDir,
    files,
    ledger,
    context,
    policy,
    gate,
    completedRoundReuseBinding,
    exactLedgerBinding,
    returnApplyCandidateAuthority,
  };
}

test('C5V2 v4 rejects synchronized forged change mapping against independent candidate authority', async () => {
  const canary = await loadCanary();
  const fixture = createBoundCompletedRound(canary, {
    operations: [{
      id: 'op-exact-001',
      formalFamily: 'tracked_text_edit',
      family: 'tracked_replace',
      expectedOutcome: 'EXACT',
      sceneId: 'roman/chapter-01.txt',
      quote: 'old text one',
      replacementText: 'new text one',
    }, {
      id: 'op-exact-002',
      formalFamily: 'tracked_text_edit',
      family: 'tracked_replace',
      expectedOutcome: 'EXACT',
      sceneId: 'roman/chapter-02.txt',
      quote: 'old text two',
      replacementText: 'new text two',
    }],
  });
  const forgedExactLedgerBinding = {
    ...fixture.exactLedgerBinding,
    exactApplyTextChangeIdsByScene: {
      'roman/chapter-01.txt': ['change-exact-002'],
      'roman/chapter-02.txt': ['change-exact-001'],
    },
    exactOperationBindings: [{
      operationId: 'op-exact-001',
      sceneId: 'roman/chapter-01.txt',
      changeId: 'change-exact-002',
    }, {
      operationId: 'op-exact-002',
      sceneId: 'roman/chapter-02.txt',
      changeId: 'change-exact-001',
    }],
  };
  rewriteBoundGate(canary, fixture, { exactLedgerBinding: forgedExactLedgerBinding });

  assert.equal(canary.validateC5V2ExactLedgerBindingAgainstLedger(
    forgedExactLedgerBinding,
    fixture.ledger,
    {
      candidateAuthority: fixture.returnApplyCandidateAuthority,
      roundId: fixture.context.roundId,
    },
  ).ok, false);
  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, fixture.context), false);
});

test('C5V2 v4 rejects candidate authority content mutation even when all authority and binding digests are refreshed', async () => {
  const canary = await loadCanary();
  const fixture = createBoundCompletedRound(canary);
  const authority = JSON.parse(fs.readFileSync(fixture.files.candidateAuthority, 'utf8'));
  authority.candidates[0].changeId = 'change-authority-forged';
  const { contentDigest: _priorDigest, ...authorityBody } = authority;
  authority.contentDigest = canary.sha256Text(canary.stableCanonicalJson(authorityBody));
  writeJson(fixture.files.candidateAuthority, authority);
  rewriteBoundGate(canary, fixture, {
    returnApplyCandidateAuthoritySha256: canary.sha256File(fixture.files.candidateAuthority),
    returnApplyCandidateAuthorityContentDigest: authority.contentDigest,
  });

  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, fixture.context), false);
});

test('C5V2 v4 rejects candidate authority hash mutation under a refreshed outer binding digest', async () => {
  const canary = await loadCanary();
  const fixture = createBoundCompletedRound(canary);
  rewriteBoundGate(canary, fixture, {
    returnApplyCandidateAuthoritySha256: 'sha256:forged-authority-file-hash',
  });

  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, fixture.context), false);
});

test('C5V2 production-shaped reuse rejects recorded EXACT changed to BLOCKED under a rehashed v4 binding', async () => {
  const canary = await loadCanary();
  const fixture = createBoundCompletedRound(canary);
  fs.writeFileSync(
    fixture.files.wordOutput,
    'WORD_STATUS=PASS\nOP|op-exact-001|BLOCKED\nREADBACK|op-exact-001|EXACT|WORD_OBJECT_MODEL_REOPENED\n',
    'utf8',
  );
  rewriteBoundGate(canary, fixture, {
    wordOutputSha256: canary.sha256File(fixture.files.wordOutput),
  });

  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, fixture.context), false);
  assert.equal(canary.isC5V2RecordedOperationStatusGreen({
    expectedOutcome: 'EXACT',
    reportedStatus: 'BLOCKED',
    nativeReadbackStatus: 'EXACT',
  }), false);
});

test('C5V2 production-shaped reuse rejects same-count ledger operation id mutation with stored digests unchanged', async () => {
  const canary = await loadCanary();
  const fixture = createBoundCompletedRound(canary);
  const masterLedgerDigest = fixture.ledger.masterLedgerDigest;
  const ledgerDigest = fixture.ledger.ledgerDigest;
  fixture.ledger.operations[0].id = 'op-exact-mutated';
  writeJson(fixture.files.ledger, fixture.ledger);

  assert.equal(fixture.ledger.masterLedgerDigest, masterLedgerDigest);
  assert.equal(fixture.ledger.ledgerDigest, ledgerDigest);
  assert.equal(fixture.ledger.operations.length, 1);
  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, fixture.context), false);
});

test('C5V2 production-shaped reuse rejects same-count ledger scene mutation with stored digests unchanged', async () => {
  const canary = await loadCanary();
  const fixture = createBoundCompletedRound(canary);
  const masterLedgerDigest = fixture.ledger.masterLedgerDigest;
  const ledgerDigest = fixture.ledger.ledgerDigest;
  fixture.ledger.operations[0].sceneId = 'roman/chapter-99.txt';
  writeJson(fixture.files.ledger, fixture.ledger);

  assert.equal(fixture.ledger.masterLedgerDigest, masterLedgerDigest);
  assert.equal(fixture.ledger.ledgerDigest, ledgerDigest);
  assert.equal(fixture.ledger.operations.length, 1);
  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, fixture.context), false);
});

test('C5V2 production-shaped reuse rejects complete oracle ok false under a rehashed v4 binding', async () => {
  const canary = await loadCanary();
  const fixture = createBoundCompletedRound(canary);
  const oracle = JSON.parse(fs.readFileSync(fixture.files.oracle, 'utf8'));
  oracle.ok = false;
  writeJson(fixture.files.oracle, oracle);
  rewriteBoundGate(canary, fixture, {
    completeRoundOracleSha256: canary.sha256File(fixture.files.oracle),
  });

  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, fixture.context), false);
});

test('C5V2 production-shaped reuse rejects gate and binding round-99 for current round-01', async () => {
  const canary = await loadCanary();
  const fixture = createBoundCompletedRound(canary);
  rewriteBoundGate(canary, fixture, { roundId: 'round-99' }, { roundId: 'round-99' });

  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, fixture.context), false);
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
  assert.equal(canary.validateC5V2ExactLedgerBindingAgainstLedger(
    fixture.exactLedgerBinding,
    fixture.ledger,
  ).ok, false);
  assert.equal(canary.validateC5V2ExactLedgerBindingAgainstLedger(
    fixture.exactLedgerBinding,
    fixture.ledger,
    {
      candidateAuthority: fixture.returnApplyCandidateAuthority,
      roundId: fixture.context.roundId,
    },
  ).ok, true);
  assert.equal(canary.validateC5V2ExactLedgerBindingAgainstLedger({
    ...fixture.exactLedgerBinding,
    exactOperationBindings: [{
      operationId: 'op-exact-001',
      sceneId: 'roman/chapter-99.txt',
      changeId: 'change-exact-001',
    }],
  }, fixture.ledger, {
    candidateAuthority: fixture.returnApplyCandidateAuthority,
    roundId: fixture.context.roundId,
  }).ok, false);
  assert.equal(canary.validateC5V2ExactLedgerBindingAgainstLedger({
    ...fixture.exactLedgerBinding,
    exactOperationBindings: [{
      operationId: 'op-exact-001',
      sceneId: 'roman/chapter-01.txt',
      changeId: 'change-forged',
    }],
  }, fixture.ledger, {
    candidateAuthority: fixture.returnApplyCandidateAuthority,
    roundId: fixture.context.roundId,
  }).ok, false);
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
