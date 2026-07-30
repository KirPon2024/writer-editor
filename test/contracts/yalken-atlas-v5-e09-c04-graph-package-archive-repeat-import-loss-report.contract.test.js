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

async function buildAtlasGraphPackageFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const projectId = 'atlas-graph-package-project';
  const sceneId = 'scene-a';
  const text = 'Anna carries the old map. Anna keeps the oath.';
  const created = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas Graph Package Book', sceneId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId, text },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-anna', name: 'Anna', entityKind: 'character' },
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
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasMentionIndex: true } },
  });
  assert.equal(mentions.ok, true);
  const firstMention = mentions.value.mentions[0];
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
      seriesId: 'series-atlas-graph-package',
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
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasSeriesPortability: true } },
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
  state.data.projects[projectId].atlas.entities['entity-anna'].futureEntityColor = 'blue';

  return { derived, projectId, state };
}

function recomputeGraphPackageHash(derived, graphPackage) {
  const { archiveIntegration, packageHash, ...core } = graphPackage;
  return derived.hashCanonicalValue(core);
}

test('E09 C04: graph package carries full archive content proof and explicit rebuildable loss report', async () => {
  const { derived, projectId, state } = await buildAtlasGraphPackageFixture();
  const exporter = await loadModule(path.join('src', 'export', 'atlas', 'index.mjs'));

  const built = exporter.buildAtlasGraphPackage({ coreState: state, projectId });
  assert.equal(built.ok, true);
  const graphPackage = built.value;

  assert.equal(graphPackage.schemaVersion, exporter.ATLAS_GRAPH_PACKAGE_SCHEMA_VERSION);
  assert.equal(graphPackage.format, exporter.ATLAS_GRAPH_PACKAGE_FORMAT);
  assert.match(graphPackage.packageHash, /^[0-9a-f]{64}$/u);
  assert.equal(recomputeGraphPackageHash(derived, graphPackage), graphPackage.packageHash);
  assert.equal(graphPackage.readableJsonPacket.exportIr.authorData.entities['entity-anna'].name, 'Anna');
  assert.equal(graphPackage.readableJsonPacket.exportIr.authorData.languageTags.project.languageCode, 'en');
  assert.equal(graphPackage.readableJsonPacket.exportIr.evidenceIdentity.rows.length, 1);
  assert.equal(graphPackage.readableJsonPacket.exportIr.authorData.entityVocabulary['vocab-entity-character'].label, 'Character');
  assert.equal(graphPackage.readableJsonPacket.exportIr.authorData.relationVocabulary['vocab-relation-trusts'].label, 'Trusts');
  assert.equal(graphPackage.readableJsonPacket.exportIr.authorData.seriesIdentityLinks['identity-link-anna'].sharedIdentityId, 'series-person-anna');
  assert.equal(graphPackage.readableJsonPacket.exportIr.unknownFieldsEnvelope.atlasUnknownFields.futureAtlasPanel.rows[0].id, 'future-row-1');
  assert.equal(graphPackage.readableJsonPacket.exportIr.unknownFieldsEnvelope.projectUnknownFields.futureProjectExportFlag.enabled, true);
  assert.deepEqual(graphPackage.contentProof, {
    authorTruth: true,
    customVocabularies: true,
    evidenceIdentities: true,
    languageTags: true,
    seriesReferences: true,
    unknownFields: true,
  });
  assert.equal(graphPackage.lossReport.schemaVersion, exporter.ATLAS_GRAPH_PACKAGE_LOSS_REPORT_SCHEMA_VERSION);
  assert.equal(graphPackage.lossReport.blockingCount, 0);
  assert.ok(graphPackage.lossReport.items.some((item) => item.reasonCode === 'ATLAS_DERIVED_GRAPH_DATA_OMITTED_REBUILDABLE' && item.rebuildable === true));
  assert.equal(graphPackage.derivedData.included, false);
  assert.equal(graphPackage.derivedData.persistedAsTruth, false);
  assert.equal(graphPackage.derivedData.rebuildRequired, true);
  assert.equal(graphPackage.derivedData.rebuildContract.schemaVersion, exporter.ATLAS_DERIVED_REBUILD_CONTRACT_SCHEMA_VERSION);
  assert.match(graphPackage.derivedData.rebuildContract.rebuildProofHash, /^[0-9a-f]{64}$/u);
  assert.equal(graphPackage.archiveIntegration.requiredEntries.length, 3);
  assert.ok(graphPackage.archiveIntegration.requiredEntries.some((entry) => entry.entryId === 'atlas-export-ir-readable-json'));
  assert.ok(graphPackage.archiveIntegration.requiredEntries.some((entry) => entry.entryId === 'atlas-graph-package-json'));
  assert.ok(graphPackage.archiveIntegration.requiredEntries.some((entry) => entry.entryId === 'atlas-loss-report-json'));
  assert.equal(graphPackage.archiveIntegration.filesystemPathLeaked, false);
  assert.equal(graphPackage.archiveIntegration.networkMutation, false);
  assert.equal(graphPackage.archiveIntegration.storageMutation, false);
  assert.doesNotMatch(JSON.stringify(graphPackage), /\/Users|\/Volumes|file:|https?:\/\//u);
});

test('E09 C04: repeat import validates package hash, loss report, rebuild proof, and preview-only restore', async () => {
  const { derived, projectId, state } = await buildAtlasGraphPackageFixture();
  const exporter = await loadModule(path.join('src', 'export', 'atlas', 'index.mjs'));
  const importer = await loadModule(path.join('src', 'import', 'atlas', 'index.mjs'));
  const built = exporter.buildAtlasGraphPackage({ coreState: state, projectId });
  assert.equal(built.ok, true);

  const imported = importer.validateAtlasGraphPackageRepeatImport({ graphPackage: built.value });
  assert.equal(imported.ok, true);
  assert.equal(imported.value.schemaVersion, importer.ATLAS_GRAPH_PACKAGE_REPEAT_IMPORT_PROOF_SCHEMA_VERSION);
  assert.equal(imported.value.repeatImportValidated, true);
  assert.equal(imported.value.projectTruthMutation, false);
  assert.equal(imported.value.storageMutation, false);
  assert.equal(imported.value.restoredProjectPatch.atlas.futureAtlasPanel.rows[0].label, 'Safe future row');
  assert.equal(imported.value.restoredProjectPatch.atlas.entities['entity-anna'].futureEntityColor, 'blue');
  assert.equal(imported.value.restoredProjectPatch.atlas.seriesIdentityLinks['identity-link-anna'].sharedIdentityId, 'series-person-anna');
  assert.equal(imported.value.restoredProjectPatch.unknownFields.futureProjectExportFlag.enabled, true);

  const tampered = cloneJson(built.value);
  tampered.readableJsonPacket.exportIr.authorData.entities['entity-anna'].name = 'Ana';
  const tamperedResult = importer.validateAtlasGraphPackageRepeatImport({ graphPackage: tampered });
  assert.equal(tamperedResult.ok, false);
  assert.equal(tamperedResult.error.reason, 'PACKAGE_HASH_MISMATCH');

  const blocking = cloneJson(built.value);
  blocking.lossReport.items.push({
    kind: 'UNSUPPORTED_PAYLOAD',
    reasonCode: 'ATLAS_TEST_BLOCKING_LOSS',
    note: 'Synthetic blocking loss for contract verification.',
    blocking: true,
    rebuildable: false,
    sourcePackageHash: blocking.readableJsonPacket.packageHash,
  });
  blocking.lossReport.count = blocking.lossReport.items.length;
  blocking.lossReport.blockingCount = 1;
  blocking.packageHash = recomputeGraphPackageHash(derived, blocking);
  const blockingResult = importer.validateAtlasGraphPackageRepeatImport({ graphPackage: blocking });
  assert.equal(blockingResult.ok, false);
  assert.equal(blockingResult.error.reason, 'BLOCKING_LOSS_PRESENT');

  const brokenRebuild = cloneJson(built.value);
  brokenRebuild.derivedData.rebuildContract.deterministic = false;
  brokenRebuild.packageHash = recomputeGraphPackageHash(derived, brokenRebuild);
  const brokenRebuildResult = importer.validateAtlasGraphPackageRepeatImport({ graphPackage: brokenRebuild });
  assert.equal(brokenRebuildResult.ok, false);
  assert.equal(brokenRebuildResult.error.reason, 'DERIVED_REBUILD_CONTRACT_INVALID');
});

test('E09 C04: Atlas image and PDF evidence use local ExportIR adapters without claiming binary rendering', async () => {
  const { projectId, state } = await buildAtlasGraphPackageFixture();
  const exporter = await loadModule(path.join('src', 'export', 'atlas', 'index.mjs'));
  const built = exporter.buildAtlasGraphPackage({ coreState: state, projectId });
  assert.equal(built.ok, true);

  const evidence = exporter.buildAtlasGraphPackageImagePdfEvidence(built.value);
  assert.equal(evidence.ok, true);
  assert.equal(evidence.value.schemaVersion, exporter.ATLAS_GRAPH_PACKAGE_IMAGE_PDF_EVIDENCE_SCHEMA_VERSION);
  assert.equal(evidence.value.packageHash, built.value.packageHash);
  assert.equal(evidence.value.image.format, 'svg');
  assert.equal(evidence.value.image.mediaType, 'image/svg+xml');
  assert.match(evidence.value.image.content, /<svg xmlns=/u);
  assert.match(evidence.value.image.content, /Anna/u);
  assert.equal(evidence.value.pdf.format, 'pdf');
  assert.equal(evidence.value.pdf.sourceFormat, 'html-print-packet');
  assert.equal(evidence.value.pdf.adapterRequired, 'local-print-to-pdf-port');
  assert.equal(evidence.value.pdf.binaryGenerated, false);
  assert.match(evidence.value.pdf.content, /<!doctype html>/u);
  assert.match(evidence.value.pdf.content, /packageHash/u);
  assert.equal(evidence.value.projectTruthMutation, false);
  assert.equal(evidence.value.storageMutation, false);
  assert.equal(evidence.value.networkMutation, false);
  assert.equal(evidence.value.rendererMutation, false);
  assert.match(evidence.value.meta.evidenceHash, /^[0-9a-f]{64}$/u);
});

test('E09 C04: receipt binds graph package archive scope and rejects false-green full-run state', () => {
  const receipt = readReceipt('YALKEN_ATLAS_V5_E09_C04_GRAPH_PACKAGE_ARCHIVE_REPEAT_IMPORT_LOSS_REPORT_RECEIPT.json');

  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.contourId, 'E09_C04_GRAPH_PACKAGE_ARCHIVE_REPEAT_IMPORT_AND_LOSS_REPORT');
  assert.equal(receipt.programStage, 'E09_STAGE_09_SERIES_AND_PORTABILITY_CONTOURS');
  assert.equal(receipt.baseSha, '1dfb3d8f6f2243114445a8f7f66de809a390358d');
  assert.equal(receipt.designToolRouter, 'NOT_APPLICABLE');
  assert.equal(receipt.runtimeFacts.graphPackageExists, true);
  assert.equal(receipt.runtimeFacts.fullArchiveIntegrationProofExists, true);
  assert.equal(receipt.runtimeFacts.repeatImportProofExists, true);
  assert.equal(receipt.runtimeFacts.atlasImageEvidenceAdapterExists, true);
  assert.equal(receipt.runtimeFacts.atlasPdfEvidenceAdapterExists, true);
  assert.ok(receipt.implementedBoundary.scopeIn.includes('full archive content proof for author truth, language tags, evidence identities, custom vocabularies, series references, and unknown fields'));
  assert.ok(receipt.implementedBoundary.scopeIn.includes('Atlas image evidence adapter over versioned ExportIR graph package'));
  assert.ok(receipt.implementedBoundary.scopeIn.includes('Atlas PDF evidence adapter over local SVG and HTML print packet pattern'));
  assert.ok(receipt.implementedBoundary.scopeOut.includes('paid or remote PDF renderer'));
  assert.equal(receipt.nextContour, 'E09_C05_SAVED_VIEWS_BATCH_OPERATIONS_AND_STAGE_09_ACCEPTANCE');
  const fullRunner = receipt.validation.find((row) => row.command === 'node scripts/run-tests.js');
  assert.ok(fullRunner);
  if (fullRunner.result === 'PASS') {
    assert.doesNotMatch(fullRunner.summary, /pending local execution/i);
  } else {
    assert.equal(fullRunner.result, 'PENDING');
    assert.match(fullRunner.summary, /pending local execution/i);
  }
});

