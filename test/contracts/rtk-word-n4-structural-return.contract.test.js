const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { deflateRawSync } = require('node:zlib');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const BRIDGE_PATH = path.join(ROOT, 'src', 'io', 'revisionBridge', 'index.mjs');
const RUNTIME_PATH = path.join(ROOT, 'src', 'io', 'revisionBridge', 'reviewTransportStructuralReturnRuntime.mjs');
const ENVELOPE_PATH = path.join(ROOT, 'src', 'renderer', 'documentContentEnvelope.mjs');
const PHYSICAL_CANARY_PATH = path.join(ROOT, 'scripts', 'ops', 'rtk-word-c5v2-physical-canary.mjs');

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const cryptoPort = {
  sha256Text(value) {
    return crypto.createHash('sha256').update(Buffer.from(String(value), 'utf8')).digest('hex');
  },
  sha256Json(value) {
    return `sha256:${this.sha256Text(stableJson(value))}`;
  },
  byteLength(value) {
    return Buffer.byteLength(String(value), 'utf8');
  },
};

function normalizeEntry(entry) {
  const body = Buffer.from(entry.body || '', 'utf8');
  const compressedBody = deflateRawSync(body);
  return { ...entry, method: 8, body, compressedBody, byteSize: body.length, compressedSize: compressedBody.length };
}

function localRecord(entry, offset) {
  const normalized = normalizeEntry(entry);
  const name = Buffer.from(normalized.name, 'ascii');
  const header = Buffer.alloc(30 + name.length);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(normalized.method, 8);
  header.writeUInt32LE(normalized.compressedSize, 18);
  header.writeUInt32LE(normalized.byteSize, 22);
  header.writeUInt16LE(name.length, 26);
  name.copy(header, 30);
  return { ...normalized, offset, bytes: Buffer.concat([header, normalized.compressedBody]) };
}

