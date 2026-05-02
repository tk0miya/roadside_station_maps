// Workaround for jsdom 29.x + Node.js v24+ incompatibility.
// Node.js v24+ provides an experimental `localStorage` global that lacks
// the full Storage API (no clear(), no key(), etc.). jsdom 29.x re-uses
// this broken implementation instead of providing its own. We replace it
// with a spec-compliant in-memory implementation in jsdom environments.
if (typeof window !== "undefined") {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    value: {
      get length() {
        return store.size;
      },
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
      key: (index: number) => [...store.keys()][index] ?? null,
    },
    writable: true,
    configurable: true,
  });
}
