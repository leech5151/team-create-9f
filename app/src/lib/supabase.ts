import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * Single shared client, or null when the build has no Supabase configuration.
 *
 * Null is a supported state, not an error: the app still runs entirely on
 * localStorage, it just cannot sync. Callers must handle it rather than assume
 * a connection exists.
 */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          // The admin stays signed in across launches; readers never sign in.
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;

export const isConfigured = supabase !== null;
