import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Vitest discovery contract', () => {
  it('runs Supabase Edge Function regression tests in the standard test suite', () => {
    const config = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8');
    expect(config).toContain("supabase/functions/**/*.test.ts");
  });
});
