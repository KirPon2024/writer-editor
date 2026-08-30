'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(ROOT, 'src', 'core', 'atlas-anchor-lineage-v1.mjs');

const MUTANTS = Object.freeze([
  {
    id: 'identity-absorbs-fallible-quote',
    find: "    schemaVersion: ATLAS_ANCHOR_IDENTITY_SCHEMA_VERSION,\n    anchorId,\n    projectId,\n    sceneId,\n    birthRevision,",
    replace: "    schemaVersion: ATLAS_ANCHOR_IDENTITY_SCHEMA_VERSION,\n    anchorId,\n    projectId,\n    sceneId,\n    quote: input.quote,\n    birthRevision,",
  },
  {
    id: 'witness-quote-hash-tamper-accepted',
    find: "  const quoteHash = assertHexDigest(witness.quoteHash, 'E_ATLAS_ANCHOR_WITNESS_QUOTE_HASH_INVALID');\n  if (quoteHash !== hashCanonicalValue(quote)) {\n    fail('E_ATLAS_ANCHOR_WITNESS_QUOTE_HASH_MISMATCH');\n  }",
    replace: "  const quoteHash = witness.quoteHash;\n  if (false) {\n    fail('E_ATLAS_ANCHOR_WITNESS_QUOTE_HASH_MISMATCH');\n  }",
  },
  {
    id: 'lost-quote-becomes-empty-ambiguity',
    find: '  if (candidates.length === 0) {',
    replace: '  if (candidates.length === -1) {',
  },
  {
    id: 'ambiguous-quote-silently-first-matched',
    find: '  if (candidates.length === 1) {',
    replace: '  if (candidates.length >= 1) {',
  },
  {
    id: 'unknown-explicit-selection-accepted',
    find: "    if (!selected) fail('E_ATLAS_ANCHOR_SELECTION_NOT_A_CANDIDATE');",
    replace: '    if (!selected) return candidates[0];',
  },
  {
    id: 'ambiguous-result-claims-automatic-reattachment',
    find: "    reason: 'MULTIPLE_CANDIDATES_REQUIRE_EXPLICIT_SELECTION',\n    anchorId,\n    sceneId,\n    candidateCount: candidates.length,\n    candidates,\n    automaticReattachment: false,",
    replace: "    reason: 'MULTIPLE_CANDIDATES_REQUIRE_EXPLICIT_SELECTION',\n    anchorId,\n    sceneId,\n    candidateCount: candidates.length,\n    candidates,\n    automaticReattachment: true,",
  },
  {
    id: 'append-only-entry-hash-check-removed',
    find: "    if (hashCanonicalValue(normalized) !== source.entryHash) fail('E_ATLAS_ANCHOR_LINEAGE_ENTRY_HASH_MISMATCH', String(index));",
    replace: '    if (false) fail(\'E_ATLAS_ANCHOR_LINEAGE_ENTRY_HASH_MISMATCH\', String(index));',
  },
  {
    id: 'append-only-revision-gap-check-removed',
    find: "  if (hashCanonicalValue(payload.fromRevision) !== hashCanonicalValue(previousRevision)) {\n    fail('E_ATLAS_ANCHOR_LINEAGE_REVISION_GAP');\n  }",
    replace: "  if (false) {\n    fail('E_ATLAS_ANCHOR_LINEAGE_REVISION_GAP');\n  }",
  },
]);

const BASE_REVISION = Object.freeze({
  domain: { projectId: 'mutant-project', entityId: 'scene-a' },
  projectRevision: 1,
  entityRevision: 1,
  sourceRevision: 1,
  generation: 0,
  writerEpoch: 0,
});

function identityInput() {
  return {
    anchorId: 'mutant-anchor',
    projectId: 'mutant-project',
    sceneId: 'scene-a',
    birthRevision: BASE_REVISION,
    quote: 'must-remain-witness-only',
  };
}

