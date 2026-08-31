#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { canonicalBytes } from './canonical-json.mjs';
import { inspectExactZip } from './terminal-attestation-verifier.mjs';
import { verifyRuleset } from './post-audit-merge-gate.mjs';

export const EXTERNAL_SOURCE_PLAN_DIGEST='1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a';
export const COMPILED_PROGRAM_FILE_DIGEST='da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a';
export const EXPECTED_STAGE_COUNT=33;
export const EXPECTED_ARTIFACT_BINDING_DENOMINATOR=137;
export const ALLOWED_POST_EVALUATION_CARRIERS=Object.freeze([
  'docs/OPS/R24/CORRECTIVE/AUDIT_CYCLE_1_CORRECTIONS_FINAL_ACCEPTANCE_MATRIX_V1.json',
  'docs/OPS/R24/CORRECTIVE/AUDIT_CYCLE_1_CORRECTIONS_FINAL_EFFECTIVE_STATE_V1.json',
  'docs/OPS/R24/CORRECTIVE/AUDIT_CYCLE_1_CORRECTIONS_FINAL_STAGE_REGISTRY_V1.json',
  'docs/OPS/R24/CORRECTIVE/AUDIT_CYCLE_1_CORRECTIONS_LEASE_RELEASE_V1.json',
  'docs/OPS/R24/CORRECTIVE/AUDIT_CYCLE_1_CORRECTIONS_TERMINAL_RECEIPT_V1.json',
  'docs/OPS/R24/CORRECTIVE/AUDIT_CYCLE_1_LIVE_RULESET_V1.json',
  'docs/OPS/R24/CORRECTIVE/AUDIT_CYCLE_1_PROTECTED_WIP_AFTER_V1.json',
  'docs/OPS/R24/CORRECTIVE/AUDIT_CYCLE_1_TERMINAL_ATTESTATION_DURABLE_CARRIER_V1.json',
  'docs/OPS/R24/CORRECTIVE/C1C_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  'docs/OPS/R24/CORRECTIVE/POST_AUDIT_CURRENT_CERTIFICATION_SET_V2.json'
]);
export const AUDIT_CYCLE_2_ADMISSION_EXPECTATION=Object.freeze({
  authorityPath:'docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_OWNER_AMENDMENT_V16.json',
  authorityDigest:'d07be95b36595ae5877abb04bca32bece319930cc9a210fdd1c88ba5d7b901d8',
  instancePath:'docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_STAGE_INSTANCE_V17.json',
  instanceDigest:'f1c3b756dd3ea694964125087dbe5af33262254adeda4a678fcda38c803d03c2',
  admissionPath:'docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_STAGE_ADMISSION_ATTESTATION_V17.json',
  admissionDigest:'eedb83accc580c155ba90107189e55406cb2080a3e2132fd86eeb3a72c2300f6',
  writeSetDigest:'2ff5201b9c32f2d5902ada501457c59d5c6e3eec8f1939f87001965a58b00bd3',
  baseSha:'cd79111a7342ab52f4cebd0aca57f8f9af6fcffd',
  baseTree:'12e066f9ce85c15ae49c9ed0374144b15158c4fa',
  fencingCounter:58
});
const h=(bytes)=>crypto.createHash('sha256').update(bytes).digest('hex');
const fail=(code,detail='')=>{const error=new Error(`${code}${detail?`:${detail}`:''}`);error.code=code;throw error;};
const assert=(condition,code,detail)=>{if(!condition)fail(code,detail);};
const hex=(value,size,label)=>assert(typeof value==='string'&&new RegExp(`^[0-9a-f]{${size}}$`).test(value),'E_HEX',label);
const validatePath=(value)=>{assert(typeof value==='string'&&value.length>0&&value===value.normalize('NFC')&&!value.includes('\\')&&!value.startsWith('/')&&!value.split('/').some((part)=>!part||part==='.'||part==='..'),'E_ARTIFACT_PATH',String(value));return value;};
const readJsonFile=(file)=>{const bytes=fs.readFileSync(file);assert(bytes.at(-1)===0x0a,'E_CANONICAL_LF',file);return{bytes,digest:h(bytes),value:JSON.parse(bytes)}};
const defaultGit=(args,options={})=>execFileSync('git',args,{encoding:options.encoding??null,maxBuffer:64*1024*1024});
const gitText=(git,args)=>String(git(args,{encoding:'utf8'})).trim();
const objectBytes=(git,sha,artifactPath)=>git(['show',`${sha}:${validatePath(artifactPath)}`],{encoding:null});
const evaluationTree=(git,sha)=>gitText(git,['rev-parse',`${sha}^{tree}`]);
const ensureEvaluationObject=(git,sha)=>{
  try{return evaluationTree(git,sha);}catch(initialError){
    if(git!==defaultGit)throw initialError;
    try{
      const shallow=gitText(defaultGit,['rev-parse','--is-shallow-repository'])==='true';
      if(shallow)defaultGit(['fetch','--no-tags','--no-write-fetch-head','--unshallow','origin'],{encoding:null});
      try{return evaluationTree(defaultGit,sha);}catch{
        defaultGit(['fetch','--no-tags','--no-write-fetch-head','origin',sha],{encoding:null});
        return evaluationTree(defaultGit,sha);
      }
    }catch{fail('E_EVALUATION_OBJECT_UNAVAILABLE',sha);}
  }
};
const exactKeys=(value,keys,label)=>assert(value&&typeof value==='object'&&!Array.isArray(value)&&JSON.stringify(Object.keys(value).sort())===JSON.stringify([...keys].sort()),'E_UNKNOWN_OR_MISSING_FIELD',label);
const finiteId=(value,label)=>{const id=Number(value);assert(Number.isSafeInteger(id)&&id>0,'E_IDENTITY_INVALID',label);return id;};
const rawJsonBytes=(bytes,label)=>{const value=JSON.parse(bytes);return{bytes:Buffer.from(bytes),digest:h(bytes),value,label};};
const atomicCanonicalWrite=(file,value)=>{const temporary=`${file}.tmp-${process.pid}`;fs.writeFileSync(temporary,canonicalBytes(value),{flag:'wx'});fs.renameSync(temporary,file);};

const AUDIT_CYCLE_ATTESTATION_KEYS=Object.freeze([
  'schemaVersion','attestationType','result','stageId','externalSourcePlanDigest','compiledProgramFileDigest','authorityDigest','stageInstanceDigest','stageAdmissionDigest','writeSetDigest','commandScopeDigest','acceptanceSignalsDigest','certificationSetDigest','certificationEvaluationSha','certificationEvaluationTreeSha','certificationStageCount','certificationArtifactBindingDenominator','protectedWipBeforeCarrierDigest','protectedWipBeforeSnapshotDigest','protectedWipBeforeCompleteDenominator','protectedWipBeforeDirtyDenominator','liveRuleset','predecessorPullRequests','correctionDelivery','repository','workflowPath','workflowRunId','runAttempt','event','ref','artifactName','artifactFile','nonRecursiveCarrierPattern','programDoneClaimed','mainProductGraphNodeStarted'
]);
const DURABLE_OUTER_KEYS=Object.freeze(['archive','artifactExpiryIndependent','member','programDone','provenance','schemaVersion','status','verification']);
const DURABLE_PROVENANCE_KEYS=Object.freeze(['provider','repository','workflowPath','runId','runAttempt','headSha','artifactId','artifactName']);
const DURABLE_ARCHIVE_KEYS=Object.freeze(['sha256','sizeBytes']);
const DURABLE_MEMBER_KEYS=Object.freeze(['path','sha256','sizeBytes','canonicalBase64']);
const DURABLE_VERIFICATION_KEYS=Object.freeze(['schemaVersion','status','runId','runAttempt','artifactId','archiveDigest','attestationDigest','evaluationSha','evaluationTreeSha','implementationCandidateSha','certificationSetDigest','terminalRulesetReturnedBytesDigest','terminalRulesetReturnedByteLength','verificationRulesetReturnedBytesDigest','verificationRulesetReturnedByteLength','normalizedRulesetDigest','candidateCiBytesDigest','postmergeCiBytesDigest','programDone']);
const DURABLE_EXPECTATION_KEYS=Object.freeze(['carrierDigest','schemaVersion','provider','repository','workflowPath','runId','runAttempt','headSha','artifactId','artifactName','memberPath','archiveSha256','archiveSizeBytes','memberSha256','memberSizeBytes']);
const DURABLE_MEMBER_LIVE_RULESET_KEYS=Object.freeze(['rulesetId','returnedBytesDigest','returnedByteLength','normalizedRulesetDigest','requiredContexts','protections']);
const DURABLE_MEMBER_PROTECTION_KEYS=Object.freeze(['deletion','nonFastForward','pullRequest','conversationResolution','bypassActorCount']);
const DURABLE_MEMBER_DELIVERY_KEYS=Object.freeze(['implementationCandidateSha','implementationMergeSha','evaluationSha','evaluationTreeSha','candidateCiRunId','candidateCiBytesDigest','exactPostmergeCiRunId','exactPostmergeCiBytesDigest']);
const DURABLE_MEMBER_PR_KEYS=Object.freeze(['candidateSha','mergeSha']);
const AUDIT_CYCLE_2_ATTESTATION_KEYS=Object.freeze([
  'schemaVersion','attestationType','result','stageId','auditReceiptDigest','externalSourcePlanDigest','compiledProgramFileDigest','authorityDigest','stageInstanceDigest','stageAdmissionDigest','writeSetDigest','commandScopeDigest','acceptanceSignalsDigest','certificationSetDigest','certificationEvaluationSha','certificationEvaluationTreeSha','certificationStageCount','certificationArtifactBindingDenominator','protectedWipBeforeCarrierDigest','protectedWipBeforeSnapshotDigest','protectedWipBeforeCompleteDenominator','protectedWipBeforeDirtyDenominator','predecessorCycleEvidence','liveRuleset','verifierRepairs','correctionDelivery','repository','workflowPath','workflowRunId','runAttempt','event','ref','artifactName','artifactFile','nonRecursiveCarrierPattern','programDoneClaimed','mainProductGraphNodeStarted'
]);
const AUDIT_CYCLE_2_PREDECESSOR_KEYS=Object.freeze(['leaseReleaseDigest','terminalReceiptDigest','durableCarrierDigest','durableCarrierValidationSchema']);
const AUDIT_CYCLE_2_REPAIRS_KEYS=Object.freeze(['durableCarrier','liveRuleset']);
const AUDIT_CYCLE_2_DURABLE_REPAIR_KEYS=Object.freeze(['canonicalCarrierDigest','canonicalOuterBytesRequired','expectedCarrierDigestRequired','closedNestedKeysRequired','positiveSizesRequired','exactMemberPathRequired','pinnedProvenanceRequired','cliJsonRequired']);
const AUDIT_CYCLE_2_RULESET_REPAIR_KEYS=Object.freeze(['ruleTypeDenominator','uniqueRuleTypesRequired','closedRoleEnvelopeRequired','explicitBypassActorsRequired','currentUserCanBypassIfPresent']);
const AUDIT_CYCLE_2_DURABLE_VERIFICATION_KEYS=Object.freeze(['schemaVersion','status','runId','runAttempt','artifactId','archiveDigest','attestationDigest','evaluationSha','evaluationTreeSha','implementationCandidateSha','certificationSetDigest','predecessorDurableCarrierDigest','predecessorDurableCarrierValidationSchema','terminalRulesetReturnedBytesDigest','terminalRulesetReturnedByteLength','normalizedRulesetDigest','candidateCiBytesDigest','postmergeCiBytesDigest','programDone']);

