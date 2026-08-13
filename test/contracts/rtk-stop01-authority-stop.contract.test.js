'use strict';

// STOP-01 Pass 1 — RED-FIRST contract tests.
//
// These tests freeze TARGET authority-stop behaviour for the review-transport
// exact apply contour. They are intentionally RED on CURRENT: every RED
// scenario fails for the expected defect reason (leak exists / new typed code
// absent / new field absent), never because of a harness bug. The two CONTROL
// scenarios (A3 RETURN_ANALYZED legit apply, B6 legit replay) are GREEN on
// CURRENT and must remain GREEN after the Pass 2 fix — they are the
// positive and no-regression guards.
//
// Implementation is forbidden in this pass.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

async function loadModule(relativePath) {
  return import(pathToFileURL(path.join(REPO_ROOT, relativePath)).href);
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
  return `sha256:${crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex')}`;
}

function sourceFenceToken(source) {
  const payload = {
    schemaVersion: 'yalken.sourceFence.token.v1',
    purpose: 'WRITE_SOURCE',
    projectId: source.projectId,
    rootId: source.rootId,
    documentId: source.documentId,
    canonicalRevision: source.canonicalRevision,
    workingRevision: source.workingRevision,
    sourceDigest: source.sourceDigest,
  };
  return { ...payload, fenceDigest: sha256Text(stableJson(payload)) };
}

function sourceFenceBinding({ commandId, sourceHash, rawHash, projectId, documentId }) {
  const source = {
    projectId,
    rootId: 'root-stop01',
    documentId,
    canonicalRevision: sourceHash,
    workingRevision: sourceHash,
    sourceDigest: rawHash,
  };
  const request = {
    schemaVersion: 'yalken.sourceFence.request.v1',
    purpose: 'WRITE_SOURCE',
    expected: source,
    current: { ...source, dirtyState: 'CLEAN' },
    dirtyPolicy: 'REQUIRE_CLEAN',
    authority: {
      decision: 'ALLOW',
      mayWrite: true,
      commandId,
    },
    fence: sourceFenceToken(source),
  };
  return {
    schemaVersion: 'yalken.rtk.round-authority-source-fence.v1',
    request,
    result: {
      schemaVersion: 'yalken.sourceFence.result.v1',
      ok: true,
      decision: 'ALLOW',
      code: 'YALKEN_SOURCE_FENCE_ALLOWED',
      reasons: [],
      observed: {
        purpose: 'WRITE_SOURCE',
        projectId,
        rootId: 'root-stop01',
        documentId,
        canonicalRevision: sourceHash,
        workingRevision: sourceHash,
        sourceDigest: rawHash,
        dirtyState: 'CLEAN',
        dirtyPolicy: 'REQUIRE_CLEAN',
      },
    },
  };
}

function makeRtkCryptoPort() {
  const rtk = require(path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'reviewTransportExactApply.mjs'));
  return rtk.createNodeRtkCryptoPort();
}

function registerCleanup(t, dirs) {
  t.after(() => {
    for (const dir of dirs) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    }
  });
}

// ---------------------------------------------------------------------------
// Group A fixtures (rtk-w3 exact apply envelope pattern).
// ---------------------------------------------------------------------------

function tmpProject(text = 'Alpha beta gamma.') {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-stop01-a-'));
  const scenePath = path.join(projectRoot, 'scene.md');
  fs.writeFileSync(scenePath, text, 'utf8');
  return { projectRoot, scenePath, sceneText: text };
}

function textChange({ changeId = 'change-beta', quote = 'beta', replacementText = 'delta' } = {}) {
  return {
    changeId,
    targetScope: { type: 'scene', id: 'scene-1' },
    match: { kind: 'exact', quote, prefix: '', suffix: '' },
    replacementText,
    createdAt: '2026-08-08T12:00:00.000Z',
  };
}

function writerInput(project, changes, overrides = {}) {
  const projectSnapshot = {
    projectId: 'project-stop01',
    baselineHash: 'baseline-stop01',
    scenes: [{ sceneId: 'scene-1', text: project.sceneText }],
  };
  const revisionSession = {
    projectId: 'project-stop01',
    baselineHash: 'baseline-stop01',
    sessionId: 'session-stop01',
    status: 'open',
    reviewGraph: {
      commentThreads: [],
      commentPlacements: [],
      textChanges: changes,
      structuralChanges: overrides.structuralChanges || [],
      diagnosticItems: [],
      decisionStates: [],
    },
  };
  return {
    projectRoot: project.projectRoot,
    projectSnapshot,
    revisionSession,
    reviewItems: changes,
    scenePath: project.scenePath,
    scenePathBySceneId: { 'scene-1': project.scenePath },
  };
}

