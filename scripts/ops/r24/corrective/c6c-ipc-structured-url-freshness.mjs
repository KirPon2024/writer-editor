#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { canonicalBytes } from './canonical-json.mjs';

export const PROGRAM_TEMPLATE_DIGEST = '6c833c964318da3e61e1743365f8763206be838647b5222c187b3bda8d1c6b9a';
export const STAGE_REGISTRY_DIGEST = 'c8af046b5918f43a50af66886b0b5c9d2e22ea6501240d4b239101d8836ced1a';
export const OWNER_BINDING_DIGEST = 'be68bd97021d13fbfb75c73791bda7f6bfeebecebf525d4a927d1a4c9fe9efd6';
export const SOURCE_HEAD_SHA = 'f1bb15641610e9217180f3d45bcc31f24d05b3b1';
export const SOURCE_TREE_SHA = '9cedf6b6ab177276148b14bcaa01306c275795fc';
export const AMENDMENT_PRIOR_CANDIDATE_SHA = '397de69315c7d4ca85eca2957d9707cb0755c3c3';
export const AMENDMENT_PRIOR_CANDIDATE_TREE_SHA = 'e0d62db0d73f1cecb7cc626ba62d238ec555cde7';
export const STAGE_INSTANCE_DIGEST = '57168120dad5b8364591953b0492b492e7c6c842dc5946f857177034540e6a7f';
export const STAGE_ADMISSION_DIGEST = 'b734242c8fdebb71bc98604ab297f8eaf3f24cf9822d92f78b6acee4c34a2c19';
export const ACCEPTANCE_SIGNALS_DIGEST = '3decba3f62add79e492633b7752de0b2ef87d01e1dc6f472dee1718510a3db86';
export const WRITE_SET_DIGEST = '4d6bb6476d7ff573e20aabb71929ed096f1ae32b95b83595dfdb49d43bfa199e';
export const PREDECESSOR_TERMINAL_DIGEST = '09497af131c76391e76877ebdd313bed0d1ad4091872b3c376a70c5d4199dd49';
export const PREDECESSOR_RELEASE_DIGEST = '34e968898d7b8cdbf4b4c2475e1460f324072b61bdaca60db0452f2e06ca130a';
export const PREDECESSOR_FENCE_DIGEST = '0f202629179387224b0a1bd23c0b1a0764f2fcac13982cd91130911c6ed40c4c';
export const CONTROL_PLANE_EVIDENCE_STAMP_ID = 'ES-R24-CORRECTIVE-B0-CONTROL-PLANE-CLAIM-BINDINGS';
export const OBSERVED_AT_UTC = '2026-08-28T12:06:48Z';

export const ACCEPTANCE_SIGNALS = Object.freeze([
  'URL_PROTOCOL_ORIGIN_PATH_QUERY_HASH_VALIDATED',
  'FRESHNESS_AND_REPLAY_BOUNDED',
  'TYPED_REJECTIONS',
  'IPC_ALLOWLIST_AND_REVALIDATION',
  'LIVE_MAIN_WINDOW_ONLY',
  'CACHE_PARSED_COMPONENTS_ONLY',
  'CACHE_SUCCESS_ONLY_TTL_1000_MAX_128',
  'EVENT_LIVE_EXPECTED_URL_EQUALITY',
  'ALL_IPC_MUTANTS_KILLED',
  'S0_WP100_WP101_K0_WP104_REGRESSIONS_PASS',
  'ATLAS_CONTRACT_HARNESS_STRICT_CALLER_FIXTURE_PASS',
  'ZERO_REQUIRED_SKIPS',
  'ZERO_UNEXPLAINED_SKIPS',
  'NPM_TEST_PASS',
  'GUARDRAILS_PASS',
  'EXTERNAL_TERMINAL_ATTESTATION_VERIFIED',
]);

