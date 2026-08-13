const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'reviewTransportNonOverlapTrackedReplacementRuntime.mjs');
const COMMAND_KERNEL_PATH = path.join(REPO_ROOT, 'src', 'command', 'commandSurfaceKernel.js');
const MAIN_PATH = path.join(REPO_ROOT, 'src', 'main.js');
const C01_COMMAND_ID = 'cmd.rtk.reviewSession.importComments';
const COMMAND_ID = 'cmd.rtk.review.applyNonOverlapTrackedReplacements';
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A03_C02_NON_OVERLAP_TRACKED_REPLACEMENT_RUNTIME_RECEIPT.json');
const C05_RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A03_C05_NON_OVERLAP_PRODUCT_PATH_RECEIPT.json');
const PROMOTION_LIST_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A03_PROMOTION_LIST.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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

function sha256Text(value) {
  return `sha256:${cryptoPort.sha256Text(value)}`;
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

function sourceFenceBinding({ commandId, source }) {
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
        projectId: source.projectId,
        rootId: source.rootId,
        documentId: source.documentId,
        canonicalRevision: source.canonicalRevision,
        workingRevision: source.workingRevision,
        sourceDigest: source.sourceDigest,
        dirtyState: 'CLEAN',
        dirtyPolicy: 'REQUIRE_CLEAN',
      },
    },
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

async function loadModule() {
  return import(pathToFileURL(MODULE_PATH).href);
}

function tmpProject(text = 'Alpha beta gamma.\nOther beta phrase.') {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-a03-c02-'));
  const scenePath = path.join(projectRoot, 'scene.md');
  fs.writeFileSync(scenePath, text, 'utf8');
  return { projectRoot, scenePath, sceneText: text };
}

function exactAuthority(overrides = {}) {
  return {
    validSignedLocator: true,
    sceneRevisionUnchanged: true,
    rawSha256Unchanged: true,
    uniqueTarget: true,
    nonOverlapping: true,
    allRelevantXmlSemanticsAccounted: true,
    ambiguousDuplicate: false,
    crossScene: false,
    structuralTopologyChanged: false,
    ...overrides,
  };
}

function authorityCarrier({ sceneId = 'scene-c02', blockId = 'block-c02-target' } = {}) {
  return {
    schemaVersion: 'yalken.rtk.review-transport-authority-carrier.v2',
    status: 'verified-baseline-bound',
    selectedCarrier: {
      carrier: 'customDocumentProperty',
      propertyName: 'YRTK_C01_AUTH',
      verified: true,
      validSignedLocator: true,
      payload: {
        sceneId,
        sceneRevision: 'scene-revision-c02-0001',
        rawSha256: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        blockId,
        roundId: 'round-c02',
        exportId: 'export-c02',
      },
      baselineBinding: {
        allExpectedPresent: true,
        allExpectedMatched: true,
        sceneRevisionMatches: true,
        rawSha256Matches: true,
      },
    },
    carriers: [],
    exactAuthority: exactAuthority(),
    reasons: [],
  };
}

function reviewIr({ deleted = 'beta', inserted = 'delta', groupId = 'group-c02', extra = {} } = {}) {
  return {
    schemaVersion: 'yalken.rtk.review-ir.v2',
    sourceMode: 'TRACKED',
    textRevisions: [
      {
        kind: 'TextRevision',
        operation: 'delete',
        nativeRevisionId: `del-${groupId}`,
        text: deleted,
        textDigest: sha256Text(`delete:${deleted}`),
        replacementGroupId: groupId,
      },
      {
        kind: 'TextRevision',
        operation: 'insert',
        nativeRevisionId: `ins-${groupId}`,
        text: inserted,
        textDigest: sha256Text(`insert:${inserted}`),
        replacementGroupId: groupId,
      },
    ],
    moveRevisions: [],
    propertyRevisions: [],
    structureChanges: [],
    formattingDeltas: [],
    commentThreads: [],
    opaqueUnsupported: [],
    ...extra,
  };
}

function writerContext(project, text = project.sceneText, sceneId = 'scene-c02') {
  return {
    projectRoot: project.projectRoot,
    scenePath: project.scenePath,
    scenePathBySceneId: { [sceneId]: project.scenePath },
    projectSnapshot: {
      projectId: 'project-c02',
      baselineHash: 'baseline-c02',
      scenes: [{ sceneId, text }],
    },
    revisionSession: {
      projectId: 'project-c02',
      sessionId: 'session-c02',
      baselineHash: 'baseline-c02',
      status: 'open',
      reviewGraph: {
        commentThreads: [],
        commentPlacements: [],
        textChanges: [],
        structuralChanges: [],
        diagnosticItems: [],
        decisionStates: [],
      },
    },
  };
}

