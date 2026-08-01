const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function readRepoText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function readRepoJson(relativePath) {
  return JSON.parse(readRepoText(relativePath));
}

function extractCoreEventContractIds(source) {
  return [...source.matchAll(/\btype:\s*"([^"]+)"/g)]
    .map((match) => match[1])
    .filter((eventId) => /^[A-Z][A-Za-z]+$/.test(eventId))
    .sort();
}

function extractRegistryEventIds(source) {
  const match = source.match(/export const CORE_EVENTS = \[([\s\S]*?)\] as const;/u);
  assert.ok(match, 'CORE_EVENTS tuple must exist');
  return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]).sort();
}

function eventPayloadFixture(eventId) {
  const commonProjectId = 'project-domain-event-contract';
  switch (eventId) {
    case 'SceneChanged':
      return { projectId: commonProjectId, sceneId: 'scene-1', changeKind: 'textEdited' };
    case 'SceneOrderChanged':
      return { projectId: commonProjectId, sceneIds: ['scene-1', 'scene-2'], changeKind: 'reordered' };
    case 'EntityCreated':
      return { projectId: commonProjectId, entityId: 'entity-alice', entityKind: 'character', name: 'Alice' };
    case 'EntityMerged':
      return { projectId: commonProjectId, sourceEntityId: 'entity-a', targetEntityId: 'entity-b', operationId: 'merge-1' };
    case 'EntitySplit':
      return { projectId: commonProjectId, operationId: 'merge-1', restoreOperationId: 'restore-1' };
    case 'AliasChanged':
      return { projectId: commonProjectId, entityId: 'entity-alice', aliasId: 'alias-a', changeKind: 'added' };
    case 'MapChanged':
      return { projectId: commonProjectId, mapId: 'map-1', changeKind: 'nodeAdded' };
    case 'MapNodePromoted':
      return { projectId: commonProjectId, mapId: 'map-1', nodeId: 'node-1', targetKind: 'entity', targetId: 'entity-alice', promotionKind: 'explicitAuthorPromotion' };
    case 'DecisionCommitted':
      return { projectId: commonProjectId, decisionKind: 'mention.confirm', decisionId: 'decision-1', subjectId: 'entity-alice' };
    case 'CalendarChanged':
      return { projectId: commonProjectId, calendarId: 'calendar-1', changeKind: 'defined' };
    case 'TimeRangeChanged':
      return { projectId: commonProjectId, sceneId: 'scene-1', anchorId: 'anchor-1', changeKind: 'set' };
    case 'ContinuityDecisionCommitted':
      return { projectId: commonProjectId, ledgerKind: 'location', factId: 'fact-1', subjectEntityId: 'entity-alice' };
    case 'ProjectionInvalidated':
      return { projectId: commonProjectId, projectionKinds: ['atlas', 'manualMap'], reason: 'contractFixture' };
    case 'DerivedGenerationPublished':
      return { projectId: commonProjectId, generationId: 'generation-1', projectionKind: 'atlas', sourceRevision: 7 };
    case 'DerivedGenerationRejectedAsStale':
      return { projectId: commonProjectId, generationId: 'generation-2', projectionKind: 'atlas', sourceRevision: 7, currentRevision: 8 };
    case 'LanguageCapabilityChanged':
      return { projectId: commonProjectId, scopeKind: 'range', tagId: 'lang-1', changeKind: 'set' };
    case 'MigrationPrepared':
      return { projectId: commonProjectId, migrationId: 'migration-1', sourceSchemaVersion: 'atlas.author.v1', targetSchemaVersion: 'atlas.author.v1' };
    case 'MigrationCommitted':
      return { projectId: commonProjectId, migrationId: 'migration-1', sourceSchemaVersion: 'atlas.author.v1', targetSchemaVersion: 'atlas.author.v1' };
    case 'MigrationRolledBack':
      return { projectId: commonProjectId, migrationId: 'migration-1', rollbackOperationId: 'rollback-1' };
    default:
      throw new Error(`Missing payload fixture for ${eventId}`);
  }
}

function eventFixture(domainEvents, eventId) {
  const rule = domainEvents.CORE_EVENT_SOURCE_RULES[eventId];
  const sourceBinding = {
    boundary: rule.boundary,
    commandType: rule.commandTypes[0],
    commandSeq: rule.minCommandSeq,
    previousStateHash: '0'.repeat(64),
    nextStateHash: '1'.repeat(64),
  };
  if (rule.causedByCommandTypes.length > 0) {
    sourceBinding.causedByCommandType = rule.causedByCommandTypes[0];
  }
  return {
    schemaVersion: domainEvents.CORE_EVENT_SCHEMA_VERSION,
    type: eventId,
    factKind: domainEvents.CORE_EVENT_FACT_KIND,
    sourceBinding,
    payload: eventPayloadFixture(eventId),
  };
}

async function importRepoModule(relativePath) {
  return import(pathToFileURL(path.join(ROOT, relativePath)).href);
}

