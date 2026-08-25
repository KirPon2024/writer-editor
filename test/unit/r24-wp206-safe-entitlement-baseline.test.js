'use strict';

// R2.4 WP206: safe-deny entitlement baseline after owner DENIED the
// entitlement semantics ADR-or-deny gate for this mission/node.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const law = require(path.join(ROOT, 'src', 'core', 'entitlement-law-v1.cjs'));

async function importRepo(relativePath) {
  return import(pathToFileURL(path.join(ROOT, relativePath)).href);
}

const FORBIDDEN_AUTHORITY_FLAGS = Object.freeze([
  'pricingAuthority',
  'businessAuthority',
  'releaseAuthority',
  'cloudAuthority',
  'userDataAuthority',
  'dependencyAdoption',
]);

test('WP206 core mode records DENIED safe-deny authority without forbidden grants', () => {
  const mode = law.ENTITLEMENT_AUTHORITY_MODE;

  assert.equal(mode.schemaVersion, 'entitlement-authority-mode.v1');
  assert.equal(mode.gateId, 'ENTITLEMENT_SEMANTICS_ADR_OR_DENY');
  assert.equal(mode.ownerDecision, 'DENIED');
  assert.equal(mode.mode, 'SAFE_DENY');
  assert.equal(mode.entitlementDependentBehaviorEnabled, false);
  assert.deepEqual(mode.enabledTiers, ['free']);
  assert.deepEqual(mode.disabledTiers, ['pro']);
  for (const flag of FORBIDDEN_AUTHORITY_FLAGS) {
    assert.equal(mode[flag], false, flag);
    assert.equal(law.ENTITLEMENT_INVARIANTS[flag], false, flag);
  }
  assert.equal(law.ENTITLEMENT_INVARIANTS.safeDenyUntilProductDecision, true);
  assert.equal(Object.isFrozen(mode), true);
});

test('WP206 core recognizes pro spelling but computes an effective Free tier', () => {
  assert.equal(law.normalizeEntitlementTier('pro'), 'pro');
  assert.equal(law.normalizeEntitlementTier('PRO'), 'pro');
  assert.equal(law.normalizeEffectiveEntitlementTier('pro'), 'free');
  assert.equal(law.isEntitlementTierEnabled('pro'), false);
  assert.equal(law.isEntitlementTierEnabled('free'), true);

  const review = law.decideCommandEntitlement('cmd.project.review.switchMode', 'pro');
  assert.deepEqual(
    { available: review.available, visible: review.visible, access: review.access, reason: review.reason },
    {
      available: false,
      visible: false,
      access: 'pro_complexity_surface',
      reason: 'PRO_COMPLEXITY_SURFACE_UNAVAILABLE_IN_FREE',
    },
  );

  const archive = law.decideCommandEntitlement('cmd.project.exportFullArchiveV1', 'pro');
  assert.equal(archive.available, true);
  assert.equal(archive.access, 'free_authorship');

  const comments = law.decideCommandEntitlement('cmd.project.review.openComments', 'pro');
  assert.equal(comments.available, true);
  assert.equal(comments.access, 'read_only');
});

test('WP206 renderer mirror exposes requested Pro while deciding effective Free', async () => {
  const provider = await importRepo('src/renderer/commands/localCapabilityProvider.mjs');
  const state = provider.normalizeLocalCapabilityState({
    entitlementTier: 'pro',
    toolbarProfile: 'minimal',
  });

  assert.equal(state.requestedTier, 'pro');
  assert.equal(state.tier, 'free');
  assert.equal(state.tierDisabled, true);
  assert.equal(state.label, 'Free');
  assert.equal(state.profileId, 'minimal');
  assert.equal(state.entitlementAuthorityMode, 'SAFE_DENY');
  assert.equal(state.entitlementDependentBehaviorEnabled, false);
  for (const flag of FORBIDDEN_AUTHORITY_FLAGS) {
    assert.equal(state[flag], false, flag);
  }

  const contract = provider.getLocalCapabilityContract();
  assert.equal(contract.entitlementAuthorityMode, 'SAFE_DENY');
  assert.equal(contract.entitlementDependentBehaviorEnabled, false);
  assert.deepEqual(contract.enabledTiers, ['free']);
  assert.deepEqual(contract.disabledTiers, ['pro']);
  for (const flag of FORBIDDEN_AUTHORITY_FLAGS) {
    assert.equal(contract.forbiddenAuthority[flag], false, flag);
  }

  const review = provider.resolveCommandEntitlement('cmd.project.review.switchMode', { entitlementTier: 'pro' });
  assert.equal(review.available, false);
  assert.equal(review.visible, false);
  assert.equal(review.reason, 'PRO_COMPLEXITY_SURFACE_UNAVAILABLE_IN_FREE');
  assert.equal(review.state.requestedTier, 'pro');
  assert.equal(review.state.tier, 'free');

  const archive = provider.resolveCommandEntitlement('cmd.project.exportFullArchiveV1', { entitlementTier: 'pro' });
  assert.equal(archive.available, true);
  assert.equal(archive.access, 'free_authorship');

  const comments = provider.resolveCommandEntitlement('cmd.project.review.openComments', { entitlementTier: 'pro' });
  assert.equal(comments.available, true);
  assert.equal(comments.access, 'read_only');
});

test('WP206 command capability and runner safe-deny supplied Pro defaults', async () => {
  const capability = await importRepo('src/renderer/commands/capabilityPolicy.mjs');
  const registryModule = await importRepo('src/renderer/commands/registry.mjs');
  const runnerModule = await importRepo('src/renderer/commands/runCommand.mjs');

  const check = capability.enforceCapabilityForCommand(
    'cmd.project.review.switchMode',
    { platformId: 'node' },
    { defaultEntitlementTier: 'pro' },
  );
  assert.equal(check.ok, false);
  assert.equal(check.error.code, 'E_CAPABILITY_DISABLED_FOR_ENTITLEMENT');
  assert.equal(check.error.reason, 'PRO_COMPLEXITY_SURFACE_UNAVAILABLE_IN_FREE');
  assert.equal(check.error.details.entitlementTier, 'free');

  const archive = capability.enforceCapabilityForCommand(
    'cmd.project.exportFullArchiveV1',
    { platformId: 'node' },
    { defaultEntitlementTier: 'pro' },
  );
  assert.equal(archive.ok, true);

  const registry = registryModule.createCommandRegistry();
  let calls = 0;
  registry.registerCommand('cmd.project.review.switchMode', async () => {
    calls += 1;
    return { ok: true };
  });
  const runner = runnerModule.createCommandRunner(registry, {
    capability: { defaultPlatformId: 'node', defaultEntitlementTier: 'pro' },
  });
  const result = await runner('cmd.project.review.switchMode');
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'E_CAPABILITY_DISABLED_FOR_ENTITLEMENT');
  assert.equal(calls, 0);
});
