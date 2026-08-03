const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function hashText(value) {
  return createHash('sha256').update(Buffer.from(value, 'utf8')).digest('hex');
}

async function importModule(relativePath) {
  return import(pathToFileURL(path.join(ROOT, relativePath)).href);
}

async function createHarness(name, options = {}) {
  const adapterModule = await importModule('src/product/stage10MainPersistenceAdapter.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `yalken-atlas-v6-${name}-`));
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
    now: options.now || (() => '2026-08-02T02:00:00.000Z'),
  });
  const created = await bootstrap.createProjectRuntime({ projectId, title: projectId });
  assert.equal(created.ok, true);
  return bootstrap;
}

function manifestTextForState(state, projectId) {
  return `${JSON.stringify({
    schemaVersion: 1,
    projectId,
    manualMaps: state.data.projects[projectId].manualMaps,
  }, null, 2)}\n`;
}

function projectTruthMutation(projectId, previousText, nextText, externalArtifactMutation = null) {
  const mutation = {
    schemaVersion: 'yalken.stage10.projectTruthMutation.v1',
    projectId,
    relativePath: 'project.craftsman.json',
    previousText,
    nextText,
    previousHash: hashText(previousText),
    nextHash: hashText(nextText),
  };
  if (externalArtifactMutation) mutation.externalArtifactMutation = externalArtifactMutation;
  return mutation;
}

function artifactMutation(targetPath, format, mediaType, nextText) {
  return {
    schemaVersion: 'yalken.stage10.externalArtifactMutation.v1',
    targetPath,
    format,
    mediaType,
    nextText,
    nextHash: hashText(nextText),
    previousExists: false,
    previousText: '',
    previousHash: '',
  };
}

