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

async function buildAtlasExportFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const projectId = 'atlas-export-ir-project';
  const sceneId = 'scene-a';
  const text = 'Anna carries the old map. Anna keeps the oath.';
  const created = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas Export Book', sceneId },
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
      seriesId: 'series-atlas-export',
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

  const state = JSON.parse(JSON.stringify(portabilityApplied.state));
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

  return { derived, projectId, sceneId, state };
}

test('E09 C03: Atlas ExportIR serializes readable deterministic JSON preserving author truth', async () => {
  const { derived, projectId, state } = await buildAtlasExportFixture();
  const exporter = await loadModule(path.join('src', 'export', 'atlas', 'index.mjs'));
  const importer = await loadModule(path.join('src', 'import', 'atlas', 'index.mjs'));

  const first = exporter.serializeAtlasExportIrReadableJsonV1({ coreState: state, projectId });
  const second = exporter.serializeAtlasExportIrReadableJsonV1({ coreState: JSON.parse(JSON.stringify(state)), projectId });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.json, second.json);
  assert.match(first.json, /\n  "exportIr": \{/u);
  assert.equal(first.value.schemaVersion, exporter.ATLAS_EXPORT_READABLE_JSON_SCHEMA_VERSION);
  assert.equal(first.value.format, exporter.ATLAS_EXPORT_FORMAT);
  assert.equal(first.value.exportIr.schemaVersion, exporter.ATLAS_EXPORT_IR_SCHEMA_VERSION);
  assert.match(first.value.packageHash, /^[0-9a-f]{64}$/u);
  assert.equal(first.value.exportIr.portability.readableJson, true);
  assert.equal(first.value.exportIr.portability.derivedGraphDataPersistedAsTruth, false);
  assert.equal(first.value.exportIr.authorData.seriesIdentityLinks['identity-link-anna'].sharedIdentityId, 'series-person-anna');
  assert.equal(first.value.exportIr.authorData.entityVocabulary['vocab-entity-character'].label, 'Character');
  assert.equal(first.value.exportIr.authorData.relationVocabulary['vocab-relation-trusts'].label, 'Trusts');
  assert.equal(first.value.exportIr.authorData.languageTags.project.languageCode, 'en');
  assert.equal(first.value.exportIr.evidenceIdentity.rows.length, 1);
  assert.equal(first.value.exportIr.evidenceIdentity.rows[0].anchorId, first.value.exportIr.authorData.decisions[Object.keys(first.value.exportIr.authorData.decisions)[0]].evidenceAnchor.anchorId);
  assert.equal(first.value.exportIr.unknownFieldsEnvelope.atlasUnknownFields.futureAtlasPanel.rows[0].id, 'future-row-1');
  assert.equal(first.value.exportIr.unknownFieldsEnvelope.projectUnknownFields.futureProjectExportFlag.enabled, true);

  const parsed = importer.parseAtlasExportIrReadableJsonV1({ exportJson: first.json });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.roundTripProof.packageHashVerified, true);
  assert.equal(parsed.value.roundTripProof.languageTagsPreserved, true);
  assert.equal(parsed.value.roundTripProof.evidenceIdentityPreserved, true);
  assert.equal(parsed.value.roundTripProof.unknownFieldsPreserved, true);
  assert.equal(parsed.value.roundTripProof.projectTruthMutation, false);
  assert.equal(parsed.value.roundTripProof.storageMutation, false);
  assert.equal(parsed.value.restoredProjectPatch.atlas.futureAtlasPanel.rows[0].label, 'Safe future row');
  assert.equal(parsed.value.restoredProjectPatch.atlas.entities['entity-anna'].futureEntityColor, 'blue');
  assert.equal(
    parsed.value.restoredProjectPatch.atlas.decisions[Object.keys(parsed.value.restoredProjectPatch.atlas.decisions)[0]].evidenceAnchor.quote,
    'Anna',
  );
  assert.equal(parsed.value.packageHash, first.value.packageHash);
  assert.equal(derived.hashCanonicalValue(state), first.value.exportIr.source.coreStateHash);
});

test('E09 C03: importer rejects tampered hashes and invalid schemas before any apply authority exists', async () => {
  const { projectId, state } = await buildAtlasExportFixture();
  const exporter = await loadModule(path.join('src', 'export', 'atlas', 'index.mjs'));
  const importer = await loadModule(path.join('src', 'import', 'atlas', 'index.mjs'));
  const exported = exporter.serializeAtlasExportIrReadableJsonV1({ coreState: state, projectId });
  assert.equal(exported.ok, true);

  const tampered = JSON.parse(exported.json);
  tampered.exportIr.authorData.entities['entity-anna'].name = 'Ana';
  const rejected = importer.parseAtlasExportIrReadableJsonV1({ exportPayload: tampered });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.reason, 'PACKAGE_HASH_MISMATCH');

  const invalid = importer.parseAtlasExportIrReadableJsonV1({
    exportPayload: { ...exported.value, schemaVersion: 'atlas.exportReadableJson.v0' },
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.reason, 'SCHEMA_INVALID');
});

