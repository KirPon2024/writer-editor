const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();
const CONTRACT_BASENAME = 'yalken-atlas-v5-stage10-pr1391-audit-repair.contract.test.js';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function writeJson(targetPath, value) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sha256Text(value) {
  return createHash('sha256').update(Buffer.from(typeof value === 'string' ? value : '', 'utf8')).digest('hex');
}

async function importModule(relativePath) {
  return import(pathToFileURL(path.join(ROOT, relativePath)).href);
}

async function createHarness(name, options = {}) {
  const adapterModule = await importModule('src/product/stage10MainPersistenceAdapter.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `yalken-stage10-${name}-`));
  const projectRoot = path.join(root, 'project');
  const anchorRoot = path.join(root, 'main-owned-integrity');
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.mkdirSync(anchorRoot, { recursive: true });
  const makeAdapter = (adapterOptions = {}) => adapterModule.createStage10MainPersistenceAdapter({
    projectRoot,
    anchorRoot,
    ...adapterOptions,
  });
  return {
    root,
    projectRoot,
    anchorRoot,
    makeAdapter,
    adapter: makeAdapter(options),
  };
}

async function createProject(harness, projectId, options = {}) {
  const bootstrapModule = await importModule('src/product/stage10ApplicationBootstrap.mjs');
  const bootstrap = bootstrapModule.createStage10ApplicationBootstrap({
    persistencePort: options.persistencePort || harness.adapter,
    uiPort: options.uiPort,
    now: () => '2026-08-02T00:00:00.000Z',
  });
  const result = await bootstrap.createProjectRuntime({ projectId, title: projectId });
  assert.equal(result.ok, true);
  return bootstrap;
}

function remoteTextEditEvent(core, session, text, suffix = '1') {
  return {
    eventId: `remote-event-${suffix}`,
    actorId: 'peer-local-fixture',
    ts: `2026-08-02T00:00:0${suffix}.000Z`,
    opId: `remote-op-${suffix}`,
    commandId: core.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
    payload: {
      projectId: session.projectId,
      sceneId: 'scene-1',
      text,
    },
    prevHash: core.hashCoreState(session.coreState),
  };
}

function commentFixture() {
  return {
    sceneId: 'scene-1',
    revisionId: 'revision-real-route',
    reviewIr: {
      schemaVersion: 'yalken.rtk.review-ir.v2',
      commentThreads: [{
        threadId: 'rtk-comment-real-route',
        commentId: '100',
        durableId: 'durable-comment-real-route',
        doneResolvedReopenedState: 'active',
        body: 'Real product route comment.',
        status: 'ANCHORED',
        quotedAnchorText: 'fresh',
        replies: [],
        reasonCodes: ['RTK_COMMENT_ANCHORED'],
      }],
    },
    context: {
      blockMap: {
        'block-1': { lineageId: 'lineage-1', text: 'fresh reopen text' },
      },
    },
    placementHints: {
      'durable-comment-real-route': {
        schemaVersion: 'revision-bridge.comment-anchor-placement.v1',
        placementId: 'placement-real-route',
        durableId: 'durable-comment-real-route',
        threadId: 'rtk-comment-real-route',
        targetScope: { type: 'scene', id: 'scene-1' },
        inlineRange: {
          schemaVersion: 'revision-bridge.inline-range.v1',
          kind: 'span',
          blockId: 'block-1',
          lineageId: 'lineage-1',
          from: 0,
          to: 5,
          quote: 'fresh',
          prefix: '',
          suffix: ' reopen',
          confidence: 'exact',
          riskClass: 'low',
          automationPolicy: 'manualOnly',
          deletedTarget: false,
          reasonCodes: [],
        },
        resolvedState: 'open',
        acceptedState: 'pending',
        diagnosticsOnly: false,
      },
    },
  };
}

function conflictFixture(core, projectId) {
  const initial = { version: 1, content: 'base', lastOpId: '' };
  const event = (suffix, content) => ({
    opId: `conflict-op-${suffix}`,
    actorId: `actor-${suffix}`,
    sessionId: `session-${suffix}`,
    seq: 1,
    ts: '2026-08-02T00:00:06.000Z',
    commandId: core.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
    payloadHash: 'a'.repeat(64),
    baseVersion: 1,
    nextVersion: 2,
    content,
  });
  return {
    initialState: initial,
    reopenedState: initial,
    sessions: [
      { sessionId: 'session-local', actorId: 'actor-local', events: [event('local', `${projectId}:local`)] },
      { sessionId: 'session-remote', actorId: 'actor-remote', events: [event('remote', `${projectId}:remote`)] },
    ],
  };
}

function routedValue(result) {
  return result?.value?.result || result?.result || result?.value || result;
}

function stage10Activation(commandId) {
  return {
    mode: 'DOM_VISIBLE_CONTROL_LISTENER_FALLBACK',
    controlId: `stage10-r1c-${commandId}`,
  };
}

test('Stage10 repair: real renderer command route creates, persists, closes, freshly reopens and replays collab provenance', async () => {
  const harness = await createHarness('real-route');
  const projectId = 'stage10-real-product-route';
  const bootstrap = await createProject(harness, projectId);
  const routeModule = await importModule('src/product/stage10ApplicationCommandRoute.mjs');
  const stage10 = await importModule('src/product/stage10ProductWiring.mjs');
  const core = await importModule('src/core/runtime.mjs');
  const registryModule = await importModule('src/renderer/commands/registry.mjs');
  const projectCommands = await importModule('src/renderer/commands/projectCommands.mjs');
  const route = routeModule.createStage10ApplicationCommandRoute({ getBootstrap: () => bootstrap });
  const registry = registryModule.createCommandRegistry();
  projectCommands.registerProjectCommands(registry, {
    electronAPI: {
      invokeUiCommandBridge: ({ commandId, payload }) => route.dispatch(commandId, payload),
    },
  });

  for (const commandId of Object.values(stage10.STAGE10_PRODUCT_COMMAND_IDS).filter((id) => id.startsWith('cmd.comments.') || id.startsWith('cmd.collab.'))) {
    assert.equal(typeof registry.getHandler(commandId), 'function', `${commandId} missing from real renderer registry`);
    const meta = registry.getMeta(commandId);
    assert.equal(meta.surface.includes('review'), true, `${commandId} must be visible from the review product surface`);
    assert.equal(meta.surface.includes('internal'), false, `${commandId} must not remain internal-only`);
  }

  const commentImport = await registry.getHandler(stage10.STAGE10_PRODUCT_COMMAND_IDS.COMMENT_IMPORT_STABLE_PACKET)({
    projectId,
    ...commentFixture(),
  });
  assert.equal(commentImport.ok, true);
  const importedPacket = routedValue(commentImport).packet;
  const commentDecision = await registry.getHandler(stage10.STAGE10_PRODUCT_COMMAND_IDS.COMMENT_DECISION_RECORD)({
    projectId,
    packetHash: importedPacket.packetHash,
    decisionId: importedPacket.decisionRows[0].decisionId,
    state: 'acknowledged',
  });
  assert.equal(commentDecision.ok, true);

  const conflictPreview = await registry.getHandler(stage10.STAGE10_PRODUCT_COMMAND_IDS.CONFLICT_PREVIEW)({
    projectId,
    ...conflictFixture(core, projectId),
  });
  assert.equal(conflictPreview.ok, true);
  const conflict = routedValue(conflictPreview);
  const conflictDecision = await registry.getHandler(stage10.STAGE10_PRODUCT_COMMAND_IDS.CONFLICT_DECISION_RECORD)({
    projectId,
    reportId: conflict.reportId,
    conflictId: conflict.report.conflicts[0].conflictId,
    decision: 'keepLocal',
  });
  assert.equal(conflictDecision.ok, true);

  const exchangePrepare = await registry.getHandler(stage10.STAGE10_PRODUCT_COMMAND_IDS.OPERATION_EXCHANGE_PREPARE)({
    projectId,
    transportCapabilityEnabled: true,
    networkAdapterEnabled: false,
  });
  assert.equal(exchangePrepare.ok, true);
  const exchangePreview = await registry.getHandler(stage10.STAGE10_PRODUCT_COMMAND_IDS.OPERATION_EXCHANGE_LOCAL_FIXTURE_PREVIEW)({
    projectId,
    packetId: routedValue(exchangePrepare).packetId,
  });
  assert.equal(exchangePreview.ok, true);

  const before = bootstrap.getRuntime().getSession();
  const commandId = stage10.STAGE10_PRODUCT_COMMAND_IDS.COLLAB_EVENT_LOG_APPLY;
  const routed = await registry.getHandler(commandId)({
    projectId,
    events: [remoteTextEditEvent(core, before, 'fresh reopen text')],
  });
  assert.equal(routed.ok, true, routed.error?.reason || 'renderer Stage10 command failed');

  const persisted = await harness.adapter.readStage10State(projectId);
  assert.equal(persisted.session.eventLog.events.at(-1).commandId, core.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT);
  assert.equal(persisted.session.eventLog.events.at(-1).opId, 'remote-op-1');
  assert.equal(persisted.authorityStore.receipts.at(-1).commandId, commandId);
  for (const requiredCommandId of Object.values(stage10.STAGE10_PRODUCT_COMMAND_IDS).filter((id) => id.startsWith('cmd.comments.') || id.startsWith('cmd.collab.'))) {
    assert.ok(persisted.authorityStore.receipts.some((receipt) => receipt.commandId === requiredCommandId));
  }
  assert.equal(persisted.authorityStore.currentHead.eventLogDigest, persisted.integrityAnchor.eventLogDigest);

  const freshAdapter = harness.makeAdapter();
  const bootstrapModule = await importModule('src/product/stage10ApplicationBootstrap.mjs');
  const freshBootstrap = bootstrapModule.createStage10ApplicationBootstrap({ persistencePort: freshAdapter });
  const reopened = await freshBootstrap.reopenProjectRuntime({ projectId });
  assert.equal(reopened.ok, true);
  assert.equal(reopened.readModels.replay.ok, true);
  assert.equal(freshBootstrap.getRuntime().getSession().coreState.data.projects[projectId].scenes['scene-1'].text, 'fresh reopen text');
  assert.equal(
    reopened.readModels.replay.finalStateHash,
    core.hashCoreState(freshBootstrap.getRuntime().getSession().coreState),
  );

  const corrupted = cloneJson(await freshAdapter.readStage10State(projectId));
  corrupted.session.coreState.data.projects[projectId].scenes['scene-1'].text = 'forged reopened state';
  const paths = freshAdapter.paths(projectId);
  writeJson(paths.session, corrupted.session);
  await assert.rejects(
    () => bootstrapModule.createStage10ApplicationBootstrap({ persistencePort: harness.makeAdapter() })
      .reopenProjectRuntime({ projectId }),
    (error) => error?.reason === 'INTEGRITY_ANCHOR_SESSION_MISMATCH',
  );
});

test('Stage10 R1-C: packaged review rail exposes visible lifecycle controls backed by product command ids', () => {
  const editorSource = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'editor.js'), 'utf8');
  const registrySource = fs.readFileSync(path.join(ROOT, 'src', 'shared', 'productCommandRegistry.cjs'), 'utf8');
  const requiredCommands = [
    'cmd.comments.importStablePacket',
    'cmd.collab.conflict.preview',
    'cmd.collab.operationExchange.prepare',
    'cmd.collab.operationExchange.localFixturePreview',
    'cmd.collab.eventLog.apply',
  ];
  assert.match(editorSource, /data-stage10-lifecycle-surface/u);
  assert.match(editorSource, /data-stage10-product-command/u);
  assert.match(editorSource, /dispatchUiCommand\(commandId,\s*request\.payload\)/u);
  assert.match(editorSource, /buildStage10LifecycleCommandRequest/u);
  assert.match(editorSource, /STAGE10_PRODUCT_STATE_QUERY_ID/u);
  assert.match(editorSource, /latestExchangePacketId/u);
  assert.match(editorSource, /pendingCollaboratorEvents/u);
  assert.doesNotMatch(editorSource, /Stage-10 visible lifecycle packet/u);
  assert.doesNotMatch(editorSource, /adapterKind:\s*'localFixture'/u);
  assert.match(editorSource, /Visible controls route through preload, main IPC, application bootstrap and the Command Kernel/u);
  for (const commandId of requiredCommands) {
    assert.match(editorSource, new RegExp(commandId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
  }
  assert.match(registrySource, /surface:\s*\['review',\s*'product'\]/u);
  assert.doesNotMatch(registrySource, /id:\s*'cmd\\.comments\\.importStablePacket'[\s\S]*?surface:\s*\['internal'\]/u);
  assert.doesNotMatch(registrySource, /id:\s*'cmd\\.collab\\.eventLog\\.apply'[\s\S]*?surface:\s*\['internal'\]/u);
});

test('Stage10 repair: external main-owned anchor rejects rollback, coherent rebuild, project mismatch and forged authority', async () => {
  const harness = await createHarness('anchor-attacks');
  const projectId = 'stage10-anchor-attacks';
  const bootstrap = await createProject(harness, projectId);
  const stage10 = await importModule('src/product/stage10ProductWiring.mjs');
  const authority = await importModule('src/product/stage10CommandReceiptAuthorityHead.mjs');
  const anchorModule = await importModule('src/product/stage10IntegrityAnchor.mjs');
  const bootstrapModule = await importModule('src/product/stage10ApplicationBootstrap.mjs');
  const paths = harness.adapter.paths(projectId);
  const oldBundle = cloneJson(await harness.adapter.readStage10State(projectId));
  const mutation = await bootstrap.dispatchProjectCommand(
    stage10.STAGE10_PRODUCT_COMMAND_IDS.OPERATION_EXCHANGE_PREPARE,
    { projectId, sessionId: 'local-session' },
  );
  assert.equal(mutation.ok, true);
  const current = cloneJson(await harness.adapter.readStage10State(projectId));

  writeJson(paths.session, oldBundle.session);
  writeJson(paths.authority, oldBundle.authorityStore);
  await assert.rejects(
    () => bootstrapModule.createStage10ApplicationBootstrap({ persistencePort: harness.makeAdapter() })
      .reopenProjectRuntime({ projectId }),
    (error) => error?.reason === 'INTEGRITY_ANCHOR_STALE_OR_ROLLED_BACK',
  );
  writeJson(paths.session, current.session);
  writeJson(paths.authority, current.authorityStore);

  const forged = cloneJson(current);
  forged.authorityStore.receipts[0].details.forged = true;
  forged.authorityStore.currentHead.receiptRootDigest = authority.receiptRootDigest(forged.authorityStore.receipts);
  forged.authorityStore.currentHead.authorityHeadDigest = authority.authorityHeadDigest(forged.authorityStore.currentHead);
  forged.session.commandReceiptAuthorityHeadRef = authority.createCommandReceiptAuthorityHeadRef(forged.authorityStore.currentHead);
  writeJson(paths.session, forged.session);
  writeJson(paths.authority, forged.authorityStore);
  await assert.rejects(
    () => bootstrapModule.createStage10ApplicationBootstrap({ persistencePort: harness.makeAdapter() })
      .reopenProjectRuntime({ projectId }),
    (error) => error?.reason === 'INTEGRITY_ANCHOR_STALE_OR_ROLLED_BACK'
      || error?.reason === 'INTEGRITY_ANCHOR_AUTHORITY_STORE_MISMATCH'
      || error?.reason === 'INTEGRITY_ANCHOR_SESSION_MISMATCH',
  );
  writeJson(paths.session, current.session);
  writeJson(paths.authority, current.authorityStore);

  const canonicalAnchor = cloneJson(current.integrityAnchor);
  const attackAnchors = [
    { expected: 'INTEGRITY_ANCHOR_VERSION_INVALID', mutate: (value) => { value.anchorVersion = 99; } },
    { expected: 'INTEGRITY_ANCHOR_PROJECT_MISMATCH', mutate: (value) => { value.projectId = 'other-project'; value.integrityAnchorDigest = anchorModule.stage10IntegrityAnchorDigest(value); } },
    { expected: 'INTEGRITY_ANCHOR_STALE_OR_ROLLED_BACK', mutate: (value) => { value.authorityGeneration -= 1; value.integrityAnchorDigest = anchorModule.stage10IntegrityAnchorDigest(value); } },
    { expected: 'INTEGRITY_ANCHOR_PREVIOUS_DIGEST_FORKED', mutate: (value) => { value.previousIntegrityAnchorDigest = 'f'.repeat(64); value.integrityAnchorDigest = anchorModule.stage10IntegrityAnchorDigest(value); } },
  ];
  for (const attack of attackAnchors) {
    const next = cloneJson(canonicalAnchor);
    attack.mutate(next);
    writeJson(paths.anchor, next);
    await assert.rejects(
      () => bootstrapModule.createStage10ApplicationBootstrap({ persistencePort: harness.makeAdapter() })
        .reopenProjectRuntime({ projectId }),
      (error) => error?.reason === attack.expected
        || (
          attack.expected === 'INTEGRITY_ANCHOR_PROJECT_MISMATCH'
          && [
            'PROJECT_KEY_CANONICAL_COLLISION',
            'PROJECT_KEY_MIGRATION_IDENTITY_CONFLICT',
          ].includes(error?.reason)
        ),
    );
    writeJson(paths.anchor, canonicalAnchor);
  }

  fs.unlinkSync(paths.anchor);
  await assert.rejects(
    () => bootstrapModule.createStage10ApplicationBootstrap({ persistencePort: harness.makeAdapter() })
      .reopenProjectRuntime({ projectId }),
    (error) => error?.reason === 'PERSISTENCE_SPLIT_STATE_DETECTED',
  );
  writeJson(paths.anchor, canonicalAnchor);

  const wrongAuthority = cloneJson(current.authorityStore);
  wrongAuthority.schemaVersion = 'yalken.stage10.commandReceiptAuthorityStore.future';
  writeJson(paths.authority, wrongAuthority);
  await assert.rejects(
    () => bootstrapModule.createStage10ApplicationBootstrap({ persistencePort: harness.makeAdapter() })
      .reopenProjectRuntime({ projectId }),
    (error) => error?.reason === 'COMMAND_KERNEL_RECEIPT_AUTHORITY_STORE_VERSION_INVALID',
  );
});

async function runInterruptedCommand(killpointName) {
  const harness = await createHarness(`kill-${killpointName}`);
  const projectId = `stage10-kill-${killpointName}`;
  await createProject(harness, projectId);
  const before = cloneJson(await harness.adapter.readStage10State(projectId));
  const bootstrapModule = await importModule('src/product/stage10ApplicationBootstrap.mjs');
  const core = await importModule('src/core/runtime.mjs');
  let armed = true;
  const faultAdapter = harness.makeAdapter({
    onKillpoint(name) {
      if (armed && name === killpointName) {
        armed = false;
        throw new Error(`KILLPOINT:${name}`);
      }
    },
  });
  const faultBootstrap = bootstrapModule.createStage10ApplicationBootstrap({ persistencePort: faultAdapter });
  await faultBootstrap.reopenProjectRuntime({ projectId });
  await assert.rejects(
    () => faultBootstrap.dispatchProjectCommand(core.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT, {
      projectId,
      sceneId: 'scene-1',
      text: `killpoint ${killpointName}`,
    }),
    new RegExp(`KILLPOINT:${killpointName}`),
  );
  const recoveryAdapter = harness.makeAdapter();
  const recovered = await recoveryAdapter.readStage10State(projectId);
  assert.equal(recovered.recoveryConsumed, true);
  const freshBootstrap = bootstrapModule.createStage10ApplicationBootstrap({ persistencePort: recoveryAdapter });
  const reopened = await freshBootstrap.reopenProjectRuntime({ projectId });
  assert.equal(reopened.readModels.replay.ok, true);
  return { before, recovered, session: freshBootstrap.getRuntime().getSession() };
}

test('Stage10 repair: interrupted authority/session ordering recovers atomically at every killpoint', async () => {
  for (const killpointName of ['after-transaction-write', 'after-authority-write', 'after-session-write']) {
    const result = await runInterruptedCommand(killpointName);
    assert.equal(result.recovered.authorityStore.currentHead.receiptCount, result.before.authorityStore.currentHead.receiptCount);
    assert.equal(result.session.coreState.data.projects[result.session.projectId].scenes['scene-1'].text, '');
  }
  const committed = await runInterruptedCommand('after-anchor-write');
  assert.equal(committed.recovered.authorityStore.currentHead.receiptCount, committed.before.authorityStore.currentHead.receiptCount + 1);
  assert.equal(committed.session.coreState.data.projects[committed.session.projectId].scenes['scene-1'].text, 'killpoint after-anchor-write');
});

test('Stage10 repair: interrupted canonical project truth write rolls manifest and authority back together', async () => {
  const harness = await createHarness('project-truth-killpoint');
  const projectId = 'stage10-project-truth-killpoint';
  await createProject(harness, projectId);
  const before = cloneJson(await harness.adapter.readStage10State(projectId));
  const manifestPath = path.join(harness.projectRoot, 'project.craftsman.json');
  const previousText = `${JSON.stringify({ schemaVersion: 1, projectId, atlas: { schemaVersion: 'atlas.author.v1', entities: {} } }, null, 2)}\n`;
  const nextText = `${JSON.stringify({ schemaVersion: 1, projectId, atlas: { schemaVersion: 'atlas.author.v1', entities: { 'entity-after-kill': { id: 'entity-after-kill' } } } }, null, 2)}\n`;
  fs.writeFileSync(manifestPath, previousText, 'utf8');
  const crypto = require('node:crypto');
  const hashText = (value) => crypto.createHash('sha256').update(Buffer.from(value, 'utf8')).digest('hex');
  let armed = true;
  const faultAdapter = harness.makeAdapter({
    onKillpoint(name) {
      if (armed && name === 'after-project-truth-write') {
        armed = false;
        throw new Error(`KILLPOINT:${name}`);
      }
    },
  });
  const bootstrapModule = await importModule('src/product/stage10ApplicationBootstrap.mjs');
  const core = await importModule('src/core/runtime.mjs');
  const faultBootstrap = bootstrapModule.createStage10ApplicationBootstrap({ persistencePort: faultAdapter });
  await faultBootstrap.reopenProjectRuntime({ projectId });
  const canonicalState = faultBootstrap.getRuntime().getSession().coreState;
  await assert.rejects(
    () => faultBootstrap.dispatchCanonicalProjectCommand(
      core.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      {
        projectId,
        opId: 'project-truth-killpoint-op',
        entityId: 'entity-after-kill',
        name: 'After Kill',
        entityKind: 'character',
      },
      {
        coreState: canonicalState,
        prepareMutation() {
          return {
            schemaVersion: 'yalken.stage10.projectTruthMutation.v1',
            projectId,
            relativePath: 'project.craftsman.json',
            previousText,
            nextText,
            previousHash: hashText(previousText),
            nextHash: hashText(nextText),
          };
        },
      },
    ),
    /KILLPOINT:after-project-truth-write/u,
  );
  assert.equal(fs.readFileSync(manifestPath, 'utf8'), nextText);

  const recoveryAdapter = harness.makeAdapter();
  const recovered = await recoveryAdapter.readStage10State(projectId);
  assert.equal(recovered.recoveryConsumed, true);
  assert.equal(fs.readFileSync(manifestPath, 'utf8'), previousText);
  assert.equal(recovered.authorityStore.currentHead.receiptCount, before.authorityStore.currentHead.receiptCount);
  assert.deepEqual(recovered.session, before.session);
});

async function atomicWriteWithFailure(targetBasename) {
  let failed = false;
  return async (targetPath, content) => {
    if (!failed && path.basename(targetPath) === targetBasename) {
      failed = true;
      return { success: false };
    }
    const tempPath = `${targetPath}.${process.pid}.test.tmp`;
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(tempPath, content, 'utf8');
    fs.renameSync(tempPath, targetPath);
    return { success: true };
  };
}

test('Stage10 repair: negative write acknowledgements never return command success and fresh reopen consumes recovery', async () => {
  const bootstrapModule = await importModule('src/product/stage10ApplicationBootstrap.mjs');
  const core = await importModule('src/core/runtime.mjs');
  for (const basename of ['command-receipt-authority-store.v2.json', 'product-session.v2.json']) {
    const harness = await createHarness(`write-fail-${basename}`);
    const projectId = `stage10-write-fail-${basename.split('.')[0]}`;
    await createProject(harness, projectId);
    const before = await harness.adapter.readStage10State(projectId);
    const failureAdapter = harness.makeAdapter({ writeFileAtomic: await atomicWriteWithFailure(basename) });
    const failureBootstrap = bootstrapModule.createStage10ApplicationBootstrap({ persistencePort: failureAdapter });
    await failureBootstrap.reopenProjectRuntime({ projectId });
    await assert.rejects(
      () => failureBootstrap.dispatchProjectCommand(core.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT, {
        projectId,
        sceneId: 'scene-1',
        text: 'must not acknowledge',
      }),
      (error) => error?.reason === 'PERSISTENCE_WRITE_REJECTED',
    );
    const recoveryAdapter = harness.makeAdapter();
    const recovered = await recoveryAdapter.readStage10State(projectId);
    assert.equal(recovered.recoveryConsumed, true);
    assert.equal(recovered.authorityStore.currentHead.receiptCount, before.authorityStore.currentHead.receiptCount);
  }

  const harness = await createHarness('write-fail-project-truth');
  const projectId = 'stage10-write-fail-project-truth';
  await createProject(harness, projectId);
  const before = cloneJson(await harness.adapter.readStage10State(projectId));
  const manifestPath = path.join(harness.projectRoot, 'project.craftsman.json');
  const previousText = `${JSON.stringify({ schemaVersion: 1, projectId, atlas: { schemaVersion: 'atlas.author.v1', entities: {} } }, null, 2)}\n`;
  const nextText = `${JSON.stringify({ schemaVersion: 1, projectId, atlas: { schemaVersion: 'atlas.author.v1', entities: { denied: { id: 'denied' } } } }, null, 2)}\n`;
  fs.writeFileSync(manifestPath, previousText, 'utf8');
  const crypto = require('node:crypto');
  const hashText = (value) => crypto.createHash('sha256').update(Buffer.from(value, 'utf8')).digest('hex');
  const failureAdapter = harness.makeAdapter({ writeFileAtomic: await atomicWriteWithFailure('project.craftsman.json') });
  const failureBootstrap = bootstrapModule.createStage10ApplicationBootstrap({ persistencePort: failureAdapter });
  await failureBootstrap.reopenProjectRuntime({ projectId });
  await assert.rejects(
    () => failureBootstrap.dispatchCanonicalProjectCommand(
      core.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      {
        projectId,
        opId: 'project-truth-write-rejected',
        entityId: 'denied',
        name: 'Denied',
        entityKind: 'character',
      },
      {
        coreState: failureBootstrap.getRuntime().getSession().coreState,
        prepareMutation() {
          return {
            schemaVersion: 'yalken.stage10.projectTruthMutation.v1',
            projectId,
            relativePath: 'project.craftsman.json',
            previousText,
            nextText,
            previousHash: hashText(previousText),
            nextHash: hashText(nextText),
          };
        },
      },
    ),
    (error) => error?.reason === 'PROJECT_TRUTH_WRITE_REJECTED',
  );
  const recoveryAdapter = harness.makeAdapter();
  const recovered = await recoveryAdapter.readStage10State(projectId);
  assert.equal(recovered.recoveryConsumed, true);
  assert.equal(fs.readFileSync(manifestPath, 'utf8'), previousText);
  assert.equal(recovered.authorityStore.currentHead.receiptCount, before.authorityStore.currentHead.receiptCount);
});

test('Stage10 repair: invalid existing state fails before application activation or UI publication while legacy absence opens safely', async () => {
  const harness = await createHarness('preactivation');
  const projectId = 'stage10-preactivation';
  await createProject(harness, projectId);
  const paths = harness.adapter.paths(projectId);
  const persisted = cloneJson(await harness.adapter.readStage10State(projectId));
  persisted.session.coreState.data.projects[projectId].title = 'coherently forged title';
  writeJson(paths.session, persisted.session);
  let published = 0;
  const bootstrapModule = await importModule('src/product/stage10ApplicationBootstrap.mjs');
  await assert.rejects(
    () => bootstrapModule.createStage10ApplicationBootstrap({
      persistencePort: harness.makeAdapter(),
      uiPort: { publishSurface() { published += 1; } },
    }).reopenProjectRuntime({ projectId }),
    (error) => error?.reason === 'INTEGRITY_ANCHOR_SESSION_MISMATCH',
  );
  assert.equal(published, 0);

  const legacyHarness = await createHarness('legacy-absence');
  const legacyBootstrap = await createProject(legacyHarness, 'stage10-legacy-with-no-state');
  assert.equal(legacyBootstrap.getRuntime().getReadModels().replay.ok, true);

  const mainSource = readText('src/main.js');
  const openStart = mainSource.indexOf('async function handleProjectLifecycleOpenCommand');
  const openEnd = mainSource.indexOf('async function handleProjectLifecycleContinueCommand', openStart);
  const openSource = mainSource.slice(openStart, openEnd);
  assert.ok(openSource.indexOf('bootstrapStage10ApplicationForProject') < openSource.indexOf('setActiveProjectNameFromRoot'));
  assert.ok(openSource.indexOf('bootstrapStage10ApplicationForProject') < openSource.indexOf('openProjectDocumentFile'));
  assert.ok(openSource.indexOf('bootstrapStage10ApplicationForProject') < openSource.indexOf('loadSettings'));
});

test('Stage10 repair: compact authority append stays bounded per command and required CI cannot omit this production contract', async () => {
  const authority = await importModule('src/product/stage10CommandReceiptAuthorityHead.mjs');
  const collab = await importModule('src/collab/index.mjs');
  const eventLog = collab.createEmptyEventLog();
  let store = authority.createInitialCommandReceiptAuthorityStore({ projectId: 'stage10-perf', eventLog });
  const startedAt = performance.now();
  for (let index = 0; index < 1000; index += 1) {
    store = authority.appendCommandReceiptAuthorityHead({
      store,
      projectId: 'stage10-perf',
      eventLog,
      receipt: {
        schemaVersion: 'command-kernel.receipt.v1',
        receiptId: `receipt-${index}`,
        operationId: `operation-${index}`,
        commandId: 'project.applyTextEdit',
        status: 'APPLIED',
        appliedAt: '2026-08-02T00:00:00.000Z',
        actorId: 'local-author',
        sessionId: 'perf-session',
        preStateHash: 'a'.repeat(64),
        postStateHash: 'b'.repeat(64),
        capabilityRevalidated: true,
        activationMode: 'DOM_VISIBLE_CONTROL_LISTENER_FALLBACK',
        controlId: 'perf-control',
        visibleUiCommand: true,
        directBridge: false,
        storageWritten: true,
        domainEventDigest: '',
        domainEventCount: 0,
        details: {},
      },
    });
  }
  const durationMs = performance.now() - startedAt;
  assert.equal(Object.prototype.hasOwnProperty.call(store, 'headHistory'), false);
  assert.equal(store.compaction.headHistoryStored, false);
  assert.equal(store.compaction.retainedReceiptCount, 1000);
  assert.equal(store.currentHead.receiptCount, 1000);
  assert.ok(durationMs < 2500, `1000 command authority appends took ${durationMs.toFixed(1)}ms`);
  assert.ok(Buffer.byteLength(JSON.stringify(store), 'utf8') < 1400000);

  const packageJson = JSON.parse(readText('package.json'));
  assert.match(packageJson.scripts['test:atlas-event-contract'], new RegExp(CONTRACT_BASENAME.replaceAll('.', '\\.'), 'u'));
  const requiredWorkflow = readText('.github/workflows/rtk-required.yml');
  assert.match(requiredWorkflow, /npm run -s test:atlas-event-contract/u);
});

test('Stage10 repair: duplicate operation identity fails before recovery or command persistence side effects', async () => {
  const harness = await createHarness('duplicate-preflight');
  const projectId = 'stage10-duplicate-preflight';
  const bootstrap = await createProject(harness, projectId);
  const stage10 = await importModule('src/product/stage10ProductWiring.mjs');
  const opId = 'duplicate-history-operation';
  const first = await bootstrap.dispatchProjectCommand(
    stage10.STAGE10_PRODUCT_COMMAND_IDS.HISTORY_CREATE_CHECKPOINT,
    { projectId, opId, snapshotId: 'checkpoint-first' },
  );
  assert.equal(first.ok, true, JSON.stringify(first));
  const recoveryRoot = harness.adapter.paths(projectId).recoveryRoot;
  const recoveryBefore = fs.readdirSync(recoveryRoot).sort();
  const stateBefore = await harness.adapter.readStage10State(projectId);

  const duplicate = await bootstrap.dispatchProjectCommand(
    stage10.STAGE10_PRODUCT_COMMAND_IDS.HISTORY_CREATE_CHECKPOINT,
    { projectId, opId, snapshotId: 'checkpoint-must-not-exist' },
  );
  assert.equal(duplicate.ok, false, JSON.stringify(duplicate));
  assert.equal(duplicate.error.code, 'E_STAGE10_RECEIPT_ID_DUPLICATE');
  assert.deepEqual(fs.readdirSync(recoveryRoot).sort(), recoveryBefore);
  assert.equal(fs.existsSync(path.join(recoveryRoot, 'checkpoint-must-not-exist.json')), false);
  assert.deepEqual(await harness.adapter.readStage10State(projectId), stateBefore);

  const reopenedBootstrap = (await importModule('src/product/stage10ApplicationBootstrap.mjs'))
    .createStage10ApplicationBootstrap({ persistencePort: harness.makeAdapter() });
  const reopened = await reopenedBootstrap.reopenProjectRuntime({ projectId });
  assert.equal(reopened.ok, true);
  assert.equal(reopenedBootstrap.getRuntime().getReadModels().replay.ok, true);
});

test('Stage10 repair: receipt authority rejects duplicate receipt and operation identities on append and reopen validation', async () => {
  const authority = await importModule('src/product/stage10CommandReceiptAuthorityHead.mjs');
  const collab = await importModule('src/collab/index.mjs');
  const projectId = 'stage10-duplicate-authority';
  const eventLog = collab.createEmptyEventLog();
  const receipt = {
    schemaVersion: 'command-kernel.receipt.v1',
    receiptId: 'receipt-duplicate',
    operationId: 'operation-duplicate',
    commandId: 'project.applyTextEdit',
    status: 'APPLIED',
    appliedAt: '2026-08-02T00:00:00.000Z',
    actorId: 'local-author',
    sessionId: 'duplicate-session',
    preStateHash: 'a'.repeat(64),
    postStateHash: 'b'.repeat(64),
    capabilityRevalidated: true,
    activationMode: 'DOM_VISIBLE_CONTROL_LISTENER_FALLBACK',
    controlId: 'duplicate-control',
    visibleUiCommand: true,
    directBridge: false,
    storageWritten: true,
    domainEventDigest: '',
    domainEventCount: 0,
    details: {},
  };
  const initial = authority.createInitialCommandReceiptAuthorityStore({ projectId, eventLog });
  const once = authority.appendCommandReceiptAuthorityHead({ store: initial, projectId, eventLog, receipt });
  assert.throws(
    () => authority.appendCommandReceiptAuthorityHead({ store: once, projectId, eventLog, receipt }),
    (error) => error?.code === 'E_STAGE10_RECEIPT_ID_DUPLICATE',
  );

  const forged = cloneJson(once);
  forged.receipts.push(cloneJson(receipt));
  forged.compaction.retainedReceiptCount = 2;
  forged.currentHead.authorityGeneration = 2;
  forged.currentHead.receiptCount = 2;
  forged.currentHead.receiptRootDigest = authority.receiptRootDigest(forged.receipts);
  forged.currentHead.previousAuthorityHeadDigest = once.currentHead.authorityHeadDigest;
  forged.currentHead.authorityHeadDigest = authority.authorityHeadDigest(forged.currentHead);
  const validated = authority.validateCommandReceiptAuthorityStore(forged, { projectId, eventLog });
  assert.equal(validated.ok, false);
  assert.equal(validated.error.code, 'E_STAGE10_RECEIPT_ID_DUPLICATE');
});

test('Stage10 R1-C: persisted operation log is executable from payload envelope and rejects hash-only replay simulation', async () => {
  const harness = await createHarness('r1c-executable-ledger');
  const projectId = 'stage10-r1c-executable-ledger';
  const bootstrap = await createProject(harness, projectId);
  const stage10 = await importModule('src/product/stage10ProductWiring.mjs');
  const core = await importModule('src/core/runtime.mjs');

  const result = await bootstrap.dispatchProjectCommand(
    core.CORE_COMMAND_IDS.MANUAL_MAP_CREATE,
    { projectId, mapId: 'map-r1c', title: 'Executable ledger' },
    stage10Activation(core.CORE_COMMAND_IDS.MANUAL_MAP_CREATE),
  );
  assert.equal(result.ok, true);

  const persisted = await harness.adapter.readStage10State(projectId);
  const event = persisted.session.eventLog.events.find((entry) => entry.commandId === core.CORE_COMMAND_IDS.MANUAL_MAP_CREATE);
  assert.equal(event.operationEnvelope?.schemaVersion, 'yalken.commandKernel.operationEnvelope.v1');
  assert.equal(event.operationEnvelope.commandVersion, 1);
  assert.deepEqual(event.operationEnvelope.payload, {
    projectId,
    mapId: 'map-r1c',
    title: 'Executable ledger',
  });
  assert.match(event.operationEnvelopeDigest, /^[a-f0-9]{64}$/u);
  assert.equal(event.operationEnvelope.payloadHash, event.payloadHash);

  const corrupted = cloneJson(persisted);
  const targetEvent = corrupted.session.eventLog.events.find((entry) => entry.commandId === core.CORE_COMMAND_IDS.MANUAL_MAP_CREATE);
  targetEvent.operationEnvelope.payload.title = 'Forged title with matching old post hash';
  writeJson(harness.adapter.paths(projectId).session, corrupted.session);
  await assert.rejects(
    async () => {
      const bootstrapModule = await importModule('src/product/stage10ApplicationBootstrap.mjs');
      return bootstrapModule
        .createStage10ApplicationBootstrap({ persistencePort: harness.makeAdapter() })
        .reopenProjectRuntime({ projectId });
    },
    (error) => error?.reason === 'EXECUTABLE_OPERATION_ENVELOPE_DIGEST_MISMATCH'
      || error?.reason === 'EXECUTABLE_REPLAY_STATE_HASH_MISMATCH'
      || error?.reason === 'COMMAND_KERNEL_RECEIPT_AUTHORITY_EVENT_LOG_DIGEST_MISMATCH',
  );
});

test('Stage10 R1-C: collab apply persists every imported collaborator event and preflights duplicates before mutation', async () => {
  const harness = await createHarness('r1c-collab-events');
  const projectId = 'stage10-r1c-collab-events';
  const bootstrap = await createProject(harness, projectId);
  const stage10 = await importModule('src/product/stage10ProductWiring.mjs');
  const core = await importModule('src/core/runtime.mjs');

  const before = bootstrap.getRuntime().getSession();
  const firstEvent = remoteTextEditEvent(core, before, 'first remote text', '1');
  const first = await bootstrap.dispatchProjectCommand(
    stage10.STAGE10_PRODUCT_COMMAND_IDS.COLLAB_EVENT_LOG_APPLY,
    { projectId, events: [firstEvent] },
    stage10Activation(stage10.STAGE10_PRODUCT_COMMAND_IDS.COLLAB_EVENT_LOG_APPLY),
  );
  assert.equal(first.ok, true);

  const afterFirst = await harness.adapter.readStage10State(projectId);
  assert.equal(
    afterFirst.session.eventLog.events.some((entry) => entry.opId === firstEvent.opId && entry.eventId === firstEvent.eventId),
    true,
    'imported collaborator event must be durable, not hidden inside an aggregate apply entry',
  );

  const stateBeforeDuplicate = cloneJson(afterFirst);
  const duplicate = await bootstrap.dispatchProjectCommand(
    stage10.STAGE10_PRODUCT_COMMAND_IDS.COLLAB_EVENT_LOG_APPLY,
    { projectId, events: [firstEvent] },
    stage10Activation(stage10.STAGE10_PRODUCT_COMMAND_IDS.COLLAB_EVENT_LOG_APPLY),
  );
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.error.code, 'E_STAGE10_COLLAB_APPLY_DUPLICATE_EVENT_ID');
  assert.deepEqual(await harness.adapter.readStage10State(projectId), stateBeforeDuplicate);
});

