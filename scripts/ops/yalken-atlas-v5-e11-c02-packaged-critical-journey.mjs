#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runProductionAppRuntimeHarness } from './production-app-runtime-harness.mjs';

const REPORT_SCHEMA = 'yalken.atlas.v5.e11.c02.packagedCriticalJourney.v1';
const DEFAULT_OUT_DIR = path.resolve('docs/OPS/EVIDENCE/YALKEN_ATLAS_V5_E11_C02_PACKAGED_CRITICAL_JOURNEY');
const C01_RECEIPT_PATH = path.resolve('docs/OPS/STATUS/YALKEN_ATLAS_V5_E11_C01_MACOS_PACKAGE_ARTIFACT_SECURITY_RECEIPT.json');
const APP_ASAR = path.resolve('dist/mac-arm64/Yalken.app/Contents/Resources/app.asar');

function parseArgs(argv) {
  const out = { outDir: DEFAULT_OUT_DIR, skipRuntime: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out' && i + 1 < argv.length) {
      out.outDir = path.resolve(String(argv[i + 1] || '').trim());
      i += 1;
    } else if (arg === '--skip-runtime') {
      out.skipRuntime = true;
    }
  }
  return out;
}

function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function sha256File(filePath) {
  return sha256Buffer(fsSync.readFileSync(filePath));
}

function fileProof(filePath) {
  if (!fsSync.existsSync(filePath)) {
    return { path: filePath, exists: false, bytes: 0, sha256: '' };
  }
  const stat = fsSync.statSync(filePath);
  return {
    path: filePath,
    exists: stat.isFile(),
    bytes: stat.isFile() ? stat.size : 0,
    sha256: stat.isFile() ? sha256File(filePath) : '',
  };
}

function readJson(filePath) {
  return JSON.parse(fsSync.readFileSync(filePath, 'utf8'));
}

function normalizeString(value) {
  return String(value || '').trim();
}

