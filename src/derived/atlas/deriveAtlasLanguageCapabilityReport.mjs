import { createDerivedError, deriveView, hashCanonicalValue } from '../deriveView.mjs';
import {
  ATLAS_OBSERVATION_ANALYZER_ID,
  ATLAS_OBSERVATION_LANGUAGE_POLICY,
  normalizeAtlasObservationLanguagePolicy,
} from './atlasObservationTypes.mjs';
import { deriveAtlasBasicLanguagePackCertification } from './deriveAtlasBasicLanguagePackCertification.mjs';
import { ATLAS_BASIC_LANGUAGE_PACK_STATUS } from './atlasBasicLanguagePackTypes.mjs';
import { deriveAtlasComplexScriptExactOnlyGuards } from './deriveAtlasComplexScriptExactOnlyGuards.mjs';
import { ATLAS_COMPLEX_SCRIPT_GUARD_STATUS } from './atlasComplexScriptGuardTypes.mjs';
import { deriveAtlasDeepEngineDecision } from './deriveAtlasDeepEngineDecision.mjs';
import {
  ATLAS_LANGUAGE_CAPABILITY_GUARD_SCHEMA_VERSION,
  ATLAS_LANGUAGE_CAPABILITY_LEVEL,
  ATLAS_LANGUAGE_CAPABILITY_REPORT_SCHEMA_VERSION,
  ATLAS_LANGUAGE_CAPABILITY_ROW_SCHEMA_VERSION,
  ATLAS_LANGUAGE_CAPABILITY_STATUS,
  sortAtlasLanguageCapabilityRows,
} from './atlasLanguageCapabilityTypes.mjs';

const VIEW_ID = 'derived.atlas.languageCapabilityReport.v1';
const DEFAULT_LANGUAGE_CODES = Object.freeze(['und', 'de', 'en', 'es', 'fr', 'pl', 'ru', 'zh', 'zh-hans', 'zh-hant', 'ja', 'ko', 'ar', 'he', 'hi', 'ta', 'zz']);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLanguageCode(value) {
  const normalized = normalizeString(value).toLowerCase().replace(/_/gu, '-');
  return normalized || 'und';
}

function languageCodesFromParams(params) {
  const raw = Array.isArray(params?.languageCodes) && params.languageCodes.length > 0
    ? params.languageCodes
    : DEFAULT_LANGUAGE_CODES;
  return [...new Set(raw.map(normalizeLanguageCode))]
    .filter((code) => code.length > 0)
    .sort((left, right) => left.localeCompare(right, 'en', { sensitivity: 'variant' }));
}

function isCapabilityEnabled(snapshot) {
  if (!isPlainObject(snapshot)) return true;
  if (snapshot['atlas.languageCapabilityReport'] === false) return false;
  const capabilities = isPlainObject(snapshot.capabilities) ? snapshot.capabilities : {};
  if (capabilities['atlas.languageCapabilityReport'] === false) return false;
  if (capabilities.atlasLanguageCapabilityReport === false) return false;
  if (isPlainObject(capabilities.atlas) && capabilities.atlas.languageCapabilityReport === false) return false;
  return true;
}

function getProject(coreState, projectId) {
  const projects = isPlainObject(coreState?.data?.projects) ? coreState.data.projects : {};
  return isPlainObject(projects[projectId]) ? projects[projectId] : null;
}