export const AUDIT_CYCLE_1_DURABLE_EXPECTATION=Object.freeze({
  carrierDigest:'596c8fecbc486368e34585505b36b074f1b66ffb5073fc189c086a8e0394db0d',
  schemaVersion:'AUDIT_CYCLE_1_TERMINAL_ATTESTATION_DURABLE_CARRIER_V1',
  provider:'GITHUB_ACTIONS',
  repository:'KirPonomarev/writer-editor',
  workflowPath:'.github/workflows/r24-audit-cycle1-terminal-attestation.yml',
  runId:33353487113,
  runAttempt:1,
  headSha:'79c0bb785bc6ace996d535f06970a0f25338cbbf',
  artifactId:9744372163,
  artifactName:'r24-audit-cycle1-terminal-attestation',
  memberPath:'audit-cycle1-terminal-attestation.json',
  archiveSha256:'0bba8002a24a7ba252c00f896247403a8b148526b0c0d1e7ea21ef32f284866e',
  archiveSizeBytes:1869,
  memberSha256:'50d740b36b3de15ebee327dbd01d2b4165350a6cb76c7eeb6a1c084d2d7e891c',
  memberSizeBytes:3148
});

export function verifyAuditCycleTerminalArtifact({zipBytes,runEvidenceFile,artifactEvidence,rulesetEvidenceFile,candidateCiEvidenceFile,postmergeCiEvidenceFile,authorityFile,instanceFile,admissionFile,certificationFile,beforeFile,git=defaultGit}){
  const run=runEvidenceFile.value;
  assert(run?.repository?.full_name==='KirPonomarev/writer-editor'&&run.path==='.github/workflows/r24-audit-cycle1-terminal-attestation.yml','E_RUN_IDENTITY');
  assert(run.event==='workflow_dispatch'&&run.head_branch==='main'&&run.status==='completed'&&run.conclusion==='success','E_RUN_STATE');
  assert(artifactEvidence?.name==='r24-audit-cycle1-terminal-attestation'&&artifactEvidence.expired===false,'E_ARTIFACT_IDENTITY_OR_EXPIRY');
  assert(finiteId(artifactEvidence.workflow_run?.id,'artifact.workflowRunId')===finiteId(run.id,'run.id'),'E_ARTIFACT_RUN_MISMATCH');
  assert(typeof artifactEvidence.digest==='string'&&artifactEvidence.digest===`sha256:${h(zipBytes)}`,'E_ARCHIVE_DIGEST_MISMATCH');
  const memberBytes=inspectExactZip(zipBytes,'audit-cycle1-terminal-attestation.json');
  const member=JSON.parse(memberBytes);
  assert(memberBytes.equals(canonicalBytes(member)),'E_NON_CANONICAL_ATTESTATION_BYTES');
  exactKeys(member,AUDIT_CYCLE_ATTESTATION_KEYS,'auditCycleAttestation');
  assert(member.schemaVersion==='AUDIT_CYCLE_1_TERMINAL_ATTESTATION_V1'&&member.attestationType==='EXTERNAL_IMMUTABLE_ACCEPTANCE_BOUND_TERMINAL_ATTESTATION'&&member.result==='PASS'&&member.stageId==='AUDIT_CYCLE_1_CORRECTIONS','E_ATTESTATION_SCHEMA');
  assert(member.externalSourcePlanDigest===EXTERNAL_SOURCE_PLAN_DIGEST&&member.compiledProgramFileDigest===COMPILED_PROGRAM_FILE_DIGEST&&member.externalSourcePlanDigest!==member.compiledProgramFileDigest,'E_SOURCE_PLAN_ROLE_BINDING');
  assert(member.authorityDigest===authorityFile.digest&&member.stageInstanceDigest===instanceFile.digest&&member.stageAdmissionDigest===admissionFile.digest,'E_ADMISSION_FILE_BINDING');
  assert(admissionFile.value.authorityDigest===authorityFile.digest&&admissionFile.value.stageInstanceDigest===instanceFile.digest&&admissionFile.value.status==='ADMITTED','E_ADMISSION_CHAIN');
  for(const field of ['writeSetDigest','commandScopeDigest','acceptanceSignalsDigest'])assert(member[field]===admissionFile.value[field],'E_ADMISSION_SCOPE_BINDING',field);
  assert(member.certificationSetDigest===certificationFile.digest&&member.certificationEvaluationSha===certificationFile.value.evaluationSha&&member.certificationEvaluationTreeSha===certificationFile.value.evaluationTreeSha,'E_CERTIFICATION_FILE_BINDING');
  assert(member.certificationStageCount===EXPECTED_STAGE_COUNT&&member.certificationArtifactBindingDenominator===EXPECTED_ARTIFACT_BINDING_DENOMINATOR,'E_CERTIFICATION_DENOMINATOR');
  assert(member.protectedWipBeforeCarrierDigest===beforeFile.digest&&member.protectedWipBeforeSnapshotDigest===beforeFile.value.snapshot.snapshotSha256&&member.protectedWipBeforeCompleteDenominator===251&&member.protectedWipBeforeDirtyDenominator===7,'E_PROTECTED_WIP_BEFORE_BINDING');
  const rulesetResult=verifyRuleset(rulesetEvidenceFile.value);
  hex(member.liveRuleset.returnedBytesDigest,64,'terminalRulesetReturnedBytesDigest');
  assert(Number.isSafeInteger(member.liveRuleset.returnedByteLength)&&member.liveRuleset.returnedByteLength>0,'E_LIVE_RULESET_RETURNED_BYTES_LENGTH');
  assert(member.liveRuleset.rulesetId===12270444&&member.liveRuleset.normalizedRulesetDigest===rulesetResult.normalizedRulesetDigest,'E_LIVE_RULESET_BINDING');
  assert(canonicalBytes(member.liveRuleset.requiredContexts).equals(canonicalBytes(rulesetResult.requiredContexts))&&canonicalBytes(member.liveRuleset.protections).equals(canonicalBytes(rulesetResult.protections)),'E_LIVE_RULESET_SEMANTIC_VIEW');
  assert(JSON.stringify(member.liveRuleset.requiredContexts)===JSON.stringify(['merge-gate'])&&member.liveRuleset.protections.bypassActorCount===0&&member.liveRuleset.protections.conversationResolution===true,'E_LIVE_RULESET_POLICY');
  assert(member.predecessorPullRequests?.pr1776?.candidateSha==='77354cfe994588dc1771f3eded29d1e7e68d703f'&&member.predecessorPullRequests.pr1776.mergeSha==='af0bfb704c13b0195c12b0144415f2e769f99752','E_PR1776_IDENTITY');
  assert(member.predecessorPullRequests?.pr1777?.candidateSha==='bf3d21072879d276ca3489b0bbead780fb39f596'&&member.predecessorPullRequests.pr1777.mergeSha==='0a8837ae8b0724fa9c258d98281cae693ce0693e','E_PR1777_IDENTITY');
  const delivery=member.correctionDelivery;
  for(const field of ['implementationCandidateSha','implementationMergeSha','evaluationSha','evaluationTreeSha'])hex(delivery[field],40,field);
  assert(delivery.implementationMergeSha===delivery.evaluationSha&&delivery.evaluationSha===run.head_sha,'E_EVALUATION_RUN_HEAD');
  assert(gitText(git,['rev-parse',`${delivery.evaluationSha}^{tree}`])===delivery.evaluationTreeSha,'E_EVALUATION_TREE');
  assert(gitText(git,['rev-parse',`${delivery.implementationMergeSha}^2`])===delivery.implementationCandidateSha,'E_CANDIDATE_SECOND_PARENT');
  try{git(['merge-base','--is-ancestor',delivery.implementationCandidateSha,delivery.implementationMergeSha],{encoding:null});}catch{fail('E_CANDIDATE_ANCESTRY');}
  try{git(['merge-base','--is-ancestor',certificationFile.value.evaluationSha,delivery.implementationCandidateSha],{encoding:null});}catch{fail('E_CERTIFICATION_EVALUATION_ANCESTRY');}
  assert(finiteId(delivery.candidateCiRunId,'candidateCiRunId')===finiteId(candidateCiEvidenceFile.value.id,'candidateCi.id')&&candidateCiEvidenceFile.value.status==='completed'&&candidateCiEvidenceFile.value.conclusion==='success'&&candidateCiEvidenceFile.value.head_sha===delivery.implementationCandidateSha&&delivery.candidateCiBytesDigest===candidateCiEvidenceFile.digest,'E_CANDIDATE_CI_BINDING');
  assert(finiteId(delivery.exactPostmergeCiRunId,'postmergeCiRunId')===finiteId(postmergeCiEvidenceFile.value.id,'postmergeCi.id')&&postmergeCiEvidenceFile.value.status==='completed'&&postmergeCiEvidenceFile.value.conclusion==='success'&&postmergeCiEvidenceFile.value.head_sha===delivery.implementationMergeSha&&delivery.exactPostmergeCiBytesDigest===postmergeCiEvidenceFile.digest,'E_POSTMERGE_CI_BINDING');
  assert(member.repository==='KirPonomarev/writer-editor'&&member.workflowPath===run.path&&finiteId(member.workflowRunId,'workflowRunId')===finiteId(run.id,'run.id')&&finiteId(member.runAttempt,'runAttempt')===finiteId(run.run_attempt,'runAttempt'),'E_RUN_BINDING');
  assert(member.event==='workflow_dispatch'&&member.ref==='refs/heads/main'&&member.artifactName===artifactEvidence.name&&member.artifactFile==='audit-cycle1-terminal-attestation.json','E_ISSUER_BINDING');
  assert(member.nonRecursiveCarrierPattern===true&&member.programDoneClaimed===false&&member.mainProductGraphNodeStarted===false,'E_TERMINAL_SCOPE');
  return{verification:{schemaVersion:'AUDIT_CYCLE_1_TERMINAL_ATTESTATION_VALIDATION_V1',status:'VERIFIED',runId:finiteId(run.id,'run.id'),runAttempt:finiteId(run.run_attempt,'runAttempt'),artifactId:finiteId(artifactEvidence.id,'artifact.id'),archiveDigest:`sha256:${h(zipBytes)}`,attestationDigest:h(memberBytes),evaluationSha:delivery.evaluationSha,evaluationTreeSha:delivery.evaluationTreeSha,implementationCandidateSha:delivery.implementationCandidateSha,certificationSetDigest:certificationFile.digest,terminalRulesetReturnedBytesDigest:member.liveRuleset.returnedBytesDigest,terminalRulesetReturnedByteLength:member.liveRuleset.returnedByteLength,verificationRulesetReturnedBytesDigest:rulesetEvidenceFile.digest,verificationRulesetReturnedByteLength:rulesetEvidenceFile.bytes.length,normalizedRulesetDigest:rulesetResult.normalizedRulesetDigest,candidateCiBytesDigest:candidateCiEvidenceFile.digest,postmergeCiBytesDigest:postmergeCiEvidenceFile.digest,programDone:false},memberBytes,member};
}

