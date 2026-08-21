'use strict';

// R2.4 ENT0 port conformance: the one table is enforced at authoritative
// product ports with a product-owned tier, and the renderer hint plane is a
// pure mirror of the same law.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const law = require(path.join(ROOT, 'src', 'core', 'entitlement-law-v1.cjs'));

const readMain = () => fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');

test('port adoption: both command dispatch ports consult the one table with the product-owned tier', () => {
  const main = readMain();
  assert.ok(main.includes("require('./core/entitlement-law-v1.cjs')"));
  const calls = main.match(/decideCommandEntitlement\(commandId, getProductEntitlementTier\(\)\)/g) || [];
  assert.equal(calls.length, 2, 'menu dispatch and product bridge must both decide through the one table');
  assert.equal(main.includes('MAIN_FREE_PRO_COMPLEXITY_COMMAND_IDS'), false, 'the duplicated main-side set is gone');
});

test('port tier source: no renderer payload field can steer the port decision', () => {
  const main = readMain();
  for (const leak of ['payload.entitlementTier', 'payload.entitlementState', 'payload.tier', 'payload.plan', 'request.entitlementTier', 'safeRequest.entitlementTier']) {
    assert.equal(main.includes(leak), false, `renderer-supplied entitlement field must never be read: ${leak}`);
  }
  assert.equal(law.getProductEntitlementTier.length, 0);
});

test('typed refusal: free tier refuses the nine pro commands with the pre-ENT0 code and reason', () => {
  for (const id of law.FREE_PRO_COMPLEXITY_COMMAND_IDS) {
    const d = law.decideCommandEntitlement(id, law.getProductEntitlementTier());
    assert.equal(d.available, false, id);
    assert.equal(d.reason, 'PRO_COMPLEXITY_SURFACE_UNAVAILABLE_IN_FREE', id);
  }
  assert.equal(law.E_COMMAND_DISABLED_FOR_ENTITLEMENT, 'E_COMMAND_DISABLED_FOR_ENTITLEMENT');
  const main = readMain();
  assert.ok(main.includes('E_COMMAND_DISABLED_FOR_ENTITLEMENT'));
});

test('menu surface completeness: every menu-config command is classified by the one table', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'menu', 'menu-config.v2.json'), 'utf8'));
  const ids = new Set();
  (function walk(node) {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        if ((key === 'commandId' || key === 'command') && typeof value === 'string') ids.add(value);
        else walk(value);
      }
    }
  })(cfg);
  assert.equal(ids.size > 0, true, 'zero denominator forbidden');
  for (const id of ids) {
    assert.notEqual(
      law.decideCommandEntitlement(id, law.getProductEntitlementTier()).access,
      'unclassified',
      `menu command must be classified: ${id}`,
    );
  }
});

test('bridge surface completeness: every bridge-admitted command is classified by the one table', () => {
  const main = readMain();
  const start = main.indexOf('const UI_COMMAND_BRIDGE_ALLOWED_COMMAND_IDS = new Set([');
  assert.notEqual(start, -1);
  const end = main.indexOf(']);', start);
  const ids = [...main.slice(start, end).matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.equal(ids.length > 0, true, 'zero denominator forbidden');
  for (const id of ids) {
    assert.notEqual(
      law.decideCommandEntitlement(id, law.getProductEntitlementTier()).access,
      'unclassified',
      `bridge-admitted command must be classified: ${id}`,
    );
  }
});

test('hint parity: the renderer provider mirrors the table decision for the shared corpus', async () => {
  const provider = await import(pathToFileURL(path.join(ROOT, 'src', 'renderer', 'commands', 'localCapabilityProvider.mjs')).href);
  const corpus = [
    ...law.FREE_PRO_COMPLEXITY_COMMAND_IDS,
    ...law.FREE_READ_ONLY_COMMAND_IDS,
    'cmd.project.save',
    'project.create',
    'cmd.ui.fontSize.set',
    'cmd.project.docx.previewContent',
    'cmd.project.releaseClaim.admit',
    'cmd.project.unknown.surface',
    '',
  ];
  for (const tier of ['free', 'pro']) {
    for (const id of corpus) {
      const hint = provider.resolveCommandEntitlement(id, { entitlementTier: tier });
      const port = law.decideCommandEntitlement(id, tier);
      assert.equal(hint.ok, port.ok, `${tier}:${id}`);
      assert.equal(hint.available, port.available, `${tier}:${id}`);
      assert.equal(hint.visible, port.visible, `${tier}:${id}`);
      assert.equal(hint.access, port.access, `${tier}:${id}`);
      assert.equal(hint.reason, port.reason, `${tier}:${id}`);
      assert.equal(hint.commandId, port.commandId, `${tier}:${id}`);
    }
  }
});

test('hint stays hint: renderer normalization of hostile tier values degrades to free, never to authority', async () => {
  const provider = await import(pathToFileURL(path.join(ROOT, 'src', 'renderer', 'commands', 'localCapabilityProvider.mjs')).href);
  for (const hostile of ['enterprise', 'pro-plus', 'unlimited', '1']) {
    const hint = provider.resolveCommandEntitlement('cmd.project.review.switchMode', { entitlementTier: hostile });
    assert.equal(hint.available, false, hostile);
    assert.equal(hint.reason, 'PRO_COMPLEXITY_SURFACE_UNAVAILABLE_IN_FREE', hostile);
  }
});
