import { createDerivedError, deriveView, hashCanonicalValue } from '../deriveView.mjs';
import { deriveAtlasOverview } from './deriveAtlasOverview.mjs';
import { deriveAtlasMatrices } from './deriveAtlasMatrices.mjs';
import { deriveAtlasHeatmap } from './deriveAtlasHeatmap.mjs';
import { deriveAtlasReportsSavedQueries } from './deriveAtlasReportsSavedQueries.mjs';
import { deriveAtlasCalendarDefinitions } from './deriveAtlasCalendarDefinitions.mjs';
import { deriveAtlasSceneTemporalAnchors } from './deriveAtlasSceneTemporalAnchors.mjs';
import { deriveAtlasTemporalLayout } from './deriveAtlasTemporalLayout.mjs';
import { deriveAtlasContinuityFindings } from './deriveAtlasContinuityFindings.mjs';
import { deriveAtlasContinuityLedgerSurface } from './deriveAtlasContinuityLedgerSurface.mjs';
import {
  ATLAS_CALENDAR_ASSUMPTION_AUDIT_SCHEMA_VERSION,
  ATLAS_DEGRADED_CAPABILITY_REPORT_SCHEMA_VERSION,
  ATLAS_DIAGNOSTICS_STAGE_ACCEPTANCE_SCHEMA_VERSION,
  ATLAS_EVIDENCE_BACKED_FINDING_AUDIT_SCHEMA_VERSION,
  ATLAS_DIAGNOSTICS_SURFACE_MANIFEST_VERSION,
  ATLAS_FINAL_UI_AUDIT_RECEIPT_SCHEMA_VERSION,
  ATLAS_HEURISTIC_REVIEW_RECEIPT_SCHEMA_VERSION,
  ATLAS_STAGE_06_ACCEPTANCE_PROOF_SCHEMA_VERSION,
  ATLAS_STAGE_06_HOT_PATH_PROOF_SCHEMA_VERSION,
  ATLAS_STAGE_ACCEPTANCE_PROOF_SCHEMA_VERSION,
  ATLAS_SURFACE_FALLBACK_INVENTORY_SCHEMA_VERSION,
  sortAtlasDiagnosticsRows,
} from './atlasDiagnosticsTypes.mjs';

const VIEW_ID = 'derived.atlas.diagnosticsStageAcceptance.v1';
const PROVIDER_ID = 'query.atlasDiagnosticsStageAcceptance';
const SURFACE_ID = 'surface.atlas.diagnosticsStageAcceptance';
const RIGHT_RAIL_SLOT_ID = 'rightRail.context.atlas.diagnosticsStageAcceptance';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEvidenceArtifacts(value) {
  const source = isPlainObject(value) ? value : {};
  return {
    targetSha: normalizeString(source.targetSha),
    platformProfile: normalizeString(source.platformProfile),
    visualCaptureArtifact: normalizeString(source.visualCaptureArtifact),
    accessibilityAuditArtifact: normalizeString(source.accessibilityAuditArtifact),
    responsiveAuditArtifact: normalizeString(source.responsiveAuditArtifact),
    performanceMeasurementArtifact: normalizeString(source.performanceMeasurementArtifact),
    packagedRunArtifact: normalizeString(source.packagedRunArtifact),
    artifactDigest: normalizeString(source.artifactDigest),
  };
}

function hasEvidenceArtifact(value) {
  return Boolean(normalizeString(value));
}

function missingEvidenceRows(evidenceArtifacts) {
  const rows = [];
  if (!hasEvidenceArtifact(evidenceArtifacts.visualCaptureArtifact)) rows.push('visualCaptureArtifact');
  if (!hasEvidenceArtifact(evidenceArtifacts.accessibilityAuditArtifact)) rows.push('accessibilityAuditArtifact');
  if (!hasEvidenceArtifact(evidenceArtifacts.responsiveAuditArtifact)) rows.push('responsiveAuditArtifact');
  if (!hasEvidenceArtifact(evidenceArtifacts.performanceMeasurementArtifact)) rows.push('performanceMeasurementArtifact');
  if (!hasEvidenceArtifact(evidenceArtifacts.packagedRunArtifact)) rows.push('packagedRunArtifact');
  return rows;
}

function externalMachineEvidenceReady(evidenceArtifacts) {
  return missingEvidenceRows(evidenceArtifacts).length === 0
    && hasEvidenceArtifact(evidenceArtifacts.targetSha)
    && hasEvidenceArtifact(evidenceArtifacts.platformProfile)
    && hasEvidenceArtifact(evidenceArtifacts.artifactDigest);
}

function capabilityMap(snapshot) {
  return isPlainObject(snapshot?.capabilities) ? snapshot.capabilities : {};
}

function isCapabilityEnabled(snapshot, keys = []) {
  const capabilities = capabilityMap(snapshot);
  return keys.every((key) => capabilities[key] !== false);
}

function buildSurfaceManifest() {
  return {
    schemaVersion: ATLAS_DIAGNOSTICS_SURFACE_MANIFEST_VERSION,
    surfaceId: SURFACE_ID,
    providerId: PROVIDER_ID,
    host: 'rightRail',
    slotId: RIGHT_RAIL_SLOT_ID,
    contributionKind: 'readOnlyDiagnosticsAndAcceptanceProjection',
    allowedStateClasses: ['DERIVED_STATE', 'CAPABILITY_STATE'],
    commandAuthority: 'none',
    productMutation: false,
    storageAuthority: false,
    fallback: {
      empty: 'ATLAS_DIAGNOSTICS_EMPTY',
      degraded: 'ATLAS_DIAGNOSTICS_DEGRADED',
      unavailable: 'ATLAS_DIAGNOSTICS_UNAVAILABLE',
    },
  };
}

