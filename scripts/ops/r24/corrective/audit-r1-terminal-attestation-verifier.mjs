#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { canonicalBytes, canonicalize, readCanonicalJson } from './canonical-json.mjs';
import {
  FIXED_BINDINGS,
  assert,
  assertClosedObject,
  assertExactJson,
  assertHex,
  collectRepositoryG0DigestBindings,
  fail,
  sha256,
  validateAcceptanceResultBundle,
  validateFreshG0,
} from './audit-r1-corrections.mjs';
import { validateEvidenceMatrix, validateStageAcceptanceResults } from './audit-r1-recertify.mjs';
import { validateAuditInventory } from './audit-r1-test-inventory.mjs';

export const ACCEPTANCE_EVIDENCE_ENTRIES = Object.freeze([
  'evidence-carrier-integrity.log',
  'evidence-corrected-contracts.log',
  'evidence-current-stage-inventory.log',
  'evidence-full-baseline.log',
  'evidence-guardrails.log',
  'evidence-physical-macos.json',
  'evidence-platform-complements.log',
  'evidence-recertification-matrix.log',
  'evidence-sector-u-full.log',
  'evidence-successor-admission.json',
]);

export const RESULT_EVIDENCE_ENTRIES = Object.freeze({
  CARRIER_INTEGRITY: 'evidence-carrier-integrity.log',
  CORRECTED_CONTRACTS: 'evidence-corrected-contracts.log',
  CURRENT_STAGE_INVENTORY: 'evidence-current-stage-inventory.log',
  FRESH_G0: 'g0-evidence.json',
  FULL_BASELINE: 'evidence-full-baseline.log',
  GUARDRAILS: 'evidence-guardrails.log',
  PHYSICAL_MACOS: 'evidence-physical-macos.json',
  PLATFORM_COMPLEMENTS: 'evidence-platform-complements.log',
  RECERTIFICATION_MATRIX: 'evidence-recertification-matrix.log',
  SECTOR_U_FULL: 'evidence-sector-u-full.log',
  SUCCESSOR_ADMISSION: 'evidence-successor-admission.json',
});

export const REQUIRED_ARCHIVE_ENTRIES = Object.freeze([
  'acceptance-result-bundle.json',
  'artifact-manifest.json',
  'g0-evidence.json',
  'terminal-attestation.json',
  ...ACCEPTANCE_EVIDENCE_ENTRIES,
]);

export function validateAcceptanceEvidenceEntries(bundle, entries) {
  const baseResults = bundle.results.filter((entry) => !entry.id.startsWith('STAGE_'));
  assertExactJson(
    baseResults.map((entry) => entry.id).sort(),
    Object.keys(RESULT_EVIDENCE_ENTRIES).sort(),
    'E_ACCEPTANCE_EVIDENCE_SET',
    'bundle.baseResults',
  );
  for (const result of baseResults) {
    const evidenceName = RESULT_EVIDENCE_ENTRIES[result.id];
    assert(evidenceName && entries[evidenceName], 'E_ACCEPTANCE_EVIDENCE_MISSING', result.id);
    assert(result.evidenceDigest === sha256(entries[evidenceName]), 'E_ACCEPTANCE_EVIDENCE_DIGEST', result.id);
  }
  return true;
}

function parseCanonicalBytes(bytes, field) {
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { fail('E_ARTIFACT_JSON', field); }
  assert(bytes.equals(canonicalBytes(value)), 'E_ARTIFACT_NON_CANONICAL', field);
  return value;
}

function safeArchiveEntry(name) {
  assert(typeof name === 'string' && name.length > 0 && name === name.normalize('NFC'), 'E_ZIP_ENTRY_INVALID', String(name));
  assert(!name.includes('\\') && !name.includes('\0'), 'E_ZIP_ENTRY_INVALID', name);
  assert(!path.posix.isAbsolute(name) && !/^[A-Za-z]:/u.test(name) && !name.startsWith('//'), 'E_ZIP_ENTRY_ABSOLUTE', name);
  assert(path.posix.normalize(name) === name && !name.split('/').some((part) => part === '' || part === '.' || part === '..'), 'E_ZIP_ENTRY_TRAVERSAL', name);
  return name;
}

