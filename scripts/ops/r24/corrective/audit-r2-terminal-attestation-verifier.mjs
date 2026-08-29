#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { canonicalBytes, canonicalize, readCanonicalJson } from './canonical-json.mjs';
import { assert, assertClosedObject, assertExactJson, assertHex, sha256 } from './audit-r1-corrections.mjs';
import { parseStageLog, validateReplayPlan } from './audit-r2-stage-replay.mjs';

const REQUIRED_FILES = ['acceptance-bundle.json','artifact-manifest.json','final-correction-receipt.json','lease-release-ledger.json','physical-manifest.json','stage-replay-manifest.json','terminal-envelope.json'];
const jsonBytes = (bytes, label, canonical = true) => {
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { const error = new Error(label); error.code = 'E_ARTIFACT_JSON_PARSE'; throw error; }
  if (canonical) assert(bytes.equals(canonicalBytes(value)), 'E_ARTIFACT_NON_CANONICAL', label);
  return value;
};
const safeEntry = (entry) => assert(typeof entry === 'string' && entry.length > 0 && !entry.startsWith('/') && !entry.startsWith('\\') && !/^[A-Za-z]:/u.test(entry) && !/(^|\/)\.\.(\/|$)/u.test(entry) && !entry.includes('\\'), 'E_ZIP_UNSAFE_ENTRY', entry);
const run = (program, args, options = {}) => {
  const result = spawnSync(program, args, { encoding: null, maxBuffer: 256 * 1024 * 1024, ...options });
  assert(result.status === 0 && !result.error, 'E_EXTERNAL_COMMAND', `${program} ${args.join(' ')}:${result.status}`);
  return Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? '');
};
function readZipEntries(zipBytes) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-r24-r2-terminal-'));
  const zipPath = path.join(temp, 'artifact.zip');
  fs.writeFileSync(zipPath, zipBytes, { flag: 'wx' });
  try {
    const names = run('unzip', ['-Z1', zipPath]).toString('utf8').trim().split('\n').filter(Boolean);
    assert(names.length > 0 && new Set(names).size === names.length, 'E_ZIP_ENTRY_SET', names.length);
    names.forEach(safeEntry);
    const entries = new Map();
    for (const name of names.filter((entry) => !entry.endsWith('/'))) entries.set(name, run('unzip', ['-p', zipPath, name]));
    return entries;
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
const entry = (entries, name) => {
  const bytes = entries.get(name);
  assert(bytes, 'E_ARTIFACT_ENTRY_MISSING', name);
  return bytes;
};

function verifyStageReplay(entries, manifested, manifest, expected) {
  assertClosedObject(manifest, ['cancelled','effectiveAdmissionBindingDigest','evaluationSha','evaluationTreeSha','passCount','programDoneClaimed','replayPlanDigest','requiredSkips','schemaVersion','stageCount','stageResultDigests','status','todo','unexplainedSkips','wp400MutationStarted'], ['cancelled','effectiveAdmissionBindingDigest','evaluationSha','evaluationTreeSha','passCount','programDoneClaimed','replayPlanDigest','requiredSkips','schemaVersion','stageCount','stageResultDigests','status','todo','unexplainedSkips','wp400MutationStarted'], 'stageReplayManifest');
  assert(manifest.schemaVersion === 'AUDIT_R2_STAGE_REPLAY_MANIFEST_V1' && manifest.evaluationSha === expected.evaluationSha && manifest.evaluationTreeSha === expected.evaluationTreeSha, 'E_STAGE_REPLAY_BINDING', manifest.evaluationSha);
  assert(manifest.stageCount === 33 && manifest.passCount === 33 && manifest.requiredSkips === 0 && manifest.unexplainedSkips === 0 && manifest.cancelled === 0 && manifest.todo === 0 && manifest.status === 'PASS' && manifest.programDoneClaimed === false && manifest.wp400MutationStarted === false, 'E_STAGE_REPLAY_NOT_COMPLETE', `${manifest.passCount}/${manifest.stageCount}`);
  const planFile=readCanonicalJson('docs/OPS/R24/CORRECTIVE/AUDIT_R2_STAGE_REPLAY_PLAN_V1.json');
  const registryFile=readCanonicalJson('docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json');
  validateReplayPlan(planFile.value,registryFile.value,{root:process.cwd()});
  assert(manifest.replayPlanDigest === planFile.digest && manifest.effectiveAdmissionBindingDigest === sha256(canonicalBytes(planFile.value.effectiveAdmissionBinding)), 'E_STAGE_REPLAY_PLAN_BINDING', manifest.replayPlanDigest);
  assert(Array.isArray(manifest.stageResultDigests) && manifest.stageResultDigests.length === 33, 'E_STAGE_RESULT_SET', manifest.stageResultDigests?.length);
  const resultDigests=new Map();
  for (let index=0; index<planFile.value.stages.length; index+=1) {
    const stagePlan=planFile.value.stages[index];
    const digestRecord=manifest.stageResultDigests[index];
    assertClosedObject(digestRecord,['digest','stageId'],['digest','stageId'],`stageResultDigest.${index}`);
    assert(digestRecord.stageId === stagePlan.stageId && !resultDigests.has(stagePlan.stageId), 'E_STAGE_RESULT_ORDER', digestRecord.stageId);
    const resultPath=`stage-${String(index).padStart(2,'0')}-${stagePlan.stageId}.json`;
    const resultBytes=entry(entries,resultPath);
    assert(manifested.has(resultPath) && digestRecord.digest === sha256(resultBytes), 'E_STAGE_RESULT_DIGEST', stagePlan.stageId);
    const result=jsonBytes(resultBytes,resultPath);
    assertClosedObject(result,['artifacts','cancelled','command','commandDigest','dependencies','effectiveAdmissionBinding','evaluationSha','evaluationTreeSha','exitCode','log','order','parserResult','schemaVersion','signal','skipped','stageId','status','todo'],['artifacts','cancelled','command','commandDigest','dependencies','effectiveAdmissionBinding','evaluationSha','evaluationTreeSha','exitCode','log','order','parserResult','schemaVersion','signal','skipped','stageId','status','todo'],`stageResult.${stagePlan.stageId}`);
    assert(result.schemaVersion === 'AUDIT_R2_STAGE_REPLAY_RESULT_V1' && result.stageId === stagePlan.stageId && result.order === index && result.evaluationSha === expected.evaluationSha && result.evaluationTreeSha === expected.evaluationTreeSha && result.exitCode === 0 && result.signal === null && result.skipped === 0 && result.cancelled === 0 && result.todo === 0 && result.status === 'PASS', 'E_STAGE_RESULT_STATUS', stagePlan.stageId);
    assertExactJson(result.effectiveAdmissionBinding,planFile.value.effectiveAdmissionBinding,'E_STAGE_RESULT_ADMISSION_BINDING',stagePlan.stageId);
    assertExactJson(result.command,stagePlan.command,'E_STAGE_RESULT_COMMAND',stagePlan.stageId);
    assert(result.commandDigest === sha256(canonicalBytes(result.command)), 'E_STAGE_RESULT_COMMAND_DIGEST', stagePlan.stageId);
    assert(Array.isArray(result.dependencies) && result.dependencies.length === stagePlan.dependencies.length, 'E_STAGE_RESULT_DEPENDENCY_SET', stagePlan.stageId);
    for (let dependencyIndex=0; dependencyIndex<stagePlan.dependencies.length; dependencyIndex+=1) {
      const dependency=result.dependencies[dependencyIndex],expectedStageId=stagePlan.dependencies[dependencyIndex];
      assertClosedObject(dependency,['resultDigest','stageId','status'],['resultDigest','stageId','status'],`stageResult.${stagePlan.stageId}.dependencies.${dependencyIndex}`);
      assert(dependency.stageId === expectedStageId && dependency.status === 'PASS' && dependency.resultDigest === resultDigests.get(expectedStageId), 'E_STAGE_RESULT_DEPENDENCY', `${stagePlan.stageId}:${expectedStageId}`);
    }
    assertClosedObject(result.log,['path','sha256','sizeBytes'],['path','sha256','sizeBytes'],`stageResult.${stagePlan.stageId}.log`);
    const logBytes=entry(entries,result.log.path);
    assert(manifested.has(result.log.path) && result.log.sha256 === sha256(logBytes) && result.log.sizeBytes === logBytes.length, 'E_STAGE_RESULT_LOG', stagePlan.stageId);
    assertExactJson(result.parserResult,parseStageLog(logBytes,stagePlan.parser,stagePlan.stageId),'E_STAGE_RESULT_PARSER',stagePlan.stageId);
    assert(Array.isArray(result.artifacts) && result.artifacts.length === stagePlan.artifactPaths.length, 'E_STAGE_RESULT_ARTIFACT_SET', stagePlan.stageId);
    for (let artifactIndex=0;artifactIndex<stagePlan.artifactPaths.length;artifactIndex+=1) {
      const artifact=result.artifacts[artifactIndex],expectedPath=stagePlan.artifactPaths[artifactIndex];
      assertClosedObject(artifact,['carriedPath','parsedCanonicalDigest','parser','path','sha256','sizeBytes'],['carriedPath','parser','path','sha256','sizeBytes'],`stageResult.${stagePlan.stageId}.artifacts.${artifactIndex}`);
      assert(artifact.path === expectedPath && artifact.carriedPath === path.posix.join('stage-inputs',stagePlan.stageId,expectedPath), 'E_STAGE_RESULT_ARTIFACT_PATH', `${stagePlan.stageId}:${expectedPath}`);
      const artifactBytes=entry(entries,artifact.carriedPath);
      assert(manifested.has(artifact.carriedPath) && artifact.sha256 === sha256(artifactBytes) && artifact.sizeBytes === artifactBytes.length, 'E_STAGE_RESULT_ARTIFACT_DIGEST', `${stagePlan.stageId}:${expectedPath}`);
      if (expectedPath.endsWith('.json')) {
        const parsed=jsonBytes(artifactBytes,artifact.carriedPath,false);
        assert(artifact.parser === 'JSON' && artifact.parsedCanonicalDigest === sha256(canonicalBytes(parsed)), 'E_STAGE_RESULT_ARTIFACT_PARSE', `${stagePlan.stageId}:${expectedPath}`);
      } else if (/\.(?:mjs|js)$/u.test(expectedPath)) assert(artifact.parser === 'SOURCE_BYTES' && artifact.parsedCanonicalDigest === undefined && artifactBytes.includes(Buffer.from('test','utf8')), 'E_STAGE_RESULT_ARTIFACT_PARSE', `${stagePlan.stageId}:${expectedPath}`);
      else assert(artifact.parser === 'RAW_BYTES' && artifact.parsedCanonicalDigest === undefined, 'E_STAGE_RESULT_ARTIFACT_PARSE', `${stagePlan.stageId}:${expectedPath}`);
    }
    resultDigests.set(stagePlan.stageId,digestRecord.digest);
  }
  return {planDigest:planFile.digest,effectiveAdmissionBindingDigest:manifest.effectiveAdmissionBindingDigest};
}

export function verifyDownloadedArtifact({ zipBytes, metadata, expected }) {
  assert(Buffer.isBuffer(zipBytes) && zipBytes.length > 0, 'E_ZIP_BYTES_MISSING', 'artifact');
  assertClosedObject(metadata, ['artifactId','artifactName','expired','runConclusion','runHeadSha','runId'], ['artifactId','artifactName','expired','runConclusion','runHeadSha','runId'], 'artifactMetadata');
  assert(metadata.artifactId === expected.artifactId && metadata.artifactName === expected.artifactName && metadata.runId === expected.runId && metadata.expired === false && metadata.runConclusion === 'success' && metadata.runHeadSha === expected.evaluationSha, 'E_ARTIFACT_METADATA', JSON.stringify(metadata));
  const zipDigest = sha256(zipBytes);
  assert(zipDigest === expected.zipDigest, 'E_ZIP_DIGEST', zipDigest);
  const entries = readZipEntries(zipBytes);
  for (const name of REQUIRED_FILES) entry(entries, name);
  const manifestBytes = entry(entries, 'artifact-manifest.json');
  const manifest = jsonBytes(manifestBytes, 'artifact-manifest.json');
  assertClosedObject(manifest, ['entries','evaluationSha','evaluationTreeSha','schemaVersion'], ['entries','evaluationSha','evaluationTreeSha','schemaVersion'], 'artifactManifest');
  assert(manifest.schemaVersion === 'AUDIT_R2_ARTIFACT_MANIFEST_V1' && manifest.evaluationSha === expected.evaluationSha && manifest.evaluationTreeSha === expected.evaluationTreeSha, 'E_MANIFEST_BINDING', manifest.evaluationSha);
  assert(Array.isArray(manifest.entries) && manifest.entries.length > 6, 'E_MANIFEST_ENTRIES', manifest.entries?.length);
  const manifested = new Set();
  for (const [index, record] of manifest.entries.entries()) {
    assertClosedObject(record, ['path','sha256','sizeBytes'], ['path','sha256','sizeBytes'], `manifest.entries.${index}`);
    safeEntry(record.path);
    assert(!record.path.endsWith('/'), 'E_MANIFEST_DIRECTORY_ENTRY', record.path);
    assert(!manifested.has(record.path), 'E_MANIFEST_DUPLICATE', record.path);
    manifested.add(record.path);
    const bytes = entry(entries, record.path);
    assert(record.sha256 === sha256(bytes) && record.sizeBytes === bytes.length, 'E_MANIFEST_ENTRY_DIGEST', record.path);
  }
  for (const name of REQUIRED_FILES.filter((item) => item !== 'artifact-manifest.json' && item !== 'terminal-envelope.json')) assert(manifested.has(name), 'E_MANIFEST_REQUIRED_PATH', name);
  for (const name of entries.keys()) if (!['artifact-manifest.json','terminal-envelope.json'].includes(name)) assert(manifested.has(name), 'E_ARTIFACT_UNMANIFESTED_ENTRY', name);
  const bundleBytes = entry(entries, 'acceptance-bundle.json');
  const stageBytes = entry(entries, 'stage-replay-manifest.json');
  const physicalBytes = entry(entries, 'physical-manifest.json');
  const releaseBytes = entry(entries, 'lease-release-ledger.json');
  const receiptBytes = entry(entries, 'final-correction-receipt.json');
  const envelopeBytes = entry(entries, 'terminal-envelope.json');
  const bundle = jsonBytes(bundleBytes, 'acceptance-bundle.json');
  const stage = jsonBytes(stageBytes, 'stage-replay-manifest.json');
  const physical = jsonBytes(physicalBytes, 'physical-manifest.json');
  const release = jsonBytes(releaseBytes, 'lease-release-ledger.json');
  const receipt = jsonBytes(receiptBytes, 'final-correction-receipt.json');
  const envelope = jsonBytes(envelopeBytes, 'terminal-envelope.json');
  assert(bundle.schemaVersion === 'AUDIT_R2_ACCEPTANCE_RESULT_BUNDLE_V1' && bundle.status === 'PASS', 'E_BUNDLE_STATUS', bundle.status);
  assert(bundle.evaluationSha === expected.evaluationSha && bundle.evaluationTreeSha === expected.evaluationTreeSha, 'E_BUNDLE_STALE_HEAD', bundle.evaluationSha);
  assert(Array.isArray(bundle.results) && bundle.results.length === 10, 'E_BUNDLE_RESULT_COUNT', bundle.results?.length);
  const ids = bundle.results.map((result) => result.id);
  assert(new Set(ids).size === 10, 'E_BUNDLE_RESULT_DUPLICATE', ids.join(','));
  for (const result of bundle.results) assert(result.status === 'PASS' && result.exitCode === 0 && result.evaluationSha === expected.evaluationSha && result.evaluationTreeSha === expected.evaluationTreeSha && manifested.has(result.evidencePath) && result.evidenceDigest === sha256(entry(entries, result.evidencePath)), 'E_BUNDLE_RESULT_INVALID', result.id);
  const independentlyVerifiedReplay=verifyStageReplay(entries,manifested,stage,expected);
  assert(physical.status === 'PASS' && physical.evaluationSha === expected.evaluationSha && physical.evaluationTreeSha === expected.evaluationTreeSha && physical.skips.required === 0 && physical.skips.unexplained === 0, 'E_PHYSICAL_NOT_PASS', physical.status);
  const releaseEvent = release.events?.find((record) => record.payload?.eventType === 'RELEASE');
  assert(releaseEvent && releaseEvent.digest === sha256(canonicalBytes(releaseEvent.payload)) && releaseEvent.payload.status === 'RELEASED' && releaseEvent.payload.wip === 0 && releaseEvent.payload.unpreservedWip === 0 && releaseEvent.payload.programDoneClaimed === false && releaseEvent.payload.wp400MutationStarted === false, 'E_RELEASE_NOT_CLOSED', 'release');
  assert(bundle.stageReplayManifestDigest === sha256(stageBytes) && bundle.physicalManifestDigest === sha256(physicalBytes) && bundle.leaseReleaseDigest === releaseEvent.digest, 'E_BUNDLE_NESTED_DIGEST', 'bundle');
  assert(receipt.schemaVersion === 'AUDIT_R2_FINAL_CORRECTION_RECEIPT_V1' && receipt.evaluationSha === expected.evaluationSha && receipt.evaluationTreeSha === expected.evaluationTreeSha && receipt.acceptanceBundleDigest === sha256(bundleBytes) && receipt.stageReplayManifestDigest === sha256(stageBytes) && receipt.physicalManifestDigest === sha256(physicalBytes) && receipt.leaseReleaseDigest === releaseEvent.digest && receipt.programDoneClaimed === false && receipt.wp400MutationStarted === false, 'E_FINAL_RECEIPT_BINDING', 'receipt');
  assert(envelope.schemaVersion === 'AUDIT_R2_TERMINAL_ATTESTATION_V1' && envelope.status === 'PASS' && envelope.evaluationSha === expected.evaluationSha && envelope.evaluationTreeSha === expected.evaluationTreeSha && envelope.acceptanceBundleDigest === sha256(bundleBytes) && envelope.artifactManifestDigest === sha256(manifestBytes) && envelope.finalReceiptDigest === sha256(receiptBytes) && envelope.stageReplayManifestDigest === sha256(stageBytes) && envelope.physicalManifestDigest === sha256(physicalBytes) && envelope.leaseReleaseDigest === releaseEvent.digest && envelope.programDoneClaimed === false && envelope.wp400MutationStarted === false, 'E_ENVELOPE_BINDING', 'envelope');
  return { schemaVersion:'AUDIT_R2_EXTERNAL_TERMINAL_VERIFICATION_V1',status:'PASS',runId:metadata.runId,artifactId:metadata.artifactId,artifactName:metadata.artifactName,artifactZipDigest:zipDigest,evaluationSha:expected.evaluationSha,evaluationTreeSha:expected.evaluationTreeSha,envelopeDigest:sha256(envelopeBytes),bundleDigest:sha256(bundleBytes),manifestDigest:sha256(manifestBytes),stageReplayManifestDigest:sha256(stageBytes),stageReplayPlanDigest:independentlyVerifiedReplay.planDigest,effectiveAdmissionBindingDigest:independentlyVerifiedReplay.effectiveAdmissionBindingDigest,physicalManifestDigest:sha256(physicalBytes),leaseReleaseDigest:releaseEvent.digest,finalReceiptDigest:sha256(receiptBytes),stageReplayPassCount:33,requiredSkips:0,unexplainedSkips:0,programDoneClaimed:false,wp400MutationStarted:false };
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) if (argv[index].startsWith('--')) result[argv[index].slice(2)] = argv[++index];
  return result;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseArgs(process.argv.slice(2));
    for (const key of ['run-id','artifact-id','artifact-name','zip-digest','evaluation-sha','evaluation-tree']) assert(options[key], 'E_USAGE', key);
    const runJson = jsonBytes(run('gh', ['api',`repos/{owner}/{repo}/actions/runs/${options['run-id']}`]), 'run-api', false);
    const artifactJson = jsonBytes(run('gh', ['api',`repos/{owner}/{repo}/actions/artifacts/${options['artifact-id']}`]), 'artifact-api', false);
    const zipBytes = run('gh', ['api',`repos/{owner}/{repo}/actions/artifacts/${options['artifact-id']}/zip`]);
    const metadata = { artifactId:String(artifactJson.id),artifactName:artifactJson.name,expired:artifactJson.expired,runConclusion:runJson.conclusion,runHeadSha:runJson.head_sha,runId:String(runJson.id) };
    const result = verifyDownloadedArtifact({zipBytes,metadata,expected:{artifactId:options['artifact-id'],artifactName:options['artifact-name'],runId:options['run-id'],zipDigest:options['zip-digest'],evaluationSha:options['evaluation-sha'],evaluationTreeSha:options['evaluation-tree']}});
    process.stdout.write(canonicalBytes(result));
  } catch (error) {
    process.stderr.write(`${canonicalize({code:error.code ?? 'E_UNTYPED',message:error.message})}\n`);
    process.exitCode = 1;
  }
}
