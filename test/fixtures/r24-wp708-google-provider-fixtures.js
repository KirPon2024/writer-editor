'use strict';

const fs = require('node:fs');
const path = require('node:path');

const NATIVE = 'GOOGLE_NATIVE_CONVERSION_BOUNDED_V1';
const OFFICE = 'GOOGLE_OFFICE_MODE_ABSTAIN_V1';
const BRIDGE = 'GOOGLE_DRIVE_DOCS_BRIDGE_BOUNDED_V1';
const DECISION = '563fb536463a637c0bf5191883b9c410f24314dd832d2744a68084590b856c49';
const REGISTRY = '4d8e3e0f7fcafb84f6e4b625af930b7a5fb06d64bbb5e59af6fe2940284315c8';
const RECEIPT = '9f853c11be3d8d77e50ddbe034efc1701769fd3f671db447e491a774bada419f';
const ACCOUNT = '8fe4a76185146a7f917b6bc0f692ecb92e8d800dc929a9600ce6d66c2b31957d';
const DOCUMENT = '9fa7d8dd25194fed1208f8d750caa9ef76be7e2869590677f58d5cd99cf8fd2b';
const TEXT = 'a6ce64e65c29ead25c1f62394a4842ebfa00af134ae559a34c46234a5d0f76a5';

const clone = value => JSON.parse(JSON.stringify(value));
const identity = (overrides = {}) => ({ entityId: 'wp708-synthetic-doc', generation: 5, projectId: 'wp708-synthetic-project', sourceRevision: 'source-revision-708', ...overrides });
const historicalRegistry = () => JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../docs/OPS/RTK/GOOGLE_BUILD_PROFILE_REGISTRY_V1.json'), 'utf8'));
const ownerDecision = (overrides = {}) => ({ decisionDigest: DECISION, expiresAtUtc: '2026-09-06T23:59:59Z', gateId: 'GOOGLE_EGRESS_APPLY_ADR', lifecycleReceiptSha256: RECEIPT, registryDigest: REGISTRY, scope: 'WP-708_GOOGLE_PROVIDER', status: 'APPROVED', ...overrides });
const observations = (overrides = {}) => ({ accountBound: true, commentsRoundtrip: true, docxExportZip: true, nativeDocumentReadback: true, revisionGuardedApply: true, staleRevisionRejected: true, textExportExact: true, ...overrides });

function evidenceBody(profileId, overrides = {}) {
  return {
    claimId: profileId === NATIVE ? 'WP708_NATIVE_GATE05_ATOM' : 'WP708_BRIDGE_GATE05_ATOM',
    cleanupVerified: true,
    exactHead: true,
    observations: observations(),
    profileId,
    provider: 'google-docs',
    receiptSha256: RECEIPT,
    status: 'PASS',
    ...overrides,
  };
}

function evidenceAtom(api, profileId, overrides = {}) {
  const body = evidenceBody(profileId, overrides);
  return { ...body, atomSha256: api.computeGoogleEvidenceAtomDigest(body) };
}

async function projectionInput(overrides = {}) {
  const api = await import('../../src/core/google-provider-profile-v1.mjs');
  return {
    evidenceAtoms: [evidenceAtom(api, NATIVE), evidenceAtom(api, BRIDGE)],
    historicalRegistry: historicalRegistry(),
    identity: identity(),
    nowUtc: '2026-09-05T22:00:00Z',
    ownerDecision: ownerDecision(),
    ...overrides,
  };
}

function applyInput(overrides = {}) {
  const value = {
    capability: {
      allowedAccountIdSha256: ACCOUNT,
      allowedDocumentIdSha256: DOCUMENT,
      allowedProfileIds: [NATIVE, BRIDGE],
      decisionDigest: DECISION,
      effect: 'GOOGLE_DOC_REVISION_GUARDED_APPLY',
      expiresAtUtc: '2026-09-06T23:59:59Z',
      gateId: 'GOOGLE_EGRESS_APPLY_ADR',
      lifecycleStatus: 'ACTIVE_SYNTHETIC_SINGLE_TARGET',
      nonceSha256: '7'.repeat(64),
      scope: 'WP-708_GOOGLE_PROVIDER',
      status: 'APPROVED',
    },
    current: {
      accountIdSha256: ACCOUNT,
      activeArtifactCount: 1,
      documentIdSha256: DOCUMENT,
      entityId: 'wp708-synthetic-doc',
      generation: 5,
      nowUtc: '2026-09-05T22:00:00Z',
      profileId: NATIVE,
      projectId: 'wp708-synthetic-project',
      revision: 'docs-revision-live-1',
      sourceRevision: 'source-revision-708',
      syntheticOnly: true,
    },
    intent: {
      accountIdSha256: ACCOUNT,
      documentIdSha256: DOCUMENT,
      entityId: 'wp708-synthetic-doc',
      generation: 5,
      profileId: NATIVE,
      projectId: 'wp708-synthetic-project',
      proposedTextSha256: TEXT,
      requiredRevision: 'docs-revision-live-1',
      sourceRevision: 'source-revision-708',
    },
  };
  for (const [key, replacement] of Object.entries(overrides)) value[key] = replacement;
  return value;
}

module.exports = { ACCOUNT, BRIDGE, DECISION, DOCUMENT, NATIVE, OFFICE, RECEIPT, REGISTRY, TEXT, applyInput, clone, evidenceAtom, evidenceBody, historicalRegistry, identity, observations, ownerDecision, projectionInput };
