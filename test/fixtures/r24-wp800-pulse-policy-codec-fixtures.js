const validPulseAggregateInput = Object.freeze({
  sourceRevisionOrdinal: 42,
  generation: 7,
  aggregates: Object.freeze([
    Object.freeze({ metricId: 'WORDS_DELETED_COUNT', value: 17 }),
    Object.freeze({ metricId: 'ACTIVE_WRITING_SECONDS', value: 901 }),
    Object.freeze({ metricId: 'SCENES_EDITED_COUNT', value: 3 }),
    Object.freeze({ metricId: 'WORDS_ADDED_COUNT', value: 1442 }),
    Object.freeze({ metricId: 'SESSIONS_COMPLETED_COUNT', value: 2 }),
  ]),
});

const currentPulseBinding = Object.freeze({ sourceRevisionOrdinal: 42, generation: 7 });

function cloneFixture(value = validPulseAggregateInput) {
  return structuredClone(value);
}

module.exports = { cloneFixture, currentPulseBinding, validPulseAggregateInput };
