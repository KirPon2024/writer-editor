#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateHeadStrictState } from './head-strict-state.mjs';
import { evaluateNextSectorState, loadSectorStatuses } from './next-sector-state.mjs';
import { evaluateRequiredChecksState } from './required-checks-state.mjs';

const TOOL_VERSION = 'strategy-progress-valid-state.v1';
const CONFIG_POLICY_VERSION = 'strategy-progress-valid-config.v1';
const CANON_SECTOR_IDS = Object.freeze(['M', 'P', 'U', 'W']);
const ALLOWED_SECTOR_STATUSES = new Set([
  'TODO',
  'PLANNED',
  'ACTIVE',
  'IN_PROGRESS',
  'DONE',
  'BLOCKED',
  'UNKNOWN',
]);

function runGit(args, cwd) {
  return spawnSync('git', args, { encoding: 'utf8', cwd });
}

function readStdout(result) {
  return String(result && result.stdout ? result.stdout : '').trim();
}

function toToken(value) {
  if (typeof value === 'number') return value === 1 ? 1 : 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') return value.trim() === '1' ? 1 : 0;
  return 0;
}

function stableSortValue(value) {
  if (Array.isArray(value)) return value.map((item) => stableSortValue(item));
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = stableSortValue(value[key]);
  return out;
}

function stableStringify(value) {
  return JSON.stringify(stableSortValue(value));
}

function sha256Hex(input) {
  return createHash('sha256').update(input).digest('hex');
}

