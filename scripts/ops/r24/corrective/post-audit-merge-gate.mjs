#!/usr/bin/env node
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

export const REQUIRED_DEPENDENCIES = Object.freeze([
  'actual-renderer-build-rtk',
  'c1a-hermetic',
  'e0-mutants',
  'inventory-baseline',
  'ops-vector',
  'oss-policy-core',
  'privacy-negative',
  'rtk-required',
  'static-security-sast',
  'x1-runtime-parity'
]);
const fail = (code, detail = '') => { const error = new Error(`${code}${detail ? `:${detail}` : ''}`); error.code = code; throw error; };
const assert = (condition, code, detail) => { if (!condition) fail(code, detail); };

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
  assert(ruleset?.name === 'protect-main' && ruleset?.enforcement === 'active', 'E_RULESET_IDENTITY');
  const rule = ruleset.rules?.find((entry) => entry.type === 'required_status_checks');
  const contexts = (rule?.parameters?.required_status_checks ?? []).map((entry) => entry.context).sort();
  assert(JSON.stringify(contexts) === JSON.stringify(['merge-gate']), 'E_RULESET_REQUIRED_CONTEXTS', contexts.join(','));
  assert((ruleset.bypass_actors ?? []).length === 0, 'E_RULESET_BYPASS');
  return { schemaVersion: 'POST_AUDIT_RULESET_RESULT_V1', status: 'PASS', rulesetId: ruleset.id, requiredContexts: contexts };
}

function parseArgs(argv) { const result = {}; for (let i = 0; i < argv.length; i += 1) { if (!argv[i].startsWith('--')) continue; result[argv[i].slice(2)] = argv[i + 1] ?? true; i += argv[i + 1] === undefined ? 0 : 1; } return result; }
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2));
    let result;
    if (args['check-results']) result = verifyDependencyResults(JSON.parse(args['check-results']));
    else if (args['check-live-ruleset']) result = verifyRuleset(JSON.parse(execFileSync('gh', ['api', 'repos/KirPonomarev/writer-editor/rulesets/12270444'], { encoding: 'utf8' })));
    else result = verifyWorkflowText(fs.readFileSync('.github/workflows/oss-policy.yml', 'utf8'));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ status: 'FAIL', code: error.code ?? 'E_UNTYPED', message: error.message })}\n`);
    process.exitCode = 1;
  }
}
