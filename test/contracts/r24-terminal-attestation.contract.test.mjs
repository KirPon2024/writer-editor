import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canonicalBytes,
  sha256
} from "../../scripts/ops/r24/corrective/canonical-json.mjs";
import { verifyTerminalAttestation } from "../../scripts/ops/r24/corrective/terminal-attestation-verifier.mjs";

const file = (path) => {
  const bytes = readFileSync(path);
  return { bytes, value: JSON.parse(bytes), digest: sha256(bytes) };
};

const WORKFLOW_PATH = ".github/workflows/r24-terminal-attestation.yml";

function fixture() {
  const trustFile = file("docs/OPS/R24/CORRECTIVE/TERMINAL_ATTESTATION_TRUST_MODEL_V1.json");
  const programFile = file("docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json");
  const instanceFile = file("docs/OPS/R24/CORRECTIVE/B0_STAGE_INSTANCE_V1.json");
  const admissionFile = file("docs/OPS/R24/CORRECTIVE/B0_STAGE_ADMISSION_ATTESTATION_V1.json");
  const attestation = {
    schemaVersion: "TERMINAL_ATTESTATION_V1",
    attestationType: "EXTERNAL_IMMUTABLE_TERMINAL_ATTESTATION",
    result: "PASS",
    stageId: "B0",
    programTemplateDigest: programFile.digest,
    stageInstanceDigest: instanceFile.digest,
    stageAdmissionAttestationDigest: admissionFile.digest,
    acceptanceSignalsDigest: admissionFile.value.acceptanceSignalsDigest,
    implementationCandidateSha: "1".repeat(40),
    implementationMergeSha: "2".repeat(40),
    evaluationSha: "2".repeat(40),
    evaluationTreeSha: "3".repeat(40),
    receiptCarrierSha: null,
    closureMergeSha: null,
    repository: "KirPonomarev/writer-editor",
    workflowPath: ".github/workflows/r24-terminal-attestation.yml",
    workflowRunId: 42,
    runAttempt: 1,
    event: "workflow_dispatch",
    ref: "refs/heads/main",
    createdAtUtc: "2026-08-27T15:00:00Z",
    externalImmutableTerminalAttestation: {
      provider: "GITHUB_ACTIONS",
      workflowRunId: 42
    }
  };
  const attestationBytes = canonicalBytes(attestation);
  const runEvidence = {
    id: 42,
    run_attempt: 1,
    status: "completed",
    conclusion: "success",
    event: "workflow_dispatch",
    head_sha: "2".repeat(40),
    head_branch: "main",
    path: ".github/workflows/r24-terminal-attestation.yml",
    repository: { full_name: "KirPonomarev/writer-editor" }
  };
  const artifactEvidence = {
    id: 7,
    name: "r24-terminal-attestation-B0",
    expired: false,
    digest: `sha256:${"4".repeat(64)}`,
    workflow_run: { id: 42 }
  };
  return {
    attestationFile: {
      bytes: attestationBytes,
      value: attestation,
      digest: sha256(attestationBytes)
    },
    trustFile,
    programFile,
    instanceFile,
    admissionFile,
    runEvidence,
    artifactEvidence
  };
}

test("verifies externally bound terminal attestation", () => {
  assert.equal(verifyTerminalAttestation(fixture()).status, "VERIFIED");
});

test("fails closed without API evidence", () => {
  const subject = fixture();
  subject.runEvidence = null;
  assert.throws(() => verifyTerminalAttestation(subject), /E_EXTERNAL_EVIDENCE_UNAVAILABLE/);
});

test("rejects failed external run", () => {
  const subject = fixture();
  subject.runEvidence.conclusion = "failure";
  assert.throws(() => verifyTerminalAttestation(subject), /E_RUN_NOT_SUCCESSFUL/);
});

test("rejects wrong evaluation sha", () => {
  const subject = fixture();
  subject.runEvidence.head_sha = "5".repeat(40);
  assert.throws(() => verifyTerminalAttestation(subject), /E_EVALUATION_SHA_MISMATCH/);
});

test("rejects mutable or expired artifact", () => {
  const subject = fixture();
  subject.artifactEvidence.expired = true;
  assert.throws(() => verifyTerminalAttestation(subject), /E_ARTIFACT_EXPIRED/);
});

test("rejects recursive closure carrier", () => {
  const subject = fixture();
  subject.attestationFile.value.receiptCarrierSha = "6".repeat(40);
  assert.throws(() => verifyTerminalAttestation(subject), /E_RECURSIVE_CLOSURE/);
});

test("protected workflow binds exact base or paired append-only stage paths", () => {
  const workflow = readFileSync(WORKFLOW_PATH, "utf8");
  for (const token of [
    "stage_instance_path:",
    "stage_admission_path:",
    "STAGE_INSTANCE_PATH: ${{ inputs.stage_instance_path }}",
    "STAGE_ADMISSION_PATH: ${{ inputs.stage_admission_path }}",
    "E_STAGE_PATH_IDENTITY",
    "E_STAGE_PATH_VERSION_MISMATCH",
    "E_NON_CANONICAL_STAGE_BYTES",
    "E_STAGE_DIGEST_MISMATCH",
    "E_ADMISSION_BINDING",
  ]) {
    assert.equal(workflow.includes(token), true, `missing workflow binding: ${token}`);
  }
  assert.equal(workflow.includes("sha256sum docs/OPS/R24/CORRECTIVE/${STAGE_ID}_STAGE_INSTANCE_V1.json"), false);
  assert.equal(workflow.includes("sha256sum docs/OPS/R24/CORRECTIVE/${STAGE_ID}_STAGE_ADMISSION_ATTESTATION_V1.json"), false);
});
