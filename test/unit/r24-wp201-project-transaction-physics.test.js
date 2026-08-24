'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { durableSaveTransaction } = require('../../src/core/save-coordinator-v1.cjs');
const {
  commitPathFor,
  journalPathFor,
  recoverProjectTransaction,
} = require('../../src/core/project-transaction-v1.cjs');

const CHILD_SOURCE = String.raw`
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { commitProjectTransaction, commitPathFor, journalPathFor } = require(process.argv[2]);
const scenePath = process.argv[3];
const manifestPath = process.argv[4];
const killAt = process.argv[5];
const adapter = {
  ...fsp,
  rename: async (source, target) => {
    if (killAt === 'BEFORE_COMMIT_POINT' && target === commitPathFor(scenePath)) process.kill(process.pid, 'SIGKILL');
    return fsp.rename(source, target);
  },
  unlink: async (target) => {
    if (killAt === 'AFTER_COMMIT_POINT' && target === journalPathFor(manifestPath)) process.kill(process.pid, 'SIGKILL');
    return fsp.unlink(target);
  },
};
commitProjectTransaction({
  scenePath,
  sceneContent: 'new scene',
  expectedSceneContent: 'old scene',
  manifestPath,
  manifestContent: '{"revision":2}',
  expectedManifestContent: '{"revision":1}',
  revision: 2,
  fsAdapter: adapter,
  publishManifest: async ({ expectedText, nextText }) => {
    if (fs.readFileSync(manifestPath, 'utf8') !== expectedText) throw new Error('CAS');
    fs.writeFileSync(manifestPath, nextText);
    if (killAt === 'AFTER_MANIFEST') process.kill(process.pid, 'SIGKILL');
  },
}).then(() => process.exit(0)).catch(() => process.exit(2));
`;

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-wp201-physics-'));
  const scenePath = path.join(root, 'scenes', 'scene.txt');
  const manifestPath = path.join(root, 'project.json');
  fs.mkdirSync(path.dirname(scenePath), { recursive: true });
  fs.writeFileSync(scenePath, 'old scene');
  fs.writeFileSync(manifestPath, '{"revision":1}');
  return { root, scenePath, manifestPath };
}

function runCrash({ scenePath, manifestPath, killAt }) {
  return new Promise((resolve) => {
    const childPath = path.join(os.tmpdir(), `r24-wp201-child-${process.pid}-${Math.random().toString(36).slice(2)}.cjs`);
    fs.writeFileSync(childPath, CHILD_SOURCE);
    const modulePath = path.join(__dirname, '..', '..', 'src', 'core', 'project-transaction-v1.cjs');
    const child = spawn(process.execPath, [childPath, modulePath, scenePath, manifestPath, killAt], { stdio: 'pipe' });
    child.on('exit', (code, signal) => {
      fs.rmSync(childPath, { force: true });
      resolve({ code, signal });
    });
  });
}

function publisher() {
  return async ({ manifestPath, expectedText, nextText, revision }) => {
    assert.equal(fs.readFileSync(manifestPath, 'utf8'), expectedText);
    await durableSaveTransaction({ filePath: manifestPath, content: nextText, revision });
  };
}

for (const killAt of ['AFTER_MANIFEST', 'BEFORE_COMMIT_POINT']) {
  test(`WP201 SIGKILL ${killAt} rolls the uncommitted pair back to all-old`, async () => {
    const { scenePath, manifestPath } = sandbox();
    const crash = await runCrash({ scenePath, manifestPath, killAt });
    assert.equal(crash.signal, 'SIGKILL');
    assert.equal(fs.existsSync(journalPathFor(manifestPath)), true);
    assert.equal(fs.existsSync(commitPathFor(scenePath)), false);
    const recovery = await recoverProjectTransaction({ scenePath, manifestPath, publishManifest: publisher() });
    assert.equal(recovery.outcome, 'UNCOMMITTED_ROLLED_BACK');
    assert.equal(fs.readFileSync(scenePath, 'utf8'), 'old scene');
    assert.equal(fs.readFileSync(manifestPath, 'utf8'), '{"revision":1}');
    assert.equal(fs.existsSync(journalPathFor(manifestPath)), false);
  });
}

test('WP201 SIGKILL after commit point converges the pair to all-new', async () => {
  const { scenePath, manifestPath } = sandbox();
  const crash = await runCrash({ scenePath, manifestPath, killAt: 'AFTER_COMMIT_POINT' });
  assert.equal(crash.signal, 'SIGKILL');
  assert.equal(fs.existsSync(journalPathFor(manifestPath)), true);
  assert.equal(fs.existsSync(commitPathFor(scenePath)), true);
  const recovery = await recoverProjectTransaction({ scenePath, manifestPath, publishManifest: publisher() });
  assert.equal(recovery.outcome, 'COMMITTED_CONVERGED');
  assert.equal(fs.readFileSync(scenePath, 'utf8'), 'new scene');
  assert.equal(fs.readFileSync(manifestPath, 'utf8'), '{"revision":2}');
  assert.equal(fs.existsSync(journalPathFor(manifestPath)), false);
});

test('WP201 recovery fails typed instead of overwriting divergent third-party bytes', async () => {
  const { scenePath, manifestPath } = sandbox();
  const crash = await runCrash({ scenePath, manifestPath, killAt: 'AFTER_MANIFEST' });
  assert.equal(crash.signal, 'SIGKILL');
  fs.writeFileSync(scenePath, 'unrelated third-party bytes');
  await assert.rejects(
    recoverProjectTransaction({ scenePath, manifestPath, publishManifest: publisher() }),
    (error) => error.code === 'E_PROJECT_TRANSACTION_RECOVERY_DIVERGENCE',
  );
  assert.equal(fs.readFileSync(scenePath, 'utf8'), 'unrelated third-party bytes');
  assert.equal(fs.existsSync(journalPathFor(manifestPath)), true);
});