function buildLanguageRow(languageCode, certificationByLanguageCode, complexGuardByLanguageCode) {
  const policy = normalizeAtlasObservationLanguagePolicy(languageCode);
  const certification = certificationByLanguageCode.get(policy.languageCode) || null;
  const complexGuard = complexGuardByLanguageCode.get(policy.languageCode) || null;
  const certifiedByCorpus = certification?.status === ATLAS_BASIC_LANGUAGE_PACK_STATUS.CERTIFIED_EXACT_ONLY;
  const supported = policy.policy === ATLAS_OBSERVATION_LANGUAGE_POLICY.BASIC_SUPPORTED && certifiedByCorpus;
  const guardedExactOnly = complexGuard?.status === ATLAS_COMPLEX_SCRIPT_GUARD_STATUS.GUARDED_EXACT_ONLY;
  const status = supported
    ? ATLAS_LANGUAGE_CAPABILITY_STATUS.CERTIFIED_EXACT_ONLY
    : ATLAS_LANGUAGE_CAPABILITY_STATUS.UNSUPPORTED_EXACT_ONLY;
  return {
    schemaVersion: ATLAS_LANGUAGE_CAPABILITY_ROW_SCHEMA_VERSION,
    languageCode: policy.languageCode,
    claimLevel: supported ? ATLAS_LANGUAGE_CAPABILITY_LEVEL.BASIC : ATLAS_LANGUAGE_CAPABILITY_LEVEL.GLOBAL,
    status,
    analyzerId: policy.analyzerId,
    exactOnly: true,
    fuzzyMatching: false,
    englishFallback: false,
    deepSupported: false,
    unsupportedLanguageExactOnly: !supported,
    certifiedCapabilities: supported
      ? ['manualAliases', 'exactMentions', 'evidenceAnchors', 'observationAggregate']
      : ['manualAliases', 'exactMentions', 'evidenceAnchors'],
    unavailableCapabilities: [
      'segmentationEngine',
      'nameForms',
      'ner',
      'morphology',
      'constrainedCoreference',
      'dialogue',
      'eventExtraction',
      'relationProposals',
    ],
    corpusMetricsStatus: supported
      ? 'certified-by-e07-c04-basic-fixtures'
      : guardedExactOnly
        ? 'guarded-exact-only-by-e07-c05-complex-script-fixtures'
        : 'unsupported-or-not-certified-by-e07-c04-basic-fixtures',
    corpusMetrics: certification
      ? {
        caseCount: certification.caseCount,
        passedCaseCount: certification.passedCaseCount,
        precision: certification.precision,
        recall: certification.recall,
        f1: certification.f1,
      }
      : {
        caseCount: 0,
        passedCaseCount: 0,
        precision: 1,
        recall: 1,
        f1: 1,
    },
    languagePackClaims: supported && Array.isArray(certification?.claims) ? certification.claims : [],
    complexScriptGuard: complexGuard
      ? {
        status: complexGuard.status,
        scriptClass: complexGuard.scriptClass,
        caseCount: complexGuard.caseCount,
        passedCaseCount: complexGuard.passedCaseCount,
        precision: complexGuard.precision,
        recall: complexGuard.recall,
        f1: complexGuard.f1,
        segmentationCertified: false,
        morphologyCertified: false,
      }
      : null,
    downgradeTarget: 'GLOBAL_EXACT_ONLY',
  };
}

function buildDeepUnavailableRow(languageCode) {
  return {
    schemaVersion: ATLAS_LANGUAGE_CAPABILITY_ROW_SCHEMA_VERSION,
    languageCode,
    claimLevel: ATLAS_LANGUAGE_CAPABILITY_LEVEL.DEEP,
    status: ATLAS_LANGUAGE_CAPABILITY_STATUS.UNAVAILABLE,
    analyzerId: '',
    exactOnly: false,
    fuzzyMatching: false,
    englishFallback: false,
    deepSupported: false,
    unsupportedLanguageExactOnly: false,
    certifiedCapabilities: [],
    unavailableCapabilities: [
      'ner',
      'morphology',
      'constrainedCoreference',
      'dialogue',
      'eventExtraction',
      'roles',
      'relationProposals',
    ],
    corpusMetricsStatus: 'blocked-until-engine-decision-and-corpus-metrics',
    downgradeTarget: 'BASIC_OR_GLOBAL_EXACT_ONLY',
  };
}

function buildGuards(rows) {
  const deepRows = rows.filter((row) => row.claimLevel === ATLAS_LANGUAGE_CAPABILITY_LEVEL.DEEP);
  const unsupportedRows = rows.filter((row) => row.status === ATLAS_LANGUAGE_CAPABILITY_STATUS.UNSUPPORTED_EXACT_ONLY);
  return {
    schemaVersion: ATLAS_LANGUAGE_CAPABILITY_GUARD_SCHEMA_VERSION,
    noSilentEnglishFallback: rows.every((row) => row.englishFallback === false),
    unsupportedExactOnly: unsupportedRows.every((row) => row.exactOnly === true && row.fuzzyMatching === false),
    noDeepWithoutMetrics: deepRows.every((row) => row.status === ATLAS_LANGUAGE_CAPABILITY_STATUS.UNAVAILABLE && row.deepSupported === false),
    noAutomaticTruthMutation: true,
    noRuntimeDownload: true,
    noDynamicExecutablePlugin: true,
  };
}