function envelopeInput(project, changes, overrides = {}) {
  const sourceHash = sha256Text(`source:${project.sceneText}`);
  const rawHash = sha256Text(`raw:${project.sceneText}`);
  const commandId = overrides.commandId || 'cmd-stop01';
  const projectId = 'project-stop01';
  const documentId = changes[0]?.targetScope?.id || 'scene-1';
  return {
    callerRole: 'main',
    commandAuthority: {
      issuer: 'main',
      intent: 'rtk.exactApply',
      commandId,
    },
    roundId: overrides.roundId || 'round-stop01',
    requestId: overrides.requestId || 'request-stop01',
    exportIdentity: 'export-stop01',
    returnArtifactSha256: overrides.returnArtifactSha256 || sha256Text('return-stop01'),
    manifestDigest: sha256Text('manifest-stop01'),
    analysisDigest: sha256Text('analysis-stop01'),
    returnLifecycleState: overrides.returnLifecycleState || 'RETURN_ANALYZED',
    candidateDisposition: {
      textLane: 'RTK_EXACT_APPLICABLE',
      commentLane: 'RTK_COMMENT_UNSUPPORTED',
      priority: 'TEXT_BEFORE_COMMENT',
    },
    sourceIdentity: {
      sourceTokenDomain: 'SOURCE_TOKEN_DOMAIN_V1',
      writerTextDomain: 'WRITER_TEXT_DOMAIN_V1',
      projectId,
      rootId: 'root-stop01',
      documentId,
      canonicalRevision: sourceHash,
      workingRevision: sourceHash,
      revisionSha256: sourceHash,
      rawBytesSha256: rawHash,
    },
    currentIdentity: {
      projectId,
      rootId: 'root-stop01',
      documentId,
      canonicalRevision: sourceHash,
      workingRevision: sourceHash,
      revisionSha256: sourceHash,
      rawBytesSha256: rawHash,
    },
    sourceFence: sourceFenceBinding({ commandId, sourceHash, rawHash, projectId, documentId }),
    writerInput: writerInput(project, changes, overrides),
  };
}

function countingWriter(calls, receiptPayload) {
  return async (input, options) => {
    calls.count += 1;
    calls.input = input;
    calls.options = options;
    return {
      status: 'applied',
      applied: true,
      receipt: receiptPayload || { operationId: options?.operationId || 'op-stop01', scenePath: input?.scenePath },
    };
  };
}

function refusingWriter(calls) {
  return async () => {
    calls.count += 1;
    throw new Error('STOP01: writer must not be reached');
  };
}

// ===========================================================================
// GROUP A — lifecycle eligibility (F-17)
// ===========================================================================

test('STOP01-A1-QUARANTINED-never-reaches-writer', async (t) => {
  const rtk = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  const project = tmpProject();
  registerCleanup(t, [project.projectRoot]);
  const calls = { count: 0 };

  const result = await rtk.applyReviewTransportExactApply(
    envelopeInput(project, [textChange()], { returnLifecycleState: 'QUARANTINED' }),
    { exactWriter: countingWriter(calls) },
  );

  // TARGET: QUARANTINED is recovery-quarantined; it must be blocked with a
  // typed eligibility code before the writer is ever admitted.
  assert.equal(calls.count, 0, 'QUARANTINED must not reach the writer');
  assert.equal(result.status, 'blocked');
  assert.equal(result.code, 'RTK_APPLY_STATE_NOT_ELIGIBLE');
  assert.equal(result.writerCalled, false);
});

