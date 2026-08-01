const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const C1_RECEIPT_PATH = path.join(process.cwd(), 'docs', 'OPS', 'RTK', 'WORD_SAFETY_REMEDIATION_V1_C1_EFFECT_RESERVATION_RECEIPT.json');
const PROGRAM_PATH = path.join(process.cwd(), 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const PROFILE_PATH = path.join(process.cwd(), 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const LEDGER_PATH = path.join(process.cwd(), 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');
const GOOGLE_MATRIX_PATH = path.join(process.cwd(), 'docs', 'OPS', 'RTK', 'GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_CAPABILITY_MATRIX_V1.json');
const GOOGLE_RECEIPT_PATH = path.join(process.cwd(), 'docs', 'OPS', 'RTK', 'GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_DISCOVERY_RECEIPT.json');
const C1_STATUS = 'WORD_SAFETY_REMEDIATION_V1_C1_LOCAL_VERIFIED_READY_FOR_DELIVERY_CHAIN';
const C2_STATUS = 'WORD_SAFETY_REMEDIATION_V1_C2_LOCAL_VERIFIED_READY_FOR_DELIVERY_CHAIN';
const ACTIVE_REMEDIATION_STATUSES = new Set([C1_STATUS, C2_STATUS]);
const GOOGLE_BLOCKED_STATUS = 'REPORT_ONLY_BLOCKED_BY_WORD_SAFETY_REMEDIATION';
const WORD_REVOKED_STATUS = 'WORD_ACCEPTANCE_REVOKED_BY_SOURCE_BOUND_EVIDENCE';

async function loadModule(relativePath) {
  return import(pathToFileURL(path.join(process.cwd(), relativePath)).href);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const cryptoPort = {
  sha256Text(value) {
    return crypto.createHash('sha256').update(Buffer.from(String(value || ''), 'utf8')).digest('hex');
  },
  sha256Json(value) {
    return `sha256:${this.sha256Text(stableJson(value))}`;
  },
};

function sha256Text(text) {
  return `sha256:${crypto.createHash('sha256').update(Buffer.from(String(text || ''), 'utf8')).digest('hex')}`;
}

function assertActiveRemediationStatus(value) {
  assert.equal(ACTIVE_REMEDIATION_STATUSES.has(value), true, value);
}

function portableHashName(value) {
  const match = String(value || '').toLowerCase().match(/^sha256:([a-f0-9]{64})$/u);
  assert.ok(match, `expected sha256 key: ${value}`);
  return match[1];
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function tmpProject(text = 'Alpha beta gamma.') {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-c1-reservation-'));
  const scenePath = path.join(projectRoot, 'scene.md');
  fs.writeFileSync(scenePath, text, 'utf8');
  return { projectRoot, scenePath, sceneText: text };
}

function textChange({
  changeId = 'change-beta',
  quote = 'beta',
  replacementText = 'delta',
  sceneId = 'scene-1',
} = {}) {
  return {
    changeId,
    targetScope: { type: 'scene', id: sceneId },
    match: { kind: 'exact', quote, prefix: '', suffix: '' },
    replacementText,
    createdAt: '2026-08-01T12:00:00.000Z',
  };
}

function writerInput(project, changes, overrides = {}) {
  const sceneId = overrides.sceneId || 'scene-1';
  const projectId = overrides.projectId || 'project-c1';
  const baselineHash = overrides.baselineHash || 'baseline-c1';
  return {
    projectRoot: project.projectRoot,
    projectSnapshot: {
      projectId,
      baselineHash,
      scenes: [{ sceneId, text: project.sceneText }],
    },
    revisionSession: {
      projectId,
      baselineHash,
      sessionId: overrides.sessionId || 'session-c1',
      status: 'open',
      reviewGraph: {
        commentThreads: [],
        commentPlacements: [],
        textChanges: changes,
        structuralChanges: [],
        diagnosticItems: [],
        decisionStates: [],
      },
    },
    reviewItems: changes,
    scenePath: project.scenePath,
    scenePathBySceneId: { [sceneId]: project.scenePath },
  };
}

function envelopeInput(project, changes, overrides = {}) {
  const sourceHash = sha256Text(`source:${project.sceneText}`);
  const rawHash = sha256Text(`raw:${project.sceneText}`);
  return {
    callerRole: 'main',
    commandAuthority: {
      issuer: 'main',
      intent: 'rtk.exactApply',
      commandId: overrides.commandId || 'cmd-c1-reservation',
    },
    roundId: overrides.roundId || 'round-c1',
    requestId: overrides.requestId || 'request-c1-1',
    exportIdentity: overrides.exportIdentity || 'export-c1',
    returnArtifactSha256: overrides.returnArtifactSha256 || sha256Text('return-c1'),
    manifestDigest: overrides.manifestDigest || sha256Text('manifest-c1'),
    analysisDigest: overrides.analysisDigest || sha256Text('analysis-c1'),
    returnLifecycleState: 'RETURN_ANALYZED',
    candidateDisposition: {
      textLane: 'RTK_EXACT_APPLICABLE',
      commentLane: 'RTK_COMMENT_UNSUPPORTED',
      priority: 'TEXT_BEFORE_COMMENT',
    },
    sourceIdentity: {
      sourceTokenDomain: 'SOURCE_TOKEN_DOMAIN_V1',
      writerTextDomain: 'WRITER_TEXT_DOMAIN_V1',
      revisionSha256: sourceHash,
      rawBytesSha256: rawHash,
    },
    currentIdentity: {
      revisionSha256: sourceHash,
      rawBytesSha256: rawHash,
    },
    commentLane: [],
    writerInput: writerInput(project, changes, overrides),
  };
}

async function applyAllIdentical(count) {
  const exactApply = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  const project = tmpProject();
  const input = envelopeInput(project, [textChange()]);
  const results = await Promise.all(Array.from({ length: count }, () => (
    exactApply.applyReviewTransportExactApply(input, { cryptoPort })
  )));
  assert.equal(results.filter((item) => item.status === 'applied').length, 1, `${count}: applied count`);
  assert.equal(results.filter((item) => item.status === 'replay').length, count - 1, `${count}: replay count`);
  assert.equal(results.filter((item) => item.writerCalled).length, 1, `${count}: writer count`);
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), 'Alpha delta gamma.');
}

test('C1 Promise.all identical requests reserve once for 2, 16 and 100 callers', async () => {
  await applyAllIdentical(2);
  await applyAllIdentical(16);
  await applyAllIdentical(100);
});

test('C1 active program truth parks Google and revokes Word acceptance pending C1-C5', () => {
  const receipt = readJson(C1_RECEIPT_PATH);
  const program = readJson(PROGRAM_PATH);
  const profile = readJson(PROFILE_PATH);
  const ledger = readJson(LEDGER_PATH);
  const googleMatrix = readJson(GOOGLE_MATRIX_PATH);
  const googleReceipt = readJson(GOOGLE_RECEIPT_PATH);

  assert.equal(receipt.status, C1_STATUS);
  assert.equal(receipt.ownerCorrection.wordAcceptanceRevoked, true);
  assert.equal(receipt.ownerCorrection.googleStage, GOOGLE_BLOCKED_STATUS);
  assert.equal(receipt.r0Baseline.actualContractFiles, 65);
  assert.equal(receipt.r0Baseline.total, 327);
  assert.equal(receipt.r0Baseline.fail, 56);
  assert.equal(receipt.r0Baseline.failureClassifications.STALE_BINDING_GUARD, 56);
  assert.equal(receipt.r0Baseline.failureClassifications.PRODUCT_DEFECT_SOURCE_BOUND_AUDIT, 4);
  assert.equal(receipt.c1Guarantees.exclusiveReservationBeforeWriter, true);
  assert.equal(receipt.c1Guarantees.sameRoundEffectKeyDirectIndex, true);
  assert.equal(receipt.c1Guarantees.noSilentScanTruncation, true);

  assertActiveRemediationStatus(program.status);
  assert.equal(program.wordSafetyRemediationV1.c1Delivered !== false, true);
  assert.equal(program.wordStageClosure.status, WORD_REVOKED_STATUS);
  assert.equal(program.googleDocsStage.status, GOOGLE_BLOCKED_STATUS);
  assert.equal(program.googleDocsStage.productRuntimeWired, 0);
  assert.equal(program.googleDocsStage.googleStageDone, false);
  assert.equal(program.v4ExecutionState.googleDocsOpened, false);

  assertActiveRemediationStatus(profile.status);
  assert.equal(profile.wordSafetyRemediationV1.c1Delivered !== false, true);
  assert.equal(profile.formalWordStageClosure.status, WORD_REVOKED_STATUS);
  assert.equal(profile.nextEditorStage.status, GOOGLE_BLOCKED_STATUS);
  assert.equal(profile.normalizedCapabilityMatrix.wordSaturated, false);
  assert.equal(profile.normalizedCapabilityMatrix.readyForFreshIndependentExactHeadAudit, false);

  assertActiveRemediationStatus(ledger.status);
  assert.equal(ledger.wordSafetyRemediationV1.c1Delivered !== false, true);
  assert.equal(ledger.wordAcceptanceRevocation.status, WORD_REVOKED_STATUS);
  assert.equal(ledger.googleDocsStage.status, GOOGLE_BLOCKED_STATUS);

  assert.equal(googleMatrix.status, GOOGLE_BLOCKED_STATUS);
  assert.equal(googleMatrix.result, 'REPORT_ONLY_BLOCKED');
  assert.equal(googleReceipt.status, GOOGLE_BLOCKED_STATUS);
  assert.equal(googleReceipt.result, 'REPORT_ONLY_BLOCKED');
});

test('C1 same-round effect with different requestKey mutates once and replays by effect index', async () => {
  const exactApply = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  const project = tmpProject();
  const first = envelopeInput(project, [textChange()], {
    requestId: 'request-c1-a',
    returnArtifactSha256: sha256Text('return-c1-a'),
  });
  const second = envelopeInput(project, [textChange()], {
    commandId: 'cmd-c1-reservation-b',
    requestId: 'request-c1-b',
    returnArtifactSha256: sha256Text('return-c1-b'),
  });
  const results = await Promise.all([
    exactApply.applyReviewTransportExactApply(first, { cryptoPort }),
    exactApply.applyReviewTransportExactApply(second, { cryptoPort }),
  ]);
  assert.equal(results.filter((item) => item.status === 'applied').length, 1);
  assert.equal(results.filter((item) => item.status === 'replay').length, 1);
  assert.equal(results.filter((item) => item.writerCalled).length, 1);
  assert.equal(results.some((item) => String(item.replayKind || '').includes('same_round_effect')), true);
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), 'Alpha delta gamma.');
});

test('C1 same key with different envelope bytes conflicts before a second writer can run', async () => {
  const exactApply = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  const store = await loadModule('src/io/revisionBridge/reviewTransportApplyStore.mjs');
  const project = tmpProject();
  const built = exactApply.buildReviewTransportExactApplyEnvelope(
    envelopeInput(project, [textChange()]),
    { cryptoPort },
  );
  assert.equal(built.ok, true);
  const first = await store.reserveRtkExactApplyMutation(project.projectRoot, built.envelope, { now: () => 1785580000000 });
  assert.equal(first.ok, true);
  const conflicted = await store.reserveRtkExactApplyMutation(project.projectRoot, {
    ...built.envelope,
    envelopeDigest: sha256Text('same-request-different-envelope-bytes'),
  }, { now: () => 1785580001000 });
  assert.equal(conflicted.ok, false);
  assert.equal(conflicted.reason, 'RTK_WRITE_RESERVATION_CONFLICT');
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), project.sceneText);
});

