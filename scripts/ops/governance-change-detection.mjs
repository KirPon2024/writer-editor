#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_APPROVALS_PATH,
  evaluateGovernanceApprovalState,
} from './governance-approval-state.mjs';

const TOKEN_NAME = 'GOVERNANCE_CHANGE_OK';
const DEFAULT_BASE_REF = 'origin/main';
const DEFAULT_BASELINE_PATH = 'docs/OPS/BASELINE/OPS_GOVERNANCE_BASELINE_v1.0.json';
const BASELINE_APPROVAL_KEY = 'governance_change_approval_registry';
const DEFAULT_FAIL_REASON = 'GOVERNANCE_CHANGE_APPROVAL_REQUIRED';

function normalizeRepoRelativePath(value) {
  const normalized = String(value || '').trim().replaceAll('\\', '/');
  if (!normalized) return '';
  if (path.isAbsolute(normalized)) return '';
  if (normalized.split('/').some((segment) => segment.length === 0 || segment === '..')) return '';
  return normalized;
}

function ensureInsideRoot(rootDir, relativePath) {
  const rootAbs = path.resolve(rootDir);
  const fileAbs = path.resolve(rootAbs, relativePath);
  const rel = path.relative(rootAbs, fileAbs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return '';
  return fileAbs;
}

function sha256File(filePath) {
  const data = fs.readFileSync(filePath);
  return createHash('sha256').update(data).digest('hex');
}

function makeApprovalKey(filePath, sha256) {
  return `${filePath}\u0000${sha256}`;
}

function isGovernancePath(relativePath) {
  if (relativePath === 'scripts/doctor.mjs') return true;
  if (relativePath.startsWith('docs/OPS/')) return true;
  if (relativePath.startsWith('scripts/ops/')) return true;
  if (relativePath.startsWith('test/contracts/')) return true;
  return false;
}

function runGit(args, repoRoot) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
  });
  return {
    ok: result.status === 0,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
    status: Number.isInteger(result.status) ? result.status : 1,
  };
}

function parsePathList(stdoutText) {
  return String(stdoutText || '')
    .split('\n')
    .map((line) => normalizeRepoRelativePath(line))
    .filter((line) => line.length > 0);
}

function resolveApprovalsPathFromBaseline(repoRoot) {
  const baselineRelativePath = normalizeRepoRelativePath(DEFAULT_BASELINE_PATH);
  if (!baselineRelativePath) return '';

  const baselineAbsPath = ensureInsideRoot(repoRoot, baselineRelativePath);
  if (!baselineAbsPath || !fs.existsSync(baselineAbsPath)) return '';

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(baselineAbsPath, 'utf8'));
  } catch {
    return '';
  }

  const entry = parsed && typeof parsed === 'object' ? parsed[BASELINE_APPROVAL_KEY] : null;
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return '';
  return normalizeRepoRelativePath(entry.path);
}

function resolveApprovalsPath(repoRoot, explicitPath = '') {
  const explicit = normalizeRepoRelativePath(explicitPath);
  if (explicit) return explicit;

  const fromBaseline = resolveApprovalsPathFromBaseline(repoRoot);
  if (fromBaseline) return fromBaseline;

  return DEFAULT_APPROVALS_PATH;
}

function collectGovernanceFileHashes(repoRoot, files) {
  const fileHashes = {};
  const hashErrors = [];

  for (const filePath of files) {
    const normalizedPath = normalizeRepoRelativePath(filePath);
    if (!normalizedPath) {
      hashErrors.push(String(filePath || ''));
      continue;
    }

    const fileAbsPath = ensureInsideRoot(repoRoot, normalizedPath);
    if (!fileAbsPath || !fs.existsSync(fileAbsPath)) {
      hashErrors.push(normalizedPath);
      continue;
    }

    let stat;
    try {
      stat = fs.statSync(fileAbsPath);
    } catch {
      hashErrors.push(normalizedPath);
      continue;
    }
    if (!stat.isFile()) {
      hashErrors.push(normalizedPath);
      continue;
    }

    fileHashes[normalizedPath] = sha256File(fileAbsPath);
  }

  return {
    ok: hashErrors.length === 0,
    fileHashes,
    hashErrors: [...new Set(hashErrors)].sort((a, b) => a.localeCompare(b)),
  };
}

