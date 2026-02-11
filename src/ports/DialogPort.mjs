export const DIALOG_PORT_METHODS = Object.freeze(['openFile', 'saveFile']);

function isObjectLike(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isDialogPort(value) {
  if (!isObjectLike(value)) return false;
  return DIALOG_PORT_METHODS.every((methodName) => typeof value[methodName] === 'function');
}

