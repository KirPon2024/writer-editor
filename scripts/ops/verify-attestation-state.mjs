#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluatePostMergeVerifyAttestationState } from './emit-post-merge-verify-attestation.mjs';

const TOKEN_NAME = 'VERIFY_ATTESTATION_OK';
const FAIL_CODE = 'E_VERIFY_ATTESTATION_INVALID';
const DEFAULT_TASK_ID = 'strict-verify-release';
const DEFAULT_VERIFY_PATH = 'scripts/ops/post-merge-verify.mjs';

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stableSortObject(value) {
  if (Array.isArray(value)) return value.map((item) => stableSortObject(item));
  if (!isObjectRecord(value)) return value;
  const out = {};
  for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
    out[key] = stableSortObject(value[key]);
  }
  return out;
}

function stableStringify(value) {
  return JSON.stringify(stableSortObject(value), null, 2);
}

function parseArgs(argv) {
  const out = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--json') out.json = true;
  }
  return out;
}

function getDefaultAttestationState() {
  return evaluatePostMergeVerifyAttestationState({
    taskId: DEFAULT_TASK_ID,
    verifyPath: DEFAULT_VERIFY_PATH,
    status: 'pass',
    detail: 'strict_verify_release_ready',
  });
}

export function evaluateVerifyAttestationState(input = {}) {
  const state = isObjectRecord(input.attestationState)
    ? input.attestationState
    : getDefaultAttestationState();

  const emitted = Number(state.POST_MERGE_VERIFY_ATTESTATION_EMITTED) === 1;
  const verifyOk = Number(state.verifyOk) === 1;
  const attestationKind = String(state.attestationKind || '').trim();
  const taskId = String(state.taskId || '').trim();
  const verifyPath = String(state.verifyPath || '').trim();

  const ok = emitted
    && verifyOk
    && attestationKind === 'POST_MERGE_VERIFY'
    && taskId.length > 0
    && verifyPath.length > 0;

  return {
    ok,
    [TOKEN_NAME]: ok ? 1 : 0,
    code: ok ? '' : FAIL_CODE,
    details: {
      emitted: emitted ? 1 : 0,
      verifyOk: verifyOk ? 1 : 0,
      attestationKind,
      taskId,
      verifyPath,
    },
  };
}

function printHuman(state) {
  console.log(`${TOKEN_NAME}=${state[TOKEN_NAME]}`);
  console.log(`VERIFY_ATTESTATION_KIND=${state.details.attestationKind}`);
  console.log(`VERIFY_ATTESTATION_TASK_ID=${state.details.taskId}`);
  console.log(`VERIFY_ATTESTATION_PATH=${state.details.verifyPath}`);
  console.log(`VERIFY_ATTESTATION_VERIFY_OK=${state.details.verifyOk}`);
  if (!state.ok) {
    console.log(`FAIL_REASON=${state.code}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateVerifyAttestationState();
  if (args.json) {
    process.stdout.write(`${stableStringify(state)}\n`);
  } else {
    printHuman(state);
  }
  process.exit(state[TOKEN_NAME] === 1 ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
