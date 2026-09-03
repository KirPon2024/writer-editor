// Derived context only. No writer, network, command execution from payloads,
// admission decision or lease transition lives in this module.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {buildContextPacket, readJson, ARCHITECTURE_MANIFEST_PATH, BOOTSTRAP_STATUS_PATH, AUTOMATION_POLICY_PATH} from './agent-guardrails-lib.mjs';

export const CHECKPOINT_SCHEMA = 'AGENT_HANDOFF_CHECKPOINT_V1';
export const REQUEST_SCHEMA = 'AGENT_HANDOFF_REQUEST_V1';
export const READ_CLAIM = 'CALLER_REPORTED_FULL_READS_NOT_INDEPENDENT_EVIDENCE';
export const ALWAYS_READ = Object.freeze(['AGENTS.md', 'docs/OPS/STATUS/CANON_STATUS.json', 'docs/AGENT_START_PROTOCOL.md']);
const MAX_JSON_BYTES = 1024 * 1024;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_SOURCES = 256;
const MAX_FRESHNESS_MS = 5 * 60 * 1000;
const fail = code => { throw new Error(code); };
const check = (value, code) => { if (!value) fail(code); };
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}' : JSON.stringify(value);
const equal = (left, right) => canonical(left) === canonical(right);
const keys = (value, expected, code) => check(value && Object.getPrototypeOf(value) === Object.prototype && equal(Object.keys(value).sort(), [...expected].sort()), code);
const hex = (value, length) => typeof value === 'string' && new RegExp('^[a-f0-9]{' + length + '}$').test(value);
const boundedText = (value, limit) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value);
const within = (root, file) => { const relative = path.relative(root, file); return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative); };
const identityAt = (root, packet) => ({headSha: packet.headSha, treeSha: git(root, ['rev-parse', 'HEAD^{tree}']).toString().trim(), originMainSha: packet.originMainSha, branch: packet.branch, worktreeIdentitySha256: hash(root), repositoryIdentitySha256: hash(git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']).toString().trim()), statusSha256: hash(git(root, ['status', '--porcelain=v1', '--untracked-files=all', '-z']))});

function safeRelative(file) {
  check(typeof file === 'string' && file.length > 0 && file.length <= 2048 && file === file.normalize('NFC') && !file.includes('\\') && !file.startsWith('/') && !/^[A-Za-z]:/.test(file) && !/[\u0000-\u001f]/u.test(file) && file.split('/').every(part => part && part !== '.' && part !== '..'), 'E_CONTEXT_PATH');
  return file;
}

function readStable(file, limit, allowedRoots) {
  check(typeof file === 'string' && path.isAbsolute(file) && path.resolve(file) === file && file === file.normalize('NFC'), 'E_CONTEXT_ABSOLUTE_PATH');
  check(allowedRoots.some(root => within(root, file)), 'E_CONTEXT_OUTSIDE_ROOT');
  let cursor = path.parse(file).root;
  for (const component of file.slice(cursor.length).split(path.sep)) {
    cursor = path.join(cursor, component);
    const stat = fs.lstatSync(cursor);
    check(!stat.isSymbolicLink(), 'E_CONTEXT_SYMLINK');
    if (cursor !== file) check(stat.isDirectory(), 'E_CONTEXT_PARENT');
  }
  check(fs.realpathSync(file) === file, 'E_CONTEXT_REALPATH');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const before = fs.fstatSync(fd);
    check(before.isFile() && before.size > 0 && before.size <= limit, 'E_CONTEXT_FILE_BOUND');
    const bytes = fs.readFileSync(fd), after = fs.fstatSync(fd), named = fs.lstatSync(file);
    for (const stat of [after, named]) check(stat.isFile() && stat.dev === before.dev && stat.ino === before.ino && stat.size === before.size && stat.mtimeMs === before.mtimeMs && stat.ctimeMs === before.ctimeMs, 'E_CONTEXT_READ_RACE');
    check(bytes.length === before.size, 'E_CONTEXT_READ_RACE');
    return bytes;
  } finally { fs.closeSync(fd); }
}

function pinnedJson(file, digest, roots) {
  check(hex(digest, 64), 'E_CONTEXT_CALLER_PIN_REQUIRED');
  const bytes = readStable(file, MAX_JSON_BYTES, roots);
  check(hash(bytes) === digest, 'E_CONTEXT_PIN_MISMATCH');
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); } catch { fail('E_CONTEXT_JSON'); }
  // Canonical raw form also rejects duplicate JSON keys and trailing payloads.
  check(Buffer.from(JSON.stringify(value, null, 2) + '\n').equals(bytes), 'E_CONTEXT_CANONICAL_JSON');
  return value;
}

