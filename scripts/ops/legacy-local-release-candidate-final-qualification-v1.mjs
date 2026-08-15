#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const RECEIPT_PATH = 'docs/OPS/STATUS/LEGACY_LOCAL_RELEASE_CANDIDATE_FINAL_QUALIFICATION_V1_RECEIPT.json';
export const QUALIFIED_BASELINE_SHA = 'c60f99346f35eced83930643adee3f3bd20a2bcf';
export const EXPECTED_SCHEMA = 'yalken.legacyLocalReleaseCandidateFinalQualification.receipt.v1';
export const EXPECTED_TASK_ID = 'LEGACY_LOCAL_RELEASE_CANDIDATE_FINAL_QUALIFICATION_V1';
export const EXPECTED_LOCAL_RC_STATUS = 'LOCAL_SOFTWARE_RC_QUALIFIED_PENDING_EXTERNAL_PHYSICAL_GATES';
export const EXPECTED_OVERALL_VERDICT = 'NEEDS_MORE_EVIDENCE';

const REQUIRED_SOURCE_BINDINGS = [
  [
    'FINAL_LAB_TO_PRODUCT_TRACEABILITY_V2_LEDGER',
    'docs/OPS/STATUS/FINAL_LAB_TO_PRODUCT_TRACEABILITY_V2_LEDGER.json',
  ],
  [
    'FINAL_LAB_TO_PRODUCT_TRACEABILITY_V2_RECEIPT',
    'docs/OPS/STATUS/FINAL_LAB_TO_PRODUCT_TRACEABILITY_V2_RECEIPT.json',
  ],
  [
    'YALKEN_S0_REVISION_SOURCE_FENCE_V1',
    'docs/OPS/STATUS/YALKEN_S0_REVISION_SOURCE_FENCE_V1_RECEIPT.json',
  ],
  [
    'F1_MULTILINGUAL_EVIDENCE_V1',
    'docs/OPS/STATUS/YALKEN_F1_MULTILINGUAL_EVIDENCE_V1_RECEIPT.json',
  ],
  [
    'F1_SOURCE_SNAPSHOT_AUTHORITY_HARDENING_V1',
    'docs/OPS/STATUS/YALKEN_F1_SOURCE_SNAPSHOT_AUTHORITY_HARDENING_V1_RECEIPT.json',
  ],
  [
    'WORD_MAC_16_112_PHYSICAL_WAVE300_REPEAT',
    'docs/OPS/RTK/WORD_MAC_16_112_PHYSICAL_WAVE300_REPEAT_RECEIPT.json',
  ],
  [
    'WORD_MAC_16_112_TYPED_ADVERSE_SCHEDULES',
    'docs/OPS/RTK/WORD_MAC_16_112_TYPED_ADVERSE_SCHEDULES_RECEIPT.json',
  ],
  [
    'WORD_MAC_16_112_SATURATION_LIMITATION_AUDIT',
    'docs/OPS/RTK/WORD_MAC_16_112_SATURATION_LIMITATION_AUDIT_RECEIPT.json',
  ],
  [
    'GOOGLE_DOCS_LOCAL_FINAL_COMPATIBILITY_VERDICT_V1',
    'docs/OPS/RTK/GOOGLE_DOCS_LOCAL_FINAL_COMPATIBILITY_VERDICT_V1_RECEIPT.json',
  ],
  [
    'F3_BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1',
    'docs/OPS/STATUS/YALKEN_F3_BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_RECEIPT.json',
  ],
];

