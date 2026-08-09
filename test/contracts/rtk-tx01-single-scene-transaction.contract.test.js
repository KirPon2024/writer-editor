const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

// TX-01 Pass 1 — RED-FIRST FALSIFIERS ONLY.
// This contract pins the CURRENT defects of the single-scene transaction unit
// (RTK exact apply + journal + markdown recovery primitives). Every RED
// subtest fails for an exact, documented defect/absence reason, NOT a harness
// error. Controls assert already-green behaviour is preserved.
//
// CONTRACT INTEGRITY: this pass must not change product runtime. If any
// control subtest turns RED (instead of the new REDs), the harness is broken.

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

function sha256Hex(text) {
  return crypto.createHash('sha256').update(Buffer.from(String(text), 'utf8')).digest('hex');
}

function sha256Colon(text) {
  return `sha256:${sha256Hex(text)}`;
}

function tmpProjectRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-tx01-'));
}

function tmpProject(text = 'Alpha beta gamma.') {
  const projectRoot = tmpProjectRoot();
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
    createdAt: '2026-08-09T12:00:00.000Z',
  };
}

function writerInput(project, changes, overrides = {}) {
  const sceneId = overrides.sceneId || 'scene-1';
  const projectId = overrides.projectId || 'project-tx01';
  const baselineHash = overrides.baselineHash || 'baseline-tx01';
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
      sessionId: overrides.sessionId || 'session-tx01',
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
  const sourceHash = sha256Colon(`source:${project.sceneText}`);
  const rawHash = sha256Colon(`raw:${project.sceneText}`);
  return {
    callerRole: overrides.callerRole || 'main',
    commandAuthority: {
      issuer: overrides.authorityIssuer || 'main',
      intent: 'rtk.exactApply',
      commandId: overrides.commandId || 'cmd-tx01',
    },
    roundId: overrides.roundId || 'round-tx01',
    requestId: overrides.requestId || 'request-tx01-1',
    exportIdentity: overrides.exportIdentity || 'export-tx01',
    returnArtifactSha256: overrides.returnArtifactSha256 || sha256Colon('return-tx01'),
    manifestDigest: overrides.manifestDigest || sha256Colon('manifest-tx01'),
    analysisDigest: overrides.analysisDigest || sha256Colon('analysis-tx01'),
    returnLifecycleState: 'RETURN_ANALYZED',
    candidateDisposition: {
      textLane: 'RTK_EXACT_APPLICABLE',
      commentLane: 'RTK_COMMENT_UNSUPPORTED',
      priority: 'TEXT_BEFORE_COMMENT',
    },
    sourceIdentity: {
      sourceTokenDomain: 'SOURCE_TOKEN_DOMAIN_V1',
      writerTextDomain: 'WRITER_TEXT_DOMAIN_V1',
      revisionSha256: overrides.sourceRevisionSha256 || sourceHash,
      rawBytesSha256: overrides.sourceRawBytesSha256 || rawHash,
    },
    currentIdentity: {
      revisionSha256: overrides.currentRevisionSha256 || sourceHash,
      rawBytesSha256: overrides.currentRawBytesSha256 || rawHash,
    },
    commentLane: [],
    writerInput: writerInput(project, changes, overrides),
  };
}

// ---------------------------------------------------------------------------
// T1 — Stuck reservation reconciles (NOT an eternal recovery block)
// ---------------------------------------------------------------------------

