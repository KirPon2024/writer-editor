'use strict';

const PROJECT_ID_MAX_CODE_UNITS = 128;
const PROJECT_ID_FORBIDDEN_PATTERN = /[\\/\u0000-\u001F]/u;

function isWellFormedUnicode(value) {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xD800 && codeUnit <= 0xDBFF) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xDC00 && next <= 0xDFFF)) return false;
      index += 1;
    } else if (codeUnit >= 0xDC00 && codeUnit <= 0xDFFF) {
      return false;
    }
  }
  return true;
}

function normalizeProjectId(value) {
  if (typeof value !== 'string') return '';
  const projectId = value.trim();
  if (
    !projectId
    || projectId.length > PROJECT_ID_MAX_CODE_UNITS
    || PROJECT_ID_FORBIDDEN_PATTERN.test(projectId)
    || !isWellFormedUnicode(projectId)
  ) return '';
  return projectId;
}

module.exports = Object.freeze({
  PROJECT_ID_MAX_CODE_UNITS,
  normalizeProjectId,
});
