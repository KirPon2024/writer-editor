const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildCalendarFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const projectId = 'atlas-calendar-project';
  const sceneId = 'scene-a';
  const created = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas calendar', sceneId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId, text: 'The tenth bell rings before dawn.' },
    },
  ]);
  assert.equal(created.ok, true);
  return { runtime, derived, projectId, sceneId, state: created.state };
}

function nodeCapabilitySnapshot() {
  return {
    platformId: 'node',
    capabilities: {
      atlasCalendarDefinitions: true,
    },
  };
}

test('E06 C01: Atlas calendar command persists real and fictional calendars without hidden conversion assumptions', async () => {
  const { runtime, derived, projectId, sceneId, state } = await buildCalendarFixture();
  const sceneTextBefore = state.data.projects[projectId].scenes[sceneId].text;

  const realCalendar = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_CALENDAR_DEFINE,
    payload: {
      projectId,
      calendarId: 'calendar-gregorian-local',
      name: 'Local Gregorian',
      calendarKind: 'real',
      calendarSystem: 'gregorian-proleptic-local',
      dayZeroLabel: '0001-01-01',
      conversionRules: [
        {
          ruleId: 'rule-gregorian-identity',
          ruleKind: 'identity',
          sourceScale: 'iso-date',
          targetScale: 'iso-date',
          precision: 'exact',
        },
      ],
    },
  });
  assert.equal(realCalendar.ok, true);

  const fictionalCalendar = runtime.reduceCoreState(realCalendar.state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_CALENDAR_DEFINE,
    payload: {
      projectId,
      calendarId: 'calendar-bells',
      name: 'Bells of Yalken',
      calendarKind: 'fictional',
      calendarSystem: 'bells-cycle-local',
      dayZeroLabel: 'First Bell',
      conversionRules: [
        {
          ruleId: 'rule-bell-to-story-day',
          ruleKind: 'dayOffset',
          sourceScale: 'bell-day',
          targetScale: 'story-day',
          offsetDays: 10,
          precision: 'approximate',
        },
        {
          ruleId: 'rule-bell-to-iso',
          ruleKind: 'unsupported',
          sourceScale: 'bell-day',
          targetScale: 'iso-date',
          precision: 'unsupported',
          reason: 'Fictional bell days have no canonical external ISO anchor in this project.',
        },
      ],
    },
  });
  assert.equal(fictionalCalendar.ok, true);
  const reopened = JSON.parse(JSON.stringify(fictionalCalendar.state));
  const project = reopened.data.projects[projectId];
  assert.equal(project.scenes[sceneId].text, sceneTextBefore);
  assert.equal(project.atlas.schemaVersion, 'atlas.author.v1');
  assert.equal(project.atlas.calendarDefinitions['calendar-gregorian-local'].schemaVersion, 'atlas.calendarDefinition.v1');
  assert.equal(project.atlas.calendarDefinitions['calendar-bells'].calendarKind, 'fictional');
  assert.equal(project.atlas.calendarDefinitions['calendar-bells'].conversionRules.length, 2);
  assert.equal(project.atlas.calendarDefinitions['calendar-bells'].conversionRules[0].id, 'rule-bell-to-iso');
  assert.equal(project.atlas.calendarDefinitions['calendar-bells'].conversionRules[0].canConvert, false);
  assert.match(project.atlas.calendarDefinitions['calendar-bells'].sourceHash, /^[0-9a-f]{64}$/u);

  const readback = derived.deriveAtlasCalendarDefinitions({
    coreState: reopened,
    params: { projectId },
    capabilitySnapshot: nodeCapabilitySnapshot(),
  });
  assert.equal(readback.ok, true);
  assert.equal(readback.value.schemaVersion, derived.ATLAS_CALENDAR_DEFINITIONS_SCHEMA_VERSION);
  assert.equal(readback.value.surfaceManifest.schemaVersion, derived.ATLAS_CALENDAR_SURFACE_MANIFEST_VERSION);
  assert.equal(readback.value.surfaceManifest.providerId, 'query.atlasCalendarDefinitions');
  assert.deepEqual(readback.value.surfaceManifest.commandIds, ['atlas.calendar.define']);
  assert.equal(readback.value.authority.projectTruthMutation, false);
  assert.equal(readback.value.authority.storageMutation, false);
  assert.equal(readback.value.authority.networkMutation, false);
  assert.equal(readback.value.authority.hiddenMutation, false);
  assert.equal(readback.value.state, 'degraded');
  assert.equal(readback.value.summary.calendarCount, 2);
  assert.equal(readback.value.summary.realCalendarCount, 1);
  assert.equal(readback.value.summary.fictionalCalendarCount, 1);
  assert.equal(readback.value.summary.activeConversionRuleCount, 2);
  assert.equal(readback.value.summary.unsupportedConversionRuleCount, 1);
  assert.equal(readback.value.summary.degradedCalendarCount, 1);
  assert.equal(readback.value.evidence.guarantees.externalTimeService, false);
  assert.equal(readback.value.evidence.guarantees.hiddenAssumptions, false);
  assert.equal(readback.value.evidence.guarantees.unsupportedStatesExplicit, true);
});

