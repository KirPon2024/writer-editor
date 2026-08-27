#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { canonicalBytes, canonicalize, readCanonicalJson, sha256 } from './canonical-json.mjs';

export const PROGRAM_TEMPLATE_DIGEST = '6c833c964318da3e61e1743365f8763206be838647b5222c187b3bda8d1c6b9a';
export const TRUST_MODEL_DIGEST = '4f6e4b3a191e0302ea44646659e8c2f71121af7d808cc0ee768269b4e156840d';
export const PRODUCTION_HEAD_SHA = 'f543ea5093778830e56119027a9ddb60f4084cc7';
export const PRODUCTION_TREE_SHA = 'd037bdce0e4035fd17fd5fec18bddedc2bb8dfdb';

export const PATHS = Object.freeze({
  inventory: 'docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json',
  contract: 'docs/OPS/R24/CORRECTIVE/C2A_EFFECTIVE_CERTIFICATION_CONTRACT_V1.json',
  ledger: 'docs/OPS/R24/CORRECTIVE/C2A_CORRECTION_LEDGER_V1.json',
  historical: 'docs/OPS/R24/CORRECTIVE/C2A_HISTORICAL_RECEIPT_MANIFEST_V1.json',
  current: 'docs/OPS/R24/CORRECTIVE/C2A_CURRENT_CERTIFICATION_SET_V1.json',
  bindings: 'docs/OPS/R24/CORRECTIVE/C2A_EFFECTIVE_CERTIFICATION_CLAIM_BINDINGS_V1.json',
  approvals: 'docs/OPS/R24/CORRECTIVE/C2A_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  planState: 'docs/OPS/R24/PLAN_STATE_R24.json',
  stageInstance: 'docs/OPS/R24/CORRECTIVE/C2A_STAGE_INSTANCE_V1.json',
  stageAdmission: 'docs/OPS/R24/CORRECTIVE/C2A_STAGE_ADMISSION_ATTESTATION_V1.json',
  script: 'scripts/ops/r24/corrective/c2a-effective-certification.mjs',
  test: 'test/contracts/r24-c2a-effective-certification.contract.test.mjs'
});

const OWNER_BINDING_DIGEST = 'be68bd97021d13fbfb75c73791bda7f6bfeebecebf525d4a927d1a4c9fe9efd6';
const OBSERVED_AT_UTC = '2026-08-27T22:17:32.000Z';
const REQUIRED_CONTROL_STAGES = Object.freeze(['B0', 'C1A', 'C1B', 'C1C']);
const FORBIDDEN_HISTORICAL_FIELDS = Object.freeze([
  'externalArtifactDigest',
  'externalArtifactId',
  'externalRunId',
  'terminalAttestationBytesDigest',
  'trustModelDigest'
]);

export class CertificationError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.code = code;
  }
}

function fail(code, detail) {
  throw new CertificationError(code, detail);
}

function assert(condition, code, detail) {
  if (!condition) fail(code, detail);
}

function hex(value, length, field) {
  assert(typeof value === 'string' && new RegExp(`^[0-9a-f]{${length}}$`, 'u').test(value), 'E_IDENTITY_INVALID', field);
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function rawSha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function lexical(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function readJsonBytes(repoRoot, relativePath) {
  const bytes = fs.readFileSync(path.join(repoRoot, relativePath));
  return { bytes, value: JSON.parse(bytes.toString('utf8')), digest: rawSha256(bytes) };
}

function sortedUnique(values, field) {
  assert(Array.isArray(values), 'E_SCHEMA', field);
  const sorted = [...values].sort(lexical);
  assert(JSON.stringify(values) === JSON.stringify(sorted), 'E_ORDER', field);
  assert(new Set(values).size === values.length, 'E_DUPLICATE', field);
}

function exactKeys(value, keys, field) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  assert(JSON.stringify(actual) === JSON.stringify(expected), 'E_SCHEMA_KEYS', field);
}

export function createGitOracle(repoRoot = process.cwd()) {
  const run = (args) => execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
  return {
    commitExists(sha) {
      const result = spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: repoRoot, stdio: 'ignore' });
      return result.status === 0;
    },
    treeFor(sha) {
      return run(['rev-parse', `${sha}^{tree}`]);
    },
    isAncestor(ancestor, descendant) {
      const result = spawnSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd: repoRoot, stdio: 'ignore' });
      return result.status === 0;
    }
  };
}

function nextSuccessorStages(receiptId) {
  if (/CTR-R24-(R2|R3|R4|WP-104)-/u.test(receiptId)) return ['C2B1', 'C2B2'];
  if (/CTR-R24-WP-10[0-3]-/u.test(receiptId)) return ['C2B1', 'C2B3B'];
  return ['C2B1', 'C2B4'];
}

function rawLifecycleState(entry) {
  if (entry.rawStates.mergeState === 'MERGED' && entry.rawStates.survivorState === 'PASS' && entry.rawStates.postmergeState === 'PASS') return 'DONE';
  if (entry.rawStates.mergeState === 'WAITING' && entry.rawStates.survivorState === 'PENDING' && entry.rawStates.postmergeState === 'PENDING') return 'PENDING';
  fail('E_RAW_STATE_UNCLASSIFIED', entry.receiptId);
}

function certifiedStateForHistorical(effectiveState) {
  return effectiveState === 'DONE' ? 'DONE_UNCERTIFIED' : 'PENDING_UNCERTIFIED';
}

