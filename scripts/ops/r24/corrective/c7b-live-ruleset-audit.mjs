import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { canonicalBytes, canonicalize, readCanonicalJson } from "./canonical-json.mjs";
import { buildInventory } from "../test-inventory.mjs";

export const STAGE_ID = "C7B";
export const OBSERVED_AT_UTC = "2026-08-28T18:57:04Z";
export const OWNER_BINDING_DIGEST = "be68bd97021d13fbfb75c73791bda7f6bfeebecebf525d4a927d1a4c9fe9efd6";
export const PROGRAM_TEMPLATE_DIGEST = "6c833c964318da3e61e1743365f8763206be838647b5222c187b3bda8d1c6b9a";
export const STAGE_REGISTRY_DIGEST = "c8af046b5918f43a50af66886b0b5c9d2e22ea6501240d4b239101d8836ced1a";
export const TRUST_MODEL_DIGEST = "4f6e4b3a191e0302ea44646659e8c2f71121af7d808cc0ee768269b4e156840d";
export const STAGE_INSTANCE_DIGEST = "03b7f2b6be405dc3c7f698b598d4dd0a03732d1a9d8bfe41d46d7f79a37deffb";
export const STAGE_ADMISSION_DIGEST = "6474edc34e08905d7708dbdef3f5363a0edbfdf7e20fa55521a736e2f9537b81";
export const ACCEPTANCE_SIGNALS_DIGEST = "cc80c320c32c2e533a73d9861391f7ce8e7f71e73fd66e9d99ccf3eb741533c0";
export const SOURCE_HEAD_SHA = "6e841f851d407aa9e3457891a39bbfac177ee1a9";
export const SOURCE_TREE_SHA = "0e80b2704762664825382d6d268c19cefddbe6b6";
export const PREDECESSOR_TERMINAL_DIGEST = "8c56b34553600063c90537feeb3f9dd34cbce681f392c76fd93d938d0dacb87b";
export const PREDECESSOR_CERTIFIED_DONE_RECEIPT_DIGEST = "ec90c20662f94d0863acb3c0bc4ada0c15ba0b1a9b72b93c701c80ff4c7f327d";
export const PREDECESSOR_LEASE_RELEASE_DIGEST = "a3d809d76f89d04ab86b3c0ed2b9cc2665248e3d9d5106c1af6eaea41e79c630";
export const LEASE_DIGEST = "62122c1ccaa914659fe4b4843c558c9cfcffcf853df825651cf73b97e04b0d6e";
export const FENCE_DIGEST = "4e8eedaa2b18f051f1f1c203ca450e262a805c090c46ec2a53824a7d4501d8f3";
export const CONTROL_PLANE_EVIDENCE_STAMP_ID = "ES-R24-CORRECTIVE-B0-CONTROL-PLANE-CLAIM-BINDINGS";

export const CONTRACT_PATH = "docs/OPS/R24/CORRECTIVE/C7B_LIVE_RULESET_AUDIT_CONTRACT_V1.json";
export const EVIDENCE_PATH = "docs/OPS/R24/CORRECTIVE/C7B_LIVE_RULESET_EVIDENCE_V1.json";
export const C7B_APPROVALS_PATH = "docs/OPS/R24/CORRECTIVE/C7B_GOVERNANCE_CHANGE_APPROVALS_V1.json";
export const C1C_APPROVALS_PATH = "docs/OPS/R24/CORRECTIVE/C1C_GOVERNANCE_CHANGE_APPROVALS_V1.json";
export const TEST_INVENTORY_PATH = "docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json";
export const STAGE_INSTANCE_PATH = "docs/OPS/R24/CORRECTIVE/C7B_STAGE_INSTANCE_V1.json";
export const STAGE_ADMISSION_PATH = "docs/OPS/R24/CORRECTIVE/C7B_STAGE_ADMISSION_ATTESTATION_V1.json";
export const PROGRAM_TEMPLATE_PATH = "docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json";
export const STAGE_REGISTRY_PATH = "docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json";
export const TRUST_MODEL_PATH = "docs/OPS/R24/CORRECTIVE/TERMINAL_ATTESTATION_TRUST_MODEL_V1.json";
export const STANDING_AUTHORITY_PATH = "docs/OPS/R24/CORRECTIVE/STANDING_AUTHORITY_BINDING_V1.json";
export const C1C_CONTRACT_PATH = "docs/OPS/R24/CORRECTIVE/C1C_MERGE_GATE_CONTRACT_V1.json";
export const SCRIPT_PATH = "scripts/ops/r24/corrective/c7b-live-ruleset-audit.mjs";
export const TEST_PATH = "test/contracts/r24-c7b-live-ruleset-audit.contract.test.mjs";