const REQUIRED_BLOCKER_IDS = [
  'GOOGLE_DOCS_REAL_ACCOUNT_E2E_AUTHORITY_REQUIRED',
  'F3_REAL_OWNER_KEY_RECOVERY_DRILL_REQUIRED',
  'F3_OFF_HOST_REMOVABLE_MEDIA_RESTORE_REQUIRED',
  'F3_FINAL_COMPLETE_DONOR_EXACT_BYTE_REPLICATION_REQUIRED',
  'F3_PROJECT_LIBRARY_DECISION_REQUIRED',
  'F3_NO_LIVE_PROJECT_OVERWRITE_PHYSICAL_PROOF_REQUIRED',
];

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function sha256File(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function resolveRepoPath(repoRoot, repoRelativePath) {
  return path.resolve(repoRoot, repoRelativePath);
}

function pushError(errors, code, field, expected, actual) {
  errors.push({
    code,
    field,
    expected,
    actual,
  });
}

function requireEqual(errors, field, actual, expected, code = `${field.toUpperCase()}_INVALID`) {
  if (actual !== expected) {
    pushError(errors, code, field, expected, actual);
  }
}

function requireFalse(errors, field, actual, code) {
  if (actual !== false) {
    pushError(errors, code, field, false, actual);
  }
}

function getHeadSha(repoRoot) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_OPTIONAL_LOCKS: '0',
    },
  });
  if (result.status !== 0) return '';
  const sha = normalizeString(result.stdout);
  return /^[0-9a-f]{40}$/u.test(sha) ? sha : '';
}

function isAncestorCommit(repoRoot, ancestorSha, descendantSha) {
  const ancestor = normalizeString(ancestorSha);
  const descendant = normalizeString(descendantSha);
  if (!/^[0-9a-f]{40}$/u.test(ancestor) || !/^[0-9a-f]{40}$/u.test(descendant)) return false;
  const result = spawnSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_OPTIONAL_LOCKS: '0',
    },
  });
  return result.status === 0;
}

function normalizeBindings(receipt) {
  const out = new Map();
  for (const binding of Array.isArray(receipt.sourceBindings) ? receipt.sourceBindings : []) {
    if (!isObjectRecord(binding)) continue;
    const id = normalizeString(binding.id);
    if (id) out.set(id, binding);
  }
  return out;
}

function validateSourceBindings(receipt, errors, repoRoot) {
  const bindingsById = normalizeBindings(receipt);
  for (const [id, repoPath] of REQUIRED_SOURCE_BINDINGS) {
    const binding = bindingsById.get(id);
    if (!binding) {
      pushError(errors, 'SOURCE_BINDING_MISSING', `sourceBindings.${id}`, repoPath, '');
      continue;
    }
    requireEqual(errors, `sourceBindings.${id}.path`, binding.path, repoPath, 'SOURCE_BINDING_PATH_INVALID');

    if (repoRoot) {
      const absPath = resolveRepoPath(repoRoot, repoPath);
      if (!fs.existsSync(absPath)) {
        pushError(errors, 'SOURCE_BINDING_FILE_MISSING', `sourceBindings.${id}.path`, repoPath, 'missing');
        continue;
      }
      const expectedHash = `sha256:${sha256File(absPath)}`;
      requireEqual(
        errors,
        `sourceBindings.${id}.sha256`,
        binding.sha256,
        expectedHash,
        'SOURCE_BINDING_SHA256_MISMATCH',
      );
    } else if (!/^sha256:[0-9a-f]{64}$/u.test(normalizeString(binding.sha256))) {
      pushError(errors, 'SOURCE_BINDING_SHA256_INVALID', `sourceBindings.${id}.sha256`, 'sha256:<64hex>', binding.sha256);
    }
  }
}