export function createAuditCycleDurableCarrier({zipBytes,memberBytes,runEvidenceFile,artifactEvidence,verification}){
  return{schemaVersion:'AUDIT_CYCLE_1_TERMINAL_ATTESTATION_DURABLE_CARRIER_V1',status:'VERIFIED_DURABLE_CANONICAL_CARRIER',provenance:{provider:'GITHUB_ACTIONS',repository:runEvidenceFile.value.repository.full_name,workflowPath:runEvidenceFile.value.path,runId:finiteId(runEvidenceFile.value.id,'run.id'),runAttempt:finiteId(runEvidenceFile.value.run_attempt,'runAttempt'),headSha:runEvidenceFile.value.head_sha,artifactId:finiteId(artifactEvidence.id,'artifact.id'),artifactName:artifactEvidence.name},archive:{sha256:h(zipBytes),sizeBytes:zipBytes.length},member:{path:'audit-cycle1-terminal-attestation.json',sha256:h(memberBytes),sizeBytes:memberBytes.length,canonicalBase64:memberBytes.toString('base64')},verification,artifactExpiryIndependent:true,programDone:false};
}

export function verifyAuditCycleDurableCarrier(file,expectation=AUDIT_CYCLE_1_DURABLE_EXPECTATION){
  exactKeys(file,['bytes','digest','value'],'durableFile');
  exactKeys(expectation,DURABLE_EXPECTATION_KEYS,'durableExpectation');
  const {bytes:fileBytes,digest,value}=file;
  assert(Buffer.isBuffer(fileBytes),'E_DURABLE_FILE_BYTES');
  hex(digest,64,'carrierDigest');
  hex(expectation.carrierDigest,64,'expectedCarrierDigest');
  assert(h(fileBytes)===digest&&digest===expectation.carrierDigest,'E_DURABLE_CARRIER_DIGEST');
  assert(fileBytes.equals(canonicalBytes(value)),'E_DURABLE_OUTER_CANONICAL_BYTES');
  exactKeys(value,DURABLE_OUTER_KEYS,'durableCarrier');
  exactKeys(value.provenance,DURABLE_PROVENANCE_KEYS,'durableCarrier.provenance');
  exactKeys(value.archive,DURABLE_ARCHIVE_KEYS,'durableCarrier.archive');
  exactKeys(value.member,DURABLE_MEMBER_KEYS,'durableCarrier.member');
  exactKeys(value.verification,DURABLE_VERIFICATION_KEYS,'durableCarrier.verification');
  assert(value.schemaVersion===expectation.schemaVersion&&value.status==='VERIFIED_DURABLE_CANONICAL_CARRIER','E_DURABLE_SCHEMA');
  const provenance=value.provenance;
  assert(provenance.provider===expectation.provider&&provenance.repository===expectation.repository&&provenance.workflowPath===expectation.workflowPath,'E_DURABLE_PROVENANCE_PROVIDER');
  assert(provenance.runId===expectation.runId&&provenance.runAttempt===expectation.runAttempt&&provenance.headSha===expectation.headSha&&provenance.artifactId===expectation.artifactId&&provenance.artifactName===expectation.artifactName,'E_DURABLE_PROVENANCE_IDENTITY');
  assert(value.archive.sha256===expectation.archiveSha256&&value.archive.sizeBytes===expectation.archiveSizeBytes&&Number.isSafeInteger(value.archive.sizeBytes)&&value.archive.sizeBytes>0,'E_DURABLE_ARCHIVE_BINDING');
  assert(value.member.path===expectation.memberPath&&value.member.sha256===expectation.memberSha256&&value.member.sizeBytes===expectation.memberSizeBytes&&Number.isSafeInteger(value.member.sizeBytes)&&value.member.sizeBytes>0,'E_DURABLE_MEMBER_BINDING');
  assert(typeof value.member.canonicalBase64==='string'&&value.member.canonicalBase64.length>0&&/^[A-Za-z0-9+/]+={0,2}$/.test(value.member.canonicalBase64),'E_DURABLE_MEMBER_BASE64');
  const memberBytes=Buffer.from(value.member.canonicalBase64,'base64');
  assert(memberBytes.toString('base64')===value.member.canonicalBase64,'E_DURABLE_MEMBER_BASE64');
  assert(memberBytes.length===value.member.sizeBytes&&h(memberBytes)===value.member.sha256,'E_DURABLE_MEMBER');
  const member=JSON.parse(memberBytes);
  assert(memberBytes.equals(canonicalBytes(member)),'E_DURABLE_MEMBER_CANONICAL_BYTES');
  exactKeys(member,AUDIT_CYCLE_ATTESTATION_KEYS,'durableCarrier.member.attestation');
  exactKeys(member.liveRuleset,DURABLE_MEMBER_LIVE_RULESET_KEYS,'durableCarrier.member.liveRuleset');
  exactKeys(member.liveRuleset.protections,DURABLE_MEMBER_PROTECTION_KEYS,'durableCarrier.member.liveRuleset.protections');
  exactKeys(member.predecessorPullRequests,['pr1776','pr1777'],'durableCarrier.member.predecessorPullRequests');
  exactKeys(member.predecessorPullRequests.pr1776,DURABLE_MEMBER_PR_KEYS,'durableCarrier.member.predecessorPullRequests.pr1776');
  exactKeys(member.predecessorPullRequests.pr1777,DURABLE_MEMBER_PR_KEYS,'durableCarrier.member.predecessorPullRequests.pr1777');
  exactKeys(member.correctionDelivery,DURABLE_MEMBER_DELIVERY_KEYS,'durableCarrier.member.correctionDelivery');
  assert(member.schemaVersion==='AUDIT_CYCLE_1_TERMINAL_ATTESTATION_V1'&&member.result==='PASS'&&member.stageId==='AUDIT_CYCLE_1_CORRECTIONS','E_DURABLE_MEMBER_SCHEMA');
  assert(member.externalSourcePlanDigest===EXTERNAL_SOURCE_PLAN_DIGEST&&member.compiledProgramFileDigest===COMPILED_PROGRAM_FILE_DIGEST&&member.externalSourcePlanDigest!==member.compiledProgramFileDigest,'E_DURABLE_MEMBER_SOURCE_ROLES');
  assert(member.repository===expectation.repository&&member.workflowPath===expectation.workflowPath&&member.workflowRunId===expectation.runId&&member.runAttempt===expectation.runAttempt&&member.artifactName===expectation.artifactName&&member.artifactFile===expectation.memberPath,'E_DURABLE_MEMBER_PROVENANCE');
  assert(member.correctionDelivery.evaluationSha===expectation.headSha&&member.correctionDelivery.implementationMergeSha===expectation.headSha&&member.correctionDelivery.implementationCandidateSha===value.verification.implementationCandidateSha,'E_DURABLE_MEMBER_DELIVERY');
  assert(member.programDoneClaimed===false&&member.mainProductGraphNodeStarted===false&&member.nonRecursiveCarrierPattern===true,'E_DURABLE_MEMBER_SCOPE');
  const verification=value.verification;
  assert(verification.runId===expectation.runId&&verification.runAttempt===expectation.runAttempt&&verification.artifactId===expectation.artifactId&&verification.evaluationSha===expectation.headSha,'E_DURABLE_VERIFICATION_IDENTITY');
  assert(verification.attestationDigest===expectation.memberSha256&&verification.attestationDigest===value.member.sha256&&verification.archiveDigest===`sha256:${expectation.archiveSha256}`&&verification.archiveDigest===`sha256:${value.archive.sha256}`,'E_DURABLE_VERIFICATION_DIGESTS');
  assert(verification.certificationSetDigest===member.certificationSetDigest&&verification.evaluationTreeSha===member.correctionDelivery.evaluationTreeSha&&verification.candidateCiBytesDigest===member.correctionDelivery.candidateCiBytesDigest&&verification.postmergeCiBytesDigest===member.correctionDelivery.exactPostmergeCiBytesDigest,'E_DURABLE_VERIFICATION_MEMBER_BINDING');
  assert(verification.status==='VERIFIED'&&verification.schemaVersion==='AUDIT_CYCLE_1_TERMINAL_ATTESTATION_VALIDATION_V1'&&verification.programDone===false&&value.artifactExpiryIndependent===true&&value.programDone===false,'E_DURABLE_POLICY');
  return{schemaVersion:'AUDIT_CYCLE_1_DURABLE_CARRIER_VALIDATION_V2',status:'VERIFIED',carrierDigest:digest,attestationDigest:value.member.sha256,runId:value.provenance.runId,artifactId:value.provenance.artifactId,programDone:false};
}

