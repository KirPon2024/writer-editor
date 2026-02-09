import { appendLoss, createLossReport, finalizeLossReport } from './lossReport.mjs';
import {
  createMarkdownTransformError,
  normalizeLimits,
  normalizeMarkdownInput,
} from './types.mjs';

function assertTimeBudget(startMs, limits) {
  if (Date.now() - startMs > limits.maxMillis) {
    throw createMarkdownTransformError('E_MD_LIMIT_TIMEOUT', 'parse_time_budget_exceeded', {
      maxMillis: limits.maxMillis,
    });
  }
}

function assertNodeBudget(nodeCount, limits) {
  if (nodeCount > limits.maxNodes) {
    throw createMarkdownTransformError('E_MD_LIMIT_NODES', 'max_nodes_exceeded', {
      maxNodes: limits.maxNodes,
      nodeCount,
    });
  }
}

function assertInputBudget(markdown, limits) {
  const byteLen = Buffer.byteLength(markdown, 'utf8');
  if (byteLen > limits.maxInputBytes) {
    throw createMarkdownTransformError('E_MD_LIMIT_SIZE', 'max_input_bytes_exceeded', {
      maxInputBytes: limits.maxInputBytes,
      byteLen,
    });
  }
}

function validateUriTarget(target) {
  const trimmed = String(target || '').trim();
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed);
  if (!schemeMatch) return;
  const scheme = schemeMatch[1].toLowerCase();
  if (scheme === 'javascript' || scheme === 'data') {
    throw createMarkdownTransformError('E_MD_SECURITY_URI_SCHEME_DENIED', 'unsafe_uri_scheme', {
      scheme,
      target: trimmed,
    });
  }
}

function scanTextSecurity(text) {
  const value = String(text || '');
  const htmlRe = /<[^>\n]+>/g;
  if (htmlRe.test(value)) {
    throw createMarkdownTransformError('E_MD_SECURITY_RAW_HTML', 'raw_html_not_allowed', {
      evidence: value.slice(0, 140),
    });
  }
  const linkRe = /\[[^\]]+]\(([^)]+)\)/g;
  let match;
  while ((match = linkRe.exec(value)) !== null) {
    validateUriTarget(match[1]);
  }
}

function normalizeFenceLanguage(raw) {
  return String(raw || '').trim().toLowerCase();
}

function normalizeListLine(line) {
  const unordered = /^(\s*)[-*+]\s+(.+)$/.exec(line);
  if (unordered) return { ordered: false, indent: unordered[1].length, text: unordered[2] };
  const ordered = /^(\s*)\d+\.\s+(.+)$/.exec(line);
  if (ordered) return { ordered: true, indent: ordered[1].length, text: ordered[2] };
  return null;
}

