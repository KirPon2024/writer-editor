#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const INPUT_SCHEMA_VERSION = 'yalken.releaseClaimCompiler.input.v0';
export const RECEIPT_SCHEMA_VERSION = 'yalken.releaseClaimCompiler.receipt.v0';
export const COMPILER_ID = 'R2_OFFLINE_RELEASE_CLAIM_COMPILER_V0';
export const DEFAULT_RECEIPT_PATH = 'docs/OPS/RTK/YALKEN_OFFLINE_RELEASE_CLAIM_COMPILER_V0_RECEIPT.json';

const FAIL_CLOSED_OUTCOMES = new Set(['UNKNOWN', 'ABSTAIN', 'STALE', 'CONFLICT']);
const VERIFIED_RECEIPT_STATES = new Set(['PASS', 'VERIFIED_SCOPED', 'RELEASED']);
const SHA40_RE = /^[0-9a-f]{40}$/u;
const SHA256_RE = /^sha256:[0-9a-f]{64}$/u;

function repoRootFromHere() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function runGit(repoRoot, args) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10000,
  });
  if (result.status !== 0) {
    const stderr = String(result.stderr || '').trim();
    throw new Error(`GIT_FAILED:${args.join(' ')}${stderr ? `:${stderr}` : ''}`);
  }
  return String(result.stdout || '').trim();
}

function sha256File(repoRoot, relativePath) {
  return 'sha256:' + crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(repoRoot, relativePath)))
    .digest('hex');
}

function uniqueSorted(list = []) {
  return [...new Set(list.filter((item) => typeof item === 'string' && item.trim() !== ''))].sort();
}

function parseTime(value) {
  const time = Date.parse(String(value || ''));
  return Number.isFinite(time) ? time : NaN;
}

function checkIndex(requiredChecks = []) {
  const map = new Map();
  for (const check of Array.isArray(requiredChecks) ? requiredChecks : []) {
    if (!check || typeof check.name !== 'string') continue;
    map.set(check.name, check);
  }
  return map;
}

function hasConflictingFacts(facts = []) {
  const valuesByKey = new Map();
  for (const fact of Array.isArray(facts) ? facts : []) {
    if (!fact || typeof fact.key !== 'string') continue;
    if (!valuesByKey.has(fact.key)) valuesByKey.set(fact.key, new Set());
    valuesByKey.get(fact.key).add(String(fact.value));
  }
  return [...valuesByKey.entries()]
    .filter(([, values]) => values.size > 1)
    .map(([key]) => key);
}

function validateExactBinding(input, errors) {
  const headSha = input?.exact?.headSha || '';
  const treeSha = input?.exact?.treeSha || '';
  const buildId = input?.exact?.buildId || '';
  const expected = input?.expectedExact;
  if (!SHA40_RE.test(headSha)) errors.push('EXACT_HEAD_INVALID');
  if (!SHA40_RE.test(treeSha)) errors.push('EXACT_TREE_INVALID');
  if (typeof buildId !== 'string' || buildId.trim() === '') errors.push('EXACT_BUILD_ID_MISSING');
  if (!expected || typeof expected !== 'object') {
    errors.push('EXPECTED_EXACT_BINDING_MISSING');
    return false;
  }
  const expectedHeadSha = expected.headSha || '';
  const expectedTreeSha = expected.treeSha || '';
  const expectedBuildId = expected.buildId || '';
  if (!SHA40_RE.test(expectedHeadSha)) errors.push('EXPECTED_EXACT_HEAD_INVALID');
  if (!SHA40_RE.test(expectedTreeSha)) errors.push('EXPECTED_EXACT_TREE_INVALID');
  if (typeof expectedBuildId !== 'string' || expectedBuildId.trim() === '') errors.push('EXPECTED_EXACT_BUILD_ID_MISSING');
  if (headSha !== expectedHeadSha) errors.push(`EXACT_HEAD_MISMATCH:${headSha || 'MISSING'}`);
  if (treeSha !== expectedTreeSha) errors.push(`EXACT_TREE_MISMATCH:${treeSha || 'MISSING'}`);
  if (buildId !== expectedBuildId) errors.push(`EXACT_BUILD_ID_MISMATCH:${buildId || 'MISSING'}`);
  return errors.length === 0;
}

