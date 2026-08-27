import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { canonicalBytes, canonicalize, readCanonicalJson } from "./canonical-json.mjs";

const CONTRACT_PATH = "docs/OPS/R24/CORRECTIVE/C1C_MERGE_GATE_CONTRACT_V1.json";
const EXPECTED_REPOSITORY = "KirPonomarev/writer-editor";
const EXPECTED_RULESET_ID = 12270444;

function fail(code, detail) {
  const error = new Error(`${code}: ${detail}`);
  error.code = code;
  throw error;
}

function assert(condition, code, detail) {
  if (!condition) fail(code, detail);
}

function readBoundedText(filename, maxBytes) {
  const stats = statSync(filename);
  assert(stats.isFile() && stats.size <= maxBytes, "E_INPUT_BOUNDS", path.basename(filename));
  return readFileSync(filename, "utf8");
}

function countLiteral(source, literal) {
  let count = 0;
  let offset = 0;
  while ((offset = source.indexOf(literal, offset)) !== -1) {
    count += 1;
    offset += literal.length;
  }
  return count;
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

function contractFailures(contract) {
  const failures = [];
  const reject = (condition, code, detail) => {
    if (!condition) failures.push({ code, detail });
  };
  reject(contract?.schemaVersion === "YALKEN_R24_C1C_MERGE_GATE_CONTRACT_V1", "E_CONTRACT_SCHEMA", contract?.schemaVersion);
  reject(contract?.stageId === "C1C", "E_STAGE_IDENTITY", contract?.stageId);
  reject(contract?.repository?.fullName === EXPECTED_REPOSITORY, "E_REPOSITORY_IDENTITY", contract?.repository?.fullName);
  reject(contract?.repository?.defaultBranch === "main", "E_DEFAULT_BRANCH", contract?.repository?.defaultBranch);
  reject(contract?.ruleset?.id === EXPECTED_RULESET_ID, "E_RULESET_IDENTITY", contract?.ruleset?.id);
  reject(contract?.aggregate?.workflowPath === ".github/workflows/oss-policy.yml", "E_AGGREGATE_PATH", contract?.aggregate?.workflowPath);
  reject(contract?.aggregate?.aggregateJobId === "oss-policy" && contract?.aggregate?.requiredContext === "oss-policy", "E_REQUIRED_CONTEXT", contract?.aggregate?.requiredContext);
  reject(contract?.aggregate?.ifExpression === "always()", "E_IF_EXPRESSION", contract?.aggregate?.ifExpression);
  reject(contract?.aggregate?.requiredResult === "success", "E_REQUIRED_RESULT", contract?.aggregate?.requiredResult);
  reject(Array.isArray(contract?.aggregate?.requiredDependencyJobs) && contract.aggregate.requiredDependencyJobs.length > 0, "E_REQUIRED_DEPENDENCIES", "missing");
  reject(JSON.stringify(contract?.aggregate?.failClosedResults) === JSON.stringify(["failure", "skipped", "cancelled"]), "E_FAIL_CLOSED_SET", JSON.stringify(contract?.aggregate?.failClosedResults));
  reject(contract?.ruleset?.bypassEvidencePolicy === "REJECT_VISIBLE_BYPASS_REQUIRE_OWNER_AUTHENTICATED_CLOSURE", "E_BYPASS_EVIDENCE_POLICY", contract?.ruleset?.bypassEvidencePolicy);
  reject(contract?.ruleset?.ownerAuthenticatedClosureRequired === true, "E_OWNER_AUTHENTICATED_CLOSURE", contract?.ruleset?.ownerAuthenticatedClosureRequired);
  return failures;
}

export function evaluateRequiredDependencyResults(results, requiredJobs) {
  const failures = [];
  const required = Array.isArray(requiredJobs) ? requiredJobs : [];
  if (!results || typeof results !== "object" || Array.isArray(results)) {
    failures.push({ code: "E_RESULT_SET_INVALID", jobId: "RESULT_SET", result: "invalid" });
  } else {
    const actualKeys = Object.keys(results).sort();
    const expectedKeys = [...required].sort();
    if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
      failures.push({ code: "E_RESULT_SET_MISMATCH", jobId: "RESULT_SET", result: `${actualKeys.length}/${expectedKeys.length}` });
    }
    for (const jobId of required) {
      const result = results[jobId] ?? "missing";
      if (result !== "success") failures.push({ code: "E_REQUIRED_DEPENDENCY_NOT_SUCCESS", jobId, result });
    }
  }
  return {
    schemaVersion: "YALKEN_R24_C1C_AGGREGATE_RESULT_V1",
    requiredJobs: [...required],
    failures,
    status: failures.length === 0 ? "PASS" : "FAIL"
  };
}

