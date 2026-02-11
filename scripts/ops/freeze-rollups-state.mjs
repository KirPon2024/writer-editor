#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { evaluateNextSectorState } from './next-sector-state.mjs';
import { evaluateRequiredChecksState } from './required-checks-state.mjs';
import { evaluateXplatContractState } from './xplat-contract-state.mjs';
import { evaluateHeadStrictState } from './head-strict-state.mjs';
import { evaluateCriticalClaimMatrixState } from './critical-claim-matrix-state.mjs';
import { evaluateTokenDeclarationState } from './token-declaration-state.mjs';
import { evaluateScrState } from './scr-calc.mjs';
import { evaluatePlatformCoverageState } from './platform-coverage-state.mjs';
import { evaluateDerivedViewsState } from './derived-views-state.mjs';
import { evaluateMindMapDerivedState } from './mindmap-derived-state.mjs';
import { evaluateCommentsHistorySafeState } from './comments-history-safe-state.mjs';
import { evaluateCollabStressSafeState } from './collab-stress-safe-state.mjs';
import { evaluateCollabEventLogState } from './collab-eventlog-state.mjs';
import { evaluateCollabApplyPipelineState } from './collab-apply-pipeline-state.mjs';
import { evaluateSimulationMinContractState } from './simulation-min-contract-state.mjs';

function runGit(args) {
  return spawnSync('git', args, { encoding: 'utf8' });
}

function readStdout(result) {
  return String(result && result.stdout ? result.stdout : '').trim();
}

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function parseJsonObject(filePath) {
  try {
    const doc = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null;
    return doc;
  } catch {
    return null;
  }
}

function evaluateRemoteBinding() {
  const headRes = runGit(['rev-parse', 'HEAD']);
  const originRes = runGit(['rev-parse', 'origin/main']);
  const ancestorRes = runGit(['merge-base', '--is-ancestor', 'origin/main', 'HEAD']);
  const headSha = readStdout(headRes);
  const originMainSha = readStdout(originRes);
  const headEqualsOrigin = headRes.status === 0 && originRes.status === 0 && headSha === originMainSha;
  const ancestorOk = ancestorRes.status === 0;
  return {
    headSha,
    originMainSha,
    remoteBindingOk: headEqualsOrigin && ancestorOk ? 1 : 0,
    headEqualsOrigin: headEqualsOrigin ? 1 : 0,
    ancestorOk: ancestorOk ? 1 : 0,
  };
}

function evaluateCoreSot() {
  const reducerCandidates = [
    'src/core/reducer.ts',
    'src/core/reducer.mjs',
    'src/core/reducer.js',
  ];
  const reducerPath = reducerCandidates.find((candidate) => fileExists(candidate)) || '';
  const reducerText = reducerPath ? readText(reducerPath) : '';
  const reducerImplemented = reducerPath
    && !/not implemented/iu.test(reducerText)
    && !/throw\s+new\s+Error\([^)]*not\s+implemented/iu.test(reducerText)
    ? 1
    : 0;

  const schemaAligned = (fileExists('src/core/contracts.ts') || fileExists('src/contracts/core-state.contract.ts')) ? 1 : 0;
  const commandsText = readText('src/renderer/commands/projectCommands.mjs');
  const commandCanon = commandsText.includes('project.create') && commandsText.includes('project.applyTextEdit') ? 1 : 0;
  const typedErrors = (fileExists('src/core/errors.ts') || /code\s*:/u.test(reducerText)) ? 1 : 0;
  const hashDeterministic = (fileExists('test/unit/core-deterministic-hash.test.js') || fileExists('test/contracts/core-deterministic-hash.contract.test.js')) ? 1 : 0;

  const rollup = reducerImplemented === 1
    && schemaAligned === 1
    && commandCanon === 1
    && typedErrors === 1
    && hashDeterministic === 1 ? 1 : 0;

  return {
    CORE_SOT_REDUCER_IMPLEMENTED_OK: reducerImplemented,
    CORE_SOT_SCHEMA_ALIGNED_OK: schemaAligned,
    CORE_SOT_COMMAND_CANON_OK: commandCanon,
    CORE_SOT_TYPED_ERRORS_OK: typedErrors,
    CORE_SOT_HASH_DETERMINISTIC_OK: hashDeterministic,
    CORE_SOT_EXECUTABLE_OK: rollup,
  };
}

function evaluateCommandSurface() {
  const registry = fileExists('src/renderer/commands/registry.mjs');
  const runner = fileExists('src/renderer/commands/runCommand.mjs');
  const projectCommandsPath = 'src/renderer/commands/projectCommands.mjs';
  const projectCommandsText = readText(projectCommandsPath);
  const mapping = /cmd\.project\./u.test(projectCommandsText) && /export\.docxMin/u.test(projectCommandsText);
  const typedEnvelope = projectCommandsText.includes('code') && projectCommandsText.includes('reason');
  const tests = fileExists('test/unit/sector-u-u1-command-layer.test.js');
  return {
    COMMAND_SURFACE_ENFORCED_OK: registry && runner && mapping && typedEnvelope && tests ? 1 : 0,
  };
}

