import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { canonicalBytes } from '../../scripts/ops/r24/corrective/canonical-json.mjs';
import { assertPublicLocator, validateAcceptanceRequirements, validateAcceptanceResultBundle, validateFreshG0 } from '../../scripts/ops/r24/corrective/audit-r1-corrections.mjs';
import { compileStageAcceptanceResults, validateEvidenceMatrix, validateStageAcceptanceResults } from '../../scripts/ops/r24/corrective/audit-r1-recertify.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('strict public locator allowlist rejects private absolute and ambiguous roots', () => {
  for (const candidate of ['/etc/passwd', '/tmp/private-evidence', 'file:///private/x', '\\\\server\\share', 'C:\\private\\x', '//server/share', '../escape', 'private/unapproved.txt']) {
    assert.throws(() => assertPublicLocator(candidate));
  }
  assert.equal(assertPublicLocator('docs/OPS/R24/CORRECTIVE/evidence.json'), 'docs/OPS/R24/CORRECTIVE/evidence.json');
  assert.equal(assertPublicLocator('https://github.com/KirPonomarev/writer-editor-codex'), 'https://github.com/KirPonomarev/writer-editor-codex');
});

test('acceptance bundle fails closed for missing, skipped, cancelled, or failed required work', () => {
  const requirements = { correctionId: 'YALKEN_R24_AUDIT_ROUND_1_CORRECTIONS_V1', evidenceStampIds: ['ES-R24-CORRECTIVE-B0-CONTROL-PLANE-CLAIM-BINDINGS'], programTemplateDigest: '6c833c964318da3e61e1743365f8763206be838647b5222c187b3bda8d1c6b9a', requiredOutcomes: [{ id: 'A', requiredStatus: 'PASS', source: 'GITHUB_ACTIONS_JOB' }, { id: 'B', requiredStatus: 'PASS', source: 'GITHUB_ACTIONS_JOB' }], schemaVersion: 'AUDIT_R1_ACCEPTANCE_REQUIREMENTS_V1', stageRegistryDigest: 'c8af046b5918f43a50af66886b0b5c9d2e22ea6501240d4b239101d8836ced1a' };
  const base = { schemaVersion: 'AUDIT_R1_ACCEPTANCE_RESULT_BUNDLE_V1', bundleId: 'x', evaluationSha: 'a'.repeat(40), evaluationTreeSha: 'b'.repeat(40), requirementsDigest: sha(canonicalBytes(requirements)), results: ['A', 'B'].map((id) => ({ id, status: 'PASS', exitCode: 0, commandDigest: 'c'.repeat(64), evidenceDigest: 'd'.repeat(64), source: 'GITHUB_ACTIONS_JOB' })), status: 'PASS' };
  assert.equal(validateAcceptanceResultBundle(base, requirements), true);
  for (const status of ['SKIPPED', 'CANCELLED', 'FAIL']) {
    const changed = structuredClone(base); changed.results[1].status = status;
    assert.throws(() => validateAcceptanceResultBundle(changed, requirements));
  }
  const missing = structuredClone(base); missing.results.pop();
  assert.throws(() => validateAcceptanceResultBundle(missing, requirements), (error) => error.code === 'E_ACCEPTANCE_RESULT_SET');
  const wrongSource = structuredClone(base); wrongSource.results[0].source = 'LOCAL_PHYSICAL_LANE_CARRIER';
  assert.throws(() => validateAcceptanceResultBundle(wrongSource, requirements), (error) => error.code === 'E_ACCEPTANCE_SOURCE');
});

