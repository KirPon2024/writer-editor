import { hashCanonicalValue } from '../deriveView.mjs';
import { deriveAtlasDeepEngineDecision } from './deriveAtlasDeepEngineDecision.mjs';
import { ATLAS_DEEP_ENGINE_CANDIDATE_STATUS } from './atlasDeepEngineDecisionTypes.mjs';
import { deriveAtlasDeepFixtureCertification } from './deriveAtlasDeepFixtureCertification.mjs';
import { ATLAS_DEEP_FIXTURE_STATUS } from './atlasDeepFixtureCertificationTypes.mjs';
import {
  ATLAS_LANGUAGE_DECERTIFICATION_ROLLBACK_SCHEMA_VERSION,
  ATLAS_LANGUAGE_RESOURCE_ISOLATION_SCHEMA_VERSION,
  ATLAS_LANGUAGE_ROLLBACK_ACTION,
  ATLAS_LANGUAGE_ROLLBACK_ROW_SCHEMA_VERSION,
  ATLAS_LANGUAGE_ROLLBACK_STATUS,
  sortAtlasLanguageRollbackRows,
} from './atlasLanguageRollbackTypes.mjs';

const FIXTURE_ADAPTER_ID = 'atlas.deep.localFixtureAdapter.v1';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLanguageCode(value) {
  return normalizeString(value).toLowerCase().replace(/_/gu, '-') || 'und';
}

function normalizedLanguageSet(values) {
  return new Set((Array.isArray(values) ? values : [])
    .map(normalizeLanguageCode)
    .filter(Boolean));
}

function buildDeepEngineCandidatesFromCertification(deepFixtureCertification) {
  if (!deepFixtureCertification || deepFixtureCertification.summary.certifiedLanguageCodes.length === 0) return null;
  return [
    {
      candidateId: 'basic-exact-term-v1',
      candidateKind: 'current-basic-analyzer',
      status: ATLAS_DEEP_ENGINE_CANDIDATE_STATUS.REJECTED,
      reason: 'BASIC_EXACT_TERM_V1 remains exact mention evidence only and cannot be promoted to Deep.',
      offlineOnly: true,
      networkRequired: false,
      runtimeDownload: false,
      dynamicExecutablePlugin: false,
      licenseAccepted: true,
      corpusMetricsAvailable: false,
      certifiedLanguages: [],
    },
    {
      candidateId: 'local-ru-en-deep-fixture-v1',
      candidateKind: 'local-fixture-adapter',
      status: ATLAS_DEEP_ENGINE_CANDIDATE_STATUS.ACCEPTED_CERTIFIED,
      reason: 'C08 rollback proof reuses C07 local RU EN fixture certification without adding runtime resource authority.',
      offlineOnly: true,
      networkRequired: false,
      runtimeDownload: false,
      dynamicExecutablePlugin: false,
      licenseAccepted: true,
      corpusMetricsAvailable: true,
      certifiedLanguages: deepFixtureCertification.summary.certifiedLanguageCodes,
    },
  ];
}

function resolveCertification(input) {
  if (isPlainObject(input.deepFixtureCertification)) return input.deepFixtureCertification;
  if (isPlainObject(input.deepFixtureCertificationCorpus)) {
    return deriveAtlasDeepFixtureCertification({ corpus: input.deepFixtureCertificationCorpus });
  }
  return null;
}

function resolveDecision(input, deepFixtureCertification) {
  if (isPlainObject(input.deepEngineDecision)) return input.deepEngineDecision;
  return deriveAtlasDeepEngineDecision({
    candidates: input.deepEngineCandidates || buildDeepEngineCandidatesFromCertification(deepFixtureCertification),
  });
}

function rollbackStatusFor(row, certifiedLanguages, rollbackLanguages) {
  if (!row) return ATLAS_LANGUAGE_ROLLBACK_STATUS.UNAVAILABLE;
  if (row.status === ATLAS_DEEP_FIXTURE_STATUS.DECERTIFIED_BY_CORPUS) {
    return ATLAS_LANGUAGE_ROLLBACK_STATUS.DECERTIFIED_BY_CORPUS;
  }
  if (row.status === ATLAS_DEEP_FIXTURE_STATUS.DEGRADED_TO_EXACT_ONLY) {
    return ATLAS_LANGUAGE_ROLLBACK_STATUS.DEGRADED_TO_EXACT_ONLY;
  }
  const certified = row.status === ATLAS_DEEP_FIXTURE_STATUS.CERTIFIED_DEEP_FIXTURE
    && certifiedLanguages.has(row.languageCode);
  if (!certified) return ATLAS_LANGUAGE_ROLLBACK_STATUS.UNAVAILABLE;
  return rollbackLanguages.has(row.languageCode)
    ? ATLAS_LANGUAGE_ROLLBACK_STATUS.ROLLED_BACK_TO_EXACT_ONLY
    : ATLAS_LANGUAGE_ROLLBACK_STATUS.CERTIFIED_ACTIVE;
}

