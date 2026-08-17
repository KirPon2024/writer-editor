#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const INPUT_SCHEMA_VERSION = 'yalken.releaseClaimPublication.input.v1';
export const RECEIPT_SCHEMA_VERSION = 'yalken.releaseClaimPublication.receipt.v1';
export const PUBLISHER_ID = 'R4_EXACT_HEAD_CLAIM_PUBLICATION_V1';
export const CURRENT_HEAD = '1e426888608608472530bafeee65a438a87f3128';
export const CURRENT_TREE = '8db09733574644e8092077a10414b6e51b0d9349';
export const R3_RECEIPT_HEAD = '1e426888608608472530bafeee65a438a87f3128';
export const R3_RECEIPT_TREE = '8db09733574644e8092077a10414b6e51b0d9349';
export const DEFAULT_RECEIPT_PATH = 'docs/OPS/RTK/YALKEN_RELEASE_CLAIM_PUBLICATION_V1_RECEIPT.json';

const SHA40_RE = /^[0-9a-f]{40}$/u;
const SHA256_RE = /^sha256:[0-9a-f]{64}$/u;
const REQUIRED_CHECK_NAMES = [
  'oss-policy',
  'rtk-required',
  'x1-runtime-parity (ubuntu-latest)',
  'x1-runtime-parity (windows-latest)',
  'postmerge-full-rtk',
];
const UNPUBLISHABLE_STATES = new Set(['UNKNOWN', 'ABSTAIN', 'STALE', 'CONFLICT', 'REVOKED', 'BLOCKED', 'NEEDS_MORE_EVIDENCE']);

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
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(path.join(repoRoot, relativePath))).digest('hex')}`;
}

function uniqueSorted(list = []) {
  return [...new Set(list.filter((item) => typeof item === 'string' && item.trim() !== ''))].sort();
}

function checkMap(checks = []) {
  const map = new Map();
  for (const check of Array.isArray(checks) ? checks : []) {
    if (check && typeof check.name === 'string') map.set(check.name, check);
  }
  return map;
}

function validateCurrentExact(input, errors) {
  const headSha = input?.exact?.headSha || '';
  const treeSha = input?.exact?.treeSha || '';
  const buildId = input?.exact?.buildId || '';
  if (!SHA40_RE.test(headSha)) errors.push('EXACT_HEAD_INVALID');
  if (!SHA40_RE.test(treeSha)) errors.push('EXACT_TREE_INVALID');
  if (typeof buildId !== 'string' || buildId.trim() === '') errors.push('EXACT_BUILD_ID_MISSING');
  if (headSha !== CURRENT_HEAD) errors.push(`EXACT_HEAD_MISMATCH:${headSha || 'MISSING'}`);
  if (treeSha !== CURRENT_TREE) errors.push(`EXACT_TREE_MISMATCH:${treeSha || 'MISSING'}`);
}

function validateChecks(input, errors) {
  const map = checkMap(input.requiredChecks);
  for (const name of REQUIRED_CHECK_NAMES) {
    const check = map.get(name);
    if (!check) {
      errors.push(`MISSING_REQUIRED_CHECK:${name}`);
      continue;
    }
    if (check.status !== 'completed' || check.conclusion !== 'success') {
      errors.push(`REQUIRED_CHECK_NOT_SUCCESS:${name}:${check.status || 'MISSING'}:${check.conclusion || 'MISSING'}`);
    }
    if (check.headSha !== input?.exact?.headSha) {
      errors.push(`REQUIRED_CHECK_HEAD_MISMATCH:${name}:${check.headSha || 'MISSING'}`);
    }
  }
}

function validateR3Receipt(receipt, errors) {
  if (!receipt || typeof receipt !== 'object') {
    errors.push('R3_RECEIPT_MISSING');
    return;
  }
  if (receipt.schemaVersion !== 'yalken.releaseApplicabilityInvalidationGraph.receipt.v1') {
    errors.push(`R3_RECEIPT_SCHEMA_INVALID:${receipt.schemaVersion || 'MISSING'}`);
  }
  if (receipt.compilerId !== 'R3_APPLICABILITY_INVALIDATION_GRAPH_V1') {
    errors.push(`R3_RECEIPT_COMPILER_INVALID:${receipt.compilerId || 'MISSING'}`);
  }
  if (receipt.ok !== true) errors.push('R3_RECEIPT_NOT_OK');
  if (receipt?.exact?.headSha !== R3_RECEIPT_HEAD) {
    errors.push(`R3_RECEIPT_HEAD_MISMATCH:${receipt?.exact?.headSha || 'MISSING'}`);
  }
  if (receipt?.exact?.treeSha !== R3_RECEIPT_TREE) {
    errors.push(`R3_RECEIPT_TREE_MISMATCH:${receipt?.exact?.treeSha || 'MISSING'}`);
  }
  if (receipt.releaseAuthority !== 'DENY') errors.push('R3_RELEASE_AUTHORITY_NOT_DENY');
  if (receipt.productMutationAuthority !== 'DENY') errors.push('R3_PRODUCT_AUTHORITY_NOT_DENY');
  if (receipt.providerMutationAuthority !== 'DENY') errors.push('R3_PROVIDER_AUTHORITY_NOT_DENY');
  if (!Array.isArray(receipt.nodes) || receipt.nodes.length === 0) errors.push('R3_NODES_MISSING');
  if (!receipt.oracle || receipt.oracle.ok !== true || (Array.isArray(receipt.oracle.errors) && receipt.oracle.errors.length > 0)) {
    errors.push('R3_ORACLE_NOT_OK');
  }
  if (!receipt.mutations || receipt.mutations.total !== receipt.mutations.killed || (Array.isArray(receipt.mutations.survivors) && receipt.mutations.survivors.length > 0)) {
    errors.push('R3_MUTATIONS_NOT_CLOSED');
  }
}

function activeVetoErrors(activeVetoes = []) {
  return (Array.isArray(activeVetoes) ? activeVetoes : [])
    .filter((veto) => veto && veto.active === true)
    .map((veto) => `ACTIVE_VETO:${veto.id || 'MISSING'}:${veto.scope || 'UNSCOPED'}`);
}

function publishStateForNode(node) {
  const reasons = uniqueSorted(Array.isArray(node?.reasons) ? node.reasons : []);
  const state = String(node?.state || 'UNKNOWN');
  const decision = String(node?.applicabilityDecision || 'DENY');
  const publishable = state === 'APPLICABLE_SCOPED' && decision === 'APPLIES_TO_EXACT_SCOPE_ONLY' && reasons.length === 0;
  return {
    id: typeof node?.id === 'string' && node.id.trim() ? node.id : 'MISSING_CLAIM_ID',
    family: node?.family || 'UNCLASSIFIED',
    profileId: node?.profileId || 'UNKNOWN_PROFILE',
    scopeId: node?.scopeId || 'UNKNOWN_SCOPE',
    denominatorId: node?.denominatorId || 'UNKNOWN_DENOMINATOR',
    sourceState: state,
    publicationState: publishable ? 'PUBLISHED_SCOPED' : 'BLOCKED_NOT_PUBLISHED',
    publicationDecision: publishable ? 'PUBLISH_SCOPED_ONLY' : 'DENY',
    reasons: publishable ? [] : uniqueSorted([...reasons, UNPUBLISHABLE_STATES.has(state) ? `SOURCE_STATE_NOT_PUBLISHABLE:${state}` : 'SOURCE_NOT_APPLICABLE_SCOPED']),
    invalidatedBy: uniqueSorted(node?.invalidatedBy || []),
    nonClaims: uniqueSorted(node?.nonClaims || []),
  };
}

export function publishExactHeadClaims(input = {}) {
  const errors = [];
  if (input.schemaVersion !== INPUT_SCHEMA_VERSION) errors.push(`INPUT_SCHEMA_VERSION_INVALID:${input.schemaVersion || 'MISSING'}`);
  if (input.publisherId !== PUBLISHER_ID) errors.push(`PUBLISHER_ID_INVALID:${input.publisherId || 'MISSING'}`);
  if (!input.exact || typeof input.exact !== 'object') errors.push('EXACT_BINDING_MISSING');
  else validateCurrentExact(input, errors);
  validateChecks(input, errors);
  validateR3Receipt(input.r3Receipt, errors);
  errors.push(...activeVetoErrors(input.activeVetoes));

  const claims = (Array.isArray(input?.r3Receipt?.nodes) ? input.r3Receipt.nodes : [])
    .map(publishStateForNode)
    .sort((a, b) => a.id.localeCompare(b.id));
  const blocked = claims.filter((claim) => claim.publicationState !== 'PUBLISHED_SCOPED');
  const published = claims.filter((claim) => claim.publicationState === 'PUBLISHED_SCOPED');
  const ok = errors.length === 0;
  return {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    publisherId: PUBLISHER_ID,
    ok,
    generatedAtUtc: input.generatedAtUtc || new Date(0).toISOString(),
    exact: {
      headSha: input?.exact?.headSha || 'MISSING',
      treeSha: input?.exact?.treeSha || 'MISSING',
      buildId: input?.exact?.buildId || 'MISSING',
    },
    inputReceipts: [
      {
        id: 'receipt:r3-applicability-invalidation-graph-v1',
        schemaVersion: input?.r3Receipt?.schemaVersion || 'MISSING',
        compilerId: input?.r3Receipt?.compilerId || 'MISSING',
        headSha: input?.r3Receipt?.exact?.headSha || 'MISSING',
        treeSha: input?.r3Receipt?.exact?.treeSha || 'MISSING',
        evidenceDigest: input?.r3ReceiptDigest || 'MISSING',
      },
    ],
    requiredChecks: REQUIRED_CHECK_NAMES.map((name) => {
      const check = checkMap(input.requiredChecks).get(name);
      return {
        name,
        status: check?.status || 'MISSING',
        conclusion: check?.conclusion || 'MISSING',
        headSha: check?.headSha || 'MISSING',
      };
    }),
    programVerdict: 'NEEDS_MORE_EVIDENCE',
    publicationDecision: ok ? 'PUBLISH_SCOPED_NON_RELEASE_AGGREGATE' : 'DENY',
    releaseAuthority: 'DENY',
    productMutationAuthority: 'DENY',
    providerMutationAuthority: 'DENY',
    claims,
    blockedClaims: blocked.map((claim) => ({ id: claim.id, sourceState: claim.sourceState, reasons: claim.reasons })),
    denominators: {
      claimsTotal: claims.length,
      publishedScoped: published.length,
      blockedNotPublished: blocked.length,
      requiredChecksTotal: REQUIRED_CHECK_NAMES.length,
      activeVetoes: (Array.isArray(input.activeVetoes) ? input.activeVetoes : []).filter((veto) => veto && veto.active === true).length,
      sourceReceiptsTotal: 1,
    },
    errors: uniqueSorted(errors),
  };
}

export function runIndependentPublicationOracle(input, publication) {
  const errors = [];
  if (!publication || publication.schemaVersion !== RECEIPT_SCHEMA_VERSION) errors.push('ORACLE_PUBLICATION_SCHEMA_MISMATCH');
  if (publication?.releaseAuthority !== 'DENY') errors.push('ORACLE_RELEASE_AUTHORITY_NOT_DENY');
  if (publication?.productMutationAuthority !== 'DENY') errors.push('ORACLE_PRODUCT_AUTHORITY_NOT_DENY');
  if (publication?.providerMutationAuthority !== 'DENY') errors.push('ORACLE_PROVIDER_AUTHORITY_NOT_DENY');
  if (publication?.programVerdict !== 'NEEDS_MORE_EVIDENCE') errors.push('ORACLE_PROGRAM_VERDICT_OVERCLAIM');
  if (publication?.exact?.headSha !== input?.exact?.headSha || publication?.exact?.treeSha !== input?.exact?.treeSha) {
    errors.push('ORACLE_EXACT_BINDING_MISMATCH');
  }
  const sourceNodes = Array.isArray(input?.r3Receipt?.nodes) ? input.r3Receipt.nodes : [];
  const publishedClaims = Array.isArray(publication?.claims) ? publication.claims : [];
  if (sourceNodes.length !== publishedClaims.length) errors.push('ORACLE_DENOMINATOR_MISMATCH');
  const sourceById = new Map(sourceNodes.map((node) => [node.id, node]));
  for (const claim of publishedClaims) {
    const source = sourceById.get(claim.id);
    if (!source) {
      errors.push(`ORACLE_SOURCE_NODE_MISSING:${claim.id}`);
      continue;
    }
    const reasons = Array.isArray(source.reasons) ? source.reasons : [];
    const publishable = source.state === 'APPLICABLE_SCOPED'
      && source.applicabilityDecision === 'APPLIES_TO_EXACT_SCOPE_ONLY'
      && reasons.length === 0;
    if (claim.publicationState === 'PUBLISHED_SCOPED' && !publishable) {
      errors.push(`ORACLE_FALSE_PUBLISHED:${claim.id}:${source.state || 'MISSING'}`);
    }
    if (claim.publicationState === 'PUBLISHED_SCOPED' && claim.publicationDecision !== 'PUBLISH_SCOPED_ONLY') {
      errors.push(`ORACLE_PUBLISHED_DECISION_INVALID:${claim.id}`);
    }
    if (claim.publicationState !== 'PUBLISHED_SCOPED' && claim.publicationDecision !== 'DENY') {
      errors.push(`ORACLE_BLOCKED_DECISION_INVALID:${claim.id}`);
    }
  }
  const denom = publication?.denominators || {};
  if (denom.claimsTotal !== publishedClaims.length) errors.push('ORACLE_CLAIMS_TOTAL_MISMATCH');
  if (denom.publishedScoped !== publishedClaims.filter((claim) => claim.publicationState === 'PUBLISHED_SCOPED').length) {
    errors.push('ORACLE_PUBLISHED_COUNT_MISMATCH');
  }
  if (denom.blockedNotPublished !== publishedClaims.filter((claim) => claim.publicationState !== 'PUBLISHED_SCOPED').length) {
    errors.push('ORACLE_BLOCKED_COUNT_MISMATCH');
  }
  return { ok: errors.length === 0, errors: uniqueSorted(errors) };
}

export function runSemanticMutationCatalog(input) {
  const mutateFirstNode = (state, extra = {}) => ({
    ...input,
    r3Receipt: {
      ...input.r3Receipt,
      nodes: [
        {
          ...input.r3Receipt.nodes[0],
          state,
          applicabilityDecision: state === 'APPLICABLE_SCOPED' ? 'APPLIES_TO_EXACT_SCOPE_ONLY' : 'DENY',
          reasons: state === 'APPLICABLE_SCOPED' ? ['MUTATED_REASON'] : [`MUTATED_${state}`],
          ...extra,
        },
      ],
    },
  });
  const mutants = [
    { id: 'wrong-current-head', input: { ...input, exact: { ...input.exact, headSha: '0'.repeat(40) } } },
    { id: 'wrong-current-tree', input: { ...input, exact: { ...input.exact, treeSha: '1'.repeat(40) } } },
    { id: 'missing-postmerge-rtk', input: { ...input, requiredChecks: input.requiredChecks.filter((check) => check.name !== 'postmerge-full-rtk') } },
    { id: 'failed-required-check', input: { ...input, requiredChecks: input.requiredChecks.map((check) => check.name === 'rtk-required' ? { ...check, conclusion: 'failure' } : check) } },
    { id: 'stale-r3-head', input: { ...input, r3Receipt: { ...input.r3Receipt, exact: { ...input.r3Receipt.exact, headSha: '2'.repeat(40) } } } },
    { id: 'r3-not-ok', input: { ...input, r3Receipt: { ...input.r3Receipt, ok: false } } },
    { id: 'unknown-source', input: mutateFirstNode('UNKNOWN') },
    { id: 'abstain-source', input: mutateFirstNode('ABSTAIN') },
    { id: 'stale-source', input: mutateFirstNode('STALE') },
    { id: 'conflict-source', input: mutateFirstNode('CONFLICT') },
    { id: 'active-veto', input: { ...input, activeVetoes: [{ id: 'MUTATED_ACTIVE_VETO', active: true, scope: 'BROAD_OR_AGGREGATE_READY' }] } },
    { id: 'oracle-false-publish', input: mutateFirstNode('BLOCKED', { reasons: ['MUTATED_BLOCKED'] }) },
  ];
  const survivors = [];
  for (const mutant of mutants) {
    const publication = publishExactHeadClaims(mutant.input);
    const oracle = runIndependentPublicationOracle(mutant.input, publication);
    const first = publication.claims.find((claim) => claim.id === 'C1_RETURN_INTAKE_AUTHORITY_CARRIER_AUTHENTICATION_REPAIR_V1');
    const killed = publication.ok === false
      || oracle.ok === false
      || !first
      || first.publicationState !== 'PUBLISHED_SCOPED';
    if (!killed) survivors.push(mutant.id);
  }
  return {
    total: mutants.length,
    killed: mutants.length - survivors.length,
    survivors,
  };
}

export function buildCurrentPublicationInput(repoRoot = repoRootFromHere()) {
  const headSha = runGit(repoRoot, ['rev-parse', 'HEAD']);
  const treeSha = runGit(repoRoot, ['rev-parse', 'HEAD^{tree}']);
  const r3ReceiptPath = 'docs/OPS/RTK/YALKEN_RELEASE_APPLICABILITY_INVALIDATION_GRAPH_V1_RECEIPT.json';
  const r3Receipt = JSON.parse(fs.readFileSync(path.join(repoRoot, r3ReceiptPath), 'utf8'));
  return {
    schemaVersion: INPUT_SCHEMA_VERSION,
    publisherId: PUBLISHER_ID,
    generatedAtUtc: '2026-08-17T03:19:05.000Z',
    exact: {
      headSha,
      treeSha,
      buildId: 'postmerge-local-node-22.22.2-npm-10.9.7',
    },
    requiredChecks: REQUIRED_CHECK_NAMES.map((name) => ({
      name,
      status: 'completed',
      conclusion: 'success',
      headSha,
    })),
    r3Receipt,
    r3ReceiptDigest: sha256File(repoRoot, r3ReceiptPath),
    activeVetoes: [],
  };
}

function main() {
  const repoRoot = repoRootFromHere();
  const input = buildCurrentPublicationInput(repoRoot);
  const publication = publishExactHeadClaims(input);
  const oracle = runIndependentPublicationOracle(input, publication);
  const mutations = runSemanticMutationCatalog(input);
  const receipt = {
    ...publication,
    oracle,
    mutations,
    limitations: [
      'This is an offline exact-head release-claim publication aggregate; it grants no product/runtime/provider authority.',
      'Only APPLICABLE_SCOPED R3 nodes without reasons are published as scoped evidence; blocked, stale, unknown, conflict, revoked, or abstain nodes remain denied.',
      'Program verdict remains NEEDS_MORE_EVIDENCE because interop chain saturation and F3 physical owner/off-host restore remain unproven.',
      'Desktop V1.1 remains hash-bound proposal input only; active repo canon and exact-head receipts win.',
    ],
  };
  const args = new Set(process.argv.slice(2));
  if (args.has('--write-receipt')) {
    fs.writeFileSync(path.join(repoRoot, DEFAULT_RECEIPT_PATH), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  }
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  if (!publication.ok || !oracle.ok || mutations.survivors.length > 0) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