test('acceptance requirements reject unknown fields and malformed nested outcomes', () => {
  const requirements = { correctionId: 'YALKEN_R24_AUDIT_ROUND_1_CORRECTIONS_V1', evidenceStampIds: ['ES-R24-CORRECTIVE-B0-CONTROL-PLANE-CLAIM-BINDINGS'], programTemplateDigest: '6c833c964318da3e61e1743365f8763206be838647b5222c187b3bda8d1c6b9a', requiredOutcomes: [{ id: 'A', requiredStatus: 'PASS', source: 'GITHUB_ACTIONS_JOB' }], schemaVersion: 'AUDIT_R1_ACCEPTANCE_REQUIREMENTS_V1', stageRegistryDigest: 'c8af046b5918f43a50af66886b0b5c9d2e22ea6501240d4b239101d8836ced1a' };
  assert.equal(validateAcceptanceRequirements(requirements), true);
  const unknown = structuredClone(requirements); unknown.untrusted = true;
  assert.throws(() => validateAcceptanceRequirements(unknown), (error) => error.code === 'E_SCHEMA_UNKNOWN_FIELD');
  const malformed = structuredClone(requirements); malformed.requiredOutcomes[0].suffix = '&& true';
  assert.throws(() => validateAcceptanceRequirements(malformed), (error) => error.code === 'E_SCHEMA_UNKNOWN_FIELD');
});

test('fresh G0 cannot self-assign CURRENT or omit registered evidence', () => {
  const lease = { activeAdmissionAmendment: { authority: 'AUDIT_ROUND_1_CORRECTION_BRIEF_AND_FIXED_SUCCESSOR_ADMISSION', legacyAdmissionDigest: '7'.repeat(64), stageAdmissionDigest: '8'.repeat(64), stageInstanceDigest: '9'.repeat(64), status: 'ADMITTED_WITHIN_ACTIVE_ONE_WRITER_LEASE', writeSetDigest: 'a'.repeat(64) }, fenceDigest: '1'.repeat(64), fencingCounter: 53, leaseDigest: '2'.repeat(64), oneWriter: true, originalStageAdmissionDigest: '4'.repeat(64), originalStageInstanceDigest: '5'.repeat(64), originalWriteSetDigest: '6'.repeat(64), predecessorReleaseDigest: '3'.repeat(64), status: 'ACTIVE', wip: 1 };
  const evidence = { canonicalRepo: 'KirPonomarev/writer-editor-codex', activeWorktree: { classification: 'EPHEMERAL_OR_REGISTERED_GIT_WORKTREE', observedPathDigest: 'a'.repeat(64) }, originUrl: 'https://github.com/KirPonomarev/writer-editor-codex', headSha: 'a'.repeat(40), treeSha: 'b'.repeat(40), baseSha: 'a'.repeat(40), activeCanonPath: 'docs/OPS/STATUS/canon.md', activeCanonDigest: 'c'.repeat(64), corexDigest: 'd'.repeat(64), bibleDigest: 'e'.repeat(64), missionDigest: 'f'.repeat(64), graphDigest: '1'.repeat(64), liveCiBindingDigest: '2'.repeat(64), cleanWorktree: true, singleWriterLease: lease };
  const expected = { canonicalRepo: evidence.canonicalRepo, originUrl: evidence.originUrl, headSha: evidence.headSha, treeSha: evidence.treeSha, baseSha: evidence.baseSha, activeCanonPath: evidence.activeCanonPath, activeCanonDigest: evidence.activeCanonDigest, corexDigest: evidence.corexDigest, bibleDigest: evidence.bibleDigest, missionDigest: evidence.missionDigest, graphDigest: evidence.graphDigest, liveCiBindingDigest: evidence.liveCiBindingDigest, expectedLeaseBindings: { stageAdmissionDigest: lease.activeAdmissionAmendment.stageAdmissionDigest, stageInstanceDigest: lease.activeAdmissionAmendment.stageInstanceDigest, writeSetDigest: lease.activeAdmissionAmendment.writeSetDigest } };
  const base = { schemaVersion: 'AUDIT_R1_G0_EVIDENCE_V1', source: 'FRESH_INDEPENDENT_GIT_AND_REPOSITORY_OBSERVATION', status: 'VERIFIED_CURRENT', observedAtUtc: '2026-08-29T00:00:00Z', evidence };
  assert.equal(validateFreshG0(base, expected), true);
  const selfAssigned = structuredClone(base); selfAssigned.status = 'CURRENT';
  assert.throws(() => validateFreshG0(selfAssigned, expected), (error) => error.code === 'E_G0_STATUS');
  const incomplete = structuredClone(base); delete incomplete.evidence.bibleDigest;
  assert.throws(() => validateFreshG0(incomplete, expected), (error) => error.code === 'E_SCHEMA_MISSING_FIELD');
  const stale = structuredClone(base); stale.evidence.headSha = '9'.repeat(40);
  assert.throws(() => validateFreshG0(stale, expected), (error) => error.code === 'E_G0_GIT_IDENTITY');
  const substitutedCanon = structuredClone(base); substitutedCanon.evidence.activeCanonDigest = '9'.repeat(64);
  assert.throws(() => validateFreshG0(substitutedCanon, expected), (error) => error.code === 'E_G0_REPOSITORY_DIGEST');
});