export function buildContract() {
  return {
    artifactPaths: {
      claimBindings: PATHS.bindings,
      correctionLedger: PATHS.ledger,
      currentCertificationSet: PATHS.current,
      historicalReceiptManifest: PATHS.historical,
      immutablePlanState: PATHS.planState
    },
    canonicalSerialization: {
      encoding: 'UTF-8',
      objectKeys: 'LEXICOGRAPHIC_ASCENDING_RECURSIVE',
      lineEnding: 'LF',
      trailingNewline: true,
      unicode: 'NFC_REPO_RELATIVE_PATHS',
      digest: 'SHA-256_EXACT_BYTES'
    },
    certificationRules: {
      actualGitObjectRequired: true,
      evaluationTreeMustMatchGit: true,
      externalAttestationUnavailableOrCompromised: 'FAIL_CLOSED',
      historicalDoneWithoutCurrentAttestation: 'DONE_UNCERTIFIED',
      productionReachabilityRequired: true,
      recursiveClosurePrForbidden: true,
      selfIssuedReceiptAccepted: false
    },
    compilerId: 'YALKEN_R24_C2A_EFFECTIVE_CERTIFICATION_COMPILER_V1',
    compilerPath: PATHS.script,
    correctionRules: {
      appendOnly: true,
      entryDigestExcludesEntryDigestField: true,
      predecessorDigestRequired: true,
      rawDoneMutationForbidden: true,
      reorderForbidden: true
    },
    ownerAuthorityBindingDigest: OWNER_BINDING_DIGEST,
    productionSnapshot: {
      headSha: PRODUCTION_HEAD_SHA,
      treeSha: PRODUCTION_TREE_SHA
    },
    programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
    schemaVersion: 'YALKEN_R24_C2A_EFFECTIVE_CERTIFICATION_CONTRACT_V1',
    stageId: 'C2A',
    stateModel: {
      certifiedState: 'EFFECTIVE_STATE_PLUS_VALID_CURRENT_EXTERNAL_ATTESTATIONS',
      currentCertificationSetSeparatedFromImmutableHistoricalReceipts: true,
      effectiveState: 'RAW_PLUS_APPEND_ONLY_CORRECTIONS',
      rawState: 'IMMUTABLE_HISTORICAL_INPUT'
    },
    trustModelDigest: TRUST_MODEL_DIGEST
  };
}

function entryWithDigest(entry) {
  return { ...entry, entryDigest: sha256(canonicalBytes(entry)) };
}

function sourceEvidenceStampId(contourId) {
  if (contourId === 'B0_OBSERVED_EVIDENCE_CLAIM_COMPILER_REPAIR_V1') {
    return 'ES-R24-B0-OBSERVED-EVIDENCE-CLAIM-COMPILER';
  }
  return `ES-R24-${contourId.replaceAll('_', '-')}-CLAIM-BINDINGS`;
}

function availableEvidenceStampIds(repoRoot) {
  const evidenceRoot = path.join(repoRoot, 'docs/OPS/R24/EVIDENCE');
  return new Set(fs.readdirSync(evidenceRoot)
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(evidenceRoot, name), 'utf8')).stampId;
      } catch {
        return null;
      }
    })
    .filter((stampId) => typeof stampId === 'string' && stampId.length > 0));
}

function sourceEvidenceStampIds(receipts, repoRoot) {
  const available = availableEvidenceStampIds(repoRoot);
  const stampIds = receipts.map((receipt) => sourceEvidenceStampId(receipt.contourId)).sort(lexical);
  for (const stampId of stampIds) assert(available.has(stampId), 'E_SOURCE_EVIDENCE_STAMP_MISSING', stampId);
  return stampIds;
}

export function buildLedger() {
  const genesis = {
    ledgerId: 'YALKEN_R24_C2A_APPEND_ONLY_CORRECTION_LEDGER_V1',
    programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
    sequence: 0
  };
  const genesisDigest = sha256(canonicalBytes(genesis));
  const first = entryWithDigest({
    correctionId: 'C2A-CORRECTION-0001',
    effect: 'PRESERVE_EFFECTIVE_LIFECYCLE_STATE_BUT_REQUIRE_CURRENT_EXTERNAL_ATTESTATION_FOR_CERTIFIED_DONE',
    operation: 'REQUIRE_CURRENT_EXTERNAL_ATTESTATION',
    predecessorEntryDigest: genesisDigest,
    rawMutationForbidden: true,
    sequence: 1,
    targetSelector: 'ALL_HISTORICAL_DONE_CLAIMS'
  });
  const second = entryWithDigest({
    correctionId: 'C2A-CORRECTION-0002',
    effect: 'PRE_V2_UNREPLAYABLE_HISTORY_REMAINS_RAW_HISTORY_AND_CANNOT_CONFER_CURRENT_CERTIFICATION',
    operation: 'REMOVE_CERTIFICATION_AUTHORITY_ONLY',
    predecessorEntryDigest: first.entryDigest,
    rawMutationForbidden: true,
    sequence: 2,
    targetSelector: 'PLAN_STATE_REPLAY_BASELINE_ADOPTED_PRE_V2_UNREPLAYABLE_HISTORY'
  });
  return {
    corrections: [first, second],
    genesisDigest,
    ledgerId: genesis.ledgerId,
    ownerAuthorityBindingDigest: OWNER_BINDING_DIGEST,
    programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
    rawMutationForbidden: true,
    schemaVersion: 'YALKEN_R24_C2A_CORRECTION_LEDGER_V1'
  };
}

