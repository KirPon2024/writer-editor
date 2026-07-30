const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

function readSource(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function readReceipt(fileName) {
  return JSON.parse(readSource(path.join('docs', 'OPS', 'STATUS', fileName)));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function capabilitySnapshot() {
  return {
    platformId: 'node',
    capabilities: {
      atlasReportsSavedQueries: true,
      atlasOverview: true,
      atlasMatrices: true,
      atlasHeatmap: true,
      atlasObservationAggregate: true,
      atlasTemporalContinuity: true,
      atlasLocalGraph: true,
      atlasSeriesPackageManifest: true,
      atlasSeriesPortability: true,
      atlasMentionIndex: true,
    },
  };
}

async function buildStage09StateFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const projectId = 'stage09-portability-project';
  const sceneId = 'scene-a';
  const created = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Stage 09 Portability Book', sceneId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId, text: 'Anna carries the old map. Anna keeps the oath. Mira returns.' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-anna', name: 'Anna', entityKind: 'character' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-mira', name: 'Mira', entityKind: 'character' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_LANGUAGE_TAG_SET,
      payload: {
        projectId,
        tagId: 'language-project-en',
        scopeKind: 'project',
        languageCode: 'en',
        note: 'Project language truth',
      },
    },
  ]);
  assert.equal(created.ok, true);

  const mentions = derived.deriveAtlasMentionIndex({
    coreState: created.state,
    params: { projectId },
    capabilitySnapshot: capabilitySnapshot(),
  });
  assert.equal(mentions.ok, true);
  const firstMention = mentions.value.mentions.find((mention) => mention.entityId === 'entity-anna') || mentions.value.mentions[0];
  const confirmed = runtime.reduceCoreState(created.state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_MENTION_CONFIRM,
    payload: {
      projectId,
      sceneId,
      entityId: 'entity-anna',
      mentionId: firstMention.mentionId,
      evidenceAnchor: firstMention.evidenceAnchor,
    },
  });
  assert.equal(confirmed.ok, true);

  const entityHash = derived.hashCanonicalValue(confirmed.state.data.projects[projectId].atlas.entities['entity-anna']);
  const portabilityPreview = derived.deriveAtlasSeriesPortabilityPreview({
    coreState: confirmed.state,
    params: {
      projectId,
      seriesId: 'series-stage09-portability',
      identityLinks: [{
        id: 'identity-link-anna',
        localEntityId: 'entity-anna',
        sharedIdentityId: 'series-person-anna',
        expectedEntityHash: entityHash,
      }],
      entityVocabularyRows: [{
        id: 'vocab-entity-character',
        label: 'Character',
        appliesTo: 'entityKind',
      }],
      relationVocabularyRows: [{
        id: 'vocab-relation-trusts',
        label: 'Trusts',
        appliesTo: 'relationKind',
      }],
    },
    capabilitySnapshot: capabilitySnapshot(),
  });
  assert.equal(portabilityPreview.ok, true);
  const portabilityApplied = runtime.reduceCoreState(confirmed.state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_SERIES_PORTABILITY_APPLY,
    payload: {
      projectId,
      previewPlan: portabilityPreview.value,
      previewHash: portabilityPreview.value.previewHash,
      authorConfirmed: true,
    },
  });
  assert.equal(portabilityApplied.ok, true);

  const state = cloneJson(portabilityApplied.state);
  state.data.projects[projectId].unknownFields = {
    futureProjectExportFlag: {
      schemaVersion: 'future.project.exportFlag.v1',
      enabled: true,
    },
  };
  state.data.projects[projectId].atlas.futureAtlasPanel = {
    schemaVersion: 'future.atlas.panel.v1',
    rows: [{ id: 'future-row-1', label: 'Safe future row' }],
  };

  const reports = derived.deriveAtlasReportsSavedQueries({
    coreState: state,
    params: { projectId, limit: 12 },
    capabilitySnapshot: capabilitySnapshot(),
  });
  assert.equal(reports.ok, true);
  const saved = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_SAVED_QUERY_SAVE,
    payload: {
      projectId,
      savedQueryId: 'view-main-cast',
      name: 'Main cast',
      reportType: 'overview',
      sourceHash: reports.value.summary.sourceHash,
      filter: { entityIds: ['entity-anna', 'entity-mira'], queryText: 'cast' },
    },
  });
  assert.equal(saved.ok, true);

  return { runtime, derived, projectId, sceneId, state: saved.state, sourceHash: reports.value.summary.sourceHash };
}

