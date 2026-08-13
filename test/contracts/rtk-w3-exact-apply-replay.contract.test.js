const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  return import(pathToFileURL(path.join(process.cwd(), relativePath)).href);
}

function sha256Text(text) {
  return `sha256:${crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex')}`;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
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
  return {
    ...payload,
    fenceDigest: sha256Text(stableJson(payload)),
  };
}

function sourceFenceBinding({ commandId, project, sourceHash, rawHash }) {
  const source = {
    projectId: 'project-w3',
    rootId: 'root-w3',
    documentId: 'scene-1',
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
        projectId: 'project-w3',
        rootId: 'root-w3',
        documentId: 'scene-1',
        canonicalRevision: sourceHash,
        workingRevision: sourceHash,
        sourceDigest: rawHash,
        dirtyState: 'CLEAN',
        dirtyPolicy: 'REQUIRE_CLEAN',
      },
    },
  };
}

function tmpProject(text = 'Alpha beta gamma.') {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-w3-exact-'));
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
    createdAt: '2026-07-29T12:00:00.000Z',
  };
}

function writerInput(project, changes, overrides = {}) {
  const projectSnapshot = {
    projectId: 'project-w3',
    baselineHash: 'baseline-w3',
    scenes: [{ sceneId: 'scene-1', text: project.sceneText }],
  };
  const revisionSession = {
    projectId: 'project-w3',
    baselineHash: 'baseline-w3',
    sessionId: 'session-w3',
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
  const commandId = overrides.commandId || 'cmd-w3-1';
  return {
    callerRole: overrides.callerRole || 'main',
    commandAuthority: {
      issuer: overrides.authorityIssuer || 'main',
      intent: 'rtk.exactApply',
      commandId,
    },
    roundId: overrides.roundId || 'round-w3',
    requestId: overrides.requestId || 'request-w3-1',
    exportIdentity: 'export-w3',
    returnArtifactSha256: overrides.returnArtifactSha256 || sha256Text('return-one'),
    manifestDigest: sha256Text('manifest-one'),
    analysisDigest: sha256Text('analysis-one'),
    returnLifecycleState: overrides.returnLifecycleState || 'RETURN_ANALYZED',
    candidateDisposition: {
      textLane: overrides.textLane || 'RTK_EXACT_APPLICABLE',
      commentLane: overrides.commentLane || 'RTK_COMMENT_UNSUPPORTED',
      priority: 'TEXT_BEFORE_COMMENT',
    },
    sourceIdentity: {
      sourceTokenDomain: 'SOURCE_TOKEN_DOMAIN_V1',
      writerTextDomain: 'WRITER_TEXT_DOMAIN_V1',
      projectId: 'project-w3',
      rootId: 'root-w3',
      documentId: 'scene-1',
      canonicalRevision: overrides.sourceRevisionSha256 || sourceHash,
      workingRevision: overrides.sourceRevisionSha256 || sourceHash,
      revisionSha256: overrides.sourceRevisionSha256 || sourceHash,
      rawBytesSha256: overrides.sourceRawBytesSha256 || rawHash,
    },
    currentIdentity: {
      projectId: 'project-w3',
      rootId: 'root-w3',
      documentId: 'scene-1',
      canonicalRevision: overrides.currentRevisionSha256 || sourceHash,
      workingRevision: overrides.currentRevisionSha256 || sourceHash,
      revisionSha256: overrides.currentRevisionSha256 || sourceHash,
      rawBytesSha256: overrides.currentRawBytesSha256 || rawHash,
    },
    sourceFence: Object.prototype.hasOwnProperty.call(overrides, 'sourceFence')
      ? overrides.sourceFence
      : sourceFenceBinding({ commandId, project, sourceHash, rawHash }),
    commentLane: overrides.commentLaneItems || [],
    writerInput: writerInput(project, changes, overrides),
  };
}

test('W3 exact apply writes once and request replay calls zero writers', async () => {
  const rtk = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  const project = tmpProject();
  const input = envelopeInput(project, [textChange()]);

  const first = await rtk.applyReviewTransportExactApply(input);
  assert.equal(first.status, 'applied');
  assert.equal(first.applied, true);
  assert.equal(first.writerCalled, true);
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), 'Alpha delta gamma.');

  const replay = await rtk.applyReviewTransportExactApply(input);
  assert.equal(replay.status, 'replay');
  assert.equal(replay.reason, 'RTK_ALREADY_APPLIED');
  assert.equal(replay.applied, false);
  assert.equal(replay.writerCalled, false);
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), 'Alpha delta gamma.');
});

