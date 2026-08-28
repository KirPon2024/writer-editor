import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { canonicalBytes } from '../../scripts/ops/r24/corrective/canonical-json.mjs';
import {
  AFTER_AUDIT_SHA256,
  APPROVED_ELECTRON_VERSION,
  APPROVED_INTERNAL_EXTRACT_ZIP_VERSION,
  BEFORE_AUDIT_SHA256,
  CURRENT_LOCK_SHA256,
  STAGE_ADMISSION_DIGEST,
  STAGE_INSTANCE_DIGEST,
  evaluateAudit,
  sha256,
  validateInstalledResolution,
  validatePackageGraph,
} from '../../scripts/ops/r24/corrective/c6d-dependency-audit.mjs';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const readBytes = (relativePath) => fs.readFileSync(path.join(REPO_ROOT, relativePath));
const readJson = (relativePath) => JSON.parse(readBytes(relativePath).toString('utf8'));

test('C6D live package and installed graphs bind only the approved current-checkout resolution', () => {
  const packageBytes = readBytes('package.json');
  const lockBytes = readBytes('package-lock.json');
  const packageJson = JSON.parse(packageBytes.toString('utf8'));
  const lock = JSON.parse(lockBytes.toString('utf8'));
  const graph = validatePackageGraph(packageJson, lock, lockBytes);
  assert.deepEqual(graph, { failures: [], status: 'PASS' });
  assert.equal(packageJson.devDependencies.electron, APPROVED_ELECTRON_VERSION);
  assert.equal(lock.packages['node_modules/electron'].version, APPROVED_ELECTRON_VERSION);
  assert.equal(lock.packages['node_modules/@electron-internal/extract-zip'].version, APPROVED_INTERNAL_EXTRACT_ZIP_VERSION);
  assert.equal(Object.hasOwn(lock.packages, 'node_modules/extract-zip'), false);
  assert.equal(sha256(lockBytes), CURRENT_LOCK_SHA256);

  const installed = validateInstalledResolution(REPO_ROOT);
  assert.equal(installed.status, 'PASS', JSON.stringify(installed.failures));
  assert.deepEqual(installed.bindings.map((binding) => binding.capabilityId), [
    'CAP_R24_C6D_INSTALLED_ELECTRON',
    'CAP_R24_C6D_INSTALLED_INTERNAL_EXTRACT_ZIP',
  ]);
});

test('C6D package graph kills stale Electron, legacy extract-zip, and lock-digest mutants', () => {
  const packageJson = readJson('package.json');
  const lockBytes = readBytes('package-lock.json');
  const lock = JSON.parse(lockBytes.toString('utf8'));

  const stalePackage = structuredClone(packageJson);
  stalePackage.devDependencies.electron = '^40.9.2';
  assert.equal(validatePackageGraph(stalePackage, lock, lockBytes).failures[0].code, 'E_ELECTRON_PACKAGE_VERSION');

  const legacyLock = structuredClone(lock);
  legacyLock.packages['node_modules/extract-zip'] = { version: '2.0.1' };
  const legacyBytes = canonicalBytes(legacyLock);
  assert.equal(validatePackageGraph(packageJson, legacyLock, legacyBytes).failures.some((failure) => failure.code === 'E_VULNERABLE_EXTRACT_ZIP_PRESENT'), true);

  const driftedBytes = Buffer.concat([lockBytes, Buffer.from(' ')]);
  assert.equal(validatePackageGraph(packageJson, lock, driftedBytes).failures.some((failure) => failure.code === 'E_LOCK_DIGEST'), true);
});

test('C6D release audit fails closed on every nonzero vulnerability class', () => {
  const cleanBytes = Buffer.from('clean-audit');
  const clean = evaluateAudit({
    auditReportVersion: 2,
    metadata: { vulnerabilities: { critical: 0, high: 0, info: 0, low: 0, moderate: 0, total: 0 } },
  }, cleanBytes);
  assert.equal(clean.status, 'PASS');
  assert.equal(clean.decision, 'RELEASE_AUDIT_ZERO_VULNERABILITIES');

  for (const mutation of [
    { high: 1, total: 1, code: 'E_RELEASE_HIGH_VULNERABILITY' },
    { critical: 1, total: 1, code: 'E_RELEASE_CRITICAL_VULNERABILITY' },
    { low: 1, total: 1, code: 'E_RELEASE_TOTAL_VULNERABILITY' },
  ]) {
    const counts = { critical: 0, high: 0, info: 0, low: 0, moderate: 0, total: 0, ...mutation };
    delete counts.code;
    const result = evaluateAudit({ auditReportVersion: 2, metadata: { vulnerabilities: counts } }, Buffer.from(JSON.stringify(counts)));
    assert.equal(result.status, 'FAIL');
    assert.equal(result.failures.some((failure) => failure.code === mutation.code), true);
  }
});

