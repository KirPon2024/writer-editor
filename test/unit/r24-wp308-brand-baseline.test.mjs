import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const CORE_PATH = path.join(ROOT, 'src', 'core', 'brand-identity-v1.cjs');
const SURFACE_PATH = path.join(ROOT, 'src', 'renderer', 'brandIdentitySurface.mjs');
const require = createRequire(import.meta.url);

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function loadCore(modulePath = CORE_PATH) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('WP308 product identity is exact, first-party, immutable and authority-bounded', () => {
  const core = loadCore();
  const identity = core.BRAND_IDENTITY_V1;
  assert.deepEqual(core.assessBrandIdentity(identity), { ok: true, reasons: [] });
  assert.equal(identity.schemaVersion, 'yalken.brand-identity.v1');
  assert.equal(identity.identityId, 'YALKEN_ORIGINAL_V1');
  assert.equal(identity.name, 'Yalken');
  assert.equal(identity.ownership, 'FIRST_PARTY_ORIGINAL');
  assert.equal(identity.decisionId, 'BRAND_LICENSE_OWNER_CHOICE_WP308_BRAND_BASELINE_V1');
  assert.equal(Object.isFrozen(identity), true);
  assert.equal(Object.isFrozen(identity.scope), true);
  for (const value of Object.values(identity.scope)) assert.equal(value, false);
  assert.equal(identity.accessibility.decorativeMarkAriaHidden, true);
  assert.equal(identity.accessibility.motionRequired, false);
  assert.equal(core.createBrandIdentityRendererProjection().identityId, identity.identityId);
});

test('WP308 rejects identity, license, scope and accessibility widening', () => {
  const core = loadCore();
  const mutations = [
    ['identityId', 'FORGED_IDENTITY'],
    ['name', 'Other'],
    ['ownership', 'THIRD_PARTY'],
    ['decisionId', 'UNBOUND_DECISION'],
  ];
  for (const [field, value] of mutations) {
    const forged = clone(core.BRAND_IDENTITY_V1);
    forged[field] = value;
    assert.equal(core.assessBrandIdentity(forged).ok, false, field);
    assert.throws(() => core.createBrandIdentityRendererProjection(forged), { code: 'E_BRAND_IDENTITY_INVALID' });
  }
  for (const field of Object.keys(core.BRAND_IDENTITY_V1.scope)) {
    const widened = clone(core.BRAND_IDENTITY_V1);
    widened.scope[field] = true;
    assert.equal(core.assessBrandIdentity(widened).ok, false, field);
  }
  const inaccessible = clone(core.BRAND_IDENTITY_V1);
  inaccessible.accessibility.accessibleName = '';
  inaccessible.accessibility.decorativeMarkAriaHidden = false;
  assert.equal(core.assessBrandIdentity(inaccessible).ok, false);
});

test('WP308 token pairs pass exact WCAG contrast policy in light and dark modes', () => {
  const core = loadCore();
  const { accessibility, tokens } = core.BRAND_IDENTITY_V1;
  for (const mode of [tokens.light, tokens.dark]) {
    assert.ok(core.contrastRatio(mode.wordmarkInk, mode.titlebarSurface) >= accessibility.minimumTextContrastRatio);
    assert.ok(core.contrastRatio(mode.markForeground, mode.markBackground) >= accessibility.minimumTextContrastRatio);
    assert.ok(core.contrastRatio(mode.markBackground, mode.titlebarSurface) >= accessibility.minimumNonTextContrastRatio);
    assert.ok(core.contrastRatio(mode.focusRing, mode.titlebarSurface) >= accessibility.minimumNonTextContrastRatio);
  }
});

test('WP308 main binds the Product Core identity to one read-only startup projection', () => {
  const main = read('src/main.js');
  assert.match(main, /createBrandIdentityRendererProjection/u);
  assert.match(main, /const brandIdentity = createBrandIdentityRendererProjection\(\);/u);
  assert.match(main, /BRAND_IDENTITY: brandIdentity\.identityId,/u);
  assert.doesNotMatch(main, /BRAND_IDENTITY: process\.env/u);
});

