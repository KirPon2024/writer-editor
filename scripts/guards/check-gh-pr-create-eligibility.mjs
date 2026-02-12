#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const TOOL_VERSION = 'gh-pr-create-eligibility.v1';
const REQUIRED_ALLOWED_OPS = Object.freeze(['pr_create_only']);
const REQUIRED_DENY_OPS = Object.freeze(['pr_close', 'pr_merge', 'repo_admin']);
const DEFAULT_PROFILE_PATH = path.join(
  process.cwd(),
  'docs',
  'OPERATIONS',
  'STATUS',
  'CODEX_GH_PR_CREATE_PROFILE.json',
);

function parseArgs(argv) {
  const out = {
    json: false,
    profilePath: DEFAULT_PROFILE_PATH,
    repo: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || '').trim();
    if (arg === '--json') out.json = true;
    else if (arg === '--profile-path') {
      out.profilePath = path.resolve(String(argv[i + 1] || '').trim());
      i += 1;
    } else if (arg === '--repo') {
      out.repo = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }
  return out;
}

function stableSortValue(value) {
  if (Array.isArray(value)) return value.map((entry) => stableSortValue(entry));
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = stableSortValue(value[key]);
  return out;
}

function stableStringify(value) {
  return JSON.stringify(stableSortValue(value));
}

function sha256Hex(input) {
  return createHash('sha256').update(String(input)).digest('hex');
}

function normalizeTokenList(value) {
  return Array.isArray(value)
    ? [...new Set(value.map((entry) => String(entry || '').trim()).filter(Boolean))].sort()
    : [];
}

function normalizeRepoName(value) {
  return String(value || '').trim().replace(/\.git$/u, '');
}

function parseRepoFromRemoteUrl(remoteUrl) {
  const raw = String(remoteUrl || '').trim();
  if (!raw) return '';

  const sshMatch = raw.match(/^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/u);
  if (sshMatch) return normalizeRepoName(sshMatch[1]);

  const sshUrlMatch = raw.match(/^ssh:\/\/git@github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/u);
  if (sshUrlMatch) return normalizeRepoName(sshUrlMatch[1]);

  const httpsMatch = raw.match(/^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/u);
  if (httpsMatch) return normalizeRepoName(httpsMatch[1]);

  return '';
}

function runGit(args) {
  return spawnSync('git', args, {
    encoding: 'utf8',
  });
}

function readStdout(result) {
  return String(result && result.stdout ? result.stdout : '').trim();
}

function runGh(args) {
  return spawnSync('gh', args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      GH_PAGER: '',
      NO_COLOR: '1',
    },
  });
}

function normalizeProfile(profile) {
  return {
    policyVersion: String(profile.policyVersion || '').trim(),
    allowedOps: normalizeTokenList(profile.allowedOps),
    repoAllowlist: normalizeTokenList(profile.repoAllowlist),
    hostname: String(profile.hostname || '').trim(),
    denyOps: normalizeTokenList(profile.denyOps),
    verifiedBy: String(profile.verifiedBy || '').trim(),
    verifiedAt: String(profile.verifiedAt || '').trim(),
  };
}

function loadProfile(profilePath) {
  if (!fs.existsSync(profilePath)) return null;
  const raw = fs.readFileSync(profilePath, 'utf8');
  const parsed = JSON.parse(raw);
  return normalizeProfile(parsed);
}

function detectRepoName() {
  const remoteRes = runGit(['config', '--get', 'remote.origin.url']);
  const remoteUrl = readStdout(remoteRes);
  const repo = parseRepoFromRemoteUrl(remoteUrl);
  return {
    remoteUrl,
    repo,
    ok: remoteRes.status === 0 && repo.length > 0,
  };
}

function probeGhAuth(hostname) {
  const result = runGh(['auth', 'status', '--hostname', hostname]);
  return {
    ok: result.status === 0,
    exitCode: Number(result.status ?? 1),
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
  };
}

function probeGhRateLimit() {
  const result = runGh(['api', '/rate_limit']);
  const raw = `${String(result.stdout || '')}\n${String(result.stderr || '')}`.toLowerCase();
  const http403 = /403|forbidden|token exchange failed/u.test(raw);
  const unreachable = /api\.github\.com|dns|timeout|timed out|resolve|network|connect|connection refused/u.test(raw);
  return {
    ok: result.status === 0,
    exitCode: Number(result.status ?? 1),
    http403,
    unreachable,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
  };
}