export function verifyAuditCycle2TerminalArtifact({zipBytes,runEvidenceFile,artifactEvidence,rulesetEvidenceFile,candidateCiEvidenceFile,postmergeCiEvidenceFile,authorityFile,instanceFile,admissionFile,certificationFile,beforeFile,predecessorReleaseFile,predecessorReceiptFile,predecessorDurableFile,git=defaultGit}){
  const run=runEvidenceFile.value;
  assert(run?.repository?.full_name==='KirPonomarev/writer-editor'&&run.path==='.github/workflows/r24-audit-cycle2-terminal-attestation.yml','E_CYCLE2_RUN_IDENTITY');
  assert(run.event==='workflow_dispatch'&&run.head_branch==='main'&&run.status==='completed'&&run.conclusion==='success','E_CYCLE2_RUN_STATE');
  assert(artifactEvidence?.name==='r24-audit-cycle2-terminal-attestation'&&artifactEvidence.expired===false,'E_CYCLE2_ARTIFACT_IDENTITY_OR_EXPIRY');
  assert(finiteId(artifactEvidence.workflow_run?.id,'cycle2.artifact.workflowRunId')===finiteId(run.id,'cycle2.run.id'),'E_CYCLE2_ARTIFACT_RUN_MISMATCH');
  assert(typeof artifactEvidence.digest==='string'&&artifactEvidence.digest===`sha256:${h(zipBytes)}`,'E_CYCLE2_ARCHIVE_DIGEST_MISMATCH');
  const memberBytes=inspectExactZip(zipBytes,'audit-cycle2-terminal-attestation.json');
  const member=JSON.parse(memberBytes);
  assert(memberBytes.equals(canonicalBytes(member)),'E_CYCLE2_NON_CANONICAL_ATTESTATION_BYTES');
  exactKeys(member,AUDIT_CYCLE_2_ATTESTATION_KEYS,'auditCycle2Attestation');
  exactKeys(member.predecessorCycleEvidence,AUDIT_CYCLE_2_PREDECESSOR_KEYS,'auditCycle2Attestation.predecessorCycleEvidence');
  exactKeys(member.liveRuleset,DURABLE_MEMBER_LIVE_RULESET_KEYS,'auditCycle2Attestation.liveRuleset');
  exactKeys(member.liveRuleset.protections,DURABLE_MEMBER_PROTECTION_KEYS,'auditCycle2Attestation.liveRuleset.protections');
  exactKeys(member.verifierRepairs,AUDIT_CYCLE_2_REPAIRS_KEYS,'auditCycle2Attestation.verifierRepairs');
  exactKeys(member.verifierRepairs.durableCarrier,AUDIT_CYCLE_2_DURABLE_REPAIR_KEYS,'auditCycle2Attestation.verifierRepairs.durableCarrier');
  exactKeys(member.verifierRepairs.liveRuleset,AUDIT_CYCLE_2_RULESET_REPAIR_KEYS,'auditCycle2Attestation.verifierRepairs.liveRuleset');
  exactKeys(member.correctionDelivery,DURABLE_MEMBER_DELIVERY_KEYS,'auditCycle2Attestation.correctionDelivery');
  assert(member.schemaVersion==='AUDIT_CYCLE_2_TERMINAL_ATTESTATION_V1'&&member.attestationType==='EXTERNAL_IMMUTABLE_ACCEPTANCE_BOUND_TERMINAL_ATTESTATION'&&member.result==='PASS'&&member.stageId==='AUDIT_CYCLE_2_CORRECTIONS','E_CYCLE2_ATTESTATION_SCHEMA');
  assert(member.auditReceiptDigest==='babdb1ed4e37d9e8b3b8234ec4b3e86d72d43b3c2fe26a1511a5d3de1a92af70','E_CYCLE2_AUDIT_RECEIPT');
  assert(member.externalSourcePlanDigest===EXTERNAL_SOURCE_PLAN_DIGEST&&member.compiledProgramFileDigest===COMPILED_PROGRAM_FILE_DIGEST&&member.externalSourcePlanDigest!==member.compiledProgramFileDigest,'E_CYCLE2_SOURCE_PLAN_ROLE_BINDING');
  assert(member.authorityDigest===authorityFile.digest&&member.stageInstanceDigest===instanceFile.digest&&member.stageAdmissionDigest===admissionFile.digest,'E_CYCLE2_ADMISSION_FILE_BINDING');
  assert(admissionFile.value.authorityDigest===authorityFile.digest&&admissionFile.value.stageInstanceDigest===instanceFile.digest&&admissionFile.value.status==='ADMITTED'&&admissionFile.value.lease?.fencingCounter===58&&admissionFile.value.lease?.wip===1,'E_CYCLE2_ADMISSION_CHAIN');
  for(const field of ['writeSetDigest','commandScopeDigest','acceptanceSignalsDigest'])assert(member[field]===admissionFile.value[field],'E_CYCLE2_ADMISSION_SCOPE_BINDING',field);
  assert(member.certificationSetDigest===certificationFile.digest&&member.certificationEvaluationSha===certificationFile.value.evaluationSha&&member.certificationEvaluationTreeSha===certificationFile.value.evaluationTreeSha,'E_CYCLE2_CERTIFICATION_FILE_BINDING');
  assert(member.certificationStageCount===EXPECTED_STAGE_COUNT&&member.certificationArtifactBindingDenominator===EXPECTED_ARTIFACT_BINDING_DENOMINATOR,'E_CYCLE2_CERTIFICATION_DENOMINATOR');
  assert(member.protectedWipBeforeCarrierDigest===beforeFile.digest&&member.protectedWipBeforeSnapshotDigest===beforeFile.value.snapshotSha256&&member.protectedWipBeforeCompleteDenominator===252&&member.protectedWipBeforeDirtyDenominator===7,'E_CYCLE2_PROTECTED_WIP_BEFORE_BINDING');
  const predecessorValidation=verifyAuditCycleDurableCarrier(predecessorDurableFile);
  assert(member.predecessorCycleEvidence.leaseReleaseDigest===predecessorReleaseFile.digest&&member.predecessorCycleEvidence.terminalReceiptDigest===predecessorReceiptFile.digest&&member.predecessorCycleEvidence.durableCarrierDigest===predecessorDurableFile.digest&&member.predecessorCycleEvidence.durableCarrierValidationSchema===predecessorValidation.schemaVersion,'E_CYCLE2_PREDECESSOR_BINDING');
  const rulesetResult=verifyRuleset(rulesetEvidenceFile.value);
  assert(member.liveRuleset.rulesetId===12270444&&member.liveRuleset.returnedBytesDigest===rulesetEvidenceFile.digest&&member.liveRuleset.returnedByteLength===rulesetEvidenceFile.bytes.length&&member.liveRuleset.normalizedRulesetDigest===rulesetResult.normalizedRulesetDigest,'E_CYCLE2_LIVE_RULESET_BINDING');
  assert(canonicalBytes(member.liveRuleset.requiredContexts).equals(canonicalBytes(rulesetResult.requiredContexts))&&canonicalBytes(member.liveRuleset.protections).equals(canonicalBytes(rulesetResult.protections)),'E_CYCLE2_LIVE_RULESET_VIEW');
  assert(JSON.stringify(member.liveRuleset.requiredContexts)===JSON.stringify(['merge-gate'])&&member.liveRuleset.protections.bypassActorCount===0&&member.liveRuleset.protections.conversationResolution===true,'E_CYCLE2_LIVE_RULESET_POLICY');
  assert(canonicalBytes(member.verifierRepairs.durableCarrier).equals(canonicalBytes({canonicalCarrierDigest:AUDIT_CYCLE_1_DURABLE_EXPECTATION.carrierDigest,canonicalOuterBytesRequired:true,expectedCarrierDigestRequired:true,closedNestedKeysRequired:true,positiveSizesRequired:true,exactMemberPathRequired:true,pinnedProvenanceRequired:true,cliJsonRequired:true})),'E_CYCLE2_DURABLE_REPAIR');
  assert(canonicalBytes(member.verifierRepairs.liveRuleset).equals(canonicalBytes({ruleTypeDenominator:4,uniqueRuleTypesRequired:true,closedRoleEnvelopeRequired:true,explicitBypassActorsRequired:true,currentUserCanBypassIfPresent:'never'})),'E_CYCLE2_RULESET_REPAIR');
  const delivery=member.correctionDelivery;
  for(const field of ['implementationCandidateSha','implementationMergeSha','evaluationSha','evaluationTreeSha'])hex(delivery[field],40,`cycle2.${field}`);
  assert(delivery.implementationMergeSha===delivery.evaluationSha&&delivery.evaluationSha===run.head_sha,'E_CYCLE2_EVALUATION_RUN_HEAD');
  assert(gitText(git,['rev-parse',`${delivery.evaluationSha}^{tree}`])===delivery.evaluationTreeSha,'E_CYCLE2_EVALUATION_TREE');
  assert(gitText(git,['rev-parse',`${delivery.implementationMergeSha}^2`])===delivery.implementationCandidateSha,'E_CYCLE2_CANDIDATE_SECOND_PARENT');
  try{git(['merge-base','--is-ancestor',delivery.implementationCandidateSha,delivery.implementationMergeSha],{encoding:null});}catch{fail('E_CYCLE2_CANDIDATE_ANCESTRY');}
  try{git(['merge-base','--is-ancestor',certificationFile.value.evaluationSha,delivery.implementationCandidateSha],{encoding:null});}catch{fail('E_CYCLE2_CERTIFICATION_EVALUATION_ANCESTRY');}
  assert(finiteId(delivery.candidateCiRunId,'cycle2.candidateCiRunId')===finiteId(candidateCiEvidenceFile.value.id,'cycle2.candidateCi.id')&&candidateCiEvidenceFile.value.status==='completed'&&candidateCiEvidenceFile.value.conclusion==='success'&&candidateCiEvidenceFile.value.head_sha===delivery.implementationCandidateSha&&delivery.candidateCiBytesDigest===candidateCiEvidenceFile.digest,'E_CYCLE2_CANDIDATE_CI_BINDING');
  assert(finiteId(delivery.exactPostmergeCiRunId,'cycle2.postmergeCiRunId')===finiteId(postmergeCiEvidenceFile.value.id,'cycle2.postmergeCi.id')&&postmergeCiEvidenceFile.value.status==='completed'&&postmergeCiEvidenceFile.value.conclusion==='success'&&postmergeCiEvidenceFile.value.head_sha===delivery.implementationMergeSha&&delivery.exactPostmergeCiBytesDigest===postmergeCiEvidenceFile.digest,'E_CYCLE2_POSTMERGE_CI_BINDING');
  assert(member.repository==='KirPonomarev/writer-editor'&&member.workflowPath===run.path&&finiteId(member.workflowRunId,'cycle2.workflowRunId')===finiteId(run.id,'cycle2.run.id')&&finiteId(member.runAttempt,'cycle2.runAttempt')===finiteId(run.run_attempt,'cycle2.runAttempt'),'E_CYCLE2_RUN_BINDING');
  assert(member.event==='workflow_dispatch'&&member.ref==='refs/heads/main'&&member.artifactName===artifactEvidence.name&&member.artifactFile==='audit-cycle2-terminal-attestation.json','E_CYCLE2_ISSUER_BINDING');
  assert(member.nonRecursiveCarrierPattern===true&&member.programDoneClaimed===false&&member.mainProductGraphNodeStarted===false,'E_CYCLE2_TERMINAL_SCOPE');
  return{verification:{schemaVersion:'AUDIT_CYCLE_2_TERMINAL_ATTESTATION_VALIDATION_V1',status:'VERIFIED',runId:finiteId(run.id,'cycle2.run.id'),runAttempt:finiteId(run.run_attempt,'cycle2.runAttempt'),artifactId:finiteId(artifactEvidence.id,'cycle2.artifact.id'),archiveDigest:`sha256:${h(zipBytes)}`,attestationDigest:h(memberBytes),evaluationSha:delivery.evaluationSha,evaluationTreeSha:delivery.evaluationTreeSha,implementationCandidateSha:delivery.implementationCandidateSha,certificationSetDigest:certificationFile.digest,predecessorDurableCarrierDigest:predecessorDurableFile.digest,predecessorDurableCarrierValidationSchema:predecessorValidation.schemaVersion,terminalRulesetReturnedBytesDigest:rulesetEvidenceFile.digest,terminalRulesetReturnedByteLength:rulesetEvidenceFile.bytes.length,normalizedRulesetDigest:rulesetResult.normalizedRulesetDigest,candidateCiBytesDigest:candidateCiEvidenceFile.digest,postmergeCiBytesDigest:postmergeCiEvidenceFile.digest,programDone:false},memberBytes,member};
}

