'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const f = require('../fixtures/r24-wp708-google-provider-fixtures.js');
const file = path.resolve(__dirname, '../../src/core/google-provider-profile-v1.mjs');

test('WP708 real implementation mutants are killed only by named behavioral assertions', async t => {
  const original = await import(pathToFileURL(file).href), source = fs.readFileSync(file, 'utf8');
  const projection = await f.projectionInput(), apply = f.applyInput();
  const validProjection = api => assert.equal(api.createGoogleProviderProfileProjection(projection).ok, true);
  const cases = [
    ['proxy-before-trap', '!value || nodeTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype', '!value || Object.getPrototypeOf(value) !== Object.prototype', api => { let calls = 0; try { api.evaluateGoogleApplyAdmission(new Proxy(apply, { getPrototypeOf() { calls += 1; throw Error('trap'); } })); } catch {} assert.equal(calls, 0); }],
    ['historical-declared-class', "office.class !== 'DECLARED' || native.class !== 'DECLARED'", "native.class !== 'DECLARED'", api => { const input = f.clone(projection); input.historicalRegistry.profiles.find(x => x.editorMode === 'OFFICE_MODE').class = 'SATURATED'; assert.equal(api.createGoogleProviderProfileProjection(input).ok, false); }],
    ['historical-evidence-empty', 'profile.evidenceHeads.length !== 0 || !Array.isArray(profile.ladder?.completedRungs)', '!Array.isArray(profile.ladder?.completedRungs)', api => { const input = f.clone(projection); input.historicalRegistry.profiles[0].evidenceHeads.push({ path: 'fake' }); assert.equal(api.createGoogleProviderProfileProjection(input).ok, false); }],
    ['owner-status', " || result.status !== 'APPROVED'", '', api => { const input = f.clone(projection); input.ownerDecision.status = 'DENIED'; assert.equal(api.createGoogleProviderProfileProjection(input).ok, false); }],
    ['owner-expiry', 'instant(result.expiresAtUtc).getTime() < instant(nowUtc).getTime()', 'instant(result.expiresAtUtc).getTime() > instant(nowUtc).getTime()', validProjection],
    ['atom-self-digest', "if (atom.atomSha256 !== digest(body)) reject('E_GOOGLE_EVIDENCE_DIGEST');", '', api => { const input = f.clone(projection); input.evidenceAtoms[1].observations.docxExportZip = false; assert.equal(api.createGoogleProviderProfileProjection(input).ok, false); }],
    ['native-export-evidence', '!atom.observations.nativeDocumentReadback || !atom.observations.textExportExact || !atom.observations.docxExportZip', '!atom.observations.nativeDocumentReadback || !atom.observations.docxExportZip', api => { const input = f.clone(projection); input.evidenceAtoms[0] = f.evidenceAtom(api, f.NATIVE, { observations: f.observations({ textExportExact: false }) }); assert.equal(api.createGoogleProviderProfileProjection(input).ok, false); }],
    ['bridge-comment-evidence', '!atom.observations.accountBound || !atom.observations.commentsRoundtrip', '!atom.observations.accountBound', api => { const input = f.clone(projection); input.evidenceAtoms[1] = f.evidenceAtom(api, f.BRIDGE, { observations: f.observations({ commentsRoundtrip: false }) }); assert.equal(api.createGoogleProviderProfileProjection(input).ok, false); }],
    ['cross-profile-claim-id', "if (new Set(atoms.map(atom => atom.atomSha256)).size !== atoms.length || new Set(atoms.map(atom => atom.claimId)).size !== atoms.length) reject('E_GOOGLE_CROSS_PROFILE_INHERITANCE');", '', api => { const input = f.clone(projection); input.evidenceAtoms[1] = f.evidenceAtom(api, f.BRIDGE, { claimId: input.evidenceAtoms[0].claimId }); assert.equal(api.createGoogleProviderProfileProjection(input).ok, false); }],
    ['receipt-binding', "if (native.receiptSha256 !== ownerDecision.lifecycleReceiptSha256 || bridge.receiptSha256 !== ownerDecision.lifecycleReceiptSha256) reject('E_GOOGLE_RECEIPT_BINDING');", '', api => { const input = f.clone(projection); input.evidenceAtoms = [f.evidenceAtom(api, f.NATIVE, { receiptSha256: '1'.repeat(64) }), f.evidenceAtom(api, f.BRIDGE, { receiptSha256: '1'.repeat(64) })]; assert.equal(api.createGoogleProviderProfileProjection(input).ok, false); }],
    ['office-abstain', "profile(GOOGLE_PROVIDER_PROFILE_IDS.OFFICE, 'google-docs', 'OFFICE_MODE', 'NONE', 'ABSTAIN_NO_PHYSICAL_EVIDENCE', null)", "profile(GOOGLE_PROVIDER_PROFILE_IDS.OFFICE, 'google-docs', 'OFFICE_MODE', 'NONE', 'PHYSICAL_PASS_BOUNDED', null)", api => { const r = api.createGoogleProviderProfileProjection(projection); assert.equal(r.ok, true); assert.equal(r.projection.profiles.find(x => x.profileId === f.OFFICE).status, 'ABSTAIN_NO_PHYSICAL_EVIDENCE'); }],
    ['apply-default-deny', "cap.lifecycleStatus !== 'ACTIVE_SYNTHETIC_SINGLE_TARGET'", 'false', api => { const input = f.clone(apply); input.capability.lifecycleStatus = 'GLOBAL'; assert.equal(api.evaluateGoogleApplyAdmission(input).ok, false); }],
    ['apply-profile-isolation', 'if (current.profileId !== intent.profileId)', 'if (false)', api => { const input = f.clone(apply); input.current.profileId = f.BRIDGE; assert.equal(api.evaluateGoogleApplyAdmission(input).ok, false); }],
    ['apply-account-binding', "if (intent.accountIdSha256 !== cap.allowedAccountIdSha256 || intent.accountIdSha256 !== current.accountIdSha256) reject('E_GOOGLE_APPLY_ACCOUNT');", '', api => { const input = f.clone(apply); input.current.accountIdSha256 = '1'.repeat(64); assert.equal(api.evaluateGoogleApplyAdmission(input).ok, false); }],
    ['apply-document-binding', "if (intent.documentIdSha256 !== cap.allowedDocumentIdSha256 || intent.documentIdSha256 !== current.documentIdSha256) reject('E_GOOGLE_APPLY_DOCUMENT');", '', api => { const input = f.clone(apply); input.current.documentIdSha256 = '2'.repeat(64); assert.equal(api.evaluateGoogleApplyAdmission(input).ok, false); }],
    ['apply-identity-generation', ' || intent.generation !== current.generation', '', api => { const input = f.clone(apply); input.current.generation += 1; assert.equal(api.evaluateGoogleApplyAdmission(input).ok, false); }],
    ['apply-stale-revision', "if (intent.requiredRevision !== current.revision) reject('E_GOOGLE_APPLY_STALE_REVISION');", '', api => { const input = f.clone(apply); input.current.revision = 'newer'; assert.equal(api.evaluateGoogleApplyAdmission(input).ok, false); }],
    ['single-synthetic-target', "if (current.activeArtifactCount !== 1 || current.syntheticOnly !== true) reject('E_GOOGLE_APPLY_TARGET_SET');", '', api => { const input = f.clone(apply); input.current.activeArtifactCount = 2; assert.equal(api.evaluateGoogleApplyAdmission(input).ok, false); }],
    ['command-kernel-revalidation', 'requiresCommandKernelRevalidation: true', 'requiresCommandKernelRevalidation: false', api => assert.equal(api.evaluateGoogleApplyAdmission(apply).requiresCommandKernelRevalidation, true)],
  ];
  let killed = 0;
  for (const [name, needle, replacement, behavior] of cases) {
    assert.equal(source.split(needle).length - 1, 1, `${name}: unique mutation anchor`);
    await behavior(original);
    const mutated = source.replace(needle, replacement);
    const api = await import(`data:text/javascript;base64,${Buffer.from(mutated).toString('base64')}#${name}`);
    let failure;
    try { await behavior(api); } catch (error) { failure = error; }
    assert.equal(failure?.code, 'ERR_ASSERTION', `${name}: survived or failed outside behavioral oracle`);
    killed += 1;
  }
  assert.equal(cases.length, 19); assert.equal(killed, 19);
  assert.equal(fs.readFileSync(file, 'utf8'), source);
  t.diagnostic(JSON.stringify({ implementationMutants: cases.length, killed, survivors: 0, syntaxOrImportFailuresCountedAsKills: false }));
});