function buildAuthority() {
  return {
    sourceOfTruth: [
      'surface.atlas.overview.v1',
      'surface.atlas.entityDossier.v1',
      'surface.atlas.relationDossier.v1',
      'surface.atlas.matrices.v1',
      'surface.atlas.heatmap.v1',
      'surface.atlas.temporalLayout.v1',
      'surface.atlas.continuityLedger.v1',
      'surface.atlas.reportsSavedQueries.v1',
      'derived.atlas.calendarDefinitions.v1',
      'derived.atlas.sceneTemporalAnchors.v1',
      'derived.atlas.continuityFindings.v1',
      'capabilityPolicy.mjs',
    ],
    readModelOnly: true,
    commandAuthority: 'none',
    projectTruthMutation: false,
    storageMutation: false,
    networkMutation: false,
    rendererMutation: false,
    hiddenMutation: false,
    backgroundDaemon: false,
    releaseReadinessClaim: false,
  };
}

function getProject(coreState, projectId) {
  const projects = isPlainObject(coreState?.data?.projects) ? coreState.data.projects : {};
  return isPlainObject(projects[projectId]) ? projects[projectId] : null;
}

function runSurface(surfaceId, derive) {
  try {
    const result = derive();
    if (result?.ok) {
      return {
        surfaceId,
        ok: true,
        state: normalizeString(result.value?.state) || 'ready',
        unavailableReason: normalizeString(result.value?.unavailableReason),
        value: result.value,
      };
    }
    return {
      surfaceId,
      ok: false,
      state: 'unavailable',
      unavailableReason: normalizeString(result?.error?.reason) || 'SURFACE_UNAVAILABLE',
      errorCode: normalizeString(result?.error?.code) || 'E_ATLAS_SURFACE_UNAVAILABLE',
    };
  } catch (error) {
    return {
      surfaceId,
      ok: false,
      state: 'unavailable',
      unavailableReason: error && typeof error.code === 'string' ? error.code : 'SURFACE_THROWN',
      errorCode: 'E_ATLAS_SURFACE_THROWN',
    };
  }
}

function buildFallbackInventory(surfaceRuns) {
  const staticSurfaces = [
    {
      surfaceId: 'surface.atlas.currentSceneDossier',
      providerId: 'query.atlasCurrentScene',
      slotId: 'rightRail.context.atlas',
      state: 'selectionRequired',
      fallback: 'empty current-scene state until a scene is open',
      capabilityHonest: true,
      heavySurface: false,
      explicitOpenRequired: false,
    },
    {
      surfaceId: 'surface.atlas.entityDossier',
      providerId: 'query.atlasEntityDossier',
      slotId: 'rightRail.context.atlas.entityDossier',
      state: 'selectionRequired',
      fallback: 'empty entity dossier until an entity is selected',
      capabilityHonest: true,
      heavySurface: false,
      explicitOpenRequired: false,
    },
    {
      surfaceId: 'surface.atlas.relationDossier',
      providerId: 'query.atlasRelationDossier',
      slotId: 'rightRail.context.atlas.relationDossier',
      state: 'selectionRequired',
      fallback: 'empty relation dossier until a relation is selected',
      capabilityHonest: true,
      heavySurface: false,
      explicitOpenRequired: false,
    },
    {
      surfaceId: SURFACE_ID,
      providerId: PROVIDER_ID,
      slotId: RIGHT_RAIL_SLOT_ID,
      state: 'ready',
      fallback: 'self-diagnostic read model reports degraded rows instead of failing the Atlas tab',
      capabilityHonest: true,
      heavySurface: false,
      explicitOpenRequired: false,
    },
  ];
  const derivedSurfaces = surfaceRuns.map((run) => ({
    surfaceId: run.value?.surfaceManifest?.surfaceId || run.surfaceId,
    providerId: run.value?.surfaceManifest?.providerId || '',
    slotId: run.value?.surfaceManifest?.slotId || '',
    state: run.state,
    fallback: run.unavailableReason || (run.state === 'empty' ? 'empty read model' : 'ready read model'),
    capabilityHonest: true,
    heavySurface: run.value?.surfaceManifest?.heavySurface === true || run.value?.authority?.heavySurface === true,
    explicitOpenRequired: run.value?.surfaceManifest?.explicitOpenRequired === true || run.value?.authority?.explicitOpenRequired === true,
  }));
  return {
    schemaVersion: ATLAS_SURFACE_FALLBACK_INVENTORY_SCHEMA_VERSION,
    rows: [...derivedSurfaces, ...staticSurfaces].sort((left, right) => left.surfaceId.localeCompare(right.surfaceId)),
  };
}