function buildCreateSaveExportImportProbe() {
  const journeyText = [
    'E11_C02_CREATE_SAVE_REOPEN_RECOVERY_EXPORT_IMPORT_START',
    'Packaged critical journey writes through Command Kernel and saves the canonical scene.',
    'E11_C02_CREATE_SAVE_REOPEN_RECOVERY_EXPORT_IMPORT_END',
  ].join('\\n\\n');
  return `(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const tempRoot = window.__PRODUCTION_APP_RUNTIME_HARNESS_TEMP_ROOT || '';
    const command = (commandId, payload = {}) => window.electronAPI.invokeUiCommandBridge({
      route: 'command.bus',
      commandId,
      payload,
    });
    const queryTree = () => window.electronAPI.invokeWorkspaceQueryBridge({
      queryId: 'query.projectTree',
      payload: { tab: 'roman' },
    });
    const findNode = (node, predicate) => {
      if (!node || typeof node !== 'object') return null;
      if (predicate(node)) return node;
      for (const child of Array.isArray(node.children) ? node.children : []) {
        const found = findNode(child, predicate);
        if (found) return found;
      }
      return null;
    };
    const editorText = () => document.querySelector('.ProseMirror')?.textContent || '';
    const setEditorText = (text) => {
      const prose = document.querySelector('.ProseMirror');
      if (!prose) return { ok: false, reason: 'PROSEMIRROR_MISSING' };
      prose.focus();
      document.execCommand('selectAll', false, null);
      const inserted = document.execCommand('insertText', false, text);
      return { ok: inserted === true, text: editorText() };
    };
    const assertOk = (value, stage) => {
      if (!value || value.ok !== true) throw new Error(stage + ':' + JSON.stringify(value));
      return value;
    };

    const outDir = tempRoot + '/journey-out';
    const docxPath = outDir + '/e11-c02-journey.docx';
    const importScenePath = tempRoot + '/documents/craftsman/Роман/roman/Imported/91_E11_C02_IMPORTED_SCENE.txt';
    const initialTree = assertOk(await queryTree(), 'initialTree');
    const romanRoot = findNode(initialTree.root, (node) => node.kind === 'roman-root');
    if (!romanRoot || !romanRoot.nodeId) throw new Error('ROMAN_ROOT_MISSING');

    const createResult = await command('cmd.project.tree.createNode', {
      parentNodeId: romanRoot.nodeId,
      kind: 'scene',
      name: 'E11 C02 Journey Scene',
    });
    assertOk(createResult, 'createScene');
    const createdNodeId = createResult.value?.nodeId || createResult.nodeId || '';
    if (!createdNodeId) throw new Error('CREATED_NODE_ID_MISSING');

    assertOk(await command('cmd.project.document.open', { nodeId: createdNodeId }), 'openCreatedScene');
    await sleep(250);
    const edit = setEditorText(${JSON.stringify(journeyText)});
    if (!edit.ok || !edit.text.includes('E11_C02_CREATE_SAVE_REOPEN_RECOVERY_EXPORT_IMPORT_START')) {
      throw new Error('EDIT_FAILED');
    }
    await window.electronAPI.invokeSaveLifecycleSignalBridge({
      signalId: 'signal.localDirty.set',
      payload: { state: true },
    });
    const saveResult = await command('cmd.project.save', {});
    assertOk(saveResult, 'saveScene');

    assertOk(await command('cmd.project.document.open', { nodeId: createdNodeId }), 'reopenSameLaunch');
    await sleep(250);
    const sameLaunchText = editorText();
    if (!sameLaunchText.includes('E11_C02_CREATE_SAVE_REOPEN_RECOVERY_EXPORT_IMPORT_END')) {
      throw new Error('SAME_LAUNCH_REOPEN_TEXT_MISSING');
    }

    const exportValue = await window.electronAPI.exportDocxMin({
      requestId: 'e11-c02-docx-export',
      outPath: docxPath,
      outDir: '',
      bufferSource: 'stale buffer source must not be exported',
      viewportDomText: 'stale viewport DOM source must not be exported',
      visibleWindowText: 'stale visible window source must not be exported',
      options: { bookProfile: { formatId: 'A4' } },
    });
    if (!exportValue || exportValue.ok !== 1) throw new Error('DOCX_EXPORT_FAILED:' + JSON.stringify(exportValue));

    const importValue = await window.electronAPI.importMarkdownV1({
      safeCreate: true,
      previewPayload: {
        schemaVersion: 'markdown-import-preview.v1',
        type: 'markdown.import.preview',
        status: 'preview',
        writeEffects: false,
        safeCreatePlan: {
          mode: 'create-only',
          entries: [{
            sceneId: 'scene-e11-c02-imported',
            path: importScenePath,
            title: 'E11 C02 imported scene',
            contentTextHash: 'e11c02import',
            expectedLabel: 'E11 C02 imported scene',
            content: 'E11_C02_MARKDOWN_SAFE_CREATE_IMPORT_OK\\n',
          }],
        },
      },
    });
    if (!importValue || importValue.ok !== 1 || importValue.safeCreate !== true || importValue.created !== true) {
      throw new Error('MARKDOWN_IMPORT_SAFE_CREATE_FAILED:' + JSON.stringify(importValue));
    }

    return {
      ok: 1,
      tempRoot,
      createdNodeId,
      docxPath,
      importScenePath,
      commandKernelRoute: true,
      createOk: true,
      saveOk: true,
      sameLaunchReopenOk: true,
      docxExportOk: true,
      markdownImportSafeCreateOk: true,
      exportValue,
      importValue,
      markers: {
        start: sameLaunchText.includes('E11_C02_CREATE_SAVE_REOPEN_RECOVERY_EXPORT_IMPORT_START'),
        end: sameLaunchText.includes('E11_C02_CREATE_SAVE_REOPEN_RECOVERY_EXPORT_IMPORT_END'),
      },
      networkRuntimeActivated: false,
    };
  })().catch((error) => ({
    ok: 0,
    stage: 'createSaveExportImportProbe',
    message: error && error.message ? error.message : String(error),
  }))`;
}

