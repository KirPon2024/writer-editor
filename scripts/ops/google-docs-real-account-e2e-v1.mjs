#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA_VERSION = 'yalken.googleDocs.realAccountE2E.receipt.v1';
export const TASK_ID = 'GOOGLE_DOCS_REAL_ACCOUNT_E2E_V1';
export const STATUS = 'GOOGLE_DOCS_REAL_ACCOUNT_E2E_V1_SCOPED_VERIFIED';
export const VERDICT = 'SCOPED_REAL_GOOGLE_DOCS_E2E_PASS_WITH_LIMITATIONS';
export const PROGRAM_VERDICT = 'NEEDS_MORE_EVIDENCE';
export const RECEIPT_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_REAL_ACCOUNT_E2E_V1_RECEIPT.json';
export const BASELINE_SHA = 'b3663e35246cdcbc99b21659b97d6ca9a8f00679';
export const SYNTHETIC_DOC_ID = '13kydI5m1GL4gwTwrdI0zqQSp66hQ9pTykA922rd-4uI';
export const SYNTHETIC_TITLE = 'YALKEN_DISPOSABLE_GOOGLE_DOCS_REAL_E2E_V1_20260815T000001Z';
export const SUGGESTION_ID = 'suggest.eztm1x58rb18';

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
    connectorCreatedNativeDocs: 1,
    revisionGuardedContentWrites: 1,
    revisionGuardedFormattingWrites: 1,
    connectorCommentThreadsCreated: 1,
    connectorCommentThreadsResolved: 1,
    nativeSuggestionsObserved: 1,
    staleRevisionNegatives: 1,
    exportsAttempted: 2,
    exportReadbacksPreserved: 1,
    nativeReimportAttempts: 1,
    nativeReimportPasses: 0,
    userDocumentsRead: 0,
    userDocumentsMutated: 0,
    permanentDeletes: 0,
    productMutations: 0,
  };
}

