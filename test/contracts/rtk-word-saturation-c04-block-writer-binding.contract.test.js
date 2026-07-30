const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const MODULE_PATH = 'src/io/revisionBridge/index.mjs';
const BINDING_PATH = 'src/io/revisionBridge/reviewTransportBlockExactWriterBindingV2.mjs';
const RECEIPT_PATH = 'docs/OPS/RTK/WORD_LATEST_SEMANTIC_ROUNDTRIP_V2_C04_BLOCK_WRITER_BINDING_RECEIPT.json';

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
  byteLength(value) {
    return Buffer.byteLength(String(value || ''), 'utf8');
  },
};

async function loadBridge() {
  return import(pathToFileURL(path.join(process.cwd(), MODULE_PATH)).href);
}

function sha256Text(value) {
  return `sha256:${cryptoPort.sha256Text(value)}`;
}

function tmpProject(text = 'Alpha beta gamma.') {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-c04-writer-'));
  const scenePath = path.join(projectRoot, 'scene.md');
  fs.writeFileSync(scenePath, text, 'utf8');
  return { projectRoot, scenePath, sceneText: text };
}

function c02ExactAuthority(overrides = {}) {
  return {
    validSignedLocator: true,
    sceneRevisionUnchanged: true,
    rawSha256Unchanged: true,
    uniqueTarget: false,
    nonOverlapping: false,
    allRelevantXmlSemanticsAccounted: false,
    ambiguousDuplicate: false,
    crossScene: false,
    structuralTopologyChanged: false,
    ...overrides,
  };
}

function c02AuthorityCarrier(overrides = {}) {
  return {
    schemaVersion: 'yalken.rtk.review-transport-authority-carrier.v2',
    status: 'verified-baseline-bound',
    selectedCarrier: {
      carrier: 'customDocumentProperty',
      propertyName: 'YRTK_C01_AUTH',
      verified: true,
      validSignedLocator: true,
      payload: {
        sceneId: 'scene-c04',
        sceneRevision: 'scene-revision-c04-0001',
        rawSha256: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        blockId: 'block-c04-target',
        roundId: 'round-c04',
        exportId: 'export-c04',
        ...overrides.payload,
      },
      baselineBinding: {
        allExpectedPresent: true,
        allExpectedMatched: true,
        sceneRevisionMatches: true,
        rawSha256Matches: true,
      },
    },
    carriers: [],
    exactAuthority: c02ExactAuthority(overrides.exactAuthority),
    reasons: [],
  };
}

function replacementReviewIr({ deleted = 'beta', inserted = 'delta', groupId = 'group-c04', extra = {} } = {}) {
  return {
    schemaVersion: 'yalken.rtk.review-ir.v2',
    sourceMode: 'TRACKED',
    textRevisions: [
      {
        kind: 'TextRevision',
        operation: 'delete',
        nativeRevisionId: 'del-c04',
        text: deleted,
        textDigest: sha256Text(`delete:${deleted}`),
        replacementGroupId: groupId,
      },
      {
        kind: 'TextRevision',
        operation: 'insert',
        nativeRevisionId: 'ins-c04',
        text: inserted,
        textDigest: sha256Text(`insert:${inserted}`),
        replacementGroupId: groupId,
      },
    ],
    moveRevisions: [],
    propertyRevisions: [],
    structureChanges: [],
    formattingDeltas: [
      {
        kind: 'FormattingDelta',
        formatKind: 'rPr',
        nativeRevisionId: 'fmt-c04',
        values: { bold: true },
      },
    ],
    commentThreads: [
      {
        kind: 'CommentThread',
        threadId: 'thread-c04',
        commentId: '4',
        status: 'ANCHORED',
        body: 'Comment lane is independent from text apply.',
      },
    ],
    opaqueUnsupported: [],
    ...extra,
  };
}

function insertOnlyReviewIr() {
  return replacementReviewIr({
    extra: {
      formattingDeltas: [],
      commentThreads: [],
      textRevisions: [
        {
          kind: 'TextRevision',
          operation: 'insert',
          nativeRevisionId: 'ins-c04-only',
          text: 'new ',
          textDigest: sha256Text('insert:new'),
          replacementGroupId: '',
        },
      ],
    },
  });
}

function localBaseline(text = 'Alpha beta gamma.') {
  return {
    sceneId: 'scene-c04',
    sceneBlocks: [
      {
        sceneId: 'scene-c04',
        blockId: 'block-c04-target',
        text,
      },
    ],
  };
}

function writerContext(project, text = project.sceneText) {
  const projectSnapshot = {
    projectId: 'project-c04',
    baselineHash: 'baseline-c04',
    scenes: [{ sceneId: 'scene-c04', text }],
  };
  const revisionSession = {
    projectId: 'project-c04',
    sessionId: 'session-c04',
    baselineHash: 'baseline-c04',
    status: 'open',
    reviewGraph: {
      commentThreads: [],
      commentPlacements: [],
      textChanges: [],
      structuralChanges: [],
      diagnosticItems: [],
      decisionStates: [],
    },
  };
  return {
    projectRoot: project.projectRoot,
    scenePath: project.scenePath,
    scenePathBySceneId: { 'scene-c04': project.scenePath },
    projectSnapshot,
    revisionSession,
  };
}

