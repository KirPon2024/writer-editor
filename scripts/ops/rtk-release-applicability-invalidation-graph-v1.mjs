#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const INPUT_SCHEMA_VERSION = 'yalken.releaseApplicabilityInvalidationGraph.input.v1';
export const RECEIPT_SCHEMA_VERSION = 'yalken.releaseApplicabilityInvalidationGraph.receipt.v1';
export const COMPILER_ID = 'R3_APPLICABILITY_INVALIDATION_GRAPH_V1';
export const CURRENT_HEAD = '1e426888608608472530bafeee65a438a87f3128';
export const CURRENT_TREE = '8db09733574644e8092077a10414b6e51b0d9349';
export const R2_RECEIPT_HEAD = '1e426888608608472530bafeee65a438a87f3128';
export const R2_RECEIPT_TREE = '8db09733574644e8092077a10414b6e51b0d9349';
export const DEFAULT_RECEIPT_PATH = 'docs/OPS/RTK/YALKEN_RELEASE_APPLICABILITY_INVALIDATION_GRAPH_V1_RECEIPT.json';

const SHA40_RE = /^[0-9a-f]{40}$/u;
const SHA256_RE = /^sha256:[0-9a-f]{64}$/u;
const VERIFIED_STATES = new Set(['PASS', 'VERIFIED_SCOPED', 'RELEASED']);
const FAIL_CLOSED_OUTCOMES = new Set(['UNKNOWN', 'ABSTAIN', 'STALE', 'CONFLICT', 'BLOCKED', 'NEEDS_MORE_EVIDENCE']);

const STATE_RANK = {
  APPLICABLE_SCOPED: 0,
  NEEDS_MORE_EVIDENCE: 1,
  UNKNOWN: 2,
  BLOCKED: 3,
  STALE: 4,
  CONFLICT: 5,
  REVOKED: 6,
};

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

function verifiedStatus(...values) {
  return values.some((value) => VERIFIED_STATES.has(String(value || '')));
}

function worseState(left, right) {
  const leftRank = STATE_RANK[left] ?? STATE_RANK.UNKNOWN;
  const rightRank = STATE_RANK[right] ?? STATE_RANK.UNKNOWN;
  return rightRank > leftRank ? right : left;
}

function stateForOutcome(outcome) {
  if (outcome === 'CONFLICT') return 'CONFLICT';
  if (outcome === 'STALE') return 'STALE';
  if (outcome === 'BLOCKED' || outcome === 'NEEDS_MORE_EVIDENCE') return 'BLOCKED';
  if (outcome === 'UNKNOWN' || outcome === 'ABSTAIN') return 'UNKNOWN';
  return 'UNKNOWN';
}

function activeRows(rows = [], predicate) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row && row.active === true && predicate(row));
}

function exactBindingOk(input, errors) {
  const headSha = input?.exact?.headSha || '';
  const treeSha = input?.exact?.treeSha || '';
  const buildId = input?.exact?.buildId || '';
  if (!SHA40_RE.test(headSha)) errors.push('EXACT_HEAD_INVALID');
  if (!SHA40_RE.test(treeSha)) errors.push('EXACT_TREE_INVALID');
  if (typeof buildId !== 'string' || buildId.trim() === '') errors.push('EXACT_BUILD_ID_MISSING');
  if (headSha !== CURRENT_HEAD) errors.push(`EXACT_HEAD_MISMATCH:${headSha || 'MISSING'}`);
  if (treeSha !== CURRENT_TREE) errors.push(`EXACT_TREE_MISMATCH:${treeSha || 'MISSING'}`);
  return errors.length === 0;
}

function makeNodeShell(claim) {
  return {
    id: typeof claim?.id === 'string' && claim.id.trim() ? claim.id : 'MISSING_CLAIM_ID',
    family: claim?.family || 'UNCLASSIFIED',
    profileId: claim?.profileId || 'UNKNOWN_PROFILE',
    scopeId: claim?.scopeId || 'UNKNOWN_SCOPE',
    denominatorId: claim?.denominatorId || 'UNKNOWN_DENOMINATOR',
    state: 'APPLICABLE_SCOPED',
    applicabilityDecision: 'APPLIES_TO_EXACT_SCOPE_ONLY',
    reasons: [],
    invalidatedBy: [],
    nonClaims: uniqueSorted(claim?.nonClaims || []),
  };
}

