#!/usr/bin/env node
import {
  buildGoogleDocsLocalFinalCompatibilityVerdictPacket,
  evaluateGoogleDocsLocalFinalCompatibilityVerdict,
  sha256Text,
} from './rtk-google-docs-local-final-compatibility-verdict-v1.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function mutate(label, expectedCode, mutator) {
  return { label, expectedCode, mutator };
}

function baseline() {
  return buildGoogleDocsLocalFinalCompatibilityVerdictPacket();
}

function oracle(packet) {
  const reference = baseline();
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) return 'GOOGLE_FINAL_VERDICT_SCHEMA_INVALID';
  if (packet.schemaVersion !== 'yalken.googleDocs.localFinalCompatibilityVerdict.v1') return 'GOOGLE_FINAL_VERDICT_SCHEMA_INVALID';
  if (packet.taskId !== 'GOOGLE_DOCS_LOCAL_FINAL_COMPATIBILITY_VERDICT_V1') return 'GOOGLE_FINAL_VERDICT_SCHEMA_INVALID';
  if (packet.provider !== 'google-docs') return 'GOOGLE_FINAL_VERDICT_PROFILE_MISMATCH';
  if (stableJson(packet.profileIds) !== stableJson([
    'google-docs-office-mode-post-d1-v1',
    'google-docs-native-conversion-post-d1-v1',
  ])) return 'GOOGLE_FINAL_VERDICT_PROFILE_MISMATCH';

  const narrative = stableJson({
    verdict: packet.verdict,
    localCompatibilityVerdict: packet.localCompatibilityVerdict,
    limitations: packet.limitations,
    blockers: packet.blockers,
  });
  if (['PASS', 'READY', 'SUPPORTED', 'GOOGLE_DOCS_READY', 'FULL_RELEASE_READY'].includes(String(packet.verdict || ''))
    || ['PASS', 'READY', 'SUPPORTED', 'GOOGLE_DOCS_READY', 'FULL_RELEASE_READY'].includes(String(packet.localCompatibilityVerdict || ''))) {
    if (/\b(UNKNOWN|ABSTAIN|WAIT_AUTHORITY|NEEDS_MORE_EVIDENCE|UNPROVEN)\b/u.test(narrative)) {
      return 'GOOGLE_FINAL_VERDICT_UNKNOWN_ABSTAIN_NOT_PASS';
    }
    return 'GOOGLE_FINAL_VERDICT_READY_OVERCLAIM';
  }

  if (packet.localOnly !== true) return 'GOOGLE_FINAL_VERDICT_LOCAL_ONLY_REQUIRED';
  if (packet.verdict !== 'NEEDS_MORE_EVIDENCE') return 'GOOGLE_FINAL_VERDICT_READY_OVERCLAIM';
  if (packet.localCompatibilityVerdict !== 'LOCAL_COMPATIBILITY_NEEDS_REAL_GOOGLE_E2E') return 'GOOGLE_FINAL_VERDICT_READY_OVERCLAIM';
  if (packet.realAccountE2E !== 'WAIT_AUTHORITY_REQUIRED_FOR_REAL_PROVIDER_EVIDENCE') return 'GOOGLE_FINAL_VERDICT_REAL_E2E_FALSE_GREEN';
  if (packet.requiredNextContour !== 'GOOGLE_DOCS_REAL_ACCOUNT_E2E_AUTHORITY_BOUNDARY') return 'GOOGLE_FINAL_VERDICT_REQUIRED_NEXT_CONTOUR_MISMATCH';
  if (packet.supportClaimed !== false) return 'GOOGLE_FINAL_VERDICT_SUPPORT_OVERCLAIM';
  if (packet.importClaimed !== false) return 'GOOGLE_FINAL_VERDICT_IMPORT_OVERCLAIM';
  if (packet.roundtripClaimed !== false) return 'GOOGLE_FINAL_VERDICT_ROUNDTRIP_OVERCLAIM';
  if (packet.applyAuthority !== 'DENY') return 'GOOGLE_FINAL_VERDICT_APPLY_OVERCLAIM';
  if (packet.productMutationAuthority !== 'DENY') return 'GOOGLE_FINAL_VERDICT_PRODUCT_MUTATION_OVERCLAIM';
  if (packet.wordEvidenceTransferred !== false) return 'GOOGLE_FINAL_VERDICT_WORD_EVIDENCE_TRANSFER';
  if (packet.googleAccountUsed !== false || packet.networkRuntimeUsed !== false || packet.userDocumentsUsed !== false) return 'GOOGLE_FINAL_VERDICT_EXTERNAL_AUTHORITY_OVERCLAIM';
  if (packet.physicalGoogleEvidence !== 0 || packet.productRuntimeWired !== 0) return 'GOOGLE_FINAL_VERDICT_EXTERNAL_AUTHORITY_OVERCLAIM';
  if (stableJson(packet.denominators) !== stableJson({
    requiredLocalContours: 7,
    includedLocalContours: 7,
    realGoogleE2ERequired: 1,
    realGoogleE2ECompleted: 0,
    supportClaims: 0,
    importClaims: 0,
    roundtripClaims: 0,
    applyAdmissions: 0,
    productMutations: 0,
  })) return 'GOOGLE_FINAL_VERDICT_DENOMINATOR_MISMATCH';
  if (!Array.isArray(packet.blockers)
    || packet.blockers.length !== 1
    || packet.blockers[0]?.blockerId !== 'GOOGLE_DOCS_REAL_ACCOUNT_E2E_AUTHORITY_BOUNDARY'
    || packet.blockers[0]?.blockerType !== 'WAIT_AUTHORITY') return 'GOOGLE_FINAL_VERDICT_BLOCKER_MISMATCH';
  if (!Array.isArray(packet.limitations)
    || packet.limitations.some((item) => /^(UNKNOWN|ABSTAIN)$/u.test(String(item || '').trim()))) return 'GOOGLE_FINAL_VERDICT_UNKNOWN_ABSTAIN_NOT_PASS';
  if (!Array.isArray(packet.localEvidence) || packet.localEvidence.length !== 7) return 'GOOGLE_FINAL_VERDICT_LOCAL_EVIDENCE_MISSING';
  const seen = new Set();
  for (const evidence of packet.localEvidence) {
    if (seen.has(evidence.contour)) return 'GOOGLE_FINAL_VERDICT_DUPLICATE_EVIDENCE';
    seen.add(evidence.contour);
  }
  for (const expected of reference.localEvidence) {
    const evidence = packet.localEvidence.find((entry) => entry?.contour === expected.contour);
    if (!evidence) return 'GOOGLE_FINAL_VERDICT_LOCAL_EVIDENCE_MISSING';
    if (evidence.status !== expected.status
      || evidence.result !== expected.result
      || evidence.receiptPath !== expected.receiptPath) return 'GOOGLE_FINAL_VERDICT_LOCAL_EVIDENCE_MISMATCH';
    if (evidence.receiptSha256 !== expected.receiptSha256) return 'GOOGLE_FINAL_VERDICT_RECEIPT_HASH_MISMATCH';
    if (evidence.realAccountE2E !== 'WAIT_AUTHORITY_REQUIRED_FOR_REAL_PROVIDER_EVIDENCE') return 'GOOGLE_FINAL_VERDICT_REAL_E2E_FALSE_GREEN';
    if (evidence.noProductMutation !== true
      || evidence.physicalGoogleEvidence !== 0
      || evidence.productRuntimeWired !== 0
      || evidence.supportClaimed !== false
      || evidence.importClaimed !== false
      || evidence.roundtripClaimed !== false
      || evidence.applyAuthority !== 'DENY') return 'GOOGLE_FINAL_VERDICT_LOCAL_EVIDENCE_OVERCLAIM';
  }
  return 'ACCEPT';
}

