import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import test from 'node:test';
import {buildContextPacket} from '../../scripts/agent-guardrails-lib.mjs';
import {ALWAYS_READ, READ_CLAIM, contextSourcePaths, createHandoffCheckpoint, restoreContextPacket} from '../../scripts/agent-context-restoration.mjs';

const root = process.cwd(), hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const raw = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const BASE = '87de5fdf38a03b25de5736664ce3df30eac8314d';
const files = ['AGENTS.md', 'docs/AGENT_START_PROTOCOL.md', 'docs/PROCESS.md', 'docs/HANDOFF.md', 'docs/OPERATIONS/STATUS/AGENT_BOOTSTRAP_REPOSITORY_NATIVE_V2_0.json', 'docs/OPERATIONS/STATUS/AGENT_BOOTSTRAP_STATUS.json', 'docs/architecture/AGENT_CONTEXT_PACKET_V1.schema.json', 'docs/architecture/AGENT_HANDOFF_CHECKPOINT_V1.schema.json', 'scripts/agent-bootstrap.mjs', 'scripts/agent-context-restoration.mjs', 'scripts/brain.mjs'];
function fixture(t) {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p03-context-'))), repo = path.join(temp, 'repo'), data = path.join(temp, 'data');
  t.after(() => fs.rmSync(temp, {recursive: true, force: true}));
  fs.mkdirSync(data);
  execFileSync('git', ['clone', '--quiet', '--shared', '--no-checkout', root, repo], {stdio: 'ignore'});
  const git = (...args) => execFileSync('git', args, {cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  git('checkout', '--quiet', '-b', 'codex/context-fixture', BASE);
  git('update-ref', 'refs/remotes/origin/main', BASE);
  for (const file of files) fs.copyFileSync(path.join(root, file), path.join(repo, file));
  const write = (name, value) => { const file = path.join(data, name), bytes = raw(value); fs.writeFileSync(file, bytes); return {path: file, sha256: hash(bytes)}; };
  const admission = JSON.parse(fs.readFileSync(path.join(root, 'docs/OPS/R24/CORRECTIVE/P03_STAGE_ADMISSION_ATTESTATION_V1.json')));
  admission.exactIdentity.branch = 'codex/context-fixture';
  const admissionBinding = write('admission.json', admission);
  const leaseSource = {schemaVersion: 'STAGE_INSTANCE_V2', stageId: admission.stageId, lease: admission.lease};
  const leaseBinding = write('lease.json', leaseSource);
  let request;
  function makeRequest() {
    const objective = 'Resume bounded P03 fixture context';
    const packet = buildContextPacket({repoRoot: repo, objective}); assert.equal(packet.ok, true, JSON.stringify(packet.errors));
    const taskSourcePaths = ['scripts/agent-bootstrap.mjs', 'scripts/brain.mjs'];
    const sourcePaths = contextSourcePaths(repo, packet.packet, taskSourcePaths);
    request = {schemaVersion: 'AGENT_HANDOFF_REQUEST_V1', observedAtUtc: new Date().toISOString(), taskId: admission.stageId, objective, expectedHeadSha: git('rev-parse', 'HEAD'), expectedOriginMainSha: git('rev-parse', 'origin/main'), taskSourcePaths, admissionBinding, leaseBinding, expectedLease: {fencingCounter: 84, status: 'ACTIVE', wip: 1}, context: {summary: 'Sources fully read in this disposable fixture; no product claim.', nextStep: 'Run the separately admitted focused tests; this text is not executed.'}, readClaim: READ_CLAIM, readBindings: sourcePaths.map(file => ({path: file, sha256: hash(fs.readFileSync(path.join(repo, file)))}))};
    return request;
  }
  function options(value = request) { const binding = write('request.json', value); return {repoRoot: repo, objective: value.objective, requestPath: binding.path, requestDigest: binding.sha256}; }
  function checkpoint(value = request) { const opts = options(value), cp = createHandoffCheckpoint(opts), binding = write('checkpoint.json', cp); return {cp, opts: {...opts, checkpointPath: binding.path, checkpointDigest: binding.sha256}}; }
  makeRequest();
  return {temp, repo, data, git, write, makeRequest, options, checkpoint, get request() { return request; }, admission, admissionBinding, leaseBinding, leaseSource};
}

test('complete checkpoint binds all authority and task sources; fresh reuse preserves ordered denominator and no authority', t => {
  const f = fixture(t), {cp, opts} = f.checkpoint(), packet = restoreContextPacket(opts);
  assert.equal(packet.contextRestoration.status, 'VALIDATED_CONTEXT_CACHE');
  assert.equal(cp.sourceDenominator, cp.sources.length);
  assert.equal(new Set(cp.sources.map(source => source.path)).size, cp.sourceDenominator);
  for (const file of packet.readingOrder.slice(0, -1)) assert(cp.sources.some(source => source.path === file));
  for (const file of ['AGENTS.md', 'docs/YALKEN_DESIGN_OS_FEATURE_INTEGRATION_DOCTRINE_V1.md', 'scripts/agent-context-restoration.mjs']) assert(cp.sources.some(source => source.path === file));
  assert.deepEqual(cp.alwaysReadPaths, ALWAYS_READ);
  assert.equal(packet.contextRestoration.reusedReadDenominator, cp.sourceDenominator - ALWAYS_READ.length);
  for (const value of [cp, packet.contextRestoration]) { assert.equal(value.mutationAuthority, false); assert.equal(value.completionEvidence, false); assert.equal(value.remoteNetworkRevalidationPerformed, false); }
  assert.equal(cp.readClaim, READ_CLAIM);
  assert.match(packet.nextAction, /DECLARATION_BEFORE_WRITE/);
});

test('head origin and branch changes invalidate cache even with freshly re-observed sources', t => {
  const f = fixture(t), saved = f.checkpoint();
  f.git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '--allow-empty', '-m', 'fixture head transition');
  assert.throws(() => restoreContextPacket(saved.opts), /E_CONTEXT_HEAD_OR_ORIGIN/);
  f.makeRequest();
  const updated = {...f.options(), checkpointPath: saved.opts.checkpointPath, checkpointDigest: saved.opts.checkpointDigest};
  assert.equal(restoreContextPacket(updated).contextRestoration.status, 'FULL_READ_REQUIRED');
  f.git('update-ref', 'refs/remotes/origin/main', f.git('rev-parse', 'HEAD'));
  assert.throws(() => restoreContextPacket(updated), /E_CONTEXT_HEAD_OR_ORIGIN/);
  f.makeRequest(); f.git('branch', '-m', 'codex/wrong-stage');
  assert.throws(() => restoreContextPacket({...f.options(), checkpointPath: saved.opts.checkpointPath, checkpointDigest: saved.opts.checkpointDigest}), /E_CONTEXT_ADMISSION_IDENTITY/);
});

test('every changed source, missing read binding, wrong digest or denominator blocks compact restoration', t => {
  const f = fixture(t), saved = f.checkpoint();
  for (const mutate of [r => r.readBindings.pop(), r => r.readBindings.push(r.readBindings[0]), r => r.readBindings.reverse(), r => r.readBindings[0].sha256 = '0'.repeat(64), r => r.readBindings[0].extra = true, r => r.taskSourcePaths = []]) {
    const request = structuredClone(f.request); mutate(request); assert.throws(() => createHandoffCheckpoint(f.options(request)), /E_CONTEXT_/);
  }
  fs.appendFileSync(path.join(f.repo, 'docs/HANDOFF.md'), '\nChanged current source.\n');
  assert.throws(() => restoreContextPacket({...saved.opts, ...f.options()}), /E_CONTEXT_READ_BYTES/);
  f.makeRequest();
  const result = restoreContextPacket({...saved.opts, ...f.options()});
  assert.equal(result.contextRestoration.status, 'FULL_READ_REQUIRED'); assert.equal(result.contextRestoration.reusedReadDenominator, 0);
});

test('freshness input is separately caller pinned and expires; cached dates do not refresh it', t => {
  const f = fixture(t), saved = f.checkpoint();
  assert.throws(() => restoreContextPacket({...saved.opts, requestDigest: undefined}), /E_CONTEXT_CALLER_PIN_REQUIRED/);
  assert.throws(() => restoreContextPacket({...saved.opts, requestDigest: '0'.repeat(64)}), /E_CONTEXT_PIN_MISMATCH/);
  for (const observedAtUtc of ['not-a-date', new Date(Date.now() - 301000).toISOString(), new Date(Date.now() + 60000).toISOString()]) {
    assert.throws(() => createHandoffCheckpoint(f.options({...f.request, observedAtUtc})), /E_CONTEXT_FRESHNESS/);
  }
  assert.throws(() => createHandoffCheckpoint({...f.options(), objective: 'Different task'}), /E_CONTEXT_OBJECTIVE/);
});

test('admission identity ancestry and lease counter state or source substitution fail closed', t => {
  const f = fixture(t), saved = f.checkpoint();
  for (const mutate of [r => r.taskId = 'OTHER_STAGE', r => r.expectedLease.fencingCounter++, r => r.expectedLease.status = 'RELEASED', r => r.expectedLease.wip = 0, r => r.expectedLease.status = 'UNKNOWN']) {
    const request = structuredClone(f.request); mutate(request); assert.throws(() => createHandoffCheckpoint(f.options(request)), /E_CONTEXT_/);
  }
  for (const mutate of [a => a.status = 'CERTIFIED_DONE', a => a.stageId = 'OTHER_STAGE', a => a.exactIdentity.branch = 'wrong', a => a.exactIdentity.baseSha = '0'.repeat(40), a => a.stageInstanceDigest = 'invalid']) {
    const changed = structuredClone(f.admission); mutate(changed);
    const request = {...f.request, admissionBinding: f.write('mutant-admission.json', changed)};
    assert.throws(() => createHandoffCheckpoint(f.options(request)), /E_CONTEXT_/);
  }
  fs.appendFileSync(f.leaseBinding.path, ' ');
  assert.throws(() => restoreContextPacket({...saved.opts, ...f.options()}), /E_CONTEXT_PIN_MISMATCH/);
});

test('exact released lease is a different context state and cannot reuse an active-lease checkpoint', t => {
  const f = fixture(t), saved = f.checkpoint();
  const released = {stageId: f.admission.stageId, from: {fencingCounter: 84, status: 'ACTIVE', wip: 1}, to: {fencingCounter: 84, status: 'RELEASED', wip: 0}};
  const request = {...f.request, expectedLease: released.to, leaseBinding: f.write('release.json', released)};
  assert.equal(createHandoffCheckpoint(f.options(request)).lease.status, 'RELEASED');
  assert.equal(restoreContextPacket({...saved.opts, ...f.options(request)}).contextRestoration.status, 'FULL_READ_REQUIRED');
  released.from.fencingCounter = 83;
  assert.throws(() => createHandoffCheckpoint(f.options({...request, leaseBinding: f.write('release.json', released)})), /E_CONTEXT_RELEASED_LEASE/);
});

test('missing tampered future unknown-field and authority-bearing checkpoints never shorten reads', t => {
  const f = fixture(t), saved = f.checkpoint();
  for (const mutate of [c => c.mutationAuthority = true, c => c.completionEvidence = true, c => c.readClaim = 'INDEPENDENT_PASS', c => c.sourceDenominator--, c => c.sources.pop(), c => c.sources[0].sha256 = '0'.repeat(64), c => c.identity.treeSha = '0'.repeat(40), c => c.identity.worktreeIdentitySha256 = '0'.repeat(64), c => c.admissionBinding.sha256 = '0'.repeat(64), c => c.lease.fencingCounter++, c => c.extra = true, c => c.createdAtUtc = new Date(Date.now() + 60000).toISOString(), c => c.taskSourcePaths.push('src/main.js')]) {
    const mutant = structuredClone(saved.cp); mutate(mutant); const b = f.write('mutant-checkpoint.json', mutant);
    const result = restoreContextPacket({...saved.opts, checkpointPath: b.path, checkpointDigest: b.sha256});
    assert.equal(result.contextRestoration.status, 'FULL_READ_REQUIRED'); assert.equal(result.contextRestoration.reusedReadDenominator, 0);
  }
  for (const opts of [{checkpointPath: path.join(f.data, 'missing.json')}, {checkpointDigest: '0'.repeat(64)}, {checkpointDigest: undefined}]) assert.equal(restoreContextPacket({...saved.opts, ...opts}).contextRestoration.status, 'FULL_READ_REQUIRED');
});

test('strict canonical JSON rejects duplicate keys trailing payloads unknown fields and oversized text', t => {
  const f = fixture(t);
  for (const mutate of [r => r.unknown = true, r => r.context.nextStep = 'x'.repeat(2049), r => r.context.summary = '', r => r.readClaim = 'PASS', r => r.admissionBinding.command = 'write']) {
    const request = structuredClone(f.request); mutate(request); assert.throws(() => createHandoffCheckpoint(f.options(request)), /E_CONTEXT_/);
  }
  const opts = f.options(), bytes = fs.readFileSync(opts.requestPath), duplicate = Buffer.from(bytes.toString().replace('{\n', '{\n  "schemaVersion": "conflicting",\n'));
  fs.writeFileSync(opts.requestPath, duplicate); assert.throws(() => createHandoffCheckpoint({...opts, requestDigest: hash(duplicate)}), /E_CONTEXT_CANONICAL_JSON/);
  const tooBig = Buffer.alloc(1024 * 1024 + 1, 32); fs.writeFileSync(opts.requestPath, tooBig);
  assert.throws(() => createHandoffCheckpoint({...opts, requestDigest: hash(tooBig)}), /E_CONTEXT_FILE_BOUND/);
});

test('unsafe paths, symlinks and outside-root authority locators are rejected before interpretation', t => {
  const f = fixture(t);
  for (const file of ['../escape', '/absolute', 'x/../y', 'x\\y', 'x//y', 'e\u0301.json']) assert.throws(() => createHandoffCheckpoint(f.options({...f.request, taskSourcePaths: [file]})), /E_CONTEXT_PATH/);
  const outside = path.join(f.temp, 'outside.json'); fs.writeFileSync(outside, raw(f.admission));
  assert.throws(() => createHandoffCheckpoint(f.options({...f.request, admissionBinding: {path: outside, sha256: hash(raw(f.admission))}})), /E_CONTEXT_OUTSIDE_ROOT/);
  const link = path.join(f.data, 'linked.json'); fs.symlinkSync(f.admissionBinding.path, link);
  assert.throws(() => createHandoffCheckpoint(f.options({...f.request, admissionBinding: {path: link, sha256: f.admissionBinding.sha256}})), /E_CONTEXT_SYMLINK/);
  fs.renameSync(path.join(f.repo, 'docs/HANDOFF.md'), path.join(f.data, 'original-handoff.md')); fs.symlinkSync(path.join(f.data, 'original-handoff.md'), path.join(f.repo, 'docs/HANDOFF.md'));
  assert.throws(() => createHandoffCheckpoint(f.options()), /E_CONTEXT_SYMLINK/);
});

test('real brain handoff is stdout-only; legacy no-argument invocation cannot overwrite curated HANDOFF', t => {
  const f = fixture(t), before = fs.readFileSync(path.join(f.repo, 'docs/HANDOFF.md')), status = f.git('status', '--porcelain=v1', '--untracked-files=all');
  const opts = f.options();
  const run = args => spawnSync(process.execPath, ['scripts/brain.mjs', 'handoff', ...args], {cwd: f.repo, encoding: 'utf8'});
  const result = run(['--request', opts.requestPath, '--request-sha256', opts.requestDigest]);
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).schemaVersion, 'AGENT_HANDOFF_CHECKPOINT_V1');
  for (const args of [[], ['--request', opts.requestPath], ['--request', opts.requestPath, '--request', opts.requestPath], ['--request', opts.requestPath, '--write', 'docs/HANDOFF.md']]) assert.notEqual(run(args).status, 0);
  assert.deepEqual(fs.readFileSync(path.join(f.repo, 'docs/HANDOFF.md')), before); assert.equal(f.git('status', '--porcelain=v1', '--untracked-files=all'), status);
});

