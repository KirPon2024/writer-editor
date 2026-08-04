import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const repoRoot = process.cwd();
const policyPath = path.join(repoRoot, 'docs', 'OPERATIONS', 'STATUS', 'CODEX_AUTOMATION_POLICY.json');
const statusPath = path.join(repoRoot, 'docs', 'OPERATIONS', 'STATUS', 'AGENT_BOOTSTRAP_STATUS.json');

const requiredExecutionTicketFields = Object.freeze([
  'TICKET_ID',
  'ROLE_ROUTE',
  'GOAL',
  'BASE_SHA',
  'HEAD_SHA_AT_START',
  'TARGET_BRANCH',
  'PUSH_BRANCH',
  'PR_MODE',
  'ALLOWLIST_PATHS_MODE',
  'ALLOWLIST_PATHS',
  'DENYLIST_PATHS',
  'CHECK_PACK',
  'STOP_CONDITION',
  'REPORT_FORMAT',
  'RESUME_POLICY',
  'OWNER',
  'EXPIRY',
  'ROLLBACK_PLAN',
]);

const requiredArchitectureLaws = Object.freeze([
  'PRODUCT_CORE_OWNS_TRUTH',
  'COMMAND_KERNEL_OWNS_ACTION_MEANING_AND_MUTATION_AUTHORITY',
  'DESIGN_OS_OWNS_COMPUTED_FORM',
  'RENDERER_CONSUMES_PROJECTIONS_AND_EMITS_INTENT',
  'PLATFORM_EFFECTS_USE_PORTS_AND_ADAPTERS',
  'STATE_CLASSES_NEVER_COLLAPSE',
  'VISIBILITY_IS_NOT_CAPABILITY',
  'TARGET_IS_NOT_CURRENT',
]);

const requiredStateClasses = Object.freeze([
  'PROJECT_STATE',
  'AUTHORING_WORKING_STATE',
  'DERIVED_STATE',
  'SHELL_STATE',
  'TRANSIENT_STATE',
]);

const requiredOperationKinds = Object.freeze([
  'COMMAND',
  'QUERY',
  'EVENT',
  'EFFECT',
  'BACKGROUND_JOB',
  'PROJECTION',
]);

const requiredRunProtocolSteps = Object.freeze([
  'RUN_READ_ONLY_AGENT_BOOTSTRAP',
  'READ_AUTHORITY_ORDER_AND_EXACT_TASK_SOURCES',
  'CLASSIFY_TASK',
  'SNAPSHOT_BASE_WORKTREE_AND_WRITER_LOCK',
  'CREATE_AND_VALIDATE_TASK_ARCHITECTURE_DECLARATION_FOR_WRITE',
  'EXECUTE_ONE_BOUNDED_CONTOUR',
  'RUN_FOCUSED_NEGATIVE_AND_AFFECTED_CHAIN',
  'RUN_REQUIRED_REPOSITORY_GATES',
  'COMPLETE_COMMIT_PUSH_PR_CI_MERGE_CHAIN',
  'VERIFY_EXACT_MERGED_HEAD',
  'EMIT_EVIDENCE_BOUNDED_FINAL_REPORT',
]);

function fail(reason) {
  console.error(reason);
  process.exit(1);
}

function readJson(jsonPath, failReason) {
  if (!fs.existsSync(jsonPath)) {
    fail(`${failReason}:MISSING:${path.relative(repoRoot, jsonPath).replaceAll(path.sep, '/')}`);
  }
  try {
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } catch (error) {
    fail(`${failReason}:PARSE:${error.message}`);
  }
}

function ensureNonEmptyString(value, reason) {
  if (typeof value !== 'string' || value.trim() === '') fail(reason);
}

function ensureIncludesAll(list, required, reason) {
  if (!Array.isArray(list)) fail(reason);
  for (const item of required) {
    if (!list.includes(item)) fail(`${reason}:${item}`);
  }
}

