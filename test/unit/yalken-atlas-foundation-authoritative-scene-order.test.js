const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  return import(pathToFileURL(path.join(process.cwd(), relativePath)).href);
}

async function buildFixture({
  sceneOrder = ['scene-2', 'scene-10', 'scene-1'],
  omitSceneOrder = false,
} = {}) {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const projectId = 'atlas-authoritative-order-project';
  const created = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Authoritative order', sceneId: 'scene-2' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-anna', name: 'Anna', entityKind: 'character' },
    },
  ]);
  assert.equal(created.ok, true);
  const state = JSON.parse(JSON.stringify(created.state));
  const project = state.data.projects[projectId];
  project.scenes['scene-2'] = { id: 'scene-2', title: 'Opening', text: 'Anna promises to return.' };
  project.scenes['scene-10'] = { id: 'scene-10', title: 'Middle', text: 'Anna crosses the bridge.' };
  project.scenes['scene-1'] = { id: 'scene-1', title: 'Ending', text: 'Anna breaks the promise.' };
  if (!omitSceneOrder) project.sceneOrder = sceneOrder;
  return { runtime, derived, projectId, state };
}

function continuityFactCommand(runtime, state, projectId, sceneId, factId, quote, promiseState) {
  const sceneText = state.data.projects[projectId].scenes[sceneId].text;
  const startOffset = sceneText.indexOf(quote);
  assert.notEqual(startOffset, -1);
  return {
    type: runtime.CORE_COMMAND_IDS.ATLAS_CONTINUITY_FACT_RECORD,
    payload: {
      projectId,
      ledgerKind: 'promise',
      factId,
      sceneId,
      subjectEntityId: 'entity-anna',
      factLabel: 'Return promise',
      factValue: 'Anna will return',
      promiseState,
      evidenceAnchor: {
        schemaVersion: 'atlas.evidenceAnchor.v1',
        anchorId: `anchor-${factId}`,
        projectId,
        sceneId,
        entityId: 'entity-anna',
        startOffset,
        endOffset: startOffset + quote.length,
        quote,
        quoteHash: runtime.hashCoreState(quote),
        sceneTextHash: runtime.hashCoreState(sceneText),
      },
    },
  };
}

test('ATLAS-01: temporal and temporal-anchor projections preserve explicit authored scene order', async () => {
  const { derived, projectId, state } = await buildFixture();
  const temporal = derived.deriveAtlasTemporalContinuity({
    coreState: state,
    params: { projectId, languageCode: 'en' },
  });
  const anchors = derived.deriveAtlasSceneTemporalAnchors({
    coreState: state,
    params: { projectId },
  });

  assert.equal(temporal.ok, true);
  assert.equal(anchors.ok, true);
  assert.deepEqual(
    temporal.value.sceneOrder.map((scene) => scene.sceneId),
    ['scene-2', 'scene-10', 'scene-1'],
  );
  assert.deepEqual(
    anchors.value.sceneTemporalAnchors.map((scene) => scene.sceneId),
    ['scene-2', 'scene-10', 'scene-1'],
  );
  const anna = temporal.value.entityAppearances.find((item) => item.entityId === 'entity-anna');
  assert.deepEqual(anna.appearances.map((appearance) => appearance.sceneId), ['scene-2', 'scene-10', 'scene-1']);
  assert.equal(anna.firstAppearance.sceneId, 'scene-2');
  assert.equal(anna.lastAppearance.sceneId, 'scene-1');
});

test('ATLAS-01: mixed-language route ordering follows sceneOrdinal rather than stable-id lexical order', async () => {
  const { derived, projectId, state } = await buildFixture();
  const routed = derived.deriveAtlasMixedLanguageRouter({
    coreState: state,
    params: { projectId },
  });

  assert.equal(routed.ok, true);
  assert.deepEqual(
    routed.value.routes.map((route) => route.sceneId),
    ['scene-2', 'scene-10', 'scene-1'],
  );
  assert.deepEqual(
    routed.value.routes.map((route) => route.sceneOrdinal),
    [0, 1, 2],
  );
});

