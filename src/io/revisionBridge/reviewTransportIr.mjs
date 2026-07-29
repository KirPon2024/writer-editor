import crypto from 'node:crypto';

export const REVISION_BRIDGE_W2_REVIEW_IR_SCHEMA = 'revision-bridge.w2-review-ir.v1';
export const REVISION_BRIDGE_W2_WORKER_CAPABILITY_SCHEMA =
  'revision-bridge.w2-worker-capability.v1';
export const REVISION_BRIDGE_W2_PACKAGE_REWRITE_REPORT_SCHEMA =
  'revision-bridge.w2-package-rewrite-report.v1';

export const REVISION_BRIDGE_W2_REASON_CODES = Object.freeze([
  'W2_REVIEW_IR_READY',
  'W2_WORKER_CAPABILITY_READY',
  'W2_WORKER_PATH_AUTHORITY_BLOCKED',
  'W2_WORKER_WRITER_AUTHORITY_BLOCKED',
  'W2_WORKER_NETWORK_AUTHORITY_BLOCKED',
  'W2_BUDGET_OVERFLOW',
  'W2_PACKAGE_CRC_MISMATCH',
  'W2_PACKAGE_LOCAL_CENTRAL_MISMATCH',
  'W2_PACKAGE_ENTRY_OVERLAP',
  'W2_PACKAGE_FAKE_EOCD',
  'W2_XML_MALFORMED_BLOCKED',
  'W2_PARAGRAPH_MARK_STRUCTURAL',
  'W2_MOVE_REVISION_STRUCTURAL',
  'W2_COMMENTS_CONSERVED',
  'W2_CLEAN_MANUAL_OUTCOME',
  'W2_MIXED_MANUAL_OUTCOME',
]);

const ADMITTED_PARTS = Object.freeze([
  'word/document.xml',
  'word/comments.xml',
  'word/commentsExtended.xml',
  'word/people.xml',
]);