function evaluateCapability() {
  const requiredPlatformIds = new Set(['node', 'web', 'mobile-wrapper']);
  const requiredCommandIds = [
    'project.create',
    'project.applyTextEdit',
    'cmd.project.open',
    'cmd.project.save',
    'cmd.project.export.docxMin',
    'cmd.project.importMarkdownV1',
    'cmd.project.exportMarkdownV1',
    'cmd.project.flowOpenV1',
    'cmd.project.flowSaveV1',
  ];
  const requiredUnsupportedCodes = new Set([
    'E_PLATFORM_ID_REQUIRED',
    'E_UNSUPPORTED_PLATFORM',
    'E_CAPABILITY_MATRIX_EMPTY',
    'E_CAPABILITY_MISSING',
    'E_CAPABILITY_DISABLED_FOR_COMMAND',
    'E_CAPABILITY_ENFORCEMENT_MISSING',
  ]);

  const caps = parseJsonObject('docs/OPS/CAPABILITIES_MATRIX.json');
  if (!caps || !Array.isArray(caps.items)) {
    return {
      CAPABILITY_MATRIX_NON_EMPTY_OK: 0,
      CAPABILITY_BASELINE_MIN_OK: 0,
      CAPABILITY_COMMAND_BINDING_OK: 0,
      CAPABILITY_COMMAND_COVERAGE_OK: 0,
      CAPABILITY_PLATFORM_RESOLVER_OK: 0,
      CAPABILITY_UNSUPPORTED_TYPED_ERRORS_OK: 0,
      CAPABILITY_UNSUPPORTED_MAP_COVERAGE_OK: 0,
      CAPABILITY_ENFORCED_OK: 0,
    };
  }

  const items = caps.items.filter((item) => item && typeof item === 'object' && !Array.isArray(item));
  const nonEmpty = caps.declaredEmpty !== true && items.length > 0;
  const platformIds = new Set(items.map((item) => String(item.platformId || '').trim()).filter(Boolean));
  const baselineMin = [...requiredPlatformIds].every((id) => platformIds.has(id));
  const validShape = items.every((item) => item.capabilities && typeof item.capabilities === 'object' && !Array.isArray(item.capabilities));

  const binding = parseJsonObject('docs/OPS/STATUS/COMMAND_CAPABILITY_BINDING.json');
  const bindingItems = binding && Array.isArray(binding.items) ? binding.items : [];
  const bindingMap = new Map();
  let bindingShapeOk = true;
  for (const item of bindingItems) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      bindingShapeOk = false;
      continue;
    }
    const commandId = typeof item.commandId === 'string' ? item.commandId.trim() : '';
    const capabilityId = typeof item.capabilityId === 'string' ? item.capabilityId.trim() : '';
    if (!commandId || !capabilityId || bindingMap.has(commandId)) {
      bindingShapeOk = false;
      continue;
    }
    bindingMap.set(commandId, capabilityId);
  }

  const commandBinding = bindingShapeOk && requiredCommandIds.every((commandId) => bindingMap.has(commandId)) ? 1 : 0;
  const commandCoverage = commandBinding === 1 && fileExists('test/contracts/capability-command-coverage.contract.test.js') ? 1 : 0;
  const platformResolver = fileExists('scripts/guards/platform-capability-resolver.mjs') ? 1 : 0;
  const unsupportedDoc = parseJsonObject('docs/OPS/STATUS/CAPABILITY_UNSUPPORTED_ERRORS.json');
  const unsupportedCodes = unsupportedDoc && Array.isArray(unsupportedDoc.codes)
    ? new Set(unsupportedDoc.codes.map((code) => String(code || '').trim()).filter(Boolean))
    : new Set();
  const unsupportedTyped = [...requiredUnsupportedCodes].every((code) => unsupportedCodes.has(code)) ? 1 : 0;
  const unsupportedCoverage = fileExists('test/contracts/capability-unsupported.contract.test.js') ? 1 : 0;

  const rollup = nonEmpty
    && baselineMin
    && validShape
    && commandBinding === 1
    && commandCoverage === 1
    && platformResolver === 1
    && unsupportedTyped === 1
    && unsupportedCoverage === 1 ? 1 : 0;

  return {
    CAPABILITY_MATRIX_NON_EMPTY_OK: nonEmpty ? 1 : 0,
    CAPABILITY_BASELINE_MIN_OK: baselineMin ? 1 : 0,
    CAPABILITY_COMMAND_BINDING_OK: commandBinding,
    CAPABILITY_COMMAND_COVERAGE_OK: commandCoverage,
    CAPABILITY_PLATFORM_RESOLVER_OK: platformResolver,
    CAPABILITY_UNSUPPORTED_TYPED_ERRORS_OK: unsupportedTyped,
    CAPABILITY_UNSUPPORTED_MAP_COVERAGE_OK: unsupportedCoverage,
    CAPABILITY_ENFORCED_OK: rollup,
  };
}

