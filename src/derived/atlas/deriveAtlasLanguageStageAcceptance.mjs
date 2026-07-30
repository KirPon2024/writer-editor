import { createDerivedError, deriveView, hashCanonicalValue } from '../deriveView.mjs';
import { buildAtlasTextAnchorPacket } from './atlasTextAnchorNormalization.mjs';
import { ATLAS_TEXT_OFFSET_DOMAIN } from './atlasTextAnchorTypes.mjs';
import { deriveAtlasDeepFixtureCertification } from './deriveAtlasDeepFixtureCertification.mjs';
import { deriveAtlasLanguageCapabilityReport } from './deriveAtlasLanguageCapabilityReport.mjs';
import { deriveAtlasLanguageDecertificationRollback } from './deriveAtlasLanguageDecertificationRollback.mjs';
import { deriveAtlasMixedLanguageRouter } from './deriveAtlasMixedLanguageRouter.mjs';
import {
  ATLAS_LANGUAGE_STAGE_ACCEPTANCE_PROOF_SCHEMA_VERSION,
  ATLAS_LANGUAGE_STAGE_ACCEPTANCE_SCHEMA_VERSION,
  ATLAS_LANGUAGE_STAGE_GATE_STATUS,
  ATLAS_LANGUAGE_STAGE_HANDOFF_SCHEMA_VERSION,
  sortAtlasLanguageStageGates,
} from './atlasLanguageStageAcceptanceTypes.mjs';

const VIEW_ID = 'derived.atlas.languageStageAcceptance.v1';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function capabilityMap(snapshot) {
  return isPlainObject(snapshot?.capabilities) ? snapshot.capabilities : {};
}

function isCapabilityEnabled(snapshot) {
  if (!isPlainObject(snapshot)) return true;
  if (snapshot['atlas.languageStageAcceptance'] === false) return false;
  const capabilities = capabilityMap(snapshot);
  if (capabilities['atlas.languageStageAcceptance'] === false) return false;
  if (capabilities.atlasLanguageStageAcceptance === false) return false;
  if (isPlainObject(capabilities.atlas) && capabilities.atlas.languageStageAcceptance === false) return false;
  return true;
}

function getProject(coreState, projectId) {
  const projects = isPlainObject(coreState?.data?.projects) ? coreState.data.projects : {};
  return isPlainObject(projects[projectId]) ? projects[projectId] : null;
}

function firstScene(project) {
  const scenes = isPlainObject(project?.scenes) ? project.scenes : {};
  const sceneId = Object.keys(scenes).sort((left, right) => left.localeCompare(right, 'en', { sensitivity: 'variant' }))[0] || '';
  return {
    sceneId,
    text: typeof scenes[sceneId]?.text === 'string' ? scenes[sceneId].text : '',
  };
}

function resultValue(result, op) {
  if (result?.ok) return result.value;
  throw createDerivedError(
    result?.error?.code || 'E_ATLAS_LANGUAGE_STAGE_ACCEPTANCE_SOURCE_FAILED',
    VIEW_ID,
    result?.error?.reason || 'SOURCE_DERIVATION_FAILED',
    { sourceOp: op },
  );
}

function buildUnicodeProbe(project, params) {
  const probeText = normalizeString(params.unicodeProbeText)
    || 'Cafe\u0301\r\nAsha 👩‍💻 keeps שלום inside the same quote.';
  const quoted = normalizeString(params.unicodeProbeQuote) || 'Cafe\u0301';
  const startOffset = Math.max(0, probeText.indexOf(quoted));
  const endOffset = startOffset + quoted.length;
  const anchorPacket = buildAtlasTextAnchorPacket({
    projectId: project.id,
    sceneId: firstScene(project).sceneId || 'stage-07-unicode-probe',
    entityId: 'stage-07-unicode-probe',
    termId: 'stage-07-unicode-probe',
    startOffset,
    endOffset,
    sceneText: probeText,
  });
  return {
    anchorPacket,
    pass: anchorPacket.originalQuotePreserved === true
      && anchorPacket.destructiveNormalizationApplied === false
      && anchorPacket.evidenceAnchor.adapterOffsetDomain === ATLAS_TEXT_OFFSET_DOMAIN.UTF16_JS_CODE_UNIT
      && anchorPacket.evidenceAnchor.canonicalOffsetDomains.includes(ATLAS_TEXT_OFFSET_DOMAIN.UNICODE_CODE_POINT)
      && anchorPacket.evidenceAnchor.canonicalOffsetDomains.includes(ATLAS_TEXT_OFFSET_DOMAIN.GRAPHEME_CLUSTER)
      && anchorPacket.evidenceAnchor.normalizationMap.destructiveNormalizationApplied === false,
  };
}