test('Atlas V6 production negative: recovery is admitted before publication and rejects future, foreign, stale and immutable conflicts', async () => {
  const harness = await createHarness('recovery');
  const projectId = 'atlas-v6-recovery-project';
  const bootstrap = await createProject(harness, projectId);
  const recovery = await importModule('src/product/stage10RecoverySnapshot.mjs');
  const core = await importModule('src/core/runtime.mjs');
  const hashing = await importModule('src/core/browser-safe-hash.mjs');
  const bundle = await harness.adapter.readStage10State(projectId);
  const snapshot = recovery.createStage10RecoverySnapshot({
    snapshotId: 'checkpoint-valid',
    reason: 'positive control',
    createdAtUtc: '2026-08-02T02:01:00.000Z',
    session: bundle.session,
    authorityStore: bundle.authorityStore,
    integrityAnchor: bundle.integrityAnchor,
  });
  const written = await harness.adapter.writeRecoverySnapshot(projectId, snapshot.snapshotId, snapshot);
  assert.equal(written.ok, true);
  assert.deepEqual(await harness.adapter.readRecoverySnapshot(projectId, snapshot.snapshotId), snapshot);
  assert.equal(recovery.validateStage10RecoverySnapshot(snapshot, {
    projectId,
    lifecycleId: bundle.session.lifecycleId,
    requireCurrent: true,
  }).error.code, 'E_STAGE10_RECOVERY_CURRENT_BINDINGS_REQUIRED');

  const invalidKind = cloneJson(snapshot);
  invalidKind.snapshotKind = 'ROLLBACK';
  delete invalidKind.snapshotDigest;
  invalidKind.snapshotDigest = hashing.hashCanonicalValue(invalidKind);
  assert.equal(recovery.validateStage10RecoverySnapshot(invalidKind, {
    projectId,
    lifecycleId: bundle.session.lifecycleId,
  }).error.code, 'E_STAGE10_RECOVERY_IDENTITY_INVALID');

  const futureAuthorityRef = cloneJson(snapshot);
  futureAuthorityRef.session.commandReceiptAuthorityHeadRef.schemaVersion = 'yalken.stage10.commandReceiptAuthorityRef.v999';
  delete futureAuthorityRef.snapshotDigest;
  futureAuthorityRef.snapshotDigest = hashing.hashCanonicalValue(futureAuthorityRef);
  assert.equal(recovery.validateStage10RecoverySnapshot(futureAuthorityRef, {
    projectId,
    lifecycleId: bundle.session.lifecycleId,
  }).error.code, 'E_STAGE10_RECOVERY_AUTHORITY_BINDING_INVALID');

  assert.throws(
    () => recovery.createStage10RecoverySnapshot({
      snapshotId: 'invalid-time',
      reason: 'malformed timestamp negative',
      createdAtUtc: 'not-an-iso-time',
      session: bundle.session,
      authorityStore: bundle.authorityStore,
      integrityAnchor: bundle.integrityAnchor,
    }),
    (error) => error?.code === 'E_STAGE10_RECOVERY_IDENTITY_INVALID',
  );
  const staleAnchorAdmission = recovery.validateStage10RecoverySnapshot(snapshot, {
    projectId,
    lifecycleId: bundle.session.lifecycleId,
    requireCurrent: true,
    currentSession: bundle.session,
    currentAuthorityStore: bundle.authorityStore,
    currentIntegrityAnchor: {
      ...bundle.integrityAnchor,
      integrityAnchorDigest: 'f'.repeat(64),
    },
  });
  assert.equal(staleAnchorAdmission.ok, false);
  assert.equal(staleAnchorAdmission.error.code, 'E_STAGE10_RECOVERY_INTEGRITY_ANCHOR_STALE');

  const conflicting = recovery.createStage10RecoverySnapshot({
    snapshotId: snapshot.snapshotId,
    reason: 'different immutable content',
    createdAtUtc: '2026-08-02T02:01:01.000Z',
    session: bundle.session,
    authorityStore: bundle.authorityStore,
    integrityAnchor: bundle.integrityAnchor,
  });
  await assert.rejects(
    () => harness.adapter.writeRecoverySnapshot(projectId, snapshot.snapshotId, conflicting),
    (error) => error?.code === 'E_STAGE10_RECOVERY_IMMUTABLE_CONFLICT',
  );

  const future = { ...cloneJson(snapshot), schemaVersion: 'yalken.stage10.recoverySnapshot.v999', snapshotId: 'future' };
  await assert.rejects(
    () => harness.adapter.writeRecoverySnapshot(projectId, 'future', future),
    (error) => error?.code === 'E_STAGE10_RECOVERY_SCHEMA_UNSUPPORTED',
  );
  assert.equal(await harness.adapter.readRecoverySnapshot(projectId, 'future'), null);

  const foreign = { ...cloneJson(snapshot), projectId: 'foreign-project', snapshotId: 'foreign' };
  await assert.rejects(
    () => harness.adapter.writeRecoverySnapshot(projectId, 'foreign', foreign),
    (error) => error?.code === 'E_STAGE10_RECOVERY_PROJECT_MISMATCH',
  );
  assert.equal(await harness.adapter.readRecoverySnapshot(projectId, 'foreign'), null);

  const advanced = await bootstrap.dispatchProjectCommand(core.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT, {
    projectId,
    sceneId: 'scene-1',
    text: 'Revision after the recovery snapshot.',
  });
  assert.equal(advanced.ok, true);
  await assert.rejects(
    () => harness.adapter.writeRecoverySnapshot(projectId, snapshot.snapshotId, snapshot),
    (error) => error?.code === 'E_STAGE10_RECOVERY_STALE',
  );

  const tampered = cloneJson(snapshot);
  tampered.session.coreState.data.projects[projectId].scenes['scene-1'].text = 'Injected rollback text';
  assert.equal(recovery.validateStage10RecoverySnapshot(tampered, {
    projectId,
    lifecycleId: bundle.session.lifecycleId,
  }).ok, false);
});