export function buildExpectedGoogleDocsRealAccountE2EReceipt() {
  return {
    schemaVersion: SCHEMA_VERSION,
    taskId: TASK_ID,
    status: STATUS,
    verdict: VERDICT,
    programVerdict: PROGRAM_VERDICT,
    baselineSha: BASELINE_SHA,
    worktreeBranch: 'codex/yalken-google-docs-real-account-e2e-v1',
    provider: 'google-docs',
    evidenceClass: 'REAL_CONNECTED_ACCOUNT_E2E_SYNTHETIC_ONLY',
    connector: 'official-connected-google-drive-docs-tools',
    browserFallback: {
      used: true,
      reason: 'CONNECTOR_CANNOT_CREATE_NATIVE_SUGGESTIONS_OR_MOVE_TO_TRASH',
      browser: 'Chrome extension session',
      navigationBoundary: 'EXACT_SYNTHETIC_DOC_URL_ONLY',
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
    createdArtifacts: [
      {
        artifactRole: 'primarySyntheticGoogleDoc',
        fileId: SYNTHETIC_DOC_ID,
        title: SYNTHETIC_TITLE,
        mimeType: 'application/vnd.google-apps.document',
        source: 'current-run-create-file-result',
        url: `https://docs.google.com/document/d/${SYNTHETIC_DOC_ID}/edit?usp=drivesdk`,
        cleanupState: 'MOVED_TO_TRASH_BY_SCOPED_UI_AUTOMATION',
        cleanupEvidence: {
          uiAlertTitle: 'Файл перемещен в корзину',
          uiAlertTextIncludesTitle: true,
          permanentDeleteUsed: false,
          connectorTrashPrimitiveAvailable: false,
        },
      },
    ],
    connectorCapabilities: {
      nativeDocCreate: 'PASS',
      documentReadback: 'PASS',
      requiredRevisionIdWriteControl: 'PASS',
      formattingReadback: 'PASS',
      commentsCreateReadbackResolve: 'PASS',
      exportDocxFileReference: 'PASS',
      exportPlainTextReference: 'PASS',
      fetchTextReadback: 'PASS',
      revisionHistory: 'PASS',
      createNativeSuggestion: 'UNAVAILABLE_BY_TOOL_SCHEMA',
      safeMoveToTrash: 'UNAVAILABLE_BY_TOOL_SCHEMA',
    },
    providerObservations: {
      initialReadback: {
        documentId: SYNTHETIC_DOC_ID,
        titleMatched: true,
        tabId: 't.0',
        suggestionsViewMode: 'SUGGESTIONS_INLINE',
        revisionId: 'AIroW37xj2eW0aqzd57xi00d8xz-x1-IO4_icZXSLMDsj4MGRN_g5v-UCnq5aaVIeWfNBRfzMdTxFFe9dsTBn1db-V8Vy61zL6g63AdOsGw',
      },
      contentWrite: {
        usedRequiredRevisionId: 'AIroW37xj2eW0aqzd57xi00d8xz-x1-IO4_icZXSLMDsj4MGRN_g5v-UCnq5aaVIeWfNBRfzMdTxFFe9dsTBn1db-V8Vy61zL6g63AdOsGw',
        returnedRevisionId: 'AIroW35HKPqED72J8gr-T5xV-n4D8YfyIjscTcAniPNHZ1CbTKLj2z3WVBzhW3oaAkCo94XpbyksmHXpQJ4nbkMLGGtMZH-o_2pmns9jmBo',
        sentinel: 'YALKEN_E2E_SENTINEL_ALPHA_20260815',
      },
      formattingWrite: {
        matchedText: 'bold italic underline blue phrase',
        range: { tabId: 't.0', startIndex: 114, endIndex: 147 },
        usedRequiredRevisionId: 'AIroW35HKPqED72J8gr-T5xV-n4D8YfyIjscTcAniPNHZ1CbTKLj2z3WVBzhW3oaAkCo94XpbyksmHXpQJ4nbkMLGGtMZH-o_2pmns9jmBo',
        returnedRevisionId: 'AIroW37b5ExKvQo7Icxvpm29vcBCLqS20zWOtKLApYREjR3XV6iqQpr7uYirDZ2vQAqVjqTdZ7GQIp5stP8U8yd5bsNlyKWnyiI5T-rYnCA',
        readback: {
          bold: true,
          italic: true,
          underline: true,
          foregroundColorRgbApprox: { red: 0.050980393, green: 0.2, blue: 0.7490196 },
        },
      },
      commentsLifecycle: {
        createdCommentId: 'AAACFgzl42E',
        quotedText: 'Sentinel: YALKEN_E2E_SENTINEL_ALPHA_20260815.',
        createdReadbackResolved: false,
        resolveReplyId: 'AAACFgzl42I',
        finalReadbackResolved: true,
      },
      nativeSuggestion: {
        createdByConnector: false,
        createdByScopedUiAutomation: true,
        uiModeBeforeMutation: 'Советовать',
        suggestionId: SUGGESTION_ID,
        insertionText: 'SUGGESTION_ACCEPTED_MARKER',
        deletionText: 'QUICK_BROWN_FOX',
        connectorReadbackObservedInsertionId: true,
        connectorReadbackObservedDeletionId: true,
        finalRevisionId: 'AIroW37sEKcBhTL7wyLTbEhG0jVMydhQ4VjBERh9cegmOJ3lMUVvnOylLvVZ9eCQ3KebSuIUnR2Vsvd2iAv_q7MMJ7uitJWIyCTyo0d_ZF8',
      },
      staleRevisionNegative: {
        attemptedRequiredRevisionId: 'AIroW35HKPqED72J8gr-T5xV-n4D8YfyIjscTcAniPNHZ1CbTKLj2z3WVBzhW3oaAkCo94XpbyksmHXpQJ4nbkMLGGtMZH-o_2pmns9jmBo',
        expected: 'REJECT',
        actual: 'REJECT',
        providerStatus: 'INVALID_ARGUMENT',
        providerMessageClass: 'required revision ID does not match latest revision',
      },
      exportAndReadback: {
        docxExport: {
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: 6808,
          fileReferenceMaterializedForImport: false,
          nativeReimportAttempt: 'FAILED_NO_LOCAL_FILE_MATERIALIZATION',
        },
        plainTextExport: { mimeType: 'text/plain', size: 310 },
        fetchReadback: {
          mimeType: 'text/plain',
          sentinelPreserved: true,
          roundtripSentencePreserved: true,
          humanSuggestionTargetPreserved: true,
        },
      },
      revisionHistory: {
        currentRevisionIdBeforeSuggestion: '3',
        previousRevisionId: '1',
        observedRevisionCountBeforeSuggestion: 2,
      },
      permissionObservation: {
        observedAnyoneWriterPermissionBeforeTrash: true,
        allowFileDiscovery: false,
        mitigation: 'MOVED_TO_TRASH_BY_SCOPED_UI_AUTOMATION',
      },
    },
    denominators: expectedDenominators(),
    applyAuthority: 'DENY',
    productRuntimeWired: false,
    nativeSuggestionCreatedByConnector: false,
    nativeSuggestionObserved: true,
    scopedPasses: [
      'native-doc-create',
      'revision-guarded-content-write',
      'revision-guarded-formatting-write',
      'formatting-readback',
      'comment-create-readback-resolve',
      'native-suggestion-ui-create-connector-readback',
      'stale-revision-reject',
      'export-reference-and-text-readback',
      'ui-trash-current-run-synthetic-artifact',
    ],
    limitations: [
      'CONNECTOR_CANNOT_CREATE_NATIVE_SUGGESTIONS',
      'CONNECTOR_CANNOT_MOVE_TO_TRASH_WITH_NONDESTRUCTIVE_TRASH_PRIMITIVE',
      'DOCX_EXPORT_FILE_REFERENCE_COULD_NOT_BE_REIMPORTED_BY_IMPORT_TOOL',
      'ANYONE_WRITER_PERMISSION_WAS_OBSERVED_ON_SYNTHETIC_ARTIFACT_BEFORE_TRASH',
      'NO_GOOGLE_DOCS_PRODUCT_RUNTIME_SUPPORT_CLAIM',
      'NO_IMPORT_APPLY_AUTHORITY',
      'F3_PHYSICAL_OWNER_OFF_HOST_GATES_REMAIN_OPEN',
    ],
    nonClaims: [
      'No existing Drive documents were searched, listed, fetched, read, or changed.',
      'No user manuscript or user document evidence is used.',
      'No permanent delete was used.',
      'No Google Docs product runtime support, import/apply authority, or platform saturation is claimed.',
      'Word 16.112 evidence remains non-transferable to Google Docs.',
      'Overall legacy program verdict remains NEEDS_MORE_EVIDENCE because F3 physical/off-host evidence remains open.',
    ],
    preSuggestionCheckpointSha256: 'sha256:195270c9c04744147b8b3de5cb8fa3da2d73b245d6a231242ccfad3393e4d8c9',
    rollback: {
      repo: 'revert bounded receipt/verifier/test commit',
      provider: 'current-run disposable synthetic artifact moved to trash; restore only if owner explicitly requests audit recovery',
      productDataMigrationRequired: false,
      productRuntimeRollbackRequired: false,
    },
  };
}

function validateExactIdentity(receipt, failures) {
  if (receipt.schemaVersion !== SCHEMA_VERSION) failures.push(reason('GOOGLE_REAL_E2E_SCHEMA_VERSION_MISMATCH', 'schemaVersion mismatch'));
  if (receipt.taskId !== TASK_ID) failures.push(reason('GOOGLE_REAL_E2E_TASK_ID_MISMATCH', 'taskId mismatch'));
  if (receipt.status !== STATUS) failures.push(reason('GOOGLE_REAL_E2E_STATUS_MISMATCH', 'status mismatch'));
  if (receipt.verdict !== VERDICT) failures.push(reason('GOOGLE_REAL_E2E_VERDICT_MISMATCH', 'verdict mismatch'));
  if (receipt.programVerdict !== PROGRAM_VERDICT) failures.push(reason('GOOGLE_REAL_E2E_PROGRAM_VERDICT_MISMATCH', 'program verdict mismatch'));
  if (receipt.baselineSha !== BASELINE_SHA) failures.push(reason('GOOGLE_REAL_E2E_BASELINE_MISMATCH', 'baseline mismatch'));
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
    if (counters[field] !== 0) failures.push(reason('GOOGLE_REAL_E2E_USER_DOC_SCOPE_VIOLATION', `${field} must be 0`));
  }
  if (counters.permanentDeletes !== 0) failures.push(reason('GOOGLE_REAL_E2E_PERMANENT_DELETE_FORBIDDEN', 'permanentDeletes must be 0'));
  if (counters.productMutations !== 0) failures.push(reason('GOOGLE_REAL_E2E_PRODUCT_RUNTIME_OVERCLAIM', 'productMutations must be 0'));
  if (receipt.authority?.network !== 'OWNER_AUTHORIZED_CONNECTED_ACCOUNT_SYNTHETIC_ONLY') {
    failures.push(reason('GOOGLE_REAL_E2E_NETWORK_BOUNDARY_MISMATCH', 'network authority must be connected-account synthetic only'));
  }
  if (receipt.authority?.userDocumentsForbidden !== true) failures.push(reason('GOOGLE_REAL_E2E_USER_DOC_SCOPE_VIOLATION', 'user documents must be forbidden'));
  if (receipt.authority?.existingDriveDiscoveryForbidden !== true) failures.push(reason('GOOGLE_REAL_E2E_USER_DOC_SCOPE_VIOLATION', 'existing Drive discovery must be forbidden'));
  if (receipt.authority?.permanentDeleteForbidden !== true) failures.push(reason('GOOGLE_REAL_E2E_PERMANENT_DELETE_FORBIDDEN', 'permanent delete boundary must be explicit'));
  if (receipt.authority?.productRuntimeWiringForbidden !== true) failures.push(reason('GOOGLE_REAL_E2E_PRODUCT_RUNTIME_OVERCLAIM', 'product runtime wiring must be forbidden'));
}

