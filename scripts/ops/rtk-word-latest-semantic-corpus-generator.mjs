#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SECURE_MOUNT = '/Volumes/T7-Secure';
const SECURE_UUID = 'D1F2E2C1-3210-4A39-A4E0-0AA0AD5110E2';
const DEFAULT_ARTIFACT_ROOT = '/Volumes/T7-Secure/storage/yalken/word-latest-semantic-v2/current';
const MATRIX_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_LATEST_SEMANTIC_ROUNDTRIP_V2_B00_MATRIX.json');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_LATEST_SEMANTIC_ROUNDTRIP_V2_B00_DESIGN_RECEIPT.json');

export const WORD_LATEST_SEMANTIC_PROFILE_ID = 'word-mac-latest-16.111.2-semantic-v2';

export const REQUIRED_IR_RECORDS = Object.freeze([
  'TextRevision',
  'MoveRevision',
  'PropertyRevision',
  'StructureChange',
  'CommentThread',
  'FormattingDelta',
  'OpaqueUnsupported',
]);

export const REQUIRED_PAIN_IDS = Object.freeze([
  'P0-01',
  'P0-02',
  'P0-03',
  'P0-04',
  'P0-05',
  'P0-06',
  'P0-07',
  'P0-08',
  'P0-09',
  'P0-10',
  'P0-11',
  'P0-12',
  'P0-13',
  'P0-14',
  'P0-15',
  'P0-16',
  'P0-17',
  'P0-18',
  'P1-19',
  'P1-20',
]);

const BASE_PARAGRAPHS = Object.freeze([
  'Alpha repeats near the opening so locator ambiguity must be explicit.',
  'Russian synthetic line: elka, yo, quotes, dash, NBSP marker, and punctuation.',
  'English synthetic line with apostrophes, tabs, and repeated anchor text.',
  'Unicode synthetic line: cafe\u0301, emoji \uD83D\uDE80, ZWJ family, ZWNJ, ZWSP, soft\u00ADhyphen, RTL \u202Bשלום\u202C, CJK 短文.',
  'Final paragraph repeats Alpha and keeps scene boundary pressure visible.',
]);

