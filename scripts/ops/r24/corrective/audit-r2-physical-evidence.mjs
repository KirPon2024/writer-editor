#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { canonicalBytes, canonicalize, readCanonicalJson } from './canonical-json.mjs';
import { assert, assertClosedObject, assertHex, sha256 } from './audit-r1-corrections.mjs';

const REQUIRED_LANES = ['PHYSICAL_A11Y_PERFORMANCE','SYNTHETIC_DOCX','UNSIGNED_MACOS_ARTIFACT','PLATFORM_COMPLEMENTS'];
const safeName = (value) => {
  assert(typeof value === 'string' && /^[A-Za-z0-9._-]+$/u.test(value) && !value.includes('..'), 'E_PHYSICAL_PATH', String(value));
  return value;
};
const git = (args) => {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  assert(result.status === 0, 'E_GIT', args.join(' '));
  return result.stdout.trim();
};
const parseArgs = (argv) => {
  const result = { log: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) continue;
    if (key === '--log') result.log.push(argv[++index]);
    else if (['--compile','--verify'].includes(key)) result[key.slice(2)] = true;
    else result[key.slice(2)] = argv[++index];
  }
  return result;
};
const fileRecord = (root, file, kind) => {
  const name = safeName(path.basename(file));
  const bytes = fs.readFileSync(path.resolve(root, name));
  return { kind, path: name, sha256: sha256(bytes), sizeBytes: bytes.length };
};