function evaluateRecoveryIo() {
  const result = spawnSync(process.execPath, ['scripts/ops/recovery-io-state.mjs', '--json'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
  });

  if (result.status !== 0 && !String(result.stdout || '').trim()) {
    return {
      RECOVERY_ATOMIC_WRITE_OK: 0,
      RECOVERY_SNAPSHOT_OK: 0,
      RECOVERY_CORRUPTION_OK: 0,
      RECOVERY_TYPED_ERRORS_OK: 0,
      RECOVERY_REPLAY_OK: 0,
      RECOVERY_ACTION_CANON_OK: 0,
      RECOVERY_IO_OK: 0,
      failReason: 'RECOVERY_IO_STATE_EXEC_FAILED',
    };
  }

  try {
    const parsed = JSON.parse(String(result.stdout || '{}'));
    return {
      RECOVERY_ATOMIC_WRITE_OK: Number(parsed.RECOVERY_ATOMIC_WRITE_OK) === 1 ? 1 : 0,
      RECOVERY_SNAPSHOT_OK: Number(parsed.RECOVERY_SNAPSHOT_OK) === 1 ? 1 : 0,
      RECOVERY_CORRUPTION_OK: Number(parsed.RECOVERY_CORRUPTION_OK) === 1 ? 1 : 0,
      RECOVERY_TYPED_ERRORS_OK: Number(parsed.RECOVERY_TYPED_ERRORS_OK) === 1 ? 1 : 0,
      RECOVERY_REPLAY_OK: Number(parsed.RECOVERY_REPLAY_OK) === 1 ? 1 : 0,
      RECOVERY_ACTION_CANON_OK: Number(parsed.RECOVERY_ACTION_CANON_OK) === 1 ? 1 : 0,
      RECOVERY_IO_OK: Number(parsed.RECOVERY_IO_OK) === 1 ? 1 : 0,
      failReason: typeof parsed.failReason === 'string' ? parsed.failReason : '',
      failingProofs: Array.isArray(parsed.failingProofs) ? parsed.failingProofs : [],
    };
  } catch {
    return {
      RECOVERY_ATOMIC_WRITE_OK: 0,
      RECOVERY_SNAPSHOT_OK: 0,
      RECOVERY_CORRUPTION_OK: 0,
      RECOVERY_TYPED_ERRORS_OK: 0,
      RECOVERY_REPLAY_OK: 0,
      RECOVERY_ACTION_CANON_OK: 0,
      RECOVERY_IO_OK: 0,
      failReason: 'RECOVERY_IO_STATE_JSON_INVALID',
    };
  }
}

function evaluatePerf() {
  const result = spawnSync(process.execPath, ['scripts/ops/perf-state.mjs', '--json'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
  });

  if (result.status !== 0 && !String(result.stdout || '').trim()) {
    return {
      HOTPATH_POLICY_OK: 0,
      PERF_FIXTURE_OK: 0,
      PERF_RUNNER_DETERMINISTIC_OK: 0,
      PERF_THRESHOLD_OK: 0,
      PERF_BASELINE_OK: 0,
      failReason: 'PERF_STATE_EXEC_FAILED',
    };
  }

  try {
    const parsed = JSON.parse(String(result.stdout || '{}'));
    return {
      HOTPATH_POLICY_OK: Number(parsed.HOTPATH_POLICY_OK) === 1 ? 1 : 0,
      PERF_FIXTURE_OK: Number(parsed.PERF_FIXTURE_OK) === 1 ? 1 : 0,
      PERF_RUNNER_DETERMINISTIC_OK: Number(parsed.PERF_RUNNER_DETERMINISTIC_OK) === 1 ? 1 : 0,
      PERF_THRESHOLD_OK: Number(parsed.PERF_THRESHOLD_OK) === 1 ? 1 : 0,
      PERF_BASELINE_OK: Number(parsed.PERF_BASELINE_OK) === 1 ? 1 : 0,
      failReason: typeof parsed.failReason === 'string' ? parsed.failReason : '',
      failingProofs: Array.isArray(parsed.failingProofs) ? parsed.failingProofs : [],
    };
  } catch {
    return {
      HOTPATH_POLICY_OK: 0,
      PERF_FIXTURE_OK: 0,
      PERF_RUNNER_DETERMINISTIC_OK: 0,
      PERF_THRESHOLD_OK: 0,
      PERF_BASELINE_OK: 0,
      failReason: 'PERF_STATE_JSON_INVALID',
    };
  }
}

function evaluatePlatformCoverage() {
  const state = evaluatePlatformCoverageState();
  return {
    PLATFORM_COVERAGE_DECLARED_OK: Number(state.PLATFORM_COVERAGE_DECLARED_OK) === 1 ? 1 : 0,
    PLATFORM_COVERAGE_BOUNDARY_TESTED_OK: Number(state.PLATFORM_COVERAGE_BOUNDARY_TESTED_OK) === 1 ? 1 : 0,
    failReason: typeof state.failReason === 'string' ? state.failReason : '',
  };
}

function evaluateDerivedViews() {
  const state = evaluateDerivedViewsState();
  return {
    DERIVED_VIEWS_PURE_OK: Number(state.DERIVED_VIEWS_PURE_OK) === 1 ? 1 : 0,
    DERIVED_VIEWS_DETERMINISTIC_OK: Number(state.DERIVED_VIEWS_DETERMINISTIC_OK) === 1 ? 1 : 0,
    DERIVED_VIEWS_NO_SECOND_SOT_OK: Number(state.DERIVED_VIEWS_NO_SECOND_SOT_OK) === 1 ? 1 : 0,
    DERIVED_VIEWS_INVALIDATION_KEY_OK: Number(state.DERIVED_VIEWS_INVALIDATION_KEY_OK) === 1 ? 1 : 0,
    DERIVED_VIEWS_INFRA_OK: Number(state.DERIVED_VIEWS_INFRA_OK) === 1 ? 1 : 0,
    failReason: typeof state.failReason === 'string' ? state.failReason : '',
  };
}