async function createCommandRunner(runtime, platformId = 'node') {
  const registryModule = await loadModule(path.join('src', 'renderer', 'commands', 'registry.mjs'));
  const runnerModule = await loadModule(path.join('src', 'renderer', 'commands', 'runCommand.mjs'));
  const registry = registryModule.createCommandRegistry();
  registry.registerCommand(runtime.CORE_COMMAND_IDS.ATLAS_SAVED_QUERY_SAVE, (input) => {
    return runtime.reduceCoreState(input.state, {
      type: runtime.CORE_COMMAND_IDS.ATLAS_SAVED_QUERY_SAVE,
      payload: input.payload,
    });
  });
  return runnerModule.createCommandRunner(registry, {
    capability: { defaultPlatformId: platformId },
  });
}

async function externalBookRefs(derived) {
  return [
    {
      projectId: 'series-book-two',
      bookId: 'book-two',
      title: 'Book Two',
      sourceHash: derived.hashCanonicalValue({ book: 2 }),
      authorTruthHash: derived.hashCanonicalValue({ atlas: ['anna'] }),
      languageTagsHash: derived.hashCanonicalValue({ languages: ['en'] }),
      evidenceIdentityHash: derived.hashCanonicalValue({ evidence: ['anna:scene-b'] }),
      unknownFieldsHash: derived.hashCanonicalValue({ future: true }),
    },
  ];
}

async function buildStage09AcceptanceFixture() {
  const { runtime, derived, projectId, state, sourceHash } = await buildStage09StateFixture();
  const coreBatch = await loadModule(path.join('src', 'core', 'atlasSavedViewBatchOperations.mjs'));
  const exporter = await loadModule(path.join('src', 'export', 'atlas', 'index.mjs'));
  const importer = await loadModule(path.join('src', 'import', 'atlas', 'index.mjs'));
  const savedViewPacket = derived.buildAtlasSavedViewPortabilityPacket({
    coreState: state,
    projectId,
    capabilitySnapshot: capabilitySnapshot(),
  });
  assert.equal(savedViewPacket.ok, true);
  const batchPreview = derived.buildAtlasSavedViewBatchOperationPreview({
    coreState: state,
    projectId,
    savedViewPacket: savedViewPacket.value,
    operations: [{
      savedViewId: 'view-matrix',
      name: 'Matrix view',
      reportType: 'matrix',
      sourceHash,
      filter: { entityIds: ['entity-anna'], queryText: 'matrix' },
    }],
  });
  assert.equal(batchPreview.ok, true);
  const commandRunner = await createCommandRunner(runtime, 'node');
  const batchApply = await coreBatch.applyAtlasSavedViewBatchViaCommandKernel({
    state,
    preview: batchPreview.value,
    previewHash: batchPreview.value.previewHash,
    authorConfirmed: true,
    commandRunner,
  });
  assert.equal(batchApply.ok, true);

  const seriesPackageManifest = derived.deriveAtlasSeriesPackageManifest({
    coreState: batchApply.state,
    params: {
      projectId,
      seriesId: 'series-stage09-portability',
      bookRefs: await externalBookRefs(derived),
    },
    capabilitySnapshot: capabilitySnapshot(),
  });
  assert.equal(seriesPackageManifest.ok, true);
  const graphPackage = exporter.buildAtlasGraphPackage({ coreState: batchApply.state, projectId });
  assert.equal(graphPackage.ok, true);
  const repeatImport = importer.validateAtlasGraphPackageRepeatImport({ graphPackage: graphPackage.value });
  assert.equal(repeatImport.ok, true);
  const imagePdfEvidence = exporter.buildAtlasGraphPackageImagePdfEvidence(graphPackage.value);
  assert.equal(imagePdfEvidence.ok, true);
  const acceptance = derived.deriveAtlasStage09PortabilityAcceptance({
    savedViewPacket: savedViewPacket.value,
    batchPreview: batchPreview.value,
    batchApplyReceipt: batchApply.receipt,
    seriesPackageManifest: seriesPackageManifest.value,
    graphPackage: graphPackage.value,
    repeatImportProof: repeatImport.value,
    imagePdfEvidence: imagePdfEvidence.value,
  });
  return {
    runtime,
    derived,
    coreBatch,
    projectId,
    state,
    savedViewPacket: savedViewPacket.value,
    batchPreview: batchPreview.value,
    batchApply,
    graphPackage: graphPackage.value,
    imagePdfEvidence: imagePdfEvidence.value,
    acceptance,
  };
}