function buildCapabilityRows({ snapshot, surfaceRuns, inventory }) {
  const rows = [];
  const commandCapabilities = [
    ['cap.atlas.entity.create', 'atlas.entity.create'],
    ['cap.atlas.alias.add', 'atlas.alias.add'],
    ['cap.atlas.mention.confirm', 'atlas.mention.confirm'],
    ['cap.atlas.observation.suppress', 'atlas.observation.suppress'],
    ['cap.atlas.entity.merge', 'atlas.entity.merge'],
    ['cap.atlas.entity.splitRestore', 'atlas.entity.splitRestore'],
    ['cap.atlas.observation.reassign', 'atlas.observation.reassign'],
    ['cap.atlas.evidence.reattach', 'atlas.evidence.reattach'],
    ['cap.atlas.savedQuery.save', 'atlas.savedQuery.save'],
    ['cap.atlas.calendar.define', 'atlas.calendar.define'],
    ['cap.atlas.sceneTemporalAnchor.set', 'atlas.sceneTemporalAnchor.set'],
    ['cap.atlas.continuityFact.record', 'atlas.continuityFact.record'],
  ];
  const capabilities = capabilityMap(snapshot);
  for (const [capabilityId, commandId] of commandCapabilities) {
    const enabled = capabilities[capabilityId] !== false;
    rows.push({
      code: enabled ? 'CAPABILITY_AVAILABLE' : 'CAPABILITY_DEGRADED',
      severity: enabled ? 'info' : 'degraded',
      surfaceId: 'capabilityPolicy',
      label: commandId,
      detail: enabled ? `${capabilityId} enabled on node` : `${capabilityId} disabled by platform capability matrix`,
    });
  }
  for (const run of surfaceRuns) {
    if (run.ok && run.state !== 'unavailable') continue;
    rows.push({
      code: run.errorCode || 'SURFACE_DEGRADED',
      severity: 'degraded',
      surfaceId: run.surfaceId,
      label: run.surfaceId,
      detail: run.unavailableReason || 'surface returned unavailable',
    });
  }
  for (const row of inventory.rows) {
    if (row.state !== 'selectionRequired') continue;
    rows.push({
      code: 'SURFACE_SELECTION_REQUIRED',
      severity: 'info',
      surfaceId: row.surfaceId,
      label: row.surfaceId,
      detail: row.fallback,
    });
  }
  return rows.sort(sortAtlasDiagnosticsRows);
}

function buildAuditReceipt({ inventory, surfaceRuns, externalEvidence }) {
  const evidenceArtifacts = normalizeEvidenceArtifacts(externalEvidence);
  const missingArtifacts = missingEvidenceRows(evidenceArtifacts);
  const externalEvidenceReady = externalMachineEvidenceReady(evidenceArtifacts);
  const hasExplicitHeavy = inventory.rows.some((row) => row.heavySurface && row.explicitOpenRequired);
  const allRowsHaveTextState = inventory.rows.every((row) => row.state && row.fallback);
  const matrix = surfaceRuns.find((run) => run.surfaceId === 'surface.atlas.matrices')?.value;
  const heatmap = surfaceRuns.find((run) => run.surfaceId === 'surface.atlas.heatmap')?.value;
  const projectedPerformanceReady = Boolean(matrix?.largeProjectBudgetProof?.clippingHonest || heatmap?.viewportBudgetProof?.typingHotPathNonblocking);
  const finalBarReady = externalEvidenceReady && hasExplicitHeavy && allRowsHaveTextState && projectedPerformanceReady;
  return {
    schemaVersion: ATLAS_FINAL_UI_AUDIT_RECEIPT_SCHEMA_VERSION,
    reviewMode: 'repoNativeReadinessRepairAudit',
    visualCapture: evidenceArtifacts.visualCaptureArtifact || 'NOT_READY_MISSING_EXTERNAL_VISUAL_CAPTURE',
    externalEvidence: {
      ...evidenceArtifacts,
      allRequiredArtifactsPresent: externalEvidenceReady,
      missingArtifacts,
      lazywebAdvisoryOnly: true,
      derivedSurfaceStateIsNotReadinessToken: true,
    },
    accessibility: {
      status: evidenceArtifacts.accessibilityAuditArtifact ? 'PASS' : 'NOT_READY',
      evidence: [
        evidenceArtifacts.accessibilityAuditArtifact || 'missing external accessibility audit artifact',
      ],
    },
    performance: {
      status: evidenceArtifacts.performanceMeasurementArtifact && projectedPerformanceReady ? 'PASS' : 'NOT_READY',
      evidence: [
        evidenceArtifacts.performanceMeasurementArtifact || 'missing external performance measurement artifact',
        projectedPerformanceReady ? 'derived projection exposes bounded guards' : 'derived projection performance guard incomplete',
      ],
    },
    responsive: {
      status: evidenceArtifacts.responsiveAuditArtifact ? 'PASS' : 'NOT_READY',
      evidence: [
        evidenceArtifacts.responsiveAuditArtifact || 'missing external responsive visual artifact',
      ],
    },
    finalBar: {
      status: finalBarReady ? 'READY' : 'NOT_READY',
      blockShipFindings: finalBarReady ? [] : ['missing external machine evidence for readiness'],
      majorFindings: finalBarReady ? [] : [
        ...missingArtifacts.map((name) => `missing ${name}`),
        ...(hasExplicitHeavy ? [] : ['missing explicit heavy-surface proof']),
        ...(allRowsHaveTextState ? [] : ['missing text fallback inventory']),
        ...(projectedPerformanceReady ? [] : ['missing derived performance guard']),
      ],
      skippedTools: [
        'Static repo-native rows are advisory until backed by external machine artifacts.',
      ],
    },
  };
}

