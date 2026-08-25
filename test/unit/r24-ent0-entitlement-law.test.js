'use strict';

// R2.4 ENT0 unit law tests for the single entitlement decision table.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const law = require(path.join(__dirname, '..', '..', 'src', 'core', 'entitlement-law-v1.cjs'));

test('tier normalization recognizes pro spelling, but effective tier safe-denies pro', () => {
  assert.equal(law.normalizeEntitlementTier('pro'), 'pro');
  assert.equal(law.normalizeEntitlementTier('PRO'), 'pro');
  assert.equal(law.normalizeEntitlementTier(' Pro '), 'pro');
  assert.equal(law.normalizeEffectiveEntitlementTier('pro'), 'free');
  assert.equal(law.normalizeEffectiveEntitlementTier('PRO'), 'free');
  assert.equal(law.normalizeEffectiveEntitlementTier(' Pro '), 'free');
  assert.equal(law.isEntitlementTierEnabled('free'), true);
  assert.equal(law.isEntitlementTierEnabled('pro'), false);
  for (const hostile of ['free', '', 'enterprise', 'pro-plus', '1', 'true', null, undefined, 42, {}, ['pro']]) {
    assert.equal(law.normalizeEntitlementTier(hostile), 'free', String(hostile));
    assert.equal(law.normalizeEffectiveEntitlementTier(hostile), 'free', String(hostile));
  }
});

test('product-owned tier is the constant free under the v1 local law', () => {
  assert.equal(law.getProductEntitlementTier(), 'free');
  assert.equal(law.getProductEntitlementTier.length, 0, 'the port resolver takes no input, renderer payloads cannot reach it');
});

test('decision branches: invalid id fails closed as unavailable', () => {
  for (const bad of ['', '   ', null, undefined, 7]) {
    const d = law.decideCommandEntitlement(bad, 'pro');
    assert.deepEqual(
      { ok: d.ok, available: d.available, visible: d.visible, access: d.access, reason: d.reason },
      { ok: false, available: false, visible: false, access: 'unavailable', reason: 'COMMAND_ID_INVALID' },
    );
  }
});

test('decision branches: supplied pro tier is safe-denied to free for pro complexity', () => {
  for (const id of law.FREE_PRO_COMPLEXITY_COMMAND_IDS) {
    const d = law.decideCommandEntitlement(id, 'pro');
    assert.equal(d.ok, false, id);
    assert.equal(d.available, false, id);
    assert.equal(d.visible, false, id);
    assert.equal(d.access, 'pro_complexity_surface', id);
    assert.equal(d.reason, 'PRO_COMPLEXITY_SURFACE_UNAVAILABLE_IN_FREE', id);
  }
});

test('decision branches: read-only commands stay available in free with typed access', () => {
  for (const id of law.FREE_READ_ONLY_COMMAND_IDS) {
    const d = law.decideCommandEntitlement(id, 'free');
    assert.equal(d.ok, true, id);
    assert.equal(d.available, true, id);
    assert.equal(d.access, 'read_only', id);
    assert.equal(d.reason, 'PRO_DATA_READ_ONLY_IN_FREE', id);
  }
});

test('decision branches: the nine pro complexity commands are refused in free', () => {
  assert.equal(law.FREE_PRO_COMPLEXITY_COMMAND_IDS.length, 9);
  for (const id of law.FREE_PRO_COMPLEXITY_COMMAND_IDS) {
    const d = law.decideCommandEntitlement(id, 'free');
    assert.equal(d.ok, false, id);
    assert.equal(d.available, false, id);
    assert.equal(d.visible, false, id);
    assert.equal(d.access, 'pro_complexity_surface', id);
    assert.equal(d.reason, 'PRO_COMPLEXITY_SURFACE_UNAVAILABLE_IN_FREE', id);
  }
});

