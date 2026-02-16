#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKEN_NAME = 'DEPENDENCY_REMEDIATION_POLICY_OK';
const FAIL_SIGNAL = 'E_DEP_REMEDIATION_POLICY_INVALID';
const DEFAULT_POLICY_PATH = 'docs/OPS/STATUS/DEPENDENCY_REMEDIATION_POLICY_v3_12.json';

const REQUIRED_SEVERITIES = ['critical', 'high', 'moderate', 'low'];
const REQUIRED_REACHABILITY = ['reachable', 'nonReachable', 'unknown'];
const REQUIRED_ENVIRONMENTS = ['prod', 'dev'];
const REQUIRED_EXCEPTION_FIELDS = ['owner', 'expiryUtc', 'mitigationPlan'];

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stableSortObject(value) {
  if (Array.isArray(value)) return value.map((entry) => stableSortObject(entry));
  if (!isObjectRecord(value)) return value;
  const out = {};
  for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
    out[key] = stableSortObject(value[key]);
  }
  return out;
}

function stableStringify(value) {
  return JSON.stringify(stableSortObject(value), null, 2);
}

function uniqueSortedStrings(values) {
  if (!Array.isArray(values)) return [];
  const out = new Set();
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (!normalized) continue;
    out.add(normalized);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

function includesAll(haystack, needles) {
  const set = new Set(haystack);
  return needles.every((needle) => set.has(needle));
}

function normalizeGateTier(value) {
  const tier = String(value || '').trim().toLowerCase();
  if (tier === 'promotion') return 'promotion';
  if (tier === 'core') return 'core';
  return 'release';
}

function readPolicy(policyPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
    return isObjectRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function hasReachableCriticalHighProdRule(actionRules) {
  for (const row of actionRules) {
    if (!isObjectRecord(row)) continue;
    const when = isObjectRecord(row.when) ? row.when : null;
    const action = isObjectRecord(row.action) ? row.action : null;
    if (!when || !action) continue;
    if (when.reachability !== 'reachable') continue;
    const severityIn = uniqueSortedStrings(when.severityIn);
    if (!(severityIn.includes('critical') && severityIn.includes('high'))) continue;
    if (String(when.environment || '') !== 'prod') continue;
    if (String(action.promotion || '') !== 'block') continue;
    if (String(action.release || '') !== 'advisory') continue;
    return true;
  }
  return false;
}

function hasNonReachableExceptionRule(actionRules) {
  for (const row of actionRules) {
    if (!isObjectRecord(row)) continue;
    const when = isObjectRecord(row.when) ? row.when : null;
    const action = isObjectRecord(row.action) ? row.action : null;
    if (!when || !action) continue;
    if (String(when.reachability || '') !== 'nonReachable') continue;
    if (action.exceptionAllowed !== true) continue;
    if (action.exceptionTtlRequired !== true) continue;
    return true;
  }
  return false;
}

export function evaluateDependencyRemediationPolicyState(input = {}) {
  const policyPath = String(input.policyPath || process.env.DEPENDENCY_REMEDIATION_POLICY_PATH || DEFAULT_POLICY_PATH).trim();
  const gateTier = normalizeGateTier(input.gateTier || process.env.GATE_TIER || process.env.OPS_GATE_TIER);
  const doc = readPolicy(policyPath);
  const failures = [];

  if (!doc) {
    failures.push('POLICY_UNREADABLE');
  } else {
    if (String(doc.schemaVersion || '') !== 'v3.12') failures.push('SCHEMA_VERSION_INVALID');
    if (String(doc.policyId || '') !== 'DEPENDENCY_REMEDIATION_POLICY_v3_12') failures.push('POLICY_ID_INVALID');

    if (!includesAll(uniqueSortedStrings(doc.severityClasses), REQUIRED_SEVERITIES)) {
      failures.push('SEVERITY_CLASSES_INVALID');
    }
    if (!includesAll(uniqueSortedStrings(doc.reachabilityClasses), REQUIRED_REACHABILITY)) {
      failures.push('REACHABILITY_CLASSES_INVALID');
    }
    if (!includesAll(uniqueSortedStrings(doc.environmentClasses), REQUIRED_ENVIRONMENTS)) {
      failures.push('ENVIRONMENT_CLASSES_INVALID');
    }

    const actionRules = Array.isArray(doc.actionRules) ? doc.actionRules : [];
    if (actionRules.length === 0) failures.push('ACTION_RULES_EMPTY');
    if (!hasReachableCriticalHighProdRule(actionRules)) failures.push('REACHABLE_CRITICAL_HIGH_RULE_MISSING');
    if (!hasNonReachableExceptionRule(actionRules)) failures.push('NON_REACHABLE_EXCEPTION_RULE_MISSING');

    if (!includesAll(uniqueSortedStrings(doc.exceptionRequiredFields), REQUIRED_EXCEPTION_FIELDS)) {
      failures.push('EXCEPTION_FIELDS_INVALID');
    }

    const auditLinkage = isObjectRecord(doc.auditLinkage) ? doc.auditLinkage : null;
    if (!auditLinkage || String(auditLinkage.artifactsGlob || '') !== 'docs/AUDIT/*' || auditLinkage.required !== true) {
      failures.push('AUDIT_LINKAGE_INVALID');
    }

    const modeMatrix = isObjectRecord(doc.modeMatrix) ? doc.modeMatrix : null;
    if (!modeMatrix
      || String(modeMatrix.prCore || '') !== 'advisory'
      || String(modeMatrix.release || '') !== 'advisory'
      || String(modeMatrix.promotion || '') !== 'blocking') {
      failures.push('MODE_MATRIX_INVALID');
    }
  }

  const sortedFailures = uniqueSortedStrings(failures);
  const ok = sortedFailures.length === 0;
  const promotionBlocking = gateTier === 'promotion' && !ok ? 1 : 0;

  return {
    ok,
    [TOKEN_NAME]: ok ? 1 : 0,
    failSignal: ok ? '' : FAIL_SIGNAL,
    failReason: ok ? '' : sortedFailures[0],
    failures: sortedFailures,
    policyPath,
    gateTier,
    mode: gateTier === 'promotion' ? 'blocking' : 'advisory',
    promotionBlocking,
    releaseBlocking: 0,
  };
}

function parseArgs(argv) {
  const out = {
    json: false,
    policyPath: '',
    gateTier: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || '');
    if (arg === '--json') out.json = true;
    if (arg === '--policy-path' && i + 1 < argv.length) {
      out.policyPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
    if (arg === '--gate-tier' && i + 1 < argv.length) {
      out.gateTier = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }
  return out;
}

function printHuman(state) {
  console.log(`${TOKEN_NAME}=${state[TOKEN_NAME]}`);
  console.log(`DEPENDENCY_REMEDIATION_POLICY_PATH=${state.policyPath}`);
  console.log(`DEPENDENCY_REMEDIATION_POLICY_GATE_TIER=${state.gateTier}`);
  console.log(`DEPENDENCY_REMEDIATION_POLICY_MODE=${state.mode}`);
  console.log(`DEPENDENCY_REMEDIATION_POLICY_PROMOTION_BLOCKING=${state.promotionBlocking}`);
  console.log(`DEPENDENCY_REMEDIATION_POLICY_RELEASE_BLOCKING=${state.releaseBlocking}`);
  console.log(`DEPENDENCY_REMEDIATION_POLICY_FAILURES=${JSON.stringify(state.failures)}`);
  if (!state.ok) {
    console.log(`FAIL_REASON=${state.failReason}`);
    console.log(`FAIL_SIGNAL=${state.failSignal}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateDependencyRemediationPolicyState({
    policyPath: args.policyPath || undefined,
    gateTier: args.gateTier || undefined,
  });
  if (args.json) {
    process.stdout.write(`${stableStringify(state)}\n`);
  } else {
    printHuman(state);
  }
  process.exit(state.ok ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}