function buildSourcePackets({ coreState, params, capabilitySnapshot, project }) {
  const languageCapabilityReport = resultValue(deriveAtlasLanguageCapabilityReport({
    coreState,
    params,
    capabilitySnapshot,
  }), 'deriveAtlasLanguageCapabilityReport');
  const mixedLanguageRouter = resultValue(deriveAtlasMixedLanguageRouter({
    coreState,
    params: { projectId: params.projectId },
    capabilitySnapshot,
  }), 'deriveAtlasMixedLanguageRouter');
  const deepFixtureCertification = isPlainObject(params.deepFixtureCertificationCorpus)
    ? deriveAtlasDeepFixtureCertification({ corpus: params.deepFixtureCertificationCorpus })
    : languageCapabilityReport.deepFixtureCertification;
  const rollback = deriveAtlasLanguageDecertificationRollback({
    deepFixtureCertification: deepFixtureCertification || undefined,
    rollbackLanguages: Array.isArray(params.rollbackLanguages) ? params.rollbackLanguages : [],
  });
  return {
    languageCapabilityReport,
    mixedLanguageRouter,
    unicodeProbe: buildUnicodeProbe(project, params),
    basicLanguagePackCertification: languageCapabilityReport.basicLanguagePackCertification,
    complexScriptExactOnlyGuards: languageCapabilityReport.complexScriptExactOnlyGuards,
    deepEngineDecision: languageCapabilityReport.deepEngineDecision,
    deepFixtureCertification,
    rollback,
  };
}

function gate(id, label, pass, evidence, details = {}) {
  return {
    id,
    label,
    status: pass ? ATLAS_LANGUAGE_STAGE_GATE_STATUS.PASS : ATLAS_LANGUAGE_STAGE_GATE_STATUS.DEGRADED,
    evidence,
    details,
  };
}