test('Atlas V5 P1 domain events: normative ids are explicit and identical across contract, registry, runtime and baseline', async () => {
  const contractSource = readRepoText('src/contracts/core-event.contract.ts');
  const coreContractsSource = readRepoText('src/core/contracts.ts');
  const registrySource = readRepoText('src/core/registry.ts');
  const planSource = readRepoText('docs/OPS/STATUS/YALKEN_ATLAS_MINDMAP_AUTONOMOUS_MASTER_PLAN_V5_REPO_SNAPSHOT.md');
  const baseline = readRepoJson('docs/OPS/DOMAIN_EVENTS_BASELINE.json');
  const domainEvents = await importRepoModule('src/core/domainEvents.mjs');

  const contractIds = extractCoreEventContractIds(contractSource);
  const registryIds = extractRegistryEventIds(registrySource);
  const runtimeIds = [...domainEvents.CORE_EVENT_ID_LIST].sort();
  const baselineIds = baseline.events.map((event) => event.eventId).sort();
  const normativeIds = [
    'SceneChanged',
    'SceneOrderChanged',
    'EntityCreated',
    'EntityMerged',
    'EntitySplit',
    'AliasChanged',
    'MapChanged',
    'MapNodePromoted',
    'DecisionCommitted',
    'CalendarChanged',
    'TimeRangeChanged',
    'ContinuityDecisionCommitted',
    'ProjectionInvalidated',
    'DerivedGenerationPublished',
    'DerivedGenerationRejectedAsStale',
    'LanguageCapabilityChanged',
    'MigrationPrepared',
    'MigrationCommitted',
    'MigrationRolledBack',
  ].sort();

  for (const eventId of normativeIds) {
    assert.match(planSource, new RegExp(`\\b${eventId}\\b`, 'u'), `${eventId} must remain bound to V5 section 9A.2`);
  }

  assert.deepEqual(contractIds, normativeIds);
  assert.deepEqual(registryIds, normativeIds);
  assert.deepEqual(runtimeIds, normativeIds);
  assert.deepEqual(baselineIds, normativeIds);
  assert.doesNotMatch(contractSource, /\btype\s*:\s*string\b/u);
  assert.doesNotMatch(coreContractsSource, /CoreEvent\s*=\s*\{\s*type\s*:\s*string\s*\}/u);
  assert.equal(baselineIds.includes('CORE_EVENT_UNSPECIFIED'), false);
});

test('Atlas V5 P1 domain events: reducer outcomes emit facts without creating an event store', async () => {
  const runtime = await importRepoModule('src/core/runtime.mjs');
  const domainEvents = await importRepoModule('src/core/domainEvents.mjs');
  let state = runtime.createInitialCoreState();

  function apply(command) {
    const result = runtime.reduceCoreState(state, command);
    assert.equal(result.ok, true, `${command.type} should apply: ${result.error?.reason || ''}`);
    assert.ok(Array.isArray(result.events), `${command.type} should expose events`);
    for (const event of result.events) {
      assert.equal(domainEvents.validateCoreDomainEvent(event).ok, true, `${event.type} should validate`);
      assert.equal(event.factKind, domainEvents.CORE_EVENT_FACT_KIND);
      if (event.type === domainEvents.CORE_EVENT_IDS.PROJECTION_INVALIDATED || event.type === domainEvents.CORE_EVENT_IDS.MAP_NODE_PROMOTED) {
        assert.equal(event.sourceBinding.causedByCommandType, command.type);
        assert.notEqual(event.sourceBinding.commandType, command.type);
      } else {
        assert.equal(event.sourceBinding.commandType, command.type);
      }
      assert.equal(event.sourceBinding.commandSeq, result.state.data.lastCommandId);
      assert.equal(Object.prototype.hasOwnProperty.call(event.payload, 'command'), false);
      assert.equal(Object.prototype.hasOwnProperty.call(event.payload, 'rpc'), false);
    }
    state = result.state;
    return result.events.map((event) => event.type);
  }

  assert.deepEqual(
    apply({ type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE, payload: { projectId: 'p-events', sceneId: 'scene-1', title: 'Events' } }).sort(),
    ['ProjectionInvalidated', 'SceneChanged'].sort(),
  );
  assert.deepEqual(
    apply({ type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE, payload: { projectId: 'p-events', entityId: 'entity-alice', name: 'Alice', entityKind: 'character' } }).sort(),
    ['EntityCreated', 'ProjectionInvalidated'].sort(),
  );
  assert.deepEqual(
    apply({ type: runtime.CORE_COMMAND_IDS.ATLAS_ALIAS_ADD, payload: { projectId: 'p-events', entityId: 'entity-alice', aliasId: 'alias-alice', value: 'Al' } }).sort(),
    ['AliasChanged', 'ProjectionInvalidated'].sort(),
  );
  assert.deepEqual(
    apply({ type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_CREATE, payload: { projectId: 'p-events', mapId: 'map-main', title: 'Main map' } }).sort(),
    ['MapChanged', 'ProjectionInvalidated'].sort(),
  );
  assert.deepEqual(
    apply({
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD,
      payload: {
        projectId: 'p-events',
        mapId: 'map-main',
        nodeId: 'node-alice',
        label: 'Alice node',
        targetKind: 'entity',
        targetId: 'entity-alice',
      },
    }).sort(),
    ['MapChanged', 'MapNodePromoted', 'ProjectionInvalidated'].sort(),
  );
  assert.deepEqual(
    apply({
      type: runtime.CORE_COMMAND_IDS.ATLAS_CALENDAR_DEFINE,
      payload: {
        projectId: 'p-events',
        calendarId: 'calendar-main',
        name: 'Fictional calendar',
        calendarKind: 'fictional',
        calendarSystem: 'custom',
        dayZeroLabel: 'Day 0',
        conversionRules: [
          {
            id: 'identity',
            ruleKind: 'identity',
            sourceScale: 'day',
            targetScale: 'day',
            precision: 'exact',
          },
        ],
      },
    }).sort(),
    ['CalendarChanged', 'ProjectionInvalidated'].sort(),
  );
});

