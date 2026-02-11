function normalizeKey(value) {
  const key = typeof value === 'string' ? value.trim() : '';
  return key;
}

export function createDerivedCache() {
  const store = new Map();
  return {
    has(key) {
      const normalized = normalizeKey(key);
      return normalized ? store.has(normalized) : false;
    },
    get(key) {
      const normalized = normalizeKey(key);
      return normalized ? store.get(normalized) : undefined;
    },
    set(key, value) {
      const normalized = normalizeKey(key);
      if (!normalized) return false;
      store.set(normalized, value);
      return true;
    },
    delete(key) {
      const normalized = normalizeKey(key);
      if (!normalized) return false;
      return store.delete(normalized);
    },
    clear() {
      store.clear();
    },
    size() {
      return store.size;
    },
  };
}
