import { createDerivedError, deriveView, hashCanonicalValue } from '../deriveView.mjs';
import { canonicalizeAtlasMentionIndex } from './atlasMentionTypes.mjs';
import { normalizeAtlasObservationLanguagePolicy } from './atlasObservationTypes.mjs';
import { buildAtlasTextAnchorPacket } from './atlasTextAnchorNormalization.mjs';

const VIEW_ID = 'derived.atlas.mentionIndex.v1';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLanguageCode(value) {
  const normalized = normalizeString(value).toLowerCase().replace(/_/gu, '-');
  return normalized || 'und';
}

function isAtlasMentionCapabilityEnabled(snapshot) {
  if (!isPlainObject(snapshot)) return true;
  if (snapshot['atlas.mentionIndex'] === false) return false;
  const capabilities = isPlainObject(snapshot.capabilities) ? snapshot.capabilities : {};
  if (capabilities['atlas.mentionIndex'] === false) return false;
  if (capabilities.atlasMentionIndex === false) return false;
  if (isPlainObject(capabilities.atlas) && capabilities.atlas.mentionIndex === false) return false;
  return true;
}

function isTokenChar(char) {
  return typeof char === 'string' && char.length > 0 && /[\p{L}\p{N}_]/u.test(char);
}

function hasExactBoundaries(text, startOffset, endOffset, term) {
  const before = startOffset > 0 ? text[startOffset - 1] : '';
  const after = endOffset < text.length ? text[endOffset] : '';
  const first = term[0] || '';
  const last = term[term.length - 1] || '';
  if (isTokenChar(first) && isTokenChar(before)) return false;
  if (isTokenChar(last) && isTokenChar(after)) return false;
  return true;
}

function collectEntityTerms(atlas) {
  const entities = isPlainObject(atlas?.entities) ? atlas.entities : {};
  const terms = [];
  for (const entityId of Object.keys(entities).sort()) {
    const entity = isPlainObject(entities[entityId]) ? entities[entityId] : {};
    const effectiveEntityId = entity.mergeState === 'MERGED'
      && normalizeString(entity.mergedIntoEntityId)
      && isPlainObject(entities[normalizeString(entity.mergedIntoEntityId)])
      ? normalizeString(entity.mergedIntoEntityId)
      : entityId;
    const entityName = normalizeString(entity.name);
    if (entityName) {
      terms.push({
        entityId: effectiveEntityId,
        sourceEntityId: entityId,
        termId: `entity-name:${entityId}`,
        termKind: 'entityName',
        value: entityName,
      });
    }
    const aliases = isPlainObject(entity.aliases) ? entity.aliases : {};
    for (const aliasId of Object.keys(aliases).sort()) {
      const alias = isPlainObject(aliases[aliasId]) ? aliases[aliasId] : {};
      const aliasValue = normalizeString(alias.value);
      if (!aliasValue) continue;
      terms.push({
        entityId: effectiveEntityId,
        sourceEntityId: entityId,
        termId: `alias:${aliasId}`,
        termKind: 'alias',
        value: aliasValue,
        aliasId,
        scope: alias.scope === 'scene' ? 'scene' : 'project',
        sceneId: normalizeString(alias.sceneId),
      });
    }
  }
  return terms;
}

function normalizeLanguageTag(input) {
  if (!isPlainObject(input)) return null;
  const scopeKind = normalizeString(input.scopeKind);
  const languageCode = normalizeLanguageCode(input.languageCode);
  if (!scopeKind || !languageCode) return null;
  return {
    id: normalizeString(input.id),
    scopeKind,
    sceneId: normalizeString(input.sceneId),
    startOffset: Number.isSafeInteger(Number(input.startOffset)) ? Number(input.startOffset) : 0,
    endOffset: Number.isSafeInteger(Number(input.endOffset)) ? Number(input.endOffset) : 0,
    languageCode,
  };
}

