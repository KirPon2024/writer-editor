const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function hashText(value) {
  return createHash('sha256').update(Buffer.from(value, 'utf8')).digest('hex');
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function importModule(relativePath) {
  return import(pathToFileURL(path.join(ROOT, relativePath)).href);
}

async function makeProjectHarness(name, projectId, anchorRoot, adapterOptions = {}) {
  const adapterModule = await importModule('src/product/stage10MainPersistenceAdapter.mjs');
  const bootstrapModule = await importModule('src/product/stage10ApplicationBootstrap.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `yalken-atlas-v6-a3-${name}-`));
  const projectRoot = path.join(root, 'project');
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.mkdirSync(anchorRoot, { recursive: true });
  const makeAdapter = (options = {}) => adapterModule.createStage10MainPersistenceAdapter({
    projectRoot,
    anchorRoot,
    ...adapterOptions,
    ...options,
  });
  const adapter = makeAdapter();
  const bootstrap = bootstrapModule.createStage10ApplicationBootstrap({
    persistencePort: adapter,
    now: () => '2026-08-02T09:00:00.000Z',
  });
  const created = await bootstrap.createProjectRuntime({ projectId, title: projectId });
  assert.equal(created.ok, true);
  return { root, projectRoot, anchorRoot, projectId, adapter, makeAdapter, bootstrap };
}

function manifestTextForState(state, projectId) {
  return `${JSON.stringify({
    schemaVersion: 1,
    projectId,
    manualMaps: state.data.projects[projectId].manualMaps,
  }, null, 2)}\n`;
}

function projectTruthMutation(projectId, previousText, nextText) {
  return {
    schemaVersion: 'yalken.stage10.projectTruthMutation.v1',
    projectId,
    relativePath: 'project.craftsman.json',
    previousText,
    nextText,
    previousHash: hashText(previousText),
    nextHash: hashText(nextText),
  };
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
  const notify = () => {
    for (const waiter of waiters) waiter();
  };
  child.stdout.on('data', (chunk) => {
    stdout += String(chunk);
    notify();
  });
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
    notify();
  });
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
          child.kill('SIGTERM');
          reject(new Error(`CHILD_OUTPUT_TIMEOUT:${fragment}\n${stdout}\n${stderr}`));
        }, timeoutMs);
        waiters.add(check);
        check();
      });
    },
  };
}

