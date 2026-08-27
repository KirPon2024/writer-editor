import { execFileSync } from "node:child_process";
import process from "node:process";
import { canonicalBytes, canonicalize, readCanonicalJson } from "./canonical-json.mjs";

function fail(code, detail) {
  const error = new Error(`${code}: ${detail}`);
  error.code = code;
  throw error;
}

function assert(condition, code, detail) {
  if (!condition) fail(code, detail);
}

function hex(value, length, field) {
  assert(typeof value === "string" && new RegExp(`^[0-9a-f]{${length}}$`).test(value), "E_IDENTITY_INVALID", field);
}

export function verifyTerminalAttestation({
  attestationFile,
  trustFile,
  programFile,
  instanceFile,
  admissionFile,
  runEvidence,
  artifactEvidence
}) {
  assert(attestationFile && trustFile && programFile && instanceFile && admissionFile, "E_TRUST_INPUT_UNAVAILABLE", "canonical inputs");
  assert(runEvidence && artifactEvidence, "E_EXTERNAL_EVIDENCE_UNAVAILABLE", "GitHub API evidence");
  const { value: attestation } = attestationFile;
  const { value: trust, digest: trustDigest } = trustFile;
  const { digest: programDigest } = programFile;
  const { value: instance, digest: instanceDigest } = instanceFile;
  const { value: admission, digest: admissionDigest } = admissionFile;
  assert(trust.programTemplateDigest === programDigest, "E_TRUST_PROGRAM_BINDING", trustDigest);
  assert(trust.policy?.verification?.unavailableOrCompromised === "FAIL_CLOSED", "E_TRUST_POLICY_WEAKENED", trustDigest);
  assert(trust.policy?.issuer?.selfIssuedLocalReceiptAccepted === false, "E_SELF_ISSUED_TRUST", trustDigest);
  assert(attestation.schemaVersion === "TERMINAL_ATTESTATION_V1" && attestation.attestationType === "EXTERNAL_IMMUTABLE_TERMINAL_ATTESTATION", "E_ATTESTATION_SCHEMA", "identity");
  assert(attestation.result === "PASS", "E_TERMINAL_RESULT", attestation.result);
  assert(attestation.stageId === instance.stageId && admission.stageId === instance.stageId, "E_STAGE_IDENTITY", attestation.stageId);
  assert(attestation.programTemplateDigest === programDigest && instance.programTemplateDigest === programDigest && admission.programTemplateDigest === programDigest, "E_PROGRAM_DIGEST_MISMATCH", programDigest);
  assert(attestation.stageInstanceDigest === instanceDigest && admission.stageInstanceDigest === instanceDigest, "E_STAGE_INSTANCE_DIGEST_MISMATCH", instanceDigest);
  assert(attestation.stageAdmissionAttestationDigest === admissionDigest, "E_ADMISSION_DIGEST_MISMATCH", admissionDigest);
  assert(attestation.acceptanceSignalsDigest === admission.acceptanceSignalsDigest, "E_ACCEPTANCE_DIGEST_MISMATCH", admission.acceptanceSignalsDigest);
  assert(admission.status === "ADMITTED", "E_STAGE_NOT_ADMITTED", admission.status);
  hex(attestation.implementationCandidateSha, 40, "implementationCandidateSha");
  hex(attestation.implementationMergeSha, 40, "implementationMergeSha");
  hex(attestation.evaluationSha, 40, "evaluationSha");
  hex(attestation.evaluationTreeSha, 40, "evaluationTreeSha");
  assert(attestation.receiptCarrierSha === null && attestation.closureMergeSha === null, "E_RECURSIVE_CLOSURE", "closure carrier forbidden for preferred flow");
  const issuer = trust.policy.issuer;
  assert(attestation.repository === issuer.repository && runEvidence.repository?.full_name === issuer.repository, "E_REPOSITORY_IDENTITY", attestation.repository);
  assert(attestation.workflowPath === issuer.workflowPath && runEvidence.path === issuer.workflowPath, "E_WORKFLOW_IDENTITY", attestation.workflowPath);
  assert(attestation.ref === issuer.ref && runEvidence.head_branch === "main", "E_REF_IDENTITY", attestation.ref);
  assert(attestation.event === "workflow_dispatch" && runEvidence.event === "workflow_dispatch", "E_EVENT_IDENTITY", attestation.event);
  assert(Number(attestation.workflowRunId) === Number(runEvidence.id), "E_RUN_IDENTITY", attestation.workflowRunId);
  assert(Number(attestation.runAttempt) === Number(runEvidence.run_attempt), "E_RUN_ATTEMPT", attestation.runAttempt);
  assert(runEvidence.status === "completed" && runEvidence.conclusion === "success", "E_RUN_NOT_SUCCESSFUL", `${runEvidence.status}/${runEvidence.conclusion}`);
  assert(runEvidence.head_sha === attestation.evaluationSha, "E_EVALUATION_SHA_MISMATCH", runEvidence.head_sha);
  assert(artifactEvidence.expired === false, "E_ARTIFACT_EXPIRED", artifactEvidence.id);
  assert(artifactEvidence.name === `r24-terminal-attestation-${attestation.stageId}`, "E_ARTIFACT_IDENTITY", artifactEvidence.name);
  assert(Number(artifactEvidence.workflow_run?.id) === Number(runEvidence.id), "E_ARTIFACT_RUN_MISMATCH", artifactEvidence.id);
  assert(typeof artifactEvidence.digest === "string" && artifactEvidence.digest.startsWith("sha256:"), "E_ARTIFACT_DIGEST_UNAVAILABLE", artifactEvidence.id);
  return {
    schemaVersion: "TERMINAL_ATTESTATION_VALIDATION_V1",
    status: "VERIFIED",
    stageId: attestation.stageId,
    programTemplateDigest: programDigest,
    trustModelDigest: trustDigest,
    stageInstanceDigest: instanceDigest,
    stageAdmissionAttestationDigest: admissionDigest,
    evaluationSha: attestation.evaluationSha,
    evaluationTreeSha: attestation.evaluationTreeSha,
    externalRunId: Number(runEvidence.id),
    externalArtifactId: Number(artifactEvidence.id),
    externalArtifactDigest: artifactEvidence.digest,
    decision: "EXTERNAL_IMMUTABLE_TERMINAL_ATTESTATION_VERIFIED"
  };
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) continue;
    result[argv[index].slice(2)] = argv[index + 1];
    index += 1;
  }
  return result;
}