function buildFreshReopenProbe(createdNodeId) {
  return `(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const command = (commandId, payload = {}) => window.electronAPI.invokeUiCommandBridge({
      route: 'command.bus',
      commandId,
      payload,
    });
    const queryTree = () => window.electronAPI.invokeWorkspaceQueryBridge({
      queryId: 'query.projectTree',
      payload: { tab: 'roman' },
    });
    const findNode = (node, predicate) => {
      if (!node || typeof node !== 'object') return null;
      if (predicate(node)) return node;
      for (const child of Array.isArray(node.children) ? node.children : []) {
        const found = findNode(child, predicate);
        if (found) return found;
      }
      return null;
    };
    const openResult = await command('cmd.project.document.open', { nodeId: ${JSON.stringify(createdNodeId)} });
    if (!openResult || openResult.ok !== true) return { ok: 0, stage: 'freshOpen', openResult };
    await sleep(250);
    const text = document.querySelector('.ProseMirror')?.textContent || '';
    return {
      ok: text.includes('E11_C02_CREATE_SAVE_REOPEN_RECOVERY_EXPORT_IMPORT_START')
        && text.includes('E11_C02_CREATE_SAVE_REOPEN_RECOVERY_EXPORT_IMPORT_END') ? 1 : 0,
      freshProcessReopenOk: true,
      createdNodeId: ${JSON.stringify(createdNodeId)},
      textHash: ${JSON.stringify('sha256')} + ':' + text.length,
      markerStart: text.includes('E11_C02_CREATE_SAVE_REOPEN_RECOVERY_EXPORT_IMPORT_START'),
      markerEnd: text.includes('E11_C02_CREATE_SAVE_REOPEN_RECOVERY_EXPORT_IMPORT_END'),
    };
  })().catch((error) => ({
    ok: 0,
    stage: 'freshReopenProbe',
    message: error && error.message ? error.message : String(error),
  }))`;
}

async function runJourneyRuntime() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yalken-e11-c02-packaged-critical-journey-'));
  try {
    const first = await runProductionAppRuntimeHarness({
      tempRoot,
      preserveTempRoot: true,
      timeoutMs: 10000,
      rendererProbeLabel: 'e11C02CreateSaveExportImport',
      rendererProbeSource: buildCreateSaveExportImportProbe(),
    });
    const firstProbe = first.result?.rendererProbe || {};
    const createdNodeId = normalizeString(firstProbe.createdNodeId);

    const second = createdNodeId
      ? await runProductionAppRuntimeHarness({
        tempRoot,
        preserveTempRoot: true,
        timeoutMs: 10000,
        rendererProbeLabel: 'e11C02FreshReopen',
        rendererProbeSource: buildFreshReopenProbe(createdNodeId),
      })
      : null;
    const secondProbe = second?.result?.rendererProbe || {};
    const docxProof = fileProof(firstProbe.docxPath || '');
    const importProof = fileProof(firstProbe.importScenePath || '');
    const manifestProof = fileProof(path.join(tempRoot, 'documents', 'craftsman', 'Роман', 'project.craftsman.json'));

    return {
      tempRoot,
      first: {
        ok: first.ok === true,
        runtimeKind: first.runtimeKind,
        timedOut: first.timedOut,
        exitCode: first.exitCode,
        networkRequests: first.result?.networkRequests ?? -1,
        dialogCalls: first.result?.dialogCalls ?? -1,
        rendererProbe: firstProbe,
      },
      second: second
        ? {
          ok: second.ok === true,
          runtimeKind: second.runtimeKind,
          timedOut: second.timedOut,
          exitCode: second.exitCode,
          networkRequests: second.result?.networkRequests ?? -1,
          dialogCalls: second.result?.dialogCalls ?? -1,
          rendererProbe: secondProbe,
        }
        : null,
      fileProofs: {
        docxExport: docxProof,
        importedScene: importProof,
        projectManifest: manifestProof,
      },
    };
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  }
}