const hostileCases = Object.freeze([
  mutate('missing schema', 'GOOGLE_FINAL_VERDICT_SCHEMA_INVALID', (packet) => { delete packet.schemaVersion; }),
  mutate('wrong schema', 'GOOGLE_FINAL_VERDICT_SCHEMA_INVALID', (packet) => { packet.schemaVersion = 'wrong'; }),
  mutate('wrong task', 'GOOGLE_FINAL_VERDICT_SCHEMA_INVALID', (packet) => { packet.taskId = 'OTHER'; }),
  mutate('wrong provider', 'GOOGLE_FINAL_VERDICT_PROFILE_MISMATCH', (packet) => { packet.provider = 'word'; }),
  mutate('missing profile', 'GOOGLE_FINAL_VERDICT_PROFILE_MISMATCH', (packet) => { packet.profileIds = ['google-docs-office-mode-post-d1-v1']; }),
  mutate('profile transplant', 'GOOGLE_FINAL_VERDICT_PROFILE_MISMATCH', (packet) => { packet.profileIds[0] = 'word-16-112'; }),
  mutate('not local only', 'GOOGLE_FINAL_VERDICT_LOCAL_ONLY_REQUIRED', (packet) => { packet.localOnly = false; }),
  mutate('ready verdict', 'GOOGLE_FINAL_VERDICT_UNKNOWN_ABSTAIN_NOT_PASS', (packet) => { packet.verdict = 'READY'; }),
  mutate('pass local compatibility', 'GOOGLE_FINAL_VERDICT_UNKNOWN_ABSTAIN_NOT_PASS', (packet) => { packet.localCompatibilityVerdict = 'PASS'; }),
  mutate('support overclaim', 'GOOGLE_FINAL_VERDICT_SUPPORT_OVERCLAIM', (packet) => { packet.supportClaimed = true; }),
  mutate('import overclaim', 'GOOGLE_FINAL_VERDICT_IMPORT_OVERCLAIM', (packet) => { packet.importClaimed = true; }),
  mutate('roundtrip overclaim', 'GOOGLE_FINAL_VERDICT_ROUNDTRIP_OVERCLAIM', (packet) => { packet.roundtripClaimed = true; }),
  mutate('apply allow overclaim', 'GOOGLE_FINAL_VERDICT_APPLY_OVERCLAIM', (packet) => { packet.applyAuthority = 'ALLOW'; }),
  mutate('product mutation allow overclaim', 'GOOGLE_FINAL_VERDICT_PRODUCT_MUTATION_OVERCLAIM', (packet) => { packet.productMutationAuthority = 'ALLOW'; }),
  mutate('real e2e false green', 'GOOGLE_FINAL_VERDICT_REAL_E2E_FALSE_GREEN', (packet) => { packet.realAccountE2E = 'PASS'; }),
  mutate('wrong next contour', 'GOOGLE_FINAL_VERDICT_REQUIRED_NEXT_CONTOUR_MISMATCH', (packet) => { packet.requiredNextContour = 'GOOGLE_DOCS_SUPPORT_READY'; }),
  mutate('physical evidence overclaim', 'GOOGLE_FINAL_VERDICT_EXTERNAL_AUTHORITY_OVERCLAIM', (packet) => { packet.physicalGoogleEvidence = 1; }),
  mutate('runtime wired overclaim', 'GOOGLE_FINAL_VERDICT_EXTERNAL_AUTHORITY_OVERCLAIM', (packet) => { packet.productRuntimeWired = 1; }),
  mutate('google account used', 'GOOGLE_FINAL_VERDICT_EXTERNAL_AUTHORITY_OVERCLAIM', (packet) => { packet.googleAccountUsed = true; }),
  mutate('network runtime used', 'GOOGLE_FINAL_VERDICT_EXTERNAL_AUTHORITY_OVERCLAIM', (packet) => { packet.networkRuntimeUsed = true; }),
  mutate('user document used', 'GOOGLE_FINAL_VERDICT_EXTERNAL_AUTHORITY_OVERCLAIM', (packet) => { packet.userDocumentsUsed = true; }),
  mutate('word evidence transferred', 'GOOGLE_FINAL_VERDICT_WORD_EVIDENCE_TRANSFER', (packet) => { packet.wordEvidenceTransferred = true; }),
  mutate('denominator support', 'GOOGLE_FINAL_VERDICT_DENOMINATOR_MISMATCH', (packet) => { packet.denominators.supportClaims = 1; }),
  mutate('denominator real e2e done', 'GOOGLE_FINAL_VERDICT_DENOMINATOR_MISMATCH', (packet) => { packet.denominators.realGoogleE2ECompleted = 1; }),
  mutate('missing blocker', 'GOOGLE_FINAL_VERDICT_BLOCKER_MISMATCH', (packet) => { packet.blockers = []; }),
  mutate('wrong blocker type', 'GOOGLE_FINAL_VERDICT_BLOCKER_MISMATCH', (packet) => { packet.blockers[0].blockerType = 'PASS'; }),
  mutate('unknown limitation', 'GOOGLE_FINAL_VERDICT_UNKNOWN_ABSTAIN_NOT_PASS', (packet) => { packet.limitations = ['UNKNOWN']; }),
  mutate('abstain limitation', 'GOOGLE_FINAL_VERDICT_UNKNOWN_ABSTAIN_NOT_PASS', (packet) => { packet.limitations = ['ABSTAIN']; }),
  mutate('missing evidence', 'GOOGLE_FINAL_VERDICT_LOCAL_EVIDENCE_MISSING', (packet) => { packet.localEvidence.pop(); }),
  mutate('duplicate evidence', 'GOOGLE_FINAL_VERDICT_DUPLICATE_EVIDENCE', (packet) => { packet.localEvidence[1] = clone(packet.localEvidence[0]); }),
  mutate('receipt hash drift', 'GOOGLE_FINAL_VERDICT_RECEIPT_HASH_MISMATCH', (packet) => { packet.localEvidence[0].receiptSha256 = `sha256:${sha256Text('tampered')}`; }),
  mutate('local status drift', 'GOOGLE_FINAL_VERDICT_LOCAL_EVIDENCE_MISMATCH', (packet) => { packet.localEvidence[0].status = 'PASS'; }),
  mutate('local result drift', 'GOOGLE_FINAL_VERDICT_LOCAL_EVIDENCE_MISMATCH', (packet) => { packet.localEvidence[0].result = 'PASS'; }),
  mutate('local path transplant', 'GOOGLE_FINAL_VERDICT_LOCAL_EVIDENCE_MISMATCH', (packet) => { packet.localEvidence[0].receiptPath = packet.localEvidence[1].receiptPath; }),
  mutate('local real e2e false green', 'GOOGLE_FINAL_VERDICT_REAL_E2E_FALSE_GREEN', (packet) => { packet.localEvidence[0].realAccountE2E = 'PASS'; }),
  mutate('local no mutation false', 'GOOGLE_FINAL_VERDICT_LOCAL_EVIDENCE_OVERCLAIM', (packet) => { packet.localEvidence[0].noProductMutation = false; }),
  mutate('local physical overclaim', 'GOOGLE_FINAL_VERDICT_LOCAL_EVIDENCE_OVERCLAIM', (packet) => { packet.localEvidence[0].physicalGoogleEvidence = 1; }),
  mutate('local runtime overclaim', 'GOOGLE_FINAL_VERDICT_LOCAL_EVIDENCE_OVERCLAIM', (packet) => { packet.localEvidence[0].productRuntimeWired = 1; }),
  mutate('local support overclaim', 'GOOGLE_FINAL_VERDICT_LOCAL_EVIDENCE_OVERCLAIM', (packet) => { packet.localEvidence[0].supportClaimed = true; }),
  mutate('local apply overclaim', 'GOOGLE_FINAL_VERDICT_LOCAL_EVIDENCE_OVERCLAIM', (packet) => { packet.localEvidence[0].applyAuthority = 'ALLOW'; }),
]);

