const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

async function loadModule() {
  return import(pathToFileURL(path.join(
    ROOT,
    'scripts',
    'ops',
    'yalken-atlas-v5-e11-c03-packaged-accessibility-responsive-visual-regression.mjs',
  )).href);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function presentFile(name, sha = `sha-${name}`) {
  return { path: `/physical/${name}`, exists: true, bytes: 2000, sha256: sha };
}

function passingAudit() {
  return {
    ok: true,
    timedOut: false,
    exitCode: 0,
    proofPath: '/physical/audit.json',
    proofSha256: 'audit-sha',
    result: {
      networkRequestCount: 0,
      assertions: {
        noNetwork: true,
        supportedWidthMatrix: true,
        supportedOneActiveShell: true,
        externalOpenerReachable: true,
        openerNoToolbarCollision: true,
        noHorizontalOverflow: true,
        keyboardNavigation: true,
        overlayFocusTrapAndEscape: true,
        visibleAtlasScreenshots: true,
        scrollBudget: true,
        contrastAA: true,
        supportedWidthsNotClipped: true,
        handsetHonestAdvisory: true,
      },
      results: [
        { id: 'desktop', width: 1440, height: 900, activeShellCount: 1, focusVisible: true, keyboardMovedFocus: true, navContrast: 5, atlasPanelScrollHeight: 600, rightSidebarHidden: false, screenshotName: 'desktop.png', screenshotBytes: 2000, screenshotSha256: 'desktop-current' },
        { id: 'laptop', width: 1024, height: 768, activeShellCount: 1, focusVisible: true, keyboardMovedFocus: true, navContrast: 5, atlasPanelScrollHeight: 600, rightSidebarHidden: false, screenshotName: 'laptop.png', screenshotBytes: 2000, screenshotSha256: 'laptop-current' },
        { id: 'compact', width: 900, height: 720, activeShellCount: 1, focusVisible: true, keyboardMovedFocus: true, navContrast: 5, atlasPanelScrollHeight: 600, rightSidebarHidden: false, screenshotName: 'compact.png', screenshotBytes: 2000, screenshotSha256: 'compact-current' },
        { id: 'tablet', width: 768, height: 720, activeShellCount: 1, focusVisible: true, keyboardMovedFocus: true, navContrast: 5, atlasPanelScrollHeight: 600, rightSidebarHidden: false, screenshotName: 'tablet.png', screenshotBytes: 2000, screenshotSha256: 'tablet-current' },
        { id: 'handset-advisory', width: 390, height: 844, activeShellCount: 1, focusVisible: false, keyboardMovedFocus: true, navContrast: 6, atlasPanelScrollHeight: 0, rightSidebarHidden: true, screenshotName: 'handset-advisory.png', screenshotBytes: 2000, screenshotSha256: 'handset-current' },
      ],
    },
  };
}

function passingVisualComparisons() {
  return ['desktop', 'laptop', 'compact', 'tablet', 'handset-advisory'].map((id) => ({
    id,
    current: presentFile(`${id}.png`, `${id}-current`),
    baseline: presentFile(`${id}-baseline.png`, `${id}-baseline`),
    exactHashMatch: false,
    exactHashRequired: false,
    delta: {
      sameDimensions: true,
      currentDimensions: [100, 100],
      baselineDimensions: [100, 100],
      meanAbs: 0.5,
      changedRatio: 0.01,
      nonBlankRatio: 0.5,
      withinLimits: true,
    },
    pass: true,
  }));
}

test('E11 C03: evaluator certifies only package-bound responsive a11y visual proof', async () => {
  const { evaluatePackagedAccessibilityResponsiveVisualRegression } = await loadModule();
  const result = evaluatePackagedAccessibilityResponsiveVisualRegression({
    c01Receipt: {
      pass: true,
      status: 'PASS_UNSIGNED_LOCAL_ARTIFACT',
      physicalArtifactEvidence: {
        artifactSet: {
          appAsar: { sha256: 'package-sha' },
        },
      },
    },
    appAsarProof: presentFile('app.asar', 'package-sha'),
    audit: passingAudit(),
    visualComparisons: passingVisualComparisons(),
  });

  assert.equal(result.pass, true, JSON.stringify(result, null, 2));
  assert.equal(result.status, 'PASS_PACKAGED_ACCESSIBILITY_RESPONSIVE_VISUAL_REGRESSION');
  assert.equal(result.packageBinding.packageBound, true);
  assert.equal(result.audit.assertions.keyboardNavigation, true);
  assert.equal(result.visualRegression.pass, true);
  assert.equal(result.negativeAssertions.ciParityCanSubstitutePackagedVisualProof, false);
  assert.equal(result.negativeAssertions.missingPhysicalScreenshotCanPass, false);
  assert.equal(result.negativeAssertions.finalProgramDoDClaim, false);
});

test('E11 C03: exact screenshot hash mismatch can pass only when bounded pixel delta passes', async () => {
  const { evaluatePackagedAccessibilityResponsiveVisualRegression } = await loadModule();
  const comparisons = passingVisualComparisons();
  assert.equal(comparisons.every((row) => row.exactHashMatch === false), true);
  const result = evaluatePackagedAccessibilityResponsiveVisualRegression({
    c01Receipt: {
      pass: true,
      status: 'PASS_UNSIGNED_LOCAL_ARTIFACT',
      physicalArtifactEvidence: {
        artifactSet: {
          appAsar: { sha256: 'package-sha' },
        },
      },
    },
    appAsarProof: presentFile('app.asar', 'package-sha'),
    audit: passingAudit(),
    visualComparisons: comparisons,
  });

  assert.equal(result.pass, true);
  assert.equal(result.visualRegression.exactPngHashRequired, false);
  assert.equal(result.negativeAssertions.exactHashMismatchIsAutomaticFailure, false);
});

test('E11 C03: missing package binding, screenshot, focus, or visual delta is NOT_READY', async () => {
  const { evaluatePackagedAccessibilityResponsiveVisualRegression } = await loadModule();
  const comparisons = passingVisualComparisons();
  comparisons[1].current.exists = false;
  comparisons[1].pass = false;
  comparisons[2].delta.meanAbs = 5;
  comparisons[2].delta.withinLimits = false;
  comparisons[2].pass = false;
  const audit = passingAudit();
  audit.result.assertions.keyboardNavigation = false;
  const result = evaluatePackagedAccessibilityResponsiveVisualRegression({
    c01Receipt: {
      pass: true,
      status: 'PASS_UNSIGNED_LOCAL_ARTIFACT',
      physicalArtifactEvidence: {
        artifactSet: {
          appAsar: { sha256: 'package-sha' },
        },
      },
    },
    appAsarProof: presentFile('app.asar', 'different-sha'),
    audit,
    visualComparisons: comparisons,
  });

  assert.equal(result.pass, false);
  assert.equal(result.status, 'NOT_READY');
  assert.equal(result.packageBinding.packageBound, false);
  assert.equal(result.visualRegression.pass, false);
});

test('E11 C03: implementation reuses ER C06 audit, binds package artifact, and avoids runtime bypasses', () => {
  const source = read('scripts/ops/yalken-atlas-v5-e11-c03-packaged-accessibility-responsive-visual-regression.mjs');

  assert.match(source, /runAtlasRailResponsiveAudit/u);
  assert.match(source, /YALKEN_ATLAS_V5_E11_C01_MACOS_PACKAGE_ARTIFACT_SECURITY_RECEIPT/u);
  assert.match(source, /APP_ASAR/u);
  assert.match(source, /ER_C06_BASELINE_PATH/u);
  assert.match(source, /comparePng/u);
  assert.match(source, /exactPngHashRequired:\s*false/u);
  assert.match(source, /ciParityCanSubstitutePackagedVisualProof:\s*false/u);
  assert.match(source, /missingPhysicalScreenshotCanPass:\s*false/u);
  assert.doesNotMatch(source, /localStorage\.setItem/u);
  assert.doesNotMatch(source, /indexedDB/u);
  assert.doesNotMatch(source, /fetch\(/u);
  assert.doesNotMatch(source, /http:\/\/|https:\/\//u);
});