function applyReason(node, state, reason, invalidatedBy = '') {
  node.state = worseState(node.state, state);
  node.reasons.push(reason);
  if (invalidatedBy) node.invalidatedBy.push(invalidatedBy);
}

function classifySourceReceipts({ claim, node, sourceReceiptMap }) {
  const ids = Array.isArray(claim.sourceReceiptIds) ? claim.sourceReceiptIds : [];
  if (ids.length === 0) {
    applyReason(node, 'UNKNOWN', 'SOURCE_RECEIPT_IDS_MISSING');
    return;
  }
  for (const id of ids) {
    const receipt = sourceReceiptMap.get(id);
    if (!receipt) {
      applyReason(node, 'BLOCKED', `SOURCE_RECEIPT_MISSING:${id}`, id);
      continue;
    }
    if (!SHA40_RE.test(String(receipt.headSha || '')) || !SHA40_RE.test(String(receipt.treeSha || ''))) {
      applyReason(node, 'UNKNOWN', `SOURCE_RECEIPT_EXACT_INVALID:${id}`, id);
    }
    if (!SHA256_RE.test(String(receipt.evidenceDigest || ''))) {
      applyReason(node, 'UNKNOWN', `SOURCE_RECEIPT_DIGEST_INVALID:${id}`, id);
    }
    if (receipt.supersededBy) {
      applyReason(node, 'STALE', `SOURCE_RECEIPT_SUPERSEDED:${id}:${receipt.supersededBy}`, id);
    }
    if (!verifiedStatus(receipt.status, receipt.verdict)) {
      applyReason(node, 'BLOCKED', `SOURCE_RECEIPT_NOT_VERIFIED:${id}:${receipt.status || 'MISSING'}:${receipt.verdict || 'MISSING'}`, id);
    }
  }
}

function classifyProvider({ claim, node, providerProfileMap, nowMs }) {
  if (claim.providerProfileId === null || claim.providerProfileId === undefined || claim.providerProfileId === '') return;
  const profile = providerProfileMap.get(claim.providerProfileId);
  if (!profile) {
    applyReason(node, 'BLOCKED', `PROVIDER_PROFILE_MISSING:${claim.providerProfileId}`, claim.providerProfileId);
    return;
  }
  if (profile.id !== claim.profileId) {
    applyReason(node, 'CONFLICT', `PROVIDER_PROFILE_TRANSPLANT:${profile.id}:${claim.profileId}`, profile.id);
  }
  if (!SHA256_RE.test(String(profile.evidenceDigest || ''))) {
    applyReason(node, 'UNKNOWN', `PROVIDER_PROFILE_DIGEST_INVALID:${profile.id}`, profile.id);
  }
  if (profile.status !== 'CURRENT_VERIFIED') {
    applyReason(node, 'BLOCKED', `PROVIDER_PROFILE_NOT_CURRENT:${profile.id}:${profile.status || 'MISSING'}`, profile.id);
  }
  const expiry = parseTime(profile.expiresAtUtc);
  if (Number.isFinite(expiry) && Number.isFinite(nowMs) && expiry < nowMs) {
    applyReason(node, 'STALE', `PROVIDER_PROFILE_EXPIRED:${profile.id}:${profile.expiresAtUtc}`, profile.id);
  }
}

