import { hashCanonicalValue } from '../deriveView.mjs';
import { deriveAtlasReportsSavedQueries } from './deriveAtlasReportsSavedQueries.mjs';
import {
  ATLAS_SAVED_VIEW_BATCH_COLLISION_SCHEMA_VERSION,
  ATLAS_SAVED_VIEW_BATCH_PREVIEW_SCHEMA_VERSION,
  ATLAS_SAVED_VIEW_BATCH_ROW_SCHEMA_VERSION,
  ATLAS_SAVED_VIEW_PORTABILITY_PACKET_SCHEMA_VERSION,
  ATLAS_SAVED_VIEW_PORTABILITY_ROW_SCHEMA_VERSION,
  ATLAS_STAGE_09_ACCEPTANCE_SCHEMA_VERSION,
  ATLAS_STAGE_09_ID,
  ATLAS_STAGE_09_NEXT_CONTOUR,
  sortAtlasSavedViewBatchCollisions,
  sortAtlasSavedViewBatchRows,
  sortAtlasSavedViewPortabilityRows,
} from './atlasStage09PortabilityTypes.mjs';

export const ATLAS_STAGE_09_PORTABILITY_ACCEPTANCE_VIEW_ID = ATLAS_STAGE_09_ACCEPTANCE_SCHEMA_VERSION;

const SAVED_QUERY_SAVE_COMMAND_ID = 'atlas.savedQuery.save';
const GATE_STATUS = Object.freeze({
  PASS: 'PASS',
  DEGRADED: 'DEGRADED',
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function sortJsonValue(value) {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!isPlainObject(value)) return value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (child !== undefined) out[key] = sortJsonValue(child);
  }
  return out;
}

function typedFailure(code, op, reason, details = {}) {
  const error = { code, op, reason };
  if (isPlainObject(details) && Object.keys(details).length > 0) error.details = cloneJson(details);
  return { ok: false, error };
}

function getProject(coreState, projectId) {
  const projects = isPlainObject(coreState?.data?.projects) ? coreState.data.projects : {};
  return isPlainObject(projects[projectId]) ? projects[projectId] : null;
}

function normalizeFilter(input) {
  const source = isPlainObject(input) ? input : {};
  return sortJsonValue({
    entityIds: Array.isArray(source.entityIds) ? source.entityIds.filter((value) => typeof value === 'string').sort() : [],
    relationPairIds: Array.isArray(source.relationPairIds) ? source.relationPairIds.filter((value) => typeof value === 'string').sort() : [],
    sceneIds: Array.isArray(source.sceneIds) ? source.sceneIds.filter((value) => typeof value === 'string').sort() : [],
    queryText: normalizeString(source.queryText),
  });
}

function sourceReportsPacket(input) {
  if (isPlainObject(input.reportsSavedQueries)) return { ok: true, value: input.reportsSavedQueries };
  const derived = deriveAtlasReportsSavedQueries({
    coreState: input.coreState,
    params: {
      projectId: normalizeString(input.projectId ?? input.params?.projectId),
      languageCode: normalizeString(input.languageCode ?? input.params?.languageCode),
      limit: input.limit ?? input.params?.limit ?? 24,
    },
    capabilitySnapshot: input.capabilitySnapshot,
  });
  if (!derived.ok) return derived;
  return { ok: true, value: derived.value };
}

function buildPortabilityRows(reportsPacket) {
  const rows = Array.isArray(reportsPacket.savedQueries) ? reportsPacket.savedQueries : [];
  return sortAtlasSavedViewPortabilityRows(rows.map((row) => sortJsonValue({
    schemaVersion: ATLAS_SAVED_VIEW_PORTABILITY_ROW_SCHEMA_VERSION,
    id: normalizeString(row.id),
    name: normalizeString(row.name) || normalizeString(row.id) || 'Saved view',
    reportType: normalizeString(row.reportType) || 'overview',
    filter: normalizeFilter(row.filter),
    sourceHash: normalizeString(row.sourceHash),
    currentSourceHash: normalizeString(row.currentSourceHash),
    stale: row.stale === true,
    createdByCommandSeq: Number.isInteger(row.createdByCommandSeq) ? row.createdByCommandSeq : 0,
    updatedByCommandSeq: Number.isInteger(row.updatedByCommandSeq) ? row.updatedByCommandSeq : 0,
    commandId: SAVED_QUERY_SAVE_COMMAND_ID,
    authorTruthLocation: 'project.atlas.savedQueries',
    pathless: true,
    containsPrivateData: false,
  })));
}

