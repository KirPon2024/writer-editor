import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { verifyPostAuditCorrections } from '../../scripts/ops/r24/corrective/post-audit-corrections.mjs';
import { EXPECTED, verifyToolchain } from '../../scripts/ops/r24/corrective/post-audit-toolchain.mjs';
import { REQUIRED_DEPENDENCIES, verifyDependencyResults, verifyRuleset, verifyWorkflowText } from '../../scripts/ops/r24/corrective/post-audit-merge-gate.mjs';

const CLOSURE_VERIFIER='scripts/ops/r24/corrective/stage-admission-verifier-anchor-v2.mjs';
const CLOSURE_VERIFIER_DIGEST='d7837ff49cb9df196303384111336d9907cbf66147ba23bf8b687404666e5b59';
const CLOSURE_AUTHORITY='docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_OWNER_AMENDMENT_V14.json';
const CLOSURE_INSTANCE='docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_STAGE_INSTANCE_V15.json';
const CLOSURE_ADMISSION='docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_STAGE_ADMISSION_ATTESTATION_V15.json';
const CLOSURE_AUTHORITY_DIGEST='fc7becea30f9b5d6efb86328baeba0d7e41d58922d6120e840c13a15088e091b';
const FINAL_LEASE='docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_LEASE_RELEASE_V1.json';
const FINAL_MATRIX='docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_FINAL_ACCEPTANCE_MATRIX_V1.json';
const FINAL_STATE='docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_FINAL_EFFECTIVE_STATE_V1.json';
const FINAL_REGISTRY='docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_FINAL_STAGE_REGISTRY_V1.json';
const FINAL_RECEIPT='docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_FINAL_TERMINAL_RECEIPT_V1.json';
const sha256=(bytes)=>crypto.createHash('sha256').update(bytes).digest('hex');
const readJson=(file)=>JSON.parse(fs.readFileSync(file));
function verifyFinalTransition({lease=readJson(FINAL_LEASE),matrix=readJson(FINAL_MATRIX),state=readJson(FINAL_STATE),registry=readJson(FINAL_REGISTRY),receipt=readJson(FINAL_RECEIPT)}={}){
  assert.deepEqual(lease.lease,{fencingCounter:56,transition:'ACTIVE_WIP_1_TO_RELEASED_WIP_0',status:'RELEASED',wip:0,predecessorReleaseDigest:'583e4209f200cb4dc342f8d05f59b808243e960669d8a0d225586b0e7ff4dd6f',releasedAdmissionDigest:'175953e378ef72d319ea9324bcf6e5ebebfe1c33f59042979d289bb6a9732d39',disposition:'RELEASED_AFTER_DURABLE_CARRIER_PROTECTED_MERGE_AND_FRESH_CLOSURE_SUCCESSOR_PROTECTED_MERGE_EXACT_POSTMERGE_CI'});
  assert.equal(lease.closureSuccessorEvidence.candidateCiStatus,'SUCCESS');
  assert.equal(lease.closureSuccessorEvidence.exactPostmergeCiStatus,'SUCCESS');
  assert.equal(lease.liveWorkObservation.status,'NO_LIVE_WORK');
  assert.equal(matrix.evaluationStatus,'CERTIFIED_DONE');
  assert.equal(matrix.rows.length,matrix.rowCount);
  assert.equal(matrix.rows.every((row)=>row.status==='PASS'),true);
  assert.equal(matrix.passedRowCount,matrix.rowCount);
  assert.equal(matrix.zeroPendingRows,true);
  assert.equal(matrix.bindings.leaseReleaseDigest,sha256(fs.readFileSync(FINAL_LEASE)));
  assert.equal(state.status,'CERTIFIED_DONE');
  assert.deepEqual(state.lease,{fencingCounter:56,status:'RELEASED',wip:0,releaseDigest:sha256(fs.readFileSync(FINAL_LEASE))});
  assert.equal(state.finalAcceptanceMatrixDigest,sha256(fs.readFileSync(FINAL_MATRIX)));
  assert.equal(registry.stages.length,1);
  assert.equal(registry.stages[0].status,'CERTIFIED_DONE_RELEASED');
  assert.equal(registry.stages[0].wip,0);
  assert.equal(registry.stages[0].finalEffectiveStateDigest,sha256(fs.readFileSync(FINAL_STATE)));
  assert.equal(receipt.schemaVersion,'POST_AUDIT_CORRECTIONS_TERMINAL_RECEIPT_V1');
  assert.equal(receipt.status,'CERTIFIED_DONE');
  assert.equal(receipt.evaluationSha,'af0bfb704c13b0195c12b0144415f2e769f99752');
  assert.equal(receipt.evaluationTreeSha,'d3e2232ec01af860794de90f81f2e185cdc3fcfe');
  assert.equal(receipt.finalCarriers.leaseReleaseDigest,sha256(fs.readFileSync(FINAL_LEASE)));
  assert.equal(receipt.finalCarriers.acceptanceMatrixDigest,sha256(fs.readFileSync(FINAL_MATRIX)));
  assert.equal(receipt.finalCarriers.effectiveStateDigest,sha256(fs.readFileSync(FINAL_STATE)));
  assert.equal(receipt.finalCarriers.stageRegistryDigest,sha256(fs.readFileSync(FINAL_REGISTRY)));
  assert.deepEqual(receipt.acceptance,{rowCount:18,passedRowCount:18,pendingRowCount:0,status:'PASS'});
  assert.deepEqual(receipt.effectiveState,{status:'CERTIFIED_DONE',leaseStatus:'RELEASED',fencingCounter:56,wip:0});
  assert.equal(receipt.worktreeProof.protectedUnrelatedBeforeEntriesSha256,receipt.worktreeProof.protectedUnrelatedAfterEntriesSha256);
  assert.equal(receipt.worktreeProof.protectedUnrelatedWipUntouched,true);
  assert.equal(receipt.liveWork.status,'NONE');
  for(const value of [lease,matrix,state,registry,receipt]){assert.equal(value.programDone,false);assert.equal(value.mainProductGraphNodeStarted,false);}
  return {status:'PASS',receiptDigest:sha256(fs.readFileSync(FINAL_RECEIPT))};
}
function closureBaseFixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'post-audit-terminal-closure-base-'));
  const instance=JSON.parse(fs.readFileSync(CLOSURE_INSTANCE));
  const existing=[...instance.operations.readPaths,...instance.operations.modifyPaths,...instance.operations.deletePaths,...instance.fixedBindings.map(x=>x.path)];
  for(const relative of new Set(existing)){const target=path.join(root,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(relative,target);}
  for(const relative of instance.operations.createPaths)fs.mkdirSync(path.dirname(path.join(root,relative)),{recursive:true});
  return root;
}
function verifyClosureAdmission({instance=CLOSURE_INSTANCE,admission=CLOSURE_ADMISSION}={}){
  return spawnSync(process.execPath,[CLOSURE_VERIFIER,'--repo-root',closureBaseFixture(),'--authority',CLOSURE_AUTHORITY,'--stage-instance',instance,'--stage-admission',admission,'--expected-verifier-digest',CLOSURE_VERIFIER_DIGEST,'--expected-authority-digest',CLOSURE_AUTHORITY_DIGEST],{encoding:'utf8'});
}

