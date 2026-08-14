#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

const PASS = 'PASS';
const DENY = 'DENY';

const CODES = Object.freeze({
  CAPSULE_BUILD_REJECTED: 'YALKEN_BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_CAPSULE_BUILD_REJECTED',
  FEATURE_DISABLED: 'YALKEN_BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_FEATURE_DISABLED',
  KEYSET_INVALID: 'YALKEN_BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_KEYSET_INVALID',
  KIT_CREATED: 'YALKEN_BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_CREATED',
  PLAINTEXT_OR_KEY_LEAK: 'YALKEN_BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_PLAINTEXT_OR_KEY_LEAK',
  PUBLISH_REJECTED: 'YALKEN_BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_PUBLISH_REJECTED',
  SOURCE_SET_REJECTED: 'YALKEN_BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_SOURCE_SET_REJECTED',
  UNKNOWN_OR_ABSTAIN: 'YALKEN_BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_UNKNOWN_OR_ABSTAIN',
});

function oracle(row) {
  if (row.closedKeyset !== true) return { decision: DENY, code: CODES.KEYSET_INVALID };
  if (row.kitFlag !== true) return { decision: DENY, code: CODES.FEATURE_DISABLED };
  if (row.callerCarriedProof === true) return { decision: DENY, code: CODES.KEYSET_INVALID };
  if (row.authority === 'UNKNOWN' || row.authority === 'ABSTAIN' || row.authority === 'CONFLICTING') return { decision: DENY, code: CODES.UNKNOWN_OR_ABSTAIN };
  if (row.source !== 'fresh-clean-bound') return { decision: DENY, code: CODES.SOURCE_SET_REJECTED };
  if (row.provider !== 'exact') return { decision: DENY, code: CODES.CAPSULE_BUILD_REJECTED };
  if (row.leaksPlaintextOrKey === true) return { decision: DENY, code: CODES.PLAINTEXT_OR_KEY_LEAK };
  if (row.publish !== 'create-only-absent') return { decision: DENY, code: CODES.PUBLISH_REJECTED };
  return { decision: PASS, code: CODES.KIT_CREATED };
}

function buildFiniteRows() {
  const rows = [];
  for (const kitFlag of [true, false]) {
    for (const source of ['fresh-clean-bound', 'stale-revision', 'dirty-document']) {
      for (const provider of ['exact', 'wrong-digest']) {
        for (const publish of ['create-only-absent', 'target-exists']) {
          for (const closedKeyset of [true, false]) {
            rows.push({
              id: `finite-${rows.length}`,
              kitFlag,
              closedKeyset,
              source,
              authority: 'ALLOW',
              provider,
              publish,
              leaksPlaintextOrKey: false,
              callerCarriedProof: false,
            });
          }
        }
      }
    }
  }
  return rows;
}

function hostileRows() {
  return [
    { id: 'forged-allow-result', callerCarriedProof: true },
    { id: 'caller-carried-source-set', closedKeyset: false },
    { id: 'unknown-authority', authority: 'UNKNOWN' },
    { id: 'abstain-authority', authority: 'ABSTAIN' },
    { id: 'conflicting-authority', authority: 'CONFLICTING' },
    { id: 'may-write-read-authority', source: 'may-write-read-authority' },
    { id: 'stale-generation', source: 'stale-generation' },
    { id: 'source-digest-mismatch', source: 'source-digest-mismatch' },
    { id: 'project-transplant', source: 'project-transplant' },
    { id: 'root-transplant', source: 'root-transplant' },
    { id: 'document-transplant', source: 'document-transplant' },
    { id: 'provider-missing', provider: 'missing' },
    { id: 'provider-version-mismatch', provider: 'wrong-version' },
    { id: 'provider-provenance-unverified', provider: 'unverified' },
    { id: 'publish-target-exists', publish: 'target-exists' },
    { id: 'receipt-plaintext-leak', leaksPlaintextOrKey: true },
  ].map((row) => ({
    kitFlag: true,
    closedKeyset: true,
    source: 'fresh-clean-bound',
    authority: 'ALLOW',
    provider: 'exact',
    publish: 'create-only-absent',
    leaksPlaintextOrKey: false,
    callerCarriedProof: false,
    ...row,
  }));
}

const MUTANTS = Object.freeze([
  {
    id: 'M01_allows_disabled_flag',
    run: (row) => (row.kitFlag === false ? { decision: PASS, code: CODES.KIT_CREATED } : oracle(row)),
  },
  {
    id: 'M02_ignores_closed_keyset',
    run: (row) => (row.closedKeyset === false ? { ...oracle({ ...row, closedKeyset: true }) } : oracle(row)),
  },
  {
    id: 'M03_trusts_caller_carried_proof',
    run: (row) => (row.callerCarriedProof ? { decision: PASS, code: CODES.KIT_CREATED } : oracle(row)),
  },
  {
    id: 'M04_passes_stale_revision',
    run: (row) => (row.source === 'stale-revision' ? { decision: PASS, code: CODES.KIT_CREATED } : oracle(row)),
  },
  {
    id: 'M05_passes_dirty_document',
    run: (row) => (row.source === 'dirty-document' ? { decision: PASS, code: CODES.KIT_CREATED } : oracle(row)),
  },
  {
    id: 'M06_passes_unknown_authority',
    run: (row) => (row.authority === 'UNKNOWN' ? { decision: PASS, code: CODES.KIT_CREATED } : oracle(row)),
  },
  {
    id: 'M07_passes_abstain_authority',
    run: (row) => (row.authority === 'ABSTAIN' ? { decision: PASS, code: CODES.KIT_CREATED } : oracle(row)),
  },
  {
    id: 'M08_ignores_provider_pin',
    run: (row) => (row.provider !== 'exact' ? { decision: PASS, code: CODES.KIT_CREATED } : oracle(row)),
  },
  {
    id: 'M09_publishes_before_capsule',
    run: (row) => (row.provider !== 'exact' && row.publish === 'create-only-absent' ? { decision: PASS, code: CODES.KIT_CREATED } : oracle(row)),
  },
  {
    id: 'M10_overwrites_existing_target',
    run: (row) => (row.publish === 'target-exists' ? { decision: PASS, code: CODES.KIT_CREATED } : oracle(row)),
  },
  {
    id: 'M11_allows_plaintext_leak',
    run: (row) => (row.leaksPlaintextOrKey ? { decision: PASS, code: CODES.KIT_CREATED } : oracle(row)),
  },
  {
    id: 'M12_claims_disaster_ready_from_manual_kit',
    run: (row) => {
      const base = oracle(row);
      return base.decision === PASS ? { decision: PASS, code: CODES.KIT_CREATED, disasterReady: true } : base;
    },
  },
]);

function sameOutcome(actual, expected) {
  return actual.decision === expected.decision
    && actual.code === expected.code
    && actual.disasterReady !== true;
}

function evaluateRows(rows) {
  const failures = [];
  for (const row of rows) {
    const expected = oracle(row);
    if (expected.decision === PASS && row.id?.startsWith('hostile')) {
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

export function runBlackBoxManualCoreCapsuleKitV1Model() {
  const finite = buildFiniteRows();
  const hostile = hostileRows().map((row) => ({ ...row, id: `hostile-${row.id}` }));
  const failures = [
    ...evaluateRows(finite),
    ...evaluateRows(hostile),
  ];
  const mutation = killedMutants([...finite, ...hostile]);
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
  const result = runBlackBoxManualCoreCapsuleKitV1Model();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