test('C6B sanitized evidence and exact WP400 carriers are byte-verifiable', () => {
  const lazyweb = JSON.parse(readFileSync('docs/OPS/R24/CORRECTIVE/AUDIT_R1_C6B_LAZYWEB_EVIDENCE_MANIFEST_V1.json', 'utf8'));
  for (const result of lazyweb.selectedResults) assert.equal(result.contentDigest, sha(Buffer.from(`${result.evidence}\n`)));
  assert.equal(sha(readFileSync('docs/OPS/R24/CORRECTIVE/WP400_STAGE_INSTANCE_FRESH_BASE_AMENDMENT_V1.json')), 'ecd27cbfcc4109dc966dff32322a95315b06c0ccdfc9db349aa80e200fe1f091');
  assert.equal(sha(readFileSync('docs/OPS/R24/CORRECTIVE/WP400_STAGE_ADMISSION_FRESH_BASE_AMENDMENT_V1.json')), '1f5dfce75e1b5639e160894750660760fbcea2e81d44fb1e19378e4b7c33dc35');
  const successor = JSON.parse(readFileSync('docs/OPS/R24/CORRECTIVE/CORRECTIVE_PLAN_100_PERCENT_RECEIPT_2EEA256D.txt', 'utf8'));
  assert.equal(successor.historicalClaim.status, 'SUPERSEDED_NON_CARRIED_NO_OVERCLAIM');
});

test('complete-chain recertification binds one non-circular current-head result for every registered stage', () => {
  const registry = JSON.parse(readFileSync('docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json', 'utf8'));
  const requirements = JSON.parse(readFileSync('docs/OPS/R24/CORRECTIVE/AUDIT_R1_ACCEPTANCE_REQUIREMENTS_V1.json', 'utf8'));
  const matrix = JSON.parse(readFileSync('docs/OPS/R24/CORRECTIVE/AUDIT_R1_REQUIREMENT_EVIDENCE_MATRIX_V1.json', 'utf8'));
  assert.equal(validateEvidenceMatrix(matrix, registry, requirements), true);
  const baseResults = requirements.requiredOutcomes
    .filter((entry) => !entry.id.startsWith('STAGE_'))
    .map((entry) => ({ id: entry.id, status: 'PASS', exitCode: 0, commandDigest: '1'.repeat(64), evidenceDigest: sha(Buffer.from(`${entry.id}\n`)), source: entry.source }));
  const stageResults = compileStageAcceptanceResults({ registry, matrix, baseResults, evaluationSha: 'a'.repeat(40), evaluationTreeSha: 'b'.repeat(40) });
  assert.equal(stageResults.length, 33);
  assert.equal(new Set(stageResults.map((entry) => entry.id)).size, 33);
  assert.equal(validateStageAcceptanceResults({ bundle: { evaluationSha: 'a'.repeat(40), evaluationTreeSha: 'b'.repeat(40), results: [...baseResults, ...stageResults] }, registry, matrix }), true);
  assert.throws(() => compileStageAcceptanceResults({ registry, matrix, baseResults: baseResults.slice(1), evaluationSha: 'a'.repeat(40), evaluationTreeSha: 'b'.repeat(40) }), (error) => error.code === 'E_STAGE_ACCEPTANCE_RESULT_MISSING');
  const circular = structuredClone(matrix); circular.stages[0].signalEvidence[0].outcomeIds = [circular.stages[0].stageResultId];
  assert.throws(() => validateEvidenceMatrix(circular, registry, requirements), (error) => error.code === 'E_MATRIX_UNKNOWN_OR_CIRCULAR_OUTCOME');
});