test('Atlas V6 production negative: collaborator lifecycle admission precedes mutation and survives durable reopen replay', async () => {
  const harness = await createHarness('collaborator');
  const projectId = 'atlas-v6-collaborator-stage10';
  const bootstrap = await createProject(harness, projectId);
  const stage10 = await importModule('src/product/stage10ProductWiring.mjs');
  const collab = await importModule('src/collab/index.mjs');
  const core = await importModule('src/core/runtime.mjs');
  const session = bootstrap.getRuntime().getSession();
  const supported = {
    schemaVersion: collab.COLLABORATOR_EVENT_ENVELOPE_SCHEMA_VERSION,
    commandVersion: collab.COLLABORATOR_COMMAND_VERSION,
    projectId,
    lifecycleId: session.lifecycleId,
    eventId: 'stage10-peer-event-1',
    actorId: 'peer-author',
    sessionId: 'peer-session-1',
    ts: '2026-08-02T02:02:00.000Z',
    opId: 'stage10-peer-op-1',
    commandId: core.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
    payload: { projectId, sceneId: 'scene-1', text: 'Peer text admitted exactly.' },
    prevHash: core.hashCoreState(session.coreState),
    dependencies: ['peer-event-ancestor'],
    targets: [{
      targetKind: 'scene',
      targetId: 'scene-1',
      range: { from: 0, to: 4 },
      targetRevision: 'peer-scene-revision-8',
    }],
    causal: {
      correlationId: 'peer-correlation-1',
      causationId: 'peer-causation-1',
      vector: { peer: 8 },
    },
  };
  const accepted = await bootstrap.dispatchProjectCommand(
    stage10.STAGE10_PRODUCT_COMMAND_IDS.COLLAB_EVENT_LOG_APPLY,
    { projectId, events: [supported] },
  );
  assert.equal(accepted.ok, true, JSON.stringify(accepted.error || {}, null, 2));
  const persisted = await harness.adapter.readStage10State(projectId);
  const imported = persisted.session.eventLog.events.find((event) => event.eventId === supported.eventId);
  assert.ok(imported);
  assert.deepEqual(imported.operationEnvelope.collaboratorProvenance.dependencies, supported.dependencies);
  assert.deepEqual(imported.operationEnvelope.collaboratorProvenance.targets, supported.targets);
  assert.deepEqual(imported.operationEnvelope.collaboratorProvenance.causal, supported.causal);
  assert.equal(imported.operationEnvelope.collaboratorProvenance.sessionId, supported.sessionId);

  const beforeRejectedBatch = cloneJson(await harness.adapter.readStage10State(projectId));
  const currentSession = bootstrap.getRuntime().getSession();
  const nextValid = {
    ...supported,
    eventId: 'stage10-peer-event-2',
    opId: 'stage10-peer-op-2',
    prevHash: core.hashCoreState(currentSession.coreState),
    payload: { projectId, sceneId: 'scene-1', text: 'Must not partially apply.' },
  };
  const future = {
    ...nextValid,
    schemaVersion: 'yalken.collaborator.eventEnvelope.v999',
    eventId: 'stage10-peer-event-future',
    opId: 'stage10-peer-op-future',
  };
  const rejected = await bootstrap.dispatchProjectCommand(
    stage10.STAGE10_PRODUCT_COMMAND_IDS.COLLAB_EVENT_LOG_APPLY,
    { projectId, events: [nextValid, future] },
  );
  assert.equal(rejected.ok, false);
  assert.equal(rejected.report.appliedCount, 0);
  assert.deepEqual(await harness.adapter.readStage10State(projectId), beforeRejectedBatch);

  const bootstrapModule = await importModule('src/product/stage10ApplicationBootstrap.mjs');
  const fresh = bootstrapModule.createStage10ApplicationBootstrap({ persistencePort: harness.makeAdapter() });
  await fresh.reopenProjectRuntime({ projectId });
  assert.equal(fresh.getRuntime().getReadModels().replay.ok, true);
  assert.equal(fresh.getRuntime().getSession().coreState.data.projects[projectId].scenes['scene-1'].text, 'Peer text admitted exactly.');
});