function baseInput(project, overrides = {}) {
  const sourceRevisionSha256 = sha256Text(`revision:${project.sceneText}`);
  const sourceRawBytesSha256 = sha256Text(`raw:${project.sceneText}`);
  const source = {
    projectId: 'project-c02',
    rootId: 'root-c02',
    documentId: 'scene-c02',
    canonicalRevision: sourceRevisionSha256,
    workingRevision: sourceRevisionSha256,
    sourceDigest: sourceRawBytesSha256,
  };
  return {
    commandId: COMMAND_ID,
    callerRole: 'main',
    commandAuthority: {
      issuer: 'main',
      intent: 'rtk.exactApply',
      commandId: COMMAND_ID,
    },
    roundId: overrides.roundId || 'round-c02',
    requestId: overrides.requestId || 'request-c02-1',
    exportIdentity: 'export-c02',
    returnArtifactSha256: sha256Text('returned-docx-c02'),
    manifestDigest: sha256Text('manifest-c02'),
    analysisDigest: sha256Text('analysis-c02'),
    returnLifecycleState: 'RETURN_ANALYZED',
    sourceIdentity: {
      sourceTokenDomain: 'SOURCE_TOKEN_DOMAIN_V1',
      writerTextDomain: 'WRITER_TEXT_DOMAIN_V1',
      projectId: source.projectId,
      rootId: source.rootId,
      documentId: source.documentId,
      canonicalRevision: source.canonicalRevision,
      workingRevision: source.workingRevision,
      revisionSha256: sourceRevisionSha256,
      rawBytesSha256: sourceRawBytesSha256,
    },
    currentIdentity: {
      projectId: source.projectId,
      rootId: source.rootId,
      documentId: source.documentId,
      canonicalRevision: source.canonicalRevision,
      workingRevision: source.workingRevision,
      revisionSha256: sourceRevisionSha256,
      rawBytesSha256: sourceRawBytesSha256,
    },
    sourceFence: Object.prototype.hasOwnProperty.call(overrides, 'sourceFence')
      ? overrides.sourceFence
      : sourceFenceBinding({ commandId: COMMAND_ID, source }),
    exactAuthority: exactAuthority(overrides.exactAuthority),
    authorityCarrier: authorityCarrier(overrides.carrierOptions),
    reviewIr: overrides.reviewIr || reviewIr(overrides.reviewIrOptions),
    localBaseline: overrides.localBaseline || {
      sceneId: 'scene-c02',
      sceneBlocks: [
        {
          sceneId: 'scene-c02',
          blockId: 'block-c02-target',
          text: 'Alpha beta gamma.',
        },
      ],
    },
    writerContext: overrides.writerContext || writerContext(project),
    previewConfirmed: overrides.previewConfirmed !== false,
  };
}

test('A03 C02 applies one physically proven non-overlap tracked replacement and replays once', async () => {
  const mod = await loadModule();
  const project = tmpProject();
  const input = baseInput(project);
  const preview = mod.buildNonOverlapTrackedReplacementRuntimePreview(input, { cryptoPort });
  assert.equal(preview.status, 'preview-ready', JSON.stringify(preview, null, 2));
  assert.equal(preview.writerCalled, false);
  assert.equal(preview.summary.replacementPairCount, 1);
  assert.equal(preview.summary.trustedBlockRangeDigestCount, 1);

  const applied = await mod.applyNonOverlapTrackedReplacementRuntime(input, {
    cryptoPort,
    now: () => 1700000000000,
  });
  assert.equal(applied.status, 'applied', JSON.stringify(applied, null, 2));
  assert.equal(applied.applied, true);
  assert.equal(applied.writerCalled, true);
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), 'Alpha delta gamma.\nOther beta phrase.');
  assert.equal(applied.vetoMetrics.falseExact, 0);
  assert.equal(applied.vetoMetrics.silentApply, 0);

  const replay = await mod.applyNonOverlapTrackedReplacementRuntime(input, { cryptoPort });
  assert.equal(replay.status, 'replay');
  assert.equal(replay.applied, false);
  assert.equal(replay.writerCalled, false);
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), 'Alpha delta gamma.\nOther beta phrase.');
});

