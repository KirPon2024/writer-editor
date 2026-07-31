const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = process.cwd();

function readText(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

async function importModule(relativePath) {
  return import(pathToFileURL(path.join(REPO_ROOT, relativePath)).href);
}

function makeEvents(type, count) {
  return Array.from({ length: count }, () => ({ type }));
}

test('R2 C05: product command namespaces are first-class command bus inputs', async () => {
  const namespace = await importModule('src/renderer/commands/commandNamespaceCanon.mjs');
  const manualMap = namespace.resolveCommandId('manualMap.create');
  const atlas = namespace.resolveCommandId('atlas.entity.create');
  const idea = namespace.resolveCommandId('idea.create');
  const meaning = namespace.resolveCommandId('meaning.promote');
  const unknown = namespace.resolveCommandId('unknown.product.write');

  assert.equal(manualMap.ok, true);
  assert.equal(manualMap.commandId, 'manualMap.create');
  assert.equal(atlas.ok, true);
  assert.equal(idea.ok, true);
  assert.equal(meaning.ok, true);
  assert.equal(unknown.ok, false);
  assert.equal(unknown.reason, 'COMMAND_NAMESPACE_UNKNOWN');
});

test('R2 C05: Manual Map visible result cannot self-attest APPLIED from missing command result', () => {
  const editorSource = readText('src/renderer/editor.js');
  const draftStart = editorSource.indexOf('async function applyManualMapCommandDraft()');
  const draftEnd = editorSource.indexOf('function makeManualMapDraftButton', draftStart);
  const draftSource = editorSource.slice(draftStart, draftEnd);
  const runnerStart = editorSource.indexOf('async function runProductJourneyCommand');
  const runnerEnd = editorSource.indexOf('function renderAtlasJourneyState', runnerStart);
  const runnerSource = editorSource.slice(runnerStart, runnerEnd);

  assert.match(runnerSource, /return result;/);
  assert.match(draftSource, /result && result\.ok === true/);
  assert.match(draftSource, /NO_COMMAND_RESULT/);
  assert.match(draftSource, /mutationDispatched:\s*commandApplied/);
  assert.doesNotMatch(draftSource, /status:\s*result && result\.ok === false \? 'FAILED' : 'APPLIED'/);
});

test('R2 C05: list parity supports additive selection and plan workspace owns the main surface', () => {
  const editorSource = readText('src/renderer/editor.js');
  const stylesSource = readText('src/renderer/styles.css');

  assert.match(editorSource, /function applyManualMapSelectionForRow\(rowElement, event = null\)/);
  assert.match(editorSource, /additive:\s*event && event\.shiftKey === true/);
  assert.match(editorSource, /applyManualMapSelectionForRow\(rowElement, event\)/);
  assert.match(editorSource, /editorPanelWrapper\?\.setAttribute\('hidden', ''\)/);
  assert.match(editorSource, /editorPanelWrapper\?\.removeAttribute\('hidden'\)/);
  assert.match(stylesSource, /\.main-content--manual-map \.editor-panel-wrapper\s*\{\s*display:\s*none;/);
});

test('R2 C05: black-box acceptance requires visible input, hit-testable graph, preserved screenshots and no direct IPC proof', async () => {
  const runner = await importModule('scripts/ops/yalken-atlas-v5-r2-c05-honest-black-box-acceptance.mjs');
  const runnerSource = readText('scripts/ops/yalken-atlas-v5-r2-c05-honest-black-box-acceptance.mjs');
  const inputEvents = [
    ...makeEvents('mouseDown', 14),
    ...makeEvents('keyDown', 4),
    ...makeEvents('char', 8),
  ];
  const screenshot = { nonBlankRatio: 0.5 };
  const positiveInput = {
    first: {
      ok: true,
      runtimeKind: 'production-electron-visible-input-black-box',
      result: {
        networkRequests: 0,
        dialogCalls: 0,
        rendererProbe: {
          inputEvents,
          screenshot,
          beforeCancel: { nodeCount: 2, edgeCount: 1 },
          afterCancel: { nodeCount: 2, edgeCount: 1, resultStatus: 'CANCELLED_NOOP' },
          finalSnapshot: {
            nodeCount: 1,
            edgeCount: 0,
            rowCount: 1,
            nodes: [{ hit: true }],
            text: 'BetaRenamedR2C05',
            hasHorizontalOverflow: false,
          },
        },
      },
    },
    second: {
      ok: true,
      runtimeKind: 'production-electron-visible-input-black-box',
      result: {
        networkRequests: 0,
        dialogCalls: 0,
        rendererProbe: {
          screenshot,
          snapshot: {
            nodeCount: 1,
            text: 'BetaRenamedR2C05',
            hasHorizontalOverflow: false,
          },
        },
      },
    },
    portability: {
      manifestProof: { exists: true, bytes: 100 },
      graph: {
        nodes: [{ label: 'BetaRenamedR2C05' }],
        edges: [],
      },
      exportLossCount: 0,
      imagePdfOk: true,
      imageFormat: 'svg',
      pdfSourceFormat: 'html-print-packet',
      pdfBinaryGenerated: false,
      repeatImportOk: true,
      repeatImportCommandAuthority: 'CommandKernel',
      repeatImportDirectCoreMutation: false,
      repeatImportStorageMutation: false,
      repeatImportLossCount: 0,
      repeatImportGraphHashMatched: true,
    },
    manifest: {
      manualMaps: {
        maps: {
          map: {
            nodes: {
              node: { label: 'BetaRenamedR2C05' },
            },
          },
        },
      },
    },
  };
  const positive = runner.evaluateHonestBlackBoxAcceptance(positiveInput);

  assert.equal(positive.pass, true);
  assert.equal(positive.accepted.hitTestableNonblankGraph, true);
  assert.match(runnerSource, /Input\.dispatchMouseEvent/);
  assert.match(runnerSource, /preserveRendererScreenshot/);
  assert.match(runnerSource, /fileProof\(first\?\.result\?\.rendererProbe\?\.screenshot\?\.path/);
  assert.doesNotMatch(runnerSource, /invokeUiCommandBridge/);

  const negative = runner.evaluateHonestBlackBoxAcceptance({
    ...positiveInput,
    first: {
      ...positiveInput.first,
      ok: true,
      runtimeKind: 'production-electron-visible-input-black-box',
      result: {
        networkRequests: 0,
        dialogCalls: 0,
        rendererProbe: {
          inputEvents,
          screenshot,
          beforeCancel: { nodeCount: 2, edgeCount: 1 },
          afterCancel: { nodeCount: 2, edgeCount: 1, resultStatus: 'CANCELLED_NOOP' },
          finalSnapshot: {
            nodeCount: 1,
            edgeCount: 0,
            rowCount: 1,
            nodes: [{ hit: false }],
            text: 'BetaRenamedR2C05',
            hasHorizontalOverflow: false,
          },
        },
      },
    },
    second: positiveInput.second,
    portability: positiveInput.portability,
    manifest: positiveInput.manifest,
  });
  assert.equal(negative.pass, false);
  assert.equal(negative.accepted.hitTestableNonblankGraph, false);
});
