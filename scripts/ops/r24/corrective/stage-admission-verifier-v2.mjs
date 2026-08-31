#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const fail = (code, detail = '') => { throw new Error(`${code}${detail ? `:${detail}` : ''}`); };
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const exactKeys = (value, keys, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('E_OBJECT', label);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail('E_UNKNOWN_OR_MISSING_FIELD', `${label}:${actual.join(',')}`);
};
const readJson = (file) => {
  const bytes = fs.readFileSync(file);
  if (bytes.length === 0 || bytes[bytes.length - 1] !== 0x0a) fail('E_CANONICAL_LF', file);
  return { bytes, digest: sha256(bytes), value: JSON.parse(bytes.toString('utf8')) };
};
const assertHex = (value, size, label) => {
  if (typeof value !== 'string' || !new RegExp(`^[0-9a-f]{${size}}$`).test(value)) fail('E_HEX', label);
};
const validateRepoPath = (relative, label) => {
  if (typeof relative !== 'string' || relative.length === 0) fail('E_PATH_EMPTY', label);
  if (relative !== relative.normalize('NFC')) fail('E_PATH_NOT_NFC', relative);
  if (relative.includes('\\') || relative.startsWith('/') || /^[A-Za-z]:/.test(relative)) fail('E_PATH_NOT_POSIX_RELATIVE', relative);
  const parts = relative.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || part.includes('\0'))) fail('E_PATH_SEGMENT', relative);
  if (path.posix.normalize(relative) !== relative) fail('E_PATH_NORMALIZATION', relative);
  return relative;
};
const CONFUSABLES = new Map(Object.entries({
  '\u0430':'a','\u0435':'e','\u043e':'o','\u0440':'p','\u0441':'c','\u0445':'x','\u0443':'y','\u043a':'k','\u043c':'m','\u0442':'t','\u0432':'b','\u043d':'h','\u0456':'i','\u0458':'j','\u0455':'s','\u04cf':'l',
  '\u03b1':'a','\u03b2':'b','\u03b5':'e','\u03b7':'h','\u03b9':'i','\u03ba':'k','\u03bc':'m','\u03bd':'v','\u03bf':'o','\u03c1':'p','\u03c4':'t','\u03c5':'y','\u03c7':'x','\u03f2':'c','\u03f3':'j'
}));
const caseFoldPath = (value) => value.toLowerCase();
const confusableSkeleton = (value) => [...value.normalize('NFKC').toLowerCase()].map((character) => CONFUSABLES.get(character) ?? character).join('');
const rejectAmbiguousPaths = (values) => {
  for (const [kind, keyOf, code] of [
    ['case-fold', caseFoldPath, 'E_PATH_CASEFOLD_COLLISION'],
    ['confusable-skeleton', confusableSkeleton, 'E_PATH_CONFUSABLE_COLLISION']
  ]) {
    const seen = new Map();
    for (const value of values) {
      const key = keyOf(value);
      const previous = seen.get(key);
      if (previous !== undefined && previous !== value) fail(code, `${kind}:${previous}:${value}`);
      seen.set(key, value);
    }
  }
};
const ensureContained = (repoReal, absolute, label) => {
  const relative = path.relative(repoReal, absolute);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) fail('E_PATH_ESCAPE', label);
};
const inspectComponents = (repoReal, relative, allowMissingLeaf) => {
  const parts = relative.split('/');
  let cursor = repoReal;
  for (let index = 0; index < parts.length; index += 1) {
    cursor = path.join(cursor, parts[index]);
    const leaf = index === parts.length - 1;
    try {
      const stat = fs.lstatSync(cursor);
      if (stat.isSymbolicLink()) fail('E_SYMLINK_COMPONENT', relative);
      if (!leaf && !stat.isDirectory()) fail('E_NON_DIRECTORY_COMPONENT', relative);
      ensureContained(repoReal, fs.realpathSync(cursor), relative);
    } catch (error) {
      if (error?.code === 'ENOENT' && leaf && allowMissingLeaf) return false;
      if (error?.message?.startsWith('E_')) throw error;
      fail('E_MISSING_COMPONENT', relative);
    }
  }
  return true;
};
const uniqueSorted = (values, label) => {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) fail('E_PATH_ARRAY', label);
  if (new Set(values).size !== values.length) fail('E_DUPLICATE_PATH', label);
  if (JSON.stringify(values) !== JSON.stringify([...values].sort())) fail('E_PATH_ORDER', label);
};

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, item, index, all) => {
  if (!item.startsWith('--') || index % 2 !== 0) return pairs;
  pairs.push([item.slice(2), all[index + 1]]);
  return pairs;
}, []));
for (const key of ['repo-root', 'authority', 'stage-instance', 'stage-admission', 'expected-verifier-digest', 'expected-authority-digest']) if (!args[key]) fail('E_ARG', key);
assertHex(args['expected-verifier-digest'], 64, 'expected-verifier-digest');
assertHex(args['expected-authority-digest'], 64, 'expected-authority-digest');
const selfDigest = sha256(fs.readFileSync(new URL(import.meta.url)));
if (selfDigest !== args['expected-verifier-digest']) fail('E_VERIFIER_BYTES', selfDigest);