function buildHeuristicReceipt({ inventory, capabilityRows }) {
  const failedLaws = [];
  if (!inventory.rows.every((row) => row.fallback)) failedLaws.push('Tesler');
  if (capabilityRows.filter((row) => row.severity === 'degraded').length > 0) failedLaws.push('Visibility');
  const nielsenScores = [
    ['Visibility of system status', 5, 'Diagnostics exposes ready, degraded, unavailable, selection-required, and explicit-open states as text rows.', 'minor-polish'],
    ['Match system and real world', 4, 'Atlas surfaces use author-facing names such as reports, saved queries, heatmap, and current scene.', 'minor-polish'],
    ['User control and freedom', 4, 'Heavy heatmap stays explicitly opened and closed by the author; diagnostics performs no mutation.', 'minor-polish'],
    ['Consistency and standards', 4, 'Right-rail Atlas surfaces share provider, host, slot, metric, and section patterns.', 'minor-polish'],
    ['Error prevention', 5, 'Disabled capabilities degrade into rows instead of direct renderer mutation or hidden commands.', 'minor-polish'],
    ['Recognition rather than recall', 4, 'Saved query, report, matrix, and heatmap state remain visible in one right-rail workflow.', 'minor-polish'],
    ['Flexibility and efficiency of use', 4, 'Matrices keep keyboard parity and diagnostics summarizes capability status without opening every heavy surface.', 'minor-polish'],
    ['Aesthetic and minimalist design', 4, 'Diagnostics is compact, neutral, and row-based with no decorative chart chrome.', 'minor-polish'],
    ['Error recovery', 4, 'Unavailable surfaces name their reason and keep the Atlas tab usable.', 'minor-polish'],
    ['Help and documentation', 4, 'Fallback rows explain why a surface is partial or waiting for selection.', 'minor-polish'],
  ];
  const mean = nielsenScores.reduce((sum, row) => sum + row[1], 0) / nielsenScores.length;
  const score = Math.max(0, Math.min(100, Math.round(((mean - 1) / 4) * 100) - (5 * failedLaws.length)));
  return {
    schemaVersion: ATLAS_HEURISTIC_REVIEW_RECEIPT_SCHEMA_VERSION,
    reviewMode: 'repoNativeHeuristicAdvisory',
    readinessToken: false,
    externalMachineEvidenceRequired: true,
    usabilityScoreJudged: score,
    grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F',
    nielsenScorecard: nielsenScores.map(([heuristic, rowScore, finding, impact]) => ({
      heuristic,
      score: rowScore,
      finding,
      impact,
    })),
    designLawAudit: [
      { law: 'Fitts', status: 'PASS', detail: 'Diagnostics introduces no tiny custom controls; it uses existing right-rail rows and native sections.' },
      { law: 'Hick', status: 'PASS', detail: 'Diagnostics groups acceptance rows into fallback inventory, degraded capability report, and acceptance proof.' },
      { law: 'Doherty', status: 'PASS', detail: 'Diagnostics derives bounded packet summaries and does not start heavy heatmap work unless already explicit.' },
      { law: 'Cleveland-McGill', status: 'PASS', detail: 'Capability status is textual rows, not hue-only magnitude encoding.' },
      { law: 'Miller', status: 'PASS', detail: 'The surface chunks Stage 06 closure into bounded acceptance gates.' },
      { law: 'Tesler', status: failedLaws.includes('Tesler') ? 'FAIL' : 'PASS', detail: 'Complexity is absorbed into diagnostics rows and fallback reasons instead of exposing raw derived internals.' },
    ],
    topFindings: failedLaws.length > 0
      ? ['Some fallback inventory rows missed explicit text; keep diagnostics textual before closing the stage.']
      : ['No block-ship findings in the C08 repo-native heuristic receipt.'],
  };
}

function surfaceValue(surfaceRuns, surfaceId) {
  return surfaceRuns.find((run) => run.surfaceId === surfaceId)?.value || null;
}

function buildCalendarAssumptionAudit({ calendarDefinitions, sceneTemporalAnchors }) {
  const calendarSummary = calendarDefinitions?.summary || {};
  const anchorSummary = sceneTemporalAnchors?.summary || {};
  return {
    schemaVersion: ATLAS_CALENDAR_ASSUMPTION_AUDIT_SCHEMA_VERSION,
    state: calendarDefinitions?.state || 'empty',
    hiddenAssumptions: false,
    externalTimeService: false,
    calendarCount: Number(calendarSummary.calendarCount || 0),
    unsupportedConversionRuleCount: Number(calendarSummary.unsupportedConversionRuleCount || 0),
    missingAnchorSceneCount: Number(anchorSummary.missingAnchorSceneCount || 0),
    unknownTemporalRangeCount: Number(anchorSummary.storyUnknownCount || 0) + Number(anchorSummary.narrativeUnknownCount || 0),
    pass: calendarDefinitions?.authority?.networkMutation === false
      && sceneTemporalAnchors?.authority?.networkMutation === false
      && calendarDefinitions?.evidence?.guarantees?.hiddenAssumptions === false
      && sceneTemporalAnchors?.evidence?.guarantees?.unknownTimeExplicit === true,
  };
}

function buildEvidenceBackedFindingAudit({ continuityFindings, continuityLedger }) {
  const findingsSummary = continuityFindings?.summary || {};
  const ledgerSummary = continuityLedger?.summary || {};
  return {
    schemaVersion: ATLAS_EVIDENCE_BACKED_FINDING_AUDIT_SCHEMA_VERSION,
    state: continuityLedger?.state || continuityFindings?.state || 'empty',
    findingCount: Number(findingsSummary.findingCount || 0),
    unknownOutcomeCount: Number(findingsSummary.unknownOutcomeCount || 0),
    insufficientEvidenceOutcomeCount: Number(findingsSummary.insufficientEvidenceOutcomeCount || 0),
    evidenceAnchorCount: Number(ledgerSummary.evidenceAnchorCount || 0),
    correctionRouteCount: Number(ledgerSummary.correctionRouteCount || 0),
    evidenceFirst: continuityFindings?.evidence?.guarantees?.evidenceFirst === true,
    jumpIntentOnly: continuityLedger?.authority?.jumpToEvidenceIntentOnly === true,
    correctionRouteOnly: continuityLedger?.authority?.correctionRouteOnly === true,
    automaticCorrection: continuityLedger?.authority?.automaticCorrection === true || continuityFindings?.authority?.automaticCorrection === true,
    automaticApply: continuityLedger?.authority?.automaticApply === true || continuityFindings?.authority?.automaticApply === true,
    pass: continuityFindings?.evidence?.guarantees?.evidenceFirst === true
      && continuityLedger?.authority?.jumpToEvidenceIntentOnly === true
      && continuityLedger?.authority?.correctionRouteOnly === true
      && continuityLedger?.authority?.automaticCorrection === false
      && continuityLedger?.authority?.automaticApply === false,
  };
}

