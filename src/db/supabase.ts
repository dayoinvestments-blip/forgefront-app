import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL          = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SUPABASE_ANON         = process.env.SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
}

// ─── Admin client (service_role) ──────────────────────────────────────────────
// Bypasses Row Level Security — use ONLY in server-side backend code.
// Never expose this key to the frontend.
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// ─── Anon client ──────────────────────────────────────────────────────────────
// Respects Row Level Security — safe for user-scoped operations.
export const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON);

// ─── User-scoped client helper ────────────────────────────────────────────────
// Creates a client that acts as the authenticated user (respects RLS).
export function supabaseAsUser(jwt: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export default supabaseAdmin;