const repoRoot = fs.realpathSync(args['repo-root']);
const authority = readJson(args.authority);
const instance = readJson(args['stage-instance']);
const admission = readJson(args['stage-admission']);
if (authority.digest !== args['expected-authority-digest']) fail('E_AUTHORITY_BYTES', authority.digest);
exactKeys(authority.value, ['schemaVersion','authorityId','ownerAuthorityBindingDigest','sourcePlanDigest','externalSourcePlanDigest','compiledProgramFileDigest','baseSha','baseTree','branch','stageId','verifierDigest','fixedBindings','allowedCommands','allowedOperations','acceptanceSignals','authorityCeiling','externalEffects','predecessors','lease'], 'authority');
exactKeys(instance.value, ['schemaVersion','stageId','authorityId','ownerAuthorityBindingDigest','sourcePlanDigest','externalSourcePlanDigest','compiledProgramFileDigest','baseSha','headSha','treeSha','branch','targetRemote','fixedBindings','operations','commands','acceptanceSignals','authorityCeiling','externalEffects','predecessors','lease','model','reasoningEffort','stopConditions'], 'stageInstance');
exactKeys(admission.value, ['schemaVersion','attestationType','status','decision','stageId','authorityId','authorityDigest','ownerAuthorityBindingDigest','sourcePlanDigest','externalSourcePlanDigest','compiledProgramFileDigest','stageInstanceDigest','writeSetDigest','commandScopeDigest','acceptanceSignalsDigest','verifierDigest','exactIdentity','lease','observedAtUtc'], 'stageAdmission');
exactKeys(instance.value.operations, ['readPaths','modifyPaths','createPaths','deletePaths','renamePairs'], 'operations');
exactKeys(authority.value.allowedOperations, ['readPaths','modifyPaths','createPaths','deletePaths','renamePairs'], 'allowedOperations');
exactKeys(instance.value.lease, ['fencingCounter','status','wip','predecessorReleaseDigest'], 'instance.lease');
exactKeys(admission.value.lease, ['fencingCounter','status','wip','predecessorReleaseDigest'], 'admission.lease');
exactKeys(admission.value.exactIdentity, ['baseSha','headSha','treeSha','branch','targetRemote'], 'admission.exactIdentity');
if (authority.value.schemaVersion !== 'POST_AUDIT_CORRECTIONS_OWNER_AUTHORITY_V1' || instance.value.schemaVersion !== 'STAGE_INSTANCE_V2' || admission.value.schemaVersion !== 'STAGE_ADMISSION_ATTESTATION_V2') fail('E_SCHEMA');
if (authority.value.sourcePlanDigest !== authority.value.externalSourcePlanDigest || authority.value.externalSourcePlanDigest !== '1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a' || authority.value.compiledProgramFileDigest !== 'da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a') fail('E_SOURCE_PLAN_ROLE_BINDING');
if (authority.value.verifierDigest !== selfDigest || admission.value.verifierDigest !== selfDigest) fail('E_VERIFIER_BINDING');
if (admission.value.authorityDigest !== authority.digest) fail('E_ADMISSION_AUTHORITY_BINDING');
for (const field of ['stageId','authorityId','ownerAuthorityBindingDigest','sourcePlanDigest','externalSourcePlanDigest','compiledProgramFileDigest','baseSha','baseTree','branch','fixedBindings','acceptanceSignals','authorityCeiling','externalEffects','predecessors','lease']) {
  const instanceField = field === 'baseTree' ? 'treeSha' : field;
  if (JSON.stringify(authority.value[field]) !== JSON.stringify(instance.value[instanceField])) fail('E_AUTHORITY_BINDING', field);
}
if (instance.value.headSha !== authority.value.baseSha || instance.value.targetRemote !== 'origin' || instance.value.model !== 'gpt-5.6-sol' || instance.value.reasoningEffort !== 'xhigh') fail('E_RUNTIME_OR_IDENTITY');
if (JSON.stringify(authority.value.allowedCommands) !== JSON.stringify(instance.value.commands)) fail('E_COMMAND_SCOPE');
if (JSON.stringify(authority.value.allowedOperations) !== JSON.stringify(instance.value.operations)) fail('E_OPERATION_SCOPE');
if (!Array.isArray(instance.value.fixedBindings) || instance.value.fixedBindings.length === 0) fail('E_FIXED_BINDINGS');
for (const binding of instance.value.fixedBindings) {
  exactKeys(binding, ['path','sha256'], 'fixedBinding');
  validateRepoPath(binding.path, 'fixedBinding.path'); assertHex(binding.sha256, 64, 'fixedBinding.sha256');
  if (!inspectComponents(repoRoot, binding.path, false)) fail('E_FIXED_BINDING_MISSING', binding.path);
  if (sha256(fs.readFileSync(path.join(repoRoot, binding.path))) !== binding.sha256) fail('E_FIXED_BINDING_BYTES', binding.path);
}
const all = [];
for (const kind of ['readPaths','modifyPaths','createPaths','deletePaths']) {
  const values = instance.value.operations[kind];
  uniqueSorted(values, kind);
  for (const relative of values) { validateRepoPath(relative, kind); all.push(relative); }
}
if (!Array.isArray(instance.value.operations.renamePairs)) fail('E_RENAME_ARRAY');
for (const pair of instance.value.operations.renamePairs) {
  exactKeys(pair, ['from','to'], 'renamePair');
  validateRepoPath(pair.from, 'rename.from'); validateRepoPath(pair.to, 'rename.to');
  all.push(pair.from, pair.to);
}
if (new Set(all).size !== all.length) fail('E_OPERATION_CLASS_COLLISION');
rejectAmbiguousPaths(all);
for (const relative of instance.value.operations.readPaths) if (!inspectComponents(repoRoot, relative, false)) fail('E_READ_MISSING', relative);
for (const relative of instance.value.operations.modifyPaths) if (!inspectComponents(repoRoot, relative, false)) fail('E_MODIFY_MISSING', relative);
for (const relative of instance.value.operations.deletePaths) if (!inspectComponents(repoRoot, relative, false)) fail('E_DELETE_MISSING', relative);
for (const relative of instance.value.operations.createPaths) if (inspectComponents(repoRoot, relative, true)) fail('E_CREATE_EXISTS', relative);
for (const pair of instance.value.operations.renamePairs) {
  if (!inspectComponents(repoRoot, pair.from, false)) fail('E_RENAME_SOURCE_MISSING', pair.from);
  if (inspectComponents(repoRoot, pair.to, true)) fail('E_RENAME_TARGET_EXISTS', pair.to);
}
const writeSet = { createPaths: instance.value.operations.createPaths, deletePaths: instance.value.operations.deletePaths, modifyPaths: instance.value.operations.modifyPaths, renamePairs: instance.value.operations.renamePairs };
const writeSetDigest = sha256(Buffer.from(canonical(writeSet)));
const commandScopeDigest = sha256(Buffer.from(canonical(instance.value.commands)));
const acceptanceSignalsDigest = sha256(Buffer.from(canonical(instance.value.acceptanceSignals)));
if (admission.value.stageInstanceDigest !== instance.digest || admission.value.writeSetDigest !== writeSetDigest || admission.value.commandScopeDigest !== commandScopeDigest || admission.value.acceptanceSignalsDigest !== acceptanceSignalsDigest) fail('E_ADMISSION_DIGEST_BINDING');
if (admission.value.status !== 'ADMITTED' || admission.value.decision !== 'INSTANCE_IS_EXACT_SUBSET_OF_OWNER_AUTHORIZED_SUCCESSOR') fail('E_NOT_ADMITTED');
if (admission.value.sourcePlanDigest !== instance.value.sourcePlanDigest || admission.value.externalSourcePlanDigest !== instance.value.externalSourcePlanDigest || admission.value.compiledProgramFileDigest !== instance.value.compiledProgramFileDigest) fail('E_ADMISSION_SOURCE_PLAN_ROLE_BINDING');
if (JSON.stringify(admission.value.exactIdentity) !== JSON.stringify({baseSha:instance.value.baseSha,headSha:instance.value.headSha,treeSha:instance.value.treeSha,branch:instance.value.branch,targetRemote:instance.value.targetRemote})) fail('E_ADMISSION_IDENTITY');
if (JSON.stringify(admission.value.lease) !== JSON.stringify(instance.value.lease)) fail('E_ADMISSION_LEASE');
process.stdout.write(`${JSON.stringify({schemaVersion:'STAGE_ADMISSION_VERIFIER_V2_RESULT',status:'PASS',authorityDigest:authority.digest,stageInstanceDigest:instance.digest,stageAdmissionDigest:admission.digest,writeSetDigest,commandScopeDigest,acceptanceSignalsDigest,verifierDigest:selfDigest,repoRoot})}\n`);
