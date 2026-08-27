import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildInventory,
  canonicalBytes,
  validateInventory,
} from '../../scripts/ops/r24/test-inventory.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function expectFailure(inventory, code) {
  const result = validateInventory(ROOT_DIR, inventory);
  assert.equal(result.ok, false);
  assert.equal(result.failures.some((failure) => failure.startsWith(`${code}:`)), true, result.failures.join('\n'));
}

test('C1B inventory is deterministic, exhaustive, and carries no unexplained or required skips', () => {
  const inventory = buildInventory(ROOT_DIR);
  const rebuilt = buildInventory(ROOT_DIR);

  assert.deepEqual(canonicalBytes(inventory), canonicalBytes(rebuilt));
  assert.equal(inventory.totals.unexplainedSkips, 0);
  assert.equal(inventory.totals.requiredSkips, 0);
  assert.equal(inventory.totals.lateMjs, 8);
  assert.equal(inventory.entries.every((entry) => entry.kind !== 'OTHER'), true);
  assert.equal(inventory.entries.every((entry) => /^[0-9a-f]{64}$/u.test(entry.sha256)), true);
  assert.deepEqual(validateInventory(ROOT_DIR, inventory).failures, []);
});

test('C1B inventory verifier rejects missing, duplicate, and digest-divergent entries', () => {
  const missing = structuredClone(buildInventory(ROOT_DIR));
  missing.entries.pop();
  expectFailure(missing, 'E_INVENTORY_FILE_SET_MISMATCH');

  const duplicate = structuredClone(buildInventory(ROOT_DIR));
  duplicate.entries.splice(1, 0, structuredClone(duplicate.entries[0]));
  expectFailure(duplicate, 'E_INVENTORY_DUPLICATE_PATH');

  const digestDivergent = structuredClone(buildInventory(ROOT_DIR));
  digestDivergent.entries[0].sha256 = '0'.repeat(64);
  expectFailure(digestDivergent, 'E_INVENTORY_DIGEST_MISMATCH');
});

test('C1B inventory verifier rejects missing, expired, and contradictory skip policy', () => {
  const baseline = buildInventory(ROOT_DIR);
  const skipIndex = baseline.entries.findIndex((entry) => entry.skipSites > 0);
  assert.notEqual(skipIndex, -1);

  const missingPolicy = structuredClone(baseline);
  missingPolicy.entries[skipIndex].skipPolicy = null;
  expectFailure(missingPolicy, 'E_SKIP_POLICY_MISSING');

  const expired = structuredClone(baseline);
  expired.entries[skipIndex].skipPolicy.expiresBeforeStage = 'C1B';
  expectFailure(expired, 'E_SKIP_POLICY_EXPIRED');

  const excludedIndex = baseline.entries.findIndex((entry) => entry.skipPolicy?.classification === 'EXCLUDED_NON_REQUIRED');
  assert.notEqual(excludedIndex, -1);
  const contradictory = structuredClone(baseline);
  contradictory.entries[excludedIndex].required = true;
  expectFailure(contradictory, 'E_CLASSIFICATION_CONTRADICTORY');
});
