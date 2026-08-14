#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

const PASS = 'PASS';
const DENY = 'DENY';

const CODES = Object.freeze({
  FEATURE_DISABLED: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_FEATURE_DISABLED',
  KEYSET_INVALID: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_KEYSET_INVALID',
  PATH_REJECTED: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_PATH_REJECTED',
  PLAINTEXT_OR_KEY_LEAK: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_PLAINTEXT_OR_KEY_LEAK',
  PROJECT_WRITTEN: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_PROJECT_WRITTEN',
  READBACK_MISMATCH: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_READBACK_MISMATCH',
  SINK_PAYLOAD_MISSING: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_SINK_PAYLOAD_MISSING',
  TARGET_EXISTS: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_TARGET_EXISTS',
  UPSTREAM_NOT_PASS: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_UPSTREAM_NOT_PASS',
  WRITE_FAILED: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_WRITE_FAILED',
});

function oracle(row) {
  if (row.closedKeyset !== true) return { decision: DENY, code: CODES.KEYSET_INVALID };
  if (row.featureFlag !== true) return { decision: DENY, code: CODES.FEATURE_DISABLED };
  if (row.callerCarriedCore === true) return { decision: DENY, code: CODES.KEYSET_INVALID };
  if (row.target !== 'absent-safe') return { decision: DENY, code: row.target === 'exists' ? CODES.TARGET_EXISTS : CODES.PATH_REJECTED };
  if (row.upstreamDecision === 'UNKNOWN' || row.upstreamDecision === 'ABSTAIN' || row.upstreamDecision === 'CONFLICTING') return { decision: DENY, code: CODES.UPSTREAM_NOT_PASS };
  if (row.upstreamDecision !== PASS) return { decision: DENY, code: CODES.UPSTREAM_NOT_PASS };
  if (row.sink !== 'verified-bound') return { decision: DENY, code: CODES.SINK_PAYLOAD_MISSING };
  if (row.coreGenome !== 'valid') return { decision: DENY, code: row.coreGenome === 'path-traversal' ? CODES.PATH_REJECTED : CODES.CORE_PAYLOAD_INVALID };
  if (row.readback !== 'matched') return { decision: DENY, code: CODES.READBACK_MISMATCH };
  if (row.writeEffect !== 'create-only-success') return { decision: DENY, code: CODES.WRITE_FAILED };
  if (row.leaksPlaintextOrKey === true) return { decision: DENY, code: CODES.PLAINTEXT_OR_KEY_LEAK };
  return { decision: PASS, code: CODES.PROJECT_WRITTEN };
}

function buildFiniteRows() {
  const rows = [];
  for (const featureFlag of [true, false]) {
    for (const upstreamDecision of [PASS, DENY, 'UNKNOWN']) {
      for (const sink of ['verified-bound', 'missing']) {
        for (const target of ['absent-safe', 'exists']) {
          rows.push({
            id: `finite-${rows.length}`,
            closedKeyset: true,
            featureFlag,
            callerCarriedCore: false,
            target,
            upstreamDecision,
            sink,
            coreGenome: 'valid',
            readback: 'matched',
            writeEffect: 'create-only-success',
            leaksPlaintextOrKey: false,
          });
        }
      }
    }
  }
  return rows;
}

function hostileRows() {
  return [
    { id: 'unknown-keyset', closedKeyset: false },
    { id: 'caller-carried-core', callerCarriedCore: true },
    { id: 'caller-carried-sink', callerCarriedCore: true },
    { id: 'target-symlink', target: 'symlink' },
    { id: 'target-root', target: 'root' },
    { id: 'path-traversal', coreGenome: 'path-traversal' },
    { id: 'duplicate-path', coreGenome: 'duplicate-path' },
    { id: 'missing-manifest', coreGenome: 'missing-manifest' },
    { id: 'digest-mismatch', coreGenome: 'digest-mismatch' },
    { id: 'wrong-source-set', coreGenome: 'wrong-source-set' },
    { id: 'upstream-abstain', upstreamDecision: 'ABSTAIN' },
    { id: 'upstream-conflicting', upstreamDecision: 'CONFLICTING' },
    { id: 'sink-digest-mismatch', sink: 'digest-mismatch' },
    { id: 'readback-mismatch', readback: 'mismatch' },
    { id: 'write-fails', writeEffect: 'write-fails' },
    { id: 'receipt-leaks-plaintext', leaksPlaintextOrKey: true },
  ].map((row) => ({
    id: `hostile-${row.id}`,
    closedKeyset: true,
    featureFlag: true,
    callerCarriedCore: false,
    target: 'absent-safe',
    upstreamDecision: PASS,
    sink: 'verified-bound',
    coreGenome: 'valid',
    readback: 'matched',
    writeEffect: 'create-only-success',
    leaksPlaintextOrKey: false,
    ...row,
  }));
}

