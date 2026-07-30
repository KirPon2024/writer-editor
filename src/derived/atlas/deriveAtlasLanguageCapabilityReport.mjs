import { createDerivedError, deriveView, hashCanonicalValue } from '../deriveView.mjs';
import {
  ATLAS_OBSERVATION_ANALYZER_ID,
  ATLAS_OBSERVATION_LANGUAGE_POLICY,
  normalizeAtlasObservationLanguagePolicy,
} from './atlasObservationTypes.mjs';
import {
  ATLAS_LANGUAGE_CAPABILITY_GUARD_SCHEMA_VERSION,
  ATLAS_LANGUAGE_CAPABILITY_LEVEL,
  ATLAS_LANGUAGE_CAPABILITY_REPORT_SCHEMA_VERSION,
  ATLAS_LANGUAGE_CAPABILITY_ROW_SCHEMA_VERSION,
  ATLAS_LANGUAGE_CAPABILITY_STATUS,
  sortAtlasLanguageCapabilityRows,
} from './atlasLanguageCapabilityTypes.mjs';

const VIEW_ID = 'derived.atlas.languageCapabilityReport.v1';
const DEFAULT_LANGUAGE_CODES = Object.freeze(['und', 'en', 'ru', 'zh', 'ja', 'ko', 'ar', 'he', 'hi', 'zz']);

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

function buildLanguageRow(languageCode) {
  const policy = normalizeAtlasObservationLanguagePolicy(languageCode);
  const supported = policy.policy === ATLAS_OBSERVATION_LANGUAGE_POLICY.BASIC_SUPPORTED;
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
      'segmentation',
      'nameForms',
      'ner',
      'morphology',
      'constrainedCoreference',
      'dialogue',
      'eventExtraction',
      'relationProposals',
    ],
    corpusMetricsStatus: 'not-yet-certified-in-stage-07-c01',
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
  const capabilityRows = sortAtlasLanguageCapabilityRows([
    ...languageCodes.map((code) => buildLanguageRow(code)),
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
