const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildCrossProjectionFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'deriveAtlasMentionIndex.mjs'));
  const projectId = 'cross-projection-project';
  const sceneId = 'scene-a';
  const text = '# Opening\nMira chooses duty over crown.';
  const dutyStart = text.indexOf('duty');
  const dutyEnd = dutyStart + 'duty'.length;
  const textHash = derived.hashCanonicalValue(text);
  const created = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Cross Projection Fixture', sceneId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId, text },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'duty-entity', name: 'duty', entityKind: 'theme' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.IDEA_CREATE,
      payload: { projectId, ideaId: 'idea-duty', title: 'Duty over crown' },
    },
  ]);
  assert.equal(created.ok, true);

  const mentionIndex = atlas.deriveAtlasMentionIndex({
    coreState: created.state,
    params: { projectId },
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasMentionIndex: true } },
  });
  assert.equal(mentionIndex.ok, true);
  const mention = mentionIndex.value.mentions.find((item) => item.sceneId === sceneId && item.entityId === 'duty-entity');
  assert.ok(mention);
  assert.equal(mention.startOffset, dutyStart);
  assert.equal(mention.endOffset, dutyEnd);

  const authorCommands = [
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_MENTION_CONFIRM,
      payload: {
        projectId,
        sceneId: mention.sceneId,
        entityId: mention.entityId,
        mentionId: mention.mentionId,
        evidenceAnchor: mention.evidenceAnchor,
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.IDEA_ORIGIN_LINK_ADD,
      payload: {
        projectId,
        ideaId: 'idea-duty',
        linkId: 'link-duty',
        originRef: {
          schemaVersion: derived.IDEA_ORIGIN_REF_SCHEMA_VERSION,
          kind: 'sceneTextRange',
          sceneId,
          startOffset: dutyStart,
          endOffset: dutyEnd,
          sourceHash: textHash,
          targetId: 'idea-duty',
        },
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MEANING_PROMOTE,
      payload: {
        projectId,
        meaningId: 'meaning-duty-origin',
        title: 'Duty is chosen',
        interpretation: 'The passage explicitly frames duty as a choice.',
        source: {
          kind: 'sceneOriginRef',
          originRef: {
            schemaVersion: derived.IDEA_ORIGIN_REF_SCHEMA_VERSION,
            kind: 'sceneTextRange',
            sceneId,
            startOffset: dutyStart,
            endOffset: dutyEnd,
            sourceHash: textHash,
            targetId: 'meaning-duty-origin',
          },
        },
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MEANING_PROMOTE,
      payload: {
        projectId,
        meaningId: 'meaning-duty-idea',
        title: 'Duty defeats power',
        interpretation: 'The idea promotes duty above the crown.',
        source: { kind: 'idea', ideaId: 'idea-duty' },
      },
    },
  ];
  const authored = runtime.applyCoreSequence(created.state, authorCommands);
  assert.equal(authored.ok, true);
  return {
    runtime,
    derived,
    projectId,
    sceneId,
    text,
    state: authored.state,
    coreStateHash: runtime.hashCoreState(authored.state),
  };
}

test('E03 C04: cross projection preview builds a deterministic shared origin ref impact packet', async () => {
  const { derived, projectId, state, coreStateHash } = await buildCrossProjectionFixture();
  const first = derived.deriveCrossProjectionImpactPreview({
    coreState: state,
    params: { projectId, expectedCoreStateHash: coreStateHash },
    capabilitySnapshot: {
      platformId: 'node',
      capabilities: {
        atlasMentionIndex: true,
        plotProjection: true,
        ideaProjection: true,
        meaningProjection: true,
        crossProjectionImpactPreview: true,
      },
    },
  });
  const second = derived.deriveCrossProjectionImpactPreview({
    coreState: JSON.parse(JSON.stringify(state)),
    params: { projectId, expectedCoreStateHash: coreStateHash },
    capabilitySnapshot: {
      platformId: 'node',
      capabilities: {
        atlasMentionIndex: true,
        plotProjection: true,
        ideaProjection: true,
        meaningProjection: true,
        crossProjectionImpactPreview: true,
      },
    },
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.value.schemaVersion, derived.CROSS_PROJECTION_IMPACT_PREVIEW_SCHEMA_VERSION);
  assert.equal(first.value.canvasGraphPacket.schemaVersion, derived.CROSS_PROJECTION_GRAPH_PACKET_SCHEMA_VERSION);
  assert.equal(first.value.meta.previewHash, second.value.meta.previewHash);
  assert.match(first.value.meta.previewHash, /^[0-9a-f]{64}$/u);
  assert.equal(first.value.staleGuard.state, 'matched');
  assert.equal(first.value.staleGuard.expectedCoreStateHash, coreStateHash);
  assert.equal(first.value.staleGuard.actualCoreStateHash, coreStateHash);
  assert.equal(first.value.authority.commandAuthority, 'none');
  assert.equal(first.value.authority.secondTruthStore, false);
  assert.equal(first.value.authority.projectTruthMutation, false);
  assert.equal(first.value.authority.storageMutation, false);
  assert.equal(first.value.authority.networkMutation, false);
  assert.equal(first.value.authority.rendererMutation, false);
  assert.equal(first.value.summary.sourceProjectionCount, 3);
  assert.ok(first.value.summary.canvasNodeCount > 0);
  assert.ok(first.value.summary.canvasEdgeCount > 0);

  const sharedDuty = first.value.impactItems.find((item) => {
    const objectIds = item.affectedObjects.map((object) => object.objectId);
    return item.relationKind === 'sharedOriginRef'
      && item.hasCrossProjectionImpact
      && objectIds.some((id) => id.startsWith('plot-atlas-mention:'))
      && objectIds.includes('idea-duty')
      && objectIds.includes('meaning-duty-origin');
  });
  assert.ok(sharedDuty);
  assert.equal(sharedDuty.crossProjectionCount, 3);
  assert.equal(sharedDuty.hasCrossProjectionImpact, true);
  assert.deepEqual([...new Set(sharedDuty.affectedObjects.map((object) => object.projection))].sort(), ['idea', 'meaning', 'plot']);
  assert.equal(Object.prototype.hasOwnProperty.call(sharedDuty, 'quote'), false);

  const relationImpact = first.value.impactItems.find((item) => item.relationKind === derived.CROSS_PROJECTION_EDGE_KIND.MEANING_PROMOTED_FROM_IDEA);
  assert.ok(relationImpact);
  assert.equal(relationImpact.sourceObject.objectId, 'idea-duty');
  assert.equal(relationImpact.affectedObjects[0].objectId, 'meaning-duty-idea');

  const relationEdge = first.value.canvasGraphPacket.edges.find((edge) => edge.kind === derived.CROSS_PROJECTION_EDGE_KIND.MEANING_PROMOTED_FROM_IDEA);
  assert.ok(relationEdge);
  assert.match(relationEdge.from, /idea-duty/u);
  assert.match(relationEdge.to, /meaning-duty-idea/u);
});

test('E03 C04: cross projection preview fails closed for missing, stale, or disabled authority inputs', async () => {
  const { derived, projectId, state, coreStateHash } = await buildCrossProjectionFixture();

  const missingProjectId = derived.deriveCrossProjectionImpactPreview({
    coreState: state,
    params: { expectedCoreStateHash: coreStateHash },
    capabilitySnapshot: {},
  });
  assert.equal(missingProjectId.ok, false);
  assert.equal(missingProjectId.error.code, 'E_CROSS_PROJECTION_PROJECT_ID_REQUIRED');

  const missingExpectedHash = derived.deriveCrossProjectionImpactPreview({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: {},
  });
  assert.equal(missingExpectedHash.ok, false);
  assert.equal(missingExpectedHash.error.code, 'E_CROSS_PROJECTION_EXPECTED_CORE_STATE_HASH_REQUIRED');

  const stale = derived.deriveCrossProjectionImpactPreview({
    coreState: state,
    params: { projectId, expectedCoreStateHash: '0'.repeat(64) },
    capabilitySnapshot: {},
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.error.code, 'E_CROSS_PROJECTION_STALE_CORE_STATE_HASH');
  assert.equal(stale.error.details.expectedCoreStateHash, '0'.repeat(64));
  assert.equal(stale.error.details.actualCoreStateHash, coreStateHash);

  const disabled = derived.deriveCrossProjectionImpactPreview({
    coreState: state,
    params: { projectId, expectedCoreStateHash: coreStateHash },
    capabilitySnapshot: { capabilities: { crossProjectionImpactPreview: false } },
  });
  assert.equal(disabled.ok, false);
  assert.equal(disabled.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');
  assert.equal(disabled.error.details.capabilityId, 'crossProjection.impactPreview');
});

test('E03 C04: cross projection preview exports through the derived barrel and adds no mutation bypass', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const projections = await loadModule(path.join('src', 'derived', 'projections', 'index.mjs'));
  assert.equal(derived.deriveCrossProjectionImpactPreview, projections.deriveCrossProjectionImpactPreview);
  assert.equal(derived.CROSS_PROJECTION_IMPACT_PREVIEW_SCHEMA_VERSION, projections.CROSS_PROJECTION_IMPACT_PREVIEW_SCHEMA_VERSION);

  const sources = [
    path.join(process.cwd(), 'src', 'derived', 'projections', 'deriveCrossProjectionImpactPreview.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'projections', 'crossProjectionTypes.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'projections', 'index.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'index.mjs'),
  ];
  const forbidden = [
    /from\s+['"]node:fs['"]/u,
    /from\s+['"]node:child_process['"]/u,
    /from\s+['"]node:http['"]/u,
    /from\s+['"]node:https['"]/u,
    /from\s+['"]node:net['"]/u,
    /from\s+['"]electron['"]/u,
    /\bwriteFile(?:Sync)?\s*\(/u,
    /\bappendFile(?:Sync)?\s*\(/u,
    /\blocalStorage\b/u,
    /\bsessionStorage\b/u,
    /\bindexedDB\b/u,
    /\baddEventListener\s*\(/u,
    /dispatchUiCommand/u,
  ];

  for (const sourcePath of sources) {
    const source = fs.readFileSync(sourcePath, 'utf8');
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${path.basename(sourcePath)} matched ${pattern.source}`);
    }
  }
});
