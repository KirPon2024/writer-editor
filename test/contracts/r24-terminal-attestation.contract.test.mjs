import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { canonicalBytes, sha256 } from '../../scripts/ops/r24/corrective/canonical-json.mjs';
import { inspectExactZip, verifyDownloadedTerminalArtifact, createDurableCarrier, verifyDurableCarrier } from '../../scripts/ops/r24/corrective/terminal-attestation-verifier.mjs';

const raw = (path) => { const bytes=fs.readFileSync(path); return {bytes,value:JSON.parse(bytes),digest:sha256(bytes)}; };
const CRC_TABLE=new Uint32Array(256).map((_,i)=>{let v=i;for(let b=0;b<8;b+=1)v=(v&1)?(0xedb88320^(v>>>1)):(v>>>1);return v>>>0;});
const crc32=(bytes)=>{let v=0xffffffff;for(const byte of bytes)v=CRC_TABLE[(v^byte)&0xff]^(v>>>8);return(v^0xffffffff)>>>0;};
function zip(entries) {
  const locals=[],centrals=[]; let offset=0;
  for(const entry of entries){
    const name=Buffer.from(entry.name),bytes=Buffer.from(entry.bytes),crc=crc32(bytes);
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0,6);local.writeUInt16LE(0,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(bytes.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(name.length,26);local.writeUInt16LE(0,28);locals.push(local,name,bytes);
    const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE((3<<8)|20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0,8);central.writeUInt16LE(0,10);central.writeUInt32LE(crc,16);central.writeUInt32LE(bytes.length,20);central.writeUInt32LE(bytes.length,24);central.writeUInt16LE(name.length,28);central.writeUInt16LE(0,30);central.writeUInt16LE(0,32);central.writeUInt32LE((0o100644<<16)>>>0,38);central.writeUInt32LE(offset,42);centrals.push(central,name);offset+=local.length+name.length+bytes.length;
  }
  const centralBytes=Buffer.concat(centrals);const eocd=Buffer.alloc(22);eocd.writeUInt32LE(0x06054b50,0);eocd.writeUInt16LE(entries.length,8);eocd.writeUInt16LE(entries.length,10);eocd.writeUInt32LE(centralBytes.length,12);eocd.writeUInt32LE(offset,16);return Buffer.concat([...locals,centralBytes,eocd]);
}
const clone=(value)=>JSON.parse(JSON.stringify(value));
function fixture(mutator=()=>{}) {
  const trustFile=raw('docs/OPS/R24/CORRECTIVE/POST_AUDIT_TERMINAL_TRUST_MODEL_V1.json');
  const programFile=raw('docs/OPS/R24/CORRECTIVE/R24_CORRECTIVE_PROGRAM_V1_1.json');
  const instanceFile=raw('docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_STAGE_INSTANCE_V12.json');
  const admissionFile=raw('docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_STAGE_ADMISSION_ATTESTATION_V12.json');
  const effectiveStateFile=raw('docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_EFFECTIVE_STATE_V1.json');
  const attestation={schemaVersion:'TERMINAL_ATTESTATION_V2',attestationType:'EXTERNAL_IMMUTABLE_TERMINAL_ATTESTATION',result:'PASS',stageId:'POST_AUDIT_CORRECTIONS',programDigest:programFile.digest,trustModelDigest:trustFile.digest,stageInstanceDigest:instanceFile.digest,stageAdmissionDigest:admissionFile.digest,writeSetDigest:admissionFile.value.writeSetDigest,commandScopeDigest:admissionFile.value.commandScopeDigest,acceptanceSignalsDigest:admissionFile.value.acceptanceSignalsDigest,effectiveStateDigest:effectiveStateFile.digest,predecessors:clone(trustFile.value.predecessors),implementationCandidateSha:'1'.repeat(40),implementationMergeSha:'2'.repeat(40),evaluationSha:'2'.repeat(40),evaluationTreeSha:'3'.repeat(40),repository:'KirPonomarev/writer-editor',workflowPath:'.github/workflows/r24-terminal-attestation.yml',workflowRunId:42,runAttempt:1,event:'workflow_dispatch',ref:'refs/heads/main',artifactName:'r24-terminal-attestation-POST_AUDIT_CORRECTIONS',artifactFile:'terminal-attestation.json',programDoneClaimed:false};
  const subject={attestation,trustFile,programFile,instanceFile,admissionFile,effectiveStateFile,runEvidence:{id:42,run_attempt:1,status:'completed',conclusion:'success',event:'workflow_dispatch',head_sha:'2'.repeat(40),head_branch:'main',path:'.github/workflows/r24-terminal-attestation.yml',repository:{full_name:'KirPonomarev/writer-editor'}},artifactEvidence:{id:7,name:'r24-terminal-attestation-POST_AUDIT_CORRECTIONS',expired:false,digest:'',workflow_run:{id:42}},gitEvidence:{evaluationTreeSha:'3'.repeat(40),candidateIsMergeAncestor:true,mergeIsEvaluationAncestor:true,mergeSecondParent:'1'.repeat(40)}};
  mutator(subject);
  const bytes=subject.nonCanonical?Buffer.from(JSON.stringify(subject.attestation,null,2)+'\n'):canonicalBytes(subject.attestation);
  subject.zipBytes=subject.customEntries?zip(subject.customEntries):zip([{name:'terminal-attestation.json',bytes}]);
  if(!subject.keepArtifactDigest)subject.artifactEvidence.digest=`sha256:${sha256(subject.zipBytes)}`;
  return subject;
}

test('strictly verifies remote canonical archive and direct closure authority',()=>{const result=verifyDownloadedTerminalArtifact(fixture());assert.equal(result.status,'VERIFIED');assert.equal(result.stageId,'POST_AUDIT_CORRECTIONS');});
test('rejects forged local payload bytes even with real run metadata',()=>assert.throws(()=>verifyDownloadedTerminalArtifact(fixture(s=>{s.attestation.implementationCandidateSha='9'.repeat(40);})),/E_CANDIDATE_SECOND_PARENT/));
test('rejects wrong artifact identity',()=>assert.throws(()=>verifyDownloadedTerminalArtifact(fixture(s=>{s.artifactEvidence.name='wrong';})),/E_ARTIFACT_IDENTITY_OR_EXPIRY/));
test('rejects an extra ZIP member',()=>assert.throws(()=>verifyDownloadedTerminalArtifact(fixture(s=>{const b=canonicalBytes(s.attestation);s.customEntries=[{name:'terminal-attestation.json',bytes:b},{name:'extra.json',bytes:b}];})),/E_ZIP_EXACT_MEMBER_SET/));
test('rejects duplicate ZIP members',()=>assert.throws(()=>inspectExactZip(zip([{name:'terminal-attestation.json',bytes:'{}\n'},{name:'terminal-attestation.json',bytes:'{}\n'}]),'terminal-attestation.json'),/E_ZIP_DUPLICATE_MEMBER/));
test('rejects traversal ZIP member',()=>assert.throws(()=>inspectExactZip(zip([{name:'../terminal-attestation.json',bytes:'{}\n'}]),'terminal-attestation.json'),/E_ZIP_MEMBER_TRAVERSAL/));
test('rejects non-canonical member bytes',()=>assert.throws(()=>verifyDownloadedTerminalArtifact(fixture(s=>{s.nonCanonical=true;})),/E_NON_CANONICAL_ATTESTATION_BYTES/));
test('rejects archive digest mismatch',()=>assert.throws(()=>verifyDownloadedTerminalArtifact(fixture(s=>{s.keepArtifactDigest=true;s.artifactEvidence.digest=`sha256:${'0'.repeat(64)}`;})),/E_ARCHIVE_DIGEST_MISMATCH/));
test('rejects wrong run attempt',()=>assert.throws(()=>verifyDownloadedTerminalArtifact(fixture(s=>{s.runEvidence.run_attempt=2;})),/E_RUN_ATTEMPT/));
test('rejects wrong repository',()=>assert.throws(()=>verifyDownloadedTerminalArtifact(fixture(s=>{s.runEvidence.repository.full_name='other/repo';})),/E_REPOSITORY_IDENTITY/));
test('rejects wrong workflow',()=>assert.throws(()=>verifyDownloadedTerminalArtifact(fixture(s=>{s.runEvidence.path='.github/workflows/other.yml';})),/E_WORKFLOW_IDENTITY/));
test('rejects wrong run head',()=>assert.throws(()=>verifyDownloadedTerminalArtifact(fixture(s=>{s.runEvidence.head_sha='8'.repeat(40);})),/E_RUN_HEAD_SHA/));
test('rejects broken ancestry',()=>assert.throws(()=>verifyDownloadedTerminalArtifact(fixture(s=>{s.gitEvidence.mergeIsEvaluationAncestor=false;})),/E_ANCESTRY/));
test('rejects wrong candidate second parent',()=>assert.throws(()=>verifyDownloadedTerminalArtifact(fixture(s=>{s.gitEvidence.mergeSecondParent='8'.repeat(40);})),/E_CANDIDATE_SECOND_PARENT/));
test('rejects wrong stage admission binding',()=>assert.throws(()=>verifyDownloadedTerminalArtifact(fixture(s=>{s.attestation.stageAdmissionDigest='8'.repeat(64);})),/E_STAGE_ADMISSION_DIGEST/));
test('rejects stale effective state',()=>assert.throws(()=>verifyDownloadedTerminalArtifact(fixture(s=>{s.attestation.effectiveStateDigest='8'.repeat(64);})),/E_EFFECTIVE_STATE_DIGEST/));
test('rejects cross-stage predecessor substitution',()=>assert.throws(()=>verifyDownloadedTerminalArtifact(fixture(s=>{s.attestation.predecessors.wp400Closure.receiptDigest='8'.repeat(64);})),/E_PREDECESSOR_BINDING/));
test('durable carrier preserves canonical terminal bytes after artifact expiry',()=>{const s=fixture();const verification=verifyDownloadedTerminalArtifact(s);const member=inspectExactZip(s.zipBytes,'terminal-attestation.json');const value=createDurableCarrier({zipBytes:s.zipBytes,attestationBytes:member,runEvidence:s.runEvidence,artifactEvidence:s.artifactEvidence,verification});const bytes=canonicalBytes(value);const result=verifyDurableCarrier({bytes,value,digest:sha256(bytes)});assert.equal(result.status,'VERIFIED');});
test('durable carrier rejects modified canonical bytes',()=>{const s=fixture();const verification=verifyDownloadedTerminalArtifact(s);const member=inspectExactZip(s.zipBytes,'terminal-attestation.json');const value=createDurableCarrier({zipBytes:s.zipBytes,attestationBytes:member,runEvidence:s.runEvidence,artifactEvidence:s.artifactEvidence,verification});value.member.canonicalBase64=Buffer.from('{}\n').toString('base64');const bytes=canonicalBytes(value);assert.throws(()=>verifyDurableCarrier({bytes,value,digest:sha256(bytes)}),/E_DURABLE_MEMBER_DIGEST/);});
test('protected workflow is stage-specific and binds current V12 closure authority plus exact one-file artifact',()=>{const workflow=fs.readFileSync('.github/workflows/r24-terminal-attestation.yml','utf8');for(const token of ['test "$STAGE_ID" = POST_AUDIT_CORRECTIONS','POST_AUDIT_CORRECTIONS_STAGE_INSTANCE_V12.json','POST_AUDIT_CORRECTIONS_STAGE_ADMISSION_ATTESTATION_V12.json','E_CANDIDATE_SECOND_PARENT','E_CLOSURE_STATE_PREDECESSOR','E_CLOSURE_RECEIPT_PREDECESSOR','test "$(find "$RUNNER_TEMP/r24-terminal-attestation" -type f | wc -l | tr -d \' \')" = 1','name: r24-terminal-attestation-${{ inputs.stage_id }}'])assert.equal(workflow.includes(token),true,token);assert.equal(workflow.includes('wp400MutationStarted:false'),false);});