function validateCapabilities(receipt, failures) {
  const expected = {
    nativeDocCreate: 'PASS',
    documentReadback: 'PASS',
    requiredRevisionIdWriteControl: 'PASS',
    formattingReadback: 'PASS',
    commentsCreateReadbackResolve: 'PASS',
    exportDocxFileReference: 'PASS',
    exportPlainTextReference: 'PASS',
    fetchTextReadback: 'PASS',
    revisionHistory: 'PASS',
    createNativeSuggestion: 'UNAVAILABLE_BY_TOOL_SCHEMA',
    safeMoveToTrash: 'UNAVAILABLE_BY_TOOL_SCHEMA',
  };
  for (const [field, value] of Object.entries(expected)) {
    if (receipt.connectorCapabilities?.[field] !== value) {
      failures.push(reason('GOOGLE_REAL_E2E_CAPABILITY_MISMATCH', `${field} capability mismatch`));
    }
  }
}

function validateArtifacts(receipt, failures) {
  if (!Array.isArray(receipt.createdArtifacts) || receipt.createdArtifacts.length !== 1) {
    failures.push(reason('GOOGLE_REAL_E2E_ARTIFACT_IDENTITY_MISMATCH', 'exactly one current-run synthetic artifact required'));
    return;
  }
  const artifact = receipt.createdArtifacts[0];
  if (artifact.fileId !== SYNTHETIC_DOC_ID || artifact.title !== SYNTHETIC_TITLE) {
    failures.push(reason('GOOGLE_REAL_E2E_ARTIFACT_IDENTITY_MISMATCH', 'synthetic artifact identity mismatch'));
  }
  if (artifact.source !== 'current-run-create-file-result') {
    failures.push(reason('GOOGLE_REAL_E2E_ARTIFACT_IDENTITY_MISMATCH', 'artifact must come from current-run create result'));
  }
  if (artifact.cleanupState !== 'MOVED_TO_TRASH_BY_SCOPED_UI_AUTOMATION') {
    failures.push(reason('GOOGLE_REAL_E2E_TRASH_NOT_CONFIRMED', 'synthetic artifact must be moved to trash'));
  }
  if (artifact.cleanupEvidence?.uiAlertTitle !== 'Файл перемещен в корзину' || artifact.cleanupEvidence?.uiAlertTextIncludesTitle !== true) {
    failures.push(reason('GOOGLE_REAL_E2E_TRASH_NOT_CONFIRMED', 'trash UI alert evidence missing'));
  }
  if (artifact.cleanupEvidence?.permanentDeleteUsed !== false) {
    failures.push(reason('GOOGLE_REAL_E2E_PERMANENT_DELETE_FORBIDDEN', 'permanent delete must be false'));
  }
}

