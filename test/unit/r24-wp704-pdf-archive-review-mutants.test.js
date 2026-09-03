'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const f = require('../fixtures/r24-wp704-pdf-archive-review-fixtures.js');
const root = path.resolve(__dirname, '../..');
const file = path.join(root, 'src/core/pdf-archive-review-profile-v1.mjs');

test('WP704 real source mutants are killed by behavioral assertions, not import or syntax failure', async t => {
  const original = await import(pathToFileURL(file).href), source = fs.readFileSync(file, 'utf8');
  const envelope = await f.documentEnvelope(), packet = await f.packet();
  const archive = original.createProjectArchiveProfile({ entries: f.entries(), identity: f.identity() }).value;
  const input = { envelope, expectedIdentity: f.identity(), sourceBytes: null };
  const reject = result => assert.equal(result.ok, false);
  const pdf = api => ({ bytes: f.syntheticPdf(), profileId: api.PDF_RENDER_PROFILE });
  const native = await import('../../src/io/revisionBridge/index.mjs');
  const secretPacket = f.clone(packet);
  secretPacket.reviewPacket.commentPlacements.push(native.createCommentPlacement({ placementId: 'placement-1', threadId: 'thread-1', targetScope: { type: 'scene', id: 'scene-1' }, anchor: { kind: 'text', value: 'anchor' }, range: { from: 0, to: 1 }, quote: 'S', prefix: '', suffix: '', confidence: 1, policy: 'exact', selector: { type: 'text-position', start: 0, end: 1, secret: 'synthetic-not-a-secret' }, createdAt: '2026-01-01T00:00:00.000Z' }));
  const decided = f.clone(packet);
  decided.reviewPacket.decisionStates.push(native.createDecisionState({ decisionId: 'decision-1', itemKind: 'textChange', itemId: 'change-1', status: 'accepted', decidedAt: '2026-01-01T00:00:00.000Z', reason: 'synthetic' }));
  const cases = [
    ['identity', "if (canonical(identity(a)) !== canonical(identity(b))) reject('E_PAR_STALE_IDENTITY');", '', api => reject(api.serializeProjectArchiveProfile({ envelope: archive, expectedIdentity: f.identity({ generation: 9 }) }))],
    ['proxy-before-traps', '!value || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype', '!value || Object.getPrototypeOf(value) !== Object.prototype', api => { let called = 0; api.createProjectArchiveProfile(new Proxy({}, { getPrototypeOf() { called++; throw Error('trap'); } })); assert.equal(called, 0); }],
    ['html-escape', 'escapeHtml(r.text)', 'r.text', api => assert(!api.buildPdfProfileProjection(input).html.includes('<script>'))],
    ['fixed-pdf-dates', "output.write(stable, edit.offset, edit.length, 'latin1');", 'void stable;', api => assert.deepEqual(api.canonicalizePdfProfileBytes(pdf(api)).bytes, api.canonicalizePdfProfileBytes({ ...pdf(api), bytes: f.syntheticPdf("D:20260903040506+00'00'") }).bytes)],
    ['xref-object-offset', ' || !text.startsWith(`${n} 0 obj`, offset)', '', api => reject(api.canonicalizePdfProfileBytes({ ...pdf(api), bytes: Buffer.from(f.syntheticPdf().toString().replace('0000000020', '0000000021')) }))],
    ['trailer-denominator', 'Number(fields[1]) !== count || ', '', api => reject(api.canonicalizePdfProfileBytes({ ...pdf(api), bytes: Buffer.from(f.syntheticPdf().toString().replace('/Size 4', '/Size 5')) }))],
    ['pre-render-stale', '    sameIdentity(await port.readIdentity(), projection.identity);\n    const rendered', '    const rendered', async api => { let reads = 0, calls = 0; const port = { profileId: api.PDF_RENDER_PROFILE, readIdentity: () => ++reads === 1 ? f.identity({ generation: 9 }) : f.identity(), render: async () => { calls++; return f.syntheticPdf(); } }; await api.renderPdfProfile(input, port); assert.equal(calls, 0); }],
    ['post-render-stale', 'const rendered = await port.render(projection.html);\n    sameIdentity(await port.readIdentity(), projection.identity);', 'const rendered = await port.render(projection.html);', async api => { let id = f.identity(); reject(await api.renderPdfProfile(input, { profileId: api.PDF_RENDER_PROFILE, readIdentity: () => id, render: async () => { id = f.identity({ generation: 9 }); return f.syntheticPdf(); } })); }],
    ['archive-quarantine', "  const quarantine = inspectParserQuarantine({ bytes: output, format: 'ZIP', budgets: {} }); if (!quarantine.ok) reject('E_PAR_ARCHIVE_QUARANTINE');\n  if (quarantine.value.parts.length !== entries.length + 1) reject('E_PAR_ARCHIVE_DENOMINATOR'); return { output, manifest };", '  return { output, manifest };', api => reject(api.createProjectArchiveProfile({ identity: f.identity(), entries: [...f.entries(), { relativePath: 'A.txt', bytes: Buffer.from('a') }, { relativePath: 'a.txt', bytes: Buffer.from('a') }] }))],
    ['archive-payload-replay', "if (!rebuilt.ok || canonical(rebuilt.value.body.payload) !== canonical(payload)) reject('E_PAR_ARCHIVE_REPLAY');", "if (!rebuilt.ok) reject('E_PAR_ARCHIVE_REPLAY');", async api => reject(api.serializeProjectArchiveProfile({ envelope: await f.reEnvelope(archive, p => p.entryDenominator--), expectedIdentity: f.identity() }))],
    ['archive-local-date', 'output.writeUInt16LE(33, offset + 12);', '', api => { const r = api.serializeProjectArchiveProfile({ envelope: archive, expectedIdentity: f.identity() }); assert.equal(r.ok, true); assert.equal(r.bytes.readUInt16LE(12), 33); }],
    ['file-directory-collision', "  for (const parent of entries) if (entries.some(child => child.relativePath.startsWith(parent.relativePath + '/'))) reject('E_PAR_ARCHIVE_FILE_DIRECTORY_COLLISION');", '', api => reject(api.createProjectArchiveProfile({ identity: f.identity(), entries: [...f.entries(), { relativePath: 'node', bytes: Buffer.from('a') }, { relativePath: 'node/child', bytes: Buffer.from('b') }] }))],
    ['review-nested-authority', 'if (AUTHORITY_KEYS.test(key))', 'if (false)', api => reject(api.createReviewPacketProfile({ packet: secretPacket, identity: f.identity(), expectedBaselineHash: f.baseline }))],
    ['review-decisions', ' || packet.reviewPacket.decisionStates.length !== 0', '', api => reject(api.createReviewPacketProfile({ packet: decided, identity: f.identity(), expectedBaselineHash: f.baseline }))],
    ['review-duplicate-ids', "if (new Set(ids).size !== ids.length) reject('E_PAR_REVIEW_DUPLICATE_ID');", '', api => { const p = f.clone(packet); p.reviewPacket.commentThreads.push(f.clone(p.reviewPacket.commentThreads[0])); reject(api.createReviewPacketProfile({ packet: p, identity: f.identity(), expectedBaselineHash: f.baseline })); }],
    ['review-resolved', "  if (packet.reviewPacket.commentThreads.some(thread => thread.status !== 'open')) reject('E_PAR_REVIEW_DECISIONS');", '', api => { const p = f.clone(packet); p.reviewPacket.commentThreads[0].status = 'resolved'; reject(api.createReviewPacketProfile({ packet: p, identity: f.identity(), expectedBaselineHash: f.baseline })); }],
    ['review-canonical-transport', "if (!jsonBytes(clean(packet)).equals(source)) reject('E_PAR_REVIEW_NONCANONICAL_BYTES');", '', api => reject(api.parseReviewPacketProfile({ bytes: Buffer.from(f.jsonBytes(packet).toString().replace('"packetVersion":', '"packetVersion":"wrong","packetVersion":')), identity: f.identity(), expectedBaselineHash: f.baseline }))],
    ['review-baseline', 'packet.baselineHash !== baseline || ', '', api => reject(api.createReviewPacketProfile({ packet, identity: f.identity(), expectedBaselineHash: 'sha256:' + '0'.repeat(64) }))],
    ['archive-total-budget', "if (total > L.maxTotalFileBytes) reject('E_PAR_ARCHIVE_TOTAL_BUDGET');", '', api => reject(api.createProjectArchiveProfile({ identity: f.identity(), entries: [...f.entries(), ...[0, 1, 2].map(n => ({ relativePath: n + '.txt', bytes: Buffer.alloc(180000, 65) }))] }))],
    ['ir-digest-validation', 'const checked = validateInterchangeIrEnvelope(clean(value));', 'const checked = { ok: true, value: clean(value) };', api => { const invalid = f.clone(archive); invalid.bodySha256 = '0'.repeat(64); reject(api.serializeProjectArchiveProfile({ envelope: invalid, expectedIdentity: f.identity() })); }],
  ];
  let killed = 0;
  for (const [name, needle, replacement, behavior] of cases) {
    assert.equal(source.split(needle).length - 1, 1, name + ' source anchor');
    await behavior(original);
    const mutated = source.replace(needle, replacement).replace(/from '([.][^']+)'/g, (_all, relative) => `from '${pathToFileURL(path.resolve(path.dirname(file), relative)).href}'`);
    const api = await import('data:text/javascript;base64,' + Buffer.from(mutated).toString('base64'));
    let assertion;
    try { await behavior(api); } catch (error) { assertion = error; }
    assert.equal(assertion?.code, 'ERR_ASSERTION', name + ' survived or failed outside its oracle'); killed++;
  }
  assert.equal(cases.length, 20); assert.equal(killed, 20);
  t.diagnostic(JSON.stringify({ implementationMutants: cases.length, killed, survivors: cases.length - killed, syntaxOrImportFailuresCountedAsKills: false }));
});
