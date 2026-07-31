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
    'yalken-atlas-v5-efinal-final-audit-program-dod.mjs',
  )).href);
}

test('EFINAL: final audit maps Program DoD and all 20 invariants to versioned evidence', async () => {
  const { evaluateFinalAudit } = await loadModule();
  const result = evaluateFinalAudit({ repoRoot: ROOT });

  assert.equal(result.pass, true);
  assert.equal(result.status, 'PASS_EFINAL_READY_FOR_DELIVERY');
  assert.equal(result.finalProgramDoDClaim, true);
  assert.equal(
    result.finalProgramDoDClaimScope,
    'READY_FOR_DELIVERY_PENDING_PR_MERGE_REMOTE_SHA_VERIFICATION_AND_CLEAN_WORKTREE',
  );
  assert.equal(result.programDodEvidenceMap.length, 20);
  assert.equal(result.criticalInvariants.length, 20);
  assert.equal(result.programDodEvidenceMap.every((row) => row.pass), true);
  assert.equal(result.criticalInvariants.every((row) => row.pass), true);
  assert.equal(result.activePlatformScope.macosPackagedElectron.includes('CERTIFIED'), true);
  assert.equal(result.activePlatformScope.windows, 'NOT_ACTIVATED_NO_PASS_NO_HOLD');
  assert.equal(result.finalAuditChecklist.finalSuitesRequiredInReceipt, true);
  assert.equal(result.finalAuditChecklist.noPlanOwnedWipRequiredAfterMerge, true);
});

test('EFINAL: missing receipt prevents Program DoD readiness', async () => {
  const { evaluateFinalAudit } = await loadModule();
  const result = evaluateFinalAudit({
    repoRoot: ROOT,
    requiredReceipts: {
      stage00: 'docs/OPS/STATUS/DOES_NOT_EXIST_EFINAL_NEGATIVE_RECEIPT.json',
    },
    dodMap: [['DOD_NEGATIVE', ['stage00']]],
    invariantMap: [['INV_NEGATIVE', ['stage00']]],
  });

  assert.equal(result.pass, false);
  assert.equal(result.status, 'NOT_READY_EFINAL_EVIDENCE_GAPS');
  assert.equal(result.finalProgramDoDClaim, false);
  assert.ok(result.failures.some((failure) => failure.code === 'RECEIPT_MISSING'));
  assert.ok(result.failures.some((failure) => failure.code === 'PROGRAM_DOD_EVIDENCE_MISSING'));
  assert.ok(result.failures.some((failure) => failure.code === 'CRITICAL_INVARIANT_EVIDENCE_MISSING'));
});

test('EFINAL: non-passing receipt cannot be used as readiness token', async () => {
  const { evaluateFinalAudit } = await loadModule();
  const result = evaluateFinalAudit({
    repoRoot: ROOT,
    requiredReceipts: {
      stage11c04: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E11_C00_ACTIVE_PLATFORM_CERTIFICATION_COMPILATION_RECEIPT.json',
    },
    dodMap: [['DOD_NEGATIVE_NON_PASS', ['stage11c04']]],
    invariantMap: [['INV_NEGATIVE_NON_PASS', ['stage11c04']]],
  });

  assert.equal(result.pass, false);
  assert.equal(result.finalProgramDoDClaim, false);
  assert.ok(result.failures.some((failure) => failure.code === 'RECEIPT_NOT_PASSING'));
});

test('EFINAL: final audit source does not certify inactive platforms or bypass final delivery', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'scripts', 'ops', 'yalken-atlas-v5-efinal-final-audit-program-dod.mjs'),
    'utf8',
  );

  assert.match(source, /NOT_ACTIVATED_NO_PASS_NO_HOLD/u);
  assert.doesNotMatch(source, /windows['"]?\s*:\s*['"]CERTIFIED/u);
  assert.doesNotMatch(source, /linux['"]?\s*:\s*['"]CERTIFIED/u);
  assert.match(source, /PENDING_PR_MERGE_REMOTE_SHA_VERIFICATION_AND_CLEAN_WORKTREE/u);
});