test('E06 C01: Atlas calendar command rejects implicit or stale conversion truth without mutating state', async () => {
  const { runtime, projectId, state } = await buildCalendarFixture();
  const beforeHash = runtime.hashCoreState(state);
  const missingRules = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_CALENDAR_DEFINE,
    payload: {
      projectId,
      calendarId: 'calendar-empty',
      name: 'Empty calendar',
      calendarKind: 'fictional',
      calendarSystem: 'empty-cycle',
      conversionRules: [],
    },
  });
  assert.equal(missingRules.ok, false);
  assert.equal(missingRules.error.code, 'E_ATLAS_CALENDAR_CONVERSION_RULE_REQUIRED');
  assert.equal(missingRules.stateHash, beforeHash);

  const missingPrecision = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_CALENDAR_DEFINE,
    payload: {
      projectId,
      calendarId: 'calendar-implicit',
      name: 'Implicit calendar',
      calendarKind: 'real',
      calendarSystem: 'gregorian',
      conversionRules: [
        {
          ruleId: 'rule-missing-precision',
          ruleKind: 'identity',
          sourceScale: 'iso-date',
          targetScale: 'iso-date',
        },
      ],
    },
  });
  assert.equal(missingPrecision.ok, false);
  assert.equal(missingPrecision.error.code, 'E_ATLAS_CALENDAR_CONVERSION_RULE_PRECISION_REQUIRED');
  assert.equal(missingPrecision.stateHash, beforeHash);

  const saved = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_CALENDAR_DEFINE,
    payload: {
      projectId,
      calendarId: 'calendar-gregorian-local',
      name: 'Local Gregorian',
      calendarKind: 'real',
      calendarSystem: 'gregorian-proleptic-local',
      conversionRules: [
        {
          ruleId: 'rule-gregorian-identity',
          ruleKind: 'identity',
          sourceScale: 'iso-date',
          targetScale: 'iso-date',
          precision: 'exact',
        },
      ],
    },
  });
  assert.equal(saved.ok, true);
  const stale = runtime.reduceCoreState(saved.state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_CALENDAR_DEFINE,
    payload: {
      projectId,
      calendarId: 'calendar-gregorian-local',
      name: 'Local Gregorian Updated',
      calendarKind: 'real',
      calendarSystem: 'gregorian-proleptic-local',
      expectedCalendarHash: 'deadbeef',
      conversionRules: [
        {
          ruleId: 'rule-gregorian-identity',
          ruleKind: 'identity',
          sourceScale: 'iso-date',
          targetScale: 'iso-date',
          precision: 'exact',
        },
      ],
    },
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.error.code, 'E_ATLAS_CALENDAR_STALE');
  assert.equal(stale.stateHash, runtime.hashCoreState(saved.state));
});

test('E06 C01: Atlas calendar command is admitted only through node capability revalidation', async () => {
  const { runtime, projectId, state } = await buildCalendarFixture();
  const registryModule = await loadModule(path.join('src', 'renderer', 'commands', 'registry.mjs'));
  const runnerModule = await loadModule(path.join('src', 'renderer', 'commands', 'runCommand.mjs'));

  const registry = registryModule.createCommandRegistry();
  registry.registerCommand(runtime.CORE_COMMAND_IDS.ATLAS_CALENDAR_DEFINE, (input) => {
    return runtime.reduceCoreState(input.state, {
      type: runtime.CORE_COMMAND_IDS.ATLAS_CALENDAR_DEFINE,
      payload: input.payload,
    });
  });
  const payload = {
    projectId,
    calendarId: 'calendar-node-only',
    name: 'Node only',
    calendarKind: 'real',
    calendarSystem: 'gregorian-proleptic-local',
    conversionRules: [
      {
        ruleId: 'rule-node-identity',
        ruleKind: 'identity',
        sourceScale: 'iso-date',
        targetScale: 'iso-date',
        precision: 'exact',
      },
    ],
  };

  const webRunner = runnerModule.createCommandRunner(registry, {
    capability: { defaultPlatformId: 'web' },
  });
  const denied = await webRunner(runtime.CORE_COMMAND_IDS.ATLAS_CALENDAR_DEFINE, { state, payload });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');

  const nodeRunner = runnerModule.createCommandRunner(registry, {
    capability: { defaultPlatformId: 'node', entitlementTier: 'free' },
  });
  const admitted = await nodeRunner(runtime.CORE_COMMAND_IDS.ATLAS_CALENDAR_DEFINE, { state, payload });
  assert.equal(admitted.ok, true);
  assert.equal(admitted.state.data.projects[projectId].atlas.calendarDefinitions['calendar-node-only'].name, 'Node only');
});

test('E06 C01: Atlas calendar derived and core boundary keep side effects closed', () => {
  const sources = [
    'src/core/runtime.mjs',
    'src/derived/atlas/deriveAtlasCalendarDefinitions.mjs',
    'src/derived/atlas/atlasCalendarTypes.mjs',
  ].map((relativePath) => [path.basename(relativePath), fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')]);
  const forbiddenPatterns = [
    /from\s+['"]node:fs['"]/u,
    /from\s+['"]node:child_process['"]/u,
    /from\s+['"]node:http['"]/u,
    /from\s+['"]node:https['"]/u,
    /from\s+['"]electron['"]/u,
    /\bwriteFile(?:Sync)?\s*\(/u,
    /\bappendFile(?:Sync)?\s*\(/u,
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
