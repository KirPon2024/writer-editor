#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateSafeAutomergeOpsOnly } from './check-safe-automerge-ops-only.mjs';

const TOOL_VERSION = 'safe-automerge-eligibility.v1';
const DEFAULT_REPO = 'KirPon2024/writer-editor';
const FAILURE = Object.freeze({
  BASE_BRANCH_NOT_MAIN: 'E_BASE_BRANCH_NOT_MAIN',
  HEAD_SHA_MISMATCH: 'E_HEAD_SHA_MISMATCH',
  STATUS_CHECKS_NOT_SUCCESS: 'E_STATUS_CHECKS_NOT_SUCCESS',
  DIFF_NOT_OPS_ONLY: 'E_DIFF_NOT_OPS_ONLY',
  GH_API_UNAVAILABLE: 'E_GH_API_UNAVAILABLE',
  PR_NOT_FOUND: 'E_PR_NOT_FOUND',
});

function parseArgs(argv) {
  const out = {
    prNumber: '',
    repo: DEFAULT_REPO,
    expectedHeadSha: '',
    mergeMethod: 'merge',
    admin: false,
    squash: false,
    rebase: false,
    json: false,
    fixtureJson: process.env.SAFE_AUTOMERGE_ELIGIBILITY_FIXTURE_JSON || '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || '').trim();
    if (arg === '--pr') {
      out.prNumber = String(argv[i + 1] || '').trim();
      i += 1;
    } else if (arg === '--repo') {
      out.repo = String(argv[i + 1] || '').trim() || DEFAULT_REPO;
      i += 1;
    } else if (arg === '--expected-head-sha') {
      out.expectedHeadSha = String(argv[i + 1] || '').trim();
      i += 1;
    } else if (arg === '--merge-method') {
      out.mergeMethod = String(argv[i + 1] || '').trim().toLowerCase();
      i += 1;
    } else if (arg === '--admin') {
      out.admin = true;
    } else if (arg === '--squash') {
      out.squash = true;
    } else if (arg === '--rebase') {
      out.rebase = true;
    } else if (arg === '--json') {
      out.json = true;
    } else if (arg === '--fixture-json') {
      out.fixtureJson = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }
  return out;
}

function parseRepo(repo) {
  const value = String(repo || '').trim();
  const match = value.match(/^([^/\s]+)\/([^/\s]+)$/u);
  if (!match) return null;
  return { owner: match[1], name: match[2] };
}

function runGhGraphql(query, variables = {}) {
  const args = ['api', 'graphql', '-f', `query=${query}`];
  for (const [key, value] of Object.entries(variables)) {
    args.push('-F', `${key}=${value}`);
  }
  const result = spawnSync('gh', args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      GH_PAGER: '',
      NO_COLOR: '1',
    },
  });
  if (result.status !== 0) {
    return { ok: false, unavailable: true, data: null };
  }
  try {
    const data = JSON.parse(String(result.stdout || '{}'));
    return { ok: true, unavailable: false, data };
  } catch {
    return { ok: false, unavailable: true, data: null };
  }
}

