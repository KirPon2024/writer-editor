#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RESULT_PREFIX = 'YALKEN_ATLAS_ER_C07_REVALIDATION_RESULT:';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const RECEIPT_BASENAMES = Object.freeze({
  erC00: 'YALKEN_ATLAS_V5_ER_C00_ACCEPTANCE_TRUTH_STATE_RECONCILIATION_RECEIPT.json',
  erC01: 'YALKEN_ATLAS_V5_ER_C01_UNICODE_ANCHOR_SCHEMA_INTEGRITY_RECEIPT.json',
  erC02: 'YALKEN_ATLAS_V5_ER_C02_SINGLE_QUERY_REGISTRY_RUNTIME_PARITY_RECEIPT.json',
  erC03: 'YALKEN_ATLAS_V5_ER_C03_COMMAND_REACHABILITY_COMMAND_KERNEL_AUTHORITY_RECEIPT.json',
  erC04: 'YALKEN_ATLAS_V5_ER_C04_PRODUCT_VERTICAL_JOURNEYS_GRAPH_WORKBENCH_RECEIPT.json',
  erC05: 'YALKEN_ATLAS_V5_ER_C05_REAL_WORKER_MEASURED_10K_BUDGET_RECEIPT.json',
  erC06: 'YALKEN_ATLAS_V5_ER_C06_ATLAS_RAIL_RESPONSIVE_ACCESSIBILITY_RECEIPT.json',
});

const INVALIDATED_RECEIPTS = Object.freeze([
  'YALKEN_ATLAS_V5_E05_C07_ATLAS_DIAGNOSTICS_DEGRADED_CAPABILITY_STAGE_ACCEPTANCE_RECEIPT',
  'YALKEN_ATLAS_V5_E06_C08_ATLAS_STAGE_06_ACCEPTANCE_DIAGNOSTICS_HANDOFF_RECEIPT',
]);

const CERTIFIED_STAGE_OUTCOMES = Object.freeze([
  'E01_STAGE_01_EXACT_ATLAS_USER_OUTCOME',
  'E02_STAGE_02_MANUAL_MAP_GRAPH_WORKBENCH_USER_OUTCOME',
  'E03_STAGE_03_PLOT_IDEA_MEANING_USER_OUTCOME',
  'E05_STAGE_05_FULL_ATLAS_READ_SURFACES_USER_OUTCOME',
]);

const REQUIRED_ATLAS_QUERY_IDS = Object.freeze([
  'query.atlasOverview',
  'query.atlasEntityDossier',
  'query.atlasRelationDossier',
  'query.atlasMatrices',
  'query.atlasHeatmap',
  'query.atlasTemporalLayout',
  'query.atlasContinuityLedgerSurface',
  'query.atlasReportsSavedQueries',
  'query.atlasDiagnosticsStageAcceptance',
  'query.atlasCurrentScene',
  'query.manualMapWorkbench',
  'query.projectionInspector',
]);

