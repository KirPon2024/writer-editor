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
const exactKeys = (value, keys, label) => assert(value && typeof value === 'object' && !Array.isArray(value) && canonical(Object.keys(value).sort()) === canonical([...keys].sort()), 'E_RULESET_ENVELOPE', label);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const RULE_TYPES = Object.freeze(['deletion', 'non_fast_forward', 'pull_request', 'required_status_checks']);
const RULESET_KEYS = Object.freeze(['_links', 'bypass_actors', 'conditions', 'created_at', 'enforcement', 'id', 'name', 'node_id', 'rules', 'source', 'source_type', 'target', 'updated_at']);
const RULESET_KEYS_WITH_CURRENT_USER = Object.freeze([...RULESET_KEYS, 'current_user_can_bypass']);
const OBSERVER_RULESET_KEYS = Object.freeze(RULESET_KEYS_WITH_CURRENT_USER.filter((key) => key !== 'bypass_actors'));
const AUTHORITY_RULESET_CARRIER_PATH = 'docs/OPS/R24/CORRECTIVE/AUDIT_CYCLE_1_LIVE_RULESET_V1.json';
const AUTHORITY_RULESET_CARRIER_DIGEST = '867f06a203b0e1aeb688aa7a25479b0a102ba5394d039802d51a9e867ce626ff';

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
  const envelopeKeys = Object.keys(ruleset ?? {}).sort();
  const baseEnvelope = [...RULESET_KEYS].sort();
  const userEnvelope = [...RULESET_KEYS_WITH_CURRENT_USER].sort();
  assert(canonical(envelopeKeys) === canonical(baseEnvelope) || canonical(envelopeKeys) === canonical(userEnvelope), 'E_RULESET_ENVELOPE', envelopeKeys.join(','));
  assert(ruleset?.id === 12270444 && ruleset?.name === 'protect-main' && ruleset?.target === 'branch' && ruleset?.enforcement === 'active', 'E_RULESET_IDENTITY');
  assert(ruleset.source === 'KirPonomarev/writer-editor' && ruleset.source_type === 'Repository', 'E_RULESET_SOURCE');
  assert(typeof ruleset.node_id === 'string' && ruleset.node_id.length > 0 && typeof ruleset.created_at === 'string' && ruleset.created_at.length > 0 && typeof ruleset.updated_at === 'string' && ruleset.updated_at.length > 0, 'E_RULESET_METADATA');
  exactKeys(ruleset._links, ['html', 'self'], 'links');
  exactKeys(ruleset._links.html, ['href'], 'links.html');
  exactKeys(ruleset._links.self, ['href'], 'links.self');
  assert(ruleset._links.html.href === 'https://github.com/KirPonomarev/writer-editor/rules/12270444' && ruleset._links.self.href === 'https://api.github.com/repos/KirPonomarev/writer-editor/rulesets/12270444', 'E_RULESET_LINKS');
  assert(hasOwn(ruleset, 'bypass_actors') && Array.isArray(ruleset.bypass_actors) && ruleset.bypass_actors.length === 0, 'E_RULESET_BYPASS');
  if (hasOwn(ruleset, 'current_user_can_bypass')) assert(ruleset.current_user_can_bypass === 'never', 'E_RULESET_CURRENT_USER_BYPASS', String(ruleset.current_user_can_bypass));
  assert(canonical(ruleset.conditions) === canonical({ ref_name: { exclude: [], include: ['~DEFAULT_BRANCH'] } }), 'E_RULESET_CONDITIONS');
  assert(Array.isArray(ruleset.rules) && ruleset.rules.length === RULE_TYPES.length, 'E_RULESET_RULE_COUNT', String(ruleset.rules?.length));
  const observedTypes = ruleset.rules.map((entry) => entry?.type);
  assert(observedTypes.every((type) => RULE_TYPES.includes(type)), 'E_RULESET_UNKNOWN_RULE_TYPE', observedTypes.join(','));
  assert(new Set(observedTypes).size === RULE_TYPES.length, 'E_RULESET_DUPLICATE_OR_MISSING_RULE_TYPE', observedTypes.join(','));
  assert(canonical([...observedTypes].sort()) === canonical([...RULE_TYPES].sort()), 'E_RULESET_RULE_SET', observedTypes.join(','));
  const rules = new Map(ruleset.rules.map((entry) => [entry.type, entry]));
  exactKeys(rules.get('deletion'), ['type'], 'rule.deletion');
  exactKeys(rules.get('non_fast_forward'), ['type'], 'rule.non_fast_forward');
  exactKeys(rules.get('pull_request'), ['parameters', 'type'], 'rule.pull_request');
  exactKeys(rules.get('required_status_checks'), ['parameters', 'type'], 'rule.required_status_checks');
  assert(rules.get('deletion')?.type === 'deletion', 'E_RULESET_DELETION_PROTECTION');
  assert(rules.get('non_fast_forward')?.type === 'non_fast_forward', 'E_RULESET_NON_FAST_FORWARD_PROTECTION');
  const pullRequest = rules.get('pull_request')?.parameters;
  assert(canonical(pullRequest) === canonical({ allowed_merge_methods: ['merge','squash','rebase'], dismiss_stale_reviews_on_push: true, require_code_owner_review: false, require_extra_approval_for_unattributed_changes: true, require_last_push_approval: false, required_approving_review_count: 0, required_review_thread_resolution: true, required_reviewers: [] }), 'E_RULESET_PULL_REQUEST_PROTECTION');
  const requiredStatus = rules.get('required_status_checks')?.parameters;
  assert(canonical(requiredStatus) === canonical({ do_not_enforce_on_create: false, required_status_checks: [{ context: 'merge-gate', integration_id: 15368 }], strict_required_status_checks_policy: false }), 'E_RULESET_STATUS_CHECK_POLICY');
  const contexts = (requiredStatus?.required_status_checks ?? []).map((entry) => entry.context).sort();
  assert(JSON.stringify(contexts) === JSON.stringify(['merge-gate']), 'E_RULESET_REQUIRED_CONTEXTS', contexts.join(','));
  const normalized={id:ruleset.id,name:ruleset.name,target:ruleset.target,enforcement:ruleset.enforcement,conditions:ruleset.conditions,bypass_actors:ruleset.bypass_actors,rules:RULE_TYPES.map((type)=>rules.get(type))};
  return { schemaVersion: 'POST_AUDIT_RULESET_RESULT_V2', status: 'PASS', rulesetId: ruleset.id, requiredContexts: contexts, normalizedRulesetDigest: sha256(Buffer.from(canonical(normalized))), protections: { deletion: true, nonFastForward: true, pullRequest: true, conversationResolution: true, bypassActorCount: 0 } };
}

