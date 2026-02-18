#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  hashNormalizedConfig,
  normalizeMenuConfigPipeline,
} = require('../../src/menu/menu-config-normalizer.js');
const {
  DEFAULT_ARTIFACT_PATH,
  DEFAULT_LOCK_PATH,
  FAIL_SIGNAL_MENU_ARTIFACT,
  buildMenuArtifactLockDocument,
  hashFileSha256,
  resolveModeFromInput,
  toRepoRelativePath,
} = require('../../src/menu/menu-artifact-lock.js');

const MODE_RELEASE = 'release';
const MODE_PROMOTION = 'promotion';
const RESULT_PASS = 'PASS';
const RESULT_WARN = 'WARN';
const RESULT_FAIL = 'FAIL';
const FAIL_SIGNAL_SNAPSHOT_MISMATCH = 'E_MENU_SNAPSHOT_MISMATCH';
const FAIL_SIGNAL_RUNTIME_ARTIFACT_DIVERGENCE = 'E_MENU_RUNTIME_ARTIFACT_DIVERGENCE';

const DEFAULT_IN_PATH = 'src/menu/menu-config.v2.example.json';
const DEFAULT_CONTEXT_PATH = 'test/fixtures/menu/context.default.json';
const DEFAULT_SNAPSHOT_REGISTRY_PATH = 'docs/OPS/STATUS/MENU_SNAPSHOT_REGISTRY.json';
const DEFAULT_SNAPSHOT_ID = 'menu-default-desktop-minimal';

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    inPath: '',
    outPath: '',
    contextPath: '',
    json: false,
    mode: '',
    snapshotCreate: false,
    snapshotCheck: false,
    snapshotId: '',
    snapshotRegistryPath: '',
    exportArtifact: false,
    lockArtifact: false,
    lockPath: '',
    runtimeEquivalentCheck: false,
    artifactPath: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = normalizeString(argv[i]);
    if (!arg) continue;

    if (arg === '--json') {
      out.json = true;
      continue;
    }
    if (arg === '--snapshot-create') {
      out.snapshotCreate = true;
      continue;
    }
    if (arg === '--snapshot-check') {
      out.snapshotCheck = true;
      continue;
    }
    if (arg === '--export-artifact') {
      out.exportArtifact = true;
      continue;
    }
    if (arg === '--lock-artifact') {
      out.lockArtifact = true;
      continue;
    }
    if (arg === '--runtime-equivalent-check') {
      out.runtimeEquivalentCheck = true;
      continue;
    }
    if (arg === '--in' && i + 1 < argv.length) {
      out.inPath = normalizeString(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith('--in=')) {
      out.inPath = normalizeString(arg.slice('--in='.length));
      continue;
    }
    if (arg === '--out' && i + 1 < argv.length) {
      out.outPath = normalizeString(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith('--out=')) {
      out.outPath = normalizeString(arg.slice('--out='.length));
      continue;
    }
    if (arg === '--context' && i + 1 < argv.length) {
      out.contextPath = normalizeString(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith('--context=')) {
      out.contextPath = normalizeString(arg.slice('--context='.length));
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
    if (arg === '--snapshot-id' && i + 1 < argv.length) {
      out.snapshotId = normalizeString(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith('--snapshot-id=')) {
      out.snapshotId = normalizeString(arg.slice('--snapshot-id='.length));
      continue;
    }
    if (arg === '--snapshot-registry' && i + 1 < argv.length) {
      out.snapshotRegistryPath = normalizeString(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith('--snapshot-registry=')) {
      out.snapshotRegistryPath = normalizeString(arg.slice('--snapshot-registry='.length));
      continue;
    }
    if (arg === '--lock-path' && i + 1 < argv.length) {
      out.lockPath = normalizeString(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith('--lock-path=')) {
      out.lockPath = normalizeString(arg.slice('--lock-path='.length));
      continue;
    }
    if (arg === '--artifact' && i + 1 < argv.length) {
      out.artifactPath = normalizeString(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith('--artifact=')) {
      out.artifactPath = normalizeString(arg.slice('--artifact='.length));
    }
  }

  return out;
}

function stableSortObject(value) {
  if (Array.isArray(value)) return value.map((entry) => stableSortObject(entry));
  if (!value || typeof value !== 'object') return value;
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
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return readJson(filePath);
  } catch {
    return null;
  }
}

function createFailure(code, message, details = {}) {
  return {
    ok: false,
    code,
    message,
    ...details,
  };
}

function resolveSnapshotId(rawSnapshotId) {
  const snapshotId = normalizeString(rawSnapshotId);
  return snapshotId || DEFAULT_SNAPSHOT_ID;
}

function resolveNormalizeInput(input = {}) {
  const snapshotMode = input.snapshotCreate === true || input.snapshotCheck === true;
  const exportMode = input.exportArtifact === true;
  const runtimeEquivalentMode = input.runtimeEquivalentCheck === true;
  const inPathRaw = normalizeString(input.inPath);
  const contextPathRaw = normalizeString(input.contextPath);
  const outPathRaw = normalizeString(input.outPath);

  const fallbackRequired = snapshotMode || exportMode || runtimeEquivalentMode;
  return {
    inPath: inPathRaw || (fallbackRequired ? DEFAULT_IN_PATH : ''),
    contextPath: contextPathRaw || (fallbackRequired ? DEFAULT_CONTEXT_PATH : ''),
    outPath: outPathRaw,
    snapshotMode,
    exportMode,
    runtimeEquivalentMode,
  };
}

function resolveSnapshotRegistryPath(rawPath) {
  return path.resolve(normalizeString(rawPath) || DEFAULT_SNAPSHOT_REGISTRY_PATH);
}

function resolveLockPath(rawPath) {
  return path.resolve(normalizeString(rawPath) || DEFAULT_LOCK_PATH);
}

function resolveArtifactOutputPath(rawPath) {
  return path.resolve(normalizeString(rawPath) || DEFAULT_ARTIFACT_PATH);
}

function resolveCurrentCommit(cwd) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd,
    encoding: 'utf8',
  });
  if (result.status !== 0) return '';
  return normalizeString(result.stdout);
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSnapshotEntry(rawEntry) {
  if (!isObjectRecord(rawEntry)) return null;

  const id = normalizeString(rawEntry.id);
  const normalizedHashSha256 = normalizeString(rawEntry.normalizedHashSha256).toLowerCase();
  const contextHashSha256 = normalizeString(rawEntry.contextHashSha256).toLowerCase();
  const createdAt = normalizeString(rawEntry.createdAt);
  const createdFromCommit = normalizeString(rawEntry.createdFromCommit);

  if (!id) return null;
  if (!/^[0-9a-f]{64}$/u.test(normalizedHashSha256)) return null;
  if (!/^[0-9a-f]{64}$/u.test(contextHashSha256)) return null;
  if (!createdAt) return null;

  return {
    id,
    normalizedHashSha256,
    contextHashSha256,
    createdAt,
    createdFromCommit,
  };
}

function normalizeSnapshotRegistryDoc(rawDoc = {}) {
  const snapshotsRaw = Array.isArray(rawDoc.snapshots) ? rawDoc.snapshots : [];
  const dedupe = new Map();

  for (const rawEntry of snapshotsRaw) {
    const normalizedEntry = normalizeSnapshotEntry(rawEntry);
    if (!normalizedEntry) continue;
    dedupe.set(normalizedEntry.id, normalizedEntry);
  }

  const snapshots = [...dedupe.values()].sort((a, b) => a.id.localeCompare(b.id));
  return {
    schemaVersion: 1,
    snapshots,
  };
}

function readSnapshotRegistry(snapshotRegistryPath) {
  if (!fs.existsSync(snapshotRegistryPath)) {
    return {
      ok: true,
      registry: {
        schemaVersion: 1,
        snapshots: [],
      },
    };
  }

  try {
    const rawDoc = readJson(snapshotRegistryPath);
    return {
      ok: true,
      registry: normalizeSnapshotRegistryDoc(rawDoc),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      registry: null,
    };
  }
}

function writeSnapshotRegistry(snapshotRegistryPath, registryDoc) {
  writeJson(snapshotRegistryPath, normalizeSnapshotRegistryDoc(registryDoc));
}

function findSnapshotEntry(registryDoc, snapshotId) {
  if (!isObjectRecord(registryDoc) || !Array.isArray(registryDoc.snapshots)) return null;
  return registryDoc.snapshots.find((row) => row && row.id === snapshotId) || null;
}

function runMenuConfigNormalize(input = {}) {
  const resolvedInput = resolveNormalizeInput(input);
  const inPath = normalizeString(resolvedInput.inPath);
  const outPath = normalizeString(resolvedInput.outPath);
  const contextPath = normalizeString(resolvedInput.contextPath);

  if (!inPath) {
    return createFailure('E_MENU_NORMALIZE_ARGS', '--in is required');
  }

  const absInPath = path.resolve(inPath);
  const absOutPath = outPath
    ? path.resolve(outPath)
    : path.join(os.tmpdir(), `menu-normalized-${process.pid}.json`);
  const absContextPath = contextPath ? path.resolve(contextPath) : '';

  let baseConfig;
  try {
    baseConfig = readJson(absInPath);
  } catch (error) {
    return createFailure('E_MENU_NORMALIZE_INPUT_READ', `Cannot read input config: ${error.message}`, {
      inPath: absInPath,
    });
  }

  let context = {};
  if (absContextPath) {
    try {
      context = readJson(absContextPath);
    } catch (error) {
      return createFailure('E_MENU_NORMALIZE_CONTEXT_READ', `Cannot read context config: ${error.message}`, {
        contextPath: absContextPath,
      });
    }
  }

  const state = normalizeMenuConfigPipeline({
    baseConfig,
    overlays: [],
    context,
    baseSourceRef: absInPath,
  });

  if (!state.ok || !state.normalizedConfig) {
    return createFailure(
      'E_MENU_NORMALIZATION_DRIFT',
      'Menu normalization failed.',
      {
        inPath: absInPath,
        outPath: absOutPath,
        diagnostics: state.diagnostics,
      },
    );
  }

  const normalizedHashSha256 = hashNormalizedConfig(state.normalizedConfig);
  const contextHashSha256 = sha256Hex(stableStringify(context));
  const outputDoc = {
    schemaVersion: 1,
    normalizedShapeVersion: state.normalizedConfig.normalizedShapeVersion,
    normalizedHashSha256,
    contextHashSha256,
    normalizedConfig: state.normalizedConfig,
    diagnostics: state.diagnostics,
  };

  try {
    writeJson(absOutPath, outputDoc);
  } catch (error) {
    return createFailure('E_MENU_NORMALIZE_OUTPUT_WRITE', `Cannot write output config: ${error.message}`, {
      outPath: absOutPath,
    });
  }

  return {
    ok: true,
    inPath: absInPath,
    outPath: absOutPath,
    contextPath: absContextPath || '',
    normalizedHashSha256,
    contextHashSha256,
    diagnostics: state.diagnostics,
    normalizedItemCount: Array.isArray(state.normalizedConfig.menus)
      ? state.normalizedConfig.menus.length
      : 0,
    output: outputDoc,
  };
}

function evaluateSnapshotResult(mode, hasMismatch) {
  if (!hasMismatch) {
    return {
      result: RESULT_PASS,
      exitCode: 0,
      failSignalCode: '',
    };
  }

  if (mode === MODE_PROMOTION) {
    return {
      result: RESULT_FAIL,
      exitCode: 1,
      failSignalCode: FAIL_SIGNAL_SNAPSHOT_MISMATCH,
    };
  }

  return {
    result: RESULT_WARN,
    exitCode: 0,
    failSignalCode: FAIL_SIGNAL_SNAPSHOT_MISMATCH,
  };
}

function evaluateSnapshotMatch({
  mode,
  snapshotId,
  snapshotRegistryPath,
  normalizedHashSha256,
  contextHashSha256,
}) {
  const registryState = readSnapshotRegistry(snapshotRegistryPath);
  if (!registryState.ok || !registryState.registry) {
    const mismatchOutcome = evaluateSnapshotResult(mode, true);
    return {
      ok: mismatchOutcome.exitCode === 0,
      result: mismatchOutcome.result,
      exitCode: mismatchOutcome.exitCode,
      failSignalCode: mismatchOutcome.failSignalCode,
      snapshotExists: false,
      snapshotEntry: null,
      mismatch: {
        reason: 'SNAPSHOT_REGISTRY_UNREADABLE',
      },
    };
  }

  const snapshotEntry = findSnapshotEntry(registryState.registry, snapshotId);
  const expectedNormalizedHash = snapshotEntry ? normalizeString(snapshotEntry.normalizedHashSha256).toLowerCase() : '';
  const expectedContextHash = snapshotEntry ? normalizeString(snapshotEntry.contextHashSha256).toLowerCase() : '';

  const hashMismatch = expectedNormalizedHash !== normalizedHashSha256
    || expectedContextHash !== contextHashSha256;
  const snapshotMissing = !snapshotEntry;
  const hasMismatch = snapshotMissing || hashMismatch;
  const mismatchOutcome = evaluateSnapshotResult(mode, hasMismatch);

  return {
    ok: mismatchOutcome.exitCode === 0,
    result: mismatchOutcome.result,
    exitCode: mismatchOutcome.exitCode,
    failSignalCode: mismatchOutcome.failSignalCode,
    snapshotExists: !snapshotMissing,
    snapshotEntry,
    mismatch: hasMismatch
      ? {
        reason: snapshotMissing ? 'SNAPSHOT_ID_NOT_FOUND' : 'SNAPSHOT_HASH_MISMATCH',
        expectedNormalizedHashSha256: expectedNormalizedHash,
        actualNormalizedHashSha256: normalizedHashSha256,
        expectedContextHashSha256: expectedContextHash,
        actualContextHashSha256: contextHashSha256,
      }
      : null,
  };
}

function collectCanonicalCommandsFromMenus(menus) {
  const commands = new Set();

  function walk(nodes) {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      const commandId = normalizeString(node.canonicalCmdId);
      if (commandId) commands.add(commandId);
      if (Array.isArray(node.items)) walk(node.items);
    }
  }

  walk(menus);
  return [...commands].sort((a, b) => a.localeCompare(b));
}

function collectSourceRefsFromMenus(menus) {
  const refs = new Set();
  const repoRoot = process.cwd();

  function walk(nodes) {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      if (Array.isArray(node.sourceRefs)) {
        for (const sourceRef of node.sourceRefs) {
          let normalized = normalizeString(sourceRef);
          if (normalized && path.isAbsolute(normalized)) {
            const repoRelative = toRepoRelativePath(normalized, repoRoot);
            if (repoRelative) normalized = repoRelative;
          }
          if (normalized) refs.add(normalized);
        }
      }
      if (Array.isArray(node.items)) walk(node.items);
    }
  }

  walk(menus);
  return [...refs].sort((a, b) => a.localeCompare(b));
}

function runSnapshotCreate(input = {}) {
  const mode = resolveModeFromInput(input.mode);
  const snapshotId = resolveSnapshotId(input.snapshotId);
  const snapshotRegistryPath = resolveSnapshotRegistryPath(input.snapshotRegistryPath);
  const normalizeState = runMenuConfigNormalize({
    ...input,
    snapshotCreate: true,
  });

  if (!normalizeState.ok) {
    return {
      ...normalizeState,
      operation: 'snapshot-create',
      mode,
      snapshotId,
      snapshotRegistryPath,
      result: RESULT_FAIL,
      exitCode: 1,
      failSignalCode: '',
    };
  }

  const registryState = readSnapshotRegistry(snapshotRegistryPath);
  if (!registryState.ok || !registryState.registry) {
    return createFailure(
      'E_MENU_SNAPSHOT_REGISTRY_READ',
      `Cannot read snapshot registry: ${registryState.error || 'unknown error'}`,
      {
        operation: 'snapshot-create',
        mode,
        snapshotId,
        snapshotRegistryPath,
        exitCode: 1,
      },
    );
  }

  const registryDoc = registryState.registry;
  const nowIso = new Date().toISOString();
  const createdFromCommit = resolveCurrentCommit(process.cwd());

  const updatedSnapshots = registryDoc.snapshots.filter((entry) => entry.id !== snapshotId);
  updatedSnapshots.push({
    id: snapshotId,
    normalizedHashSha256: normalizeState.normalizedHashSha256,
    contextHashSha256: normalizeState.contextHashSha256,
    createdAt: nowIso,
    createdFromCommit,
  });

  const nextRegistry = {
    schemaVersion: 1,
    snapshots: updatedSnapshots.sort((a, b) => a.id.localeCompare(b.id)),
  };

  try {
    writeSnapshotRegistry(snapshotRegistryPath, nextRegistry);
  } catch (error) {
    return createFailure('E_MENU_SNAPSHOT_REGISTRY_WRITE', `Cannot write snapshot registry: ${error.message}`, {
      operation: 'snapshot-create',
      mode,
      snapshotId,
      snapshotRegistryPath,
      exitCode: 1,
    });
  }

  const entry = findSnapshotEntry(nextRegistry, snapshotId);

  return {
    ok: true,
    operation: 'snapshot-create',
    mode,
    snapshotId,
    snapshotRegistryPath,
    result: RESULT_PASS,
    exitCode: 0,
    failSignalCode: '',
    inPath: normalizeState.inPath,
    outPath: normalizeState.outPath,
    contextPath: normalizeState.contextPath,
    normalizedHashSha256: normalizeState.normalizedHashSha256,
    contextHashSha256: normalizeState.contextHashSha256,
    snapshotEntry: entry,
    diagnostics: normalizeState.diagnostics,
  };
}

function runSnapshotCheck(input = {}) {
  const mode = resolveModeFromInput(input.mode);
  const snapshotId = resolveSnapshotId(input.snapshotId);
  const snapshotRegistryPath = resolveSnapshotRegistryPath(input.snapshotRegistryPath);
  const normalizeState = runMenuConfigNormalize({
    ...input,
    snapshotCheck: true,
  });

  if (!normalizeState.ok) {
    return {
      ...normalizeState,
      operation: 'snapshot-check',
      mode,
      snapshotId,
      snapshotRegistryPath,
      result: RESULT_FAIL,
      exitCode: 1,
      failSignalCode: '',
    };
  }

  const snapshotState = evaluateSnapshotMatch({
    mode,
    snapshotId,
    snapshotRegistryPath,
    normalizedHashSha256: normalizeState.normalizedHashSha256,
    contextHashSha256: normalizeState.contextHashSha256,
  });

  return {
    ok: snapshotState.ok,
    operation: 'snapshot-check',
    mode,
    snapshotId,
    snapshotRegistryPath,
    result: snapshotState.result,
    exitCode: snapshotState.exitCode,
    failSignalCode: snapshotState.failSignalCode,
    inPath: normalizeState.inPath,
    outPath: normalizeState.outPath,
    contextPath: normalizeState.contextPath,
    normalizedHashSha256: normalizeState.normalizedHashSha256,
    contextHashSha256: normalizeState.contextHashSha256,
    snapshotExists: snapshotState.snapshotExists,
    snapshotEntry: snapshotState.snapshotEntry,
    mismatch: snapshotState.mismatch,
    diagnostics: normalizeState.diagnostics,
  };
}

function runExportArtifact(input = {}) {
  const mode = resolveModeFromInput(input.mode);
  const snapshotId = resolveSnapshotId(input.snapshotId);
  const snapshotRegistryPath = resolveSnapshotRegistryPath(input.snapshotRegistryPath);
  const artifactPath = resolveArtifactOutputPath(input.outPath);
  const lockPath = resolveLockPath(input.lockPath);
  const normalizeState = runMenuConfigNormalize({
    ...input,
    exportArtifact: true,
    outPath: path.join(os.tmpdir(), `menu-normalized-export.${process.pid}.json`),
  });

  if (!normalizeState.ok) {
    return {
      ...normalizeState,
      operation: 'export-artifact',
      mode,
      snapshotId,
      artifactPath,
      lockPath,
      result: RESULT_FAIL,
      exitCode: 1,
    };
  }

  const snapshotState = evaluateSnapshotMatch({
    mode,
    snapshotId,
    snapshotRegistryPath,
    normalizedHashSha256: normalizeState.normalizedHashSha256,
    contextHashSha256: normalizeState.contextHashSha256,
  });

  if (snapshotState.result === RESULT_FAIL) {
    return {
      ok: false,
      operation: 'export-artifact',
      mode,
      snapshotId,
      artifactPath,
      lockPath,
      snapshotRegistryPath,
      result: RESULT_FAIL,
      exitCode: 1,
      failSignalCode: snapshotState.failSignalCode,
      snapshotCheckResult: snapshotState.result,
      snapshotMismatch: snapshotState.mismatch,
      normalizedHashSha256: normalizeState.normalizedHashSha256,
      contextHashSha256: normalizeState.contextHashSha256,
      diagnostics: normalizeState.diagnostics,
    };
  }

  const normalizedConfig = normalizeState.output.normalizedConfig;
  const menus = Array.isArray(normalizedConfig.menus) ? normalizedConfig.menus : [];
  const sourceRefs = collectSourceRefsFromMenus(menus);
  const commands = collectCanonicalCommandsFromMenus(menus);
  const existingArtifactDoc = readJsonIfExists(artifactPath);
  const generatedFromCommit = resolveCurrentCommit(process.cwd());
  let generatedAt = new Date().toISOString();
  let generatedFromCommitForArtifact = generatedFromCommit;

  if (existingArtifactDoc && isObjectRecord(existingArtifactDoc)) {
    const sameSemanticPayload = normalizeString(existingArtifactDoc.snapshotId) === snapshotId
      && normalizeString(existingArtifactDoc.normalizedHashSha256).toLowerCase() === normalizeState.normalizedHashSha256
      && normalizeString(existingArtifactDoc?.context?.contextHashSha256).toLowerCase() === normalizeState.contextHashSha256
      && stableStringify(Array.isArray(existingArtifactDoc.sourceRefs) ? existingArtifactDoc.sourceRefs : []) === stableStringify(sourceRefs)
      && stableStringify(Array.isArray(existingArtifactDoc.commands) ? existingArtifactDoc.commands : []) === stableStringify(commands)
      && stableStringify(Array.isArray(existingArtifactDoc.menus) ? existingArtifactDoc.menus : []) === stableStringify(menus);
    if (sameSemanticPayload) {
      generatedAt = normalizeString(existingArtifactDoc.generatedAt) || generatedAt;
      generatedFromCommitForArtifact = normalizeString(existingArtifactDoc.generatedFromCommit) || generatedFromCommitForArtifact;
    }
  }

  const artifactDoc = {
    schemaVersion: 1,
    snapshotId,
    normalizedHashSha256: normalizeState.normalizedHashSha256,
    generatedAt,
    generatedFromCommit: generatedFromCommitForArtifact,
    context: {
      contextHashSha256: normalizeState.contextHashSha256,
      contextRef: normalizeState.contextPath
        ? toRepoRelativePath(normalizeState.contextPath, process.cwd())
        : '',
    },
    sourceRefs,
    commands,
    menus,
  };

  const existingArtifactStable = existingArtifactDoc ? stableStringify(existingArtifactDoc) : '';
  const nextArtifactStable = stableStringify(artifactDoc);
  if (existingArtifactStable !== nextArtifactStable) {
    try {
      writeJson(artifactPath, artifactDoc);
    } catch (error) {
      return createFailure('E_MENU_ARTIFACT_WRITE', `Cannot write menu artifact: ${error.message}`, {
        operation: 'export-artifact',
        mode,
        snapshotId,
        artifactPath,
        lockPath,
        exitCode: 1,
      });
    }
  }

  let artifactBytesSha256 = '';
  try {
    artifactBytesSha256 = hashFileSha256(artifactPath);
  } catch (error) {
    return createFailure('E_MENU_ARTIFACT_HASH', `Cannot hash menu artifact: ${error.message}`, {
      operation: 'export-artifact',
      mode,
      snapshotId,
      artifactPath,
      lockPath,
      exitCode: 1,
    });
  }

  let lockWritten = false;
  let lockSkippedReason = '';
  if (input.lockArtifact === true) {
    if (snapshotState.result === RESULT_PASS) {
      const existingLockDoc = readJsonIfExists(lockPath);
      let lockDoc = buildMenuArtifactLockDocument({
        repoRoot: process.cwd(),
        artifactPath,
        normalizedHashSha256: normalizeState.normalizedHashSha256,
        artifactBytesSha256,
        snapshotId,
        lockedAt: new Date().toISOString(),
        lockedFromCommit: generatedFromCommit,
      });

      if (existingLockDoc && isObjectRecord(existingLockDoc)) {
        const sameLockPayload = normalizeString(existingLockDoc.artifactPath) === normalizeString(lockDoc.artifactPath)
          && normalizeString(existingLockDoc.snapshotId) === snapshotId
          && normalizeString(existingLockDoc.normalizedHashSha256).toLowerCase() === normalizeState.normalizedHashSha256
          && normalizeString(existingLockDoc.artifactBytesSha256).toLowerCase() === artifactBytesSha256;
        if (sameLockPayload) {
          lockDoc = {
            ...lockDoc,
            lockedAt: normalizeString(existingLockDoc.lockedAt) || lockDoc.lockedAt,
            lockedFromCommit: normalizeString(existingLockDoc.lockedFromCommit) || lockDoc.lockedFromCommit,
          };
        }
      }

      const existingLockStable = existingLockDoc ? stableStringify(existingLockDoc) : '';
      const nextLockStable = stableStringify(lockDoc);
      if (existingLockStable !== nextLockStable) {
        try {
          writeJson(lockPath, lockDoc);
          lockWritten = true;
        } catch (error) {
          return createFailure('E_MENU_ARTIFACT_LOCK_WRITE', `Cannot write menu lock: ${error.message}`, {
            operation: 'export-artifact',
            mode,
            snapshotId,
            artifactPath,
            lockPath,
            exitCode: 1,
          });
        }
      }
    } else {
      lockSkippedReason = 'SNAPSHOT_CHECK_WARN';
    }
  }

  return {
    ok: true,
    operation: 'export-artifact',
    mode,
    snapshotId,
    snapshotRegistryPath,
    artifactPath,
    lockPath,
    lockWritten,
    lockSkippedReason,
    snapshotCheckResult: snapshotState.result,
    snapshotMismatch: snapshotState.mismatch,
    result: snapshotState.result === RESULT_WARN ? RESULT_WARN : RESULT_PASS,
    exitCode: 0,
    failSignalCode: snapshotState.result === RESULT_WARN
      ? snapshotState.failSignalCode
      : '',
    normalizedHashSha256: normalizeState.normalizedHashSha256,
    artifactBytesSha256,
    contextHashSha256: normalizeState.contextHashSha256,
    sourceRefs,
    commandsCount: commands.length,
    menusCount: menus.length,
    diagnostics: normalizeState.diagnostics,
  };
}

function evaluateRuntimeEquivalentResult(mode, hasMismatch) {
  if (!hasMismatch) {
    return {
      result: RESULT_PASS,
      exitCode: 0,
      failSignalCode: '',
    };
  }
  if (mode === MODE_PROMOTION) {
    return {
      result: RESULT_FAIL,
      exitCode: 1,
      failSignalCode: FAIL_SIGNAL_RUNTIME_ARTIFACT_DIVERGENCE,
    };
  }
  return {
    result: RESULT_WARN,
    exitCode: 0,
    failSignalCode: FAIL_SIGNAL_RUNTIME_ARTIFACT_DIVERGENCE,
  };
}

function runRuntimeEquivalentCheck(input = {}) {
  const mode = resolveModeFromInput(input.mode);
  const artifactPath = resolveArtifactOutputPath(input.artifactPath);
  const normalizeState = runMenuConfigNormalize({
    ...input,
    runtimeEquivalentCheck: true,
    outPath: path.join(os.tmpdir(), `menu-runtime-equivalent.${process.pid}.json`),
  });
  if (!normalizeState.ok) {
    return {
      ...normalizeState,
      operation: 'runtime-equivalent-check',
      mode,
      artifactPath,
      result: RESULT_FAIL,
      exitCode: 1,
      failSignalCode: normalizeState.code === 'E_MENU_NORMALIZATION_DRIFT'
        ? 'E_MENU_NORMALIZATION_DRIFT'
        : '',
      expectedHash: '',
      actualHash: '',
      mismatch: true,
      contextHash: '',
    };
  }

  let artifactDoc = null;
  let artifactReadError = '';
  try {
    artifactDoc = readJson(artifactPath);
  } catch (error) {
    artifactReadError = error instanceof Error ? error.message : String(error);
  }

  const expectedHash = normalizeString(normalizeState.normalizedHashSha256).toLowerCase();
  const actualHash = normalizeString(artifactDoc && artifactDoc.normalizedHashSha256).toLowerCase();
  const mismatch = !actualHash || actualHash !== expectedHash;
  const outcome = evaluateRuntimeEquivalentResult(mode, mismatch);

  return {
    ok: outcome.exitCode === 0,
    operation: 'runtime-equivalent-check',
    mode,
    artifactPath,
    inPath: normalizeState.inPath,
    contextPath: normalizeState.contextPath,
    expectedHash,
    actualHash,
    mismatch,
    contextHash: normalizeState.contextHashSha256,
    artifactReadError,
    result: outcome.result,
    exitCode: outcome.exitCode,
    failSignalCode: outcome.failSignalCode,
  };
}

function printHuman(state) {
  if (state.operation === 'snapshot-create' || state.operation === 'snapshot-check') {
    console.log(`MENU_SNAPSHOT_OP=${state.operation}`);
    console.log(`MENU_SNAPSHOT_ID=${state.snapshotId || ''}`);
    console.log(`MENU_SNAPSHOT_MODE=${state.mode || MODE_RELEASE}`);
    console.log(`MENU_SNAPSHOT_RESULT=${state.result || RESULT_FAIL}`);
    console.log(`MENU_SNAPSHOT_REGISTRY=${state.snapshotRegistryPath || ''}`);
    if (state.inPath) console.log(`MENU_SNAPSHOT_IN=${state.inPath}`);
    if (state.outPath) console.log(`MENU_SNAPSHOT_OUT=${state.outPath}`);
    if (state.normalizedHashSha256) console.log(`MENU_SNAPSHOT_HASH=${state.normalizedHashSha256}`);
    if (state.contextHashSha256) console.log(`MENU_SNAPSHOT_CONTEXT_HASH=${state.contextHashSha256}`);
    if (state.failSignalCode) console.log(`MENU_SNAPSHOT_FAIL_SIGNAL=${state.failSignalCode}`);
    if (state.mismatch) console.log(`MENU_SNAPSHOT_MISMATCH=${JSON.stringify(state.mismatch)}`);
    return;
  }

  if (state.operation === 'export-artifact') {
    console.log(`MENU_ARTIFACT_EXPORT_RESULT=${state.result}`);
    console.log(`MENU_ARTIFACT_EXPORT_MODE=${state.mode}`);
    console.log(`MENU_ARTIFACT_EXPORT_SNAPSHOT_ID=${state.snapshotId}`);
    console.log(`MENU_ARTIFACT_EXPORT_ARTIFACT=${state.artifactPath}`);
    console.log(`MENU_ARTIFACT_EXPORT_LOCK=${state.lockPath}`);
    console.log(`MENU_ARTIFACT_EXPORT_HASH=${state.normalizedHashSha256 || ''}`);
    console.log(`MENU_ARTIFACT_EXPORT_BYTES_HASH=${state.artifactBytesSha256 || ''}`);
    console.log(`MENU_ARTIFACT_EXPORT_LOCK_WRITTEN=${state.lockWritten ? 1 : 0}`);
    if (state.lockSkippedReason) console.log(`MENU_ARTIFACT_EXPORT_LOCK_SKIPPED_REASON=${state.lockSkippedReason}`);
    if (state.snapshotCheckResult) console.log(`MENU_ARTIFACT_EXPORT_SNAPSHOT_CHECK=${state.snapshotCheckResult}`);
    if (state.failSignalCode) console.log(`MENU_ARTIFACT_EXPORT_FAIL_SIGNAL=${state.failSignalCode}`);
    if (state.snapshotMismatch) console.log(`MENU_ARTIFACT_EXPORT_SNAPSHOT_MISMATCH=${JSON.stringify(state.snapshotMismatch)}`);
    return;
  }

  if (state.operation === 'runtime-equivalent-check') {
    console.log(`MENU_RUNTIME_EQUIVALENT_RESULT=${state.result}`);
    console.log(`MENU_RUNTIME_EQUIVALENT_MODE=${state.mode}`);
    console.log(`MENU_RUNTIME_EQUIVALENT_OK=${state.ok ? 1 : 0}`);
    console.log(`MENU_RUNTIME_EQUIVALENT_ARTIFACT=${state.artifactPath || ''}`);
    console.log(`MENU_RUNTIME_EQUIVALENT_EXPECTED_HASH=${state.expectedHash || ''}`);
    console.log(`MENU_RUNTIME_EQUIVALENT_ACTUAL_HASH=${state.actualHash || ''}`);
    console.log(`MENU_RUNTIME_EQUIVALENT_MISMATCH=${state.mismatch ? 1 : 0}`);
    console.log(`MENU_RUNTIME_EQUIVALENT_CONTEXT_HASH=${state.contextHash || ''}`);
    if (state.failSignalCode) console.log(`MENU_RUNTIME_EQUIVALENT_FAIL_SIGNAL=${state.failSignalCode}`);
    if (state.artifactReadError) console.log(`MENU_RUNTIME_EQUIVALENT_ARTIFACT_ERROR=${state.artifactReadError}`);
    return;
  }

  if (!state.ok) {
    console.log('MENU_CONFIG_NORMALIZE_OK=0');
    console.log(`MENU_CONFIG_NORMALIZE_CODE=${state.code}`);
    console.log(`MENU_CONFIG_NORMALIZE_MESSAGE=${state.message}`);
    if (state.inPath) console.log(`MENU_CONFIG_NORMALIZE_IN=${state.inPath}`);
    if (state.outPath) console.log(`MENU_CONFIG_NORMALIZE_OUT=${state.outPath}`);
    return;
  }

  console.log('MENU_CONFIG_NORMALIZE_OK=1');
  console.log(`MENU_CONFIG_NORMALIZE_IN=${state.inPath}`);
  console.log(`MENU_CONFIG_NORMALIZE_OUT=${state.outPath}`);
  console.log(`MENU_CONFIG_NORMALIZE_HASH=${state.normalizedHashSha256}`);
  console.log(`MENU_CONFIG_NORMALIZE_ERRORS=${state.diagnostics.errors.length}`);
  console.log(`MENU_CONFIG_NORMALIZE_WARNINGS=${state.diagnostics.warnings.length}`);
}

function run(args) {
  if (args.runtimeEquivalentCheck && (args.snapshotCreate || args.snapshotCheck || args.exportArtifact)) {
    return createFailure(
      'E_MENU_RUNTIME_EQUIVALENT_ARGS_INVALID',
      '--runtime-equivalent-check cannot be combined with snapshot/export modes.',
      {
        exitCode: 1,
      },
    );
  }

  if (args.snapshotCreate && args.snapshotCheck) {
    return createFailure(
      'E_MENU_SNAPSHOT_ARGS_INVALID',
      'Cannot combine --snapshot-create and --snapshot-check in one call.',
      {
        exitCode: 1,
      },
    );
  }

  if (args.lockArtifact && !args.exportArtifact) {
    return createFailure(
      'E_MENU_ARTIFACT_ARGS_INVALID',
      '--lock-artifact requires --export-artifact.',
      {
        exitCode: 1,
      },
    );
  }

  if (args.exportArtifact && (args.snapshotCreate || args.snapshotCheck)) {
    return createFailure(
      'E_MENU_ARTIFACT_ARGS_INVALID',
      '--export-artifact cannot be combined with --snapshot-create/--snapshot-check.',
      {
        exitCode: 1,
      },
    );
  }

  if (args.snapshotCreate) {
    return runSnapshotCreate(args);
  }
  if (args.snapshotCheck) {
    return runSnapshotCheck(args);
  }
  if (args.exportArtifact) {
    return runExportArtifact(args);
  }
  if (args.runtimeEquivalentCheck) {
    return runRuntimeEquivalentCheck(args);
  }

  const state = runMenuConfigNormalize(args);
  return {
    ...state,
    exitCode: state.ok ? 0 : 1,
  };
}

const args = parseArgs(process.argv.slice(2));
const state = run(args);

if (args.json) {
  if (state.operation === 'snapshot-create'
    || state.operation === 'snapshot-check'
    || state.operation === 'export-artifact'
    || state.operation === 'runtime-equivalent-check') {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(state.ok ? state.output : state, null, 2)}\n`);
  }
} else {
  printHuman(state);
}

process.exit(Number.isInteger(state.exitCode) ? state.exitCode : (state.ok ? 0 : 1));

export {
  runExportArtifact,
  runMenuConfigNormalize,
  runRuntimeEquivalentCheck,
  runSnapshotCheck,
  runSnapshotCreate,
};
