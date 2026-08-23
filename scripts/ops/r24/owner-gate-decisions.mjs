import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HEX64_RE, R24Error, readJsonBounded, sha256hex } from './canonical-json.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, '..', '..', '..');
const R24_DIR = path.join(REPO_ROOT, 'docs', 'OPS', 'R24');

export const OWNER_GATE_REGISTRY_DIGEST = '4d8e3e0f7fcafb84f6e4b625af930b7a5fb06d64bbb5e59af6fe2940284315c8';
export const OWNER_GATE_AMENDMENTS_PATH = path.join(R24_DIR, 'OWNER_GATE_AMENDMENTS_R2_4.json');
export const OWNER_GATE_REGISTRY_PATH = path.join(R24_DIR, 'OWNER_GATE_REGISTRY_R2_4.json');

const EXPECTED_DECISION_SCOPE = Object.freeze({
  storageBakeoffComparison: true,
  certifyAlreadyMergedImplementation: true,
  dependencyAdoption: false,
  liveStoragePathChange: false,
  userDataMigration: false,
  destructiveStorageAction: false,
});

const EXPECTED_FORBIDDEN_AUTHORITY = Object.freeze([
  'DEPENDENCY_ADOPTION',
  'LIVE_STORAGE_PATH_CHANGE',
  'USER_DATA_MIGRATION',
  'DESTRUCTIVE_STORAGE_ACTION',
  'CREDENTIAL_OR_SECRET_BYPASS',
  'SAFE_APPLY_EXPANSION',
  'FORCE_PUSH',
  'PROTECTION_BYPASS',
  'SECOND_WRITER_OR_CONTOUR',
]);

function assertObject(value, code, detail) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new R24Error(code, detail);
  return value;
}

function assertExactKeys(value, expected, code, detail) {
  assertObject(value, code, detail);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new R24Error(code, `${detail}:${JSON.stringify(actual)} != ${JSON.stringify(wanted)}`);
  }
}

function assertExactArray(value, expected, code, detail) {
  if (!Array.isArray(value)
    || value.length !== expected.length
    || value.some((item, index) => item !== expected[index])) {
    throw new R24Error(code, detail);
  }
}

function assertDecisionArtifact({ artifact, amendment, missionDigest }) {
  assertExactKeys(artifact, [
    'schemaVersion',
    'decisionId',
    'missionDigest',
    'gateId',
    'nodeId',
    'decision',
    'approvedBy',
    'priorOwnerStandingGrantTaskId',
    'issuedAtUtc',
    'expiresAtUtc',
    'revocationEpoch',
    'authorizedScope',
    'forbiddenAuthorityExpansion',
    'noSelfApproval',
  ], 'E_R24_OWNER_GATE_DECISION_SHAPE', amendment.gateId);
  if (artifact.schemaVersion !== 'yalken.owner-gate-decision.r24.v1') throw new R24Error('E_R24_OWNER_GATE_DECISION_SCHEMA', amendment.gateId);
  if (artifact.decisionId !== 'STORAGE_AUTHORITY_ADR_R2_STORAGE_BAKEOFF_V1') throw new R24Error('E_R24_OWNER_GATE_DECISION_ID', String(artifact.decisionId));
  if (artifact.missionDigest !== missionDigest) throw new R24Error('E_R24_OWNER_GATE_DECISION_MISSION', String(artifact.missionDigest));
  if (artifact.gateId !== amendment.gateId) throw new R24Error('E_R24_OWNER_GATE_DECISION_GATE', String(artifact.gateId));
  if (artifact.nodeId !== amendment.nodeId) throw new R24Error('E_R24_OWNER_GATE_DECISION_NODE', String(artifact.nodeId));
  if (artifact.decision !== 'APPROVED') throw new R24Error('E_R24_OWNER_GATE_DECISION_STATUS', String(artifact.decision));
  if (artifact.approvedBy !== 'owner:OWNER_DECISION_STORAGE_AUTHORITY_ADR_APPROVED') throw new R24Error('E_R24_OWNER_GATE_DECISION_AUTHORITY', String(artifact.approvedBy));
  if (artifact.priorOwnerStandingGrantTaskId !== 'YALKEN-R24-R2-STORAGE-BAKEOFF-001') {
    throw new R24Error('E_R24_OWNER_GATE_DECISION_PRIOR_GRANT', String(artifact.priorOwnerStandingGrantTaskId));
  }
  if (typeof artifact.issuedAtUtc !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(artifact.issuedAtUtc)) {
    throw new R24Error('E_R24_OWNER_GATE_DECISION_ISSUED_AT', String(artifact.issuedAtUtc));
  }
  if (artifact.expiresAtUtc !== null) throw new R24Error('E_R24_OWNER_GATE_DECISION_EXPIRY', String(artifact.expiresAtUtc));
  if (artifact.revocationEpoch !== amendment.revocationEpoch) throw new R24Error('E_R24_OWNER_GATE_DECISION_REVOCATION', String(artifact.revocationEpoch));
  if (artifact.noSelfApproval !== true) throw new R24Error('E_R24_OWNER_GATE_DECISION_SELF_APPROVAL');
  assertExactKeys(artifact.authorizedScope, Object.keys(EXPECTED_DECISION_SCOPE), 'E_R24_OWNER_GATE_DECISION_SCOPE_SHAPE', amendment.gateId);
  for (const [key, expected] of Object.entries(EXPECTED_DECISION_SCOPE)) {
    if (artifact.authorizedScope[key] !== expected) throw new R24Error('E_R24_OWNER_GATE_DECISION_SCOPE_WIDENING', key);
  }
  assertExactArray(
    artifact.forbiddenAuthorityExpansion,
    EXPECTED_FORBIDDEN_AUTHORITY,
    'E_R24_OWNER_GATE_DECISION_FORBIDDEN_SCOPE',
    amendment.gateId,
  );
}

