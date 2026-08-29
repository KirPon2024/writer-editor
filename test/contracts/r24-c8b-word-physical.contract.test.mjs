import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  OWNER_WORD_DECISION_DIGEST,
  PATHS,
  ROOT_SEMANTIC_EXPECTED,
  SEALED_CANARY_RESULT_DIGEST,
  SOURCE_HEAD_SHA,
  STAGE_ADMISSION_DIGEST,
  STAGE_INSTANCE_DIGEST,
  WORD_BUILD,
  WORD_VERSION,
  assertPathlessPublicEvidence,
  buildContract,
  validateBoundedDeltaObservation,
  validateBindings,
  validateEvidence,
} from '../../scripts/ops/r24/corrective/c8b-word-physical.mjs';

const ROOT = process.cwd();

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('C8B fixed admission binds exact source, C8A certification, and owner Word authority', () => {
  const bindings = validateBindings(ROOT);
  assert.equal(bindings.stage.digest, STAGE_INSTANCE_DIGEST);
  assert.equal(bindings.admission.digest, STAGE_ADMISSION_DIGEST);
  assert.equal(bindings.stage.value.baseSha, SOURCE_HEAD_SHA);
  assert.equal(bindings.stage.value.dependencies[0].stageId, 'C8A');
  assert.equal(bindings.stage.value.dependencies[0].status, 'CERTIFIED_DONE');
  assert.equal(bindings.decision.digest, OWNER_WORD_DECISION_DIGEST);
  assert.equal(bindings.decision.value.authorizedScope.syntheticCorpusOnly, true);
  assert.equal(bindings.decision.value.authorizedScope.userDocuments, false);
});

test('C8B contract is bounded to synthetic Word lifecycle operations and no terminal claims', () => {
  const contract = buildContract(ROOT);
  assert.equal(contract.wordRuntime.version, WORD_VERSION);
  assert.equal(contract.wordRuntime.build, WORD_BUILD);
  assert.equal(contract.boundedLedger.operationCount, 4);
  assert.equal(contract.boundedLedger.familyCounts.root_comment, 4);
  assert.equal(contract.boundedLedger.familyCounts.reply_attempt, 0);
  assert.equal(contract.boundedLedger.familyCounts.state_attempt, 0);
  assert.deepEqual(contract.boundedLedger.rootSemanticOracleExpected, ROOT_SEMANTIC_EXPECTED);
  assert.equal(contract.nonClaims.includes('NO_NATIVE_REPLY_OR_STATE_CERTIFICATION'), true);
  assert.equal(contract.nonClaims.includes('NO_PROGRAM_DONE'), true);
  assert.equal(contract.nonClaims.includes('NO_WORD_PRODUCT_TERMINAL_PASS'), true);
  assert.equal(assertPathlessPublicEvidence(contract), true);
});

test('C8B current evidence proves a fresh synthetic Word round and durable pathless raw artifacts', () => {
  const contract = buildContract(ROOT);
  const evidence = readJson(PATHS.evidence);
  assert.equal(validateEvidence(evidence, contract), true);
  assert.equal(evidence.execution.wordProcessCountBeforeRun, 0);
  assert.equal(evidence.execution.wordDocumentCountBeforeRun, 0);
  assert.equal(evidence.execution.wordDocumentCountBeforeQuit, 0);
  assert.equal(evidence.execution.wordProcessCountAfterQuit, 0);
  assert.equal(evidence.observations.lifecycle.rootOperationCount, 4);
  assert.equal(evidence.observations.lifecycle.lifecycleOperationCount, 0);
  assert.equal(evidence.observations.lifecycle.nativeVerifiedCount, 0);
  assert.deepEqual(evidence.observations.lifecycle.rootSemanticOracle, ROOT_SEMANTIC_EXPECTED);
  assert.equal(evidence.observations.rawArtifacts.durable, true);
  assert.equal(evidence.observations.rawArtifacts.nonOverwriting, true);
  assert.equal(evidence.observations.rawArtifacts.sealedCanaryResult.sha256, SEALED_CANARY_RESULT_DIGEST);
});