function parseBlocks(lines, limits, lossReport, startMs) {
  const blocks = [];
  let nodes = 0;
  let i = 0;

  const pushBlock = (block) => {
    blocks.push(block);
    nodes += 1;
    assertNodeBudget(nodes, limits);
  };

  while (i < lines.length) {
    assertTimeBudget(startMs, limits);
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      i += 1;
      continue;
    }

    if (/^\[\^[^\]]+]:/.test(trimmed) || /\[\^[^\]]+]/.test(trimmed)) {
      appendLoss(lossReport, {
        kind: 'FOOTNOTE_UNSUPPORTED',
        path: `line:${i + 1}`,
        note: 'Footnotes are unsupported in Markdown v1.',
        evidence: trimmed,
      });
    }

    const headingMatch = /^#{1,6}\s+/.exec(trimmed);
    if (headingMatch) {
      scanTextSecurity(trimmed);
      const level = headingMatch[0].trim().length;
      const text = trimmed.slice(headingMatch[0].length).trimEnd();
      pushBlock({ type: 'heading', level, text });
      i += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      pushBlock({ type: 'thematicBreak' });
      i += 1;
      continue;
    }

    const fenceOpen = /^```(.*)$/.exec(trimmed);
    if (fenceOpen) {
      const language = normalizeFenceLanguage(fenceOpen[1]);
      const codeLines = [];
      i += 1;
      while (i < lines.length && !/^```$/.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length && /^```$/.test(lines[i].trim())) i += 1;
      pushBlock({ type: 'codeFence', language, code: codeLines.join('\n') });
      continue;
    }

    if (trimmed.startsWith('>')) {
      const quoteLines = [];
      while (i < lines.length) {
        const q = lines[i].trim();
        if (!q.startsWith('>')) break;
        const text = q.replace(/^>\s?/, '');
        scanTextSecurity(text);
        quoteLines.push(text);
        i += 1;
      }
      pushBlock({ type: 'blockquote', text: quoteLines.join('\n') });
      continue;
    }

    const listCandidate = normalizeListLine(line);
    if (listCandidate) {
      const depth = Math.floor(listCandidate.indent / 2) + 1;
      if (depth > limits.maxDepth) {
        throw createMarkdownTransformError('E_MD_LIMIT_DEPTH', 'max_depth_exceeded', {
          maxDepth: limits.maxDepth,
          depth,
          line: i + 1,
        });
      }
      const items = [];
      const ordered = listCandidate.ordered;
      while (i < lines.length) {
        const parsed = normalizeListLine(lines[i]);
        if (!parsed || parsed.ordered !== ordered) break;
        const itemDepth = Math.floor(parsed.indent / 2) + 1;
        if (itemDepth > limits.maxDepth) {
          throw createMarkdownTransformError('E_MD_LIMIT_DEPTH', 'max_depth_exceeded', {
            maxDepth: limits.maxDepth,
            depth: itemDepth,
            line: i + 1,
          });
        }
        let text = parsed.text;
        if (/^\[[xX ]]\s+/.test(text)) {
          appendLoss(lossReport, {
            kind: 'TASK_LIST_UNSUPPORTED',
            path: `line:${i + 1}`,
            note: 'Task list markers are downgraded to plain list items.',
            evidence: text,
          });
          text = text.replace(/^\[[xX ]]\s+/, '');
        }
        scanTextSecurity(text);
        items.push({ text: text.trimEnd() });
        nodes += 1;
        assertNodeBudget(nodes, limits);
        i += 1;
      }
      pushBlock({ type: 'list', ordered, items });
      continue;
    }

    const next = i + 1 < lines.length ? lines[i + 1] : '';
    if (trimmed.includes('|') && /^[:\-\s|]+$/.test(String(next).trim())) {
      appendLoss(lossReport, {
        kind: 'TABLE_UNSUPPORTED',
        path: `line:${i + 1}`,
        note: 'Table syntax is downgraded to plain paragraph.',
        evidence: trimmed,
      });
    }

    const paragraphLines = [];
    while (i < lines.length) {
      const current = lines[i];
      const currentTrim = current.trim();
      if (currentTrim.length === 0) break;
      if (/^#{1,6}\s+/.test(currentTrim)) break;
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(currentTrim)) break;
      if (/^```/.test(currentTrim)) break;
      if (currentTrim.startsWith('>')) break;
      if (normalizeListLine(current)) break;
      scanTextSecurity(currentTrim);
      paragraphLines.push(currentTrim);
      i += 1;
    }
    pushBlock({ type: 'paragraph', text: paragraphLines.join(' ') });
  }

  return { blocks, nodes };
}

export function parseMarkdownV1(markdownInput, options = {}) {
  const limits = normalizeLimits(options.limits);
  const markdown = normalizeMarkdownInput(markdownInput);
  assertInputBudget(markdown, limits);

  const startMs = Date.now();
  const lossReport = createLossReport();
  const lines = markdown.split('\n');
  const { blocks, nodes } = parseBlocks(lines, limits, lossReport, startMs);

  return {
    kind: 'scene.v1',
    blocks,
    nodeCount: nodes,
    lossReport: finalizeLossReport(lossReport),
  };
}
