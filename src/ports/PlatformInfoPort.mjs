export const PLATFORM_INFO_PORT_METHODS = Object.freeze(['getPlatformId']);

function isObjectLike(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isPlatformInfoPort(value) {
  if (!isObjectLike(value)) return false;
  return PLATFORM_INFO_PORT_METHODS.every((methodName) => typeof value[methodName] === 'function');
}

