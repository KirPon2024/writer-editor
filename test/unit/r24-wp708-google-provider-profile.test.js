'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const f = require('../fixtures/r24-wp708-google-provider-fixtures.js');
const load = () => import('../../src/core/google-provider-profile-v1.mjs');

test('WP708 projects exactly three independent Native Office and Bridge profiles', async () => {
  const api = await load(), input = await f.projectionInput(), before = JSON.stringify(input);
  const result = api.createGoogleProviderProfileProjection(input);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.projection.schemaVersion, api.GOOGLE_PROVIDER_PROFILE_SCHEMA_VERSION);
  assert.equal(result.projection.profiles.length, 3);
  const native = result.projection.profiles.find(profile => profile.profileId === f.NATIVE);
  const office = result.projection.profiles.find(profile => profile.profileId === f.OFFICE);
  const bridge = result.projection.profiles.find(profile => profile.profileId === f.BRIDGE);
  assert.equal(native.status, 'PHYSICAL_PASS_BOUNDED');
  assert.equal(bridge.status, 'PHYSICAL_PASS_BOUNDED');
  assert.equal(office.status, 'ABSTAIN_NO_PHYSICAL_EVIDENCE');
  assert.equal(native.physicalClaim, true); assert.equal(bridge.physicalClaim, true); assert.equal(office.physicalClaim, false);
  assert.notEqual(native.evidenceAtomSha256, bridge.evidenceAtomSha256);
  assert.equal(office.evidenceAtomSha256, null); assert.equal(office.physicalReceiptSha256, null);
  for (const profile of result.projection.profiles) assert.equal(profile.applyDefault, 'DENY');
  assert.equal(result.projection.productMutationAuthority, false);
  assert.equal(result.projection.providerEffectAuthority, false);
  assert.equal(result.projection.runtimeNetworkAuthority, false);
  assert(Object.isFrozen(result.projection)); assert(Object.isFrozen(result.projection.profiles[0]));
  assert.equal(JSON.stringify(input), before);
  assert.equal(api.verifyGoogleProviderProfileProjection({ ...input, projection: result.projection }).ok, true);
});

test('WP708 evidence atoms are self-digesting and cannot cross profiles', async t => {
  const api = await load(), valid = await f.projectionInput();
  const cases = [
    ['one atom', input => { input.evidenceAtoms.pop(); }, 'E_GOOGLE_EVIDENCE_DENOMINATOR'],
    ['duplicate Native profile', input => { input.evidenceAtoms[1] = f.evidenceAtom(api, f.NATIVE, { claimId: 'OTHER_NATIVE' }); }, 'E_GOOGLE_EVIDENCE_DENOMINATOR'],
    ['shared claim id', input => { input.evidenceAtoms[1] = f.evidenceAtom(api, f.BRIDGE, { claimId: input.evidenceAtoms[0].claimId }); }, 'E_GOOGLE_CROSS_PROFILE_INHERITANCE'],
    ['shared atom digest', input => { input.evidenceAtoms[1].atomSha256 = input.evidenceAtoms[0].atomSha256; }, 'E_GOOGLE_EVIDENCE_DIGEST'],
    ['tampered observation', input => { input.evidenceAtoms[0].observations.staleRevisionRejected = false; }, 'E_GOOGLE_EVIDENCE_DIGEST'],
    ['wrong receipt', input => { input.evidenceAtoms[0] = f.evidenceAtom(api, f.NATIVE, { receiptSha256: '1'.repeat(64) }); }, 'E_GOOGLE_RECEIPT_BINDING'],
    ['office evidence', input => { input.evidenceAtoms[0] = f.evidenceAtom(api, f.OFFICE); }, 'E_GOOGLE_OFFICE_PHYSICAL_FORBIDDEN'],
    ['native export incomplete', input => { input.evidenceAtoms[0] = f.evidenceAtom(api, f.NATIVE, { observations: f.observations({ textExportExact: false }) }); }, 'E_GOOGLE_NATIVE_EVIDENCE_INCOMPLETE'],
    ['bridge comment incomplete', input => { input.evidenceAtoms[1] = f.evidenceAtom(api, f.BRIDGE, { observations: f.observations({ commentsRoundtrip: false }) }); }, 'E_GOOGLE_BRIDGE_EVIDENCE_INCOMPLETE'],
  ];
  for (const [name, mutate, code] of cases) {
    const input = f.clone(valid); mutate(input); const result = api.createGoogleProviderProfileProjection(input);
    assert.equal(result.ok, false, name); assert.equal(result.code, code, name); assert.equal(result.projectionPublished, false, name);
  }
  t.diagnostic(JSON.stringify({ evidenceIsolationCases: cases.length, rejected: cases.length }));
});