const semanticMutants = Object.freeze([
  mutate('verdict ready', 'GOOGLE_FINAL_VERDICT_UNKNOWN_ABSTAIN_NOT_PASS', (packet) => { packet.verdict = 'READY'; }),
  mutate('verdict pass', 'GOOGLE_FINAL_VERDICT_UNKNOWN_ABSTAIN_NOT_PASS', (packet) => { packet.verdict = 'PASS'; }),
  mutate('compat ready', 'GOOGLE_FINAL_VERDICT_UNKNOWN_ABSTAIN_NOT_PASS', (packet) => { packet.localCompatibilityVerdict = 'GOOGLE_DOCS_READY'; }),
  mutate('real e2e done', 'GOOGLE_FINAL_VERDICT_REAL_E2E_FALSE_GREEN', (packet) => { packet.realAccountE2E = 'GOOGLE_E2E_PASS'; }),
  mutate('support true', 'GOOGLE_FINAL_VERDICT_SUPPORT_OVERCLAIM', (packet) => { packet.supportClaimed = true; }),
  mutate('import true', 'GOOGLE_FINAL_VERDICT_IMPORT_OVERCLAIM', (packet) => { packet.importClaimed = true; }),
  mutate('roundtrip true', 'GOOGLE_FINAL_VERDICT_ROUNDTRIP_OVERCLAIM', (packet) => { packet.roundtripClaimed = true; }),
  mutate('apply allow', 'GOOGLE_FINAL_VERDICT_APPLY_OVERCLAIM', (packet) => { packet.applyAuthority = 'ALLOW'; }),
  mutate('mutation allow', 'GOOGLE_FINAL_VERDICT_PRODUCT_MUTATION_OVERCLAIM', (packet) => { packet.productMutationAuthority = 'ALLOW'; }),
  mutate('word transfer', 'GOOGLE_FINAL_VERDICT_WORD_EVIDENCE_TRANSFER', (packet) => { packet.wordEvidenceTransferred = true; }),
  mutate('account used', 'GOOGLE_FINAL_VERDICT_EXTERNAL_AUTHORITY_OVERCLAIM', (packet) => { packet.googleAccountUsed = true; }),
  mutate('network used', 'GOOGLE_FINAL_VERDICT_EXTERNAL_AUTHORITY_OVERCLAIM', (packet) => { packet.networkRuntimeUsed = true; }),
  mutate('user doc used', 'GOOGLE_FINAL_VERDICT_EXTERNAL_AUTHORITY_OVERCLAIM', (packet) => { packet.userDocumentsUsed = true; }),
  mutate('physical count', 'GOOGLE_FINAL_VERDICT_EXTERNAL_AUTHORITY_OVERCLAIM', (packet) => { packet.physicalGoogleEvidence = 12; }),
  mutate('runtime count', 'GOOGLE_FINAL_VERDICT_EXTERNAL_AUTHORITY_OVERCLAIM', (packet) => { packet.productRuntimeWired = 1; }),
  mutate('required contour target', 'GOOGLE_FINAL_VERDICT_REQUIRED_NEXT_CONTOUR_MISMATCH', (packet) => { packet.requiredNextContour = 'GOOGLE_DOCS_LOCAL_DONE'; }),
  mutate('denominator included plus one', 'GOOGLE_FINAL_VERDICT_DENOMINATOR_MISMATCH', (packet) => { packet.denominators.includedLocalContours = 8; }),
  mutate('denominator apply', 'GOOGLE_FINAL_VERDICT_DENOMINATOR_MISMATCH', (packet) => { packet.denominators.applyAdmissions = 1; }),
  mutate('missing local contour', 'GOOGLE_FINAL_VERDICT_LOCAL_EVIDENCE_MISSING', (packet) => { packet.localEvidence = packet.localEvidence.slice(0, 6); }),
  mutate('duplicate contour', 'GOOGLE_FINAL_VERDICT_DUPLICATE_EVIDENCE', (packet) => { packet.localEvidence[6] = clone(packet.localEvidence[5]); }),
  mutate('receipt digest reuse wrong', 'GOOGLE_FINAL_VERDICT_RECEIPT_HASH_MISMATCH', (packet) => { packet.localEvidence[1].receiptSha256 = packet.localEvidence[0].receiptSha256; }),
  mutate('local status pass', 'GOOGLE_FINAL_VERDICT_LOCAL_EVIDENCE_MISMATCH', (packet) => { packet.localEvidence[2].status = 'GOOGLE_DOCS_READY'; }),
  mutate('local result pass', 'GOOGLE_FINAL_VERDICT_LOCAL_EVIDENCE_MISMATCH', (packet) => { packet.localEvidence[3].result = 'ROUNDTRIP_PASS'; }),
  mutate('local path replay', 'GOOGLE_FINAL_VERDICT_LOCAL_EVIDENCE_MISMATCH', (packet) => { packet.localEvidence[4].receiptPath = packet.localEvidence[0].receiptPath; }),
  mutate('local e2e pass', 'GOOGLE_FINAL_VERDICT_REAL_E2E_FALSE_GREEN', (packet) => { packet.localEvidence[5].realAccountE2E = 'PASS'; }),
  mutate('local product write', 'GOOGLE_FINAL_VERDICT_LOCAL_EVIDENCE_OVERCLAIM', (packet) => { packet.localEvidence[6].noProductMutation = false; }),
  mutate('raw unknown', 'GOOGLE_FINAL_VERDICT_UNKNOWN_ABSTAIN_NOT_PASS', (packet) => { packet.limitations.push('UNKNOWN'); }),
  mutate('no wait blocker', 'GOOGLE_FINAL_VERDICT_BLOCKER_MISMATCH', (packet) => { packet.blockers[0].blockerId = 'NONE'; }),
]);