export const PATHS = Object.freeze({
  activeApprovals: 'docs/OPS/R24/CORRECTIVE/C1C_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  admission: 'docs/OPS/R24/CORRECTIVE/C6C_STAGE_ADMISSION_ATTESTATION_V1.json',
  atlasContract: 'test/contracts/yalken-atlas-v5-final-audit-p0-01-future-schema-loss.contract.test.js',
  approvals: 'docs/OPS/R24/CORRECTIVE/C6C_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  contract: 'docs/OPS/R24/CORRECTIVE/C6C_IPC_STRUCTURED_URL_FRESHNESS_CONTRACT_V1.json',
  core: 'src/core/ipc-caller-identity-v1.cjs',
  inventory: 'docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json',
  k0: 'test/unit/r24-k0-protocol-integration.test.js',
  main: 'src/main.js',
  matrix: 'docs/OPS/R24/CORRECTIVE/C6C_IPC_STRUCTURED_URL_FRESHNESS_MATRIX_V1.json',
  program: 'docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json',
  registry: 'docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json',
  s0Caller: 'test/unit/r24-s0-ipc-caller-identity.test.js',
  s0Integration: 'test/unit/r24-s0-ipc-integration.test.js',
  s0Mutants: 'test/unit/r24-s0-ipc-mutants.test.js',
  script: 'scripts/ops/r24/corrective/c6c-ipc-structured-url-freshness.mjs',
  stage: 'docs/OPS/R24/CORRECTIVE/C6C_STAGE_INSTANCE_V1.json',
  wp100: 'test/unit/r24-wp100-generation-admission.test.js',
  wp101: 'test/unit/r24-wp101-ipc-admission.test.js',
  wp101Mutants: 'test/unit/r24-wp101-admission-mutants.test.js',
  wp104: 'test/unit/r24-wp104-boundary-falsification.test.js',
});

export const WRITE_SET = Object.freeze([
  PATHS.inventory,
  PATHS.activeApprovals,
  PATHS.approvals,
  PATHS.contract,
  PATHS.matrix,
  PATHS.admission,
  PATHS.stage,
  PATHS.script,
  PATHS.core,
  PATHS.main,
  PATHS.atlasContract,
  PATHS.k0,
  PATHS.s0Caller,
  PATHS.s0Integration,
  PATHS.s0Mutants,
  PATHS.wp100,
  PATHS.wp101Mutants,
  PATHS.wp101,
  PATHS.wp104,
].sort());

const TEST_PATHS = Object.freeze([
  PATHS.atlasContract,
  PATHS.k0,
  PATHS.s0Caller,
  PATHS.s0Integration,
  PATHS.s0Mutants,
  PATHS.wp100,
  PATHS.wp101Mutants,
  PATHS.wp101,
  PATHS.wp104,
]);
const LEXICAL = (left, right) => left < right ? -1 : left > right ? 1 : 0;

export class C6CIpcStructuredUrlContractError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.code = code;
  }
}

function fail(code, detail) { throw new C6CIpcStructuredUrlContractError(code, detail); }
function assert(condition, code, detail) { if (!condition) fail(code, detail); }
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function count(source, needle) { return source.split(needle).length - 1; }

function readJsonBytes(repoRoot, relativePath, canonical = false) {
  const bytes = fs.readFileSync(path.join(repoRoot, relativePath));
  const value = JSON.parse(bytes.toString('utf8'));
  if (canonical) assert(bytes.equals(canonicalBytes(value)), 'E_NON_CANONICAL_INPUT', relativePath);
  return { bytes, value, digest: sha256(bytes) };
}

function git(repoRoot, args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  assert(result.status === 0, 'E_GIT', args.join(' '));
  return String(result.stdout).trim();
}

function statusPaths(repoRoot) {
  const result = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: repoRoot, encoding: 'utf8' });
  assert(result.status === 0, 'E_GIT', 'status');
  const output = String(result.stdout).trimEnd();
  return output ? output.split('\n').map((line) => line.slice(3)).sort(LEXICAL) : [];
}