const policy = readJson(policyPath, 'AGENT_BOOTSTRAP_SPEC_POLICY_INVALID');
const status = readJson(statusPath, 'AGENT_BOOTSTRAP_STATUS_INVALID');

if (status.status !== 'ACTIVE_AGENT_BOOTSTRAP_RESOLVER') {
  fail('AGENT_BOOTSTRAP_STATUS_INVALID:status');
}
ensureNonEmptyString(status.activeSpecPath, 'AGENT_BOOTSTRAP_STATUS_INVALID:activeSpecPath');

if (policy.bootstrapSpecRef !== status.activeSpecPath) {
  fail('AGENT_BOOTSTRAP_SPEC_POLICY_MISMATCH:bootstrapSpecRef');
}
if (policy.executionTicketPolicyRef !== `${status.activeSpecPath}#/automationExecutionTicket`) {
  fail('AGENT_BOOTSTRAP_SPEC_POLICY_MISMATCH:executionTicketPolicyRef');
}

const specPath = path.join(repoRoot, status.activeSpecPath.replaceAll('/', path.sep));
const spec = readJson(specPath, 'AGENT_BOOTSTRAP_SPEC_INVALID');
const specSha256 = crypto.createHash('sha256').update(fs.readFileSync(specPath)).digest('hex');
if (status.activeSpecSha256 !== specSha256) {
  fail('AGENT_BOOTSTRAP_STATUS_INVALID:activeSpecSha256_mismatch');
}

if (spec.documentId !== 'AGENT_BOOTSTRAP_REPOSITORY_NATIVE_V2_0') {
  fail('AGENT_BOOTSTRAP_SPEC_INVALID:documentId');
}
if (spec.documentStatus !== 'ACTIVE_BOOTSTRAP_FOR_ANY_AGENT') {
  fail('AGENT_BOOTSTRAP_SPEC_INVALID:documentStatus');
}
if (spec.activeCanonResolution?.resolverPath !== 'docs/OPS/STATUS/CANON_STATUS.json'
  || spec.activeCanonResolution?.rememberedCanonNameAllowed !== false) {
  fail('AGENT_BOOTSTRAP_SPEC_INVALID:activeCanonResolution');
}

const nativeContext = spec.repositoryNativeContext;
if (!nativeContext
  || nativeContext.objectiveOnlyPromptSufficient !== true
  || nativeContext.extraArchitecturePromptRequired !== false
  || nativeContext.rootEntrypoint !== 'AGENTS.md') {
  fail('AGENT_BOOTSTRAP_SPEC_INVALID:repositoryNativeContext');
}
for (const key of ['humanProtocol', 'architectureManifest', 'contextPacketSchema', 'taskDeclarationSchema', 'finalReportSchema']) {
  ensureNonEmptyString(nativeContext[key], `AGENT_BOOTSTRAP_SPEC_INVALID:repositoryNativeContext.${key}`);
  if (!fs.existsSync(path.join(repoRoot, nativeContext[key]))) {
    fail(`AGENT_BOOTSTRAP_SPEC_INVALID:repositoryNativeContext.${key}_missing`);
  }
}
if (!/^[a-f0-9]{64}$/.test(String(nativeContext.architectureManifestSha256 || ''))) {
  fail('AGENT_BOOTSTRAP_SPEC_INVALID:repositoryNativeContext.architectureManifestSha256');
}
const manifestBytes = fs.readFileSync(path.join(repoRoot, nativeContext.architectureManifest));
const manifestSha256 = crypto.createHash('sha256').update(manifestBytes).digest('hex');
if (manifestSha256 !== nativeContext.architectureManifestSha256) {
  fail('AGENT_BOOTSTRAP_SPEC_INVALID:repositoryNativeContext.architectureManifestSha256_mismatch');
}

