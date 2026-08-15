#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA_VERSION = 'yalken.googleDocs.realAccountWholeBookE2E.receipt.v1';
export const TASK_ID = 'GOOGLE_DOCS_REAL_ACCOUNT_WHOLE_BOOK_E2E_V1';
export const STATUS = 'GOOGLE_DOCS_REAL_ACCOUNT_WHOLE_BOOK_E2E_V1_SCOPED_VERIFIED';
export const VERDICT = 'SCOPED_REAL_GOOGLE_DOCS_WHOLE_BOOK_E2E_PASS_WITH_LIMITATIONS';
export const PROGRAM_VERDICT = 'NEEDS_MORE_EVIDENCE';
export const RECEIPT_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_REAL_ACCOUNT_WHOLE_BOOK_E2E_V1_RECEIPT.json';
export const BASELINE_SHA = 'b3663e35246cdcbc99b21659b97d6ca9a8f00679';
export const SYNTHETIC_DOC_ID = '1T5C3xoTThpiPXNMVsR2jYKH6sf016e624-34aBgA5bs';
export const SYNTHETIC_TITLE = 'YALKEN_DISPOSABLE_GOOGLE_DOCS_WHOLE_BOOK_E2E_V1_20260815T000001Z';

const EXPECTED = Object.freeze({
  corpus: {
    sceneCount: 21,
    titleHeadingCount: 1,
    chapterHeadingCount: 21,
    sourceParagraphCount: 357,
    styleSentinelCount: 21,
    adverseParagraphCount: 3,
    paragraphCount: 381,
    charCount: 312996,
    utf8Bytes: 312996,
    htmlBytes: 318752,
    scenesSha256: 'sha256:7b6900d6861c75411b17b57669606324cbec46e9badd7bbc7f009f6c305bbabc',
    inputManifestSha256: 'sha256:5d9250722062c61cbb341efa9d436b846486c0dac3ae4ddccad16a6bc71ce484',
    inputHtmlSha256: 'sha256:ce523b19e05fa6b4b2ef87949933c8e8662891c2385843c3706e97ce38420a97',
    plainOracleSha256: 'sha256:9c83a184149ef3b0e5ac8490aac6c3e8ddf93804a5ff895836124f7f563fe1c7',
    normalizedOracleSha256: 'sha256:9c83a184149ef3b0e5ac8490aac6c3e8ddf93804a5ff895836124f7f563fe1c7',
  },
  markers: {
    firstChapter: 'YALKEN_WHOLE_BOOK_CHAPTER_01: Limit Relay 01',
    middleChapter: 'YALKEN_WHOLE_BOOK_CHAPTER_11: Limit Relay 11',
    lastChapter: 'YALKEN_WHOLE_BOOK_CHAPTER_21: Limit Relay 21',
    commentTarget: 'WHOLE_BOOK_COMMENT_TARGET_SCENE_11_CENTER_ANCHOR',
    suggestionOriginal: 'WHOLE_BOOK_SUGGESTION_TARGET_SCENE_17_ORIGINAL',
    suggestionReplacement: 'WHOLE_BOOK_SUGGESTION_TARGET_SCENE_17_REPLACEMENT',
    finalSentinel: 'YALKEN_WHOLE_BOOK_FINAL_SENTINEL_20260815T000001Z',
  },
  exports: {
    textBeforeSha256: 'sha256:770971587084ed418757114e12dcdbfe42991fd896ed590ccb8b27787397f405',
    textAfterSha256: 'sha256:770971587084ed418757114e12dcdbfe42991fd896ed590ccb8b27787397f405',
    textBytes: 313400,
    normalizedExportSha256: 'sha256:52339c39368e8c623a829b283f43c51394ffdb7a5d741d9b73543dae7b61c10b',
    docxBeforeSha256: 'sha256:fa1051afb22cdb36bc302dc8930b6e1fae06493c59ddfeab4a4717f719bb3dc6',
    docxAfterSha256: 'sha256:5a7dd0fa4802a0db7f9fcb35a7deb56a84d4e1cbad2d08f0b6a117fddec554c2',
    documentXmlBeforeSha256: 'sha256:92296ac05735113ceacbe88d6af3017bf177e0bde85e34c0753e988bccfbbcb3',
    documentXmlAfterSha256: 'sha256:d640727304efbc3fc3efcd1586879dcde9edff5b45f1b55fb9655937d23a0b86',
  },
  checkpointSha256: 'sha256:adba3b7027a8ff6b4778200b8b1841fd19777c3056923dcafa12471db1ec36a1',
});

function repoRootFromHere() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function sha256File(absPath) {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(absPath)).digest('hex')}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function reason(code, message) {
  return { code, message };
}

function expectedDenominators() {
  return {
    createdSyntheticArtifacts: 1,
    trashedSyntheticArtifacts: 1,
    nativeGoogleDocsImports: 1,
    fullBookSceneCount: 21,
    fullBookParagraphCount: 381,
    fullBookCharCount: 312996,
    fullBookRangeReadbacks: 4,
    tailSentinelReadbacks: 1,
    connectorCommentThreadsCreated: 1,
    connectorCommentThreadsResolved: 1,
    nativeSuggestionsObserved: 1,
    staleRevisionNegatives: 1,
    textExportsMaterialized: 2,
    docxExportsMaterialized: 2,
    docxStructuralOracles: 2,
    textOracles: 2,
    htmlLocalExportsClaimed: 0,
    userDocumentsRead: 0,
    userDocumentsMutated: 0,
    permanentDeletes: 0,
    productMutations: 0,
  };
}