test('A03 C02 blocks unsigned stale duplicate and unconfirmed apply before writer execution', async () => {
  const mod = await loadModule();
  const cases = [
    ['unsigned', { exactAuthority: { validSignedLocator: false } }, 'RTK_MANUAL_DEGRADED_LOCATOR'],
    ['stale', { exactAuthority: { rawSha256Unchanged: false } }, 'RTK_BLOCKED_STALE_REVISION'],
    ['ambiguous', { exactAuthority: { uniqueTarget: false } }, 'RTK_BLOCKED_AMBIGUOUS_TEXT'],
    ['overlap', { exactAuthority: { nonOverlapping: false } }, 'RTK_BLOCKED_TOKEN_CONTRADICTION'],
  ];

  for (const [label, override, reason] of cases) {
    const project = tmpProject();
    const result = await mod.applyNonOverlapTrackedReplacementRuntime(baseInput(project, override), {
      cryptoPort,
      exactWriter: async () => { throw new Error(`${label}: writer must not run`); },
    });
    assert.equal(result.status, 'blocked', label);
    assert.equal(result.reason, reason, label);
    assert.equal(result.writerCalled, false, label);
    assert.equal(fs.readFileSync(project.scenePath, 'utf8'), project.sceneText, label);
  }

  const unconfirmedProject = tmpProject();
  const unconfirmed = await mod.applyNonOverlapTrackedReplacementRuntime(baseInput(unconfirmedProject, {
    previewConfirmed: false,
  }), {
    cryptoPort,
    exactWriter: async () => { throw new Error('unconfirmed writer must not run'); },
  });
  assert.equal(unconfirmed.status, 'blocked');
  assert.equal(unconfirmed.reason, 'RTK_WRITE_PRECONDITION_FAILED');
  assert.equal(unconfirmed.writerCalled, false);
  assert.equal(fs.readFileSync(unconfirmedProject.scenePath, 'utf8'), unconfirmedProject.sceneText);
});

test('A03 C02 blocks duplicate quote inside the trusted block and wrong-scene binding', async () => {
  const mod = await loadModule();
  const duplicateProject = tmpProject('Alpha beta beta gamma.');
  const duplicate = await mod.applyNonOverlapTrackedReplacementRuntime(baseInput(duplicateProject, {
    localBaseline: {
      sceneId: 'scene-c02',
      sceneBlocks: [{ sceneId: 'scene-c02', blockId: 'block-c02-target', text: 'Alpha beta beta gamma.' }],
    },
  }), {
    cryptoPort,
    exactWriter: async () => { throw new Error('duplicate writer must not run'); },
  });
  assert.equal(duplicate.status, 'blocked');
  assert.equal(duplicate.writerCalled, false);
  assert.equal(fs.readFileSync(duplicateProject.scenePath, 'utf8'), duplicateProject.sceneText);

  const wrongSceneProject = tmpProject();
  const wrongScene = await mod.applyNonOverlapTrackedReplacementRuntime(baseInput(wrongSceneProject, {
    carrierOptions: { sceneId: 'scene-other' },
  }), {
    cryptoPort,
    exactWriter: async () => { throw new Error('wrong scene writer must not run'); },
  });
  assert.equal(wrongScene.status, 'blocked');
  assert.equal(wrongScene.writerCalled, false);
  assert.equal(fs.readFileSync(wrongSceneProject.scenePath, 'utf8'), wrongSceneProject.sceneText);
});

test('A03 C02 product command kernel is allowlisted and no UI or renderer authority is added', async () => {
  const { createCommandSurfaceKernel, ALLOWED_COMMAND_IDS } = require(COMMAND_KERNEL_PATH);
  const mod = await loadModule();
  assert.equal(ALLOWED_COMMAND_IDS.includes(COMMAND_ID), true);
  const project = tmpProject();
  const kernel = createCommandSurfaceKernel({
    [COMMAND_ID]: mod.createRtkNonOverlapTrackedReplacementCommandHandler({ cryptoPort }),
  });
  const result = await kernel.dispatch(COMMAND_ID, baseInput(project));
  assert.equal(result.status, 'applied');
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), 'Alpha delta gamma.\nOther beta phrase.');

  const mainSource = fs.readFileSync(MAIN_PATH, 'utf8');
  assert.equal(mainSource.includes('handleRtkNonOverlapTrackedReplacementCommandSurface'), true);
  assert.equal(mainSource.includes('cmd.rtk.review.applyNonOverlapTrackedReplacements'), true);
  assert.equal(mainSource.includes('rendererWriteAuthority: true'), false);
});