function envelopeFields(project, overrides = {}) {
  const sourceRevisionSha256 = sha256Text(`revision:${project.sceneText}`);
  const sourceRawBytesSha256 = sha256Text(`raw:${project.sceneText}`);
  return {
    callerRole: overrides.callerRole || 'main',
    commandAuthority: {
      issuer: overrides.authorityIssuer || 'main',
      intent: 'rtk.exactApply',
      commandId: overrides.commandId || 'cmd.c04.apply',
    },
    roundId: overrides.roundId || 'round-c04',
    requestId: overrides.requestId || 'request-c04-1',
    exportIdentity: 'export-c04',
    returnArtifactSha256: sha256Text('returned-docx-c04'),
    manifestDigest: sha256Text('manifest-c04'),
    analysisDigest: sha256Text('analysis-c04'),
    returnLifecycleState: 'RETURN_ANALYZED',
    sourceIdentity: {
      sourceTokenDomain: 'SOURCE_TOKEN_DOMAIN_V1',
      writerTextDomain: 'WRITER_TEXT_DOMAIN_V1',
      revisionSha256: sourceRevisionSha256,
      rawBytesSha256: sourceRawBytesSha256,
    },
    currentIdentity: {
      revisionSha256: sourceRevisionSha256,
      rawBytesSha256: sourceRawBytesSha256,
    },
  };
}

function c04Input(project, overrides = {}) {
  const reviewIr = overrides.reviewIr || replacementReviewIr(overrides.reviewIrOptions);
  return {
    ...envelopeFields(project, overrides),
    reviewIr,
    authorityCarrier: c02AuthorityCarrier(overrides.carrierOptions),
    exactAuthority: c02ExactAuthority(overrides.exactAuthority),
    localBaseline: overrides.localBaseline || localBaseline(project.sceneText),
    writerContext: overrides.writerContext || writerContext(project),
    blockExactAuthority: overrides.blockExactAuthority,
  };
}

test('C04 binds C03 block-local authority to the existing main-owned writer path and replays once', async () => {
  const bridge = await loadBridge();
  const project = tmpProject();
  const input = c04Input(project);
  const binding = bridge.buildReviewTransportBlockExactWriterBindingV2(input, { cryptoPort });

  assert.equal(binding.status, 'ready');
  assert.equal(binding.canApply, true);
  assert.equal(binding.writerCalled, false);
  assert.equal(binding.textCandidateBindings.length, 1);
  assert.equal(binding.textCandidateBindings[0].candidateId, binding.textCandidateBindings[0].changeId);
  assert.equal(binding.writerInput.reviewItems[0].match.quote, 'beta');
  assert.equal(binding.writerInput.reviewItems[0].replacementText, 'delta');
  assert.equal(binding.falseExactGuards.blockAuthoritySelfWriteAuthority, false);
  assert.equal(binding.duplicateSceneTextLimitation, 'existing-exact-writer-still-requires-unique-scene-quote');

  const applied = await bridge.applyReviewTransportBlockExactWriterBindingV2(input, {
    cryptoPort,
    now: () => 1700000000000,
  });
  assert.equal(applied.status, 'applied');
  assert.equal(applied.applied, true);
  assert.equal(applied.writerCalled, true);
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), 'Alpha delta gamma.');
  assert.equal(applied.manualNonWriterLanes.comments, 1);
  assert.equal(applied.manualNonWriterLanes.formatting, 1);

  const replay = await bridge.applyReviewTransportBlockExactWriterBindingV2(input, { cryptoPort });
  assert.equal(replay.status, 'replay');
  assert.equal(replay.reason, 'RTK_ALREADY_APPLIED');
  assert.equal(replay.applied, false);
  assert.equal(replay.writerCalled, false);
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), 'Alpha delta gamma.');
});

