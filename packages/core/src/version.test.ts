import { describe, expect, it } from 'vitest';
import { version } from './version.js';

describe('version', () => {
  it('is a semver string', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