function classifyClaimReceiptRefs({ claim, node, input }) {
  const refs = Array.isArray(claim.receiptRefs) ? claim.receiptRefs : [];
  if (refs.length === 0) {
    applyReason(node, 'UNKNOWN', 'CLAIM_RECEIPT_REFS_MISSING');
    return;
  }
  for (const receipt of refs) {
    const receiptId = receipt?.id || 'MISSING_RECEIPT_ID';
    if (!receipt || typeof receipt !== 'object') {
      applyReason(node, 'UNKNOWN', 'CLAIM_RECEIPT_REF_INVALID');
      continue;
    }
    if (receipt.claimId !== claim.id) {
      applyReason(node, 'CONFLICT', `RECEIPT_CLAIM_TRANSPLANT:${receiptId}:${receipt.claimId || 'MISSING'}`, receiptId);
    }
    if (receipt.profileId !== claim.profileId) {
      applyReason(node, 'CONFLICT', `RECEIPT_PROFILE_TRANSPLANT:${receiptId}:${receipt.profileId || 'MISSING'}`, receiptId);
    }
    if (receipt.scopeId !== claim.scopeId) {
      applyReason(node, 'CONFLICT', `RECEIPT_SCOPE_FORGERY:${receiptId}:${receipt.scopeId || 'MISSING'}:${claim.scopeId || 'MISSING'}`, receiptId);
    }
    if (receipt.headSha !== input.exact.headSha) {
      applyReason(node, 'STALE', `RECEIPT_HEAD_STALE:${receiptId}:${receipt.headSha || 'MISSING'}`, receiptId);
    }
    if (receipt.treeSha !== input.exact.treeSha) {
      applyReason(node, 'STALE', `RECEIPT_TREE_STALE:${receiptId}:${receipt.treeSha || 'MISSING'}`, receiptId);
    }
    if (!SHA256_RE.test(String(receipt.evidenceDigest || ''))) {
      applyReason(node, 'UNKNOWN', `RECEIPT_DIGEST_INVALID:${receiptId}`, receiptId);
    }
    if (receipt.supersededBy) {
      applyReason(node, 'STALE', `RECEIPT_SUPERSEDED:${receiptId}:${receipt.supersededBy}`, receiptId);
    }
    if (!verifiedStatus(receipt.status, receipt.verdict)) {
      applyReason(node, 'BLOCKED', `RECEIPT_NOT_VERIFIED_SCOPED:${receiptId}:${receipt.status || 'MISSING'}:${receipt.verdict || 'MISSING'}`, receiptId);
    }
    for (const outcome of Array.isArray(receipt.outcomes) ? receipt.outcomes.map(String) : []) {
      if (FAIL_CLOSED_OUTCOMES.has(outcome)) {
        applyReason(node, stateForOutcome(outcome), `FAIL_CLOSED_RECEIPT_OUTCOME:${receiptId}:${outcome}`, receiptId);
      }
    }
  }
}

function classifyClaimOutcomes({ claim, node }) {
  if (!verifiedStatus(claim.status, claim.verdict)) {
    applyReason(node, 'BLOCKED', `CLAIM_NOT_VERIFIED_SCOPED:${claim.status || 'MISSING'}:${claim.verdict || 'MISSING'}`);
  }
  for (const outcome of Array.isArray(claim.outcomes) ? claim.outcomes.map(String) : []) {
    if (FAIL_CLOSED_OUTCOMES.has(outcome)) {
      applyReason(node, stateForOutcome(outcome), `FAIL_CLOSED_CLAIM_OUTCOME:${outcome}`);
    }
  }
}

function classifyOneClaim({
  claim,
  input,
  exactOk,
  sourceReceiptMap,
  providerProfileMap,
  activeRevocationMap,
  activeSupersessionMap,
  conflictClaimIds,
  nowMs,
}) {
  const node = makeNodeShell(claim);
  if (!claim || typeof claim !== 'object' || typeof claim.id !== 'string' || claim.id.trim() === '') {
    applyReason(node, 'UNKNOWN', 'CLAIM_SCHEMA_INVALID');
    return node;
  }

  if (!exactOk) applyReason(node, 'STALE', 'CURRENT_EXACT_BINDING_INVALID');
  if (claim.exactHeadSha !== input.exact.headSha) {
    applyReason(node, 'STALE', `CLAIM_HEAD_STALE:${claim.exactHeadSha || 'MISSING'}`);
  }
  if (claim.exactTreeSha !== input.exact.treeSha) {
    applyReason(node, 'STALE', `CLAIM_TREE_STALE:${claim.exactTreeSha || 'MISSING'}`);
  }

  classifySourceReceipts({ claim, node, sourceReceiptMap });
  classifyProvider({ claim, node, providerProfileMap, nowMs });
  classifyClaimReceiptRefs({ claim, node, input });
  classifyClaimOutcomes({ claim, node });

  const revocation = activeRevocationMap.get(claim.id);
  if (revocation) {
    applyReason(node, 'REVOKED', `ACTIVE_REVOCATION:${revocation.reason || 'UNSPECIFIED'}`, claim.id);
  }

  const supersession = activeSupersessionMap.get(claim.id);
  if (supersession) {
    applyReason(node, 'STALE', `SUPERSEDED_BY:${supersession.toClaimId || 'UNKNOWN'}:${supersession.reason || 'UNSPECIFIED'}`, supersession.toClaimId || claim.id);
  }

  if (conflictClaimIds.has(claim.id)) {
    applyReason(node, 'CONFLICT', 'ACTIVE_CONFLICTING_CLAIM_SET', claim.id);
  }

  node.reasons = uniqueSorted(node.reasons);
  node.invalidatedBy = uniqueSorted(node.invalidatedBy);
  return node;
}