export function buildAtlasSavedViewPortabilityPacket(input = {}) {
  const reports = sourceReportsPacket(input);
  if (!reports.ok) return reports;
  const reportsPacket = reports.value;
  const projectId = normalizeString(reportsPacket.projectId ?? input.projectId ?? input.params?.projectId);
  if (!projectId) {
    return typedFailure('E_ATLAS_SAVED_VIEW_PORTABILITY_PROJECT_ID_REQUIRED', 'atlas.savedView.portabilityPacket', 'PROJECT_ID_REQUIRED');
  }
  const rows = buildPortabilityRows(reportsPacket);
  const base = sortJsonValue({
    schemaVersion: ATLAS_SAVED_VIEW_PORTABILITY_PACKET_SCHEMA_VERSION,
    projectId,
    sourceHash: normalizeString(reportsPacket.summary?.sourceHash),
    reportHash: normalizeString(reportsPacket.summary?.reportHash),
    rows,
    summary: {
      savedViewCount: rows.length,
      staleSavedViewCount: rows.filter((row) => row.stale === true).length,
      pathlessRowCount: rows.filter((row) => row.pathless === true).length,
      containsPrivateData: false,
    },
    authority: {
      sourceOfTruth: 'project.atlas.savedQueries',
      readModelOnly: true,
      commandAuthority: 'CommandKernel',
      commandIds: [SAVED_QUERY_SAVE_COMMAND_ID],
      projectTruthMutation: false,
      manuscriptMutation: false,
      storageMutation: false,
      networkMutation: false,
      rendererMutation: false,
    },
    privacy: {
      pathless: true,
      containsPrivateData: false,
      containsPrivatePath: false,
      containsManuscriptText: false,
      cloudSync: false,
      accountSync: false,
    },
  });
  return {
    ok: true,
    value: sortJsonValue({
      ...base,
      packetHash: hashCanonicalValue(base),
    }),
  };
}

function normalizeOperation(input, index, fallbackProjectId, fallbackSourceHash) {
  const source = isPlainObject(input) ? input : {};
  const savedViewId = normalizeString(source.savedViewId ?? source.id ?? source.savedQueryId);
  const payload = sortJsonValue({
    projectId: normalizeString(source.projectId) || fallbackProjectId,
    savedQueryId: savedViewId,
    name: normalizeString(source.name) || savedViewId || `Saved view ${index + 1}`,
    reportType: normalizeString(source.reportType) || 'overview',
    sourceHash: normalizeString(source.sourceHash) || fallbackSourceHash,
    filter: normalizeFilter(source.filter),
  });
  return {
    order: index,
    savedViewId,
    allowOverwrite: source.allowOverwrite === true,
    payload,
  };
}

function buildCollisionReport({ rows, existingSavedQueries }) {
  const seen = new Map();
  const collisions = [];
  for (const row of rows) {
    if (!row.savedViewId) {
      collisions.push({
        schemaVersion: ATLAS_SAVED_VIEW_BATCH_COLLISION_SCHEMA_VERSION,
        savedViewId: '',
        reasonCode: 'SAVED_VIEW_ID_REQUIRED',
        blocking: true,
      });
      continue;
    }
    if (seen.has(row.savedViewId)) {
      collisions.push({
        schemaVersion: ATLAS_SAVED_VIEW_BATCH_COLLISION_SCHEMA_VERSION,
        savedViewId: row.savedViewId,
        reasonCode: 'DUPLICATE_BATCH_SAVED_VIEW_ID',
        blocking: true,
      });
    }
    seen.set(row.savedViewId, true);
    const existing = existingSavedQueries[row.savedViewId];
    if (isPlainObject(existing) && row.allowOverwrite !== true) {
      collisions.push({
        schemaVersion: ATLAS_SAVED_VIEW_BATCH_COLLISION_SCHEMA_VERSION,
        savedViewId: row.savedViewId,
        reasonCode: 'SAVED_VIEW_ID_ALREADY_EXISTS',
        blocking: true,
      });
    }
  }
  return sortAtlasSavedViewBatchCollisions(collisions.map(sortJsonValue));
}

