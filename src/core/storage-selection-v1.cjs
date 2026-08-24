'use strict';

// WP-203 joins the already-certified R2 bakeoff and R3 recovery ledger.
// It is deliberately selection-only: no live path, migration, or dependency
// authority can be derived from this module.

const crypto = require('node:crypto');

const {
  STORAGE_BAKEOFF_SCHEMA_VERSION,
  CANDIDATE_REGISTRY,
  applyHardSafetyFilters,
} = require('./storage-bakeoff-v1.cjs');
const {
  RECOVERY_LEDGER_SCHEMA_VERSION,
  openRecoveryLedger,
} = require('./recovery-ledger-v1.cjs');

const STORAGE_SELECTION_SCHEMA_VERSION = 'yalken.storageSelection.v1';
const EXPECTED_MISSION_DIGEST = '2d188140211c4e2a65f0f1bf1bef5bac53e396e3c3887cb3563fa253a10b0c80';
const EXPECTED_GATE_ID = 'STORAGE_AUTHORITY_ADR';
const EXPECTED_DECISION_ID = 'STORAGE_AUTHORITY_ADR_R2_STORAGE_BAKEOFF_V1';
const EXPECTED_DECISION_NODE_ID = 'R2_STORAGE_BAKEOFF';
const EXPECTED_TASK_ID = 'YALKEN-R24-R2-STORAGE-BAKEOFF-001';
const SELECTED_RECOVERY_LEDGER_ID = 'recovery-ledger-v1';
const EXPECTED_CANDIDATE_IDS = Object.freeze(Object.keys(CANDIDATE_REGISTRY).sort());

class StorageSelectionError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
  }
}

const isPlainObject = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

const sha256Canonical = (value) => crypto
  .createHash('sha256')
  .update(JSON.stringify(canonicalize(value)), 'utf8')
  .digest('hex');

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function validateSha(value, code) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) {
    throw new StorageSelectionError(code, String(value));
  }
}

function validateOwnerDecision(decision) {
  if (!isPlainObject(decision)) throw new StorageSelectionError('E_STORAGE_SELECTION_OWNER_DECISION_SHAPE');
  if (decision.schemaVersion !== 'yalken.owner-gate-decision.r24.v1'
    || decision.approvedBy !== 'owner:OWNER_DECISION_STORAGE_AUTHORITY_ADR_APPROVED') {
    throw new StorageSelectionError('E_STORAGE_SELECTION_OWNER_DECISION_AUTHORITY');
  }
  if (decision.decision !== 'APPROVED') throw new StorageSelectionError('E_STORAGE_SELECTION_OWNER_GATE', String(decision.decision));
  if (decision.decisionId !== EXPECTED_DECISION_ID
    || decision.missionDigest !== EXPECTED_MISSION_DIGEST
    || decision.gateId !== EXPECTED_GATE_ID
    || decision.nodeId !== EXPECTED_DECISION_NODE_ID
    || decision.priorOwnerStandingGrantTaskId !== EXPECTED_TASK_ID) {
    throw new StorageSelectionError('E_STORAGE_SELECTION_OWNER_BINDING');
  }
  if (decision.revocationEpoch !== 0 || decision.expiresAtUtc !== null) {
    throw new StorageSelectionError('E_STORAGE_SELECTION_OWNER_DECISION_STALE');
  }
  const scope = decision.authorizedScope;
  if (!isPlainObject(scope)
    || scope.storageBakeoffComparison !== true
    || scope.certifyAlreadyMergedImplementation !== true) {
    throw new StorageSelectionError('E_STORAGE_SELECTION_OWNER_SCOPE');
  }
  if (scope.dependencyAdoption !== false
    || scope.liveStoragePathChange !== false
    || scope.userDataMigration !== false
    || scope.destructiveStorageAction !== false) {
    throw new StorageSelectionError('E_STORAGE_SELECTION_AUTHORITY_EXPANSION');
  }
  return deepFreeze({
    decisionId: decision.decisionId,
    missionDigest: decision.missionDigest,
    gateId: decision.gateId,
    nodeId: decision.nodeId,
    priorOwnerStandingGrantTaskId: decision.priorOwnerStandingGrantTaskId,
    revocationEpoch: decision.revocationEpoch,
  });
}

