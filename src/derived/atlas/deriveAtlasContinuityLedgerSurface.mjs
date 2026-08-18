import { createDerivedError, deriveView, hashCanonicalValue } from '../deriveView.mjs';
import { deriveAtlasContinuityFactLedgers } from './deriveAtlasContinuityFactLedgers.mjs';
import { deriveAtlasContinuityFindings } from './deriveAtlasContinuityFindings.mjs';
import { requireAtlasSceneOrder } from './atlasSceneOrder.mjs';
import {
  ATLAS_CONTINUITY_LEDGER_CORRECTION_ROUTE_SCHEMA_VERSION,
  ATLAS_CONTINUITY_LEDGER_EVIDENCE_ROW_SCHEMA_VERSION,
  ATLAS_CONTINUITY_LEDGER_JUMP_INTENT_SCHEMA_VERSION,
  ATLAS_CONTINUITY_LEDGER_KEYBOARD_CONTRACT_SCHEMA_VERSION,
  ATLAS_CONTINUITY_LEDGER_LIST_PARITY_SCHEMA_VERSION,
  ATLAS_CONTINUITY_LEDGER_ROW_SCHEMA_VERSION,
  ATLAS_CONTINUITY_LEDGER_SURFACE_MANIFEST_VERSION,
  ATLAS_CONTINUITY_LEDGER_SURFACE_SCHEMA_VERSION,
  sortAtlasContinuityLedgerEvidenceRows,
  sortAtlasContinuityLedgerRows,
} from './atlasContinuityLedgerSurfaceTypes.mjs';

const VIEW_ID = 'derived.atlas.continuityLedgerSurface.v1';
const PROVIDER_ID = 'query.atlasContinuityLedgerSurface';
const SURFACE_ID = 'surface.atlas.continuityLedger';
const RIGHT_RAIL_SLOT_ID = 'rightRail.context.atlas.continuityLedger';
const CORRECTION_COMMAND_ID = 'atlas.continuityFact.record';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function uniqueSorted(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(normalizeString).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'variant' }));
}

function getProject(coreState, projectId) {
  const projects = isPlainObject(coreState?.data?.projects) ? coreState.data.projects : {};
  return isPlainObject(projects[projectId]) ? projects[projectId] : null;
}

function buildSceneOrdinalIndex(project) {
  return new Map(requireAtlasSceneOrder(project, VIEW_ID)
    .map((scene) => [scene.sceneId, scene.sceneOrdinal]));
}

function sceneOrdinal(sceneOrdinalById, sceneId) {
  const ordinal = sceneOrdinalById.get(sceneId);
  return Number.isSafeInteger(ordinal) ? ordinal : 0;
}

function sceneIdsInNarrativeOrder(sceneOrdinalById, values) {
  return uniqueSorted(values).sort((left, right) => {
    const ordinal = sceneOrdinal(sceneOrdinalById, left) - sceneOrdinal(sceneOrdinalById, right);
    if (ordinal !== 0) return ordinal;
    return left.localeCompare(right, 'en', { sensitivity: 'variant' });
  });
}

function isCapabilityEnabled(snapshot) {
  if (!isPlainObject(snapshot)) return true;
  if (snapshot['atlas.continuityLedgerSurface'] === false) return false;
  const capabilities = isPlainObject(snapshot.capabilities) ? snapshot.capabilities : {};
  if (capabilities['atlas.continuityLedgerSurface'] === false) return false;
  if (capabilities.atlasContinuityLedgerSurface === false) return false;
  if (isPlainObject(capabilities.atlas) && capabilities.atlas.continuityLedgerSurface === false) return false;
  return true;
}

function buildSurfaceManifest() {
  return {
    schemaVersion: ATLAS_CONTINUITY_LEDGER_SURFACE_MANIFEST_VERSION,
    surfaceId: SURFACE_ID,
    providerId: PROVIDER_ID,
    host: 'rightRail',
    slotId: RIGHT_RAIL_SLOT_ID,
    contributionKind: 'readOnlyProjectionWithCommandRouteDisclosure',
    commandAuthority: 'CommandKernel',
    commandIds: [CORRECTION_COMMAND_ID],
    productMutation: false,
    manuscriptMutation: false,
    storageAuthority: false,
    heavySurface: true,
    explicitOpenRequired: true,
    fallback: {
      empty: 'ATLAS_CONTINUITY_LEDGER_EMPTY',
      degraded: 'ATLAS_CONTINUITY_LEDGER_DEGRADED',
      unavailable: 'ATLAS_CONTINUITY_LEDGER_UNAVAILABLE',
    },
  };
}