function loadFixture(fixtureJson) {
  if (!fixtureJson) return null;
  try {
    const parsed = JSON.parse(fixtureJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function normalizeChangedFiles(files) {
  if (!Array.isArray(files)) return [];
  return [...new Set(files.map((entry) => String(entry || '').trim()).filter(Boolean))].sort();
}

function fetchPrState({ repo, prNumber, fixtureJson }) {
  const fixture = loadFixture(fixtureJson);
  if (fixture) {
    return {
      apiUnavailable: fixture.apiUnavailable === true,
      prNotFound: fixture.prNotFound === true,
      base: String(fixture.base || '').trim(),
      headSha: String(fixture.headSha || '').trim(),
      rollup: String(fixture.rollup || '').trim().toUpperCase(),
      changedFiles: normalizeChangedFiles(fixture.changedFiles || []),
    };
  }

  const parsedRepo = parseRepo(repo);
  const number = Number.parseInt(String(prNumber || ''), 10);
  if (!parsedRepo || !Number.isInteger(number) || number <= 0) {
    return {
      apiUnavailable: false,
      prNotFound: true,
      base: '',
      headSha: '',
      rollup: '',
      changedFiles: [],
    };
  }

  const prQuery = `
    query($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) {
        pullRequest(number: $number) {
          baseRefName
          headRefOid
          statusCheckRollup {
            state
          }
        }
      }
    }
  `;
  const prRes = runGhGraphql(prQuery, {
    owner: parsedRepo.owner,
    name: parsedRepo.name,
    number,
  });
  if (!prRes.ok || !prRes.data || !prRes.data.repository) {
    return {
      apiUnavailable: true,
      prNotFound: false,
      base: '',
      headSha: '',
      rollup: '',
      changedFiles: [],
    };
  }

  const pr = prRes.data.repository.pullRequest;
  if (!pr) {
    return {
      apiUnavailable: false,
      prNotFound: true,
      base: '',
      headSha: '',
      rollup: '',
      changedFiles: [],
    };
  }

  const changedFiles = [];
  let after = null;
  for (let i = 0; i < 20; i += 1) {
    const filesQuery = `
      query($owner: String!, $name: String!, $number: Int!, $after: String) {
        repository(owner: $owner, name: $name) {
          pullRequest(number: $number) {
            files(first: 100, after: $after) {
              nodes {
                path
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      }
    `;
    const filesRes = runGhGraphql(filesQuery, {
      owner: parsedRepo.owner,
      name: parsedRepo.name,
      number,
      after: after || '',
    });
    if (!filesRes.ok || !filesRes.data || !filesRes.data.repository || !filesRes.data.repository.pullRequest) {
      return {
        apiUnavailable: true,
        prNotFound: false,
        base: String(pr.baseRefName || '').trim(),
        headSha: String(pr.headRefOid || '').trim(),
        rollup: String(pr.statusCheckRollup && pr.statusCheckRollup.state ? pr.statusCheckRollup.state : '').trim().toUpperCase(),
        changedFiles: [],
      };
    }

    const filesBlock = filesRes.data.repository.pullRequest.files;
    const nodes = Array.isArray(filesBlock && filesBlock.nodes) ? filesBlock.nodes : [];
    for (const node of nodes) {
      const filePath = String(node && node.path ? node.path : '').trim();
      if (filePath) changedFiles.push(filePath);
    }
    const hasNextPage = Boolean(filesBlock && filesBlock.pageInfo && filesBlock.pageInfo.hasNextPage);
    const endCursor = String(filesBlock && filesBlock.pageInfo && filesBlock.pageInfo.endCursor ? filesBlock.pageInfo.endCursor : '').trim();
    if (!hasNextPage) break;
    if (!endCursor) {
      return {
        apiUnavailable: true,
        prNotFound: false,
        base: String(pr.baseRefName || '').trim(),
        headSha: String(pr.headRefOid || '').trim(),
        rollup: String(pr.statusCheckRollup && pr.statusCheckRollup.state ? pr.statusCheckRollup.state : '').trim().toUpperCase(),
        changedFiles: [],
      };
    }
    after = endCursor;
  }

  return {
    apiUnavailable: false,
    prNotFound: false,
    base: String(pr.baseRefName || '').trim(),
    headSha: String(pr.headRefOid || '').trim(),
    rollup: String(pr.statusCheckRollup && pr.statusCheckRollup.state ? pr.statusCheckRollup.state : '').trim().toUpperCase(),
    changedFiles: normalizeChangedFiles(changedFiles),
  };
}

export function evaluateSafeAutomergeEligibility(input = {}) {
  const failures = new Set();

  const apiUnavailable = input.apiUnavailable === true;
  const prNotFound = input.prNotFound === true;
  const base = String(input.base || '').trim();
  const headSha = String(input.headSha || '').trim();
  const expectedHeadSha = String(input.expectedHeadSha || '').trim();
  const rollup = String(input.rollup || '').trim().toUpperCase();
  const changedFiles = normalizeChangedFiles(input.changedFiles || []);
  const mergeMethod = String(input.mergeMethod || '').trim().toLowerCase();
  const admin = input.admin === true;
  const squash = input.squash === true;
  const rebase = input.rebase === true;

  if (apiUnavailable) failures.add(FAILURE.GH_API_UNAVAILABLE);
  if (prNotFound) failures.add(FAILURE.PR_NOT_FOUND);

  const opsProbe = evaluateSafeAutomergeOpsOnly({
    changedFiles,
    baseRefName: 'main',
    headRefOid: expectedHeadSha || 'probe',
    expectedHeadSha: expectedHeadSha || 'probe',
    statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }],
  });
  const opsOnlyOk = opsProbe.details.outsideAllowlist.length === 0 && opsProbe.details.denyPaths.length === 0;
  if (!opsOnlyOk) failures.add(FAILURE.DIFF_NOT_OPS_ONLY);

  if (base !== 'main') failures.add(FAILURE.BASE_BRANCH_NOT_MAIN);
  if (!expectedHeadSha || !headSha || headSha !== expectedHeadSha) {
    failures.add(FAILURE.HEAD_SHA_MISMATCH);
  }
  if (rollup !== 'SUCCESS') failures.add(FAILURE.STATUS_CHECKS_NOT_SUCCESS);

  // Merge policy: merge only, no admin/squash/rebase.
  if (mergeMethod !== 'merge' || admin || squash || rebase) {
    failures.add(FAILURE.STATUS_CHECKS_NOT_SUCCESS);
  }

  const sortedFailures = [...failures].sort();
  return {
    ok: sortedFailures.length === 0,
    failures: sortedFailures,
    details: {
      base,
      headSha,
      expectedHeadSha,
      rollup,
      opsOnlyOk,
    },
    toolVersion: TOOL_VERSION,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const prState = fetchPrState({
    repo: args.repo,
    prNumber: args.prNumber,
    fixtureJson: args.fixtureJson,
  });

  const state = evaluateSafeAutomergeEligibility({
    ...prState,
    expectedHeadSha: args.expectedHeadSha,
    mergeMethod: args.mergeMethod,
    admin: args.admin,
    squash: args.squash,
    rebase: args.rebase,
  });

  process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  process.exit(state.ok ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