function runCases(cases) {
  const results = [];
  const reasonCounts = {};
  let survivors = 0;
  for (const item of cases) {
    const packet = baseline();
    item.mutator(packet);
    const expected = oracle(packet);
    const actual = evaluateGoogleDocsLocalFinalCompatibilityVerdict(packet);
    const ok = actual.ok === false && actual.code === item.expectedCode && expected === item.expectedCode;
    if (!ok) survivors += 1;
    reasonCounts[actual.code] = (reasonCounts[actual.code] || 0) + 1;
    results.push({
      label: item.label,
      ok,
      expectedCode: item.expectedCode,
      oracleCode: expected,
      actualCode: actual.code,
    });
  }
  return {
    total: cases.length,
    survivors,
    reasonCounts,
    results,
  };
}

export function runFiniteModel() {
  const packet = baseline();
  const expected = oracle(packet);
  const actual = evaluateGoogleDocsLocalFinalCompatibilityVerdict(packet);
  const accepted = expected === 'ACCEPT' && actual.ok === true ? 1 : 0;
  return {
    total: 1,
    accepted,
    rejected: accepted === 1 ? 0 : 1,
    mismatches: accepted === 1 ? 0 : 1,
    digest: `sha256:${sha256Text(stableJson({ expected, actual }))}`,
  };
}

export function runHostileCorpus() {
  return runCases(hostileCases);
}

export function runSemanticMutationCatalog() {
  return runCases(semanticMutants);
}

function main() {
  const finite = runFiniteModel();
  const hostile = runHostileCorpus();
  const mutants = runSemanticMutationCatalog();
  console.log(`FINITE_TOTAL=${finite.total}`);
  console.log(`FINITE_ACCEPTED=${finite.accepted}`);
  console.log(`FINITE_MISMATCHES=${finite.mismatches}`);
  console.log(`HOSTILE_TOTAL=${hostile.total}`);
  console.log(`HOSTILE_SURVIVORS=${hostile.survivors}`);
  console.log(`SEMANTIC_MUTANTS_TOTAL=${mutants.total}`);
  console.log(`SEMANTIC_MUTANTS_SURVIVORS=${mutants.survivors}`);
  if (finite.mismatches !== 0 || hostile.survivors !== 0 || mutants.survivors !== 0) {
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('rtk-google-docs-local-final-compatibility-verdict-model.mjs')) {
  main();
}
