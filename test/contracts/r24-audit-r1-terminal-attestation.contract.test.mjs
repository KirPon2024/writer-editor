import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalBytes } from '../../scripts/ops/r24/corrective/canonical-json.mjs';
import { collectRepositoryG0DigestBindings, sha256 } from '../../scripts/ops/r24/corrective/audit-r1-corrections.mjs';
import { ACCEPTANCE_EVIDENCE_ENTRIES, REQUIRED_ARCHIVE_ENTRIES, RESULT_EVIDENCE_ENTRIES, verifyDownloadedTerminalArtifact } from '../../scripts/ops/r24/corrective/audit-r1-terminal-attestation-verifier.mjs';

const evaluationSha = 'a'.repeat(40);
const evaluationTreeSha = 'b'.repeat(40);
const zipBytes = Buffer.from('synthetic-zip-bytes');
const requirements = {
  correctionId: 'YALKEN_R24_AUDIT_ROUND_1_CORRECTIONS_V1',
  evidenceStampIds: ['ES-R24-CORRECTIVE-B0-CONTROL-PLANE-CLAIM-BINDINGS'],
  programTemplateDigest: '6c833c964318da3e61e1743365f8763206be838647b5222c187b3bda8d1c6b9a',
  requiredOutcomes: Object.keys(RESULT_EVIDENCE_ENTRIES).map((id) => ({ id, requiredStatus: 'PASS', source: id === 'PHYSICAL_MACOS' ? 'LOCAL_PHYSICAL_LANE_CARRIER' : 'GITHUB_ACTIONS_JOB' })),
  schemaVersion: 'AUDIT_R1_ACCEPTANCE_REQUIREMENTS_V1',
  stageRegistryDigest: 'c8af046b5918f43a50af66886b0b5c9d2e22ea6501240d4b239101d8836ced1a',
};
const requirementsBytes = canonicalBytes(requirements);
const requirementsFile = { value: requirements, bytes: requirementsBytes, digest: sha256(requirementsBytes) };
const instanceBytes = canonicalBytes({ stageId: 'C7A' });
const stageInstanceFile = { value: { stageId: 'C7A' }, bytes: instanceBytes, digest: sha256(instanceBytes) };
const admissionValue = { status: 'ADMITTED', stageInstanceDigest: stageInstanceFile.digest, exactWriteSetDigest: 'a'.repeat(64) };
const admissionBytes = canonicalBytes(admissionValue);
const stageAdmissionFile = { value: admissionValue, bytes: admissionBytes, digest: sha256(admissionBytes) };
const expected = { artifactName: 'r24-audit-r1-terminal-COMPLETE_CHAIN', stageId: 'COMPLETE_CHAIN', correctionId: 'YALKEN_R24_AUDIT_ROUND_1_CORRECTIONS_V1', programTemplateDigest: 'c'.repeat(64), stageInstanceDigest: stageInstanceFile.digest, stageAdmissionAttestationDigest: stageAdmissionFile.digest, repository: 'KirPonomarev/writer-editor-codex', workflowPath: '.github/workflows/r24-terminal-attestation.yml', evaluationSha, evaluationTreeSha, baseSha: evaluationSha, headSha: evaluationSha, treeSha: evaluationTreeSha, originUrl: 'https://github.com/KirPonomarev/writer-editor-codex.git', canonicalRepo: 'KirPonomarev/writer-editor-codex', implementationCandidateSha: 'd'.repeat(40), implementationMergeSha: evaluationSha };
const runEvidence = { id: 41, run_attempt: 1, status: 'completed', conclusion: 'success', event: 'workflow_dispatch', head_branch: 'main', head_sha: evaluationSha, path: expected.workflowPath };
const artifactEvidence = { id: 51, expired: false, name: expected.artifactName, workflow_run: { id: 41 }, digest: `sha256:${sha256(zipBytes)}` };