function validateCandidateRow(row, seen) {
  if (!isPlainObject(row) || typeof row.candidateId !== 'string') {
    throw new StorageSelectionError('E_STORAGE_SELECTION_CANDIDATE_SHAPE');
  }
  if (!Object.hasOwn(CANDIDATE_REGISTRY, row.candidateId) || seen.has(row.candidateId)) {
    throw new StorageSelectionError('E_STORAGE_SELECTION_CANDIDATE_DENOMINATOR', row.candidateId);
  }
  seen.add(row.candidateId);
  const safety = applyHardSafetyFilters(CANDIDATE_REGISTRY[row.candidateId]);
  if (!safety.admitted) {
    if (row.admitted !== false || row.filterCode !== safety.code) {
      throw new StorageSelectionError('E_STORAGE_SELECTION_SAFETY_FILTER_DRIFT', row.candidateId);
    }
    return deepFreeze({
      candidateId: row.candidateId,
      admitted: false,
      filterCode: safety.code,
      correctnessPassed: false,
      correctnessCode: 'E_NOT_SAFETY_ADMITTED',
    });
  }
  if (row.admitted !== true
    || row.filterCode !== ''
    || row.crashInjected !== true
    || !Number.isInteger(row.recoveredRevision)
    || row.recoveredRevision < 0
    || typeof row.tornStateDetected !== 'boolean'
    || typeof row.recoveryReadable !== 'boolean'
    || typeof row.readBack !== 'string'
    || !Number.isInteger(row.bytesWritten)
    || row.bytesWritten < 0) {
    throw new StorageSelectionError('E_STORAGE_SELECTION_BENCHMARK_SHAPE', row.candidateId);
  }
  const correctnessPassed = row.recoveryReadable === true
    && row.recoveredRevision >= 5
    && row.readBack === `rev:${row.recoveredRevision}`;
  return deepFreeze({
    candidateId: row.candidateId,
    admitted: true,
    filterCode: '',
    correctnessPassed,
    correctnessCode: correctnessPassed ? '' : 'E_RECOVERY_CORRECTNESS',
    recoveredRevision: row.recoveredRevision,
    tornStateDetected: row.tornStateDetected,
    recoveryReadable: row.recoveryReadable,
    bytesWritten: row.bytesWritten,
  });
}

function dominates(left, right) {
  const noWorse = left.recoveredRevision >= right.recoveredRevision
    && Number(left.tornStateDetected) <= Number(right.tornStateDetected)
    && left.bytesWritten <= right.bytesWritten;
  const strictlyBetter = left.recoveredRevision > right.recoveredRevision
    || Number(left.tornStateDetected) < Number(right.tornStateDetected)
    || left.bytesWritten < right.bytesWritten;
  return noWorse && strictlyBetter;
}

function compareFrontierRows(left, right) {
  if (left.recoveredRevision !== right.recoveredRevision) return right.recoveredRevision - left.recoveredRevision;
  if (left.tornStateDetected !== right.tornStateDetected) return Number(left.tornStateDetected) - Number(right.tornStateDetected);
  if (left.bytesWritten !== right.bytesWritten) return left.bytesWritten - right.bytesWritten;
  return left.candidateId.localeCompare(right.candidateId);
}

