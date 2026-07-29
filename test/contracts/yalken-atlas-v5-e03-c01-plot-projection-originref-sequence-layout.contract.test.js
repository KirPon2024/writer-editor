const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildAtlasFixture({ confirmMention = true } = {}) {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derivedAtlas = await loadModule(path.join('src', 'derived', 'atlas', 'deriveAtlasMentionIndex.mjs'));
  const projectId = 'plot-projection-project';
  const stateAfterCommands = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Plot Projection Fixture', sceneId: 'scene-a' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: {
        projectId,
        sceneId: 'scene-a',
        text: '# Opening Beat\nHero arrives with a map.\n\n## Turn\nThe city answers.',
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'hero', name: 'Hero', entityKind: 'character' },
    },
  ]);
  assert.equal(stateAfterCommands.ok, true);

  const withSecondScene = JSON.parse(JSON.stringify(stateAfterCommands.state));
  withSecondScene.data.projects[projectId].scenes['scene-b'] = {
    id: 'scene-b',
    text: '# Second Beat\nHero chooses the narrow bridge.',
  };
  let state = withSecondScene;

  if (confirmMention) {
    const mentionIndex = derivedAtlas.deriveAtlasMentionIndex({
      coreState: state,
      params: { projectId },
      capabilitySnapshot: { platformId: 'node', capabilities: { atlasMentionIndex: true } },
    });
    assert.equal(mentionIndex.ok, true);
    const mention = mentionIndex.value.mentions.find((item) => item.sceneId === 'scene-a' && item.entityId === 'hero');
    assert.ok(mention);
    const confirmed = runtime.applyCoreSequence(state, [
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
    ]);
    assert.equal(confirmed.ok, true);
    state = confirmed.state;
  }

  return { projectId, state };
}

