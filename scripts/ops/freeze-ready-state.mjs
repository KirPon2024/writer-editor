#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BASELINE_REQUIRED_TOKENS,
  FREEZE_MODE_CONDITIONAL_TOKENS,
  evaluateFreezeReady,
  getFreezeReadyRequiredTokens,
} from './freeze-ready-evaluator.mjs';

const TOOL_VERSION = 'freeze-ready-state.v1';

function parseArgs(argv) {
  const out = { json: false };
  for (const arg of argv) {
    if (arg === '--json') out.json = true;
  }
  return out;
}

function runJsonScript(scriptPath) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'freeze-ready-state-'));
  const outPath = path.join(tmpDir, 'out.json');
  const outFd = fs.openSync(outPath, 'w');
  let result = null;
  try {
    result = spawnSync(process.execPath, [scriptPath, '--json'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        NO_COLOR: '1',
        TOKEN_DECLARATION_SKIP_EMISSION_CHECK: '1',
      },
      stdio: ['ignore', outFd, 'pipe'],
    });
  } finally {
    fs.closeSync(outFd);
  }

  try {
    if (!result || result.status !== 0) {
      return {
        ok: false,
        code: 'E_FREEZE_READY_SOURCE_EXEC_FAILED',
        payload: null,
      };
    }
    const stdout = fs.readFileSync(outPath, 'utf8');
    const payload = JSON.parse(String(stdout || '{}'));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return {
        ok: false,
        code: 'E_FREEZE_READY_SOURCE_JSON_INVALID',
        payload: null,
      };
    }
    return {
      ok: true,
      code: '',
      payload,
    };
  } catch {
    return {
      ok: false,
      code: 'E_FREEZE_READY_SOURCE_JSON_INVALID',
      payload: null,
    };
  } finally {
    try {
      fs.unlinkSync(outPath);
    } catch {
      // no-op
    }
    try {
      fs.rmdirSync(tmpDir);
    } catch {
      // no-op
    }
  }
}

function hashRuleset() {
  const normalized = JSON.stringify({
    schemaVersion: 'freeze-ready-rules.v1',
    requiredAlways: [...BASELINE_REQUIRED_TOKENS].sort(),
    requiredFreezeMode: [...FREEZE_MODE_CONDITIONAL_TOKENS].sort(),
    requiredTokens: getFreezeReadyRequiredTokens(),
  });
  return createHash('sha256').update(normalized).digest('hex');
}

export function evaluateFreezeReadyState(input = {}) {
  const freezeMode = String(input.freezeMode || process.env.FREEZE_MODE || '').trim() === '1' ? 1 : 0;
  const rollups = input.rollupsJson ? { ok: true, code: '', payload: input.rollupsJson } : runJsonScript('scripts/ops/freeze-rollups-state.mjs');
  const truthTable = input.truthTableJson ? { ok: true, code: '', payload: input.truthTableJson } : runJsonScript('scripts/ops/extract-truth-table.mjs');

  const requiredTokens = getFreezeReadyRequiredTokens();
  if (!rollups.ok || !truthTable.ok) {
    const failures = [rollups.code, truthTable.code].filter(Boolean).sort();
    return {
      ok: false,
      freezeMode,
      missingTokens: [],
      failures,
      requiredTokens,
      fileSha256: hashRuleset(),
      toolVersion: TOOL_VERSION,
    };
  }

  const evaluated = evaluateFreezeReady({
    freezeMode,
    rollupsJson: rollups.payload,
    truthTableJson: truthTable.payload,
  });

  return {
    ok: evaluated.ok,
    freezeMode,
    missingTokens: [...new Set(evaluated.missingTokens)].sort(),
    failures: [...new Set(evaluated.failures)].sort(),
    requiredTokens,
    fileSha256: hashRuleset(),
    toolVersion: TOOL_VERSION,
  };
}

function main() {
  parseArgs(process.argv.slice(2));
  const state = evaluateFreezeReadyState();
  process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  process.exit(0);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