function collectChangedFiles(repoRoot, baseRef) {
  const verifyBase = runGit(['rev-parse', '--verify', `${baseRef}^{commit}`], repoRoot);
  if (!verifyBase.ok) {
    return {
      ok: false,
      files: [],
      failReason: 'BASE_REF_NOT_FOUND',
      gitError: verifyBase.stderr.trim(),
    };
  }

  const branchDiff = runGit(['diff', '--name-only', `${baseRef}...HEAD`], repoRoot);
  if (!branchDiff.ok) {
    return {
      ok: false,
      files: [],
      failReason: 'BRANCH_DIFF_FAILED',
      gitError: branchDiff.stderr.trim(),
    };
  }

  const stagedDiff = runGit(['diff', '--name-only', '--cached'], repoRoot);
  if (!stagedDiff.ok) {
    return {
      ok: false,
      files: [],
      failReason: 'INDEX_DIFF_FAILED',
      gitError: stagedDiff.stderr.trim(),
    };
  }

  const worktreeDiff = runGit(['diff', '--name-only'], repoRoot);
  if (!worktreeDiff.ok) {
    return {
      ok: false,
      files: [],
      failReason: 'WORKTREE_DIFF_FAILED',
      gitError: worktreeDiff.stderr.trim(),
    };
  }

  const untrackedDiff = runGit(['ls-files', '--others', '--exclude-standard'], repoRoot);
  if (!untrackedDiff.ok) {
    return {
      ok: false,
      files: [],
      failReason: 'UNTRACKED_SCAN_FAILED',
      gitError: untrackedDiff.stderr.trim(),
    };
  }

  const files = new Set([
    ...parsePathList(branchDiff.stdout),
    ...parsePathList(stagedDiff.stdout),
    ...parsePathList(worktreeDiff.stdout),
    ...parsePathList(untrackedDiff.stdout),
  ]);

  return {
    ok: true,
    files: [...files].sort((a, b) => a.localeCompare(b)),
    failReason: '',
    gitError: '',
  };
}

function buildState({
  ok,
  changedGovernanceFiles,
  missingApprovals,
  baseRef,
  repoRoot,
  approvedByEnv,
  approvalRegistryValid,
  approvalRegistryFailReason,
  approvalsPath,
  failReason,
  gitError,
}) {
  return {
    ok,
    tokens: {
      [TOKEN_NAME]: ok ? 1 : 0,
    },
    changed_governance_files: [...changedGovernanceFiles].sort((a, b) => a.localeCompare(b)),
    missing_approvals: [...missingApprovals].sort((a, b) => a.filePath.localeCompare(b.filePath)),
    baseRef,
    repoRoot,
    approvals_path: approvalsPath,
    governance_change_approved: ok ? 1 : 0,
    governance_change_approved_env: approvedByEnv ? 1 : 0,
    approval_registry_valid: approvalRegistryValid ? 1 : 0,
    approval_registry_fail_reason: approvalRegistryFailReason,
    failReason: ok ? '' : String(failReason || 'GOVERNANCE_CHANGE_DETECTION_FAILED'),
    gitError: ok ? '' : String(gitError || ''),
  };
}