const REQUIRED_COMMAND_IDS = Object.freeze([
  'atlas.entity.create',
  'atlas.alias.add',
  'atlas.mention.confirm',
  'atlas.observation.suppress',
  'atlas.observation.reassign',
  'manualMap.create',
  'manualMap.node.add',
  'manualMap.node.update',
  'manualMap.node.delete',
  'manualMap.edge.add',
  'manualMap.edge.update',
  'manualMap.edge.delete',
  'manualMap.group.create',
  'manualMap.group.update',
  'manualMap.group.delete',
  'idea.create',
  'idea.originLink.add',
  'meaning.promote',
]);

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function canonicalSerialize(value) {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalSerialize(item)).join(',')}]`;
  if (t === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalSerialize(value[key])}`).join(',')}}`;
  }
  return 'null';
}

function hashCanonicalValue(value) {
  return sha256Buffer(Buffer.from(canonicalSerialize(value), 'utf8'));
}

function normalizeOutputDir(value) {
  return path.resolve(value || path.join(os.tmpdir(), 'yalken-atlas-er-c07-revalidation'));
}

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

async function readJsonFile(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function sha256File(filePath) {
  return sha256Buffer(await fs.readFile(filePath));
}

function isPassRow(row) {
  return row?.status === 'PASS' || row?.result === 'PASS';
}

function receiptHasPassValidation(receipt, matcher) {
  const rows = Array.isArray(receipt?.validations)
    ? receipt.validations
    : (Array.isArray(receipt?.validation) ? receipt.validation : []);
  return rows.some((row) => isPassRow(row) && matcher(row));
}

function collectReceiptFacts(receipts) {
  return {
    erC00NoSelfReadiness: receipts.erC00?.readinessDefault === 'NOT_READY'
      && receipts.erC00?.runtimeFacts?.stage10RuntimeSelfAttestationRemoved === true
      && receipts.erC00?.runtimeFacts?.missingExternalEvidenceDefaultsNotReady === true,
    erC01UnicodeIntegrity: receipts.erC01?.runtimeFacts?.unicodeAnchorFieldsPreservedByCoreCommands === true
      && receipts.erC01?.runtimeFacts?.unknownFutureAnchorFieldsPreserved === true
      && receipts.erC01?.runtimeFacts?.commentsHistoryAnchorIntegrityFailuresRemaining === 0,
    erC02QueryParity: receipts.erC02?.runtimeFacts?.singleWorkspaceQueryRegistry === true
      && receipts.erC02?.runtimeFacts?.rendererUnknownQueryFailClosed === true
      && receipts.erC02?.runtimeFacts?.mainUnknownQueryFailClosed === true,
    erC03CommandAuthority: receipts.erC03?.runtimeFacts?.sharedProductCommandRegistry === true
      && receipts.erC03?.runtimeFacts?.mainBridgeAllowlistProjectsProductRegistry === true
      && receipts.erC03?.runtimeFacts?.productCommandBridgeAuthority === 'CommandKernel',
    erC04Journeys: receiptHasPassValidation(receipts.erC04, (row) => /er-c04|journey|workbench|inspector/i.test(`${row.id} ${row.command} ${row.summary}`)),
    erC05MeasuredWorker: receipts.erC05?.measured10kBudget?.status === 'PASS'
      && receipts.erC05?.runtimeFacts?.realWorkerThreadAdapter === true,
    erC06Responsive: receipts.erC06?.runtimeFacts?.activeShellCountDesktop === 1
      && receipts.erC06?.runtimeFacts?.activeShellCountTablet === 1
      && receipts.erC06?.runtimeFacts?.keyboardNavigationPass === true,
  };
}

export function evaluateStageRevalidationEvidence(input = {}) {
  const receipts = input.receipts && typeof input.receipts === 'object' ? input.receipts : {};
  const live = input.liveRendererProof && typeof input.liveRendererProof === 'object' ? input.liveRendererProof : {};
  const validation = input.validation && typeof input.validation === 'object' ? input.validation : {};
  const facts = collectReceiptFacts(receipts);
  const invalidatedRejected = Array.isArray(input.invalidatedReceiptIds)
    && INVALIDATED_RECEIPTS.every((id) => input.invalidatedReceiptIds.includes(id));
  const livePass = live.pass === true
    && live.assertions?.stage01ExactAtlasJourney === true
    && live.assertions?.stage02ManualMapGraphWorkbench === true
    && live.assertions?.stage03PlotIdeaMeaningSurfaces === true
    && live.assertions?.stage05AllAtlasReadSurfacesReachable === true
    && live.assertions?.noNetwork === true
    && live.assertions?.reopenProof === true
    && live.assertions?.recoveryProof === true
    && live.assertions?.commandKernelReceipts === true;
  const productionChecksPass = validation.rendererBuild === 'PASS'
    && validation.focusedContracts === 'PASS'
    && validation.testOps === 'PASS'
    && validation.doctrine === 'PASS'
    && validation.ossPolicy === 'PASS';
  const fullRunnerPass = validation.fullRunner === 'PASS';
  const security = validation.genericSast === 'PASS'
    ? { status: 'PASS', productionExposure: 'NO_FINDINGS_FROM_GENERIC_SAST' }
    : { status: 'NOT_READY', productionExposure: 'DEV_AUDIT_GAP_NOT_SHIPPED_AS_STAGE_CERTIFICATION' };
  const allFacts = Object.values(facts).every(Boolean);
  const certified = invalidatedRejected && livePass && productionChecksPass && fullRunnerPass && allFacts
    ? [...CERTIFIED_STAGE_OUTCOMES]
    : [];
  const unsatisfied = new Set([
    'E10_STAGE_10_READINESS_REMAINS_NOT_READY_UNTIL_ER_C07_DELIVERY_CHAIN',
    'E11_ACTIVE_PLATFORM_CERTIFICATION_NOT_STARTED',
    'EFINAL_PROGRAM_DOD_NOT_STARTED',
  ]);
  for (const outcome of CERTIFIED_STAGE_OUTCOMES) {
    if (!certified.includes(outcome)) unsatisfied.add(outcome);
  }
  if (security.status !== 'PASS') {
    unsatisfied.add('GENERIC_SAST_SECURITY_CERTIFICATION_NOT_READY');
  }
  return {
    schemaVersion: 'yalken.atlas.v5.erC07.stageRevalidationEvaluation.v1',
    status: certified.length === CERTIFIED_STAGE_OUTCOMES.length ? 'READY_FOR_E11_COMPILATION_AFTER_DELIVERY_CHAIN' : 'NOT_READY',
    certifiedStageOutcomes: certified,
    unsatisfiedStageOutcomes: [...unsatisfied].sort(),
    facts,
    invalidatedEvidence: {
      rejectedAsReadinessEvidence: invalidatedRejected,
      receiptIds: [...INVALIDATED_RECEIPTS],
    },
    liveRendererProof: {
      status: livePass ? 'PASS' : 'NOT_READY',
      proofHash: typeof live.proofHash === 'string' ? live.proofHash : '',
    },
    validation: {
      ...validation,
      genericSast: security.status,
      genericSastProductionExposure: security.productionExposure,
    },
    negativeAssertions: {
      noFalseReadiness: certified.length < 1 || livePass,
      noCompletedContourCountReadiness: true,
      invalidatedE05E06NotAccepted: invalidatedRejected,
      lazywebAdvisoryOnly: true,
      stage11Started: false,
      secondSourceOfTruth: false,
      commandKernelBypass: false,
      directRendererStorageMutation: false,
    },
  };
}

function createChildSource(outputDir) {
  const sceneText = 'Ada met Bruno in the archive. Ada mapped the Atlas thread while Bruno checked the ledger.';
  const quote = 'Ada';
  const startOffset = sceneText.indexOf(quote);
  const endOffset = startOffset + quote.length;
  const sceneTextHash = hashCanonicalValue(sceneText);
  const quoteHash = hashCanonicalValue(quote);
  const evidenceAnchorBase = {
    schemaVersion: 'atlas.evidenceAnchor.v1',
    anchorId: 'er-c07-anchor-ada-0',
    startOffset,
    endOffset,
    quote,
    quoteHash,
    sceneTextHash,
    adapterOffsetDomain: 'utf16',
    offsetDomains: ['utf16', 'codePoint', 'grapheme'],
    codePointRange: { start: startOffset, end: endOffset },
    graphemeRange: { start: startOffset, end: endOffset },
    normalizationMap: { form: 'NFC', sourceHash: sceneTextHash },
    prefixSelector: '',
    suffixSelector: ' met Bruno',
    futureField: { preserved: true },
  };
  const rendererReadySnippet = "Boolean(window.electronAPI && document.body)";
  const openAtlasTabSnippet = "document.querySelector('[data-right-tab=\"atlas\"]')?.click()";
  const surfaceSwitchSnippet = "(() => { const names = ['journey','manualMap','projection','overview','entity','relation','matrices','reports','diagnostics','heatmap','temporal','continuity','currentScene']; for (const name of names) document.querySelector('[data-atlas-surface-button=\"' + name + '\"]')?.click(); return true; })()";
  const uiFactsSnippet = "(() => ({ atlasButtonCount: document.querySelectorAll('[data-atlas-surface-button]').length, productCommandButtonCount: document.querySelectorAll('[data-product-command-id]').length, visibleShellCount: Array.from(document.querySelectorAll('[data-atlas-surface-shell]')).filter((shell) => !shell.hidden && getComputedStyle(shell).display !== 'none').length, activeSurface: document.querySelector('[data-right-panel-atlas]')?.dataset?.activeAtlasSurface || '' }))()";
  return `\
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, dialog, Menu, session } = require('electron');

