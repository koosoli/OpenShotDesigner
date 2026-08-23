import 'fake-indexeddb/auto';

// jsdom implements no layout, so it has no `scrollIntoView`. Components that
// reveal a row after adding it call it unconditionally — correctly, since every
// real browser has it — and would otherwise throw inside a test for a reason
// that has nothing to do with the behaviour under test.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom has no layout engine and therefore no ResizeObserver. Panels that size
// themselves to their container construct one on mount; without this they throw
// before rendering anything, which would make a whole panel untestable for a
// reason unrelated to its behaviour. A no-op is honest here: nothing in jsdom
// ever resizes, so no callback would ever legitimately fire.
if (!('ResizeObserver' in globalThis)) {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