function validateProviderEvidence(receipt, failures) {
  const obs = receipt.providerObservations || {};
  if (obs.initialReadback?.documentId !== SYNTHETIC_DOC_ID || obs.initialReadback?.titleMatched !== true || obs.initialReadback?.tabId !== 't.0') {
    failures.push(reason('GOOGLE_REAL_E2E_DOCUMENT_READBACK_MISSING', 'initial document readback mismatch'));
  }
  if (!obs.contentWrite?.usedRequiredRevisionId || !obs.contentWrite?.returnedRevisionId || obs.contentWrite?.sentinel !== 'YALKEN_E2E_SENTINEL_ALPHA_20260815') {
    failures.push(reason('GOOGLE_REAL_E2E_REVISION_GUARD_MISSING', 'content write revision guard evidence missing'));
  }
  if (obs.formattingWrite?.readback?.bold !== true || obs.formattingWrite?.readback?.italic !== true || obs.formattingWrite?.readback?.underline !== true) {
    failures.push(reason('GOOGLE_REAL_E2E_FORMATTING_NOT_OBSERVED', 'formatting readback missing'));
  }
  if (obs.commentsLifecycle?.createdCommentId !== 'AAACFgzl42E' || obs.commentsLifecycle?.resolveReplyId !== 'AAACFgzl42I' || obs.commentsLifecycle?.finalReadbackResolved !== true) {
    failures.push(reason('GOOGLE_REAL_E2E_COMMENTS_NOT_OBSERVED', 'comments lifecycle missing'));
  }
  const suggestion = obs.nativeSuggestion || {};
  if (suggestion.createdByConnector !== false) failures.push(reason('GOOGLE_REAL_E2E_CONNECTOR_SUGGESTION_FALSE_CLAIM', 'connector cannot be credited for suggestion creation'));
  if (suggestion.createdByScopedUiAutomation !== true || suggestion.uiModeBeforeMutation !== 'Советовать') {
    failures.push(reason('GOOGLE_REAL_E2E_SUGGESTION_NOT_OBSERVED', 'scoped UI suggestion creation missing'));
  }
  if (suggestion.suggestionId !== SUGGESTION_ID || suggestion.insertionText !== 'SUGGESTION_ACCEPTED_MARKER' || suggestion.deletionText !== 'QUICK_BROWN_FOX') {
    failures.push(reason('GOOGLE_REAL_E2E_SUGGESTION_NOT_OBSERVED', 'native suggestion payload mismatch'));
  }
  if (suggestion.connectorReadbackObservedInsertionId !== true || suggestion.connectorReadbackObservedDeletionId !== true) {
    failures.push(reason('GOOGLE_REAL_E2E_SUGGESTION_NOT_OBSERVED', 'connector suggestion readback missing'));
  }
  if (obs.staleRevisionNegative?.expected !== 'REJECT' || obs.staleRevisionNegative?.actual !== 'REJECT') {
    failures.push(reason('GOOGLE_REAL_E2E_STALE_REVISION_NOT_REJECTED', 'stale revision negative missing'));
  }
  if (obs.exportAndReadback?.fetchReadback?.sentinelPreserved !== true || obs.exportAndReadback?.fetchReadback?.roundtripSentencePreserved !== true) {
    failures.push(reason('GOOGLE_REAL_E2E_EXPORT_READBACK_MISSING', 'export/readback preservation missing'));
  }
  if (obs.exportAndReadback?.docxExport?.nativeReimportAttempt !== 'FAILED_NO_LOCAL_FILE_MATERIALIZATION') {
    failures.push(reason('GOOGLE_REAL_E2E_IMPORT_OVERCLAIM', 'native reimport must remain a failed/abstain limitation'));
  }
  if (obs.permissionObservation?.observedAnyoneWriterPermissionBeforeTrash !== true || obs.permissionObservation?.mitigation !== 'MOVED_TO_TRASH_BY_SCOPED_UI_AUTOMATION') {
    failures.push(reason('GOOGLE_REAL_E2E_PERMISSION_OBSERVATION_MISSING', 'permission observation and mitigation must be explicit'));
  }
}

