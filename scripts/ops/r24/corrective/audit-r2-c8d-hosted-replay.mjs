#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { canonicalBytes, canonicalize, readCanonicalJson } from './canonical-json.mjs';
import { assert, assertClosedObject, assertHex, sha256 } from './audit-r1-corrections.mjs';
import { validateManifest } from './audit-r2-physical-evidence.mjs';
import { evaluateRepositoryReleaseSecurityPhysical } from '../release-security-physical-pk1.mjs';

const EXPECTED_BLOCKERS = Object.freeze([
  'APPLE_NOTARIZATION_NOT_READY',
  'DEVELOPER_ID_SIGNATURE_NOT_READY',
  'ELECTRON_FUSE_POLICY_NOT_PROVEN',
  'HARDENED_RUNTIME_NOT_PROVEN_FOR_DISTRIBUTION',
  'NON_MACOS_TARGETS_NOT_ACTIVATED',
  'PHYSICAL_RECEIPTS_NOT_CURRENT_HEAD',
  'PRODUCTION_RELEASE_PUBLICATION_NOT_AUTHORIZED',
]);
const EXPECTED_STALE_RECEIPTS = Object.freeze(['c01', 'c02', 'c03', 'c04']);
const REQUIRED_ARCHIVE_SUFFIX = '/Contents/Resources/app.asar';
const LEXICAL = (left, right) => left < right ? -1 : left > right ? 1 : 0;

const git = (args, cwd = process.cwd()) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 30000 });
  assert(result.status === 0, 'E_HOSTED_C8D_GIT', args.join(' '));
  return String(result.stdout || '').trim();
};
const withinRoot = (root, candidate, label) => {
  const realRoot = fs.realpathSync(root);
  const realCandidate = fs.realpathSync(candidate);
  const relation = path.relative(realRoot, realCandidate);
  assert(relation && !relation.startsWith('..') && !path.isAbsolute(relation), 'E_HOSTED_C8D_PATH_ESCAPE', label);
  assert(fs.lstatSync(candidate).isFile() && !fs.lstatSync(candidate).isSymbolicLink(), 'E_HOSTED_C8D_FILE_TYPE', label);
  return realCandidate;
};
const defaultArchiveTools = Object.freeze({
  list(archivePath) {
    const result = spawnSync('/usr/bin/unzip', ['-Z1', archivePath], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 30000 });
    assert(result.status === 0, 'E_HOSTED_C8D_ARCHIVE_LIST', String(result.stderr || '').slice(-1000));
    return String(result.stdout || '').split('\n').filter(Boolean);
  },
  read(archivePath, entry) {
    const result = spawnSync('/usr/bin/unzip', ['-p', archivePath, entry], { encoding: null, maxBuffer: 256 * 1024 * 1024, timeout: 120000 });
    assert(result.status === 0 && Buffer.isBuffer(result.stdout), 'E_HOSTED_C8D_ARCHIVE_READ', entry);
    return result.stdout;
  },
});
const assertSafeArchiveEntry = (entry) => {
  assert(typeof entry === 'string' && entry.length > 0 && entry === path.posix.normalize(entry)
    && !path.posix.isAbsolute(entry) && entry !== '..' && !entry.startsWith('../') && !entry.includes('\\'), 'E_HOSTED_C8D_ARCHIVE_PATH', String(entry));
};

