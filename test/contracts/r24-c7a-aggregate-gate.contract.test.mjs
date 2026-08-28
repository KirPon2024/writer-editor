import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  REQUIRED_DEPENDENCY_JOBS,
  WORKFLOW_PATH,
  buildContract,
  buildEvaluation,
  evaluateBoundC1cEnforcement,
  evaluateRequiredDependencyResults,
  evaluateWorkflowTopology
} from "../../scripts/ops/r24/corrective/c7a-aggregate-gate.mjs";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workflow = readFileSync(path.join(ROOT_DIR, WORKFLOW_PATH), "utf8");
const contract = buildContract();

function successfulResults() {
  return Object.fromEntries(REQUIRED_DEPENDENCY_JOBS.map((jobId) => [jobId, "success"]));
}

test("C7A current aggregate topology accounts for every non-aggregate job exactly", () => {
  const evidence = evaluateWorkflowTopology(workflow, contract);
  assert.equal(evidence.status, "PASS");
  assert.deepEqual(evidence.failures, []);
  assert.deepEqual([...evidence.needs].sort(), [...REQUIRED_DEPENDENCY_JOBS].sort());
  assert.deepEqual([...evidence.resultMappings].sort(), [...REQUIRED_DEPENDENCY_JOBS].sort());
});

test("C7A rejects an orphan job not wired into aggregate needs and results", () => {
  const mutant = workflow.replace("  oss-policy:\n", "  orphan-required:\n    runs-on: ubuntu-latest\n    steps:\n      - run: true\n\n  oss-policy:\n");
  const evidence = evaluateWorkflowTopology(mutant, contract);
  assert.equal(evidence.status, "FAIL");
  assert.equal(evidence.failures.some((entry) => entry.code === "E_UNACCOUNTED_JOB"), true);
});

test("C7A rejects a missing aggregate needs edge", () => {
  const mutant = workflow.replace("      - rtk-required\n", "");
  const evidence = evaluateWorkflowTopology(mutant, contract);
  assert.equal(evidence.status, "FAIL");
  assert.equal(evidence.failures.some((entry) => entry.code === "E_NEEDS_SET_MISMATCH"), true);
});

test("C7A rejects a missing dependency result mapping", () => {
  const mutant = workflow.replace(',"rtk-required":"${{ needs.rtk-required.result }}"', "");
  const evidence = evaluateWorkflowTopology(mutant, contract);
  assert.equal(evidence.status, "FAIL");
  assert.equal(evidence.failures.some((entry) => entry.code === "E_RESULT_MAP_MISMATCH"), true);
});

test("C7A rejects a conditional aggregate and duplicate full-suite execution", () => {
  const mutant = workflow
    .replace("if: ${{ always() }}", "if: ${{ success() }}")
    .replace("    steps:\n      - name: Checkout", "    steps:\n      - run: npm run -s test:rtk\n      - name: Checkout");
  const evidence = evaluateWorkflowTopology(mutant, contract);
  assert.equal(evidence.status, "FAIL");
  assert.equal(evidence.failures.some((entry) => entry.code === "E_AGGREGATE_NOT_ALWAYS"), true);
  assert.equal(evidence.failures.some((entry) => entry.code === "E_DUPLICATE_FULL_SUITE"), true);
});

test("C7A accepts only the exact all-success result set", () => {
  assert.equal(evaluateRequiredDependencyResults(successfulResults()).status, "PASS");
  const missing = successfulResults();
  delete missing[REQUIRED_DEPENDENCY_JOBS[0]];
  assert.equal(evaluateRequiredDependencyResults(missing).status, "FAIL");
  assert.equal(evaluateRequiredDependencyResults({ ...successfulResults(), unadmitted: "success" }).status, "FAIL");
});

for (const jobId of REQUIRED_DEPENDENCY_JOBS) {
  for (const result of ["failure", "skipped", "cancelled"]) {
    test(`C7A fails closed when ${jobId} is ${result}`, () => {
      const evidence = evaluateRequiredDependencyResults({ ...successfulResults(), [jobId]: result });
      assert.equal(evidence.status, "FAIL");
      assert.equal(evidence.failures.some((entry) => entry.jobId === jobId && entry.result === result), true);
    });
  }
}

test("C7A proves the bound C1C verifier kills every non-success required result", () => {
  const evidence = evaluateBoundC1cEnforcement(contract);
  assert.equal(evidence.status, "PASS");
  assert.equal(evidence.negativeCases, REQUIRED_DEPENDENCY_JOBS.length * 3);
  assert.deepEqual(evidence.failures, []);
});

test("C7A current-head evaluation remains provisional until external attestation", () => {
  const evaluation = buildEvaluation(contract, workflow);
  assert.equal(evaluation.status, "CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION");
  assert.equal(evaluation.externalTerminalAttestation.status, "AWAITING_POST_MERGE_EXTERNAL_C7A_ATTESTATION");
  assert.equal(evaluation.nonClaims.includes("NO_PROGRAM_DONE"), true);
  assert.equal(evaluation.nonClaims.includes("NO_RULESET_RECERTIFICATION"), true);
});
