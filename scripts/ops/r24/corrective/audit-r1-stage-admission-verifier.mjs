#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { canonicalBytes, canonicalize, readCanonicalJson } from './canonical-json.mjs';
import {
  FIXED_BINDINGS,
  assert,
  assertClosedObject,
  assertExactJson,
  assertHex,
  assertUniqueStrings,
  fail,
  normalizeRepoPath,
  sha256,
} from './audit-r1-corrections.mjs';

const INSTANCE_KEYS = Object.freeze([
  'acceptanceSignals', 'admissionContext', 'auditBinding', 'authorityCeiling', 'authorityTemplateId',
  'baseSha', 'branch', 'commands', 'contractSha', 'deltaAdmission', 'dependencies', 'externalEffects',
  'headSha', 'model', 'ownerAuthorityBindingDigest', 'planDigest', 'prTarget', 'programTemplateDigest',
  'reasoningEffort', 'schemaVersion', 'stageId', 'stageRegistryDigest', 'stopConditions',
  'structuredCommands', 'targetRemote', 'treeSha', 'verifierCodeDigest', 'verifierContractDigest', 'writeSet',
]);
const CONTRACT_KEYS = Object.freeze([
  'correctionId', 'exactAcceptanceSignals', 'exactAuthorityCeiling', 'exactCommands', 'exactDependencies',
  'exactExternalEffects', 'exactInstanceDigest', 'exactStopConditions', 'exactStructuredCommands',
  'exactWriteSet', 'fixedBindings', 'legacyAdmissionDigest', 'requiredFindingIds', 'schemaVersion', 'stageId',
]);
export const EXACT_STRUCTURED_COMMANDS = Object.freeze([
  { program: 'npm', args: ['run', 'agent:bootstrap', '--', '--objective', 'audit-r1-corrections'] },
  { program: 'npm', args: ['run', 'agent:preflight', '--', '--declaration', 'YALKEN_AUDIT_R1_TASK_ARCHITECTURE_DECLARATION_V1.json'] },
  { program: 'node', args: ['scripts/ops/r24/corrective/audit-r1-stage-admission-verifier.mjs', '--instance', 'docs/OPS/R24/CORRECTIVE/AUDIT_R1_CORRECTION_STAGE_INSTANCE_V1.json', '--registry', 'docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json', '--program', 'docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json', '--contract', 'docs/OPS/R24/CORRECTIVE/AUDIT_R1_CORRECTION_CONTRACT_V1.json'] },
  { program: 'node', args: ['scripts/ops/r24/corrective/audit-r1-corrections.mjs', '--check'] },
  { program: 'node', args: ['scripts/ops/r24/corrective/audit-r1-recertify.mjs', '--check-plan', '--plan', 'docs/OPS/R24/CORRECTIVE/AUDIT_R1_RECERTIFICATION_PLAN_V1.json', '--registry', 'docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json', '--requirements', 'docs/OPS/R24/CORRECTIVE/AUDIT_R1_ACCEPTANCE_REQUIREMENTS_V1.json', '--matrix', 'docs/OPS/R24/CORRECTIVE/AUDIT_R1_REQUIREMENT_EVIDENCE_MATRIX_V1.json'] },
  { program: 'node', args: ['scripts/ops/r24/corrective/audit-r1-test-inventory.mjs', '--stage', 'AUDIT_R1', '--check', 'docs/OPS/R24/CORRECTIVE/AUDIT_R1_TEST_INVENTORY_V1.json'] },
  { program: 'node', args: ['--test', 'test/contracts/r24-audit-r1-corrections.contract.test.mjs', 'test/contracts/r24-audit-r1-stage-admission-verifier.contract.test.mjs', 'test/contracts/r24-audit-r1-terminal-attestation.contract.test.mjs', 'test/contracts/r24-audit-r1-test-inventory.contract.test.mjs'] },
  { program: 'npm', args: ['run', 'test:r24-e0'] },
  { program: 'npm', args: ['run', 'test:sector-u-full'] },
  { program: 'node', args: ['scripts/ops/r24/corrective/audit-r1-test-inventory.mjs', '--run-lane', 'SECTOR_U_FULL'] },
  { program: 'npm', args: ['run', 'build:renderer'] },
  { program: 'npm', args: ['run', 'test:electron'] },
  { program: 'npm', args: ['run', 'test:r24-w0'] },
  { program: 'npm', args: ['run', 'test:r24-pk1'] },
  { program: 'npm', args: ['run', 'test:r24-v3'] },
  { program: 'npm', args: ['test'] },
  { program: 'npm', args: ['run', 'agent:guardrails'] },
  { program: 'git', args: ['diff', '--check'] },
  { program: 'git', args: ['status', '--short', '--branch'] },
  { program: 'git', args: ['add', '--', '.github/workflows/r24-terminal-attestation.yml', 'docs/OPS/R24/CORRECTIVE', 'scripts/ops/r24/corrective', 'test/contracts'] },
  { program: 'git', args: ['commit', '-m', 'Close audit round 1 corrections'] },
  { program: 'git', args: ['push', 'origin', 'codex/r24-audit-r1-corrections-v1-20260829'] },
  { program: 'gh', args: ['pr', 'create', '--base', 'main', '--head', 'codex/r24-audit-r1-corrections-v1-20260829'] },
  { program: 'gh', args: ['pr', 'checks', '--watch'] },
  { program: 'gh', args: ['pr', 'merge', '--merge'] },
  { program: 'git', args: ['fetch', 'origin', 'main'] },
]);
export const EXACT_ACCEPTANCE_SIGNALS = Object.freeze([
  'AGGREGATE_IF_ALWAYS',
  'ALL_REQUIRED_DEPENDENCIES_ACCOUNTED',
  'FAILED_SKIPPED_CANCELLED_REQUIRED_DEPENDENCY_FAILS',
  'EXTERNAL_TERMINAL_ATTESTATION_VERIFIED',
  'AUDIT_R1_ALL_ELEVEN_FINDINGS_CLOSED',
  'AUTHENTIC_ACCEPTANCE_RESULT_BUNDLES_BOUND',
  'EXACT_ORDERED_DEPENDENCIES_ENFORCED',
  'IMMUTABLE_ARTIFACT_ZIP_BYTES_VERIFIED',
  'FRESH_INDEPENDENT_G0_VERIFIED',
  'CLOSED_SCHEMAS_AND_TYPED_FAILURES_ENFORCED',
  'CURRENT_STAGE_SKIP_AUTHORITY_ENFORCED',
  'C0_ROOT_FORMALLY_REPLACED_WITHOUT_OVERCLAIM',
  'C6B_LAZYWEB_EVIDENCE_IMMUTABLY_MANIFESTED',
  'STRICT_PUBLIC_PATH_ALLOWLIST_ENFORCED',
  'WP400_EXACT_HEAD_CARRIERS_MATERIALIZED',
  'CLOSURE_RECEIPT_CARRIER_MATERIALIZED',
  'COMPLETE_THIRTY_THREE_STAGE_RECERTIFICATION_REQUIRED',
  'WP400_MUTATION_NOT_STARTED',
  'PROGRAM_DONE_NOT_CLAIMED',
]);

