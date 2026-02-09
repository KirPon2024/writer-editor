import { createMarkdownTransformError } from './types.mjs';

function toLF(text) {
  return String(text ?? '').replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

function normalizeFenceLanguage(language) {
  return String(language ?? '').trim().toLowerCase();
}

function normalizeText(text) {
  return toLF(text).replace(/[ \t]+$/gm, '');
}

function serializeBlock(block) {
  if (!block || typeof block !== 'object') {
    throw createMarkdownTransformError('E_MD_SERIALIZE_INVALID_BLOCK', 'invalid_block_shape');
  }

  switch (block.type) {
    case 'heading': {
      const level = Number.isInteger(block.level) ? block.level : 1;
      const bounded = Math.min(6, Math.max(1, level));
      return `${'#'.repeat(bounded)} ${normalizeText(block.text)}`.trimEnd();
    }
    case 'thematicBreak':
      return '---';
    case 'blockquote': {
      const lines = normalizeText(block.text).split('\n');
      return lines.map((line) => `> ${line}`.trimEnd()).join('\n');
    }
    case 'list': {
      const items = Array.isArray(block.items) ? block.items : [];
      return items
        .map((item, index) => {
          const text = normalizeText(item?.text);
          const prefix = block.ordered ? `${index + 1}. ` : '- ';
          return `${prefix}${text}`.trimEnd();
        })
        .join('\n');
    }
    case 'codeFence': {
      const language = normalizeFenceLanguage(block.language);
      const code = normalizeText(block.code);
      const open = language.length > 0 ? `\`\`\`${language}` : '```';
      return `${open}\n${code}\n\`\`\``;
    }
    case 'paragraph':
      return normalizeText(block.text);
    default:
      throw createMarkdownTransformError('E_MD_SERIALIZE_UNKNOWN_BLOCK', 'unknown_block_type', {
        type: String(block.type || ''),
      });
  }
}

export function serializeMarkdownV1(sceneModel) {
  if (!sceneModel || typeof sceneModel !== 'object' || !Array.isArray(sceneModel.blocks)) {
    throw createMarkdownTransformError('E_MD_SERIALIZE_INVALID_SCENE', 'invalid_scene_model');
  }

  const parts = [];
  for (const block of sceneModel.blocks) {
    const rendered = serializeBlock(block);
    if (rendered.trim().length === 0) continue;
    if (parts.length > 0) parts.push('');
    parts.push(rendered);
  }
  const normalized = parts.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
  return `${normalized}\n`;
}