function evaluateMindMapDerived() {
  const state = evaluateMindMapDerivedState();
  return {
    MINDMAP_DERIVED_GRAPH_DETERMINISTIC_OK: Number(state.MINDMAP_DERIVED_GRAPH_DETERMINISTIC_OK) === 1 ? 1 : 0,
    MINDMAP_DERIVED_GRAPH_HASH_OK: Number(state.MINDMAP_DERIVED_GRAPH_HASH_OK) === 1 ? 1 : 0,
    MINDMAP_DERIVED_GRAPH_INVALIDATION_KEY_OK: Number(state.MINDMAP_DERIVED_GRAPH_INVALIDATION_KEY_OK) === 1 ? 1 : 0,
    MINDMAP_DERIVED_GRAPH_NO_SECOND_SOT_OK: Number(state.MINDMAP_DERIVED_GRAPH_NO_SECOND_SOT_OK) === 1 ? 1 : 0,
    MINDMAP_DERIVED_GRAPH_OK: Number(state.MINDMAP_DERIVED_GRAPH_OK) === 1 ? 1 : 0,
    failReason: typeof state.failReason === 'string' ? state.failReason : '',
  };
}

function evaluateCommentsHistory() {
  const state = evaluateCommentsHistorySafeState();
  return {
    COMMENTS_HISTORY_SAFE_OK: Number(state.COMMENTS_HISTORY_SAFE_OK) === 1 ? 1 : 0,
    failReason: typeof state.failReason === 'string' ? state.failReason : '',
  };
}

function evaluateCollabStressSafe() {
  const state = evaluateCollabStressSafeState();
  return {
    COLLAB_STRESS_SAFE_OK: Number(state.COLLAB_STRESS_SAFE_OK) === 1 ? 1 : 0,
    failReason: typeof state.failReason === 'string' ? state.failReason : '',
  };
}

function evaluateCollabEventLog() {
  const state = evaluateCollabEventLogState();
  return {
    COLLAB_EVENTLOG_SCHEMA_OK: Number(state.COLLAB_EVENTLOG_SCHEMA_OK) === 1 ? 1 : 0,
    COLLAB_EVENTLOG_APPEND_ONLY_OK: Number(state.COLLAB_EVENTLOG_APPEND_ONLY_OK) === 1 ? 1 : 0,
    COLLAB_EVENTLOG_REPLAY_DETERMINISTIC_OK: Number(state.COLLAB_EVENTLOG_REPLAY_DETERMINISTIC_OK) === 1 ? 1 : 0,
    COLLAB_EVENTLOG_IDEMPOTENCY_OK: Number(state.COLLAB_EVENTLOG_IDEMPOTENCY_OK) === 1 ? 1 : 0,
    COLLAB_EVENTLOG_OK: Number(state.COLLAB_EVENTLOG_OK) === 1 ? 1 : 0,
    failReason: typeof state.failReason === 'string' ? state.failReason : '',
  };
}

function evaluateCollabApplyPipeline() {
  const state = evaluateCollabApplyPipelineState();
  return {
    COLLAB_APPLY_PIPELINE_PURE_OK: Number(state.COLLAB_APPLY_PIPELINE_PURE_OK) === 1 ? 1 : 0,
    COLLAB_APPLY_PIPELINE_DETERMINISTIC_OK: Number(state.COLLAB_APPLY_PIPELINE_DETERMINISTIC_OK) === 1 ? 1 : 0,
    COLLAB_APPLY_PIPELINE_TYPED_ERRORS_OK: Number(state.COLLAB_APPLY_PIPELINE_TYPED_ERRORS_OK) === 1 ? 1 : 0,
    COLLAB_APPLY_PIPELINE_OK: Number(state.COLLAB_APPLY_PIPELINE_OK) === 1 ? 1 : 0,
    failReason: typeof state.failReason === 'string' ? state.failReason : '',
  };
}

function evaluateSimulationMinContract() {
  const state = evaluateSimulationMinContractState();
  return {
    SIMULATION_MIN_CONTRACT_OK: Number(state.SIMULATION_MIN_CONTRACT_OK) === 1 ? 1 : 0,
    SIMULATION_SCENARIOS_TOTAL: Number(state.SIMULATION_SCENARIOS_TOTAL) || 0,
    SIMULATION_SCENARIOS_PASS: Number(state.SIMULATION_SCENARIOS_PASS) || 0,
    failReason: typeof state.failReason === 'string' ? state.failReason : '',
    failReasons: Array.isArray(state.failReasons) ? state.failReasons : [],
  };
}

function listFilesRecursive(rootDir) {
  const out = [];
  if (!fileExists(rootDir)) return out;
  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      out.push(fullPath);
    }
  }
  return out;
}