function buildEdges(input) {
  const edges = [];
  for (const claim of Array.isArray(input.claims) ? input.claims : []) {
    if (!claim || typeof claim.id !== 'string') continue;
    for (const dependency of Array.isArray(claim.dependsOn) ? claim.dependsOn : []) {
      edges.push({ from: claim.id, to: dependency, type: 'DEPENDS_ON' });
    }
    for (const sourceReceiptId of Array.isArray(claim.sourceReceiptIds) ? claim.sourceReceiptIds : []) {
      edges.push({ from: claim.id, to: sourceReceiptId, type: 'SOURCE_RECEIPT' });
    }
    if (claim.providerProfileId) {
      edges.push({ from: claim.id, to: claim.providerProfileId, type: 'PROVIDER_PROFILE' });
    }
    for (const conflict of Array.isArray(claim.conflictsWith) ? claim.conflictsWith : []) {
      edges.push({ from: claim.id, to: conflict, type: 'CONFLICTS_WITH' });
    }
  }
  for (const revocation of activeRows(input.revocations, (row) => typeof row.claimId === 'string')) {
    edges.push({ from: revocation.claimId, to: revocation.reason || 'ACTIVE_REVOCATION', type: 'REVOKED_BY' });
  }
  for (const supersession of activeRows(input.supersessions, (row) => typeof row.fromClaimId === 'string')) {
    edges.push({ from: supersession.fromClaimId, to: supersession.toClaimId || 'UNKNOWN_SUPERSEDER', type: 'SUPERSEDED_BY' });
  }
  for (const conflict of activeRows(input.conflicts, (row) => Array.isArray(row.claimIds))) {
    for (const claimId of conflict.claimIds) {
      edges.push({ from: claimId, to: conflict.claimIds.filter((id) => id !== claimId).join(',') || 'ACTIVE_CONFLICT', type: 'CONFLICTS_WITH' });
    }
  }
  return edges.sort((a, b) => `${a.type}:${a.from}:${a.to}`.localeCompare(`${b.type}:${b.from}:${b.to}`));
}

function propagateDependencies({ claims, nodeMap }) {
  let changed = true;
  let iterations = 0;
  while (changed && iterations < claims.length + 2) {
    changed = false;
    iterations += 1;
    for (const claim of claims) {
      const node = nodeMap.get(claim.id);
      if (!node) continue;
      for (const dependencyId of Array.isArray(claim.dependsOn) ? claim.dependsOn : []) {
        const dependency = nodeMap.get(dependencyId);
        const before = node.state;
        if (!dependency) {
          applyReason(node, 'BLOCKED', `DEPENDENCY_MISSING:${dependencyId}`, dependencyId);
        } else if (dependency.state !== 'APPLICABLE_SCOPED') {
          applyReason(node, dependency.state, `DEPENDENCY_NOT_APPLICABLE:${dependencyId}:${dependency.state}`, dependencyId);
        }
        if (node.state !== before) changed = true;
      }
      node.reasons = uniqueSorted(node.reasons);
      node.invalidatedBy = uniqueSorted(node.invalidatedBy);
    }
  }
}

function finalizeNode(node) {
  if (node.state !== 'APPLICABLE_SCOPED') {
    node.applicabilityDecision = 'DENY';
  }
  return {
    ...node,
    reasons: uniqueSorted(node.reasons),
    invalidatedBy: uniqueSorted(node.invalidatedBy),
    nonClaims: uniqueSorted(node.nonClaims),
  };
}

function invalidationsFromNodes(nodes) {
  const rows = [];
  for (const node of nodes) {
    for (const reason of node.reasons) {
      rows.push({
        claimId: node.id,
        state: node.state,
        reason,
      });
    }
  }
  return rows.sort((a, b) => `${a.claimId}:${a.reason}`.localeCompare(`${b.claimId}:${b.reason}`));
}