const DEFAULT_BUDGETS = Object.freeze({
  maxPartBytes: 256 * 1024,
  maxTotalBytes: 768 * 1024,
  maxChangedTextBytes: 2048,
  maxCommentBytes: 2048,
  maxChanges: 128,
  maxComments: 256,
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function rawString(value) {
  return typeof value === 'string' ? value : '';
}

function cloneJsonSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function sha256Json(value) {
  return `sha256:${sha256Buffer(Buffer.from(stableJson(value), 'utf8'))}`;
}

function normalizeBudget(input = {}) {
  return {
    ...DEFAULT_BUDGETS,
    ...Object.fromEntries(Object.entries(input).filter(([, value]) => (
      Number.isSafeInteger(value) && value > 0
    ))),
  };
}

function reason(code, field, message, details = {}) {
  return { code, field, message, ...details };
}

function decodePartValue(value) {
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('utf8');
  if (value instanceof ArrayBuffer) return Buffer.from(value).toString('utf8');
  return rawString(value);
}

function normalizePartMap(parts = {}) {
  if (parts instanceof Map) return Object.fromEntries(parts.entries());
  if (Array.isArray(parts)) {
    return Object.fromEntries(parts.filter(isPlainObject).map((part) => [rawString(part.name), part.value]));
  }
  return isPlainObject(parts) ? parts : {};
}

function textFromChunks(value) {
  if (Array.isArray(value)) return value.map(decodePartValue).join('');
  return decodePartValue(value);
}

function escapeText(value) {
  return String(value || '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
}

function stripXmlTags(value) {
  return escapeText(String(value || '').replace(/<[^>]*>/gu, ''));
}

function localName(tagName) {
  const normalized = rawString(tagName).trim();
  const last = normalized.includes(':') ? normalized.split(':').pop() : normalized;
  return last.replace(/^\/+|\/+$/gu, '');
}

function parseAttributes(attrText) {
  const attributes = {};
  const pattern = /([A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?)\s*=\s*(["'])(.*?)\2/gsu;
  let match;
  while ((match = pattern.exec(rawString(attrText))) !== null) {
    attributes[localName(match[1])] = escapeText(match[3]);
  }
  return Object.fromEntries(Object.keys(attributes).sort().map((key) => [key, attributes[key]]));
}

function xmlLooksMalformed(xml) {
  const text = rawString(xml);
  if (!text) return false;
  const stack = [];
  const tags = text.matchAll(/<\s*(\/?)([A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?)([^>]*)>/gsu);
  for (const match of tags) {
    const closing = match[1] === '/';
    const name = localName(match[2]);
    const raw = rawString(match[3]);
    if (raw.endsWith('/') || /^![A-Z-]+/u.test(name) || name.startsWith('?')) continue;
    if (!closing) {
      if (!['br', 'tab', 'commentReference'].includes(name)) stack.push(name);
      continue;
    }
    const last = stack.pop();
    if (last !== name) return true;
  }
  return stack.length !== 0;
}

function canonicalizeXmlForDigest(xml) {
  return rawString(xml)
    .replace(/<\s*([A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?)([^>]*)>/gsu, (all, name, attrs) => {
      if (rawString(name).startsWith('/')) return all;
      const parsed = parseAttributes(attrs);
      const suffix = rawString(attrs).trim().endsWith('/') ? ' /' : '';
      const attrText = Object.entries(parsed).map(([key, value]) => ` ${key}=${JSON.stringify(value)}`).join('');
      return `<${localName(name)}${attrText}${suffix}>`;
    })
    .replace(/<\s*\/\s*([A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?)\s*>/gsu, (_, name) => `</${localName(name)}>`)
    .replace(/\s+/gu, ' ')
    .trim();
}

function makeCrc32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c >>> 0;
  }
  return table;
}

const CRC32_TABLE = makeCrc32Table();

export function w2Crc32(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(rawString(value), 'utf8');
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function normalizeParts(inputParts, budgets) {
  const rawParts = normalizePartMap(inputParts);
  const admittedParts = {};
  const rejectedParts = [];
  const reasons = [];
  let totalBytes = 0;

  for (const [nameRaw, value] of Object.entries(rawParts)) {
    const name = rawString(nameRaw).replaceAll('\\', '/');
    const partText = textFromChunks(value);
    const partBytes = Buffer.byteLength(partText, 'utf8');
    totalBytes += partBytes;
    if (!ADMITTED_PARTS.includes(name)) {
      rejectedParts.push(name);
      continue;
    }
    if (partBytes > budgets.maxPartBytes) {
      reasons.push(reason(
        'W2_BUDGET_OVERFLOW',
        `parts.${name}`,
        'Admitted DOCX part exceeds the configured byte budget.',
        { partName: name, actual: partBytes, limit: budgets.maxPartBytes },
      ));
      continue;
    }
    admittedParts[name] = partText;
  }

  if (totalBytes > budgets.maxTotalBytes) {
    reasons.push(reason(
      'W2_BUDGET_OVERFLOW',
      'parts',
      'Admitted DOCX package exceeds the configured total byte budget.',
      { actual: totalBytes, limit: budgets.maxTotalBytes },
    ));
  }

  return { admittedParts, rejectedParts, totalBytes, reasons };
}

function rangesOverlap(a, b) {
  if (!Number.isFinite(a.start) || !Number.isFinite(a.end)) return false;
  if (!Number.isFinite(b.start) || !Number.isFinite(b.end)) return false;
  return Math.max(a.start, b.start) < Math.min(a.end, b.end);
}

function evaluatePackageIntegrity(inventory = {}, admittedParts = {}) {
  const reasons = [];
  const entries = Array.isArray(inventory.entries) ? inventory.entries.filter(isPlainObject) : [];
  const ranges = [];

  if (Number(inventory.fakeEocdCount || 0) > 0 || Number(inventory.eocdCount || 1) > 1) {
    reasons.push(reason('W2_PACKAGE_FAKE_EOCD', 'zip.eocd', 'Fake or duplicate EOCD marker is blocked.'));
  }

  for (const entry of entries) {
    const name = rawString(entry.name);
    const centralCrc = Number.isSafeInteger(entry.centralCrc32) ? entry.centralCrc32 : entry.crc32;
    const localCrc = Number.isSafeInteger(entry.localCrc32) ? entry.localCrc32 : centralCrc;
    if (Number.isSafeInteger(centralCrc) && Number.isSafeInteger(localCrc) && centralCrc !== localCrc) {
      reasons.push(reason(
        'W2_PACKAGE_LOCAL_CENTRAL_MISMATCH',
        `zip.${name}.crc32`,
        'ZIP local and central directory metadata disagree.',
        { partName: name },
      ));
    }
    if (Object.hasOwn(admittedParts, name) && Number.isSafeInteger(centralCrc)) {
      const actual = w2Crc32(admittedParts[name]);
      if (actual !== centralCrc) {
        reasons.push(reason(
          'W2_PACKAGE_CRC_MISMATCH',
          `zip.${name}.crc32`,
          'Admitted part CRC does not match package metadata.',
          { partName: name, expected: centralCrc, actual },
        ));
      }
    }
    const start = Number(entry.dataStart ?? entry.start);
    const end = Number(entry.dataEnd ?? entry.end);
    for (const previous of ranges) {
      if (rangesOverlap({ start, end }, previous)) {
        reasons.push(reason(
          'W2_PACKAGE_ENTRY_OVERLAP',
          `zip.${name}.range`,
          'ZIP entry byte ranges overlap and the package is blocked.',
          { partName: name, overlaps: previous.name },
        ));
      }
    }
    ranges.push({ name, start, end });
  }
  return reasons;
}

function classifySourceMode(documentXml, commentsXml) {
  const tracked = /<\s*(?:[A-Za-z_][\w.-]*:)?(?:ins|del|moveFrom|moveTo)\b/iu.test(documentXml);
  const clean = rawString(documentXml).trim().length > 0 && !tracked;
  const comments = /<\s*(?:[A-Za-z_][\w.-]*:)?comment\b/iu.test(commentsXml)
    || /<\s*(?:[A-Za-z_][\w.-]*:)?commentReference\b/iu.test(documentXml);
  if (tracked && comments) return 'MIXED';
  if (tracked) return 'TRACKED';
  if (clean) return comments ? 'MIXED' : 'CLEAN';
  return comments ? 'CLEAN' : 'CLEAN';
}

function extractBodyText(xmlFragment) {
  return stripXmlTags(rawString(xmlFragment).replace(/<\s*(?:[A-Za-z_][\w.-]*:)?tab\s*\/?\s*>/giu, '\t'));
}

function parseTrackedChanges(documentXml, budgets) {
  const changes = [];
  const diagnostics = [];
  const pattern = /<\s*([A-Za-z_][\w.-]*(?::)?(?:ins|del|moveFrom|moveTo))\b([^>]*)>([\s\S]*?)<\s*\/\s*\1\s*>/giu;
  let match;
  let index = 0;
  while ((match = pattern.exec(documentXml)) !== null) {
    const kind = localName(match[1]);
    const attrs = parseAttributes(match[2]);
    const text = extractBodyText(match[3]);
    if (changes.length >= budgets.maxChanges || Buffer.byteLength(text, 'utf8') > budgets.maxChangedTextBytes) {
      diagnostics.push(reason('W2_BUDGET_OVERFLOW', `changes.${index}`, 'Tracked-change budget exceeded.', {
        limit: budgets.maxChanges,
      }));
      break;
    }
    const structural = kind === 'moveFrom' || kind === 'moveTo';
    changes.push({
      changeId: `w2-change-${sha256Buffer(Buffer.from(`${kind}\n${stableJson(attrs)}\n${text}`, 'utf8')).slice(0, 16)}`,
      kind,
      classification: structural ? 'STRUCTURAL_BLOCKED' : 'TEXT_MANUAL',
      textDigest: sha256Json({ kind, text }),
      textExcerpt: text.slice(0, Math.min(96, text.length)),
      attributes: attrs,
      reasonCode: structural ? 'W2_MOVE_REVISION_STRUCTURAL' : 'W2_REVIEW_IR_READY',
    });
    if (structural) {
      diagnostics.push(reason(
        'W2_MOVE_REVISION_STRUCTURAL',
        `changes.${index}.kind`,
        'Move revisions are structural and never lower to an operation.',
        { kind },
      ));
    }
    index += 1;
  }

  const paragraphRevisionPattern = /<\s*(?:[A-Za-z_][\w.-]*:)?pPrChange\b/iu;
  if (paragraphRevisionPattern.test(documentXml)) {
    diagnostics.push(reason(
      'W2_PARAGRAPH_MARK_STRUCTURAL',
      'document.paragraphMarks',
      'Paragraph mark revisions are structural and always blocked.',
    ));
  }

  return { changes, diagnostics };
}

function parseComments(commentsXml, documentXml, budgets) {
  const comments = [];
  const diagnostics = [];
  const pattern = /<\s*(?:[A-Za-z_][\w.-]*:)?comment\b([^>]*)>([\s\S]*?)<\s*\/\s*(?:[A-Za-z_][\w.-]*:)?comment\s*>/giu;
  let match;
  while ((match = pattern.exec(rawString(commentsXml))) !== null) {
    const attrs = parseAttributes(match[1]);
    const body = extractBodyText(match[2]).trim();
    if (comments.length >= budgets.maxComments || Buffer.byteLength(body, 'utf8') > budgets.maxCommentBytes) {
      diagnostics.push(reason('W2_BUDGET_OVERFLOW', 'comments', 'Comment budget exceeded.', {
        limit: budgets.maxComments,
      }));
      break;
    }
    const rawId = rawString(attrs.id || `${comments.length}`);
    const anchored = new RegExp(`<\\s*(?:[A-Za-z_][\\w.-]*:)?commentReference\\b[^>]*(?:id)\\s*=\\s*["']${rawId}["']`, 'iu')
      .test(documentXml);
    comments.push({
      commentId: `w2-comment-${rawId}`,
      rawId,
      bodyDigest: sha256Json({ rawId, body }),
      bodyExcerpt: body.slice(0, Math.min(160, body.length)),
      anchored,
      attributes: attrs,
      lane: 'COMMENTS_CONSERVED',
    });
  }
  if (comments.length > 0) {
    diagnostics.push(reason(
      'W2_COMMENTS_CONSERVED',
      'comments',
      'Comments are conserved in a lane independent from text changes.',
      { commentCount: comments.length },
    ));
  }
  return { comments, diagnostics };
}

function parseModernCommentMetadata(commentsExtendedXml) {
  const metadata = [];
  const pattern = /<\s*(?:[A-Za-z_][\w.-]*:)?commentEx\b([^>]*)\/?\s*>/giu;
  let match;
  while ((match = pattern.exec(rawString(commentsExtendedXml))) !== null) {
    const attrs = parseAttributes(match[1]);
    metadata.push({
      paraId: rawString(attrs.paraId),
      done: rawString(attrs.done) === '1' || rawString(attrs.done).toLowerCase() === 'true',
      attributes: attrs,
      metadataDigest: sha256Json(attrs),
    });
  }
  return metadata;
}

export function buildW2WorkerCapabilityAdapter(capabilities = {}) {
  const hasBlockedAuthority = capabilities.pathAuthority === true
    || capabilities.writerAuthority === true
    || capabilities.networkAuthority === true;
  const reasons = [];
  if (capabilities.pathAuthority === true) {
    reasons.push(reason('W2_WORKER_PATH_AUTHORITY_BLOCKED', 'worker.pathAuthority', 'Worker cannot receive path authority.'));
  }
  if (capabilities.writerAuthority === true) {
    reasons.push(reason('W2_WORKER_WRITER_AUTHORITY_BLOCKED', 'worker.writerAuthority', 'Worker cannot receive writer authority.'));
  }
  if (capabilities.networkAuthority === true) {
    reasons.push(reason('W2_WORKER_NETWORK_AUTHORITY_BLOCKED', 'worker.networkAuthority', 'Worker cannot receive network authority.'));
  }
  return {
    ok: !hasBlockedAuthority,
    schemaVersion: REVISION_BRIDGE_W2_WORKER_CAPABILITY_SCHEMA,
    adapterKind: 'desktop-process-worker',
    canReceivePaths: false,
    canWriteManuscript: false,
    canApply: false,
    networkAccess: false,
    timeoutMs: Number.isSafeInteger(capabilities.timeoutMs) ? capabilities.timeoutMs : 1500,
    cancellation: 'kill-restart',
    code: hasBlockedAuthority ? reasons[0].code : 'W2_WORKER_CAPABILITY_READY',
    reasons,
  };
}

export function buildW2ReviewIr(input = {}) {
  const budgets = normalizeBudget(input.budgets);
  const worker = buildW2WorkerCapabilityAdapter(input.workerCapabilities);
  const normalizedParts = normalizeParts(input.parts, budgets);
  const documentXml = rawString(normalizedParts.admittedParts['word/document.xml']);
  const commentsXml = rawString(normalizedParts.admittedParts['word/comments.xml']);
  const commentsExtendedXml = rawString(normalizedParts.admittedParts['word/commentsExtended.xml']);
  const reasons = [...worker.reasons, ...normalizedParts.reasons];
  reasons.push(...evaluatePackageIntegrity(input.zipInventory, normalizedParts.admittedParts));

  if (!worker.ok || reasons.some((item) => [
    'W2_BUDGET_OVERFLOW',
    'W2_PACKAGE_CRC_MISMATCH',
    'W2_PACKAGE_LOCAL_CENTRAL_MISMATCH',
    'W2_PACKAGE_ENTRY_OVERLAP',
    'W2_PACKAGE_FAKE_EOCD',
  ].includes(item.code))) {
    return {
      ok: false,
      schemaVersion: REVISION_BRIDGE_W2_REVIEW_IR_SCHEMA,
      status: 'blocked',
      code: reasons[0]?.code || 'W2_BUDGET_OVERFLOW',
      canWriteManuscript: false,
      canApply: false,
      reasons,
    };
  }

  if (xmlLooksMalformed(documentXml) || (commentsXml && xmlLooksMalformed(commentsXml))) {
    return {
      ok: false,
      schemaVersion: REVISION_BRIDGE_W2_REVIEW_IR_SCHEMA,
      status: 'blocked',
      code: 'W2_XML_MALFORMED_BLOCKED',
      canWriteManuscript: false,
      canApply: false,
      reasons: [
        ...reasons,
        reason('W2_XML_MALFORMED_BLOCKED', 'parts', 'Malformed XML is deterministically blocked.'),
      ],
    };
  }

  const sourceMode = classifySourceMode(documentXml, commentsXml);
  if (sourceMode === 'CLEAN') {
    reasons.push(reason('W2_CLEAN_MANUAL_OUTCOME', 'sourceMode', 'CLEAN return remains a visible manual outcome.'));
  }
  if (sourceMode === 'MIXED') {
    reasons.push(reason('W2_MIXED_MANUAL_OUTCOME', 'sourceMode', 'MIXED return remains a visible manual outcome.'));
  }

  const tracked = parseTrackedChanges(documentXml, budgets);
  const comments = parseComments(commentsXml, documentXml, budgets);
  const modernCommentMetadata = parseModernCommentMetadata(commentsExtendedXml);
  reasons.push(...tracked.diagnostics, ...comments.diagnostics);

  const semanticProjection = {
    canonicalDocumentXml: canonicalizeXmlForDigest(documentXml),
    canonicalCommentsXml: canonicalizeXmlForDigest(commentsXml),
    sourceMode,
    changes: tracked.changes.map((change) => ({
      kind: change.kind,
      classification: change.classification,
      textDigest: change.textDigest,
      attributes: change.attributes,
    })),
    comments: comments.comments.map((comment) => ({
      rawId: comment.rawId,
      bodyDigest: comment.bodyDigest,
      anchored: comment.anchored,
    })),
    modernCommentMetadata,
  };
  const parserProfile = {
    schemaVersion: 'revision-bridge.w2-parser-profile.v1',
    grammar: 'namespace-aware-bounded-regex-v1',
    budgets,
    admittedParts: Object.keys(normalizedParts.admittedParts).sort(),
  };
  const supportedSemanticDigest = sha256Json(semanticProjection);
  const parserProfileDigest = sha256Json(parserProfile);
  const analysisDigest = sha256Json({
    schemaVersion: REVISION_BRIDGE_W2_REVIEW_IR_SCHEMA,
    supportedSemanticDigest,
    parserProfileDigest,
    sourceMode,
  });
  const cacheKey = sha256Json({
    supportedSemanticDigest,
    parserProfileDigest,
    packageDigest: sha256Json(normalizedParts.admittedParts),
  });

  return {
    ok: true,
    schemaVersion: REVISION_BRIDGE_W2_REVIEW_IR_SCHEMA,
    status: 'review-ir-ready',
    code: 'W2_REVIEW_IR_READY',
    canWriteManuscript: false,
    canApply: false,
    sourceMode,
    worker,
    rejectedParts: normalizedParts.rejectedParts,
    reviewIr: {
      schemaVersion: REVISION_BRIDGE_W2_REVIEW_IR_SCHEMA,
      sourceMode,
      changes: tracked.changes,
      comments: comments.comments,
      modernCommentMetadata,
      structuralDiagnostics: reasons.filter((item) => /STRUCTURAL|BLOCKED|OVERFLOW|CRC|EOCD|MISMATCH|OVERLAP/u.test(item.code)),
      conservation: {
        commentsConserved: true,
        fullTextStoredOnlyForChangedBlocks: true,
        unchangedBlocksStoredAsSpansHashesAndExcerpts: true,
      },
    },
    supportedSemanticDigest,
    parserProfileDigest,
    analysisDigest,
    cacheKey,
    parserProfile,
    reasons: [
      reason('W2_REVIEW_IR_READY', 'reviewIr', 'Bounded deterministic Review IR was produced without write authority.'),
      ...reasons,
    ],
  };
}

export function buildW2RedactedPackageRewriteReport(input = {}) {
  const changedBlocks = Array.isArray(input.changedBlocks) ? input.changedBlocks.filter(isPlainObject) : [];
  const unchangedBlocks = Array.isArray(input.unchangedBlocks) ? input.unchangedBlocks.filter(isPlainObject) : [];
  return {
    schemaVersion: REVISION_BRIDGE_W2_PACKAGE_REWRITE_REPORT_SCHEMA,
    reportId: rawString(input.reportId) || `w2-report-${sha256Json({ changedBlocks, unchangedBlocks }).slice(7, 23)}`,
    canWriteManuscript: false,
    canApply: false,
    changedBlocks: changedBlocks.map((block, index) => ({
      blockId: rawString(block.blockId) || `changed-${index}`,
      originalText: rawString(block.originalText).slice(0, DEFAULT_BUDGETS.maxChangedTextBytes),
      finalText: rawString(block.finalText).slice(0, DEFAULT_BUDGETS.maxChangedTextBytes),
      originalDigest: sha256Json(rawString(block.originalText)),
      finalDigest: sha256Json(rawString(block.finalText)),
    })),
    unchangedBlocks: unchangedBlocks.map((block, index) => {
      const text = rawString(block.text);
      return {
        blockId: rawString(block.blockId) || `unchanged-${index}`,
        span: Array.isArray(block.span) ? block.span.slice(0, 2) : [0, text.length],
        textDigest: sha256Json(text),
        excerpt: text.slice(0, 80),
      };
    }),
  };
}
