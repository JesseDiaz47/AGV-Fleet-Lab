import '@testing-library/jest-dom/vitest'

beforeEach(() => {
  window.localStorage.clear()
})

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// jsdom has no layout engine, so ResizeObserver doesn't exist; components
// (e.g. SimView's canvas redraw-on-resize) only need the constructor to be
// callable in tests, not to actually fire.
Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: StubResizeObserver,
})

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})
