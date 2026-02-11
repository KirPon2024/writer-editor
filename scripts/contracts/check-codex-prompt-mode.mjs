import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const policyPath = path.join(process.cwd(), 'docs', 'OPERATIONS', 'STATUS', 'CODEX_AUTOMATION_POLICY.json');
const expectedMode = 'prompt_disabled';
const probeSteps = [
  { id: 'BOOTSTRAP', cmd: process.execPath, args: ['scripts/ops/bootstrap-noninteractive.mjs'] },
  { id: 'TRUTH_TABLE', cmd: process.execPath, args: ['scripts/ops/extract-truth-table.mjs', '--json'] },
];

function fail(reason) {
  console.error(reason);
  process.exit(1);
}

function runProbe(probe, env) {
  const result = spawnSync(probe.cmd, probe.args, {
    encoding: 'utf8',
    env,
  });
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim();
    fail(`PROMPT_MODE_UNPROVEN:PROBE_FAILED:${probe.id}:${detail}`);
  }
  return `${result.stdout || ''}\n${result.stderr || ''}`;
}

if (!fs.existsSync(policyPath)) {
  fail('PROMPT_MODE_UNPROVEN:POLICY_MISSING');
}

const doc = JSON.parse(fs.readFileSync(policyPath, 'utf8'));

if (doc.promptMode !== expectedMode) {
  fail(`PROMPT_MODE_UNPROVEN:EXPECTED_${expectedMode}`);
}

if (!doc.promptDetection || typeof doc.promptDetection !== 'object') {
  fail('PROMPT_MODE_UNPROVEN:PROMPT_DETECTION_MISSING');
}

const markerRegex = doc.promptDetection.markerRegex;
if (typeof markerRegex !== 'string' || markerRegex.trim() === '') {
  fail('PROMPT_MODE_UNPROVEN:MARKER_REGEX_MISSING');
}

try {
  // Proof guard: regex must compile and be enforced against probe output.
  const marker = new RegExp(markerRegex, 'i');
  const repoPromptLayerMarker = /\bPROMPT_LAYER\s*=\s*REPO\b/i;
  const probeEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: process.env.GIT_ASKPASS || '/usr/bin/true',
    CI: '1',
  };

  for (const probe of probeSteps) {
    const output = runProbe(probe, probeEnv);
    if (repoPromptLayerMarker.test(output)) {
      fail(`PROMPT_NOT_ELIMINATED:PROMPT_LAYER_REPO:${probe.id}`);
    }
    if (marker.test(output)) {
      fail(`PROMPT_NOT_ELIMINATED:MARKER_MATCH:${probe.id}`);
    }
  }
} catch (error) {
  fail(`PROMPT_MODE_UNPROVEN:MARKER_REGEX_INVALID:${error.message}`);
}

if (!Number.isInteger(doc.promptDetection.exitCodeOnPrompt)) {
  fail('PROMPT_MODE_UNPROVEN:EXIT_CODE_INVALID');
}

console.log('CP-5 PROMPT_MODE_BOOTSTRAP_OK=1');
console.log('CP-6 PROMPT_MODE_REPO_LAYER_OK=1');
console.log('PROMPT_DETECTION=NOT_DETECTED');
console.log('PROMPT_LAYER=RUNNER_UI');