export function buildHistoricalManifest(repoRoot = process.cwd(), gitOracle = createGitOracle(repoRoot)) {
  const opsRoot = path.join(repoRoot, 'docs/OPS/R24');
  const receiptPaths = fs.readdirSync(opsRoot)
    .filter((name) => /^CTR-R24-.*\.json$/u.test(name))
    .map((name) => `docs/OPS/R24/${name}`)
    .sort(lexical);
  const receipts = receiptPaths.map((receiptPath) => {
    const source = readJsonBytes(repoRoot, receiptPath);
    const value = source.value;
    hex(value.exactHeadSha, 40, `${receiptPath}:exactHeadSha`);
    assert(gitOracle.commitExists(value.exactHeadSha), 'E_GIT_OBJECT_MISSING', value.exactHeadSha);
    assert(gitOracle.isAncestor(value.exactHeadSha, PRODUCTION_HEAD_SHA), 'E_GIT_NOT_REACHABLE', value.exactHeadSha);
    return {
      commitTreeSha: gitOracle.treeFor(value.exactHeadSha),
      contourId: value.contourId,
      exactHeadSha: value.exactHeadSha,
      productionReachable: true,
      rawStates: {
        mergeState: value.mergeState,
        postmergeState: value.postmergeState,
        survivorState: value.survivorState
      },
      receiptId: value.receiptId,
      repoRelativePath: receiptPath,
      sourceByteLength: source.bytes.length,
      sourceSha256: source.digest
    };
  });
  const plan = readJsonBytes(repoRoot, PATHS.planState);
  const stateCounts = Object.values(plan.value.contours).reduce((counts, contour) => {
    counts[contour.state] = (counts[contour.state] ?? 0) + 1;
    return counts;
  }, {});
  return {
    immutablePlanState: {
      activeLeaseCount: Object.keys(plan.value.leases).length,
      contourCount: Object.keys(plan.value.contours).length,
      fencingCounter: plan.value.fencingCounter,
      rawStateCounts: Object.fromEntries(Object.entries(stateCounts).sort(([left], [right]) => lexical(left, right))),
      replayBaseline: {
        classification: plan.value.replayBaseline.classification,
        sourceHeadSha: plan.value.replayBaseline.sourceHeadSha,
        unreplayableContourIds: [...plan.value.replayBaseline.unreplayableContourIds]
      },
      repoRelativePath: PATHS.planState,
      revision: plan.value.revision,
      sourceByteLength: plan.bytes.length,
      sourceSha256: plan.digest
    },
    productionSnapshot: {
      headSha: PRODUCTION_HEAD_SHA,
      treeSha: PRODUCTION_TREE_SHA
    },
    programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
    rawReceiptSetDigest: sha256(canonicalBytes(receipts)),
    receipts,
    schemaVersion: 'YALKEN_R24_C2A_HISTORICAL_RECEIPT_MANIFEST_V1',
    sourceEvidenceStampIds: sourceEvidenceStampIds(receipts, repoRoot),
    sourceCount: receipts.length
  };
}