test('Atlas V6 production negative: real JSON and SVG artifacts commit with canonical history and interrupted output is recovered', async () => {
  const harness = await createHarness('manual-map-artifacts');
  const projectId = 'atlas-v6-manual-map-artifacts';
  const bootstrap = await createProject(harness, projectId);
  const core = await importModule('src/core/runtime.mjs');
  const manifestPath = path.join(harness.projectRoot, 'project.craftsman.json');
  let manifestText = manifestTextForState(bootstrap.getRuntime().getSession().coreState, projectId);
  fs.writeFileSync(manifestPath, manifestText, 'utf8');

  const created = await bootstrap.dispatchCanonicalProjectCommand(
    core.CORE_COMMAND_IDS.MANUAL_MAP_CREATE,
    { projectId, mapId: 'map-real-artifact', title: 'Real artifact map' },
    {
      schemaVersion: 'yalken.stage10.canonicalProjectTruthCommand.v1',
      projectId,
      coreState: bootstrap.getRuntime().getSession().coreState,
      sourceHash: hashText(manifestText),
      sourceRevision: 1,
      prepareMutation({ nextCoreState }) {
        const nextText = manifestTextForState(nextCoreState, projectId);
        return projectTruthMutation(projectId, manifestText, nextText);
      },
    },
  );
  assert.equal(created.ok, true, JSON.stringify(created.error || {}, null, 2));
  manifestText = fs.readFileSync(manifestPath, 'utf8');

  async function exportArtifact(commandId, format, mediaType, outputPath, bytes) {
    const currentState = bootstrap.getRuntime().getSession().coreState;
    const result = await bootstrap.dispatchCanonicalProjectCommand(
      commandId,
      {
        projectId,
        mapId: 'map-real-artifact',
        artifact: {
          schemaVersion: 'manualMap.localArtifactIntent.v1',
          format,
          sha256: hashText(bytes),
          byteLength: Buffer.byteLength(bytes, 'utf8'),
        },
      },
      {
        schemaVersion: 'yalken.stage10.canonicalProjectTruthCommand.v1',
        projectId,
        coreState: currentState,
        sourceHash: hashText(manifestText),
        sourceRevision: currentState.data.lastCommandId,
        prepareMutation({ nextCoreState }) {
          const nextText = manifestTextForState(nextCoreState, projectId);
          return projectTruthMutation(
            projectId,
            manifestText,
            nextText,
            artifactMutation(outputPath, format, mediaType, bytes),
          );
        },
      },
    );
    assert.equal(result.ok, true, JSON.stringify(result.error || {}, null, 2));
    manifestText = fs.readFileSync(manifestPath, 'utf8');
    assert.equal(fs.readFileSync(outputPath, 'utf8'), bytes);
    return result;
  }

  const jsonPath = path.join(harness.root, 'manual-map.json');
  const jsonBytes = `${JSON.stringify({
    schemaVersion: 'manualMap.export.v1',
    projectId,
    mapId: 'map-real-artifact',
    nodes: [],
    edges: [],
  }, null, 2)}\n`;
  await exportArtifact(core.CORE_COMMAND_IDS.MANUAL_MAP_EXPORT_JSON, 'json', 'application/json', jsonPath, jsonBytes);
  assert.equal(JSON.parse(fs.readFileSync(jsonPath, 'utf8')).schemaVersion, 'manualMap.export.v1');

  const svgPath = path.join(harness.root, 'manual-map.svg');
  const svgBytes = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><title>Real artifact map</title></svg>\n';
  await exportArtifact(core.CORE_COMMAND_IDS.MANUAL_MAP_EXPORT_IMAGE_PDF, 'svg', 'image/svg+xml', svgPath, svgBytes);
  assert.match(fs.readFileSync(svgPath, 'utf8'), /^<svg/u);

  const persisted = await harness.adapter.readStage10State(projectId);
  const commandIds = persisted.session.eventLog.events.map((event) => event.commandId);
  assert.ok(commandIds.includes(core.CORE_COMMAND_IDS.MANUAL_MAP_CREATE));
  assert.ok(commandIds.includes(core.CORE_COMMAND_IDS.MANUAL_MAP_EXPORT_JSON));
  assert.ok(commandIds.includes(core.CORE_COMMAND_IDS.MANUAL_MAP_EXPORT_IMAGE_PDF));
  const bootstrapModule = await importModule('src/product/stage10ApplicationBootstrap.mjs');
  const fresh = bootstrapModule.createStage10ApplicationBootstrap({ persistencePort: harness.makeAdapter() });
  await fresh.reopenProjectRuntime({ projectId });
  assert.equal(fresh.getRuntime().getReadModels().replay.ok, true);

  const abortedPath = path.join(harness.root, 'manual-map-aborted.svg');
  let armed = true;
  const faultAdapter = harness.makeAdapter({
    onKillpoint(name) {
      if (armed && name === 'after-external-artifact-write') {
        armed = false;
        throw new Error('KILLPOINT_AFTER_EXTERNAL_ARTIFACT');
      }
    },
  });
  const faultBootstrap = bootstrapModule.createStage10ApplicationBootstrap({ persistencePort: faultAdapter });
  await faultBootstrap.reopenProjectRuntime({ projectId });
  const faultState = faultBootstrap.getRuntime().getSession().coreState;
  await assert.rejects(
    () => faultBootstrap.dispatchCanonicalProjectCommand(
      core.CORE_COMMAND_IDS.MANUAL_MAP_EXPORT_IMAGE_PDF,
      {
        projectId,
        mapId: 'map-real-artifact',
        artifact: {
          schemaVersion: 'manualMap.localArtifactIntent.v1',
          format: 'svg',
          sha256: hashText(svgBytes),
          byteLength: Buffer.byteLength(svgBytes, 'utf8'),
        },
      },
      {
        projectId,
        coreState: faultState,
        sourceHash: hashText(manifestText),
        sourceRevision: faultState.data.lastCommandId,
        prepareMutation({ nextCoreState }) {
          return projectTruthMutation(
            projectId,
            manifestText,
            manifestTextForState(nextCoreState, projectId),
            artifactMutation(abortedPath, 'svg', 'image/svg+xml', svgBytes),
          );
        },
      },
    ),
    /KILLPOINT_AFTER_EXTERNAL_ARTIFACT/u,
  );
  assert.equal(fs.readFileSync(abortedPath, 'utf8'), svgBytes);
  const recoveryAdapter = harness.makeAdapter();
  const recovered = await recoveryAdapter.readStage10State(projectId);
  assert.equal(recovered.recoveryConsumed, true);
  assert.equal(fs.existsSync(abortedPath), false);
  assert.equal(fs.readdirSync(harness.root).some((name) => name.startsWith('manual-map-aborted.svg.stage10-aborted.')), true);
  const reopenedAfterRecovery = bootstrapModule.createStage10ApplicationBootstrap({ persistencePort: recoveryAdapter });
  await reopenedAfterRecovery.reopenProjectRuntime({ projectId });
  assert.equal(reopenedAfterRecovery.getRuntime().getReadModels().replay.ok, true);
});

