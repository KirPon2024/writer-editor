const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = process.cwd();
const RUN_WAVE_REL_PATH = 'scripts/ops/run-wave.mjs';
const BOOTSTRAP_REL_PATH = 'scripts/ops/bootstrap-noninteractive.mjs';
const CHECKER_REL_PATH = 'scripts/contracts/check-codex-prompt-mode.mjs';
const CHECKER_ABS_PATH = path.join(REPO_ROOT, CHECKER_REL_PATH);

const PROMPT_LAYER_KEY = 'PROMPT_LAYER';
const KEY_VALUE_EQ = '=';
const VALUE_RUNNER_UI = 'RUNNER_UI';
const VALUE_REPO = 'REPO';

function listFilesRecursive(absDir, baseDir, out = []) {
  if (!fs.existsSync(absDir)) return out;
  const entries = fs.readdirSync(absDir, { withFileTypes: true });
  for (const entry of entries) {
    const absPath = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      listFilesRecursive(absPath, baseDir, out);
      continue;
    }
    if (entry.isFile()) {
      out.push(path.relative(baseDir, absPath).replaceAll(path.sep, '/'));
    }
  }
  return out;
}

function buildTextMap(scanRoots) {
  const map = new Map();
  for (const root of scanRoots) {
    const files = listFilesRecursive(path.join(REPO_ROOT, root), REPO_ROOT);
    for (const relPath of files) {
      map.set(relPath, fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8'));
    }
  }
  return map;
}

function collectOccurrences(textMap) {
  const expression = `${PROMPT_LAYER_KEY}\\s*${KEY_VALUE_EQ}\\s*([A-Z_]+)`;
  const re = new RegExp(expression, 'g');
  const out = [];
  for (const [filePath, text] of [...textMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    re.lastIndex = 0;
    let match = null;
    while ((match = re.exec(String(text || ''))) !== null) {
      out.push({ filePath, value: String(match[1] || '') });
    }
  }
  return out;
}

function evaluateSingleSource(textMap) {
  const occurrences = collectOccurrences(textMap);
  const errors = [];

  const repoMarkers = occurrences.filter((entry) => entry.value === VALUE_REPO);
  if (repoMarkers.length > 0) {
    errors.push({ code: 'E_PROMPT_LAYER_REPO_FORBIDDEN', count: repoMarkers.length });
  }

  const runnerMarkers = occurrences.filter((entry) => entry.value === VALUE_RUNNER_UI);
  if (runnerMarkers.length !== 1) {
    errors.push({ code: 'E_PROMPT_LAYER_RUNNER_UI_COUNT', count: runnerMarkers.length });
  }

  const outsideRunWave = occurrences.filter((entry) => entry.filePath !== RUN_WAVE_REL_PATH);
  if (outsideRunWave.length > 0) {
    errors.push({ code: 'E_PROMPT_LAYER_OUTSIDE_RUN_WAVE', count: outsideRunWave.length });
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

function runPromptChecker() {
  return spawnSync(process.execPath, [CHECKER_ABS_PATH], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

test('prompt-layer-single-source: repo scan has no repo marker and single runner marker in run-wave only', () => {
  const textMap = buildTextMap(['scripts', 'test']);
  const state = evaluateSingleSource(textMap);
  assert.equal(state.ok, true, JSON.stringify(state.errors, null, 2));

  const runWaveText = String(textMap.get(RUN_WAVE_REL_PATH) || '');
  const marker = [PROMPT_LAYER_KEY, KEY_VALUE_EQ, VALUE_RUNNER_UI].join('');
  const markerCount = runWaveText.split(marker).length - 1;
  assert.equal(markerCount, 1, 'run-wave must emit RUNNER_UI marker exactly once');
});

test('prompt-layer-single-source: bootstrap and checker do not emit prompt-layer marker', () => {
  const markerRe = new RegExp(`${PROMPT_LAYER_KEY}\\s*${KEY_VALUE_EQ}`);
  const bootstrapText = fs.readFileSync(path.join(REPO_ROOT, BOOTSTRAP_REL_PATH), 'utf8');
  const checkerText = fs.readFileSync(path.join(REPO_ROOT, CHECKER_REL_PATH), 'utf8');

  assert.equal(markerRe.test(bootstrapText), false, 'bootstrap must not emit prompt-layer marker');
  assert.equal(markerRe.test(checkerText), false, 'checker must not emit prompt-layer marker');

  const checkerResult = runPromptChecker();
  assert.equal(checkerResult.status, 0, `${checkerResult.stdout}\n${checkerResult.stderr}`);
  const stdout = String(checkerResult.stdout || '');
  assert.equal(stdout.includes('PROMPT_LAYER_SINGLE_SOURCE_OK=1'), true);
});

test('promotion-layer-emission-outside-run-wave-is-rejected', () => {
  const runnerToken = [PROMPT_LAYER_KEY, KEY_VALUE_EQ, VALUE_RUNNER_UI].join('');
  const fixture = new Map([
    [RUN_WAVE_REL_PATH, `console.log(${JSON.stringify(runnerToken)});\n`],
    [BOOTSTRAP_REL_PATH, `console.log(${JSON.stringify(runnerToken)});\n`],
    [CHECKER_REL_PATH, 'console.log("PROMPT_LAYER_POLICY_OK=1");\n'],
  ]);

  const state = evaluateSingleSource(fixture);
  assert.equal(state.ok, false);
  assert.ok(state.errors.some((entry) => entry.code === 'E_PROMPT_LAYER_OUTSIDE_RUN_WAVE'));
});