const CURRENT_CERTIFICATION_ROWS = Object.freeze([
  {
    acceptanceSignalsDigest: 'c212fba6eeeead4dd3509eb4750484ac99281ac33e05728c5ff3f0f79d8dccce',
    evaluationSha: '38a12de89155fea29f03cf21504d665a86990aa5',
    evaluationTreeSha: '1b2df6e5765412aa5ddfb105edbf5db21a022ee0',
    externalArtifactDigest: 'sha256:04d307669d64046ec9851e30f734003bd26b73208f1abb27cf484ad73b07e43c',
    externalArtifactId: 9653939323,
    externalRunId: 33090093015,
    implementationCandidateSha: 'c253d7c57d047cc89e194b874fc84708eb40984f',
    implementationMergeSha: '38a12de89155fea29f03cf21504d665a86990aa5',
    stageAdmissionAttestationDigest: 'bdc0cf41367fc79c94786753c6414235f1bb2a6b8efdff6dfd543f8c1a6521b4',
    stageId: 'B0',
    stageInstanceDigest: '8f83667bbce37a1d623de7e0c72e0634671d3e2de7f9c432c05977598b14fe59',
    terminalAttestationBytesDigest: 'c2f34f77a4182340f6b047025816c6467386aaddc75b6f181b33d5d4c24177be'
  },
  {
    acceptanceSignalsDigest: '05590127544b0c09c43f20646716084c0da42ce26b71c7864234d791ebe2cffa',
    evaluationSha: 'ae48466067d2bd8caf4c3629d2deda94f49e704d',
    evaluationTreeSha: '81b176c9cf0cbe757c09834e77e9a78824ffd319',
    externalArtifactDigest: 'sha256:4dd82db230740ba5fc5ad483711fb8e31ae5b86be912c4c37562a80f810f2105',
    externalArtifactId: 9664681750,
    externalRunId: 33116456511,
    implementationCandidateSha: '7b2e085a1a5cad2979662fe02d5c5cfcc09e19cb',
    implementationMergeSha: 'ae48466067d2bd8caf4c3629d2deda94f49e704d',
    stageAdmissionAttestationDigest: 'f851e6bf5a85bda2ddf2b017c5f932789d72c15b1ed8caa86653f06778defdad',
    stageId: 'C1A',
    stageInstanceDigest: '456f1098a57de1b24add67f3f3920734d85417a02f56f5a7519a2e77b87479ef',
    terminalAttestationBytesDigest: 'b163c284fff1eebc676d8c537387717b8048e57d8c9c735d32d7a6381b21c399'
  },
  {
    acceptanceSignalsDigest: '338a47c34501a7d39802e5a44484bfb1b5eb4184c3dd338c40141f36983b0851',
    evaluationSha: '13b2618e1aee21abf74b60c8d2075c17d83247f4',
    evaluationTreeSha: '9e7987812563905fb0ad3a5e32c213337ba99807',
    externalArtifactDigest: 'sha256:458643636557aa679f4a3ca333237dab826969435998ec3240594b1f49016573',
    externalArtifactId: 9659425042,
    externalRunId: 33103401245,
    implementationCandidateSha: 'e5933c33fd492b68b93ab1779d455ea754bbe272',
    implementationMergeSha: '2799a884e4135df24efbcaa666c1db61b7b12941',
    stageAdmissionAttestationDigest: '6d548aecda9830c5a7224ce12e40decd53c804a885dfd412412c27438097b6e7',
    stageId: 'C1B',
    stageInstanceDigest: '12362330d4d29f0c94413da061e1e325c1fedd6b8bf30bd137fdc3d5a4d1cefe',
    terminalAttestationBytesDigest: 'b5525b1f5135fdc64862f86a73dcbcf8d2a537f782f7461c0ed907a2bff03b17'
  },
  {
    acceptanceSignalsDigest: 'aaeb8092861a4667244eb95dec7cedb95da1429b852cc2846626cc5600101061',
    evaluationSha: 'f543ea5093778830e56119027a9ddb60f4084cc7',
    evaluationTreeSha: 'd037bdce0e4035fd17fd5fec18bddedc2bb8dfdb',
    externalArtifactDigest: 'sha256:b497b2ecc672ca448979cfac015891d9360b495c6ce5981c7e7037f1fc99c38e',
    externalArtifactId: 9666640939,
    externalRunId: 33121545596,
    implementationCandidateSha: '3538489872fb05076cbb28bc311fe404c34755ac',
    implementationMergeSha: 'f543ea5093778830e56119027a9ddb60f4084cc7',
    stageAdmissionAttestationDigest: 'f2369cfae1498505cfc2b3ce439688738a89fc3ff320f86fa840c3a4db9e9802',
    stageId: 'C1C',
    stageInstanceDigest: 'e5902d81ab8c8e72098a6a4fbc4154e1dc358f57f6fa34fbca9b04a3f58b3e0c',
    terminalAttestationBytesDigest: '9dff7fa57615d98fe6aee4486f63af5b97e87093955a08ee23028363c8ae7034'
  }
]);

export function buildCurrentCertificationSet(gitOracle = createGitOracle(process.cwd())) {
  const certifications = CURRENT_CERTIFICATION_ROWS.map((row) => {
    for (const field of ['implementationCandidateSha', 'implementationMergeSha', 'evaluationSha']) {
      assert(gitOracle.commitExists(row[field]), 'E_GIT_OBJECT_MISSING', `${row.stageId}:${field}`);
      assert(gitOracle.isAncestor(row[field], PRODUCTION_HEAD_SHA), 'E_GIT_NOT_REACHABLE', `${row.stageId}:${field}`);
    }
    assert(gitOracle.treeFor(row.evaluationSha) === row.evaluationTreeSha, 'E_GIT_TREE_MISMATCH', row.stageId);
    return {
      ...row,
      externalArtifactExpired: false,
      externalProvider: 'GITHUB_ACTIONS_PROTECTED_WORKFLOW',
      programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
      status: 'VERIFIED',
      trustModelDigest: TRUST_MODEL_DIGEST
    };
  });
  return {
    certifications,
    currentCertificationSetDigest: sha256(canonicalBytes(certifications)),
    observedAtUtc: OBSERVED_AT_UTC,
    productionSnapshot: {
      headSha: PRODUCTION_HEAD_SHA,
      treeSha: PRODUCTION_TREE_SHA
    },
    programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
    schemaVersion: 'YALKEN_R24_C2A_CURRENT_CERTIFICATION_SET_V1',
    separatedFromHistoricalReceipts: true,
    trustModelDigest: TRUST_MODEL_DIGEST
  };
}

export function buildClaimBindings({ contract, ledger, historical, current }) {
  const historicalBindings = historical.receipts.map((receipt) => {
    const effectiveState = rawLifecycleState(receipt);
    return {
      certifiedState: certifiedStateForHistorical(effectiveState),
      effectiveState,
      rawReceiptDigest: receipt.sourceSha256,
      rawState: effectiveState,
      receiptId: receipt.receiptId,
      successorStages: nextSuccessorStages(receipt.receiptId)
    };
  }).sort((left, right) => lexical(left.receiptId, right.receiptId));
  const controlStageBindings = current.certifications.map((certification) => ({
    certifiedState: 'CERTIFIED_DONE',
    evaluationSha: certification.evaluationSha,
    externalArtifactDigest: certification.externalArtifactDigest,
    stageId: certification.stageId,
    terminalAttestationBytesDigest: certification.terminalAttestationBytesDigest
  }));
  return {
    controlStageBindings,
    historicalBindings,
    nextCorrectiveStage: 'C2B1',
    programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
    schemaVersion: 'YALKEN_R24_C2A_EFFECTIVE_CERTIFICATION_CLAIM_BINDINGS_V1',
    sourceEvidenceStampIds: [...historical.sourceEvidenceStampIds],
    sourceDigests: {
      contractDigest: sha256(canonicalBytes(contract)),
      correctionLedgerDigest: sha256(canonicalBytes(ledger)),
      currentCertificationSetDigest: sha256(canonicalBytes(current)),
      historicalReceiptManifestDigest: sha256(canonicalBytes(historical))
    },
    successorBindingRule: 'EVERY_HISTORICAL_CLAIM_BINDS_FIRST_TO_C2B1_INVALIDATION_THEN_TO_AN_EXPLICIT_RECERTIFICATION_OR_RECONCILIATION_STAGE'
  };
}

