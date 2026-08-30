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
const WP400_STAGE_ID = "WP-400_ANCHOR_LINEAGE";
const WP400_PROGRAM_PATH = "docs/OPS/R24/CORRECTIVE/WP400_TERMINAL_ISSUER_COMPATIBILITY_EXACT_HEAD_AMENDMENT_V1.json";
const WP400_INSTANCE_PATH = "docs/OPS/R24/CORRECTIVE/WP400_TERMINAL_ISSUER_COMPATIBILITY_STAGE_INSTANCE_V1.json";
const WP400_ADMISSION_PATH = "docs/OPS/R24/CORRECTIVE/WP400_TERMINAL_ISSUER_COMPATIBILITY_STAGE_ADMISSION_ATTESTATION_V1.json";
const WP400_TRUST_PATH = "docs/OPS/R24/CORRECTIVE/WP400_TERMINAL_ATTESTATION_TRUST_MODEL_V1.json";

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

function wp400Fixture() {
  const subject = fixture();
  subject.trustFile = file(WP400_TRUST_PATH);
  subject.programFile = file(WP400_PROGRAM_PATH);
  subject.instanceFile = file(WP400_INSTANCE_PATH);
  subject.admissionFile = file(WP400_ADMISSION_PATH);
  Object.assign(subject.attestationFile.value, {
    stageId: WP400_STAGE_ID,
    programTemplateDigest: subject.programFile.digest,
    stageInstanceDigest: subject.instanceFile.digest,
    stageAdmissionAttestationDigest: subject.admissionFile.digest,
    acceptanceSignalsDigest: subject.admissionFile.value.acceptanceSignalsDigest,
  });
  subject.attestationFile.bytes = canonicalBytes(subject.attestationFile.value);
  subject.attestationFile.digest = sha256(subject.attestationFile.bytes);
  subject.artifactEvidence.name = `r24-terminal-attestation-${WP400_STAGE_ID}`;
  return subject;
}

test("verifies externally bound terminal attestation", () => {
  assert.equal(verifyTerminalAttestation(fixture()).status, "VERIFIED");
});

test("verifies WP-400 through its append-only trust and admission carriers", () => {
  const result = verifyTerminalAttestation(wp400Fixture());
  assert.equal(result.status, "VERIFIED");
  assert.equal(result.stageId, WP400_STAGE_ID);
});

test("rejects a cross-stage WP-400 attestation", () => {
  const subject = wp400Fixture();
  subject.attestationFile.value.stageId = "AUDIT_R2_COMPLETE_CHAIN";
  assert.throws(() => verifyTerminalAttestation(subject), /E_STAGE_IDENTITY/);
});

test("rejects WP-400 under the historical audit-only trust binding", () => {
  const subject = wp400Fixture();
  subject.trustFile = file("docs/OPS/R24/CORRECTIVE/TERMINAL_ATTESTATION_TRUST_MODEL_V1.json");
  assert.throws(() => verifyTerminalAttestation(subject), /E_TRUST_PROGRAM_BINDING/);
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

test("protected workflow separates implementation merge from evaluation identity", () => {
  const workflow = readFileSync(WORKFLOW_PATH, "utf8");
  for (const token of [
    "evaluation_sha:",
    "fetch-depth: 0",
    "EVALUATION_SHA: ${{ inputs.evaluation_sha }}",
    "IMPLEMENTATION_CANDIDATE_SHA: ${{ inputs.implementation_candidate_sha }}",
    'test "${GITHUB_SHA}" = "${EVALUATION_SHA}"',
    'git merge-base --is-ancestor "${IMPLEMENTATION_CANDIDATE_SHA}" "${IMPLEMENTATION_MERGE_SHA}"',
    'git merge-base --is-ancestor "${IMPLEMENTATION_MERGE_SHA}" "${EVALUATION_SHA}"',
    "evaluationSha:process.env.EVALUATION_SHA",
  ]) {
    assert.equal(workflow.includes(token), true, `missing commit-role binding: ${token}`);
  }
  assert.equal(workflow.includes('test "${GITHUB_SHA}" = "${IMPLEMENTATION_MERGE_SHA}"'), false);
});

test("protected workflow routes audit R2 and WP-400 without cross-stage execution", () => {
  const workflow = readFileSync(WORKFLOW_PATH, "utf8");
  for (const token of [
    "stage-router:",
    "E_STAGE_IDENTITY:${STAGE_ID}",
    "AUDIT_R2_COMPLETE_CHAIN|WP-400_ANCHOR_LINEAGE",
    "if: ${{ inputs.stage_id == 'AUDIT_R2_COMPLETE_CHAIN' }}",
    "if: ${{ inputs.stage_id == 'WP-400_ANCHOR_LINEAGE' }}",
    "wp400-terminal-attestation:",
    `test \"${'${STAGE_ID}'}\" = \"${WP400_STAGE_ID}\" || fail E_STAGE_IDENTITY`,
    `test \"${'${STAGE_INSTANCE_PATH}'}\" = \"${WP400_INSTANCE_PATH}\" || fail E_STAGE_PATH_IDENTITY`,
    `test \"${'${STAGE_ADMISSION_PATH}'}\" = \"${WP400_ADMISSION_PATH}\" || fail E_STAGE_PATH_IDENTITY`,
    `test \"${'${REQUIREMENTS_PATH}'}\" = \"${WP400_PROGRAM_PATH}\" || fail E_STAGE_PATH_VERSION_MISMATCH`,
    "name: r24-terminal-attestation-${{ inputs.stage_id }}",
  ]) {
    assert.equal(workflow.includes(token), true, `missing stage isolation binding: ${token}`);
  }
});

test("WP-400 terminal route cannot release the lease or emit audit-R2 identity", () => {
  const workflow = readFileSync(WORKFLOW_PATH, "utf8");
  const marker = "  wp400-terminal-attestation:\n";
  const wp400Job = workflow.slice(workflow.indexOf(marker));
  assert.notEqual(workflow.indexOf(marker), -1);
  for (const forbidden of [
    "lease-release-ledger.json",
    "writerTaskId",
    "fencingCounter:54",
    "wp400MutationStarted:false",
    "audit-r2-terminal-${{ github.run_id }}",
  ]) {
    assert.equal(wp400Job.includes(forbidden), false, `WP-400 job contains audit-only token: ${forbidden}`);
  }
});
