const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildContinuityLedgerSurfaceFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const projectId = 'atlas-continuity-ledger-surface-project';
  const sceneAId = 'scene-a';
  const sceneBId = 'scene-b';
  const sceneCId = 'scene-c';
  const created = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas continuity ledger surface', sceneId: sceneAId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: {
        projectId,
        sceneId: sceneAId,
        text: 'Anna promises Mira she will return, but later she breaks that promise.',
      },
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
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-key', name: 'Key', entityKind: 'object' },
    },
  ]);
  assert.equal(created.ok, true);
  const state = JSON.parse(JSON.stringify(created.state));
  state.data.projects[projectId].scenes[sceneBId] = {
    id: sceneBId,
    title: 'Key',
    text: 'Mira knows the key is hidden. Mira does not know the key is hidden.',
  };
  state.data.projects[projectId].scenes[sceneCId] = {
    id: sceneCId,
    title: 'Market',
    text: 'Anna is in the market. Anna is in the blue room. Mira is missing from the market, then Mira appears at the gate.',
  };
  return { runtime, derived, projectId, sceneAId, sceneBId, sceneCId, state };
}

function evidenceAnchorFor(runtime, state, projectId, sceneId, entityId, quote, anchorId) {
  const text = state.data.projects[projectId].scenes[sceneId].text;
  const startOffset = text.indexOf(quote);
  assert.notEqual(startOffset, -1, quote);
  const endOffset = startOffset + quote.length;
  return {
    schemaVersion: 'atlas.evidenceAnchor.v1',
    anchorId,
    projectId,
    sceneId,
    entityId,
    startOffset,
    endOffset,
    quote,
    quoteHash: runtime.hashCoreState(quote),
    sceneTextHash: runtime.hashCoreState(text),
  };
}

function factCommand(runtime, state, projectId, sceneId, subjectEntityId, ledgerKind, factId, factLabel, factValue, quote, extra = {}) {
  return {
    type: runtime.CORE_COMMAND_IDS.ATLAS_CONTINUITY_FACT_RECORD,
    payload: {
      projectId,
      ledgerKind,
      factId,
      sceneId,
      subjectEntityId,
      factLabel,
      factValue,
      evidenceAnchor: evidenceAnchorFor(runtime, state, projectId, sceneId, subjectEntityId, quote, `anchor-${factId}`),
      ...extra,
    },
  };
}

function nodeCapabilitySnapshot() {
  return {
    platformId: 'node',
    capabilities: {
      atlasContinuityLedgerSurface: true,
      atlasContinuityFindings: true,
      atlasContinuityFactLedgers: true,
    },
  };
}

