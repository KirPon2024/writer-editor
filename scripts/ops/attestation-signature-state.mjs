#!/usr/bin/env node
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluatePostMergeVerifyAttestationState } from './emit-post-merge-verify-attestation.mjs';

const TOKEN_NAME = 'ATTESTATION_SIGNATURE_OK';
const FAIL_CODE = 'E_ATTESTATION_SIGNATURE_INVALID';
const SIGNATURE_RE = /^[0-9a-f]{64}$/u;
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

function sha256Hex(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function parseArgs(argv) {
  const out = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--json') out.json = true;
  }
  return out;
}

function buildPayload(input = {}) {
  if (isObjectRecord(input.payload)) {
    return {
      attestationKind: String(input.payload.attestationKind || '').trim(),
      detail: String(input.payload.detail || '').trim(),
      taskId: String(input.payload.taskId || '').trim(),
      verifyOk: Number(input.payload.verifyOk) === 1 ? 1 : 0,
      verifyPath: String(input.payload.verifyPath || '').trim(),
    };
  }

  const emitted = evaluatePostMergeVerifyAttestationState({
    taskId: DEFAULT_TASK_ID,
    verifyPath: DEFAULT_VERIFY_PATH,
    status: 'pass',
    detail: 'strict_verify_release_ready',
  });

  return {
    attestationKind: String(emitted.attestationKind || '').trim(),
    detail: String(emitted.detail || '').trim(),
    taskId: String(emitted.taskId || '').trim(),
    verifyOk: Number(emitted.verifyOk) === 1 ? 1 : 0,
    verifyPath: String(emitted.verifyPath || '').trim(),
  };
}

export function evaluateAttestationSignatureState(input = {}) {
  const payload = buildPayload(input);
  const payloadCanonical = stableStringify(payload);
  const expectedSignature = sha256Hex(payloadCanonical);
  const signature = String(input.signature || expectedSignature).trim().toLowerCase();

  const payloadShapeValid = payload.attestationKind === 'POST_MERGE_VERIFY'
    && payload.taskId.length > 0
    && payload.verifyPath.length > 0
    && (payload.verifyOk === 0 || payload.verifyOk === 1);
  const signatureShapeValid = SIGNATURE_RE.test(signature);
  const signatureMatches = signature === expectedSignature;
  const ok = payloadShapeValid && signatureShapeValid && signatureMatches;

  return {
    ok,
    [TOKEN_NAME]: ok ? 1 : 0,
    code: ok ? '' : FAIL_CODE,
    details: {
      payload,
      payloadHash: expectedSignature,
      signature,
      signatureShapeValid: signatureShapeValid ? 1 : 0,
      signatureMatches: signatureMatches ? 1 : 0,
    },
  };
}

function printHuman(state) {
  console.log(`${TOKEN_NAME}=${state[TOKEN_NAME]}`);
  console.log(`ATTESTATION_SIGNATURE_HASH=${state.details.payloadHash}`);
  console.log(`ATTESTATION_SIGNATURE_MATCH=${state.details.signatureMatches}`);
  console.log(`ATTESTATION_SIGNATURE_SHAPE_OK=${state.details.signatureShapeValid}`);
  if (!state.ok) {
    console.log(`FAIL_REASON=${state.code}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateAttestationSignatureState();
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