function validateStructuredCommand(command, index) {
  assertClosedObject(command, ['args', 'program'], ['args', 'program'], `structuredCommands.${index}`);
  assert(['gh', 'git', 'node', 'npm'].includes(command.program), 'E_COMMAND_PROGRAM', command.program);
  assert(Array.isArray(command.args) && command.args.length > 0, 'E_COMMAND_ARGS', `${index}`);
  for (const arg of command.args) {
    assert(typeof arg === 'string' && arg.length > 0, 'E_COMMAND_ARG_TYPE', `${index}`);
    assert(!/[;&|`$><\n\r\0]/u.test(arg), 'E_COMMAND_SHELL_META', `${index}:${arg}`);
  }
  return [command.program, ...command.args].join(' ');
}

function validateInstanceShape(instance) {
  assertClosedObject(instance, INSTANCE_KEYS, INSTANCE_KEYS, 'stageInstance');
  assertClosedObject(instance.writeSet, ['deletePaths', 'paths', 'renamePaths'], ['deletePaths', 'paths', 'renamePaths'], 'stageInstance.writeSet');
  assertClosedObject(instance.prTarget, ['baseBranch', 'headBranch'], ['baseBranch', 'headBranch'], 'stageInstance.prTarget');
  assertClosedObject(instance.admissionContext, ['authorityEpoch', 'observedAtUtc', 'policyEpoch'], ['authorityEpoch', 'observedAtUtc', 'policyEpoch'], 'stageInstance.admissionContext');
  assertClosedObject(instance.auditBinding, ['auditReceiptDigest', 'classificationDigest', 'confirmedFindingIds', 'correctionId'], ['auditReceiptDigest', 'classificationDigest', 'confirmedFindingIds', 'correctionId'], 'stageInstance.auditBinding');
  assertClosedObject(instance.deltaAdmission, ['commitCount', 'disposition', 'fromAuditSha', 'patchSha256', 'pathListSha256', 'toCurrentSha'], ['commitCount', 'disposition', 'fromAuditSha', 'patchSha256', 'pathListSha256', 'toCurrentSha'], 'stageInstance.deltaAdmission');
  assert(Array.isArray(instance.dependencies), 'E_SCHEMA_TYPE', 'stageInstance.dependencies');
  for (const [index, dependency] of instance.dependencies.entries()) {
    assertClosedObject(dependency, ['attestationDigest', 'stageId', 'status'], ['attestationDigest', 'stageId', 'status'], `stageInstance.dependencies.${index}`);
  }
  assert(Array.isArray(instance.structuredCommands), 'E_SCHEMA_TYPE', 'stageInstance.structuredCommands');
  const displays = instance.structuredCommands.map(validateStructuredCommand);
  assertExactJson(instance.commands, displays, 'E_COMMAND_DISPLAY_MISMATCH', 'commands');
}

function validateContractShape(contract) {
  assertClosedObject(contract, CONTRACT_KEYS, CONTRACT_KEYS, 'correctionContract');
  assertClosedObject(contract.fixedBindings, Object.keys(FIXED_BINDINGS), Object.keys(FIXED_BINDINGS), 'correctionContract.fixedBindings');
}

export function verifyAuditStageAdmission({ instanceFile, registryFile, programFile, contractFile, verifierBytes }) {
  assert(instanceFile && registryFile && programFile && contractFile, 'E_INPUT_UNAVAILABLE', 'canonical files');
  const { value: instance, bytes: instanceBytes, digest: instanceDigest } = instanceFile;
  const { value: registry, digest: registryDigest } = registryFile;
  const { value: program, digest: programDigest } = programFile;
  const { value: contract } = contractFile;
  validateInstanceShape(instance);
  validateContractShape(contract);
  assertExactJson(contract.fixedBindings, FIXED_BINDINGS, 'E_FIXED_BINDING_MISMATCH', 'contract.fixedBindings');
  assert(programDigest === FIXED_BINDINGS.programTemplateDigest && registryDigest === FIXED_BINDINGS.stageRegistryDigest, 'E_FIXED_BINDING_MISMATCH', 'program/registry');
  assert(program.stageAdmissionVerifier.codeDigest === FIXED_BINDINGS.stageAdmissionVerifierDigest && program.stageAdmissionVerifier.contractDigest === FIXED_BINDINGS.stageAdmissionVerifierContractDigest, 'E_FIXED_BINDING_MISMATCH', 'legacy verifier');
  assert(instanceBytes.equals(canonicalBytes(instance)), 'E_NON_CANONICAL_INPUT', 'stageInstance');
  assert(instanceDigest === contract.exactInstanceDigest, 'E_STAGE_INSTANCE_DIGEST', instanceDigest);
  assert(instance.schemaVersion === 'STAGE_INSTANCE_V1' && instance.stageId === contract.stageId, 'E_STAGE_IDENTITY', instance.stageId);
  assert(instance.programTemplateDigest === programDigest && instance.planDigest === programDigest, 'E_PROGRAM_DIGEST_MISMATCH', instance.programTemplateDigest);
  assert(instance.stageRegistryDigest === registryDigest, 'E_REGISTRY_DIGEST_MISMATCH', instance.stageRegistryDigest);
  assert(instance.verifierCodeDigest === FIXED_BINDINGS.stageAdmissionVerifierDigest && instance.verifierContractDigest === FIXED_BINDINGS.stageAdmissionVerifierContractDigest, 'E_LEGACY_VERIFIER_BINDING', instance.verifierCodeDigest);
  assert(instance.ownerAuthorityBindingDigest === FIXED_BINDINGS.ownerAuthorityBindingDigest, 'E_OWNER_BINDING_MISMATCH', instance.ownerAuthorityBindingDigest);
  assert(instance.authorityTemplateId === registry.authorityTemplateId, 'E_AUTHORITY_TEMPLATE', instance.authorityTemplateId);
  assert(instance.model === 'gpt-5.6-sol' && instance.reasoningEffort === 'xhigh', 'E_RUNTIME_BINDING', `${instance.model}/${instance.reasoningEffort}`);
  for (const field of ['baseSha', 'headSha', 'treeSha', 'contractSha']) assertHex(instance[field], 40, field);
  for (const field of ['auditReceiptDigest', 'classificationDigest']) assertHex(instance.auditBinding[field], 64, `auditBinding.${field}`);
  assert(instance.targetRemote === 'origin' && instance.prTarget.baseBranch === 'main' && instance.prTarget.headBranch === instance.branch, 'E_DELIVERY_TARGET', instance.branch);
  assert(typeof instance.branch === 'string' && instance.branch.startsWith('codex/'), 'E_BRANCH_SCOPE', instance.branch);
  assert(instance.writeSet.deletePaths.length === 0 && instance.writeSet.renamePaths.length === 0, 'E_DESTRUCTIVE_WRITE', instance.stageId);
  assertUniqueStrings(instance.writeSet.paths, 'writeSet.paths');
  for (const candidate of instance.writeSet.paths) normalizeRepoPath(candidate);
  assertExactJson(instance.writeSet, contract.exactWriteSet, 'E_WRITE_SET_MISMATCH', 'writeSet');
  assertExactJson(instance.commands, contract.exactCommands, 'E_COMMAND_SET_MISMATCH', 'commands');
  assertExactJson(instance.structuredCommands, contract.exactStructuredCommands, 'E_STRUCTURED_COMMAND_SET_MISMATCH', 'structuredCommands');
  assertExactJson(instance.structuredCommands, EXACT_STRUCTURED_COMMANDS, 'E_COMMAND_SEMANTICS_MISMATCH', 'structuredCommands');
  assertUniqueStrings(instance.acceptanceSignals, 'acceptanceSignals');
  assertExactJson(instance.acceptanceSignals, contract.exactAcceptanceSignals, 'E_ACCEPTANCE_SET_MISMATCH', 'acceptanceSignals');
  assertExactJson(instance.acceptanceSignals, EXACT_ACCEPTANCE_SIGNALS, 'E_ACCEPTANCE_SEMANTICS_MISMATCH', 'acceptanceSignals');
  assertExactJson(instance.stopConditions, contract.exactStopConditions, 'E_STOP_SET_MISMATCH', 'stopConditions');
  assertExactJson(instance.authorityCeiling, contract.exactAuthorityCeiling, 'E_AUTHORITY_SET_MISMATCH', 'authorityCeiling');
  assertExactJson(instance.externalEffects, contract.exactExternalEffects, 'E_EXTERNAL_EFFECT_SET_MISMATCH', 'externalEffects');
  const template = registry.stages.find((entry) => entry.stageId === instance.stageId);
  assert(template, 'E_UNKNOWN_STAGE', instance.stageId);
  const dependencyIds = instance.dependencies.map((entry) => entry.stageId);
  assert(new Set(dependencyIds).size === dependencyIds.length, 'E_DEPENDENCY_DUPLICATE', 'dependencies');
  const missingDependencies = template.dependencies.filter((stageId) => !dependencyIds.includes(stageId));
  const extraDependencies = dependencyIds.filter((stageId) => !template.dependencies.includes(stageId));
  assert(missingDependencies.length === 0, 'E_DEPENDENCY_MISSING', missingDependencies.join(','));
  assert(extraDependencies.length === 0, 'E_DEPENDENCY_EXTRA', extraDependencies.join(','));
  assertExactJson(dependencyIds, template.dependencies, 'E_DEPENDENCY_ORDER_MISMATCH', 'dependencies');
  assertExactJson(instance.dependencies, contract.exactDependencies, 'E_DEPENDENCY_ATTESTATION_MISMATCH', 'dependencies');
  for (const dependency of instance.dependencies) {
    assertHex(dependency.attestationDigest, 64, `dependency.${dependency.stageId}`);
    assert(dependency.status === 'CERTIFIED_DONE', 'E_DEPENDENCY_STATUS', dependency.stageId);
  }
  assertExactJson(instance.auditBinding.confirmedFindingIds, contract.requiredFindingIds, 'E_AUDIT_FINDING_SET', 'confirmedFindingIds');
  assert(instance.auditBinding.correctionId === contract.correctionId, 'E_CORRECTION_ID', instance.auditBinding.correctionId);
  return {
    schemaVersion: 'AUDIT_R1_STAGE_ADMISSION_ATTESTATION_V1',
    attestationType: 'EXACT_CLOSED_SUCCESSOR_STAGE_ADMISSION',
    status: 'ADMITTED',
    stageId: instance.stageId,
    correctionId: contract.correctionId,
    stageInstanceDigest: instanceDigest,
    legacyAdmissionDigest: contract.legacyAdmissionDigest,
    programTemplateDigest: programDigest,
    stageRegistryDigest: registryDigest,
    ownerAuthorityBindingDigest: instance.ownerAuthorityBindingDigest,
    successorVerifierCodeDigest: sha256(verifierBytes),
    exactDependencySetDigest: sha256(canonicalBytes(instance.dependencies)),
    exactStructuredCommandsDigest: sha256(canonicalBytes(instance.structuredCommands)),
    exactWriteSetDigest: sha256(canonicalBytes(instance.writeSet)),
    exactAcceptanceSignalsDigest: sha256(canonicalBytes(instance.acceptanceSignals)),
    decision: 'EXACT_CLOSED_CORRECTION_CONTRACT_ADMITTED',
  };
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith('--')) continue;
    result[argv[index].slice(2)] = argv[index + 1];
    index += 1;
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseArgs(process.argv.slice(2));
    assert(options.instance && options.registry && options.program && options.contract, 'E_USAGE', '--instance --registry --program --contract');
    const verifierBytes = readFileSync(process.argv[1]);
    const attestation = verifyAuditStageAdmission({
      instanceFile: readCanonicalJson(options.instance),
      registryFile: readCanonicalJson(options.registry),
      programFile: readCanonicalJson(options.program),
      contractFile: readCanonicalJson(options.contract),
      verifierBytes,
    });
    process.stdout.write(canonicalBytes(attestation));
  } catch (error) {
    process.stderr.write(`${canonicalize({ code: error.code ?? 'E_UNTYPED', message: error.message })}\n`);
    process.exitCode = 1;
  }
}
