#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKEN_NAME = 'POST_MERGE_VERIFY_ATTESTATION_EMITTED';

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
  const out = {
    json: false,
    taskId: '',
    verifyPath: '',
    status: 'pass',
    detail: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    if (arg === '--task' && i + 1 < argv.length) {
      out.taskId = String(argv[i + 1] || '').trim();
      i += 1;
    }
    if (arg === '--verify-path' && i + 1 < argv.length) {
      out.verifyPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
    if (arg === '--status' && i + 1 < argv.length) {
      out.status = String(argv[i + 1] || '').trim().toLowerCase();
      i += 1;
    }
    if (arg === '--detail' && i + 1 < argv.length) {
      out.detail = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }

  return out;
}

export function evaluatePostMergeVerifyAttestationState(input = {}) {
  const taskId = String(input.taskId || '').trim();
  const verifyPath = String(input.verifyPath || '').trim();
  const status = String(input.status || 'pass').trim().toLowerCase();
  const detail = String(input.detail || '').trim();
  const ok = status !== 'fail';

  return {
    ok,
    [TOKEN_NAME]: 1,
    attestationKind: 'POST_MERGE_VERIFY',
    taskId,
    verifyPath,
    verifyOk: ok ? 1 : 0,
    detail: detail || (ok ? 'post_merge_verify_ok' : 'post_merge_verify_fail'),
  };
}

function printHuman(state) {
  console.log(`${TOKEN_NAME}=${state[TOKEN_NAME]}`);
  console.log(`POST_MERGE_VERIFY_ATTESTATION_KIND=${state.attestationKind}`);
  console.log(`POST_MERGE_VERIFY_ATTESTATION_TASK_ID=${state.taskId}`);
  console.log(`POST_MERGE_VERIFY_ATTESTATION_PATH=${state.verifyPath}`);
  console.log(`POST_MERGE_VERIFY_ATTESTATION_OK=${state.verifyOk}`);
  console.log(`POST_MERGE_VERIFY_ATTESTATION_DETAIL=${state.detail}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluatePostMergeVerifyAttestationState({
    taskId: args.taskId,
    verifyPath: args.verifyPath,
    status: args.status,
    detail: args.detail,
  });
  if (args.json) {
    process.stdout.write(`${stableStringify(state)}\n`);
  } else {
    printHuman(state);
  }
  process.exit(0);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