function hasExactAllowedOps(allowedOps) {
  if (allowedOps.length !== REQUIRED_ALLOWED_OPS.length) return false;
  return REQUIRED_ALLOWED_OPS.every((entry) => allowedOps.includes(entry));
}

function hasRequiredDenyOps(denyOps) {
  return REQUIRED_DENY_OPS.every((entry) => denyOps.includes(entry));
}

export function evaluateGhPrCreateEligibility(input = {}) {
  const failures = new Set();

  const profile = input.profile && typeof input.profile === 'object'
    ? normalizeProfile(input.profile)
    : loadProfile(String(input.profilePath || DEFAULT_PROFILE_PATH));

  if (!profile) {
    failures.add('E_GH_PR_CREATE_PROFILE_MISSING');
  }

  const policy = profile || normalizeProfile({});
  if (!policy.policyVersion) failures.add('E_GH_PR_CREATE_POLICY_INVALID');
  if (policy.hostname !== 'github.com') failures.add('E_GH_HOSTNAME_INVALID');
  if (!hasExactAllowedOps(policy.allowedOps)) failures.add('E_GH_POLICY_ALLOWED_OPS_INVALID');
  if (!hasRequiredDenyOps(policy.denyOps)) failures.add('E_GH_POLICY_DENY_OPS_INVALID');
  if (policy.repoAllowlist.length === 0) failures.add('E_GH_REPO_ALLOWLIST_EMPTY');

  const repoProbe = input.repoProbe && typeof input.repoProbe === 'object'
    ? input.repoProbe
    : detectRepoName();
  const repo = normalizeRepoName(input.repo || repoProbe.repo || '');
  if (!repo) failures.add('E_GH_REPO_DETECT_FAILED');
  if (repo && !policy.repoAllowlist.includes(repo)) failures.add('E_GH_REPO_NOT_ALLOWLISTED');

  const auth = input.checks && input.checks.auth ? input.checks.auth : probeGhAuth(policy.hostname || 'github.com');
  if (!auth.ok) failures.add('E_GH_AUTH_STATUS_INVALID');

  const rateLimit = input.checks && input.checks.rateLimit ? input.checks.rateLimit : probeGhRateLimit();
  if (!rateLimit.ok) {
    if (rateLimit.http403) failures.add('E_GH_TOKEN_403_FORBIDDEN');
    else failures.add('E_GH_API_UNREACHABLE');
  }

  const sortedFailures = [...failures].sort();
  const ok = sortedFailures.length === 0;
  const status = ok ? 'ELIGIBLE' : 'BLOCKED';
  const details = {
    repo,
    profile: policy,
    checks: {
      auth: {
        ok: auth.ok === true,
        exitCode: Number(auth.exitCode ?? (auth.ok ? 0 : 1)),
      },
      rateLimit: {
        ok: rateLimit.ok === true,
        exitCode: Number(rateLimit.exitCode ?? (rateLimit.ok ? 0 : 1)),
        http403: rateLimit.http403 === true ? 1 : 0,
        unreachable: rateLimit.unreachable === true ? 1 : 0,
      },
    },
  };
  const configHash = sha256Hex(stableStringify({
    toolVersion: TOOL_VERSION,
    profile: policy,
    repo,
  }));
  return {
    ok,
    status,
    failures: sortedFailures,
    details,
    configHash,
    toolVersion: TOOL_VERSION,
  };
}

function printTokens(state) {
  const firstFailure = state.failures.length > 0 ? state.failures[0] : '';
  console.log(`GH_PR_CREATE_ELIGIBLE=${state.ok ? 1 : 0}`);
  console.log(`GH_PR_CREATE_STATUS=${state.status}`);
  console.log(`GH_PR_CREATE_CONFIG_HASH=${state.configHash}`);
  console.log(`GH_PR_CREATE_FAIL_REASON=${firstFailure}`);
  console.log(`GH_PR_CREATE_REPO=${state.details.repo}`);
  console.log(`GH_PR_CREATE_POLICY_VERSION=${state.details.profile.policyVersion}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateGhPrCreateEligibility({
    profilePath: args.profilePath,
    repo: args.repo,
  });
  if (args.json) process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  else printTokens(state);
  process.exit(state.ok ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
