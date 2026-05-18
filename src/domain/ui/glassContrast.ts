/**
 * Glass contrast utilities for Yuzztea POS SaaS.
 *
 * Implements WCAG 2.1 contrast ratio calculation and surface selection
 * to ensure text readability on glassmorphism surfaces.
 *
 * When the contrast ratio between foreground text and background surface
 * falls below WCAG AA thresholds, the system falls back to a solid surface
 * instead of glass (semi-transparent with blur).
 *
 * Thresholds (WCAG 2.1 AA):
 * - Normal text (< 18px): contrast ratio >= 4.5:1
 * - Large text (>= 18px or >= 14px bold): contrast ratio >= 3:1
 *
 * Pure functions — no side effects.
 *
 * @module domain/ui/glassContrast
 * @see Requirements 13.2, 13.3, 13.7, 12.6
 */

/** RGB color tuple with values in the range [0, 255]. */
export type RGB = [r: number, g: number, b: number];

/** Surface type returned by chooseSurface. */
export type SurfaceType = 'glass' | 'solid';

/**
 * Minimum contrast ratio for normal text (< 18px) per WCAG 2.1 AA.
 */
export const CONTRAST_THRESHOLD_NORMAL = 4.5;

/**
 * Minimum contrast ratio for large text (>= 18px) per WCAG 2.1 AA.
 */
export const CONTRAST_THRESHOLD_LARGE = 3;

/**
 * Font size threshold in pixels for "large text" classification.
 * Text at 18px or above is considered large text.
 */
export const LARGE_TEXT_SIZE_PX = 18;

/**
 * Converts a single sRGB channel value (0-255) to linear RGB.
 *
 * The sRGB transfer function applies gamma correction:
 * - For values <= 0.04045: linear = sRGB / 12.92
 * - For values > 0.04045: linear = ((sRGB + 0.055) / 1.055) ^ 2.4
 *
 * @param channel - sRGB channel value in [0, 255]
 * @returns Linear RGB value in [0, 1]
 */
export function linearize(channel: number): number {
  const srgb = channel / 255;
  if (srgb <= 0.04045) {
    return srgb / 12.92;
  }
  return Math.pow((srgb + 0.055) / 1.055, 2.4);
}

/**
 * Computes the relative luminance of an sRGB color per WCAG 2.1.
 *
 * Formula: L = 0.2126 * R + 0.7152 * G + 0.0722 * B
 * where R, G, B are linearized sRGB values.
 *
 * @param r - Red channel [0, 255]
 * @param g - Green channel [0, 255]
 * @param b - Blue channel [0, 255]
 * @returns Relative luminance in [0, 1]
 */
export function relativeLuminance(r: number, g: number, b: number): number {
  const rLin = linearize(r);
  const gLin = linearize(g);
  const bLin = linearize(b);
  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

/**
 * Computes the WCAG 2.1 contrast ratio between two colors.
 *
 * Formula: (L1 + 0.05) / (L2 + 0.05) where L1 >= L2.
 * The result is always >= 1 (identical colors yield 1:1).
 *
 * @param fg - Foreground color as [r, g, b] tuple (0-255)
 * @param bg - Background color as [r, g, b] tuple (0-255)
 * @returns Contrast ratio (>= 1.0)
 */
export function contrastRatio(fg: RGB, bg: RGB): number {
  const lFg = relativeLuminance(fg[0], fg[1], fg[2]);
  const lBg = relativeLuminance(bg[0], bg[1], bg[2]);

  const l1 = Math.max(lFg, lBg);
  const l2 = Math.min(lFg, lBg);

  return (l1 + 0.05) / (l2 + 0.05);
}

/**
 * Determines whether a glass or solid surface should be used based on
 * the contrast ratio between foreground text and background color.
 *
 * Returns 'glass' if the contrast meets WCAG 2.1 AA thresholds:
 * - >= 4.5:1 for normal text (fontSizePx < 18)
 * - >= 3:1 for large text (fontSizePx >= 18)
 *
 * Returns 'solid' if contrast is insufficient, triggering a fallback
 * to an opaque surface for readability (Req 13.7).
 *
 * @param fg - Foreground (text) color as [r, g, b] tuple (0-255)
 * @param bg - Background (surface) color as [r, g, b] tuple (0-255)
 * @param fontSizePx - Font size in pixels
 * @returns 'glass' if contrast is sufficient, 'solid' otherwise
 */
export function chooseSurface(fg: RGB, bg: RGB, fontSizePx: number): SurfaceType {
  const ratio = contrastRatio(fg, bg);
  const threshold =
    fontSizePx >= LARGE_TEXT_SIZE_PX ? CONTRAST_THRESHOLD_LARGE : CONTRAST_THRESHOLD_NORMAL;

  return ratio >= threshold ? 'glass' : 'solid';
}