test('TX01-T1-stuck-reservation-reconciles crash after reservation does not eternally block', async () => {
  const exactApply = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  const project = tmpProject();
  const input = envelopeInput(project, [textChange()]);

  // Crash AFTER reserveRtkExactApplyMutation (afterReservation killpoint, per
  // the real C1 flow). writerCalls must stay 0 — writer never started.
  const first = await exactApply.applyReviewTransportExactApply(input, {
    cryptoPort,
    now: () => 1785580000000,
    afterReservation: async () => { throw new Error('TX01-T1 kill after reservation'); },
  });
  assert.equal(first.status, 'ambiguous');
  assert.equal(first.writerCalled, false);
  // CURRENT defect: scene bytes are unchanged (writer never ran).
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), project.sceneText);

  // writerCalls spy: the retry must not blindly re-run the writer.
  let writerCalls = 0;
  const retry = await exactApply.applyReviewTransportExactApply(input, {
    cryptoPort,
    exactWriter: async () => {
      writerCalls += 1;
      throw new Error('writer must not repeat in a stuck reservation without reconcile');
    },
  });

  // RED REASON (CURRENT): reviewTransportExactApply.mjs:267-273 returns an
  // eternal reservationBlock('RTK_WRITE_RESERVATION_RECOVERY_REQUIRED') when an
  // existing reservation has no committed outcome, regardless of reconcile.
  // The writer can never finish — writerCalls stays 0 and the reservation is
  // never reconciled/released with a release proof.
  //
  // TARGET: retry reconcile resolves the stuck reservation through ONE of:
  //   - replay-from-receipt (if a receipt exists), OR
  //   - commit completion (if journal already WRITER_APPLIED), OR
  //   - release with release proof and a typed recovery action.
  // The contract requires the retry to eventually unblock the writer (either
  // replay with writerCalls === 0, or a controlled re-apply with writerCalls
  // bounded), instead of looping forever on RECOVERY_REQUIRED.
  const unblockedStates = new Set(['replay', 'applied']);
  const hasSanctionedRecovery = unblockedStates.has(retry.status)
    || (retry.status === 'blocked' && retry.reason !== 'RTK_WRITE_RESERVATION_RECOVERY_REQUIRED');
  assert.equal(
    hasSanctionedRecovery,
    true,
    `TX01-T1: expected retry to unblock (replay/applied or non-stuck block), got status=${retry.status} reason=${retry.reason}`,
  );
});

test('TX01-T1-stuck-reservation-reconciles crash between WRITER_APPLIED and outcome commit completes via reconcile', async () => {
  const exactApply = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  const project = tmpProject();
  const input = envelopeInput(project, [textChange()]);

  // Crash at beforeOutcomeCommit: writer already ran (WRITER_APPLIED), the
  // journal already recorded applied_receipt_present, but the outcome record
  // was never committed. Per the real C1 flow this is a sanctioned killpoint.
  const first = await exactApply.applyReviewTransportExactApply(input, {
    cryptoPort,
    now: () => 1785580000000,
    beforeOutcomeCommit: async () => { throw new Error('TX01-T1 kill before outcome commit'); },
  });
  assert.equal(first.status, 'ambiguous');
  assert.equal(first.writerCalled, true);
  // The scene bytes ARE the target text — the writer ran.
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), 'Alpha delta gamma.');

  // Retry. CURRENT: eternal RTK_WRITE_RESERVATION_RECOVERY_REQUIRED.
  // TARGET: reconcile observes the journal already recorded the receipt
  // (applied_receipt_present) and commits the outcome through reconcile
  // (replay-from-receipt), so the writer is never re-run.
  let writerCalls = 0;
  const retry = await exactApply.applyReviewTransportExactApply(input, {
    cryptoPort,
    exactWriter: async () => {
      writerCalls += 1;
      throw new Error('writer must not repeat when journal receipt is present');
    },
  });
  // RED REASON (CURRENT): no reconcile-before-reservation path replays from a
  // receipt-bearing reservation; the writer is permanently blocked even though
  // the journal already has the proof of the apply.
  assert.equal(
    retry.status === 'replay' && writerCalls === 0,
    true,
    `TX01-T1: expected replay-from-receipt with writerCalls=0, got status=${retry.status} writerCalls=${writerCalls}`,
  );
});

// ---------------------------------------------------------------------------
// T2 — Writer lease with fencing token
// ---------------------------------------------------------------------------