test('Stage10 R1-C: restore is compensating provenance and does not replace immutable event history', async () => {
  const harness = await createHarness('r1c-restore-history');
  const projectId = 'stage10-r1c-restore-history';
  const bootstrap = await createProject(harness, projectId);
  const stage10 = await importModule('src/product/stage10ProductWiring.mjs');
  const core = await importModule('src/core/runtime.mjs');

  const checkpoint = await bootstrap.dispatchProjectCommand(
    stage10.STAGE10_PRODUCT_COMMAND_IDS.HISTORY_CREATE_CHECKPOINT,
    { projectId, snapshotId: 'checkpoint-r1c' },
    stage10Activation(stage10.STAGE10_PRODUCT_COMMAND_IDS.HISTORY_CREATE_CHECKPOINT),
  );
  assert.equal(checkpoint.ok, true);
  const edit = await bootstrap.dispatchProjectCommand(
    core.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
    { projectId, sceneId: 'scene-1', text: 'after checkpoint' },
    stage10Activation(core.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT),
  );
  assert.equal(edit.ok, true);
  const beforeRestore = bootstrap.getRuntime().getSession();

  const preview = await bootstrap.dispatchProjectCommand(
    stage10.STAGE10_PRODUCT_COMMAND_IDS.HISTORY_RESTORE_PREVIEW,
    { projectId, snapshotId: 'checkpoint-r1c' },
    stage10Activation(stage10.STAGE10_PRODUCT_COMMAND_IDS.HISTORY_RESTORE_PREVIEW),
  );
  assert.equal(preview.ok, true);
  const apply = await bootstrap.dispatchProjectCommand(
    stage10.STAGE10_PRODUCT_COMMAND_IDS.HISTORY_RESTORE_APPLY,
    { projectId, previewId: preview.preview.previewId, confirmed: true },
    stage10Activation(stage10.STAGE10_PRODUCT_COMMAND_IDS.HISTORY_RESTORE_APPLY),
  );
  assert.equal(apply.ok, true);

  const afterRestore = bootstrap.getRuntime().getSession();
  assert.equal(
    afterRestore.eventLog.events.some((event) => event.opId === edit.receipt.operationId),
    true,
    'restore must retain prior immutable edit provenance',
  );
  assert.equal(afterRestore.eventLog.events.at(-1).commandId, stage10.STAGE10_PRODUCT_COMMAND_IDS.HISTORY_RESTORE_APPLY);
  assert.equal(afterRestore.eventLog.events.length, beforeRestore.eventLog.events.length + 1);
});

