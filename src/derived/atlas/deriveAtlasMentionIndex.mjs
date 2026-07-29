import { createDerivedError, deriveView, hashCanonicalValue } from '../deriveView.mjs';
import {
  ATLAS_EVIDENCE_ANCHOR_SCHEMA_VERSION,
  canonicalizeAtlasMentionIndex,
} from './atlasMentionTypes.mjs';

const VIEW_ID = 'derived.atlas.mentionIndex.v1';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
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

function buildEvidenceAnchor({ projectId, sceneId, entityId, termId, startOffset, endOffset, quote, sceneText }) {
  const quoteHash = hashCanonicalValue(quote);
  const sceneTextHash = hashCanonicalValue(sceneText);
  const anchorHash = hashCanonicalValue({
    projectId,
    sceneId,
    entityId,
    termId,
    startOffset,
    endOffset,
    quoteHash,
    sceneTextHash,
  });
  return {
    schemaVersion: ATLAS_EVIDENCE_ANCHOR_SCHEMA_VERSION,
    anchorId: `atlas-anchor:${anchorHash}`,
    projectId,
    sceneId,
    entityId,
    startOffset,
    endOffset,
    quote,
    quoteHash,
    sceneTextHash,
  };
}

function collectTermMentions({ projectId, sceneId, sceneText, term }) {
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
        quote: sceneText.slice(found, endOffset),
        sceneText,
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
        startOffset: found,
        endOffset,
        evidenceAnchor: anchor,
      });
    }
    cursor = Math.max(endOffset, found + 1);
  }
  return out;
}

function deriveSceneShard(projectId, sceneId, scene, terms) {
  const sceneText = typeof scene.text === 'string' ? scene.text : '';
  const mentions = [];
  for (const term of terms) {
    mentions.push(...collectTermMentions({
      projectId,
      sceneId,
      sceneText,
      term,
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
  const scenes = isPlainObject(project.scenes) ? project.scenes : {};
  const sceneShards = [];
  const mentions = [];
  for (const sceneId of Object.keys(scenes).sort()) {
    const scene = isPlainObject(scenes[sceneId]) ? scenes[sceneId] : {};
    const shard = deriveSceneShard(projectId, sceneId, scene, terms);
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