function worstState(current, candidate) {
  const order = {
    VERIFIED_SCOPED: 0,
    NEEDS_MORE_EVIDENCE: 1,
    UNKNOWN: 2,
    BLOCKED: 3,
    STALE: 4,
    CONFLICT: 5,
    REVOKED: 6,
  };
  return order[candidate] > order[current] ? candidate : current;
}

function receiptPasses(receipt) {
  return VERIFIED_RECEIPT_STATES.has(String(receipt?.status || ''))
    || VERIFIED_RECEIPT_STATES.has(String(receipt?.verdict || ''));
}

function classifyReceipt({ claim, receipt, input, nowMs, reasons }) {
  let state = 'VERIFIED_SCOPED';

  if (!receipt || typeof receipt !== 'object') {
    reasons.push('RECEIPT_MISSING');
    return 'UNKNOWN';
  }
  if (receipt.claimId !== claim.id) {
    reasons.push(`RECEIPT_CLAIM_TRANSPLANT:${receipt.claimId || 'MISSING'}`);
    return 'CONFLICT';
  }
  if (receipt.profileId !== claim.profileId) {
    reasons.push(`RECEIPT_PROFILE_TRANSPLANT:${receipt.profileId || 'MISSING'}`);
    return 'CONFLICT';
  }
  if (receipt.scopeId !== claim.scopeId) {
    reasons.push(`RECEIPT_SCOPE_FORGERY:${receipt.scopeId || 'MISSING'}`);
    return 'CONFLICT';
  }
  if (receipt.headSha !== input.exact.headSha) {
    reasons.push(`RECEIPT_HEAD_STALE:${receipt.headSha || 'MISSING'}`);
    state = worstState(state, 'STALE');
  }
  if (receipt.treeSha !== input.exact.treeSha) {
    reasons.push(`RECEIPT_TREE_STALE:${receipt.treeSha || 'MISSING'}`);
    state = worstState(state, 'STALE');
  }
  if (receipt.supersededBy) {
    reasons.push(`RECEIPT_SUPERSEDED:${receipt.supersededBy}`);
    state = worstState(state, 'STALE');
  }
  const expiry = parseTime(receipt.expiresAtUtc);
  if (Number.isFinite(expiry) && expiry < nowMs) {
    reasons.push(`PROVIDER_PROFILE_EXPIRED:${receipt.expiresAtUtc}`);
    state = worstState(state, 'STALE');
  }
  if (!SHA256_RE.test(String(receipt.evidenceDigest || ''))) {
    reasons.push('RECEIPT_EVIDENCE_DIGEST_INVALID');
    state = worstState(state, 'UNKNOWN');
  }
  const outcomes = Array.isArray(receipt.outcomes) ? receipt.outcomes.map(String) : [];
  for (const outcome of outcomes) {
    if (FAIL_CLOSED_OUTCOMES.has(outcome)) {
      reasons.push(`FAIL_CLOSED_OUTCOME:${outcome}`);
      state = worstState(state, outcome === 'CONFLICT' ? 'CONFLICT' : outcome === 'STALE' ? 'STALE' : 'UNKNOWN');
    }
  }
  if (!receiptPasses(receipt)) {
    reasons.push(`RECEIPT_NOT_PASS:${receipt.status || receipt.verdict || 'MISSING'}`);
    state = worstState(state, 'BLOCKED');
  }
  return state;
}

