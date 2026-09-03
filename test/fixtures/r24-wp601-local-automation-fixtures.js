'use strict';
const base = require('./r24-wp600-featurespec-query-ir-fixtures.js');
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const config = () => ({ sessionId: 'wp601-synthetic-session', limits: {
  maxQueueSize: 32, maxJobs: 64, maxEvents: 256, maxJobWorkUnits: 1048576, maxTotalWorkUnits: 8388608,
} });
async function fixture(override) {
  const f = await base.fixture();
  const api = override || await base.importRepo('src/core/local-automation-v1.mjs');
  const context = { snapshot: f.input.snapshot, projectionDigest: f.input.projection.projectionDigest,
    generation: f.input.generation, lifecycleId: 'lifecycle-1', enabled: true };
  const job = { jobKey: 'query-job-1', priority: 1, deadline: 100, workBudget: 1048576,
    lifecycleId: context.lifecycleId, queryInput: f.input };
  const session = api.createLocalAutomationSession(canonical(config()));
  const send = action => session.dispatch(canonical(action));
  send({ type: 'CONTEXT', at: 0, context });
  return { ...f, queryApi: f.api, api, context, job, session, send };
}
const enqueue = (f, job = f.job, at = 1) => f.send({ type: 'ENQUEUE', at, job }).jobId;
function rehashReplay(value) {
  const body = { ...value }; delete body.transcriptDigest;
  value.transcriptDigest = base.canonicalDigest(body);
  return value;
}
module.exports = { ...base, canonical, config, fixture, enqueue, rehashReplay };