test('C6D artifacts close the C1 provisional cycle without claiming release or Program DONE', () => {
  const contractBytes = readBytes('docs/OPS/R24/CORRECTIVE/C6D_DEPENDENCY_AUDIT_CONTRACT_V1.json');
  const artifactBytes = readBytes('docs/OPS/R24/CORRECTIVE/C6D_CURRENT_CHECKOUT_DEPENDENCY_ARTIFACT_V1.json');
  const environmentBytes = readBytes('docs/OPS/R24/CORRECTIVE/C6D_IMMUTABLE_ENVIRONMENT_MANIFEST_V1.json');
  const dispositionBytes = readBytes('docs/OPS/R24/CORRECTIVE/C6D_AUDIT_DISPOSITION_V1.json');
  const contract = JSON.parse(contractBytes.toString('utf8'));
  const artifact = JSON.parse(artifactBytes.toString('utf8'));
  const environment = JSON.parse(environmentBytes.toString('utf8'));
  const disposition = JSON.parse(dispositionBytes.toString('utf8'));

  for (const [bytes, value] of [
    [contractBytes, contract],
    [artifactBytes, artifact],
    [environmentBytes, environment],
    [dispositionBytes, disposition],
  ]) assert.equal(bytes.equals(canonicalBytes(value)), true);

  assert.equal(contract.sourceBindings.stageInstanceDigest, STAGE_INSTANCE_DIGEST);
  assert.equal(contract.sourceBindings.stageAdmissionDigest, STAGE_ADMISSION_DIGEST);
  assert.equal(contract.signals.EXTERNAL_TERMINAL_ATTESTATION_VERIFIED, 'PENDING_POST_MERGE_EXTERNAL_C6D_ATTESTATION');
  assert.equal(artifact.audit.rawAuditSha256, AFTER_AUDIT_SHA256);
  assert.deepEqual(artifact.audit.counts, { critical: 0, high: 0, info: 0, low: 0, moderate: 0, total: 0 });
  assert.equal(environment.isolation.currentCheckoutInstalledResolutionOnly, true);
  assert.equal(environment.isolation.absolutePathsPublished, false);
  assert.equal(disposition.reproducedBaseline.rawAuditSha256, BEFORE_AUDIT_SHA256);
  assert.equal(disposition.decisions.c1ProvisionalAuditCycle, 'CLOSED');
  assert.equal(disposition.decisions.releaseScope, 'DEPENDENCY_AUDIT_GATE_ONLY');
  assert.equal(disposition.terminalState, 'PENDING_POST_MERGE_EXTERNAL_C6D_ATTESTATION');
  assert.equal(contract.nonClaims.includes('NO_PROGRAM_DONE'), true);
  assert.equal([contract.status, artifact.status, environment.status, disposition.status].some((status) => status === 'PROGRAM_DONE'), false);
});

test('C6D current public capability evidence is pathless and hash bound', () => {
  const contract = readJson('docs/OPS/R24/CORRECTIVE/C6D_DEPENDENCY_AUDIT_CONTRACT_V1.json');
  const artifact = readJson('docs/OPS/R24/CORRECTIVE/C6D_CURRENT_CHECKOUT_DEPENDENCY_ARTIFACT_V1.json');
  const capabilities = [
    ...Object.values(contract.capabilityIds),
    ...artifact.approvedResolution.installedBindings.map((binding) => binding.capabilityId),
  ];
  for (const capabilityId of capabilities) {
    assert.match(capabilityId, /^CAP_R24_[A-Z0-9_]+$/u);
    assert.equal(/[\\/]/u.test(capabilityId), false);
  }
  assert.equal(artifact.dependencyGraph.lockfileSha256, CURRENT_LOCK_SHA256);
  assert.equal(artifact.approvedResolution.legacyExtractZipAbsent, true);
  assert.equal(artifact.isolationProof.currentCheckoutRealpathValidated, true);
  assert.equal(artifact.isolationProof.siblingResolutionUsed, false);
});

test('C6D updated C1A contract preserves the historical baseline and binds the closed current graph', () => {
  const c1a = readJson('docs/OPS/R24/CORRECTIVE/C1A_TOOLCHAIN_CONTRACT_V1.json');
  assert.equal(c1a.auditPolicy.baselineObservation.high, 2);
  assert.equal(c1a.auditPolicy.baselineObservation.critical, 0);
  assert.equal(c1a.auditPolicy.c6dClosure.beforeAuditSha256, BEFORE_AUDIT_SHA256);
  assert.equal(c1a.auditPolicy.c6dClosure.afterAuditSha256, AFTER_AUDIT_SHA256);
  assert.equal(c1a.auditPolicy.c6dClosure.vulnerableExtractZipRemoved, true);
  assert.equal(c1a.lockfile.predecessorBaseSha256, '441b7b14e6a395cc04bee04f51b17ce400a27c1530ec2483d5168ba15070e689');
  assert.equal(c1a.lockfile.baseSha256, CURRENT_LOCK_SHA256);
  assert.equal(c1a.lockfile.expectedSha256, CURRENT_LOCK_SHA256);
  assert.equal(c1a.dependencyInventory.entryCount, 400);
});
