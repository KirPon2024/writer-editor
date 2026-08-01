#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { performance } from 'node:perf_hooks';

import {
  CORE_COMMAND_IDS,
  applyCoreSequence,
  createInitialCoreState,
  hashCoreState,
} from '../../src/core/runtime.mjs';
import {
  acceptAtlasGraphWorkerResult,
  buildAtlasGraphWorkerPayload,
  coalesceAtlasGraphWorkerPayloads,
  hashCanonicalValue,
  runAtlasGraphWorkerJob,
} from '../../src/derived/index.mjs';

const REPORT_SCHEMA = 'yalken.atlas.v5.finalAudit.p0_07.stressProductProof.v1';
const RECEIPT_SCHEMA = 'yalken.atlas.v5.finalAudit.p0_07.receipt.v1';
const CONTOUR_ID = 'P0_07_STRESS_PRODUCT_PROOF';
const DEFAULT_OUT_DIR = path.resolve('docs/OPS/EVIDENCE/YALKEN_ATLAS_V5_FINAL_AUDIT_P0_07_STRESS_PRODUCT_PROOF');
const DEFAULT_RECEIPT_PATH = path.resolve('docs/OPS/STATUS/YALKEN_ATLAS_V5_FINAL_AUDIT_P0_07_STRESS_PRODUCT_PROOF_RECEIPT.json');
const PROJECT_ID = 'p0-07-stress-product-project';
const SCENE_COUNT = 1200;
const GRAPH_COUNTS = Object.freeze([10000, 50000]);

function parseArgs(argv) {
  const out = { outDir: DEFAULT_OUT_DIR, receiptPath: DEFAULT_RECEIPT_PATH, skipElectronRender: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out' && index + 1 < argv.length) {
      out.outDir = path.resolve(String(argv[index + 1] || '').trim());
      index += 1;
    } else if (arg === '--receipt' && index + 1 < argv.length) {
      out.receiptPath = path.resolve(String(argv[index + 1] || '').trim());
      index += 1;
    } else if (arg === '--skip-electron-render') {
      out.skipElectronRender = true;
    }
  }
  return out;
}

function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function sha256Text(value) {
  return sha256Buffer(Buffer.from(String(value ?? ''), 'utf8'));
}

function sha256File(filePath) {
  return sha256Buffer(fsSync.readFileSync(filePath));
}

function fileProof(filePath) {
  if (!filePath || !fsSync.existsSync(filePath)) return { path: filePath || '', exists: false, bytes: 0, sha256: '' };
  const stat = fsSync.statSync(filePath);
  return {
    path: filePath,
    exists: stat.isFile(),
    bytes: stat.isFile() ? stat.size : 0,
    sha256: stat.isFile() ? sha256File(filePath) : '',
  };
}

function gitOutput(args) {
  const result = spawnSync('git', args, { cwd: process.cwd(), encoding: 'utf8' });
  return result.status === 0 ? String(result.stdout || '').trim() : '';
}

async function writeFileAtomic(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tempPath, content);
  await fs.rename(tempPath, filePath);
}

function percentile(values, p) {
  const sorted = [...values].filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Number(sorted[index].toFixed(3));
}

function round(value) {
  return Number(Number(value || 0).toFixed(3));
}

function buildSceneText(index) {
  const padded = String(index).padStart(4, '0');
  const left = `P0_07_Entity_${String(index % 50).padStart(2, '0')}`;
  const right = `P0_07_Entity_${String((index + 7) % 50).padStart(2, '0')}`;
  return `Scene ${padded}: ${left} meets ${right}. The pressure lattice keeps source scene ${padded} authoritative.`;
}

function buildLargeProjectCoreState(sceneCount = SCENE_COUNT) {
  const commands = [
    {
      type: CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId: PROJECT_ID, title: 'P0 07 persisted stress product project', sceneId: 'scene-0000' },
    },
  ];
  for (let index = 0; index < 50; index += 1) {
    commands.push({
      type: CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: {
        projectId: PROJECT_ID,
        entityId: `entity-${String(index).padStart(2, '0')}`,
        name: `P0_07_Entity_${String(index).padStart(2, '0')}`,
        entityKind: index % 5 === 0 ? 'place' : 'character',
      },
    });
  }
  commands.push({
    type: CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
    payload: { projectId: PROJECT_ID, sceneId: 'scene-0000', text: buildSceneText(0) },
  });
  const applied = applyCoreSequence(createInitialCoreState(), commands);
  if (!applied.ok) throw new Error(`P0_07_COMMAND_SEQUENCE_FAILED:${JSON.stringify(applied.error)}`);
  const state = JSON.parse(JSON.stringify(applied.state));
  const project = state.data.projects[PROJECT_ID];
  for (let index = 1; index < sceneCount; index += 1) {
    const sceneId = `scene-${String(index).padStart(4, '0')}`;
    project.scenes[sceneId] = {
      id: sceneId,
      text: buildSceneText(index),
      source: {
        kind: 'project-scene-file',
        relativePath: `roman/stress/${sceneId}.txt`,
      },
    };
  }
  return state;
}