export function evaluateGovernanceChangeDetection(input = {}) {
  const baseRef = String(input.baseRef || process.env.GOVERNANCE_CHANGE_BASE_REF || DEFAULT_BASE_REF).trim();
  const repoRoot = String(input.repoRoot || process.env.GOVERNANCE_CHANGE_REPO_ROOT || process.cwd()).trim();
  const approvedByEnv = String(process.env.GOVERNANCE_CHANGE_APPROVED || '').trim() === '1';
  const approvalsPath = resolveApprovalsPath(
    repoRoot,
    String(input.approvalsPath || process.env.GOVERNANCE_CHANGE_APPROVALS_PATH || '').trim(),
  );
  const approvalExemptPaths = new Set([approvalsPath]);

  const changedState = collectChangedFiles(repoRoot, baseRef);
  if (!changedState.ok) {
    return buildState({
      ok: false,
      changedGovernanceFiles: [],
      missingApprovals: [],
      baseRef,
      repoRoot,
      approvedByEnv,
      approvalRegistryValid: false,
      approvalRegistryFailReason: '',
      approvalsPath,
      failReason: changedState.failReason,
      gitError: changedState.gitError,
    });
  }

  const changedGovernanceFiles = changedState.files.filter((relativePath) => isGovernancePath(relativePath));
  const changedFilesRequiringApproval = changedGovernanceFiles
    .filter((filePath) => !approvalExemptPaths.has(filePath));

  if (changedFilesRequiringApproval.length === 0) {
    return buildState({
      ok: true,
      changedGovernanceFiles,
      missingApprovals: [],
      baseRef,
      repoRoot,
      approvedByEnv,
      approvalRegistryValid: true,
      approvalRegistryFailReason: '',
      approvalsPath,
      failReason: '',
      gitError: '',
    });
  }

  const hashState = collectGovernanceFileHashes(repoRoot, changedFilesRequiringApproval);
  if (!hashState.ok) {
    return buildState({
      ok: false,
      changedGovernanceFiles,
      missingApprovals: [],
      baseRef,
      repoRoot,
      approvedByEnv,
      approvalRegistryValid: false,
      approvalRegistryFailReason: '',
      approvalsPath,
      failReason: 'GOVERNANCE_CHANGE_FILE_HASH_FAILED',
      gitError: JSON.stringify(hashState.hashErrors),
    });
  }

  const changedApprovalsWithHash = changedFilesRequiringApproval.map((filePath) => ({
    filePath,
    sha256: hashState.fileHashes[filePath],
  }));

  if (approvedByEnv) {
    return buildState({
      ok: true,
      changedGovernanceFiles,
      missingApprovals: [],
      baseRef,
      repoRoot,
      approvedByEnv,
      approvalRegistryValid: true,
      approvalRegistryFailReason: '',
      approvalsPath,
      failReason: '',
      gitError: '',
    });
  }

  const approvalRegistryState = evaluateGovernanceApprovalState({
    repoRoot,
    approvalsPath,
  });
  const approvalRegistryValid = approvalRegistryState && approvalRegistryState.ok === true;
  const approvalRegistryFailReason = approvalRegistryValid
    ? ''
    : String(approvalRegistryState && approvalRegistryState.failReason
      ? approvalRegistryState.failReason
      : 'E_GOVERNANCE_APPROVAL_INVALID');

  const approvedKeys = new Set(
    approvalRegistryValid
      ? (approvalRegistryState.approvals || []).map((entry) => makeApprovalKey(entry.filePath, entry.sha256))
      : [],
  );

  const missingApprovals = changedApprovalsWithHash
    .filter((entry) => !approvedKeys.has(makeApprovalKey(entry.filePath, entry.sha256)));
  const ok = approvalRegistryValid && missingApprovals.length === 0;

  return buildState({
    ok,
    changedGovernanceFiles,
    missingApprovals,
    baseRef,
    repoRoot,
    approvedByEnv,
    approvalRegistryValid,
    approvalRegistryFailReason,
    approvalsPath,
    failReason: ok ? '' : DEFAULT_FAIL_REASON,
    gitError: '',
  });
}

function parseArgs(argv) {
  const out = {
    json: false,
    baseRef: '',
    repoRoot: '',
    approvalsPath: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    if (arg === '--base-ref' && i + 1 < argv.length) {
      out.baseRef = String(argv[i + 1] || '').trim();
      i += 1;
    }
    if (arg === '--repo-root' && i + 1 < argv.length) {
      out.repoRoot = String(argv[i + 1] || '').trim();
      i += 1;
    }
    if (arg === '--approvals-path' && i + 1 < argv.length) {
      out.approvalsPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }
  return out;
}

function printHuman(state) {
  console.log(`${TOKEN_NAME}=${state.tokens[TOKEN_NAME]}`);
  console.log(`GOVERNANCE_CHANGE_BASE_REF=${state.baseRef}`);
  console.log(`GOVERNANCE_CHANGE_APPROVED=${state.governance_change_approved}`);
  console.log(`GOVERNANCE_CHANGE_APPROVED_ENV=${state.governance_change_approved_env}`);
  console.log(`GOVERNANCE_APPROVAL_REGISTRY_VALID=${state.approval_registry_valid}`);
  console.log(`GOVERNANCE_APPROVALS_PATH=${state.approvals_path}`);
  console.log(`GOVERNANCE_CHANGE_FILES=${JSON.stringify(state.changed_governance_files)}`);
  console.log(`GOVERNANCE_CHANGE_MISSING_APPROVALS=${JSON.stringify(state.missing_approvals)}`);
  if (state.approval_registry_fail_reason) {
    console.log(`GOVERNANCE_APPROVAL_REGISTRY_FAIL_REASON=${state.approval_registry_fail_reason}`);
  }
  if (state.failReason) {
    console.log(`GOVERNANCE_CHANGE_FAIL_REASON=${state.failReason}`);
  }
  if (state.gitError) {
    console.log(`GOVERNANCE_CHANGE_GIT_ERROR=${state.gitError}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateGovernanceChangeDetection({
    baseRef: args.baseRef,
    repoRoot: args.repoRoot,
    approvalsPath: args.approvalsPath,
  });

  if (args.json) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  } else {
    printHuman(state);
  }
  process.exit(state.ok ? 0 : 1);
}

const isEntrypoint = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  main();
}

export {
  DEFAULT_BASE_REF,
};