test('E06 C07: continuity ledger surface derives finding rows with evidence jump intents and correction route disclosure', async () => {
  const { runtime, derived, projectId, sceneAId, sceneBId, sceneCId, state } = await buildContinuityLedgerSurfaceFixture();
  const beforeHash = runtime.hashCoreState(state);
  const recorded = runtime.applyCoreSequence(state, [
    factCommand(runtime, state, projectId, sceneAId, 'entity-anna', 'promise', 'promise-open', 'Return promise', 'Anna promises Mira she will return', 'promises Mira she will return', { promiseState: 'open', relatedEntityIds: ['entity-mira'] }),
    factCommand(runtime, state, projectId, sceneAId, 'entity-anna', 'promise', 'promise-broken', 'Return promise', 'Anna promises Mira she will return', 'breaks that promise', { promiseState: 'broken', relatedEntityIds: ['entity-mira'] }),
    factCommand(runtime, state, projectId, sceneBId, 'entity-mira', 'knowledge', 'knowledge-knows', 'Mira key knowledge', 'knows key location', 'Mira knows the key is hidden', { relatedEntityIds: ['entity-key'] }),
    factCommand(runtime, state, projectId, sceneBId, 'entity-mira', 'knowledge', 'knowledge-not-knows', 'Mira key knowledge', 'does not know key location', 'Mira does not know the key is hidden', { relatedEntityIds: ['entity-key'] }),
    factCommand(runtime, state, projectId, sceneCId, 'entity-anna', 'location', 'location-market', 'Anna location', 'market', 'Anna is in the market'),
    factCommand(runtime, state, projectId, sceneCId, 'entity-anna', 'location', 'location-blue-room', 'Anna location', 'blue room', 'Anna is in the blue room'),
  ]);
  assert.equal(recorded.ok, true);

  const result = derived.deriveAtlasContinuityLedgerSurface({
    coreState: recorded.state,
    params: { projectId, rowLimit: 3 },
    capabilitySnapshot: nodeCapabilitySnapshot(),
  });

  assert.equal(result.ok, true);
  assert.equal(runtime.hashCoreState(state), beforeHash);
  assert.equal(result.value.schemaVersion, derived.ATLAS_CONTINUITY_LEDGER_SURFACE_SCHEMA_VERSION);
  assert.equal(result.value.surfaceManifest.schemaVersion, derived.ATLAS_CONTINUITY_LEDGER_SURFACE_MANIFEST_VERSION);
  assert.equal(result.value.surfaceManifest.providerId, 'query.atlasContinuityLedgerSurface');
  assert.equal(result.value.surfaceManifest.slotId, 'rightRail.context.atlas.continuityLedger');
  assert.equal(result.value.surfaceManifest.heavySurface, true);
  assert.equal(result.value.surfaceManifest.explicitOpenRequired, true);
  assert.equal(result.value.authority.readModelOnly, true);
  assert.equal(result.value.authority.commandAuthority, 'CommandKernel');
  assert.deepEqual(result.value.authority.commandIds, ['atlas.continuityFact.record']);
  assert.equal(result.value.authority.projectTruthMutation, false);
  assert.equal(result.value.authority.manuscriptMutation, false);
  assert.equal(result.value.authority.automaticCorrection, false);
  assert.equal(result.value.authority.automaticApply, false);
  assert.equal(result.value.authority.crossSceneApply, false);
  assert.equal(result.value.authority.jumpToEvidenceIntentOnly, true);

  assert.equal(result.value.state, 'ready');
  assert.ok(result.value.summary.findingCount >= 3);
  assert.equal(result.value.summary.visibleRowCount, 3);
  assert.ok(result.value.summary.omittedRowCount >= 0);
  assert.match(result.value.summary.surfaceHash, /^[0-9a-f]{64}$/u);
  assert.equal(result.value.listParity.schemaVersion, derived.ATLAS_CONTINUITY_LEDGER_LIST_PARITY_SCHEMA_VERSION);
  assert.equal(result.value.listParity.rows.length, result.value.rows.length);
  assert.equal(result.value.listParity.equivalentToFindingRows, true);
  assert.equal(result.value.keyboardContract.schemaVersion, derived.ATLAS_CONTINUITY_LEDGER_KEYBOARD_CONTRACT_SCHEMA_VERSION);
  assert.deepEqual(result.value.keyboardContract.supportedKeys, ['Tab', 'Enter', ' ']);
  assert.equal(result.value.keyboardContract.noPointerOnlyState, true);

  const row = result.value.rows.find((item) => item.findingKind === 'PROMISE_BROKEN') || result.value.rows[0];
  assert.equal(row.schemaVersion, derived.ATLAS_CONTINUITY_LEDGER_ROW_SCHEMA_VERSION);
  assert.ok(row.evidenceRows.length > 0);
  assert.equal(row.evidenceRows[0].schemaVersion, derived.ATLAS_CONTINUITY_LEDGER_EVIDENCE_ROW_SCHEMA_VERSION);
  assert.equal(row.evidenceRows[0].jumpIntent.schemaVersion, derived.ATLAS_CONTINUITY_LEDGER_JUMP_INTENT_SCHEMA_VERSION);
  assert.equal(row.evidenceRows[0].jumpIntent.commandId, 'none');
  assert.equal(row.evidenceRows[0].jumpIntent.productMutation, false);
  assert.equal(row.evidenceRows[0].jumpIntent.selectionOnly, true);
  assert.equal(row.correctionRoutes[0].schemaVersion, derived.ATLAS_CONTINUITY_LEDGER_CORRECTION_ROUTE_SCHEMA_VERSION);
  assert.equal(row.correctionRoutes[0].commandId, 'atlas.continuityFact.record');
  assert.equal(row.correctionRoutes[0].intentOnly, true);
  assert.equal(row.correctionRoutes[0].automaticCorrection, false);
  assert.equal(row.correctionRoutes[0].automaticApply, false);
  assert.equal(result.value.evidence.lazyweb.applied, true);
  assert.equal(result.value.evidence.lazyweb.fullReport, 'unavailable');
  assert.equal(result.value.evidence.uiCraft.applied, true);
  assert.equal(result.value.evidence.heuristic.applied, true);
});