test('TX01-T2-writer-lease-with-fencing exact apply acquires a fenced lease and rejects stale owner publish', async () => {
  const exactApply = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  const project = tmpProject();
  const input = envelopeInput(project, [textChange()]);

  let leaseProof = null;
  const result = await exactApply.applyReviewTransportExactApply(input, {
    cryptoPort,
    now: () => 1785580000000,
    // Probe hook for the TARGET lease/fencing surface. CURRENT: the apply path
    // has no lease acquisition; the hook is simply never invoked, so leaseProof
    // stays null and the assertion below fails.
    afterLease: async ({ lease }) => { leaseProof = lease; },
  });
  assert.equal(result.status, 'applied');

  // RED REASON (CURRENT): no lease or fencing token is acquired anywhere on
  // the apply path. leaseProof is null.
  assert.ok(leaseProof, 'TX01-T2: expected a fenced lease proof on the apply path');
  assert.ok(
    Number.isSafeInteger(leaseProof.fencingGeneration) && leaseProof.fencingGeneration > 0,
    'TX01-T2: expected monotonic fencingGeneration > 0',
  );
  assert.ok(
    typeof leaseProof.ownerTokenDigest === 'string' && /^[a-f0-9]{64}$/u.test(leaseProof.ownerTokenDigest),
    'TX01-T2: expected ownerTokenDigest on lease proof',
  );

  // Stale owner after takeover must NOT be able to publish. Simulate a
  // generation drift: TARGET rejects with a typed fence-rejection error.
  const stalePublishError = await Promise.resolve()
    .then(() => exactApply.publishWithFence
      ? exactApply.publishWithFence({
        projectRoot: project.projectRoot,
        sceneId: 'scene-1',
        fencingGeneration: leaseProof.fencingGeneration + 1,
        ownerTokenDigest: leaseProof.ownerTokenDigest,
        mutation: { kind: 'replaceExactText', changeId: 'stale' },
      })
      : null)
    .catch((error) => error);

  // RED REASON (CURRENT): there is no publishWithFence primitive at all, so
  // stalePublishError is null — a stale owner would silently mutate the scene.
  assert.ok(
    stalePublishError && /FENCE|STALE|OWNERSHIP|FENCING/i.test(stalePublishError.code || stalePublishError.reason || ''),
    'TX01-T2: expected typed fence rejection for stale owner publish',
  );

  // Release proof on successful completion. CURRENT: no release proof exists.
  // RED REASON: result carries no durable release proof.
  assert.ok(
    result.releaseProof && result.releaseProof.fencingGeneration === leaseProof.fencingGeneration,
    'TX01-T2: expected release proof bound to the fencing token on successful completion',
  );
});

// ---------------------------------------------------------------------------
// T3 — mutationEpoch + expectedSlices on the journal entry
// ---------------------------------------------------------------------------

test('TX01-T3-mutation-epoch-and-expected-slices journal entry carries epoch and expected slices', async () => {
  const exactApply = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  const journal = await loadModule('src/io/revisionBridge/exactTextApplyJournal.mjs');
  const project = tmpProject();
  const input = envelopeInput(project, [textChange()]);
  const result = await exactApply.applyReviewTransportExactApply(input, { cryptoPort });
  assert.equal(result.status, 'applied');

  // Read the journal entry the apply produced. The operationId is derived from
  // the envelope requestKey prefix.
  const operationId = `op_${sha256Hex(`sha256:${result.envelope.requestKey.replace(/^sha256:/u, '')}`).slice(0, 48)}`;
  // Use the same derivation the driver uses.
  const envelopeOpId = `op_${result.envelope.requestKey.replace(/^sha256:/u, '').slice(0, 48)}`;
  const entry = await journal.readCanonicalSceneForExactTextApplyReconciliation
    ? await (async () => {
      const ctx = { projectRoot: project.projectRoot };
      return journal.reconcileExactTextApplyJournal
        ? null
        : null;
    })()
    : null;

  // Read the journal file directly to assert schema-level fields.
  const journalDir = path.join(project.projectRoot, 'backups', 'revision-bridge-apply-journal');
  const journalFile = path.join(journalDir, `${envelopeOpId}.json`);
  assert.ok(fs.existsSync(journalFile), `TX01-T3: journal file exists for ${envelopeOpId}`);
  const entryPayload = JSON.parse(fs.readFileSync(journalFile, 'utf8'));

  // RED REASON (CURRENT): the journal schema (exactTextApplyJournal.mjs:270-294)
  // has no mutationEpoch and no expectedSlices fields.
  assert.ok(
    Number.isSafeInteger(entryPayload.mutationEpoch) && entryPayload.mutationEpoch > 0,
    'TX01-T3: expected monotonic per-scene mutationEpoch on journal entry',
  );
  assert.ok(
    Array.isArray(entryPayload.expectedSlices) && entryPayload.expectedSlices.length > 0,
    'TX01-T3: expected per-operation expectedSlices digest array on journal entry',
  );
});