test('Atlas V6 A3: accepted project IDs have reversible injective domain-separated keys and invalid IDs mutate nothing', async () => {
  const identityModule = await importModule('src/product/stage10ProjectIdentityKey.mjs');
  const adapterModule = await importModule('src/product/stage10MainPersistenceAdapter.mjs');
  const bootstrapModule = await importModule('src/product/stage10ApplicationBootstrap.mjs');
  const colon = identityModule.stage10ProjectPathIdentity('alpha:beta');
  const underscore = identityModule.stage10ProjectPathIdentity('alpha_beta');
  assert.equal(colon.ok, true);
  assert.equal(underscore.ok, true);
  assert.notEqual(colon.canonicalKey, underscore.canonicalKey);
  assert.equal(identityModule.decodeStage10ProjectPathKey(colon.canonicalKey), 'alpha:beta');
  assert.equal(identityModule.decodeStage10ProjectPathKey(underscore.canonicalKey), 'alpha_beta');
  assert.equal(colon.canonicalKey.startsWith(identityModule.STAGE10_PROJECT_PATH_KEY_PREFIX), true);
  const caseVariants = ['A', 'a'].map(identityModule.stage10ProjectPathIdentity);
  assert.notEqual(caseVariants[0].canonicalKey.toLowerCase(), caseVariants[1].canonicalKey.toLowerCase());
  const prefixVariants = ['a'.repeat(48), `${'a'.repeat(48)}b`].map(identityModule.stage10ProjectPathIdentity);
  assert.notEqual(prefixVariants[0].canonicalKey, prefixVariants[1].canonicalKey);
  assert.equal(prefixVariants.every((identity) => identity.canonicalKey.endsWith('/project')), true);
  const longest = identityModule.stage10ProjectPathIdentity('A'.repeat(128));
  assert.equal(longest.ok, true);
  assert.equal(identityModule.decodeStage10ProjectPathKey(longest.canonicalKey), 'A'.repeat(128));
  assert.equal(longest.canonicalKey.split('/').every((segment) => segment.length <= 96), true);
  assert.equal(identityModule.stage10ProjectPathIdentity('A'.repeat(129)).ok, false);
  assert.equal(identityModule.stage10ProjectPathIdentity(' alpha:beta').projectId, 'alpha:beta');
  assert.equal(identityModule.stage10ProjectPathIdentity('alpha/beta').ok, false);
  assert.equal(identityModule.stage10ProjectPathIdentity('../alpha').ok, false);

  const invalidRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-atlas-v6-a3-invalid-id-'));
  const projectRoot = path.join(invalidRoot, 'project');
  const anchorRoot = path.join(invalidRoot, 'anchors');
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.mkdirSync(anchorRoot, { recursive: true });
  const adapter = adapterModule.createStage10MainPersistenceAdapter({ projectRoot, anchorRoot });
  const bootstrap = bootstrapModule.createStage10ApplicationBootstrap({ persistencePort: adapter });
  await assert.rejects(
    () => bootstrap.createProjectRuntime({ projectId: 'alpha/beta', title: 'invalid' }),
    (error) => error?.code === 'E_STAGE10_PERSISTENCE_PROJECT_ID_INVALID',
  );
  assert.equal(fs.existsSync(path.join(projectRoot, '.stage10-local')), false);
  assert.deepEqual(fs.readdirSync(anchorRoot), []);
});

test('Atlas V6 A3: legacy key migration is atomic, identity-bound and collision-aware for the reproduced alias pair', async () => {
  const sharedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-atlas-v6-a3-alias-'));
  const anchorRoot = path.join(sharedRoot, 'main-owned-integrity');
  const colonProject = await makeProjectHarness('colon', 'alpha:beta', anchorRoot);
  const colonPaths = colonProject.adapter.paths('alpha:beta');
  const colonLegacyRoot = path.join(anchorRoot, colonPaths.legacyProjectKey);
  fs.renameSync(colonPaths.anchorRoot, colonLegacyRoot);
  assert.equal(fs.existsSync(colonPaths.anchorRoot), false);
  assert.equal(fs.existsSync(colonLegacyRoot), true);

  const identityModule = await importModule('src/product/stage10ProjectIdentityKey.mjs');
  const underscoreIdentity = identityModule.stage10ProjectPathIdentity('alpha_beta');
  const underscoreAnchorRoot = path.join(anchorRoot, underscoreIdentity.canonicalKey);
  await assert.rejects(
    () => makeProjectHarness('underscore-collision', 'alpha_beta', anchorRoot),
    (error) => error?.code === 'E_STAGE10_PROJECT_KEY_LEGACY_COLLISION',
  );
  assert.equal(fs.existsSync(underscoreAnchorRoot), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(colonLegacyRoot, 'integrity-anchor.v1.json'), 'utf8')).projectId, 'alpha:beta');

  const migratedColon = await colonProject.makeAdapter().readStage10State('alpha:beta');
  assert.equal(migratedColon.session.projectId, 'alpha:beta');
  assert.equal(fs.existsSync(colonPaths.anchorRoot), true);
  assert.equal(fs.existsSync(colonLegacyRoot), false);
  const underscoreProject = await makeProjectHarness('underscore', 'alpha_beta', anchorRoot);
  const underscorePaths = underscoreProject.adapter.paths('alpha_beta');
  assert.notEqual(colonPaths.anchorRoot, underscorePaths.anchorRoot);
  assert.equal(fs.existsSync(underscorePaths.anchor), true);
  const reopenedUnderscore = await underscoreProject.makeAdapter().readStage10State('alpha_beta');
  assert.equal(reopenedUnderscore.session.projectId, 'alpha_beta');
  assert.notEqual(
    migratedColon.integrityAnchor.integrityAnchorDigest,
    reopenedUnderscore.integrityAnchor.integrityAnchorDigest,
  );
});