const MUTANTS = Object.freeze([
  {
    id: 'M01_allows_disabled_flag',
    run: (row) => (row.featureFlag === false ? { decision: PASS, code: CODES.PROJECT_WRITTEN } : oracle(row)),
  },
  {
    id: 'M02_allows_unknown_keyset',
    run: (row) => (row.closedKeyset === false ? { decision: PASS, code: CODES.PROJECT_WRITTEN } : oracle(row)),
  },
  {
    id: 'M03_trusts_caller_carried_core',
    run: (row) => (row.callerCarriedCore ? { decision: PASS, code: CODES.PROJECT_WRITTEN } : oracle(row)),
  },
  {
    id: 'M04_ignores_target_exists',
    run: (row) => (row.target === 'exists' ? { decision: PASS, code: CODES.PROJECT_WRITTEN } : oracle(row)),
  },
  {
    id: 'M05_ignores_path_traversal',
    run: (row) => (row.coreGenome === 'path-traversal' ? { decision: PASS, code: CODES.PROJECT_WRITTEN } : oracle(row)),
  },
  {
    id: 'M06_aggregates_unknown_upstream_to_pass',
    run: (row) => (row.upstreamDecision === 'UNKNOWN' || row.upstreamDecision === 'ABSTAIN' ? { decision: PASS, code: CODES.PROJECT_WRITTEN } : oracle(row)),
  },
  {
    id: 'M07_ignores_missing_sink',
    run: (row) => (row.sink !== 'verified-bound' ? { decision: PASS, code: CODES.PROJECT_WRITTEN } : oracle(row)),
  },
  {
    id: 'M08_ignores_core_digest_mismatch',
    run: (row) => (row.coreGenome === 'digest-mismatch' ? { decision: PASS, code: CODES.PROJECT_WRITTEN } : oracle(row)),
  },
  {
    id: 'M09_ignores_readback_mismatch',
    run: (row) => (row.readback !== 'matched' ? { decision: PASS, code: CODES.PROJECT_WRITTEN } : oracle(row)),
  },
  {
    id: 'M10_allows_plaintext_leak',
    run: (row) => (row.leaksPlaintextOrKey ? { decision: PASS, code: CODES.PROJECT_WRITTEN } : oracle(row)),
  },
  {
    id: 'M11_allows_write_failure',
    run: (row) => (row.writeEffect !== 'create-only-success' ? { decision: PASS, code: CODES.PROJECT_WRITTEN } : oracle(row)),
  },
  {
    id: 'M12_allows_live_restore_target',
    run: (row) => (row.target !== 'absent-safe' ? { decision: PASS, code: CODES.PROJECT_WRITTEN } : oracle(row)),
  },
]);

function sameOutcome(actual, expected) {
  return actual.decision === expected.decision && actual.code === expected.code;
}

function evaluateRows(rows) {
  const failures = [];
  for (const row of rows) {
    const expected = oracle(row);
    if (row.id.startsWith('hostile-') && expected.decision === PASS) {
      failures.push({ id: row.id, error: 'HOSTILE_ROW_PASSED' });
    }
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

export function runBlackBoxImportAsNewProjectWriterV1Model() {
  const finite = buildFiniteRows();
  const hostile = hostileRows();
  const rows = [...finite, ...hostile];
  const failures = [
    ...evaluateRows(finite),
    ...evaluateRows(hostile),
  ];
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
  const result = runBlackBoxImportAsNewProjectWriterV1Model();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
