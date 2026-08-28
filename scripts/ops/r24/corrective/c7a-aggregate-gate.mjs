import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { canonicalBytes, canonicalize, readCanonicalJson } from "./canonical-json.mjs";
import { evaluateRequiredDependencyResults as evaluateC1cResults } from "./c1c-merge-gate.mjs";

export const STAGE_ID = "C7A";
export const OBSERVED_AT_UTC = "2026-08-28T18:25:23Z";
export const OWNER_BINDING_DIGEST = "be68bd97021d13fbfb75c73791bda7f6bfeebecebf525d4a927d1a4c9fe9efd6";
export const PROGRAM_TEMPLATE_DIGEST = "6c833c964318da3e61e1743365f8763206be838647b5222c187b3bda8d1c6b9a";
export const STAGE_REGISTRY_DIGEST = "c8af046b5918f43a50af66886b0b5c9d2e22ea6501240d4b239101d8836ced1a";
export const TRUST_MODEL_DIGEST = "4f6e4b3a191e0302ea44646659e8c2f71121af7d808cc0ee768269b4e156840d";
export const STAGE_INSTANCE_DIGEST = "2df2f9166e72df9e28bb7e3a12ac0b0266c9c7ebb47b60f5ddf5d0397d65d98a";
export const STAGE_ADMISSION_DIGEST = "8a2a66d4b7e6a28a66ee5d88a5724f89f01b2a375babcbd37a07b216d3d4d47d";
export const ACCEPTANCE_SIGNALS_DIGEST = "9965fa7e329031549141811b712212844cf1df9b368c1dd5ac80595f1e306a12";
export const PREDECESSOR_STAGE_INSTANCE_DIGEST = "00c28fc8ee9490a8e41b69cadbf9b98e8404b0280fc8d3b8a396f8c31e5c8acd";
export const PREDECESSOR_STAGE_ADMISSION_DIGEST = "85395a6de1caf14aeb847a45ecaef498cdea4cb072cb25f3b335ff326d8d5bf3";
export const SUPERSEDED_STAGE_INSTANCE_DIGEST = "7a706a72aefcf043442497218e4554071f11614caf0d5c2bf72d77b02a425669";
export const SUPERSEDED_STAGE_ADMISSION_DIGEST = "0bdf81ae3ab6ccf2726c71a3338a83a606756ef5e1f0405dbbe9c22188971efc";
export const HISTORICAL_STAGE_INSTANCE_DIGEST = "ad6200ce8d10cf97ad31089cd134ef7fe4a1d92ceacbf6527110276c8eee1b8f";
export const HISTORICAL_STAGE_ADMISSION_DIGEST = "8e33576cfcdb29dfc9597b5517c4691fbb7045ad7d1e160f6c5dd617f3649bb4";
export const SOURCE_HEAD_SHA = "0bcd60f6bf2fd131ad58d1531751d31c82efcf50";
export const SOURCE_TREE_SHA = "07478fae9fcc1db7c83f64e4621ada9c6550477e";
export const PREDECESSOR_TERMINAL_DIGEST = "63028de903f242083ec66fef59dd7d7a05db4ae5eac774fa75552066f565cbd9";
export const PREDECESSOR_RELEASE_DIGEST = "f98082b2aa3bf731617b4fa01305ffc1dbcd2822fd552ed0cdce3ac714a21d0e";
export const PREDECESSOR_FENCE_DIGEST = "7b0b14df142a3e5b0128cffd97171b18003e1e0adba1238cc14e98cfe00701c6";
export const LEASE_DIGEST = "9565c217944e3ba51f41f1f6add8c5c972dcea0d26c45404305d6ae9964bc1db";
export const FENCE_DIGEST = "2087d08591224054010693d62d32b7c307d60452116267c99352702ad11f24d8";
export const PRESERVED_WIP_MANIFEST_DIGEST = "c484536f6e5196cfe4c45b197f86ae939c3b528001104b5e489de88a041ea5fb";
export const CONTROL_PLANE_EVIDENCE_STAMP_ID = "ES-R24-CORRECTIVE-B0-CONTROL-PLANE-CLAIM-BINDINGS";