test('WP308 renderer surface activates only the exact accessible first-party identity', async () => {
  const surface = await import(`${pathToFileURL(SURFACE_PATH).href}?wp308=${Date.now()}`);
  const valid = {
    identityId: 'YALKEN_ORIGINAL_V1',
    name: 'Yalken',
    ownership: 'FIRST_PARTY_ORIGINAL',
    accessibleName: 'Yalken',
    role: 'img',
    markAriaHidden: 'true',
    wordmarkAriaHidden: 'true',
    screenshotCanon: 'false',
    thirdPartyAssetAcquisition: 'false',
  };
  assert.deepEqual(surface.assessBrandIdentitySurface(valid), { ok: true, reason: '' });
  for (const [field, value] of [
    ['identityId', 'FORGED'],
    ['ownership', 'THIRD_PARTY'],
    ['accessibleName', ''],
    ['role', 'presentation'],
    ['markAriaHidden', 'false'],
    ['wordmarkAriaHidden', 'false'],
    ['screenshotCanon', 'true'],
    ['thirdPartyAssetAcquisition', 'true'],
  ]) {
    assert.equal(surface.assessBrandIdentitySurface({ ...valid, [field]: value }).ok, false, field);
  }
});

test('WP308 renderer projection marks exact identity active and stale identity fallback', async () => {
  const surface = await import(`${pathToFileURL(SURFACE_PATH).href}?wp308-activation=${Date.now()}`);
  const root = { dataset: {} };
  const lockup = {
    dataset: {
      brandOwnership: 'FIRST_PARTY_ORIGINAL',
      screenshotCanon: 'false',
      thirdPartyAssetAcquisition: 'false',
    },
    getAttribute: (name) => ({ 'aria-label': 'Yalken', role: 'img' })[name] || '',
    querySelector: (selector) => selector === '[data-brand-mark]'
      ? { getAttribute: () => 'true' }
      : { textContent: 'Yalken', getAttribute: () => 'true' },
  };
  const documentRef = {
    documentElement: root,
    querySelector: () => lockup,
  };
  assert.equal(surface.activateBrandIdentitySurface(documentRef, { search: '?BRAND_IDENTITY=FORGED' }).ok, false);
  assert.equal(root.dataset.brandContract, 'fallback');
  assert.equal(lockup.dataset.brandContract, 'fallback');
  assert.equal(surface.activateBrandIdentitySurface(documentRef, { search: '?BRAND_IDENTITY=YALKEN_ORIGINAL_V1' }).ok, true);
  assert.equal(root.dataset.brandContract, 'active');
  assert.equal(lockup.dataset.brandContract, 'active');
});

