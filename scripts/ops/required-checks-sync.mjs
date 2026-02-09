#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const CONTRACT_PATH = process.env.REQUIRED_CHECKS_CONTRACT_PATH || 'scripts/ops/required-checks.json';
const MODE_LOCAL = 'LOCAL_EXEC';
const MODE_DELIVERY = 'DELIVERY_EXEC';
const DEFAULT_TTL_DAYS = 7;

function parseArgs(argv) {
  const out = { mode: '', pr: '', repo: '', profile: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === '--mode') {
      out.mode = String(argv[i + 1] || '').trim();
      i += 1;
    } else if (item === '--pr') {
      out.pr = String(argv[i + 1] || '').trim();
      i += 1;
    } else if (item === '--repo') {
      out.repo = String(argv[i + 1] || '').trim();
      i += 1;
    } else if (item === '--profile') {
      out.profile = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }
  return out;
}

function normalizeMode(value) {
  if (value) return value.toUpperCase();
  if (process.env.OPS_EXEC_MODE) return String(process.env.OPS_EXEC_MODE).toUpperCase();
  return MODE_LOCAL;
}

function normalizeProfile(value) {
  const profile = String(value || process.env.REQUIRED_CHECKS_PROFILE || 'default').trim();
  return profile.length > 0 ? profile : 'default';
}

function runGh(args) {
  return spawnSync('gh', args, { encoding: 'utf8' });
}

function hasStringArray(value) {
  return Array.isArray(value) && value.every((it) => typeof it === 'string');
}

function validateContract(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: 0, reason: 'contract_not_object' };
  }
  if (parsed.schemaVersion !== 1) return { ok: 0, reason: 'schema_version_invalid' };
  if (!Number.isInteger(parsed.ttlDays) || parsed.ttlDays <= 0) return { ok: 0, reason: 'ttl_invalid' };
  if (!(parsed.lastSyncedAt === null || typeof parsed.lastSyncedAt === 'string')) {
    return { ok: 0, reason: 'last_synced_at_invalid' };
  }
  if (!(parsed.lastSyncSource === undefined || parsed.lastSyncSource === 'local' || parsed.lastSyncSource === 'api')) {
    return { ok: 0, reason: 'last_sync_source_invalid' };
  }
  if (!parsed.profiles || typeof parsed.profiles !== 'object' || Array.isArray(parsed.profiles)) {
    return { ok: 0, reason: 'profiles_invalid' };
  }
  for (const key of ['ops', 'sector', 'default']) {
    const profile = parsed.profiles[key];
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
      return { ok: 0, reason: `profile_${key}_missing` };
    }
    if (!hasStringArray(profile.required)) {
      return { ok: 0, reason: `profile_${key}_required_invalid` };
    }
  }
  return { ok: 1, reason: '' };
}

function readContractOrDefault() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
    const valid = validateContract(parsed);
    if (valid.ok === 1) return parsed;
  } catch {
    // fallthrough
  }
  return {
    schemaVersion: 1,
    ttlDays: DEFAULT_TTL_DAYS,
    lastSyncedAt: null,
    lastSyncSource: 'local',
    profiles: {
      ops: { required: ['oss-policy', 'test:ops'] },
      sector: { required: ['oss-policy', 'test:sector'] },
      default: { required: ['oss-policy'] },
    },
  };
}

function writeContract(contract) {
  fs.mkdirSync(path.dirname(CONTRACT_PATH), { recursive: true });
  fs.writeFileSync(CONTRACT_PATH, `${JSON.stringify(contract, null, 2)}\n`, 'utf8');
}

function computeStale(contract) {
  if (!contract || contract.lastSyncedAt === null) return 1;
  const parsed = Date.parse(String(contract.lastSyncedAt || ''));
  if (Number.isNaN(parsed)) return 1;
  const ttlDays = Number.isInteger(contract.ttlDays) && contract.ttlDays > 0 ? contract.ttlDays : DEFAULT_TTL_DAYS;
  return Date.now() - parsed > ttlDays * 24 * 60 * 60 * 1000 ? 1 : 0;
}

function loadFixtureChecks() {
  const fixturePath = process.env.REQUIRED_CHECKS_SYNC_FIXTURE_PATH;
  if (!fixturePath) return null;
  const parsed = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const checks = Array.isArray(parsed.requiredChecks) ? parsed.requiredChecks : [];
  return checks.map((it) => String(it || '').trim()).filter(Boolean);
}

function discoverPrNumber(argPr, repo) {
  if (argPr) return argPr;
  if (process.env.PR_NUMBER) return String(process.env.PR_NUMBER).trim();
  const branch = spawnSync('git', ['branch', '--show-current'], { encoding: 'utf8' });
  if (branch.status !== 0) return '';
  const head = String(branch.stdout || '').trim();
  if (!head) return '';
  const listArgs = ['pr', 'list', '--state', 'open', '--head', head, '--json', 'number', '--limit', '1'];
  if (repo) listArgs.push('--repo', repo);
  const listed = runGh(listArgs);
  if (listed.status !== 0) return '';
  try {
    const parsed = JSON.parse(String(listed.stdout || '[]'));
    if (!Array.isArray(parsed) || parsed.length === 0) return '';
    return String(parsed[0].number || '').trim();
  } catch {
    return '';
  }
}