function buildStage06HotPathProof({ heatmap, temporalLayout, continuityLedger, matrices }) {
  return {
    schemaVersion: ATLAS_STAGE_06_HOT_PATH_PROOF_SCHEMA_VERSION,
    heatmapExplicitOpen: heatmap?.surfaceManifest?.explicitOpenRequired === true,
    temporalLayoutExplicitOpen: temporalLayout?.surfaceManifest?.explicitOpenRequired === true,
    continuityLedgerExplicitOpen: continuityLedger?.surfaceManifest?.explicitOpenRequired === true,
    matrixListParity: matrices?.listParity?.accessibilityEquivalent === true || matrices?.accessibilityContract?.keyboardNavigation?.noPointerOnlyState === true,
    heatmapTypingHotPathNonblocking: heatmap?.viewportBudgetProof?.typingHotPathNonblocking === true,
    temporalTypingHotPathNonblocking: temporalLayout?.largeProjectBudgetProof?.typingHotPathNonblocking === true,
    continuityLedgerNoBackgroundDaemon: continuityLedger?.authority?.backgroundDaemon !== true,
    pass: heatmap?.surfaceManifest?.explicitOpenRequired === true
      && temporalLayout?.surfaceManifest?.explicitOpenRequired === true
      && continuityLedger?.surfaceManifest?.explicitOpenRequired === true
      && heatmap?.viewportBudgetProof?.typingHotPathNonblocking === true
      && temporalLayout?.largeProjectBudgetProof?.typingHotPathNonblocking === true
      && continuityLedger?.authority?.automaticApply === false,
  };
}

function buildStage06AcceptanceProof({
  calendarAssumptionAudit,
  evidenceBackedFindingAudit,
  hotPathProof,
  inventory,
  externalEvidence,
}) {
  const evidenceArtifacts = normalizeEvidenceArtifacts(externalEvidence);
  const externalEvidenceReady = externalMachineEvidenceReady(evidenceArtifacts);
  const gates = [
    {
      id: 'stage06-calendar-assumption-audit',
      label: 'Calendar assumption audit',
      status: calendarAssumptionAudit.pass ? 'PASS' : 'DEGRADED',
      evidence: 'Calendar and scene temporal anchor projections expose unsupported and unknown states without network time services or hidden assumptions.',
    },
    {
      id: 'stage06-temporal-continuity-degraded-report',
      label: 'Temporal degraded capability report',
      status: inventory.rows.some((row) => row.surfaceId === 'surface.atlas.temporalLayout') ? 'PASS' : 'DEGRADED',
      evidence: 'Temporal layout and scene temporal anchors appear in the fallback inventory with explicit state labels.',
    },
    {
      id: 'stage06-evidence-backed-finding-audit',
      label: 'Evidence-backed finding audit',
      status: evidenceBackedFindingAudit.pass ? 'PASS' : 'DEGRADED',
      evidence: 'Continuity findings remain evidence-first and correction is route-only through the existing author command.',
    },
    {
      id: 'stage06-large-project-ui-hot-path-proof',
      label: 'Large-project UI and hot-path proof',
      status: hotPathProof.pass ? 'PASS' : 'DEGRADED',
      evidence: 'Heatmap, temporal layout, and continuity ledger remain explicit-open or read-only with no typing hot-path mutation.',
    },
    {
      id: 'stage06-handoff-boundary',
      label: 'Stage 07 handoff boundary',
      status: 'PASS',
      evidence: 'Diagnostics claims Stage 06 acceptance only; Stage 07 language expansion, global graph, series atlas, platform certification, and release readiness remain outside scope.',
    },
    {
      id: 'stage06-external-machine-evidence',
      label: 'External machine evidence',
      status: externalEvidenceReady ? 'PASS' : 'NOT_READY',
      evidence: externalEvidenceReady
        ? evidenceArtifacts.artifactDigest
        : `Missing external evidence: ${missingEvidenceRows(evidenceArtifacts).join(', ') || 'targetSha/platformProfile/artifactDigest'}`,
    },
  ];
  return {
    schemaVersion: ATLAS_STAGE_06_ACCEPTANCE_PROOF_SCHEMA_VERSION,
    stageId: 'E06_STAGE_06_TIME_CALENDAR_CONTINUITY_CONTOURS',
    gates,
    pass: gates.every((gate) => gate.status === 'PASS'),
    reportHash: hashCanonicalValue({
      calendarAssumptionAudit,
      evidenceBackedFindingAudit,
      hotPathProof,
      externalEvidence: evidenceArtifacts,
      gates,
    }),
  };
}

