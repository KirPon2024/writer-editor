import assert from "node:assert/strict";
import test from "node:test";
import {
  buildContract,
  evaluateNormalizedRuleset,
  normalizeLiveRuleset
} from "../../scripts/ops/r24/corrective/c7b-live-ruleset-audit.mjs";

function liveRuleset() {
  return {
    bypass_actors: [],
    conditions: { ref_name: { exclude: [], include: ["~DEFAULT_BRANCH"] } },
    current_user_can_bypass: "never",
    enforcement: "active",
    id: 12270444,
    name: "protect-main",
    rules: [
      { type: "deletion" },
      { type: "non_fast_forward" },
      { parameters: { allowed_merge_methods: ["merge", "squash", "rebase"], dismiss_stale_reviews_on_push: true, require_extra_approval_for_unattributed_changes: true, required_review_thread_resolution: true }, type: "pull_request" },
      { parameters: { do_not_enforce_on_create: false, required_status_checks: [{ context: "oss-policy", integration_id: 15368 }], strict_required_status_checks_policy: false }, type: "required_status_checks" }
    ],
    source: "KirPonomarev/writer-editor",
    source_type: "Repository",
    target: "branch"
  };
}

function evaluate(raw = liveRuleset()) {
  return evaluateNormalizedRuleset(normalizeLiveRuleset(raw), buildContract().expectedRuleset);
}

test("C7B accepts the exact active default-branch ruleset", () => {
  assert.equal(evaluate().status, "PASS");
});

test("C7B rejects removal of the pull-request rule", () => {
  const raw = liveRuleset();
  raw.rules = raw.rules.filter((entry) => entry.type !== "pull_request");
  const result = evaluate(raw);
  assert.equal(result.status, "FAIL");
  assert(result.failures.some((entry) => entry.code === "E_PR_NOT_REQUIRED"));
});

test("C7B rejects a stale or extra required status context", () => {
  const raw = liveRuleset();
  raw.rules.find((entry) => entry.type === "required_status_checks").parameters.required_status_checks.push({ context: "stale", integration_id: 15368 });
  const result = evaluate(raw);
  assert.equal(result.status, "FAIL");
  assert(result.failures.some((entry) => entry.code === "E_REQUIRED_CONTEXT"));
});

test("C7B rejects missing deletion and non-fast-forward rules", () => {
  const raw = liveRuleset();
  raw.rules = raw.rules.filter((entry) => !["deletion", "non_fast_forward"].includes(entry.type));
  const result = evaluate(raw);
  assert.equal(result.status, "FAIL");
  assert(result.failures.some((entry) => entry.code === "E_DELETION_NOT_BLOCKED"));
  assert(result.failures.some((entry) => entry.code === "E_NON_FAST_FORWARD_NOT_BLOCKED"));
});

test("C7B rejects disabled conversation resolution", () => {
  const raw = liveRuleset();
  raw.rules.find((entry) => entry.type === "pull_request").parameters.required_review_thread_resolution = false;
  const result = evaluate(raw);
  assert.equal(result.status, "FAIL");
  assert(result.failures.some((entry) => entry.code === "E_CONVERSATION_RESOLUTION_NOT_REQUIRED"));
});

test("C7B rejects a bypass actor or current-user bypass", () => {
  const raw = liveRuleset();
  raw.bypass_actors = [{ actor_id: 1, actor_type: "RepositoryRole", bypass_mode: "always" }];
  raw.current_user_can_bypass = "always";
  const result = evaluate(raw);
  assert.equal(result.status, "FAIL");
  assert(result.failures.some((entry) => entry.code === "E_BYPASS_ACTOR"));
  assert(result.failures.some((entry) => entry.code === "E_CURRENT_USER_BYPASS"));
});
