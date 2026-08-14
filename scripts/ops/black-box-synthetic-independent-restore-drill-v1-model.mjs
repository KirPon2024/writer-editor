#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

const PASS = 'PASS';
const DENY = 'DENY';

export const BLACK_BOX_SYNTHETIC_INDEPENDENT_RESTORE_DRILL_V1_CODES = Object.freeze({
  ARTIFACT_DIGEST_MISMATCH: 'YALKEN_BLACK_BOX_SYNTHETIC_RESTORE_ARTIFACT_DIGEST_MISMATCH',
  CLEANUP_FAILED: 'YALKEN_BLACK_BOX_SYNTHETIC_RESTORE_CLEANUP_FAILED',
  CONTRACT_KEYSET_INVALID: 'YALKEN_BLACK_BOX_SYNTHETIC_RESTORE_CONTRACT_KEYSET_INVALID',
  IMPORT_WRITER_NOT_PASS: 'YALKEN_BLACK_BOX_SYNTHETIC_RESTORE_IMPORT_WRITER_NOT_PASS',
  LEAKAGE_DETECTED: 'YALKEN_BLACK_BOX_SYNTHETIC_RESTORE_LEAKAGE_DETECTED',
  MANUAL_KIT_NOT_PASS: 'YALKEN_BLACK_BOX_SYNTHETIC_RESTORE_MANUAL_KIT_NOT_PASS',
  PROVIDER_MISMATCH: 'YALKEN_BLACK_BOX_SYNTHETIC_RESTORE_PROVIDER_MISMATCH',
  READBACK_MISMATCH: 'YALKEN_BLACK_BOX_SYNTHETIC_RESTORE_READBACK_MISMATCH',
  RECOVER_NOT_PASS: 'YALKEN_BLACK_BOX_SYNTHETIC_RESTORE_RECOVER_NOT_PASS',
  RESTORE_DRILL_PROVEN: 'YALKEN_BLACK_BOX_SYNTHETIC_RESTORE_DRILL_PROVEN',
  SOURCE_FENCE_STALE_OR_TRANSPLANT: 'YALKEN_BLACK_BOX_SYNTHETIC_RESTORE_SOURCE_FENCE_STALE_OR_TRANSPLANT',
  TARGET_REJECTED: 'YALKEN_BLACK_BOX_SYNTHETIC_RESTORE_TARGET_REJECTED',
});

function oracle(row) {
  if (row.closedContracts !== true) return { decision: DENY, code: BLACK_BOX_SYNTHETIC_INDEPENDENT_RESTORE_DRILL_V1_CODES.CONTRACT_KEYSET_INVALID };
  if (row.providerExact !== true) return { decision: DENY, code: BLACK_BOX_SYNTHETIC_INDEPENDENT_RESTORE_DRILL_V1_CODES.PROVIDER_MISMATCH };
  if (row.manualKitDecision !== PASS) return { decision: DENY, code: BLACK_BOX_SYNTHETIC_INDEPENDENT_RESTORE_DRILL_V1_CODES.MANUAL_KIT_NOT_PASS };
  if (row.artifactDigestBound !== true) return { decision: DENY, code: BLACK_BOX_SYNTHETIC_INDEPENDENT_RESTORE_DRILL_V1_CODES.ARTIFACT_DIGEST_MISMATCH };
  if (row.identity === 'wrong' || row.identity === 'missing') return { decision: DENY, code: BLACK_BOX_SYNTHETIC_INDEPENDENT_RESTORE_DRILL_V1_CODES.RECOVER_NOT_PASS };
  if (row.sourceFence !== 'current') return { decision: DENY, code: BLACK_BOX_SYNTHETIC_INDEPENDENT_RESTORE_DRILL_V1_CODES.SOURCE_FENCE_STALE_OR_TRANSPLANT };
  if (row.target !== 'absent-safe') return { decision: DENY, code: BLACK_BOX_SYNTHETIC_INDEPENDENT_RESTORE_DRILL_V1_CODES.TARGET_REJECTED };
  if (row.importWriterDecision !== PASS) return { decision: DENY, code: BLACK_BOX_SYNTHETIC_INDEPENDENT_RESTORE_DRILL_V1_CODES.IMPORT_WRITER_NOT_PASS };
  if (row.readback !== 'matched') return { decision: DENY, code: BLACK_BOX_SYNTHETIC_INDEPENDENT_RESTORE_DRILL_V1_CODES.READBACK_MISMATCH };
  if (row.leakage === true) return { decision: DENY, code: BLACK_BOX_SYNTHETIC_INDEPENDENT_RESTORE_DRILL_V1_CODES.LEAKAGE_DETECTED };
  if (row.cleanup !== true) return { decision: DENY, code: BLACK_BOX_SYNTHETIC_INDEPENDENT_RESTORE_DRILL_V1_CODES.CLEANUP_FAILED };
  return { decision: PASS, code: BLACK_BOX_SYNTHETIC_INDEPENDENT_RESTORE_DRILL_V1_CODES.RESTORE_DRILL_PROVEN };
}

