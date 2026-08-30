#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { canonicalBytes, canonicalize, sha256 } from './canonical-json.mjs';

const fail = (code, detail = '') => { const error = new Error(`${code}${detail ? `:${detail}` : ''}`); error.code = code; throw error; };
const assert = (condition, code, detail) => { if (!condition) fail(code, detail); };
const exactKeys = (value, keys, label) => assert(value && typeof value === 'object' && !Array.isArray(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()), 'E_UNKNOWN_OR_MISSING_FIELD', label);
const rawJson = (file) => { const bytes = fs.readFileSync(file); return { bytes, value: JSON.parse(bytes), digest: sha256(bytes) }; };
const hex = (value, length, label) => assert(typeof value === 'string' && new RegExp(`^[0-9a-f]{${length}}$`).test(value), 'E_IDENTITY_INVALID', label);
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();

const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  return value >>> 0;
});
const crc32 = (bytes) => {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};
const findEocd = (zip) => {
  const minimum = Math.max(0, zip.length - 65557);
  for (let offset = zip.length - 22; offset >= minimum; offset -= 1) if (zip.readUInt32LE(offset) === 0x06054b50) return offset;
  fail('E_ZIP_EOCD');
};
const safeMemberName = (name) => {
  assert(name === name.normalize('NFC'), 'E_ZIP_MEMBER_NOT_NFC', name);
  assert(name.length > 0 && !name.includes('\\') && !name.startsWith('/') && !/^[A-Za-z]:/.test(name), 'E_ZIP_MEMBER_PATH', name);
  const parts = name.split('/');
  assert(parts.every((part) => part && part !== '.' && part !== '..'), 'E_ZIP_MEMBER_TRAVERSAL', name);
  assert(path.posix.normalize(name) === name, 'E_ZIP_MEMBER_NORMALIZATION', name);
};