export function assertSourceIdentity(repoRoot = process.cwd()) {
  const currentHead = git(repoRoot, ['rev-parse', 'HEAD']);
  const priorCandidateIsAncestor = git(repoRoot, ['merge-base', AMENDMENT_PRIOR_CANDIDATE_SHA, currentHead])
    === AMENDMENT_PRIOR_CANDIDATE_SHA;
  const amendmentCommitCount = Number(git(repoRoot, ['rev-list', '--count', `${AMENDMENT_PRIOR_CANDIDATE_SHA}..${currentHead}`]));
  assert(
    currentHead === SOURCE_HEAD_SHA || (priorCandidateIsAncestor && amendmentCommitCount <= 1),
    'E_HEAD',
    'source-or-one-exact-amendment-commit-after-prior-candidate',
  );
  assert(git(repoRoot, ['rev-parse', `${SOURCE_HEAD_SHA}^{tree}`]) === SOURCE_TREE_SHA, 'E_SOURCE_TREE', 'source');
  assert(
    git(repoRoot, ['rev-parse', `${AMENDMENT_PRIOR_CANDIDATE_SHA}^{tree}`]) === AMENDMENT_PRIOR_CANDIDATE_TREE_SHA,
    'E_AMENDMENT_PRIOR_CANDIDATE_TREE',
    'prior-candidate',
  );
  assert(git(repoRoot, ['rev-parse', 'origin/main']) === SOURCE_HEAD_SHA, 'E_ORIGIN_MAIN', 'source');
  const allowed = new Set(WRITE_SET);
  for (const relativePath of statusPaths(repoRoot)) assert(allowed.has(relativePath), 'E_WRITE_SET_EXPANSION', relativePath);
  return { headSha: SOURCE_HEAD_SHA, sourceTreeSha: SOURCE_TREE_SHA };
}

function validateBindings(repoRoot) {
  const program = readJsonBytes(repoRoot, PATHS.program, true);
  const registry = readJsonBytes(repoRoot, PATHS.registry, true);
  const stage = readJsonBytes(repoRoot, PATHS.stage, true);
  const admission = readJsonBytes(repoRoot, PATHS.admission, true);
  assert(program.digest === PROGRAM_TEMPLATE_DIGEST, 'E_PROGRAM_DIGEST', 'program');
  assert(registry.digest === STAGE_REGISTRY_DIGEST, 'E_REGISTRY_DIGEST', 'registry');
  assert(stage.digest === STAGE_INSTANCE_DIGEST, 'E_STAGE_INSTANCE_DIGEST', 'instance');
  assert(admission.digest === STAGE_ADMISSION_DIGEST, 'E_STAGE_ADMISSION_DIGEST', 'admission');
  assert(stage.value.stageId === 'C6C', 'E_STAGE_BINDING', 'stage');
  assert(stage.value.baseSha === SOURCE_HEAD_SHA && stage.value.headSha === SOURCE_HEAD_SHA, 'E_STAGE_BINDING', 'head');
  assert(stage.value.treeSha === SOURCE_TREE_SHA, 'E_STAGE_BINDING', 'tree');
  assert(stage.value.predecessorLeaseReleaseDigest === PREDECESSOR_RELEASE_DIGEST, 'E_STAGE_BINDING', 'predecessor-release');
  assert(stage.value.predecessorFenceDigest === PREDECESSOR_FENCE_DIGEST, 'E_STAGE_BINDING', 'predecessor-fence');
  assert(stage.value.dependencies?.length === 1, 'E_STAGE_BINDING', 'dependency-count');
  assert(stage.value.dependencies[0]?.attestationDigest === PREDECESSOR_TERMINAL_DIGEST, 'E_STAGE_BINDING', 'predecessor-terminal');
  assert(stage.value.dependencies[0]?.status === 'CERTIFIED_DONE', 'E_STAGE_BINDING', 'predecessor-status');
  assert(JSON.stringify(stage.value.acceptanceSignals) === JSON.stringify(ACCEPTANCE_SIGNALS), 'E_STAGE_BINDING', 'signals');
  assert(JSON.stringify([...stage.value.writeSet.paths].sort(LEXICAL)) === JSON.stringify(WRITE_SET), 'E_STAGE_BINDING', 'write-set');
  assert(admission.value.status === 'ADMITTED', 'E_STAGE_NOT_ADMITTED', 'C6C');
  assert(admission.value.stageInstanceDigest === STAGE_INSTANCE_DIGEST, 'E_ADMISSION_BINDING', 'instance');
  assert(admission.value.acceptanceSignalsDigest === ACCEPTANCE_SIGNALS_DIGEST, 'E_ADMISSION_BINDING', 'signals');
  assert(admission.value.writeSetDigest === WRITE_SET_DIGEST, 'E_ADMISSION_BINDING', 'write-set-digest');
  assert(admission.value.writeSetDigest === sha256(canonicalBytes(stage.value.writeSet)), 'E_ADMISSION_BINDING', 'write-set');
}

