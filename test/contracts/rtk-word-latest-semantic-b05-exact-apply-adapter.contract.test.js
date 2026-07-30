const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const MODULE_PATH = 'src/io/revisionBridge/index.mjs';
const ADAPTER_PATH = 'src/io/revisionBridge/reviewTransportExactApplyAdapterV2.mjs';
const RECEIPT_PATH = 'docs/OPS/RTK/WORD_LATEST_SEMANTIC_ROUNDTRIP_V2_B05_EXACT_APPLY_RECEIPT.json';

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

function tmpProject(text = 'Alpha beta gamma.') {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-b05-exact-'));
  const scenePath = path.join(projectRoot, 'scene.md');
  fs.writeFileSync(scenePath, text, 'utf8');
  return { projectRoot, scenePath, sceneText: text };
}

function sha256Text(value) {
  return `sha256:${cryptoPort.sha256Text(value)}`;
}

function fullAuthority(overrides = {}) {
  return {
    validSignedLocator: true,
    sceneRevisionUnchanged: true,
    rawSha256Unchanged: true,
    uniqueTarget: true,
    nonOverlapping: true,
    allRelevantXmlSemanticsAccounted: true,
    ...overrides,
  };
}

function replacementReviewIr({
  deleted = 'beta',
  inserted = 'delta',
  groupId = 'replacement-group-1',
  comments = true,
  formatting = true,
} = {}) {
  return {
    schemaVersion: 'yalken.rtk.review-ir.v2',
    sourceMode: 'TRACKED',
    textRevisions: [
      {
        kind: 'TextRevision',
        operation: 'delete',
        nativeRevisionId: 'del-1',
        text: deleted,
        textDigest: sha256Text(`delete:${deleted}`),
        replacementGroupId: groupId,
        sourceXmlProvenance: { partName: 'word/document.xml', elementName: 'del', openStart: 10, closeEnd: 20 },
      },
      {
        kind: 'TextRevision',
        operation: 'insert',
        nativeRevisionId: 'ins-1',
        text: inserted,
        textDigest: sha256Text(`insert:${inserted}`),
        replacementGroupId: groupId,
        sourceXmlProvenance: { partName: 'word/document.xml', elementName: 'ins', openStart: 21, closeEnd: 30 },
      },
    ],
    moveRevisions: [],
    propertyRevisions: [],
    structureChanges: [],
    formattingDeltas: formatting ? [
      {
        kind: 'FormattingDelta',
        formatKind: 'rPr',
        nativeRevisionId: 'fmt-1',
        values: { bold: true },
        sourceXmlProvenance: { partName: 'word/document.xml', elementName: 'rPr' },
      },
    ] : [],
    commentThreads: comments ? [
      {
        kind: 'CommentThread',
        threadId: 'thread-1',
        commentId: '7',
        status: 'ANCHORED',
        body: 'Keep this sentence sharp.',
      },
    ] : [],
    opaqueUnsupported: [],
  };
}

