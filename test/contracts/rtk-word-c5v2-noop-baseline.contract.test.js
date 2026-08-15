'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

test('C5V2 no-op oracle requires authenticated byte-exact Word return and exact reopened scene truth', async () => {
  const canary = await import(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-physical-canary.mjs'));
  const scenes = Array.from({ length: 21 }, (_, index) => ({
    file: `dorian-${String(index).padStart(2, '0')}.txt`,
    text: `Scene ${index + 1} preserves Café, Cafe\u0301, family 👨‍👩‍👧‍👦, العربية, 中文, हिन्दी, and ไทย exactly.`,
  }));
  const sceneReadback = scenes.map((scene, index) => ({
    sceneId: `roman/${String(index + 1).padStart(2, '0')}_${scene.file}`,
    rawContent: scene.text,
    rawContentSha256: canary.sha256Text(scene.text),
  }));
  const passScenes = sceneReadback.map((scene) => ({ sceneId: scene.sceneId, ok: true }));
  const input = {
    ledger: {
      operationCount: 0,
      familyCounts: {
        tracked_replace: 0,
        tracked_insert: 0,
        tracked_delete: 0,
        root_comment: 0,
        reply_attempt: 0,
        state_attempt: 0,
        formatting: 0,
        structural: 0,
      },
      operations: [],
    },
    scenes,
    wordParsed: {
      scalars: { WORD_STATUS: 'PASS', REVISION_COUNT: '0', COMMENT_COUNT: '0' },
      ops: [],
      limitations: [],
      uiDiagnostics: [],
    },
    sourceDocxSha256: 'sha256:byte-identical',
    returnedDocxSha256: 'sha256:byte-identical',
    sourcePackageSummary: {
      zipOk: true,
      modernMode15Ready: true,
      revisionTagCount: 0,
      commentTagCount: 0,
      documentXmlSha256: 'sha256:document-identical',
      commentsXmlSha256: 'sha256:comments-identical',
    },
    returnedPackageSummary: {
      zipOk: true,
      modernMode15Ready: true,
      revisionTagCount: 0,
      commentTagCount: 0,
      documentXmlSha256: 'sha256:document-identical',
      commentsXmlSha256: 'sha256:comments-identical',
    },
    returnApply: {
      ok: true,
      noOpBaselineRequested: true,
      noOpBaseline: { status: 'AUTHENTICATED_CLEAN_ZERO_MUTATION_DECISION' },
      activation: {
        ok: true,
        activated: true,
        diagnosticOnly: true,
        returnIntake: {
          authenticated: true,
          status: 'authenticated-return-ir-ready',
          authorityCarrierStatus: 'verified-baseline-bound',
          sourceMode: 'CLEAN',
          returnedArtifactSha256: 'sha256:byte-identical',
          counts: {
            textRevisions: 0,
            moveRevisions: 0,
            propertyRevisions: 0,
            structureChanges: 0,
            commentThreads: 0,
            formattingDeltas: 0,
          },
          fullManuscriptExportMapTransport: {
            present: true,
            authority: 'main-owned-active-export-authority-store-after-return-authentication',
            returnedArtifactExportMapAccepted: false,
            sceneCount: 21,
          },
        },
        candidateSummary: {
          status: 'diagnostics',
          code: 'DOCX_REVIEW_PREVIEW_SESSION_CANDIDATE_NO_REVIEW_COMMENTS',
          commentThreadCount: 0,
          commentPlacementCount: 0,
          textChangeCount: 0,
          structuralChangeCount: 0,
          trackedTextCandidateCount: 0,
          canOpenReviewSession: false,
          canAutoApply: false,
          canImportMutate: false,
          canWriteStorage: false,
        },
        commentShadowResult: null,
        commentProductPath: null,
        formattingProductPath: { writerCalled: false },
        structuralProductPath: { writerCalled: false },
      },
      lanePlan: {
        exactTextCandidateCount: 0,
        commentCandidateCount: 0,
        formattingCandidateCount: 0,
        structuralCandidateCount: 0,
      },
      typedPendingLanes: {
        exactText: 'NO_EXACT_TEXT_CANDIDATE',
        rootCommentsState: 'NO_COMMENT_CANDIDATE',
        repliesState: 'NO_COMMENT_CANDIDATE',
        commentState: 'NO_COMMENT_CANDIDATE',
        commentsRepliesState: 'NO_COMMENT_CANDIDATE',
        formatting: 'NO_FORMATTING_CANDIDATE',
        structural: 'NO_STRUCTURAL_CANDIDATE',
      },
      applyResults: [],
      replayResults: [],
      staleRetryResults: [],
      formattingApplyResult: null,
      structuralApplyResult: null,
    },
    reopenedTruth: {
      sourceKind: 'reopened-yalken-project',
      sceneReadback,
      passes: [
        { pass: 1, scenes: passScenes },
        { pass: 2, scenes: passScenes },
      ],
    },
    networkRequests: [],
  };

  const green = canary.buildC5V2NoOpBaselineOracle(input);
  assert.equal(green.ok, true);
  assert.equal(green.decision, 'AUTHENTICATED_CLEAN_NO_OP_EXACT');
  assert.deepEqual(green.failures, []);
  assert.equal(green.sceneResults.length, 21);

  const normalizedSilently = structuredClone(input);
  normalizedSilently.reopenedTruth.sceneReadback[0].rawContent = normalizedSilently.reopenedTruth.sceneReadback[0].rawContent.normalize('NFC');
  normalizedSilently.reopenedTruth.sceneReadback[0].rawContentSha256 = canary.sha256Text(normalizedSilently.reopenedTruth.sceneReadback[0].rawContent);
  const blocked = canary.buildC5V2NoOpBaselineOracle(normalizedSilently);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.failures.includes('exactSceneReadback'), true);
});

