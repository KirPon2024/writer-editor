import fs from 'node:fs';
import path from 'node:path';

const policyPath = path.join(process.cwd(), 'docs', 'OPERATIONS', 'STATUS', 'CODEX_AUTOMATION_POLICY.json');

function fail(reason) {
  console.error(reason);
  process.exit(1);
}

if (!fs.existsSync(policyPath)) {
  fail('ALLOWLIST_GUARD_FAIL:POLICY_MISSING');
}

const doc = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
const allowlist = new Set(Array.isArray(doc.allowlist) ? doc.allowlist : []);
const denylist = new Set(Array.isArray(doc.denylist) ? doc.denylist : []);

if (allowlist.size === 0) {
  fail('ALLOWLIST_GUARD_FAIL:ALLOWLIST_EMPTY');
}

const overlap = [...allowlist].filter((entry) => denylist.has(entry));
if (overlap.length > 0) {
  fail(`ALLOWLIST_GUARD_FAIL:ALLOWLIST_DENYLIST_OVERLAP:${overlap.join(',')}`);
}

if (allowlist.has('src/**') || allowlist.has('.github/**') || allowlist.has('package.json')) {
  fail('ALLOWLIST_GUARD_FAIL:CRITICAL_DENY_IN_ALLOWLIST');
}

console.log('CP-3 ALLOWLIST_BOUNDARY_OK=1');