function buildReport({ project, params, meta }) {
  const languageCodes = languageCodesFromParams(params);
  const languagePackCertification = deriveAtlasBasicLanguagePackCertification({
    corpus: params.basicLanguagePackCorpus,
  });
  const certificationByLanguageCode = new Map(languagePackCertification.languageRows
    .map((row) => [row.languageCode, row]));
  const complexScriptExactOnlyGuards = isPlainObject(params.complexScriptGuardCorpus)
    ? deriveAtlasComplexScriptExactOnlyGuards({ corpus: params.complexScriptGuardCorpus })
    : null;
  const complexGuardByLanguageCode = new Map((complexScriptExactOnlyGuards?.languageRows || [])
    .map((row) => [row.languageCode, row]));
  const deepEngineDecision = deriveAtlasDeepEngineDecision({
    candidates: params.deepEngineCandidates,
  });
  const capabilityRows = sortAtlasLanguageCapabilityRows([
    ...languageCodes.map((code) => buildLanguageRow(code, certificationByLanguageCode, complexGuardByLanguageCode)),
    ...languageCodes.map((code) => buildDeepUnavailableRow(code)),
  ]);
  const guards = buildGuards(capabilityRows);
  const certifiedExactOnlyCount = capabilityRows
    .filter((row) => row.status === ATLAS_LANGUAGE_CAPABILITY_STATUS.CERTIFIED_EXACT_ONLY).length;
  const unsupportedExactOnlyCount = capabilityRows
    .filter((row) => row.status === ATLAS_LANGUAGE_CAPABILITY_STATUS.UNSUPPORTED_EXACT_ONLY).length;
  const deepUnavailableCount = capabilityRows
    .filter((row) => row.claimLevel === ATLAS_LANGUAGE_CAPABILITY_LEVEL.DEEP && row.status === ATLAS_LANGUAGE_CAPABILITY_STATUS.UNAVAILABLE).length;
  const reportHash = hashCanonicalValue({ capabilityRows, guards, analyzerId: ATLAS_OBSERVATION_ANALYZER_ID });
  return {
    schemaVersion: ATLAS_LANGUAGE_CAPABILITY_REPORT_SCHEMA_VERSION,
    state: guards.noSilentEnglishFallback && guards.unsupportedExactOnly && guards.noDeepWithoutMetrics ? 'ready' : 'degraded',
    projectId: normalizeString(project.id) || params.projectId,
    analyzer: {
      analyzerId: ATLAS_OBSERVATION_ANALYZER_ID,
      currentRuntimeKind: 'BASIC_EXACT_TERM',
      exactOnly: true,
      fuzzyMatching: false,
      deepRuntimeAvailable: false,
      remoteModelRequired: false,
    },
    authority: {
      sourceOfTruth: 'derived.atlas.observationAggregate.v1 + atlasObservationTypes.mjs',
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
      languageCount: languageCodes.length,
      rowCount: capabilityRows.length,
      certifiedExactOnlyCount,
      unsupportedExactOnlyCount,
      deepUnavailableCount,
      falseDeepClaimCount: capabilityRows.filter((row) => row.deepSupported === true).length,
      englishFallbackCount: capabilityRows.filter((row) => row.englishFallback === true).length,
      reportHash,
      invalidationKey: meta.invalidationKey,
    },
    guards,
    basicLanguagePackCertification: languagePackCertification,
    complexScriptExactOnlyGuards,
    deepEngineDecision,
    capabilityRows,
  };
}

export function deriveAtlasLanguageCapabilityReport(input = {}) {
  const projectId = normalizeString(input?.params?.projectId);
  if (!projectId) {
    return {
      ok: false,
      error: {
        code: 'E_ATLAS_PROJECT_ID_REQUIRED',
        op: VIEW_ID,
        reason: 'PROJECT_ID_REQUIRED',
      },
    };
  }
  return deriveView({
    viewId: VIEW_ID,
    coreState: input.coreState,
    params: {
      ...input.params,
      projectId,
      languageCodes: languageCodesFromParams(input.params || {}),
    },
    capabilitySnapshot: input.capabilitySnapshot,
    derive: ({ coreState, params, capabilitySnapshot, meta }) => {
      if (!isCapabilityEnabled(capabilitySnapshot)) {
        throw createDerivedError(
          'E_CAPABILITY_DISABLED_FOR_COMMAND',
          VIEW_ID,
          'ATLAS_LANGUAGE_CAPABILITY_REPORT_DISABLED',
          { capabilityId: 'atlas.languageCapabilityReport' },
        );
      }
      const project = getProject(coreState, params.projectId);
      if (!project) {
        throw createDerivedError(
          'E_ATLAS_PROJECT_NOT_FOUND',
          VIEW_ID,
          'PROJECT_NOT_FOUND',
          { projectId: params.projectId },
        );
      }
      return buildReport({ project, params, meta });
    },
  });
}

export { VIEW_ID as ATLAS_LANGUAGE_CAPABILITY_REPORT_VIEW_ID };
