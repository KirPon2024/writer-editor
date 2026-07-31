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
    'yalken-atlas-v5-e11-c04-packaged-performance-security-final-platform-handoff.mjs',
  )).href);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function presentFile(name, sha = `sha-${name}`) {
  return { path: `/physical/${name}`, exists: true, bytes: 100, sha256: sha };
}

function c01Receipt() {
  return {
    pass: true,
    status: 'PASS_UNSIGNED_LOCAL_ARTIFACT',
    physicalArtifactEvidence: {
      artifactSet: {
        appAsar: { sha256: 'package-sha' },
      },
    },
    atsPolicy: { ok: true },
    signing: { status: 'NOT_READY_NO_DEVELOPER_ID' },
    notarization: { status: 'NOT_READY_NO_NOTARYTOOL_PROFILE' },
    negativeAssertions: { runtimeNetworkActivated: false },
  };
}

function c02Receipt() {
  return {
    pass: true,
    status: 'PASS_PACKAGE_BOUND_RUNTIME_JOURNEY',
    packageBinding: {
      packageBound: true,
      appAsarSha256: 'package-sha',
    },
  };
}

function c03Receipt() {
  return {
    pass: true,
    status: 'PASS_PACKAGED_ACCESSIBILITY_RESPONSIVE_VISUAL_REGRESSION',
    packageBinding: {
      packageBound: true,
      appAsarSha256: 'package-sha',
    },
  };
}

function perfReport() {
  return {
    status: 'PASS',
    performanceProofKind: 'measured-worker-runtime-not-element-count',
    corpus: { nodeCount: 10000 },
    budgets: {
      p95WallTimeMs: 5000,
      p95InputLatencyMs: 32,
      p95FrameDelayMs: 32,
      maxHeapDeltaBytes: 1000,
    },
    metrics: {
      p95WallTimeMs: 100,
      p95InputLatencyMs: 1,
      p95FrameDelayMs: 1,
      maxHeapDeltaBytes: 0,
      executionModes: ['worker-thread'],
    },
    failures: [],
    authority: {
      syncSchedulerLabeledWorker: false,
      projectTruthMutation: false,
      storageMutation: false,
      networkMutation: false,
      rendererMutation: false,
    },
  };
}

function sastPass() {
  return {
    command: 'npm run -s security:audit:generic-sast',
    exitCode: 0,
    timedOut: false,
    parsed: {
      status: 'PASS',
      findings: 0,
      timeouts: 0,
      nonTimeoutErrors: 0,
      runner: '/semgrep',
      config: 'p/javascript,p/nodejs',
    },
  };
}

test('E11 C04: evaluator passes only with receipts, measured performance, and zero-gap SAST', async () => {
  const { evaluatePackagedPerformanceSecurityFinalPlatformHandoff } = await loadModule();
  const result = evaluatePackagedPerformanceSecurityFinalPlatformHandoff({
    c01Receipt: c01Receipt(),
    c02Receipt: c02Receipt(),
    c03Receipt: c03Receipt(),
    appAsarProof: presentFile('app.asar', 'package-sha'),
    perfReport: perfReport(),
    sast: sastPass(),
  });

  assert.equal(result.pass, true, JSON.stringify(result, null, 2));
  assert.equal(result.status, 'PASS_PACKAGED_PERFORMANCE_SECURITY_FINAL_PLATFORM_HANDOFF');
  assert.equal(result.receiptSet.pass, true);
  assert.equal(result.performance.pass, true);
  assert.equal(result.security.pass, true);
  assert.equal(result.limitations.localUnsignedArtifact, true);
  assert.equal(result.limitations.liveProductionDistributionClaim, false);
  assert.equal(result.negativeAssertions.finalProgramDoDClaim, false);
});

test('E11 C04: SAST timeouts, parser errors, or findings cannot pass', async () => {
  const { evaluatePackagedPerformanceSecurityFinalPlatformHandoff } = await loadModule();
  const sast = sastPass();
  sast.exitCode = 4;
  sast.parsed.status = 'STOP';
  sast.parsed.timeouts = 1;
  sast.parsed.nonTimeoutErrors = 1;
  sast.parsed.findings = 1;
  const result = evaluatePackagedPerformanceSecurityFinalPlatformHandoff({
    c01Receipt: c01Receipt(),
    c02Receipt: c02Receipt(),
    c03Receipt: c03Receipt(),
    appAsarProof: presentFile('app.asar', 'package-sha'),
    perfReport: perfReport(),
    sast,
  });

  assert.equal(result.pass, false);
  assert.equal(result.status, 'NOT_READY');
  assert.equal(result.security.pass, false);
  assert.equal(result.negativeAssertions.genericSastTimeoutCanPass, false);
  assert.equal(result.negativeAssertions.genericSastParserErrorCanPass, false);
});

test('E11 C04: element count or stale package binding cannot substitute performance/package proof', async () => {
  const { evaluatePackagedPerformanceSecurityFinalPlatformHandoff } = await loadModule();
  const perf = perfReport();
  perf.performanceProofKind = 'element-count-only';
  perf.metrics.executionModes = ['sync-fallback'];
  const result = evaluatePackagedPerformanceSecurityFinalPlatformHandoff({
    c01Receipt: c01Receipt(),
    c02Receipt: c02Receipt(),
    c03Receipt: c03Receipt(),
    appAsarProof: presentFile('app.asar', 'wrong-sha'),
    perfReport: perf,
    sast: sastPass(),
  });

  assert.equal(result.pass, false);
  assert.equal(result.receiptSet.pass, false);
  assert.equal(result.performance.pass, false);
  assert.equal(result.negativeAssertions.elementCountCanSubstitutePerformanceProof, false);
});

test('E11 C04: implementation hardens Semgrep timeout policy and keeps inactive platforms honest', () => {
  const source = read('scripts/ops/yalken-atlas-v5-e11-c04-packaged-performance-security-final-platform-handoff.mjs');
  const sastRunner = read('semgrep-generic-sast.mjs');

  assert.match(source, /E11_C01_MACOS_PACKAGE_ARTIFACT_SECURITY_RECEIPT/u);
  assert.match(source, /E11_C02_PACKAGED_CRITICAL_JOURNEY_RECEIPT/u);
  assert.match(source, /E11_C03_PACKAGED_ACCESSIBILITY_RESPONSIVE_VISUAL_REGRESSION_RECEIPT/u);
  assert.match(source, /yalken-atlas-v5-er-c05-10k-worker-budget/u);
  assert.match(source, /security:audit:generic-sast/u);
  assert.match(source, /windows: 'NOT_ACTIVATED_NO_PASS_NO_HOLD'/u);
  assert.match(source, /finalProgramDoDClaim:\s*false/u);
  assert.match(sastRunner, /"--timeout", "30", "--timeout-threshold", "0"/u);
  assert.match(sastRunner, /timeouts_present/u);
  assert.doesNotMatch(source, /fetch\(/u);
  assert.doesNotMatch(source, /http:\/\/|https:\/\//u);
});
