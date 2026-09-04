import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { buildClaimBinding } from '../../scripts/ops/r24/claim-binding.mjs';
import { canonicalDigest } from '../../scripts/ops/r24/canonical-json.mjs';
import { HISTORICAL_INVENTORY_CLAIM_PINS_V13 } from '../../scripts/ops/r24/docs-claim-lint.mjs';
const C = 'docs/OPS/R24/CORRECTIVE/';
const h = b => crypto.createHash('sha256').update(b).digest('hex');
const read = p => JSON.parse(fs.readFileSync(p));
const names = ['MAIN_PRODUCT_OWNER_AUTHORITY','MAIN_PRODUCT_STAGE_INSTANCE','MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION','PROTECTED_WIP_BEFORE','WP802_TERMINAL_PREDECESSOR','DESCRIPTIVE_HISTORY_CONTRACT','FEATURE_INTEGRATION_MANIFEST','EFFECTIVE_GRAPH_BASELINE','CARRIER_REGISTRY','ACCEPTANCE_MATRIX','EFFECTIVE_STATE','STAGE_REGISTRY','LEASE_RELEASE','TERMINAL_RECEIPT'];
const load = () => Object.fromEntries(names.map(n => [n, read(C + 'WP803_' + n + '_V1.json')]));
const counts = states => Object.fromEntries(['BLOCKED_TYPED','DONE','INELIGIBLE_OPTIONAL','PENDING'].map(s => [s, Object.values(states).filter(x => x === s).length]));
function verify(v) {
  const i=v.MAIN_PRODUCT_STAGE_INSTANCE, a=v.MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION, b=v.PROTECTED_WIP_BEFORE, graph=v.EFFECTIVE_GRAPH_BASELINE, c=v.DESCRIPTIVE_HISTORY_CONTRACT;
  assert.equal(h(fs.readFileSync(C+'WP803_MAIN_PRODUCT_OWNER_AUTHORITY_V1.json')), '755977cd16f2a7147af0ec9ffcf6bac7e662f3c05467bc3e2e7578a5fec45d5e');
  assert.equal(h(fs.readFileSync(C+'WP803_MAIN_PRODUCT_STAGE_INSTANCE_V1.json')), '13ced3a4ecf77b4a3c6097d7b5a0703c0bec46f35980677a8c27c15705b6ac9b');
  assert.equal(h(fs.readFileSync(C+'WP803_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V1.json')), '99f4b8cd0fe14f3684629095687a56cff3812d1714a53775d72b17fd90e53bab');
  assert.equal(a.writeSetDigest,'08b9dbf8b7235528823b80256776829bd13c5fac1b4ca92014de839ca3407ff4');
  assert.deepEqual(i.lease,{fencingCounter:94,status:'ACTIVE',wip:1,predecessorReleaseDigest:'969e591fae0d6e14cf6ec15e1986f21dfcfb4182210712979260baea2f373741'});
  const {snapshotSha256,...payload}=b; assert.equal(h(Buffer.from(JSON.stringify(payload)+'\n')),snapshotSha256); assert.equal(snapshotSha256,'a3eb12862e4fb270e575343d58c039eaefd3802182bdbcb6e4e6c4355f4418d0');
  assert.equal(b.completeDenominator,288); assert.equal(b.entries.length,288); assert.equal(b.dirtyDenominator,10);
  assert.equal(v.WP802_TERMINAL_PREDECESSOR.predecessorStageId,'WP-802_PULSE_FORMULAS'); assert.equal(v.WP802_TERMINAL_PREDECESSOR.predecessorWip,0);
  assert.equal(c.input.maximumEntries,4096); assert.equal(c.historyVersion,'PULSE_DESCRIPTIVE_HISTORY_V1');
  assert.equal(c.semantics.absent,'NOT_RECORDED_NEVER_ZERO'); assert.equal(c.declarations.noFreeTextOrPersonalIdentity,true); assert.equal(c.projection.currentIdentityRequired,true);
  assert.equal(v.FEATURE_INTEGRATION_MANIFEST.runtimeNetwork,false); assert.equal(v.FEATURE_INTEGRATION_MANIFEST.interfacePlane.designOs,'NOT_APPLICABLE_NO_UI');
  assert.equal(graph.statesDigest,canonicalDigest(graph.states)); assert.deepEqual(counts(graph.states),{BLOCKED_TYPED:3,DONE:81,INELIGIBLE_OPTIONAL:10,PENDING:15});
  assert.deepEqual(v.EFFECTIVE_STATE.targetStates,{...graph.states,'WP-803_DESCRIPTIVE_HISTORY':'DONE'}); assert.deepEqual(v.EFFECTIVE_STATE.targetCounts,{BLOCKED_TYPED:3,DONE:82,INELIGIBLE_OPTIONAL:10,PENDING:14});
  const admitted=[...i.operations.modifyPaths,...i.operations.createPaths].sort();const r=v.CARRIER_REGISTRY;
  assert.deepEqual([...r.carriers.map(x=>x.path),...r.excludedDependentCarriers].sort(),admitted);assert.equal(admitted.length,37);assert.equal(r.carrierDenominator,29);assert.equal(r.currentTreeFallbackAllowed,false);
  for(const x of r.carriers){const bytes=fs.readFileSync(x.path);assert.equal(h(bytes),x.sha256,x.path);assert.equal(bytes.length,x.byteLength);}
  const acceptance=v.ACCEPTANCE_MATRIX;assert.equal(acceptance.denominator,29);assert.equal(acceptance.rows.filter(x=>x.status==='PASS').length,22);assert.equal(acceptance.rows.filter(x=>x.status==='REQUIRED_NOT_PRECLAIMED').length,7);
  assert.equal(v.TERMINAL_RECEIPT.status,'CONDITIONAL_DONE_PENDING_REQUIRED_LOCAL_AND_EXTERNAL_PREDICATES');assert.equal(v.TERMINAL_RECEIPT.activationOutcome.doneCount,82);assert.equal(v.LEASE_RELEASE.currentLease.status,'ACTIVE');assert.equal(v.LEASE_RELEASE.targetLease.wip,0);
  for(const [field,n] of [['leaseReleaseDigest','LEASE_RELEASE'],['acceptanceMatrixDigest','ACCEPTANCE_MATRIX'],['effectiveStateDigest','EFFECTIVE_STATE'],['stageRegistryDigest','STAGE_REGISTRY']])assert.equal(v.TERMINAL_RECEIPT.bindings[field],h(fs.readFileSync(C+'WP803_'+n+'_V1.json')));
  for(const x of Object.values(v))if(Object.hasOwn(x,'programDone'))assert.equal(x.programDone,false);
}
test('WP803 carriers bind exact admission, history semantics, bytes and conditional release',()=>{verify(load());const claim=buildClaimBinding(read('docs/OPS/R24/EVIDENCE/ES-R24-WP-803-DESCRIPTIVE-HISTORY-CLAIM-BINDINGS.json'));for(const b of claim.claimBindings)assert.equal(h(fs.readFileSync(b.filePath)),b.sha256);assert.equal(HISTORICAL_INVENTORY_CLAIM_PINS_V13.at(-1).evaluationSha,'e62310f3e958db6d86a7f71d4a310c2bc65461ce');});
test('WP803 evidence carries 23 executed tests and 10 actual implementation mutants',()=>{
  for(const kind of ['MODEL','CONTRACT','INTEGRATION','MUTANTS']){const e=read('docs/OPS/R24/EVIDENCE/ES-R24-WP-803-DESCRIPTIVE-HISTORY-'+kind+'.json');const raw=e.artifact.rawEvidence,b=Buffer.from(raw.stdoutBase64,'base64');assert.equal(b.length,raw.byteLength);assert.equal(h(b),raw.sha256);assert.match(b.toString(),/\n1\.\.23\n# tests 23\n# suites 0\n# pass 23\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n/u);assert.equal(raw.processExitCode,0);for(const x of e.artifact.implementationArtifacts)assert.equal(h(fs.readFileSync(x.path)),x.sha256);if(kind==='MUTANTS'){assert.equal(e.test.denominator,10);assert.equal(e.claim.actualSourceMutations,true);assert.equal((b.toString().match(/^ok \d+ - WP803 kills implementation mutant:/gm)||[]).length,10);}}
});
test('WP803 carriers reject false zero, phase inference, graph overclaim and false release',()=>{
  for(const mutate of [v=>{v.DESCRIPTIVE_HISTORY_CONTRACT.semantics.absent='ZERO';},v=>{v.DESCRIPTIVE_HISTORY_CONTRACT.declarations.noFreeTextOrPersonalIdentity=false;},v=>{v.EFFECTIVE_GRAPH_BASELINE.states['WP-803_DESCRIPTIVE_HISTORY']='DONE';},v=>{v.EFFECTIVE_STATE.targetCounts.DONE=83;},v=>{v.CARRIER_REGISTRY.currentTreeFallbackAllowed=true;},v=>{v.LEASE_RELEASE.targetLease.wip=1;},v=>{v.TERMINAL_RECEIPT.status='CERTIFIED_DONE';},v=>{v.TERMINAL_RECEIPT.programDone=true;}]){const v=structuredClone(load());mutate(v);assert.throws(()=>verify(v));}
});
