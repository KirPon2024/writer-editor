const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

function exactIsoRange(calendarId, start, end = start) {
  return {
    rangeKind: 'exact',
    start: { pointKind: 'calendarDate', calendarId, value: start },
    end: { pointKind: 'calendarDate', calendarId, value: end },
  };
}

function exactOrdinalRange(dayIndex) {
  return {
    rangeKind: 'exact',
    start: { pointKind: 'ordinalDay', dayIndex },
    end: { pointKind: 'ordinalDay', dayIndex },
  };
}

async function buildStage06DiagnosticsFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const projectId = 'atlas-stage-06-diagnostics-project';
  const sceneAId = 'scene-a';
  const sceneBId = 'scene-b';
  const created = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas Stage 06 diagnostics', sceneId: sceneAId },
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
  ]);
  assert.equal(created.ok, true);
  const state = JSON.parse(JSON.stringify(created.state));
  state.data.projects[projectId].scenes[sceneBId] = {
    id: sceneBId,
    title: 'Market',
    text: 'Anna is in the market. Anna is in the blue room.',
  };
  const withCalendar = runtime.applyCoreSequence(state, [
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_CALENDAR_DEFINE,
      payload: {
        projectId,
        calendarId: 'calendar-local',
        name: 'Local Gregorian',
        calendarKind: 'real',
        calendarSystem: 'gregorian-proleptic-local',
        conversionRules: [
          {
            ruleId: 'rule-local-identity',
            ruleKind: 'identity',
            sourceScale: 'iso-date',
            targetScale: 'iso-date',
            precision: 'exact',
          },
        ],
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_SCENE_TEMPORAL_ANCHOR_SET,
      payload: {
        projectId,
        sceneId: sceneAId,
        storyRange: exactIsoRange('calendar-local', '2026-07-01'),
        narrativeRange: exactOrdinalRange(0),
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_SCENE_TEMPORAL_ANCHOR_SET,
      payload: {
        projectId,
        sceneId: sceneBId,
        storyRange: exactIsoRange('calendar-local', '2026-07-02'),
        narrativeRange: exactOrdinalRange(1),
      },
    },
  ]);
  assert.equal(withCalendar.ok, true);
  const anchored = withCalendar.state;
  const withFacts = runtime.applyCoreSequence(anchored, [
    factCommand(runtime, anchored, projectId, sceneAId, 'entity-anna', 'promise', 'promise-open', 'Return promise', 'Anna promises Mira she will return', 'promises Mira she will return', { promiseState: 'open', relatedEntityIds: ['entity-mira'] }),
    factCommand(runtime, anchored, projectId, sceneAId, 'entity-anna', 'promise', 'promise-broken', 'Return promise', 'Anna promises Mira she will return', 'breaks that promise', { promiseState: 'broken', relatedEntityIds: ['entity-mira'] }),
    factCommand(runtime, anchored, projectId, sceneBId, 'entity-anna', 'location', 'location-market', 'Anna location', 'market', 'Anna is in the market'),
    factCommand(runtime, anchored, projectId, sceneBId, 'entity-anna', 'location', 'location-blue-room', 'Anna location', 'blue room', 'Anna is in the blue room'),
  ]);
  assert.equal(withFacts.ok, true);
  return { derived, projectId, state: withFacts.state };
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

function capabilitySnapshot(overrides = {}) {
  return {
    platformId: 'node',
    capabilities: {
      atlasDiagnosticsStageAcceptance: true,
      atlasOverview: true,
      atlasMatrices: true,
      atlasHeatmap: true,
      atlasTemporalLayout: true,
      atlasCalendarDefinitions: true,
      atlasSceneTemporalAnchors: true,
      atlasRelationSegmentsPerspective: true,
      atlasContinuityFactLedgers: true,
      atlasContinuityFindings: true,
      atlasContinuityLedgerSurface: true,
      atlasReportsSavedQueries: true,
      atlasObservationAggregate: true,
      atlasTemporalContinuity: true,
      atlasLocalGraph: true,
      'cap.atlas.entity.create': true,
      'cap.atlas.alias.add': true,
      'cap.atlas.mention.confirm': true,
      'cap.atlas.observation.suppress': true,
      'cap.atlas.entity.merge': true,
      'cap.atlas.entity.splitRestore': true,
      'cap.atlas.observation.reassign': true,
      'cap.atlas.evidence.reattach': true,
      'cap.atlas.savedQuery.save': true,
      'cap.atlas.calendar.define': true,
      'cap.atlas.sceneTemporalAnchor.set': true,
      'cap.atlas.continuityFact.record': true,
      ...overrides,
    },
  };
}

test('E06 C08: diagnostics packet keeps Stage 06 acceptance invalidated without external machine evidence', async () => {
  const { derived, projectId, state } = await buildStage06DiagnosticsFixture();
  const diagnostics = derived.deriveAtlasDiagnosticsStageAcceptance({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: capabilitySnapshot(),
  });
  assert.equal(diagnostics.ok, true);
  assert.equal(diagnostics.value.schemaVersion, derived.ATLAS_DIAGNOSTICS_STAGE_ACCEPTANCE_SCHEMA_VERSION);
  assert.equal(diagnostics.value.stageAcceptanceProof.stageId, 'E06_STAGE_06_TIME_CALENDAR_CONTINUITY_CONTOURS');
  assert.equal(diagnostics.value.stage06AcceptanceProof.schemaVersion, derived.ATLAS_STAGE_06_ACCEPTANCE_PROOF_SCHEMA_VERSION);
  assert.equal(diagnostics.value.stage06AcceptanceProof.stageId, 'E06_STAGE_06_TIME_CALENDAR_CONTINUITY_CONTOURS');
  assert.equal(diagnostics.value.stage06AcceptanceProof.pass, false);
  assert.equal(diagnostics.value.summary.stageAcceptance, 'not_ready');
  assert.ok(diagnostics.value.stageAcceptanceProof.gates.some((gate) => gate.id === 'stage06-time-calendar-continuity-acceptance' && gate.status === 'DEGRADED'));
  assert.ok(diagnostics.value.stage06AcceptanceProof.gates.some((gate) => gate.id === 'stage06-calendar-assumption-audit' && gate.status === 'PASS'));
  assert.ok(diagnostics.value.stage06AcceptanceProof.gates.some((gate) => gate.id === 'stage06-evidence-backed-finding-audit' && gate.status === 'PASS'));
  assert.ok(diagnostics.value.stage06AcceptanceProof.gates.some((gate) => gate.id === 'stage06-large-project-ui-hot-path-proof' && gate.status === 'PASS'));
  assert.ok(diagnostics.value.stage06AcceptanceProof.gates.some((gate) => gate.id === 'stage06-external-machine-evidence' && gate.status === 'NOT_READY'));
  assert.ok(diagnostics.value.stageAcceptanceProof.gates.some((gate) => gate.id === 'external-machine-evidence' && gate.status === 'NOT_READY'));
  assert.equal(diagnostics.value.calendarAssumptionAudit.schemaVersion, derived.ATLAS_CALENDAR_ASSUMPTION_AUDIT_SCHEMA_VERSION);
  assert.equal(diagnostics.value.calendarAssumptionAudit.hiddenAssumptions, false);
  assert.equal(diagnostics.value.calendarAssumptionAudit.externalTimeService, false);
  assert.equal(diagnostics.value.calendarAssumptionAudit.pass, true);
  assert.equal(diagnostics.value.evidenceBackedFindingAudit.schemaVersion, derived.ATLAS_EVIDENCE_BACKED_FINDING_AUDIT_SCHEMA_VERSION);
  assert.equal(diagnostics.value.evidenceBackedFindingAudit.evidenceFirst, true);
  assert.equal(diagnostics.value.evidenceBackedFindingAudit.correctionRouteOnly, true);
  assert.equal(diagnostics.value.evidenceBackedFindingAudit.automaticApply, false);
  assert.equal(diagnostics.value.stage06HotPathProof.schemaVersion, derived.ATLAS_STAGE_06_HOT_PATH_PROOF_SCHEMA_VERSION);
  assert.equal(diagnostics.value.stage06HotPathProof.temporalLayoutExplicitOpen, true);
  assert.equal(diagnostics.value.stage06HotPathProof.continuityLedgerExplicitOpen, true);
  assert.equal(diagnostics.value.stage06HotPathProof.pass, true);
  assert.equal(diagnostics.value.finalUiAuditReceipt.finalBar.status, 'NOT_READY');
  assert.ok(diagnostics.value.surfaceFallbackInventory.rows.some((row) => row.surfaceId === 'surface.atlas.temporalLayout'));
  assert.ok(diagnostics.value.surfaceFallbackInventory.rows.some((row) => row.surfaceId === 'surface.atlas.continuityLedger'));
  assert.match(diagnostics.value.summary.diagnosticsHash, /^[0-9a-f]{64}$/u);
});

test('E06 C08: Stage 06 diagnostics degrade honestly when continuity ledger capability is disabled', async () => {
  const { derived, projectId, state } = await buildStage06DiagnosticsFixture();
  const diagnostics = derived.deriveAtlasDiagnosticsStageAcceptance({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: capabilitySnapshot({
      atlasContinuityLedgerSurface: false,
      'cap.atlas.continuityFact.record': false,
    }),
  });
  assert.equal(diagnostics.ok, true);
  assert.equal(diagnostics.value.state, 'degraded');
  assert.equal(diagnostics.value.stage06AcceptanceProof.pass, false);
  assert.ok(diagnostics.value.degradedCapabilityReport.rows.some((row) => row.code === 'CAPABILITY_DEGRADED' && row.label === 'atlas.continuityFact.record'));
  assert.ok(diagnostics.value.degradedCapabilityReport.rows.some((row) => row.surfaceId === 'surface.atlas.continuityLedger'));
  assert.ok(diagnostics.value.surfaceFallbackInventory.rows.some((row) => row.surfaceId === 'surface.atlas.continuityLedger' && row.state === 'unavailable'));
});

test('E06 C08: diagnostics exports Stage 06 acceptance constants and renderer names Stage 06 handoff', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'index.mjs'));
  const editorSource = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'editor.js'), 'utf8');

  assert.equal(derived.ATLAS_STAGE_06_ACCEPTANCE_PROOF_SCHEMA_VERSION, 'derived.atlas.stage06AcceptanceProof.v1');
  assert.equal(atlas.ATLAS_CALENDAR_ASSUMPTION_AUDIT_SCHEMA_VERSION, 'derived.atlas.calendarAssumptionAudit.v1');
  assert.equal(atlas.ATLAS_EVIDENCE_BACKED_FINDING_AUDIT_SCHEMA_VERSION, 'derived.atlas.evidenceBackedFindingAudit.v1');
  assert.equal(atlas.ATLAS_STAGE_06_HOT_PATH_PROOF_SCHEMA_VERSION, 'derived.atlas.stage06HotPathProof.v1');
  assert.match(editorSource, /Stage 05 acceptance \/ Stage 06 handoff/u);
});

test('E06 C08: diagnostics derived sources keep side-effect boundaries closed after Stage 06 expansion', () => {
  const sources = [
    'src/derived/atlas/deriveAtlasDiagnosticsStageAcceptance.mjs',
    'src/derived/atlas/atlasDiagnosticsTypes.mjs',
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
