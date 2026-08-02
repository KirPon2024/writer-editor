const DEFAULT_META = Object.freeze({
  synopsis: '',
  status: 'черновик',
  tags: Object.freeze({ pov: '', line: '', place: '' }),
});

const DOC_V2_HEADER_PATTERN = /^\[doc-v2 length=(\d+)\]/i;
const DOC_V2_ALLOWED_BLOCK_TYPES = new Set(['doc', 'paragraph', 'text', 'hardBreak']);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJsonValue(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createDefaultDocumentMeta() {
  return {
    synopsis: DEFAULT_META.synopsis,
    status: DEFAULT_META.status,
    tags: { ...DEFAULT_META.tags },
  };
}

export function normalizeDocumentLineEndings(value = '') {
  return String(value ?? '').replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

function trimLegacyTextContent(value = '') {
  return normalizeDocumentLineEndings(value)
    .replace(/\n{3,}/gu, '\n\n')
    .replace(/^\n+/u, '')
    .replace(/\n+$/u, '');
}

export function buildParagraphDocumentFromText(text = '') {
  const lines = normalizeDocumentLineEndings(text).split('\n');
  const content = lines.map((line) => {
    if (!line) {
      return { type: 'paragraph' };
    }
    return {
      type: 'paragraph',
      content: [{ type: 'text', text: line }],
    };
  });

  return {
    type: 'doc',
    content: content.length > 0 ? content : [{ type: 'paragraph' }],
  };
}

function parseIndentedValue(lines, startIndex) {
  const valueLines = [];
  const firstLine = lines[startIndex];
  const rawValue = firstLine.split(':').slice(1).join(':').trim();
  valueLines.push(rawValue);
  let index = startIndex + 1;
  while (index < lines.length) {
    const line = lines[index];
    if (/^[a-zA-Zа-яА-ЯёЁ]+\s*:/u.test(line)) {
      break;
    }
    if (line.startsWith('  ') || line.startsWith('\t')) {
      valueLines.push(line.trim());
    }
    index += 1;
  }
  return { value: valueLines.join('\n').trim(), nextIndex: index };
}

function parseTagsValue(value) {
  const tags = { pov: '', line: '', place: '' };
  String(value || '')
    .split(';')
    .forEach((chunk) => {
      const [rawKey, ...rest] = chunk.split('=');
      const key = (rawKey || '').trim().toLowerCase();
      const val = rest.join('=').trim();
      if (key === 'pov') tags.pov = val;
      if (key === 'линия') tags.line = val;
      if (key === 'место') tags.place = val;
    });
  return tags;
}

function parseMetaBlock(block) {
  const meta = createDefaultDocumentMeta();
  const lines = normalizeDocumentLineEndings(String(block || ''))
    .replace(/\[\/?meta\]/giu, '')
    .split('\n')
    .map((line) => line.trimEnd());

  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }
    if (line.startsWith('status:')) {
      meta.status = line.split(':').slice(1).join(':').trim() || meta.status;
      index += 1;
      continue;
    }
    if (line.startsWith('tags:')) {
      meta.tags = parseTagsValue(line.split(':').slice(1).join(':').trim());
      index += 1;
      continue;
    }
    if (line.startsWith('synopsis:')) {
      const parsed = parseIndentedValue(lines, index);
      meta.synopsis = parsed.value;
      index = parsed.nextIndex;
      continue;
    }
    index += 1;
  }

  return meta;
}

function parseCardBlock(block) {
  const card = { title: '', text: '', tags: '' };
  const lines = normalizeDocumentLineEndings(String(block || ''))
    .replace(/\[\/?card\]/giu, '')
    .split('\n')
    .map((line) => line.trimEnd());

  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }
    if (line.startsWith('title:')) {
      card.title = line.split(':').slice(1).join(':').trim();
      index += 1;
      continue;
    }
    if (line.startsWith('text:')) {
      const parsed = parseIndentedValue(lines, index);
      card.text = parsed.value;
      index = parsed.nextIndex;
      continue;
    }
    if (line.startsWith('tags:')) {
      card.tags = line.split(':').slice(1).join(':').trim();
      index += 1;
      continue;
    }
    index += 1;
  }

  return card;
}

