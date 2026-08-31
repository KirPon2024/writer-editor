#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const REQUIRED_DEPENDENCIES = Object.freeze([
  'actual-renderer-build-rtk',
  'c1a-hermetic',
  'e0-mutants',
  'inventory-baseline',
  'live-ruleset-oracle',
  'ops-vector',
  'oss-policy-core',
  'privacy-negative',
  'rtk-required',
  'static-security-sast',
  'x1-runtime-parity'
]);
const fail = (code, detail = '') => { const error = new Error(`${code}${detail ? `:${detail}` : ''}`); error.code = code; throw error; };
const assert = (condition, code, detail) => { if (!condition) fail(code, detail); };
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

export function verifyDependencyResults(results) {
  assert(results && typeof results === 'object' && !Array.isArray(results), 'E_RESULTS_OBJECT');
  const keys = Object.keys(results).sort();
  assert(JSON.stringify(keys) === JSON.stringify([...REQUIRED_DEPENDENCIES]), 'E_DEPENDENCY_SET', keys.join(','));
  for (const key of REQUIRED_DEPENDENCIES) assert(results[key] === 'success', 'E_DEPENDENCY_NOT_SUCCESS', `${key}:${results[key]}`);
  return { schemaVersion: 'POST_AUDIT_MERGE_GATE_RESULT_V1', status: 'PASS', dependencies: keys };
}

export function verifyWorkflowText(workflow) {
  assert(/\n  merge-gate:\n/.test(workflow), 'E_MERGE_GATE_JOB');
  const marker = workflow.indexOf('\n  merge-gate:\n');
  const block = workflow.slice(marker, workflow.indexOf('\n  oss-policy:', marker));
  assert(block.includes('name: merge-gate'), 'E_MERGE_GATE_CONTEXT');
  assert(block.includes('if: ${{ always() }}'), 'E_MERGE_GATE_ALWAYS');
  for (const dependency of REQUIRED_DEPENDENCIES) assert(block.includes(`      - ${dependency}`), 'E_MERGE_GATE_DEPENDENCY', dependency);
  assert(block.includes('post-audit-merge-gate.mjs --check-results'), 'E_MERGE_GATE_ORACLE');
  const compatibility = workflow.slice(workflow.indexOf('\n  oss-policy:', marker));
  assert(compatibility.includes('needs:\n      - merge-gate'), 'E_OSS_POLICY_COMPATIBILITY_DEPENDENCY');
  return { schemaVersion: 'POST_AUDIT_MERGE_GATE_TOPOLOGY_V1', status: 'PASS', dependencies: [...REQUIRED_DEPENDENCIES] };
}

export function verifyRuleset(ruleset) {
  assert(ruleset?.id === 12270444 && ruleset?.name === 'protect-main' && ruleset?.target === 'branch' && ruleset?.enforcement === 'active', 'E_RULESET_IDENTITY');
  assert(canonical(ruleset.conditions) === canonical({ ref_name: { exclude: [], include: ['~DEFAULT_BRANCH'] } }), 'E_RULESET_CONDITIONS');
  const rules = Object.fromEntries((ruleset.rules ?? []).map((entry) => [entry.type, entry]));
  assert(JSON.stringify(Object.keys(rules).sort()) === JSON.stringify(['deletion','non_fast_forward','pull_request','required_status_checks']), 'E_RULESET_RULE_SET');
  assert(rules.deletion?.type === 'deletion', 'E_RULESET_DELETION_PROTECTION');
  assert(rules.non_fast_forward?.type === 'non_fast_forward', 'E_RULESET_NON_FAST_FORWARD_PROTECTION');
  const pullRequest = rules.pull_request?.parameters;
  assert(canonical(pullRequest) === canonical({ allowed_merge_methods: ['merge','squash','rebase'], dismiss_stale_reviews_on_push: true, require_code_owner_review: false, require_extra_approval_for_unattributed_changes: true, require_last_push_approval: false, required_approving_review_count: 0, required_review_thread_resolution: true, required_reviewers: [] }), 'E_RULESET_PULL_REQUEST_PROTECTION');
  const requiredStatus = rules.required_status_checks?.parameters;
  const contexts = (requiredStatus?.required_status_checks ?? []).map((entry) => entry.context).sort();
  assert(JSON.stringify(contexts) === JSON.stringify(['merge-gate']), 'E_RULESET_REQUIRED_CONTEXTS', contexts.join(','));
  assert(requiredStatus.required_status_checks[0].integration_id === 15368 && requiredStatus.strict_required_status_checks_policy === false && requiredStatus.do_not_enforce_on_create === false, 'E_RULESET_STATUS_CHECK_POLICY');
  assert((ruleset.bypass_actors ?? []).length === 0, 'E_RULESET_BYPASS');
  const normalized={id:ruleset.id,name:ruleset.name,target:ruleset.target,enforcement:ruleset.enforcement,conditions:ruleset.conditions,bypass_actors:ruleset.bypass_actors??[],rules:ruleset.rules};
  return { schemaVersion: 'POST_AUDIT_RULESET_RESULT_V2', status: 'PASS', rulesetId: ruleset.id, requiredContexts: contexts, normalizedRulesetDigest: sha256(Buffer.from(canonical(normalized))), protections: { deletion: true, nonFastForward: true, pullRequest: true, conversationResolution: true, bypassActorCount: 0 } };
}

function parseArgs(argv) { const result = {}; for (let i = 0; i < argv.length; i += 1) { if (!argv[i].startsWith('--')) continue; result[argv[i].slice(2)] = argv[i + 1] ?? true; i += argv[i + 1] === undefined ? 0 : 1; } return result; }
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2));
    let result;
    if (args['check-results']) result = verifyDependencyResults(JSON.parse(args['check-results']));
    else if (args['check-live-ruleset']) { const bytes=execFileSync('gh', ['api', 'repos/KirPonomarev/writer-editor/rulesets/12270444']); result={...verifyRuleset(JSON.parse(bytes)),returnedBytesDigest:sha256(bytes),returnedByteLength:bytes.length}; }
    else result = verifyWorkflowText(fs.readFileSync('.github/workflows/oss-policy.yml', 'utf8'));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ status: 'FAIL', code: error.code ?? 'E_UNTYPED', message: error.message })}\n`);
    process.exitCode = 1;
  }
}