test('C1 unrelated effects remain independently applicable under concurrency', async () => {
  const exactApply = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  const firstProject = tmpProject('One alpha beta.');
  const secondProject = tmpProject('Two alpha beta.');
  const results = await Promise.all([
    exactApply.applyReviewTransportExactApply(envelopeInput(firstProject, [
      textChange({ quote: 'One', replacementText: 'First' }),
    ], { requestId: 'request-c1-unrelated-a', exportIdentity: 'export-c1-a' }), { cryptoPort }),
    exactApply.applyReviewTransportExactApply(envelopeInput(secondProject, [
      textChange({ quote: 'Two', replacementText: 'Second' }),
    ], { requestId: 'request-c1-unrelated-b', exportIdentity: 'export-c1-b' }), { cryptoPort }),
  ]);
  assert.equal(results.every((item) => item.status === 'applied'), true);
  assert.equal(fs.readFileSync(firstProject.scenePath, 'utf8'), 'First alpha beta.');
  assert.equal(fs.readFileSync(secondProject.scenePath, 'utf8'), 'Second alpha beta.');
});

test('C1 killpoints do not repeat writer after reservation, before writer, or before outcome', async () => {
  const exactApply = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  const store = await loadModule('src/io/revisionBridge/reviewTransportApplyStore.mjs');
  const cases = [
    {
      name: 'afterReservation',
      options: { afterReservation: async () => { throw new Error('kill after reservation'); } },
      expectedText: 'Alpha beta gamma.',
      writerCalled: false,
    },
    {
      name: 'beforeWriter',
      options: { beforeWriter: async () => { throw new Error('kill before writer'); } },
      expectedText: 'Alpha beta gamma.',
      writerCalled: false,
    },
    {
      name: 'beforeOutcomeCommit',
      options: { beforeOutcomeCommit: async () => { throw new Error('kill before outcome'); } },
      expectedText: 'Alpha delta gamma.',
      writerCalled: true,
    },
  ];
  for (const item of cases) {
    const project = tmpProject();
    const input = envelopeInput(project, [textChange()], {
      requestId: `request-c1-${item.name}`,
      returnArtifactSha256: sha256Text(`return-${item.name}`),
    });
    const first = await exactApply.applyReviewTransportExactApply(input, {
      ...item.options,
      cryptoPort,
      now: () => 1785580000000,
    });
    assert.equal(first.status, 'ambiguous', item.name);
    assert.equal(first.writerCalled, item.writerCalled, item.name);
    assert.equal(fs.readFileSync(project.scenePath, 'utf8'), item.expectedText, item.name);

    const built = exactApply.buildReviewTransportExactApplyEnvelope(input, { cryptoPort }).envelope;
    const reservation = await store.readRtkExactApplyReservation(project.projectRoot, built);
    assert.equal(reservation.currentState.state, 'RECOVERY_REQUIRED', item.name);

    const repeated = await exactApply.applyReviewTransportExactApply(input, {
      exactWriter: async () => { throw new Error('writer must not repeat'); },
      cryptoPort,
    });
    assert.equal(repeated.status, 'blocked', item.name);
    assert.equal(repeated.reason, 'RTK_WRITE_RESERVATION_RECOVERY_REQUIRED', item.name);
    assert.equal(repeated.writerCalled, false, item.name);
  }
});

