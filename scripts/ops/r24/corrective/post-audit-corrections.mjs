#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import { verifyToolchain } from './post-audit-toolchain.mjs';
import { verifyWorkflowText } from './post-audit-merge-gate.mjs';
import { verifyDurableCarrier } from './terminal-attestation-verifier.mjs';

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const fail = (code, detail = '') => { const error = new Error(`${code}${detail ? `:${detail}` : ''}`); error.code = code; throw error; };
const assert = (condition, code, detail) => { if (!condition) fail(code, detail); };
const read = (path) => { const bytes = fs.readFileSync(path); return { bytes, digest: sha256(bytes), value: JSON.parse(bytes) }; };

const EXPECTED = Object.freeze({
  authority: '175e3d5e16c4d73b68ca4ec098692b7ee1e8c7c9a178ea5e0787ea4f07ba8bdf',
  instance: '2dc214033df5cc341d6f7dfaf20375d63ae5f5e6bdc8b28b58b34eef21317027',
  admission: 'de8b32eb6838e2a65a8c89e11cee948ce5aa20e4ba4f4bda1260bbcdb894923d',
  program: '6ebf8e583260ab8e594c0ec68be7055dfe39dbdb6ec8da871a0cd5a2786f8465',
  registry: '687e600b98725da5819a1fc90393efac60f6eb768b68a0bc45e51616f436ab27',
  effective: 'e5a8ac84679c174ba197e85e4de9472b44bd969ad2fb1d583d274aac94f08296',
  trust: 'fe19b2e3eb727482a2fe16da966484b46b2cd8463638488756d1e9ff06cdc0e7',
  contract: '15b695a90c4894d75b324d0c11d4c914554bb70606d83673351f837d9d20c35b',
  certification: 'ed7e094f84b5f69421a72e54ce1ef6f6f7536ffbc54875415d6a0e8b80023ba1',
  historicalTemplate: '6c833c964318da3e61e1743365f8763206be838647b5222c187b3bda8d1c6b9a',
  historicalRegistry: 'c8af046b5918f43a50af66886b0b5c9d2e22ea6501240d4b239101d8836ced1a',
  historicalTrust: '4f6e4b3a191e0302ea44646659e8c2f71121af7d808cc0ee768269b4e156840d'
});
const PATHS = Object.freeze({
  authority: 'docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_OWNER_AMENDMENT_V11.json',
  instance: 'docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_STAGE_INSTANCE_V12.json',
  admission: 'docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_STAGE_ADMISSION_ATTESTATION_V12.json',
  program: 'docs/OPS/R24/CORRECTIVE/R24_CORRECTIVE_PROGRAM_V1_1.json',
  registry: 'docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_STAGE_REGISTRY_V1.json',
  effective: 'docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_EFFECTIVE_STATE_V1.json',
  trust: 'docs/OPS/R24/CORRECTIVE/POST_AUDIT_TERMINAL_TRUST_MODEL_V1.json',
  contract: 'docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_CONTRACT_V1.json',
  certification: 'docs/OPS/R24/CORRECTIVE/POST_AUDIT_CURRENT_CERTIFICATION_SET_V1.json'
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
  assert(JSON.stringify(files.certification.value.effectiveStateEnum) === JSON.stringify(['CERTIFIED_DONE','DONE_UNCERTIFIED','CERTIFICATION_PENDING','CERTIFICATION_INVALIDATED','INELIGIBLE_OPTIONAL','BLOCKED_TYPED']), 'E_CERTIFICATION_ENUM');
  for (const path of ['docs/OPS/R24/CORRECTIVE/schemas/STAGE_INSTANCE_V2.schema.json','docs/OPS/R24/CORRECTIVE/schemas/STAGE_ADMISSION_ATTESTATION_V2.schema.json','docs/OPS/R24/CORRECTIVE/schemas/TERMINAL_ATTESTATION_V2.schema.json']) assert(read(path).value.additionalProperties === false, 'E_SCHEMA_OPEN', path);
  verifyWorkflowText(fs.readFileSync('.github/workflows/oss-policy.yml', 'utf8'));
  const terminalWorkflow = fs.readFileSync('.github/workflows/r24-terminal-attestation.yml', 'utf8');
  for (const token of ['E_CANDIDATE_SECOND_PARENT','E_CLOSURE_STATE_PREDECESSOR','E_CLOSURE_RECEIPT_PREDECESSOR','r24-terminal-attestation-${{ inputs.stage_id }}','retention-days: 90']) assert(terminalWorkflow.includes(token), 'E_TERMINAL_WORKFLOW_BINDING', token);
  const toolchain = verifyToolchain({ verifyRuntime, verifyBundles: true });
  const durablePath = 'docs/OPS/R24/CORRECTIVE/POST_AUDIT_TERMINAL_ATTESTATION_DURABLE_CARRIER_V1.json';
  const durableCarrier = fs.existsSync(durablePath) ? verifyDurableCarrier(read(durablePath)) : null;
  return { schemaVersion: 'POST_AUDIT_CORRECTIONS_STATIC_RESULT_V1', status: 'PASS', stageCount: 33, toolchain, durableCarrier, digests: EXPECTED, programDone: false };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { process.stdout.write(`${JSON.stringify(verifyPostAuditCorrections())}\n`); }
  catch (error) { process.stderr.write(`${JSON.stringify({ status: 'FAIL', code: error.code ?? 'E_UNTYPED', message: error.message })}\n`); process.exitCode = 1; }
}
