#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import { verifyToolchain } from './post-audit-toolchain.mjs';
import { verifyWorkflowText } from './post-audit-merge-gate.mjs';
import { verifyAuditCycle2DurableCarrier, verifyCertificationSet } from './post-audit-certification-set.mjs';
import { verifyDurableCarrier } from './terminal-attestation-verifier.mjs';

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const fail = (code, detail = '') => { const error = new Error(`${code}${detail ? `:${detail}` : ''}`); error.code = code; throw error; };
const assert = (condition, code, detail) => { if (!condition) fail(code, detail); };
const read = (path) => { const bytes = fs.readFileSync(path); return { bytes, digest: sha256(bytes), value: JSON.parse(bytes) }; };

const EXPECTED = Object.freeze({
  authority: 'c1b7d576a93158df386f3d4a1467cc1858e0e905e6871225d2be9fab47577e3f',
  instance: 'cf3030757b869cf9c5c2053abe4fae750f504c70f82bbb1da56e3f7afcac2188',
  admission: 'c9a3bdb666ed9cba2c6f32951ebf6f8d6d36e3fe2d5fcf8e1ce394acf38b5a37',
  program: 'da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a',
  registry: '1cb21c3c935e2aa5f4bb27167be5d80c7ca261aaadd78c6a4422fb6f0e5c5c95',
  effective: '087a18c66d9e59401c17550e79a31572515d4236998b709c81a7c0bd9e7d8093',
  trust: '7cbdd6c9b12ca95274943b82849e26b50dd26243bbd265540bbba294af8e1f41',
  contract: '90197c119af8bb9923437217a89514524769824d19306cd1fa801e6ca68e2fbe',
  historicalTemplate: '6c833c964318da3e61e1743365f8763206be838647b5222c187b3bda8d1c6b9a',
  historicalRegistry: 'c8af046b5918f43a50af66886b0b5c9d2e22ea6501240d4b239101d8836ced1a',
  historicalTrust: '4f6e4b3a191e0302ea44646659e8c2f71121af7d808cc0ee768269b4e156840d'
});
const PATHS = Object.freeze({
  authority: 'docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_OWNER_AMENDMENT_V12.json',
  instance: 'docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_STAGE_INSTANCE_V13.json',
  admission: 'docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_STAGE_ADMISSION_ATTESTATION_V13.json',
  program: 'docs/OPS/R24/CORRECTIVE/R24_CORRECTIVE_PROGRAM_V1_1.json',
  registry: 'docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_STAGE_REGISTRY_V1.json',
  effective: 'docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_EFFECTIVE_STATE_V1.json',
  trust: 'docs/OPS/R24/CORRECTIVE/POST_AUDIT_TERMINAL_TRUST_MODEL_V1.json',
  contract: 'docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_CONTRACT_V1.json',
  certification: 'docs/OPS/R24/CORRECTIVE/POST_AUDIT_CURRENT_CERTIFICATION_SET_V2.json'
});