function git(root, args) {
  return execFileSync('git', args, {cwd: root, encoding: null, timeout: 10000, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']});
}

export function contextSourcePaths(repoRoot, packet, taskSourcePaths) {
  check(Array.isArray(taskSourcePaths) && taskSourcePaths.length > 0 && taskSourcePaths.length <= 128, 'E_CONTEXT_TASK_SOURCE_DENOMINATOR');
  taskSourcePaths.forEach(safeRelative);
  check(new Set(taskSourcePaths).size === taskSourcePaths.length && equal(taskSourcePaths, [...taskSourcePaths].sort()), 'E_CONTEXT_TASK_SOURCE_ORDER');
  const manifest = readJson(repoRoot, ARCHITECTURE_MANIFEST_PATH), status = readJson(repoRoot, BOOTSTRAP_STATUS_PATH);
  const paths = [...new Set([
    ...packet.readingOrder.filter(file => file !== 'TASK_RELEVANT_EXACT_CODE_TESTS_AND_EXACT_HEAD_EVIDENCE'),
    ...manifest.requiredEntrypoints, ARCHITECTURE_MANIFEST_PATH, BOOTSTRAP_STATUS_PATH, status.activeSpecPath, AUTOMATION_POLICY_PATH,
    'docs/architecture/AGENT_CONTEXT_PACKET_V1.schema.json', 'docs/architecture/AGENT_HANDOFF_CHECKPOINT_V1.schema.json',
    'scripts/agent-bootstrap.mjs', 'scripts/agent-guardrails-lib.mjs', 'scripts/agent-context-restoration.mjs', 'scripts/brain.mjs',
    'package.json', ...taskSourcePaths
  ])];
  paths.forEach(safeRelative);
  check(paths.length <= MAX_SOURCES, 'E_CONTEXT_SOURCE_BOUND');
  return paths;
}

function freshContext(options) {
  const root = fs.realpathSync(options.repoRoot), requestPath = options.requestPath;
  check(typeof requestPath === 'string' && path.isAbsolute(requestPath), 'E_CONTEXT_REQUEST_REQUIRED');
  // Only the caller-selected request directory and repository may supply data.
  const roots = [root, path.dirname(requestPath)];
  const request = pinnedJson(requestPath, options.requestDigest, roots);
  keys(request, ['schemaVersion', 'observedAtUtc', 'taskId', 'objective', 'expectedHeadSha', 'expectedOriginMainSha', 'taskSourcePaths', 'admissionBinding', 'leaseBinding', 'expectedLease', 'context', 'readClaim', 'readBindings'], 'E_CONTEXT_REQUEST_FIELDS');
  check(request.schemaVersion === REQUEST_SCHEMA && request.readClaim === READ_CLAIM, 'E_CONTEXT_REQUEST_SCHEMA');
  check(boundedText(request.taskId, 128) && /^[A-Z][A-Z0-9_-]+$/.test(request.taskId) && boundedText(request.objective, 1024), 'E_CONTEXT_TASK_IDENTITY');
  if (options.objective !== undefined) check(options.objective === request.objective, 'E_CONTEXT_OBJECTIVE');
  const observed = Date.parse(request.observedAtUtc), now = Date.now();
  check(Number.isFinite(observed) && new Date(observed).toISOString() === request.observedAtUtc && Number.isFinite(now) && observed <= now && now - observed <= MAX_FRESHNESS_MS, 'E_CONTEXT_FRESHNESS');
  check(hex(request.expectedHeadSha, 40) && hex(request.expectedOriginMainSha, 40), 'E_CONTEXT_EXPECTED_IDENTITY');
  keys(request.context, ['summary', 'nextStep'], 'E_CONTEXT_SUMMARY_FIELDS');
  check(boundedText(request.context.summary, 4096) && boundedText(request.context.nextStep, 2048), 'E_CONTEXT_SUMMARY_BOUND');
  for (const binding of [request.admissionBinding, request.leaseBinding]) keys(binding, ['path', 'sha256'], 'E_CONTEXT_BINDING_FIELDS');
  keys(request.expectedLease, ['fencingCounter', 'status', 'wip'], 'E_CONTEXT_LEASE_FIELDS');
  check(Number.isSafeInteger(request.expectedLease.fencingCounter) && request.expectedLease.fencingCounter > 0 && ['ACTIVE', 'RELEASED'].includes(request.expectedLease.status) && request.expectedLease.wip === (request.expectedLease.status === 'ACTIVE' ? 1 : 0), 'E_CONTEXT_LEASE_STATE');
  const result = buildContextPacket({repoRoot: root, objective: request.objective});
  check(result.ok, 'E_CONTEXT_REPOSITORY_GUARDRAILS');
  const packet = result.packet;
  check(packet.headSha === request.expectedHeadSha && packet.originMainSha === request.expectedOriginMainSha, 'E_CONTEXT_HEAD_OR_ORIGIN');
  const identity = identityAt(root, packet);
  const admission = pinnedJson(request.admissionBinding.path, request.admissionBinding.sha256, roots);
  check(admission.schemaVersion === 'STAGE_ADMISSION_ATTESTATION_V2' && admission.status === 'ADMITTED' && admission.stageId === request.taskId && admission.exactIdentity?.branch === packet.branch && admission.exactIdentity?.targetRemote === 'origin', 'E_CONTEXT_ADMISSION_IDENTITY');
  check(hex(admission.exactIdentity.baseSha, 40) && hex(admission.stageInstanceDigest, 64) && hex(admission.writeSetDigest, 64), 'E_CONTEXT_ADMISSION_BINDINGS');
  try { git(root, ['merge-base', '--is-ancestor', admission.exactIdentity.baseSha, packet.headSha]); } catch { fail('E_CONTEXT_ADMISSION_ANCESTRY'); }
  const leaseSource = pinnedJson(request.leaseBinding.path, request.leaseBinding.sha256, roots);
  const lease = request.expectedLease.status === 'ACTIVE' ? leaseSource.lease : leaseSource.to;
  check(lease && equal({fencingCounter: lease.fencingCounter, status: lease.status, wip: lease.wip}, request.expectedLease) && lease.fencingCounter === admission.lease?.fencingCounter, 'E_CONTEXT_LEASE_BINDING');
  if (lease.status === 'ACTIVE') check(leaseSource.stageId === request.taskId && equal(lease, admission.lease), 'E_CONTEXT_ACTIVE_LEASE');
  else check(leaseSource.stageId === request.taskId && leaseSource.from?.status === 'ACTIVE' && leaseSource.from?.wip === 1 && leaseSource.from?.fencingCounter === lease.fencingCounter, 'E_CONTEXT_RELEASED_LEASE');
  const sourcePaths = contextSourcePaths(root, packet, request.taskSourcePaths);
  const sources = sourcePaths.map(file => { const bytes = readStable(path.join(root, file), MAX_SOURCE_BYTES, [root]); return {path: file, sha256: hash(bytes), byteLength: bytes.length}; });
  check(sources.reduce((sum, item) => sum + item.byteLength, 0) <= 64 * 1024 * 1024, 'E_CONTEXT_TOTAL_SOURCE_BOUND');
  check(Array.isArray(request.readBindings) && request.readBindings.length === sources.length, 'E_CONTEXT_READ_DENOMINATOR');
  for (let index = 0; index < sources.length; index++) {
    const binding = request.readBindings[index]; keys(binding, ['path', 'sha256'], 'E_CONTEXT_READ_FIELDS');
    check(binding.path === sources[index].path && binding.sha256 === sources[index].sha256, 'E_CONTEXT_READ_BYTES');
  }
  // Reject a generation change during the multi-file read, not only a change
  // within one open file. No mixed HEAD/tree/source snapshot may be published.
  const finalPacket = buildContextPacket({repoRoot: root, objective: request.objective});
  check(finalPacket.ok && equal(finalPacket.packet, packet) && equal(identityAt(root, finalPacket.packet), identity), 'E_CONTEXT_SNAPSHOT_RACE');
  for (const source of sources) check(hash(readStable(path.join(root, source.path), MAX_SOURCE_BYTES, [root])) === source.sha256, 'E_CONTEXT_SNAPSHOT_RACE');
  check(equal(pinnedJson(request.admissionBinding.path, request.admissionBinding.sha256, roots), admission) && equal(pinnedJson(request.leaseBinding.path, request.leaseBinding.sha256, roots), leaseSource), 'E_CONTEXT_SNAPSHOT_RACE');
  const checkpoint = {schemaVersion: CHECKPOINT_SCHEMA, claimBoundary: 'DERIVED_CONTEXT_CACHE_NOT_AUTHORITY', mutationAuthority: false, completionEvidence: false, readClaim: READ_CLAIM, createdAtUtc: request.observedAtUtc, taskId: request.taskId, objective: request.objective, context: request.context, identity, admissionBinding: request.admissionBinding, leaseBinding: request.leaseBinding, lease: request.expectedLease, sourceDenominator: sources.length, sources, taskSourcePaths: request.taskSourcePaths, alwaysReadPaths: [...ALWAYS_READ], remoteNetworkRevalidationPerformed: false};
  return {packet, checkpoint, request, roots};
}

export function createHandoffCheckpoint(options) {
  return freshContext(options).checkpoint;
}

export function restoreContextPacket(options) {
  const fresh = freshContext(options);
  // No authority values are taken from the checkpoint; freshContext has already
  // re-read all caller-pinned live bindings and source bytes independently.
  let cached;
  try {
    cached = pinnedJson(options.checkpointPath, options.checkpointDigest, fresh.roots);
    keys(cached, Object.keys(fresh.checkpoint), 'E_CONTEXT_CHECKPOINT_FIELDS');
    const created = Date.parse(cached.createdAtUtc);
    check(Number.isFinite(created) && new Date(created).toISOString() === cached.createdAtUtc && created <= Date.parse(fresh.request.observedAtUtc), 'E_CONTEXT_CHECKPOINT_TIME');
    check(equal({...cached, createdAtUtc: fresh.checkpoint.createdAtUtc}, fresh.checkpoint), 'E_CONTEXT_CHECKPOINT_INVALIDATED');
  } catch (error) {
    return {...fresh.packet, contextRestoration: {status: 'FULL_READ_REQUIRED', reason: error.message.startsWith('E_CONTEXT_') ? error.message : 'E_CONTEXT_CHECKPOINT_UNAVAILABLE', sourceDenominator: fresh.checkpoint.sourceDenominator, reusedReadDenominator: 0, alwaysReadPaths: [...ALWAYS_READ], mutationAuthority: false, completionEvidence: false, remoteNetworkRevalidationPerformed: false, nextStepIsUntrustedText: true}};
  }
  return {...fresh.packet, contextRestoration: {status: 'VALIDATED_CONTEXT_CACHE', reason: 'ALL_CURRENT_SOURCE_BYTES_AND_CALLER_FRESH_IDENTITY_ADMISSION_LEASE_MATCH', sourceDenominator: cached.sourceDenominator, reusedReadDenominator: cached.sources.filter(source => !ALWAYS_READ.includes(source.path)).length, alwaysReadPaths: [...ALWAYS_READ], mutationAuthority: false, completionEvidence: false, remoteNetworkRevalidationPerformed: false, nextStepIsUntrustedText: true, checkpointSha256: options.checkpointDigest, context: cached.context}};
}