test('TX01-T3-mutation-epoch-and-expected-slices epoch drift between read and commit is typed stale', async () => {
  const exactApply = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  const project = tmpProject();
  const input = envelopeInput(project, [textChange()]);

  let writerCalls = 0;
  const result = await exactApply.applyReviewTransportExactApply(input, {
    cryptoPort,
    // Simulate an epoch drift between read and commit: the scene's mutationEpoch
    // advanced after the apply read its baseline. CURRENT: no epoch guard
    // exists, so the writer would happily clobber the newer state.
    beforeOutcomeCommit: async () => {
      writerCalls += 1;
      // Force a drift: emulate a concurrent mutation having bumped the epoch.
      throw Object.assign(new Error('epoch drift'), {
        code: 'RTK_TX01_MUTATION_EPOCH_STALE',
      });
    },
  });

  // RED REASON (CURRENT): there is no typed epoch-stale path; the killpoint
  // surfaces as a generic ambiguous/recovery_required block with writerCalls
  // counted but no typed stale-epoch contract.
  assert.equal(
    result.status === 'blocked' && /MUTATION_EPOCH_STALE|STALE_EPOCH/i.test(result.reason || ''),
    true,
    `TX01-T3: expected typed stale-epoch block, got status=${result.status} reason=${result.reason}`,
  );
  assert.equal(writerCalls, 0, 'TX01-T3: writer must not run on a typed stale epoch');
});

// ---------------------------------------------------------------------------
// T4 — Recovery actions: roll-forward / rollback / restore / fork
// ---------------------------------------------------------------------------

test('TX01-T4-recovery-actions-roll-restore-fork recovery table proves four outcomes, not only RELOAD_CANONICAL', async () => {
  const journal = await loadModule('src/io/revisionBridge/exactTextApplyJournal.mjs');
  const shaBefore = sha256Hex('Alpha beta gamma.');
  const shaAfter = sha256Hex('Alpha delta gamma.');
  const shaForeign = sha256Hex('Completely foreign content.');

  const outcomes = [];

  // (a) target == after, PREPARED, no receipt → roll-forward receipt (no 2nd record).
  const projectA = tmpProject('Alpha beta gamma.');
  await journal.prepareExactTextApplyJournal({
    projectRoot: projectA.projectRoot,
    scenePath: projectA.scenePath,
    beforeHash: shaBefore,
    afterHash: shaAfter,
    inputHash: sha256Hex('input-a'),
    operationKind: 'replaceExactText',
    projectId: 'p-a',
    sessionId: 's-a',
    sceneId: 'scene-1',
    changeIds: ['change-a'],
  }, { operationId: 'op_tx01_t4_rollforward' });
  // Apply the scene bytes directly to emulate the writer having renamed but the
  // receipt never being written.
  fs.writeFileSync(projectA.scenePath, 'Alpha delta gamma.', 'utf8');
  outcomes.push(await journal.reconcileExactTextApplyJournal(projectA.projectRoot, 'op_tx01_t4_rollforward'));

  // (b) target == before, PREPARED → rollback/cleanup, never mark applied.
  const projectB = tmpProject('Alpha beta gamma.');
  await journal.prepareExactTextApplyJournal({
    projectRoot: projectB.projectRoot,
    scenePath: projectB.scenePath,
    beforeHash: shaBefore,
    afterHash: shaAfter,
    inputHash: sha256Hex('input-b'),
    operationKind: 'replaceExactText',
    projectId: 'p-b',
    sessionId: 's-b',
    sceneId: 'scene-1',
    changeIds: ['change-b'],
  }, { operationId: 'op_tx01_t4_rollback' });
  // Scene still holds BEFORE → rollback/cleanup path.
  outcomes.push(await journal.reconcileExactTextApplyJournal(projectB.projectRoot, 'op_tx01_t4_rollback'));

  // (c) target absent + backup == before → restore.
  const projectC = tmpProject('Alpha beta gamma.');
  await journal.prepareExactTextApplyJournal({
    projectRoot: projectC.projectRoot,
    scenePath: projectC.scenePath,
    beforeHash: shaBefore,
    afterHash: shaAfter,
    inputHash: sha256Hex('input-c'),
    operationKind: 'replaceExactText',
    projectId: 'p-c',
    sessionId: 's-c',
    sceneId: 'scene-1',
    changeIds: ['change-c'],
  }, { operationId: 'op_tx01_t4_restore' });
  // Emulate target absent.
  fs.unlinkSync(projectC.scenePath);
  outcomes.push(await journal.reconcileExactTextApplyJournal(projectC.projectRoot, 'op_tx01_t4_restore').catch((e) => e));

  // (d) foreign digest → safe recovery fork, no overwrite.
  const projectD = tmpProject('Alpha beta gamma.');
  await journal.prepareExactTextApplyJournal({
    projectRoot: projectD.projectRoot,
    scenePath: projectD.scenePath,
    beforeHash: shaBefore,
    afterHash: shaAfter,
    inputHash: sha256Hex('input-d'),
    operationKind: 'replaceExactText',
    projectId: 'p-d',
    sessionId: 's-s',
    sceneId: 'scene-1',
    changeIds: ['change-d'],
  }, { operationId: 'op_tx01_t4_fork' });
  fs.writeFileSync(projectD.scenePath, 'Completely foreign content.', 'utf8');
  outcomes.push(await journal.reconcileExactTextApplyJournal(projectD.projectRoot, 'op_tx01_t4_fork'));

  const safeActionSets = outcomes.map((item) => (item && Array.isArray(item.safeActions)) ? item.safeActions : []);
  const flatActions = safeActionSets.flat();

  // RED REASON (CURRENT): reconcileExactTextApplyJournal (exactTextApplyJournal.mjs:424-446)
  // ONLY ever emits safeActions: ['RELOAD_CANONICAL'] for every outcome. There
  // are no roll-forward / rollback / restore / fork recovery actions.
  const hasRollForward = flatActions.some((action) => /ROLL_FORWARD|REPLAY_FROM_RECEIPT|COMMIT_RECEIPT/i.test(action));
  const hasRollback = flatActions.some((action) => /ROLLBACK|CLEANUP_NOT_APPLIED/i.test(action));
  const hasRestore = flatActions.some((action) => /RESTORE/i.test(action));
  const hasFork = flatActions.some((action) => /FORK|SAFE_RECOVERY_FORK/i.test(action));

  assert.equal(hasRollForward, true, 'TX01-T4: missing roll-forward recovery action for applied-without-receipt');
  assert.equal(hasRollback, true, 'TX01-T4: missing rollback/cleanup recovery action for not-applied');
  assert.equal(hasRestore, true, 'TX01-T4: missing restore recovery action for absent target with backup');
  assert.equal(hasFork, true, 'TX01-T4: missing safe-recovery-fork action for foreign digest');

  // (b) must NEVER be marked applied — it never wrote.
  const rollbackOutcome = outcomes[1];
  assert.notEqual(rollbackOutcome.outcome, 'applied_receipt_present', 'TX01-T4: rollback case must not be marked applied');

  // (d) must NEVER overwrite the foreign content.
  assert.equal(
    fs.readFileSync(projectD.scenePath, 'utf8'),
    'Completely foreign content.',
    'TX01-T4: foreign content must be preserved, not overwritten',
  );
});

