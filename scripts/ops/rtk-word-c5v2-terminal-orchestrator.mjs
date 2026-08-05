#!/usr/bin/env node
/**
 * rtk-word-c5v2-terminal-orchestrator.mjs
 *
 * Fail-closed single-chain orchestration engine for the Word C5V2 terminal
 * campaign: POSITIVE (5 cumulative rounds) -> NEGATIVE (40 probes) ->
 * AGGREGATE (reuse-binding terminal aggregate), with a strict stage protocol,
 * independently validated stage results, hash-linked chain journal and seals.
 *
 * Primary invariants: EXPLICIT_IDENTITY_ONLY, FAILURE_CANNOT_BECOME_SUCCESS,
 * OLD_GREEN_CANNOT_SATISFY_NEW_STAGE, CHILD_EXIT_IS_NOT_STAGE_PROOF,
 * NO_OWNED_PROCESS_SURVIVES_FAILED_STAGE,
 * AGGREGATE_CANNOT_START_BEFORE_POSITIVE_AND_NEGATIVE_SEALS,
 * LOCK_RELEASE_REQUIRES_OWNER_TOKEN, FINALLY_ALWAYS_EXECUTES,
 * CERTIFICATION_GATES_CANNOT_BE_SKIPPED, UNKNOWN_STATE_IS_QUARANTINED.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import {
  C5V2_LEDGER_SCHEMA,
  DEFAULT_C5V2_LEDGER_COUNTS,
} from './rtk-word-c5v2-ledger-engine.mjs';
import {
  applyNativeLifecycleVerification,
  buildC5V2ReturnApplyCandidateAuthority,
  buildOracleProbe,
  packageSummary as canaryPackageSummary,
  parseWordOutput as parseCanaryWordOutput,
  readNativeLifecycleSnapshots,
  validateC5V2ReturnApplyCandidateAuthority,
  validateC5V2ReturnApplyCandidateAuthorityAnchor,
} from './rtk-word-c5v2-physical-canary.mjs';

export const ORCH_SCHEMA = 'yalken.rtk.word.c5v2.terminal-orchestrator.v2';
export const STAGE_RESULT_SCHEMA = 'yalken.rtk.word.c5v2.orchestrated-stage-result.v1';
export const STAGE_SEAL_SCHEMA = 'yalken.rtk.word.c5v2.orchestrated-stage-seal.v1';
export const HEARTBEAT_SCHEMA = 'yalken.rtk.word.c5v2.orchestrated-heartbeat.v1';
export const CHAIN_IDS = Object.freeze(['W06', 'REP1', 'REP2', 'REP3']);
export const STAGES = Object.freeze(['POSITIVE', 'NEGATIVE', 'AGGREGATE']);
export const TERMINAL_CAMPAIGN_PROFILE = 'C5V2_DORIAN_TERMINAL';
const SECURE_VOLUME_UUID = 'D1F2E2C1-3210-4A39-A4E0-0AA0AD5110E2';
const IDENTITY_RE = /^[A-Za-z0-9._-]{1,64}$/u;
const SHA256_DIGEST_RE = /^sha256:[0-9a-f]{64}$/u;
const CANONICAL_SCRIPT_HASH_KEYS = Object.freeze(['orchestrator', 'physicalCanary']);

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..', '..');

function nowIso() {
  return new Date().toISOString();
}

function sha256Bytes(bytes) {
  return 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex');
}

function sha256File(filePath) {
  return sha256Bytes(fs.readFileSync(filePath));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Text(value) {
  return sha256Bytes(Buffer.from(String(value), 'utf8'));
}

function digestOf(value) {
  return sha256Text(stableJson(value));
}

function stableJsonEqual(left, right) {
  return stableJson(left) === stableJson(right);
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function computeCanonicalScriptHashes() {
  return {
    orchestrator: sha256File(THIS_FILE),
    physicalCanary: sha256File(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-physical-canary.mjs')),
  };
}

function validateCanonicalScriptHashes(scriptHashes, failures, prefix = 'ORCH_SCRIPT_HASHES') {
  if (!scriptHashes || typeof scriptHashes !== 'object' || Array.isArray(scriptHashes)) {
    failures.push(`${prefix}_MISSING`);
    return false;
  }
  const keys = Object.keys(scriptHashes).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...CANONICAL_SCRIPT_HASH_KEYS].sort())) {
    failures.push(`${prefix}_KEYS:${keys.join(',')}`);
    return false;
  }
  for (const key of CANONICAL_SCRIPT_HASH_KEYS) {
    if (!SHA256_DIGEST_RE.test(String(scriptHashes[key] || ''))) failures.push(`${prefix}_${key}_INVALID:${scriptHashes[key] || ''}`);
  }
  return true;
}

function ledgerDigestForOperations(operations) {
  return sha256Text(JSON.stringify(operations));
}

function operationIdSetDigestForOperations(operations) {
  return sha256Text(JSON.stringify(operations.map((operation) => operation?.id || operation?.operationId || '')));
}

function roundLedgerReuseDigest(ledger = {}) {
  const normalized = JSON.parse(JSON.stringify(ledger && typeof ledger === 'object' && !Array.isArray(ledger) ? ledger : {}));
  delete normalized.masterLedgerDigest;
  delete normalized.ledgerDigest;
  return digestOf(normalized);
}

function arrayDigest(values = []) {
  return digestOf(Array.isArray(values) ? values.map(String) : []);
}

function c5v2OperationRequestEffectIdentity(operation = {}) {
  return {
    operationId: operation.id || operation.operationId || '',
    family: operation.family || '',
    sceneId: operation.sceneId || '',
    round: Number.isInteger(operation.round) ? operation.round : null,
    expectedOutcome: operation.expectedOutcome || '',
    semanticIntent: operation.semanticIntent || null,
    anchor: operation.anchor || null,
    targetRootOperationId: operation.targetRootOperationId || '',
  };
}

function c5v2OperationRequestKey(operation = {}) {
  return sha256Text(stableJson({
    role: 'request',
    ...c5v2OperationRequestEffectIdentity(operation),
  }));
}

function c5v2OperationEffectKey(operation = {}) {
  return sha256Text(stableJson({
    role: 'effect',
    operationId: operation.id || operation.operationId || '',
    family: operation.family || '',
    expectedOutcome: operation.expectedOutcome || '',
    semanticIntent: operation.semanticIntent || null,
  }));
}

function c5v2MasterLedgerResumeAuthorityDigest(ledger = {}, identity = {}) {
  const operations = Array.isArray(ledger.operations) ? ledger.operations : [];
  return sha256Text(stableJson({
    schemaVersion: 'yalken.rtk.word.c5v2.master-ledger-resume-authority.v1',
    exactHead: identity.exactHead || '',
    campaignId: identity.campaignId || '',
    corpusDigest: identity.corpusDigest || '',
    roundCount: ledger.roundCount || 0,
    sceneCount: ledger.sceneCount || 0,
    ledgerDigest: ledger.ledgerDigest || '',
    operationCount: operations.length,
    counts: ledger.counts || {},
    operationIds: operations.map((operation) => operation.id || operation.operationId || ''),
    requestEffectKeys: operations.map((operation) => ({
      operationId: operation.id || operation.operationId || '',
      requestKey: operation.requestKey || '',
      effectKey: operation.effectKey || '',
    })),
  }));
}

function assertExactPathIdentity({ label, actual, expected, failures }) {
  if (!actual || !expected || actual !== expected) failures.push(`${label}:${expected || ''}:${actual || ''}`);
}

function sameStringArray(left, right) {
  return JSON.stringify((Array.isArray(left) ? left : []).map(String))
    === JSON.stringify((Array.isArray(right) ? right : []).map(String));
}

function expectedRoundIds() {
  return Array.from({ length: 5 }, (_, index) => `round-${String(index + 1).padStart(2, '0')}`);
}

function randomToken() {
  return crypto.randomBytes(16).toString('hex');
}

function writeAtomicVerified(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, content, 'utf8');
  const fd = fs.openSync(tempPath, 'r+');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tempPath, filePath);
  const reopened = fs.readFileSync(filePath, 'utf8');
  if (reopened !== content) throw new Error(`ORCH_ATOMIC_PUBLISH_VERIFY_FAILED:${filePath}`);
  return { path: filePath, sha256: sha256Bytes(Buffer.from(content, 'utf8')), bytes: content.length };
}

function writeJsonAtomicVerified(filePath, value) {
  return writeAtomicVerified(filePath, JSON.stringify(value, null, 2) + '\n');
}

function appendJsonl(filePath, record) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf8');
}

function gitValue(repoRoot, args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8', timeout: 15000 });
  if (result.status !== 0) {
    return { ok: false, code: `ORCH_GIT_FAILED:${args.join(' ')}:${String(result.stderr || '').slice(0, 160)}` };
  }
  return { ok: true, value: String(result.stdout || '').trim() };
}

// ---------------------------------------------------------------------------
// Strict CLI
// ---------------------------------------------------------------------------

export function parseOrchestratorArgs(argv = []) {
  const spec = new Map([
    ['--expected-sha', { key: 'expectedSha', value: true }],
    ['--expected-word-version', { key: 'expectedWordVersion', value: true }],
    ['--expected-word-build', { key: 'expectedWordBuild', value: true }],
    ['--expected-corpus-digest', { key: 'expectedCorpusDigest', value: true }],
    ['--corpus-manifest', { key: 'corpusManifestPath', value: true }],
    ['--expected-ledger-digest', { key: 'expectedLedgerDigest', value: true }],
    ['--expected-operation-id-set-digest', { key: 'expectedOperationIdSetDigest', value: true }],
    ['--campaign-profile', { key: 'campaignProfile', value: true }],
    ['--artifact-root', { key: 'artifactRoot', value: true }],
    ['--campaign-id', { key: 'campaignId', value: true }],
    ['--chain-id', { key: 'chainId', value: true }],
    ['--resume', { key: 'resume', value: false }],
    ['--stage-timeout-ms', { key: 'stageTimeoutMs', value: true }],
    ['--progress-timeout-ms', { key: 'progressTimeoutMs', value: true }],
    ['--kill-grace-ms', { key: 'killGraceMs', value: true }],
    ['--preflight-only', { key: 'preflightOnly', value: false }],
  ]);
  const options = {
    expectedSha: '',
    expectedWordVersion: '',
    expectedWordBuild: '',
    expectedCorpusDigest: '',
    corpusManifestPath: '',
    expectedLedgerDigest: '',
    expectedOperationIdSetDigest: '',
    campaignProfile: '',
    artifactRoot: '',
    campaignId: '',
    chainId: '',
    resume: false,
    stageTimeoutMs: 6 * 60 * 60 * 1000,
    progressTimeoutMs: 30 * 60 * 1000,
    killGraceMs: 5000,
    preflightOnly: false,
  };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const entry = spec.get(arg);
    if (!entry) throw new Error(`ORCH_UNKNOWN_ARG:${arg}`);
    if (seen.has(arg)) throw new Error(`ORCH_DUPLICATE_ARG:${arg}`);
    seen.add(arg);
    if (!entry.value) {
      options[entry.key] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || String(value).startsWith('--')) throw new Error(`ORCH_ARG_VALUE_MISSING:${arg}`);
    index += 1;
    options[entry.key] = value;
  }
  for (const [flag, entry] of spec.entries()) {
    if (['--corpus-manifest', '--stage-timeout-ms', '--progress-timeout-ms', '--kill-grace-ms', '--resume', '--preflight-only'].includes(flag)) continue;
    if (!options[entry.key]) throw new Error(`ORCH_ARG_REQUIRED:${flag}`);
  }
  if (!/^[0-9a-f]{40}$/u.test(options.expectedSha)) throw new Error(`ORCH_ARG_INVALID:--expected-sha:${options.expectedSha}`);
  if (!/^\d+\.\d+\.\d+$/u.test(options.expectedWordVersion)) throw new Error(`ORCH_ARG_INVALID:--expected-word-version:${options.expectedWordVersion}`);
  if (!/^\d+\.\d+\.\d+$/u.test(options.expectedWordBuild)) throw new Error(`ORCH_ARG_INVALID:--expected-word-build:${options.expectedWordBuild}`);
  if (!SHA256_DIGEST_RE.test(options.expectedCorpusDigest)) throw new Error(`ORCH_ARG_INVALID:--expected-corpus-digest:${options.expectedCorpusDigest}`);
  if (options.corpusManifestPath && !path.isAbsolute(String(options.corpusManifestPath))) throw new Error(`ORCH_ARG_INVALID:--corpus-manifest:${options.corpusManifestPath}`);
  if (!SHA256_DIGEST_RE.test(options.expectedLedgerDigest)) throw new Error(`ORCH_ARG_INVALID:--expected-ledger-digest:${options.expectedLedgerDigest}`);
  if (!SHA256_DIGEST_RE.test(options.expectedOperationIdSetDigest)) throw new Error(`ORCH_ARG_INVALID:--expected-operation-id-set-digest:${options.expectedOperationIdSetDigest}`);
  if (!IDENTITY_RE.test(options.campaignProfile)) throw new Error(`ORCH_ARG_INVALID:--campaign-profile:${options.campaignProfile}`);
  if (!CHAIN_IDS.includes(options.chainId)) throw new Error(`ORCH_CHAIN_ID_INVALID:${options.chainId}`);
  if (!IDENTITY_RE.test(options.campaignId)) throw new Error(`ORCH_CAMPAIGN_ID_INVALID:${options.campaignId}`);
  for (const key of ['stageTimeoutMs', 'progressTimeoutMs', 'killGraceMs']) {
    const parsed = Number(options[key]);
    if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 24 * 60 * 60 * 1000) {
      throw new Error(`ORCH_ARG_INVALID:--${key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase())}:${options[key]}`);
    }
    options[key] = parsed;
  }
  if (!path.isAbsolute(String(options.artifactRoot || ''))) throw new Error('ORCH_ARG_INVALID:--artifact-root:not-absolute');
  const artifactRoot = path.resolve(options.artifactRoot);
  options.artifactRoot = artifactRoot;
  options.campaignRoot = path.join(artifactRoot, options.campaignId);
  return options;
}

// ---------------------------------------------------------------------------
// Path authority
// ---------------------------------------------------------------------------

export function assertOrchestratorPathAuthority({ artifactRoot, campaignRoot, mustBeAbsent }) {
  // Canonicalize first: on macOS /var is a symlink to /private/var. All
  // comparisons happen in realpath space.
  const canonicalRoot = fs.existsSync(artifactRoot) ? fs.realpathSync(artifactRoot) : path.resolve(artifactRoot);
  const rawCampaign = path.resolve(campaignRoot);
  if (!path.isAbsolute(canonicalRoot) || !path.isAbsolute(rawCampaign)) {
    return { ok: false, code: 'ORCH_PATH_NOT_ABSOLUTE' };
  }
  let cursor = rawCampaign;
  const missingSegments = [];
  while (!fs.existsSync(cursor) && cursor !== canonicalRoot && cursor !== path.parse(cursor).root) {
    missingSegments.push(path.basename(cursor));
    cursor = path.dirname(cursor);
  }
  let canonicalCampaign = rawCampaign;
  if (fs.existsSync(cursor)) {
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) return { ok: false, code: `ORCH_PATH_SYMLINK_COMPONENT:${cursor}` };
    const realCursor = fs.realpathSync(cursor);
    canonicalCampaign = missingSegments.length > 0
      ? path.join(realCursor, ...missingSegments.reverse())
      : realCursor;
  }
  const relative = path.relative(canonicalRoot, canonicalCampaign);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return { ok: false, code: `ORCH_PATH_ESCAPE:${canonicalCampaign}` };
  }
  if (mustBeAbsent && fs.existsSync(canonicalCampaign)) {
    return { ok: false, code: `ORCH_CAMPAIGN_ROOT_COLLISION:${canonicalCampaign}` };
  }
  return { ok: true, code: 'ORCH_PATH_AUTHORITY_VERIFIED', canonicalCampaignRoot: canonicalCampaign };
}

function verifyNoFollowLockRoot({ lockRoot, allowedRoot = '' }) {
  const rawLockRoot = path.resolve(String(lockRoot || ''));
  if (!path.isAbsolute(rawLockRoot)) return { ok: false, code: 'ORCH_LOCK_ROOT_NOT_ABSOLUTE' };
  const allowed = allowedRoot ? (fs.existsSync(allowedRoot) ? fs.realpathSync(allowedRoot) : path.resolve(allowedRoot)) : '';
  let cursorForCanonical = rawLockRoot;
  const missingSegments = [];
  while (!fs.existsSync(cursorForCanonical) && cursorForCanonical !== path.parse(cursorForCanonical).root) {
    missingSegments.push(path.basename(cursorForCanonical));
    cursorForCanonical = path.dirname(cursorForCanonical);
  }
  const canonicalLockRoot = fs.existsSync(cursorForCanonical)
    ? path.join(fs.realpathSync(cursorForCanonical), ...missingSegments.reverse())
    : rawLockRoot;
  if (allowed) {
    const relative = path.relative(allowed, canonicalLockRoot);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      return { ok: false, code: `ORCH_LOCK_ROOT_OUTSIDE_ARTIFACT_ROOT:${canonicalLockRoot}` };
    }
  }
  const root = path.parse(rawLockRoot).root;
  const parts = rawLockRoot.slice(root.length).split(path.sep).filter(Boolean);
  let cursor = root;
  for (const part of parts) {
    cursor = path.join(cursor, part);
    if (!fs.existsSync(cursor)) continue;
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) {
      const realCursor = fs.realpathSync(cursor);
      const macAliasAllowed = (cursor === '/var' && realCursor === '/private/var')
        || (cursor === '/tmp' && realCursor === '/private/tmp');
      if (!macAliasAllowed) return { ok: false, code: `ORCH_LOCK_ROOT_SYMLINK:${cursor}` };
    }
  }
  return { ok: true, code: 'ORCH_LOCK_ROOT_CONFINED', lockRoot: canonicalLockRoot };
}

// ---------------------------------------------------------------------------
// Preflight (re-run before every stage and before chain seal)
// ---------------------------------------------------------------------------

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function extractXmlPlistStringValue(plistText, key) {
  const pattern = new RegExp(`<key>\\s*${escapeRegExp(key)}\\s*<\\/key>\\s*<string>([^<]+)<\\/string>`, 'u');
  return (String(plistText || '').match(pattern) || [])[1] || '';
}

function readWordPlistVersionAndBuild(wordPlistPath) {
  try {
    return {
      wordVersion: String(execFileSync('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', wordPlistPath], { encoding: 'utf8', timeout: 15000 })).trim(),
      wordBuild: String(execFileSync('/usr/bin/plutil', ['-extract', 'CFBundleVersion', 'raw', '-o', '-', wordPlistPath], { encoding: 'utf8', timeout: 15000 })).trim(),
      error: '',
    };
  } catch (error) {
    if (fs.existsSync(wordPlistPath)) {
      try {
        const plistText = fs.readFileSync(wordPlistPath, 'utf8');
        return {
          wordVersion: extractXmlPlistStringValue(plistText, 'CFBundleShortVersionString').trim(),
          wordBuild: extractXmlPlistStringValue(plistText, 'CFBundleVersion').trim(),
          error: '',
        };
      } catch {
        // Fall through to the original fail-closed unavailable error.
      }
    }
    return {
      wordVersion: '',
      wordBuild: '',
      error: String(error && error.message ? error.message : error).slice(0, 120),
    };
  }
}

function parseDiskutilPlistValue(plistText, key) {
  return (String(plistText || '').match(new RegExp(`<key>\\s*${escapeRegExp(key)}\\s*<\\/key>\\s*<string>([^<]+)<\\/string>`, 'u')) || [])[1] || '';
}

function parseDiskutilBool(plistText, key) {
  return new RegExp(`<key>\\s*${escapeRegExp(key)}\\s*<\\/key>\\s*<true\\/>`, 'u').test(String(plistText || ''));
}

function canonicalizeNonSymlinkDescendant(rootRealpath, targetPath, codePrefix) {
  const rawTarget = path.resolve(String(targetPath || ''));
  if (!path.isAbsolute(rawTarget)) return { ok: false, code: `${codePrefix}_NOT_ABSOLUTE` };
  let cursor = rawTarget;
  const missingSegments = [];
  while (!fs.existsSync(cursor) && cursor !== rootRealpath && cursor !== path.parse(cursor).root) {
    missingSegments.push(path.basename(cursor));
    cursor = path.dirname(cursor);
  }
  if (!fs.existsSync(cursor)) return { ok: false, code: `${codePrefix}_NO_EXISTING_PARENT:${rawTarget}` };
  if (fs.lstatSync(cursor).isSymbolicLink()) return { ok: false, code: `${codePrefix}_SYMLINK_COMPONENT:${cursor}` };
  const realCursor = fs.realpathSync(cursor);
  const canonicalTarget = missingSegments.length > 0
    ? path.join(realCursor, ...missingSegments.reverse())
    : realCursor;
  const relative = path.relative(rootRealpath, canonicalTarget);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return { ok: false, code: `${codePrefix}_OUTSIDE_MOUNT:${canonicalTarget}` };
  }
  return { ok: true, canonicalTarget };
}

export function defaultSecureVolumeProbe({
  artifactRoot,
  expectedUuid = SECURE_VOLUME_UUID,
  mountRoot = '/Volumes/T7-Secure',
} = {}) {
  let mountRealpath = '';
  try {
    mountRealpath = fs.realpathSync(mountRoot);
  } catch (error) {
    return { ok: false, code: `ORCH_SECURE_VOLUME_MOUNT_UNAVAILABLE:${mountRoot}:${String(error && error.message ? error.message : error).slice(0, 120)}` };
  }
  const containment = canonicalizeNonSymlinkDescendant(mountRealpath, artifactRoot, 'ORCH_SECURE_VOLUME_ARTIFACT_ROOT');
  if (containment.ok !== true) return { ok: false, code: containment.code, mountRoot, mountRealpath };
  let volumeInfo = '';
  try {
    volumeInfo = execFileSync('diskutil', ['info', '-plist', mountRoot], { encoding: 'utf8', timeout: 20000 });
  } catch (error) {
    return { ok: false, code: `ORCH_SECURE_VOLUME_UNAVAILABLE:${mountRoot}` };
  }
  const uuid = parseDiskutilPlistValue(volumeInfo, 'VolumeUUID');
  const encrypted = parseDiskutilBool(volumeInfo, 'FileVault');
  const apfs = /APFS/u.test(volumeInfo);
  if (uuid !== expectedUuid) return { ok: false, code: `ORCH_SECURE_VOLUME_UUID_MISMATCH:${expectedUuid}:${uuid}` };
  if (!encrypted) return { ok: false, code: 'ORCH_SECURE_VOLUME_NOT_ENCRYPTED' };
  if (!apfs) return { ok: false, code: 'ORCH_SECURE_VOLUME_NOT_APFS' };
  try {
    fs.accessSync(mountRealpath, fs.constants.W_OK);
  } catch {
    return { ok: false, code: 'ORCH_SECURE_VOLUME_NOT_WRITABLE' };
  }
  const df = spawnSync('df', ['-k', mountRoot], { encoding: 'utf8' });
  const availableKb = Number((String(df.stdout || '').trim().split('\n').pop() || '').split(/\s+/u)[3] || 0);
  if (!Number.isFinite(availableKb) || availableKb < 10 * 1024 * 1024) {
    return { ok: false, code: `ORCH_SECURE_VOLUME_LOW_SPACE:${availableKb}` };
  }
  return {
    ok: true,
    code: 'ORCH_SECURE_VOLUME_VERIFIED',
    mountRoot,
    mountRealpath,
    artifactRootCanonical: containment.canonicalTarget,
    uuid,
    apfs,
    encrypted,
    writable: true,
    availableKb,
  };
}

export function runOrchestratorPreflight({
  options,
  scope,
  repoRoot = REPO_ROOT,
  wordPlistPath = '/Applications/Microsoft Word.app/Contents/Info.plist',
  secureVolumeProbe = defaultSecureVolumeProbe,
}) {
  const failures = [];
  const head = gitValue(repoRoot, ['rev-parse', 'HEAD']);
  if (!head.ok) failures.push(head.code);
  else if (head.value !== options.expectedSha) failures.push(`ORCH_EXPECTED_SHA_MISMATCH:${options.expectedSha}:${head.value}`);
  const origin = gitValue(repoRoot, ['rev-parse', 'origin/main']);
  if (!origin.ok) failures.push(origin.code);
  else if (origin.value !== options.expectedSha) failures.push(`ORCH_EXPECTED_ORIGIN_MAIN_MISMATCH:${options.expectedSha}:${origin.value}`);
  const dirty = gitValue(repoRoot, ['status', '--porcelain']);
  if (!dirty.ok) failures.push(dirty.code);
  else if (dirty.value) failures.push(`ORCH_CLEAN_TREE_VIOLATION:${dirty.value.split('\n')[0].slice(0, 120)}`);
  let wordVersion = '';
  let wordBuild = '';
  const plist = readWordPlistVersionAndBuild(wordPlistPath);
  wordVersion = plist.wordVersion;
  wordBuild = plist.wordBuild;
  if (plist.error) failures.push(`ORCH_WORD_PLIST_UNAVAILABLE:${plist.error}`);
  if (wordVersion && wordVersion !== options.expectedWordVersion) failures.push(`ORCH_WORD_VERSION_MISMATCH:${options.expectedWordVersion}:${wordVersion}`);
  if (wordBuild && wordBuild !== options.expectedWordBuild) failures.push(`ORCH_WORD_BUILD_MISMATCH:${options.expectedWordBuild}:${wordBuild}`);
  if (!wordVersion) failures.push('ORCH_WORD_VERSION_UNAVAILABLE');
  if (!wordBuild) failures.push('ORCH_WORD_BUILD_UNAVAILABLE');
  const secureVolume = secureVolumeProbe({
    artifactRoot: options.artifactRoot,
    expectedUuid: SECURE_VOLUME_UUID,
    mountRoot: '/Volumes/T7-Secure',
  });
  if (!secureVolume || secureVolume.ok !== true) failures.push(secureVolume?.code || 'ORCH_SECURE_VOLUME_UNAVAILABLE');
  const scriptHashes = computeCanonicalScriptHashes();
  return {
    ok: failures.length === 0,
    code: failures.length === 0 ? 'ORCH_PREFLIGHT_GREEN' : `ORCH_PREFLIGHT_FAILED:${failures.join('|')}`,
    scope,
    failures,
    checkedAtUtc: nowIso(),
    scriptHashes,
    secureVolume,
  };
}

// ---------------------------------------------------------------------------
// Token lock (atomic mkdir, no auto stale break, token release)
// ---------------------------------------------------------------------------

export function acquireOrchestratorLock({ lockRoot, campaignId, chainId, expectedSha, allowedRoot = '' }) {
  const rootVerification = verifyNoFollowLockRoot({ lockRoot, allowedRoot });
  if (rootVerification.ok !== true) return rootVerification;
  const confinedLockRoot = rootVerification.lockRoot;
  const lockDir = path.join(confinedLockRoot, 'c5v2-word-campaign.lock');
  try {
    fs.mkdirSync(confinedLockRoot, { recursive: true });
    const afterCreate = verifyNoFollowLockRoot({ lockRoot: confinedLockRoot, allowedRoot });
    if (afterCreate.ok !== true) return afterCreate;
    fs.mkdirSync(lockDir);
  } catch (error) {
    if (fs.existsSync(lockDir)) {
      let owner = null;
      try { owner = JSON.parse(fs.readFileSync(path.join(lockDir, 'owner.json'), 'utf8')); } catch { owner = null; }
      if (!owner) return { ok: false, code: `ORCH_LOCK_AMBIGUOUS:${lockDir}` };
      const ownerPid = Number(owner.pid || 0);
      let alive = false;
      if (ownerPid > 0) {
        try { process.kill(ownerPid, 0); alive = true; } catch { alive = false; }
      }
      if (alive) return { ok: false, code: `ORCH_LOCK_HELD:${ownerPid}:${owner.campaignId || 'unknown'}` };
      return { ok: false, code: `ORCH_STALE_LOCK_REQUIRES_EXPLICIT_CLEANUP:${lockDir}:${owner.campaignId || 'unknown'}` };
    }
    return { ok: false, code: `ORCH_LOCK_ACQUIRE_FAILED:${String(error && error.message ? error.message : error).slice(0, 120)}` };
  }
  const ownershipToken = randomToken();
  const owner = {
    schemaVersion: ORCH_SCHEMA,
    pid: process.pid,
    processStartIdentity: `${process.pid}:${nowIso()}`,
    campaignId,
    chainId,
    ownershipToken,
    expectedSha,
    acquiredAtUtc: nowIso(),
  };
  writeJsonAtomicVerified(path.join(lockDir, 'owner.json'), owner);
  return { ok: true, code: 'ORCH_LOCK_ACQUIRED', lockDir, ownershipToken, owner };
}

export function releaseOrchestratorLock({ lockDir, ownershipToken, campaignId, quarantined = false, quarantineReason = '' }) {
  const ownerPath = path.join(lockDir, 'owner.json');
  if (!fs.existsSync(ownerPath)) return { ok: false, code: 'ORCH_LOCK_RELEASE_OWNER_MISSING' };
  let owner = null;
  try { owner = JSON.parse(fs.readFileSync(ownerPath, 'utf8')); } catch { owner = null; }
  if (!owner) return { ok: false, code: 'ORCH_LOCK_RELEASE_OWNER_UNREADABLE' };
  if (owner.ownershipToken !== ownershipToken || owner.campaignId !== campaignId || owner.pid !== process.pid) {
    return { ok: false, code: 'ORCH_LOCK_RELEASE_TOKEN_MISMATCH' };
  }
  if (quarantined) {
    writeJsonAtomicVerified(path.join(lockDir, 'QUARANTINED.json'), {
      schemaVersion: ORCH_SCHEMA,
      reason: quarantineReason,
      campaignId,
      markedAtUtc: nowIso(),
    });
    return { ok: true, code: 'ORCH_LOCK_KEPT_QUARANTINED', released: false };
  }
  fs.rmSync(lockDir, { recursive: true, force: true });
  return { ok: true, code: 'ORCH_LOCK_RELEASED', released: true };
}

export function checkOrchestratorLockAbsence({ lockRoot, allowedRoot = '' }) {
  const rootVerification = verifyNoFollowLockRoot({ lockRoot, allowedRoot });
  if (rootVerification.ok !== true) return rootVerification;
  const lockDir = path.join(rootVerification.lockRoot, 'c5v2-word-campaign.lock');
  if (!fs.existsSync(lockDir)) return { ok: true, code: 'ORCH_LOCK_ABSENT', lockDir };
  let owner = null;
  try { owner = JSON.parse(fs.readFileSync(path.join(lockDir, 'owner.json'), 'utf8')); } catch { owner = null; }
  return {
    ok: false,
    code: owner && owner.pid
      ? `ORCH_LOCK_PRESENT:${owner.pid}:${owner.campaignId || 'unknown'}`
      : `ORCH_LOCK_PRESENT:${lockDir}`,
    lockDir,
  };
}

// ---------------------------------------------------------------------------
// Owned stage process with process-group watchdog
// ---------------------------------------------------------------------------

function listOwnedDescendants(rootPid) {
  const childPids = (parentPid) => {
    const result = spawnSync('pgrep', ['-P', String(parentPid)], { encoding: 'utf8' });
    if (result.status === 0) {
      return String(result.stdout || '').trim().split('\n').filter(Boolean).map(Number);
    }
    const ps = spawnSync('ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8' });
    if (ps.status !== 0) return [];
    return String(ps.stdout || '').split('\n').map((line) => {
      const [pidText, ppidText] = line.trim().split(/\s+/u);
      return { pid: Number(pidText), ppid: Number(ppidText) };
    }).filter((row) => row.ppid === parentPid && Number.isSafeInteger(row.pid)).map((row) => row.pid);
  };
  const direct = childPids(rootPid);
  const all = new Set(direct);
  const queue = [...direct];
  while (queue.length > 0) {
    const parent = queue.shift();
    const children = childPids(parent);
    for (const child of children) {
      if (!all.has(child)) {
        all.add(child);
        queue.push(child);
      }
    }
  }
  return [...all].filter((pid) => Number.isSafeInteger(pid) && pid > 0);
}

function listProcessGroupMembers(pgid) {
  const result = spawnSync('ps', ['-axo', 'pid=,pgid='], { encoding: 'utf8' });
  if (result.status !== 0) return [];
  return String(result.stdout || '').split('\n').map((line) => {
    const [pidText, pgidText] = line.trim().split(/\s+/u);
    return { pid: Number(pidText), pgid: Number(pgidText) };
  }).filter((row) => row.pgid === pgid && Number.isSafeInteger(row.pid) && row.pid > 0).map((row) => row.pid);
}

function processAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function safeRealpathMaybe(targetPath) {
  try {
    return fs.realpathSync(targetPath);
  } catch {
    return '';
  }
}

function isCanonicalDescendantOrSelf(rootPath, candidatePath) {
  const root = safeRealpathMaybe(rootPath);
  const candidate = safeRealpathMaybe(candidatePath);
  if (!root || !candidate) return false;
  const relative = path.relative(root, candidate);
  return relative === '' || (relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function listProcessCwdsFromLsof(root) {
  const result = spawnSync('lsof', ['-n', '-Fpcn', '-a', '-d', 'cwd', '+D', root], { encoding: 'utf8', timeout: 1000 });
  if (result.status !== 0 && !String(result.stdout || '').trim()) return [];
  const rows = [];
  let current = null;
  for (const line of String(result.stdout || '').split('\n')) {
    if (!line) continue;
    const tag = line[0];
    const value = line.slice(1);
    if (tag === 'p') {
      if (current?.pid) rows.push(current);
      current = { pid: Number(value), command: '', cwd: '' };
    } else if (tag === 'c' && current) {
      current.command = value;
    } else if (tag === 'n' && current) {
      current.cwd = value;
    }
  }
  if (current?.pid) rows.push(current);
  return rows;
}

function listProcessCwdsFromProc(root, options = {}) {
  const procRoot = typeof options.procRoot === 'string' && options.procRoot.trim()
    ? options.procRoot.trim()
    : '/proc';
  if (!fs.existsSync(procRoot)) return [];
  let entries;
  try {
    entries = fs.readdirSync(procRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const selfPid = Number.isSafeInteger(options.selfPid) && options.selfPid > 0 ? options.selfPid : process.pid;
  const rows = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/u.test(entry.name)) continue;
    const pid = Number(entry.name);
    if (!Number.isSafeInteger(pid) || pid <= 0 || pid === selfPid) continue;
    const cwdLink = path.join(procRoot, entry.name, 'cwd');
    let cwd;
    try {
      cwd = fs.readlinkSync(cwdLink);
    } catch {
      continue;
    }
    if (!cwd || !isCanonicalDescendantOrSelf(root, cwd)) continue;
    let command = '';
    try {
      command = fs.readFileSync(path.join(procRoot, entry.name, 'comm'), 'utf8').trim();
    } catch {
      command = '';
    }
    rows.push({ pid, command, cwd });
  }
  return rows;
}

export function listProcessCwdsUnder(rootPath, options = {}) {
  if (!rootPath || !fs.existsSync(rootPath)) return [];
  const root = fs.realpathSync(rootPath);
  const rows = [
    ...(options.includeLsof === false ? [] : listProcessCwdsFromLsof(root)),
    ...listProcessCwdsFromProc(root, options),
  ];
  const deduped = new Map();
  for (const row of rows) {
    if (!Number.isSafeInteger(row.pid) || row.pid <= 0 || !row.cwd) continue;
    if (!isCanonicalDescendantOrSelf(root, row.cwd)) continue;
    if (!deduped.has(row.pid)) {
      deduped.set(row.pid, {
        pid: row.pid,
        command: String(row.command || ''),
        cwd: safeRealpathMaybe(row.cwd),
      });
    }
  }
  return [...deduped.values()];
}

export function readProcessIdentity(pid) {
  const parsedPid = Number(pid);
  if (!Number.isSafeInteger(parsedPid) || parsedPid <= 0) return null;
  const result = spawnSync('ps', ['-p', String(parsedPid), '-o', 'pid=', '-o', 'pgid=', '-o', 'lstart=', '-o', 'comm='], { encoding: 'utf8' });
  if (result.status !== 0 || !String(result.stdout || '').trim()) return null;
  const parts = String(result.stdout || '').trim().split(/\s+/u);
  if (parts.length < 8) return null;
  const actualPid = Number(parts[0]);
  const pgid = Number(parts[1]);
  const startIdentity = parts.slice(2, 7).join(' ');
  const executable = parts.slice(7).join(' ');
  if (actualPid !== parsedPid || !Number.isSafeInteger(pgid)) return null;
  return { pid: actualPid, pgid, startIdentity, executable };
}

export function sameProcessIdentity(expectedIdentity, observedIdentity) {
  if (!expectedIdentity || !observedIdentity) return false;
  return Number(expectedIdentity.pid) === Number(observedIdentity.pid)
    && Number(expectedIdentity.pgid) === Number(observedIdentity.pgid)
    && String(expectedIdentity.startIdentity || '') === String(observedIdentity.startIdentity || '')
    && String(expectedIdentity.executable || '') === String(observedIdentity.executable || '');
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForStableProcessIdentity({
  pid,
  requireGroupLeader = false,
  timeoutMs = 1000,
  intervalMs = 20,
  identityProbe = readProcessIdentity,
  aliveProbe = processAlive,
} = {}) {
  const parsedPid = Number(pid);
  if (!Number.isSafeInteger(parsedPid) || parsedPid <= 0) {
    return { ok: false, code: 'ORCH_PROCESS_IDENTITY_PID_INVALID', observedIdentity: null, exited: false };
  }
  const deadline = Date.now() + Math.max(1, Number(timeoutMs) || 1);
  let lastObserved = null;
  while (Date.now() <= deadline) {
    const observed = identityProbe(parsedPid);
    if (observed) {
      lastObserved = observed;
      if (!requireGroupLeader || Number(observed.pgid) === parsedPid) {
        return { ok: true, code: `ORCH_PROCESS_IDENTITY_BOUND:${parsedPid}`, observedIdentity: observed, exited: false };
      }
    } else if (!aliveProbe(parsedPid)) {
      return { ok: false, code: `ORCH_PROCESS_ALREADY_EXITED:${parsedPid}`, observedIdentity: null, exited: true };
    }
    await sleepMs(Math.max(1, Number(intervalMs) || 1));
  }
  return {
    ok: false,
    code: `ORCH_PROCESS_IDENTITY_UNSTABLE:${parsedPid}`,
    observedIdentity: lastObserved,
    exited: !aliveProbe(parsedPid),
  };
}

export function signalOwnedPidIfIdentityMatches({
  pid,
  expectedIdentity,
  signal,
  identityProbe = readProcessIdentity,
  signalFn = (targetPid, targetSignal) => process.kill(targetPid, targetSignal),
}) {
  const observed = identityProbe(pid);
  if (!observed && !processAlive(pid)) {
    return { ok: true, code: `ORCH_PROCESS_ALREADY_EXITED:${pid}` };
  }
  if (!sameProcessIdentity(expectedIdentity, observed)) {
    return {
      ok: false,
      code: `ORCH_PROCESS_IDENTITY_MISMATCH:${pid}`,
      expectedIdentity,
      observedIdentity: observed,
    };
  }
  signalFn(pid, signal);
  return { ok: true, code: `ORCH_PROCESS_SIGNALED:${pid}:${signal}` };
}

export function signalOwnedProcessGroupIfLeaderMatches({
  pgid,
  expectedLeaderIdentity,
  signal,
  identityProbe = readProcessIdentity,
  groupMembersProbe = listProcessGroupMembers,
  signalFn = (target, targetSignal) => process.kill(target, targetSignal),
}) {
  const observed = identityProbe(pgid);
  if (!observed && groupMembersProbe(pgid).length === 0) {
    return { ok: true, code: `ORCH_PROCESS_GROUP_ALREADY_EXITED:${pgid}` };
  }
  if (!sameProcessIdentity(expectedLeaderIdentity, observed)) {
    return {
      ok: false,
      code: `ORCH_PROCESS_GROUP_IDENTITY_MISMATCH:${pgid}`,
      expectedIdentity: expectedLeaderIdentity,
      observedIdentity: observed,
    };
  }
  signalFn(-pgid, signal);
  return { ok: true, code: `ORCH_PROCESS_GROUP_SIGNALED:${pgid}:${signal}` };
}

export async function runOwnedStageProcess({
  stage,
  command,
  args,
  cwd,
  env = {},
  logDir,
  heartbeatPath,
  campaignId,
  chainId,
  stageTimeoutMs,
  progressTimeoutMs,
  killGraceMs,
  control = null,
}) {
  fs.mkdirSync(logDir, { recursive: true });
  const stdoutPath = path.join(logDir, `${stage.toLowerCase()}.stdout.log`);
  const stderrPath = path.join(logDir, `${stage.toLowerCase()}.stderr.log`);
  const stdoutFd = fs.openSync(stdoutPath, 'a');
  const stderrFd = fs.openSync(stderrPath, 'a');
  const startedAt = Date.now();
  const startedAtUtc = nowIso();
  const capturedOwnedPids = new Set();
  const capturedOwnedIdentities = new Map();
  const unregisteredOwnedPids = new Set();
  const identityMismatches = [];
  const result = await new Promise((resolve) => {
    let settled = false;
    let watchdogState = 'STARTING';
    let abortCode = '';
    let abortStartedAt = 0;
    let killSentAt = 0;
    let lastProgressAt = Date.now();
    let lastHeartbeatSequence = 0;
    let lastHeartbeatProgress = -1;
    let lastHeartbeatOperationId = '';
    let heartbeatOffset = 0;
    let watchdogTimer = null;
    let stdoutClosed = false;
    let stderrClosed = false;
    let pendingOutcome = null;
    let stdoutFdOpen = true;
    let stderrFdOpen = true;
    let watchdogStarted = false;
    const closeLogsOnce = () => {
      if (stdoutFdOpen) {
        stdoutFdOpen = false;
        try { fs.closeSync(stdoutFd); } catch { /* noop */ }
      }
      if (stderrFdOpen) {
        stderrFdOpen = false;
        try { fs.closeSync(stderrFd); } catch { /* noop */ }
      }
    };
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    const pgid = child.pid;
    if (control) control.currentPgid = pgid;
    const rememberPid = (pid) => {
      if (!Number.isSafeInteger(pid) || pid <= 0) return;
      capturedOwnedPids.add(pid);
      if (!capturedOwnedIdentities.has(pid)) {
        const identity = readProcessIdentity(pid);
        if (identity) capturedOwnedIdentities.set(pid, identity);
      }
    };
    const captureOwned = () => {
      if (child.pid) rememberPid(child.pid);
      for (const pid of listOwnedDescendants(child.pid)) rememberPid(pid);
      for (const pid of listProcessGroupMembers(pgid)) rememberPid(pid);
    };
    const signalGroup = (signal) => {
      const signaled = signalOwnedProcessGroupIfLeaderMatches({
        pgid,
        expectedLeaderIdentity: capturedOwnedIdentities.get(pgid),
        signal,
      });
      if (signaled.ok !== true) identityMismatches.push(signaled);
      return signaled;
    };
    const signalCapturedPid = (pid, signal) => {
      const signaled = signalOwnedPidIfIdentityMatches({
        pid,
        expectedIdentity: capturedOwnedIdentities.get(pid),
        signal,
      });
      if (signaled.ok !== true) identityMismatches.push(signaled);
      return signaled;
    };
    const signalOwned = (signal) => {
      captureOwned();
      const groupMembers = new Set(listProcessGroupMembers(pgid));
      const groupSignal = (() => {
        try { return signalGroup(signal); } catch { return null; }
      })();
      if (signal === 'SIGTERM' && groupSignal?.ok === true) return;
      for (const pid of capturedOwnedPids) {
        if (groupMembers.has(pid)) continue;
        try { signalCapturedPid(pid, signal); } catch { /* noop */ }
      }
    };
    const capturePidMarkers = (chunk) => {
      const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '');
      for (const match of text.matchAll(/ORCH_OWNED_PID:(\d+)/gu)) {
        rememberPid(Number(match[1]));
      }
    };
    const abortOwnedProcessGroup = (code) => {
      if (abortCode) return;
      abortCode = code;
      abortStartedAt = Date.now();
      watchdogState = 'TERM_SENT';
      signalOwned('SIGTERM');
    };
    if (control) {
      control.abortCurrentStage = (code) => abortOwnedProcessGroup(code);
    }
    const heartbeatProgressValue = (event) => {
      const detail = event && typeof event.detail === 'object' && event.detail ? event.detail : {};
      const candidates = [
        event?.completedCount,
        event?.completedOperationCount,
        event?.completedProbeCount,
        detail.completedCount,
        detail.completedOperationCount,
        detail.completedProbeCount,
        detail.completed,
        detail.completedOperations,
      ];
      for (const candidate of candidates) {
        const value = Number(candidate);
        if (Number.isSafeInteger(value) && value >= 0) return value;
      }
      return null;
    };
    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      if (watchdogTimer) clearInterval(watchdogTimer);
      const drainDeadline = setTimeout(() => {
        if (!stdoutClosed) {
          stdoutClosed = true;
          try { child.stdout.destroy(); } catch { /* noop */ }
        }
        if (!stderrClosed) {
          stderrClosed = true;
          try { child.stderr.destroy(); } catch { /* noop */ }
        }
        maybeResolve();
      }, Math.max(50, Math.min(killGraceMs, 1000)));
      pendingOutcome = {
        stage,
        pid: child.pid,
        pgid,
        startedAtUtc,
        finishedAtUtc: nowIso(),
        durationMs: Date.now() - startedAt,
        stdoutPath,
        stderrPath,
        ...outcome,
      };
      const maybeResolve = () => {
        if (!settled || !pendingOutcome || !stdoutClosed || !stderrClosed) return;
        clearTimeout(drainDeadline);
        closeLogsOnce();
        if (control && control.currentPgid === pgid) control.currentPgid = null;
        if (control && control.abortCurrentStage) delete control.abortCurrentStage;
        resolve(pendingOutcome);
      };
      child.stdout.once('close', () => { stdoutClosed = true; maybeResolve(); });
      child.stderr.once('close', () => { stderrClosed = true; maybeResolve(); });
      if (child.stdout.destroyed || child.stdout.closed) stdoutClosed = true;
      if (child.stderr.destroyed || child.stderr.closed) stderrClosed = true;
      maybeResolve();
    };
    const readHeartbeat = () => {
      if (!heartbeatPath || !fs.existsSync(heartbeatPath)) return;
      const stat = fs.statSync(heartbeatPath);
      if (stat.size <= heartbeatOffset) return;
      const fd = fs.openSync(heartbeatPath, 'r');
      let buffer;
      try {
        buffer = Buffer.alloc(stat.size - heartbeatOffset);
        fs.readSync(fd, buffer, 0, buffer.length, heartbeatOffset);
      } finally {
        fs.closeSync(fd);
      }
      heartbeatOffset = stat.size;
      const lines = buffer.toString('utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        let event = null;
        try { event = JSON.parse(line); } catch { event = null; }
        if (!event || event.schemaVersion !== HEARTBEAT_SCHEMA) continue;
        if (event.campaignId !== campaignId || event.chainId !== chainId || event.stage !== stage) {
          abortOwnedProcessGroup(`ORCH_HEARTBEAT_IDENTITY_MISMATCH:${line.slice(0, 160)}`);
          return;
        }
        const sequence = Number(event.sequence);
        if (!Number.isSafeInteger(sequence) || sequence <= lastHeartbeatSequence) {
          abortOwnedProcessGroup(`ORCH_HEARTBEAT_SEQUENCE_NON_MONOTONIC:${lastHeartbeatSequence}:${sequence}`);
          return;
        }
        lastHeartbeatSequence = sequence;
        const progressValue = heartbeatProgressValue(event);
        if (progressValue === null) continue;
        const detail = event && typeof event.detail === 'object' && event.detail ? event.detail : {};
        const operationId = String(event.lastOperationId || detail.lastOperationId || detail.lastProbeId || '').trim();
        if (!operationId) {
          abortOwnedProcessGroup(`ORCH_HEARTBEAT_PROGRESS_ID_MISSING:${progressValue}`);
          return;
        }
        if (progressValue <= lastHeartbeatProgress) {
          abortOwnedProcessGroup(`ORCH_HEARTBEAT_PROGRESS_NON_MONOTONIC:${lastHeartbeatProgress}:${progressValue}`);
          return;
        }
        if (operationId === lastHeartbeatOperationId) {
          abortOwnedProcessGroup(`ORCH_HEARTBEAT_PROGRESS_ID_DUPLICATE:${operationId}`);
          return;
        }
        lastHeartbeatOperationId = operationId;
        lastHeartbeatProgress = progressValue;
        lastProgressAt = Date.now();
      }
    };
    const startWatchdog = () => {
      if (watchdogStarted) return;
      watchdogStarted = true;
      watchdogTimer = setInterval(() => {
      captureOwned();
      readHeartbeat();
      if (settled) return;
      const now = Date.now();
      if (watchdogState === 'RUNNING') {
        if (now - startedAt > stageTimeoutMs) {
          abortOwnedProcessGroup(`ORCH_STAGE_TIMEOUT:${stage}:${stageTimeoutMs}`);
          return;
        }
        if (now - lastProgressAt > progressTimeoutMs) {
          abortOwnedProcessGroup(`ORCH_PROGRESS_TIMEOUT:${stage}:${progressTimeoutMs}`);
          return;
        }
      } else if (watchdogState === 'TERM_SENT') {
        if (now - abortStartedAt > killGraceMs) {
          watchdogState = 'KILL_SENT';
          killSentAt = now;
          signalOwned('SIGKILL');
        }
      } else if (watchdogState === 'KILL_SENT') {
        const stillAlive = [...capturedOwnedPids].filter(processAlive);
        if (stillAlive.length > 0 && now - killSentAt > killGraceMs) {
          finish({
            ok: false,
            code: `ORCH_OWNED_PROCESSES_UNKILLABLE:${stillAlive.join(',')}`,
            exitCode: null,
            signal: 'SIGKILL',
            quarantined: true,
            survivingDescendants: stillAlive.filter((pid) => pid !== child.pid),
            survivingOwnedPids: stillAlive,
          });
        }
      }
      }, 250);
    };
    child.stdout.on('data', (chunk) => {
      capturePidMarkers(chunk);
      if (stdoutFdOpen) {
        try { fs.writeSync(stdoutFd, chunk); } catch { /* descriptor may be closed after timeout finalization */ }
      }
    });
    child.stderr.on('data', (chunk) => {
      capturePidMarkers(chunk);
      if (stderrFdOpen) {
        try { fs.writeSync(stderrFd, chunk); } catch { /* descriptor may be closed after timeout finalization */ }
      }
    });
    child.on('error', (error) => {
      captureOwned();
      finish({ ok: false, code: `ORCH_CHILD_SPAWN_ERROR:${String(error && error.message ? error.message : error).slice(0, 160)}`, exitCode: null, signal: null });
    });
    child.on('exit', (exitCode, signal) => {
      captureOwned();
      if (abortCode) {
        finish({ ok: false, code: abortCode, exitCode, signal });
        return;
      }
      if (exitCode === 0 && signal === null) {
        finish({ ok: true, code: 'ORCH_STAGE_CHILD_EXIT_ZERO', exitCode, signal });
        return;
      }
      finish({ ok: false, code: `ORCH_CHILD_EXIT_NONZERO:${exitCode}:${signal || 'none'}`, exitCode, signal });
    });
    if (Number.isSafeInteger(child.pid) && child.pid > 0) {
      waitForStableProcessIdentity({
        pid: child.pid,
        requireGroupLeader: true,
        timeoutMs: Math.max(100, Math.min(killGraceMs, 1000)),
        intervalMs: 20,
      }).then((identityResult) => {
        if (settled) return;
        if (identityResult.ok === true) {
          capturedOwnedPids.add(child.pid);
          capturedOwnedIdentities.set(child.pid, identityResult.observedIdentity);
          watchdogState = 'RUNNING';
          lastProgressAt = Date.now();
          captureOwned();
          startWatchdog();
          return;
        }
        if (identityResult.exited === true) {
          watchdogState = 'RUNNING';
          startWatchdog();
          return;
        }
        capturedOwnedPids.add(child.pid);
        abortOwnedProcessGroup(identityResult.code);
        startWatchdog();
      }).catch((error) => {
        if (settled) return;
        capturedOwnedPids.add(child.pid);
        abortOwnedProcessGroup(`ORCH_PROCESS_IDENTITY_BIND_ERROR:${String(error && error.message ? error.message : error).slice(0, 120)}`);
        startWatchdog();
      });
    }
  });
  // Completion requires zero owned descendants, otherwise QUARANTINED.
  // PIDs are captured while the stage root is alive: after the root dies,
  // escapees are re-parented to launchd and invisible to parent-only scans.
  if (path.resolve(cwd || '') !== REPO_ROOT) {
    for (const row of listProcessCwdsUnder(cwd)) {
      if (row.pid !== process.pid) {
        if (!capturedOwnedPids.has(row.pid)) unregisteredOwnedPids.add(row.pid);
        capturedOwnedPids.add(row.pid);
        if (!capturedOwnedIdentities.has(row.pid)) {
          const identity = readProcessIdentity(row.pid);
          if (identity) capturedOwnedIdentities.set(row.pid, identity);
        }
      }
    }
  }
  const waitForOwnedExit = async () => {
    const deadline = Date.now() + killGraceMs;
    while (Date.now() < deadline) {
      const alive = [...capturedOwnedPids].filter(processAlive);
      if (alive.length === 0) return [];
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return [...capturedOwnedPids].filter(processAlive);
  };
  let survivors = await waitForOwnedExit();
  if (survivors.length > 0) {
    for (const pid of survivors) {
      try {
        const inGroup = listProcessGroupMembers(result.pgid).includes(pid);
        if (inGroup) {
          const signaled = signalOwnedProcessGroupIfLeaderMatches({
            pgid: result.pgid,
            expectedLeaderIdentity: capturedOwnedIdentities.get(result.pgid),
            signal: 'SIGTERM',
          });
          if (signaled.ok !== true) identityMismatches.push(signaled);
        }
        else {
          const signaled = signalOwnedPidIfIdentityMatches({ pid, expectedIdentity: capturedOwnedIdentities.get(pid), signal: 'SIGTERM' });
          if (signaled.ok !== true) identityMismatches.push(signaled);
        }
      } catch { /* noop */ }
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(killGraceMs, 500)));
    survivors = [...capturedOwnedPids].filter(processAlive);
  }
  if (survivors.length > 0) {
    for (const pid of survivors) {
      try {
        const inGroup = listProcessGroupMembers(result.pgid).includes(pid);
        if (inGroup) {
          const signaled = signalOwnedProcessGroupIfLeaderMatches({
            pgid: result.pgid,
            expectedLeaderIdentity: capturedOwnedIdentities.get(result.pgid),
            signal: 'SIGKILL',
          });
          if (signaled.ok !== true) identityMismatches.push(signaled);
        }
        else {
          const signaled = signalOwnedPidIfIdentityMatches({ pid, expectedIdentity: capturedOwnedIdentities.get(pid), signal: 'SIGKILL' });
          if (signaled.ok !== true) identityMismatches.push(signaled);
        }
      } catch { /* noop */ }
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(killGraceMs, 500)));
    survivors = [...capturedOwnedPids].filter(processAlive);
  }
  const survivingDescendants = survivors.filter((pid) => pid !== result.pid);
  result.survivingDescendants = survivingDescendants;
  result.survivingOwnedPids = survivors;
  if (unregisteredOwnedPids.size > 0) {
    const unregisteredCode = `ORCH_UNREGISTERED_OWNED_PROCESS_DETECTED:${[...unregisteredOwnedPids].sort((a, b) => a - b).join(',')}`;
    if (result.ok === true) {
      result.ok = false;
      result.code = unregisteredCode;
    } else if (!String(result.code || '').includes('ORCH_UNREGISTERED_OWNED_PROCESS_DETECTED')) {
      result.code = `${result.code}|${unregisteredCode}`;
    }
    result.quarantined = true;
    result.unregisteredOwnedPids = [...unregisteredOwnedPids].sort((a, b) => a - b);
  } else if (identityMismatches.length > 0) {
    result.ok = false;
    result.code = `ORCH_PROCESS_IDENTITY_AMBIGUOUS:${identityMismatches.map((entry) => entry.code).join(',')}`;
    result.quarantined = true;
    result.identityMismatches = identityMismatches;
  } else if (survivors.length > 0) {
    result.ok = false;
    result.code = `ORCH_OWNED_PROCESSES_SURVIVED:${survivors.join(',')}`;
    result.quarantined = true;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Stage result validation (independent parent-side verifier)
// ---------------------------------------------------------------------------

function readJsonForValidation(filePath, failures, code) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    failures.push(`${code}:${String(error && error.message ? error.message : error).slice(0, 120)}`);
    return null;
  }
}