function validateDenominators(receipt, failures) {
  const expected = expectedDenominators();
  if (stableJson(receipt.denominators) !== stableJson(expected)) {
    failures.push(reason('GOOGLE_REAL_E2E_DENOMINATOR_MISMATCH', 'denominators mismatch'));
  }
  if (receipt.applyAuthority !== 'DENY') failures.push(reason('GOOGLE_REAL_E2E_APPLY_OVERCLAIM', 'apply authority must be DENY'));
  if (receipt.productRuntimeWired !== false) failures.push(reason('GOOGLE_REAL_E2E_PRODUCT_RUNTIME_OVERCLAIM', 'product runtime wired must be false'));
  if (receipt.nativeSuggestionCreatedByConnector !== false) failures.push(reason('GOOGLE_REAL_E2E_CONNECTOR_SUGGESTION_FALSE_CLAIM', 'connector suggestion create must be false'));
  if (receipt.nativeSuggestionObserved !== true) failures.push(reason('GOOGLE_REAL_E2E_SUGGESTION_NOT_OBSERVED', 'native suggestion observed must be true'));
  if (receipt.preSuggestionCheckpointSha256 !== 'sha256:195270c9c04744147b8b3de5cb8fa3da2d73b245d6a231242ccfad3393e4d8c9') {
    failures.push(reason('GOOGLE_REAL_E2E_CHECKPOINT_HASH_MISMATCH', 'pre-suggestion checkpoint hash mismatch'));
  }
}