function collectLanguageTags(atlas) {
  const source = isPlainObject(atlas?.languageTags) ? atlas.languageTags : {};
  const tags = [];
  const projectTag = normalizeLanguageTag(source.project);
  if (projectTag) tags.push(projectTag);
  for (const bucketName of ['scenes', 'ranges']) {
    const bucket = isPlainObject(source[bucketName]) ? source[bucketName] : {};
    for (const tag of Object.values(bucket)) {
      const normalized = normalizeLanguageTag(tag);
      if (normalized) tags.push(normalized);
    }
  }
  return tags.sort((left, right) => {
    if (left.scopeKind !== right.scopeKind) return left.scopeKind.localeCompare(right.scopeKind, 'en', { sensitivity: 'variant' });
    if (left.sceneId !== right.sceneId) return left.sceneId.localeCompare(right.sceneId, 'en', { sensitivity: 'variant' });
    if (left.startOffset !== right.startOffset) return left.startOffset - right.startOffset;
    if (left.endOffset !== right.endOffset) return left.endOffset - right.endOffset;
    return left.id.localeCompare(right.id, 'en', { sensitivity: 'variant' });
  });
}

function resolveLanguageRouteForMention({ project, tags, sceneId, startOffset, endOffset }) {
  const defaultLanguageCode = normalizeLanguageCode(project?.languageCode);
  const projectTag = tags.find((tag) => tag.scopeKind === 'project');
  const sceneTag = tags.find((tag) => tag.scopeKind === 'scene' && tag.sceneId === sceneId);
  const rangeTag = [...tags]
    .filter((tag) => (
      tag.scopeKind === 'range'
      && tag.sceneId === sceneId
      && tag.startOffset <= startOffset
      && tag.endOffset >= endOffset
    ))
    .sort((left, right) => {
      const leftSize = left.endOffset - left.startOffset;
      const rightSize = right.endOffset - right.startOffset;
      if (leftSize !== rightSize) return leftSize - rightSize;
      return left.id.localeCompare(right.id, 'en', { sensitivity: 'variant' });
    })[0] || null;
  const sourceTag = rangeTag || sceneTag || projectTag || null;
  const policy = normalizeAtlasObservationLanguagePolicy(sourceTag?.languageCode || defaultLanguageCode);
  return {
    schemaVersion: 'derived.atlas.mentionLanguageRoute.v1',
    languageCode: policy.languageCode,
    sourceKind: sourceTag ? `author-${sourceTag.scopeKind}` : 'project-default',
    sourceTagId: sourceTag?.id || '',
    analyzerId: policy.analyzerId,
    languagePolicy: policy.policy,
    exactOnly: true,
    fuzzyMatching: false,
    englishFallback: false,
  };
}

function buildEvidenceAnchor({ projectId, sceneId, entityId, termId, startOffset, endOffset, sceneText }) {
  const packet = buildAtlasTextAnchorPacket({
    projectId,
    sceneId,
    entityId,
    termId,
    startOffset,
    endOffset,
    sceneText,
  });
  return packet.evidenceAnchor;
}

function collectTermMentions({ project, projectId, sceneId, sceneText, term, languageTags }) {
  const out = [];
  if (term.scope === 'scene' && term.sceneId !== sceneId) return out;
  let cursor = 0;
  while (cursor <= sceneText.length) {
    const found = sceneText.indexOf(term.value, cursor);
    if (found < 0) break;
    const endOffset = found + term.value.length;
    if (hasExactBoundaries(sceneText, found, endOffset, term.value)) {
      const anchor = buildEvidenceAnchor({
        projectId,
        sceneId,
        entityId: term.entityId,
        termId: term.termId,
        startOffset: found,
        endOffset,
        sceneText,
      });
      const languageRoute = resolveLanguageRouteForMention({
        project,
        tags: languageTags,
        sceneId,
        startOffset: found,
        endOffset,
      });
      out.push({
        mentionId: `atlas-mention:${hashCanonicalValue({
          projectId,
          sceneId,
          entityId: term.entityId,
          termId: term.termId,
          startOffset: found,
          endOffset,
          quoteHash: anchor.quoteHash,
        })}`,
        projectId,
        sceneId,
        entityId: term.entityId,
        termId: term.termId,
        termKind: term.termKind,
        aliasId: term.aliasId || '',
        matchedText: term.value,
        languageCode: languageRoute.languageCode,
        languageRoute,
        startOffset: found,
        endOffset,
        evidenceAnchor: anchor,
      });
    }
    cursor = Math.max(endOffset, found + 1);
  }
  return out;
}

