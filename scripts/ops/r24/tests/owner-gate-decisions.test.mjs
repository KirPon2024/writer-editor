import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readJsonBounded, sha256hex } from '../canonical-json.mjs';
import {
  OWNER_GATE_AMENDMENTS_PATH,
  OWNER_GATE_REGISTRY_PATH,
  validateOwnerGateAmendments,
} from '../owner-gate-decisions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const R24_DIR = path.join(ROOT, 'docs', 'OPS', 'R24');
const PROGRAM_PATH = path.join(R24_DIR, 'EXECUTABLE_PROGRAM_R2_4.json');
const MISSION_PATH = path.join(R24_DIR, 'MISSION_CONTRACT_R2_4.json');
const DECISION_PATH = path.join(R24_DIR, 'OWNER_GATE_DECISIONS', 'STORAGE_AUTHORITY_ADR_R2_STORAGE_BAKEOFF_V1.json');
const ENTITLEMENT_DECISION_PATH = path.join(R24_DIR, 'OWNER_GATE_DECISIONS', 'ENTITLEMENT_SEMANTICS_ADR_OR_DENY_WP206_SAFE_ENTITLEMENT_BASELINE_V1.json');
const LOCAL_RELEASE_DECISION_PATH = path.join(R24_DIR, 'OWNER_GATE_DECISIONS', 'LOCAL_RELEASE_PERMIT_WP307_WRITER_LOCAL_PROFILE_V1.json');
const BRAND_LICENSE_DECISION_PATH = path.join(R24_DIR, 'OWNER_GATE_DECISIONS', 'BRAND_LICENSE_OWNER_CHOICE_WP308_BRAND_BASELINE_V1.json');
const clone = (value) => structuredClone(value);

function fixture() {
  const decision = readJsonBounded(DECISION_PATH);
  const entitlementDecision = readJsonBounded(ENTITLEMENT_DECISION_PATH);
  const localReleaseDecision = readJsonBounded(LOCAL_RELEASE_DECISION_PATH);
  const brandLicenseDecision = readJsonBounded(BRAND_LICENSE_DECISION_PATH);
  return {
    program: readJsonBounded(PROGRAM_PATH),
    missionContract: readJsonBounded(MISSION_PATH),
    registry: readJsonBounded(OWNER_GATE_REGISTRY_PATH),
    registryDigest: sha256hex(fs.readFileSync(OWNER_GATE_REGISTRY_PATH)),
    amendments: readJsonBounded(OWNER_GATE_AMENDMENTS_PATH),
    decision,
    decisionDigest: sha256hex(fs.readFileSync(DECISION_PATH)),
    entitlementDecision,
    entitlementDecisionDigest: sha256hex(fs.readFileSync(ENTITLEMENT_DECISION_PATH)),
    localReleaseDecision,
    localReleaseDecisionDigest: sha256hex(fs.readFileSync(LOCAL_RELEASE_DECISION_PATH)),
    brandLicenseDecision,
    brandLicenseDecisionDigest: sha256hex(fs.readFileSync(BRAND_LICENSE_DECISION_PATH)),
  };
}

function validate(values, artifacts = {}) {
  const loadedArtifacts = {
    [values.decision.decisionId]: { value: values.decision, digest: values.decisionDigest },
    [values.entitlementDecision.decisionId]: { value: values.entitlementDecision, digest: values.entitlementDecisionDigest },
    [values.localReleaseDecision.decisionId]: { value: values.localReleaseDecision, digest: values.localReleaseDecisionDigest },
    [values.brandLicenseDecision.decisionId]: { value: values.brandLicenseDecision, digest: values.brandLicenseDecisionDigest },
    ...artifacts,
  };
  return validateOwnerGateAmendments({
    program: values.program,
    missionContract: values.missionContract,
    registry: values.registry,
    registryDigest: values.registryDigest,
    amendments: values.amendments,
    loadDecisionArtifact: (relativePath) => {
      const decisionId = path.basename(relativePath, '.json');
      return loadedArtifacts[decisionId];
    },
  });
}

