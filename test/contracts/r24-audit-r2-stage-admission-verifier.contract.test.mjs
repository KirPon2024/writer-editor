import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {
  verifyAuditR2Admission,
} from '../../scripts/ops/r24/corrective/audit-r2-stage-admission-verifier.mjs';

const canonicalize = (value) => value === null || typeof value !== 'object'
  ? JSON.stringify(value)
  : Array.isArray(value)
    ? `[${value.map(canonicalize).join(',')}]`
    : `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
const bytes = (value) => Buffer.from(`${canonicalize(value)}\n`);
const digest = (value) => crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : bytes(value)).digest('hex');
const file = (value) => ({ value, bytes: bytes(value), digest: digest(value) });
const clone = (value) => structuredClone(value);
const load = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const verifierBytes = fs.readFileSync('scripts/ops/r24/corrective/audit-r2-stage-admission-verifier.mjs');
const registryFile = file(load('docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json'));
const programFile = file(load('docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json'));
const verifierContractFile = file(load('docs/OPS/R24/CORRECTIVE/AUDIT_R2_STAGE_ADMISSION_VERIFIER_CONTRACT_V1.json'));

function fixture() {
  const instance = load('docs/OPS/R24/CORRECTIVE/AUDIT_R2_FINAL_CORRECTION_STAGE_INSTANCE_V1.json');
  const contract = load('docs/OPS/R24/CORRECTIVE/AUDIT_R2_FINAL_CORRECTION_CONTRACT_V1.json');
  const amendment = load('docs/OPS/R24/CORRECTIVE/AUDIT_R2_PROGRAM_RATIFICATION_AMENDMENT_V1.json');
  return { instance, contract, amendment };
}
function verify(values) {
  return verifyAuditR2Admission({
    instanceFile: file(values.instance),
    contractFile: file(values.contract),
    verifierContractFile,
    amendmentFile: file(values.amendment),
    registryFile,
    programFile,
    verifierBytes,
  });
}
function rebind(values) {
  values.instance.programAmendmentDigest = digest(values.amendment);
  values.contract.exactInstanceDigest = digest(values.instance);
  values.contract.exactDependencies = clone(values.instance.dependencies);
  values.contract.exactStructuredCommands = clone(values.instance.structuredCommands);
  values.contract.exactCommands = clone(values.instance.commands);
}
function rejectsCode(mutator, code) {
  const values = fixture();
  mutator(values);
  rebind(values);
  assert.throws(() => verify(values), (error) => error.code === code);
}

test('exact authority-bound correction admission is accepted', () => {
  assert.equal(verify(fixture()).status, 'ADMITTED');
});
test('unknown top-level and nested fields fail closed with typed codes', () => {
  rejectsCode(({ instance }) => { instance.unknownAuthority = true; }, 'E_SCHEMA_KEYS');
  rejectsCode(({ instance }) => { instance.writeSet.unknown = []; }, 'E_SCHEMA_KEYS');
  rejectsCode(({ instance }) => { instance.dependencies[0].unknown = true; }, 'E_SCHEMA_KEYS');
});
test('wrong and zero owner bindings are rejected', () => {
  rejectsCode(({ instance }) => { instance.ownerAuthorityBindingDigest = '0'.repeat(64); }, 'E_AUTHORITY_BINDING');
});
test('missing, extra, duplicate and mismatched dependencies are rejected', () => {
  rejectsCode(({ instance }) => { instance.dependencies = []; }, 'E_DEPENDENCY_ORDER_MISMATCH');
  rejectsCode(({ instance }) => { instance.dependencies.push({ ...instance.dependencies[0], stageId: 'C8Z' }); }, 'E_DEPENDENCY_ORDER_MISMATCH');
  rejectsCode(({ instance }) => { instance.dependencies.push({ ...instance.dependencies[0] }); }, 'E_DEPENDENCY_ORDER_MISMATCH');
  rejectsCode(({ instance }) => { instance.dependencies[0].stageId = 'C8Z'; }, 'E_DEPENDENCY_ORDER_MISMATCH');
});
test('B0 cannot be admitted without its exact C0 dependency', () => {
  for (const dependencies of [[], [{stageId:'C1A',attestationDigest:'1'.repeat(64),status:'CERTIFIED_ROOT_REPLACEMENT'}]]) {
    const values = fixture();
    values.instance.stageId = 'B0';
    values.instance.dependencies = dependencies;
    values.amendment.correctionStage = { stageId:'B0', dependencies:['C0'] };
    values.contract.stageId = 'B0';
    rebind(values);
    assert.throws(() => verify(values), (error) => error.code === 'E_DEPENDENCY_ORDER_MISMATCH');
  }
});
test('structured argv rejects suffix injection and display substitution', () => {
  rejectsCode(({ instance }) => { instance.structuredCommands[0].args.at(-1); instance.structuredCommands[0].args.push('ok;touch pwned'); }, 'E_COMMAND_SHELL_META');
  rejectsCode(({ instance }) => { instance.commands[0] += ' suffix'; }, 'E_COMMAND_DISPLAY_MISMATCH');
});
test('malformed nested values always return typed failures', () => {
  rejectsCode(({ instance }) => { instance.prTarget = null; }, 'E_SCHEMA_TYPE');
  rejectsCode(({ instance }) => { instance.writeSet.paths = [null]; }, 'E_PATH_TYPE');
});
