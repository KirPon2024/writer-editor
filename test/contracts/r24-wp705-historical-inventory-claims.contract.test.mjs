import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import {HISTORICAL_INVENTORY_CLAIM_PINS_V1 as V1,HISTORICAL_INVENTORY_CLAIM_PINS_V2 as V2,verifyHistoricalInventoryClaim,lintDocsClaims} from '../../scripts/ops/r24/docs-claim-lint.mjs';
import {WP705_HISTORICAL_INVENTORY_ADMISSION_EXPECTATION as E,verifyWp705HistoricalInventoryPostEvaluationException} from '../../scripts/ops/r24/corrective/post-audit-certification-set.mjs';
const root=process.cwd(),inventory='docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json',pins=V2.slice(2);
const realGit=(rootDir,args)=>execFileSync('git',args,{cwd:rootDir,encoding:null,stdio:['ignore','pipe','pipe']});
function inputs(pin){const stampBytes=fs.readFileSync('docs/OPS/R24/EVIDENCE/'+pin.stampId+'.json'),stamp=JSON.parse(stampBytes);return{rootDir:root,stamp,stampBytes,binding:stamp.claimBindings.find(b=>b.filePath===inventory)};}
test('WP705 adds exactly two immutable historical pins and preserves V1 and the exact E0 mismatch anchor',()=>{
  assert.equal(V1.length,2);assert.equal(V2.length,4);assert.deepEqual(V2.slice(0,2),V1);assert(Object.isFrozen(V2));for(const pin of V2)assert(Object.isFrozen(pin));
  assert.deepEqual(pins.map(p=>p.stampId),['ES-R24-WP-704-PDF-ARCHIVE-REVIEW-CLAIM-BINDINGS','ES-R24-WP-705-NEGOTIATION-CORPUS-CLAIM-BINDINGS']);
  const source=fs.readFileSync('scripts/ops/r24/docs-claim-lint.mjs','utf8'),anchor='if (actual !== binding.sha256) {\n      failures.push('+String.fromCharCode(96)+'E_CLAIM_BINDING_DIGEST_MISMATCH:$'+'{relativePath}'+String.fromCharCode(96)+');\n      continue;\n    }';
  assert.equal(source.split(anchor).length-1,1);assert(source.indexOf('const historical = verifyHistoricalInventoryClaim')<source.indexOf(anchor));
  for(const pin of pins){const result=verifyHistoricalInventoryClaim(inputs(pin));assert.equal(result.status,'VERIFIED_HISTORICAL_BYTES');assert.equal(result.evaluationSha,pin.evaluationSha);assert.equal(result.evaluationTree,pin.evaluationTree);assert.equal(result.targetSha256,pin.targetSha256);assert.equal(result.currentFileCoverage,false);}
});
test('WP705 rejects 18 hostile historical object mutations with no future or ambient fallback',()=>{
  let rejected=0;
  for(const pin of pins){const input=inputs(pin);
    for(const mode of ['tree','ancestry','missing-stamp','missing-target','stamp-bytes','target-bytes','head']){
      const git=(rootDir,args)=>{
        if(mode==='tree'&&args[1]===pin.evaluationSha+'^{tree}')return Buffer.from('0'.repeat(40));
        if(mode==='head'&&args[1]==='HEAD')return Buffer.from('not-a-sha');
        if(mode==='ancestry'&&args[0]==='merge-base')throw Error('NOT_ANCESTOR');
        if(args[0]==='show'){const target=args[1].endsWith(':'+inventory);
          if(mode===(target?'missing-target':'missing-stamp'))throw Error('MISSING');
          if(mode===(target?'target-bytes':'stamp-bytes'))return Buffer.from('future replacement bytes');
        }return realGit(rootDir,args);
      };
      assert.throws(()=>verifyHistoricalInventoryClaim({...input,git}),/E_HISTORICAL_INVENTORY_BINDING/);rejected++;
    }
    assert.throws(()=>verifyHistoricalInventoryClaim({...input,stampBytes:Buffer.concat([input.stampBytes,Buffer.from(' ')])}),/E_HISTORICAL_INVENTORY_BINDING/);rejected++;
    assert.throws(()=>verifyHistoricalInventoryClaim({...input,binding:{...input.binding,sha256:'0'.repeat(64)}}),/E_HISTORICAL_INVENTORY_BINDING/);rejected++;
    assert.equal(verifyHistoricalInventoryClaim({...input,stamp:{...input.stamp,stampId:'UNPINNED'}}),null);
    assert.equal(verifyHistoricalInventoryClaim({...input,binding:{...input.binding,filePath:'docs/OPS/R24/OTHER.json'}}),null);
  }assert.equal(rejected,18);
});
test('neither new historical pin can provide coverage for a current inventory claim',()=>{
  for(const pin of pins){
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'wp705-historical-claim-'));
    execFileSync('git',['init','--quiet',temp]);
    const common=realGit(root,['rev-parse','--path-format=absolute','--git-common-dir']).toString().trim();
    fs.writeFileSync(path.join(temp,'.git/objects/info/alternates'),path.join(common,'objects')+'\n');
    fs.writeFileSync(path.join(temp,'.git/HEAD'),pin.evaluationSha+'\n');
    fs.mkdirSync(path.join(temp,'docs/OPS/R24/EVIDENCE'),{recursive:true});fs.mkdirSync(path.join(temp,'docs/OPS/R24/CORRECTIVE'),{recursive:true});
    fs.writeFileSync(path.join(temp,inventory),'{"claim":"PASS"}\n');
    const input=inputs(pin);
    for(const binding of input.stamp.claimBindings){if(binding.filePath===inventory)continue;const target=path.join(temp,binding.filePath);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,realGit(root,['show',pin.evaluationSha+':'+binding.filePath]));}
    fs.writeFileSync(path.join(temp,'docs/OPS/R24/EVIDENCE/'+pin.stampId+'.json'),input.stampBytes);
    const result=lintDocsClaims(temp);assert.equal(result.ok,false);assert.equal(result.historicalBindings.length,1);assert.equal(result.historicalBindings[0].currentFileCoverage,false);
    assert(result.failures.includes('E_CLAIM_WITHOUT_EVIDENCE:'+inventory));
  }
});
test('WP705 historical successor rejects incomplete unadmitted missing drifted and non-ancestor candidates',()=>{
  const instance=JSON.parse(fs.readFileSync(E.instancePath)),paths=[...instance.operations.modifyPaths,...instance.operations.createPaths].sort();
  const candidate='f705f705f705f705f705f705f705f705f705f705',tree='a705a705a705a705a705a705a705a705a705a705';
  const fake=({delta=paths,missing=null,drift=null,ancestor=true,wrongBase=false,historicalDrift=false}={})=>(args,{encoding=null}={})=>{
    let result;
    if(args[0]==='rev-parse'&&(args[1]==='HEAD'||args[1]===candidate))result=Buffer.from(candidate);
    else if(args[0]==='rev-parse'&&args[1]===candidate+'^{tree}')result=Buffer.from(tree);
    else if(args[0]==='rev-parse'&&args[1]===E.baseSha+'^{tree}'&&wrongBase)result=Buffer.from('0'.repeat(40));
    else if(args[0]==='merge-base'&&args.at(-1)===candidate){if(!ancestor)throw Error('NOT_ANCESTOR');result=Buffer.alloc(0);}
    else if(args[0]==='diff')result=Buffer.from(delta.join('\n'));
    else if(args[0]==='show'){
      const split=args[1].indexOf(':'),sha=args[1].slice(0,split),file=args[1].slice(split+1);
      if(file===missing)throw Error('MISSING');
      result=sha===candidate?fs.readFileSync(file):realGit(root,args);
      if(file===drift||(historicalDrift&&sha===pins[1].evaluationSha&&file===inventory))result=Buffer.concat([result,Buffer.from('\n')]);
    }else result=realGit(root,args);
    return encoding==='utf8'?result.toString():result;
  };
  const result=verifyWp705HistoricalInventoryPostEvaluationException({git:fake()});
  assert.equal(result.status,'PASS');assert.equal(result.admittedPathDenominator,11);assert.equal(result.aggregatePathDenominator,45);assert.equal(result.historicalBindingDenominator,2);assert.equal(result.currentFileCoverage,false);
  assert.equal(result.sourcePlanRoles.externalSourcePlanDigest,'1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a');assert.equal(result.sourcePlanRoles.compiledProgramFileDigest,'da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a');
  for(const delta of [paths.slice(1),[...paths,'src/main.js'].sort(),[...paths,paths[0]].sort()])assert.throws(()=>verifyWp705HistoricalInventoryPostEvaluationException({git:fake({delta})}),/E_WP705_HISTORICAL_EXACT_ADMITTED_DELTA/);
  for(const missing of instance.operations.createPaths)assert.throws(()=>verifyWp705HistoricalInventoryPostEvaluationException({git:fake({missing})}));
  for(const drift of [E.authorityPath,E.instancePath,E.admissionPath,E.successorPath,'scripts/ops/r24/docs-claim-lint.mjs','test/contracts/r24-wp601-historical-inventory-claims.contract.test.mjs','test/contracts/r24-wp705-historical-inventory-claims.contract.test.mjs'])assert.throws(()=>verifyWp705HistoricalInventoryPostEvaluationException({git:fake({drift})}));
  assert.throws(()=>verifyWp705HistoricalInventoryPostEvaluationException({git:fake({ancestor:false})}),/E_WP705_HISTORICAL_BASE_NOT_ANCESTOR/);
  assert.throws(()=>verifyWp705HistoricalInventoryPostEvaluationException({git:fake({wrongBase:true})}),/E_WP705_HISTORICAL_ADMISSION_BASE/);
  assert.throws(()=>verifyWp705HistoricalInventoryPostEvaluationException({git:fake({historicalDrift:true})}),/E_WP705_HISTORICAL_PINNED_OBJECT_BYTES/);
});