test('Atlas V6 A3: a two-process slow truth publication exceeds TTL without reclaim and crash recovery converges', { timeout: 20_000 }, async () => {
  const anchorRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-atlas-v6-a3-slow-anchor-'));
  const projectId = 'atlas-v6-a3-slow-project';
  const harness = await makeProjectHarness('slow-holder', projectId, anchorRoot);
  const manifestPath = path.join(harness.projectRoot, 'project.craftsman.json');
  const initialManifest = manifestTextForState(harness.bootstrap.getRuntime().getSession().coreState, projectId);
  fs.writeFileSync(manifestPath, initialManifest, 'utf8');

  const adapterUrl = pathToFileURL(path.join(ROOT, 'src/product/stage10MainPersistenceAdapter.mjs')).href;
  const bootstrapUrl = pathToFileURL(path.join(ROOT, 'src/product/stage10ApplicationBootstrap.mjs')).href;
  const coreUrl = pathToFileURL(path.join(ROOT, 'src/core/runtime.mjs')).href;
  const childSource = `
    import fs from 'node:fs/promises';
    import path from 'node:path';
    import { createHash } from 'node:crypto';
    import { createStage10MainPersistenceAdapter } from ${JSON.stringify(adapterUrl)};
    import { createStage10ApplicationBootstrap } from ${JSON.stringify(bootstrapUrl)};
    import { CORE_COMMAND_IDS } from ${JSON.stringify(coreUrl)};
    const projectId = ${JSON.stringify(projectId)};
    const projectRoot = ${JSON.stringify(harness.projectRoot)};
    const anchorRoot = ${JSON.stringify(anchorRoot)};
    const digest = (value) => createHash('sha256').update(Buffer.from(value, 'utf8')).digest('hex');
    const manifestTextForState = (state) => JSON.stringify({
      schemaVersion: 1,
      projectId,
      manualMaps: state.data.projects[projectId].manualMaps,
    }, null, 2) + '\\n';
    let delayed = false;
    const writeFileAtomic = async (targetPath, content) => {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      const temporaryPath = targetPath + '.' + process.pid + '.' + Date.now() + '.tmp';
      await fs.writeFile(temporaryPath, content, 'utf8');
      if (!delayed && path.basename(targetPath) === 'project.craftsman.json') {
        delayed = true;
        process.stdout.write('SLOW_WRITE_STARTED\\n');
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);
      }
      await fs.rename(temporaryPath, targetPath);
      if (delayed && path.basename(targetPath) === 'project.craftsman.json') {
        process.stdout.write('SLOW_RENAME_COMPLETE\\n');
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
      return { success: true };
    };
    const adapter = createStage10MainPersistenceAdapter({
      projectRoot,
      anchorRoot,
      leaseTtlMs: 1000,
      writeFileAtomic,
    });
    const bootstrap = createStage10ApplicationBootstrap({ persistencePort: adapter });
    await bootstrap.reopenProjectRuntime({ projectId });
    const state = bootstrap.getRuntime().getSession().coreState;
    const previousText = await fs.readFile(path.join(projectRoot, 'project.craftsman.json'), 'utf8');
    const result = await bootstrap.dispatchCanonicalProjectCommand(
      CORE_COMMAND_IDS.MANUAL_MAP_CREATE,
      { projectId, mapId: 'slow-map', title: 'Slow map' },
      {
        schemaVersion: 'yalken.stage10.canonicalProjectTruthCommand.v1',
        projectId,
        coreState: state,
        sourceHash: digest(previousText),
        sourceRevision: state.data.lastCommandId,
        prepareMutation({ nextCoreState }) {
          const nextText = manifestTextForState(nextCoreState);
          return {
            schemaVersion: 'yalken.stage10.projectTruthMutation.v1',
            projectId,
            relativePath: 'project.craftsman.json',
            previousText,
            nextText,
            previousHash: digest(previousText),
            nextHash: digest(nextText),
          };
        },
      },
    );
    process.stdout.write('RESULT:' + JSON.stringify({ ok: result.ok }) + '\\n');
  `;
  const holder = spawnModuleChild(childSource);
  await holder.waitForOutput('SLOW_WRITE_STARTED');
  await delay(1_200);
  const contender = harness.makeAdapter({ leaseTtlMs: 1_000 });
  let heldError = null;
  await assert.rejects(
    () => contender.readStage10State(projectId),
    (error) => {
      heldError = error;
      return error?.code === 'E_PROJECT_LEASE_HELD'
        && error?.details?.ownerAlive === true;
    },
  );
  assert.ok(Number(heldError.details.expiresAtMs) > Date.now());
  assert.ok(Number(heldError.details.monotonicExpiresAtMs) > 0);
  await holder.waitForOutput('SLOW_RENAME_COMPLETE');
  await assert.rejects(
    () => contender.readStage10State(projectId),
    (error) => error?.code === 'E_PROJECT_LEASE_HELD',
  );
  const childResult = await holder.completion;
  assert.equal(childResult.code, 0, childResult.stderr);
  assert.match(childResult.stdout, /RESULT:\{"ok":true\}/u);

  const afterSlow = await harness.makeAdapter().readStage10State(projectId);
  assert.ok(afterSlow.session.coreState.data.projects[projectId].manualMaps.maps['slow-map']);
  assert.equal(JSON.parse(fs.readFileSync(manifestPath, 'utf8')).manualMaps.maps['slow-map'].title, 'Slow map');

  const bootstrapModule = await importModule('src/product/stage10ApplicationBootstrap.mjs');
  const core = await importModule('src/core/runtime.mjs');
  let armed = true;
  const crashingAdapter = harness.makeAdapter({
    leaseTtlMs: 1_000,
    onKillpoint(name) {
      if (armed && name === 'after-project-truth-write') {
        armed = false;
        throw new Error('A3_CRASH_AFTER_PROJECT_TRUTH');
      }
    },
  });
  const crashingBootstrap = bootstrapModule.createStage10ApplicationBootstrap({ persistencePort: crashingAdapter });
  await crashingBootstrap.reopenProjectRuntime({ projectId });
  const beforeCrashState = crashingBootstrap.getRuntime().getSession().coreState;
  const beforeCrashText = fs.readFileSync(manifestPath, 'utf8');
  await assert.rejects(
    () => crashingBootstrap.dispatchCanonicalProjectCommand(
      core.CORE_COMMAND_IDS.MANUAL_MAP_CREATE,
      { projectId, mapId: 'must-roll-back', title: 'Must roll back' },
      {
        schemaVersion: 'yalken.stage10.canonicalProjectTruthCommand.v1',
        projectId,
        coreState: beforeCrashState,
        sourceHash: hashText(beforeCrashText),
        sourceRevision: beforeCrashState.data.lastCommandId,
        prepareMutation({ nextCoreState }) {
          return projectTruthMutation(
            projectId,
            beforeCrashText,
            manifestTextForState(nextCoreState, projectId),
          );
        },
      },
    ),
    /A3_CRASH_AFTER_PROJECT_TRUTH/u,
  );
  const transactionPath = crashingAdapter.paths(projectId).transaction;
  const pending = JSON.parse(fs.readFileSync(transactionPath, 'utf8'));
  assert.equal(pending.schemaVersion, 'yalken.stage10.mainPersistenceTransaction.v5');
  assert.ok(Number.isSafeInteger(pending.fencingGeneration));
  assert.match(pending.leaseOwnerTokenDigest, /^[a-f0-9]{64}$/u);
  assert.match(pending.fencingBindingDigest, /^[a-f0-9]{64}$/u);

  const recoveryAdapter = harness.makeAdapter({ leaseTtlMs: 1_000 });
  const recovered = await recoveryAdapter.readStage10State(projectId);
  assert.equal(recovered.recoveryConsumed, true);
  const recoveredFence = JSON.parse(fs.readFileSync(
    path.join(recoveryAdapter.paths(projectId).anchorRoot, 'fencing-generation.v1.json'),
    'utf8',
  ));
  assert.ok(recoveredFence.fencingGeneration > pending.fencingGeneration);
  assert.equal(fs.existsSync(transactionPath), false);
  assert.equal(fs.readFileSync(manifestPath, 'utf8'), beforeCrashText);
  assert.ok(recovered.session.coreState.data.projects[projectId].manualMaps.maps['slow-map']);
  assert.equal(recovered.session.coreState.data.projects[projectId].manualMaps.maps['must-roll-back'], undefined);
  const reopened = bootstrapModule.createStage10ApplicationBootstrap({ persistencePort: recoveryAdapter });
  await reopened.reopenProjectRuntime({ projectId });
  assert.equal(reopened.getRuntime().getReadModels().replay.ok, true);
});

