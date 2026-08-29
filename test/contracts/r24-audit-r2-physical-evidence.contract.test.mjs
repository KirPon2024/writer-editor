import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compileManifest, validateManifest } from '../../scripts/ops/r24/corrective/audit-r2-physical-evidence.mjs';

const SHA='1'.repeat(40);
const TREE='2'.repeat(40);
function fixture() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'r24-r2-physical-'));
  fs.writeFileSync(path.join(root,'physical.log'),'physical pass\n# skipped 0\n# cancelled 0\n# todo 0\n');
  fs.writeFileSync(path.join(root,'platform.log'),'platform pass\n# skipped 0\n# cancelled 0\n# todo 0\n');
  fs.writeFileSync(path.join(root,'synthetic.docx'),Buffer.concat([Buffer.from('504b0304','hex'),Buffer.alloc(300,1)]));
  fs.writeFileSync(path.join(root,'unsigned.zip'),Buffer.concat([Buffer.from('504b0304','hex'),Buffer.alloc(2048,2)]));
  const manifest=compileManifest({evaluationSha:SHA,evaluationTreeSha:TREE,root,docx:'synthetic.docx',artifact:'unsigned.zip',logs:['PHYSICAL_A11Y_PERFORMANCE=physical.log','PLATFORM_COMPLEMENTS=platform.log']});
  return {root,manifest};
}
const cleanup=(value)=>fs.rmSync(value.root,{recursive:true,force:true});
test('fresh physical manifest binds raw logs and actual synthetic DOCX and unsigned artifact bytes',()=>{
  const value=fixture(); try{assert.equal(validateManifest(value.manifest,{root:value.root,evaluationSha:SHA,evaluationTreeSha:TREE,verifyGit:false}).laneCount,4);}finally{cleanup(value);}
});
test('stale evaluation head or tree fails closed',()=>{
  const value=fixture(); try{assert.throws(()=>validateManifest(value.manifest,{root:value.root,evaluationSha:'3'.repeat(40),evaluationTreeSha:TREE,verifyGit:false}),(error)=>error.code==='E_PHYSICAL_STALE_HEAD');}finally{cleanup(value);}
});
test('wrong DOCX or artifact digest and missing bytes fail closed',()=>{
  for(const name of ['synthetic.docx','unsigned.zip']){const value=fixture();try{fs.appendFileSync(path.join(value.root,name),'mutation');assert.throws(()=>validateManifest(value.manifest,{root:value.root,evaluationSha:SHA,evaluationTreeSha:TREE,verifyGit:false}),(error)=>error.code==='E_PHYSICAL_LANE_BYTES');}finally{cleanup(value);}}
  const value=fixture();try{fs.unlinkSync(path.join(value.root,'synthetic.docx'));assert.throws(()=>validateManifest(value.manifest,{root:value.root,evaluationSha:SHA,evaluationTreeSha:TREE,verifyGit:false}));}finally{cleanup(value);}
});
test('required, unexplained, cancelled, or todo skips cannot pass',()=>{
  for(const key of ['required','unexplained','cancelled','todo']){const value=fixture();try{value.manifest.skips[key]=1;assert.throws(()=>validateManifest(value.manifest,{root:value.root,evaluationSha:SHA,evaluationTreeSha:TREE,verifyGit:false}),(error)=>error.code==='E_PHYSICAL_SKIP');}finally{cleanup(value);}}
});
test('user-document, credential, signing, notarization, and distribution mutations fail',()=>{
  for(const [key,bad] of [['userDocumentsMutated',true],['credentialsRead',true],['signed',true],['notarized',true],['distributed',true]]){const value=fixture();try{value.manifest.safety[key]=bad;assert.throws(()=>validateManifest(value.manifest,{root:value.root,evaluationSha:SHA,evaluationTreeSha:TREE,verifyGit:false}),(error)=>error.code==='E_PHYSICAL_SAFETY');}finally{cleanup(value);}}
});