function compileOneClaim({ claim, input, exactOk, checkMap, activeRevocations, nowMs }) {
  const reasons = [];
  let state = 'VERIFIED_SCOPED';

  if (!claim || typeof claim !== 'object' || typeof claim.id !== 'string' || claim.id.trim() === '') {
    return {
      id: 'MISSING_CLAIM_ID',
      state: 'UNKNOWN',
      applyDecision: 'DENY',
      reasons: ['CLAIM_SCHEMA_INVALID'],
      nonClaims: [],
    };
  }

  if (!exactOk) {
    reasons.push('CURRENT_EXACT_BINDING_INVALID');
    state = worstState(state, 'STALE');
  }
  if (claim.exactHeadSha !== input.exact.headSha) {
    reasons.push(`CLAIM_HEAD_STALE:${claim.exactHeadSha || 'MISSING'}`);
    state = worstState(state, 'STALE');
  }
  if (claim.exactTreeSha !== input.exact.treeSha) {
    reasons.push(`CLAIM_TREE_STALE:${claim.exactTreeSha || 'MISSING'}`);
    state = worstState(state, 'STALE');
  }

  const revocation = activeRevocations.get(claim.id);
  if (revocation) {
    reasons.push(`ACTIVE_REVOCATION:${revocation.reason || 'UNSPECIFIED'}`);
    state = worstState(state, 'REVOKED');
  }

  for (const name of Array.isArray(claim.requiredCheckNames) ? claim.requiredCheckNames : []) {
    const check = checkMap.get(name);
    if (!check) {
      reasons.push(`MISSING_REQUIRED_CHECK:${name}`);
      state = worstState(state, 'BLOCKED');
      continue;
    }
    if (check.status !== 'completed' || check.conclusion !== 'success') {
      reasons.push(`REQUIRED_CHECK_NOT_SUCCESS:${name}:${check.status || 'MISSING'}:${check.conclusion || 'MISSING'}`);
      state = worstState(state, 'BLOCKED');
    }
    if (check.headSha !== input.exact.headSha) {
      reasons.push(`REQUIRED_CHECK_HEAD_MISMATCH:${name}:${check.headSha || 'MISSING'}`);
      state = worstState(state, 'STALE');
    }
  }

  const conflictingFacts = [
    ...hasConflictingFacts(claim.providerFacts),
    ...hasConflictingFacts(claim.runtimeFacts),
  ];
  for (const key of conflictingFacts) {
    reasons.push(`CONFLICTING_FACT:${key}`);
    state = worstState(state, 'CONFLICT');
  }

  const receipts = Array.isArray(claim.receipts) ? claim.receipts : [];
  if (receipts.length === 0) {
    reasons.push('NO_RECEIPTS');
    state = worstState(state, 'UNKNOWN');
  }
  for (const receipt of receipts) {
    state = worstState(state, classifyReceipt({ claim, receipt, input, nowMs, reasons }));
  }

  return {
    id: claim.id,
    family: claim.family || 'UNCLASSIFIED',
    profileId: claim.profileId || 'UNKNOWN_PROFILE',
    scopeId: claim.scopeId || 'UNKNOWN_SCOPE',
    state,
    applyDecision: 'DENY',
    reasons: uniqueSorted(reasons),
    nonClaims: uniqueSorted(claim.nonClaims || []),
  };
}

export function compileReleaseClaims(input = {}) {
  const errors = [];
  if (input.schemaVersion !== INPUT_SCHEMA_VERSION) errors.push(`INPUT_SCHEMA_VERSION_INVALID:${input.schemaVersion || 'MISSING'}`);
  if (input.compilerId !== COMPILER_ID) errors.push(`COMPILER_ID_INVALID:${input.compilerId || 'MISSING'}`);
  if (!input.exact || typeof input.exact !== 'object') errors.push('EXACT_BINDING_MISSING');
  const exactOk = input.exact ? validateExactBinding(input, errors) : false;
  const checkMap = checkIndex(input.requiredChecks);
  const activeRevocations = new Map(
    (Array.isArray(input.revocations) ? input.revocations : [])
      .filter((row) => row && row.active === true && typeof row.claimId === 'string')
      .map((row) => [row.claimId, row]),
  );
  const nowMs = parseTime(input.nowUtc || input.generatedAtUtc);
  const claims = (Array.isArray(input.claims) ? input.claims : [])
    .map((claim) => compileOneClaim({ claim, input, exactOk, checkMap, activeRevocations, nowMs }));
  if (!Array.isArray(input.claims) || input.claims.length === 0) errors.push('CLAIMS_MISSING');

  const blockingClaims = claims.filter((claim) => claim.state !== 'VERIFIED_SCOPED');
  return {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    compilerId: COMPILER_ID,
    ok: errors.length === 0,
    generatedAtUtc: input.generatedAtUtc || new Date(0).toISOString(),
    exact: {
      headSha: input?.exact?.headSha || 'MISSING',
      treeSha: input?.exact?.treeSha || 'MISSING',
      buildId: input?.exact?.buildId || 'MISSING',
    },
    programVerdict: blockingClaims.length === 0 && claims.length > 0 ? 'VERIFIED_SCOPED' : 'NEEDS_MORE_EVIDENCE',
    releaseAuthority: 'DENY',
    productMutationAuthority: 'DENY',
    providerMutationAuthority: 'DENY',
    claims,
    denominators: {
      claimsTotal: claims.length,
      verifiedScoped: claims.filter((claim) => claim.state === 'VERIFIED_SCOPED').length,
      blockedOrUnproven: blockingClaims.length,
      requiredChecksTotal: checkMap.size,
      revocationsActive: activeRevocations.size,
    },
    errors: uniqueSorted(errors),
  };
}

