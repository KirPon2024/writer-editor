import { hashCanonicalValue } from '../deriveView.mjs';
import {
  ATLAS_DEEP_ENGINE_ADAPTER_STUB_SCHEMA_VERSION,
  ATLAS_DEEP_ENGINE_CANDIDATE_SCHEMA_VERSION,
  ATLAS_DEEP_ENGINE_CANDIDATE_STATUS,
  ATLAS_DEEP_ENGINE_DECISION_SCHEMA_VERSION,
  ATLAS_DEEP_ENGINE_DECISION_STATUS,
  ATLAS_DEEP_ENGINE_HASH_PACKET_SCHEMA_VERSION,
  ATLAS_DEEP_ENGINE_RESOURCE_MANIFEST_SCHEMA_VERSION,
  sortAtlasDeepEngineCandidates,
} from './atlasDeepEngineDecisionTypes.mjs';

const DEFAULT_CANDIDATES = Object.freeze([
  {
    candidateId: 'basic-exact-term-v1',
    candidateKind: 'current-basic-analyzer',
    status: ATLAS_DEEP_ENGINE_CANDIDATE_STATUS.REJECTED,
    reason: 'BASIC_EXACT_TERM_V1 has exact mention evidence only and cannot claim NER morphology coreference dialogue or event extraction.',
    offlineOnly: true,
    networkRequired: false,
    runtimeDownload: false,
    dynamicExecutablePlugin: false,
    licenseAccepted: true,
    corpusMetricsAvailable: false,
    certifiedLanguages: [],
  },
  {
    candidateId: 'remote-language-service',
    candidateKind: 'remote-service',
    status: ATLAS_DEEP_ENGINE_CANDIDATE_STATUS.REJECTED,
    reason: 'Network language resources and account-backed inference are outside offline-first MVP authority.',
    offlineOnly: false,
    networkRequired: true,
    runtimeDownload: false,
    dynamicExecutablePlugin: false,
    licenseAccepted: false,
    corpusMetricsAvailable: false,
    certifiedLanguages: [],
  },
  {
    candidateId: 'dynamic-plugin-runtime',
    candidateKind: 'dynamic-executable-plugin',
    status: ATLAS_DEEP_ENGINE_CANDIDATE_STATUS.REJECTED,
    reason: 'Dynamic executable analyzer plugins are forbidden by Stage 07 and repository security policy.',
    offlineOnly: false,
    networkRequired: false,
    runtimeDownload: true,
    dynamicExecutablePlugin: true,
    licenseAccepted: false,
    corpusMetricsAvailable: false,
    certifiedLanguages: [],
  },
  {
    candidateId: 'local-null-deep-adapter-v1',
    candidateKind: 'local-null-adapter',
    status: ATLAS_DEEP_ENGINE_CANDIDATE_STATUS.STUB_ONLY,
    reason: 'Reversible local adapter stub exists only to make Deep unavailability explicit and testable.',
    offlineOnly: true,
    networkRequired: false,
    runtimeDownload: false,
    dynamicExecutablePlugin: false,
    licenseAccepted: true,
    corpusMetricsAvailable: false,
    certifiedLanguages: [],
  },
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeBoolean(value) {
  return value === true;
}

function normalizeCandidate(rawCandidate, index) {
  const candidateId = normalizeString(rawCandidate?.candidateId) || `candidate-${index + 1}`;
  const status = Object.values(ATLAS_DEEP_ENGINE_CANDIDATE_STATUS).includes(rawCandidate?.status)
    ? rawCandidate.status
    : ATLAS_DEEP_ENGINE_CANDIDATE_STATUS.REJECTED;
  return {
    schemaVersion: ATLAS_DEEP_ENGINE_CANDIDATE_SCHEMA_VERSION,
    candidateId,
    candidateKind: normalizeString(rawCandidate?.candidateKind) || 'unknown',
    status,
    reason: normalizeString(rawCandidate?.reason),
    offlineOnly: normalizeBoolean(rawCandidate?.offlineOnly),
    networkRequired: normalizeBoolean(rawCandidate?.networkRequired),
    runtimeDownload: normalizeBoolean(rawCandidate?.runtimeDownload),
    dynamicExecutablePlugin: normalizeBoolean(rawCandidate?.dynamicExecutablePlugin),
    licenseAccepted: normalizeBoolean(rawCandidate?.licenseAccepted),
    corpusMetricsAvailable: normalizeBoolean(rawCandidate?.corpusMetricsAvailable),
    certifiedLanguages: [...new Set((Array.isArray(rawCandidate?.certifiedLanguages) ? rawCandidate.certifiedLanguages : [])
      .map(normalizeString)
      .filter(Boolean))].sort((left, right) => left.localeCompare(right, 'en', { sensitivity: 'variant' })),
  };
}

function buildResourceManifest() {
  const resourceCore = {
    resourceId: 'atlas-deep-local-null-resource-v1',
    resourceKind: 'null-offline-fixture',
    byteLength: 0,
    executable: false,
    modelWeights: false,
    license: 'repo-local-fixture',
    offlineOnly: true,
    networkRequired: false,
    runtimeDownload: false,
    dynamicExecutablePlugin: false,
  };
  const resourceHash = hashCanonicalValue(resourceCore);
  return {
    schemaVersion: ATLAS_DEEP_ENGINE_RESOURCE_MANIFEST_SCHEMA_VERSION,
    ...resourceCore,
    resourceHash,
  };
}

function buildHashPacket(resourceManifest) {
  const packetCore = {
    resourceId: resourceManifest.resourceId,
    resourceHash: resourceManifest.resourceHash,
    signer: 'atlas-local-fixture-signer',
    signatureKind: 'deterministic-hash-packet-not-release-signature',
  };
  return {
    schemaVersion: ATLAS_DEEP_ENGINE_HASH_PACKET_SCHEMA_VERSION,
    ...packetCore,
    signature: hashCanonicalValue(packetCore),
    signatureVerified: false,
    releaseTrust: false,
  };
}

function buildAdapterStub(resourceManifest) {
  return {
    schemaVersion: ATLAS_DEEP_ENGINE_ADAPTER_STUB_SCHEMA_VERSION,
    adapterId: 'atlas.deep.localNullAdapter.v1',
    adapterKind: 'local-null-adapter',
    resourceId: resourceManifest.resourceId,
    status: ATLAS_DEEP_ENGINE_DECISION_STATUS.UNAVAILABLE_LOCAL_STUB_ONLY,
    canAnalyze: false,
    certified: false,
    experimental: false,
    offlineOnly: true,
    networkRequired: false,
    runtimeDownload: false,
    dynamicExecutablePlugin: false,
    projectTruthMutation: false,
    manuscriptMutation: false,
    supportedSignals: [],
    unavailableSignals: [
      'ner',
      'morphology',
      'constrainedCoreference',
      'dialogue',
      'eventExtraction',
      'roles',
      'relationProposals',
    ],
  };
}

function isSafeAcceptedCandidate(candidate, status) {
  return candidate.status === status
    && candidate.offlineOnly === true
    && candidate.networkRequired === false
    && candidate.runtimeDownload === false
    && candidate.dynamicExecutablePlugin === false
    && candidate.licenseAccepted === true
    && (status !== ATLAS_DEEP_ENGINE_CANDIDATE_STATUS.ACCEPTED_CERTIFIED || candidate.corpusMetricsAvailable === true);
}

function chooseDecisionStatus(candidates) {
  if (candidates.some((candidate) => isSafeAcceptedCandidate(candidate, ATLAS_DEEP_ENGINE_CANDIDATE_STATUS.ACCEPTED_CERTIFIED))) {
    return ATLAS_DEEP_ENGINE_DECISION_STATUS.CERTIFIED_OFFLINE;
  }
  if (candidates.some((candidate) => isSafeAcceptedCandidate(candidate, ATLAS_DEEP_ENGINE_CANDIDATE_STATUS.ACCEPTED_EXPERIMENTAL))) {
    return ATLAS_DEEP_ENGINE_DECISION_STATUS.EXPERIMENTAL_NOT_CERTIFIED;
  }
  return ATLAS_DEEP_ENGINE_DECISION_STATUS.UNAVAILABLE_LOCAL_STUB_ONLY;
}

export function getAtlasDeepEngineDecisionDefaultCandidates() {
  return DEFAULT_CANDIDATES;
}

export function deriveAtlasDeepEngineDecision(input = {}) {
  const candidates = sortAtlasDeepEngineCandidates((Array.isArray(input.candidates) ? input.candidates : DEFAULT_CANDIDATES)
    .map((candidate, index) => normalizeCandidate(candidate, index)));
  const resourceManifest = buildResourceManifest();
  const hashPacket = buildHashPacket(resourceManifest);
  const adapterStub = buildAdapterStub(resourceManifest);
  const decisionStatus = chooseDecisionStatus(candidates);
  const certifiedLanguages = [...new Set(candidates
    .filter((candidate) => isSafeAcceptedCandidate(candidate, ATLAS_DEEP_ENGINE_CANDIDATE_STATUS.ACCEPTED_CERTIFIED))
    .flatMap((candidate) => candidate.certifiedLanguages))]
    .sort((left, right) => left.localeCompare(right, 'en', { sensitivity: 'variant' }));
  const decisionHash = hashCanonicalValue({
    schemaVersion: ATLAS_DEEP_ENGINE_DECISION_SCHEMA_VERSION,
    candidates,
    resourceManifest,
    hashPacket,
    adapterStub,
    decisionStatus,
  });
  return {
    schemaVersion: ATLAS_DEEP_ENGINE_DECISION_SCHEMA_VERSION,
    state: 'ready',
    decisionStatus,
    currentDeepCapability: decisionStatus === ATLAS_DEEP_ENGINE_DECISION_STATUS.CERTIFIED_OFFLINE
      ? 'CERTIFIED_OFFLINE'
      : decisionStatus === ATLAS_DEEP_ENGINE_DECISION_STATUS.EXPERIMENTAL_NOT_CERTIFIED
        ? 'EXPERIMENTAL_NOT_CERTIFIED'
        : 'UNAVAILABLE',
    certifiedLanguages,
    candidates,
    resourceManifest,
    hashPacket,
    adapterStub,
    guards: {
      noSilentBasicToDeepPromotion: true,
      noNetworkResource: candidates.every((candidate) => candidate.networkRequired === false || candidate.status === ATLAS_DEEP_ENGINE_CANDIDATE_STATUS.REJECTED),
      noRuntimeDownload: candidates.every((candidate) => candidate.runtimeDownload === false || candidate.status === ATLAS_DEEP_ENGINE_CANDIDATE_STATUS.REJECTED),
      noDynamicExecutablePlugin: candidates.every((candidate) => candidate.dynamicExecutablePlugin === false || candidate.status === ATLAS_DEEP_ENGINE_CANDIDATE_STATUS.REJECTED),
      noProjectTruthMutation: adapterStub.projectTruthMutation === false,
      noManuscriptMutation: adapterStub.manuscriptMutation === false,
      releaseReadinessClaim: false,
    },
    rollback: {
      targetStatus: ATLAS_DEEP_ENGINE_DECISION_STATUS.UNAVAILABLE_LOCAL_STUB_ONLY,
      reversible: true,
      removeRuntimeResource: false,
      clearCertifiedLanguages: true,
      fallbackAnalyzer: 'BASIC_EXACT_TERM_V1',
    },
    authority: {
      readModelOnly: true,
      commandAuthority: 'none',
      projectTruthMutation: false,
      manuscriptMutation: false,
      storageMutation: false,
      networkMutation: false,
      runtimeDownload: false,
      dynamicExecutablePlugin: false,
      releaseReadinessClaim: false,
    },
    summary: {
      candidateCount: candidates.length,
      rejectedCandidateCount: candidates.filter((candidate) => candidate.status === ATLAS_DEEP_ENGINE_CANDIDATE_STATUS.REJECTED).length,
      stubOnlyCandidateCount: candidates.filter((candidate) => candidate.status === ATLAS_DEEP_ENGINE_CANDIDATE_STATUS.STUB_ONLY).length,
      certifiedLanguageCount: certifiedLanguages.length,
      decisionHash,
    },
  };
}
