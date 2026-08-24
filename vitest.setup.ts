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

// jsdom implements no media queries, so it has no `matchMedia`. Components
// that adapt to a breakpoint or to `prefers-reduced-motion` call it during
// render; without this they throw before producing any DOM, which would make
// them untestable for a reason unrelated to their behaviour. Reporting "does
// not match" is the honest answer here: jsdom has no viewport to match, and a
// component's default layout is the one worth testing by default.
// Assigned on `window` rather than `globalThis`, and guarded on being a
// FUNCTION rather than merely present: jsdom defines the property and leaves
// it undefined, so an `in` check passes and the call still throws.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  (window as Window & { matchMedia?: unknown }).matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