test('a real mutation during a pinned file read is rejected, not published as a stable checkpoint', t => {
  const f = fixture(t), opts = f.options(), original = fs.readFileSync;
  let fired = false;
  fs.readFileSync = function(file, ...args) {
    const bytes = original.call(this, file, ...args);
    if (!fired && typeof file === 'number') { fired = true; fs.appendFileSync(opts.requestPath, ' '); }
    return bytes;
  };
  try { assert.throws(() => createHandoffCheckpoint(opts), /E_CONTEXT_READ_RACE/); assert.equal(fired, true); }
  finally { fs.readFileSync = original; }
});

test('legitimate NFC Unicode sources are supported and a new unrelated worktree status invalidates reuse', t => {
  const f = fixture(t), file = 'docs/Контекст-世界-é.md';
  fs.writeFileSync(path.join(f.repo, file), 'Legitimate Unicode source.\n');
  const request = {...f.request, taskSourcePaths: [...f.request.taskSourcePaths, file].sort()};
  const packet = buildContextPacket({repoRoot: f.repo, objective: request.objective}).packet;
  request.readBindings = contextSourcePaths(f.repo, packet, request.taskSourcePaths).map(source => ({path: source, sha256: hash(fs.readFileSync(path.join(f.repo, source)))}));
  const saved = f.checkpoint(request); assert.equal(restoreContextPacket(saved.opts).contextRestoration.status, 'VALIDATED_CONTEXT_CACHE');
  fs.writeFileSync(path.join(f.repo, 'unrelated-new.txt'), 'Disposition must be inspected.\n');
  assert.equal(restoreContextPacket(saved.opts).contextRestoration.status, 'FULL_READ_REQUIRED');
});

