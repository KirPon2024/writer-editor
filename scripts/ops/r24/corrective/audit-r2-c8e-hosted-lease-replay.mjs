#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { canonicalBytes, canonicalize, readCanonicalJson } from './canonical-json.mjs';
import { assert, assertHex, sha256 } from './audit-r1-corrections.mjs';
import { validateLedger } from './audit-r2-lease-verifier.mjs';
import {
  PATHS as LEGACY_PATHS,
  SOURCE_HEAD_SHA as LEGACY_SOURCE_HEAD_SHA,
  SOURCE_TREE_SHA as LEGACY_SOURCE_TREE_SHA,
  validateContract,
  validateEvidence,
} from './c8e-v3-package-compiler.mjs';

const ROOT = 'docs/OPS/R24/CORRECTIVE';
const EXPECTED = Object.freeze({
  currentAdmissionDigest: 'decb456ea5e3b51b3220c4349b2ac2f3a2e4dc247d78e685615876279bbdc1a3',
  currentInstanceDigest: 'e3136181930a86c5beb21a50884e551e5477abe4563fdad0749ac546d70b811f',
  diagnosticDigest: 'bd1cf91f65c192a9d21f0b339bc54e95d98e6b4fff372a7e87f1bcfe606ba2b9',
  historicalAdmissionDigest: 'aa9280ce97c979691762f640249b787da2b0dd6484c3b8fd33534b1ef2de8ed8',
  historicalContractDigest: '332eb5cf6c209eb93b4ac6d1b87a574fc4fe67d4e606c53b289c65ac18d03cff',
  historicalEvidenceDigest: '2813300f600e486780aaf59fc2d4abad8390cec54b5909bb5749aebcbc07098f',
  historicalInstanceDigest: '6d6ea53145265bf31465b81b7d0f0dfd66fa5dce35c2edd859e217af92eca696',
  historicalScriptDigest: '3b53309705c3de961990ccc2f5293f47444f8a694d696c2d0e65fcce99d57c95',
  historicalTestDigest: 'c48cb6f05e2e4cdff271c385bdb158e90ba09ddedc3442e17ad4e92cf5dfbf10',
  ledgerDigest: '94808bcdb9d31e5183cc4e4138eb953f685925d9e0965039d048fca4a7d7257f',
});
const CURRENT = Object.freeze({
  admission: `${ROOT}/AUDIT_R2_C8E_HOSTED_LEASE_REPLAY_RECOVERY_STAGE_ADMISSION_ATTESTATION_V1.json`,
  diagnostic: `${ROOT}/AUDIT_R2_C8E_HOSTED_LEASE_REPLAY_RECOVERY_DIAGNOSTIC_EVIDENCE_V1.json`,
  instance: `${ROOT}/AUDIT_R2_C8E_HOSTED_LEASE_REPLAY_RECOVERY_STAGE_INSTANCE_V1.json`,
  ledger: `${ROOT}/AUDIT_R2_LEASE_FENCE_LEDGER_V1.json`,
});

const git = (args, cwd = process.cwd()) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 30000 });
  assert(result.status === 0, 'E_HOSTED_C8E_GIT', args.join(' '));
  return String(result.stdout || '').trim();
};
const readCanonical = (root, relativePath) => readCanonicalJson(path.join(root, relativePath));

export function loadHostedC8EInputs(root = process.cwd()) {
  const ledger = readCanonical(root, CURRENT.ledger);
  const currentInstance = readCanonical(root, CURRENT.instance);
  const currentAdmission = readCanonical(root, CURRENT.admission);
  const diagnostic = readCanonical(root, CURRENT.diagnostic);
  const historicalContract = readCanonical(root, LEGACY_PATHS.contract);
  const historicalEvidence = readCanonical(root, LEGACY_PATHS.evidence);
  const historicalInstance = readCanonical(root, LEGACY_PATHS.stageInstance);
  const historicalAdmission = readCanonical(root, LEGACY_PATHS.stageAdmission);
  const historicalScriptBytes = fs.readFileSync(path.join(root, LEGACY_PATHS.script));
  const historicalTestBytes = fs.readFileSync(path.join(root, LEGACY_PATHS.test));
  return {
    ledger,
    currentInstance,
    currentAdmission,
    diagnostic,
    historicalContract,
    historicalEvidence,
    historicalInstance,
    historicalAdmission,
    historicalScriptBytes,
    historicalTestBytes,
  };
}

