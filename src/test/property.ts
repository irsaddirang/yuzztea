import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';

/**
 * Deterministic seed for all property-based tests.
 * Ensures reproducibility across runs.
 */
const SEED = 0xc0ffee;

/**
 * Default number of runs for normal property tests.
 * Critical properties should use 500 runs via the `runs` parameter.
 */
const DEFAULT_RUNS = 100;

/**
 * Helper to run a fast-check property test with deterministic seed.
 *
 * @param name - Test description
 * @param prop - fast-check property (created via fc.property or fc.asyncProperty)
 * @param runs - Number of runs (default 100, use 500 for critical properties)
 */
export function runProperty(
  name: string,
  prop: fc.IPropertyWithHooks<unknown[]>,
  runs: number = DEFAULT_RUNS,
): void {
  it(name, () => {
    fc.assert(prop, {
      seed: SEED,
      numRuns: runs,
    });
  });
}

/**
 * Helper to create a describe block for a group of property tests.
 * Re-exported for convenience.
 */
export { fc, describe, it, expect };
