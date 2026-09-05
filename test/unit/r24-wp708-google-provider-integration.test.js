'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const f = require('../fixtures/r24-wp708-google-provider-fixtures.js');
const load = () => import('../../src/core/google-provider-profile-v1.mjs');
const root = path.resolve(__dirname, '../..');
const shaFile = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('WP708 real historical registry stays DECLARED while current projection adds bounded independent evidence', async () => {
  const api = await load(), oldApi = await import('../../scripts/ops/rtk-google-build-profiles-v1.mjs');
  const registry = f.historicalRegistry(), before = JSON.stringify(registry);
  const loaded = oldApi.loadGoogleBuildProfileRegistry(registry); assert.equal(loaded.ok, true);
  assert.equal(oldApi.evaluateRegistryReconciliation(registry).ok, true);
  for (const profile of registry.profiles) { assert.equal(profile.class, 'DECLARED'); assert.equal(profile.evidenceHeads.length, 0); assert.equal(profile.ladder.completedRungs.length, 0); }
  const input = await f.projectionInput({ historicalRegistry: registry });
  const result = api.createGoogleProviderProfileProjection(input); assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(JSON.stringify(registry), before);
  assert.equal(result.projection.ownerGate.registryDigest, f.REGISTRY);
  assert.equal(result.projection.ownerGate.decisionDigest, f.DECISION);
  assert.equal(result.projection.ownerGate.lifecycleReceiptSha256, f.RECEIPT);
  assert.equal(result.projection.claimCeiling, 'WP708_EXACT_SYNTHETIC_NATIVE_AND_BRIDGE_ONLY');
});

test('WP708 repository carriers bind actual owner decision and cleaned physical receipt without raw identifiers', async () => {
  const decisionPath = path.join(root, 'docs/OPS/R24/CORRECTIVE/WP708_GOOGLE_EGRESS_APPLY_OWNER_DECISION_V1.json');
  const physicalPath = path.join(root, 'docs/OPS/R24/CORRECTIVE/WP708_GOOGLE_PROVIDER_PHYSICAL_RECEIPT_V1.json');
  const authorityPath = path.join(root, 'docs/OPS/R24/CORRECTIVE/WP708_MAIN_PRODUCT_OWNER_AUTHORITY_V1.json');
  const admissionPath = path.join(root, 'docs/OPS/R24/CORRECTIVE/WP708_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V1.json');
  assert.equal(shaFile(decisionPath), f.DECISION);
  const decision = JSON.parse(fs.readFileSync(decisionPath, 'utf8'));
  const physical = JSON.parse(fs.readFileSync(physicalPath, 'utf8'));
  const authority = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
  const admission = JSON.parse(fs.readFileSync(admissionPath, 'utf8'));
  assert.equal(decision.gateId, 'GOOGLE_EGRESS_APPLY_ADR'); assert.equal(decision.status, 'APPROVED');
  assert.equal(decision.registryBinding.registeredStatePreserved, 'UNRESOLVED_SAFE_DEFAULT_DENY');
  assert.equal(decision.consumption.gate05PhysicalReceiptSha256, f.RECEIPT);
  assert.equal(decision.consumption.providerArtifactsRemaining, 0);
  assert.equal(physical.externalGate05ReceiptSha256, f.RECEIPT);
  assert.equal(physical.cleanup.cleanupVerified, true); assert.equal(physical.cleanup.providerArtifactsRemaining, 0);
  assert.equal(physical.profileClaims.office, 'ABSTAIN_NO_PHYSICAL_PASS_NO_INHERITANCE');
  assert.equal(physical.profileClaims.productRuntimeAutomaticApply, false);
  assert.equal(authority.ownerAuthorityBindingDigest, f.DECISION);
  assert.equal(admission.ownerAuthorityBindingDigest, f.DECISION);
  for (const bytes of [fs.readFileSync(decisionPath, 'utf8'), fs.readFileSync(physicalPath, 'utf8')]) {
    assert.equal(bytes.includes('1bzSzXOQ'), false); assert.equal(bytes.includes('sediment://'), false);
  }
});

test('WP708 Native and Bridge require their own current apply admission while Office always denies', async () => {
  const api = await load();
  const native = api.evaluateGoogleApplyAdmission(f.applyInput()); assert.equal(native.ok, true);
  const bridgeInput = f.applyInput(); bridgeInput.intent.profileId = f.BRIDGE; bridgeInput.current.profileId = f.BRIDGE;
  const bridge = api.evaluateGoogleApplyAdmission(bridgeInput); assert.equal(bridge.ok, true);
  assert.notEqual(native.decisionDigest, bridge.decisionDigest);
  const officeInput = f.applyInput(); officeInput.intent.profileId = f.OFFICE; officeInput.current.profileId = f.OFFICE;
  const office = api.evaluateGoogleApplyAdmission(officeInput); assert.equal(office.ok, false); assert.equal(office.code, 'E_GOOGLE_OFFICE_APPLY_DENY');
  const inherited = f.applyInput(); inherited.intent.profileId = f.BRIDGE;
  assert.equal(api.evaluateGoogleApplyAdmission(inherited).code, 'E_GOOGLE_APPLY_PROFILE');
});

test('WP708 projection and apply decisions are deterministic across locale and timezone processes', async t => {
  const code = "const f=require('./test/fixtures/r24-wp708-google-provider-fixtures.js');(async()=>{const a=await import('./src/core/google-provider-profile-v1.mjs');const i=await f.projectionInput();const p=a.createGoogleProviderProfileProjection(i);const d=a.evaluateGoogleApplyAdmission(f.applyInput());if(!p.ok||!d.ok)throw Error(JSON.stringify({p,d}));console.log(p.projection.projectionDigest+':'+d.decisionDigest)})();";
  const results = [];
  for (const TZ of ['UTC', 'Pacific/Honolulu', 'Asia/Tokyo']) for (const LANG of ['C', 'en_US.UTF-8', 'tr_TR.UTF-8']) {
    results.push(execFileSync(process.execPath, ['-e', code], { cwd: root, env: { ...process.env, TZ, LANG }, encoding: 'utf8', timeout: 15_000 }).trim());
  }
  assert.equal(new Set(results).size, 1);
  t.diagnostic(JSON.stringify({ processDenominator: results.length, uniqueDigestPairs: 1 }));
});

test('WP708 bounded evaluator has nonzero measured throughput and no product provider or network writer', async t => {
  const api = await load(), input = await f.projectionInput(), start = performance.now(); let last;
  for (let index = 0; index < 128; index += 1) { last = api.createGoogleProviderProfileProjection(input); assert.equal(last.ok, true); assert.equal(api.verifyGoogleProviderProfileProjection({ ...input, projection: last.projection }).ok, true); }
  const elapsedMs = performance.now() - start; assert(elapsedMs < 10_000);
  const source = fs.readFileSync(path.join(root, 'src/core/google-provider-profile-v1.mjs'), 'utf8');
  for (const forbidden of ['node:fs', 'child_process', 'fetch(', 'https.request', 'http.request', 'electron', 'ipcRenderer', 'projectStore', 'commandKernel.dispatch']) assert.equal(source.includes(forbidden), false, forbidden);
  assert.equal(last.projection.productMutationAuthority, false); assert.equal(last.projection.providerEffectAuthority, false); assert.equal(last.projection.runtimeNetworkAuthority, false);
  t.diagnostic(JSON.stringify({ projectionAndReplayPairs: 128, elapsedMs, synchronousPureQuery: true }));
});
