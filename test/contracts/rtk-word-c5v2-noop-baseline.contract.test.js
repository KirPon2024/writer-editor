'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
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