function rollbackActionFor(status) {
  if (status === ATLAS_LANGUAGE_ROLLBACK_STATUS.CERTIFIED_ACTIVE) return ATLAS_LANGUAGE_ROLLBACK_ACTION.KEEP_CERTIFIED;
  if (status === ATLAS_LANGUAGE_ROLLBACK_STATUS.ROLLED_BACK_TO_EXACT_ONLY) return ATLAS_LANGUAGE_ROLLBACK_ACTION.DECERTIFY_TO_EXACT_ONLY;
  if (status === ATLAS_LANGUAGE_ROLLBACK_STATUS.DECERTIFIED_BY_CORPUS) return ATLAS_LANGUAGE_ROLLBACK_ACTION.KEEP_DECERTIFIED_EXACT_ONLY;
  return ATLAS_LANGUAGE_ROLLBACK_ACTION.KEEP_DEGRADED_EXACT_ONLY;
}

function buildRollbackRow(row, certifiedLanguages, rollbackLanguages) {
  const status = rollbackStatusFor(row, certifiedLanguages, rollbackLanguages);
  const action = rollbackActionFor(status);
  return {
    schemaVersion: ATLAS_LANGUAGE_ROLLBACK_ROW_SCHEMA_VERSION,
    languageCode: row.languageCode,
    status,
    action,
    previousDeepStatus: row.status,
    nextClaimLevel: status === ATLAS_LANGUAGE_ROLLBACK_STATUS.CERTIFIED_ACTIVE ? 'DEEP' : 'BASIC_OR_GLOBAL_EXACT_ONLY',
    fixtureOnly: true,
    productionRuntimeClaim: false,
    englishFallback: false,
    mutationRequired: false,
    storageMutation: false,
    projectTruthMutation: false,
    manuscriptMutation: false,
    resourceRemovalRequired: false,
    resourceScope: `language:${row.languageCode}:${FIXTURE_ADAPTER_ID}`,
    metrics: {
      caseCount: row.caseCount,
      passedCaseCount: row.passedCaseCount,
      precision: row.precision,
      recall: row.recall,
      f1: row.f1,
    },
    rollbackPlan: {
      reversible: true,
      fromClaimLevel: 'DEEP',
      toClaimLevel: 'BASIC_OR_GLOBAL_EXACT_ONLY',
      fallbackAnalyzer: 'BASIC_EXACT_TERM_V1',
      removeRuntimeResource: false,
      clearCertifiedLanguageOnly: status === ATLAS_LANGUAGE_ROLLBACK_STATUS.ROLLED_BACK_TO_EXACT_ONLY,
    },
  };
}

function buildResourceIsolation({ deepEngineDecision, rollbackRows }) {
  const languageScopes = rollbackRows.map((row) => ({
    languageCode: row.languageCode,
    resourceScope: row.resourceScope,
    status: row.status,
    action: row.action,
    isolated: true,
    sharedResourceDeletionAllowed: false,
  }));
  const resourceManifest = isPlainObject(deepEngineDecision?.resourceManifest)
    ? deepEngineDecision.resourceManifest
    : null;
  const resources = [
    resourceManifest
      ? {
        resourceId: resourceManifest.resourceId,
        resourceKind: resourceManifest.resourceKind,
        executable: resourceManifest.executable === true,
        modelWeights: resourceManifest.modelWeights === true,
        byteLength: Number.isFinite(Number(resourceManifest.byteLength)) ? Number(resourceManifest.byteLength) : 0,
        sharedReadOnly: true,
        removalRequired: false,
      }
      : null,
    {
      resourceId: FIXTURE_ADAPTER_ID,
      resourceKind: 'local-fixture-adapter',
      executable: false,
      modelWeights: false,
      byteLength: 0,
      sharedReadOnly: true,
      removalRequired: false,
    },
  ].filter(Boolean);
  const isolationHash = hashCanonicalValue({
    schemaVersion: ATLAS_LANGUAGE_RESOURCE_ISOLATION_SCHEMA_VERSION,
    resources,
    languageScopes,
  });
  return {
    schemaVersion: ATLAS_LANGUAGE_RESOURCE_ISOLATION_SCHEMA_VERSION,
    resources,
    languageScopes,
    guards: {
      noCrossLanguageDecertification: true,
      noSharedResourceDeletion: resources.every((resource) => resource.removalRequired === false),
      noExecutableResource: resources.every((resource) => resource.executable === false),
      noModelWeights: resources.every((resource) => resource.modelWeights === false),
      noNetworkResource: true,
      noRuntimeDownload: true,
      noDynamicExecutablePlugin: true,
    },
    isolationHash,
  };
}