export function buildExpectedGoogleDocsRealAccountWholeBookE2EReceipt() {
  return {
    schemaVersion: SCHEMA_VERSION,
    taskId: TASK_ID,
    status: STATUS,
    verdict: VERDICT,
    programVerdict: PROGRAM_VERDICT,
    baselineSha: BASELINE_SHA,
    worktreeBranch: 'codex/yalken-google-docs-real-account-e2e-v1',
    provider: 'google-docs',
    evidenceClass: 'REAL_CONNECTED_ACCOUNT_E2E_SYNTHETIC_WHOLE_BOOK_ONLY',
    connector: 'official-connected-google-drive-docs-tools',
    browserFallback: {
      used: true,
      reason: 'CONNECTOR_CANNOT_CREATE_NATIVE_SUGGESTIONS_OR_MOVE_TO_TRASH',
      browser: 'Chrome extension session',
      navigationBoundary: 'EXACT_SYNTHETIC_DOC_URL_ONLY',
      forbiddenNavigation: ['Drive home', 'Docs home', 'recent files', 'search results', 'existing user documents'],
    },
    authority: {
      network: 'OWNER_AUTHORIZED_CONNECTED_ACCOUNT_SYNTHETIC_ONLY',
      userDocumentsForbidden: true,
      existingDriveDiscoveryForbidden: true,
      permanentDeleteForbidden: true,
      productRuntimeWiringForbidden: true,
    },
    safetyCounters: {
      existingDriveDocumentsSearched: 0,
      existingDriveDocumentsListed: 0,
      existingDriveDocumentsFetched: 0,
      existingDriveDocumentsRead: 0,
      userDocumentsRead: 0,
      userDocumentsMutated: 0,
      permanentDeletes: 0,
      productMutations: 0,
    },
    syntheticBook: {
      corpusId: 'YALKEN_WHOLE_BOOK_CANONICAL_SYNTHETIC_V1_20260815T000001Z',
      generator: 'scripts/ops/rtk-word-c5v2-portfolio-corpus.mjs',
      generatorMode: 'near-supported-limit',
      targetWords: 42000,
      ...EXPECTED.corpus,
      markers: { ...EXPECTED.markers },
      noSampling: true,
      fullDocumentRequired: true,
      excerptOrSmokeEvidenceAdmitted: false,
    },
    sourceFiles: {
      inputManifest: { bytes: 17955, sha256: EXPECTED.corpus.inputManifestSha256 },
      inputHtml: { bytes: EXPECTED.corpus.htmlBytes, sha256: EXPECTED.corpus.inputHtmlSha256 },
      plainOracle: { bytes: EXPECTED.corpus.utf8Bytes, sha256: EXPECTED.corpus.plainOracleSha256 },
      normalizedOracle: { bytes: EXPECTED.corpus.utf8Bytes, sha256: EXPECTED.corpus.normalizedOracleSha256 },
    },
    createdArtifacts: [
      {
        artifactRole: 'primarySyntheticGoogleDoc',
        fileId: SYNTHETIC_DOC_ID,
        title: SYNTHETIC_TITLE,
        mimeType: 'application/vnd.google-apps.document',
        createdTime: '2026-08-15T09:50:49.859Z',
        source: 'current-run-create-file-result',
        url: `https://docs.google.com/document/d/${SYNTHETIC_DOC_ID}/edit?usp=drivesdk`,
        cleanupState: 'MOVED_TO_TRASH_BY_SCOPED_UI_AUTOMATION',
        cleanupEvidence: {
          uiAlertTitle: 'Файл перемещен в корзину',
          uiAlertTextIncludesTitle: true,
          uiAlertRestoreButtonObserved: true,
          permanentDeleteUsed: false,
          connectorTrashPrimitiveAvailable: false,
          metadataTrashedFieldExposed: false,
        },
      },
    ],
    connectorCapabilities: {
      nativeDocCreateFromLocalHtml: 'PASS',
      documentReadback: 'PASS',
      rangeBoundTextReadback: 'PASS',
      requiredRevisionIdWriteControl: 'PASS',
      commentsCreateReadbackResolve: 'PASS',
      exportDocxMaterialized: 'PASS',
      exportPlainTextMaterialized: 'PASS',
      fullTextOracle: 'PASS_WITH_SINGLE_TERMINAL_LF_NORMALIZATION',
      docxStructuralOracle: 'PASS',
      createNativeSuggestion: 'UNAVAILABLE_BY_TOOL_SCHEMA',
      safeMoveToTrash: 'UNAVAILABLE_BY_TOOL_SCHEMA',
      htmlLocalExport: 'OPTIONAL_NOT_MATERIALIZED_NOT_CLAIMED',
    },
    providerObservations: {
      importReadback: {
        documentId: SYNTHETIC_DOC_ID,
        titleMatched: true,
        nativeGoogleDoc: true,
        mixedTabsAndBodyFieldMask: 'DOCUMENTS_GET_REJECTS_TABS_AND_LEGACY_BODY_FIELDS_TOGETHER',
        modifiedTimeBeforeSuggestion: '2026-08-15T09:50:49.859Z',
      },
      rangeReadback: {
        fullReadbackVerified: true,
        noSampling: true,
        firstChapter: { marker: EXPECTED.markers.firstChapter, startIndex: 48, endIndex: 92, observed: true },
        middleChapter: { marker: EXPECTED.markers.middleChapter, observed: true },
        lastChapter: { marker: EXPECTED.markers.lastChapter, startIndex: 297674, endIndex: 297718, observed: true },
        finalSentinel: { marker: EXPECTED.markers.finalSentinel, startIndex: 312890, endIndex: 312939, observed: true },
      },
      textOracle: {
        oracleSha256: EXPECTED.corpus.normalizedOracleSha256,
        exportBeforeSha256: EXPECTED.exports.textBeforeSha256,
        exportAfterSuggestionSha256: EXPECTED.exports.textAfterSha256,
        exportBeforeBytes: EXPECTED.exports.textBytes,
        exportAfterBytes: EXPECTED.exports.textBytes,
        normalizedExportSha256: EXPECTED.exports.normalizedExportSha256,
        matchIgnoringSingleTrailingLf: true,
        silentTruncationObserved: false,
        acceptedTextExportUnchangedByPendingSuggestion: true,
      },
      docxStructuralOracle: {
        beforeSuggestion: {
          fileSha256: EXPECTED.exports.docxBeforeSha256,
          documentXmlSha256: EXPECTED.exports.documentXmlBeforeSha256,
          documentXmlBytes: 570817,
          paragraphTagCount: 403,
          headingMarkerCount: 21,
          styleSentinelCount: 21,
          boldCount: 21,
          italicCount: 21,
          underlineSingleCount: 21,
          blueColorCount: 21,
          continuousTextMatchesOracle: true,
          firstMiddleLastAndFinalSentinelPresent: true,
        },
        afterSuggestion: {
          fileSha256: EXPECTED.exports.docxAfterSha256,
          documentXmlSha256: EXPECTED.exports.documentXmlAfterSha256,
          insCount: 1,
          delCount: 1,
          delTextCount: 1,
          replacementInInsertion: true,
          originalInDeletion: true,
          deletedTextHasOriginal: true,
        },
      },
      commentsLifecycle: {
        createdCommentId: 'AAACFlsNw88',
        quotedText: EXPECTED.markers.commentTarget,
        createdReadbackResolved: false,
        resolveReplyId: 'AAACFlsNw9A',
        finalReadbackResolved: true,
      },
      nativeSuggestion: {
        createdByConnector: false,
        createdByScopedUiAutomation: true,
        uiModeBeforeMutation: 'Советовать',
        sidebarReplacementStatementObserved: true,
        insertionText: EXPECTED.markers.suggestionReplacement,
        deletionText: EXPECTED.markers.suggestionOriginal,
        connectorReadbackCompositeTextObserved: true,
        docxTrackedInsertionCount: 1,
        docxTrackedDeletionCount: 1,
        replacementInInsertion: true,
        originalInDeletion: true,
        falseAutoApplyCount: 0,
        finalRevisionId: 'AIroW37-JboreE3yKI5mflVI28RiIogvMQeLC1edaqhg0JCUGZpg1i7aRdaf8Fe0wnBbNaFi8nbYC-jtEDwWURZYZUc0lPSnjfC0Ys7a2lk',
        providerTimestamp: '2026-08-15T10:02:38Z',
      },
      staleRevisionNegative: {
        attemptedRequiredRevisionId: 'AIroW37Y6UtK4TJ0mYWhKGBF9gRCOTLO_pQ0qdFkYNUgq_Zf8qXD5zmXeg9EZCko0hSYlAA10oTWjNCFw7PwW5dikyMVfMWj2mWHoKoAVqk',
        attemptedText: 'SHOULD_NOT_WRITE_STALE_WHOLE_BOOK',
        expected: 'REJECT',
        actual: 'REJECT',
        providerStatus: 'INVALID_ARGUMENT',
        providerMessageClass: 'required revision ID does not match latest revision',
        rejectedTextAbsentAfterReadback: true,
      },
      exports: {
        htmlLocalExport: 'OPTIONAL_NOT_MATERIALIZED_NOT_CLAIMED',
        materialized: [
          { role: 'plain-text-before-suggestion', bytes: EXPECTED.exports.textBytes, sha256: EXPECTED.exports.textBeforeSha256 },
          { role: 'docx-before-suggestion', bytes: 24171, sha256: EXPECTED.exports.docxBeforeSha256 },
          { role: 'plain-text-after-suggestion', bytes: EXPECTED.exports.textBytes, sha256: EXPECTED.exports.textAfterSha256 },
          { role: 'docx-after-suggestion', bytes: 24360, sha256: EXPECTED.exports.docxAfterSha256 },
        ],
      },
      cleanup: {
        exactDocumentIdVerifiedBeforeTrash: true,
        exactTitleVerifiedBeforeTrash: true,
        uiTrashAlertObserved: true,
        uiAlertTitle: 'Файл перемещен в корзину',
        uiAlertTextIncludedExactTitle: true,
        restoreButtonObserved: true,
        permanentDeleteUsed: false,
      },
    },
    denominators: expectedDenominators(),
    fullReadbackVerified: true,
    noSampling: true,
    applyAuthority: 'DENY',
    productRuntimeWired: false,
    falseAutoApplyCount: 0,
    scopedPasses: [
      'native-html-import-to-synthetic-google-doc',
      'exact-id-and-title-readback',
      'full-book-tail-and-range-readback',
      'single-current-run-comment-create-readback-resolve',
      'stale-required-revision-reject-and-absence-readback',
      'scoped-ui-native-suggestion-create-on-exact-synthetic-doc',
      'accepted-text-export-unchanged-by-pending-suggestion',
      'docx-track-change-structural-oracle',
      'plain-text-whole-book-oracle-with-single-terminal-lf-normalization',
      'exact-current-run-ui-trash-without-permanent-delete',
    ],
    limitations: [
      'GOOGLE_DOCS_PROFILE_ONLY',
      'NO_GOOGLE_DOCS_PRODUCT_RUNTIME_SUPPORT_CLAIM',
      'NO_IMPORT_APPLY_AUTHORITY',
      'NO_CHAIN_SATURATION_CLAIM',
      'NO_UNIVERSAL_WORD_GOOGLE_PARITY_CLAIM',
      'HTML_LOCAL_EXPORT_NOT_MATERIALIZED_AND_NOT_CLAIMED',
      'TEXT_EXPORT_DIFFERS_FROM_ORACLE_BY_ONE_PROVIDER_TERMINAL_LF_ONLY',
      'F3_PHYSICAL_OWNER_OFF_HOST_GATES_REMAIN_OPEN',
      'INTEROP_CHAIN_C1_TO_C8_REMAINS_PENDING',
    ],
    nonClaims: [
      'No existing Drive documents were searched, listed, fetched, read, or changed.',
      'No user manuscript or user document evidence is used.',
      'No permanent delete was used.',
      'No Google Docs import/apply/product mutation authority is claimed.',
      'No saturation, terminal Google Docs PASS, or Word/Google parity is claimed.',
      'Overall legacy program verdict remains NEEDS_MORE_EVIDENCE.',
    ],
    checkpointSha256: EXPECTED.checkpointSha256,
    rollback: {
      repo: 'revert bounded receipt/verifier/test commit',
      provider: 'current-run disposable synthetic artifact moved to trash; restore only if owner explicitly requests audit recovery',
      productDataMigrationRequired: false,
      productRuntimeRollbackRequired: false,
    },
  };
}

