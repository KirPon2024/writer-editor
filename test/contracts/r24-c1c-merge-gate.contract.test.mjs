import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readCanonicalJson } from "../../scripts/ops/r24/corrective/canonical-json.mjs";
import {
  evaluateLiveRuleset,
  evaluateRequiredDependencyResults,
  evaluateWorkflowTopology
} from "../../scripts/ops/r24/corrective/c1c-merge-gate.mjs";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CONTRACT_PATH = path.join(ROOT_DIR, "docs/OPS/R24/CORRECTIVE/C1C_MERGE_GATE_CONTRACT_V1.json");
const contract = readCanonicalJson(CONTRACT_PATH).value;

function successfulResults() {
  return Object.fromEntries(contract.aggregate.requiredDependencyJobs.map((jobId) => [jobId, "success"]));
}

function liveRuleset() {
  return {
    id: 12270444,
    name: "protect-main",
    target: "branch",
    enforcement: "active",
    conditions: { ref_name: { exclude: [], include: ["~DEFAULT_BRANCH"] } },
    rules: [
      { type: "deletion" },
      { type: "non_fast_forward" },
      { type: "pull_request", parameters: { required_review_thread_resolution: true } },
      { type: "required_status_checks", parameters: { required_status_checks: [{ context: "oss-policy", integration_id: 15368 }] } }
    ],
    bypass_actors: [],
    current_user_can_bypass: "never"
  };
}

test("all exact required dependency results pass", () => {
  assert.equal(evaluateRequiredDependencyResults(successfulResults(), contract.aggregate.requiredDependencyJobs).status, "PASS");
});

for (const result of ["failure", "skipped", "cancelled"]) {
  test(`${result} required dependency fails closed`, () => {
    const results = successfulResults();
    results["rtk-required"] = result;
    const evidence = evaluateRequiredDependencyResults(results, contract.aggregate.requiredDependencyJobs);
    assert.equal(evidence.status, "FAIL");
    assert.deepEqual(evidence.failures[0], { code: "E_REQUIRED_DEPENDENCY_NOT_SUCCESS", jobId: "rtk-required", result });
  });
}

test("missing or additional dependency result fails closed", () => {
  const results = successfulResults();
  delete results["c1b-baseline"];
  results.unadmitted = "success";
  const evidence = evaluateRequiredDependencyResults(results, contract.aggregate.requiredDependencyJobs);
  assert.equal(evidence.status, "FAIL");
  assert.equal(evidence.failures.some((entry) => entry.code === "E_RESULT_SET_MISMATCH"), true);
  assert.equal(evidence.failures.some((entry) => entry.jobId === "c1b-baseline" && entry.result === "missing"), true);
});

test("actual workflow topology has one aggregate and no duplicate full-suite trigger", () => {
  assert.deepEqual(evaluateWorkflowTopology(ROOT_DIR, contract).failures, []);
});

test("workflow topology rejects a conditional aggregate and direct reusable trigger", () => {
  const masterPath = contract.aggregate.workflowPath;
  const reusablePath = contract.reusableWorkflows[0].path;
  const master = readFileSync(path.join(ROOT_DIR, masterPath), "utf8").replace("if: ${{ always() }}", "if: ${{ success() }}");
  const reusable = readFileSync(path.join(ROOT_DIR, reusablePath), "utf8").replace("  workflow_call:\n", "  workflow_call:\n  pull_request:\n");
  const evidence = evaluateWorkflowTopology(ROOT_DIR, contract, { [masterPath]: master, [reusablePath]: reusable });
  assert.equal(evidence.status, "FAIL");
  assert.equal(evidence.failures.some((entry) => entry.code === "E_MERGE_GATE_NOT_ALWAYS"), true);
  assert.equal(evidence.failures.some((entry) => entry.code === "E_DUPLICATE_PULL_REQUEST_TRIGGER"), true);
});

test("live ruleset evidence requires PR, conversations, protected history and exact context", () => {
  assert.deepEqual(evaluateLiveRuleset(liveRuleset(), contract).failures, []);
  const weakened = liveRuleset();
  weakened.rules.find((entry) => entry.type === "pull_request").parameters.required_review_thread_resolution = false;
  weakened.rules = weakened.rules.filter((entry) => entry.type !== "non_fast_forward");
  weakened.rules.find((entry) => entry.type === "required_status_checks").parameters.required_status_checks[0].context = "unbound";
  const evidence = evaluateLiveRuleset(weakened, contract);
  assert.equal(evidence.status, "FAIL");
  assert.equal(evidence.failures.some((entry) => entry.code === "E_NON_FAST_FORWARD_NOT_BLOCKED"), true);
  assert.equal(evidence.failures.some((entry) => entry.code === "E_CONVERSATION_RESOLUTION_NOT_REQUIRED"), true);
  assert.equal(evidence.failures.some((entry) => entry.code === "E_REQUIRED_CONTEXT"), true);
});