function build({ resultStatus = 'PASS', omitResult = false, substituteEvidenceDigest = false, list = REQUIRED_ARCHIVE_ENTRIES } = {}) {
  const lease = { activeAdmissionAmendment: { authority: 'AUDIT_ROUND_1_CORRECTION_BRIEF_AND_FIXED_SUCCESSOR_ADMISSION', legacyAdmissionDigest: '7'.repeat(64), stageAdmissionDigest: stageAdmissionFile.digest, stageInstanceDigest: stageInstanceFile.digest, status: 'ADMITTED_WITHIN_ACTIVE_ONE_WRITER_LEASE', writeSetDigest: admissionValue.exactWriteSetDigest }, fenceDigest: '1'.repeat(64), fencingCounter: 53, leaseDigest: '2'.repeat(64), oneWriter: true, originalStageAdmissionDigest: '4'.repeat(64), originalStageInstanceDigest: '5'.repeat(64), originalWriteSetDigest: '6'.repeat(64), predecessorReleaseDigest: '3'.repeat(64), status: 'ACTIVE', wip: 1 };
  const repositoryBindings = collectRepositoryG0DigestBindings(process.cwd(), requirementsFile.digest);
  const g0 = { schemaVersion: 'AUDIT_R1_G0_EVIDENCE_V1', source: 'FRESH_INDEPENDENT_GIT_AND_REPOSITORY_OBSERVATION', status: 'VERIFIED_CURRENT', observedAtUtc: '2026-08-29T00:00:00Z', evidence: { ...repositoryBindings, canonicalRepo: expected.canonicalRepo, activeWorktree: { classification: 'EPHEMERAL_OR_REGISTERED_GIT_WORKTREE', observedPathDigest: '3'.repeat(64) }, originUrl: expected.originUrl, headSha: evaluationSha, treeSha: evaluationTreeSha, baseSha: evaluationSha, cleanWorktree: true, singleWriterLease: lease } };
  const g0Bytes = canonicalBytes(g0);
  const evidenceEntries = Object.fromEntries(ACCEPTANCE_EVIDENCE_ENTRIES.map((name) => [name, Buffer.from(`immutable ${name}\n`)]));
  const results = requirements.requiredOutcomes.map(({ id, source }) => ({
    id,
    status: 'PASS',
    exitCode: 0,
    commandDigest: '1'.repeat(64),
    evidenceDigest: sha256(id === 'FRESH_G0' ? g0Bytes : evidenceEntries[RESULT_EVIDENCE_ENTRIES[id]]),
    source,
  }));
  if (substituteEvidenceDigest) results[0].evidenceDigest = '0'.repeat(64);
  results[1].status = resultStatus;
  if (omitResult) results.pop();
  const bundle = { schemaVersion: 'AUDIT_R1_ACCEPTANCE_RESULT_BUNDLE_V1', bundleId: 'bundle', evaluationSha, evaluationTreeSha, requirementsDigest: requirementsFile.digest, results, status: resultStatus === 'PASS' && !omitResult ? 'PASS' : 'FAIL' };
  const bundleBytes = canonicalBytes(bundle);
  const manifest = { schemaVersion: 'AUDIT_R1_ARTIFACT_MANIFEST_V1', artifactName: expected.artifactName, stageId: expected.stageId, correctionId: expected.correctionId, workflowRunId: 41, runAttempt: 1, evaluationSha, evaluationTreeSha, files: [['acceptance-result-bundle.json', bundleBytes], ['g0-evidence.json', g0Bytes], ...ACCEPTANCE_EVIDENCE_ENTRIES.map((name) => [name, evidenceEntries[name]])].map(([name, bytes]) => ({ name, sha256: sha256(bytes), sizeBytes: bytes.length })) };
  const manifestBytes = canonicalBytes(manifest);
  const envelope = { schemaVersion: 'AUDIT_R1_TERMINAL_ATTESTATION_V1', attestationType: 'DOWNLOADED_IMMUTABLE_ACCEPTANCE_BOUND_TERMINAL_ATTESTATION', result: 'PASS', stageId: expected.stageId, correctionId: expected.correctionId, programTemplateDigest: expected.programTemplateDigest, stageInstanceDigest: expected.stageInstanceDigest, stageAdmissionAttestationDigest: expected.stageAdmissionAttestationDigest, requirementsDigest: requirementsFile.digest, acceptanceResultBundleDigest: sha256(bundleBytes), g0EvidenceDigest: sha256(g0Bytes), artifactManifestDigest: sha256(manifestBytes), implementationCandidateSha: expected.implementationCandidateSha, implementationMergeSha: expected.implementationMergeSha, evaluationSha, evaluationTreeSha, repository: expected.repository, workflowPath: expected.workflowPath, workflowRunId: 41, runAttempt: 1, event: 'workflow_dispatch', ref: 'refs/heads/main' };
  const entries = { 'acceptance-result-bundle.json': bundleBytes, 'artifact-manifest.json': manifestBytes, 'g0-evidence.json': g0Bytes, 'terminal-attestation.json': canonicalBytes(envelope), ...evidenceEntries };
  const archiveAdapter = { list: () => [...list], read: (name) => entries[name] };
  return { entries, archiveAdapter };
}

function verify(fixture, overrides = {}) {
  return verifyDownloadedTerminalArtifact({ expectedEnvelopeBytes: fixture.entries['terminal-attestation.json'], zipBytes, artifactEvidence, runEvidence, requirementsFile, stageInstanceFile, stageAdmissionFile, expected, archiveAdapter: fixture.archiveAdapter, ...overrides });
}

test('verifies authoritative downloaded ZIP bytes and exact embedded bundle', () => {
  const result = verify(build());
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.externalArtifactZipDigest, sha256(zipBytes));
});

test('rejects forged local envelope and wrong API ZIP digest', () => {
  const fixture = build();
  assert.throws(() => verify(fixture, { expectedEnvelopeBytes: canonicalBytes({ forged: true }) }), (error) => error.code === 'E_SUBSTITUTED_LOCAL_ENVELOPE');
  assert.throws(() => verify(fixture, { artifactEvidence: { ...artifactEvidence, digest: `sha256:${'0'.repeat(64)}` } }), (error) => error.code === 'E_ZIP_DIGEST_MISMATCH');
});

test('rejects a result digest that does not bind its immutable evidence bytes', () => {
  assert.throws(() => verify(build({ substituteEvidenceDigest: true })), (error) => error.code === 'E_ACCEPTANCE_EVIDENCE_DIGEST');
});

test('rejects unsafe, duplicate, missing, and extra archive entries', () => {
  for (const list of [
    [...REQUIRED_ARCHIVE_ENTRIES, '/etc/passwd'],
    [...REQUIRED_ARCHIVE_ENTRIES, '../escape'],
    [...REQUIRED_ARCHIVE_ENTRIES, REQUIRED_ARCHIVE_ENTRIES[0]],
    REQUIRED_ARCHIVE_ENTRIES.slice(1),
    [...REQUIRED_ARCHIVE_ENTRIES, 'extra.json'],
  ]) assert.throws(() => verify(build({ list })));
});

test('rejects missing, skipped, cancelled, and failed required acceptance results', () => {
  assert.throws(() => verify(build({ omitResult: true })), (error) => error.code === 'E_ACCEPTANCE_RESULT_SET');
  for (const status of ['SKIPPED', 'CANCELLED', 'FAIL']) assert.throws(() => verify(build({ resultStatus: status })));
});