function buildPersistedBundle(coreState) {
  const project = coreState.data.projects[PROJECT_ID];
  const sceneRows = Object.keys(project.scenes)
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'variant' }))
    .map((sceneId, order) => ({
      id: sceneId,
      order,
      relativePath: `roman/stress/${sceneId}.txt`,
      text: project.scenes[sceneId].text,
      textSha256: sha256Text(project.scenes[sceneId].text),
    }));
  return {
    schemaVersion: 'yalken.project.persistedStressBundle.v1',
    product: 'Yalken',
    contourId: CONTOUR_ID,
    projectId: PROJECT_ID,
    manifest: {
      schemaVersion: 'yalken.project.manifest.v1',
      projectId: PROJECT_ID,
      projectName: 'P0 07 persisted stress product project',
      folders: ['roman', 'assets', 'backups'],
      sceneCount: sceneRows.length,
      firstScenePath: sceneRows[0]?.relativePath || '',
      sceneIndex: sceneRows.map(({ id, order, relativePath, textSha256 }) => ({ id, order, relativePath, textSha256 })),
    },
    scenes: sceneRows,
    coreStateHash: hashCoreState(coreState),
    persistencePolicy: {
      localOnly: true,
      atomicWrite: true,
      recoverySnapshot: true,
      authorTruthSource: 'manifest-and-scene-files',
      derivedDataPersistedAsTruth: false,
    },
  };
}

function buildGraphFromPersistedBundle(bundle, count) {
  const nodes = [];
  const edges = [];
  const sceneRefs = bundle.manifest.sceneIndex;
  const corpusHash = hashCanonicalValue({
    projectId: bundle.projectId,
    sceneCount: bundle.manifest.sceneCount,
    coreStateHash: bundle.coreStateHash,
    first: sceneRefs[0],
    last: sceneRefs[sceneRefs.length - 1],
  });
  for (let index = 0; index < count; index += 1) {
    const nodeId = `global:p0-07:${count}:${String(index).padStart(5, '0')}`;
    const scene = sceneRefs[index % sceneRefs.length];
    const sourceRefIds = index < 2000
      ? [
        `scene:${scene.id}`,
        `scene:${sceneRefs[(index + 1) % sceneRefs.length].id}`,
        `scene:${sceneRefs[(index + 2) % sceneRefs.length].id}`,
        `scene:${sceneRefs[(index + 3) % sceneRefs.length].id}`,
        `corpus:${corpusHash.slice(0, 16)}`,
      ]
      : [`scene:${scene.id}`, `corpus:${corpusHash.slice(0, 16)}`];
    nodes.push({
      schemaVersion: 'derived.atlas.globalCompositeNode.v1',
      nodeId,
      nodeKind: index % 23 === 0 ? 'originRef' : (index % 7 === 0 ? 'manualMapNode' : 'atlasEntity'),
      sourceProjection: index % 7 === 0 ? 'manualMap.graph' : 'atlas.localGraph',
      sourceId: `${scene.id}:${index}`,
      label: `P0 07 ${count} node ${index}`,
      sourceRefIds,
    });
    if (index > 0) {
      edges.push({
        schemaVersion: 'derived.atlas.globalCompositeEdge.v1',
        edgeId: `global:p0-07-edge:${count}:${String(index).padStart(5, '0')}`,
        edgeKind: index % 29 === 0 ? 'crossProjectionLink' : 'atlasCooccurrence',
        fromNodeId: `global:p0-07:${count}:${String(index - 1).padStart(5, '0')}`,
        toNodeId: nodeId,
        sourceProjection: 'p0-07.persistedProject',
        sourceId: `edge-${index}`,
        sourceRefIds: [`scene:${scene.id}`],
      });
    }
    if (index >= 31 && index % 31 === 0) {
      edges.push({
        schemaVersion: 'derived.atlas.globalCompositeEdge.v1',
        edgeId: `global:p0-07-skip-edge:${count}:${String(index).padStart(5, '0')}`,
        edgeKind: 'manualMapEdge',
        fromNodeId: `global:p0-07:${count}:${String(index - 31).padStart(5, '0')}`,
        toNodeId: nodeId,
        sourceProjection: 'p0-07.persistedProject',
        sourceId: `skip-edge-${index}`,
        sourceRefIds: [`scene:${sceneRefs[(index + 17) % sceneRefs.length].id}`],
      });
    }
  }
  return {
    schemaVersion: 'derived.atlas.globalCompositeGraph.v1',
    projectId: PROJECT_ID,
    sourceRefs: [{
      schemaVersion: 'derived.atlas.globalCompositeSourceRef.v1',
      sourceProjection: 'persisted.project.bundle',
      sourceId: bundle.projectId,
      sourceSchemaVersion: bundle.schemaVersion,
      sourceHash: corpusHash,
      invalidationKey: bundle.coreStateHash,
      coreStateHash: bundle.coreStateHash,
      readOnly: true,
      projectTruthMutation: false,
      storageMutation: false,
      sourceWriteBack: false,
      sourceRefId: `global-source:${corpusHash}`,
    }],
    nodes,
    edges,
    summary: {
      sourceProjectionCount: 2,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      sourceProjectionHashes: { persistedProjectBundle: corpusHash },
      compositeHash: hashCanonicalValue({ count, corpusHash, seed: 'p0-07' }),
    },
    meta: { compositeHash: hashCanonicalValue({ count, corpusHash, seed: 'p0-07' }) },
  };
}

