const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MISSION_DIGEST = '2d188140211c4e2a65f0f1bf1bef5bac53e396e3c3887cb3563fa253a10b0c80';
const STAGE_ID = 'WP-707_WORD_APPLY';

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(Buffer.from(String(value), 'utf8')).digest('hex');
}

function sha256Colon(value) {
  return `sha256:${sha256Text(value)}`;
}

const cryptoPort = {
  sha256Text,
  sha256Json(value) {
    return sha256Colon(stableJson(value));
  },
};

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
  return { ...payload, fenceDigest: sha256Colon(stableJson(payload)) };
}

function sourceFenceBinding({ commandId, projectId, documentId, sourceRevisionSha256, sourceRawBytesSha256 }) {
  const source = {
    projectId,
    rootId: 'root-wp707',
    documentId,
    canonicalRevision: sourceRevisionSha256,
    workingRevision: sourceRevisionSha256,
    sourceDigest: sourceRawBytesSha256,
  };
  return {
    schemaVersion: 'yalken.rtk.round-authority-source-fence.v1',
    request: {
      schemaVersion: 'yalken.sourceFence.request.v1',
      purpose: 'WRITE_SOURCE',
      expected: source,
      current: { ...source, dirtyState: 'CLEAN' },
      dirtyPolicy: 'REQUIRE_CLEAN',
      authority: { decision: 'ALLOW', mayWrite: true, commandId },
      fence: sourceFenceToken(source),
    },
    result: {
      schemaVersion: 'yalken.sourceFence.result.v1',
      ok: true,
      decision: 'ALLOW',
      code: 'YALKEN_SOURCE_FENCE_ALLOWED',
      reasons: [],
      observed: {
        purpose: 'WRITE_SOURCE',
        projectId,
        rootId: 'root-wp707',
        documentId,
        canonicalRevision: sourceRevisionSha256,
        workingRevision: sourceRevisionSha256,
        sourceDigest: sourceRawBytesSha256,
        dirtyState: 'CLEAN',
        dirtyPolicy: 'REQUIRE_CLEAN',
      },
    },
  };
}

function readDecision() {
  return JSON.parse(fs.readFileSync(
    path.join(process.cwd(), 'docs/OPS/R24/CORRECTIVE/WP707_EXACT_BOUND_OWNER_DECISION_V1.json'),
    'utf8',
  ));
}

function writeMarker(projectRoot, marker) {
  fs.writeFileSync(
    path.join(projectRoot, '.yalken-wp707-disposable.json'),
    `${JSON.stringify(marker)}\n`,
    'utf8',
  );
}