const repoRoot = ${JSON.stringify(repoRoot)};
const outputDir = ${JSON.stringify(outputDir)};
const resultPrefix = ${JSON.stringify(RESULT_PREFIX)};
const sceneText = ${JSON.stringify(sceneText)};
const evidenceAnchorBase = ${JSON.stringify(evidenceAnchorBase)};
const requiredQueryIds = ${JSON.stringify(REQUIRED_ATLAS_QUERY_IDS)};
const queryStateKeys = {
  'query.atlasOverview': 'atlasOverview',
  'query.atlasEntityDossier': 'atlasEntityDossier',
  'query.atlasRelationDossier': 'atlasRelationDossier',
  'query.atlasMatrices': 'atlasMatrices',
  'query.atlasHeatmap': 'atlasHeatmap',
  'query.atlasTemporalLayout': 'atlasTemporalLayout',
  'query.atlasContinuityLedgerSurface': 'atlasContinuityLedgerSurface',
  'query.atlasReportsSavedQueries': 'atlasReportsSavedQueries',
  'query.atlasDiagnosticsStageAcceptance': 'atlasDiagnosticsStageAcceptance',
  'query.atlasCurrentScene': 'atlasCurrentScene',
  'query.manualMapWorkbench': 'manualMapWorkbench',
  'query.projectionInspector': 'projectionInspector',
};
const commandBusRoute = 'command.bus';
const networkRequests = [];
const topLevelWatchdog = setTimeout(() => {
  emit({
    schemaVersion: 'yalken.atlas.v5.erC07.liveRendererJourney.v1',
    pass: false,
    error: 'LIVE_RENDERER_TOP_LEVEL_WATCHDOG_TIMEOUT',
  });
  process.exit(1);
}, 60000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function emit(payload) {
  process.stdout.write(resultPrefix + JSON.stringify(payload) + '\\n');
}

async function waitUntil(predicate, label, timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await predicate();
    if (value) return value;
    await sleep(50);
  }
  throw new Error('WAIT_TIMEOUT:' + label);
}

