'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'reviewTransportNonTextReturnRuntime.mjs');
const CANARY_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-physical-canary.mjs');

function rootInput(projectRoot) {
  return {
    projectId: 'project-c5v2-n2', projectRoot, operationId: 'root-op', sceneId: 'scene-01',
    sceneText: 'The unique comment anchor remains available.', selectedText: 'unique comment anchor',
    threadId: 'thread-01', commentId: 'root-01', body: 'Root comment.', anchor: { sceneId: 'scene-01' },
  };
}

function lifecycleInput(projectRoot, operationId, action, overrides = {}) {
  return {
    projectId: 'project-c5v2-n2', projectRoot, operationId, sceneId: 'scene-01', threadId: 'thread-01',
    action, replyId: action === 'reply' ? `reply-${operationId}` : '', replyBody: action === 'reply' ? `Reply ${operationId}` : '',
    ...overrides,
  };
}

async function seededRuntime() {
  const module = await import(MODULE_PATH);
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-c5v2-n2-'));
  assert.equal((await module.createRtkRootCommentReturnCommandHandler()(rootInput(projectRoot))).status, 'applied');
  return { module, projectRoot, handler: module.createRtkCommentLifecycleReturnCommandHandler() };
}

test('N2 reply, resolve, reopen, delete and status readback apply canonically and replay deterministically', async () => {
  const { projectRoot, handler } = await seededRuntime();
  for (const [operationId, action, expectedStatus] of [
    ['reply-op', 'reply', 'open'],
    ['resolve-op', 'resolve', 'resolved'],
    ['reopen-op', 'reopen', 'open'],
    ['delete-op', 'delete', 'deleted'],
  ]) {
    const input = lifecycleInput(projectRoot, operationId, action);
    const applied = await handler(input);
    assert.equal(applied.ok, true);
    assert.equal(applied.status, 'applied');
    assert.equal(applied.threadStatus, expectedStatus);
    assert.equal(applied.writerCalled, true);
    const replay = await handler(input);
    assert.equal(replay.status, 'replay');
    assert.equal(replay.threadStatus, expectedStatus);
    assert.equal(replay.writerCalled, false);
  }
  const canonical = JSON.parse(fs.readFileSync(path.join(projectRoot, '.yalken', 'word-review', 'non-text-return-state.v1.json'), 'utf8'));
  assert.equal(canonical.threads[0].status, 'deleted');
  assert.equal(canonical.threads[0].messages[1].kind, 'reply');
  assert.deepEqual(canonical.events.map((event) => event.kind), [
    'root_comment_added', 'comment_reply_added', 'comment_resolved', 'comment_reopened', 'comment_deleted',
  ]);
  assert.equal(fs.existsSync(path.join(projectRoot, '.yalken', 'recovery', 'non-text-return-state.v1.json')), true);
});

test('N2 compound resolve-reopen preserves explicit lifecycle history and open status', async () => {
  const { projectRoot, handler } = await seededRuntime();
  const result = await handler(lifecycleInput(projectRoot, 'resolve-reopen-op', 'resolve-reopen'));
  assert.equal(result.ok, true);
  assert.equal(result.threadStatus, 'open');
  const canonical = JSON.parse(fs.readFileSync(path.join(projectRoot, '.yalken', 'word-review', 'non-text-return-state.v1.json'), 'utf8'));
  assert.deepEqual(canonical.events.at(-1).transitions, ['open', 'resolved', 'open']);
});

test('N2 decisive lifecycle negatives are typed and never silently mutate canonical truth', async () => {
  const { projectRoot, handler } = await seededRuntime();
  const canonicalPath = path.join(projectRoot, '.yalken', 'word-review', 'non-text-return-state.v1.json');
  for (const [input, code] of [
    [lifecycleInput(projectRoot, 'missing-thread', 'reply', { threadId: 'absent' }), 'RTK_COMMENT_LIFECYCLE_THREAD_NOT_FOUND'],
    [lifecycleInput(projectRoot, 'wrong-scene', 'reply', { sceneId: 'scene-99' }), 'RTK_COMMENT_LIFECYCLE_WRONG_SCENE'],
    [lifecycleInput(projectRoot, 'bad-reopen', 'reopen'), 'RTK_COMMENT_REOPEN_INVALID_TRANSITION'],
    [lifecycleInput(projectRoot, 'unknown-action', 'archive'), 'RTK_COMMENT_LIFECYCLE_ACTION_UNSUPPORTED'],
  ]) {
    const before = fs.readFileSync(canonicalPath, 'utf8');
    const result = await handler(input);
    assert.equal(result.ok, false);
    assert.equal(result.code, code);
    assert.equal(result.writerCalled, false);
    assert.equal(fs.readFileSync(canonicalPath, 'utf8'), before);
  }
  const reply = lifecycleInput(projectRoot, 'reply-stable', 'reply');
  assert.equal((await handler(reply)).status, 'applied');
  const conflict = await handler({ ...reply, replyBody: 'conflicting replay body' });
  assert.equal(conflict.code, 'RTK_COMMENT_LIFECYCLE_REPLAY_PAYLOAD_MISMATCH');
});

test('N2 comment lifecycle command is registered in the production Command Kernel', () => {
  const main = fs.readFileSync(path.join(REPO_ROOT, 'src', 'main.js'), 'utf8');
  const { ALLOWED_COMMAND_IDS } = require(path.join(REPO_ROOT, 'src', 'command', 'commandSurfaceKernel.js'));
  assert.match(main, /RTK_REVIEW_APPLY_COMMENT_LIFECYCLE_RETURN:\s*'cmd\.rtk\.review\.applyCommentLifecycleReturn'/u);
  assert.match(main, /\[COMMAND_SURFACE_KERNEL_COMMAND_IDS\.RTK_REVIEW_APPLY_COMMENT_LIFECYCLE_RETURN\]: async/u);
  assert.match(main, /createRtkCommentLifecycleReturnCommandHandler\(\)\(payload\)/u);
  assert.equal(ALLOWED_COMMAND_IDS.includes('cmd.rtk.review.applyRootCommentReturn'), true);
  assert.equal(ALLOWED_COMMAND_IDS.includes('cmd.rtk.review.applyCommentLifecycleReturn'), true);
});

