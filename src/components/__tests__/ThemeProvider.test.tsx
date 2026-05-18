import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider, useTheme } from '../ThemeProvider';

type MediaQueryHandler = (e: MediaQueryListEvent) => void;

function createMatchMediaMock(matches: boolean) {
  const listeners: MediaQueryHandler[] = [];
  return {
    matches,
    media: '',
    onchange: null as ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: (_event: string, handler: MediaQueryHandler) => {
      listeners.push(handler);
    },
    removeEventListener: (_event: string, handler: MediaQueryHandler) => {
      const idx = listeners.indexOf(handler);
      if (idx >= 0) listeners.splice(idx, 1);
    },
    dispatchEvent: vi.fn(),
    dispatchChange: (newMatches: boolean) => {
      listeners.forEach((fn) => fn({ matches: newMatches } as MediaQueryListEvent));
    },
  };
}

describe('ThemeProvider', () => {
  let colorSchemeMedia: ReturnType<typeof createMatchMediaMock>;
  let reducedMotionMedia: ReturnType<typeof createMatchMediaMock>;

  function setupMatchMedia() {
    window.matchMedia = vi.fn((query: string) => {
      if (query === '(prefers-color-scheme: dark)') {
        return colorSchemeMedia as unknown as MediaQueryList;
      }
      if (query === '(prefers-reduced-motion: reduce)') {
        return reducedMotionMedia as unknown as MediaQueryList;
      }
      return createMatchMediaMock(false) as unknown as MediaQueryList;
    });
  }

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');

    colorSchemeMedia = createMatchMediaMock(false);
    reducedMotionMedia = createMatchMediaMock(false);
    setupMatchMedia();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function wrapper({ children }: { children: React.ReactNode }) {
    return <ThemeProvider>{children}</ThemeProvider>;
  }

  it('defaults to system theme when localStorage is empty', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe('system');
  });

  it('reads stored theme from localStorage', () => {
    localStorage.setItem('yuzztea_theme', 'dark');
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe('dark');
  });

  it('ignores invalid localStorage values and defaults to system', () => {
    localStorage.setItem('yuzztea_theme', 'invalid-value');
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe('system');
  });

  it('persists theme preference to localStorage on setTheme', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setTheme('dark');
    });

    expect(localStorage.getItem('yuzztea_theme')).toBe('dark');
    expect(result.current.theme).toBe('dark');
  });

  it('applies dark class to documentElement when theme is dark', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setTheme('dark');
    });

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('removes dark class when theme is light', () => {
    document.documentElement.classList.add('dark');
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setTheme('light');
    });

    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('applies dark class when theme is system and system prefers dark', () => {
    colorSchemeMedia = createMatchMediaMock(true);
    setupMatchMedia();

    renderHook(() => useTheme(), { wrapper });
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('does not apply dark class when theme is system and system prefers light', () => {
    renderHook(() => useTheme(), { wrapper });
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('reacts to system color scheme changes when theme is system', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.theme).toBe('system');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    act(() => {
      colorSchemeMedia.matches = true;
      colorSchemeMedia.dispatchChange(true);
    });

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('does not react to system color scheme changes when theme is explicitly set', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setTheme('light');
    });

    act(() => {
      colorSchemeMedia.matches = true;
      colorSchemeMedia.dispatchChange(true);
    });

    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('exposes reducedMotion as false when system does not prefer reduced motion', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.reducedMotion).toBe(false);
  });

  it('exposes reducedMotion as true when system prefers reduced motion', () => {
    reducedMotionMedia = createMatchMediaMock(true);
    setupMatchMedia();

    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.reducedMotion).toBe(true);
  });

  it('reacts to prefers-reduced-motion changes', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.reducedMotion).toBe(false);

    act(() => {
      reducedMotionMedia.dispatchChange(true);
    });

    expect(result.current.reducedMotion).toBe(true);
  });

  it('throws error when useTheme is used outside ThemeProvider', () => {
    expect(() => {
      renderHook(() => useTheme());
    }).toThrow('useTheme must be used within a ThemeProvider');
  });

  it('uses localStorage key yuzztea_theme (not sessionStorage)', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setTheme('dark');
    });

    expect(localStorage.getItem('yuzztea_theme')).toBe('dark');
    expect(sessionStorage.getItem('yuzztea_theme')).toBeNull();
  });
});