test('E09 C03: unsafe private unknown fields fail closed instead of being preserved into readable JSON', async () => {
  const { projectId, state } = await buildAtlasExportFixture();
  const exporter = await loadModule(path.join('src', 'export', 'atlas', 'index.mjs'));
  const unsafeAtlas = JSON.parse(JSON.stringify(state));
  unsafeAtlas.data.projects[projectId].atlas.futureAdapter = { filePath: '/private/book.yalken' };
  const rejectedAtlas = exporter.serializeAtlasExportIrReadableJsonV1({ coreState: unsafeAtlas, projectId });
  assert.equal(rejectedAtlas.ok, false);
  assert.equal(rejectedAtlas.error.reason, 'PRIVATE_UNKNOWN_FIELD_DENIED');
  assert.equal(rejectedAtlas.error.details.scope, 'atlas');

  const unsafeProject = JSON.parse(JSON.stringify(state));
  unsafeProject.data.projects[projectId].unknownFields = { futureRaw: { base64: 'AAAA' } };
  const rejectedProject = exporter.serializeAtlasExportIrReadableJsonV1({ coreState: unsafeProject, projectId });
  assert.equal(rejectedProject.ok, false);
  assert.equal(rejectedProject.error.reason, 'PRIVATE_UNKNOWN_FIELD_DENIED');
  assert.equal(rejectedProject.error.details.scope, 'project');
});

test('E09 C03: receipt binds ExportIR readable JSON scope and rejects false-green full-run state', () => {
  const receipt = readReceipt('YALKEN_ATLAS_V5_E09_C03_ATLAS_EXPORT_IR_READABLE_JSON_UNKNOWN_FIELD_PRESERVATION_RECEIPT.json');

  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.contourId, 'E09_C03_ATLAS_EXPORT_IR_READABLE_JSON_AND_UNKNOWN_FIELD_PRESERVATION');
  assert.equal(receipt.programStage, 'E09_STAGE_09_SERIES_AND_PORTABILITY_CONTOURS');
  assert.equal(receipt.baseSha, '36d6b1793dcdd399ce6671627d4d040ce7935c02');
  assert.equal(receipt.designToolRouter, 'NOT_APPLICABLE');
  assert.equal(receipt.runtimeFacts.atlasExportIrExists, true);
  assert.equal(receipt.runtimeFacts.readableJsonPacketExists, true);
  assert.equal(receipt.runtimeFacts.unknownFieldPreservationEnvelopeExists, true);
  assert.equal(receipt.runtimeFacts.projectTruthMutation, false);
  assert.ok(receipt.implementedBoundary.scopeIn.includes('Atlas ExportIR schema'));
  assert.ok(receipt.implementedBoundary.scopeIn.includes('language tag and evidence identity preservation'));
  assert.ok(receipt.implementedBoundary.scopeOut.includes('binary archive materialization'));
  assert.equal(receipt.nextContour, 'E09_C04_GRAPH_PACKAGE_ARCHIVE_REPEAT_IMPORT_AND_LOSS_REPORT');
  const fullRunner = receipt.validation.find((row) => row.command === 'node scripts/run-tests.js');
  assert.ok(fullRunner);
  if (fullRunner.result === 'PASS') {
    assert.doesNotMatch(fullRunner.summary, /pending local execution/i);
  } else {
    assert.equal(fullRunner.result, 'PENDING');
    assert.match(fullRunner.summary, /pending local execution/i);
  }
});

test('E09 C03: export and import barrels expose pure local APIs without storage network UI or apply bypass', async () => {
  const exporter = await loadModule(path.join('src', 'export', 'atlas', 'index.mjs'));
  const exporterV1 = await loadModule(path.join('src', 'export', 'atlas', 'v1', 'index.mjs'));
  const importer = await loadModule(path.join('src', 'import', 'atlas', 'index.mjs'));
  const importerV1 = await loadModule(path.join('src', 'import', 'atlas', 'v1', 'index.mjs'));

  assert.equal(exporter.serializeAtlasExportIrReadableJsonV1, exporterV1.serializeAtlasExportIrReadableJsonV1);
  assert.equal(importer.parseAtlasExportIrReadableJsonV1, importerV1.parseAtlasExportIrReadableJsonV1);
  assert.equal(exporter.ATLAS_EXPORT_IR_SCHEMA_VERSION, 'atlas.exportIr.v1');
  assert.equal(exporter.ATLAS_EXPORT_UNKNOWN_FIELDS_ENVELOPE_SCHEMA_VERSION, 'atlas.unknownFieldsEnvelope.v1');

  const sources = [
    'src/export/atlas/index.mjs',
    'src/export/atlas/v1/index.mjs',
    'src/export/atlas/v1/atlasExportIrTypes.mjs',
    'src/export/atlas/v1/serializeAtlasExportIrV1.mjs',
    'src/import/atlas/index.mjs',
    'src/import/atlas/v1/index.mjs',
    'src/import/atlas/v1/parseAtlasExportIrV1.mjs',
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
    /reduceCoreState\s*\(/u,
    /projectTruthMutation:\s*true/u,
    /manuscriptMutation:\s*true/u,
    /storageMutation:\s*true/u,
    /networkMutation:\s*true/u,
    /rendererMutation:\s*true/u,
    /derivedGraphDataPersistedAsTruth:\s*true/u,
  ];
  for (const relativePath of sources) {
    const source = readSource(relativePath);
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${path.basename(relativePath)} matched ${pattern.source}`);
    }
  }
});