test('WP708 historical DECLARED profiles remain immutable non-evidence and cannot seed current green', async () => {
  const api = await load(), valid = await f.projectionInput();
  for (const mutate of [
    registry => { registry.profiles[0].class = 'SATURATED'; },
    registry => { registry.profiles[0].evidenceHeads.push({ path: 'fake' }); },
    registry => { registry.profiles[1].ladder.completedRungs.push('CARRIER_SURVIVAL_SMOKE'); },
    registry => { registry.profiles.pop(); },
    registry => { registry.profiles.reverse(); registry.profiles[0].profileId = 'foreign'; },
  ]) {
    const input = f.clone(valid); mutate(input.historicalRegistry); const result = api.createGoogleProviderProfileProjection(input);
    assert.equal(result.ok, false); assert.match(result.code, /^E_GOOGLE_HISTORICAL_/u);
  }
});

test('WP708 owner gate requires exact registered scope active decision receipt and expiry', async () => {
  const api = await load(), valid = await f.projectionInput();
  const cases = [
    ['status', 'DENIED', 'E_GOOGLE_OWNER_GATE_DENY'],
    ['gateId', 'OTHER', 'E_GOOGLE_OWNER_GATE_DENY'],
    ['scope', 'WP-709_MIXED_CHAINS', 'E_GOOGLE_OWNER_GATE_DENY'],
    ['expiresAtUtc', '2026-09-05T21:59:59Z', 'E_GOOGLE_OWNER_GATE_EXPIRED'],
    ['decisionDigest', 'not-a-digest', 'E_GOOGLE_SHA256'],
    ['lifecycleReceiptSha256', '2'.repeat(64), 'E_GOOGLE_RECEIPT_BINDING'],
  ];
  for (const [field, value, code] of cases) {
    const input = f.clone(valid); input.ownerDecision[field] = value; const result = api.createGoogleProviderProfileProjection(input);
    assert.equal(result.ok, false, field); assert.equal(result.code, code, field);
  }
});

test('WP708 apply is deny by default and only an exact live synthetic target becomes eligible', async () => {
  const api = await load(), valid = f.applyInput();
  const result = api.evaluateGoogleApplyAdmission(valid);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.status, 'ELIGIBLE_REQUIRES_COMMAND_KERNEL_REVALIDATION');
  assert.equal(result.effectEligible, true);
  assert.equal(result.requiresCommandKernelRevalidation, true);
  assert.equal(result.productMutationAuthority, false);
  assert.equal(result.providerEffectAuthority, false);
  assert.match(result.decisionDigest, /^[0-9a-f]{64}$/u);
  assert.deepEqual(result, api.evaluateGoogleApplyAdmission(f.clone(valid)));
});

