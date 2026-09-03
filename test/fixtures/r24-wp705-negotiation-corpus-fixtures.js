'use strict';
const crypto = require('node:crypto');
const identity = (overrides = {}) => ({ entityId: 'synthetic-705', generation: 5, projectId: 'project-705', sourceRevision: 'revision-705', ...overrides });
const canonical = v => Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}' : JSON.stringify(v);
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const digest = v => hash(Buffer.from(canonical(v)));
const clone = v => JSON.parse(JSON.stringify(v));
const run = (text, options = {}) => ({ text, bold: false, italic: false, underline: false, ...options });
const paragraph = (text, options = {}) => ({ alignment: 'left', outlineLevel: null, runs: [run(text)], ...options });
const document = () => ({ paragraphs: [paragraph('Synthetic heading', { outlineLevel: 0 }), paragraph('Hello, мир, café, 日本語, العربية, עברית, İ, 👩‍💻.', { alignment: 'center', runs: [run('Hello, ', { bold: true }), run('мир, café, 日本語, العربية, עברית, İ, 👩‍💻.', { italic: true })] }), paragraph('line one\nline two\tend\n'), paragraph('   '), paragraph('')] });
const samples = ['Hello', 'мир', 'café', '日本語', 'العربية', 'עברית', 'İ', '👩‍💻', 'कथा', 'a\nb', '\t', '', '  ', 'tail\n', '<script>text & only</script>'];
function generatedDocument(seed) {
  let state = seed + 1;
  const next = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return state >>> 0; };
  const paragraphs = [];
  for (let p = 0; p < seed % 7; p++) {
    const runs = [];
    for (let r = 0; r < 1 + (seed + p) % 4; r++) runs.push(run(samples[next() % samples.length], { bold: Boolean(next() % 2), italic: Boolean(next() % 2), underline: Boolean(next() % 2) }));
    paragraphs.push({ alignment: ['left', 'right', 'center', 'both'][next() % 4], outlineLevel: next() % 3 ? null : next() % 9, runs });
  }
  return { paragraphs };
}
async function request(doc = document(), overrides = {}) {
  const api = await import('../../src/core/docx-profile-v1.mjs');
  const model = api.createDocxProfileEnvelope({ document: doc, identity: identity() }); if (!model.ok) throw Error(JSON.stringify(model));
  return { envelope: model.value, expectedIdentity: identity(), policy: 'EXPLICIT_LOSSY_PREVIEW_V1', sourceBytes: null, targetProfileId: 'TXT_UTF8_NFC_V1', targetSchemaVersion: 'yalken.text-formats.v1', ...overrides };
}
const offer = (familyId = 'DOCUMENT', version = 1) => ({ envelopeSchemaVersion: 'yalken.interchange.ir-envelope.v1', familyId, familySchemaVersion: `yalken.interchange.${familyId.toLowerCase()}-ir.v${version}` });
// This oracle enumerates the declared document model, not production ledger code.
function expectedFields(doc) {
  const fields = new Map([['/paragraphs', doc.paragraphs]]);
  doc.paragraphs.forEach((p, pi) => {
    for (const key of ['alignment', 'outlineLevel', 'runs']) fields.set(`/paragraphs/${pi}/${key}`, p[key]);
    p.runs.forEach((r, ri) => { for (const key of ['text', 'bold', 'italic', 'underline']) fields.set(`/paragraphs/${pi}/runs/${ri}/${key}`, r[key]); });
  });
  return fields;
}
const expectedText = doc => doc.paragraphs.map(p => p.runs.reduce((s, r) => s + r.text, '')).filter(s => /\S/u.test(s)).map(s => s.replace(/\n*$/u, '').normalize('NFC')).join('\n\n') + '\n';
module.exports = { identity, canonical, hash, digest, clone, run, paragraph, document, generatedDocument, request, offer, expectedFields, expectedText, samples };