test('ATLAS-01: continuity findings and ledger evidence preserve authored order before and after reorder', async () => {
  const { runtime, derived, projectId, state } = await buildFixture();
  const recorded = runtime.applyCoreSequence(state, [
    continuityFactCommand(runtime, state, projectId, 'scene-2', 'promise-open', 'Anna promises to return', 'open'),
    continuityFactCommand(runtime, state, projectId, 'scene-1', 'promise-broken', 'Anna breaks the promise', 'broken'),
  ]);
  assert.equal(recorded.ok, true);
  const capabilitySnapshot = {
    platformId: 'node',
    capabilities: {
      atlasContinuityFactLedgers: true,
      atlasContinuityFindings: true,
      atlasContinuityLedgerSurface: true,
    },
  };

  const findings = derived.deriveAtlasContinuityFindings({
    coreState: recorded.state,
    params: { projectId },
    capabilitySnapshot,
  });
  const ledger = derived.deriveAtlasContinuityLedgerSurface({
    coreState: recorded.state,
    params: { projectId },
    capabilitySnapshot,
  });
  assert.equal(findings.ok, true);
  assert.equal(ledger.ok, true);
  const finding = findings.value.findings.find((item) => item.findingKind === 'PROMISE_BROKEN');
  const row = ledger.value.rows.find((item) => item.findingKind === 'PROMISE_BROKEN');
  assert.deepEqual(finding.sceneIds, ['scene-2', 'scene-1']);
  assert.deepEqual(finding.sceneOrdinals, [0, 2]);
  assert.deepEqual(row.sceneIds, ['scene-2', 'scene-1']);
  assert.deepEqual(row.evidenceRows.map((item) => item.sceneId), ['scene-2', 'scene-1']);
  assert.deepEqual(row.evidenceRows.map((item) => item.sceneOrdinal), [0, 2]);

  const reorderedState = JSON.parse(JSON.stringify(recorded.state));
  reorderedState.data.projects[projectId].sceneOrder = ['scene-1', 'scene-10', 'scene-2'];
  const reordered = derived.deriveAtlasContinuityLedgerSurface({
    coreState: reorderedState,
    params: { projectId },
    capabilitySnapshot,
  });
  assert.equal(reordered.ok, true);
  const reorderedRow = reordered.value.rows.find((item) => item.findingKind === 'PROMISE_BROKEN');
  assert.deepEqual(reorderedRow.sceneIds, ['scene-1', 'scene-2']);
  assert.deepEqual(reorderedRow.evidenceRows.map((item) => item.sceneId), ['scene-1', 'scene-2']);
  assert.deepEqual(reorderedRow.evidenceRows.map((item) => item.sceneOrdinal), [0, 2]);
});

test('ATLAS-01: explicit incomplete, duplicate, or unknown scene order fails closed', async () => {
  for (const [sceneOrder, reason] of [
    [['scene-2', 'scene-10'], 'SCENE_ORDER_EXACT_COVERAGE_REQUIRED'],
    [['scene-2', 'scene-10', 'scene-10'], 'SCENE_ORDER_EXACT_COVERAGE_REQUIRED'],
    [['scene-2', 'scene-10', 'scene-404'], 'SCENE_ORDER_EXACT_COVERAGE_REQUIRED'],
    [[' scene-2', 'scene-10', 'scene-1'], 'SCENE_ORDER_SCENE_ID_INVALID'],
    [null, 'SCENE_ORDER_ARRAY_REQUIRED'],
    ['scene-2,scene-10,scene-1', 'SCENE_ORDER_ARRAY_REQUIRED'],
  ]) {
    const { derived, projectId, state } = await buildFixture({ sceneOrder });
    const results = [
      derived.deriveAtlasTemporalContinuity({
        coreState: state,
        params: { projectId, languageCode: 'en' },
      }),
      derived.deriveAtlasSceneTemporalAnchors({
        coreState: state,
        params: { projectId },
      }),
      derived.deriveAtlasMixedLanguageRouter({
        coreState: state,
        params: { projectId },
      }),
    ];
    for (const result of results) {
      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'E_ATLAS_SCENE_ORDER_INVALID');
      assert.equal(result.error.reason, reason);
    }
  }
});

test('ATLAS-01: legacy state without sceneOrder retains deterministic compatibility ordering', async () => {
  const { derived, projectId, state } = await buildFixture({ omitSceneOrder: true });
  const temporal = derived.deriveAtlasTemporalContinuity({
    coreState: state,
    params: { projectId, languageCode: 'en' },
  });

  assert.equal(temporal.ok, true);
  assert.deepEqual(
    temporal.value.sceneOrder.map((scene) => scene.sceneId),
    ['scene-1', 'scene-10', 'scene-2'],
  );
});

test('ATLAS-01: main read-only Product projection carries traversal order with exact scene coverage', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src', 'main.js'), 'utf8');
  const currentSceneStart = source.indexOf('async function buildAtlasCurrentSceneCoreState');
  const currentSceneEnd = source.indexOf('function collectAtlasOverviewSceneNodes', currentSceneStart);
  const start = source.indexOf('async function buildProductCoreStateForCurrentProject');
  const end = source.indexOf('async function buildAtlasOverviewCoreState', start);
  assert.notEqual(currentSceneStart, -1);
  assert.notEqual(currentSceneEnd, -1);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const currentSceneImplementation = source.slice(currentSceneStart, currentSceneEnd);
  const implementation = source.slice(start, end);

  assert.match(currentSceneImplementation, /sceneOrder: \[resolvedNode\.nodeId\]/u);
  assert.match(implementation, /const sceneOrder = \[\]/u);
  assert.match(implementation, /sceneOrder\.push\(node\.nodeId\)/u);
  assert.match(implementation, /sceneOrder,\s+scenes,/u);
  assert.match(implementation, /E_ATLAS_PRODUCT_SCENE_TARGET_INVALID/u);
  assert.match(implementation, /E_ATLAS_PRODUCT_SCENE_DOCUMENT_READ_FAILED/u);
  assert.match(implementation, /E_ATLAS_PRODUCT_SCENE_DOCUMENT_PAYLOAD_INVALID/u);
  assert.match(implementation, /error\.code === 'ENOENT' && node\.kind === 'roman-section'/u);
  assert.match(implementation, /Object\.keys\(scenes\)\.length !== sceneOrder\.length/u);
  assert.match(implementation, /new Set\(sceneOrder\)\.size !== sceneOrder\.length/u);
  assert.doesNotMatch(implementation, /query\.atlasOverview:(?:target|fileRead)/u);
});
