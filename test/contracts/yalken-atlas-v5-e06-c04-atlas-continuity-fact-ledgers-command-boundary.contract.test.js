const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildContinuityFactFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const projectId = 'atlas-continuity-facts-project';
  const sceneAId = 'scene-a';
  const sceneBId = 'scene-b';
  const created = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas continuity facts', sceneId: sceneAId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId: sceneAId, text: 'Anna hides the key in the blue room and promises Mira she will return.' },
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
    title: 'Return',
    text: 'Mira finds the key after Anna returns.',
  };
  return { runtime, derived, projectId, sceneAId, sceneBId, state };
}

function evidenceAnchorFor(runtime, state, projectId, sceneId, entityId, quote, anchorId) {
  const text = state.data.projects[projectId].scenes[sceneId].text;
  const startOffset = text.indexOf(quote);
  assert.notEqual(startOffset, -1);
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

function nodeCapabilitySnapshot() {
  return {
    platformId: 'node',
    capabilities: {
      atlasContinuityFactLedgers: true,
    },
  };
}

test('E06 C04: Atlas continuity fact command records location knowledge object and promise ledgers as author truth', async () => {
  const { runtime, derived, projectId, sceneAId, state } = await buildContinuityFactFixture();
  const sceneTextBefore = state.data.projects[projectId].scenes[sceneAId].text;
  const commands = [
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_CONTINUITY_FACT_RECORD,
      payload: {
        projectId,
        ledgerKind: 'location',
        factId: 'fact-location-anna-room',
        sceneId: sceneAId,
        subjectEntityId: 'entity-anna',
        factLabel: 'Anna location',
        factValue: 'blue room',
        evidenceAnchor: evidenceAnchorFor(runtime, state, projectId, sceneAId, 'entity-anna', 'Anna hides', 'anchor-location'),
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_CONTINUITY_FACT_RECORD,
      payload: {
        projectId,
        ledgerKind: 'knowledge',
        factId: 'fact-knowledge-anna-key',
        sceneId: sceneAId,
        subjectEntityId: 'entity-anna',
        factLabel: 'Anna knows key location',
        factValue: 'key is hidden in the blue room',
        relatedEntityIds: ['entity-key'],
        evidenceAnchor: evidenceAnchorFor(runtime, state, projectId, sceneAId, 'entity-anna', 'hides the key', 'anchor-knowledge'),
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_CONTINUITY_FACT_RECORD,
      payload: {
        projectId,
        ledgerKind: 'object',
        factId: 'fact-object-key-hidden',
        sceneId: sceneAId,
        subjectEntityId: 'entity-key',
        factLabel: 'Key state',
        factValue: 'hidden in the blue room',
        relatedEntityIds: ['entity-anna'],
        evidenceAnchor: evidenceAnchorFor(runtime, state, projectId, sceneAId, 'entity-key', 'key in the blue room', 'anchor-object'),
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_CONTINUITY_FACT_RECORD,
      payload: {
        projectId,
        ledgerKind: 'promise',
        factId: 'fact-promise-anna-return',
        sceneId: sceneAId,
        subjectEntityId: 'entity-anna',
        factLabel: 'Anna promise',
        factValue: 'Anna promises Mira she will return',
        promiseState: 'open',
        relatedEntityIds: ['entity-mira'],
        evidenceAnchor: evidenceAnchorFor(runtime, state, projectId, sceneAId, 'entity-anna', 'promises Mira she will return', 'anchor-promise'),
      },
    },
  ];
  const recorded = runtime.applyCoreSequence(state, commands);
  assert.equal(recorded.ok, true);
  const reopened = JSON.parse(JSON.stringify(recorded.state));
  const atlas = reopened.data.projects[projectId].atlas;
  assert.equal(reopened.data.projects[projectId].scenes[sceneAId].text, sceneTextBefore);
  assert.equal(atlas.continuityFactLedgers.location['fact-location-anna-room'].schemaVersion, 'atlas.continuityFact.v1');
  assert.equal(atlas.continuityFactLedgers.knowledge['fact-knowledge-anna-key'].relatedEntityIds[0], 'entity-key');
  assert.equal(atlas.continuityFactLedgers.object['fact-object-key-hidden'].subjectEntityId, 'entity-key');
  assert.equal(atlas.continuityFactLedgers.promise['fact-promise-anna-return'].promiseState, 'open');
  assert.match(atlas.continuityFactLedgers.promise['fact-promise-anna-return'].sourceHash, /^[0-9a-f]{64}$/u);

  const readback = derived.deriveAtlasContinuityFactLedgers({
    coreState: reopened,
    params: { projectId },
    capabilitySnapshot: nodeCapabilitySnapshot(),
  });
  assert.equal(readback.ok, true);
  assert.equal(readback.value.schemaVersion, derived.ATLAS_CONTINUITY_FACT_LEDGERS_SCHEMA_VERSION);
  assert.equal(readback.value.surfaceManifest.schemaVersion, derived.ATLAS_CONTINUITY_FACT_LEDGERS_SURFACE_MANIFEST_VERSION);
  assert.deepEqual(readback.value.surfaceManifest.commandIds, ['atlas.continuityFact.record']);
  assert.equal(readback.value.authority.projectTruthMutation, false);
  assert.equal(readback.value.authority.storageMutation, false);
  assert.equal(readback.value.authority.networkMutation, false);
  assert.equal(readback.value.authority.hiddenMutation, false);
  assert.equal(readback.value.authority.automaticFindingSynthesis, false);
  assert.equal(readback.value.state, 'ready');
  assert.equal(readback.value.summary.factCount, 4);
  assert.equal(readback.value.summary.locationCount, 1);
  assert.equal(readback.value.summary.knowledgeCount, 1);
  assert.equal(readback.value.summary.objectCount, 1);
  assert.equal(readback.value.summary.promiseCount, 1);
  assert.equal(readback.value.summary.degradedFactCount, 0);
  assert.equal(readback.value.factLedgers.promise[0].evidenceState, 'current');
  assert.equal(readback.value.evidence.guarantees.authorCommandBoundary, 'atlas.continuityFact.record');
  assert.equal(readback.value.evidence.guarantees.findingSynthesis, false);
});

test('E06 C04: Atlas continuity fact command fails closed for stale evidence and stale fact hashes', async () => {
  const { runtime, projectId, sceneAId, state } = await buildContinuityFactFixture();
  const beforeHash = runtime.hashCoreState(state);
  const missingEvidence = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_CONTINUITY_FACT_RECORD,
    payload: {
      projectId,
      ledgerKind: 'location',
      sceneId: sceneAId,
      subjectEntityId: 'entity-anna',
      factLabel: 'Anna location',
      factValue: 'blue room',
    },
  });
  assert.equal(missingEvidence.ok, false);
  assert.equal(missingEvidence.error.code, 'E_ATLAS_EVIDENCE_ANCHOR_REQUIRED');
  assert.equal(missingEvidence.stateHash, beforeHash);

  const staleEvidenceAnchor = evidenceAnchorFor(runtime, state, projectId, sceneAId, 'entity-anna', 'Anna hides', 'anchor-stale');
  const edited = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
    payload: { projectId, sceneId: sceneAId, text: 'Anna moves the key before Mira arrives.' },
  });
  assert.equal(edited.ok, true);
  const staleEvidence = runtime.reduceCoreState(edited.state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_CONTINUITY_FACT_RECORD,
    payload: {
      projectId,
      ledgerKind: 'location',
      sceneId: sceneAId,
      subjectEntityId: 'entity-anna',
      factLabel: 'Anna location',
      factValue: 'blue room',
      evidenceAnchor: staleEvidenceAnchor,
    },
  });
  assert.equal(staleEvidence.ok, false);
  assert.equal(staleEvidence.error.code, 'E_ATLAS_EVIDENCE_STALE');
  assert.equal(staleEvidence.stateHash, runtime.hashCoreState(edited.state));

  const saved = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_CONTINUITY_FACT_RECORD,
    payload: {
      projectId,
      ledgerKind: 'promise',
      factId: 'fact-promise-anna-return',
      sceneId: sceneAId,
      subjectEntityId: 'entity-anna',
      factLabel: 'Anna promise',
      factValue: 'Anna promises Mira she will return',
      promiseState: 'open',
      evidenceAnchor: evidenceAnchorFor(runtime, state, projectId, sceneAId, 'entity-anna', 'promises Mira she will return', 'anchor-promise-stale'),
    },
  });
  assert.equal(saved.ok, true);
  const staleFact = runtime.reduceCoreState(saved.state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_CONTINUITY_FACT_RECORD,
    payload: {
      projectId,
      ledgerKind: 'promise',
      factId: 'fact-promise-anna-return',
      sceneId: sceneAId,
      subjectEntityId: 'entity-anna',
      factLabel: 'Anna promise',
      factValue: 'Anna promises Mira she will return',
      promiseState: 'fulfilled',
      expectedFactHash: 'deadbeef',
      evidenceAnchor: evidenceAnchorFor(runtime, state, projectId, sceneAId, 'entity-anna', 'promises Mira she will return', 'anchor-promise-stale'),
    },
  });
  assert.equal(staleFact.ok, false);
  assert.equal(staleFact.error.code, 'E_ATLAS_CONTINUITY_FACT_STALE');
  assert.equal(staleFact.stateHash, runtime.hashCoreState(saved.state));
});

