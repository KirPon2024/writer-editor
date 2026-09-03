import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { HISTORICAL_INVENTORY_CLAIM_PINS_V1 as PINS, verifyHistoricalInventoryClaim, lintDocsClaims } from '../../scripts/ops/r24/docs-claim-lint.mjs';
import { WP601_HISTORICAL_INVENTORY_ADMISSION_EXPECTATION as E, verifyWp601HistoricalInventoryPostEvaluationException } from '../../scripts/ops/r24/corrective/post-audit-certification-set.mjs';
import { WP601_HISTORICAL_INVENTORY_ANCHOR_REPAIR_ADMISSION_EXPECTATION as REPAIR, verifyWp601HistoricalInventoryAnchorRepairPostEvaluationException } from '../../scripts/ops/r24/corrective/post-audit-certification-set.mjs';
const inventory='docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json',root=process.cwd();
const realGit=(rootDir,args)=>execFileSync('git',args,{cwd:rootDir,encoding:null});
test('WP601 anchor repair preserves the original digest mutant and rejects incomplete or drifted nine-path successors',()=>{
  const source=fs.readFileSync('scripts/ops/r24/docs-claim-lint.mjs','utf8');
  const anchor="if (actual !== binding.sha256) {\n      failures.push(`E_CLAIM_BINDING_DIGEST_MISMATCH:${relativePath}`);\n      continue;\n    }";
  assert.equal(source.split(anchor).length-1,1);
  assert(source.indexOf('const historical = verifyHistoricalInventoryClaim')<source.indexOf(anchor));
  const repairInstance=JSON.parse(fs.readFileSync(REPAIR.instancePath));
  const paths=[...repairInstance.operations.modifyPaths,...repairInstance.operations.createPaths].sort();
  const candidate='f601f601f601f601f601f601f601f601f601f601',tree='a601a601a601a601a601a601a601a601a601a601';
  const fake=({delta=paths,missing=null,drift=null,ancestor=true}={})=>(args,{encoding=null}={})=>{
    let result;
    if(args[0]==='rev-parse')result=Buffer.from(args[1]==='HEAD'?candidate:args[1]===REPAIR.baseSha+'^{tree}'?REPAIR.baseTree:args[1]===candidate+'^{tree}'?tree:args[1]);
    else if(args[0]==='merge-base'){if(!ancestor)throw Error('NOT_ANCESTOR');result=Buffer.alloc(0);}
    else if(args[0]==='diff')result=Buffer.from(delta.join('\n'));
    else if(args[0]==='show'){
      const split=args[1].indexOf(':'),sha=args[1].slice(0,split),file=args[1].slice(split+1);
      if(file===missing)throw Error('MISSING');
      result=sha===REPAIR.baseSha?realGit(root,args):fs.readFileSync(file);
      if(file===drift)result=Buffer.concat([result,Buffer.from('\n')]);
    }else throw Error('UNEXPECTED_GIT');
    return encoding==='utf8'?result.toString():result;
  };
  const result=verifyWp601HistoricalInventoryAnchorRepairPostEvaluationException({git:fake()});
  assert.equal(result.status,'PASS');assert.equal(result.admittedPathDenominator,9);assert.equal(result.successorDigest,REPAIR.successorDigest);
  assert.equal(result.sourcePlanRoles.externalSourcePlanDigest,'1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a');
  assert.equal(result.sourcePlanRoles.compiledProgramFileDigest,'da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a');
  for(const delta of [paths.slice(1),[...paths,'src/main.js'].sort(),[...paths,paths[0]].sort()])assert.throws(()=>verifyWp601HistoricalInventoryAnchorRepairPostEvaluationException({git:fake({delta})}),/E_WP601_ANCHOR_REPAIR_EXACT_ADMITTED_DELTA/);
  for(const missing of repairInstance.operations.createPaths)assert.throws(()=>verifyWp601HistoricalInventoryAnchorRepairPostEvaluationException({git:fake({missing})}));
  for(const drift of [REPAIR.authorityPath,REPAIR.instancePath,REPAIR.admissionPath,REPAIR.successorPath,E.successorPath,'scripts/ops/r24/docs-claim-lint.mjs'])assert.throws(()=>verifyWp601HistoricalInventoryAnchorRepairPostEvaluationException({git:fake({drift})}));
  assert.throws(()=>verifyWp601HistoricalInventoryAnchorRepairPostEvaluationException({git:fake({ancestor:false})}),/E_WP601_ANCHOR_REPAIR_BASE_NOT_ANCESTOR/);
});
function inputs(pin){const stampBytes=fs.readFileSync(`docs/OPS/R24/EVIDENCE/${pin.stampId}.json`),stamp=JSON.parse(stampBytes);return{rootDir:root,stamp,stampBytes,binding:stamp.claimBindings.find(b=>b.filePath===inventory)};}
const instance=JSON.parse(fs.readFileSync(E.instancePath)),admitted=[...instance.operations.modifyPaths,...instance.operations.createPaths].sort();
function candidateGit({paths=admitted,missing=null,drift=null,ancestor=true}={}){
  const candidate='f601f601f601f601f601f601f601f601f601f601',tree='a601a601a601a601a601a601a601a601a601a601';
  return(args,{encoding=null}={})=>{
    let result;
    if(args[0]==='rev-parse')result=Buffer.from(args[1]==='HEAD'?candidate:args[1]===E.baseSha+'^{tree}'?E.baseTree:args[1]===candidate+'^{tree}'?tree:args[1]);
    else if(args[0]==='merge-base'){if(!ancestor)throw Error('NOT_ANCESTOR');result=Buffer.alloc(0);}
    else if(args[0]==='diff')result=Buffer.from(paths.join('\n'));
    else if(args[0]==='show'){
      const split=args[1].indexOf(':'),sha=args[1].slice(0,split),file=args[1].slice(split+1);
      if(file===missing)throw Error('MISSING');
      // This predecessor oracle certifies its immutable introduction tree,
      // never the later anchor-repair worktree bytes used by this test file.
      result=realGit(root,['show',(sha===E.baseSha?E.baseSha:'894eeb0411f1d8897c5274889fe3bfdceb2c2528')+':'+file]);
      if(file===drift)result=Buffer.concat([result,Buffer.from('\n')]);
    }else throw Error('UNEXPECTED_GIT');
    return encoding==='utf8'?result.toString():result;
  };
}
test('WP601 historical inventory oracle resolves both complete pinned stamp and target Git objects without current coverage',()=>{
  assert.equal(PINS.length,2);
  for(const pin of PINS){const result=verifyHistoricalInventoryClaim(inputs(pin));assert.equal(result.status,'VERIFIED_HISTORICAL_BYTES');assert.equal(result.evaluationSha,pin.evaluationSha);assert.equal(result.targetSha256,pin.targetSha256);assert.equal(result.currentFileCoverage,false);}
  const admittedResult=verifyWp601HistoricalInventoryPostEvaluationException({git:candidateGit()});
  assert.equal(admittedResult.status,'PASS');assert.equal(admittedResult.admittedPathDenominator,10);assert.equal(admittedResult.successorDigest,E.successorDigest);
  for(const paths of [admitted.slice(1),[...admitted,'src/main.js'].sort(),[...admitted,admitted[0]].sort()])assert.throws(()=>verifyWp601HistoricalInventoryPostEvaluationException({git:candidateGit({paths})}),/E_WP601_HISTORICAL_EXACT_ADMITTED_DELTA/);
  for(const missing of instance.operations.createPaths)assert.throws(()=>verifyWp601HistoricalInventoryPostEvaluationException({git:candidateGit({missing})}));
  for(const drift of [E.authorityPath,E.instancePath,E.admissionPath,E.successorPath,'scripts/ops/r24/docs-claim-lint.mjs'])assert.throws(()=>verifyWp601HistoricalInventoryPostEvaluationException({git:candidateGit({drift})}));
  assert.throws(()=>verifyWp601HistoricalInventoryPostEvaluationException({git:candidateGit({ancestor:false})}),/E_WP601_HISTORICAL_BASE_NOT_ANCESTOR/);
});
test('WP601 historical inventory oracle rejects missing future wrong-tree and rehashed object substitutions',()=>{
  let rejected=0;
  for(const pin of PINS){const input=inputs(pin);
    for(const mode of ['tree','ancestry','missing-stamp','missing-target','stamp-bytes','target-bytes','head']){
      const git=(rootDir,args)=>{
        if(mode==='tree'&&args[1]===`${pin.evaluationSha}^{tree}`)return Buffer.from('0'.repeat(40));
        if(mode==='head'&&args[1]==='HEAD')return Buffer.from('not-a-sha');
        if(mode==='ancestry'&&args[0]==='merge-base')throw Error('NOT_ANCESTOR');
        if(args[0]==='show'){
          const target=args[1].endsWith(':'+inventory);
          if(mode===(target?'missing-target':'missing-stamp'))throw Error('MISSING');
          if(mode===(target?'target-bytes':'stamp-bytes'))return Buffer.from('future bytes');
        }
        return realGit(rootDir,args);
      };
      assert.throws(()=>verifyHistoricalInventoryClaim({...input,git}),/E_HISTORICAL_INVENTORY_BINDING/);rejected++;
    }
    assert.throws(()=>verifyHistoricalInventoryClaim({...input,stampBytes:Buffer.concat([input.stampBytes,Buffer.from(' ')])}),/E_HISTORICAL_INVENTORY_BINDING/);rejected++;
    assert.throws(()=>verifyHistoricalInventoryClaim({...input,binding:{...input.binding,sha256:'0'.repeat(64)}}),/E_HISTORICAL_INVENTORY_BINDING/);rejected++;
    assert.equal(verifyHistoricalInventoryClaim({...input,stamp:{...input.stamp,stampId:'UNPINNED'}}),null);
    assert.equal(verifyHistoricalInventoryClaim({...input,binding:{...input.binding,filePath:'docs/OPS/R24/OTHER.json'}}),null);
  }
  assert.equal(rejected,18);
});
test('WP601 historical proof cannot satisfy an unrelated current inventory claim in the linter',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'wp601-historical-claim-'));
  // Synthetic files only. Git objects come from the existing read-only object
  // store, allowing a genuine ancestor check without modifying the repository.
  execFileSync('git',['init','--quiet',temp]);
  const common=execFileSync('git',['rev-parse','--path-format=absolute','--git-common-dir'],{encoding:'utf8'}).trim();
  fs.writeFileSync(path.join(temp,'.git','objects','info','alternates'),path.join(common,'objects')+'\n');
  fs.writeFileSync(path.join(temp,'.git','HEAD'),PINS[1].evaluationSha+'\n');
  fs.mkdirSync(path.join(temp,'docs/OPS/R24/EVIDENCE'),{recursive:true});fs.mkdirSync(path.join(temp,'docs/OPS/R24/CORRECTIVE'),{recursive:true});
  fs.writeFileSync(path.join(temp,inventory),'{"claim":"PASS"}\n');
  const pin=PINS[0],input=inputs(pin);
  // Other targets must be present at their claimed historical bytes so only
  // the changed current inventory can fail its own coverage check.
  for(const binding of input.stamp.claimBindings){if(binding.filePath===inventory)continue;fs.mkdirSync(path.dirname(path.join(temp,binding.filePath)),{recursive:true});fs.writeFileSync(path.join(temp,binding.filePath),realGit(root,['show',pin.evaluationSha+':'+binding.filePath]));}
  fs.writeFileSync(path.join(temp,`docs/OPS/R24/EVIDENCE/${pin.stampId}.json`),input.stampBytes);
  const result=lintDocsClaims(temp);assert.equal(result.ok,false);assert.equal(result.historicalBindings.length,1);
  assert(result.failures.includes('E_CLAIM_WITHOUT_EVIDENCE:'+inventory));
});
