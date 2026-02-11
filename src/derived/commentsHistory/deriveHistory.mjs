import { deriveView } from '../deriveView.mjs';

const VIEW_ID = 'derived.history.v1';

function normalizeParams(params) {
  const source = params && typeof params === 'object' && !Array.isArray(params) ? params : {};
  const projectId = typeof source.projectId === 'string' ? source.projectId.trim() : '';
  const filter = typeof source.filter === 'string' ? source.filter.trim() : '';
  return {
    projectId,
    filter,
  };
}

export function deriveHistory(input = {}) {
  const params = normalizeParams(input.params);
  return deriveView({
    viewId: VIEW_ID,
    coreState: input.coreState,
    params,
    capabilitySnapshot: input.capabilitySnapshot,
    derive: ({ params: normalizedParams, meta }) => ({
      schemaVersion: 'derived.history.v1',
      projectId: normalizedParams.projectId,
      filter: normalizedParams.filter,
      entries: [],
      meta: {
        invalidationKey: meta.invalidationKey,
      },
    }),
  });
}

export { VIEW_ID as HISTORY_VIEW_ID };
