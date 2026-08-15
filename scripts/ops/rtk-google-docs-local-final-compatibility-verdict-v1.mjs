#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA_VERSION = 'yalken.googleDocs.localFinalCompatibilityVerdict.v1';
export const RECEIPT_SCHEMA_VERSION = 'yalken.googleDocs.localFinalCompatibilityVerdict.receipt.v1';
export const TASK_ID = 'GOOGLE_DOCS_LOCAL_FINAL_COMPATIBILITY_VERDICT_V1';
export const STATUS = 'GOOGLE_DOCS_LOCAL_FINAL_COMPATIBILITY_VERDICT_V1_LOCAL_VERIFIED';
export const VERDICT = 'NEEDS_MORE_EVIDENCE';
export const LOCAL_COMPATIBILITY_VERDICT = 'LOCAL_COMPATIBILITY_NEEDS_REAL_GOOGLE_E2E';
export const REAL_GOOGLE_E2E = 'WAIT_AUTHORITY_REQUIRED_FOR_REAL_PROVIDER_EVIDENCE';
export const REAL_GOOGLE_BOUNDARY = 'GOOGLE_DOCS_REAL_ACCOUNT_E2E_AUTHORITY_BOUNDARY';
export const RECEIPT_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_LOCAL_FINAL_COMPATIBILITY_VERDICT_V1_RECEIPT.json';
export const REGISTRY_PATH = 'docs/OPS/RTK/GOOGLE_BUILD_PROFILE_REGISTRY_V1.json';
export const G00_MATRIX_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_CAPABILITY_MATRIX_V1.json';
export const G00_DISCOVERY_RECEIPT_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_DISCOVERY_RECEIPT.json';
export const RTK_CATALOG_PATH = 'docs/OPS/RTK/RTK_TEST_GRAPH_CATALOG_V1.json';
export const CONTRACT_BASENAME = 'rtk-google-docs-local-final-compatibility-verdict.contract.test.js';

const EXPECTED_PROFILE_IDS = Object.freeze([
  'google-docs-office-mode-post-d1-v1',
  'google-docs-native-conversion-post-d1-v1',
]);

