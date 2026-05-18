import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Security assertion: service_role key must NEVER be present in the client bundle.
 * This check runs at module load time to catch accidental leaks early.
 * Requirement 15.1: Only anon key is allowed in the client bundle.
 */
function assertNoServiceRoleKey(): void {
  const env = import.meta.env;
  const dangerousKeys = Object.keys(env).filter(
    (key) =>
      key.toLowerCase().includes('service_role') || key.toLowerCase().includes('servicerole'),
  );
  if (dangerousKeys.length > 0) {
    throw new Error(
      `[Yuzztea Security] service_role key detected in import.meta.env (${dangerousKeys.join(', ')}). ` +
        'This key must NEVER be exposed in the client bundle. Remove it from your .env file immediately.',
    );
  }
}

/**
 * Validates that required Supabase environment variables are present and non-empty.
 */
function getSupabaseConfig(): { url: string; anonKey: string } {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || url.trim() === '') {
    throw new Error(
      '[Yuzztea] Missing VITE_SUPABASE_URL. ' +
        'Copy .env.example to .env and fill in your Supabase project URL.',
    );
  }

  if (!anonKey || anonKey.trim() === '') {
    throw new Error(
      '[Yuzztea] Missing VITE_SUPABASE_ANON_KEY. ' +
        'Copy .env.example to .env and fill in your Supabase anon key.',
    );
  }

  return { url: url.trim(), anonKey: anonKey.trim() };
}

// Run security assertion at module load time
assertNoServiceRoleKey();

// Create singleton Supabase client with anon key only
const { url, anonKey } = getSupabaseConfig();

export const supabase: SupabaseClient = createSupabaseClient(url, anonKey);