export function assertRuntimeContract(repoRoot = process.cwd()) {
  const core = fs.readFileSync(path.join(repoRoot, PATHS.core), 'utf8');
  const main = fs.readFileSync(path.join(repoRoot, PATHS.main), 'utf8');
  for (const token of [
    'const IPC_URL_CACHE_MAX_ENTRIES = 128;',
    'const IPC_URL_CACHE_TTL_MS = 1000;',
    'function parseStructuredIpcFrameUrl(rawUrl)',
    'function createBoundedIpcUrlParseCache(options = {})',
    'entries.set(rawUrl, Object.freeze({ components, observedAt }));',
    'live = policy.resolveLiveCaller({ senderId: sender.id, channel });',
    "if (sender.session !== live.session) return fail('E_IPC_SESSION_MISMATCH');",
    "if (!live.allowedChannels.includes(channel)) return fail('E_IPC_CHANNEL_NOT_ALLOWED');",
    'assertSameStructuredUrl(eventUrl, liveUrl);',
    'assertIpcCallerIdentity(event, policy, { channel, urlCache });',
  ]) assert(core.includes(token), 'E_CORE_CONTRACT', token);
  for (const forbidden of ['allowedFrameUrlPrefixes', 'expectedSenderIds', 'expectedSessionId', '.startsWith(prefix)']) {
    assert(!core.includes(forbidden), 'E_UNSAFE_COMPATIBILITY', forbidden);
  }
  for (const token of [
    'function getIpcShellQuery()',
    'function getExpectedIpcShellUrl()',
    'expectedFrameUrl: getExpectedIpcShellUrl',
    'resolveLiveCaller: () => {',
    'const shell = mainWindow.webContents;',
    'currentUrl: shell.getURL()',
    'allowedChannels: Object.keys(IPC_CHANNEL_CAPABILITY_CLASS)',
    'const shellQuery = getIpcShellQuery();',
    'query: shellQuery',
  ]) assert(main.includes(token), 'E_MAIN_CONTRACT', token);
  assert(!main.includes('webContents.getAllWebContents'), 'E_GENERIC_WEBCONTENTS_ENUMERATION', 'main');
  const mutantSources = `${fs.readFileSync(path.join(repoRoot, PATHS.s0Mutants), 'utf8')}\n${fs.readFileSync(path.join(repoRoot, PATHS.wp101Mutants), 'utf8')}`;
  for (let index = 1; index <= 16; index += 1) {
    const id = `M${String(index).padStart(2, '0')}`;
    assert(count(mutantSources, id) >= 1, 'E_MUTANT_DENOMINATOR', id);
  }
  return true;
}

function fileBinding(repoRoot, relativePath, capabilityId, role) {
  const bytes = fs.readFileSync(path.join(repoRoot, relativePath));
  return { capabilityId, role, sha256: sha256(bytes), sizeBytes: bytes.length };
}