test('C5V2 product apply binds only ledger-authorized EXACT candidates and deletes carry empty replacement text', async () => {
  const canary = await import(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-physical-canary.mjs'));
  const sceneId = 'roman/01_dorian.txt';
  const expectedOperations = [
    {
      id: 'replace-exact',
      family: 'tracked_replace',
      expectedOutcome: 'EXACT',
      sceneId,
      quote: 'unique old phrase',
      replacementText: 'unique new phrase',
    },
    {
      id: 'delete-exact',
      family: 'tracked_delete',
      expectedOutcome: 'EXACT',
      sceneId,
      quote: 'unique deleted phrase',
      replacementText: '',
    },
    {
      id: 'insert-manual',
      family: 'tracked_insert',
      expectedOutcome: 'MANUAL',
      sceneId,
      quote: 'manual insertion context',
      replacementText: 'manual inserted text',
    },
  ];
  const diagnostics = expectedOperations.map((operation, index) => ({
    changeId: `change-${index + 1}`,
    targetScope: { id: sceneId, type: 'scene' },
    matchKind: 'exact',
    quoteSha256: canary.sha256Text(operation.quote),
    replacementSha256: canary.sha256Text(operation.replacementText),
  }));
  const binding = canary.bindC5V2ExpectedExactTextCandidates({
    expectedOperations,
    activationSummary: {
      exactApplyTextChangeIdsByScene: { [sceneId]: diagnostics.map((item) => item.changeId) },
      textChangeScopeDiagnostics: diagnostics,
    },
    hashText: canary.sha256Text,
  });
  assert.equal(binding.ok, true);
  assert.equal(binding.expectedOperationCount, 2);
  assert.equal(binding.matchedOperationCount, 2);
  assert.equal(binding.excludedCandidateCount, 1);
  assert.deepEqual(binding.exactApplyTextChangeIdsByScene, { [sceneId]: ['change-1', 'change-2'] });

  const duplicate = canary.bindC5V2ExpectedExactTextCandidates({
    expectedOperations,
    activationSummary: {
      exactApplyTextChangeIdsByScene: { [sceneId]: ['change-1', 'change-1-duplicate', 'change-2'] },
      textChangeScopeDiagnostics: [
        diagnostics[0],
        { ...diagnostics[0], changeId: 'change-1-duplicate' },
        diagnostics[1],
      ],
    },
    hashText: canary.sha256Text,
  });
  assert.equal(duplicate.ok, false);
  assert.deepEqual(duplicate.duplicateCandidateBindingIds, ['change-1-duplicate']);

  assert.equal(canary.c5v2PhysicalReplacementText({
    semanticIntent: { kind: 'delete', replacementText: 'must-not-survive' },
  }), '');
  assert.equal(canary.c5v2PhysicalReplacementText({
    semanticIntent: { kind: 'replace', replacementText: 'replacement' },
  }), 'replacement');
  assert.deepEqual(canary.c5v2PhysicalSemanticIntent({
    semanticIntent: { kind: 'delete', replacementText: 'synthetic-master-only', preserve: 'intent' },
  }), {
    kind: 'delete',
    replacementText: '',
    preserve: 'intent',
  });
});

test('C5V2 rich reopened scenes retain complete topology while exposing stable nonempty logical paragraph ordinals', async () => {
  const canary = await import(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-physical-canary.mjs'));
  const envelope = await import(path.join(REPO_ROOT, 'src', 'renderer', 'documentContentEnvelope.mjs'));
  const rawContent = envelope.composeObservablePayload({
    doc: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First logical paragraph' }] },
        { type: 'paragraph' },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Target phrase unique', marks: [{ type: 'bold' }] }],
        },
        { type: 'paragraph' },
      ],
    },
  });
  const authority = canary.readProductSceneAuthority(rawContent);
  assert.equal(authority.allBlocks.length, 4);
  assert.equal(authority.blocks.length, 2);
  assert.deepEqual(authority.paragraphs, ['First logical paragraph', 'Target phrase unique']);
  assert.equal(authority.blocks[1].type, 'heading');
  assert.equal(authority.blocks[1].attrs.level, 2);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'c5v2-rich-round-two-'));
  const sourceDocxPath = path.join(tempRoot, 'round-two.docx');
  const { buildStoredZip } = require(path.join(REPO_ROOT, 'src', 'export', 'docx', 'docxMinBuilder.js'));
  fs.writeFileSync(sourceDocxPath, buildStoredZip([{
    name: 'word/document.xml',
    data: '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
      + '<w:p><w:r><w:t>First logical paragraph</w:t></w:r></w:p>'
      + '<w:p><w:r><w:t>Target phrase unique</w:t></w:r></w:p>'
      + '</w:body></w:document>',
  }]));
  const sceneId = 'roman/scene-rich.txt';
  const physicalLedger = canary.adaptC5V2MasterRoundToPhysicalLedger({
    masterLedger: {
      gates: { ok: true },
      roundCount: 5,
      ledgerDigest: 'sha256:master',
      sceneProfiles: [{ sceneId }],
      operations: [{
        id: 'round-two-delete',
        family: 'tracked_text_edit',
        round: 2,
        sceneId,
        expectedOutcome: 'EXACT',
        semanticIntent: { kind: 'delete', replacementText: 'synthetic-master-only' },
        anchor: {
          paragraphOrdinal: 1,
          graphemeStart: 0,
          graphemeEnd: 6,
          selectedText: 'Target',
          positionalThird: 'beginning',
        },
      }],
    },
    currentScenes: [{ sceneId, text: authority.text, paragraphs: authority.paragraphs }],
    roundNumber: 2,
    sourceDocxPath,
  });
  assert.equal(physicalLedger.operations[0].quote, 'Target');
  assert.equal(physicalLedger.operations[0].replacementText, '');
  assert.equal(physicalLedger.operations[0].semanticIntent.replacementText, '');
});