export function buildAtlasSavedViewBatchOperationPreview(input = {}) {
  const projectId = normalizeString(input.projectId ?? input.params?.projectId);
  if (!projectId) {
    return typedFailure('E_ATLAS_SAVED_VIEW_BATCH_PROJECT_ID_REQUIRED', 'atlas.savedView.batchPreview', 'PROJECT_ID_REQUIRED');
  }
  const project = getProject(input.coreState, projectId);
  if (!project) {
    return typedFailure('E_ATLAS_SAVED_VIEW_BATCH_PROJECT_NOT_FOUND', 'atlas.savedView.batchPreview', 'PROJECT_NOT_FOUND', { projectId });
  }
  let savedViewPacket = isPlainObject(input.savedViewPacket) ? input.savedViewPacket : null;
  if (!savedViewPacket) {
    const packet = buildAtlasSavedViewPortabilityPacket({
      coreState: input.coreState,
      projectId,
      capabilitySnapshot: input.capabilitySnapshot,
    });
    if (!packet.ok) return packet;
    savedViewPacket = packet.value;
  }
  const fallbackSourceHash = normalizeString(input.sourceHash) || normalizeString(savedViewPacket?.sourceHash);
  const operations = Array.isArray(input.operations) ? input.operations : [];
  const normalizedOps = operations.map((operation, index) => normalizeOperation(operation, index, projectId, fallbackSourceHash));
  const rows = sortAtlasSavedViewBatchRows(normalizedOps.map((operation) => sortJsonValue({
    schemaVersion: ATLAS_SAVED_VIEW_BATCH_ROW_SCHEMA_VERSION,
    order: operation.order,
    savedViewId: operation.savedViewId,
    operation: 'saveSavedView',
    commandId: SAVED_QUERY_SAVE_COMMAND_ID,
    commandAuthority: 'CommandKernel',
    requiresAuthorConfirmation: true,
    payload: operation.payload,
    authorTruthLocation: 'project.atlas.savedQueries',
    projectTruthMutationOnApply: true,
    manuscriptMutationOnApply: false,
    storageMutationOnApply: false,
    networkMutationOnApply: false,
    rendererMutationOnApply: false,
  })));
  const existingSavedQueries = isPlainObject(project.atlas?.savedQueries) ? project.atlas.savedQueries : {};
  const collisions = buildCollisionReport({ rows: normalizedOps, existingSavedQueries });
  const blockingCollisionCount = collisions.filter((collision) => collision.blocking === true).length;
  const base = sortJsonValue({
    schemaVersion: ATLAS_SAVED_VIEW_BATCH_PREVIEW_SCHEMA_VERSION,
    batchId: `atlas-saved-view-batch:${hashCanonicalValue({ projectId, rows })}`,
    projectId,
    sourcePacketHash: normalizeString(savedViewPacket?.packetHash),
    rows,
    collisions,
    blockingCollisionCount,
    canApply: rows.length > 0 && blockingCollisionCount === 0,
    authority: {
      commandAuthority: 'CommandKernel',
      commandIds: [SAVED_QUERY_SAVE_COMMAND_ID],
      automaticApply: false,
      requiresAuthorConfirmation: true,
      previewOnly: true,
      capabilityRevalidationRequired: true,
      projectTruthMutation: false,
      manuscriptMutation: false,
      storageMutation: false,
      networkMutation: false,
      rendererMutation: false,
    },
    summary: {
      rowCount: rows.length,
      collisionCount: collisions.length,
      blockingCollisionCount,
    },
  });
  return {
    ok: true,
    value: sortJsonValue({
      ...base,
      previewHash: hashCanonicalValue(base),
    }),
  };
}

function packetHash(value) {
  return hashCanonicalValue(value || {});
}

function gate(id, label, passed, evidence, details = {}) {
  return {
    id,
    label,
    status: passed ? GATE_STATUS.PASS : GATE_STATUS.DEGRADED,
    evidence,
    details,
  };
}

function allContentProofPassed(graphPackage) {
  const proof = isPlainObject(graphPackage.contentProof) ? graphPackage.contentProof : {};
  return ['authorTruth', 'languageTags', 'evidenceIdentities', 'customVocabularies', 'seriesReferences', 'unknownFields']
    .every((key) => proof[key] === true);
}