function validateTraceabilityLedger(errors, repoRoot) {
  if (!repoRoot) return;
  const ledgerPath = resolveRepoPath(repoRoot, 'docs/OPS/STATUS/FINAL_LAB_TO_PRODUCT_TRACEABILITY_V2_LEDGER.json');
  const ledger = readJson(ledgerPath);
  requireEqual(
    errors,
    'traceabilityLedger.schemaVersion',
    ledger.schemaVersion,
    'yalken.finalLabToProductTraceability.ledger.v2',
    'TRACEABILITY_LEDGER_SCHEMA_INVALID',
  );
  if (!Array.isArray(ledger.materialDispositions) || ledger.materialDispositions.length < 43) {
    pushError(
      errors,
      'TRACEABILITY_MATERIAL_DISPOSITIONS_INCOMPLETE',
      'traceabilityLedger.materialDispositions.length',
      '>=43',
      Array.isArray(ledger.materialDispositions) ? ledger.materialDispositions.length : 'missing',
    );
  }

  const rowIds = new Set((ledger.materialDispositions || []).map((row) => normalizeString(row.materialId)));
  for (const id of [
    'F2_GOOGLE_DOCS_LOCAL_FINAL_COMPATIBILITY_VERDICT_V1',
    'F2_GOOGLE_DOCS_REAL_ACCOUNT_E2E_AUTHORITY_BOUNDARY',
  ]) {
    if (!rowIds.has(id)) {
      pushError(errors, 'TRACEABILITY_REQUIRED_GOOGLE_ROW_MISSING', 'traceabilityLedger.materialDispositions', id, 'missing');
    }
  }
}

function validateFeatureVerdicts(receipt, errors) {
  const verdicts = isObjectRecord(receipt.featureVerdicts) ? receipt.featureVerdicts : {};
  const expected = {
    S0: 'READY',
    F1_MULTILINGUAL: 'READY',
    F2_WORD_16_112: 'READY',
    GOOGLE_DOCS_LOCAL_COMPATIBILITY: 'NEEDS_MORE_EVIDENCE',
    GOOGLE_DOCS_REAL_ACCOUNT_E2E: 'WAIT_AUTHORITY',
    F3_LOCAL_SOFTWARE: 'LOCAL_SOFTWARE_READY_FOR_PHYSICAL_GATES',
    F3_PHYSICAL_OWNER_OFF_HOST: 'NEEDS_MORE_EVIDENCE',
  };
  for (const [key, expectedVerdict] of Object.entries(expected)) {
    const actual = isObjectRecord(verdicts[key]) ? verdicts[key].verdict : undefined;
    requireEqual(errors, `featureVerdicts.${key}.verdict`, actual, expectedVerdict, `FEATURE_VERDICT_${key}_INVALID`);
  }

  const googleReal = isObjectRecord(verdicts.GOOGLE_DOCS_REAL_ACCOUNT_E2E)
    ? verdicts.GOOGLE_DOCS_REAL_ACCOUNT_E2E
    : {};
  const googleDenominator = isObjectRecord(receipt.denominators?.googleDocsRealAccountE2E)
    ? receipt.denominators.googleDocsRealAccountE2E
    : {};
  if (googleReal.verdict !== 'WAIT_AUTHORITY' || googleDenominator.completed !== 0 || googleDenominator.required !== 1) {
    pushError(
      errors,
      'GOOGLE_REAL_ACCOUNT_E2E_MUST_REMAIN_WAIT_AUTHORITY',
      'featureVerdicts.GOOGLE_DOCS_REAL_ACCOUNT_E2E',
      'WAIT_AUTHORITY with 0/1 completed',
      `${googleReal.verdict || 'missing'} ${googleDenominator.completed ?? 'missing'}/${googleDenominator.required ?? 'missing'}`,
    );
  }

  const f3Physical = isObjectRecord(verdicts.F3_PHYSICAL_OWNER_OFF_HOST)
    ? verdicts.F3_PHYSICAL_OWNER_OFF_HOST
    : {};
  const f3Denominator = isObjectRecord(receipt.denominators?.f3PhysicalOwnerOffHostGates)
    ? receipt.denominators.f3PhysicalOwnerOffHostGates
    : {};
  if (f3Physical.verdict !== 'NEEDS_MORE_EVIDENCE' || f3Denominator.completed !== 0 || f3Denominator.required !== 5) {
    pushError(
      errors,
      'F3_PHYSICAL_GATES_MUST_REMAIN_NEEDS_MORE_EVIDENCE',
      'featureVerdicts.F3_PHYSICAL_OWNER_OFF_HOST',
      'NEEDS_MORE_EVIDENCE with 0/5 completed',
      `${f3Physical.verdict || 'missing'} ${f3Denominator.completed ?? 'missing'}/${f3Denominator.required ?? 'missing'}`,
    );
  }

  if (receipt.overallLegacyProgramVerdict === 'READY') {
    pushError(
      errors,
      'OVERALL_READY_FORBIDDEN_WITH_OPEN_BLOCKERS',
      'overallLegacyProgramVerdict',
      EXPECTED_OVERALL_VERDICT,
      receipt.overallLegacyProgramVerdict,
    );
  } else {
    requireEqual(
      errors,
      'overallLegacyProgramVerdict',
      receipt.overallLegacyProgramVerdict,
      EXPECTED_OVERALL_VERDICT,
      'OVERALL_VERDICT_INVALID',
    );
  }
}

