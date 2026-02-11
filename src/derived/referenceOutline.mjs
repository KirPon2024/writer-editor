import { createDerivedError, deriveView } from './deriveView.mjs';

const VIEW_ID = 'derived.referenceOutline.v1';

function normalizeProjectId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toSceneOutline(sceneId, scene, index) {
  const text = typeof scene?.text === 'string' ? scene.text : '';
  const firstLine = text.split(/\r?\n/u)[0] || '';
  const heading = firstLine.replace(/^#+\s*/u, '').trim() || `Scene ${index + 1}`;
  return {
    sceneId,
    order: index,
    heading,
    textLength: text.length,
  };
}

function buildReferenceOutline(coreState, projectId) {
  const projects = coreState?.data?.projects;
  const project = projects && typeof projects === 'object' ? projects[projectId] : null;
  if (!project || typeof project !== 'object') {
    throw createDerivedError(
      'E_DERIVED_PROJECT_NOT_FOUND',
      'derived.referenceOutline',
      'PROJECT_NOT_FOUND',
      { projectId },
    );
  }

  const scenesObj = project.scenes && typeof project.scenes === 'object' ? project.scenes : {};
  const orderedSceneIds = Object.keys(scenesObj).sort();
  return {
    schemaVersion: 'derived.referenceOutline.v1',
    projectId,
    title: typeof project.title === 'string' ? project.title : '',
    sceneCount: orderedSceneIds.length,
    items: orderedSceneIds.map((sceneId, index) => toSceneOutline(sceneId, scenesObj[sceneId], index)),
  };
}

export function deriveReferenceOutline(input = {}) {
  const projectId = normalizeProjectId(input?.params?.projectId);
  if (!projectId) {
    return {
      ok: false,
      error: {
        code: 'E_DERIVED_PROJECT_ID_REQUIRED',
        op: 'derived.referenceOutline',
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
    derive: ({ coreState, params }) => buildReferenceOutline(coreState, params.projectId),
  });
}

export { VIEW_ID as REFERENCE_OUTLINE_VIEW_ID };