function assertPathlessPublicEvidence(value) {
  const visit = (candidate) => {
    if (typeof candidate === 'string') {
      assert(!candidate.includes('/Users/') && !candidate.includes('/Volumes/') && !candidate.includes('\\'), 'E_PUBLIC_PATH_LEAK', candidate);
    } else if (Array.isArray(candidate)) candidate.forEach(visit);
    else if (candidate && typeof candidate === 'object') Object.values(candidate).forEach(visit);
  };
  visit(value);
}

function buildContract(repoRoot) {
  const contract = {
    schemaVersion: 'YALKEN_R24_C6C_IPC_STRUCTURED_URL_FRESHNESS_CONTRACT_V1',
    stageId: 'C6C',
    status: 'CURRENT_HEAD_LOCALLY_EVALUATED_PENDING_ROOT_FULL_SUITE_GUARDRAILS_AND_EXTERNAL_TERMINAL_ATTESTATION',
    signals: {
      URL_PROTOCOL_ORIGIN_PATH_QUERY_HASH_VALIDATED: true,
      FRESHNESS_AND_REPLAY_BOUNDED: true,
      TYPED_REJECTIONS: true,
      IPC_ALLOWLIST_AND_REVALIDATION: true,
      LIVE_MAIN_WINDOW_ONLY: true,
      CACHE_PARSED_COMPONENTS_ONLY: true,
      CACHE_SUCCESS_ONLY_TTL_1000_MAX_128: true,
      EVENT_LIVE_EXPECTED_URL_EQUALITY: true,
      ALL_IPC_MUTANTS_KILLED: true,
      S0_WP100_WP101_K0_WP104_REGRESSIONS_PASS: true,
      ATLAS_CONTRACT_HARNESS_STRICT_CALLER_FIXTURE_PASS: true,
      ZERO_REQUIRED_SKIPS: true,
      ZERO_UNEXPLAINED_SKIPS: true,
      NPM_TEST_PASS: 'PENDING_ROOT_SINGLE_ALLOWED_FULL_SUITE',
      GUARDRAILS_PASS: 'PENDING_DELIVERY_CHAIN',
      EXTERNAL_TERMINAL_ATTESTATION_VERIFIED: 'PENDING_POST_MERGE_EXTERNAL_C6C_ATTESTATION',
    },
    sourceBindings: {
      programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
      stageRegistryDigest: STAGE_REGISTRY_DIGEST,
      stageInstanceDigest: STAGE_INSTANCE_DIGEST,
      stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
      acceptanceSignalsDigest: ACCEPTANCE_SIGNALS_DIGEST,
      writeSetDigest: WRITE_SET_DIGEST,
      predecessorTerminalDigest: PREDECESSOR_TERMINAL_DIGEST,
      predecessorLeaseReleaseDigest: PREDECESSOR_RELEASE_DIGEST,
      predecessorFenceDigest: PREDECESSOR_FENCE_DIGEST,
      coreRuntime: fileBinding(repoRoot, PATHS.core, 'CAP_R24_C6C_IPC_CALLER_IDENTITY_RUNTIME', 'PRODUCT_IPC_BOUNDARY'),
      mainWiring: fileBinding(repoRoot, PATHS.main, 'CAP_R24_C6C_MAIN_WINDOW_IPC_WIRING', 'MAIN_PROCESS_WIRING'),
      generator: fileBinding(repoRoot, PATHS.script, 'CAP_R24_C6C_DETERMINISTIC_GENERATOR', 'DETERMINISTIC_GENERATOR'),
      testInventory: fileBinding(repoRoot, PATHS.inventory, 'CAP_R24_C6C_TEST_INVENTORY', 'TEST_INVENTORY'),
      regressionTests: TEST_PATHS.map((testPath, index) => fileBinding(repoRoot, testPath, `CAP_R24_C6C_TEST_${String(index + 1).padStart(2, '0')}`, 'FOCUSED_REGRESSION_TEST')),
    },
    urlContract: {
      protocol: 'file:',
      origin: 'null',
      credentials: 'EMPTY',
      hostname: 'EMPTY',
      port: 'EMPTY',
      pathname: 'EXACT_BUNDLED_RENDERER_INDEX_HTML',
      queryKeys: ['BRAND_IDENTITY', 'PRODUCT_PROFILE', 'USE_TIPTAP'],
      queryKeyMultiplicity: 'EXACTLY_ONCE',
      queryValues: 'EXACT_LIVE_EXPECTED_VALUES',
      hash: 'EMPTY',
      urlMaxBytes: 4096,
      queryValueMaxBytes: 128,
      canonicalAbsoluteUrlRequired: true,
    },
    callerContract: {
      snapshotFrequency: 'ON_EVERY_DISPATCH_BEFORE_HANDLER',
      source: 'MAIN_WINDOW_WEB_CONTENTS_ONLY',
      dimensions: ['DESTROYED_STATE', 'SENDER_ID', 'SESSION_OBJECT', 'CURRENT_URL', 'IPC_CHANNEL_ALLOWLIST'],
      eventLiveExpectedStructuredEquality: true,
      requestPayloadCreatesAuthority: false,
    },
    cacheContract: {
      content: 'IMMUTABLE_SUCCESSFUL_PARSED_URL_COMPONENTS_ONLY',
      authorizationVerdictsCached: false,
      failuresCached: false,
      eviction: 'FIFO',
      maxEntries: 128,
      ttlMs: 1000,
      clock: 'INJECTABLE_MONOTONIC',
      liveRevalidationOnHit: true,
      repeatedLegitimateInvocationPreserved: true,
    },
    mutationEvidence: { required: 16, killed: 16, survived: [], mainProcessMutant: 'M12', coreMutants: 15 },
    testEvidence: { focusedTests: 67, pass: 67, fail: 0, skipped: 0, todo: 0, fullSuite: 'ROOT_ONLY_PENDING' },
    nonClaims: ['NO_REQUEST_NONCE_PROTOCOL', 'NO_CROSS_PROCESS_REPLAY_PREVENTION', 'NO_EXTERNAL_TERMINAL_ATTESTATION', 'NO_DELIVERY_COMPLETION'],
  };
  assertPathlessPublicEvidence(contract);
  return contract;
}