test('Atlas V5 P1 domain events: validation rejects wildcard, unknown ids and invalid payloads, and serialization is deterministic', async () => {
  const domainEvents = await importRepoModule('src/core/domainEvents.mjs');
  const event = eventFixture(domainEvents, 'EntityCreated');
  const validation = domainEvents.validateCoreDomainEvent(event);
  assert.equal(validation.ok, true, validation.reason);

  assert.equal(domainEvents.validateCoreDomainEvent({ ...event, type: 'CommandRpcRequested' }).ok, false);
  assert.equal(domainEvents.validateCoreDomainEvent({ ...event, type: 'EntityCreated', payload: { projectId: 'p' } }).ok, false);
  assert.equal(domainEvents.validateCoreDomainEvent({ ...event, schemaVersion: 'core.event.future' }).ok, false);
  assert.equal(domainEvents.validateCoreDomainEvent({
    ...event,
    sourceBinding: { ...event.sourceBinding, boundary: 'derivedProjectionWorker' },
  }).ok, false, 'mismatched boundary must fail closed');
  assert.equal(domainEvents.validateCoreDomainEvent({
    ...event,
    sourceBinding: { ...event.sourceBinding, commandType: 'project.applyTextEdit' },
  }).ok, false, 'unrelated command source must fail closed');
  assert.equal(domainEvents.validateCoreDomainEvent({
    ...event,
    sourceBinding: { ...event.sourceBinding, commandSeq: -1 },
  }).ok, false, 'negative safe integer sequence must fail closed');
  assert.equal(domainEvents.validateCoreDomainEvent({
    ...event,
    payload: { ...event.payload, extra: 'not allowed' },
  }).ok, false, 'extra payload key must fail closed');
  assert.equal(domainEvents.validateCoreDomainEvent({
    ...event,
    payload: { ...event.payload, extra: { handler: 'write' } },
  }).ok, false, 'nested authority payload key must fail closed');

  for (const eventId of domainEvents.CORE_EVENT_ID_LIST) {
    const candidate = eventFixture(domainEvents, eventId);
    assert.equal(domainEvents.validateCoreDomainEvent(candidate).ok, true, `${eventId} fixture should validate`);
    assert.equal(eventId.includes('.'), false, `${eventId} must not be a dotted command/RPC id`);
  }

  const serializedA = domainEvents.serializeCoreDomainEvent(event);
  const serializedB = domainEvents.serializeCoreDomainEvent(JSON.parse(JSON.stringify(event)));
  assert.equal(serializedA, serializedB);
  const roundTrip = domainEvents.deserializeCoreDomainEvent(serializedA);
  assert.equal(roundTrip.ok, true, roundTrip.reason);
  assert.deepEqual(roundTrip.event, event);
  assert.equal(Object.isFrozen(roundTrip.event), true);
  assert.equal(Object.isFrozen(roundTrip.event.payload), true);
});