export function compileApplicabilityInvalidationGraph(input = {}) {
  const errors = [];
  if (input.schemaVersion !== INPUT_SCHEMA_VERSION) errors.push(`INPUT_SCHEMA_VERSION_INVALID:${input.schemaVersion || 'MISSING'}`);
  if (input.compilerId !== COMPILER_ID) errors.push(`COMPILER_ID_INVALID:${input.compilerId || 'MISSING'}`);
  if (!input.exact || typeof input.exact !== 'object') errors.push('EXACT_BINDING_MISSING');
  const exactOk = input.exact ? exactBindingOk(input, errors) : false;
  if (!Array.isArray(input.claims) || input.claims.length === 0) errors.push('CLAIMS_MISSING');

  const sourceReceiptMap = new Map((Array.isArray(input.sourceReceipts) ? input.sourceReceipts : [])
    .filter((receipt) => receipt && typeof receipt.id === 'string')
    .map((receipt) => [receipt.id, receipt]));
  const providerProfileMap = new Map((Array.isArray(input.providerProfiles) ? input.providerProfiles : [])
    .filter((profile) => profile && typeof profile.id === 'string')
    .map((profile) => [profile.id, profile]));
  const activeRevocationMap = new Map(activeRows(input.revocations, (row) => typeof row.claimId === 'string')
    .map((row) => [row.claimId, row]));
  const activeSupersessionMap = new Map(activeRows(input.supersessions, (row) => typeof row.fromClaimId === 'string')
    .map((row) => [row.fromClaimId, row]));
  const conflictClaimIds = new Set();
  for (const conflict of activeRows(input.conflicts, (row) => Array.isArray(row.claimIds))) {
    for (const claimId of conflict.claimIds) conflictClaimIds.add(claimId);
  }

  const nowMs = parseTime(input.nowUtc || input.generatedAtUtc);
  const claimRows = Array.isArray(input.claims) ? input.claims : [];
  const nodeMap = new Map();
  for (const claim of claimRows) {
    const node = classifyOneClaim({
      claim,
      input,
      exactOk,
      sourceReceiptMap,
      providerProfileMap,
      activeRevocationMap,
      activeSupersessionMap,
      conflictClaimIds,
      nowMs,
    });
    nodeMap.set(node.id, node);
  }
  propagateDependencies({ claims: claimRows, nodeMap });
  const nodes = [...nodeMap.values()]
    .map(finalizeNode)
    .sort((a, b) => a.id.localeCompare(b.id));
  const blockedOrInvalid = nodes.filter((node) => node.state !== 'APPLICABLE_SCOPED');

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
    inputReceipts: [...sourceReceiptMap.values()]
      .map((receipt) => ({
        id: receipt.id,
        schemaVersion: receipt.schemaVersion || 'MISSING',
        compilerId: receipt.compilerId || 'MISSING',
        headSha: receipt.headSha || 'MISSING',
        treeSha: receipt.treeSha || 'MISSING',
        evidenceDigest: receipt.evidenceDigest || 'MISSING',
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    programVerdict: blockedOrInvalid.length === 0 && nodes.length > 0 ? 'VERIFIED_SCOPED' : 'NEEDS_MORE_EVIDENCE',
    releaseAuthority: 'DENY',
    productMutationAuthority: 'DENY',
    providerMutationAuthority: 'DENY',
    nodes,
    edges: buildEdges(input),
    invalidations: invalidationsFromNodes(nodes),
    denominators: {
      claimsTotal: nodes.length,
      applicableScoped: nodes.filter((node) => node.state === 'APPLICABLE_SCOPED').length,
      blockedOrInvalid: blockedOrInvalid.length,
      edgesTotal: buildEdges(input).length,
      sourceReceiptsTotal: sourceReceiptMap.size,
      providerProfilesTotal: providerProfileMap.size,
      revocationsActive: activeRevocationMap.size,
      supersessionsActive: activeSupersessionMap.size,
      conflictsActive: activeRows(input.conflicts, (row) => Array.isArray(row.claimIds)).length,
    },
    errors: uniqueSorted(errors),
  };
}

export function runIndependentApplicabilityGraphOracle(input, graph) {
  const errors = [];
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  if (!graph || graph.schemaVersion !== RECEIPT_SCHEMA_VERSION) errors.push('ORACLE_GRAPH_SCHEMA_MISMATCH');
  if (!Array.isArray(input?.claims) || nodes.length !== input.claims.length) {
    errors.push('ORACLE_NODE_DENOMINATOR_MISMATCH');
  }
  if (graph?.releaseAuthority !== 'DENY') errors.push('ORACLE_RELEASE_AUTHORITY_NOT_DENY');
  if (graph?.productMutationAuthority !== 'DENY') errors.push('ORACLE_PRODUCT_AUTHORITY_NOT_DENY');
  if (graph?.providerMutationAuthority !== 'DENY') errors.push('ORACLE_PROVIDER_AUTHORITY_NOT_DENY');

  for (const claim of Array.isArray(input?.claims) ? input.claims : []) {
    const node = nodeMap.get(claim.id);
    if (!node) {
      errors.push(`ORACLE_NODE_MISSING:${claim.id || 'MISSING'}`);
      continue;
    }
    if (node.state === 'APPLICABLE_SCOPED') {
      if (!verifiedStatus(claim.status, claim.verdict)) {
        errors.push(`ORACLE_APPLICABLE_WITHOUT_VERIFIED_CLAIM:${claim.id}`);
      }
      for (const outcome of claim.outcomes || []) {
        if (FAIL_CLOSED_OUTCOMES.has(String(outcome))) errors.push(`ORACLE_APPLICABLE_FAIL_CLOSED_CLAIM_OUTCOME:${claim.id}:${outcome}`);
      }
      for (const receipt of claim.receiptRefs || []) {
        if (receipt.claimId !== claim.id || receipt.profileId !== claim.profileId || receipt.scopeId !== claim.scopeId) {
          errors.push(`ORACLE_APPLICABLE_TRANSPLANTED_RECEIPT:${claim.id}`);
        }
        if (receipt.headSha !== input.exact.headSha || receipt.treeSha !== input.exact.treeSha) {
          errors.push(`ORACLE_APPLICABLE_STALE_RECEIPT:${claim.id}`);
        }
        for (const outcome of receipt.outcomes || []) {
          if (FAIL_CLOSED_OUTCOMES.has(String(outcome))) errors.push(`ORACLE_APPLICABLE_FAIL_CLOSED_RECEIPT_OUTCOME:${claim.id}:${outcome}`);
        }
      }
      for (const dependencyId of claim.dependsOn || []) {
        if (nodeMap.get(dependencyId)?.state !== 'APPLICABLE_SCOPED') {
          errors.push(`ORACLE_APPLICABLE_WITH_BLOCKED_DEPENDENCY:${claim.id}:${dependencyId}`);
        }
      }
    }
    if (node.state !== 'APPLICABLE_SCOPED' && node.applicabilityDecision !== 'DENY') {
      errors.push(`ORACLE_INVALID_NODE_NOT_DENIED:${claim.id}`);
    }
  }

  if (graph?.programVerdict === 'VERIFIED_SCOPED' && nodes.some((node) => node.state !== 'APPLICABLE_SCOPED')) {
    errors.push('ORACLE_PROGRAM_VERDICT_OVERCLAIM');
  }
  return { ok: errors.length === 0, errors: uniqueSorted(errors) };
}

export function runApplicabilityMutationCatalog(input) {
  const primaryId = input?.claims?.[0]?.id;
  const mutants = [
    ['missing-source-receipt', (data) => { data.sourceReceipts = []; }],
    ['stale-claim-head', (data) => { data.claims[0].exactHeadSha = '1'.repeat(40); }],
    ['stale-receipt-head', (data) => { data.claims[0].receiptRefs[0].headSha = '3'.repeat(40); }],
    ['active-revocation', (data) => { data.revocations = [{ claimId: primaryId, active: true, reason: 'MUTANT_REVOCATION' }]; }],
    ['supersession', (data) => { data.supersessions = [{ fromClaimId: primaryId, toClaimId: `${primaryId}_V2`, active: true, reason: 'MUTANT_SUPERSESSION' }]; }],
    ['expired-provider', (data) => { data.nowUtc = '2026-10-01T00:00:00.000Z'; }],
    ['explicit-conflict', (data) => { data.conflicts = [{ claimIds: [primaryId, 'INTEROP_CHAIN_SATURATION_V1'], active: true, reason: 'MUTANT_CONFLICT' }]; }],
    ['transplanted-claim', (data) => { data.claims[0].receiptRefs[0].claimId = 'OTHER_CLAIM'; }],
    ['scope-forgery', (data) => { data.claims[0].scopeId = 'expanded-universal-scope'; }],
    ['unknown-outcome', (data) => { data.claims[0].receiptRefs[0].outcomes = ['UNKNOWN']; }],
    ['dependency-missing', (data) => { data.claims[0].dependsOn = ['MISSING_DEPENDENCY']; }],
    ['wrong-current-tree', (data) => { data.exact.treeSha = '2'.repeat(40); }],
  ];
  const survivors = [];
  for (const [id, mutate] of mutants) {
    const data = JSON.parse(JSON.stringify(input));
    mutate(data);
    const graph = compileApplicabilityInvalidationGraph(data);
    const primary = graph.nodes.find((node) => node.id === primaryId);
    if (graph.ok && primary?.state === 'APPLICABLE_SCOPED') survivors.push(id);
  }
  return {
    total: mutants.length,
    killed: mutants.length - survivors.length,
    survivors,
  };
}

export function buildCurrentApplicabilityGraphInput(repoRoot = repoRootFromHere()) {
  const headSha = runGit(repoRoot, ['rev-parse', 'HEAD']);
  const treeSha = runGit(repoRoot, ['rev-parse', 'HEAD^{tree}']);
  return {
    schemaVersion: INPUT_SCHEMA_VERSION,
    compilerId: COMPILER_ID,
    generatedAtUtc: '2026-08-17T03:19:05.000Z',
    nowUtc: '2026-08-17T03:19:05.000Z',
    exact: {
      headSha,
      treeSha,
      buildId: 'postmerge-local-node-22.22.2-npm-10.9.7',
    },
    sourceReceipts: [
      {
        id: 'receipt:r2-offline-release-claim-compiler-v0',
        schemaVersion: 'yalken.releaseClaimCompiler.receipt.v0',
        compilerId: 'R2_OFFLINE_RELEASE_CLAIM_COMPILER_V0',
        headSha: R2_RECEIPT_HEAD,
        treeSha: R2_RECEIPT_TREE,
        evidenceDigest: sha256File(repoRoot, 'docs/OPS/RTK/YALKEN_OFFLINE_RELEASE_CLAIM_COMPILER_V0_RECEIPT.json'),
        status: 'PASS',
        verdict: 'VERIFIED_SCOPED',
        supersededBy: null,
      },
    ],
    providerProfiles: [
      {
        id: 'word-mac-16.112-26081010',
        provider: 'Microsoft Word for Mac',
        bundleIdentifier: 'com.microsoft.Word',
        teamIdentifier: 'UBF8T346G9',
        version: '16.112',
        build: '16.112.26081010',
        status: 'CURRENT_VERIFIED',
        observedAtUtc: '2026-08-16T13:13:00.000Z',
        expiresAtUtc: '2026-09-16T00:00:00.000Z',
        evidenceDigest: sha256File(repoRoot, 'docs/OPS/RTK/WORD_BUILD_PROFILE_REGISTRY_V1.json'),
      },
    ],
    revocations: [],
    supersessions: [],
    conflicts: [],
    claims: [
      {
        id: 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1',
        family: 'INTEROP_CHAIN',
        profileId: 'word-mac-16.112-26081010',
        scopeId: 'return-intake-authority-carrier-authentication-repair',
        denominatorId: 'c1-return-intake-authority-carrier-authentication-repair',
        exactHeadSha: headSha,
        exactTreeSha: treeSha,
        status: 'PASS',
        verdict: 'VERIFIED_SCOPED',
        sourceReceiptIds: ['receipt:r2-offline-release-claim-compiler-v0'],
        providerProfileId: 'word-mac-16.112-26081010',
        dependsOn: [],
        conflictsWith: [],
        nonClaims: ['C1_ROUTE_PASS', 'CHAIN_SATURATION', 'USER_DOCUMENT_COVERAGE'],
        outcomes: ['PASS'],
        receiptRefs: [
          {
            id: 'receipt:pr1575-postmerge-c1-return-intake-authentication-repair',
            claimId: 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1',
            profileId: 'word-mac-16.112-26081010',
            scopeId: 'return-intake-authority-carrier-authentication-repair',
            headSha,
            treeSha,
            evidenceDigest: sha256File(repoRoot, 'test/contracts/revision-bridge-docx-review-preview-session-command-surface.contract.test.js'),
            status: 'PASS',
            verdict: 'VERIFIED_SCOPED',
            outcomes: ['PASS'],
            supersededBy: null,
          },
        ],
      },
      {
        id: 'INTEROP_CHAIN_SATURATION_V1',
        family: 'INTEROP_CHAIN',
        profileId: 'word-google-chain',
        scopeId: 'c1-c8-full-book-denominator',
        denominatorId: 'interop-c1-c8-full-book-route-matrix',
        exactHeadSha: headSha,
        exactTreeSha: treeSha,
        status: 'NEEDS_MORE_EVIDENCE',
        verdict: 'BLOCKED',
        sourceReceiptIds: ['receipt:r2-offline-release-claim-compiler-v0'],
        providerProfileId: null,
        dependsOn: ['C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1'],
        conflictsWith: [],
        nonClaims: ['ALL_ROUTES_PROVEN', 'UNIVERSAL_PARITY', 'BYTE_IDENTITY'],
        outcomes: ['BLOCKED'],
        receiptRefs: [
          {
            id: 'receipt:chain-saturation-blocked-after-r2',
            claimId: 'INTEROP_CHAIN_SATURATION_V1',
            profileId: 'word-google-chain',
            scopeId: 'c1-c8-full-book-denominator',
            headSha,
            treeSha,
            evidenceDigest: sha256File(repoRoot, 'docs/OPS/RTK/YALKEN_INTEROP_CHAIN_MATRIX_V1.json'),
            status: 'NEEDS_MORE_EVIDENCE',
            verdict: 'BLOCKED',
            outcomes: ['BLOCKED'],
            supersededBy: null,
          },
        ],
      },
      {
        id: 'F3_PHYSICAL_OWNER_OFFHOST_RESTORE_V1',
        family: 'BLACK_BOX_RECOVERY',
        profileId: 'owner-offhost-removable-media',
        scopeId: 'physical-owner-key-restore-drill',
        denominatorId: 'physical-owner-key-offhost-removable-media-restore',
        exactHeadSha: headSha,
        exactTreeSha: treeSha,
        status: 'NEEDS_MORE_EVIDENCE',
        verdict: 'BLOCKED',
        sourceReceiptIds: ['receipt:r2-offline-release-claim-compiler-v0'],
        providerProfileId: null,
        dependsOn: [],
        conflictsWith: [],
        nonClaims: ['FINAL_PROGRAM_READY', 'OFFHOST_RESTORE_PASS', 'PHYSICAL_OWNER_DRILL_PASS'],
        outcomes: ['BLOCKED'],
        receiptRefs: [
          {
            id: 'receipt:f3-physical-remains-blocked',
            claimId: 'F3_PHYSICAL_OWNER_OFFHOST_RESTORE_V1',
            profileId: 'owner-offhost-removable-media',
            scopeId: 'physical-owner-key-restore-drill',
            headSha,
            treeSha,
            evidenceDigest: sha256File(repoRoot, 'docs/OPS/STATUS/FINAL_LAB_TO_PRODUCT_TRACEABILITY_V2_LEDGER.json'),
            status: 'NEEDS_MORE_EVIDENCE',
            verdict: 'BLOCKED',
            outcomes: ['BLOCKED'],
            supersededBy: null,
          },
        ],
      },
    ],
  };
}

function main() {
  const repoRoot = repoRootFromHere();
  const input = buildCurrentApplicabilityGraphInput(repoRoot);
  const graph = compileApplicabilityInvalidationGraph(input);
  const oracle = runIndependentApplicabilityGraphOracle(input, graph);
  const mutations = runApplicabilityMutationCatalog(input);
  const receipt = {
    ...graph,
    oracle,
    mutations,
    limitations: [
      'This is an offline applicability invalidation graph over bounded release receipts; it grants no product/runtime/provider authority.',
      'R2_OFFLINE_RELEASE_CLAIM_COMPILER_V0 is preserved as provenance input and is not promoted to a current exact-head release PASS.',
      'Program verdict remains NEEDS_MORE_EVIDENCE because chain saturation and F3 physical owner/off-host restore are not proven.',
      'Desktop V1.1 remains hash-bound proposal input only; active repo canon and exact-head receipts win.',
    ],
  };
  const args = new Set(process.argv.slice(2));
  if (args.has('--write-receipt')) {
    const target = path.join(repoRoot, DEFAULT_RECEIPT_PATH);
    fs.writeFileSync(target, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  }
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  if (!graph.ok || !oracle.ok || mutations.survivors.length > 0) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