function validateExactIdentity(receipt, failures) {
  if (receipt.schemaVersion !== SCHEMA_VERSION) failures.push(reason('GOOGLE_WHOLE_BOOK_SCHEMA_VERSION_MISMATCH', 'schemaVersion mismatch'));
  if (receipt.taskId !== TASK_ID) failures.push(reason('GOOGLE_WHOLE_BOOK_TASK_ID_MISMATCH', 'taskId mismatch'));
  if (receipt.status !== STATUS) failures.push(reason('GOOGLE_WHOLE_BOOK_STATUS_MISMATCH', 'status mismatch'));
  if (receipt.verdict !== VERDICT) failures.push(reason('GOOGLE_WHOLE_BOOK_VERDICT_MISMATCH', 'verdict mismatch'));
  if (receipt.programVerdict !== PROGRAM_VERDICT) failures.push(reason('GOOGLE_WHOLE_BOOK_PROGRAM_VERDICT_MISMATCH', 'program verdict mismatch'));
  if (receipt.baselineSha !== BASELINE_SHA) failures.push(reason('GOOGLE_WHOLE_BOOK_BASELINE_MISMATCH', 'baseline mismatch'));
  if (receipt.evidenceClass !== 'REAL_CONNECTED_ACCOUNT_E2E_SYNTHETIC_WHOLE_BOOK_ONLY') {
    failures.push(reason('GOOGLE_WHOLE_BOOK_EXCERPT_OR_SMOKE_OVERCLAIM', 'receipt must be whole-book evidence'));
  }
}

