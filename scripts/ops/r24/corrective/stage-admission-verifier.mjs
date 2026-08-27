import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

export function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
}

export function canonicalBytes(value) {
  return Buffer.from(`${canonicalize(value)}\n`, "utf8");
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function fail(code, detail) {
  const error = new Error(`${code}: ${detail}`);
  error.code = code;
  throw error;
}

function assert(condition, code, detail) {
  if (!condition) fail(code, detail);
}

function canonicalFile(filename) {
  const bytes = readFileSync(filename);
  const value = JSON.parse(bytes.toString("utf8"));
  assert(bytes.equals(canonicalBytes(value)), "E_NON_CANONICAL_INPUT", path.basename(filename));
  return { bytes, value, digest: sha256(bytes) };
}

export function normalizeRepoPath(candidate) {
  assert(typeof candidate === "string" && candidate.length > 0, "E_PATH_INVALID", "path must be non-empty");
  assert(candidate === candidate.normalize("NFC"), "E_PATH_NOT_NFC", candidate);
  assert(!candidate.includes("\\") && !candidate.includes("\0"), "E_PATH_INVALID", candidate);
  assert(!path.posix.isAbsolute(candidate), "E_PATH_ABSOLUTE", candidate);
  const normalized = path.posix.normalize(candidate);
  assert(normalized === candidate, "E_PATH_NOT_NORMALIZED", candidate);
  assert(candidate !== "." && !candidate.startsWith("../") && !candidate.includes("/../"), "E_PATH_ESCAPE", candidate);
  assert(!candidate.split("/").some((part) => part === "" || part === "." || part === ".."), "E_PATH_AMBIGUOUS", candidate);
  return candidate;
}

function uniqueStrings(values, field) {
  assert(Array.isArray(values), "E_FIELD_TYPE", field);
  const seen = new Set();
  for (const value of values) {
    assert(typeof value === "string" && value.length > 0, "E_FIELD_TYPE", field);
    const key = value.normalize("NFC").toLocaleLowerCase("en-US");
    assert(!seen.has(key), "E_DUPLICATE_VALUE", `${field}:${value}`);
    seen.add(key);
  }
}

function assertSubset(actual, allowed, field) {
  uniqueStrings(actual, field);
  const allowedSet = new Set(allowed);
  for (const value of actual) assert(allowedSet.has(value), "E_SCOPE_EXPANSION", `${field}:${value}`);
}

function pathAllowed(candidate, template) {
  if (template.allowedWritePaths.includes(candidate)) return true;
  return template.allowedWritePrefixes.some((prefix) => candidate.startsWith(prefix));
}

function commandAllowed(candidate, template) {
  if (template.allowedCommands.includes(candidate)) return true;
  return template.allowedCommandPrefixes.some((prefix) => candidate.startsWith(prefix));
}

function assertHex(value, length, field) {
  assert(typeof value === "string" && new RegExp(`^[0-9a-f]{${length}}$`).test(value), "E_IDENTITY_INVALID", field);
}

export function verifyStageAdmission({ instanceBytes, instance, registryBytes, registry, programBytes, program }) {
  const instanceDigest = sha256(instanceBytes);
  const registryDigest = sha256(registryBytes);
  const programDigest = sha256(programBytes);
  assert(instanceBytes.equals(canonicalBytes(instance)), "E_NON_CANONICAL_INPUT", "stage-instance");
  assert(registryBytes.equals(canonicalBytes(registry)), "E_NON_CANONICAL_INPUT", "stage-registry");
  assert(programBytes.equals(canonicalBytes(program)), "E_NON_CANONICAL_INPUT", "program-template");
  assert(programDigest === instance.programTemplateDigest, "E_PROGRAM_DIGEST_MISMATCH", "programTemplateDigest");
  assert(registryDigest === program.stageRegistryDigest, "E_REGISTRY_DIGEST_MISMATCH", "stageRegistryDigest");
  assert(instance.stageRegistryDigest === registryDigest, "E_REGISTRY_DIGEST_MISMATCH", "instance stageRegistryDigest");
  assert(instance.verifierCodeDigest === program.stageAdmissionVerifier.codeDigest, "E_VERIFIER_DIGEST_MISMATCH", "codeDigest");
  assert(instance.verifierContractDigest === program.stageAdmissionVerifier.contractDigest, "E_VERIFIER_DIGEST_MISMATCH", "contractDigest");
  assert(instance.authorityTemplateId === registry.authorityTemplateId, "E_AUTHORITY_TEMPLATE_MISMATCH", "authorityTemplateId");
  assert(typeof instance.ownerAuthorityBindingDigest === "string" && /^[0-9a-f]{64}$/.test(instance.ownerAuthorityBindingDigest), "E_OWNER_AUTHORITY_MISSING", "ownerAuthorityBindingDigest");
  const template = registry.stages.find((entry) => entry.stageId === instance.stageId);
  assert(template, "E_UNKNOWN_STAGE", instance.stageId);
  assert(instance.schemaVersion === "STAGE_INSTANCE_V1", "E_SCHEMA_VERSION", "stage instance");
  assert(instance.model === "gpt-5.6-sol" && instance.reasoningEffort === "xhigh", "E_RUNTIME_BINDING", "fixed runtime");
  assert(instance.targetRemote === template.targetRemote, "E_REMOTE_SCOPE", instance.targetRemote);
  assertHex(instance.planDigest, 64, "planDigest");
  assert(instance.planDigest === programDigest, "E_PLAN_DIGEST_MISMATCH", "planDigest");
  assertHex(instance.contractSha, 40, "contractSha");
  assertHex(instance.baseSha, 40, "baseSha");
  assertHex(instance.headSha, 40, "headSha");
  assertHex(instance.treeSha, 40, "treeSha");
  assert(typeof instance.branch === "string" && instance.branch.startsWith("codex/"), "E_BRANCH_SCOPE", instance.branch);
  assert(instance.prTarget && instance.prTarget.baseBranch === template.prBaseBranch, "E_PR_TARGET", "baseBranch");
  assert(instance.prTarget.headBranch === instance.branch, "E_PR_TARGET", "headBranch");
  assert(typeof instance.admissionContext?.observedAtUtc === "string" && /Z$/.test(instance.admissionContext.observedAtUtc), "E_OBSERVATION_TIME", "observedAtUtc");
  uniqueStrings(instance.writeSet.paths, "writeSet.paths");
  uniqueStrings(instance.writeSet.deletePaths, "writeSet.deletePaths");
  uniqueStrings(instance.writeSet.renamePaths, "writeSet.renamePaths");
  const pathKeys = new Set();
  for (const field of ["paths", "deletePaths", "renamePaths"]) {
    for (const candidate of instance.writeSet[field]) {
      normalizeRepoPath(candidate);
      const key = candidate.toLocaleLowerCase("en-US");
      assert(!pathKeys.has(key), "E_WRITE_PATH_OVERLAP", candidate);
      pathKeys.add(key);
      assert(pathAllowed(candidate, template), "E_WRITE_SCOPE_EXPANSION", candidate);
    }
  }
  assert(instance.writeSet.deletePaths.length === 0 || template.allowDeletes, "E_DELETE_NOT_AUTHORIZED", instance.stageId);
  assert(instance.writeSet.renamePaths.length === 0 || template.allowRenames, "E_RENAME_NOT_AUTHORIZED", instance.stageId);
  uniqueStrings(instance.commands, "commands");
  for (const command of instance.commands) assert(commandAllowed(command, template), "E_COMMAND_SCOPE_EXPANSION", command);
  assertSubset(instance.authorityCeiling, template.authorityCeiling, "authorityCeiling");
  assertSubset(instance.externalEffects, template.externalEffects, "externalEffects");
  uniqueStrings(instance.acceptanceSignals, "acceptanceSignals");
  const signals = new Set(instance.acceptanceSignals);
  for (const required of template.requiredAcceptanceSignals) assert(signals.has(required), "E_ACCEPTANCE_WEAKENED", required);
  uniqueStrings(instance.stopConditions, "stopConditions");
  const stops = new Set(instance.stopConditions);
  for (const required of registry.globalRequiredStopConditions) assert(stops.has(required), "E_STOP_CONDITION_MISSING", required);
  for (const required of template.requiredStopConditions) assert(stops.has(required), "E_STOP_CONDITION_MISSING", required);
  assert(Array.isArray(instance.dependencies), "E_FIELD_TYPE", "dependencies");
  const dependencyIds = instance.dependencies.map((entry) => entry.stageId);
  assertSubset(dependencyIds, template.dependencies, "dependencies");
  for (const dependency of instance.dependencies) {
    assertHex(dependency.attestationDigest, 64, `dependency:${dependency.stageId}`);
    assert(dependency.status === "CERTIFIED_DONE" || dependency.status === "OPTIONAL_NEUTRAL", "E_DEPENDENCY_STATE", dependency.stageId);
  }
  return {
    schemaVersion: "STAGE_ADMISSION_ATTESTATION_V1",
    attestationType: "STAGE_ADMISSION_ATTESTATION",
    status: "ADMITTED",
    stageId: instance.stageId,
    stageInstanceDigest: instanceDigest,
    authorityTemplateId: registry.authorityTemplateId,
    ownerAuthorityBindingDigest: instance.ownerAuthorityBindingDigest,
    programTemplateDigest: programDigest,
    stageRegistryDigest: registryDigest,
    verifierCodeDigest: instance.verifierCodeDigest,
    verifierContractDigest: instance.verifierContractDigest,
    exactIdentity: {
      baseSha: instance.baseSha,
      headSha: instance.headSha,
      treeSha: instance.treeSha,
      branch: instance.branch,
      targetRemote: instance.targetRemote
    },
    authorityCeiling: [...instance.authorityCeiling].sort(),
    writeSetDigest: sha256(canonicalBytes(instance.writeSet)),
    acceptanceSignalsDigest: sha256(canonicalBytes([...instance.acceptanceSignals].sort())),
    authorityEpoch: instance.admissionContext.authorityEpoch,
    policyEpoch: instance.admissionContext.policyEpoch,
    observedAtUtc: instance.admissionContext.observedAtUtc,
    decision: "INSTANCE_IS_SUBSET_OF_OWNER_APPROVED_TEMPLATE"
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const [instancePath, registryPath, programPath] = process.argv.slice(2);
    assert(instancePath && registryPath && programPath, "E_USAGE", "instance registry program");
    const instanceFile = canonicalFile(instancePath);
    const registryFile = canonicalFile(registryPath);
    const programFile = canonicalFile(programPath);
    const attestation = verifyStageAdmission({
      instanceBytes: instanceFile.bytes,
      instance: instanceFile.value,
      registryBytes: registryFile.bytes,
      registry: registryFile.value,
      programBytes: programFile.bytes,
      program: programFile.value
    });
    process.stdout.write(canonicalBytes(attestation));
  } catch (error) {
    process.stderr.write(`${canonicalize({ code: error.code ?? "E_UNTYPED", message: error.message })}\n`);
    process.exitCode = 1;
  }
}