test('Atlas V6 production negative: restore and undo append compensating history without rewinding eventLog', async () => {
  const harness = await createHarness('append-only-history');
  const projectId = 'atlas-v6-append-only-history';
  const bootstrap = await createProject(harness, projectId);
  const stage10 = await importModule('src/product/stage10ProductWiring.mjs');
  const core = await importModule('src/core/runtime.mjs');
  const checkpoint = await bootstrap.dispatchProjectCommand(
    stage10.STAGE10_PRODUCT_COMMAND_IDS.HISTORY_CREATE_CHECKPOINT,
    { projectId, snapshotId: 'atlas-v6-checkpoint' },
  );
  assert.equal(checkpoint.ok, true);
  const edit = await bootstrap.dispatchProjectCommand(core.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT, {
    projectId,
    sceneId: 'scene-1',
    text: 'Text after checkpoint.',
  });
  assert.equal(edit.ok, true);
  const beforePreview = bootstrap.getRuntime().getSession();
  const preview = await bootstrap.dispatchProjectCommand(
    stage10.STAGE10_PRODUCT_COMMAND_IDS.HISTORY_RESTORE_PREVIEW,
    { projectId, snapshotId: 'atlas-v6-checkpoint' },
  );
  assert.equal(preview.ok, true);
  const beforeApply = bootstrap.getRuntime().getSession();
  const applied = await bootstrap.dispatchProjectCommand(
    stage10.STAGE10_PRODUCT_COMMAND_IDS.HISTORY_RESTORE_APPLY,
    { projectId, previewId: preview.preview.previewId, confirmed: true },
  );
  assert.equal(applied.ok, true);
  const afterApply = bootstrap.getRuntime().getSession();
  assert.equal(afterApply.eventLog.events.length, beforeApply.eventLog.events.length + 1);
  assert.equal(afterApply.eventLog.events.some((event) => event.opId === edit.receipt.operationId), true);
  assert.equal(afterApply.eventLog.events.at(-1).commandId, stage10.STAGE10_PRODUCT_COMMAND_IDS.HISTORY_RESTORE_APPLY);

  const undone = await bootstrap.dispatchProjectCommand(
    stage10.STAGE10_PRODUCT_COMMAND_IDS.HISTORY_RESTORE_UNDO,
    { projectId, previewId: preview.preview.previewId },
  );
  assert.equal(undone.ok, true);
  const afterUndo = bootstrap.getRuntime().getSession();
  assert.equal(afterUndo.eventLog.events.length, afterApply.eventLog.events.length + 1);
  assert.equal(afterUndo.eventLog.events.at(-1).commandId, stage10.STAGE10_PRODUCT_COMMAND_IDS.HISTORY_RESTORE_UNDO);
  assert.equal(afterUndo.coreState.data.projects[projectId].scenes['scene-1'].text, 'Text after checkpoint.');
  assert.ok(afterUndo.eventLog.events.length > beforePreview.eventLog.events.length);

  const bootstrapModule = await importModule('src/product/stage10ApplicationBootstrap.mjs');
  const fresh = bootstrapModule.createStage10ApplicationBootstrap({ persistencePort: harness.makeAdapter() });
  await fresh.reopenProjectRuntime({ projectId });
  assert.equal(fresh.getRuntime().getReadModels().replay.ok, true);
});