function buildAcceptanceProof(packets) {
  const capability = packets.languageCapabilityReport;
  const router = packets.mixedLanguageRouter;
  const basic = packets.basicLanguagePackCertification;
  const complex = packets.complexScriptExactOnlyGuards;
  const deepDecision = packets.deepEngineDecision;
  const deepFixture = packets.deepFixtureCertification;
  const rollback = packets.rollback;
  const gates = sortAtlasLanguageStageGates([
    gate(
      'stage07-c01-language-capability-truth',
      'Language capability truth registry',
      capability.state === 'ready'
        && capability.guards.noSilentEnglishFallback === true
        && capability.guards.unsupportedExactOnly === true
        && capability.guards.noDeepWithoutMetrics === true
        && capability.summary.englishFallbackCount === 0
        && capability.summary.falseDeepClaimCount === 0,
      'Capability report exposes GLOBAL, BASIC, DEEP, unsupported, unavailable, and fixture-certified rows without false English fallback or false Deep promotion.',
      {
        rowCount: capability.summary.rowCount,
        certifiedExactOnlyCount: capability.summary.certifiedExactOnlyCount,
        certifiedDeepCount: capability.summary.certifiedDeepCount,
        deepUnavailableCount: capability.summary.deepUnavailableCount,
      },
    ),
    gate(
      'stage07-c02-unicode-offset-domain',
      'Unicode offset-domain and normalization map',
      packets.unicodeProbe.pass,
      'Unicode probe preserves original quote, adapter UTF16 offsets, code point and grapheme ranges, CRLF and normalization metadata without destructive normalization.',
      {
        adapterOffsetDomain: packets.unicodeProbe.anchorPacket.evidenceAnchor.adapterOffsetDomain,
        originalQuotePreserved: packets.unicodeProbe.anchorPacket.originalQuotePreserved,
        destructiveNormalizationApplied: packets.unicodeProbe.anchorPacket.destructiveNormalizationApplied,
      },
    ),
    gate(
      'stage07-c03-mixed-language-router',
      'Author language tags and mixed range router',
      router.summary.routeCount > 0
        && router.summary.englishFallbackCount === 0
        && router.summary.deepRouteCount === 0
        && router.evidence.guarantees.unsupportedRangeExactOnly === true
        && router.evidence.guarantees.originalManuscriptMutation === false,
      'Mixed-language router reads author language truth and routes unsupported ranges to GLOBAL exact-only with no manuscript rewrite or automatic language detection.',
      {
        routeCount: router.summary.routeCount,
        unsupportedExactOnlyRouteCount: router.summary.unsupportedExactOnlyRouteCount,
        languageTagCount: router.summary.languageTagCount,
      },
    ),
    gate(
      'stage07-c04-basic-language-pack-certification',
      'BASIC language packs and corpus metrics',
      basic?.state === 'ready'
        && basic.summary.certifiedExactOnlyCount >= 7
        && basic.summary.caseCount === basic.summary.passedCaseCount
        && basic.authority.networkMutation === false
        && basic.authority.runtimeDownload === false,
      'BASIC EN RU UND and bounded European language packs are corpus-certified exact-only with unsupported rows left exact-only.',
      {
        certifiedLanguageCodes: basic?.summary.certifiedLanguageCodes || [],
        unsupportedLanguageCodes: basic?.summary.unsupportedLanguageCodes || [],
      },
    ),
    gate(
      'stage07-c05-complex-script-exact-only-guards',
      'CJK RTL and complex script exact-only guards',
      complex?.state === 'ready'
        && complex.guards.originalUnicodePreserved === true
        && complex.guards.noSegmentationClaim === true
        && complex.guards.noMorphologyClaim === true
        && complex.guards.noSilentEnglishFallback === true
        && complex.guards.noDeepClaim === true,
      'CJK, RTL, Indic, and combining-script fixtures preserve original Unicode while refusing uncertified segmentation, morphology, English fallback, or Deep claims.',
      {
        guardedLanguageCodes: complex?.summary.guardedLanguageCodes || [],
        guardedExactOnlyCount: complex?.summary.guardedExactOnlyCount || 0,
      },
    ),
    gate(
      'stage07-c06-deep-engine-decision',
      'Deep engine decision and offline adapter boundary',
      deepDecision?.authority?.networkMutation === false
        && deepDecision?.authority?.runtimeDownload === false
        && deepDecision?.authority?.dynamicExecutablePlugin === false
        && deepDecision?.guards?.noSilentBasicToDeepPromotion === true
        && deepDecision?.guards?.releaseReadinessClaim === false,
      'Deep capability is decided only through local offline candidates, non-executable resource metadata, and no release-readiness claim.',
      {
        decisionStatus: deepDecision?.decisionStatus || '',
        currentDeepCapability: deepDecision?.currentDeepCapability || '',
        certifiedLanguages: deepDecision?.certifiedLanguages || [],
      },
    ),
    gate(
      'stage07-c07-ru-en-deep-fixture-certification',
      'RU EN Deep fixture certification and degradation',
      deepFixture?.guards?.fixtureOnly === true
        && deepFixture?.guards?.noProductionRuntimeClaim === true
        && deepFixture?.guards?.certifiedOnlyWithMetrics === true
        && deepFixture?.summary?.certifiedLanguageCodes?.includes('en')
        && deepFixture?.summary?.certifiedLanguageCodes?.includes('ru')
        && deepFixture?.summary?.degradedToExactOnlyCount >= 1,
      'RU and EN Deep fixture signals are certified by local corpus metrics only; uncertified languages degrade to exact-only and never become production runtime claims.',
      {
        certifiedLanguageCodes: deepFixture?.summary?.certifiedLanguageCodes || [],
        degradedLanguageCodes: deepFixture?.summary?.degradedLanguageCodes || [],
      },
    ),
    gate(
      'stage07-c08-rollback-resource-isolation',
      'Language rollback and resource isolation',
      rollback.state === 'ready'
        && rollback.guards.noSilentEnglishFallback === true
        && rollback.guards.noAutomaticTruthMutation === true
        && rollback.guards.noSharedResourceDeletion === true
        && rollback.resourceIsolation.guards.noExecutableResource === true
        && rollback.resourceIsolation.guards.noRuntimeDownload === true,
      'Decertification rollback is per-language, reversible, read-only, and keeps shared local fixture resources non-executable and shared-read-only.',
      {
        activeCertifiedLanguageCodes: rollback.summary.activeCertifiedLanguageCodes,
        rolledBackLanguageCodes: rollback.summary.rolledBackLanguageCodes,
        degradedLanguageCodes: rollback.summary.degradedLanguageCodes,
      },
    ),
  ]);
  const pass = gates.every((item) => item.status === ATLAS_LANGUAGE_STAGE_GATE_STATUS.PASS);
  return {
    schemaVersion: ATLAS_LANGUAGE_STAGE_ACCEPTANCE_PROOF_SCHEMA_VERSION,
    stageId: 'E07_STAGE_07_LANGUAGE_EXPANSION_AND_DEEP_CONTOURS',
    gates,
    pass,
    proofHash: hashCanonicalValue({
      schemaVersion: ATLAS_LANGUAGE_STAGE_ACCEPTANCE_PROOF_SCHEMA_VERSION,
      gates,
      reportHash: capability.summary.reportHash,
      routerHash: router.summary.routerHash,
      rollbackHash: rollback.summary.rollbackHash,
    }),
  };
}