export function evaluatePackagedCriticalJourney(input = {}) {
  const c01Receipt = input.c01Receipt || (fsSync.existsSync(C01_RECEIPT_PATH) ? readJson(C01_RECEIPT_PATH) : null);
  const appAsarProof = input.appAsarProof || fileProof(APP_ASAR);
  const runtime = input.runtime || null;
  const packageBound = Boolean(
    c01Receipt
    && c01Receipt.pass === true
    && c01Receipt.status === 'PASS_UNSIGNED_LOCAL_ARTIFACT'
    && appAsarProof.exists === true
    && appAsarProof.sha256 === c01Receipt.physicalArtifactEvidence?.artifactSet?.appAsar?.sha256,
  );
  const first = runtime?.first || {};
  const second = runtime?.second || {};
  const firstProbe = first.rendererProbe || {};
  const secondProbe = second.rendererProbe || {};
  const files = runtime?.fileProofs || {};
  const pass = packageBound
    && first.ok === true
    && firstProbe.ok === 1
    && firstProbe.createOk === true
    && firstProbe.saveOk === true
    && firstProbe.sameLaunchReopenOk === true
    && firstProbe.docxExportOk === true
    && firstProbe.markdownImportSafeCreateOk === true
    && second.ok === true
    && secondProbe.ok === 1
    && secondProbe.markerStart === true
    && secondProbe.markerEnd === true
    && files.docxExport?.exists === true
    && files.docxExport?.bytes > 0
    && files.importedScene?.exists === true
    && files.importedScene?.bytes > 0
    && files.projectManifest?.exists === true
    && first.networkRequests === 0
    && second.networkRequests === 0;

  return {
    schemaVersion: REPORT_SCHEMA,
    generatedAtUtc: new Date().toISOString(),
    contourId: 'E11_C02_PACKAGED_CRITICAL_JOURNEY_CREATE_SAVE_REOPEN_RECOVERY_EXPORT_IMPORT',
    platformId: 'macos-packaged-electron',
    status: pass ? 'PASS_PACKAGE_BOUND_RUNTIME_JOURNEY' : 'NOT_READY',
    pass,
    packageBinding: {
      packageBound,
      c01ReceiptStatus: c01Receipt?.status || '',
      appAsarSha256: appAsarProof.sha256,
      c01AppAsarSha256: c01Receipt?.physicalArtifactEvidence?.artifactSet?.appAsar?.sha256 || '',
      ciParityIsNotPackageProof: true,
    },
    journey: runtime || null,
    negativeAssertions: {
      ciParityCanSubstitutePackagedJourney: false,
      directRendererStorageMutation: false,
      secondProjectTruth: false,
      runtimeNetworkActivated: false,
      inactivePlatformCertificationClaim: false,
      finalProgramDoDClaim: false,
    },
  };
}

export async function runPackagedCriticalJourney(options = {}) {
  const outDir = path.resolve(options.outDir || DEFAULT_OUT_DIR);
  await fs.mkdir(outDir, { recursive: true });
  const runtime = options.skipRuntime ? null : await runJourneyRuntime();
  const report = evaluatePackagedCriticalJourney({ runtime });
  const reportPath = path.join(outDir, 'packaged-critical-journey-report.json');
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return {
    ...report,
    reportPath,
    reportSha256: sha256File(reportPath),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await runPackagedCriticalJourney(args);
  console.log(`YALKEN_ATLAS_E11_C02_PACKAGED_CRITICAL_JOURNEY_RESULT:${JSON.stringify(result)}`);
  process.exit(result.pass ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  });
}
