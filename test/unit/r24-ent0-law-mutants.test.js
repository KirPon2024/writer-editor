'use strict';

// R2.4 ENT0 implementation mutation suite for the entitlement law.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MODULE_PATH = path.join(__dirname, '..', '..', 'src', 'core', 'entitlement-law-v1.cjs');

const MUTANTS = [
  {
    id: 'pro-normalization-loosened',
    find: "  return (typeof value === 'string' ? value.trim() : '').toLowerCase() === ENTITLEMENT_TIERS.PRO\n    ? ENTITLEMENT_TIERS.PRO\n    : ENTITLEMENT_TIERS.FREE;",
    replace: "  return (typeof value === 'string' ? value.trim() : '').toLowerCase() !== ENTITLEMENT_TIERS.FREE\n    ? ENTITLEMENT_TIERS.PRO\n    : ENTITLEMENT_TIERS.FREE;",
  },
  {
    id: 'pro-tier-check-removed',
    find: '  if (tier === ENTITLEMENT_TIERS.PRO) {',
    replace: '  if (false) {',
  },
  {
    id: 'pro-complexity-block-removed',
    find: '  if (FREE_PRO_COMPLEXITY_SET.has(normalizedCommandId)) {',
    replace: '  if (false) {',
  },
  {
    id: 'read-only-check-removed',
    find: '  if (FREE_READ_ONLY_SET.has(normalizedCommandId)) {',
    replace: '  if (false) {',
  },
  {
    id: 'free-always-check-removed',
    find: '  if (FREE_ALWAYS_AVAILABLE_SET.has(normalizedCommandId)) {',
    replace: '  if (false) {',
  },
  {
    id: 'unclassified-default-allows',
    find: "    ok: false,\n    available: false,\n    visible: false,\n    access: 'unclassified',",
    replace: "    ok: true,\n    available: true,\n    visible: true,\n    access: 'unclassified',",
  },
  {
    id: 'product-tier-becomes-pro',
    find: 'function getProductEntitlementTier() {\n  return ENTITLEMENT_TIERS.FREE;\n}',
    replace: 'function getProductEntitlementTier() {\n  return ENTITLEMENT_TIERS.PRO;\n}',
  },
];

function killOracle(module) {
  const {
    decideCommandEntitlement,
    getProductEntitlementTier,
    normalizeEntitlementTier,
    FREE_PRO_COMPLEXITY_COMMAND_IDS,
    FREE_READ_ONLY_COMMAND_IDS,
  } = module;

  // v1 local law: the product-owned tier is the constant free.
  assert.equal(getProductEntitlementTier(), 'free');

  // Hostile tier spellings degrade to free; only exact pro is pro.
  assert.equal(normalizeEntitlementTier('enterprise'), 'free');
  assert.equal(normalizeEntitlementTier('pro'), 'pro');

  // Free refuses the pro complexity surface; pro enables it.
  const proId = FREE_PRO_COMPLEXITY_COMMAND_IDS[0];
  assert.equal(decideCommandEntitlement(proId, 'free').available, false);
  assert.equal(decideCommandEntitlement(proId, 'free').reason, 'PRO_COMPLEXITY_SURFACE_UNAVAILABLE_IN_FREE');
  assert.equal(decideCommandEntitlement(proId, 'pro').available, true);

  // Read-only stays available with typed access in free.
  const roId = FREE_READ_ONLY_COMMAND_IDS[0];
  assert.equal(decideCommandEntitlement(roId, 'free').available, true);
  assert.equal(decideCommandEntitlement(roId, 'free').access, 'read_only');

  // Free authorship is available; unclassified fails closed.
  assert.equal(decideCommandEntitlement('cmd.project.save', 'free').available, true);
  const un = decideCommandEntitlement('cmd.project.unknown.surface', 'free');
  assert.equal(un.available, false);
  assert.equal(un.reason, 'COMMAND_ENTITLEMENT_UNCLASSIFIED');
}

test('ENT0 entitlement law: all implementation mutants are executed and killed', () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  killOracle(require(MODULE_PATH));
  const results = [];
  for (const mutant of MUTANTS) {
    const occurrences = source.split(mutant.find).length - 1;
    assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-ent0-mutant-'));
    // The module resolves ../shared/productCommandRegistry.cjs relative to
    // itself, so the mutant must live at the same layout depth.
    fs.mkdirSync(path.join(dir, 'core'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'shared'), { recursive: true });
    fs.copyFileSync(
      path.join(__dirname, '..', '..', 'src', 'shared', 'productCommandRegistry.cjs'),
      path.join(dir, 'shared', 'productCommandRegistry.cjs'),
    );
    const target = path.join(dir, 'core', 'entitlement-law-v1.cjs');
    fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
    let killed = false;
    let detail = '';
    try {
      killOracle(require(target));
      detail = 'survived';
    } catch (error) {
      killed = true;
      detail = error.code || error.message;
    }
    results.push({ id: mutant.id, killed, detail });
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const survived = results.filter((r) => !r.killed);
  console.log(`R24_ENT0_MUTATION_RECEIPT=${JSON.stringify({ total: results.length, killed: results.length - survived.length, survived: survived.map((s) => s.id), score: results.length ? (results.length - survived.length) / results.length : 0 })}`);
  assert.equal(results.length > 0, true, 'zero denominator forbidden');
  assert.deepEqual(survived, []);
});
