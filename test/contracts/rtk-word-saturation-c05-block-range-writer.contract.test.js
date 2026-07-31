const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const BRIDGE_PATH = 'src/io/revisionBridge/index.mjs';
const EXACT_WRITER_PATH = 'src/io/revisionBridge/exactTextMinSafeWrite.mjs';
const EXACT_APPLY_PATH = 'src/io/revisionBridge/reviewTransportExactApply.mjs';
const BINDING_PATH = 'src/io/revisionBridge/reviewTransportBlockExactWriterBindingV2.mjs';
const RANGE_AUTHORITY_PATH = 'src/io/revisionBridge/reviewTransportBlockRangeAuthorityV2.mjs';

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

async function loadBridge() {
  return import(pathToFileURL(path.join(process.cwd(), BRIDGE_PATH)).href);
}

async function loadExactWriter() {
  return import(pathToFileURL(path.join(process.cwd(), EXACT_WRITER_PATH)).href);
}

async function loadExactApply() {
  return import(pathToFileURL(path.join(process.cwd(), EXACT_APPLY_PATH)).href);
}

function sha256Text(value) {
  return `sha256:${cryptoPort.sha256Text(value)}`;
}

function tmpProject(text) {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-c05-range-'));
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

function c02AuthorityCarrier({ blockId = 'block-a' } = {}) {
  return {
    schemaVersion: 'yalken.rtk.review-transport-authority-carrier.v2',
    status: 'verified-baseline-bound',
    selectedCarrier: {
      carrier: 'customDocumentProperty',
      propertyName: 'YRTK_C01_AUTH',
      verified: true,
      validSignedLocator: true,
      payload: {
        sceneId: 'scene-c05',
        sceneRevision: 'scene-revision-c05-0001',
        rawSha256: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        blockId,
        roundId: 'round-c05',
        exportId: 'export-c05',
      },
      baselineBinding: {
        allExpectedPresent: true,
        allExpectedMatched: true,
        sceneRevisionMatches: true,
        rawSha256Matches: true,
      },
    },
    carriers: [],
    exactAuthority: c02ExactAuthority(),
    reasons: [],
  };
}

function replacementReviewIr({ deleted = 'beta', inserted = 'delta', groupId = 'group-c05' } = {}) {
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
  };
}

function localBaseline(blocks) {
  return {
    sceneId: 'scene-c05',
    sceneBlocks: blocks.map((block) => ({
      sceneId: 'scene-c05',
      blockId: block.blockId,
      text: block.text,
    })),
  };
}

function projectSnapshot(project, text = project.sceneText) {
  return {
    projectId: 'project-c05',
    baselineHash: 'baseline-c05',
    scenes: [{ sceneId: 'scene-c05', text }],
  };
}

function revisionSession(textChanges = []) {
  return {
    projectId: 'project-c05',
    sessionId: 'session-c05',
    baselineHash: 'baseline-c05',
    status: 'open',
    reviewGraph: {
      commentThreads: [],
      commentPlacements: [],
      textChanges,
      structuralChanges: [],
      diagnosticItems: [],
      decisionStates: [],
    },
  };
}

function writerContext(project, text = project.sceneText) {
  return {
    projectRoot: project.projectRoot,
    scenePath: project.scenePath,
    scenePathBySceneId: { 'scene-c05': project.scenePath },
    projectSnapshot: projectSnapshot(project, text),
    revisionSession: revisionSession(),
  };
}