export function createAuditCycle2DurableCarrier({zipBytes,memberBytes,runEvidenceFile,artifactEvidence,verification}){
  return{schemaVersion:'AUDIT_CYCLE_2_TERMINAL_ATTESTATION_DURABLE_CARRIER_V1',status:'VERIFIED_DURABLE_CANONICAL_CARRIER',provenance:{provider:'GITHUB_ACTIONS',repository:runEvidenceFile.value.repository.full_name,workflowPath:runEvidenceFile.value.path,runId:finiteId(runEvidenceFile.value.id,'cycle2.run.id'),runAttempt:finiteId(runEvidenceFile.value.run_attempt,'cycle2.runAttempt'),headSha:runEvidenceFile.value.head_sha,artifactId:finiteId(artifactEvidence.id,'cycle2.artifact.id'),artifactName:artifactEvidence.name},archive:{sha256:h(zipBytes),sizeBytes:zipBytes.length},member:{path:'audit-cycle2-terminal-attestation.json',sha256:h(memberBytes),sizeBytes:memberBytes.length,canonicalBase64:memberBytes.toString('base64')},verification,artifactExpiryIndependent:true,programDone:false};
}

export function verifyAuditCycle2DurableCarrier(file,{expectedCarrierDigest}){
  exactKeys(file,['bytes','digest','value'],'auditCycle2DurableFile');
  hex(expectedCarrierDigest,64,'cycle2.expectedCarrierDigest');
  const {bytes:fileBytes,digest,value}=file;
  assert(Buffer.isBuffer(fileBytes)&&h(fileBytes)===digest&&digest===expectedCarrierDigest,'E_CYCLE2_DURABLE_CARRIER_DIGEST');
  assert(fileBytes.equals(canonicalBytes(value)),'E_CYCLE2_DURABLE_OUTER_CANONICAL_BYTES');
  exactKeys(value,DURABLE_OUTER_KEYS,'auditCycle2DurableCarrier');
  exactKeys(value.provenance,DURABLE_PROVENANCE_KEYS,'auditCycle2DurableCarrier.provenance');
  exactKeys(value.archive,DURABLE_ARCHIVE_KEYS,'auditCycle2DurableCarrier.archive');
  exactKeys(value.member,DURABLE_MEMBER_KEYS,'auditCycle2DurableCarrier.member');
  exactKeys(value.verification,AUDIT_CYCLE_2_DURABLE_VERIFICATION_KEYS,'auditCycle2DurableCarrier.verification');
  assert(value.schemaVersion==='AUDIT_CYCLE_2_TERMINAL_ATTESTATION_DURABLE_CARRIER_V1'&&value.status==='VERIFIED_DURABLE_CANONICAL_CARRIER','E_CYCLE2_DURABLE_SCHEMA');
  assert(value.provenance.provider==='GITHUB_ACTIONS'&&value.provenance.repository==='KirPonomarev/writer-editor'&&value.provenance.workflowPath==='.github/workflows/r24-audit-cycle2-terminal-attestation.yml'&&value.provenance.artifactName==='r24-audit-cycle2-terminal-attestation','E_CYCLE2_DURABLE_PROVENANCE');
  assert(Number.isSafeInteger(value.archive.sizeBytes)&&value.archive.sizeBytes>0&&typeof value.archive.sha256==='string','E_CYCLE2_DURABLE_ARCHIVE');
  assert(value.member.path==='audit-cycle2-terminal-attestation.json'&&Number.isSafeInteger(value.member.sizeBytes)&&value.member.sizeBytes>0&&typeof value.member.canonicalBase64==='string'&&/^[A-Za-z0-9+/]+={0,2}$/.test(value.member.canonicalBase64),'E_CYCLE2_DURABLE_MEMBER_BINDING');
  const memberBytes=Buffer.from(value.member.canonicalBase64,'base64');
  assert(memberBytes.toString('base64')===value.member.canonicalBase64&&memberBytes.length===value.member.sizeBytes&&h(memberBytes)===value.member.sha256,'E_CYCLE2_DURABLE_MEMBER');
  const member=JSON.parse(memberBytes);
  assert(memberBytes.equals(canonicalBytes(member)),'E_CYCLE2_DURABLE_MEMBER_CANONICAL_BYTES');
  exactKeys(member,AUDIT_CYCLE_2_ATTESTATION_KEYS,'auditCycle2DurableCarrier.member.attestation');
  exactKeys(member.predecessorCycleEvidence,AUDIT_CYCLE_2_PREDECESSOR_KEYS,'auditCycle2DurableCarrier.member.predecessorCycleEvidence');
  exactKeys(member.liveRuleset,DURABLE_MEMBER_LIVE_RULESET_KEYS,'auditCycle2DurableCarrier.member.liveRuleset');
  exactKeys(member.liveRuleset.protections,DURABLE_MEMBER_PROTECTION_KEYS,'auditCycle2DurableCarrier.member.liveRuleset.protections');
  exactKeys(member.verifierRepairs,AUDIT_CYCLE_2_REPAIRS_KEYS,'auditCycle2DurableCarrier.member.verifierRepairs');
  exactKeys(member.correctionDelivery,DURABLE_MEMBER_DELIVERY_KEYS,'auditCycle2DurableCarrier.member.correctionDelivery');
  assert(member.schemaVersion==='AUDIT_CYCLE_2_TERMINAL_ATTESTATION_V1'&&member.result==='PASS'&&member.stageId==='AUDIT_CYCLE_2_CORRECTIONS','E_CYCLE2_DURABLE_MEMBER_SCHEMA');
  assert(member.repository===value.provenance.repository&&member.workflowPath===value.provenance.workflowPath&&member.workflowRunId===value.provenance.runId&&member.runAttempt===value.provenance.runAttempt&&member.artifactName===value.provenance.artifactName&&member.artifactFile===value.member.path,'E_CYCLE2_DURABLE_MEMBER_PROVENANCE');
  assert(member.correctionDelivery.evaluationSha===value.provenance.headSha&&member.correctionDelivery.evaluationSha===value.verification.evaluationSha&&member.correctionDelivery.evaluationTreeSha===value.verification.evaluationTreeSha&&member.correctionDelivery.implementationCandidateSha===value.verification.implementationCandidateSha,'E_CYCLE2_DURABLE_MEMBER_DELIVERY');
  assert(value.verification.runId===value.provenance.runId&&value.verification.runAttempt===value.provenance.runAttempt&&value.verification.artifactId===value.provenance.artifactId,'E_CYCLE2_DURABLE_VERIFICATION_IDENTITY');
  assert(value.verification.attestationDigest===value.member.sha256&&value.verification.archiveDigest===`sha256:${value.archive.sha256}`&&value.verification.certificationSetDigest===member.certificationSetDigest&&value.verification.predecessorDurableCarrierDigest===member.predecessorCycleEvidence.durableCarrierDigest&&value.verification.predecessorDurableCarrierValidationSchema===member.predecessorCycleEvidence.durableCarrierValidationSchema,'E_CYCLE2_DURABLE_VERIFICATION_BINDING');
  assert(value.verification.schemaVersion==='AUDIT_CYCLE_2_TERMINAL_ATTESTATION_VALIDATION_V1'&&value.verification.status==='VERIFIED'&&value.verification.programDone===false&&member.programDoneClaimed===false&&member.mainProductGraphNodeStarted===false&&member.nonRecursiveCarrierPattern===true&&value.artifactExpiryIndependent===true&&value.programDone===false,'E_CYCLE2_DURABLE_POLICY');
  return{schemaVersion:'AUDIT_CYCLE_2_DURABLE_CARRIER_VALIDATION_V1',status:'VERIFIED',carrierDigest:digest,attestationDigest:value.member.sha256,runId:value.provenance.runId,artifactId:value.provenance.artifactId,programDone:false};
}

