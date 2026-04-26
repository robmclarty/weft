import { describe, expect, it } from 'vitest';
import { version } from './index.js';

describe('weft umbrella', () => {
  it('re-exports a semver version from @repo/core', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