function parseCardsBlock(block) {
  const cards = [];
  const body = normalizeDocumentLineEndings(String(block || '')).replace(/\[\/?cards\]/giu, '').trim();
  const regex = /\[card\][\s\S]*?\[\/card\]/giu;
  let match = regex.exec(body);
  while (match) {
    cards.push(parseCardBlock(match[0]));
    match = regex.exec(body);
  }
  return cards;
}

export function composeMetaBlock(metaEnabled, meta) {
  if (!metaEnabled) return '';

  const safeMeta = isPlainObject(meta) ? meta : createDefaultDocumentMeta();
  const safeTags = isPlainObject(safeMeta.tags) ? safeMeta.tags : createDefaultDocumentMeta().tags;
  const lines = ['[meta]'];
  lines.push(`status: ${safeMeta.status || 'черновик'}`);
  lines.push(`tags: POV=${safeTags.pov || ''}; линия=${safeTags.line || ''}; место=${safeTags.place || ''}`);

  const synopsisLines = normalizeDocumentLineEndings(String(safeMeta.synopsis || '')).split('\n');
  if (synopsisLines.length > 0) {
    lines.push(`synopsis: ${synopsisLines[0] || ''}`);
    for (let index = 1; index < synopsisLines.length; index += 1) {
      lines.push(`  ${synopsisLines[index]}`);
    }
  } else {
    lines.push('synopsis:');
  }

  lines.push('[/meta]');
  return lines.join('\n');
}

export function composeCardsBlock(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return '';

  const lines = ['[cards]'];
  cards.forEach((card) => {
    lines.push('[card]');
    lines.push(`title: ${card?.title || ''}`);
    const textLines = normalizeDocumentLineEndings(String(card?.text || '')).split('\n');
    lines.push(`text: ${textLines[0] || ''}`);
    for (let index = 1; index < textLines.length; index += 1) {
      lines.push(`  ${textLines[index]}`);
    }
    lines.push(`tags: ${card?.tags || ''}`);
    lines.push('[/card]');
  });
  lines.push('[/cards]');
  return lines.join('\n');
}

function canonicalizeJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeJsonValue(item));
  }
  if (isPlainObject(value)) {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = canonicalizeJsonValue(value[key]);
        return acc;
      }, {});
  }
  return value;
}

export function canonicalizeDocumentJson(doc) {
  if (!isPlainObject(doc)) {
    return buildParagraphDocumentFromText('');
  }
  return canonicalizeJsonValue(cloneJsonValue(doc));
}

export function serializeDocumentJson(doc) {
  return JSON.stringify(canonicalizeDocumentJson(doc), null, 2);
}

function createDocumentPayloadIssue(code, reason, userMessage, details = {}) {
  return {
    code,
    reason,
    userMessage,
    details: isPlainObject(details) ? details : {},
  };
}

