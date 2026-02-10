import fs from 'node:fs';
import path from 'node:path';

const policyPath = path.join(process.cwd(), 'docs', 'OPERATIONS', 'STATUS', 'CODEX_AUTOMATION_POLICY.json');

function fail(reason) {
  console.error(reason);
  process.exit(1);
}

if (!fs.existsSync(policyPath)) {
  fail('ARTIFACT_MISSING:CODEX_AUTOMATION_POLICY.json');
}

let doc;
try {
  doc = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
} catch (error) {
  fail(`POLICY_SCHEMA_INVALID:JSON_PARSE:${error.message}`);
}

const requiredString = [
  'policyVersion',
  'promptMode',
  'runnerProfileRef',
  'failReasonRegistryRef',
];
for (const key of requiredString) {
  if (typeof doc[key] !== 'string' || doc[key].trim() === '') {
    fail(`POLICY_SCHEMA_INVALID:${key}`);
  }
}

const requiredBool = ['autoApplyWithinAllowlist', 'denylistAbsolute'];
for (const key of requiredBool) {
  if (typeof doc[key] !== 'boolean') {
    fail(`POLICY_SCHEMA_INVALID:${key}`);
  }
}

const requiredArray = ['allowlist', 'denylist', 'commandAllowlist', 'dangerousOps', 'failReasons'];
for (const key of requiredArray) {
  if (!Array.isArray(doc[key]) || doc[key].length === 0) {
    fail(`POLICY_SCHEMA_INVALID:${key}`);
  }
}

if (!doc.promptDetection || typeof doc.promptDetection !== 'object') {
  fail('POLICY_SCHEMA_INVALID:promptDetection');
}
if (typeof doc.promptDetection.markerRegex !== 'string' || doc.promptDetection.markerRegex.trim() === '') {
  fail('POLICY_SCHEMA_INVALID:promptDetection.markerRegex');
}
if (!Number.isInteger(doc.promptDetection.exitCodeOnPrompt)) {
  fail('POLICY_SCHEMA_INVALID:promptDetection.exitCodeOnPrompt');
}

if (!doc.evidence || typeof doc.evidence !== 'object') {
  fail('POLICY_SCHEMA_INVALID:evidence');
}
for (const key of ['verifiedAt', 'verifiedBy', 'notes']) {
  if (!(key in doc.evidence)) {
    fail(`POLICY_SCHEMA_INVALID:evidence.${key}`);
  }
}

console.log('CP-2 POLICY_SCHEMA_OK=1');
