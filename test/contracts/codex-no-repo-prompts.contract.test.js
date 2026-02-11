const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const policyPath = path.join(process.cwd(), 'docs', 'OPERATIONS', 'STATUS', 'CODEX_AUTOMATION_POLICY.json');
const policyDoc = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
const promptMarker = new RegExp(policyDoc.promptDetection.markerRegex, 'i');
const repoPromptLayerMarker = /\bPROMPT_LAYER\s*=\s*REPO\b/i;

function runNodeScript(args, extraEnv = {}) {
  return spawnSync(process.execPath, args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_ASKPASS: process.env.GIT_ASKPASS || '/usr/bin/true',
      CI: '1',
      ...extraEnv,
    },
  });
}

test('prompt-mode contract: checker reports no repo-layer prompts', () => {
  const result = runNodeScript(['scripts/contracts/check-codex-prompt-mode.mjs']);
  assert.equal(result.status, 0, `checker failed:\n${result.stdout}\n${result.stderr}`);

  const stdout = String(result.stdout || '');
  assert.equal(stdout.includes('PROMPT_DETECTION=NOT_DETECTED'), true, `missing prompt detection token:\n${stdout}`);
  assert.equal(stdout.includes('PROMPT_LAYER=RUNNER_UI'), true, `missing prompt layer token:\n${stdout}`);
  assert.equal(repoPromptLayerMarker.test(stdout), false, `unexpected repo prompt layer token:\n${stdout}`);
});

test('ops scripts: no prompt markers and no PROMPT_LAYER=REPO', () => {
  const scripts = [
    ['scripts/ops/bootstrap-noninteractive.mjs'],
    ['scripts/ops/extract-truth-table.mjs', '--json'],
  ];

  for (const scriptArgs of scripts) {
    const result = runNodeScript(scriptArgs);
    assert.equal(result.status, 0, `script failed (${scriptArgs.join(' ')}):\n${result.stdout}\n${result.stderr}`);
    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    assert.equal(repoPromptLayerMarker.test(output), false, `repo-layer prompt marker found (${scriptArgs.join(' ')}):\n${output}`);
    assert.equal(promptMarker.test(output), false, `prompt marker regex matched (${scriptArgs.join(' ')}):\n${output}`);
  }
});