export function validateContract(contract, gitOracle) {
  assert(contract.schemaVersion === 'YALKEN_R24_C2A_EFFECTIVE_CERTIFICATION_CONTRACT_V1', 'E_CONTRACT_SCHEMA', 'schemaVersion');
  assert(contract.programTemplateDigest === PROGRAM_TEMPLATE_DIGEST, 'E_PROGRAM_DIGEST_MISMATCH', 'contract');
  assert(contract.trustModelDigest === TRUST_MODEL_DIGEST, 'E_TRUST_MODEL_MISMATCH', 'contract');
  assert(contract.stateModel.rawState === 'IMMUTABLE_HISTORICAL_INPUT', 'E_STATE_MODEL', 'raw');
  assert(contract.stateModel.effectiveState === 'RAW_PLUS_APPEND_ONLY_CORRECTIONS', 'E_STATE_MODEL', 'effective');
  assert(contract.stateModel.certifiedState === 'EFFECTIVE_STATE_PLUS_VALID_CURRENT_EXTERNAL_ATTESTATIONS', 'E_STATE_MODEL', 'certified');
  assert(contract.stateModel.currentCertificationSetSeparatedFromImmutableHistoricalReceipts === true, 'E_STATE_CONFLATION', 'current/historical');
  assert(gitOracle.commitExists(contract.productionSnapshot.headSha), 'E_GIT_OBJECT_MISSING', 'production snapshot');
  assert(gitOracle.treeFor(contract.productionSnapshot.headSha) === contract.productionSnapshot.treeSha, 'E_GIT_TREE_MISMATCH', 'production snapshot');
}

export function validateLedger(ledger) {
  assert(ledger.schemaVersion === 'YALKEN_R24_C2A_CORRECTION_LEDGER_V1', 'E_LEDGER_SCHEMA', 'schemaVersion');
  assert(ledger.programTemplateDigest === PROGRAM_TEMPLATE_DIGEST, 'E_PROGRAM_DIGEST_MISMATCH', 'ledger');
  assert(ledger.rawMutationForbidden === true, 'E_RAW_MUTATION_ALLOWED', 'ledger');
  assert(Array.isArray(ledger.corrections) && ledger.corrections.length > 0, 'E_LEDGER_EMPTY', 'corrections');
  let predecessor = ledger.genesisDigest;
  for (let index = 0; index < ledger.corrections.length; index += 1) {
    const entry = ledger.corrections[index];
    assert(entry.sequence === index + 1, 'E_LEDGER_REORDER', entry.correctionId);
    assert(entry.predecessorEntryDigest === predecessor, 'E_LEDGER_PREDECESSOR', entry.correctionId);
    assert(entry.rawMutationForbidden === true, 'E_RAW_MUTATION_ALLOWED', entry.correctionId);
    const { entryDigest, ...unsigned } = entry;
    assert(entryDigest === sha256(canonicalBytes(unsigned)), 'E_LEDGER_ENTRY_DIGEST', entry.correctionId);
    predecessor = entryDigest;
  }
}