async function assertWp400Oracle(module) {
  const identity = module.createDurableAnchorIdentity(identityInput());
  assert.equal('quote' in identity, false);
  const witness = module.createRelocationWitness(identity, 'Anna arrived.', { startOffset: 0, endOffset: 4 }, BASE_REVISION);
  assert.throws(
    () => module.validateRelocationWitness({ ...witness, quoteHash: '0'.repeat(64) }, identity),
    (error) => error.code === 'E_ATLAS_ANCHOR_WITNESS_QUOTE_HASH_MISMATCH',
  );

  const laterRevision = { ...BASE_REVISION, projectRevision: 2, entityRevision: 2 };
  const lost = module.relocateAnchor({ identity, witness, targetRevision: laterRevision, currentSceneText: 'Nobody came.' });
  assert.equal(lost.status, 'lost');

  const neutralWitness = { ...witness, prefixContextHash: '0'.repeat(64), suffixContextHash: '0'.repeat(64) };
  const ambiguous = module.relocateAnchor({ identity, witness: neutralWitness, targetRevision: laterRevision, currentSceneText: 'Anna Anna' });
  assert.equal(ambiguous.status, 'ambiguous');
  assert.equal(ambiguous.automaticReattachment, false);
  assert.equal(ambiguous.requiresExplicitSelection, true);
  assert.throws(
    () => module.relocateAnchor({
      identity,
      witness: neutralWitness,
      targetRevision: laterRevision,
      currentSceneText: 'Anna Anna',
      selectedCandidateId: 'not-a-candidate',
    }),
    (error) => error.code === 'E_ATLAS_ANCHOR_SELECTION_NOT_A_CANDIDATE',
  );

  const empty = module.createAnchorLineage(identity);
  const first = module.appendAnchorLineageEntry(empty, {
    toRevision: laterRevision,
    status: 'exact',
    basis: 'explicit-selection',
    selectionRequired: true,
    selectedCandidateId: ambiguous.candidates[0].candidateId,
    span: { startOffset: 0, endOffset: 4 },
  });
  const rewritten = JSON.parse(JSON.stringify(first));
  rewritten.entries[0].basis = 'rewritten';
  assert.throws(() => module.verifyAnchorLineage(rewritten), (error) => error.code === 'E_ATLAS_ANCHOR_LINEAGE_ENTRY_HASH_MISMATCH');
  assert.throws(
    () => module.appendAnchorLineageEntry(first, {
      fromRevision: BASE_REVISION,
      toRevision: { ...laterRevision, projectRevision: 3, entityRevision: 3 },
      status: 'lost',
    }),
    (error) => error.code === 'E_ATLAS_ANCHOR_LINEAGE_REVISION_GAP',
  );
}

async function loadMutant(source, mutant) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-wp400-mutant-'));
  const coreDir = path.join(dir, 'core');
  fs.mkdirSync(coreDir, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'src', 'core', 'browser-safe-hash.mjs'), path.join(coreDir, 'browser-safe-hash.mjs'));
  const target = path.join(coreDir, 'atlas-anchor-lineage-v1.mjs');
  fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
  return { dir, module: await import(`${pathToFileURL(target).href}?mutant=${encodeURIComponent(mutant.id)}`) };
}

test('WP-400 implementation mutants: every required invariant has an executed kill oracle', async () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  await assertWp400Oracle(await import(pathToFileURL(MODULE_PATH).href));
  const results = [];
  for (const mutant of MUTANTS) {
    const occurrences = source.split(mutant.find).length - 1;
    assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
    const loaded = await loadMutant(source, mutant);
    let killed = false;
    let detail = 'survived';
    try {
      await assertWp400Oracle(loaded.module);
    } catch (error) {
      killed = true;
      detail = error.code || error.message;
    } finally {
      fs.rmSync(loaded.dir, { recursive: true, force: true });
    }
    results.push({ id: mutant.id, killed, detail });
  }
  const survived = results.filter((result) => !result.killed);
  console.log(`R24_WP400_MUTATION_RECEIPT=${JSON.stringify({
    total: results.length,
    killed: results.length - survived.length,
    survived: survived.map((result) => result.id),
    score: results.length ? (results.length - survived.length) / results.length : 0,
  })}`);
  assert.equal(results.length > 0, true, 'zero denominator forbidden');
  assert.deepEqual(survived, []);
});
