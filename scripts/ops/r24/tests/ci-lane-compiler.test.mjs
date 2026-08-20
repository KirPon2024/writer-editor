import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  compileLiveCiBinding,
  bindLanes,
  readWorkflows,
  REQUIRED_INTERNAL_MINIMA,
} from '../ci-lane-compiler.mjs';

const NOW = '2026-08-20T00:00:00Z';
const MISSION = 'a'.repeat(64);
const GRAPH = 'b'.repeat(64);

const git = (repo, args) => {
  const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};

function makeRepo({ workflows }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-ci-'));
  git(dir, ['init', '-q']);
  git(dir, ['remote', 'add', 'origin', 'https://github.com/KirPonomarev/writer-editor.git']);
  const wfDir = path.join(dir, '.github', 'workflows');
  fs.mkdirSync(wfDir, { recursive: true });
  for (const [name, text] of Object.entries(workflows)) fs.writeFileSync(path.join(wfDir, name), text);
  fs.writeFileSync(path.join(dir, 'README.md'), 'fixture\n');
  git(dir, ['add', '-A']);
  git(dir, ['-c', 'user.email=test@example.invalid', '-c', 'user.name=test', 'commit', '-qm', 'fixture']);
  return dir;
}

const wf = (job) => `name: t\non: [push]\njobs:\n  ${job}:\n    runs-on: ubuntu-latest\n    steps: []\n`;

function fullWorkflows() {
  return {
    'lockfile-node20.yml': wf('lockfile'),
    'oss-policy.yml': wf('oss-policy'),
    'rtk-required.yml': wf('rtk-required'),
    'x1-runtime-parity.yml': wf('x1-runtime-parity'),
    'ops-vector-close.yml': wf('ops_vector_close'),
  };
}

test('compiler binds exact head/tree/digests and lane coordinates', () => {
  const repo = makeRepo({ workflows: fullWorkflows() });
  const head = git(repo, ['rev-parse', 'HEAD']);
  const binding = compileLiveCiBinding({
    repoRoot: repo,
    expectedHeadSha: head,
    expectedOriginUrl: 'https://github.com/KirPonomarev/writer-editor.git',
    missionDigest: MISSION,
    graphDigest: GRAPH,
    now: NOW,
  });
  assert.equal(binding.headSha, head);
  assert.equal(binding.cleanWorktree, true);
  assert.match(binding.liveCiBindingDigest, /^[0-9a-f]{64}$/);
  assert.match(binding.authorityEpoch, /^[0-9a-f]{64}$/);
  const lanes = bindLanes(binding, ['BASELINE_REQUIRED', 'OPS_GOVERNANCE']);
  assert.equal(lanes[0].contexts.length, 4);
  assert.equal(lanes[1].contexts.length, 2);
  assert.equal(lanes[0].contexts[0].workflowDigest.length, 64);
});

test('head mismatch, dirty tree and wrong origin fail closed', () => {
  const repo = makeRepo({ workflows: fullWorkflows() });
  const head = git(repo, ['rev-parse', 'HEAD']);
  assert.throws(
    () => compileLiveCiBinding({ repoRoot: repo, expectedHeadSha: '0'.repeat(40), expectedOriginUrl: null, missionDigest: MISSION, graphDigest: GRAPH, now: NOW }),
    (e) => e.code === 'E_HEAD_MISMATCH',
  );
  assert.throws(
    () => compileLiveCiBinding({ repoRoot: repo, expectedHeadSha: head, expectedOriginUrl: 'https://example.invalid/other.git', missionDigest: MISSION, graphDigest: GRAPH, now: NOW }),
    (e) => e.code === 'E_ORIGIN_IDENTITY',
  );
  fs.writeFileSync(path.join(repo, 'dirty.txt'), 'x');
  assert.throws(
    () => compileLiveCiBinding({ repoRoot: repo, expectedHeadSha: head, expectedOriginUrl: 'https://github.com/KirPonomarev/writer-editor.git', missionDigest: MISSION, graphDigest: GRAPH, now: NOW }),
    (e) => e.code === 'E_WORKTREE_DIRTY',
  );
});

test('missing required internal context fails closed', () => {
  const workflows = fullWorkflows();
  delete workflows['x1-runtime-parity.yml'];
  const repo = makeRepo({ workflows });
  const head = git(repo, ['rev-parse', 'HEAD']);
  assert.throws(
    () => compileLiveCiBinding({ repoRoot: repo, expectedHeadSha: head, expectedOriginUrl: null, missionDigest: MISSION, graphDigest: GRAPH, now: NOW }),
    (e) => e.code === 'E_REQUIRED_INTERNAL_CI_CONTEXT_MISSING' && e.message.includes('x1-runtime-parity.yml#x1-runtime-parity'),
  );
});

test('workflow without jobs and lane binding to unknown job fail closed', () => {
  const repo = makeRepo({ workflows: { ...fullWorkflows(), 'broken.yml': 'name: b\non: [push]\n' } });
  assert.throws(() => readWorkflows(repo), (e) => e.code === 'E_WORKFLOW_JOB_DENOMINATOR_ZERO');
  const repo2 = makeRepo({ workflows: fullWorkflows() });
  const head = git(repo2, ['rev-parse', 'HEAD']);
  const binding = compileLiveCiBinding({ repoRoot: repo2, expectedHeadSha: head, expectedOriginUrl: null, missionDigest: MISSION, graphDigest: GRAPH, now: NOW });
  assert.throws(() => bindLanes(binding, ['NOPE_LANE']), (e) => e.code === 'E_CI_LANE_UNKNOWN');
});

test('digest changes when workflow content changes (no stale binding)', () => {
  const repo = makeRepo({ workflows: fullWorkflows() });
  const head = git(repo, ['rev-parse', 'HEAD']);
  const first = compileLiveCiBinding({ repoRoot: repo, expectedHeadSha: head, expectedOriginUrl: null, missionDigest: MISSION, graphDigest: GRAPH, now: NOW });
  fs.writeFileSync(path.join(repo, '.github', 'workflows', 'rtk-required.yml'), wf('rtk-required') + '# drift\n');
  git(repo, ['add', '-A']);
  git(repo, ['-c', 'user.email=test@example.invalid', '-c', 'user.name=test', 'commit', '-qm', 'drift']);
  const head2 = git(repo, ['rev-parse', 'HEAD']);
  const second = compileLiveCiBinding({ repoRoot: repo, expectedHeadSha: head2, expectedOriginUrl: null, missionDigest: MISSION, graphDigest: GRAPH, now: NOW });
  assert.notEqual(first.liveCiBindingDigest, second.liveCiBindingDigest);
  assert.notEqual(first.authorityEpoch, second.authorityEpoch);
});