for (const state of ['TERMINAL']) {
  test(`STOP01-A2-${state}-never-reaches-writer`, async (t) => {
    const rtk = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
    const project = tmpProject();
    registerCleanup(t, [project.projectRoot]);
    const calls = { count: 0 };

    const result = await rtk.applyReviewTransportExactApply(
      envelopeInput(project, [textChange()], { returnLifecycleState: state }),
      { exactWriter: countingWriter(calls) },
    );

    // TARGET: TERMINAL is a non-applicable terminal; writer must not run.
    assert.equal(calls.count, 0, `${state} must not reach the writer`);
    assert.equal(result.status, 'blocked');
    assert.equal(result.code, 'RTK_APPLY_STATE_NOT_ELIGIBLE');
    assert.equal(result.writerCalled, false);
  });
}

for (const state of ['OPEN_FOR_RETURN', 'RETURN_ADMITTED', 'RECOVERY_REQUIRED', 'DRAFT_EXPORT_INTENT']) {
  test(`STOP01-A2-${state}-blocked-with-typed-eligibility-code`, async (t) => {
    const rtk = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
    const project = tmpProject();
    registerCleanup(t, [project.projectRoot]);
    const calls = { count: 0 };

    const result = await rtk.applyReviewTransportExactApply(
      envelopeInput(project, [textChange()], { returnLifecycleState: state }),
      { exactWriter: refusingWriter(calls) },
    );

    // These states are already blocked on CURRENT, but with the generic
    // RTK_WRITE_PRECONDITION_FAILED code. TARGET requires the typed
    // RTK_APPLY_STATE_NOT_ELIGIBLE authority-stop code.
    assert.equal(calls.count, 0, `${state} must not reach the writer`);
    assert.equal(result.status, 'blocked');
    assert.equal(result.code, 'RTK_APPLY_STATE_NOT_ELIGIBLE', `${state} must use the typed eligibility code, not a generic precondition failure`);
    assert.equal(result.writerCalled, false);
  });
}

test('STOP01-A3-CONTROL-RETURN_ANALYZED-legit-apply-still-works', async (t) => {
  const rtk = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  const project = tmpProject();
  registerCleanup(t, [project.projectRoot]);

  const result = await rtk.applyReviewTransportExactApply(
    envelopeInput(project, [textChange()], { returnLifecycleState: 'RETURN_ANALYZED' }),
  );

  // Positive control: RETURN_ANALYZED is the only applicable state and must
  // remain a working legit apply path after the fix.
  assert.equal(result.status, 'applied');
  assert.equal(result.applied, true);
  assert.equal(result.writerCalled, true);
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), 'Alpha delta gamma.');
});

// ===========================================================================
// GROUP B — forged outcome replay binding (F-18)
// ===========================================================================

const OUTCOME_DIR_SEGMENTS = ['backups', 'revision-bridge-rtk-apply-outcomes'];
const EFFECT_INDEX_DIR_SEGMENTS = ['backups', 'revision-bridge-rtk-apply-outcome-effects'];

function hexOf(signedHash) {
  return String(signedHash).replace(/^sha256:/u, '');
}

function preseedOutcomeRecord(projectRoot, requestKey, record) {
  const dir = path.join(projectRoot, ...OUTCOME_DIR_SEGMENTS);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${hexOf(requestKey)}.json`), `${JSON.stringify(record, null, 2)}\n`);
}

function preseedEffectIndex(projectRoot, effectKey, index) {
  const dir = path.join(projectRoot, ...EFFECT_INDEX_DIR_SEGMENTS);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${hexOf(effectKey)}.json`), `${JSON.stringify(index, null, 2)}\n`);
}

async function loadApplyCore() {
  return loadModule('src/io/revisionBridge/reviewTransportApplyCore.mjs');
}

async function makeEnvelopeAndRecord(project, inputOverrides, writerResult, port) {
  const core = await loadApplyCore();
  const input = envelopeInput(project, [textChange()], inputOverrides);
  const built = core.buildRtkExactApplyCommandEnvelope(input, { cryptoPort: port });
  const envelope = built.envelope;
  const record = core.buildRtkExactApplyOutcomeRecord(envelope, writerResult, { cryptoPort: port });
  return { input, envelope, record };
}

const APPLIED_ONCE_WRITER_RESULT = {
  status: 'applied',
  applied: true,
  receipt: { operationId: 'op-stop01', scenePath: '/tmp/scene.md', bytesWritten: 32 },
};

const EFFECT_INDEX_SCHEMA = 'yalken.rtk.exact-apply-outcome-effect-index.v1';