test('N2 command kernel rejects an omitted lifecycle command instead of bypassing admission', async () => {
  const { createCommandSurfaceKernel } = require(path.join(REPO_ROOT, 'src', 'command', 'commandSurfaceKernel.js'));
  const kernel = createCommandSurfaceKernel({
    'cmd.rtk.review.unlistedLifecycleMutation': async () => ({ ok: true }),
  });
  const result = await kernel.dispatch('cmd.rtk.review.unlistedLifecycleMutation', {});
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'E_COMMAND_ID_NOT_ALLOWED');
});

test('N2 admitted root and lifecycle commands execute through the shipped command kernel', async () => {
  const module = await import(MODULE_PATH);
  const { createCommandSurfaceKernel } = require(path.join(REPO_ROOT, 'src', 'command', 'commandSurfaceKernel.js'));
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-c5v2-n2-kernel-admission-'));
  const kernel = createCommandSurfaceKernel({
    'cmd.rtk.review.applyRootCommentReturn': module.createRtkRootCommentReturnCommandHandler(),
    'cmd.rtk.review.applyCommentLifecycleReturn': module.createRtkCommentLifecycleReturnCommandHandler(),
  });
  const root = await kernel.dispatch('cmd.rtk.review.applyRootCommentReturn', rootInput(projectRoot));
  assert.equal(root.status, 'applied');
  const reply = await kernel.dispatch(
    'cmd.rtk.review.applyCommentLifecycleReturn',
    lifecycleInput(projectRoot, 'kernel-reply', 'reply'),
  );
  assert.equal(reply.status, 'applied');
  assert.equal(Boolean(reply.recovery), true);
  const replay = await kernel.dispatch(
    'cmd.rtk.review.applyCommentLifecycleReturn',
    lifecycleInput(projectRoot, 'kernel-reply', 'reply'),
  );
  assert.equal(replay.status, 'replay');
});