test('exact owner decisions yield mission-bound storage, entitlement, local-profile and brand dispositions', () => {
  const values = fixture();
  assert.equal(values.registry.entries.find((entry) => entry.id === 'STORAGE_AUTHORITY_ADR').status, 'UNRESOLVED');
  assert.equal(values.registry.entries.find((entry) => entry.id === 'ENTITLEMENT_SEMANTICS_ADR_OR_DENY').status, 'UNRESOLVED');
  assert.equal(values.registry.entries.find((entry) => entry.id === 'LOCAL_RELEASE_PERMIT').status, 'UNRESOLVED');
  assert.equal(values.registry.entries.find((entry) => entry.id === 'BRAND_LICENSE_OWNER_CHOICE').status, 'UNRESOLVED');
  assert.deepEqual(validate(values), {
    STORAGE_AUTHORITY_ADR: 'APPROVED',
    ENTITLEMENT_SEMANTICS_ADR_OR_DENY: 'DENIED',
    LOCAL_RELEASE_PERMIT: 'APPROVED',
    BRAND_LICENSE_OWNER_CHOICE: 'APPROVED',
  });
});

test('wrong mission digest is rejected even if a mutant is resealed', () => {
  const values = fixture();
  const decision = clone(values.decision);
  decision.missionDigest = '0'.repeat(64);
  assert.throws(
    () => validate(values, {
      [decision.decisionId]: { value: decision, digest: values.decisionDigest },
      [values.entitlementDecision.decisionId]: { value: values.entitlementDecision, digest: values.entitlementDecisionDigest },
      [values.localReleaseDecision.decisionId]: { value: values.localReleaseDecision, digest: values.localReleaseDecisionDigest },
    }),
    (error) => error.code === 'E_R24_OWNER_GATE_DECISION_MISSION',
  );
});

test('wrong node or gate cannot inherit the R2 decision', () => {
  const values = fixture();
  const wrongNode = clone(values.decision);
  wrongNode.nodeId = 'WP-203_STORAGE_SELECTION';
  assert.throws(
    () => validate(values, {
      [wrongNode.decisionId]: { value: wrongNode, digest: values.decisionDigest },
      [values.entitlementDecision.decisionId]: { value: values.entitlementDecision, digest: values.entitlementDecisionDigest },
      [values.localReleaseDecision.decisionId]: { value: values.localReleaseDecision, digest: values.localReleaseDecisionDigest },
    }),
    (error) => error.code === 'E_R24_OWNER_GATE_DECISION_NODE',
  );
  const amendments = clone(values.amendments);
  amendments.amendments[0].gateId = 'LOCAL_RELEASE_PERMIT';
  assert.throws(
    () => validate({ ...values, amendments }),
    (error) => error.code === 'E_R24_OWNER_GATE_AMENDMENT_NODE_BINDING',
  );
});

test('artifact byte drift fails before semantic approval', () => {
  const values = fixture();
  assert.throws(
    () => validate(values, {
      [values.decision.decisionId]: { value: values.decision, digest: 'f'.repeat(64) },
      [values.entitlementDecision.decisionId]: { value: values.entitlementDecision, digest: values.entitlementDecisionDigest },
      [values.localReleaseDecision.decisionId]: { value: values.localReleaseDecision, digest: values.localReleaseDecisionDigest },
    }),
    (error) => error.code === 'E_R24_OWNER_GATE_DECISION_DIGEST_MISMATCH',
  );
});

test('dependency adoption and live storage scope widening are rejected', () => {
  const values = fixture();
  for (const key of ['dependencyAdoption', 'liveStoragePathChange', 'userDataMigration', 'destructiveStorageAction']) {
    const decision = clone(values.decision);
    decision.authorizedScope[key] = true;
    assert.throws(
      () => validate(values, {
        [decision.decisionId]: { value: decision, digest: values.decisionDigest },
        [values.entitlementDecision.decisionId]: { value: values.entitlementDecision, digest: values.entitlementDecisionDigest },
        [values.localReleaseDecision.decisionId]: { value: values.localReleaseDecision, digest: values.localReleaseDecisionDigest },
      }),
      (error) => error.code === 'E_R24_OWNER_GATE_DECISION_SCOPE_WIDENING',
    );
  }
});