function buildEffectIndex(record) {
  const unsigned = {
    schemaVersion: EFFECT_INDEX_SCHEMA,
    indexKind: 'same-round-effect',
    roundId: record.roundId,
    requestKey: record.requestKey,
    effectKey: record.effectKey,
    envelopeDigest: record.envelopeDigest,
    outcomeDigest: record.outcomeDigest,
  };
  return { ...unsigned, indexDigest: cryptoPort.sha256Json(unsigned) };
}

test('STOP01-B1-forged-envelopeDigest-must-not-replay', async (t) => {
  const rtk = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  const port = makeRtkCryptoPort();
  const project = tmpProject();
  registerCleanup(t, [project.projectRoot]);
  const { input, record } = await makeEnvelopeAndRecord(project, {}, APPLIED_ONCE_WRITER_RESULT, port);

  // Forge: same requestKey, but envelopeDigest bound to a different envelope.
  const forged = { ...record, envelopeDigest: sha256Text('stop01-forged-envelope') };
  preseedOutcomeRecord(project.projectRoot, record.requestKey, forged);

  const calls = { count: 0 };
  const result = await rtk.applyReviewTransportExactApply(input, { cryptoPort: port, exactWriter: refusingWriter(calls) });

  // TARGET: outcome binding must reject a record whose envelopeDigest does not
  // match the live envelope, instead of treating it as a legitimate replay.
  assert.notEqual(result.status, 'replay', 'forged envelopeDigest must not be accepted as replay');
  assert.equal(result.code, 'RTK_APPLY_OUTCOME_BINDING_INVALID');
  assert.equal(calls.count, 0);
});

test('STOP01-B2-NOT_APPLIED-outcome-must-not-replay', async (t) => {
  const rtk = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  const port = makeRtkCryptoPort();
  const project = tmpProject();
  registerCleanup(t, [project.projectRoot]);
  const { input, record } = await makeEnvelopeAndRecord(project, {}, APPLIED_ONCE_WRITER_RESULT, port);

  // Forge: the recorded outcome claims the apply never happened.
  const forged = {
    ...record,
    status: 'NOT_APPLIED',
    reason: 'RTK_WRITE_PRECONDITION_FAILED',
    writerReceipt: null,
  };
  preseedOutcomeRecord(project.projectRoot, record.requestKey, forged);

  const calls = { count: 0 };
  const result = await rtk.applyReviewTransportExactApply(input, { cryptoPort: port, exactWriter: refusingWriter(calls) });

  // TARGET: a NOT_APPLIED record cannot authorise an ALREADY_APPLIED replay.
  assert.notEqual(result.status, 'replay', 'NOT_APPLIED outcome must not be accepted as replay');
  assert.equal(result.code, 'RTK_APPLY_OUTCOME_BINDING_INVALID');
  assert.equal(calls.count, 0);
});

test('STOP01-B3-tampered-outcomeDigest-must-not-replay', async (t) => {
  const rtk = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  const port = makeRtkCryptoPort();
  const project = tmpProject();
  registerCleanup(t, [project.projectRoot]);
  const { input, record } = await makeEnvelopeAndRecord(project, {}, APPLIED_ONCE_WRITER_RESULT, port);

  // Forge: outcomeDigest no longer recomputes from the record contents.
  const forged = { ...record, outcomeDigest: `sha256:${'0'.repeat(64)}` };
  preseedOutcomeRecord(project.projectRoot, record.requestKey, forged);

  const calls = { count: 0 };
  const result = await rtk.applyReviewTransportExactApply(input, { cryptoPort: port, exactWriter: refusingWriter(calls) });

  // TARGET: outcome binding must recompute and reject a tampered outcomeDigest.
  assert.notEqual(result.status, 'replay', 'tampered outcomeDigest must not be accepted as replay');
  assert.equal(result.code, 'RTK_APPLY_OUTCOME_BINDING_INVALID');
  assert.equal(calls.count, 0);
});