const CASES = Object.freeze([
  {
    id: 'WL2-001',
    title: 'insert at beginning middle and end',
    family: 'basic text insert delete replace',
    requiredPhysicalActions: ['track-changes-on', 'insert-beginning', 'insert-middle', 'insert-end', 'save', 'close-reopen'],
    expectedLanes: ['manuscriptText', 'revisions'],
    expectedClassificationFloor: 'EXACT_CANDIDATE_AFTER_SIGNED_LOCATOR',
  },
  {
    id: 'WL2-002',
    title: 'delete word sentence and cross-line range',
    family: 'basic text insert delete replace',
    requiredPhysicalActions: ['track-changes-on', 'delete-word', 'delete-sentence', 'delete-cross-line-range', 'save-as', 'close-reopen'],
    expectedLanes: ['manuscriptText', 'revisions'],
    expectedClassificationFloor: 'EXACT_CANDIDATE_AFTER_SIGNED_LOCATOR',
  },
  {
    id: 'WL2-003',
    title: 'replacement pair with provenance',
    family: 'basic text insert delete replace',
    requiredPhysicalActions: ['track-changes-on', 'replace-text', 'save', 'close-reopen'],
    expectedLanes: ['manuscriptText', 'revisions'],
    expectedClassificationFloor: 'EXACT_CANDIDATE_AFTER_GROUP_GUARDS',
  },
  {
    id: 'WL2-004',
    title: 'repeated passages attack locator ambiguity',
    family: 'repeated text locator ambiguity',
    requiredPhysicalActions: ['track-changes-on', 'edit-duplicate-anchor', 'copy-paste-duplicate', 'save', 'close-reopen'],
    expectedLanes: ['locatorSurvival', 'manuscriptText'],
    expectedClassificationFloor: 'MANUAL_OR_BLOCKED_WHEN_NOT_UNIQUE',
  },
  {
    id: 'WL2-005',
    title: 'paragraph split and merge',
    family: 'paragraph split merge paragraph mark delete',
    requiredPhysicalActions: ['track-changes-on', 'split-paragraph', 'merge-paragraphs', 'save', 'close-reopen'],
    expectedLanes: ['structure', 'revisions'],
    expectedClassificationFloor: 'MANUAL_UNTIL_SINGLE_SCENE_PROVEN',
  },
  {
    id: 'WL2-006',
    title: 'deleted paragraph mark and empty line',
    family: 'paragraph split merge paragraph mark delete',
    requiredPhysicalActions: ['track-changes-on', 'insert-empty-line', 'delete-paragraph-mark', 'save-as', 'close-reopen'],
    expectedLanes: ['structure', 'revisions'],
    expectedClassificationFloor: 'MANUAL_UNTIL_SINGLE_SCENE_PROVEN',
  },
  {
    id: 'WL2-007',
    title: 'word and paragraph move',
    family: 'moves and cross-scene moves',
    requiredPhysicalActions: ['track-changes-on', 'move-word', 'move-paragraph', 'save', 'close-reopen'],
    expectedLanes: ['structure', 'revisions'],
    expectedClassificationFloor: 'MANUAL_OR_BLOCKED_NOT_EXACT',
  },
  {
    id: 'WL2-008',
    title: 'attempted cross-scene move',
    family: 'moves and cross-scene moves',
    requiredPhysicalActions: ['track-changes-on', 'move-across-scene-boundary', 'save', 'close-reopen'],
    expectedLanes: ['structure', 'locatorSurvival'],
    expectedClassificationFloor: 'BLOCKED',
  },
  {
    id: 'WL2-009',
    title: 'Track Changes off clean edit',
    family: 'Track Changes on off mixed accept reject',
    requiredPhysicalActions: ['track-changes-off', 'clean-edit', 'save', 'close-reopen'],
    expectedLanes: ['manuscriptText'],
    expectedClassificationFloor: 'MANUAL_OR_EXACT_AFTER_CLEAN_DRIFT_GUARDS',
  },
  {
    id: 'WL2-010',
    title: 'mixed tracked and clean edits',
    family: 'Track Changes on off mixed accept reject',
    requiredPhysicalActions: ['track-changes-on', 'tracked-edit', 'track-changes-off', 'clean-edit', 'save', 'close-reopen'],
    expectedLanes: ['manuscriptText', 'revisions'],
    expectedClassificationFloor: 'MIXED_MANUAL_UNTIL_ALL_GUARDS_PASS',
  },
  {
    id: 'WL2-011',
    title: 'accept one reject one accept all reject all',
    family: 'Track Changes on off mixed accept reject',
    requiredPhysicalActions: ['track-changes-on', 'make-four-revisions', 'accept-one', 'reject-one', 'accept-all-copy', 'reject-all-copy', 'save', 'close-reopen'],
    expectedLanes: ['revisions', 'packageSemantics'],
    expectedClassificationFloor: 'MANUAL_OR_ALREADY_RESOLVED',
  },
  {
    id: 'WL2-012',
    title: 'point range and paragraph comments',
    family: 'comments point range paragraph overlap replies resolve reopen delete',
    requiredPhysicalActions: ['add-point-comment', 'add-range-comment', 'add-paragraph-comment', 'save', 'close-reopen'],
    expectedLanes: ['comments'],
    expectedClassificationFloor: 'COMMENTS_ONLY_UNTIL_TEXT_GUARDS',
  },
  {
    id: 'WL2-013',
    title: 'multiple and overlapping comment anchors',
    family: 'comments point range paragraph overlap replies resolve reopen delete',
    requiredPhysicalActions: ['add-multiple-comments', 'add-overlapping-comment-if-word-permits', 'save-as', 'close-reopen'],
    expectedLanes: ['comments', 'locatorSurvival'],
    expectedClassificationFloor: 'COMMENTS_ONLY_OR_ORPHAN',
  },
  {
    id: 'WL2-014',
    title: 'three-level reply chain with participant identities',
    family: 'comments point range paragraph overlap replies resolve reopen delete',
    requiredPhysicalActions: ['add-comment', 'reply-level-1', 'reply-level-2', 'reply-level-3-if-word-permits', 'save', 'close-reopen'],
    expectedLanes: ['comments'],
    expectedClassificationFloor: 'COMMENTS_ONLY_OR_TYPED_UNSUPPORTED',
  },
  {
    id: 'WL2-015',
    title: 'resolve reopen and delete comment',
    family: 'comments point range paragraph overlap replies resolve reopen delete',
    requiredPhysicalActions: ['add-three-comments', 'resolve-one', 'reopen-one-if-word-permits', 'delete-one', 'save', 'close-reopen'],
    expectedLanes: ['comments'],
    expectedClassificationFloor: 'COMMENTS_ONLY_OR_TYPED_UNSUPPORTED',
  },
  {
    id: 'WL2-016',
    title: 'comments on inserted deleted and moved text',
    family: 'comment on inserted deleted and moved text',
    requiredPhysicalActions: ['track-changes-on', 'insert-text', 'comment-inserted-text', 'delete-commented-text', 'move-commented-text', 'save', 'close-reopen'],
    expectedLanes: ['comments', 'revisions', 'structure'],
    expectedClassificationFloor: 'COMMENTS_ONLY_OR_ORPHAN_AND_TEXT_MANUAL',
  },
  {
    id: 'WL2-017',
    title: 'modern comments package inventory and failed no-op probe guard',
    family: 'modern comments package inventory',
    requiredPhysicalActions: ['add-visible-comments-in-word-ui', 'save', 'close-reopen', 'inventory-comments-parts'],
    expectedLanes: ['comments', 'packageSemantics'],
    expectedClassificationFloor: 'BLOCKED_IF_NO_COMMENTS_PARTS',
  },
  {
    id: 'WL2-018',
    title: 'inline formatting marks',
    family: 'formatting marks style paragraph and list deltas',
    requiredPhysicalActions: ['bold', 'italic', 'underline', 'strike', 'color', 'highlight', 'font', 'size', 'save', 'close-reopen'],
    expectedLanes: ['formatting'],
    expectedClassificationFloor: 'MANUAL_UNTIL_FORMAT_IR_SUPPORTED',
  },
  {
    id: 'WL2-019',
    title: 'styles alignment lists tabs and hyperlinks',
    family: 'formatting marks style paragraph and list deltas',
    requiredPhysicalActions: ['heading-style', 'paragraph-style', 'alignment', 'list', 'tab', 'hyperlink', 'save-as', 'close-reopen'],
    expectedLanes: ['formatting', 'structure'],
    expectedClassificationFloor: 'MANUAL_UNTIL_FORMAT_IR_SUPPORTED',
  },
  {
    id: 'WL2-020',
    title: 'tables sections footnotes endnotes fields and breaks',
    family: 'tables sections footnotes endnotes fields and breaks',
    requiredPhysicalActions: ['insert-table', 'edit-table-cell', 'section-break', 'page-break', 'footnote', 'endnote', 'field', 'save', 'close-reopen'],
    expectedLanes: ['structure', 'formatting', 'packageSemantics'],
    expectedClassificationFloor: 'MANUAL_OR_BLOCKED',
  },
  {
    id: 'WL2-021',
    title: 'unicode locale and bidi corpus',
    family: 'Unicode locale and bidi',
    requiredPhysicalActions: ['edit-ru-punctuation', 'edit-nbsp', 'edit-soft-hyphen', 'edit-combining-mark', 'edit-emoji', 'edit-bidi', 'edit-cjk', 'save', 'close-reopen'],
    expectedLanes: ['manuscriptText', 'locatorSurvival'],
    expectedClassificationFloor: 'EXACT_CANDIDATE_ONLY_WITH_RAW_UNICODE_GUARDS',
  },
  {
    id: 'WL2-022',
    title: 'stale round tampered manifest and stripped locators',
    family: 'stale tampered stripped duplicate and replay negatives',
    requiredPhysicalActions: ['tamper-customXml-hmac', 'strip-bookmarks', 'stale-baseline-return', 'save', 'close-reopen'],
    expectedLanes: ['packageSemantics', 'locatorSurvival'],
    expectedClassificationFloor: 'BLOCKED',
  },
  {
    id: 'WL2-023',
    title: 'repeated import idempotence',
    family: 'stale tampered stripped duplicate and replay negatives',
    requiredPhysicalActions: ['return-once', 'analyze', 'apply-if-exact', 'return-same-docx-again'],
    expectedLanes: ['manuscriptText', 'comments'],
    expectedClassificationFloor: 'ALREADY_ANALYZED_OR_ALREADY_APPLIED',
  },
  {
    id: 'WL2-024',
    title: 'Word Compare generated revisions',
    family: 'Compare and Combine generated revisions',
    requiredPhysicalActions: ['word-compare-two-synthetic-documents', 'save-compared-output', 'close-reopen'],
    expectedLanes: ['revisions', 'structure'],
    expectedClassificationFloor: 'MANUAL_OR_BLOCKED_NOT_HAND_EDIT',
  },
  {
    id: 'WL2-025',
    title: 'Word Combine generated revisions',
    family: 'Compare and Combine generated revisions',
    requiredPhysicalActions: ['word-combine-two-synthetic-documents', 'save-combined-output', 'close-reopen'],
    expectedLanes: ['revisions', 'structure'],
    expectedClassificationFloor: 'MANUAL_OR_BLOCKED_NOT_HAND_EDIT',
  },
  {
    id: 'WL2-026',
    title: '100k word writer scale text',
    family: '100k and 250k word scale',
    requiredPhysicalActions: ['open-100k-word-docx', 'make-edge-edits', 'save', 'close-reopen'],
    expectedLanes: ['performance', 'manuscriptText', 'locatorSurvival'],
    expectedClassificationFloor: 'MEASURED_ONLY_NO_INVENTED_PASS',
    scaleWords: 100000,
  },
  {
    id: 'WL2-027',
    title: '250k word writer scale text',
    family: '100k and 250k word scale',
    requiredPhysicalActions: ['open-250k-word-docx', 'make-edge-edits', 'save-as', 'close-reopen'],
    expectedLanes: ['performance', 'manuscriptText', 'locatorSurvival'],
    expectedClassificationFloor: 'MEASURED_ONLY_NO_INVENTED_PASS',
    scaleWords: 250000,
  },
  {
    id: 'WL2-028',
    title: 'high comment density corpus',
    family: 'high comment density',
    requiredPhysicalActions: ['open-high-comment-docx', 'add-many-visible-comments', 'resolve-subset', 'reply-subset', 'save', 'close-reopen'],
    expectedLanes: ['comments', 'performance'],
    expectedClassificationFloor: 'MEASURED_COMMENTS_ONLY_OR_TYPED_LOSS',
    commentTarget: 500,
  },
  {
    id: 'WL2-029',
    title: 'no edit conservation oracle',
    family: 'no-edit conservation and re-export reopen oracle',
    requiredPhysicalActions: ['open-exported-docx', 'no-edit-save', 'close-reopen', 'return-to-yalken'],
    expectedLanes: ['packageSemantics', 'locatorSurvival'],
    expectedClassificationFloor: 'ZERO_CANDIDATE_EXPECTED',
  },
  {
    id: 'WL2-030',
    title: 'supported apply re-export no-edit oracle',
    family: 'no-edit conservation and re-export reopen oracle',
    requiredPhysicalActions: ['apply-supported-exact', 're-export-docx', 'open-in-word', 'no-edit-save', 'return-to-yalken'],
    expectedLanes: ['packageSemantics', 'manuscriptText'],
    expectedClassificationFloor: 'ZERO_CANDIDATE_AFTER_REEXPORT_EXPECTED',
  },
  {
    id: 'WL2-031',
    title: 'hostile and active content negative package',
    family: 'stale tampered stripped duplicate and replay negatives',
    requiredPhysicalActions: ['inject-macro-or-ole-fixture', 'external-relationship-fixture', 'zip-bomb-fixture'],
    expectedLanes: ['packageSemantics'],
    expectedClassificationFloor: 'BLOCKED',
  },
  {
    id: 'WL2-032',
    title: 'locator carrier survival A B matrix',
    family: 'modern comments package inventory',
    requiredPhysicalActions: ['preserve-customXml-test', 'preserve-bookmark-test', 'preserve-sdt-test', 'preserve-paraId-test', 'preserve-comment-id-test'],
    expectedLanes: ['locatorSurvival', 'packageSemantics'],
    expectedClassificationFloor: 'SURVIVAL_ONLY_NOT_CERTIFICATION',
  },
]);

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function atomicWriteJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  const written = fs.statSync(tempPath).size;
  if (written <= 2) throw new Error(`ATOMIC_WRITE_EMPTY:${filePath}`);
  fs.renameSync(tempPath, filePath);
  try {
    const fd = fs.openSync(path.dirname(filePath), 'r');
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // Directory fsync is not universally available; physical receipts record
    // that boundary rather than claiming every filesystem capability.
  }
}