function isCanonicalDescendant(rootPath, candidatePath) {
  const root = fs.existsSync(rootPath) ? fs.realpathSync(rootPath) : path.resolve(rootPath);
  const candidate = fs.realpathSync(candidatePath);
  const relative = path.relative(root, candidate);
  return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function duplicateValues(values) {
  const seen = new Set();
  const dupes = new Set();
  for (const value of values) {
    if (seen.has(value)) dupes.add(value);
    seen.add(value);
  }
  return [...dupes].sort((a, b) => String(a).localeCompare(String(b)));
}

function validateClaimedArtifacts({ claimed, requiredOutputKeys, expectedRoot, failures }) {
  for (const key of requiredOutputKeys) {
    if (!claimed[key] || typeof claimed[key].path !== 'string' || typeof claimed[key].sha256 !== 'string') {
      failures.push(`ORCH_STAGE_RESULT_ARTIFACT_DECL_MISSING:${key}`);
    }
  }
  for (const [key, artifact] of Object.entries(claimed)) {
    if (!artifact || typeof artifact.path !== 'string') continue;
    if (!fs.existsSync(artifact.path)) {
      failures.push(`ORCH_STAGE_RESULT_ARTIFACT_MISSING:${key}:${artifact.path}`);
      continue;
    }
    const stat = fs.lstatSync(artifact.path);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      failures.push(`ORCH_STAGE_RESULT_ARTIFACT_NOT_REGULAR:${key}:${artifact.path}`);
      continue;
    }
    if (expectedRoot && !isCanonicalDescendant(expectedRoot, artifact.path)) {
      failures.push(`ORCH_STAGE_RESULT_ARTIFACT_OUTSIDE_ROOT:${key}:${artifact.path}`);
      continue;
    }
    const actual = sha256File(artifact.path);
    if (actual !== artifact.sha256) failures.push(`ORCH_STAGE_RESULT_HASH_MISMATCH:${key}:${artifact.sha256}:${actual}`);
    if (Number.isSafeInteger(artifact.size) && artifact.size !== fs.statSync(artifact.path).size) {
      failures.push(`ORCH_STAGE_RESULT_SIZE_MISMATCH:${key}`);
    }
  }
}

