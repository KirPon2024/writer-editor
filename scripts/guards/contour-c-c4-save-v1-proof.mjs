#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fileManager = require('../../src/utils/fileManager');

const STEP_ID = 'SAVE_V1_MIN';
const SCENARIO_ID = 'SAVE_V1_ATOMIC_OVERWRITE';

async function runScenario() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'craftsman-c4-save-'));
  const filePath = path.join(tempDir, 'scene', 'draft.txt');

  try {
    const first = await fileManager.writeFileAtomic(filePath, 'alpha');
    if (!first || first.success !== true) {
      return { ok: false, reason: 'FIRST_WRITE_FAIL' };
    }
    const firstRead = await fs.readFile(filePath, 'utf8');
    if (firstRead !== 'alpha') {
      return { ok: false, reason: 'FIRST_WRITE_CONTENT_MISMATCH' };
    }

    const second = await fileManager.writeFile(filePath, 'beta');
    if (!second || second.success !== true) {
      return { ok: false, reason: 'SECOND_WRITE_FAIL' };
    }
    const secondRead = await fs.readFile(filePath, 'utf8');
    if (secondRead !== 'beta') {
      return { ok: false, reason: 'SECOND_WRITE_CONTENT_MISMATCH' };
    }

    return { ok: true, reason: 'OK' };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function main() {
  const result = await runScenario();
  process.stdout.write(`STEP_ID=${STEP_ID}\n`);
  process.stdout.write(`SCENARIO_ID=${SCENARIO_ID}\n`);
  process.stdout.write(`RESULT=${result.ok ? 'PASS' : 'FAIL'}\n`);
  process.stdout.write(`REASON=${result.reason}\n`);
  process.exit(result.ok ? 0 : 1);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(`STEP_ID=${STEP_ID}\n`);
  process.stdout.write(`SCENARIO_ID=${SCENARIO_ID}\n`);
  process.stdout.write('RESULT=FAIL\n');
  process.stdout.write(`REASON=UNHANDLED:${message}\n`);
  process.exit(1);
});