test('W3 exact deletion uses empty replacementText only when explicit and guarded', async () => {
  const rtk = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  const project = tmpProject();
  const input = envelopeInput(project, [textChange({
    changeId: 'delete-beta',
    quote: 'beta ',
    replacementText: '',
  })]);

  const first = await rtk.applyReviewTransportExactApply(input);
  assert.equal(first.status, 'applied');
  assert.equal(first.applied, true);
  assert.equal(first.writerCalled, true);
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), 'Alpha gamma.');

  const replay = await rtk.applyReviewTransportExactApply(input);
  assert.equal(replay.status, 'replay');
  assert.equal(replay.reason, 'RTK_ALREADY_APPLIED');
  assert.equal(replay.writerCalled, false);
});

test('W3 missing replacementText is still blocked and cannot imply deletion', async () => {
  const rtk = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  const project = tmpProject();
  const missingReplacement = textChange({ changeId: 'missing-replacement', quote: 'beta' });
  delete missingReplacement.replacementText;

  const result = await rtk.applyReviewTransportExactApply(
    envelopeInput(project, [missingReplacement]),
  );

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_REPLACEMENT_REQUIRED');
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), project.sceneText);
});

test('W3 same-round semantic equivalent effect writes zero despite a different request artifact', async () => {
  const rtk = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  const project = tmpProject();
  const firstInput = envelopeInput(project, [textChange()], { requestId: 'request-a' });
  const secondInput = envelopeInput(project, [textChange()], {
    commandId: 'cmd-w3-2',
    requestId: 'request-b',
    returnArtifactSha256: sha256Text('return-byte-different-semantic-same'),
  });

  assert.equal((await rtk.applyReviewTransportExactApply(firstInput)).status, 'applied');
  const replay = await rtk.applyReviewTransportExactApply(secondInput);
  assert.equal(replay.status, 'replay');
  assert.equal(replay.replayKind, 'same_round_effect');
  assert.equal(replay.writerCalled, false);
});

test('W3 cross-round safety does not claim global semantic dedupe', async () => {
  const rtk = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  const project = tmpProject();
  const firstInput = envelopeInput(project, [textChange()], { roundId: 'round-a', requestId: 'request-a' });
  const laterRoundInput = envelopeInput(project, [textChange()], {
    commandId: 'cmd-w3-later',
    roundId: 'round-b',
    requestId: 'request-b',
  });

  assert.equal((await rtk.applyReviewTransportExactApply(firstInput)).status, 'applied');
  const later = await rtk.applyReviewTransportExactApply(laterRoundInput);
  assert.equal(later.status, 'blocked');
  assert.equal(later.writerCalled, true);
  assert.equal(later.reason, 'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_CURRENT_DRIFT');
});

test('W3 stale revision and raw-byte identities block before writer call', async () => {
  const rtk = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  const project = tmpProject();
  let writerCalls = 0;

  const staleRevision = await rtk.applyReviewTransportExactApply(
    envelopeInput(project, [textChange()], { currentRevisionSha256: sha256Text('new-revision') }),
    { exactWriter: async () => { writerCalls += 1; throw new Error('writer must not run'); } },
  );
  assert.equal(staleRevision.status, 'blocked');
  assert.equal(staleRevision.reason, 'RTK_BLOCKED_STALE_REVISION');

  const staleBytes = await rtk.applyReviewTransportExactApply(
    envelopeInput(project, [textChange()], { currentRawBytesSha256: sha256Text('new-raw') }),
    { exactWriter: async () => { writerCalls += 1; throw new Error('writer must not run'); } },
  );
  assert.equal(staleBytes.status, 'blocked');
  assert.equal(staleBytes.reason, 'RTK_BLOCKED_STALE_BYTES');
  assert.equal(writerCalls, 0);
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), project.sceneText);
});

