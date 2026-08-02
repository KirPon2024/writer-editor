const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function hashText(value) {
  return createHash('sha256').update(Buffer.from(value, 'utf8')).digest('hex');
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function importModule(relativePath) {
  return import(pathToFileURL(path.join(ROOT, relativePath)).href);
}

function manifestTextForState(state, projectId, extra = {}) {
  return `${JSON.stringify({
    schemaVersion: 1,
    projectId,
    ...extra,
    manualMaps: state.data.projects[projectId].manualMaps,
  }, null, 2)}\n`;
}

function projectTruthMutation(projectId, previousText, nextText, externalArtifactMutation = null) {
  return {
    schemaVersion: 'yalken.stage10.projectTruthMutation.v1',
    projectId,
    relativePath: 'project.craftsman.json',
    previousText,
    nextText,
    previousHash: hashText(previousText),
    nextHash: hashText(nextText),
    ...(externalArtifactMutation ? { externalArtifactMutation } : {}),
  };
}

function artifactMutation(targetPath, nextText, previousText = null) {
  return {
    schemaVersion: 'yalken.stage10.externalArtifactMutation.v1',
    targetPath,
    format: 'json',
    mediaType: 'application/json',
    nextText,
    nextHash: hashText(nextText),
    previousExists: previousText !== null,
    previousText: previousText === null ? '' : previousText,
    previousHash: previousText === null ? '' : hashText(previousText),
  };
}

async function createHarness(name, projectId, options = {}) {
  const adapterModule = await importModule('src/product/stage10MainPersistenceAdapter.mjs');
  const bootstrapModule = await importModule('src/product/stage10ApplicationBootstrap.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `yalken-atlas-v6-a4-${name}-`));
  const projectRoot = path.join(root, 'project');
  const anchorRoot = options.anchorRoot || path.join(root, 'main-owned-integrity');
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.mkdirSync(anchorRoot, { recursive: true });
  const makeAdapter = (adapterOptions = {}) => adapterModule.createStage10MainPersistenceAdapter({
    projectRoot,
    anchorRoot,
    ...adapterOptions,
  });
  const adapter = makeAdapter(options.adapterOptions || {});
  const bootstrap = bootstrapModule.createStage10ApplicationBootstrap({ persistencePort: adapter });
  await bootstrap.createProjectRuntime({ projectId, title: projectId });
  return { root, projectRoot, anchorRoot, projectId, adapter, makeAdapter, bootstrap };
}

function directoryDigest(root) {
  if (!fs.existsSync(root)) return hashText('ABSENT');
  const records = [];
  const visit = (current, relative = '') => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const entryRelative = relative ? `${relative}/${entry.name}` : entry.name;
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        records.push(`D:${entryRelative}`);
        visit(entryPath, entryRelative);
      } else {
        records.push(`F:${entryRelative}:${hashText(fs.readFileSync(entryPath))}`);
      }
    }
  };
  visit(root);
  return hashText(records.join('\n'));
}

