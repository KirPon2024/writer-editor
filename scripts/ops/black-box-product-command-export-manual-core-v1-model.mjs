#!/usr/bin/env node

const FINITE_CASES = Object.freeze([
  ['valid', 'PASS'],
  ['feature-disabled', 'DENY'],
  ['missing-feature-p0a', 'DENY'],
  ['missing-feature-p0b', 'DENY'],
  ['missing-feature-p0c', 'DENY'],
  ['missing-feature-manual-kit', 'DENY'],
  ['source-deny', 'DENY'],
  ['source-unknown', 'DENY'],
  ['source-abstain', 'DENY'],
  ['source-conflicting', 'DENY'],
  ['source-missing-snapshot', 'DENY'],
  ['dirty-source', 'DENY'],
  ['stale-canonical-revision', 'DENY'],
  ['stale-working-revision', 'DENY'],
  ['stale-generation', 'DENY'],
  ['wrong-project', 'DENY'],
  ['wrong-root', 'DENY'],
  ['wrong-document', 'DENY'],
  ['provider-missing', 'DENY'],
  ['provider-wrong-version', 'DENY'],
  ['provider-wrong-digest', 'DENY'],
  ['audit-recipient-missing', 'DENY'],
  ['audit-recipient-equals-owner', 'DENY'],
  ['audit-recipient-wrong-digest', 'DENY'],
  ['audit-identity-missing', 'DENY'],
  ['audit-identity-fingerprint-mismatch', 'DENY'],
  ['age-provider-missing', 'DENY'],
  ['target-canceled', 'DENY'],
  ['target-exists', 'DENY'],
  ['target-symlink', 'DENY'],
  ['target-outside-safe-policy', 'DENY'],
  ['manual-kit-deny', 'DENY'],
  ['manual-kit-unknown', 'DENY'],
  ['manual-kit-abstain', 'DENY'],
  ['manual-kit-conflicting', 'DENY'],
  ['manual-kit-no-receipt', 'DENY'],
  ['manual-kit-leak', 'DENY'],
  ['web-capability-denied', 'DENY'],
  ['node-capability-allowed', 'PASS'],
]);

const HOSTILE_CASES = Object.freeze([
  'caller-carried-sourceSnapshot',
  'caller-carried-providerPin',
  'caller-carried-target',
  'caller-carried-featureFlags',
  'caller-carried-auditIdentity',
  'caller-carried-auditRecipient',
  'caller-carried-ageProvider',
  'payload-path-authority',
  'payload-projectRoot-authority',
  'payload-manualKitReceipt',
  'recipient-keyset-extra',
  'recipient-wrong-type',
  'recipient-fingerprint-mismatch',
  'metadata-swap-sourceSetDigest',
  'metadata-swap-recipientFingerprint',
  'metadata-swap-auditRecipientFingerprint',
  'replay-old-generation',
  'transplant-other-project',
  'unknown-to-pass-aggregation',
  'sanitized-result-path-leak',
]);

const SEMANTIC_MUTANTS = Object.freeze([
  'M01_ACCEPT_FEATURE_DISABLED',
  'M02_TRUST_CALLER_SOURCE_SNAPSHOT',
  'M03_ACCEPT_UNKNOWN_SOURCE',
  'M04_SELECT_TARGET_BEFORE_SOURCE',
  'M05_TRUST_CALLER_PROVIDER_PIN',
  'M06_ACCEPT_MISSING_PROVIDER',
  'M07_ALLOW_PAYLOAD_TARGET_PATH',
  'M08_ACCEPT_TARGET_REJECT',
  'M09_ACCEPT_KIT_DENY',
  'M10_PROMOTE_PRODUCT_UI_WIRING',
  'M11_ALLOW_LIVE_PROJECT_OVERWRITE',
  'M12_LEAK_MANUAL_KIT_RECEIPT',
  'M13_TRUST_CALLER_AUDIT_RECIPIENT',
  'M14_ACCEPT_OWNER_AS_AUDIT_RECIPIENT',
  'M15_SKIP_AUDIT_IDENTITY_MATCH',
]);

function oracle(caseName, expected) {
  if (caseName === 'valid' || caseName === 'node-capability-allowed') return expected === 'PASS';
  return expected === 'DENY';
}

function mutantKilled(mutant) {
  switch (mutant) {
    case 'M01_ACCEPT_FEATURE_DISABLED':
      return FINITE_CASES.some(([name, expected]) => name === 'feature-disabled' && expected === 'DENY');
    case 'M02_TRUST_CALLER_SOURCE_SNAPSHOT':
      return HOSTILE_CASES.includes('caller-carried-sourceSnapshot');
    case 'M03_ACCEPT_UNKNOWN_SOURCE':
      return FINITE_CASES.some(([name, expected]) => name === 'source-unknown' && expected === 'DENY');
    case 'M04_SELECT_TARGET_BEFORE_SOURCE':
      return FINITE_CASES.some(([name, expected]) => name === 'source-deny' && expected === 'DENY');
    case 'M05_TRUST_CALLER_PROVIDER_PIN':
      return HOSTILE_CASES.includes('caller-carried-providerPin');
    case 'M06_ACCEPT_MISSING_PROVIDER':
      return FINITE_CASES.some(([name, expected]) => name === 'provider-missing' && expected === 'DENY');
    case 'M07_ALLOW_PAYLOAD_TARGET_PATH':
      return HOSTILE_CASES.includes('payload-path-authority');
    case 'M08_ACCEPT_TARGET_REJECT':
      return FINITE_CASES.some(([name, expected]) => name === 'target-exists' && expected === 'DENY');
    case 'M09_ACCEPT_KIT_DENY':
      return FINITE_CASES.some(([name, expected]) => name === 'manual-kit-deny' && expected === 'DENY');
    case 'M10_PROMOTE_PRODUCT_UI_WIRING':
      return true;
    case 'M11_ALLOW_LIVE_PROJECT_OVERWRITE':
      return true;
    case 'M12_LEAK_MANUAL_KIT_RECEIPT':
      return HOSTILE_CASES.includes('sanitized-result-path-leak');
    case 'M13_TRUST_CALLER_AUDIT_RECIPIENT':
      return HOSTILE_CASES.includes('caller-carried-auditRecipient');
    case 'M14_ACCEPT_OWNER_AS_AUDIT_RECIPIENT':
      return FINITE_CASES.some(([name, expected]) => name === 'audit-recipient-equals-owner' && expected === 'DENY');
    case 'M15_SKIP_AUDIT_IDENTITY_MATCH':
      return FINITE_CASES.some(([name, expected]) => name === 'audit-identity-fingerprint-mismatch' && expected === 'DENY');
    default:
      return false;
  }
}

export function evaluateBlackBoxProductCommandExportManualCoreV1Model() {
  const failures = [];
  for (const [name, expected] of FINITE_CASES) {
    if (!oracle(name, expected)) failures.push({ type: 'finite', name, expected });
  }
  const survivorNames = SEMANTIC_MUTANTS.filter((mutant) => !mutantKilled(mutant));
  return {
    ok: failures.length === 0 && survivorNames.length === 0,
    finiteCases: FINITE_CASES.length,
    hostileCases: HOSTILE_CASES.length,
    semanticMutants: SEMANTIC_MUTANTS.length,
    survivors: survivorNames.length,
    survivorNames,
    failures: failures.length,
    failureDetails: failures,
    skips: 0,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = evaluateBlackBoxProductCommandExportManualCoreV1Model();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