function assertSecureVolume() {
  if (!fs.existsSync(SECURE_MOUNT)) throw new Error('T7_SECURE_MOUNT_MISSING');
  const info = execFileSync('diskutil', ['info', SECURE_MOUNT], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const uuidLine = info.split('\n').find((line) => line.includes('Volume UUID')) || '';
  if (!uuidLine.includes(SECURE_UUID)) throw new Error(`T7_SECURE_UUID_MISMATCH:${uuidLine.trim()}`);
  if (!/FileVault:\s+Yes/u.test(info)) throw new Error('T7_SECURE_FILEVAULT_NOT_YES');
  fs.accessSync(SECURE_MOUNT, fs.constants.W_OK);
  return {
    mount: SECURE_MOUNT,
    uuid: SECURE_UUID,
    fileVault: 'Yes',
    writable: true,
  };
}

function buildSeedText(caseId) {
  return [
    `YALKEN_SYNTHETIC_CASE ${caseId}`,
    ...BASE_PARAGRAPHS,
    `END_SYNTHETIC_CASE ${caseId}`,
  ].join('\n');
}

export function buildWordLatestSemanticCorpus(options = {}) {
  const runId = typeof options.runId === 'string' && options.runId.trim()
    ? options.runId.trim()
    : 'word-latest-semantic-v2-b00';
  const cases = CASES.map((item, index) => ({
    ...item,
    ordinal: index + 1,
    syntheticTextSha256: sha256Text(buildSeedText(item.id)),
    requiresNativeWordOpenEditSaveReopen: true,
    fixtureOnlyPassAllowed: false,
    packageInventoryRequired: true,
    semanticReadbackRequired: true,
    wordReopenVisibilityRequiredForComments: item.expectedLanes.includes('comments'),
  }));
  return {
    schemaVersion: 'yalken.rtk.word-latest-semantic-corpus.v2',
    taskId: 'YALKEN_RTK_WORD_LATEST_SEMANTIC_ROUNDTRIP_V2',
    stageId: 'B00_DESIGN_RECEIPT_AND_CORPUS_GENERATOR',
    runId,
    profileId: WORD_LATEST_SEMANTIC_PROFILE_ID,
    status: 'GENERATED_PLAN_NO_PHYSICAL_EVIDENCE',
    generatedAtUtc: '2026-07-30T13:50:52Z',
    syntheticOnly: true,
    minimumPhysicalRoundTrips: 30,
    totalCases: cases.length,
    cases,
    scaleTargets: {
      words: [100000, 250000],
      pagesWhenPractical: [2000, 5000],
      highCommentTarget: 500,
    },
    evidenceRequiredPerCase: [
      'source export id',
      'original DOCX SHA256',
      'returned DOCX SHA256',
      'Word settings capsule digest',
      'native actions performed in Word',
      'package inventory',
      'semantic readback',
      'classification',
      'preview result',
      'apply or non-apply proof',
      'reopen result',
    ],
    noClaims: [
      'This corpus manifest is not Word certification.',
      'A fixture-only pass is forbidden.',
      'A no-op save without comments parts is failed comment automation evidence.',
      'No automatic apply authority is expanded by B00.',
    ],
  };
}

export function evaluateWordLatestSemanticB00(input = {}) {
  const matrix = input.matrix || readJson(MATRIX_PATH);
  const receipt = input.receipt || readJson(RECEIPT_PATH);
  const corpus = input.corpus || buildWordLatestSemanticCorpus(input);
  const issues = [];
  const issue = (code, message) => issues.push({ code, message });

  if (matrix.schemaVersion !== 'yalken.rtk.word-latest-semantic-roundtrip-v2.b00-matrix.v1') {
    issue('B00_MATRIX_SCHEMA_INVALID', 'B00 matrix schema is invalid.');
  }
  if (matrix.status !== 'B00_DESIGNED_NOT_CERTIFIED') {
    issue('B00_FALSE_CERTIFICATION', 'B00 matrix must stay design-only and uncertified.');
  }
  if (matrix.profile?.profileId !== WORD_LATEST_SEMANTIC_PROFILE_ID || matrix.profile?.status !== 'DESIGN_ONLY_NOT_CERTIFIED') {
    issue('B00_PROFILE_BOUNDARY_INVALID', 'Latest Word profile boundary is invalid.');
  }
  if (matrix.profile?.emptyNoOpCommentSaveCountsAsPass !== false || matrix.modernCommentPackageSemantics?.emptyNoOpSavePolicy?.includes('never modern comment support') !== true) {
    issue('B00_EMPTY_COMMENT_PROBE_POLICY_MISSING', 'Empty comment no-op save must never count as comments PASS.');
  }
  if (matrix.profile?.oldD1Profile?.notReboundByB00 !== true) {
    issue('B00_D1_REBOUND', 'B00 must not rebind the historical D1 profile.');
  }

  const painIds = new Set(Array.isArray(matrix.painMatrix) ? matrix.painMatrix.map((item) => item.id) : []);
  for (const id of REQUIRED_PAIN_IDS) {
    if (!painIds.has(id)) issue('B00_PAIN_MATRIX_INCOMPLETE', `Missing pain id ${id}.`);
  }

  const recordKinds = new Set((matrix.reviewTransportIRV2?.requiredRecords || []).map((item) => item.kind));
  for (const kind of REQUIRED_IR_RECORDS) {
    if (!recordKinds.has(kind)) issue('B00_IR_RECORD_MISSING', `Missing IR record ${kind}.`);
  }

  const signals = matrix.dualSnapshotAndSignedLocatorModel?.locatorSignals || [];
  if (!signals.some((signal) => signal.authority === 'required_apply_authority' && signal.exactEligible === true)) {
    issue('B00_SIGNED_LOCATOR_NOT_REQUIRED', 'Signed locator authority is not required.');
  }
  if (!signals.some((signal) => signal.signal.includes('prefix suffix') && signal.authority === 'recovery_manual_signal_only' && signal.exactEligible === false)) {
    issue('B00_FINGERPRINT_AUTHORITY_TOO_BROAD', 'Fingerprint must remain manual recovery only.');
  }

  const requiredCommentParts = new Set(matrix.modernCommentPackageSemantics?.requiredInventory || []);
  for (const part of ['word/comments.xml', 'word/commentsExtended.xml', 'word/commentsExtensible.xml', 'word/commentsIds.xml', 'word/people.xml']) {
    if (!requiredCommentParts.has(part)) issue('B00_COMMENT_PART_MISSING', `Missing comment package part ${part}.`);
  }
  if (matrix.modernCommentPackageSemantics?.commentPassRequires?.includes('Word reopen visibility') !== true) {
    issue('B00_COMMENT_REOPEN_VISIBILITY_MISSING', 'Comment PASS must require Word reopen visibility.');
  }

  if (receipt.schemaVersion !== 'yalken.rtk.word-latest-semantic-roundtrip-v2.b00-design-receipt.v1' || receipt.result !== 'PASS') {
    issue('B00_RECEIPT_INVALID', 'B00 receipt must be present and PASS.');
  }
  if (receipt.profileBoundary?.targetProfileStatusAfterB00 !== 'DESIGN_ONLY_NOT_CERTIFIED' || receipt.profileBoundary?.physicalRoundTripsExecutedInB00 !== 0) {
    issue('B00_RECEIPT_OVERCLAIM', 'B00 receipt must not claim physical Word execution.');
  }
  if (receipt.ownerFactBinding?.commentsPassRequiresPackageInventorySemanticReadbackAndWordReopenVisibility !== true) {
    issue('B00_OWNER_COMMENT_FACT_UNBOUND', 'Owner comment evidence correction is not bound.');
  }
  if (receipt.corpusManifest?.cases !== 32 || !/^sha256:[a-f0-9]{64}$/u.test(String(receipt.corpusManifest?.digest || ''))) {
    issue('B00_CORPUS_MANIFEST_RECEIPT_INVALID', 'B00 receipt must bind the generated corpus manifest digest and case count.');
  }
  if (receipt.corpusManifest?.physicalEvidenceClaimed !== false || receipt.corpusManifest?.wordAutomationRun !== false) {
    issue('B00_CORPUS_RECEIPT_OVERCLAIM', 'B00 corpus receipt must not claim physical evidence or Word automation.');
  }

  if (corpus.schemaVersion !== 'yalken.rtk.word-latest-semantic-corpus.v2' || corpus.status !== 'GENERATED_PLAN_NO_PHYSICAL_EVIDENCE') {
    issue('B00_CORPUS_SCHEMA_INVALID', 'Corpus generator must emit a plan-only corpus.');
  }
  if (corpus.totalCases < 30 || corpus.minimumPhysicalRoundTrips < 30) {
    issue('B00_CORPUS_TOO_SMALL', 'Corpus must cover at least 30 physical round trips.');
  }
  const families = new Set(corpus.cases.map((item) => item.family));
  for (const family of matrix.physicalCorpusContract?.requiredCaseFamilies || []) {
    if (!families.has(family)) issue('B00_CORPUS_FAMILY_MISSING', `Missing corpus family ${family}.`);
  }
  if (!corpus.cases.some((item) => item.commentTarget >= 500)) {
    issue('B00_HIGH_COMMENT_CORPUS_MISSING', 'High comment density corpus is missing.');
  }
  if (!corpus.scaleTargets?.words?.includes(250000)) {
    issue('B00_250K_SCALE_MISSING', '250k word scale target is missing.');
  }
  if (!corpus.cases.every((item) => item.fixtureOnlyPassAllowed === false && item.packageInventoryRequired === true && item.semanticReadbackRequired === true)) {
    issue('B00_CORPUS_GUARDS_INCOMPLETE', 'Every corpus case must reject fixture-only PASS and require semantic readback.');
  }

  const output = {
    ok: issues.length === 0,
    result: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    tokens: {
      WORD_LATEST_B00_BOUND: issues.length === 0 ? 1 : 0,
      WORD_LATEST_B00_PROFILE_UNCERTIFIED: matrix.profile?.status === 'DESIGN_ONLY_NOT_CERTIFIED' ? 1 : 0,
      WORD_LATEST_B00_PAIN_IDS: painIds.size,
      WORD_LATEST_B00_IR_RECORDS: recordKinds.size,
      WORD_LATEST_B00_CORPUS_CASES: corpus.totalCases,
      WORD_LATEST_B00_FIXTURE_ONLY_FORBIDDEN: corpus.cases.every((item) => item.fixtureOnlyPassAllowed === false) ? 1 : 0,
      WORD_LATEST_B00_COMMENT_NOOP_FORBIDDEN: matrix.profile?.emptyNoOpCommentSaveCountsAsPass === false ? 1 : 0,
    },
    corpusDigest: `sha256:${sha256Text(stableJson(corpus))}`,
  };
  return output;
}

function parseArgs(argv) {
  const options = {
    json: false,
    requireSecureVolume: false,
    writeCorpus: false,
    runId: '',
    artifactRoot: DEFAULT_ARTIFACT_ROOT,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') options.json = true;
    else if (arg === '--require-secure-volume') options.requireSecureVolume = true;
    else if (arg === '--write-corpus') options.writeCorpus = true;
    else if (arg === '--run-id' && argv[index + 1]) {
      options.runId = argv[index + 1];
      index += 1;
    } else if (arg === '--artifact-root' && argv[index + 1]) {
      options.artifactRoot = argv[index + 1];
      index += 1;
    }
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv);
  const corpus = buildWordLatestSemanticCorpus(options);
  const state = evaluateWordLatestSemanticB00({ corpus, runId: options.runId });
  let secureVolume = { checked: false, requiredForPhysicalRun: true };
  if (options.requireSecureVolume || options.writeCorpus) {
    secureVolume = { checked: true, ...assertSecureVolume() };
  }
  let write = null;
  if (options.writeCorpus) {
    const corpusDir = path.join(options.artifactRoot || DEFAULT_ARTIFACT_ROOT, 'corpus');
    const corpusPath = path.join(corpusDir, `${corpus.runId}-corpus.json`);
    atomicWriteJson(corpusPath, corpus);
    write = {
      path: corpusPath,
      digest: state.corpusDigest,
    };
  }
  const output = {
    ...state,
    secureVolume,
    write,
  };
  if (options.json) process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  else process.stdout.write(`WORD_LATEST_SEMANTIC_B00=${output.result}\n`);
  if (!output.ok) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  });
}