function validateBoundRegularFile({ label, filePath, expectedRoot, expectedSha256 = '', failures }) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
    failures.push(`${label}_PATH_NOT_ABSOLUTE:${filePath || ''}`);
    return null;
  }
  if (!fs.existsSync(filePath)) {
    failures.push(`${label}_MISSING:${filePath}`);
    return null;
  }
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    failures.push(`${label}_NOT_REGULAR:${filePath}`);
    return null;
  }
  if (expectedRoot && !isCanonicalDescendant(expectedRoot, filePath)) {
    failures.push(`${label}_OUTSIDE_ROOT:${filePath}`);
    return null;
  }
  const actualSha256 = sha256File(filePath);
  if (expectedSha256 && actualSha256 !== expectedSha256) failures.push(`${label}_HASH:${expectedSha256}:${actualSha256}`);
  return { path: filePath, sha256: actualSha256, size: fs.statSync(filePath).size };
}

function readZipCentralDirectory(filePath) {
  const bytes = fs.readFileSync(filePath);
  if (bytes.length < 22 || bytes.readUInt32LE(0) !== 0x04034b50) throw new Error('ZIP_LOCAL_HEADER_MISSING');
  const minEocdOffset = Math.max(0, bytes.length - 22 - 0xffff);
  let eocdOffset = -1;
  for (let offset = bytes.length - 22; offset >= minEocdOffset; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error('ZIP_EOCD_MISSING');
  const entryCount = bytes.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = bytes.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = bytes.readUInt32LE(eocdOffset + 16);
  if (
    entryCount <= 0
    || centralDirectoryOffset <= 0
    || centralDirectorySize <= 0
    || centralDirectoryOffset + centralDirectorySize > bytes.length
  ) throw new Error('ZIP_CENTRAL_DIRECTORY_RANGE');
  const entries = [];
  let offset = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('ZIP_CENTRAL_DIRECTORY_ENTRY');
    }
    const compressionMethod = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const uncompressedSize = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const localHeaderOffset = bytes.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > bytes.length) throw new Error('ZIP_ENTRY_NAME_RANGE');
    const name = bytes.toString('utf8', nameStart, nameEnd);
    if (!name || name.startsWith('/') || name.includes('\\') || name.split('/').some((part) => part === '..')) {
      throw new Error(`ZIP_ENTRY_PATH:${name}`);
    }
    entries.push({ name, compressionMethod, compressedSize, uncompressedSize, localHeaderOffset });
    offset = nameEnd + extraLength + commentLength;
  }
  return { bytes, entries };
}

function readZipEntryContent(zip, entryName) {
  const entry = zip.entries.find((candidate) => candidate.name === entryName);
  if (!entry) throw new Error(`ZIP_ENTRY_MISSING:${entryName}`);
  const { bytes } = zip;
  const offset = entry.localHeaderOffset;
  if (offset + 30 > bytes.length || bytes.readUInt32LE(offset) !== 0x04034b50) {
    throw new Error(`ZIP_LOCAL_ENTRY_HEADER:${entryName}`);
  }
  const nameLength = bytes.readUInt16LE(offset + 26);
  const extraLength = bytes.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataStart < 0 || dataEnd > bytes.length || entry.uncompressedSize > 16 * 1024 * 1024) {
    throw new Error(`ZIP_ENTRY_CONTENT_RANGE:${entryName}`);
  }
  const compressed = bytes.subarray(dataStart, dataEnd);
  if (entry.compressionMethod === 0) return compressed;
  if (entry.compressionMethod === 8) return zlib.inflateRawSync(compressed);
  throw new Error(`ZIP_ENTRY_COMPRESSION_UNSUPPORTED:${entryName}:${entry.compressionMethod}`);
}

function validateDocxPackageArtifact({ label, filePath, expectedRoot, expectedSha256, failures }) {
  const artifact = validateBoundRegularFile({ label, filePath, expectedRoot, expectedSha256, failures });
  if (!artifact) return null;
  try {
    const zip = readZipCentralDirectory(filePath);
    const entryNames = new Set(zip.entries.map((entry) => entry.name));
    for (const requiredEntry of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml']) {
      if (!entryNames.has(requiredEntry)) throw new Error(`DOCX_REQUIRED_ENTRY_MISSING:${requiredEntry}`);
    }
    const contentTypesXml = readZipEntryContent(zip, '[Content_Types].xml').toString('utf8');
    const relsXml = readZipEntryContent(zip, '_rels/.rels').toString('utf8');
    const documentXml = readZipEntryContent(zip, 'word/document.xml').toString('utf8');
    if (!contentTypesXml.includes('wordprocessingml.document.main+xml')) throw new Error('DOCX_CONTENT_TYPES_MAIN_DOCUMENT_MISSING');
    if (!relsXml.includes('officeDocument')) throw new Error('DOCX_RELATIONSHIP_OFFICE_DOCUMENT_MISSING');
    if (!documentXml.includes('<w:document') || !documentXml.includes('<w:body')) throw new Error('DOCX_DOCUMENT_XML_MALFORMED');
    return {
      ...artifact,
      entryCount: zip.entries.length,
      documentXmlSha256: sha256Text(documentXml),
    };
  } catch (error) {
    failures.push(`${label}_DOCX_PACKAGE:${String(error && error.message ? error.message : error).slice(0, 120)}`);
    return null;
  }
}

function parseWordOutputForValidation(output) {
  const lines = String(output || '').split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const scalars = {};
  const ops = [];
  const readbacks = [];
  for (const line of lines) {
    if (line.startsWith('OP|')) {
      const [, id = '', status = ''] = line.split('|');
      ops.push({ id, status });
      continue;
    }
    if (line.startsWith('READBACK|')) {
      const [, id = '', status = '', ...detailParts] = line.split('|');
      readbacks.push({ id, status, detail: detailParts.join('|') });
      continue;
    }
    const separator = line.indexOf('=');
    if (separator > 0) scalars[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return { scalars, ops, readbacks };
}

function recordedOperationStatusGreen({ expectedOutcome, reportedStatus, nativeReadbackStatus }) {
  return (reportedStatus === expectedOutcome && nativeReadbackStatus === expectedOutcome)
    || (expectedOutcome === 'MANUAL' && reportedStatus === 'BLOCKED' && nativeReadbackStatus === 'BLOCKED');
}

function candidateAuthorityTupleDigest(authority = {}) {
  const candidates = Array.isArray(authority?.candidates) ? authority.candidates : [];
  return digestOf(candidates.map((candidate) => ({
    changeId: String(candidate?.changeId || ''),
    sceneId: String(candidate?.sceneId || '').replace(/\\/gu, '/'),
    matchKind: String(candidate?.matchKind || ''),
    quoteSha256: String(candidate?.quoteSha256 || ''),
    replacementSha256: String(candidate?.replacementSha256 || ''),
  })));
}

function validateCompletedRoundDeepProof({
  gate,
  gateJson,
  reuse,
  expectedRoundId,
  roundNumber,
  expectedStageRoot,
  expectedCampaignRoot,
  expectedCorpusDigest,
  result,
  ledgerDigest,
  currentRoundIds,
  cumulativeRoundIds,
  failures,
}) {
  const roundLabel = gate?.roundId || expectedRoundId;
  const currentRoundDigest = arrayDigest(currentRoundIds);
  const cumulativeRoundDigest = arrayDigest(cumulativeRoundIds);
  if (gate?.roundOperationCount !== currentRoundIds.length || gate?.roundOperationIdsDigest !== currentRoundDigest) {
    failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_ROSTER_BINDING:${roundLabel}`);
  }
  if (gate?.cumulativeOperationCount !== cumulativeRoundIds.length || gate?.cumulativeOperationIdsDigest !== cumulativeRoundDigest) {
    failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_CUMULATIVE_BINDING:${roundLabel}`);
  }
  if (
    !sameStringArray(gateJson?.roundOperationIds, currentRoundIds)
    || gateJson?.roundOperationCount !== currentRoundIds.length
    || gateJson?.roundOperationIdsDigest !== currentRoundDigest
  ) failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_ROSTER:${roundLabel}`);
  if (
    !sameStringArray(gateJson?.cumulativeOperationIds, cumulativeRoundIds)
    || gateJson?.cumulativeOperationCount !== cumulativeRoundIds.length
    || gateJson?.cumulativeOperationIdsDigest !== cumulativeRoundDigest
  ) failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_CUMULATIVE_ROSTER:${roundLabel}`);

  const campaignAuthorityRoot = expectedCampaignRoot
    || (path.basename(String(expectedStageRoot || '')) === 'MAIN' ? path.dirname(expectedStageRoot) : expectedStageRoot);
  const bindings = [
    ['ORCH_STAGE_RESULT_ROUND_GATE_ROUND_LEDGER', reuse?.roundLedgerPath, reuse?.roundLedgerSha256, expectedStageRoot],
    ['ORCH_STAGE_RESULT_ROUND_GATE_WORD_OUTPUT', reuse?.wordOutputPath, reuse?.wordOutputSha256, expectedStageRoot],
    ['ORCH_STAGE_RESULT_ROUND_GATE_WORD_VISIBLE_READBACK', reuse?.wordVisibleReadbackPath, reuse?.wordVisibleReadbackSha256, expectedStageRoot],
    ['ORCH_STAGE_RESULT_ROUND_GATE_COMPLETE_ORACLE', reuse?.completeRoundOraclePath, reuse?.completeRoundOracleSha256, expectedStageRoot],
    ['ORCH_STAGE_RESULT_ROUND_GATE_READY', reuse?.returnedReadyPath, reuse?.returnedReadySha256, expectedStageRoot],
    ['ORCH_STAGE_RESULT_ROUND_GATE_PRODUCT_BASELINE', reuse?.productBaselinePath, reuse?.productBaselineSha256, expectedStageRoot],
    ['ORCH_STAGE_RESULT_ROUND_GATE_RETURN_APPLY', reuse?.returnApplyPath, reuse?.returnApplySha256, expectedStageRoot],
    ['ORCH_STAGE_RESULT_ROUND_GATE_NATIVE_LIFECYCLE', reuse?.nativeLifecycleVerificationPath, reuse?.nativeLifecycleVerificationSha256, expectedStageRoot],
    ['ORCH_STAGE_RESULT_ROUND_GATE_SOURCE_DOCX', reuse?.sourceDocxPath, reuse?.sourceDocxSha256, expectedStageRoot],
    ['ORCH_STAGE_RESULT_ROUND_GATE_RETURNED_DOCX', reuse?.returnedDocxPath, reuse?.returnedDocxSha256, expectedStageRoot],
    ['ORCH_STAGE_RESULT_ROUND_GATE_YALKEN_TRUTH', reuse?.yalkenTruthPath, reuse?.yalkenTruthSha256, expectedStageRoot],
    ['ORCH_STAGE_RESULT_ROUND_GATE_CANDIDATE_AUTHORITY', reuse?.returnApplyCandidateAuthorityPath, reuse?.returnApplyCandidateAuthoritySha256, expectedStageRoot],
    ['ORCH_STAGE_RESULT_ROUND_GATE_CANDIDATE_AUTHORITY_ANCHOR', reuse?.returnApplyCandidateAuthorityAnchorPath, reuse?.returnApplyCandidateAuthorityAnchorSha256, campaignAuthorityRoot],
  ];
  const boundFiles = new Map();
  for (const [label, filePath, expectedSha256, expectedRoot] of bindings) {
    const artifact = label.endsWith('_DOCX')
      ? validateDocxPackageArtifact({ label, filePath, expectedRoot, expectedSha256, failures })
      : validateBoundRegularFile({ label, filePath, expectedRoot, expectedSha256, failures });
    if (artifact) boundFiles.set(label, artifact);
  }
  for (const [label, filePath] of [
    ['ORCH_STAGE_RESULT_ROUND_GATE_SOURCE_DOCX', reuse?.sourceDocxPath],
    ['ORCH_STAGE_RESULT_ROUND_GATE_RETURNED_DOCX', reuse?.returnedDocxPath],
  ]) {
    const artifact = boundFiles.get(label);
    if (!artifact) continue;
    try {
      const summary = canaryPackageSummary(filePath);
      if (
        summary?.zipOk !== true
        || !Array.isArray(summary?.entries)
        || !summary.entries.includes('[Content_Types].xml')
        || !summary.entries.includes('_rels/.rels')
        || !summary.entries.includes('word/document.xml')
        || summary.documentXmlSha256 !== artifact.documentXmlSha256
      ) failures.push(`${label}_CANARY_PACKAGE_SUMMARY:${roundLabel}`);
    } catch (error) {
      failures.push(`${label}_CANARY_PACKAGE_SUMMARY_ERROR:${roundLabel}:${String(error?.message || error).slice(0, 120)}`);
    }
  }
  if (!boundFiles.has('ORCH_STAGE_RESULT_ROUND_GATE_ROUND_LEDGER')) return;
  const roundLedger = readJsonForValidation(reuse.roundLedgerPath, failures, 'ORCH_STAGE_RESULT_ROUND_GATE_ROUND_LEDGER_JSON');
  const roundOperations = Array.isArray(roundLedger?.operations) ? roundLedger.operations : [];
  const roundOperationIds = roundOperations.map((operation) => String(operation?.id || operation?.operationId || ''));
  if (roundLedger?.schemaVersion !== 'yalken.rtk.word.c5v2.physical-master-round-ledger.v1') {
    failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_ROUND_LEDGER_SCHEMA:${roundLabel}:${roundLedger?.schemaVersion}`);
  }
  if (roundLedger?.roundNumber !== roundNumber || roundLedger?.masterLedgerDigest !== ledgerDigest) {
    failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_ROUND_LEDGER_BINDING:${roundLabel}`);
  }
  if (!sameStringArray(roundOperationIds, currentRoundIds)) failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_ROUND_LEDGER_IDS:${roundLabel}`);
  if (roundLedgerReuseDigest(roundLedger) !== reuse.ledgerContentDigest) failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_ROUND_LEDGER_DIGEST:${roundLabel}`);

  const wordOutput = fs.existsSync(reuse.wordOutputPath || '') ? fs.readFileSync(reuse.wordOutputPath, 'utf8') : '';
  const parsedWord = parseWordOutputForValidation(wordOutput);
  const opById = new Map(parsedWord.ops.map((entry) => [entry.id, entry.status]));
  const readbackById = new Map(parsedWord.readbacks.map((entry) => [entry.id, entry.status]));
  if (
    parsedWord.scalars.WORD_STATUS !== 'PASS'
    || parsedWord.ops.length !== currentRoundIds.length
    || parsedWord.readbacks.length !== currentRoundIds.length
    || opById.size !== currentRoundIds.length
    || readbackById.size !== currentRoundIds.length
  ) failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_WORD_OUTPUT_SEMANTICS:${roundLabel}`);

  const returnApply = readJsonForValidation(reuse.returnApplyPath, failures, 'ORCH_STAGE_RESULT_ROUND_GATE_RETURN_APPLY_JSON');
  const persistedNativeLifecycle = readJsonForValidation(reuse.nativeLifecycleVerificationPath, failures, 'ORCH_STAGE_RESULT_ROUND_GATE_NATIVE_LIFECYCLE_JSON');
  let canonicalNativeLifecycle = null;
  try {
    canonicalNativeLifecycle = readNativeLifecycleSnapshots({ ledger: roundLedger, returnedPath: reuse.returnedDocxPath });
    if (!stableJsonEqual(persistedNativeLifecycle, canonicalNativeLifecycle)) {
      failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_NATIVE_LIFECYCLE_RECOMPUTE:${roundLabel}`);
    }
  } catch (error) {
    failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_NATIVE_LIFECYCLE_RECOMPUTE_ERROR:${roundLabel}:${String(error?.message || error).slice(0, 120)}`);
  }

  const oracle = readJsonForValidation(reuse.completeRoundOraclePath, failures, 'ORCH_STAGE_RESULT_ROUND_GATE_ORACLE_JSON');
  const oracleResults = Array.isArray(oracle?.operationResults) ? oracle.operationResults : [];
  const oracleById = new Map(oracleResults.map((entry) => [String(entry?.operationId || ''), entry]));
  const semanticOracleDigest = SHA256_DIGEST_RE.test(String(oracle?.semanticOracle?.oracleDigest || ''))
    ? oracle.semanticOracle.oracleDigest
    : digestOf(oracle?.semanticOracle || {});
  if (
    oracle?.schemaVersion !== 'yalken.rtk.word.c5v2.complete-round-oracle.v1'
    || oracle?.ok !== true
    || oracle?.operationCount !== currentRoundIds.length
    || oracle?.wordStatusCount !== currentRoundIds.length
    || oracle?.nativeWordReadbackCount !== currentRoundIds.length
    || oracle?.duplicateWordStatuses !== false
    || oracle?.duplicateNativeReadbacks !== false
    || oracle?.semanticOracle?.ok !== true
    || oracleResults.length !== currentRoundIds.length
    || oracleById.size !== currentRoundIds.length
    || oracle?.oracleDigest !== digestOf(oracleResults)
    || gateJson?.oracleDigest !== oracle?.oracleDigest
    || gateJson?.semanticOracleDigest !== semanticOracleDigest
  ) failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_ORACLE_SEMANTICS:${roundLabel}`);
  if (canonicalNativeLifecycle) {
    try {
      const canaryWordParsed = applyNativeLifecycleVerification(
        parseCanaryWordOutput(wordOutput),
        canonicalNativeLifecycle,
      );
      const recomputedOracle = buildOracleProbe({
        ledger: roundLedger,
        wordParsed: canaryWordParsed,
        returnedDocxPath: reuse.returnedDocxPath,
        wordVisibleReadbackPath: reuse.wordVisibleReadbackPath,
        baselineArtifactPath: reuse.productBaselinePath,
        yalkenTruthPath: reuse.yalkenTruthPath,
        returnApply,
      });
      if (!stableJsonEqual(oracle, recomputedOracle)) {
        failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_ORACLE_RECOMPUTE:${roundLabel}`);
      }
      if (
        recomputedOracle?.ok !== true
        || recomputedOracle?.oracleDigest !== oracle?.oracleDigest
        || !stableJsonEqual(recomputedOracle?.operationResults, oracleResults)
        || !stableJsonEqual(recomputedOracle?.semanticOracle, oracle?.semanticOracle)
      ) {
        failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_ORACLE_RECOMPUTE_SEMANTICS:${roundLabel}`);
      }
    } catch (error) {
      failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_ORACLE_RECOMPUTE_ERROR:${roundLabel}:${String(error?.message || error).slice(0, 120)}`);
    }
  }
  for (const operation of roundOperations) {
    const id = String(operation?.id || operation?.operationId || '');
    const expectedOutcome = String(operation?.expectedOutcome || '');
    const reportedStatus = opById.get(id) || '';
    const nativeReadbackStatus = readbackById.get(id) || '';
    const oracleRow = oracleById.get(id);
    if (!recordedOperationStatusGreen({ expectedOutcome, reportedStatus, nativeReadbackStatus })) {
      failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_WORD_STATUS:${roundLabel}:${id}`);
    }
    if (
      !oracleRow
      || oracleRow.expectedOutcome !== expectedOutcome
      || oracleRow.reportedStatus !== reportedStatus
      || oracleRow.nativeReadbackStatus !== nativeReadbackStatus
      || oracleRow.wordGreen !== true
      || oracleRow.yalkenGreen !== true
    ) failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_ORACLE_ROW:${roundLabel}:${id}`);
  }

  const ready = readJsonForValidation(reuse.returnedReadyPath, failures, 'ORCH_STAGE_RESULT_ROUND_GATE_READY_JSON');
  if (ready?.ready !== true || ready?.roundId !== expectedRoundId || ready?.returnedSha256 !== reuse.returnedDocxSha256) {
    failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_READY_SEMANTICS:${roundLabel}`);
  }
  const truth = readJsonForValidation(reuse.yalkenTruthPath, failures, 'ORCH_STAGE_RESULT_ROUND_GATE_TRUTH_JSON');
  if (
    returnApply?.yalkenTruthArtifact?.path !== reuse.yalkenTruthPath
    || returnApply?.yalkenTruthArtifact?.sha256 !== reuse.yalkenTruthSha256
  ) failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_RETURN_APPLY_TRUTH_BINDING:${roundLabel}`);
  const truthSceneIds = new Set((Array.isArray(truth?.sceneReadback) ? truth.sceneReadback : []).map((scene) => String(scene?.sceneId || '').replace(/\\/gu, '/')));
  if (
    truth?.schemaVersion !== 'yalken.rtk.word.c5v2.reopened-yalken-truth.v1'
    || truth?.roundId !== expectedRoundId
    || truth?.sourceKind !== 'reopened-yalken-project'
    || truth?.reopenPassCount !== 2
    || !Array.isArray(truth?.passes)
    || truth.passes.length !== 2
    || !truth.passes.every((pass) => Array.isArray(pass?.scenes) && pass.scenes.every((scene) => scene?.ok === true))
    || roundOperations.some((operation) => !truthSceneIds.has(String(operation?.sceneId || '').replace(/\\/gu, '/')))
  ) failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_TRUTH_SEMANTICS:${roundLabel}`);

  const candidateAuthority = readJsonForValidation(reuse.returnApplyCandidateAuthorityPath, failures, 'ORCH_STAGE_RESULT_ROUND_GATE_CANDIDATE_AUTHORITY_JSON');
  const recomputedCandidateAuthority = buildC5V2ReturnApplyCandidateAuthority({
    roundId: expectedRoundId,
    returnApply,
  });
  if (!stableJsonEqual(candidateAuthority, recomputedCandidateAuthority)) {
    failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_CANDIDATE_AUTHORITY_RECOMPUTE:${roundLabel}`);
  }
  const candidateAuthorityValidation = validateC5V2ReturnApplyCandidateAuthority(candidateAuthority, {
    roundId: expectedRoundId,
    ledger: roundLedger,
  });
  if (candidateAuthorityValidation.ok !== true) {
    failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_CANDIDATE_AUTHORITY_CANARY:${roundLabel}:${candidateAuthorityValidation.failures.join(',')}`);
  }
  const candidateBody = candidateAuthority && typeof candidateAuthority === 'object' ? { ...candidateAuthority } : {};
  const candidateContentDigest = candidateBody.contentDigest || '';
  delete candidateBody.contentDigest;
  if (
    candidateAuthority?.schemaVersion !== 'yalken.rtk.word.c5v2.return-apply-candidate-authority.v1'
    || candidateAuthority?.roundId !== expectedRoundId
    || candidateAuthority?.source !== 'returnApply.activation.textChangeScopeDiagnostics'
    || candidateAuthority?.candidateCount !== (Array.isArray(candidateAuthority?.candidates) ? candidateAuthority.candidates.length : -1)
    || candidateContentDigest !== digestOf(candidateBody)
    || candidateContentDigest !== reuse.returnApplyCandidateAuthorityContentDigest
  ) failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_CANDIDATE_AUTHORITY_SEMANTICS:${roundLabel}`);

  const anchor = readJsonForValidation(reuse.returnApplyCandidateAuthorityAnchorPath, failures, 'ORCH_STAGE_RESULT_ROUND_GATE_CANDIDATE_AUTHORITY_ANCHOR_JSON');
  const anchorAuthorityRoot = path.basename(path.dirname(String(reuse.returnApplyCandidateAuthorityAnchorPath || ''))) === 'anchors'
    ? path.dirname(path.dirname(reuse.returnApplyCandidateAuthorityAnchorPath))
    : '';
  if (anchorAuthorityRoot) {
    const canaryAnchorValidation = validateC5V2ReturnApplyCandidateAuthorityAnchor({
      authorityRoot: anchorAuthorityRoot,
      campaignId: result.campaignId,
      roundId: expectedRoundId,
      exactHead: result.headSha,
      corpusDigest: expectedCorpusDigest,
      ledger: roundLedger,
      candidateAuthority,
      candidateAuthorityPath: reuse.returnApplyCandidateAuthorityPath,
    });
    if (canaryAnchorValidation.ok !== true) {
      failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_CANDIDATE_AUTHORITY_ANCHOR_CANARY:${roundLabel}:${canaryAnchorValidation.failures.join(',')}`);
    }
  } else {
    failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_CANDIDATE_AUTHORITY_ANCHOR_ROOT:${roundLabel}`);
  }
  const anchorBody = anchor && typeof anchor === 'object' ? { ...anchor } : {};
  const declaredAnchorDigest = anchorBody.anchorDigest || '';
  delete anchorBody.anchorDigest;
  if (
    anchor?.schemaVersion !== 'yalken.rtk.word.c5v2.return-apply-candidate-authority-anchor.v2'
    || anchor?.campaignId !== result.campaignId
    || anchor?.roundId !== expectedRoundId
    || anchor?.exactHead !== result.headSha
    || anchor?.corpusDigest !== expectedCorpusDigest
    || anchor?.ledgerContentDigest !== reuse.ledgerContentDigest
    || anchor?.candidateAuthoritySha256 !== reuse.returnApplyCandidateAuthoritySha256
    || anchor?.candidateAuthorityContentDigest !== candidateContentDigest
    || anchor?.candidateTupleDigest !== candidateAuthorityTupleDigest(candidateAuthority)
    || anchor?.candidateCount !== candidateAuthority?.candidateCount
    || declaredAnchorDigest !== digestOf(anchorBody)
    || declaredAnchorDigest !== reuse.returnApplyCandidateAuthorityAnchorDigest
    || anchor?.keyId !== reuse.returnApplyCandidateAuthorityAnchorKeyId
  ) failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_CANDIDATE_AUTHORITY_ANCHOR_SEMANTICS:${roundLabel}`);
}