export function extractExactZipEntries(zipBytes, adapter) {
  assert(Buffer.isBuffer(zipBytes) && zipBytes.length > 0 && zipBytes.length <= 25 * 1024 * 1024, 'E_ZIP_SIZE', zipBytes?.length);
  const archive = adapter ?? systemArchiveAdapter(zipBytes);
  const names = archive.list();
  assert(Array.isArray(names), 'E_ZIP_LIST', 'not-array');
  names.forEach(safeArchiveEntry);
  assert(new Set(names).size === names.length, 'E_ZIP_DUPLICATE_ENTRY', names.join(','));
  assertExactJson([...names].sort(), [...REQUIRED_ARCHIVE_ENTRIES].sort(), 'E_ZIP_ENTRY_SET', 'archive');
  const entries = {};
  for (const name of REQUIRED_ARCHIVE_ENTRIES) {
    const bytes = archive.read(name);
    assert(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= 5 * 1024 * 1024, 'E_ZIP_ENTRY_SIZE', name);
    entries[name] = bytes;
  }
  archive.close?.();
  return entries;
}

function systemArchiveAdapter(zipBytes) {
  const directory = mkdtempSync(path.join(tmpdir(), 'yalken-audit-r1-zip-'));
  const zipPath = path.join(directory, 'artifact.zip');
  writeFileSync(zipPath, zipBytes, { flag: 'wx' });
  return {
    list() {
      const output = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return output.split(/\r?\n/u).filter(Boolean);
    },
    read(name) {
      return execFileSync('unzip', ['-p', zipPath, name], { encoding: null, maxBuffer: 6 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    },
    close() { rmSync(directory, { recursive: true, force: true }); },
  };
}

function validateArtifactManifest(manifest, entries, expected) {
  assertClosedObject(manifest, ['schemaVersion', 'artifactName', 'stageId', 'correctionId', 'workflowRunId', 'runAttempt', 'evaluationSha', 'evaluationTreeSha', 'files'], ['schemaVersion', 'artifactName', 'stageId', 'correctionId', 'workflowRunId', 'runAttempt', 'evaluationSha', 'evaluationTreeSha', 'files'], 'manifest');
  assert(manifest.schemaVersion === 'AUDIT_R1_ARTIFACT_MANIFEST_V1', 'E_MANIFEST_SCHEMA', manifest.schemaVersion);
  assert(manifest.artifactName === expected.artifactName && manifest.stageId === expected.stageId && manifest.correctionId === expected.correctionId, 'E_MANIFEST_IDENTITY', manifest.artifactName);
  assert(Number(manifest.workflowRunId) === Number(expected.workflowRunId) && Number(manifest.runAttempt) === Number(expected.runAttempt), 'E_MANIFEST_RUN', manifest.workflowRunId);
  assert(manifest.evaluationSha === expected.evaluationSha && manifest.evaluationTreeSha === expected.evaluationTreeSha, 'E_MANIFEST_EVALUATION', manifest.evaluationSha);
  const expectedNames = ['acceptance-result-bundle.json', 'g0-evidence.json', ...ACCEPTANCE_EVIDENCE_ENTRIES];
  assert(Array.isArray(manifest.files), 'E_SCHEMA_TYPE', 'manifest.files');
  assertExactJson(manifest.files.map((entry) => entry.name), expectedNames, 'E_MANIFEST_FILE_SET', 'manifest.files');
  for (const file of manifest.files) {
    assertClosedObject(file, ['name', 'sha256', 'sizeBytes'], ['name', 'sha256', 'sizeBytes'], `manifest.files.${file?.name}`);
    assertHex(file.sha256, 64, `manifest.files.${file.name}.sha256`);
    assert(file.sizeBytes === entries[file.name].length && file.sha256 === sha256(entries[file.name]), 'E_MANIFEST_FILE_DIGEST', file.name);
  }
}

function validateEnvelope(envelope, expected, digests) {
  const keys = [
    'schemaVersion', 'attestationType', 'result', 'stageId', 'correctionId', 'programTemplateDigest',
    'stageInstanceDigest', 'stageAdmissionAttestationDigest', 'requirementsDigest', 'acceptanceResultBundleDigest',
    'g0EvidenceDigest', 'artifactManifestDigest', 'implementationCandidateSha', 'implementationMergeSha',
    'evaluationSha', 'evaluationTreeSha', 'repository', 'workflowPath', 'workflowRunId', 'runAttempt', 'event', 'ref',
  ];
  assertClosedObject(envelope, keys, keys, 'terminalEnvelope');
  assert(envelope.schemaVersion === 'AUDIT_R1_TERMINAL_ATTESTATION_V1' && envelope.attestationType === 'DOWNLOADED_IMMUTABLE_ACCEPTANCE_BOUND_TERMINAL_ATTESTATION', 'E_TERMINAL_SCHEMA', envelope.schemaVersion);
  assert(envelope.result === 'PASS', 'E_TERMINAL_RESULT', envelope.result);
  for (const [key, value] of Object.entries({
    stageId: expected.stageId,
    correctionId: expected.correctionId,
    programTemplateDigest: expected.programTemplateDigest,
    stageInstanceDigest: expected.stageInstanceDigest,
    stageAdmissionAttestationDigest: expected.stageAdmissionAttestationDigest,
    requirementsDigest: digests.requirementsDigest,
    acceptanceResultBundleDigest: digests.acceptanceResultBundleDigest,
    g0EvidenceDigest: digests.g0EvidenceDigest,
    artifactManifestDigest: digests.artifactManifestDigest,
    implementationCandidateSha: expected.implementationCandidateSha,
    implementationMergeSha: expected.implementationMergeSha,
    evaluationSha: expected.evaluationSha,
    evaluationTreeSha: expected.evaluationTreeSha,
    repository: expected.repository,
    workflowPath: expected.workflowPath,
    workflowRunId: Number(expected.workflowRunId),
    runAttempt: Number(expected.runAttempt),
    event: 'workflow_dispatch',
    ref: 'refs/heads/main',
  })) assert(envelope[key] === value, 'E_TERMINAL_BINDING', key);
  for (const field of ['implementationCandidateSha', 'implementationMergeSha', 'evaluationSha', 'evaluationTreeSha']) assertHex(envelope[field], 40, field);
}

export function verifyDownloadedTerminalArtifact({
  expectedEnvelopeBytes,
  zipBytes,
  artifactEvidence,
  runEvidence,
  requirementsFile,
  stageInstanceFile,
  stageAdmissionFile,
  registryFile,
  matrixFile,
  inventoryFile,
  expected,
  archiveAdapter,
}) {
  assert(Buffer.isBuffer(expectedEnvelopeBytes), 'E_EXPECTED_ENVELOPE_UNAVAILABLE', 'bytes');
  assert(artifactEvidence && runEvidence, 'E_EXTERNAL_EVIDENCE_UNAVAILABLE', 'GitHub API');
  assert(artifactEvidence.expired === false, 'E_ARTIFACT_EXPIRED', artifactEvidence.id);
  assert(artifactEvidence.name === expected.artifactName, 'E_ARTIFACT_NAME', artifactEvidence.name);
  assert(Number(artifactEvidence.workflow_run?.id) === Number(runEvidence.id), 'E_ARTIFACT_RUN', artifactEvidence.id);
  assert(typeof artifactEvidence.digest === 'string' && /^sha256:[0-9a-f]{64}$/u.test(artifactEvidence.digest), 'E_ARTIFACT_DIGEST_UNAVAILABLE', artifactEvidence.id);
  assert(artifactEvidence.digest === `sha256:${sha256(zipBytes)}`, 'E_ZIP_DIGEST_MISMATCH', artifactEvidence.digest);
  assert(runEvidence.status === 'completed' && runEvidence.conclusion === 'success', 'E_RUN_NOT_SUCCESSFUL', `${runEvidence.status}/${runEvidence.conclusion}`);
  assert(runEvidence.event === 'workflow_dispatch' && runEvidence.head_branch === 'main' && runEvidence.head_sha === expected.evaluationSha, 'E_RUN_IDENTITY', runEvidence.head_sha);
  assert(runEvidence.path === expected.workflowPath, 'E_WORKFLOW_IDENTITY', runEvidence.path);
  const entries = extractExactZipEntries(zipBytes, archiveAdapter);
  assert(entries['terminal-attestation.json'].equals(expectedEnvelopeBytes), 'E_SUBSTITUTED_LOCAL_ENVELOPE', 'byte mismatch');
  const envelope = parseCanonicalBytes(entries['terminal-attestation.json'], 'terminal-attestation.json');
  const bundle = parseCanonicalBytes(entries['acceptance-result-bundle.json'], 'acceptance-result-bundle.json');
  const g0 = parseCanonicalBytes(entries['g0-evidence.json'], 'g0-evidence.json');
  const manifest = parseCanonicalBytes(entries['artifact-manifest.json'], 'artifact-manifest.json');
  const requirements = requirementsFile.value;
  validateAcceptanceResultBundle(bundle, requirements);
  validateAcceptanceEvidenceEntries(bundle, entries);
  if (bundle.results.some((entry) => entry.id.startsWith('STAGE_'))) {
    assert(registryFile && matrixFile, 'E_STAGE_ACCEPTANCE_CONTEXT_MISSING', 'registry/matrix');
    assert(registryFile.digest === FIXED_BINDINGS.stageRegistryDigest, 'E_STAGE_ACCEPTANCE_REGISTRY', registryFile.digest);
    validateEvidenceMatrix(matrixFile.value, registryFile.value, requirements);
    validateStageAcceptanceResults({ bundle, registry: registryFile.value, matrix: matrixFile.value });
  }
  if (inventoryFile) validateAuditInventory(process.cwd(), inventoryFile.value, bundle);
  assert(bundle.evaluationSha === expected.evaluationSha && bundle.evaluationTreeSha === expected.evaluationTreeSha, 'E_ACCEPTANCE_EVALUATION', bundle.evaluationSha);
  validateFreshG0(g0, {
    ...expected,
    ...collectRepositoryG0DigestBindings(process.cwd(), requirementsFile.digest),
    expectedLeaseBindings: {
      stageAdmissionDigest: stageAdmissionFile.digest,
      stageInstanceDigest: stageInstanceFile.digest,
      writeSetDigest: stageAdmissionFile.value.exactWriteSetDigest,
    },
  });
  const expectedManifest = { ...expected, workflowRunId: runEvidence.id, runAttempt: runEvidence.run_attempt };
  validateArtifactManifest(manifest, entries, expectedManifest);
  assert(stageInstanceFile.digest === expected.stageInstanceDigest, 'E_STAGE_INSTANCE_DIGEST', stageInstanceFile.digest);
  assert(stageAdmissionFile.digest === expected.stageAdmissionAttestationDigest && stageAdmissionFile.value.status === 'ADMITTED', 'E_STAGE_ADMISSION_DIGEST', stageAdmissionFile.digest);
  assert(stageAdmissionFile.value.stageInstanceDigest === stageInstanceFile.digest, 'E_STAGE_ADMISSION_BINDING', stageAdmissionFile.value.stageInstanceDigest);
  const digests = {
    requirementsDigest: requirementsFile.digest,
    acceptanceResultBundleDigest: sha256(entries['acceptance-result-bundle.json']),
    g0EvidenceDigest: sha256(entries['g0-evidence.json']),
    artifactManifestDigest: sha256(entries['artifact-manifest.json']),
  };
  validateEnvelope(envelope, { ...expected, workflowRunId: runEvidence.id, runAttempt: runEvidence.run_attempt }, digests);
  return {
    schemaVersion: 'AUDIT_R1_TERMINAL_ATTESTATION_VALIDATION_V1',
    status: 'VERIFIED',
    stageId: expected.stageId,
    correctionId: expected.correctionId,
    evaluationSha: expected.evaluationSha,
    evaluationTreeSha: expected.evaluationTreeSha,
    externalRunId: Number(runEvidence.id),
    externalArtifactId: Number(artifactEvidence.id),
    externalArtifactZipDigest: artifactEvidence.digest.slice('sha256:'.length),
    downloadedEnvelopeDigest: sha256(entries['terminal-attestation.json']),
    ...digests,
    decision: 'DOWNLOADED_ZIP_BYTES_AND_ACCEPTANCE_RESULTS_VERIFIED',
  };
}

function ghJson(endpoint) {
  return JSON.parse(execFileSync('gh', ['api', endpoint], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
}

function ghBytes(endpoint) {
  return execFileSync('gh', ['api', '-H', 'Accept: application/vnd.github+json', endpoint], { encoding: null, maxBuffer: 30 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
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
    for (const key of ['expected-envelope', 'requirements', 'stage-instance', 'stage-admission', 'registry', 'matrix', 'inventory', 'repository', 'run-id', 'artifact-id', 'stage-id', 'correction-id', 'program-digest', 'evaluation-sha', 'evaluation-tree', 'candidate-sha', 'merge-sha']) {
      assert(options[key], 'E_USAGE', `--${key}`);
    }
    assert(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(options.repository), 'E_REPOSITORY_IDENTITY', options.repository);
    const runEvidence = ghJson(`repos/${options.repository}/actions/runs/${options['run-id']}`);
    const artifactEvidence = ghJson(`repos/${options.repository}/actions/artifacts/${options['artifact-id']}`);
    const zipBytes = ghBytes(`repos/${options.repository}/actions/artifacts/${options['artifact-id']}/zip`);
    const stageInstanceFile = readCanonicalJson(options['stage-instance']);
    const stageAdmissionFile = readCanonicalJson(options['stage-admission']);
    const result = verifyDownloadedTerminalArtifact({
      expectedEnvelopeBytes: readFileSync(options['expected-envelope']),
      zipBytes,
      artifactEvidence,
      runEvidence,
      requirementsFile: readCanonicalJson(options.requirements),
      stageInstanceFile,
      stageAdmissionFile,
      registryFile: readCanonicalJson(options.registry),
      matrixFile: readCanonicalJson(options.matrix),
      inventoryFile: readCanonicalJson(options.inventory),
      expected: {
        artifactName: `r24-audit-r1-terminal-${options['stage-id']}`,
        stageId: options['stage-id'],
        correctionId: options['correction-id'],
        programTemplateDigest: options['program-digest'],
        stageInstanceDigest: stageInstanceFile.digest,
        stageAdmissionAttestationDigest: stageAdmissionFile.digest,
        repository: options.repository,
        workflowPath: '.github/workflows/r24-terminal-attestation.yml',
        evaluationSha: options['evaluation-sha'],
        evaluationTreeSha: options['evaluation-tree'],
        baseSha: options['evaluation-sha'],
        headSha: options['evaluation-sha'],
        treeSha: options['evaluation-tree'],
        originUrl: `https://github.com/${options.repository}.git`,
        canonicalRepo: options.repository,
        implementationCandidateSha: options['candidate-sha'],
        implementationMergeSha: options['merge-sha'],
      },
    });
    process.stdout.write(canonicalBytes(result));
  } catch (error) {
    process.stderr.write(`${canonicalize({ code: error.code ?? 'E_UNTYPED', message: error.message })}\n`);
    process.exitCode = 1;
  }
}