export const CONTRACT_PATH = "docs/OPS/R24/CORRECTIVE/C7A_AGGREGATE_GATE_CONTRACT_V1.json";
export const EVALUATION_PATH = "docs/OPS/R24/CORRECTIVE/C7A_CURRENT_HEAD_EVALUATION_V1.json";
export const C7A_APPROVALS_PATH = "docs/OPS/R24/CORRECTIVE/C7A_GOVERNANCE_CHANGE_APPROVALS_V1.json";
export const C1C_APPROVALS_PATH = "docs/OPS/R24/CORRECTIVE/C1C_GOVERNANCE_CHANGE_APPROVALS_V1.json";
export const STAGE_INSTANCE_PATH = "docs/OPS/R24/CORRECTIVE/C7A_STAGE_INSTANCE_AMENDMENT_V4.json";
export const STAGE_ADMISSION_PATH = "docs/OPS/R24/CORRECTIVE/C7A_STAGE_ADMISSION_ATTESTATION_AMENDMENT_V4.json";
export const PREDECESSOR_STAGE_INSTANCE_PATH = "docs/OPS/R24/CORRECTIVE/C7A_STAGE_INSTANCE_AMENDMENT_V3.json";
export const PREDECESSOR_STAGE_ADMISSION_PATH = "docs/OPS/R24/CORRECTIVE/C7A_STAGE_ADMISSION_ATTESTATION_AMENDMENT_V3.json";
export const SUPERSEDED_STAGE_INSTANCE_PATH = "docs/OPS/R24/CORRECTIVE/C7A_STAGE_INSTANCE_AMENDMENT_V2.json";
export const SUPERSEDED_STAGE_ADMISSION_PATH = "docs/OPS/R24/CORRECTIVE/C7A_STAGE_ADMISSION_ATTESTATION_AMENDMENT_V2.json";
export const HISTORICAL_STAGE_INSTANCE_PATH = "docs/OPS/R24/CORRECTIVE/C7A_STAGE_INSTANCE_V1.json";
export const HISTORICAL_STAGE_ADMISSION_PATH = "docs/OPS/R24/CORRECTIVE/C7A_STAGE_ADMISSION_ATTESTATION_V1.json";
export const TEST_INVENTORY_PATH = "docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json";
export const PROGRAM_TEMPLATE_PATH = "docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json";
export const STAGE_REGISTRY_PATH = "docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json";
export const TRUST_MODEL_PATH = "docs/OPS/R24/CORRECTIVE/TERMINAL_ATTESTATION_TRUST_MODEL_V1.json";
export const STANDING_AUTHORITY_PATH = "docs/OPS/R24/CORRECTIVE/STANDING_AUTHORITY_BINDING_V1.json";
export const WORKFLOW_PATH = ".github/workflows/oss-policy.yml";
export const C1C_CONTRACT_PATH = "docs/OPS/R24/CORRECTIVE/C1C_MERGE_GATE_CONTRACT_V1.json";
export const C1C_VERIFIER_PATH = "scripts/ops/r24/corrective/c1c-merge-gate.mjs";
export const SCRIPT_PATH = "scripts/ops/r24/corrective/c7a-aggregate-gate.mjs";
export const TEST_PATH = "test/contracts/r24-c7a-aggregate-gate.contract.test.mjs";

export const REQUIRED_DEPENDENCY_JOBS = Object.freeze([
  "c1a-hermetic",
  "c1b-baseline",
  "c1c-contract",
  "oss-policy-core",
  "rtk-required",
  "x1-runtime-parity"
]);