function validateScope(receipt, failures) {
  const counters = receipt.safetyCounters || {};
  const forbiddenUserScopePositive = [
    'existingDriveDocumentsSearched',
    'existingDriveDocumentsListed',
    'existingDriveDocumentsFetched',
    'existingDriveDocumentsRead',
    'userDocumentsRead',
    'userDocumentsMutated',
  ];
  for (const field of forbiddenUserScopePositive) {
    if (counters[field] !== 0) failures.push(reason('GOOGLE_WHOLE_BOOK_USER_DOC_SCOPE_VIOLATION', `${field} must be 0`));
  }
  if (counters.permanentDeletes !== 0) failures.push(reason('GOOGLE_WHOLE_BOOK_PERMANENT_DELETE_FORBIDDEN', 'permanentDeletes must be 0'));
  if (counters.productMutations !== 0) failures.push(reason('GOOGLE_WHOLE_BOOK_PRODUCT_RUNTIME_OVERCLAIM', 'productMutations must be 0'));
  if (receipt.authority?.network !== 'OWNER_AUTHORIZED_CONNECTED_ACCOUNT_SYNTHETIC_ONLY') {
    failures.push(reason('GOOGLE_WHOLE_BOOK_NETWORK_BOUNDARY_MISMATCH', 'network authority must be connected-account synthetic only'));
  }
  if (receipt.authority?.userDocumentsForbidden !== true) failures.push(reason('GOOGLE_WHOLE_BOOK_USER_DOC_SCOPE_VIOLATION', 'user documents must be forbidden'));
  if (receipt.authority?.existingDriveDiscoveryForbidden !== true) failures.push(reason('GOOGLE_WHOLE_BOOK_USER_DOC_SCOPE_VIOLATION', 'existing Drive discovery must be forbidden'));
  if (receipt.authority?.permanentDeleteForbidden !== true) failures.push(reason('GOOGLE_WHOLE_BOOK_PERMANENT_DELETE_FORBIDDEN', 'permanent delete boundary must be explicit'));
  if (receipt.authority?.productRuntimeWiringForbidden !== true) failures.push(reason('GOOGLE_WHOLE_BOOK_PRODUCT_RUNTIME_OVERCLAIM', 'product runtime wiring must be forbidden'));
}

function validateSyntheticBook(receipt, failures) {
  const book = receipt.syntheticBook || {};
  if (book.excerptOrSmokeEvidenceAdmitted !== false || book.sceneCount !== EXPECTED.corpus.sceneCount || book.paragraphCount < 250 || book.charCount < 100000) {
    failures.push(reason('GOOGLE_WHOLE_BOOK_EXCERPT_OR_SMOKE_OVERCLAIM', 'synthetic book denominator is not full whole-book scale'));
  }
  const exactNumericFields = [
    'titleHeadingCount',
    'chapterHeadingCount',
    'sourceParagraphCount',
    'styleSentinelCount',
    'adverseParagraphCount',
    'paragraphCount',
    'charCount',
    'utf8Bytes',
    'htmlBytes',
  ];
  for (const field of exactNumericFields) {
    if (book[field] !== EXPECTED.corpus[field]) {
      failures.push(reason('GOOGLE_WHOLE_BOOK_STRUCTURE_MISMATCH', `${field} mismatch`));
    }
  }
  for (const field of ['scenesSha256', 'inputManifestSha256', 'inputHtmlSha256', 'plainOracleSha256', 'normalizedOracleSha256']) {
    if (book[field] !== EXPECTED.corpus[field]) {
      failures.push(reason('GOOGLE_WHOLE_BOOK_TEXT_HASH_MISMATCH', `${field} mismatch`));
    }
  }
  for (const [field, marker] of Object.entries(EXPECTED.markers)) {
    if (book.markers?.[field] !== marker) {
      failures.push(reason('GOOGLE_WHOLE_BOOK_STRUCTURE_MISMATCH', `${field} marker mismatch`));
    }
  }
  if (book.noSampling !== true || book.fullDocumentRequired !== true) {
    failures.push(reason('GOOGLE_WHOLE_BOOK_FULL_READBACK_MISSING', 'whole-book no-sampling requirement missing'));
  }
}

function validateSourceFiles(receipt, failures) {
  const files = receipt.sourceFiles || {};
  const expectedFiles = {
    inputManifest: ['inputManifestSha256', 17955],
    inputHtml: ['inputHtmlSha256', EXPECTED.corpus.htmlBytes],
    plainOracle: ['plainOracleSha256', EXPECTED.corpus.utf8Bytes],
    normalizedOracle: ['normalizedOracleSha256', EXPECTED.corpus.utf8Bytes],
  };
  for (const [fileKey, [hashKey, bytes]] of Object.entries(expectedFiles)) {
    if (files[fileKey]?.bytes !== bytes || files[fileKey]?.sha256 !== EXPECTED.corpus[hashKey]) {
      failures.push(reason('GOOGLE_WHOLE_BOOK_TEXT_HASH_MISMATCH', `${fileKey} source binding mismatch`));
    }
  }
}