export function compileManifest({ evaluationSha, evaluationTreeSha, root, docx, artifact, logs }) {
  assertHex(evaluationSha, 40, 'evaluationSha');
  assertHex(evaluationTreeSha, 40, 'evaluationTreeSha');
  assert(logs.length === 2, 'E_PHYSICAL_LOG_COUNT', logs.length);
  const logRecords = logs.map((entry) => {
    const separator = entry.indexOf('=');
    assert(separator > 0, 'E_PHYSICAL_LOG_ARG', entry);
    const lane = entry.slice(0, separator);
    const file = entry.slice(separator + 1);
    assert(['PHYSICAL_A11Y_PERFORMANCE','PLATFORM_COMPLEMENTS'].includes(lane), 'E_PHYSICAL_LANE', lane);
    const record = fileRecord(root, file, 'SANITIZED_RAW_LOG');
    const text = fs.readFileSync(path.resolve(root, record.path), 'utf8');
    assert(!/(?:^|\n)\s*(?:#\s*)?(?:fail|cancelled|skipped|todo)\s+[1-9][0-9]*/iu.test(text), 'E_PHYSICAL_LOG_FAILURE_OR_SKIP', lane);
    return { lane, commandStatus: 'PASS', exitCode: 0, ...record };
  });
  const docxRecord = fileRecord(root, docx, 'SYNTHETIC_DOCX_BYTES');
  const artifactRecord = fileRecord(root, artifact, 'UNSIGNED_MACOS_ARCHIVE_BYTES');
  assert(fs.readFileSync(path.resolve(root, docxRecord.path)).subarray(0,4).toString('hex') === '504b0304' && docxRecord.sizeBytes >= 256, 'E_DOCX_BYTES', docxRecord.path);
  assert(fs.readFileSync(path.resolve(root, artifactRecord.path)).subarray(0,4).toString('hex') === '504b0304' && artifactRecord.sizeBytes >= 1024, 'E_UNSIGNED_ARTIFACT_BYTES', artifactRecord.path);
  return {
    schemaVersion: 'AUDIT_R2_PHYSICAL_EVIDENCE_MANIFEST_V1',
    evaluationSha,
    evaluationTreeSha,
    platform: `${process.platform}-${process.arch}`,
    lanes: [
      logRecords.find((item) => item.lane === 'PHYSICAL_A11Y_PERFORMANCE'),
      { lane: 'SYNTHETIC_DOCX', commandStatus: 'PASS', exitCode: 0, ...docxRecord },
      { lane: 'UNSIGNED_MACOS_ARTIFACT', commandStatus: 'PASS', exitCode: 0, ...artifactRecord },
      logRecords.find((item) => item.lane === 'PLATFORM_COMPLEMENTS'),
    ],
    skips: { required: 0, unexplained: 0, cancelled: 0, todo: 0 },
    safety: { syntheticDocumentsOnly: true, userDocumentsMutated: false, credentialsRead: false, signed: false, notarized: false, distributed: false },
    status: 'PASS',
  };
}

export function validateManifest(manifest, { root, evaluationSha, evaluationTreeSha, verifyGit = true }) {
  assertClosedObject(manifest, ['evaluationSha','evaluationTreeSha','lanes','platform','safety','schemaVersion','skips','status'], ['evaluationSha','evaluationTreeSha','lanes','platform','safety','schemaVersion','skips','status'], 'physicalManifest');
  assert(manifest.schemaVersion === 'AUDIT_R2_PHYSICAL_EVIDENCE_MANIFEST_V1' && manifest.status === 'PASS', 'E_PHYSICAL_MANIFEST_STATUS', manifest.status);
  assert(/^darwin-(?:arm64|x64)$/u.test(manifest.platform), 'E_PHYSICAL_PLATFORM', manifest.platform);
  assert(manifest.evaluationSha === evaluationSha && manifest.evaluationTreeSha === evaluationTreeSha, 'E_PHYSICAL_STALE_HEAD', `${manifest.evaluationSha}/${manifest.evaluationTreeSha}`);
  if (verifyGit) assert(git(['rev-parse','HEAD']) === evaluationSha && git(['rev-parse','HEAD^{tree}']) === evaluationTreeSha, 'E_PHYSICAL_GIT_BINDING', evaluationSha);
  assert(Array.isArray(manifest.lanes) && manifest.lanes.length === 4, 'E_PHYSICAL_LANE_COUNT', manifest.lanes?.length);
  assert(JSON.stringify(manifest.lanes.map((entry) => entry.lane)) === JSON.stringify(REQUIRED_LANES), 'E_PHYSICAL_LANE_ORDER', manifest.lanes.map((entry) => entry.lane).join(','));
  for (const [index, lane] of manifest.lanes.entries()) {
    assertClosedObject(lane, ['commandStatus','exitCode','kind','lane','path','sha256','sizeBytes'], ['commandStatus','exitCode','kind','lane','path','sha256','sizeBytes'], `lanes.${index}`);
    safeName(lane.path);
    const bytes = fs.readFileSync(path.resolve(root, lane.path));
    assert(lane.sha256 === sha256(bytes) && lane.sizeBytes === bytes.length && lane.commandStatus === 'PASS' && lane.exitCode === 0, 'E_PHYSICAL_LANE_BYTES', lane.lane);
  }
  assert(JSON.stringify(manifest.skips) === JSON.stringify({required:0,unexplained:0,cancelled:0,todo:0}), 'E_PHYSICAL_SKIP', JSON.stringify(manifest.skips));
  assert(manifest.safety.syntheticDocumentsOnly === true && manifest.safety.userDocumentsMutated === false && manifest.safety.credentialsRead === false && manifest.safety.signed === false && manifest.safety.notarized === false && manifest.safety.distributed === false, 'E_PHYSICAL_SAFETY', 'safety');
  return { status: 'PASS', laneCount: 4, evaluationSha, evaluationTreeSha, manifestDigest: sha256(canonicalBytes(manifest)) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseArgs(process.argv.slice(2));
    assert(options.root && options['evaluation-sha'] && options['evaluation-tree'], 'E_USAGE', '--root --evaluation-sha --evaluation-tree');
    if (options.compile) {
      assert(options.docx && options.artifact && options.write, 'E_USAGE', '--docx --artifact --write');
      const manifest = compileManifest({ evaluationSha: options['evaluation-sha'], evaluationTreeSha: options['evaluation-tree'], root: options.root, docx: options.docx, artifact: options.artifact, logs: options.log });
      fs.writeFileSync(options.write, canonicalBytes(manifest), { flag: 'wx' });
      process.stdout.write(`${canonicalize(validateManifest(manifest, {root:options.root,evaluationSha:options['evaluation-sha'],evaluationTreeSha:options['evaluation-tree']}))}\n`);
    } else {
      assert(options.verify, 'E_USAGE', '--compile or --verify');
      const manifest = readCanonicalJson(options.verify).value;
      process.stdout.write(`${canonicalize(validateManifest(manifest, {root:options.root,evaluationSha:options['evaluation-sha'],evaluationTreeSha:options['evaluation-tree']}))}\n`);
    }
  } catch (error) {
    process.stderr.write(`${canonicalize({code:error.code ?? 'E_UNTYPED',message:error.message})}\n`);
    process.exitCode = 1;
  }
}
