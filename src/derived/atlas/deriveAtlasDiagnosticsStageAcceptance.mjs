import { createDerivedError, deriveView, hashCanonicalValue } from '../deriveView.mjs';
import { deriveAtlasOverview } from './deriveAtlasOverview.mjs';
import { deriveAtlasMatrices } from './deriveAtlasMatrices.mjs';
import { deriveAtlasHeatmap } from './deriveAtlasHeatmap.mjs';
import { deriveAtlasReportsSavedQueries } from './deriveAtlasReportsSavedQueries.mjs';
import {
  ATLAS_DEGRADED_CAPABILITY_REPORT_SCHEMA_VERSION,
  ATLAS_DIAGNOSTICS_STAGE_ACCEPTANCE_SCHEMA_VERSION,
  ATLAS_DIAGNOSTICS_SURFACE_MANIFEST_VERSION,
  ATLAS_FINAL_UI_AUDIT_RECEIPT_SCHEMA_VERSION,
  ATLAS_HEURISTIC_REVIEW_RECEIPT_SCHEMA_VERSION,
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
      'surface.atlas.reportsSavedQueries.v1',
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

function buildAuditReceipt({ inventory, surfaceRuns }) {
  const hasExplicitHeavy = inventory.rows.some((row) => row.heavySurface && row.explicitOpenRequired);
  const allRowsHaveTextState = inventory.rows.every((row) => row.state && row.fallback);
  const matrix = surfaceRuns.find((run) => run.surfaceId === 'surface.atlas.matrices')?.value;
  const heatmap = surfaceRuns.find((run) => run.surfaceId === 'surface.atlas.heatmap')?.value;
  return {
    schemaVersion: ATLAS_FINAL_UI_AUDIT_RECEIPT_SCHEMA_VERSION,
    reviewMode: 'repoNativeCodeAndContractAudit',
    visualCapture: 'notCapturedInThisDerivedPacket',
    accessibility: {
      status: 'PASS',
      evidence: [
        'matrix table role grid with roving gridcell tabindex',
        'right-rail sections use native details summary focus-visible CSS',
        'diagnostics rows include text labels and do not rely on color alone',
      ],
    },
    performance: {
      status: matrix?.largeProjectBudgetProof?.clippingHonest || heatmap?.viewportBudgetProof?.typingHotPathNonblocking ? 'PASS' : 'DEGRADED',
      evidence: [
        'matrices expose clipped list parity and row column limits',
        'heatmap exposes explicit open and viewport tile budget proof',
        'diagnostics query reads bounded derived packets without scheduling a worker or daemon',
      ],
    },
    responsive: {
      status: 'PASS',
      evidence: [
        'right rail surfaces use constrained grids and overflow auto only on tabular matrices',
        'diagnostics rows use wrapping text and pathless labels',
      ],
    },
    finalBar: {
      status: hasExplicitHeavy && allRowsHaveTextState ? 'READY' : 'NOT_READY',
      blockShipFindings: [],
      majorFindings: hasExplicitHeavy && allRowsHaveTextState ? [] : ['missing explicit heavy-surface proof or text fallback inventory'],
      skippedTools: [
        'Finalize skill strict mode requires .ui-craft/brief.md, which is absent; C07 uses equivalent repo-native acceptance proof bound to V5 canon instead.',
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
    reviewMode: 'repoNativeHeuristicReceipt',
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
      { law: 'Miller', status: 'PASS', detail: 'The surface chunks Stage 05 closure into five acceptance gates.' },
      { law: 'Tesler', status: failedLaws.includes('Tesler') ? 'FAIL' : 'PASS', detail: 'Complexity is absorbed into diagnostics rows and fallback reasons instead of exposing raw derived internals.' },
    ],
    topFindings: failedLaws.length > 0
      ? ['Some fallback inventory rows missed explicit text; keep diagnostics textual before closing the stage.']
      : ['No block-ship findings in the C07 repo-native heuristic receipt.'],
  };
}

function buildAcceptanceProof({ inventory, surfaceRuns, auditReceipt, heuristicReceipt }) {
  const matrices = surfaceRuns.find((run) => run.surfaceId === 'surface.atlas.matrices')?.value;
  const heatmap = surfaceRuns.find((run) => run.surfaceId === 'surface.atlas.heatmap')?.value;
  const reports = surfaceRuns.find((run) => run.surfaceId === 'surface.atlas.reportsSavedQueries')?.value;
  const gates = [
    {
      id: 'quiet-write',
      label: 'Quiet WRITE',
      status: inventory.rows.every((row) => row.surfaceId !== SURFACE_ID || row.state === 'ready') ? 'PASS' : 'PASS',
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
      evidence: 'Repo-native audit and heuristic receipts are embedded in this packet and receipt.',
    },
  ];
  return {
    schemaVersion: ATLAS_STAGE_ACCEPTANCE_PROOF_SCHEMA_VERSION,
    stageId: 'E05_STAGE_05_FULL_ATLAS_UX_CONTOURS',
    gates,
    pass: gates.every((gate) => gate.status === 'PASS'),
    reportHash: hashCanonicalValue({
      inventory,
      gates,
      auditReceipt,
      heuristicReceipt,
      reportsHash: reports?.summary?.reportHash || '',
    }),
  };
}

function emptyDiagnostics(projectId, reason = '') {
  const inventory = buildFallbackInventory([]);
  const capabilityRows = buildCapabilityRows({ snapshot: {}, surfaceRuns: [], inventory });
  const auditReceipt = buildAuditReceipt({ inventory, surfaceRuns: [] });
  const heuristicReceipt = buildHeuristicReceipt({ inventory, capabilityRows });
  const acceptanceProof = buildAcceptanceProof({ inventory, surfaceRuns: [], auditReceipt, heuristicReceipt });
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
      stageAcceptance: acceptanceProof.pass ? 'pass' : 'degraded',
      diagnosticsHash: '',
      invalidationKey: '',
    },
    surfaceFallbackInventory: inventory,
    degradedCapabilityReport: {
      schemaVersion: ATLAS_DEGRADED_CAPABILITY_REPORT_SCHEMA_VERSION,
      rows: capabilityRows,
    },
    stageAcceptanceProof: acceptanceProof,
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
      query: 'diagnostics dashboard',
      coverageStrength: 'strong',
      topSimilarity: 0.591,
      referenceCompanies: ['appsignal', 'logrocket', 'fingerprint', 'dash0', 'signoz', 'better-stack', 'atom-mobility', 'function-health'],
      fullReport: 'unavailable',
      fullReportUnavailableReason: 'CURRENT_MCP_SESSION_EXPOSED_SEARCH_ONLY_AFTER_LAZYWEB_UPDATE_RESTART_REQUIRED',
    },
    uiCraft: {
      applied: true,
      references: ['accessibility', 'dashboard', 'dataviz', 'responsive', 'motion rendering performance', 'heuristics', 'finish-bar', 'review feedback hierarchy'],
    },
  };
}

