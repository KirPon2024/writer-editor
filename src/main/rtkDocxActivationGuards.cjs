'use strict';

const crypto = require('node:crypto');
const path = require('node:path');

function sha256BytesDefault(bytes) {
  return `sha256:${crypto.createHash('sha256').update(Buffer.from(bytes || [])).digest('hex')}`;
}

function createDocxActivationRequestDigestGuard(options = {}) {
  const maxEntries = Number.isSafeInteger(options.maxEntries) && options.maxEntries > 0
    ? options.maxEntries
    : 128;
  const sha256Bytes = typeof options.sha256Bytes === 'function'
    ? options.sha256Bytes
    : sha256BytesDefault;
  const requestDigests = new Map();

  function normalizeRequestId(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function digest(bytes) {
    const value = sha256Bytes(bytes);
    return typeof value === 'string' ? value : String(value || '');
  }

  function check({ requestId, bytes } = {}) {
    const normalizedRequestId = normalizeRequestId(requestId);
    if (!normalizedRequestId) {
      return {
        ok: false,
        status: 'blocked',
        code: 'RTK_DOCX_ACTIVATION_REQUEST_ID_REQUIRED',
        reason: 'RTK_DOCX_ACTIVATION_REQUEST_ID_REQUIRED',
      };
    }
    const artifactDigest = digest(bytes);
    if (!artifactDigest) {
      return {
        ok: false,
        status: 'blocked',
        code: 'RTK_DOCX_ACTIVATION_ARTIFACT_DIGEST_REQUIRED',
        reason: 'RTK_DOCX_ACTIVATION_ARTIFACT_DIGEST_REQUIRED',
      };
    }
    const priorDigest = requestDigests.get(normalizedRequestId) || '';
    if (priorDigest && priorDigest !== artifactDigest) {
      return {
        ok: false,
        status: 'blocked',
        code: 'RTK_DOCX_ACTIVATION_DUPLICATE_REQUEST_MUTATED_PAYLOAD',
        reason: 'RTK_DOCX_ACTIVATION_DUPLICATE_REQUEST_MUTATED_PAYLOAD',
        requestId: normalizedRequestId,
        artifactDigest,
        priorDigest,
      };
    }
    return {
      ok: true,
      status: priorDigest ? 'replay' : 'new',
      requestId: normalizedRequestId,
      artifactDigest,
      priorDigest,
    };
  }

  function remember({ requestId, bytes } = {}) {
    const checked = check({ requestId, bytes });
    if (!checked.ok) return checked;
    if (checked.status === 'new') {
      requestDigests.set(checked.requestId, checked.artifactDigest);
      while (requestDigests.size > maxEntries) {
        const oldest = requestDigests.keys().next().value;
        requestDigests.delete(oldest);
      }
    }
    return checked;
  }

  function clear() {
    requestDigests.clear();
  }

  function size() {
    return requestDigests.size;
  }

  return { check, remember, clear, size };
}

function fullManuscriptBindingBlocked(reason, details = {}) {
  return {
    ok: false,
    status: 'blocked',
    code: reason,
    reason,
    details,
  };
}

function verifyFullManuscriptCurrentSceneBindings(input = {}, deps = {}) {
  const projectRoot = typeof input.projectRoot === 'string' && input.projectRoot.trim()
    ? path.resolve(input.projectRoot)
    : '';
  const exportMapScenes = Array.isArray(input.exportMapScenes) ? input.exportMapScenes : [];
  const scenePathBySceneId = input.scenePathBySceneId && typeof input.scenePathBySceneId === 'object'
    ? input.scenePathBySceneId
    : {};
  const readFileSync = typeof deps.readFileSync === 'function' ? deps.readFileSync : null;
  const sha256Text = typeof deps.sha256Text === 'function' ? deps.sha256Text : null;
  const isPathInsideBoundary = typeof deps.isPathInsideBoundary === 'function'
    ? deps.isPathInsideBoundary
    : null;
  if (!projectRoot || exportMapScenes.length === 0 || !readFileSync || !sha256Text || !isPathInsideBoundary) {
    return fullManuscriptBindingBlocked('RTK_RETURN_INTAKE_LOCAL_FULL_MANUSCRIPT_CURRENT_BINDING_REQUIRED');
  }
  const seenSceneIds = new Set();
  const sceneReadback = [];
  for (const scene of exportMapScenes) {
    const sceneId = typeof scene?.sceneId === 'string' ? scene.sceneId.trim() : '';
    const expectedRawSha256 = typeof scene?.rawSha256 === 'string' ? scene.rawSha256.trim() : '';
    const configuredPath = typeof scenePathBySceneId[sceneId] === 'string'
      ? scenePathBySceneId[sceneId].trim()
      : '';
    if (!sceneId || seenSceneIds.has(sceneId) || !expectedRawSha256 || !configuredPath) {
      return fullManuscriptBindingBlocked('RTK_RETURN_INTAKE_LOCAL_FULL_MANUSCRIPT_CURRENT_BINDING_INVALID', {
        sceneId,
      });
    }
    seenSceneIds.add(sceneId);
    const scenePath = path.resolve(configuredPath);
    if (!isPathInsideBoundary(projectRoot, scenePath, { resolveSymlinks: true })) {
      return fullManuscriptBindingBlocked('RTK_RETURN_INTAKE_LOCAL_FULL_MANUSCRIPT_SCENE_PATH_BLOCKED', {
        sceneId,
      });
    }
    let rawContent;
    try {
      rawContent = readFileSync(scenePath, 'utf8');
    } catch (error) {
      return fullManuscriptBindingBlocked('RTK_RETURN_INTAKE_LOCAL_FULL_MANUSCRIPT_SCENE_READ_FAILED', {
        sceneId,
        errorCode: typeof error?.code === 'string' ? error.code : '',
      });
    }
    const actualRawSha256 = sha256Text(rawContent);
    if (actualRawSha256 !== expectedRawSha256) {
      return fullManuscriptBindingBlocked('RTK_RETURN_INTAKE_STALE_FULL_MANUSCRIPT_SCENE', {
        sceneId,
        expectedRawSha256,
        actualRawSha256,
      });
    }
    sceneReadback.push({ sceneId, actualRawSha256 });
  }
  return {
    ok: true,
    status: 'verified',
    sceneCount: sceneReadback.length,
    sceneReadback,
  };
}

module.exports = {
  createDocxActivationRequestDigestGuard,
  verifyFullManuscriptCurrentSceneBindings,
};