export function evaluateWorkflowTopology(rootDir, contract, sourceOverrides = {}) {
  const failures = [...contractFailures(contract)];
  const reject = (condition, code, detail) => {
    if (!condition) failures.push({ code, detail });
  };
  const readWorkflow = (relativePath) => sourceOverrides[relativePath]
    ?? readBoundedText(path.join(rootDir, relativePath), contract.bounds.maxWorkflowBytes);
  const master = readWorkflow(contract.aggregate.workflowPath);
  const aggregate = jobBlock(master, contract.aggregate.aggregateJobId);

  reject(/^on:\n/mu.test(master) && /^  pull_request:\s*$/mu.test(master) && /^  push:\s*$/mu.test(master), "E_MASTER_TRIGGERS", "pull_request-or-push");
  reject(aggregate.length > 0, "E_AGGREGATE_JOB_MISSING", contract.aggregate.aggregateJobId);
  reject(aggregate.includes("name: oss-policy"), "E_REQUIRED_CONTEXT", "oss-policy");
  reject(aggregate.includes("if: ${{ always() }}"), "E_MERGE_GATE_NOT_ALWAYS", contract.aggregate.aggregateJobId);
  reject(aggregate.includes("--check-results docs/OPS/R24/CORRECTIVE/C1C_MERGE_GATE_CONTRACT_V1.json"), "E_RESULT_VERIFIER_UNBOUND", contract.aggregate.aggregateJobId);

  for (const jobId of contract.aggregate.requiredDependencyJobs) {
    reject(aggregate.includes(`- ${jobId}`), "E_REQUIRED_NEEDS_MISSING", jobId);
    reject(aggregate.includes("${{ needs." + jobId + ".result }}"), "E_REQUIRED_RESULT_MISSING", jobId);
  }

  for (const reusable of contract.reusableWorkflows) {
    const useLiteral = `uses: ./${reusable.path}`;
    reject(countLiteral(master, useLiteral) === 1, "E_REUSABLE_CALL_COUNT", reusable.jobId);
    const source = readWorkflow(reusable.path);
    reject(/^  workflow_call:\s*$/mu.test(source), "E_WORKFLOW_CALL_MISSING", reusable.jobId);
    reject(/^  workflow_dispatch:\s*$/mu.test(source), "E_WORKFLOW_DISPATCH_MISSING", reusable.jobId);
    reject(!/^  pull_request:\s*$/mu.test(source), "E_DUPLICATE_PULL_REQUEST_TRIGGER", reusable.jobId);
    reject(!/^  push:\s*$/mu.test(source), "E_DUPLICATE_PUSH_TRIGGER", reusable.jobId);
  }

  reject(!master.includes("npm run -s test:rtk"), "E_DUPLICATE_FULL_SUITE", "master-workflow");
  const c1bBaseline = jobBlock(master, "c1b-baseline");
  reject(c1bBaseline.includes("npm test"), "E_C1B_BASELINE_MISSING", "c1b-baseline");
  reject(c1bBaseline.includes('git switch --create "c1b-ci-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"'), "E_C1B_DETACHED_CHECKOUT_UNBOUND", "c1b-baseline");
  reject(jobBlock(master, "c1c-contract").includes("--check docs/OPS/R24/CORRECTIVE/C1C_MERGE_GATE_CONTRACT_V1.json"), "E_LIVE_CHECK_MISSING", "c1c-contract");
  return {
    schemaVersion: "YALKEN_R24_C1C_WORKFLOW_TOPOLOGY_V1",
    failures,
    status: failures.length === 0 ? "PASS" : "FAIL"
  };
}

export function evaluateLiveRuleset(ruleset, contract) {
  const failures = [];
  const reject = (condition, code, detail) => {
    if (!condition) failures.push({ code, detail });
  };
  const rules = Array.isArray(ruleset?.rules) ? ruleset.rules : [];
  const rule = (type) => rules.find((entry) => entry.type === type);
  const pullRequest = rule("pull_request")?.parameters;
  const requiredChecks = rule("required_status_checks")?.parameters?.required_status_checks;
  const expectedContext = contract.ruleset.requiredStatusContext;
  const expectedIntegration = contract.ruleset.requiredStatusIntegrationId;
  const bypassActorsVisible = Array.isArray(ruleset?.bypass_actors);
  const currentUserBypassVisible = typeof ruleset?.current_user_can_bypass === "string";

  reject(ruleset?.id === contract.ruleset.id && ruleset?.name === contract.ruleset.name, "E_RULESET_IDENTITY", ruleset?.id);
  reject(ruleset?.target === contract.ruleset.target && ruleset?.enforcement === contract.ruleset.enforcement, "E_RULESET_ENFORCEMENT", ruleset?.enforcement);
  reject(ruleset?.conditions?.ref_name?.include?.includes(contract.ruleset.conditionInclude), "E_DEFAULT_BRANCH_CONDITION", contract.ruleset.conditionInclude);
  reject(Boolean(rule("deletion")), "E_DELETION_NOT_BLOCKED", "deletion");
  reject(Boolean(rule("non_fast_forward")), "E_NON_FAST_FORWARD_NOT_BLOCKED", "non_fast_forward");
  reject(Boolean(pullRequest), "E_PR_NOT_REQUIRED", "pull_request");
  reject(pullRequest?.required_review_thread_resolution === true, "E_CONVERSATION_RESOLUTION_NOT_REQUIRED", "pull_request");
  reject(Array.isArray(requiredChecks) && requiredChecks.length === 1
    && requiredChecks[0]?.context === expectedContext
    && requiredChecks[0]?.integration_id === expectedIntegration, "E_REQUIRED_CONTEXT", expectedContext);
  if (bypassActorsVisible) reject(ruleset.bypass_actors.length === 0, "E_BYPASS_ACTOR", "ruleset");
  if (currentUserBypassVisible) reject(ruleset.current_user_can_bypass === contract.ruleset.currentUserCanBypass, "E_CURRENT_USER_BYPASS", ruleset.current_user_can_bypass);
  return {
    bypassEvidence: {
      actors: bypassActorsVisible ? (ruleset.bypass_actors.length === 0 ? "EMPTY" : "NON_EMPTY") : "UNAVAILABLE_TO_TOKEN",
      currentUser: currentUserBypassVisible ? ruleset.current_user_can_bypass : "UNAVAILABLE_TO_TOKEN",
      ownerAuthenticatedClosureRequired: contract.ruleset.ownerAuthenticatedClosureRequired,
      policy: contract.ruleset.bypassEvidencePolicy
    },
    schemaVersion: "YALKEN_R24_C1C_LIVE_RULESET_EVIDENCE_V1",
    rulesetId: ruleset?.id ?? null,
    requiredContext: expectedContext,
    failures,
    status: failures.length === 0 ? "PASS" : "FAIL"
  };
}

