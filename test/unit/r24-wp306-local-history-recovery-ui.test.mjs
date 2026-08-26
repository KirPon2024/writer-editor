import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const MODULE_PATH = path.join(ROOT, 'src', 'renderer', 'historyRecoveryIdentity.mjs');

async function importModule(modulePath = MODULE_PATH, nonce = 'base') {
  return import(`${pathToFileURL(modulePath).href}?wp306=${nonce}-${Date.now()}-${Math.random()}`);
}

function stableIntent() {
  return {
    projectId: 'project-alpha',
    nodeId: 'scene-01',
    snapshotId: 'recovery-snapshot-1784419200000',
    sequence: 17,
  };
}

test('WP306 restore intent admits only the exact project, scene, snapshot and query generation', async () => {
  const module = await importModule();
  const intent = module.createSceneHistoryIntentBinding(stableIntent());
  assert.equal(Object.isFrozen(intent), true);
  assert.deepEqual(module.assessSceneHistoryIntentBinding(intent, stableIntent()), { ok: true, reason: '' });

  const drifts = [
    ['projectId', 'project-beta', 'HISTORY_INTENT_PROJECT_DRIFT'],
    ['nodeId', 'scene-02', 'HISTORY_INTENT_NODE_DRIFT'],
    ['snapshotId', 'recovery-snapshot-1784419200001', 'HISTORY_INTENT_SNAPSHOT_DRIFT'],
    ['sequence', 18, 'HISTORY_INTENT_GENERATION_DRIFT'],
  ];
  for (const [field, value, reason] of drifts) {
    const assessment = module.assessSceneHistoryIntentBinding(intent, {
      ...stableIntent(),
      [field]: value,
    });
    assert.deepEqual(assessment, { ok: false, reason });
  }
  assert.deepEqual(
    module.assessSceneHistoryIntentBinding({}, stableIntent()),
    { ok: false, reason: 'HISTORY_INTENT_BINDING_INVALID' },
  );
});

test('WP306 undo presentation is receipt-bound and never follows the author to another scene', async () => {
  const module = await importModule();
  const binding = module.createSceneHistoryRestoreReceiptBinding({
    receiptId: 'history-restore-01',
    projectId: 'project-alpha',
    nodeId: 'scene-01',
  });
  assert.equal(Object.isFrozen(binding), true);
  assert.equal(module.canPresentSceneHistoryUndo(binding, { projectId: 'project-alpha', nodeId: 'scene-01' }), true);
  assert.equal(module.canPresentSceneHistoryUndo(binding, { projectId: 'project-alpha', nodeId: 'scene-02' }), false);
  assert.equal(module.canPresentSceneHistoryUndo(binding, { projectId: 'project-beta', nodeId: 'scene-01' }), false);
  assert.equal(module.createSceneHistoryRestoreReceiptBinding({ receiptId: 'missing-identity' }), null);
  assert.equal(module.canPresentSceneHistoryUndo(null, { projectId: 'project-alpha', nodeId: 'scene-01' }), false);
});

test('WP306 renderer integrates the identity guard before apply and binds undo to the receipt target', () => {
  const editor = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'editor.js'), 'utf8');
  const moduleSource = fs.readFileSync(MODULE_PATH, 'utf8');
  const restoreSource = editor.slice(
    editor.indexOf('async function restoreSelectedSceneHistorySnapshot'),
    editor.indexOf('async function undoLastSceneHistoryRestore'),
  );

  assert.match(editor, /from '\.\/historyRecoveryIdentity\.mjs'/u);
  assert.match(restoreSource, /const afterPreview = assessCurrentIntent\(\)/u);
  assert.match(restoreSource, /const beforeApply = assessCurrentIntent\(\)/u);
  assert.ok(
    restoreSource.indexOf('const beforeApply = assessCurrentIntent()')
      < restoreSource.indexOf('EXTRA_COMMAND_IDS.HISTORY_RESTORE_APPLY'),
  );
  assert.match(editor, /canPresentSceneHistoryUndo\(sceneHistoryRestoreReceiptBinding, \{\s+projectId: currentProjectId,\s+nodeId: currentDocumentId,/u);

  for (const forbidden of ['localStorage', 'sessionStorage', 'node:fs', 'ipcRenderer', 'ipcMain', 'electronAPI', 'fetch(']) {
    assert.equal(moduleSource.includes(forbidden), false, `forbidden authority token: ${forbidden}`);
  }
});

test('WP306 implementation mutants are killed by independent identity oracles', async (t) => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-wp306-mutants-')));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

  const mutants = [
    {
      id: 'project-drift-admitted',
      find: 'if (expected.projectId !== actual.projectId) {',
      replace: 'if (false) {',
      oracle: (module) => assert.equal(module.assessSceneHistoryIntentBinding(stableIntent(), { ...stableIntent(), projectId: 'other' }).ok, false),
    },
    {
      id: 'node-drift-admitted',
      find: 'if (expected.nodeId !== actual.nodeId) {',
      replace: 'if (false) {',
      oracle: (module) => assert.equal(module.assessSceneHistoryIntentBinding(stableIntent(), { ...stableIntent(), nodeId: 'other' }).ok, false),
    },
    {
      id: 'snapshot-drift-admitted',
      find: 'if (expected.snapshotId !== actual.snapshotId) {',
      replace: 'if (false) {',
      oracle: (module) => assert.equal(module.assessSceneHistoryIntentBinding(stableIntent(), { ...stableIntent(), snapshotId: 'other' }).ok, false),
    },
    {
      id: 'generation-drift-admitted',
      find: 'if (expected.sequence !== actual.sequence) {',
      replace: 'if (false) {',
      oracle: (module) => assert.equal(module.assessSceneHistoryIntentBinding(stableIntent(), { ...stableIntent(), sequence: 18 }).ok, false),
    },
    {
      id: 'receipt-without-target-admitted',
      find: 'if (!binding.receiptId || !binding.projectId || !binding.nodeId) return null;',
      replace: 'if (false) return null;',
      oracle: (module) => assert.equal(module.createSceneHistoryRestoreReceiptBinding({ receiptId: 'receipt-only' }), null),
    },
    {
      id: 'cross-scene-undo-admitted',
      find: '&& binding.nodeId === normalizeIdentity(projection.nodeId);',
      replace: ';',
      oracle: (module) => {
        const binding = module.createSceneHistoryRestoreReceiptBinding({
          receiptId: 'receipt-01',
          projectId: 'project-alpha',
          nodeId: 'scene-01',
        });
        assert.equal(module.canPresentSceneHistoryUndo(binding, { projectId: 'project-alpha', nodeId: 'scene-02' }), false);
      },
    },
  ];

  let killed = 0;
  for (const mutant of mutants) {
    assert.equal(source.includes(mutant.find), true, `missing mutation target: ${mutant.id}`);
    const mutantPath = path.join(tempRoot, `${mutant.id}.mjs`);
    fs.writeFileSync(mutantPath, source.replace(mutant.find, mutant.replace), 'utf8');
    const module = await importModule(mutantPath, mutant.id);
    try {
      mutant.oracle(module);
    } catch {
      killed += 1;
    }
  }
  assert.equal(killed, mutants.length);
  console.log(`R24_WP306_IMPLEMENTATION_MUTANTS=${killed}/${mutants.length}`);
});