export function generateCertificationSet({sourceFile,evaluationSha,evaluationTreeSha,git=defaultGit}){
  hex(evaluationSha,40,'evaluationSha');hex(evaluationTreeSha,40,'evaluationTreeSha');
  assert(ensureEvaluationObject(git,evaluationSha)===evaluationTreeSha,'E_EVALUATION_TREE');
  const source=readJsonFile(sourceFile);
  assert(source.value.schemaVersion==='POST_AUDIT_CURRENT_CERTIFICATION_SET_V1','E_SOURCE_SCHEMA');
  assert(source.value.stages.length===EXPECTED_STAGE_COUNT,'E_STAGE_DENOMINATOR');
  let denominator=0;
  const stages=source.value.stages.map((stage)=>({
    ...stage,
    effectiveState:'CERTIFIED_DONE',
    evaluationSha,
    evaluationTreeSha,
    certificationBasis:'AUDIT_CYCLE_1_COMPLETE_GIT_OBJECT_REHASH_AND_EXACT_33_STAGE_REPLAY',
    artifactBindings:stage.artifactBindings.map((binding)=>{
      denominator+=1;
      let bytes;
      try{bytes=objectBytes(git,evaluationSha,binding.path);}catch{fail('E_ARTIFACT_MISSING',binding.path);}
      return{path:binding.path,sha256:h(bytes)};
    })
  }));
  assert(denominator===EXPECTED_ARTIFACT_BINDING_DENOMINATOR,'E_ARTIFACT_DENOMINATOR',String(denominator));
  return{
    schemaVersion:'POST_AUDIT_CURRENT_CERTIFICATION_SET_V2',
    certificationSetId:'AUDIT_CYCLE_1_EXACT_GIT_OBJECT_CERTIFICATION_SET',
    status:'CERTIFIED_DONE',
    supersedesDigest:source.digest,
    programId:source.value.programId,
    externalSourcePlanDigest:EXTERNAL_SOURCE_PLAN_DIGEST,
    compiledProgramFileDigest:COMPILED_PROGRAM_FILE_DIGEST,
    evaluationSha,evaluationTreeSha,
    effectiveStateEnum:source.value.effectiveStateEnum,
    generation:{algorithm:'READ_ONLY_GIT_SHOW_EVALUATION_SHA_COLON_REPO_RELATIVE_PATH_SHA256_EXACT_BYTES',sourceSetDigest:source.digest,gitObjectLookupOnly:true,selfHashEqualityRequired:false},
    postEvaluationCarrierException:{policy:'NON_RECURSIVE_INDEPENDENT_PROOF_CARRIERS_OR_STRICTLY_NECESSARY_GOVERNANCE_APPROVAL_ONLY_NO_CERTIFIED_ARTIFACT_BINDING_MAY_POSTDATE_EVALUATION',allowedPaths:[...ALLOWED_POST_EVALUATION_CARRIERS],machineCheckedCandidateDiff:true},
    stages,
    stageCount:stages.length,
    artifactBindingDenominator:denominator,
    verifiedArtifactBindingCount:denominator,
    missingArtifactBindingCount:0,
    mismatchedArtifactBindingCount:0,
    allDeclaredBindingsResolvedFromEvaluationGitObjects:true,
    requiredOrUnexplainedSkips:0,
    programDone:false,
    mainProductGraphNodeStarted:false
  };
}