export function validateOwnerGateAmendments({
  program,
  missionContract,
  registry,
  registryDigest,
  amendments,
  loadDecisionArtifact,
}) {
  if (!program || !Array.isArray(program.nodes)) throw new R24Error('E_R24_OWNER_GATE_PROGRAM_REQUIRED');
  assertObject(missionContract, 'E_R24_OWNER_GATE_MISSION_REQUIRED', 'missionContract');
  assertExactKeys(amendments, ['schemaVersion', 'missionDigest', 'baseRegistrySha256', 'amendments'], 'E_R24_OWNER_GATE_AMENDMENTS_SHAPE', 'root');
  if (amendments.schemaVersion !== 'yalken.owner-gate-amendments.r24.v1') throw new R24Error('E_R24_OWNER_GATE_AMENDMENTS_SCHEMA');
  if (!HEX64_RE.test(String(missionContract.missionDigest)) || amendments.missionDigest !== missionContract.missionDigest) {
    throw new R24Error('E_R24_OWNER_GATE_AMENDMENTS_MISSION', String(amendments.missionDigest));
  }
  if (registryDigest !== OWNER_GATE_REGISTRY_DIGEST || amendments.baseRegistrySha256 !== registryDigest) {
    throw new R24Error('E_R24_OWNER_GATE_BASE_REGISTRY_DRIFT', String(registryDigest));
  }
  assertObject(registry, 'E_R24_OWNER_GATE_REGISTRY_SHAPE', 'registry');
  if (registry.registryClosed !== true || registry.safeDefault !== 'DENY' || registry.unknownGateDisposition !== 'UNRESOLVED_UNKNOWN_GATE_DENY') {
    throw new R24Error('E_R24_OWNER_GATE_REGISTRY_NOT_CLOSED');
  }
  if (!Array.isArray(registry.entries) || !Array.isArray(amendments.amendments)) throw new R24Error('E_R24_OWNER_GATE_ENTRIES_REQUIRED');
  const registryIds = registry.entries.map((entry) => entry.id);
  if (new Set(registryIds).size !== registryIds.length) throw new R24Error('E_R24_OWNER_GATE_REGISTRY_DUPLICATE');
  const ownerGateRefs = new Set(program.nodes.map((node) => node.ownerGate).filter(Boolean));
  for (const gateId of ownerGateRefs) {
    if (!registryIds.includes(gateId)) throw new R24Error('E_R24_OWNER_GATE_UNKNOWN_PROGRAM_GATE', gateId);
  }
  const approvals = {};
  const amendedGates = new Set();
  for (const amendment of amendments.amendments) {
    assertExactKeys(amendment, [
      'gateId',
      'nodeId',
      'transitionFrom',
      'transitionTo',
      'decisionArtifactPath',
      'decisionArtifactSha256',
      'revocationEpoch',
    ], 'E_R24_OWNER_GATE_AMENDMENT_SHAPE', String(amendment?.gateId));
    if (amendedGates.has(amendment.gateId)) throw new R24Error('E_R24_OWNER_GATE_AMENDMENT_DUPLICATE', amendment.gateId);
    amendedGates.add(amendment.gateId);
    const gate = registry.entries.find((entry) => entry.id === amendment.gateId);
    if (!gate) throw new R24Error('E_R24_OWNER_GATE_AMENDMENT_UNKNOWN_GATE', amendment.gateId);
    const node = program.nodes.find((candidate) => candidate.id === amendment.nodeId);
    if (!node || node.ownerGate !== amendment.gateId) throw new R24Error('E_R24_OWNER_GATE_AMENDMENT_NODE_BINDING', amendment.nodeId);
    if (gate.status !== amendment.transitionFrom || amendment.transitionFrom !== 'UNRESOLVED') {
      throw new R24Error('E_R24_OWNER_GATE_AMENDMENT_FROM_STATE', `${gate.status}:${amendment.transitionFrom}`);
    }
    if (amendment.transitionTo !== 'APPROVED' || !gate.allowedTransitions?.includes('APPROVED')) {
      throw new R24Error('E_R24_OWNER_GATE_AMENDMENT_TRANSITION', String(amendment.transitionTo));
    }
    if (gate.safeDefault !== 'DENY'
      || gate.decisionAuthority !== 'OWNER_OR_EXPLICIT_DIGEST_BOUND_DELEGATE'
      || gate.scope !== 'EXACT_MISSION_DIGEST_AND_REFERENCING_NODE_ONLY'
      || gate.decisionArtifactDigest !== null
      || gate.revocationEpoch !== amendment.revocationEpoch) {
      throw new R24Error('E_R24_OWNER_GATE_AMENDMENT_BASE_CONTRACT', amendment.gateId);
    }
    if (!HEX64_RE.test(String(amendment.decisionArtifactSha256))) throw new R24Error('E_R24_OWNER_GATE_DECISION_DIGEST_SHAPE');
    if (typeof amendment.decisionArtifactPath !== 'string'
      || !amendment.decisionArtifactPath.startsWith('docs/OPS/R24/OWNER_GATE_DECISIONS/')
      || amendment.decisionArtifactPath.includes('..')
      || path.isAbsolute(amendment.decisionArtifactPath)) {
      throw new R24Error('E_R24_OWNER_GATE_DECISION_PATH', String(amendment.decisionArtifactPath));
    }
    const loaded = loadDecisionArtifact(amendment.decisionArtifactPath);
    if (!loaded || loaded.digest !== amendment.decisionArtifactSha256) {
      throw new R24Error('E_R24_OWNER_GATE_DECISION_DIGEST_MISMATCH', amendment.gateId);
    }
    assertDecisionArtifact({ artifact: loaded.value, amendment, missionDigest: missionContract.missionDigest });
    approvals[amendment.gateId] = 'APPROVED';
  }
  return Object.freeze(approvals);
}

export function loadValidatedOwnerGateApprovals({ program, missionContract }) {
  const registryDigest = sha256hex(fs.readFileSync(OWNER_GATE_REGISTRY_PATH));
  const registry = readJsonBounded(OWNER_GATE_REGISTRY_PATH);
  const amendments = readJsonBounded(OWNER_GATE_AMENDMENTS_PATH);
  return validateOwnerGateAmendments({
    program,
    missionContract,
    registry,
    registryDigest,
    amendments,
    loadDecisionArtifact(relativePath) {
      const absolutePath = path.resolve(REPO_ROOT, relativePath);
      const decisionRoot = path.join(R24_DIR, 'OWNER_GATE_DECISIONS') + path.sep;
      if (!absolutePath.startsWith(decisionRoot)) throw new R24Error('E_R24_OWNER_GATE_DECISION_PATH_ESCAPE', relativePath);
      return {
        value: readJsonBounded(absolutePath, { maxBytes: 128 * 1024 }),
        digest: sha256hex(fs.readFileSync(absolutePath)),
      };
    },
  });
}
