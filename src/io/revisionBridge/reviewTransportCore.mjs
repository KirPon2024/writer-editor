import {
  crc32 as zipEvidenceCrc32,
  evaluateZipCrcEvidence,
  resolveEffectiveBudgets,
  RTK_ZIP_PROFILE_DEFAULTS_V6,
  RTK_ZIP_CEILING_DECLARED,
} from './reviewTransportZipEvidenceV1.mjs';

export const RTK_RETURNED_REVIEW_ANALYSIS_V2_SCHEMA =
  'yalken.rtk.returned-review-analysis.v2';
export const RTK_REVIEW_IR_V2_SCHEMA = 'yalken.rtk.review-ir.v2';
export const RTK_WORKER_CAPABILITY_V1_SCHEMA = 'yalken.rtk.worker-capability.v1';
export const RTK_PACKAGE_REWRITE_REPORT_V2_SCHEMA =
  'yalken.rtk.package-rewrite-report.v2';
export const RTK_ROUND_MANIFEST_V2_SCHEMA = 'yalken.rtk.review-round-manifest.v2';
export const RTK_ROUND_STORE_V2_SCHEMA = 'yalken.rtk.review-round-store.v2';
export const RTK_RECONCILIATION_INDEX_V2_SCHEMA =
  'yalken.rtk.reconciliation-index.v2';
export const RTK_ANALYSIS_BRANCH_V2_SCHEMA = 'yalken.rtk.analysis-branch.v2';
export const RTK_TRANSPORT_ARTIFACT_V2_SCHEMA = 'yalken.rtk.transport-artifact.v2';
export const RTK_PRIVATE_MANIFEST_V2_SCHEMA = 'yalken.rtk.private-manifest.v2';
export const RTK_NO_WRITE_ANALYSIS_V2_SCHEMA = 'yalken.rtk.returned-review-analysis.v2';
export const RTK_EXACT_APPLY_COMMAND_ENVELOPE_V2_SCHEMA =
  'yalken.rtk.exact-apply-command-envelope.v2';
export const RTK_EXACT_APPLY_OUTCOME_V2_SCHEMA =
  'yalken.rtk.exact-apply-outcome.v2';
export const RTK_EXACT_APPLY_RECOVERY_RESOLUTION_V2_SCHEMA =
  'yalken.rtk.exact-apply-recovery-resolution.v2';
export const RTK_EXACT_APPLY_RESERVATION_V1_SCHEMA =
  'yalken.rtk.exact-apply-reservation.v1';
export const RTK_EXACT_APPLY_RESERVATION_STATE_V1_SCHEMA =
  'yalken.rtk.exact-apply-reservation-state.v1';
export const RTK_EXACT_APPLY_OUTCOME_EFFECT_INDEX_V1_SCHEMA =
  'yalken.rtk.exact-apply-outcome-effect-index.v1';
export const RTK_FEATURE_FLAG = 'reviewTransportKernel.returnedReviewAnalysisV2';

