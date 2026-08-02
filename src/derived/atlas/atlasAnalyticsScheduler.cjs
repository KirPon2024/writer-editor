'use strict';

const ATLAS_ANALYTICS_SCHEDULER_SCHEMA_VERSION = 'yalken.atlas.analyticsScheduler.v1';

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function schedulerError(code, reason, details = {}) {
  return {
    code,
    op: 'atlas.analyticsScheduler',
    reason,
    details: cloneJson(details),
  };
}

function sortedUniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => normalizeString(value))
    .filter(Boolean))].sort();
}

function createAtlasAnalyticsScheduler(options = {}) {
  const maxRetainedResults = Number.isSafeInteger(options.maxRetainedResults)
    ? Math.max(1, Math.min(256, options.maxRetainedResults))
    : 32;
  const activeByLane = new Map();
  const retainedByKey = new Map();
  const dependencyGenerations = new Map();
  const sourceRecords = new Map();
  let sequence = 0;
  const counters = {
    scheduled: 0,
    coalesced: 0,
    retainedHits: 0,
    cancelled: 0,
    staleDiscarded: 0,
    completed: 0,
    invalidations: 0,
  };

  function projectGenerations(projectId) {
    let generations = dependencyGenerations.get(projectId);
    if (!generations) {
      generations = new Map();
      dependencyGenerations.set(projectId, generations);
    }
    return generations;
  }

  function generationSignature(projectId, dependencyKeys) {
    const generations = projectGenerations(projectId);
    return dependencyKeys.map((key) => `${key}:${generations.get(key) || 0}`).join('|');
  }

  function removeRetainedForDependencies(projectId, dependencyKeys) {
    const changed = new Set(dependencyKeys);
    for (const [key, retained] of retainedByKey.entries()) {
      if (retained.projectId !== projectId) continue;
      if (retained.dependencyKeys.some((dependencyKey) => changed.has(dependencyKey))) {
        retainedByKey.delete(key);
      }
    }
  }

  function invalidate(input = {}) {
    const projectId = normalizeString(input.projectId);
    const dependencyKeys = sortedUniqueStrings(input.dependencyKeys);
    if (!projectId || dependencyKeys.length === 0) {
      return { ok: false, error: schedulerError('E_ATLAS_SCHEDULER_INVALIDATION_INVALID', 'PROJECT_AND_DEPENDENCIES_REQUIRED') };
    }
    const generations = projectGenerations(projectId);
    for (const key of dependencyKeys) generations.set(key, (generations.get(key) || 0) + 1);
    const changed = new Set(dependencyKeys);
    for (const job of activeByLane.values()) {
      if (job.projectId !== projectId) continue;
      if (job.dependencyKeys.some((dependencyKey) => changed.has(dependencyKey))) {
        job.cancelReason = normalizeString(input.reason) || 'DEPENDENCY_INVALIDATED';
        job.controller.abort(job.cancelReason);
        counters.cancelled += 1;
      }
    }
    removeRetainedForDependencies(projectId, dependencyKeys);
    counters.invalidations += 1;
    return { ok: true, dependencyKeys, sourceRevision: normalizeString(input.sourceRevision) };
  }

  function synchronizeSource(input = {}) {
    const projectId = normalizeString(input.projectId);
    const sourceRevision = normalizeString(input.sourceRevision);
    const nextDependencies = input.dependencyRevisions && typeof input.dependencyRevisions === 'object'
      ? Object.fromEntries(Object.entries(input.dependencyRevisions)
        .map(([key, value]) => [normalizeString(key), normalizeString(value)])
        .filter(([key, value]) => key && value))
      : {};
    if (!projectId || !sourceRevision || Object.keys(nextDependencies).length === 0) {
      return { ok: false, error: schedulerError('E_ATLAS_SCHEDULER_SOURCE_INVALID', 'SOURCE_BINDINGS_REQUIRED') };
    }
    const previous = sourceRecords.get(projectId);
    const changedDependencyKeys = previous
      ? Object.keys({ ...previous.dependencyRevisions, ...nextDependencies })
        .filter((key) => previous.dependencyRevisions[key] !== nextDependencies[key])
      : [];
    if (changedDependencyKeys.length > 0) {
      invalidate({
        projectId,
        dependencyKeys: changedDependencyKeys,
        sourceRevision,
        reason: 'SOURCE_DEPENDENCY_CHANGED',
      });
    }
    sourceRecords.set(projectId, { sourceRevision, dependencyRevisions: nextDependencies });
    return { ok: true, sourceRevision, changedDependencyKeys: changedDependencyKeys.sort() };
  }

  function retainedResult(retained, mode) {
    return {
      ok: true,
      value: cloneJson(retained.value),
      scheduler: {
        schemaVersion: ATLAS_ANALYTICS_SCHEDULER_SCHEMA_VERSION,
        jobId: retained.jobId,
        mode,
        sourceRevision: retained.sourceRevision,
        dependencyKeys: [...retained.dependencyKeys],
        retained: mode === 'retained',
        coalesced: mode === 'coalesced',
        staleResultDiscarded: false,
      },
    };
  }

  function evictRetainedOverflow() {
    while (retainedByKey.size > maxRetainedResults) {
      const oldestKey = retainedByKey.keys().next().value;
      retainedByKey.delete(oldestKey);
    }
  }

  function schedule(input = {}) {
    const projectId = normalizeString(input.projectId);
    const queryId = normalizeString(input.queryId);
    const requestKey = normalizeString(input.requestKey);
    const sourceRevision = normalizeString(input.sourceRevision);
    const dependencyKeys = sortedUniqueStrings(input.dependencyKeys);
    const run = typeof input.run === 'function' ? input.run : null;
    const getCurrentRevision = typeof input.getCurrentRevision === 'function'
      ? input.getCurrentRevision
      : null;
    if (!projectId || !queryId || !requestKey || !sourceRevision || dependencyKeys.length === 0 || !run || !getCurrentRevision) {
      return Promise.resolve({
        ok: false,
        error: schedulerError('E_ATLAS_SCHEDULER_JOB_INVALID', 'JOB_BINDINGS_REQUIRED'),
      });
    }
    const laneKey = `${projectId}\u0000${queryId}`;
    const cacheKey = `${laneKey}\u0000${requestKey}`;
    const dependencySignature = generationSignature(projectId, dependencyKeys);
    const retained = retainedByKey.get(cacheKey);
    if (
      retained
      && retained.sourceRevision === sourceRevision
      && retained.dependencySignature === dependencySignature
    ) {
      retainedByKey.delete(cacheKey);
      retainedByKey.set(cacheKey, retained);
      counters.retainedHits += 1;
      return Promise.resolve(retainedResult(retained, 'retained'));
    }
    const active = activeByLane.get(laneKey);
    if (
      active
      && active.cacheKey === cacheKey
      && active.sourceRevision === sourceRevision
      && active.dependencySignature === dependencySignature
    ) {
      counters.coalesced += 1;
      return active.promise.then((result) => (
        result.ok
          ? { ...result, scheduler: { ...result.scheduler, mode: 'coalesced', coalesced: true } }
          : result
      ));
    }
    if (active) {
      active.cancelReason = 'SUPERSEDED_BY_NEWER_QUERY';
      active.controller.abort(active.cancelReason);
      counters.cancelled += 1;
    }

    const controller = new AbortController();
    const jobId = `atlas-analytics-job-${++sequence}`;
    const job = {
      jobId,
      projectId,
      queryId,
      requestKey,
      sourceRevision,
      dependencyKeys,
      dependencySignature,
      cacheKey,
      laneKey,
      controller,
      cancelReason: '',
      promise: null,
    };
    counters.scheduled += 1;
    job.promise = Promise.resolve().then(async () => {
      if (controller.signal.aborted) {
        return { ok: false, error: schedulerError('E_ATLAS_ANALYTICS_JOB_CANCELLED', job.cancelReason || 'JOB_CANCELLED', { jobId }) };
      }
      let value;
      try {
        value = await run({ signal: controller.signal, jobId, sourceRevision });
      } catch (error) {
        if (controller.signal.aborted) {
          return { ok: false, error: schedulerError('E_ATLAS_ANALYTICS_JOB_CANCELLED', job.cancelReason || 'JOB_CANCELLED', { jobId }) };
        }
        throw error;
      }
      if (controller.signal.aborted || activeByLane.get(laneKey) !== job) {
        return { ok: false, error: schedulerError('E_ATLAS_ANALYTICS_JOB_CANCELLED', job.cancelReason || 'JOB_SUPERSEDED', { jobId }) };
      }
      const liveRevision = normalizeString(await getCurrentRevision());
      const liveDependencySignature = generationSignature(projectId, dependencyKeys);
      if (liveRevision !== sourceRevision || liveDependencySignature !== dependencySignature) {
        counters.staleDiscarded += 1;
        return {
          ok: false,
          error: schedulerError('E_ATLAS_ANALYTICS_STALE_RESULT_DISCARDED', 'SOURCE_REVISION_CHANGED', {
            jobId,
            sourceRevision,
            liveRevision,
          }),
        };
      }
      const retainedValue = {
        jobId,
        projectId,
        queryId,
        requestKey,
        sourceRevision,
        dependencyKeys,
        dependencySignature,
        value: cloneJson(value),
      };
      retainedByKey.delete(cacheKey);
      retainedByKey.set(cacheKey, retainedValue);
      evictRetainedOverflow();
      counters.completed += 1;
      return retainedResult(retainedValue, 'completed');
    }).finally(() => {
      if (activeByLane.get(laneKey) === job) activeByLane.delete(laneKey);
    });
    activeByLane.set(laneKey, job);
    return job.promise;
  }

  function inspect() {
    return {
      schemaVersion: ATLAS_ANALYTICS_SCHEDULER_SCHEMA_VERSION,
      activeJobs: [...activeByLane.values()].map((job) => ({
        jobId: job.jobId,
        projectId: job.projectId,
        queryId: job.queryId,
        sourceRevision: job.sourceRevision,
        dependencyKeys: [...job.dependencyKeys],
      })),
      retainedJobs: [...retainedByKey.values()].map((job) => ({
        jobId: job.jobId,
        projectId: job.projectId,
        queryId: job.queryId,
        sourceRevision: job.sourceRevision,
        dependencyKeys: [...job.dependencyKeys],
      })),
      counters: { ...counters },
      maxRetainedResults,
    };
  }

  return Object.freeze({
    schemaVersion: ATLAS_ANALYTICS_SCHEDULER_SCHEMA_VERSION,
    schedule,
    invalidate,
    synchronizeSource,
    inspect,
  });
}

module.exports = Object.freeze({
  ATLAS_ANALYTICS_SCHEDULER_SCHEMA_VERSION,
  createAtlasAnalyticsScheduler,
});