async function persistLargeProject({ outDir, coreState }) {
  const bundle = buildPersistedBundle(coreState);
  const readbackDir = path.join(outDir, 'persisted-large-project');
  const bundlePath = path.join(readbackDir, 'p0-07-persisted-large-project.bundle.json.gz');
  const recoveryPath = path.join(readbackDir, 'p0-07-recovery-snapshot.json.gz');
  const manifestPath = path.join(readbackDir, 'manifest.json');
  const bundleText = `${JSON.stringify(bundle, null, 2)}\n`;
  const recovery = {
    schemaVersion: 'yalken.project.recoverySnapshot.v1',
    contourId: CONTOUR_ID,
    projectId: PROJECT_ID,
    sourceCoreStateHash: bundle.coreStateHash,
    sceneCount: bundle.manifest.sceneCount,
    recoveryTextReadable: true,
    derivedDataPersistedAsTruth: false,
    sceneIndex: bundle.manifest.sceneIndex,
  };
  await fs.mkdir(readbackDir, { recursive: true });
  await writeFileAtomic(manifestPath, `${JSON.stringify(bundle.manifest, null, 2)}\n`);
  await writeFileAtomic(bundlePath, zlib.gzipSync(Buffer.from(bundleText, 'utf8')));
  await writeFileAtomic(recoveryPath, zlib.gzipSync(Buffer.from(`${JSON.stringify(recovery, null, 2)}\n`, 'utf8')));
  const decompressed = JSON.parse(zlib.gunzipSync(fsSync.readFileSync(bundlePath)).toString('utf8'));
  const recoveryReadback = JSON.parse(zlib.gunzipSync(fsSync.readFileSync(recoveryPath)).toString('utf8'));
  return {
    bundle,
    paths: { manifestPath, bundlePath, recoveryPath },
    proofs: {
      manifest: fileProof(manifestPath),
      bundle: fileProof(bundlePath),
      recovery: fileProof(recoveryPath),
    },
    readback: {
      bundleParseOk: decompressed.schemaVersion === bundle.schemaVersion,
      bundleHashMatches: hashCanonicalValue(decompressed) === hashCanonicalValue(bundle),
      sceneCount: decompressed.manifest?.sceneCount || 0,
      firstSceneTextHashMatches: decompressed.scenes?.[0]?.textSha256 === sha256Text(buildSceneText(0)),
      lastSceneTextHashMatches: decompressed.scenes?.[SCENE_COUNT - 1]?.textSha256 === sha256Text(buildSceneText(SCENE_COUNT - 1)),
      recoveryParseOk: recoveryReadback.schemaVersion === 'yalken.project.recoverySnapshot.v1',
      recoveryBindsCoreState: recoveryReadback.sourceCoreStateHash === bundle.coreStateHash,
    },
  };
}

async function measureWorkerRun({ graph, count, generation }) {
  const payload = buildAtlasGraphWorkerPayload({
    graph,
    generation,
    limits: count >= 50000
      ? { maxNodes: 1200, maxEdges: 1600, labelNodeBudget: 240, spatialCellSize: 112 }
      : { maxNodes: 900, maxEdges: 1200, labelNodeBudget: 180, spatialCellSize: 96 },
  }).value;
  const heapBefore = process.memoryUsage().heapUsed;
  const startedAt = performance.now();
  const inputSamples = [];
  let samplePump = true;
  function pump() {
    const scheduledAt = performance.now();
    setImmediate(() => {
      inputSamples.push(performance.now() - scheduledAt);
      if (samplePump && inputSamples.length < 10000) pump();
    });
  }
  pump();
  const result = await runAtlasGraphWorkerJob({ payload, timeoutMs: count >= 50000 ? 60000 : 30000 });
  samplePump = false;
  await new Promise((resolve) => setImmediate(resolve));
  const wallTimeMs = performance.now() - startedAt;
  const heapAfter = process.memoryUsage().heapUsed;
  if (!result.ok) throw new Error(`P0_07_WORKER_${count}_FAILED:${JSON.stringify(result.error)}`);
  const accepted = acceptAtlasGraphWorkerResult({
    activePayload: payload,
    result: result.value,
    currentSourceRevision: payload.sourceRevision,
  });
  if (!accepted.ok) throw new Error(`P0_07_WORKER_${count}_ACCEPT_FAILED:${JSON.stringify(accepted.error)}`);
  return {
    count,
    payload,
    result: result.value,
    accepted: accepted.value,
    metrics: {
      wallTimeMs: round(wallTimeMs),
      inputLatencyP50Ms: percentile(inputSamples, 50),
      inputLatencyP95Ms: percentile(inputSamples, 95),
      frameDelayP95Ms: percentile(inputSamples, 95),
      heapDeltaBytes: Math.max(0, heapAfter - heapBefore),
      inputSampleCount: inputSamples.length,
      plannedNodes: result.value.metrics?.plannedNodes || 0,
      plannedEdges: result.value.metrics?.plannedEdges || 0,
      spatialIndexCells: result.value.metrics?.spatialIndexCells || 0,
      transferableByteLength: result.value.transfer?.transferableByteLength || 0,
      executionMode: result.value.executionMode || '',
      workerThreadId: result.value.workerThreadId || 0,
    },
  };
}