export function evaluateGoogleDocsRealAccountE2EReceipt(receipt) {
  const failures = [];
  validateExactIdentity(receipt, failures);
  validateScope(receipt, failures);
  validateCapabilities(receipt, failures);
  validateArtifacts(receipt, failures);
  validateProviderEvidence(receipt, failures);
  validateDenominators(receipt, failures);
  const ok = failures.length === 0;
  return {
    ok,
    status: ok ? STATUS : 'GOOGLE_DOCS_REAL_ACCOUNT_E2E_V1_REJECTED',
    verdict: ok ? VERDICT : 'REJECT',
    programVerdict: receipt.programVerdict,
    failures,
    packetDigest: `sha256:${sha256Text(stableJson(receipt))}`,
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
    nativeSuggestionObserved: receipt.nativeSuggestionObserved === true,
    nativeSuggestionCreatedByConnector: receipt.nativeSuggestionCreatedByConnector === true,
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

export function runGoogleDocsRealAccountE2EHostileCorpus() {
  const base = buildExpectedGoogleDocsRealAccountE2EReceipt();
  const corpus = [
    mutate(base, 'wrong-file-id', (r) => { r.createdArtifacts[0].fileId = 'wrong'; }),
    mutate(base, 'extra-artifact', (r) => { r.createdArtifacts.push(clone(r.createdArtifacts[0])); }),
    mutate(base, 'not-trashed', (r) => { r.createdArtifacts[0].cleanupState = 'NOT_TRASHED'; }),
    mutate(base, 'missing-trash-alert', (r) => { r.createdArtifacts[0].cleanupEvidence.uiAlertTitle = 'missing'; }),
    mutate(base, 'permanent-delete-artifact', (r) => { r.createdArtifacts[0].cleanupEvidence.permanentDeleteUsed = true; }),
    mutate(base, 'permanent-delete-counter', (r) => { r.safetyCounters.permanentDeletes = 1; }),
    mutate(base, 'user-doc-read', (r) => { r.safetyCounters.userDocumentsRead = 1; }),
    mutate(base, 'user-doc-mutated', (r) => { r.safetyCounters.userDocumentsMutated = 1; }),
    mutate(base, 'drive-search-used', (r) => { r.safetyCounters.existingDriveDocumentsSearched = 1; }),
    mutate(base, 'drive-list-used', (r) => { r.safetyCounters.existingDriveDocumentsListed = 1; }),
    mutate(base, 'drive-fetch-used', (r) => { r.safetyCounters.existingDriveDocumentsFetched = 1; }),
    mutate(base, 'connector-suggestion-laundered', (r) => { r.nativeSuggestionCreatedByConnector = true; }),
    mutate(base, 'suggestion-not-observed', (r) => { r.nativeSuggestionObserved = false; }),
    mutate(base, 'suggestion-id-missing', (r) => { r.providerObservations.nativeSuggestion.suggestionId = null; }),
    mutate(base, 'suggestion-insertion-mismatch', (r) => { r.providerObservations.nativeSuggestion.insertionText = 'ordinary edit'; }),
    mutate(base, 'suggestion-deletion-mismatch', (r) => { r.providerObservations.nativeSuggestion.deletionText = 'other'; }),
    mutate(base, 'suggestion-readback-missing', (r) => { r.providerObservations.nativeSuggestion.connectorReadbackObservedInsertionId = false; }),
    mutate(base, 'stale-negative-fails', (r) => { r.providerObservations.staleRevisionNegative.actual = 'PASS'; }),
    mutate(base, 'formatting-missing', (r) => { r.providerObservations.formattingWrite.readback.bold = false; }),
    mutate(base, 'comments-not-resolved', (r) => { r.providerObservations.commentsLifecycle.finalReadbackResolved = false; }),
    mutate(base, 'export-readback-missing', (r) => { r.providerObservations.exportAndReadback.fetchReadback.sentinelPreserved = false; }),
    mutate(base, 'import-overclaim', (r) => { r.providerObservations.exportAndReadback.docxExport.nativeReimportAttempt = 'PASS'; r.denominators.nativeReimportPasses = 1; }),
    mutate(base, 'apply-overclaim', (r) => { r.applyAuthority = 'ALLOW'; }),
    mutate(base, 'runtime-overclaim', (r) => { r.productRuntimeWired = true; }),
  ];
  const results = corpus.map((entry) => {
    const result = evaluateGoogleDocsRealAccountE2EReceipt(entry.candidate);
    return { label: entry.label, rejected: result.ok === false, firstReason: result.failures[0]?.code || 'NONE' };
  });
  const reasonCounts = {};
  for (const result of results) {
    reasonCounts[result.firstReason] = (reasonCounts[result.firstReason] || 0) + 1;
  }
  return {
    total: results.length,
    survivors: results.filter((result) => !result.rejected).length,
    reasonCounts,
    results,
  };
}

export function runGoogleDocsRealAccountE2ESemanticMutationCatalog() {
  const base = buildExpectedGoogleDocsRealAccountE2EReceipt();
  const mutations = [
    mutate(base, 'schema', (r) => { r.schemaVersion = 'v0'; }),
    mutate(base, 'status', (r) => { r.status = 'PASS'; }),
    mutate(base, 'verdict', (r) => { r.verdict = 'READY'; }),
    mutate(base, 'program-ready', (r) => { r.programVerdict = 'READY'; }),
    mutate(base, 'baseline', (r) => { r.baselineSha = 'cc49a24b7c384e21cdba617004c4a7a500e6023d'; }),
    mutate(base, 'network-boundary', (r) => { r.authority.network = 'UNBOUNDED'; }),
    mutate(base, 'user-doc-boundary', (r) => { r.authority.userDocumentsForbidden = false; }),
    mutate(base, 'drive-discovery-boundary', (r) => { r.authority.existingDriveDiscoveryForbidden = false; }),
    mutate(base, 'delete-boundary', (r) => { r.authority.permanentDeleteForbidden = false; }),
    mutate(base, 'create-capability', (r) => { r.connectorCapabilities.nativeDocCreate = 'UNKNOWN'; }),
    mutate(base, 'write-control', (r) => { r.connectorCapabilities.requiredRevisionIdWriteControl = 'UNKNOWN'; }),
    mutate(base, 'suggestion-capability', (r) => { r.connectorCapabilities.createNativeSuggestion = 'PASS'; }),
    mutate(base, 'trash-capability', (r) => { r.connectorCapabilities.safeMoveToTrash = 'PASS'; }),
    mutate(base, 'denom-created', (r) => { r.denominators.createdSyntheticArtifacts = 2; }),
    mutate(base, 'denom-suggestion', (r) => { r.denominators.nativeSuggestionsObserved = 0; }),
    mutate(base, 'denom-trash', (r) => { r.denominators.trashedSyntheticArtifacts = 0; }),
    mutate(base, 'permission-hidden', (r) => { r.providerObservations.permissionObservation.observedAnyoneWriterPermissionBeforeTrash = false; }),
    mutate(base, 'checkpoint-missing', (r) => { r.preSuggestionCheckpointSha256 = null; }),
  ];
  const results = mutations.map((entry) => {
    const result = evaluateGoogleDocsRealAccountE2EReceipt(entry.candidate);
    return { label: entry.label, rejected: result.ok === false, firstReason: result.failures[0]?.code || 'NONE' };
  });
  return {
    total: results.length,
    survivors: results.filter((result) => !result.rejected).length,
    results,
  };
}

function readReceipt(repoRoot) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, RECEIPT_PATH), 'utf8'));
}

function runCheck() {
  const repoRoot = repoRootFromHere();
  const receipt = readReceipt(repoRoot);
  const result = evaluateGoogleDocsRealAccountE2EReceipt(receipt);
  if (!result.ok) {
    console.error(`GOOGLE_DOCS_REAL_ACCOUNT_E2E_V1_STATUS=FAIL`);
    console.error(`FAILURES=${JSON.stringify(result.failures)}`);
    process.exit(1);
  }
  const hostile = runGoogleDocsRealAccountE2EHostileCorpus();
  const mutations = runGoogleDocsRealAccountE2ESemanticMutationCatalog();
  if (hostile.survivors !== 0 || mutations.survivors !== 0) {
    console.error('GOOGLE_DOCS_REAL_ACCOUNT_E2E_V1_STATUS=FAIL');
    console.error(`HOSTILE=${JSON.stringify(hostile)}`);
    console.error(`MUTATIONS=${JSON.stringify(mutations)}`);
    process.exit(1);
  }
  console.log('GOOGLE_DOCS_REAL_ACCOUNT_E2E_V1_STATUS=PASS');
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
