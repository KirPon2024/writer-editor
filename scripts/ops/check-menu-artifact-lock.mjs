#!/usr/bin/env node
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  evaluateMenuArtifactLockState,
} = require('../../src/menu/menu-artifact-lock.js');

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    json: false,
    mode: '',
    artifactPath: '',
    lockPath: '',
    expectedSnapshotId: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = normalizeString(argv[i]);
    if (!arg) continue;

    if (arg === '--json') {
      out.json = true;
      continue;
    }
    if (arg === '--mode' && i + 1 < argv.length) {
      out.mode = normalizeString(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith('--mode=')) {
      out.mode = normalizeString(arg.slice('--mode='.length));
      continue;
    }
    if (arg === '--artifact' && i + 1 < argv.length) {
      out.artifactPath = normalizeString(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith('--artifact=')) {
      out.artifactPath = normalizeString(arg.slice('--artifact='.length));
      continue;
    }
    if (arg === '--lock' && i + 1 < argv.length) {
      out.lockPath = normalizeString(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith('--lock=')) {
      out.lockPath = normalizeString(arg.slice('--lock='.length));
      continue;
    }
    if (arg === '--snapshot-id' && i + 1 < argv.length) {
      out.expectedSnapshotId = normalizeString(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith('--snapshot-id=')) {
      out.expectedSnapshotId = normalizeString(arg.slice('--snapshot-id='.length));
    }
  }

  return out;
}

function printHuman(state) {
  console.log(`MENU_ARTIFACT_LOCK_CHECK_RESULT=${state.result}`);
  console.log(`MENU_ARTIFACT_LOCK_CHECK_MODE=${state.mode}`);
  console.log(`MENU_ARTIFACT_LOCK_CHECK_OK=${state.ok ? 1 : 0}`);
  console.log(`MENU_ARTIFACT_LOCK_CHECK_MISMATCH=${state.mismatch ? 1 : 0}`);
  console.log(`MENU_ARTIFACT_LOCK_CHECK_EXPECTED_HASH=${state.expectedHash || ''}`);
  console.log(`MENU_ARTIFACT_LOCK_CHECK_ACTUAL_HASH=${state.actualHash || ''}`);
  console.log(`MENU_ARTIFACT_LOCK_CHECK_ARTIFACT_BYTES_EXPECTED=${state.expectedArtifactBytesSha256 || ''}`);
  console.log(`MENU_ARTIFACT_LOCK_CHECK_ARTIFACT_BYTES_ACTUAL=${state.actualArtifactBytesSha256 || ''}`);
  if (state.failSignalCode) console.log(`MENU_ARTIFACT_LOCK_CHECK_FAIL_SIGNAL=${state.failSignalCode}`);
  if (Array.isArray(state.issues) && state.issues.length > 0) {
    console.log(`MENU_ARTIFACT_LOCK_CHECK_ISSUES=${JSON.stringify(state.issues)}`);
  }
}

const args = parseArgs(process.argv.slice(2));
const state = evaluateMenuArtifactLockState({
  mode: args.mode,
  artifactPath: args.artifactPath,
  lockPath: args.lockPath,
  expectedSnapshotId: args.expectedSnapshotId,
});

if (args.json) {
  process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
} else {
  printHuman(state);
}

process.exit(Number.isInteger(state.exitCode) ? state.exitCode : (state.ok ? 0 : 1));
