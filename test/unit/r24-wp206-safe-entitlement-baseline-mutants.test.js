'use strict';

// WP206 implementation mutants for the safe-deny entitlement baseline.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(ROOT, 'src', 'core', 'entitlement-law-v1.cjs');

const MUTANTS = Object.freeze([
  {
    id: 'effective-pro-bypass',
    find: '  return isEntitlementTierEnabled(tier) ? tier : ENTITLEMENT_TIERS.FREE;',
    replace: '  return tier;',
  },
  {
    id: 'enabled-tiers-include-pro',
    find: '  enabledTiers: Object.freeze([ENTITLEMENT_TIERS.FREE]),',
    replace: '  enabledTiers: Object.freeze([ENTITLEMENT_TIERS.FREE, ENTITLEMENT_TIERS.PRO]),',
  },
  {
    id: 'product-tier-becomes-pro',
    find: 'function getProductEntitlementTier() {\n  return ENTITLEMENT_TIERS.FREE;\n}',
    replace: 'function getProductEntitlementTier() {\n  return ENTITLEMENT_TIERS.PRO;\n}',
  },
  {
    id: 'pro-complexity-block-removed',
    find: '  if (FREE_PRO_COMPLEXITY_SET.has(normalizedCommandId)) {',
    replace: '  if (false) {',
  },
  {
    id: 'read-only-block-removed',
    find: '  if (FREE_READ_ONLY_SET.has(normalizedCommandId)) {',
    replace: '  if (false) {',
  },
  {
    id: 'free-authorship-block-removed',
    find: '  if (FREE_ALWAYS_AVAILABLE_SET.has(normalizedCommandId)) {',
    replace: '  if (false) {',
  },
  {
    id: 'pricing-authority-enabled',
    find: '  disabledTiers: Object.freeze([ENTITLEMENT_TIERS.PRO]),\n  pricingAuthority: false,',
    replace: '  disabledTiers: Object.freeze([ENTITLEMENT_TIERS.PRO]),\n  pricingAuthority: true,',
  },
]);

function assertWp206Oracle(module) {
  const mode = module.ENTITLEMENT_AUTHORITY_MODE;

  assert.equal(mode.ownerDecision, 'DENIED');
  assert.equal(mode.mode, 'SAFE_DENY');
  assert.equal(mode.entitlementDependentBehaviorEnabled, false);
  assert.deepEqual(mode.enabledTiers, ['free']);
  assert.deepEqual(mode.disabledTiers, ['pro']);
  assert.equal(mode.pricingAuthority, false);
  assert.equal(mode.businessAuthority, false);
  assert.equal(mode.releaseAuthority, false);
  assert.equal(mode.cloudAuthority, false);
  assert.equal(mode.userDataAuthority, false);
  assert.equal(mode.dependencyAdoption, false);
  assert.equal(module.ENTITLEMENT_INVARIANTS.safeDenyUntilProductDecision, true);
  assert.equal(module.getProductEntitlementTier(), 'free');

  assert.equal(module.normalizeEntitlementTier('pro'), 'pro');
  assert.equal(module.normalizeEffectiveEntitlementTier('pro'), 'free');
  assert.equal(module.isEntitlementTierEnabled('pro'), false);
  assert.equal(module.isEntitlementTierEnabled('free'), true);

  const proSurface = module.decideCommandEntitlement('cmd.project.review.switchMode', 'pro');
  assert.equal(proSurface.available, false);
  assert.equal(proSurface.visible, false);
  assert.equal(proSurface.access, 'pro_complexity_surface');
  assert.equal(proSurface.reason, 'PRO_COMPLEXITY_SURFACE_UNAVAILABLE_IN_FREE');

  const readOnly = module.decideCommandEntitlement('cmd.project.review.openComments', 'pro');
  assert.equal(readOnly.available, true);
  assert.equal(readOnly.access, 'read_only');

  const archive = module.decideCommandEntitlement('cmd.project.exportFullArchiveV1', 'pro');
  assert.equal(archive.available, true);
  assert.equal(archive.access, 'free_authorship');

  const unknown = module.decideCommandEntitlement('cmd.project.future.proOnly', 'pro');
  assert.equal(unknown.available, false);
  assert.equal(unknown.reason, 'COMMAND_ENTITLEMENT_UNCLASSIFIED');
}

function loadMutant(source, mutant) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-wp206-mutant-'));
  fs.mkdirSync(path.join(dir, 'core'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'shared'), { recursive: true });
  fs.copyFileSync(
    path.join(ROOT, 'src', 'shared', 'productCommandRegistry.cjs'),
    path.join(dir, 'shared', 'productCommandRegistry.cjs'),
  );
  const target = path.join(dir, 'core', 'entitlement-law-v1.cjs');
  fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
  return { dir, module: require(target) };
}

test('WP206 safe-deny entitlement baseline: all implementation mutants are killed', () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  assertWp206Oracle(require(MODULE_PATH));

  const results = [];
  for (const mutant of MUTANTS) {
    const occurrences = source.split(mutant.find).length - 1;
    assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
    const { dir, module } = loadMutant(source, mutant);
    let killed = false;
    let detail = '';
    try {
      assertWp206Oracle(module);
      detail = 'survived';
    } catch (error) {
      killed = true;
      detail = error.code || error.message;
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    results.push({ id: mutant.id, killed, detail });
  }

  const survived = results.filter((result) => !result.killed);
  console.log(`R24_WP206_MUTATION_RECEIPT=${JSON.stringify({
    total: results.length,
    killed: results.length - survived.length,
    survived: survived.map((result) => result.id),
    score: results.length ? (results.length - survived.length) / results.length : 0,
  })}`);
  assert.equal(results.length > 0, true, 'zero denominator forbidden');
  assert.deepEqual(survived, []);
});