export function verifyAuditCycle2PostEvaluationException({candidateSha='HEAD',git=defaultGit}={}){
  const expectation=AUDIT_CYCLE_2_ADMISSION_EXPECTATION;
  const authority=readJsonFile(expectation.authorityPath),instance=readJsonFile(expectation.instancePath),admission=readJsonFile(expectation.admissionPath);
  assert(authority.digest===expectation.authorityDigest&&instance.digest===expectation.instanceDigest&&admission.digest===expectation.admissionDigest,'E_CYCLE2_EXCEPTION_CARRIER_DIGEST');
  assert(authority.value?.schemaVersion==='POST_AUDIT_CORRECTIONS_OWNER_AUTHORITY_V1'&&authority.value.authorityId==='OWNER_AUDIT_CYCLE_2_CORRECTIONS_V1','E_CYCLE2_EXCEPTION_AUTHORITY');
  assert(instance.value?.schemaVersion==='STAGE_INSTANCE_V2'&&instance.value.stageId==='AUDIT_CYCLE_2_CORRECTIONS'&&instance.value.authorityId===authority.value.authorityId,'E_CYCLE2_EXCEPTION_INSTANCE');
  assert(admission.value?.schemaVersion==='STAGE_ADMISSION_ATTESTATION_V2'&&admission.value.status==='ADMITTED'&&admission.value.decision==='INSTANCE_IS_EXACT_SUBSET_OF_OWNER_AUTHORIZED_SUCCESSOR','E_CYCLE2_EXCEPTION_ADMISSION');
  assert(admission.value.authorityDigest===authority.digest&&admission.value.stageInstanceDigest===instance.digest&&admission.value.writeSetDigest===expectation.writeSetDigest,'E_CYCLE2_EXCEPTION_CHAIN');
  assert(admission.value.externalSourcePlanDigest===EXTERNAL_SOURCE_PLAN_DIGEST&&admission.value.compiledProgramFileDigest===COMPILED_PROGRAM_FILE_DIGEST,'E_CYCLE2_EXCEPTION_SOURCE_ROLES');
  assert(admission.value.lease?.fencingCounter===expectation.fencingCounter&&admission.value.lease.status==='ACTIVE'&&admission.value.lease.wip===1,'E_CYCLE2_EXCEPTION_LEASE');
  assert(instance.value.baseSha===expectation.baseSha&&instance.value.headSha===expectation.baseSha&&instance.value.treeSha===expectation.baseTree&&authority.value.baseSha===expectation.baseSha&&authority.value.baseTree===expectation.baseTree,'E_CYCLE2_EXCEPTION_BASE');
  assert(evaluationTree(git,expectation.baseSha)===expectation.baseTree,'E_CYCLE2_EXCEPTION_BASE_TREE');
  assert(canonicalBytes(authority.value.allowedOperations).equals(canonicalBytes(instance.value.operations)),'E_CYCLE2_EXCEPTION_OPERATION_BINDING');
  const operations=instance.value.operations;
  assert(Array.isArray(operations.readPaths)&&Array.isArray(operations.modifyPaths)&&Array.isArray(operations.createPaths)&&Array.isArray(operations.deletePaths)&&Array.isArray(operations.renamePairs),'E_CYCLE2_EXCEPTION_OPERATIONS');
  const admitted=[...operations.modifyPaths,...operations.createPaths,...operations.deletePaths,...operations.renamePairs.flatMap((pair)=>[pair.from,pair.to])].map(validatePath).sort();
  assert(new Set(admitted).size===admitted.length,'E_CYCLE2_EXCEPTION_DUPLICATE_PATH');
  const resolvedCandidate=gitText(git,['rev-parse',candidateSha]);
  try{git(['merge-base','--is-ancestor',expectation.baseSha,resolvedCandidate],{encoding:null});}catch{fail('E_CYCLE2_EXCEPTION_BASE_NOT_ANCESTOR');}
  const changed=gitText(git,['diff','--name-only',`${expectation.baseSha}..${resolvedCandidate}`]).split('\n').filter(Boolean).sort();
  for(const changedPath of changed)assert(admitted.includes(changedPath),'E_CYCLE2_EXCEPTION_UNADMITTED_PATH',changedPath);
  return{schemaVersion:'AUDIT_CYCLE_2_POST_EVALUATION_EXCEPTION_VERIFICATION_V1',status:'PASS',authorityDigest:authority.digest,stageInstanceDigest:instance.digest,stageAdmissionDigest:admission.digest,writeSetDigest:admission.value.writeSetDigest,baseSha:expectation.baseSha,baseTree:expectation.baseTree,admittedPathDenominator:admitted.length,changedPaths:changed,admittedPaths:admitted};
}

export function verifyCertificationSet({value,fileDigest,candidateSha='HEAD',git=defaultGit,allowAuditCycle2Admission=false}){
  assert(value?.schemaVersion==='POST_AUDIT_CURRENT_CERTIFICATION_SET_V2'&&value.status==='CERTIFIED_DONE','E_SCHEMA_OR_STATUS');
  assert(value.externalSourcePlanDigest===EXTERNAL_SOURCE_PLAN_DIGEST&&value.compiledProgramFileDigest===COMPILED_PROGRAM_FILE_DIGEST&&value.externalSourcePlanDigest!==value.compiledProgramFileDigest,'E_SOURCE_PLAN_ROLE_BINDING');
  hex(value.evaluationSha,40,'evaluationSha');hex(value.evaluationTreeSha,40,'evaluationTreeSha');hex(fileDigest,64,'fileDigest');
  assert(ensureEvaluationObject(git,value.evaluationSha)===value.evaluationTreeSha,'E_EVALUATION_TREE');
  assert(Array.isArray(value.stages)&&value.stages.length===EXPECTED_STAGE_COUNT&&value.stageCount===EXPECTED_STAGE_COUNT,'E_STAGE_DENOMINATOR');
  let denominator=0;
  for(const [stageIndex,stage] of value.stages.entries()){
    assert(stage.effectiveState==='CERTIFIED_DONE'&&stage.evaluationSha===value.evaluationSha&&stage.evaluationTreeSha===value.evaluationTreeSha,'E_STAGE_EVALUATION',String(stageIndex));
    assert(Array.isArray(stage.artifactBindings)&&stage.artifactBindings.length>0,'E_STAGE_ARTIFACTS',stage.stageId);
    for(const [artifactIndex,binding] of stage.artifactBindings.entries()){
      denominator+=1;hex(binding.sha256,64,`${stage.stageId}:${artifactIndex}`);
      let bytes;try{bytes=objectBytes(git,value.evaluationSha,binding.path);}catch{fail('E_ARTIFACT_MISSING',`${stage.stageId}:${artifactIndex}:${binding.path}`);}
      const actual=h(bytes);assert(actual===binding.sha256,'E_ARTIFACT_DIGEST_MISMATCH',`${stage.stageId}:${artifactIndex}:${binding.path}:${actual}`);
    }
  }
  assert(denominator===EXPECTED_ARTIFACT_BINDING_DENOMINATOR&&value.artifactBindingDenominator===denominator&&value.verifiedArtifactBindingCount===denominator,'E_ARTIFACT_DENOMINATOR',String(denominator));
  assert(value.missingArtifactBindingCount===0&&value.mismatchedArtifactBindingCount===0&&value.allDeclaredBindingsResolvedFromEvaluationGitObjects===true,'E_COMPLETENESS_CLAIM');
  assert(value.postEvaluationCarrierException?.policy==='NON_RECURSIVE_INDEPENDENT_PROOF_CARRIERS_OR_STRICTLY_NECESSARY_GOVERNANCE_APPROVAL_ONLY_NO_CERTIFIED_ARTIFACT_BINDING_MAY_POSTDATE_EVALUATION','E_CARRIER_EXCEPTION_POLICY');
  assert(JSON.stringify(value.postEvaluationCarrierException.allowedPaths)===JSON.stringify([...ALLOWED_POST_EVALUATION_CARRIERS]),'E_CARRIER_EXCEPTION_PATHS');
  const resolvedCandidate=gitText(git,['rev-parse',candidateSha]);
  try{git(['merge-base','--is-ancestor',value.evaluationSha,resolvedCandidate],{encoding:null});}catch{fail('E_EVALUATION_NOT_ANCESTOR');}
  const changed=gitText(git,['diff','--name-only',`${value.evaluationSha}..${resolvedCandidate}`]).split('\n').filter(Boolean).sort();
  const cycle2Exception=allowAuditCycle2Admission?verifyAuditCycle2PostEvaluationException({candidateSha:resolvedCandidate,git}):null;
  const allowedPaths=new Set([...ALLOWED_POST_EVALUATION_CARRIERS,...(cycle2Exception?.admittedPaths??[])]);
  for(const changedPath of changed)assert(allowedPaths.has(changedPath),'E_POST_EVALUATION_PATH',changedPath);
  const boundPaths=new Set(value.stages.flatMap((stage)=>stage.artifactBindings.map((binding)=>binding.path)));
  for(const allowed of ALLOWED_POST_EVALUATION_CARRIERS)assert(!boundPaths.has(allowed),'E_POST_EVALUATION_BOUND_ARTIFACT',allowed);
  assert(value.requiredOrUnexplainedSkips===0&&value.programDone===false&&value.mainProductGraphNodeStarted===false,'E_TERMINAL_SCOPE');
  return{schemaVersion:'POST_AUDIT_CERTIFICATION_SET_VERIFICATION_V1',status:'PASS',certificationSetDigest:fileDigest,evaluationSha:value.evaluationSha,evaluationTreeSha:value.evaluationTreeSha,stageCount:value.stageCount,artifactBindingDenominator:denominator,postEvaluationChangedPaths:changed,auditCycle2PostEvaluationException:cycle2Exception};
}

