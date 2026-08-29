import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { canonicalBytes } from '../../scripts/ops/r24/corrective/canonical-json.mjs';
import { verifyDownloadedArtifact } from '../../scripts/ops/r24/corrective/audit-r2-terminal-attestation-verifier.mjs';
import { parseStageLog } from '../../scripts/ops/r24/corrective/audit-r2-stage-replay.mjs';

const SHA='1'.repeat(40);
const TREE='2'.repeat(40);
const h=(bytes)=>crypto.createHash('sha256').update(bytes).digest('hex');
const write=(root,name,value)=>{const bytes=Buffer.isBuffer(value)?value:canonicalBytes(value);const target=path.join(root,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);return bytes;};
const walk=(root,relative='')=>fs.readdirSync(path.join(root,relative),{withFileTypes:true}).flatMap((item)=>item.isDirectory()?walk(root,path.join(relative,item.name)):[path.join(relative,item.name).split(path.sep).join('/')]);
const replayPlan=JSON.parse(fs.readFileSync('docs/OPS/R24/CORRECTIVE/AUDIT_R2_STAGE_REPLAY_PLAN_V1.json','utf8'));
const logFor=(parser)=>parser==='NODE_TAP_ZERO_SKIP'?Buffer.from('TAP version 13\n# tests 1\n# suites 0\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 1\n'):parser==='R24_E0_RECEIPT'?Buffer.from('R24_E0_LANE_RECEIPT={"suite":"PASS","mutants":"PASS","envRegistry":"PASS","docsClaimLint":"PASS","failures":[],"verdict":"PASS"}\n'):parser==='JSON_DOCUMENT_ZERO_VULNERABILITIES'?Buffer.from('{"auditReportVersion":2,"metadata":{"vulnerabilities":{"info":0,"low":0,"moderate":0,"high":0,"critical":0,"total":0}}}\n'):Buffer.from('{"status":"PASS"}\n');
function fixture({stagePassCount=33,physicalRequiredSkips=0,resultCount=10,forgeEnvelope=false,forgeStageResultDigest=false}={}) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'r24-r2-terminal-test-'));
  const ids=['SUCCESSOR_ADMISSION','LEASE_FENCE_ACTIVE','CORRECTED_CONTRACTS','FULL_BASELINE','SECTOR_U_FULL','STAGE_REPLAY_33','PHYSICAL_MACOS','PLATFORM_COMPLEMENTS','GUARDRAILS','FINAL_RELEASE'].slice(0,resultCount);
  const evidence=new Map();
  for(const id of ids) evidence.set(`evidence-${id.toLowerCase()}.log`,write(root,`evidence-${id.toLowerCase()}.log`,Buffer.from(`${id} pass\n`)));
  const priorDigests=new Map();const stageResultDigests=[];
  for(const stagePlan of replayPlan.stages){
    const logName=`stage-${String(stagePlan.order).padStart(2,'0')}-${stagePlan.stageId}.log`;const logBytes=write(root,logName,logFor(stagePlan.parser));
    const artifacts=stagePlan.artifactPaths.map((artifactPath)=>{const carriedPath=path.posix.join('stage-inputs',stagePlan.stageId,artifactPath);const bytes=artifactPath.endsWith('.json')?canonicalBytes({fixture:'AUDIT_R2_TERMINAL_STAGE_INPUT'}):/\.(?:mjs|js)$/u.test(artifactPath)?Buffer.from('test fixture source bytes\n'):Buffer.from('fixture raw bytes\n');write(root,carriedPath,bytes);const record={path:artifactPath,carriedPath,sha256:h(bytes),sizeBytes:bytes.length,parser:artifactPath.endsWith('.json')?'JSON':/\.(?:mjs|js)$/u.test(artifactPath)?'SOURCE_BYTES':'RAW_BYTES'};if(record.parser==='JSON')record.parsedCanonicalDigest=h(canonicalBytes(JSON.parse(bytes)));return record;});
    const dependencies=stagePlan.dependencies.map((stageId)=>({stageId,resultDigest:priorDigests.get(stageId),status:'PASS'}));
    const result={schemaVersion:'AUDIT_R2_STAGE_REPLAY_RESULT_V1',stageId:stagePlan.stageId,order:stagePlan.order,evaluationSha:SHA,evaluationTreeSha:TREE,effectiveAdmissionBinding:replayPlan.effectiveAdmissionBinding,command:stagePlan.command,commandDigest:h(canonicalBytes(stagePlan.command)),dependencies,artifacts,log:{path:logName,sha256:h(logBytes),sizeBytes:logBytes.length},parserResult:parseStageLog(logBytes,stagePlan.parser,stagePlan.stageId),exitCode:0,signal:null,skipped:0,cancelled:0,todo:0,status:'PASS'};
    const resultBytes=write(root,`stage-${String(stagePlan.order).padStart(2,'0')}-${stagePlan.stageId}.json`,result);const digest=h(resultBytes);stageResultDigests.push({stageId:stagePlan.stageId,digest});priorDigests.set(stagePlan.stageId,digest);
  }
  if(forgeStageResultDigest)stageResultDigests[0].digest='0'.repeat(64);
  const stage={schemaVersion:'AUDIT_R2_STAGE_REPLAY_MANIFEST_V1',evaluationSha:SHA,evaluationTreeSha:TREE,replayPlanDigest:h(canonicalBytes(replayPlan)),effectiveAdmissionBindingDigest:h(canonicalBytes(replayPlan.effectiveAdmissionBinding)),stageCount:33,passCount:stagePassCount,requiredSkips:0,unexplainedSkips:0,cancelled:0,todo:0,stageResultDigests,status:'PASS',programDoneClaimed:false,wp400MutationStarted:false};
  const physical={schemaVersion:'AUDIT_R2_PHYSICAL_EVIDENCE_MANIFEST_V1',evaluationSha:SHA,evaluationTreeSha:TREE,platform:'darwin-arm64',lanes:[],skips:{required:physicalRequiredSkips,unexplained:0,cancelled:0,todo:0},safety:{syntheticDocumentsOnly:true,userDocumentsMutated:false,credentialsRead:false,signed:false,notarized:false,distributed:false},status:'PASS'};
  const releasePayload={schemaVersion:'AUDIT_R2_LEASE_EVENT_V1',eventType:'RELEASE',authority:'AUDIT_ROUND_2_FINAL_CORRECTION_BRIEF',writerTaskId:'01a04c8d-a686-7a43-b378-1af1eebc5fbb',fencingCounter:54,leaseAcquisitionEventDigest:'3'.repeat(64),fenceEventDigest:'4'.repeat(64),status:'RELEASED',wip:0,unpreservedWip:0,releaseReason:'TERMINAL_CLOSURE',programDoneClaimed:false,wp400MutationStarted:false,observedAtUtc:'2026-08-29T17:00:00Z'};
  const release={schemaVersion:'AUDIT_R2_LEASE_FENCE_LEDGER_V1',events:[{payload:releasePayload,digest:h(canonicalBytes(releasePayload))}]};
  const stageBytes=write(root,'stage-replay-manifest.json',stage);
  const physicalBytes=write(root,'physical-manifest.json',physical);
  write(root,'lease-release-ledger.json',release);
  const results=ids.map((id)=>{const evidencePath=`evidence-${id.toLowerCase()}.log`;const command={program:'node',args:[id]};return{id,status:'PASS',exitCode:0,command,commandDigest:h(canonicalBytes(command)),evidencePath,evidenceDigest:h(evidence.get(evidencePath)),evaluationSha:SHA,evaluationTreeSha:TREE,source:'GITHUB_ACTIONS_JOB'};});
  const bundle={schemaVersion:'AUDIT_R2_ACCEPTANCE_RESULT_BUNDLE_V1',bundleId:'YALKEN_R24_AUDIT_R2_FINAL_CORRECTION_ACCEPTANCE',evaluationSha:SHA,evaluationTreeSha:TREE,requirementsDigest:'5'.repeat(64),results,stageReplayManifestDigest:h(stageBytes),physicalManifestDigest:h(physicalBytes),leaseReleaseDigest:h(canonicalBytes(releasePayload)),status:'PASS',programDoneClaimed:false,wp400MutationStarted:false};
  const bundleBytes=write(root,'acceptance-bundle.json',bundle);
  const receipt={schemaVersion:'AUDIT_R2_FINAL_CORRECTION_RECEIPT_V1',evaluationSha:SHA,evaluationTreeSha:TREE,acceptanceBundleDigest:h(bundleBytes),stageReplayManifestDigest:h(stageBytes),physicalManifestDigest:h(physicalBytes),leaseReleaseDigest:h(canonicalBytes(releasePayload)),findingClosures:['R24-R2-001','R24-R2-002','R24-R2-003','R24-R2-004','R24-R2-005','R24-R2-006','R24-R2-007','R24-R2-008'],programDoneClaimed:false,wp400MutationStarted:false};
  const receiptBytes=write(root,'final-correction-receipt.json',receipt);
  const payloadNames=walk(root).sort();
  const manifest={schemaVersion:'AUDIT_R2_ARTIFACT_MANIFEST_V1',evaluationSha:SHA,evaluationTreeSha:TREE,entries:payloadNames.map((name)=>{const bytes=fs.readFileSync(path.join(root,name));return{path:name,sha256:h(bytes),sizeBytes:bytes.length};})};
  const manifestBytes=write(root,'artifact-manifest.json',manifest);
  const envelope={schemaVersion:'AUDIT_R2_TERMINAL_ATTESTATION_V1',status:'PASS',evaluationSha:SHA,evaluationTreeSha:TREE,acceptanceBundleDigest:forgeEnvelope?'0'.repeat(64):h(bundleBytes),artifactManifestDigest:h(manifestBytes),finalReceiptDigest:h(receiptBytes),stageReplayManifestDigest:h(stageBytes),physicalManifestDigest:h(physicalBytes),leaseReleaseDigest:h(canonicalBytes(releasePayload)),programDoneClaimed:false,wp400MutationStarted:false};
  write(root,'terminal-envelope.json',envelope);
  const zipPath=path.join(root,'..',`artifact-${crypto.randomUUID()}.zip`);
  execFileSync('zip',['-q','-r',zipPath,...fs.readdirSync(root).sort()],{cwd:root});
  const zipBytes=fs.readFileSync(zipPath);
  const metadata={artifactId:'42',artifactName:'audit-r2-terminal-7',expired:false,runConclusion:'success',runHeadSha:SHA,runId:'7'};
  const expected={artifactId:'42',artifactName:'audit-r2-terminal-7',runId:'7',zipDigest:h(zipBytes),evaluationSha:SHA,evaluationTreeSha:TREE};
  return {root,zipPath,zipBytes,metadata,expected};
}
const cleanup=(value)=>{fs.rmSync(value.root,{recursive:true,force:true});fs.rmSync(value.zipPath,{force:true});};
test('downloaded immutable ZIP, envelope, bundle, manifests and receipt verify together',()=>{const value=fixture();try{const result=verifyDownloadedArtifact(value);assert.equal(result.status,'PASS');assert.equal(result.stageReplayPassCount,33);}finally{cleanup(value);}});
test('wrong uploaded ZIP digest fails closed',()=>{const value=fixture();try{value.expected.zipDigest='0'.repeat(64);assert.throws(()=>verifyDownloadedArtifact(value),(error)=>error.code==='E_ZIP_DIGEST');}finally{cleanup(value);}});
test('forged or substituted envelope bytes fail even when other artifact bytes are real',()=>{const value=fixture({forgeEnvelope:true});try{assert.throws(()=>verifyDownloadedArtifact(value),(error)=>error.code==='E_ENVELOPE_BINDING');}finally{cleanup(value);}});
test('incomplete stage replay and required physical skip cannot emit PASS',()=>{
  for(const [options,code] of [[{stagePassCount:32},'E_STAGE_REPLAY_NOT_COMPLETE'],[{physicalRequiredSkips:1},'E_PHYSICAL_NOT_PASS']]){const value=fixture(options);try{assert.throws(()=>verifyDownloadedArtifact(value),(error)=>error.code===code);}finally{cleanup(value);}}
});
test('missing required acceptance result fails closed',()=>{const value=fixture({resultCount:9});try{assert.throws(()=>verifyDownloadedArtifact(value),(error)=>error.code==='E_BUNDLE_RESULT_COUNT');}finally{cleanup(value);}});
test('fabricated stage result digest fails independent artifact replay',()=>{const value=fixture({forgeStageResultDigest:true});try{assert.throws(()=>verifyDownloadedArtifact(value),(error)=>error.code==='E_STAGE_RESULT_DIGEST');}finally{cleanup(value);}});
test('unsafe ZIP entry is rejected before extraction',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'r24-r2-unsafe-'));const child=path.join(root,'child');fs.mkdirSync(child);fs.writeFileSync(path.join(root,'evil'),'x');const zipPath=path.join(root,'unsafe.zip');execFileSync('zip',['-q',zipPath,'../evil'],{cwd:child});const zipBytes=fs.readFileSync(zipPath);try{assert.throws(()=>verifyDownloadedArtifact({zipBytes,metadata:{artifactId:'42',artifactName:'audit-r2-terminal-7',expired:false,runConclusion:'success',runHeadSha:SHA,runId:'7'},expected:{artifactId:'42',artifactName:'audit-r2-terminal-7',runId:'7',zipDigest:h(zipBytes),evaluationSha:SHA,evaluationTreeSha:TREE}}),(error)=>error.code==='E_ZIP_UNSAFE_ENTRY');}finally{fs.rmSync(root,{recursive:true,force:true});}
});
