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
  authority: '3f519519f99ae46d0e26726148bec86749fae3995d2387cbe766c5325ca401b8',
  instance: '46f23ba5a53c03b09dae2a85d221bac4ee3ea163b7dcc93f6bc94968bbc4f687',
  admission: '8e9424bb20a524223088928a7a4378013128b35d578a9c8104f7d796f4b47f91',
  program: '4e5c677a49ec25774c97b857a66d8f80d107abe305fc97badbed0dcd26833dc6',
  registry: '9083981e2e0608f44e4f0475345618d6fdd6c400c8191fb4965da33a418852e2',
  effective: '51b0ef74cab8f5d4b2bc3fd330753ff2b09a9b8a685441c97919e0ec3356f527',
  trust: 'ab5cddec364c727776bf8cd28d9ed03afef026d33aed54a1cdebf518fe1434ff',
  contract: '8198809dc88724baf070b73e33b5ae9ac1251bf7e4980331aa04a70ecda4b928',
  certification: 'b383d5318684d59e7cbc11983974e31fbb2e73e5a0b5eb593577fc34bdd7d339',
  historicalTemplate: '6c833c964318da3e61e1743365f8763206be838647b5222c187b3bda8d1c6b9a',
  historicalRegistry: 'c8af046b5918f43a50af66886b0b5c9d2e22ea6501240d4b239101d8836ced1a',
  historicalTrust: '4f6e4b3a191e0302ea44646659e8c2f71121af7d808cc0ee768269b4e156840d'
});
const PATHS = Object.freeze({
  authority: 'docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_OWNER_AMENDMENT_V10.json',
  instance: 'docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_STAGE_INSTANCE_V11.json',
  admission: 'docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_STAGE_ADMISSION_ATTESTATION_V11.json',
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