function selectStorageRecoveryPlan({ dossier, ownerDecision, selectionHeadSha }) {
  const authority = validateOwnerDecision(ownerDecision);
  validateSha(selectionHeadSha, 'E_STORAGE_SELECTION_HEAD');
  if (!isPlainObject(dossier)
    || dossier.schemaVersion !== STORAGE_BAKEOFF_SCHEMA_VERSION
    || dossier.selection !== 'DEFERRED_TO_WP-203'
    || dossier.headSha !== selectionHeadSha
    || !Array.isArray(dossier.candidates)) {
    throw new StorageSelectionError('E_STORAGE_SELECTION_DOSSIER_BINDING');
  }
  const seen = new Set();
  const evaluations = dossier.candidates.map((row) => validateCandidateRow(row, seen));
  if (seen.size !== EXPECTED_CANDIDATE_IDS.length
    || EXPECTED_CANDIDATE_IDS.some((id) => !seen.has(id))) {
    throw new StorageSelectionError('E_STORAGE_SELECTION_CANDIDATE_DENOMINATOR');
  }
  evaluations.sort((a, b) => a.candidateId.localeCompare(b.candidateId));
  const correct = evaluations.filter((row) => row.correctnessPassed);
  if (correct.length === 0) throw new StorageSelectionError('E_STORAGE_SELECTION_NO_CORRECT_CANDIDATE');
  const frontier = correct
    .filter((candidate) => !correct.some((other) => other !== candidate && dominates(other, candidate)))
    .sort(compareFrontierRows);
  if (frontier.length === 0) throw new StorageSelectionError('E_STORAGE_SELECTION_EMPTY_FRONTIER');

  const selected = frontier[0];
  const normalizedDossier = canonicalize({
    schemaVersion: dossier.schemaVersion,
    headSha: dossier.headSha,
    selection: dossier.selection,
    candidates: dossier.candidates
      .map((row) => canonicalize(row))
      .sort((a, b) => a.candidateId.localeCompare(b.candidateId)),
  });
  const body = canonicalize({
    schemaVersion: STORAGE_SELECTION_SCHEMA_VERSION,
    missionDigest: EXPECTED_MISSION_DIGEST,
    contourId: 'WP-203_STORAGE_SELECTION',
    selectionHeadSha,
    bakeoff: {
      schemaVersion: dossier.schemaVersion,
      headSha: dossier.headSha,
      dossierDigest: sha256Canonical(normalizedDossier),
      expectedCandidateIds: EXPECTED_CANDIDATE_IDS,
      evaluations,
      correctnessAcceptedIds: correct.map((row) => row.candidateId).sort(),
      paretoFrontierIds: frontier.map((row) => row.candidateId),
    },
    selectedPrimaryStorage: {
      candidateId: selected.candidateId,
      role: 'ATOMIC_COMMIT_TRUTH',
      liveStoragePathChange: false,
      adoptionAuthority: 'NOT_GRANTED',
    },
    selectedRecoveryLedger: {
      ledgerId: SELECTED_RECOVERY_LEDGER_ID,
      schemaVersion: RECOVERY_LEDGER_SCHEMA_VERSION,
      role: 'DERIVED_RECOVERY_EVIDENCE',
      commitTruthCandidateId: selected.candidateId,
      activation: 'EXPLICIT_EXISTING_INJECTION_SEAM_ONLY',
      liveAttachmentAuthorized: false,
    },
    authority: {
      ...authority,
      dependencyAdoption: false,
      liveStoragePathChange: false,
      userDataMigration: false,
      destructiveStorageAction: false,
    },
  });
  return deepFreeze({ ...body, selectionDigest: sha256Canonical(body) });
}

