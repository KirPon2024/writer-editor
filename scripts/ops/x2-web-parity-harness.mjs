#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createCommandRegistry } from '../../src/renderer/commands/registry.mjs';
import { createCommandRunner } from '../../src/renderer/commands/runCommand.mjs';
import { COMMAND_IDS, registerProjectCommands } from '../../src/renderer/commands/projectCommands.mjs';
import { CORE_COMMAND_IDS, applyCoreSequence, createInitialCoreState } from '../../src/core/runtime.mjs';
import { parseMarkdownV1, serializeMarkdownV1 } from '../../src/export/markdown/v1/index.mjs';

const TOKEN_NAME = 'X2_WEB_RUNTIME_PARITY_OK';
const FAIL_CODE = 'E_X2_WEB_PARITY_CONTRACT_INVALID';
const DEFAULT_REPEAT = 5;

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stableSortObject(value) {
  if (Array.isArray(value)) return value.map((entry) => stableSortObject(entry));
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

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function roundMetric(value) {
  return Number(Number(value).toFixed(6));
}

function toPercent(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return roundMetric((numerator / denominator) * 100);
}

function toRoundedMb(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return 0;
  return roundMetric(bytes / (1024 * 1024));
}

function toRepeatCount(inputRepeat) {
  const value = Number.parseInt(String(inputRepeat ?? DEFAULT_REPEAT), 10);
  if (!Number.isInteger(value) || value < 1) return DEFAULT_REPEAT;
  return value;
}

function normalizeNewlines(input) {
  return String(input ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function computeP95(samples) {
  const values = samples
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry) && entry > 0)
    .sort((a, b) => a - b);
  if (values.length === 0) return 0;
  const index = Math.max(0, Math.ceil(values.length * 0.95) - 1);
  return roundMetric(values[index]);
}

function normalizeSceneModel(scene) {
  if (!isObjectRecord(scene) || !Array.isArray(scene.blocks)) return null;
  return {
    kind: String(scene.kind || 'scene.v1'),
    blocks: cloneJson(scene.blocks),
  };
}

function sceneFingerprint(scene) {
  const normalized = normalizeSceneModel(scene);
  if (!normalized) return null;
  return sha256Buffer(Buffer.from(stableStringify(normalized), 'utf8'));
}

function parseMarkdownSafe(markdown, limits = {}) {
  const scene = parseMarkdownV1(String(markdown ?? ''), { limits });
  const normalized = normalizeSceneModel(scene);
  if (!normalized) {
    throw new Error('PARSED_SCENE_INVALID');
  }
  return normalized;
}

function makeBehaviorMarkdown() {
  const nfc = 'Cafe\u0301'.normalize('NFC');
  const nfd = 'Cafe\u0301'.normalize('NFD');
  return [
    '# X2 Web Runtime Parity Fixture',
    '',
    `NFC sample: ${nfc}`,
    `NFD sample: ${nfd}`,
    'Line endings sample follows:',
    'line-lf',
    'line-crlf\r\nline-mixed\nline-tail\rline-end',
  ].join('\n');
}

function readProjectSnapshot(projectPath) {
  if (!fs.existsSync(projectPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
    if (!isObjectRecord(parsed)) return null;
    const scene = normalizeSceneModel(parsed.scene);
    if (!scene) return null;
    return {
      schemaVersion: String(parsed.schemaVersion || ''),
      scene,
    };
  } catch {
    return null;
  }
}

function createProjectRuntime(projectPath, initialScene, limits) {
  const state = {
    scene: normalizeSceneModel(initialScene),
    projectPath,
  };

  const electronAPI = {
    openFile() {
      if (fs.existsSync(state.projectPath)) {
        const raw = fs.readFileSync(state.projectPath, 'utf8');
        const parsed = JSON.parse(raw);
        const scene = normalizeSceneModel(parsed?.scene);
        if (!scene) {
          const error = new Error('PROJECT_SCENE_INVALID');
          error.code = 'E_X2_WEB_PARITY_PROJECT_SCENE_INVALID';
          throw error;
        }
        state.scene = scene;
        return;
      }

      if (!state.scene) {
        const error = new Error('PROJECT_MISSING_AND_UNSEEDED');
        error.code = 'E_X2_WEB_PARITY_PROJECT_MISSING';
        throw error;
      }
    },

    saveFile() {
      if (!state.scene) {
        const error = new Error('PROJECT_SCENE_MISSING');
        error.code = 'E_X2_WEB_PARITY_PROJECT_SCENE_MISSING';
        throw error;
      }
      const payload = {
        schemaVersion: 'v1',
        scene: state.scene,
      };
      fs.writeFileSync(state.projectPath, `${stableStringify(payload)}\n`, 'utf8');
    },

    async importMarkdownV1(payload = {}) {
      try {
        const text = typeof payload.text === 'string'
          ? payload.text
          : (typeof payload.markdown === 'string' ? payload.markdown : '');
        const scene = parseMarkdownV1(text, { limits: payload.limits || limits });
        const normalized = normalizeSceneModel(scene);
        if (!normalized) {
          return {
            ok: 0,
            error: {
              code: 'MDV1_INTERNAL_ERROR',
              op: 'm:cmd:project:import:markdownV1:v1',
              reason: 'IMPORT_MARKDOWN_INVALID_SCENE',
            },
          };
        }
        state.scene = normalized;
        return {
          ok: 1,
          scene: normalized,
          lossReport: isObjectRecord(scene.lossReport)
            ? scene.lossReport
            : { count: 0, items: [] },
        };
      } catch (error) {
        return {
          ok: 0,
          error: {
            code: typeof error?.code === 'string' ? error.code : 'MDV1_INTERNAL_ERROR',
            op: 'm:cmd:project:import:markdownV1:v1',
            reason: typeof error?.reason === 'string' ? error.reason : 'IMPORT_MARKDOWN_FAILED',
            details: isObjectRecord(error?.details) ? error.details : undefined,
          },
        };
      }
    },

    async exportMarkdownV1(payload = {}) {
      try {
        const scene = normalizeSceneModel(payload.scene || state.scene);
        if (!scene) {
          return {
            ok: 0,
            error: {
              code: 'MDV1_INTERNAL_ERROR',
              op: 'm:cmd:project:export:markdownV1:v1',
              reason: 'EXPORT_MARKDOWN_SCENE_REQUIRED',
            },
          };
        }
        const markdown = serializeMarkdownV1(scene);
        const outPath = typeof payload.outPath === 'string' && payload.outPath.trim().length > 0
          ? path.resolve(payload.outPath)
          : '';
        if (outPath) {
          fs.mkdirSync(path.dirname(outPath), { recursive: true });
          fs.writeFileSync(outPath, markdown, 'utf8');
        }
        return {
          ok: 1,
          markdown,
          outPath,
          bytesWritten: Buffer.byteLength(markdown, 'utf8'),
          safetyMode: 'strict',
          snapshotCreated: false,
          lossReport: { count: 0, items: [] },
        };
      } catch (error) {
        return {
          ok: 0,
          error: {
            code: typeof error?.code === 'string' ? error.code : 'MDV1_INTERNAL_ERROR',
            op: 'm:cmd:project:export:markdownV1:v1',
            reason: typeof error?.reason === 'string' ? error.reason : 'EXPORT_MARKDOWN_FAILED',
            details: isObjectRecord(error?.details) ? error.details : undefined,
          },
        };
      }
    },
  };

  const registry = createCommandRegistry();
  registerProjectCommands(registry, { electronAPI });
  const runCommand = createCommandRunner(registry);

  return {
    runCommand,
    setScene(nextScene) {
      state.scene = normalizeSceneModel(nextScene);
    },
    clearScene() {
      state.scene = null;
    },
    getScene() {
      return normalizeSceneModel(state.scene);
    },
  };
}

function addCheck(checks, id, ok, message, code = '') {
  checks.push({
    id,
    status: ok ? 'pass' : 'fail',
    message,
    code: ok ? '' : code,
  });
}

function collectChecksSummary(checks) {
  const passCount = checks.filter((entry) => entry.status === 'pass').length;
  const failCount = checks.filter((entry) => entry.status === 'fail').length;
  const skipCount = checks.filter((entry) => entry.status === 'skip').length;
  return {
    passCount,
    failCount,
    skipCount,
    passPct: toPercent(passCount, passCount + failCount),
  };
}

function buildEditedTextFromCore(baseText, scenarioId) {
  const initialState = createInitialCoreState();
  const projectId = `x2-web-runtime-${scenarioId}`;
  const sequenceResult = applyCoreSequence(initialState, [
    {
      type: CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: {
        projectId,
        title: `X2 ${scenarioId}`,
        sceneId: 'scene-1',
      },
    },
    {
      type: CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: {
        projectId,
        sceneId: 'scene-1',
        text: `${normalizeNewlines(baseText).trimEnd()}\n\nWeb parity deterministic edit (${scenarioId}).`,
      },
    },
  ]);

  if (!sequenceResult.ok) {
    const error = new Error(`CORE_EDIT_FAILED:${sequenceResult.error?.code || 'UNKNOWN'}`);
    error.code = 'E_X2_WEB_PARITY_CORE_EDIT_FAILED';
    throw error;
  }

  return String(sequenceResult.state?.data?.projects?.[projectId]?.scenes?.['scene-1']?.text || '');
}

function measureStart() {
  return process.hrtime.bigint();
}

function measureElapsedMs(start) {
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  return Math.max(0.001, roundMetric(elapsedMs));
}

async function executeBehaviorRun(input) {
  const { runDir, scenarioId, initialMarkdown } = input;
  const checks = [];
  const metrics = {
    openMs: 0,
    saveMs: 0,
    reopenMs: 0,
    exportMs: 0,
  };
  const projectPath = path.join(runDir, `${scenarioId}.project.json`);
  const exportPath = path.join(runDir, `${scenarioId}.export.md`);
  let maxDocSizeMb = 0;

  try {
    const initialScene = parseMarkdownSafe(initialMarkdown, {});
    const runtime = createProjectRuntime(projectPath, initialScene, {});

    let started = measureStart();
    const openResult = await runtime.runCommand(COMMAND_IDS.PROJECT_OPEN, {});
    metrics.openMs = measureElapsedMs(started);
    addCheck(
      checks,
      `${scenarioId}.open`,
      Boolean(openResult?.ok),
      'Open command executed.',
      'E_X2_WEB_PARITY_OPEN_FAILED',
    );
    if (!openResult?.ok) return { checks, metrics, maxDocSizeMb };

    const editedMarkdown = buildEditedTextFromCore(initialMarkdown, scenarioId);
    const editedScene = parseMarkdownSafe(editedMarkdown, {});
    runtime.setScene(editedScene);
    addCheck(
      checks,
      `${scenarioId}.edit`,
      true,
      'Edit path applied deterministic mutation.',
      'E_X2_WEB_PARITY_EDIT_FAILED',
    );

    started = measureStart();
    const saveResult = await runtime.runCommand(COMMAND_IDS.PROJECT_SAVE, {});
    metrics.saveMs = measureElapsedMs(started);
    addCheck(
      checks,
      `${scenarioId}.save`,
      Boolean(saveResult?.ok),
      'Save command persisted runtime state.',
      'E_X2_WEB_PARITY_SAVE_FAILED',
    );
    if (!saveResult?.ok) return { checks, metrics, maxDocSizeMb };

    const savedSnapshot = readProjectSnapshot(projectPath);
    const recoverySmokeOk = Boolean(savedSnapshot)
      && savedSnapshot.schemaVersion === 'v1'
      && isObjectRecord(savedSnapshot.scene);
    addCheck(
      checks,
      `${scenarioId}.recovery-smoke`,
      recoverySmokeOk,
      'Recovery smoke validated readable on-disk snapshot.',
      'E_X2_WEB_PARITY_RECOVERY_SMOKE_FAILED',
    );

    if (fs.existsSync(projectPath)) {
      maxDocSizeMb = Math.max(maxDocSizeMb, toRoundedMb(fs.statSync(projectPath).size));
    }

    runtime.clearScene();
    started = measureStart();
    const reopenResult = await runtime.runCommand(COMMAND_IDS.PROJECT_OPEN, {});
    metrics.reopenMs = measureElapsedMs(started);
    addCheck(
      checks,
      `${scenarioId}.reopen`,
      Boolean(reopenResult?.ok),
      'Reopen command loaded persisted state.',
      'E_X2_WEB_PARITY_REOPEN_FAILED',
    );
    if (!reopenResult?.ok) return { checks, metrics, maxDocSizeMb };

    started = measureStart();
    const reopenScene = runtime.getScene();
    const exportResult = await runtime.runCommand(COMMAND_IDS.PROJECT_EXPORT_MARKDOWN_V1, {
      scene: reopenScene,
      outPath: exportPath,
      safetyMode: 'strict',
    });
    metrics.exportMs = measureElapsedMs(started);
    addCheck(
      checks,
      `${scenarioId}.export`,
      Boolean(exportResult?.ok),
      'Export command produced markdown.',
      'E_X2_WEB_PARITY_EXPORT_FAILED',
    );
    if (!exportResult?.ok) return { checks, metrics, maxDocSizeMb };

    const exportedMarkdown = String(exportResult?.value?.markdown || '');
    maxDocSizeMb = Math.max(maxDocSizeMb, toRoundedMb(Buffer.byteLength(exportedMarkdown, 'utf8')));
    if (exportResult?.value?.outPath && fs.existsSync(exportResult.value.outPath)) {
      maxDocSizeMb = Math.max(maxDocSizeMb, toRoundedMb(fs.statSync(exportResult.value.outPath).size));
    }

    const importResult = await runtime.runCommand(COMMAND_IDS.PROJECT_IMPORT_MARKDOWN_V1, {
      markdown: exportedMarkdown,
      sourceName: `${scenarioId}.export.md`,
      sourcePath: exportPath,
    });
    addCheck(
      checks,
      `${scenarioId}.import`,
      Boolean(importResult?.ok),
      'Import command parsed exported markdown.',
      'E_X2_WEB_PARITY_IMPORT_FAILED',
    );
    if (!importResult?.ok) return { checks, metrics, maxDocSizeMb };

    const importedScene = normalizeSceneModel(importResult.value?.scene);
    const diffOk = Boolean(importedScene) && sceneFingerprint(importedScene) === sceneFingerprint(reopenScene);
    addCheck(
      checks,
      `${scenarioId}.diff`,
      diffOk,
      'Diff invariant preserved through export/import.',
      'E_X2_WEB_PARITY_DIFF_FAILED',
    );
  } catch (error) {
    addCheck(
      checks,
      `${scenarioId}.exception`,
      false,
      error instanceof Error ? error.message : String(error),
      typeof error?.code === 'string' ? error.code : 'E_X2_WEB_PARITY_SCENARIO_EXCEPTION',
    );
  }

  return {
    checks,
    metrics,
    maxDocSizeMb,
  };
}

function resolveRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
}

function resolveWorkRoot(repoRoot, inputWorkDir) {
  const candidate = typeof inputWorkDir === 'string' ? inputWorkDir.trim() : '';
  if (!candidate) {
    return {
      path: path.join(repoRoot, '.tmp', 'ops', 'x2-web-parity'),
      external: false,
    };
  }

  return {
    path: path.isAbsolute(candidate) ? candidate : path.resolve(repoRoot, candidate),
    external: true,
  };
}

export async function runX2WebParityHarness(input = {}) {
  const startedAt = Date.now();
  const repoRoot = resolveRepoRoot();
  const repeatN = toRepeatCount(input.repeat);
  const workRoot = resolveWorkRoot(repoRoot, input.workDir);
  const sessionRoot = path.join(workRoot.path, `session-${process.pid}-${Date.now()}`);
  const shouldCleanup = input.cleanup !== false;
  const runs = [];

  for (let runIndex = 0; runIndex < repeatN; runIndex += 1) {
    const runId = runIndex + 1;
    const runDir = path.join(sessionRoot, `run-${runId}`);

    fs.rmSync(runDir, { recursive: true, force: true });
    fs.mkdirSync(runDir, { recursive: true });

    const summary = await executeBehaviorRun({
      runDir,
      scenarioId: 'web-runtime',
      initialMarkdown: makeBehaviorMarkdown(),
    });
    const counts = collectChecksSummary(summary.checks);
    runs.push({
      runId,
      checks: summary.checks,
      checksDigest: sha256Buffer(Buffer.from(stableStringify(summary.checks), 'utf8')),
      passCount: counts.passCount,
      failCount: counts.failCount,
      skipCount: counts.skipCount,
      passPct: counts.passPct,
      metrics: summary.metrics,
      maxDocSizeMbVerified: summary.maxDocSizeMb,
    });
  }

  const totalPasses = runs.reduce((sum, run) => sum + run.passCount, 0);
  const totalFails = runs.reduce((sum, run) => sum + run.failCount, 0);
  const passPct = toPercent(totalPasses, totalPasses + totalFails);
  const maxDocSizeMbVerified = runs.reduce((max, run) => Math.max(max, run.maxDocSizeMbVerified || 0), 0);

  let flakyRatePct = 0;
  if (repeatN > 1) {
    const baselineDigest = runs[0]?.checksDigest || '';
    const divergentRuns = runs.slice(1).filter((run) => run.checksDigest !== baselineDigest).length;
    flakyRatePct = toPercent(divergentRuns, repeatN - 1);
  }

  const openP95Ms = computeP95(runs.map((run) => run.metrics?.openMs));
  const saveP95Ms = computeP95(runs.map((run) => run.metrics?.saveMs));
  const reopenP95Ms = computeP95(runs.map((run) => run.metrics?.reopenMs));
  const exportP95Ms = computeP95(runs.map((run) => run.metrics?.exportMs));

  const errors = [];
  for (const run of runs) {
    for (const check of run.checks) {
      if (check.status !== 'fail') continue;
      errors.push({
        runId: run.runId,
        id: check.id,
        code: check.code || 'E_X2_WEB_PARITY_CHECK_FAILED',
        message: check.message || 'X2 web parity check failed.',
      });
    }
  }

  const ok = errors.length === 0 && passPct === 100;
  const durationMs = Date.now() - startedAt;
  const report = {
    [TOKEN_NAME]: ok ? 1 : 0,
    reportVersion: 'x2-web-runtime-parity.v1',
    scenario: 'open->edit->save->reopen->export->import->diff->recovery-smoke',
    platform: process.platform,
    repeatN,
    runs,
    passes: totalPasses,
    fails: totalFails,
    passPct,
    flakyRatePct,
    openP95Ms,
    saveP95Ms,
    reopenP95Ms,
    exportP95Ms,
    maxDocSizeMbVerified: roundMetric(maxDocSizeMbVerified),
    durationMs,
    failSignalCode: ok ? '' : FAIL_CODE,
    failSignal: ok
      ? null
      : {
          code: FAIL_CODE,
          details: {
            errors,
          },
        },
    errors,
  };

  if (shouldCleanup) {
    try {
      fs.rmSync(sessionRoot, { recursive: true, force: true });
    } catch {}
    if (!workRoot.external) {
      const pruneTargets = [
        workRoot.path,
        path.dirname(workRoot.path),
        path.dirname(path.dirname(workRoot.path)),
      ];
      for (const target of pruneTargets) {
        try {
          fs.rmdirSync(target);
        } catch {}
      }
    }
  }

  return report;
}

function parseArgs(argv) {
  const out = {
    json: false,
    workDir: '',
    repeat: DEFAULT_REPEAT,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      out.json = true;
      continue;
    }
    if (arg.startsWith('--work-dir=')) {
      out.workDir = String(arg.slice('--work-dir='.length) || '').trim();
      continue;
    }
    if (arg === '--work-dir' && i + 1 < argv.length) {
      out.workDir = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (arg.startsWith('--repeat=')) {
      out.repeat = toRepeatCount(arg.slice('--repeat='.length));
      continue;
    }
    if (arg === '--repeat' && i + 1 < argv.length) {
      out.repeat = toRepeatCount(argv[i + 1]);
      i += 1;
    }
  }

  return out;
}

function printHuman(state) {
  console.log(`${TOKEN_NAME}=${state[TOKEN_NAME]}`);
  console.log(`X2_WEB_PARITY_PASS_PCT=${state.passPct}`);
  console.log(`X2_WEB_PARITY_FLAKY_RATE_PCT=${state.flakyRatePct}`);
  console.log(`X2_WEB_PARITY_OPEN_P95_MS=${state.openP95Ms}`);
  console.log(`X2_WEB_PARITY_SAVE_P95_MS=${state.saveP95Ms}`);
  console.log(`X2_WEB_PARITY_REOPEN_P95_MS=${state.reopenP95Ms}`);
  console.log(`X2_WEB_PARITY_EXPORT_P95_MS=${state.exportP95Ms}`);
  if (state.failSignalCode) {
    console.log(`FAIL_REASON=${state.failSignalCode}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = await runX2WebParityHarness({
    workDir: args.workDir || undefined,
    repeat: args.repeat,
  });

  if (args.json) {
    process.stdout.write(`${stableStringify(state)}\n`);
  } else {
    printHuman(state);
  }

  if (state.passPct === 100) {
    process.exit(0);
  }
  process.exit(1);
}

if (process.argv[1]) {
  const entrypointPath = path.resolve(process.argv[1]);
  if (fileURLToPath(import.meta.url) === entrypointPath) {
    main().catch((error) => {
      const message = error instanceof Error ? error.stack || error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exit(1);
    });
  }
}