test('C1 recovery resolution and outcome records are immutable write-once records', async () => {
  const exactApply = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  const core = await loadModule('src/io/revisionBridge/reviewTransportApplyCore.mjs');
  const store = await loadModule('src/io/revisionBridge/reviewTransportApplyStore.mjs');
  const project = tmpProject();
  const input = envelopeInput(project, [textChange()]);
  const applied = await exactApply.applyReviewTransportExactApply(input, { cryptoPort });
  assert.equal(applied.status, 'applied');
  const sameOutcome = await store.writeRtkExactApplyOutcomeRecord(project.projectRoot, applied.outcomeRecord);
  assert.equal(sameOutcome.existing, true);
  await assert.rejects(
    () => store.writeRtkExactApplyOutcomeRecord(project.projectRoot, {
      ...applied.outcomeRecord,
      writerReason: 'tampered-after-commit',
    }),
    /immutable/u,
  );

  const recovery = core.buildRtkExactApplyRecoveryResolution(applied.envelope, {
    outcome: 'conflict',
    ambiguous: true,
  }, { cryptoPort });
  const firstRecovery = await store.writeRtkExactApplyRecoveryResolution(project.projectRoot, recovery);
  assert.equal(firstRecovery.existing, false);
  const sameRecovery = await store.writeRtkExactApplyRecoveryResolution(project.projectRoot, recovery);
  assert.equal(sameRecovery.existing, true);
  await assert.rejects(
    () => store.writeRtkExactApplyRecoveryResolution(project.projectRoot, {
      ...recovery,
      reason: 'RTK_WRITE_RECOVERED',
    }),
    /immutable/u,
  );
});