test('decision branches: free authorship commands stay available under supplied pro', () => {
  for (const id of ['cmd.project.save', 'project.create', 'project.applyTextEdit', 'cmd.ui.theme.set']) {
    const d = law.decideCommandEntitlement(id, 'pro');
    assert.equal(d.available, true, id);
    assert.equal(d.access, 'free_authorship', id);
    assert.equal(d.reason, '', id);
  }
});

test('decision branches: unclassified commands fail closed under supplied pro', () => {
  const d = law.decideCommandEntitlement('cmd.project.unknown.surface', 'pro');
  assert.deepEqual(
    { ok: d.ok, available: d.available, visible: d.visible, access: d.access, reason: d.reason },
    { ok: false, available: false, visible: false, access: 'unclassified', reason: 'COMMAND_ENTITLEMENT_UNCLASSIFIED' },
  );
});

test('set precedence: the one overlapping id resolves to pro complexity, matching pre-ENT0 order', () => {
  const overlap = 'cmd.project.review.applyFullManuscriptExactTextReturn';
  assert.equal(law.isProComplexityCommandId(overlap), true);
  assert.equal(law.isFreeAlwaysAvailableCommandId(overlap), true);
  const d = law.decideCommandEntitlement(overlap, 'free');
  assert.equal(d.access, 'pro_complexity_surface');
});

test('decision results are frozen and carry the normalized command id', () => {
  const d = law.decideCommandEntitlement('  cmd.project.save  ', 'free');
  assert.equal(Object.isFrozen(d), true);
  assert.equal(d.commandId, 'cmd.project.save');
  assert.throws(() => { d.available = false; }, TypeError);
});

test('table integrity: sets are frozen, product registry commands are free authorship', () => {
  assert.equal(Object.isFrozen(law.FREE_ALWAYS_AVAILABLE_COMMAND_IDS), true);
  assert.equal(Object.isFrozen(law.FREE_PRO_COMPLEXITY_COMMAND_IDS), true);
  assert.equal(Object.isFrozen(law.FREE_READ_ONLY_COMMAND_IDS), true);
  const registry = require(path.join(__dirname, '..', '..', 'src', 'shared', 'productCommandRegistry.cjs'));
  for (const id of registry.PRODUCT_COMMAND_ID_LIST) {
    assert.equal(law.decideCommandEntitlement(id, 'free').access, 'free_authorship', id);
  }
  assert.equal(law.ENTITLEMENT_INVARIANTS.hasRemoteLicenseAuthority, false);
  assert.equal(law.ENTITLEMENT_INVARIANTS.requiresNetwork, false);
  assert.equal(law.ENTITLEMENT_INVARIANTS.safeDenyUntilProductDecision, true);
  assert.equal(law.ENTITLEMENT_INVARIANTS.entitlementDependentBehaviorEnabled, false);
  assert.equal(law.ENTITLEMENT_INVARIANTS.pricingAuthority, false);
  assert.equal(law.ENTITLEMENT_INVARIANTS.businessAuthority, false);
  assert.equal(law.ENTITLEMENT_INVARIANTS.releaseAuthority, false);
  assert.equal(law.ENTITLEMENT_INVARIANTS.cloudAuthority, false);
  assert.equal(law.ENTITLEMENT_INVARIANTS.userDataAuthority, false);
  assert.equal(law.ENTITLEMENT_INVARIANTS.dependencyAdoption, false);
  assert.equal(law.ENTITLEMENT_AUTHORITY_MODE.ownerDecision, 'DENIED');
  assert.equal(law.ENTITLEMENT_AUTHORITY_MODE.mode, 'SAFE_DENY');
  assert.deepEqual(law.ENTITLEMENT_AUTHORITY_MODE.enabledTiers, ['free']);
  assert.deepEqual(law.ENTITLEMENT_AUTHORITY_MODE.disabledTiers, ['pro']);
  assert.equal(Object.isFrozen(law.ENTITLEMENT_INVARIANTS), true);
});