function centralRecord(entry) {
  const name = Buffer.from(entry.name, 'ascii');
  const header = Buffer.alloc(46 + name.length);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(entry.method, 10);
  header.writeUInt32LE(entry.compressedSize, 20);
  header.writeUInt32LE(entry.byteSize, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt32LE(entry.offset, 42);
  name.copy(header, 46);
  return header;
}

function zipFixture(entries) {
  const locals = [];
  let offset = 0;
  for (const entry of entries) {
    const local = localRecord(entry, offset);
    locals.push(local);
    offset += local.bytes.length;
  }
  const central = Buffer.concat(locals.map((entry) => centralRecord(entry)));
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(locals.length, 8);
  end.writeUInt16LE(locals.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([Buffer.concat(locals.map((entry) => entry.bytes)), central, end]);
}

function docx(documentBody) {
  return zipFixture([{
    name: 'word/document.xml',
    body: `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"><w:body>${documentBody}</w:body></w:document>`,
  }]);
}

function formatIr(text, paragraph = { nodeType: 'paragraph' }) {
  return {
    schemaVersion: 'yalken.rtk.format-ir.v1',
    paragraph,
    runs: [{ from: 0, to: text.length, text, inline: {} }],
  };
}

function exportMap(text = 'Chapter turning point', paragraph = { nodeType: 'paragraph' }) {
  const ir = formatIr(text, paragraph);
  return {
    scenes: [{
      sceneId: 'scene-a',
      sceneOrdinal: 0,
      sceneRevision: `sha256:${'b'.repeat(64)}`,
      rawSha256: `sha256:${'c'.repeat(64)}`,
      blocks: [{
        blockId: 'block-a-1',
        paragraphId: 'paragraph-a-1',
        formatIr: ir,
        canonicalTextSha256: `sha256:${crypto.createHash('sha256').update(text, 'utf8').digest('hex')}`,
        canonicalMarksSha256: cryptoPort.sha256Json(ir),
        wordSignals: [
          { kind: 'w14ParaIdTextId', value: { paraId: 'A1B2C3D4', textId: 'D4C3B2A1' } },
          { kind: 'bookmarkName', value: { name: 'YRTK_01_0001_structural' } },
        ],
      }],
    }],
  };
}

function paragraphXml({ text = 'Chapter turning point', outlineLevel = null, extraPPr = '' } = {}) {
  const outline = Number.isSafeInteger(outlineLevel) ? `<w:outlineLvl w:val="${outlineLevel}"/>` : '';
  const pPr = outline || extraPPr ? `<w:pPr>${extraPPr}${outline}</w:pPr>` : '';
  return [
    '<w:p w14:paraId="A1B2C3D4" w14:textId="D4C3B2A1">',
    pPr,
    '<w:bookmarkStart w:name="YRTK_01_0001_structural"/>',
    `<w:r><w:t>${text}</w:t></w:r>`,
    '</w:p>',
  ].join('');
}

function structuralOperation({
  operationId,
  sceneId,
  blockId,
  paragraphOrdinal = 0,
  selectedText,
  sourceSha,
  nodeType,
  headingLevel,
}) {
  return {
    operationId,
    sceneId,
    blockId,
    paragraphOrdinal,
    from: 0,
    to: selectedText.length,
    selectedText,
    structural: nodeType === 'heading'
      ? { action: 'setNodeType', nodeType, headingLevel }
      : { action: 'setNodeType', nodeType },
    sourceAuthority: 'authenticated-full-manuscript-export-map-structural-ir-v1',
    sourceSceneRevision: sourceSha,
    sourceRawSha256: sourceSha,
  };
}

async function runtimeProject() {
  const envelope = await import(pathToFileURL(ENVELOPE_PATH).href);
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-n4-structural-'));
  const scenesRoot = path.join(projectRoot, 'roman');
  fs.mkdirSync(scenesRoot);
  const sceneA = path.join(scenesRoot, 'scene-a.txt');
  const sceneB = path.join(scenesRoot, 'scene-b.txt');
  const sceneAContent = envelope.composeObservablePayload({
    doc: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Alpha chapter opening' }] }],
    },
  });
  const sceneBContent = envelope.composeObservablePayload({
    doc: {
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Beta section title' }] }],
    },
  });
  fs.writeFileSync(sceneA, sceneAContent, 'utf8');
  fs.writeFileSync(sceneB, sceneBContent, 'utf8');
  const sceneARevision = `sha256:${cryptoPort.sha256Text(sceneAContent)}`;
  const sceneBRevision = `sha256:${cryptoPort.sha256Text(sceneBContent)}`;
  return {
    projectRoot,
    sceneA,
    sceneB,
    scenePathBySceneId: { 'scene-a': sceneA, 'scene-b': sceneB },
    operations: [
      structuralOperation({
        operationId: 'structure-scene-a-heading',
        sceneId: 'scene-a',
        blockId: 'block-a',
        selectedText: 'Alpha chapter opening',
        sourceSha: sceneARevision,
        nodeType: 'heading',
        headingLevel: 2,
      }),
      structuralOperation({
        operationId: 'structure-scene-b-paragraph',
        sceneId: 'scene-b',
        blockId: 'block-b',
        selectedText: 'Beta section title',
        sourceSha: sceneBRevision,
        nodeType: 'paragraph',
      }),
    ],
  };
}

function runtimeInput(project, requestId = 'request-structural-1') {
  return {
    commandId: 'cmd.rtk.review.applyMultiSceneStructuralReturn',
    callerRole: 'main',
    commandAuthority: {
      issuer: 'main',
      intent: 'rtk.structuralApply',
      commandId: 'cmd.rtk.review.applyMultiSceneStructuralReturn',
    },
    projectId: 'project-structural-n4',
    projectRoot: project.projectRoot,
    requestId,
    returnArtifactSha256: `sha256:${'d'.repeat(64)}`,
    scenePathBySceneId: project.scenePathBySceneId,
    previewConfirmed: true,
    operations: project.operations,
  };
}

test('N4 extractor derives safe heading-level structural operation from authenticated full-manuscript map', async () => {
  const bridge = await import(pathToFileURL(BRIDGE_PATH).href);
  const extracted = bridge.buildDocxReviewStructuralReturnCandidatesFromZipBytes(
    docx(paragraphXml({ outlineLevel: 1 })),
    { fullManuscriptExportMap: exportMap(), cryptoPort },
  );

  assert.equal(extracted.status, 'ready', JSON.stringify(extracted, null, 2));
  assert.equal(extracted.candidates.length, 1);
  assert.deepEqual(extracted.candidates[0].targetScope, { type: 'scene', id: 'scene-a' });
  assert.equal(extracted.candidates[0].sourceAuthority, 'authenticated-full-manuscript-export-map-structural-ir-v1');
  assert.equal(extracted.candidates[0].selectedText, 'Chapter turning point');
  assert.deepEqual(extracted.candidates[0].structural, {
    action: 'setNodeType',
    nodeType: 'heading',
    headingLevel: 2,
  });
  assert.equal(extracted.summary.supportedStructuralKinds.includes('headingLevel'), true);
  assert.equal(extracted.summary.typedPendingStructuralKinds.includes('split'), true);
});

test('N4 extractor fails closed on stale text, no-op structure, and unsupported Word structural states', async () => {
  const bridge = await import(pathToFileURL(BRIDGE_PATH).href);
  const staleText = bridge.buildDocxReviewStructuralReturnCandidatesFromZipBytes(
    docx(paragraphXml({ text: 'Changed paragraph', outlineLevel: 1 })),
    { fullManuscriptExportMap: exportMap(), cryptoPort },
  );
  assert.equal(staleText.candidates.length, 0);
  assert.equal(staleText.diagnostics.some((item) => item.code === 'RTK_STRUCTURAL_RETURN_BASELINE_NOT_EXACT'), true);

  const noOp = bridge.buildDocxReviewStructuralReturnCandidatesFromZipBytes(
    docx(paragraphXml({ outlineLevel: 1 })),
    { fullManuscriptExportMap: exportMap('Chapter turning point', { nodeType: 'heading', headingLevel: 2 }), cryptoPort },
  );
  assert.equal(noOp.candidates.length, 0);

  const unsupported = bridge.buildDocxReviewStructuralReturnCandidatesFromZipBytes(
    docx(paragraphXml({ extraPPr: '<w:pStyle w:val="ListParagraph"/>' })),
    { fullManuscriptExportMap: exportMap(), cryptoPort },
  );
  assert.equal(unsupported.candidates.length, 0);
  assert.equal(unsupported.diagnostics.some((item) => item.code === 'RTK_STRUCTURAL_RETURN_UNSUPPORTED_WORD_STRUCTURE'), true);
});

test('N4 observable envelope accepts bounded heading nodes for reopened canonical readback', async () => {
  const envelope = await import(pathToFileURL(ENVELOPE_PATH).href);
  const headingContent = envelope.composeObservablePayload({
    doc: {
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Natural heading' }] }],
    },
  });
  const parsed = envelope.parseObservablePayload(headingContent);
  assert.equal(parsed.issue, null);
  assert.equal(parsed.doc.content[0].type, 'heading');
  assert.equal(parsed.doc.content[0].attrs.level, 3);
  assert.equal(parsed.text, 'Natural heading');
  assert.deepEqual(envelope.analyzeDocumentPlainTextRoundTrip(parsed.doc), {
    safe: true,
    unsupportedNodeTypes: [],
    markedTextPresent: false,
    attributedNodePresent: false,
    invalidHeadingAttrsPresent: false,
  });
  const invalid = envelope.analyzeDocumentPlainTextRoundTrip({
    type: 'doc',
    content: [{ type: 'heading', attrs: { level: 7 }, content: [{ type: 'text', text: 'Bad heading' }] }],
  });
  assert.equal(invalid.safe, false);
  assert.equal(invalid.invalidHeadingAttrsPresent, true);
});

test('N4 runtime atomically applies structural changes across two scenes and replays persisted effect authority', async () => {
  const runtime = await import(pathToFileURL(RUNTIME_PATH).href);
  const envelope = await import(pathToFileURL(ENVELOPE_PATH).href);
  const project = await runtimeProject();
  const input = runtimeInput(project);
  const applied = await runtime.applyMultiSceneStructuralReturnRuntime(input, { cryptoPort });
  assert.equal(applied.status, 'applied', JSON.stringify(applied, null, 2));
  assert.equal(applied.readback.every((item) => item.matchesAfter), true);

  const sceneA = envelope.parseObservablePayload(fs.readFileSync(project.sceneA, 'utf8'));
  const sceneB = envelope.parseObservablePayload(fs.readFileSync(project.sceneB, 'utf8'));
  assert.equal(sceneA.doc.content[0].type, 'heading');
  assert.equal(sceneA.doc.content[0].attrs.level, 2);
  assert.equal(sceneA.text, 'Alpha chapter opening');
  assert.equal(sceneB.doc.content[0].type, 'paragraph');
  assert.equal(sceneB.text, 'Beta section title');

  const replayed = await runtime.applyMultiSceneStructuralReturnRuntime(input, { cryptoPort });
  assert.equal(replayed.status, 'replay', JSON.stringify(replayed, null, 2));
  assert.equal(replayed.writerCalled, false);

  const inspected = await runtime.inspectStructuralReturnRuntimeState({
    projectId: input.projectId,
    projectRoot: project.projectRoot,
    scenePathBySceneId: project.scenePathBySceneId,
    startupSingleInstanceAuthority: true,
  }, { cryptoPort });
  assert.equal(inspected.status, 'replayed', JSON.stringify(inspected, null, 2));
  assert.equal(inspected.replaySnapshot.replayVerified, true);

  fs.writeFileSync(project.sceneA, 'Concurrent edit after structural receipt', 'utf8');
  const diverged = await runtime.inspectStructuralReturnRuntimeState({
    projectId: input.projectId,
    projectRoot: project.projectRoot,
    scenePathBySceneId: project.scenePathBySceneId,
    startupSingleInstanceAuthority: true,
  }, { cryptoPort });
  assert.equal(diverged.status, 'recovery-required');
  assert.equal(diverged.replaySnapshot.replayVerified, false);
});

test('N4 runtime rejects stale scene authority and non-whole-paragraph structure before write', async () => {
  const runtime = await import(pathToFileURL(RUNTIME_PATH).href);
  const project = await runtimeProject();
  const stale = runtimeInput(project, 'request-structural-stale');
  stale.operations = [structuredClone(stale.operations[0])];
  stale.operations[0].sourceRawSha256 = `sha256:${'f'.repeat(64)}`;
  stale.operations[0].sourceSceneRevision = `sha256:${'f'.repeat(64)}`;
  const blockedStale = await runtime.applyMultiSceneStructuralReturnRuntime(stale, { cryptoPort });
  assert.equal(blockedStale.ok, false, JSON.stringify(blockedStale, null, 2));
  assert.equal(blockedStale.code, 'RTK_STRUCTURAL_SOURCE_SCENE_STALE');

  const partial = runtimeInput(project, 'request-structural-partial');
  partial.operations = [structuredClone(partial.operations[0])];
  partial.operations[0].from = 1;
  partial.operations[0].to = partial.operations[0].selectedText.length;
  const blockedPartial = await runtime.applyMultiSceneStructuralReturnRuntime(partial, { cryptoPort });
  assert.equal(blockedPartial.ok, false, JSON.stringify(blockedPartial, null, 2));
  assert.equal(blockedPartial.code, 'RTK_STRUCTURAL_WHOLE_PARAGRAPH_REQUIRED');
});

test('N4 structural command is admitted through typed Command Surface Kernel and serializes compact bridge response', async () => {
  const { ALLOWED_COMMAND_IDS, createCommandSurfaceKernel } = require('../../src/command/commandSurfaceKernel.js');
  const {
    makeCommandBridgeSuccess,
    makeStructuralReturnBridgeReviewSurface,
  } = require('../../src/shared/commandBridgeResponse.cjs');
  const commandId = 'cmd.rtk.review.applyMultiSceneStructuralReturn';
  assert.equal(ALLOWED_COMMAND_IDS.includes(commandId), true);
  const kernel = createCommandSurfaceKernel({
    [commandId]: async () => ({
      ok: true,
      type: 'yalken.rtk.structuralReturnRuntime',
      status: 'applied',
      code: 'RTK_STRUCTURAL_MULTI_SCENE_APPLIED',
      reason: 'RTK_STRUCTURAL_MULTI_SCENE_APPLIED',
    }),
  });
  const dispatched = await kernel.dispatch(commandId, {});
  assert.equal(dispatched.ok, true);

  const surface = makeStructuralReturnBridgeReviewSurface({
    revisionSession: {
      reviewGraph: {
        structuralChanges: [{ changeId: 'must-not-cross-ipc-boundary' }],
      },
    },
    structuralReturnPreview: {
      status: 'ready',
      code: 'RTK_STRUCTURAL_RETURN_CANDIDATES_READY',
      operationCount: 2,
      sceneCount: 2,
      diagnosticCount: 0,
      operations: [{ operationId: 'must-not-return-full-operation-list' }],
      diagnostics: [],
      writerCalled: false,
      rendererAuthority: false,
      applyCommandId: 'cmd.project.review.applyStructuralReturn',
      inspectReplayCommandId: 'cmd.project.review.inspectStructuralReturnReplay',
    },
    structuralReturnResult: {
      ok: true,
      status: 'applied',
      code: 'RTK_STRUCTURAL_MULTI_SCENE_APPLIED',
      writerCalled: true,
      applied: true,
      replayVerified: true,
      sceneReadback: [{ sceneId: 'scene-a', matchesAfter: true }],
    },
  });
  assert.equal(surface.revisionSession, undefined);
  assert.equal(surface.structuralReturnPreview.operationCount, 2);
  assert.equal(surface.structuralReturnPreview.operations.length, 0);
  assert.equal(surface.structuralReturnResult.replayVerified, true);
  assert.doesNotThrow(() => JSON.stringify(makeCommandBridgeSuccess(surface)));
});

test('N4 product source and physical canary route structural return through shipped commands without renderer authority', () => {
  const mainSource = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  const bridgeSource = fs.readFileSync(BRIDGE_PATH, 'utf8');
  const canarySource = fs.readFileSync(PHYSICAL_CANARY_PATH, 'utf8');
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'OPS', 'RTK', 'RTK_TEST_GRAPH_CATALOG_V1.json'), 'utf8'));

  assert.match(mainSource, /prepareAuthenticatedDocxStructuralReturnProductPath\s*\(/u);
  // EVID-01 Pass 2: the production structural-return path now consumes the
  // verified packet projection (buildDocxReviewStructuralReturnCandidatesFromEvidence)
  // instead of re-scanning the DOCX bytes. Pin the packet-based builder call.
  assert.match(mainSource, /buildDocxReviewStructuralReturnCandidatesFromEvidence\(structuralPacket,\s*\{[\s\S]*?budgets,/u);
  assert.match(mainSource, /dispatchCommandSurfaceKernel\(\s*COMMAND_SURFACE_KERNEL_COMMAND_IDS\.RTK_REVIEW_APPLY_MULTI_SCENE_STRUCTURAL_RETURN/u);
  assert.match(mainSource, /'cmd\.project\.review\.applyStructuralReturn':\s*async/u);
  assert.match(mainSource, /'cmd\.project\.review\.inspectStructuralReturnReplay':\s*async/u);
  assert.match(mainSource, /writerAuthorityExposedToRenderer:\s*false/u);
  assert.match(mainSource, /rendererAuthority:\s*false/u);
  assert.match(mainSource, /makeStructuralReturnBridgeReviewSurface\(reviewSurface\)/u);
  assert.match(bridgeSource, /buildDocxReviewStructuralReturnCandidatesFromZipBytes/u);
  assert.match(canarySource, /invokeUiCommand\(win, 'cmd\.project\.review\.applyStructuralReturn'/u);
  assert.match(canarySource, /invokeUiCommand\(win, 'cmd\.project\.review\.inspectStructuralReturnReplay'/u);
  assert.match(canarySource, /progress\('structural-apply-start'/u);
  assert.match(canarySource, /progress\('structural-replay-inspection-complete'/u);
  assert.match(canarySource, /set yDeadline to \(current date\) \+ 90/u);
  assert.match(canarySource, /yCandidatePosixPath is yPosixPath/u);
  assert.match(canarySource, /repeat with yIndex from \(count of documents\) to 1 by -1/u);
  assert.match(canarySource, /set outline level of paragraph format of yRange to outline level2/u);
  assert.doesNotMatch(canarySource, /C5V2 structural split\/page lane/u);
  assert.match(canarySource, /function uniqueStructuralParagraphPhrases/u);
  assert.match(canarySource, /family === 'structural'[\s\S]*structuralPhrasesByScene/u);
  assert.match(canarySource, /C5V2_CANARY_DUPLICATE_STRUCTURAL_PARAGRAPH_SCOPE/u);
  assert.match(canarySource, /structural ledger expected \$\{expectedStructuralCount\} operations/u);
  assert.match(canarySource, /structuralSemantics:\s*\{ kind:\s*operation\.semanticIntent\.kind/u);
  assert.match(canarySource, /summary\.oracleProbe\?\.ok === true/u);

  assert.match(canarySource, /Number\(activationSummary\?\.structuralProductPath\?\.candidateCount \|\| 0\)/u);
  assert.match(canarySource, /structuralMixedWithOtherMutationLane:\s*hasStructure && \(hasExactText \|\| hasComments \|\| hasFormatting\)/u);
  assert.match(canarySource, /BLOCKED_MIXED_LANE_ATOMICITY_REQUIRED/u);
  assert.equal(JSON.stringify(catalog).includes('rtk-word-n4-structural-return.contract.test.js'), true);
});
