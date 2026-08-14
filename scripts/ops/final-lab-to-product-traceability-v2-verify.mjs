#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const LEDGER_PATH = 'docs/OPS/STATUS/FINAL_LAB_TO_PRODUCT_TRACEABILITY_V2_LEDGER.json';

export const LEDGER_SCHEMA_VERSION = 'yalken.finalLabToProductTraceability.ledger.v2';

export const ALLOWED_DISPOSITIONS = Object.freeze([
  'ADOPTED_PRODUCT',
  'ADAPTED_PRODUCT',
  'ENFORCED_TEST_GATE',
  'DEFERRED_WITH_BLOCKER',
  'REJECTED_UNSAFE',
  'SUPERSEDED_WITH_REASON',
  'LAB_EVIDENCE_ONLY',
]);

export const PROGRAM_PHASE_SEQUENCE = Object.freeze([
  'S0',
  'F1',
  'F2',
  'F0R_T0',
  'F3',
]);

export const REQUIRED_EXTERNAL_PINS = Object.freeze({
  MULTILINGUAL_V4_INPUT_EXTERNAL_RECEIPT: 'sha256:bebdc6ba2ec3b9bb991593d6081c1b16a441a26076710edf1814d0d950dad132',
  ROUND_AUTHORITY_INPUT_EXTERNAL_RECEIPT: 'sha256:f54ba18e8ad7d3a6109b4b7b24aa4780391d81a915d6192e1f18785325a27de6',
  BLACK_BOX_FINAL_LAB_EXTERNAL_RECEIPT: 'sha256:c6179e59d57ea7ddea0802769619390a274c1bb22c39ae45a1540f8f7f3be863',
});

export const REQUIRED_MATERIAL_IDS = Object.freeze([
  'S0_REVISION_SOURCE_FENCE_V1',
  'S0_REJECTED_SIX_PORT_FOUNDATION',
  'F1_MULTILINGUAL_V4_LAB_INPUT_PIN',
  'F1_MULTILINGUAL_EVIDENCE_READONLY_V1',
  'F1_SOURCE_SNAPSHOT_AUTHORITY_HARDENING_V1',
  'F2_ROUND_AUTHORITY_INPUT_PIN',
  'F2_WORD_16_112_PROVIDER_MIGRATION',
  'F2_WORD_16_112_SMOKE_ONLY_PROVIDER_PROOF',
  'F2_WORD_16_112_SEMANTIC_DIFFERENTIAL',
  'F2_WORD_16_112_NEGATIVE_REPLAY_CRASH',
  'F2_FALSE_DIVERSITY_FINDING',
  'F2_WORD_PHYSICAL_DIVERSITY_HARNESS_REPAIR',
  'F2_WORD_16_112_WAVE10',
  'F2_WORD_16_112_WAVE40',
  'F2_WORD_16_112_WAVE100',
  'F2_WORD_16_112_WAVE300',
  'F2_WORD_16_112_WAVE300_REPEAT',
  'F2_WORD_16_112_SATURATION_LIMITATION_AUDIT',
  'F2_WORD_16_112_TYPED_ADVERSE_SCHEDULES',
  'CROSS_FEATURE_INDEPENDENT_AUDITS',
  'F0R_T0_ROUND_AUTHORITY_PRODUCTIZATION',
  'F3_BLACK_BOX_FINAL_LAB_P0A_P0B_P0C_LESSONS',
  'F3_BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1',
  'F3_BLACK_BOX_PRODUCT_V1',
  'PROGRAM_FINAL_HASH_BOUND_TRACEABILITY_RECEIPT',
]);

const EXACT_LEDGER_KEYS = Object.freeze([
  'schemaVersion',
  'documentClass',
  'status',
  'claimBoundary',
  'generatedAtUtc',
  'exactHead',
  'programPhaseSequence',
  'claimControls',
  'sourcePackagePolicy',
  'currentF2Provider',
  'nonTransferableHistoricalProfiles',
  'externalReceiptPins',
  'materialDispositions',
  'rollback',
]);

function repoRootFromHere() {
  const scriptPath = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(scriptPath), '..', '..');
}