function standaloneInsertReviewIr() {
  return {
    schemaVersion: 'yalken.rtk.review-ir.v2',
    sourceMode: 'TRACKED',
    textRevisions: [
      {
        kind: 'TextRevision',
        operation: 'insert',
        nativeRevisionId: 'ins-standalone',
        text: 'new ',
        textDigest: sha256Text('insert:new'),
        replacementGroupId: '',
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

function candidateIdForReplacement(groupId = 'replacement-group-1') {
  return cryptoPort.sha256Text(stableJson({
    groupId,
    operations: ['delete', 'insert'],
  }));
}

function candidateIdForStandaloneInsert() {
  return cryptoPort.sha256Text(stableJson({
    operation: 'insert',
    id: 'ins-standalone',
    textDigest: sha256Text('insert:new'),
  }));
}

function writerInput(project, {
  quote = 'beta',
  replacementText = 'delta',
  changeId = 'change-beta',
  structuralChanges = [],
} = {}) {
  const projectSnapshot = {
    projectId: 'project-b05',
    baselineHash: 'baseline-b05',
    scenes: [{ sceneId: 'scene-1', text: project.sceneText }],
  };
  const revisionSession = {
    projectId: 'project-b05',
    baselineHash: 'baseline-b05',
    sessionId: 'session-b05',
    status: 'open',
    reviewGraph: {
      commentThreads: [],
      commentPlacements: [],
      textChanges: [
        {
          changeId,
          targetScope: { type: 'scene', id: 'scene-1' },
          match: { kind: 'exact', quote, prefix: '', suffix: '' },
          replacementText,
          createdAt: '2026-07-30T16:00:00.000Z',
        },
      ],
      structuralChanges,
      diagnosticItems: [],
      decisionStates: [],
    },
  };
  return {
    projectRoot: project.projectRoot,
    projectSnapshot,
    revisionSession,
    reviewItems: revisionSession.reviewGraph.textChanges,
    scenePath: project.scenePath,
    scenePathBySceneId: { 'scene-1': project.scenePath },
  };
}

function exactInput(project, overrides = {}) {
  const sourceRevisionSha256 = sha256Text(`revision:${project.sceneText}`);
  const sourceRawBytesSha256 = sha256Text(`raw:${project.sceneText}`);
  return {
    callerRole: overrides.callerRole || 'main',
    commandAuthority: {
      issuer: overrides.authorityIssuer || 'main',
      intent: 'rtk.exactApply',
      commandId: overrides.commandId || 'cmd.b05.apply',
    },
    roundId: overrides.roundId || 'round-b05',
    requestId: overrides.requestId || 'request-b05-1',
    exportIdentity: 'export-b05',
    returnArtifactSha256: sha256Text('returned-docx-b05'),
    manifestDigest: sha256Text('manifest-b05'),
    analysisDigest: sha256Text('analysis-b05'),
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
    reviewIr: overrides.reviewIr || replacementReviewIr(overrides.reviewIrOptions),
    exactAuthority: overrides.exactAuthority || fullAuthority(),
    textCandidateBindings: overrides.textCandidateBindings || [
      { candidateId: candidateIdForReplacement(), changeId: 'change-beta' },
    ],
    writerInput: overrides.writerInput || writerInput(project, overrides.writerInputOptions),
  };
}

test('B05 admits a bound replacement pair through existing exact writer with recovery and outcome ledger', async () => {
  const bridge = await loadBridge();
  const project = tmpProject();
  const input = exactInput(project);

  const result = await bridge.applyReviewTransportIrV2ExactText(input, {
    cryptoPort,
    now: () => 1700000000000,
  });

  assert.equal(result.status, 'applied');
  assert.equal(result.applied, true);
  assert.equal(result.writerCalled, true);
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), 'Alpha delta gamma.');
  assert.equal(result.schemaVersion, bridge.RTK_REVIEW_TRANSPORT_EXACT_APPLY_ADMISSION_V2_SCHEMA);
  assert.equal(result.adapterProfile, bridge.RTK_REVIEW_TRANSPORT_EXACT_APPLY_ADAPTER_V2_PROFILE);
  assert.equal(result.checkpointRequired, true);
  assert.equal(result.outcomeLedgerRequired, true);
  assert.equal(result.outcomeRecord.schemaVersion, 'yalken.rtk.exact-apply-outcome.v2');
  assert.equal(result.writerResult.receipt.recovery.snapshotCreated, true);
  assert.equal(result.writerResult.receipt.recovery.snapshotReadable, true);
  assert.equal(result.manualNonWriterLanes.comments, 1);
  assert.equal(result.manualNonWriterLanes.formatting, 1);

  const replay = await bridge.applyReviewTransportIrV2ExactText(input, { cryptoPort });
  assert.equal(replay.status, 'replay');
  assert.equal(replay.reason, 'RTK_ALREADY_APPLIED');
  assert.equal(replay.writerCalled, false);
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), 'Alpha delta gamma.');
});

