#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const TOOL_VERSION = 'simulation-min-contract-state.v1';
const CONTRACT_PATH = 'docs/OPS/STATUS/SIMULATION_MIN_CONTRACT.json';

function parseArgs(argv) {
  const out = { json: false };
  for (const arg of argv) {
    if (arg === '--json') out.json = true;
  }
  return out;
}

function stableSortValue(value) {
  if (Array.isArray(value)) return value.map((item) => stableSortValue(item));
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = stableSortValue(value[key]);
  }
  return out;
}

function stableStringify(value) {
  return JSON.stringify(stableSortValue(value));
}

function hashStable(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function isSafeRepoRelativePath(input) {
  if (typeof input !== 'string' || !input.trim()) return false;
  const normalized = input.trim();
  if (path.isAbsolute(normalized)) return false;
  if (normalized.includes('\\')) return false;
  if (normalized.split('/').includes('..')) return false;
  return true;
}

function parseTokenLines(stdout) {
  const map = new Map();
  for (const raw of String(stdout || '').split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line) continue;
    const normalized = line.startsWith('DOCTOR_TOKEN ')
      ? line.slice('DOCTOR_TOKEN '.length).trim()
      : line;
    const idx = normalized.indexOf('=');
    if (idx <= 0) continue;
    map.set(normalized.slice(0, idx), normalized.slice(idx + 1));
  }
  return map;
}

function parseProofHookCommand(proofHook) {
  if (typeof proofHook !== 'string' || !proofHook.trim()) {
    return { ok: false, reason: 'E_SIM_PROOFHOOK_EMPTY', cmd: '', args: [] };
  }
  const parts = proofHook.trim().split(/\s+/u).filter(Boolean);
  if (parts.length < 2 || parts[0] !== 'node') {
    return { ok: false, reason: 'E_SIM_PROOFHOOK_UNSUPPORTED', cmd: '', args: [] };
  }
  return {
    ok: true,
    reason: '',
    cmd: process.execPath,
    args: parts.slice(1),
  };
}

function normalizeExpectedTokenEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const name = typeof entry.name === 'string' ? entry.name.trim() : '';
  const value = Number(entry.value);
  if (!name || !Number.isInteger(value)) return null;
  return { name, value };
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function normalizeActualTokenValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/u.test(value.trim())) {
    return Number(value.trim());
  }
  return value;
}

function runScenarioProof(proofHook) {
  const parsed = parseProofHookCommand(proofHook);
  if (!parsed.ok) {
    return {
      status: 1,
      code: parsed.reason,
      payload: null,
      tokenLines: new Map(),
      outputHash: '',
    };
  }

  const result = spawnSync(parsed.cmd, parsed.args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
  });

  const status = typeof result.status === 'number' ? result.status : 1;
  const stdout = String(result.stdout || '');
  const tokenLines = parseTokenLines(stdout);

  let payload = null;
  try {
    const parsedPayload = JSON.parse(stdout);
    if (parsedPayload && typeof parsedPayload === 'object' && !Array.isArray(parsedPayload)) {
      payload = parsedPayload;
    }
  } catch {
    payload = null;
  }

  return {
    status,
    code: status === 0 ? '' : 'E_SIM_PROOFHOOK_EXEC_FAIL',
    payload,
    tokenLines,
    outputHash: hashStable({
      status,
      payload: payload ? stableSortValue(payload) : null,
      tokenLines: [...tokenLines.entries()],
    }),
  };
}

function evaluateScenario(scenario, index) {
  const scenarioResult = {
    scenarioId: '',
    index,
    deterministic: false,
    inputsRef: '',
    inputsHash: '',
    proofHook: '',
    hookExitCode: 1,
    outputHash: '',
    tokenChecks: [],
    pass: false,
    code: '',
  };

  if (!scenario || typeof scenario !== 'object' || Array.isArray(scenario)) {
    scenarioResult.code = 'E_SIM_SCENARIO_SCHEMA_INVALID';
    return scenarioResult;
  }

  scenarioResult.scenarioId = typeof scenario.scenarioId === 'string' ? scenario.scenarioId.trim() : '';
  scenarioResult.deterministic = scenario.deterministic === true;
  scenarioResult.inputsRef = typeof scenario.inputsRef === 'string' ? scenario.inputsRef.trim() : '';
  scenarioResult.proofHook = typeof scenario.proofHook === 'string' ? scenario.proofHook.trim() : '';

  if (!scenarioResult.scenarioId || scenarioResult.deterministic !== true || !scenarioResult.proofHook) {
    scenarioResult.code = 'E_SIM_SCENARIO_SCHEMA_INVALID';
    return scenarioResult;
  }

  if (!isSafeRepoRelativePath(scenarioResult.inputsRef)) {
    scenarioResult.code = 'E_SIM_INPUTS_REF_INVALID';
    return scenarioResult;
  }

  if (!fs.existsSync(scenarioResult.inputsRef)) {
    scenarioResult.code = 'E_SIM_INPUTS_REF_MISSING';
    return scenarioResult;
  }

  const fixture = readJsonFile(scenarioResult.inputsRef);
  if (!fixture || typeof fixture !== 'object' || Array.isArray(fixture)) {
    scenarioResult.code = 'E_SIM_INPUTS_REF_JSON_INVALID';
    return scenarioResult;
  }
  scenarioResult.inputsHash = hashStable(fixture);

  const expectedRaw = Array.isArray(scenario.expectedTokens) ? scenario.expectedTokens : [];
  if (expectedRaw.length === 0) {
    scenarioResult.code = 'E_SIM_EXPECTED_TOKENS_EMPTY';
    return scenarioResult;
  }

  const expectedTokens = [];
  for (const item of expectedRaw) {
    const normalized = normalizeExpectedTokenEntry(item);
    if (!normalized) {
      scenarioResult.code = 'E_SIM_EXPECTED_TOKEN_SCHEMA_INVALID';
      return scenarioResult;
    }
    expectedTokens.push(normalized);
  }

  const proof = runScenarioProof(scenarioResult.proofHook);
  scenarioResult.hookExitCode = proof.status;
  scenarioResult.outputHash = proof.outputHash;

  if (proof.code) {
    scenarioResult.code = proof.code;
    return scenarioResult;
  }

  for (const token of expectedTokens) {
    let actual = null;
    let source = 'missing';

    if (proof.payload && Object.prototype.hasOwnProperty.call(proof.payload, token.name)) {
      actual = normalizeActualTokenValue(proof.payload[token.name]);
      source = 'json';
    } else if (proof.tokenLines.has(token.name)) {
      actual = normalizeActualTokenValue(proof.tokenLines.get(token.name));
      source = 'token-line';
    }

    const pass = actual === token.value;
    scenarioResult.tokenChecks.push({
      name: token.name,
      expected: token.value,
      actual,
      source,
      pass,
    });
  }

  const tokensPass = scenarioResult.tokenChecks.every((entry) => entry.pass === true);
  scenarioResult.pass = proof.status === 0 && tokensPass;
  scenarioResult.code = scenarioResult.pass ? '' : 'E_SIM_EXPECTED_TOKEN_MISMATCH';

  return scenarioResult;
}