function buildAuthority() {
  return {
    sourceOfTruth: [
      'derived.atlas.continuityFindings.v1',
      'derived.atlas.continuityFactLedgers.v1',
    ],
    readModelOnly: true,
    commandAuthority: 'CommandKernel',
    commandIds: [CORRECTION_COMMAND_ID],
    correctionRouteOnly: true,
    projectTruthMutation: false,
    manuscriptMutation: false,
    storageMutation: false,
    networkMutation: false,
    rendererMutation: false,
    automaticCorrection: false,
    automaticApply: false,
    crossSceneApply: false,
    hiddenMutation: false,
    jumpToEvidenceIntentOnly: true,
  };
}

function severityRank(severity) {
  if (severity === 'error') return '0-error';
  if (severity === 'warning') return '1-warning';
  return '2-info';
}

function buildCorrectionRoute(row, factIds) {
  return {
    schemaVersion: ATLAS_CONTINUITY_LEDGER_CORRECTION_ROUTE_SCHEMA_VERSION,
    routeId: `atlas-continuity-correction-route:${hashCanonicalValue({ rowId: row.id, factIds })}`,
    rowId: row.id,
    label: 'Review continuity fact',
    commandId: CORRECTION_COMMAND_ID,
    commandAuthority: 'CommandKernel',
    intentOnly: true,
    automaticCorrection: false,
    automaticApply: false,
    manuscriptMutation: false,
    crossSceneApply: false,
    requiresEvidenceAnchor: true,
    factIds,
  };
}

function buildEvidenceRow({ rowId, fact, sceneOrdinalById }) {
  const anchor = isPlainObject(fact?.evidenceAnchor) ? fact.evidenceAnchor : {};
  const startOffset = Number.isSafeInteger(Number(anchor.startOffset)) ? Number(anchor.startOffset) : 0;
  const endOffset = Number.isSafeInteger(Number(anchor.endOffset)) ? Number(anchor.endOffset) : startOffset;
  const sceneId = normalizeString(anchor.sceneId || fact.sceneId);
  const quote = typeof anchor.quote === 'string' ? anchor.quote : '';
  return {
    schemaVersion: ATLAS_CONTINUITY_LEDGER_EVIDENCE_ROW_SCHEMA_VERSION,
    rowId,
    factId: normalizeString(fact.id),
    ledgerKind: normalizeString(fact.ledgerKind),
    anchorId: normalizeString(anchor.anchorId),
    sceneId,
    sceneOrdinal: sceneOrdinal(sceneOrdinalById, sceneId),
    subjectEntityId: normalizeString(fact.subjectEntityId),
    quote,
    startOffset,
    endOffset,
    evidenceState: normalizeString(fact.evidenceState) || 'unknown',
    jumpIntent: {
      schemaVersion: ATLAS_CONTINUITY_LEDGER_JUMP_INTENT_SCHEMA_VERSION,
      intentId: `atlas-continuity-jump:${hashCanonicalValue({ rowId, anchorId: anchor.anchorId, sceneId, startOffset, endOffset })}`,
      intentKind: 'jumpToEvidence',
      commandId: 'none',
      productMutation: false,
      manuscriptMutation: false,
      selectionOnly: true,
      currentSceneOnly: true,
      target: {
        sceneId,
        anchorId: normalizeString(anchor.anchorId),
        startOffset,
        endOffset,
        quoteHash: normalizeString(anchor.quoteHash),
        sceneTextHash: normalizeString(anchor.sceneTextHash),
      },
    },
  };
}

function makeRow({ source, rowKind, sceneOrdinalById, factsById }) {
  const factIds = uniqueSorted(rowKind === 'finding' ? source.factIds : [source.factId]);
  const evidenceRows = sortAtlasContinuityLedgerEvidenceRows(
    factIds
      .map((factId) => factsById.get(factId))
      .filter(isPlainObject)
      .map((fact) => buildEvidenceRow({ rowId: source.id, fact, sceneOrdinalById })),
  );
  const row = {
    schemaVersion: ATLAS_CONTINUITY_LEDGER_ROW_SCHEMA_VERSION,
    id: normalizeString(source.id),
    rowKind,
    findingKind: rowKind === 'finding' ? normalizeString(source.findingKind) : '',
    outcomeKind: rowKind === 'outcome' ? normalizeString(source.outcomeKind) : '',
    severity: rowKind === 'finding' ? normalizeString(source.severity) || 'info' : 'info',
    severityRank: rowKind === 'finding' ? normalizeString(source.severityRank) || severityRank(source.severity) : '2-info',
    status: normalizeString(source.status),
    summary: normalizeString(source.summary),
    factIds,
    sceneIds: sceneIdsInNarrativeOrder(
      sceneOrdinalById,
      source.sceneIds || evidenceRows.map((rowItem) => rowItem.sceneId),
    ),
    firstSceneOrdinal: Math.min(...(Array.isArray(source.sceneOrdinals) && source.sceneOrdinals.length
      ? source.sceneOrdinals
      : evidenceRows.map((rowItem) => rowItem.sceneOrdinal)), 999999),
    subjectEntityIds: uniqueSorted(source.subjectEntityIds || evidenceRows.map((rowItem) => rowItem.subjectEntityId)),
    evidenceRows,
    evidenceAnchorCount: evidenceRows.length,
    correctionRoutes: [],
  };
  row.correctionRoutes = [buildCorrectionRoute(row, factIds)];
  return row;
}