test('C5V2 physical locator prefers unique selected text over mutable after-context', async () => {
  const canary = await import(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-physical-canary.mjs'));
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'c5v2-stable-locator-'));
  const sourceDocxPath = path.join(tempRoot, 'round-one.docx');
  const paragraph = 'alpha UNIQUELOW mid UNIQUEHIGH omega';
  const { buildStoredZip } = require(path.join(REPO_ROOT, 'src', 'export', 'docx', 'docxMinBuilder.js'));
  fs.writeFileSync(sourceDocxPath, buildStoredZip([{
    name: 'word/document.xml',
    data: '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
      + `<w:p><w:r><w:t>${paragraph}</w:t></w:r></w:p>`
      + '</w:body></w:document>',
  }]));
  const sceneId = 'roman/stable-locator.txt';
  const lowStart = paragraph.indexOf('UNIQUELOW');
  const highStart = paragraph.indexOf('UNIQUEHIGH');
  const physicalLedger = canary.adaptC5V2MasterRoundToPhysicalLedger({
    masterLedger: {
      gates: { ok: true },
      roundCount: 5,
      ledgerDigest: 'sha256:stable-locator-master',
      sceneProfiles: [{ sceneId }],
      operations: [
        {
          id: 'stable-locator-low',
          family: 'tracked_text_edit',
          round: 1,
          sceneId,
          expectedOutcome: 'EXACT',
          semanticIntent: { kind: 'replace', replacementText: 'LOW-REPLACED' },
          anchor: {
            paragraphOrdinal: 0,
            graphemeStart: lowStart,
            graphemeEnd: lowStart + 'UNIQUELOW'.length,
            selectedText: 'UNIQUELOW',
            positionalThird: 'beginning',
          },
        },
        {
          id: 'stable-locator-high',
          family: 'tracked_text_edit',
          round: 1,
          sceneId,
          expectedOutcome: 'EXACT',
          semanticIntent: { kind: 'replace', replacementText: 'HIGH-REPLACED' },
          anchor: {
            paragraphOrdinal: 0,
            graphemeStart: highStart,
            graphemeEnd: highStart + 'UNIQUEHIGH'.length,
            selectedText: 'UNIQUEHIGH',
            positionalThird: 'middle',
          },
        },
      ],
    },
    currentScenes: [{ sceneId, text: paragraph, paragraphs: [paragraph] }],
    roundNumber: 1,
    sourceDocxPath,
  });
  const low = physicalLedger.operations.find((operation) => operation.id === 'stable-locator-low');
  assert.equal(low.quote, 'UNIQUELOW');
  assert.equal(low.locatorQuote, 'UNIQUELOW');
  assert.equal(low.locatorSelectionStart, 0);
});