test('C04 blocks parser authority tampering and stale C03 authority before writer execution', async () => {
  const bridge = await loadBridge();
  const project = tmpProject();
  const parsedCaller = await bridge.applyReviewTransportBlockExactWriterBindingV2(c04Input(project, {
    callerRole: 'parser',
  }), {
    cryptoPort,
    exactWriter: async () => { throw new Error('writer must not run'); },
  });
  assert.equal(parsedCaller.status, 'blocked');
  assert.equal(parsedCaller.reason, 'RTK_COMMAND_AUTHORITY_BLOCKED');
  assert.equal(parsedCaller.writerCalled, false);
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), project.sceneText);

  const computed = bridge.evaluateReviewTransportBlockExactAuthorityV2(c04Input(project), { cryptoPort });
  const tampered = await bridge.applyReviewTransportBlockExactWriterBindingV2(c04Input(project, {
    blockExactAuthority: {
      ...computed,
      authorityDigest: sha256Text('tampered-c04-authority'),
    },
  }), {
    cryptoPort,
    exactWriter: async () => { throw new Error('writer must not run'); },
  });
  assert.equal(tampered.status, 'blocked');
  assert.equal(tampered.reason, 'RTK_COMMAND_ENVELOPE_TAMPERED');
  assert.equal(tampered.writerCalled, false);
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), project.sceneText);

  const missingDigest = await bridge.applyReviewTransportBlockExactWriterBindingV2(c04Input(project, {
    blockExactAuthority: {
      ...computed,
      authorityDigest: '',
      canApply: true,
      canWriteManuscript: true,
      status: 'exact-authority-ready',
    },
  }), {
    cryptoPort,
    exactWriter: async () => { throw new Error('writer must not run'); },
  });
  assert.equal(missingDigest.status, 'blocked');
  assert.equal(missingDigest.reason, 'RTK_COMMAND_ENVELOPE_TAMPERED');
  assert.equal(missingDigest.writerCalled, false);
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), project.sceneText);
});

test('C04 keeps standalone insert and duplicate scene quote out of false exact automatic apply', async () => {
  const bridge = await loadBridge();
  const project = tmpProject('Alpha beta gamma beta.');
  const insertOnly = await bridge.applyReviewTransportBlockExactWriterBindingV2(c04Input(project, {
    reviewIr: insertOnlyReviewIr(),
    localBaseline: localBaseline(project.sceneText),
    writerContext: writerContext(project),
  }), {
    cryptoPort,
    exactWriter: async () => { throw new Error('writer must not run'); },
  });
  assert.equal(insertOnly.status, 'blocked');
  assert.equal(insertOnly.writerCalled, false);
  assert.equal(insertOnly.reasons.some((item) => (
    item.code === 'RTK_MANUAL_DEGRADED_LOCATOR'
    && item.field === 'reviewIr.textRevisions.ins-c04-only'
  )), true);

  const duplicateSceneQuote = await bridge.applyReviewTransportBlockExactWriterBindingV2(c04Input(project, {
    localBaseline: localBaseline('Alpha beta gamma.'),
    writerContext: writerContext(project),
  }), {
    cryptoPort,
    now: () => 1700000000000,
  });
  assert.notEqual(duplicateSceneQuote.status, 'applied');
  assert.equal(duplicateSceneQuote.applied, false);
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), 'Alpha beta gamma beta.');
});

test('C04 crash-before-receipt returns no false success and a repeated request does not double mutate', async () => {
  const bridge = await loadBridge();
  const project = tmpProject();
  const input = c04Input(project);
  const crashed = await bridge.applyReviewTransportBlockExactWriterBindingV2(input, {
    cryptoPort,
    exactWriterOptions: {
      beforeReceipt: async () => {
        throw new Error('forced C04 crash before outcome receipt');
      },
    },
    now: () => 1700000000000,
  });

  assert.equal(crashed.status, 'ambiguous');
  assert.equal(crashed.applied, false);
  assert.equal(crashed.writerCalled, true);
  assert.equal(crashed.recoveryResolution.schemaVersion, 'yalken.rtk.exact-apply-recovery-resolution.v2');
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), 'Alpha delta gamma.');

  const repeated = await bridge.applyReviewTransportBlockExactWriterBindingV2(input, { cryptoPort });
  assert.notEqual(repeated.status, 'applied');
  assert.equal(repeated.applied, false);
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), 'Alpha delta gamma.');
});

test('C04 public contract stays Word-only, main-owned, and free of renderer or network authority', async () => {
  const bridge = await loadBridge();
  const source = fs.readFileSync(path.join(process.cwd(), BINDING_PATH), 'utf8');
  const receipt = JSON.parse(fs.readFileSync(path.join(process.cwd(), RECEIPT_PATH), 'utf8'));

  assert.equal(typeof bridge.buildReviewTransportBlockExactWriterBindingV2, 'function');
  assert.equal(typeof bridge.applyReviewTransportBlockExactWriterBindingV2, 'function');
  assert.equal(receipt.status, 'C04_BLOCK_EXACT_WRITER_BINDING_READY_NOT_RANGE_WRITER_SATURATION');
  assert.equal(receipt.wordSaturationSequencing.currentFocus, 'WORD_ONLY_UNTIL_SATURATION');
  assert.equal(receipt.nonClaims.rangeWriterCertified, false);
  assert.equal(receipt.nonClaims.googleDocsCertified, false);
  assert.equal(receipt.nonClaims.fullWordSaturationDone, false);
  for (const forbidden of ['src/renderer', 'ipcRenderer', 'electron', 'fetch(', 'XMLHttpRequest', 'WebSocket']) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
