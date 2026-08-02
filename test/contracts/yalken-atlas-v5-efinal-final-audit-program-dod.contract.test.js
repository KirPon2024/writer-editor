const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

async function loadModule() {
  return import(pathToFileURL(path.join(
    ROOT,
    'scripts',
    'ops',
    'yalken-atlas-v5-efinal-final-audit-program-dod.mjs',
  )).href);
}

function gitIdentity(headSha) {
  return {
    branch: 'main',
    headSha,
    originMainSha: headSha,
    headEqualsOriginMain: true,
    localDirtyFileCount: 0,
    remoteBranchExists: false,
  };
}

function passingJourney(headSha) {
  return {
    pass: true,
    status: 'PASS_PACKAGED_VISIBLE_UI_JOURNEY',
    sourceBinding: {
      headSha,
      originMainSha: headSha,
      packageBuiltAtHeadSha: headSha,
      appAsar: {
        exists: true,
        sha256: 'a'.repeat(64),
      },
    },
    accepted: {
      packagedExecutableRuntime: true,
      visibleUiInputUsed: true,
      atlasEntityRelationContinuityCommandsPersisted: true,
      manualMapCreateNodeEdgePersisted: true,
      sceneSaveMarkdownImportTxtExportPersisted: true,
      freshProcessReopenReadback: true,
      noDirectBridgeAcceptance: true,
      noGeneratedArtifactOnlyAcceptance: true,
    },
    acceptance: {
      persistedCommandAndFreshReopenProof: true,
      noProgramDoneClaim: true,
    },
    execution: {
      mode: 'FRESH_CURRENT_HEAD_PACKAGED_EXECUTION',
      invocationId: 'invocation-current-head',
      runnerInvoked: true,
      sourceUnchanged: true,
      error: '',
    },
  };
}

test('EFINAL: stored receipts and prior reports cannot pass without a fresh packaged invocation', async () => {
  const { evaluateFinalAudit } = await loadModule();
  const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const result = evaluateFinalAudit({
    repoRoot: ROOT,
    identity: gitIdentity(headSha),
  });

  assert.equal(result.pass, false);
  assert.equal(result.finalProgramDoDClaim, false);
  assert.equal(result.falseReadinessGuards.storedReceiptAggregationAcceptedAsReleaseProof, false);
  assert.equal(result.falseReadinessGuards.freshPackagedExecutionRequired, true);
  assert.ok(result.failures.some((failure) => failure.id === 'freshExecutableInvocation'));
});

test('EFINAL: exact current-head packaged execution reaches audit handoff without self-acceptance', async () => {
  const { evaluateFinalAudit } = await loadModule();
  const headSha = '1'.repeat(40);
  const result = evaluateFinalAudit({
    repoRoot: ROOT,
    identity: gitIdentity(headSha),
    currentHeadPackagedJourney: passingJourney(headSha),
  });

  assert.equal(result.pass, true, JSON.stringify(result.failures));
  assert.equal(result.status, 'PASS_EFINAL_FRESH_PACKAGED_GATE_READY_FOR_INDEPENDENT_AUDIT');
  assert.equal(result.finalProgramDoDClaim, false);
  assert.equal(result.currentHeadPackagedGate.pass, true);
  assert.equal(result.failures.length, 0);
});

test('EFINAL: stale package source, missing reopen, and receipt-shaped input fail closed', async () => {
  const { evaluateFinalAudit } = await loadModule();
  const headSha = '2'.repeat(40);
  const journey = passingJourney('3'.repeat(40));
  journey.accepted.freshProcessReopenReadback = false;
  journey.acceptance.persistedCommandAndFreshReopenProof = false;
  const result = evaluateFinalAudit({
    repoRoot: ROOT,
    identity: gitIdentity(headSha),
    currentHeadPackagedJourney: journey,
  });

  assert.equal(result.pass, false);
  assert.equal(result.finalProgramDoDClaim, false);
  assert.ok(result.failures.some((failure) => failure.id === 'sourceHeadMatchesInvocationHead'));
  assert.ok(result.failures.some((failure) => failure.id === 'packageBuiltAtInvocationHead'));
  assert.ok(result.failures.some((failure) => failure.id === 'freshProcessReopenReadback'));
  assert.ok(result.failures.some((failure) => failure.id === 'persistedCommandAndFreshReopenProof'));
});

test('EFINAL: executable wrapper invokes packaged build and runtime in the current invocation', async (t) => {
  const { writeFinalAuditReport } = await loadModule();
  const outDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'atlas-efinal-contract-'));
  t.after(async () => fsPromises.rm(outDir, { recursive: true, force: true }));
  let observedOptions = null;
  const result = await writeFinalAuditReport({
    repoRoot: ROOT,
    outDir,
    identityProvider: () => gitIdentity(
      execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    ),
    packagedJourneyRunner: async (options) => {
      observedOptions = options;
      const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
      return passingJourney(headSha);
    },
  });

  assert.equal(observedOptions.skipBuild, false);
  assert.equal(observedOptions.skipRuntime, false);
  assert.equal(result.pass, true, JSON.stringify(result.failures));
  assert.equal(result.currentHeadPackagedGate.execution.runnerInvoked, true);
  assert.equal(result.currentHeadPackagedGate.execution.sourceUnchanged, true);
  assert.equal(fs.existsSync(result.reportPath), true);
});

test('EFINAL: source binds the real packaged journey runner and contains no misleading capability labels', () => {
  const efinalSource = fs.readFileSync(path.join(
    ROOT,
    'scripts',
    'ops',
    'yalken-atlas-v5-efinal-final-audit-program-dod.mjs',
  ), 'utf8');
  const packagedSource = fs.readFileSync(path.join(
    ROOT,
    'scripts',
    'ops',
    'yalken-atlas-v5-final-audit-p0-03-packaged-visible-journey.mjs',
  ), 'utf8');

  assert.match(efinalSource, /runP0_03PackagedVisibleJourney/u);
  assert.match(efinalSource, /FRESH_CURRENT_HEAD_PACKAGED_EXECUTION/u);
  assert.match(efinalSource, /skipBuild:\s*false/u);
  assert.match(efinalSource, /skipRuntime:\s*false/u);
  assert.match(packagedSource, /atlasEntityRelationContinuityCommandsPersisted/u);
  assert.match(packagedSource, /manualMapCreateNodeEdgePersisted/u);
  assert.match(packagedSource, /sceneSaveMarkdownImportTxtExportPersisted/u);
  assert.match(packagedSource, /freshProcessReopenReadback/u);
  assert.doesNotMatch(packagedSource, /atlasCreateEditRelationContinuity/u);
  assert.doesNotMatch(packagedSource, /manualMapLifecyclePersisted/u);
  assert.doesNotMatch(packagedSource, /undoExportImportPersisted/u);

  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const requiredWorkflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'rtk-required.yml'), 'utf8');
  const requiredScript = packageJson.scripts['test:atlas-release-truth'] || '';
  assert.match(requiredScript, /yalken-atlas-v5-final-audit-p0-01-future-schema-loss\.contract\.test\.js/u);
  assert.match(requiredScript, /yalken-atlas-v5-final-audit-p0-03-packaged-visible-journey\.contract\.test\.js/u);
  assert.match(requiredScript, /yalken-atlas-v5-efinal-final-audit-program-dod\.contract\.test\.js/u);
  assert.match(requiredWorkflow, /npm run -s test:atlas-release-truth/u);
});