test('E09 C05: saved view portability packet and batch preview are pathless and preview-only', async () => {
  const { derived, projectId, state, sourceHash } = await buildStage09StateFixture();
  const savedViewPacket = derived.buildAtlasSavedViewPortabilityPacket({
    coreState: state,
    projectId,
    capabilitySnapshot: capabilitySnapshot(),
  });
  assert.equal(savedViewPacket.ok, true);
  assert.equal(savedViewPacket.value.schemaVersion, derived.ATLAS_SAVED_VIEW_PORTABILITY_PACKET_SCHEMA_VERSION);
  assert.equal(savedViewPacket.value.rows.length, 1);
  assert.equal(savedViewPacket.value.rows[0].id, 'view-main-cast');
  assert.equal(savedViewPacket.value.rows[0].pathless, true);
  assert.equal(savedViewPacket.value.privacy.containsPrivateData, false);
  assert.match(savedViewPacket.value.packetHash, /^[0-9a-f]{64}$/u);

  const preview = derived.buildAtlasSavedViewBatchOperationPreview({
    coreState: state,
    projectId,
    savedViewPacket: savedViewPacket.value,
    operations: [{
      savedViewId: 'view-matrix',
      name: 'Matrix view',
      reportType: 'matrix',
      sourceHash,
      filter: { entityIds: ['entity-anna'], queryText: 'matrix' },
    }],
  });
  assert.equal(preview.ok, true);
  assert.equal(preview.value.schemaVersion, derived.ATLAS_SAVED_VIEW_BATCH_PREVIEW_SCHEMA_VERSION);
  assert.equal(preview.value.canApply, true);
  assert.equal(preview.value.authority.commandAuthority, 'CommandKernel');
  assert.equal(preview.value.authority.automaticApply, false);
  assert.equal(preview.value.authority.capabilityRevalidationRequired, true);
  assert.equal(preview.value.rows[0].schemaVersion, derived.ATLAS_SAVED_VIEW_BATCH_ROW_SCHEMA_VERSION);
  assert.equal(preview.value.rows[0].commandId, 'atlas.savedQuery.save');
  assert.equal(preview.value.rows[0].payload.savedQueryId, 'view-matrix');
  assert.equal(preview.value.rows[0].projectTruthMutationOnApply, true);
  assert.match(preview.value.previewHash, /^[0-9a-f]{64}$/u);

  const collision = derived.buildAtlasSavedViewBatchOperationPreview({
    coreState: state,
    projectId,
    savedViewPacket: savedViewPacket.value,
    operations: [{
      savedViewId: 'view-main-cast',
      name: 'Duplicate',
      reportType: 'overview',
      sourceHash,
    }],
  });
  assert.equal(collision.ok, true);
  assert.equal(collision.value.canApply, false);
  assert.equal(collision.value.blockingCollisionCount, 1);
  assert.equal(collision.value.collisions[0].schemaVersion, derived.ATLAS_SAVED_VIEW_BATCH_COLLISION_SCHEMA_VERSION);
  assert.equal(collision.value.collisions[0].reasonCode, 'SAVED_VIEW_ID_ALREADY_EXISTS');
});