test('B05 blocks comment-only and standalone insert evidence before writer authority', async () => {
  const bridge = await loadBridge();
  const project = tmpProject();
  const commentOnly = await bridge.applyReviewTransportIrV2ExactText({
    ...exactInput(project),
    reviewIr: {
      schemaVersion: 'yalken.rtk.review-ir.v2',
      sourceMode: 'CLEAN',
      textRevisions: [],
      moveRevisions: [],
      propertyRevisions: [],
      structureChanges: [],
      formattingDeltas: [],
      commentThreads: [{ threadId: 'thread-1', commentId: '1', status: 'ANCHORED' }],
      opaqueUnsupported: [],
    },
    textCandidateBindings: [],
    writerInput: { ...writerInput(project), reviewItems: [] },
  }, {
    cryptoPort,
    exactWriter: async () => { throw new Error('writer must not run'); },
  });
  assert.equal(commentOnly.status, 'blocked');
  assert.equal(commentOnly.writerCalled, false);
  assert.equal(commentOnly.reason, 'RTK_WRITE_PRECONDITION_FAILED');

  const insertOnly = await bridge.applyReviewTransportIrV2ExactText({
    ...exactInput(project, {
      reviewIr: standaloneInsertReviewIr(),
      textCandidateBindings: [{ candidateId: candidateIdForStandaloneInsert(), changeId: 'change-insert' }],
      writerInput: writerInput(project, {
        changeId: 'change-insert',
        quote: 'beta',
        replacementText: 'beta new',
      }),
    }),
  }, {
    cryptoPort,
    exactWriter: async () => { throw new Error('writer must not run'); },
  });
  assert.equal(insertOnly.status, 'blocked');
  assert.equal(insertOnly.writerCalled, false);
  assert.equal(insertOnly.reasons.some((item) => item.message.includes('Standalone insert')), true);
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), project.sceneText);
});

test('B05 blocks stale/tampered classification move structure and wrong caller before writer', async () => {
  const bridge = await loadBridge();
  const project = tmpProject();
  const baseInput = exactInput(project);

  const wrongCaller = bridge.buildReviewTransportExactApplyAdmissionV2({
    ...baseInput,
    callerRole: 'parser',
  }, { cryptoPort });
  assert.equal(wrongCaller.status, 'blocked');
  assert.equal(wrongCaller.reason, 'RTK_COMMAND_AUTHORITY_BLOCKED');

  const tampered = bridge.buildReviewTransportExactApplyAdmissionV2({
    ...baseInput,
    classification: { classificationDigest: sha256Text('tampered') },
  }, { cryptoPort });
  assert.equal(tampered.status, 'blocked');
  assert.equal(tampered.reason, 'RTK_COMMAND_ENVELOPE_TAMPERED');

  const structural = await bridge.applyReviewTransportIrV2ExactText({
    ...baseInput,
    reviewIr: {
      ...baseInput.reviewIr,
      moveRevisions: [{
        kind: 'MoveRevision',
        nativeRevisionId: 'move-1',
        moveFrom: { text: 'Alpha' },
        moveTo: { text: 'gamma' },
      }],
      structureChanges: [{
        kind: 'StructureChange',
        structureKind: 'moveRevision',
      }],
    },
  }, {
    cryptoPort,
    exactWriter: async () => { throw new Error('writer must not run'); },
  });
  assert.equal(structural.status, 'blocked');
  assert.equal(structural.writerCalled, false);
  assert.equal(structural.reasons.some((item) => item.code === 'RTK_BLOCKED_MOVE_REVISION'), true);
  assert.equal(structural.reasons.some((item) => item.code === 'RTK_BLOCKED_STRUCTURAL'), true);
  assert.equal(fs.readFileSync(project.scenePath, 'utf8'), project.sceneText);
});

test('B05 public contract documents narrow claims and keeps adapter out of renderer UI and network paths', async () => {
  const bridge = await loadBridge();
  const source = fs.readFileSync(path.join(process.cwd(), ADAPTER_PATH), 'utf8');
  const receipt = JSON.parse(fs.readFileSync(path.join(process.cwd(), RECEIPT_PATH), 'utf8'));

  assert.equal(typeof bridge.buildReviewTransportExactApplyAdmissionV2, 'function');
  assert.equal(typeof bridge.applyReviewTransportIrV2ExactText, 'function');
  assert.equal(receipt.status, 'B05_EXACT_APPLY_ADAPTER_READY_NOT_LATEST_WORD_CERTIFIED');
  assert.equal(receipt.nonClaims.latestWordCertified, false);
  assert.equal(receipt.nonClaims.standaloneInsertAutoApply, false);
  assert.equal(receipt.nonClaims.formattingAutoApply, false);
  assert.equal(receipt.nonClaims.commentApplyAuthority, false);
  for (const forbidden of ['src/renderer', 'ipcRenderer', 'electron', 'fetch(', 'XMLHttpRequest', 'WebSocket']) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