test('Atlas V6 A3: monotonic fencing rejects every later publication and finalization from a genuinely stale holder', async () => {
  const leaseModule = await importModule('src/product/projectLease.mjs');
  const leaseRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-atlas-v6-a3-stale-fence-'));
  let nowMs = 10_000;
  const options = {
    leaseRoot,
    ttlMs: 1_000,
    nowMs: () => nowMs,
    isProcessAlive: () => false,
  };
  const firstManager = leaseModule.createProjectLeaseManager(options);
  const secondManager = leaseModule.createProjectLeaseManager(options);
  const stale = await firstManager.acquire('fenced-project');
  nowMs = 11_001;
  const current = await secondManager.acquire('fenced-project');
  assert.equal(current.recoveredExpiredLease, true);
  assert.equal(current.fencingGeneration, stale.fencingGeneration + 1);

  let stalePublicationCount = 0;
  await assert.rejects(
    () => firstManager.publish(stale, async () => {
      stalePublicationCount += 1;
    }),
    (error) => error?.code === 'E_PROJECT_LEASE_OWNERSHIP_LOST',
  );
  assert.equal(stalePublicationCount, 0);
  await assert.rejects(
    () => firstManager.renew(stale),
    (error) => error?.code === 'E_PROJECT_LEASE_OWNERSHIP_LOST',
  );
  assert.equal(await firstManager.release(stale), false);

  let currentPublicationCount = 0;
  await secondManager.publish(current, async (proof) => {
    assert.equal(proof.fencingGeneration, current.fencingGeneration);
    assert.equal(proof.ownerTokenDigest, current.ownerTokenDigest);
    currentPublicationCount += 1;
  });
  assert.equal(currentPublicationCount, 1);
  assert.equal(await secondManager.release(current), true);

  const malformedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-atlas-v6-a3-malformed-fence-'));
  const malformedManager = leaseModule.createProjectLeaseManager({ leaseRoot: malformedRoot });
  const malformedPaths = malformedManager.paths('malformed-fence-project');
  fs.mkdirSync(malformedPaths.root, { recursive: true });
  fs.writeFileSync(malformedPaths.fence, '{"schemaVersion":"future"}\n', 'utf8');
  await assert.rejects(
    () => malformedManager.acquire('malformed-fence-project'),
    (error) => error?.code === 'E_PROJECT_LEASE_FENCE_INVALID',
  );
  assert.equal(fs.existsSync(malformedPaths.leaseDirectory), false);
});