export const WRITE_SET = Object.freeze([
  C1C_APPROVALS_PATH,
  CONTRACT_PATH,
  EVALUATION_PATH,
  C7A_APPROVALS_PATH,
  STAGE_ADMISSION_PATH,
  STAGE_INSTANCE_PATH,
  SCRIPT_PATH
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

function readBoundedText(filename, maxBytes) {
  const stats = statSync(filename);
  assert(stats.isFile() && stats.size <= maxBytes, "E_INPUT_BOUNDS", path.basename(filename));
  return readFileSync(filename, "utf8");
}

function fileRecord(repoRelativePath, capabilityId, role) {
  const bytes = readFileSync(repoRelativePath);
  return { capabilityId, role, sha256: sha256(bytes), sizeBytes: bytes.length };
}

function jobBlock(source, jobId) {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => line === `  ${jobId}:`);
  if (start === -1) return "";
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^  [a-zA-Z0-9_-]+:\s*$/u.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

export function parseTopLevelJobIds(source) {
  const lines = source.split("\n");
  const jobsIndex = lines.findIndex((line) => line === "jobs:");
  if (jobsIndex === -1) return [];
  return lines
    .slice(jobsIndex + 1)
    .map((line) => /^  ([a-zA-Z0-9_-]+):\s*$/u.exec(line)?.[1] ?? null)
    .filter(Boolean);
}

export function evaluateWorkflowTopology(source, contract) {
  const failures = [];
  const reject = (condition, code, detail) => {
    if (!condition) failures.push({ code, detail });
  };
  const aggregateId = contract.aggregate.aggregateJobId;
  const jobIds = parseTopLevelJobIds(source);
  const aggregateCount = jobIds.filter((jobId) => jobId === aggregateId).length;
  const nonAggregateJobIds = jobIds.filter((jobId) => jobId !== aggregateId);
  const aggregate = jobBlock(source, aggregateId);
  const needs = [...aggregate.matchAll(/^      - ([a-zA-Z0-9_-]+)\s*$/gmu)].map((match) => match[1]);
  const resultMappings = [...aggregate.matchAll(/needs\.([a-zA-Z0-9_-]+)\.result/gmu)].map((match) => match[1]);

  reject(jobIds.length > 0, "E_JOBS_MISSING", "jobs");
  reject(aggregateCount === 1 && aggregate.length > 0, "E_AGGREGATE_IDENTITY", `${aggregateId}:${aggregateCount}`);
  reject(sameSet(nonAggregateJobIds, contract.aggregate.requiredDependencyJobs), "E_UNACCOUNTED_JOB", `${nonAggregateJobIds.length}/${contract.aggregate.requiredDependencyJobs.length}`);
  reject(sameSet(needs, contract.aggregate.requiredDependencyJobs), "E_NEEDS_SET_MISMATCH", `${needs.length}/${contract.aggregate.requiredDependencyJobs.length}`);
  reject(sameSet(resultMappings, contract.aggregate.requiredDependencyJobs), "E_RESULT_MAP_MISMATCH", `${resultMappings.length}/${contract.aggregate.requiredDependencyJobs.length}`);
  reject(aggregate.split("if: ${{ always() }}").length - 1 === 1, "E_AGGREGATE_NOT_ALWAYS", aggregateId);
  reject(aggregate.includes("name: oss-policy"), "E_REQUIRED_CONTEXT_MISSING", "oss-policy");
  reject(aggregate.includes("REQUIRED_DEPENDENCY_RESULTS:"), "E_RESULT_PAYLOAD_MISSING", "REQUIRED_DEPENDENCY_RESULTS");
  reject(aggregate.includes("node scripts/ops/r24/corrective/c1c-merge-gate.mjs --check-results docs/OPS/R24/CORRECTIVE/C1C_MERGE_GATE_CONTRACT_V1.json"), "E_RESULT_VERIFIER_UNBOUND", aggregateId);
  reject(!source.includes("npm run -s test:rtk"), "E_DUPLICATE_FULL_SUITE", "master-workflow");

  return {
    aggregateJobId: aggregateId,
    failures,
    jobIds,
    needs,
    nonAggregateJobIds,
    resultMappings: [...new Set(resultMappings)],
    schemaVersion: "YALKEN_R24_C7A_WORKFLOW_TOPOLOGY_V1",
    status: failures.length === 0 ? "PASS" : "FAIL"
  };
}

export function evaluateRequiredDependencyResults(results, requiredJobs = REQUIRED_DEPENDENCY_JOBS) {
  const failures = [];
  if (!results || typeof results !== "object" || Array.isArray(results)) {
    failures.push({ code: "E_RESULT_SET_INVALID", jobId: "RESULT_SET", result: "invalid" });
  } else {
    const actualKeys = Object.keys(results).sort();
    const expectedKeys = [...requiredJobs].sort();
    if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
      failures.push({ code: "E_RESULT_SET_MISMATCH", jobId: "RESULT_SET", result: `${actualKeys.length}/${expectedKeys.length}` });
    }
    for (const jobId of requiredJobs) {
      const result = results[jobId] ?? "missing";
      if (result !== "success") failures.push({ code: "E_REQUIRED_DEPENDENCY_NOT_SUCCESS", jobId, result });
    }
  }
  return {
    failures,
    requiredJobs: [...requiredJobs],
    schemaVersion: "YALKEN_R24_C7A_AGGREGATE_RESULT_V1",
    status: failures.length === 0 ? "PASS" : "FAIL"
  };
}

export function evaluateBoundC1cEnforcement(contract) {
  const required = contract.aggregate.requiredDependencyJobs;
  const success = Object.fromEntries(required.map((jobId) => [jobId, "success"]));
  const failures = [];
  const passResult = evaluateC1cResults(success, required);
  if (passResult.status !== "PASS") failures.push({ code: "E_BOUND_VERIFIER_REJECTS_SUCCESS", detail: passResult.status });
  let negativeCases = 0;
  for (const jobId of required) {
    for (const result of contract.aggregate.failClosedResults) {
      const payload = { ...success, [jobId]: result };
      const evidence = evaluateC1cResults(payload, required);
      negativeCases += 1;
      if (evidence.status !== "FAIL" || !evidence.failures.some((entry) => entry.jobId === jobId && entry.result === result)) {
        failures.push({ code: "E_BOUND_VERIFIER_NOT_FAIL_CLOSED", detail: `${jobId}:${result}` });
      }
    }
  }
  const missing = { ...success };
  delete missing[required[0]];
  if (evaluateC1cResults(missing, required).status !== "FAIL") failures.push({ code: "E_BOUND_VERIFIER_ACCEPTS_MISSING", detail: required[0] });
  if (evaluateC1cResults({ ...success, unadmitted: "success" }, required).status !== "FAIL") failures.push({ code: "E_BOUND_VERIFIER_ACCEPTS_EXTRA", detail: "unadmitted" });
  return {
    failures,
    negativeCases,
    schemaVersion: "YALKEN_R24_C7A_BOUND_C1C_ENFORCEMENT_V1",
    status: failures.length === 0 ? "PASS" : "FAIL"
  };
}

function assertFixedAdmissionBindings() {
  const program = readCanonicalJson(PROGRAM_TEMPLATE_PATH);
  const registry = readCanonicalJson(STAGE_REGISTRY_PATH);
  const trust = readCanonicalJson(TRUST_MODEL_PATH);
  const standing = readCanonicalJson(STANDING_AUTHORITY_PATH);
  const stage = readCanonicalJson(STAGE_INSTANCE_PATH);
  const admission = readCanonicalJson(STAGE_ADMISSION_PATH);
  const predecessorStage = readCanonicalJson(PREDECESSOR_STAGE_INSTANCE_PATH);
  const predecessorAdmission = readCanonicalJson(PREDECESSOR_STAGE_ADMISSION_PATH);
  const supersededStage = readCanonicalJson(SUPERSEDED_STAGE_INSTANCE_PATH);
  const supersededAdmission = readCanonicalJson(SUPERSEDED_STAGE_ADMISSION_PATH);
  const historicalStage = readCanonicalJson(HISTORICAL_STAGE_INSTANCE_PATH);
  const historicalAdmission = readCanonicalJson(HISTORICAL_STAGE_ADMISSION_PATH);
  assert(program.digest === PROGRAM_TEMPLATE_DIGEST, "E_PROGRAM_DIGEST", program.digest);
  assert(registry.digest === STAGE_REGISTRY_DIGEST, "E_REGISTRY_DIGEST", registry.digest);
  assert(trust.digest === TRUST_MODEL_DIGEST, "E_TRUST_MODEL_DIGEST", trust.digest);
  assert(standing.digest === OWNER_BINDING_DIGEST, "E_STANDING_AUTHORITY_DIGEST", standing.digest);
  assert(standing.value.programTemplateDigest === PROGRAM_TEMPLATE_DIGEST, "E_STANDING_AUTHORITY_BINDING", "program");
  assert(standing.value.stageRegistryDigest === STAGE_REGISTRY_DIGEST, "E_STANDING_AUTHORITY_BINDING", "registry");
  assert(standing.value.trustModelDigest === TRUST_MODEL_DIGEST, "E_STANDING_AUTHORITY_BINDING", "trust");
  assert(historicalStage.digest === HISTORICAL_STAGE_INSTANCE_DIGEST, "E_HISTORICAL_STAGE_DIGEST", historicalStage.digest);
  assert(historicalAdmission.digest === HISTORICAL_STAGE_ADMISSION_DIGEST, "E_HISTORICAL_ADMISSION_DIGEST", historicalAdmission.digest);
  assert(predecessorStage.digest === PREDECESSOR_STAGE_INSTANCE_DIGEST, "E_PREDECESSOR_STAGE_DIGEST", predecessorStage.digest);
  assert(predecessorAdmission.digest === PREDECESSOR_STAGE_ADMISSION_DIGEST, "E_PREDECESSOR_ADMISSION_DIGEST", predecessorAdmission.digest);
  assert(supersededStage.digest === SUPERSEDED_STAGE_INSTANCE_DIGEST, "E_SUPERSEDED_STAGE_DIGEST", supersededStage.digest);
  assert(supersededAdmission.digest === SUPERSEDED_STAGE_ADMISSION_DIGEST, "E_SUPERSEDED_ADMISSION_DIGEST", supersededAdmission.digest);
  assert(supersededStage.value.amendment?.predecessorStageInstanceDigest === HISTORICAL_STAGE_INSTANCE_DIGEST && supersededStage.value.amendment?.predecessorAdmissionDigest === HISTORICAL_STAGE_ADMISSION_DIGEST, "E_SUPERSEDED_AMENDMENT_BINDING", STAGE_ID);
  assert(predecessorStage.value.amendment?.predecessorStageInstanceDigest === SUPERSEDED_STAGE_INSTANCE_DIGEST && predecessorStage.value.amendment?.predecessorAdmissionDigest === SUPERSEDED_STAGE_ADMISSION_DIGEST, "E_PREDECESSOR_AMENDMENT_BINDING", STAGE_ID);
  assert(stage.digest === STAGE_INSTANCE_DIGEST, "E_STAGE_INSTANCE_DIGEST", stage.digest);
  assert(admission.digest === STAGE_ADMISSION_DIGEST, "E_STAGE_ADMISSION_DIGEST", admission.digest);
  assert(stage.value.stageId === STAGE_ID && admission.value.stageId === STAGE_ID, "E_STAGE_IDENTITY", STAGE_ID);
  assert(stage.value.baseSha === SOURCE_HEAD_SHA && stage.value.headSha === SOURCE_HEAD_SHA && stage.value.treeSha === SOURCE_TREE_SHA, "E_STAGE_SOURCE_BINDING", SOURCE_HEAD_SHA);
  assert(stage.value.programTemplateDigest === PROGRAM_TEMPLATE_DIGEST && stage.value.stageRegistryDigest === STAGE_REGISTRY_DIGEST, "E_STAGE_AUTHORITY_BINDING", STAGE_ID);
  assert(stage.value.ownerAuthorityBindingDigest === OWNER_BINDING_DIGEST, "E_STAGE_OWNER_BINDING", STAGE_ID);
  assert(stage.value.predecessorTerminalDigest === PREDECESSOR_TERMINAL_DIGEST && stage.value.predecessorLeaseReleaseDigest === PREDECESSOR_RELEASE_DIGEST && stage.value.predecessorFenceDigest === PREDECESSOR_FENCE_DIGEST, "E_STAGE_PREDECESSOR_BINDING", STAGE_ID);
  assert(stage.value.amendment?.predecessorStageInstanceDigest === PREDECESSOR_STAGE_INSTANCE_DIGEST && stage.value.amendment?.predecessorAdmissionDigest === PREDECESSOR_STAGE_ADMISSION_DIGEST, "E_STAGE_AMENDMENT_BINDING", STAGE_ID);
  assert(stage.value.dependencies?.length === 1 && stage.value.dependencies[0]?.stageId === "C6D" && stage.value.dependencies[0]?.status === "CERTIFIED_DONE" && stage.value.dependencies[0]?.attestationDigest === PREDECESSOR_TERMINAL_DIGEST, "E_C6D_DEPENDENCY_BINDING", STAGE_ID);
  assert(sameSet(stage.value.writeSet.paths, WRITE_SET), "E_WRITE_SET_BINDING", STAGE_ID);
  assert(admission.value.status === "ADMITTED" && admission.value.stageInstanceDigest === STAGE_INSTANCE_DIGEST && admission.value.acceptanceSignalsDigest === ACCEPTANCE_SIGNALS_DIGEST, "E_ADMISSION_BINDING", STAGE_ID);
}

function assertHeadContour() {
  const currentHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const baseTree = execFileSync("git", ["rev-parse", `${SOURCE_HEAD_SHA}^{tree}`], { encoding: "utf8" }).trim();
  assert(baseTree === SOURCE_TREE_SHA, "E_SOURCE_TREE_DRIFT", baseTree);
  if (currentHead === SOURCE_HEAD_SHA) return;
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

export function buildContract() {
  return {
    aggregate: {
      aggregateJobId: "oss-policy",
      failClosedResults: ["failure", "skipped", "cancelled"],
      ifExpression: "always()",
      requiredContext: "oss-policy",
      requiredDependencyJobs: [...REQUIRED_DEPENDENCY_JOBS],
      requiredResult: "success",
      workflowPath: WORKFLOW_PATH
    },
    bounds: { maxResultPayloadBytes: 8192, maxWorkflowBytes: 524288 },
    nonClaims: ["NO_PRODUCT_RUNTIME_CHANGE", "NO_RULESET_RECERTIFICATION", "NO_PROGRAM_DONE", "NO_RELEASE_OR_DISTRIBUTION"],
    schemaVersion: "YALKEN_R24_C7A_AGGREGATE_GATE_CONTRACT_V1",
    sourceBindings: {
      acceptanceSignalsDigest: ACCEPTANCE_SIGNALS_DIGEST,
      c1cContract: fileRecord(C1C_CONTRACT_PATH, "CAP_R24_C7A_BOUND_C1C_CONTRACT", "BOUND_RESULT_CONTRACT"),
      c1cVerifier: fileRecord(C1C_VERIFIER_PATH, "CAP_R24_C7A_BOUND_C1C_VERIFIER", "BOUND_RESULT_VERIFIER"),
      focusedTest: fileRecord(TEST_PATH, "CAP_R24_C7A_FOCUSED_TEST", "FOCUSED_NEGATIVE_TEST"),
      generator: fileRecord(SCRIPT_PATH, "CAP_R24_C7A_GENERATOR", "DETERMINISTIC_GENERATOR"),
      predecessorFenceDigest: PREDECESSOR_FENCE_DIGEST,
      predecessorLeaseReleaseDigest: PREDECESSOR_RELEASE_DIGEST,
      predecessorTerminalDigest: PREDECESSOR_TERMINAL_DIGEST,
      recoveryFenceDigest: FENCE_DIGEST,
      recoveryLeaseDigest: LEASE_DIGEST,
      preservedWipManifestDigest: PRESERVED_WIP_MANIFEST_DIGEST,
      programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
      sourceHeadSha: SOURCE_HEAD_SHA,
      sourceTreeSha: SOURCE_TREE_SHA,
      stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
      stageInstanceDigest: STAGE_INSTANCE_DIGEST,
      stageRegistryDigest: STAGE_REGISTRY_DIGEST,
      workflow: fileRecord(WORKFLOW_PATH, "CAP_R24_C7A_AGGREGATE_WORKFLOW", "AGGREGATE_WORKFLOW")
    },
    stageId: STAGE_ID
  };
}

export function buildEvaluation(contract = buildContract(), workflowSource = readBoundedText(WORKFLOW_PATH, 524288)) {
  const topology = evaluateWorkflowTopology(workflowSource, contract);
  const enforcement = evaluateBoundC1cEnforcement(contract);
  return {
    acceptanceSignals: {
      AGGREGATE_IF_ALWAYS: topology.failures.some((entry) => entry.code === "E_AGGREGATE_NOT_ALWAYS") ? "FAIL" : "PASS",
      ALL_REQUIRED_DEPENDENCIES_ACCOUNTED: topology.failures.some((entry) => entry.code === "E_UNACCOUNTED_JOB" || entry.code === "E_NEEDS_SET_MISMATCH") ? "FAIL" : "PASS",
      FAILED_SKIPPED_CANCELLED_REQUIRED_DEPENDENCY_FAILS: enforcement.status,
      RESULT_MAP_EXACT: topology.failures.some((entry) => entry.code === "E_RESULT_MAP_MISMATCH") ? "FAIL" : "PASS"
    },
    contractDigest: sha256(canonicalBytes(contract)),
    evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID],
    enforcement,
    externalTerminalAttestation: { required: true, status: "AWAITING_POST_MERGE_EXTERNAL_C7A_ATTESTATION" },
    nonClaims: [...contract.nonClaims],
    schemaVersion: "YALKEN_R24_C7A_CURRENT_HEAD_EVALUATION_V1",
    sourceBindings: {
      programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
      sourceHeadSha: SOURCE_HEAD_SHA,
      sourceTreeSha: SOURCE_TREE_SHA,
      stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
      stageInstanceDigest: STAGE_INSTANCE_DIGEST,
      workflowSha256: contract.sourceBindings.workflow.sha256
    },
    stageId: STAGE_ID,
    status: topology.status === "PASS" && enforcement.status === "PASS"
      ? "CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION"
      : "FAIL",
    topology
  };
}

function approvalEntry(repoRelativePath) {
  return {
    approvedAtUtc: OBSERVED_AT_UTC,
    approvedBy: `owner-standing-authority:${OWNER_BINDING_DIGEST}`,
    filePath: repoRelativePath,
    rationale: `C7A final aggregate dependency and result integrity under StageInstance ${STAGE_INSTANCE_DIGEST}; exact job accounting and fail-closed non-success semantics remain mandatory without product, ruleset, release or Program DONE expansion.`,
    sha256: sha256(readFileSync(repoRelativePath))
  };
}

function governedC7aPaths() {
  return [
    CONTRACT_PATH,
    EVALUATION_PATH,
    HISTORICAL_STAGE_ADMISSION_PATH,
    HISTORICAL_STAGE_INSTANCE_PATH,
    PREDECESSOR_STAGE_ADMISSION_PATH,
    PREDECESSOR_STAGE_INSTANCE_PATH,
    SUPERSEDED_STAGE_ADMISSION_PATH,
    SUPERSEDED_STAGE_INSTANCE_PATH,
    STAGE_ADMISSION_PATH,
    STAGE_INSTANCE_PATH,
    TEST_INVENTORY_PATH,
    SCRIPT_PATH,
    TEST_PATH
  ];
}

export function buildC7aApprovals() {
  return {
    approvals: governedC7aPaths().map(approvalEntry),
    evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID],
    version: "v1.0"
  };
}