test('W3 tampered envelopes and non-main callers have no writer authority', async () => {
  const rtk = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  const project = tmpProject();
  const built = rtk.buildReviewTransportExactApplyEnvelope(envelopeInput(project, [textChange()]));
  assert.equal(built.ok, true);

  const tampered = await rtk.applyReviewTransportExactApply({
    envelopeInput: envelopeInput(project, [textChange()]),
    envelope: { ...built.envelope, effectKey: sha256Text('tampered-effect') },
  }, {
    exactWriter: async () => { throw new Error('writer must not run'); },
  });
  assert.equal(tampered.status, 'blocked');
  assert.equal(tampered.reason, 'RTK_COMMAND_ENVELOPE_TAMPERED');

  const parserCaller = await rtk.applyReviewTransportExactApply(
    envelopeInput(project, [textChange()], { callerRole: 'parser' }),
    { exactWriter: async () => { throw new Error('writer must not run'); } },
  );
  assert.equal(parserCaller.status, 'blocked');
  assert.equal(parserCaller.reason, 'RTK_COMMAND_AUTHORITY_BLOCKED');
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), project.sceneText);
});

test('W3 comment-only lane preserves manuscript bytes and blocks before writer', async () => {
  const rtk = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  const project = tmpProject();
  const result = await rtk.applyReviewTransportExactApply(
    envelopeInput(project, [], {
      textLane: '',
      commentLane: 'RTK_COMMENT_UNSUPPORTED',
      commentLaneItems: [{ commentId: 'c1', body: 'Please review.', outcome: 'UNSUPPORTED_BLOCKED' }],
    }),
    { exactWriter: async () => { throw new Error('writer must not run'); } },
  );
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'RTK_COMMENT_UNSUPPORTED');
  assert.equal(result.writerCalled, false);
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), project.sceneText);
});

test('W3 duplicate and overlapping exact candidates produce zero writes through the existing writer', async () => {
  const rtk = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  const duplicateProject = tmpProject();
  const duplicate = await rtk.applyReviewTransportExactApply(envelopeInput(duplicateProject, [
    textChange({ changeId: 'same', quote: 'Alpha', replacementText: 'One' }),
    textChange({ changeId: 'same', quote: 'gamma', replacementText: 'Two' }),
  ]));
  assert.equal(duplicate.status, 'blocked');
  assert.equal(duplicate.writerCalled, true);
  assert.equal(duplicate.reason, 'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_DUPLICATE_CHANGE_ID');
  assert.equal(fs.readFileSync(duplicateProject.scenePath, 'utf8'), duplicateProject.sceneText);

  const overlapProject = tmpProject('abcd');
  const overlap = await rtk.applyReviewTransportExactApply(envelopeInput(overlapProject, [
    textChange({ changeId: 'left', quote: 'abc', replacementText: 'x' }),
    textChange({ changeId: 'right', quote: 'bcd', replacementText: 'y' }),
  ]));
  assert.equal(overlap.status, 'blocked');
  assert.equal(overlap.writerCalled, true);
  assert.equal(overlap.reason, 'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_OVERLAPPING_RANGE');
  assert.equal(fs.readFileSync(overlapProject.scenePath, 'utf8'), overlapProject.sceneText);
});

test('W3 crash after writer rename records immutable recovery resolution and no hybrid state', async () => {
  const rtk = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  const project = tmpProject();
  const result = await rtk.applyReviewTransportExactApply(envelopeInput(project, [textChange()]), {
    exactWriterOptions: {
      afterRenameBeforeReceipt: async () => {
        throw Object.assign(new Error('killpoint after rename'), { code: 'E_W3_KILLPOINT' });
      },
    },
  });

  assert.equal(result.status, 'ambiguous');
  assert.equal(result.writerCalled, true);
  assert.equal(result.recoveryResolution.schemaVersion, 'yalken.rtk.exact-apply-recovery-resolution.v2');
  assert.equal(result.recoveryResolution.reason, 'RTK_RECOVERY_REQUIRED');
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), 'Alpha delta gamma.');
});

test('W3 RTK apply modules keep parser renderer UI and AI outside writer authority', () => {
  const files = [
    'src/io/revisionBridge/reviewTransportApplyCore.mjs',
    'src/io/revisionBridge/reviewTransportApplyStore.mjs',
    'src/io/revisionBridge/reviewTransportExactApply.mjs',
  ];
  for (const relativePath of files) {
    const text = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
    assert.equal(/src\/renderer|renderer\/|from ['"].*parser|from ['"].*ai|electron|ipcRenderer/u.test(text), false, relativePath);
  }
});
