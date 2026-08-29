#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const FIXED = Object.freeze({
  ownerAuthorityBindingDigest: 'be68bd97021d13fbfb75c73791bda7f6bfeebecebf525d4a927d1a4c9fe9efd6',
  programTemplateDigest: '6c833c964318da3e61e1743365f8763206be838647b5222c187b3bda8d1c6b9a',
  stageRegistryDigest: 'c8af046b5918f43a50af66886b0b5c9d2e22ea6501240d4b239101d8836ced1a',
  trustModelDigest: '4f6e4b3a191e0302ea44646659e8c2f71121af7d808cc0ee768269b4e156840d',
  historicalVerifierDigest: '82e49d577b79b41b26b67e25b7ce0fd81f26fb973232194fef8d96d6c563c6f9',
  historicalVerifierContractDigest: '925b4c23f1cad674720ee6a22fcd74cc2169b16bbc161be5d43535f20dd2ee31',
});

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonicalize = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
};
const canonicalBytes = (value) => Buffer.from(`${canonicalize(value)}\n`, 'utf8');
const fail = (code, detail) => { const error = new Error(detail); error.code = code; throw error; };
const assert = (condition, code, detail) => { if (!condition) fail(code, detail); };
const closed = (value, keys, label) => {
  assert(value && typeof value === 'object' && !Array.isArray(value), 'E_SCHEMA_TYPE', label);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  assert(canonicalize(actual) === canonicalize(expected), 'E_SCHEMA_KEYS', `${label}:${actual.join(',')}`);
};
const exact = (actual, expected, code, label) => assert(canonicalize(actual) === canonicalize(expected), code, label);
const hex = (value, length, label) => assert(typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(value), 'E_DIGEST_FORMAT', label);
const readCanonical = (file) => {
  let bytes;
  try { bytes = readFileSync(file); } catch { fail('E_INPUT_UNAVAILABLE', file); }
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { fail('E_JSON_PARSE', file); }
  assert(bytes.equals(canonicalBytes(value)), 'E_NON_CANONICAL_INPUT', file);
  return { bytes, value, digest: sha256(bytes) };
};
const safePath = (value) => {
  assert(typeof value === 'string' && value.length > 0, 'E_PATH_TYPE', String(value));
  assert(!value.startsWith('/') && !value.startsWith('file:') && !value.includes('\\') && !/(^|\/)\.\.(\/|$)/u.test(value) && !value.includes('*'), 'E_PATH_SCOPE', value);
};
const validateCommand = (command, index) => {
  closed(command, ['args', 'program'], `structuredCommands.${index}`);
  assert(['gh', 'git', 'node', 'npm'].includes(command.program), 'E_COMMAND_PROGRAM', command.program);
  assert(Array.isArray(command.args) && command.args.length > 0, 'E_COMMAND_ARGS', String(index));
  for (const arg of command.args) assert(typeof arg === 'string' && arg.length > 0 && !/[;&|`$><\n\r\0]/u.test(arg), 'E_COMMAND_SHELL_META', `${index}:${arg}`);
  return [command.program, ...command.args].join(' ');
};

export function verifyAuditR2Admission({ instanceFile, contractFile, verifierContractFile, amendmentFile, registryFile, programFile, verifierBytes }) {
  const instance = instanceFile.value;
  const contract = contractFile.value;
  const amendment = amendmentFile.value;
  closed(instance, ['acceptanceSignals','admissionContext','auditBinding','authorityCeiling','authorityTemplateId','baseSha','branch','commands','contractSha','deltaAdmission','dependencies','externalEffects','headSha','leaseBinding','model','ownerAuthorityBindingDigest','planDigest','prTarget','programAmendmentDigest','programTemplateDigest','reasoningEffort','schemaVersion','stageId','stageRegistryDigest','stopConditions','structuredCommands','targetRemote','treeSha','verifierCodeDigest','writeSet'], 'stageInstance');
  closed(contract, ['correctionId','exactAcceptanceSignals','exactAuthorityCeiling','exactCommands','exactDependencies','exactExternalEffects','exactInstanceDigest','exactLeaseBinding','exactStopConditions','exactStructuredCommands','exactWriteSet','fixedBindings','requiredFindingIds','schemaVersion','stageId'], 'correctionContract');
  closed(amendment, ['authority','correctionStage','effectiveAdmissionVerifier','fixedHistoricalBindings','programId','schemaVersion','standingOwnerAuthorityDigest'], 'programAmendment');
  closed(instance.writeSet, ['deletePaths','paths','renamePaths'], 'stageInstance.writeSet');
  closed(instance.prTarget, ['baseBranch','headBranch'], 'stageInstance.prTarget');
  closed(instance.admissionContext, ['authorityEpoch','observedAtUtc','policyEpoch'], 'stageInstance.admissionContext');
  closed(instance.auditBinding, ['auditedStateBindingDigest','auditReceiptDigest','classificationDigest','confirmedFindingIds','correctionId'], 'stageInstance.auditBinding');
  closed(instance.deltaAdmission, ['commitCount','disposition','fromAuditSha','patchSha256','pathListSha256','toCurrentSha'], 'stageInstance.deltaAdmission');
  closed(instance.leaseBinding, ['acquisitionEventDigest','fenceEventDigest','fencingCounter','ledgerPath','predecessorReleaseEventDigest','wip'], 'stageInstance.leaseBinding');
  closed(amendment.correctionStage, ['dependencies','stageId'], 'programAmendment.correctionStage');
  closed(amendment.effectiveAdmissionVerifier, ['codeDigest','contractDigest','status'], 'programAmendment.effectiveAdmissionVerifier');
  closed(verifierContractFile.value, ['closedSchemaPolicy','dependencyPolicy','ownerAuthorityBindingDigest','schemaVersion','structuredCommandPolicy','typedFailurePolicy'], 'verifierContract');
  closed(amendment.fixedHistoricalBindings, Object.keys(FIXED), 'programAmendment.fixedHistoricalBindings');
  exact(amendment.fixedHistoricalBindings, FIXED, 'E_FIXED_BINDING_MISMATCH', 'amendment.fixedHistoricalBindings');
  exact(contract.fixedBindings, FIXED, 'E_FIXED_BINDING_MISMATCH', 'contract.fixedBindings');
  assert(registryFile.digest === FIXED.stageRegistryDigest && programFile.digest === FIXED.programTemplateDigest, 'E_FIXED_BINDING_MISMATCH', 'program/registry');
  assert(instanceFile.digest === contract.exactInstanceDigest, 'E_STAGE_INSTANCE_DIGEST', instanceFile.digest);
  assert(instance.programAmendmentDigest === amendmentFile.digest, 'E_PROGRAM_AMENDMENT_DIGEST', instance.programAmendmentDigest);
  assert(instance.verifierCodeDigest === sha256(verifierBytes), 'E_SUCCESSOR_VERIFIER_DIGEST', instance.verifierCodeDigest);
  assert(amendment.effectiveAdmissionVerifier.codeDigest === instance.verifierCodeDigest && amendment.effectiveAdmissionVerifier.contractDigest === verifierContractFile.digest && amendment.effectiveAdmissionVerifier.status === 'RATIFIED_BY_DIRECT_AUDIT_R2_CORRECTION_AUTHORITY', 'E_EFFECTIVE_VERIFIER_BINDING', 'amendment');
  assert(verifierContractFile.value.schemaVersion === 'AUDIT_R2_STAGE_ADMISSION_VERIFIER_CONTRACT_V1' && verifierContractFile.value.ownerAuthorityBindingDigest === FIXED.ownerAuthorityBindingDigest && verifierContractFile.value.closedSchemaPolicy === 'REJECT_UNKNOWN_FIELDS_AT_EVERY_VALIDATED_LEVEL' && verifierContractFile.value.dependencyPolicy === 'EXACT_ORDERED_EQUALITY_NO_MISSING_EXTRA_DUPLICATE' && verifierContractFile.value.structuredCommandPolicy === 'ARGV_ONLY_NO_SHELL_METACHARACTERS' && verifierContractFile.value.typedFailurePolicy === 'EVERY_REJECTION_HAS_E_CODE', 'E_VERIFIER_CONTRACT', verifierContractFile.value.schemaVersion);
  assert(amendment.authority === 'AUDIT_ROUND_2_FINAL_CORRECTION_BRIEF' && amendment.standingOwnerAuthorityDigest === FIXED.ownerAuthorityBindingDigest, 'E_RATIFICATION_AUTHORITY', amendment.authority);
  assert(instance.schemaVersion === 'AUDIT_R2_FINAL_CORRECTION_STAGE_INSTANCE_V1' && instance.stageId === amendment.correctionStage.stageId && instance.stageId === contract.stageId, 'E_STAGE_IDENTITY', instance.stageId);
  assert(instance.ownerAuthorityBindingDigest === FIXED.ownerAuthorityBindingDigest && instance.programTemplateDigest === FIXED.programTemplateDigest && instance.planDigest === FIXED.programTemplateDigest && instance.stageRegistryDigest === FIXED.stageRegistryDigest, 'E_AUTHORITY_BINDING', instance.stageId);
  assert(instance.model === 'gpt-5.6-sol' && instance.reasoningEffort === 'xhigh', 'E_RUNTIME_BINDING', `${instance.model}/${instance.reasoningEffort}`);
  for (const field of ['baseSha','headSha','treeSha','contractSha']) hex(instance[field], 40, field);
  for (const field of ['auditedStateBindingDigest','auditReceiptDigest','classificationDigest']) hex(instance.auditBinding[field], 64, field);
  assert(instance.targetRemote === 'origin' && instance.prTarget.baseBranch === 'main' && instance.prTarget.headBranch === instance.branch && instance.branch.startsWith('codex/'), 'E_DELIVERY_TARGET', instance.branch);
  assert(instance.writeSet.deletePaths.length === 0 && instance.writeSet.renamePaths.length === 0, 'E_DESTRUCTIVE_WRITE', instance.stageId);
  assert(new Set(instance.writeSet.paths).size === instance.writeSet.paths.length, 'E_WRITE_SET_DUPLICATE', 'paths');
  instance.writeSet.paths.forEach(safePath);
  exact(instance.writeSet, contract.exactWriteSet, 'E_WRITE_SET_MISMATCH', 'writeSet');
  assert(Array.isArray(instance.structuredCommands), 'E_SCHEMA_TYPE', 'structuredCommands');
  const displays = instance.structuredCommands.map(validateCommand);
  exact(instance.commands, displays, 'E_COMMAND_DISPLAY_MISMATCH', 'commands');
  exact(instance.commands, contract.exactCommands, 'E_COMMAND_SET_MISMATCH', 'commands');
  exact(instance.structuredCommands, contract.exactStructuredCommands, 'E_STRUCTURED_COMMAND_SET_MISMATCH', 'structuredCommands');
  assert(Array.isArray(instance.dependencies), 'E_SCHEMA_TYPE', 'dependencies');
  for (const [index, dependency] of instance.dependencies.entries()) closed(dependency, ['attestationDigest','stageId','status'], `dependencies.${index}`);
  exact(instance.dependencies.map((item) => item.stageId), amendment.correctionStage.dependencies, 'E_DEPENDENCY_ORDER_MISMATCH', 'dependencies');
  exact(instance.dependencies, contract.exactDependencies, 'E_DEPENDENCY_ATTESTATION_MISMATCH', 'dependencies');
  assert(new Set(instance.dependencies.map((item) => item.stageId)).size === instance.dependencies.length, 'E_DEPENDENCY_DUPLICATE', 'dependencies');
  exact(instance.acceptanceSignals, contract.exactAcceptanceSignals, 'E_ACCEPTANCE_SET_MISMATCH', 'acceptanceSignals');
  exact(instance.stopConditions, contract.exactStopConditions, 'E_STOP_SET_MISMATCH', 'stopConditions');
  exact(instance.authorityCeiling, contract.exactAuthorityCeiling, 'E_AUTHORITY_SET_MISMATCH', 'authorityCeiling');
  exact(instance.externalEffects, contract.exactExternalEffects, 'E_EXTERNAL_EFFECT_SET_MISMATCH', 'externalEffects');
  exact(instance.leaseBinding, contract.exactLeaseBinding, 'E_LEASE_BINDING_MISMATCH', 'leaseBinding');
  assert(instance.leaseBinding.fencingCounter === 54 && instance.leaseBinding.wip === 1, 'E_LEASE_COUNTER', String(instance.leaseBinding.fencingCounter));
  exact(instance.auditBinding.confirmedFindingIds, contract.requiredFindingIds, 'E_AUDIT_FINDING_SET', 'findings');
  assert(instance.auditBinding.correctionId === contract.correctionId, 'E_CORRECTION_ID', instance.auditBinding.correctionId);
  return {schemaVersion:'AUDIT_R2_STAGE_ADMISSION_ATTESTATION_V1',status:'ADMITTED',stageId:instance.stageId,correctionId:contract.correctionId,stageInstanceDigest:instanceFile.digest,programAmendmentDigest:amendmentFile.digest,ownerAuthorityBindingDigest:instance.ownerAuthorityBindingDigest,successorVerifierCodeDigest:sha256(verifierBytes),successorVerifierContractDigest:verifierContractFile.digest,exactDependencySetDigest:sha256(canonicalBytes(instance.dependencies)),exactStructuredCommandsDigest:sha256(canonicalBytes(instance.structuredCommands)),exactWriteSetDigest:sha256(canonicalBytes(instance.writeSet)),exactAcceptanceSignalsDigest:sha256(canonicalBytes(instance.acceptanceSignals)),predecessorReleaseEventDigest:instance.leaseBinding.predecessorReleaseEventDigest,leaseAcquisitionEventDigest:instance.leaseBinding.acquisitionEventDigest,fenceEventDigest:instance.leaseBinding.fenceEventDigest,fencingCounter:instance.leaseBinding.fencingCounter,decision:'DIRECT_OWNER_AUTHORITY_BOUND_APPEND_ONLY_SUCCESSOR_ADMITTED'};
}

const args = Object.fromEntries(process.argv.slice(2).reduce((rows, item, index, all) => item.startsWith('--') ? [...rows, [item.slice(2), all[index + 1]]] : rows, []));
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    for (const key of ['instance','contract','verifier-contract','amendment','registry','program']) assert(args[key], 'E_USAGE', key);
    const result = verifyAuditR2Admission({instanceFile:readCanonical(args.instance),contractFile:readCanonical(args.contract),verifierContractFile:readCanonical(args['verifier-contract']),amendmentFile:readCanonical(args.amendment),registryFile:readCanonical(args.registry),programFile:readCanonical(args.program),verifierBytes:readFileSync(process.argv[1])});
    process.stdout.write(canonicalBytes(result));
  } catch (error) {
    process.stderr.write(`${canonicalize({code:error.code ?? 'E_UNTYPED',message:error.message})}\n`);
    process.exitCode = 1;
  }
}
