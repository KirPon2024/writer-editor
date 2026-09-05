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
const WORD_PHYSICAL_DECISION_PATH = path.join(R24_DIR, 'OWNER_GATE_DECISIONS', 'WORD_PHYSICAL_SESSION_AUTHORITY_W0_WORD_PHYSICAL_RECERTIFICATION_V1.json');
const SERIES_IDENTITY_PRIVACY_DECISION_PATH = path.join(R24_DIR, 'OWNER_GATE_DECISIONS', 'SERIES_IDENTITY_PRIVACY_GATE_FOR_MODULE_13_WP606_WSE_SERIES_MULTI_LAYER_V1.json');
const PULSE_METRIC_PRIVACY_DECISION_PATH = path.join(R24_DIR, 'OWNER_GATE_DECISIONS', 'PULSE_METRIC_PRIVACY_ADR_WP800_PULSE_POLICY_CODEC_V1.json');
const PULSE_RETENTION_DECISION_PATH = path.join(R24_DIR, 'OWNER_GATE_DECISIONS', 'PULSE_RETENTION_ADR_WP804_PULSE_PRIVACY_V1.json');
const clone = (value) => structuredClone(value);

function fixture() {
  const decision = readJsonBounded(DECISION_PATH);
  const entitlementDecision = readJsonBounded(ENTITLEMENT_DECISION_PATH);
  const localReleaseDecision = readJsonBounded(LOCAL_RELEASE_DECISION_PATH);
  const brandLicenseDecision = readJsonBounded(BRAND_LICENSE_DECISION_PATH);
  const wordPhysicalDecision = readJsonBounded(WORD_PHYSICAL_DECISION_PATH);
  const seriesIdentityPrivacyDecision = readJsonBounded(SERIES_IDENTITY_PRIVACY_DECISION_PATH);
  const pulseMetricPrivacyDecision = readJsonBounded(PULSE_METRIC_PRIVACY_DECISION_PATH);
  const pulseRetentionDecision = readJsonBounded(PULSE_RETENTION_DECISION_PATH);
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
    wordPhysicalDecision,
    wordPhysicalDecisionDigest: sha256hex(fs.readFileSync(WORD_PHYSICAL_DECISION_PATH)),
    seriesIdentityPrivacyDecision,
    seriesIdentityPrivacyDecisionDigest: sha256hex(fs.readFileSync(SERIES_IDENTITY_PRIVACY_DECISION_PATH)),
    pulseMetricPrivacyDecision,
    pulseMetricPrivacyDecisionDigest: sha256hex(fs.readFileSync(PULSE_METRIC_PRIVACY_DECISION_PATH)),
    pulseRetentionDecision,
    pulseRetentionDecisionDigest: sha256hex(fs.readFileSync(PULSE_RETENTION_DECISION_PATH)),
  };
}

