import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.SUPABASE_URL as string | undefined;
const supabaseAnonKey =
  (import.meta.env.SUPABASE_ANON as string | undefined) ??
  (import.meta.env.ANON_API_KEY as string | undefined);

let initializationError: string | null = null;
let supabaseClient: ReturnType<typeof createClient> | null = null;

if (!supabaseUrl || !supabaseAnonKey) {
  initializationError =
    'Add the Supabase project URL and anon key to this Replit app’s Secrets.';
} else {
  try {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    });
  } catch {
    initializationError =
      'The Supabase URL or anon key is invalid. Check the app’s Secrets.';
  }
}

export const supabase = supabaseClient;
export const supabaseInitializationError = initializationError;