test('Atlas V6 production negative: main-owned lease is interprocess, expiry-bounded and revision plus authority CAS protected', async () => {
  const leaseModule = await importModule('src/product/projectLease.mjs');
  const persistenceModule = await importModule('src/product/stage10MainPersistenceAdapter.mjs');
  assert.throws(
    () => leaseModule.createProjectLeaseManager({ leaseRoot: '' }),
    (error) => error?.code === 'E_PROJECT_LEASE_ROOT_INVALID',
  );
  assert.throws(
    () => persistenceModule.createStage10MainPersistenceAdapter({ projectRoot: '', anchorRoot: '' }),
    (error) => error?.code === 'E_STAGE10_PERSISTENCE_ROOT_INVALID',
  );
  const leaseRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-atlas-v6-lease-process-'));
  const manager = leaseModule.createProjectLeaseManager({ leaseRoot, ttlMs: 60_000 });
  const held = await manager.acquire('lease-project');
  const moduleUrl = pathToFileURL(path.join(ROOT, 'src/product/projectLease.mjs')).href;
  const childSource = `
    import { createProjectLeaseManager } from ${JSON.stringify(moduleUrl)};
    const manager = createProjectLeaseManager({ leaseRoot: ${JSON.stringify(leaseRoot)}, ttlMs: 60000 });
    try {
      const lease = await manager.acquire('lease-project');
      await manager.release(lease);
      process.stdout.write('ACQUIRED');
    } catch (error) {
      process.stdout.write(String(error && error.code || 'UNKNOWN'));
      process.exitCode = error && error.code === 'E_PROJECT_LEASE_HELD' ? 0 : 2;
    }
  `;
  const contended = spawnSync(process.execPath, ['--input-type=module', '-e', childSource], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(contended.status, 0, contended.stderr);
  assert.equal(contended.stdout, 'E_PROJECT_LEASE_HELD');
  await manager.release(held);
  const acquired = spawnSync(process.execPath, ['--input-type=module', '-e', childSource], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(acquired.status, 0, acquired.stderr);
  assert.equal(acquired.stdout, 'ACQUIRED');

  let nowMs = 1_000;
  const expiryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-atlas-v6-lease-expiry-'));
  const first = leaseModule.createProjectLeaseManager({
    leaseRoot: expiryRoot,
    ttlMs: 1_000,
    nowMs: () => nowMs,
    isProcessAlive: () => false,
  });
  const second = leaseModule.createProjectLeaseManager({
    leaseRoot: expiryRoot,
    ttlMs: 1_000,
    nowMs: () => nowMs,
    isProcessAlive: () => false,
  });
  const expiring = await first.acquire('expiry-project');
  nowMs = 2_001;
  const recovered = await second.acquire('expiry-project');
  assert.equal(recovered.recoveredExpiredLease, true);
  assert.equal(await first.release(expiring), false);
  assert.equal(await second.release(recovered), true);

  const harness = await createHarness('lease-cas');
  const projectId = 'atlas-v6-cas-project';
  await createProject(harness, projectId);
  const bundle = await harness.adapter.readStage10State(projectId);
  const revision = bundle.session.eventLog.events.length;
  const digest = bundle.integrityAnchor.integrityAnchorDigest;
  const authorityHead = bundle.authorityStore.currentHead.authorityHeadDigest;
  await assert.rejects(
    () => harness.adapter.commitStage10State(projectId, bundle, {
      reason: 'stale revision negative',
      expectedPreviousIntegrityAnchorDigest: digest,
      expectedPreviousRevision: revision - 1,
      expectedPreviousAuthorityHeadDigest: authorityHead,
    }),
    (error) => error?.code === 'E_STAGE10_PERSISTENCE_REVISION_CAS_FAILED',
  );
  await assert.rejects(
    () => harness.adapter.commitStage10State(projectId, bundle, {
      reason: 'stale authority negative',
      expectedPreviousIntegrityAnchorDigest: digest,
      expectedPreviousRevision: revision,
      expectedPreviousAuthorityHeadDigest: 'foreign-authority-head',
    }),
    (error) => error?.code === 'E_STAGE10_PERSISTENCE_AUTHORITY_CAS_FAILED',
  );
});

test('Atlas V6 production negative: canonical recovery provenance is integrity-bound and cannot be substituted during replay', async () => {
  const harness = await createHarness('recovery-provenance');
  const projectId = 'atlas-v6-recovery-provenance';
  const bootstrap = await createProject(harness, projectId);
  const core = await importModule('src/core/runtime.mjs');
  const recovery = await importModule('src/product/stage10RecoverySnapshot.mjs');
  const manifestPath = path.join(harness.projectRoot, 'project.craftsman.json');
  const sessionState = bootstrap.getRuntime().getSession().coreState;
  const previousText = manifestTextForState(sessionState, projectId);
  fs.writeFileSync(manifestPath, previousText, 'utf8');
  const canonicalState = cloneJson(sessionState);
  canonicalState.data.projects[projectId].scenes['scene-1'].text = 'Canonical disk text ahead of session.';
  canonicalState.data.lastCommandId += 1;
  const result = await bootstrap.dispatchCanonicalProjectCommand(
    core.CORE_COMMAND_IDS.MANUAL_MAP_CREATE,
    { projectId, mapId: 'recovered-map', title: 'Recovered map' },
    {
      schemaVersion: 'yalken.stage10.canonicalProjectTruthCommand.v1',
      projectId,
      coreState: canonicalState,
      sourceHash: hashText(previousText),
      sourceRevision: 'manifest-revision-9',
      prepareMutation({ nextCoreState }) {
        return projectTruthMutation(projectId, previousText, manifestTextForState(nextCoreState, projectId));
      },
    },
  );
  assert.equal(result.ok, true, JSON.stringify(result.error || {}, null, 2));
  const persisted = await harness.adapter.readStage10State(projectId);
  const event = persisted.session.eventLog.events.at(-1);
  const provenance = event.operationEnvelope.recoveryProvenance;
  assert.equal(provenance.provenanceKind, 'CANONICAL_PROJECT_TRUTH_COMPENSATION');
  assert.match(provenance.provenanceDigest, /^[a-f0-9]{64}$/u);
  assert.equal(event.operationEnvelope.canonicalTruthLink, undefined);
  const tampered = cloneJson(provenance);
  tampered.coreState.data.projects[projectId].scenes['scene-1'].text = 'Injected state substitution.';
  assert.equal(recovery.validateStage10RecoveryProvenance(tampered, {
    projectId,
    lifecycleId: persisted.session.lifecycleId,
    currentRevision: provenance.currentRevision,
    authorityHeadDigest: provenance.authorityHeadDigest,
  }).ok, false);
  const foreignKind = cloneJson(provenance);
  foreignKind.provenanceKind = 'FOREIGN_STATE_INJECTION';
  delete foreignKind.provenanceDigest;
  const hashing = await importModule('src/core/browser-safe-hash.mjs');
  foreignKind.provenanceDigest = hashing.hashCanonicalValue(foreignKind);
  assert.equal(recovery.validateStage10RecoveryProvenance(foreignKind, {
    projectId,
    lifecycleId: persisted.session.lifecycleId,
    currentRevision: provenance.currentRevision,
    authorityHeadDigest: provenance.authorityHeadDigest,
  }).error.code, 'E_STAGE10_RECOVERY_PROVENANCE_INVALID');

  const bootstrapModule = await importModule('src/product/stage10ApplicationBootstrap.mjs');
  const fresh = bootstrapModule.createStage10ApplicationBootstrap({ persistencePort: harness.makeAdapter() });
  await fresh.reopenProjectRuntime({ projectId });
  assert.equal(fresh.getRuntime().getReadModels().replay.ok, true);
  assert.equal(fresh.getRuntime().getSession().coreState.data.projects[projectId].scenes['scene-1'].text, 'Canonical disk text ahead of session.');
});