function envelopeFields(project, overrides = {}) {
  const sourceRevisionSha256 = sha256Text(`revision:${project.sceneText}`);
  const sourceRawBytesSha256 = sha256Text(`raw:${project.sceneText}`);
  return {
    callerRole: 'main',
    commandAuthority: {
      issuer: 'main',
      intent: 'rtk.exactApply',
      commandId: overrides.commandId || 'cmd.c05.apply',
    },
    roundId: overrides.roundId || 'round-c05',
    requestId: overrides.requestId || 'request-c05-1',
    exportIdentity: 'export-c05',
    returnArtifactSha256: overrides.returnArtifactSha256 || sha256Text('returned-docx-c05'),
    manifestDigest: sha256Text('manifest-c05'),
    analysisDigest: sha256Text('analysis-c05'),
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

function c05Input(project, {
  blocks = [{ blockId: 'block-a', text: 'Alpha beta gamma.' }],
  blockId = 'block-a',
  reviewIr = replacementReviewIr(),
  context = writerContext(project),
  extra = {},
} = {}) {
  return {
    ...envelopeFields(project),
    reviewIr,
    authorityCarrier: c02AuthorityCarrier({ blockId }),
    exactAuthority: c02ExactAuthority(),
    localBaseline: localBaseline(blocks),
    writerContext: context,
    ...extra,
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function directWriterInput(project, reviewItems, text = project.sceneText) {
  return {
    projectRoot: project.projectRoot,
    scenePath: project.scenePath,
    scenePathBySceneId: { 'scene-c05': project.scenePath },
    projectSnapshot: projectSnapshot(project, text),
    revisionSession: revisionSession(),
    reviewItems,
    textChanges: reviewItems,
  };
}

function mutateFirstRange(writerInput, mutate) {
  const copy = clone(writerInput);
  mutate(copy.reviewItems[0].match.blockRange);
  copy.textChanges = copy.reviewItems;
  copy.revisionSession.reviewGraph.textChanges = copy.reviewItems;
  return copy;
}

test('C05 applies duplicate scene quote once when C04 provides unique locally bound block range', async () => {
  const bridge = await loadBridge();
  const project = tmpProject('Alpha beta gamma.\nOther beta phrase.');
  const input = c05Input(project);
  const binding = bridge.buildReviewTransportBlockExactWriterBindingV2(input, { cryptoPort });

  assert.equal(binding.status, 'ready');
  assert.equal(binding.trustedBlockRangeDigests.length, 1);
  assert.equal(binding.writerInput.reviewItems[0].match.blockRange.authorityKind, 'locallyBoundBlockRange');
  assert.equal(binding.duplicateSceneTextLimitation, 'existing-exact-writer-still-requires-unique-scene-quote');
  assert.equal(binding.blockRangeWriterAuthority, 'locally-bound-c05-ready');

  const applied = await bridge.applyReviewTransportBlockExactWriterBindingV2(input, {
    cryptoPort,
    now: () => 1700000000000,
  });
  assert.equal(applied.status, 'applied');
  assert.equal(applied.applied, true);
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), 'Alpha delta gamma.\nOther beta phrase.');
  assert.equal(applied.writerResult.operations[0].authority, 'locallyBoundBlockRange');
});

test('C05 rejects caller-created self-consistent block range without local C04 binding authority', async () => {
  const bridge = await loadBridge();
  const writer = await loadExactWriter();
  const project = tmpProject('Alpha beta gamma.\nOther beta phrase.');
  const built = bridge.buildLocalReviewTransportBlockRangeAuthorityV2({
    sceneId: 'scene-c05',
    blockId: 'block-a',
    expectedText: 'beta',
    blockLocalStart: 6,
    blockLocalEnd: 10,
    projectSnapshot: projectSnapshot(project),
    localBaseline: localBaseline([{ blockId: 'block-a', text: 'Alpha beta gamma.' }]),
  }, { cryptoPort });
  assert.equal(built.ok, true);

  const forged = directWriterInput(project, [{
    changeId: 'forge-c05',
    targetScope: { type: 'scene', id: 'scene-c05' },
    match: {
      kind: 'exact',
      quote: 'beta',
      blockId: 'block-a',
      blockRange: built.authority,
    },
    replacementText: 'delta',
  }]);
  const result = await writer.applyExactTextBatchMinSafeWrite(forged, { now: () => 1700000000000 });
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_BLOCK_RANGE_UNTRUSTED');
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), project.sceneText);
});