function validateArtifacts(receipt, failures) {
  if (!Array.isArray(receipt.createdArtifacts) || receipt.createdArtifacts.length !== 1) {
    failures.push(reason('GOOGLE_WHOLE_BOOK_ARTIFACT_IDENTITY_MISMATCH', 'exactly one current-run synthetic artifact required'));
    return;
  }
  const artifact = receipt.createdArtifacts[0];
  if (artifact.fileId !== SYNTHETIC_DOC_ID || artifact.title !== SYNTHETIC_TITLE) {
    failures.push(reason('GOOGLE_WHOLE_BOOK_ARTIFACT_IDENTITY_MISMATCH', 'synthetic artifact identity mismatch'));
  }
  if (artifact.source !== 'current-run-create-file-result') {
    failures.push(reason('GOOGLE_WHOLE_BOOK_ARTIFACT_IDENTITY_MISMATCH', 'artifact must come from current-run create result'));
  }
  if (artifact.cleanupState !== 'MOVED_TO_TRASH_BY_SCOPED_UI_AUTOMATION') {
    failures.push(reason('GOOGLE_WHOLE_BOOK_TRASH_NOT_CONFIRMED', 'synthetic artifact must be moved to trash'));
  }
  if (artifact.cleanupEvidence?.uiAlertTitle !== 'Файл перемещен в корзину'
    || artifact.cleanupEvidence?.uiAlertTextIncludesTitle !== true
    || artifact.cleanupEvidence?.uiAlertRestoreButtonObserved !== true) {
    failures.push(reason('GOOGLE_WHOLE_BOOK_TRASH_NOT_CONFIRMED', 'trash UI alert evidence missing'));
  }
  if (artifact.cleanupEvidence?.permanentDeleteUsed !== false) {
    failures.push(reason('GOOGLE_WHOLE_BOOK_PERMANENT_DELETE_FORBIDDEN', 'permanent delete must be false'));
  }
}

function validateCapabilities(receipt, failures) {
  const expected = {
    nativeDocCreateFromLocalHtml: 'PASS',
    documentReadback: 'PASS',
    rangeBoundTextReadback: 'PASS',
    requiredRevisionIdWriteControl: 'PASS',
    commentsCreateReadbackResolve: 'PASS',
    exportDocxMaterialized: 'PASS',
    exportPlainTextMaterialized: 'PASS',
    fullTextOracle: 'PASS_WITH_SINGLE_TERMINAL_LF_NORMALIZATION',
    docxStructuralOracle: 'PASS',
    createNativeSuggestion: 'UNAVAILABLE_BY_TOOL_SCHEMA',
    safeMoveToTrash: 'UNAVAILABLE_BY_TOOL_SCHEMA',
    htmlLocalExport: 'OPTIONAL_NOT_MATERIALIZED_NOT_CLAIMED',
  };
  for (const [field, value] of Object.entries(expected)) {
    if (receipt.connectorCapabilities?.[field] !== value) {
      failures.push(reason('GOOGLE_WHOLE_BOOK_CAPABILITY_MISMATCH', `${field} capability mismatch`));
    }
  }
}