test('literal normative R24 program preserves fixed identities and 33-stage denominator',()=>{const p=JSON.parse(fs.readFileSync('docs/OPS/R24/CORRECTIVE/R24_CORRECTIVE_PROGRAM_V1_1.json'));assert.equal(p.schemaVersion,'R24_CORRECTIVE_PROGRAM_V1_1');assert.equal(p.stageRegistry.stageOrder.length,33);assert.equal(p.fixedBindings.programTemplateDigest,'6c833c964318da3e61e1743365f8763206be838647b5222c187b3bda8d1c6b9a');assert.equal(p.fixedBindings.stageRegistryDigest,'c8af046b5918f43a50af66886b0b5c9d2e22ea6501240d4b239101d8836ced1a');assert.equal(p.fixedBindings.trustModelDigest,'4f6e4b3a191e0302ea44646659e8c2f71121af7d808cc0ee768269b4e156840d');assert.equal(p.ownerRatification.canonicalByteManifest.entries.length,7);assert.equal(p.invariants.rawCorrectiveHistoryImmutable,true);});
test('exact certification vocabulary and current 33-stage replay are compiled',()=>{const c=JSON.parse(fs.readFileSync('docs/OPS/R24/CORRECTIVE/POST_AUDIT_CURRENT_CERTIFICATION_SET_V1.json'));assert.deepEqual(c.effectiveStateEnum,['CERTIFIED_DONE','DONE_UNCERTIFIED','CERTIFICATION_PENDING','CERTIFICATION_INVALIDATED','INELIGIBLE_OPTIONAL','BLOCKED_TYPED']);assert.equal(c.stages.length,33);assert.equal(c.stages.every(x=>x.effectiveState==='CERTIFIED_DONE'),true);assert.equal(c.auditSuccessors[0].terminalRunId,33291717577);assert.equal(c.mainProductSuccessors.at(-1).terminalRunId,33315428854);assert.equal(c.postAuditCorrections.effectiveState,'CERTIFICATION_PENDING');});
test('coherent Node npm Electron engine-strict contract is exact',()=>{const result=verifyToolchain();assert.equal(result.node,EXPECTED.node);assert.equal(result.npm,EXPECTED.npm);assert.equal(result.electron,EXPECTED.electron);assert.equal(result.packageManager,'npm@10.9.0');});
test('renderer build policy is local-only and commits deterministic runtime artifacts',()=>{const build=fs.readFileSync('scripts/build-renderer.mjs','utf8');assert.equal(build.includes('LOCAL_NODE_MODULES_REQUIRED'),true);assert.equal(build.includes('preferredSiblingRoots'),false);assert.equal(build.includes("target: ['node22']"),true);const contract=JSON.parse(fs.readFileSync('docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_CONTRACT_V1.json'));assert.equal(contract.rendererBuild.buildToCleanTreeRequired,true);assert.equal(contract.rendererBuild.editorBundleSha256,EXPECTED.editorBundleSha256);});
test('literal inventory script exists and invokes canonical checker',()=>{const p=JSON.parse(fs.readFileSync('package.json'));assert.equal(p.packageManager,'npm@10.9.0');assert.equal(p.scripts['r24:test-inventory'],'node scripts/ops/r24/test-inventory.mjs --check docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json');});
test('merge-gate topology requires the complete declared dependency set',()=>{const workflow=fs.readFileSync('.github/workflows/oss-policy.yml','utf8');const result=verifyWorkflowText(workflow);assert.deepEqual(result.dependencies,[...REQUIRED_DEPENDENCIES]);for(const token of ['actual-renderer-build-rtk:','privacy-negative:','static-security-sast:','merge-gate:','if: ${{ always() }}'])assert.equal(workflow.includes(token),true,token);});
test('merge-gate accepts only exact all-success results',()=>{const success=Object.fromEntries(REQUIRED_DEPENDENCIES.map(k=>[k,'success']));assert.equal(verifyDependencyResults(success).status,'PASS');for(const state of ['failure','cancelled','skipped']){const mutant={...success,[REQUIRED_DEPENDENCIES[0]]:state};assert.throws(()=>verifyDependencyResults(mutant),/E_DEPENDENCY_NOT_SUCCESS/);}assert.throws(()=>verifyDependencyResults({...success,unexpected:'success'}),/E_DEPENDENCY_SET/);});
test('live ruleset oracle accepts only active merge-gate without bypass',()=>{const good={id:12270444,name:'protect-main',enforcement:'active',bypass_actors:[],rules:[{type:'required_status_checks',parameters:{required_status_checks:[{context:'merge-gate'}]}}]};assert.equal(verifyRuleset(good).status,'PASS');assert.throws(()=>verifyRuleset({...good,rules:[{type:'required_status_checks',parameters:{required_status_checks:[{context:'oss-policy'}]}}]}),/E_RULESET_REQUIRED_CONTEXTS/);assert.throws(()=>verifyRuleset({...good,bypass_actors:[{}]}),/E_RULESET_BYPASS/);});
test('required CI covers three platforms real build RTK SAST and privacy negative',()=>{const c1a=fs.readFileSync('.github/workflows/r24-c1a-hermetic.yml','utf8'),parity=fs.readFileSync('.github/workflows/x1-runtime-parity.yml','utf8'),root=fs.readFileSync('.github/workflows/oss-policy.yml','utf8');for(const os of ['ubuntu-latest','macos-latest','windows-latest']){assert.equal(c1a.includes(os),true);assert.equal(parity.includes(os),true);}for(const token of ['npm ci --engine-strict','npm run build:renderer','git diff --exit-code -- src/renderer/editor.bundle.js src/preload.bundle.cjs','npm run test:rtk','semgrep==1.175.0','b3c08-support-bundle-privacy.contract.test.js'])assert.equal((c1a+'\n'+root).includes(token),true,token);});
test('Windows c1a launches npm through an executable and fails closed on invalid launch authority',()=>{const source=fs.readFileSync('scripts/run-tests.js','utf8');for(const token of ["process.env.npm_execpath","command = process.execPath","path.isAbsolute(npmExecPath)","E_NPM_EXEC_PATH_INVALID=1","process.env.ComSpec","E_WINDOWS_COMMAND_SHELL_INVALID=1","E_PERF_BASELINE_SPAWN="])assert.equal(source.includes(token),true,token);assert.equal(source.includes("process.platform === 'win32' ? 'npm.cmd' : 'npm'"),false);});
test('direct closure authority and durable carrier policy are mandatory',()=>{const trust=JSON.parse(fs.readFileSync('docs/OPS/R24/CORRECTIVE/POST_AUDIT_TERMINAL_TRUST_MODEL_V1.json'));assert.equal(trust.verification.downloadedRemoteArchiveRequired,true);assert.equal(trust.verification.localSelfIssuedReceiptAccepted,false);assert.equal(trust.predecessors.wp400Closure.stageInstanceDigest,'8102a6a2b36a033ef96921774a4c98f1f48f99a876d6e9dc843d416acfdbbcc6');assert.equal(trust.predecessors.wp400Closure.effectiveStateDigest,'1e23d7eae55b658a68f93893c11d01069c3f04427c0a6ece9214bb6e3e2bff0d');assert.equal(trust.retention.durableCanonicalCarrierRequired,true);});
test('whole static correction contract passes and verifies a durable carrier whenever present',()=>{const result=verifyPostAuditCorrections();assert.equal(result.status,'PASS');assert.equal(result.stageCount,33);assert.equal(Boolean(result.durableCarrier),fs.existsSync('docs/OPS/R24/CORRECTIVE/POST_AUDIT_TERMINAL_ATTESTATION_DURABLE_CARRIER_V1.json'));assert.equal(result.programDone,false);});
test('exact-head terminal closure CI-correction successor is independently admitted at lease 56 WIP one',()=>{const result=verifyClosureAdmission();assert.equal(result.status,0,result.stderr);const parsed=JSON.parse(result.stdout);assert.equal(parsed.status,'PASS');assert.equal(parsed.authorityDigest,CLOSURE_AUTHORITY_DIGEST);assert.equal(parsed.stageInstanceDigest,'8256106036a2119ec4683fcaeb30ecf6611859ee8cc1a5cd48ed1922f327a2c0');assert.equal(parsed.writeSetDigest,'1e58bd7772e9dcb28581dd52c086383d0a806269eadce066e3333e99ce61dfba');const admission=JSON.parse(fs.readFileSync(CLOSURE_ADMISSION));assert.deepEqual(admission.lease,{fencingCounter:56,status:'ACTIVE',wip:1,predecessorReleaseDigest:'583e4209f200cb4dc342f8d05f59b808243e960669d8a0d225586b0e7ff4dd6f'});});
test('closure admission fails closed on coordinated command-scope mutation',()=>{const value=JSON.parse(fs.readFileSync(CLOSURE_INSTANCE));value.commands=[...value.commands,'self-authorized command'];const dir=fs.mkdtempSync(path.join(os.tmpdir(),'post-audit-terminal-closure-mutant-')),file=path.join(dir,'instance.json');fs.writeFileSync(file,`${JSON.stringify(value,null,2)}\n`);const result=verifyClosureAdmission({instance:file});assert.notEqual(result.status,0);assert.match(result.stderr,/E_COMMAND_SCOPE/);});
test('final append-only carriers close every row and release lease 56 at WIP zero',()=>{const result=verifyFinalTransition();assert.equal(result.status,'PASS');assert.equal(result.receiptDigest,'9d9baa275ccebfe73c78810f80366b5eb7bfb466f055b6db8f8516ff4886c144');assert.equal(sha256(fs.readFileSync('docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_TERMINAL_RECEIPT_V1.json')),'4a6be94c500a36f732f6a9d82f82bd1eff5813e4ffb511d67e0776ad3f4f8379');});
test('final transition rejects a pending row active lease nonzero WIP or PROGRAM_DONE claim',()=>{const matrix=readJson(FINAL_MATRIX);matrix.rows[0].status='CI_PENDING';assert.throws(()=>verifyFinalTransition({matrix}),/true/);const lease=readJson(FINAL_LEASE);lease.lease.status='ACTIVE';lease.lease.wip=1;assert.throws(()=>verifyFinalTransition({lease}));const receipt=readJson(FINAL_RECEIPT);receipt.programDone=true;assert.throws(()=>verifyFinalTransition({receipt}),/false/);});
