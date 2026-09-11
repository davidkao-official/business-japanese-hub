import { describe, expect, it } from 'vitest';
import { libraryViteConfig } from '../../scripts/lib/public-frontend-config';

describe('Vitest discovery contract', () => {
  it('runs Supabase Edge Function regression tests in the standard test suite', () => {
    const config = libraryViteConfig().test;
    expect(config.include).toContain("supabase/functions/**/*.test.ts");
  });
});