function validate(values, artifacts = {}) {
  const loadedArtifacts = {
    [values.decision.decisionId]: { value: values.decision, digest: values.decisionDigest },
    [values.entitlementDecision.decisionId]: { value: values.entitlementDecision, digest: values.entitlementDecisionDigest },
    [values.localReleaseDecision.decisionId]: { value: values.localReleaseDecision, digest: values.localReleaseDecisionDigest },
    [values.brandLicenseDecision.decisionId]: { value: values.brandLicenseDecision, digest: values.brandLicenseDecisionDigest },
    [values.wordPhysicalDecision.decisionId]: { value: values.wordPhysicalDecision, digest: values.wordPhysicalDecisionDigest },
    [values.seriesIdentityPrivacyDecision.decisionId]: { value: values.seriesIdentityPrivacyDecision, digest: values.seriesIdentityPrivacyDecisionDigest },
    [values.pulseMetricPrivacyDecision.decisionId]: { value: values.pulseMetricPrivacyDecision, digest: values.pulseMetricPrivacyDecisionDigest },
    [values.pulseRetentionDecision.decisionId]: { value: values.pulseRetentionDecision, digest: values.pulseRetentionDecisionDigest },
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

test('exact owner decisions yield every mission-bound owner-gate disposition', () => {
  const values = fixture();
  assert.equal(values.registry.entries.find((entry) => entry.id === 'STORAGE_AUTHORITY_ADR').status, 'UNRESOLVED');
  assert.equal(values.registry.entries.find((entry) => entry.id === 'ENTITLEMENT_SEMANTICS_ADR_OR_DENY').status, 'UNRESOLVED');
  assert.equal(values.registry.entries.find((entry) => entry.id === 'LOCAL_RELEASE_PERMIT').status, 'UNRESOLVED');
  assert.equal(values.registry.entries.find((entry) => entry.id === 'BRAND_LICENSE_OWNER_CHOICE').status, 'UNRESOLVED');
  assert.equal(values.registry.entries.find((entry) => entry.id === 'WORD_PHYSICAL_SESSION_AUTHORITY').status, 'UNRESOLVED');
  assert.equal(values.registry.entries.find((entry) => entry.id === 'SERIES_IDENTITY_PRIVACY_GATE_FOR_MODULE_13').status, 'UNRESOLVED');
  assert.equal(values.registry.entries.find((entry) => entry.id === 'PULSE_METRIC_PRIVACY_ADR').status, 'UNRESOLVED');
  assert.equal(values.registry.entries.find((entry) => entry.id === 'PULSE_RETENTION_ADR').status, 'UNRESOLVED');
  assert.deepEqual(validate(values), {
    STORAGE_AUTHORITY_ADR: 'APPROVED',
    ENTITLEMENT_SEMANTICS_ADR_OR_DENY: 'DENIED',
    LOCAL_RELEASE_PERMIT: 'APPROVED',
    BRAND_LICENSE_OWNER_CHOICE: 'APPROVED',
    WORD_PHYSICAL_SESSION_AUTHORITY: 'APPROVED',
    SERIES_IDENTITY_PRIVACY_GATE_FOR_MODULE_13: 'APPROVED',
    PULSE_METRIC_PRIVACY_ADR: 'APPROVED',
    PULSE_RETENTION_ADR: 'APPROVED',
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

test('W0 physical-session approval cannot reach user data, widen SAFE_APPLY, transfer authority or release', () => {
  const values = fixture();
  for (const key of [
    'userDocuments',
    'existingUserDriveFiles',
    'safeApplyExpansion',
    'parserAuthorityTransfer',
    'providerEvidenceTransfer',
    'dependencyAdoption',
    'signing',
    'notarization',
    'publicDistribution',
    'releaseAuthority',
    'cloudAuthority',
    'userDataMutation',
    'destructiveOrIrreversibleAction',
  ]) {
    const decision = clone(values.wordPhysicalDecision);
    decision.authorizedScope[key] = true;
    assert.throws(
      () => validate(values, {
        [decision.decisionId]: { value: decision, digest: values.wordPhysicalDecisionDigest },
      }),
      (error) => error.code === 'E_R24_OWNER_GATE_DECISION_SCOPE_WIDENING',
    );
  }
  for (const key of ['syntheticCorpusOnly', 'wordPhysicalSession']) {
    const decision = clone(values.wordPhysicalDecision);
    decision.authorizedScope[key] = false;
    assert.throws(
      () => validate(values, {
        [decision.decisionId]: { value: decision, digest: values.wordPhysicalDecisionDigest },
      }),
      (error) => error.code === 'E_R24_OWNER_GATE_DECISION_SCOPE_WIDENING',
    );
  }
  const wrongNode = clone(values.wordPhysicalDecision);
  wrongNode.nodeId = 'V2_WORD_CLAIM_COMPILER';
  assert.throws(
    () => validate(values, {
      [wrongNode.decisionId]: { value: wrongNode, digest: values.wordPhysicalDecisionDigest },
    }),
    (error) => error.code === 'E_R24_OWNER_GATE_DECISION_NODE',
  );
});

test('WP606 series privacy approval remains metadata-only and read-only', () => {
  const values = fixture();
  for (const key of [
    'privateOwnerData',
    'sourceContent',
    'pathAuthority',
    'productMutationAuthority',
    'commandAuthority',
    'networkOrCloudAuthority',
    'credentialsOrSecrets',
    'dependencyAdoption',
    'optionalModuleExpansion',
  ]) {
    const decision = clone(values.seriesIdentityPrivacyDecision);
    decision.authorizedScope[key] = true;
    assert.throws(
      () => validate(values, {
        [decision.decisionId]: { value: decision, digest: values.seriesIdentityPrivacyDecisionDigest },
      }),
      (error) => error.code === 'E_R24_OWNER_GATE_DECISION_SCOPE_WIDENING',
    );
  }
  for (const key of [
    'seriesCanonReadOnlyProjection',
    'multiLayerAtlasReadOnlyProjection',
    'evidenceCapsuleMetadataOnly',
    'agentContextPacketMetadataOnly',
    'syntheticFixturesOnly',
  ]) {
    const decision = clone(values.seriesIdentityPrivacyDecision);
    decision.authorizedScope[key] = false;
    assert.throws(
      () => validate(values, {
        [decision.decisionId]: { value: decision, digest: values.seriesIdentityPrivacyDecisionDigest },
      }),
      (error) => error.code === 'E_R24_OWNER_GATE_DECISION_SCOPE_WIDENING',
    );
  }
  const wrongNode = clone(values.seriesIdentityPrivacyDecision);
  wrongNode.nodeId = 'WP-605_WSE_REVISION_TIME_OBJECT';
  assert.throws(
    () => validate(values, {
      [wrongNode.decisionId]: { value: wrongNode, digest: values.seriesIdentityPrivacyDecisionDigest },
    }),
    (error) => error.code === 'E_R24_OWNER_GATE_DECISION_NODE',
  );
});

test('WP800 Pulse privacy approval remains local aggregate-only', () => {
  const values = fixture();
  for (const key of [
    'contentData',
    'identityData',
    'pathData',
    'networkData',
    'exportData',
    'telemetryData',
    'privateOwnerData',
    'credentialsOrSecrets',
    'dependencyAdoption',
    'runtimeNetwork',
  ]) {
    const decision = clone(values.pulseMetricPrivacyDecision);
    decision.authorizedScope[key] = true;
    assert.throws(
      () => validate(values, {
        [decision.decisionId]: { value: decision, digest: values.pulseMetricPrivacyDecisionDigest },
      }),
      (error) => error.code === 'E_R24_OWNER_GATE_DECISION_SCOPE_WIDENING',
    );
  }
  for (const key of ['localAggregateMetricsOnly', 'productCoreReceiptCodec', 'localOnly', 'syntheticFixturesOnly']) {
    const decision = clone(values.pulseMetricPrivacyDecision);
    decision.authorizedScope[key] = false;
    assert.throws(
      () => validate(values, {
        [decision.decisionId]: { value: decision, digest: values.pulseMetricPrivacyDecisionDigest },
      }),
      (error) => error.code === 'E_R24_OWNER_GATE_DECISION_SCOPE_WIDENING',
    );
  }
  const wrongNode = clone(values.pulseMetricPrivacyDecision);
  wrongNode.nodeId = 'WP-801_PULSE_LEDGER';
  assert.throws(
    () => validate(values, {
      [wrongNode.decisionId]: { value: wrongNode, digest: values.pulseMetricPrivacyDecisionDigest },
    }),
    (error) => error.code === 'E_R24_OWNER_GATE_DECISION_NODE',
  );
});

test('WP804 Pulse retention approval stays explicit, local and bounded', () => {
  const values = fixture();
  for (const key of [
    'contentData',
    'identityData',
    'pathAuthorityFromRequest',
    'networkData',
    'telemetryData',
    'privateOwnerData',
    'credentialsOrSecrets',
    'dependencyAdoption',
    'runtimeNetwork',
    'automaticCleanup',
  ]) {
    const decision = clone(values.pulseRetentionDecision);
    decision.authorizedScope[key] = true;
    assert.throws(
      () => validate(values, {
        [decision.decisionId]: { value: decision, digest: values.pulseRetentionDecisionDigest },
      }),
      (error) => error.code === 'E_R24_OWNER_GATE_DECISION_SCOPE_WIDENING',
    );
  }
  for (const key of [
    'localAggregateMetricsOnly',
    'productCorePrivacyControl',
    'explicitOptInRequired',
    'optOutImmediatelyStopsCollection',
    'retentionUntilExplicitUserDeletion',
    'appendOnlyCorrectionEntries',
    'exportOnlyOnExplicitUserRequest',
    'deletionOnlyOnExplicitUserRequest',
    'disposableFixturesOnly',
  ]) {
    const decision = clone(values.pulseRetentionDecision);
    decision.authorizedScope[key] = false;
    assert.throws(
      () => validate(values, {
        [decision.decisionId]: { value: decision, digest: values.pulseRetentionDecisionDigest },
      }),
      (error) => error.code === 'E_R24_OWNER_GATE_DECISION_SCOPE_WIDENING',
    );
  }
  for (const maximumRetainedEntries of [0, 4095, 4097]) {
    const decision = clone(values.pulseRetentionDecision);
    decision.authorizedScope.maximumRetainedEntries = maximumRetainedEntries;
    assert.throws(
      () => validate(values, {
        [decision.decisionId]: { value: decision, digest: values.pulseRetentionDecisionDigest },
      }),
      (error) => error.code === 'E_R24_OWNER_GATE_DECISION_SCOPE_WIDENING',
    );
  }
  const wrongNode = clone(values.pulseRetentionDecision);
  wrongNode.nodeId = 'WP-805_LOCAL_HISTORY';
  assert.throws(
    () => validate(values, {
      [wrongNode.decisionId]: { value: wrongNode, digest: values.pulseRetentionDecisionDigest },
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