test('C1 more than 512 historical outcomes cannot hide keyed replay', async () => {
  const exactApply = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  const store = await loadModule('src/io/revisionBridge/reviewTransportApplyStore.mjs');
  const project = tmpProject();
  const input = envelopeInput(project, [textChange()]);
  const first = await exactApply.applyReviewTransportExactApply(input, { cryptoPort });
  assert.equal(first.status, 'applied');

  const outcomeDir = path.join(project.projectRoot, 'backups', 'revision-bridge-rtk-apply-outcomes');
  fs.mkdirSync(outcomeDir, { recursive: true });
  for (let index = 0; index < 513; index += 1) {
    fs.writeFileSync(path.join(outcomeDir, `zz-historical-${String(index).padStart(3, '0')}.json`), JSON.stringify({
      schemaVersion: 'yalken.rtk.exact-apply-outcome.v2',
      roundId: `old-round-${index}`,
      requestKey: sha256Text(`old-request-${index}`),
      effectKey: sha256Text(`old-effect-${index}`),
      envelopeDigest: sha256Text(`old-envelope-${index}`),
      lifecycleState: 'RETURN_ANALYZED',
      status: 'APPLIED_ONCE',
      reason: 'RTK_EXACT_APPLICABLE',
      writerReceipt: null,
      writerReason: '',
      outcomeDigest: sha256Text(`old-outcome-${index}`),
    }, null, 2));
  }

  await assert.rejects(
    () => store.readRtkExactApplyOutcomeRecords(project.projectRoot),
    (error) => error && error.code === 'RTK_APPLY_STORE_SCAN_LIMIT_EXCEEDED',
  );
  const replay = await exactApply.applyReviewTransportExactApply(input, {
    exactWriter: async () => { throw new Error('keyed replay must not scan-call writer'); },
    cryptoPort,
  });
  assert.equal(replay.status, 'replay');
  assert.equal(replay.writerCalled, false);
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), 'Alpha delta gamma.');
});