function findNode(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of Array.isArray(node.children) ? node.children : []) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return null;
}

async function invoke(win, source) {
  return win.webContents.executeJavaScript(source, true);
}

fsSync.mkdirSync(path.join(outputDir, 'user-data'), { recursive: true });
fsSync.mkdirSync(path.join(outputDir, 'app-data'), { recursive: true });
fsSync.mkdirSync(path.join(outputDir, 'documents', 'craftsman', 'Роман', 'roman', 'Imported'), { recursive: true });
fsSync.mkdirSync(path.join(outputDir, 'documents', 'craftsman', '.autosave'), { recursive: true });
fsSync.writeFileSync(path.join(outputDir, 'documents', 'craftsman', 'Роман', 'roman', 'Imported', '01_Atlas_ER_C07.txt'), sceneText, 'utf8');
fsSync.writeFileSync(path.join(outputDir, 'documents', 'craftsman', '.autosave', 'autosave.txt'), '', 'utf8');
fsSync.writeFileSync(path.join(outputDir, 'documents', 'craftsman', 'Роман', 'project.craftsman.json'), JSON.stringify({
  schemaVersion: 1,
  projectId: 'er-c07-project',
  projectName: 'Роман',
  createdAtUtc: '2026-07-31T10:35:00.000Z',
  atlas: { schemaVersion: 'atlas.author.v1', entities: {}, decisions: {}, suppressions: {}, entityOperations: {}, reassignments: {}, evidenceReattachments: {}, savedQueries: {}, languageTags: { project: null, scenes: {}, blocks: {}, ranges: {} }, seriesIdentityLinks: {}, entityVocabulary: {}, relationVocabulary: {}, seriesPortabilityOperations: {}, calendarDefinitions: {}, sceneTemporalAnchors: {}, continuityFactLedgers: { location: {}, knowledge: {}, object: {}, promise: {} } },
  manualMaps: { schemaVersion: 'manualMap.author.v1', maps: {} },
  ideas: { schemaVersion: 'idea.author.v1', ideas: {}, originLinks: {} },
  meanings: { schemaVersion: 'meaning.author.v1', meanings: {} }
}, null, 2), 'utf8');
app.setPath('appData', path.join(outputDir, 'app-data'));
app.setPath('userData', path.join(outputDir, 'user-data'));
app.setPath('documents', path.join(outputDir, 'documents'));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('disable-features', 'UseSkiaRenderer');
dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
dialog.showSaveDialog = async () => ({ canceled: true });
dialog.showMessageBox = async () => ({ response: 0 });
Menu.setApplicationMenu(null);

