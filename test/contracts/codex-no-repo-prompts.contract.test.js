const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = process.cwd();
const CHECKER_PATH = path.join(REPO_ROOT, 'scripts', 'contracts', 'check-codex-prompt-mode.mjs');
const RUN_WAVE_PATH = 'scripts/ops/run-wave.mjs';
const SCAN_ROOTS = ['scripts', 'test'];

const PROMPT_LAYER_KEY = 'PROMPT_LAYER';
const PROMPT_LAYER_EQ = '=';
const PROMPT_LAYER_RUNNER_UI = 'RUNNER_UI';
const PROMPT_LAYER_REPO = 'REPO';
const TOKEN_RUNNER_UI = `${PROMPT_LAYER_KEY}${PROMPT_LAYER_EQ}${PROMPT_LAYER_RUNNER_UI}`;
const TOKEN_REPO = `${PROMPT_LAYER_KEY}${PROMPT_LAYER_EQ}${PROMPT_LAYER_REPO}`;

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

function listFilesRecursive(absDir, baseDir, out = []) {
  if (!fs.existsSync(absDir)) return out;
  const entries = fs.readdirSync(absDir, { withFileTypes: true });
  for (const entry of entries) {
    const absPath = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      listFilesRecursive(absPath, baseDir, out);
      continue;
    }
    if (!entry.isFile()) continue;
    out.push(path.relative(baseDir, absPath).replaceAll(path.sep, '/'));
  }
  return out;
}

function buildRepoTextMap() {
  const textMap = new Map();
  for (const root of SCAN_ROOTS) {
    const rootPath = path.join(REPO_ROOT, root);
    const files = listFilesRecursive(rootPath, REPO_ROOT);
    for (const relativePath of files) {
      const absPath = path.join(REPO_ROOT, relativePath);
      textMap.set(relativePath, fs.readFileSync(absPath, 'utf8'));
    }
  }
  return textMap;
}

function countExactToken(text, token) {
  const input = String(text || '');
  let count = 0;
  let offset = 0;
  while (offset <= input.length) {
    const index = input.indexOf(token, offset);
    if (index === -1) break;
    count += 1;
    offset = index + token.length;
  }
  return count;
}