test('STOP01-B4-APPLIED_ONCE-without-writerReceipt-must-not-replay', async (t) => {
  const rtk = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  const port = makeRtkCryptoPort();
  const project = tmpProject();
  registerCleanup(t, [project.projectRoot]);
  const { input, record } = await makeEnvelopeAndRecord(project, {}, APPLIED_ONCE_WRITER_RESULT, port);

  // Forge: APPLIED_ONCE but the writer receipt is missing.
  const forged = { ...record, status: 'APPLIED_ONCE', writerReceipt: null };
  preseedOutcomeRecord(project.projectRoot, record.requestKey, forged);

  const calls = { count: 0 };
  const result = await rtk.applyReviewTransportExactApply(input, { cryptoPort: port, exactWriter: refusingWriter(calls) });

  // TARGET: APPLIED_ONCE without a writer receipt is not a valid binding.
  assert.notEqual(result.status, 'replay', 'APPLIED_ONCE without writerReceipt must not be accepted as replay');
  assert.equal(result.code, 'RTK_APPLY_OUTCOME_BINDING_INVALID');
  assert.equal(calls.count, 0);
});

test('STOP01-B5-forged-effect-index-must-not-replay', async (t) => {
  const rtk = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  const port = makeRtkCryptoPort();
  const project = tmpProject();
  registerCleanup(t, [project.projectRoot]);

  // Two envelopes that share effect identity (round/lifecycle/identity/writer
  // digest) but differ in request identity (requestId/commandId). The forged
  // outcome is seeded under the secondary requestKey, with an effect index
  // pointing the shared effectKey at it.
  const { input: realInput } = await makeEnvelopeAndRecord(
    project, { requestId: 'request-real', commandId: 'cmd-real' }, APPLIED_ONCE_WRITER_RESULT, port,
  );
  const { envelope: forgedEnvelope, record: forgedRecord } = await makeEnvelopeAndRecord(
    project, { requestId: 'request-forged', commandId: 'cmd-forged' }, APPLIED_ONCE_WRITER_RESULT, port,
  );

  preseedOutcomeRecord(project.projectRoot, forgedEnvelope.requestKey, forgedRecord);
  preseedEffectIndex(project.projectRoot, forgedEnvelope.effectKey, buildEffectIndex(forgedRecord));

  const calls = { count: 0 };
  const result = await rtk.applyReviewTransportExactApply(realInput, { cryptoPort: port, exactWriter: refusingWriter(calls) });

  // TARGET: a forged same-round effect index must not produce a replay for a
  // request whose own outcome was never recorded.
  assert.notEqual(result.status, 'replay', 'forged effect index must not be accepted as same-round replay');
  assert.equal(result.code, 'RTK_APPLY_OUTCOME_BINDING_INVALID');
  assert.equal(calls.count, 0);
});

test('STOP01-B6-CONTROL-legit-replay-still-works', async (t) => {
  const rtk = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  const project = tmpProject();
  registerCleanup(t, [project.projectRoot]);
  const input = envelopeInput(project, [textChange()]);

  const first = await rtk.applyReviewTransportExactApply(input);
  assert.equal(first.status, 'applied');
  assert.equal(first.writerCalled, true);
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), 'Alpha delta gamma.');

  const calls = { count: 0 };
  const replay = await rtk.applyReviewTransportExactApply(input, { exactWriter: refusingWriter(calls) });

  // No-regression control: a real prior apply must still replay cleanly with
  // zero writer calls after the binding tightening.
  assert.equal(replay.status, 'replay');
  assert.equal(replay.reason, 'RTK_ALREADY_APPLIED');
  assert.equal(replay.writerCalled, false);
  assert.equal(calls.count, 0);
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), 'Alpha delta gamma.');
});

