import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { canonicalBytes } from '../../scripts/ops/r24/corrective/canonical-json.mjs';
import { sha256 } from '../../scripts/ops/r24/corrective/audit-r1-corrections.mjs';
import { verifyAuditStageAdmission } from '../../scripts/ops/r24/corrective/audit-r1-stage-admission-verifier.mjs';

const file = (value) => { const bytes = canonicalBytes(value); return { value, bytes, digest: sha256(bytes) }; };
const instance = JSON.parse(readFileSync('docs/OPS/R24/CORRECTIVE/AUDIT_R1_CORRECTION_STAGE_INSTANCE_V1.json', 'utf8'));
const contract = JSON.parse(readFileSync('docs/OPS/R24/CORRECTIVE/AUDIT_R1_CORRECTION_CONTRACT_V1.json', 'utf8'));
const registryFile = file(JSON.parse(readFileSync('docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json', 'utf8')));
const programFile = file(JSON.parse(readFileSync('docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json', 'utf8')));
const verifierBytes = readFileSync('scripts/ops/r24/corrective/audit-r1-stage-admission-verifier.mjs');

function inputs(mutator = () => {}) {
  const nextInstance = structuredClone(instance);
  const nextContract = structuredClone(contract);
  mutator(nextInstance, nextContract);
  nextContract.exactInstanceDigest = sha256(canonicalBytes(nextInstance));
  return { instanceFile: file(nextInstance), registryFile, programFile, contractFile: file(nextContract), verifierBytes };
}

function rejects(code, mutator) {
  assert.throws(() => verifyAuditStageAdmission(inputs(mutator)), (error) => error.code === code);
}

test('admits only the exact closed audit correction instance', () => {
  const result = verifyAuditStageAdmission(inputs());
  assert.equal(result.status, 'ADMITTED');
  assert.equal(result.ownerAuthorityBindingDigest, 'be68bd97021d13fbfb75c73791bda7f6bfeebecebf525d4a927d1a4c9fe9efd6');
});

test('rejects missing, empty, extra, duplicate, ordered, and mismatched dependencies with typed codes', () => {
  rejects('E_SCHEMA_MISSING_FIELD', (value) => { delete value.dependencies; });
  rejects('E_DEPENDENCY_MISSING', (value, expected) => { value.dependencies = []; expected.exactDependencies = []; });
  rejects('E_DEPENDENCY_EXTRA', (value, expected) => { value.dependencies.push({ stageId: 'C5A', status: 'CERTIFIED_DONE', attestationDigest: 'a'.repeat(64) }); expected.exactDependencies = value.dependencies; });
  rejects('E_DEPENDENCY_DUPLICATE', (value, expected) => { value.dependencies.push(structuredClone(value.dependencies[0])); expected.exactDependencies = value.dependencies; });
  rejects('E_DEPENDENCY_ATTESTATION_MISMATCH', (value) => { value.dependencies[0].attestationDigest = 'a'.repeat(64); });
  rejects('E_SCHEMA_TYPE', (value, expected) => { value.dependencies = [null]; expected.exactDependencies = value.dependencies; });
  const c1c = inputs((value, expected) => {
    value.stageId = 'C1C'; expected.stageId = 'C1C';
    value.dependencies = [
      { stageId: 'C1B', status: 'CERTIFIED_DONE', attestationDigest: 'b'.repeat(64) },
      { stageId: 'C1A', status: 'CERTIFIED_DONE', attestationDigest: 'a'.repeat(64) },
    ];
    expected.exactDependencies = value.dependencies;
  });
  assert.throws(() => verifyAuditStageAdmission(c1c), (error) => error.code === 'E_DEPENDENCY_ORDER_MISMATCH');
});

test('rejects command injection, unknown fields, extra acceptance, and wrong owner authority', () => {
  rejects('E_COMMAND_DISPLAY_MISMATCH', (value, expected) => { value.commands[0] += ' && touch owned'; expected.exactCommands = value.commands; });
  rejects('E_COMMAND_SHELL_META', (value, expected) => { value.structuredCommands[0].args.push(';touch'); expected.exactStructuredCommands = value.structuredCommands; value.commands[0] = [value.structuredCommands[0].program, ...value.structuredCommands[0].args].join(' '); expected.exactCommands = value.commands; });
  rejects('E_SCHEMA_UNKNOWN_FIELD', (value) => { value.unexpected = true; });
  rejects('E_ACCEPTANCE_SET_MISMATCH', (value) => { value.acceptanceSignals.push('UNAUTHORIZED_EXTRA'); });
  rejects('E_OWNER_BINDING_MISMATCH', (value) => { value.ownerAuthorityBindingDigest = 'a'.repeat(64); });
});