function verifyStorageSelection(selection) {
  if (!isPlainObject(selection) || typeof selection.selectionDigest !== 'string') {
    throw new StorageSelectionError('E_STORAGE_SELECTION_RECEIPT_SHAPE');
  }
  const { selectionDigest, ...body } = selection;
  if (sha256Canonical(body) !== selectionDigest) {
    throw new StorageSelectionError('E_STORAGE_SELECTION_RECEIPT_DIGEST');
  }
  validateSha(body.selectionHeadSha, 'E_STORAGE_SELECTION_HEAD');
  const evaluations = body.bakeoff?.evaluations;
  const evaluationIds = Array.isArray(evaluations)
    ? evaluations.map((row) => row.candidateId).sort()
    : [];
  const correct = Array.isArray(evaluations)
    ? evaluations.filter((row) => row.correctnessPassed === true)
    : [];
  const frontier = correct
    .filter((candidate) => !correct.some((other) => other !== candidate && dominates(other, candidate)))
    .sort(compareFrontierRows);
  const expectedCorrectIds = correct.map((row) => row.candidateId).sort();
  const expectedFrontierIds = frontier.map((row) => row.candidateId);
  if (body.schemaVersion !== STORAGE_SELECTION_SCHEMA_VERSION
    || body.missionDigest !== EXPECTED_MISSION_DIGEST
    || body.contourId !== 'WP-203_STORAGE_SELECTION'
    || body.bakeoff?.headSha !== body.selectionHeadSha
    || !/^[0-9a-f]{64}$/u.test(body.bakeoff?.dossierDigest || '')
    || JSON.stringify(evaluationIds) !== JSON.stringify(EXPECTED_CANDIDATE_IDS)
    || JSON.stringify(body.bakeoff?.expectedCandidateIds) !== JSON.stringify(EXPECTED_CANDIDATE_IDS)
    || JSON.stringify(body.bakeoff?.correctnessAcceptedIds) !== JSON.stringify(expectedCorrectIds)
    || JSON.stringify(body.bakeoff?.paretoFrontierIds) !== JSON.stringify(expectedFrontierIds)
    || frontier.length === 0
    || body.selectedPrimaryStorage?.candidateId !== frontier[0].candidateId
    || body.selectedPrimaryStorage?.role !== 'ATOMIC_COMMIT_TRUTH'
    || body.selectedRecoveryLedger?.ledgerId !== SELECTED_RECOVERY_LEDGER_ID
    || body.selectedRecoveryLedger?.schemaVersion !== RECOVERY_LEDGER_SCHEMA_VERSION
    || body.selectedRecoveryLedger?.role !== 'DERIVED_RECOVERY_EVIDENCE'
    || body.selectedRecoveryLedger?.commitTruthCandidateId !== body.selectedPrimaryStorage?.candidateId
    || body.selectedRecoveryLedger?.liveAttachmentAuthorized !== false
    || body.selectedPrimaryStorage?.liveStoragePathChange !== false
    || body.selectedPrimaryStorage?.adoptionAuthority !== 'NOT_GRANTED'
    || body.authority?.decisionId !== EXPECTED_DECISION_ID
    || body.authority?.missionDigest !== EXPECTED_MISSION_DIGEST
    || body.authority?.gateId !== EXPECTED_GATE_ID
    || body.authority?.nodeId !== EXPECTED_DECISION_NODE_ID
    || body.authority?.priorOwnerStandingGrantTaskId !== EXPECTED_TASK_ID
    || body.authority?.revocationEpoch !== 0
    || body.authority?.dependencyAdoption !== false
    || body.authority?.liveStoragePathChange !== false
    || body.authority?.userDataMigration !== false
    || body.authority?.destructiveStorageAction !== false) {
    throw new StorageSelectionError('E_STORAGE_SELECTION_RECEIPT_SCOPE');
  }
  return true;
}

async function openSelectedRecoveryLedger(selection, dir, options) {
  verifyStorageSelection(selection);
  return openRecoveryLedger(dir, options);
}

module.exports = Object.freeze({
  STORAGE_SELECTION_SCHEMA_VERSION,
  EXPECTED_MISSION_DIGEST,
  EXPECTED_GATE_ID,
  EXPECTED_DECISION_ID,
  EXPECTED_TASK_ID,
  SELECTED_RECOVERY_LEDGER_ID,
  StorageSelectionError,
  validateOwnerDecision,
  dominates,
  selectStorageRecoveryPlan,
  verifyStorageSelection,
  openSelectedRecoveryLedger,
});
