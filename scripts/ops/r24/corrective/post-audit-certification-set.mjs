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
  assert(member.liveRuleset.rulesetId===12270444&&member.liveRuleset.returnedBytesDigest===rulesetEvidenceFile.digest&&member.liveRuleset.returnedByteLength===rulesetEvidenceFile.bytes.length&&member.liveRuleset.normalizedRulesetDigest===rulesetResult.normalizedRulesetDigest,'E_LIVE_RULESET_BINDING');
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
  return{verification:{schemaVersion:'AUDIT_CYCLE_1_TERMINAL_ATTESTATION_VALIDATION_V1',status:'VERIFIED',runId:finiteId(run.id,'run.id'),runAttempt:finiteId(run.run_attempt,'runAttempt'),artifactId:finiteId(artifactEvidence.id,'artifact.id'),archiveDigest:`sha256:${h(zipBytes)}`,attestationDigest:h(memberBytes),evaluationSha:delivery.evaluationSha,evaluationTreeSha:delivery.evaluationTreeSha,implementationCandidateSha:delivery.implementationCandidateSha,certificationSetDigest:certificationFile.digest,rulesetReturnedBytesDigest:rulesetEvidenceFile.digest,candidateCiBytesDigest:candidateCiEvidenceFile.digest,postmergeCiBytesDigest:postmergeCiEvidenceFile.digest,programDone:false},memberBytes,member};
}

export function createAuditCycleDurableCarrier({zipBytes,memberBytes,runEvidenceFile,artifactEvidence,verification}){
  return{schemaVersion:'AUDIT_CYCLE_1_TERMINAL_ATTESTATION_DURABLE_CARRIER_V1',status:'VERIFIED_DURABLE_CANONICAL_CARRIER',provenance:{provider:'GITHUB_ACTIONS',repository:runEvidenceFile.value.repository.full_name,workflowPath:runEvidenceFile.value.path,runId:finiteId(runEvidenceFile.value.id,'run.id'),runAttempt:finiteId(runEvidenceFile.value.run_attempt,'runAttempt'),headSha:runEvidenceFile.value.head_sha,artifactId:finiteId(artifactEvidence.id,'artifact.id'),artifactName:artifactEvidence.name},archive:{sha256:h(zipBytes),sizeBytes:zipBytes.length},member:{path:'audit-cycle1-terminal-attestation.json',sha256:h(memberBytes),sizeBytes:memberBytes.length,canonicalBase64:memberBytes.toString('base64')},verification,artifactExpiryIndependent:true,programDone:false};
}

export function verifyAuditCycleDurableCarrier({value,fileDigest}){
  assert(value?.schemaVersion==='AUDIT_CYCLE_1_TERMINAL_ATTESTATION_DURABLE_CARRIER_V1'&&value.status==='VERIFIED_DURABLE_CANONICAL_CARRIER','E_DURABLE_SCHEMA');
  const bytes=Buffer.from(value.member.canonicalBase64,'base64');
  assert(bytes.length===value.member.sizeBytes&&h(bytes)===value.member.sha256&&bytes.equals(canonicalBytes(JSON.parse(bytes))),'E_DURABLE_MEMBER');
  assert(value.provenance.runId===value.verification.runId&&value.provenance.runAttempt===value.verification.runAttempt&&value.provenance.artifactId===value.verification.artifactId&&value.provenance.headSha===value.verification.evaluationSha,'E_DURABLE_PROVENANCE');
  assert(value.verification.attestationDigest===value.member.sha256&&value.verification.archiveDigest===`sha256:${value.archive.sha256}`&&value.artifactExpiryIndependent===true&&value.programDone===false,'E_DURABLE_POLICY');
  return{schemaVersion:'AUDIT_CYCLE_1_DURABLE_CARRIER_VALIDATION_V1',status:'VERIFIED',carrierDigest:fileDigest,attestationDigest:value.member.sha256,runId:value.provenance.runId,artifactId:value.provenance.artifactId,programDone:false};
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

export function verifyCertificationSet({value,fileDigest,candidateSha='HEAD',git=defaultGit}){
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
  for(const changedPath of changed)assert(ALLOWED_POST_EVALUATION_CARRIERS.includes(changedPath),'E_POST_EVALUATION_PATH',changedPath);
  const boundPaths=new Set(value.stages.flatMap((stage)=>stage.artifactBindings.map((binding)=>binding.path)));
  for(const allowed of ALLOWED_POST_EVALUATION_CARRIERS)assert(!boundPaths.has(allowed),'E_POST_EVALUATION_BOUND_ARTIFACT',allowed);
  assert(value.requiredOrUnexplainedSkips===0&&value.programDone===false&&value.mainProductGraphNodeStarted===false,'E_TERMINAL_SCOPE');
  return{schemaVersion:'POST_AUDIT_CERTIFICATION_SET_VERIFICATION_V1',status:'PASS',certificationSetDigest:fileDigest,evaluationSha:value.evaluationSha,evaluationTreeSha:value.evaluationTreeSha,stageCount:value.stageCount,artifactBindingDenominator:denominator,postEvaluationChangedPaths:changed};
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
    else if(options['verify-audit-cycle-durable']){const file=readJsonFile(options['verify-audit-cycle-durable']);process.stdout.write(canonicalBytes(verifyAuditCycleDurableCarrier(file)));}
    else if(options.generate){const value=generateCertificationSet({sourceFile:options.source,evaluationSha:options['evaluation-sha'],evaluationTreeSha:options['evaluation-tree']});assert(options.output,'E_OUTPUT');fs.writeFileSync(options.output,`${JSON.stringify(value,null,2)}\n`);process.stdout.write(`${JSON.stringify({status:'GENERATED',output:path.normalize(options.output),evaluationSha:value.evaluationSha,artifactBindingDenominator:value.artifactBindingDenominator})}\n`);}
    else if(options.verify){const file=readJsonFile(options.verify);process.stdout.write(`${JSON.stringify(verifyCertificationSet({value:file.value,fileDigest:file.digest,candidateSha:options['candidate-sha']??'HEAD'}))}\n`);}
    else fail('E_MODE');
  }catch(error){process.stderr.write(`${JSON.stringify({status:'FAIL',code:error.code??'E_UNTYPED',message:error.message})}\n`);process.exitCode=1;}
}