function validateDenominators(receipt, errors) {
  const denominators = isObjectRecord(receipt.denominators) ? receipt.denominators : {};
  const googleLocal = isObjectRecord(denominators.googleDocsLocalContours)
    ? denominators.googleDocsLocalContours
    : {};
  if (googleLocal.completed !== 7 || googleLocal.required !== 7) {
    pushError(
      errors,
      'GOOGLE_LOCAL_CONTOUR_DENOMINATOR_INVALID',
      'denominators.googleDocsLocalContours',
      '7/7',
      `${googleLocal.completed ?? 'missing'}/${googleLocal.required ?? 'missing'}`,
    );
  }
  if (denominators.unknownAbstainPassAdmissions !== 0) {
    pushError(
      errors,
      'UNKNOWN_ABSTAIN_PASS_ADMISSION_FORBIDDEN',
      'denominators.unknownAbstainPassAdmissions',
      0,
      denominators.unknownAbstainPassAdmissions,
    );
  }
  if (denominators.userDocumentsUsed !== 0) {
    pushError(errors, 'USER_DOCUMENTS_FORBIDDEN', 'denominators.userDocumentsUsed', 0, denominators.userDocumentsUsed);
  }
  if (denominators.productRuntimeChangesInThisContour !== 0) {
    pushError(
      errors,
      'PRODUCT_RUNTIME_CHANGE_FORBIDDEN_IN_DOCS_CONTOUR',
      'denominators.productRuntimeChangesInThisContour',
      0,
      denominators.productRuntimeChangesInThisContour,
    );
  }
}

function validateReleaseClaims(receipt, errors) {
  const claims = isObjectRecord(receipt.releaseClaims) ? receipt.releaseClaims : {};
  requireFalse(errors, 'releaseClaims.fullReleaseReady', claims.fullReleaseReady, 'FULL_RELEASE_READY_FORBIDDEN');
  requireFalse(
    errors,
    'releaseClaims.platformSaturationClaimed',
    claims.platformSaturationClaimed,
    'PLATFORM_SATURATION_CLAIM_FORBIDDEN',
  );
  requireFalse(
    errors,
    'releaseClaims.googleDocsSupportClaimed',
    claims.googleDocsSupportClaimed,
    'GOOGLE_DOCS_SUPPORT_CLAIM_FORBIDDEN',
  );
  requireFalse(
    errors,
    'releaseClaims.wordEvidenceTransferredToGoogleDocs',
    claims.wordEvidenceTransferredToGoogleDocs,
    'WORD_EVIDENCE_TRANSFER_FORBIDDEN',
  );
  requireFalse(
    errors,
    'releaseClaims.f3DisasterReadyClaimed',
    claims.f3DisasterReadyClaimed,
    'F3_DISASTER_READY_CLAIM_FORBIDDEN',
  );
}

