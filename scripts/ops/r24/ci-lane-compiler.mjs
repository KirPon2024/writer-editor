#!/usr/bin/env node
// R2.4 E0 — logical-to-live CI lane compiler.
// Binds logical lane ids to exact workflow file + job coordinates with
// per-file digests, enforces required internal minima presence, and computes
// liveCiBindingDigest + authorityEpoch. GitHub rulesets can never weaken the
// internal minimum; a missing workflow or job fails closed.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { canonicalize, sha256hex, R24Error, HEX64_RE } from './canonical-json.mjs';

export const REQUIRED_INTERNAL_MINIMA = Object.freeze([
  'lockfile-node20.yml#lockfile',
  'oss-policy.yml#oss-policy',
  'rtk-required.yml#rtk-required',
  'x1-runtime-parity.yml#x1-runtime-parity',
]);

export const LOGICAL_LANES = Object.freeze({
  BASELINE_REQUIRED: Object.freeze([
    'lockfile-node20.yml#lockfile',
    'oss-policy.yml#oss-policy',
    'rtk-required.yml#rtk-required',
    'x1-runtime-parity.yml#x1-runtime-parity',
  ]),
  OPS_GOVERNANCE: Object.freeze([
    'ops-vector-close.yml#ops_vector_close',
    'rtk-required.yml#rtk-required',
  ]),
});

const git = (repo, argv) => {
  const result = spawnSync('git', ['-C', repo, ...argv], { encoding: 'utf8' });
  if (result.status !== 0) throw new R24Error('E_GIT', `${argv.join(' ')}: ${String(result.stderr || '').trim()}`);
  return result.stdout.trim();
};

export function readWorkflows(repoRoot) {
  const workflowDir = path.join(repoRoot, '.github', 'workflows');
  if (!fs.existsSync(workflowDir)) throw new R24Error('E_WORKFLOW_DIR_MISSING', workflowDir);
  const files = fs.readdirSync(workflowDir).filter((f) => /\.ya?ml$/.test(f)).sort();
  if (files.length === 0) throw new R24Error('E_WORKFLOW_DENOMINATOR_ZERO');
  return files.map((file) => {
    const content = fs.readFileSync(path.join(workflowDir, file));
    const text = content.toString('utf8');
    const jobsBlock = text.split(/^jobs:\s*$/m)[1] || '';
    const jobs = [...jobsBlock.matchAll(/^ {2}([A-Za-z0-9_-]+):\s*$/gm)].map((m) => m[1]);
    if (jobs.length === 0) throw new R24Error('E_WORKFLOW_JOB_DENOMINATOR_ZERO', file);
    return { file: `.github/workflows/${file}`, sha256: sha256hex(content), jobs };
  });
}

export function compileLiveCiBinding({ repoRoot, expectedHeadSha, expectedOriginUrl, missionDigest, graphDigest, now }) {
  if (typeof now !== 'string' || now.length === 0) throw new R24Error('E_CLOCK_REQUIRED');
  if (!HEX64_RE.test(String(missionDigest))) throw new R24Error('E_MISSION_DIGEST_REQUIRED');
  if (!HEX64_RE.test(String(graphDigest))) throw new R24Error('E_GRAPH_DIGEST_REQUIRED');
  const headSha = git(repoRoot, ['rev-parse', 'HEAD']);
  const treeSha = git(repoRoot, ['rev-parse', 'HEAD^{tree}']);
  const originUrl = git(repoRoot, ['remote', 'get-url', 'origin']);
  if (expectedHeadSha && headSha !== expectedHeadSha) throw new R24Error('E_HEAD_MISMATCH', `${headSha} != ${expectedHeadSha}`);
  if (expectedOriginUrl && originUrl !== expectedOriginUrl) throw new R24Error('E_ORIGIN_IDENTITY', originUrl);
  const dirty = git(repoRoot, ['status', '--porcelain=v1', '--untracked-files=all']);
  if (dirty !== '') throw new R24Error('E_WORKTREE_DIRTY', dirty.split('\n').slice(0, 20).join('; '));

  const workflows = readWorkflows(repoRoot);
  const knownContexts = new Set(workflows.flatMap((w) => w.jobs.map((job) => `${path.basename(w.file)}#${job}`)));
  for (const context of REQUIRED_INTERNAL_MINIMA) {
    if (!knownContexts.has(context)) throw new R24Error('E_REQUIRED_INTERNAL_CI_CONTEXT_MISSING', context);
  }

  const payload = {
    schemaVersion: 'yalken.compiled-live-ci-binding.r2.4',
    canonicalRepo: repoRoot,
    originUrl,
    headSha,
    treeSha,
    cleanWorktree: true,
    missionDigest,
    graphDigest,
    workflows,
    requiredInternalMinima: [...REQUIRED_INTERNAL_MINIMA],
    branchProtection: 'MUST_BE_OBSERVED_SEPARATELY_AT_G0; CANNOT_WEAKEN_INTERNAL_MINIMA',
    compiledAt: now,
  };
  payload.liveCiBindingDigest = sha256hex(canonicalize(payload));
  payload.authorityEpoch = sha256hex(canonicalize({
    canonicalRepo: repoRoot,
    originUrl,
    headSha,
    treeSha,
    missionDigest,
    graphDigest,
    liveCiBindingDigest: payload.liveCiBindingDigest,
    cleanWorktree: true,
  }));
  return payload;
}

export function bindLanes(binding, laneIds) {
  const knownContexts = new Set(binding.workflows.flatMap((w) => w.jobs.map((job) => `${path.basename(w.file)}#${job}`)));
  const digestByFile = new Map(binding.workflows.map((w) => [path.basename(w.file), w.sha256]));
  return laneIds.map((laneId) => {
    const refs = LOGICAL_LANES[laneId];
    if (!refs) throw new R24Error('E_CI_LANE_UNKNOWN', laneId);
    const bound = refs.map((ref) => {
      if (!knownContexts.has(ref)) throw new R24Error('E_CI_JOB_UNBOUND', `${laneId}:${ref}`);
      const [file, job] = ref.split('#');
      return { ref, workflow: `.github/workflows/${file}`, job, workflowDigest: digestByFile.get(file) };
    });
    return { laneId, contexts: bound };
  });
}