function buildKeyboardContract() {
  return {
    schemaVersion: ATLAS_CONTINUITY_LEDGER_KEYBOARD_CONTRACT_SCHEMA_VERSION,
    rowFocusModel: 'native-list-buttons',
    evidenceFocusModel: 'native-evidence-buttons',
    correctionFocusModel: 'native-intent-buttons',
    supportedKeys: ['Tab', 'Enter', ' '],
    noPointerOnlyState: true,
    equivalentListParity: true,
  };
}

function buildListParity(rows, omittedRowCount = 0) {
  return {
    schemaVersion: ATLAS_CONTINUITY_LEDGER_LIST_PARITY_SCHEMA_VERSION,
    rows: rows.map((row) => ({
      rowId: row.id,
      rowKind: row.rowKind,
      label: row.findingKind || row.outcomeKind || row.id,
      severity: row.severity,
      summary: row.summary,
      evidenceAnchorCount: row.evidenceAnchorCount,
      correctionRouteCount: row.correctionRoutes.length,
    })),
    equivalentToFindingRows: true,
    omittedRowCount: Math.max(0, omittedRowCount),
  };
}

function buildEvidence({ surfaceHash, sourceHash }) {
  return {
    schemaVersion: 'derived.atlas.continuityLedgerSurface.evidence.v1',
    designAdvisory: {
      applied: true,
      source: 'design-receipts',
      runtimeMetadataIncluded: false,
      readinessToken: false,
      externalReportAvailable: false,
    },
    guarantees: {
      localOnly: true,
      evidenceFirst: true,
      jumpIntentOnly: true,
      correctionRouteOnly: true,
      commandAuthority: 'CommandKernel',
      commandId: CORRECTION_COMMAND_ID,
      automaticCorrection: false,
      automaticApply: false,
      manuscriptMutation: false,
      crossSceneApply: false,
      sourceRevisionBound: true,
      noNewDependency: true,
    },
    surfaceHash,
    sourceHash,
  };
}

function emptyState(projectId, reason = '') {
  return {
    schemaVersion: ATLAS_CONTINUITY_LEDGER_SURFACE_SCHEMA_VERSION,
    state: reason ? 'unavailable' : 'empty',
    unavailableReason: reason,
    surfaceManifest: buildSurfaceManifest(),
    authority: buildAuthority(),
    projectId,
    summary: {
      findingCount: 0,
      outcomeCount: 0,
      rowCount: 0,
      visibleRowCount: 0,
      omittedRowCount: 0,
      evidenceAnchorCount: 0,
      correctionRouteCount: 0,
      degradedRowCount: 0,
      surfaceHash: '',
      sourceHash: '',
      invalidationKey: '',
    },
    rows: [],
    listParity: buildListParity([], 0),
    keyboardContract: buildKeyboardContract(),
    evidence: buildEvidence({ surfaceHash: '', sourceHash: '' }),
  };
}