function extractDocBlock(rawContent) {
  const content = normalizeDocumentLineEndings(rawContent);
  const metaPrefixMatch = content.match(/^\[meta\][\s\S]*?\[\/meta\](?:\n{1,2})?/iu);
  const searchOffset = metaPrefixMatch ? metaPrefixMatch[0].length : 0;
  const docCandidate = content.slice(searchOffset);
  const match = DOC_V2_HEADER_PATTERN.exec(docCandidate);
  if (!match) {
    return {
      found: false,
      doc: null,
      restContent: content,
      issue: null,
    };
  }

  const length = Number.parseInt(match[1], 10);
  if (!Number.isInteger(length) || length < 0) {
    return {
      found: true,
      doc: null,
      restContent: content,
      issue: createDocumentPayloadIssue(
        'E_DOC_PAYLOAD_INVALID',
        'DOC_BLOCK_LENGTH_INVALID',
        'Document payload header is invalid.',
        { header: match[0] },
      ),
    };
  }

  const headerStart = searchOffset + match.index;
  const headerEnd = headerStart + match[0].length;
  const newlineOffset = content.startsWith('\n', headerEnd) ? 1 : 0;
  const docStart = headerEnd + newlineOffset;
  const docEnd = docStart + length;

  if (docEnd > content.length) {
    return {
      found: true,
      doc: null,
      restContent: content.slice(0, headerStart),
      issue: createDocumentPayloadIssue(
        'E_DOC_PAYLOAD_INVALID',
        'DOC_BLOCK_TRUNCATED',
        'Document payload is truncated.',
        { expectedLength: length, availableLength: Math.max(0, content.length - docStart) },
      ),
    };
  }

  const serializedDoc = content.slice(docStart, docEnd);
  const restContent = `${content.slice(0, headerStart)}${content.slice(docEnd)}`;
  try {
    return {
      found: true,
      doc: canonicalizeDocumentJson(JSON.parse(serializedDoc)),
      restContent,
      issue: null,
    };
  } catch (error) {
    return {
      found: true,
      doc: null,
      restContent,
      issue: createDocumentPayloadIssue(
        'E_DOC_PAYLOAD_INVALID',
        'DOC_BLOCK_JSON_INVALID',
        'Document payload JSON is invalid.',
        { message: error && typeof error.message === 'string' ? error.message : 'UNKNOWN' },
      ),
    };
  }
}

function deriveInlineText(node) {
  if (!node || typeof node !== 'object') return '';
  if (node.type === 'text') {
    return typeof node.text === 'string' ? node.text : '';
  }
  if (node.type === 'hardBreak') {
    return '\n';
  }
  if (!Array.isArray(node.content)) return '';
  return node.content.map((child) => deriveInlineText(child)).join('');
}

export function deriveVisibleTextFromDocument(doc) {
  if (!isPlainObject(doc) || !Array.isArray(doc.content)) {
    return '';
  }

  const blocks = [];
  const visitBlock = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'codeBlock') {
      blocks.push(deriveInlineText(node));
      return;
    }
    if (node.type === 'horizontalRule') {
      blocks.push('');
      return;
    }
    if (node.type === 'text') {
      blocks.push(typeof node.text === 'string' ? node.text : '');
      return;
    }
    if (Array.isArray(node.content) && node.content.length > 0) {
      const childBlocksBefore = blocks.length;
      node.content.forEach((child) => visitBlock(child));
      if (blocks.length === childBlocksBefore) {
        blocks.push(deriveInlineText(node));
      }
      return;
    }
    if (node.type === 'hardBreak') {
      blocks.push('');
    }
  };

  doc.content.forEach((node) => visitBlock(node));
  return trimLegacyTextContent(blocks.join('\n'));
}

export function analyzeDocumentPlainTextRoundTrip(doc) {
  const unsupportedNodeTypes = new Set();
  let markedTextPresent = false;
  let attributedNodePresent = false;

  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    const nodeType = typeof node.type === 'string' ? node.type : '';
    if (!DOC_V2_ALLOWED_BLOCK_TYPES.has(nodeType)) {
      unsupportedNodeTypes.add(nodeType || 'unknown');
    }
    if (Array.isArray(node.marks) && node.marks.length > 0) {
      markedTextPresent = true;
    }
    if (isPlainObject(node.attrs) && Object.keys(node.attrs).length > 0) {
      attributedNodePresent = true;
    }
    if (Array.isArray(node.content)) {
      node.content.forEach((child) => visit(child));
    }
  };

  visit(doc);

  return {
    safe: unsupportedNodeTypes.size === 0 && markedTextPresent === false && attributedNodePresent === false,
    unsupportedNodeTypes: [...unsupportedNodeTypes].sort(),
    markedTextPresent,
    attributedNodePresent,
  };
}