test('Stage10 R1-C: canonical project truth link and requested author command commit once with no split authority advance', async () => {
  const harness = await createHarness('r1c-single-commit');
  const projectId = 'stage10-r1c-single-commit';
  const bootstrap = await createProject(harness, projectId);
  const core = await importModule('src/core/runtime.mjs');
  const before = cloneJson(await harness.adapter.readStage10State(projectId));
  const canonicalCoreState = cloneJson(before.session.coreState);
  canonicalCoreState.data.projects[projectId].scenes['scene-1'].text = 'canonical manifest text ahead of session';
  canonicalCoreState.data.lastCommandId += 1;
  const previousManifestText = JSON.stringify({
    projectId,
    manualMaps: { schemaVersion: 'manualMap.author.v1', maps: {} },
  });
  fs.writeFileSync(path.join(harness.projectRoot, 'project.craftsman.json'), previousManifestText, 'utf8');
  let prepareMutationCalls = 0;
  const result = await bootstrap.dispatchCanonicalProjectCommand(
    core.CORE_COMMAND_IDS.MANUAL_MAP_CREATE,
    { projectId, mapId: 'map-single', title: 'Single commit' },
    {
      schemaVersion: 'yalken.stage10.canonicalProjectTruthCommand.v1',
      projectId,
      coreState: canonicalCoreState,
      async prepareMutation(commandResult) {
        prepareMutationCalls += 1;
        const nextManifestText = JSON.stringify({
          projectId,
          manualMaps: commandResult.nextCoreState.data.projects[projectId].manualMaps,
        });
        return {
          schemaVersion: 'yalken.stage10.projectTruthMutation.v1',
          projectId,
          relativePath: 'project.craftsman.json',
          previousText: previousManifestText,
          nextText: nextManifestText,
          previousHash: sha256Text(previousManifestText),
          nextHash: sha256Text(nextManifestText),
        };
      },
    },
  );
  assert.equal(result.ok, true);
  assert.equal(prepareMutationCalls, 1);
  const after = await harness.adapter.readStage10State(projectId);
  assert.equal(after.authorityStore.currentHead.authorityGeneration, before.authorityStore.currentHead.authorityGeneration + 1);
  assert.equal(
    after.session.eventLog.events.some((event) => event.commandId === 'system.projectTruth.link'),
    false,
    'canonical truth linkage must be metadata on the requested command, not a separate durable command',
  );
});