export function deriveAtlasLanguageDecertificationRollback(input = {}) {
  const deepFixtureCertification = resolveCertification(input);
  const deepEngineDecision = resolveDecision(input, deepFixtureCertification);
  const rollbackLanguages = normalizedLanguageSet(input.rollbackLanguages);
  const certifiedLanguages = new Set(deepEngineDecision.currentDeepCapability === 'CERTIFIED_OFFLINE'
    ? deepEngineDecision.certifiedLanguages
    : []);
  const rollbackRows = sortAtlasLanguageRollbackRows((deepFixtureCertification?.languageRows || [])
    .map((row) => buildRollbackRow(row, certifiedLanguages, rollbackLanguages)));
  const resourceIsolation = buildResourceIsolation({ deepEngineDecision, rollbackRows });
  const rolledBackLanguageCodes = rollbackRows
    .filter((row) => row.status === ATLAS_LANGUAGE_ROLLBACK_STATUS.ROLLED_BACK_TO_EXACT_ONLY)
    .map((row) => row.languageCode);
  const activeCertifiedLanguageCodes = rollbackRows
    .filter((row) => row.status === ATLAS_LANGUAGE_ROLLBACK_STATUS.CERTIFIED_ACTIVE)
    .map((row) => row.languageCode);
  const decertifiedLanguageCodes = rollbackRows
    .filter((row) => row.status === ATLAS_LANGUAGE_ROLLBACK_STATUS.DECERTIFIED_BY_CORPUS)
    .map((row) => row.languageCode);
  const degradedLanguageCodes = rollbackRows
    .filter((row) => row.status === ATLAS_LANGUAGE_ROLLBACK_STATUS.DEGRADED_TO_EXACT_ONLY)
    .map((row) => row.languageCode);
  const rollbackHash = hashCanonicalValue({
    schemaVersion: ATLAS_LANGUAGE_DECERTIFICATION_ROLLBACK_SCHEMA_VERSION,
    rollbackRows,
    resourceIsolation,
    decisionStatus: deepEngineDecision.decisionStatus,
  });
  return {
    schemaVersion: ATLAS_LANGUAGE_DECERTIFICATION_ROLLBACK_SCHEMA_VERSION,
    state: resourceIsolation.guards.noCrossLanguageDecertification
      && resourceIsolation.guards.noSharedResourceDeletion
      && resourceIsolation.guards.noExecutableResource
      ? 'ready'
      : 'degraded',
    deepDecisionStatus: deepEngineDecision.decisionStatus,
    requestedRollbackLanguages: [...rollbackLanguages].sort((left, right) => left.localeCompare(right, 'en', { sensitivity: 'variant' })),
    summary: {
      languageCount: rollbackRows.length,
      activeCertifiedCount: activeCertifiedLanguageCodes.length,
      rolledBackCount: rolledBackLanguageCodes.length,
      decertifiedByCorpusCount: decertifiedLanguageCodes.length,
      degradedToExactOnlyCount: degradedLanguageCodes.length,
      activeCertifiedLanguageCodes,
      rolledBackLanguageCodes,
      decertifiedLanguageCodes,
      degradedLanguageCodes,
      rollbackHash,
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
    guards: {
      noSilentEnglishFallback: rollbackRows.every((row) => row.englishFallback === false),
      noAutomaticTruthMutation: rollbackRows.every((row) => row.projectTruthMutation === false && row.manuscriptMutation === false),
      rollbackPerLanguageOnly: rollbackRows
        .filter((row) => row.status === ATLAS_LANGUAGE_ROLLBACK_STATUS.ROLLED_BACK_TO_EXACT_ONLY)
        .every((row) => rollbackLanguages.has(row.languageCode) && row.resourceRemovalRequired === false),
      certifiedLanguagesRemainIndependent: activeCertifiedLanguageCodes.every((languageCode) => !rollbackLanguages.has(languageCode)),
      noSharedResourceDeletion: resourceIsolation.guards.noSharedResourceDeletion,
      noRuntimeDownload: true,
      noDynamicExecutablePlugin: true,
    },
    resourceIsolation,
    rollbackRows,
  };
}