test('C05 blocks duplicate quote inside block duplicate block and tampered range inputs with zero writes', async () => {
  const bridge = await loadBridge();
  const writer = await loadExactWriter();

  const duplicateInBlock = tmpProject('Alpha beta beta gamma.');
  const duplicateInBlockResult = await bridge.applyReviewTransportBlockExactWriterBindingV2(c05Input(duplicateInBlock, {
    blocks: [{ blockId: 'block-a', text: 'Alpha beta beta gamma.' }],
  }), {
    cryptoPort,
    exactWriter: async () => { throw new Error('writer must not run'); },
  });
  assert.equal(duplicateInBlockResult.status, 'blocked');
  assert.equal(duplicateInBlockResult.writerCalled, false);
  assert.equal(fs.readFileSync(duplicateInBlock.scenePath, 'utf8'), duplicateInBlock.sceneText);

  const duplicateBlock = tmpProject('Alpha beta gamma.\nAlpha beta gamma.');
  const duplicateBlockResult = await bridge.applyReviewTransportBlockExactWriterBindingV2(c05Input(duplicateBlock, {
    blocks: [{ blockId: 'block-a', text: 'Alpha beta gamma.' }],
  }), { cryptoPort });
  assert.notEqual(duplicateBlockResult.status, 'applied');
  assert.equal(duplicateBlockResult.applied, false);
  assert.equal(fs.readFileSync(duplicateBlock.scenePath, 'utf8'), duplicateBlock.sceneText);

  const project = tmpProject('Alpha beta gamma.\nOther beta phrase.');
  const binding = bridge.buildReviewTransportBlockExactWriterBindingV2(c05Input(project), { cryptoPort });
  const trusted = { trustedBlockRangeDigests: binding.trustedBlockRangeDigests };
  const cases = [
    ['wrong schema', (range) => { range.schemaVersion = 'wrong'; }],
    ['wrong scene', (range) => { range.sceneId = 'scene-other'; }],
    ['wrong block', (range) => { range.blockId = 'block-other'; }],
    ['tampered range digest', (range) => { range.rangeDigest = sha256Text('tampered-range'); }],
    ['tampered block text digest', (range) => { range.blockTextDigest = sha256Text('tampered-block'); }],
    ['invalid offsets', (range) => { range.blockLocalEnd = 999; }],
    ['stale expected text', (range) => { range.expectedText = 'BETTA'; }],
  ];
  for (const [label, mutate] of cases) {
    fs.writeFileSync(project.scenePath, project.sceneText, 'utf8');
    const mutated = mutateFirstRange(binding.writerInput, mutate);
    const result = await writer.applyExactTextBatchMinSafeWrite(mutated, {
      ...trusted,
      now: () => 1700000000000,
    });
    assert.equal(result.status, 'blocked', label);
    assert.equal(fs.readFileSync(project.scenePath, 'utf8'), project.sceneText, label);
  }

  const staleProject = tmpProject(project.sceneText);
  const staleBinding = bridge.buildReviewTransportBlockExactWriterBindingV2(c05Input(staleProject), { cryptoPort });
  const shifted = `Prefix ${staleProject.sceneText}`;
  fs.writeFileSync(staleProject.scenePath, shifted, 'utf8');
  const staleInput = clone(staleBinding.writerInput);
  staleInput.projectSnapshot.scenes[0].text = shifted;
  const stale = await writer.applyExactTextBatchMinSafeWrite(staleInput, {
    trustedBlockRangeDigests: staleBinding.trustedBlockRangeDigests,
    now: () => 1700000000000,
  });
  assert.equal(stale.status, 'blocked');
  assert.equal(stale.reason, 'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_BLOCK_RANGE_STALE');
  assert.equal(fs.readFileSync(staleProject.scenePath, 'utf8'), shifted);
});

test('C05 blocks duplicate ids and overlapping ranges atomically while preserving no-blockRange compatibility', async () => {
  const bridge = await loadBridge();
  const writer = await loadExactWriter();
  const project = tmpProject('Alpha beta gamma.\nOther beta phrase.');
  const binding = bridge.buildReviewTransportBlockExactWriterBindingV2(c05Input(project), { cryptoPort });
  const first = clone(binding.writerInput.reviewItems[0]);
  const second = clone(first);
  second.changeId = 'change-c05-overlap';
  const overlapInput = directWriterInput(project, [first, second]);

  const overlap = await writer.applyExactTextBatchMinSafeWrite(overlapInput, {
    trustedBlockRangeDigests: binding.trustedBlockRangeDigests,
    now: () => 1700000000000,
  });
  assert.equal(overlap.status, 'blocked');
  assert.equal(overlap.reason, 'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_OVERLAPPING_RANGE');
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), project.sceneText);

  const duplicateIdInput = directWriterInput(project, [first, clone(first)]);
  const duplicateId = await writer.applyExactTextBatchMinSafeWrite(duplicateIdInput, {
    trustedBlockRangeDigests: binding.trustedBlockRangeDigests,
    now: () => 1700000000000,
  });
  assert.equal(duplicateId.status, 'blocked');
  assert.equal(duplicateId.reason, 'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_DUPLICATE_CHANGE_ID');
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), project.sceneText);

  const legacy = tmpProject('Alpha beta gamma.');
  const legacyInput = directWriterInput(legacy, [{
    changeId: 'legacy-c05',
    targetScope: { type: 'scene', id: 'scene-c05' },
    match: { kind: 'exact', quote: 'beta' },
    replacementText: 'delta',
  }]);
  const legacyResult = await writer.applyExactTextBatchMinSafeWrite(legacyInput, {
    now: () => 1700000000000,
  });
  assert.equal(legacyResult.status, 'applied');
  assert.equal(fs.readFileSync(legacy.scenePath, 'utf8'), 'Alpha delta gamma.');
  assert.equal(legacyResult.operations[0].authority, 'sceneUniqueQuote');
});