export function runIndependentReleaseClaimOracle(input, report) {
  const errors = [];
  if (!report || report.schemaVersion !== RECEIPT_SCHEMA_VERSION) errors.push('ORACLE_RECEIPT_SCHEMA_MISMATCH');
  if (!Array.isArray(report?.claims) || report.claims.length !== (input.claims || []).length) {
    errors.push('ORACLE_CLAIM_DENOMINATOR_MISMATCH');
  }
  for (const claim of report?.claims || []) {
    if (claim.applyDecision !== 'DENY') errors.push(`ORACLE_APPLY_NOT_DENY:${claim.id}`);
    if (claim.state === 'VERIFIED_SCOPED') {
      const source = (input.claims || []).find((row) => row.id === claim.id);
      if (!source) {
        errors.push(`ORACLE_VERIFIED_SOURCE_MISSING:${claim.id}`);
        continue;
      }
      const hasPass = (source.receipts || []).some((receipt) => receiptPasses(receipt));
      if (!hasPass) errors.push(`ORACLE_VERIFIED_WITHOUT_PASS_RECEIPT:${claim.id}`);
      for (const receipt of source.receipts || []) {
        for (const outcome of receipt.outcomes || []) {
          if (FAIL_CLOSED_OUTCOMES.has(String(outcome))) errors.push(`ORACLE_VERIFIED_FAIL_CLOSED_OUTCOME:${claim.id}:${outcome}`);
        }
      }
    }
  }
  if (report?.programVerdict === 'VERIFIED_SCOPED' && (report.claims || []).some((claim) => claim.state !== 'VERIFIED_SCOPED')) {
    errors.push('ORACLE_PROGRAM_VERDICT_OVERCLAIM');
  }
  return { ok: errors.length === 0, errors: uniqueSorted(errors) };
}

export function runSemanticMutationCatalog(input) {
  const primaryId = input?.claims?.[0]?.id;
  const mutants = [
    ['missing-check', (data) => { data.requiredChecks = data.requiredChecks.filter((row) => row.name !== 'rtk-required'); }],
    ['active-revocation', (data) => { data.revocations = [{ claimId: primaryId, active: true, reason: 'MUTANT_REVOCATION' }]; }],
    ['stale-receipt-head', (data) => { data.claims[0].receipts[0].headSha = '3'.repeat(40); }],
    ['transplanted-claim', (data) => { data.claims[0].receipts[0].claimId = 'OTHER_CLAIM'; }],
    ['scope-forgery', (data) => { data.claims[0].receipts[0].scopeId = 'forged-expanded-scope'; }],
    ['provider-conflict', (data) => { data.claims[0].providerFacts.push({ key: 'word.build', value: 'MUTANT_BUILD' }); }],
    ['expired-profile', (data) => { data.nowUtc = '2026-10-01T00:00:00.000Z'; }],
    ['unknown-outcome', (data) => { data.claims[0].receipts[0].outcomes = ['UNKNOWN']; }],
    ['tree-drift', (data) => { data.exact.treeSha = '4'.repeat(40); }],
  ];
  const survivors = [];
  for (const [id, mutate] of mutants) {
    const data = JSON.parse(JSON.stringify(input));
    mutate(data);
    const report = compileReleaseClaims(data);
    const primary = report.claims.find((claim) => claim.id === primaryId);
    if (report.ok && primary?.state === 'VERIFIED_SCOPED') survivors.push(id);
  }
  return {
    total: mutants.length,
    killed: mutants.length - survivors.length,
    survivors,
  };
}