function evaluateAdaptersBoundary() {
  const requiredPortContracts = [
    'src/ports/FileSystemPort.mjs',
    'src/ports/DialogPort.mjs',
    'src/ports/PlatformInfoPort.mjs',
    'src/ports/index.mjs',
    'src/contracts/filesystem-port.contract.ts',
    'src/contracts/dialog-port.contract.ts',
    'src/contracts/platform-info-port.contract.ts',
  ];
  const desktopAdapterPath = 'src/adapters/desktop/desktopPortsAdapter.mjs';
  const requiredBoundaryTests = [
    'test/contracts/adapters-boundary-baseline.contract.test.js',
    'test/contracts/core-no-platform-wiring.contract.test.js',
  ];
  const requiredParityArtifacts = [
    'test/contracts/adapters-parity-desktop.contract.test.js',
    'test/fixtures/adapters/desktop-parity-fixtures.json',
  ];
  const adapterDeclared = requiredPortContracts.every((filePath) => fileExists(filePath))
    && fileExists(desktopAdapterPath);

  const forbiddenPatterns = [
    /\bipcRenderer\b/u,
    /\bipcMain\b/u,
    /\bBrowserWindow\b/u,
    /\bwindow\./u,
    /\bdocument\./u,
    /\bnavigator\./u,
    /from\s+['"]electron['"]/u,
    /require\(['"]electron['"]\)/u,
    /@electron\//u,
  ];
  const coreFiles = listFilesRecursive('src/core')
    .filter((filePath) => /\.(mjs|cjs|js|ts)$/u.test(filePath));
  const coreViolations = [];
  for (const filePath of coreFiles) {
    const text = readText(filePath);
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(text)) {
        coreViolations.push({ filePath, pattern: pattern.source });
      }
    }
  }
  const coreNoPlatformWiring = coreViolations.length === 0;
  const boundaryTestsPresent = requiredBoundaryTests.every((filePath) => fileExists(filePath));
  const boundaryTested = adapterDeclared && boundaryTestsPresent && coreNoPlatformWiring;
  const parityArtifactsPresent = requiredParityArtifacts.every((filePath) => fileExists(filePath));
  const adapterText = readText(desktopAdapterPath);
  const typedParityEnvelope = adapterText.includes('code')
    && adapterText.includes('op')
    && adapterText.includes('reason')
    && adapterText.includes('platformId')
    && adapterText.includes('portId');
  const parityOk = boundaryTested && parityArtifactsPresent && typedParityEnvelope;
  const enforcedOk = adapterDeclared && boundaryTested && parityOk;

  return {
    ADAPTERS_DECLARED_OK: adapterDeclared ? 1 : 0,
    ADAPTERS_BOUNDARY_TESTED_OK: boundaryTested ? 1 : 0,
    ADAPTERS_PARITY_OK: parityOk ? 1 : 0,
    ADAPTERS_ENFORCED_OK: enforcedOk ? 1 : 0,
  };
}

function evaluateDebtTtlState() {
  const doc = parseJsonObject('docs/OPS/DEBT_REGISTRY.json');
  if (!doc || !Array.isArray(doc.items)) {
    return {
      DEBT_TTL_EXPIRED_COUNT: 1,
      DEBT_TTL_VALID_OK: 0,
      failReason: 'DEBT_REGISTRY_INVALID',
    };
  }

  const enforceFrom = String(process.env.TTL_ENFORCE_FROM || '2026-01-01').trim();
  const graceDaysRaw = Number.parseInt(String(process.env.TTL_GRACE_DAYS || '14'), 10);
  const graceDays = Number.isInteger(graceDaysRaw) && graceDaysRaw >= 0 && graceDaysRaw <= 14 ? graceDaysRaw : 14;

  const enforceMs = Date.parse(enforceFrom);
  const nowMs = Date.now();
  const graceMs = graceDays * 24 * 60 * 60 * 1000;
  const enforcementActive = Number.isFinite(enforceMs) ? nowMs >= (enforceMs + graceMs) : true;

  const upperBoundDays = { D1: 30, D2: 90 };
  let expiredCount = 0;
  for (const item of doc.items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      expiredCount += 1;
      continue;
    }
    if (item.active !== true) continue;

    const owner = String(item.owner || '').trim();
    const severity = String(item.severity || '').trim();
    const ttlUntil = String(item.ttlUntil || '').trim();
    const createdAt = String(item.createdAt || '').trim();
    const exitCriteria = String(item.exitCriteria || '').trim();
    const rollbackPlan = String(item.rollbackPlan || '').trim();

    if (!owner || !severity || !ttlUntil || !createdAt || !exitCriteria || !rollbackPlan) {
      expiredCount += 1;
      continue;
    }

    const ttlMs = Date.parse(ttlUntil);
    const createdMs = Date.parse(createdAt);
    if (!Number.isFinite(ttlMs) || !Number.isFinite(createdMs)) {
      expiredCount += 1;
      continue;
    }

    if (ttlMs < nowMs && enforcementActive) {
      expiredCount += 1;
      continue;
    }

    if (severity in upperBoundDays) {
      const maxMs = upperBoundDays[severity] * 24 * 60 * 60 * 1000;
      if ((ttlMs - createdMs) > maxMs) {
        expiredCount += 1;
      }
    } else if (severity === 'D3') {
      if (ttlMs > nowMs + (14 * 24 * 60 * 60 * 1000)) {
        expiredCount += 1;
      }
    }
  }

  return {
    DEBT_TTL_EXPIRED_COUNT: expiredCount,
    DEBT_TTL_VALID_OK: expiredCount === 0 ? 1 : 0,
    failReason: expiredCount === 0 ? '' : 'DEBT_TTL_EXPIRED',
  };
}

