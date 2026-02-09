#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const TASK_ID_RE = /^[A-Z0-9._-]{4,64}$/;
const DEFAULT_VERIFY_ROOT = '/tmp';
const DEFAULT_STREAK_PATH = 'scripts/ops/.state/post_merge_cleanup_streak.json';
const STREAK_THRESHOLD = 3;

function parseArgs(argv) {
  const out = {
    taskId: '',
    verifyRoot: DEFAULT_VERIFY_ROOT,
    stateFile: DEFAULT_STREAK_PATH,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === '--task') {
      out.taskId = String(argv[i + 1] || '').trim();
      i += 1;
    } else if (item === '--verify-root') {
      out.verifyRoot = String(argv[i + 1] || '').trim() || DEFAULT_VERIFY_ROOT;
      i += 1;
    } else if (item === '--state-file') {
      out.stateFile = String(argv[i + 1] || '').trim() || DEFAULT_STREAK_PATH;
      i += 1;
    }
  }
  return out;
}

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function loadStreak(stateFile) {
  const parsed = readJsonFile(stateFile, null);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 0;
  const count = Number(parsed.cleanupFailStreak);
  return Number.isInteger(count) && count >= 0 ? count : 0;
}

function saveStreak(stateFile, count) {
  writeJsonFile(stateFile, {
    schemaVersion: 1,
    cleanupFailStreak: count,
    updatedAt: new Date().toISOString(),
  });
}

function run(cmd, args, cwd = process.cwd()) {
  return spawnSync(cmd, args, { encoding: 'utf8', cwd });
}

function loadFixture() {
  if (!process.env.POST_MERGE_VERIFY_FIXTURE_JSON) return null;
  try {
    const parsed = JSON.parse(process.env.POST_MERGE_VERIFY_FIXTURE_JSON);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function printTokens(out) {
  console.log(`POST_MERGE_VERIFY_TASK_ID=${out.taskId}`);
  console.log(`POST_MERGE_VERIFY_PATH=${out.verifyPath}`);
  console.log(`POST_MERGE_VERIFY_OK=${out.verifyOk}`);
  console.log(`POST_MERGE_VERIFY_DETAIL=${out.detail}`);
  console.log(`POST_MERGE_VERIFY_CLEANUP_OK=${out.cleanupOk}`);
  console.log(`POST_MERGE_VERIFY_CLEANUP_FAIL_STREAK=${out.cleanupFailStreak}`);
  console.log(`POST_MERGE_VERIFY_CLEANUP_DEBT_REPORTED=${out.cleanupDebtReported}`);
  if (out.failReason) {
    console.log(`FAIL_REASON=${out.failReason}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!TASK_ID_RE.test(args.taskId)) {
    printTokens({
      taskId: args.taskId,
      verifyPath: '',
      verifyOk: 0,
      detail: 'invalid_task_id',
      cleanupOk: 0,
      cleanupFailStreak: loadStreak(args.stateFile),
      cleanupDebtReported: 0,
      failReason: 'TASK_ID_INVALID',
    });
    process.exit(1);
  }

  const verifyPath = path.join(args.verifyRoot, `post-merge-verify-${args.taskId}`);
  let verifyOk = 1;
  let cleanupOk = 1;
  let detail = 'post_merge_verify_ok';
  let failReason = '';
  const fixture = loadFixture();

  if (fixture) {
    if (fixture.fetchOk === 0) {
      verifyOk = 0;
      detail = String(fixture.fetchDetail || 'git_fetch_failed_fixture');
      failReason = 'POST_MERGE_VERIFY_FAIL';
    } else if (fixture.worktreeAddOk === 0) {
      verifyOk = 0;
      detail = String(fixture.worktreeAddDetail || 'worktree_add_failed_fixture');
      failReason = 'POST_MERGE_VERIFY_FAIL';
    } else if (fixture.doctorOk === 0) {
      verifyOk = 0;
      detail = String(fixture.doctorDetail || 'doctor_failed_fixture');
      failReason = 'POST_MERGE_VERIFY_FAIL';
    }
    cleanupOk = fixture.cleanupOk === 0 ? 0 : 1;
  } else {
    const fetchResult = run('git', ['fetch', 'origin']);
    if (fetchResult.status !== 0) {
      verifyOk = 0;
      detail = String(fetchResult.stderr || 'git_fetch_failed').trim();
      failReason = 'POST_MERGE_VERIFY_FAIL';
    }

    if (verifyOk === 1) {
      if (fs.existsSync(verifyPath)) {
        run('git', ['worktree', 'remove', '--force', verifyPath]);
      }
      const addResult = run('git', ['worktree', 'add', '-d', verifyPath, 'origin/main']);
      if (addResult.status !== 0) {
        verifyOk = 0;
        detail = String(addResult.stderr || 'worktree_add_failed').trim();
        failReason = 'POST_MERGE_VERIFY_FAIL';
      }
    }

    if (verifyOk === 1) {
      const doctorResult = run('node', ['scripts/doctor.mjs'], verifyPath);
      if (doctorResult.status !== 0) {
        verifyOk = 0;
        detail = String(doctorResult.stderr || doctorResult.stdout || 'doctor_failed').trim();
        failReason = 'POST_MERGE_VERIFY_FAIL';
      }
    }

    const cleanupResult = run('git', ['worktree', 'remove', '--force', verifyPath]);
    cleanupOk = cleanupResult.status === 0 ? 1 : 0;
  }

  let cleanupFailStreak = loadStreak(args.stateFile);
  if (cleanupOk === 1) {
    cleanupFailStreak = 0;
  } else {
    cleanupFailStreak += 1;
  }
  saveStreak(args.stateFile, cleanupFailStreak);

  let cleanupDebtReported = cleanupOk === 1 ? 0 : 1;
  if (!failReason && cleanupFailStreak >= STREAK_THRESHOLD) {
    failReason = 'OPS_ENV_DEGRADED';
    verifyOk = 0;
    detail = `cleanup_fail_streak_threshold_reached_${cleanupFailStreak}`;
    cleanupDebtReported = 1;
  }

  printTokens({
    taskId: args.taskId,
    verifyPath,
    verifyOk,
    detail,
    cleanupOk,
    cleanupFailStreak,
    cleanupDebtReported,
    failReason,
  });
  process.exit(verifyOk === 1 ? 0 : 1);
}

main();