test('A03 C02 command registration alone cannot claim user product apply wiring', () => {
  const { ALLOWED_COMMAND_IDS } = require(COMMAND_KERNEL_PATH);
  const mainSource = fs.readFileSync(MAIN_PATH, 'utf8');
  const receipt = readJson(RECEIPT_PATH);
  const c05Receipt = fs.existsSync(C05_RECEIPT_PATH) ? readJson(C05_RECEIPT_PATH) : null;
  const promotionList = readJson(PROMOTION_LIST_PATH);
  const profile = readJson(PROFILE_PATH);
  const ledger = readJson(LEDGER_PATH);

  const c02ProductDispatch = new RegExp(`dispatchCommandSurfaceKernel\\(\\s*['"]${escapeRegExp(COMMAND_ID)}['"]`, 'u');
  const c01ProductDispatch = new RegExp(`dispatchCommandSurfaceKernel\\(\\s*['"]${escapeRegExp(C01_COMMAND_ID)}['"]`, 'u');
  const c02Row = promotionList.rows.find((row) => row.capability === 'nonOverlapTrackedReplacementRuntimeApply');
  const c02ProfileCell = profile.cells.find((cell) => cell.capabilityId === 'rtk.word.v4.nonOverlapTrackedReplacementRuntimeApply');

  assert.equal(ALLOWED_COMMAND_IDS.includes(COMMAND_ID), true);
  assert.equal(mainSource.includes('handleRtkNonOverlapTrackedReplacementCommandSurface'), true);
  assert.equal(c01ProductDispatch.test(mainSource), true);

  assert.equal(receipt.implementedCapability.componentProven, true);
  assert.equal(receipt.implementedCapability.productCompositionRegistered, true);
  assert.equal(receipt.implementedCapability.productRuntimeWired, false);
  assert.equal(receipt.implementedCapability.endToEndProductPathWired, false);
  assert.equal(receipt.implementedCapability.automaticApplyCertified, false);
  assert.equal(receipt.implementedCapability.userAutomaticApplyCertified, false);

  const c05Successor = c02ProductDispatch.test(mainSource)
    || c05Receipt?.status === 'WORD_A03_C05_NON_OVERLAP_TRACKED_REPLACEMENT_PRODUCT_PATH_WIRED_NOT_SATURATED'
    || promotionList.status === 'A03_C05_NON_OVERLAP_PRODUCT_PATH_WIRED_RELEASE_AUDIT_NEXT';
  if (c05Successor) {
    assert.ok(c05Receipt, 'C05 product dispatch requires a C05 successor receipt');
    assert.equal(c05Receipt.implementedCapability.productRuntimeWired, true);
    assert.equal(c05Receipt.implementedCapability.endToEndProductPathWired, true);
    assert.equal(c05Receipt.implementedCapability.automaticApplyCertified, false);
    assert.equal(c05Receipt.implementedCapability.userAutomaticApplyCertified, false);
    assert.equal(c02Row.authorityLevel.productRuntimeWired, true);
    assert.equal(c02Row.authorityLevel.endToEndProductPathWired, true);
    assert.equal(c02ProfileCell.state, 'COMPONENT_PROVEN_SUPERSEDED_BY_A03_C05_PRODUCT_PATH');
    assert.equal(c02ProfileCell.productRuntimeWired, true);
    assert.equal(ledger.coverageLedger.a03C05NonOverlapProductPath.productRuntimeWired, true);
  } else {
    assert.equal(c02Row.authorityLevel.productRuntimeWired, false);
    assert.equal(c02ProfileCell.state, 'COMPONENT_PROVEN');
    assert.equal(c02ProfileCell.productRuntimeWired, false);
    assert.equal(ledger.runtimeClaims.writerAuthorityAdded, false);
  }

  assert.equal(c02Row.authorityLevel.componentProven, true);
  assert.equal(c02Row.authorityLevel.productCompositionRegistered, true);
  assert.equal(c02Row.authorityLevel.automaticApplyCertified, false);
  assert.equal(c02ProfileCell.automaticApplyCertified, false);
  assert.equal(ledger.runtimeClaims.automaticApplyExpanded, false);
});
