const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildRelationDossierFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const projectId = 'atlas-relation-dossier-project';
  const sceneAId = 'scene-a';
  const sceneBId = 'scene-b';
  const sceneCId = 'scene-c';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas relation dossier', sceneId: sceneAId },
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
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-mira', name: 'Mira', entityKind: 'character' },
    },
  ]);
  assert.equal(built.ok, true);
  const withScenes = JSON.parse(JSON.stringify(built.state));
  withScenes.data.projects[projectId].scenes[sceneBId] = {
    id: sceneBId,
    title: 'Second',
    text: 'Anna waits alone.',
  };
  withScenes.data.projects[projectId].scenes[sceneCId] = {
    id: sceneCId,
    title: 'Third',
    text: 'Mira returns to Anna.',
  };
  withScenes.data.projects[projectId].languageCode = 'en';

  const aggregate = derived.deriveAtlasObservationAggregate({ coreState: withScenes, params: { projectId, languageCode: 'en' } });
  assert.equal(aggregate.ok, true);
  const anna = aggregate.value.observations.find((observation) => observation.entityId === 'entity-anna' && observation.sceneId === sceneAId);
  assert.ok(anna);
  const confirmed = runtime.reduceCoreState(withScenes, {
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

test('E05 C03: relation dossier derives pair evidence timeline and contextual action intents', async () => {
  const { derived, projectId, state } = await buildRelationDossierFixture();

  const result = derived.deriveAtlasRelationDossier({
    coreState: state,
    params: { projectId, leftEntityId: 'entity-anna', rightEntityId: 'entity-mira', limit: 12 },
    capabilitySnapshot: {
      platformId: 'node',
      capabilities: {
        atlasRelationDossier: true,
        atlasObservationAggregate: true,
        atlasTemporalContinuity: true,
        atlasEvidenceReattachmentInbox: true,
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.schemaVersion, derived.ATLAS_RELATION_DOSSIER_SCHEMA_VERSION);
  assert.equal(result.value.surfaceManifest.schemaVersion, derived.ATLAS_RELATION_DOSSIER_SURFACE_MANIFEST_VERSION);
  assert.equal(result.value.surfaceManifest.providerId, 'query.atlasRelationDossier');
  assert.equal(result.value.surfaceManifest.slotId, 'rightRail.context.atlas.relationDossier');
  assert.equal(result.value.surfaceManifest.commandAuthority, 'CommandKernel');
  assert.equal(result.value.authority.readModelOnly, true);
  assert.equal(result.value.authority.actionDispatch, 'intent-only');
  assert.equal(result.value.authority.projectTruthMutation, false);
  assert.equal(result.value.authority.storageMutation, false);
  assert.equal(result.value.authority.networkMutation, false);
  assert.equal(result.value.authority.automaticRelationCreation, false);

  assert.match(result.value.selectedPairId, /^atlas-cooccurrence:/u);
  assert.equal(result.value.relation.leftEntityId, 'entity-anna');
  assert.equal(result.value.relation.rightEntityId, 'entity-mira');
  assert.equal(result.value.summary.sceneCount, 2);
  assert.equal(result.value.summary.occurrenceCount, 2);
  assert.ok(result.value.summary.evidenceRowCount >= 4);
  assert.equal(result.value.summary.reviewRequiredEvidenceCount, 1);
  assert.equal(result.value.summary.evidenceHealth, 'reviewRequired');
  assert.match(result.value.summary.dossierHash, /^[0-9a-f]{64}$/u);
  assert.equal(result.value.evidencePacket.schemaVersion, derived.ATLAS_RELATION_EVIDENCE_PACKET_SCHEMA_VERSION);
  assert.equal(result.value.evidencePacket.readOnly, true);
  assert.ok(result.value.timelineRows.some((row) => row.leftObservationCount > 0 && row.rightObservationCount > 0));
  assert.ok(result.value.absenceContext.some((row) => row.entityId === 'entity-mira'));
  assert.equal(result.value.contextualReviewActions.schemaVersion, derived.ATLAS_RELATION_CONTEXTUAL_ACTIONS_SCHEMA_VERSION);
  assert.equal(result.value.contextualReviewActions.directDispatch, false);
  assert.ok(result.value.contextualReviewActions.actions.some((action) => action.commandId === 'atlas.observation.suppress' && action.availability === 'available'));
  assert.ok(result.value.contextualReviewActions.actions.some((action) => action.commandId === 'atlas.evidence.reattach' && action.availability === 'available'));
  assert.equal(result.value.evidence.lazyweb.query, 'relationship evidence dashboard');
});

test('E05 C03: relation dossier chooses deterministic relation and fails closed without mutation', async () => {
  const { derived, projectId, state } = await buildRelationDossierFixture();

  const implicit = derived.deriveAtlasRelationDossier({ coreState: state, params: { projectId } });
  assert.equal(implicit.ok, true);
  assert.match(implicit.value.selectedPairId, /^atlas-cooccurrence:/u);

  const missingProjectId = derived.deriveAtlasRelationDossier({ coreState: state, params: {} });
  assert.equal(missingProjectId.ok, false);
  assert.equal(missingProjectId.error.code, 'E_ATLAS_PROJECT_ID_REQUIRED');

  const disabled = derived.deriveAtlasRelationDossier({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: { capabilities: { atlasRelationDossier: false } },
  });
  assert.equal(disabled.ok, false);
  assert.equal(disabled.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');
  assert.equal(disabled.error.details.capabilityId, 'atlas.relationDossier');

  const empty = derived.deriveAtlasRelationDossier({
    coreState: { version: 1, data: { projects: { [projectId]: { id: projectId, atlas: { schemaVersion: 'atlas.author.v1', entities: {} }, scenes: {} } } } },
    params: { projectId },
  });
  assert.equal(empty.ok, true);
  assert.equal(empty.value.state, 'empty');
  assert.equal(empty.value.contextualReviewActions.actions.length, 0);
});

test('E05 C03: relation dossier exports through barrels and keeps side-effect boundaries closed', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'index.mjs'));

  assert.equal(typeof derived.deriveAtlasRelationDossier, 'function');
  assert.equal(typeof atlas.deriveAtlasRelationDossier, 'function');
  assert.equal(derived.ATLAS_RELATION_DOSSIER_VIEW_ID, 'derived.atlas.relationDossier.v1');
  assert.equal(atlas.ATLAS_RELATION_CONTEXTUAL_ACTIONS_SCHEMA_VERSION, 'derived.atlas.relationContextualActions.v1');

  const sources = [
    'src/derived/atlas/deriveAtlasRelationDossier.mjs',
    'src/derived/atlas/atlasRelationDossierTypes.mjs',
    'src/renderer/commands/atlasRelationReviewActions.mjs',
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

test('E05 C03: renderer and main wire relation dossier through typed host and Command Kernel dispatch', () => {
  const mainSource = fs.readFileSync(path.join(process.cwd(), 'src', 'main.js'), 'utf8');
  const editorSource = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'editor.js'), 'utf8');
  const htmlSource = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'index.html'), 'utf8');
  const cssSource = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'styles.css'), 'utf8');
  const actionSource = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'commands', 'atlasRelationReviewActions.mjs'), 'utf8');
  const capabilitySource = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'commands', 'capabilityPolicy.mjs'), 'utf8');
  const productCommandSource = fs.readFileSync(path.join(process.cwd(), 'src', 'shared', 'productCommandRegistry.cjs'), 'utf8');
  const relationListenerStart = editorSource.indexOf("atlasRelationDossierHost?.addEventListener('click'");
  const relationListenerEnd = editorSource.indexOf("atlasHeatmapHost?.addEventListener('click'", relationListenerStart);
  const relationListenerSource = editorSource.slice(relationListenerStart, relationListenerEnd);

  assert.match(mainSource, /const ATLAS_RELATION_DOSSIER_QUERY_ID = WORKSPACE_QUERY_IDS\.ATLAS_RELATION_DOSSIER/u);
  assert.match(mainSource, /loadAtlasRelationDossierModule/u);
  assert.match(mainSource, /handleWorkspaceAtlasRelationDossierQuery/u);
  assert.match(mainSource, /\[ATLAS_RELATION_DOSSIER_QUERY_ID,\s*handleWorkspaceAtlasRelationDossierQuery\]/u);
  assert.doesNotMatch(mainSource, /handleWorkspaceAtlasRelationDossierQuery[\s\S]{0,2600}writeFileAtomic/u);

  assert.match(htmlSource, /data-atlas-relation-dossier-host/u);
  assert.match(htmlSource, /data-atlas-relation-dossier-provider="query\.atlasRelationDossier"/u);
  assert.match(editorSource, /const ATLAS_RELATION_DOSSIER_QUERY_ID = WORKSPACE_QUERY_IDS\.ATLAS_RELATION_DOSSIER/u);
  assert.match(editorSource, /refreshAtlasRelationDossier/u);
  assert.match(editorSource, /atlasSelectedRelation/u);
  assert.match(editorSource, /data-atlas-relation-pair-id/u);
  assert.match(editorSource, /isAtlasRelationReviewActionCommandId/u);
  assert.doesNotMatch(editorSource, /ATLAS_RELATION_DOSSIER_QUERY_ID[\s\S]{0,800}invokePreloadUiCommandBridge/u);
  assert.equal(relationListenerStart >= 0, true);
  assert.equal(relationListenerEnd > relationListenerStart, true);
  assert.match(relationListenerSource, /data-atlas-relation-action-id/u);
  assert.match(relationListenerSource, /await dispatchUiCommand\(commandId,\s*\{/u);
  assert.match(relationListenerSource, /commandAuthority:\s*'CommandKernel'/u);
  assert.doesNotMatch(relationListenerSource, /Atlas review action intent:/u);
  assert.doesNotMatch(relationListenerSource, /reduceCoreState|writeFile|localStorage\.setItem/u);

  assert.match(cssSource, /\.right-rail-surface--atlas-relation-dossier/u);
  assert.match(cssSource, /\.right-rail-atlas-action:focus-visible/u);
  assert.match(actionSource, /atlas\.observation\.suppress/u);
  assert.match(actionSource, /atlas\.observation\.reassign/u);
  assert.match(actionSource, /atlas\.evidence\.reattach/u);
  assert.match(capabilitySource, /PRODUCT_COMMAND_CAPABILITY_BINDING/u);
  assert.match(productCommandSource, /id: 'atlas\.observation\.suppress'[\s\S]{0,160}capabilityId: 'cap\.atlas\.observation\.suppress'/u);
  assert.match(productCommandSource, /id: 'atlas\.evidence\.reattach'[\s\S]{0,160}capabilityId: 'cap\.atlas\.evidence\.reattach'/u);
});
