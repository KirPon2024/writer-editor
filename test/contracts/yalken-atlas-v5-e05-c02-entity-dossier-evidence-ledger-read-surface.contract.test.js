const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildEntityDossierFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const projectId = 'atlas-entity-dossier-project';
  const sceneAId = 'scene-a';
  const sceneBId = 'scene-b';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas entity dossier', sceneId: sceneAId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId: sceneAId, text: 'Anna met Mira.' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-anna', name: 'Anna', entityKind: 'character' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ALIAS_ADD,
      payload: { projectId, entityId: 'entity-anna', aliasId: 'alias-a', value: 'A.', scope: 'project' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-mira', name: 'Mira', entityKind: 'character' },
    },
  ]);
  assert.equal(built.ok, true);
  const withSceneB = JSON.parse(JSON.stringify(built.state));
  withSceneB.data.projects[projectId].scenes[sceneBId] = {
    id: sceneBId,
    title: 'Second',
    text: 'Anna watched Mira.',
  };
  withSceneB.data.projects[projectId].languageCode = 'en';

  const aggregate = derived.deriveAtlasObservationAggregate({ coreState: withSceneB, params: { projectId, languageCode: 'en' } });
  assert.equal(aggregate.ok, true);
  const anna = aggregate.value.observations.find((observation) => observation.entityId === 'entity-anna' && observation.sceneId === sceneAId);
  assert.ok(anna);
  const confirmed = runtime.reduceCoreState(withSceneB, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_MENTION_CONFIRM,
    payload: {
      projectId,
      sceneId: sceneAId,
      entityId: 'entity-anna',
      mentionId: anna.mentionId,
      evidenceAnchor: anna.evidenceAnchor,
      decisionId: 'decision-anna',
    },
  });
  assert.equal(confirmed.ok, true);
  const moved = runtime.reduceCoreState(confirmed.state, {
    type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
    payload: { projectId, sceneId: sceneAId, text: 'Before Anna met Mira.' },
  });
  assert.equal(moved.ok, true);
  return { derived, projectId, state: moved.state };
}

