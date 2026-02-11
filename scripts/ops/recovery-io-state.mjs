#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TOOL_VERSION = 'recovery-io-state.v1';

const PROOFS = Object.freeze([
  { token: 'RECOVERY_ATOMIC_WRITE_OK', testPath: 'test/contracts/recovery-atomic-write.contract.test.js' },
  { token: 'RECOVERY_SNAPSHOT_OK', testPath: 'test/contracts/recovery-snapshot-fallback.contract.test.js' },
  { token: 'RECOVERY_CORRUPTION_OK', testPath: 'test/contracts/recovery-corruption.contract.test.js' },
  { token: 'RECOVERY_TYPED_ERRORS_OK', testPath: 'test/contracts/recovery-typed-errors.contract.test.js' },
  { token: 'RECOVERY_REPLAY_OK', testPath: 'test/contracts/recovery-replay.contract.test.js' },
  { token: 'RECOVERY_ACTION_CANON_OK', testPath: 'test/contracts/recovery-action-canon.contract.test.js' },
]);

function runProof(testPath) {
  const resolved = path.resolve(testPath);
  if (!fs.existsSync(resolved)) {
    return {
      status: 1,
      missing: true,
      stdout: '',
      stderr: `missing proof file: ${testPath}`,
      testPath,
    };
  }

  const result = spawnSync(process.execPath, ['--test', resolved], {
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
  });

  return {
    status: typeof result.status === 'number' ? result.status : 1,
    missing: false,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
    testPath,
  };
}

export function evaluateRecoveryIoState() {
  const proofResults = [];
  const state = {
    TOOL_VERSION,
    RECOVERY_ATOMIC_WRITE_OK: 0,
    RECOVERY_SNAPSHOT_OK: 0,
    RECOVERY_CORRUPTION_OK: 0,
    RECOVERY_TYPED_ERRORS_OK: 0,
    RECOVERY_REPLAY_OK: 0,
    RECOVERY_ACTION_CANON_OK: 0,
    RECOVERY_IO_OK: 0,
    failingProofs: [],
    failReason: '',
  };

  for (const proof of PROOFS) {
    const result = runProof(proof.testPath);
    proofResults.push({
      token: proof.token,
      testPath: proof.testPath,
      status: result.status,
      missing: result.missing,
    });
    state[proof.token] = result.status === 0 ? 1 : 0;
    if (result.status !== 0) {
      state.failingProofs.push({
        token: proof.token,
        testPath: proof.testPath,
        status: result.status,
        missing: result.missing,
      });
    }
  }

  state.RECOVERY_IO_OK = state.RECOVERY_ATOMIC_WRITE_OK === 1
    && state.RECOVERY_SNAPSHOT_OK === 1
    && state.RECOVERY_CORRUPTION_OK === 1
    && state.RECOVERY_TYPED_ERRORS_OK === 1
    && state.RECOVERY_REPLAY_OK === 1
    && state.RECOVERY_ACTION_CANON_OK === 1
    ? 1
    : 0;

  if (state.RECOVERY_IO_OK !== 1) {
    state.failReason = 'RECOVERY_IO_PROOF_FAILED';
  }

  state.proofs = proofResults;
  return state;
}

function parseArgs(argv) {
  const out = { json: false };
  for (const arg of argv) {
    if (arg === '--json') out.json = true;
  }
  return out;
}

function printTokens(state) {
  console.log(`RECOVERY_IO_TOOL_VERSION=${state.TOOL_VERSION}`);
  console.log(`RECOVERY_ATOMIC_WRITE_OK=${state.RECOVERY_ATOMIC_WRITE_OK}`);
  console.log(`RECOVERY_SNAPSHOT_OK=${state.RECOVERY_SNAPSHOT_OK}`);
  console.log(`RECOVERY_CORRUPTION_OK=${state.RECOVERY_CORRUPTION_OK}`);
  console.log(`RECOVERY_TYPED_ERRORS_OK=${state.RECOVERY_TYPED_ERRORS_OK}`);
  console.log(`RECOVERY_REPLAY_OK=${state.RECOVERY_REPLAY_OK}`);
  console.log(`RECOVERY_ACTION_CANON_OK=${state.RECOVERY_ACTION_CANON_OK}`);
  console.log(`RECOVERY_IO_OK=${state.RECOVERY_IO_OK}`);
  console.log(`RECOVERY_IO_FAILING_PROOFS=${JSON.stringify(state.failingProofs)}`);
  if (state.failReason) {
    console.log(`FAIL_REASON=${state.failReason}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateRecoveryIoState();
  if (args.json) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  } else {
    printTokens(state);
  }
  process.exit(state.RECOVERY_IO_OK === 1 ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