test('entitlement denial cannot widen pricing, release, cloud, user data or dependency authority', () => {
  const values = fixture();
  for (const key of ['pricingAuthority', 'businessAuthority', 'releaseAuthority', 'cloudAuthority', 'userDataAuthority', 'dependencyAdoption']) {
    const decision = clone(values.entitlementDecision);
    decision.authorizedScope[key] = true;
    assert.throws(
      () => validate(values, {
        [values.decision.decisionId]: { value: values.decision, digest: values.decisionDigest },
        [decision.decisionId]: { value: decision, digest: values.entitlementDecisionDigest },
        [values.localReleaseDecision.decisionId]: { value: values.localReleaseDecision, digest: values.localReleaseDecisionDigest },
      }),
      (error) => error.code === 'E_R24_OWNER_GATE_DECISION_SCOPE_WIDENING',
    );
  }
});

test('WP307 local release approval cannot widen signing, distribution, dependency, cloud or user-data authority', () => {
  const values = fixture();
  for (const key of ['signing', 'notarization', 'publicDistribution', 'dependencyAdoption', 'cloudAuthority', 'userDataMutation']) {
    const decision = clone(values.localReleaseDecision);
    decision.authorizedScope[key] = true;
    assert.throws(
      () => validate(values, {
        [values.decision.decisionId]: { value: values.decision, digest: values.decisionDigest },
        [values.entitlementDecision.decisionId]: { value: values.entitlementDecision, digest: values.entitlementDecisionDigest },
        [decision.decisionId]: { value: decision, digest: values.localReleaseDecisionDigest },
      }),
      (error) => error.code === 'E_R24_OWNER_GATE_DECISION_SCOPE_WIDENING',
    );
  }
  const wrongNode = clone(values.localReleaseDecision);
  wrongNode.nodeId = 'WP-308_BRAND_BASELINE';
  assert.throws(
    () => validate(values, {
      [values.decision.decisionId]: { value: values.decision, digest: values.decisionDigest },
      [values.entitlementDecision.decisionId]: { value: values.entitlementDecision, digest: values.entitlementDecisionDigest },
      [wrongNode.decisionId]: { value: wrongNode, digest: values.localReleaseDecisionDigest },
    }),
    (error) => error.code === 'E_R24_OWNER_GATE_DECISION_NODE',
  );
});

test('WP308 brand approval cannot widen screenshot, assets, dependencies, release, cloud or user-data authority', () => {
  const values = fixture();
  for (const key of ['screenshotCanon', 'thirdPartyAssetAcquisition', 'dependencyAdoption', 'signing', 'release', 'cloudAuthority', 'userDataMutation']) {
    const decision = clone(values.brandLicenseDecision);
    decision.authorizedScope[key] = true;
    assert.throws(
      () => validate(values, {
        [decision.decisionId]: { value: decision, digest: values.brandLicenseDecisionDigest },
      }),
      (error) => error.code === 'E_R24_OWNER_GATE_DECISION_SCOPE_WIDENING',
    );
  }
  const widenedIdentity = clone(values.brandLicenseDecision);
  widenedIdentity.authorizedScope.originalFirstPartyTokenizedAccessibleIdentityOnly = false;
  assert.throws(
    () => validate(values, {
      [widenedIdentity.decisionId]: { value: widenedIdentity, digest: values.brandLicenseDecisionDigest },
    }),
    (error) => error.code === 'E_R24_OWNER_GATE_DECISION_SCOPE_WIDENING',
  );
  const wrongNode = clone(values.brandLicenseDecision);
  wrongNode.nodeId = 'WP-309_TOKEN_ARCHITECTURE';
  assert.throws(
    () => validate(values, {
      [wrongNode.decisionId]: { value: wrongNode, digest: values.brandLicenseDecisionDigest },
    }),
    (error) => error.code === 'E_R24_OWNER_GATE_DECISION_NODE',
  );
});

test('base registry and revocation drift fail closed', () => {
  const values = fixture();
  assert.throws(
    () => validate({ ...values, registryDigest: 'a'.repeat(64) }),
    (error) => error.code === 'E_R24_OWNER_GATE_BASE_REGISTRY_DRIFT',
  );
  const decision = clone(values.decision);
  decision.revocationEpoch = 1;
  assert.throws(
    () => validate(values, {
      [decision.decisionId]: { value: decision, digest: values.decisionDigest },
      [values.entitlementDecision.decisionId]: { value: values.entitlementDecision, digest: values.entitlementDecisionDigest },
      [values.localReleaseDecision.decisionId]: { value: values.localReleaseDecision, digest: values.localReleaseDecisionDigest },
    }),
    (error) => error.code === 'E_R24_OWNER_GATE_DECISION_REVOCATION',
  );
});