export function buildC1cApprovals(c7aApprovals = buildC7aApprovals()) {
  const current = readCanonicalJson(C1C_APPROVALS_PATH).value;
  const c7aPaths = [...governedC7aPaths(), C7A_APPROVALS_PATH];
  const c7aPathSet = new Set(c7aPaths);
  const preserved = current.approvals.filter((entry) => !c7aPathSet.has(entry.filePath));
  const c7aApprovalsDigest = sha256(canonicalBytes(c7aApprovals));
  const appended = governedC7aPaths().map(approvalEntry);
  appended.push({
    approvedAtUtc: OBSERVED_AT_UTC,
    approvedBy: `owner-standing-authority:${OWNER_BINDING_DIGEST}`,
    filePath: C7A_APPROVALS_PATH,
    rationale: `C7A final aggregate governance approval set under StageInstance ${STAGE_INSTANCE_DIGEST}; no product, ruleset, release or Program DONE scope expansion.`,
    sha256: c7aApprovalsDigest
  });
  return { ...current, approvals: [...preserved, ...appended] };
}

function writeArtifacts() {
  assertHeadContour();
  assertFixedAdmissionBindings();
  const contract = buildContract();
  writeFileSync(CONTRACT_PATH, canonicalBytes(contract));
  const evaluation = buildEvaluation(contract);
  assert(evaluation.status !== "FAIL", "E_CURRENT_EVALUATION_FAILED", evaluation.topology.failures.length + evaluation.enforcement.failures.length);
  writeFileSync(EVALUATION_PATH, canonicalBytes(evaluation));
  const c7aApprovals = buildC7aApprovals();
  writeFileSync(C7A_APPROVALS_PATH, canonicalBytes(c7aApprovals));
  writeFileSync(C1C_APPROVALS_PATH, canonicalBytes(buildC1cApprovals(c7aApprovals)));
  return { contract, evaluation, c7aApprovals };
}