function validateProviderEvidence(receipt, failures) {
  const obs = receipt.providerObservations || {};
  if (obs.importReadback?.documentId !== SYNTHETIC_DOC_ID || obs.importReadback?.titleMatched !== true || obs.importReadback?.nativeGoogleDoc !== true) {
    failures.push(reason('GOOGLE_WHOLE_BOOK_DOCUMENT_READBACK_MISSING', 'initial document readback mismatch'));
  }
  const range = obs.rangeReadback || {};
  if (range.fullReadbackVerified !== true || range.noSampling !== true || range.finalSentinel?.observed !== true) {
    failures.push(reason('GOOGLE_WHOLE_BOOK_FULL_READBACK_MISSING', 'range/tail full readback missing'));
  }
  if (range.firstChapter?.marker !== EXPECTED.markers.firstChapter
    || range.middleChapter?.marker !== EXPECTED.markers.middleChapter
    || range.lastChapter?.marker !== EXPECTED.markers.lastChapter
    || range.finalSentinel?.marker !== EXPECTED.markers.finalSentinel) {
    failures.push(reason('GOOGLE_WHOLE_BOOK_STRUCTURE_MISMATCH', 'range marker mismatch'));
  }
  const text = obs.textOracle || {};
  if (text.oracleSha256 !== EXPECTED.corpus.normalizedOracleSha256
    || text.exportBeforeSha256 !== EXPECTED.exports.textBeforeSha256
    || text.exportAfterSuggestionSha256 !== EXPECTED.exports.textAfterSha256
    || text.exportBeforeBytes !== EXPECTED.exports.textBytes
    || text.exportAfterBytes !== EXPECTED.exports.textBytes
    || text.normalizedExportSha256 !== EXPECTED.exports.normalizedExportSha256
    || text.matchIgnoringSingleTrailingLf !== true
    || text.silentTruncationObserved !== false
    || text.acceptedTextExportUnchangedByPendingSuggestion !== true) {
    failures.push(reason('GOOGLE_WHOLE_BOOK_TEXT_HASH_MISMATCH', 'text export/oracle mismatch'));
  }
  const before = obs.docxStructuralOracle?.beforeSuggestion || {};
  if (before.fileSha256 !== EXPECTED.exports.docxBeforeSha256
    || before.documentXmlSha256 !== EXPECTED.exports.documentXmlBeforeSha256
    || before.headingMarkerCount !== 21
    || before.styleSentinelCount !== 21
    || before.boldCount !== 21
    || before.italicCount !== 21
    || before.underlineSingleCount !== 21
    || before.blueColorCount !== 21
    || before.continuousTextMatchesOracle !== true
    || before.firstMiddleLastAndFinalSentinelPresent !== true) {
    failures.push(reason('GOOGLE_WHOLE_BOOK_STRUCTURE_MISMATCH', 'DOCX before-suggestion structural oracle mismatch'));
  }
  const after = obs.docxStructuralOracle?.afterSuggestion || {};
  if (after.fileSha256 !== EXPECTED.exports.docxAfterSha256
    || after.documentXmlSha256 !== EXPECTED.exports.documentXmlAfterSha256
    || after.insCount !== 1
    || after.delCount !== 1
    || after.delTextCount !== 1
    || after.replacementInInsertion !== true
    || after.originalInDeletion !== true
    || after.deletedTextHasOriginal !== true) {
    failures.push(reason('GOOGLE_WHOLE_BOOK_STRUCTURE_MISMATCH', 'DOCX after-suggestion tracked-change oracle mismatch'));
  }
  if (obs.commentsLifecycle?.createdCommentId !== 'AAACFlsNw88'
    || obs.commentsLifecycle?.quotedText !== EXPECTED.markers.commentTarget
    || obs.commentsLifecycle?.resolveReplyId !== 'AAACFlsNw9A'
    || obs.commentsLifecycle?.finalReadbackResolved !== true) {
    failures.push(reason('GOOGLE_WHOLE_BOOK_COMMENTS_NOT_OBSERVED', 'comments lifecycle missing'));
  }
  const suggestion = obs.nativeSuggestion || {};
  if (suggestion.createdByConnector !== false) failures.push(reason('GOOGLE_WHOLE_BOOK_CONNECTOR_SUGGESTION_FALSE_CLAIM', 'connector cannot be credited for suggestion creation'));
  if (suggestion.createdByScopedUiAutomation !== true
    || suggestion.uiModeBeforeMutation !== 'Советовать'
    || suggestion.sidebarReplacementStatementObserved !== true
    || suggestion.insertionText !== EXPECTED.markers.suggestionReplacement
    || suggestion.deletionText !== EXPECTED.markers.suggestionOriginal
    || suggestion.docxTrackedInsertionCount !== 1
    || suggestion.docxTrackedDeletionCount !== 1
    || suggestion.replacementInInsertion !== true
    || suggestion.originalInDeletion !== true) {
    failures.push(reason('GOOGLE_WHOLE_BOOK_SUGGESTION_NOT_OBSERVED', 'native suggestion evidence mismatch'));
  }
  if (suggestion.falseAutoApplyCount !== 0 || receipt.falseAutoApplyCount !== 0) {
    failures.push(reason('GOOGLE_WHOLE_BOOK_FALSE_AUTO_APPLY_NONZERO', 'pending suggestion must not be counted as auto-applied'));
  }
  if (obs.staleRevisionNegative?.expected !== 'REJECT'
    || obs.staleRevisionNegative?.actual !== 'REJECT'
    || obs.staleRevisionNegative?.rejectedTextAbsentAfterReadback !== true) {
    failures.push(reason('GOOGLE_WHOLE_BOOK_STALE_REVISION_NOT_REJECTED', 'stale revision negative missing'));
  }
  const materialized = obs.exports?.materialized || [];
  if (obs.exports?.htmlLocalExport !== 'OPTIONAL_NOT_MATERIALIZED_NOT_CLAIMED') {
    failures.push(reason('GOOGLE_WHOLE_BOOK_HTML_EXPORT_OVERCLAIM', 'HTML local export must not be claimed'));
  }
  if (materialized.length !== 4 || materialized.some((entry) => !entry.sha256?.startsWith('sha256:'))) {
    failures.push(reason('GOOGLE_WHOLE_BOOK_EXPORT_READBACK_MISSING', 'materialized export digest inventory incomplete'));
  }
  if (obs.cleanup?.exactDocumentIdVerifiedBeforeTrash !== true
    || obs.cleanup?.exactTitleVerifiedBeforeTrash !== true
    || obs.cleanup?.uiTrashAlertObserved !== true
    || obs.cleanup?.permanentDeleteUsed !== false) {
    failures.push(reason('GOOGLE_WHOLE_BOOK_TRASH_NOT_CONFIRMED', 'cleanup evidence missing'));
  }
}

function validateDenominators(receipt, failures) {
  const expected = expectedDenominators();
  if (stableJson(receipt.denominators) !== stableJson(expected)) {
    failures.push(reason('GOOGLE_WHOLE_BOOK_DENOMINATOR_MISMATCH', 'denominators mismatch'));
  }
  if (receipt.fullReadbackVerified !== true) failures.push(reason('GOOGLE_WHOLE_BOOK_FULL_READBACK_MISSING', 'top-level fullReadbackVerified must be true'));
  if (receipt.noSampling !== true) failures.push(reason('GOOGLE_WHOLE_BOOK_FULL_READBACK_MISSING', 'top-level noSampling must be true'));
  if (receipt.applyAuthority !== 'DENY') failures.push(reason('GOOGLE_WHOLE_BOOK_APPLY_OVERCLAIM', 'apply authority must be DENY'));
  if (receipt.productRuntimeWired !== false) failures.push(reason('GOOGLE_WHOLE_BOOK_PRODUCT_RUNTIME_OVERCLAIM', 'product runtime wired must be false'));
  if (receipt.checkpointSha256 !== EXPECTED.checkpointSha256) failures.push(reason('GOOGLE_WHOLE_BOOK_CHECKPOINT_HASH_MISMATCH', 'checkpoint hash mismatch'));
}