function collectPromptLayerOccurrences(textMap) {
  const regex = new RegExp(`${PROMPT_LAYER_KEY}\\s*=\\s*([A-Z_]+)`, 'g');
  const occurrences = [];

  for (const [filePath, text] of [...textMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const input = String(text || '');
    regex.lastIndex = 0;
    let match = null;
    while ((match = regex.exec(input)) !== null) {
      occurrences.push({ filePath, value: String(match[1] || '') });
    }
  }

  return occurrences;
}

function evaluatePromptLayerPolicy(textMap) {
  const occurrences = collectPromptLayerOccurrences(textMap);
  const errors = [];

  const repoMarkers = occurrences.filter((entry) => entry.value === PROMPT_LAYER_REPO);
  if (repoMarkers.length > 0) {
    errors.push({
      code: 'E_PROMPT_LAYER_REPO_FORBIDDEN',
      files: [...new Set(repoMarkers.map((entry) => entry.filePath))].sort((a, b) => a.localeCompare(b)),
    });
  }

  const outsideRunWave = occurrences.filter((entry) => entry.filePath !== RUN_WAVE_PATH);
  if (outsideRunWave.length > 0) {
    errors.push({
      code: 'E_PROMPT_LAYER_OUTSIDE_RUN_WAVE',
      files: [...new Set(outsideRunWave.map((entry) => entry.filePath))].sort((a, b) => a.localeCompare(b)),
    });
  }

  const runnerUiMarkers = occurrences.filter((entry) => entry.value === PROMPT_LAYER_RUNNER_UI);
  if (runnerUiMarkers.length !== 1) {
    errors.push({
      code: 'E_PROMPT_LAYER_RUNNER_UI_COUNT',
      actual: runnerUiMarkers.length,
      expected: 1,
    });
  }

  const runWaveMarkers = occurrences.filter((entry) => entry.filePath === RUN_WAVE_PATH);
  if (runWaveMarkers.length !== 1 || runWaveMarkers[0]?.value !== PROMPT_LAYER_RUNNER_UI) {
    errors.push({
      code: 'E_PROMPT_LAYER_RUN_WAVE_SINGLE_MARKER',
      actual: runWaveMarkers.map((entry) => entry.value),
      expected: [PROMPT_LAYER_RUNNER_UI],
    });
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

function lineWithToken(token) {
  return `console.log(${JSON.stringify(token)});`;
}

function buildFixtureMap() {
  return new Map([
    [RUN_WAVE_PATH, `#!/usr/bin/env node\n${lineWithToken(TOKEN_RUNNER_UI)}\n`],
    ['scripts/ops/bootstrap-noninteractive.mjs', '#!/usr/bin/env node\nconsole.log("BOOTSTRAP_MODE=NONINTERACTIVE");\n'],
    ['scripts/contracts/check-codex-prompt-mode.mjs', '#!/usr/bin/env node\nconsole.log("PROMPT_LAYER_POLICY_OK=1");\n'],
  ]);
}

test('prompt-mode contract: checker passes without prompt-layer token output', () => {
  const result = runNodeScript([CHECKER_PATH]);
  assert.equal(result.status, 0, `checker failed:\n${result.stdout}\n${result.stderr}`);

  const stdout = String(result.stdout || '');
  assert.equal(stdout.includes('PROMPT_DETECTION=NOT_DETECTED'), true, `missing prompt detection token:\n${stdout}`);
  assert.equal(stdout.includes('PROMPT_LAYER_SINGLE_SOURCE_OK=1'), true, `missing single-source token:\n${stdout}`);
  assert.equal(stdout.includes(`${PROMPT_LAYER_KEY}${PROMPT_LAYER_EQ}`), false, `unexpected prompt-layer token in checker output:\n${stdout}`);
});

test('prompt-mode contract: repository scan enforces single-source runner marker', () => {
  const textMap = buildRepoTextMap();
  const state = evaluatePromptLayerPolicy(textMap);

  assert.equal(state.ok, true, `expected single-source scan pass:\n${JSON.stringify(state.errors, null, 2)}`);

  const runWaveText = textMap.get(RUN_WAVE_PATH);
  assert.equal(typeof runWaveText, 'string', `missing ${RUN_WAVE_PATH} in scan map`);
  assert.equal(countExactToken(runWaveText, TOKEN_RUNNER_UI), 1, 'run-wave must contain exactly one RUNNER_UI marker literal');

  const runnerUiTotal = [...textMap.values()].reduce((sum, text) => sum + countExactToken(text, TOKEN_RUNNER_UI), 0);
  assert.equal(runnerUiTotal, 1, 'RUNNER_UI marker literal must appear exactly once across scripts/test scan roots');
});

test('prompt-mode contract negative: reject repo-layer marker', () => {
  const fixture = buildFixtureMap();
  fixture.set('scripts/ops/evil-repo-layer.mjs', `#!/usr/bin/env node\n${lineWithToken(TOKEN_REPO)}\n`);

  const state = evaluatePromptLayerPolicy(fixture);
  assert.equal(state.ok, false);
  assert.ok(state.errors.some((entry) => entry.code === 'E_PROMPT_LAYER_REPO_FORBIDDEN'));
});

test('prompt-mode contract negative: reject runner marker in bootstrap', () => {
  const fixture = buildFixtureMap();
  fixture.set('scripts/ops/bootstrap-noninteractive.mjs', `#!/usr/bin/env node\n${lineWithToken(TOKEN_RUNNER_UI)}\n`);

  const state = evaluatePromptLayerPolicy(fixture);
  assert.equal(state.ok, false);
  assert.ok(state.errors.some((entry) => entry.code === 'E_PROMPT_LAYER_OUTSIDE_RUN_WAVE'));
});

test('prompt-mode contract negative: reject runner marker in contract checker', () => {
  const fixture = buildFixtureMap();
  fixture.set('scripts/contracts/check-codex-prompt-mode.mjs', `#!/usr/bin/env node\n${lineWithToken(TOKEN_RUNNER_UI)}\n`);

  const state = evaluatePromptLayerPolicy(fixture);
  assert.equal(state.ok, false);
  assert.ok(state.errors.some((entry) => entry.code === 'E_PROMPT_LAYER_OUTSIDE_RUN_WAVE'));
});

test('prompt-mode contract negative: reject runner marker in two files', () => {
  const fixture = buildFixtureMap();
  fixture.set('scripts/ops/secondary-runner.mjs', `#!/usr/bin/env node\n${lineWithToken(TOKEN_RUNNER_UI)}\n`);

  const state = evaluatePromptLayerPolicy(fixture);
  assert.equal(state.ok, false);
  assert.ok(state.errors.some((entry) => entry.code === 'E_PROMPT_LAYER_RUNNER_UI_COUNT'));
  assert.ok(state.errors.some((entry) => entry.code === 'E_PROMPT_LAYER_OUTSIDE_RUN_WAVE'));
});

test('prompt-mode contract negative: reject duplicate runner marker in run-wave file', () => {
  const fixture = buildFixtureMap();
  fixture.set(RUN_WAVE_PATH, `#!/usr/bin/env node\n${lineWithToken(TOKEN_RUNNER_UI)}\n${lineWithToken(TOKEN_RUNNER_UI)}\n`);

  const state = evaluatePromptLayerPolicy(fixture);
  assert.equal(state.ok, false);
  assert.ok(state.errors.some((entry) => entry.code === 'E_PROMPT_LAYER_RUNNER_UI_COUNT'));
  assert.ok(state.errors.some((entry) => entry.code === 'E_PROMPT_LAYER_RUN_WAVE_SINGLE_MARKER'));
});