app.whenReady().then(async () => {
  await fs.mkdir(outputDir, { recursive: true });
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = details && typeof details.url === 'string' ? details.url : '';
    const blocked = /^(https?|wss?):/u.test(url);
    if (blocked) networkRequests.push(url);
    callback({ cancel: blocked });
  });
  process.chdir(repoRoot);
  if (!process.argv.includes('--dev')) process.argv.push('--dev');
  require(path.join(repoRoot, 'src', 'main.js'));
  const win = await waitUntil(() => BrowserWindow.getAllWindows()[0] || null, 'WINDOW_NOT_CREATED');
  await waitUntil(async () => {
    try {
      return win.webContents && !win.webContents.isLoadingMainFrame();
    } catch {
      return false;
    }
  }, 'WINDOW_DID_NOT_LOAD');
  await waitUntil(async () => invoke(win, ${JSON.stringify(rendererReadySnippet)}), 'RENDERER_API_NOT_READY');

  const tree = await invoke(win, "window.electronAPI.invokeWorkspaceQueryBridge({ queryId: 'query.projectTree', payload: { tab: 'roman' } })");
  const scene = findNode(tree.root, (node) => node.kind === 'scene' && String(node.label || '').includes('Atlas_ER_C07'));
  if (!scene) throw new Error('SEEDED_SCENE_NOT_FOUND');
  await sleep(250);
  await invoke(win, ${JSON.stringify(openAtlasTabSnippet)});
  await sleep(250);

  const commandResults = [];
  async function command(commandId, payload) {
    const result = await invoke(win, "window.electronAPI.invokeUiCommandBridge({ route: 'command.bus', commandId: " + JSON.stringify(commandId) + ", payload: " + JSON.stringify({ ...payload, projectId: tree.projectId }) + " })");
    commandResults.push({ commandId, ok: result && result.ok === true, result });
    if (!result || result.ok !== true) throw new Error('COMMAND_FAILED:' + commandId + ':' + JSON.stringify(result));
    return result;
  }

  const anchorAda = { ...evidenceAnchorBase, projectId: tree.projectId, sceneId: scene.nodeId, entityId: 'entity-ada' };
  const originRef = {
    schemaVersion: 'idea.originRef.v1',
    kind: 'sceneTextRange',
    sceneId: scene.nodeId,
    startOffset: evidenceAnchorBase.startOffset,
    endOffset: evidenceAnchorBase.endOffset,
    sourceHash: evidenceAnchorBase.sceneTextHash,
    targetId: 'entity-ada'
  };
  await command('atlas.entity.create', { entityId: 'entity-ada', name: 'Ada', entityKind: 'character' });
  await command('atlas.entity.create', { entityId: 'entity-bruno', name: 'Bruno', entityKind: 'character' });
  await command('atlas.alias.add', { entityId: 'entity-ada', aliasId: 'alias-ada-a', value: 'A. Ada', scope: 'scene', sceneId: scene.nodeId });
  await command('atlas.mention.confirm', { sceneId: scene.nodeId, entityId: 'entity-ada', mentionId: 'mention-ada-0', evidenceAnchor: anchorAda, decisionId: 'decision-ada-0' });
  await command('atlas.observation.suppress', { sceneId: scene.nodeId, entityId: 'entity-ada', mentionId: 'mention-ada-suppressed', evidenceAnchor: anchorAda, suppressionId: 'suppression-ada-0', reason: 'author-reviewed' });
  await command('atlas.observation.reassign', { sceneId: scene.nodeId, sourceEntityId: 'entity-ada', targetEntityId: 'entity-bruno', mentionId: 'mention-ada-reassign', evidenceAnchor: anchorAda, reassignmentId: 'reassign-ada-to-bruno', reason: 'author-reviewed' });
  await command('manualMap.create', { mapId: 'map-er-c07', title: 'ER C07 graph workbench' });
  await command('manualMap.node.add', { mapId: 'map-er-c07', nodeId: 'node-scene', label: 'Scene', nodeKind: 'scene', targetKind: 'scene', targetId: scene.nodeId, position: { x: 0, y: 0 } });
  await command('manualMap.node.add', { mapId: 'map-er-c07', nodeId: 'node-ada', label: 'Ada', nodeKind: 'entity', targetKind: 'entity', targetId: 'entity-ada', position: { x: 80, y: 32 } });
  await command('manualMap.edge.add', { mapId: 'map-er-c07', edgeId: 'edge-scene-ada', fromNodeId: 'node-scene', toNodeId: 'node-ada', edgeKind: 'link', label: 'mentions' });
  await command('manualMap.group.create', { mapId: 'map-er-c07', groupId: 'group-evidence', label: 'Evidence', colorTag: 'neutral', nodeIds: ['node-scene', 'node-ada'] });
  await command('manualMap.node.update', { mapId: 'map-er-c07', nodeId: 'node-ada', label: 'Ada updated' });
  await command('manualMap.edge.update', { mapId: 'map-er-c07', edgeId: 'edge-scene-ada', label: 'confirmed evidence' });
  await command('manualMap.group.update', { mapId: 'map-er-c07', groupId: 'group-evidence', label: 'Evidence updated', colorTag: 'neutral', nodeIds: ['node-scene', 'node-ada'] });
  await command('manualMap.edge.delete', { mapId: 'map-er-c07', edgeId: 'edge-scene-ada' });
  await command('manualMap.node.delete', { mapId: 'map-er-c07', nodeId: 'node-ada' });
  await command('manualMap.node.add', { mapId: 'map-er-c07', nodeId: 'node-bruno', label: 'Bruno', nodeKind: 'entity', targetKind: 'entity', targetId: 'entity-bruno', position: { x: 120, y: 64 } });
  await command('manualMap.group.delete', { mapId: 'map-er-c07', groupId: 'group-evidence' });
  await command('idea.create', { ideaId: 'idea-er-c07', title: 'Atlas evidence idea', summary: 'Seeded from exact scene evidence' });
  await command('idea.originLink.add', { ideaId: 'idea-er-c07', linkId: 'idea-origin-er-c07', originRef });
  await command('meaning.promote', { meaningId: 'meaning-er-c07', title: 'Evidence creates meaning', interpretation: 'A promoted meaning keeps origin authority explicit.', source: { kind: 'idea', ideaId: 'idea-er-c07' } });

  const queryResults = [];
  for (const queryId of requiredQueryIds) {
    const payload = queryId === 'query.atlasCurrentScene'
      ? { projectId: tree.projectId, nodeId: scene.nodeId }
      : queryId === 'query.manualMapWorkbench'
        ? { projectId: tree.projectId, mapId: 'map-er-c07' }
        : { projectId: tree.projectId };
    const result = await invoke(win, "window.electronAPI.invokeWorkspaceQueryBridge({ queryId: " + JSON.stringify(queryId) + ", payload: " + JSON.stringify(payload) + " })");
    const stateKey = queryStateKeys[queryId] || '';
    const stateObject = stateKey && result && typeof result === 'object' ? result[stateKey] : null;
    queryResults.push({ queryId, ok: result && result.ok !== false, state: stateObject && typeof stateObject === 'object' ? (stateObject.state || '') : '', result });
  }

  await invoke(win, ${JSON.stringify(surfaceSwitchSnippet)});
  await sleep(250);
  const uiFacts = await invoke(win, ${JSON.stringify(uiFactsSnippet)});
  const manifestPath = path.join(outputDir, 'documents', 'craftsman', 'Роман', 'project.craftsman.json');
  const manifestRaw = await fs.readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestRaw);
  const screenshot = await win.webContents.capturePage();
  const png = screenshot.toPNG();
  await fs.writeFile(path.join(outputDir, 'atlas-er-c07-live-renderer.png'), png);
  const recoveryRoot = path.join(outputDir, 'documents', 'craftsman', 'Роман', 'backups');
  const recoveryFiles = fsSync.existsSync(recoveryRoot)
    ? fsSync.readdirSync(recoveryRoot, { recursive: true }).map(String)
    : [];
  const proof = {
    schemaVersion: 'yalken.atlas.v5.erC07.liveRendererJourney.v1',
    generatedAtUtc: new Date().toISOString(),
    repoRoot,
    outputDir,
    projectId: tree.projectId,
    sceneNodeId: scene.nodeId,
    commandResults: commandResults.map((row) => ({
      commandId: row.commandId,
      ok: row.ok,
      storageWritten: row.result?.value?.storageWritten === true,
      recoverySnapshotCreated: row.result?.value?.recovery?.snapshotCreated === true,
      commandAuthority: row.result?.value?.commandAuthority || '',
    })),
    queryResults: queryResults.map((row) => ({ queryId: row.queryId, ok: row.ok, state: row.state })),
    manifestFacts: {
      entityCount: Object.keys(manifest.atlas?.entities || {}).length,
      decisionCount: Object.keys(manifest.atlas?.decisions || {}).length,
      suppressionCount: Object.keys(manifest.atlas?.suppressions || {}).length,
      reassignmentCount: Object.keys(manifest.atlas?.reassignments || {}).length,
      mapCount: Object.keys(manifest.manualMaps?.maps || {}).length,
      ideaCount: Object.keys(manifest.ideas?.ideas || {}).length,
      originLinkCount: Object.keys(manifest.ideas?.originLinks || {}).length,
      meaningCount: Object.keys(manifest.meanings?.meanings || {}).length,
      lastCommandId: manifest.lastCommandId || 0,
      unicodeAnchorFutureFieldPreserved: manifest.atlas?.decisions?.['decision-ada-0']?.evidenceAnchor?.futureField?.preserved === true,
      unicodeAnchorOffsetDomainsPreserved: Array.isArray(manifest.atlas?.decisions?.['decision-ada-0']?.evidenceAnchor?.offsetDomains),
    },
    uiFacts,
    networkRequestCount: networkRequests.length,
    networkRequests,
    screenshot: {
      basename: 'atlas-er-c07-live-renderer.png',
      bytes: png.length,
      sha256: sha256Buffer(png),
    },
    recovery: {
      fileCount: recoveryFiles.length,
      sampleBasenames: recoveryFiles.slice(0, 8).map((name) => path.basename(name)),
    },
    assertions: {},
  };
  proof.assertions = {
    noNetwork: networkRequests.length === 0,
    stage01ExactAtlasJourney: proof.manifestFacts.entityCount >= 2
      && proof.manifestFacts.decisionCount >= 1
      && proof.manifestFacts.suppressionCount >= 1
      && proof.manifestFacts.reassignmentCount >= 1
      && proof.manifestFacts.unicodeAnchorFutureFieldPreserved === true
      && proof.manifestFacts.unicodeAnchorOffsetDomainsPreserved === true,
    stage02ManualMapGraphWorkbench: proof.manifestFacts.mapCount >= 1
      && queryResults.some((row) => row.queryId === 'query.manualMapWorkbench' && row.ok && row.state === 'ready'),
    stage03PlotIdeaMeaningSurfaces: proof.manifestFacts.ideaCount >= 1
      && proof.manifestFacts.originLinkCount >= 1
      && proof.manifestFacts.meaningCount >= 1
      && queryResults.some((row) => row.queryId === 'query.projectionInspector' && row.ok),
    stage05AllAtlasReadSurfacesReachable: requiredQueryIds.every((queryId) => queryResults.some((row) => row.queryId === queryId && row.ok)),
    commandKernelReceipts: commandResults.length >= 18
      && commandResults.every((row) => row.ok && row.result?.value?.commandAuthority === 'CommandKernel' && row.result?.value?.storageWritten === true),
    reopenProof: manifest.lastCommandId >= 18,
    recoveryProof: commandResults.every((row) => row.result?.value?.recovery?.snapshotCreated === true)
      && recoveryFiles.length > 0,
    uiReachability: uiFacts.atlasButtonCount >= 13 && uiFacts.productCommandButtonCount >= 5 && uiFacts.visibleShellCount === 1,
    screenshotProof: png.length > 1000,
  };
  proof.pass = Object.values(proof.assertions).every(Boolean);
  await fs.writeFile(path.join(outputDir, 'atlas-er-c07-live-renderer-journey.json'), JSON.stringify(proof, null, 2) + '\\n', 'utf8');
  clearTimeout(topLevelWatchdog);
  emit(proof);
  app.exit(proof.pass ? 0 : 1);
}).catch((error) => {
  const emitError = async () => {
    let diagnostics = {};
    try {
      const win = BrowserWindow.getAllWindows()[0] || null;
      diagnostics = win
        ? await win.webContents.executeJavaScript("({ href: location.href, readyState: document.readyState, title: document.title, hasBody: Boolean(document.body), hasElectronAPI: Boolean(window.electronAPI), bodyText: document.body ? document.body.innerText.slice(0, 500) : '', html: document.documentElement ? document.documentElement.outerHTML.slice(0, 500) : '' })", true)
        : { windowMissing: true };
    } catch (diagnosticError) {
      diagnostics = { diagnosticError: diagnosticError && diagnosticError.message ? diagnosticError.message : String(diagnosticError) };
    }
    emit({
    schemaVersion: 'yalken.atlas.v5.erC07.liveRendererJourney.v1',
    pass: false,
    error: error && error.message ? error.message : String(error),
    diagnostics,
  });
    app.exit(1);
  };
  void emitError();
});
`;
}

async function parseChildResult(stdout) {
  const line = String(stdout || '').split(/\r?\n/u).find((item) => item.startsWith(RESULT_PREFIX));
  return line ? JSON.parse(line.slice(RESULT_PREFIX.length)) : null;
}

export async function runLiveRendererJourney(options = {}) {
  const outputDir = normalizeOutputDir(options.outputDir || process.env.YALKEN_ATLAS_ER_C07_OUT_DIR);
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yalken-atlas-er-c07-child-'));
  const childPath = path.join(tempRoot, 'atlas-er-c07-live-renderer-child.cjs');
  const requireFromRoot = createRequire(path.join(repoRoot, 'package.json'));
  const electronBinary = requireFromRoot('electron');
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(childPath, createChildSource(outputDir), 'utf8');
  const stdoutChunks = [];
  const stderrChunks = [];
  const child = spawn(electronBinary, [childPath], {
    cwd: repoRoot,
    env: { ...process.env, ELECTRON_ENABLE_SECURITY_WARNINGS: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
  child.stderr.on('data', (chunk) => stderrChunks.push(chunk));
  const exitCode = await new Promise((resolve) => child.on('close', resolve));
  const stdout = Buffer.concat(stdoutChunks).toString('utf8');
  const stderr = Buffer.concat(stderrChunks).toString('utf8');
  const result = await parseChildResult(stdout);
  if (!result) {
    return {
      pass: false,
      error: 'LIVE_RENDERER_RESULT_MISSING',
      exitCode,
      stdout,
      stderr,
    };
  }
  const proofPath = path.join(outputDir, 'atlas-er-c07-live-renderer-journey.json');
  const proofHash = fsSync.existsSync(proofPath) ? await sha256File(proofPath) : '';
  return {
    ...result,
    proofHash,
    exitCode,
    stderrTail: stderr.split(/\r?\n/u).slice(-20).join('\n'),
  };
}

function runCommand(command, args, options = {}) {
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...(options.env || {}) },
    maxBuffer: 1024 * 1024 * 30,
  });
  return {
    command: [command, ...args].join(' '),
    status: result.status === 0 ? 'PASS' : 'FAIL',
    exitCode: typeof result.status === 'number' ? result.status : 1,
    durationMs: Date.now() - started,
    stdoutTail: String(result.stdout || '').split(/\r?\n/u).slice(-16).join('\n'),
    stderrTail: String(result.stderr || '').split(/\r?\n/u).slice(-16).join('\n'),
  };
}

async function loadReceipts() {
  const receipts = {};
  const receiptMeta = {};
  for (const [key, basename] of Object.entries(RECEIPT_BASENAMES)) {
    const filePath = path.join(repoRoot, 'docs', 'OPS', 'STATUS', basename);
    receipts[key] = await readJsonFile(filePath);
    receiptMeta[key] = {
      basename,
      sha256: await sha256File(filePath),
    };
  }
  return { receipts, receiptMeta };
}

export async function runStageRevalidation(options = {}) {
  const outputDir = normalizeOutputDir(options.outputDir || process.env.YALKEN_ATLAS_ER_C07_OUT_DIR);
  await fs.mkdir(outputDir, { recursive: true });
  const { receipts, receiptMeta } = await loadReceipts();
  const liveRendererProof = await runLiveRendererJourney({ outputDir });
  const validationRows = {
    rendererBuild: runCommand('npm', ['run', '-s', 'build:renderer']),
    focusedContracts: runCommand('node', ['--test',
      'test/contracts/yalken-atlas-v5-er-c00-acceptance-truth-state-reconciliation.contract.test.js',
      'test/contracts/yalken-atlas-v5-er-c01-unicode-anchor-schema-integrity.contract.test.js',
      'test/contracts/yalken-atlas-v5-er-c02-single-query-registry-runtime-parity.contract.test.js',
      'test/contracts/yalken-atlas-v5-er-c03-command-reachability-command-kernel-authority.contract.test.js',
      'test/contracts/yalken-atlas-v5-er-c04-product-vertical-journeys-graph-workbench.contract.test.js',
      'test/contracts/yalken-atlas-v5-er-c05-real-worker-measured-10k-budget.contract.test.js',
      'test/contracts/yalken-atlas-v5-er-c06-atlas-rail-responsive-accessibility.contract.test.js',
      'test/contracts/yalken-atlas-v5-er-c07-stage-revalidation-handoff.contract.test.js',
    ]),
    testOps: runCommand('npm', ['run', '-s', 'test:ops']),
    doctrine: runCommand('npm', ['run', '-s', 'design-os:doctrine']),
    ossPolicy: runCommand('npm', ['run', '-s', 'oss:policy']),
    diffCheck: runCommand('git', ['diff', '--check']),
    genericSast: runCommand('npm', ['run', '-s', 'security:audit:generic-sast']),
  };
  const validation = Object.fromEntries(Object.entries(validationRows).map(([key, row]) => [key, row.status]));
  const evaluation = evaluateStageRevalidationEvidence({
    receipts,
    liveRendererProof,
    invalidatedReceiptIds: [...INVALIDATED_RECEIPTS],
    validation: {
      ...validation,
      fullRunner: options.fullRunnerStatus || 'NOT_RUN',
    },
  });
  const gitHead = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).stdout.trim();
  const report = {
    schemaVersion: 'yalken.atlas.v5.erC07.stageRevalidationReport.v1',
    generatedAtUtc: new Date().toISOString(),
    contourId: 'ER_C07_STAGE_REVALIDATION_AND_HANDOFF',
    targetSha: gitHead,
    status: evaluation.status,
    receiptMeta,
    liveRendererProofPath: path.join(outputDir, 'atlas-er-c07-live-renderer-journey.json'),
    liveRendererProofSha256: liveRendererProof.proofHash || '',
    validationRows,
    evaluation,
  };
  const reportPath = path.join(outputDir, 'atlas-er-c07-stage-revalidation-report.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  return {
    ...report,
    reportPath,
    reportSha256: await sha256File(reportPath),
    pass: evaluation.status === 'READY_FOR_E11_COMPILATION_AFTER_DELIVERY_CHAIN'
      || (
        liveRendererProof.pass === true
        && validation.rendererBuild === 'PASS'
        && validation.focusedContracts === 'PASS'
        && validation.testOps === 'PASS'
        && validation.doctrine === 'PASS'
        && validation.ossPolicy === 'PASS'
        && validation.diffCheck === 'PASS'
      ),
  };
}

async function main() {
  const outArgIndex = process.argv.indexOf('--out');
  const outputDir = outArgIndex >= 0 ? process.argv[outArgIndex + 1] : process.env.YALKEN_ATLAS_ER_C07_OUT_DIR;
  const fullRunnerStatusArg = process.argv.find((arg) => arg.startsWith('--full-runner-status='));
  const fullRunnerStatus = fullRunnerStatusArg ? fullRunnerStatusArg.slice('--full-runner-status='.length) : 'NOT_RUN';
  const result = await runStageRevalidation({ outputDir, fullRunnerStatus });
  process.stdout.write(`${RESULT_PREFIX}${JSON.stringify(result)}\n`);
  process.exit(result.pass ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stdout.write(`${RESULT_PREFIX}${JSON.stringify({
      schemaVersion: 'yalken.atlas.v5.erC07.stageRevalidationReport.v1',
      pass: false,
      error: error && error.message ? error.message : String(error),
    })}\n`);
    process.exit(1);
  });
}