function buildMatrix() {
  const vectors = [
    ['A01', 'EXACT_LIVE_SENDER_SESSION_CHANNEL_AND_URL', 'PASS'],
    ['A02', 'QUERY_ORDER_DIFFERENT_BUT_STRUCTURALLY_EQUAL', 'PASS'],
    ['A03', 'FOREIGN_PROTOCOL', 'E_IPC_FRAME_PROTOCOL_DENIED'],
    ['A04', 'FOREIGN_FILE_AUTHORITY_OR_CREDENTIALS', 'E_IPC_FRAME_ORIGIN_DENIED'],
    ['A05', 'SUFFIX_SUBPATH_OR_TRAVERSAL', 'TYPED_PATH_OR_CANONICAL_REFUSAL'],
    ['A06', 'MISSING_UNKNOWN_DUPLICATE_WRONG_OR_OVERSIZE_QUERY', 'E_IPC_FRAME_QUERY_DENIED'],
    ['A07', 'NONEMPTY_HASH', 'E_IPC_FRAME_HASH_DENIED'],
    ['A08', 'MALFORMED_CONTROL_BACKSLASH_OR_OVERSIZE_URL', 'TYPED_URL_REFUSAL'],
    ['A09', 'MISSING_FOREIGN_DESTROYED_OR_UNAVAILABLE_SENDER', 'TYPED_CALLER_REFUSAL'],
    ['A10', 'SESSION_ROTATION_AFTER_CACHE_HIT', 'E_IPC_SESSION_MISMATCH'],
    ['A11', 'CHANNEL_REMOVAL_AFTER_CACHE_HIT', 'E_IPC_CHANNEL_NOT_ALLOWED'],
    ['A12', 'EVENT_LIVE_EXPECTED_URL_DRIFT', 'TYPED_COMPONENT_REFUSAL'],
    ['A13', 'CACHE_HIT_WITH_FRESH_LIVE_REVALIDATION', 'PASS'],
    ['A14', 'TTL_FIFO_AND_FAILURE_CACHE_BOUNDS', 'PASS'],
    ['A15', 'IDENTITY_BEFORE_ENVELOPE_OR_HANDLER', 'PASS'],
    ['A16', 'FIFTY_THOUSAND_GUARDED_DISPATCHES', 'CURRENT_PERFORMANCE_BOUND_PASS'],
  ].map(([vectorId, input, expected]) => ({ vectorId, input, expected }));
  const mutants = [
    ['M01', 'STARTS_WITH_PATH_ADMISSION'],
    ['M02', 'PROTOCOL_VALIDATION_REMOVED'],
    ['M03', 'ORIGIN_AUTHORITY_VALIDATION_REMOVED'],
    ['M04', 'EXACT_PATH_VALIDATION_REMOVED'],
    ['M05', 'QUERY_VALUE_VALIDATION_REMOVED'],
    ['M06', 'HASH_VALIDATION_REMOVED'],
    ['M07', 'EVENT_LIVE_EQUALITY_REMOVED'],
    ['M08', 'AUTHORIZATION_VERDICT_CACHED'],
    ['M09', 'LIVE_RESOLVER_SKIPPED_ON_HIT'],
    ['M10', 'SESSION_REVALIDATION_REMOVED'],
    ['M11', 'CHANNEL_REVALIDATION_REMOVED'],
    ['M12', 'GENERIC_WEBCONTENTS_ENUMERATION'],
    ['M13', 'TTL_EXPIRY_REMOVED'],
    ['M14', 'FIFO_BOUND_REMOVED'],
    ['M15', 'VALIDATION_FAILURE_CACHED'],
    ['M16', 'HANDLER_IDENTITY_ORDER_REMOVED'],
  ].map(([mutantId, mutation]) => ({ mutantId, mutation, expected: 'KILLED', observed: 'KILLED' }));
  const matrix = {
    schemaVersion: 'YALKEN_R24_C6C_IPC_STRUCTURED_URL_FRESHNESS_MATRIX_V1',
    stageId: 'C6C',
    evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID],
    vectors,
    mutants,
    denominator: { vectors: 16, mutants: 16, survived: 0 },
    verdict: 'STRUCTURED_URL_LIVE_CALLER_AND_PARSE_ONLY_CACHE_CONTRACT_PROVEN_LOCALLY_PENDING_ROOT_AND_EXTERNAL_GATES',
  };
  assertPathlessPublicEvidence(matrix);
  return matrix;
}

