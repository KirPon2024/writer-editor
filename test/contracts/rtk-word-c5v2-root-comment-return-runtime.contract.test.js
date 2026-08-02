'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'reviewTransportNonTextReturnRuntime.mjs');

function makeInput(projectRoot, overrides = {}) {
  return {
    projectId: 'project-c5v2-n1',
    projectRoot,
    operationId: 'root-comment-op-1',
    sceneId: 'scene-01',
    sceneText: 'A unique physical anchor lives in this chapter.',
    selectedText: 'unique physical anchor',
    threadId: 'thread-01',
    commentId: 'comment-01',
    body: 'Return this root comment to canonical project truth.',
    anchor: { sceneId: 'scene-01' },
    ...overrides,
  };
}

test('N1 root comment applies through typed handler, atomic recovery, reopen readback and replay', async () => {
  const module = await import(MODULE_PATH);
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-c5v2-n1-'));
  const handler = module.createRtkRootCommentReturnCommandHandler();
  const applied = await handler(makeInput(projectRoot));
  assert.equal(applied.ok, true);
  assert.equal(applied.status, 'applied');
  assert.equal(applied.writerCalled, true);
  assert.equal(fs.existsSync(path.join(projectRoot, '.yalken', 'recovery', 'non-text-return-state.v1.json')), true);
  const canonicalPath = path.join(projectRoot, '.yalken', 'word-review', 'non-text-return-state.v1.json');
  const reopened = JSON.parse(fs.readFileSync(canonicalPath, 'utf8'));
  assert.equal(reopened.threads[0].messages[0].body, 'Return this root comment to canonical project truth.');
  assert.equal(reopened.events[0].kind, 'root_comment_added');

  const replay = await handler(makeInput(projectRoot));
  assert.equal(replay.ok, true);
  assert.equal(replay.status, 'replay');
  assert.equal(replay.writerCalled, false);
  assert.equal(JSON.parse(fs.readFileSync(canonicalPath, 'utf8')).events.length, 1);
});

test('N1 root comment decisive negatives fail closed before canonical write', async () => {
  const module = await import(MODULE_PATH);
  for (const [name, overrides, code] of [
    ['wrong-scene', { anchor: { sceneId: 'scene-99' } }, 'RTK_ROOT_COMMENT_WRONG_SCENE'],
    ['ambiguous-anchor', { sceneText: 'same anchor and same anchor', selectedText: 'same anchor' }, 'RTK_ROOT_COMMENT_ANCHOR_NOT_UNIQUE'],
    ['missing-body', { body: '' }, 'RTK_ROOT_COMMENT_BODY_INVALID'],
  ]) {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), `yalken-c5v2-n1-${name}-`));
    const result = await module.createRtkRootCommentReturnCommandHandler()(makeInput(projectRoot, overrides));
    assert.equal(result.ok, false);
    assert.equal(result.code, code);
    assert.equal(result.writerCalled, false);
    assert.equal(fs.existsSync(path.join(projectRoot, '.yalken', 'word-review', 'non-text-return-state.v1.json')), false);
  }
});

test('N1 root comment replay payload mutation is blocked deterministically', async () => {
  const module = await import(MODULE_PATH);
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-c5v2-n1-replay-'));
  const handler = module.createRtkRootCommentReturnCommandHandler();
  assert.equal((await handler(makeInput(projectRoot))).status, 'applied');
  const blocked = await handler(makeInput(projectRoot, { body: 'mutated replay body' }));
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'RTK_ROOT_COMMENT_REPLAY_PAYLOAD_MISMATCH');
});

test('N1 root comment command is registered in the production command surface kernel', () => {
  const main = fs.readFileSync(path.join(REPO_ROOT, 'src', 'main.js'), 'utf8');
  assert.match(main, /RTK_REVIEW_APPLY_ROOT_COMMENT_RETURN:\s*'cmd\.rtk\.review\.applyRootCommentReturn'/u);
  assert.match(main, /\[COMMAND_SURFACE_KERNEL_COMMAND_IDS\.RTK_REVIEW_APPLY_ROOT_COMMENT_RETURN\]: async/u);
  assert.match(main, /createRtkRootCommentReturnCommandHandler\(\)\(payload\)/u);
});