// B7 isolates the status dimension of the replay binding. The pre-existing B2
// forgery is MULTI-invalid: it flips status AND nulls the writerReceipt, so the
// receipt check (store verifyOutcomeRecordIntegrity) rejects B2 even if the
// status check were removed — B2 masks the status check rather than testing it.
// B7 mutates ONLY status (NOT_APPLIED) on a genuinely-applied outcome record,
// leaves the real canonical writer receipt untouched, and RECOMPUTES every
// dependent digest (record.outcomeDigest and the effect index outcome/index
// digests) so that every other binding check still passes. The status check is
// the single remaining defence: with it present the forgery is rejected as
// RTK_APPLY_OUTCOME_BINDING_INVALID; with it removed the request binding would
// pass and yield a forged replay (AMDG transparency: this test makes the
// defence load-bearing and explicit).
test('STOP01-B7-status-only-forgery-must-not-replay', async (t) => {
  const rtk = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  const port = makeRtkCryptoPort();
  const project = tmpProject();
  registerCleanup(t, [project.projectRoot]);
  const input = envelopeInput(project, [textChange()]);

  // 1. Real apply (as in the B6 control) produces a genuine APPLIED_ONCE
  //    outcome record plus a same-round effect index on disk, backed by a real
  //    canonical writer receipt. This guarantees every binding field but status
  //    is independently valid.
  const first = await rtk.applyReviewTransportExactApply(input, { cryptoPort: port });
  assert.equal(first.status, 'applied');
  assert.equal(first.writerCalled, true);
  const realRecord = first.outcomeRecord;
  assert.ok(realRecord && realRecord.status === 'APPLIED_ONCE', 'baseline apply must produce an APPLIED_ONCE record');

  // 2. Mutate ONLY the status/reason fields of the record (keep the real
  //    writerReceipt and all identity fields), then recompute the record's
  //    outcomeDigest with the SAME canonical sha256Json over the record body
  //    minus outcomeDigest, and overwrite the record file in place.
  const requestKeyHex = hexOf(realRecord.requestKey);
  const recordPath = path.join(project.projectRoot, ...OUTCOME_DIR_SEGMENTS, `${requestKeyHex}.json`);
  const forgedRecord = {
    ...realRecord,
    status: 'NOT_APPLIED',
    reason: 'RTK_WRITE_PRECONDITION_FAILED',
  };
  const recordBody = { ...forgedRecord };
  delete recordBody.outcomeDigest;
  forgedRecord.outcomeDigest = port.sha256Json(recordBody);
  fs.writeFileSync(recordPath, `${JSON.stringify(forgedRecord, null, 2)}\n`, 'utf8');

  // 3. Update the effect index to track the forged outcome: set its
  //    outcomeDigest to the forged record's digest and recompute indexDigest
  //    the same way (body minus indexDigest), then overwrite the index file.
  const effectKeyHex = hexOf(realRecord.effectKey);
  const indexPath = path.join(project.projectRoot, ...EFFECT_INDEX_DIR_SEGMENTS, `${effectKeyHex}.json`);
  const existingIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const updatedIndex = { ...existingIndex, outcomeDigest: forgedRecord.outcomeDigest };
  const indexBody = { ...updatedIndex };
  delete indexBody.indexDigest;
  updatedIndex.indexDigest = port.sha256Json(indexBody);
  fs.writeFileSync(indexPath, `${JSON.stringify(updatedIndex, null, 2)}\n`, 'utf8');

  // 4. Replay call with a refusing writer. The status check must reject the
  //    single-dimension forgery before any replay is admitted.
  const calls = { count: 0 };
  const replay = await rtk.applyReviewTransportExactApply(input, { cryptoPort: port, exactWriter: refusingWriter(calls) });

  assert.notEqual(replay.status, 'replay', 'a status-only forgery must not be accepted as replay');
  assert.equal(replay.code, 'RTK_APPLY_OUTCOME_BINDING_INVALID', 'status-only forgery must be rejected by the status binding check');
  assert.equal(calls.count, 0, 'writer must never be reached for a forged outcome');
});

// ===========================================================================
// GROUP C — caller lifecycle / booleans restated as authority
// ===========================================================================

// --- C1 router fixtures (full-manuscript return router contract pattern) ---

function routerCryptoPort() {
  return {
    sha256Text(value) {
      return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
    },
    sha256Json(value) {
      return `sha256:${this.sha256Text(stableJson(value))}`;
    },
    hmacSha256Json(value, secret) {
      return `hmac-sha256:${crypto.createHmac('sha256', String(secret || '')).update(stableJson(value), 'utf8').digest('hex')}`;
    },
    byteLength(value) {
      return Buffer.byteLength(String(value || ''), 'utf8');
    },
  };
}

function makeRouterSource() {
  const { buildFullManuscriptDocxReviewPacketSource } = require(
    path.join(REPO_ROOT, 'src', 'export', 'docx', 'fullManuscriptDocxReviewPacketSource.js'),
  );
  return buildFullManuscriptDocxReviewPacketSource({
    projectId: 'project-stop01-router',
    projectRoot: '/project-stop01',
    manifestPath: '/project-stop01/manifest.json',
    scenes: [
      {
        sceneId: 'roman/preface.md',
        scenePath: '/project-stop01/roman/preface.md',
        text: 'The artist is the creator of beautiful things.',
        order: 0,
      },
    ],
  }, {
    roundIdHex: '1234567890abcdef1234567890abcdef',
    keyIdHex: 'abcdef1234567890abcdef1234567890',
    hmacSecret: 'local-secret-stop01-test-only',
    cryptoPort: routerCryptoPort(),
  });
}