test('E05 C02: entity dossier derives a read-only surface manifest and evidence ledger for one entity', async () => {
  const { derived, projectId, state } = await buildEntityDossierFixture();

  const result = derived.deriveAtlasEntityDossier({
    coreState: state,
    params: { projectId, entityId: 'entity-anna', limit: 12 },
    capabilitySnapshot: {
      platformId: 'node',
      capabilities: {
        atlasEntityDossier: true,
        atlasObservationAggregate: true,
        atlasTemporalContinuity: true,
        atlasEvidenceReattachmentInbox: true,
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.schemaVersion, derived.ATLAS_ENTITY_DOSSIER_SCHEMA_VERSION);
  assert.equal(result.value.surfaceManifest.schemaVersion, derived.ATLAS_ENTITY_DOSSIER_SURFACE_MANIFEST_VERSION);
  assert.equal(result.value.surfaceManifest.providerId, 'query.atlasEntityDossier');
  assert.equal(result.value.surfaceManifest.slotId, 'rightRail.context.atlas.entityDossier');
  assert.equal(result.value.surfaceManifest.commandAuthority, 'none');
  assert.equal(result.value.authority.readModelOnly, true);
  assert.equal(result.value.authority.projectTruthMutation, false);
  assert.equal(result.value.authority.storageMutation, false);
  assert.equal(result.value.authority.networkMutation, false);
  assert.equal(result.value.authority.evidenceLedgerTruth, false);

  assert.equal(result.value.selectedEntityId, 'entity-anna');
  assert.equal(result.value.entity.name, 'Anna');
  assert.equal(result.value.summary.activeObservationCount, 2);
  assert.equal(result.value.summary.sceneCount, 2);
  assert.equal(result.value.summary.aliasCount, 1);
  assert.equal(result.value.summary.relationCount, 1);
  assert.equal(result.value.summary.reviewRequiredEvidenceCount, 1);
  assert.equal(result.value.summary.evidenceHealth, 'reviewRequired');
  assert.match(result.value.summary.dossierHash, /^[0-9a-f]{64}$/u);
  assert.equal(result.value.evidenceLedger.schemaVersion, derived.ATLAS_ENTITY_EVIDENCE_LEDGER_SCHEMA_VERSION);
  assert.equal(result.value.evidenceLedger.readOnly, true);
  assert.equal(result.value.evidenceLedger.commandAuthority, 'none');
  assert.ok(result.value.evidenceLedger.rows.some((row) => row.rowKind === 'sourceRecord' && row.evidenceState === 'REVIEW_REQUIRED'));
  assert.ok(result.value.evidenceLedger.rows.some((row) => row.rowKind === 'observation' && row.evidenceState === 'CURRENT'));
  assert.equal(result.value.evidence.designAdvisory.applied, true);
  assert.equal(result.value.evidence.designAdvisory.runtimeMetadataIncluded, false);
  assert.equal(result.value.evidence.designAdvisory.readinessToken, false);
});

test('E05 C02: entity dossier chooses a deterministic entity and fails closed without mutation', async () => {
  const { derived, projectId, state } = await buildEntityDossierFixture();

  const implicit = derived.deriveAtlasEntityDossier({ coreState: state, params: { projectId } });
  assert.equal(implicit.ok, true);
  assert.equal(implicit.value.selectedEntityId, 'entity-anna');

  const missingProjectId = derived.deriveAtlasEntityDossier({ coreState: state, params: {} });
  assert.equal(missingProjectId.ok, false);
  assert.equal(missingProjectId.error.code, 'E_ATLAS_PROJECT_ID_REQUIRED');

  const disabled = derived.deriveAtlasEntityDossier({
    coreState: state,
    params: { projectId, entityId: 'entity-anna' },
    capabilitySnapshot: { capabilities: { atlasEntityDossier: false } },
  });
  assert.equal(disabled.ok, false);
  assert.equal(disabled.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');
  assert.equal(disabled.error.details.capabilityId, 'atlas.entityDossier');

  const empty = derived.deriveAtlasEntityDossier({
    coreState: { version: 1, data: { projects: { [projectId]: { id: projectId, atlas: { schemaVersion: 'atlas.author.v1', entities: {} }, scenes: {} } } } },
    params: { projectId },
  });
  assert.equal(empty.ok, true);
  assert.equal(empty.value.state, 'empty');
  assert.equal(empty.value.evidenceLedger.rows.length, 0);
});

test('E05 C02: entity dossier exports through barrels and keeps side-effect boundaries closed', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'index.mjs'));

  assert.equal(typeof derived.deriveAtlasEntityDossier, 'function');
  assert.equal(typeof atlas.deriveAtlasEntityDossier, 'function');
  assert.equal(derived.ATLAS_ENTITY_DOSSIER_VIEW_ID, 'derived.atlas.entityDossier.v1');
  assert.equal(atlas.ATLAS_ENTITY_EVIDENCE_LEDGER_SCHEMA_VERSION, 'derived.atlas.entityEvidenceLedger.v1');

  const sources = [
    'src/derived/atlas/deriveAtlasEntityDossier.mjs',
    'src/derived/atlas/atlasEntityDossierTypes.mjs',
  ].map((relativePath) => [path.basename(relativePath), fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')]);
  const forbiddenPatterns = [
    /from\s+['"]node:fs['"]/u,
    /from\s+['"]node:child_process['"]/u,
    /from\s+['"]node:http['"]/u,
    /from\s+['"]node:https['"]/u,
    /from\s+['"]node:net['"]/u,
    /from\s+['"]electron['"]/u,
    /\bwriteFile(?:Sync)?\s*\(/u,
    /\bappendFile(?:Sync)?\s*\(/u,
    /\bmkdir(?:Sync)?\s*\(/u,
    /\brename(?:Sync)?\s*\(/u,
    /\bunlink(?:Sync)?\s*\(/u,
    /\brm(?:Sync)?\s*\(/u,
    /\blocalStorage\b/u,
    /\bsessionStorage\b/u,
    /\bindexedDB\b/u,
    /\bquerySelector\b/u,
    /\bdispatchEvent\b/u,
  ];
  for (const [basename, source] of sources) {
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, `${basename} matched ${pattern.source}`);
    }
  }
});

test('E05 C02: renderer and main wire entity dossier through typed read-only host only', () => {
  const mainSource = fs.readFileSync(path.join(process.cwd(), 'src', 'main.js'), 'utf8');
  const editorSource = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'editor.js'), 'utf8');
  const htmlSource = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'index.html'), 'utf8');
  const cssSource = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'styles.css'), 'utf8');

  assert.match(mainSource, /const ATLAS_ENTITY_DOSSIER_QUERY_ID = WORKSPACE_QUERY_IDS\.ATLAS_ENTITY_DOSSIER/u);
  assert.match(mainSource, /loadAtlasEntityDossierModule/u);
  assert.match(mainSource, /handleWorkspaceAtlasEntityDossierQuery/u);
  assert.match(mainSource, /\[ATLAS_ENTITY_DOSSIER_QUERY_ID,\s*handleWorkspaceAtlasEntityDossierQuery\]/u);
  assert.doesNotMatch(mainSource, /handleWorkspaceAtlasEntityDossierQuery[\s\S]{0,2400}writeFileAtomic/u);

  assert.match(htmlSource, /data-atlas-entity-dossier-host/u);
  assert.match(htmlSource, /data-atlas-entity-dossier-provider="query\.atlasEntityDossier"/u);
  assert.match(editorSource, /const ATLAS_ENTITY_DOSSIER_QUERY_ID = WORKSPACE_QUERY_IDS\.ATLAS_ENTITY_DOSSIER/u);
  assert.match(editorSource, /refreshAtlasEntityDossier/u);
  assert.match(editorSource, /atlasSelectedEntityId/u);
  assert.match(editorSource, /data-atlas-entity-id/u);
  assert.match(editorSource, /selectAtlasEntity/u);
  assert.doesNotMatch(editorSource, /ATLAS_ENTITY_DOSSIER_QUERY_ID[\s\S]{0,600}invokePreloadUiCommandBridge/u);
  assert.match(cssSource, /\.right-rail-surface--atlas-entity-dossier/u);
  assert.match(cssSource, /\.right-rail-atlas-entity__head\[role="button"\]:focus-visible/u);
});