export function parseObservablePayload(rawText = '') {
  const normalizedRaw = normalizeDocumentLineEndings(rawText);
  const docBlock = extractDocBlock(normalizedRaw);
  let content = docBlock.restContent;
  let meta = createDefaultDocumentMeta();
  let cards = [];
  let hasMetaBlock = false;
  let hasCardsBlock = false;

  const metaMatch = content.match(/\[meta\][\s\S]*?\[\/meta\]/iu);
  if (metaMatch) {
    meta = parseMetaBlock(metaMatch[0]);
    content = content.replace(metaMatch[0], '');
    hasMetaBlock = true;
  }

  const cardsMatch = content.match(/\[cards\][\s\S]*?\[\/cards\]/iu);
  if (cardsMatch) {
    cards = parseCardsBlock(cardsMatch[0]);
    content = content.replace(cardsMatch[0], '');
    hasCardsBlock = true;
  }

  const legacyText = trimLegacyTextContent(content);
  let issue = docBlock.issue;
  if (!issue && docBlock.doc && legacyText.length > 0) {
    issue = createDocumentPayloadIssue(
      'E_DOC_PAYLOAD_INVALID',
      'DOC_BLOCK_LEGACY_TEXT_CONFLICT',
      'Document payload contains conflicting plain text outside the rich document block.',
      { legacyTextLength: legacyText.length },
    );
  }

  return {
    version: docBlock.doc ? 2 : 1,
    text: docBlock.doc ? deriveVisibleTextFromDocument(docBlock.doc) : legacyText,
    doc: docBlock.doc,
    meta,
    cards,
    issue,
    hasMetaBlock,
    hasCardsBlock,
  };
}

export function composeObservablePayload({
  doc = null,
  text = '',
  metaEnabled = false,
  meta = createDefaultDocumentMeta(),
  cards = [],
} = {}) {
  const parts = [];
  const metaBlock = composeMetaBlock(metaEnabled, meta);
  if (metaBlock) {
    parts.push(metaBlock);
  }

  if (isPlainObject(doc)) {
    const serializedDoc = serializeDocumentJson(doc);
    parts.push(`[doc-v2 length=${serializedDoc.length}]\n${serializedDoc}`);
  } else {
    const legacyText = trimLegacyTextContent(text);
    if (legacyText) {
      parts.push(legacyText);
    }
  }

  const cardsBlock = composeCardsBlock(cards);
  if (cardsBlock) {
    parts.push(cardsBlock);
  }

  return parts.filter(Boolean).join('\n\n');
}

export function composeDocumentContentFromBase({
  baseContent = '',
  nextVisibleText = '',
  metaEnabled = null,
} = {}) {
  const parsed = parseObservablePayload(baseContent);
  const normalizedNextVisibleText = trimLegacyTextContent(nextVisibleText);
  const metaEnabledValue = metaEnabled === null ? parsed.hasMetaBlock : Boolean(metaEnabled);

  if (parsed.doc) {
    const analysis = analyzeDocumentPlainTextRoundTrip(parsed.doc);
    const canonicalParsedDoc = serializeDocumentJson(parsed.doc);
    const canonicalParagraphDoc = serializeDocumentJson(buildParagraphDocumentFromText(parsed.text || ''));
    const matchesLegacyParagraphShape = canonicalParsedDoc === canonicalParagraphDoc;
    const unchangedVisibleText = normalizedNextVisibleText === trimLegacyTextContent(parsed.text || '');

    if (!analysis.safe) {
      return {
        ok: false,
        error: {
          code: 'M7_FLOW_SCENE_RICH_CONTENT_UNSUPPORTED',
          reason: 'flow_scene_rich_content_unsupported',
          details: analysis,
        },
      };
    }

    if (!matchesLegacyParagraphShape) {
      if (unchangedVisibleText) {
        return {
          ok: true,
          content: composeObservablePayload({
            doc: parsed.doc,
            metaEnabled: metaEnabledValue,
            meta: parsed.meta,
            cards: parsed.cards,
          }),
        };
      }

      return {
        ok: false,
        error: {
          code: 'M7_FLOW_SCENE_RICH_CONTENT_UNSUPPORTED',
          reason: 'flow_scene_rich_content_unsupported',
          details: {
            ...analysis,
            requiresStructuredDocPreservation: true,
          },
        },
      };
    }
  }

  return {
    ok: true,
    content: composeObservablePayload({
      doc: buildParagraphDocumentFromText(normalizedNextVisibleText),
      metaEnabled: metaEnabledValue,
      meta: parsed.meta,
      cards: parsed.cards,
    }),
  };
}
