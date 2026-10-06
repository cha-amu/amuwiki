import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createRoot, render } = vi.hoisted(() => ({
  createRoot: vi.fn(),
  render: vi.fn(),
}));
vi.mock('react-dom/client', () => ({ createRoot }));
vi.mock('../src/config', () => ({
  config: {
    wikiUrl: 'http://127.0.0.1:5178/wiki/',
    blogUrl: 'http://127.0.0.1:5178/',
    indexUrl: 'http://127.0.0.1:4186/amuwiki/wiki.json',
  },
}));

beforeEach(() => {
  vi.resetModules();
  createRoot.mockReturnValue({ render });
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('entry point routing without a DOM or browser', () => {
  it('replaces visitor history before mounting or requesting public data', async () => {
    const replace = vi.fn();
    vi.stubGlobal('window', {
      location: {
        href: 'http://127.0.0.1:4186/amuwiki/?tag=one#two',
        replace,
      },
    });
    await import('../src/main');
    expect(replace).toHaveBeenCalledExactlyOnceWith(
      'http://127.0.0.1:5178/wiki/?tag=one#two',
    );
    expect(createRoot).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('bounds and mounts only a graph embed without redirecting', async () => {
    const replace = vi.fn();
    const dataset: Record<string, string> = {};
    const root = {};
    vi.stubGlobal('window', {
      location: {
        href: 'http://127.0.0.1:4186/amuwiki/?embed=graph&scope=all',
        replace,
      },
    });
    vi.stubGlobal('document', {
      documentElement: { dataset },
      getElementById: vi.fn(() => root),
    });
    await import('../src/main');
    expect(replace).not.toHaveBeenCalled();
    expect(dataset.embed).toBe('graph');
    expect(createRoot).toHaveBeenCalledExactlyOnceWith(root);
    expect(render).toHaveBeenCalledOnce();
  });
});