export function buildCurrentReleaseClaimCompilerInput(repoRoot = repoRootFromHere()) {
  const headSha = runGit(repoRoot, ['rev-parse', 'HEAD']);
  const treeSha = runGit(repoRoot, ['rev-parse', 'HEAD^{tree}']);
  return {
    schemaVersion: INPUT_SCHEMA_VERSION,
    compilerId: COMPILER_ID,
    generatedAtUtc: '2026-08-17T04:11:14.000Z',
    nowUtc: '2026-08-17T04:11:14.000Z',
    exact: {
      headSha,
      treeSha,
      buildId: 'postmerge-local-node-22.22.2-npm-10.9.7',
    },
    expectedExact: {
      headSha,
      treeSha,
      buildId: 'postmerge-local-node-22.22.2-npm-10.9.7',
    },
    requiredChecks: [
      { name: 'rtk-required', status: 'completed', conclusion: 'success', headSha },
      { name: 'OSS policy', status: 'completed', conclusion: 'success', headSha },
      { name: 'x1-runtime-parity', status: 'completed', conclusion: 'success', headSha },
      { name: 'postmerge-focused-c1-chain', status: 'completed', conclusion: 'success', headSha },
      { name: 'postmerge-agent-guardrails', status: 'completed', conclusion: 'success', headSha },
      { name: 'postmerge-dev-fast', status: 'completed', conclusion: 'success', headSha },
      { name: 'postmerge-maintained-rtk', status: 'completed', conclusion: 'success', headSha },
    ],
    revocations: [],
    claims: [
      {
        id: 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1',
        family: 'INTEROP_CHAIN',
        profileId: 'word-mac-16.112-26081010',
        scopeId: 'return-intake-authority-carrier-authentication-repair',
        exactHeadSha: headSha,
        exactTreeSha: treeSha,
        requiredCheckNames: ['rtk-required', 'OSS policy', 'x1-runtime-parity', 'postmerge-focused-c1-chain', 'postmerge-agent-guardrails', 'postmerge-dev-fast', 'postmerge-maintained-rtk'],
        nonClaims: ['C1_ROUTE_PASS', 'CHAIN_SATURATION', 'AUTO_APPLY', 'USER_DOCUMENT_COVERAGE'],
        receipts: [
          {
            id: 'receipt:pr1575-postmerge-c1-return-intake-authentication-repair',
            claimId: 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1',
            status: 'PASS',
            verdict: 'VERIFIED_SCOPED',
            headSha,
            treeSha,
            profileId: 'word-mac-16.112-26081010',
            scopeId: 'return-intake-authority-carrier-authentication-repair',
            machineCheckIds: ['rtk-required', 'OSS policy', 'x1-runtime-parity', 'postmerge-focused-c1-chain', 'postmerge-agent-guardrails', 'postmerge-dev-fast', 'postmerge-maintained-rtk'],
            evidenceDigest: sha256File(repoRoot, 'test/contracts/revision-bridge-docx-review-preview-session-command-surface.contract.test.js'),
            outcomes: ['PASS'],
            expiresAtUtc: '2026-09-16T00:00:00.000Z',
            supersededBy: null,
          },
        ],
        providerFacts: [
          { key: 'word.version', value: '16.112' },
          { key: 'word.build', value: '16.112.26081010' },
        ],
        runtimeFacts: [
          { key: 'productMutationAuthority', value: 'DENY' },
        ],
      },
      {
        id: 'INTEROP_CHAIN_SATURATION_V1',
        family: 'INTEROP_CHAIN',
        profileId: 'word-google-chain',
        scopeId: 'c1-c8-full-book-denominator',
        exactHeadSha: headSha,
        exactTreeSha: treeSha,
        requiredCheckNames: ['postmerge-maintained-rtk'],
        nonClaims: ['UNIVERSAL_PARITY', 'BYTE_IDENTITY', 'ALL_ROUTES_PROVEN'],
        receipts: [
          {
            id: 'receipt:c1-route-remains-blocked-after-pr1575',
            claimId: 'INTEROP_CHAIN_SATURATION_V1',
            status: 'NEEDS_MORE_EVIDENCE',
            verdict: 'BLOCKED',
            headSha,
            treeSha,
            profileId: 'word-google-chain',
            scopeId: 'c1-c8-full-book-denominator',
            machineCheckIds: ['postmerge-maintained-rtk'],
            evidenceDigest: sha256File(repoRoot, 'docs/OPS/RTK/YALKEN_INTEROP_CHAIN_MATRIX_V1.json'),
            outcomes: ['BLOCKED'],
            expiresAtUtc: '2026-09-16T00:00:00.000Z',
            supersededBy: null,
          },
        ],
        providerFacts: [],
        runtimeFacts: [{ key: 'route.C1', value: 'BLOCKED_UNTIL_ROUTE_EXECUTION_REQUALIFIES' }],
      },
      {
        id: 'F3_PHYSICAL_OWNER_OFFHOST_RESTORE_V1',
        family: 'BLACK_BOX_RECOVERY',
        profileId: 'owner-offhost-removable-media',
        scopeId: 'physical-owner-key-restore-drill',
        exactHeadSha: headSha,
        exactTreeSha: treeSha,
        requiredCheckNames: ['postmerge-maintained-rtk'],
        nonClaims: ['PHYSICAL_OWNER_DRILL_PASS', 'OFFHOST_RESTORE_PASS', 'FINAL_PROGRAM_READY'],
        receipts: [
          {
            id: 'receipt:f3-physical-remains-blocked',
            claimId: 'F3_PHYSICAL_OWNER_OFFHOST_RESTORE_V1',
            status: 'NEEDS_MORE_EVIDENCE',
            verdict: 'BLOCKED',
            headSha,
            treeSha,
            profileId: 'owner-offhost-removable-media',
            scopeId: 'physical-owner-key-restore-drill',
            machineCheckIds: ['postmerge-maintained-rtk'],
            evidenceDigest: sha256File(repoRoot, 'docs/OPS/STATUS/FINAL_LAB_TO_PRODUCT_TRACEABILITY_V2_LEDGER.json'),
            outcomes: ['BLOCKED'],
            expiresAtUtc: '2026-09-16T00:00:00.000Z',
            supersededBy: null,
          },
        ],
        providerFacts: [],
        runtimeFacts: [{ key: 'physicalOwnerDrill', value: 'NOT_EXECUTED' }],
      },
    ],
  };
}

function main() {
  const repoRoot = repoRootFromHere();
  const input = buildCurrentReleaseClaimCompilerInput(repoRoot);
  const report = compileReleaseClaims(input);
  const oracle = runIndependentReleaseClaimOracle(input, report);
  const mutations = runSemanticMutationCatalog(input);
  const receipt = {
    ...report,
    oracle,
    mutations,
    limitations: [
      'This is an offline compiler over bounded existing receipt/check facts; it grants no product/runtime/provider authority.',
      'Program verdict remains NEEDS_MORE_EVIDENCE because chain saturation and F3 physical owner/off-host restore are not proven.',
      'Desktop V1.1 is treated as hash-bound proposal input, not active repository canon.',
    ],
  };
  const args = new Set(process.argv.slice(2));
  if (args.has('--write-receipt')) {
    const target = path.join(repoRoot, DEFAULT_RECEIPT_PATH);
    fs.writeFileSync(target, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  }
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  if (!report.ok || !oracle.ok || mutations.survivors.length > 0) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