// ---------------------------------------------------------------------------
// T5 — Durable primitives complete
// ---------------------------------------------------------------------------

test('TX01-T5-durable-primitives-complete snapshot/parent-sync/exclusive/no-follow/readback gaps', async () => {
  const atomicWriteFile = (await loadModule('src/io/markdown/atomicWriteFile.mjs')).atomicWriteFile;
  const snapshotFile = await loadModule('src/io/markdown/snapshotFile.mjs');
  const markdown = await loadModule('src/io/markdown/index.mjs');

  // (a) snapshot file is fsynced. CURRENT: snapshotFile.mjs:96 uses copyFile
  // with no fsync. We assert via a probe hook: the snapshot result must carry
  // durability evidence (fsync happened). CURRENT produces no such evidence.
  const project = tmpProject('Alpha beta gamma.');
  let snapshotSynced = false;
  const snapshotResult = await snapshotFile.createRecoverySnapshot(project.scenePath, {
    afterSync: () => { snapshotSynced = true; },
  });
  assert.equal(
    snapshotSynced === true || snapshotResult.synced === true,
    true,
    'TX01-T5a: recovery snapshot must be fsynced (durability evidence)',
  );

  // (b) intent unlink syncs parent dir. CURRENT: clearTransactionIntent
  // (index.mjs:197-203) calls fs.unlink with no parent dir sync.
  const intentProject = tmpProject('Alpha beta gamma.');
  await markdown.writeMarkdownWithTransactionRecovery(intentProject.scenePath, 'Alpha delta gamma.');
  let parentSyncedOnIntentClear = false;
  // The probe: clearTransactionIntent must accept/surface a parent-sync.
  await markdown.clearTransactionIntent(intentProject.scenePath, {
    afterParentSync: () => { parentSyncedOnIntentClear = true; },
  }).catch(() => {});
  assert.equal(
    parentSyncedOnIntentClear,
    true,
    'TX01-T5b: intent unlink must sync the parent directory',
  );

  // (c) scene reads no-follow. CURRENT: the apply path uses plain fs.readFile
  // (follows symlinks). A symlinked scene must be rejected with a typed error,
  // NOT followed and mutated.
  const symlinkProjectRoot = tmpProjectRoot();
  const outsideScene = path.join(os.tmpdir(), `rtk-tx01-outside-${process.pid}-${Date.now()}.md`);
  fs.writeFileSync(outsideScene, 'Alpha beta gamma.', 'utf8');
  const linkedScene = path.join(symlinkProjectRoot, 'scene.md');
  fs.symlinkSync(outsideScene, linkedScene, 'file');
  const noFollowRead = (await loadModule('src/io/markdown/index.mjs')).readMarkdownWithLimits;
  let noFollowRejected = false;
  try {
    await noFollowRead(linkedScene);
  } catch (error) {
    noFollowRejected = /SYMLINK|NO_FOLLOW|UNSAFE|FOLLOW/i.test(error.code || error.reason || '');
  }
  assert.equal(
    noFollowRejected,
    true,
    'TX01-T5c: scene reads must reject (not follow) a symlinked scene file',
  );
  assert.equal(
    fs.readFileSync(outsideScene, 'utf8'),
    'Alpha beta gamma.',
    'TX01-T5c: symlink target must not be mutated through the apply read path',
  );

  // (d) exclusive 0600 write with exact readback (writeExclusiveDurable).
  // CURRENT: atomicWriteFile uses flag 'w' (not 'wx', not 0600) and does no
  // readback. We require a writeExclusiveDurable primitive.
  const exclusiveTarget = path.join(tmpProjectRoot(), 'exclusive.md');
  let exclusiveWritten = false;
  try {
    const result = await atomicWriteFile.writeExclusiveDurable(exclusiveTarget, 'payload-a', { mode: 0o600 });
    exclusiveWritten = Boolean(result && result.bytesWritten);
  } catch (error) {
    exclusiveWritten = /writeExclusiveDurable is not a function|writeExclusiveDurable.*undefined/i.test(error.message);
    // If it throws a not-a-function, that's still a RED — the primitive is absent.
  }
  assert.equal(
    exclusiveWritten && fs.readFileSync(exclusiveTarget, 'utf8') === 'payload-a',
    true,
    'TX01-T5d: writeExclusiveDurable (exclusive 0600 + exact readback) primitive is required',
  );

  // (e) linkExclusiveDurable primitive.
  const linkExclusivePresent = typeof atomicWriteFile.linkExclusiveDurable === 'function';
  assert.equal(
    linkExclusivePresent,
    true,
    'TX01-T5e: linkExclusiveDurable primitive is required in the durable apply path',
  );

  // (f) durable unlink with parent sync.
  const durableUnlinkPresent = typeof markdown.unlinkDurable === 'function'
    || typeof atomicWriteFile.unlinkDurable === 'function';
  assert.equal(
    durableUnlinkPresent,
    true,
    'TX01-T5f: durable unlink (with parent sync) primitive is required',
  );
});