function buildState({ project, projectId, findingsResult, factLedgersResult, rowLimit, meta }) {
  const sceneOrdinalById = buildSceneOrdinalIndex(project);
  const factsById = new Map((Array.isArray(factLedgersResult.value?.facts) ? factLedgersResult.value.facts : [])
    .map((fact) => [normalizeString(fact.id), fact]));
  const findingRows = (Array.isArray(findingsResult.value?.findings) ? findingsResult.value.findings : [])
    .map((item) => makeRow({ source: item, rowKind: 'finding', sceneOrdinalById, factsById }));
  const outcomeRows = (Array.isArray(findingsResult.value?.outcomes) ? findingsResult.value.outcomes : [])
    .map((item) => makeRow({ source: item, rowKind: 'outcome', sceneOrdinalById, factsById }));
  const allRows = sortAtlasContinuityLedgerRows([...findingRows, ...outcomeRows]);
  const visibleRows = allRows.slice(0, rowLimit);
  const omittedRowCount = Math.max(0, allRows.length - visibleRows.length);
  const evidenceAnchorCount = visibleRows.reduce((sum, row) => sum + row.evidenceAnchorCount, 0);
  const correctionRouteCount = visibleRows.reduce((sum, row) => sum + row.correctionRoutes.length, 0);
  const sourceHash = hashCanonicalValue({
    findingsHash: normalizeString(findingsResult.value?.summary?.findingsHash),
    findingsOutputHash: normalizeString(findingsResult.meta?.outputHash),
    ledgerHash: normalizeString(factLedgersResult.value?.summary?.ledgerHash),
    ledgerOutputHash: normalizeString(factLedgersResult.meta?.outputHash),
    coreStateHash: normalizeString(meta.coreStateHash),
  });
  const surfaceHash = hashCanonicalValue({ rows: visibleRows, sourceHash, rowLimit });
  const degradedRowCount = visibleRows.filter((row) => row.evidenceRows.some((evidenceRow) => evidenceRow.evidenceState !== 'current')).length;
  return {
    schemaVersion: ATLAS_CONTINUITY_LEDGER_SURFACE_SCHEMA_VERSION,
    state: allRows.length === 0 ? 'empty' : degradedRowCount > 0 ? 'degraded' : 'ready',
    unavailableReason: '',
    surfaceManifest: buildSurfaceManifest(),
    authority: buildAuthority(),
    projectId,
    summary: {
      findingCount: findingRows.length,
      outcomeCount: outcomeRows.length,
      rowCount: allRows.length,
      visibleRowCount: visibleRows.length,
      omittedRowCount,
      evidenceAnchorCount,
      correctionRouteCount,
      degradedRowCount,
      surfaceHash,
      sourceHash,
      invalidationKey: meta.invalidationKey,
    },
    rows: visibleRows,
    listParity: buildListParity(visibleRows, omittedRowCount),
    keyboardContract: buildKeyboardContract(),
    evidence: buildEvidence({ surfaceHash, sourceHash }),
  };
}

export function deriveAtlasContinuityLedgerSurface(input = {}) {
  const projectId = normalizeString(input?.params?.projectId);
  const rowLimit = Number.isSafeInteger(Number(input?.params?.rowLimit))
    ? Math.max(1, Math.min(40, Number(input.params.rowLimit)))
    : 16;
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
      rowLimit,
    },
    capabilitySnapshot: input.capabilitySnapshot,
    derive: ({ coreState, params, capabilitySnapshot, meta }) => {
      if (!isCapabilityEnabled(capabilitySnapshot)) {
        throw createDerivedError('E_CAPABILITY_DISABLED_FOR_COMMAND', VIEW_ID, 'ATLAS_CONTINUITY_LEDGER_SURFACE_DISABLED', {
          capabilityId: 'atlas.continuityLedgerSurface',
        });
      }
      const project = getProject(coreState, params.projectId);
      if (!project) throw createDerivedError('E_ATLAS_PROJECT_NOT_FOUND', VIEW_ID, 'PROJECT_NOT_FOUND', { projectId: params.projectId });
      const factLedgers = deriveAtlasContinuityFactLedgers({ coreState, params: { projectId: params.projectId }, capabilitySnapshot });
      if (!factLedgers.ok) throw createDerivedError(factLedgers.error?.code, VIEW_ID, factLedgers.error?.reason, factLedgers.error?.details);
      const findings = deriveAtlasContinuityFindings({ coreState, params: { projectId: params.projectId }, capabilitySnapshot });
      if (!findings.ok) throw createDerivedError(findings.error?.code, VIEW_ID, findings.error?.reason, findings.error?.details);
      if ((Array.isArray(findings.value?.findings) ? findings.value.findings : []).length === 0
        && (Array.isArray(findings.value?.outcomes) ? findings.value.outcomes : []).length === 0) {
        return {
          ...emptyState(params.projectId),
          summary: {
            ...emptyState(params.projectId).summary,
            invalidationKey: meta.invalidationKey,
          },
        };
      }
      return buildState({
        project,
        projectId: params.projectId,
        findingsResult: findings,
        factLedgersResult: factLedgers,
        rowLimit: params.rowLimit,
        meta,
      });
    },
  });
}

export { VIEW_ID as ATLAS_CONTINUITY_LEDGER_SURFACE_VIEW_ID };