test('C5V2 expected reopened text follows canonical boundary trimming after an exact delete', async () => {
  const canary = await import(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-physical-canary.mjs'));
  const result = canary.buildExpectedSceneParagraphs(
    { paragraphs: ['Delete this boundary while internal  spacing remains.'] },
    [{
      id: 'boundary-delete',
      family: 'tracked_delete',
      expectedOutcome: 'EXACT',
      quote: 'Delete',
      replacementText: '',
      masterAnchor: { paragraphOrdinal: 0, graphemeStart: 0, graphemeEnd: 6 },
    }],
  );
  assert.equal(result.ok, true);
  assert.equal(result.paragraphs[0], 'this boundary while internal  spacing remains.');
});

test('C5V2 object-model Word preflight does not require a UI window for non-UI operations', async () => {
  const canary = await import(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-physical-canary.mjs'));
  const script = canary.buildWordScript({
    sourcePath: '/tmp/yalken-c5v2-source.docx',
    returnedPath: '/tmp/yalken-c5v2-returned.docx',
    artifactReturnedPath: '/tmp/yalken-c5v2-artifact.docx',
    ledger: { operations: [] },
  });
  const preflightStart = script.indexOf('on yWordObjectModelPreflight');
  const preflightEnd = script.indexOf('end yWordObjectModelPreflight', preflightStart);
  assert.notEqual(preflightStart, -1);
  assert.notEqual(preflightEnd, -1);
  const objectModelPreflight = script.slice(preflightStart, preflightEnd);
  assert.match(objectModelPreflight, /WORD_OBJECT_MODEL_DOCUMENT_MISSING/u);
  assert.match(objectModelPreflight, /WORD_OBJECT_MODEL_FRONT_DOCUMENT_MISMATCH/u);
  assert.doesNotMatch(objectModelPreflight, /WORD_OBJECT_MODEL_WINDOW_UNAVAILABLE/u);
  assert.match(script, /MACOS_ACCESSIBILITY_WORD_WINDOW_UNAVAILABLE/u);
});

test('C5V2 returned-ready gate fails closed without laundering Word failure into artifact timeout', async () => {
  const canary = await import(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-physical-canary.mjs'));
  assert.equal(typeof canary.evaluateC5V2ReturnedDocxReadyForProductIntake, 'function');

  const notReady = canary.evaluateC5V2ReturnedDocxReadyForProductIntake({
    returnedReady: {
      ready: false,
      returnedPath: '/tmp/yalken-c5v2-returned.docx',
      error: 'Command failed: /usr/bin/osascript synthetic.applescript',
    },
    returnedPath: '/tmp/yalken-c5v2-returned.docx',
    returnedPathExists: false,
    returnedPathSha256: '',
  });
  assert.equal(notReady.ok, false);
  assert.equal(notReady.code, 'RETURNED_DOCX_NOT_READY_FOR_PRODUCT_INTAKE');
  assert.match(notReady.error, /osascript/u);

  const missing = canary.evaluateC5V2ReturnedDocxReadyForProductIntake({
    returnedReady: {
      ready: true,
      returnedPath: '/tmp/yalken-c5v2-returned.docx',
      returnedSha256: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    },
    returnedPath: '/tmp/yalken-c5v2-returned.docx',
    returnedPathExists: false,
    returnedPathSha256: '',
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.code, 'RETURNED_DOCX_FILE_FOR_PRODUCT_INTAKE_MISSING');

  const mismatch = canary.evaluateC5V2ReturnedDocxReadyForProductIntake({
    returnedReady: {
      ready: true,
      returnedPath: '/tmp/yalken-c5v2-returned.docx',
      returnedSha256: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    },
    returnedPath: '/tmp/yalken-c5v2-returned.docx',
    returnedPathExists: true,
    returnedPathSha256: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.code, 'RETURNED_DOCX_READY_DIGEST_MISMATCH');

  const green = canary.evaluateC5V2ReturnedDocxReadyForProductIntake({
    returnedReady: {
      ready: true,
      returnedPath: '/tmp/yalken-c5v2-returned.docx',
      returnedSha256: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    },
    returnedPath: '/tmp/yalken-c5v2-returned.docx',
    returnedPathExists: true,
    returnedPathSha256: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  });
  assert.equal(green.ok, true);
  assert.equal(green.code, 'RETURNED_DOCX_READY_FOR_PRODUCT_INTAKE');
});
