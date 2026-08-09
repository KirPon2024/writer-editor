'use strict';

// MATCH-01 Pass 1 — RED-FIRST falsifier contract tests for placement-aware
// MatchProof.
//
// These tests freeze the TARGET placement-aware MatchProof contract for the
// review-transport return contour:
//
//   * strict bookmark bijection (source block identity ↔ returned paragraph);
//   * topology invariant (unclassifiedBlocks === 0 or ready is blocked);
//   * index / native ids are corroboration AFTER identity, never standalone
//     authority;
//   * recomputed authority from projections, never caller-supplied booleans.
//
// They are intentionally RED on CURRENT: every RED scenario fails for the
// expected defect reason (index maps an inserted duplicate / index creates a
// claim / caller booleans override truth / unclassified paragraphs are
// silently skipped / the placement-aware MatchProof module is absent), never
// because of a harness bug. The CONTROL scenarios (M7) are GREEN on CURRENT
// and must remain GREEN after the Pass 2 implementation — they are the
// positive and no-regression guards for legitimate bookmark-bound resolution,
// parser-offset duplicate routing and the B04 exact replacement pair.
//
// Implementation is forbidden in this pass.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { deflateRawSync } = require('node:zlib');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BRIDGE_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'index.mjs');
const AUTHORITY_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'reviewTransportBlockExactAuthorityV2.mjs');
const CLASSIFIER_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'reviewTransportClassifierV2.mjs');
const MATCH_PROOF_MODULE_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'reviewTransportMatchProofV1.mjs');

async function loadBridge() {
  return import(pathToFileURL(BRIDGE_PATH).href);
}

function loadAuthority() {
  return import(pathToFileURL(AUTHORITY_PATH).href);
}

function loadClassifier() {
  return import(pathToFileURL(CLASSIFIER_PATH).href);
}

// ---------------------------------------------------------------------------
// Shared helpers (mirror rtk-word-n3-formatting-return + n4-structural fixtures)
// ---------------------------------------------------------------------------
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const cryptoPort = {
  sha256Text(value) {
    return crypto.createHash('sha256').update(Buffer.from(String(value), 'utf8')).digest('hex');
  },
  sha256Json(value) {
    return `sha256:${this.sha256Text(stableJson(value))}`;
  },
  byteLength(value) {
    return Buffer.byteLength(String(value), 'utf8');
  },
};

