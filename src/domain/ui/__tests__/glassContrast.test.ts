import { describe, it, expect } from 'vitest';

import {
  linearize,
  relativeLuminance,
  contrastRatio,
  chooseSurface,
  type RGB,
} from '../glassContrast';

describe('glassContrast', () => {
  describe('linearize', () => {
    it('returns 0 for channel value 0', () => {
      expect(linearize(0)).toBe(0);
    });

    it('returns 1 for channel value 255', () => {
      expect(linearize(255)).toBeCloseTo(1, 5);
    });

    it('uses linear formula for low values (sRGB <= 0.04045)', () => {
      // channel 10 → sRGB = 10/255 ≈ 0.0392 < 0.04045
      const result = linearize(10);
      expect(result).toBeCloseTo(10 / 255 / 12.92, 6);
    });

    it('uses gamma formula for higher values', () => {
      // channel 128 → sRGB = 128/255 ≈ 0.502 > 0.04045
      const srgb = 128 / 255;
      const expected = Math.pow((srgb + 0.055) / 1.055, 2.4);
      expect(linearize(128)).toBeCloseTo(expected, 6);
    });
  });

  describe('relativeLuminance', () => {
    it('returns 0 for black (0, 0, 0)', () => {
      expect(relativeLuminance(0, 0, 0)).toBe(0);
    });

    it('returns 1 for white (255, 255, 255)', () => {
      expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 4);
    });

    it('returns correct luminance for pure red', () => {
      // Pure red: L = 0.2126 * linearize(255) + 0.7152 * 0 + 0.0722 * 0
      expect(relativeLuminance(255, 0, 0)).toBeCloseTo(0.2126, 4);
    });

    it('returns correct luminance for pure green', () => {
      expect(relativeLuminance(0, 255, 0)).toBeCloseTo(0.7152, 4);
    });

    it('returns correct luminance for pure blue', () => {
      expect(relativeLuminance(0, 0, 255)).toBeCloseTo(0.0722, 4);
    });
  });

  describe('contrastRatio', () => {
    it('returns 21:1 for black on white', () => {
      const black: RGB = [0, 0, 0];
      const white: RGB = [255, 255, 255];
      expect(contrastRatio(black, white)).toBeCloseTo(21, 0);
    });

    it('returns 1:1 for same colors', () => {
      const color: RGB = [128, 128, 128];
      expect(contrastRatio(color, color)).toBeCloseTo(1, 5);
    });

    it('is symmetric (fg/bg order does not matter)', () => {
      const fg: RGB = [50, 100, 200];
      const bg: RGB = [200, 200, 200];
      expect(contrastRatio(fg, bg)).toBeCloseTo(contrastRatio(bg, fg), 5);
    });

    it('returns >= 1 always', () => {
      const a: RGB = [100, 100, 100];
      const b: RGB = [200, 200, 200];
      expect(contrastRatio(a, b)).toBeGreaterThanOrEqual(1);
    });

    // Known WCAG example: #767676 on white = ~4.54:1
    it('computes known WCAG example (#767676 on white ≈ 4.54:1)', () => {
      const gray: RGB = [0x76, 0x76, 0x76]; // #767676
      const white: RGB = [255, 255, 255];
      const ratio = contrastRatio(gray, white);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(ratio).toBeLessThan(4.6);
    });
  });

  describe('chooseSurface', () => {
    const black: RGB = [0, 0, 0];
    const white: RGB = [255, 255, 255];

    it('returns "glass" for high contrast (black on white, normal text)', () => {
      expect(chooseSurface(black, white, 14)).toBe('glass');
    });

    it('returns "glass" for high contrast (black on white, large text)', () => {
      expect(chooseSurface(black, white, 18)).toBe('glass');
    });

    it('returns "solid" for insufficient contrast (similar colors, normal text)', () => {
      const lightGray: RGB = [200, 200, 200];
      const slightlyLighter: RGB = [220, 220, 220];
      expect(chooseSurface(lightGray, slightlyLighter, 14)).toBe('solid');
    });

    it('uses 4.5:1 threshold for text < 18px', () => {
      // #767676 on white ≈ 4.54:1 → passes 4.5 threshold
      const gray: RGB = [0x76, 0x76, 0x76];
      expect(chooseSurface(gray, white, 16)).toBe('glass');

      // #777777 on white ≈ 4.48:1 → fails 4.5 threshold
      const lighterGray: RGB = [0x77, 0x77, 0x77];
      expect(chooseSurface(lighterGray, white, 16)).toBe('solid');
    });

    it('uses 3:1 threshold for text >= 18px', () => {
      // #949494 on white ≈ 3.03:1 → passes 3.0 threshold for large text
      const gray: RGB = [0x94, 0x94, 0x94];
      const ratio = contrastRatio(gray, white);
      expect(ratio).toBeGreaterThanOrEqual(3);
      expect(chooseSurface(gray, white, 18)).toBe('glass');

      // Same color at small text size would fail 4.5 threshold
      expect(chooseSurface(gray, white, 16)).toBe('solid');
    });

    it('treats exactly 18px as large text', () => {
      // A color that passes 3:1 but not 4.5:1
      const gray: RGB = [0x94, 0x94, 0x94];
      expect(chooseSurface(gray, white, 18)).toBe('glass');
      expect(chooseSurface(gray, white, 17.9)).toBe('solid');
    });
  });
});