test('C8B bounded delta validator admits only the source or a two-commit write-set descendant', () => {
  assert.equal(validateBoundedDeltaObservation({ candidateSha: SOURCE_HEAD_SHA, changedPaths: [], commitCount: 0, label: 'SOURCE', sourceIsAncestor: true }), true);
  assert.equal(validateBoundedDeltaObservation({
    candidateSha: 'a'.repeat(40),
    changedPaths: [PATHS.contract, PATHS.evidence],
    commitCount: 2,
    label: 'MERGE',
    sourceIsAncestor: true,
  }), true);
  assert.throws(() => validateBoundedDeltaObservation({ candidateSha: 'a'.repeat(40), changedPaths: [PATHS.contract], commitCount: 3, sourceIsAncestor: true }), /E_UNBOUNDED_DELTA/u);
  assert.throws(() => validateBoundedDeltaObservation({ candidateSha: 'a'.repeat(40), changedPaths: ['package.json'], commitCount: 1, sourceIsAncestor: true }), /E_WRITE_SET_DRIFT/u);
  assert.throws(() => validateBoundedDeltaObservation({ candidateSha: 'a'.repeat(40), changedPaths: [PATHS.contract], commitCount: 1, sourceIsAncestor: false }), /E_SOURCE_HEAD_NOT_ANCESTOR/u);
  assert.throws(() => validateBoundedDeltaObservation({ candidateSha: 'a'.repeat(40), changedPaths: [`docs//${path.basename(PATHS.contract)}`], commitCount: 1, sourceIsAncestor: true }), /E_DELTA_PATH_NORMALIZATION/u);
});

test('C8B rejects user-document access, stale heads, and lifecycle-root loss', () => {
  const contract = buildContract(ROOT);
  const evidence = readJson(PATHS.evidence);
  const userDocument = clone(evidence);
  userDocument.observations.safety.userDocumentsTouched = true;
  assert.throws(() => validateEvidence(userDocument, contract), /E_USER_DOCUMENT_BOUNDARY/u);
  const stale = clone(evidence);
  stale.observations.git.headSha = '0'.repeat(40);
  assert.throws(() => validateEvidence(stale, contract), /E_GIT_BINDING/u);
  const rootLoss = clone(evidence);
  rootLoss.observations.lifecycle.rootOperationCount = 3;
  assert.throws(() => validateEvidence(rootLoss, contract), /E_LIFECYCLE_ROOT_PRESERVATION/u);
  const rootSemanticMutant = clone(evidence);
  rootSemanticMutant.observations.lifecycle.rootSemanticOracle.reopenedCanonicalCount = 3;
  assert.throws(() => validateEvidence(rootSemanticMutant, contract), /E_ROOT_SEMANTIC_ORACLE/u);
});

test('C8B rejects Word red, authority drift, raw-manifest drift, and public path leaks', () => {
  const contract = buildContract(ROOT);
  const evidence = readJson(PATHS.evidence);
  const wordRed = clone(evidence);
  wordRed.observations.roundTrip.nativeLifecycleOk = false;
  assert.throws(() => validateEvidence(wordRed, contract), /E_WORD_PHYSICAL/u);
  const authorityDrift = clone(evidence);
  authorityDrift.sourceBindings.ownerDecisionDigest = '0'.repeat(64);
  assert.throws(() => validateEvidence(authorityDrift, contract), /E_OWNER_DECISION_BINDING/u);
  const manifestDrift = clone(evidence);
  manifestDrift.observations.rawArtifacts.manifest.sha256 = '0'.repeat(63);
  assert.throws(() => validateEvidence(manifestDrift, contract), /E_RAW_MANIFEST_BINDING/u);
  const pathLeak = clone(evidence);
  pathLeak.observations.rawArtifacts.runCapabilityId = '/Users/example/Documents';
  assert.throws(() => validateEvidence(pathLeak, contract), /E_RAW_RUN_CAPABILITY|E_PUBLIC_PATH_LEAK/u);
});

test('C8B runner source preserves one fresh Word process and forbids user/release authority', () => {
  const source = fs.readFileSync(path.join(ROOT, PATHS.script), 'utf8');
  for (const token of [
    "'/usr/bin/pgrep', ['-x', 'Microsoft Word']",
    'E_FRESH_WORD_SESSION',
    'C8B_WORD_DOCUMENTS_REMAIN',
    'userDocumentsTouched: false',
    'OWNER_WORD_DECISION_DIGEST',
    'targetRootOperationId',
    'validateBoundedDeltaObservation',
    'rootSemanticOracle',
    'sceneAuthorityIdentityJoin',
    'DURABLE_PATHLESS_RAW_EVIDENCE_INDEX',
    '--accessibility-runner',
    "'hammerspoon'",
  ]) assert.equal(source.includes(token), true, `missing Word safety fence: ${token}`);
  for (const forbidden of ['force-push', 'notarize', 'signingIdentity', 'PUBLIC_DISTRIBUTION_ALLOWED']) {
    assert.equal(source.includes(forbidden), false, `forbidden authority: ${forbidden}`);
  }
});