function routerReturnedAuthority(source, overrides = {}) {
  return {
    scope: 'full-manuscript',
    projectId: 'project-stop01-router',
    roundId: source.localAuthorityCapsule.roundId,
    exportId: source.localAuthorityCapsule.exportIdentity,
    fullBookRawSha256: source.exportCapsule.fullBookRawSha256,
    orderedSceneIds: source.exportCapsule.orderedSceneIds,
    ...overrides,
  };
}

function routerReturnIntakeProof(source, operations, overrides = {}) {
  const cp = routerCryptoPort();
  const proof = {
    status: 'authenticated-return-ir-ready',
    authenticated: true,
    returnedArtifactSha256: cp.sha256Json({ returned: source.localAuthorityCapsule.roundId }),
    coreManifestDigest: source.localAuthorityCapsule.coreManifestDigest,
    yrtk2Verification: {
      code: 'RTK_RETURN_INTAKE_YRTK2_VERIFIED',
      coreManifestDigest: source.localAuthorityCapsule.coreManifestDigest,
      keyIdHex: source.localAuthorityCapsule.yrtk2.keyIdHex,
      roundIdHex: source.localAuthorityCapsule.yrtk2.roundIdHex,
      tokenDigest: source.localAuthorityCapsule.yrtk2.tokenDigest,
    },
    parserProfileDigest: cp.sha256Json({ parser: 'stop01-parser-v2' }),
    analysisDigest: cp.sha256Json({ analysis: operations.map((op) => op.id) }),
    reviewIrDigest: cp.sha256Json({ reviewIr: operations.map((op) => op.id) }),
    operationSource: 'parsed-review-ir',
    operationIds: operations.map((op) => op.id),
    ...overrides,
  };
  const { buildFullManuscriptReturnIntakeProofBindingDigest } = require(
    path.join(REPO_ROOT, 'src', 'export', 'docx', 'fullManuscriptDocxReviewReturnRouter.js'),
  );
  if (overrides.mainIntakeAuthorityDigest === undefined) {
    proof.mainIntakeAuthorityDigest = buildFullManuscriptReturnIntakeProofBindingDigest({
      proof,
      localAuthority: source.localAuthorityCapsule,
      operations,
    });
  }
  return proof;
}

function routerReplaceOperation(id, quote) {
  return {
    id,
    family: 'tracked_text_edit',
    sceneId: 'roman/preface.md',
    anchor: { sceneId: 'roman/preface.md', selectedText: quote },
    semanticIntent: { kind: 'replace', replacementText: `replacement-${id}` },
  };
}

test('STOP01-C1-router-quarantined-round-no-apply-plan', () => {
  const { buildFullManuscriptReviewReturnApplyPlan } = require(
    path.join(REPO_ROOT, 'src', 'export', 'docx', 'fullManuscriptDocxReviewReturnRouter.js'),
  );
  const source = makeRouterSource();
  const operation = routerReplaceOperation('op-preface', 'beautiful things');

  const plan = buildFullManuscriptReviewReturnApplyPlan({
    projectId: 'project-stop01-router',
    localAuthorityCapsule: source.localAuthorityCapsule,
    returnedAuthority: routerReturnedAuthority(source, { lifecycleState: 'QUARANTINED' }),
    operations: [operation],
    returnIntakeProof: routerReturnIntakeProof(source, [operation]),
  });

  // TARGET: a QUARANTINED round must not yield an apply plan. The router must
  // refuse before producing scene commands that hardcode RETURN_ANALYZED.
  assert.equal(plan.ok, false, 'router must not build an apply plan for a QUARANTINED round');
  assert.ok(
    /BLOCKED|NOT_ELIGIBLE|RTK_APPLY_STATE_NOT_ELIGIBLE/u.test(plan.code || ''),
    `unexpected router code: ${plan.code}`,
  );
  assert.ok(!Array.isArray(plan.sceneCommands) || plan.sceneCommands.length === 0, 'no scene commands may be emitted for a QUARANTINED round');
});

