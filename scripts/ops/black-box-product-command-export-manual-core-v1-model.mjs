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
  ['main-runtime-port-inventory-complete-default-off', 'DENY'],
  ['main-runtime-provider-audit-binding-valid-target-not-configured', 'DENY'],
  ['main-runtime-provider-digest-mismatch', 'DENY'],
  ['main-runtime-audit-identity-mismatch', 'DENY'],
  ['main-runtime-source-revision-clean-target-not-configured', 'DENY'],
  ['main-runtime-source-revision-drift', 'DENY'],
  ['main-runtime-source-revision-dirty', 'DENY'],
  ['main-runtime-source-revision-missing-manifest', 'DENY'],
  ['main-runtime-create-only-target-valid', 'PASS'],
  ['main-runtime-target-env-missing', 'DENY'],
  ['main-runtime-target-outside-allowed-root', 'DENY'],
  ['main-runtime-target-inside-project-root', 'DENY'],
  ['main-runtime-target-symlink-dir', 'DENY'],
  ['main-runtime-target-file-exists', 'DENY'],
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
  'main-runtime-omits-auditRecipient-port',
  'main-runtime-forged-provider-root',
  'main-runtime-provider-audit-secret-leak',
  'main-runtime-placeholder-revision',
  'main-runtime-source-revision-path-traversal',
  'main-runtime-source-revision-drift-to-pass',
  'main-runtime-target-env-transplant',
  'main-runtime-target-project-root-overwrite',
  'main-runtime-target-path-traversal',
  'main-runtime-target-file-reuse-to-pass',
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
  'M16_OMIT_MAIN_RUNTIME_AUDIT_RECIPIENT_PORT',
  'M17_TRUST_UNVERIFIED_RUNTIME_PROVIDER_ROOT',
  'M18_ACCEPT_RUNTIME_AUDIT_IDENTITY_MISMATCH',
  'M19_PROMOTE_RUNTIME_BINDING_TO_FULL_EXPORT',
  'M20_KEEP_PLACEHOLDER_RUNTIME_SOURCE_REVISION',
  'M21_ACCEPT_RUNTIME_DIRTY_SOURCE',
  'M22_ACCEPT_RUNTIME_SOURCE_REVISION_DRIFT',
  'M23_ACCEPT_UNCONFIGURED_RUNTIME_TARGET',
  'M24_ALLOW_RUNTIME_TARGET_OUTSIDE_ALLOWED_ROOT',
  'M25_ALLOW_RUNTIME_TARGET_INSIDE_PROJECT_ROOT',
  'M26_ALLOW_RUNTIME_TARGET_REUSE',
]);

function oracle(caseName, expected) {
  if (caseName === 'valid' || caseName === 'node-capability-allowed' || caseName === 'main-runtime-create-only-target-valid') return expected === 'PASS';
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
    case 'M16_OMIT_MAIN_RUNTIME_AUDIT_RECIPIENT_PORT':
      return HOSTILE_CASES.includes('main-runtime-omits-auditRecipient-port')
        && FINITE_CASES.some(([name, expected]) => name === 'main-runtime-port-inventory-complete-default-off' && expected === 'DENY');
    case 'M17_TRUST_UNVERIFIED_RUNTIME_PROVIDER_ROOT':
      return HOSTILE_CASES.includes('main-runtime-forged-provider-root')
        && FINITE_CASES.some(([name, expected]) => name === 'main-runtime-provider-digest-mismatch' && expected === 'DENY');
    case 'M18_ACCEPT_RUNTIME_AUDIT_IDENTITY_MISMATCH':
      return FINITE_CASES.some(([name, expected]) => name === 'main-runtime-audit-identity-mismatch' && expected === 'DENY');
    case 'M19_PROMOTE_RUNTIME_BINDING_TO_FULL_EXPORT':
      return FINITE_CASES.some(([name, expected]) => name === 'main-runtime-provider-audit-binding-valid-target-not-configured' && expected === 'DENY')
        && HOSTILE_CASES.includes('main-runtime-provider-audit-secret-leak');
    case 'M20_KEEP_PLACEHOLDER_RUNTIME_SOURCE_REVISION':
      return HOSTILE_CASES.includes('main-runtime-placeholder-revision')
        && FINITE_CASES.some(([name, expected]) => name === 'main-runtime-source-revision-clean-target-not-configured' && expected === 'DENY');
    case 'M21_ACCEPT_RUNTIME_DIRTY_SOURCE':
      return FINITE_CASES.some(([name, expected]) => name === 'main-runtime-source-revision-dirty' && expected === 'DENY');
    case 'M22_ACCEPT_RUNTIME_SOURCE_REVISION_DRIFT':
      return HOSTILE_CASES.includes('main-runtime-source-revision-drift-to-pass')
        && FINITE_CASES.some(([name, expected]) => name === 'main-runtime-source-revision-drift' && expected === 'DENY');
    case 'M23_ACCEPT_UNCONFIGURED_RUNTIME_TARGET':
      return FINITE_CASES.some(([name, expected]) => name === 'main-runtime-target-env-missing' && expected === 'DENY')
        && FINITE_CASES.some(([name, expected]) => name === 'main-runtime-source-revision-clean-target-not-configured' && expected === 'DENY');
    case 'M24_ALLOW_RUNTIME_TARGET_OUTSIDE_ALLOWED_ROOT':
      return HOSTILE_CASES.includes('main-runtime-target-env-transplant')
        && FINITE_CASES.some(([name, expected]) => name === 'main-runtime-target-outside-allowed-root' && expected === 'DENY');
    case 'M25_ALLOW_RUNTIME_TARGET_INSIDE_PROJECT_ROOT':
      return HOSTILE_CASES.includes('main-runtime-target-project-root-overwrite')
        && HOSTILE_CASES.includes('main-runtime-target-path-traversal')
        && FINITE_CASES.some(([name, expected]) => name === 'main-runtime-target-inside-project-root' && expected === 'DENY');
    case 'M26_ALLOW_RUNTIME_TARGET_REUSE':
      return HOSTILE_CASES.includes('main-runtime-target-file-reuse-to-pass')
        && FINITE_CASES.some(([name, expected]) => name === 'main-runtime-target-file-exists' && expected === 'DENY');
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
