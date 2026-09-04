import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  verifyWp603MainProductPostEvaluationException,
  verifyWp603RecoveryAdmissionChain
} from '../corrective/post-audit-certification-set.mjs';

const REPO_ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
const POST_AUDIT_ADMISSION='docs/OPS/R24/CORRECTIVE/WP603_PACKAGED_RECOVERY_POST_AUDIT_BINDING_STAGE_ADMISSION_ATTESTATION_V1.json';
const CURRENT_APPROVAL='docs/OPS/R24/CORRECTIVE/WP603_GOVERNANCE_CHANGE_APPROVALS_PACKAGED_RECOVERY_CWD_INVARIANCE_V1.json';
const HISTORICAL_APPROVAL='docs/OPS/R24/CORRECTIVE/WP603_GOVERNANCE_CHANGE_APPROVALS_V1.json';
const realGit=(args,options={})=>execFileSync('git',args,{cwd:REPO_ROOT,encoding:options.encoding??null,maxBuffer:64*1024*1024});

test('WP603 recovery post-audit accepts the exact append-only admission union',()=>{
  const result=verifyWp603MainProductPostEvaluationException({candidateSha:'HEAD',git:realGit});
  assert.equal(result.status,'PASS');
  assert.equal(result.admissionDenominator,13);
  assert.equal(result.admittedPathDenominator,120);
  assert.equal(result.changedPathDenominator,119);
  assert.deepEqual(result.unchangedAdmittedPaths,['package.json']);
  assert.equal(result.recovery.status,'PASS');
  assert.equal(result.recovery.recoveryStageDenominator,12);
  const workflow=String(realGit(['show','HEAD:.github/workflows/oss-policy.yml'],{encoding:'utf8'}));
  assert.equal(workflow.split(CURRENT_APPROVAL).length-1,3);
  assert.equal(workflow.includes(HISTORICAL_APPROVAL),false);
});

test('WP603 recovery post-audit rejects a tampered admission carrier',()=>{
  const tamperedGit=(args,options={})=>{
    const output=realGit(args,options);
    if(args[0]==='show'&&args[1]?.endsWith(`:${POST_AUDIT_ADMISSION}`)){
      const tampered=String(output).replace('"ADMITTED"','"ADM1TTED"');
      return options.encoding==='utf8'?tampered:Buffer.from(tampered);
    }
    return output;
  };
  assert.throws(
    ()=>verifyWp603RecoveryAdmissionChain({candidateSha:'HEAD',git:tamperedGit}),
    /E_WP603_RECOVERY_ADMISSION_CARRIER_DIGEST:6/
  );
});

test('WP603 recovery post-audit rejects an extra unadmitted changed path',()=>{
  const extraPathGit=(args,options={})=>{
    const output=realGit(args,options);
    if(args[0]==='diff'&&args[1]==='--name-only'&&args[2]?.startsWith('39897a04b880391ee9224269a2691f52e9e8018f..')){
      const text=String(output).trimEnd()+'\ndocs/OPS/R24/CORRECTIVE/WP603_UNADMITTED_PATH.json\n';
      return options.encoding==='utf8'?text:Buffer.from(text);
    }
    return output;
  };
  assert.throws(
    ()=>verifyWp603MainProductPostEvaluationException({candidateSha:'HEAD',git:extraPathGit}),
    /E_WP603_EXACT_ADMITTED_DELTA:120:119/
  );
});
