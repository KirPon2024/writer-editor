'use strict';

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

function sha256Text(text) {
  return `sha256:${crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex')}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sortedKeys(value) {
  return Object.keys(value).sort();
}

function tmpProject(text = 'Alpha beta gamma.') {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-t0-source-fence-'));
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
    createdAt: '2026-08-13T12:00:00.000Z',
  };
}

function writerInput(project, changes) {
  return {
    projectRoot: project.projectRoot,
    projectSnapshot: {
      projectId: 'project-t0',
      baselineHash: 'baseline-t0',
      scenes: [{ sceneId: 'scene-1', text: project.sceneText }],
    },
    revisionSession: {
      projectId: 'project-t0',
      baselineHash: 'baseline-t0',
      sessionId: 'session-t0',
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
    scenePathBySceneId: { 'scene-1': project.scenePath },
  };
}

function sourceIdentity(project, overrides = {}) {
  const sourceRevision = sha256Text(`source:${project.sceneText}`);
  const rawBytes = sha256Text(`raw:${project.sceneText}`);
  return {
    sourceTokenDomain: 'SOURCE_TOKEN_DOMAIN_V1',
    writerTextDomain: 'WRITER_TEXT_DOMAIN_V1',
    projectId: 'project-t0',
    rootId: 'root-t0',
    documentId: 'scene-1',
    canonicalRevision: sourceRevision,
    workingRevision: sourceRevision,
    revisionSha256: sourceRevision,
    rawBytesSha256: rawBytes,
    ...overrides,
  };
}

async function buildSourceFence(project, overrides = {}) {
  const fenceModule = await loadModule('src/product/sourceFenceV1.mjs');
  const identity = sourceIdentity(project, overrides.identity || {});
  const expected = {
    projectId: identity.projectId,
    rootId: identity.rootId,
    documentId: identity.documentId,
    canonicalRevision: identity.canonicalRevision,
    workingRevision: identity.workingRevision,
    sourceDigest: identity.rawBytesSha256,
    ...(overrides.expected || {}),
  };
  const current = {
    projectId: identity.projectId,
    rootId: identity.rootId,
    documentId: identity.documentId,
    canonicalRevision: identity.canonicalRevision,
    workingRevision: identity.workingRevision,
    sourceDigest: identity.rawBytesSha256,
    dirtyState: 'CLEAN',
    ...(overrides.current || {}),
  };
  const request = {
    schemaVersion: fenceModule.SOURCE_FENCE_V1_SCHEMAS.request,
    purpose: overrides.purpose || 'WRITE_SOURCE',
    expected,
    current,
    dirtyPolicy: overrides.dirtyPolicy || 'REQUIRE_CLEAN',
    authority: {
      decision: overrides.authorityDecision || 'ALLOW',
      mayWrite: overrides.mayWrite ?? true,
      commandId: overrides.commandId || 'cmd-t0-1',
    },
    fence: fenceModule.createSourceFenceTokenV1({
      purpose: overrides.purpose || 'WRITE_SOURCE',
      ...expected,
      ...(overrides.fenceSource || {}),
    }),
  };
  const result = fenceModule.evaluateSourceFenceV1(request);
  return {
    schemaVersion: 'yalken.rtk.round-authority-source-fence.v1',
    request,
    result: overrides.result || result,
  };
}

async function envelopeInput(project, changes, overrides = {}) {
  const identity = sourceIdentity(project, overrides.sourceIdentity || {});
  const currentIdentity = {
    revisionSha256: overrides.currentRevisionSha256 || identity.revisionSha256,
    rawBytesSha256: overrides.currentRawBytesSha256 || identity.rawBytesSha256,
  };
  const commandId = overrides.commandId || 'cmd-t0-1';
  return {
    callerRole: overrides.callerRole || 'main',
    commandAuthority: {
      issuer: overrides.authorityIssuer || 'main',
      intent: 'rtk.exactApply',
      commandId,
    },
    roundId: overrides.roundId || 'round-t0',
    requestId: overrides.requestId || 'request-t0-1',
    exportIdentity: 'export-t0',
    returnArtifactSha256: overrides.returnArtifactSha256 || sha256Text('return-t0-one'),
    manifestDigest: sha256Text('manifest-t0-one'),
    analysisDigest: sha256Text('analysis-t0-one'),
    returnLifecycleState: overrides.returnLifecycleState || 'RETURN_ANALYZED',
    candidateDisposition: {
      textLane: overrides.textLane || 'RTK_EXACT_APPLICABLE',
      commentLane: overrides.commentLane || 'RTK_COMMENT_UNSUPPORTED',
      priority: 'TEXT_BEFORE_COMMENT',
    },
    sourceIdentity: identity,
    currentIdentity,
    sourceFence: Object.prototype.hasOwnProperty.call(overrides, 'sourceFence')
      ? overrides.sourceFence
      : await buildSourceFence(project, { commandId }),
    commentLane: [],
    writerInput: writerInput(project, changes),
  };
}

async function applyWithCountingWriter(input) {
  const rtk = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  let writerCalls = 0;
  const result = await rtk.applyReviewTransportExactApply(input, {
    exactWriter: async () => {
      writerCalls += 1;
      return {
        status: 'applied',
        applied: true,
        reason: 'RTK_EXACT_APPLICABLE',
        receipt: { synthetic: true },
      };
    },
  });
  return { result, writerCalls };
}

test('T0 exact apply requires sourceFenceV1 write-source revalidation before writer reservation', async () => {
  const project = tmpProject();
  try {
    const input = await envelopeInput(project, [textChange()], { sourceFence: null });
    const { result, writerCalls } = await applyWithCountingWriter(input);

    assert.equal(result.status, 'blocked');
    assert.equal(result.reason, 'RTK_SOURCE_FENCE_REQUIRED');
    assert.equal(writerCalls, 0);
    assert.equal(fs.readFileSync(project.scenePath, 'utf8'), project.sceneText);
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});

test('T0 forged caller-carried ALLOW is recomputed and rejected before writer call', async () => {
  const project = tmpProject();
  try {
    const cleanFence = await buildSourceFence(project);
    const deniedRequestFence = await buildSourceFence(project, {
      current: { dirtyState: 'DIRTY' },
      result: clone(cleanFence.result),
    });
    const input = await envelopeInput(project, [textChange()], { sourceFence: deniedRequestFence });
    const { result, writerCalls } = await applyWithCountingWriter(input);

    assert.equal(result.status, 'blocked');
    assert.equal(result.reason, 'RTK_SOURCE_FENCE_RESULT_MISMATCH');
    assert.equal(writerCalls, 0);
    assert.equal(fs.readFileSync(project.scenePath, 'utf8'), project.sceneText);
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});

test('T0 stale revision and source digest mismatch reject without invoking writer', async () => {
  const project = tmpProject();
  try {
    const staleFence = await buildSourceFence(project, {
      current: {
        canonicalRevision: sha256Text('different-current-revision'),
      },
    });
    const stale = await applyWithCountingWriter(await envelopeInput(project, [textChange()], {
      sourceFence: staleFence,
    }));
    assert.equal(stale.result.status, 'blocked');
    assert.equal(stale.result.reason, 'RTK_SOURCE_FENCE_REJECTED');
    assert.equal(stale.writerCalls, 0);

    const digestMismatch = await applyWithCountingWriter(await envelopeInput(project, [textChange()], {
      sourceIdentity: { rawBytesSha256: sha256Text('caller-raw-does-not-match-fence') },
    }));
    assert.equal(digestMismatch.result.status, 'blocked');
    assert.equal(digestMismatch.result.reason, 'RTK_SOURCE_FENCE_IDENTITY_MISMATCH');
    assert.equal(digestMismatch.writerCalls, 0);
    assert.equal(fs.readFileSync(project.scenePath, 'utf8'), project.sceneText);
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});

test('T0 source fence document must match the writer target document', async () => {
  const project = tmpProject();
  try {
    const foreignIdentity = { documentId: 'scene-foreign' };
    const sourceFence = await buildSourceFence(project, { identity: foreignIdentity });
    const mismatch = await applyWithCountingWriter(await envelopeInput(project, [textChange()], {
      sourceIdentity: foreignIdentity,
      sourceFence,
    }));

    assert.equal(mismatch.result.status, 'blocked');
    assert.equal(mismatch.result.reason, 'RTK_SOURCE_FENCE_IDENTITY_MISMATCH');
    assert.equal(mismatch.writerCalls, 0);
    assert.equal(fs.readFileSync(project.scenePath, 'utf8'), project.sceneText);
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});

test('T0 transplant replay and UNKNOWN ABSTAIN authority never aggregate into PASS', async () => {
  const project = tmpProject();
  try {
    const transplantFence = await buildSourceFence(project, {
      fenceSource: { projectId: 'project-other' },
    });
    const transplant = await applyWithCountingWriter(await envelopeInput(project, [textChange()], {
      sourceFence: transplantFence,
    }));
    assert.equal(transplant.result.status, 'blocked');
    assert.equal(transplant.result.reason, 'RTK_SOURCE_FENCE_REJECTED');
    assert.equal(transplant.writerCalls, 0);

    for (const authorityDecision of ['UNKNOWN', 'ABSTAIN', 'CONFLICTING']) {
      const commandId = `cmd-t0-${authorityDecision.toLowerCase()}`;
      const sourceFence = await buildSourceFence(project, { authorityDecision, commandId });
      const check = await applyWithCountingWriter(await envelopeInput(project, [textChange()], {
        commandId,
        sourceFence,
      }));
      assert.equal(check.result.status, 'blocked');
      assert.equal(check.result.reason, 'RTK_SOURCE_FENCE_REJECTED');
      assert.equal(check.writerCalls, 0);
    }
    assert.equal(fs.readFileSync(project.scenePath, 'utf8'), project.sceneText);
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});

test('T0 valid source fence remains an executable synthetic PASS control', async () => {
  const project = tmpProject();
  try {
    const { result, writerCalls } = await applyWithCountingWriter(await envelopeInput(project, [textChange()]));
    assert.equal(result.status, 'applied');
    assert.equal(result.reason, 'RTK_EXACT_APPLICABLE');
    assert.equal(writerCalls, 1);
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});

test('T0 source fence binding has closed envelope keys and changes replay digests', async () => {
  const rtk = await loadModule('src/io/revisionBridge/reviewTransportExactApply.mjs');
  const project = tmpProject();
  try {
    const input = await envelopeInput(project, [textChange()]);
    const built = rtk.buildReviewTransportExactApplyEnvelope(input);
    assert.equal(built.ok, true);
    assert.deepEqual(sortedKeys(built.envelope.sourceFence), [
      'observed',
      'purpose',
      'schemaVersion',
      'sourceFenceCode',
      'sourceFenceDigest',
    ]);
    assert.deepEqual(sortedKeys(built.envelope.sourceFence.observed), [
      'canonicalRevision',
      'dirtyPolicy',
      'dirtyState',
      'documentId',
      'projectId',
      'purpose',
      'rootId',
      'sourceDigest',
      'workingRevision',
    ]);
    assert.match(built.envelope.sourceFence.sourceFenceDigest, /^sha256:[a-f0-9]{64}$/u);

    const altIdentity = { rootId: 'root-t0-alt' };
    const altInput = await envelopeInput(project, [textChange()], {
      sourceIdentity: altIdentity,
      sourceFence: await buildSourceFence(project, { identity: altIdentity }),
    });
    const altBuilt = rtk.buildReviewTransportExactApplyEnvelope(altInput);
    assert.equal(altBuilt.ok, true);
    assert.notEqual(altBuilt.envelope.sourceFence.sourceFenceDigest, built.envelope.sourceFence.sourceFenceDigest);
    assert.notEqual(altBuilt.envelope.requestKey, built.envelope.requestKey);
    assert.notEqual(altBuilt.envelope.effectKey, built.envelope.effectKey);
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});