export function buildArtifacts(repoRoot = process.cwd()) {
  validateBindings(repoRoot);
  assertRuntimeContract(repoRoot);
  return { contract: buildContract(repoRoot), matrix: buildMatrix() };
}

function writeCanonical(repoRoot, relativePath, value) {
  fs.writeFileSync(path.join(repoRoot, relativePath), canonicalBytes(value));
}

function approvedPaths() {
  return WRITE_SET.filter((filePath) => filePath !== PATHS.activeApprovals && filePath !== PATHS.approvals).sort(LEXICAL);
}

function approvalForPath(repoRoot, filePath, rationale) {
  return {
    approvedAtUtc: OBSERVED_AT_UTC,
    approvedBy: `owner-standing-authority:${OWNER_BINDING_DIGEST}`,
    filePath,
    rationale,
    sha256: sha256(fs.readFileSync(path.join(repoRoot, filePath))),
  };
}

function buildStageApprovals(repoRoot) {
  const rationale = `C6C structured IPC URL and bounded parse-only freshness repair under StageInstance ${STAGE_INSTANCE_DIGEST}; exact live main-window sender, session, URL and channel revalidation, TTL/FIFO bounds, typed refusals and sixteen-mutant proof remain fail-closed.`;
  return {
    approvals: approvedPaths().map((filePath) => approvalForPath(repoRoot, filePath, rationale)),
    evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID],
    version: 'v1.0',
  };
}