function spawnModuleChild(source) {
  const child = spawn(process.execPath, ['--input-type=module', '-e', source], {
    cwd: ROOT,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  const waiters = new Set();
  const notify = () => waiters.forEach((waiter) => waiter());
  child.stdout.on('data', (chunk) => { stdout += String(chunk); notify(); });
  child.stderr.on('data', (chunk) => { stderr += String(chunk); notify(); });
  const completion = new Promise((resolve) => {
    child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
  return {
    child,
    completion,
    waitForOutput(fragment, timeoutMs = 10_000) {
      return new Promise((resolve, reject) => {
        let timer;
        const check = () => {
          if (stdout.includes(fragment)) {
            clearTimeout(timer);
            waiters.delete(check);
            resolve({ stdout, stderr });
          } else if (child.exitCode !== null) {
            clearTimeout(timer);
            waiters.delete(check);
            reject(new Error(`CHILD_EXITED_BEFORE_OUTPUT:${fragment}\n${stdout}\n${stderr}`));
          }
        };
        timer = setTimeout(() => {
          waiters.delete(check);
          child.kill('SIGKILL');
          reject(new Error(`CHILD_OUTPUT_TIMEOUT:${fragment}\n${stdout}\n${stderr}`));
        }, timeoutMs);
        waiters.add(check);
        check();
      });
    },
  };
}

test('Atlas V6 A4: Stage-10 project identity exactly shares the valid Unicode main domain without normalization', async () => {
  const identity = await importModule('src/product/stage10ProjectIdentityKey.mjs');
  const projectIdDomain = require(path.join(ROOT, 'src/product/projectIdDomain.cjs'));
  const anchorRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-atlas-v6-a4-unicode-anchors-'));
  const accepted = [
    'Проект-Достоевский',
    '项目-小说',
    '\u00e9',
    'e\u0301',
    'Emoji-🚀',
    '🚀'.repeat(64),
  ];
  const keys = new Set();
  for (let index = 0; index < accepted.length; index += 1) {
    const projectId = accepted[index];
    assert.equal(projectIdDomain.normalizeProjectId(projectId), projectId);
    const encoded = identity.stage10ProjectPathIdentity(projectId);
    assert.equal(encoded.ok, true);
    assert.equal(identity.decodeStage10ProjectPathKey(encoded.canonicalKey), projectId);
    assert.equal(encoded.canonicalKey.split('/').every((segment) => segment.length <= 96), true);
    keys.add(encoded.canonicalKey.toLowerCase());
    const harness = await createHarness(`unicode-${index}`, projectId, { anchorRoot });
    const reopened = await harness.makeAdapter().readStage10State(projectId);
    assert.equal(reopened.session.projectId, projectId);
  }
  assert.equal(keys.size, accepted.length);
  assert.notEqual(
    identity.stage10ProjectPathIdentity('\u00e9').canonicalKey,
    identity.stage10ProjectPathIdentity('e\u0301').canonicalKey,
  );
  assert.equal(identity.stage10ProjectPathIdentity('  项目-小说  ').projectId, '项目-小说');
  for (const rejected of ['a/b', 'a\\b', `a${String.fromCharCode(1)}b`, 'a'.repeat(129), '\ud800']) {
    assert.equal(projectIdDomain.normalizeProjectId(rejected), '');
    assert.equal(identity.stage10ProjectPathIdentity(rejected).ok, false);
  }
  assert.equal(identity.stage10ProjectPathIdentity('alpha:beta').canonicalKey, 'p2~/616c7068613a62657461/project');
});

test('Atlas V6 A4: foreign legacy aliases fail before canonical lineage mutation in both creation orders', async () => {
  const identity = await importModule('src/product/stage10ProjectIdentityKey.mjs');
  const firstAnchorRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-atlas-v6-a4-alias-first-'));
  const foreignFirst = await createHarness('alias-foreign-first', 'alpha:beta', { anchorRoot: firstAnchorRoot });
  const foreignPaths = foreignFirst.adapter.paths('alpha:beta');
  const foreignLegacyRoot = path.join(firstAnchorRoot, foreignPaths.legacyProjectKey);
  fs.renameSync(foreignPaths.anchorRoot, foreignLegacyRoot);
  const requestedIdentity = identity.stage10ProjectPathIdentity('alpha_beta');
  const requestedCanonicalRoot = path.join(firstAnchorRoot, requestedIdentity.canonicalKey);
  const beforeForeignFirst = directoryDigest(firstAnchorRoot);
  await assert.rejects(
    () => createHarness('alias-requested-second', 'alpha_beta', { anchorRoot: firstAnchorRoot }),
    (error) => error?.code === 'E_STAGE10_PROJECT_KEY_LEGACY_COLLISION',
  );
  assert.equal(directoryDigest(firstAnchorRoot), beforeForeignFirst);
  assert.equal(fs.existsSync(requestedCanonicalRoot), false);

  const secondAnchorRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-atlas-v6-a4-alias-second-'));
  const requestedFirst = await createHarness('alias-requested-first', 'alpha_beta', { anchorRoot: secondAnchorRoot });
  const foreignSecond = await createHarness('alias-foreign-second', 'alpha:beta', { anchorRoot: secondAnchorRoot });
  const foreignSecondPaths = foreignSecond.adapter.paths('alpha:beta');
  fs.renameSync(foreignSecondPaths.anchorRoot, path.join(secondAnchorRoot, foreignSecondPaths.legacyProjectKey));
  const beforeRequestedReopen = directoryDigest(secondAnchorRoot);
  await assert.rejects(
    () => requestedFirst.makeAdapter().readStage10State('alpha_beta'),
    (error) => error?.code === 'E_STAGE10_PROJECT_KEY_LEGACY_COLLISION',
  );
  assert.equal(directoryDigest(secondAnchorRoot), beforeRequestedReopen);

  const duplicateAnchorRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-atlas-v6-a4-alias-duplicate-'));
  const duplicate = await createHarness('alias-duplicate', 'legacy:project', { anchorRoot: duplicateAnchorRoot });
  const duplicatePaths = duplicate.adapter.paths('legacy:project');
  fs.cpSync(duplicatePaths.anchorRoot, path.join(duplicateAnchorRoot, duplicatePaths.legacyProjectKey), { recursive: true });
  const beforeDuplicate = directoryDigest(duplicateAnchorRoot);
  await assert.rejects(
    () => duplicate.makeAdapter().readStage10State('legacy:project'),
    (error) => error?.code === 'E_STAGE10_PROJECT_KEY_DUPLICATE_ROOT',
  );
  assert.equal(directoryDigest(duplicateAnchorRoot), beforeDuplicate);
});

test('Atlas V6 A4: a child main-manifest writer wins after stale preparation and Stage-10 returns typed CAS without dropping its field', async () => {
  const projectId = 'atlas-v6-a4-manifest-race';
  const harness = await createHarness('manifest-race', projectId);
  const core = await importModule('src/core/runtime.mjs');
  const manifestPath = path.join(harness.projectRoot, 'project.craftsman.json');
  const initialState = harness.bootstrap.getRuntime().getSession().coreState;
  const initialText = manifestTextForState(initialState, projectId, { authorField: 'original' });
  fs.writeFileSync(manifestPath, initialText, 'utf8');
  const concurrentText = manifestTextForState(initialState, projectId, {
    authorField: 'original',
    concurrentAuthorField: 'child-main-writer-survives',
  });
  const authorityUrl = pathToFileURL(path.join(ROOT, 'src/product/mainProjectManifestAuthority.mjs')).href;
  const childSource = `
    import { createMainProjectManifestAuthority } from ${JSON.stringify(authorityUrl)};
    const authority = createMainProjectManifestAuthority({ anchorRoot: ${JSON.stringify(harness.anchorRoot)} });
    const result = await authority.commitManifestText({
      projectId: ${JSON.stringify(projectId)},
      targetPath: ${JSON.stringify(manifestPath)},
      expectedText: ${JSON.stringify(initialText)},
      nextText: ${JSON.stringify(concurrentText)},
      label: 'a4-child-main-manifest-writer',
    });
    process.stdout.write(JSON.stringify(result));
  `;
  let childExecuted = false;
  await assert.rejects(
    () => harness.bootstrap.dispatchCanonicalProjectCommand(
      core.CORE_COMMAND_IDS.MANUAL_MAP_CREATE,
      { projectId, mapId: 'stale-map', title: 'Must not overwrite' },
      {
        schemaVersion: 'yalken.stage10.canonicalProjectTruthCommand.v1',
        projectId,
        coreState: initialState,
        sourceHash: hashText(initialText),
        sourceRevision: initialState.data.lastCommandId,
        async prepareMutation({ nextCoreState }) {
          const child = spawnSync(process.execPath, ['--input-type=module', '-e', childSource], {
            cwd: ROOT,
            encoding: 'utf8',
            env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
          });
          assert.equal(child.status, 0, child.stderr);
          childExecuted = true;
          return projectTruthMutation(
            projectId,
            initialText,
            manifestTextForState(nextCoreState, projectId, { authorField: 'original' }),
          );
        },
      },
    ),
    (error) => error?.code === 'E_STAGE10_PROJECT_TRUTH_STALE',
  );
  assert.equal(childExecuted, true);
  assert.equal(JSON.parse(fs.readFileSync(manifestPath, 'utf8')).concurrentAuthorField, 'child-main-writer-survives');
  assert.equal(fs.existsSync(harness.adapter.paths(projectId).transaction), false);

  const bootstrapModule = await importModule('src/product/stage10ApplicationBootstrap.mjs');
  const retryBootstrap = bootstrapModule.createStage10ApplicationBootstrap({ persistencePort: harness.makeAdapter() });
  await retryBootstrap.reopenProjectRuntime({ projectId });
  const currentText = fs.readFileSync(manifestPath, 'utf8');
  const retryState = retryBootstrap.getRuntime().getSession().coreState;
  const retried = await retryBootstrap.dispatchCanonicalProjectCommand(
    core.CORE_COMMAND_IDS.MANUAL_MAP_CREATE,
    { projectId, mapId: 'retry-map', title: 'CAS retry' },
    {
      schemaVersion: 'yalken.stage10.canonicalProjectTruthCommand.v1',
      projectId,
      coreState: retryState,
      sourceHash: hashText(currentText),
      sourceRevision: retryState.data.lastCommandId,
      prepareMutation({ nextCoreState }) {
        return projectTruthMutation(
          projectId,
          currentText,
          manifestTextForState(nextCoreState, projectId, {
            authorField: 'original',
            concurrentAuthorField: 'child-main-writer-survives',
          }),
        );
      },
    },
  );
  assert.equal(retried.ok, true);
  const finalManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(finalManifest.concurrentAuthorField, 'child-main-writer-survives');
  assert.equal(finalManifest.manualMaps.maps['retry-map'].title, 'CAS retry');
});

test('Atlas V6 A4: child changes to absent and existing artifact targets after preflight are preserved and recovered', async () => {
  const core = await importModule('src/core/runtime.mjs');
  const bootstrapModule = await importModule('src/product/stage10ApplicationBootstrap.mjs');
  for (const previousExists of [false, true]) {
    const projectId = `atlas-v6-a4-artifact-${previousExists ? 'existing' : 'absent'}`;
    const harness = await createHarness(`artifact-${previousExists ? 'existing' : 'absent'}`, projectId);
    const manifestPath = path.join(harness.projectRoot, 'project.craftsman.json');
    let manifestText = manifestTextForState(harness.bootstrap.getRuntime().getSession().coreState, projectId);
    fs.writeFileSync(manifestPath, manifestText, 'utf8');
    const madeMap = await harness.bootstrap.dispatchCanonicalProjectCommand(
      core.CORE_COMMAND_IDS.MANUAL_MAP_CREATE,
      { projectId, mapId: 'artifact-map', title: 'Artifact map' },
      {
        schemaVersion: 'yalken.stage10.canonicalProjectTruthCommand.v1',
        projectId,
        coreState: harness.bootstrap.getRuntime().getSession().coreState,
        sourceHash: hashText(manifestText),
        sourceRevision: 1,
        prepareMutation({ nextCoreState }) {
          return projectTruthMutation(projectId, manifestText, manifestTextForState(nextCoreState, projectId));
        },
      },
    );
    assert.equal(madeMap.ok, true);
    manifestText = fs.readFileSync(manifestPath, 'utf8');
    const targetPath = path.join(harness.root, previousExists ? 'existing.json' : 'absent.json');
    const previousText = previousExists ? '{"source":"OLD"}\n' : null;
    if (previousText !== null) fs.writeFileSync(targetPath, previousText, 'utf8');
    const childText = `{"source":"CHILD-${previousExists ? 'EXISTING' : 'ABSENT'}"}\n`;
    const nextText = '{"source":"EXPORT"}\n';
    let injected = false;
    const faultAdapter = harness.makeAdapter({
      onKillpoint(name) {
        if (!injected && name === 'after-transaction-write') {
          injected = true;
          const child = spawnSync(process.execPath, ['-e', `require('node:fs').writeFileSync(${JSON.stringify(targetPath)}, ${JSON.stringify(childText)}, 'utf8')`], {
            cwd: ROOT,
            encoding: 'utf8',
          });
          assert.equal(child.status, 0, child.stderr);
        }
      },
    });
    const faultBootstrap = bootstrapModule.createStage10ApplicationBootstrap({ persistencePort: faultAdapter });
    await faultBootstrap.reopenProjectRuntime({ projectId });
    const faultState = faultBootstrap.getRuntime().getSession().coreState;
    let conflict = null;
    try {
      const result = await faultBootstrap.dispatchCanonicalProjectCommand(
        core.CORE_COMMAND_IDS.MANUAL_MAP_EXPORT_JSON,
        {
          projectId,
          mapId: 'artifact-map',
          artifact: {
            schemaVersion: 'manualMap.localArtifactIntent.v1',
            format: 'json',
            sha256: hashText(nextText),
            byteLength: Buffer.byteLength(nextText, 'utf8'),
          },
        },
        {
          schemaVersion: 'yalken.stage10.canonicalProjectTruthCommand.v1',
          projectId,
          coreState: faultState,
          sourceHash: hashText(manifestText),
          sourceRevision: faultState.data.lastCommandId,
          prepareMutation({ nextCoreState }) {
            return projectTruthMutation(
              projectId,
              manifestText,
              manifestTextForState(nextCoreState, projectId),
              artifactMutation(targetPath, nextText, previousText),
            );
          },
        },
      );
      assert.equal(result.ok, false);
      conflict = result.error || result;
    } catch (error) {
      conflict = error;
    }
    assert.match(
      JSON.stringify(conflict),
      /E_STAGE10_EXTERNAL_ARTIFACT_CAS_FAILED|EXTERNAL_ARTIFACT_(?:REVISION_CONFLICT|UNEXPECTEDLY_EXISTS|CONCURRENT_CREATE)/u,
    );
    assert.equal(injected, true);
    assert.equal(fs.readFileSync(targetPath, 'utf8'), childText);
    const recoveryAdapter = harness.makeAdapter();
    const recovered = await recoveryAdapter.readStage10State(projectId);
    assert.equal(recovered.recoveryConsumed, true);
    assert.equal(fs.readFileSync(targetPath, 'utf8'), childText);
    assert.equal(fs.readFileSync(manifestPath, 'utf8'), manifestText);
    assert.equal(fs.existsSync(recoveryAdapter.paths(projectId).transaction), false);
    assert.equal(fs.readdirSync(harness.root).some((name) => name.includes('.stage10-cas.')), false);
  }
});

test('Atlas V6 A4: interrupted artifact reservation restores prior bytes and stale recovery leaves no reservation files', async () => {
  const core = await importModule('src/core/runtime.mjs');
  const bootstrapModule = await importModule('src/product/stage10ApplicationBootstrap.mjs');
  const projectId = 'atlas-v6-a4-artifact-reservation-crash';
  const harness = await createHarness('artifact-reservation-crash', projectId);
  const manifestPath = path.join(harness.projectRoot, 'project.craftsman.json');
  const manifestText = manifestTextForState(harness.bootstrap.getRuntime().getSession().coreState, projectId);
  fs.writeFileSync(manifestPath, manifestText, 'utf8');
  const targetPath = path.join(harness.root, 'reserved-existing.json');
  const previousText = '{"source":"PRIOR"}\n';
  fs.writeFileSync(targetPath, previousText, 'utf8');
  let armed = true;
  const faultAdapter = harness.makeAdapter({
    onKillpoint(name) {
      if (armed && name === 'after-external-artifact-reserve') {
        armed = false;
        throw new Error('A4_INTERRUPT_AFTER_ARTIFACT_RESERVE');
      }
    },
  });
  const faultBootstrap = bootstrapModule.createStage10ApplicationBootstrap({ persistencePort: faultAdapter });
  await faultBootstrap.reopenProjectRuntime({ projectId });
  const state = faultBootstrap.getRuntime().getSession().coreState;
  await assert.rejects(
    () => faultBootstrap.dispatchCanonicalProjectCommand(
      core.CORE_COMMAND_IDS.MANUAL_MAP_CREATE,
      { projectId, mapId: 'reservation-crash', title: 'Reservation crash' },
      {
        schemaVersion: 'yalken.stage10.canonicalProjectTruthCommand.v1',
        projectId,
        coreState: state,
        sourceHash: hashText(manifestText),
        sourceRevision: state.data.lastCommandId,
        prepareMutation({ nextCoreState }) {
          return projectTruthMutation(
            projectId,
            manifestText,
            manifestTextForState(nextCoreState, projectId),
            artifactMutation(targetPath, '{"source":"NEXT"}\n', previousText),
          );
        },
      },
    ),
    /A4_INTERRUPT_AFTER_ARTIFACT_RESERVE/u,
  );
  assert.equal(fs.existsSync(targetPath), false);
  assert.equal(fs.readdirSync(harness.root).some((name) => name.includes('.stage10-cas.')), true);
  const recoveryAdapter = harness.makeAdapter();
  const recovered = await recoveryAdapter.readStage10State(projectId);
  assert.equal(recovered.recoveryConsumed, true);
  assert.equal(fs.readFileSync(targetPath, 'utf8'), previousText);
  assert.equal(fs.readFileSync(manifestPath, 'utf8'), manifestText);
  assert.equal(fs.readdirSync(harness.root).some((name) => name.includes('.stage10-cas.')), false);
});

test('Atlas V6 A4: process-instance heartbeat defeats PID reuse, wall-clock jumps, blocked-loop expiry and crash staleness', { timeout: 25_000 }, async () => {
  const leaseModule = await importModule('src/product/projectLease.mjs');
  let wall = 10_000;
  let monotonic = 20_000;
  const pidReuseRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-atlas-v6-a4-pid-reuse-'));
  const first = leaseModule.createProjectLeaseManager({
    leaseRoot: pidReuseRoot,
    ttlMs: 1_000,
    nowMs: () => wall,
    nowMonotonicMs: () => monotonic,
    isProcessAlive: () => true,
  });
  const stale = await first.acquire('pid-reuse-project');
  wall += 1_001;
  monotonic += 1_001;
  const second = leaseModule.createProjectLeaseManager({
    leaseRoot: pidReuseRoot,
    ttlMs: 1_000,
    nowMs: () => wall,
    nowMonotonicMs: () => monotonic,
    isProcessAlive: () => true,
  });
  const current = await second.acquire('pid-reuse-project');
  assert.equal(current.recoveredExpiredLease, true);
  await assert.rejects(
    () => first.publish(stale, () => Promise.resolve()),
    (error) => error?.code === 'E_PROJECT_LEASE_OWNERSHIP_LOST',
  );
  await second.release(current);

  const clockRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-atlas-v6-a4-clock-edge-'));
  wall = 50_000;
  monotonic = 70_000;
  const clockHolder = leaseModule.createProjectLeaseManager({
    leaseRoot: clockRoot,
    ttlMs: 1_000,
    nowMs: () => wall,
    nowMonotonicMs: () => monotonic,
  });
  await clockHolder.acquire('clock-project');
  wall += 10_000_000;
  const clockContender = leaseModule.createProjectLeaseManager({
    leaseRoot: clockRoot,
    ttlMs: 1_000,
    nowMs: () => wall,
    nowMonotonicMs: () => monotonic,
  });
  await assert.rejects(
    () => clockContender.acquire('clock-project'),
    (error) => error?.code === 'E_PROJECT_LEASE_HELD' && error?.details?.ownerAlive === true,
  );
  wall -= 20_000_000;
  monotonic += 1_001;
  const afterClockEdge = await clockContender.acquire('clock-project');
  assert.equal(afterClockEdge.recoveredExpiredLease, true);
  await clockContender.release(afterClockEdge);

  const leaseUrl = pathToFileURL(path.join(ROOT, 'src/product/projectLease.mjs')).href;
  const blockedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-atlas-v6-a4-blocked-loop-'));
  const blockedSource = `
    import { createProjectLeaseManager } from ${JSON.stringify(leaseUrl)};
    const manager = createProjectLeaseManager({
      leaseRoot: ${JSON.stringify(blockedRoot)},
      ttlMs: 1000,
      useHeartbeatWorker: false,
    });
    await manager.withLease('blocked-project', async () => {
      process.stdout.write('BLOCKED_HELD\\n');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2600);
      process.stdout.write('BLOCKED_RELEASE\\n');
    });
  `;
  const blocked = spawnModuleChild(blockedSource);
  await blocked.waitForOutput('BLOCKED_HELD');
  await delay(1_300);
  const blockedContender = leaseModule.createProjectLeaseManager({ leaseRoot: blockedRoot, ttlMs: 1_000 });
  await assert.rejects(
    () => blockedContender.acquire('blocked-project'),
    (error) => error?.code === 'E_PROJECT_LEASE_HELD'
      && error?.details?.ownerAlive === true
      && error?.details?.processInstanceAlive === true,
  );
  const blockedResult = await blocked.completion;
  assert.equal(blockedResult.code, 0, blockedResult.stderr);

  const crashRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-atlas-v6-a4-process-crash-'));
  const crashSource = `
    import { createProjectLeaseManager } from ${JSON.stringify(leaseUrl)};
    const manager = createProjectLeaseManager({ leaseRoot: ${JSON.stringify(crashRoot)}, ttlMs: 1000 });
    await manager.withLease('crash-project', async () => {
      process.stdout.write('CRASH_HELD\\n');
      await new Promise(() => {});
    });
  `;
  const crashed = spawnModuleChild(crashSource);
  await crashed.waitForOutput('CRASH_HELD');
  crashed.child.kill('SIGKILL');
  await crashed.completion;
  await delay(1_250);
  const crashRecovery = leaseModule.createProjectLeaseManager({ leaseRoot: crashRoot, ttlMs: 1_000 });
  const recoveredLease = await crashRecovery.acquire('crash-project');
  assert.equal(recoveredLease.recoveredExpiredLease, true);
  await crashRecovery.release(recoveredLease);
});