export function evaluateSimulationMinContractState() {
  const state = {
    toolVersion: TOOL_VERSION,
    contractPath: CONTRACT_PATH,
    schemaVersion: '',
    scenariosTotal: 0,
    scenariosPass: 0,
    scenarioResults: [],
    failReasons: [],
    SIMULATION_SCENARIOS_TOTAL: 0,
    SIMULATION_SCENARIOS_PASS: 0,
    SIMULATION_MIN_CONTRACT_OK: 0,
    failReason: '',
  };

  if (!fs.existsSync(CONTRACT_PATH)) {
    state.failReason = 'E_SIM_CONTRACT_SPEC_MISSING';
    state.failReasons = [state.failReason];
    return state;
  }

  const contract = readJsonFile(CONTRACT_PATH);
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    state.failReason = 'E_SIM_CONTRACT_SPEC_JSON_INVALID';
    state.failReasons = [state.failReason];
    return state;
  }

  state.schemaVersion = typeof contract.schemaVersion === 'string' ? contract.schemaVersion : '';
  if (state.schemaVersion !== 'simulation-min-contract.v1') {
    state.failReason = 'E_SIM_CONTRACT_SCHEMA_VERSION_INVALID';
    state.failReasons = [state.failReason];
    return state;
  }

  const scenarios = Array.isArray(contract.scenarios) ? contract.scenarios : [];
  if (scenarios.length < 4) {
    state.failReason = 'E_SIM_SCENARIO_COUNT_MIN4_REQUIRED';
    state.failReasons = [state.failReason];
    return state;
  }

  const seenIds = new Set();
  const scenarioResults = [];
  for (let i = 0; i < scenarios.length; i += 1) {
    const result = evaluateScenario(scenarios[i], i);
    if (seenIds.has(result.scenarioId)) {
      result.pass = false;
      result.code = 'E_SIM_SCENARIO_ID_DUPLICATE';
    }
    if (result.scenarioId) {
      seenIds.add(result.scenarioId);
    }
    scenarioResults.push(result);
  }

  state.scenarioResults = scenarioResults;
  state.scenariosTotal = scenarioResults.length;
  state.scenariosPass = scenarioResults.filter((result) => result.pass).length;
  state.SIMULATION_SCENARIOS_TOTAL = state.scenariosTotal;
  state.SIMULATION_SCENARIOS_PASS = state.scenariosPass;

  const failing = scenarioResults
    .filter((result) => !result.pass)
    .map((result) => `${result.scenarioId || `index-${result.index}`}:${result.code || 'E_SIM_SCENARIO_FAIL'}`)
    .sort();
  state.failReasons = failing;
  state.SIMULATION_MIN_CONTRACT_OK = failing.length === 0 ? 1 : 0;
  state.failReason = failing[0] || '';

  return state;
}

function printTokens(state) {
  console.log(`SIMULATION_MIN_CONTRACT_TOOL_VERSION=${state.toolVersion}`);
  console.log(`SIMULATION_MIN_CONTRACT_SCHEMA_VERSION=${state.schemaVersion}`);
  console.log(`SIMULATION_MIN_CONTRACT_PATH=${state.contractPath}`);
  console.log(`SIMULATION_SCENARIOS_TOTAL=${state.SIMULATION_SCENARIOS_TOTAL}`);
  console.log(`SIMULATION_SCENARIOS_PASS=${state.SIMULATION_SCENARIOS_PASS}`);
  console.log(`SIMULATION_FAIL_REASONS=${JSON.stringify(state.failReasons)}`);
  console.log(`SIMULATION_MIN_CONTRACT_OK=${state.SIMULATION_MIN_CONTRACT_OK}`);
  if (state.failReason) {
    console.log(`FAIL_REASON=${state.failReason}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateSimulationMinContractState();
  if (args.json) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  } else {
    printTokens(state);
  }
  process.exit(state.SIMULATION_MIN_CONTRACT_OK === 1 ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