function createWp707Scenario(overrides = {}) {
  const allowedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wp707-disposable-root-'));
  const ordinal = Number.isSafeInteger(overrides.ordinal) ? overrides.ordinal : 1;
  const projectId = overrides.projectId || `project-wp707-${ordinal}`;
  const sceneId = overrides.sceneId || `scene-wp707-${ordinal}.md`;
  const projectRoot = path.join(allowedRoot, `project-${ordinal}`);
  const scenePath = path.join(projectRoot, sceneId);
  const beforeText = overrides.beforeText || `Alpha ${ordinal} beta gamma.`;
  const quote = overrides.quote || 'beta';
  const replacementText = overrides.replacementText || `delta-${ordinal}`;
  const afterText = beforeText.replace(quote, replacementText);
  const commandId = overrides.commandId || `cmd-wp707-${ordinal}`;
  const roundId = overrides.roundId || `round-wp707-${ordinal}`;
  const creationNonce = overrides.creationNonce || crypto.randomUUID();
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.writeFileSync(scenePath, beforeText, 'utf8');
  fs.writeFileSync(path.join(projectRoot, 'manifest.json'), `${JSON.stringify({
    schemaVersion: 'yalken.synthetic.project.v1',
    projectId,
    scenes: [{ sceneId }],
  })}\n`, 'utf8');
  writeMarker(projectRoot, {
    schemaVersion: 'YALKEN_WP707_DISPOSABLE_PROJECT_V1',
    taskId: STAGE_ID,
    missionDigest: MISSION_DIGEST,
    projectId,
    sceneId,
    ownership: 'TASK_CREATED_DISPOSABLE',
    preexisting: false,
    userData: false,
    creationNonce,
  });

  const change = {
    changeId: `change-wp707-${ordinal}`,
    targetScope: { type: 'scene', id: sceneId },
    match: { kind: 'exact', quote, prefix: '', suffix: '' },
    replacementText,
    createdAt: '2026-09-06T08:08:26.000Z',
  };
  const sourceRevisionSha256 = sha256Colon(`source:${beforeText}`);
  const sourceRawBytesSha256 = sha256Colon(`raw:${beforeText}`);
  const baselineHash = `baseline-wp707-${ordinal}`;
  const writerInput = {
    projectRoot,
    projectSnapshot: {
      projectId,
      baselineHash,
      scenes: [{ sceneId, text: beforeText }],
    },
    revisionSession: {
      projectId,
      baselineHash,
      sessionId: `session-wp707-${ordinal}`,
      status: 'open',
      reviewGraph: {
        commentThreads: [],
        commentPlacements: [],
        textChanges: [change],
        structuralChanges: [],
        diagnosticItems: [],
        decisionStates: [],
      },
    },
    reviewItems: [change],
    scenePath,
    scenePathBySceneId: { [sceneId]: scenePath },
  };
  const envelopeInput = {
    callerRole: 'main',
    commandAuthority: { issuer: 'main', intent: 'rtk.exactApply', commandId },
    roundId,
    requestId: `request-wp707-${ordinal}`,
    exportIdentity: `export-wp707-${ordinal}`,
    returnArtifactSha256: sha256Colon(`return-wp707-${ordinal}`),
    manifestDigest: sha256Colon(`manifest-wp707-${ordinal}`),
    analysisDigest: sha256Colon(`analysis-wp707-${ordinal}`),
    returnLifecycleState: 'RETURN_ANALYZED',
    candidateDisposition: {
      textLane: 'RTK_EXACT_APPLICABLE',
      commentLane: 'RTK_COMMENT_UNSUPPORTED',
      priority: 'TEXT_BEFORE_COMMENT',
    },
    sourceIdentity: {
      sourceTokenDomain: 'SOURCE_TOKEN_DOMAIN_V1',
      writerTextDomain: 'WRITER_TEXT_DOMAIN_V1',
      projectId,
      rootId: 'root-wp707',
      documentId: sceneId,
      canonicalRevision: sourceRevisionSha256,
      workingRevision: sourceRevisionSha256,
      revisionSha256: sourceRevisionSha256,
      rawBytesSha256: sourceRawBytesSha256,
    },
    currentIdentity: {
      projectId,
      rootId: 'root-wp707',
      documentId: sceneId,
      canonicalRevision: sourceRevisionSha256,
      workingRevision: sourceRevisionSha256,
      revisionSha256: sourceRevisionSha256,
      rawBytesSha256: sourceRawBytesSha256,
    },
    sourceFence: sourceFenceBinding({
      commandId,
      projectId,
      documentId: sceneId,
      sourceRevisionSha256,
      sourceRawBytesSha256,
    }),
    commentLane: [],
    writerInput,
  };

  const commandRevalidations = [];
  const lifecycleEvents = [];
  const wordBuildId = overrides.wordBuildId || 'word-16.42-build-20101102-wp707';
  const commandKernelPort = {
    async revalidateWordSingleSceneApply(request) {
      commandRevalidations.push({ ...request });
      return {
        decision: 'ALLOW',
        revalidatedBy: 'COMMAND_KERNEL',
        phase: request.phase,
        commandId,
        projectId,
        sceneId,
        capability: 'WORD_SINGLE_SCENE_EXACT_APPLY',
        wordBuildId,
        automaticApply: false,
      };
    },
  };
  const lifecyclePort = {
    async closeProject(identity) {
      lifecycleEvents.push({ event: 'close', ...identity });
      return { ok: true, projectId, sceneId };
    },
    async reopenProject(identity) {
      lifecycleEvents.push({ event: 'reopen', ...identity });
      return { ok: true, projectId, sceneId };
    },
    async readCanonicalScene(identity) {
      lifecycleEvents.push({ event: 'readback', ...identity });
      return { ok: true, projectId, sceneId, text: fs.readFileSync(scenePath, 'utf8') };
    },
  };

  return {
    allowedRoot,
    projectRoot,
    scenePath,
    projectId,
    sceneId,
    beforeText,
    afterText,
    change,
    creationNonce,
    commandRevalidations,
    lifecycleEvents,
    input: {
      missionDigest: MISSION_DIGEST,
      decision: readDecision(),
      explicitUserConfirmation: true,
      automaticApply: false,
      multiSceneApply: false,
      atomicMultiSceneSemantics: false,
      wordProfile: {
        profileId: 'WORD_LOCAL_PHYSICAL',
        buildId: wordBuildId,
        admissionBuildId: wordBuildId,
        freshAtAdmission: true,
      },
      lifecycle: {
        returnState: 'RETURN_ANALYZED',
        previewState: 'VISIBLE_EXPLICIT',
        closeReopenReadbackRequired: true,
        completedRoundReuseRequired: true,
      },
      disposable: { allowedRoot, creationNonce },
      envelopeInput,
    },
    options: {
      commandKernelPort,
      lifecyclePort,
      exactApplyOptions: {
        cryptoPort,
        now: () => 1788682106000 + ordinal,
      },
    },
  };
}

module.exports = {
  MISSION_DIGEST,
  STAGE_ID,
  createWp707Scenario,
  cryptoPort,
  sha256Text,
  stableJson,
};