function fetchLiveRuleset(contract) {
  let output;
  try {
    output = execFileSync("gh", ["api", `repos/${contract.repository.fullName}/rulesets/${contract.ruleset.id}`], {
      encoding: "utf8",
      maxBuffer: contract.bounds.maxApiBytes,
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (error) {
    fail("E_LIVE_RULESET_UNAVAILABLE", error.status ?? "gh-api");
  }
  assert(Buffer.byteLength(output) <= contract.bounds.maxApiBytes, "E_INPUT_BOUNDS", "live-ruleset");
  return JSON.parse(output);
}

function parseCli(argv) {
  return { mode: argv[0], contractPath: argv[1], payload: argv[2] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const { mode, contractPath, payload } = parseCli(process.argv.slice(2));
    assert(contractPath === CONTRACT_PATH, "E_PATH_NOT_ADMITTED", path.basename(contractPath ?? ""));
    const contractFile = readCanonicalJson(contractPath);
    const contract = contractFile.value;
    assert(contractFailures(contract).length === 0, "E_CONTRACT_INVALID", contractFile.digest);
    if (mode === "--check-results") {
      assert(typeof payload === "string" && Buffer.byteLength(payload) <= 8192, "E_INPUT_BOUNDS", "dependency-results");
      const result = evaluateRequiredDependencyResults(JSON.parse(payload), contract.aggregate.requiredDependencyJobs);
      process.stdout.write(canonicalBytes(result));
      if (result.status !== "PASS") process.exitCode = 1;
    } else if (mode === "--check") {
      const topology = evaluateWorkflowTopology(process.cwd(), contract);
      const ruleset = evaluateLiveRuleset(fetchLiveRuleset(contract), contract);
      const result = {
        schemaVersion: "YALKEN_R24_C1C_MERGE_GATE_EVIDENCE_V1",
        acceptanceSignals: {
          MERGE_GATE_IF_ALWAYS: topology.failures.some((entry) => entry.code === "E_MERGE_GATE_NOT_ALWAYS") ? "FAIL" : "PASS",
          MERGE_GATE_FAILS_ON_FAILED_SKIPPED_CANCELLED_REQUIRED_DEPENDENCY: topology.failures.some((entry) => entry.code.includes("RESULT") || entry.code.includes("NEEDS")) ? "FAIL" : "PASS",
          PR_REQUIRED: ruleset.failures.some((entry) => entry.code === "E_PR_NOT_REQUIRED") ? "FAIL" : "PASS",
          NON_FAST_FORWARD_AND_DELETION_BLOCKED: ruleset.failures.some((entry) => entry.code === "E_DELETION_NOT_BLOCKED" || entry.code === "E_NON_FAST_FORWARD_NOT_BLOCKED") ? "FAIL" : "PASS",
          CONVERSATION_RESOLUTION_REQUIRED: ruleset.failures.some((entry) => entry.code === "E_CONVERSATION_RESOLUTION_NOT_REQUIRED") ? "FAIL" : "PASS",
          LIVE_API_ENFORCEMENT_CONFIRMED: ruleset.status
        },
        topology,
        ruleset,
        status: topology.status === "PASS" && ruleset.status === "PASS" ? "PASS" : "FAIL"
      };
      process.stdout.write(canonicalBytes(result));
      if (result.status !== "PASS") process.exitCode = 1;
    } else {
      fail("E_USAGE", "--check | --check-results");
    }
  } catch (error) {
    process.stderr.write(`${canonicalize({ code: error.code ?? "E_UNTYPED", message: error.message })}\n`);
    process.exitCode = 1;
  }
}