test('E09 C04: archive import/export APIs stay pure local without storage network UI or apply bypass', async () => {
  const exporter = await loadModule(path.join('src', 'export', 'atlas', 'index.mjs'));
  const exporterV1 = await loadModule(path.join('src', 'export', 'atlas', 'v1', 'index.mjs'));
  const importer = await loadModule(path.join('src', 'import', 'atlas', 'index.mjs'));
  const importerV1 = await loadModule(path.join('src', 'import', 'atlas', 'v1', 'index.mjs'));

  assert.equal(exporter.buildAtlasGraphPackage, exporterV1.buildAtlasGraphPackage);
  assert.equal(exporter.buildAtlasGraphPackageImagePdfEvidence, exporterV1.buildAtlasGraphPackageImagePdfEvidence);
  assert.equal(importer.validateAtlasGraphPackageRepeatImport, importerV1.validateAtlasGraphPackageRepeatImport);
  assert.equal(exporter.ATLAS_GRAPH_PACKAGE_SCHEMA_VERSION, 'atlas.graphPackage.v1');
  assert.equal(importer.ATLAS_GRAPH_PACKAGE_REPEAT_IMPORT_PROOF_SCHEMA_VERSION, 'atlas.graphPackageRepeatImportProof.v1');

  const sources = [
    'src/export/archive/atlasGraphPackageArchiveProof.mjs',
    'src/export/atlas/index.mjs',
    'src/export/atlas/v1/index.mjs',
    'src/export/atlas/v1/atlasGraphPackageV1.mjs',
    'src/import/atlas/index.mjs',
    'src/import/atlas/v1/index.mjs',
    'src/import/atlas/v1/atlasGraphPackageRepeatImport.mjs',
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
    /projectTruthMutation:\s*true/u,
    /manuscriptMutation:\s*true/u,
    /storageMutation:\s*true/u,
    /networkMutation:\s*true/u,
    /rendererMutation:\s*true/u,
    /binaryGenerated:\s*true/u,
    /applyAuthority:\s*true/u,
  ];
  for (const relativePath of sources) {
    const source = readSource(relativePath);
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${path.basename(relativePath)} matched ${pattern.source}`);
    }
  }
});