test('E09 C05: batch apply runs only through Command Kernel with preview hash, capability revalidation, rollback and reopen proof', async () => {
  const { runtime, derived, coreBatch, state, batchPreview, batchApply, projectId } = await buildStage09AcceptanceFixture();

  assert.equal(batchApply.receipt.schemaVersion, derived.ATLAS_SAVED_VIEW_BATCH_APPLY_RECEIPT_SCHEMA_VERSION);
  assert.equal(batchApply.receipt.applied, true);
  assert.equal(batchApply.receipt.commandAuthority, 'CommandKernel');
  assert.deepEqual(batchApply.receipt.commandIds, ['atlas.savedQuery.save']);
  assert.equal(batchApply.receipt.capabilityRevalidatedByCommandKernel, true);
  assert.equal(batchApply.receipt.projectTruthMutation, true);
  assert.equal(batchApply.receipt.manuscriptMutation, false);
  assert.equal(batchApply.receipt.storageMutation, false);
  assert.equal(batchApply.receipt.rollbackProof.rollbackAvailableFromOriginalState, true);
  assert.equal(batchApply.receipt.reopenProof.savedViewIds[0], 'view-matrix');
  assert.equal(batchApply.state.data.projects[projectId].atlas.savedQueries['view-matrix'].name, 'Matrix view');

  const webRunner = await createCommandRunner(runtime, 'web');
  const denied = await coreBatch.applyAtlasSavedViewBatchViaCommandKernel({
    state,
    preview: batchPreview,
    previewHash: batchPreview.previewHash,
    authorConfirmed: true,
    commandRunner: webRunner,
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.reason, 'CAPABILITY_DISABLED_FOR_COMMAND');
  assert.equal(denied.stateHash, derived.hashCanonicalValue(state));
  assert.equal(denied.rollbackProof.originalStateReturned, true);

  const unconfirmed = await coreBatch.applyAtlasSavedViewBatchViaCommandKernel({
    state,
    preview: batchPreview,
    previewHash: batchPreview.previewHash,
    authorConfirmed: false,
    commandRunner: await createCommandRunner(runtime, 'node'),
  });
  assert.equal(unconfirmed.ok, false);
  assert.equal(unconfirmed.error.reason, 'AUTHOR_CONFIRMATION_REQUIRED');

  const stale = await coreBatch.applyAtlasSavedViewBatchViaCommandKernel({
    state,
    preview: batchPreview,
    previewHash: '0'.repeat(64),
    authorConfirmed: true,
    commandRunner: await createCommandRunner(runtime, 'node'),
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.error.reason, 'PREVIEW_HASH_MISMATCH');
});

test('E09 C05: Stage 09 acceptance proves saved views, series isolation, archive, image/PDF, loss report, and handoff to Stage 10', async () => {
  const { derived, acceptance, graphPackage, imagePdfEvidence } = await buildStage09AcceptanceFixture();

  assert.equal(acceptance.schemaVersion, derived.ATLAS_STAGE_09_ACCEPTANCE_SCHEMA_VERSION);
  assert.equal(acceptance.stageId, derived.ATLAS_STAGE_09_ID);
  assert.equal(acceptance.state, 'ready');
  assert.equal(acceptance.designToolRouter, 'NOT_APPLICABLE');
  assert.equal(acceptance.acceptanceProof.pass, true);
  assert.equal(acceptance.summary.gateCount, 7);
  assert.equal(acceptance.summary.passedGateCount, 7);
  assert.equal(acceptance.handoff.nextContour, derived.ATLAS_STAGE_09_NEXT_CONTOUR);
  assert.equal(acceptance.handoff.readyForNextStage, true);
  assert.equal(acceptance.handoff.readyForFinalProgramDoD, false);
  assert.equal(acceptance.handoff.releaseReadinessClaim, false);
  assert.deepEqual(acceptance.acceptanceProof.gates.map((gate) => gate.id), [
    'stage09-saved-view-portability-packet',
    'stage09-batch-preview-apply-command-kernel',
    'stage09-series-isolation',
    'stage09-full-archive-content-proof',
    'stage09-atlas-image-pdf-evidence',
    'stage09-loss-report-repeat-import',
    'stage09-handoff-stage10-boundary',
  ]);
  assert.equal(graphPackage.archiveIntegration.contentProof.authorTruth, true);
  assert.equal(graphPackage.archiveIntegration.contentProof.languageTags, true);
  assert.equal(graphPackage.archiveIntegration.contentProof.evidenceIdentities, true);
  assert.equal(graphPackage.archiveIntegration.contentProof.customVocabularies, true);
  assert.equal(graphPackage.archiveIntegration.contentProof.seriesReferences, true);
  assert.equal(graphPackage.archiveIntegration.contentProof.unknownFields, true);
  assert.equal(graphPackage.lossReport.blockingCount, 0);
  assert.equal(graphPackage.derivedData.rebuildContract.deterministic, true);
  assert.equal(imagePdfEvidence.pdf.binaryGenerated, false);
  assert.match(acceptance.meta.acceptanceHash, /^[0-9a-f]{64}$/u);

  const brokenImage = cloneJson(imagePdfEvidence);
  brokenImage.pdf.binaryGenerated = true;
  const degraded = derived.deriveAtlasStage09PortabilityAcceptance({
    savedViewPacket: acceptance.savedViewPacket,
    batchPreview: acceptance.batchPreview,
    batchApplyReceipt: acceptance.batchApplyReceipt,
    seriesPackageManifest: acceptance.seriesPackageManifest,
    graphPackage,
    repeatImportProof: { repeatImportValidated: true, proofHash: acceptance.repeatImportProofHash, projectTruthMutation: false },
    imagePdfEvidence: brokenImage,
  });
  assert.equal(degraded.state, 'degraded');
  assert.equal(degraded.acceptanceProof.gates.find((gate) => gate.id === 'stage09-atlas-image-pdf-evidence').status, 'DEGRADED');
  assert.equal(degraded.handoff.readyForNextStage, false);
  assert.equal(degraded.handoff.readyForFinalProgramDoD, false);
});

test('E09 C05: receipt binds Stage 09 acceptance scope and rejects false-green full-run state', () => {
  const receipt = readReceipt('YALKEN_ATLAS_V5_E09_C05_SAVED_VIEWS_BATCH_OPERATIONS_STAGE_09_ACCEPTANCE_RECEIPT.json');

  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.contourId, 'E09_C05_SAVED_VIEWS_BATCH_OPERATIONS_AND_STAGE_09_ACCEPTANCE');
  assert.equal(receipt.programStage, 'E09_STAGE_09_SERIES_AND_PORTABILITY_CONTOURS');
  assert.equal(receipt.baseSha, '70437bfb05ca5721ef0810dacdcd4ac795038f6a');
  assert.equal(receipt.designToolRouter, 'NOT_APPLICABLE');
  assert.equal(receipt.runtimeFacts.savedViewPortabilityPacketExists, true);
  assert.equal(receipt.runtimeFacts.batchApplyCommandKernelBoundaryExists, true);
  assert.equal(receipt.runtimeFacts.stage09AcceptanceProofExists, true);
  assert.equal(receipt.runtimeFacts.handoffToStage10, true);
  assert.equal(receipt.runtimeFacts.finalProgramDoDClaim, false);
  assert.ok(receipt.implementedBoundary.scopeIn.includes('saved view portability packet'));
  assert.ok(receipt.implementedBoundary.scopeIn.includes('batch apply through existing atlas.savedQuery.save Command Kernel boundary'));
  assert.ok(receipt.implementedBoundary.scopeIn.includes('Stage 09 acceptance proof with handoff to Stage 10'));
  assert.ok(receipt.implementedBoundary.scopeOut.includes('collaboration comments or history'));
  assert.equal(receipt.nextContour, 'E10_C00_STAGE_10_COMMENTS_HISTORY_COLLAB_CONTOUR_COMPILATION');
  const fullRunner = receipt.validation.find((row) => row.command === 'node scripts/run-tests.js');
  assert.ok(fullRunner);
  if (fullRunner.result === 'PASS') {
    assert.doesNotMatch(fullRunner.summary, /pending local execution/i);
  } else {
    assert.equal(fullRunner.result, 'PENDING');
    assert.match(fullRunner.summary, /pending local execution/i);
  }
});

test('E09 C05: Stage 09 sources expose barrels and avoid storage network UI or command bypass', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'index.mjs'));
  const coreBatch = await loadModule(path.join('src', 'core', 'atlasSavedViewBatchOperations.mjs'));

  assert.equal(derived.buildAtlasSavedViewPortabilityPacket, atlas.buildAtlasSavedViewPortabilityPacket);
  assert.equal(derived.buildAtlasSavedViewBatchOperationPreview, atlas.buildAtlasSavedViewBatchOperationPreview);
  assert.equal(derived.deriveAtlasStage09PortabilityAcceptance, atlas.deriveAtlasStage09PortabilityAcceptance);
  assert.equal(coreBatch.ATLAS_SAVED_VIEW_BATCH_APPLY_RECEIPT_SCHEMA_VERSION, derived.ATLAS_SAVED_VIEW_BATCH_APPLY_RECEIPT_SCHEMA_VERSION);
  assert.equal(derived.ATLAS_STAGE_09_NEXT_CONTOUR, 'E10_C00_STAGE_10_COMMENTS_HISTORY_COLLAB_CONTOUR_COMPILATION');

  const sources = [
    'src/core/atlasSavedViewBatchOperations.mjs',
    'src/derived/atlas/atlasStage09PortabilityTypes.mjs',
    'src/derived/atlas/deriveAtlasStage09PortabilityAcceptance.mjs',
    'src/derived/atlas/index.mjs',
    'src/derived/index.mjs',
  ];
  const forbidden = [
    /from\s+['"]node:fs['"]/u,
    /from\s+['"]node:child_process['"]/u,
    /from\s+['"]node:http['"]/u,
    /from\s+['"]node:https['"]/u,
    /from\s+['"]node:net['"]/u,
    /from\s+['"]electron['"]/u,
    /document\./u,
    /querySelector/u,
    /new\s+Worker\b/u,
    /\bsetTimeout\b/u,
    /\bsetInterval\b/u,
    /\bwriteFile(?:Sync)?\s*\(/u,
    /\bappendFile(?:Sync)?\s*\(/u,
    /\blocalStorage\b/u,
    /\bsessionStorage\b/u,
    /\bindexedDB\b/u,
    /dispatchUiCommand/u,
    /sendCanonicalRuntimeCommand/u,
    /automaticApply:\s*true/u,
    /readyForFinalProgramDoD:\s*true/u,
    /releaseReadinessClaim:\s*true/u,
    /manuscriptMutation:\s*true/u,
    /storageMutation:\s*true/u,
    /networkMutation:\s*true/u,
    /rendererMutation:\s*true/u,
  ];
  for (const relativePath of sources) {
    const source = readSource(relativePath);
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${path.basename(relativePath)} matched ${pattern.source}`);
    }
  }
});