const REQUIRED_LOCAL_CONTOURS = Object.freeze([
  {
    contour: 'GOOGLE_DOCS_LOCAL_EXPORT_PACKET_QUARANTINE_V1',
    status: 'GOOGLE_DOCS_LOCAL_EXPORT_PACKET_QUARANTINE_V1_LOCAL_VERIFIED',
    result: 'QUARANTINE_ONLY_NEEDS_REAL_GOOGLE_E2E',
    receiptPath: 'docs/OPS/RTK/GOOGLE_DOCS_LOCAL_EXPORT_PACKET_QUARANTINE_V1_RECEIPT.json',
    evidenceClass: 'LOCAL_EXPORT_PACKET_QUARANTINE_ONLY',
    note: 'Synthetic export packet quarantine evidence only; not Google Docs support, import, roundtrip, or apply evidence.',
  },
  {
    contour: 'GOOGLE_DOCS_LOCAL_SUGGESTIONS_IR_ABSTAIN_V1',
    status: 'GOOGLE_DOCS_LOCAL_SUGGESTIONS_IR_ABSTAIN_V1_LOCAL_VERIFIED',
    result: 'SUGGESTIONS_IR_ABSTAIN_NEEDS_REAL_GOOGLE_E2E',
    receiptPath: 'docs/OPS/RTK/GOOGLE_DOCS_LOCAL_SUGGESTIONS_IR_ABSTAIN_V1_RECEIPT.json',
    evidenceClass: 'LOCAL_SUGGESTIONS_IR_TYPED_ABSTAIN',
    note: 'Synthetic suggestions IR abstain evidence only; suggestions are not trusted without real provider E2E.',
  },
  {
    contour: 'GOOGLE_DOCS_LOCAL_COMMENTS_LIMITATION_V1',
    status: 'GOOGLE_DOCS_LOCAL_COMMENTS_LIMITATION_V1_LOCAL_VERIFIED',
    result: 'COMMENTS_LANE_ABSTAIN_NEEDS_REAL_GOOGLE_E2E',
    receiptPath: 'docs/OPS/RTK/GOOGLE_DOCS_LOCAL_COMMENTS_LIMITATION_V1_RECEIPT.json',
    evidenceClass: 'LOCAL_COMMENTS_TYPED_ABSTAIN',
    note: 'Synthetic comments limitation evidence only; Drive comments are not imported or applied.',
  },
  {
    contour: 'GOOGLE_DOCS_LOCAL_FORMAT_STRUCTURE_MATRIX_V1',
    status: 'GOOGLE_DOCS_LOCAL_FORMAT_STRUCTURE_MATRIX_V1_LOCAL_VERIFIED',
    result: 'FORMAT_STRUCTURE_MATRIX_ABSTAIN_NEEDS_REAL_GOOGLE_E2E',
    receiptPath: 'docs/OPS/RTK/GOOGLE_DOCS_LOCAL_FORMAT_STRUCTURE_MATRIX_V1_RECEIPT.json',
    evidenceClass: 'LOCAL_FORMAT_STRUCTURE_TYPED_ABSTAIN',
    note: 'Synthetic format/structure limitation matrix only; formatting/structure transfer remains unproven without real provider E2E.',
  },
  {
    contour: 'GOOGLE_DOCS_LOCAL_RETURN_INTAKE_QUARANTINE_V1',
    status: 'GOOGLE_DOCS_LOCAL_RETURN_INTAKE_QUARANTINE_V1_LOCAL_VERIFIED',
    result: 'RETURN_INTAKE_QUARANTINE_ONLY_NEEDS_REAL_GOOGLE_E2E',
    receiptPath: 'docs/OPS/RTK/GOOGLE_DOCS_LOCAL_RETURN_INTAKE_QUARANTINE_V1_RECEIPT.json',
    evidenceClass: 'LOCAL_RETURN_INTAKE_QUARANTINE_ONLY',
    note: 'Synthetic returned-artifact intake quarantine only; returned artifacts are not trusted for apply.',
  },
  {
    contour: 'GOOGLE_DOCS_LOCAL_PREVIEW_ONLY_NO_APPLY_V1',
    status: 'GOOGLE_DOCS_LOCAL_PREVIEW_ONLY_NO_APPLY_V1_LOCAL_VERIFIED',
    result: 'PREVIEW_ONLY_NO_APPLY_NEEDS_REAL_GOOGLE_E2E',
    receiptPath: 'docs/OPS/RTK/GOOGLE_DOCS_LOCAL_PREVIEW_ONLY_NO_APPLY_V1_RECEIPT.json',
    evidenceClass: 'LOCAL_PREVIEW_ONLY_NO_APPLY',
    note: 'Synthetic preview-only decision evidence; preview never creates apply/product mutation authority.',
  },
  {
    contour: 'GOOGLE_DOCS_LOCAL_RECOVERY_REPLAY_CONTRACT_V1',
    status: 'GOOGLE_DOCS_LOCAL_RECOVERY_REPLAY_CONTRACT_V1_LOCAL_VERIFIED',
    result: 'RECOVERY_REPLAY_CONTRACT_LOCAL_ONLY_NEEDS_REAL_GOOGLE_E2E',
    receiptPath: 'docs/OPS/RTK/GOOGLE_DOCS_LOCAL_RECOVERY_REPLAY_CONTRACT_V1_RECEIPT.json',
    evidenceClass: 'LOCAL_RECOVERY_REPLAY_NO_WRITE',
    note: 'Synthetic recovery/replay no-write evidence; idempotent quarantine replay only.',
  },
]);

const BOOLEAN_FALSE_FIELDS = Object.freeze([
  'supportClaimed',
  'importClaimed',
  'roundtripClaimed',
  'wordEvidenceTransferred',
  'googleAccountUsed',
  'networkRuntimeUsed',
  'userDocumentsUsed',
]);

const ZERO_FIELDS = Object.freeze([
  'physicalGoogleEvidence',
  'productRuntimeWired',
]);