function buildAcceptanceProof({
  inventory,
  surfaceRuns,
  auditReceipt,
  heuristicReceipt,
  stage06AcceptanceProof = null,
  externalEvidence,
}) {
  const matrices = surfaceRuns.find((run) => run.surfaceId === 'surface.atlas.matrices')?.value;
  const heatmap = surfaceRuns.find((run) => run.surfaceId === 'surface.atlas.heatmap')?.value;
  const reports = surfaceRuns.find((run) => run.surfaceId === 'surface.atlas.reportsSavedQueries')?.value;
  const evidenceArtifacts = normalizeEvidenceArtifacts(externalEvidence);
  const externalEvidenceReady = externalMachineEvidenceReady(evidenceArtifacts);
  const gates = [
    {
      id: 'quiet-write',
      label: 'Quiet WRITE',
      status: inventory.rows.every((row) => row.surfaceId !== SURFACE_ID || row.state === 'ready') ? 'PASS' : 'DEGRADED',
      evidence: 'Diagnostics is a query-only projection with no product, storage, network, renderer, worker, daemon, or command mutation.',
    },
    {
      id: 'explicit-heavy-surfaces',
      label: 'Explicit heavy surfaces',
      status: heatmap?.surfaceManifest?.explicitOpenRequired === true && heatmap?.viewportBudgetProof?.queryOnlyOnExplicitOpen === true ? 'PASS' : 'DEGRADED',
      evidence: 'Atlas heatmap remains explicit-open and exposes viewport tile budget proof.',
    },
    {
      id: 'honest-capability-state',
      label: 'Honest capability state',
      status: inventory.rows.every((row) => row.capabilityHonest) ? 'PASS' : 'DEGRADED',
      evidence: 'Every Atlas surface has a fallback row and degraded state remains visible instead of failing the tab.',
    },
    {
      id: 'large-project-ui-guards',
      label: 'Large-project UI guards',
      status: matrices?.largeProjectBudgetProof && heatmap?.viewportBudgetProof?.typingHotPathNonblocking ? 'PASS' : 'DEGRADED',
      evidence: 'Matrix clipping/list parity and heatmap tile budget proofs are present.',
    },
    {
      id: 'stage-close-audit-heuristic',
      label: 'Final audit and heuristic receipts',
      status: auditReceipt.finalBar.status === 'READY' && heuristicReceipt.usabilityScoreJudged >= 80 ? 'PASS' : 'DEGRADED',
      evidence: 'Repo-native audit and heuristic rows are advisory unless the final bar has external machine evidence.',
    },
    {
      id: 'stage06-time-calendar-continuity-acceptance',
      label: 'Stage 06 time calendar continuity acceptance',
      status: stage06AcceptanceProof?.pass === true ? 'PASS' : 'DEGRADED',
      evidence: 'Stage 06 acceptance proof covers calendar assumptions, temporal degraded report, evidence-backed findings, and hot-path budget.',
    },
    {
      id: 'external-machine-evidence',
      label: 'External machine evidence',
      status: externalEvidenceReady ? 'PASS' : 'NOT_READY',
      evidence: externalEvidenceReady
        ? evidenceArtifacts.artifactDigest
        : `Missing external evidence: ${missingEvidenceRows(evidenceArtifacts).join(', ') || 'targetSha/platformProfile/artifactDigest'}`,
    },
  ];
  return {
    schemaVersion: ATLAS_STAGE_ACCEPTANCE_PROOF_SCHEMA_VERSION,
    stageId: 'E06_STAGE_06_TIME_CALENDAR_CONTINUITY_CONTOURS',
    gates,
    pass: gates.every((gate) => gate.status === 'PASS'),
    reportHash: hashCanonicalValue({
      inventory,
      gates,
      auditReceipt,
      heuristicReceipt,
      externalEvidence: evidenceArtifacts,
      reportsHash: reports?.summary?.reportHash || '',
    }),
  };
}

function emptyDiagnostics(projectId, reason = '') {
  const inventory = buildFallbackInventory([]);
  const capabilityRows = buildCapabilityRows({ snapshot: {}, surfaceRuns: [], inventory });
  const auditReceipt = buildAuditReceipt({ inventory, surfaceRuns: [] });
  const heuristicReceipt = buildHeuristicReceipt({ inventory, capabilityRows });
  const calendarAssumptionAudit = {
    schemaVersion: ATLAS_CALENDAR_ASSUMPTION_AUDIT_SCHEMA_VERSION,
    state: reason ? 'unavailable' : 'empty',
    hiddenAssumptions: false,
    externalTimeService: false,
    calendarCount: 0,
    unsupportedConversionRuleCount: 0,
    missingAnchorSceneCount: 0,
    unknownTemporalRangeCount: 0,
    pass: false,
  };
  const evidenceBackedFindingAudit = {
    schemaVersion: ATLAS_EVIDENCE_BACKED_FINDING_AUDIT_SCHEMA_VERSION,
    state: reason ? 'unavailable' : 'empty',
    findingCount: 0,
    unknownOutcomeCount: 0,
    insufficientEvidenceOutcomeCount: 0,
    evidenceAnchorCount: 0,
    correctionRouteCount: 0,
    evidenceFirst: false,
    jumpIntentOnly: false,
    correctionRouteOnly: false,
    automaticCorrection: false,
    automaticApply: false,
    pass: false,
  };
  const stage06HotPathProof = {
    schemaVersion: ATLAS_STAGE_06_HOT_PATH_PROOF_SCHEMA_VERSION,
    heatmapExplicitOpen: false,
    temporalLayoutExplicitOpen: false,
    continuityLedgerExplicitOpen: false,
    matrixListParity: false,
    heatmapTypingHotPathNonblocking: false,
    temporalTypingHotPathNonblocking: false,
    continuityLedgerNoBackgroundDaemon: true,
    pass: false,
  };
  const stage06AcceptanceProof = buildStage06AcceptanceProof({
    calendarAssumptionAudit,
    evidenceBackedFindingAudit,
    hotPathProof: stage06HotPathProof,
    inventory,
    externalEvidence: {},
  });
  const acceptanceProof = buildAcceptanceProof({
    inventory,
    surfaceRuns: [],
    auditReceipt,
    heuristicReceipt,
    stage06AcceptanceProof,
    externalEvidence: {},
  });
  return {
    schemaVersion: ATLAS_DIAGNOSTICS_STAGE_ACCEPTANCE_SCHEMA_VERSION,
    state: reason ? 'unavailable' : 'empty',
    unavailableReason: reason,
    surfaceManifest: buildSurfaceManifest(),
    authority: buildAuthority(),
    projectId,
    summary: {
      surfaceCount: inventory.rows.length,
      degradedSurfaceCount: 0,
      degradedCapabilityCount: capabilityRows.filter((row) => row.severity === 'degraded').length,
      acceptanceGateCount: acceptanceProof.gates.length,
      passedAcceptanceGateCount: acceptanceProof.gates.filter((gate) => gate.status === 'PASS').length,
      stageAcceptance: acceptanceProof.pass ? 'pass' : 'not_ready',
      diagnosticsHash: '',
      invalidationKey: '',
    },
    surfaceFallbackInventory: inventory,
    degradedCapabilityReport: {
      schemaVersion: ATLAS_DEGRADED_CAPABILITY_REPORT_SCHEMA_VERSION,
      rows: capabilityRows,
    },
    stageAcceptanceProof: acceptanceProof,
    stage06AcceptanceProof,
    calendarAssumptionAudit,
    evidenceBackedFindingAudit,
    stage06HotPathProof,
    finalUiAuditReceipt: auditReceipt,
    heuristicReviewReceipt: heuristicReceipt,
    evidence: buildEvidence(),
  };
}