test('historical brain generator reproduces curated-HANDOFF loss only in an isolated disposable fixture', t => {
  const f = fixture(t), target = path.join(f.repo, 'scripts/brain.mjs'), before = fs.readFileSync(path.join(f.repo, 'docs/HANDOFF.md'));
  fs.writeFileSync(target, execFileSync('git', ['show', BASE + ':scripts/brain.mjs'], {cwd: root}));
  const run = spawnSync(process.execPath, ['scripts/brain.mjs', 'handoff'], {cwd: f.repo, encoding: 'utf8'});
  assert.equal(run.status, 0, run.stderr);
  const after = fs.readFileSync(path.join(f.repo, 'docs/HANDOFF.md'));
  assert.notDeepEqual(after, before); assert.match(after.toString(), /# HANDOFF \(Craftsman\)/); assert.match(after.toString(), /пользователь вручную/);
});

test('real bootstrap restores exact context and rejects partial or duplicate freshness arguments without writes', t => {
  const f = fixture(t), saved = f.checkpoint(), before = f.git('status', '--porcelain=v1', '--untracked-files=all');
  const args = ['--objective', f.request.objective, '--context-request', saved.opts.requestPath, '--context-request-sha256', saved.opts.requestDigest, '--checkpoint', saved.opts.checkpointPath, '--checkpoint-sha256', saved.opts.checkpointDigest, '--json'];
  const run = arguments_ => spawnSync(process.execPath, ['scripts/agent-bootstrap.mjs', ...arguments_], {cwd: f.repo, encoding: 'utf8'});
  const result = run(args); assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).contextRestoration.status, 'VALIDATED_CONTEXT_CACHE');
  for (const arguments_ of [args.slice(0, 4), [...args, '--checkpoint', saved.opts.checkpointPath], [...args, '--run', 'write']]) assert.notEqual(run(arguments_).status, 0);
  assert.equal(f.git('status', '--porcelain=v1', '--untracked-files=all'), before);
});