export const RTK_LIFECYCLE_STATES = Object.freeze([
  'DRAFT_EXPORT_INTENT',
  'OPEN_FOR_RETURN',
  'RETURN_ADMITTED',
  'RETURN_ANALYZED',
  'TERMINAL',
  'RECOVERY_REQUIRED',
  'QUARANTINED',
]);
export const RTK_TERMINAL_LIFECYCLE_STATES = Object.freeze(['RETURN_ANALYZED', 'TERMINAL', 'QUARANTINED']);
export const RTK_APPLY_ELIGIBLE_LIFECYCLE_STATES = Object.freeze(['RETURN_ANALYZED']);
export const RTK_RETURN_MODES = Object.freeze(['TRACKED', 'CLEAN', 'MIXED']);
export const RTK_COMMENT_OUTCOMES = Object.freeze(['ANCHORED', 'ORPHAN', 'RESOLVED', 'UNSUPPORTED_BLOCKED']);
export const RTK_REASON_CODES = Object.freeze([
  'RTK_EXACT_APPLICABLE',
  'RTK_MANUAL_DEGRADED_LOCATOR',
  'RTK_BLOCKED_STRUCTURAL',
  'RTK_BLOCKED_MOVE_REVISION',
  'RTK_BLOCKED_AMBIGUOUS_TEXT',
  'RTK_BLOCKED_DUPLICATE_TOKEN',
  'RTK_BLOCKED_TOKEN_CONTRADICTION',
  'RTK_BLOCKED_CROSS_ROUND_LOCATOR',
  'RTK_BLOCKED_STALE_REVISION',
  'RTK_BLOCKED_STALE_BYTES',
  'RTK_BLOCKED_RECONCILING',
  'RTK_ALREADY_IMPORTED',
  'RTK_ALREADY_ANALYZED',
  'RTK_ALREADY_APPLIED',
  'RTK_MANUAL_CLEAN_RETURN',
  'RTK_MANUAL_MIXED_RETURN',
  'RTK_STRUCTURAL_PARAGRAPH_MARK_INSERTED',
  'RTK_STRUCTURAL_PARAGRAPH_MARK_DELETED',
  'RTK_BLOCKED_MOVE_REVISION',
  'RTK_ZIP_LOCAL_CENTRAL_MISMATCH',
  'RTK_ZIP_REGION_OVERLAP',
  'RTK_ZIP_FAKE_EOCD',
  'RTK_ZIP_CRC_MISMATCH',
  'RTK_ZIP_CRC_EVIDENCE_MISSING',
  'RTK_XML_MALFORMED_BLOCKED',
  'RTK_RECOVERY_REQUIRED',
  'RTK_COMMENT_ANCHORED',
  'RTK_COMMENT_ORPHAN',
  'RTK_COMMENT_RESOLVED',
  'RTK_COMMENT_UNSUPPORTED',
  'RTK_BUDGET_EXCEEDED',
  'RTK_HOSTILE_PACKAGE_BLOCKED',
  'RTK_DURABILITY_DIR_SYNC_UNAVAILABLE',
  'RTK_PARSER_TIMEOUT',
  'RTK_PARSER_CONSERVATION_FAILED',
  'RTK_WRITE_PRECONDITION_FAILED',
  'RTK_WRITE_RECOVERED',
  'RTK_WRITE_RESERVATION_CONFLICT',
  'RTK_WRITE_RESERVATION_RECOVERY_REQUIRED',
  'RTK_APPLY_STORE_SCAN_LIMIT_EXCEEDED',
  'RTK_COMMAND_ENVELOPE_BOUND',
  'RTK_COMMAND_ENVELOPE_TAMPERED',
  'RTK_COMMAND_AUTHORITY_BLOCKED',
  'RTK_WORKER_CAPABILITY_READY',
  'RTK_WORKER_AUTHORITY_BLOCKED',
  'RTK_PRIVATE_MANIFEST_BOUNDARY_OK',
  'RTK_PRIVATE_KEY_NOT_EXPORTED',
  'RTK_FILENAME_HINT_NON_AUTHORITY',
  'RTK_ROUND_OPEN_FOR_RETURN',
  'RTK_ROUND_NOT_OPEN_FOR_RETURN',
  'RTK_NO_WRITE_ANALYSIS_READY',
  'RTK_APPLY_STATE_NOT_ELIGIBLE',
  'RTK_APPLY_OUTCOME_BINDING_INVALID',
]);

export const RTK_V6_BUDGETS = Object.freeze({
  maxDocxBytes: 50 * 1024 * 1024,
  maxZipEntries: 512,
  maxInflatedPartBytes: 10 * 1024 * 1024,
  maxTotalInflatedBytes: 50 * 1024 * 1024,
  maxCompressionRatio: 200,
  maxXmlDepth: 64,
  maxAttributes: 128,
  maxAttributeBytes: 8 * 1024,
  maxBlocks: 5000,
  maxRevisions: 5000,
  maxComments: 2000,
  maxCandidates: 200,
  maxWorkerOutputBytes: 16 * 1024 * 1024,
  softTimeoutMs: 15_000,
  hardTimeoutMs: 30_000,
  memoryTargetBytes: 256 * 1024 * 1024,
});

// Shared blocking-code set used by both the pre-lane and the post-lane
// accountability gate inside buildReviewIRV2. A blocking diagnostic found
// AFTER the text/structure/comments lanes have been parsed must never be
// masked as an empty success (ADMIT-01 F-14/F-15).
const RTK_BLOCKING_CODES = Object.freeze(new Set([
  'RTK_BUDGET_EXCEEDED',
  'RTK_ZIP_CRC_MISMATCH',
  'RTK_ZIP_CRC_EVIDENCE_MISSING',
  'RTK_ZIP_LOCAL_CENTRAL_MISMATCH',
  'RTK_ZIP_REGION_OVERLAP',
  'RTK_ZIP_FAKE_EOCD',
  'RTK_XML_MALFORMED_BLOCKED',
  'RTK_WORKER_AUTHORITY_BLOCKED',
]));

