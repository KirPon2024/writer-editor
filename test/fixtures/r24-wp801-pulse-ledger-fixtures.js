'use strict';

const aggregateInputs = Object.freeze([
  Object.freeze({ sourceRevisionOrdinal: 12, generation: 3, aggregates: Object.freeze([
    Object.freeze({ metricId: 'ACTIVE_WRITING_SECONDS', value: 180 }),
    Object.freeze({ metricId: 'WORDS_ADDED_COUNT', value: 240 }),
  ]) }),
  Object.freeze({ sourceRevisionOrdinal: 13, generation: 4, aggregates: Object.freeze([
    Object.freeze({ metricId: 'SCENES_EDITED_COUNT', value: 2 }),
    Object.freeze({ metricId: 'SESSIONS_COMPLETED_COUNT', value: 1 }),
    Object.freeze({ metricId: 'WORDS_DELETED_COUNT', value: 8 }),
  ]) }),
]);

module.exports = Object.freeze({ aggregateInputs });
