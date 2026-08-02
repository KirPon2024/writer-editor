const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = process.cwd();

async function importModule() {
  return import(pathToFileURL(path.join(
    REPO_ROOT,
    'scripts',
    'ops',
    'yalken-atlas-v5-final-audit-p0-03-packaged-visible-journey.mjs',
  )).href);
}

function fileProof(name, sha = `sha-${name}`) {
  return { path: `/tmp/${name}`, exists: true, bytes: 2048, sha256: sha };
}

function passingRuntime() {
  const manifestSummary = {
    entityNames: ['AlphaP003', 'BetaP003'],
    aliasValues: ['AlphaAliasP003'],
    decisionCount: 1,
    suppressionCount: 1,
    reassignmentCount: 1,
    mergeOperationCount: 1,
    restoredMergeOperationCount: 1,
    reattachmentCount: 1,
    calendarCount: 1,
    sceneTemporalAnchorCount: 1,
    continuityFactCount: 1,
    savedQueryCount: 1,
    manualMap: {
      mapCount: 1,
      nodeLabels: ['P003 Node A', 'P003 Node B'],
      edgeLabels: ['P003 Edge'],
    },
  };
  const persistence = {
    manifestSummary,
    sceneTextProofs: [
      { containsSceneText: true, containsImportedMarkdown: false },
      { containsSceneText: false, containsImportedMarkdown: true },
    ],
    exports: {
      allScenesTxt: fileProof('all-scenes.txt'),
    },
  };
  return {
    first: {
      ok: true,
      runtimeKind: 'macos-packaged-electron-cdp-visible-input',
      snapshot: {
        atlas: { hasAlpha: true, hasBeta: true },
        manualMap: { hasEdge: true },
      },
      screenshot: fileProof('first.png'),
      persistence,
      activationTrace: [
        {
          step: 'atlas-create-entity',
          mode: 'PHYSICAL_POINTER_OR_KEYBOARD',
          physicalUserProof: true,
          details: { method: 'Input.dispatchMouseEvent' },
        },
        {
          step: 'modal-format:txt-all-exported',
          mode: 'DOM_VISIBLE_CONTROL_LISTENER_FALLBACK',
          physicalUserProof: false,
          details: { method: 'HTMLElement.click' },
        },
      ],
    },
    reopen: {
      ok: true,
      runtimeKind: 'macos-packaged-electron-cdp-visible-input',
      screenshot: fileProof('reopen.png'),
      persistence,
      activationTrace: [
        {
          step: 'reopen-atlas-surface',
          mode: 'PHYSICAL_POINTER_OR_KEYBOARD',
          physicalUserProof: true,
          details: { method: 'Input.dispatchMouseEvent' },
        },
      ],
    },
  };
}

test('P0 03: evaluator passes only current package-bound visible UI journey with fresh reopen', async () => {
  const { evaluateP0_03PackagedVisibleJourney } = await importModule();
  const runtime = passingRuntime();
  const result = evaluateP0_03PackagedVisibleJourney({
    identity: {
      headSha: 'source-sha',
      originMainSha: 'source-sha',
      dirtyFiles: [],
    },
    packageReport: {
      pass: true,
      artifacts: { appAsar: { sha256: 'package-sha' } },
    },
    appAsarProof: fileProof('app.asar', 'package-sha'),
    first: runtime.first,
    reopen: runtime.reopen,
    directBridgeProof: { accepted: false },
    generatedArtifactOnly: { accepted: false },
  });

  assert.equal(result.pass, true, JSON.stringify(result, null, 2));
  assert.equal(result.status, 'PASS_PACKAGED_VISIBLE_UI_JOURNEY');
  for (const [key, value] of Object.entries(result.accepted)) {
    assert.equal(value, true, `accepted.${key}`);
  }
  assert.equal(result.activationEvidence.counts.PHYSICAL_POINTER_OR_KEYBOARD, 2);
  assert.equal(result.activationEvidence.counts.DOM_VISIBLE_CONTROL_LISTENER_FALLBACK, 1);
  assert.equal(result.activationEvidence.forbiddenDirectBridgeAccepted, false);
  assert.match(result.activationEvidence.physicalClaimRule, /Only PHYSICAL_POINTER_OR_KEYBOARD rows/u);
  assert.equal(
    result.activationEvidence.steps
      .filter((entry) => entry.mode === 'DOM_VISIBLE_CONTROL_LISTENER_FALLBACK')
      .every((entry) => entry.physicalUserProof === false),
    true,
  );
  assert.equal(result.negativeAssertions.oldE11C02BridgeHarnessAccepted, false);
  assert.equal(result.negativeAssertions.finalProgramDoDClaim, false);
});

test('P0 03: evaluator rejects stale package, bridge proof, screenshot-only and missing reopen', async () => {
  const { evaluateP0_03PackagedVisibleJourney } = await importModule();
  const runtime = passingRuntime();
  const result = evaluateP0_03PackagedVisibleJourney({
    identity: {
      headSha: 'source-sha',
      originMainSha: 'different-sha',
      dirtyFiles: [],
    },
    packageReport: {
      pass: true,
      artifacts: { appAsar: { sha256: 'package-sha' } },
    },
    appAsarProof: fileProof('app.asar', 'different-package-sha'),
    first: {
      ...runtime.first,
      persistence: {
        ...runtime.first.persistence,
        exports: { allScenesTxt: { exists: false, bytes: 0 } },
      },
    },
    reopen: {
      ...runtime.reopen,
      ok: false,
    },
    directBridgeProof: { accepted: true },
    generatedArtifactOnly: { accepted: true },
  });

  assert.equal(result.pass, false);
  assert.equal(result.status, 'NOT_READY_P0_03_PACKAGED_VISIBLE_UI_GAPS');
  assert.equal(result.accepted.currentSourcePackageBuilt, false);
  assert.equal(result.accepted.exactSourceBindingPresent, false);
  assert.equal(result.accepted.noDirectBridgeAcceptance, false);
  assert.equal(result.accepted.noGeneratedArtifactOnlyAcceptance, false);
  assert.equal(result.accepted.freshProcessReopenReadback, false);
});

