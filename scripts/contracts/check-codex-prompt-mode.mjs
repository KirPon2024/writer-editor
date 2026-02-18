import fs from 'node:fs';
import path from 'node:path';

const policyPath = path.join(process.cwd(), 'docs', 'OPERATIONS', 'STATUS', 'CODEX_AUTOMATION_POLICY.json');
const expectedMode = 'prompt_disabled';
const scanRoots = ['scripts', 'test'];
const runWavePath = 'scripts/ops/run-wave.mjs';

const PROMPT_LAYER_KEY = 'PROMPT_LAYER';
const PROMPT_LAYER_RE = new RegExp(`${PROMPT_LAYER_KEY}\\s*=\\s*([A-Z_]+)`, 'g');
const PROMPT_LAYER_RUNNER_UI = 'RUNNER_UI';
const PROMPT_LAYER_REPO = 'REPO';

function fail(reason, detail = '') {
  const suffix = detail ? `:${detail}` : '';
  console.error(`${reason}${suffix}`);
  process.exit(1);
}

function listFilesRecursive(rootDir, baseDir, out = []) {
  if (!fs.existsSync(rootDir)) return out;

  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const absPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      listFilesRecursive(absPath, baseDir, out);
      continue;
    }
    if (!entry.isFile()) continue;

    const relativePath = path.relative(baseDir, absPath).replaceAll(path.sep, '/');
    out.push(relativePath);
  }

  return out;
}

function readTextMap(baseDir, roots) {
  const textMap = new Map();

  for (const root of roots) {
    const rootPath = path.join(baseDir, root);
    const files = listFilesRecursive(rootPath, baseDir);
    for (const relativePath of files) {
      const absPath = path.join(baseDir, relativePath);
      const text = fs.readFileSync(absPath, 'utf8');
      textMap.set(relativePath, text);
    }
  }

  return textMap;
}

function collectPromptLayerOccurrences(filePath, text) {
  const out = [];
  const input = String(text || '');
  PROMPT_LAYER_RE.lastIndex = 0;

  let match = null;
  while ((match = PROMPT_LAYER_RE.exec(input)) !== null) {
    out.push({
      filePath,
      value: String(match[1] || ''),
    });
  }

  return out;
}

function evaluatePromptLayerSingleSource(textMap) {
  const occurrences = [];
  const sortedEntries = [...textMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  for (const [filePath, text] of sortedEntries) {
    occurrences.push(...collectPromptLayerOccurrences(filePath, text));
  }

  const errors = [];
  const repoMarkers = occurrences.filter((entry) => entry.value === PROMPT_LAYER_REPO);
  if (repoMarkers.length > 0) {
    errors.push({
      code: 'E_PROMPT_LAYER_REPO_FORBIDDEN',
      files: [...new Set(repoMarkers.map((entry) => entry.filePath))].sort((a, b) => a.localeCompare(b)),
    });
  }

  const outsideRunWave = occurrences.filter((entry) => entry.filePath !== runWavePath);
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

  const allRunWaveMarkers = occurrences.filter((entry) => entry.filePath === runWavePath);
  if (allRunWaveMarkers.length !== 1 || allRunWaveMarkers[0]?.value !== PROMPT_LAYER_RUNNER_UI) {
    errors.push({
      code: 'E_PROMPT_LAYER_RUN_WAVE_SINGLE_MARKER',
      actual: allRunWaveMarkers.map((entry) => entry.value),
      expected: [PROMPT_LAYER_RUNNER_UI],
    });
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

function validatePolicyDoc() {
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
    new RegExp(markerRegex, 'i');
  } catch (error) {
    fail('PROMPT_MODE_UNPROVEN:MARKER_REGEX_INVALID', error.message);
  }

  if (!Number.isInteger(doc.promptDetection.exitCodeOnPrompt)) {
    fail('PROMPT_MODE_UNPROVEN:EXIT_CODE_INVALID');
  }
}

function main() {
  validatePolicyDoc();

  const textMap = readTextMap(process.cwd(), scanRoots);
  const state = evaluatePromptLayerSingleSource(textMap);
  if (!state.ok) {
    fail('PROMPT_MODE_UNPROVEN:PROMPT_LAYER_SINGLE_SOURCE', JSON.stringify(state.errors));
  }

  console.log('CP-5 PROMPT_MODE_BOOTSTRAP_OK=1');
  console.log('CP-6 PROMPT_MODE_REPO_LAYER_OK=1');
  console.log('PROMPT_DETECTION=NOT_DETECTED');
  console.log('PROMPT_LAYER_POLICY_OK=1');
  console.log('PROMPT_LAYER_SINGLE_SOURCE_OK=1');
}

main();
