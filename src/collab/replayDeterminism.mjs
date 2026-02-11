import { hashCanonicalValue } from '../derived/deriveView.mjs';
import { mergeRemoteEvent } from './mergePolicy.mjs';

function normalizeEvents(events) {
  if (!Array.isArray(events)) return [];
  return events.map((event) => (event && typeof event === 'object' ? { ...event } : {}));
}

export function runCollabReplay(input = {}) {
  const events = normalizeEvents(input.events);
  let state = {
    version: Number.isInteger(input.initialState?.version) ? input.initialState.version : 0,
    content: typeof input.initialState?.content === 'string' ? input.initialState.content : '',
    lastOpId: typeof input.initialState?.lastOpId === 'string' ? input.initialState.lastOpId : '',
  };

  const envelopes = [];
  let appliedCount = 0;
  let rejectedCount = 0;
  let noopCount = 0;

  for (const event of events) {
    const merged = mergeRemoteEvent({ localState: state, remoteEvent: event });
    if (merged.verdict === 'applied') {
      appliedCount += 1;
      state = merged.state;
      continue;
    }
    if (merged.verdict === 'noop') {
      noopCount += 1;
      continue;
    }
    rejectedCount += 1;
    if (merged.envelope) envelopes.push(merged.envelope);
  }

  return {
    finalState: state,
    stateHash: hashCanonicalValue(state),
    envelopes,
    stats: {
      totalEvents: events.length,
      appliedCount,
      rejectedCount,
      noopCount,
    },
  };
}