function buildFiniteRows() {
  const rows = [];
  for (const manualKitDecision of [PASS, DENY, 'UNKNOWN']) {
    for (const identity of ['correct', 'wrong']) {
      for (const sourceFence of ['current', 'stale', 'transplant']) {
        for (const target of ['absent-safe', 'exists']) {
          rows.push({
            id: `finite-${rows.length}`,
            closedContracts: true,
            providerExact: true,
            manualKitDecision,
            artifactDigestBound: true,
            identity,
            sourceFence,
            target,
            importWriterDecision: PASS,
            readback: 'matched',
            leakage: false,
            cleanup: true,
          });
        }
      }
    }
  }
  return rows.slice(0, 36);
}

function hostileRows() {
  return [
    { id: 'unknown-contract-key', closedContracts: false },
    { id: 'provider-missing', providerExact: false },
    { id: 'provider-wrong-version', providerExact: false },
    { id: 'manual-kit-deny', manualKitDecision: DENY },
    { id: 'manual-kit-unknown', manualKitDecision: 'UNKNOWN' },
    { id: 'artifact-digest-swap', artifactDigestBound: false },
    { id: 'wrong-identity', identity: 'wrong' },
    { id: 'missing-identity', identity: 'missing' },
    { id: 'stale-revision', sourceFence: 'stale' },
    { id: 'transplant-source', sourceFence: 'transplant' },
    { id: 'replay-generation', sourceFence: 'replay' },
    { id: 'target-exists', target: 'exists' },
    { id: 'target-path-traversal', target: 'path-traversal' },
    { id: 'import-writer-deny', importWriterDecision: DENY },
    { id: 'import-writer-abstain', importWriterDecision: 'ABSTAIN' },
    { id: 'readback-mismatch', readback: 'mismatch' },
    { id: 'receipt-leaks-plaintext', leakage: true },
    { id: 'cleanup-failed', cleanup: false },
  ].map((row) => ({
    id: `hostile-${row.id}`,
    closedContracts: true,
    providerExact: true,
    manualKitDecision: PASS,
    artifactDigestBound: true,
    identity: 'correct',
    sourceFence: 'current',
    target: 'absent-safe',
    importWriterDecision: PASS,
    readback: 'matched',
    leakage: false,
    cleanup: true,
    ...row,
  }));
}