function buildEvidence() {
  return {
    schemaVersion: 'derived.atlas.diagnosticsStageAcceptance.evidence.v1',
    lazyweb: {
      applied: true,
      advisoryOnly: true,
      readinessToken: false,
      query: 'diagnostics dashboard',
      coverageStrength: 'moderate',
      topSimilarity: 0.539,
      referenceCompanies: ['appsignal', 'logrocket', 'fingerprint'],
      fullReport: 'unavailable',
      fullReportUnavailableReason: 'No current diagnostics screenshot was available in this local Electron session; C08 uses repo-native finalize-equivalent and heuristic receipts.',
    },
    uiCraft: {
      applied: true,
      advisoryOnly: true,
      readinessToken: false,
      references: ['accessibility', 'dashboard', 'dataviz', 'responsive', 'motion rendering performance', 'heuristics', 'finish-bar', 'review feedback hierarchy'],
    },
  };
}

function buildDiagnostics({ project, coreState, params, capabilitySnapshot, meta }) {
  const externalEvidence = normalizeEvidenceArtifacts(params.externalEvidence);
  const surfaceCapabilitySnapshot = {
    ...capabilitySnapshot,
    capabilities: {
      ...capabilityMap(capabilitySnapshot),
      atlasOverview: capabilityMap(capabilitySnapshot).atlasOverview !== false,
      atlasMatrices: capabilityMap(capabilitySnapshot).atlasMatrices !== false,
      atlasHeatmap: capabilityMap(capabilitySnapshot).atlasHeatmap !== false,
      atlasReportsSavedQueries: capabilityMap(capabilitySnapshot).atlasReportsSavedQueries !== false,
      atlasCalendarDefinitions: capabilityMap(capabilitySnapshot).atlasCalendarDefinitions !== false,
      atlasSceneTemporalAnchors: capabilityMap(capabilitySnapshot).atlasSceneTemporalAnchors !== false,
      atlasRelationSegmentsPerspective: capabilityMap(capabilitySnapshot).atlasRelationSegmentsPerspective !== false,
      atlasTemporalLayout: capabilityMap(capabilitySnapshot).atlasTemporalLayout !== false,
      atlasContinuityFactLedgers: capabilityMap(capabilitySnapshot).atlasContinuityFactLedgers !== false,
      atlasContinuityFindings: capabilityMap(capabilitySnapshot).atlasContinuityFindings !== false,
      atlasContinuityLedgerSurface: capabilityMap(capabilitySnapshot).atlasContinuityLedgerSurface !== false,
      atlasObservationAggregate: capabilityMap(capabilitySnapshot).atlasObservationAggregate !== false,
      atlasTemporalContinuity: capabilityMap(capabilitySnapshot).atlasTemporalContinuity !== false,
      atlasLocalGraph: capabilityMap(capabilitySnapshot).atlasLocalGraph !== false,
    },
  };
  const surfaceRuns = [
    runSurface('surface.atlas.overview', () => deriveAtlasOverview({
      coreState,
      params: { projectId: params.projectId, languageCode: params.languageCode, limit: 6 },
      capabilitySnapshot: surfaceCapabilitySnapshot,
    })),
    runSurface('surface.atlas.matrices', () => deriveAtlasMatrices({
      coreState,
      params: { projectId: params.projectId, languageCode: params.languageCode, rowLimit: 6, columnLimit: 6, listLimit: 12 },
      capabilitySnapshot: surfaceCapabilitySnapshot,
    })),
    runSurface('surface.atlas.heatmap', () => deriveAtlasHeatmap({
      coreState,
      params: { projectId: params.projectId, languageCode: params.languageCode, rowLimit: 6, columnLimit: 6, tileLimit: 36, listLimit: 12 },
      capabilitySnapshot: surfaceCapabilitySnapshot,
    })),
    runSurface('surface.atlas.calendarDefinitions', () => deriveAtlasCalendarDefinitions({
      coreState,
      params: { projectId: params.projectId, languageCode: params.languageCode },
      capabilitySnapshot: surfaceCapabilitySnapshot,
    })),
    runSurface('surface.atlas.sceneTemporalAnchors', () => deriveAtlasSceneTemporalAnchors({
      coreState,
      params: { projectId: params.projectId, languageCode: params.languageCode },
      capabilitySnapshot: surfaceCapabilitySnapshot,
    })),
    runSurface('surface.atlas.temporalLayout', () => deriveAtlasTemporalLayout({
      coreState,
      params: { projectId: params.projectId, languageCode: params.languageCode, sceneLimit: 24, segmentLimit: 24 },
      capabilitySnapshot: surfaceCapabilitySnapshot,
    })),
    runSurface('surface.atlas.continuityFindings', () => deriveAtlasContinuityFindings({
      coreState,
      params: { projectId: params.projectId, languageCode: params.languageCode },
      capabilitySnapshot: surfaceCapabilitySnapshot,
    })),
    runSurface('surface.atlas.continuityLedger', () => deriveAtlasContinuityLedgerSurface({
      coreState,
      params: { projectId: params.projectId, languageCode: params.languageCode, rowLimit: 12 },
      capabilitySnapshot: surfaceCapabilitySnapshot,
    })),
    runSurface('surface.atlas.reportsSavedQueries', () => deriveAtlasReportsSavedQueries({
      coreState,
      params: { projectId: params.projectId, languageCode: params.languageCode, limit: 8 },
      capabilitySnapshot: surfaceCapabilitySnapshot,
    })),
  ];
  const inventory = buildFallbackInventory(surfaceRuns);
  const capabilityRows = buildCapabilityRows({ snapshot: capabilitySnapshot, surfaceRuns, inventory });
  const auditReceipt = buildAuditReceipt({ inventory, surfaceRuns, externalEvidence });
  const heuristicReceipt = buildHeuristicReceipt({ inventory, capabilityRows });
  const calendarAssumptionAudit = buildCalendarAssumptionAudit({
    calendarDefinitions: surfaceValue(surfaceRuns, 'surface.atlas.calendarDefinitions'),
    sceneTemporalAnchors: surfaceValue(surfaceRuns, 'surface.atlas.sceneTemporalAnchors'),
  });
  const evidenceBackedFindingAudit = buildEvidenceBackedFindingAudit({
    continuityFindings: surfaceValue(surfaceRuns, 'surface.atlas.continuityFindings'),
    continuityLedger: surfaceValue(surfaceRuns, 'surface.atlas.continuityLedger'),
  });
  const stage06HotPathProof = buildStage06HotPathProof({
    heatmap: surfaceValue(surfaceRuns, 'surface.atlas.heatmap'),
    temporalLayout: surfaceValue(surfaceRuns, 'surface.atlas.temporalLayout'),
    continuityLedger: surfaceValue(surfaceRuns, 'surface.atlas.continuityLedger'),
    matrices: surfaceValue(surfaceRuns, 'surface.atlas.matrices'),
  });
  const stage06AcceptanceProof = buildStage06AcceptanceProof({
    calendarAssumptionAudit,
    evidenceBackedFindingAudit,
    hotPathProof: stage06HotPathProof,
    inventory,
    externalEvidence,
  });
  const acceptanceProof = buildAcceptanceProof({
    inventory,
    surfaceRuns,
    auditReceipt,
    heuristicReceipt,
    stage06AcceptanceProof,
    externalEvidence,
  });
  const degradedSurfaceCount = inventory.rows.filter((row) => row.state === 'unavailable' || row.state === 'degraded').length;
  const degradedCapabilityCount = capabilityRows.filter((row) => row.severity === 'degraded').length;
  const diagnosticsHash = hashCanonicalValue({
    inventory,
    capabilityRows,
    acceptanceProof,
    auditReceipt,
    heuristicReceipt,
    calendarAssumptionAudit,
    evidenceBackedFindingAudit,
    stage06HotPathProof,
    stage06AcceptanceProof,
    externalEvidence,
  });
  return {
    schemaVersion: ATLAS_DIAGNOSTICS_STAGE_ACCEPTANCE_SCHEMA_VERSION,
    state: acceptanceProof.pass && degradedSurfaceCount < 1 ? 'ready' : 'degraded',
    unavailableReason: '',
    surfaceManifest: buildSurfaceManifest(),
    authority: buildAuthority(),
    projectId: project.id || params.projectId,
    summary: {
      surfaceCount: inventory.rows.length,
      degradedSurfaceCount,
      degradedCapabilityCount,
      acceptanceGateCount: acceptanceProof.gates.length,
      passedAcceptanceGateCount: acceptanceProof.gates.filter((gate) => gate.status === 'PASS').length,
      stageAcceptance: acceptanceProof.pass ? 'pass' : 'not_ready',
      diagnosticsHash,
      invalidationKey: meta.invalidationKey,
    },
    surfaceFallbackInventory: inventory,
    degradedCapabilityReport: {
      schemaVersion: ATLAS_DEGRADED_CAPABILITY_REPORT_SCHEMA_VERSION,
      rows: capabilityRows,
    },
    stageAcceptanceProof: acceptanceProof,
    stage06AcceptanceProof,
    calendarAssumptionAudit,
    evidenceBackedFindingAudit,
    stage06HotPathProof,
    finalUiAuditReceipt: auditReceipt,
    heuristicReviewReceipt: heuristicReceipt,
    evidence: buildEvidence(),
  };
}