export function verifyHostedC8E({
  evaluationSha,
  evaluationTreeSha,
  root = process.cwd(),
  inputs = loadHostedC8EInputs(root),
  gitResolve = (args) => git(args, root),
} = {}) {
  assertHex(evaluationSha, 40, 'evaluationSha');
  assertHex(evaluationTreeSha, 40, 'evaluationTreeSha');
  assert(gitResolve(['rev-parse', 'HEAD']) === evaluationSha && gitResolve(['rev-parse', 'HEAD^{tree}']) === evaluationTreeSha,
    'E_HOSTED_C8E_STALE_HEAD', `${evaluationSha}/${evaluationTreeSha}`);
  for (const key of ['ledger','currentInstance','currentAdmission','diagnostic','historicalContract','historicalEvidence','historicalInstance','historicalAdmission']) {
    assert(inputs?.[key]?.value && Buffer.isBuffer(inputs[key].bytes) && typeof inputs[key].digest === 'string', 'E_HOSTED_C8E_INPUT_MISSING', key);
  }
  assert(inputs.ledger.digest === EXPECTED.ledgerDigest, 'E_HOSTED_C8E_LEDGER_CARRIER', inputs.ledger.digest);
  const ledger = validateLedger(inputs.ledger.value, { root });
  assert(ledger.status === 'ACTIVE' && ledger.highestEffectiveFencingCounter === 54 && ledger.releaseDigest === null,
    'E_HOSTED_C8E_LEDGER_STATE', canonicalize(ledger));
  assert(inputs.currentInstance.digest === EXPECTED.currentInstanceDigest && inputs.currentAdmission.digest === EXPECTED.currentAdmissionDigest,
    'E_HOSTED_C8E_CURRENT_ADMISSION_BYTES', `${inputs.currentInstance.digest}/${inputs.currentAdmission.digest}`);
  const currentInstance = inputs.currentInstance.value;
  const currentAdmission = inputs.currentAdmission.value;
  assert(currentAdmission.status === 'ADMITTED' && currentAdmission.stageInstanceDigest === EXPECTED.currentInstanceDigest,
    'E_HOSTED_C8E_CURRENT_ADMISSION_STATE', currentAdmission.status);
  assert(currentInstance.leaseBinding.fencingCounter === ledger.highestEffectiveFencingCounter
    && currentInstance.leaseBinding.acquisitionEventDigest === ledger.leaseDigest
    && currentInstance.leaseBinding.fenceEventDigest === ledger.fenceDigest
    && currentAdmission.fencingCounter === ledger.highestEffectiveFencingCounter
    && currentAdmission.leaseAcquisitionEventDigest === ledger.leaseDigest
    && currentAdmission.fenceEventDigest === ledger.fenceDigest,
  'E_HOSTED_C8E_LEDGER_ADMISSION_BINDING', 'counter54');
  assert(inputs.diagnostic.digest === EXPECTED.diagnosticDigest, 'E_HOSTED_C8E_DIAGNOSTIC_CARRIER', inputs.diagnostic.digest);
  const diagnostic = inputs.diagnostic.value;
  assert(diagnostic.stageId === 'C8E' && diagnostic.status === 'FAILURE_CLASSIFIED_RECOVERY_ADMITTED'
    && diagnostic.terminalFailure?.runId === '33281859955'
    && diagnostic.terminalFailure?.diagnosticArtifact?.artifactId === '9723253625'
    && diagnostic.innerFailure?.code === 'ENOENT'
    && diagnostic.recovery?.ephemeralLocalAuthorityRequired === false,
  'E_HOSTED_C8E_DIAGNOSTIC_BINDING', diagnostic.status);
  assert(inputs.historicalContract.digest === EXPECTED.historicalContractDigest
    && inputs.historicalEvidence.digest === EXPECTED.historicalEvidenceDigest
    && inputs.historicalInstance.digest === EXPECTED.historicalInstanceDigest
    && inputs.historicalAdmission.digest === EXPECTED.historicalAdmissionDigest,
  'E_HOSTED_C8E_HISTORICAL_CARRIER', 'C8E');
  assert(sha256(inputs.historicalScriptBytes) === EXPECTED.historicalScriptDigest
    && sha256(inputs.historicalTestBytes) === EXPECTED.historicalTestDigest,
  'E_HOSTED_C8E_HISTORICAL_SOURCE', 'C8E');
  assert(inputs.historicalInstance.value.baseSha === LEGACY_SOURCE_HEAD_SHA
    && inputs.historicalInstance.value.treeSha === LEGACY_SOURCE_TREE_SHA
    && gitResolve(['rev-parse', `${LEGACY_SOURCE_HEAD_SHA}^{tree}`]) === LEGACY_SOURCE_TREE_SHA,
  'E_HOSTED_C8E_HISTORICAL_GIT_BINDING', LEGACY_SOURCE_HEAD_SHA);
  const legacySource = inputs.historicalScriptBytes.toString('utf8');
  const legacyLeaseDeclaration = ['const LOCAL_', 'LEASE = ', "'/private/", "tmp/"].join('');
  const legacyLeaseRead = ['fs.readFileSync(', 'LOCAL_LEASE)'].join('');
  assert(legacySource.includes(legacyLeaseDeclaration) && legacySource.includes(legacyLeaseRead),
    'E_HOSTED_C8E_LEGACY_FAILURE_REPRO', 'lease');
  validateContract(inputs.historicalContract.value);
  validateEvidence(inputs.historicalEvidence.value, inputs.historicalContract.value);
  const contract = inputs.historicalContract.value;
  const evidence = inputs.historicalEvidence.value;
  assert(contract.claimCeiling?.productionReleaseReady === false && contract.claimCeiling?.programDone === false
    && contract.compilerContract?.expectedProfileVerdict === 'NOT_READY'
    && contract.compilerContract?.expectedProgramVerdict === 'NEEDS_MORE_EVIDENCE'
    && evidence.observations?.compiler?.currentVerdict === 'NOT_READY'
    && evidence.observations?.compiler?.programVerdict === 'NEEDS_MORE_EVIDENCE'
    && Object.values(evidence.observations?.safety || {}).every((value) => value === false),
  'E_HOSTED_C8E_FALSE_PROMOTION', 'C8E');
  return {
    schemaVersion: 'AUDIT_R2_C8E_HOSTED_LEASE_REPLAY_RESULT_V1',
    status: 'PASS',
    evaluationSha,
    evaluationTreeSha,
    immutableLeaseLedgerDigest: inputs.ledger.digest,
    highestEffectiveFencingCounter: ledger.highestEffectiveFencingCounter,
    leaseAcquisitionEventDigest: ledger.leaseDigest,
    fenceEventDigest: ledger.fenceDigest,
    admissionBindingDigest: ledger.admissionBindingDigest,
    currentStageInstanceDigest: inputs.currentInstance.digest,
    currentStageAdmissionDigest: inputs.currentAdmission.digest,
    historicalC8EContractDigest: inputs.historicalContract.digest,
    historicalC8EEvidenceDigest: inputs.historicalEvidence.digest,
    profileVerdict: 'NOT_READY',
    programVerdict: 'NEEDS_MORE_EVIDENCE',
    ephemeralLocalAuthorityRequired: false,
    programDoneClaimed: false,
    wp400MutationStarted: false,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = Object.fromEntries(process.argv.slice(2).reduce((rows, item, index, all) => item.startsWith('--') ? [...rows, [item.slice(2), all[index + 1]]] : rows, []));
    assert(args['evaluation-sha'] && args['evaluation-tree'], 'E_USAGE', '--evaluation-sha --evaluation-tree');
    process.stdout.write(canonicalBytes(verifyHostedC8E({ evaluationSha: args['evaluation-sha'], evaluationTreeSha: args['evaluation-tree'] })));
  } catch (error) {
    process.stderr.write(`${canonicalize({ code: error.code ?? 'E_UNTYPED', message: error.message })}\n`);
    process.exitCode = 1;
  }
}