const MUTANTS = Object.freeze([
  { id: 'M01_trusts_open_contracts', run: (row) => (row.closedContracts === false ? { decision: PASS, code: BLACK_BOX_SYNTHETIC_INDEPENDENT_RESTORE_DRILL_V1_CODES.RESTORE_DRILL_PROVEN } : oracle(row)) },
  { id: 'M02_ignores_provider_mismatch', run: (row) => (row.providerExact === false ? { decision: PASS, code: BLACK_BOX_SYNTHETIC_INDEPENDENT_RESTORE_DRILL_V1_CODES.RESTORE_DRILL_PROVEN } : oracle(row)) },
  { id: 'M03_aggregates_manual_unknown_to_pass', run: (row) => (row.manualKitDecision !== PASS ? { decision: PASS, code: BLACK_BOX_SYNTHETIC_INDEPENDENT_RESTORE_DRILL_V1_CODES.RESTORE_DRILL_PROVEN } : oracle(row)) },
  { id: 'M04_ignores_artifact_digest_swap', run: (row) => (row.artifactDigestBound === false ? { decision: PASS, code: BLACK_BOX_SYNTHETIC_INDEPENDENT_RESTORE_DRILL_V1_CODES.RESTORE_DRILL_PROVEN } : oracle(row)) },
  { id: 'M05_ignores_wrong_identity', run: (row) => (row.identity !== 'correct' ? { decision: PASS, code: BLACK_BOX_SYNTHETIC_INDEPENDENT_RESTORE_DRILL_V1_CODES.RESTORE_DRILL_PROVEN } : oracle(row)) },
  { id: 'M06_ignores_stale_source', run: (row) => (row.sourceFence !== 'current' ? { decision: PASS, code: BLACK_BOX_SYNTHETIC_INDEPENDENT_RESTORE_DRILL_V1_CODES.RESTORE_DRILL_PROVEN } : oracle(row)) },
  { id: 'M07_allows_target_collision', run: (row) => (row.target !== 'absent-safe' ? { decision: PASS, code: BLACK_BOX_SYNTHETIC_INDEPENDENT_RESTORE_DRILL_V1_CODES.RESTORE_DRILL_PROVEN } : oracle(row)) },
  { id: 'M08_aggregates_import_abstain_to_pass', run: (row) => (row.importWriterDecision !== PASS ? { decision: PASS, code: BLACK_BOX_SYNTHETIC_INDEPENDENT_RESTORE_DRILL_V1_CODES.RESTORE_DRILL_PROVEN } : oracle(row)) },
  { id: 'M09_ignores_readback_mismatch', run: (row) => (row.readback !== 'matched' ? { decision: PASS, code: BLACK_BOX_SYNTHETIC_INDEPENDENT_RESTORE_DRILL_V1_CODES.RESTORE_DRILL_PROVEN } : oracle(row)) },
  { id: 'M10_allows_plaintext_leakage', run: (row) => (row.leakage ? { decision: PASS, code: BLACK_BOX_SYNTHETIC_INDEPENDENT_RESTORE_DRILL_V1_CODES.RESTORE_DRILL_PROVEN } : oracle(row)) },
  { id: 'M11_ignores_cleanup_failure', run: (row) => (row.cleanup === false ? { decision: PASS, code: BLACK_BOX_SYNTHETIC_INDEPENDENT_RESTORE_DRILL_V1_CODES.RESTORE_DRILL_PROVEN } : oracle(row)) },
  { id: 'M12_passes_everything', run: () => ({ decision: PASS, code: BLACK_BOX_SYNTHETIC_INDEPENDENT_RESTORE_DRILL_V1_CODES.RESTORE_DRILL_PROVEN }) },
]);

function sameOutcome(left, right) {
  return left.decision === right.decision && left.code === right.code;
}

function evaluateRows(rows) {
  const failures = [];
  for (const row of rows) {
    const expected = oracle(row);
    if (row.id.startsWith('hostile-') && expected.decision === PASS) failures.push({ id: row.id, error: 'HOSTILE_ROW_PASSED' });
    if (row.manualKitDecision === 'UNKNOWN' && expected.decision === PASS) failures.push({ id: row.id, error: 'UNKNOWN_AGGREGATED_TO_PASS' });
    if (row.importWriterDecision === 'ABSTAIN' && expected.decision === PASS) failures.push({ id: row.id, error: 'ABSTAIN_AGGREGATED_TO_PASS' });
  }
  return failures;
}

function killedMutants(rows) {
  const survivors = [];
  const killed = [];
  for (const mutant of MUTANTS) {
    const killedBy = rows.find((row) => !sameOutcome(mutant.run(row), oracle(row)));
    if (killedBy) killed.push({ mutant: mutant.id, killedBy: killedBy.id });
    else survivors.push(mutant.id);
  }
  return { killed, survivors };
}

export function runBlackBoxSyntheticIndependentRestoreDrillV1Model() {
  const finite = buildFiniteRows();
  const hostile = hostileRows();
  const rows = [...finite, ...hostile];
  const failures = [...evaluateRows(finite), ...evaluateRows(hostile)];
  const mutation = killedMutants(rows);
  return {
    ok: failures.length === 0 && mutation.survivors.length === 0,
    summary: {
      finiteCases: finite.length,
      hostileCases: hostile.length,
      semanticMutants: MUTANTS.length,
      mutationSurvivors: mutation.survivors.length,
    },
    failures,
    killedMutants: mutation.killed,
    survivingMutants: mutation.survivors,
  };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const result = runBlackBoxSyntheticIndependentRestoreDrillV1Model();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