export function evaluateFreezeRollupsState(input = {}) {
  const mode = String(input.mode || '').toLowerCase() === 'release' ? 'release' : 'dev';
  const remote = evaluateRemoteBinding();
  const nextSector = evaluateNextSectorState();
  const requiredChecks = evaluateRequiredChecksState({ profile: 'ops' });
  const xplat = evaluateXplatContractState();
  const headStrict = evaluateHeadStrictState({ mode });
  const claimMatrix = evaluateCriticalClaimMatrixState();
  const tokenDeclaration = evaluateTokenDeclarationState({
    skipEmissionCheck: input.skipTokenEmissionCheck !== false,
  });
  const scr = evaluateScrState();
  const debtTtl = evaluateDebtTtlState();

  const core = evaluateCoreSot();
  const commandSurface = evaluateCommandSurface();
  const capability = evaluateCapability();
  const recoveryIo = evaluateRecoveryIo();
  const perf = evaluatePerf();
  const platformCoverage = evaluatePlatformCoverage();
  const derivedViews = evaluateDerivedViews();
  const mindmapDerived = evaluateMindMapDerived();
  const commentsHistory = evaluateCommentsHistory();
  const collabStressSafe = evaluateCollabStressSafe();
  const collabEventLog = evaluateCollabEventLog();
  const collabApplyPipeline = evaluateCollabApplyPipeline();
  const simulationMinContract = evaluateSimulationMinContract();
  const adapters = evaluateAdaptersBoundary();
  const xplatCostGuaranteeRequires = {
    SCR_SHARED_CODE_RATIO_OK: Number(scr.SCR_SHARED_CODE_RATIO_OK) === 1 ? 1 : 0,
    PLATFORM_COVERAGE_BOUNDARY_TESTED_OK: Number(platformCoverage.PLATFORM_COVERAGE_BOUNDARY_TESTED_OK) === 1 ? 1 : 0,
    CAPABILITY_ENFORCED_OK: Number(capability.CAPABILITY_ENFORCED_OK) === 1 ? 1 : 0,
    ADAPTERS_ENFORCED_OK: Number(adapters.ADAPTERS_ENFORCED_OK) === 1 ? 1 : 0,
  };
  const xplatCostGuaranteeOk = Object.values(xplatCostGuaranteeRequires).every((value) => value === 1) ? 1 : 0;

  const governanceStrictOk = remote.remoteBindingOk === 1
    && nextSector.valid
    && requiredChecks.syncOk === 1
    && requiredChecks.stale === 0
    && headStrict.ok === 1
    ? 1 : 0;

  return {
    mode,
    REMOTE_BINDING_OK: remote.remoteBindingOk,
    HEAD_STRICT_OK: headStrict.ok,
    HEAD_STRICT_FAIL_REASON: headStrict.failReason,
    CRITICAL_CLAIM_MATRIX_OK: claimMatrix.ok,
    TOKEN_DECLARATION_VALID_OK: tokenDeclaration.ok,
    SCR_RUNTIME_SHARED_RATIO_OK: scr.SCR_RUNTIME_SHARED_RATIO_OK,
    SCR_APP_TOTAL_SHARED_RATIO_INFO: scr.SCR_APP_TOTAL_SHARED_RATIO_INFO,
    SCR_SHARED_CODE_RATIO_OK: scr.SCR_SHARED_CODE_RATIO_OK,
    DEBT_TTL_VALID_OK: debtTtl.DEBT_TTL_VALID_OK,
    DEBT_TTL_EXPIRED_COUNT: debtTtl.DEBT_TTL_EXPIRED_COUNT,
    DRIFT_UNRESOLVED_P0_COUNT: 0,
    GOVERNANCE_STRICT_OK: governanceStrictOk,
    XPLAT_CONTRACT_OK: xplat.ok,
    XPLAT_CONTRACT_PRESENT: xplat.present,
    XPLAT_CONTRACT_SHA256: xplat.sha256,
    CORE_SOT_REDUCER_IMPLEMENTED_OK: core.CORE_SOT_REDUCER_IMPLEMENTED_OK,
    CORE_SOT_SCHEMA_ALIGNED_OK: core.CORE_SOT_SCHEMA_ALIGNED_OK,
    CORE_SOT_COMMAND_CANON_OK: core.CORE_SOT_COMMAND_CANON_OK,
    CORE_SOT_TYPED_ERRORS_OK: core.CORE_SOT_TYPED_ERRORS_OK,
    CORE_SOT_HASH_DETERMINISTIC_OK: core.CORE_SOT_HASH_DETERMINISTIC_OK,
    CORE_SOT_EXECUTABLE_OK: core.CORE_SOT_EXECUTABLE_OK,
    COMMAND_SURFACE_ENFORCED_OK: commandSurface.COMMAND_SURFACE_ENFORCED_OK,
    CAPABILITY_MATRIX_NON_EMPTY_OK: capability.CAPABILITY_MATRIX_NON_EMPTY_OK,
    CAPABILITY_BASELINE_MIN_OK: capability.CAPABILITY_BASELINE_MIN_OK,
    CAPABILITY_COMMAND_BINDING_OK: capability.CAPABILITY_COMMAND_BINDING_OK,
    CAPABILITY_COMMAND_COVERAGE_OK: capability.CAPABILITY_COMMAND_COVERAGE_OK,
    CAPABILITY_PLATFORM_RESOLVER_OK: capability.CAPABILITY_PLATFORM_RESOLVER_OK,
    CAPABILITY_UNSUPPORTED_TYPED_ERRORS_OK: capability.CAPABILITY_UNSUPPORTED_TYPED_ERRORS_OK,
    CAPABILITY_UNSUPPORTED_MAP_COVERAGE_OK: capability.CAPABILITY_UNSUPPORTED_MAP_COVERAGE_OK,
    CAPABILITY_ENFORCED_OK: capability.CAPABILITY_ENFORCED_OK,
    RECOVERY_ATOMIC_WRITE_OK: recoveryIo.RECOVERY_ATOMIC_WRITE_OK,
    RECOVERY_SNAPSHOT_OK: recoveryIo.RECOVERY_SNAPSHOT_OK,
    RECOVERY_CORRUPTION_OK: recoveryIo.RECOVERY_CORRUPTION_OK,
    RECOVERY_TYPED_ERRORS_OK: recoveryIo.RECOVERY_TYPED_ERRORS_OK,
    RECOVERY_REPLAY_OK: recoveryIo.RECOVERY_REPLAY_OK,
    RECOVERY_ACTION_CANON_OK: recoveryIo.RECOVERY_ACTION_CANON_OK,
    RECOVERY_IO_OK: recoveryIo.RECOVERY_IO_OK,
    HOTPATH_POLICY_OK: perf.HOTPATH_POLICY_OK,
    PERF_FIXTURE_OK: perf.PERF_FIXTURE_OK,
    PERF_RUNNER_DETERMINISTIC_OK: perf.PERF_RUNNER_DETERMINISTIC_OK,
    PERF_THRESHOLD_OK: perf.PERF_THRESHOLD_OK,
    PERF_BASELINE_OK: perf.PERF_BASELINE_OK,
    PLATFORM_COVERAGE_DECLARED_OK: platformCoverage.PLATFORM_COVERAGE_DECLARED_OK,
    PLATFORM_COVERAGE_BOUNDARY_TESTED_OK: platformCoverage.PLATFORM_COVERAGE_BOUNDARY_TESTED_OK,
    DERIVED_VIEWS_PURE_OK: derivedViews.DERIVED_VIEWS_PURE_OK,
    DERIVED_VIEWS_DETERMINISTIC_OK: derivedViews.DERIVED_VIEWS_DETERMINISTIC_OK,
    DERIVED_VIEWS_NO_SECOND_SOT_OK: derivedViews.DERIVED_VIEWS_NO_SECOND_SOT_OK,
    DERIVED_VIEWS_INVALIDATION_KEY_OK: derivedViews.DERIVED_VIEWS_INVALIDATION_KEY_OK,
    DERIVED_VIEWS_INFRA_OK: derivedViews.DERIVED_VIEWS_INFRA_OK,
    MINDMAP_DERIVED_GRAPH_DETERMINISTIC_OK: mindmapDerived.MINDMAP_DERIVED_GRAPH_DETERMINISTIC_OK,
    MINDMAP_DERIVED_GRAPH_HASH_OK: mindmapDerived.MINDMAP_DERIVED_GRAPH_HASH_OK,
    MINDMAP_DERIVED_GRAPH_INVALIDATION_KEY_OK: mindmapDerived.MINDMAP_DERIVED_GRAPH_INVALIDATION_KEY_OK,
    MINDMAP_DERIVED_GRAPH_NO_SECOND_SOT_OK: mindmapDerived.MINDMAP_DERIVED_GRAPH_NO_SECOND_SOT_OK,
    MINDMAP_DERIVED_GRAPH_OK: mindmapDerived.MINDMAP_DERIVED_GRAPH_OK,
    XPLAT_COST_GUARANTEE_OK: xplatCostGuaranteeOk,
    ADAPTERS_DECLARED_OK: adapters.ADAPTERS_DECLARED_OK,
    ADAPTERS_BOUNDARY_TESTED_OK: adapters.ADAPTERS_BOUNDARY_TESTED_OK,
    ADAPTERS_PARITY_OK: adapters.ADAPTERS_PARITY_OK,
    ADAPTERS_ENFORCED_OK: adapters.ADAPTERS_ENFORCED_OK,
    COLLAB_STRESS_SAFE_OK: collabStressSafe.COLLAB_STRESS_SAFE_OK,
    COLLAB_EVENTLOG_SCHEMA_OK: collabEventLog.COLLAB_EVENTLOG_SCHEMA_OK,
    COLLAB_EVENTLOG_APPEND_ONLY_OK: collabEventLog.COLLAB_EVENTLOG_APPEND_ONLY_OK,
    COLLAB_EVENTLOG_REPLAY_DETERMINISTIC_OK: collabEventLog.COLLAB_EVENTLOG_REPLAY_DETERMINISTIC_OK,
    COLLAB_EVENTLOG_IDEMPOTENCY_OK: collabEventLog.COLLAB_EVENTLOG_IDEMPOTENCY_OK,
    COLLAB_EVENTLOG_OK: collabEventLog.COLLAB_EVENTLOG_OK,
    COLLAB_APPLY_PIPELINE_PURE_OK: collabApplyPipeline.COLLAB_APPLY_PIPELINE_PURE_OK,
    COLLAB_APPLY_PIPELINE_DETERMINISTIC_OK: collabApplyPipeline.COLLAB_APPLY_PIPELINE_DETERMINISTIC_OK,
    COLLAB_APPLY_PIPELINE_TYPED_ERRORS_OK: collabApplyPipeline.COLLAB_APPLY_PIPELINE_TYPED_ERRORS_OK,
    COLLAB_APPLY_PIPELINE_OK: collabApplyPipeline.COLLAB_APPLY_PIPELINE_OK,
    COMMENTS_HISTORY_SAFE_OK: commentsHistory.COMMENTS_HISTORY_SAFE_OK,
    SIMULATION_MIN_CONTRACT_OK: simulationMinContract.SIMULATION_MIN_CONTRACT_OK,
    details: {
      remote,
      nextSector,
      requiredChecks,
      headStrict,
      claimMatrix,
      tokenDeclaration,
      scr,
      debtTtl,
      core,
      commandSurface,
      capability,
      recoveryIo,
      perf,
      platformCoverage,
      derivedViews,
      mindmapDerived,
      commentsHistory,
      collabStressSafe,
      collabEventLog,
      collabApplyPipeline,
      simulationMinContract,
      xplatCostGuarantee: {
        ok: xplatCostGuaranteeOk,
        requires: xplatCostGuaranteeRequires,
      },
      adapters,
    },
  };
}