test('E06 C04: Atlas continuity fact command is admitted only through node capability revalidation', async () => {
  const { runtime, projectId, sceneAId, state } = await buildContinuityFactFixture();
  const registryModule = await loadModule(path.join('src', 'renderer', 'commands', 'registry.mjs'));
  const runnerModule = await loadModule(path.join('src', 'renderer', 'commands', 'runCommand.mjs'));
  const capabilityPolicy = await loadModule(path.join('src', 'renderer', 'commands', 'capabilityPolicy.mjs'));
  const localCapability = await loadModule(path.join('src', 'renderer', 'commands', 'localCapabilityProvider.mjs'));
  const registry = registryModule.createCommandRegistry();
  registry.registerCommand(runtime.CORE_COMMAND_IDS.ATLAS_CONTINUITY_FACT_RECORD, (input) => {
    return runtime.reduceCoreState(input.state, {
      type: runtime.CORE_COMMAND_IDS.ATLAS_CONTINUITY_FACT_RECORD,
      payload: input.payload,
    });
  });
  const payload = {
    projectId,
    ledgerKind: 'location',
    sceneId: sceneAId,
    subjectEntityId: 'entity-anna',
    factLabel: 'Anna location',
    factValue: 'blue room',
    evidenceAnchor: evidenceAnchorFor(runtime, state, projectId, sceneAId, 'entity-anna', 'Anna hides', 'anchor-node-only'),
  };
  assert.equal(capabilityPolicy.CAPABILITY_BINDING[runtime.CORE_COMMAND_IDS.ATLAS_CONTINUITY_FACT_RECORD], 'cap.atlas.continuityFact.record');
  assert.equal(localCapability.resolveCommandEntitlement(runtime.CORE_COMMAND_IDS.ATLAS_CONTINUITY_FACT_RECORD, { entitlementTier: 'free' }).available, true);

  const webRunner = runnerModule.createCommandRunner(registry, { capability: { defaultPlatformId: 'web' } });
  const denied = await webRunner(runtime.CORE_COMMAND_IDS.ATLAS_CONTINUITY_FACT_RECORD, { state, payload });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');

  const nodeRunner = runnerModule.createCommandRunner(registry, { capability: { defaultPlatformId: 'node', entitlementTier: 'free' } });
  const admitted = await nodeRunner(runtime.CORE_COMMAND_IDS.ATLAS_CONTINUITY_FACT_RECORD, { state, payload });
  assert.equal(admitted.ok, true);
  assert.equal(admitted.state.data.projects[projectId].atlas.continuityFactLedgers.location.length, undefined);
  assert.equal(Object.keys(admitted.state.data.projects[projectId].atlas.continuityFactLedgers.location).length, 1);
});

test('E06 C04: Atlas continuity fact derived and core sources keep side effects closed', () => {
  const sources = [
    'src/core/runtime.mjs',
    'src/derived/atlas/deriveAtlasContinuityFactLedgers.mjs',
    'src/derived/atlas/atlasContinuityFactLedgerTypes.mjs',
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