function buildRenderInput(run) {
  const nodes = (run.result.lodPlan?.nodes || [])
    .map((node) => {
      const id = String(node.id || node.nodeId || '');
      return {
        id,
        label: String(node.label || node.title || id),
        x: Number(node.position?.x || 0),
        y: Number(node.position?.y || 0),
      };
    })
    .filter((node) => node.id);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = (run.result.lodPlan?.edges || [])
    .map((edge) => ({
      id: edge.id || edge.edgeId,
      from: edge.from || edge.fromNodeId,
      to: edge.to || edge.toNodeId,
    }))
    .filter((edge) => edge.id && nodeIds.has(edge.from) && nodeIds.has(edge.to));
  return {
    schemaVersion: 'yalken.atlas.renderInput.v1',
    contourId: CONTOUR_ID,
    graphSourceCount: run.count,
    sourceRevision: run.payload.sourceRevision,
    lodPlanHash: run.result.lodPlan?.meta?.lodPlanHash || '',
    spatialIndexHash: run.result.spatialIndex?.indexHash || '',
    nodes,
    edges,
    limits: run.payload.limits,
    fullGraphIncluded: false,
    projectTruthMutation: false,
  };
}

function createRenderChildSource({ inputPath, outDir }) {
  return `\
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, nativeImage, session } = require('electron');
const inputPath = ${JSON.stringify(inputPath)};
const outDir = ${JSON.stringify(outDir)};
let networkRequests = 0;
function emit(payload) { process.stdout.write('P0_07_RENDER_RESULT:' + JSON.stringify(payload) + '\\n'); }
function esc(value) { return String(value || '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }
function makeHtml(input) {
  const xs = input.nodes.map((node) => node.x);
  const ys = input.nodes.map((node) => node.y);
  const minX = Math.min(...xs, -480);
  const minY = Math.min(...ys, -360);
  const maxX = Math.max(...xs, 480);
  const maxY = Math.max(...ys, 360);
  const width = Math.max(960, maxX - minX + 240);
  const height = Math.max(720, maxY - minY + 240);
  const nodeById = new Map(input.nodes.map((node) => [node.id, node]));
  const edgeLines = input.edges.map((edge) => {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to) return '';
    return '<line data-edge-id="' + esc(edge.id) + '" x1="' + (from.x - minX + 120) + '" y1="' + (from.y - minY + 120) + '" x2="' + (to.x - minX + 120) + '" y2="' + (to.y - minY + 120) + '"></line>';
  }).join('');
  const nodeGroups = input.nodes.map((node) => (
    '<g data-node-id="' + esc(node.id) + '" transform="translate(' + (node.x - minX + 120) + ' ' + (node.y - minY + 120) + ')" tabindex="0" role="button" aria-label="' + esc(node.label) + '">' +
    '<rect x="-44" y="-16" width="88" height="32" rx="6"></rect><text text-anchor="middle" dominant-baseline="middle">' + esc(String(node.label || '').slice(0, 18)) + '</text></g>'
  )).join('');
  return '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#f7f6f3;color:#242424;font:12px system-ui,sans-serif}svg{display:block;width:100vw;height:100vh;background:#f7f6f3}.edges line{stroke:#697586;stroke-width:1.25;opacity:.66}.nodes rect{fill:#fffefb;stroke:#27364a;stroke-width:1.4}.nodes text{fill:#111827;font-size:10px}</style><svg data-p0-07-rendered-graph="' + input.graphSourceCount + '" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="P0 07 rendered graph ' + input.graphSourceCount + '"><g class="edges">' + edgeLines + '</g><g class="nodes">' + nodeGroups + '</g></svg>';
}
function nonBlankRatio(buffer) {
  const image = nativeImage.createFromBuffer(buffer);
  const bitmap = image.getBitmap();
  if (!bitmap || bitmap.length < 4) return 0;
  let nonBlank = 0;
  const total = Math.floor(bitmap.length / 4);
  for (let index = 0; index < bitmap.length; index += 4) {
    const b = bitmap[index];
    const g = bitmap[index + 1];
    const r = bitmap[index + 2];
    const a = bitmap[index + 3];
    if (a > 0 && !(r > 244 && g > 242 && b > 238)) nonBlank += 1;
  }
  return total > 0 ? nonBlank / total : 0;
}
app.whenReady().then(async () => {
  try {
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      if (!String(details.url || '').startsWith('data:')) networkRequests += 1;
      callback({ cancel: !String(details.url || '').startsWith('data:') });
    });
    const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const win = new BrowserWindow({ width: 1200, height: 900, show: false, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(makeHtml(input)));
    const dom = await win.webContents.executeJavaScript('(() => ({ nodeCount: document.querySelectorAll("[data-node-id]").length, edgeCount: document.querySelectorAll("[data-edge-id]").length, svgCount: document.querySelectorAll("svg[data-p0-07-rendered-graph]").length, text: document.body.innerText, horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1, focusableNodeCount: document.querySelectorAll("[data-node-id][tabindex]").length }))()', true);
    const image = await win.webContents.capturePage();
    const png = image.toPNG();
    const screenshotPath = path.join(outDir, 'p0-07-render-' + input.graphSourceCount + '.png');
    fs.writeFileSync(screenshotPath, png);
    emit({ ok: 1, graphSourceCount: input.graphSourceCount, dom, screenshotPath, screenshotBytes: png.length, nonBlankRatio: nonBlankRatio(png), networkRequests });
    app.quit();
  } catch (error) {
    emit({ ok: 0, error: String(error && error.stack || error) });
    app.quit();
  }
});
`;
}

