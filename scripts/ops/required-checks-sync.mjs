#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const CONTRACT_PATH = process.env.REQUIRED_CHECKS_CONTRACT_PATH || 'scripts/ops/required-checks.json';
const STALE_DAYS = 7;
const MODE_LOCAL = 'LOCAL_EXEC';
const MODE_DELIVERY = 'DELIVERY_EXEC';

function parseArgs(argv) {
  const out = { mode: '', pr: '', repo: '' };
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
    }
  }
  return out;
}

function normalizeMode(value) {
  if (value) return value.toUpperCase();
  if (process.env.OPS_EXEC_MODE) return String(process.env.OPS_EXEC_MODE).toUpperCase();
  return MODE_LOCAL;
}

function runGh(args) {
  return spawnSync('gh', args, { encoding: 'utf8' });
}

function readContractOrDefault() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('contract_not_object');
    return parsed;
  } catch {
    return {
      schemaVersion: 'required-checks.v1',
      updatedAt: '',
      source: 'local',
      requiredChecks: [],
    };
  }
}

function writeContract(requiredChecks, source) {
  const payload = {
    schemaVersion: 'required-checks.v1',
    updatedAt: new Date().toISOString(),
    source,
    requiredChecks: requiredChecks.slice().sort(),
  };
  fs.writeFileSync(CONTRACT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

function isStale(updatedAt) {
  if (!updatedAt) return 1;
  const parsed = Date.parse(updatedAt);
  if (Number.isNaN(parsed)) return 1;
  const ageMs = Date.now() - parsed;
  return ageMs > STALE_DAYS * 24 * 60 * 60 * 1000 ? 1 : 0;
}

function loadFixtureChecks() {
  const fixturePath = process.env.REQUIRED_CHECKS_SYNC_FIXTURE_PATH;
  if (!fixturePath) return null;
  const parsed = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const checks = Array.isArray(parsed.requiredChecks) ? parsed.requiredChecks : [];
  return checks
    .map((it) => String(it || '').trim())
    .filter(Boolean);
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
  if (probe.status !== 0) {
    return { ok: 0, checks: [], detail: 'gh_cli_missing' };
  }

  if (!prNumber) {
    return { ok: 0, checks: [], detail: 'pr_number_missing' };
  }

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
      if (!name) continue;
      checks.push(name);
    }
    const unique = [...new Set(checks)].sort();
    return { ok: 1, checks: unique, detail: 'gh_status_check_rollup_ok' };
  } catch {
    return { ok: 0, checks: [], detail: 'gh_status_check_rollup_json_invalid' };
  }
}

function printTokens(out) {
  console.log(`REQUIRED_CHECKS_SYNC_OK=${out.syncOk}`);
  console.log(`REQUIRED_CHECKS_SOURCE=${out.source}`);
  console.log(`REQUIRED_CHECKS_STALE=${out.stale}`);
  console.log(`REQUIRED_CHECKS_COUNT=${out.count}`);
  console.log(`REQUIRED_CHECKS_DETAIL=${out.detail}`);
  if (out.failReason) console.log(`FAIL_REASON=${out.failReason}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = normalizeMode(args.mode);
  const fixtureChecks = loadFixtureChecks();

  if (mode !== MODE_DELIVERY) {
    const contract = readContractOrDefault();
    const stale = isStale(contract.updatedAt);
    const checks = Array.isArray(contract.requiredChecks) ? contract.requiredChecks : [];
    printTokens({
      syncOk: 1,
      source: 'local',
      stale,
      count: checks.length,
      detail: 'local_mode_contract_only',
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
        syncOk: 0,
        source: 'api',
        stale: 1,
        count: 0,
        detail: fetched.detail,
        failReason: 'REQUIRED_CHECKS_SOURCE_UNAVAILABLE',
      });
      process.exit(1);
    }
    checks = fetched.checks;
    detail = fetched.detail;
  }

  const contract = writeContract(checks, fixtureChecks ? 'fixture' : 'api');
  const stale = isStale(contract.updatedAt);
  printTokens({
    syncOk: 1,
    source: contract.source,
    stale,
    count: checks.length,
    detail,
    failReason: '',
  });
  process.exit(0);
}

main();
