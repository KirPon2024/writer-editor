'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const write = (dir, name, value) => fs.writeFileSync(path.join(dir, name), value, { flag: 'wx' });
const raw = value => JSON.stringify(value, null, 2) + '\n';
const implementation = ['src/core/pdf-archive-review-profile-v1.mjs', 'src/core/electron-pdf-profile-port-v1.cjs', 'scripts/ops/r24/wp704-physical-pdf.cjs'];
function verify(dir) {
  assert(dir && path.basename(dir).startsWith('yalken-wp704-pdf-'));
  const receipt = JSON.parse(fs.readFileSync(path.join(dir, 'physical-receipt.json')));
  const pdf = fs.readFileSync(path.join(dir, 'synthetic.pdf'));
  assert.equal(hash(pdf), receipt.pdfSha256); assert.equal(pdf.length, receipt.pdfBytes);
  assert.equal(receipt.repeatedRenderDenominator, 2); assert.equal(receipt.repeatedEqual, true);
  assert.equal(receipt.electron, '41.10.3'); assert.equal(receipt.syntheticOnly, true);
  for (const binding of receipt.implementationArtifacts) assert.equal(hash(fs.readFileSync(path.join(root, binding.path))), binding.sha256);
  return { schemaVersion: 'WP704_PHYSICAL_PDF_BYTE_READBACK_V1', status: 'PASS', pdfSha256: hash(pdf), byteLength: pdf.length, renderingDenominator: 2, independentPdfSemanticOrVisualClaim: false, outputDirectory: dir };
}
function independentReadback(dir) {
  const byteProof = verify(dir);
  const python = '/Users/kirillponomarev/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
  const code = `import json,sys,re,hashlib,pypdf
from pathlib import Path
from pypdf import PdfReader
d=Path(sys.argv[1]); pdf=d/'synthetic.pdf'; raw=pdf.read_bytes()
source=json.loads((d/'synthetic-source.json').read_bytes())
receipt=json.loads((d/'physical-receipt.json').read_bytes())
assert any(x['code']=='PDF_TEXT_EXTRACTION_NOT_EXACT' for x in receipt['lossLedger']['items'])
r=PdfReader(pdf,strict=True); text='\\n'.join(p.extract_text() for p in r.pages)
space=lambda s: re.sub(r'\\s+',' ',s).strip()
rows=[]
for index,p in enumerate(source['document']['paragraphs']):
 if index==2: continue
 expected=''.join(x['text'] for x in p['runs'])
 assert space(expected) in space(text),('paragraph',index)
 rows.append({'id':'paragraph-'+str(index),'disposition':'EXACT_TEXT_AFTER_LINE_REFLOW'})
for expected in ['мир','Καλημέρα','café','العربية','עברית','😀']:
 assert expected in text,expected
 rows.append({'id':'unicode-'+expected,'disposition':'EXACT_CODEPOINTS'})
if '日本語' in text: rows.append({'id':'unicode-日本語','disposition':'EXACT_CODEPOINTS'})
else:
 assert '⽇本語' in text
 rows.append({'id':'unicode-日本語','disposition':'DECLARED_TRANSFORMED_LOSSY','expectedCodepoints':['U+65E5','U+672C','U+8A9E'],'observedCodepoints':['U+2F47','U+672C','U+8A9E'],'rule':'EXACT_KNOWN_CMAP_COMPATIBILITY_MAPPING_NOT_GENERAL_NORMALIZATION'})
assert len(rows)==47
assert len(r.pages)==3 and not r.is_encrypted
catalog=r.trailer['/Root']; assert '/AcroForm' not in catalog and '/OpenAction' not in catalog and '/AA' not in catalog
geometry=[]
for page in r.pages:
 w,h=float(page.mediabox.width),float(page.mediabox.height)
 assert abs(w-595.276)<0.5 and abs(h-841.89)<0.5
 assert '/AA' not in page and '/Annots' not in page
 geometry.append([w,h])
print(json.dumps({'schemaVersion':'WP704_INDEPENDENT_PDF_READBACK_V1','status':'PASS','oracle':'pypdf','oracleVersion':pypdf.__version__,'pdfSha256':hashlib.sha256(raw).hexdigest(),'pageDenominator':len(r.pages),'textCheckDenominator':len(rows),'exactTextChecks':sum(x['disposition']!='DECLARED_TRANSFORMED_LOSSY' for x in rows),'declaredLossChecks':sum(x['disposition']=='DECLARED_TRANSFORMED_LOSSY' for x in rows),'failedChecks':0,'rows':rows,'pageGeometry':geometry,'exactUnicodeRoundtripClaim':False,'visualInspectionStillRequired':True},ensure_ascii=False))
`;
  const result = spawnSync(python, ['-c', code, dir], { encoding: 'utf8', timeout: 30000, maxBuffer: 8388608 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const proof = JSON.parse(result.stdout); assert.equal(proof.pdfSha256, byteProof.pdfSha256);
  const output = path.join(dir, 'independent-pdf-readback.json');
  if (fs.existsSync(output)) assert.deepEqual(JSON.parse(fs.readFileSync(output)), proof);
  else write(dir, 'independent-pdf-readback.json', raw(proof));
  return proof;
}
async function main() {
  if (process.argv.includes('--driver')) {
    assert.equal(process.versions.node, '22.12.0');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-wp704-pdf-'));
    const electron = require('electron'); const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const args = [__filename, '--electron', dir];
    const result = process.platform === 'linux'
      ? spawnSync('xvfb-run', ['-a', electron, ...args], { cwd: root, env, encoding: 'utf8', timeout: 60000, maxBuffer: 8388608 })
      : spawnSync(electron, args, { cwd: root, env, encoding: 'utf8', timeout: 60000, maxBuffer: 8388608 });
    write(dir, 'electron-stdout.txt', result.stdout || ''); write(dir, 'electron-stderr.txt', result.stderr || '');
    if (result.status !== 0) { console.error(raw({ status: 'FAIL', outputDirectory: dir, exitCode: result.status, error: result.error?.message, stderr: result.stderr })); process.exitCode = 1; return; }
    console.log(raw(verify(dir))); return;
  }
  if (process.argv.includes('--verify')) { console.log(raw(independentReadback(process.env.WP704_PHYSICAL_DIR))); return; }
  assert(process.argv.includes('--electron'));
  const dir = process.argv[process.argv.indexOf('--electron') + 1];
  assert(path.basename(dir).startsWith('yalken-wp704-pdf-')); assert(fs.statSync(dir).isDirectory());
  const { app, BrowserWindow } = require('electron');
  // The adapter destroys each disposable window. Keep this harness alive until
  // both renders and the byte receipt finish; do not inherit default app quit.
  app.on('window-all-closed', () => {});
  app.setPath('userData', path.join(dir, 'electron-user-data'));
  await app.whenReady();
  try {
    const api = await import('../../../src/core/pdf-archive-review-profile-v1.mjs');
    const docx = await import('../../../src/core/docx-profile-v1.mjs');
    const { createElectronPdfProfilePort } = require('../../../src/core/electron-pdf-profile-port-v1.cjs');
    const id = { projectId: 'synthetic-wp704', entityId: 'synthetic-document', sourceRevision: 'synthetic-revision-1', generation: 1 };
    const p = (text, outlineLevel = null) => ({ alignment: 'left', outlineLevel, runs: [{ text, bold: false, italic: false, underline: false }] });
    const document = { paragraphs: [p('WP704 - deterministic interchange', 0), p('Synthetic manuscript. Not a user document.'), p('Unicode: мир, Καλημέρα, café, 日本語, العربية, עברית, 😀.'), p('Escaped markup: <script> & <img src="https://invalid.example/">'), ...Array.from({ length: 36 }, (_, n) => p(`Paragraph ${String(n + 1).padStart(2, '0')}. A synthetic archive and review export must preserve source identity, reject stale work, and keep every declared entry accountable. No packet grants permission to change the manuscript.`)), p('END OF SYNTHETIC WP704 DOCUMENT', 1)] };
    const envelope = docx.createDocxProfileEnvelope({ document, identity: id }); assert.equal(envelope.ok, true);
    const input = { envelope: envelope.value, expectedIdentity: id, sourceBytes: null };
    const projection = api.buildPdfProfileProjection(input); assert.equal(projection.ok, true);
    write(dir, 'synthetic-source.json', raw({ document, identity: id })); write(dir, 'synthetic-projection.html', projection.html);
    const port = createElectronPdfProfilePort({ BrowserWindow, versions: process.versions, readIdentity: () => id });
    const outputs = [];
    for (let n = 0; n < 2; n++) {
      let rawBytes;
      const wrapped = { ...port, render: async html => { rawBytes = await port.render(html); return rawBytes; } };
      const result = await api.renderPdfProfile(input, wrapped);
      if (!result.ok) { write(dir, `rejected-render-${n}.bin`, rawBytes || Buffer.alloc(0)); throw new Error(JSON.stringify(result)); }
      outputs.push(result);
      if (n === 0) await new Promise(resolve => setTimeout(resolve, 1100));
    }
    assert.deepEqual(outputs[0].bytes, outputs[1].bytes);
    write(dir, 'synthetic.pdf', outputs[0].bytes);
    const receipt = { schemaVersion: 'WP704_PHYSICAL_PDF_RENDER_V1', status: 'PASS', syntheticOnly: true, profileId: api.PDF_RENDER_PROFILE, electron: process.versions.electron, chromium: process.versions.chrome, platform: process.platform, architecture: process.arch, osRelease: os.release(), identity: id, inputDocumentSha256: hash(Buffer.from(raw(document))), htmlSha256: projection.htmlSha256, semanticSha256: projection.semanticSha256, paragraphDenominator: document.paragraphs.length, fieldDenominator: projection.fieldDenominator, pdfSha256: outputs[0].sha256, pdfBytes: outputs[0].byteLength, pdfObjectDenominator: outputs[0].objectDenominator, repeatedRenderDenominator: 2, repeatedEqual: true, normalizedDatesPerRender: 2, independentSemanticVisualVerificationRequired: true, crossPlatformByteEqualityClaim: false, implementationArtifacts: implementation.map(p => ({ path: p, sha256: hash(fs.readFileSync(path.join(root, p))) })) };
    receipt.lossLedger = projection.lossLedger;
    write(dir, 'physical-receipt.json', raw(receipt)); console.log(raw(receipt));
  } finally { app.quit(); }
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; if (process.versions.electron) require('electron').app.exit(1); });
