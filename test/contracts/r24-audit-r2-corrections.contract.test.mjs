import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { canonicalBytes } from '../../scripts/ops/r24/corrective/canonical-json.mjs';
import { buildRemoteTerminalExpected, checkCorrections } from '../../scripts/ops/r24/corrective/audit-r2-corrections.mjs';

const load=(path)=>JSON.parse(fs.readFileSync(path,'utf8'));
const hash=(bytes)=>crypto.createHash('sha256').update(bytes).digest('hex');
test('remote terminal wrapper binds the verifier tree field exactly',()=>{
  const expected=buildRemoteTerminalExpected({artifactId:'42',artifactName:'audit-r2-terminal-7',runId:'7',zipDigest:'3'.repeat(64),evaluationSha:'1'.repeat(40),evaluationTree:'2'.repeat(40)});
  assert.deepEqual(expected,{artifactId:'42',artifactName:'audit-r2-terminal-7',runId:'7',zipDigest:'3'.repeat(64),evaluationSha:'1'.repeat(40),evaluationTreeSha:'2'.repeat(40)});
  assert.equal(Object.hasOwn(expected,'evaluationTree'),false);
});
test('all eight correction carriers pass the static exact-byte check',()=>{
  const result=checkCorrections();
  assert.equal(result.status,'PASS');
  assert.equal(result.registeredStages,33);
  assert.equal(result.programDoneClaimed,false);
  assert.equal(result.wp400MutationStarted,false);
});
test('six fixed historical authority sources remain byte-identical',()=>{
  const fixed=[
    ['docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json','6c833c964318da3e61e1743365f8763206be838647b5222c187b3bda8d1c6b9a'],
    ['docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json','c8af046b5918f43a50af66886b0b5c9d2e22ea6501240d4b239101d8836ced1a'],
    ['docs/OPS/R24/CORRECTIVE/TERMINAL_ATTESTATION_TRUST_MODEL_V1.json','4f6e4b3a191e0302ea44646659e8c2f71121af7d808cc0ee768269b4e156840d'],
    ['scripts/ops/r24/corrective/stage-admission-verifier.mjs','82e49d577b79b41b26b67e25b7ce0fd81f26fb973232194fef8d96d6c563c6f9'],
    ['docs/OPS/R24/CORRECTIVE/STANDING_AUTHORITY_BINDING_V1.json','be68bd97021d13fbfb75c73791bda7f6bfeebecebf525d4a927d1a4c9fe9efd6'],
  ];
  for(const [path,digest] of fixed) assert.equal(hash(fs.readFileSync(path)),digest,path);
  assert.equal(load('docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json').stageAdmissionVerifier.contractDigest,'925b4c23f1cad674720ee6a22fcd74cc2169b16bbc161be5d43535f20dd2ee31');
});
test('C0 replacement is a carried exact dependency and never restores the absent legacy claim',()=>{
  const value=load('docs/OPS/R24/CORRECTIVE/AUDIT_R2_C0_ROOT_REPLAY_V1.json');
  assert.equal(value.replacementAttestationDigest,hash(canonicalBytes(value.replacementAttestation)));
  assert.equal(value.b0EffectiveDependency.attestationDigest,value.replacementAttestationDigest);
  assert.ok(value.nonClaims.includes('LEGACY_F179_BYTES_NOT_RESTORED'));
});
test('Lazyweb carrier contains sanitized provider result identity and bounded chronology evidence',()=>{
  const value=load('docs/OPS/R24/CORRECTIVE/AUDIT_R2_C6B_LAZYWEB_PROVIDER_EXPORT_V1.json');
  assert.equal(value.providerResultBytesDigest,hash(canonicalBytes(value.providerResultBytes)));
  assert.equal(value.providerResultBytes.agenticSearchId,'2486f500-f6c1-4d88-922e-9e5572038618');
  assert.equal(value.providerResultBytes.providerCallOrder,2);
  assert.equal(value.privacy.signedUrlsIncluded,false);
  assert.equal(value.privacy.userDocumentsMutated,false);
  assert.ok(Date.parse(value.chronology.historicalStageObservedAtUtc)<Date.parse(value.chronology.uiChangeCommitTimeUtc));
});
test('WP400 remains historical and fenced, and round-one narrative receipt is explicitly downgraded',()=>{
  const wp=load('docs/OPS/R24/CORRECTIVE/AUDIT_R2_WP400_CARRIER_STATUS_V1.json');
  assert.equal(wp.currentStatus,'FENCED_NO_CURRENT_STAGE_INSTANCE_OR_ADMISSION');
  assert.equal(wp.wp400MutationStarted,false);
  assert.ok(wp.historicalCarriers.every((item)=>item.status==='HISTORICAL_STALE_NOT_CURRENT_AUTHORITY'));
  const r1=load('docs/OPS/R24/CORRECTIVE/AUDIT_R2_ROUND1_RECEIPT_STATUS_V1.json');
  assert.equal(r1.canonicalBytesPresent,false);
  assert.equal(r1.status,'DOWNGRADED_NON_CARRIED_NARRATIVE_DIGEST');
});