export function inspectExactZip(zipBytes, expectedMember) {
  const zip = Buffer.from(zipBytes);
  const eocd = findEocd(zip);
  assert(zip.readUInt16LE(eocd + 4) === 0 && zip.readUInt16LE(eocd + 6) === 0, 'E_ZIP_MULTIDISK');
  const entries = zip.readUInt16LE(eocd + 10);
  assert(entries === zip.readUInt16LE(eocd + 8), 'E_ZIP_ENTRY_COUNT');
  assert(zip.readUInt16LE(eocd + 20) === 0 && eocd + 22 === zip.length, 'E_ZIP_TRAILING_OR_COMMENT');
  const centralSize = zip.readUInt32LE(eocd + 12);
  const centralOffset = zip.readUInt32LE(eocd + 16);
  assert(centralOffset + centralSize === eocd, 'E_ZIP_CENTRAL_BOUNDS');
  const members = [];
  let cursor = centralOffset;
  for (let index = 0; index < entries; index += 1) {
    assert(zip.readUInt32LE(cursor) === 0x02014b50, 'E_ZIP_CENTRAL_SIGNATURE', index);
    const flags = zip.readUInt16LE(cursor + 8), method = zip.readUInt16LE(cursor + 10), crc = zip.readUInt32LE(cursor + 16);
    const compressedSize = zip.readUInt32LE(cursor + 20), uncompressedSize = zip.readUInt32LE(cursor + 24);
    const nameLength = zip.readUInt16LE(cursor + 28), extraLength = zip.readUInt16LE(cursor + 30), commentLength = zip.readUInt16LE(cursor + 32);
    const externalAttributes = zip.readUInt32LE(cursor + 38), localOffset = zip.readUInt32LE(cursor + 42);
    const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    safeMemberName(name);
    assert((flags & 1) === 0, 'E_ZIP_ENCRYPTED', name);
    assert(method === 0 || method === 8, 'E_ZIP_COMPRESSION', method);
    assert(!name.endsWith('/'), 'E_ZIP_DIRECTORY', name);
    const unixMode = externalAttributes >>> 16;
    assert((unixMode & 0o170000) !== 0o120000, 'E_ZIP_SYMLINK', name);
    assert(zip.readUInt32LE(localOffset) === 0x04034b50, 'E_ZIP_LOCAL_SIGNATURE', name);
    const localFlags = zip.readUInt16LE(localOffset + 6), localMethod = zip.readUInt16LE(localOffset + 8);
    const localNameLength = zip.readUInt16LE(localOffset + 26), localExtraLength = zip.readUInt16LE(localOffset + 28);
    const localName = zip.subarray(localOffset + 30, localOffset + 30 + localNameLength).toString('utf8');
    assert(localName === name && localFlags === flags && localMethod === method, 'E_ZIP_LOCAL_CENTRAL_MISMATCH', name);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = zip.subarray(dataStart, dataStart + compressedSize);
    assert(compressed.length === compressedSize && dataStart + compressedSize <= centralOffset, 'E_ZIP_DATA_BOUNDS', name);
    const bytes = method === 0 ? Buffer.from(compressed) : zlib.inflateRawSync(compressed);
    assert(bytes.length === uncompressedSize, 'E_ZIP_UNCOMPRESSED_SIZE', name);
    assert(crc32(bytes) === crc, 'E_ZIP_CRC', name);
    members.push({ name, bytes });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  assert(cursor === eocd, 'E_ZIP_CENTRAL_EXACT');
  assert(new Set(members.map((entry) => entry.name)).size === members.length, 'E_ZIP_DUPLICATE_MEMBER');
  assert(members.length === 1 && members[0].name === expectedMember, 'E_ZIP_EXACT_MEMBER_SET', members.map((entry) => entry.name).join(','));
  return members[0].bytes;
}

const ATTESTATION_KEYS = ['schemaVersion','attestationType','result','stageId','programDigest','trustModelDigest','stageInstanceDigest','stageAdmissionDigest','writeSetDigest','commandScopeDigest','acceptanceSignalsDigest','effectiveStateDigest','predecessors','implementationCandidateSha','implementationMergeSha','evaluationSha','evaluationTreeSha','repository','workflowPath','workflowRunId','runAttempt','event','ref','artifactName','artifactFile','programDoneClaimed'];

export function verifyDownloadedTerminalArtifact({ zipBytes, runEvidence, artifactEvidence, trustFile, programFile, instanceFile, admissionFile, effectiveStateFile, gitEvidence }) {
  assert(runEvidence && artifactEvidence, 'E_EXTERNAL_EVIDENCE_UNAVAILABLE');
  const trust = trustFile.value, instance = instanceFile.value, admission = admissionFile.value, effective = effectiveStateFile.value;
  const issuer = trust.issuer;
  assert(runEvidence.repository?.full_name === issuer.repository, 'E_REPOSITORY_IDENTITY');
  assert(runEvidence.path === issuer.workflowPath, 'E_WORKFLOW_IDENTITY');
  assert(runEvidence.event === issuer.event && runEvidence.head_branch === 'main', 'E_RUN_EVENT_OR_REF');
  assert(runEvidence.status === 'completed' && runEvidence.conclusion === 'success', 'E_RUN_NOT_SUCCESSFUL');
  assert(Number(runEvidence.run_attempt) === issuer.runAttempt, 'E_RUN_ATTEMPT');
  assert(artifactEvidence.name === issuer.artifactName && artifactEvidence.expired === false, 'E_ARTIFACT_IDENTITY_OR_EXPIRY');
  assert(Number(artifactEvidence.workflow_run?.id) === Number(runEvidence.id), 'E_ARTIFACT_RUN_MISMATCH');
  assert(typeof artifactEvidence.digest === 'string' && /^sha256:[0-9a-f]{64}$/.test(artifactEvidence.digest), 'E_ARTIFACT_DIGEST_UNAVAILABLE');
  assert(artifactEvidence.digest === `sha256:${sha256(zipBytes)}`, 'E_ARCHIVE_DIGEST_MISMATCH');
  const attestationBytes = inspectExactZip(zipBytes, issuer.artifactFile);
  const attestation = JSON.parse(attestationBytes);
  assert(attestationBytes.equals(canonicalBytes(attestation)), 'E_NON_CANONICAL_ATTESTATION_BYTES');
  exactKeys(attestation, ATTESTATION_KEYS, 'attestation');
  assert(attestation.schemaVersion === 'TERMINAL_ATTESTATION_V2' && attestation.attestationType === 'EXTERNAL_IMMUTABLE_TERMINAL_ATTESTATION' && attestation.result === 'PASS', 'E_ATTESTATION_SCHEMA');
  assert(attestation.stageId === instance.stageId && admission.stageId === instance.stageId && attestation.stageId === issuer.stageId, 'E_STAGE_IDENTITY');
  assert(attestation.programDigest === programFile.digest && trust.programDigest === programFile.digest, 'E_PROGRAM_DIGEST');
  assert(attestation.trustModelDigest === trustFile.digest, 'E_TRUST_DIGEST');
  assert(attestation.stageInstanceDigest === instanceFile.digest && admission.stageInstanceDigest === instanceFile.digest && trust.stageInstanceDigest === instanceFile.digest, 'E_STAGE_INSTANCE_DIGEST');
  assert(attestation.stageAdmissionDigest === admissionFile.digest && trust.stageAdmissionDigest === admissionFile.digest && admission.status === 'ADMITTED', 'E_STAGE_ADMISSION_DIGEST');
  for (const field of ['writeSetDigest','commandScopeDigest','acceptanceSignalsDigest']) assert(attestation[field] === admission[field] && trust[field] === admission[field], 'E_ADMISSION_SCOPE_BINDING', field);
  assert(attestation.effectiveStateDigest === effectiveStateFile.digest && effective.stageInstanceDigest === instanceFile.digest && effective.stageAdmissionDigest === admissionFile.digest, 'E_EFFECTIVE_STATE_DIGEST');
  assert(canonicalize(attestation.predecessors) === canonicalize(trust.predecessors), 'E_PREDECESSOR_BINDING');
  assert(attestation.repository === issuer.repository && attestation.workflowPath === issuer.workflowPath && attestation.event === issuer.event && attestation.ref === issuer.ref, 'E_ISSUER_BINDING');
  assert(Number(attestation.workflowRunId) === Number(runEvidence.id) && Number(attestation.runAttempt) === Number(runEvidence.run_attempt), 'E_RUN_BINDING');
  assert(attestation.artifactName === issuer.artifactName && attestation.artifactFile === issuer.artifactFile, 'E_ARTIFACT_BINDING');
  assert(attestation.programDoneClaimed === false, 'E_PROGRAM_DONE_CLAIM');
  for (const field of ['implementationCandidateSha','implementationMergeSha','evaluationSha','evaluationTreeSha']) hex(attestation[field], 40, field);
  assert(runEvidence.head_sha === attestation.evaluationSha, 'E_RUN_HEAD_SHA');
  const observed = gitEvidence ?? {
    evaluationTreeSha: git('rev-parse', `${attestation.evaluationSha}^{tree}`),
    candidateIsMergeAncestor: (() => { try { execFileSync('git',['merge-base','--is-ancestor',attestation.implementationCandidateSha,attestation.implementationMergeSha]); return true; } catch { return false; } })(),
    mergeIsEvaluationAncestor: (() => { try { execFileSync('git',['merge-base','--is-ancestor',attestation.implementationMergeSha,attestation.evaluationSha]); return true; } catch { return false; } })(),
    mergeSecondParent: git('rev-parse', `${attestation.implementationMergeSha}^2`)
  };
  assert(observed.evaluationTreeSha === attestation.evaluationTreeSha, 'E_EVALUATION_TREE');
  assert(observed.candidateIsMergeAncestor && observed.mergeIsEvaluationAncestor, 'E_ANCESTRY');
  assert(observed.mergeSecondParent === attestation.implementationCandidateSha, 'E_CANDIDATE_SECOND_PARENT');
  return { schemaVersion:'TERMINAL_ATTESTATION_VALIDATION_V2',status:'VERIFIED',stageId:attestation.stageId,runId:Number(runEvidence.id),runAttempt:Number(runEvidence.run_attempt),artifactId:Number(artifactEvidence.id),archiveDigest:artifactEvidence.digest,attestationDigest:sha256(attestationBytes),evaluationSha:attestation.evaluationSha,evaluationTreeSha:attestation.evaluationTreeSha,stageInstanceDigest:instanceFile.digest,stageAdmissionDigest:admissionFile.digest,writeSetDigest:admission.writeSetDigest,acceptanceSignalsDigest:admission.acceptanceSignalsDigest,programDone:false };
}

export function createDurableCarrier({ zipBytes, attestationBytes, runEvidence, artifactEvidence, verification }) {
  return { schemaVersion:'POST_AUDIT_TERMINAL_ATTESTATION_DURABLE_CARRIER_V1',status:'VERIFIED_DURABLE_CANONICAL_CARRIER',provenance:{provider:'GITHUB_ACTIONS',repository:runEvidence.repository.full_name,workflowPath:runEvidence.path,runId:Number(runEvidence.id),runAttempt:Number(runEvidence.run_attempt),headSha:runEvidence.head_sha,artifactId:Number(artifactEvidence.id),artifactName:artifactEvidence.name},archive:{sha256:sha256(zipBytes),sizeBytes:zipBytes.length},member:{path:'terminal-attestation.json',sha256:sha256(attestationBytes),sizeBytes:attestationBytes.length,canonicalBase64:attestationBytes.toString('base64')},verification,artifactExpiryIndependent:true,programDone:false };
}

export function verifyDurableCarrier(carrierFile) {
  const carrier = carrierFile.value;
  assert(carrier.schemaVersion === 'POST_AUDIT_TERMINAL_ATTESTATION_DURABLE_CARRIER_V1' && carrier.status === 'VERIFIED_DURABLE_CANONICAL_CARRIER', 'E_DURABLE_SCHEMA');
  const bytes = Buffer.from(carrier.member.canonicalBase64, 'base64');
  assert(bytes.length === carrier.member.sizeBytes && sha256(bytes) === carrier.member.sha256, 'E_DURABLE_MEMBER_DIGEST');
  const value = JSON.parse(bytes);
  assert(bytes.equals(canonicalBytes(value)), 'E_DURABLE_MEMBER_CANONICAL');
  assert(value.workflowRunId === carrier.provenance.runId && value.runAttempt === carrier.provenance.runAttempt && value.evaluationSha === carrier.provenance.headSha, 'E_DURABLE_PROVENANCE');
  assert(carrier.verification.attestationDigest === carrier.member.sha256 && carrier.verification.archiveDigest === `sha256:${carrier.archive.sha256}`, 'E_DURABLE_VERIFICATION_BINDING');
  assert(carrier.artifactExpiryIndependent === true && carrier.programDone === false, 'E_DURABLE_POLICY');
  return { schemaVersion:'POST_AUDIT_DURABLE_CARRIER_VALIDATION_V1',status:'VERIFIED',carrierDigest:carrierFile.digest,attestationDigest:carrier.member.sha256,runId:carrier.provenance.runId,artifactId:carrier.provenance.artifactId };
}

function ghJson(endpoint) { return JSON.parse(execFileSync('gh',['api',endpoint],{encoding:'utf8',maxBuffer:16*1024*1024})); }
function ghBytes(endpoint) { return execFileSync('gh',['api',endpoint],{encoding:null,maxBuffer:128*1024*1024}); }
function parseArgs(argv) { const result={}; for(let i=0;i<argv.length;i+=1){if(!argv[i].startsWith('--'))continue; result[argv[i].slice(2)]=argv[i+1]??true; if(argv[i+1]!==undefined)i+=1;} return result; }
function atomicCanonicalWrite(file, value) { const tmp=`${file}.tmp-${process.pid}`; fs.writeFileSync(tmp,canonicalBytes(value),{flag:'wx'}); fs.renameSync(tmp,file); }

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args=parseArgs(process.argv.slice(2));
    if(args['durable-carrier']) {
      process.stdout.write(canonicalBytes(verifyDurableCarrier(rawJson(args['durable-carrier']))));
    } else {
      for(const key of ['remote-run','expected-artifact','trust','program','stage-instance','stage-admission']) assert(args[key], 'E_ARG', key);
      const trustFile=rawJson(args.trust), programFile=rawJson(args.program), instanceFile=rawJson(args['stage-instance']), admissionFile=rawJson(args['stage-admission']);
      const effectivePath='docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_EFFECTIVE_STATE_V1.json';
      const effectiveStateFile=rawJson(effectivePath); const repository=trustFile.value.issuer.repository; const runId=Number(args['remote-run']);
      const runEvidence=ghJson(`repos/${repository}/actions/runs/${runId}`); const artifacts=ghJson(`repos/${repository}/actions/runs/${runId}/artifacts`).artifacts.filter((entry)=>entry.name===args['expected-artifact']);
      assert(artifacts.length===1, 'E_EXACT_ARTIFACT_SELECTION', artifacts.length); const artifactEvidence=artifacts[0]; const zipBytes=ghBytes(`repos/${repository}/actions/artifacts/${artifactEvidence.id}/zip`);
      const attestationBytes=inspectExactZip(zipBytes,trustFile.value.issuer.artifactFile);
      const verification=verifyDownloadedTerminalArtifact({zipBytes,runEvidence,artifactEvidence,trustFile,programFile,instanceFile,admissionFile,effectiveStateFile});
      const carrier=createDurableCarrier({zipBytes,attestationBytes,runEvidence,artifactEvidence,verification});
      const carrierPath=args['write-durable-carrier']||'docs/OPS/R24/CORRECTIVE/POST_AUDIT_TERMINAL_ATTESTATION_DURABLE_CARRIER_V1.json';
      const receiptPath=args['write-terminal-receipt']||'docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_TERMINAL_RECEIPT_V1.json';
      atomicCanonicalWrite(carrierPath,carrier); const carrierFile=rawJson(carrierPath); const durable=verifyDurableCarrier(carrierFile);
      const receipt={schemaVersion:'POST_AUDIT_CORRECTIONS_TERMINAL_RECEIPT_V1',status:'CERTIFIED_DONE',stageId:'POST_AUDIT_CORRECTIONS',evaluationSha:verification.evaluationSha,evaluationTreeSha:verification.evaluationTreeSha,stageInstanceDigest:verification.stageInstanceDigest,stageAdmissionDigest:verification.stageAdmissionDigest,writeSetDigest:verification.writeSetDigest,acceptanceSignalsDigest:verification.acceptanceSignalsDigest,terminalRunId:verification.runId,terminalArtifactId:verification.artifactId,terminalArchiveDigest:verification.archiveDigest,terminalAttestationDigest:verification.attestationDigest,durableCarrierDigest:carrierFile.digest,durableCarrierValidation:durable,leaseDisposition:'RELEASE_ONLY_AFTER_DURABLE_CARRIER_PROTECTED_MERGE_AND_EXACT_POSTMERGE_CI',programDone:false};
      atomicCanonicalWrite(receiptPath,receipt);
      process.stdout.write(canonicalBytes({verification,durable,carrierDigest:carrierFile.digest,receiptDigest:sha256(fs.readFileSync(receiptPath))}));
    }
  } catch(error) { process.stderr.write(`${canonicalize({code:error.code??'E_UNTYPED',message:error.message})}\n`); process.exitCode=1; }
}
