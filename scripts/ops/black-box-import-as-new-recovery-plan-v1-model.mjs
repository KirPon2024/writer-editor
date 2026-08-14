#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

const PASS = 'PASS';
const DENY = 'DENY';

const CODES = Object.freeze({
  FEATURE_DISABLED: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_FEATURE_DISABLED',
  KEYSET_INVALID: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_KEYSET_INVALID',
  P0C_RECOVER_REJECTED: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_P0C_RECOVER_REJECTED',
  PLAN_READY: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_READY',
  PLAINTEXT_OR_KEY_LEAK: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_PLAINTEXT_OR_KEY_LEAK',
  POLICY_REJECTED: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_POLICY_REJECTED',
  UPSTREAM_NOT_PASS: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_UPSTREAM_NOT_PASS',
});

function oracle(row) {
  if (row.closedKeyset !== true) return { decision: DENY, code: CODES.KEYSET_INVALID };
  if (row.planFlag !== true) return { decision: DENY, code: CODES.FEATURE_DISABLED };
  if (row.callerCarriedProof === true) return { decision: DENY, code: CODES.KEYSET_INVALID };
  if (row.policy !== 'import-as-new-quarantine') return { decision: DENY, code: CODES.POLICY_REJECTED };
  if (row.provider !== 'exact') return { decision: DENY, code: CODES.P0C_RECOVER_REJECTED };
  if (row.sourceBinding !== 'fresh-bound') return { decision: DENY, code: CODES.P0C_RECOVER_REJECTED };
  if (row.identity !== 'matching') return { decision: DENY, code: CODES.P0C_RECOVER_REJECTED };
  if (row.capsuleIntegrity !== 'valid') return { decision: DENY, code: CODES.P0C_RECOVER_REJECTED };
  if (row.p0cDecision === 'UNKNOWN' || row.p0cDecision === 'ABSTAIN' || row.p0cDecision === 'CONFLICTING') return { decision: DENY, code: CODES.UPSTREAM_NOT_PASS };
  if (row.p0cDecision !== PASS) return { decision: DENY, code: CODES.P0C_RECOVER_REJECTED };
  if (row.recoveredPlan !== 'safe-import-as-new-preview') return { decision: DENY, code: CODES.POLICY_REJECTED };
  if (row.leaksPlaintextOrKey === true) return { decision: DENY, code: CODES.PLAINTEXT_OR_KEY_LEAK };
  return { decision: PASS, code: CODES.PLAN_READY };
}

function buildFiniteRows() {
  const rows = [];
  for (const planFlag of [true, false]) {
    for (const provider of ['exact', 'wrong-digest', 'missing']) {
      for (const p0cDecision of [PASS, DENY, 'UNKNOWN']) {
        for (const closedKeyset of [true, false]) {
          rows.push({
            id: `finite-${rows.length}`,
            closedKeyset,
            planFlag,
            callerCarriedProof: false,
            policy: 'import-as-new-quarantine',
            provider,
            sourceBinding: 'fresh-bound',
            identity: 'matching',
            capsuleIntegrity: 'valid',
            p0cDecision,
            recoveredPlan: 'safe-import-as-new-preview',
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
    { id: 'forged-caller-recover-plan', callerCarriedProof: true },
    { id: 'caller-carried-p0c-pass', closedKeyset: false },
    { id: 'live-overwrite-policy', policy: 'live-overwrite' },
    { id: 'direct-restore-policy', policy: 'restore-live-project' },
    { id: 'missing-quarantine-policy', policy: 'no-quarantine' },
    { id: 'wrong-provider-version', provider: 'wrong-version' },
    { id: 'wrong-identity-key', identity: 'wrong-key' },
    { id: 'tampered-header', capsuleIntegrity: 'tampered-header' },
    { id: 'tampered-body', capsuleIntegrity: 'tampered-body' },
    { id: 'truncated-ciphertext', capsuleIntegrity: 'truncated' },
    { id: 'source-transplant', sourceBinding: 'project-transplant' },
    { id: 'revision-replay', sourceBinding: 'stale-revision' },
    { id: 'upstream-abstain', p0cDecision: 'ABSTAIN' },
    { id: 'receipt-plaintext-leak', leaksPlaintextOrKey: true },
  ].map((row) => ({
    id: `hostile-${row.id}`,
    closedKeyset: true,
    planFlag: true,
    callerCarriedProof: false,
    policy: 'import-as-new-quarantine',
    provider: 'exact',
    sourceBinding: 'fresh-bound',
    identity: 'matching',
    capsuleIntegrity: 'valid',
    p0cDecision: PASS,
    recoveredPlan: 'safe-import-as-new-preview',
    leaksPlaintextOrKey: false,
    ...row,
  }));
}

const MUTANTS = Object.freeze([
  {
    id: 'M01_allows_disabled_flag',
    run: (row) => (row.planFlag === false ? { decision: PASS, code: CODES.PLAN_READY } : oracle(row)),
  },
  {
    id: 'M02_allows_unknown_keyset',
    run: (row) => (row.closedKeyset === false ? { decision: PASS, code: CODES.PLAN_READY } : oracle(row)),
  },
  {
    id: 'M03_trusts_caller_carried_recover_plan',
    run: (row) => (row.callerCarriedProof ? { decision: PASS, code: CODES.PLAN_READY } : oracle(row)),
  },
  {
    id: 'M04_allows_live_overwrite_policy',
    run: (row) => (row.policy === 'live-overwrite' ? { decision: PASS, code: CODES.PLAN_READY } : oracle(row)),
  },
  {
    id: 'M05_ignores_provider_pin',
    run: (row) => (row.provider !== 'exact' ? { decision: PASS, code: CODES.PLAN_READY } : oracle(row)),
  },
  {
    id: 'M06_allows_wrong_identity',
    run: (row) => (row.identity !== 'matching' ? { decision: PASS, code: CODES.PLAN_READY } : oracle(row)),
  },
  {
    id: 'M07_allows_capsule_tamper',
    run: (row) => (row.capsuleIntegrity !== 'valid' ? { decision: PASS, code: CODES.PLAN_READY } : oracle(row)),
  },
  {
    id: 'M08_allows_source_replay_transplant',
    run: (row) => (row.sourceBinding !== 'fresh-bound' ? { decision: PASS, code: CODES.PLAN_READY } : oracle(row)),
  },
  {
    id: 'M09_aggregates_unknown_upstream_to_pass',
    run: (row) => (row.p0cDecision === 'UNKNOWN' || row.p0cDecision === 'ABSTAIN' ? { decision: PASS, code: CODES.PLAN_READY } : oracle(row)),
  },
  {
    id: 'M10_allows_plaintext_or_key_leak',
    run: (row) => (row.leaksPlaintextOrKey ? { decision: PASS, code: CODES.PLAN_READY } : oracle(row)),
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

export function runBlackBoxImportAsNewRecoveryPlanV1Model() {
  const finite = buildFiniteRows();
  const hostile = hostileRows();
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
  const result = runBlackBoxImportAsNewRecoveryPlanV1Model();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