function fetchChecksViaGh(prNumber, repo) {
  const probe = runGh(['--version']);
  if (probe.status !== 0) return { ok: 0, checks: [], detail: 'gh_cli_missing' };
  if (!prNumber) return { ok: 0, checks: [], detail: 'pr_number_missing' };

  const args = ['pr', 'view', prNumber, '--json', 'statusCheckRollup'];
  if (repo) args.push('--repo', repo);
  const viewed = runGh(args);
  if (viewed.status !== 0) {
    return { ok: 0, checks: [], detail: String(viewed.stderr || 'gh_pr_view_failed').trim() };
  }

  try {
    const parsed = JSON.parse(String(viewed.stdout || '{}'));
    const rollup = Array.isArray(parsed.statusCheckRollup) ? parsed.statusCheckRollup : [];
    const checks = [];
    for (const item of rollup) {
      const name = String(
        item.context
        || item.name
        || (item.workflowName && item.workflowName.length > 0 ? item.workflowName : ''),
      ).trim();
      if (name) checks.push(name);
    }
    return { ok: 1, checks: [...new Set(checks)].sort(), detail: 'gh_status_check_rollup_ok' };
  } catch {
    return { ok: 0, checks: [], detail: 'gh_status_check_rollup_json_invalid' };
  }
}

function printTokens(out) {
  console.log(`REQUIRED_CHECKS_CONTRACT_PRESENT_OK=${out.contractPresentOk}`);
  console.log(`REQUIRED_CHECKS_SYNC_OK=${out.syncOk}`);
  console.log(`REQUIRED_CHECKS_SOURCE=${out.source}`);
  console.log(`REQUIRED_CHECKS_STALE=${out.stale}`);
  console.log(`REQUIRED_CHECKS_COUNT=${out.count}`);
  console.log(`REQUIRED_CHECKS_PROFILE=${out.profile}`);
  console.log(`REQUIRED_CHECKS_DETAIL=${out.detail}`);
  if (out.failReason) console.log(`FAIL_REASON=${out.failReason}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = normalizeMode(args.mode);
  const profile = normalizeProfile(args.profile);
  const fixtureChecks = loadFixtureChecks();
  const contract = readContractOrDefault();
  const contractValid = validateContract(contract);
  const contractPresentOk = contractValid.ok;

  if (contractPresentOk !== 1) {
    printTokens({
      contractPresentOk: 0,
      syncOk: 0,
        source: 'local',
        stale: 1,
        count: 0,
        profile,
        detail: contractValid.reason,
        failReason: 'REQUIRED_CHECKS_CONTRACT_INVALID',
      });
    process.exit(1);
  }

  if (!Object.prototype.hasOwnProperty.call(contract.profiles, profile)) {
    printTokens({
      contractPresentOk: 1,
      syncOk: 0,
      source: 'local',
      stale: 1,
      count: 0,
      profile,
      detail: 'profile_not_found',
      failReason: 'REQUIRED_CHECKS_PROFILE_INVALID',
    });
    process.exit(1);
  }

  if (mode !== MODE_DELIVERY) {
    const stale = computeStale(contract);
    const count = contract.profiles[profile].required.length;
    printTokens({
      contractPresentOk: 1,
      syncOk: 0,
      source: 'local',
      stale,
      count,
      profile,
      detail: 'local_mode_contract_valid',
      failReason: '',
    });
    process.exit(0);
  }

  let checks = [];
  let detail = '';
  if (fixtureChecks) {
    checks = fixtureChecks;
    detail = 'fixture_required_checks_ok';
  } else {
    const prNumber = discoverPrNumber(args.pr, args.repo);
    const fetched = fetchChecksViaGh(prNumber, args.repo);
    if (fetched.ok !== 1) {
      printTokens({
        contractPresentOk: 1,
        syncOk: 0,
        source: 'local',
        stale: 1,
        count: 0,
        profile,
        detail: fetched.detail,
        failReason: 'REQUIRED_CHECKS_SOURCE_UNAVAILABLE',
      });
      process.exit(1);
    }
    checks = fetched.checks;
    detail = fetched.detail;
  }

  const synced = {
    ...contract,
    lastSyncedAt: new Date().toISOString(),
    lastSyncSource: 'api',
    profiles: {
      ...contract.profiles,
      [profile]: { required: checks },
    },
  };
  writeContract(synced);

  printTokens({
    contractPresentOk: 1,
    syncOk: 1,
    source: 'api',
    stale: computeStale(synced),
    count: checks.length,
    profile,
    detail,
    failReason: '',
  });
}

main();