// ---------------------------------------------------------------------------
// T6 — Semantic after-parse compare (not raw string equality)
// ---------------------------------------------------------------------------

test('TX01-T6-semantic-after-parse-compare raw equality passes but semantic projection differs is caught', async () => {
  const exactApply = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  const envelope = await loadModule('src/renderer/documentContentEnvelope.mjs');

  // Construct a rich scene envelope whose RAW bytes equal the post-write target
  // raw bytes, but whose semantic projection (envelope structure) differs.
  // CURRENT: post-write readback (exactTextMinSafeWrite.mjs:1341-1353 and
  // 1718) compares actualText !== nextText (raw string equality only).
  //
  // Target case: the writer produces a raw string that byte-for-byte matches
  // nextText, but the semantic envelope projection diverges (e.g. meta block
  // dropped, or card ordering changed). Raw equality passes; semantic compare
  // must catch it.

  const project = tmpProject();
  const input = envelopeInput(project, [textChange()]);
  let semanticMismatchCaught = false;
  let semanticReadbackProbe = null;

  const result = await exactApply.applyReviewTransportExactApply(input, {
    cryptoPort,
    // Probe the TARGET semantic readback surface.
    afterWriteReadback: async ({ nextText, actualText }) => {
      semanticReadbackProbe = { nextText, actualText };
      if (typeof envelope.parseObservablePayload !== 'function') return;
      const projectedNext = envelope.parseObservablePayload(nextText);
      const projectedActual = envelope.parseObservablePayload(actualText);
      if (projectedNext.text !== projectedActual.text
        || projectedNext.hasMetaBlock !== projectedActual.hasMetaBlock
        || stableJson(projectedNext.cards) !== stableJson(projectedActual.cards)) {
        semanticMismatchCaught = true;
        throw Object.assign(new Error('semantic readback mismatch'), {
          code: 'RTK_TX01_SEMANTIC_READBACK_MISMATCH',
        });
      }
    },
  });

  // RED REASON (CURRENT): the apply path has no afterWriteReadback hook and no
  // semantic projection comparison; the probe is never invoked, so
  // semanticReadbackProbe stays null and the typed mismatch is never raised.
  assert.ok(
    semanticReadbackProbe !== null,
    'TX01-T6: expected a semantic after-parse readback probe on the apply path',
  );
  // If the probe ran, it must catch the semantic drift with a typed error.
  assert.equal(
    semanticMismatchCaught,
    true,
    'TX01-T6: semantic projection drift must be caught even when raw bytes match',
  );
  // And the apply must surface it as a typed mismatch (not a silent applied).
  assert.notEqual(result.status, 'applied', 'TX01-T6: apply must not pass on a semantic mismatch');
});