function checkArtifacts() {
  assertHeadContour();
  assertFixedAdmissionBindings();
  const contract = buildContract();
  assert(readFileSync(CONTRACT_PATH).equals(canonicalBytes(contract)), "E_ARTIFACT_DRIFT", CONTRACT_PATH);
  const evaluation = buildEvaluation(contract);
  assert(readFileSync(EVALUATION_PATH).equals(canonicalBytes(evaluation)), "E_ARTIFACT_DRIFT", EVALUATION_PATH);
  const c7aApprovals = buildC7aApprovals();
  assert(readFileSync(C7A_APPROVALS_PATH).equals(canonicalBytes(c7aApprovals)), "E_ARTIFACT_DRIFT", C7A_APPROVALS_PATH);
  assert(readFileSync(C1C_APPROVALS_PATH).equals(canonicalBytes(buildC1cApprovals(c7aApprovals))), "E_ARTIFACT_DRIFT", C1C_APPROVALS_PATH);
  assert(evaluation.status !== "FAIL", "E_CURRENT_EVALUATION_FAILED", evaluation.topology.failures.length + evaluation.enforcement.failures.length);
  return { contract, evaluation };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const mode = process.argv[2];
    if (mode === "--write") {
      const { contract, evaluation } = writeArtifacts();
      process.stdout.write(canonicalBytes({ contractDigest: sha256(canonicalBytes(contract)), evaluationDigest: sha256(canonicalBytes(evaluation)), stageId: STAGE_ID, status: "WRITTEN" }));
    } else if (mode === "--check") {
      const { contract, evaluation } = checkArtifacts();
      process.stdout.write(canonicalBytes({ contractDigest: sha256(canonicalBytes(contract)), evaluationDigest: sha256(canonicalBytes(evaluation)), stageId: STAGE_ID, status: "PASS" }));
    } else if (mode === "--check-results") {
      const payload = process.argv[3];
      assert(typeof payload === "string" && Buffer.byteLength(payload) <= 8192, "E_INPUT_BOUNDS", "dependency-results");
      const evidence = evaluateRequiredDependencyResults(JSON.parse(payload));
      process.stdout.write(canonicalBytes(evidence));
      if (evidence.status !== "PASS") process.exitCode = 1;
    } else {
      fail("E_USAGE", "--write | --check | --check-results JSON");
    }
  } catch (error) {
    process.stderr.write(`${canonicalize({ code: error.code ?? "E_UNTYPED", message: error.message })}\n`);
    process.exitCode = 1;
  }
}