function buildHandoff(acceptanceProof) {
  return {
    schemaVersion: ATLAS_LANGUAGE_STAGE_HANDOFF_SCHEMA_VERSION,
    fromStage: 'E07_STAGE_07_LANGUAGE_EXPANSION_AND_DEEP_CONTOURS',
    nextContour: 'EFINAL_PROGRAM_ACCEPTANCE_AND_DONE',
    readyForFinalProgramDoD: acceptanceProof.pass,
    releaseReadinessClaim: false,
    remainingScopeOut: [
      'production Deep runtime resources',
      'network language service',
      'dynamic executable analyzer plugins',
      'global graph composite mode',
      'series atlas packaging',
      'platform certification',
    ],
    handoffGuards: {
      noNewDependency: true,
      noUiRuntimeChange: true,
      noProjectTruthMutation: true,
      noManuscriptMutation: true,
      noStorageMutation: true,
      noNetworkMutation: true,
      noRuntimeDownload: true,
      noDynamicExecutablePlugin: true,
    },
  };
}

function buildPacket({ project, packets, meta }) {
  const acceptanceProof = buildAcceptanceProof(packets);
  const handoff = buildHandoff(acceptanceProof);
  return {
    schemaVersion: ATLAS_LANGUAGE_STAGE_ACCEPTANCE_SCHEMA_VERSION,
    state: acceptanceProof.pass ? 'ready' : 'degraded',
    projectId: project.id,
    stageId: 'E07_STAGE_07_LANGUAGE_EXPANSION_AND_DEEP_CONTOURS',
    designToolRouter: 'NOT_APPLICABLE',
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
      gateCount: acceptanceProof.gates.length,
      passedGateCount: acceptanceProof.gates.filter((item) => item.status === ATLAS_LANGUAGE_STAGE_GATE_STATUS.PASS).length,
      stageAcceptance: acceptanceProof.pass ? 'pass' : 'degraded',
      certifiedExactOnlyCount: packets.languageCapabilityReport.summary.certifiedExactOnlyCount,
      certifiedDeepCount: packets.languageCapabilityReport.summary.certifiedDeepCount,
      unsupportedExactOnlyCount: packets.languageCapabilityReport.summary.unsupportedExactOnlyCount,
      englishFallbackCount: packets.languageCapabilityReport.summary.englishFallbackCount,
      falseDeepClaimCount: packets.languageCapabilityReport.summary.falseDeepClaimCount,
      acceptanceHash: hashCanonicalValue({ acceptanceProof, handoff }),
      invalidationKey: meta.invalidationKey,
    },
    acceptanceProof,
    handoff,
    sourceHashes: {
      languageCapabilityReportHash: packets.languageCapabilityReport.summary.reportHash,
      mixedLanguageRouterHash: packets.mixedLanguageRouter.summary.routerHash,
      unicodeAnchorHash: packets.unicodeProbe.anchorPacket.evidenceAnchor.anchorId,
      basicCertificationHash: packets.basicLanguagePackCertification?.summary?.certificationHash || '',
      complexGuardHash: packets.complexScriptExactOnlyGuards?.summary?.guardHash || '',
      deepDecisionHash: packets.deepEngineDecision?.summary?.decisionHash || '',
      deepFixtureCertificationHash: packets.deepFixtureCertification?.summary?.certificationHash || '',
      rollbackHash: packets.rollback.summary.rollbackHash,
    },
    evidence: {
      schemaVersion: 'derived.atlas.languageStageAcceptance.evidence.v1',
      completedContours: [
        'E07_C01_LANGUAGE_CAPABILITY_TRUTH_REGISTRY_AND_REPORT',
        'E07_C02_UNICODE_EVIDENCE_ANCHOR_OFFSET_DOMAIN_AND_NORMALIZATION_MAP',
        'E07_C03_LANGUAGE_TAG_AUTHOR_TRUTH_AND_MIXED_RANGE_ROUTER',
        'E07_C04_BASIC_LANGUAGE_PACKS_EN_RU_AND_EUROPEAN_CERTIFICATION_FIXTURES',
        'E07_C05_CJK_RTL_AND_COMPLEX_SCRIPT_EXACT_ONLY_GUARDS',
        'E07_C06_DEEP_ENGINE_DECISION_OFFLINE_RESOURCE_AND_ADAPTER_STUB',
        'E07_C07_RU_EN_DEEP_FIXTURE_CERTIFICATION_AND_DEGRADATION',
        'E07_C08_LANGUAGE_DECERTIFICATION_ROLLBACK_AND_RESOURCE_ISOLATION',
      ],
      noProductionRuntimeDeepClaim: true,
      noSilentEnglishFallback: packets.languageCapabilityReport.guards.noSilentEnglishFallback,
      unsupportedExactOnly: packets.languageCapabilityReport.guards.unsupportedExactOnly,
      originalUnicodePreserved: packets.unicodeProbe.anchorPacket.originalQuotePreserved,
      resourceIsolationReadOnly: packets.rollback.resourceIsolation.guards.noSharedResourceDeletion,
    },
  };
}

export function deriveAtlasLanguageStageAcceptance(input = {}) {
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
    },
    capabilitySnapshot: input.capabilitySnapshot,
    derive: ({ coreState, params, capabilitySnapshot, meta }) => {
      if (!isCapabilityEnabled(capabilitySnapshot)) {
        throw createDerivedError(
          'E_CAPABILITY_DISABLED_FOR_COMMAND',
          VIEW_ID,
          'ATLAS_LANGUAGE_STAGE_ACCEPTANCE_DISABLED',
          { capabilityId: 'atlas.languageStageAcceptance' },
        );
      }
      const project = getProject(coreState, projectId);
      if (!project) {
        throw createDerivedError(
          'E_ATLAS_PROJECT_NOT_FOUND',
          VIEW_ID,
          'PROJECT_NOT_FOUND',
          { projectId },
        );
      }
      const packets = buildSourcePackets({ coreState, params, capabilitySnapshot, project });
      return buildPacket({ project, packets, meta });
    },
  });
}

export { VIEW_ID as ATLAS_LANGUAGE_STAGE_ACCEPTANCE_VIEW_ID };