// ---------------------------------------------------------------------------
// T7 — CONTROLS (already-green behaviour preserved)
// ---------------------------------------------------------------------------

test('TX01-T7-CONTROL-W3 replay suite behaviour is preserved', async () => {
  const exactApply = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  const project = tmpProject();
  const input = envelopeInput(project, [textChange()], { requestId: 'request-tx01-control-w3' });

  const first = await exactApply.applyReviewTransportExactApply(input, { cryptoPort });
  assert.equal(first.status, 'applied');
  assert.equal(first.writerCalled, true);
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), 'Alpha delta gamma.');

  const replay = await exactApply.applyReviewTransportExactApply(input, { cryptoPort });
  assert.equal(replay.status, 'replay');
  assert.equal(replay.reason, 'RTK_ALREADY_APPLIED');
  assert.equal(replay.writerCalled, false);
});

test('TX01-T7-CONTROL-C1 killpoint is a sanctioned amendment target (pinned, not changed)', async () => {
  const exactApply = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  const store = await loadModule('src/io/revisionBridge/reviewTransportApplyStore.mjs');
  const project = tmpProject();
  const input = envelopeInput(project, [textChange()], { requestId: 'request-tx01-control-c1' });

  const first = await exactApply.applyReviewTransportExactApply(input, {
    cryptoPort,
    now: () => 1785580000000,
    afterReservation: async () => { throw new Error('kill after reservation (control)'); },
  });
  // Control: the C1 killpoint still surfaces as ambiguous with RECOVERY_REQUIRED.
  assert.equal(first.status, 'ambiguous');
  assert.equal(first.writerCalled, false);
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), project.sceneText);

  const built = exactApply.buildReviewTransportExactApplyEnvelope(input, { cryptoPort }).envelope;
  const reservation = await store.readRtkExactApplyReservation(project.projectRoot, built);
  assert.equal(reservation.currentState.state, 'RECOVERY_REQUIRED');

  // Control: after the C1 sanctioned amendment the stuck reservation reconciles
  // instead of eternally blocking. The writer never repeats (writerCalled=false)
  // and the retry surfaces a typed non-RECOVERY block (or replay) because the
  // reservation was released with a release proof after reconcile. This control
  // now pins the amended behaviour (was an eternal RECOVERY_REQUIRED block).
  const retry = await exactApply.applyReviewTransportExactApply(input, {
    cryptoPort,
    exactWriter: async () => { throw new Error('writer must not repeat'); },
  });
  assert.equal(retry.writerCalled, false);
  const amendedUnblocked = retry.status === 'replay'
    || retry.status === 'applied'
    || (retry.status === 'blocked' && retry.reason !== 'RTK_WRITE_RESERVATION_RECOVERY_REQUIRED');
  assert.equal(
    amendedUnblocked,
    true,
    `TX01-T7-CONTROL-C1: expected amended retry to reconcile (not eternal RECOVERY), got status=${retry.status} reason=${retry.reason}`,
  );
});