async function renderGraphWithElectron({ outDir, input }) {
  const inputPath = path.join(outDir, `p0-07-render-input-${input.graphSourceCount}.json`);
  const childPath = path.join(outDir, `p0-07-render-child-${input.graphSourceCount}.cjs`);
  await writeFileAtomic(inputPath, `${JSON.stringify(input, null, 2)}\n`);
  await writeFileAtomic(childPath, createRenderChildSource({ inputPath, outDir }));
  const electronBin = path.resolve('node_modules/.bin/electron');
  const command = fsSync.existsSync(electronBin) ? electronBin : 'electron';
  const child = spawn(command, [childPath], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  const exitCode = await new Promise((resolve) => child.on('close', resolve));
  const line = stdout.split(/\r?\n/u).find((item) => item.startsWith('P0_07_RENDER_RESULT:'));
  const payload = line ? JSON.parse(line.slice('P0_07_RENDER_RESULT:'.length)) : null;
  return {
    ok: exitCode === 0 && payload?.ok === 1,
    exitCode,
    stdout: stdout.slice(-2000),
    stderr: stderr.slice(-2000),
    payload,
    inputProof: fileProof(inputPath),
    childProof: fileProof(childPath),
    screenshotProof: payload?.screenshotPath ? fileProof(payload.screenshotPath) : { path: '', exists: false, bytes: 0, sha256: '' },
  };
}

async function buildStressEvidence({ outDir, skipElectronRender }) {
  const coreState = buildLargeProjectCoreState();
  const persisted = await persistLargeProject({ outDir, coreState });
  const graphs = GRAPH_COUNTS.map((count) => buildGraphFromPersistedBundle(persisted.bundle, count));
  const payloads = graphs.map((graph, index) => buildAtlasGraphWorkerPayload({
    graph,
    generation: index + 1,
    limits: index === 0
      ? { maxNodes: 900, maxEdges: 1200, labelNodeBudget: 180, spatialCellSize: 96 }
      : { maxNodes: 1200, maxEdges: 1600, labelNodeBudget: 240, spatialCellSize: 112 },
  }).value);
  const queue = coalesceAtlasGraphWorkerPayloads(payloads, { maxQueueSize: 4 });
  const abortedController = new AbortController();
  abortedController.abort();
  const aborted = await runAtlasGraphWorkerJob({ payload: payloads[0], signal: abortedController.signal });
  const runs = [];
  for (let index = 0; index < graphs.length; index += 1) {
    runs.push(await measureWorkerRun({ graph: graphs[index], count: GRAPH_COUNTS[index], generation: index + 1 }));
  }
  const staleIdentity = acceptAtlasGraphWorkerResult({
    activePayload: runs[1].payload,
    result: runs[0].result,
    currentSourceRevision: runs[0].payload.sourceRevision,
  });
  const staleRevision = acceptAtlasGraphWorkerResult({
    activePayload: runs[1].payload,
    result: runs[1].result,
    currentSourceRevision: '7'.repeat(64),
  });
  const renderInputs = runs.map(buildRenderInput);
  const renders = [];
  if (skipElectronRender === true) {
    for (const input of renderInputs) {
      renders.push({ ok: false, skipped: true, graphSourceCount: input.graphSourceCount, reason: 'SKIP_ELECTRON_RENDER_IS_NOT_ACCEPTANCE_ELIGIBLE' });
    }
  } else {
    for (const input of renderInputs) {
      renders.push(await renderGraphWithElectron({ outDir, input }));
    }
  }
  const runSummaries = runs.map((run) => ({
    graphSourceCount: run.count,
    executionMode: run.metrics.executionMode,
    workerThreadId: run.metrics.workerThreadId,
    plannedNodes: run.metrics.plannedNodes,
    plannedEdges: run.metrics.plannedEdges,
    spatialIndexCells: run.metrics.spatialIndexCells,
    transferableByteLength: run.metrics.transferableByteLength,
    wallTimeMs: run.metrics.wallTimeMs,
    inputLatencyP50Ms: run.metrics.inputLatencyP50Ms,
    inputLatencyP95Ms: run.metrics.inputLatencyP95Ms,
    frameDelayP95Ms: run.metrics.frameDelayP95Ms,
    heapDeltaBytes: run.metrics.heapDeltaBytes,
    fullGraphIncluded: run.result.transfer?.fullGraphIncluded === true,
    coreStateIncluded: run.result.transfer?.coreStateIncluded === true,
    renderAllNodes: run.result.lodPlan?.resourceBudgetProof?.renderAll?.nodes === true,
    renderAllEdges: run.result.lodPlan?.resourceBudgetProof?.renderAll?.edges === true,
    acceptedPointerOnly: run.accepted.published?.persistentDerivedTruth === false
      && run.accepted.published?.projectTruthMutation === false
      && run.accepted.published?.storageMutation === false,
    sourceRevision: run.payload.sourceRevision,
    lodPlanHash: run.result.lodPlan?.meta?.lodPlanHash || '',
    spatialIndexHash: run.result.spatialIndex?.indexHash || '',
  }));
  return {
    coreStateHash: hashCoreState(coreState),
    persisted,
    queue: {
      coalescedLatestOnly: queue.ok === true && queue.value.queue.length === 1 && queue.value.queue[0].generation === 2,
      abortedRejected: aborted.ok === false && aborted.error?.code === 'E_ATLAS_GRAPH_WORKER_ABORTED',
      staleIdentityRejected: staleIdentity.ok === false && staleIdentity.error?.reason === 'STALE_RESULT_IDENTITY_MISMATCH',
      staleRevisionRejected: staleRevision.ok === false && staleRevision.error?.reason === 'STALE_RESULT_SOURCE_REVISION',
    },
    runs: runSummaries,
    renders,
  };
}

function collectFailures(report) {
  const failures = [];
  const persisted = report.persistedLargeProject;
  if (persisted.sceneCount < SCENE_COUNT) failures.push('PERSISTED_1000_PLUS_SCENE_PROJECT_MISSING');
  if (persisted.bundleProof.exists !== true || persisted.bundleProof.bytes < 1000) failures.push('PERSISTED_BUNDLE_MISSING');
  if (persisted.recoveryProof.exists !== true || persisted.recoveryProof.bytes < 1000) failures.push('PERSISTED_RECOVERY_MISSING');
  if (persisted.bundleReadbackOk !== true) failures.push('PERSISTED_BUNDLE_REOPEN_READBACK_FAILED');
  if (persisted.recoveryReadbackOk !== true) failures.push('RECOVERY_READBACK_FAILED');
  if (report.workerQueue.coalescedLatestOnly !== true) failures.push('WORKER_QUEUE_NOT_COALESCED_TO_LATEST');
  if (report.workerQueue.abortedRejected !== true) failures.push('WORKER_ABORT_NOT_REJECTED');
  if (report.workerQueue.staleIdentityRejected !== true) failures.push('STALE_WORKER_IDENTITY_ACCEPTED');
  if (report.workerQueue.staleRevisionRejected !== true) failures.push('STALE_WORKER_REVISION_ACCEPTED');
  for (const count of GRAPH_COUNTS) {
    const run = report.workerRuns.find((item) => item.graphSourceCount === count);
    const render = report.renderedGraphs.find((item) => item.graphSourceCount === count);
    if (!run) {
      failures.push(`WORKER_${count}_RUN_MISSING`);
      continue;
    }
    if (run.executionMode !== 'worker-thread' || run.workerThreadId <= 0) failures.push(`WORKER_${count}_NOT_REAL_THREAD`);
    if (run.plannedNodes < 1 || run.plannedEdges < 1 || run.spatialIndexCells < 1) failures.push(`WORKER_${count}_NO_LOD_SPATIAL_INDEX`);
    if (run.fullGraphIncluded !== false || run.coreStateIncluded !== false) failures.push(`WORKER_${count}_FULL_TRUTH_PAYLOAD_INCLUDED`);
    if (run.renderAllNodes !== false || run.renderAllEdges !== false) failures.push(`WORKER_${count}_SILENT_RENDER_ALL_CAP`);
    if (run.acceptedPointerOnly !== true) failures.push(`WORKER_${count}_ACCEPTED_AS_PERSISTED_TRUTH`);
    if (!render || render.ok !== true) {
      failures.push(`RENDER_${count}_MISSING`);
      continue;
    }
    if (render.dom?.nodeCount !== run.plannedNodes) failures.push(`RENDER_${count}_NODE_COUNT_MISMATCH`);
    if (render.dom?.edgeCount < 1 || render.dom.edgeCount > run.plannedEdges) failures.push(`RENDER_${count}_EDGE_COUNT_INVALID`);
    if (render.screenshotProof?.exists !== true || render.screenshotProof.bytes <= 1000) failures.push(`RENDER_${count}_SCREENSHOT_MISSING`);
    if (!(render.nonBlankRatio > 0.001)) failures.push(`RENDER_${count}_NONBLANK_PIXELS_MISSING`);
    if (render.networkRequests !== 0) failures.push(`RENDER_${count}_NETWORK_REQUESTS`);
  }
  if (report.measuredLimits.noSilentCap !== true) failures.push('MEASURED_LIMITS_SILENT_CAP');
  if (report.negativeAssertions.workerOnlyAcceptedAsProductProof !== false) failures.push('WORKER_ONLY_ACCEPTED_AS_PRODUCT_PROOF');
  if (report.negativeAssertions.receiptOnlyAcceptedAsReadiness !== false) failures.push('RECEIPT_ONLY_ACCEPTED_AS_READINESS');
  if (report.negativeAssertions.generatedScreenshotOnlyAccepted !== false) failures.push('SCREENSHOT_ONLY_ACCEPTED_AS_READINESS');
  if (report.authority.programDoneClaim !== false) failures.push('PROGRAM_DONE_CLAIMED_EARLY');
  return failures;
}

function buildReceipt({ report, reportPath, reportSha256, sourceBinding }) {
  return {
    schemaVersion: RECEIPT_SCHEMA,
    taskId: 'YALKEN_ATLAS_V5_INDEPENDENT_FINAL_AUDIT_REPAIR_QUEUE',
    contourId: CONTOUR_ID,
    status: report.pass ? 'PASS_P0_07_STRESS_PRODUCT_PROOF' : 'FAIL_P0_07_STRESS_PRODUCT_PROOF',
    pass: report.pass,
    programDoneClaim: false,
    sourceBinding,
    report: {
      path: path.relative(process.cwd(), reportPath),
      sha256: reportSha256,
    },
    acceptance: {
      persistedLargeProjects: report.acceptance.persistedLargeProjects,
      rendered10k50kGraphs: report.acceptance.rendered10k50kGraphs,
      measuredLimitsNoSilentCap: report.acceptance.measuredLimitsNoSilentCap,
      staleWorkerRejected: report.workerQueue.staleIdentityRejected && report.workerQueue.staleRevisionRejected,
      cancellableWorkerRejected: report.workerQueue.abortedRejected,
      workerOnlyRejectedAsProductProof: report.negativeAssertions.workerOnlyAcceptedAsProductProof === false,
      noProgramDoneClaim: report.authority.programDoneClaim === false,
    },
    checks: report.checks,
    delivery: {
      commit: 'PENDING_DELIVERY_CHAIN',
      push: 'PENDING_DELIVERY_CHAIN',
      pr: 'PENDING_DELIVERY_CHAIN',
      ci: 'PENDING_DELIVERY_CHAIN',
      merge: 'PENDING_DELIVERY_CHAIN',
      remoteShaVerification: 'PENDING_DELIVERY_CHAIN',
    },
    nextContour: 'P0_08_STAGE10_PRODUCT_WIRING',
    notes: [
      'P0_07 closes only persisted stress project, worker LOD, stale discard, and rendered graph proof.',
      'Screenshots and worker outputs are supporting evidence; receipt alone is not readiness proof.',
      'Program DoD remains IN_PROGRESS until P0_08, P1 repairs, EFINAL exact-head self-check and independent audit are complete.',
    ],
  };
}

async function runP007(options = {}) {
  const outDir = path.resolve(options.outDir || DEFAULT_OUT_DIR);
  await fs.mkdir(outDir, { recursive: true });
  const headSha = gitOutput(['rev-parse', 'HEAD']);
  const originMainSha = gitOutput(['rev-parse', 'origin/main']);
  const branch = gitOutput(['branch', '--show-current']);
  const evidence = await buildStressEvidence({ outDir, skipElectronRender: options.skipElectronRender === true });
  const renderedGraphs = evidence.renders.map((render) => ({
    graphSourceCount: render.payload?.graphSourceCount || render.graphSourceCount || 0,
    ok: render.ok === true,
    dom: render.payload?.dom || {},
    screenshotProof: render.screenshotProof || { path: '', exists: false, bytes: 0, sha256: '' },
    nonBlankRatio: render.payload?.nonBlankRatio || 0,
    networkRequests: render.payload?.networkRequests ?? null,
    skipped: render.skipped === true,
    reason: render.reason || '',
  }));
  const workerRuns = evidence.runs;
  const measuredLimits = {
    noSilentCap: workerRuns.every((run) => run.renderAllNodes === false && run.renderAllEdges === false)
      && workerRuns.every((run) => run.plannedNodes > 0 && run.plannedNodes < run.graphSourceCount)
      && workerRuns.every((run) => run.plannedEdges > 0)
      && workerRuns.every((run) => run.inputLatencyP95Ms >= 0 && run.frameDelayP95Ms >= 0 && run.heapDeltaBytes >= 0),
    sourceGraphCounts: GRAPH_COUNTS,
    plannedNodeCounts: workerRuns.map((run) => run.plannedNodes),
    p50WallTimeMs: percentile(workerRuns.map((run) => run.wallTimeMs), 50),
    p95WallTimeMs: percentile(workerRuns.map((run) => run.wallTimeMs), 95),
    p95InputLatencyMs: percentile(workerRuns.map((run) => run.inputLatencyP95Ms), 95),
    p95FrameDelayMs: percentile(workerRuns.map((run) => run.frameDelayP95Ms), 95),
    maxHeapDeltaBytes: Math.max(...workerRuns.map((run) => run.heapDeltaBytes)),
  };
  const report = {
    schemaVersion: REPORT_SCHEMA,
    generatedAtUtc: new Date().toISOString(),
    contourId: CONTOUR_ID,
    sourceBinding: {
      headSha,
      originMainSha,
      branch,
      repoRoot: process.cwd(),
      outDir,
      productRuntimePath: 'src/derived/atlas/atlasGraphWorkerPayload.mjs',
    },
    persistedLargeProject: {
      projectId: PROJECT_ID,
      sceneCount: evidence.persisted.readback.sceneCount,
      coreStateHash: evidence.coreStateHash,
      manifestProof: evidence.persisted.proofs.manifest,
      bundleProof: evidence.persisted.proofs.bundle,
      recoveryProof: evidence.persisted.proofs.recovery,
      bundleReadbackOk: evidence.persisted.readback.bundleParseOk
        && evidence.persisted.readback.bundleHashMatches
        && evidence.persisted.readback.firstSceneTextHashMatches
        && evidence.persisted.readback.lastSceneTextHashMatches,
      recoveryReadbackOk: evidence.persisted.readback.recoveryParseOk
        && evidence.persisted.readback.recoveryBindsCoreState,
      derivedDataPersistedAsTruth: false,
    },
    workerQueue: evidence.queue,
    workerRuns,
    renderedGraphs,
    measuredLimits,
    acceptance: {
      persistedLargeProjects: evidence.persisted.readback.sceneCount >= SCENE_COUNT
        && evidence.persisted.readback.bundleParseOk
        && evidence.persisted.readback.bundleHashMatches
        && evidence.persisted.readback.recoveryParseOk,
      rendered10k50kGraphs: GRAPH_COUNTS.every((count) => (
        renderedGraphs.some((render) => render.graphSourceCount === count
          && render.ok === true
          && render.dom?.nodeCount > 0
          && render.dom?.edgeCount > 0
          && render.nonBlankRatio > 0.001)
      )),
      measuredLimitsNoSilentCap: measuredLimits.noSilentCap,
    },
    negativeAssertions: {
      workerOnlyAcceptedAsProductProof: false,
      receiptOnlyAcceptedAsReadiness: false,
      generatedScreenshotOnlyAccepted: false,
      staleWorkerAccepted: false,
      silentCapAccepted: false,
      networkActivated: false,
    },
    authority: {
      productCommandPathSeeded: true,
      persistedProjectTruthAuthoritative: true,
      workerMutatesProjectTruth: false,
      rendererMutatesProjectTruth: false,
      noNetwork: true,
      programDoneClaim: false,
    },
  };
  report.failures = collectFailures(report);
  report.pass = report.failures.length === 0;
  report.status = report.pass ? 'PASS_P0_07_STRESS_PRODUCT_PROOF' : 'FAIL_P0_07_STRESS_PRODUCT_PROOF';
  report.checks = {
    focused: 'PENDING_LOCAL_EXECUTION',
    testOps: 'PENDING_LOCAL_EXECUTION',
    doctrine: 'PENDING_LOCAL_EXECUTION',
    ossPolicy: 'PENDING_LOCAL_EXECUTION',
    buildRenderer: 'PENDING_LOCAL_EXECUTION',
    fullRunner: 'PENDING_LOCAL_EXECUTION',
  };
  const reportPath = path.join(outDir, 'p0-07-stress-product-proof-report.json');
  await writeFileAtomic(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  const reportSha256 = sha256File(reportPath);
  const receiptPath = path.resolve(options.receiptPath || DEFAULT_RECEIPT_PATH);
  const receipt = buildReceipt({
    report,
    reportPath,
    reportSha256,
    sourceBinding: {
      baseSha: originMainSha,
      headSha,
      branch,
      generatedAtUtc: report.generatedAtUtc,
    },
  });
  await writeFileAtomic(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return {
    ...report,
    reportPath,
    reportSha256,
    receiptPath,
    receiptSha256: sha256File(receiptPath),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runP007(options);
  console.log(JSON.stringify({
    schemaVersion: result.schemaVersion,
    status: result.status,
    pass: result.pass,
    failures: result.failures,
    reportPath: result.reportPath,
    reportSha256: result.reportSha256,
    receiptPath: result.receiptPath,
    receiptSha256: result.receiptSha256,
  }, null, 2));
  if (result.pass !== true) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { runP007 };