export function verifyRulesetObserverWithAuthority({observerRuleset,authorityCarrierPath=AUTHORITY_RULESET_CARRIER_PATH}={}) {
  const observerKeys=Object.keys(observerRuleset??{}).sort();
  assert(canonical(observerKeys)===canonical([...OBSERVER_RULESET_KEYS].sort()),'E_RULESET_OBSERVER_ENVELOPE',observerKeys.join(','));
  assert(observerRuleset.current_user_can_bypass==='never','E_RULESET_CURRENT_USER_BYPASS',String(observerRuleset.current_user_can_bypass));
  const carrierBytes=fs.readFileSync(authorityCarrierPath);
  assert(sha256(carrierBytes)===AUTHORITY_RULESET_CARRIER_DIGEST,'E_RULESET_AUTHORITY_CARRIER_DIGEST');
  const carrier=JSON.parse(carrierBytes);
  assert(carrier?.schemaVersion==='AUDIT_CYCLE_1_LIVE_RULESET_V1'&&carrier.status==='VERIFIED_ACTIVE_NO_BYPASS'&&carrier.rulesetId===12270444&&carrier.rawRulesetReconstructible===true,'E_RULESET_AUTHORITY_CARRIER');
  const view=carrier.independentVerifierView;
  assert(view?.currentUserCanBypass==='never'&&typeof view.returnedBytesCanonicalBase64==='string','E_RULESET_AUTHORITY_VIEW');
  const authorityBytes=Buffer.from(view.returnedBytesCanonicalBase64,'base64');
  assert(authorityBytes.length===view.returnedByteLength&&sha256(authorityBytes)===view.returnedBytesDigest,'E_RULESET_AUTHORITY_BYTES');
  const authorityRuleset=JSON.parse(authorityBytes);
  const authorityResult=verifyRuleset(authorityRuleset);
  assert(authorityResult.normalizedRulesetDigest===view.normalizedRulesetDigest&&canonical(authorityResult.requiredContexts)===canonical(carrier.requiredContexts)&&canonical(authorityResult.protections)===canonical(carrier.protections),'E_RULESET_AUTHORITY_SEMANTICS');
  const observerComparable={...observerRuleset};
  const authorityComparable={...authorityRuleset};
  delete authorityComparable.bypass_actors;
  for(const field of ['created_at','updated_at']){
    const observerTime=new Date(observerComparable[field]),authorityTime=new Date(authorityComparable[field]);
    assert(Number.isFinite(observerTime.getTime())&&Number.isFinite(authorityTime.getTime()),'E_RULESET_OBSERVER_TIMESTAMP',field);
    observerComparable[field]=observerTime.toISOString();
    authorityComparable[field]=authorityTime.toISOString();
  }
  assert(canonical(observerComparable)===canonical(authorityComparable),'E_RULESET_OBSERVER_AUTHORITY_DRIFT');
  return {...authorityResult,proofMode:'LIVE_RESTRICTED_OBSERVER_EXACTLY_MATCHES_PINNED_FULL_AUTHORITY_BYTES',authorityCarrierDigest:AUTHORITY_RULESET_CARRIER_DIGEST,authorityReturnedBytesDigest:view.returnedBytesDigest};
}

function parseArgs(argv) { const result = {}; for (let i = 0; i < argv.length; i += 1) { if (!argv[i].startsWith('--')) continue; result[argv[i].slice(2)] = argv[i + 1] ?? true; i += argv[i + 1] === undefined ? 0 : 1; } return result; }
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2));
    let result;
    if (args['check-results']) result = verifyDependencyResults(JSON.parse(args['check-results']));
    else if (args['check-live-ruleset']) {
      const bytes=execFileSync('gh', ['api', 'repos/KirPonomarev/writer-editor/rulesets/12270444']);
      const ruleset=JSON.parse(bytes);
      const verification=hasOwn(ruleset,'bypass_actors')?verifyRuleset(ruleset):verifyRulesetObserverWithAuthority({observerRuleset:ruleset});
      result={...verification,returnedBytesDigest:sha256(bytes),returnedByteLength:bytes.length};
    }
    else result = verifyWorkflowText(fs.readFileSync('.github/workflows/oss-policy.yml', 'utf8'));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ status: 'FAIL', code: error.code ?? 'E_UNTYPED', message: error.message })}\n`);
    process.exitCode = 1;
  }
}
