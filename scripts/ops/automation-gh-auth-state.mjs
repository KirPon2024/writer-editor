#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = 'github.com';
const TOKEN_NAME = 'AUTOMATION_GH_AUTH_OK';
const FAIL_CODE = 'E_AUTOMATION_GH_AUTH_INVALID';

function isTruthy(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function buildFailure(message) {
  return {
    ok: false,
    tokens: {
      [TOKEN_NAME]: 0,
    },
    fails: [
      {
        code: FAIL_CODE,
        details: {
          message: String(message || 'gh auth status failed'),
          host: HOST,
        },
      },
    ],
  };
}

function buildSuccess() {
  return {
    ok: true,
    tokens: {
      [TOKEN_NAME]: 1,
    },
  };
}

function getFailureMessage(result) {
  if (result && result.error) {
    if (result.error.code === 'ENOENT') return 'gh CLI is not installed';
    return 'gh auth status failed to execute';
  }
  if (result && result.signal) {
    return `gh auth status terminated by signal ${result.signal}`;
  }
  if (result && Number.isInteger(result.status)) {
    return `gh auth status failed with exit code ${result.status}`;
  }
  return 'gh auth status failed';
}

export function evaluateAutomationGhAuthState(input = {}) {
  const simulate = input.simulate === true || isTruthy(process.env.AUTOMATION_GH_AUTH_SIMULATE);
  if (simulate) {
    const simulateOk = !['0', 'false', 'no', 'off'].includes(
      String(process.env.AUTOMATION_GH_AUTH_SIMULATE_OK || '1').trim().toLowerCase(),
    );
    return simulateOk ? buildSuccess() : buildFailure('gh auth simulation forced failure');
  }

  const result = spawnSync('gh', ['auth', 'status', '-h', HOST], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status === 0) return buildSuccess();
  return buildFailure(getFailureMessage(result));
}

function parseArgs(argv) {
  return {
    json: argv.includes('--json'),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = args.json
    ? evaluateAutomationGhAuthState()
    : buildFailure('--json flag is required');

  process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  process.exit(state.ok ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
