import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

import path from 'path';

dotenv.config();
if (typeof __dirname !== 'undefined') {
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
}
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'sdiil-backend/.env') });

const supabaseUrl = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
// We use anon key or service role with user auth header depending on configuration;
// in Supabase JS, supplying an Authorization Bearer header sets the auth context for RLS.
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-anon-key';

/**
 * Supabase User Client Factory
 * 
 * Creates a scoped Supabase client initialized per-request using the caller's JWT token
 * forwarded from the frontend `Authorization: Bearer <token>` header.
 * 
 * SECURITY MANDATE:
 * Any operation performed on behalf of a logged-in user (document viewing, evidence upload,
 * pgvector similarity search, controlled sharing) MUST use this client.
 * 
 * When this client queries the database:
 * 1. Postgres sets `auth.uid()` to the authenticated user's ID from the JWT.
 * 2. All Row Level Security (RLS) policies (e.g., `assigned_case_access` on documents)
 *    and ABAC filters are strictly evaluated at the database level and CANNOT be bypassed.
 * 
 * @param {string} userJwt - The verified Bearer JWT of the authenticated officer.
 * @returns {SupabaseClient} Scoped Supabase client enforcing RLS and ABAC.
 */
export function createUserClient(userJwt: string): SupabaseClient {
  const token = userJwt.replace(/^Bearer\s+/i, '').trim();

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}