export function verifyHostedC8D({
  physicalRoot,
  evaluationSha,
  evaluationTreeSha,
  repoRoot = process.cwd(),
  platform = process.platform,
  gitResolve = (args) => git(args, repoRoot),
  evaluatePk1 = (options) => evaluateRepositoryReleaseSecurityPhysical(options),
  archiveTools = defaultArchiveTools,
} = {}) {
  assert(typeof physicalRoot === 'string' && path.isAbsolute(physicalRoot), 'E_HOSTED_C8D_PHYSICAL_ROOT', String(physicalRoot));
  assert(platform === 'darwin', 'E_HOSTED_C8D_PLATFORM', platform);
  assertHex(evaluationSha, 40, 'evaluationSha');
  assertHex(evaluationTreeSha, 40, 'evaluationTreeSha');
  assert(gitResolve(['rev-parse', 'HEAD']) === evaluationSha && gitResolve(['rev-parse', 'HEAD^{tree}']) === evaluationTreeSha, 'E_HOSTED_C8D_STALE_HEAD', evaluationSha);
  const root = fs.realpathSync(physicalRoot);
  const manifestPath = withinRoot(root, path.join(root, 'physical-manifest.json'), 'physical-manifest.json');
  const manifestRead = readCanonicalJson(manifestPath);
  const manifest = manifestRead.value;
  const orderedForLegacyValidator = { ...manifest, skips: { required: manifest.skips?.required, unexplained: manifest.skips?.unexplained, cancelled: manifest.skips?.cancelled, todo: manifest.skips?.todo } };
  const physical = validateManifest(orderedForLegacyValidator, { root, evaluationSha, evaluationTreeSha, verifyGit: false });
  assert(manifest.platform.startsWith('darwin-') && manifest.status === 'PASS', 'E_HOSTED_C8D_MANIFEST_PLATFORM', manifest.platform);
  assert(manifest.skips?.required === 0 && manifest.skips?.unexplained === 0 && manifest.skips?.cancelled === 0 && manifest.skips?.todo === 0, 'E_HOSTED_C8D_SKIP', canonicalize(manifest.skips));
  assert(manifest.safety.credentialsRead === false && manifest.safety.signed === false && manifest.safety.notarized === false
    && manifest.safety.distributed === false && manifest.safety.userDocumentsMutated === false && manifest.safety.syntheticDocumentsOnly === true, 'E_HOSTED_C8D_SAFETY', 'physical');
  const archiveRecord = manifest.lanes.find((lane) => lane.lane === 'UNSIGNED_MACOS_ARTIFACT');
  assert(archiveRecord?.kind === 'UNSIGNED_MACOS_ARCHIVE_BYTES' && archiveRecord.commandStatus === 'PASS' && archiveRecord.exitCode === 0, 'E_HOSTED_C8D_ARCHIVE_RECORD', 'missing');
  const archivePath = withinRoot(root, path.join(root, archiveRecord.path), archiveRecord.path);
  const archiveBytes = fs.readFileSync(archivePath);
  assert(archiveBytes.subarray(0, 4).toString('hex') === '504b0304' && archiveBytes.length === archiveRecord.sizeBytes
    && sha256(archiveBytes) === archiveRecord.sha256, 'E_HOSTED_C8D_ARCHIVE_BYTES', archiveRecord.path);
  const entries = archiveTools.list(archivePath).sort(LEXICAL);
  assert(entries.length > 0 && new Set(entries).size === entries.length, 'E_HOSTED_C8D_ARCHIVE_ENTRIES', String(entries.length));
  entries.forEach(assertSafeArchiveEntry);
  const appAsarEntries = entries.filter((entry) => entry.endsWith(REQUIRED_ARCHIVE_SUFFIX));
  assert(appAsarEntries.length === 1, 'E_HOSTED_C8D_APP_ASAR_CARDINALITY', String(appAsarEntries.length));
  const appAsarBytes = archiveTools.read(archivePath, appAsarEntries[0]);
  assert(Buffer.isBuffer(appAsarBytes) && appAsarBytes.length > 0, 'E_HOSTED_C8D_APP_ASAR_BYTES', String(appAsarBytes?.length));
  const pk1Result = evaluatePk1({ repoRoot, expectedHeadSha: evaluationSha });
  assert(pk1Result?.ok === true, 'E_HOSTED_C8D_PK1', canonicalize(pk1Result?.error?.value?.errors || []));
  const pk1 = pk1Result.value;
  assert(pk1.pass === true && pk1.state === 'ready_for_package_claim_compiler' && pk1.profileVerdictCandidate === 'NOT_READY'
    && pk1.stageClosureKind === 'TYPED_RELEASE_SECURITY_NOT_READY_CLASSIFICATION', 'E_HOSTED_C8D_PK1_VERDICT', pk1.profileVerdictCandidate);
  assert(JSON.stringify(pk1.blockers) === JSON.stringify(EXPECTED_BLOCKERS)
    && JSON.stringify(pk1.releaseReadiness.staleReceipts) === JSON.stringify(EXPECTED_STALE_RECEIPTS), 'E_HOSTED_C8D_PK1_BLOCKERS', canonicalize(pk1.blockers));
  assert(pk1.releaseReadiness.productionReleaseReady === false && pk1.releaseReadiness.currentHeadPhysicalPackageProof === false
    && pk1.authority.releaseReadyClaim === false && pk1.authority.signingPassClaim === false && pk1.authority.notarizationPassClaim === false
    && pk1.authority.fusePassClaim === false && pk1.authority.programScalarPass === false && pk1.authority.releasePublication === false, 'E_HOSTED_C8D_FALSE_PROMOTION', 'PK1');
  return {
    schemaVersion: 'AUDIT_R2_C8D_HOSTED_REPLAY_RESULT_V1',
    status: 'PASS',
    evaluationSha,
    evaluationTreeSha,
    physicalManifestDigest: manifestRead.digest,
    physicalLaneCount: physical.laneCount,
    unsignedArchiveDigest: archiveRecord.sha256,
    unsignedArchiveSizeBytes: archiveRecord.sizeBytes,
    currentAppAsarDigest: sha256(appAsarBytes),
    currentAppAsarSizeBytes: appAsarBytes.length,
    pk1: {
      profileVerdictCandidate: pk1.profileVerdictCandidate,
      productionReleaseReady: pk1.releaseReadiness.productionReleaseReady,
      staleReceipts: pk1.releaseReadiness.staleReceipts,
      blockers: pk1.blockers,
    },
    skips: manifest.skips,
    sameRunPhysicalBytesVerified: true,
    t7DiscoveryRequired: false,
    programDoneClaimed: false,
    wp400MutationStarted: false,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = Object.fromEntries(process.argv.slice(2).reduce((rows, item, index, all) => item.startsWith('--') ? [...rows, [item.slice(2), all[index + 1]]] : rows, []));
    assert(args['physical-root'] && args['evaluation-sha'] && args['evaluation-tree'], 'E_USAGE', '--physical-root --evaluation-sha --evaluation-tree');
    process.stdout.write(canonicalBytes(verifyHostedC8D({ physicalRoot: args['physical-root'], evaluationSha: args['evaluation-sha'], evaluationTreeSha: args['evaluation-tree'] })));
  } catch (error) {
    process.stderr.write(`${canonicalize({ code: error.code ?? 'E_UNTYPED', message: error.message })}\n`);
    process.exitCode = 1;
  }
}
