import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { canonicalBytes } from '../../scripts/ops/r24/corrective/canonical-json.mjs';
import {
  ACCEPTANCE_SIGNALS_DIGEST,
  EXPECTED_SNAPSHOT,
  FENCE_DIGEST,
  PREDECESSOR_TERMINAL_DIGEST,
  SOURCE_HEAD_SHA,
  SOURCE_TREE_SHA,
  STAGE_ADMISSION_DIGEST,
  STAGE_INSTANCE_DIGEST,
  WRITE_SET,
  assertSourceIdentity,
  buildArtifacts,
  evaluateOperationalAdmission,
  loadInputs
} from '../../scripts/ops/r24/corrective/c3-operational-entrypoint.mjs';

const clone = (value = EXPECTED_SNAPSHOT) => JSON.parse(JSON.stringify(value));

test('C3 compiles one admitted, fenced, graph-selected WIP=1 receipt', () => {
  const receipt = evaluateOperationalAdmission();
  assert.equal(receipt.status, 'SELECTED');
  assert.equal(receipt.selectedNode, 'C3');
  assert.deepEqual(receipt.eligibleNodes, ['C3']);
  assert.equal(receipt.oneWriter, true);
  assert.equal(receipt.wip, 1);
  assert.equal(receipt.fenceDigest, FENCE_DIGEST);
  assert.equal(receipt.predecessorTerminalAttestationDigest, PREDECESSOR_TERMINAL_DIGEST);
  assert.equal(receipt.stageInstanceDigest, STAGE_INSTANCE_DIGEST);
  assert.equal(receipt.stageAdmissionDigest, STAGE_ADMISSION_DIGEST);
  assert.equal(receipt.acceptanceSignalsDigest, ACCEPTANCE_SIGNALS_DIGEST);
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(Object.isFrozen(receipt.roles), true);
});

test('C3 public selection receipt is pathless and immutable', () => {
  const receipt = evaluateOperationalAdmission();
  const strings = [];
  const visit = (value) => {
    if (typeof value === 'string') strings.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(receipt);
  assert.equal(strings.some((value) => value.includes('/') || value.includes('\\') || value.includes('/Volumes') || value.includes('/Users')), false);
  assert.equal(receipt.publicReceiptPathPolicy, 'PATHLESS_CAPABILITY_IDS_ROLES_AND_DIGESTS_ONLY');
  assert.equal(receipt.externalTerminalAttestationRequired, true);
  assert.equal(receipt.leaseReleaseRequired, true);
});

test('C3 rejects stale head without escalating a routine owner gate', () => {
  const snapshot = clone();
  snapshot.exactIdentity.headSha = 'a'.repeat(40);
  const result = evaluateOperationalAdmission(snapshot);
  assert.equal(result.status, 'BLOCKED_NODE');
  assert.equal(result.blockerClass, 'STALE_OR_AMBIGUOUS_REVISION');
  assert.equal(result.ownerActionUnavoidable, false);
});

test('C3 rejects stale tree and requires a fresh exact identity amendment', () => {
  const snapshot = clone();
  snapshot.exactIdentity.treeSha = 'b'.repeat(40);
  const result = evaluateOperationalAdmission(snapshot);
  assert.equal(result.blockerClass, 'STALE_OR_AMBIGUOUS_REVISION');
  assert.equal(result.recoveryCondition, 'RECOMPILE_STAGE_INSTANCE_AT_FRESH_EXACT_BASE_HEAD_TREE');
});

test('C3 crash recovery cannot reuse a stale or non-monotonic fence', () => {
  const snapshot = clone();
  snapshot.fence.fencingCounter = 13;
  const result = evaluateOperationalAdmission(snapshot);
  assert.equal(result.status, 'BLOCKED_NODE');
  assert.equal(result.blockerClass, 'CRASH_OR_STALE_FENCE');
  assert.equal(result.ownerActionUnavoidable, false);
});

test('C3 enforces one writer and WIP=1', () => {
  const snapshot = clone();
  snapshot.lease.wip = 2;
  const result = evaluateOperationalAdmission(snapshot);
  assert.equal(result.blockerClass, 'LEASE_OR_WIP_MISMATCH');
  assert.equal(result.ownerActionUnavoidable, false);
});

test('C3 rejects multiple eligible graph nodes instead of starting a second contour', () => {
  const snapshot = clone();
  snapshot.graph.eligibleNodes.push('C4');
  const result = evaluateOperationalAdmission(snapshot);
  assert.equal(result.blockerClass, 'GRAPH_SELECTION_NOT_UNIQUE');
  assert.equal(result.ownerActionUnavoidable, false);
});

test('C3 rejects a dependency that is not bound to current external certification', () => {
  const snapshot = clone();
  snapshot.graph.dependencies[0].status = 'DONE';
  const result = evaluateOperationalAdmission(snapshot);
  assert.equal(result.blockerClass, 'DEPENDENCY_NOT_EXTERNALLY_CERTIFIED');
  assert.equal(result.ownerActionUnavoidable, false);
});

test('C3 keeps routine network and CI failure as a local action fence', () => {
  const snapshot = clone();
  snapshot.ownerBoundary = 'ROUTINE_NETWORK_FAILURE';
  const result = evaluateOperationalAdmission(snapshot);
  assert.equal(result.status, 'BLOCKED_NODE');
  assert.equal(result.blockerClass, 'ROUTINE_LOCAL_ACTION_FENCE');
  assert.equal(result.ownerActionUnavoidable, false);
});

test('C3 emits owner gate only for an exact non-delegable boundary', () => {
  const snapshot = clone();
  snapshot.ownerBoundary = 'CREDENTIAL_IDENTITY_OR_SECRET_ENTRY_OR_DISCLOSURE';
  const result = evaluateOperationalAdmission(snapshot);
  assert.equal(result.status, 'OWNER_GATE');
  assert.equal(result.blockerClass, snapshot.ownerBoundary);
  assert.equal(result.ownerActionUnavoidable, true);
});

test('C3 generated contract, matrix and receipt bind exact source identities', () => {
  const artifacts = buildArtifacts(loadInputs());
  assert.equal(artifacts.contract.sourceIdentity.headSha, SOURCE_HEAD_SHA);
  assert.equal(artifacts.contract.sourceIdentity.treeSha, SOURCE_TREE_SHA);
  assert.equal(artifacts.matrix.vectors.length, 9);
  assert.equal(artifacts.receipt.sourceHeadDigest, SOURCE_HEAD_SHA);
  assert.equal(artifacts.receipt.sourceTreeDigest, SOURCE_TREE_SHA);
});

test('C3 source identity permits only the exact admitted ten-path write set', () => {
  assert.equal(WRITE_SET.length, 10);
  const identity = assertSourceIdentity();
  assert.equal(identity.sourceHeadSha, SOURCE_HEAD_SHA);
  assert.equal(identity.sourceTreeSha, SOURCE_TREE_SHA);
  for (const relativePath of [
    'docs/OPS/R24/CORRECTIVE/C3_STAGE_INSTANCE_V1.json',
    'docs/OPS/R24/CORRECTIVE/C3_STAGE_ADMISSION_ATTESTATION_V1.json'
  ]) {
    const bytes = fs.readFileSync(relativePath);
    assert.equal(bytes.equals(canonicalBytes(JSON.parse(bytes))), true);
  }
});