function validateProviderBindings(receipt, errors) {
  const word = isObjectRecord(receipt.providerBindings?.word) ? receipt.providerBindings.word : {};
  const expectedWord = {
    provider: 'Microsoft Word for Mac',
    version: '16.112',
    build: '16.112.26081010',
    bundleIdentifier: 'com.microsoft.Word',
    teamIdentifier: 'UBF8T346G9',
    profileId: 'word-mac-16.112-26081010',
    scope: 'F2_WORD_ONLY_NON_TRANSFERABLE',
  };
  for (const [field, expected] of Object.entries(expectedWord)) {
    if (word[field] !== expected) {
      pushError(
        errors,
        'WORD_16_112_PROVIDER_BINDING_INVALID',
        `providerBindings.word.${field}`,
        expected,
        word[field],
      );
    }
  }

  const google = isObjectRecord(receipt.providerBindings?.googleDocs) ? receipt.providerBindings.googleDocs : {};
  requireEqual(
    errors,
    'providerBindings.googleDocs.realAccountE2E',
    google.realAccountE2E,
    'WAIT_AUTHORITY_REQUIRED',
    'GOOGLE_DOCS_PROVIDER_BINDING_INVALID',
  );
  requireFalse(errors, 'providerBindings.googleDocs.oauthCredentialsUsed', google.oauthCredentialsUsed, 'GOOGLE_CREDENTIALS_FORBIDDEN');
  requireFalse(errors, 'providerBindings.googleDocs.networkRuntimeUsed', google.networkRuntimeUsed, 'GOOGLE_NETWORK_RUNTIME_FORBIDDEN');
}

function validateBlockers(receipt, errors) {
  const blockers = Array.isArray(receipt.openBlockers) ? receipt.openBlockers : [];
  const blockersById = new Map(blockers.map((blocker) => [normalizeString(blocker.blockerId), blocker]));
  for (const blockerId of REQUIRED_BLOCKER_IDS) {
    const blocker = blockersById.get(blockerId);
    if (!blocker) {
      pushError(errors, 'OPEN_BLOCKER_MISSING', `openBlockers.${blockerId}`, 'present', 'missing');
      continue;
    }
    if (!['WAIT_AUTHORITY', 'DEFERRED_WITH_BLOCKER'].includes(blocker.status)) {
      pushError(errors, 'OPEN_BLOCKER_STATUS_INVALID', `openBlockers.${blockerId}.status`, 'WAIT_AUTHORITY_OR_DEFERRED_WITH_BLOCKER', blocker.status);
    }
  }
}

export function validateLegacyLocalReleaseCandidateReceipt(receipt, options = {}) {
  const repoRoot = normalizeString(options.repoRoot || process.cwd());
  const errors = [];
  if (!isObjectRecord(receipt)) {
    return {
      ok: false,
      verdict: 'INVALID',
      localReleaseCandidate: 'INVALID',
      fullReleaseReady: false,
      errors: [
        {
          code: 'RECEIPT_NOT_OBJECT',
          field: 'receipt',
          expected: 'object',
          actual: typeof receipt,
        },
      ],
    };
  }

  requireEqual(errors, 'schemaVersion', receipt.schemaVersion, EXPECTED_SCHEMA, 'SCHEMA_VERSION_INVALID');
  requireEqual(errors, 'taskId', receipt.taskId, EXPECTED_TASK_ID, 'TASK_ID_INVALID');
  requireEqual(errors, 'qualifiedBaselineSha', receipt.qualifiedBaselineSha, QUALIFIED_BASELINE_SHA, 'QUALIFIED_BASELINE_SHA_INVALID');
  requireEqual(errors, 'localReleaseCandidate', receipt.localReleaseCandidate, EXPECTED_LOCAL_RC_STATUS, 'LOCAL_RELEASE_CANDIDATE_STATUS_INVALID');
  requireEqual(errors, 'verdict', receipt.verdict, EXPECTED_OVERALL_VERDICT, 'VERDICT_INVALID');

  if (repoRoot) {
    const headSha = getHeadSha(repoRoot);
    if (headSha && !isAncestorCommit(repoRoot, receipt.qualifiedBaselineSha, headSha)) {
      pushError(
        errors,
        'QUALIFIED_BASELINE_NOT_ANCESTOR_OF_HEAD',
        'qualifiedBaselineSha',
        `ancestor of ${headSha}`,
        receipt.qualifiedBaselineSha,
      );
    }
  }

  validateFeatureVerdicts(receipt, errors);
  validateDenominators(receipt, errors);
  validateReleaseClaims(receipt, errors);
  validateProviderBindings(receipt, errors);
  validateBlockers(receipt, errors);
  validateSourceBindings(receipt, errors, repoRoot);
  validateTraceabilityLedger(errors, repoRoot);

  return {
    ok: errors.length === 0,
    verdict: receipt.verdict || 'INVALID',
    localReleaseCandidate: receipt.localReleaseCandidate || 'INVALID',
    fullReleaseReady: Boolean(receipt.releaseClaims?.fullReleaseReady),
    errors,
  };
}