test('P0 03: implementation uses packaged executable and visible CDP input, not E11 bridge harness acceptance', () => {
  const source = fs.readFileSync(path.join(
    REPO_ROOT,
    'scripts',
    'ops',
    'yalken-atlas-v5-final-audit-p0-03-packaged-visible-journey.mjs',
  ), 'utf8');

  assert.match(source, /Contents', 'MacOS', 'Yalken'/u);
  assert.match(source, /remote-debugging-port/u);
  assert.match(source, /Input\.dispatchMouseEvent/u);
  assert.match(source, /text:\s*char/u);
  assert.match(source, /PHYSICAL_POINTER_OR_KEYBOARD/u);
  assert.match(source, /DOM_VISIBLE_CONTROL_LISTENER_FALLBACK/u);
  assert.match(source, /FORBIDDEN_DIRECT_BRIDGE/u);
  assert.match(source, /button\.click\(\)/u);
  assert.match(source, /physicalUserProof:\s*mode === ACTIVATION_PHYSICAL/u);
  assert.match(source, /data-atlas-journey-action/u);
  assert.match(source, /atlasJourneyLastCommandId ===/u);
  assert.match(source, /atlasJourneyCommandSeq/u);
  assert.match(source, /productCommandId/u);
  assert.match(source, /data-manual-map-plan-host/u);
  assert.match(source, /data-export-surface-format="txt-all"/u);
  assert.match(source, /data-import-surface-format="markdown"/u);
  assert.match(source, /button\.click\(\)/u);
  assert.match(source, /oldE11C02BridgeHarnessAccepted:\s*false/u);
  assert.doesNotMatch(source, /runProductionAppRuntimeHarness/u);
  assert.doesNotMatch(source, /invokeUiCommandBridge/u);
  assert.doesNotMatch(source, /invokeWorkspaceQueryBridge/u);
  assert.doesNotMatch(source, /window\.electronAPI/u);
});

test('P0 03: autonomous file dialog adapter is env-gated and constrained to Documents', () => {
  const mainSource = fs.readFileSync(path.join(REPO_ROOT, 'src', 'main.js'), 'utf8');
  const source = fs.readFileSync(path.join(
    REPO_ROOT,
    'scripts',
    'ops',
    'yalken-atlas-v5-final-audit-p0-03-packaged-visible-journey.mjs',
  ), 'utf8');

  assert.match(mainSource, /YALKEN_AUTONOMOUS_FILE_DIALOG_ROOT/u);
  assert.match(mainSource, /YALKEN_AUTONOMOUS_APP_PATH_ROOT/u);
  assert.match(mainSource, /app\.setPath\('documents', documentsRoot\)/u);
  assert.match(mainSource, /app\.setPath\('appData', appDataRoot\)/u);
  assert.match(mainSource, /app\.setPath\('userData', userDataRoot\)/u);
  assert.match(mainSource, /os\.tmpdir\(\)/u);
  assert.match(mainSource, /app\.getPath\('documents'\)/u);
  assert.match(mainSource, /!isPathInside\(documentsRoot, resolvedRoot\)/u);
  assert.match(mainSource, /YALKEN_AUTONOMOUS_FILE_DIALOG_OPEN_MARKDOWN/u);
  assert.match(mainSource, /function findCommandBridgeFailureReason/u);
  assert.match(mainSource, /const reason = findCommandBridgeFailureReason\(result\) \|\| 'COMMAND_EXECUTION_FAILED'/u);
  assert.match(mainSource, /return dialog\.showSaveDialog\(windowRef, options\)/u);
  assert.match(mainSource, /return dialog\.showOpenDialog\(windowRef, options\)/u);
  const editorSource = fs.readFileSync(path.join(REPO_ROOT, 'src', 'renderer', 'editor.js'), 'utf8');
  assert.match(editorSource, /atlasJourneyLastCommandId/u);
  assert.match(editorSource, /atlasJourneyCommandSeq/u);
  assert.match(editorSource, /commandSeq: nextCommandSeq/u);
  assert.match(editorSource, /runExportSurfaceButtonFormat/u);
  assert.match(editorSource, /runImportSurfaceButtonFormat/u);
  assert.match(editorSource, /event\.key !== 'Enter' && event\.key !== ' ' && event\.key !== 'Spacebar'/u);
  assert.match(editorSource, /function findCommandResultReason/u);
  assert.match(editorSource, /commandId !== EXTRA_COMMAND_IDS\.PROJECT_EXPORT_ALL_SCENES_TXT/u);
  assert.match(editorSource, /payload\.confirmed = true/u);
  assert.ok(editorSource.includes('setExportSurfaceStatus(`${statusBase} export failed`'));
  assert.ok(editorSource.includes('setExportSurfaceStatus(`${statusBase} exported${sceneCount}`'));

  assert.match(source, /YALKEN_AUTONOMOUS_APP_PATH_ROOT:\s*appPathRoot/u);
  assert.match(source, /const documentsRoot = path\.join\(appPathRoot, 'Documents'\)/u);
  assert.match(source, /buildPersistenceProof\(runtime\.documentsRoot, runtime\.dialogRoot\)/u);
});