function validatePositiveStageSemantics({
  result,
  claimed,
  counters,
  expectedCampaignRoot,
  expectedStageRoot,
  expectedCorpusDigest,
  expectedLedgerDigest,
  expectedOperationIdSetDigest,
  failures,
}) {
  const proof = { ledgerDigest: '', operationIdSetDigest: '', negativeProbeIds: [], negativeProbeOperations: [], roundInventoryDigest: '' };
  const ledger = claimed.ledger?.path ? readJsonForValidation(claimed.ledger.path, failures, 'ORCH_STAGE_RESULT_LEDGER_MALFORMED') : null;
  const operations = Array.isArray(ledger?.operations) ? ledger.operations : [];
  const ids = operations.map((operation) => String(operation?.id || operation?.operationId || ''));
  const positiveOps = operations.filter((operation) => operation?.family !== 'negative_probe');
  const negativeOps = operations.filter((operation) => operation?.family === 'negative_probe');
  const sceneIds = new Set(operations.map((operation) => String(operation?.sceneId || '')).filter(Boolean));
  const duplicates = duplicateValues(ids);
  if (!SHA256_DIGEST_RE.test(String(expectedCorpusDigest || ''))) failures.push('ORCH_STAGE_RESULT_EXPECTED_CORPUS_DIGEST_MISSING');
  if (!SHA256_DIGEST_RE.test(String(expectedLedgerDigest || ''))) failures.push('ORCH_STAGE_RESULT_EXPECTED_LEDGER_DIGEST_MISSING');
  if (!SHA256_DIGEST_RE.test(String(expectedOperationIdSetDigest || ''))) failures.push('ORCH_STAGE_RESULT_EXPECTED_OPERATION_ID_SET_DIGEST_MISSING');
  if (result.stageData?.corpusDigest !== expectedCorpusDigest) failures.push(`ORCH_STAGE_RESULT_CORPUS_DIGEST_MISMATCH:${expectedCorpusDigest}:${result.stageData?.corpusDigest}`);
  if (ledger?.schemaVersion !== C5V2_LEDGER_SCHEMA) failures.push(`ORCH_STAGE_RESULT_LEDGER_SCHEMA:${ledger?.schemaVersion}`);
  if (ledger?.topology !== 'one-full-manuscript-project-cumulative-rounds') failures.push(`ORCH_STAGE_RESULT_LEDGER_TOPOLOGY:${ledger?.topology}`);
  if (ledger?.roundCount !== 5) failures.push(`ORCH_STAGE_RESULT_LEDGER_ROUND_COUNT:${ledger?.roundCount}`);
  if (ledger?.sceneCount !== 21) failures.push(`ORCH_STAGE_RESULT_LEDGER_SCENE_COUNT:${ledger?.sceneCount}`);
  if (ledger?.gates?.ok !== true || !Array.isArray(ledger?.gates?.failures) || ledger.gates.failures.length !== 0) {
    failures.push('ORCH_STAGE_RESULT_LEDGER_GATES_NOT_GREEN');
  }
  if (operations.length !== 2000) failures.push(`ORCH_STAGE_RESULT_POSITIVE_LEDGER_COUNT:${operations.length}`);
  if (positiveOps.length !== 1960 || negativeOps.length !== 40) failures.push(`ORCH_STAGE_RESULT_POSITIVE_LEDGER_SPLIT:${positiveOps.length}:${negativeOps.length}`);
  if (sceneIds.size !== 21) failures.push(`ORCH_STAGE_RESULT_POSITIVE_SCENE_COUNT:${sceneIds.size}`);
  if (duplicates.length > 0) failures.push(`ORCH_STAGE_RESULT_DUPLICATE_OPERATION_IDS:${duplicates.slice(0, 5).join(',')}`);
  assertExactPathIdentity({
    label: 'ORCH_STAGE_RESULT_LEDGER_PATH_IDENTITY',
    actual: result.stageData?.ledgerPath,
    expected: claimed.ledger?.path,
    failures,
  });
  assertExactPathIdentity({
    label: 'ORCH_STAGE_RESULT_MAIN_RUN_DIR_IDENTITY',
    actual: result.stageData?.mainRunDir,
    expected: expectedStageRoot,
    failures,
  });
  for (const [family, expectedCount] of Object.entries(DEFAULT_C5V2_LEDGER_COUNTS)) {
    const actual = operations.filter((operation) => operation?.family === family).length;
    const declared = ledger?.counts?.[family];
    if (actual !== expectedCount || declared !== expectedCount) {
      failures.push(`ORCH_STAGE_RESULT_LEDGER_FAMILY_COUNT:${family}:${declared}:${actual}:${expectedCount}`);
    }
  }
  for (const operation of operations) {
    const id = String(operation?.id || operation?.operationId || '');
    if (!id) failures.push('ORCH_STAGE_RESULT_OPERATION_ID_MISSING');
    if (operation?.family === 'negative_probe') {
      if (operation?.round !== 0) failures.push(`ORCH_STAGE_RESULT_NEGATIVE_ROUND_INVALID:${id}:${operation?.round}`);
    } else if (!Number.isInteger(operation?.round) || operation.round < 1 || operation.round > 5) {
      failures.push(`ORCH_STAGE_RESULT_POSITIVE_ROUND_INVALID:${id}:${operation?.round}`);
    }
    if (!operation?.sceneId) failures.push(`ORCH_STAGE_RESULT_OPERATION_SCENE_MISSING:${id}`);
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_C5V2_LEDGER_COUNTS, operation?.family)) {
      failures.push(`ORCH_STAGE_RESULT_OPERATION_FAMILY_INVALID:${id}:${operation?.family}`);
    }
    if (operation?.requestKey !== c5v2OperationRequestKey(operation)) failures.push(`ORCH_STAGE_RESULT_OPERATION_REQUEST_KEY:${id}`);
    if (operation?.effectKey !== c5v2OperationEffectKey(operation)) failures.push(`ORCH_STAGE_RESULT_OPERATION_EFFECT_KEY:${id}`);
  }
  const ledgerDigest = ledgerDigestForOperations(operations);
  const operationIdSetDigest = operationIdSetDigestForOperations(operations);
  proof.ledgerDigest = ledgerDigest;
  proof.operationIdSetDigest = operationIdSetDigest;
  proof.negativeProbeIds = negativeOps.map((operation) => String(operation?.id || operation?.operationId || ''));
  proof.negativeProbeOperations = negativeOps.map((operation) => ({
    id: String(operation?.id || operation?.operationId || ''),
    sceneId: String(operation?.sceneId || ''),
    family: String(operation?.family || ''),
    round: operation?.round,
    expectedOutcome: String(operation?.expectedOutcome || ''),
    semanticIntent: operation?.semanticIntent || null,
    requestKey: String(operation?.requestKey || ''),
    effectKey: String(operation?.effectKey || ''),
  }));
  if (!SHA256_DIGEST_RE.test(String(result.stageData?.ledgerDigest || ''))) failures.push('ORCH_STAGE_RESULT_LEDGER_DIGEST_MISSING');
  if (!SHA256_DIGEST_RE.test(String(result.stageData?.operationIdSetDigest || ''))) failures.push('ORCH_STAGE_RESULT_OPERATION_ID_SET_DIGEST_MISSING');
  if (ledger?.ledgerDigest !== ledgerDigest) failures.push(`ORCH_STAGE_RESULT_LEDGER_DIGEST_STALE:${ledger?.ledgerDigest}:${ledgerDigest}`);
  if (result.stageData?.ledgerDigest !== ledgerDigest) failures.push(`ORCH_STAGE_RESULT_LEDGER_DIGEST_MISMATCH:${result.stageData?.ledgerDigest}:${ledgerDigest}`);
  if (ledgerDigest !== expectedLedgerDigest) failures.push(`ORCH_STAGE_RESULT_LEDGER_DIGEST_EXPECTED_MISMATCH:${expectedLedgerDigest}:${ledgerDigest}`);
  const expectedAuthorityDigest = c5v2MasterLedgerResumeAuthorityDigest(ledger || {}, {
    exactHead: result.headSha,
    campaignId: result.campaignId,
    corpusDigest: expectedCorpusDigest,
  });
  if (ledger?.resumeAuthority?.schemaVersion !== 'yalken.rtk.word.c5v2.master-ledger-resume-authority.v1') {
    failures.push(`ORCH_STAGE_RESULT_LEDGER_RESUME_AUTHORITY_SCHEMA:${ledger?.resumeAuthority?.schemaVersion}`);
  }
  if (
    ledger?.resumeAuthority?.exactHead !== result.headSha
    || ledger?.resumeAuthority?.campaignId !== result.campaignId
    || ledger?.resumeAuthority?.corpusDigest !== expectedCorpusDigest
  ) failures.push('ORCH_STAGE_RESULT_LEDGER_RESUME_AUTHORITY_IDENTITY');
  if (ledger?.resumeAuthority?.digest !== expectedAuthorityDigest) failures.push(`ORCH_STAGE_RESULT_LEDGER_RESUME_AUTHORITY_DIGEST:${ledger?.resumeAuthority?.digest}:${expectedAuthorityDigest}`);
  if (result.stageData?.operationIdSetDigest !== operationIdSetDigest) {
    failures.push(`ORCH_STAGE_RESULT_OPERATION_ID_SET_DIGEST_MISMATCH:${result.stageData.operationIdSetDigest}:${operationIdSetDigest}`);
  }
  if (operationIdSetDigest !== expectedOperationIdSetDigest) failures.push(`ORCH_STAGE_RESULT_OPERATION_ID_SET_EXPECTED_MISMATCH:${expectedOperationIdSetDigest}:${operationIdSetDigest}`);
  if (Number(counters.operationCount) !== 2000 || Number(counters.positiveOperationCount ?? positiveOps.length) !== 1960 || Number(counters.negativeOperationCount ?? negativeOps.length) !== 40) {
    failures.push(`ORCH_STAGE_RESULT_POSITIVE_COUNTERS:${counters.operationCount}:${counters.positiveOperationCount}:${counters.negativeOperationCount}`);
  }
  if (Number(counters.sceneCount ?? sceneIds.size) !== 21 || Number(counters.roundGateCount ?? 5) !== 5 || counters.roundGreen !== true) {
    failures.push(`ORCH_STAGE_RESULT_POSITIVE_GATES:${counters.sceneCount}:${counters.roundGateCount}:${counters.roundGreen}`);
  }
  const gates = claimed.roundGates?.path ? readJsonForValidation(claimed.roundGates.path, failures, 'ORCH_STAGE_RESULT_ROUND_GATES_MALFORMED') : null;
  const gateRows = Array.isArray(gates?.gates) ? gates.gates : [];
  if (gates?.schemaVersion !== 'yalken.rtk.word.c5v2.orchestrated-round-gates-manifest.v1') failures.push(`ORCH_STAGE_RESULT_ROUND_GATES_SCHEMA:${gates?.schemaVersion}`);
  if (gates?.campaignId !== result.campaignId || gates?.chainId !== result.chainId) failures.push('ORCH_STAGE_RESULT_ROUND_GATES_IDENTITY');
  if (expectedStageRoot && gates?.runDir !== expectedStageRoot) failures.push(`ORCH_STAGE_RESULT_ROUND_GATES_RUN_DIR:${gates?.runDir}`);
  if (gateRows.length !== 5) failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_COUNT:${gateRows.length}`);
  const seenGatePaths = new Set();
  const seenGateRounds = new Set();
  const roundIds = expectedRoundIds();
  for (let index = 0; index < gateRows.length; index += 1) {
    const gate = gateRows[index];
    const expectedRoundId = roundIds[index];
    if (gate?.roundId !== expectedRoundId) failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_ROSTER:${index + 1}:${gate?.roundId}:${expectedRoundId}`);
    if (seenGateRounds.has(gate?.roundId)) failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_DUPLICATE_ROUND:${gate?.roundId}`);
    seenGateRounds.add(gate?.roundId);
    if (seenGatePaths.has(gate?.path)) failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_DUPLICATE_PATH:${gate?.path}`);
    seenGatePaths.add(gate?.path);
    if (!gate?.path || !gate?.sha256 || !fs.existsSync(gate.path)) {
      failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_MISSING:${gate?.roundId || ''}`);
      continue;
    }
    const gateStat = fs.lstatSync(gate.path);
    if (gateStat.isSymbolicLink() || !gateStat.isFile() || (expectedStageRoot && !isCanonicalDescendant(expectedStageRoot, gate.path))) {
      failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_PATH_INVALID:${gate.roundId || ''}`);
      continue;
    }
    if (sha256File(gate.path) !== gate.sha256) failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_HASH_MISMATCH:${gate.roundId || ''}`);
    const gateJson = readJsonForValidation(gate.path, failures, 'ORCH_STAGE_RESULT_ROUND_GATE_JSON_INVALID');
    if (gateJson?.schemaVersion !== 'yalken.rtk.word.c5v2.complete-round-oracle-gate.v2') failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_SCHEMA:${gate.roundId || ''}:${gateJson?.schemaVersion}`);
    if (gateJson?.roundId !== expectedRoundId) failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_IDENTITY:${gate.roundId || ''}:${gateJson?.roundId}`);
    if (gateJson?.ok !== true) failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_NOT_GREEN:${gate.roundId || ''}`);
    if (gateJson?.wordStatus !== 'PASS') failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_WORD_STATUS:${gate.roundId || ''}:${gateJson?.wordStatus}`);
    if (Array.isArray(gateJson?.failures) !== true || gateJson.failures.length !== 0) failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_FAILURES:${gate.roundId || ''}`);
	    if (gateJson?.productReturnApplyGreen !== true || gateJson?.nativeLifecycleVerificationGreen !== true || gateJson?.completeRoundOracleGreen !== true) {
	      failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_ORACLE_COVERAGE:${gate.roundId || ''}`);
	    }
	    if (!SHA256_DIGEST_RE.test(String(gateJson?.oracleDigest || '')) || !SHA256_DIGEST_RE.test(String(gateJson?.semanticOracleDigest || ''))) {
	      failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_DIGEST_MISSING:${gate.roundId || ''}`);
	    }
	    const roundNumber = index + 1;
	    const currentRoundIds = positiveOps
	      .filter((operation) => Number(operation?.round) === roundNumber)
	      .map((operation) => String(operation?.id || operation?.operationId || ''));
	    const cumulativeRoundIds = positiveOps
	      .filter((operation) => Number(operation?.round) >= 1 && Number(operation?.round) <= roundNumber)
	      .map((operation) => String(operation?.id || operation?.operationId || ''));
	    const reuse = gateJson?.completedRoundReuseBinding;
	    const reuseRequiredDigestFields = [
	      'roundLedgerSha256',
	      'canaryScriptSha256',
	      'operationStatusPolicyDigest',
	      'ledgerContentDigest',
      'wordOutputSha256',
      'wordVisibleReadbackSha256',
      'completeRoundOracleSha256',
      'returnedReadySha256',
      'productBaselineSha256',
      'returnApplySha256',
      'nativeLifecycleVerificationSha256',
      'sourceDocxSha256',
      'returnedDocxSha256',
      'yalkenTruthSha256',
      'returnApplyCandidateAuthoritySha256',
      'returnApplyCandidateAuthorityContentDigest',
      'returnApplyCandidateAuthorityAnchorSha256',
      'returnApplyCandidateAuthorityAnchorDigest',
      'returnApplyCandidateAuthorityAnchorLedgerContentDigest',
    ];
    if (
      !reuse
      || reuse.schemaVersion !== 'yalken.rtk.word.c5v2.completed-round-reuse-binding.v6'
      || reuse.ok !== true
      || Array.isArray(reuse.failures) !== true
      || reuse.failures.length !== 0
	      || reuse.roundId !== expectedRoundId
	      || reuse.exactHead !== result.headSha
	      || reuse.corpusDigest !== expectedCorpusDigest
	      || !reuse.operationStatusPolicyVersion
	      || !reuse.returnApplyCandidateAuthorityAnchorKeyId
	      || !Number.isSafeInteger(Number(reuse.exactTotal))
	      || reuseRequiredDigestFields.some((field) => !SHA256_DIGEST_RE.test(String(reuse[field] || '')))
	      || !SHA256_DIGEST_RE.test(String(reuse.bindingDigest || ''))
	    ) {
	      failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_REUSE_BINDING:${gate.roundId || ''}`);
	    } else {
	      const reuseBody = { ...reuse };
	      const declaredReuseDigest = reuseBody.bindingDigest;
	      delete reuseBody.bindingDigest;
	      const recomputedReuseDigest = digestOf(reuseBody);
	      if (declaredReuseDigest !== recomputedReuseDigest) failures.push(`ORCH_STAGE_RESULT_ROUND_GATE_REUSE_BINDING_DIGEST:${gate.roundId || ''}`);
	    }
	    validateCompletedRoundDeepProof({
	      gate,
	      gateJson,
	      reuse,
	      expectedRoundId,
	      roundNumber,
	      expectedStageRoot,
	      expectedCampaignRoot,
	      expectedCorpusDigest,
	      result,
	      ledgerDigest,
	      currentRoundIds,
	      cumulativeRoundIds,
	      failures,
	    });
	  }
  proof.roundInventoryDigest = digestOf(gateRows);
  return proof;
}

function validateNegativeStageSemantics({
  result,
  claimed,
  counters,
  expectedPositiveLedgerDigest,
  expectedNegativeProbeIds = [],
  expectedNegativeProbePlan = [],
  expectedStageRoot = '',
  failures,
}) {
  const proof = { evidenceDigest: '', completedNegativeProbeIds: [] };
  const evidence = claimed.evidence?.path ? readJsonForValidation(claimed.evidence.path, failures, 'ORCH_STAGE_RESULT_NEGATIVE_EVIDENCE_MALFORMED') : null;
  if (evidence) {
    if (!SHA256_DIGEST_RE.test(String(expectedPositiveLedgerDigest || ''))) failures.push('ORCH_STAGE_RESULT_NEGATIVE_EXPECTED_LEDGER_DIGEST_MISSING');
    if (!Array.isArray(expectedNegativeProbeIds) || expectedNegativeProbeIds.length !== 40) failures.push(`ORCH_STAGE_RESULT_NEGATIVE_EXPECTED_PROBE_IDS_MISSING:${expectedNegativeProbeIds.length}`);
    const expectedPlan = new Map((Array.isArray(expectedNegativeProbePlan) ? expectedNegativeProbePlan : []).map((operation) => [String(operation?.id || ''), operation]));
    if (expectedPlan.size !== 40) failures.push(`ORCH_STAGE_RESULT_NEGATIVE_EXPECTED_PROBE_PLAN_MISSING:${expectedPlan.size}`);
    assertExactPathIdentity({
      label: 'ORCH_STAGE_RESULT_NEGATIVE_EVIDENCE_PATH_IDENTITY',
      actual: result.stageData?.evidencePath,
      expected: claimed.evidence?.path,
      failures,
    });
    if (evidence.schemaVersion !== 'yalken.rtk.word.c5v2.negative-campaign-evidence.v1') failures.push(`ORCH_STAGE_RESULT_NEGATIVE_EVIDENCE_SCHEMA:${evidence.schemaVersion}`);
    if (evidence.headSha !== result.headSha) failures.push(`ORCH_STAGE_RESULT_NEGATIVE_HEAD:${evidence.headSha}:${result.headSha}`);
    if (!SHA256_DIGEST_RE.test(String(evidence.fullPlanDigest || ''))) failures.push('ORCH_STAGE_RESULT_NEGATIVE_FULL_PLAN_DIGEST_MISSING');
    if (!SHA256_DIGEST_RE.test(String(evidence.manifestDigest || ''))) failures.push('ORCH_STAGE_RESULT_NEGATIVE_MANIFEST_DIGEST_MISSING');
    if (!evidence.chunk || typeof evidence.chunk !== 'object' || !Number.isSafeInteger(Number(evidence.chunk.probeStart)) || !Number.isSafeInteger(Number(evidence.chunk.probeCount))) {
      failures.push('ORCH_STAGE_RESULT_NEGATIVE_CHUNK_MISSING');
    }
    if (!SHA256_DIGEST_RE.test(String(evidence.baselineArtifactSha256 || ''))) failures.push('ORCH_STAGE_RESULT_NEGATIVE_BASELINE_ARTIFACT_MISSING');
    if (evidence.baselineReturnApplyOk !== true) failures.push('ORCH_STAGE_RESULT_NEGATIVE_BASELINE_RETURN_APPLY_NOT_GREEN');
    if (!evidence.campaignBaseline || !SHA256_DIGEST_RE.test(String(evidence.campaignBaseline.digest || ''))) failures.push('ORCH_STAGE_RESULT_NEGATIVE_BASELINE_DIGEST_MISSING');
    if (Number(evidence.operationCount) !== 40 || Number(evidence.rejectedCount) !== 40 || Number(evidence.failedCount) !== 0) {
      failures.push(`ORCH_STAGE_RESULT_NEGATIVE_EVIDENCE_COUNTERS:${evidence.operationCount}:${evidence.rejectedCount}:${evidence.failedCount}`);
    }
    const completedIds = Array.isArray(evidence.completedOperationIds) ? evidence.completedOperationIds.map(String) : [];
    const results = Array.isArray(evidence.results) ? evidence.results : [];
    proof.completedNegativeProbeIds = completedIds;
    if (completedIds.length !== 40 || results.length !== 40) failures.push(`ORCH_STAGE_RESULT_NEGATIVE_ROWS:${completedIds.length}:${results.length}`);
    if (duplicateValues(completedIds).length > 0) failures.push('ORCH_STAGE_RESULT_NEGATIVE_DUPLICATE_COMPLETED_IDS');
    if (JSON.stringify(completedIds) !== JSON.stringify(expectedNegativeProbeIds)) failures.push('ORCH_STAGE_RESULT_NEGATIVE_COMPLETED_ID_SET_MISMATCH');
    const resultIds = results.map((entry) => String(entry?.id || ''));
    if (JSON.stringify(resultIds) !== JSON.stringify(expectedNegativeProbeIds)) failures.push('ORCH_STAGE_RESULT_NEGATIVE_RESULT_ID_SET_MISMATCH');
    let previousCheckpointDigest = digestOf({
      manifestDigest: evidence.manifestDigest || '',
      campaignBaselineDigest: evidence.campaignBaseline?.digest || '',
    });
    for (let index = 0; index < results.length; index += 1) {
      const row = results[index];
      const expectedProbe = expectedPlan.get(String(row?.id || '')) || null;
      if (row?.ok !== true || row?.observedOutcome !== 'REJECT') failures.push(`ORCH_STAGE_RESULT_NEGATIVE_RESULT_NOT_REJECT:${row?.id || index}`);
      if (row?.expectedOutcome !== 'REJECT') failures.push(`ORCH_STAGE_RESULT_NEGATIVE_EXPECTED_OUTCOME:${row?.id || index}:${row?.expectedOutcome}`);
      if (row?.kind !== expectedProbe?.semanticIntent?.kind) failures.push(`ORCH_STAGE_RESULT_NEGATIVE_KIND:${row?.id || index}:${row?.kind}:${expectedProbe?.semanticIntent?.kind}`);
      if (row?.requestKey !== expectedProbe?.requestKey || row?.effectKey !== expectedProbe?.effectKey) failures.push(`ORCH_STAGE_RESULT_NEGATIVE_REQUEST_EFFECT:${row?.id || index}`);
      if (row?.typedRejectGreen !== true && row?.requestConflictGreen !== true) failures.push(`ORCH_STAGE_RESULT_NEGATIVE_REJECTION_SEMANTICS:${row?.id || index}`);
      if (row?.noWriterGreen !== true || row?.sceneHashGreen !== true || row?.networkGreen !== true) failures.push(`ORCH_STAGE_RESULT_NEGATIVE_RESULT_VETO:${row?.id || index}`);
      if (!row?.checkpointPath || !SHA256_DIGEST_RE.test(String(row?.checkpointSha256 || '')) || !SHA256_DIGEST_RE.test(String(row?.checkpointDigest || ''))) {
        failures.push(`ORCH_STAGE_RESULT_NEGATIVE_CHECKPOINT_DECL_MISSING:${row?.id || index}`);
        continue;
      }
      if (expectedStageRoot && !isCanonicalDescendant(expectedStageRoot, row.checkpointPath)) failures.push(`ORCH_STAGE_RESULT_NEGATIVE_CHECKPOINT_OUTSIDE:${row.id}`);
      if (!fs.existsSync(row.checkpointPath) || fs.lstatSync(row.checkpointPath).isSymbolicLink() || !fs.lstatSync(row.checkpointPath).isFile()) {
        failures.push(`ORCH_STAGE_RESULT_NEGATIVE_CHECKPOINT_NOT_REGULAR:${row.id}`);
        continue;
      }
      const actualCheckpointSha = sha256File(row.checkpointPath);
      if (actualCheckpointSha !== row.checkpointSha256) failures.push(`ORCH_STAGE_RESULT_NEGATIVE_CHECKPOINT_HASH:${row.id}`);
      const checkpoint = readJsonForValidation(row.checkpointPath, failures, 'ORCH_STAGE_RESULT_NEGATIVE_CHECKPOINT_MALFORMED');
      if (checkpoint?.id !== row.id || checkpoint?.observedOutcome !== 'REJECT' || checkpoint?.ok !== true) failures.push(`ORCH_STAGE_RESULT_NEGATIVE_CHECKPOINT_RESULT_MISMATCH:${row.id}`);
      if (checkpoint?.headSha !== evidence.headSha || checkpoint?.masterLedgerDigest !== evidence.masterLedgerDigest || checkpoint?.fullPlanDigest !== evidence.fullPlanDigest || checkpoint?.manifestDigest !== evidence.manifestDigest) {
        failures.push(`ORCH_STAGE_RESULT_NEGATIVE_CHECKPOINT_BINDING:${row.id}`);
      }
      if (stableJson(checkpoint?.chunk || null) !== stableJson(evidence.chunk || null)) failures.push(`ORCH_STAGE_RESULT_NEGATIVE_CHECKPOINT_CHUNK:${row.id}`);
      if (checkpoint?.requestKey !== expectedProbe?.requestKey || checkpoint?.effectKey !== expectedProbe?.effectKey) failures.push(`ORCH_STAGE_RESULT_NEGATIVE_CHECKPOINT_REQUEST_EFFECT:${row.id}`);
      const checkpointBody = { ...checkpoint };
      const declaredCheckpointDigest = checkpointBody.checkpointDigest;
      delete checkpointBody.checkpointDigest;
      const recomputedCheckpointDigest = digestOf(checkpointBody);
      if (declaredCheckpointDigest !== row.checkpointDigest || declaredCheckpointDigest !== recomputedCheckpointDigest) failures.push(`ORCH_STAGE_RESULT_NEGATIVE_CHECKPOINT_DIGEST:${row.id}`);
      if (checkpoint?.previousCheckpointDigest !== previousCheckpointDigest) failures.push(`ORCH_STAGE_RESULT_NEGATIVE_CHECKPOINT_CHAIN:${row.id}`);
      previousCheckpointDigest = declaredCheckpointDigest || '';
    }
    if (evidence.terminalCheckpointDigest !== previousCheckpointDigest) failures.push(`ORCH_STAGE_RESULT_NEGATIVE_TERMINAL_CHECKPOINT:${evidence.terminalCheckpointDigest}:${previousCheckpointDigest}`);
    if (evidence.allWriterFlagsFalse !== true) failures.push('ORCH_STAGE_RESULT_NEGATIVE_WRITER_TRUE');
    if (evidence.allSceneHashesStable !== true) failures.push('ORCH_STAGE_RESULT_NEGATIVE_HASH_DRIFT');
    if (!Array.isArray(evidence.networkRequests) || evidence.networkRequests.length !== 0) failures.push('ORCH_STAGE_RESULT_NEGATIVE_NETWORK');
    if (expectedPositiveLedgerDigest && evidence.masterLedgerDigest !== expectedPositiveLedgerDigest) {
      failures.push(`ORCH_STAGE_RESULT_NEGATIVE_LEDGER_DIGEST_MISMATCH:${expectedPositiveLedgerDigest}:${evidence.masterLedgerDigest}`);
    }
    if (result.stageData?.mainLedgerDigest && evidence.masterLedgerDigest !== result.stageData.mainLedgerDigest) {
      failures.push(`ORCH_STAGE_RESULT_NEGATIVE_STAGE_LEDGER_DIGEST_MISMATCH:${result.stageData.mainLedgerDigest}:${evidence.masterLedgerDigest}`);
    }
    const evidenceDigest = evidence.evidenceDigest || '';
    proof.evidenceDigest = evidenceDigest;
    const evidenceBody = { ...evidence };
    delete evidenceBody.evidenceDigest;
    const recomputedEvidenceDigest = digestOf(evidenceBody);
    if (!SHA256_DIGEST_RE.test(evidenceDigest) || evidenceDigest !== recomputedEvidenceDigest) failures.push(`ORCH_STAGE_RESULT_NEGATIVE_EVIDENCE_DIGEST:${evidenceDigest}:${recomputedEvidenceDigest}`);
    if (result.stageData?.evidenceContentDigest !== evidenceDigest) failures.push(`ORCH_STAGE_RESULT_NEGATIVE_STAGE_EVIDENCE_DIGEST:${result.stageData?.evidenceContentDigest}:${evidenceDigest}`);
  }
  if (counters.green !== true) failures.push('ORCH_STAGE_RESULT_NEGATIVE_NOT_GREEN');
  if (Number(counters.operationCount) !== 40 || Number(counters.rejectedCount) !== 40 || Number(counters.failedCount) !== 0) {
    failures.push(`ORCH_STAGE_RESULT_NEGATIVE_COUNTERS:${counters.operationCount}:${counters.rejectedCount}:${counters.failedCount}`);
  }
  return proof;
}

function validateAggregateStageSemantics({
  result,
  claimed,
  counters,
  expectedStageRoot = '',
  expectedCorpusDigest,
  expectedPositiveLedgerDigest,
  expectedNegativeEvidenceDigest,
  expectedPositiveSealDigest,
  expectedNegativeSealDigest,
  expectedRoundInventoryDigest,
  failures,
}) {
  const proof = { aggregateDigest: '' };
  const aggregate = claimed.terminalAggregate?.path ? readJsonForValidation(claimed.terminalAggregate.path, failures, 'ORCH_STAGE_RESULT_AGGREGATE_MALFORMED') : null;
  if (!SHA256_DIGEST_RE.test(String(expectedCorpusDigest || ''))) failures.push('ORCH_STAGE_RESULT_AGGREGATE_EXPECTED_CORPUS_DIGEST_MISSING');
  if (!SHA256_DIGEST_RE.test(String(expectedPositiveLedgerDigest || ''))) failures.push('ORCH_STAGE_RESULT_AGGREGATE_EXPECTED_LEDGER_DIGEST_MISSING');
  if (!SHA256_DIGEST_RE.test(String(expectedNegativeEvidenceDigest || ''))) failures.push('ORCH_STAGE_RESULT_AGGREGATE_EXPECTED_NEGATIVE_DIGEST_MISSING');
  if (!SHA256_DIGEST_RE.test(String(expectedPositiveSealDigest || ''))) failures.push('ORCH_STAGE_RESULT_AGGREGATE_EXPECTED_POSITIVE_SEAL_MISSING');
  if (!SHA256_DIGEST_RE.test(String(expectedNegativeSealDigest || ''))) failures.push('ORCH_STAGE_RESULT_AGGREGATE_EXPECTED_NEGATIVE_SEAL_MISSING');
  if (!SHA256_DIGEST_RE.test(String(expectedRoundInventoryDigest || ''))) failures.push('ORCH_STAGE_RESULT_AGGREGATE_EXPECTED_ROUND_INVENTORY_MISSING');
  if (counters.aggregateGreen !== true) failures.push('ORCH_STAGE_RESULT_AGGREGATE_NOT_GREEN');
  if (Number(counters.positiveTotal) !== 1960 || Number(counters.negativeTotal) !== 40) {
    failures.push(`ORCH_STAGE_RESULT_AGGREGATE_SPLIT:${counters.positiveTotal}:${counters.negativeTotal}`);
  }
  if (Number(counters.operationCount) !== 2000) failures.push(`ORCH_STAGE_RESULT_AGGREGATE_TOTAL:${counters.operationCount}`);
  if (result.stageData?.roundArtifactsUnchanged !== true) failures.push('ORCH_STAGE_RESULT_AGGREGATE_ROUND_ARTIFACT_DRIFT');
  if (result.stageData?.corpusDigest !== expectedCorpusDigest) failures.push(`ORCH_STAGE_RESULT_AGGREGATE_CORPUS_DIGEST:${result.stageData?.corpusDigest}:${expectedCorpusDigest}`);
  if (result.stageData?.positiveStageSealDigest !== expectedPositiveSealDigest) failures.push(`ORCH_STAGE_RESULT_AGGREGATE_POSITIVE_SEAL:${result.stageData?.positiveStageSealDigest}:${expectedPositiveSealDigest}`);
  if (result.stageData?.negativeStageSealDigest !== expectedNegativeSealDigest) failures.push(`ORCH_STAGE_RESULT_AGGREGATE_NEGATIVE_SEAL:${result.stageData?.negativeStageSealDigest}:${expectedNegativeSealDigest}`);
  if (result.stageData?.roundInventoryDigest !== expectedRoundInventoryDigest) failures.push(`ORCH_STAGE_RESULT_AGGREGATE_ROUND_INVENTORY:${result.stageData?.roundInventoryDigest}:${expectedRoundInventoryDigest}`);
  assertExactPathIdentity({
    label: 'ORCH_STAGE_RESULT_AGGREGATE_PATH_IDENTITY',
    actual: result.stageData?.aggregatePath,
    expected: claimed.terminalAggregate?.path,
    failures,
  });
  if (aggregate) {
    if (aggregate.schemaVersion !== 'yalken.rtk.word.c5v2.terminal-operation-aggregate.v1') failures.push(`ORCH_STAGE_RESULT_AGGREGATE_SCHEMA:${aggregate.schemaVersion}`);
    if (aggregate.ok !== true) failures.push('ORCH_STAGE_RESULT_AGGREGATE_CONTENT_NOT_GREEN');
    if (aggregate.headSha !== result.headSha) failures.push(`ORCH_STAGE_RESULT_AGGREGATE_HEAD:${aggregate.headSha}:${result.headSha}`);
    if (aggregate.corpusDigest !== expectedCorpusDigest) failures.push(`ORCH_STAGE_RESULT_AGGREGATE_CONTENT_CORPUS:${aggregate.corpusDigest}:${expectedCorpusDigest}`);
    if (!Array.isArray(aggregate.failures) || aggregate.failures.length !== 0) failures.push('ORCH_STAGE_RESULT_AGGREGATE_FAILURES');
    if (
      Number(aggregate.positive?.operationCount) !== 1960
      || Number(aggregate.positive?.reportedCount) !== 1960
      || Number(aggregate.negative?.operationCount) !== 40
      || Number(aggregate.negative?.rejectedCount) !== 40
      || Number(aggregate.negative?.failedCount) !== 0
      || Number(aggregate.totalOperationCount) !== 2000
    ) {
      failures.push(`ORCH_STAGE_RESULT_AGGREGATE_CONTENT_SPLIT:${aggregate.positive?.operationCount}:${aggregate.positive?.reportedCount}:${aggregate.negative?.operationCount}:${aggregate.negative?.rejectedCount}:${aggregate.negative?.failedCount}:${aggregate.totalOperationCount}`);
    }
    if (expectedPositiveLedgerDigest && aggregate.masterLedgerDigest !== expectedPositiveLedgerDigest) {
      failures.push(`ORCH_STAGE_RESULT_AGGREGATE_LEDGER_DIGEST_MISMATCH:${expectedPositiveLedgerDigest}:${aggregate.masterLedgerDigest}`);
    }
    if (expectedNegativeEvidenceDigest && aggregate.negative?.evidenceDigest !== expectedNegativeEvidenceDigest) {
      failures.push(`ORCH_STAGE_RESULT_AGGREGATE_NEGATIVE_DIGEST_MISMATCH:${expectedNegativeEvidenceDigest}:${aggregate.negative?.evidenceDigest}`);
    }
    if (!result.stageData?.negativeEvidencePath) {
      failures.push('ORCH_STAGE_RESULT_AGGREGATE_NEGATIVE_EVIDENCE_PATH_MISSING');
    } else {
      const aggregateCampaignRoot = expectedStageRoot ? path.dirname(expectedStageRoot) : '';
      if (!fs.existsSync(result.stageData.negativeEvidencePath) || (aggregateCampaignRoot && !isCanonicalDescendant(aggregateCampaignRoot, result.stageData.negativeEvidencePath))) {
        failures.push(`ORCH_STAGE_RESULT_AGGREGATE_NEGATIVE_EVIDENCE_PATH:${result.stageData.negativeEvidencePath}`);
      } else {
        const negativeEvidenceSha = sha256File(result.stageData.negativeEvidencePath);
        if (aggregate.negative?.evidenceSha256 !== negativeEvidenceSha) {
          failures.push(`ORCH_STAGE_RESULT_AGGREGATE_NEGATIVE_EVIDENCE_SHA:${aggregate.negative?.evidenceSha256}:${negativeEvidenceSha}`);
        }
      }
    }
    if (aggregate.positive?.stageSealDigest !== expectedPositiveSealDigest || aggregate.negative?.stageSealDigest !== expectedNegativeSealDigest) {
      failures.push('ORCH_STAGE_RESULT_AGGREGATE_INPUT_SEALS');
    }
    if (aggregate.roundInventoryDigest !== expectedRoundInventoryDigest) failures.push(`ORCH_STAGE_RESULT_AGGREGATE_CONTENT_ROUND_INVENTORY:${aggregate.roundInventoryDigest}:${expectedRoundInventoryDigest}`);
    const aggregateDigest = aggregate.aggregateDigest || '';
    proof.aggregateDigest = aggregateDigest;
    const aggregateBody = { ...aggregate };
    delete aggregateBody.aggregateDigest;
    const recomputed = digestOf(aggregateBody);
    if (!SHA256_DIGEST_RE.test(aggregateDigest) || aggregateDigest !== recomputed) failures.push(`ORCH_STAGE_RESULT_AGGREGATE_DIGEST:${aggregateDigest}:${recomputed}`);
    if (result.stageData?.aggregateDigest !== aggregateDigest) failures.push(`ORCH_STAGE_RESULT_AGGREGATE_STAGE_DIGEST:${result.stageData?.aggregateDigest}:${aggregateDigest}`);
  }
  return proof;
}

export function validateStageResult({
  stage,
  resultPath,
  campaignId,
  chainId,
  expectedSha,
  expectedWordVersion,
  expectedWordBuild,
  stageStartedAtMs,
  requiredOutputKeys = [],
  expectedCampaignRoot = '',
  expectedStageRoot = '',
  expectedCorpusDigest = '',
  expectedLedgerDigest = '',
  expectedOperationIdSetDigest = '',
  expectedPositiveLedgerDigest = '',
  expectedNegativeEvidenceDigest = '',
  expectedNegativeProbeIds = [],
  expectedNegativeProbePlan = [],
  expectedPositiveSealDigest = '',
  expectedNegativeSealDigest = '',
  expectedRoundInventoryDigest = '',
}) {
  const failures = [];
  let proof = {};
  if (!fs.existsSync(resultPath)) return { ok: false, code: `ORCH_STAGE_RESULT_MISSING:${resultPath}` };
  const stat = fs.lstatSync(resultPath);
  if (stat.isSymbolicLink() || !stat.isFile()) return { ok: false, code: `ORCH_STAGE_RESULT_NOT_REGULAR_FILE:${resultPath}` };
  if (expectedCampaignRoot && !isCanonicalDescendant(expectedCampaignRoot, resultPath)) {
    return { ok: false, code: `ORCH_STAGE_RESULT_OUTSIDE_CAMPAIGN_ROOT:${resultPath}` };
  }
  let result = null;
  try { result = JSON.parse(fs.readFileSync(resultPath, 'utf8')); } catch (error) {
    return { ok: false, code: `ORCH_STAGE_RESULT_MALFORMED:${String(error && error.message ? error.message : error).slice(0, 120)}` };
  }
  if (result.schemaVersion !== STAGE_RESULT_SCHEMA) failures.push(`ORCH_STAGE_RESULT_SCHEMA:${result.schemaVersion}`);
  if (result.status !== 'SEALED') failures.push(`ORCH_STAGE_RESULT_STATUS:${result.status}`);
  if (result.stage !== stage) failures.push(`ORCH_STAGE_RESULT_STAGE_MISMATCH:${stage}:${result.stage}`);
  if (result.campaignId !== campaignId) failures.push(`ORCH_STAGE_RESULT_CAMPAIGN_MISMATCH:${campaignId}:${result.campaignId}`);
  if (result.chainId !== chainId) failures.push(`ORCH_STAGE_RESULT_CHAIN_MISMATCH:${chainId}:${result.chainId}`);
  if (result.headSha !== expectedSha) failures.push(`ORCH_STAGE_RESULT_SHA_MISMATCH:${expectedSha}:${result.headSha}`);
  if (result.originMainSha !== expectedSha) failures.push(`ORCH_STAGE_RESULT_ORIGIN_MISMATCH:${expectedSha}:${result.originMainSha}`);
  if (result.wordVersion !== expectedWordVersion) failures.push(`ORCH_STAGE_RESULT_WORD_VERSION_MISMATCH:${expectedWordVersion}:${result.wordVersion}`);
  if (result.wordBuild !== expectedWordBuild) failures.push(`ORCH_STAGE_RESULT_WORD_BUILD_MISMATCH:${expectedWordBuild}:${result.wordBuild}`);
  const finishedAtMs = Date.parse(result.finishedAtUtc || '');
  if (!Number.isFinite(finishedAtMs)) failures.push('ORCH_STAGE_RESULT_FINISHED_INVALID');
  else if (finishedAtMs < stageStartedAtMs) failures.push(`ORCH_STAGE_RESULT_STALE:${result.finishedAtUtc}`);
  const claimed = result.artifacts && typeof result.artifacts === 'object' ? result.artifacts : {};
  const counters = result.counters && typeof result.counters === 'object' ? result.counters : {};
  const artifactRoot = expectedStageRoot || expectedCampaignRoot || '';
  validateClaimedArtifacts({ claimed, requiredOutputKeys, expectedRoot: artifactRoot, failures });
  if (stage === 'POSITIVE') proof = validatePositiveStageSemantics({
	    result,
	    claimed,
	    counters,
	    expectedCampaignRoot,
	    expectedStageRoot: artifactRoot,
    expectedCorpusDigest,
    expectedLedgerDigest,
    expectedOperationIdSetDigest,
    failures,
  });
  if (stage === 'NEGATIVE') proof = validateNegativeStageSemantics({
    result,
    claimed,
    counters,
    expectedCorpusDigest,
    expectedPositiveLedgerDigest,
    expectedNegativeProbeIds,
    expectedNegativeProbePlan,
    expectedStageRoot: artifactRoot,
    failures,
  });
  if (stage === 'AGGREGATE') proof = validateAggregateStageSemantics({
    result,
    claimed,
    counters,
    expectedCorpusDigest,
    expectedPositiveLedgerDigest,
    expectedNegativeEvidenceDigest,
    expectedPositiveSealDigest,
    expectedNegativeSealDigest,
    expectedRoundInventoryDigest,
    expectedStageRoot: artifactRoot,
    failures,
  });
  if (failures.length > 0) return { ok: false, code: `ORCH_STAGE_RESULT_INVALID:${failures.join('|')}`, failures };
  return { ok: true, code: 'ORCH_STAGE_RESULT_VERIFIED', result, proof };
}

// ---------------------------------------------------------------------------
// Chain journal and seals
// ---------------------------------------------------------------------------

export function createChainJournal({ campaignRoot, campaignId, chainId, expectedSha }) {
  const journalPath = path.join(campaignRoot, 'ORCHESTRATOR', 'chain-journal.jsonl');
  const state = { journalPath, previousDigest: 'sha256:genesis', sequence: 0 };
  return {
    journalPath,
    append(transition, detail = {}) {
      state.sequence += 1;
      const body = {
        schemaVersion: ORCH_SCHEMA,
        sequence: state.sequence,
        transition,
        campaignId,
        chainId,
        expectedSha,
        atUtc: nowIso(),
        previousDigest: state.previousDigest,
        detail,
      };
      const digest = digestOf(body);
      const record = { ...body, digest };
      appendJsonl(state.journalPath, record);
      state.previousDigest = digest;
      return record;
    },
    get previousDigest() { return state.previousDigest; },
    get sequence() { return state.sequence; },
  };
}

export function publishStageSeal({ campaignRoot, stage, stageResultPath, stageResultSha256, preflight, previousSealDigest }) {
  const seal = {
    schemaVersion: STAGE_SEAL_SCHEMA,
    stage,
    stageResultPath,
    stageResultSha256,
    preflightScriptHashes: preflight.scriptHashes,
    preflightCode: preflight.code,
    previousSealDigest,
    sealedAtUtc: nowIso(),
  };
  const sealDigest = digestOf(seal);
  const publication = writeJsonAtomicVerified(
    path.join(campaignRoot, 'ORCHESTRATOR', `${stage.toLowerCase()}-stage-seal.json`),
    { ...seal, sealDigest },
  );
  return { seal: { ...seal, sealDigest }, sealDigest, sealPath: publication.path };
}

// ---------------------------------------------------------------------------
// Canary stage command construction
// ---------------------------------------------------------------------------

export function buildOrchestratedStageCommand({ stage, campaignRoot, campaignId, chainId, options, inputs = {} }) {
  const runner = options.runnerPath || path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-physical-canary.mjs');
  const stageRoot = path.join(campaignRoot, stage === 'POSITIVE' ? 'MAIN' : stage === 'NEGATIVE' ? 'NEGATIVE' : 'ORCHESTRATOR');
  const args = [
    runner,
    '--orchestrated-stage', stage,
    '--run-dir', stageRoot,
    '--stage-result-path', path.join(campaignRoot, 'ORCHESTRATOR', `${stage.toLowerCase()}-stage-result.json`),
    '--heartbeat-path', path.join(campaignRoot, 'ORCHESTRATOR', `${stage.toLowerCase()}-heartbeat.jsonl`),
    '--campaign-id', campaignId,
    '--chain-id', chainId,
    '--expected-sha', options.expectedSha,
    '--expected-word-version', options.expectedWordVersion,
    '--expected-word-build', options.expectedWordBuild,
  ];
  if (options.expectedCorpusDigest) args.push('--expected-corpus-digest', options.expectedCorpusDigest);
  if (options.corpusManifestPath) args.push('--corpus-manifest', options.corpusManifestPath);
  if (stage === 'POSITIVE') {
    args.push('--master-ledger-campaign', '--scene-count', '21', '--round-count', '5', '--run-prefix', campaignId, '--artifact-root', campaignRoot);
  } else if (stage === 'NEGATIVE') {
    args.push('--negative-campaign-ledger', inputs.ledgerPath || '');
    args.push('--negative-probe-start', '1', '--negative-probe-count', '40');
    args.push('--artifact-root', campaignRoot);
  } else if (stage === 'AGGREGATE') {
    args.push('--resume-run-dir', inputs.mainRunDir || '');
    args.push('--negative-aggregate-evidence', inputs.negativeEvidencePath || '');
    args.push('--positive-stage-seal-digest', inputs.positiveSealDigest || '');
    args.push('--negative-stage-seal-digest', inputs.negativeSealDigest || '');
    args.push('--round-inventory-digest', inputs.roundInventoryDigest || '');
    args.push('--scene-count', '21', '--round-count', '5', '--run-prefix', campaignId, '--artifact-root', inputs.mainRunDir ? path.dirname(inputs.mainRunDir) : stageRoot);
  }
  return { command: process.execPath, args, stageRoot };
}

// ---------------------------------------------------------------------------
// Single-chain controller
// ---------------------------------------------------------------------------

export async function runSingleChainOrchestrator({
  options,
  stageExecutor = null,
  preflightHook = null,
  testPreflightBypass = false,
  lockApi = null,
}) {
  const bypassForTests = testPreflightBypass === true;
  const control = { stopping: false, currentPgid: null };
  const journal = { current: null };
  const outcome = {
    schemaVersion: ORCH_SCHEMA,
    ok: false,
    campaignId: options.campaignId,
    chainId: options.chainId,
    state: 'CREATED',
    stageSeals: [],
    chainSeal: null,
    failure: null,
    finishedAtUtc: '',
  };
  const failureDir = path.join(options.campaignRoot, 'FAILURE');
  const memoryFailure = (stage, code, extra = {}) => {
    const marker = {
      schemaVersion: ORCH_SCHEMA,
      stage,
      code,
      campaignId: options.campaignId,
      chainId: options.chainId,
      atUtc: nowIso(),
      ...extra,
    };
    outcome.failure = marker;
    outcome.state = extra.quarantined === true || code.startsWith('ORCH_OWNED_PROCESSES_') || code.startsWith('ORCH_PROCESS_IDENTITY_') || code.startsWith('ORCH_UNKNOWN')
      ? 'QUARANTINED'
      : 'FAILED';
    return marker;
  };
  const recordFailure = (stage, code, extra = {}) => {
    const marker = {
      schemaVersion: ORCH_SCHEMA,
      stage,
      code,
      campaignId: options.campaignId,
      chainId: options.chainId,
      atUtc: nowIso(),
      ...extra,
    };
    const markerPath = path.join(failureDir, 'failure-markers.jsonl');
    fs.mkdirSync(failureDir, { recursive: true });
    fs.appendFileSync(markerPath, JSON.stringify(marker) + '\n', 'utf8');
    outcome.failure = marker;
    outcome.state = extra.quarantined === true || code.startsWith('ORCH_OWNED_PROCESSES_') || code.startsWith('ORCH_PROCESS_IDENTITY_') || code.startsWith('ORCH_UNKNOWN')
      ? 'QUARANTINED'
      : 'FAILED';
    if (journal.current) journal.current.append(outcome.state, { stage, code });
    return marker;
  };
  const preflight = (scope) => {
    if (preflightHook) return preflightHook(scope);
    if (bypassForTests) return { ok: true, code: 'ORCH_PREFLIGHT_BYPASSED_TEST_ONLY', scope, failures: [], checkedAtUtc: nowIso(), scriptHashes: {} };
    return runOrchestratorPreflight({ options, scope });
  };
  if (options.resume === true) {
    memoryFailure('RESUME', 'ORCH_RESUME_REJECTED_UNIMPLEMENTED');
    outcome.state = 'RESUME_REJECTED';
    outcome.finishedAtUtc = nowIso();
    return outcome;
  }
  // CREATED -> PREFLIGHT_GREEN
  const initialPreflight = preflight('CHAIN_START');
  if (initialPreflight.ok !== true) {
    memoryFailure('PREFLIGHT', initialPreflight.code);
    outcome.finishedAtUtc = nowIso();
    return outcome;
  }
  const pathAuthority = assertOrchestratorPathAuthority({
    artifactRoot: options.artifactRoot,
    campaignRoot: options.campaignRoot,
    mustBeAbsent: !options.resume,
  });
  if (pathAuthority.ok !== true) {
    memoryFailure('PREFLIGHT', pathAuthority.code);
    outcome.finishedAtUtc = nowIso();
    return outcome;
  }
  const lockAcquire = lockApi && typeof lockApi.acquire === 'function' ? lockApi.acquire : acquireOrchestratorLock;
  const lockRelease = lockApi && typeof lockApi.release === 'function' ? lockApi.release : releaseOrchestratorLock;
  const lock = lockAcquire({
    lockRoot: path.join(options.artifactRoot, '.orchestrator-locks'),
    allowedRoot: options.artifactRoot,
    campaignId: options.campaignId,
    chainId: options.chainId,
    expectedSha: options.expectedSha,
  });
  if (lock.ok !== true) {
    memoryFailure('LOCK', lock.code);
    outcome.finishedAtUtc = nowIso();
    return outcome;
  }
  fs.mkdirSync(path.join(options.campaignRoot, 'ORCHESTRATOR'), { recursive: true });
  journal.current = createChainJournal({
    campaignRoot: options.campaignRoot,
    campaignId: options.campaignId,
    chainId: options.chainId,
    expectedSha: options.expectedSha,
  });
  journal.current.append('PREFLIGHT_GREEN', { scriptHashes: initialPreflight.scriptHashes });
  outcome.state = 'PREFLIGHT_GREEN';
  journal.current.append('LOCKED', { lockDir: lock.lockDir });
  outcome.state = 'LOCKED';
  let lockFinalized = false;
  let lockRemoved = false;
  const releaseLock = (quarantined, reason) => {
    if (lockFinalized) return { released: lockRemoved, code: outcome.lockOutcome || 'ORCH_LOCK_ALREADY_FINALIZED' };
    const released = lockRelease({
      lockDir: lock.lockDir,
      ownershipToken: lock.ownershipToken,
      campaignId: options.campaignId,
      quarantined,
      quarantineReason: reason,
    });
    lockFinalized = true;
    lockRemoved = released.released === true;
    outcome.lockOutcome = released.code;
    return released;
  };
  const failOnUnreleasedLock = () => {
    if (lockRemoved === true || outcome.state === 'QUARANTINED') return false;
    outcome.ok = false;
    outcome.state = 'LOCK_RELEASE_FAILED';
    outcome.failure = {
      schemaVersion: ORCH_SCHEMA,
      stage: 'LOCK_RELEASE',
      code: outcome.lockOutcome || 'ORCH_LOCK_RELEASE_NOT_CONFIRMED',
      campaignId: options.campaignId,
      chainId: options.chainId,
      atUtc: nowIso(),
      lockDir: lock.lockDir,
    };
    if (journal.current) journal.current.append('LOCK_RELEASE_FAILED', { code: outcome.failure.code, lockDir: lock.lockDir });
    return true;
  };
  const onSignal = (signalName) => {
    control.stopping = true;
    if (control.abortCurrentStage) {
      control.abortCurrentStage(`ORCH_SIGNAL_${signalName}_STOPPING`);
    }
    recordFailure('SIGNAL', `ORCH_SIGNAL_${signalName}_STOPPING`);
  };
  const stopping = () => control.stopping === true;
  let sigintHandler;
  let sigtermHandler;
  try {
    sigintHandler = () => onSignal('SIGINT');
    sigtermHandler = () => onSignal('SIGTERM');
    process.on('SIGINT', sigintHandler);
    process.on('SIGTERM', sigtermHandler);
    const stageInputs = {};
    let previousSealDigest = 'sha256:genesis';
    for (const stage of STAGES) {
      if (stopping()) break;
      outcome.state = `${stage}_RUNNING`;
      journal.current.append(`${stage}_RUNNING`, {});
      const stagePreflight = preflight(`BEFORE_${stage}`);
      if (stagePreflight.ok !== true) {
        recordFailure(stage, stagePreflight.code);
        break;
      }
      const stageStartedAtMs = Date.now();
      const command = buildOrchestratedStageCommand({
        stage,
        campaignRoot: options.campaignRoot,
        campaignId: options.campaignId,
        chainId: options.chainId,
        options,
        inputs: stageInputs,
      });
      const heartbeatPath = path.join(options.campaignRoot, 'ORCHESTRATOR', `${stage.toLowerCase()}-heartbeat.jsonl`);
      const executor = stageExecutor || runOwnedStageProcess;
      const processResult = await executor({
        stage,
        command: command.command,
        args: command.args,
        cwd: REPO_ROOT,
        logDir: path.join(options.campaignRoot, 'ORCHESTRATOR'),
        heartbeatPath,
        campaignId: options.campaignId,
        chainId: options.chainId,
        stageTimeoutMs: options.stageTimeoutMs,
        progressTimeoutMs: options.progressTimeoutMs,
        killGraceMs: options.killGraceMs,
        control,
      });
      if (processResult.ok !== true) {
        recordFailure(stage, processResult.code, {
          childPid: processResult.pid,
          pgid: processResult.pgid,
          exitCode: processResult.exitCode ?? null,
          signal: processResult.signal ?? null,
          survivingDescendants: processResult.survivingDescendants || [],
          survivingOwnedPids: processResult.survivingOwnedPids || [],
          quarantined: processResult.quarantined === true,
        });
        if (processResult.quarantined) {
          releaseLock(true, processResult.code);
          outcome.finishedAtUtc = nowIso();
          return outcome;
        }
        break;
      }
      const resultPath = path.join(options.campaignRoot, 'ORCHESTRATOR', `${stage.toLowerCase()}-stage-result.json`);
      const validation = validateStageResult({
        stage,
        resultPath,
        campaignId: options.campaignId,
        chainId: options.chainId,
        expectedSha: options.expectedSha,
        expectedWordVersion: options.expectedWordVersion,
        expectedWordBuild: options.expectedWordBuild,
        stageStartedAtMs,
        expectedCampaignRoot: options.campaignRoot,
        expectedStageRoot: stage === 'AGGREGATE' ? (stageInputs.mainRunDir || command.stageRoot) : command.stageRoot,
        expectedCorpusDigest: options.expectedCorpusDigest || '',
        expectedLedgerDigest: options.expectedLedgerDigest || '',
        expectedOperationIdSetDigest: options.expectedOperationIdSetDigest || '',
        expectedPositiveLedgerDigest: stageInputs.positiveLedgerDigest || '',
        expectedNegativeEvidenceDigest: stageInputs.negativeEvidenceDigest || '',
        expectedNegativeProbeIds: stageInputs.negativeProbeIds || [],
        expectedNegativeProbePlan: stageInputs.negativeProbeOperations || [],
        expectedPositiveSealDigest: stageInputs.positiveSealDigest || '',
        expectedNegativeSealDigest: stageInputs.negativeSealDigest || '',
        expectedRoundInventoryDigest: stageInputs.roundInventoryDigest || '',
        requiredOutputKeys: stage === 'POSITIVE'
          ? ['ledger', 'roundGates']
          : stage === 'NEGATIVE'
            ? ['evidence']
            : ['terminalAggregate'],
      });
      if (validation.ok !== true) {
        recordFailure(stage, validation.code);
        break;
      }
      const stageResult = validation.result;
      const resultSha256 = sha256File(resultPath);
      const seal = publishStageSeal({
        campaignRoot: options.campaignRoot,
        stage,
        stageResultPath: resultPath,
        stageResultSha256: resultSha256,
        preflight: stagePreflight,
        previousSealDigest,
      });
      previousSealDigest = seal.sealDigest;
      outcome.stageSeals.push({ stage, sealDigest: seal.sealDigest, sealPath: seal.sealPath });
      journal.current.append(`${stage}_SEALED`, { sealDigest: seal.sealDigest });
      outcome.state = `${stage}_SEALED`;
      if (stage === 'POSITIVE') {
        stageInputs.ledgerPath = stageResult.stageData?.ledgerPath || '';
        stageInputs.positiveLedgerDigest = validation.proof?.ledgerDigest || stageResult.stageData?.ledgerDigest || '';
        stageInputs.operationIdSetDigest = validation.proof?.operationIdSetDigest || stageResult.stageData?.operationIdSetDigest || '';
        stageInputs.negativeProbeIds = validation.proof?.negativeProbeIds || [];
        stageInputs.negativeProbeOperations = validation.proof?.negativeProbeOperations || [];
        stageInputs.roundInventoryDigest = validation.proof?.roundInventoryDigest || '';
        stageInputs.mainRunDir = stageResult.stageData?.mainRunDir || command.stageRoot;
        stageInputs.positiveSealDigest = seal.sealDigest;
      } else if (stage === 'NEGATIVE') {
        stageInputs.negativeEvidencePath = stageResult.stageData?.evidencePath || '';
        if (stageResult.stageData?.mainLedgerDigest) stageInputs.positiveLedgerDigest = stageResult.stageData.mainLedgerDigest;
        stageInputs.negativeEvidenceDigest = validation.proof?.evidenceDigest || validation.result?.stageData?.evidenceContentDigest || validation.result?.stageData?.evidenceDigest || '';
        if (!stageInputs.negativeEvidenceDigest && stageResult.artifacts?.evidence?.path && fs.existsSync(stageResult.artifacts.evidence.path)) {
          try {
            const evidence = JSON.parse(fs.readFileSync(stageResult.artifacts.evidence.path, 'utf8'));
            stageInputs.negativeEvidenceDigest = evidence.evidenceDigest || '';
          } catch { /* noop */ }
        }
        stageInputs.negativeSealDigest = seal.sealDigest;
      }
    }
    if (outcome.failure) {
      releaseLock(false, '');
      failOnUnreleasedLock();
      outcome.finishedAtUtc = nowIso();
      return outcome;
    }
    if (stopping()) {
      releaseLock(false, '');
      failOnUnreleasedLock();
      outcome.finishedAtUtc = nowIso();
      return outcome;
    }
    if (bypassForTests) {
      journal.current.append('BYPASSED_NO_CHAIN_SEAL', { reason: 'ORCH_TEST_PREFLIGHT_BYPASS' });
      outcome.state = 'BYPASSED_NO_CHAIN_SEAL';
      outcome.ok = true;
      outcome.bypassMarker = 'ORCH_TEST_PREFLIGHT_BYPASS_NO_CHAIN_SEAL';
      releaseLock(false, '');
      failOnUnreleasedLock();
      outcome.finishedAtUtc = nowIso();
      return outcome;
    }
    // CHAIN_SEAL after final preflight recheck.
    const finalPreflight = preflight('BEFORE_CHAIN_SEAL');
    if (finalPreflight.ok !== true) {
      recordFailure('CHAIN_SEAL', finalPreflight.code);
      releaseLock(false, '');
      failOnUnreleasedLock();
      outcome.finishedAtUtc = nowIso();
      return outcome;
    }
    const scriptHashFailures = [];
    validateCanonicalScriptHashes(finalPreflight.scriptHashes, scriptHashFailures, 'ORCH_CHAIN_SEAL_SCRIPT_HASHES');
    if (scriptHashFailures.length > 0) {
      recordFailure('CHAIN_SEAL', scriptHashFailures.join('|'));
      releaseLock(false, '');
      failOnUnreleasedLock();
      outcome.finishedAtUtc = nowIso();
      return outcome;
    }
    const preparedBody = {
      schemaVersion: ORCH_SCHEMA,
      kind: 'CHAIN_CLOSEOUT_PREPARED',
      campaignId: options.campaignId,
      chainId: options.chainId,
      expectedSha: options.expectedSha,
      stageSeals: outcome.stageSeals.map((entry) => ({ stage: entry.stage, sealDigest: entry.sealDigest })),
      preCloseoutJournalTipDigest: journal.current.previousDigest,
      preparedAtUtc: nowIso(),
    };
    const closeoutPreparedDigest = digestOf(preparedBody);
    writeJsonAtomicVerified(path.join(options.campaignRoot, 'ORCHESTRATOR', 'chain-closeout-prepared.json'), { ...preparedBody, closeoutPreparedDigest });
    journal.current.append('CHAIN_CLOSEOUT_PREPARED', { closeoutPreparedDigest });
    const releasePreparedJournalTipDigest = journal.current.previousDigest;
    const lockOutcome = releaseLock(false, '');
    if (failOnUnreleasedLock()) {
      outcome.finishedAtUtc = nowIso();
      return outcome;
    }
    const releaseProofBody = {
      schemaVersion: ORCH_SCHEMA,
      kind: 'CHAIN_LOCK_RELEASE_PROOF',
      campaignId: options.campaignId,
      chainId: options.chainId,
      expectedSha: options.expectedSha,
      lockDir: lock.lockDir,
      releaseCode: lockOutcome?.code || outcome.lockOutcome || '',
      closeoutPreparedDigest,
      releasedAtUtc: nowIso(),
    };
    const lockReleaseProofDigest = digestOf(releaseProofBody);
    writeJsonAtomicVerified(path.join(options.campaignRoot, 'ORCHESTRATOR', 'chain-lock-release-proof.json'), { ...releaseProofBody, lockReleaseProofDigest });
    const chainSealBody = {
      schemaVersion: ORCH_SCHEMA,
      kind: 'CHAIN_SEAL',
      campaignId: options.campaignId,
      chainId: options.chainId,
      expectedSha: options.expectedSha,
      wordVersion: options.expectedWordVersion,
      wordBuild: options.expectedWordBuild,
      corpusDigest: options.expectedCorpusDigest || '',
      corpusManifestPath: options.corpusManifestPath || '',
      corpusManifestSha256: options.corpusManifestPath && fs.existsSync(options.corpusManifestPath) ? sha256File(options.corpusManifestPath) : '',
      masterLedgerDigest: options.expectedLedgerDigest || '',
      operationIdSetDigest: options.expectedOperationIdSetDigest || '',
      campaignProfile: options.campaignProfile || '',
      scriptHashes: finalPreflight.scriptHashes,
      stageSeals: outcome.stageSeals.map((entry) => ({ stage: entry.stage, sealDigest: entry.sealDigest })),
      closeoutPreparedDigest,
      lockReleaseProofDigest,
      journalTipDigest: releasePreparedJournalTipDigest,
      sealedAtUtc: nowIso(),
    };
    const chainSealDigest = digestOf(chainSealBody);
    writeJsonAtomicVerified(path.join(options.campaignRoot, 'ORCHESTRATOR', 'chain-seal.json'), { ...chainSealBody, chainSealDigest });
    journal.current.append('CHAIN_SEALED', { chainSealDigest });
    outcome.chainSeal = { ...chainSealBody, chainSealDigest };
    outcome.state = 'CHAIN_SEALED';
    outcome.ok = true;
    outcome.finishedAtUtc = nowIso();
    return outcome;
  } finally {
    if (sigintHandler) process.removeListener('SIGINT', sigintHandler);
    if (sigtermHandler) process.removeListener('SIGTERM', sigtermHandler);
    if (!lockFinalized) {
      releaseLock(false, '');
    }
  }
}

export function runOrchestratorPreflightOnly({ options, preflightHook = null }) {
  const preflight = preflightHook
    ? preflightHook('PREFLIGHT_ONLY')
    : runOrchestratorPreflight({ options, scope: 'PREFLIGHT_ONLY' });
  if (preflight.ok !== true) {
    return {
      schemaVersion: ORCH_SCHEMA,
      ok: false,
      state: 'PREFLIGHT_FAILED',
      code: preflight.code,
      preflight,
      finishedAtUtc: nowIso(),
    };
  }
  const pathAuthority = assertOrchestratorPathAuthority({
    artifactRoot: options.artifactRoot,
    campaignRoot: options.campaignRoot,
    mustBeAbsent: !options.resume,
  });
  if (pathAuthority.ok !== true) {
    return {
      schemaVersion: ORCH_SCHEMA,
      ok: false,
      state: 'PATH_AUTHORITY_FAILED',
      code: pathAuthority.code,
      preflight,
      pathAuthority,
      finishedAtUtc: nowIso(),
    };
  }
  const lock = checkOrchestratorLockAbsence({ lockRoot: path.join(options.artifactRoot, '.orchestrator-locks'), allowedRoot: options.artifactRoot });
  if (lock.ok !== true) {
    return {
      schemaVersion: ORCH_SCHEMA,
      ok: false,
      state: 'LOCK_PRESENT',
      code: lock.code,
      preflight,
      pathAuthority,
      lock,
      finishedAtUtc: nowIso(),
    };
  }
  return {
    schemaVersion: ORCH_SCHEMA,
    ok: true,
    state: 'PREFLIGHT_ONLY_GREEN',
    code: 'ORCH_PREFLIGHT_ONLY_GREEN',
    campaignId: options.campaignId,
    chainId: options.chainId,
    preflight,
    pathAuthority,
    lock,
    finishedAtUtc: nowIso(),
  };
}

export function assertNoProductionEnvBypass(env = process.env) {
  const forbidden = ['ORCH_TEST_PREFLIGHT_BYPASS', 'ORCH_CANARY_RUNNER_PATH'].filter((key) => {
    const value = env[key];
    return value !== undefined && String(value).trim() !== '';
  });
  if (forbidden.length > 0) throw new Error(`ORCH_PRODUCTION_ENV_BYPASS_REJECTED:${forbidden.join(',')}`);
  return { ok: true, code: 'ORCH_PRODUCTION_ENV_CLEAN' };
}

export const TERMINAL_PORTFOLIO_SCHEMA = 'yalken.rtk.word.c5v2.terminal-portfolio.v1';
export const TERMINAL_PORTFOLIO_RECEIPT_SCHEMA = 'yalken.rtk.word.c5v2.terminal-portfolio-receipt.v1';
export const TERMINAL_PORTFOLIO_SEAL_SCHEMA = 'yalken.rtk.word.c5v2.terminal-portfolio-seal.v1';

function manifestDigestBody(manifest) {
  const copy = { ...(manifest || {}) };
  delete copy.manifestDigest;
  return copy;
}

export function buildTerminalPortfolioManifest({
  portfolioId,
  artifactRoot,
  expectedSha,
  expectedWordVersion,
  expectedWordBuild,
  corpusDigest,
  corpusManifestPath,
  masterLedgerDigest,
  operationIdSetDigest,
  scriptHashes,
  campaignProfile,
}) {
  if (!IDENTITY_RE.test(String(portfolioId || ''))) throw new Error(`ORCH_PORTFOLIO_ID_INVALID:${portfolioId}`);
  if (!path.isAbsolute(String(artifactRoot || ''))) throw new Error('ORCH_PORTFOLIO_ARTIFACT_ROOT_NOT_ABSOLUTE');
  if (!/^[0-9a-f]{40}$/u.test(String(expectedSha || ''))) throw new Error(`ORCH_PORTFOLIO_SHA_INVALID:${expectedSha}`);
  if (!/^\d+\.\d+\.\d+$/u.test(String(expectedWordVersion || ''))) throw new Error(`ORCH_PORTFOLIO_WORD_VERSION_INVALID:${expectedWordVersion}`);
  if (!/^\d+\.\d+\.\d+$/u.test(String(expectedWordBuild || ''))) throw new Error(`ORCH_PORTFOLIO_WORD_BUILD_INVALID:${expectedWordBuild}`);
  if (!SHA256_DIGEST_RE.test(String(corpusDigest || ''))) throw new Error(`ORCH_PORTFOLIO_CORPUS_DIGEST_INVALID:${corpusDigest}`);
  if (!path.isAbsolute(String(corpusManifestPath || ''))) throw new Error('ORCH_PORTFOLIO_CORPUS_MANIFEST_NOT_ABSOLUTE');
  const corpusManifestReal = fs.existsSync(corpusManifestPath) ? fs.realpathSync(corpusManifestPath) : '';
  if (!corpusManifestReal) throw new Error(`ORCH_PORTFOLIO_CORPUS_MANIFEST_MISSING:${corpusManifestPath}`);
  const corpusManifestStat = fs.lstatSync(corpusManifestPath);
  if (corpusManifestStat.isSymbolicLink() || !corpusManifestStat.isFile()) throw new Error(`ORCH_PORTFOLIO_CORPUS_MANIFEST_NOT_REGULAR:${corpusManifestPath}`);
  if (!SHA256_DIGEST_RE.test(String(masterLedgerDigest || ''))) throw new Error(`ORCH_PORTFOLIO_MASTER_LEDGER_DIGEST_INVALID:${masterLedgerDigest}`);
  if (!SHA256_DIGEST_RE.test(String(operationIdSetDigest || ''))) throw new Error(`ORCH_PORTFOLIO_OPERATION_SET_DIGEST_INVALID:${operationIdSetDigest}`);
  if (campaignProfile !== TERMINAL_CAMPAIGN_PROFILE) throw new Error(`ORCH_PORTFOLIO_CAMPAIGN_PROFILE_INVALID:${campaignProfile}`);
  const scriptHashFailures = [];
  validateCanonicalScriptHashes(scriptHashes, scriptHashFailures, 'ORCH_PORTFOLIO_SCRIPT_HASHES');
  if (scriptHashFailures.length > 0) throw new Error(scriptHashFailures.join('|'));
  const root = path.resolve(artifactRoot);
  const portfolioRoot = path.join(root, `PORTFOLIO-${portfolioId}`);
  const chains = CHAIN_IDS.map((chainId, index) => {
    const campaignId = `${portfolioId}-${chainId.toLowerCase()}-${String(index + 1).padStart(2, '0')}`;
    return {
      order: index + 1,
      chainId,
      campaignId,
      campaignRoot: path.join(portfolioRoot, 'chains', campaignId),
    };
  });
  const manifest = {
    schemaVersion: TERMINAL_PORTFOLIO_SCHEMA,
    portfolioId,
    roster: CHAIN_IDS,
    expectedSha,
    expectedWordVersion,
    expectedWordBuild,
    corpusDigest,
    corpusManifestPath: corpusManifestReal,
    corpusManifestSha256: sha256File(corpusManifestReal),
    masterLedgerDigest,
    operationIdSetDigest,
    scriptHashes,
    campaignProfile,
    artifactRoot: root,
    portfolioRoot,
    chains,
  };
  return { ...manifest, manifestDigest: digestOf(manifest) };
}

function validateTerminalPortfolioManifest(manifest) {
  const failures = [];
  if (manifest?.schemaVersion !== TERMINAL_PORTFOLIO_SCHEMA) failures.push(`ORCH_PORTFOLIO_SCHEMA:${manifest?.schemaVersion}`);
  if (!IDENTITY_RE.test(String(manifest?.portfolioId || ''))) failures.push(`ORCH_PORTFOLIO_ID_INVALID:${manifest?.portfolioId}`);
  if (!/^[0-9a-f]{40}$/u.test(String(manifest?.expectedSha || ''))) failures.push(`ORCH_PORTFOLIO_SHA_INVALID:${manifest?.expectedSha}`);
  if (!/^\d+\.\d+\.\d+$/u.test(String(manifest?.expectedWordVersion || ''))) failures.push(`ORCH_PORTFOLIO_WORD_VERSION_INVALID:${manifest?.expectedWordVersion}`);
  if (!/^\d+\.\d+\.\d+$/u.test(String(manifest?.expectedWordBuild || ''))) failures.push(`ORCH_PORTFOLIO_WORD_BUILD_INVALID:${manifest?.expectedWordBuild}`);
  if (!SHA256_DIGEST_RE.test(String(manifest?.corpusDigest || ''))) failures.push(`ORCH_PORTFOLIO_CORPUS_DIGEST_INVALID:${manifest?.corpusDigest}`);
  if (!path.isAbsolute(String(manifest?.corpusManifestPath || ''))) failures.push('ORCH_PORTFOLIO_CORPUS_MANIFEST_NOT_ABSOLUTE');
  else if (!fs.existsSync(manifest.corpusManifestPath)) failures.push(`ORCH_PORTFOLIO_CORPUS_MANIFEST_MISSING:${manifest.corpusManifestPath}`);
  else {
    const stat = fs.lstatSync(manifest.corpusManifestPath);
    if (stat.isSymbolicLink() || !stat.isFile()) failures.push(`ORCH_PORTFOLIO_CORPUS_MANIFEST_NOT_REGULAR:${manifest.corpusManifestPath}`);
    if (fs.realpathSync(manifest.corpusManifestPath) !== manifest.corpusManifestPath) failures.push(`ORCH_PORTFOLIO_CORPUS_MANIFEST_NOT_REALPATH:${manifest.corpusManifestPath}`);
    if (sha256File(manifest.corpusManifestPath) !== manifest.corpusManifestSha256) failures.push(`ORCH_PORTFOLIO_CORPUS_MANIFEST_HASH:${manifest.corpusManifestSha256}`);
  }
  if (!SHA256_DIGEST_RE.test(String(manifest?.corpusManifestSha256 || ''))) failures.push(`ORCH_PORTFOLIO_CORPUS_MANIFEST_SHA_INVALID:${manifest?.corpusManifestSha256}`);
  if (!SHA256_DIGEST_RE.test(String(manifest?.masterLedgerDigest || ''))) failures.push(`ORCH_PORTFOLIO_MASTER_LEDGER_DIGEST_INVALID:${manifest?.masterLedgerDigest}`);
  if (!SHA256_DIGEST_RE.test(String(manifest?.operationIdSetDigest || ''))) failures.push(`ORCH_PORTFOLIO_OPERATION_SET_DIGEST_INVALID:${manifest?.operationIdSetDigest}`);
  if (manifest?.campaignProfile !== TERMINAL_CAMPAIGN_PROFILE) failures.push(`ORCH_PORTFOLIO_CAMPAIGN_PROFILE_INVALID:${manifest?.campaignProfile}`);
  validateCanonicalScriptHashes(manifest?.scriptHashes, failures, 'ORCH_PORTFOLIO_SCRIPT_HASHES');
  const recomputedDigest = digestOf(manifestDigestBody(manifest));
  if (!SHA256_DIGEST_RE.test(String(manifest?.manifestDigest || '')) || manifest.manifestDigest !== recomputedDigest) {
    failures.push(`ORCH_PORTFOLIO_MANIFEST_DIGEST_MISMATCH:${manifest?.manifestDigest}:${recomputedDigest}`);
  }
  if (!path.isAbsolute(String(manifest?.artifactRoot || ''))) failures.push('ORCH_PORTFOLIO_ARTIFACT_ROOT_NOT_ABSOLUTE');
  if (!path.isAbsolute(String(manifest?.portfolioRoot || ''))) failures.push('ORCH_PORTFOLIO_ROOT_NOT_ABSOLUTE');
  if (manifest?.artifactRoot && manifest?.portfolioRoot) {
    const portfolioRelative = path.relative(path.resolve(manifest.artifactRoot), path.resolve(manifest.portfolioRoot));
    if (!portfolioRelative || portfolioRelative.startsWith('..') || path.isAbsolute(portfolioRelative)) failures.push(`ORCH_PORTFOLIO_ROOT_OUTSIDE:${manifest.portfolioRoot}`);
    const expectedPortfolioRoot = path.join(path.resolve(manifest.artifactRoot), `PORTFOLIO-${manifest.portfolioId || ''}`);
    if (path.resolve(manifest.portfolioRoot) !== expectedPortfolioRoot) failures.push(`ORCH_PORTFOLIO_ROOT_FORMULA:${manifest.portfolioRoot}:${expectedPortfolioRoot}`);
  }
  if (JSON.stringify(manifest?.roster || []) !== JSON.stringify(CHAIN_IDS)) failures.push('ORCH_PORTFOLIO_ROSTER_INVALID');
  if (!Array.isArray(manifest?.chains) || manifest.chains.length !== CHAIN_IDS.length) failures.push('ORCH_PORTFOLIO_CHAIN_COUNT_INVALID');
  const roots = new Set();
  for (let index = 0; index < CHAIN_IDS.length; index += 1) {
    const chain = manifest?.chains?.[index];
    if (!chain || chain.chainId !== CHAIN_IDS[index] || chain.order !== index + 1) failures.push(`ORCH_PORTFOLIO_CHAIN_ORDER_INVALID:${index + 1}`);
    const expectedCampaignId = `${manifest?.portfolioId || ''}-${CHAIN_IDS[index].toLowerCase()}-${String(index + 1).padStart(2, '0')}`;
    const expectedCampaignRoot = path.join(path.resolve(String(manifest?.portfolioRoot || '')), 'chains', expectedCampaignId);
    if (chain?.campaignId !== expectedCampaignId) failures.push(`ORCH_PORTFOLIO_CAMPAIGN_ID_FORMULA:${chain?.campaignId}:${expectedCampaignId}`);
    if (chain?.campaignRoot) {
      if (roots.has(chain.campaignRoot)) failures.push(`ORCH_PORTFOLIO_CHAIN_ROOT_DUPLICATE:${chain.campaignRoot}`);
      roots.add(chain.campaignRoot);
      const relative = path.relative(path.resolve(manifest.portfolioRoot || ''), path.resolve(chain.campaignRoot));
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) failures.push(`ORCH_PORTFOLIO_CHAIN_ROOT_OUTSIDE:${chain.campaignRoot}`);
      if (path.resolve(chain.campaignRoot) !== expectedCampaignRoot) failures.push(`ORCH_PORTFOLIO_CAMPAIGN_ROOT_FORMULA:${chain.campaignRoot}:${expectedCampaignRoot}`);
    }
  }
  return failures.length > 0 ? { ok: false, code: `ORCH_PORTFOLIO_INVALID:${failures.join('|')}`, failures } : { ok: true, code: 'ORCH_PORTFOLIO_VALID' };
}

function readJsonStrict(filePath, failures, code) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    failures.push(`${code}:${String(error?.message || error).slice(0, 120)}`);
    return null;
  }
}

function validateChainJournal({ journalPath, chain, manifest, chainSeal }) {
  const failures = [];
  if (!fs.existsSync(journalPath)) return { ok: false, failures: [`ORCH_PORTFOLIO_CHAIN_JOURNAL_MISSING:${chain.chainId}`] };
  const lines = fs.readFileSync(journalPath, 'utf8').split(/\r?\n/u).filter(Boolean);
  if (lines.length === 0) failures.push(`ORCH_PORTFOLIO_CHAIN_JOURNAL_EMPTY:${chain.chainId}`);
  let previousDigest = 'sha256:genesis';
  let chainSealedCount = 0;
  let preSealTipDigest = '';
  let finalDigest = '';
  const terminalFailures = new Set(['FAILED', 'QUARANTINED', 'LOCK_RELEASE_FAILED']);
  for (let index = 0; index < lines.length; index += 1) {
    let record = null;
    try { record = JSON.parse(lines[index]); } catch (error) {
      failures.push(`ORCH_PORTFOLIO_CHAIN_JOURNAL_MALFORMED:${chain.chainId}:${index + 1}:${String(error?.message || error).slice(0, 80)}`);
      continue;
    }
    if (record.schemaVersion !== ORCH_SCHEMA) failures.push(`ORCH_PORTFOLIO_CHAIN_JOURNAL_SCHEMA:${chain.chainId}:${index + 1}`);
    if (record.sequence !== index + 1) failures.push(`ORCH_PORTFOLIO_CHAIN_JOURNAL_SEQUENCE:${chain.chainId}:${record.sequence}:${index + 1}`);
    if (record.campaignId !== chain.campaignId || record.chainId !== chain.chainId || record.expectedSha !== manifest.expectedSha) {
      failures.push(`ORCH_PORTFOLIO_CHAIN_JOURNAL_IDENTITY:${chain.chainId}:${index + 1}`);
    }
    if (record.previousDigest !== previousDigest) failures.push(`ORCH_PORTFOLIO_CHAIN_JOURNAL_PREVIOUS:${chain.chainId}:${index + 1}`);
    const body = { ...record };
    delete body.digest;
    const recomputed = digestOf(body);
    if (record.digest !== recomputed) failures.push(`ORCH_PORTFOLIO_CHAIN_JOURNAL_DIGEST:${chain.chainId}:${index + 1}`);
    if (terminalFailures.has(record.transition)) failures.push(`ORCH_PORTFOLIO_CHAIN_JOURNAL_FAILURE_TRANSITION:${chain.chainId}:${record.transition}`);
    if (record.transition === 'CHAIN_SEALED') {
      chainSealedCount += 1;
      preSealTipDigest = record.previousDigest;
      if (record.detail?.chainSealDigest !== chainSeal.chainSealDigest) failures.push(`ORCH_PORTFOLIO_CHAIN_JOURNAL_SEAL_DIGEST:${chain.chainId}`);
      if (index !== lines.length - 1) failures.push(`ORCH_PORTFOLIO_CHAIN_JOURNAL_SEAL_NOT_TERMINAL:${chain.chainId}`);
    }
    previousDigest = record.digest || recomputed;
    finalDigest = previousDigest;
  }
  if (chainSealedCount !== 1) failures.push(`ORCH_PORTFOLIO_CHAIN_JOURNAL_SEAL_COUNT:${chain.chainId}:${chainSealedCount}`);
  if (chainSeal.journalTipDigest !== preSealTipDigest) failures.push(`ORCH_PORTFOLIO_CHAIN_JOURNAL_TIP:${chain.chainId}:${chainSeal.journalTipDigest}:${preSealTipDigest}`);
  return failures.length > 0
    ? { ok: false, failures }
    : { ok: true, preSealTipDigest, finalDigest };
}

function validatePortfolioAttemptJournals({ portfolioRoot, manifest }) {
  if (!fs.existsSync(portfolioRoot)) return { ok: true, code: 'ORCH_PORTFOLIO_NO_PRIOR_ATTEMPTS' };
  const attemptNames = fs.readdirSync(portfolioRoot)
    .filter((name) => /^attempt-\d{4}$/u.test(name))
    .sort();
  const failures = [];
  for (const attemptName of attemptNames) {
    const journalPath = path.join(portfolioRoot, attemptName, 'ORCHESTRATOR', 'chain-journal.jsonl');
    if (!fs.existsSync(journalPath)) {
      failures.push(`ORCH_PORTFOLIO_ATTEMPT_JOURNAL_MISSING:${attemptName}`);
      continue;
    }
    const lines = fs.readFileSync(journalPath, 'utf8').split(/\r?\n/u).filter(Boolean);
    if (lines.length === 0) failures.push(`ORCH_PORTFOLIO_ATTEMPT_JOURNAL_EMPTY:${attemptName}`);
    let previousDigest = 'sha256:genesis';
    let started = 0;
    let prepared = 0;
    let sealed = 0;
    let lastTransition = '';
    const terminalBad = new Set(['PORTFOLIO_FAILED', 'PORTFOLIO_QUARANTINED', 'PORTFOLIO_LOCK_RELEASE_FAILED']);
    for (let index = 0; index < lines.length; index += 1) {
      let record = null;
      try { record = JSON.parse(lines[index]); } catch (error) {
        failures.push(`ORCH_PORTFOLIO_ATTEMPT_JOURNAL_MALFORMED:${attemptName}:${index + 1}:${String(error?.message || error).slice(0, 80)}`);
        continue;
      }
      if (record.schemaVersion !== ORCH_SCHEMA) failures.push(`ORCH_PORTFOLIO_ATTEMPT_JOURNAL_SCHEMA:${attemptName}:${index + 1}`);
      if (record.sequence !== index + 1) failures.push(`ORCH_PORTFOLIO_ATTEMPT_JOURNAL_SEQUENCE:${attemptName}:${record.sequence}:${index + 1}`);
      if (record.campaignId !== manifest.portfolioId || record.chainId !== 'PORTFOLIO' || record.expectedSha !== manifest.expectedSha) {
        failures.push(`ORCH_PORTFOLIO_ATTEMPT_JOURNAL_IDENTITY:${attemptName}:${index + 1}`);
      }
      if (record.previousDigest !== previousDigest) failures.push(`ORCH_PORTFOLIO_ATTEMPT_JOURNAL_PREVIOUS:${attemptName}:${index + 1}`);
      const body = { ...record };
      delete body.digest;
      const recomputed = digestOf(body);
      if (record.digest !== recomputed) failures.push(`ORCH_PORTFOLIO_ATTEMPT_JOURNAL_DIGEST:${attemptName}:${index + 1}`);
      if (record.transition === 'PORTFOLIO_STARTED') started += 1;
      if (record.transition === 'PORTFOLIO_CLOSEOUT_PREPARED') prepared += 1;
      if (record.transition === 'PORTFOLIO_SEALED') sealed += 1;
      if (terminalBad.has(record.transition)) failures.push(`ORCH_PORTFOLIO_ATTEMPT_JOURNAL_FAILURE_TRANSITION:${attemptName}:${record.transition}`);
      if (sealed > 0 && index !== lines.length - 1) failures.push(`ORCH_PORTFOLIO_ATTEMPT_JOURNAL_SEAL_NOT_TERMINAL:${attemptName}`);
      lastTransition = record.transition || '';
      previousDigest = record.digest || recomputed;
    }
    if (started !== 1) failures.push(`ORCH_PORTFOLIO_ATTEMPT_JOURNAL_START_COUNT:${attemptName}:${started}`);
    if (prepared > 1 || sealed > 1) failures.push(`ORCH_PORTFOLIO_ATTEMPT_JOURNAL_CLOSEOUT_COUNT:${attemptName}:${prepared}:${sealed}`);
    if (prepared > 0 && sealed !== 1) failures.push(`ORCH_PORTFOLIO_ATTEMPT_JOURNAL_PREPARED_ONLY:${attemptName}`);
    if (sealed === 1 && lastTransition !== 'PORTFOLIO_SEALED') failures.push(`ORCH_PORTFOLIO_ATTEMPT_JOURNAL_SEAL_NOT_TERMINAL:${attemptName}`);
    if (sealed === 0 && prepared === 0) failures.push(`ORCH_PORTFOLIO_ATTEMPT_JOURNAL_NONTERMINAL:${attemptName}:${lastTransition}`);
  }
  return failures.length > 0
    ? { ok: false, code: `ORCH_PORTFOLIO_RESUME_JOURNAL_INVALID:${failures.join('|')}`, failures }
    : { ok: true, code: 'ORCH_PORTFOLIO_RESUME_JOURNALS_VALID' };
}

function validateStageSealFromRoot({ chain, manifest, stage, expectedPreviousSealDigest, proofState, failures }) {
  const sealPath = path.join(chain.campaignRoot, 'ORCHESTRATOR', `${stage.toLowerCase()}-stage-seal.json`);
  const seal = readJsonStrict(sealPath, failures, `ORCH_PORTFOLIO_STAGE_SEAL_MALFORMED:${chain.chainId}:${stage}`);
  if (!seal) return null;
  if (seal.schemaVersion !== STAGE_SEAL_SCHEMA || seal.stage !== stage) failures.push(`ORCH_PORTFOLIO_STAGE_SEAL_SCHEMA:${chain.chainId}:${stage}`);
  if (seal.previousSealDigest !== expectedPreviousSealDigest) failures.push(`ORCH_PORTFOLIO_STAGE_SEAL_PREVIOUS:${chain.chainId}:${stage}`);
  if (stableJson(seal.preflightScriptHashes || {}) !== stableJson(manifest.scriptHashes || {})) failures.push(`ORCH_PORTFOLIO_STAGE_SEAL_SCRIPT_HASHES:${chain.chainId}:${stage}`);
  const sealBody = { ...seal };
  delete sealBody.sealDigest;
  const recomputedSealDigest = digestOf(sealBody);
  if (seal.sealDigest !== recomputedSealDigest) failures.push(`ORCH_PORTFOLIO_STAGE_SEAL_DIGEST:${chain.chainId}:${stage}`);
  if (!seal.stageResultPath || !fs.existsSync(seal.stageResultPath) || !isCanonicalDescendant(chain.campaignRoot, seal.stageResultPath)) {
    failures.push(`ORCH_PORTFOLIO_STAGE_RESULT_PATH:${chain.chainId}:${stage}`);
  }
  if (!seal.stageResultPath || !fs.existsSync(seal.stageResultPath) || sha256File(seal.stageResultPath) !== seal.stageResultSha256) failures.push(`ORCH_PORTFOLIO_STAGE_RESULT_HASH:${chain.chainId}:${stage}`);
  const expectedStageRoot = stage === 'POSITIVE'
    ? path.join(chain.campaignRoot, 'MAIN')
    : stage === 'NEGATIVE'
      ? path.join(chain.campaignRoot, 'NEGATIVE')
      : (proofState.mainRunDir || path.join(chain.campaignRoot, 'MAIN'));
  const validation = validateStageResult({
    stage,
    resultPath: seal.stageResultPath,
    campaignId: chain.campaignId,
    chainId: chain.chainId,
    expectedSha: manifest.expectedSha,
    expectedWordVersion: manifest.expectedWordVersion,
    expectedWordBuild: manifest.expectedWordBuild,
    stageStartedAtMs: 0,
    expectedCampaignRoot: chain.campaignRoot,
    expectedStageRoot,
    expectedCorpusDigest: manifest.corpusDigest,
    expectedLedgerDigest: manifest.masterLedgerDigest,
    expectedOperationIdSetDigest: manifest.operationIdSetDigest,
    expectedPositiveLedgerDigest: manifest.masterLedgerDigest,
    expectedNegativeEvidenceDigest: proofState.negativeEvidenceDigest || '',
    expectedNegativeProbeIds: proofState.negativeProbeIds || [],
    expectedNegativeProbePlan: proofState.negativeProbeOperations || [],
    expectedPositiveSealDigest: proofState.positiveSealDigest || '',
    expectedNegativeSealDigest: proofState.negativeSealDigest || '',
    expectedRoundInventoryDigest: proofState.roundInventoryDigest || '',
    requiredOutputKeys: stage === 'POSITIVE'
      ? ['ledger', 'roundGates']
      : stage === 'NEGATIVE'
        ? ['evidence']
        : ['terminalAggregate'],
  });
  if (validation.ok !== true) failures.push(`ORCH_PORTFOLIO_STAGE_RESULT_INVALID:${chain.chainId}:${stage}:${validation.code}`);
  if (stage === 'POSITIVE') {
    proofState.positiveSealDigest = seal.sealDigest;
    proofState.negativeProbeIds = validation.proof?.negativeProbeIds || [];
    proofState.negativeProbeOperations = validation.proof?.negativeProbeOperations || [];
    proofState.roundInventoryDigest = validation.proof?.roundInventoryDigest || '';
    proofState.mainRunDir = validation.result?.stageData?.mainRunDir || expectedStageRoot;
  } else if (stage === 'NEGATIVE') {
    proofState.negativeSealDigest = seal.sealDigest;
    proofState.negativeEvidenceDigest = validation.proof?.evidenceDigest || validation.result?.stageData?.evidenceContentDigest || '';
  }
  return { seal, sealDigest: seal.sealDigest };
}

function validateTerminalChainSealFromRoot({ chain, manifest }) {
  const sealPath = path.join(chain.campaignRoot, 'ORCHESTRATOR', 'chain-seal.json');
  const journalPath = path.join(chain.campaignRoot, 'ORCHESTRATOR', 'chain-journal.jsonl');
  if (!fs.existsSync(sealPath)) return { ok: false, code: `ORCH_PORTFOLIO_CHAIN_SEAL_MISSING:${chain.chainId}` };
  if (!fs.existsSync(journalPath)) return { ok: false, code: `ORCH_PORTFOLIO_CHAIN_JOURNAL_MISSING:${chain.chainId}` };
  let seal;
  try { seal = JSON.parse(fs.readFileSync(sealPath, 'utf8')); } catch (error) {
    return { ok: false, code: `ORCH_PORTFOLIO_CHAIN_SEAL_MALFORMED:${chain.chainId}:${String(error.message || error).slice(0, 120)}` };
  }
  const failures = [];
  if (seal.schemaVersion !== ORCH_SCHEMA || seal.kind !== 'CHAIN_SEAL') failures.push(`ORCH_PORTFOLIO_CHAIN_SEAL_SCHEMA:${seal.schemaVersion}:${seal.kind}`);
  if (seal.campaignId !== chain.campaignId || seal.chainId !== chain.chainId) failures.push(`ORCH_PORTFOLIO_CHAIN_IDENTITY:${chain.chainId}:${seal.campaignId}:${seal.chainId}`);
  if (seal.expectedSha !== manifest.expectedSha) failures.push(`ORCH_PORTFOLIO_CHAIN_SHA:${chain.chainId}:${seal.expectedSha}`);
  if (seal.wordVersion !== manifest.expectedWordVersion || seal.wordBuild !== manifest.expectedWordBuild) failures.push(`ORCH_PORTFOLIO_CHAIN_WORD:${chain.chainId}:${seal.wordVersion}:${seal.wordBuild}`);
  if (stableJson(seal.scriptHashes || {}) !== stableJson(manifest.scriptHashes || {})) failures.push(`ORCH_PORTFOLIO_CHAIN_SCRIPT_HASHES:${chain.chainId}`);
  if (seal.corpusDigest !== manifest.corpusDigest) failures.push(`ORCH_PORTFOLIO_CHAIN_CORPUS:${chain.chainId}:${seal.corpusDigest}`);
  if (seal.corpusManifestPath !== manifest.corpusManifestPath || seal.corpusManifestSha256 !== manifest.corpusManifestSha256) {
    failures.push(`ORCH_PORTFOLIO_CHAIN_CORPUS_MANIFEST:${chain.chainId}`);
  }
  if (seal.masterLedgerDigest !== manifest.masterLedgerDigest) failures.push(`ORCH_PORTFOLIO_CHAIN_LEDGER:${chain.chainId}:${seal.masterLedgerDigest}`);
  if (seal.operationIdSetDigest !== manifest.operationIdSetDigest) failures.push(`ORCH_PORTFOLIO_CHAIN_OPERATION_SET:${chain.chainId}:${seal.operationIdSetDigest}`);
  if (seal.campaignProfile !== manifest.campaignProfile) failures.push(`ORCH_PORTFOLIO_CHAIN_PROFILE:${chain.chainId}:${seal.campaignProfile}`);
  if (!SHA256_DIGEST_RE.test(String(seal.closeoutPreparedDigest || ''))) failures.push(`ORCH_PORTFOLIO_CHAIN_CLOSEOUT_PREPARED_DIGEST:${chain.chainId}`);
  if (!SHA256_DIGEST_RE.test(String(seal.lockReleaseProofDigest || ''))) failures.push(`ORCH_PORTFOLIO_CHAIN_LOCK_RELEASE_PROOF_DIGEST:${chain.chainId}`);
  const preparedPath = path.join(chain.campaignRoot, 'ORCHESTRATOR', 'chain-closeout-prepared.json');
  const releaseProofPath = path.join(chain.campaignRoot, 'ORCHESTRATOR', 'chain-lock-release-proof.json');
  const closeoutPrepared = readJsonStrict(preparedPath, failures, `ORCH_PORTFOLIO_CHAIN_CLOSEOUT_PREPARED_MALFORMED:${chain.chainId}`);
  if (closeoutPrepared) {
    const body = { ...closeoutPrepared };
    const declared = body.closeoutPreparedDigest;
    delete body.closeoutPreparedDigest;
    const recomputed = digestOf(body);
    if (declared !== recomputed || declared !== seal.closeoutPreparedDigest) failures.push(`ORCH_PORTFOLIO_CHAIN_CLOSEOUT_PREPARED_DIGEST_MISMATCH:${chain.chainId}`);
    if (closeoutPrepared.kind !== 'CHAIN_CLOSEOUT_PREPARED' || closeoutPrepared.campaignId !== chain.campaignId || closeoutPrepared.chainId !== chain.chainId || closeoutPrepared.expectedSha !== manifest.expectedSha) {
      failures.push(`ORCH_PORTFOLIO_CHAIN_CLOSEOUT_PREPARED_IDENTITY:${chain.chainId}`);
    }
  }
  const releaseProof = readJsonStrict(releaseProofPath, failures, `ORCH_PORTFOLIO_CHAIN_LOCK_RELEASE_PROOF_MALFORMED:${chain.chainId}`);
  if (releaseProof) {
    const body = { ...releaseProof };
    const declared = body.lockReleaseProofDigest;
    delete body.lockReleaseProofDigest;
    const recomputed = digestOf(body);
    if (declared !== recomputed || declared !== seal.lockReleaseProofDigest) failures.push(`ORCH_PORTFOLIO_CHAIN_LOCK_RELEASE_PROOF_DIGEST_MISMATCH:${chain.chainId}`);
    if (releaseProof.kind !== 'CHAIN_LOCK_RELEASE_PROOF' || releaseProof.campaignId !== chain.campaignId || releaseProof.chainId !== chain.chainId || releaseProof.expectedSha !== manifest.expectedSha || releaseProof.closeoutPreparedDigest !== seal.closeoutPreparedDigest) {
      failures.push(`ORCH_PORTFOLIO_CHAIN_LOCK_RELEASE_PROOF_IDENTITY:${chain.chainId}`);
    }
  }
  const stageSeals = Array.isArray(seal.stageSeals) ? seal.stageSeals : [];
  if (JSON.stringify(stageSeals.map((entry) => entry.stage)) !== JSON.stringify(STAGES)) failures.push(`ORCH_PORTFOLIO_CHAIN_STAGE_SEALS:${chain.chainId}`);
  const proofState = {};
  let previousStageSealDigest = 'sha256:genesis';
  for (const stage of STAGES) {
    const stageSeal = validateStageSealFromRoot({
      chain,
      manifest,
      stage,
      expectedPreviousSealDigest: previousStageSealDigest,
      proofState,
      failures,
    });
    const declared = stageSeals.find((entry) => entry.stage === stage);
    if (stageSeal && declared?.sealDigest !== stageSeal.sealDigest) failures.push(`ORCH_PORTFOLIO_CHAIN_STAGE_SEAL_DIGEST:${chain.chainId}:${stage}`);
    previousStageSealDigest = stageSeal?.sealDigest || previousStageSealDigest;
  }
  const sealDigest = seal.chainSealDigest || '';
  const sealBody = { ...seal };
  delete sealBody.chainSealDigest;
  const recomputed = digestOf(sealBody);
  if (sealDigest !== recomputed) failures.push(`ORCH_PORTFOLIO_CHAIN_SEAL_DIGEST_MISMATCH:${chain.chainId}:${sealDigest}:${recomputed}`);
  const journalValidation = validateChainJournal({ journalPath, chain, manifest, chainSeal: seal });
  if (journalValidation.ok !== true) failures.push(...journalValidation.failures);
  if (failures.length > 0) return { ok: false, code: `ORCH_PORTFOLIO_CHAIN_SEAL_INVALID:${failures.join('|')}`, failures };
  return { ok: true, code: 'ORCH_PORTFOLIO_CHAIN_SEAL_VALID', chainSealDigest: sealDigest, sealPath, journalPath, seal };
}

export async function runTerminalPortfolio({
  manifest,
  chainExecutor,
  chainSealValidator = null,
  resumeSeals = {},
  resume = false,
  resumePortfolio = false,
  lockApi = null,
  secureVolumeProbe = defaultSecureVolumeProbe,
}) {
  const valid = validateTerminalPortfolioManifest(manifest);
  if (valid.ok !== true) return { ok: false, state: 'PORTFOLIO_INVALID', code: valid.code, failures: valid.failures || [] };
  if (typeof chainExecutor !== 'function') return { ok: false, state: 'PORTFOLIO_INVALID', code: 'ORCH_PORTFOLIO_CHAIN_EXECUTOR_REQUIRED' };
  const currentScriptHashes = computeCanonicalScriptHashes();
  if (stableJson(manifest.scriptHashes || {}) !== stableJson(currentScriptHashes)) {
    return {
      ok: false,
      state: 'PORTFOLIO_SCRIPT_HASH_MISMATCH',
      code: 'ORCH_PORTFOLIO_SCRIPT_HASHES_CURRENT_MISMATCH',
      expected: manifest.scriptHashes,
      actual: currentScriptHashes,
    };
  }
  const secureVolume = secureVolumeProbe({
    artifactRoot: manifest.artifactRoot,
    expectedUuid: SECURE_VOLUME_UUID,
    mountRoot: '/Volumes/T7-Secure',
  });
  if (!secureVolume || secureVolume.ok !== true) {
    return { ok: false, state: 'PORTFOLIO_AUTHORITY_FAILED', code: secureVolume?.code || 'ORCH_SECURE_VOLUME_UNAVAILABLE' };
  }
  const portfolioRoot = manifest.portfolioRoot;
  const hasResume = resume === true || resumePortfolio === true || Object.keys(resumeSeals || {}).length > 0;
  if (fs.existsSync(portfolioRoot) && !hasResume) {
    return { ok: false, state: 'PORTFOLIO_ROOT_EXISTS', code: `ORCH_PORTFOLIO_ROOT_COLLISION:${portfolioRoot}` };
  }
  if (!fs.existsSync(portfolioRoot) && hasResume) {
    return { ok: false, state: 'PORTFOLIO_RESUME_MISSING', code: `ORCH_PORTFOLIO_RESUME_ROOT_MISSING:${portfolioRoot}` };
  }
  if (hasResume) {
    const priorJournalValidation = validatePortfolioAttemptJournals({ portfolioRoot, manifest });
    if (priorJournalValidation.ok !== true) {
      return {
        ok: false,
        state: 'PORTFOLIO_RESUME_JOURNAL_INVALID',
        code: priorJournalValidation.code,
        failures: priorJournalValidation.failures || [],
      };
    }
  }
  const lockAcquire = lockApi && typeof lockApi.acquire === 'function' ? lockApi.acquire : acquireOrchestratorLock;
  const lockRelease = lockApi && typeof lockApi.release === 'function' ? lockApi.release : releaseOrchestratorLock;
  const lock = lockAcquire({
    lockRoot: path.join(manifest.artifactRoot, '.orchestrator-locks'),
    allowedRoot: manifest.artifactRoot,
    campaignId: manifest.portfolioId,
    chainId: 'PORTFOLIO',
    expectedSha: manifest.expectedSha,
  });
  if (lock.ok !== true) return { ok: false, state: 'PORTFOLIO_LOCK_FAILED', code: lock.code };
  let lockFinalized = false;
  let lockReleased = false;
  const releasePortfolioLock = (quarantined = false, reason = '') => {
    if (lockFinalized) return { released: lockReleased, code: 'ORCH_PORTFOLIO_LOCK_ALREADY_FINALIZED' };
    const released = lockRelease({
      lockDir: lock.lockDir,
      ownershipToken: lock.ownershipToken,
      campaignId: manifest.portfolioId,
      quarantined,
      quarantineReason: reason,
    });
    lockFinalized = true;
    lockReleased = released.released === true;
    return released;
  };
  const attemptNumber = hasResume && fs.existsSync(portfolioRoot)
    ? fs.readdirSync(portfolioRoot).filter((name) => /^attempt-\d{4}$/u.test(name)).length + 1
    : 1;
  const portfolioAttemptRoot = path.join(portfolioRoot, `attempt-${String(attemptNumber).padStart(4, '0')}`);
  if (fs.existsSync(portfolioAttemptRoot)) {
    const lockOutcome = releasePortfolioLock(false, '');
    return { ok: false, state: 'PORTFOLIO_ATTEMPT_EXISTS', code: `ORCH_PORTFOLIO_ATTEMPT_COLLISION:${portfolioAttemptRoot}`, lockOutcome: lockOutcome.code };
  }
  const portfolioJournal = createChainJournal({
    campaignRoot: portfolioAttemptRoot,
    campaignId: manifest.portfolioId,
    chainId: 'PORTFOLIO',
    expectedSha: manifest.expectedSha,
  });
  try {
    portfolioJournal.append('PORTFOLIO_STARTED', { manifestDigest: manifest.manifestDigest, attemptNumber });
    const chainSeals = [];
    let resumePrefixOpen = resumePortfolio === true;
    for (const chain of manifest.chains) {
      if (resumePrefixOpen) {
        const diskValidation = validateTerminalChainSealFromRoot({ chain, manifest });
        if (diskValidation.ok === true) {
          if (typeof chainSealValidator === 'function') {
            const extraValidation = chainSealValidator({ chain, chainSealDigest: diskValidation.chainSealDigest, resumed: true, manifest, chainSeal: diskValidation.seal });
            if (extraValidation.ok !== true) {
              portfolioJournal.append('PORTFOLIO_FAILED', { chainId: chain.chainId, code: extraValidation.code });
              releasePortfolioLock(false, '');
              return { ok: false, state: 'PORTFOLIO_RESUME_SEAL_INVALID', code: extraValidation.code, chainId: chain.chainId, chainSeals, portfolioAttemptRoot };
            }
          }
          chainSeals.push({ chainId: chain.chainId, chainSealDigest: diskValidation.chainSealDigest, resumed: true, sealPath: diskValidation.sealPath });
          portfolioJournal.append('PORTFOLIO_CHAIN_RESUMED', { chainId: chain.chainId, chainSealDigest: diskValidation.chainSealDigest });
          continue;
        }
        if (fs.existsSync(chain.campaignRoot)) {
          const code = `ORCH_PORTFOLIO_RESUME_CHAIN_PARTIAL_REQUIRES_NEW_IDENTITY:${chain.chainId}:${diskValidation.code}`;
          portfolioJournal.append('PORTFOLIO_FAILED', { chainId: chain.chainId, code });
          releasePortfolioLock(false, '');
          return { ok: false, state: 'PORTFOLIO_RESUME_CHAIN_PARTIAL', code, chainId: chain.chainId, chainSeals, portfolioAttemptRoot };
        }
        resumePrefixOpen = false;
      }
      const resumeSeal = resumeSeals[chain.chainId] || null;
      if (resumeSeal) {
        const validation = validateTerminalChainSealFromRoot({ chain, manifest });
        if (validation.ok !== true) {
          portfolioJournal.append('PORTFOLIO_FAILED', { chainId: chain.chainId, code: validation.code });
          releasePortfolioLock(false, '');
          return { ok: false, state: 'PORTFOLIO_RESUME_SEAL_INVALID', code: validation.code, chainId: chain.chainId, chainSeals, portfolioAttemptRoot };
        }
        if (resumeSeal.chainSealDigest && resumeSeal.chainSealDigest !== validation.chainSealDigest) {
          const code = `ORCH_PORTFOLIO_RESUME_SEAL_DIGEST_MISMATCH:${chain.chainId}`;
          portfolioJournal.append('PORTFOLIO_FAILED', { chainId: chain.chainId, code });
          releasePortfolioLock(false, '');
          return { ok: false, state: 'PORTFOLIO_RESUME_SEAL_INVALID', code, chainId: chain.chainId, chainSeals, portfolioAttemptRoot };
        }
        if (typeof chainSealValidator === 'function') {
          const extraValidation = chainSealValidator({ chain, chainSealDigest: validation.chainSealDigest, resumed: true, manifest, chainSeal: validation.seal });
          if (extraValidation.ok !== true) {
            portfolioJournal.append('PORTFOLIO_FAILED', { chainId: chain.chainId, code: extraValidation.code });
            releasePortfolioLock(false, '');
            return { ok: false, state: 'PORTFOLIO_RESUME_SEAL_INVALID', code: extraValidation.code, chainId: chain.chainId, chainSeals, portfolioAttemptRoot };
          }
        }
        chainSeals.push({ chainId: chain.chainId, chainSealDigest: validation.chainSealDigest, resumed: true, sealPath: validation.sealPath });
        portfolioJournal.append('PORTFOLIO_CHAIN_RESUMED', { chainId: chain.chainId, chainSealDigest: validation.chainSealDigest });
        continue;
      }
      let childRequestedQuarantine = false;
      let childQuarantineReason = '';
      const parentLockApi = {
        acquire: () => ({ ok: true, code: 'ORCH_PARENT_PORTFOLIO_LOCK_HELD', lockDir: lock.lockDir, ownershipToken: lock.ownershipToken }),
        release: ({ quarantined = false, quarantineReason = '' } = {}) => {
          if (quarantined) {
            childRequestedQuarantine = true;
            childQuarantineReason = quarantineReason || `ORCH_PORTFOLIO_CHILD_QUARANTINED:${chain.chainId}`;
            return releasePortfolioLock(true, childQuarantineReason);
          }
          return { released: true, code: 'ORCH_PARENT_PORTFOLIO_LOCK_RETAINED', retained: true };
        },
      };
      const result = await chainExecutor({
        chain,
        manifest,
        previousChainSeals: chainSeals.slice(),
        portfolioLock: lock,
        parentLockApi,
      });
      if (!result || result.ok !== true) {
        const code = result?.code || `ORCH_PORTFOLIO_CHAIN_FAILED:${chain.chainId}`;
        const quarantined = childRequestedQuarantine || result?.quarantined === true;
        portfolioJournal.append(quarantined ? 'PORTFOLIO_QUARANTINED' : 'PORTFOLIO_FAILED', { chainId: chain.chainId, code });
        releasePortfolioLock(quarantined, childQuarantineReason || code);
        return {
          ok: false,
          state: quarantined ? 'PORTFOLIO_QUARANTINED' : 'PORTFOLIO_CHAIN_FAILED',
          code,
          failedChainId: chain.chainId,
          chainSeals,
          portfolioAttemptRoot,
        };
      }
      const validation = validateTerminalChainSealFromRoot({ chain, manifest });
      if (validation.ok !== true) {
        portfolioJournal.append('PORTFOLIO_FAILED', { chainId: chain.chainId, code: validation.code });
        releasePortfolioLock(false, '');
        return { ok: false, state: 'PORTFOLIO_CHAIN_SEAL_INVALID', code: validation.code, failedChainId: chain.chainId, chainSeals, portfolioAttemptRoot };
      }
      if (result.chainSealDigest && result.chainSealDigest !== validation.chainSealDigest) {
        const code = `ORCH_PORTFOLIO_CHAIN_RESULT_DIGEST_MISMATCH:${chain.chainId}`;
        portfolioJournal.append('PORTFOLIO_FAILED', { chainId: chain.chainId, code });
        releasePortfolioLock(false, '');
        return { ok: false, state: 'PORTFOLIO_CHAIN_SEAL_INVALID', code, failedChainId: chain.chainId, chainSeals, portfolioAttemptRoot };
      }
      if (typeof chainSealValidator === 'function') {
        const extraValidation = chainSealValidator({ chain, chainSealDigest: validation.chainSealDigest, resumed: false, manifest, chainSeal: validation.seal });
        if (extraValidation.ok !== true) {
          portfolioJournal.append('PORTFOLIO_FAILED', { chainId: chain.chainId, code: extraValidation.code });
          releasePortfolioLock(false, '');
          return { ok: false, state: 'PORTFOLIO_CHAIN_SEAL_INVALID', code: extraValidation.code, failedChainId: chain.chainId, chainSeals, portfolioAttemptRoot };
        }
      }
      chainSeals.push({ chainId: chain.chainId, chainSealDigest: validation.chainSealDigest, resumed: false, sealPath: validation.sealPath });
      portfolioJournal.append('PORTFOLIO_CHAIN_SEALED', { chainId: chain.chainId, chainSealDigest: validation.chainSealDigest });
    }
    const receiptBody = {
      schemaVersion: TERMINAL_PORTFOLIO_RECEIPT_SCHEMA,
      portfolioId: manifest.portfolioId,
      manifestDigest: manifest.manifestDigest,
      expectedSha: manifest.expectedSha,
      expectedWordVersion: manifest.expectedWordVersion,
      expectedWordBuild: manifest.expectedWordBuild,
      corpusDigest: manifest.corpusDigest,
      masterLedgerDigest: manifest.masterLedgerDigest,
      operationIdSetDigest: manifest.operationIdSetDigest,
      campaignProfile: manifest.campaignProfile,
      repetitionIdentity: 'REPETITION_IDENTITY',
      chainSeals,
      sealedAtUtc: nowIso(),
    };
    const receiptDigest = digestOf(receiptBody);
    const receipt = { ...receiptBody, receiptDigest };
    const preparedBody = {
      schemaVersion: TERMINAL_PORTFOLIO_RECEIPT_SCHEMA,
      kind: 'PORTFOLIO_CLOSEOUT_PREPARED',
      portfolioId: manifest.portfolioId,
      manifestDigest: manifest.manifestDigest,
      expectedSha: manifest.expectedSha,
      chainSeals,
      preCloseoutJournalTipDigest: portfolioJournal.previousDigest,
      receiptDigest,
      preparedAtUtc: nowIso(),
    };
    const closeoutPreparedDigest = digestOf(preparedBody);
    writeJsonAtomicVerified(path.join(portfolioAttemptRoot, 'portfolio-closeout-prepared.json'), { ...preparedBody, closeoutPreparedDigest });
    portfolioJournal.append('PORTFOLIO_CLOSEOUT_PREPARED', { closeoutPreparedDigest });
    const releasePreparedJournalTipDigest = portfolioJournal.previousDigest;
    const lockOutcome = releasePortfolioLock(false, '');
    if (lockReleased !== true) {
      portfolioJournal.append('PORTFOLIO_LOCK_RELEASE_FAILED', { code: lockOutcome.code, lockDir: lock.lockDir });
      return { ok: false, state: 'PORTFOLIO_LOCK_RELEASE_FAILED', code: lockOutcome.code, chainSeals, portfolioAttemptRoot };
    }
    const releaseProofBody = {
      schemaVersion: TERMINAL_PORTFOLIO_RECEIPT_SCHEMA,
      kind: 'PORTFOLIO_LOCK_RELEASE_PROOF',
      portfolioId: manifest.portfolioId,
      manifestDigest: manifest.manifestDigest,
      expectedSha: manifest.expectedSha,
      lockDir: lock.lockDir,
      releaseCode: lockOutcome.code || '',
      closeoutPreparedDigest,
      releasedAtUtc: nowIso(),
    };
    const lockReleaseProofDigest = digestOf(releaseProofBody);
    writeJsonAtomicVerified(path.join(portfolioAttemptRoot, 'portfolio-lock-release-proof.json'), { ...releaseProofBody, lockReleaseProofDigest });
    const sealBody = {
      schemaVersion: TERMINAL_PORTFOLIO_SEAL_SCHEMA,
      portfolioId: manifest.portfolioId,
      manifestDigest: manifest.manifestDigest,
      receiptDigest,
      chainSeals,
      closeoutPreparedDigest,
      lockReleaseProofDigest,
      journalTipDigest: releasePreparedJournalTipDigest,
      sealedAtUtc: nowIso(),
    };
    const portfolioSealDigest = digestOf(sealBody);
    const receiptPublication = writeJsonAtomicVerified(path.join(portfolioAttemptRoot, 'portfolio-receipt.json'), receipt);
    portfolioJournal.append('PORTFOLIO_RECEIPT_WRITTEN', { receiptDigest });
    const sealPublication = writeJsonAtomicVerified(path.join(portfolioAttemptRoot, 'portfolio-seal.json'), { ...sealBody, portfolioSealDigest });
    portfolioJournal.append('PORTFOLIO_SEALED', { portfolioSealDigest });
    return {
      ok: true,
      state: 'PORTFOLIO_SEALED',
      code: 'ORCH_PORTFOLIO_SEALED',
      receipt,
      receiptPath: receiptPublication.path,
      portfolioSeal: { ...sealBody, portfolioSealDigest },
      portfolioSealPath: sealPublication.path,
      portfolioRoot,
      portfolioAttemptRoot,
    };
  } catch (error) {
    const code = `ORCH_PORTFOLIO_UNKNOWN_EXCEPTION:${String(error?.message || error).slice(0, 160)}`;
    try { portfolioJournal.append('PORTFOLIO_QUARANTINED', { code }); } catch { /* noop */ }
    const lockOutcome = releasePortfolioLock(true, code);
    return { ok: false, state: 'PORTFOLIO_QUARANTINED', code, lockOutcome: lockOutcome.code, portfolioRoot, portfolioAttemptRoot };
  } finally {
    if (!lockFinalized) releasePortfolioLock(false, '');
  }
}

function parsePortfolioCliArgs(argv = []) {
  const out = { portfolioManifestPath: '', preflightOnly: false, resumePortfolio: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--preflight-only') {
      if (out.preflightOnly) throw new Error('ORCH_DUPLICATE_ARG:--preflight-only');
      out.preflightOnly = true;
      continue;
    }
    if (arg === '--resume-portfolio') {
      if (out.resumePortfolio) throw new Error('ORCH_DUPLICATE_ARG:--resume-portfolio');
      out.resumePortfolio = true;
      continue;
    }
    if (arg !== '--portfolio-manifest') throw new Error(`ORCH_UNKNOWN_ARG:${arg}`);
    if (out.portfolioManifestPath) throw new Error('ORCH_DUPLICATE_ARG:--portfolio-manifest');
    const value = argv[index + 1];
    if (!value || String(value).startsWith('--')) throw new Error('ORCH_ARG_VALUE_MISSING:--portfolio-manifest');
    out.portfolioManifestPath = path.resolve(value);
    index += 1;
  }
  if (!out.portfolioManifestPath) throw new Error('ORCH_ARG_REQUIRED:--portfolio-manifest');
  return out;
}

async function runTerminalPortfolioCli(argv = [], deps = {}) {
  const parsed = parsePortfolioCliArgs(argv);
  const manifest = JSON.parse(fs.readFileSync(parsed.portfolioManifestPath, 'utf8'));
  if (parsed.preflightOnly) {
    const valid = validateTerminalPortfolioManifest(manifest);
    if (valid.ok !== true) return { ok: false, state: 'PORTFOLIO_PREFLIGHT_FAILED', code: valid.code, failures: valid.failures || [] };
    const currentScriptHashes = computeCanonicalScriptHashes();
    if (stableJson(manifest.scriptHashes || {}) !== stableJson(currentScriptHashes)) {
      return { ok: false, state: 'PORTFOLIO_PREFLIGHT_FAILED', code: 'ORCH_PORTFOLIO_SCRIPT_HASHES_CURRENT_MISMATCH', expected: manifest.scriptHashes, actual: currentScriptHashes };
    }
    return { ok: true, state: 'PORTFOLIO_PREFLIGHT_ONLY_GREEN', code: 'ORCH_PORTFOLIO_PREFLIGHT_ONLY_GREEN', manifestDigest: manifest.manifestDigest };
  }
  const runPortfolio = typeof deps.runTerminalPortfolio === 'function' ? deps.runTerminalPortfolio : runTerminalPortfolio;
  const runSingleChain = typeof deps.runSingleChainOrchestrator === 'function' ? deps.runSingleChainOrchestrator : runSingleChainOrchestrator;
  return runPortfolio({
    manifest,
    chainExecutor: async ({ chain, parentLockApi }) => runSingleChain({
      options: {
        expectedSha: manifest.expectedSha,
        expectedWordVersion: manifest.expectedWordVersion,
        expectedWordBuild: manifest.expectedWordBuild,
        expectedCorpusDigest: manifest.corpusDigest,
        corpusManifestPath: manifest.corpusManifestPath,
        expectedLedgerDigest: manifest.masterLedgerDigest,
        expectedOperationIdSetDigest: manifest.operationIdSetDigest,
        campaignProfile: manifest.campaignProfile,
        artifactRoot: manifest.artifactRoot,
        campaignId: chain.campaignId,
        chainId: chain.chainId,
        resume: false,
        stageTimeoutMs: 6 * 60 * 60 * 1000,
        progressTimeoutMs: 30 * 60 * 1000,
        killGraceMs: 5000,
        preflightOnly: false,
        campaignRoot: chain.campaignRoot,
      },
      lockApi: parentLockApi,
    }),
    resumePortfolio: parsed.resumePortfolio,
  });
}

export async function mainWithDeps({
  argv = [],
  env = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
  runSingleChainOrchestrator: runSingleChain = runSingleChainOrchestrator,
  runTerminalPortfolio: runPortfolio = runTerminalPortfolio,
  runPreflightOnly = runOrchestratorPreflightOnly,
} = {}) {
  try {
    assertNoProductionEnvBypass(env);
    const outcome = argv.includes('--portfolio-manifest')
      ? await runTerminalPortfolioCli(argv, { runTerminalPortfolio: runPortfolio, runSingleChainOrchestrator: runSingleChain })
      : (() => {
          const options = parseOrchestratorArgs(argv);
          return options.preflightOnly
            ? runPreflightOnly({ options })
            : runSingleChain({ options });
        })();
    const resolved = outcome && typeof outcome.then === 'function' ? await outcome : outcome;
    stdout.write(JSON.stringify(resolved, null, 2) + '\n');
    return { exitCode: resolved.ok === true ? 0 : 1, outcome: resolved };
  } catch (error) {
    stderr.write(`ORCH_FATAL:${String(error && error.message ? error.message : error)}\n`);
    return { exitCode: 1, error };
  }
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

async function main() {
  const result = await mainWithDeps({ argv: process.argv.slice(2), env: process.env, stdout: process.stdout, stderr: process.stderr });
  process.exitCode = result.exitCode;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(THIS_FILE)) {
  main().catch((error) => {
    process.stderr.write(`ORCH_FATAL:${String(error && error.message ? error.message : error)}\n`);
    process.exitCode = 1;
  });
}