export function evaluateGoogleDocsRealAccountWholeBookE2EReceipt(receipt) {
  const failures = [];
  validateExactIdentity(receipt, failures);
  validateScope(receipt, failures);
  validateSyntheticBook(receipt, failures);
  validateSourceFiles(receipt, failures);
  validateArtifacts(receipt, failures);
  validateCapabilities(receipt, failures);
  validateProviderEvidence(receipt, failures);
  validateDenominators(receipt, failures);
  const ok = failures.length === 0;
  return {
    ok,
    status: ok ? STATUS : 'GOOGLE_DOCS_REAL_ACCOUNT_WHOLE_BOOK_E2E_V1_REJECTED',
    verdict: ok ? VERDICT : 'REJECT',
    programVerdict: receipt.programVerdict,
    failures,
    packetDigest: `sha256:${sha256Text(stableJson(receipt))}`,
    syntheticBook: {
      sceneCount: receipt.syntheticBook?.sceneCount,
      paragraphCount: receipt.syntheticBook?.paragraphCount,
      charCount: receipt.syntheticBook?.charCount,
    },
    createdArtifactCount: Array.isArray(receipt.createdArtifacts) ? receipt.createdArtifacts.length : 0,
    createdArtifactsTrashed: Array.isArray(receipt.createdArtifacts)
      ? receipt.createdArtifacts.filter((artifact) => artifact.cleanupState === 'MOVED_TO_TRASH_BY_SCOPED_UI_AUTOMATION').length
      : 0,
    userDocumentsRead: receipt.safetyCounters?.userDocumentsRead,
    userDocumentsMutated: receipt.safetyCounters?.userDocumentsMutated,
    existingDriveDiscoveryUsed: Boolean(
      receipt.safetyCounters?.existingDriveDocumentsSearched
      || receipt.safetyCounters?.existingDriveDocumentsListed
      || receipt.safetyCounters?.existingDriveDocumentsFetched
      || receipt.safetyCounters?.existingDriveDocumentsRead,
    ),
    permanentDeleteUsed: Boolean(receipt.safetyCounters?.permanentDeletes || receipt.createdArtifacts?.some((artifact) => artifact.cleanupEvidence?.permanentDeleteUsed === true)),
    fullReadbackVerified: receipt.fullReadbackVerified,
    noSampling: receipt.noSampling,
    applyAuthority: receipt.applyAuthority,
    productRuntimeWired: receipt.productRuntimeWired,
    denominators: receipt.denominators,
  };
}

function mutate(base, label, mutateFn) {
  const candidate = clone(base);
  mutateFn(candidate);
  return { label, candidate };
}

function summarizeRejections(entries) {
  const results = entries.map((entry) => {
    const result = evaluateGoogleDocsRealAccountWholeBookE2EReceipt(entry.candidate);
    return { label: entry.label, rejected: result.ok === false, firstReason: result.failures[0]?.code || 'NONE' };
  });
  const reasonCounts = {};
  for (const result of results) reasonCounts[result.firstReason] = (reasonCounts[result.firstReason] || 0) + 1;
  return {
    total: results.length,
    survivors: results.filter((result) => !result.rejected).length,
    reasonCounts,
    results,
  };
}

export function runGoogleDocsRealAccountWholeBookHostileCorpus() {
  const base = buildExpectedGoogleDocsRealAccountWholeBookE2EReceipt();
  return summarizeRejections([
    mutate(base, 'smoke-evidence-class', (r) => { r.evidenceClass = 'SMOKE_ONLY'; }),
    mutate(base, 'excerpt-scale', (r) => { r.syntheticBook.sceneCount = 1; r.syntheticBook.paragraphCount = 5; r.syntheticBook.charCount = 310; }),
    mutate(base, 'full-readback-false', (r) => { r.fullReadbackVerified = false; }),
    mutate(base, 'no-sampling-false', (r) => { r.noSampling = false; }),
    mutate(base, 'tail-sentinel-missing', (r) => { r.providerObservations.rangeReadback.finalSentinel.observed = false; }),
    mutate(base, 'chapter-count-mismatch', (r) => { r.syntheticBook.chapterHeadingCount = 20; }),
    mutate(base, 'paragraph-count-mismatch', (r) => { r.syntheticBook.paragraphCount = 380; }),
    mutate(base, 'style-count-mismatch', (r) => { r.providerObservations.docxStructuralOracle.beforeSuggestion.styleSentinelCount = 20; }),
    mutate(base, 'text-hash-mismatch', (r) => { r.providerObservations.textOracle.exportBeforeSha256 = 'sha256:bad'; }),
    mutate(base, 'source-hash-mismatch', (r) => { r.sourceFiles.plainOracle.sha256 = 'sha256:bad'; }),
    mutate(base, 'oracle-mismatch', (r) => { r.providerObservations.textOracle.matchIgnoringSingleTrailingLf = false; }),
    mutate(base, 'wrong-file-id', (r) => { r.createdArtifacts[0].fileId = 'wrong'; }),
    mutate(base, 'wrong-title', (r) => { r.createdArtifacts[0].title = 'wrong'; }),
    mutate(base, 'extra-artifact', (r) => { r.createdArtifacts.push(clone(r.createdArtifacts[0])); }),
    mutate(base, 'not-trashed', (r) => { r.createdArtifacts[0].cleanupState = 'NOT_TRASHED'; }),
    mutate(base, 'missing-trash-alert', (r) => { r.createdArtifacts[0].cleanupEvidence.uiAlertTitle = 'missing'; }),
    mutate(base, 'trash-no-restore-button', (r) => { r.createdArtifacts[0].cleanupEvidence.uiAlertRestoreButtonObserved = false; }),
    mutate(base, 'permanent-delete-artifact', (r) => { r.createdArtifacts[0].cleanupEvidence.permanentDeleteUsed = true; }),
    mutate(base, 'permanent-delete-counter', (r) => { r.safetyCounters.permanentDeletes = 1; }),
    mutate(base, 'user-doc-read', (r) => { r.safetyCounters.userDocumentsRead = 1; }),
    mutate(base, 'user-doc-mutated', (r) => { r.safetyCounters.userDocumentsMutated = 1; }),
    mutate(base, 'drive-search-used', (r) => { r.safetyCounters.existingDriveDocumentsSearched = 1; }),
    mutate(base, 'drive-list-used', (r) => { r.safetyCounters.existingDriveDocumentsListed = 1; }),
    mutate(base, 'drive-fetch-used', (r) => { r.safetyCounters.existingDriveDocumentsFetched = 1; }),
    mutate(base, 'connector-suggestion-laundered', (r) => { r.providerObservations.nativeSuggestion.createdByConnector = true; }),
    mutate(base, 'suggestion-not-observed', (r) => { r.providerObservations.nativeSuggestion.createdByScopedUiAutomation = false; }),
    mutate(base, 'suggestion-replacement-mismatch', (r) => { r.providerObservations.nativeSuggestion.insertionText = 'ordinary edit'; }),
    mutate(base, 'suggestion-original-mismatch', (r) => { r.providerObservations.nativeSuggestion.deletionText = 'other'; }),
    mutate(base, 'suggestion-auto-apply-count', (r) => { r.falseAutoApplyCount = 1; }),
    mutate(base, 'stale-negative-fails', (r) => { r.providerObservations.staleRevisionNegative.actual = 'PASS'; }),
    mutate(base, 'comments-not-resolved', (r) => { r.providerObservations.commentsLifecycle.finalReadbackResolved = false; }),
    mutate(base, 'html-overclaim', (r) => { r.providerObservations.exports.htmlLocalExport = 'PASS'; }),
    mutate(base, 'apply-overclaim', (r) => { r.applyAuthority = 'ALLOW'; }),
    mutate(base, 'runtime-overclaim', (r) => { r.productRuntimeWired = true; }),
  ]);
}

