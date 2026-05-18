import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for the Supabase client wrapper security and configuration.
 * We test the module's behavior by dynamically importing it with mocked env vars.
 */

describe('src/lib/supabase.ts', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('should throw when VITE_SUPABASE_URL is missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');

    await expect(() => import('../supabase')).rejects.toThrow('Missing VITE_SUPABASE_URL');
  });

  it('should throw when VITE_SUPABASE_ANON_KEY is missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

    await expect(() => import('../supabase')).rejects.toThrow('Missing VITE_SUPABASE_ANON_KEY');
  });

  it('should throw when service_role key is present in env', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
    vi.stubEnv('VITE_SUPABASE_SERVICE_ROLE_KEY', 'secret-service-role-key');

    await expect(() => import('../supabase')).rejects.toThrow('service_role key detected');
  });

  it('should create a Supabase client when env vars are valid', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-anon-key');

    const mod = await import('../supabase');
    expect(mod.supabase).toBeDefined();
  });
});