const ADMITTED_PARTS = Object.freeze([
  'word/document.xml',
  'word/comments.xml',
  'word/commentsExtended.xml',
  'word/people.xml',
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function rawString(value) {
  return typeof value === 'string' ? value : '';
}

function cloneJsonSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function createFallbackCryptoPort() {
  return {
    sha256Text(value) {
      let hash = 0x811c9dc5;
      const text = rawString(value);
      for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
      return `${hash.toString(16).padStart(8, '0')}`.repeat(8).slice(0, 64);
    },
    sha256Json(value) {
      return `sha256:${this.sha256Text(stableJson(value))}`;
    },
    byteLength(value) {
      return [...rawString(value)].reduce((total, char) => total + (char.codePointAt(0) > 0x7f ? 2 : 1), 0);
    },
    crc32(value) {
      let crc = 0;
      const text = rawString(value);
      for (let index = 0; index < text.length; index += 1) crc = (crc + text.charCodeAt(index)) >>> 0;
      return crc;
    },
  };
}

function resolveCryptoPort(port) {
  const fallback = createFallbackCryptoPort();
  return {
    sha256Text: typeof port?.sha256Text === 'function' ? port.sha256Text.bind(port) : fallback.sha256Text.bind(fallback),
    sha256Json: typeof port?.sha256Json === 'function' ? port.sha256Json.bind(port) : fallback.sha256Json.bind(fallback),
    byteLength: typeof port?.byteLength === 'function' ? port.byteLength.bind(port) : fallback.byteLength.bind(fallback),
    crc32: typeof port?.crc32 === 'function' ? port.crc32.bind(port) : fallback.crc32.bind(fallback),
  };
}

function reason(code, field, message, details = {}) {
  return { code, field, message, ...details };
}

function localName(name) {
  const text = rawString(name).trim();
  const parts = text.split(':');
  return rawString(parts[parts.length - 1]).replaceAll('/', '').trim();
}

function decodeEntities(text) {
  return rawString(text)
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
}

function readName(text, cursor) {
  let index = cursor;
  while (index < text.length) {
    const code = text.charCodeAt(index);
    const ok = (code >= 65 && code <= 90)
      || (code >= 97 && code <= 122)
      || (code >= 48 && code <= 57)
      || text[index] === '_' || text[index] === '-' || text[index] === '.' || text[index] === ':';
    if (!ok) break;
    index += 1;
  }
  return { value: text.slice(cursor, index), next: index };
}

function parseAttributes(attrText, budgets, cryptoPort) {
  const attrs = {};
  const diagnostics = [];
  let cursor = 0;
  while (cursor < attrText.length) {
    while (cursor < attrText.length && attrText[cursor].trim() === '') cursor += 1;
    if (cursor >= attrText.length || attrText[cursor] === '/') break;
    const name = readName(attrText, cursor);
    if (!name.value) break;
    cursor = name.next;
    while (cursor < attrText.length && attrText[cursor].trim() === '') cursor += 1;
    if (attrText[cursor] !== '=') break;
    cursor += 1;
    while (cursor < attrText.length && attrText[cursor].trim() === '') cursor += 1;
    const quote = attrText[cursor];
    if (quote !== '"' && quote !== "'") break;
    cursor += 1;
    const start = cursor;
    while (cursor < attrText.length && attrText[cursor] !== quote) cursor += 1;
    const value = decodeEntities(attrText.slice(start, cursor));
    cursor += 1;
    if (Object.keys(attrs).length >= budgets.maxAttributes) {
      diagnostics.push(reason('RTK_BUDGET_EXCEEDED', 'xml.attributes', 'XML attribute budget exceeded.'));
      continue;
    }
    if (cryptoPort.byteLength(value) > budgets.maxAttributeBytes) {
      diagnostics.push(reason('RTK_BUDGET_EXCEEDED', `xml.attributes.${localName(name.value)}`, 'XML attribute byte budget exceeded.'));
      continue;
    }
    attrs[localName(name.value)] = value;
  }
  return {
    attrs: Object.fromEntries(Object.keys(attrs).sort().map((key) => [key, attrs[key]])),
    diagnostics,
  };
}

function scanXml(xml, budgets, cryptoPort) {
  const text = rawString(xml);
  const tokens = [];
  const diagnostics = [];
  const stack = [];
  let cursor = 0;
  while (cursor < text.length) {
    const open = text.indexOf('<', cursor);
    if (open === -1) break;
    const close = text.indexOf('>', open + 1);
    if (close === -1) {
      diagnostics.push(reason('RTK_XML_MALFORMED_BLOCKED', 'xml', 'XML tag is not closed.'));
      break;
    }
    const raw = text.slice(open + 1, close).trim();
    cursor = close + 1;
    if (!raw || raw.startsWith('!') || raw.startsWith('?')) continue;
    const closing = raw.startsWith('/');
    const selfClosing = raw.endsWith('/');
    const nameStart = closing ? 1 : 0;
    const parsedName = readName(raw, nameStart);
    const name = localName(parsedName.value);
    const parsedAttrs = closing ? { attrs: {}, diagnostics: [] } : parseAttributes(raw.slice(parsedName.next), budgets, cryptoPort);
    diagnostics.push(...parsedAttrs.diagnostics);
    const token = {
      name,
      closing,
      selfClosing,
      attrs: parsedAttrs.attrs,
      openStart: open,
      openEnd: close + 1,
      closeStart: close,
      closeEnd: close + 1,
      depth: stack.length,
    };
    if (closing) {
      const last = stack.pop();
      if (!last || last.name !== name) {
        diagnostics.push(reason('RTK_XML_MALFORMED_BLOCKED', `xml.${name}`, 'XML close tag does not match open tag.'));
      } else {
        last.closeStart = open;
        last.closeEnd = close + 1;
        tokens.push(last);
      }
      continue;
    }
    if (stack.length + 1 > budgets.maxXmlDepth) {
      diagnostics.push(reason('RTK_BUDGET_EXCEEDED', 'xml.depth', 'XML depth budget exceeded.'));
    }
    if (selfClosing) {
      tokens.push(token);
    } else {
      stack.push(token);
    }
  }
  if (stack.length > 0) {
    diagnostics.push(reason('RTK_XML_MALFORMED_BLOCKED', 'xml', 'XML has unclosed elements.'));
  }
  return { tokens, diagnostics };
}

function elementBody(xml, token) {
  if (token.selfClosing) return '';
  return rawString(xml).slice(token.openEnd, token.closeStart);
}

function stripTags(xml) {
  const text = rawString(xml);
  let output = '';
  let cursor = 0;
  while (cursor < text.length) {
    const open = text.indexOf('<', cursor);
    if (open === -1) {
      output += text.slice(cursor);
      break;
    }
    output += text.slice(cursor, open);
    const close = text.indexOf('>', open + 1);
    if (close === -1) break;
    const tagText = text.slice(open + 1, close).trim();
    if (localName(readName(tagText, tagText.startsWith('/') ? 1 : 0).value) === 'tab') output += '\t';
    cursor = close + 1;
  }
  return decodeEntities(output);
}

function canonicalizeScannedXml(xml, budgets, cryptoPort) {
  const scanned = scanXml(xml, budgets, cryptoPort);
  return scanned.tokens
    .map((token) => `${token.name}:${stableJson(token.attrs)}:${stripTags(elementBody(xml, token)).trim()}`)
    .sort()
    .join('|');
}

function normalizeBudgets(input = {}) {
  // Effective budget resolution via the shared min-clamp resolver so core and
  // parser V2 share identical effective-budget semantics (F-11/P1-02).
  const { effective } = resolveEffectiveBudgets({
    requested: input,
    profileDefaults: RTK_ZIP_PROFILE_DEFAULTS_V6,
    ceiling: RTK_ZIP_CEILING_DECLARED,
  });
  return effective;
}

function normalizeParts(parts = {}, budgets, cryptoPort) {
  const admittedParts = {};
  const rejectedParts = [];
  const reasons = [];
  let totalBytes = 0;
  const entries = parts instanceof Map ? Object.fromEntries(parts.entries()) : (isPlainObject(parts) ? parts : {});
  for (const [nameRaw, value] of Object.entries(entries)) {
    const name = rawString(nameRaw).replaceAll('\\', '/');
    const text = rawString(value);
    const bytes = cryptoPort.byteLength(text);
    totalBytes += bytes;
    if (!ADMITTED_PARTS.includes(name)) {
      rejectedParts.push(name);
      continue;
    }
    if (bytes > budgets.maxInflatedPartBytes) {
      reasons.push(reason('RTK_BUDGET_EXCEEDED', `parts.${name}`, 'Inflated part exceeds V6 budget.', {
        actual: bytes,
        limit: budgets.maxInflatedPartBytes,
      }));
      continue;
    }
    admittedParts[name] = text;
  }
  if (totalBytes > budgets.maxTotalInflatedBytes) {
    reasons.push(reason('RTK_BUDGET_EXCEEDED', 'parts', 'Total inflated package bytes exceed V6 budget.', {
      actual: totalBytes,
      limit: budgets.maxTotalInflatedBytes,
    }));
  }
  return { admittedParts, rejectedParts, reasons, totalBytes };
}

function rangesOverlap(left, right) {
  return Number.isFinite(left.start) && Number.isFinite(left.end)
    && Number.isFinite(right.start) && Number.isFinite(right.end)
    && Math.max(left.start, right.start) < Math.min(left.end, right.end);
}

function evaluatePackageIntegrity(inventory = {}, admittedParts = {}, cryptoPort, maxZipEntries) {
  const reasons = [];
  const entries = Array.isArray(inventory.entries) ? inventory.entries.filter(isPlainObject) : [];
  const ranges = [];
  const effectiveMaxZipEntries = Number.isSafeInteger(maxZipEntries) && maxZipEntries > 0
    ? maxZipEntries
    : RTK_V6_BUDGETS.maxZipEntries;
  if (entries.length > effectiveMaxZipEntries) {
    reasons.push(reason('RTK_BUDGET_EXCEEDED', 'zip.entries', 'ZIP entry count exceeds effective budget.', {
      actual: entries.length,
      limit: effectiveMaxZipEntries,
    }));
  }
  if (Number(inventory.fakeEocdCount || 0) > 0 || Number(inventory.eocdCount || 1) > 1) {
    reasons.push(reason('RTK_ZIP_FAKE_EOCD', 'zip.eocd', 'Fake or duplicate EOCD marker is blocked.'));
  }
  for (const entry of entries) {
    const name = rawString(entry.name);
    // Shared CRC evidence evaluation (same helper as parser V2): central-vs-
    // local divergence, missing evidence rejection, and actual recompute via
    // the bounded crc32 implementation. Actual recompute is REQUIRED (Z1) and
    // missing evidence is a rejection (Z3), never a silent skip.
    reasons.push(...evaluateZipCrcEvidence(entry, admittedParts, zipEvidenceCrc32));
    const start = Number(entry.dataStart ?? entry.start);
    const end = Number(entry.dataEnd ?? entry.end);
    for (const previous of ranges) {
      if (rangesOverlap({ start, end }, previous)) {
        reasons.push(reason('RTK_ZIP_REGION_OVERLAP', `zip.${name}.range`, 'ZIP entry byte ranges overlap.', {
          partName: name,
          overlaps: previous.name,
        }));
      }
    }
    ranges.push({ name, start, end });
  }
  return reasons;
}

function classifySourceMode(documentXml, input, scannedDocument) {
  const hasRevisions = scannedDocument.tokens.some((token) => (
    ['ins', 'del', 'moveFrom', 'moveTo', 'pPrChange'].includes(token.name)
  ));
  const hasUntrackedDrift = input.untrackedDrift === true
    || (
      rawString(input.baselineFinalText)
      && rawString(input.finalText || stripTags(documentXml)) !== rawString(input.baselineFinalText)
    );
  if (hasRevisions && hasUntrackedDrift) return 'MIXED';
  if (hasRevisions) return 'TRACKED';
  return 'CLEAN';
}

function parseTrackedChanges(documentXml, scannedDocument, budgets, cryptoPort) {
  const changes = [];
  const diagnostics = [];
  // CANON-01 P0-18: placement map (candidateId -> namespace-invariant paragraph index) kept
  // OUT of the reviewIr change objects so the pinned reviewIr digest stays byte-stable; the
  // semantic projection reads it separately to participate in supportedSemanticDigest.
  const placementByCandidateId = new Map();
  let index = 0;
  for (const token of scannedDocument.tokens) {
    if (!['ins', 'del', 'moveFrom', 'moveTo'].includes(token.name)) continue;
    const text = stripTags(elementBody(documentXml, token));
    if (changes.length >= budgets.maxRevisions || cryptoPort.byteLength(text) > budgets.maxWorkerOutputBytes) {
      diagnostics.push(reason('RTK_BUDGET_EXCEEDED', `textChanges.${index}`, 'Revision budget exceeded.'));
      break;
    }
    const structural = token.name === 'moveFrom' || token.name === 'moveTo';
    const code = structural ? 'RTK_BLOCKED_MOVE_REVISION' : 'RTK_EXACT_APPLICABLE';
    const candidateId = `rtk-candidate-${cryptoPort.sha256Text(stableJson({ kind: token.name, attrs: token.attrs, text }))}`;
    placementByCandidateId.set(candidateId, paragraphIndexAtOffset(scannedDocument, token.openStart));
    changes.push({
      candidateId,
      kind: token.name,
      candidateDisposition: structural ? 'BLOCKED' : 'MANUAL',
      classification: structural ? 'STRUCTURAL_BLOCKED' : 'TEXT_MANUAL',
      originalParagraph: token.name === 'del' || token.name === 'moveFrom' ? text : '',
      finalParagraph: token.name === 'ins' || token.name === 'moveTo' ? text : '',
      revisionIds: [rawString(token.attrs.id)].filter(Boolean),
      textDigest: cryptoPort.sha256Json({ kind: token.name, text }),
      textExcerpt: text.slice(0, 96),
      attributes: token.attrs,
      reasonCode: code,
    });
    if (structural) {
      diagnostics.push(reason('RTK_BLOCKED_MOVE_REVISION', `textChanges.${index}.kind`, 'Move revisions are structural and blocked.', { kind: token.name }));
    }
    index += 1;
  }
  for (const token of scannedDocument.tokens) {
    if (token.name === 'pPrChange') {
      diagnostics.push(reason(
        'RTK_STRUCTURAL_PARAGRAPH_MARK_INSERTED',
        'document.paragraphMarks',
        'Paragraph mark revisions are structural and always blocked.',
      ));
    }
  }
  return { changes, diagnostics, placementByCandidateId };
}

// CANON-01 P0-18: namespace-invariant paragraph index for W2 placement. Counts top-level body
// paragraph localName tokens before the offset; localName 'p' is prefix-independent, so the
// index is stable across namespace-prefix rename and attribute reorder (C6c/C7 controls).
function paragraphIndexAtOffset(scannedDocument, offset) {
  if (typeof offset !== 'number') return null;
  let position = 0;
  for (const token of scannedDocument.tokens) {
    if (token.name !== 'p' || token.closing) continue;
    if (token.openStart > offset) break;
    position += 1;
  }
  return position;
}

function commentReferenceIds(scannedDocument) {
  return new Set(scannedDocument.tokens
    .filter((token) => token.name === 'commentReference' || token.name === 'commentRangeStart')
    .map((token) => rawString(token.attrs.id))
    .filter(Boolean));
}

function parseComments(commentsXml, commentsExtendedXml, scannedDocument, budgets, cryptoPort) {
  const commentsScan = scanXml(commentsXml, budgets, cryptoPort);
  const commentsExScan = scanXml(commentsExtendedXml, budgets, cryptoPort);
  const reasons = [...commentsScan.diagnostics, ...commentsExScan.diagnostics];
  const anchors = commentReferenceIds(scannedDocument);
  const metadataByParaId = new Map();
  for (const token of commentsExScan.tokens.filter((item) => item.name === 'commentEx')) {
    const key = rawString(token.attrs.paraId || token.attrs.id);
    if (!key) continue;
    metadataByParaId.set(key, {
      resolved: rawString(token.attrs.done).toLowerCase() === 'true' || rawString(token.attrs.done) === '1',
      attributes: token.attrs,
    });
  }

  const seen = new Set();
  const commentThreads = [];
  let ordinal = 0;
  for (const token of commentsScan.tokens.filter((item) => item.name === 'comment')) {
    const rawId = rawString(token.attrs.id || `${ordinal}`);
    const paraId = rawString(token.attrs.paraId || rawId);
    const body = stripTags(elementBody(commentsXml, token)).trim();
    const duplicate = seen.has(rawId);
    seen.add(rawId);
    const meta = metadataByParaId.get(paraId)
      || metadataByParaId.get(rawId)
      || (metadataByParaId.size === 1 ? [...metadataByParaId.values()][0] : {});
    const anchored = anchors.has(rawId);
    const status = duplicate
      ? 'UNSUPPORTED_BLOCKED'
      : (meta.resolved ? 'RESOLVED' : (anchored ? 'ANCHORED' : 'ORPHAN'));
    const code = status === 'RESOLVED'
      ? 'RTK_COMMENT_RESOLVED'
      : (status === 'ANCHORED' ? 'RTK_COMMENT_ANCHORED' : (status === 'ORPHAN' ? 'RTK_COMMENT_ORPHAN' : 'RTK_COMMENT_UNSUPPORTED'));
    commentThreads.push({
      threadId: `rtk-comment-${rawId}`,
      parentThreadId: rawString(token.attrs.parentId),
      rawId,
      items: [{
        itemId: `rtk-comment-item-${rawId}-0`,
        ordinal,
        body,
        bodyDigest: cryptoPort.sha256Json({ rawId, body }),
        bodyExcerpt: body.slice(0, 160),
      }],
      bodyExcerpt: body.slice(0, 160),
      status,
      placement: {
        outcome: status,
        anchored,
        selectorStack: {
          exactQuote: '',
          prefix: '',
          suffix: '',
          utf16Position: null,
        },
      },
      reasonCodes: [code],
      attributes: token.attrs,
      modernMetadata: meta.attributes ? { ...meta.attributes, done: meta.resolved === true } : {},
    });
    reasons.push(reason(code, `comments.${rawId}`, 'Comment lane outcome is conserved independently from text lane.', {
      threadId: `rtk-comment-${rawId}`,
    }));
    ordinal += 1;
  }
  if (commentThreads.length > budgets.maxComments) {
    reasons.push(reason('RTK_BUDGET_EXCEEDED', 'comments', 'Comment count exceeds V6 budget.'));
  }
  return { commentThreads, reasons };
}

// ADMIT-01 laneCompleteness for V1 ReviewIR. Each lane maps to COMPLETE unless
// a blocking resource diagnostic references that lane's field namespace. The
// marker is additive so the successful ReviewIR shape stays byte-stable (A4
// control pins the digests); only the blocked form carries a reasonCode.
function laneStatusV1(reasons, laneFields) {
  for (const item of reasons) {
    if (!RTK_BLOCKING_CODES.has(item.code)) continue;
    const field = rawString(item.field);
    if (laneFields.some((prefix) => field === prefix || field.startsWith(`${prefix}.`) || field.startsWith(`${prefix}`))) {
      return { status: 'BLOCKED_RESOURCE', reasonCode: item.code };
    }
  }
  return { status: 'COMPLETE' };
}

function buildLaneCompletenessV1(reasons) {
  const text = laneStatusV1(reasons, ['textChanges']);
  const structure = laneStatusV1(reasons, ['structuralChanges', 'structureChanges']);
  const comments = laneStatusV1(reasons, ['comments']);
  return { text: text.status, structure: structure.status, comments: comments.status };
}

export function buildWorkerCapabilityAdapterV1(capabilities = {}) {
  const blocked = capabilities.pathAuthority === true
    || capabilities.writerAuthority === true
    || capabilities.networkAuthority === true;
  const reasons = [];
  if (blocked) {
    reasons.push(reason('RTK_WORKER_AUTHORITY_BLOCKED', 'worker.authority', 'Worker cannot receive path, writer, or network authority.'));
  }
  return {
    ok: !blocked,
    schemaVersion: RTK_WORKER_CAPABILITY_V1_SCHEMA,
    adapterKind: 'desktop-process-worker',
    canReceivePaths: false,
    canWriteManuscript: false,
    canApply: false,
    networkAccess: false,
    timeoutMs: Number.isSafeInteger(capabilities.timeoutMs) ? capabilities.timeoutMs : RTK_V6_BUDGETS.hardTimeoutMs,
    cancellation: 'kill-restart',
    code: blocked ? 'RTK_WORKER_AUTHORITY_BLOCKED' : 'RTK_WORKER_CAPABILITY_READY',
    reasons,
  };
}

export function buildReviewIRV2(input = {}, ports = {}) {
  const cryptoPort = resolveCryptoPort(ports.cryptoPort);
  const budgets = normalizeBudgets(input.budgets);
  const worker = buildWorkerCapabilityAdapterV1(input.workerCapabilities);
  const normalizedParts = normalizeParts(input.parts, budgets, cryptoPort);
  const reasons = [...worker.reasons, ...normalizedParts.reasons];
  reasons.push(...evaluatePackageIntegrity(input.zipInventory, normalizedParts.admittedParts, cryptoPort, budgets.maxZipEntries));
  const documentXml = rawString(normalizedParts.admittedParts['word/document.xml']);
  const commentsXml = rawString(normalizedParts.admittedParts['word/comments.xml']);
  const commentsExtendedXml = rawString(normalizedParts.admittedParts['word/commentsExtended.xml']);
  const scannedDocument = scanXml(documentXml, budgets, cryptoPort);
  reasons.push(...scannedDocument.diagnostics);
  if (reasons.some((item) => RTK_BLOCKING_CODES.has(item.code))) {
    return {
      ok: false,
      schemaVersion: RTK_RETURNED_REVIEW_ANALYSIS_V2_SCHEMA,
      status: 'blocked',
      code: reasons.find((item) => RTK_BLOCKING_CODES.has(item.code))?.code || 'RTK_HOSTILE_PACKAGE_BLOCKED',
      canWriteManuscript: false,
      canApply: false,
      laneCompleteness: buildLaneCompletenessV1(reasons),
      reasons,
    };
  }

  const sourceMode = classifySourceMode(documentXml, input, scannedDocument);
  if (sourceMode === 'CLEAN') reasons.push(reason('RTK_MANUAL_CLEAN_RETURN', 'sourceMode', 'CLEAN return is visible manual analysis.'));
  if (sourceMode === 'MIXED') reasons.push(reason('RTK_MANUAL_MIXED_RETURN', 'sourceMode', 'MIXED return is visible manual analysis.'));
  const tracked = parseTrackedChanges(documentXml, scannedDocument, budgets, cryptoPort);
  const comments = parseComments(commentsXml, commentsExtendedXml, scannedDocument, budgets, cryptoPort);
  reasons.push(...tracked.diagnostics, ...comments.reasons);

  // ADMIT-01: post-lane accountability re-check. The pre-lane gate runs before
  // parseTrackedChanges/parseComments, so the F-14/F-15 budget diagnostics they
  // append (textChanges.N truncation, comments overflow) can otherwise mask an
  // overflow as {ok:true, code:'RTK_EXACT_APPLICABLE'} with empty lanes. Re-run
  // the same blocking-code set against the now-merged reasons and return a
  // typed blocked result with a safe reviewIr and a laneCompleteness marker.
  const postLaneBlocked = reasons.find((item) => RTK_BLOCKING_CODES.has(item.code));
  if (postLaneBlocked) {
    const safeReviewIr = {
      schemaVersion: RTK_REVIEW_IR_V2_SCHEMA,
      sourceMode,
      textChanges: [],
      changes: [],
      structuralChanges: [],
      commentThreads: [],
      comments: [],
      modernCommentMetadata: [],
      diagnostics: reasons,
      conservation: {
        commentBodiesIndependentFromPlacement: true,
        commentLaneIndependentFromTextLane: true,
        fullTextStoredOnlyForChangedBlocks: true,
        unchangedBlocksStoredAsSpansHashesAndExcerpts: true,
      },
    };
    return {
      ok: false,
      schemaVersion: RTK_RETURNED_REVIEW_ANALYSIS_V2_SCHEMA,
      status: 'blocked',
      code: postLaneBlocked.code,
      canWriteManuscript: false,
      canApply: false,
      sourceMode,
      reviewIr: safeReviewIr,
      laneCompleteness: buildLaneCompletenessV1(reasons),
      reasons,
    };
  }

  const semanticProjection = {
    canonicalDocument: canonicalizeScannedXml(documentXml, budgets, cryptoPort),
    canonicalComments: canonicalizeScannedXml(commentsXml, budgets, cryptoPort),
    sourceMode,
    textChanges: tracked.changes.map((change) => ({
      kind: change.kind,
      candidateDisposition: change.candidateDisposition,
      textDigest: change.textDigest,
      attributes: change.attributes,
      reasonCode: change.reasonCode,
      // CANON-01 P0-18: placement participates in the W2 digest so relocation between paragraphs
      // is visible. canonicalDocument remains the authoritative placement source; this per-change
      // paragraph index is a namespace-invariant supplement read from a side map so the pinned
      // reviewIr digest stays byte-stable.
      placement: { story: 'document.xml', paragraphIndex: tracked.placementByCandidateId?.get(change.candidateId) ?? null },
    })),
    commentThreads: comments.commentThreads.map((thread) => ({
      rawId: thread.rawId,
      parentThreadId: thread.parentThreadId,
      status: thread.status,
      itemDigests: thread.items.map((item) => item.bodyDigest),
    })),
  };
  const parserProfile = {
    schemaVersion: 'yalken.rtk.parser-profile.v2',
    implementationId: 'bounded-scanner-no-regex-v2',
    parserBuild: rawString(input.parserBuild || 'local'),
    contractVersion: 'ReviewIRV2',
    budgets,
    admittedParts: Object.keys(normalizedParts.admittedParts).sort(),
    semanticFeatureFlags: ['comments-body-first', 'source-mode-v6', 'mce-typed-loss'],
  };
  const supportedSemanticDigest = cryptoPort.sha256Json(semanticProjection);
  const parserProfileDigest = cryptoPort.sha256Json(parserProfile);
  const analysisDigest = cryptoPort.sha256Json({
    schemaVersion: RTK_RETURNED_REVIEW_ANALYSIS_V2_SCHEMA,
    supportedSemanticDigest,
    parserProfileDigest,
    sourceMode,
  });
  const cacheKey = cryptoPort.sha256Json({
    artifactHash: rawString(input.returnedArtifactSha256 || input.sourceArtifactSha256),
    parserProfileDigest,
    canonicalizerVersion: 'ReviewIRV2',
    manifestDigest: rawString(input.manifestDigest),
  });
  const reviewIr = {
    schemaVersion: RTK_REVIEW_IR_V2_SCHEMA,
    sourceMode,
    textChanges: tracked.changes,
    changes: tracked.changes,
    structuralChanges: tracked.changes
      .filter((change) => change.classification === 'STRUCTURAL_BLOCKED')
      .map((change) => ({
        changeId: change.candidateId,
        kind: change.kind,
        affectedBlocks: [],
        reasonCodes: [change.reasonCode],
      })),
    commentThreads: comments.commentThreads,
    comments: comments.commentThreads,
    modernCommentMetadata: comments.commentThreads
      .map((thread) => thread.modernMetadata)
      .filter((metadata) => Object.keys(metadata).length > 0),
    diagnostics: reasons,
    conservation: {
      commentBodiesIndependentFromPlacement: true,
      commentLaneIndependentFromTextLane: true,
      fullTextStoredOnlyForChangedBlocks: true,
      unchangedBlocksStoredAsSpansHashesAndExcerpts: true,
    },
  };
  return {
    ok: true,
    schemaVersion: RTK_RETURNED_REVIEW_ANALYSIS_V2_SCHEMA,
    status: 'review-ir-ready',
    code: 'RTK_EXACT_APPLICABLE',
    canWriteManuscript: false,
    canApply: false,
    sourceMode,
    worker,
    rejectedParts: normalizedParts.rejectedParts,
    reviewIr,
    laneCompleteness: buildLaneCompletenessV1(reasons),
    supportedSemanticDigest,
    parserProfileDigest,
    analysisDigest,
    cacheKey,
    parserProfile,
    packageRewriteReport: null,
    reasons: [reason('RTK_EXACT_APPLICABLE', 'reviewIr', 'Bounded deterministic ReviewIRV2 was produced without write authority.'), ...reasons],
  };
}

export function buildRedactedPackageRewriteReportV2(input = {}, ports = {}) {
  const cryptoPort = resolveCryptoPort(ports.cryptoPort);
  const changedBlocks = Array.isArray(input.changedBlocks) ? input.changedBlocks.filter(isPlainObject) : [];
  const unchangedBlocks = Array.isArray(input.unchangedBlocks) ? input.unchangedBlocks.filter(isPlainObject) : [];
  return {
    schemaVersion: RTK_PACKAGE_REWRITE_REPORT_V2_SCHEMA,
    reportId: rawString(input.reportId) || cryptoPort.sha256Json({ changedBlocks, unchangedBlocks }).replace('sha256:', ''),
    canWriteManuscript: false,
    canApply: false,
    changedBlocks: changedBlocks.map((block, index) => ({
      blockId: rawString(block.blockId) || `changed-${index}`,
      originalText: rawString(block.originalText).slice(0, RTK_V6_BUDGETS.maxWorkerOutputBytes),
      finalText: rawString(block.finalText).slice(0, RTK_V6_BUDGETS.maxWorkerOutputBytes),
      originalDigest: cryptoPort.sha256Json(rawString(block.originalText)),
      finalDigest: cryptoPort.sha256Json(rawString(block.finalText)),
    })),
    unchangedBlocks: unchangedBlocks.map((block, index) => {
      const text = rawString(block.text);
      return {
        blockId: rawString(block.blockId) || `unchanged-${index}`,
        span: Array.isArray(block.span) ? block.span.slice(0, 2) : [0, text.length],
        textDigest: cryptoPort.sha256Json(text),
        excerpt: text.slice(0, 80),
      };
    }),
  };
}