test('C05 range identity distinguishes same text in different blocks and batch permutation stays deterministic', async () => {
  const bridge = await loadBridge();
  const exactApply = await loadExactApply();
  const project = tmpProject('Alpha beta gamma.\nTheta beta omega.');
  const blocks = [
    { blockId: 'block-a', text: 'Alpha beta gamma.' },
    { blockId: 'block-b', text: 'Theta beta omega.' },
  ];
  const a = bridge.buildLocalReviewTransportBlockRangeAuthorityV2({
    sceneId: 'scene-c05',
    blockId: 'block-a',
    expectedText: 'beta',
    blockLocalStart: 6,
    blockLocalEnd: 10,
    projectSnapshot: projectSnapshot(project),
    localBaseline: localBaseline(blocks),
  }, { cryptoPort }).authority;
  const b = bridge.buildLocalReviewTransportBlockRangeAuthorityV2({
    sceneId: 'scene-c05',
    blockId: 'block-b',
    expectedText: 'beta',
    blockLocalStart: 6,
    blockLocalEnd: 10,
    projectSnapshot: projectSnapshot(project),
    localBaseline: localBaseline(blocks),
  }, { cryptoPort }).authority;
  assert.notEqual(a.rangeDigest, b.rangeDigest);

  const itemA = {
    changeId: 'change-a',
    targetScope: { type: 'scene', id: 'scene-c05' },
    match: { kind: 'exact', quote: 'beta', blockId: 'block-a', blockRange: a },
    replacementText: 'delta',
  };
  const itemB = {
    changeId: 'change-b',
    targetScope: { type: 'scene', id: 'scene-c05' },
    match: { kind: 'exact', quote: 'beta', blockId: 'block-b', blockRange: b },
    replacementText: 'delta',
  };
  function envelopeFor(items, requestId = 'request-c05-effect') {
    return exactApply.buildReviewTransportExactApplyEnvelope({
      ...envelopeFields(project, { requestId }),
      candidateDisposition: { textLane: 'RTK_EXACT_APPLICABLE' },
      writerInput: directWriterInput(project, items),
    }, { cryptoPort }).envelope;
  }
  const one = envelopeFor([itemA]);
  const two = envelopeFor([itemB]);
  assert.notEqual(one.effectKey, two.effectKey);

  const ordered = envelopeFor([itemA, itemB], 'request-c05-batch');
  const permuted = envelopeFor([itemB, itemA], 'request-c05-batch');
  assert.equal(ordered.effectKey, permuted.effectKey);
});

test('C05 crash window remains ambiguous and repeated request does not double apply', async () => {
  const bridge = await loadBridge();
  const project = tmpProject('Alpha beta gamma.\nOther beta phrase.');
  const input = c05Input(project);
  const crashed = await bridge.applyReviewTransportBlockExactWriterBindingV2(input, {
    cryptoPort,
    exactWriterOptions: {
      beforeReceipt: async () => {
        throw new Error('forced C05 crash before outcome receipt');
      },
    },
    now: () => 1700000000000,
  });

  assert.equal(crashed.status, 'ambiguous');
  assert.equal(crashed.applied, false);
  assert.equal(crashed.writerCalled, true);
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), 'Alpha delta gamma.\nOther beta phrase.');

  const repeated = await bridge.applyReviewTransportBlockExactWriterBindingV2(input, { cryptoPort });
  assert.notEqual(repeated.status, 'applied');
  assert.equal(repeated.applied, false);
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), 'Alpha delta gamma.\nOther beta phrase.');
});

test('C05 public sources do not claim HMAC signing or add renderer network authority', () => {
  const bindingSource = fs.readFileSync(path.join(process.cwd(), BINDING_PATH), 'utf8');
  const rangeSource = fs.readFileSync(path.join(process.cwd(), RANGE_AUTHORITY_PATH), 'utf8');
  const writerSource = fs.readFileSync(path.join(process.cwd(), EXACT_WRITER_PATH), 'utf8');

  assert.equal(bindingSource.includes('signedBlockRange'), false);
  assert.equal(writerSource.includes('signedBlockRange'), false);
  for (const forbidden of ['src/renderer', 'ipcRenderer', 'electron', 'fetch(', 'XMLHttpRequest', 'WebSocket']) {
    assert.equal(rangeSource.includes(forbidden), false, forbidden);
    assert.equal(writerSource.includes(forbidden), false, forbidden);
  }
});