export function runGoogleDocsRealAccountWholeBookSemanticMutationCatalog() {
  const base = buildExpectedGoogleDocsRealAccountWholeBookE2EReceipt();
  return summarizeRejections([
    mutate(base, 'schema', (r) => { r.schemaVersion = 'v0'; }),
    mutate(base, 'status', (r) => { r.status = 'PASS'; }),
    mutate(base, 'verdict', (r) => { r.verdict = 'READY'; }),
    mutate(base, 'program-ready', (r) => { r.programVerdict = 'READY'; }),
    mutate(base, 'baseline', (r) => { r.baselineSha = 'cc49a24b7c384e21cdba617004c4a7a500e6023d'; }),
    mutate(base, 'network-boundary', (r) => { r.authority.network = 'UNBOUNDED'; }),
    mutate(base, 'user-doc-boundary', (r) => { r.authority.userDocumentsForbidden = false; }),
    mutate(base, 'drive-discovery-boundary', (r) => { r.authority.existingDriveDiscoveryForbidden = false; }),
    mutate(base, 'delete-boundary', (r) => { r.authority.permanentDeleteForbidden = false; }),
    mutate(base, 'runtime-boundary', (r) => { r.authority.productRuntimeWiringForbidden = false; }),
    mutate(base, 'native-import-capability', (r) => { r.connectorCapabilities.nativeDocCreateFromLocalHtml = 'UNKNOWN'; }),
    mutate(base, 'write-control-capability', (r) => { r.connectorCapabilities.requiredRevisionIdWriteControl = 'UNKNOWN'; }),
    mutate(base, 'suggestion-capability-overclaim', (r) => { r.connectorCapabilities.createNativeSuggestion = 'PASS'; }),
    mutate(base, 'trash-capability-overclaim', (r) => { r.connectorCapabilities.safeMoveToTrash = 'PASS'; }),
    mutate(base, 'full-text-capability', (r) => { r.connectorCapabilities.fullTextOracle = 'UNKNOWN'; }),
    mutate(base, 'docx-oracle-capability', (r) => { r.connectorCapabilities.docxStructuralOracle = 'UNKNOWN'; }),
    mutate(base, 'denom-created', (r) => { r.denominators.createdSyntheticArtifacts = 2; }),
    mutate(base, 'denom-full-book', (r) => { r.denominators.fullBookCharCount = 310; }),
    mutate(base, 'denom-suggestion', (r) => { r.denominators.nativeSuggestionsObserved = 0; }),
    mutate(base, 'denom-trash', (r) => { r.denominators.trashedSyntheticArtifacts = 0; }),
    mutate(base, 'docx-ins-count', (r) => { r.providerObservations.docxStructuralOracle.afterSuggestion.insCount = 0; }),
    mutate(base, 'bold-count', (r) => { r.providerObservations.docxStructuralOracle.beforeSuggestion.boldCount = 20; }),
    mutate(base, 'accepted-text-changed', (r) => { r.providerObservations.textOracle.acceptedTextExportUnchangedByPendingSuggestion = false; }),
    mutate(base, 'checkpoint-missing', (r) => { r.checkpointSha256 = null; }),
    mutate(base, 'unknown-as-pass', (r) => { r.connectorCapabilities.exportPlainTextMaterialized = 'UNKNOWN'; }),
  ]);
}

function readReceipt(repoRoot) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, RECEIPT_PATH), 'utf8'));
}

function runCheck() {
  const repoRoot = repoRootFromHere();
  const receipt = readReceipt(repoRoot);
  const result = evaluateGoogleDocsRealAccountWholeBookE2EReceipt(receipt);
  if (!result.ok) {
    console.error('GOOGLE_DOCS_REAL_ACCOUNT_WHOLE_BOOK_E2E_V1_STATUS=FAIL');
    console.error(`FAILURES=${JSON.stringify(result.failures)}`);
    process.exit(1);
  }
  const hostile = runGoogleDocsRealAccountWholeBookHostileCorpus();
  const mutations = runGoogleDocsRealAccountWholeBookSemanticMutationCatalog();
  if (hostile.survivors !== 0 || mutations.survivors !== 0) {
    console.error('GOOGLE_DOCS_REAL_ACCOUNT_WHOLE_BOOK_E2E_V1_STATUS=FAIL');
    console.error(`HOSTILE=${JSON.stringify(hostile)}`);
    console.error(`MUTATIONS=${JSON.stringify(mutations)}`);
    process.exit(1);
  }
  console.log('GOOGLE_DOCS_REAL_ACCOUNT_WHOLE_BOOK_E2E_V1_STATUS=PASS');
  console.log(`RECEIPT_SHA256=${sha256File(path.join(repoRoot, RECEIPT_PATH))}`);
  console.log(`PACKET_DIGEST=${result.packetDigest}`);
  console.log(`HOSTILE_TOTAL=${hostile.total}`);
  console.log(`HOSTILE_SURVIVORS=${hostile.survivors}`);
  console.log(`MUTATIONS_TOTAL=${mutations.total}`);
  console.log(`MUTATIONS_SURVIVORS=${mutations.survivors}`);
  console.log(`CREATED_ARTIFACTS=${result.createdArtifactCount}`);
  console.log(`TRASHED_ARTIFACTS=${result.createdArtifactsTrashed}`);
  console.log(`PROGRAM_VERDICT=${result.programVerdict}`);
}

if (process.argv.includes('--check')) {
  runCheck();
}
