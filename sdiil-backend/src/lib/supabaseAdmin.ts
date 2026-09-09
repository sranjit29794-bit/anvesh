import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key';

/**
 * Supabase Admin Client
 * 
 * Initialized with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 * 
 * SECURITY NOTICE:
 * This client completely bypasses Row Level Security (RLS).
 * It must NEVER be exposed to client-side bundles or returned to users.
 * 
 * USE ONLY FOR:
 * 1. Admin panel actions (creating users, locking accounts, resetting MFA).
 * 2. Database seeding scripts.
 * 3. Specific backend supervisory audit routines requiring cross-case access.
 * 
 * For all user-facing requests (document viewing, sharing, search), use
 * `createUserClient(jwt)` in `src/lib/supabaseUser.ts` to strictly enforce RLS and ABAC.
 */
export const supabaseAdmin: SupabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