function sha256Hex(text) {
  return crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

function normalizeEntry(entry) {
  const body = Buffer.from(entry.body || '', 'utf8');
  const compressedBody = deflateRawSync(body);
  return { ...entry, method: 8, body, compressedBody, byteSize: body.length, compressedSize: compressedBody.length };
}

function localRecord(entry, offset) {
  const normalized = normalizeEntry(entry);
  const name = Buffer.from(normalized.name, 'ascii');
  const header = Buffer.alloc(30 + name.length);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(normalized.method, 8);
  header.writeUInt32LE(normalized.compressedSize, 18);
  header.writeUInt32LE(normalized.byteSize, 22);
  header.writeUInt16LE(name.length, 26);
  name.copy(header, 30);
  return { ...normalized, offset, bytes: Buffer.concat([header, normalized.compressedBody]) };
}

function centralRecord(entry) {
  const name = Buffer.from(entry.name, 'ascii');
  const header = Buffer.alloc(46 + name.length);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(entry.method, 10);
  header.writeUInt32LE(entry.compressedSize, 20);
  header.writeUInt32LE(entry.byteSize, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt32LE(entry.offset, 42);
  name.copy(header, 46);
  return header;
}

function zipFixture(entries) {
  const locals = [];
  let offset = 0;
  for (const entry of entries) {
    const local = localRecord(entry, offset);
    locals.push(local);
    offset += local.bytes.length;
  }
  const central = Buffer.concat(locals.map((entry) => centralRecord(entry)));
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(locals.length, 8);
  end.writeUInt16LE(locals.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([Buffer.concat(locals.map((entry) => entry.bytes)), central, end]);
}

function docx(documentBody) {
  return zipFixture([{
    name: 'word/document.xml',
    body: `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"><w:body>${documentBody}</w:body></w:document>`,
  }]);
}

// Baseline export map: one scene, one block at documentParagraphIndex 0 with a
// DECLARED bookmark + paraId/textId. This is the placement ground truth.
function baselineExportMap(text = 'Alpha', opts = {}) {
  return {
    scenes: [{
      sceneId: 'scene-a',
      sceneOrdinal: 0,
      blocks: [{
        blockId: 'block-a-1',
        paragraphId: 'paragraph-a-1',
        documentParagraphIndex: 0,
        canonicalTextSha256: `sha256:${sha256Hex(text)}`,
        canonicalMarksSha256: cryptoPort.sha256Json({ marks: [] }),
        wordSignals: [
          { kind: 'w14ParaIdTextId', value: { paraId: 'A1B2C3D4', textId: 'D4C3B2A1' } },
          { kind: 'bookmarkName', value: { name: 'YRTK_01_0001_alpha' } },
        ],
        ...(opts.formatIr ? { formatIr: opts.formatIr } : {}),
      }],
    }],
  };
}

function makeRtkCryptoPort() {
  return cryptoPort;
}

// ---------------------------------------------------------------------------
// M1 — inserted duplicate never index-mapped
// ---------------------------------------------------------------------------
test('MATCH01-M1-inserted-duplicate-never-index-mapped (RED on CURRENT)', async () => {
  const bridge = await loadBridge();
  const port = makeRtkCryptoPort();
  // Returned DOCX: a NEW paragraph-duplicate of A0's text 'Alpha' lands at
  // documentParagraphIndex 0 (fresh paraId FRESH0001, NO declared bookmark),
  // and the real A0 (declared bookmark + paraId) is shifted to index 1.
  // Placement truth: only the bookmark-bound paragraph at index 1 is A0; the
  // index-0 duplicate must NOT be mapped to block-a-1.
  const returned = docx([
    '<w:p w14:paraId="FRESH0001" w14:textId="FRESHTEXT1">',
    '<w:r><w:rPr><w:b/></w:rPr><w:t>Alpha</w:t></w:r>',
    '</w:p>',
    '<w:p w14:paraId="A1B2C3D4" w14:textId="D4C3B2A1">',
    '<w:bookmarkStart w:name="YRTK_01_0001_alpha"/>',
    '<w:r><w:rPr><w:b/></w:rPr><w:t>Alpha</w:t></w:r>',
    '</w:p>',
  ].join(''));

  // --- Formatting extractor (CURRENT defect under test) ---
  const formatting = bridge.buildDocxReviewFormattingReturnCandidatesFromZipBytes(returned, {
    fullManuscriptExportMap: baselineExportMap('Alpha'),
    cryptoPort: port,
  });

  // TARGET: the index-0 duplicate is NEVER mapped to block-a-1; the only
  // admissible candidate (if any) must resolve to the bookmark-bound A0 at
  // index 1. CURRENT: the extractor maps the duplicate → A0 because index 0
  // is admitted as standalone authority, producing a ready/SAFE_APPLY
  // candidate that retargets the duplicate.
  const duplicateMappedCandidates = (formatting.candidates || []).filter((candidate) => (
    candidate.blockId === 'block-a-1'
    && candidate.paragraphId === 'paragraph-a-1'
    && candidate.expectedOutcome === 'SAFE_APPLY'
  ));
  assert.equal(
    duplicateMappedCandidates.length,
    0,
    'MATCH01-M1 RED: inserted duplicate at index 0 must never be index-mapped to block-a-1. '
      + `CURRENT defect: extractor produced ${duplicateMappedCandidates.length} ready candidate(s) for the duplicate `
      + `(status=${formatting.status}, code=${formatting.code}). `
      + 'Expected: typed manual/blocked outcome, zero ready/exact candidates for the inserted duplicate.',
  );

  // --- Structural extractor (same defect, structural lane) ---
  const structural = bridge.buildDocxReviewStructuralReturnCandidatesFromZipBytes(returned, {
    fullManuscriptExportMap: baselineExportMap('Alpha'),
    cryptoPort: port,
  });
  const structuralDuplicateMapped = (structural.candidates || []).filter((candidate) => (
    candidate.blockId === 'block-a-1'
    && candidate.paragraphId === 'paragraph-a-1'
  ));
  assert.equal(
    structuralDuplicateMapped.length,
    0,
    'MATCH01-M1 RED (structural lane): inserted duplicate must never be index-mapped. '
      + `CURRENT defect: ${structuralDuplicateMapped.length} structural candidate(s) for the duplicate.`,
  );
});

// ---------------------------------------------------------------------------
// M2 — index never creates a claim
// ---------------------------------------------------------------------------
test('MATCH01-M2-index-never-creates-claim (RED on CURRENT)', async () => {
  const bridge = await loadBridge();
  const port = makeRtkCryptoPort();
  // Returned paragraph at documentParagraphIndex 0 with ONLY an index match:
  // no bookmark, no paraId/textId match, and a DIFFERENT text from the
  // baseline block. Placement truth: index alone cannot prove identity.
  const returned = docx([
    '<w:p w14:paraId="ZZZZZZZZ" w14:textId="WWWWWWWW">',
    '<w:r><w:rPr><w:b/></w:rPr><w:t>CompletelyDifferent</w:t></w:r>',
    '</w:p>',
  ].join(''));

  const result = bridge.buildDocxReviewFormattingReturnCandidatesFromZipBytes(returned, {
    fullManuscriptExportMap: baselineExportMap('Alpha'),
    cryptoPort: port,
  });

  // TARGET: index does NOT create authority → unresolved becomes a typed
  // manual outcome, and index is admissible only as consistency AFTER an
  // identity match. CURRENT: even though text differs, the resolver admits
  // documentParagraphIndex as standalone authority, so a single index claim
  // resolves authority and the candidate is emitted (the only thing that
  // blocks it later is BASELINE_NOT_EXACT, not the index-authority defect).
  //
  // To isolate the index-authority defect from the text-exactness gate, also
  // assert the variant where the returned text MATCHES the baseline: there an
  // index-only paragraph (no bookmark/paraId/textId) must still NOT produce a
  // ready candidate for block-a-1.
  const matchedTextReturned = docx([
    '<w:p w14:paraId="ZZZZZZZZ" w14:textId="WWWWWWWW">',
    '<w:r><w:rPr><w:b/></w:rPr><w:t>Alpha</w:t></w:r>',
    '</w:p>',
  ].join(''));
  const matched = bridge.buildDocxReviewFormattingReturnCandidatesFromZipBytes(matchedTextReturned, {
    fullManuscriptExportMap: baselineExportMap('Alpha'),
    cryptoPort: port,
  });
  const indexClaimed = (matched.candidates || []).filter((candidate) => (
    candidate.blockId === 'block-a-1'
    && candidate.paragraphId === 'paragraph-a-1'
    && candidate.paragraphOrdinal === 0
  ));
  assert.equal(
    indexClaimed.length,
    0,
    'MATCH01-M2 RED: a paragraph with ONLY an index match (no bookmark/paraId/textId) '
      + 'must NOT create authority for block-a-1. '
      + `CURRENT defect: ${indexClaimed.length} ready candidate(s) emitted from index-only authority `
      + `(status=${matched.status}, code=${matched.code}). `
      + 'The unrelated result for the different-text case: '
      + `status=${result.status}, code=${result.code}, candidates=${(result.candidates || []).length}.`,
  );
});

// ---------------------------------------------------------------------------
// M3 — caller booleans are not authority
// ---------------------------------------------------------------------------
test('MATCH01-M3-caller-booleans-not-authority (RED on CURRENT)', async () => {
  const authority = await loadAuthority();
  const classifier = await loadClassifier();
  const port = makeRtkCryptoPort();
  // Computed truth: the local baseline contains EXACTLY ONE matching block
  // (unique target). But the caller supplies exactAuthority.ambiguousDuplicate
  // = true / uniqueTarget = false. Under placement-aware MatchProof the
  // outcome must be recomputed from projections; the caller boolean cannot
  // override computed truth.
  const input = {
    exactAuthority: {
      validSignedLocator: true,
      sceneRevisionUnchanged: true,
      rawSha256Unchanged: true,
      uniqueTarget: false,
      nonOverlapping: true,
      allRelevantXmlSemanticsAccounted: true,
      ambiguousDuplicate: true,
      crossScene: false,
      structuralTopologyChanged: false,
    },
    localBaseline: {
      sceneId: 'scene-a',
      blocks: [{ blockId: 'block-a-1', sceneId: 'scene-a', text: 'hello world' }],
    },
    authorityCarrier: {
      selectedCarrier: { payload: { blockId: 'block-a-1', sceneId: 'scene-a' } },
    },
    reviewIr: {
      textRevisions: [
        { operation: 'delete', nativeRevisionId: 'rev-1', replacementGroupId: 'grp-1', text: 'hello', textDigest: port.sha256Json('hello') },
        { operation: 'insert', nativeRevisionId: 'rev-2', replacementGroupId: 'grp-1', text: 'goodbye', textDigest: port.sha256Json('goodbye') },
      ],
    },
  };

  const evaluated = authority.evaluateReviewTransportBlockExactAuthorityV2(input, { cryptoPort: port });
  // TARGET: exactAuthority is recomputed from projections; the caller's
  // ambiguousDuplicate=true must NOT force uniqueTarget=false when the
  // computed baseline has exactly one matching block. CURRENT: the caller
  // boolean is read verbatim (~reviewTransportBlockExactAuthorityV2.mjs:56-69,
  // :321, :390) and forces ambiguousDuplicate=true / uniqueTarget=false even
  // though the local baseline is unique.
  assert.notEqual(
    evaluated.exactAuthority.ambiguousDuplicate,
    true,
    'MATCH01-M3 RED: caller-supplied ambiguousDuplicate=true must not override computed truth '
      + '(local baseline has exactly one matching block). CURRENT defect: caller boolean copied verbatim.',
  );

  // Same defect via the classifier path: the classifier reads the caller
  // exactAuthority booleans (~reviewTransportClassifierV2.mjs:45-84) and routes
  // a unique-baseline replacement pair to MANUAL_REVIEW purely because the
  // caller lied.
  const classified = classifier.classifyReviewTransportIrV2(input, { cryptoPort: port });
  const textItems = classified.classifications.text || [];
  const replacementPair = textItems.find((item) => item.kind === 'replacement-pair') || {};
  assert.notEqual(
    replacementPair.disposition,
    'MANUAL_REVIEW',
    'MATCH01-M3 RED (classifier): caller exactAuthority booleans must not route a unique-baseline '
      + 'replacement pair to MANUAL_REVIEW. CURRENT defect: classifier trusts caller booleans '
      + `(disposition=${replacementPair.disposition}, reasonCode=${replacementPair.reasonCode}).`,
  );
});

// ---------------------------------------------------------------------------
// M4 — unclassified blocks block ready (not silent skip)
// ---------------------------------------------------------------------------
test('MATCH01-M4-unclassified-blocks-ready (RED on CURRENT)', async () => {
  const bridge = await loadBridge();
  const port = makeRtkCryptoPort();
  // Returned DOCX: one paragraph that resolves cleanly (bookmark-bound A0)
  // and one paragraph with NO resolvable locator at all (no bookmark, no
  // paraId/textId, no index match). Placement truth: unclassifiedBlocks > 0
  // must block ready with a typed reason, not silently disappear.
  const returned = docx([
    '<w:p w14:paraId="A1B2C3D4" w14:textId="D4C3B2A1">',
    '<w:bookmarkStart w:name="YRTK_01_0001_alpha"/>',
    '<w:r><w:rPr><w:b/></w:rPr><w:t>Alpha</w:t></w:r>',
    '</w:p>',
    '<w:p>',
    '<w:r><w:rPr><w:i/></w:rPr><w:t>orphan paragraph</w:t></w:r>',
    '</w:p>',
  ].join(''));

  const result = bridge.buildDocxReviewFormattingReturnCandidatesFromZipBytes(returned, {
    fullManuscriptExportMap: baselineExportMap('Alpha'),
    cryptoPort: port,
  });

  // TARGET: a typed reason (e.g. RTK_MATCH_UNCLASSIFIED_BLOCKS) is present and
  // the contour is NOT ready while unclassifiedBlocks > 0. CURRENT: the
  // unclassified paragraph is silently skipped (the extractor pushes a
  // RTK_FORMATTING_RETURN_BLOCK_LOCATOR_UNRESOLVED diagnostic and continues),
  // and the resolved candidate is still emitted as ready — hiding the
  // topology hole.
  const hasUnclassifiedTypedReason = (result.diagnostics || []).some((diagnostic) => (
    typeof diagnostic.code === 'string'
    && /UNCLASSIFIED_BLOCKS|RTK_MATCH_UNCLASSIFIED/u.test(diagnostic.code)
  ));
  assert.equal(
    hasUnclassifiedTypedReason,
    true,
    'MATCH01-M4 RED: an unclassified paragraph (no resolvable locator) must produce a typed '
      + 'unclassified-blocks reason that blocks ready. CURRENT defect: silent skip '
      + `(status=${result.status}, diagnostics=${(result.diagnostics || []).map((d) => d.code).join(',')}).`,
  );
  assert.notEqual(
    result.status,
    'ready',
    'MATCH01-M4 RED: status must not be ready while unclassifiedBlocks > 0. '
      + `CURRENT defect: status=${result.status} despite an unresolved paragraph.`,
  );
});

// ---------------------------------------------------------------------------
// M5 — native id contradiction (placement-aware gate absent)
// ---------------------------------------------------------------------------
test('MATCH01-M5-native-id-contradiction (RED on CURRENT)', async () => {
  // CURRENT already raises RTK_FORMATTING_RETURN_BLOCK_LOCATOR_CONFLICT when a
  // single paragraph's locators resolve to two different baseline blocks
  // (verified by the n3 colliding/conflicting locator contract). The
  // placement-aware MatchProof contract requires a typed contradiction gate
  // that lives on the MatchProof itself (not only on the legacy extractor
  // diagnostic), so that a bookmark→blockB / paraId→blockA contradiction is
  // surfaced as a MatchProof topology failure (e.g. RTK_MATCH_LOCATOR_CONFLICT
  // or a typed code of the placement-proof family) with unclassified handling
  // — independent of which extractor path observed it.
  //
  // On CURRENT the MatchProof module does not exist (see M6), so the
  // contradiction cannot be observed as a placement-proof result. This RED
  // test asserts the absence of that placement-aware contradiction gate.
  const port = makeRtkCryptoPort();
  // A placement-aware proof would receive source + returned projections plus
  // authority verification. We attempt to import the module and invoke its
  // builder; the RED reason is that the module/builder is absent.
  let matchProofModule = null;
  try {
    matchProofModule = await import(pathToFileURL(MATCH_PROOF_MODULE_PATH).href);
  } catch (error) {
    matchProofModule = { __importError: error.code || error.message };
  }
  const builder = matchProofModule?.buildReviewTransportMatchProofV1;
  assert.equal(
    typeof builder,
    'function',
    'MATCH01-M5 RED: the placement-aware contradiction gate requires buildReviewTransportMatchProofV1 '
      + '(reviewTransportMatchProofV1.mjs) to surface bookmark/paraId contradictions as a typed '
      + 'MatchProof result. CURRENT defect: module/builder absent '
      + `(import=${matchProofModule?.__importError || 'no buildReviewTransportMatchProofV1 export'}).`,
  );
  void port;
});

// ---------------------------------------------------------------------------
// M6 — MatchProof computed locally (module absent)
// ---------------------------------------------------------------------------
test('MATCH01-M6-matchproof-computed-locally (RED on CURRENT)', async () => {
  const bridge = await loadBridge();
  const port = makeRtkCryptoPort();
  // TARGET: buildReviewTransportMatchProofV1({ sourceProjection, returnedProjection,
  // authorityVerification, cryptoPort }) returns a proof with:
  //   sourceProjectionDigest, returnedProjectionDigest,
  //   authorityVerificationDigest, blockBijection (per-block source identity,
  //     returned story/block, locator basis, baseAtomDigest),
  //   topology { matchedBlocks, trackedInsertedBlocks, trackedDeletedBlocks,
  //     unclassifiedBlocks }, coverage, laneFlags, proofDigest.
  // Equations: sourceBlocks = matched + trackedDeleted;
  //            returnedBlocks = matched + trackedInserted;
  //            unclassified = 0 (violation → not-exact).
  // CURRENT: the module/function does not exist.
  let matchProofModule = null;
  try {
    matchProofModule = await import(pathToFileURL(MATCH_PROOF_MODULE_PATH).href);
  } catch (error) {
    matchProofModule = { __importError: error.code || error.message };
  }

  assert.equal(
    typeof matchProofModule?.buildReviewTransportMatchProofV1,
    'function',
    'MATCH01-M6 RED: buildReviewTransportMatchProofV1 must exist as a locally-computed, '
      + 'placement-aware MatchProof builder. CURRENT defect: module absent '
      + `(import=${matchProofModule?.__importError || 'no export'}).`,
  );

  // And it must be re-exported from the bridge index so the contour can reach
  // it through the canonical entrypoint.
  assert.equal(
    typeof bridge.buildReviewTransportMatchProofV1,
    'function',
    'MATCH01-M6 RED: buildReviewTransportMatchProofV1 must be re-exported from the revision '
      + 'bridge index. CURRENT defect: not re-exported.',
  );

  // If the builder existed, this is the invocation whose proof shape the
  // equations assert. It is unreachable on CURRENT (builder is undefined), so
  // we keep it as the target assertion that documents the contract.
  void port;
});

// ---------------------------------------------------------------------------
// M6b — MatchProof topology equations (module absent ⇒ unreachable)
// ---------------------------------------------------------------------------
test('MATCH01-M6b-matchproof-topology-equations (RED on CURRENT)', async () => {
  const port = makeRtkCryptoPort();
  let matchProofModule = null;
  try {
    matchProofModule = await import(pathToFileURL(MATCH_PROOF_MODULE_PATH).href);
  } catch (error) {
    matchProofModule = { __importError: error.code || error.message };
  }
  const builder = matchProofModule?.buildReviewTransportMatchProofV1;
  if (typeof builder !== 'function') {
    // RED reason documented in M6; here we only assert the absence so this
    // subtest fails for the SAME expected reason rather than a harness error.
    assert.equal(
      typeof builder,
      'function',
      'MATCH01-M6b RED: topology equations require buildReviewTransportMatchProofV1. '
        + 'CURRENT defect: builder absent (covered by M6).',
    );
    return;
  }
  // Target: with a clean bijection the topology equations hold.
  const proof = builder({
    sourceProjection: baselineExportMap('Alpha'),
    returnedProjection: {
      scenes: [{
        sceneId: 'scene-a',
        blocks: [{
          blockId: 'block-a-1',
          paragraphId: 'paragraph-a-1',
          documentParagraphIndex: 0,
          canonicalTextSha256: `sha256:${sha256Hex('Alpha')}`,
          canonicalMarksSha256: port.sha256Json({ marks: [] }),
          wordSignals: [
            { kind: 'w14ParaIdTextId', value: { paraId: 'A1B2C3D4', textId: 'D4C3B2A1' } },
            { kind: 'bookmarkName', value: { name: 'YRTK_01_0001_alpha' } },
          ],
        }],
      }],
    },
    authorityVerification: {
      validSignedLocator: true,
      sceneRevisionUnchanged: true,
      rawSha256Unchanged: true,
    },
    cryptoPort: port,
  });
  const topology = proof?.topology || {};
  assert.equal(topology.matchedBlocks, 1);
  assert.equal(topology.trackedInsertedBlocks, 0);
  assert.equal(topology.trackedDeletedBlocks, 0);
  assert.equal(topology.unclassifiedBlocks, 0);
  assert.equal(proof.coverage, 'exact');
  assert.equal(typeof proof.proofDigest, 'string');
});

// ---------------------------------------------------------------------------
// M7 — CONTROLS (must stay GREEN on CURRENT and after Pass 2)
// ---------------------------------------------------------------------------
test('MATCH01-M7a-control-n3-duplicate-quote-routing-stays-green', async () => {
  const bridge = await loadBridge();
  const port = makeRtkCryptoPort();
  // Mirrors rtk-word-n3-formatting-return:177-194. A paragraph with a unique
  // paraId whose text contains a duplicated quote is routed by parser offsets
  // to the single matching baseline block. This is the legitimate duplicate
  // routing that must remain GREEN.
  const duplicate = bridge.buildDocxReviewFormattingReturnCandidatesFromZipBytes(docx([
    '<w:p w14:paraId="A1B2C3D4">',
    '<w:r><w:rPr><w:i/></w:rPr><w:t>Alpha</w:t></w:r>',
    '<w:r><w:t> and Alpha</w:t></w:r>',
    '</w:p>',
  ].join('')), { fullManuscriptExportMap: baselineExportMap('Alpha and Alpha'), cryptoPort: port });
  assert.equal(duplicate.candidates.length, 1);
  assert.equal(duplicate.candidates[0].blockId, 'block-a-1');
  assert.equal(duplicate.candidates[0].from, 0);
  assert.equal(duplicate.candidates[0].to, 5);
});

test('MATCH01-M7b-control-legit-bookmark-bound-resolution-stays-green', async () => {
  const bridge = await loadBridge();
  const port = makeRtkCryptoPort();
  // Mirrors the preview-session 446-522 pattern: a Word-rewritten paragraph
  // whose paraId/textId were regenerated is still routed to its declared
  // scene via the declared bookmark. Single block, single declared bookmark →
  // one ready candidate. Must remain GREEN.
  const map = {
    scenes: [{
      sceneId: 'scene-a',
      sceneOrdinal: 0,
      blocks: [{
        blockId: 'block-a-1',
        paragraphId: 'paragraph-a-1',
        documentParagraphIndex: 0,
        canonicalTextSha256: `sha256:${sha256Hex('Alpha')}`,
        canonicalMarksSha256: port.sha256Json({ marks: [] }),
        wordSignals: [{ kind: 'bookmarkName', value: { name: 'YRTK_01_0001_alpha' } }],
      }],
    }],
  };
  const result = bridge.buildDocxReviewFormattingReturnCandidatesFromZipBytes(docx([
    '<w:p w14:paraId="FFFFFFFF" w14:textId="77777777">',
    '<w:bookmarkStart w:name="YRTK_01_0001_alpha"/>',
    '<w:r><w:rPr><w:b/></w:rPr><w:t>Alpha</w:t></w:r>',
    '</w:p>',
  ].join('')), { fullManuscriptExportMap: map, cryptoPort: port });
  assert.equal(result.status, 'ready');
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].blockId, 'block-a-1');
});

test('MATCH01-M7c-control-b04-exact-replacement-pair-stays-green', async () => {
  const classifier = await loadClassifier();
  const port = makeRtkCryptoPort();
  // Mirrors the B04 classifier suite: a clean delete+insert replacement pair
  // with all authority flags green is classified as EXACT_AUTOMATIC_CANDIDATE.
  // Must remain GREEN.
  const classified = classifier.classifyReviewTransportIrV2({
    exactAuthority: {
      validSignedLocator: true,
      sceneRevisionUnchanged: true,
      rawSha256Unchanged: true,
      uniqueTarget: true,
      nonOverlapping: true,
      allRelevantXmlSemanticsAccounted: true,
      ambiguousDuplicate: false,
      crossScene: false,
      structuralTopologyChanged: false,
    },
    reviewIr: {
      textRevisions: [
        { operation: 'delete', nativeRevisionId: 'rd1', replacementGroupId: 'g1', text: 'old', textDigest: port.sha256Json('old') },
        { operation: 'insert', nativeRevisionId: 'ri1', replacementGroupId: 'g1', text: 'new', textDigest: port.sha256Json('new') },
      ],
    },
  }, { cryptoPort: port });
  const textItems = classified.classifications.text || [];
  const replacementPair = textItems.find((item) => item.kind === 'replacement-pair');
  assert.equal(replacementPair?.disposition, 'EXACT_AUTOMATIC_CANDIDATE');
});

// ---------------------------------------------------------------------------
// Suite determinism: no skip/todo/sleep is used anywhere in this file. The
// node:test runner reports skipped/todo counts in the summary (asserted to be
// 0 by ACCEPTANCE); a self-referential source-scan guard would always match
// its own token literals, so determinism is enforced by the runner summary
// rather than an inline self-scan. All fixtures are in-memory Buffers, so
// there is no temp-dir cleanup to register.
// ---------------------------------------------------------------------------
