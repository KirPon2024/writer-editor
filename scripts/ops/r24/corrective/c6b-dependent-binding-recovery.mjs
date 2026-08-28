#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { canonicalBytes } from './canonical-json.mjs';
import {
  PATHS as ACCESSIBILITY_PATHS,
  buildContract as buildAccessibilityContract,
  validateEvidence as validateAccessibilityEvidence,
} from './c6b-editor-accessibility-recovery.mjs';
import { buildArtifacts, PATHS } from './c6b-writer-home-computed-style.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function fail(code, detail) {
  const error = new Error(`${code}: ${detail}`);
  error.code = code;
  throw error;
}

function main() {
  const mode = process.argv[2];
  if (mode !== '--write' && mode !== '--check') fail('E_USAGE', '--write or --check');
  const repoRoot = process.cwd();
  const artifacts = buildArtifacts(repoRoot);
  const contractPath = path.join(repoRoot, PATHS.contract);
  const matrixPath = path.join(repoRoot, PATHS.matrix);
  const expectedContract = canonicalBytes(artifacts.contract);
  const expectedMatrix = canonicalBytes(artifacts.matrix);
  if (mode === '--write') fs.writeFileSync(contractPath, expectedContract);
  const actualContract = fs.readFileSync(contractPath);
  const actualMatrix = fs.readFileSync(matrixPath);
  if (!actualContract.equals(expectedContract)) fail('E_CONTRACT_DRIFT', PATHS.contract);
  if (!actualMatrix.equals(expectedMatrix)) fail('E_UNRELATED_MATRIX_DRIFT', PATHS.matrix);
  const accessibilityContract = buildAccessibilityContract(repoRoot);
  const accessibilityContractPath = path.join(repoRoot, ACCESSIBILITY_PATHS.contract);
  const accessibilityEvidencePath = path.join(repoRoot, ACCESSIBILITY_PATHS.evidence);
  const expectedAccessibilityContract = canonicalBytes(accessibilityContract);
  const accessibilityEvidence = JSON.parse(fs.readFileSync(accessibilityEvidencePath, 'utf8'));
  accessibilityEvidence.contractDigest = sha256(expectedAccessibilityContract);
  validateAccessibilityEvidence(accessibilityEvidence, accessibilityContract);
  const expectedAccessibilityEvidence = canonicalBytes(accessibilityEvidence);
  if (mode === '--write') {
    fs.writeFileSync(accessibilityContractPath, expectedAccessibilityContract);
    fs.writeFileSync(accessibilityEvidencePath, expectedAccessibilityEvidence);
  }
  const actualAccessibilityContract = fs.readFileSync(accessibilityContractPath);
  const actualAccessibilityEvidence = fs.readFileSync(accessibilityEvidencePath);
  if (!actualAccessibilityContract.equals(expectedAccessibilityContract)) fail('E_ACCESSIBILITY_CONTRACT_DRIFT', ACCESSIBILITY_PATHS.contract);
  if (!actualAccessibilityEvidence.equals(expectedAccessibilityEvidence)) fail('E_ACCESSIBILITY_EVIDENCE_DRIFT', ACCESSIBILITY_PATHS.evidence);
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 'YALKEN_R24_C6B_DEPENDENT_BINDING_RECOVERY_RESULT_V1',
    status: 'PASS',
    mode,
    changedArtifactRole: 'C6B_WRITER_HOME_COMPUTED_STYLE_CONTRACT',
    contractDigest: sha256(actualContract),
    verifiedUnchangedArtifactRole: 'C6B_WRITER_HOME_COMPUTED_STYLE_MATRIX',
    matrixDigest: sha256(actualMatrix),
    accessibilityContractDigest: sha256(actualAccessibilityContract),
    accessibilityEvidenceDigest: sha256(actualAccessibilityEvidence),
  })}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${JSON.stringify({ code: error.code || 'E_C6B_BINDING_RECOVERY_UNTYPED', message: error.message })}\n`);
  process.exitCode = 1;
}