export function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export function sha256File(repoRoot, repoRelativePath) {
  return sha256Bytes(fs.readFileSync(path.join(repoRoot, repoRelativePath)));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, expectedKeys, label, errors) {
  if (!isObject(value)) {
    errors.push(`${label}:NOT_OBJECT`);
    return;
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    errors.push(`${label}:KEYSET_INVALID:${actual.join(',')}`);
  }
}

function requireString(value, label, errors) {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${label}:STRING_REQUIRED`);
    return false;
  }
  return true;
}

function requireArray(value, label, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${label}:NONEMPTY_ARRAY_REQUIRED`);
    return false;
  }
  return true;
}

function isSha256Hex(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function isCommitSha(value) {
  return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
}

function gitAncestor(repoRoot, ancestor, descendant) {
  const result = spawnSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
    cwd: repoRoot,
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  return result.status === 0;
}

function validateExternalPins(ledger, errors) {
  if (!requireArray(ledger.externalReceiptPins, 'externalReceiptPins', errors)) return;
  const byId = new Map();
  for (const pin of ledger.externalReceiptPins) {
    if (!isObject(pin)) {
      errors.push('externalReceiptPins:PIN_NOT_OBJECT');
      continue;
    }
    if (byId.has(pin.id)) errors.push(`externalReceiptPins:DUPLICATE_ID:${pin.id}`);
    byId.set(pin.id, pin);
  }
  for (const [id, expectedDigest] of Object.entries(REQUIRED_EXTERNAL_PINS)) {
    const pin = byId.get(id);
    if (!pin) {
      errors.push(`externalReceiptPins:MISSING_REQUIRED:${id}`);
      continue;
    }
    if (pin.digest !== expectedDigest) errors.push(`externalReceiptPins:DIGEST_MISMATCH:${id}`);
    if (pin.productAuthority !== 'PROVENANCE_ONLY_NOT_RELEASE_AUTHORITY') {
      errors.push(`externalReceiptPins:PRODUCT_AUTHORITY_ESCALATION:${id}`);
    }
  }
}

function validateBinding(repoRoot, materialId, binding, errors) {
  if (!isObject(binding)) {
    errors.push(`materialDispositions:${materialId}:BINDING_NOT_OBJECT`);
    return;
  }
  if (!isCommitSha(binding.commitSha)) errors.push(`materialDispositions:${materialId}:COMMIT_SHA_INVALID`);
  if (!Number.isInteger(binding.prNumber) || binding.prNumber <= 0) {
    errors.push(`materialDispositions:${materialId}:PR_NUMBER_INVALID`);
  }
  if (!requireArray(binding.files, `materialDispositions:${materialId}:files`, errors)) {
    // recorded by helper
  }
  if (!requireArray(binding.tests, `materialDispositions:${materialId}:tests`, errors)) {
    // recorded by helper
  }
  if (!isObject(binding.receipt)) {
    errors.push(`materialDispositions:${materialId}:RECEIPT_OBJECT_REQUIRED`);
    return;
  }
  if (!requireString(binding.receipt.path, `materialDispositions:${materialId}:receipt.path`, errors)) return;
  if (!isSha256Hex(binding.receipt.sha256)) {
    errors.push(`materialDispositions:${materialId}:RECEIPT_SHA256_INVALID`);
    return;
  }
  const receiptPath = path.join(repoRoot, binding.receipt.path);
  if (!fs.existsSync(receiptPath)) {
    errors.push(`materialDispositions:${materialId}:RECEIPT_MISSING:${binding.receipt.path}`);
    return;
  }
  const actual = sha256File(repoRoot, binding.receipt.path);
  if (actual !== binding.receipt.sha256) {
    errors.push(`materialDispositions:${materialId}:RECEIPT_SHA256_MISMATCH`);
  }
  if (isCommitSha(binding.commitSha) && !gitAncestor(repoRoot, binding.commitSha, 'HEAD')) {
    errors.push(`materialDispositions:${materialId}:COMMIT_NOT_REACHABLE_FROM_HEAD`);
  }
}

function validateMaterialDispositions(repoRoot, ledger, errors) {
  if (!requireArray(ledger.materialDispositions, 'materialDispositions', errors)) return;
  const seen = new Set();
  const seenPins = new Set();
  let previousPhaseIndex = -1;
  let hasDeferredOrLabOnly = false;

  for (const entry of ledger.materialDispositions) {
    if (!isObject(entry)) {
      errors.push('materialDispositions:ENTRY_NOT_OBJECT');
      continue;
    }
    requireString(entry.materialId, 'materialDispositions.materialId', errors);
    if (seen.has(entry.materialId)) errors.push(`materialDispositions:DUPLICATE_MATERIAL_ID:${entry.materialId}`);
    seen.add(entry.materialId);

    const phaseIndex = PROGRAM_PHASE_SEQUENCE.indexOf(entry.programPhase);
    if (phaseIndex === -1) {
      errors.push(`materialDispositions:${entry.materialId}:UNKNOWN_PROGRAM_PHASE:${entry.programPhase}`);
    } else if (phaseIndex < previousPhaseIndex) {
      errors.push(`materialDispositions:${entry.materialId}:SEQUENCE_DRIFT`);
    } else {
      previousPhaseIndex = phaseIndex;
    }

    if (!ALLOWED_DISPOSITIONS.includes(entry.disposition)) {
      errors.push(`materialDispositions:${entry.materialId}:UNSUPPORTED_DISPOSITION:${entry.disposition}`);
    }
    if (entry.disposition === 'UNMAPPED') {
      errors.push(`materialDispositions:${entry.materialId}:UNMAPPED_NOT_ALLOWED`);
    }
    if (Array.isArray(entry.sourcePins)) {
      for (const pinId of entry.sourcePins) seenPins.add(pinId);
    }

    if (['ADOPTED_PRODUCT', 'ADAPTED_PRODUCT', 'ENFORCED_TEST_GATE'].includes(entry.disposition)) {
      if (!requireArray(entry.productBindings, `materialDispositions:${entry.materialId}:productBindings`, errors)) {
        continue;
      }
      for (const binding of entry.productBindings) validateBinding(repoRoot, entry.materialId, binding, errors);
      continue;
    }

    if (entry.disposition === 'DEFERRED_WITH_BLOCKER') {
      hasDeferredOrLabOnly = true;
      if (!isObject(entry.deferred) || !entry.deferred.prerequisite || !entry.deferred.owner || !entry.deferred.acceptanceGate) {
        errors.push(`materialDispositions:${entry.materialId}:DEFERRED_BLOCKER_INCOMPLETE`);
      }
      if (Array.isArray(entry.productBindings) && entry.productBindings.length > 0) {
        errors.push(`materialDispositions:${entry.materialId}:DEFERRED_HAS_PRODUCT_BINDING`);
      }
      continue;
    }

    if (entry.disposition === 'LAB_EVIDENCE_ONLY') {
      hasDeferredOrLabOnly = true;
      if (entry.productAuthority !== 'DENY_PRODUCT_AUTHORITY') {
        errors.push(`materialDispositions:${entry.materialId}:LAB_EVIDENCE_PRODUCT_AUTHORITY_NOT_DENIED`);
      }
      if (!entry.preservedProvenance) {
        errors.push(`materialDispositions:${entry.materialId}:LAB_EVIDENCE_MISSING_PROVENANCE`);
      }
      if (Array.isArray(entry.productBindings) && entry.productBindings.length > 0) {
        errors.push(`materialDispositions:${entry.materialId}:LAB_EVIDENCE_HAS_PRODUCT_BINDING`);
      }
      continue;
    }

    if (entry.disposition === 'REJECTED_UNSAFE') {
      if (!entry.rationale || !entry.preservedNegativeEvidence) {
        errors.push(`materialDispositions:${entry.materialId}:REJECTED_NEEDS_RATIONALE_AND_NEGATIVE_EVIDENCE`);
      }
      continue;
    }

    if (entry.disposition === 'SUPERSEDED_WITH_REASON') {
      if (!entry.rationale || !entry.supersededBy) {
        errors.push(`materialDispositions:${entry.materialId}:SUPERSEDED_NEEDS_REASON_AND_SUCCESSOR`);
      }
    }
  }

  for (const materialId of REQUIRED_MATERIAL_IDS) {
    if (!seen.has(materialId)) errors.push(`materialDispositions:MISSING_REQUIRED:${materialId}`);
  }
  for (const pinId of Object.keys(REQUIRED_EXTERNAL_PINS)) {
    if (!seenPins.has(pinId)) errors.push(`materialDispositions:PIN_NOT_MAPPED:${pinId}`);
  }
  if (hasDeferredOrLabOnly && ledger.claimControls?.allLabWorkIntegratedClaimAllowed !== false) {
    errors.push('claimControls:FINAL_INTEGRATION_CLAIM_ALLOWED_WITH_DEFERRED_OR_LAB_ONLY');
  }
}

export function validateFinalLabTraceabilityLedger(ledger, options = {}) {
  const repoRoot = options.repoRoot || repoRootFromHere();
  const errors = [];

  exactKeys(ledger, EXACT_LEDGER_KEYS, 'ledger', errors);
  if (ledger.schemaVersion !== LEDGER_SCHEMA_VERSION) errors.push('schemaVersion:INVALID');
  if (ledger.documentClass !== 'FACTUAL_STATUS') errors.push('documentClass:INVALID');
  if (ledger.status !== 'LIVING_LEDGER_CURRENT_NOT_FINAL_PROGRAM_VERDICT') errors.push('status:INVALID');
  if (ledger.exactHead !== '1cd98056dc091a74b9b7f0fe30356a456b6acfc4') errors.push('exactHead:INVALID');
  if (JSON.stringify(ledger.programPhaseSequence) !== JSON.stringify(PROGRAM_PHASE_SEQUENCE)) {
    errors.push('programPhaseSequence:INVALID');
  }
  if (!isObject(ledger.claimControls)) {
    errors.push('claimControls:OBJECT_REQUIRED');
  } else {
    if (ledger.claimControls.allLabWorkIntegratedClaimAllowed !== false) {
      errors.push('claimControls:ALL_LAB_WORK_INTEGRATED_MUST_BE_FALSE');
    }
    if (ledger.claimControls.finalProgramVerdict !== 'NOT_CLAIMED') {
      errors.push('claimControls:FINAL_PROGRAM_VERDICT_MUST_BE_NOT_CLAIMED');
    }
  }
  if (!isObject(ledger.sourcePackagePolicy) || ledger.sourcePackagePolicy.sealedPackagesImmutable !== true || ledger.sourcePackagePolicy.labEvidenceCreatesProductAuthority !== false) {
    errors.push('sourcePackagePolicy:INVALID');
  }
  if (!isObject(ledger.currentF2Provider) || ledger.currentF2Provider.provider !== 'Microsoft Word for Mac' || ledger.currentF2Provider.version !== '16.112' || ledger.currentF2Provider.build !== '16.112.26081010') {
    errors.push('currentF2Provider:WORD_16_112_BINDING_INVALID');
  }
  if (!Array.isArray(ledger.nonTransferableHistoricalProfiles) || !ledger.nonTransferableHistoricalProfiles.some((profile) => profile.version === '16.111.3' && profile.build === '16.111.26080215' && profile.evidenceTransfer === 'DENY')) {
    errors.push('nonTransferableHistoricalProfiles:WORD_16_111_3_DENY_MISSING');
  }

  validateExternalPins(ledger, errors);
  validateMaterialDispositions(repoRoot, ledger, errors);

  return {
    ok: errors.length === 0,
    schemaVersion: ledger?.schemaVersion || null,
    exactHead: ledger?.exactHead || null,
    materialDispositions: Array.isArray(ledger?.materialDispositions) ? ledger.materialDispositions.length : 0,
    externalPins: Array.isArray(ledger?.externalReceiptPins) ? ledger.externalReceiptPins.length : 0,
    errors,
  };
}

export function readLedger(repoRoot = repoRootFromHere(), ledgerPath = LEDGER_PATH) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, ledgerPath), 'utf8'));
}

export function verifyFinalLabTraceabilityLedger(options = {}) {
  const repoRoot = options.repoRoot || repoRootFromHere();
  const ledger = readLedger(repoRoot, options.ledgerPath || LEDGER_PATH);
  return validateFinalLabTraceabilityLedger(ledger, { repoRoot });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const report = verifyFinalLabTraceabilityLedger();
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 1);
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      errors: ['LEDGER_READ_OR_PARSE_FAILED'],
      message: error instanceof Error ? error.message : String(error),
    }, null, 2));
    process.exit(1);
  }
}