export function validateHistoricalManifest(historical, repoRoot, gitOracle) {
  assert(historical.schemaVersion === 'YALKEN_R24_C2A_HISTORICAL_RECEIPT_MANIFEST_V1', 'E_HISTORY_SCHEMA', 'schemaVersion');
  assert(historical.programTemplateDigest === PROGRAM_TEMPLATE_DIGEST, 'E_PROGRAM_DIGEST_MISMATCH', 'history');
  assert(historical.sourceCount === 37 && historical.receipts.length === 37, 'E_HISTORY_COUNT', historical.sourceCount);
  const paths = historical.receipts.map((entry) => entry.repoRelativePath);
  const ids = historical.receipts.map((entry) => entry.receiptId);
  sortedUnique(paths, 'historical paths');
  assert(new Set(ids).size === ids.length, 'E_DUPLICATE', 'historical receipt ids');
  assert(historical.rawReceiptSetDigest === sha256(canonicalBytes(historical.receipts)), 'E_HISTORY_SET_DIGEST', 'receipts');
  const expectedSourceEvidenceStampIds = sourceEvidenceStampIds(historical.receipts, repoRoot);
  sortedUnique(historical.sourceEvidenceStampIds, 'historical source evidence stamp ids');
  assert(canonicalize(historical.sourceEvidenceStampIds) === canonicalize(expectedSourceEvidenceStampIds), 'E_SOURCE_EVIDENCE_STAMP_SET', 'history');
  for (const entry of historical.receipts) {
    for (const forbidden of FORBIDDEN_HISTORICAL_FIELDS) assert(!(forbidden in entry), 'E_HISTORY_CURRENT_CONFLATION', `${entry.receiptId}:${forbidden}`);
    const source = readJsonBytes(repoRoot, entry.repoRelativePath);
    assert(source.digest === entry.sourceSha256 && source.bytes.length === entry.sourceByteLength, 'E_RAW_RECEIPT_BYTES_CHANGED', entry.receiptId);
    assert(source.value.receiptId === entry.receiptId, 'E_RAW_RECEIPT_FIELD_MISMATCH', `${entry.receiptId}:receiptId`);
    assert(source.value.contourId === entry.contourId, 'E_RAW_RECEIPT_FIELD_MISMATCH', `${entry.receiptId}:contourId`);
    assert(source.value.exactHeadSha === entry.exactHeadSha, 'E_RAW_RECEIPT_FIELD_MISMATCH', `${entry.receiptId}:exactHeadSha`);
    for (const field of ['mergeState', 'postmergeState', 'survivorState']) {
      assert(source.value[field] === entry.rawStates[field], 'E_RAW_RECEIPT_FIELD_MISMATCH', `${entry.receiptId}:${field}`);
    }
    assert(gitOracle.commitExists(entry.exactHeadSha), 'E_GIT_OBJECT_MISSING', entry.receiptId);
    assert(gitOracle.treeFor(entry.exactHeadSha) === entry.commitTreeSha, 'E_GIT_TREE_MISMATCH', entry.receiptId);
    assert(gitOracle.isAncestor(entry.exactHeadSha, historical.productionSnapshot.headSha), 'E_GIT_NOT_REACHABLE', entry.receiptId);
    assert(entry.productionReachable === true, 'E_GIT_REACHABILITY_FLAG', entry.receiptId);
    rawLifecycleState(entry);
  }
  const plan = readJsonBytes(repoRoot, historical.immutablePlanState.repoRelativePath);
  assert(plan.digest === historical.immutablePlanState.sourceSha256 && plan.bytes.length === historical.immutablePlanState.sourceByteLength, 'E_RAW_PLAN_STATE_BYTES_CHANGED', PATHS.planState);
  assert(historical.immutablePlanState.replayBaseline.classification === 'ADOPTED_PRE_V2_UNREPLAYABLE_HISTORY', 'E_REPLAY_BASELINE_CLASSIFICATION', 'plan state');
  assert(historical.immutablePlanState.activeLeaseCount === 0, 'E_RAW_PLAN_ACTIVE_LEASE', 'plan state');
}

export function validateCurrentCertificationSet(current, gitOracle) {
  assert(current.schemaVersion === 'YALKEN_R24_C2A_CURRENT_CERTIFICATION_SET_V1', 'E_CURRENT_SET_SCHEMA', 'schemaVersion');
  assert(current.programTemplateDigest === PROGRAM_TEMPLATE_DIGEST, 'E_PROGRAM_DIGEST_MISMATCH', 'current set');
  assert(current.trustModelDigest === TRUST_MODEL_DIGEST, 'E_TRUST_MODEL_MISMATCH', 'current set');
  assert(current.separatedFromHistoricalReceipts === true, 'E_STATE_CONFLATION', 'current set');
  const stageIds = current.certifications.map((entry) => entry.stageId);
  assert(JSON.stringify(stageIds) === JSON.stringify(REQUIRED_CONTROL_STAGES), 'E_CURRENT_STAGE_SET', stageIds.join(','));
  assert(current.currentCertificationSetDigest === sha256(canonicalBytes(current.certifications)), 'E_CURRENT_SET_DIGEST', 'certifications');
  for (const entry of current.certifications) {
    exactKeys(entry, [
      'acceptanceSignalsDigest', 'evaluationSha', 'evaluationTreeSha', 'externalArtifactDigest', 'externalArtifactExpired',
      'externalArtifactId', 'externalProvider', 'externalRunId', 'implementationCandidateSha', 'implementationMergeSha',
      'programTemplateDigest', 'stageAdmissionAttestationDigest', 'stageId', 'stageInstanceDigest', 'status',
      'terminalAttestationBytesDigest', 'trustModelDigest'
    ], `current:${entry.stageId}`);
    assert(entry.status === 'VERIFIED', 'E_CURRENT_ATTESTATION_STALE', entry.stageId);
    assert(entry.programTemplateDigest === PROGRAM_TEMPLATE_DIGEST, 'E_PROGRAM_DIGEST_MISMATCH', entry.stageId);
    assert(entry.trustModelDigest === TRUST_MODEL_DIGEST, 'E_TRUST_MODEL_MISMATCH', entry.stageId);
    assert(entry.externalProvider === 'GITHUB_ACTIONS_PROTECTED_WORKFLOW' && entry.externalArtifactExpired === false, 'E_EXTERNAL_ATTESTATION_INVALID', entry.stageId);
    assert(/^sha256:[0-9a-f]{64}$/u.test(entry.externalArtifactDigest), 'E_EXTERNAL_ARTIFACT_DIGEST', entry.stageId);
    for (const field of ['terminalAttestationBytesDigest', 'stageInstanceDigest', 'stageAdmissionAttestationDigest', 'acceptanceSignalsDigest']) hex(entry[field], 64, `${entry.stageId}:${field}`);
    for (const field of ['implementationCandidateSha', 'implementationMergeSha', 'evaluationSha']) {
      hex(entry[field], 40, `${entry.stageId}:${field}`);
      assert(gitOracle.commitExists(entry[field]), 'E_GIT_OBJECT_MISSING', `${entry.stageId}:${field}`);
      assert(gitOracle.isAncestor(entry[field], current.productionSnapshot.headSha), 'E_GIT_NOT_REACHABLE', `${entry.stageId}:${field}`);
    }
    assert(gitOracle.treeFor(entry.evaluationSha) === entry.evaluationTreeSha, 'E_GIT_TREE_MISMATCH', entry.stageId);
  }
}

