'use strict';

// R2.4 P3 crash/physics: real SIGKILL between manifest persist and scene
// publish, and after the marker — proving no partial ACK and deterministic
// recovery classification at every kill point.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const {
  classifyProjectCommitState,
  markerPathFor,
} = require('../../src/core/project-commit-v1.cjs');

const CHILD_SOURCE = `
const fs = require('node:fs');
const { commitProjectTextAndManifest } = require(process.argv[2]);
const [,, modulePath, scenePath, killAt] = process.argv;
const fsp = require('node:fs/promises');
const wrap = {
  ...fsp,
  rename: async (a, b) => {
    if (killAt === 'BEFORE_SCENE_RENAME') process.kill(process.pid, 'SIGKILL');
    return fsp.rename(a, b);
  },
};
commitProjectTextAndManifest({
  scenePath: scenePath,
  sceneContent: 'pair-payload',
  revision: 1,
  persistManifest: async () => {
    fs.writeFileSync(scenePath + '.manifest-side', 'persisted');
    if (killAt === 'AFTER_MANIFEST') process.kill(process.pid, 'SIGKILL');
    return { persisted: true, manifest: { v: 1 } };
  },
  fsAdapter: wrap,
}).then((result) => {
  fs.writeFileSync(scenePath + '.acked', JSON.stringify(result.phases));
  process.exit(0);
}).catch(() => process.exit(2));
`;

function runCrashChild({ scenePath, killAt }) {
  return new Promise((resolve) => {
    const childPath = path.join(os.tmpdir(), `r24-p3-crash-${process.pid}-${Math.random().toString(36).slice(2, 8)}.cjs`);
    fs.writeFileSync(childPath, CHILD_SOURCE);
    const modulePath = path.join(__dirname, '..', '..', 'src', 'core', 'project-commit-v1.cjs');
    const child = spawn(process.execPath, [childPath, modulePath, scenePath, killAt || 'NEVER'], { stdio: 'pipe' });
    child.on('exit', (code, signal) => {
      fs.rmSync(childPath, { force: true });
      resolve({ code, signal });
    });
  });
}

test('SIGKILL after manifest persist but before scene publish: no partial ACK, resumable state', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-p3-crash-'));
  const scene = path.join(dir, 'scene.txt');
  const outcome = await runCrashChild({ scenePath: scene, killAt: 'BEFORE_SCENE_RENAME' });
  assert.equal(outcome.signal, 'SIGKILL');
  assert.equal(fs.existsSync(`${scene}.acked`), false, 'no ACK artifact may exist after a crash');
  assert.equal(fs.existsSync(`${scene}.manifest-side`), true, 'manifest side effect landed');
  assert.equal(fs.existsSync(markerPathFor(scene)), false, 'no commit marker');
  assert.equal(classifyProjectCommitState(scene).classification, 'RESUMABLE_PREPARED');
});

test('SIGKILL right after manifest persist: no scene write, resumable or old state, never ACK', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-p3-crash-'));
  const scene = path.join(dir, 'scene.txt');
  const outcome = await runCrashChild({ scenePath: scene, killAt: 'AFTER_MANIFEST' });
  assert.equal(outcome.signal, 'SIGKILL');
  assert.equal(fs.existsSync(`${scene}.acked`), false);
  assert.equal(fs.existsSync(markerPathFor(scene)), false);
  const cls = classifyProjectCommitState(scene).classification;
  assert.ok(['RESUMABLE_PREPARED', 'ROLLBACK_REQUIRED', 'OLD_COMMITTED'].includes(cls), `total classification vocabulary, got ${cls}`);
});

test('an unkilled pair transaction completes with marker and ACK', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-p3-crash-'));
  const scene = path.join(dir, 'scene.txt');
  const outcome = await runCrashChild({ scenePath: scene, killAt: 'NEVER' });
  assert.equal(outcome.code, 0);
  assert.equal(fs.readFileSync(scene, 'utf8'), 'pair-payload');
  const marker = JSON.parse(fs.readFileSync(markerPathFor(scene), 'utf8'));
  assert.equal(marker.revision, 1);
  assert.equal(classifyProjectCommitState(scene).classification, 'NEW_COMMITTED');
});
