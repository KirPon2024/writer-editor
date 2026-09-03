'use strict';
const crypto = require('node:crypto');
const identity = (overrides = {}) => ({ projectId: 'project-wp704', entityId: 'session-wp704', sourceRevision: 'revision-wp704', generation: 4, ...overrides });
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const canonical = v => Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v);
const jsonBytes = v => Buffer.from(canonical(v) + '\n');
const clone = v => JSON.parse(JSON.stringify(v));
const baseline = 'sha256:' + hash(Buffer.from('synthetic-baseline-wp704'));
const paragraph = (text, options = {}) => ({ alignment: 'left', outlineLevel: null, runs: [{ text, bold: false, italic: false, underline: false }], ...options });
const document = () => ({ paragraphs: [paragraph('Synthetic WP704 export', { outlineLevel: 0 }), paragraph('Hello, мир, Καλημέρα, café, 日本語, العربية, עברית, 😀. <script> never executes & remains text.'), paragraph('Line one\nLine two\tTab'), paragraph('A centered ending', { alignment: 'center' })] });
async function documentEnvelope(doc = document(), id = identity()) {
  const { createDocxProfileEnvelope } = await import('../../src/core/docx-profile-v1.mjs');
  const result = createDocxProfileEnvelope({ identity: id, document: doc }); if (!result.ok) throw new Error(JSON.stringify(result)); return result.value;
}
const entries = () => [
  { relativePath: 'project.craftsman.json', bytes: jsonBytes({ projectId: identity().projectId, projectName: 'Synthetic WP704 project', scenes: ['scene-1'] }) },
  { relativePath: 'scenes/scene-1.json', bytes: jsonBytes({ sceneId: 'scene-1', text: 'Synthetic manuscript мир.' }) },
  { relativePath: 'assets/palette.bin', bytes: Buffer.from([0, 1, 2, 3, 254, 255]) },
  { relativePath: 'notes/空.txt', bytes: Buffer.alloc(0) },
];
async function packet() {
  const { buildRevisionPacketPreview } = await import('../../src/io/revisionBridge/index.mjs');
  const value = { projectId: identity().projectId, sessionId: identity().entityId, baselineHash: baseline, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', reviewPacket: {
    commentThreads: [{ threadId: 'thread-1', authorId: 'synthetic-editor', status: 'open', messages: [{ messageId: 'message-1', authorId: 'synthetic-editor', body: 'Consider clarifying this synthetic sentence.', createdAt: '2026-01-01T00:00:00.000Z' }], tags: ['clarity'] }],
    commentPlacements: [], textChanges: [{ changeId: 'change-1', targetScope: { type: 'scene', id: 'scene-1' }, match: { kind: 'exact', quote: 'Synthetic', prefix: '', suffix: '' }, replacementText: 'Revised synthetic', createdAt: '2026-01-01T00:00:00.000Z' }], structuralChanges: [], diagnosticItems: [], decisionStates: [],
  } };
  const normalized = buildRevisionPacketPreview(value); if (!normalized.ok) throw new Error(JSON.stringify(normalized));
  return { packetVersion: 'review-packet.v1', ...value, reviewPacket: normalized.session.reviewGraph };
}
// Synthetic classic-xref bytes exercise only the narrow metadata transform.
// They are never used as physical PDF correctness evidence.
function syntheticPdf(date = "D:20260102030405+00'00'", infoExtra = '') {
  const objects = ['1 0 obj\n<</Type /Catalog /Pages 2 0 R>>\nendobj\n', '2 0 obj\n<</Type /Pages /Kids [] /Count 0>>\nendobj\n', `3 0 obj\n<</Title (Synthetic)\n/Creator (Chromium)\n/Producer (Skia/PDF)\n/CreationDate (${date})\n/ModDate (${date})${infoExtra}>>\nendobj\n`];
  let body = '%PDF-1.4\n%unit-only\n'; const offsets = [0];
  for (const object of objects) { offsets.push(Buffer.byteLength(body)); body += object; }
  const xref = Buffer.byteLength(body);
  body += 'xref\n0 4\n0000000000 65535 f \n' + offsets.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<</Size 4\n/Root 1 0 R\n/Info 3 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body);
}
async function reEnvelope(envelope, mutate) {
  const { createInterchangeIrEnvelope } = await import('../../src/core/interchange-ir-v1.mjs'); const body = clone(envelope.body); mutate(body.payload);
  const result = createInterchangeIrEnvelope({ familyId: body.familyId, identity: body.identity, payload: body.payload }); if (!result.ok) throw new Error(JSON.stringify(result)); return result.value;
}
module.exports = { identity, hash, canonical, jsonBytes, clone, baseline, paragraph, document, documentEnvelope, entries, packet, syntheticPdf, reEnvelope };