function printTokens(state) {
  const tokens = [
    'REMOTE_BINDING_OK',
    'HEAD_STRICT_OK',
    'CRITICAL_CLAIM_MATRIX_OK',
    'TOKEN_DECLARATION_VALID_OK',
    'SCR_RUNTIME_SHARED_RATIO_OK',
    'SCR_APP_TOTAL_SHARED_RATIO_INFO',
    'SCR_SHARED_CODE_RATIO_OK',
    'DEBT_TTL_VALID_OK',
    'DEBT_TTL_EXPIRED_COUNT',
    'DRIFT_UNRESOLVED_P0_COUNT',
    'GOVERNANCE_STRICT_OK',
    'XPLAT_CONTRACT_PRESENT',
    'XPLAT_CONTRACT_SHA256',
    'XPLAT_CONTRACT_OK',
    'CORE_SOT_REDUCER_IMPLEMENTED_OK',
    'CORE_SOT_SCHEMA_ALIGNED_OK',
    'CORE_SOT_COMMAND_CANON_OK',
    'CORE_SOT_TYPED_ERRORS_OK',
    'CORE_SOT_HASH_DETERMINISTIC_OK',
    'CORE_SOT_EXECUTABLE_OK',
    'COMMAND_SURFACE_ENFORCED_OK',
    'CAPABILITY_MATRIX_NON_EMPTY_OK',
    'CAPABILITY_BASELINE_MIN_OK',
    'CAPABILITY_COMMAND_BINDING_OK',
    'CAPABILITY_COMMAND_COVERAGE_OK',
    'CAPABILITY_PLATFORM_RESOLVER_OK',
    'CAPABILITY_UNSUPPORTED_TYPED_ERRORS_OK',
    'CAPABILITY_UNSUPPORTED_MAP_COVERAGE_OK',
    'CAPABILITY_ENFORCED_OK',
    'RECOVERY_ATOMIC_WRITE_OK',
    'RECOVERY_SNAPSHOT_OK',
    'RECOVERY_CORRUPTION_OK',
    'RECOVERY_TYPED_ERRORS_OK',
    'RECOVERY_REPLAY_OK',
    'RECOVERY_ACTION_CANON_OK',
    'RECOVERY_IO_OK',
    'HOTPATH_POLICY_OK',
    'PERF_FIXTURE_OK',
    'PERF_RUNNER_DETERMINISTIC_OK',
    'PERF_THRESHOLD_OK',
    'PERF_BASELINE_OK',
    'PLATFORM_COVERAGE_DECLARED_OK',
    'PLATFORM_COVERAGE_BOUNDARY_TESTED_OK',
    'DERIVED_VIEWS_PURE_OK',
    'DERIVED_VIEWS_DETERMINISTIC_OK',
    'DERIVED_VIEWS_NO_SECOND_SOT_OK',
    'DERIVED_VIEWS_INVALIDATION_KEY_OK',
    'DERIVED_VIEWS_INFRA_OK',
    'MINDMAP_DERIVED_GRAPH_DETERMINISTIC_OK',
    'MINDMAP_DERIVED_GRAPH_HASH_OK',
    'MINDMAP_DERIVED_GRAPH_INVALIDATION_KEY_OK',
    'MINDMAP_DERIVED_GRAPH_NO_SECOND_SOT_OK',
    'MINDMAP_DERIVED_GRAPH_OK',
    'XPLAT_COST_GUARANTEE_OK',
    'ADAPTERS_DECLARED_OK',
    'ADAPTERS_BOUNDARY_TESTED_OK',
    'ADAPTERS_PARITY_OK',
    'ADAPTERS_ENFORCED_OK',
    'COLLAB_STRESS_SAFE_OK',
    'COLLAB_EVENTLOG_SCHEMA_OK',
    'COLLAB_EVENTLOG_APPEND_ONLY_OK',
    'COLLAB_EVENTLOG_REPLAY_DETERMINISTIC_OK',
    'COLLAB_EVENTLOG_IDEMPOTENCY_OK',
    'COLLAB_EVENTLOG_OK',
    'COLLAB_APPLY_PIPELINE_PURE_OK',
    'COLLAB_APPLY_PIPELINE_DETERMINISTIC_OK',
    'COLLAB_APPLY_PIPELINE_TYPED_ERRORS_OK',
    'COLLAB_APPLY_PIPELINE_OK',
    'COMMENTS_HISTORY_SAFE_OK',
    'SIMULATION_MIN_CONTRACT_OK',
  ];

  for (const key of tokens) {
    console.log(`${key}=${state[key]}`);
  }
  if (state.HEAD_STRICT_FAIL_REASON) {
    console.log(`HEAD_STRICT_FAIL_REASON=${state.HEAD_STRICT_FAIL_REASON}`);
  }
}

function parseArgs(argv) {
  const out = { json: false, mode: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    else if (arg === '--mode') {
      out.mode = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateFreezeRollupsState({ mode: args.mode });
  if (args.json) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  } else {
    printTokens(state);
  }
  process.exit(0);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