export const WRITE_SET = Object.freeze([
  TEST_INVENTORY_PATH,
  C1C_APPROVALS_PATH,
  C7B_APPROVALS_PATH,
  CONTRACT_PATH,
  EVIDENCE_PATH,
  STAGE_ADMISSION_PATH,
  STAGE_INSTANCE_PATH,
  SCRIPT_PATH,
  TEST_PATH
].sort());

function fail(code, detail) {
  const error = new Error(`${code}: ${detail}`);
  error.code = code;
  throw error;
}

function assert(condition, code, detail) {
  if (!condition) fail(code, detail);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sameSet(actual, expected) {
  return JSON.stringify([...new Set(actual)].sort()) === JSON.stringify([...new Set(expected)].sort());
}

function fileRecord(repoRelativePath, capabilityId, role) {
  const bytes = readFileSync(repoRelativePath);
  return { capabilityId, role, sha256: sha256(bytes), sizeBytes: bytes.length };
}

function readBoundedText(filename, maxBytes) {
  const stats = statSync(filename);
  assert(stats.isFile() && stats.size <= maxBytes, "E_INPUT_BOUNDS", path.basename(filename));
  return readFileSync(filename, "utf8");
}

export function normalizeLiveRuleset(ruleset) {
  assert(ruleset && typeof ruleset === "object" && !Array.isArray(ruleset), "E_LIVE_RULESET_SCHEMA", "object");
  const rawRules = Array.isArray(ruleset.rules) ? ruleset.rules : [];
  const rule = (type) => rawRules.find((entry) => entry?.type === type) ?? null;
  const pullRequest = rule("pull_request")?.parameters ?? null;
  const requiredStatus = rule("required_status_checks")?.parameters ?? null;
  const requiredChecks = Array.isArray(requiredStatus?.required_status_checks)
    ? requiredStatus.required_status_checks
      .map((entry) => ({ context: entry?.context ?? null, integrationId: entry?.integration_id ?? null }))
      .sort((left, right) => `${left.context}:${left.integrationId}`.localeCompare(`${right.context}:${right.integrationId}`, "en-US"))
    : [];
  const bypassActors = Array.isArray(ruleset.bypass_actors)
    ? ruleset.bypass_actors
      .map((entry) => ({ actorId: entry?.actor_id ?? null, actorType: entry?.actor_type ?? null, bypassMode: entry?.bypass_mode ?? null }))
      .sort((left, right) => `${left.actorType}:${left.actorId}`.localeCompare(`${right.actorType}:${right.actorId}`, "en-US"))
    : null;
  return {
    bypassActors,
    conditions: {
      refName: {
        exclude: Array.isArray(ruleset.conditions?.ref_name?.exclude) ? [...ruleset.conditions.ref_name.exclude].sort() : [],
        include: Array.isArray(ruleset.conditions?.ref_name?.include) ? [...ruleset.conditions.ref_name.include].sort() : []
      }
    },
    currentUserCanBypass: ruleset.current_user_can_bypass ?? null,
    enforcement: ruleset.enforcement ?? null,
    id: ruleset.id ?? null,
    name: ruleset.name ?? null,
    rules: {
      deletion: Boolean(rule("deletion")),
      nonFastForward: Boolean(rule("non_fast_forward")),
      pullRequest: pullRequest ? {
        allowedMergeMethods: Array.isArray(pullRequest.allowed_merge_methods) ? [...pullRequest.allowed_merge_methods].sort() : [],
        dismissStaleReviewsOnPush: pullRequest.dismiss_stale_reviews_on_push === true,
        requireExtraApprovalForUnattributedChanges: pullRequest.require_extra_approval_for_unattributed_changes === true,
        requiredReviewThreadResolution: pullRequest.required_review_thread_resolution === true
      } : null,
      requiredStatusChecks: requiredStatus ? {
        doNotEnforceOnCreate: requiredStatus.do_not_enforce_on_create === true,
        requiredChecks,
        strict: requiredStatus.strict_required_status_checks_policy === true
      } : null
    },
    source: ruleset.source ?? null,
    sourceType: ruleset.source_type ?? null,
    target: ruleset.target ?? null
  };
}

export function evaluateNormalizedRuleset(snapshot, policy) {
  const failures = [];
  const reject = (condition, code, detail) => {
    if (!condition) failures.push({ code, detail });
  };
  reject(snapshot.id === policy.id && snapshot.name === policy.name, "E_RULESET_IDENTITY", snapshot.id);
  reject(snapshot.source === policy.source && snapshot.sourceType === policy.sourceType, "E_RULESET_SOURCE", snapshot.source);
  reject(snapshot.target === policy.target && snapshot.enforcement === policy.enforcement, "E_RULESET_ENFORCEMENT", snapshot.enforcement);
  reject(snapshot.conditions.refName.include.includes(policy.conditionInclude), "E_DEFAULT_BRANCH_CONDITION", policy.conditionInclude);
  reject(snapshot.rules.deletion === true, "E_DELETION_NOT_BLOCKED", "deletion");
  reject(snapshot.rules.nonFastForward === true, "E_NON_FAST_FORWARD_NOT_BLOCKED", "non_fast_forward");
  reject(snapshot.rules.pullRequest !== null, "E_PR_NOT_REQUIRED", "pull_request");
  reject(snapshot.rules.pullRequest?.requiredReviewThreadResolution === true, "E_CONVERSATION_RESOLUTION_NOT_REQUIRED", "pull_request");
  reject(snapshot.rules.requiredStatusChecks !== null, "E_REQUIRED_STATUS_RULE_MISSING", "required_status_checks");
  reject(JSON.stringify(snapshot.rules.requiredStatusChecks?.requiredChecks) === JSON.stringify(policy.requiredChecks), "E_REQUIRED_CONTEXT", JSON.stringify(snapshot.rules.requiredStatusChecks?.requiredChecks));
  reject(Array.isArray(snapshot.bypassActors) && snapshot.bypassActors.length === 0, "E_BYPASS_ACTOR", snapshot.bypassActors === null ? "unavailable" : snapshot.bypassActors.length);
  reject(snapshot.currentUserCanBypass === policy.currentUserCanBypass, "E_CURRENT_USER_BYPASS", snapshot.currentUserCanBypass);
  return {
    failures,
    schemaVersion: "YALKEN_R24_C7B_LIVE_RULESET_EVALUATION_V1",
    status: failures.length === 0 ? "PASS" : "FAIL"
  };
}

export function fetchLiveRuleset(contract) {
  let output;
  try {
    output = execFileSync("gh", ["api", `repos/${contract.repositoryFullName}/rulesets/${contract.expectedRuleset.id}`], {
      encoding: "utf8",
      maxBuffer: contract.bounds.maxApiBytes,
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (error) {
    fail("E_LIVE_RULESET_UNAVAILABLE", error.status ?? "gh-api");
  }
  assert(Buffer.byteLength(output) <= contract.bounds.maxApiBytes, "E_INPUT_BOUNDS", "live-ruleset");
  try {
    return JSON.parse(output);
  } catch {
    fail("E_LIVE_RULESET_SCHEMA", "json");
  }
}

function assertFixedAdmissionBindings() {
  const program = readCanonicalJson(PROGRAM_TEMPLATE_PATH);
  const registry = readCanonicalJson(STAGE_REGISTRY_PATH);
  const trust = readCanonicalJson(TRUST_MODEL_PATH);
  const standing = readCanonicalJson(STANDING_AUTHORITY_PATH);
  const stage = readCanonicalJson(STAGE_INSTANCE_PATH);
  const admission = readCanonicalJson(STAGE_ADMISSION_PATH);
  assert(program.digest === PROGRAM_TEMPLATE_DIGEST, "E_PROGRAM_DIGEST", program.digest);
  assert(registry.digest === STAGE_REGISTRY_DIGEST, "E_REGISTRY_DIGEST", registry.digest);
  assert(trust.digest === TRUST_MODEL_DIGEST, "E_TRUST_MODEL_DIGEST", trust.digest);
  assert(standing.digest === OWNER_BINDING_DIGEST, "E_STANDING_AUTHORITY_DIGEST", standing.digest);
  assert(standing.value.programTemplateDigest === PROGRAM_TEMPLATE_DIGEST, "E_STANDING_AUTHORITY_BINDING", "program");
  assert(standing.value.stageRegistryDigest === STAGE_REGISTRY_DIGEST, "E_STANDING_AUTHORITY_BINDING", "registry");
  assert(standing.value.trustModelDigest === TRUST_MODEL_DIGEST, "E_STANDING_AUTHORITY_BINDING", "trust");
  assert(stage.digest === STAGE_INSTANCE_DIGEST, "E_STAGE_INSTANCE_DIGEST", stage.digest);
  assert(admission.digest === STAGE_ADMISSION_DIGEST, "E_STAGE_ADMISSION_DIGEST", admission.digest);
  assert(stage.value.stageId === STAGE_ID && admission.value.stageId === STAGE_ID, "E_STAGE_IDENTITY", STAGE_ID);
  assert(stage.value.baseSha === SOURCE_HEAD_SHA && stage.value.headSha === SOURCE_HEAD_SHA && stage.value.treeSha === SOURCE_TREE_SHA, "E_STAGE_SOURCE_BINDING", SOURCE_HEAD_SHA);
  assert(stage.value.programTemplateDigest === PROGRAM_TEMPLATE_DIGEST && stage.value.stageRegistryDigest === STAGE_REGISTRY_DIGEST, "E_STAGE_AUTHORITY_BINDING", STAGE_ID);
  assert(stage.value.ownerAuthorityBindingDigest === OWNER_BINDING_DIGEST, "E_STAGE_OWNER_BINDING", STAGE_ID);
  assert(stage.value.predecessorTerminalDigest === PREDECESSOR_TERMINAL_DIGEST, "E_PREDECESSOR_TERMINAL_BINDING", STAGE_ID);
  assert(stage.value.predecessorCertifiedDoneReceiptDigest === PREDECESSOR_CERTIFIED_DONE_RECEIPT_DIGEST, "E_PREDECESSOR_RECEIPT_BINDING", STAGE_ID);
  assert(stage.value.predecessorLeaseReleaseDigest === PREDECESSOR_LEASE_RELEASE_DIGEST, "E_PREDECESSOR_RELEASE_BINDING", STAGE_ID);
  assert(stage.value.dependencies?.length === 1 && stage.value.dependencies[0]?.stageId === "C7A" && stage.value.dependencies[0]?.status === "CERTIFIED_DONE" && stage.value.dependencies[0]?.attestationDigest === PREDECESSOR_TERMINAL_DIGEST, "E_C7A_DEPENDENCY_BINDING", STAGE_ID);
  assert(sameSet(stage.value.writeSet.paths, WRITE_SET), "E_WRITE_SET_BINDING", STAGE_ID);
  assert(admission.value.status === "ADMITTED" && admission.value.stageInstanceDigest === STAGE_INSTANCE_DIGEST && admission.value.acceptanceSignalsDigest === ACCEPTANCE_SIGNALS_DIGEST, "E_ADMISSION_BINDING", STAGE_ID);
}

function assertHeadContour() {
  const currentHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const baseTree = execFileSync("git", ["rev-parse", `${SOURCE_HEAD_SHA}^{tree}`], { encoding: "utf8" }).trim();
  assert(baseTree === SOURCE_TREE_SHA, "E_SOURCE_TREE_DRIFT", baseTree);
  if (currentHead !== SOURCE_HEAD_SHA) {
    try {
      execFileSync("git", ["merge-base", "--is-ancestor", SOURCE_HEAD_SHA, currentHead], { stdio: "ignore" });
    } catch {
      fail("E_SOURCE_HEAD_NOT_ANCESTOR", currentHead);
    }
    const commitCount = Number(execFileSync("git", ["rev-list", "--count", `${SOURCE_HEAD_SHA}..${currentHead}`], { encoding: "utf8" }).trim());
    assert(Number.isInteger(commitCount) && commitCount <= 2, "E_UNBOUNDED_DELTA", commitCount);
    const changedPaths = execFileSync("git", ["diff", "--name-only", SOURCE_HEAD_SHA, currentHead], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
    for (const changedPath of changedPaths) assert(WRITE_SET.includes(changedPath), "E_WRITE_SET_DRIFT", changedPath);
  }
  const statusLines = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { encoding: "utf8" }).split("\n").filter(Boolean);
  for (const line of statusLines) {
    assert(!line.slice(0, 2).includes("R"), "E_RENAME_FORBIDDEN", line);
    assert(WRITE_SET.includes(line.slice(3)), "E_DIRTY_PATH_OUTSIDE_WRITE_SET", line.slice(3));
  }
}

export function buildContract() {
  return {
    bounds: { maxApiBytes: 262144, maxRules: 32 },
    expectedRuleset: {
      conditionInclude: "~DEFAULT_BRANCH",
      currentUserCanBypass: "never",
      enforcement: "active",
      id: 12270444,
      name: "protect-main",
      requiredChecks: [{ context: "oss-policy", integrationId: 15368 }],
      source: "KirPonomarev/writer-editor",
      sourceType: "Repository",
      target: "branch"
    },
    nonClaims: ["NO_RULESET_MUTATION", "NO_BRANCH_PROTECTION_FALLBACK", "NO_PRODUCT_RUNTIME_CHANGE", "NO_RELEASE_OR_DISTRIBUTION", "NO_PROGRAM_DONE"],
    repositoryFullName: "KirPonomarev/writer-editor",
    schemaVersion: "YALKEN_R24_C7B_LIVE_RULESET_AUDIT_CONTRACT_V1",
    sourceBindings: {
      acceptanceSignalsDigest: ACCEPTANCE_SIGNALS_DIGEST,
      c1cContract: fileRecord(C1C_CONTRACT_PATH, "CAP_R24_C7B_C1C_RULESET_CONTRACT", "PREDECESSOR_RULESET_CONTRACT"),
      focusedTest: fileRecord(TEST_PATH, "CAP_R24_C7B_FOCUSED_TEST", "FOCUSED_NEGATIVE_TEST"),
      generator: fileRecord(SCRIPT_PATH, "CAP_R24_C7B_GENERATOR", "DETERMINISTIC_LIVE_AUDIT_GENERATOR"),
      leaseDigest: LEASE_DIGEST,
      fenceDigest: FENCE_DIGEST,
      predecessorCertifiedDoneReceiptDigest: PREDECESSOR_CERTIFIED_DONE_RECEIPT_DIGEST,
      predecessorLeaseReleaseDigest: PREDECESSOR_LEASE_RELEASE_DIGEST,
      predecessorTerminalDigest: PREDECESSOR_TERMINAL_DIGEST,
      programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
      sourceHeadSha: SOURCE_HEAD_SHA,
      sourceTreeSha: SOURCE_TREE_SHA,
      stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
      stageInstanceDigest: STAGE_INSTANCE_DIGEST,
      stageRegistryDigest: STAGE_REGISTRY_DIGEST,
      trustModelDigest: TRUST_MODEL_DIGEST
    },
    stageId: STAGE_ID
  };
}

export function buildEvidence(contract = buildContract(), rawRuleset = fetchLiveRuleset(contract)) {
  const snapshot = normalizeLiveRuleset(rawRuleset);
  assert(Object.keys(snapshot.rules).length <= contract.bounds.maxRules, "E_RULE_COUNT_BOUNDS", Object.keys(snapshot.rules).length);
  const evaluation = evaluateNormalizedRuleset(snapshot, contract.expectedRuleset);
  return {
    acceptanceSignals: {
      LIVE_RULESET_ACTIVE_DEFAULT_BRANCH_BOUND: evaluation.failures.some((entry) => ["E_RULESET_IDENTITY", "E_RULESET_SOURCE", "E_RULESET_ENFORCEMENT", "E_DEFAULT_BRANCH_CONDITION"].includes(entry.code)) ? "FAIL" : "PASS",
      LIVE_RULESET_CONVERSATION_RESOLUTION: evaluation.failures.some((entry) => entry.code === "E_CONVERSATION_RESOLUTION_NOT_REQUIRED") ? "FAIL" : "PASS",
      LIVE_RULESET_NO_BYPASS_ACTORS: evaluation.failures.some((entry) => ["E_BYPASS_ACTOR", "E_CURRENT_USER_BYPASS"].includes(entry.code)) ? "FAIL" : "PASS",
      LIVE_RULESET_NON_FF_AND_DELETION_BLOCK: evaluation.failures.some((entry) => ["E_DELETION_NOT_BLOCKED", "E_NON_FAST_FORWARD_NOT_BLOCKED"].includes(entry.code)) ? "FAIL" : "PASS",
      LIVE_RULESET_PR_REQUIRED: evaluation.failures.some((entry) => entry.code === "E_PR_NOT_REQUIRED") ? "FAIL" : "PASS",
      LIVE_RULESET_REQUIRED_CHECKS: evaluation.failures.some((entry) => ["E_REQUIRED_STATUS_RULE_MISSING", "E_REQUIRED_CONTEXT"].includes(entry.code)) ? "FAIL" : "PASS"
    },
    contractDigest: sha256(canonicalBytes(contract)),
    evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID],
    evaluation,
    externalTerminalAttestation: { required: true, status: "AWAITING_POST_MERGE_EXTERNAL_C7B_ATTESTATION" },
    liveRuleset: snapshot,
    nonClaims: [...contract.nonClaims],
    observedAtUtc: OBSERVED_AT_UTC,
    schemaVersion: "YALKEN_R24_C7B_LIVE_RULESET_EVIDENCE_V1",
    sourceBindings: {
      programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
      sourceHeadSha: SOURCE_HEAD_SHA,
      sourceTreeSha: SOURCE_TREE_SHA,
      stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
      stageInstanceDigest: STAGE_INSTANCE_DIGEST
    },
    stageId: STAGE_ID,
    status: evaluation.status === "PASS" ? "CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION" : "FAIL"
  };
}

function approvalEntry(repoRelativePath) {
  const bytes = readFileSync(repoRelativePath);
  return {
    approvedAtUtc: OBSERVED_AT_UTC,
    approvedBy: `owner-standing-authority:${OWNER_BINDING_DIGEST}`,
    filePath: repoRelativePath,
    rationale: `C7B live GitHub ruleset and protected-branch read-only audit under StageInstance ${STAGE_INSTANCE_DIGEST}; exact PR, required check, history, deletion, conversation and no-bypass invariants remain fail-closed without ruleset mutation or Program DONE expansion.`,
    sha256: sha256(bytes)
  };
}

function governedC7bPaths() {
  return [CONTRACT_PATH, EVIDENCE_PATH, STAGE_ADMISSION_PATH, STAGE_INSTANCE_PATH, TEST_INVENTORY_PATH, SCRIPT_PATH, TEST_PATH];
}

export function buildC7bApprovals() {
  return {
    approvals: governedC7bPaths().map(approvalEntry),
    evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID],
    version: "v1.0"
  };
}

export function buildC1cApprovals(c7bApprovals = buildC7bApprovals()) {
  const current = readCanonicalJson(C1C_APPROVALS_PATH).value;
  const governed = [...governedC7bPaths(), C7B_APPROVALS_PATH];
  const governedSet = new Set(governed);
  const preserved = current.approvals.filter((entry) => !governedSet.has(entry.filePath));
  const appended = governedC7bPaths().map(approvalEntry);
  appended.push({
    approvedAtUtc: OBSERVED_AT_UTC,
    approvedBy: `owner-standing-authority:${OWNER_BINDING_DIGEST}`,
    filePath: C7B_APPROVALS_PATH,
    rationale: `C7B live ruleset governance approval set under StageInstance ${STAGE_INSTANCE_DIGEST}; no ruleset mutation, product, release or Program DONE scope expansion.`,
    sha256: sha256(canonicalBytes(c7bApprovals))
  });
  return { ...current, approvals: [...preserved, ...appended] };
}

function writeArtifacts() {
  assertHeadContour();
  assertFixedAdmissionBindings();
  writeFileSync(TEST_INVENTORY_PATH, canonicalBytes(buildInventory(process.cwd())));
  const contract = buildContract();
  writeFileSync(CONTRACT_PATH, canonicalBytes(contract));
  const evidence = buildEvidence(contract);
  assert(evidence.status !== "FAIL", "E_LIVE_RULESET_AUDIT_FAILED", evidence.evaluation.failures.length);
  writeFileSync(EVIDENCE_PATH, canonicalBytes(evidence));
  const approvals = buildC7bApprovals();
  writeFileSync(C7B_APPROVALS_PATH, canonicalBytes(approvals));
  writeFileSync(C1C_APPROVALS_PATH, canonicalBytes(buildC1cApprovals(approvals)));
  return { contract, evidence };
}

function checkArtifacts() {
  assertHeadContour();
  assertFixedAdmissionBindings();
  assert(readFileSync(TEST_INVENTORY_PATH).equals(canonicalBytes(buildInventory(process.cwd()))), "E_ARTIFACT_DRIFT", TEST_INVENTORY_PATH);
  const contract = buildContract();
  assert(readFileSync(CONTRACT_PATH).equals(canonicalBytes(contract)), "E_ARTIFACT_DRIFT", CONTRACT_PATH);
  const evidence = buildEvidence(contract);
  assert(readFileSync(EVIDENCE_PATH).equals(canonicalBytes(evidence)), "E_ARTIFACT_DRIFT", EVIDENCE_PATH);
  const approvals = buildC7bApprovals();
  assert(readFileSync(C7B_APPROVALS_PATH).equals(canonicalBytes(approvals)), "E_ARTIFACT_DRIFT", C7B_APPROVALS_PATH);
  assert(readFileSync(C1C_APPROVALS_PATH).equals(canonicalBytes(buildC1cApprovals(approvals))), "E_ARTIFACT_DRIFT", C1C_APPROVALS_PATH);
  assert(evidence.status !== "FAIL", "E_LIVE_RULESET_AUDIT_FAILED", evidence.evaluation.failures.length);
  return { contract, evidence };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const mode = process.argv[2];
    if (mode === "--write") {
      const { contract, evidence } = writeArtifacts();
      process.stdout.write(canonicalBytes({ contractDigest: sha256(canonicalBytes(contract)), evidenceDigest: sha256(canonicalBytes(evidence)), stageId: STAGE_ID, status: "WRITTEN" }));
    } else if (mode === "--check") {
      const { contract, evidence } = checkArtifacts();
      process.stdout.write(canonicalBytes({ contractDigest: sha256(canonicalBytes(contract)), evidenceDigest: sha256(canonicalBytes(evidence)), stageId: STAGE_ID, status: "PASS" }));
    } else {
      fail("E_USAGE", "--write | --check");
    }
  } catch (error) {
    process.stderr.write(`${canonicalize({ code: error.code ?? "E_UNTYPED", message: error.message })}\n`);
    process.exitCode = 1;
  }
}