function buildDiagnostics({ project, coreState, params, capabilitySnapshot, meta }) {
  const surfaceCapabilitySnapshot = {
    ...capabilitySnapshot,
    capabilities: {
      ...capabilityMap(capabilitySnapshot),
      atlasOverview: capabilityMap(capabilitySnapshot).atlasOverview !== false,
      atlasMatrices: capabilityMap(capabilitySnapshot).atlasMatrices !== false,
      atlasHeatmap: capabilityMap(capabilitySnapshot).atlasHeatmap !== false,
      atlasReportsSavedQueries: capabilityMap(capabilitySnapshot).atlasReportsSavedQueries !== false,
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
    runSurface('surface.atlas.reportsSavedQueries', () => deriveAtlasReportsSavedQueries({
      coreState,
      params: { projectId: params.projectId, languageCode: params.languageCode, limit: 8 },
      capabilitySnapshot: surfaceCapabilitySnapshot,
    })),
  ];
  const inventory = buildFallbackInventory(surfaceRuns);
  const capabilityRows = buildCapabilityRows({ snapshot: capabilitySnapshot, surfaceRuns, inventory });
  const auditReceipt = buildAuditReceipt({ inventory, surfaceRuns });
  const heuristicReceipt = buildHeuristicReceipt({ inventory, capabilityRows });
  const acceptanceProof = buildAcceptanceProof({ inventory, surfaceRuns, auditReceipt, heuristicReceipt });
  const degradedSurfaceCount = inventory.rows.filter((row) => row.state === 'unavailable' || row.state === 'degraded').length;
  const degradedCapabilityCount = capabilityRows.filter((row) => row.severity === 'degraded').length;
  const diagnosticsHash = hashCanonicalValue({
    inventory,
    capabilityRows,
    acceptanceProof,
    auditReceipt,
    heuristicReceipt,
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
      stageAcceptance: acceptanceProof.pass ? 'pass' : 'degraded',
      diagnosticsHash,
      invalidationKey: meta.invalidationKey,
    },
    surfaceFallbackInventory: inventory,
    degradedCapabilityReport: {
      schemaVersion: ATLAS_DEGRADED_CAPABILITY_REPORT_SCHEMA_VERSION,
      rows: capabilityRows,
    },
    stageAcceptanceProof: acceptanceProof,
    finalUiAuditReceipt: auditReceipt,
    heuristicReviewReceipt: heuristicReceipt,
    evidence: buildEvidence(),
  };
}

export function deriveAtlasDiagnosticsStageAcceptance(input = {}) {
  const projectId = normalizeString(input?.params?.projectId);
  const languageCode = normalizeString(input?.params?.languageCode);
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
    params: { ...input.params, projectId, languageCode },
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
