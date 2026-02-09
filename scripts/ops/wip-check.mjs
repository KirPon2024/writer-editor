#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const DEFAULT_BASE_BRANCH = 'main';
const MODE_LOCAL = 'LOCAL_EXEC';
const MODE_DELIVERY = 'DELIVERY_EXEC';

function parseArgs(argv) {
  const out = { mode: '', base: DEFAULT_BASE_BRANCH, repo: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === '--mode') {
      out.mode = String(argv[i + 1] || '').trim();
      i += 1;
    } else if (item === '--base') {
      out.base = String(argv[i + 1] || '').trim() || DEFAULT_BASE_BRANCH;
      i += 1;
    } else if (item === '--repo') {
      out.repo = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }
  return out;
}

function normalizeMode(argsMode) {
  if (argsMode) return argsMode.toUpperCase();
  if (process.env.OPS_EXEC_MODE) return String(process.env.OPS_EXEC_MODE).toUpperCase();
  return MODE_LOCAL;
}

function runCommand(cmd, args, extraEnv = {}) {
  return spawnSync(cmd, args, {
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
  });
}

function hasGoExceptionComment(comments) {
  for (const entry of comments || []) {
    const body = String(entry && entry.body ? entry.body : '').trim();
    if (body === 'GO:ROLLBACK_PR_APPROVED' || body === 'GO:EMERGENCY_FIX_PR_APPROVED') {
      return true;
    }
  }
  return false;
}

function loadFixture() {
  const fixturePath = process.env.WIP_CHECK_FIXTURE_PATH;
  if (!fixturePath) return null;
  const parsed = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const openPullRequests = Array.isArray(parsed.openPullRequests) ? parsed.openPullRequests : [];
  return openPullRequests.map((pr) => ({
    number: Number(pr.number || 0),
    comments: Array.isArray(pr.comments) ? pr.comments : [],
  }));
}

function loadOpenPullRequestsFromGh(base, repo) {
  const ghProbe = runCommand('gh', ['--version']);
  if (ghProbe.status !== 0) {
    return { ok: 0, reason: 'API_UNAVAILABLE', detail: 'gh_cli_missing', prs: [] };
  }

  const listArgs = ['pr', 'list', '--base', base, '--state', 'open', '--json', 'number'];
  if (repo) listArgs.push('--repo', repo);
  const list = runCommand('gh', listArgs);
  if (list.status !== 0) {
    return { ok: 0, reason: 'API_UNAVAILABLE', detail: String(list.stderr || 'gh_pr_list_failed').trim(), prs: [] };
  }

  let numbers = [];
  try {
    const parsed = JSON.parse(String(list.stdout || '[]'));
    numbers = parsed.map((it) => Number(it.number || 0)).filter((n) => Number.isInteger(n) && n > 0);
  } catch {
    return { ok: 0, reason: 'API_UNAVAILABLE', detail: 'gh_pr_list_json_invalid', prs: [] };
  }

  const prs = [];
  for (const number of numbers) {
    const viewArgs = ['pr', 'view', String(number), '--json', 'comments'];
    if (repo) viewArgs.push('--repo', repo);
    const view = runCommand('gh', viewArgs);
    if (view.status !== 0) {
      return {
        ok: 0,
        reason: 'API_UNAVAILABLE',
        detail: `gh_pr_view_failed_${number}`,
        prs: [],
      };
    }
    let comments = [];
    try {
      const parsed = JSON.parse(String(view.stdout || '{}'));
      comments = Array.isArray(parsed.comments) ? parsed.comments : [];
    } catch {
      return {
        ok: 0,
        reason: 'API_UNAVAILABLE',
        detail: `gh_pr_view_json_invalid_${number}`,
        prs: [],
      };
    }
    prs.push({ number, comments });
  }
  return { ok: 1, reason: '', detail: 'gh_ok', prs };
}

function printResult(out) {
  console.log(`WIP_LIMIT_OK=${out.wipLimitOk}`);
  console.log(`ACTIVE_DELIVERY_COUNT=${out.activeDeliveryCount}`);
  console.log(`WIP_EXCEPTION_OK=${out.exceptionOk}`);
  console.log(`WIP_CHECK_MODE=${out.mode}`);
  console.log(`WIP_CHECK_BASE=${out.base}`);
  console.log(`WIP_CHECK_DETAIL=${out.detail}`);
  if (out.failReason) console.log(`FAIL_REASON=${out.failReason}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = normalizeMode(args.mode);

  if (mode !== MODE_DELIVERY) {
    printResult({
      wipLimitOk: 1,
      activeDeliveryCount: 0,
      exceptionOk: 'N_A',
      mode,
      base: args.base,
      detail: 'wip_check_skipped_non_delivery_mode',
      failReason: '',
    });
    process.exit(0);
  }

  let prs;
  if (process.env.WIP_CHECK_FIXTURE_PATH) {
    prs = loadFixture();
  } else {
    const loaded = loadOpenPullRequestsFromGh(args.base, args.repo);
    if (loaded.ok !== 1) {
      printResult({
        wipLimitOk: 0,
        activeDeliveryCount: 0,
        exceptionOk: 0,
        mode,
        base: args.base,
        detail: loaded.detail,
        failReason: loaded.reason,
      });
      process.exit(1);
    }
    prs = loaded.prs;
  }

  const activeDeliveryCount = prs.length;
  const exceptionCount = prs.filter((pr) => hasGoExceptionComment(pr.comments)).length;

  let wipLimitOk = 1;
  let exceptionOk = 'N_A';
  let failReason = '';
  let detail = 'wip_limit_ok';

  if (activeDeliveryCount <= 1) {
    wipLimitOk = 1;
    exceptionOk = 'N_A';
  } else if (activeDeliveryCount === 2) {
    if (exceptionCount === 1) {
      wipLimitOk = 1;
      exceptionOk = 1;
      detail = 'wip_limit_exception_approved';
    } else {
      wipLimitOk = 0;
      exceptionOk = 0;
      failReason = exceptionCount === 0 ? 'EXCEPTION_ARTIFACT_MISSING' : 'EXCEPTION_ARTIFACT_INVALID';
      detail = 'wip_limit_exceeded_without_valid_exception';
    }
  } else {
    wipLimitOk = 0;
    exceptionOk = exceptionCount > 0 ? 0 : 'N_A';
    failReason = 'WIP_LIMIT_VIOLATION';
    detail = 'wip_limit_exceeded';
  }

  printResult({
    wipLimitOk,
    activeDeliveryCount,
    exceptionOk,
    mode,
    base: args.base,
    detail,
    failReason,
  });
  process.exit(wipLimitOk === 1 ? 0 : 1);
}

main();
