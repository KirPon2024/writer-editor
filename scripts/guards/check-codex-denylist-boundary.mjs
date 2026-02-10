import fs from 'node:fs';
import path from 'node:path';

const policyPath = path.join(process.cwd(), 'docs', 'OPERATIONS', 'STATUS', 'CODEX_AUTOMATION_POLICY.json');
const requiredDenyEntries = ['src/**', '.github/**', 'package.json', '**/*lock*', '**/.env*', '**/secrets/**'];

function fail(reason) {
  console.error(reason);
  process.exit(1);
}

if (!fs.existsSync(policyPath)) {
  fail('DENYLIST_GUARD_FAIL:POLICY_MISSING');
}

const doc = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
const allowlist = new Set(Array.isArray(doc.allowlist) ? doc.allowlist : []);
const denylist = new Set(Array.isArray(doc.denylist) ? doc.denylist : []);

if (denylist.size === 0) {
  fail('DENYLIST_GUARD_FAIL:DENYLIST_EMPTY');
}

for (const required of requiredDenyEntries) {
  if (!denylist.has(required)) {
    fail(`DENYLIST_GUARD_FAIL:MISSING_REQUIRED:${required}`);
  }
}

for (const denyEntry of denylist) {
  if (allowlist.has(denyEntry)) {
    fail(`DENYLIST_GUARD_FAIL:DENYLIST_IN_ALLOWLIST:${denyEntry}`);
  }
}

console.log('CP-4 DENYLIST_BOUNDARY_OK=1');