test('E06 C07: continuity ledger surface handles empty and disabled capability states', async () => {
  const { derived, projectId, state } = await buildContinuityLedgerSurfaceFixture();
  const empty = derived.deriveAtlasContinuityLedgerSurface({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: nodeCapabilitySnapshot(),
  });
  assert.equal(empty.ok, true);
  assert.equal(empty.value.state, 'empty');
  assert.equal(empty.value.rows.length, 0);
  assert.equal(empty.value.authority.automaticApply, false);

  const disabled = derived.deriveAtlasContinuityLedgerSurface({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: { capabilities: { atlasContinuityLedgerSurface: false } },
  });
  assert.equal(disabled.ok, false);
  assert.equal(disabled.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');
  assert.equal(disabled.error.details.capabilityId, 'atlas.continuityLedgerSurface');
});

test('E06 C07: continuity ledger surface exports through barrels', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'index.mjs'));

  assert.equal(typeof derived.deriveAtlasContinuityLedgerSurface, 'function');
  assert.equal(typeof atlas.deriveAtlasContinuityLedgerSurface, 'function');
  assert.equal(derived.ATLAS_CONTINUITY_LEDGER_SURFACE_VIEW_ID, 'derived.atlas.continuityLedgerSurface.v1');
  assert.equal(typeof derived.sortAtlasContinuityLedgerRows, 'function');
  assert.equal(typeof derived.sortAtlasContinuityLedgerEvidenceRows, 'function');
});

test('E06 C07: renderer and main wire continuity ledger as explicit-open surface with intent-only correction route', () => {
  const mainSource = fs.readFileSync(path.join(process.cwd(), 'src', 'main.js'), 'utf8');
  const editorSource = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'editor.js'), 'utf8');
  const htmlSource = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'index.html'), 'utf8');
  const cssSource = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'styles.css'), 'utf8');

  assert.match(mainSource, /const ATLAS_CONTINUITY_LEDGER_SURFACE_QUERY_ID = 'query\.atlasContinuityLedgerSurface'/u);
  assert.match(mainSource, /loadAtlasContinuityLedgerSurfaceModule/u);
  assert.match(mainSource, /handleWorkspaceAtlasContinuityLedgerSurfaceQuery/u);
  assert.match(mainSource, /safePayload\.explicitOpen !== true[\s\S]{0,500}ATLAS_CONTINUITY_LEDGER_EXPLICIT_OPEN_REQUIRED/u);
  assert.match(mainSource, /WORKSPACE_QUERY_BRIDGE_ALLOWED_QUERY_IDS[\s\S]*ATLAS_CONTINUITY_LEDGER_SURFACE_QUERY_ID/u);
  assert.doesNotMatch(mainSource, /handleWorkspaceAtlasContinuityLedgerSurfaceQuery[\s\S]{0,3600}writeFileAtomic/u);

  assert.match(htmlSource, /data-atlas-continuity-ledger-shell[\s\S]{0,80}hidden/u);
  assert.match(htmlSource, /data-atlas-continuity-ledger-host/u);
  assert.match(htmlSource, /data-atlas-continuity-ledger-provider="query\.atlasContinuityLedgerSurface"/u);

  assert.match(editorSource, /const ATLAS_CONTINUITY_LEDGER_SURFACE_QUERY_ID = 'query\.atlasContinuityLedgerSurface'/u);
  assert.match(editorSource, /dataset\.atlasContinuityLedgerOpen = 'true'/u);
  assert.match(editorSource, /function openAtlasContinuityLedgerSurface/u);
  assert.match(editorSource, /async function refreshAtlasContinuityLedgerSurface/u);
  assert.match(editorSource, /if \(atlasContinuityLedgerExplicitOpen !== true\) return/u);
  assert.match(editorSource, /data-atlas-continuity-evidence-jump/u);
  assert.match(editorSource, /data-atlas-continuity-correction-route/u);
  assert.match(editorSource, /renderAtlasContinuityLedgerState\(\);[\s\S]{0,90}refreshAtlasCurrentScene/u);
  assert.doesNotMatch(editorSource, /PROJECT_APPLY_TEXT_EDIT[\s\S]{0,1200}refreshAtlasContinuityLedgerSurface/u);
  assert.doesNotMatch(editorSource, /ATLAS_CONTINUITY_LEDGER_SURFACE_QUERY_ID[\s\S]{0,1000}dispatchUiCommand/u);
  assert.match(cssSource, /\.right-rail-surface--atlas-continuity-ledger/u);
  assert.match(cssSource, /\.right-rail-atlas-continuity-evidence-button:focus-visible/u);
});

test('E06 C07: continuity ledger derived sources keep side-effect boundaries closed', () => {
  const sources = [
    'src/derived/atlas/deriveAtlasContinuityLedgerSurface.mjs',
    'src/derived/atlas/atlasContinuityLedgerSurfaceTypes.mjs',
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
    /\bdocument\./u,
  ];
  for (const [basename, source] of sources) {
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, `${basename} matched ${pattern.source}`);
    }
  }
});
