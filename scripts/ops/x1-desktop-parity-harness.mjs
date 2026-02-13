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

const TOKEN_NAME = 'X1_DESKTOP_PARITY_RUNTIME_OK';
const FAIL_CODE = 'E_X1_DESKTOP_PARITY_RUNTIME_INVALID';
const BASELINE_PATH = 'docs/OPS/STATUS/XPLAT_PARITY_BASELINE_v3_12.json';
const DEFAULT_REPEAT = 1;
const SUPPORTED_PLATFORMS = new Set(['win', 'linux', 'darwin']);

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

function toPlatformId(nodePlatform) {
  if (nodePlatform === 'win32') return 'win';
  if (nodePlatform === 'linux') return 'linux';
  if (nodePlatform === 'darwin') return 'darwin';
  return 'unsupported';
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

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function sha256FileSync(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function normalizeNewlines(input) {
  return String(input ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
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
    '# X1 Behavioral Parity Fixture',
    '',
    `NFC sample: ${nfc}`,
    `NFD sample: ${nfd}`,
    'Line endings sample follows:',
    'line-lf',
    'line-crlf\r\nline-mixed\nline-tail\rline-end',
  ].join('\n');
}

function makeLargeDocMarkdown(targetMb) {
  const minMb = Number.isFinite(targetMb) && targetMb > 0 ? targetMb : 1;
  const targetBytes = Math.floor(minMb * 1024 * 1024);
  const chunk = 'Large parity smoke block. 0123456789 abcdefghijklmnopqrstuvwxyz\n';
  let text = '# X1 Large Doc Smoke\n\n';
  while (Buffer.byteLength(text, 'utf8') < targetBytes) {
    text += chunk;
  }
  return text;
}

function readBaselineRef(repoRoot, baselinePath) {
  const absolute = path.resolve(repoRoot, baselinePath);
  const raw = fs.readFileSync(absolute);
  const parsed = JSON.parse(raw.toString('utf8'));
  if (!isObjectRecord(parsed)) {
    throw new Error('BASELINE_JSON_INVALID');
  }
  return {
    path: baselinePath,
    sha256: sha256Buffer(raw),
    schemaVersion: String(parsed.schemaVersion || ''),
    stageId: String(parsed.stageId || ''),
    trickyPack: isObjectRecord(parsed.trickyPack) ? parsed.trickyPack : {},
  };
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
          error.code = 'E_X1_PARITY_PROJECT_SCENE_INVALID';
          throw error;
        }
        state.scene = scene;
        return;
      }

      if (!state.scene) {
        const error = new Error('PROJECT_MISSING_AND_UNSEEDED');
        error.code = 'E_X1_PARITY_PROJECT_MISSING';
        throw error;
      }
    },

    saveFile() {
      if (!state.scene) {
        const error = new Error('PROJECT_SCENE_MISSING');
        error.code = 'E_X1_PARITY_PROJECT_SCENE_MISSING';
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

function addSkippedCheck(checks, id, message) {
  checks.push({
    id,
    status: 'skip',
    message,
    code: '',
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
  const projectId = `x1-runtime-${scenarioId}`;
  const sequenceResult = applyCoreSequence(initialState, [
    {
      type: CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: {
        projectId,
        title: `X1 ${scenarioId}`,
        sceneId: 'scene-1',
      },
    },
    {
      type: CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: {
        projectId,
        sceneId: 'scene-1',
        text: `${normalizeNewlines(baseText).trimEnd()}\n\nRuntime parity deterministic edit (${scenarioId}).`,
      },
    },
  ]);

  if (!sequenceResult.ok) {
    const error = new Error(`CORE_EDIT_FAILED:${sequenceResult.error?.code || 'UNKNOWN'}`);
    error.code = 'E_X1_PARITY_CORE_EDIT_FAILED';
    throw error;
  }

  return String(
    sequenceResult.state?.data?.projects?.[projectId]?.scenes?.['scene-1']?.text || '',
  );
}

async function executeBehaviorScenario(input) {
  const {
    runDir,
    scenarioId,
    initialMarkdown,
    limits,
    expectedUnicode,
    expectedLargeDocMb,
  } = input;

  const checks = [];
  const projectPath = path.join(runDir, `${scenarioId}.project.json`);
  const exportPath = path.join(runDir, `${scenarioId}.export.md`);
  let maxDocSizeMb = 0;

  try {
    const initialScene = parseMarkdownSafe(initialMarkdown, limits);
    const runtime = createProjectRuntime(projectPath, initialScene, limits);

    const openResult = await runtime.runCommand(COMMAND_IDS.PROJECT_OPEN, {});
    addCheck(
      checks,
      `${scenarioId}.open`,
      Boolean(openResult?.ok),
      'Open command executed.',
      'E_X1_PARITY_OPEN_FAILED',
    );
    if (!openResult?.ok) return { checks, maxDocSizeMb };

    const editedMarkdown = buildEditedTextFromCore(initialMarkdown, scenarioId);
    const editedScene = parseMarkdownSafe(editedMarkdown, limits);
    runtime.setScene(editedScene);
    addCheck(
      checks,
      `${scenarioId}.edit`,
      true,
      'Core edit command applied deterministic change.',
      'E_X1_PARITY_EDIT_FAILED',
    );

    const saveResult = await runtime.runCommand(COMMAND_IDS.PROJECT_SAVE, {});
    addCheck(
      checks,
      `${scenarioId}.save`,
      Boolean(saveResult?.ok),
      'Save command persisted runtime state.',
      'E_X1_PARITY_SAVE_FAILED',
    );
    if (!saveResult?.ok) return { checks, maxDocSizeMb };

    if (fs.existsSync(projectPath)) {
      maxDocSizeMb = Math.max(maxDocSizeMb, toRoundedMb(fs.statSync(projectPath).size));
    }

    runtime.clearScene();
    const reopenResult = await runtime.runCommand(COMMAND_IDS.PROJECT_OPEN, {});
    addCheck(
      checks,
      `${scenarioId}.reopen`,
      Boolean(reopenResult?.ok),
      'Reopen command loaded persisted state.',
      'E_X1_PARITY_REOPEN_FAILED',
    );
    if (!reopenResult?.ok) return { checks, maxDocSizeMb };

    const reopenedScene = runtime.getScene();
    const exportResult = await runtime.runCommand(COMMAND_IDS.PROJECT_EXPORT_MARKDOWN_V1, {
      scene: reopenedScene,
      outPath: exportPath,
      safetyMode: 'strict',
    });
    addCheck(
      checks,
      `${scenarioId}.export`,
      Boolean(exportResult?.ok),
      'Export command produced markdown.',
      'E_X1_PARITY_EXPORT_FAILED',
    );
    if (!exportResult?.ok) return { checks, maxDocSizeMb };

    const exportedMarkdown = String(exportResult?.value?.markdown || '');
    maxDocSizeMb = Math.max(maxDocSizeMb, toRoundedMb(Buffer.byteLength(exportedMarkdown, 'utf8')));
    if (exportResult?.value?.outPath && fs.existsSync(exportResult.value.outPath)) {
      maxDocSizeMb = Math.max(maxDocSizeMb, toRoundedMb(fs.statSync(exportResult.value.outPath).size));
    }

    const importResult = await runtime.runCommand(COMMAND_IDS.PROJECT_IMPORT_MARKDOWN_V1, {
      markdown: exportedMarkdown,
      sourceName: `${scenarioId}.export.md`,
      sourcePath: exportPath,
      limits,
    });
    addCheck(
      checks,
      `${scenarioId}.import`,
      Boolean(importResult?.ok),
      'Import command parsed exported markdown.',
      'E_X1_PARITY_IMPORT_FAILED',
    );
    if (!importResult?.ok) return { checks, maxDocSizeMb };

    const importedScene = normalizeSceneModel(importResult.value?.scene);
    const diffOk = Boolean(importedScene)
      && sceneFingerprint(importedScene) === sceneFingerprint(reopenedScene);
    addCheck(
      checks,
      `${scenarioId}.diff`,
      diffOk,
      'Diff invariant preserved through export/import.',
      'E_X1_PARITY_DIFF_FAILED',
    );

    const newlineOk = !/\r/.test(exportedMarkdown);
    addCheck(
      checks,
      `${scenarioId}.newlines`,
      newlineOk,
      'Newline normalization remains LF-only after roundtrip.',
      'E_X1_PARITY_NEWLINE_INVARIANT_FAILED',
    );

    if (expectedUnicode) {
      const unicodeOk = exportedMarkdown.includes(expectedUnicode.nfc)
        && exportedMarkdown.includes(expectedUnicode.nfd);
      addCheck(
        checks,
        `${scenarioId}.unicode`,
        unicodeOk,
        'Unicode NFC/NFD variants survive roundtrip.',
        'E_X1_PARITY_UNICODE_INVARIANT_FAILED',
      );
    }

    if (Number.isFinite(expectedLargeDocMb) && expectedLargeDocMb > 0) {
      const largeDocOk = maxDocSizeMb >= expectedLargeDocMb;
      addCheck(
        checks,
        `${scenarioId}.largeDocSmoke`,
        largeDocOk,
        `Large-doc smoke reached at least ${expectedLargeDocMb} MB.`,
        'E_X1_PARITY_LARGE_DOC_SMOKE_FAILED',
      );
    }
  } catch (error) {
    addCheck(
      checks,
      `${scenarioId}.exception`,
      false,
      error instanceof Error ? error.message : String(error),
      typeof error?.code === 'string' ? error.code : 'E_X1_PARITY_SCENARIO_EXCEPTION',
    );
  }

  return {
    checks,
    maxDocSizeMb,
  };
}

function executeWindowsReservedNameCheck(runDir, checks, policyValue) {
  if (policyValue !== 'reject') {
    addCheck(
      checks,
      'platform.win.reservedNamesPolicy',
      false,
      'Baseline win reserved names policy is missing/invalid.',
      'E_X1_PARITY_WIN_POLICY_INVALID',
    );
    return;
  }

  const target = path.join(runDir, 'CON.txt');
  try {
    fs.writeFileSync(target, 'reserved-name-probe', 'utf8');
    addCheck(
      checks,
      'platform.win.reservedNames',
      false,
      'Reserved name write unexpectedly succeeded on win policy probe.',
      'E_X1_PARITY_WIN_RESERVED_NAME_POLICY_FAILED',
    );
  } catch {
    addCheck(
      checks,
      'platform.win.reservedNames',
      true,
      'Reserved name rejected as expected by baseline policy.',
      'E_X1_PARITY_WIN_RESERVED_NAME_POLICY_FAILED',
    );
  }
}

function executeLinuxCaseCollisionCheck(runDir, checks, policyValue) {
  if (policyValue !== 'distinct_paths_required') {
    addCheck(
      checks,
      'platform.linux.caseCollisionPolicy',
      false,
      'Baseline linux case collision policy is missing/invalid.',
      'E_X1_PARITY_LINUX_POLICY_INVALID',
    );
    return;
  }

  const lowerPath = path.join(runDir, 'scene.md');
  const upperPath = path.join(runDir, 'SCENE.md');
  fs.writeFileSync(lowerPath, 'lower-case-content', 'utf8');
  fs.writeFileSync(upperPath, 'upper-case-content', 'utf8');

  const lowerExists = fs.existsSync(lowerPath);
  const upperExists = fs.existsSync(upperPath);
  const distinctContent = lowerExists && upperExists
    ? fs.readFileSync(lowerPath, 'utf8') !== fs.readFileSync(upperPath, 'utf8')
    : false;

  addCheck(
    checks,
    'platform.linux.caseCollision',
    lowerExists && upperExists && distinctContent,
    'Case-collision policy validated for linux baseline expectation.',
    'E_X1_PARITY_LINUX_CASE_COLLISION_POLICY_FAILED',
  );
}

function resolveRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
}

function resolveWorkRoot(repoRoot, inputWorkDir) {
  const candidate = typeof inputWorkDir === 'string' ? inputWorkDir.trim() : '';
  if (!candidate) {
    return {
      path: path.join(repoRoot, '.tmp', 'ops', 'x1-parity'),
      external: false,
    };
  }

  return {
    path: path.isAbsolute(candidate) ? candidate : path.resolve(repoRoot, candidate),
    external: true,
  };
}

function parseLargeDocTargetMb(trickyPack) {
  const raw = Number(trickyPack?.largeDocSmokeMinMb);
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  return roundMetric(raw);
}

export async function runX1DesktopParityHarness(input = {}) {
  const startedAt = Date.now();
  const repoRoot = resolveRepoRoot();
  const platform = toPlatformId(process.platform);
  const repeatN = toRepeatCount(input.repeat);
  const workRoot = resolveWorkRoot(repoRoot, input.workDir);
  const sessionRoot = path.join(workRoot.path, `session-${process.pid}-${Date.now()}`);
  const shouldCleanup = input.cleanup !== false;

  const hardFailures = [];
  const runs = [];
  let baselineVersionRef = null;

  try {
    baselineVersionRef = readBaselineRef(repoRoot, BASELINE_PATH);
  } catch (error) {
    hardFailures.push({
      code: 'E_X1_PARITY_BASELINE_UNREADABLE',
      message: error instanceof Error ? error.message : String(error),
      path: BASELINE_PATH,
    });
  }

  const trickyPack = baselineVersionRef?.trickyPack || {};
  const largeDocTargetMb = parseLargeDocTargetMb(trickyPack);
  const winReservedPolicy = String(trickyPack?.platformPolicies?.win?.reservedNames || '').trim();
  const linuxCasePolicy = String(trickyPack?.platformPolicies?.linux?.caseCollisions || '').trim();

  for (let runIndex = 0; runIndex < repeatN; runIndex += 1) {
    const runId = runIndex + 1;
    const runDir = path.join(sessionRoot, `run-${runId}`);
    const checks = [];
    let runMaxDocSizeMb = 0;

    try {
      fs.rmSync(runDir, { recursive: true, force: true });
      fs.mkdirSync(runDir, { recursive: true });

      const unicodeText = makeBehaviorMarkdown();
      const unicodeNfc = 'Cafe\u0301'.normalize('NFC');
      const unicodeNfd = 'Cafe\u0301'.normalize('NFD');
      const behavioral = await executeBehaviorScenario({
        runDir,
        scenarioId: 'user-path',
        initialMarkdown: unicodeText,
        limits: {},
        expectedUnicode: { nfc: unicodeNfc, nfd: unicodeNfd },
      });
      checks.push(...behavioral.checks);
      runMaxDocSizeMb = Math.max(runMaxDocSizeMb, behavioral.maxDocSizeMb);

      const largeDocScenario = await executeBehaviorScenario({
        runDir,
        scenarioId: 'large-doc',
        initialMarkdown: makeLargeDocMarkdown(largeDocTargetMb),
        limits: {
          maxInputBytes: Math.ceil((largeDocTargetMb + 1) * 1024 * 1024),
          maxNodes: 25000,
          maxMillis: 1500,
        },
        expectedLargeDocMb: largeDocTargetMb,
      });
      checks.push(...largeDocScenario.checks);
      runMaxDocSizeMb = Math.max(runMaxDocSizeMb, largeDocScenario.maxDocSizeMb);

      if (platform === 'win') {
        executeWindowsReservedNameCheck(runDir, checks, winReservedPolicy);
      } else if (platform === 'linux') {
        executeLinuxCaseCollisionCheck(runDir, checks, linuxCasePolicy);
      } else if (platform === 'darwin') {
        addSkippedCheck(
          checks,
          'platform.darwin.winLinuxPolicy',
          'Win/Linux-only path policy checks are advisory-skipped on darwin.',
        );
      } else {
        addCheck(
          checks,
          'platform.unsupported',
          false,
          `Unsupported runtime platform ${platform}.`,
          'E_X1_PARITY_PLATFORM_UNSUPPORTED',
        );
      }

      const summary = collectChecksSummary(checks);
      const checksDigest = sha256Buffer(Buffer.from(stableStringify(checks), 'utf8'));
      runs.push({
        runId,
        checks,
        checksDigest,
        passCount: summary.passCount,
        failCount: summary.failCount,
        skipCount: summary.skipCount,
        passPct: summary.passPct,
        maxDocSizeMbVerified: runMaxDocSizeMb,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      hardFailures.push({
        code: typeof error?.code === 'string' ? error.code : 'E_X1_PARITY_RUN_EXCEPTION',
        message,
        runId,
      });
      runs.push({
        runId,
        checks: [
          {
            id: `run-${runId}.exception`,
            status: 'fail',
            code: typeof error?.code === 'string' ? error.code : 'E_X1_PARITY_RUN_EXCEPTION',
            message,
          },
        ],
        checksDigest: '',
        passCount: 0,
        failCount: 1,
        skipCount: 0,
        passPct: 0,
        maxDocSizeMbVerified: runMaxDocSizeMb,
      });
    }
  }

  const totalPasses = runs.reduce((sum, run) => sum + run.passCount, 0);
  const totalFails = runs.reduce((sum, run) => sum + run.failCount, 0);
  const passPct = toPercent(totalPasses, totalPasses + totalFails);
  const maxDocSizeMbVerified = runs.reduce((max, run) => Math.max(max, run.maxDocSizeMbVerified || 0), 0);
  const runtimeParityPassPct = passPct;

  let flakyRatePct = 0;
  if (repeatN > 1) {
    const baselineDigest = runs[0]?.checksDigest || '';
    const divergentRuns = runs.slice(1).filter((run) => run.checksDigest !== baselineDigest).length;
    flakyRatePct = toPercent(divergentRuns, repeatN - 1);
  }

  const runFailures = [];
  for (const run of runs) {
    for (const check of run.checks) {
      if (check.status !== 'fail') continue;
      runFailures.push({
        runId: run.runId,
        id: check.id,
        code: check.code || 'E_X1_PARITY_CHECK_FAILED',
        message: check.message || 'X1 parity check failed.',
      });
    }
  }

  const errors = [...hardFailures, ...runFailures];
  const ok = errors.length === 0 && passPct === 100;
  const durationMs = Date.now() - startedAt;

  const report = {
    [TOKEN_NAME]: ok ? 1 : 0,
    scenario: 'open->edit->save->reopen->export->import->diff',
    platform,
    baselineVersionRef,
    repeatN,
    runs,
    passes: totalPasses,
    fails: totalFails,
    passPct,
    runtimeParityPassPct,
    flakyRatePct,
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
    if (arg === '--work-dir' && i + 1 < argv.length) {
      out.workDir = String(argv[i + 1] || '').trim();
      i += 1;
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
  console.log(`X1_PARITY_PLATFORM=${state.platform}`);
  console.log(`X1_PARITY_PASSES=${state.passes}`);
  console.log(`X1_PARITY_FAILS=${state.fails}`);
  console.log(`X1_PARITY_PASS_PCT=${state.passPct}`);
  console.log(`X1_PARITY_RUNTIME_PASS_PCT=${state.runtimeParityPassPct}`);
  console.log(`X1_PARITY_FLAKY_RATE_PCT=${state.flakyRatePct}`);
  console.log(`X1_PARITY_MAX_DOC_SIZE_MB=${state.maxDocSizeMbVerified}`);
  console.log(`X1_PARITY_REPEAT_N=${state.repeatN}`);
  if (state.failSignalCode) {
    console.log(`FAIL_REASON=${state.failSignalCode}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = await runX1DesktopParityHarness({
    workDir: args.workDir || undefined,
    repeat: args.repeat,
  });

  if (args.json) {
    process.stdout.write(`${stableStringify(state)}\n`);
  } else {
    printHuman(state);
  }

  process.exit(state[TOKEN_NAME] === 1 ? 0 : 1);
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