function parseArgs(argv) {
  return {
    json: argv.includes('--json'),
    check: argv.includes('--check') || argv.length === 0,
  };
}

function stableSort(value) {
  if (Array.isArray(value)) return value.map((entry) => stableSort(entry));
  if (!isObjectRecord(value)) return value;
  const out = {};
  for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
    out[key] = stableSort(value[key]);
  }
  return out;
}

function stableStringify(value) {
  return JSON.stringify(stableSort(value), null, 2);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.check) {
    process.stderr.write('Usage: legacy-local-release-candidate-final-qualification-v1.mjs --check [--json]\n');
    process.exit(2);
  }

  const repoRoot = process.cwd();
  const receiptPath = resolveRepoPath(repoRoot, RECEIPT_PATH);
  let receipt = null;
  try {
    receipt = readJson(receiptPath);
  } catch (error) {
    const payload = {
      ok: false,
      verdict: 'INVALID',
      localReleaseCandidate: 'INVALID',
      fullReleaseReady: false,
      errors: [
        {
          code: 'RECEIPT_READ_FAILED',
          field: RECEIPT_PATH,
          expected: 'readable JSON',
          actual: error instanceof Error ? error.message : String(error),
        },
      ],
    };
    process.stdout.write(`${stableStringify(payload)}\n`);
    process.exit(1);
  }

  const result = validateLegacyLocalReleaseCandidateReceipt(receipt, { repoRoot });
  const payload = {
    ok: result.ok,
    taskId: EXPECTED_TASK_ID,
    qualifiedBaselineSha: receipt.qualifiedBaselineSha || '',
    currentHeadSha: getHeadSha(repoRoot),
    verdict: result.verdict,
    localReleaseCandidate: result.localReleaseCandidate,
    fullReleaseReady: result.fullReleaseReady,
    sourceBindingCount: Array.isArray(receipt.sourceBindings) ? receipt.sourceBindings.length : 0,
    openBlockerCount: Array.isArray(receipt.openBlockers) ? receipt.openBlockers.length : 0,
    errors: result.errors,
  };

  if (args.json) {
    process.stdout.write(`${stableStringify(payload)}\n`);
  } else {
    process.stdout.write(`LEGACY_LOCAL_RC_FINAL_QUALIFICATION_OK=${payload.ok ? 1 : 0}\n`);
    process.stdout.write(`VERDICT=${payload.verdict}\n`);
    process.stdout.write(`LOCAL_RELEASE_CANDIDATE=${payload.localReleaseCandidate}\n`);
    process.stdout.write(`FULL_RELEASE_READY=${payload.fullReleaseReady ? 1 : 0}\n`);
    process.stdout.write(`OPEN_BLOCKERS=${payload.openBlockerCount}\n`);
    if (payload.errors.length > 0) {
      process.stdout.write(`${stableStringify({ errors: payload.errors })}\n`);
    }
  }

  process.exit(result.ok ? 0 : 1);
}

const currentModulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentModulePath) {
  main();
}
