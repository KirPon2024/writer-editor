#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const APPROVALS_PATH = 'docs/OPS/R24/CORRECTIVE/C1B_GOVERNANCE_CHANGE_APPROVALS_V1.json';
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npmExecutable, ['test'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    GOVERNANCE_CHANGE_APPROVALS_PATH: APPROVALS_PATH,
  },
  stdio: 'inherit',
});

if (result.error) {
  process.stderr.write(`E_C1B_BASELINE_SPAWN: ${result.error.message}\n`);
  process.exitCode = 1;
} else {
  process.exitCode = Number.isInteger(result.status) ? result.status : 1;
}