function buildHandoff(acceptanceProof) {
  return {
    schemaVersion: 'atlas.stage09SeriesPortabilityHandoff.v1',
    fromStage: ATLAS_STAGE_09_ID,
    nextContour: ATLAS_STAGE_09_NEXT_CONTOUR,
    readyForNextStage: acceptanceProof.pass,
    readyForFinalProgramDoD: false,
    releaseReadinessClaim: false,
    remainingScopeOut: [
      'comments history collaboration transport',
      'platform certification',
      'final Program DoD',
    ],
    handoffGuards: {
      noNewDependency: true,
      noUiRuntimeChange: true,
      noStorageMutationOutsideExistingCommands: true,
      noNetworkMutation: true,
      releaseClaimBlocked: true,
    },
  };
}

export function deriveAtlasStage09PortabilityAcceptance(input = {}) {
  const savedViewPacket = isPlainObject(input.savedViewPacket) ? input.savedViewPacket : {};
  const batchPreview = isPlainObject(input.batchPreview) ? input.batchPreview : {};
  const batchApplyReceipt = isPlainObject(input.batchApplyReceipt) ? input.batchApplyReceipt : {};
  const seriesPackageManifest = isPlainObject(input.seriesPackageManifest) ? input.seriesPackageManifest : {};
  const graphPackage = isPlainObject(input.graphPackage) ? input.graphPackage : {};
  const repeatImportProof = isPlainObject(input.repeatImportProof) ? input.repeatImportProof : {};
  const imagePdfEvidence = isPlainObject(input.imagePdfEvidence) ? input.imagePdfEvidence : {};
  const gates = [
    gate(
      'stage09-saved-view-portability-packet',
      'Saved view portability packet',
      savedViewPacket.schemaVersion === ATLAS_SAVED_VIEW_PORTABILITY_PACKET_SCHEMA_VERSION
        && savedViewPacket.privacy?.pathless === true
        && savedViewPacket.privacy?.containsPrivateData === false
        && savedViewPacket.summary?.pathlessRowCount === savedViewPacket.summary?.savedViewCount
        && /^[0-9a-f]{64}$/u.test(normalizeString(savedViewPacket.packetHash)),
      'Saved views are portable as pathless author-truth rows.',
      {
        savedViewCount: Number(savedViewPacket.summary?.savedViewCount || 0),
        packetHash: normalizeString(savedViewPacket.packetHash),
      },
    ),
    gate(
      'stage09-batch-preview-apply-command-kernel',
      'Batch preview and Command Kernel apply boundary',
      batchPreview.schemaVersion === ATLAS_SAVED_VIEW_BATCH_PREVIEW_SCHEMA_VERSION
        && batchPreview.canApply === true
        && batchPreview.authority?.commandAuthority === 'CommandKernel'
        && batchPreview.authority?.automaticApply === false
        && batchApplyReceipt.applied === true
        && batchApplyReceipt.commandAuthority === 'CommandKernel'
        && batchApplyReceipt.capabilityRevalidatedByCommandKernel === true,
      'Batch apply uses preview hash, author confirmation, and existing Command Kernel command execution.',
      {
        rowCount: Number(batchPreview.summary?.rowCount || 0),
        appliedRowCount: Number(batchApplyReceipt.appliedRowCount || 0),
      },
    ),
    gate(
      'stage09-series-isolation',
      'Series package isolation',
      seriesPackageManifest.autonomyProof?.eachBookOpensWithoutSeriesPackage === true
        && seriesPackageManifest.autonomyProof?.pathlessBookReferences === true
        && seriesPackageManifest.autonomyProof?.sourceProjectRewrite === false
        && seriesPackageManifest.autonomyProof?.silentProjectTruthRewrite === false,
      'Series references stay pathless and do not silently rewrite autonomous books.',
      {
        bookCount: Number(seriesPackageManifest.summary?.bookCount || 0),
        packageHash: normalizeString(seriesPackageManifest.meta?.packageHash),
      },
    ),
    gate(
      'stage09-full-archive-content-proof',
      'Full archive content proof',
      graphPackage.schemaVersion === 'atlas.graphPackage.v1'
        && graphPackage.archiveIntegration?.schemaVersion === 'atlas.fullArchiveIntegrationProof.v1'
        && allContentProofPassed(graphPackage)
        && graphPackage.archiveIntegration?.filesystemPathLeaked === false,
      'Graph package archive proof includes author truth, language tags, evidence identities, vocabularies, series references, and unknown fields.',
      {
        packageHash: normalizeString(graphPackage.packageHash),
      },
    ),
    gate(
      'stage09-atlas-image-pdf-evidence',
      'Atlas image and PDF evidence',
      imagePdfEvidence.schemaVersion === 'atlas.graphPackageImagePdfEvidence.v1'
        && imagePdfEvidence.image?.format === 'svg'
        && imagePdfEvidence.pdf?.sourceFormat === 'html-print-packet'
        && imagePdfEvidence.pdf?.binaryGenerated === false
        && imagePdfEvidence.networkMutation === false,
      'Atlas image and PDF evidence use local SVG and HTML print packet adapters without binary renderer claims.',
      {
        evidenceHash: normalizeString(imagePdfEvidence.meta?.evidenceHash),
      },
    ),
    gate(
      'stage09-loss-report-repeat-import',
      'Explicit loss report and repeat import',
      graphPackage.lossReport?.blockingCount === 0
        && graphPackage.derivedData?.rebuildRequired === true
        && graphPackage.derivedData?.rebuildContract?.deterministic === true
        && repeatImportProof.repeatImportValidated === true
        && repeatImportProof.projectTruthMutation === false,
      'Repeat import validates graph package hash and loss report while derived data remains rebuildable.',
      {
        lossCount: Number(graphPackage.lossReport?.count || 0),
        repeatImportProofHash: normalizeString(repeatImportProof.proofHash),
      },
    ),
    gate(
      'stage09-handoff-stage10-boundary',
      'Stage 10 handoff boundary',
      true,
      'Stage 09 closes to comments, history, and collaboration compilation, not final Program DoD.',
      { nextContour: ATLAS_STAGE_09_NEXT_CONTOUR, readyForFinalProgramDoD: false },
    ),
  ];
  const acceptanceProof = {
    schemaVersion: ATLAS_STAGE_09_ACCEPTANCE_SCHEMA_VERSION,
    stageId: ATLAS_STAGE_09_ID,
    gates,
    pass: gates.every((item) => item.status === GATE_STATUS.PASS),
  };
  const handoff = buildHandoff(acceptanceProof);
  const acceptance = {
    schemaVersion: ATLAS_STAGE_09_ACCEPTANCE_SCHEMA_VERSION,
    stageId: ATLAS_STAGE_09_ID,
    state: acceptanceProof.pass ? 'ready' : 'degraded',
    designToolRouter: 'NOT_APPLICABLE',
    savedViewPacket,
    batchPreview,
    batchApplyReceipt,
    seriesPackageManifest,
    graphPackageHash: normalizeString(graphPackage.packageHash),
    repeatImportProofHash: normalizeString(repeatImportProof.proofHash),
    imagePdfEvidenceHash: normalizeString(imagePdfEvidence.meta?.evidenceHash),
    acceptanceProof,
    handoff,
    summary: {
      gateCount: gates.length,
      passedGateCount: gates.filter((item) => item.status === GATE_STATUS.PASS).length,
      stageAcceptance: acceptanceProof.pass ? 'pass' : 'degraded',
      readyForFinalProgramDoD: false,
      releaseReadinessClaim: false,
    },
    authority: {
      sourceOfTruth: [
        'project.atlas.savedQueries',
        'derived.atlas.seriesPackageManifest.v1',
        'atlas.graphPackage.v1',
        'atlas.graphPackageLossReport.v1',
      ],
      commandAuthority: 'CommandKernel for batch apply only',
      readModelOnly: true,
      projectTruthMutation: false,
      manuscriptMutation: false,
      storageMutation: false,
      networkMutation: false,
      rendererMutation: false,
      releaseReadinessClaim: false,
    },
  };
  return {
    ...acceptance,
    meta: {
      acceptanceHash: packetHash({
        acceptanceProof,
        handoff,
        summary: acceptance.summary,
      }),
    },
  };
}

export { ATLAS_STAGE_09_NEXT_CONTOUR };