function parseArgs(argv) {
  const out = {
    json: false,
    repoRoot: '',
    statusDir: '',
    nextSectorPath: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    else if (arg === '--repo-root') {
      out.repoRoot = String(argv[i + 1] || '').trim();
      i += 1;
    } else if (arg === '--status-dir') {
      out.statusDir = String(argv[i + 1] || '').trim();
      i += 1;
    } else if (arg === '--next-sector-path') {
      out.nextSectorPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }
  return out;
}

function evaluateRemoteBinding(repoRoot) {
  const headRes = runGit(['rev-parse', 'HEAD'], repoRoot);
  const originRes = runGit(['rev-parse', 'origin/main'], repoRoot);
  const ancestorRes = runGit(['merge-base', '--is-ancestor', 'origin/main', 'HEAD'], repoRoot);
  const headSha = readStdout(headRes);
  const originMainSha = readStdout(originRes);
  const headEqualsOrigin = headRes.status === 0 && originRes.status === 0 && headSha === originMainSha;
  const ancestorOk = ancestorRes.status === 0;
  return {
    headSha,
    originMainSha,
    headEqualsOrigin: headEqualsOrigin ? 1 : 0,
    ancestorOk: ancestorOk ? 1 : 0,
    remoteBindingOk: headEqualsOrigin && ancestorOk ? 1 : 0,
  };
}

function normalizeHeadStrictState(state) {
  return {
    mode: String(state.mode || '').trim(),
    ok: toToken(state.ok),
    failReason: String(state.failReason || '').trim(),
    headSha: String(state.headSha || '').trim(),
    originMainSha: String(state.originMainSha || '').trim(),
    headEqualsOrigin: toToken(state.headEqualsOrigin),
    originAncestorOfHead: toToken(state.originAncestorOfHead),
    releaseTagPresent: toToken(state.releaseTagPresent),
  };
}

function normalizeRequiredChecksState(state) {
  return {
    syncOk: toToken(state.syncOk),
    stale: toToken(state.stale),
    source: String(state.source || '').trim(),
    failReason: String(state.failReason || '').trim(),
  };
}

function normalizeNextSectorState(state) {
  const knownSectors = Array.isArray(state.knownSectors)
    ? state.knownSectors.map((value) => String(value || '').trim()).filter(Boolean).sort()
    : [];
  return {
    valid: state.valid === true,
    failReason: String(state.failReason || '').trim(),
    id: String(state.id || '').trim(),
    mode: String(state.mode || '').trim(),
    reason: String(state.reason || '').trim(),
    targetSector: String(state.targetSector || '').trim(),
    targetStatus: String(state.targetStatus || '').trim(),
    allSectorsDone: state.allSectorsDone === true,
    knownSectors,
  };
}

function normalizeSectorStatuses(value) {
  const statuses = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const out = {};
  for (const key of Object.keys(statuses).sort()) {
    out[key] = String(statuses[key] || '').trim().toUpperCase() || 'UNKNOWN';
  }
  return out;
}

export function evaluateStrategyProgressValidState(input = {}) {
  const repoRoot = String(input.repoRoot || process.cwd()).trim() || process.cwd();
  const statusDir = String(input.statusDir || process.env.OPS_STATUS_DIR || 'docs/OPS/STATUS').trim();
  const nextSectorPath = String(
    input.nextSectorPath || process.env.NEXT_SECTOR_STATUS_PATH || path.join(statusDir, 'NEXT_SECTOR.json'),
  ).trim();

  const remote = input.remote && typeof input.remote === 'object'
    ? input.remote
    : evaluateRemoteBinding(repoRoot);
  const headStrictRaw = input.headStrict && typeof input.headStrict === 'object'
    ? input.headStrict
    : evaluateHeadStrictState({ mode: 'release' });
  const requiredChecksRaw = input.requiredChecks && typeof input.requiredChecks === 'object'
    ? input.requiredChecks
    : evaluateRequiredChecksState({ profile: 'ops' });
  const nextSectorRaw = input.nextSector && typeof input.nextSector === 'object'
    ? input.nextSector
    : evaluateNextSectorState({ statusDir, nextSectorPath });
  const sectorStatusesRaw = input.sectorStatuses && typeof input.sectorStatuses === 'object'
    ? input.sectorStatuses
    : loadSectorStatuses(statusDir);

  const headStrict = normalizeHeadStrictState(headStrictRaw);
  const requiredChecks = normalizeRequiredChecksState(requiredChecksRaw);
  const nextSector = normalizeNextSectorState(nextSectorRaw);
  const sectorStatuses = normalizeSectorStatuses(sectorStatusesRaw);
  const knownSectors = Object.keys(sectorStatuses).sort();

  const failures = new Set();
  if (toToken(remote.remoteBindingOk) !== 1) failures.add('E_STRATEGY_PROGRESS_REMOTE_BINDING_INVALID');
  if (headStrict.ok !== 1) failures.add('E_STRATEGY_PROGRESS_HEAD_BINDING_INVALID');
  if (requiredChecks.syncOk !== 1) failures.add('E_STRATEGY_PROGRESS_REQUIRED_CHECKS_SYNC_MISSING');
  if (requiredChecks.stale !== 0) failures.add('E_STRATEGY_PROGRESS_REQUIRED_CHECKS_STALE');
  if (requiredChecks.source !== 'canonical') {
    failures.add('E_STRATEGY_PROGRESS_REQUIRED_CHECKS_SOURCE_NON_CANONICAL');
  }

  if (knownSectors.length === 0) {
    failures.add('E_STRATEGY_PROGRESS_SECTOR_STATUSES_MISSING');
  }
  const missingCanonSectors = CANON_SECTOR_IDS.filter((sectorId) => !knownSectors.includes(sectorId));
  if (missingCanonSectors.length > 0) {
    failures.add('E_STRATEGY_PROGRESS_CANON_SECTORS_MISSING');
  }

  const invalidSectorStatusIds = knownSectors
    .filter((sectorId) => !ALLOWED_SECTOR_STATUSES.has(sectorStatuses[sectorId]));
  if (invalidSectorStatusIds.length > 0) {
    failures.add('E_STRATEGY_PROGRESS_SECTOR_STATUS_INVALID');
  }

  if (!nextSector.valid) {
    failures.add('E_STRATEGY_PROGRESS_NEXT_SECTOR_INVALID');
  } else if (nextSector.allSectorsDone) {
    if (nextSector.id !== 'NONE' || nextSector.mode !== 'IDLE' || nextSector.reason !== 'ALL_SECTORS_DONE') {
      failures.add('E_STRATEGY_PROGRESS_IDLE_CONTRACT_INVALID');
    }
  } else if (!nextSector.targetSector || nextSector.targetStatus === 'DONE') {
    failures.add('E_STRATEGY_PROGRESS_TARGET_CONTRACT_INVALID');
  }

  const sortedFailures = [...failures].sort();
  const ok = sortedFailures.length === 0;
  const status = ok ? 'VALID' : 'PLACEHOLDER';
  const details = {
    remote: {
      headSha: String(remote.headSha || '').trim(),
      originMainSha: String(remote.originMainSha || '').trim(),
      headEqualsOrigin: toToken(remote.headEqualsOrigin),
      ancestorOk: toToken(remote.ancestorOk),
      remoteBindingOk: toToken(remote.remoteBindingOk),
    },
    headStrict,
    requiredChecks,
    nextSector,
    sectorStatuses,
    knownSectors,
    missingCanonSectors,
    invalidSectorStatusIds,
  };
  const configHash = sha256Hex(stableStringify({
    policyVersion: CONFIG_POLICY_VERSION,
    details,
  }));
  const tokenValue = ok ? 1 : 0;

  return {
    ok,
    status,
    failures: sortedFailures,
    details,
    configHash,
    token: {
      STRATEGY_PROGRESS_VALID: tokenValue,
    },
    STRATEGY_PROGRESS_VALID: tokenValue,
    toolVersion: TOOL_VERSION,
  };
}

function printTokens(state) {
  console.log(`STRATEGY_PROGRESS_VALID=${state.STRATEGY_PROGRESS_VALID}`);
  console.log(`STRATEGY_PROGRESS_STATUS=${state.status}`);
  console.log(`STRATEGY_PROGRESS_CONFIG_HASH=${state.configHash}`);
  if (state.failures.length > 0) console.log(`FAIL_REASON=${state.failures[0]}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateStrategyProgressValidState({
    repoRoot: args.repoRoot,
    statusDir: args.statusDir,
    nextSectorPath: args.nextSectorPath,
  });
  if (args.json) process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  else printTokens(state);
  process.exit(0);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
