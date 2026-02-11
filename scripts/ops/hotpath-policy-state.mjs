#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const TOOL_VERSION = 'hotpath-policy-state.v1';
const DEFAULT_POLICY_PATH = 'scripts/perf/hotpath-policy.json';

function canonicalSerialize(value) {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalSerialize(item)).join(',')}]`;
  if (t === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalSerialize(value[key])}`).join(',')}}`;
  }
  return 'null';
}

function sha256(input) {
  return createHash('sha256').update(String(input || ''), 'utf8').digest('hex');
}

function parseJsonObject(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const out = {
    json: false,
    policyPath: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    else if (arg === '--policy') {
      out.policyPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }
  return out;
}

function buildRuleRegex(rule) {
  try {
    return new RegExp(String(rule.pattern || ''), 'u');
  } catch {
    return null;
  }
}

function findLineNumber(text, index) {
  if (index <= 0) return 1;
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function validatePolicyDoc(policy) {
  const issues = [];
  if (!policy) {
    issues.push('policy_json_invalid');
    return issues;
  }
  if (policy.schemaVersion !== 'hotpath-policy.v1') issues.push('policy_schema_invalid');
  if (typeof policy.profile !== 'string' || policy.profile.trim().length === 0) issues.push('policy_profile_invalid');
  if (!Array.isArray(policy.monitoredPaths) || policy.monitoredPaths.length === 0) issues.push('policy_monitored_paths_invalid');
  if (!Array.isArray(policy.rules) || policy.rules.length === 0) issues.push('policy_rules_invalid');
  if (Array.isArray(policy.rules)) {
    for (const rule of policy.rules) {
      if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
        issues.push('policy_rule_item_invalid');
        continue;
      }
      if (typeof rule.id !== 'string' || rule.id.trim().length === 0) issues.push('policy_rule_id_invalid');
      if (typeof rule.reason !== 'string' || rule.reason.trim().length === 0) issues.push('policy_rule_reason_invalid');
      if (typeof rule.pattern !== 'string' || rule.pattern.trim().length === 0) {
        issues.push('policy_rule_pattern_invalid');
      } else if (!buildRuleRegex(rule)) {
        issues.push(`policy_rule_pattern_regex_invalid:${rule.id}`);
      }
    }
  }
  return issues;
}

export function evaluateHotpathPolicyState(input = {}) {
  const policyPath = path.resolve(String(input.policyPath || DEFAULT_POLICY_PATH));
  const state = {
    toolVersion: TOOL_VERSION,
    policyPath,
    policyProfile: '',
    configHash: '',
    HOTPATH_POLICY_OK: 0,
    violations: [],
    policyIssues: [],
    failReason: '',
  };

  if (!fs.existsSync(policyPath)) {
    state.failReason = 'HOTPATH_POLICY_FILE_MISSING';
    return state;
  }

  const policy = parseJsonObject(policyPath);
  const policyIssues = validatePolicyDoc(policy);
  state.policyIssues = policyIssues;

  if (policy && typeof policy.profile === 'string') {
    state.policyProfile = policy.profile;
  }

  if (policy) {
    state.configHash = sha256(canonicalSerialize({
      toolVersion: TOOL_VERSION,
      policy,
    }));
  }

  if (policyIssues.length > 0 || !policy) {
    state.failReason = 'HOTPATH_POLICY_INVALID';
    return state;
  }

  for (const relPathRaw of policy.monitoredPaths) {
    const relPath = String(relPathRaw || '').trim();
    if (!relPath) {
      state.violations.push({
        ruleId: 'MONITORED_PATH_INVALID',
        filePath: '',
        line: 0,
        reason: 'empty monitored path',
      });
      continue;
    }

    const filePath = path.resolve(relPath);
    if (!fs.existsSync(filePath)) {
      state.violations.push({
        ruleId: 'MONITORED_PATH_MISSING',
        filePath: relPath,
        line: 0,
        reason: 'monitored file is missing',
      });
      continue;
    }

    const text = fs.readFileSync(filePath, 'utf8');
    for (const rule of policy.rules) {
      const regex = buildRuleRegex(rule);
      if (!regex) continue;
      const match = regex.exec(text);
      if (!match) continue;
      const index = typeof match.index === 'number' ? match.index : 0;
      state.violations.push({
        ruleId: rule.id,
        filePath: relPath,
        line: findLineNumber(text, index),
        reason: rule.reason,
      });
    }
  }

  if (state.violations.length > 0) {
    state.failReason = 'HOTPATH_POLICY_VIOLATIONS';
    return state;
  }

  state.HOTPATH_POLICY_OK = 1;
  return state;
}

function printTokens(state) {
  console.log(`HOTPATH_POLICY_TOOL_VERSION=${state.toolVersion}`);
  console.log(`HOTPATH_POLICY_PATH=${state.policyPath}`);
  console.log(`HOTPATH_POLICY_PROFILE=${state.policyProfile}`);
  console.log(`HOTPATH_POLICY_CONFIG_HASH=${state.configHash}`);
  console.log(`HOTPATH_POLICY_OK=${state.HOTPATH_POLICY_OK}`);
  console.log(`HOTPATH_POLICY_ISSUES=${JSON.stringify(state.policyIssues)}`);
  console.log(`HOTPATH_POLICY_VIOLATIONS=${JSON.stringify(state.violations)}`);
  if (state.failReason) {
    console.log(`FAIL_REASON=${state.failReason}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateHotpathPolicyState({
    policyPath: args.policyPath,
  });
  if (args.json) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  } else {
    printTokens(state);
  }
  process.exit(state.HOTPATH_POLICY_OK === 1 ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