test('Atlas V5 P1 domain events: missing product emitters are wired to their actual projection and migration boundaries', async () => {
  const runtime = await importRepoModule('src/core/runtime.mjs');
  const planner = await importRepoModule('src/derived/atlas/atlasLocalGraphLayoutPlanner.mjs');
  const layoutTypes = await importRepoModule('src/derived/atlas/atlasLocalGraphTypes.mjs');
  const portability = await importRepoModule('src/derived/atlas/deriveAtlasSeriesPortabilityPreview.mjs');
  const domainEvents = await importRepoModule('src/core/domainEvents.mjs');

  const graph = {
    schemaVersion: layoutTypes.ATLAS_LOCAL_GRAPH_SCHEMA_VERSION,
    projectId: 'p-events',
    nodes: [{ nodeId: 'node-a', entityId: 'entity-a', appearanceCount: 1 }],
    edges: [],
    clusters: [],
    summary: { graphHash: '2'.repeat(64) },
  };
  const job = planner.createAtlasLocalGraphLayoutJob({ graph, sequence: 3 });
  assert.equal(job.ok, true, job.error?.reason || '');
  const run = planner.runAtlasLocalGraphLayoutJob(job.value);
  assert.equal(run.ok, true, run.error?.reason || '');
  const accepted = planner.acceptAtlasLocalGraphLayoutResult({
    activeJob: job.value,
    result: run.value,
    currentGraph: graph,
  });
  assert.equal(accepted.ok, true, accepted.error?.reason || '');
  assert.equal(accepted.events[0].type, 'DerivedGenerationPublished');
  assert.equal(domainEvents.validateCoreDomainEvent(accepted.events[0]).ok, true);

  const stale = planner.acceptAtlasLocalGraphLayoutResult({
    activeJob: job.value,
    result: run.value,
    currentGraph: { ...graph, summary: { graphHash: '3'.repeat(64) } },
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.events[0].type, 'DerivedGenerationRejectedAsStale');
  assert.equal(domainEvents.validateCoreDomainEvent(stale.events[0]).ok, true);

  const created = runtime.reduceCoreState(runtime.createInitialCoreState(), {
    type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
    payload: { projectId: 'p-events', sceneId: 'scene-1', title: 'Events' },
  });
  assert.equal(created.ok, true, created.error?.reason || '');
  const preview = portability.deriveAtlasSeriesPortabilityPreview({
    coreState: created.state,
    params: { projectId: 'p-events' },
  });
  assert.equal(preview.ok, true, preview.error?.reason || '');
  assert.equal(preview.value.domainEvents[0].type, 'MigrationPrepared');
  assert.equal(domainEvents.validateCoreDomainEvent(preview.value.domainEvents[0]).ok, true);

  const orderEvent = runtime.buildSceneOrderChangedEvent({
    projectId: 'p-events',
    sceneIds: ['scene-1', 'scene-2'],
    commandSeq: 0,
    previousStateHash: '4'.repeat(64),
    nextStateHash: '5'.repeat(64),
  });
  assert.equal(orderEvent.type, 'SceneOrderChanged');
  assert.equal(domainEvents.validateCoreDomainEvent(orderEvent).ok, true);
});

test('Atlas V5 P1 domain events: SceneOrderChanged preserves semantic scene order and rejects laundered provenance', async () => {
  const runtime = await importRepoModule('src/core/runtime.mjs');
  const domainEvents = await importRepoModule('src/core/domainEvents.mjs');
  const planner = await importRepoModule('src/derived/atlas/atlasLocalGraphLayoutPlanner.mjs');
  const layoutTypes = await importRepoModule('src/derived/atlas/atlasLocalGraphTypes.mjs');

  const orderEvent = runtime.buildSceneOrderChangedEvent({
    projectId: 'p-events',
    sceneIds: ['scene-10', 'scene-2', 'scene-1'],
    commandSeq: 12,
    previousStateHash: '6'.repeat(64),
    nextStateHash: '7'.repeat(64),
  });
  assert.deepEqual(orderEvent.payload.sceneIds, ['scene-10', 'scene-2', 'scene-1']);

  assert.throws(() => runtime.buildSceneOrderChangedEvent({
    projectId: 'p-events',
    sceneIds: ['scene-1', 'scene-2'],
    commandSeq: -1,
    previousStateHash: '6'.repeat(64),
    nextStateHash: '7'.repeat(64),
  }), /INVALID_CORE_DOMAIN_EVENT_PROVENANCE:commandSeq/u);
  assert.throws(() => runtime.buildSceneOrderChangedEvent({
    projectId: 'p-events',
    sceneIds: ['scene-1', 'scene-2'],
    commandSeq: 1,
    previousStateHash: 'not-a-hash',
    nextStateHash: '7'.repeat(64),
  }), /INVALID_CORE_DOMAIN_EVENT_PROVENANCE:previousStateHash/u);
  assert.throws(() => runtime.buildSceneOrderChangedEvent({
    projectId: 'p-events',
    sceneIds: ['scene-1', 'scene-2'],
    commandSeq: 1,
    previousStateHash: '6'.repeat(64),
    nextStateHash: 'also-not-a-hash',
  }), /INVALID_CORE_DOMAIN_EVENT_PROVENANCE:nextStateHash/u);

  const initialState = runtime.createInitialCoreState();
  const createCommand = {
    type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
    payload: { projectId: 'p-explicit-provenance', sceneId: 'scene-1', title: 'Presence' },
  };
  const createResult = runtime.reduceCoreState(initialState, createCommand);
  assert.equal(createResult.ok, true, createResult.error?.reason || '');
  const absentHashes = domainEvents.emitCoreDomainEventsForCommandResult({
    previousState: initialState,
    command: createCommand,
    result: createResult,
  });
  assert.equal(absentHashes.length > 0, true);
  assert.match(absentHashes[0].sourceBinding.previousStateHash, /^[a-f0-9]{64}$/u);
  assert.match(absentHashes[0].sourceBinding.nextStateHash, /^[a-f0-9]{64}$/u);
  for (const explicitBadPrevious of ['', '   ', null]) {
    assert.throws(() => domainEvents.emitCoreDomainEventsForCommandResult({
      previousState: initialState,
      previousStateHash: explicitBadPrevious,
      command: createCommand,
      result: createResult,
    }), /INVALID_CORE_DOMAIN_EVENT_PROVENANCE:previousStateHash/u);
  }
  for (const explicitBadNext of ['', '   ', null]) {
    assert.throws(() => domainEvents.emitCoreDomainEventsForCommandResult({
      previousState: initialState,
      command: createCommand,
      result: createResult,
      nextStateHash: explicitBadNext,
    }), /INVALID_CORE_DOMAIN_EVENT_PROVENANCE:nextStateHash/u);
  }

  assert.throws(() => domainEvents.buildDerivedGenerationPublishedEvent({
    projectId: 'p-events',
    generationId: 'generation-1',
    projectionKind: 'atlas',
    sourceRevision: -1,
    commandSeq: 1,
    previousStateHash: '8'.repeat(64),
    nextStateHash: '9'.repeat(64),
  }), /INVALID_CORE_DOMAIN_EVENT_PROVENANCE:sourceRevision/u);

  const invalidGraph = planner.createAtlasLocalGraphLayoutJob({
    graph: {
      schemaVersion: layoutTypes.ATLAS_LOCAL_GRAPH_SCHEMA_VERSION,
      projectId: 'p-events',
      nodes: [],
      edges: [],
      clusters: [],
      summary: { graphHash: 'not-a-graph-hash' },
    },
    sequence: 3,
  });
  assert.equal(invalidGraph.ok, false);
  assert.equal(invalidGraph.error.reason, 'LOCAL_GRAPH_HASH_INVALID');

  const negativeSequenceGraph = planner.createAtlasLocalGraphLayoutJob({
    graph: {
      schemaVersion: layoutTypes.ATLAS_LOCAL_GRAPH_SCHEMA_VERSION,
      projectId: 'p-events',
      nodes: [],
      edges: [],
      clusters: [],
      summary: { graphHash: '0'.repeat(64) },
    },
    sequence: -1,
  });
  assert.equal(negativeSequenceGraph.ok, false);
  assert.equal(negativeSequenceGraph.error.reason, 'LOCAL_GRAPH_SEQUENCE_INVALID');
});

test('Atlas V5 P1 domain events: tree reorder Command Kernel result carries real event facts and fails closed when facts are missing', async () => {
  const { createCommandRegistry } = await importRepoModule('src/renderer/commands/registry.mjs');
  const projectCommands = await importRepoModule('src/renderer/commands/projectCommands.mjs');
  const runtime = await importRepoModule('src/core/runtime.mjs');
  const event = runtime.buildSceneOrderChangedEvent({
    projectId: 'p-events',
    sceneIds: ['scene-10', 'scene-2', 'scene-1'],
    commandSeq: 12,
    previousStateHash: 'a'.repeat(64),
    nextStateHash: 'b'.repeat(64),
  });
  const digest = runtime.hashCoreDomainEvents([event]);

  const registry = createCommandRegistry();
  const domainEventPort = {
    hashCoreDomainEvents: runtime.hashCoreDomainEvents,
  };
  projectCommands.registerProjectCommands(registry, {
    domainEventPort,
    electronAPI: {
      async invokeUiCommandBridge() {
        return {
          ok: true,
          value: {
            ok: true,
            nodeId: 'scene-10',
            reordered: true,
            events: [event],
            domainEventDigest: digest,
            receipt: { receiptId: 'tree-reorder-receipt-1' },
          },
        };
      },
    },
  });
  const okResult = await registry.getHandler(projectCommands.EXTRA_COMMAND_IDS.TREE_REORDER_NODE)({
    projectId: 'p-events',
    nodeId: 'scene-10',
    direction: 'up',
  });
  assert.equal(okResult.ok, true, JSON.stringify(okResult.error || {}));
  assert.deepEqual(okResult.value.events[0].payload.sceneIds, ['scene-10', 'scene-2', 'scene-1']);
  assert.equal(okResult.value.domainEventDigest, digest);
  assert.equal(okResult.value.receipt.receiptId, 'tree-reorder-receipt-1');

  const noOpRegistry = createCommandRegistry();
  projectCommands.registerProjectCommands(noOpRegistry, {
    domainEventPort,
    electronAPI: {
      async invokeUiCommandBridge() {
        return { ok: true, value: { ok: true, nodeId: 'scene-10', reordered: false, events: [], domainEventDigest: '' } };
      },
    },
  });
  const noOp = await noOpRegistry.getHandler(projectCommands.EXTRA_COMMAND_IDS.TREE_REORDER_NODE)({
    projectId: 'p-events',
    nodeId: 'scene-10',
    direction: 'up',
  });
  assert.equal(noOp.ok, true, JSON.stringify(noOp.error || {}));
  assert.equal(noOp.value.reordered, false);
  assert.deepEqual(noOp.value.events, []);

  const digestMismatchRegistry = createCommandRegistry();
  projectCommands.registerProjectCommands(digestMismatchRegistry, {
    domainEventPort,
    electronAPI: {
      async invokeUiCommandBridge() {
        return {
          ok: true,
          value: {
            ok: true,
            nodeId: 'scene-10',
            reordered: true,
            events: [event],
            domainEventDigest: '0'.repeat(64),
          },
        };
      },
    },
  });
  const digestMismatch = await digestMismatchRegistry.getHandler(projectCommands.EXTRA_COMMAND_IDS.TREE_REORDER_NODE)({
    projectId: 'p-events',
    nodeId: 'scene-10',
    direction: 'up',
  });
  assert.equal(digestMismatch.ok, false);
  assert.equal(digestMismatch.error.reason, 'TREE_REORDER_DOMAIN_EVENT_DIGEST_MISMATCH');

  const missingFactsRegistry = createCommandRegistry();
  projectCommands.registerProjectCommands(missingFactsRegistry, {
    electronAPI: {
      async invokeUiCommandBridge() {
        return { ok: true, value: { ok: true, nodeId: 'scene-10', reordered: true } };
      },
    },
  });
  const missingFacts = await missingFactsRegistry.getHandler(projectCommands.EXTRA_COMMAND_IDS.TREE_REORDER_NODE)({
    projectId: 'p-events',
    nodeId: 'scene-10',
    direction: 'up',
  });
  assert.equal(missingFacts.ok, false);
  assert.equal(missingFacts.error.reason, 'TREE_REORDER_DOMAIN_EVENT_REQUIRED');

  const forgedBridgeRegistry = createCommandRegistry();
  projectCommands.registerProjectCommands(forgedBridgeRegistry, {
    electronAPI: {
      async invokeUiCommandBridge() {
        return {
          ok: true,
          value: {
            ok: true,
            nodeId: 'scene-10',
            reordered: true,
            events: [event],
            domainEventDigest: 'f'.repeat(64),
            domainEventDigestVerified: true,
          },
        };
      },
    },
  });
  const forgedBridge = await forgedBridgeRegistry.getHandler(projectCommands.EXTRA_COMMAND_IDS.TREE_REORDER_NODE)({
    projectId: 'p-events',
    nodeId: 'scene-10',
    direction: 'up',
  });
  assert.equal(forgedBridge.ok, false);
  assert.equal(forgedBridge.error.reason, 'TREE_REORDER_DOMAIN_EVENT_DIGEST_VERIFICATION_REQUIRED');
});

test('Atlas V5 P1 domain events: Stage10 operation log and command receipt retain immutable fact digest', async () => {
  const runtime = await importRepoModule('src/product/stage10ProductWiring.mjs');
  const domainEvents = await importRepoModule('src/core/domainEvents.mjs');
  const hashing = await importRepoModule('src/core/browser-safe-hash.mjs');
  const store = new Map();
  function authorityRoot(record) {
    return hashing.hashCanonicalValue({
      schemaVersion: record.schemaVersion,
      authorityKind: record.authorityKind,
      authorityVersion: record.authorityVersion,
      previousAuthorityRootDigest: record.previousAuthorityRootDigest || '',
      receiptCount: record.receiptCount,
      receipts: record.receipts,
    });
  }
  const product = await runtime.createStage10ProductRuntime({
    projectId: 'stage10-domain-events',
    now: () => '2026-08-01T00:00:00.000Z',
    storagePort: {
      writeSession: async (session) => {
        store.set(session.projectId, JSON.parse(JSON.stringify(session)));
      },
      readSession: async (projectId) => store.get(projectId),
    },
  });

  const result = await product.dispatchVisibleCommand(
    'project.create',
    { projectId: 'stage10-domain-events', sceneId: 'scene-1', title: 'Events' },
    { mode: runtime.STAGE10_ACTIVATION_MODES.PHYSICAL_POINTER_OR_KEYBOARD, controlId: 'stage10-core-project-create' },
  );
  assert.equal(result.ok, true, result.error?.reason || '');
  assert.equal(result.receipt.schemaVersion, 'command-kernel.receipt.v1');
  assert.equal(Array.isArray(result.receipt.domainEvents), false);
  assert.equal(Array.isArray(result.receipt.details.domainEvents), false);
  const session = product.getSession();
  assert.equal(session.commandReceiptAuthority.schemaVersion, runtime.STAGE10_COMMAND_RECEIPT_AUTHORITY_SCHEMA);
  assert.equal(session.commandReceiptAuthority.receiptCount, 1);
  assert.equal(session.commandReceiptAuthority.authorityRootDigest, authorityRoot(session.commandReceiptAuthority));
  assert.ok(Array.isArray(session.eventLog.events[0].domainEvents));
  assert.equal(session.eventLog.events[0].domainEvents.length, 2);
  assert.equal(result.receipt.domainEventDigest, domainEvents.hashCoreDomainEvents(session.eventLog.events[0].domainEvents));
  assert.equal(result.receipt.domainEventCount, 2);
  assert.equal(session.eventLog.events[0].domainEventDigest, result.receipt.domainEventDigest);
  const readModels = product.getReadModels();
  assert.equal(readModels.replay.ok, true);
  assert.equal(readModels.replay.steps[0].commandReceiptRef.domainEventDigest, result.receipt.domainEventDigest);

  result.receipt.domainEventDigest = '0'.repeat(64);
  const internalSession = product.getSession();
  assert.notEqual(internalSession.commandReceipts[0].domainEventDigest, '0'.repeat(64));
  assert.equal(product.getReadModels().replay.ok, true);

  const missingReceiptSession = product.getSession();
  missingReceiptSession.commandReceiptAuthority.receipts = [];
  missingReceiptSession.commandReceiptAuthority.receiptCount = 0;
  missingReceiptSession.commandReceiptAuthority.authorityRootDigest = authorityRoot(missingReceiptSession.commandReceiptAuthority);
  assert.throws(
    () => runtime.buildStage10ProductReadModels(missingReceiptSession),
    (error) => error?.reason === 'COMMAND_KERNEL_RECEIPT_AUTHORITY_STALE_OR_ROLLED_BACK',
  );

  const missingAuthoritySession = product.getSession();
  delete missingAuthoritySession.commandReceiptAuthority;
  assert.throws(
    () => runtime.buildStage10ProductReadModels(missingAuthoritySession),
    (error) => error?.reason === 'COMMAND_KERNEL_RECEIPT_AUTHORITY_MISSING',
  );

  const wrongVersionSession = product.getSession();
  wrongVersionSession.commandReceiptAuthority.schemaVersion = 'yalken.stage10.commandReceiptAuthority.future';
  assert.throws(
    () => runtime.buildStage10ProductReadModels(wrongVersionSession),
    (error) => error?.reason === 'COMMAND_KERNEL_RECEIPT_AUTHORITY_VERSION_INVALID',
  );

  const staleDigestSession = product.getSession();
  staleDigestSession.eventLog.events[0].domainEvents[0].payload.projectId = 'mutated-event-fact';
  const staleDigestReadModels = runtime.buildStage10ProductReadModels(staleDigestSession);
  assert.equal(staleDigestReadModels.replay.ok, false);
  assert.equal(
    staleDigestReadModels.replay.rejected[0].code,
    'E_COLLAB_OPERATION_REPLAY_ENTRY_INVALID',
  );

  const missingEventDigestSession = product.getSession();
  delete missingEventDigestSession.eventLog.events[0].domainEventDigest;
  const missingEventDigestReadModels = runtime.buildStage10ProductReadModels(missingEventDigestSession);
  assert.equal(missingEventDigestReadModels.replay.ok, false);
  assert.equal(
    missingEventDigestReadModels.replay.rejected[0].code,
    'E_COLLAB_OPERATION_REPLAY_ENTRY_INVALID',
  );

  const strippedReceiptDigestSession = product.getSession();
  delete strippedReceiptDigestSession.commandReceiptAuthority.receipts[0].domainEventDigest;
  assert.throws(
    () => runtime.buildStage10ProductReadModels(strippedReceiptDigestSession),
    (error) => error?.reason === 'COMMAND_KERNEL_RECEIPT_AUTHORITY_DIGEST_INVALID',
  );

  const jointMutationSession = product.getSession();
  jointMutationSession.eventLog.events[0].domainEvents[0].payload.projectId = 'jointly-mutated-event-fact';
  jointMutationSession.eventLog.events[0].domainEventDigest = domainEvents.hashCoreDomainEvents(jointMutationSession.eventLog.events[0].domainEvents);
  jointMutationSession.commandReceiptAuthority.receipts[0].domainEventDigest = jointMutationSession.eventLog.events[0].domainEventDigest;
  assert.throws(
    () => runtime.buildStage10ProductReadModels(jointMutationSession),
    (error) => error?.reason === 'COMMAND_KERNEL_RECEIPT_AUTHORITY_DIGEST_INVALID',
  );

  const receiptFactsSession = product.getSession();
  receiptFactsSession.commandReceiptAuthority.receipts[0].domainEvents = receiptFactsSession.eventLog.events[0].domainEvents;
  receiptFactsSession.commandReceiptAuthority.authorityRootDigest = authorityRoot(receiptFactsSession.commandReceiptAuthority);
  const receiptFactsReadModels = runtime.buildStage10ProductReadModels(receiptFactsSession);
  assert.equal(receiptFactsReadModels.replay.ok, false);
  assert.equal(
    receiptFactsReadModels.replay.rejected[0].code,
    'E_COLLAB_OPERATION_REPLAY_RECEIPT_FACTS_FORBIDDEN',
  );

  const forgedReceiptSession = product.getSession();
  forgedReceiptSession.commandReceipts = [{
    ...forgedReceiptSession.commandReceipts[0],
    domainEventDigest: 'f'.repeat(64),
  }];
  assert.equal(runtime.buildStage10ProductReadModels(forgedReceiptSession).replay.ok, true);

  const persisted = product.getSession();
  const missingAuthorityStore = new Map([[persisted.projectId, { ...persisted, commandReceiptAuthority: undefined }]]);
  await assert.rejects(
    () => runtime.reopenStage10ProductRuntime({
      projectId: persisted.projectId,
      storagePort: {
        writeSession: async () => ({ ok: true }),
        readSession: async (projectId) => missingAuthorityStore.get(projectId),
      },
    }),
    (error) => error?.reason === 'COMMAND_KERNEL_RECEIPT_AUTHORITY_MISSING',
  );

  const rollbackAuthority = product.getSession();
  rollbackAuthority.commandReceiptAuthority.receipts = [];
  rollbackAuthority.commandReceiptAuthority.receiptCount = 0;
  rollbackAuthority.commandReceiptAuthority.authorityRootDigest = authorityRoot(rollbackAuthority.commandReceiptAuthority);
  const rollbackStore = new Map([[rollbackAuthority.projectId, rollbackAuthority]]);
  await assert.rejects(
    () => runtime.reopenStage10ProductRuntime({
      projectId: rollbackAuthority.projectId,
      storagePort: {
        writeSession: async () => ({ ok: true }),
        readSession: async (projectId) => rollbackStore.get(projectId),
      },
    }),
    (error) => error?.reason === 'COMMAND_KERNEL_RECEIPT_AUTHORITY_STALE_OR_ROLLED_BACK',
  );
});

test('Atlas V5 P1 domain events: Stage10 exposes the typed offline collab apply caller through product runtime and reopen', async () => {
  const stage10 = await importRepoModule('src/product/stage10ProductWiring.mjs');
  const core = await importRepoModule('src/core/runtime.mjs');
  const source = readRepoText('src/product/stage10ProductWiring.mjs');
  const applySource = readRepoText('src/collab/applyEventLog.mjs');
  assert.match(source, /applyEventLog/u);
  assert.match(source, /COLLAB_EVENT_LOG_APPLY/u);
  assert.doesNotMatch(applySource, /from\s+['"][^'"]*\/core\/[^'"]*['"]/u);

  const store = new Map();
  const storagePort = {
    writeSession: async (projectId, session) => {
      store.set(projectId, JSON.parse(JSON.stringify(session)));
      return { ok: true };
    },
    readSession: async (projectId) => store.get(projectId),
  };
  const product = await stage10.createStage10ProductRuntime({
    projectId: 'stage10-collab-apply',
    now: () => '2026-08-01T00:00:00.000Z',
    storagePort,
  });
  const initialState = core.createInitialCoreState();
  const result = await product.dispatchVisibleCommand(
    stage10.STAGE10_PRODUCT_COMMAND_IDS.COLLAB_EVENT_LOG_APPLY,
    {
      events: [{
        eventId: 'remote-event-1',
        actorId: 'peer-a',
        ts: '2026-08-01T00:00:00.000Z',
        opId: 'remote-op-1',
        commandId: core.CORE_COMMAND_IDS.PROJECT_CREATE,
        payload: { projectId: 'stage10-collab-apply', sceneId: 'scene-1', title: 'Applied locally' },
        prevHash: core.hashCoreState(initialState),
      }],
    },
    {
      mode: stage10.STAGE10_ACTIVATION_MODES.PHYSICAL_POINTER_OR_KEYBOARD,
      controlId: 'stage10-collab-apply-event-log',
    },
  );
  assert.equal(result.ok, true, result.error?.reason || '');
  assert.equal(result.receipt.commandId, stage10.STAGE10_PRODUCT_COMMAND_IDS.COLLAB_EVENT_LOG_APPLY);
  assert.equal(result.receipt.details.networkDispatch, false);
  assert.equal(result.receipt.details.secondJournal, false);
  assert.match(result.receipt.domainEventDigest, /^[a-f0-9]{64}$/u);
  assert.equal(Object.keys(product.getSession().collabApplyReports).length, 1);

  const reopened = await stage10.reopenStage10ProductRuntime({
    projectId: 'stage10-collab-apply',
    storagePort,
  });
  const reopenedSession = reopened.getSession();
  assert.equal(Object.keys(reopenedSession.collabApplyReports).length, 1);
  assert.equal(reopenedSession.commandReceiptAuthority.receipts[0].commandId, stage10.STAGE10_PRODUCT_COMMAND_IDS.COLLAB_EVENT_LOG_APPLY);
});

test('Atlas V5 P1 domain events: doctor fails closed on wildcard public event contracts and helper has no UI or storage side channel', () => {
  const doctorSource = readRepoText('scripts/doctor.mjs');
  const domainSource = readRepoText('src/core/domainEvents.mjs');
  const runtimeSource = readRepoText('src/core/runtime.mjs');
  const applySource = readRepoText('src/collab/applyEventLog.mjs');
  const stage10Source = readRepoText('src/product/stage10ProductWiring.mjs');
  const productPortSource = readRepoText('src/product/domainEventPort.mjs');
  const editorSource = readRepoText('src/renderer/editor.js');
  const collabOpsSource = readRepoText('scripts/ops/collab-apply-pipeline-state.mjs');
  const requiredWorkflow = readRepoText('.github/workflows/rtk-required.yml');
  const packageJson = readRepoJson('package.json');

  assert.match(doctorSource, /PUBLIC_CORE_EVENT_WILDCARD_TYPE/u);
  assert.match(doctorSource, /DOMAIN_EVENTS_IMMUTABLE_AUTHORITY_COMMIT/u);
  assert.match(doctorSource, /DOMAIN_EVENTS_AUTHORITY_UNREADABLE/u);
  assert.match(doctorSource, /DOMAIN_EVENTS_BASELINE_REMOVED/u);
  assert.match(doctorSource, /DOMAIN_EVENTS_CONTRACT_REMOVED/u);
  assert.doesNotMatch(doctorSource, /embedded-authority-fallback/u);
  assert.doesNotMatch(doctorSource, /status:\s*hasDebt\s*\?\s*'EVENTS_APPEND_WARN'/u);
  assert.doesNotMatch(doctorSource, /if\s*\(!hasWildcardType\)\s*\{\s*for\s*\(const eventId of baselineEventIds\)/u);
  assert.doesNotMatch(domainSource, /from\s+['"]node:(fs|path|child_process|electron)['"]/u);
  assert.doesNotMatch(domainSource, /\b(localStorage|indexedDB|ipcRenderer)\s*[.(]/u);
  assert.doesNotMatch(domainSource, /\b(eventStore|appendEvent|writeEvent|appendFile|writeFile)\s*\(/u);
  assert.match(runtimeSource, /emitCoreDomainEventsForCommandResult/u);
  assert.doesNotMatch(applySource, /from\s+['"][^'"]*\/core\/[^'"]*['"]/u);
  assert.match(productPortSource, /createCoreDomainEventProductPort/u);
  assert.match(productPortSource, /validateCoreDomainEvent/u);
  assert.match(productPortSource, /hashCoreDomainEvents/u);
  assert.match(productPortSource, /secondJournal:\s*false/u);
  assert.match(editorSource, /createCoreDomainEventProductPort/u);
  assert.match(editorSource, /domainEventPort:\s*createCoreDomainEventProductPort\(\)/u);
  assert.match(stage10Source, /STAGE10_COMMAND_RECEIPT_AUTHORITY_SCHEMA/u);
  assert.match(stage10Source, /authorityRootDigest/u);
  assert.match(stage10Source, /COLLAB_EVENT_LOG_APPLY/u);
  assert.match(stage10Source, /applyEventLog/u);
  assert.match(collabOpsSource, /createCoreDomainEventProductPort/u);
  assert.equal(typeof packageJson.scripts['test:atlas-event-contract'], 'string');
  assert.match(requiredWorkflow, /npm run -s test:atlas-event-contract/u);
  assert.match(packageJson.scripts['test:atlas-event-contract'], /yalken-atlas-v5-p1-domain-event-contract-repair\.contract\.test\.js/u);
  assert.match(packageJson.scripts['test:atlas-event-contract'], /collab-apply-no-network-wiring\.contract\.test\.js/u);
  assert.match(packageJson.scripts['test:atlas-event-contract'], /collab-apply-pipeline-deterministic\.contract\.test\.js/u);
  assert.match(packageJson.scripts['test:atlas-event-contract'], /yalken-atlas-v5-e10-c03-operation-replay-command-event-log\.contract\.test\.js/u);
});

test('Atlas V5 P1 domain events: 1000-scene order event hashing stays inside bounded perf guard', async () => {
  const runtime = await importRepoModule('src/core/runtime.mjs');
  const sceneIds = Array.from({ length: 1000 }, (_, index) => `scene-${String(1000 - index).padStart(4, '0')}`);
  const startedAt = performance.now();
  const event = runtime.buildSceneOrderChangedEvent({
    projectId: 'p-events',
    sceneIds,
    commandSeq: 42,
    previousStateHash: 'c'.repeat(64),
    nextStateHash: 'd'.repeat(64),
  });
  const digest = runtime.hashCoreDomainEvents([event]);
  const elapsedMs = performance.now() - startedAt;

  assert.deepEqual(event.payload.sceneIds.slice(0, 3), ['scene-1000', 'scene-0999', 'scene-0998']);
  assert.match(digest, /^[a-f0-9]{64}$/u);
  assert.ok(elapsedMs < 150, `1000-scene event hashing took ${elapsedMs}ms`);
});