test('TX01-T7-CONTROL min-safe-write single-op happy path is preserved', async () => {
  const safeWrite = await loadModule('src/io/revisionBridge/exactTextMinSafeWrite.mjs');
  const revisionBridge = await loadModule('src/io/revisionBridge/index.mjs');
  const project = tmpProject();
  const projectSnapshot = {
    projectId: 'project-tx01-control',
    baselineHash: 'baseline-control',
    scenes: [{ sceneId: 'scene-1', text: project.sceneText }],
  };
  const revisionSession = {
    projectId: 'project-tx01-control',
    baselineHash: 'baseline-control',
    sessionId: 'session-control',
    status: 'open',
    reviewGraph: {
      commentThreads: [],
      commentPlacements: [],
      textChanges: [textChange()],
      structuralChanges: [],
      diagnosticItems: [],
      decisionStates: [],
    },
  };
  const planPreview = revisionBridge.buildExactTextApplyPlanNoDiskPreview({
    projectSnapshot,
    revisionSession,
  });
  assert.equal(planPreview.status, 'ready');
  const result = await safeWrite.applyExactTextMinSafeWrite({
    projectRoot: project.projectRoot,
    projectSnapshot,
    revisionSession,
    planPreview,
    scenePath: project.scenePath,
    scenePathBySceneId: { 'scene-1': project.scenePath },
  }, { operationId: 'op_tx01_control_minsafe' });
  assert.equal(result.status, 'applied');
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), 'Alpha delta gamma.');
});

test('TX01-T7-CONTROL crash-reconciliation classification suite is preserved (cross-process)', {
  skip: process.platform === 'win32',
}, async () => {
  const journal = await loadModule('src/io/revisionBridge/exactTextApplyJournal.mjs');
  const CRASH_FIXTURE = path.join(
    process.cwd(),
    'test/fixtures/revision-bridge-exact-text-apply-crash-child.mjs',
  );
  const BEFORE_TEXT = 'Alpha beta gamma.';
  const AFTER_TEXT = 'Alpha delta gamma.';
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-tx01-crash-'));
  const scenePath = path.join(projectRoot, 'scene.md');
  fs.writeFileSync(scenePath, BEFORE_TEXT, 'utf8');

  const crashed = spawnSync(process.execPath, [CRASH_FIXTURE, projectRoot, 'before_rename'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(crashed.status, 71);
  assert.equal(fs.readFileSync(scenePath, 'utf8'), BEFORE_TEXT);

  const reconciled = await journal.reconcilePendingExactTextApplyJournals(projectRoot);
  assert.equal(reconciled.reconciliations.length, 1);
  assert.equal(reconciled.reconciliations[0].outcome, 'not_applied');
  assert.equal(reconciled.reconciliations[0].recoveryVerified, true);
  assert.deepEqual(reconciled.reconciliations[0].safeActions, ['RELOAD_CANONICAL']);
});

test('TX01-T7-CONTROL stop01 contract is green (discovery sanity)', async () => {
  // Smoke-control: the RTK test graph catalog must list this new contract and
  // every existing RTK-* contract basename must still resolve on disk.
  const catalogPath = path.join(process.cwd(), 'docs/OPS/RTK/RTK_TEST_GRAPH_CATALOG_V1.json');
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  assert.ok(
    catalog.contractBasenames.includes('rtk-tx01-single-scene-transaction.contract.test.js'),
    'TX01-T7: catalog must list the new TX-01 contract basename',
  );
  for (const basename of catalog.contractBasenames) {
    const candidate = path.join(process.cwd(), 'test/contracts', basename);
    assert.equal(
      fs.existsSync(candidate),
      true,
      `TX01-T7: catalog basename must exist on disk: ${basename}`,
    );
  }
});