test('E03 C01: plot projection derives origin refs and sequence layout over confirmed Atlas mentions', async () => {
  const { projectId, state } = await buildAtlasFixture({ confirmMention: true });
  const plot = await loadModule(path.join('src', 'derived', 'plot', 'index.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  assert.equal(derived.derivePlotProjection, plot.derivePlotProjection);
  assert.equal(derived.PLOT_PROJECTION_SCHEMA_VERSION, plot.PLOT_PROJECTION_SCHEMA_VERSION);
  const first = plot.derivePlotProjection({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: { platformId: 'node', capabilities: { plotProjection: true, atlasMentionIndex: true } },
  });
  const second = plot.derivePlotProjection({
    coreState: JSON.parse(JSON.stringify(state)),
    params: { projectId },
    capabilitySnapshot: { platformId: 'node', capabilities: { plotProjection: true, atlasMentionIndex: true } },
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.value.schemaVersion, plot.PLOT_PROJECTION_SCHEMA_VERSION);
  assert.equal(first.value.meta.projectionHash, second.value.meta.projectionHash);
  assert.match(first.value.meta.projectionHash, /^[0-9a-f]{64}$/u);
  assert.equal(first.value.authority.sourceOfTruth, 'project.core');
  assert.equal(first.value.authority.commandAuthority, 'none');
  assert.equal(first.value.authority.projectTruthMutation, false);
  assert.equal(first.value.authority.storageMutation, false);
  assert.equal(first.value.authority.networkMutation, false);
  assert.equal(first.value.authority.rendererMutation, false);

  const sceneA = first.value.nodes.find((node) => node.id === 'plot-scene:scene-a');
  const sceneB = first.value.nodes.find((node) => node.id === 'plot-scene:scene-b');
  const headings = first.value.nodes.filter((node) => node.kind === plot.PLOT_NODE_KIND.HEADING);
  const confirmedMentions = first.value.nodes.filter((node) => node.kind === plot.PLOT_NODE_KIND.ATLAS_MENTION);
  assert.ok(sceneA);
  assert.ok(sceneB);
  assert.equal(headings.length, 3);
  assert.equal(confirmedMentions.length, 1);
  assert.equal(confirmedMentions[0].trustState, 'AUTHOR_CONFIRMED');

  const layoutA = first.value.sequenceLayout.nodes.find((item) => item.nodeId === sceneA.id);
  const layoutB = first.value.sequenceLayout.nodes.find((item) => item.nodeId === sceneB.id);
  assert.equal(first.value.sequenceLayout.schemaVersion, plot.PLOT_SEQUENCE_LAYOUT_SCHEMA_VERSION);
  assert.ok(layoutA.x < layoutB.x);
  assert.equal(layoutA.y, layoutB.y);

  assert.equal(first.value.originRefs.length, first.value.summary.originRefCount);
  assert.ok(first.value.originRefs.every((ref) => ref.schemaVersion === plot.PLOT_ORIGIN_REF_SCHEMA_VERSION));
  assert.ok(first.value.originRefs.every((ref) => ref.projectId === projectId));
  assert.ok(first.value.originRefs.every((ref) => typeof ref.sourceHash === 'string' && /^[0-9a-f]{64}$/u.test(ref.sourceHash)));
  assert.equal(first.value.summary.sceneCount, 2);
  assert.equal(first.value.summary.headingCount, 3);
  assert.equal(first.value.summary.algorithmicMentionCount, 1);
  assert.equal(first.value.summary.confirmedMentionCount, 1);
  assert.equal(first.value.occurrenceEvidenceState, 'available');
});

test('E03 C01: unconfirmed Atlas observations stay occurrence evidence and are not plot truth nodes', async () => {
  const { projectId, state } = await buildAtlasFixture({ confirmMention: false });
  const plot = await loadModule(path.join('src', 'derived', 'plot', 'index.mjs'));
  const projection = plot.derivePlotProjection({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: { platformId: 'node', capabilities: { plotProjection: true, atlasMentionIndex: true } },
  });

  assert.equal(projection.ok, true);
  assert.equal(projection.value.summary.algorithmicMentionCount, 2);
  assert.equal(projection.value.summary.confirmedMentionCount, 0);
  assert.equal(projection.value.nodes.filter((node) => node.kind === plot.PLOT_NODE_KIND.ATLAS_MENTION).length, 0);
  assert.ok(projection.value.occurrenceEvidence.every((item) => item.trustState === 'ALGORITHMIC_OBSERVATION'));
});

test('E03 C01: plot projection fails closed on missing project identity, missing project, and disabled capability', async () => {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const plot = await loadModule(path.join('src', 'derived', 'plot', 'index.mjs'));

  const missingProjectId = plot.derivePlotProjection({
    coreState: runtime.createInitialCoreState(),
    params: {},
    capabilitySnapshot: {},
  });
  assert.equal(missingProjectId.ok, false);
  assert.equal(missingProjectId.error.code, 'E_PLOT_PROJECT_ID_REQUIRED');

  const missingProject = plot.derivePlotProjection({
    coreState: runtime.createInitialCoreState(),
    params: { projectId: 'absent' },
    capabilitySnapshot: {},
  });
  assert.equal(missingProject.ok, false);
  assert.equal(missingProject.error.code, 'E_PLOT_PROJECT_NOT_FOUND');

  const disabled = plot.derivePlotProjection({
    coreState: runtime.createInitialCoreState(),
    params: { projectId: 'absent' },
    capabilitySnapshot: { capabilities: { plotProjection: false } },
  });
  assert.equal(disabled.ok, false);
  assert.equal(disabled.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');
  assert.equal(disabled.error.details.capabilityId, 'plot.projection');
});

test('E03 C01: plot projection adds no storage, network, renderer, or UI bypass', () => {
  const sources = [
    path.join(process.cwd(), 'src', 'derived', 'plot', 'derivePlotProjection.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'plot', 'plotProjectionTypes.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'plot', 'index.mjs'),
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