test('WP308 visible lockup is tokenized, stable, accessible and asset-independent', () => {
  const html = read('src/renderer/index.html');
  const css = read('src/renderer/styles.css');
  const lockup = html.slice(html.indexOf('<header class="titlebar">'), html.indexOf('</header>') + '</header>'.length);
  const styleStart = css.indexOf('.brand-lockup {');
  const styleEnd = css.indexOf('.work-bar {');
  const brandStyles = css.slice(styleStart, styleEnd);

  for (const token of [
    'data-brand-identity="YALKEN_ORIGINAL_V1"',
    'data-brand-ownership="FIRST_PARTY_ORIGINAL"',
    'data-screenshot-canon="false"',
    'data-third-party-asset-acquisition="false"',
    'role="img"',
    'aria-label="Yalken"',
    'data-brand-mark',
    'aria-hidden="true"',
    'focusable="false"',
    'viewBox="0 0 18 18"',
    'brand-lockup__page',
    'brand-lockup__accent',
    'data-brand-wordmark aria-hidden="true"',
  ]) assert.equal(lockup.includes(token), true, token);
  assert.doesNotMatch(lockup, /(?:href|src)=/u);
  for (const token of [
    '--brand-titlebar-height: 28px;',
    '--brand-mark-size: 18px;',
    '--brand-mark-radius: 4px;',
    '--brand-wordmark-size: 13px;',
    '--brand-titlebar-surface: #f8f5ef;',
    '--brand-wordmark-ink: #173b34;',
    '--brand-mark-accent: #b74636;',
    '@media (forced-colors: active)',
  ]) assert.equal(css.includes(token), true, token);
  assert.match(html, /<script type="module" src="\.\/brandIdentitySurface\.mjs"><\/script>/u);
  assert.match(brandStyles, /\.brand-lockup\[data-brand-contract="fallback"\]\s*\{\s*visibility: hidden;/u);
  assert.doesNotMatch(lockup, /<img|\.png|\.svg|style=/u);
  assert.doesNotMatch(brandStyles, /url\(|logo\.png|animation:|transition:/u);
});

test('WP308 brand surface adds no input, persistence, network, timer or mutation authority', () => {
  const source = read('src/renderer/brandIdentitySurface.mjs');
  for (const forbidden of [
    'addEventListener',
    'MutationObserver',
    'requestAnimationFrame',
    'setTimeout',
    'fetch(',
    'XMLHttpRequest',
    'localStorage',
    'sessionStorage',
    'indexedDB',
    'ipcRenderer',
    'electronAPI',
  ]) assert.equal(source.includes(forbidden), false, forbidden);
  const composedText = 'Yalken English אבג العربية İß e\u0301 👩🏽‍💻';
  assert.equal(composedText.normalize('NFC').startsWith('Yalken '), true);
});

test('WP308 independent oracles kill authority, identity and accessibility mutants', (t) => {
  const source = fs.readFileSync(CORE_PATH, 'utf8');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-wp308-mutants-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const mutants = [
    {
      id: 'third-party-ownership',
      transform: (value) => value.replace('  ownership: BRAND_OWNERSHIP_FIRST_PARTY_ORIGINAL,', "  ownership: 'THIRD_PARTY',"),
      oracle: (core) => assert.equal(core.assessBrandIdentity(core.BRAND_IDENTITY_V1).ok, true),
    },
    {
      id: 'screenshot-canon',
      transform: (value) => value.replace('    screenshotCanon: false,', '    screenshotCanon: true,'),
      oracle: (core) => assert.equal(core.assessBrandIdentity(core.BRAND_IDENTITY_V1).ok, true),
    },
    {
      id: 'third-party-assets',
      transform: (value) => value.replace('    thirdPartyAssetAcquisition: false,', '    thirdPartyAssetAcquisition: true,'),
      oracle: (core) => assert.equal(core.assessBrandIdentity(core.BRAND_IDENTITY_V1).ok, true),
    },
    {
      id: 'missing-accessible-name',
      transform: (value) => value.replace("    accessibleName: 'Yalken',", "    accessibleName: '',"),
      oracle: (core) => assert.equal(core.assessBrandIdentity(core.BRAND_IDENTITY_V1).ok, true),
    },
    {
      id: 'decorative-mark-exposed',
      transform: (value) => value.replace('    decorativeMarkAriaHidden: true,', '    decorativeMarkAriaHidden: false,'),
      oracle: (core) => assert.equal(core.assessBrandIdentity(core.BRAND_IDENTITY_V1).ok, true),
    },
    {
      id: 'contrast-policy-weakened',
      transform: (value) => value.replace('    minimumTextContrastRatio: 4.5,', '    minimumTextContrastRatio: 1,'),
      oracle: (core) => assert.equal(core.assessBrandIdentity(core.BRAND_IDENTITY_V1).ok, true),
    },
    {
      id: 'release-authority-widened',
      transform: (value) => value.replace('    release: false,', '    release: true,'),
      oracle: (core) => assert.equal(core.assessBrandIdentity(core.BRAND_IDENTITY_V1).ok, true),
    },
  ];

  let killed = 0;
  for (const mutant of mutants) {
    const transformed = mutant.transform(source);
    assert.notEqual(transformed, source, `missing mutation target: ${mutant.id}`);
    const mutantPath = path.join(tempRoot, `${mutant.id}.cjs`);
    fs.writeFileSync(mutantPath, transformed, 'utf8');
    const core = loadCore(mutantPath);
    try {
      mutant.oracle(core);
    } catch {
      killed += 1;
    }
  }
  assert.equal(killed, mutants.length);
  console.log(`R24_WP308_IMPLEMENTATION_MUTANTS=${killed}/${mutants.length}`);
});