function repoRootFromHere() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Buffer(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function sha256Text(value) {
  return sha256Buffer(Buffer.from(String(value), 'utf8'));
}

function sha256Json(value) {
  return `sha256:${sha256Text(stableJson(value))}`;
}

function sha256File(absPath) {
  return `sha256:${sha256Buffer(fs.readFileSync(absPath))}`;
}

function readJson(repoRoot, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function writeJson(repoRoot, relativePath, value) {
  const absPath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, `${JSON.stringify(value, null, 2)}\n`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function localContourDigest(repoRoot, receiptPath) {
  return sha256File(path.join(repoRoot, receiptPath));
}

function buildLocalEvidence(repoRoot) {
  return REQUIRED_LOCAL_CONTOURS.map((expected) => {
    const receipt = readJson(repoRoot, expected.receiptPath);
    return {
      contour: expected.contour,
      status: receipt.status,
      result: receipt.result,
      receiptPath: expected.receiptPath,
      receiptSha256: localContourDigest(repoRoot, expected.receiptPath),
      evidenceClass: expected.evidenceClass,
      noProductMutation: receipt.noProductMutation === true,
      physicalGoogleEvidence: 0,
      productRuntimeWired: 0,
      supportClaimed: false,
      importClaimed: false,
      roundtripClaimed: false,
      applyAuthority: 'DENY',
      realAccountE2E: receipt.realAccountE2E,
      note: expected.note,
    };
  });
}

function expectedDenominators() {
  return {
    requiredLocalContours: REQUIRED_LOCAL_CONTOURS.length,
    includedLocalContours: REQUIRED_LOCAL_CONTOURS.length,
    realGoogleE2ERequired: 1,
    realGoogleE2ECompleted: 0,
    supportClaims: 0,
    importClaims: 0,
    roundtripClaims: 0,
    applyAdmissions: 0,
    productMutations: 0,
  };
}

export function buildGoogleDocsLocalFinalCompatibilityVerdictPacket(options = {}) {
  const repoRoot = options.repoRoot || repoRootFromHere();
  const packet = {
    schemaVersion: SCHEMA_VERSION,
    taskId: TASK_ID,
    provider: 'google-docs',
    profileIds: clone(EXPECTED_PROFILE_IDS),
    localOnly: true,
    verdict: VERDICT,
    localCompatibilityVerdict: LOCAL_COMPATIBILITY_VERDICT,
    realAccountE2E: REAL_GOOGLE_E2E,
    requiredNextContour: REAL_GOOGLE_BOUNDARY,
    supportClaimed: false,
    importClaimed: false,
    roundtripClaimed: false,
    applyAuthority: 'DENY',
    productMutationAuthority: 'DENY',
    physicalGoogleEvidence: 0,
    productRuntimeWired: 0,
    googleAccountUsed: false,
    networkRuntimeUsed: false,
    userDocumentsUsed: false,
    wordEvidenceTransferred: false,
    denominators: expectedDenominators(),
    localEvidence: buildLocalEvidence(repoRoot),
    blockers: [
      {
        blockerId: 'GOOGLE_DOCS_REAL_ACCOUNT_E2E_AUTHORITY_BOUNDARY',
        blockerType: 'WAIT_AUTHORITY',
        ownerActionRequired: 'Provide explicit Google account/OAuth/network E2E authority and disposable synthetic test account/session.',
        acceptanceGate: 'Signed-in Google Docs provider E2E on disposable synthetic fixtures with no user documents and no silent loss/apply.',
      },
    ],
    nonClaims: [
      'No Google Docs support is claimed.',
      'No Google Docs import is claimed.',
      'No Google Docs roundtrip is claimed.',
      'No Google Docs apply/product mutation authority is claimed.',
      'No Google API/runtime/network dependency is introduced.',
      'Word 16.112 evidence is non-transferable to Google Docs.',
      'Local synthetic evidence is not a real provider E2E substitute.',
    ],
    limitations: [
      'REAL_GOOGLE_ACCOUNT_E2E_NOT_AUTHORIZED_OR_EXECUTED',
      'GOOGLE_WEB_CLIENT_BUILD_NOT_PINNED',
      'OFFICE_MODE_AND_NATIVE_CONVERSION_REMAIN_DECLARED_ONLY',
      'FORMAT_STRUCTURE_COMMENTS_SUGGESTIONS_IDS_MEDIA_REMAIN_TYPED_LIMITATIONS_WITHOUT_REAL_PROVIDER_E2E',
    ],
  };
  return packet;
}

function failure(code, field, message, packet) {
  return {
    ok: false,
    status: 'FAIL_CLOSED',
    verdict: 'REJECT',
    code,
    field,
    message,
    localCompatibilityVerdict: typeof packet?.localCompatibilityVerdict === 'string' ? packet.localCompatibilityVerdict : '',
    realAccountE2E: typeof packet?.realAccountE2E === 'string' ? packet.realAccountE2E : '',
    packetDigest: packet && typeof packet === 'object' ? sha256Json(packet) : '',
  };
}

function assertNoPassFromUnknownOrAbstain(packet) {
  const terminalPassLike = ['PASS', 'READY', 'SUPPORTED', 'GOOGLE_DOCS_READY', 'FULL_RELEASE_READY'];
  const narrative = stableJson({
    verdict: packet.verdict,
    localCompatibilityVerdict: packet.localCompatibilityVerdict,
    limitations: packet.limitations,
    blockers: packet.blockers,
  });
  if (terminalPassLike.includes(String(packet.verdict || ''))
    || terminalPassLike.includes(String(packet.localCompatibilityVerdict || ''))) {
    if (/\b(UNKNOWN|ABSTAIN|WAIT_AUTHORITY|NEEDS_MORE_EVIDENCE|UNPROVEN)\b/u.test(narrative)) {
      return ['GOOGLE_FINAL_VERDICT_UNKNOWN_ABSTAIN_NOT_PASS', 'verdict', 'UNKNOWN/ABSTAIN/WAIT_AUTHORITY evidence cannot aggregate into terminal PASS'];
    }
    return ['GOOGLE_FINAL_VERDICT_READY_OVERCLAIM', 'verdict', 'Google Docs cannot be terminal READY without real provider E2E'];
  }
  return null;
}

function validateTopLevel(packet) {
  if (!isObjectRecord(packet)) return ['GOOGLE_FINAL_VERDICT_SCHEMA_INVALID', 'packet', 'packet must be an object'];
  if (packet.schemaVersion !== SCHEMA_VERSION) return ['GOOGLE_FINAL_VERDICT_SCHEMA_INVALID', 'schemaVersion', 'schema version mismatch'];
  if (packet.taskId !== TASK_ID) return ['GOOGLE_FINAL_VERDICT_SCHEMA_INVALID', 'taskId', 'task id mismatch'];
  if (packet.provider !== 'google-docs') return ['GOOGLE_FINAL_VERDICT_PROFILE_MISMATCH', 'provider', 'provider must be google-docs'];
  if (!Array.isArray(packet.profileIds) || stableJson(packet.profileIds) !== stableJson(EXPECTED_PROFILE_IDS)) {
    return ['GOOGLE_FINAL_VERDICT_PROFILE_MISMATCH', 'profileIds', 'exact Google Docs profile ids are required'];
  }
  const unknownPass = assertNoPassFromUnknownOrAbstain(packet);
  if (unknownPass) return unknownPass;
  if (packet.localOnly !== true) return ['GOOGLE_FINAL_VERDICT_LOCAL_ONLY_REQUIRED', 'localOnly', 'final verdict is local-only'];
  if (packet.verdict !== VERDICT) return ['GOOGLE_FINAL_VERDICT_READY_OVERCLAIM', 'verdict', 'final local Google verdict must remain NEEDS_MORE_EVIDENCE'];
  if (packet.localCompatibilityVerdict !== LOCAL_COMPATIBILITY_VERDICT) {
    return ['GOOGLE_FINAL_VERDICT_READY_OVERCLAIM', 'localCompatibilityVerdict', 'local compatibility must require real Google E2E'];
  }
  if (packet.realAccountE2E !== REAL_GOOGLE_E2E) {
    return ['GOOGLE_FINAL_VERDICT_REAL_E2E_FALSE_GREEN', 'realAccountE2E', 'real Google E2E remains WAIT_AUTHORITY'];
  }
  if (packet.requiredNextContour !== REAL_GOOGLE_BOUNDARY) {
    return ['GOOGLE_FINAL_VERDICT_REQUIRED_NEXT_CONTOUR_MISMATCH', 'requiredNextContour', 'next contour must be the real-account E2E authority boundary'];
  }
  for (const field of BOOLEAN_FALSE_FIELDS) {
    if (packet[field] !== false) {
      if (field === 'supportClaimed') return ['GOOGLE_FINAL_VERDICT_SUPPORT_OVERCLAIM', field, 'support claim must be false'];
      if (field === 'importClaimed') return ['GOOGLE_FINAL_VERDICT_IMPORT_OVERCLAIM', field, 'import claim must be false'];
      if (field === 'roundtripClaimed') return ['GOOGLE_FINAL_VERDICT_ROUNDTRIP_OVERCLAIM', field, 'roundtrip claim must be false'];
      if (field === 'wordEvidenceTransferred') return ['GOOGLE_FINAL_VERDICT_WORD_EVIDENCE_TRANSFER', field, 'Word evidence is non-transferable'];
      return ['GOOGLE_FINAL_VERDICT_EXTERNAL_AUTHORITY_OVERCLAIM', field, `${field} must be false`];
    }
  }
  for (const field of ZERO_FIELDS) {
    if (packet[field] !== 0) {
      return ['GOOGLE_FINAL_VERDICT_EXTERNAL_AUTHORITY_OVERCLAIM', field, `${field} must be 0`];
    }
  }
  if (packet.applyAuthority !== 'DENY') return ['GOOGLE_FINAL_VERDICT_APPLY_OVERCLAIM', 'applyAuthority', 'apply authority must be DENY'];
  if (packet.productMutationAuthority !== 'DENY') return ['GOOGLE_FINAL_VERDICT_PRODUCT_MUTATION_OVERCLAIM', 'productMutationAuthority', 'product mutation authority must be DENY'];
  if (stableJson(packet.denominators) !== stableJson(expectedDenominators())) {
    return ['GOOGLE_FINAL_VERDICT_DENOMINATOR_MISMATCH', 'denominators', 'denominators must remain exact and honest'];
  }
  if (!Array.isArray(packet.blockers)
    || packet.blockers.length !== 1
    || packet.blockers[0]?.blockerId !== REAL_GOOGLE_BOUNDARY
    || packet.blockers[0]?.blockerType !== 'WAIT_AUTHORITY') {
    return ['GOOGLE_FINAL_VERDICT_BLOCKER_MISMATCH', 'blockers', 'real Google E2E WAIT_AUTHORITY blocker is required'];
  }
  if (!Array.isArray(packet.limitations)
    || packet.limitations.some((item) => /^(UNKNOWN|ABSTAIN)$/u.test(String(item || '').trim()))) {
    return ['GOOGLE_FINAL_VERDICT_UNKNOWN_ABSTAIN_NOT_PASS', 'limitations', 'limitations must be typed, not raw UNKNOWN/ABSTAIN'];
  }
  return null;
}

function validateLocalEvidence(packet, repoRoot) {
  if (!Array.isArray(packet.localEvidence)) {
    return ['GOOGLE_FINAL_VERDICT_LOCAL_EVIDENCE_MISSING', 'localEvidence', 'local evidence array is required'];
  }
  if (packet.localEvidence.length !== REQUIRED_LOCAL_CONTOURS.length) {
    return ['GOOGLE_FINAL_VERDICT_LOCAL_EVIDENCE_MISSING', 'localEvidence', 'all local contours must be included'];
  }
  const seen = new Set();
  for (const evidence of packet.localEvidence) {
    if (!isObjectRecord(evidence)) return ['GOOGLE_FINAL_VERDICT_LOCAL_EVIDENCE_MISSING', 'localEvidence', 'local evidence entries must be objects'];
    if (seen.has(evidence.contour)) return ['GOOGLE_FINAL_VERDICT_DUPLICATE_EVIDENCE', 'localEvidence', `duplicate ${evidence.contour}`];
    seen.add(evidence.contour);
  }
  for (const expected of REQUIRED_LOCAL_CONTOURS) {
    const evidence = packet.localEvidence.find((entry) => entry?.contour === expected.contour);
    if (!evidence) return ['GOOGLE_FINAL_VERDICT_LOCAL_EVIDENCE_MISSING', 'localEvidence', `missing ${expected.contour}`];
    if (evidence.status !== expected.status || evidence.result !== expected.result || evidence.receiptPath !== expected.receiptPath) {
      return ['GOOGLE_FINAL_VERDICT_LOCAL_EVIDENCE_MISMATCH', `localEvidence.${expected.contour}`, 'local evidence status/result/path mismatch'];
    }
    if (evidence.receiptSha256 !== localContourDigest(repoRoot, expected.receiptPath)) {
      return ['GOOGLE_FINAL_VERDICT_RECEIPT_HASH_MISMATCH', `localEvidence.${expected.contour}.receiptSha256`, 'local evidence receipt hash drift'];
    }
    if (evidence.realAccountE2E !== REAL_GOOGLE_E2E) {
      return ['GOOGLE_FINAL_VERDICT_REAL_E2E_FALSE_GREEN', `localEvidence.${expected.contour}.realAccountE2E`, 'local contour must keep real Google E2E WAIT_AUTHORITY'];
    }
    if (evidence.noProductMutation !== true
      || evidence.physicalGoogleEvidence !== 0
      || evidence.productRuntimeWired !== 0
      || evidence.supportClaimed !== false
      || evidence.importClaimed !== false
      || evidence.roundtripClaimed !== false
      || evidence.applyAuthority !== 'DENY') {
      return ['GOOGLE_FINAL_VERDICT_LOCAL_EVIDENCE_OVERCLAIM', `localEvidence.${expected.contour}`, 'local evidence may not claim physical/provider/product/apply authority'];
    }
  }
  return null;
}

export function evaluateGoogleDocsLocalFinalCompatibilityVerdict(packet, options = {}) {
  const repoRoot = options.repoRoot || repoRootFromHere();
  const topLevelError = validateTopLevel(packet);
  if (topLevelError) return failure(...topLevelError, packet);
  const evidenceError = validateLocalEvidence(packet, repoRoot);
  if (evidenceError) return failure(...evidenceError, packet);
  return {
    ok: true,
    status: STATUS,
    verdict: VERDICT,
    localCompatibilityVerdict: LOCAL_COMPATIBILITY_VERDICT,
    realAccountE2E: REAL_GOOGLE_E2E,
    requiredNextContour: REAL_GOOGLE_BOUNDARY,
    supportClaimed: false,
    importClaimed: false,
    roundtripClaimed: false,
    applyAuthority: 'DENY',
    productMutationAuthority: 'DENY',
    physicalGoogleEvidence: 0,
    productRuntimeWired: 0,
    wordEvidenceTransferred: false,
    denominators: expectedDenominators(),
    packetDigest: sha256Json(packet),
  };
}

function finalReceipt(packet, result) {
  return {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    taskId: TASK_ID,
    status: result.status,
    verdict: result.verdict,
    localCompatibilityVerdict: result.localCompatibilityVerdict,
    realAccountE2E: result.realAccountE2E,
    requiredNextContour: result.requiredNextContour,
    supportClaimed: false,
    importClaimed: false,
    roundtripClaimed: false,
    applyAuthority: 'DENY',
    productMutationAuthority: 'DENY',
    physicalGoogleEvidence: 0,
    productRuntimeWired: 0,
    wordEvidenceTransferred: false,
    noProductMutation: true,
    userDocumentsUsed: false,
    googleAccountUsed: false,
    networkRuntimeUsed: false,
    packetDigest: result.packetDigest,
    denominators: result.denominators,
    localEvidence: packet.localEvidence,
    blockers: packet.blockers,
    limitations: packet.limitations,
    nonClaims: packet.nonClaims,
    rollback: {
      type: 'REVERT_BOUNDED_PR',
      productDataMigrationRequired: false,
      productRuntimeRollbackRequired: false,
    },
  };
}

function finalVerdictSummary(finalReceiptSha256) {
  return {
    status: STATUS,
    verdict: VERDICT,
    localCompatibilityVerdict: LOCAL_COMPATIBILITY_VERDICT,
    result: 'LOCAL_SYNTHETIC_COMPATIBILITY_VERDICT_NEEDS_REAL_GOOGLE_E2E',
    receiptPath: RECEIPT_PATH,
    receiptSha256: finalReceiptSha256,
    localOnly: true,
    noProductMutation: true,
    physicalGoogleEvidence: 0,
    productRuntimeWired: 0,
    supportClaimed: false,
    importClaimed: false,
    roundtripClaimed: false,
    applyAuthority: 'DENY',
    productMutationAuthority: 'DENY',
    realAccountE2E: REAL_GOOGLE_E2E,
    requiredNextContour: REAL_GOOGLE_BOUNDARY,
  };
}

function upsertDiscoveryHead(registry, entry) {
  const heads = Array.isArray(registry.discoveryHeads) ? registry.discoveryHeads : [];
  const next = heads.filter((head) => head.path !== entry.path);
  const recoveryIndex = next.findIndex((head) => head.path === 'docs/OPS/RTK/GOOGLE_DOCS_LOCAL_RECOVERY_REPLAY_CONTRACT_V1_RECEIPT.json');
  if (recoveryIndex >= 0) next.splice(recoveryIndex + 1, 0, entry);
  else next.push(entry);
  registry.discoveryHeads = next;
}

function upsertArrayValue(values, value) {
  if (!Array.isArray(values)) return [value];
  return values.includes(value) ? values : [...values, value];
}

function upsertMatrixFinalCell(matrix) {
  const cell = {
    cellId: 'google.localFinalCompatibilityVerdict',
    currentTerminalClass: 'LOCAL_ONLY_NEEDS_MORE_EVIDENCE',
    userFacingAuthority: 'NO_GOOGLE_SUPPORT_IMPORT_ROUNDTRIP_APPLY_AUTHORITY',
    reasonCode: 'GOOGLE_LOCAL_FINAL_VERDICT_NEEDS_REAL_ACCOUNT_E2E',
    requiredNextContour: REAL_GOOGLE_BOUNDARY,
    blocksGoogleStage: true,
    physicalEvidence: false,
  };
  const cells = Array.isArray(matrix.capabilityCells) ? matrix.capabilityCells : [];
  const index = cells.findIndex((entry) => entry.cellId === cell.cellId);
  if (index >= 0) cells[index] = cell;
  else cells.push(cell);
  for (const entry of cells) {
    if (entry?.cellId === 'google.previewDecisionCommandApply'
      || entry?.cellId === 'google.recoveryReopenReplay') {
      entry.requiredNextContour = REAL_GOOGLE_BOUNDARY;
    }
  }
  matrix.capabilityCells = cells;
}

function applyFinalState(container, finalReceiptSha256) {
  const summary = finalVerdictSummary(finalReceiptSha256);
  container.googleCurrentState = {
    ...(isObjectRecord(container.googleCurrentState) ? container.googleCurrentState : {}),
    supportClaimed: false,
    importClaimed: false,
    roundtripClaimed: false,
    applyAuthorityClaimed: false,
    physicalGoogleEvidence: 0,
    productRuntimeWired: 0,
    googleStageDone: false,
    localCompatibilityVerdict: LOCAL_COMPATIBILITY_VERDICT,
    finalLocalVerdict: VERDICT,
    realAccountE2E: REAL_GOOGLE_E2E,
    nextLocalContour: REAL_GOOGLE_BOUNDARY,
  };
  if (isObjectRecord(container.currentRealityAudit)) {
    container.currentRealityAudit = {
      ...container.currentRealityAudit,
      localCompatibilityVerdict: LOCAL_COMPATIBILITY_VERDICT,
      realAccountE2E: REAL_GOOGLE_E2E,
      finalLocalVerdict: VERDICT,
      finalLocalVerdictReceiptPath: RECEIPT_PATH,
      finalLocalVerdictReceiptSha256: finalReceiptSha256,
      nextLocalContour: REAL_GOOGLE_BOUNDARY,
    };
  }
  container.nextLocalContour = REAL_GOOGLE_BOUNDARY;
  container.realAccountE2E = REAL_GOOGLE_E2E;
  container.localFinalCompatibilityVerdict = summary;
  container.nonClaims = upsertArrayValue(
    upsertArrayValue(
      upsertArrayValue(container.nonClaims, 'Local Google Docs compatibility verdict remains NEEDS_MORE_EVIDENCE until real signed-in Google Docs E2E is authorized and executed.'),
      'Final local Google Docs verdict does not create support/import/roundtrip/apply/product mutation authority.',
    ),
    'UNKNOWN/ABSTAIN/WAIT_AUTHORITY evidence cannot aggregate into Google Docs terminal PASS.',
  );
}

export function updateRepositoryBindings(options = {}) {
  const repoRoot = options.repoRoot || repoRootFromHere();
  const packet = buildGoogleDocsLocalFinalCompatibilityVerdictPacket({ repoRoot });
  const result = evaluateGoogleDocsLocalFinalCompatibilityVerdict(packet, { repoRoot });
  if (!result.ok) {
    throw new Error(`${result.code}: ${result.field}: ${result.message}`);
  }

  writeJson(repoRoot, RECEIPT_PATH, finalReceipt(packet, result));
  const finalReceiptSha256 = localContourDigest(repoRoot, RECEIPT_PATH);

  const matrix = readJson(repoRoot, G00_MATRIX_PATH);
  applyFinalState(matrix, finalReceiptSha256);
  upsertMatrixFinalCell(matrix);
  writeJson(repoRoot, G00_MATRIX_PATH, matrix);

  const discovery = readJson(repoRoot, G00_DISCOVERY_RECEIPT_PATH);
  applyFinalState(discovery, finalReceiptSha256);
  writeJson(repoRoot, G00_DISCOVERY_RECEIPT_PATH, discovery);

  const registry = readJson(repoRoot, REGISTRY_PATH);
  upsertDiscoveryHead(registry, {
    path: RECEIPT_PATH,
    sha256: finalReceiptSha256,
    note: 'Final local Google Docs compatibility verdict — local synthetic evidence aggregate only; still NEEDS_MORE_EVIDENCE and blocked on real signed-in Google Docs E2E authority.',
  });
  for (const head of registry.discoveryHeads || []) {
    if (fs.existsSync(path.join(repoRoot, head.path))) {
      head.sha256 = localContourDigest(repoRoot, head.path);
    }
  }
  writeJson(repoRoot, REGISTRY_PATH, registry);

  const catalog = readJson(repoRoot, RTK_CATALOG_PATH);
  catalog.contractBasenames = upsertArrayValue(catalog.contractBasenames, CONTRACT_BASENAME).sort();
  catalog.currentTruthBinding = {
    ...(isObjectRecord(catalog.currentTruthBinding) ? catalog.currentTruthBinding : {}),
    googleStage: 'LOCAL_COMPATIBILITY_VERDICT_NEEDS_REAL_ACCOUNT_E2E',
    googleLocalFinalCompatibilityVerdict: STATUS,
  };
  writeJson(repoRoot, RTK_CATALOG_PATH, catalog);

  return {
    result,
    finalReceiptSha256,
  };
}

function validateRepositoryBindings(repoRoot) {
  const errors = [];
  const packet = buildGoogleDocsLocalFinalCompatibilityVerdictPacket({ repoRoot });
  const result = evaluateGoogleDocsLocalFinalCompatibilityVerdict(packet, { repoRoot });
  if (!result.ok) errors.push(`${result.code}:${result.field}`);
  if (!fs.existsSync(path.join(repoRoot, RECEIPT_PATH))) {
    errors.push('missing final receipt');
    return errors;
  }
  const finalReceiptSha256 = localContourDigest(repoRoot, RECEIPT_PATH);
  const receipt = readJson(repoRoot, RECEIPT_PATH);
  if (receipt.status !== STATUS) errors.push('receipt status mismatch');
  if (receipt.verdict !== VERDICT) errors.push('receipt verdict mismatch');
  if (receipt.localCompatibilityVerdict !== LOCAL_COMPATIBILITY_VERDICT) errors.push('receipt localCompatibilityVerdict mismatch');
  if (receipt.realAccountE2E !== REAL_GOOGLE_E2E) errors.push('receipt realAccountE2E mismatch');
  if (receipt.packetDigest !== result.packetDigest) errors.push('receipt packet digest mismatch');
  for (const evidence of receipt.localEvidence || []) {
    if (evidence.receiptSha256 !== localContourDigest(repoRoot, evidence.receiptPath)) {
      errors.push(`receipt local evidence digest mismatch: ${evidence.contour}`);
    }
  }

  const matrix = readJson(repoRoot, G00_MATRIX_PATH);
  if (matrix.googleCurrentState?.localCompatibilityVerdict !== LOCAL_COMPATIBILITY_VERDICT) errors.push('matrix localCompatibilityVerdict mismatch');
  if (matrix.googleCurrentState?.finalLocalVerdict !== VERDICT) errors.push('matrix finalLocalVerdict mismatch');
  if (matrix.googleCurrentState?.nextLocalContour !== REAL_GOOGLE_BOUNDARY) errors.push('matrix nextLocalContour mismatch');
  if (matrix.localFinalCompatibilityVerdict?.status !== STATUS) errors.push('matrix localFinalCompatibilityVerdict status mismatch');
  if (matrix.localFinalCompatibilityVerdict?.receiptSha256 !== finalReceiptSha256) errors.push('matrix final receipt hash mismatch');

  const discovery = readJson(repoRoot, G00_DISCOVERY_RECEIPT_PATH);
  if (discovery.googleCurrentState?.localCompatibilityVerdict !== LOCAL_COMPATIBILITY_VERDICT) errors.push('discovery localCompatibilityVerdict mismatch');
  if (discovery.googleCurrentState?.finalLocalVerdict !== VERDICT) errors.push('discovery finalLocalVerdict mismatch');
  if (discovery.nextLocalContour !== REAL_GOOGLE_BOUNDARY) errors.push('discovery nextLocalContour mismatch');
  if (discovery.localFinalCompatibilityVerdict?.receiptSha256 !== finalReceiptSha256) errors.push('discovery final receipt hash mismatch');

  const registry = readJson(repoRoot, REGISTRY_PATH);
  const finalHead = (registry.discoveryHeads || []).find((entry) => entry.path === RECEIPT_PATH);
  if (!finalHead || finalHead.sha256 !== finalReceiptSha256) errors.push('registry final discovery head mismatch');
  for (const head of registry.discoveryHeads || []) {
    if (fs.existsSync(path.join(repoRoot, head.path)) && head.sha256 !== localContourDigest(repoRoot, head.path)) {
      errors.push(`registry discovery head hash mismatch: ${head.path}`);
    }
  }

  const catalog = readJson(repoRoot, RTK_CATALOG_PATH);
  if (!catalog.contractBasenames?.includes(CONTRACT_BASENAME)) errors.push('catalog missing contract basename');
  if (catalog.currentTruthBinding?.googleLocalFinalCompatibilityVerdict !== STATUS) errors.push('catalog final verdict binding mismatch');
  return errors;
}

function printResult(prefix, value) {
  console.log(`${prefix}=${value}`);
}

function main() {
  const repoRoot = repoRootFromHere();
  if (process.argv.includes('--write')) {
    const written = updateRepositoryBindings({ repoRoot });
    printResult('GOOGLE_DOCS_LOCAL_FINAL_COMPATIBILITY_VERDICT_WRITE', 'PASS');
    printResult('FINAL_RECEIPT_SHA256', written.finalReceiptSha256);
  }
  const errors = validateRepositoryBindings(repoRoot);
  if (errors.length > 0) {
    printResult('GOOGLE_DOCS_LOCAL_FINAL_COMPATIBILITY_VERDICT_STATUS', 'FAIL');
    for (const error of errors) printResult('ERROR', error);
    process.exit(1);
  }
  printResult('GOOGLE_DOCS_LOCAL_FINAL_COMPATIBILITY_VERDICT_STATUS', 'PASS');
  printResult('STATUS', STATUS);
  printResult('VERDICT', VERDICT);
  printResult('LOCAL_COMPATIBILITY_VERDICT', LOCAL_COMPATIBILITY_VERDICT);
  printResult('REAL_GOOGLE_E2E', REAL_GOOGLE_E2E);
  printResult('REQUIRED_NEXT_CONTOUR', REAL_GOOGLE_BOUNDARY);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