function deriveSceneShard(project, projectId, sceneId, scene, terms, languageTags) {
  const sceneText = typeof scene.text === 'string' ? scene.text : '';
  const mentions = [];
  for (const term of terms) {
    mentions.push(...collectTermMentions({
      project,
      projectId,
      sceneId,
      sceneText,
      term,
      languageTags,
    }));
  }
  const sortedMentions = mentions.sort((a, b) => {
    if (a.startOffset !== b.startOffset) return a.startOffset - b.startOffset;
    if (a.endOffset !== b.endOffset) return a.endOffset - b.endOffset;
    if (a.entityId !== b.entityId) return a.entityId.localeCompare(b.entityId, 'en', { sensitivity: 'variant' });
    return a.termId.localeCompare(b.termId, 'en', { sensitivity: 'variant' });
  });
  return {
    sceneId,
    sceneTextHash: hashCanonicalValue(sceneText),
    mentionIds: sortedMentions.map((mention) => mention.mentionId),
    mentionCount: sortedMentions.length,
    mentions: sortedMentions,
  };
}

function buildAtlasMentionIndex(coreState, projectId) {
  const projects = isPlainObject(coreState?.data?.projects) ? coreState.data.projects : {};
  const project = isPlainObject(projects[projectId]) ? projects[projectId] : null;
  if (!project) {
    throw createDerivedError(
      'E_ATLAS_PROJECT_NOT_FOUND',
      'derived.atlas.mentionIndex',
      'PROJECT_NOT_FOUND',
      { projectId },
    );
  }
  const atlas = isPlainObject(project.atlas) ? project.atlas : {};
  const terms = collectEntityTerms(atlas);
  const languageTags = collectLanguageTags(atlas);
  const scenes = isPlainObject(project.scenes) ? project.scenes : {};
  const sceneShards = [];
  const mentions = [];
  for (const sceneId of Object.keys(scenes).sort()) {
    const scene = isPlainObject(scenes[sceneId]) ? scenes[sceneId] : {};
    const shard = deriveSceneShard(project, projectId, sceneId, scene, terms, languageTags);
    mentions.push(...shard.mentions);
    sceneShards.push({
      sceneId: shard.sceneId,
      sceneTextHash: shard.sceneTextHash,
      mentionIds: shard.mentionIds,
      mentionCount: shard.mentionCount,
    });
  }
  return canonicalizeAtlasMentionIndex({ projectId, mentions, sceneShards });
}

export function deriveAtlasMentionIndex(input = {}) {
  const projectId = normalizeString(input?.params?.projectId);
  if (!projectId) {
    return {
      ok: false,
      error: {
        code: 'E_ATLAS_PROJECT_ID_REQUIRED',
        op: 'derived.atlas.mentionIndex',
        reason: 'PROJECT_ID_REQUIRED',
      },
    };
  }

  return deriveView({
    viewId: VIEW_ID,
    coreState: input.coreState,
    params: {
      ...input.params,
      projectId,
    },
    capabilitySnapshot: input.capabilitySnapshot,
    derive: ({ coreState, params, capabilitySnapshot, meta }) => {
      if (!isAtlasMentionCapabilityEnabled(capabilitySnapshot)) {
        throw createDerivedError(
          'E_CAPABILITY_DISABLED_FOR_COMMAND',
          'derived.atlas.mentionIndex',
          'ATLAS_MENTION_INDEX_DISABLED',
          { capabilityId: 'atlas.mentionIndex' },
        );
      }
      const index = buildAtlasMentionIndex(coreState, params.projectId);
      const indexHash = hashCanonicalValue({
        mentions: index.mentions,
        sceneShards: index.sceneShards,
      });
      return {
        ...index,
        meta: {
          indexHash,
          invalidationKey: meta.invalidationKey,
        },
      };
    },
  });
}

export { VIEW_ID as ATLAS_MENTION_INDEX_VIEW_ID };