const ghRaw=(endpoint)=>execFileSync('gh',['api',endpoint],{encoding:null,maxBuffer:128*1024*1024});
function args(argv){const out={};for(let i=0;i<argv.length;i+=1){const item=argv[i];if(!item.startsWith('--'))continue;const key=item.slice(2);out[key]=argv[i+1]??true;if(argv[i+1]&&!argv[i+1].startsWith('--'))i+=1;}return out;}
if(import.meta.url===`file://${process.argv[1]}`){
  try{
    const options=args(process.argv.slice(2));
    if(options['verify-audit-cycle-terminal']){
      const runId=finiteId(options['remote-run'],'remote-run');
      const repository='KirPonomarev/writer-editor';
      const runEvidenceFile=rawJsonBytes(ghRaw(`repos/${repository}/actions/runs/${runId}`),'run');
      const artifactsResponse=JSON.parse(ghRaw(`repos/${repository}/actions/runs/${runId}/artifacts`));
      const matchingArtifacts=artifactsResponse.artifacts.filter((entry)=>entry.name==='r24-audit-cycle1-terminal-attestation');
      assert(matchingArtifacts.length===1,'E_EXACT_ARTIFACT_SELECTION',String(matchingArtifacts.length));
      const artifactEvidence=matchingArtifacts[0];
      const zipBytes=ghRaw(`repos/${repository}/actions/artifacts/${finiteId(artifactEvidence.id,'artifact.id')}/zip`);
      const untrustedMember=JSON.parse(inspectExactZip(zipBytes,'audit-cycle1-terminal-attestation.json'));
      const candidateRunId=finiteId(untrustedMember?.correctionDelivery?.candidateCiRunId,'candidateCiRunId');
      const postmergeRunId=finiteId(untrustedMember?.correctionDelivery?.exactPostmergeCiRunId,'postmergeCiRunId');
      const rulesetEvidenceFile=rawJsonBytes(ghRaw(`repos/${repository}/rulesets/12270444`),'ruleset');
      const candidateCiEvidenceFile=rawJsonBytes(ghRaw(`repos/${repository}/actions/runs/${candidateRunId}`),'candidateCi');
      const postmergeCiEvidenceFile=rawJsonBytes(ghRaw(`repos/${repository}/actions/runs/${postmergeRunId}`),'postmergeCi');
      const verified=verifyAuditCycleTerminalArtifact({zipBytes,runEvidenceFile,artifactEvidence,rulesetEvidenceFile,candidateCiEvidenceFile,postmergeCiEvidenceFile,authorityFile:readJsonFile('docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_OWNER_AMENDMENT_V15.json'),instanceFile:readJsonFile('docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_STAGE_INSTANCE_V16.json'),admissionFile:readJsonFile('docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_STAGE_ADMISSION_ATTESTATION_V16.json'),certificationFile:readJsonFile('docs/OPS/R24/CORRECTIVE/POST_AUDIT_CURRENT_CERTIFICATION_SET_V2.json'),beforeFile:readJsonFile('docs/OPS/R24/CORRECTIVE/AUDIT_CYCLE_1_PROTECTED_WIP_BEFORE_V1.json')});
      const carrier=createAuditCycleDurableCarrier({zipBytes,memberBytes:verified.memberBytes,runEvidenceFile,artifactEvidence,verification:verified.verification});
      assert(options['write-durable-carrier'],'E_OUTPUT');
      atomicCanonicalWrite(options['write-durable-carrier'],carrier);
      const carrierFile=readJsonFile(options['write-durable-carrier']);
      process.stdout.write(canonicalBytes({verification:verified.verification,durableCarrierValidation:verifyAuditCycleDurableCarrier(carrierFile),durableCarrierDigest:carrierFile.digest}));
    }
    else if(options['verify-audit-cycle2-terminal']){
      const runId=finiteId(options['remote-run'],'cycle2.remote-run');
      const repository='KirPonomarev/writer-editor';
      const runEvidenceFile=rawJsonBytes(ghRaw(`repos/${repository}/actions/runs/${runId}`),'cycle2.run');
      const artifactsResponse=JSON.parse(ghRaw(`repos/${repository}/actions/runs/${runId}/artifacts`));
      const matchingArtifacts=artifactsResponse.artifacts.filter((entry)=>entry.name==='r24-audit-cycle2-terminal-attestation');
      assert(matchingArtifacts.length===1,'E_CYCLE2_EXACT_ARTIFACT_SELECTION',String(matchingArtifacts.length));
      const artifactEvidence=matchingArtifacts[0];
      const zipBytes=ghRaw(`repos/${repository}/actions/artifacts/${finiteId(artifactEvidence.id,'cycle2.artifact.id')}/zip`);
      const untrustedMember=JSON.parse(inspectExactZip(zipBytes,'audit-cycle2-terminal-attestation.json'));
      const candidateRunId=finiteId(untrustedMember?.correctionDelivery?.candidateCiRunId,'cycle2.candidateCiRunId');
      const postmergeRunId=finiteId(untrustedMember?.correctionDelivery?.exactPostmergeCiRunId,'cycle2.postmergeCiRunId');
      const rulesetEvidenceFile=rawJsonBytes(ghRaw(`repos/${repository}/rulesets/12270444`),'cycle2.ruleset');
      const candidateCiEvidenceFile=rawJsonBytes(ghRaw(`repos/${repository}/actions/runs/${candidateRunId}`),'cycle2.candidateCi');
      const postmergeCiEvidenceFile=rawJsonBytes(ghRaw(`repos/${repository}/actions/runs/${postmergeRunId}`),'cycle2.postmergeCi');
      const verified=verifyAuditCycle2TerminalArtifact({zipBytes,runEvidenceFile,artifactEvidence,rulesetEvidenceFile,candidateCiEvidenceFile,postmergeCiEvidenceFile,authorityFile:readJsonFile('docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_OWNER_AMENDMENT_V16.json'),instanceFile:readJsonFile('docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_STAGE_INSTANCE_V17.json'),admissionFile:readJsonFile('docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_STAGE_ADMISSION_ATTESTATION_V17.json'),certificationFile:readJsonFile('docs/OPS/R24/CORRECTIVE/POST_AUDIT_CURRENT_CERTIFICATION_SET_V2.json'),beforeFile:readJsonFile('docs/OPS/R24/CORRECTIVE/AUDIT_CYCLE_2_PROTECTED_WIP_BEFORE_V1.json'),predecessorReleaseFile:readJsonFile('docs/OPS/R24/CORRECTIVE/AUDIT_CYCLE_1_CORRECTIONS_LEASE_RELEASE_V1.json'),predecessorReceiptFile:readJsonFile('docs/OPS/R24/CORRECTIVE/AUDIT_CYCLE_1_CORRECTIONS_TERMINAL_RECEIPT_V1.json'),predecessorDurableFile:readJsonFile('docs/OPS/R24/CORRECTIVE/AUDIT_CYCLE_1_TERMINAL_ATTESTATION_DURABLE_CARRIER_V1.json')});
      const carrier=createAuditCycle2DurableCarrier({zipBytes,memberBytes:verified.memberBytes,runEvidenceFile,artifactEvidence,verification:verified.verification});
      assert(options['write-durable-carrier'],'E_CYCLE2_OUTPUT');
      atomicCanonicalWrite(options['write-durable-carrier'],carrier);
      const carrierFile=readJsonFile(options['write-durable-carrier']);
      process.stdout.write(canonicalBytes({verification:verified.verification,durableCarrierValidation:verifyAuditCycle2DurableCarrier(carrierFile,{expectedCarrierDigest:carrierFile.digest}),durableCarrierDigest:carrierFile.digest}));
    }
    else if(options['verify-audit-cycle-durable']){const expectedDigest=options['expected-carrier-digest']??AUDIT_CYCLE_1_DURABLE_EXPECTATION.carrierDigest;hex(expectedDigest,64,'expected-carrier-digest');assert(expectedDigest===AUDIT_CYCLE_1_DURABLE_EXPECTATION.carrierDigest,'E_DURABLE_EXPECTED_DIGEST_PIN');const file=readJsonFile(options['verify-audit-cycle-durable']);process.stdout.write(canonicalBytes(verifyAuditCycleDurableCarrier(file,{...AUDIT_CYCLE_1_DURABLE_EXPECTATION,carrierDigest:expectedDigest})));}
    else if(options['verify-audit-cycle2-durable']){const expectedDigest=options['expected-carrier-digest'];hex(expectedDigest,64,'cycle2.expected-carrier-digest');const file=readJsonFile(options['verify-audit-cycle2-durable']);process.stdout.write(canonicalBytes(verifyAuditCycle2DurableCarrier(file,{expectedCarrierDigest:expectedDigest})));}
    else if(options.generate){const value=generateCertificationSet({sourceFile:options.source,evaluationSha:options['evaluation-sha'],evaluationTreeSha:options['evaluation-tree']});assert(options.output,'E_OUTPUT');fs.writeFileSync(options.output,`${JSON.stringify(value,null,2)}\n`);process.stdout.write(`${JSON.stringify({status:'GENERATED',output:path.normalize(options.output),evaluationSha:value.evaluationSha,artifactBindingDenominator:value.artifactBindingDenominator})}\n`);}
    else if(options.verify){const file=readJsonFile(options.verify);process.stdout.write(`${JSON.stringify(verifyCertificationSet({value:file.value,fileDigest:file.digest,candidateSha:options['candidate-sha']??'HEAD',allowAuditCycle2Admission:options['audit-cycle2-admission']===true}))}\n`);}
    else fail('E_MODE');
  }catch(error){process.stderr.write(`${JSON.stringify({status:'FAIL',code:error.code??'E_UNTYPED',message:error.message})}\n`);process.exitCode=1;}
}
