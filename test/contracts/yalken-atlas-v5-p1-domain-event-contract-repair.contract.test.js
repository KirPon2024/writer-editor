const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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

test('Atlas V5 P1 domain events: Stage10 operation log and command receipt retain immutable fact digest', async () => {
  const runtime = await importRepoModule('src/product/stage10ProductWiring.mjs');
  const domainEvents = await importRepoModule('src/core/domainEvents.mjs');
  const store = new Map();
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
  assert.ok(Array.isArray(result.receipt.domainEvents));
  assert.equal(result.receipt.domainEvents.length, 2);
  assert.equal(result.receipt.domainEventDigest, domainEvents.hashCoreDomainEvents(result.receipt.domainEvents));
  const session = product.getSession();
  assert.equal(session.eventLog.events[0].domainEventDigest, result.receipt.domainEventDigest);
  assert.deepEqual(session.eventLog.events[0].domainEvents, result.receipt.domainEvents);
  const readModels = product.getReadModels();
  assert.equal(readModels.replay.ok, true);
  assert.equal(readModels.replay.steps[0].commandReceiptRef.domainEventDigest, result.receipt.domainEventDigest);
});

test('Atlas V5 P1 domain events: doctor fails closed on wildcard public event contracts and helper has no UI or storage side channel', () => {
  const doctorSource = readRepoText('scripts/doctor.mjs');
  const domainSource = readRepoText('src/core/domainEvents.mjs');
  const runtimeSource = readRepoText('src/core/runtime.mjs');

  assert.match(doctorSource, /PUBLIC_CORE_EVENT_WILDCARD_TYPE/u);
  assert.match(doctorSource, /DOMAIN_EVENTS_IMMUTABLE_AUTHORITY_COMMIT/u);
  assert.match(doctorSource, /DOMAIN_EVENTS_BASELINE_REMOVED/u);
  assert.match(doctorSource, /DOMAIN_EVENTS_CONTRACT_REMOVED/u);
  assert.doesNotMatch(doctorSource, /if\s*\(!hasWildcardType\)\s*\{\s*for\s*\(const eventId of baselineEventIds\)/u);
  assert.doesNotMatch(domainSource, /from\s+['"]node:(fs|path|child_process|electron)['"]/u);
  assert.doesNotMatch(domainSource, /\b(localStorage|indexedDB|ipcRenderer)\s*[.(]/u);
  assert.doesNotMatch(domainSource, /\b(eventStore|appendEvent|writeEvent|appendFile|writeFile)\s*\(/u);
  assert.match(runtimeSource, /emitCoreDomainEventsForCommandResult/u);
});