test('N2 authenticated Word return lowers root, reply and resolved state into shipped typed commands', async () => {
  const module = await import(MODULE_PATH);
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-c5v2-n2-plan-'));
  const scenePath = path.join(projectRoot, 'scene-01.txt');
  const sceneText = 'The physical Word anchor is unique in this scene.';
  fs.writeFileSync(scenePath, sceneText);
  const plan = module.buildAuthenticatedCommentReturnCommands({
    authenticated: true,
    projectId: 'project-c5v2-n2',
    projectRoot,
    returnArtifactId: 'sha256:physical-return',
    localAuthorityCapsule: {
      projectId: 'project-c5v2-n2', projectRoot,
      scenePathBySceneId: { 'scene-01': scenePath },
      baselineFinalTextBySceneId: { 'scene-01': sceneText },
    },
    reviewIr: {
      commentThreads: [{
        threadId: 'word-thread-01', status: 'resolved',
        messages: [
          { messageId: 'word-root-01', body: 'Root from physical Word.' },
          { messageId: 'word-reply-01', body: 'Reply from physical Word.' },
        ],
      }],
      commentPlacements: [{
        threadId: 'word-thread-01', targetScope: { type: 'scene', id: 'scene-01' }, quote: 'physical Word anchor',
      }],
    },
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.commandBusRequired, true);
  assert.equal(plan.directPortDispatchForbidden, true);
  assert.deepEqual(plan.commands.map((command) => command.family), ['root_comment', 'reply', 'comment_state']);
  assert.deepEqual(plan.commands.map((command) => command.payload.action || 'root'), ['root', 'reply', 'resolve']);

  const root = module.createRtkRootCommentReturnCommandHandler();
  const lifecycle = module.createRtkCommentLifecycleReturnCommandHandler();
  for (const command of plan.commands) {
    const handler = command.family === 'root_comment' ? root : lifecycle;
    assert.equal((await handler(command.payload)).status, 'applied');
    assert.equal((await handler(command.payload)).status, 'replay');
  }
  const canonical = JSON.parse(fs.readFileSync(path.join(projectRoot, '.yalken', 'word-review', 'non-text-return-state.v1.json'), 'utf8'));
  assert.equal(canonical.threads[0].status, 'resolved');
  assert.equal(canonical.threads[0].messages.length, 2);
});

test('N2 authenticated return refuses incomplete scene authority and unauthenticated input', async () => {
  const module = await import(MODULE_PATH);
  assert.equal(module.buildAuthenticatedCommentReturnCommands({ authenticated: false }).code, 'RTK_COMMENT_PRODUCT_RETURN_NOT_AUTHENTICATED');
  assert.equal(module.buildAuthenticatedCommentReturnCommands({
    authenticated: true,
    projectId: 'project-c5v2-n2',
    projectRoot: '/tmp/project-c5v2-n2',
    localAuthorityCapsule: { projectRoot: '/tmp/project-c5v2-n2' },
  }).code, 'RTK_COMMENT_PRODUCT_RETURN_ARTIFACT_ID_REQUIRED');
  const blocked = module.buildAuthenticatedCommentReturnCommands({
    authenticated: true,
    projectId: 'project-c5v2-n2',
    projectRoot: '/tmp/project-c5v2-n2',
    returnArtifactId: 'sha256:incomplete-authority-return',
    localAuthorityCapsule: { projectRoot: '/tmp/project-c5v2-n2' },
    reviewIr: { commentThreads: [{ threadId: 'thread', messages: [{ body: 'body' }] }], commentPlacements: [] },
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.typedBlocked[0].code, 'RTK_COMMENT_PRODUCT_RETURN_THREAD_AUTHORITY_INCOMPLETE');
});

test('N2 cumulative returns namespace reused native Word comment identities by authenticated artifact', async () => {
  const module = await import(MODULE_PATH);
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-c5v2-n2-cumulative-identity-'));
  const scenePath = path.join(projectRoot, 'scene-01.txt');
  const sceneText = 'First unique anchor and second unique anchor live in one scene.';
  fs.writeFileSync(scenePath, sceneText);
  const authority = {
    projectId: 'project-c5v2-n2-cumulative',
    projectRoot,
    scenePathBySceneId: { 'scene-01': scenePath },
    baselineFinalTextBySceneId: { 'scene-01': sceneText },
  };
  const buildPlan = ({ returnArtifactId, quote, body }) => module.buildAuthenticatedCommentReturnCommands({
    authenticated: true,
    projectId: authority.projectId,
    projectRoot,
    returnArtifactId,
    localAuthorityCapsule: authority,
    reviewIr: {
      commentThreads: [{
        threadId: 'rtk-comment-2034',
        commentId: '2034',
        status: 'open',
        messages: [{ messageId: '2034', body }],
      }],
      commentPlacements: [{
        threadId: 'rtk-comment-2034',
        targetScope: { type: 'scene', id: 'scene-01' },
        quote,
      }],
    },
  });
  const firstPlan = buildPlan({
    returnArtifactId: `sha256:${'a'.repeat(64)}`,
    quote: 'First unique anchor',
    body: 'Round one physical root.',
  });
  const secondPlan = buildPlan({
    returnArtifactId: `sha256:${'b'.repeat(64)}`,
    quote: 'second unique anchor',
    body: 'Round two physical root.',
  });
  assert.equal(firstPlan.ok, true);
  assert.equal(secondPlan.ok, true);
  assert.notEqual(firstPlan.commands[0].payload.threadId, secondPlan.commands[0].payload.threadId);
  assert.notEqual(firstPlan.commands[0].payload.commentId, secondPlan.commands[0].payload.commentId);
  assert.equal(firstPlan.commands[0].payload.sourceThreadId, 'rtk-comment-2034');
  assert.equal(secondPlan.commands[0].payload.sourceThreadId, 'rtk-comment-2034');

  const handler = module.createRtkRootCommentReturnCommandHandler();
  for (const plan of [firstPlan, secondPlan]) {
    assert.equal((await handler(plan.commands[0].payload)).status, 'applied');
    assert.equal((await handler(plan.commands[0].payload)).status, 'replay');
  }
  const canonical = JSON.parse(fs.readFileSync(
    path.join(projectRoot, '.yalken', 'word-review', 'non-text-return-state.v1.json'),
    'utf8',
  ));
  assert.equal(canonical.threads.length, 2);
  assert.equal(canonical.events.length, 2);
  assert.deepEqual(canonical.threads.map((thread) => thread.messages[0].body), [
    'Round one physical root.',
    'Round two physical root.',
  ]);
});

test('N2 activation coupling is preview-only until explicit canonical apply command', () => {
  const main = fs.readFileSync(path.join(REPO_ROOT, 'src', 'main.js'), 'utf8');
  const canary = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-physical-canary.mjs'), 'utf8');
  assert.match(main, /applyAuthenticatedDocxCommentProductPath/u);
  assert.match(main, /explicitCanonicalApplyConfirmed = false/u);
  assert.match(main, /RTK_COMMENT_PRODUCT_RETURN_PREVIEW_READY_EXPLICIT_APPLY_REQUIRED/u);
  assert.match(main, /explicitUserConfirmedCanonicalCommandRequired:\s*true/u);
  assert.match(main, /pendingProductApplyLane:\s*true/u);
  assert.match(main, /directPortDispatch:\s*false/u);
  assert.match(main, /RTK_COMMENT_PRODUCT_RETURN_NATIVE_COMMENT_IDENTITY_JOIN_BLOCKED/u);
  assert.ok(
    main.indexOf("RTK_COMMENT_PRODUCT_RETURN_NATIVE_COMMENT_IDENTITY_JOIN_BLOCKED")
      < main.indexOf("revisionBridge.buildAuthenticatedCommentReturnCommands", main.indexOf('async function applyAuthenticatedDocxCommentProductPath')),
  );
  assert.ok(
    main.indexOf("explicitCanonicalApplyConfirmed !== true", main.indexOf('async function applyAuthenticatedDocxCommentProductPath'))
      < main.indexOf("dispatchCommandSurfaceKernel(commandId, payload)", main.indexOf('async function applyAuthenticatedDocxCommentProductPath')),
  );
  assert.match(canary, /commentProductPath\.commandBusDispatchOnly === true/u);
  assert.match(canary, /commentProductPath\.directPortDispatch === false/u);
  assert.match(canary, /commentProductPath\.pendingProductApplyLane === false/u);
  assert.match(canary, /sceneAuthorityIdentityJoin\?\.identityJoinCount > 0/u);
  assert.match(canary, /sceneAuthorityIdentityJoin\?\.unjoinedPlacementCount === 0/u);
  assert.match(canary, /PENDING_PRODUCT_APPLY_LANE/u);
});

test('N2 physical-shaped seven-thread empty-scene parser failure binds only through authenticated export-map placements', async () => {
  const module = await import(MODULE_PATH);
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-c5v2-n2-physical-shaped-'));
  const scenes = {
    'roman/chapter-01.txt': 'Chapter one contains physical anchor one and physical anchor three and physical anchor five and physical anchor seven.',
    'roman/chapter-02.txt': 'Chapter two contains physical anchor two and physical anchor four and physical anchor six.',
  };
  const scenePathBySceneId = {};
  for (const [sceneId, text] of Object.entries(scenes)) {
    const scenePath = path.join(projectRoot, sceneId);
    fs.mkdirSync(path.dirname(scenePath), { recursive: true });
    fs.writeFileSync(scenePath, text);
    scenePathBySceneId[sceneId] = scenePath;
  }
  const commentThreads = Array.from({ length: 7 }, (_, index) => ({
    threadId: `rtk-comment-${index + 1}`,
    commentId: String(index + 1),
    status: 'resolved',
    messages: [
      { messageId: `root-${index + 1}`, body: `Physical root ${index + 1}` },
      { messageId: `reply-${index + 1}`, body: `Physical reply ${index + 1}` },
    ],
  }));
  const parserPlacements = commentThreads.map((thread, index) => ({
    threadId: thread.threadId,
    targetScope: { type: 'scene', id: '' },
    quote: `physical anchor ${['one', 'two', 'three', 'four', 'five', 'six', 'seven'][index]}`,
  }));
  const authenticatedPlacements = parserPlacements.map((placement, index) => ({
    ...placement,
    threadId: `docx-comment-${index + 1}`,
    sourceCommentId: String(index + 1),
    targetScope: {
      type: 'scene',
      id: index % 2 === 0 ? 'roman/chapter-01.txt' : 'roman/chapter-02.txt',
    },
    sceneAuthority: { authority: 'authenticated-full-manuscript-export-map-paragraph-signal' },
  }));
  const capsule = {
    projectId: 'project-c5v2-n2-physical', projectRoot, scenePathBySceneId,
    baselineFinalTextBySceneId: scenes,
  };
  const binding = module.bindAuthenticatedCommentPlacementSceneAuthority({
    commentThreads, parserPlacements, authenticatedPlacements, localAuthorityCapsule: capsule,
  });
  assert.equal(binding.ok, true);
  assert.equal(binding.quoteHeuristicUsed, false);
  assert.equal(binding.arbitraryThreadIdSuffixParsingUsed, false);
  assert.equal(binding.identityJoinCount, 7);
  assert.equal(binding.unjoinedPlacementCount, 0);
  assert.equal(binding.placements.every((placement, index) => placement.threadId === `rtk-comment-${index + 1}`), true);
  assert.equal(binding.placements.every((placement, index) => placement.sourceCommentId === String(index + 1)), true);
  assert.equal(binding.placements.every((placement) => placement.targetScope.id), true);
  assert.equal(binding.placements.every((placement) => placement.sceneAuthoritySource === 'authenticated-candidate-export-map-placement'), true);

  const plan = module.buildAuthenticatedCommentReturnCommands({
    authenticated: true,
    projectId: capsule.projectId,
    projectRoot,
    returnArtifactId: 'sha256:1064500e597e96b8bd977b8ddc6a1a782f79b4c05d677c1c63fd35dea8ecee74',
    localAuthorityCapsule: capsule,
    reviewIr: { commentThreads, commentPlacements: binding.placements },
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.commands.length, 21);
  const rootHandler = module.createRtkRootCommentReturnCommandHandler();
  const lifecycleHandler = module.createRtkCommentLifecycleReturnCommandHandler();
  for (const command of plan.commands) {
    const handler = command.family === 'root_comment' ? rootHandler : lifecycleHandler;
    const applied = await handler(command.payload);
    assert.equal(applied.status, 'applied');
    assert.equal(applied.writerCalled, true);
    assert.equal(Boolean(applied.recovery), true);
    assert.equal(Boolean(applied.canonicalDigest), true);
    const replay = await handler(command.payload);
    assert.equal(replay.status, 'replay');
    assert.equal(replay.writerCalled, false);
    assert.equal(replay.canonicalDigest, applied.canonicalDigest);
  }
  const canonical = JSON.parse(fs.readFileSync(path.join(projectRoot, '.yalken', 'word-review', 'non-text-return-state.v1.json'), 'utf8'));
  assert.equal(canonical.threads.length, 7);
  assert.equal(canonical.threads.every((thread) => thread.status === 'resolved' && thread.messages.length === 2), true);
  assert.equal(canonical.events.length, 21);
});

test('N2 scene authority mismatch and missing identity binding fail closed without suffix or quote routing', async () => {
  const module = await import(MODULE_PATH);
  const thread = { threadId: 'rtk-comment-3', commentId: '3', messages: [{ body: 'body' }] };
  const capsule = {
    scenePathBySceneId: { 'scene-a': 'scene-a.txt', 'scene-b': 'scene-b.txt' },
    baselineFinalTextBySceneId: { 'scene-a': 'anchor', 'scene-b': 'anchor' },
  };
  const mismatch = module.bindAuthenticatedCommentPlacementSceneAuthority({
    commentThreads: [thread],
    parserPlacements: [{ threadId: thread.threadId, targetScope: { type: 'scene', id: 'scene-a' }, quote: 'anchor' }],
    authenticatedPlacements: [{ threadId: 'docx-comment-3', sourceCommentId: '3', targetScope: { type: 'scene', id: 'scene-b' }, quote: 'anchor' }],
    localAuthorityCapsule: capsule,
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.failures[0].code, 'RTK_COMMENT_PRODUCT_RETURN_SCENE_AUTHORITY_MISMATCH');
  assert.equal(mismatch.quoteHeuristicUsed, false);
  assert.equal(mismatch.arbitraryThreadIdSuffixParsingUsed, false);
  const missing = module.bindAuthenticatedCommentPlacementSceneAuthority({
    commentThreads: [thread],
    parserPlacements: [{ threadId: thread.threadId, targetScope: { type: 'scene', id: '' }, quote: 'anchor' }],
    authenticatedPlacements: [],
    localAuthorityCapsule: capsule,
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.failures[0].code, 'RTK_COMMENT_PRODUCT_RETURN_NATIVE_COMMENT_ID_UNJOINED');
  assert.equal(missing.quoteHeuristicUsed, false);
});

test('N2 native OOXML comment identity rejects missing duplicate conflict and many-to-one joins', async () => {
  const module = await import(MODULE_PATH);
  const capsule = {
    scenePathBySceneId: { scene: 'scene.txt' },
    baselineFinalTextBySceneId: { scene: 'anchor' },
  };
  const candidate = (id) => ({
    threadId: `docx-comment-${id}`, sourceCommentId: String(id),
    targetScope: { type: 'scene', id: 'scene' },
    sceneAuthority: { authority: 'authenticated-full-manuscript-export-map-paragraph-signal' },
  });
  const bind = (commentThreads, parserPlacements, authenticatedPlacements) => module.bindAuthenticatedCommentPlacementSceneAuthority({
    commentThreads, parserPlacements, authenticatedPlacements, localAuthorityCapsule: capsule,
  });
  const missing = bind(
    [{ threadId: 'rtk-comment-3', messages: [] }],
    [{ threadId: 'rtk-comment-3', targetScope: { type: 'scene', id: '' } }],
    [candidate(3)],
  );
  assert.equal(missing.failures.some((failure) => failure.code === 'RTK_COMMENT_PRODUCT_RETURN_NATIVE_COMMENT_ID_MISSING'), true);
  const duplicate = bind(
    [{ threadId: 'rtk-comment-3', commentId: '3', messages: [] }],
    [{ threadId: 'rtk-comment-3', targetScope: { type: 'scene', id: '' } }],
    [candidate(3), { ...candidate(3), threadId: 'docx-comment-other' }],
  );
  assert.equal(duplicate.failures.some((failure) => failure.code === 'RTK_COMMENT_PRODUCT_RETURN_NATIVE_COMMENT_ID_DUPLICATE'), true);
  const conflict = bind(
    [{ threadId: 'rtk-comment-3', commentId: '3', messages: [] }],
    [{ threadId: 'rtk-comment-3', sourceCommentId: '4', targetScope: { type: 'scene', id: '' } }],
    [candidate(3)],
  );
  assert.equal(conflict.failures.some((failure) => failure.code === 'RTK_COMMENT_PRODUCT_RETURN_NATIVE_COMMENT_ID_CONFLICT'), true);
  const manyToOne = bind(
    [
      { threadId: 'rtk-comment-3', commentId: '3', messages: [] },
      { threadId: 'rtk-comment-three-copy', commentId: '3', messages: [] },
    ],
    [
      { threadId: 'rtk-comment-3', targetScope: { type: 'scene', id: '' } },
      { threadId: 'rtk-comment-three-copy', targetScope: { type: 'scene', id: '' } },
    ],
    [candidate(3)],
  );
  assert.equal(manyToOne.failures.some((failure) => failure.code === 'RTK_COMMENT_PRODUCT_RETURN_NATIVE_COMMENT_ID_MANY_TO_ONE'), true);
  for (const result of [missing, duplicate, conflict, manyToOne]) {
    assert.equal(result.ok, false);
    assert.equal(result.quoteHeuristicUsed, false);
    assert.equal(result.arbitraryThreadIdSuffixParsingUsed, false);
  }
});

test('N2 native lifecycle proof requires reopened parent and requested done semantics', async () => {
  const canary = await import(CANARY_PATH);
  const ledger = {
    operations: [
      { id: 'reply-3', family: 'reply_attempt', targetRootOperationId: 'root-3' },
      { id: 'resolve-3', family: 'state_attempt', targetRootOperationId: 'root-3', requestedState: 'resolved' },
      { id: 'reopen-3', family: 'state_attempt', targetRootOperationId: 'root-3', requestedState: 'reopened' },
    ],
  };
  const comments = (replyParent = '3') => `<w:comments xmlns:w="w" xmlns:w14="w14">
    <w:comment w:id="3"><w:p w14:paraId="ROOT3"><w:r><w:t>C5V2 root root-3</w:t></w:r></w:p></w:comment>
    <w:comment w:id="8" w:parentId="${replyParent}"><w:p w14:paraId="REPLY8"><w:r><w:t>C5V2 reply reply-3</w:t></w:r></w:p></w:comment>
  </w:comments>`;
  const extended = (done, parent = 'ROOT3') => `<w15:commentsEx xmlns:w15="w15">
    <w15:commentEx w15:paraId="ROOT3" w15:done="${done}"/>
    <w15:commentEx w15:paraId="REPLY8" w15:paraIdParent="${parent}" w15:done="0"/>
  </w15:commentsEx>`;
  const positive = canary.verifyNativeCommentLifecycleSemantics({
    ledger,
    snapshotXmlByOperationId: {
      'reply-3': { commentsXml: comments(), commentsExtendedXml: extended('0') },
      'resolve-3': { commentsXml: comments(), commentsExtendedXml: extended('1') },
      'reopen-3': { commentsXml: comments(), commentsExtendedXml: extended('0') },
    },
  });
  assert.equal(positive.ok, true);
  assert.equal(positive.verifiedCount, 3);

  const cases = [
    ['no-op-parent', { commentsXml: comments(''), commentsExtendedXml: extended('0', '') }, 'reply-3'],
    ['wrong-parent', { commentsXml: comments('99'), commentsExtendedXml: extended('0', 'WRONG') }, 'reply-3'],
    ['no-op-done', { commentsXml: comments(), commentsExtendedXml: '<w15:commentsEx xmlns:w15="w15"/>' }, 'resolve-3'],
    ['mismatched-state', { commentsXml: comments(), commentsExtendedXml: extended('0') }, 'resolve-3'],
  ];
  for (const [name, snapshot, operationId] of cases) {
    const result = canary.verifyNativeCommentLifecycleSemantics({
      ledger: { operations: ledger.operations.filter((operation) => operation.id === operationId) },
      snapshotXmlByOperationId: { [operationId]: snapshot },
    });
    assert.equal(result.ok, false, name);
    assert.equal(result.results[0].status, 'MANUAL_OR_BLOCKED', name);
  }
});

test('N2 Word canary never classifies reply or state setter no-error as SAFE_APPLY', () => {
  const source = fs.readFileSync(CANARY_PATH, 'utf8');
  assert.doesNotMatch(source, /make new Word comment at yRange with properties \{comment text:[^\n]+parent:/u);
  assert.doesNotMatch(source, /set done of \(item 1 of yRootComments\)/u);
  assert.match(source, /PENDING_NATIVE_READBACK/u);
  assert.doesNotMatch(source, /yClickUniqueNamedControl/u);
  assert.doesNotMatch(source, /yDescribeHierarchy/u);
  assert.doesNotMatch(source, /yCountMarker/u);
  assert.match(source, /targetRootOperationId/u);
  assert.match(source, /NATIVE_REPLY_PARENT_MISSING_OR_WRONG/u);
  assert.match(source, /NATIVE_STATE_MISSING_OR_MISMATCHED/u);
  assert.match(source, /FRONT_DOCUMENT_MISMATCH/u);
  assert.match(source, /yPrepareCommentsUi/u);
  assert.match(source, /yClickBoundedMarkerControl/u);
  assert.match(source, /radio button "Рецензирование" of tab group 1/u);
  assert.match(source, /repeat while yRibbonExpansionAttempts < 3/u);
  assert.match(source, /set yReviewTabValue to value of yReviewTab/u);
  assert.match(source, /if yReviewTabValue is 1 and yRibbonScrollAreaCount is 1 then exit repeat/u);
  assert.match(source, /click yReviewTab[\s\S]*set yRibbonExpansionAttempts to yRibbonExpansionAttempts \+ 1/u);
  assert.match(source, /if yReviewTabValue is not 1 then return "REVIEW_TAB_NOT_SELECTED/u);
  assert.match(source, /yRibbonScrollAreaCount is not 1/u);
  assert.match(source, /group 5 of scroll area 1 of tab group 1/u);
  assert.match(source, /every checkbox of yReviewGroup whose name is "Показать примечания"/u);
  assert.doesNotMatch(source, /button "Показать примечания"/u);
  assert.match(source, /yShowCommentsCount is not 1/u);
  assert.match(source, /if yShowCommentsValue is 0 then[\s\S]*click yShowCommentsControl/u);
  assert.match(source, /else if yShowCommentsValue is 1 then[\s\S]*CHECKBOX_ALREADY_OPEN_PRESERVED/u);
  assert.match(source, /SHOW_COMMENTS_CHECKBOX_VALUE_UNSUPPORTED/u);
  assert.match(source, /COMMENTS_UI_BOUNDED_DIAGNOSTIC/u);
  assert.match(source, /ROLE=.*SUBROLE=.*NAME=.*DESCRIPTION=.*ENABLED=.*VALUE=.*ACTIONS=/u);
  assert.match(source, /yDepth > 2/u);
  assert.match(source, /yAxVisitedNodes > 120/u);
  assert.match(source, /AX_COMMENT_SURFACE_DIAGNOSTIC/u);
  assert.match(source, /view type of view of active window/u);
  assert.match(source, /protection type of active document/u);
  assert.match(source, /yBoundedCountExactMarker/u);
  assert.match(source, /SHOW_COMMENTS_CHECKBOX_DISABLED_VALUE_0/u);
  assert.match(source, /CHECKBOX_DISABLED_VALUE_1_PANE_ALREADY_OPEN/u);
  assert.match(source, /yNavigateToUniqueCommentMarker/u);
  assert.match(source, /COMMENT_NAVIGATION_TARGET_MARKER_AMBIGUOUS/u);
  assert.match(source, /COMMENT_NAVIGATION_CYCLE_OR_TARGET_NOT_REACHED/u);
  assert.match(source, /COMMENT_NAVIGATION_WRONG_MARKER_CYCLE/u);
  assert.match(source, /COMMENT_NAVIGATION_STEP/u);
  assert.match(source, /every button of yReviewGroup whose name is "Следующее"/u);
  assert.doesNotMatch(source, /click at \{/u);
  assert.match(source, /yMaterializeNativeCommentBoundary/u);
  assert.match(source, /NATIVE_MATERIALIZATION_DURABLE_VISIBILITY_FAILED/u);
  assert.match(source, /NATIVE_MATERIALIZATION_REOPEN_IDENTITY_MISMATCH/u);
  assert.match(source, /NATIVE_MATERIALIZATION_REVISION_COUNT_MISMATCH/u);
  assert.match(source, /NATIVE_MATERIALIZATION_ROOT_COUNT_MISMATCH/u);
  assert.match(source, /NATIVE_MATERIALIZATION_ROOT_MARKER_COUNT_MISMATCH/u);
  assert.match(source, /NATIVE_MATERIALIZATION_REOPEN_HASH_DIVERGENCE/u);
  assert.match(source, /NATIVE_MATERIALIZATION_COMPATIBILITY_MODE_15_REQUIRED/u);
  assert.match(source, /NATIVE_MATERIALIZATION_SAVE_BEFORE/u);
  assert.match(source, /NATIVE_MATERIALIZATION_REOPEN_VERIFIED/u);
  assert.match(source, /my yShell\("\/bin\/sync"\)/u);
  assert.match(source, /settingsPartCount/u);
  assert.match(source, /compatibilityModes/u);
  assert.match(source, /modernMode15Ready/u);
  assert.match(source, /C5V2_SOURCE_PRODUCT_DOCX_MODERN_MODE_15_REQUIRED/u);
  assert.match(source, /sourcePackageSummary/u);
  assert.match(source, /returnedPackageSummary/u);
  assert.match(source, /AXLayoutArea/u);
  assert.match(source, /yDepth > 6/u);
  assert.match(source, /yAxVisitedNodes > 500/u);
  assert.match(source, /TIME_BUDGET_EXCEEDED/u);
  assert.match(source, /CANARY_PHASE_LOG_V1/u);
  assert.match(source, /yCloseStaleExpectedDocuments/u);
  const packageJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts['rtk:word:c5v2:physical-canary'], 'node scripts/ops/rtk-word-c5v2-physical-canary.mjs');
});

test('N2 root-only physical success cannot certify the combined comments replies state lane', async () => {
  const canary = await import(CANARY_PATH);
  const partial = canary.deriveC5V2CommentLaneMaturity({
    ok: true,
    planSummary: { rootCommentCount: 4, replyCount: 0, commentStateCount: 0 },
    semanticOracle: { triangleGreen: true, rootApplied: 4, lifecycleApplied: 0 },
  });
  assert.equal(partial.rootCommentsState, 'CANONICAL_ROOT_COMMENT_APPLY_AND_REPLAY_PROVEN');
  assert.equal(partial.repliesState, 'PENDING_REPLY_PRODUCT_APPLY_LANE');
  assert.equal(partial.commentState, 'PENDING_COMMENT_STATE_PRODUCT_APPLY_LANE');
  assert.equal(partial.commentsRepliesState, 'PENDING_PRODUCT_APPLY_LANE');
  assert.notEqual(partial.commentsRepliesState, 'CANONICAL_PRODUCT_APPLY_AND_REPLAY_PROVEN');
});

test('N2 C5V2 oracle binds root receipts through reopened canonical state instead of parser thread identifiers', async () => {
  const canary = await import(CANARY_PATH);
  const marker = 'C5V2 root c5v2-root_comment-0001';
  const sceneId = 'roman/01_dorian.txt';
  const selectedText = 'unique anchor';
  const operationId = `physical-root:${'a'.repeat(64)}`;
  const canonicalState = {
    schemaVersion: 'yalken.rtk.word.non-text-return-state.v1',
    projectId: 'project-c5v2-oracle',
    revision: 1,
    threads: [{
      threadId: 'rtk-comment-3',
      sceneId,
      status: 'open',
      anchor: { selectedText },
      rootCommentId: '3',
      messages: [{ commentId: '3', kind: 'root', body: marker }],
    }],
    events: [{
      schemaVersion: 'yalken.rtk.word.non-text-return-event.v1',
      sequence: 1,
      operationId,
      operationDigest: 'digest',
      kind: 'root_comment_added',
      sceneId,
      threadId: 'rtk-comment-3',
    }],
  };
  const receipt = {
    operationId,
    ok: true,
    recoveryWritten: true,
    canonicalDigest: 'canonical-after-root',
  };
  const binding = canary.bindC5V2CanonicalRootCommentEvidence({
    operation: { sceneId, quote: selectedText },
    marker,
    canonicalState,
    threadDiagnostics: [{
      threadId: 'docx-comment-3',
      messages: [{ body: marker }],
    }],
    placementDiagnostics: [{
      threadId: 'docx-comment-3',
      targetScope: { type: 'scene', id: sceneId },
      quote: selectedText,
    }],
    applyReceipts: [{ ...receipt, status: 'applied' }],
    replayReceipts: [{ ...receipt, status: 'replay' }],
  });
  assert.equal(binding.green, true);
  assert.equal(binding.diagnosticThreadId, 'docx-comment-3');
  assert.equal(binding.canonicalThreadId, 'rtk-comment-3');
  assert.equal(binding.expectedReceiptId, operationId);

  const recoveryState = {
    schemaVersion: canonicalState.schemaVersion,
    projectId: canonicalState.projectId,
    revision: 0,
    threads: [],
    events: [],
  };
  const canonicalRaw = `${JSON.stringify(canonicalState, null, 2)}\n`;
  const recoveryRaw = `${JSON.stringify(recoveryState, null, 2)}\n`;
  const captured = canary.validateC5V2CapturedCommentState({
    expectedRootCommentCount: 1,
    canonicalNonTextState: {
      present: true,
      rawContent: canonicalRaw,
      rawContentSha256: canary.sha256Text(canonicalRaw),
      state: canonicalState,
    },
    recoveryNonTextState: {
      present: true,
      rawContent: recoveryRaw,
      rawContentSha256: canary.sha256Text(recoveryRaw),
      state: recoveryState,
    },
  });
  assert.equal(captured.ok, true);

  const tampered = canary.validateC5V2CapturedCommentState({
    expectedRootCommentCount: 1,
    canonicalNonTextState: {
      present: true,
      rawContent: canonicalRaw.replace(marker, `${marker} tampered`),
      rawContentSha256: canary.sha256Text(canonicalRaw),
      state: canonicalState,
    },
    recoveryNonTextState: {
      present: true,
      rawContent: recoveryRaw,
      rawContentSha256: canary.sha256Text(recoveryRaw),
      state: recoveryState,
    },
  });
  assert.equal(tampered.ok, false);
  assert.equal(tampered.failures.includes('CANONICAL_COMMENT_STATE_RAW_HASH_MISMATCH'), true);
  assert.equal(tampered.failures.includes('CANONICAL_COMMENT_STATE_PARSED_STATE_MISMATCH'), true);
});

test('N2 lifecycle verification is explicitly not applicable when the ledger has no lifecycle operations', async () => {
  const canary = await import(CANARY_PATH);
  assert.deepEqual(
    canary.verifyNativeCommentLifecycleSemantics({ ledger: { operations: [] } }),
    {
      ok: true,
      notApplicable: true,
      results: [],
      verifiedCount: 0,
      blockedCount: 0,
    },
  );
});

test('N2 macOS Accessibility preflight classifies environment blockers before UI operations', async () => {
  const canary = await import(CANARY_PATH);
  const base = {
    legacyUiElementsEnabled: false,
    wordProcessExists: true,
    wordFrontmost: true,
    wordWindowCount: 1,
    axQuerySucceeded: true,
    axMenuBarItemCount: 11,
    axWindowSubtreeItemCount: 4,
    requireOpenDocument: true,
    frontDocumentFullName: 'Synthetic QA.docx',
    expectedFrontDocumentFullName: 'Synthetic QA.docx',
  };
  const legacyFalseReady = canary.evaluateMacosAccessibilityPreflight(base);
  assert.equal(legacyFalseReady.ok, true);
  const denied = canary.evaluateMacosAccessibilityPreflight({
    ...base,
    axQuerySucceeded: false,
    axMenuBarItemCount: 0,
    axErrorNumber: -1743,
    axErrorMessage: 'Not authorized to send Apple events to System Events.',
  });
  assert.equal(denied.code, 'MACOS_ACCESSIBILITY_PERMISSION_REQUIRED');
  assert.equal(denied.status, 'environment-blocked');
  assert.equal(denied.diagnostics.axErrorNumber, -1743);
  assert.match(denied.diagnostics.axErrorMessage, /Not authorized/u);
  const missingProcess = canary.evaluateMacosAccessibilityPreflight({ ...base, wordProcessExists: false });
  assert.equal(missingProcess.code, 'MACOS_ACCESSIBILITY_WORD_PROCESS_MISSING');
  const wrongDocument = canary.evaluateMacosAccessibilityPreflight({ ...base, frontDocumentFullName: 'Wrong.docx' });
  assert.equal(wrongDocument.code, 'MACOS_ACCESSIBILITY_FRONT_DOCUMENT_MISMATCH');
  const inaccessibleWindow = canary.evaluateMacosAccessibilityPreflight({ ...base, axWindowSubtreeItemCount: 0 });
  assert.equal(inaccessibleWindow.code, 'MACOS_ACCESSIBILITY_WORD_WINDOW_UNAVAILABLE');
  const standalone = canary.evaluateMacosAccessibilityPreflight({
    ...base,
    requireOpenDocument: false,
    wordWindowCount: 0,
    axWindowSubtreeItemCount: 0,
    frontDocumentFullName: '',
    expectedFrontDocumentFullName: '',
  });
  assert.equal(standalone.ok, true);
  const ready = canary.evaluateMacosAccessibilityPreflight(base);
  assert.equal(ready.ok, true);
  assert.equal(ready.code, 'MACOS_ACCESSIBILITY_PREFLIGHT_READY');

  const physicalScript = canary.buildWordScript({
    sourcePath: 'source.docx', returnedPath: 'returned.docx',
    ledger: { operations: [{ id: 'root-1', family: 'root_comment', quote: 'anchor', wordRange: { start: 0, end: 6 } }] },
  });
  const gateIndex = physicalScript.indexOf('set yAccessibilityPreflight to my yMacosAccessibilityPreflight');
  const mutationIndex = physicalScript.indexOf('make new Word comment at yRange');
  assert.ok(gateIndex > 0 && mutationIndex > gateIndex);
  assert.match(physicalScript, /MACOS_ACCESSIBILITY_PERMISSION_REQUIRED/u);
});

test('N2 AX route has bounded traversal timeout and durable killed-process phase evidence', async () => {
  const canary = await import(CANARY_PATH);
  const source = fs.readFileSync(CANARY_PATH, 'utf8');
  assert.doesNotMatch(source, /entire contents of/u);
  assert.doesNotMatch(source, /yDescribeHierarchy|yClickUniqueNamedControl|yCountMarker/u);
  assert.match(source, /set my yOverallDeadline to \(current date\) \+ 420/u);
  assert.match(source, /timeout:\s*480_000/u);
  assert.match(source, /AX_NODE_BUDGET_EXCEEDED/u);
  assert.match(source, /TIME_BUDGET_EXCEEDED\|AX_/u);
  const orderedScript = canary.buildWordScript({
    sourcePath: 'source.docx', returnedPath: 'returned.docx',
    ledger: { operations: [
      { id: 'root-1', family: 'root_comment', quote: 'root anchor', wordRange: { start: 0, end: 11 } },
      { id: 'replace-1', family: 'tracked_replace', quote: 'old', replacementText: 'new', wordRange: { start: 20, end: 23 } },
      { id: 'reply-1', family: 'reply_attempt', quote: 'reply anchor', targetRootOperationId: 'root-1', wordRange: { start: 30, end: 42 } },
    ] },
  });
  const rootCreationIndex = orderedScript.indexOf('make new Word comment at yRange');
  const trackedCreationIndex = orderedScript.indexOf('set content of yRange to "new"');
  const materializationCallIndex = orderedScript.indexOf('set yMaterializationHash to my yMaterializeNativeCommentBoundary');
  const lifecyclePrepareCallIndex = orderedScript.indexOf('set yUiPreparation to my yPrepareCommentsUi');
  assert.ok(rootCreationIndex >= 0);
  assert.ok(trackedCreationIndex > rootCreationIndex);
  assert.ok(materializationCallIndex > trackedCreationIndex);
  assert.ok(lifecyclePrepareCallIndex > materializationCallIndex);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-c5v2-phase-checkpoint-'));
  const returnedPath = path.join(tempRoot, 'synthetic-return.docx');
  fs.writeFileSync(`${returnedPath}.phase.log`, 'CANARY_PHASE_LOG_V1\nPREFLIGHT_AFTER|READY\nroot-1:ROOT_CREATE_AFTER|\n');
  const checkpoint = canary.readWordPhaseCheckpoint(returnedPath);
  assert.equal(checkpoint.present, true);
  assert.equal(checkpoint.lastPhase, 'root-1:ROOT_CREATE_AFTER');
});