export function verifyPostAuditCorrections({ verifyRuntime = true } = {}) {
  const files = Object.fromEntries(Object.entries(PATHS).map(([key, path]) => [key, read(path)]));
  for (const key of Object.keys(EXPECTED).filter((key) => files[key])) assert(files[key].digest === EXPECTED[key], 'E_CURRENT_CARRIER_DIGEST', `${key}:${files[key].digest}`);
  assert(sha256(fs.readFileSync('docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json')) === EXPECTED.historicalTemplate, 'E_FIXED_TEMPLATE');
  assert(sha256(fs.readFileSync('docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json')) === EXPECTED.historicalRegistry, 'E_FIXED_REGISTRY');
  assert(sha256(fs.readFileSync('docs/OPS/R24/CORRECTIVE/TERMINAL_ATTESTATION_TRUST_MODEL_V1.json')) === EXPECTED.historicalTrust, 'E_FIXED_TRUST');
  assert(files.admission.value.stageInstanceDigest === files.instance.digest && files.admission.value.status === 'ADMITTED', 'E_ADMISSION_BINDING');
  assert(files.registry.value.stages?.[0]?.stageAdmissionDigest === files.admission.digest, 'E_REGISTRY_BINDING');
  assert(files.effective.value.stageInstanceDigest === files.instance.digest && files.effective.value.stageAdmissionDigest === files.admission.digest, 'E_EFFECTIVE_BINDING');
  assert(files.trust.value.programDigest === files.program.digest && files.trust.value.stageInstanceDigest === files.instance.digest && files.trust.value.stageAdmissionDigest === files.admission.digest, 'E_TRUST_BINDING');
  const stageOrder = files.program.value.stageRegistry.stageOrder;
  assert(stageOrder.length === 33 && new Set(stageOrder).size === 33, 'E_PROGRAM_STAGE_DENOMINATOR', stageOrder.length);
  const certifications = files.certification.value.stages;
  assert(certifications.length === 33 && JSON.stringify(certifications.map((entry) => entry.stageId)) === JSON.stringify(stageOrder), 'E_CERTIFICATION_DENOMINATOR');
  for (const entry of certifications) assert(entry.effectiveState === 'CERTIFIED_DONE', 'E_CERTIFICATION_STATE', entry.stageId);
  const certificationVerification = verifyCertificationSet({ value: files.certification.value, fileDigest: files.certification.digest, candidateSha: 'HEAD' });
  const cycle2Contract=read('docs/OPS/R24/CORRECTIVE/AUDIT_CYCLE_2_CORRECTION_CONTRACT_V1.json');
  const cycle2Authority=read('docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_OWNER_AMENDMENT_V16.json');
  const cycle2Instance=read('docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_STAGE_INSTANCE_V17.json');
  const cycle2Admission=read('docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_STAGE_ADMISSION_ATTESTATION_V17.json');
  assert(cycle2Contract.value.admission.authorityDigest===cycle2Authority.digest&&cycle2Contract.value.admission.stageInstanceDigest===cycle2Instance.digest&&cycle2Contract.value.admission.stageAdmissionDigest===cycle2Admission.digest,'E_CYCLE2_CONTRACT_ADMISSION_BINDING');
  assert(cycle2Admission.value.authorityDigest===cycle2Authority.digest&&cycle2Admission.value.stageInstanceDigest===cycle2Instance.digest&&cycle2Admission.value.status==='ADMITTED'&&cycle2Admission.value.lease?.fencingCounter===58&&cycle2Admission.value.lease?.wip===1,'E_CYCLE2_ADMISSION_BINDING');
  assert(cycle2Contract.value.auditInput.receiptDigest==='babdb1ed4e37d9e8b3b8234ec4b3e86d72d43b3c2fe26a1511a5d3de1a92af70'&&cycle2Contract.value.programDone===false&&cycle2Contract.value.mainProductGraphNodeStarted===false,'E_CYCLE2_SCOPE');
  assert(JSON.stringify(files.certification.value.effectiveStateEnum) === JSON.stringify(['CERTIFIED_DONE','DONE_UNCERTIFIED','CERTIFICATION_PENDING','CERTIFICATION_INVALIDATED','INELIGIBLE_OPTIONAL','BLOCKED_TYPED']), 'E_CERTIFICATION_ENUM');
  for (const path of ['docs/OPS/R24/CORRECTIVE/schemas/STAGE_INSTANCE_V2.schema.json','docs/OPS/R24/CORRECTIVE/schemas/STAGE_ADMISSION_ATTESTATION_V2.schema.json','docs/OPS/R24/CORRECTIVE/schemas/TERMINAL_ATTESTATION_V2.schema.json']) assert(read(path).value.additionalProperties === false, 'E_SCHEMA_OPEN', path);
  verifyWorkflowText(fs.readFileSync('.github/workflows/oss-policy.yml', 'utf8'));
  const terminalWorkflow = fs.readFileSync('.github/workflows/r24-terminal-attestation.yml', 'utf8');
  for (const token of ['E_CANDIDATE_SECOND_PARENT','E_CLOSURE_STATE_PREDECESSOR','E_CLOSURE_RECEIPT_PREDECESSOR','r24-terminal-attestation-${{ inputs.stage_id }}','retention-days: 90']) assert(terminalWorkflow.includes(token), 'E_TERMINAL_WORKFLOW_BINDING', token);
  const toolchain = verifyToolchain({ verifyRuntime, verifyBundles: true });
  const durablePath = 'docs/OPS/R24/CORRECTIVE/POST_AUDIT_TERMINAL_ATTESTATION_DURABLE_CARRIER_V1.json';
  const durableCarrier = fs.existsSync(durablePath) ? verifyDurableCarrier(read(durablePath)) : null;
  const cycle2DurablePath='docs/OPS/R24/CORRECTIVE/AUDIT_CYCLE_2_TERMINAL_ATTESTATION_DURABLE_CARRIER_V1.json';
  const cycle2DurableFile=fs.existsSync(cycle2DurablePath)?read(cycle2DurablePath):null;
  const cycle2DurableCarrier=cycle2DurableFile?verifyAuditCycle2DurableCarrier(cycle2DurableFile,{expectedCarrierDigest:cycle2DurableFile.digest}):null;
  return { schemaVersion: 'POST_AUDIT_CORRECTIONS_STATIC_RESULT_V3', status: 'PASS', stageCount: 33, artifactBindingDenominator: certificationVerification.artifactBindingDenominator, certificationSetDigest: files.certification.digest, cycle2AdmissionDigest:cycle2Admission.digest, toolchain, durableCarrier, cycle2DurableCarrier, digests: EXPECTED, programDone: false };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { process.stdout.write(`${JSON.stringify(verifyPostAuditCorrections())}\n`); }
  catch (error) { process.stderr.write(`${JSON.stringify({ status: 'FAIL', code: error.code ?? 'E_UNTYPED', message: error.message })}\n`); process.exitCode = 1; }
}