test('C1 symlink, corrupt index and traversal keys fail closed before writer', async () => {
  const exactApply = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  const store = await loadModule('src/io/revisionBridge/reviewTransportApplyStore.mjs');

  const symlinkProject = tmpProject();
  const symlinkInput = envelopeInput(symlinkProject, [textChange()], { requestId: 'request-c1-symlink' });
  const symlinkEnvelope = exactApply.buildReviewTransportExactApplyEnvelope(symlinkInput, { cryptoPort }).envelope;
  const requestDir = path.join(symlinkProject.projectRoot, 'backups', 'revision-bridge-rtk-apply-reservations', 'by-request');
  fs.mkdirSync(requestDir, { recursive: true });
  fs.symlinkSync(os.tmpdir(), path.join(requestDir, `${portableHashName(symlinkEnvelope.requestKey)}.json`));
  const symlinkResult = await exactApply.applyReviewTransportExactApply(symlinkInput, {
    exactWriter: async () => { throw new Error('symlink reservation must block writer'); },
    cryptoPort,
  });
  assert.equal(symlinkResult.status, 'blocked');
  assert.equal(symlinkResult.reason, 'RTK_WRITE_RESERVATION_RECOVERY_REQUIRED');
  assert.equal(symlinkResult.writerCalled, false);

  const corruptProject = tmpProject();
  const corruptInput = envelopeInput(corruptProject, [textChange()], { requestId: 'request-c1-corrupt-index' });
  const corruptEnvelope = exactApply.buildReviewTransportExactApplyEnvelope(corruptInput, { cryptoPort }).envelope;
  const effectDir = path.join(corruptProject.projectRoot, 'backups', 'revision-bridge-rtk-apply-outcome-effects');
  fs.mkdirSync(effectDir, { recursive: true });
  fs.writeFileSync(path.join(effectDir, `${portableHashName(corruptEnvelope.effectKey)}.json`), '{not-json', 'utf8');
  const corruptResult = await exactApply.applyReviewTransportExactApply(corruptInput, {
    exactWriter: async () => { throw new Error('corrupt index must block writer'); },
    cryptoPort,
  });
  assert.equal(corruptResult.status, 'blocked');
  assert.equal(corruptResult.reason, 'RTK_WRITE_RESERVATION_RECOVERY_REQUIRED');
  assert.equal(corruptResult.writerCalled, false);

  await assert.rejects(
    () => store.reserveRtkExactApplyMutation(tmpProject().projectRoot, {
      ...corruptEnvelope,
      requestKey: 'sha256:not-a-real-key',
    }),
    /sha256 identity/u,
  );
});