test('WP708 every apply capability identity revision and target-set conjunct rejects independently', async t => {
  const api = await load(), valid = f.applyInput();
  const cases = [
    ['missing top-level', input => { delete input.capability; }, 'E_GOOGLE_OBJECT_KEYS'],
    ['unknown field', input => { input.autoApply = true; }, 'E_GOOGLE_OBJECT_KEYS'],
    ['denied gate', input => { input.capability.status = 'DENIED'; }, 'E_GOOGLE_APPLY_DEFAULT_DENY'],
    ['wrong gate', input => { input.capability.gateId = 'OTHER'; }, 'E_GOOGLE_APPLY_DEFAULT_DENY'],
    ['wrong scope', input => { input.capability.scope = 'GLOBAL'; }, 'E_GOOGLE_APPLY_DEFAULT_DENY'],
    ['wrong effect', input => { input.capability.effect = 'AUTO_APPLY'; }, 'E_GOOGLE_APPLY_DEFAULT_DENY'],
    ['expired', input => { input.current.nowUtc = '2026-09-07T00:00:00Z'; }, 'E_GOOGLE_APPLY_EXPIRED'],
    ['office intent', input => { input.intent.profileId = f.OFFICE; input.current.profileId = f.OFFICE; }, 'E_GOOGLE_OFFICE_APPLY_DENY'],
    ['profile set', input => { input.capability.allowedProfileIds.reverse(); }, 'E_GOOGLE_APPLY_PROFILE'],
    ['current profile', input => { input.current.profileId = f.BRIDGE; }, 'E_GOOGLE_APPLY_PROFILE'],
    ['account', input => { input.current.accountIdSha256 = '1'.repeat(64); }, 'E_GOOGLE_APPLY_ACCOUNT'],
    ['document', input => { input.current.documentIdSha256 = '2'.repeat(64); }, 'E_GOOGLE_APPLY_DOCUMENT'],
    ['project', input => { input.current.projectId = 'foreign'; }, 'E_GOOGLE_APPLY_IDENTITY'],
    ['entity', input => { input.current.entityId = 'foreign'; }, 'E_GOOGLE_APPLY_IDENTITY'],
    ['source revision', input => { input.current.sourceRevision = 'stale'; }, 'E_GOOGLE_APPLY_IDENTITY'],
    ['generation', input => { input.current.generation += 1; }, 'E_GOOGLE_APPLY_IDENTITY'],
    ['docs revision', input => { input.current.revision = 'newer'; }, 'E_GOOGLE_APPLY_STALE_REVISION'],
    ['two artifacts', input => { input.current.activeArtifactCount = 2; }, 'E_GOOGLE_APPLY_TARGET_SET'],
    ['not synthetic', input => { input.current.syntheticOnly = false; }, 'E_GOOGLE_APPLY_TARGET_SET'],
  ];
  for (const [name, mutate, code] of cases) {
    const input = f.clone(valid); mutate(input); const result = api.evaluateGoogleApplyAdmission(input);
    assert.equal(result.ok, false, name); assert.equal(result.code, code, name); assert.equal(result.effectEligible, false, name); assert.equal(result.providerEffectAuthority, false, name);
  }
  t.diagnostic(JSON.stringify({ applyNegativeConjunctDenominator: cases.length, rejected: cases.length }));
});

test('WP708 accessors proxies sparse arrays and executable values are denied without invocation', async () => {
  const api = await load(), valid = f.applyInput(), projection = await f.projectionInput(); let invoked = 0;
  const accessor = f.applyInput(); Object.defineProperty(accessor, 'capability', { enumerable: true, get() { invoked += 1; return valid.capability; } });
  assert.equal(api.evaluateGoogleApplyAdmission(accessor).ok, false);
  assert.equal(api.evaluateGoogleApplyAdmission(new Proxy(valid, { getPrototypeOf() { invoked += 1; throw Error('trap'); } })).ok, false);
  const sparse = await f.projectionInput(); delete sparse.evidenceAtoms[0]; assert.equal(api.createGoogleProviderProfileProjection(sparse).ok, false);
  for (const bad of [() => {}, Symbol('x'), new Date(), { x: NaN }, { x: -0 }, JSON.parse('{"__proto__":1}')]) {
    const input = f.clone(projection); input.historicalRegistry = bad; assert.equal(api.createGoogleProviderProfileProjection(input).ok, false);
  }
  assert.equal(invoked, 0);
});

test('WP708 replay verification rejects every authority or profile overclaim', async () => {
  const api = await load(), input = await f.projectionInput(), made = api.createGoogleProviderProfileProjection(input); assert.equal(made.ok, true);
  const mutations = [
    value => { value.projectionDigest = '0'.repeat(64); },
    value => { value.productMutationAuthority = true; },
    value => { value.providerEffectAuthority = true; },
    value => { value.runtimeNetworkAuthority = true; },
    value => { value.profiles[0].status = 'GLOBAL_PASS'; },
    value => { value.profiles[1].status = 'PHYSICAL_PASS_BOUNDED'; },
    value => { value.profiles[1].physicalClaim = true; },
    value => { value.profiles[2].evidenceAtomSha256 = value.profiles[0].evidenceAtomSha256; },
    value => { value.evidenceAtomDenominator = 3; },
    value => { value.identity.generation += 1; },
  ];
  for (const mutate of mutations) {
    const projection = f.clone(made.projection); mutate(projection);
    const result = api.verifyGoogleProviderProfileProjection({ ...input, projection });
    assert.equal(result.ok, false); assert.equal(result.code, 'E_GOOGLE_PROJECTION_REPLAY');
  }
});