test('STOP01-C2a-kernel-analysis-only', async () => {
  const core = await loadModule('src/io/revisionBridge/reviewTransportWordSemanticKernelV4.mjs');
  const cp = makeRtkCryptoPort();

  // Fabricated caller authority: all booleans true, YRTK2 verified, a minimal
  // supported insert/delete text-revision pair, no moves/structure/opaque.
  const verdict = core.evaluateWordV4MinimalSemanticKernel({
    reviewIr: {
      textRevisions: [
        { operation: 'delete', nativeRevisionId: 'del:1', text: 'old', textDigest: cp.sha256Text('delete:old'), replacementGroupId: 'grp-1' },
        { operation: 'insert', nativeRevisionId: 'ins:1', text: 'new', textDigest: cp.sha256Text('insert:new'), replacementGroupId: 'grp-1' },
      ],
      moveRevisions: [],
      propertyRevisions: [],
      structureChanges: [],
      formattingDeltas: [],
      commentThreads: [],
      opaqueUnsupported: [],
    },
    exactAuthority: {
      validSignedLocator: true,
      sceneRevisionUnchanged: true,
      rawSha256Unchanged: true,
      uniqueTarget: true,
      nonOverlapping: true,
      allRelevantXmlSemanticsAccounted: true,
    },
    yrtk2Verification: { ok: true, coreManifestDigest: sha256Text('core-manifest-stop01') },
  }, { cryptoPort: cp });

  // TARGET: the E04 kernel is analysis-only. It must not restate caller-forged
  // booleans as an exactSemanticReady authority flag; instead it must declare
  // analysisOnly and omit exactSemanticReady entirely.
  assert.equal(verdict.exactSemanticReady, undefined, 'kernel must not emit caller-fabricated exactSemanticReady');
  assert.equal(verdict.analysisOnly, true, 'kernel must declare analysisOnly');
});

test('STOP01-C2b-e05-consumer-requires-analysis-only-kernel', async () => {
  const core = await loadModule('src/io/revisionBridge/reviewTransportSourceMapUniqueDiffV4.mjs');
  const cp = makeRtkCryptoPort();

  const baselineText = 'alpha beta gamma';
  const baselineBlock = {
    sceneId: 'scene-a',
    blockId: 'block-1',
    text: baselineText,
    rawSha256: cp.sha256Text(baselineText),
  };
  const changedText = 'alpha EDITED gamma';
  const row = core.buildWordV4SourceMapRow({
    wordSegmentId: 'seg-beta',
    sceneId: 'scene-a',
    blockId: 'block-1',
    segmentId: 'beta',
    blockText: baselineText,
    start: 6,
    end: 10,
  }, { cryptoPort: cp }).row;
  const sourceMap = {
    schemaVersion: core.RTK_WORD_V4_SOURCEMAP_SCHEMA,
    digest: core.computeWordV4SourceMapDigest({ rows: [row] }, { cryptoPort: cp }).digest,
    rows: [row],
  };

  const result = core.evaluateWordV4SourceMapUniqueDiff({
    projections: {
      B: { blocks: [baselineBlock] },
      O: { blocks: [{ sceneId: 'scene-a', blockId: 'block-1', text: changedText, rawSha256: cp.sha256Text(changedText) }] },
      C: { blocks: [{ sceneId: 'scene-a', blockId: 'block-1', text: changedText, rawSha256: cp.sha256Text(changedText) }] },
      G: { textRevisions: [] },
    },
    sourceMap,
    // Fabricated kernel result: exactSemanticReady true but no analysisOnly.
    kernelResult: { exactSemanticReady: true, semantics: { text: [] } },
  }, { cryptoPort: cp });

  // TARGET: the E05 consumer must refuse a kernel result that restates caller
  // authority without an explicit analysisOnly declaration.
  assert.ok(
    result.reasons.some((r) => /ANALYSIS_ONLY|analysisOnly/u.test(r.code) || /ANALYSIS_ONLY|analysisOnly/u.test(r.field || '')),
    'E05 must reject a kernel result lacking analysisOnly authority',
  );
  assert.equal(result.exactEffectReady, false, 'E05 must not certify exact effects on a fabricated caller-authority kernel result');
});
