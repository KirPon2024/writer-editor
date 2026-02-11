export const FILE_SYSTEM_PORT_METHODS = Object.freeze(['read', 'write', 'exists']);

function isObjectLike(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isFileSystemPort(value) {
  if (!isObjectLike(value)) return false;
  return FILE_SYSTEM_PORT_METHODS.every((methodName) => typeof value[methodName] === 'function');
}