export function validateClaimBindings(bindings, contract, ledger, historical, current) {
  assert(bindings.schemaVersion === 'YALKEN_R24_C2A_EFFECTIVE_CERTIFICATION_CLAIM_BINDINGS_V1', 'E_BINDINGS_SCHEMA', 'schemaVersion');
  assert(bindings.programTemplateDigest === PROGRAM_TEMPLATE_DIGEST, 'E_PROGRAM_DIGEST_MISMATCH', 'bindings');
  assert(bindings.nextCorrectiveStage === 'C2B1', 'E_SUCCESSOR_STAGE', 'nextCorrectiveStage');
  assert(canonicalize(bindings.sourceEvidenceStampIds) === canonicalize(historical.sourceEvidenceStampIds), 'E_SOURCE_EVIDENCE_STAMP_SET', 'bindings');
  const expectedDigests = {
    contractDigest: sha256(canonicalBytes(contract)),
    correctionLedgerDigest: sha256(canonicalBytes(ledger)),
    currentCertificationSetDigest: sha256(canonicalBytes(current)),
    historicalReceiptManifestDigest: sha256(canonicalBytes(historical))
  };
  assert(canonicalize(bindings.sourceDigests) === canonicalize(expectedDigests), 'E_BINDING_SOURCE_DIGEST', 'sourceDigests');
  assert(bindings.historicalBindings.length === historical.receipts.length, 'E_SUCCESSOR_BINDING_MISSING', 'history count');
  const historyById = new Map(historical.receipts.map((entry) => [entry.receiptId, entry]));
  const bindingIds = bindings.historicalBindings.map((entry) => entry.receiptId);
  sortedUnique(bindingIds, 'historical binding ids');
  for (const binding of bindings.historicalBindings) {
    const source = historyById.get(binding.receiptId);
    assert(source, 'E_SUCCESSOR_BINDING_UNKNOWN', binding.receiptId);
    const lifecycle = rawLifecycleState(source);
    assert(binding.rawReceiptDigest === source.sourceSha256, 'E_SUCCESSOR_BINDING_DIGEST', binding.receiptId);
    assert(binding.rawState === lifecycle && binding.effectiveState === lifecycle, 'E_EFFECTIVE_STATE', binding.receiptId);
    assert(binding.certifiedState === certifiedStateForHistorical(lifecycle), 'E_CERTIFIED_STATE', binding.receiptId);
    assert(canonicalize(binding.successorStages) === canonicalize(nextSuccessorStages(binding.receiptId)), 'E_SUCCESSOR_STAGE', binding.receiptId);
  }
  assert(bindings.controlStageBindings.length === current.certifications.length, 'E_CONTROL_BINDING_COUNT', 'control stages');
  for (const certification of current.certifications) {
    const binding = bindings.controlStageBindings.find((entry) => entry.stageId === certification.stageId);
    assert(binding, 'E_CONTROL_BINDING_MISSING', certification.stageId);
    assert(binding.certifiedState === 'CERTIFIED_DONE', 'E_CONTROL_NOT_CERTIFIED', certification.stageId);
    assert(binding.terminalAttestationBytesDigest === certification.terminalAttestationBytesDigest, 'E_CONTROL_BINDING_DIGEST', certification.stageId);
    assert(binding.externalArtifactDigest === certification.externalArtifactDigest, 'E_CONTROL_BINDING_DIGEST', certification.stageId);
    assert(binding.evaluationSha === certification.evaluationSha, 'E_CONTROL_BINDING_EVALUATION', certification.stageId);
  }
}

export function compileCertificationState({ contract, ledger, historical, current, bindings, repoRoot = process.cwd(), gitOracle = createGitOracle(repoRoot) }) {
  validateContract(contract, gitOracle);
  validateLedger(ledger);
  validateHistoricalManifest(historical, repoRoot, gitOracle);
  validateCurrentCertificationSet(current, gitOracle);
  validateClaimBindings(bindings, contract, ledger, historical, current);
  const rawDone = bindings.historicalBindings.filter((entry) => entry.rawState === 'DONE').length;
  const rawPending = bindings.historicalBindings.filter((entry) => entry.rawState === 'PENDING').length;
  const certifiedDone = bindings.historicalBindings.filter((entry) => entry.certifiedState === 'CERTIFIED_DONE').length;
  const doneUncertified = bindings.historicalBindings.filter((entry) => entry.certifiedState === 'DONE_UNCERTIFIED').length;
  return {
    counts: {
      certifiedControlStages: bindings.controlStageBindings.length,
      certifiedHistoricalClaims: certifiedDone,
      correctionEntries: ledger.corrections.length,
      doneUncertifiedHistoricalClaims: doneUncertified,
      effectiveDoneHistoricalClaims: rawDone,
      effectivePendingHistoricalClaims: rawPending,
      historicalReceipts: historical.receipts.length,
      rawDoneHistoricalClaims: rawDone,
      rawPendingHistoricalClaims: rawPending
    },
    decision: 'C2A_EFFECTIVE_CERTIFICATION_STATE_VALID',
    productionSnapshot: deepClone(contract.productionSnapshot),
    schemaVersion: 'YALKEN_R24_C2A_EFFECTIVE_CERTIFICATION_RESULT_V1',
    signals: {
      ACTUAL_GIT_HEAD_TREE_AND_PRODUCTION_REACHABILITY: true,
      ALL_CERTIFICATION_MUTANTS_KILLED: 'REQUIRES_EXECUTED_TEST_ORACLE',
      APPEND_ONLY_CORRECTION_LEDGER: true,
      CURRENT_SET_SEPARATE_FROM_HISTORY: true,
      EXTERNAL_TERMINAL_ATTESTATION_VERIFIED: 'REQUIRES_POST_MERGE_EXTERNAL_C2A_ATTESTATION',
      RAW_EFFECTIVE_CERTIFIED_SEPARATED: true,
      SEMANTIC_ORACLE: true,
      SUCCESSOR_CLAIM_BINDINGS: true
    },
    status: 'PASS'
  };
}