const direct = spec.directTaskPolicy;
if (!direct
  || direct.ordinaryDirectAgentTaskRequiresSeparateExecutionTicket !== false
  || direct.writeTaskRequiresArchitectureDeclaration !== true
  || direct.declarationMayRemainOutsideRepo !== true
  || direct.declarationValidationCommand !== 'npm run agent:preflight -- --declaration <file>'
  || direct.guardrailValidationCommand !== 'npm run agent:guardrails') {
  fail('AGENT_BOOTSTRAP_SPEC_INVALID:directTaskPolicy');
}

const ticket = spec.automationExecutionTicket;
if (!ticket) fail('AGENT_BOOTSTRAP_SPEC_INVALID:automationExecutionTicket');
ensureIncludesAll(
  ticket.requiredFields,
  requiredExecutionTicketFields,
  'AGENT_BOOTSTRAP_SPEC_INVALID:automationExecutionTicket.requiredFields_missing',
);
ensureIncludesAll(ticket.requiredFor, [
  'AUTOMATION_RUNNER',
  'DELEGATED_EXECUTOR_WITH_FIXED_ALLOWLIST',
  'CROSS_THREAD_STATE_CHANGING_DISPATCH',
], 'AGENT_BOOTSTRAP_SPEC_INVALID:automationExecutionTicket.requiredFor_missing');
if (ticket.defaults?.scopeMode !== 'EXACT' || ticket.defaults?.prMode !== 'URL_ONLY') {
  fail('AGENT_BOOTSTRAP_SPEC_INVALID:automationExecutionTicket.defaults');
}

ensureIncludesAll(spec.architectureLaws, requiredArchitectureLaws, 'AGENT_BOOTSTRAP_SPEC_INVALID:architectureLaws_missing');
ensureIncludesAll(spec.stateClasses, requiredStateClasses, 'AGENT_BOOTSTRAP_SPEC_INVALID:stateClasses_missing');
ensureIncludesAll(spec.operationKinds, requiredOperationKinds, 'AGENT_BOOTSTRAP_SPEC_INVALID:operationKinds_missing');
ensureIncludesAll(spec.runProtocol, requiredRunProtocolSteps, 'AGENT_BOOTSTRAP_SPEC_INVALID:runProtocol_missing');

const delivery = spec.defaultDeliveryPolicy;
for (const field of ['commitRequired', 'pushRequired', 'prRequired', 'mergeRequired', 'postMergeExactHeadVerificationRequired']) {
  if (delivery?.[field] !== true) fail(`AGENT_BOOTSTRAP_SPEC_INVALID:defaultDeliveryPolicy.${field}`);
}

if (spec.finalReport?.selfPassAllowed !== false || spec.finalReport?.nextActionsAllowed !== 1) {
  fail('AGENT_BOOTSTRAP_SPEC_INVALID:finalReport');
}
if (policy.promptMode !== 'prompt_disabled'
  || policy.autoApplyWithinAllowlist !== true
  || policy.denylistAbsolute !== true) {
  fail('AGENT_BOOTSTRAP_SPEC_POLICY_MISMATCH:automation_safety');
}

for (const expectedCommand of [
  'node scripts/contracts/check-agent-bootstrap-spec.mjs',
  'node scripts/validate-agent-guardrails.mjs',
  'node scripts/agent-bootstrap.mjs --objective automation-preflight',
]) {
  if (!Array.isArray(policy.commandAllowlist) || !policy.commandAllowlist.includes(expectedCommand)) {
    fail(`AGENT_BOOTSTRAP_SPEC_POLICY_MISMATCH:commandAllowlist_missing:${expectedCommand}`);
  }
}

console.log('CP-7 AGENT_BOOTSTRAP_SPEC_OK=1');
console.log('CP-8 EXECUTION_TICKET_SCHEMA_OK=1');
console.log('CP-9 AUTOMATION_POLICY_ALIGNMENT_OK=1');
console.log('CP-10 REPOSITORY_NATIVE_CONTEXT_OK=1');
console.log('CP-11 ARCHITECTURE_PREFLIGHT_BINDING_OK=1');