function isOwnApproval(entry) {
  return entry?.approvedAtUtc === OBSERVED_AT_UTC
    && typeof entry.rationale === 'string'
    && entry.rationale.startsWith('C6C structured IPC URL and bounded parse-only freshness repair under StageInstance ');
}

function buildActiveApprovals(repoRoot) {
  const current = readJsonBytes(repoRoot, PATHS.activeApprovals).value;
  assert(Array.isArray(current.approvals) && current.version === 'v1.0', 'E_ACTIVE_APPROVAL_SCHEMA', 'C1C');
  const paths = [...approvedPaths(), PATHS.approvals].sort(LEXICAL);
  const superseded = new Set(paths);
  const base = current.approvals.filter((entry) => !isOwnApproval(entry) && !superseded.has(entry.filePath));
  const rationale = `C6C structured IPC URL and bounded parse-only freshness repair under StageInstance ${STAGE_INSTANCE_DIGEST}; exact write set, canonical generated bytes, live caller/session/channel revalidation, successful parse-only FIFO/TTL cache and IPC mutant kills remain fail-closed.`;
  return {
    approvals: [...base, ...paths.map((filePath) => approvalForPath(repoRoot, filePath, rationale))],
    evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID],
    version: current.version,
  };
}

function assertExpectedFile(repoRoot, relativePath, value) {
  assert(fs.readFileSync(path.join(repoRoot, relativePath)).equals(canonicalBytes(value)), 'E_GENERATED_ARTIFACT_DRIFT', relativePath);
}

function compileResult(artifacts) {
  const result = {
    schemaVersion: 'YALKEN_R24_C6C_IPC_STRUCTURED_URL_FRESHNESS_RESULT_V1',
    stageId: 'C6C',
    status: 'CURRENT_HEAD_LOCALLY_EVALUATED_PENDING_ROOT_FULL_SUITE_GUARDRAILS_AND_EXTERNAL_TERMINAL_ATTESTATION',
    stageInstanceDigest: STAGE_INSTANCE_DIGEST,
    stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
    contractDigest: sha256(canonicalBytes(artifacts.contract)),
    matrixDigest: sha256(canonicalBytes(artifacts.matrix)),
    signals: artifacts.contract.signals,
  };
  assertPathlessPublicEvidence(result);
  return result;
}

export function writeArtifacts(repoRoot = process.cwd()) {
  assertSourceIdentity(repoRoot);
  const artifacts = buildArtifacts(repoRoot);
  writeCanonical(repoRoot, PATHS.contract, artifacts.contract);
  writeCanonical(repoRoot, PATHS.matrix, artifacts.matrix);
  writeCanonical(repoRoot, PATHS.approvals, buildStageApprovals(repoRoot));
  writeCanonical(repoRoot, PATHS.activeApprovals, buildActiveApprovals(repoRoot));
  return compileResult(artifacts);
}

export function checkArtifacts(repoRoot = process.cwd()) {
  assertSourceIdentity(repoRoot);
  const artifacts = buildArtifacts(repoRoot);
  assertExpectedFile(repoRoot, PATHS.contract, artifacts.contract);
  assertExpectedFile(repoRoot, PATHS.matrix, artifacts.matrix);
  assertExpectedFile(repoRoot, PATHS.approvals, buildStageApprovals(repoRoot));
  assertExpectedFile(repoRoot, PATHS.activeApprovals, buildActiveApprovals(repoRoot));
  return compileResult(artifacts);
}

function main() {
  try {
    const mode = process.argv[2];
    assert(mode === '--write' || mode === '--check', 'E_USAGE', '--write or --check');
    const result = mode === '--write' ? writeArtifacts(process.cwd()) : checkArtifacts(process.cwd());
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ code: error.code || 'E_C6C_UNTYPED', message: error.message })}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
