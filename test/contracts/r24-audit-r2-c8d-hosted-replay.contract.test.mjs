import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { canonicalBytes } from '../../scripts/ops/r24/corrective/canonical-json.mjs';
import { compileManifest } from '../../scripts/ops/r24/corrective/audit-r2-physical-evidence.mjs';
import { verifyHostedC8D } from '../../scripts/ops/r24/corrective/audit-r2-c8d-hosted-replay.mjs';

const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname);
const SHA = process.env.AUDIT_R2_EVALUATION_SHA || '1'.repeat(40);
const TREE = process.env.AUDIT_R2_EVALUATION_TREE_SHA || '2'.repeat(40);
const blockers = ['APPLE_NOTARIZATION_NOT_READY','DEVELOPER_ID_SIGNATURE_NOT_READY','ELECTRON_FUSE_POLICY_NOT_PROVEN','HARDENED_RUNTIME_NOT_PROVEN_FOR_DISTRIBUTION','NON_MACOS_TARGETS_NOT_ACTIVATED','PHYSICAL_RECEIPTS_NOT_CURRENT_HEAD','PRODUCTION_RELEASE_PUBLICATION_NOT_AUTHORIZED'];
const pk1 = () => ({ ok: true, value: { pass: true, state: 'ready_for_package_claim_compiler', profileVerdictCandidate: 'NOT_READY', stageClosureKind: 'TYPED_RELEASE_SECURITY_NOT_READY_CLASSIFICATION', blockers, releaseReadiness: { staleReceipts: ['c01','c02','c03','c04'], productionReleaseReady: false, currentHeadPhysicalPackageProof: false }, authority: { releaseReadyClaim: false, signingPassClaim: false, notarizationPassClaim: false, fusePassClaim: false, programScalarPass: false, releasePublication: false } } });

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-c8d-hosted-'));
  const appRoot = path.join(root, 'archive', 'Yalken.app', 'Contents', 'Resources');
  fs.mkdirSync(appRoot, { recursive: true });
  fs.writeFileSync(path.join(appRoot, 'app.asar'), randomBytes(8192));
  const zipped = spawnSync('/usr/bin/zip', ['-X', '-q', '-r', path.join(root, 'unsigned-yalken-app.zip'), '.'], { cwd: path.join(root, 'archive') });
  assert.equal(zipped.status, 0, String(zipped.stderr));
  const docx = Buffer.alloc(512); Buffer.from('504b0304', 'hex').copy(docx); fs.writeFileSync(path.join(root, 'synthetic-audit-r2.docx'), docx);
  fs.writeFileSync(path.join(root, 'physical.log'), 'tests 1\npass 1\nfail 0\nskipped 0\ncancelled 0\ntodo 0\n');
  fs.writeFileSync(path.join(root, 'platform.log'), 'tests 1\npass 1\nfail 0\nskipped 0\ncancelled 0\ntodo 0\n');
  const manifest = compileManifest({ evaluationSha: SHA, evaluationTreeSha: TREE, root, docx: 'synthetic-audit-r2.docx', artifact: 'unsigned-yalken-app.zip', logs: ['PHYSICAL_A11Y_PERFORMANCE=physical.log','PLATFORM_COMPLEMENTS=platform.log'] });
  fs.writeFileSync(path.join(root, 'physical-manifest.json'), canonicalBytes(manifest));
  return { root, manifest };
}
const verify = (root, overrides = {}) => verifyHostedC8D({ physicalRoot: root, evaluationSha: SHA, evaluationTreeSha: TREE, repoRoot, platform: 'darwin', gitResolve: (args) => args.at(-1) === 'HEAD' ? SHA : TREE, evaluatePk1: pk1, ...overrides });

test('C8D hosted replay binds same-run physical manifest, unsigned archive, and app.asar bytes', () => {
  const liveRoot = process.env.AUDIT_R2_PHYSICAL_ROOT;
  const result = liveRoot ? verifyHostedC8D({ physicalRoot: liveRoot, evaluationSha: SHA, evaluationTreeSha: TREE, repoRoot }) : verify(fixture().root);
  assert.equal(result.status, 'PASS');
  assert.equal(result.sameRunPhysicalBytesVerified, true);
  assert.equal(result.t7DiscoveryRequired, false);
  assert.equal(result.physicalLaneCount, 4);
  assert.equal(result.skips.required, 0);
  assert.equal(result.programDoneClaimed, false);
  assert.equal(result.wp400MutationStarted, false);
});

test('missing, stale, wrong-digest, non-Darwin, and promoted safety inputs fail closed', () => {
  const { root, manifest } = fixture();
  assert.throws(() => verify(path.join(root, 'missing')));
  assert.throws(() => verify(root, { evaluationSha: '3'.repeat(40) }));
  assert.throws(() => verify(root, { platform: 'linux' }));
  const archive = path.join(root, 'unsigned-yalken-app.zip'); fs.appendFileSync(archive, 'drift');
  assert.throws(() => verify(root));
  fs.writeFileSync(archive, Buffer.alloc(manifest.lanes[2].sizeBytes, 0));
  const promoted = structuredClone(manifest); promoted.safety.signed = true;
  fs.writeFileSync(path.join(root, 'physical-manifest.json'), canonicalBytes(promoted));
  assert.throws(() => verify(root));
});

test('archive traversal, missing app.asar, and duplicate app.asar fail closed', () => {
  const { root } = fixture();
  const read = () => Buffer.from('asar');
  assert.throws(() => verify(root, { archiveTools: { list: () => ['../escape'], read } }));
  assert.throws(() => verify(root, { archiveTools: { list: () => ['Yalken.app/Contents/Info.plist'], read } }));
  assert.throws(() => verify(root, { archiveTools: { list: () => ['A.app/Contents/Resources/app.asar','B.app/Contents/Resources/app.asar'], read } }));
});

test('PK1 release, signing, notarization, or Program DONE promotion fails closed', () => {
  const { root } = fixture();
  for (const mutate of [
    (value) => { value.releaseReadiness.productionReleaseReady = true; },
    (value) => { value.authority.signingPassClaim = true; },
    (value) => { value.authority.notarizationPassClaim = true; },
    (value) => { value.authority.programScalarPass = true; },
  ]) assert.throws(() => verify(root, { evaluatePk1: () => { const result = pk1(); mutate(result.value); return result; } }));
});

test('hosted successor has no T7, diskutil, or legacy sealed-root dependency', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'scripts/ops/r24/corrective/audit-r2-c8d-hosted-replay.mjs'), 'utf8');
  assert.equal(/diskutil|T7-Secure|verifySealedRawArtifacts|c8c-macos-artifact/u.test(source), false);
});