function ghJson(endpoint) {
  return JSON.parse(execFileSync("gh", ["api", endpoint], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const attestationFile = readCanonicalJson(options.attestation);
    const trustFile = readCanonicalJson(options.trust);
    const programFile = readCanonicalJson(options.program);
    const instanceFile = readCanonicalJson(options["stage-instance"]);
    const admissionFile = readCanonicalJson(options["stage-admission"]);
    const repository = attestationFile.value.repository;
    const runId = attestationFile.value.workflowRunId;
    const runEvidence = options["run-evidence"]
      ? readCanonicalJson(options["run-evidence"]).value
      : ghJson(`repos/${repository}/actions/runs/${runId}`);
    const artifactList = options["artifact-evidence"]
      ? { artifacts: [readCanonicalJson(options["artifact-evidence"]).value] }
      : ghJson(`repos/${repository}/actions/runs/${runId}/artifacts`);
    const artifactEvidence = artifactList.artifacts.find((entry) => entry.name === `r24-terminal-attestation-${attestationFile.value.stageId}`);
    const result = verifyTerminalAttestation({
      attestationFile,
      trustFile,
      programFile,
      instanceFile,
      admissionFile,
      runEvidence,
      artifactEvidence
    });
    process.stdout.write(canonicalBytes(result));
  } catch (error) {
    process.stderr.write(`${canonicalize({ code: error.code ?? "E_UNTYPED", message: error.message })}\n`);
    process.exitCode = 1;
  }
}