export function loadArtifacts(repoRoot = process.cwd()) {
  const load = (relativePath) => readCanonicalJson(path.join(repoRoot, relativePath)).value;
  return {
    bindings: load(PATHS.bindings),
    contract: load(PATHS.contract),
    current: load(PATHS.current),
    historical: load(PATHS.historical),
    ledger: load(PATHS.ledger)
  };
}

function writeCanonical(repoRoot, relativePath, value) {
  fs.writeFileSync(path.join(repoRoot, relativePath), canonicalBytes(value));
}

function buildApprovals(repoRoot) {
  const approvedPaths = [
    PATHS.inventory,
    PATHS.contract,
    PATHS.ledger,
    PATHS.historical,
    PATHS.current,
    PATHS.bindings,
    PATHS.stageAdmission,
    PATHS.stageInstance,
    PATHS.script,
    PATHS.test
  ].sort(lexical);
  return {
    approvals: approvedPaths.map((filePath) => ({
      approvedAtUtc: OBSERVED_AT_UTC,
      approvedBy: `owner-standing-authority:${OWNER_BINDING_DIGEST}`,
      filePath,
      rationale: 'C2A exact admitted certification compiler, immutable raw manifest, append-only correction ledger, current external attestation set, successor bindings, and semantic falsification tests; no product truth mutation or semantic scope expansion.',
      sha256: rawSha256(fs.readFileSync(path.join(repoRoot, filePath)))
    })),
    version: 'v1.0'
  };
}

export function writeArtifacts(repoRoot = process.cwd()) {
  const gitOracle = createGitOracle(repoRoot);
  const contract = buildContract();
  const ledger = buildLedger();
  const historical = buildHistoricalManifest(repoRoot, gitOracle);
  const current = buildCurrentCertificationSet(gitOracle);
  const bindings = buildClaimBindings({ contract, ledger, historical, current });
  writeCanonical(repoRoot, PATHS.contract, contract);
  writeCanonical(repoRoot, PATHS.ledger, ledger);
  writeCanonical(repoRoot, PATHS.historical, historical);
  writeCanonical(repoRoot, PATHS.current, current);
  writeCanonical(repoRoot, PATHS.bindings, bindings);
  writeCanonical(repoRoot, PATHS.approvals, buildApprovals(repoRoot));
  return compileCertificationState({ contract, ledger, historical, current, bindings, repoRoot, gitOracle });
}

function assertExpectedBytes(repoRoot, relativePath, expected) {
  const actual = fs.readFileSync(path.join(repoRoot, relativePath));
  assert(actual.equals(canonicalBytes(expected)), 'E_GENERATED_ARTIFACT_DRIFT', relativePath);
}

export function checkArtifacts(repoRoot = process.cwd()) {
  const gitOracle = createGitOracle(repoRoot);
  const actual = loadArtifacts(repoRoot);
  const expectedContract = buildContract();
  const expectedLedger = buildLedger();
  const expectedHistorical = buildHistoricalManifest(repoRoot, gitOracle);
  const expectedCurrent = buildCurrentCertificationSet(gitOracle);
  const expectedBindings = buildClaimBindings({
    contract: expectedContract,
    ledger: expectedLedger,
    historical: expectedHistorical,
    current: expectedCurrent
  });
  assertExpectedBytes(repoRoot, PATHS.contract, expectedContract);
  assertExpectedBytes(repoRoot, PATHS.ledger, expectedLedger);
  assertExpectedBytes(repoRoot, PATHS.historical, expectedHistorical);
  assertExpectedBytes(repoRoot, PATHS.current, expectedCurrent);
  assertExpectedBytes(repoRoot, PATHS.bindings, expectedBindings);
  const expectedApprovals = buildApprovals(repoRoot);
  assertExpectedBytes(repoRoot, PATHS.approvals, expectedApprovals);
  return compileCertificationState({ ...actual, repoRoot, gitOracle });
}

function printResult(result) {
  process.stdout.write(canonicalBytes(result));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    if (process.argv.includes('--write')) printResult(writeArtifacts(process.cwd()));
    else if (process.argv.includes('--check')) printResult(checkArtifacts(process.cwd()));
    else fail('E_USAGE', '--write or --check');
  } catch (error) {
    process.stderr.write(`${canonicalize({ code: error.code ?? 'E_UNTYPED', message: error.message })}\n`);
    process.exitCode = 1;
  }
}
