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
    'yalken-atlas-v5-e11-c02-packaged-critical-journey.mjs',
  )).href);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function presentFile(name, sha = `sha-${name}`) {
  return { path: `/physical/${name}`, exists: true, bytes: 100, sha256: sha };
}

function passingRuntime() {
  return {
    first: {
      ok: true,
      runtimeKind: 'production-app-runtime-harness',
      timedOut: false,
      exitCode: 0,
      networkRequests: 0,
      dialogCalls: 0,
      rendererProbe: {
        ok: 1,
        createOk: true,
        saveOk: true,
        sameLaunchReopenOk: true,
        docxExportOk: true,
        markdownImportSafeCreateOk: true,
        commandKernelRoute: true,
      },
    },
    second: {
      ok: true,
      runtimeKind: 'production-app-runtime-harness',
      timedOut: false,
      exitCode: 0,
      networkRequests: 0,
      dialogCalls: 0,
      rendererProbe: {
        ok: 1,
        markerStart: true,
        markerEnd: true,
      },
    },
    fileProofs: {
      docxExport: presentFile('journey.docx'),
      importedScene: presentFile('imported.txt'),
      projectManifest: presentFile('project.craftsman.json'),
    },
  };
}

test('E11 C02: evaluator passes only package-bound production runtime create/save/reopen/export/import journey', async () => {
  const { evaluatePackagedCriticalJourney } = await loadModule();
  const result = evaluatePackagedCriticalJourney({
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
    runtime: passingRuntime(),
  });

  assert.equal(result.pass, true, JSON.stringify(result, null, 2));
  assert.equal(result.status, 'PASS_PACKAGE_BOUND_RUNTIME_JOURNEY');
  assert.equal(result.packageBinding.packageBound, true);
  assert.equal(result.negativeAssertions.ciParityCanSubstitutePackagedJourney, false);
  assert.equal(result.negativeAssertions.directRendererStorageMutation, false);
  assert.equal(result.negativeAssertions.finalProgramDoDClaim, false);
});

test('E11 C02: CI parity or missing package binding cannot certify the journey', async () => {
  const { evaluatePackagedCriticalJourney } = await loadModule();
  const result = evaluatePackagedCriticalJourney({
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
    runtime: passingRuntime(),
  });

  assert.equal(result.pass, false);
  assert.equal(result.status, 'NOT_READY');
  assert.equal(result.packageBinding.packageBound, false);
  assert.equal(result.packageBinding.ciParityIsNotPackageProof, true);
});

test('E11 C02: runtime journey must include fresh-process reopen and physical export/import files', async () => {
  const { evaluatePackagedCriticalJourney } = await loadModule();
  const runtime = passingRuntime();
  runtime.second.rendererProbe.markerEnd = false;
  runtime.fileProofs.docxExport.exists = false;
  const result = evaluatePackagedCriticalJourney({
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
    runtime,
  });

  assert.equal(result.pass, false);
  assert.equal(result.status, 'NOT_READY');
});

test('E11 C02: implementation uses Command Kernel bridge and production harness, not direct renderer storage', () => {
  const source = read('scripts/ops/yalken-atlas-v5-e11-c02-packaged-critical-journey.mjs');
  const harness = read('scripts/ops/production-app-runtime-harness.mjs');

  assert.match(source, /runProductionAppRuntimeHarness/u);
  assert.match(source, /invokeUiCommandBridge/u);
  assert.match(source, /cmd\.project\.tree\.createNode/u);
  assert.match(source, /cmd\.project\.save/u);
  assert.match(source, /cmd\.project\.document\.open/u);
  assert.match(source, /exportDocxMin/u);
  assert.match(source, /importMarkdownV1/u);
  assert.match(source, /ciParityCanSubstitutePackagedJourney:\s*false/u);
  assert.match(harness, /preserveTempRoot/u);
  assert.match(harness, /__PRODUCTION_APP_RUNTIME_HARNESS_TEMP_ROOT/u);
  assert.doesNotMatch(source, /localStorage\.setItem/u);
  assert.doesNotMatch(source, /indexedDB/u);
  assert.doesNotMatch(source, /fetch\(/u);
  assert.doesNotMatch(source, /http:\/\/|https:\/\//u);
});
