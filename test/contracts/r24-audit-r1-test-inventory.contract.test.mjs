import assert from 'node:assert/strict';
import test from 'node:test';
import { REQUIRED_LANE_EXECUTIONS, buildAuditInventory, runRequiredLane, validateAuditInventory } from '../../scripts/ops/r24/corrective/audit-r1-test-inventory.mjs';

test('current audit stage reconciles every static skip without accepting C1B policy', () => {
  const inventory = buildAuditInventory(process.cwd(), 'AUDIT_R1');
  assert.equal(inventory.staleC1bPolicyAccepted, false);
  assert.equal(inventory.totals.unexplainedSkips, 0);
  assert.equal(inventory.totals.expiredPolicies, 0);
  assert.equal(inventory.totals.unresolvedRequiredSkips, 0);
  assert.equal(validateAuditInventory(process.cwd(), inventory), true);
});

test('requires current stage and rejects stale or incomplete inventory', () => {
  assert.throws(() => buildAuditInventory(process.cwd(), 'C1B'), (error) => error.code === 'E_INVENTORY_STAGE');
  const inventory = buildAuditInventory(process.cwd(), 'AUDIT_R1');
  const stale = structuredClone(inventory); stale.staleC1bPolicyAccepted = true;
  assert.throws(() => validateAuditInventory(process.cwd(), stale), (error) => error.code === 'E_STALE_SKIP_AUTHORITY');
  const incomplete = structuredClone(inventory); incomplete.skipEntries.pop();
  assert.throws(() => validateAuditInventory(process.cwd(), incomplete), (error) => error.code === 'E_INVENTORY_CURRENT_STATE_MISMATCH');
});

test('requires every reconciled current-stage lane to have an exact PASS result', () => {
  const inventory = buildAuditInventory(process.cwd(), 'AUDIT_R1');
  const passBundle = { results: inventory.requiredLaneIds.map((id) => ({ id, status: 'PASS', exitCode: 0 })) };
  assert.equal(validateAuditInventory(process.cwd(), inventory, passBundle), true);
  const missing = { results: passBundle.results.slice(1) };
  assert.throws(() => validateAuditInventory(process.cwd(), inventory, missing), (error) => error.code === 'E_SKIP_REQUIRED_LANE_NOT_PASS');
});

test('Sector U full lane reexecutes U6, U7, and U8 with every required full-mode flag', () => {
  const lane = REQUIRED_LANE_EXECUTIONS.SECTOR_U_FULL;
  assert.deepEqual(lane.env, { SECTOR_U_FULL_A11Y: '1', SECTOR_U_FULL_PERF: '1', SECTOR_U_FULL_VISUAL: '1' });
  assert.equal(lane.testFiles.length, 4);
  assert.ok(lane.testFiles.some((file) => file.includes('u8-perf-baseline')));
  let observed;
  assert.equal(runRequiredLane(process.cwd(), 'SECTOR_U_FULL', (...args) => { observed = args; return ''; }), true);
  assert.deepEqual(observed[1], ['--test', ...lane.testFiles]);
  assert.equal(observed[2].env.SECTOR_U_FULL_PERF, '1');
  assert.throws(() => runRequiredLane(process.cwd(), 'STALE_C1B', () => ''), (error) => error.code === 'E_REQUIRED_LANE_UNKNOWN');
});