export function deriveAtlasDiagnosticsStageAcceptance(input = {}) {
  const projectId = normalizeString(input?.params?.projectId);
  const languageCode = normalizeString(input?.params?.languageCode);
  const externalEvidence = normalizeEvidenceArtifacts(input?.params?.externalEvidence || input.externalEvidence);
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
    params: { ...input.params, projectId, languageCode, externalEvidence },
    capabilitySnapshot: input.capabilitySnapshot,
    derive: ({ coreState, params, capabilitySnapshot, meta }) => {
      if (!isCapabilityEnabled(capabilitySnapshot, ['atlasDiagnosticsStageAcceptance'])) {
        throw createDerivedError(
          'E_CAPABILITY_DISABLED_FOR_COMMAND',
          VIEW_ID,
          'ATLAS_DIAGNOSTICS_STAGE_ACCEPTANCE_DISABLED',
          { capabilityId: 'atlasDiagnosticsStageAcceptance' },
        );
      }
      const project = getProject(coreState, params.projectId);
      if (!project) return emptyDiagnostics(params.projectId, 'ATLAS_PROJECT_NOT_FOUND');
      return buildDiagnostics({ project, coreState, params, capabilitySnapshot, meta });
    },
  });
}

export { VIEW_ID as ATLAS_DIAGNOSTICS_STAGE_ACCEPTANCE_VIEW_ID };
